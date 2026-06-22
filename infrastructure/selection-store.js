// 选中存储：支持多选。
//  - selectedIds / roots：完整的多选集合（含主选中）
//  - selectedWorldObjectId / root：主选中（最后点击的那个），gizmo / 面板 / 编辑都作用在它上面
// 普通点击 = 单选替换(select)；Shift+点击 = 加减式切换(toggleAdditive)。

const createDefaultSelectionState = () => ({
    selectedWorldObjectId: null,
    root: null,
    selectedIds: [],
    roots: [],
    hitPoint: null,
    hitResult: null,
    reason: 'initial'
});

export const createSelectionStore = () => {
    let state = createDefaultSelectionState();
    const listeners = new Set();

    const snapshot = () => ({ ...state, selectedIds: [...state.selectedIds], roots: [...state.roots] });
    const emit = () => {
        const next = snapshot();
        listeners.forEach((listener) => listener(next));
    };

    const resolveId = (worldObjectId, root) => worldObjectId || root?.userData?.worldObjectId || null;

    return {
        getState() {
            return snapshot();
        },
        // 单选替换：清掉其它，仅选中这一个
        select({ worldObjectId = null, root = null, hitPoint = null, hitResult = null, reason = 'select' } = {}) {
            const id = resolveId(worldObjectId, root);
            state = {
                selectedWorldObjectId: id,
                root,
                selectedIds: id ? [id] : [],
                roots: root ? [root] : [],
                hitPoint: hitPoint?.clone?.() || hitPoint || null,
                hitResult,
                reason
            };
            emit();
            return snapshot();
        },
        // Shift+点击：集合里有就移除、没有就加入；主选中变为集合末尾元素
        toggleAdditive({ worldObjectId = null, root = null, hitPoint = null, hitResult = null, reason = 'toggle-additive' } = {}) {
            const id = resolveId(worldObjectId, root);
            if (!id || !root) return snapshot();
            const ids = [...state.selectedIds];
            const roots = [...state.roots];
            const idx = ids.indexOf(id);
            if (idx >= 0) {
                ids.splice(idx, 1);
                roots.splice(idx, 1);
            } else {
                ids.push(id);
                roots.push(root);
            }
            state = {
                selectedWorldObjectId: ids[ids.length - 1] || null,
                root: roots[roots.length - 1] || null,
                selectedIds: ids,
                roots,
                hitPoint: hitPoint?.clone?.() || hitPoint || null,
                hitResult,
                reason
            };
            emit();
            return snapshot();
        },
        isSelected(id) {
            return state.selectedIds.includes(id);
        },
        clear(reason = 'clear') {
            state = { ...createDefaultSelectionState(), reason };
            emit();
            return snapshot();
        },
        touch() {
            emit();
            return snapshot();
        },
        subscribe(listener) {
            listeners.add(listener);
            listener(snapshot());
            return () => listeners.delete(listener);
        }
    };
};
