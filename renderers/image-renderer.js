import * as THREE from 'three';
import { normalizeAssetInfo } from '../domain/asset-schema.js';

export const createImageSceneObject = ({
    worldObject,
    asset,
    scene,
    createLabel,
    createLoader,
    registerHitTestTarget,
    capabilities = {}
}) => {
    const width = worldObject.metadata?.width || asset.metadata?.width || 9;
    const height = worldObject.metadata?.height || asset.metadata?.height || 9;
    const hasFrame = worldObject.metadata?.presentation?.frameStyle === 'frame';
    const selectableType = hasFrame ? 'painting' : 'image';
    const frameThickness = 0.8;
    const frameDepth = 0.5;
    const imageDepthOffset = hasFrame ? frameDepth / 2 + 0.01 : 0;

    const root = new THREE.Group();
    root.name = `world-object-${worldObject.id}`;
    root.position.set(worldObject.position.x, worldObject.position.y, worldObject.position.z);
    root.rotation.set(worldObject.rotation.x, worldObject.rotation.y, worldObject.rotation.z);
    root.scale.set(worldObject.scale.x, worldObject.scale.y, worldObject.scale.z);

    const frameGeo = hasFrame ? new THREE.BoxGeometry(width + frameThickness * 2, height + frameThickness * 2, frameDepth) : null;
    const frameMat = hasFrame ? new THREE.MeshStandardMaterial({
        color: 0x000000,
        roughness: 0.8,
        metalness: 0.1
    }) : null;
    if (hasFrame) {
        const frame = new THREE.Mesh(frameGeo, frameMat);
        root.add(frame);
    }

    const loader = createLoader();
    const label = createLabel(worldObject.metadata?.name || asset.name || 'Image', '', worldObject.metadata?.desc || '');
    let isLoaded = false;

    const texture = new THREE.TextureLoader().load(asset.url, () => {
        isLoaded = true;
        if (loader.text) loader.text.innerText = '100%';
        if (loader.container) loader.container.style.display = 'none';
    });
    texture.colorSpace = THREE.SRGBColorSpace;

    const canvasGeo = new THREE.PlaneGeometry(width, height);
    const canvasMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: texture,
        roughness: 0.9,
        emissive: 0xffffff,
        emissiveMap: texture,
        emissiveIntensity: 0.1,
        side: THREE.DoubleSide,
        transparent: true, // 支持带透明通道的图（如裁剪成圆形/异形的 PNG）
        alphaTest: 0.05
    });
    const canvasMesh = new THREE.Mesh(canvasGeo, canvasMat);
    canvasMesh.position.z = imageDepthOffset;
    root.add(canvasMesh);

    root.userData = {
        ...root.userData,
        worldObjectId: worldObject.id,
        labelType: selectableType,
        labelElement: label,
        labelWorldOffset: new THREE.Vector3(0, height / 2 + 3, 0),
        loaderElement: loader.container,
        loaderText: loader.text,
        getIsLoaded: () => isLoaded,
        selectableType,
        assetInfo: normalizeAssetInfo({ asset, worldObject, fallbackType: selectableType }),
        capabilities,
        selectableFocusZ: worldObject.position.z + 40
    };

    window.bgLabels.push(root);
    scene.add(root);

    registerHitTestTarget(root, {
        type: selectableType
    });

    return {
        root,
        destroy() {
            root.removeFromParent();
            label?.remove?.();
            loader?.container?.remove?.();
            frameGeo?.dispose();
            frameMat?.dispose();
            canvasGeo.dispose();
            canvasMat.dispose();
            texture.dispose();
        }
    };
};
