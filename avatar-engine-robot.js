import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export function createRobotAvatarEngine({ host, onLoaded, onProgress }) {
    const scene = new THREE.Scene();
    scene.background = null;
    const worldObject = new THREE.Group();
    worldObject.name = 'robot-avatar-world-object';

    const camera = new THREE.PerspectiveCamera(45, host.clientWidth / host.clientHeight, 1, 100);
    camera.position.set(0, 3, 9);
    camera.lookAt(0, 1.5, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 768 ? 1.5 : 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    host.appendChild(renderer.domElement);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x8d8d8d, 3);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 3);
    dirLight.position.set(3, 10, 10);
    scene.add(dirLight);

    const clock = new THREE.Clock();
    const loader = new GLTFLoader();
    const actions = {};
    const emotes = ['Jump', 'Yes', 'No', 'Wave', 'Punch', 'ThumbsUp', 'Death'];
    let currentAction = null;
    let mixer = null;
    let model = null;
    let running = true;
    let isLoaded = false;
    let isSelected = false;
    let resolveReady = null;
    const ready = new Promise((resolve) => {
        resolveReady = resolve;
    });
    const state = {
        isWaving: false,
        isRaisingHands: false,
        isSpinning: false,
        isDancing: false
    };

    const animate = () => {
        if (!running) return;
        requestAnimationFrame(animate);

        const dt = clock.getDelta();
        if (mixer) {
            mixer.update(dt);
        }

        if (model) {
            const t = performance.now() * 0.001;
            const rootBone = model.getObjectByName('Root') || model.getObjectByName('mixamorigRoot');
            const headBone = model.getObjectByName('Head') || model.getObjectByName('mixamorigHead');
            const rightArm = model.getObjectByName('RightArm');
            const rightForeArm = model.getObjectByName('RightForeArm');
            const leftArm = model.getObjectByName('LeftArm');
            const leftForeArm = model.getObjectByName('LeftForeArm');

            if (state.isSpinning && headBone) {
                headBone.rotation.y = t * 10;
                headBone.rotation.x = 0;
                headBone.rotation.z = 0;
            } else if (headBone) {
                headBone.rotation.y = Math.sin(t * 2) * 0.08;
                headBone.rotation.x = Math.sin(t * 1.5) * 0.02;
                headBone.rotation.z = 0;
            }

            if (state.isWaving && rightArm && rightForeArm) {
                if (!rightArm.userData.initialQuaternion) {
                    rightArm.userData.initialQuaternion = rightArm.quaternion.clone();
                    rightForeArm.userData.initialQuaternion = rightForeArm.quaternion.clone();
                }
                const waveAngle = Math.sin(t * 10) * 0.5;
                const qLift = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -2.5);
                const qWave = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), waveAngle);
                const qTarget = rightArm.userData.initialQuaternion.clone().multiply(qLift).multiply(qWave);
                rightArm.quaternion.slerp(qTarget, 0.2);
            }

            if (state.isRaisingHands && rightArm && rightForeArm && leftArm && leftForeArm) {
                const liftAngle = -2.5;
                if (!rightArm.userData.initialQuaternion) rightArm.userData.initialQuaternion = rightArm.quaternion.clone();
                if (!rightForeArm.userData.initialQuaternion) rightForeArm.userData.initialQuaternion = rightForeArm.quaternion.clone();
                if (!leftArm.userData.initialQuaternion) leftArm.userData.initialQuaternion = leftArm.quaternion.clone();
                if (!leftForeArm.userData.initialQuaternion) leftForeArm.userData.initialQuaternion = leftForeArm.quaternion.clone();

                const qLiftRight = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), liftAngle);
                const qLiftLeft = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), liftAngle);
                rightArm.quaternion.slerp(rightArm.userData.initialQuaternion.clone().multiply(qLiftRight), 0.2);
                leftArm.quaternion.slerp(leftArm.userData.initialQuaternion.clone().multiply(qLiftLeft), 0.2);

                const bendAngle = 0.5;
                const qBendRight = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), bendAngle);
                const qBendLeft = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -bendAngle);
                rightForeArm.quaternion.slerp(rightForeArm.userData.initialQuaternion.clone().multiply(qBendRight), 0.2);
                leftForeArm.quaternion.slerp(leftForeArm.userData.initialQuaternion.clone().multiply(qBendLeft), 0.2);
            }

            renderer.render(scene, camera);
        } else {
            renderer.render(scene, camera);
        }
    };

    const playClip = (name) => {
        const next = actions[name];
        if (!next) return;
        if (currentAction === next) return;
        if (currentAction) currentAction.fadeOut(0.3);
        next.reset().fadeIn(0.3).play();
        currentAction = next;
    };

    const playEmote = (name) => {
        if (!actions[name]) return;
        const action = actions[name];
        action.reset();
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.play();
    };

    loader.load('models/gltf/RobotExpressive/RobotExpressive.glb', (gltf) => {
        model = gltf.scene;
        model.scale.set(1.08, 1.08, 1.08);
        model.position.y = -1.2;
        model.traverse((object) => {
            if (object.isMesh) object.castShadow = false;
        });
        worldObject.add(model);

        mixer = new THREE.AnimationMixer(model);
        gltf.animations.forEach((clip) => {
            actions[clip.name] = mixer.clipAction(clip);
        });
        playClip('Idle');
        isLoaded = true;
        onLoaded?.();
        resolveReady?.();
    }, (xhr) => {
        if (xhr.lengthComputable) {
            onProgress?.(Math.round((xhr.loaded / xhr.total) * 100));
        }
    });

    animate();

    return {
        type: 'robot',
        host,
        canvas: renderer.domElement,
        worldObject,
        ready,
        isLoaded: () => isLoaded,
        setSelected(value) {
            isSelected = value;
        },
        playGreeting() {
            state.isWaving = true;
            window.setTimeout(() => {
                state.isWaving = false;
            }, 3000);
        },
        handleActionTag(tag) {
            if (tag === '[wave]') {
                state.isWaving = true;
                window.setTimeout(() => {
                    state.isWaving = false;
                }, 3000);
                return;
            }
            if (tag === '[handup]') {
                state.isRaisingHands = true;
                window.setTimeout(() => {
                    state.isRaisingHands = false;
                }, 5000);
                return;
            }
            if (tag === '[dance]') {
                state.isDancing = true;
                playEmote('Dance');
                window.setTimeout(() => {
                    state.isDancing = false;
                    playClip('Idle');
                }, 5000);
                return;
            }
        },
        onSpeechStart() {
            state.isSpinning = true;
        },
        onSpeechEnd() {
            state.isSpinning = false;
        },
        triggerSecondaryAction() {
            if (!isSelected) return;
            const randomEmote = emotes[Math.floor(Math.random() * emotes.length)];
            playEmote(randomEmote);
        },
        resize(width, height) {
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height);
        },
        start() {},
        stop() {},
        destroy() {
            running = false;
            renderer.dispose();
            host.innerHTML = '';
        }
    };
}
