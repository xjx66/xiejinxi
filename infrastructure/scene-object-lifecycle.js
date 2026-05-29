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
            // GLB 自带动画能力——用 getter 透传，避免注册时 instance 还在异步加载（clipNames 尚未填充）。
            get mixer() { return instance?.mixer; },
            get clipNames() { return instance?.clipNames; },
            playClip: (name) => instance?.playClip?.(name),
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
