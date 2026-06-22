import { createAssetRecord } from '../domain/asset-schema.js';

// Canvas 图像处理：agent 的 ctx.processImage / 程序化绘图都走这里。
// 把处理结果导出为 PNG dataURL，注册成一个新的 image 资产并返回。

const loadImage = (url) => new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // 允许跨域图被 canvas 读取（需对方允许）
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败，可能受跨域限制'));
    img.src = url;
});

const genId = () => `asset-gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const registerCanvasAsset = ({ worldState, canvas, name, source }) => {
    const url = canvas.toDataURL('image/png');
    const asset = createAssetRecord({
        id: genId(),
        kind: 'image',
        source: source || 'agent-generated',
        name: name || `generated-${Date.now()}`,
        url,
        metadata: { width: canvas.width, height: canvas.height, createdAt: Date.now() }
    });
    worldState.addAsset(asset);
    return asset;
};

// 对已有图片资产做处理：draw(canvas, ctx2d, img) 由调用方（或模型代码）提供。
export const processImageAsset = async ({ worldState, sourceAssetId, draw, name }) => {
    const src = worldState.getAssetById(sourceAssetId);
    if (!src) throw new Error('源图片资产不存在');
    if (src.kind !== 'image') throw new Error('只能处理图片资产');
    const img = await loadImage(src.url);
    const w = img.naturalWidth || img.width || 1024;
    const h = img.naturalHeight || img.height || 1024;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const c = canvas.getContext('2d');
    await draw(canvas, c, img);
    return registerCanvasAsset({ worldState, canvas, name: name || `${src.name}-processed`, source: 'agent-processed' });
};

// 从零程序化生成一张图：draw(canvas, ctx2d) 由调用方提供。
export const createImageAssetFromDraw = async ({ worldState, width = 1024, height = 1024, draw, name }) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const c = canvas.getContext('2d');
    await draw(canvas, c);
    return registerCanvasAsset({ worldState, canvas, name: name || `generated-${Date.now()}`, source: 'agent-generated' });
};
