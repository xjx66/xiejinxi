import { createWorldObjectRecord } from '../../domain/world-object-schema.js';

export const createDefaultWorldDefinition = ({
    assetLibrary,
    avatarConfigs = []
}) => {
    const productObjects = (assetLibrary.products || []).map((product, index) => createWorldObjectRecord({
        id: `world-product-${index + 1}`,
        templateId: product.type === 'video' ? 'template-product-video' : 'template-product-model',
        assetId: product.assetId,
        type: product.type === 'video' ? 'video' : 'model',
        metadata: {
            collection: 'product',
            order: index,
            name: product.name,
            time: product.time || '',
            desc: product.desc || '',
            targetSize: product.targetSize || 16,
            keepAudio: Boolean(product.keepAudio)
        }
    }));

    const paintingObjects = (assetLibrary.paintings || []).map((painting, index) => createWorldObjectRecord({
        id: `world-painting-${index + 1}`,
        templateId: 'template-painting-image',
        assetId: painting.assetId,
        type: 'image',
        metadata: {
            collection: 'painting',
            order: index,
            name: painting.name,
            time: painting.time || '',
            desc: painting.desc || '',
            width: painting.width,
            height: painting.height
        }
    }));

    const avatarObjects = avatarConfigs.map((config, index) => createWorldObjectRecord({
        id: `world-avatar-${config.key}`,
        templateId: 'template-avatar-system',
        assetId: `asset-avatar-${config.key}`,
        type: 'avatar-template',
        metadata: {
            collection: 'avatar',
            order: index,
            key: config.key,
            name: config.name,
            statusLabel: config.status || '',
            desc: config.desc || ''
        }
    }));

    return {
        world: {
            id: 'world-default',
            name: 'Default World',
            theme: 'dark',
            version: 1
        },
        objects: [
            ...productObjects,
            ...paintingObjects,
            ...avatarObjects
        ]
    };
};
