import { createImageSceneObject } from '../renderers/image-renderer.js';
import { createVideoSceneObject } from '../renderers/video-renderer.js';
import { createModelSceneObject } from '../renderers/model-renderer.js';
import { normalizeCapabilities } from '../domain/capability-schema.js';

const sortByOrder = (items) => {
    return [...items].sort((a, b) => {
        const orderA = a.metadata?.order ?? 0;
        const orderB = b.metadata?.order ?? 0;
        return orderA - orderB;
    });
};

const resolveAssetBackedObject = (worldState, worldObject) => {
    const asset = worldState.getAssetById(worldObject.assetId);
    const template = worldState.getTemplateById(worldObject.templateId);
    if (!asset) return null;
    return {
        id: worldObject.id,
        assetId: asset.id,
        templateId: worldObject.templateId,
        type: worldObject.type,
        url: asset.url,
        name: worldObject.metadata?.name || asset.name,
        desc: worldObject.metadata?.desc || asset.metadata?.desc || '',
        time: worldObject.metadata?.time || asset.metadata?.time || '',
        keepAudio: Boolean(worldObject.metadata?.keepAudio ?? asset.metadata?.keepAudio),
        targetSize: worldObject.metadata?.targetSize ?? asset.metadata?.targetSize,
        width: worldObject.metadata?.width ?? asset.metadata?.width,
        height: worldObject.metadata?.height ?? asset.metadata?.height,
        metadata: {
            ...(asset.metadata || {}),
            ...(worldObject.metadata || {})
        },
        template
    };
};

export const createRuntimeCollectionResolver = (worldState) => ({
    getProductConfigs() {
        return sortByOrder(worldState.getWorldObjectsByCollection('product'))
            .map((worldObject) => resolveAssetBackedObject(worldState, worldObject))
            .filter(Boolean)
            .map((entry) => ({
                worldObjectId: entry.id,
                assetId: entry.assetId,
                name: entry.name,
                url: entry.url,
                type: entry.type === 'video' ? 'video' : 'model',
                targetSize: entry.targetSize || 16,
                keepAudio: entry.keepAudio,
                time: entry.time,
                desc: entry.desc
            }));
    },
    getPaintingConfigs() {
        return sortByOrder(worldState.getWorldObjectsByCollection('painting'))
            .map((worldObject) => resolveAssetBackedObject(worldState, worldObject))
            .filter(Boolean)
            .map((entry) => ({
                worldObjectId: entry.id,
                assetId: entry.assetId,
                name: entry.name,
                url: entry.url,
                width: entry.width || 9,
                height: entry.height || 9,
                time: entry.time,
                desc: entry.desc
            }));
    },
    getAvatarTemplateConfigs() {
        return sortByOrder(worldState.getWorldObjectsByCollection('avatar'))
            .map((worldObject) => resolveAssetBackedObject(worldState, worldObject))
            .filter(Boolean);
    }
});

export const createSceneObjectFactory = (deps) => ({
    createSceneObjectFromWorldObject(worldObject, worldState) {
        const asset = worldState.getAssetById(worldObject.assetId);
        if (!asset) {
            throw new Error(`Asset not found: ${worldObject.assetId}`);
        }
        const template = worldState.getTemplateById(worldObject.templateId);
        if (worldObject.type === 'image') {
            return createImageSceneObject({
                ...deps,
                worldObject,
                asset,
                capabilities: normalizeCapabilities({ asset, template, worldObject })
            });
        }
        if (worldObject.type === 'video') {
            return createVideoSceneObject({
                ...deps,
                worldObject,
                asset,
                capabilities: normalizeCapabilities({ asset, template, worldObject })
            });
        }
        if (worldObject.type === 'model') {
            return createModelSceneObject({
                ...deps,
                worldObject,
                asset,
                capabilities: normalizeCapabilities({ asset, template, worldObject })
            });
        }
        throw new Error(`Unsupported world object type: ${worldObject.type}`);
    }
});
