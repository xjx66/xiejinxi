import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';

function createDecalTexture() {
    const decalCanvas = document.createElement('canvas');
    decalCanvas.width = 256;
    decalCanvas.height = 256;
    const ctx = decalCanvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 256);
    ctx.fillStyle = '#ff3366';
    ctx.beginPath();
    ctx.arc(128, 128, 84, 0, Math.PI * 2);
    ctx.fill();
    return new THREE.CanvasTexture(decalCanvas);
}

export function createDecalsAvatarEngine({ host, onLoaded, onProgress }) {
    const scene = new THREE.Scene();
    scene.background = null;
    const worldObject = new THREE.Group();
    worldObject.name = 'decals-avatar-world-object';

    const camera = new THREE.PerspectiveCamera(45, host.clientWidth / host.clientHeight, 1, 1000);
    camera.position.z = 150;
    camera.position.y = 0;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 768 ? 1.5 : 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    host.appendChild(renderer.domElement);

    const dirLight1 = new THREE.DirectionalLight(0xffddcc, 1);
    dirLight1.position.set(1, 0.75, 0.5);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xccccff, 1);
    dirLight2.position.set(-1, 0.75, -0.5);
    scene.add(dirLight2);

    const ambientLight = new THREE.AmbientLight(0x443333, 3);
    scene.add(ambientLight);

    const loader = new GLTFLoader();
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const mouseHelper = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 10), new THREE.MeshNormalMaterial());
    mouseHelper.visible = false;
    scene.add(mouseHelper);

    const intersection = {
        intersects: false,
        point: new THREE.Vector3(),
        normal: new THREE.Vector3()
    };
    const position = new THREE.Vector3();
    const orientation = new THREE.Euler();
    const size = new THREE.Vector3(10, 10, 10);
    const intersects = [];
    const decals = [];
    const decalTexture = createDecalTexture();
    const params = { minScale: 9, maxScale: 24, rotate: true };
    let mesh = null;
    let running = true;
    let isLoaded = false;
    let isSelected = false;
    let resolveReady = null;
    const ready = new Promise((resolve) => {
        resolveReady = resolve;
    });

    const animate = () => {
        if (!running) return;
        requestAnimationFrame(animate);
        renderer.render(scene, camera);
    };

    const shoot = () => {
        position.copy(intersection.point);
        orientation.copy(mouseHelper.rotation);
        if (params.rotate) orientation.z = Math.random() * 2 * Math.PI;
        const scale = params.minScale + Math.random() * (params.maxScale - params.minScale);
        size.set(scale, scale, scale);

        const material = new THREE.MeshPhongMaterial({
            specular: 0x444444,
            map: decalTexture,
            transparent: true,
            depthTest: true,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -4,
            wireframe: false
        });

        const decal = new THREE.Mesh(new DecalGeometry(mesh, position, orientation, size), material);
        decals.push(decal);
        worldObject.add(decal);
    };

    const checkIntersectionFromUv = (u, v) => {
        if (!mesh) return false;
        mouse.x = u * 2 - 1;
        mouse.y = -(v * 2 - 1);
        raycaster.setFromCamera(mouse, camera);
        raycaster.intersectObject(mesh, false, intersects);
        if (intersects.length > 0) {
            const hit = intersects[0];
            mouseHelper.position.copy(hit.point);
            intersection.point.copy(hit.point);
            const n = hit.face.normal.clone();
            n.transformDirection(mesh.matrixWorld);
            n.multiplyScalar(10).add(hit.point);
            intersection.normal.copy(hit.face.normal);
            mouseHelper.lookAt(n);
            mouseHelper.visible = true;
            intersection.intersects = true;
            intersects.length = 0;
            return true;
        }
        intersection.intersects = false;
        mouseHelper.visible = false;
        return false;
    };

    loader.load('models/gltf/LeePerrySmith/LeePerrySmith.glb', (gltf) => {
        mesh = gltf.scene.children[0];
        mesh.material = new THREE.MeshPhongMaterial({
            specular: 0x111111,
            map: new THREE.TextureLoader().load('models/gltf/LeePerrySmith/Map-COL.jpg'),
            specularMap: new THREE.TextureLoader().load('models/gltf/LeePerrySmith/Map-SPEC.jpg'),
            shininess: 5
        });
        mesh.scale.set(8.33, 8.33, 8.33);
        worldObject.add(mesh);
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
        type: 'decals',
        host,
        canvas: renderer.domElement,
        worldObject,
        ready,
        isLoaded: () => isLoaded,
        setSelected(value) {
            isSelected = value;
        },
        playGreeting() {},
        handleActionTag() {},
        onSpeechStart() {},
        onSpeechEnd() {},
        triggerSecondaryAction(uv) {
            if (!isSelected) return;
            if (!uv) return;
            if (checkIntersectionFromUv(uv.x, uv.y)) {
                shoot();
            }
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
