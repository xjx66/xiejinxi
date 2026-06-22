export const DEFAULT_CAPABILITIES = {
    selectable: true,
    editable: true,
    move: false,
    speak: false,
    gesture: false,
    playAnimation: false,
    setVideoPlayback: false,
    editMaterial: false
};

export const normalizeCapabilities = ({ asset, template, worldObject } = {}) => ({
    ...DEFAULT_CAPABILITIES,
    ...(template?.capabilities || {}),
    ...(asset?.capabilities || {}),
    ...(worldObject?.capabilities || {}),
    ...(worldObject?.metadata?.capabilities || {})
});

export const hasCapability = (capabilities, key) => Boolean(capabilities?.[key]);
