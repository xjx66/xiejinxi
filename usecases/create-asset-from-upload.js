export const createAssetFromUpload = ({ uploadRuntime, worldState, file }) => {
    const asset = uploadRuntime.createAssetFromFile(file);
    worldState.addAsset(asset);
    return asset;
};
