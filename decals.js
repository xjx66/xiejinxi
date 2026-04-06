import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';

const container = document.getElementById('decals-container');

let renderer, scene, camera;
let mesh;
let raycaster, line;

const intersection = {
    intersects: false,
    point: new THREE.Vector3(),
    normal: new THREE.Vector3()
};
const mouse = new THREE.Vector2();
const intersects = [];

const decals = [];
let mouseHelper;
const position = new THREE.Vector3();
const orientation = new THREE.Euler();
const size = new THREE.Vector3(10, 10, 10);

const params = {
    minScale: 9,
    maxScale: 24,
    rotate: true,
};

init();
animate();

function init() {
    const container = document.getElementById('decals-container');
    if (!container) return;

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    
    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 1000);
        camera.position.z = 100;

    // Custom zoom: Command + Wheel
    renderer.domElement.addEventListener('wheel', (e) => {
        if (!e.metaKey) {
            e.stopImmediatePropagation();
        }
    }, { capture: true });

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.minDistance = 50;
    controls.maxDistance = 200;
    controls.enableDamping = true;

    const dirLight1 = new THREE.DirectionalLight(0xffddcc, 1);
    dirLight1.position.set(1, 0.75, 0.5);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xccccff, 1);
    dirLight2.position.set(-1, 0.75, -0.5);
    scene.add(dirLight2);

    const ambientLight = new THREE.AmbientLight(0x443333, 3);
    scene.add(ambientLight);

    const loader = new GLTFLoader();

    loader.load('models/gltf/LeePerrySmith/LeePerrySmith.glb', function (gltf) {

        mesh = gltf.scene.children[0];
        mesh.material = new THREE.MeshPhongMaterial({
            specular: 0x111111,
            map: new THREE.TextureLoader().load('models/gltf/LeePerrySmith/Map-COL.jpg'),
            specularMap: new THREE.TextureLoader().load('models/gltf/LeePerrySmith/Map-SPEC.jpg'),
            shininess: 5
        });

        scene.add(mesh);
        mesh.scale.set(8.33, 8.33, 8.33);

    });

    raycaster = new THREE.Raycaster();

    mouseHelper = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 10), new THREE.MeshNormalMaterial());
    mouseHelper.visible = false;
    scene.add(mouseHelper);

    window.addEventListener('resize', onWindowResize);

    let moved = false;

    controls.addEventListener('change', function() {
        moved = true;
    });

    // Handle touch/click events
    container.addEventListener('pointerdown', function() {
        moved = false;
    });

    container.addEventListener('pointerup', function(event) {
        if (moved === false) {
            checkIntersection(event.clientX, event.clientY);
            if (intersection.intersects) shoot();
        }
    });

    container.addEventListener('pointermove', onPointerMove);

    function onPointerMove(event) {
        if (event.isPrimary) {
            checkIntersection(event.clientX, event.clientY);
        }
    }

    function checkIntersection(x, y) {
        if (mesh === undefined) return;

        const rect = container.getBoundingClientRect();
        mouse.x = ((x - rect.left) / container.clientWidth) * 2 - 1;
        mouse.y = -((y - rect.top) / container.clientHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        raycaster.intersectObject(mesh, false, intersects);

        if (intersects.length > 0) {
            const p = intersects[0].point;
            mouseHelper.position.copy(p);
            intersection.point.copy(p);

            const n = intersects[0].face.normal.clone();
            n.transformDirection(mesh.matrixWorld);
            n.multiplyScalar(10);
            n.add(intersects[0].point);

            intersection.normal.copy(intersects[0].face.normal);
            mouseHelper.lookAt(n);

            intersection.intersects = true;
            intersects.length = 0;
            mouseHelper.visible = true;
        } else {
            intersection.intersects = false;
            mouseHelper.visible = false;
        }
    }
}

function onWindowResize() {
    if (!container) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
}

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}

const decalTexture = createDecalTexture();

    function shoot() {
        position.copy(intersection.point);
        orientation.copy(mouseHelper.rotation);
    
        if (params.rotate) orientation.z = Math.random() * 2 * Math.PI;
    
        const scale = params.minScale + Math.random() * (params.maxScale - params.minScale);
        size.set(scale, scale, scale);
    
        const material = new THREE.MeshPhongMaterial({
            specular: 0x444444,
            map: decalTexture,
            shininess: 30,
            transparent: true,
            depthTest: true,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -4,
            wireframe: false
        });
    
        const color = Math.random() * 0xffffff;
        material.color.setHex(color);
    
        const m = new THREE.Mesh(new DecalGeometry(mesh, position, orientation, size), material);
        m.renderOrder = decals.length;
    
        decals.push(m);
        scene.add(m);
    }

function createDecalTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    // Transparent background
    ctx.clearRect(0, 0, 64, 64);
    
    // Draw splatter shape
    ctx.fillStyle = 'white';
    
    // Center blob
    ctx.beginPath();
    ctx.arc(32, 32, 15, 0, Math.PI * 2);
    ctx.fill();
    
    // Random drips
    for(let i=0; i<8; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 10 + Math.random() * 15;
        const r = 2 + Math.random() * 4;
        const x = 32 + Math.cos(angle) * dist;
        const y = 32 + Math.sin(angle) * dist;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
}
