export const createWorldObjectRecord = ({
    id,
    worldId = 'world-default',
    templateId,
    assetId,
    type,
    position = { x: 0, y: 0, z: 0 },
    rotation = { x: 0, y: 0, z: 0 },
    scale = { x: 1, y: 1, z: 1 },
    status = 'ready',
    metadata = {},
    capabilities = null
}) => ({
    id,
    worldId,
    templateId,
    assetId,
    type,
    position: { ...position },
    rotation: { ...rotation },
    scale: { ...scale },
    status,
    metadata: { ...metadata },
    ...(capabilities ? { capabilities: { ...capabilities } } : {})
});
