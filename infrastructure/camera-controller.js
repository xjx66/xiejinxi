export const createCameraController = ({
    camera,
    minZ = -870,
    maxZ = 40,
    initialTargetX = 0,
    initialTargetZ = camera?.position?.z ?? 40
}) => {
    let targetX = initialTargetX;
    let targetZ = initialTargetZ;

    const clampZ = (value) => Math.min(maxZ, Math.max(minZ, value));

    return {
        getState() {
            return {
                cameraX: camera.position.x,
                cameraZ: camera.position.z,
                targetX,
                targetZ,
                minZ,
                maxZ
            };
        },
        setTarget({ x = targetX, z = targetZ } = {}) {
            if (typeof x === 'number' && Number.isFinite(x)) targetX = x;
            if (typeof z === 'number' && Number.isFinite(z)) targetZ = clampZ(z);
            return this.getState();
        },
        moveTargetBy({ x = 0, z = 0 } = {}) {
            targetX += x;
            targetZ = clampZ(targetZ + z);
            return this.getState();
        },
        update({ lerp = 0.08, snapXThreshold = 0.02 } = {}) {
            const diffX = targetX - camera.position.x;
            if (Math.abs(diffX) < snapXThreshold) camera.position.x = targetX;
            else camera.position.x += diffX * lerp;
            camera.position.z += (targetZ - camera.position.z) * lerp;
            return this.getState();
        },
        focusObject({ point, focusZ } = {}) {
            return this.setTarget({
                x: point?.x,
                z: focusZ
            });
        }
    };
};
