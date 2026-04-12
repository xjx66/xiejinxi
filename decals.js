import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

const container = document.getElementById( 'decals-container' );

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
    // 增加高度到 900px (1.5倍) 后，模型会因为视角等比放大
    // 为了保持模型实际显示的像素大小不变，将相机的距离 Z 也拉远 1.5 倍 (100 -> 150)
    camera.position.z = 150;
    // 为了补偿高度增加导致中心点下移，将相机的目标点稍微往下移动一点，使得模型在视觉上保持原来的高度位置
    camera.position.y = 0;

    // Custom zoom: Command + Wheel
    renderer.domElement.addEventListener('wheel', (e) => {
        if (!e.metaKey) {
            e.stopImmediatePropagation();
        }
    }, { capture: true });

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.minDistance = 50;
    controls.maxDistance = 300; // 适配更远的相机距离
    controls.enableDamping = true;
    controls.enablePan = false; // 禁用右键平移，防止与右键涂鸦冲突
    controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: null // 彻底释放右键，不触发 OrbitControls
    };
    controls.target.set(0, 0, 0); // 恢复正常的旋转中心点，避免旋转时模型发生弧线位移

    const dirLight1 = new THREE.DirectionalLight(0xffddcc, 1);
    dirLight1.position.set(1, 0.75, 0.5);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xccccff, 1);
    dirLight2.position.set(-1, 0.75, -0.5);
    scene.add(dirLight2);

    // 加载 HDRI 环境光
    new RGBELoader()
        .setPath('./')
        .load('suburban_garden_4k.hdr', function (texture) {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            // scene.background = texture; // 设置为背景 (移除，让所有模型透出全局背景)
            scene.environment = texture; // 给模型添加真实的光影反射
        });

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

    // 禁用右键菜单
    container.addEventListener('contextmenu', function(event) {
        event.preventDefault();
    });

    // Handle touch/click events
    container.addEventListener('pointerdown', function(event) {
        moved = false;
    });

    container.addEventListener('pointerup', function(event) {
        // 判断当前模型所在的 carousel-item 是否被选中 (具有 active 类)
        const carouselItem = container.closest('.carousel-item');
        if (carouselItem && !carouselItem.classList.contains('active')) return;

        // 只有右键 (button === 2) 才允许涂鸦
        if (moved === false && event.button === 2) {
            checkIntersection(event.clientX, event.clientY);
            if (intersection.intersects) shoot();
        }
    });

    // 创建右键提示的 Tooltip
    const tooltip = document.createElement('div');
    tooltip.style.position = 'fixed';
    tooltip.style.pointerEvents = 'none'; // 防止阻挡鼠标事件
    tooltip.style.zIndex = '9999';
    tooltip.style.display = 'none';
    
    // 使用 CSS 中的动画类名构建内部 HTML
    tooltip.innerHTML = `
        <div class="mouse-click-anim">
            <div class="mouse-icon">
                <div class="mouse-right-btn"></div>
            </div>
        </div>
    `;
    
    document.body.appendChild(tooltip);

    container.addEventListener('pointermove', function(event) {
        if (event.isPrimary) {
            checkIntersection(event.clientX, event.clientY);
        }
        
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

    function checkIntersection(x, y) {
        if (mesh === undefined) return;

        const rect = container.getBoundingClientRect();
        // 使用 rect.width 和 rect.height 替代 clientWidth，以修复由于 CSS scale() 导致的射线检测坐标偏移问题
        mouse.x = ((x - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((y - rect.top) / rect.height) * 2 + 1;

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
