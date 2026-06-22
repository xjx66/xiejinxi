import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createAssetRecord } from '../domain/asset-schema.js';

// 程序化 3D：让模型写的 build(THREE, group) 往一个隔离的 group 里搭几何体，
// 导出成 GLB(blob URL)，注册为 glb 资产并返回。之后用 ctx.createObject({type:'model'}) 放进场景。
// build 拿到的是【作为参数传入的真实 THREE】——run_script 全局里的 THREE 仍被遮蔽，模型碰不到场景/相机。

const genId = () => `asset-gen3d-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const exportGlb = (object3d) => new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(
        object3d,
        (result) => {
            // binary:true 时 result 是 ArrayBuffer
            resolve(result instanceof ArrayBuffer ? result : new TextEncoder().encode(JSON.stringify(result)).buffer);
        },
        (err) => reject(new Error('GLB 导出失败: ' + (err?.message || err))),
        { binary: true }
    );
});

export const generateProceduralModel = async ({ worldState, build, name }) => {
    if (typeof build !== 'function') throw new Error('generate3DModel 需要一个 build(THREE, group) 函数');
    const group = new THREE.Group();
    build(THREE, group);
    if (group.children.length === 0) throw new Error('build 没有往 group 添加任何网格');

    const arrayBuffer = await exportGlb(group);
    const blob = new Blob([arrayBuffer], { type: 'model/gltf-binary' });
    const url = URL.createObjectURL(blob);

    const asset = createAssetRecord({
        id: genId(),
        kind: 'glb',
        source: 'agent-generated',
        name: name || `model-${Date.now()}`,
        url,
        metadata: { createdAt: Date.now(), targetSize: 16 }
    });
    worldState.addAsset(asset);

    // 释放临时几何/材质，避免泄漏（GLB 已包含数据，scene 会重新加载）
    group.traverse((o) => { o.geometry?.dispose?.(); const m = o.material; (Array.isArray(m) ? m : [m]).forEach((x) => x?.dispose?.()); });

    return asset;
};
