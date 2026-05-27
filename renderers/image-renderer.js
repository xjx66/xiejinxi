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
    const visualPickWidth = hasFrame ? width + frameThickness * 2 : width;
    const visualPickHeight = hasFrame ? height + frameThickness * 2 : height;
    const pickWidth = Math.max(visualPickWidth * 2.4, visualPickWidth + 18);
    const pickHeight = Math.max(visualPickHeight * 2.4, visualPickHeight + 18);

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
        side: THREE.DoubleSide
    });
    const canvasMesh = new THREE.Mesh(canvasGeo, canvasMat);
    canvasMesh.position.z = imageDepthOffset;
    root.add(canvasMesh);
    const pickVolumeGeo = new THREE.BoxGeometry(pickWidth, pickHeight, Math.max(frameDepth * 3, 10));
    const pickVolumeMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    const pickVolume = new THREE.Mesh(pickVolumeGeo, pickVolumeMat);
    pickVolume.name = `${worldObject.id}-pick-volume`;
    root.add(pickVolume);

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
        type: selectableType,
        nearDistance: 260,
        midDistance: 840,
        screenPadding: 18,
        farScreenPadding: 24,
        selectionBias: 10,
        getColliderObject: () => pickVolume,
        getPreciseRoots: () => [root]
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
            pickVolumeGeo.dispose();
            pickVolumeMat.dispose();
            texture.dispose();
        }
    };
};
