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

