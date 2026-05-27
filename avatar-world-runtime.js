import * as THREE from 'three';
import { TalkingHead } from 'talkinghead';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AVATAR_MODELS } from './avatar-assets.js';
import { createRobotAvatarEngine } from './avatar-engine-robot.js';
import { createDecalsAvatarEngine } from './avatar-engine-decals.js';
import { createAvatarRuntimeProfile } from './avatar/avatar-config-adapter.js';
import { createAvatarHostRoot, createAvatarHost } from './avatar/avatar-host-layer.js';
import { fitAvatarWorldObjectToTargetHeight } from './avatar/avatar-visual-layer.js';
import { createTalkingHeadAvatarEngine } from './avatar/talkinghead-avatar-engine.js';
import { createAvatarWorldEntry } from './avatar/avatar-world-factory.js';

const createAvatarEngine = async ({ profile, host, onLoaded, onProgress }) => {
    if (profile.engineType === 'robot') {
        return createRobotAvatarEngine({ host, onLoaded, onProgress });
    }
    if (profile.engineType === 'decals') {
        return createDecalsAvatarEngine({ host, onLoaded, onProgress });
    }
    return createTalkingHeadAvatarEngine({
        THREE,
        TalkingHead,
        GLTFLoader,
        host,
        profile,
        onLoaded,
        onProgress
    });
};

export async function createAvatarWorldRuntime({
    scene,
    createLabel,
    createLoader,
    focusOffsetZ = 40
}) {
    const hostRoot = createAvatarHostRoot();
    const avatarGroup = new THREE.Group();
    avatarGroup.name = 'avatar-world-group';
    scene.add(avatarGroup);

    const selectables = [];
    const entriesByKey = new Map();
    const entriesByMesh = new Map();
    const entries = [];

    for (const config of AVATAR_MODELS) {
        const profile = createAvatarRuntimeProfile({ config, focusOffsetZ });
        const host = createAvatarHost(hostRoot, profile);
        const loader = createLoader();
        const label = createLabel(profile.label.name, profile.label.status, profile.label.desc || '');
        let isLoaded = false;
        let progress = 0;

        const onLoaded = () => {
            isLoaded = true;
            if (loader.text) loader.text.innerText = '100%';
        };
        const onProgress = (value) => {
            progress = value;
            if (loader.text) loader.text.innerText = `${value}%`;
        };

        const controller = await createAvatarEngine({
            profile,
            host,
            onLoaded,
            onProgress
        });

        if (controller.ready) {
            await controller.ready;
        }

        const fittedSize = fitAvatarWorldObjectToTargetHeight({
            THREE,
            worldObject: controller.worldObject,
            profile
        });
        const entry = createAvatarWorldEntry({
            THREE,
            profile,
            controller,
            label,
            loader,
            fittedSize,
            getLoaded: () => isLoaded,
            getProgress: () => progress
        });

        avatarGroup.add(entry.mesh);
        selectables.push(entry.mesh);
        entries.push(entry);
        entriesByKey.set(profile.key, entry);
        entriesByMesh.set(entry.mesh, entry);
    }

    return {
        avatarGroup,
        avatarSelectables: selectables,
        avatarEntries: entries,
        getEntries() {
            return entries;
        },
        getEntryByKey(key) {
            return entriesByKey.get(key) || null;
        },
        getEntryByMesh(mesh) {
            return entriesByMesh.get(mesh) || null;
        },
        update(deltaSeconds = 0) {
            entries.forEach((entry) => {
                entry.controller.update?.(deltaSeconds);
            });
        },
        destroy() {
            entries.forEach((entry) => entry.controller.destroy?.());
            avatarGroup.removeFromParent();
            hostRoot.remove();
        }
    };
}
