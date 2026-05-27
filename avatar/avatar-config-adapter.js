export const createAvatarRuntimeProfile = ({ config, focusOffsetZ = 40 }) => {
    const worldObjectId = `avatar-${config.key}`;
    const assetId = `asset-avatar-${config.key}`;
    const url = config.url ? `./avatars/${config.url}` : '';

    return {
        key: config.key,
        legacyConfig: config,
        worldObjectId,
        assetId,
        engineType: config.engineType || 'talkinghead',
        engineConfig: {
            url: config.url,
            body: config.body,
            mood: config.mood,
            preserve: config.preserve,
            headOptions: config.headOptions || {},
            headAvatarOptions: config.headAvatarOptions || {},
            cameraYOffset: config.cameraYOffset,
            avatarScale: config.avatarScale
        },
        worldTransform: {
            position: {
                x: config.worldPosition?.x || 0,
                y: config.worldPosition?.y || 0,
                z: config.worldPosition?.z || 0
            },
            rotation: {
                x: config.worldRotation?.x || 0,
                y: config.worldRotation?.y || 0,
                z: config.worldRotation?.z || 0
            },
            focusZ: (config.worldPosition?.z || 0) + (config.focusOffsetZ ?? focusOffsetZ)
        },
        worldSize: {
            width: config.worldSize?.width || 1,
            height: config.worldSize?.height || 1
        },
        hostSize: {
            width: config.hostSize?.width || 600,
            height: config.hostSize?.height || 800
        },
        label: {
            name: config.name,
            status: config.status,
            desc: config.desc || '',
            labelOffset: config.labelOffset,
            dialogueAnchorOffset: config.dialogueAnchorOffset,
            selectionProjectOffset: config.selectionProjectOffset
        },
        interaction: {
            hitTest: config.hitTest || {},
            pickVolumeScale: config.pickVolumeScale || {}
        },
        assetInfo: {
            id: assetId,
            name: config.name,
            kind: 'avatar-template',
            source: 'system',
            type: 'avatar',
            status: config.status,
            desc: config.desc || '',
            engineType: config.engineType,
            url
        },
        capabilities: config.capabilities || {},
        persona: {
            voice: config.voice || null,
            personality: config.personality || ''
        }
    };
};
