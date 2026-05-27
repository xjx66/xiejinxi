const createDefaultSelectionState = () => ({
    selectedWorldObjectId: null,
    root: null,
    hitPoint: null,
    hitResult: null,
    reason: 'initial'
});

export const createSelectionStore = () => {
    let state = createDefaultSelectionState();
    const listeners = new Set();

    const snapshot = () => ({ ...state });
    const emit = () => {
        const next = snapshot();
        listeners.forEach((listener) => listener(next));
    };

    return {
        getState() {
            return snapshot();
        },
        select({ worldObjectId = null, root = null, hitPoint = null, hitResult = null, reason = 'select' } = {}) {
            state = {
                selectedWorldObjectId: worldObjectId || root?.userData?.worldObjectId || null,
                root,
                hitPoint: hitPoint?.clone?.() || hitPoint || null,
                hitResult,
                reason
            };
            emit();
            return snapshot();
        },
        clear(reason = 'clear') {
            state = {
                ...createDefaultSelectionState(),
                reason
            };
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
