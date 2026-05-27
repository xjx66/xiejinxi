export const AVATAR_FLOOR_Y = -5;

const FOOT_BONE_NAMES = ['LeftToeBase', 'RightToeBase', 'LeftFoot', 'RightFoot', 'LeftToe_End', 'RightToe_End'];

const getGroundReferenceY = (THREE, worldObject, fallbackMinY) => {
    const footYs = [];
    FOOT_BONE_NAMES.forEach((name) => {
        const bone = worldObject.getObjectByName?.(name);
        if (bone) {
            bone.updateMatrixWorld?.(true);
            const position = new THREE.Vector3();
            bone.getWorldPosition(position);
            footYs.push(position.y);
        }
    });
    if (footYs.length > 0) {
        return Math.min(...footYs);
    }
    return fallbackMinY;
};

export const fitAvatarWorldObjectToTargetHeight = ({ THREE, worldObject, profile }) => {
    if (!worldObject) {
        return {
            width: profile.worldSize.width,
            height: profile.worldSize.height,
            depth: profile.worldSize.width * 0.6
        };
    }

    worldObject.traverse((node) => {
        if (node.isMesh || node.isSkinnedMesh) {
            node.frustumCulled = false;
            node.castShadow = false;
            node.receiveShadow = false;
        }
    });
    worldObject.updateMatrixWorld(true);

    const initialBox = new THREE.Box3().setFromObject(worldObject);
    if (initialBox.isEmpty()) {
        return {
            width: profile.worldSize.width,
            height: profile.worldSize.height,
            depth: profile.worldSize.width * 0.6
        };
    }

    const initialSize = new THREE.Vector3();
    initialBox.getSize(initialSize);
    const safeHeight = initialSize.y > 0 ? initialSize.y : 1;
    const scaleFactor = profile.worldSize.height / safeHeight;
    worldObject.scale.multiplyScalar(scaleFactor);
    worldObject.updateMatrixWorld(true);

    const fittedBox = new THREE.Box3().setFromObject(worldObject);
    const fittedCenter = new THREE.Vector3();
    const fittedSize = new THREE.Vector3();
    fittedBox.getCenter(fittedCenter);
    fittedBox.getSize(fittedSize);

    const groundReferenceY = getGroundReferenceY(THREE, worldObject, fittedBox.min.y);
    worldObject.position.x -= fittedCenter.x;
    worldObject.position.z -= fittedCenter.z;
    worldObject.position.y -= groundReferenceY;
    worldObject.updateMatrixWorld(true);

    return {
        width: fittedSize.x,
        height: fittedSize.y,
        depth: fittedSize.z
    };
};

export const createAvatarPickVolume = ({ THREE, profile, fittedSize }) => {
    const pickVolumeScale = profile.interaction.pickVolumeScale || {};
    const width = Math.max(profile.worldSize.width * 0.9, fittedSize.width || profile.worldSize.width) * (pickVolumeScale.width ?? 1);
    const height = Math.max(profile.worldSize.height * 0.92, fittedSize.height || profile.worldSize.height) * (pickVolumeScale.height ?? 1);
    const depth = Math.max(8, Math.max(profile.worldSize.width * 0.8, fittedSize.depth || profile.worldSize.width * 0.6)) * (pickVolumeScale.depth ?? 1);
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false
    });
    const pickVolume = new THREE.Mesh(geometry, material);
    pickVolume.name = `${profile.key}-pick-volume`;
    pickVolume.position.y = height * 0.5 + (pickVolumeScale.offsetY ?? 0);
    return pickVolume;
};
