import * as THREE from 'three';

export const AVATAR_ASSET_FILES = {
    bot1: 'brunette.glb',
    bot2: 'robot_dreams.glb',
    avatar3: 'avaturn.glb',
    avatar4: 'avatarsdk.glb',
    avatar5: 'mpfb.glb'
};

const avatarSpacing = 30;
const avatarBaseY = 7;
const avatarBaseZ = 0;

const createWorldPosition = (x) => ({ x, y: avatarBaseY, z: avatarBaseZ });
const createLabelOffset = (y = 15) => new THREE.Vector3(0, y, 0);
const createSelectionOffset = (y = 10) => new THREE.Vector3(0, y, 0);
const createAvatarCapabilities = ({ canChat = false, canSpeak = false, canSecondaryAction = false } = {}) => ({
    canChat,
    canSpeak,
    canSecondaryAction
});
const createHitTestConfig = ({
    nearDistance = 320,
    midDistance = 820,
    screenPadding = 18,
    farScreenPadding = 28,
    selectionBias = 12
} = {}) => ({
    nearDistance,
    midDistance,
    screenPadding,
    farScreenPadding,
    selectionBias
});

export const AVATAR_MODELS = [
    {
        key: 'avatar4',
        engineType: 'talkinghead',
        url: AVATAR_ASSET_FILES.avatar4,
        body: 'M',
        mood: 'neutral',
        preserve: false,
        name: '4号',
        status: '已离职',
        voice: null,
        personality: '',
        worldPosition: createWorldPosition(-3 * avatarSpacing),
        worldSize: { width: 13, height: 24 },
        hostSize: { width: 600, height: 800 },
        labelOffset: createLabelOffset(16),
        dialogueAnchorOffset: createLabelOffset(11),
        selectionProjectOffset: createSelectionOffset(9),
        capabilities: createAvatarCapabilities(),
        hitTest: createHitTestConfig({
            nearDistance: 280,
            midDistance: 760,
            screenPadding: 16,
            farScreenPadding: 22,
            selectionBias: 6
        }),
        cameraYOffset: 0.117,
        avatarScale: 0.73,
        desc: ''
    },
    {
        key: 'avatar3',
        engineType: 'talkinghead',
        url: AVATAR_ASSET_FILES.avatar3,
        body: 'M',
        mood: 'neutral',
        preserve: false,
        name: '3号',
        status: '已离职',
        voice: null,
        personality: '',
        worldPosition: createWorldPosition(-2 * avatarSpacing),
        worldSize: { width: 13, height: 24 },
        hostSize: { width: 600, height: 800 },
        labelOffset: createLabelOffset(16),
        dialogueAnchorOffset: createLabelOffset(11),
        selectionProjectOffset: createSelectionOffset(9),
        capabilities: createAvatarCapabilities(),
        hitTest: createHitTestConfig({
            nearDistance: 280,
            midDistance: 760,
            screenPadding: 16,
            farScreenPadding: 22,
            selectionBias: 6
        }),
        cameraYOffset: 0.05,
        avatarScale: 0.73,
        desc: ''
    },
    {
        key: 'jinxi-canvas',
        engineType: 'decals',
        name: 'X',
        status: '在职',
        voice: 'am_michael',
        personality: 'You are X, an intern. When greeted or asked who you are, you MUST reply EXACTLY with: "Hi I am X an intern, bot one and bot two\'s partner.  By the way, scroll your mouse wheel, and you will find a surprise." Always maintain this identity.',
        worldPosition: createWorldPosition(-1 * avatarSpacing),
        worldSize: { width: 14, height: 18 },
        hostSize: { width: 1196, height: 900 },
        labelOffset: createLabelOffset(13),
        dialogueAnchorOffset: createLabelOffset(9),
        selectionProjectOffset: createSelectionOffset(7),
        capabilities: createAvatarCapabilities({
            canSecondaryAction: true
        }),
        hitTest: createHitTestConfig({
            nearDistance: 260,
            midDistance: 700,
            screenPadding: 18,
            farScreenPadding: 24,
            selectionBias: 10
        }),
        desc: ''
    },
    {
        key: 'bot1',
        engineType: 'talkinghead',
        url: AVATAR_ASSET_FILES.bot1,
        body: 'F',
        mood: 'neutral',
        preserve: false,
        name: '博特万',
        status: '在职',
        voice: 'af_bella',
        personality: 'You are Bot1 (Bote Wan). When greeted or asked who you are, you MUST reply EXACTLY with: "Hi! I\'m Bot One, AI work partner of X. How can I help you?  By the way, scroll your mouse wheel, and you will find a surprise." Always maintain this identity.',
        worldPosition: createWorldPosition(0),
        worldSize: { width: 13, height: 24 },
        hostSize: { width: 600, height: 800 },
        labelOffset: createLabelOffset(16),
        dialogueAnchorOffset: createLabelOffset(11),
        selectionProjectOffset: createSelectionOffset(9),
        capabilities: createAvatarCapabilities({
            canChat: true,
            canSpeak: true
        }),
        hitTest: createHitTestConfig({
            nearDistance: 360,
            midDistance: 920,
            screenPadding: 26,
            farScreenPadding: 34,
            selectionBias: 24
        }),
        avatarScale: 0.73,
        desc: ''
    },
    {
        key: 'bot2',
        engineType: 'talkinghead',
        url: AVATAR_ASSET_FILES.bot2,
        body: 'F',
        mood: 'robot',
        preserve: true,
        name: '博特兔',
        status: '在职',
        voice: 'am_adam',
        personality: 'You are Bot two. When greeted or asked who you are, you MUST reply EXACTLY with: "Hi! I\'m Bot two—not Bot One, but just as helpful! What\'s up? I team up with X, who\'s basically the carrot to my rabbit! By the way, scroll your mouse wheel, and you will find a surprise." Always maintain this identity.',
        worldPosition: createWorldPosition(1 * avatarSpacing),
        worldSize: { width: 13, height: 24 },
        hostSize: { width: 600, height: 800 },
        labelOffset: createLabelOffset(16),
        dialogueAnchorOffset: createLabelOffset(11),
        selectionProjectOffset: createSelectionOffset(9),
        capabilities: createAvatarCapabilities({
            canChat: true,
            canSpeak: true
        }),
        hitTest: createHitTestConfig({
            nearDistance: 380,
            midDistance: 980,
            screenPadding: 30,
            farScreenPadding: 40,
            selectionBias: 30
        }),
        pickVolumeScale: {
            width: 1.28,
            height: 1.06,
            depth: 1.35,
            offsetY: 0.4
        },
        avatarScale: 0.73,
        desc: ''
    },
    {
        key: 'robot-canvas',
        engineType: 'robot',
        name: '大黄',
        status: '待入职',
        voice: 'am_adam',
        personality: 'You are Da Huang (Big Yellow), an adorable little yellow robot. When greeted or asked who you are, you MUST reply EXACTLY with: "Beep boop! I am Da Huang, the little yellow robot! I am so happy to meet you! Scroll your mouse wheel, and you will find a surprise." Always maintain this identity and occasionally make cute robotic sounds.',
        worldPosition: createWorldPosition(2 * avatarSpacing),
        worldSize: { width: 14, height: 20 },
        hostSize: { width: 1196, height: 600 },
        labelOffset: createLabelOffset(14),
        dialogueAnchorOffset: createLabelOffset(10),
        selectionProjectOffset: createSelectionOffset(8),
        capabilities: createAvatarCapabilities({
            canSecondaryAction: true
        }),
        hitTest: createHitTestConfig({
            nearDistance: 320,
            midDistance: 820,
            screenPadding: 22,
            farScreenPadding: 30,
            selectionBias: 18
        }),
        desc: ''
    },
    {
        key: 'avatar5',
        engineType: 'talkinghead',
        url: AVATAR_ASSET_FILES.avatar5,
        body: 'F',
        mood: 'neutral',
        preserve: false,
        name: '5号',
        status: '已离职',
        voice: null,
        personality: '',
        worldPosition: createWorldPosition(3 * avatarSpacing),
        worldSize: { width: 13, height: 24 },
        hostSize: { width: 600, height: 800 },
        labelOffset: createLabelOffset(16),
        dialogueAnchorOffset: createLabelOffset(11),
        selectionProjectOffset: createSelectionOffset(9),
        capabilities: createAvatarCapabilities(),
        hitTest: createHitTestConfig({
            nearDistance: 280,
            midDistance: 760,
            screenPadding: 16,
            farScreenPadding: 22,
            selectionBias: 6
        }),
        avatarScale: 0.73,
        desc: ''
    }
];
