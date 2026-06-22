import { isRebuildAction } from '../ai/action-protocol.js';
import { applyTransformAction, tripletFromRoot, applyTripletToRoot } from './transform-ops.js';

// 执行 LLM 规划出的编辑动作，按类型分两条路：
//  - 变换类（移动/旋转/缩放）：就地改 root，瞬时、可逆（变换快照撤销）。
//  - 重建类（改形态，如相框）：交给 object-edit-pipeline 走“草稿→施工态→原子替换”。
// 一次提交里若同时含两类，统一走重建管线（草稿里把变换也一起应用），保证结果一致、只替换一次。

export const createActionExecutor = ({ worldState, sceneObjectRegistry, editHistory, objectEditPipeline }) => {
    const applyTransformsInPlace = (worldObjectId, actions) => {
        const record = sceneObjectRegistry.getByWorldObjectId(worldObjectId);
        const root = record?.root;
        if (!root) throw new Error('选中对象在场景中不存在');

        // 撤销快照（编辑前位姿）
        editHistory?.push?.(worldObjectId);

        let triplet = tripletFromRoot(root);
        actions.forEach((action) => { triplet = applyTransformAction(triplet, action); });
        applyTripletToRoot(root, triplet);

        // 回写 worldState
        const wo = worldState.getWorldObjectById?.(worldObjectId);
        if (wo && worldState.upsertWorldObject) {
            worldState.upsertWorldObject({
                ...wo,
                position: { ...triplet.position },
                rotation: { ...triplet.rotation },
                scale: { ...triplet.scale }
            });
        }
        return { applied: actions.length, worldObjectId, mode: 'in-place' };
    };

    // applyActions: 返回 Promise（重建路径是异步的）。
    const applyActions = async ({ worldObjectId, actions }) => {
        if (!worldObjectId) throw new Error('没有选中可编辑的对象');
        const applicable = (actions || []).filter((a) => a && a.type);
        if (applicable.length === 0) return { applied: 0 };

        const hasRebuild = applicable.some(isRebuildAction);
        if (hasRebuild) {
            if (!objectEditPipeline) throw new Error('重建管线未配置');
            const result = await objectEditPipeline.runRebuildEdit({ worldObjectId, actions: applicable });
            return { applied: applicable.length, worldObjectId, mode: 'rebuild', ...result };
        }
        return applyTransformsInPlace(worldObjectId, applicable);
    };

    return { applyActions };
};
