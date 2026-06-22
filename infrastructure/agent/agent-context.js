import * as THREE from 'three';
import { processImageAsset, createImageAssetFromDraw } from '../../usecases/process-image-asset.js';
import { generateProceduralModel } from '../../usecases/generate-procedural-model.js';
import { createRigHelpers } from '../rig-animation.js';

// agent 的“受控 API”(ctx)：run_script 里模型现写的代码、以及预置工具，都只能通过这套接口操作世界。
// 所有写操作都接到已建好的执行底座（executor / 草稿替换管线 / 撤销 / 施工态）。

const genObjectId = () => `world-agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const createAgentContext = ({
    worldState,
    sceneObjectRegistry,
    selectionStore,
    actionExecutor,
    objectEditPipeline,
    createManagedWorldObject,
    reselect,
    getCameraPlacement, // () => {x,y,z}：当前相机前方的世界坐标快照（静止放置用）
    getTargetPoint, // () => {x,y,z}|null：用户当前锁定的坐标（点空白处得到）
    motionPlayer
}) => {
    const logs = [];

    const currentSelectedId = () => selectionStore.getState().selectedWorldObjectId || null;

    const summarizeObject = (worldObjectId) => {
        const wo = worldState.getWorldObjectById?.(worldObjectId);
        if (!wo) return null;
        const asset = wo.assetId ? worldState.getAssetById(wo.assetId) : null;
        const rec = sceneObjectRegistry.getByWorldObjectId(worldObjectId);
        return {
            id: wo.id,
            type: wo.type,
            name: wo.metadata?.name || asset?.name || wo.id,
            assetId: wo.assetId || null,
            assetKind: asset?.kind || null,
            position: wo.position,
            rotation: wo.rotation,
            scale: wo.scale,
            frameStyle: wo.metadata?.presentation?.frameStyle || null,
            // GLB 自带的骨骼动作名（绑骨模型才有；异步加载完成后才有值）
            animations: Array.isArray(rec?.clipNames) ? rec.clipNames : [],
            hasMotion: Boolean(wo.metadata?.motion?.waypoints?.length >= 2)
        };
    };

    const requireSelected = () => {
        const id = currentSelectedId();
        if (!id) throw new Error('当前没有选中对象');
        return id;
    };

    const ctx = {
        // —— 感知 ——
        getSelectedObject: () => {
            const id = currentSelectedId();
            return id ? summarizeObject(id) : null;
        },
        // 多选：返回所有被选中对象（Shift 多选）。批量操作（排列/对齐/同时变换）时用它。
        getSelectedObjects: () => {
            const sel = selectionStore.getState();
            const ids = Array.isArray(sel.selectedIds) && sel.selectedIds.length ? sel.selectedIds : (sel.selectedWorldObjectId ? [sel.selectedWorldObjectId] : []);
            return ids.map((id) => summarizeObject(id)).filter(Boolean);
        },
        listObjects: () => worldState.getWorldObjects().map((wo) => summarizeObject(wo.id)),
        getAsset: (assetId) => {
            const a = worldState.getAssetById(assetId);
            if (!a) return null;
            // 不把可能很大的 dataURL 原样吐给模型
            return { id: a.id, kind: a.kind, name: a.name, metadata: a.metadata || {} };
        },

        // —— 图像处理（Canvas）——
        // draw(canvas, ctx2d, img) 由调用方/模型提供；返回新资产 id。
        processImage: async (assetId, draw, opts = {}) => {
            const asset = await processImageAsset({ worldState, sourceAssetId: assetId, draw, name: opts.name });
            return asset.id;
        },
        // 从零程序化生成一张图；返回新资产 id。
        drawImage: async ({ width = 1024, height = 1024, name } = {}, draw) => {
            const asset = await createImageAssetFromDraw({ worldState, width, height, draw, name });
            return asset.id;
        },

        // 程序化生成 3D 模型：build(THREE, group) 往 group 里加 THREE 几何体网格；
        // 导出为 GLB 资产并返回 assetId，之后用 createObject({type:'model', assetId}) 放进场景。
        generate3DModel: async (build, opts = {}) => {
            const asset = await generateProceduralModel({ worldState, build, name: opts.name });
            return asset.id;
        },

        // —— 写场景（走重建管线，带施工态+撤销）——
        replaceAsset: async (objectId, newAssetId) => {
            const id = objectId || requireSelected();
            if (!worldState.getAssetById(newAssetId)) throw new Error('新资产不存在');
            await objectEditPipeline.runRebuild({
                worldObjectId: id,
                produceDraft: (record) => ({ ...record, assetId: newAssetId })
            });
            return summarizeObject(id);
        },
        setFrame: async (objectId, style = 'frame') => {
            const id = objectId || requireSelected();
            await objectEditPipeline.runRebuildEdit({
                worldObjectId: id,
                actions: [{ type: 'editPresentation', payload: { patch: { frameStyle: style } } }]
            });
            return summarizeObject(id);
        },
        // 变换：就地改（move/rotate/scale）。action 形如 {type,payload}
        transform: async (objectId, action) => {
            const id = objectId || requireSelected();
            await actionExecutor.applyActions({ worldObjectId: id, actions: [action] });
            return summarizeObject(id);
        },

        // 创建新对象（如把程序化生成的图放进场景）。
        // 不传 position 时，自动放在当前视野前方的【世界坐标快照】——放下后即固定，不随镜头移动。
        createObject: ({ assetId, type = 'image', position, templateId, metadata = {} }) => {
            const asset = worldState.getAssetById(assetId);
            if (!asset) throw new Error('资产不存在，无法创建对象');
            // 放置优先级：显式坐标 > 用户锁定的坐标(略抬高免得埋进地面) > 当前视野前方 > 兜底
            const target = getTargetPoint?.();
            const liftedTarget = target
                ? { x: target.x, y: target.y + (type === 'image' ? 10 : type === 'video' ? 8 : 0), z: target.z }
                : null;
            const placedPosition = position || liftedTarget || getCameraPlacement?.() || { x: 0, y: 10, z: -30 };

            // 图片：把像素宽高换算成【合理的世界尺寸】（最长边 ~16 单位），按宽高比缩放。
            // 否则 image-renderer 会把像素值(如 512)当世界单位，生成巨型平面，导致视差与地面对不上。
            const sizeMeta = {};
            if (type === 'image') {
                const TARGET = 16;
                const pw = asset.metadata?.width || 1;
                const ph = asset.metadata?.height || 1;
                const maxd = Math.max(pw, ph) || 1;
                sizeMeta.width = +(pw / maxd * TARGET).toFixed(2);
                sizeMeta.height = +(ph / maxd * TARGET).toFixed(2);
            }
            const record = {
                id: genObjectId(),
                worldId: worldState.getWorld().id,
                templateId: templateId || (type === 'image' ? 'template-image-plane'
                    : type === 'model' ? 'template-product-model'
                    : type === 'video' ? 'template-product-video'
                    : null),
                assetId,
                type,
                position: placedPosition,
                rotation: { x: 0, y: 0, z: 0 },
                scale: { x: 1, y: 1, z: 1 },
                status: 'ready',
                metadata: { name: metadata.name || asset.name, ...sizeMeta, ...metadata }
            };
            worldState.upsertWorldObject(record);
            const root = createManagedWorldObject(record);
            reselect?.(record.id, root);
            return summarizeObject(record.id);
        },

        // 给对象设定运动轨迹。spec = { waypoints:[{x,y,z},...]>=2, duration(秒), loop, orient }
        // 不传 waypoints 的第一个点时，默认以对象当前位置为起点。autoplay 默认 false（由用户点面板播放）。
        setMotion: (objectId, spec = {}) => {
            const id = objectId || requireSelected();
            const wo = worldState.getWorldObjectById?.(id);
            if (!wo) throw new Error('对象不存在');
            let waypoints = Array.isArray(spec.waypoints) ? spec.waypoints.filter((p) => p && typeof p.x === 'number') : [];
            if (waypoints.length >= 1) {
                // 若只给了相对/单点，至少补上当前位置作为起点
                if (waypoints.length === 1) waypoints = [{ ...wo.position }, waypoints[0]];
            }
            if (waypoints.length < 2) throw new Error('运动轨迹至少需要 2 个航点（waypoints）');
            const motion = {
                waypoints: waypoints.map((p) => ({ x: +p.x, y: +p.y, z: +p.z })),
                duration: spec.duration > 0 ? +spec.duration : 5,
                loop: spec.loop !== false,
                orient: spec.orient !== false
            };
            worldState.upsertWorldObject({ ...wo, metadata: { ...(wo.metadata || {}), motion } });
            if (spec.autoplay) motionPlayer?.play?.(id);
            return { id, waypointCount: motion.waypoints.length, duration: motion.duration, loop: motion.loop };
        },
        playMotion: (objectId) => { motionPlayer?.play?.(objectId || requireSelected()); return { playing: true }; },
        stopMotion: (objectId) => { motionPlayer?.stop?.(objectId || requireSelected()); return { playing: false }; },

        // —— 绑骨模型的自带骨骼动作 ——
        listAnimations: (objectId) => {
            const id = objectId || requireSelected();
            const rec = sceneObjectRegistry.getByWorldObjectId(id);
            return Array.isArray(rec?.clipNames) ? rec.clipNames : [];
        },
        playAnimation: (objectId, name, { loop = false } = {}) => {
            const id = objectId || requireSelected();
            const rec = sceneObjectRegistry.getByWorldObjectId(id);
            const clips = Array.isArray(rec?.clipNames) ? rec.clipNames : [];
            if (clips.length === 0) throw new Error('该对象没有自带骨骼动作（可能不是绑骨模型，或 GLB 还在加载）');
            if (!name) throw new Error(`需要指定动作名，可选：${clips.join(', ')}`);
            const ok = rec.playClip?.(name, { loop });
            if (!ok) throw new Error(`动作不存在：${name}。可选：${clips.join(', ')}`);
            // 记住最后播放的动作，刷新后恢复
            const wo = worldState.getWorldObjectById?.(id);
            if (wo && worldState.upsertWorldObject) {
                worldState.upsertWorldObject({ ...wo, metadata: { ...(wo.metadata || {}), lastAnimation: name } });
            }
            return { played: name, loop };
        },
        stopAnimation: (objectId) => {
            const id = objectId || requireSelected();
            sceneObjectRegistry.getByWorldObjectId(id)?.stopClip?.();
            return { stopped: true };
        },

        // 读骨架：返回骨骼名列表，供 AI 判断有哪些可动的骨骼（腿/臂/脊柱等）
        getRigInfo: (objectId) => {
            const id = objectId || requireSelected();
            const rec = sceneObjectRegistry.getByWorldObjectId(id);
            const bones = rec?.getBones?.() || [];
            return {
                isRigged: bones.length > 0,
                boneCount: bones.length,
                bones: bones.map((b) => b.name),
                hasClips: (rec?.clipNames || []).length > 0
            };
        },

        // 为绑骨模型【现场创作】骨骼动作：build(THREE, boneNames, helpers) 返回 KeyframeTrack[]（或 {tracks,duration}）。
        // helpers.swing(boneName, {axis,amplitudeDeg,period,phaseDeg}) 让骨骼绕轴往复摆动；helpers.bob 上下起伏。
        // 内部组装成 AnimationClip 并（按需创建 mixer 后）循环播放。
        animateRig: (objectId, build, opts = {}) => {
            const id = objectId || requireSelected();
            const rec = sceneObjectRegistry.getByWorldObjectId(id);
            const bones = rec?.getBones?.() || [];
            if (bones.length === 0) throw new Error('该对象不是绑骨模型（没有骨骼），无法创作骨骼动作');
            if (typeof build !== 'function') throw new Error('animateRig 需要一个 build(THREE, boneNames, helpers) 函数');
            const bonesByName = {};
            bones.forEach((b) => { bonesByName[b.name] = b; });
            const helpers = createRigHelpers(THREE, bonesByName);
            const result = build(THREE, bones.map((b) => b.name), helpers);
            const tracks = Array.isArray(result) ? result : (result?.tracks || []);
            if (!tracks.length) throw new Error('build 没有返回任何动画轨道(KeyframeTrack)');
            const duration = (!Array.isArray(result) && result?.duration) ? result.duration : -1;
            const loop = opts.loop !== false;
            const clip = new THREE.AnimationClip(opts.name || 'custom-rig', duration, tracks);
            const ok = rec.playClipObject(clip, { loop });
            if (!ok) throw new Error('播放失败（模型可能还在加载）');
            return { played: 'custom-rig', trackCount: tracks.length, loop };
        },

        deleteObject: (objectId) => {
            const id = objectId || requireSelected();
            sceneObjectRegistry.destroyWorldObject(id);
            worldState.removeWorldObject(id);
            return { deleted: id };
        },

        // —— 日志（展示 agent 思路/进度）——
        log: (...args) => { logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')); },
        _drainLogs: () => logs.splice(0)
    };

    return ctx;
};
