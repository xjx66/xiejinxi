// 编辑撤销栈，支持两类快照：
//  - transform：变换类就地编辑前的位姿，撤销=还原 root 位姿 + 回写数据。
//  - record：重建类编辑前的整份 worldObject，撤销=回写数据 + 原子重建 + 重新选中。
// Ctrl/Cmd+Z 弹出最近一次快照并还原。刷新后栈清空。

const MAX_HISTORY = 50;

const cloneVec = (v) => ({ x: v.x, y: v.y, z: v.z });
const deepClone = (obj) => JSON.parse(JSON.stringify(obj));

export const createEditHistory = ({
    worldState,
    sceneObjectRegistry,
    replaceManagedSceneObject,
    reselect,
    onAfterUndo
}) => {
    const stack = [];

    const pushEntry = (entry) => {
        if (!entry) return;
        stack.push(entry);
        if (stack.length > MAX_HISTORY) stack.shift();
    };

    // 变换快照：从当前场景 root 读位姿
    const push = (worldObjectId) => {
        const root = sceneObjectRegistry.getByWorldObjectId(worldObjectId)?.root;
        if (!root) return;
        pushEntry({
            kind: 'transform',
            worldObjectId,
            position: cloneVec(root.position),
            rotation: { x: root.rotation.x, y: root.rotation.y, z: root.rotation.z },
            scale: cloneVec(root.scale)
        });
    };

    // 整对象快照：重建类编辑前调用
    const pushRecord = (worldObject) => {
        if (!worldObject) return;
        pushEntry({ kind: 'record', worldObjectId: worldObject.id, worldObject: deepClone(worldObject) });
    };

    const undoTransform = (snap) => {
        const root = sceneObjectRegistry.getByWorldObjectId(snap.worldObjectId)?.root;
        if (!root) return false;
        root.position.set(snap.position.x, snap.position.y, snap.position.z);
        root.rotation.set(snap.rotation.x, snap.rotation.y, snap.rotation.z);
        root.scale.set(snap.scale.x, snap.scale.y, snap.scale.z);
        const wo = worldState.getWorldObjectById?.(snap.worldObjectId);
        if (wo && worldState.upsertWorldObject) {
            worldState.upsertWorldObject({
                ...wo,
                position: { ...snap.position },
                rotation: { ...snap.rotation },
                scale: { ...snap.scale }
            });
        }
        return true;
    };

    const undoRecord = (snap) => {
        if (!replaceManagedSceneObject) return false;
        worldState.upsertWorldObject(deepClone(snap.worldObject));
        const newRoot = replaceManagedSceneObject(snap.worldObjectId, deepClone(snap.worldObject));
        reselect?.(snap.worldObjectId, newRoot);
        return true;
    };

    const undo = () => {
        const snap = stack.pop();
        if (!snap) return false;
        const ok = snap.kind === 'record' ? undoRecord(snap) : undoTransform(snap);
        if (ok) onAfterUndo?.(snap.worldObjectId);
        return ok;
    };

    const bindKeyboard = (target = window) => {
        const handler = (e) => {
            const tag = (e.target?.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'textarea') return;
            const isUndo = (e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z');
            if (!isUndo || stack.length === 0) return;
            e.preventDefault();
            undo();
        };
        target.addEventListener('keydown', handler);
        return () => target.removeEventListener('keydown', handler);
    };

    return { push, pushRecord, undo, bindKeyboard, get size() { return stack.length; } };
};
