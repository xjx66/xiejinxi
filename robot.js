import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let renderer, scene, camera, mixer, controls;
const clock = new THREE.Clock();
let model;
let currentAction;
const actions = {};
const states = ['Idle', 'Walking', 'Running', 'Dance', 'Death', 'Sitting', 'Standing'];
const emotes = ['Jump', 'Yes', 'No', 'Wave', 'Punch', 'ThumbsUp', 'Death'];

const container = document.getElementById('robot-container');

init();

function init() {
    if (!container) return;

    camera = new THREE.PerspectiveCamera( 45, container.clientWidth / container.clientHeight, 1, 100 );
    camera.position.set( 0, 3, 9 );
    camera.lookAt( 0, 1.5, 0 );

    scene = new THREE.Scene();
    scene.background = null; // Transparent

    const hemiLight = new THREE.HemisphereLight( 0xffffff, 0x8d8d8d, 3 );
    hemiLight.position.set( 0, 20, 0 );
    scene.add( hemiLight );

    const dirLight = new THREE.DirectionalLight( 0xffffff, 3 );
    dirLight.position.set( 3, 10, 10 );
    scene.add( dirLight );

    const loader = new GLTFLoader();
    loader.load( 'models/gltf/RobotExpressive/RobotExpressive.glb', function ( gltf ) {

        model = gltf.scene;
        scene.add( model );
        
        // Scale and position for full view
        model.scale.set(1.08, 1.08, 1.08);
        model.position.y = -1.2;

        model.traverse( function ( object ) {
            if ( object.isMesh ) object.castShadow = true;
        } );

        mixer = new THREE.AnimationMixer( model );

        const animations = gltf.animations;

        // Populate actions object with clips
        for ( let i = 0; i < animations.length; i ++ ) {
            const clip = animations[ i ];
            actions[ clip.name ] = mixer.clipAction( clip );
            
            // Set loop mode for emotes
            if ( emotes.indexOf( clip.name ) >= 0 || states.indexOf( clip.name ) >= 4 ) {
                actions[ clip.name ].clampWhenFinished = true;
                actions[ clip.name ].loop = THREE.LoopOnce;
            }
        }

        // Start with Idle
        currentAction = actions['Idle'];
        if(currentAction) {
            currentAction.play();
        }

        // Keyboard interactions
        window.addEventListener('keydown', (e) => {
            // Ignore if typing in an input or textarea
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            const keyMap = {
                '1': 'Idle',
                '2': 'Walking',
                '3': 'Running',
                '4': 'Dance',
                '5': 'Wave',
                '6': 'ThumbsUp',
                '7': 'Yes',
                '8': 'No',
                '9': 'Death'
            };
            
            const actionName = keyMap[e.key];
            if (!actionName) return;

            // Debug log to ensure event is firing
            console.log(`Robot Keydown: ${e.key} -> ${actionName}`);
            
            const newAction = actions[actionName];
            if (!newAction) {
                console.warn(`Action not found: ${actionName}`);
                return;
            }

            // If same state, do nothing
            if (currentAction === newAction && states.indexOf(actionName) >= 0 && actionName !== 'Death') return;

            // Handle State Change (except Death which we treat as emote here)
            if (states.indexOf(actionName) >= 0 && actionName !== 'Death') {
                fadeToAction(newAction, 0.5);
            }
            // Handle Emote or Death
            else {
                playEmote(actionName);
            }
        });

        animate();

    } );

    renderer = new THREE.WebGLRenderer( { antialias: true, alpha: true } );
    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.setSize( container.clientWidth, container.clientHeight );
    container.appendChild( renderer.domElement );

    // Custom zoom: Command + Wheel
    renderer.domElement.addEventListener('wheel', (e) => {
        if (!e.metaKey) {
            e.stopImmediatePropagation();
        }
    }, { capture: true });

    controls = new OrbitControls( camera, renderer.domElement );
    controls.target.set( 0, 1.5, 0 );
    controls.enablePan = false;
    controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: null // 释放右键
    };
    controls.update();

    window.addEventListener( 'resize', onWindowResize );
    
    // Mouse interaction
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let moved = false;

    controls.addEventListener('change', function() {
        moved = true;
    });

    container.addEventListener('contextmenu', function(event) {
        event.preventDefault();
    });

    container.addEventListener('pointerdown', function(event) {
        moved = false;
    });

    container.addEventListener('pointerup', (event) => {
        // 判断当前模型所在的 carousel-item 是否被选中 (具有 active 类)
        const carouselItem = container.closest('.carousel-item');
        if (carouselItem && !carouselItem.classList.contains('active')) return;

        if (moved === false && event.button === 2) {
            const rect = container.getBoundingClientRect();
            // 使用 rect.width/height 防止 css scale 导致计算错误
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            
            raycaster.setFromCamera(mouse, camera);
            
            if (model) {
                const intersects = raycaster.intersectObjects(model.children, true);
                
                if (intersects.length > 0) {
                    // Randomly trigger an emote from the emotes list
                    const randomEmote = emotes[Math.floor(Math.random() * emotes.length)];
                    playEmote(randomEmote);
                }
            }
        }
    });

    // 创建右键提示的 Tooltip
    const tooltip = document.createElement('div');
    tooltip.style.position = 'fixed';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.zIndex = '9999';
    tooltip.style.display = 'none';
    tooltip.innerHTML = `
        <div class="mouse-click-anim">
            <div class="mouse-icon">
                <div class="mouse-right-btn"></div>
            </div>
        </div>
    `;
    document.body.appendChild(tooltip);

    container.addEventListener('pointermove', function(event) {
        // 判断当前模型所在的 carousel-item 是否被选中 (具有 active 类)
        const carouselItem = container.closest('.carousel-item');
        if (carouselItem && !carouselItem.classList.contains('active')) {
            tooltip.style.display = 'none';
            return;
        }

        // 更新 tooltip 位置
        tooltip.style.display = 'block';
        tooltip.style.left = (event.clientX + 15) + 'px';
        tooltip.style.top = (event.clientY + 15) + 'px';
    });

    container.addEventListener('pointerleave', function() {
        tooltip.style.display = 'none';
    });
}

// 暴露给全局，方便其他模块调用打招呼动作
window.playRobotEmote = playEmote;

function playEmote(emoteName) {
    const action = actions[emoteName];
    if (!action) return;
    
    // Fade out current action
    if (currentAction && currentAction !== action) {
        currentAction.fadeOut(0.2);
    }
    
    action.reset();
    action.fadeIn(0.2);
    action.play();
    
    // When emote finishes, restore idle state
    const restoreState = (e) => {
        if (e.action === action) {
            mixer.removeEventListener('finished', restoreState);
            action.fadeOut(0.2);
            
            if (actions['Idle']) {
                currentAction = actions['Idle'];
                currentAction.reset();
                currentAction.fadeIn(0.2);
                currentAction.play();
            }
        }
    };
    
    mixer.addEventListener('finished', restoreState);
}

function fadeToAction( action, duration ) {
    if (currentAction === action) return;
    
    const previousAction = currentAction;
    currentAction = action;

    if ( previousAction ) {
        previousAction.fadeOut( duration );
    }

    if (currentAction) {
        currentAction
            .reset()
            .setEffectiveTimeScale( 1 )
            .setEffectiveWeight( 1 )
            .fadeIn( duration )
            .play();
    }
}

function onWindowResize() {
    if (!container) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize( container.clientWidth, container.clientHeight );
    renderer.setPixelRatio(window.devicePixelRatio);
}

function animate() {
    requestAnimationFrame( animate );
    const delta = clock.getDelta();
    if ( mixer ) mixer.update( delta );
    renderer.render( scene, camera );
}