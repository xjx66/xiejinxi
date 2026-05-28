export const createSceneObjectLifecycle = ({
    sceneObjectRegistry,
    unregisterHitTestTargets,
    removeLabelReference,
    sceneObjectFactory,
    worldState
}) => {
    const cleanupSceneRoot = (root) => {
        if (!root) return;
        unregisterHitTestTargets((target) => target.root === root);
        removeLabelReference(root);
        root.userData?.labelElement?.remove?.();
        root.userData?.loaderElement?.remove?.();
        if (root.userData?.video) root.userData.video.pause();
        root.removeFromParent();
    };

    const registerSceneInstance = ({ objectId, root, destroy, instance, worldObjectId = objectId, source = 'runtime' }) => {
        root.userData = {
            ...root.userData,
            worldObjectId: objectId
        };
        sceneObjectRegistry.register({
            worldObjectId: objectId,
            root,
            source,
            backingWorldObjectId: worldObjectId,
            // 透传 GLB 自带动画能力（不带动画的对象就是 undefined / 空数组）
            mixer: instance?.mixer,
            clipNames: instance?.clipNames,
            playClip: instance?.playClip,
            destroy: () => {
                destroy?.();
                cleanupSceneRoot(root);
            }
        });
    };

    const createManagedWorldObject = (worldObject) => {
        const instance = sceneObjectFactory.createSceneObjectFromWorldObject(worldObject, worldState);
        registerSceneInstance({
            objectId: worldObject.id,
            root: instance.root,
            destroy: instance.destroy,
            instance,
            worldObjectId: worldObject.id,
            source: 'managed'
        });
        return instance.root;
    };

    const replaceManagedSceneObject = (targetObjectId, worldObject) => {
        sceneObjectRegistry.destroyWorldObject(targetObjectId);
        return createManagedWorldObject(worldObject);
    };

    return {
        cleanupSceneRoot,
        registerSceneInstance,
        createManagedWorldObject,
        replaceManagedSceneObject
    };
};
