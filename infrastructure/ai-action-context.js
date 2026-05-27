const createDefaultContext = () => ({
    mode: 'idle',
    worldPoint: null,
    selectedObjectId: null,
    selectedObjectType: null,
    selectedObjectName: null,
    prompt: '',
    uploadedAssetId: null,
    uploadedAssetName: null
});

export const createAiActionContext = () => {
    let state = createDefaultContext();
    const listeners = new Set();

    const emit = () => {
        const snapshot = { ...state };
        listeners.forEach((listener) => listener(snapshot));
    };

    return {
        getState() {
            return { ...state };
        },
        setTarget({ mode, worldPoint, selectedObjectId = null, selectedObjectType = null, selectedObjectName = null }) {
            state = {
                ...state,
                mode,
                worldPoint: worldPoint ? { ...worldPoint } : null,
                selectedObjectId,
                selectedObjectType,
                selectedObjectName
            };
            emit();
        },
        setPrompt(prompt) {
            state = {
                ...state,
                prompt
            };
            emit();
        },
        setUploadedAsset(asset) {
            state = {
                ...state,
                uploadedAssetId: asset?.id || null,
                uploadedAssetName: asset?.name || null
            };
            emit();
        },
        clear() {
            state = createDefaultContext();
            emit();
        },
        subscribe(listener) {
            listeners.add(listener);
            listener({ ...state });
            return () => listeners.delete(listener);
        }
    };
};

