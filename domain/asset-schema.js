export const normalizeAssetInfo = ({ asset = {}, worldObject = {}, template = null, fallbackType = null } = {}) => {
    const metadata = {
        ...(asset.metadata || {}),
        ...(worldObject.metadata || {})
    };
    return {
        id: asset.id || worldObject.assetId || worldObject.id || '',
        worldObjectId: worldObject.id || '',
        name: metadata.name || asset.name || worldObject.id || 'Untitled',
        kind: asset.kind || template?.objectType || worldObject.type || 'object',
        source: asset.source || 'unknown',
        type: fallbackType || template?.collection || metadata.collection || worldObject.type || 'object',
        collection: metadata.collection || template?.collection || fallbackType || 'object',
        time: metadata.time || '',
        desc: metadata.desc || '',
        url: asset.url || '',
        status: metadata.status || metadata.statusLabel || ''
    };
};

export const createAssetRecord = ({
    id,
    kind,
    source = 'user-upload',
    name,
    url = null,
    metadata = {},
    capabilities = {}
}) => ({
    id,
    kind,
    source,
    name,
    url,
    metadata,
    capabilities
});
