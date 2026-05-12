import { TalkingHead } from "talkinghead";
import { HeadTTS } from "headtts";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// =======================================================================
// 📂 资产库配置 (Asset Library)
// 这里集中管理了场景中所有需要外部加载的贴图、模型、图片资源。
// 方便你后续上传新资源并替换路径。
// =======================================================================
export const AssetLibrary = {
    // 1. 材质贴图 (放入 assets/textures/ 目录)
    textures: {
        ground: './assets/textures/ground-texture.jpg',
        wall: './assets/textures/wall-texture.jpg'
    },
    // 2. 展台产品模型 (放入 assets/products/ 目录)
    // 采用数组形式，支持按顺序循环加载多个产品。可以为每个产品指定不同的尺寸 (targetSize)
    products: [
        { name: "米兰桥下的无家可归者", url: './assets/products/virtual/studio.glb', type: 'model', targetSize: 16, time: "202509", desc: "" },
        { name: "博尔扎诺城市更新", url: './assets/products/virtual/albe.glb', type: 'model', targetSize: 16, time: "202409", desc: "" },
        { name: "Claude Pets", url: './assets/products/virtual/calaudepets.mp4', type: 'video', targetSize: 16, keepAudio: false, time: "202603", desc: "claude代码泄漏" },
        { name: "Notes App", url: './assets/products/virtual/notes.mp4', type: 'video', targetSize: 16, keepAudio: false, time: "202603", desc: "不一样的交互形式" },
        { name: "UNI生态圈校园论坛", url: './assets/products/virtual/unieco.mp4', type: 'video', targetSize: 16, keepAudio: true, time: "202109-202409", desc: "" },
        { name: "Panda校园专送外卖平台", url: './assets/products/virtual/panda.mp4', type: 'video', targetSize: 8, keepAudio: false, time: "202109-202409", desc: "" }
    ],
    // 3. 墙面名画 (放入 assets/paintings/ 目录)
    paintings: [
        { name: "X", url: "./assets/paintings/20260322-170017.jpeg", width: 9, height: 9, time: "202603", desc: "" }, // 缩小一倍 (18 -> 9)
        { name: "小侄子和小侄女的自拍", url: "./assets/paintings/selfies.jpeg", width: 9, height: 9 * (1181 / 1146), time: "202602", desc: "" }, // 缩小一倍，保持比例
        { name: "爷爷和我", url: "./assets/paintings/我和我爷爷.jpeg", width: 9, height: 9 * (1440 / 1080), time: "202407", desc: "雅安市人民医院" } // 3:4 竖向照片
    ],
    // 4. 数字人模型 (位于 /avatars/ 等目录)
    avatars: {
        bot1: 'brunette.glb',
        bot2: 'robot_dreams.glb',
        avatar3: 'avaturn.glb',
        avatar4: 'avatarsdk.glb',
        avatar5: 'mpfb.glb'
    }
};

// Helper to find bone loosely
function findBone(armature, namePart, side) {
    let found = null;
    armature.traverse(obj => {
        if (found) return;
        if (obj.isBone) {
            const n = obj.name.toLowerCase();
            const sideCheck = side ? (n.includes(side.toLowerCase()) || n.includes(side === 'L' ? 'left' : 'right')) : true;
            if (n.includes(namePart.toLowerCase()) && sideCheck) {
                found = obj;
            }
        }
    });
    return found;
}

// ... existing code ...
let head;
let headtts;
// -----------------------------------------------------------------------
// 全局 HDRI 背景初始化
// -----------------------------------------------------------------------
const initGlobalBackground = () => {
    const bgCanvas = document.createElement('canvas');
    bgCanvas.id = 'global-hdri-bg';
    bgCanvas.style.position = 'fixed';
    bgCanvas.style.top = '0';
    bgCanvas.style.left = '0';
    bgCanvas.style.width = '100%';
    bgCanvas.style.height = '100%';
    bgCanvas.style.zIndex = '-2'; // 放置在粒子背景(-1)的后面
    bgCanvas.style.pointerEvents = 'none';
    document.body.prepend(bgCanvas);

    // 创建 3D 对象的 UI 标签容器
    const bgLabelsContainer = document.createElement('div');
    bgLabelsContainer.id = 'bg-labels-container';
    bgLabelsContainer.style.position = 'fixed';
    bgLabelsContainer.style.top = '0';
    bgLabelsContainer.style.left = '0';
    bgLabelsContainer.style.width = '100%';
    bgLabelsContainer.style.height = '100%';
    bgLabelsContainer.style.pointerEvents = 'none'; // 绝对不能阻挡点击事件
    bgLabelsContainer.style.zIndex = '2'; // 叠加在背景之上，但在最前方的 UI 之下
    document.body.appendChild(bgLabelsContainer);
    window.bgLabelsContainer = bgLabelsContainer;
    window.bgLabels = []; // 存储所有的标签数据以便在渲染循环中更新

    const bgRenderer = new THREE.WebGLRenderer({ canvas: bgCanvas, antialias: true, alpha: false });
    bgRenderer.setSize(window.innerWidth, window.innerHeight);
    // 限制移动端的高 Dpr，防止超大分辨率导致 iOS/移动端浏览器内存溢出 (OOM) 崩溃
    bgRenderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 768 ? 1.5 : 2));
    // 确保整个渲染器也使用正确的色彩空间输出
    bgRenderer.outputColorSpace = THREE.SRGBColorSpace;
    const bgScene = new THREE.Scene();
    bgScene.background = new THREE.Color(0x050505); // 将背景改为深色，配合远处的阴影衰减
    // 使用深色线性雾气，模拟光线在远处的自然衰减，产生深邃的阴影感
    bgScene.fog = new THREE.Fog(0x050505, 80, 1200); 

    const bgCamera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 1, 3000); // 增加相机视野深度
    bgCamera.position.set(0, 8, 40); 
    bgCamera.lookAt(0, 8, -900); // 调整相机朝向，使其看向深度900的墙面

    window.bgTargetPositionX = 0;
    // 背景相机 Z 轴目标位置：默认初始 z = 40（看向墙的远景），
    // 通过鼠标滚轮可让相机朝墙面"穿过模型"推进（z 减小）。
    // 范围由 wheel 事件中的 clamp 决定：[BG_Z_MIN, BG_Z_MAX]
    window.bgTargetPositionZ = bgCamera.position.z;

    // --- 纯白无限方格空间 (The Construct) 构造 ---
    // [空间部位约定说明]: 
    // 1. "地面" 或 "地板": 指下方 Y=-5 的大平面 (floor / floorGrid)
    // 2. "天花板": 指上方 Y=40 的大平面 (ceil / ceilGrid)
    // 3. "墙" 或 "墙面": 指远处 Z=-895 垂直的背景平面 (wall / wallGrid)

    // 1. 地面/地板 (Floor)
    const floorGeo = new THREE.PlaneGeometry(4000, 4000); // 深度加大到 4000，配合雾气实现前后无限延伸
    
    // 加载地面材质贴图（粗糙混凝土）
    const textureLoader = new THREE.TextureLoader();
    
    // 地面底板：作为瓷砖之间的"缝隙颜色"，纯色无纹理
    const floorMat = new THREE.MeshStandardMaterial({ 
        color: 0xdcdcdc, // 浅灰，与天花板缝隙一致
        emissive: 0x000000,
        emissiveIntensity: 0,
        roughness: 1.0
    }); 
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -5;
    bgScene.add(floor);

    const cellSpacing = 20.5;
    const floorTileSize = 20.4;                      // 当前地板缝宽 = 20.5 - 20.3 = 0.2
    const floorTileSpacing = cellSpacing;
    const floorTileThickness = 0.3; // 瓷砖比灯薄一点，更接近真实瓷砖
    const floorTileCols = Math.floor(2000 / floorTileSpacing);
    const floorTileRows = Math.floor(2000 / floorTileSpacing);
    const floorTileCount = floorTileCols * floorTileRows;
    const floorTileGeo = new THREE.BoxGeometry(floorTileSize, floorTileThickness, floorTileSize);
    
    // 独立加载贴图，避免 clone() 导致异步加载的 image 数据丢失
    const actualFloorTexture = textureLoader.load(AssetLibrary.textures.ground);
    actualFloorTexture.wrapS = THREE.RepeatWrapping;
    actualFloorTexture.wrapT = THREE.RepeatWrapping;
    
    const floorTileMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: actualFloorTexture,       // 漫反射使用独立的混凝土贴图
        roughness: 0.95          // 高粗糙度，呈现哑光混凝土质感
    });
    const floorTiles = new THREE.InstancedMesh(floorTileGeo, floorTileMat, floorTileCount);
    {
        const dummy = new THREE.Object3D();
        let i = 0;
        for (let r = 0; r < floorTileRows; r++) {
            for (let c = 0; c < floorTileCols; c++) {
                const x = (c - floorTileCols / 2 + 0.5) * floorTileSpacing;
                const z = (r - floorTileRows / 2 + 0.5) * floorTileSpacing;
                // 瓷砖底面贴住地面 Y=-5，顶面凸出 thickness
                dummy.position.set(x, -5 + floorTileThickness / 2, z);
                dummy.updateMatrix();
                floorTiles.setMatrixAt(i, dummy.matrix);
                i++;
            }
        }
        floorTiles.instanceMatrix.needsUpdate = true;
    }
    
    // 注入 Shader，使得实例化网格中的每一块瓷砖都能从贴图的不同位置采样
    floorTileMat.onBeforeCompile = (shader) => {
        shader.vertexShader = `
            varying vec3 vWorldInstancePos;
            ${shader.vertexShader}
        `.replace(
            `#include <begin_vertex>`,
            `#include <begin_vertex>
             vec4 instanceCenter = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
             vWorldInstancePos = (modelMatrix * instanceCenter).xyz;`
        );
        shader.fragmentShader = `
            varying vec3 vWorldInstancePos;
            float myCustomRand(vec2 co){
                return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
            }
            ${shader.fragmentShader}
        `.replace(
            `#include <map_fragment>`,
            `
            #ifdef USE_MAP
                // 根据世界坐标计算网格索引，保证平移时相同位置的纹理不变
                float cellSpacing = 20.5;
                float cellX = floor(vWorldInstancePos.x / cellSpacing + 0.5);
                float cellZ = floor(vWorldInstancePos.z / cellSpacing + 0.5);
                vec2 cellId = vec2(cellX, cellZ);
                
                float uOffset = myCustomRand(cellId * 1.1);
                float vOffset = myCustomRand(cellId * 2.2);
                float flip = myCustomRand(cellId * 3.3) > 0.5 ? 1.0 : 0.0;

                vec2 modifiedUv = vMapUv;
                if (flip > 0.5) { modifiedUv.x = 1.0 - modifiedUv.x; } // 随机水平翻转
                modifiedUv += vec2(uOffset, vOffset); // 随机 UV 偏移
                vec4 sampledDiffuseColor = texture2D( map, modifiedUv );
                diffuseColor *= sampledDiffuseColor;
            #endif
            `
        );
    };

    bgScene.add(floorTiles);

    // 原地板黑线网格已被瓷砖阵列的缝隙替代，不再需要 GridHelper
    // const floorGrid = new THREE.GridHelper(4000, 160, 0x111111, 0x111111); // 已停用

    // 2. 天花板 (Ceiling)
    // --- 天窗 Shader 插件 (用于掏空 Z=-500 的区域) ---
    const skylightShaderPlugin = (shader) => {
        shader.vertexShader = `
            varying vec3 vWorldPos;
        ` + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
            '#include <project_vertex>',
            `#include <project_vertex>
             vec4 myWorldPosition = vec4( transformed, 1.0 );
             #ifdef USE_INSTANCING
                 myWorldPosition = instanceMatrix * myWorldPosition;
             #endif
             myWorldPosition = modelMatrix * myWorldPosition;
             vWorldPos = myWorldPosition.xyz;`
        );
        shader.fragmentShader = `
            varying vec3 vWorldPos;
        ` + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <clipping_planes_fragment>',
            `#include <clipping_planes_fragment>
            if (vWorldPos.z > -551.2 && vWorldPos.z < -448.8) {
                discard;
            }`
        );
    };

    // 背板：浅灰，作为灯之间的缝隙颜色
    const ceilGeo = new THREE.PlaneGeometry(4000, 4000); 
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0xdcdcdc, emissive: 0x000000, emissiveIntensity: 0 });
    ceilMat.onBeforeCompile = skylightShaderPlugin;
    const ceil = new THREE.Mesh(ceilGeo, ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = 40; 
    bgScene.add(ceil);

    // 方形吸顶灯阵列（代替原来的网格线）
    // 间距与地板/墙板共用 cellSpacing，三层完全对齐
    const lightSize = 20.2;
    const lightSpacing = cellSpacing; // 20.5
    const lightThickness = 0.4; // 灯具厚度，让灯块从天花板凸出来
    const lightCols = Math.floor(2000 / lightSpacing);
    const lightRows = Math.floor(2000 / lightSpacing);
    const lightCount = lightCols * lightRows;
    // 用 BoxGeometry 取代 PlaneGeometry，使灯具有体积厚度
    const lightGeo = new THREE.BoxGeometry(lightSize, lightThickness, lightSize);
    // 灯具采用 6 面材质数组：底面（玩家朝上看到的那一面）纯白发光，
    // 4 个侧面用暗色描边来强调"灯框"轮廓，让灯块在视觉上有立体感而不是糊成一片
    const ceilLightFaceMat = new THREE.MeshStandardMaterial({
        color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.8
    });
    const ceilLightFrameMat = new THREE.MeshStandardMaterial({
        color: 0xaaaaaa, emissive: 0x000000, emissiveIntensity: 0
    });
    // BoxGeometry 面顺序：[+x, -x, +y(顶), -y(底), +z, -z]
    const ceilLightMats = [
        ceilLightFrameMat, // +x 侧
        ceilLightFrameMat, // -x 侧
        ceilLightFrameMat, // +y 顶（贴天花板，看不见，给个深色避免影响）
        ceilLightFaceMat,  // -y 底（朝下，玩家可见的发光面）
        ceilLightFrameMat, // +z 侧
        ceilLightFrameMat  // -z 侧
    ];

    ceilLightFaceMat.onBeforeCompile = skylightShaderPlugin;
    ceilLightFrameMat.onBeforeCompile = skylightShaderPlugin;
    const ceilLights = new THREE.InstancedMesh(lightGeo, ceilLightMats, lightCount);
    // 兼容旧 three：保留单材质引用，主题切换时直接调亮度用
    const ceilLightMat = ceilLightFaceMat;


    ceilLightFaceMat.needsUpdate = true;

    {
        const dummy = new THREE.Object3D();
        let i = 0;
        
        for (let r = 0; r < lightRows; r++) {
            for (let c = 0; c < lightCols; c++) {
                const x = (c - lightCols / 2 + 0.5) * lightSpacing;
                const z = (r - lightRows / 2 + 0.5) * lightSpacing;
                // 中心放在 (天花板 Y=40) 下方 lightThickness/2 处，使灯顶面贴住天花板，底面凸出来
                dummy.position.set(x, 40 - lightThickness / 2, z);
                dummy.rotation.set(0, 0, 0); // BoxGeometry 默认朝向已是水平，无需旋转
                dummy.scale.set(1, 1, 1);
                dummy.updateMatrix();
                ceilLights.setMatrixAt(i++, dummy.matrix);
            }
        }
        ceilLights.instanceMatrix.needsUpdate = true;
    }
    bgScene.add(ceilLights);

    // --- 天窗竖井 (Skylight Shaft) ---
    // 深度盖住 5 盏灯的区域 (5 * 20.5 = 102.5)
    const shaftSizeZ = 102.5;
    const shaftSizeX = 4000; // 横向无限宽
    const shaftHeight = 150; // 向上延伸 150 单位，制造深邃感
    const shaftGeo = new THREE.BoxGeometry(shaftSizeX, shaftHeight, shaftSizeZ);
    
    const shaftWallTex = textureLoader.load(AssetLibrary.textures.wall);
    shaftWallTex.wrapS = THREE.RepeatWrapping;
    shaftWallTex.wrapT = THREE.RepeatWrapping;
    shaftWallTex.repeat.set(80, 4); // 调整纹理比例以适应超宽的 X 轴
    
    const shaftWallMat = new THREE.MeshStandardMaterial({
        color: 0x555555,
        map: shaftWallTex,
        roughness: 0.9,
        side: THREE.BackSide // 从内部看
    });
    
    const shaftTopMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xccddee, // 偏冷的自然天光
        emissiveIntensity: 2.0,
        side: THREE.BackSide
    });
    
    const shaftBottomMat = new THREE.MeshBasicMaterial({ visible: false });
    
    // BoxGeometry 面顺序：[+x, -x, +y(顶), -y(底), +z, -z]
    const shaftMats = [
        shaftWallMat,   // +x
        shaftWallMat,   // -x
        shaftTopMat,    // +y (天光)
        shaftBottomMat, // -y (开口)
        shaftWallMat,   // +z
        shaftWallMat    // -z
    ];
    
    const shaftMesh = new THREE.Mesh(shaftGeo, shaftMats);
    // 放置在 z=-500, y = 天花板(40) + 竖井高度一半
    shaftMesh.position.set(0, 40 + shaftHeight / 2, -500);
    bgScene.add(shaftMesh);

    // --- 在天窗中心下方种植一棵树 ---
    // 树将放置在 Z=-500, 并且底部紧贴地板 (Y=-5)
    const treesGroup = new THREE.Group();
    bgScene.add(treesGroup);
    
    // 树的轮播配置
    const treeSpacing = 210; // 树与树之间的横向间距
    const treeCols = 25; // 确保覆盖横向视野
    const treeCycleWidth = treeCols * treeSpacing;

    const treeLoader = new GLTFLoader();
    treeLoader.load('./assets/tree/island_tree_01_4k.gltf/island_tree_01_4k.gltf', (gltf) => {
        const baseTree = gltf.scene;
        // 放大三倍 (10 -> 30)
        baseTree.scale.set(30, 30, 30); 
        
        // 开启阴影
        baseTree.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        // 克隆并生成森林阵列
        for (let i = 0; i < treeCols; i++) {
            const treeClone = baseTree.clone();
            const x = (i - Math.floor(treeCols / 2)) * treeSpacing;
            treeClone.position.set(x, -5, -500);
            
            // 给每棵树随机的旋转角度，避免看起来完全一样
            treeClone.rotation.y = Math.random() * Math.PI * 2;
            
            treesGroup.add(treeClone);
        }
    }, undefined, (error) => {
        console.error("Error loading tree:", error);
    });

    // 原天花板网格已被灯阵列替代，保留地板的 GridHelper 即可
    // const ceilGrid = new THREE.GridHelper(4000, 160, 0x111111, 0x111111); // 已停用

    // 3. 墙/墙面 (Wall)
    // 减小墙的高度，避免插入地板和天花板。高度 = 原高度(45) - 地板厚度 - 天花板灯厚度
    const wallHeight = 45 - floorTileThickness - lightThickness;
    // 墙的 Y 中心点也要相应偏移，正好夹在地板顶部和灯底部之间
    const wallCenterY = 17.5 + (floorTileThickness - lightThickness) / 2;
    const wallGeo = new THREE.PlaneGeometry(4000, wallHeight); 
    
    // 加载材质贴图 (复用上面定义的 textureLoader)
    const wallTexture = textureLoader.load(AssetLibrary.textures.wall);
    wallTexture.wrapS = THREE.RepeatWrapping;
    wallTexture.wrapT = THREE.RepeatWrapping;
    // 根据墙面的宽高比 (4000:44.3 ≈ 90:1)，让贴图比例协调
    wallTexture.repeat.set(40, 0.443);

    const wallMat = new THREE.MeshStandardMaterial({ 
        color: 0xffffff, 
        map: wallTexture, // 漫反射贴图
        emissive: 0xffffff, 
        emissiveMap: wallTexture, // 同样作为发光贴图，保证在白天模式依然亮堂但带有纹理
        emissiveIntensity: 1.2,
        roughness: 0.9 // 混凝土粗糙度
    });
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.set(0, wallCenterY, -895); // 放置在 z=-895，再次往后推移了450单位
    bgScene.add(wall);

    // 墙面板阵列：长方形面板按水平方向排列，仅保留垂直方向缝隙
    // 与天花板灯、地板瓷砖结构对称（InstancedMesh + 跟随相机吸附位移）
    // 缝隙对齐原则：
    //   - 三层共享 cellSpacing（缝中线位置完全一致）
    //   - 各自的"块宽度"独立可调，从而让缝宽（= cellSpacing - 块宽）可以单独控制
    //   - 例如：地板缝宽 = cellSpacing - floorTileSize；墙缝宽 = cellSpacing - wallPanelWidth
    const wallPanelWidth = 20.2;                       // 墙板宽度，独立可调（当前 20.2，与天花板灯一致，缝宽 0.3）
    const wallPanelSpacing = cellSpacing;              // 节奏与地板/天花板一致 → 缝中线对齐
    const wallPanelHeight = wallHeight;                // 与缩减后的墙等高，不再穿模地板和天花板
    const wallPanelThickness = 0.3;                    // 面板从墙面凸出的厚度
    const wallPanelCols = Math.floor(2000 / wallPanelSpacing);
    const wallPanelGeo = new THREE.BoxGeometry(wallPanelWidth, wallPanelHeight, wallPanelThickness);
    // 墙面板正面使用与地板一致的粗糙混凝土贴图（独立重新加载，避免污染地板的 UV）
    const wallPanelTexture = textureLoader.load(AssetLibrary.textures.ground);
    wallPanelTexture.wrapS = THREE.RepeatWrapping;
    wallPanelTexture.wrapT = THREE.RepeatWrapping;
    // 调整 repeat，原高 200 时垂直重复 6 次，现高等比例缩放
    wallPanelTexture.repeat.set(1, 6 * (wallPanelHeight / 200));
    // 面板正面（朝向相机的 +z 面）：粗糙混凝土
    // 加一档 emissiveMap 自发光，让墙面在仅有顶部灯光的房间里不会偏黑（与原 wallMat 同思路）
    const wallPanelFaceMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: wallPanelTexture,
        emissive: 0xffffff,
        emissiveMap: wallPanelTexture,
        emissiveIntensity: 1,    // 比原墙的 1.2 略低一档，避免太亮失去混凝土质感
        roughness: 0.95            // 高粗糙度，与地板一致的哑光混凝土质感
    });
    // 面板侧面用中灰描边，强化"一块一块"的立体感
    const wallPanelFrameMat = new THREE.MeshStandardMaterial({
        color: 0xaaaaaa, emissive: 0x000000, emissiveIntensity: 0
    });
    // BoxGeometry 面顺序：[+x, -x, +y, -y, +z, -z]
    const wallPanelMats = [
        wallPanelFrameMat, // +x 侧（垂直缝处的边框）
        wallPanelFrameMat, // -x 侧（垂直缝处的边框）
        wallPanelFrameMat, // +y 顶（在画面外）
        wallPanelFrameMat, // -y 底（在画面外）
        wallPanelFaceMat,  // +z 朝向相机的正面
        wallPanelFrameMat  // -z 贴墙的背面
    ];
    const wallPanels = new THREE.InstancedMesh(wallPanelGeo, wallPanelMats, wallPanelCols);
    {
        const dummy = new THREE.Object3D();
        let i = 0;
        for (let c = 0; c < wallPanelCols; c++) {
            // 墙板与地板瓷砖共用同一中心节奏（spacing 相同、起点相同），
            // 因此每块墙板正中心对齐其前方的一块地板瓷砖正中心，墙缝自然对齐地缝
            const x = (c - wallPanelCols / 2 + 0.5) * wallPanelSpacing;
            // 中心放在墙面前方（+z），让面板正面凸出原墙
            // 高度使用 wallCenterY，精确夹在地板和天花板之间
            dummy.position.set(x, wallCenterY, -895 + wallPanelThickness / 2);
            dummy.updateMatrix();
            wallPanels.setMatrixAt(i++, dummy.matrix);
        }
        wallPanels.instanceMatrix.needsUpdate = true;
    }

    wallPanelFaceMat.onBeforeCompile = (shader) => {
        shader.vertexShader = `
            varying vec3 vWorldInstancePos;
        ` + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
             vec4 instanceCenter = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
             vWorldInstancePos = (modelMatrix * instanceCenter).xyz;`
        );
        shader.fragmentShader = `
            varying vec3 vWorldInstancePos;
            float myCustomRand(vec2 co){
                return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
            }
        ` + shader.fragmentShader;
        // 在采样贴图前对 UV 做 per-instance 的偏移和翻转
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_fragment>',
            `#ifdef USE_MAP
               float cellSpacing = 20.5;
               float cellX = floor(vWorldInstancePos.x / cellSpacing + 0.5);
               vec2 cellId = vec2(cellX, 1.0); // Z 是常数，这里只按 X 随机
               
               float uOffset = myCustomRand(cellId * 1.1);
               float vOffset = myCustomRand(cellId * 2.2);
               float flip = myCustomRand(cellId * 3.3) > 0.5 ? 1.0 : 0.0;
               
               vec2 _wallUv = vMapUv;
               if (flip > 0.5) { _wallUv.x = 1.0 - _wallUv.x; }
               _wallUv += vec2(uOffset, vOffset);
               vec4 sampledDiffuseColor = texture2D( map, _wallUv );
               diffuseColor *= sampledDiffuseColor;
             #endif`
        );
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <emissivemap_fragment>',
            `#ifdef USE_EMISSIVEMAP
               float cellSpacingEm = 20.5;
               float cellXEm = floor(vWorldInstancePos.x / cellSpacingEm + 0.5);
               vec2 cellIdEm = vec2(cellXEm, 1.0);
               
               float uOffsetEm = myCustomRand(cellIdEm * 1.1);
               float vOffsetEm = myCustomRand(cellIdEm * 2.2);
               float flipEm = myCustomRand(cellIdEm * 3.3) > 0.5 ? 1.0 : 0.0;

               vec2 _wallEmUv = vEmissiveMapUv;
               if (flipEm > 0.5) { _wallEmUv.x = 1.0 - _wallEmUv.x; }
               _wallEmUv += vec2(uOffsetEm, vOffsetEm);
               vec4 emissiveColor = texture2D( emissiveMap, _wallEmUv );
               totalEmissiveRadiance *= emissiveColor.rgb;
             #endif`
        );
    };
    // onBeforeCompile 修改后强制重新编译
    wallPanelFaceMat.needsUpdate = true;

    bgScene.add(wallPanels);

    // --- 墙面装饰：著名画作阵列 ---
    const createBgLoader = () => {
        const loaderContainer = document.createElement('div');
        loaderContainer.className = 'model-loader-container';
        loaderContainer.style.position = 'fixed';
        loaderContainer.style.top = '0px'; 
        loaderContainer.style.left = '0px';
        loaderContainer.style.transform = 'translate(-50%, -50%)'; // 中心对齐
        loaderContainer.style.display = 'none'; // 默认隐藏，在渲染循环中控制
        
        const loaderRing = document.createElement('div');
        loaderRing.className = 'model-loader-ring';
        
        const loaderText = document.createElement('div');
        loaderText.className = 'model-loader-text';
        loaderText.innerText = '0%';
        
        loaderContainer.appendChild(loaderRing);
        loaderContainer.appendChild(loaderText);
        window.bgLabelsContainer.appendChild(loaderContainer);
        
        return { container: loaderContainer, text: loaderText };
    };

    const createBgLabel = (name, time, desc) => {
        const tag = document.createElement('div');
        tag.className = 'avatar-tag';
        tag.style.top = '0px'; 
        tag.style.left = '0px';
        tag.style.transform = 'translate(-50%, -100%)'; // 底部居中对齐到目标点
        tag.style.display = 'none'; // 默认隐藏
        
        let html = `
            <div class="active-indicator">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M6 5l6 6 6-6" />
                    <path d="M6 13l6 6 6-6" />
                </svg>
            </div>
            <span class="avatar-name">${name}</span>
        `;
        
        if (time) {
            html += `<span class="avatar-time" style="font-size: 12px; margin-top: 4px; font-weight: 500; letter-spacing: 0.5px;">${time}</span>`;
        }
        if (desc) {
            html += `<span class="avatar-desc" style="font-size: 11px; text-align: center; max-width: 180px; line-height: 1.4; margin-top: 2px;">${desc}</span>`;
        }
        
        tag.innerHTML = html;
        window.bgLabelsContainer.appendChild(tag);
        return tag;
    };

    const paintingsData = AssetLibrary.paintings;

    const paintingsGroup = new THREE.Group();
    const paintingMats = [];
    const paintingSpacing = 30; // 与角色轮播的 X 轴偏移步长一致

    // 1. 预先创建画框材质和 7 种画作的几何体/材质模板（复用资源，提升性能）
    const frameMat = new THREE.MeshStandardMaterial({
        color: 0x000000, // 黑色
        roughness: 0.8,
        metalness: 0.1
    });

    const paintingTemplates = paintingsData.map(data => {
        const frameThickness = 0.8;
        const frameDepth = 0.5;
        const frameGeo = new THREE.BoxGeometry(data.width + frameThickness * 2, data.height + frameThickness * 2, frameDepth);
        const canvasGeo = new THREE.PlaneGeometry(data.width, data.height);
        
        let isLoaded = false;
        const texture = textureLoader.load(data.url, () => {
            isLoaded = true;
        });
        // 重要修复：网上的 jpg 图片通常是 sRGB 色彩空间，避免发黑
        texture.colorSpace = THREE.SRGBColorSpace;
        
        const canvasMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: texture,
            roughness: 0.9,
            emissive: 0xffffff,
            emissiveMap: texture,
            emissiveIntensity: 0.1 // 微微发光保证清晰度
        });
        
        paintingMats.push(canvasMat); // 供主题切换时统一调整亮度
        
        return { frameGeo, canvasGeo, canvasMat, frameDepth, getIsLoaded: () => isLoaded };
    });

    // 2. 生成足够宽的画作阵列（铺满 4000 单位，远超相机单屏视野）
    // 之前只渲染了 7 幅画，导致相机平移 snap 时能看到整个画作组在空白墙上跳跃。
    // 现在用 133 幅画填满墙面，snap 平移时视觉上将实现完美的无缝衔接。
    const paintingCols = 70; 
    const halfCols = Math.floor(paintingCols / 2);

    for (let c = 0; c < paintingCols; c++) {
        // 保证 c = halfCols 时（即 x = 0），对应的是 index = 3 的画作
        let dataIndex = (c - halfCols + 3) % paintingsData.length;
        if (dataIndex < 0) dataIndex += paintingsData.length;
        
        const template = paintingTemplates[dataIndex];
        const paintingGroup = new THREE.Group();
        
        const x = (c - halfCols) * paintingSpacing;
        // 高度改为 wallCenterY 保持在墙面正中心，Z 轴稍微凸出墙板
        paintingGroup.position.set(x, wallCenterY, -294.6 + wallPanelThickness);
        
        const frame = new THREE.Mesh(template.frameGeo, frameMat);
        paintingGroup.add(frame);
        
        const canvasMesh = new THREE.Mesh(template.canvasGeo, template.canvasMat);
        canvasMesh.position.z = template.frameDepth / 2 + 0.01;
        paintingGroup.add(canvasMesh);
        
        // 创建标签并存储在 userData 中
        const paintingData = paintingsData[dataIndex];
        const label = createBgLabel(paintingData.name || "Art", paintingData.time || "", paintingData.desc || "");
        // 标签高度在画框上方
        const labelYOffset = (paintingData.height || 10) / 2 + 3;
        
        // 创建加载圈
        const loader = createBgLoader();
        
        paintingGroup.userData = { 
            labelType: 'painting', 
            labelElement: label, 
            labelWorldOffset: new THREE.Vector3(0, labelYOffset, 0),
            loaderElement: loader.container,
            loaderText: loader.text,
            getIsLoaded: template.getIsLoaded
        };
        window.bgLabels.push(paintingGroup);

        paintingsGroup.add(paintingGroup);
    }
    bgScene.add(paintingsGroup);

    // 墙面网格骨架 (移除网格，让混凝土纹理更纯粹)
    // 因为这面墙上已经有了贴图带来的分隔缝隙，再叠加上黑色的 GridHelper 会显得杂乱
    // const wallGrid = new THREE.GridHelper(4000, 160, 0x111111, 0x111111);
    // wallGrid.material.vertexColors = false;
    // wallGrid.material.color.setHex(0x111111);
    // wallGrid.rotation.x = Math.PI / 2;
    // wallGrid.position.set(0, 10, -294.9); 
    // wallGrid.scale.set(1, 1, 0.6); 
    // bgScene.add(wallGrid);

    // --- 悬浮产品展示 (Product Showcase) ---
    const showcaseGroup = new THREE.Group();
    const showcaseSpacing = 30; // 与角色/画作间距保持一致
    const showcaseCols = 70; 
    const halfShowcaseCols = Math.floor(showcaseCols / 2);
    
    // 占位几何体和材质（当没有配置模型时使用）
    const holoGeo = new THREE.BoxGeometry(4, 4, 4);
    const holoMat = new THREE.MeshStandardMaterial({
        color: 0x00ffff,
        emissive: 0x00ffff,
        emissiveIntensity: 0.8,
        transparent: true,
        opacity: 0.6,
        wireframe: true // 增加科技感
    });

    const animatedShowcaseItems = []; // 保存需要做动画的物品
    const gltfLoader = new GLTFLoader();

    // 拿到我们配置的产品列表
    const productList = AssetLibrary.products && AssetLibrary.products.length > 0 
        ? AssetLibrary.products 
        : [];
         
    // 保存各个产品的全局旋转状态，以便轮播时保持状态
    // 默认视角：模型向前倾斜45度 (Math.PI / 4)，视频垂直于地面 (0)
    const globalProductRotations = productList.length > 0 
        ? productList.map((product) => ({ 
            x: product.type === 'video' ? 0 : Math.PI / 4, 
            y: 0 
        }))
        : [{ x: Math.PI / 4, y: 0 }];

    // 全局视频纹理缓存，避免同一个视频重复创建多个 video 标签导致声音重叠和性能问题
    if (!window.globalVideoCache) window.globalVideoCache = {};
    const globalVideoCache = window.globalVideoCache;

    for (let c = 0; c < showcaseCols; c++) {
        const x = (c - halfShowcaseCols) * showcaseSpacing;
        const z = -150; // 中景位置
        
        // 创建一个外层容器，用来承载几何体或加载后的模型
        const itemContainer = new THREE.Group();
        // 将产品的基础高度设为墙高度的一半 (wallCenterY)
        const baseItemY = wallCenterY;
        itemContainer.position.set(x, baseItemY, z);
        
        if (productList.length > 0) {
            // 根据循环索引 c 拿到对应的产品配置
            const productConfig = productList[c % productList.length];
            
            if (productConfig && productConfig.url) {
                if (productConfig.type === 'video') {
                    // --- 视频类型产品加载逻辑 ---
                    let videoTexture;
                    let video;
                    
                    if (globalVideoCache[productConfig.url]) {
                        // 复用已存在的视频纹理
                        videoTexture = globalVideoCache[productConfig.url].texture;
                        video = globalVideoCache[productConfig.url].video;
                    } else {
                        // 首次加载该视频
                        video = document.createElement('video');
                        video.src = productConfig.url;
                        video.crossOrigin = 'anonymous';
                        video.loop = true;
                        video.playsInline = true;
                        
                        if (productConfig.keepAudio) {
                            video.muted = false; // 保留原始音频
                        } else {
                            video.muted = true;
                        }
                        
                        // 不在初始化时立即 play()，而是等到切换到它时再 play
                        videoTexture = new THREE.VideoTexture(video);
                        videoTexture.colorSpace = THREE.SRGBColorSpace;
                        
                        if (!window.globalVideoCache) window.globalVideoCache = {};
                        window.globalVideoCache[productConfig.url] = { texture: videoTexture, video: video };
                    }
                    
                    const targetSize = productConfig.targetSize || 16;
                    
                    // 默认先用 16:9 的比例创建一个投影面
                    const screenGeo = new THREE.PlaneGeometry(targetSize, targetSize * (9/16));
                    // 改用 MeshBasicMaterial，它完全不受场景灯光影响，绝对不会产生反光
                    const screenMat = new THREE.MeshBasicMaterial({ 
                        map: videoTexture, 
                        transparent: true, 
                        opacity: 0.9, 
                        side: THREE.DoubleSide // 双面可见
                    });
                    const screenMesh = new THREE.Mesh(screenGeo, screenMat);
                    itemContainer.add(screenMesh);
                    
                    // --- 视频控制栏 UI ---
                    const controlsGroup = new THREE.Group();
                    
                    // 播放/暂停按钮 (正方形小块，根据播放状态改变颜色或使用贴图，这里简单用颜色区分)
                    const btnGeo = new THREE.PlaneGeometry(1.5, 1.5);
                    const btnMat = new THREE.MeshBasicMaterial({ 
                        color: video.paused ? 0xff0000 : 0x00ff00, 
                        side: THREE.DoubleSide,
                        transparent: true,
                        opacity: 0.9
                    });
                    const playPauseBtn = new THREE.Mesh(btnGeo, btnMat);
                    playPauseBtn.position.set(-targetSize / 2 + 0.75, 0, 0);
                    playPauseBtn.userData = { isPlayPauseBtn: true, video: video, btnMat: btnMat };
                    controlsGroup.add(playPauseBtn);
                    
                    // 进度条轨道
                    const trackWidth = targetSize - 2.5;
                    const trackGeo = new THREE.PlaneGeometry(trackWidth, 0.3);
                    const trackMat = new THREE.MeshBasicMaterial({ 
                        color: 0x555555, 
                        side: THREE.DoubleSide,
                        transparent: true,
                        opacity: 0.9
                    });
                    const trackMesh = new THREE.Mesh(trackGeo, trackMat);
                    trackMesh.position.set(0.75, 0, 0); // 居中于剩余空间
                    trackMesh.userData = { isTrack: true, video: video, trackWidth: trackWidth };
                    controlsGroup.add(trackMesh);
                    
                    // 进度条高亮
                    const progressGeo = new THREE.PlaneGeometry(1, 0.3); // 初始宽度为1，之后通过 scale.x 调整
                    const progressMat = new THREE.MeshBasicMaterial({ 
                        color: 0x00ffff, 
                        side: THREE.DoubleSide,
                        transparent: true,
                        opacity: 0.9
                    });
                    const progressMesh = new THREE.Mesh(progressGeo, progressMat);
                    progressGeo.translate(0.5, 0, 0); // 将原点移到左侧边缘，方便缩放
                    progressMesh.position.set(0.75 - trackWidth / 2, 0, 0.01); // 放在 track 上面一点点，避免深度冲突
                    controlsGroup.add(progressMesh);
                    
                    itemContainer.add(controlsGroup);
                    
                    // 将相关引用保存到 itemContainer 中，供全局动画更新
                    itemContainer.userData = {
                        isVideo: true,
                        video: video,
                        progressMesh: progressMesh,
                        trackWidth: trackWidth,
                        playPauseBtn: playPauseBtn
                    };
                    
                    // 添加完全透明的碰撞盒(HitBox)
                    const hitBoxGeo = new THREE.BoxGeometry(targetSize, targetSize, targetSize);
                    const hitBoxMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
                    const hitBox = new THREE.Mesh(hitBoxGeo, hitBoxMat);
                    itemContainer.add(hitBox);
                    
                    let isLoaded = false;
                    
                    // 创建标签并存储
                    const label = createBgLabel(productConfig.name || "Video", productConfig.time || "", productConfig.desc || "");
                    // 初始高度随便设，等视频加载完元数据后会动态调整
                    let labelYOffset = targetSize / 2 + 3;
                    
                    // 创建加载圈
                    const loader = createBgLoader();
                    
                    itemContainer.userData.labelType = 'product';
                    itemContainer.userData.labelElement = label;
                    itemContainer.userData.labelWorldOffset = new THREE.Vector3(0, labelYOffset, 0);
                    itemContainer.userData.loaderElement = loader.container;
                    itemContainer.userData.loaderText = loader.text;
                    itemContainer.userData.getIsLoaded = () => isLoaded;
                    window.bgLabels.push(itemContainer);
                    
                    const updateVideoLayout = (aspect) => {
                        isLoaded = true;
                        if (loader.text) loader.text.innerText = '100%';
                        setTimeout(() => {
                            if (loader.container) loader.container.style.display = 'none';
                        }, 200);
                        const height = targetSize / aspect;
                        screenMesh.geometry.dispose();
                        screenMesh.geometry = new THREE.PlaneGeometry(targetSize, height);
                        hitBox.geometry.dispose();
                        hitBox.geometry = new THREE.BoxGeometry(targetSize, height, targetSize);
                        
                        // 动态更新标签的高度，确保它始终在视频的正上方
                        itemContainer.userData.labelWorldOffset.y = height / 2 + 3;
                        
                        // 将控制栏放到视频正下方
                        controlsGroup.position.set(0, -height / 2 - 1.5, 0);
                    };

                    // 如果视频已经加载了元数据，直接调整比例
                    if (video.videoWidth) {
                        updateVideoLayout(video.videoWidth / video.videoHeight);
                    } else {
                        // 否则等待加载完成事件
                        video.addEventListener('loadedmetadata', () => {
                            updateVideoLayout(video.videoWidth / video.videoHeight);
                        });
                    }
                    
                } else {
                    // --- 模型类型产品加载逻辑 (默认 GLB) ---
                    let isLoaded = false;
                    let loadProgress = 0;
                    const targetSize = productConfig.targetSize || 16;
                    
                    const label = createBgLabel(productConfig.name || "Model", productConfig.time || "", productConfig.desc || "");
                    const labelYOffset = targetSize / 2 + 3;
                    const loader = createBgLoader();
                    
                    itemContainer.userData.labelType = 'product';
                    itemContainer.userData.labelElement = label;
                    itemContainer.userData.labelWorldOffset = new THREE.Vector3(0, labelYOffset, 0);
                    itemContainer.userData.loaderElement = loader.container;
                    itemContainer.userData.loaderText = loader.text;
                    itemContainer.userData.getIsLoaded = () => isLoaded;
                    window.bgLabels.push(itemContainer);

                    gltfLoader.load(productConfig.url, (gltf) => {
                        isLoaded = true;
                        if (loader.text) loader.text.innerText = '100%';
                        setTimeout(() => {
                            if (loader.container) loader.container.style.display = 'none';
                        }, 200);

                        const model = gltf.scene;
                        
                        const box = new THREE.Box3().setFromObject(model);
                        const size = new THREE.Vector3();
                        box.getSize(size);
                        const maxDim = Math.max(size.x, size.y, size.z);
                        
                        if (maxDim > 0) {
                            const scale = targetSize / maxDim;
                            model.scale.set(scale, scale, scale);
                        }
                        
                        // 居中模型
                        box.setFromObject(model);
                        box.getCenter(size);
                        model.position.sub(size); // 调整位置使中心对齐容器原点

                        itemContainer.add(model);
                        
                        // 添加一个完全透明的碰撞盒(HitBox)
                        const hitBoxGeo = new THREE.BoxGeometry(targetSize, targetSize, targetSize);
                        const hitBoxMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
                        const hitBox = new THREE.Mesh(hitBoxGeo, hitBoxMat);
                        itemContainer.add(hitBox);
                    }, (xhr) => {
                        if (xhr.lengthComputable) {
                            const percentComplete = Math.round((xhr.loaded / xhr.total) * 100);
                            if (loader.text) loader.text.innerText = percentComplete + '%';
                        }
                    }, (error) => {
                        console.error(`Error loading product (${productConfig.url}):`, error);
                        itemContainer.add(new THREE.Mesh(holoGeo, holoMat));
                        const hitBoxGeo = new THREE.BoxGeometry(4, 4, 4);
                        const hitBoxMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
                        itemContainer.add(new THREE.Mesh(hitBoxGeo, hitBoxMat));
                    });
                }
            }
        } else {
            // 如果列表为空，默认使用占位符
            itemContainer.add(new THREE.Mesh(holoGeo, holoMat));
            const hitBoxGeo = new THREE.BoxGeometry(4, 4, 4);
            const hitBoxMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
            itemContainer.add(new THREE.Mesh(hitBoxGeo, hitBoxMat));
        }
        
        showcaseGroup.add(itemContainer);
        animatedShowcaseItems.push({
            mesh: itemContainer,
            baseY: baseItemY,
            seed: c * 0.1, // 用于动画错位
            productIndex: productList.length > 0 ? (c % productList.length) : 0 // 记录产品索引，用于同步旋转
        });
    }
    bgScene.add(showcaseGroup);

    // --- 展品交互 (Product Interaction) ---
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let selectedProduct = null;
    let isDraggingProduct = false;
    let isDraggingVideoTrack = false;
    let draggedVideoTrackMesh = null;
    let previousMousePosition = { x: 0, y: 0 };
    let productPointerDownX = 0;
    let productPointerDownY = 0;
    let productPointerDownTime = 0;

    window.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return; // 只响应左键
        
        // 避免和 UI 控件的拖拽冲突
        if (e.target.closest && (e.target.closest('button') || e.target.closest('input'))) {
            return;
        }

        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, bgCamera);

        // 仅检测展示组内的物体
        const intersects = raycaster.intersectObjects(showcaseGroup.children, true);

        if (intersects.length > 0) {
            let intersectedMesh = intersects[0].object;

            let object = intersectedMesh;
            // 向上追溯到 itemContainer 层级
            while (object.parent && object.parent !== showcaseGroup) {
                object = object.parent;
            }
            selectedProduct = object;
            isDraggingProduct = true;
            previousMousePosition = { x: e.clientX, y: e.clientY };
            
            productPointerDownX = e.clientX;
            productPointerDownY = e.clientY;
            productPointerDownTime = Date.now();
            
            // 如果点中了产品，强制阻止事件继续向下传递（这会阻止角色 Canvas 接收到该点击，从而防止角色旋转）
            e.stopPropagation();
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    }, { capture: true }); // 使用捕获阶段，抢在其他元素之前处理

    window.addEventListener('pointermove', (e) => {
        if (isDraggingProduct && selectedProduct) {
            const deltaX = e.clientX - previousMousePosition.x;
            const deltaY = e.clientY - previousMousePosition.y;
            
            // 找到当前选中的产品对应的索引
            const itemData = animatedShowcaseItems.find(item => item.mesh === selectedProduct);
            if (itemData && globalProductRotations[itemData.productIndex]) {
                const rot = globalProductRotations[itemData.productIndex];
                rot.y += deltaX * 0.01;
                rot.x += deltaY * 0.01;
            } else {
                // 降级保护
                selectedProduct.rotation.y += deltaX * 0.01;
                selectedProduct.rotation.x += deltaY * 0.01;
            }
            
            previousMousePosition = { x: e.clientX, y: e.clientY };
            
            // 旋转产品时，重置自动轮播计时器，防止背景突然滑走
            if (window.resetAutoRotateTimer) window.resetAutoRotateTimer();
            e.stopPropagation();
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    }, { capture: true });

    const stopDragging = (e) => {
        if (isDraggingProduct) {
            const dx = e.clientX - productPointerDownX;
            const dy = e.clientY - productPointerDownY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const timeElapsed = Date.now() - productPointerDownTime;

            isDraggingProduct = false;
            selectedProduct = null;
            e.stopPropagation();
            e.preventDefault();
            e.stopImmediatePropagation();

            // 如果是单击，触发轮播切换
            if (distance < 10 && timeElapsed < 500) {
                if (window.handleCarouselClick) {
                    window.handleCarouselClick(e.clientX);
                }
            }
        }
    };
    window.addEventListener('pointerup', stopDragging, { capture: true });
    window.addEventListener('pointercancel', stopDragging, { capture: true });

    // --- 视频键盘交互 ---
    window.addEventListener('keydown', (e) => {
        // 如果用户正在输入框里打字，不要拦截按键
        if (e.target.tagName.toLowerCase() === 'input' || e.target.tagName.toLowerCase() === 'textarea') {
            return;
        }

        // 产品位于 z = -150，墙位于 z = -895。
        // 相机越靠近产品，其 Z 坐标越接近 -150，甚至更小。
        // 我们通过相机的 Z 坐标来判断用户是否在产品层（比如当 z 在 -80 到 -200 之间时算作产品层）
        const cameraZ = bgCamera.position.z;
        const isAtProductLayer = cameraZ <= -80 && cameraZ >= -200;
        
        if (!isAtProductLayer) return;

        const activeProductIndex = window._lastActiveProductIndex;
        if (activeProductIndex === -1 || !productList[activeProductIndex]) return;
        
        const activeProduct = productList[activeProductIndex];
        if (activeProduct.type !== 'video') return;
        
        const cache = globalVideoCache[activeProduct.url];
        if (!cache || !cache.video) return;
        
        const video = cache.video;

        if (e.code === 'Space') {
            e.preventDefault(); // 防止空格键使页面向下滚动
            // 切换当前视频的播放/暂停
            if (video.paused) {
                playVideoWithAudioFallback(video, activeProduct.keepAudio);
            } else {
                video.pause();
            }
        } else if (e.code === 'ArrowLeft') {
            // 快退 5 秒
            video.currentTime = Math.max(0, video.currentTime - 5);
        } else if (e.code === 'ArrowRight') {
            // 快进 5 秒
            if (video.duration) {
                video.currentTime = Math.min(video.duration, video.currentTime + 5);
            }
        }
    });

    // 4. 灯光系统
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0); 
    bgScene.add(ambientLight);
    
    // 顶部主光源：从正上方向下照射，照亮产品顶部
    const topLight = new THREE.DirectionalLight(0xffffff, 2);
    topLight.position.set(0, 100, 0);
    bgScene.add(topLight);

    // 底部补光：从正下方向上照射，防止产品旋转时底部死黑
    const bottomLight = new THREE.DirectionalLight(0xffffff, 1.5);
    bottomLight.position.set(0, -100, 0);
    bgScene.add(bottomLight);

    // 正面辅助光：从正前方照射
    const frontLight = new THREE.DirectionalLight(0xffffff, 1.2);
    frontLight.position.set(0, 0, 100); 
    bgScene.add(frontLight);

    // 背面辅助光：从正后方照射，确保旋转到背面依然清晰
    const backLight = new THREE.DirectionalLight(0xffffff, 1.2);
    backLight.position.set(0, 0, -100); 
    bgScene.add(backLight);

    const playVideoWithAudioFallback = (video, keepAudio) => {
        const playPromise = video.play();
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                // 浏览器限制了非静音自动播放，先静音播放
                console.warn('Autoplay blocked for video, muting to play:', error);
                video.muted = true;
                video.play();
                
                // 如果用户要求保留音频，我们监听第一次交互事件来解除静音
                if (keepAudio) {
                    const unmuteHandler = () => {
                        video.muted = false;
                        window.removeEventListener('pointerdown', unmuteHandler);
                        window.removeEventListener('wheel', unmuteHandler);
                        window.removeEventListener('keydown', unmuteHandler);
                    };
                    window.addEventListener('pointerdown', unmuteHandler);
                    window.addEventListener('wheel', unmuteHandler);
                    window.addEventListener('keydown', unmuteHandler);
                }
            });
        }
    };

    // 启动背景渲染动画循环
    window._lastActiveProductIndex = -1;
    const animateBg = () => {
        requestAnimationFrame(animateBg);
        
        // 平滑过渡背景相机的 X 轴平移
        bgCamera.position.x += (window.bgTargetPositionX - bgCamera.position.x) * 0.08;
        // 平滑过渡背景相机的 Z 轴推进（鼠标滚轮控制：向墙面"穿过模型"聚焦）
        bgCamera.position.z += (window.bgTargetPositionZ - bgCamera.position.z) * 0.08;

        // 让 DOM 角色跟随背景相机的 Z 轴推进做"穿过"特效：
        //   - 背景相机本身在独立的 bgScene 里，不会真的穿过角色（角色是 DOM 覆盖层）
        //   - 通过 CSS scale + opacity 模拟：相机越靠近墙，角色越大、越透明，最终消失
        //   - progress: 0 (未推进) → 1 (角色完全消失)
        //   - 使用 BG_FADE_RANGE 控制"角色完全消失"对应的相机推进距离
        const BG_FADE_RANGE = 100; // 相机沿 z 推进多少单位后角色完全消失
        const advance = 40 - bgCamera.position.z; // bgCamera 初始 z=40，advance>0 表示在向墙推进
        const fadeProgress = Math.max(0, Math.min(1, advance / BG_FADE_RANGE));

        // 同步抬升相机视角高度：从原始 y=8 抬到墙面中心高度
        //   - fadeProgress 0 → 1 时 y 从 8 → wallCenterY，与"穿过角色"的过程同步
        //   - lookAt 始终指向墙面中心（z=-900, y=wallCenterY），保证抬高后仍水平正对墙
        const BG_Y_BASE = 8;
        const BG_Y_TARGET = wallCenterY; // 墙体几何中心
        const currentY = BG_Y_BASE + (BG_Y_TARGET - BG_Y_BASE) * fadeProgress;
        bgCamera.position.y = currentY;
        // 确保视线的 Y 高度也同步抬升，保持平视，而不是一开始就仰视
        bgCamera.lookAt(bgCamera.position.x, currentY, -900);

        const turntableEl = document.getElementById('carousel-turntable');
        if (turntableEl) {
            // 角色边变大边淡出：scale 1 → 4，opacity 1 → 0
            const carouselScale = 1 + fadeProgress * 3;
            turntableEl.style.transform = `scale(${carouselScale})`;
            turntableEl.style.opacity = String(1 - fadeProgress);
            // 完全淡出后关闭交互，避免拦截滚轮
            turntableEl.style.pointerEvents = fadeProgress >= 1 ? 'none' : '';
        }

        // 聊天输入框跟随角色一起淡出
        const inputContainer = document.getElementById('talkinghead-input-container');
        if (inputContainer && inputContainer.dataset.disabled !== "true") {
            inputContainer.style.opacity = String(1 - fadeProgress);
            inputContainer.style.pointerEvents = fadeProgress >= 1 ? 'none' : 'auto';
        }
        const loadingEl = document.getElementById('talkinghead-loading');
        if (loadingEl) {
            loadingEl.style.opacity = String(1 - fadeProgress);
        }

        // 大黄和X角色的右键提示图标也跟随淡出
        document.querySelectorAll('.mouse-click-anim').forEach(anim => {
            if (anim.parentElement) {
                anim.parentElement.style.opacity = String(1 - fadeProgress);
                anim.parentElement.style.pointerEvents = 'none'; // 确保本身就不阻挡事件
            }
        });

        // 1. 让天、地、墙直接跟随相机 X 轴移动，所以它们相对相机永远静止且无限延伸
        floor.position.x = bgCamera.position.x;
        ceil.position.x = bgCamera.position.x;
        wall.position.x = bgCamera.position.x;

        // 2. 网格单格尺寸是 4000/160 = 25。将其吸附到 25 的整数倍
        const gridOffsetX = Math.round(bgCamera.position.x / 25) * 25;
        // 灯阵列按 lightSpacing 吸附式平移
        ceilLights.position.x = Math.round(bgCamera.position.x / lightSpacing) * lightSpacing;
        
        // 恢复地板瓷砖阵列和墙面板的 snap-shift，因为它们的随机 UV 现在基于世界绝对坐标计算，不会发生跳变了
        floorTiles.position.x = Math.round(bgCamera.position.x / floorTileSpacing) * floorTileSpacing;
        wallPanels.position.x = Math.round(bgCamera.position.x / wallPanelSpacing) * wallPanelSpacing;
        shaftMesh.position.x = Math.round(bgCamera.position.x / cellSpacing) * cellSpacing;
        
        // 让画作阵列按周期跟随相机循环（共 7 幅画，周期宽度 210）
        // 因为现在画作阵列已经铺满了 4000 单位，当整体平移 210 单位时，
        // 第 0 幅画刚好移动到第 7 幅画的位置，视觉上实现了完美的无缝衔接，消除了突然位移的违和感。
        const paintingCycleWidth = paintingsData.length * paintingSpacing;
        paintingsGroup.position.x = Math.round(bgCamera.position.x / paintingCycleWidth) * paintingCycleWidth;

        // 展台阵列按周期跟随相机循环（根据实际配置的产品数量自动计算周期宽度）
        const showcaseCycleWidth = Math.max(1, productList.length) * showcaseSpacing;
        showcaseGroup.position.x = Math.round(bgCamera.position.x / showcaseCycleWidth) * showcaseCycleWidth;

        // 树木阵列按周期跟随相机循环
        if (typeof treeCycleWidth !== 'undefined') {
            treesGroup.position.x = Math.round(bgCamera.position.x / treeCycleWidth) * treeCycleWidth;
        }

        // 动态判断当前位于视野中心的产品索引，控制视频按需播放
        const N = productList.length;
        if (N > 0) {
            // 通过相机的绝对 Z 坐标判断是否在产品层（产品在 z=-150）
            // 设定在 z 位于 -80 到 -200 之间时，视频可以被激活
            const isAtProductLayer = bgCamera.position.z <= -80 && bgCamera.position.z >= -200;

            // 使用 window.bgTargetPositionX 预测目标位置，确保刚开始切换就立刻响应
            const activeSlot = Math.round(window.bgTargetPositionX / showcaseSpacing);
            const activeProductIndex = ((activeSlot + halfShowcaseCols) % N + N) % N;
            
            if (activeProductIndex !== window._lastActiveProductIndex || !isAtProductLayer) {
                // 暂停所有视频
                Object.values(globalVideoCache).forEach(cache => {
                    if (cache.video && !cache.video.paused) {
                        cache.video.pause();
                    }
                });

                if (isAtProductLayer) {
                    window._lastActiveProductIndex = activeProductIndex;
                    // 播放当前居中的视频
                    const activeProduct = productList[activeProductIndex];
                    if (activeProduct && activeProduct.type === 'video') {
                        const cache = globalVideoCache[activeProduct.url];
                        if (cache && cache.video) {
                            playVideoWithAudioFallback(cache.video, activeProduct.keepAudio);
                        }
                    }
                } else {
                    // 如果不在产品层，将索引置空，确保下次进入产品层时会重新触发播放
                    window._lastActiveProductIndex = -1;
                }
            }
        }

        // 展品动画（平滑浮动，移除了自转）
        const animTime = Date.now() * 0.001; // 秒
        animatedShowcaseItems.forEach(item => {
            // 上下浮动
            item.mesh.position.y = item.baseY + Math.sin(animTime * 2 + item.seed) * 0.5;
            
            // 同步全局旋转状态
            if (globalProductRotations[item.productIndex]) {
                item.mesh.rotation.x = globalProductRotations[item.productIndex].x;
                item.mesh.rotation.y = globalProductRotations[item.productIndex].y;
            }
            
            // 同步视频 UI 状态
            if (item.mesh.userData && item.mesh.userData.isVideo) {
                const video = item.mesh.userData.video;
                const progressMesh = item.mesh.userData.progressMesh;
                const trackWidth = item.mesh.userData.trackWidth;
                const playPauseBtn = item.mesh.userData.playPauseBtn;
                
                if (video && progressMesh && trackWidth && video.duration) {
                    const progress = video.currentTime / video.duration;
                    progressMesh.scale.x = Math.max(0.001, progress * trackWidth);
                }
                
                if (video && playPauseBtn) {
                    // 根据播放状态改变按钮颜色 (红:暂停, 绿:播放)
                    playPauseBtn.material.color.setHex(video.paused ? 0xff0000 : 0x00ff00);
                }
            }
        });



        // 【关键】：让墙面的纹理随着相机的移动而产生滚动偏移
        // 墙面的宽度是 4000，repeat 是 40，说明每一块水泥板的实际宽度是 100 单位
        // 所以当相机移动 x 时，UV 的 offset x 应该是 相机x / 4000
        wallTexture.offset.x = (bgCamera.position.x / 4000) * 40;
        // 地板瓷砖现在通过吸附位移实现循环，无需再做 UV offset
        // floorTexture.offset.x = (bgCamera.position.x / 4000) * 40; // 已停用

        // --- 更新 3D UI 标签 ---
        if (window.bgLabels) {
            const cameraZ = bgCamera.position.z;
            
            // 根据相机深度判断当前聚焦的层级
            let currentLayer = 'none';
            if (cameraZ <= -50 && cameraZ > -160) {
                currentLayer = 'product'; // 产品层区间
            } else if (cameraZ <= -160) {
                currentLayer = 'painting'; // 画作层区间
            }
            
            if (currentLayer !== 'none') {
                const tempV = new THREE.Vector3();
                const tempVLoader = new THREE.Vector3();
                window.bgLabels.forEach(obj => {
                    const { labelType, labelElement, labelWorldOffset, loaderElement, getIsLoaded } = obj.userData;
                    if (labelElement && labelWorldOffset) {
                        
                        // 如果这个标签的类型不属于当前聚焦的层，直接隐藏
                        if (labelType !== currentLayer) {
                            labelElement.style.display = 'none';
                            if (loaderElement) loaderElement.style.display = 'none';
                            return;
                        }

                        // 获取物体的世界坐标并加上偏移
                        tempV.setFromMatrixPosition(obj.matrixWorld);
                        tempV.add(labelWorldOffset);
                        
                        // 判断物体是否在相机背后
                        const distToCamera = tempV.z - bgCamera.position.z;
                        if (distToCamera > 0) {
                            labelElement.style.display = 'none';
                            if (loaderElement) loaderElement.style.display = 'none';
                        } else {
                            // 投影到屏幕坐标
                            tempV.project(bgCamera);
                            
                            // 判断是否在屏幕内 (-1 到 1)
                            if (tempV.x >= -1 && tempV.x <= 1 && tempV.y >= -1 && tempV.y <= 1 && tempV.z >= -1 && tempV.z <= 1) {
                                const x = (tempV.x * 0.5 + 0.5) * window.innerWidth;
                                const y = (tempV.y * -0.5 + 0.5) * window.innerHeight;
                                
                                labelElement.style.display = 'flex';
                                labelElement.style.transform = `translate(-50%, -100%) scale(${0.7 + fadeProgress * 0.3})`; // 远小近大
                                labelElement.style.left = `${x}px`;
                                labelElement.style.top = `${y}px`;
                                
                                // 根据相机的深度和 fadeProgress 计算透明度
                                // 如果在第一层 (角色层)，fadeProgress 接近 0，则背景标签透明度低
                                // 如果进入背景层，fadeProgress 接近 1，则背景标签透明度高
                                labelElement.style.opacity = String(fadeProgress);
                                
                                // 处理加载圈
                                if (loaderElement && getIsLoaded) {
                                    if (!getIsLoaded()) {
                                        // 还没加载完，更新加载圈位置
                                        tempVLoader.setFromMatrixPosition(obj.matrixWorld);
                                        tempVLoader.project(bgCamera);
                                        const lx = (tempVLoader.x * 0.5 + 0.5) * window.innerWidth;
                                        const ly = (tempVLoader.y * -0.5 + 0.5) * window.innerHeight;
                                        
                                        loaderElement.style.display = 'flex';
                                        loaderElement.style.transform = `translate(-50%, -50%) scale(${0.7 + fadeProgress * 0.3})`;
                                        loaderElement.style.left = `${lx}px`;
                                        loaderElement.style.top = `${ly}px`;
                                        loaderElement.style.opacity = String(fadeProgress);
                                    } else {
                                        loaderElement.style.display = 'none';
                                    }
                                }
                            } else {
                                labelElement.style.display = 'none';
                                if (loaderElement) loaderElement.style.display = 'none';
                            }
                        }
                    }
                });
            } else {
                // 如果根本不到显示区间，全部隐藏
                window.bgLabels.forEach(obj => {
                    if (obj.userData.labelElement) {
                        obj.userData.labelElement.style.display = 'none';
                    }
                    if (obj.userData.loaderElement) {
                        obj.userData.loaderElement.style.display = 'none';
                    }
                });
            }
        }

        bgRenderer.render(bgScene, bgCamera);
    };
    animateBg();

    // --- 主题切换监听逻辑 ---
    const updateBackgroundTheme = () => {
        const theme = document.body.getAttribute('data-theme') || 'dark';
        
        if (theme === 'light') {
            // 白天模式：白色格子，黑色线
            bgScene.background.setHex(0xffffff);
            
            // 地板：底板（缝隙）浅灰，瓷砖恢复为纯白底色让贴图正常呈现
            floorMat.color.setHex(0xdcdcdc);
            floorMat.emissive.setHex(0x000000);
            floorMat.emissiveIntensity = 0;
            floorTileMat.color.setHex(0xffffff);
            
            ceilMat.color.setHex(0xdcdcdc); // 恢复浅灰背板（缝隙颜色）
            ceilMat.emissive.setHex(0x000000);
            ceilMat.emissiveIntensity = 0;
            // 白天模式灯亮度
            ceilLightMat.emissiveIntensity = 0.8;
            
            wallMat.color.setHex(0xffffff);
            wallMat.emissive.setHex(0xffffff);
            wallMat.emissiveIntensity = 1.2;
            // 墙面板正面同步：白天纯白底色 + 强自发光，让混凝土贴图明亮
            wallPanelFaceMat.color.setHex(0xffffff);
            wallPanelFaceMat.emissive.setHex(0xffffff);
            wallPanelFaceMat.emissiveIntensity = 0.8;
            // 面板侧面框：白天用浅灰让缝隙更柔和
            wallPanelFrameMat.color.setHex(0xaaaaaa);
            
            // 画作在白天模式保持明亮
            paintingMats.forEach(mat => mat.emissiveIntensity = 0.2);
            // wallGrid.material.color.setHex(0x111111);
        } else {
            // 夜间模式：黑色格子，白色线
            bgScene.background.setHex(0x020202);
            
            // 地板：底板（缝隙）调暗，瓷砖也调成中灰让混凝土纹理仍可见
            floorMat.color.setHex(0x222222);
            floorMat.emissive.setHex(0x000000);
            floorMat.emissiveIntensity = 0;
            floorTileMat.color.setHex(0x888888);
            
            ceilMat.color.setHex(0x050505);
            ceilMat.emissive.setHex(0x000000);
            ceilMat.emissiveIntensity = 0;
            // 夜间模式灯亮度（保持夜里依然亮，作为唯一光源观感）
            ceilLightMat.emissiveIntensity = 1.8;
            
            wallMat.color.setHex(0xbbbbbb); // 夜间底色提亮到浅灰，让水泥纹理清晰可见
            wallMat.emissive.setHex(0x666666); // 用贴图自发光补一档，避免远处偏纯黑
            wallMat.emissiveIntensity = 0.6;
            // 墙面板正面同步夜间样式：底色提亮 + 自发光，避免远处偏纯黑
            wallPanelFaceMat.color.setHex(0xbbbbbb);
            wallPanelFaceMat.emissive.setHex(0x666666);
            wallPanelFaceMat.emissiveIntensity = 0.6;
            // 面板侧面框：夜间用更深的中灰，强化"一块一块"的轮廓
            wallPanelFrameMat.color.setHex(0x666666);
            
            // 画作在夜间模式稍微提亮，否则会被吞没在黑暗中
            paintingMats.forEach(mat => mat.emissiveIntensity = 0.5);
            // wallGrid.material.color.setHex(0xaaaaaa);
        }
    };

    // 初始执行一次
    updateBackgroundTheme();

    // 监听 body 的 data-theme 属性变化
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'data-theme') {
                updateBackgroundTheme();
            }
        });
    });
    observer.observe(document.body, { attributes: true });

    window.addEventListener('resize', () => {
        bgCamera.aspect = window.innerWidth / window.innerHeight;
        bgCamera.updateProjectionMatrix();
        bgRenderer.setSize(window.innerWidth, window.innerHeight);
        bgRenderer.render(bgScene, bgCamera);
    });

    // 鼠标滚轮聚焦交互：滚动时让背景相机沿 Z 轴推进，"穿过模型"聚焦到墙面
    //   - deltaY > 0（向下滚 / 远离自己）→ z 减小，相机靠近墙
    //   - deltaY < 0（向上滚 / 靠近自己）→ z 增大，相机退回原位
    // 范围限制：[BG_Z_MIN, BG_Z_MAX]，避免穿出墙体或退到天上
    //
    // 重要：使用 capture: true 挂在 window 上，让本监听器在事件链最前端先执行。
    //       robot.js / decals.js / TalkingHead 内部都在角色 canvas 的 wheel 上
    //       调用了 stopImmediatePropagation()，会把事件吞掉，普通 bubble 监听器
    //       拿不到事件。capture 阶段 window 总是最先触发，无法被子元素阻止。
    const BG_Z_MAX = 40;     // 默认远景位置（与 bgCamera 初始 z 一致）
    const BG_Z_MIN = -870;   // 接近墙面（墙在 z = -895），保留一点余量避免穿模
    
    // ⚙️ 滚轮移动距离设置
    // 修改这个值可以调整每次拨动鼠标滚轮时，相机向前或向后移动的距离
    // 值越大（如 60），单次滚轮前进的距离越远，到达墙面所需滚动的次数越少；
    // 值越小（如 10），单次滚轮前进的距离越短，感觉更平滑但需要滚动更多次。
    const BG_Z_STEP = 15;    
    
    window.addEventListener('wheel', (e) => {
        // 阻止页面默认滚动行为，让滚轮专用于场景聚焦
        e.preventDefault();
        const delta = Math.sign(e.deltaY) * BG_Z_STEP;
        // deltaY > 0 时 delta 正，z 应减小（靠近墙）→ 取负号
        const next = window.bgTargetPositionZ - delta;
        window.bgTargetPositionZ = Math.min(BG_Z_MAX, Math.max(BG_Z_MIN, next));
    }, { passive: false, capture: true });
};

initGlobalBackground();

let conversationHistory = [];
let isKneeling = false; // 追踪跪下状态
// Robot 状态 (Global Scope)
let robotState = {
    isWaving: false,
    waveStartTime: 0,
    isRaisingHands: false,
    raiseHandsStartTime: 0,
    isSpinning: false, // 新增：旋转状态
    spinStartTime: 0
};
window.robotState = robotState; // Expose for debugging
// 暴露给 window 以便控制台调试
window.robotState = robotState;

// 走代理：本地由 proxy-server.js 注入 Authorization；线上 Vercel 由 /api/proxy/[...path].js 注入。
// 前端不再持有任何 API key。
const PROXY_API_URL = "/api/proxy/api/coding/v3/chat/completions";

// -----------------------------------------------------------------------
// 动作解析与执行逻辑 (Global Scope)
// -----------------------------------------------------------------------
window.processActions = (text) => {
    console.log("🔍 Processing Actions for text:", text);
    let cleanText = text;
    
    // 确保 head 可用
    if (!head) {
        console.warn("⚠️ Head not initialized in processActions (maybe canvas mode)");
        // 仍然需要把动作标签过滤掉，防止 TTS 念出来
        return text.replace(/\[.*?\]/g, '').replace(/\s+/g, ' ').trim();
    }
    
    // 机器人状态检查
    const isRobot = head.avatar && head.avatar.preserveModelPose;
    console.log("🤖 Is Robot Mode:", isRobot);

    const actions = {
        '[wave]': () => { console.log("👋 Action: Wave"); head.playGesture('handup', 2, false, 500); },
        '[handup]': () => { console.log("🙌 Action: Hand Up (Custom for Robot)"); }, 
        '[point]': () => { console.log("point Action: Point"); head.playGesture('index', 2, false, 500); },
        '[ok]': () => { console.log("👌 Action: OK"); head.playGesture('ok', 2, false, 500); },
        '[thumbup]': () => { console.log("👍 Action: Thumb Up"); head.playGesture('thumbup', 2, false, 500); },
        '[thumbdown]': () => { console.log("👎 Action: Thumb Down"); head.playGesture('thumbdown', 2, false, 500); },
        '[shrug]': () => { console.log("🤷 Action: Shrug"); head.playGesture('shrug', 2, false, 500); },
        '[happy]': () => { console.log("😊 Mood: Happy"); head.setMood('happy'); },
        '[sad]': () => { console.log("😢 Mood: Sad"); head.setMood('sad'); },
        '[angry]': () => { console.log("😠 Mood: Angry"); head.setMood('angry'); },
        '[fear]': () => { console.log("😨 Mood: Fear"); head.setMood('fear'); },
        '[love]': () => { console.log("😍 Mood: Love"); head.setMood('love'); },
        '[sleep]': () => { console.log("😴 Mood: Sleep"); head.setMood('sleep'); },
        '[neutral]': () => { console.log("😐 Mood: Neutral"); head.setMood('neutral'); },
        '[kiss]': () => { 
            console.log("😘 Action: Kiss"); 
            head.stopSpeaking();
            head.playGesture('kiss', 2, false, 500); 
        },
        '[kneel]': () => { 
            console.log("🙇‍♀️ Action: Kneel - Manual Override"); 
            head.stopSpeaking();
            isKneeling = true;
            head.opt.modelMovementFactor = 0; 
            head.opt.disableBalance = true;
            head.animQueue = []; 
        },
        '[stand]': () => {
            console.log("🧍‍♀️ Action: Stand - Reset"); 
            isKneeling = false;
            head.opt.modelMovementFactor = 1; 
            head.opt.disableBalance = false;
            head.playGesture('neutral', 1000);
        },
        '[dance]': () => {
            console.log("🕺 Action: Dance (Custom for Elon)");
        }
    };

    for (const [tag, action] of Object.entries(actions)) {
        // 🤖 Robot Special: 拦截所有动作指令
        if (isRobot && tag !== '[neutral]') {
            // 允许特定指令通过
            if (tag === '[dance]') {
                if (cleanText.includes(tag)) {
                    console.log(`🤖 Robot mode: Triggering dance (MATCH FOUND)`);
                    window.robotState.isDancing = true;
                    window.robotState.danceStartTime = Date.now();
                    
                    // 10秒后自动停止跳舞
                    setTimeout(() => {
                        console.log("🤖 Robot mode: Stopping dance");
                        window.robotState.isDancing = false;
                    }, 10000);
                    
                    cleanText = cleanText.split(tag).join('');
                }
                continue;
            }
            if (tag === '[handup]') {
                if (cleanText.includes(tag)) {
                    console.log(`🤖 Robot mode: Triggering raise hands (MATCH FOUND)`);
                    window.robotState.isRaisingHands = true;
                    window.robotState.raiseHandsStartTime = Date.now();
                    window.lastRobotAction = "HandUp Triggered via processActions";
                    
                    // Force update debugger
                    if (typeof updateDebugInfo === 'function') updateDebugInfo(head);
                    
                    // 5秒后自动放下
                    setTimeout(() => {
                        console.log("🤖 Robot mode: Lowering hands");
                        window.robotState.isRaisingHands = false;
                        if (typeof updateDebugInfo === 'function') updateDebugInfo(head);
                    }, 5000);
                    
                    cleanText = cleanText.split(tag).join('');
                }
                continue;
            }
            
            // 允许 [wave] 指令触发机器人挥手
            if (tag === '[wave]') {
                if (cleanText.includes(tag)) {
                    console.log(`🤖 Robot mode: Triggering wave (MATCH FOUND)`);
                    window.robotState.isWaving = true;
                    window.robotState.waveStartTime = Date.now();
                    window.lastRobotAction = "Wave Triggered via processActions";
                    
                    // 3秒后自动停止
                    setTimeout(() => {
                        console.log("🤖 Robot mode: Stopping wave");
                        window.robotState.isWaving = false;
                    }, 3000);
                    
                    cleanText = cleanText.split(tag).join('');
                }
                continue;
            }
            
            // 其他指令被拦截
            if (cleanText.includes(tag)) {
                // console.log(`🤖 Robot mode: Ignoring gesture ${tag}`);
                cleanText = cleanText.split(tag).join('');
            }
            continue;
        }

        if (cleanText.includes(tag)) {
            action();
            cleanText = cleanText.split(tag).join('');
        }
    }
    
    return cleanText.replace(/\s+/g, ' ').trim();
};

async function callVolcengineAI(userMessage, nodeLoading, customPersonality = "") {
    console.log("🚀 Calling Volcengine AI...");
    if (nodeLoading) nodeLoading.textContent = "AI thinking...";

    conversationHistory.push({
        role: "user",
        content: userMessage
    });

    const baseSystemPrompt = `${customPersonality || "You are a friendly AI assistant with a 3D avatar."}
Please answer questions in a concise and conversational way (max 3 sentences).
IMPORTANT: You MUST include at least one [expression] or [action] tag in every response to make the avatar alive.
If the user asks you to "raise hands" or "hands up", you MUST use the [handup] tag.
If the user asks you to "wave", you MUST use the [wave] tag.

Available tags:
[happy] - Smile
[sad] - Look sad
[angry] - Look angry
[fear] - Look fearful
[love] - Look loving
[sleep] - Fall asleep
[neutral] - Reset expression
[wave] - Wave hand (hello)
[handup] - Raise both hands (cheer)
[point] - Point with index finger
[ok] - Show OK sign
[thumbup] - Thumbs up
[thumbdown] - Thumbs down
[shrug] - Shrug shoulders
[kiss] - Blow a kiss
[kneel] - Kneel down and beg
[stand] - Stand up

Example: "[happy] Hello! [handup] Yay! [kiss] It's nice to meet you! [kneel] Please forgive me."`;

    try {
        const response = await fetch(PROXY_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
                // Authorization 由代理服务端注入，前端不携带 key
            },
            body: JSON.stringify({
                model: "ark-code-latest",
                messages: [
                    {
                        role: "system",
                        content: baseSystemPrompt
                    },
                    ...conversationHistory
                ],
                max_tokens: 500,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("API Error:", response.status, errorText);
            const errorMessage = `API Error: ${response.status}`;
            if (nodeLoading) nodeLoading.textContent = errorMessage;
            return `Sorry, I encountered an issue: ${response.status}. Please check the console.`;
        }

        const data = await response.json();
        const aiResponse = data.choices[0].message.content;
        console.log("🤖 AI Original Response:", aiResponse); // 调试日志

        conversationHistory.push({
            role: "assistant",
            content: aiResponse // 保存原始回复到历史记录
        });

        // 直接返回原始回复，不进行动作解析
        // 动作解析现在统一由 handleSpeak 和 ws.onmessage 中的 processActions 处理
        return aiResponse;
    } catch (error) {
        console.error("Error calling Volcengine AI:", error);
        if (nodeLoading) nodeLoading.textContent = `Network Error: ${error.message}`;
        // 让虚拟人读出具体的错误原因，方便排查
        return `I'm having trouble connecting. The error is: ${error.message}`;
    }
}

document.addEventListener('DOMContentLoaded', async function(e) {
    const turntable = document.getElementById('carousel-turntable');
    const nodeLoading = document.getElementById('talkinghead-loading');
    const nodeSpeak = document.getElementById('talkinghead-speak');
    const nodeText = document.getElementById('talkinghead-text');

    if (!turntable) return;

    try {
        // 彻底隐藏 loading，不显示文字
        if (nodeLoading) nodeLoading.style.display = 'none';

        const models = [
            { url: AssetLibrary.avatars.avatar4, body: 'M', mood: 'neutral', preserve: false, name: '4号', status: '已离职', voice: null },
            { url: AssetLibrary.avatars.avatar3, body: 'M', mood: 'neutral', preserve: false, name: '3号', status: '已离职', voice: null },
            { type: 'canvas', id: 'decals-container', name: 'X', status: '在职', voice: 'am_michael', personality: 'You are X, an intern. When greeted or asked who you are, you MUST reply EXACTLY with: "Hi I am X an intern, bot one and bot two\'s partner.  By the way, scroll your mouse wheel, and you will find a surprise." Always maintain this identity.' },
            { url: AssetLibrary.avatars.bot1, body: 'F', mood: 'neutral', preserve: false, name: '博特万', status: '在职', voice: 'af_bella', personality: 'You are Bot1 (Bote Wan). When greeted or asked who you are, you MUST reply EXACTLY with: "Hi! I\'m Bot One, AI work partner of X. How can I help you?  By the way, scroll your mouse wheel, and you will find a surprise." Always maintain this identity.' },
            { url: AssetLibrary.avatars.bot2, body: 'F', mood: 'robot', preserve: true, name: '博特兔', status: '在职', voice: 'am_adam', personality: 'You are Bot two. When greeted or asked who you are, you MUST reply EXACTLY with: "Hi! I\'m Bot two—not Bot One, but just as helpful! What\'s up? I team up with X, who\'s basically the carrot to my rabbit! By the way, scroll your mouse wheel, and you will find a surprise." Always maintain this identity.' },
            { type: 'canvas', id: 'robot-container', name: '大黄', status: '待入职', voice: 'am_adam', personality: 'You are Da Huang (Big Yellow), an adorable little yellow robot. When greeted or asked who you are, you MUST reply EXACTLY with: "Beep boop! I am Da Huang, the little yellow robot! I am so happy to meet you! Scroll your mouse wheel, and you will find a surprise." Always maintain this identity and occasionally make cute robotic sounds.' },
            { url: AssetLibrary.avatars.avatar5, body: 'F', mood: 'neutral', preserve: false, name: '5号', status: '已离职', voice: null }
        ];

        let heads = [];
        let activeIndex = 3; // 默认选中中间的 brunette 模型 (原本是2，加了1个所以变成3)
        const itemSpacing = 250; // 平面平铺的水平间距

        const updateCarousel = () => {
            const N = models.length;
            const items = turntable.querySelectorAll('.carousel-item');
            items.forEach((item, j) => {
                let offset = j - activeIndex;
                
                // 将线性偏移转换为环形循环偏移 (首尾相连)
                if (offset > Math.floor(N / 2)) {
                    offset -= N;
                } else if (offset < -Math.floor(N / 2)) {
                    offset += N;
                }

                const distance = Math.abs(offset);
                const tx = offset * itemSpacing;
                // 这里是我们需要的终极暴力缩放！直接把整个 DOM 容器缩小到 0.85！
                const scale = 0.85; 
                const zIndex = offset === 0 ? 10 : 5 - distance;
                
                // 动态计算亮度：主模型 1.0(100%)，距离1的为 0.8(80%)，距离>=2的为 0.3(30%)
                let brightness = 1.0;
                if (distance === 1) {
                    brightness = 0.8;
                } else if (distance >= 2) {
                    brightness = 0.3;
                }
                
                // 处理无缝循环的视觉跳变：如果某一项的移动距离跨度很大，说明它是绕到了另一端
                const oldTx = item.dataset.tx ? parseFloat(item.dataset.tx) : tx;
                if (Math.abs(tx - oldTx) > itemSpacing * 1.5) {
                    item.style.transition = 'none'; // 瞬间闪现到另一侧，不播放飞越屏幕的动画
                } else {
                    item.style.transition = ''; // 恢复 CSS 中的平滑过渡效果
                }
                item.dataset.tx = tx;
                
                let ty = 0;
                if (models[j].name === '4号') {
                    ty = 15; // 使用 CSS transform 把整个 4号 容器(连同标签和模型)往下平移 15 像素
                } else if (models[j].name === '3号') {
                    ty = 20; // 同样使用 CSS transform 把整个 3号 容器往下平移 20 像素
                }
                
                item.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
                item.style.zIndex = zIndex;
                item.style.filter = `brightness(${brightness})`;
                
                if (offset === 0) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });
        };

        const switchModel = (newIndex) => {
            let diff = newIndex - activeIndex;
            
            if (newIndex < 0) newIndex = models.length - 1;
            if (newIndex >= models.length) newIndex = 0;
            if (activeIndex === newIndex) return;

            // 处理循环情况的旋转方向差值 (保持向近距离旋转)
            if (diff > models.length / 2) diff -= models.length;
            if (diff < -models.length / 2) diff += models.length;
            
            // 动态修改背景相机的 X 轴平移目标
            // 每次切换一个身位，背景相机在 X 轴上平移 30 个单位，产生单点透视的视差滑动感
            window.bgTargetPositionX += diff * 30;

            activeIndex = newIndex;
            updateCarousel();

            // 切换模型时，强制隐藏所有由于 CSS transform 移动导致没能触发 pointerleave 的鼠标提示
            document.querySelectorAll('.mouse-click-anim').forEach(anim => {
                if (anim.parentElement) {
                    anim.parentElement.style.display = 'none';
                }
            });

            // 如果从机器人切走，强制重置其动画状态为 Idle
            if (robotState.isSpinning) {
                robotState.isSpinning = false;
            }

            head = heads[activeIndex];
            const m = models[activeIndex];
            window.robotState.currentModelUrl = m.url;
            
            if (m.preserve && m.url && m.url.includes(AssetLibrary.avatars.bot2)) {
                robotState.isWaving = true;
                setTimeout(() => robotState.isWaving = false, 3000);
            } else if (m.name === '大黄') {
                // 如果是大黄机器人 (Canvas)，触发其暴露出来的挥手动作
                if (window.playRobotEmote) {
                    window.playRobotEmote('Wave');
                }
            } else {
                // 非机器人模型，使用内置的打招呼动作
                if (head && head.playGesture) {
                    head.playGesture('handup', 2, false, 500);
                }
            }
            
            // 根据状态控制聊天输入框的显示与隐藏，并更新提示词
            const inputContainer = document.getElementById('talkinghead-input-container');
            const inputText = document.getElementById('talkinghead-text');
            if (inputContainer) {
                if (m.status === '已离职') {
                    inputContainer.dataset.disabled = "true";
                    inputContainer.style.opacity = '0';
                    inputContainer.style.pointerEvents = 'none'; // 防止透明状态下依然可以点击
                } else {
                    inputContainer.dataset.disabled = "false";
                    // 透明度交由 animateBg 结合 fadeProgress 动态计算，这里不写死 '1'
                    inputContainer.style.pointerEvents = 'auto';
                    if (inputText) {
                        inputText.placeholder = `say hi to ${m.name}...`;
                    }
                }
            }
            
            // 动态切换 TTS 声音 (离职模型不设置声音，在职模型读取自己的专属 voice)
            if (window.headtts) {
                if (m.status === '已离职' || !m.voice) {
                    // 已离职不分配声音，或者未来想彻底禁用 TTS 可以给引擎发个空，或者直接略过
                    // 只要聊天框被隐藏，用户也无法触发说话
                } else {
                    window.headtts.setup({ voice: m.voice });
                }
            }
        };

        // 将单击切换逻辑暴露到全局，供 product 拦截后调用
        window.handleCarouselClick = (clientX) => {
            const rect = turntable.getBoundingClientRect();
            const clickX = clientX - rect.left;
            const centerX = rect.width / 2;

            if (clickX < centerX) {
                switchModel(activeIndex - 1); // 点左半屏，往左移
            } else {
                switchModel(activeIndex + 1); // 点右半屏，往右移
            }
        };

        let pointerDownX = 0;
        let pointerDownY = 0;
        let pointerDownTime = 0;

        // 记录鼠标按下的初始位置和时间
        turntable.addEventListener('pointerdown', (e) => {
            if (e.button === 2) return; // 忽略右键点击，留给画板涂鸦
            pointerDownX = e.clientX;
            pointerDownY = e.clientY;
            pointerDownTime = Date.now();
            // 注意：这里不拦截 pointerdown，让事件正常传递给底层的 Canvas，以便支持长按拖拽旋转
        }, true);

        // 在鼠标抬起时，判断是“单次点击”还是“拖拽旋转”
        turntable.addEventListener('pointerup', (e) => {
            if (e.button === 2) return; // 忽略右键点击，留给画板涂鸦
            
            // 如果点击的是输入框或按钮等控件，直接放行
            if (e.target.closest('input') || e.target.closest('button')) {
                return;
            }

            const dx = e.clientX - pointerDownX;
            const dy = e.clientY - pointerDownY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const timeElapsed = Date.now() - pointerDownTime;

            // 区分单次点击和拖拽/长按：
            // 如果鼠标移动距离小于 10 像素，并且按下的时间小于 500 毫秒，则认为是“点击”
            if (distance < 10 && timeElapsed < 500) {
                window.handleCarouselClick(e.clientX);
            }
            // 如果是拖拽（距离大）或长按（时间长），则什么也不做，让底层 Canvas 去处理旋转
        }, true);

        // 5秒无操作自动向左轮换 (模型整体向左平移，即选中右侧的下一个模型 activeIndex + 1)
        let autoRotateTimer = null;
        // 把 reset 函数也挂载到 window，方便我们在输入框操作时调用
        window.resetAutoRotateTimer = () => {
            if (autoRotateTimer) clearTimeout(autoRotateTimer);
            autoRotateTimer = setTimeout(() => {
                // 检查是否有视频正在播放
                let isAnyVideoPlaying = false;
                if (window.globalVideoCache) {
                    for (const key in window.globalVideoCache) {
                        const video = window.globalVideoCache[key].video;
                        if (video && !video.paused) {
                            isAnyVideoPlaying = true;
                            break;
                        }
                    }
                }

                // 如果有人在说话（无论是 3D 模型还是 Robot/Canvas），或者正在请求大模型(isLoading)
                // 或者是对话框（输入框）处于激活/聚焦状态，或者【有视频正在播放】，就不自动轮播
                const isLoading = document.getElementById('talkinghead-loading').style.display !== 'none';
                const inputText = document.getElementById('talkinghead-text');
                const isInputFocused = inputText && document.activeElement === inputText;

                if (window.isSomeoneSpeaking || isLoading || isInputFocused || window.isAwaitingResponse || isAnyVideoPlaying) {
                    window.resetAutoRotateTimer(); // 稍后再试
                    return;
                }
                switchModel(activeIndex + 1);
                window.resetAutoRotateTimer(); // 继续下一次循环
            }, 5000);
        };

        // 监听用户的各种交互操作来打断/重置计时器
        window.addEventListener('pointermove', window.resetAutoRotateTimer);
        window.addEventListener('pointerdown', window.resetAutoRotateTimer);
        window.addEventListener('keydown', window.resetAutoRotateTimer);
        window.addEventListener('wheel', window.resetAutoRotateTimer);

        // 初始化时启动计时器
        window.resetAutoRotateTimer();

        // 创建各个头像容器
        for (let i = 0; i < models.length; i++) {
            const m = models[i];
            const item = document.createElement('div');
            item.className = 'carousel-item';
            item.dataset.index = i;
            turntable.appendChild(item);

            // 动态创建顶部的姓名和状态 Tag
            const tag = document.createElement('div');
            tag.className = 'avatar-tag';
            const statusClass = m.status === '在职' ? 'active-status' : 'inactive-status';
            tag.innerHTML = `
                <div class="active-indicator">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M6 5l6 6 6-6" />
                        <path d="M6 13l6 6 6-6" />
                    </svg>
                </div>
                <span class="avatar-name">${m.name}</span>
                <span class="avatar-status ${statusClass}">${m.status}</span>
            `;
            
            // 手动调整特定模型标签的固定位置 (默认是 top: 40px)
            if (m.name === '博特兔') {
                tag.style.top = '250px'; // 往下移动 200 像素，再往下移动 40 像素，所以是 250px (以210为基础往下40)
            } else if (m.name === '3号' || m.name === '4号') {
                tag.style.top = '10px';  // 恢复为原本的 10px，因为整体容器被 CSS 平移了，所以它的标签会自动跟着模型下移
            } else if (m.name === '博特万') {
                tag.style.top = '50px';  // 默认是 40px，往下移动 10 像素，所以是 50px
            } else if (m.name === 'Jinxi') {
                tag.style.top = '40px'; // 原本是 70px，模型往上移动了 30px，标签也要跟着往上移动 30px，所以是 40px
            } else if (m.name === '大黄') {
                tag.style.top = '290px'; // 原本是 320px，标签需要再往上移动 30 像素，所以是 290px
            }
            
            item.appendChild(tag);

            // 创建加载状态转圈动画及进度文本
            const loaderContainer = document.createElement('div');
            loaderContainer.className = 'model-loader-container';
            
            const loaderRing = document.createElement('div');
            loaderRing.className = 'model-loader-ring';
            
            const loaderText = document.createElement('div');
            loaderText.className = 'model-loader-text';
            loaderText.innerText = '0%';
            
            loaderContainer.appendChild(loaderRing);
            loaderContainer.appendChild(loaderText);
            item.appendChild(loaderContainer);

            if (m.type === 'canvas') {
                const canvasContainer = document.getElementById(m.id);
                if (canvasContainer) {
                    // 隐藏原有的 section 边框防止布局冲突
                    const section = canvasContainer.closest('section');
                    if (section) {
                        section.style.display = 'none';
                    }
                    
                    // 将 canvas 容器移入到 carousel-item 中
                    item.appendChild(canvasContainer);
                    
                    canvasContainer.style.position = 'absolute';
                    canvasContainer.style.left = '50%';
                    canvasContainer.style.width = '1196px';
                    
                    if (m.id === 'decals-container') {
                        // Jinxi 涂鸦墙的特殊定位
                        // 往上移动 30 像素，所以 top 从 calc(50% - 180px) 改为 calc(50% - 210px)
                        canvasContainer.style.top = 'calc(50% - 210px)';
                        canvasContainer.style.transform = 'translate(-50%, -50%) scale(0.3)';
                        canvasContainer.style.height = '900px';
                    } else if (m.id === 'robot-container') {
                        // 机器人的特殊定位
                        // 往下移动 138 像素 (130 + 8)，所以 top 改为 calc(50% + 138px)
                        canvasContainer.style.top = 'calc(50% + 138px)';
                        canvasContainer.style.transform = 'translate(-50%, -50%) scale(0.8)';
                        canvasContainer.style.height = '600px';
                    }

                    // 监听 canvas 模型内部派发的加载完成事件，隐藏加载圈
                    if (canvasContainer.dataset.loaded === 'true') {
                        loaderContainer.style.display = 'none';
                    } else {
                        canvasContainer.addEventListener('model-progress', (e) => {
                            loaderText.innerText = e.detail + '%';
                        });
                        canvasContainer.addEventListener('model-loaded', () => {
                            loaderContainer.style.display = 'none';
                        });
                    }
                }
                heads.push(null);
                continue;
            }

            const h = new TalkingHead(item, {
                ttsEndpoint: "https://api.elevenlabs.io/v1/text-to-speech/", 
                lipsyncModules: ["en"],
                cameraView: "full",
                cameraY: 0.2,
                cameraDistance: 1.8, // 增加相机距离，从而在视觉上大幅缩小模型
                lightAmbientIntensity: 3,
                lightDirectIntensity: 5,
                cameraRotateEnable: true, // 重新开启内部相机旋转
                cameraZoomEnable: true,   // 重新开启缩放
                mixerGainSpeech: 3
            });
            heads.push(h);

            // -----------------------------------------------------------------------
            // Custom Animations per instance
            // -----------------------------------------------------------------------
            h.animEmojis['kiss'] = {
                dt: [1000, 1000, 500], 
                vs: {
                    mouthPucker: [0, 1, 0], mouthFunnel: [0, 0.5, 0], eyesClosed: [0, 1, 0], headRotateX: [0, 0.1, 0],
                    handRight: [
                        { x: -0.2, y: 0.1, z: 0.25 }, { x: 0.2, y: 0.2, z: 0.5 }, null
                    ]
                }
            };

            h.gestureTemplates['kneel'] = {
                 'LeftUpLeg.rotation': { x: 0, y: 0, z: 0 }, 'RightUpLeg.rotation': { x: 0.1, y: 0, z: 0 },
                 'LeftLeg.rotation': { x: 1.6, y: 0, z: 0 }, 'RightLeg.rotation': { x: 1.6, y: 0, z: 0 },
                 'LeftFoot.rotation': { x: 0.5, y: 0, z: 0 }, 'RightFoot.rotation': { x: 0.5, y: 0, z: 0 },
                 'Hips.position': { x: 0, y: 0.55, z: 0 },
                 'Spine.rotation': { x: 0.2, y: 0, z: 0 }, 'Head.rotation': { x: 0.3, y: 0, z: 0 }, 
                 'LeftArm.rotation': { x: 0, y: 0, z: -0.2 }, 'RightArm.rotation': { x: 0, y: 0, z: 0.2 },
                 'LeftForeArm.rotation': { x: -0.5, y: 0, z: 0 }, 'RightForeArm.rotation': { x: -0.5, y: 0, z: 0 }
            };

            h.poseTemplates['kneel'] = {
                standing: true, sitting: false, kneeling: false, lying: false,
                props: {
                    'Hips.position': { x: 0, y: 0.45, z: 0 },
                    'LeftUpLeg.rotation': { x: 0, y: 0.1, z: 0 }, 'RightUpLeg.rotation': { x: 0, y: -0.1, z: 0 },
                    'LeftLeg.rotation': { x: 1.8, y: 0, z: 0 }, 'RightLeg.rotation': { x: 1.8, y: 0, z: 0 },
                    'LeftFoot.rotation': { x: 0.8, y: 0, z: 0 }, 'RightFoot.rotation': { x: 0.8, y: 0, z: 0 },
                    'Spine.rotation': { x: 0.3, y: 0, z: 0 }, 'Head.rotation': { x: 0.4, y: 0, z: 0 },  
                    'LeftArm.rotation': { x: -0.2, y: 0, z: -0.2 }, 'RightArm.rotation': { x: -0.2, y: 0, z: 0.2 },
                    'LeftForeArm.rotation': { x: -0.5, y: 0, z: 0 }, 'RightForeArm.rotation': { x: -0.5, y: 0, z: 0 }
                }
            };

            // 每帧更新逻辑
            h.opt.update = (dt) => {
                // 如果不是当前激活的模型，且不是拥有专属动画的 Robot 模型，则不执行这部分逻辑
                if (h !== head && !(h.avatar && h.avatar.preserveModelPose)) return; 

                if (h.avatar && h.avatar.root && window.robotState.yOffset !== undefined) {
                    h.avatar.root.position.y = window.robotState.yOffset;
                    h.avatar.root.updateMatrixWorld(true);
                }

                if (h.avatar && h.avatar.preserveModelPose && h.armature) {
                    const t = Date.now() / 1000;
                    const rootBone = h.armature.getObjectByName('Root') || h.armature.getObjectByName('mixamorigRoot') || h.armature;
                    const headBone = h.armature.getObjectByName('Head') || h.armature.getObjectByName('mixamorigHead');

                    // Robot Speaking Spin Animation
                    if (robotState.isSpinning) {
                        if (rootBone) {
                            // 身体微动
                            rootBone.rotation.y = Math.sin(t * 3) * 0.05;
                        }
                        if (headBone) {
                            // 说话时：头部 360 度持续旋转 (根据时间 t 线性增加角度)
                            // t * 5 表示旋转速度，你可以调整这个 5 来控制转得快还是慢
                            headBone.rotation.y = t * 10; 
                            headBone.rotation.x = 0;
                            headBone.rotation.z = 0;
                        }
                    } else {
                        // Reset rotation when not spinning
                        if (rootBone) rootBone.rotation.y = 0;
                        if (headBone) {
                            // Idle状态：头部微微动即可，降低幅度
                            // 为了平滑过渡，建议将 360 度旋转的状态重置为 0，或者继续微动
                            // 这里我们让它回归到极小幅度的正弦波摇晃
                            headBone.rotation.y = Math.sin(t * 2) * 0.08; 
                            headBone.rotation.x = Math.sin(t * 1.5) * 0.02;
                            headBone.rotation.z = 0;
                        }
                    }

                    if (robotState.isDancing && h.animations && h.animations.length > 0) {
                        if (h.mixer && !robotState.danceAction) {
                            const clip = h.animations[0];
                            const action = h.mixer.clipAction(clip, h.armature);
                            action.play();
                            action.setEffectiveWeight(1);
                            robotState.danceAction = action;
                        }
                        return; 
                    } else if (!robotState.isDancing && robotState.danceAction) {
                        robotState.danceAction.stop();
                        robotState.danceAction = null;
                    }

                    if (!robotState.isDancing && !robotState.isRaisingHands && !robotState.isWaving) {
                        // Play Idle Animation
                        if (h.animations && h.animations.length > 0) {
                            if (h.mixer && !robotState.idleAction) {
                                // Try to find an idle clip, default to the first one
                                const idleClip = h.animations.find(a => a.name.toLowerCase().includes('idle')) || h.animations[0];
                                const idleAction = h.mixer.clipAction(idleClip, h.armature);
                                idleAction.play();
                                idleAction.setEffectiveWeight(1);
                                robotState.idleAction = idleAction;
                            }
                        }
                    } else {
                        if (robotState.idleAction) {
                            robotState.idleAction.stop();
                            robotState.idleAction = null;
                        }
                    }

                    if (robotState.isWaving) {
                        const rightArm = h.armature.getObjectByName('RightArm');
                        const rightForeArm = h.armature.getObjectByName('RightForeArm');
                        if (rightArm && rightForeArm) {
                            if (!rightArm.userData.initialQuaternion) {
                                rightArm.userData.initialQuaternion = rightArm.quaternion.clone();
                                rightForeArm.userData.initialQuaternion = rightForeArm.quaternion.clone();
                            }
                            const t = Date.now() / 1000;
                            const waveAngle = Math.sin(t * 10) * 0.5; 
                            const qLift = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -2.5);
                            const qWave = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), waveAngle);
                            const qTarget = rightArm.userData.initialQuaternion.clone().multiply(qLift).multiply(qWave);
                            rightArm.quaternion.slerp(qTarget, 0.2);
                        }
                    }

                    if (robotState.isRaisingHands) {
                        const rightArm = h.armature.getObjectByName('RightArm');
                        const rightForeArm = h.armature.getObjectByName('RightForeArm');
                        const leftArm = h.armature.getObjectByName('LeftArm');
                        const leftForeArm = h.armature.getObjectByName('LeftForeArm');
                        
                        if (rightArm && leftArm) {
                            if (!rightArm.userData.initialQuaternion) rightArm.userData.initialQuaternion = rightArm.quaternion.clone();
                            if (!rightForeArm.userData.initialQuaternion) rightForeArm.userData.initialQuaternion = rightForeArm.quaternion.clone();
                            if (!leftArm.userData.initialQuaternion) leftArm.userData.initialQuaternion = leftArm.quaternion.clone();
                            if (!leftForeArm.userData.initialQuaternion) leftForeArm.userData.initialQuaternion = leftForeArm.quaternion.clone();

                            const liftAngle = -2.5; 
                            const qLiftRight = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), liftAngle);
                            const qTargetRight = rightArm.userData.initialQuaternion.clone().multiply(qLiftRight);
                            rightArm.quaternion.slerp(qTargetRight, 0.2); 

                            const qLiftLeft = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), liftAngle);
                            const qTargetLeft = leftArm.userData.initialQuaternion.clone().multiply(qLiftLeft);
                            leftArm.quaternion.slerp(qTargetLeft, 0.2);

                            const bendAngle = 0.5; 
                            const qBendRight = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), bendAngle); 
                            const qTargetForeRight = rightForeArm.userData.initialQuaternion.clone().multiply(qBendRight);
                            rightForeArm.quaternion.slerp(qTargetForeRight, 0.2); 

                            const qBendLeft = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -bendAngle);
                            const qTargetForeLeft = leftForeArm.userData.initialQuaternion.clone().multiply(qBendLeft);
                            leftForeArm.quaternion.slerp(qTargetForeLeft, 0.2); 
                        }
                    } else if (!robotState.isWaving) {
                        const rightArm = h.armature.getObjectByName('RightArm');
                        const rightForeArm = h.armature.getObjectByName('RightForeArm');
                        if (rightArm && rightArm.userData.initialQuaternion) rightArm.quaternion.slerp(rightArm.userData.initialQuaternion, 0.1);
                        if (rightForeArm && rightForeArm.userData.initialQuaternion) rightForeArm.quaternion.slerp(rightForeArm.userData.initialQuaternion, 0.1);

                        const leftArm = h.armature.getObjectByName('LeftArm');
                        const leftForeArm = h.armature.getObjectByName('LeftForeArm');
                        if (leftArm && leftArm.userData.initialQuaternion) leftArm.quaternion.slerp(leftArm.userData.initialQuaternion, 0.1);
                        if (leftForeArm && leftForeArm.userData.initialQuaternion) leftForeArm.quaternion.slerp(leftForeArm.userData.initialQuaternion, 0.1);
                    }
                }
                
                if (isKneeling) {
                    if (!h.armature) return;
                    const hips = h.armature.getObjectByName('Hips');
                    const leftLeg = h.armature.getObjectByName('LeftLeg');
                    const rightLeg = h.armature.getObjectByName('RightLeg');
                    const leftUpLeg = h.armature.getObjectByName('LeftUpLeg');
                    const rightUpLeg = h.armature.getObjectByName('RightUpLeg');

                    if (hips) {
                        hips.position.y = hips.position.y * 0.9 + 0.55 * 0.1; 
                        if (leftLeg) leftLeg.rotation.x = -2.0;
                        if (rightLeg) rightLeg.rotation.x = -2.0;
                        if (leftUpLeg) leftUpLeg.rotation.x = 0;
                        if (rightUpLeg) rightUpLeg.rotation.x = 0;
                    }
                }
            };

        } // end for

        // 改回并发加载所有模型
        const loadAllAvatars = async () => {
            // 移除 Loading Avatars 的显示
            // nodeLoading.style.display = 'block';
            // nodeLoading.textContent = "Loading Avatars...";

            const loadPromises = models.map(async (m, i) => {
                if (m.type === 'canvas') return Promise.resolve(); // 不用加载 3D 模型

                const h = heads[i];
                let modelUrl = './avatars/' + m.url;

                // 模拟一个稳步上升的进度 (因为 TalkingHead 底层可能没有直接透出细粒度的 onProgress 回调)
                let fakeProgress = 0;
                const progressInterval = setInterval(() => {
                    if (fakeProgress < 90) {
                        fakeProgress += Math.floor(Math.random() * 10) + 1;
                        if (fakeProgress > 90) fakeProgress = 90;
                        const carouselItem = turntable.querySelectorAll('.carousel-item')[i];
                        const loaderText = carouselItem.querySelector('.model-loader-text');
                        if (loaderText) loaderText.innerText = fakeProgress + '%';
                    }
                }, 200);

                await h.showAvatar({
                    url: modelUrl,
                    body: m.body,
                    avatarMood: m.mood,
                    lipsyncLang: 'en',
                    preserveModelPose: m.preserve,
                    cameraDistance: 2.2 // 进一步拉远相机，让模型明显变小
                }, (ev) => {
                    // 如果 showAvatar 抛出了真实的 progress 事件，则使用真实数据
                    if (ev && ev.lengthComputable) {
                        clearInterval(progressInterval);
                        const percentComplete = Math.round((ev.loaded / ev.total) * 100);
                        const carouselItem = turntable.querySelectorAll('.carousel-item')[i];
                        const loaderText = carouselItem.querySelector('.model-loader-text');
                        if (loaderText) loaderText.innerText = percentComplete + '%';
                    }
                });

                clearInterval(progressInterval);

                // 模型加载完成后，隐藏对应的加载圈
                const carouselItem = turntable.querySelectorAll('.carousel-item')[i];
                const loader = carouselItem.querySelector('.model-loader-container');
                if (loader) {
                    const text = loader.querySelector('.model-loader-text');
                    if (text) text.innerText = '100%';
                    setTimeout(() => { loader.style.display = 'none'; }, 200);
                }

                // 将所有模型整体在 3D 空间再缩小 10% (现在是累计缩小到 0.73)
                if (h.avatar && h.avatar.root) {
                    h.avatar.root.scale.set(0.73, 0.73, 0.73);
                }

                // Robot 特殊设置
                if (m.preserve) {
                    h.opt.avatarIdleHeadMove = false;
                    h.opt.avatarSpeakingHeadMove = false;
                    h.opt.avatarIgnoreCamera = true;
                    h.opt.disableBalance = true;
                    h.opt.freeze = false;
                }

                // 初始化时，如果当前模型是激活状态，触发一次打招呼
                if (i === activeIndex) {
                    if (m.url.includes(AssetLibrary.avatars.bot2)) {
                        robotState.isWaving = true;
                        setTimeout(() => robotState.isWaving = false, 3000);
                    } else {
                        if (h.playGesture) {
                            h.playGesture('handup', 2, false, 500);
                        }
                    }
                }
                
                // 将 AVATARSDK 和 AVATURN 模型向下移动 30 像素 (通过调整相机 Y 轴和目标)
                if (m.url.includes(AssetLibrary.avatars.avatar3)) {
                    if (h.camera && h.cameraTarget) {
                        // 原本默认的 camera.position.y 是 0.2，向上移动约 0.05 对应屏幕上大约 30px
                        h.camera.position.y += 0.05; 
                        h.cameraTarget.y += 0.05;
                        h.camera.updateProjectionMatrix();
                    }
                }
                
                // 将 4号模型 (AvatarSDK) 单独向下移动 (原来的 30 像素 + 额外的 40 像素)
                if (m.url.includes(AssetLibrary.avatars.avatar4)) {
                    if (h.camera && h.cameraTarget) {
                        // 0.05 约等于 30px，再加 40px 大约是 0.067，总共约为 0.117
                        h.camera.position.y += 0.117; 
                        h.cameraTarget.y += 0.117;
                        h.camera.updateProjectionMatrix();
                    }
                }
            });

            await Promise.all(loadPromises);
            nodeLoading.style.display = 'none'; // 所有加载完就隐藏 loading
        };

        // 启动并发加载
        loadAllAvatars();

        // 延迟执行一次 updateCarousel，确保 DOM 已完全渲染并添加到页面中
        setTimeout(() => {
            updateCarousel(); // 初始化时排布好所有模型
            
            // 初始化时检查一次输入框状态
            const m = models[activeIndex];
            const inputContainer = document.getElementById('talkinghead-input-container');
            const inputText = document.getElementById('talkinghead-text');
            if (inputContainer) {
                if (m.status === '已离职') {
                    inputContainer.style.opacity = '0';
                    inputContainer.style.pointerEvents = 'none';
                } else if (inputText) {
                    inputText.placeholder = `say hi to ${m.name}...`;
                }
            }
        }, 100);

        // 设置默认全局 head
        head = heads[activeIndex];
        window.robotState.currentModelUrl = models[activeIndex].url;

        // --- 剩下的原本 DOMContentLoaded 逻辑 ---

        if (nodeSpeak && nodeText) {
            // 输入框动态宽度调整
            nodeText.addEventListener('input', function() {
                const minWidth = 200;
                const maxWidth = 600;
                // 使用 scrollWidth 来获取内容实际宽度，更准确
                // 需要先重置宽度以获取准确的 scrollWidth (对于缩小的情况)
                // 但为了避免闪烁，我们采用一种增量策略或者简单的字符估算
                // 简单字符估算在不同字体下不准，改用 canvas 测量或者临时 span 测量太复杂
                // 这里使用一种简单的策略：
                // 设置宽度为 auto (或者极小值) 让它收缩，然后读取 scrollWidth
                // 但 input 不像 textarea 能够自动换行撑开高度，它是单行的。
                // 实际上 input 的 width 不会随内容自动变大，除非我们设置它。
                
                // 简单的字符估算 + 最小宽度
                // 假设每个字符平均 10px (根据字体大小调整)
                let newWidth = minWidth + (this.value.length * 10);
                if (newWidth > maxWidth) newWidth = maxWidth;
                this.style.width = newWidth + 'px';
            });

            // 将处理逻辑抽取为单独的函数
            window.handleSpeak = async function() {
                // 锁住自动轮播主体，避免等待大模型期间被切换到下一个角色（修复"换人说话"Bug）
                window.isAwaitingResponse = true;
                try {
                    const text = nodeText.value;
                    if (text) {
                        console.log("🎤 HandleSpeak triggered with text:", text);
                        
                        nodeSpeak.disabled = true;
                        nodeText.disabled = true; // 禁用输入框
                        nodeText.style.opacity = '0.5'; // 变灰
                        nodeText.style.cursor = 'not-allowed';
                        // nodeSpeak.textContent = "思考中..."; // 按钮已隐藏，不需要更新文字
                        
                        const currentModel = models[activeIndex];
                        const aiResponse = await callVolcengineAI(text, nodeLoading, currentModel.personality);
                        
                        window.lastAiResponse = aiResponse; // 记录原始回复
                        
                        // Force Process Actions immediately
                        console.log("🚀 Manually triggering processActions for:", aiResponse);
                        if (typeof window.processActions === 'function') {
                            const cleanText = window.processActions(aiResponse);
                            
                            if (headtts) {
                                headtts.synthesize({
                                    input: cleanText
                                });
                            }
                        } else {
                            console.error("❌ window.processActions is missing!");
                        }
                        
                        nodeText.value = "";
                        nodeText.style.width = '200px'; // 恢复初始宽度
                        nodeSpeak.disabled = false;
                        nodeText.disabled = false; // 恢复输入框
                        nodeText.style.opacity = '1'; // 恢复亮度
                        nodeText.style.cursor = 'text';
                        // nodeSpeak.textContent = "说话";
                        nodeText.focus(); // 聚焦以便下一轮对话
                    } else {
                        console.warn("🎤 HandleSpeak triggered but input is empty");
                    }
                } catch (error) {
                    console.error("🎤 HandleSpeak Error:", error);
                    nodeSpeak.disabled = false;
                    nodeText.disabled = false;
                    nodeText.style.opacity = '1';
                    nodeText.style.cursor = 'text';
                    // nodeSpeak.textContent = "说话";
                } finally {
                    // 无论成功还是异常，都解锁；后续 isSomeoneSpeaking 守卫会接管说话期间的挂起
                    window.isAwaitingResponse = false;
                }
            };

            nodeSpeak.addEventListener('click', () => {
                if (window.resetAutoRotateTimer) window.resetAutoRotateTimer();
                window.handleSpeak();
            });

            nodeText.addEventListener('keypress', function(e) {
                if (window.resetAutoRotateTimer) window.resetAutoRotateTimer();
                if (e.key === 'Enter') {
                    window.handleSpeak();
                }
            });
        }

        try {
            window.headtts = new HeadTTS({
                endpoints: ["webgpu", "wasm"],
                languages: ["en-us"],
                voices: ["af_bella", "af_sarah", "am_adam", "am_michael"],
                workerModule: "https://cdn.jsdelivr.net/npm/@met4citizen/headtts@1.2/modules/worker-tts.mjs",
                dictionaryURL: "https://cdn.jsdelivr.net/npm/@met4citizen/headtts@1.2/dictionaries/",
                audioCtx: head.audioCtx,
                trace: 0
            });
            headtts = window.headtts; // 修改外层的 headtts 变量，不要用 let 重新声明

            // 简单的音频播放队列
            window.robotAudioQueue = [];
            window.isRobotPlaying = false;
            window.speakingCount = 0; // 使用计数器来精确控制全局说话状态
            window.isSomeoneSpeaking = false;

            const playNextRobotAudio = (audioCtx) => {
                if (window.robotAudioQueue.length === 0) {
                    window.isRobotPlaying = false;
                    window.robotState.isSpinning = false; // 队列播完，停止说话状态
                    return;
                }

                window.isRobotPlaying = true;
                window.speakingCount++;
                window.isSomeoneSpeaking = window.speakingCount > 0;
                
                const buffer = window.robotAudioQueue.shift();

                const source = audioCtx.createBufferSource();
                source.buffer = buffer;
                source.connect(audioCtx.destination);
                window.currentRobotAudioSource = source;

                // console.log("🤖 Robot playing audio chunk...");
                
                // 触发旋转 (如果还没转，并且当前激活的模型确实是机器人)
                if (head && head.avatar && head.avatar.preserveModelPose) {
                    if (!window.robotState.isSpinning) {
                        window.robotState.isSpinning = true;
                        window.robotState.spinStartTime = Date.now();
                    }
                }

                source.onended = () => {
                    // console.log("🤖 Robot audio chunk ended");
                    window.currentRobotAudioSource = null;
                    window.speakingCount--;
                    window.isSomeoneSpeaking = window.speakingCount > 0;
                    // 播放下一段
                    playNextRobotAudio(audioCtx);
                };
                
                source.start(0);
            };

            const fallbackAudioCtx = new (window.AudioContext || window.webkitAudioContext)();

            headtts.onmessage = async (message) => {
                if (message.type === "audio") {
                    try {
                        // 🤖 Robot/Canvas Isolation: 机器人或 Canvas(无模型) 专用处理逻辑
                        if (!head || (head.avatar && head.avatar.preserveModelPose)) {
                            const messageData = message.data;
                            
                            // 定义 audioCtx
                            const audioCtx = (head && head.audioCtx) ? head.audioCtx : fallbackAudioCtx;
                            if (!audioCtx) return;
                            
                            if (audioCtx.state === 'suspended') await audioCtx.resume();

                            let audioBuffer = null;

                            // 获取 AudioBuffer
                            if (messageData && messageData.audio instanceof AudioBuffer) {
                                audioBuffer = messageData.audio;
                            } else if (messageData instanceof ArrayBuffer || messageData.buffer instanceof ArrayBuffer) {
                                // 需要解码的情况
                                try {
                                    const arrayBuffer = (messageData instanceof ArrayBuffer) ? messageData.slice(0) : messageData.buffer.slice(0);
                                    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
                                } catch (e) {
                                    console.error("Audio decode error", e);
                                    return;
                                }
                            }

                            if (audioBuffer) {
                                // 加入队列
                                // console.log("🤖 Adding audio to queue, length:", audioBuffer.duration);
                                window.robotAudioQueue.push(audioBuffer);
                                
                                // 如果当前没有在播放，立即开始
                                if (!window.isRobotPlaying) {
                                    playNextRobotAudio(audioCtx);
                                }
                            }
                            return;
                        }

                        // 播放音频并同步口型
                        window.speakingCount++;
                        window.isSomeoneSpeaking = window.speakingCount > 0;
                        
                        // speakAudio 返回的是 Promise，我们需要使用 await 来等待它真正播放完毕
                        try {
                            await head.speakAudio(message.data, { 
                                audio: message.data, 
                                // 传入文本有助于某些引擎做更精准的口型匹配
                                text: message.text || "something" 
                            });
                        } finally {
                            window.speakingCount--;
                            window.isSomeoneSpeaking = window.speakingCount > 0;
                        }
                    } catch (error) {
                        console.error(error);
                    }
                } else if (message.type === "error") {
                    console.error("TTS Error:", message.data?.error || "Unknown error");
                }
            };

            // nodeLoading.textContent = "Loading TTS...";
            await headtts.connect(null, (ev) => {
                if (ev) {
                    if (ev.lengthComputable) {
                        let val = Math.min(100, Math.round(ev.loaded / ev.total * 100));
                        // nodeLoading.textContent = "Loading TTS " + val + "%";
                    }
                }
            });

            headtts.setup({
                voice: "af_bella",
                language: "en-us",
                speed: 1,
                audioEncoding: "wav"
            });
        } catch (ttsError) {
            console.error("TTS loading failed:", ttsError);
        }

        nodeLoading.style.display = 'none';

        document.addEventListener("visibilitychange", async function(ev) {
            if (document.visibilityState === "visible") {
                if (typeof head !== 'undefined' && head) head.start();
            } else {
                if (typeof head !== 'undefined' && head) head.stop();
            }
        });

    } catch (error) {
        console.error(error);
        nodeLoading.textContent = error.toString();
    }
});
