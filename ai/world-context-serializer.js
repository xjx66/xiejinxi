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
            selectedObjectName: sceneRecord?.root?.userData?.assetInfo?.name || selectedWorldObject?.metadata?.name || null
        },
        selectedWorldObject,
        objectCount: worldState.getWorldObjects().length,
        assetCount: worldState.getAssets().length
    };
};
