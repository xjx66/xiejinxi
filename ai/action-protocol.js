export const ACTION_TYPES = {
    CREATE_WORLD_OBJECT: 'createWorldObject',
    REPLACE_WORLD_OBJECT: 'replaceWorldObject',
    DELETE_WORLD_OBJECT: 'deleteWorldObject',
    MOVE_OBJECT: 'moveObject',
    ROTATE_OBJECT: 'rotateObject',
    SCALE_OBJECT: 'scaleObject',
    SPEAK: 'speak',
    SET_VIDEO_PLAYBACK: 'setVideoPlayback',
    EDIT_ASSET: 'editAsset',
    EDIT_PRESENTATION: 'editPresentation'
};

// 变换类动作：就地改 root，瞬时、可逆，不需要重建对象。
export const TRANSFORM_ACTION_TYPES = [
    ACTION_TYPES.MOVE_OBJECT,
    ACTION_TYPES.ROTATE_OBJECT,
    ACTION_TYPES.SCALE_OBJECT
];

// 重建类动作：改变对象形态/资产，需走“草稿→处理→原子替换”管线（施工态）。
export const REBUILD_ACTION_TYPES = [
    ACTION_TYPES.EDIT_PRESENTATION
];

// 当前版本 AI 可下发的“编辑选中对象”动作集合。
// 执行器只认这些，其余一律忽略，保证 LLM 输出始终可校验、可执行。
export const EDIT_ACTION_TYPES = [
    ...TRANSFORM_ACTION_TYPES,
    ...REBUILD_ACTION_TYPES
];

export const isRebuildAction = (action) => REBUILD_ACTION_TYPES.includes(action?.type);

export const createAction = ({ type, payload = {} }) => ({
    type,
    payload
});
