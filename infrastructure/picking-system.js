// 单射线纯 mesh 拾取：把所有 selectable root 的可见 mesh 收集进一个数组，
// 一次 raycaster.intersectObjects(meshes, true) 出最近 hit；命中后沿父链找到注册的 selectable root。
// 不再维护 spatial index、precise/collider 双轨、score 评分等复杂逻辑。
export const createPickingSystem = ({
    THREE,
    camera,
    getViewportSize,
    debugLogger = { emit() {} }
}) => {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const targets = [];
    const targetByRoot = new Map();
    const meshBox = new THREE.Box3();
    let idSeed = 1;

    const isInvisibleHitNode = (node) => {
        if (!node) return true;
        if (node.userData?.selectionOverlay) return true;
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        return materials.length > 0 && materials.every((material) => material && material.transparent && material.opacity === 0);
    };

    const collectMeshes = (root, out) => {
        root?.traverse?.((node) => {
            if (!(node.isMesh || node.isSkinnedMesh)) return;
            if (!node.visible || isInvisibleHitNode(node)) return;
            out.push(node);
        });
    };

    const findSelectableRootForHit = (hitObject) => {
        let cursor = hitObject;
        while (cursor) {
            if (targetByRoot.has(cursor)) return cursor;
            cursor = cursor.parent;
        }
        return null;
    };

    const registerTarget = (root, options = {}) => {
        if (!root) return null;
        const existing = targetByRoot.get(root);
        if (existing) {
            Object.assign(existing, options);
            return existing;
        }
        const target = {
            id: idSeed++,
            root,
            type: options.type || root.userData?.selectableType || 'object'
        };
        root.userData.hitTestTargetId = target.id;
        targets.push(target);
        targetByRoot.set(root, target);
        return target;
    };

    const unregisterTargets = (predicate) => {
        for (let i = targets.length - 1; i >= 0; i--) {
            const target = targets[i];
            if (!predicate(target)) continue;
            targetByRoot.delete(target.root);
            targets.splice(i, 1);
        }
    };

    const query = (clientX, clientY) => {
        const { width, height } = getViewportSize();
        mouse.x = (clientX / width) * 2 - 1;
        mouse.y = -(clientY / height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);

        const allMeshes = [];
        targets.forEach((target) => {
            if (!target.root?.parent) return;
            collectMeshes(target.root, allMeshes);
        });
        if (allMeshes.length === 0) return null;

        const hits = raycaster.intersectObjects(allMeshes, true);
        if (hits.length === 0) return null;

        for (let i = 0; i < hits.length; i++) {
            const hit = hits[i];
            const root = findSelectableRootForHit(hit.object);
            if (!root) continue;
            return {
                object: root,
                target: targetByRoot.get(root) || null,
                hitPoint: hit.point ? hit.point.clone() : null,
                distance: hit.distance,
                mode: 'mesh'
            };
        }
        return null;
    };

    const getTarget = (root) => targetByRoot.get(root) || null;

    const getInteractionBox = (root) => {
        if (!root) return null;
        const tightBox = new THREE.Box3();
        root.traverse((child) => {
            if (!(child.isMesh || child.isSkinnedMesh)) return;
            if (!child.visible || isInvisibleHitNode(child) || !child.geometry) return;
            if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
            if (!child.geometry.boundingBox) return;
            meshBox.copy(child.geometry.boundingBox);
            meshBox.applyMatrix4(child.matrixWorld);
            tightBox.union(meshBox);
        });
        if (!tightBox.isEmpty()) return tightBox;
        const fallbackBox = new THREE.Box3().setFromObject(root);
        return fallbackBox.isEmpty() ? null : fallbackBox;
    };

    const getSelectableFocusPoint = (root) => {
        const box = getInteractionBox(root);
        if (!box) return null;
        const center = new THREE.Vector3();
        box.getCenter(center);
        return center;
    };

    return {
        registerTarget,
        unregisterTargets,
        query,
        getTarget,
        getInteractionBox,
        getSelectableFocusPoint
    };
};
