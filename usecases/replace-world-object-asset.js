export const replaceWorldObjectAsset = ({
    worldState,
    replaceManagedSceneObject,
    targetObjectId,
    worldObject
}) => {
    worldState.upsertWorldObject(worldObject);
    return replaceManagedSceneObject(targetObjectId, worldObject);
};
