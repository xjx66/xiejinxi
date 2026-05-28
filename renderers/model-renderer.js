import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { normalizeAssetInfo } from '../domain/asset-schema.js';

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

    // GLB 内置动画：mixer + 按名字索引的 clips。加载完成后填入。
    let mixer = null;
    const clipsByName = new Map();
    const clipNames = [];
    let activeAction = null;

    const playClip = (name) => {
        if (!mixer) return false;
        const clip = clipsByName.get(name);
        if (!clip) return false;
        if (activeAction) {
            activeAction.stop();
            activeAction = null;
        }
        const action = mixer.clipAction(clip);
        action.reset();
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.play();
        activeAction = action;
        return true;
    };

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

        // 收集 GLB 自带动画
        const animations = Array.isArray(gltf.animations) ? gltf.animations : [];
        if (animations.length > 0) {
            mixer = new THREE.AnimationMixer(model);
            animations.forEach((clip) => {
                if (!clip || !clip.name) return;
                clipsByName.set(clip.name, clip);
                clipNames.push(clip.name);
            });
            // 把动画能力同步到 root.userData，方便 registry / 面板从 record 之外读取
            root.userData.clipNames = clipNames.slice();
            root.userData.mixer = mixer;
            root.userData.playClip = playClip;
            // 持久化恢复：上次播过的动作直接重放，clampWhenFinished 会停在最后一帧
            const last = worldObject.metadata?.lastAnimation;
            if (last && clipsByName.has(last)) {
                playClip(last);
            }
        }
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
        type: 'product'
    });

    return {
        root,
        // GLB 自带动画暴露给上层（registry/AI 面板）；未带动画时为空数组/null。
        get clipNames() { return clipNames.slice(); },
        get mixer() { return mixer; },
        playClip,
        destroy() {
            if (mixer) {
                mixer.stopAllAction();
                mixer.uncacheRoot(mixer.getRoot?.() || root);
            }
            root.removeFromParent();
            label?.remove?.();
            loader?.container?.remove?.();
        }
    };
};
