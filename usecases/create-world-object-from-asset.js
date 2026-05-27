import { createWorldObjectRecord } from '../domain/world-object-schema.js';

export const createWorldObjectFromAsset = ({
    actionContext,
    asset,
    resolvedAction,
    worldState,
    sceneObjectRegistry
}) => {
    const sceneRecord = actionContext.selectedObjectId
        ? sceneObjectRegistry.getByWorldObjectId(actionContext.selectedObjectId)
        : null;
    const existingRoot = sceneRecord?.root || null;
    const worldPoint = actionContext.worldPoint || { x: 0, y: 0, z: 0 };
    const defaultLift = resolvedAction.type === 'model' ? 0 : resolvedAction.type === 'video' ? 8 : 10;
    const position = existingRoot
        ? { x: existingRoot.position.x, y: existingRoot.position.y, z: existingRoot.position.z }
        : { x: worldPoint.x, y: worldPoint.y + defaultLift, z: worldPoint.z };
    const rotation = existingRoot
        ? { x: existingRoot.rotation.x, y: existingRoot.rotation.y, z: existingRoot.rotation.z }
        : { x: 0, y: 0, z: 0 };
    const scale = existingRoot
        ? { x: existingRoot.scale.x, y: existingRoot.scale.y, z: existingRoot.scale.z }
        : { x: 1, y: 1, z: 1 };

    return createWorldObjectRecord({
        id: actionContext.mode === 'replace' && actionContext.selectedObjectId
            ? actionContext.selectedObjectId
            : `world-user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        worldId: worldState.getWorld().id,
        templateId: resolvedAction.templateId,
        assetId: asset.id,
        type: resolvedAction.type,
        position,
        rotation,
        scale,
        metadata: {
            ...resolvedAction.metadata,
            targetSize: asset.metadata?.targetSize || 16,
            width: asset.metadata?.width,
            height: asset.metadata?.height,
            keepAudio: Boolean(asset.metadata?.keepAudio)
        }
    });
};
