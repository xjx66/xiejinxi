import { AVATAR_ASSET_FILES, AVATAR_MODELS } from '../../avatar-assets.js';

const SYSTEM_TEXTURES = {
    ground: './assets/textures/ground-texture.jpg',
    wall: './assets/textures/wall-texture.jpg',
    skylightHdr: './assets/textures/qwantani_dusk_2_puresky_8k.hdr'
};

const PRODUCT_ASSETS = [
    {
        id: 'asset-product-studio',
        kind: 'glb',
        source: 'system',
        name: '米兰桥下的无家可归者',
        url: './assets/products/virtual/studio.glb',
        metadata: {
            collection: 'product',
            displayType: 'model',
            targetSize: 16,
            time: '202509',
            desc: ''
        }
    },
    {
        id: 'asset-product-albe',
        kind: 'glb',
        source: 'system',
        name: '博尔扎诺城市更新',
        url: './assets/products/virtual/albe.glb',
        metadata: {
            collection: 'product',
            displayType: 'model',
            targetSize: 16,
            time: '202409',
            desc: ''
        }
    },
    {
        id: 'asset-product-claude-pets',
        kind: 'video',
        source: 'system',
        name: 'Claude Pets',
        url: './assets/products/virtual/calaudepets.mp4',
        metadata: {
            collection: 'product',
            displayType: 'video',
            targetSize: 16,
            keepAudio: false,
            time: '202603',
            desc: 'claude代码泄漏'
        }
    },
    {
        id: 'asset-product-notes',
        kind: 'video',
        source: 'system',
        name: 'Notes App',
        url: './assets/products/virtual/notes.mp4',
        metadata: {
            collection: 'product',
            displayType: 'video',
            targetSize: 16,
            keepAudio: false,
            time: '202603',
            desc: '不一样的交互形式'
        }
    },
    {
        id: 'asset-product-unieco',
        kind: 'video',
        source: 'system',
        name: 'UNI生态圈校园论坛',
        url: './assets/products/virtual/unieco.mp4',
        metadata: {
            collection: 'product',
            displayType: 'video',
            targetSize: 16,
            keepAudio: true,
            time: '202109-202409',
            desc: ''
        }
    },
    {
        id: 'asset-product-panda',
        kind: 'video',
        source: 'system',
        name: 'Panda校园专送外卖平台',
        url: './assets/products/virtual/panda.mp4',
        metadata: {
            collection: 'product',
            displayType: 'video',
            targetSize: 8,
            keepAudio: false,
            time: '202109-202409',
            desc: ''
        }
    }
];

const PAINTING_ASSETS = [
    {
        id: 'asset-painting-x',
        kind: 'image',
        source: 'system',
        name: 'X',
        url: './assets/paintings/20260322-170017.jpeg',
        metadata: {
            collection: 'painting',
            width: 9,
            height: 9,
            time: '202603',
            desc: ''
        }
    },
    {
        id: 'asset-painting-selfies',
        kind: 'image',
        source: 'system',
        name: '小侄子和小侄女的自拍',
        url: './assets/paintings/selfies.jpeg',
        metadata: {
            collection: 'painting',
            width: 9,
            height: 9 * (1181 / 1146),
            time: '202602',
            desc: ''
        }
    },
    {
        id: 'asset-painting-grandpa',
        kind: 'image',
        source: 'system',
        name: '爷爷和我',
        url: './assets/paintings/我和我爷爷.jpeg',
        metadata: {
            collection: 'painting',
            width: 9,
            height: 9 * (1440 / 1080),
            time: '202407',
            desc: '雅安市人民医院'
        }
    }
];

const AVATAR_TEMPLATE_ASSETS = AVATAR_MODELS.map((config) => ({
    id: `asset-avatar-${config.key}`,
    kind: 'avatar-template',
    source: 'system',
    name: config.name,
    url: config.url ? `./avatars/${config.url}` : null,
    metadata: {
        collection: 'avatar',
        key: config.key,
        engineType: config.engineType,
        status: config.status,
        desc: config.desc || ''
    }
}));

const TEXTURE_ASSETS = Object.entries(SYSTEM_TEXTURES).map(([key, url]) => ({
    id: `asset-texture-${key}`,
    kind: 'texture',
    source: 'system',
    name: key,
    url,
    metadata: {
        collection: 'texture'
    }
}));

export const SYSTEM_ASSETS = [
    ...TEXTURE_ASSETS,
    ...PRODUCT_ASSETS,
    ...PAINTING_ASSETS,
    ...AVATAR_TEMPLATE_ASSETS
];

export const SYSTEM_ASSET_LIBRARY = {
    textures: { ...SYSTEM_TEXTURES },
    products: PRODUCT_ASSETS.map((asset) => ({
        assetId: asset.id,
        name: asset.name,
        url: asset.url,
        type: asset.metadata.displayType,
        targetSize: asset.metadata.targetSize,
        keepAudio: asset.metadata.keepAudio || false,
        time: asset.metadata.time || '',
        desc: asset.metadata.desc || ''
    })),
    paintings: PAINTING_ASSETS.map((asset) => ({
        assetId: asset.id,
        name: asset.name,
        url: asset.url,
        width: asset.metadata.width,
        height: asset.metadata.height,
        time: asset.metadata.time || '',
        desc: asset.metadata.desc || ''
    })),
    avatars: {
        ...AVATAR_ASSET_FILES
    },
    avatarTemplates: AVATAR_TEMPLATE_ASSETS
};

export const SYSTEM_ASSET_INDEX = new Map(SYSTEM_ASSETS.map((asset) => [asset.id, asset]));

export const getSystemAssetsByCollection = (collection) => {
    return SYSTEM_ASSETS.filter((asset) => asset.metadata?.collection === collection);
};

