import { AVATAR_FLOOR_Y } from './avatar-visual-layer.js';

export const createAvatarWorldEntry = ({
    THREE,
    profile,
    controller,
    label,
    loader,
    fittedSize,
    getLoaded,
    getProgress
}) => {
    const selectableRoot = new THREE.Group();
    selectableRoot.name = `${profile.key}-avatar-selectable`;
    selectableRoot.position.set(
        profile.worldTransform.position.x,
        AVATAR_FLOOR_Y,
        profile.worldTransform.position.z
    );
    selectableRoot.rotation.set(
        profile.worldTransform.rotation.x,
        profile.worldTransform.rotation.y,
        profile.worldTransform.rotation.z
    );
    selectableRoot.add(controller.worldObject);

    const entry = {
        key: profile.key,
        profile,
        config: profile.legacyConfig,
        mesh: selectableRoot,
        controller,
        planeSize: fittedSize,
        label,
        loader,
        isLoaded: getLoaded,
        getProgress
    };

    selectableRoot.userData = {
        ...selectableRoot.userData,
        labelType: 'avatar',
        worldObjectId: profile.worldObjectId,
        labelElement: label,
        labelWorldOffset: profile.label.labelOffset.clone(),
        loaderElement: loader.container,
        loaderText: loader.text,
        getIsLoaded: getLoaded,
        selectableType: 'avatar',
        assetInfo: profile.assetInfo,
        selectableFocusZ: profile.worldTransform.focusZ,
        selectableProjectOffset: profile.label.selectionProjectOffset.clone(),
        dialogueAnchorOffset: profile.label.dialogueAnchorOffset.clone(),
        avatarController: controller,
        avatarConfig: profile.legacyConfig,
        avatarEntryKey: profile.key,
        avatarCapabilities: profile.capabilities,
        capabilities: profile.capabilities,
        avatarPlaneSize: entry.planeSize
    };

    return entry;
};

