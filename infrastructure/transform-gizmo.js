// Rhino 风格 Transform Gizmo：仅对用户上传对象（registry record.source === 'managed'）显示
// 三轴平移箭头 + 三轴旋转圆环；按住把手拖动改 root.position / root.rotation；
// 松手后通过 worldState.upsertWorldObject 回写位姿。
// pointer-lock 锁定时仍显示 gizmo：用屏幕中心准星做命中检测，
// 拖拽过程用 movementX/Y 累积虚拟坐标，避免依赖光标可见。

const AXIS_COLORS = { x: 0xff3b3b, y: 0x3bd166, z: 0x3b8bff };
const HANDLE_OPACITY = 0.95;
// Gizmo 在单位尺度下构建（axisLen=1），实际渲染时按相机距离缩放，
// 让 gizmo 在屏幕上始终保持差不多大小，与对象 bbox 无关。
const SCREEN_SIZE_FACTOR = 0.12; // 距离相机 d 时，gizmo 大小 = d * factor
const SCREEN_SIZE_MIN = 0.05;

// 单位尺度（axisLen = 1）下的几何参数
const TR_SHAFT_LEN = 0.85;
const TR_CONE_LEN = 0.22;
const TR_SHAFT_RADIUS = 0.028;     // 视觉 — 加粗一倍
const TR_CONE_RADIUS = 0.10;       // 视觉 — 箭头加大
const TR_COLLIDER_RADIUS = 0.18;   // 命中范围 — 比视觉宽，方便点击
const RO_RADIUS = 0.85;
const RO_TUBE = 0.036;             // 视觉环加粗一倍
const RO_COLLIDER_TUBE = 0.14;     // 命中粗环

const axisDir = (axis, THREE) => {
    if (axis === 'x') return new THREE.Vector3(1, 0, 0);
    if (axis === 'y') return new THREE.Vector3(0, 1, 0);
    return new THREE.Vector3(0, 0, 1);
};

export const createTransformGizmo = ({
    THREE,
    scene,
    camera,
    domElement,
    selectionStore,
    sceneObjectRegistry,
    worldState,
    getInteractionBox,
    isPointerLocked
}) => {
    const gizmoRoot = new THREE.Group();
    gizmoRoot.name = 'transform-gizmo-root';
    gizmoRoot.visible = false;
    gizmoRoot.renderOrder = 90;
    gizmoRoot.userData.selectionOverlay = true;
    scene.add(gizmoRoot);

    const handleMeshes = []; // 用于 raycaster.intersectObjects
    let currentTarget = null;
    let drag = null;
    let rafId = null;

    const isMovable = (root) => {
        if (!root) return false;
        const id = sceneObjectRegistry.getWorldObjectIdByRoot(root);
        if (!id) return false;
        const record = sceneObjectRegistry.getByWorldObjectId(id);
        if (!record || record.source !== 'managed') return false;
        return Boolean(worldState.getWorldObjectById?.(id));
    };

    const disposeChildren = () => {
        const toRemove = [...gizmoRoot.children];
        toRemove.forEach((child) => {
            gizmoRoot.remove(child);
            child.traverse?.((node) => {
                if (node.geometry) node.geometry.dispose?.();
                const mats = Array.isArray(node.material) ? node.material : [node.material];
                mats.forEach((m) => m && m.dispose?.());
            });
        });
        handleMeshes.length = 0;
    };

    const buildHandleMaterial = (color) => new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: HANDLE_OPACITY,
        depthTest: false,
        depthWrite: false,
        toneMapped: false
    });

    const buildColliderMaterial = () => new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false
    });

    const tagOverlay = (mesh) => {
        mesh.traverse((node) => {
            node.userData = { ...node.userData, selectionOverlay: true };
            node.renderOrder = 91;
        });
    };

    const buildTranslateHandle = (axis) => {
        const group = new THREE.Group();
        group.name = `gizmo-translate-${axis}`;
        const color = AXIS_COLORS[axis];
        const visualMeshes = [];

        const shaftGeo = new THREE.CylinderGeometry(TR_SHAFT_RADIUS, TR_SHAFT_RADIUS, TR_SHAFT_LEN, 12);
        const shaft = new THREE.Mesh(shaftGeo, buildHandleMaterial(color));
        shaft.position.y = TR_SHAFT_LEN / 2;
        group.add(shaft);
        visualMeshes.push(shaft);

        const coneGeo = new THREE.ConeGeometry(TR_CONE_RADIUS, TR_CONE_LEN, 16);
        const cone = new THREE.Mesh(coneGeo, buildHandleMaterial(color));
        cone.position.y = TR_SHAFT_LEN + TR_CONE_LEN / 2;
        group.add(cone);
        visualMeshes.push(cone);

        const colliderLen = TR_SHAFT_LEN + TR_CONE_LEN;
        const colliderGeo = new THREE.CylinderGeometry(TR_COLLIDER_RADIUS, TR_COLLIDER_RADIUS, colliderLen, 10);
        const collider = new THREE.Mesh(colliderGeo, buildColliderMaterial());
        collider.position.y = colliderLen / 2;
        group.add(collider);

        // 把手默认沿 +Y；按 axis 旋到目标方向
        if (axis === 'x') group.rotation.z = -Math.PI / 2;
        else if (axis === 'z') group.rotation.x = Math.PI / 2;

        group.userData.gizmoHandle = { mode: 'translate', axis, color, visualMeshes };
        tagOverlay(group);
        handleMeshes.push(group);
        return group;
    };

    const buildRotateHandle = (axis) => {
        const group = new THREE.Group();
        group.name = `gizmo-rotate-${axis}`;
        const color = AXIS_COLORS[axis];
        const visualMeshes = [];

        const torusGeo = new THREE.TorusGeometry(RO_RADIUS, RO_TUBE, 12, 64);
        const torus = new THREE.Mesh(torusGeo, buildHandleMaterial(color));
        group.add(torus);
        visualMeshes.push(torus);

        const colliderGeo = new THREE.TorusGeometry(RO_RADIUS, RO_COLLIDER_TUBE, 8, 48);
        const collider = new THREE.Mesh(colliderGeo, buildColliderMaterial());
        group.add(collider);

        // Torus 默认在 XY 平面（法线 +Z）；按轴旋成对应法线
        if (axis === 'x') group.rotation.y = Math.PI / 2;
        else if (axis === 'y') group.rotation.x = Math.PI / 2;
        // axis === 'z' 不旋转

        group.userData.gizmoHandle = { mode: 'rotate', axis, color, visualMeshes };
        tagOverlay(group);
        handleMeshes.push(group);
        return group;
    };

    const buildForTarget = (root) => {
        disposeChildren();
        const box = getInteractionBox(root);
        if (!box) return false;
        ['x', 'y', 'z'].forEach((axis) => {
            gizmoRoot.add(buildTranslateHandle(axis));
            gizmoRoot.add(buildRotateHandle(axis));
        });
        return true;
    };

    // 按相机距离动态缩放，保持屏幕尺寸恒定
    const computeScreenScale = () => {
        const d = camera.position.distanceTo(gizmoRoot.position);
        return Math.max(d * SCREEN_SIZE_FACTOR, SCREEN_SIZE_MIN);
    };

    const updateGizmoPosition = () => {
        if (!currentTarget) return;
        const box = getInteractionBox(currentTarget);
        if (!box) return;
        const center = new THREE.Vector3();
        box.getCenter(center);
        gizmoRoot.position.copy(center);
        gizmoRoot.rotation.set(0, 0, 0); // 世界对齐
        const s = computeScreenScale();
        gizmoRoot.scale.setScalar(s);
    };

    const showFor = (root) => {
        if (!buildForTarget(root)) {
            gizmoRoot.visible = false;
            currentTarget = null;
            return;
        }
        currentTarget = root;
        updateGizmoPosition();
        gizmoRoot.visible = true;
    };

    const hide = () => {
        if (hoveredHandle) {
            setHandleHover(hoveredHandle, false);
            hoveredHandle = null;
        }
        gizmoRoot.visible = false;
        currentTarget = null;
        disposeChildren();
    };

    const evaluateSelection = () => {
        const state = selectionStore.getState();
        if (!state.root || !isMovable(state.root)) {
            hide();
            return;
        }
        if (currentTarget !== state.root) {
            showFor(state.root);
        } else {
            updateGizmoPosition();
        }
    };

    const unsubscribe = selectionStore.subscribe(() => evaluateSelection());

    const onPointerLockChange = () => evaluateSelection();
    document.addEventListener('pointerlockchange', onPointerLockChange);

    // 每帧同步 gizmo 位置（对象可能因外部动画移动）
    const tick = () => {
        rafId = requestAnimationFrame(tick);
        if (gizmoRoot.visible && currentTarget && !drag) {
            updateGizmoPosition();
        }
    };
    rafId = requestAnimationFrame(tick);

    // ========== 命中检测 ==========
    const handleRaycaster = new THREE.Raycaster();
    handleRaycaster.params.Line.threshold = 0.1;
    const ndc = new THREE.Vector2();

    const pickHandle = (clientX, clientY) => {
        if (!gizmoRoot.visible || handleMeshes.length === 0) return null;
        ndc.x = (clientX / window.innerWidth) * 2 - 1;
        ndc.y = -(clientY / window.innerHeight) * 2 + 1;
        handleRaycaster.setFromCamera(ndc, camera);
        const hits = handleRaycaster.intersectObjects(handleMeshes, true);
        for (const hit of hits) {
            let cur = hit.object;
            while (cur && !cur.userData?.gizmoHandle) cur = cur.parent;
            if (cur) return { handle: cur, hitPoint: hit.point.clone() };
        }
        return null;
    };

    // ========== 拖拽数学辅助 ==========
    const computeAxisParam = (rayOrigin, rayDir, linePoint, lineDir) => {
        // 鼠标射线 与 轴线 最近距离参数 t（沿 lineDir 方向）
        // 公式：t = (w0·a - (a·d)*(w0·d)) / (1 - (a·d)^2)
        // 其中 w0 = rayOrigin - linePoint，a = lineDir，d = rayDir
        const w0 = new THREE.Vector3().subVectors(rayOrigin, linePoint);
        const b = lineDir.dot(rayDir);
        const denom = 1 - b * b;
        if (Math.abs(denom) < 1e-6) return null; // 视线与轴几乎平行
        const wDotD = w0.dot(rayDir);
        const wDotA = w0.dot(lineDir);
        return (wDotA - b * wDotD) / denom;
    };

    const computeRotationAngle = (rayOrigin, rayDir, planePoint, planeNormal, basisU, basisV) => {
        // 求射线与平面交点
        const denom = rayDir.dot(planeNormal);
        if (Math.abs(denom) < 1e-6) return null;
        const t = new THREE.Vector3().subVectors(planePoint, rayOrigin).dot(planeNormal) / denom;
        if (t <= 0) return null;
        const q = new THREE.Vector3().copy(rayDir).multiplyScalar(t).add(rayOrigin);
        const local = q.sub(planePoint);
        return Math.atan2(local.dot(basisV), local.dot(basisU));
    };

    const buildOrthoBasis = (normal) => {
        // 给定平面法线，构造平面内正交基 (u, v)
        const tmp = Math.abs(normal.x) < 0.9
            ? new THREE.Vector3(1, 0, 0)
            : new THREE.Vector3(0, 1, 0);
        const u = new THREE.Vector3().crossVectors(tmp, normal).normalize();
        const v = new THREE.Vector3().crossVectors(normal, u).normalize();
        return { u, v };
    };

    const setRayFromClient = (clientX, clientY) => {
        ndc.x = (clientX / window.innerWidth) * 2 - 1;
        ndc.y = -(clientY / window.innerHeight) * 2 + 1;
        handleRaycaster.setFromCamera(ndc, camera);
        return handleRaycaster.ray;
    };

    // ========== Hover 高亮 ==========
    const HOVER_COLOR = 0xffff66; // 鲜亮黄
    let hoveredHandle = null;

    const setHandleHover = (handle, hovered) => {
        const meta = handle?.userData?.gizmoHandle;
        if (!meta || !meta.visualMeshes) return;
        const targetColor = hovered ? HOVER_COLOR : meta.color;
        meta.visualMeshes.forEach((mesh) => {
            mesh.material.color.setHex(targetColor);
            mesh.scale.setScalar(hovered ? 1.25 : 1.0);
        });
    };

    const updateHover = (clientX, clientY) => {
        if (drag) return; // 拖拽中不更新 hover
        const picked = pickHandle(clientX, clientY);
        const next = picked?.handle || null;
        if (next === hoveredHandle) return;
        if (hoveredHandle) setHandleHover(hoveredHandle, false);
        hoveredHandle = next;
        if (hoveredHandle) setHandleHover(hoveredHandle, true);
    };

    const onHoverMove = (e) => {
        if (!gizmoRoot.visible || isPointerLocked()) return;
        updateHover(e.clientX, e.clientY);
    };
    window.addEventListener('pointermove', onHoverMove, { passive: true });

    // ========== 事件处理 ==========
    // 锁定模式下没有真实 clientX/Y（光标停在屏幕中心），用累积的虚拟坐标。
    let virtualX = 0;
    let virtualY = 0;

    const onPointerDown = (e) => {
        if (e.button !== 0) return;
        if (drag) return; // 防止 domElement + window 双监听重复触发
        if (!currentTarget) return;
        // 锁定模式下用屏幕中心做命中（与主选中流程一致）；解锁则用真实坐标。
        if (isPointerLocked()) {
            virtualX = window.innerWidth / 2;
            virtualY = window.innerHeight / 2;
        } else {
            virtualX = e.clientX;
            virtualY = e.clientY;
        }
        const picked = pickHandle(virtualX, virtualY);
        if (!picked) return;

        e.stopImmediatePropagation();
        e.preventDefault();

        const { mode, axis } = picked.handle.userData.gizmoHandle;
        const ray = setRayFromClient(virtualX, virtualY);
        const aWorld = axisDir(axis, THREE);

        const dragInit = {
            mode,
            axis,
            axisWorld: aWorld,
            initialPosition: currentTarget.position.clone(),
            initialQuaternion: currentTarget.quaternion.clone(),
            pointerId: e.pointerId
        };

        if (mode === 'translate') {
            const t0 = computeAxisParam(ray.origin, ray.direction, dragInit.initialPosition, aWorld);
            if (t0 == null) return;
            dragInit.t0 = t0;
        } else {
            const center = gizmoRoot.position.clone();
            const { u, v } = buildOrthoBasis(aWorld);
            dragInit.center = center;
            dragInit.basisU = u;
            dragInit.basisV = v;
            const theta0 = computeRotationAngle(ray.origin, ray.direction, center, aWorld, u, v);
            if (theta0 == null) return;
            dragInit.theta0 = theta0;
        }

        drag = dragInit;
        window.__gizmoDragging__ = true;
        // 即使用户只是单击不拖动，本次 pointerup 也不应触发主选中流程。
        window.__gizmoConsumedPointerUp__ = true;
        try {
            // 在事件实际 target 上 capture，避免 target 不是 domElement 时抛错
            e.target?.setPointerCapture?.(e.pointerId);
        } catch (_) { /* ignore */ }

        window.addEventListener('pointermove', onPointerMove, { capture: true });
        window.addEventListener('pointerup', onPointerUp, { capture: true });
        window.addEventListener('pointercancel', onPointerUp, { capture: true });
    };

    const onPointerMove = (e) => {
        if (!drag || !currentTarget) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        if (isPointerLocked()) {
            virtualX += e.movementX || 0;
            virtualY += e.movementY || 0;
        } else {
            virtualX = e.clientX;
            virtualY = e.clientY;
        }
        const ray = setRayFromClient(virtualX, virtualY);

        if (drag.mode === 'translate') {
            const t1 = computeAxisParam(ray.origin, ray.direction, drag.initialPosition, drag.axisWorld);
            if (t1 == null) return;
            const delta = t1 - drag.t0;
            currentTarget.position.copy(drag.initialPosition).addScaledVector(drag.axisWorld, delta);
        } else {
            const theta1 = computeRotationAngle(ray.origin, ray.direction, drag.center, drag.axisWorld, drag.basisU, drag.basisV);
            if (theta1 == null) return;
            const dTheta = theta1 - drag.theta0;
            const dq = new THREE.Quaternion().setFromAxisAngle(drag.axisWorld, dTheta);
            currentTarget.quaternion.copy(drag.initialQuaternion).premultiply(dq);
        }

        currentTarget.updateMatrixWorld(true);
        updateGizmoPosition();
        selectionStore.touch();
    };

    const onPointerUp = (e) => {
        if (!drag) return;
        e.stopImmediatePropagation?.();
        e.preventDefault?.();
        const root = currentTarget;
        try {
            domElement.releasePointerCapture?.(drag.pointerId);
        } catch (_) { /* ignore */ }
        window.removeEventListener('pointermove', onPointerMove, { capture: true });
        window.removeEventListener('pointerup', onPointerUp, { capture: true });
        window.removeEventListener('pointercancel', onPointerUp, { capture: true });
        drag = null;
        // 拖拽结束后，让本次 pointerup 不再触发主选中流程；下一帧再清掉。
        setTimeout(() => {
            window.__gizmoDragging__ = false;
            window.__gizmoConsumedPointerUp__ = false;
        }, 0);

        if (root) {
            const id = sceneObjectRegistry.getWorldObjectIdByRoot(root);
            const wo = id ? worldState.getWorldObjectById?.(id) : null;
            if (wo && worldState.upsertWorldObject) {
                worldState.upsertWorldObject({
                    ...wo,
                    position: { x: root.position.x, y: root.position.y, z: root.position.z },
                    rotation: { x: root.rotation.x, y: root.rotation.y, z: root.rotation.z }
                });
            }
        }
    };

    domElement.addEventListener('pointerdown', onPointerDown, { capture: true });
    // 同时挂到 window 捕获阶段：当事件 target 不是 bgCanvas（被前景 canvas/UI 拦截）时
    // 也能在最早期接管，确保点击 gizmo 把手永远生效。
    window.addEventListener('pointerdown', onPointerDown, { capture: true });

    // 暴露给外部（talkinghead.js 的 requestScenePointerLock）：
    // 解锁状态下，如果点击命中 gizmo 把手就不要重新锁定。
    window.__gizmoHandleAt = (clientX, clientY) => Boolean(pickHandle(clientX, clientY));

    return {
        dispose() {
            unsubscribe();
            document.removeEventListener('pointerlockchange', onPointerLockChange);
            domElement.removeEventListener('pointerdown', onPointerDown, { capture: true });
            window.removeEventListener('pointerdown', onPointerDown, { capture: true });
            window.removeEventListener('pointermove', onHoverMove);
            window.removeEventListener('pointermove', onPointerMove, { capture: true });
            window.removeEventListener('pointerup', onPointerUp, { capture: true });
            window.removeEventListener('pointercancel', onPointerUp, { capture: true });
            if (rafId) cancelAnimationFrame(rafId);
            disposeChildren();
            gizmoRoot.removeFromParent();
            if (window.__gizmoHandleAt) delete window.__gizmoHandleAt;
        }
    };
};
