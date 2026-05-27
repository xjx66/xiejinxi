import * as THREE from 'three';
import { normalizeAssetInfo } from '../domain/asset-schema.js';

const createProductPickVolume = (targetSize, height = targetSize) => {
    const width = Math.max(targetSize * 2.8, targetSize + 30);
    const pickHeight = Math.max(height * 2.4, targetSize + 24);
    const depth = Math.max(targetSize * 3.2, targetSize + 36);
    const geometry = new THREE.BoxGeometry(width, pickHeight, depth);
    const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    const hitBox = new THREE.Mesh(geometry, material);
    hitBox.name = 'product-hit-box';
    return { hitBox, material };
};

const resizeProductPickVolume = (hitBox, targetSize, height = targetSize) => {
    if (!hitBox) return;
    hitBox.geometry.dispose();
    const width = Math.max(targetSize * 2.8, targetSize + 30);
    const pickHeight = Math.max(height * 2.4, targetSize + 24);
    const depth = Math.max(targetSize * 3.2, targetSize + 36);
    hitBox.geometry = new THREE.BoxGeometry(width, pickHeight, depth);
};

export const createVideoSceneObject = ({
    worldObject,
    asset,
    scene,
    createLabel,
    createLoader,
    registerHitTestTarget,
    capabilities = {}
}) => {
    const targetSize = worldObject.metadata?.targetSize || asset.metadata?.targetSize || 16;
    const root = new THREE.Group();
    root.name = `world-object-${worldObject.id}`;
    root.position.set(worldObject.position.x, worldObject.position.y, worldObject.position.z);
    root.rotation.set(worldObject.rotation.x, worldObject.rotation.y, worldObject.rotation.z);
    root.scale.set(worldObject.scale.x, worldObject.scale.y, worldObject.scale.z);

    const video = document.createElement('video');
    video.src = asset.url;
    video.crossOrigin = 'anonymous';
    video.loop = true;
    video.playsInline = true;
    video.muted = !(worldObject.metadata?.keepAudio ?? asset.metadata?.keepAudio);

    const videoTexture = new THREE.VideoTexture(video);
    videoTexture.colorSpace = THREE.SRGBColorSpace;
    const screenGeo = new THREE.PlaneGeometry(targetSize, targetSize * (9 / 16));
    const screenMat = new THREE.MeshBasicMaterial({
        map: videoTexture,
        transparent: true,
        opacity: 0.92,
        side: THREE.DoubleSide
    });
    const screenMesh = new THREE.Mesh(screenGeo, screenMat);
    root.add(screenMesh);

    const { hitBox, material: hitBoxMat } = createProductPickVolume(targetSize, targetSize * (9 / 16));
    root.add(hitBox);

    const loader = createLoader();
    const label = createLabel(worldObject.metadata?.name || asset.name || 'Video', '', worldObject.metadata?.desc || '');
    let isLoaded = false;

    const updateVideoLayout = () => {
        const aspect = video.videoWidth && video.videoHeight ? (video.videoWidth / video.videoHeight) : (16 / 9);
        const height = targetSize / aspect;
        screenMesh.geometry.dispose();
        screenMesh.geometry = new THREE.PlaneGeometry(targetSize, height);
        resizeProductPickVolume(hitBox, targetSize, height);
        root.userData.labelWorldOffset.y = height / 2 + 3;
        isLoaded = true;
        if (loader.text) loader.text.innerText = '100%';
        if (loader.container) loader.container.style.display = 'none';
    };

    video.addEventListener('loadedmetadata', updateVideoLayout);

    root.userData = {
        ...root.userData,
        worldObjectId: worldObject.id,
        labelType: 'product',
        labelElement: label,
        labelWorldOffset: new THREE.Vector3(0, targetSize / 2 + 3, 0),
        loaderElement: loader.container,
        loaderText: loader.text,
        getIsLoaded: () => isLoaded,
        selectableType: 'product',
        assetInfo: normalizeAssetInfo({ asset, worldObject, fallbackType: 'product' }),
        capabilities,
        selectableFocusZ: worldObject.position.z + 40,
        isVideo: true,
        video
    };

    window.bgLabels.push(root);
    scene.add(root);

    registerHitTestTarget(root, {
        type: 'product',
        dynamic: true,
        nearDistance: 320,
        midDistance: 900,
        screenPadding: 20,
        farScreenPadding: 26,
        selectionBias: 16,
        getColliderObject: () => hitBox,
        getPreciseRoots: () => [root]
    });

    return {
        root,
        destroy() {
            video.pause();
            root.removeFromParent();
            label?.remove?.();
            loader?.container?.remove?.();
            screenMesh.geometry.dispose();
            screenMat.dispose();
            hitBox.geometry.dispose();
            hitBoxMat.dispose();
            videoTexture.dispose();
        }
    };
};
