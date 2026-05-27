import * as THREE from 'three';
import { normalizeAssetInfo } from '../domain/asset-schema.js';

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

    const loader = createLoader();
    const label = createLabel(worldObject.metadata?.name || asset.name || 'Video', '', worldObject.metadata?.desc || '');
    let isLoaded = false;

    const updateVideoLayout = () => {
        const aspect = video.videoWidth && video.videoHeight ? (video.videoWidth / video.videoHeight) : (16 / 9);
        const height = targetSize / aspect;
        screenMesh.geometry.dispose();
        screenMesh.geometry = new THREE.PlaneGeometry(targetSize, height);
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
        type: 'product'
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
            videoTexture.dispose();
        }
    };
};
