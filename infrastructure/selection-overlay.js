const disposeOverlay = (overlayRoot) => {
    if (!overlayRoot) return;
    overlayRoot.traverse((node) => {
        if (node.geometry && typeof node.geometry.dispose === 'function') {
            node.geometry.dispose();
        }
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        materials.forEach((material) => {
            if (material && typeof material.dispose === 'function') {
                material.dispose();
            }
        });
    });
};

export const createSelectionOverlay = ({
    THREE,
    scene,
    selectionStore,
    getInteractionBox,
    getSelectionBoxColor
}) => {
    let overlayRoot = null;

    const clearOverlay = () => {
        if (overlayRoot) {
            overlayRoot.removeFromParent();
            disposeOverlay(overlayRoot);
            overlayRoot = null;
        }
    };

    const createOverlay = (root) => {
        const box = getInteractionBox(root);
        if (!box) return null;
        const helper = new THREE.Box3Helper(box, getSelectionBoxColor(root.userData?.selectableType));
        helper.name = 'selected-interaction-box';
        helper.renderOrder = 80;
        helper.userData.selectionOverlay = true;
        helper.material.depthTest = false;
        helper.material.depthWrite = false;
        helper.material.transparent = true;
        helper.material.opacity = 0.95;
        return helper;
    };

    const unsubscribe = selectionStore.subscribe((state) => {
        clearOverlay();
        if (!state.root) return;
        overlayRoot = createOverlay(state.root);
        if (overlayRoot) scene.add(overlayRoot);
    });

    return {
        dispose() {
            unsubscribe();
            clearOverlay();
        }
    };
};
