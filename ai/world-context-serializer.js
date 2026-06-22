export const serializeWorldContext = ({
    worldState,
    selectionStore,
    sceneObjectRegistry
}) => {
    const selection = selectionStore?.getState?.() || {};
    const selectedWorldObject = selection.selectedWorldObjectId
        ? worldState.getWorldObjectById(selection.selectedWorldObjectId)
        : null;
    const sceneRecord = selection.selectedWorldObjectId
        ? sceneObjectRegistry.getByWorldObjectId(selection.selectedWorldObjectId)
        : null;

    return {
        world: worldState.getWorld(),
        selection: {
            selectedWorldObjectId: selection.selectedWorldObjectId || null,
            selectedObjectType: sceneRecord?.root?.userData?.selectableType || selectedWorldObject?.type || null,
            selectedObjectName: sceneRecord?.root?.userData?.assetInfo?.name || selectedWorldObject?.metadata?.name || null,
            // 多选：当前所有被选中对象的 id（含主选中）。>1 表示用户 Shift 多选了多个对象。
            selectedObjectIds: Array.isArray(selection.selectedIds) ? selection.selectedIds : (selection.selectedWorldObjectId ? [selection.selectedWorldObjectId] : [])
        },
        selectedWorldObject,
        objectCount: worldState.getWorldObjects().length,
        assetCount: worldState.getAssets().length
    };
};
