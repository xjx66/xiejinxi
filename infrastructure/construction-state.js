// 施工态状态机的可视化：在被编辑对象的 root 上挂一层半透明线框“施工外壳”，
// 表示对象正处于 planning / building / refining / failed；ready / null 时移除外壳。
// 外壳是 root 的子节点，跟随对象位姿，无需引用 scene。文本状态由 AI 面板的 loading 文案承担。

const STATE_STYLE = {
    planning: { color: 0x3b8bff, opacity: 0.55 }, // 蓝：规划
    building: { color: 0xffb020, opacity: 0.75 }, // 琥珀：建造
    refining: { color: 0x3bd166, opacity: 0.6 },  // 绿：细化
    failed: { color: 0xff3b3b, opacity: 0.8 }    // 红：失败
};

const SHELL_KEY = '__constructionShell__';

export const createConstructionState = ({ THREE }) => {
    const computeSize = (root) => {
        // 用包围盒估算外壳尺寸；排除已有外壳自身避免叠加。
        const existing = root.userData?.[SHELL_KEY] || null;
        if (existing) existing.visible = false;
        const box = new THREE.Box3().setFromObject(root);
        if (existing) existing.visible = true;
        if (!box.isEmpty()) {
            const size = new THREE.Vector3();
            box.getSize(size);
            return {
                x: Math.max(size.x, 0.5),
                y: Math.max(size.y, 0.5),
                z: Math.max(size.z, 0.5)
            };
        }
        return { x: 8, y: 8, z: 8 };
    };

    const removeShell = (root) => {
        const shell = root?.userData?.[SHELL_KEY];
        if (!shell) return;
        shell.geometry?.dispose?.();
        shell.material?.dispose?.();
        shell.removeFromParent();
        delete root.userData[SHELL_KEY];
    };

    // set(root, state): state ∈ planning|building|refining|failed|ready|null
    const set = (root, state) => {
        if (!root) return;
        if (!state || state === 'ready') {
            removeShell(root);
            return;
        }
        const style = STATE_STYLE[state] || STATE_STYLE.building;
        const size = computeSize(root);
        let shell = root.userData?.[SHELL_KEY];
        if (!shell) {
            const geo = new THREE.BoxGeometry(1, 1, 1);
            const mat = new THREE.MeshBasicMaterial({
                color: style.color,
                wireframe: true,
                transparent: true,
                opacity: style.opacity,
                depthTest: false,
                toneMapped: false
            });
            shell = new THREE.Mesh(geo, mat);
            shell.name = 'construction-shell';
            shell.renderOrder = 80;
            shell.userData.selectionOverlay = true; // 不参与拾取/选中
            root.userData = root.userData || {};
            root.userData[SHELL_KEY] = shell;
            root.add(shell);
        }
        // 外壳在 root 局部空间；root.scale 会再乘一次，故除掉以贴合真实包围盒。
        shell.scale.set(
            size.x / (root.scale.x || 1),
            size.y / (root.scale.y || 1),
            size.z / (root.scale.z || 1)
        );
        shell.material.color.setHex(style.color);
        shell.material.opacity = style.opacity;
        shell.userData.state = state;
    };

    return { set, clear: (root) => removeShell(root) };
};
