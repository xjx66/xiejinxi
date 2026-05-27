export const ACTION_TYPES = {
    CREATE_WORLD_OBJECT: 'createWorldObject',
    REPLACE_WORLD_OBJECT: 'replaceWorldObject',
    DELETE_WORLD_OBJECT: 'deleteWorldObject',
    MOVE_OBJECT: 'moveObject',
    SPEAK: 'speak',
    SET_VIDEO_PLAYBACK: 'setVideoPlayback',
    EDIT_ASSET: 'editAsset'
};

export const createAction = ({ type, payload = {} }) => ({
    type,
    payload
});
