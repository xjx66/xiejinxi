const DEFAULT_HEAD_OPTIONS = {
    ttsEndpoint: 'https://api.elevenlabs.io/v1/text-to-speech/',
    lipsyncModules: ['en'],
    cameraView: 'full',
    cameraY: 0.2,
    cameraDistance: 1.8,
    lightAmbientIntensity: 3,
    lightDirectIntensity: 5,
    cameraRotateEnable: false,
    cameraZoomEnable: false,
    mixerGainSpeech: 3
};

export const createTalkingHeadAvatarEngine = async ({
    THREE,
    TalkingHead,
    GLTFLoader,
    host,
    profile,
    onLoaded,
    onProgress
}) => {
    const config = profile.legacyConfig;
    const head = new TalkingHead(host, {
        ...DEFAULT_HEAD_OPTIONS,
        ...(config.headOptions || {})
    });
    const worldObject = new THREE.Group();
    worldObject.name = `${profile.key}-talkinghead-world-object`;
    const visibleLoader = new GLTFLoader();
    const visibleState = {
        isSpeaking: false,
        waveUntil: 0,
        pointUntil: 0,
        handupUntil: 0
    };
    let isLoaded = false;
    let mixer = null;
    let rightArm = null;
    let rightForeArm = null;
    let leftArm = null;
    let leftForeArm = null;
    let headBone = null;
    let initialRotationsCaptured = false;

    const captureInitialRotations = () => {
        if (initialRotationsCaptured) return;
        [rightArm, rightForeArm, leftArm, leftForeArm, headBone].forEach((bone) => {
            if (bone && !bone.userData.initialQuaternion) {
                bone.userData.initialQuaternion = bone.quaternion.clone();
            }
        });
        initialRotationsCaptured = true;
    };

    const normalizeBoneNames = (root) => {
        root.traverse((node) => {
            if (node.isBone) {
                node.name = node.name.replaceAll('mixamorig', '');
            }
        });
    };

    const setupVisibleBones = () => {
        rightArm = worldObject.getObjectByName('RightArm');
        rightForeArm = worldObject.getObjectByName('RightForeArm');
        leftArm = worldObject.getObjectByName('LeftArm');
        leftForeArm = worldObject.getObjectByName('LeftForeArm');
        headBone = worldObject.getObjectByName('Head');
        captureInitialRotations();
    };

    const resetBone = (bone, lerp = 0.18) => {
        if (!bone?.userData?.initialQuaternion) return;
        bone.quaternion.slerp(bone.userData.initialQuaternion, lerp);
    };

    const applyGestureBonePose = (timeSeconds) => {
        captureInitialRotations();
        if (headBone?.userData?.initialQuaternion) {
            const idlePitch = Math.sin(timeSeconds * 1.2) * 0.04;
            const idleYaw = Math.sin(timeSeconds * 0.9) * 0.05;
            const idleQ = headBone.userData.initialQuaternion.clone()
                .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), idlePitch))
                .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), idleYaw));
            headBone.quaternion.slerp(idleQ, visibleState.isSpeaking ? 0.32 : 0.16);
        }

        const now = performance.now();
        const isWave = now < visibleState.waveUntil;
        const isPoint = now < visibleState.pointUntil;
        const isHandup = now < visibleState.handupUntil;

        if (isWave && rightArm?.userData?.initialQuaternion) {
            const waveAngle = Math.sin(timeSeconds * 10) * 0.45;
            const lift = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -2.2);
            const swing = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), waveAngle);
            rightArm.quaternion.slerp(rightArm.userData.initialQuaternion.clone().multiply(lift).multiply(swing), 0.28);
            if (rightForeArm?.userData?.initialQuaternion) {
                const bend = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.35);
                rightForeArm.quaternion.slerp(rightForeArm.userData.initialQuaternion.clone().multiply(bend), 0.24);
            }
        } else if (isPoint && rightArm?.userData?.initialQuaternion) {
            const lift = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -1.15);
            rightArm.quaternion.slerp(rightArm.userData.initialQuaternion.clone().multiply(lift), 0.24);
        } else {
            resetBone(rightArm);
            resetBone(rightForeArm);
        }

        if (isHandup) {
            if (rightArm?.userData?.initialQuaternion) {
                const qLiftRight = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -2.35);
                rightArm.quaternion.slerp(rightArm.userData.initialQuaternion.clone().multiply(qLiftRight), 0.24);
            }
            if (leftArm?.userData?.initialQuaternion) {
                const qLiftLeft = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -2.35);
                leftArm.quaternion.slerp(leftArm.userData.initialQuaternion.clone().multiply(qLiftLeft), 0.24);
            }
        } else {
            resetBone(leftArm);
            resetBone(leftForeArm);
            if (!isWave && !isPoint) {
                resetBone(rightArm);
                resetBone(rightForeArm);
            }
        }
    };

    await head.showAvatar({
        url: `./avatars/${config.url}`,
        body: config.body,
        avatarMood: config.mood,
        lipsyncLang: 'en',
        preserveModelPose: !!config.preserve,
        cameraDistance: config.headAvatarOptions?.cameraDistance || 2.2
    }, (event) => {
        if (event && event.lengthComputable) {
            onProgress?.(Math.round((event.loaded / event.total) * 100));
        }
    });

    if (head.avatar && head.avatar.root && config.avatarScale) {
        head.avatar.root.scale.set(config.avatarScale, config.avatarScale, config.avatarScale);
    }

    if (typeof config.cameraYOffset === 'number' && head.camera && head.cameraTarget) {
        head.camera.position.y += config.cameraYOffset;
        head.cameraTarget.y += config.cameraYOffset;
        head.camera.updateProjectionMatrix();
    }

    if (config.preserve) {
        head.opt.avatarIdleHeadMove = false;
        head.opt.avatarSpeakingHeadMove = false;
        head.opt.avatarIgnoreCamera = true;
        head.opt.disableBalance = true;
        head.opt.freeze = false;
    }

    const gltf = await visibleLoader.loadAsync(`./avatars/${config.url}`, (event) => {
        if (event && event.lengthComputable) {
            onProgress?.(Math.round((event.loaded / event.total) * 100));
        }
    });
    const visibleRoot = gltf.scene;
    normalizeBoneNames(visibleRoot);
    visibleRoot.traverse((node) => {
        if (node.isMesh || node.isSkinnedMesh) {
            node.frustumCulled = false;
            node.castShadow = false;
            node.receiveShadow = false;
        }
    });
    worldObject.add(visibleRoot);
    if (gltf.animations?.length) {
        mixer = new THREE.AnimationMixer(visibleRoot);
        const idleAction = mixer.clipAction(gltf.animations[0]);
        idleAction.play();
    }
    setupVisibleBones();
    isLoaded = true;
    onLoaded?.();

    const canvas = host.querySelector('canvas');

    return {
        type: 'talkinghead',
        host,
        canvas,
        head,
        worldObject,
        ready: Promise.resolve(),
        isLoaded: () => isLoaded,
        setSelected() {},
        playGreeting() {
            if (head.playGesture) {
                head.playGesture('handup', 2, false, 500);
            }
            visibleState.waveUntil = performance.now() + 2200;
        },
        handleActionTag(tag) {
            const actions = {
                '[wave]': () => {
                    head.playGesture?.('handup', 2, false, 500);
                    visibleState.waveUntil = performance.now() + 2400;
                },
                '[point]': () => {
                    head.playGesture?.('index', 2, false, 500);
                    visibleState.pointUntil = performance.now() + 1800;
                },
                '[handup]': () => {
                    head.playGesture?.('handup', 2, false, 500);
                    visibleState.handupUntil = performance.now() + 2200;
                },
                '[ok]': () => head.playGesture?.('ok', 2, false, 500),
                '[thumbup]': () => head.playGesture?.('thumbup', 2, false, 500),
                '[thumbdown]': () => head.playGesture?.('thumbdown', 2, false, 500),
                '[shrug]': () => head.playGesture?.('shrug', 2, false, 500),
                '[kiss]': () => head.playGesture?.('kiss', 2, false, 500),
                '[happy]': () => head.setMood?.('happy'),
                '[sad]': () => head.setMood?.('sad'),
                '[angry]': () => head.setMood?.('angry'),
                '[fear]': () => head.setMood?.('fear'),
                '[love]': () => head.setMood?.('love'),
                '[sleep]': () => head.setMood?.('sleep'),
                '[neutral]': () => head.setMood?.('neutral')
            };
            actions[tag]?.();
        },
        onSpeechStart() {
            visibleState.isSpeaking = true;
        },
        onSpeechEnd() {
            visibleState.isSpeaking = false;
        },
        triggerSecondaryAction() {},
        update(deltaSeconds) {
            if (mixer) {
                mixer.update(deltaSeconds);
            }
            applyGestureBonePose(performance.now() * 0.001);
        },
        async speakAudio(data, text) {
            await head.speakAudio(data, { audio: data, text: text || 'something' });
        },
        start() {
            head.start?.();
        },
        stop() {
            head.stop?.();
        },
        destroy() {
            host.innerHTML = '';
        }
    };
};
