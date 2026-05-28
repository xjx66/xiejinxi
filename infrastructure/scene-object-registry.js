export const createSceneObjectRegistry = () => {
    const byWorldObjectId = new Map();
    const byRootUuid = new Map();

    const unregisterRecord = (record) => {
        if (!record) return;
        byWorldObjectId.delete(record.worldObjectId);
        if (record.root?.uuid) {
            byRootUuid.delete(record.root.uuid);
        }
    };

    return {
        register(record) {
            const existing = byWorldObjectId.get(record.worldObjectId);
            if (existing) {
                unregisterRecord(existing);
            }
            byWorldObjectId.set(record.worldObjectId, record);
            if (record.root?.uuid) {
                byRootUuid.set(record.root.uuid, record.worldObjectId);
            }
            return record;
        },
        unregisterByWorldObjectId(worldObjectId) {
            const record = byWorldObjectId.get(worldObjectId);
            unregisterRecord(record);
            return record || null;
        },
        getByWorldObjectId(worldObjectId) {
            return byWorldObjectId.get(worldObjectId) || null;
        },
        getWorldObjectIdByRoot(root) {
            if (!root?.uuid) return null;
            return byRootUuid.get(root.uuid) || null;
        },
        forEachRecord(fn) {
            byWorldObjectId.forEach((record) => fn(record));
        },
        destroyWorldObject(worldObjectId) {
            const record = this.unregisterByWorldObjectId(worldObjectId);
            record?.destroy?.();
            return record || null;
        }
    };
};

