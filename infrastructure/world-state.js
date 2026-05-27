const createIndex = (items = []) => new Map(items.map((item) => [item.id, item]));

export const createWorldState = ({
    world,
    assets = [],
    templates = [],
    worldObjects = []
}) => {
    let currentWorld = world || {
        id: 'world-default',
        name: 'Default World',
        version: 1
    };
    let assetList = [...assets];
    let templateList = [...templates];
    let objectList = [...worldObjects];

    const assetIndex = createIndex(assetList);
    const templateIndex = createIndex(templateList);
    const objectIndex = createIndex(objectList);

    const syncIndex = (index, items) => {
        index.clear();
        items.forEach((item) => index.set(item.id, item));
    };

    return {
        getWorld() {
            return { ...currentWorld };
        },
        setWorld(nextWorld) {
            currentWorld = { ...currentWorld, ...nextWorld };
        },
        getAssets() {
            return assetList.map((asset) => ({ ...asset }));
        },
        getAssetById(assetId) {
            return assetIndex.get(assetId) || null;
        },
        addAsset(asset) {
            assetList.push(asset);
            assetIndex.set(asset.id, asset);
            return asset;
        },
        replaceAssets(nextAssets = []) {
            assetList = [...nextAssets];
            syncIndex(assetIndex, assetList);
        },
        getTemplates() {
            return templateList.map((template) => ({ ...template }));
        },
        getTemplateById(templateId) {
            return templateIndex.get(templateId) || null;
        },
        replaceTemplates(nextTemplates = []) {
            templateList = [...nextTemplates];
            syncIndex(templateIndex, templateList);
        },
        getWorldObjects() {
            return objectList.map((item) => ({ ...item }));
        },
        getWorldObjectById(objectId) {
            return objectIndex.get(objectId) || null;
        },
        getWorldObjectsByType(type) {
            const acceptedTypes = Array.isArray(type) ? type : [type];
            return objectList.filter((item) => acceptedTypes.includes(item.type)).map((item) => ({ ...item }));
        },
        getWorldObjectsByCollection(collection) {
            return objectList.filter((item) => item.metadata?.collection === collection).map((item) => ({ ...item }));
        },
        upsertWorldObject(worldObject) {
            const existingIndex = objectList.findIndex((item) => item.id === worldObject.id);
            if (existingIndex >= 0) {
                objectList.splice(existingIndex, 1, worldObject);
            } else {
                objectList.push(worldObject);
            }
            objectIndex.set(worldObject.id, worldObject);
            return worldObject;
        },
        replaceWorldObjects(nextWorldObjects = []) {
            objectList = [...nextWorldObjects];
            syncIndex(objectIndex, objectList);
        },
        removeWorldObject(objectId) {
            objectList = objectList.filter((item) => item.id !== objectId);
            objectIndex.delete(objectId);
        },
        snapshot() {
            return {
                world: this.getWorld(),
                assets: this.getAssets(),
                templates: this.getTemplates(),
                worldObjects: this.getWorldObjects()
            };
        }
    };
};

