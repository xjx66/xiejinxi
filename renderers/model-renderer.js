import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
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

export const createModelSceneObject = ({
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

    const loader = createLoader();
    const label = createLabel(worldObject.metadata?.name || asset.name || 'Model', '', worldObject.metadata?.desc || '');
    let isLoaded = false;
    const gltfLoader = new GLTFLoader();

    const { hitBox, material: hitBoxMat } = createProductPickVolume(targetSize);
    root.add(hitBox);

    gltfLoader.load(asset.url, (gltf) => {
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const scale = targetSize / maxDim;
        model.scale.setScalar(scale);
        box.setFromObject(model);
        box.getCenter(center);
        model.position.sub(center);
        root.add(model);
        isLoaded = true;
        if (loader.text) loader.text.innerText = '100%';
        if (loader.container) loader.container.style.display = 'none';
    }, (xhr) => {
        if (xhr.lengthComputable && loader.text) {
            loader.text.innerText = `${Math.round((xhr.loaded / xhr.total) * 100)}%`;
        }
    }, () => {
        const holoGeo = new THREE.BoxGeometry(4, 4, 4);
        const holoMat = new THREE.MeshStandardMaterial({
            color: 0x00ffff,
            emissive: 0x00ffff,
            emissiveIntensity: 0.8,
            transparent: true,
            opacity: 0.6,
            wireframe: true
        });
        root.add(new THREE.Mesh(holoGeo, holoMat));
        if (loader.text) loader.text.innerText = 'ERR';
    });

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
        selectableFocusZ: worldObject.position.z + 40
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
            root.removeFromParent();
            label?.remove?.();
            loader?.container?.remove?.();
            hitBox.geometry.dispose();
            hitBoxMat.dispose();
        }
    };
};
