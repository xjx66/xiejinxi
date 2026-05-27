export const createPickingSystem = ({
    THREE,
    camera,
    getViewportSize,
    collisionDebugGroup = null,
    getCollisionDebugToggle = () => null,
    debugLogger = { emit() {} }
}) => {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const targets = [];
    const targetByRoot = new Map();
    const spatialIndex = new Map();
    const HIT_TEST_CELL_SIZE = 90;
    const HIT_TEST_MAX_DISTANCE = 5200;
    let spatialVersion = 0;
    const samplePoint = new THREE.Vector3();
    const projectedPoint = new THREE.Vector3();
    const boxCenter = new THREE.Vector3();
    const boxSize = new THREE.Vector3();
    const meshBounds = new THREE.Box3();
    const candidatesSeen = new Set();
    const collisionDebugHelpers = new Map();
    let idSeed = 1;
    let collisionDebugEnabled = false;

    const getCellKey = (x, z) => `${x},${z}`;
    const markSpatialDirty = () => {
        spatialVersion++;
    };
    const isInvisibleHitNode = (node) => {
        if (!node) return true;
        if (node.userData?.selectionOverlay) return true;
        if (typeof node.name === 'string' && (node.name.includes('pick-volume') || node.name.includes('hit-box'))) return true;
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        return materials.length > 0 && materials.every((material) => material && material.transparent && material.opacity === 0);
    };
    const collectPreciseHitMeshes = (root) => {
        const meshes = [];
        root?.traverse((node) => {
            if (!(node.isMesh || node.isSkinnedMesh)) return;
            if (!node.visible || isInvisibleHitNode(node)) return;
            meshes.push(node);
        });
        return meshes;
    };
    const getProjectedRadiusPx = (sphere) => {
        const { height } = getViewportSize();
        const distance = Math.max(1, camera.position.distanceTo(sphere.center));
        const fov = THREE.MathUtils.degToRad(camera.fov);
        const pixelsPerWorld = height / (2 * Math.tan(fov * 0.5) * distance);
        return sphere.radius * pixelsPerWorld;
    };
    const updateTargetBounds = (target, force = false) => {
        if (!target?.root) return null;
        if (!force && !target.dynamic && target.boundsVersion === spatialVersion && target.worldBox && !target.worldBox.isEmpty()) {
            return target;
        }
        const worldBox = target.worldBox || new THREE.Box3();
        worldBox.makeEmpty();
        const customWorldBox = target.getWorldBox?.();
        if (customWorldBox && !customWorldBox.isEmpty()) {
            worldBox.copy(customWorldBox);
        }
        const colliderObject = target.getColliderObject?.() || null;
        const preciseRoots = target.getPreciseRoots?.() || [target.root];
        if (worldBox.isEmpty()) {
            preciseRoots.forEach((root) => {
                root?.traverse((node) => {
                    if (!(node.isMesh || node.isSkinnedMesh)) return;
                    if (!node.visible || isInvisibleHitNode(node) || !node.geometry) return;
                    if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
                    if (!node.geometry.boundingBox) return;
                    meshBounds.copy(node.geometry.boundingBox);
                    meshBounds.applyMatrix4(node.matrixWorld);
                    worldBox.union(meshBounds);
                });
            });
        }
        if (target.hasExplicitCollider && colliderObject && colliderObject !== target.root) {
            meshBounds.setFromObject(colliderObject);
            if (!meshBounds.isEmpty()) worldBox.union(meshBounds);
        }
        if (worldBox.isEmpty()) worldBox.setFromObject(colliderObject || target.root);
        if (worldBox.isEmpty()) return null;
        const worldSphere = target.worldSphere || new THREE.Sphere();
        worldBox.getBoundingSphere(worldSphere);
        worldBox.getCenter(boxCenter);
        worldBox.getSize(boxSize);
        target.worldBox = worldBox.clone();
        target.worldSphere = worldSphere.clone();
        target.center = boxCenter.clone();
        target.size = boxSize.clone();
        target.boundsVersion = spatialVersion;
        return target;
    };
    const rebuildSpatialIndex = () => {
        spatialIndex.clear();
        targets.forEach((target) => {
            if (!target.root?.parent) return;
            if (!updateTargetBounds(target, true)) return;
            const minCellX = Math.floor(target.worldBox.min.x / HIT_TEST_CELL_SIZE);
            const maxCellX = Math.floor(target.worldBox.max.x / HIT_TEST_CELL_SIZE);
            const minCellZ = Math.floor(target.worldBox.min.z / HIT_TEST_CELL_SIZE);
            const maxCellZ = Math.floor(target.worldBox.max.z / HIT_TEST_CELL_SIZE);
            for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
                for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
                    const key = getCellKey(cellX, cellZ);
                    if (!spatialIndex.has(key)) spatialIndex.set(key, []);
                    spatialIndex.get(key).push(target);
                }
            }
        });
    };
    const unregisterTargets = (predicate) => {
        for (let i = targets.length - 1; i >= 0; i--) {
            const target = targets[i];
            if (!predicate(target)) continue;
            targetByRoot.delete(target.root);
            targets.splice(i, 1);
        }
        markSpatialDirty();
    };
    const registerTarget = (root, options = {}) => {
        if (!root) return null;
        const existing = targetByRoot.get(root);
        if (existing) {
            Object.assign(existing, options);
            markSpatialDirty();
            debugLogger.emit({
                sessionId: 'hit-selection-accuracy',
                runId: 'refactor',
                hypothesisId: 'picking-system',
                location: 'picking-system:registerTarget:update',
                msg: '[DEBUG] hit target updated',
                data: {
                    rootName: root?.name || null,
                    worldObjectId: root?.userData?.worldObjectId || null,
                    type: existing?.type || null
                }
            });
            return existing;
        }
        const target = {
            id: idSeed++,
            root,
            type: options.type || root.userData?.selectableType || 'object',
            dynamic: Boolean(options.dynamic),
            selectionBias: options.selectionBias || 0,
            nearDistance: options.nearDistance ?? 240,
            midDistance: options.midDistance ?? 620,
            farScreenPadding: options.farScreenPadding ?? 16,
            screenPadding: options.screenPadding ?? 12,
            colliderScreenPadding: options.colliderScreenPadding ?? null,
            colliderScreenFactor: options.colliderScreenFactor ?? null,
            getWorldBox: options.getWorldBox || null,
            getColliderObject: options.getColliderObject || (() => root),
            hasExplicitCollider: typeof options.getColliderObject === 'function',
            getPreciseRoots: options.getPreciseRoots || (() => [root]),
            worldBox: null,
            worldSphere: null,
            boundsVersion: -1
        };
        root.userData.hitTestTargetId = target.id;
        targets.push(target);
        targetByRoot.set(root, target);
        markSpatialDirty();
        debugLogger.emit({
            sessionId: 'hit-selection-accuracy',
            runId: 'refactor',
            hypothesisId: 'picking-system',
            location: 'picking-system:registerTarget:create',
            msg: '[DEBUG] hit target created',
            data: {
                rootName: root?.name || null,
                worldObjectId: root?.userData?.worldObjectId || null,
                type: target?.type || null
            }
        });
        return target;
    };
    const getCollisionDebugColor = (type) => {
        if (type === 'avatar') return 0x7ef2ff;
        if (type === 'product') return 0xffd36b;
        if (type === 'painting') return 0xaed0ff;
        if (type === 'tree') return 0x91ffc5;
        return 0xffffff;
    };
    const refreshCollisionDebugHelpers = () => {
        if (!collisionDebugEnabled || !collisionDebugGroup) return;
        rebuildSpatialIndex();
        const liveIds = new Set();
        targets.forEach((target) => {
            if (!target.root?.parent) return;
            if (!updateTargetBounds(target, true)) return;
            liveIds.add(target.id);
            let helper = collisionDebugHelpers.get(target.id);
            if (!helper) {
                helper = new THREE.Box3Helper(target.worldBox.clone(), getCollisionDebugColor(target.type));
                helper.userData.hitTargetId = target.id;
                collisionDebugHelpers.set(target.id, helper);
                collisionDebugGroup.add(helper);
            }
            helper.box.copy(target.worldBox);
            helper.visible = true;
        });
        Array.from(collisionDebugHelpers.entries()).forEach(([id, helper]) => {
            if (liveIds.has(id)) return;
            collisionDebugGroup.remove(helper);
            collisionDebugHelpers.delete(id);
        });
    };
    const setCollisionDebugEnabled = (enabled) => {
        collisionDebugEnabled = enabled;
        if (collisionDebugGroup) collisionDebugGroup.visible = enabled;
        const toggle = getCollisionDebugToggle();
        if (toggle) {
            toggle.textContent = enabled ? 'Collision On' : 'Collision Off';
            toggle.classList.toggle('is-active', enabled);
        }
        if (enabled) refreshCollisionDebugHelpers();
    };
    const isCollisionDebugEnabled = () => collisionDebugEnabled;
    const getRaySpatialCandidates = (ray, types = null) => {
        rebuildSpatialIndex();
        const candidates = [];
        targets.forEach((target) => {
            if (!target.root?.parent) return;
            if (types && !types.includes(target.type)) return;
            candidates.push(target);
        });
        return candidates;
    };
    const evaluateTarget = (target, clientX, clientY) => {
        if (!target?.root?.parent) return null;
        if (!updateTargetBounds(target, target.dynamic)) return null;
        const cameraDistance = camera.position.distanceTo(target.worldSphere.center);
        const lod = cameraDistance <= target.nearDistance ? 'near' : cameraDistance <= target.midDistance ? 'mid' : 'far';
        const preciseRoots = target.getPreciseRoots?.() || [target.root];
        let preciseDistance = Number.POSITIVE_INFINITY;
        let preciseHit = null;
        const preciseMeshes = [];
        preciseRoots.forEach((root) => {
            collectPreciseHitMeshes(root).forEach((mesh) => preciseMeshes.push(mesh));
        });
        if (preciseMeshes.length > 0) {
            const hits = raycaster.intersectObjects(preciseMeshes, true);
            if (hits.length > 0) {
                preciseHit = hits[0];
                preciseDistance = preciseHit.distance;
            }
        }
        projectedPoint.copy(target.worldSphere.center).project(camera);
        const projectedRadiusPx = getProjectedRadiusPx(target.worldSphere);
        const { width, height } = getViewportSize();
        const screenX = (projectedPoint.x * 0.5 + 0.5) * width;
        const screenY = (projectedPoint.y * -0.5 + 0.5) * height;
        const centerScreenDistance = Math.hypot(screenX - clientX, screenY - clientY);
        let colliderDistance = Number.POSITIVE_INFINITY;
        let colliderPoint = null;
        const colliderObject = target.getColliderObject?.();
        if (colliderObject) {
            const colliderHits = raycaster.intersectObject(colliderObject, true);
            if (colliderHits.length > 0) {
                colliderDistance = colliderHits[0].distance;
                colliderPoint = colliderHits[0].point?.clone?.() || null;
            }
        }
        // #region debug-point product-evaluate
        if (target.type === 'product' && window.__DEBUG_PRODUCT_PICKING__) {
            const colliderBox = colliderObject ? new THREE.Box3().setFromObject(colliderObject) : null;
            const colliderSize = colliderBox && !colliderBox.isEmpty() ? new THREE.Vector3() : null;
            if (colliderBox && colliderSize) colliderBox.getSize(colliderSize);
            fetch('http://127.0.0.1:4321/logs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: 'product-picking-angle',
                    runId: window.__DEBUG_PRODUCT_PICKING_RUN_ID__ || 'pre-fix',
                    hypothesisId: 'H1-H4',
                    location: 'picking-system:evaluateTarget:product',
                    msg: '[DEBUG] product target evaluated',
                    data: {
                        clientX,
                        clientY,
                        rootName: target.root?.name || null,
                        worldObjectId: target.root?.userData?.worldObjectId || null,
                        cameraDistance,
                        lod,
                        hasColliderObject: Boolean(colliderObject),
                        colliderName: colliderObject?.name || null,
                        colliderHasParent: Boolean(colliderObject?.parent),
                        colliderSize: colliderSize ? { x: colliderSize.x, y: colliderSize.y, z: colliderSize.z } : null,
                        worldBox: target.worldBox ? {
                            min: { x: target.worldBox.min.x, y: target.worldBox.min.y, z: target.worldBox.min.z },
                            max: { x: target.worldBox.max.x, y: target.worldBox.max.y, z: target.worldBox.max.z }
                        } : null,
                        preciseDistance: Number.isFinite(preciseDistance) ? preciseDistance : null,
                        colliderDistance: Number.isFinite(colliderDistance) ? colliderDistance : null
                    },
                    ts: Date.now()
                })
            }).catch(() => {});
        }
        // #endregion
        if (!Number.isFinite(preciseDistance) && !Number.isFinite(colliderDistance)) return null;
        let mode = 'collider';
        let distance = colliderDistance;
        let score = colliderDistance + centerScreenDistance * 0.08 + (lod === 'far' ? 10 : 2) - target.selectionBias;
        let hitPoint = target.center.clone();
        if (Number.isFinite(preciseDistance)) {
            mode = 'precise';
            distance = preciseDistance;
            score = preciseDistance - target.selectionBias;
            hitPoint = preciseHit?.point?.clone?.() || hitPoint;
        } else if (Number.isFinite(colliderDistance)) {
            hitPoint = colliderPoint?.clone?.() || hitPoint;
        }
        projectedPoint.copy(hitPoint).project(camera);
        const hitScreenX = (projectedPoint.x * 0.5 + 0.5) * width;
        const hitScreenY = (projectedPoint.y * -0.5 + 0.5) * height;
        const screenDistance = Math.hypot(hitScreenX - clientX, hitScreenY - clientY);
        return {
            target,
            object: target.root,
            mode,
            distance,
            score,
            screenDistance,
            centerScreenDistance,
            projectedRadiusPx,
            lod,
            preciseHit,
            hitPoint
        };
    };
    const query = (clientX, clientY, options = {}) => {
        const { types = null } = options;
        const { width, height } = getViewportSize();
        mouse.x = (clientX / width) * 2 - 1;
        mouse.y = -(clientY / height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const candidates = getRaySpatialCandidates(raycaster.ray, types);
        // #region debug-point product-query-candidates
        if (window.__DEBUG_PRODUCT_PICKING__) {
            const productCandidates = candidates
                .filter((target) => target.type === 'product')
                .map((target) => ({
                    rootName: target.root?.name || null,
                    worldObjectId: target.root?.userData?.worldObjectId || null,
                    hasColliderObject: Boolean(target.getColliderObject?.()),
                    colliderName: target.getColliderObject?.()?.name || null,
                    boundsVersion: target.boundsVersion,
                    hasWorldBox: Boolean(target.worldBox && !target.worldBox.isEmpty?.())
                }));
            fetch('http://127.0.0.1:4321/logs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: 'product-picking-angle',
                    runId: window.__DEBUG_PRODUCT_PICKING_RUN_ID__ || 'pre-fix',
                    hypothesisId: 'H3-H5',
                    location: 'picking-system:query:product-candidates',
                    msg: '[DEBUG] product candidates for pointer query',
                    data: {
                        clientX,
                        clientY,
                        candidateCount: candidates.length,
                        productCandidateCount: productCandidates.length,
                        productCandidates
                    },
                    ts: Date.now()
                })
            }).catch(() => {});
        }
        // #endregion
        const preciseResults = [];
        const colliderResults = [];
        candidates.forEach((target) => {
            const evaluated = evaluateTarget(target, clientX, clientY);
            if (!evaluated) return;
            if (evaluated.mode === 'precise') preciseResults.push(evaluated);
            else colliderResults.push(evaluated);
        });
        // 优先取真实 mesh 命中：precise 命中里距离最近的胜出；
        // 没有任何 precise 命中时再退回 collider hitBox 命中。
        const sortByDistance = (a, b) => {
            if (a.distance !== b.distance) return a.distance - b.distance;
            return a.screenDistance - b.screenDistance;
        };
        preciseResults.sort(sortByDistance);
        colliderResults.sort(sortByDistance);
        const exactResults = preciseResults.length > 0 ? preciseResults : colliderResults;
        const exactWinner = exactResults[0] || null;
        debugLogger.emit({
            sessionId: 'hit-selection-accuracy',
            runId: 'refactor',
            hypothesisId: 'picking-system',
            location: exactWinner ? 'picking-system:query:exact' : 'picking-system:query:null',
            msg: exactWinner ? '[DEBUG] exact nearest winner' : '[DEBUG] no exact hit',
            data: {
                clientX,
                clientY,
                types,
                candidateCount: candidates.length,
                preciseCount: preciseResults.length,
                colliderCount: colliderResults.length,
                winner: exactWinner ? {
                    type: exactWinner.target?.type || null,
                    mode: exactWinner.mode,
                    worldObjectId: exactWinner.object?.userData?.worldObjectId || null,
                    distance: exactWinner.distance,
                    screenDistance: exactWinner.screenDistance
                } : null
            }
        });
        return exactWinner;
    };
    const getTarget = (root) => targetByRoot.get(root) || null;
    const getInteractionBox = (root) => {
        const target = getTarget(root);
        const preciseRoots = target?.getPreciseRoots?.() || [root];
        const tightBox = new THREE.Box3();
        const meshBox = new THREE.Box3();
        preciseRoots.forEach((node) => {
            node?.traverse?.((child) => {
                if (!(child.isMesh || child.isSkinnedMesh)) return;
                if (!child.visible || isInvisibleHitNode(child) || !child.geometry) return;
                if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
                if (!child.geometry.boundingBox) return;
                meshBox.copy(child.geometry.boundingBox);
                meshBox.applyMatrix4(child.matrixWorld);
                tightBox.union(meshBox);
            });
        });
        if (!tightBox.isEmpty()) return tightBox;
        if (!target) {
            const fallbackBox = new THREE.Box3().setFromObject(root);
            return fallbackBox.isEmpty() ? null : fallbackBox;
        }
        if (!updateTargetBounds(target, true)) return null;
        return target.worldBox?.clone?.() || null;
    };
    const getSelectableFocusPoint = (root) => {
        const target = getTarget(root);
        if (target && updateTargetBounds(target, target.dynamic)) {
            return target.worldSphere.center.clone();
        }
        if (root) {
            const fallbackBox = new THREE.Box3().setFromObject(root);
            if (!fallbackBox.isEmpty()) {
                const center = new THREE.Vector3();
                fallbackBox.getCenter(center);
                return center;
            }
        }
        return null;
    };

    return {
        registerTarget,
        unregisterTargets,
        markSpatialDirty,
        refreshCollisionDebugHelpers,
        setCollisionDebugEnabled,
        isCollisionDebugEnabled,
        query,
        updateTargetBounds,
        getTarget,
        getInteractionBox,
        getSelectableFocusPoint
    };
};
