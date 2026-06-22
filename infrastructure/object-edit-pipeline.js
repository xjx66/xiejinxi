import { ACTION_TYPES } from '../ai/action-protocol.js';
import { applyTransformAction } from './transform-ops.js';

// “草稿 → 处理 → 原子替换”管线：用于改变对象形态的重建类编辑（如加/去相框）。
// 原对象在处理期间不被破坏，只挂施工态遮罩；处理结果先构建好再原子替换，并保留整对象快照供撤销。

const deepCloneRecord = (record) => JSON.parse(JSON.stringify(record));

// 相框开关对应的形态字段（镜像规则引擎在创建时的取值，保持数据一致）。
const FRAME_PRESETS = {
    frame: { collection: 'painting', templateId: 'template-painting-image' },
    plain: { collection: 'image', templateId: 'template-image-plane' }
};

const applyPresentation = (record, patch) => {
    const next = record;
    next.metadata = next.metadata || {};
    next.metadata.presentation = { ...(next.metadata.presentation || {}) };
    if (patch.frameStyle) {
        next.metadata.presentation.frameStyle = patch.frameStyle;
        const preset = FRAME_PRESETS[patch.frameStyle];
        if (preset) {
            next.metadata.collection = preset.collection;
            next.templateId = preset.templateId;
        }
    }
    return next;
};

// 把一组动作作用到 worldObject 数据草稿上（不碰活场景对象）。
export const applyActionsToRecord = (record, actions) => {
    let draft = deepCloneRecord(record);
    (actions || []).forEach((action) => {
        if (!action || !action.type) return;
        if (action.type === ACTION_TYPES.EDIT_PRESENTATION) {
            draft = applyPresentation(draft, action.payload?.patch || {});
        } else {
            // 变换类：作用在草稿的 position/rotation/scale 三元组上
            const t = applyTransformAction(
                { position: draft.position, rotation: draft.rotation, scale: draft.scale },
                action
            );
            draft.position = t.position;
            draft.rotation = t.rotation;
            draft.scale = t.scale;
        }
    });
    return draft;
};

export const createObjectEditPipeline = ({
    worldState,
    sceneObjectRegistry,
    replaceManagedSceneObject,
    reselect,
    constructionState,
    editHistory,
    onState
}) => {
    const getRoot = (worldObjectId) => sceneObjectRegistry.getByWorldObjectId(worldObjectId)?.root || null;

    // runRebuild: 通用重建管线。produceDraft(clonedRecord) => draftRecord（可 async）。
    // 原对象处理期间挂施工态、不被破坏；草稿构建好后原子替换并重新选中；整对象快照入撤销栈。
    const runRebuild = async ({ worldObjectId, produceDraft }) => {
        const original = worldState.getWorldObjectById?.(worldObjectId);
        if (!original) throw new Error('选中对象不存在');
        const originalRoot = getRoot(worldObjectId);

        editHistory?.pushRecord?.(original);

        const setState = (root, state) => {
            constructionState?.set?.(root, state);
            onState?.(state);
        };

        try {
            setState(originalRoot, 'planning');
            setState(originalRoot, 'building');
            const draft = await produceDraft(deepCloneRecord(original));
            if (!draft) throw new Error('草稿生成失败');
            setState(originalRoot, 'refining');

            worldState.upsertWorldObject(draft);
            const newRoot = replaceManagedSceneObject(worldObjectId, draft);

            setState(newRoot, 'ready');
            reselect?.(worldObjectId, newRoot);
            return { status: 'ready', worldObjectId };
        } catch (error) {
            const root = getRoot(worldObjectId) || originalRoot;
            setState(root, 'failed');
            setTimeout(() => constructionState?.set?.(getRoot(worldObjectId) || root, 'ready'), 1500);
            throw error;
        }
    };

    // runRebuildEdit: 动作驱动的重建（变换+形态），是 runRebuild 的一个特例。
    const runRebuildEdit = ({ worldObjectId, actions }) =>
        runRebuild({ worldObjectId, produceDraft: (record) => applyActionsToRecord(record, actions) });

    return { runRebuild, runRebuildEdit };
};
