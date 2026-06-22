import { HeadTTS } from "headtts";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { AVATAR_MODELS } from "./avatar-assets.js";
import { createAvatarWorldRuntime } from "./avatar-world-runtime.js";
import { SYSTEM_ASSETS, SYSTEM_ASSET_LIBRARY } from "./content/assets/system-assets.js";
import { OBJECT_TEMPLATES } from "./content/templates/object-templates.js";
import { createDefaultWorldDefinition } from "./content/worlds/default-world.js";
import { createWorldState } from "./infrastructure/world-state.js";
import { createRuntimeCollectionResolver, createSceneObjectFactory } from "./infrastructure/object-factory.js";
import { createAiActionContext } from "./infrastructure/ai-action-context.js";
import { createUploadRuntime } from "./infrastructure/upload-runtime.js";
import { createAiRuleEngine } from "./infrastructure/ai-rule-engine.js";
import { createSceneObjectRegistry } from "./infrastructure/scene-object-registry.js";
import { createDebugLogger } from "./infrastructure/debug-logger.js";
import { createPickingSystem } from "./infrastructure/picking-system.js";
import { createSelectionStore } from "./infrastructure/selection-store.js";
import { createSelectionOverlay } from "./infrastructure/selection-overlay.js";
import { createTransformGizmo } from "./infrastructure/transform-gizmo.js";
import { createAssetFromUpload } from "./usecases/create-asset-from-upload.js";
import { createWorldObjectFromAsset } from "./usecases/create-world-object-from-asset.js";
import { replaceWorldObjectAsset } from "./usecases/replace-world-object-asset.js";
import { createAiOrchestrator } from "./ai/ai-orchestrator.js";
import { createLlmEditPlanner } from "./ai/llm-edit-planner.js";
import { createActionExecutor } from "./infrastructure/action-executor.js";
import { createEditHistory } from "./infrastructure/edit-history.js";
import { createConstructionState } from "./infrastructure/construction-state.js";
import { createObjectEditPipeline } from "./infrastructure/object-edit-pipeline.js";
import { createMotionPlayer } from "./infrastructure/motion-player.js";
import { createConversationStore } from "./infrastructure/conversation-store.js";
import { createAgentContext } from "./infrastructure/agent/agent-context.js";
import { createToolRegistry } from "./infrastructure/agent/tool-registry.js";
import { registerAgentTools } from "./infrastructure/agent/agent-tools.js";
import { createAgentRuntime } from "./ai/agent-runtime.js";
import { createCameraController } from "./infrastructure/camera-controller.js";
import { createFocusPolicy } from "./infrastructure/focus-policy.js";
import { createSceneObjectLifecycle } from "./infrastructure/scene-object-lifecycle.js";
import { createAiPanelController } from "./ui/ai-panel-controller.js";

// =======================================================================
// 📂 资产库配置 (Asset Library)
// 这里集中管理了场景中所有需要外部加载的贴图、模型、图片资源。
// 方便你后续上传新资源并替换路径。
// =======================================================================
export const AssetLibrary = SYSTEM_ASSET_LIBRARY;
const START_WITH_EMPTY_SYSTEM_SCENE = true;

const DEFAULT_WORLD_DEFINITION = createDefaultWorldDefinition({
    assetLibrary: START_WITH_EMPTY_SYSTEM_SCENE
        ? { ...AssetLibrary, products: [], paintings: [], avatarTemplates: [] }
        : AssetLibrary,
    avatarConfigs: START_WITH_EMPTY_SYSTEM_SCENE ? [] : AVATAR_MODELS
});
const EMPTY_SYSTEM_ASSETS = SYSTEM_ASSETS.filter((asset) => asset.id === 'asset-texture-skylightHdr');

const worldState = createWorldState({
    world: DEFAULT_WORLD_DEFINITION.world,
    assets: START_WITH_EMPTY_SYSTEM_SCENE ? EMPTY_SYSTEM_ASSETS : SYSTEM_ASSETS,
    templates: OBJECT_TEMPLATES,
    worldObjects: DEFAULT_WORLD_DEFINITION.objects
});

const worldCollections = createRuntimeCollectionResolver(worldState);
const aiActionContext = createAiActionContext();
const aiRuleEngine = createAiRuleEngine();
const sceneObjectRegistry = createSceneObjectRegistry();
const uploadRuntime = createUploadRuntime();
const selectionStore = createSelectionStore();
const aiEditPlanner = createLlmEditPlanner();
const aiOrchestrator = createAiOrchestrator({
    worldState,
    selectionStore,
    sceneObjectRegistry,
    ruleEngine: aiRuleEngine,
    editPlanner: aiEditPlanner
});
// editHistory / actionExecutor 在 DOMContentLoaded 内构建——它们依赖只在场景初始化后才存在的
// replaceManagedSceneObject / setActiveBackgroundSelectable / 施工态等。
const debugLogger = createDebugLogger({
    enabled: () => Boolean(window.__DEBUG_HIT_TEST__ || window.__DEBUG_AVATAR_FOCUS__),
    defaultSessionId: 'architecture-refactor'
});

if (typeof window !== 'undefined') {
    window.worldState = worldState;
    window.worldCollections = worldCollections;
    window.systemAssetLibrary = AssetLibrary;
    window.aiActionContext = aiActionContext;
    window.sceneObjectRegistry = sceneObjectRegistry;
    window.selectionStore = selectionStore;
    window.aiOrchestrator = aiOrchestrator;
}

// ... existing code ...
let headtts;
let avatarWorldRuntime = null;
let selectedAvatarEntry = null;
const avatarConversationHistoryMap = new Map();
const getAvatarCapabilities = (entry) => entry?.config?.capabilities || {};
const canAvatarChat = (entry) => Boolean(getAvatarCapabilities(entry).canChat);
const canAvatarSpeak = (entry) => Boolean(getAvatarCapabilities(entry).canSpeak);
const getAvatarConversationHistory = (entry) => {
    if (!entry) return [];
    if (!avatarConversationHistoryMap.has(entry.key)) {
        avatarConversationHistoryMap.set(entry.key, []);
    }
    return avatarConversationHistoryMap.get(entry.key);
};
const updateSelectedAvatarEntry = (entry, { playGreeting = false } = {}) => {
    if (selectedAvatarEntry && selectedAvatarEntry.controller?.setSelected) {
        selectedAvatarEntry.controller.setSelected(false);
    }
    selectedAvatarEntry = entry || null;
    if (selectedAvatarEntry?.controller?.setSelected) {
        selectedAvatarEntry.controller.setSelected(true);
    }
    if (selectedAvatarEntry?.config?.voice && window.headtts && canAvatarSpeak(selectedAvatarEntry)) {
        window.headtts.setup({ voice: selectedAvatarEntry.config.voice });
    }
    if (playGreeting) {
        selectedAvatarEntry?.controller?.playGreeting?.();
    }
    window.updateAvatarDialogueUi?.();
};
const getAvatarEntryByKey = (key) => avatarWorldRuntime?.getEntryByKey?.(key) || null;
const getAvatarEntryByMesh = (mesh) => avatarWorldRuntime?.getEntryByMesh?.(mesh) || null;
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
    bgCanvas.style.pointerEvents = 'auto';
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
    bgScene.background = new THREE.Color(0xbcd9f2); // 白天天空蓝
    // 远景雾化会在动画循环里按“当前所在列”动态后移：
    // 第一列时压到第二列，推进到第二列后再逐渐退到第三列。
    const bgFog = new THREE.Fog(0xbcd9f2, 80, 1200);
    bgScene.fog = null;

    const bgCamera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 1, 3000); // 增加相机视野深度
    bgCamera.position.set(0, 8, 40); 
    bgCamera.lookAt(0, 8, -900); // 调整相机朝向，使其看向深度900的墙面

    const WORLD_FLOOR_Y = -5;
    const WORLD_ORIGIN = new THREE.Vector3(0, WORLD_FLOOR_Y, 0);
    const WORLD_CLICK_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), -WORLD_FLOOR_Y);
    const lastClickedWorldPoint = new THREE.Vector3(0, 0, 0);
    window.bgWorldOrigin = WORLD_ORIGIN.clone();

    window.bgCamera = bgCamera; // 暴露给轮播逻辑，用于换算 30 世界单位对应的屏幕像素
    window.bgScene = bgScene;
    window.bgRenderer = bgRenderer;
    window.bgTargetPositionX = 0;
    // 背景相机 Z 轴目标位置：默认初始 z = 40（看向墙的远景），
    // 通过鼠标滚轮可让相机朝墙面"穿过模型"推进（z 减小）。
    // 范围由 wheel 事件中的 clamp 决定：[BG_Z_MIN, BG_Z_MAX]
    window.bgTargetPositionZ = bgCamera.position.z;
    window.bgTargetYaw = 0;
    window.bgTargetPitch = 0;
    window.bgLookDeltaX = 0;
    window.bgLookDeltaY = 0;
    window.bgPointerLocked = false;
    const BG_FOCUS_CAMERA_OFFSET_Z = 40; // 点击某一列物体时，让相机停在该物体前方约 40 个世界单位
    window.bgMoveState = {
        left: false,
        right: false,
        forward: false,
        backward: false
    };
    const isInteractiveTarget = (target) => {
        if (!target || !target.closest) return false;
        if (target.closest('#avatar-dialogue-panel')) return true;
        if (target.closest('button') || target.closest('input') || target.closest('textarea') || target.closest('label')) return true;
        return false;
    };
    const enterPointerLock = () => {
        if (document.pointerLockElement === document.body) return;
        if (document.body.requestPointerLock) document.body.requestPointerLock();
    };
    const exitPointerLock = () => {
        if (document.pointerLockElement !== document.body) return;
        if (document.exitPointerLock) document.exitPointerLock();
    };
    const togglePointerLock = () => {
        if (document.pointerLockElement === document.body) exitPointerLock();
        else enterPointerLock();
    };
    // 默认：左键首次点击进入锁定（浏览器要求用户手势触发）。
    // 解锁状态下左键点击场景空白处也重新进入锁定，但点击 AI 面板/按钮则不锁。
    const requestScenePointerLock = (event) => {
        if (!event || event.button !== 0) return;
        if (document.pointerLockElement === document.body) return;
        if (isInteractiveTarget(event.target)) return;
        // 解锁状态下点击 gizmo 把手时不重新锁定，让用户可以拖拽。
        if (typeof window.__gizmoHandleAt === 'function' && window.__gizmoHandleAt(event.clientX, event.clientY)) return;
        enterPointerLock();
    };
    window.requestScenePointerLock = requestScenePointerLock;
    const syncPointerLockState = () => {
        const isLocked = document.pointerLockElement === document.body;
        window.bgPointerLocked = isLocked;
        document.body.classList.toggle('scene-pointer-locked', isLocked);
        if (!isLocked) {
            window.bgLookDeltaX = 0;
            window.bgLookDeltaY = 0;
        }
    };
    document.addEventListener('pointerlockchange', syncPointerLockState);
    window.addEventListener('mousemove', (event) => {
        if (!window.bgPointerLocked) return;
        window.bgLookDeltaX += event.movementX || 0;
        window.bgLookDeltaY += event.movementY || 0;
    });
    // 锁定时光标被冻结，event.clientX/Y 是旧值；此时用屏幕中心（准星）作为有效拾取点。
    const getEffectivePointerXY = (event) => {
        if (window.bgPointerLocked) {
            return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        }
        return { x: event?.clientX ?? 0, y: event?.clientY ?? 0 };
    };
    window.getEffectivePointerXY = getEffectivePointerXY;
    // 右键切换锁定状态：锁定中 → 解锁，可去 AI 面板操作；解锁中 → 重新锁定回视角模式。
    const handleSceneRightClick = (event) => {
        if (event.button !== 2) return;
        if (isInteractiveTarget(event.target)) return; // AI 面板内右键不拦截
        event.preventDefault();
        event.stopPropagation();
        togglePointerLock();
    };
    window.addEventListener('mousedown', handleSceneRightClick, { capture: true });
    // 阻止场景区域的浏览器右键菜单（AI 面板内仍保留）
    window.addEventListener('contextmenu', (event) => {
        if (isInteractiveTarget(event.target)) return;
        event.preventDefault();
    });
    // 左键首次点击场景空白处进入锁定
    bgCanvas.addEventListener('pointerdown', requestScenePointerLock);
    window.addEventListener('pointerdown', requestScenePointerLock, { capture: true });

    const pickingSystem = createPickingSystem({
        THREE,
        camera: bgCamera,
        getViewportSize: () => ({ width: window.innerWidth, height: window.innerHeight }),
        debugLogger
    });
    const registerHitTestTarget = (...args) => pickingSystem.registerTarget(...args);
    const unregisterHitTestTargets = (...args) => pickingSystem.unregisterTargets(...args);
    const queryBestHitTarget = (...args) => pickingSystem.query(...args);
    const getSelectableFocusPoint = (...args) => pickingSystem.getSelectableFocusPoint(...args);
    const worldClickRaycaster = new THREE.Raycaster();
    const worldClickMouse = new THREE.Vector2();
    const worldClickPlanePoint = new THREE.Vector3();
    const getWorldPlanePointFromPointer = (clientX, clientY) => {
        worldClickMouse.x = (clientX / window.innerWidth) * 2 - 1;
        worldClickMouse.y = -(clientY / window.innerHeight) * 2 + 1;
        worldClickRaycaster.setFromCamera(worldClickMouse, bgCamera);
        return worldClickRaycaster.ray.intersectPlane(WORLD_CLICK_PLANE, worldClickPlanePoint)
            ? worldClickPlanePoint.clone()
            : null;
    };

    const updateClickedWorldCoordinate = (point) => {
        if (!point) return;
        lastClickedWorldPoint.copy(point);
    };
    window.queryBestHitTarget = queryBestHitTarget;
    window.updateClickedWorldCoordinate = updateClickedWorldCoordinate;
    updateClickedWorldCoordinate(WORLD_ORIGIN);

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
    floor.position.y = WORLD_FLOOR_Y;
    if (!START_WITH_EMPTY_SYSTEM_SCENE) bgScene.add(floor);

    const worldGrid = new THREE.GridHelper(2400, 120, 0x75d7ff, 0x2d4d5f);
    worldGrid.position.copy(WORLD_ORIGIN);
    worldGrid.material.opacity = 0.3;
    worldGrid.material.transparent = true;
    bgScene.add(worldGrid);

    const worldAxes = new THREE.AxesHelper(42);
    worldAxes.position.copy(WORLD_ORIGIN);
    bgScene.add(worldAxes);

    const worldOriginMarker = new THREE.Mesh(
        new THREE.SphereGeometry(1.6, 18, 18),
        new THREE.MeshBasicMaterial({ color: 0xf4fbff, transparent: true, opacity: 0.9 })
    );
    worldOriginMarker.position.copy(WORLD_ORIGIN);
    bgScene.add(worldOriginMarker);

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
                dummy.position.set(x, WORLD_FLOOR_Y + floorTileThickness / 2, z);
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

    if (!START_WITH_EMPTY_SYSTEM_SCENE) bgScene.add(floorTiles);

    floorTiles.userData = {
        ...floorTiles.userData,
        selectableType: 'ground',
        worldObjectId: 'system-ground'
    };
    registerHitTestTarget(floorTiles, {
        type: 'ground'
    });

    // 原地板黑线网格已被瓷砖阵列的缝隙替代，不再需要 GridHelper
    // const floorGrid = new THREE.GridHelper(4000, 160, 0x111111, 0x111111); // 已停用

    // 2. 天花板 (Ceiling)
    // --- 方形天窗参数 ---
    const SKYLIGHT_GRID_PHASE = cellSpacing * 0.5; // ceil light 的 cell center 相位（边缘则落在整数个 cellSpacing 上）
    const SKYLIGHT_PERIOD_CELLS = 10; // 天窗中心间距 = 10 个 ceiling cells
    const SKYLIGHT_PERIOD_X = SKYLIGHT_PERIOD_CELLS * cellSpacing;
    const SKYLIGHT_TARGET_Z = -500;
    const SKYLIGHT_GRID_CELLS = 5;   // 基础尺寸：5 个 ceiling cells
    const SKYLIGHT_EDGE_EXPAND = cellSpacing * 0.5; // 在当前边界基础上四边各向外再扩半个格子
    const SKYLIGHT_OPENING_SIZE = SKYLIGHT_GRID_CELLS * cellSpacing + SKYLIGHT_EDGE_EXPAND * 2;
    const SKYLIGHT_HALF_OPENING = SKYLIGHT_OPENING_SIZE * 0.5;
    const SKYLIGHT_CENTER_Z = Math.round((SKYLIGHT_TARGET_Z - SKYLIGHT_GRID_PHASE) / cellSpacing) * cellSpacing + SKYLIGHT_GRID_PHASE;

    // --- 天窗 Shader 插件（将原来的贯穿天窗改成按固定节距重复的方形开孔） ---
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
            float centeredRepeat(float value, float period) {
                return mod(value + period * 0.5, period) - period * 0.5;
            }
        ` + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <clipping_planes_fragment>',
            `#include <clipping_planes_fragment>
            float skylightLocalX = centeredRepeat(vWorldPos.x - (${SKYLIGHT_GRID_PHASE.toFixed(1)}), ${SKYLIGHT_PERIOD_X.toFixed(1)});
            float skylightLocalZ = vWorldPos.z - (${SKYLIGHT_CENTER_Z.toFixed(1)});
            if (abs(skylightLocalX) < ${SKYLIGHT_HALF_OPENING.toFixed(1)} && abs(skylightLocalZ) < ${SKYLIGHT_HALF_OPENING.toFixed(1)}) {
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
    if (!START_WITH_EMPTY_SYSTEM_SCENE) bgScene.add(ceil);

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
    if (!START_WITH_EMPTY_SYSTEM_SCENE) bgScene.add(ceilLights);

    // --- 天窗竖井 / 树阵列参数 ---
    const treeSpacing = SKYLIGHT_PERIOD_X; // 树与树之间的横向间距，严格对齐天窗周期
    const treeCols = 25; // 覆盖横向视野

    // --- 方形天窗浅槽 / 屋面 / 天空 ---
    const shaftSizeX = SKYLIGHT_OPENING_SIZE;
    const shaftSizeZ = SKYLIGHT_OPENING_SIZE;
    const shaftHeight = 15; // 改成接近楼板厚度的浅槽，不再做深竖井
    const skylightSkyOffsetY = 24; // 在屋面上方抬一层天空平面，透过开口可见
    const shaftGeo = new THREE.BoxGeometry(shaftSizeX, shaftHeight, shaftSizeZ);
    
    const shaftWallTex = textureLoader.load(AssetLibrary.textures.wall);
    shaftWallTex.wrapS = THREE.RepeatWrapping;
    shaftWallTex.wrapT = THREE.RepeatWrapping;
    shaftWallTex.repeat.set(1.4, 1.2);
    
    const shaftWallMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: shaftWallTex,
        emissive: 0xffffff,
        emissiveMap: shaftWallTex,
        emissiveIntensity: 1.2,
        roughness: 0.9,
        side: THREE.BackSide // 从内部看
    });
    
    const shaftTopMat = new THREE.MeshBasicMaterial({ visible: false });
    const shaftBottomMat = new THREE.MeshBasicMaterial({ visible: false });


    const skylightRoofMat = new THREE.MeshStandardMaterial({
        color: 0xcfd6db,
        emissive: 0x000000,
        emissiveIntensity: 0,
        roughness: 0.96,
        metalness: 0.02,
        side: THREE.DoubleSide
    });
    skylightRoofMat.onBeforeCompile = skylightShaderPlugin;
    skylightRoofMat.needsUpdate = true;

    const skylightRoof = new THREE.Mesh(ceilGeo, skylightRoofMat);
    skylightRoof.rotation.x = Math.PI / 2;
    skylightRoof.position.y = 40 + shaftHeight;
    if (!START_WITH_EMPTY_SYSTEM_SCENE) bgScene.add(skylightRoof);

    const skylightSkyRadius = 2200;
    const skylightSkyCenterY = 40 + shaftHeight + 1400;
    const skylightSkyGeo = new THREE.SphereGeometry(skylightSkyRadius, 48, 24);
    const skylightSkyMat = new THREE.MeshBasicMaterial({
        color: 0x9fd4ff,
        side: THREE.BackSide,
        fog: false
    });
    const skylightSky = new THREE.Mesh(skylightSkyGeo, skylightSkyMat);
    skylightSky.position.set(0, skylightSkyCenterY, SKYLIGHT_CENTER_Z);
    if (!START_WITH_EMPTY_SYSTEM_SCENE) bgScene.add(skylightSky);

    if (!START_WITH_EMPTY_SYSTEM_SCENE) {
        new RGBELoader().load(AssetLibrary.textures.skylightHdr, (hdrTexture) => {
            hdrTexture.mapping = THREE.EquirectangularReflectionMapping;
            skylightSkyMat.map = hdrTexture;
            skylightSkyMat.needsUpdate = true;
        });
    }
    
    // BoxGeometry 面顺序：[+x, -x, +y(顶), -y(底), +z, -z]
    const shaftMats = [
        shaftWallMat,   // +x
        shaftWallMat,   // -x
        shaftTopMat,    // +y (天光)
        shaftBottomMat, // -y (开口)
        shaftWallMat,   // +z
        shaftWallMat    // -z
    ];
    
    const skylightShaftsGroup = new THREE.Group();
    for (let i = 0; i < treeCols; i++) {
        const shaftMesh = new THREE.Mesh(shaftGeo, shaftMats);
        const x = (i - Math.floor(treeCols / 2)) * treeSpacing + SKYLIGHT_GRID_PHASE;
        shaftMesh.position.set(x, 40 + shaftHeight / 2, SKYLIGHT_CENTER_Z);
        skylightShaftsGroup.add(shaftMesh);
    }
    if (!START_WITH_EMPTY_SYSTEM_SCENE) bgScene.add(skylightShaftsGroup);

    // --- 在每个方形天窗中心下方种植一棵树 ---
    // 树放置在 Z=-500, 并且底部紧贴地板 (Y=-5)
    const treesGroup = new THREE.Group();
    const treeSelectables = [];
    if (!START_WITH_EMPTY_SYSTEM_SCENE) bgScene.add(treesGroup);

    const treeWindUniforms = [];
    const configureTreeWindMaterial = (material, mesh, options = {}) => {
        if (!material || material.userData.treeWindConfigured) return;

        const {
            amp = 0.22,
            flutter = 0.05,
            minWeight = 0.18,
            weightStart = 0.02
        } = options;

        const geometry = mesh.geometry;
        if (geometry && !geometry.boundingBox) {
            geometry.computeBoundingBox();
        }
        const bbox = geometry && geometry.boundingBox;
        const windMinY = bbox ? bbox.min.y : 0;
        const windHeight = bbox ? Math.max(0.001, bbox.max.y - bbox.min.y) : 1;
        const shaderMinWeight = minWeight.toFixed(3);
        const shaderWeightStart = weightStart.toFixed(3);

        material.onBeforeCompile = (shader) => {
            shader.uniforms.uTreeWindTime = { value: 0 };
            shader.uniforms.uTreeWindMinY = { value: windMinY };
            shader.uniforms.uTreeWindHeight = { value: windHeight };
            shader.uniforms.uTreeWindAmp = { value: amp };
            shader.uniforms.uTreeWindFlutter = { value: flutter };

            shader.vertexShader = `
                uniform float uTreeWindTime;
                uniform float uTreeWindMinY;
                uniform float uTreeWindHeight;
                uniform float uTreeWindAmp;
                uniform float uTreeWindFlutter;
            ` + shader.vertexShader;

            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `#include <begin_vertex>
                 float windHeight01 = clamp((transformed.y - uTreeWindMinY) / uTreeWindHeight, 0.0, 1.0);
                 float windWeight = mix(${shaderMinWeight}, 1.0, smoothstep(${shaderWeightStart}, 1.0, windHeight01));
                 vec4 windWorldAnchor = modelMatrix * vec4(transformed, 1.0);
                 float windPhase = uTreeWindTime * 0.85 + windWorldAnchor.x * 0.045 + windWorldAnchor.z * 0.035;
                 float sway = sin(windPhase) + 0.5 * sin(windPhase * 1.7 + 1.3);
                 float flutter = sin(uTreeWindTime * 3.8 + transformed.x * 1.4 + transformed.y * 0.65);
                 transformed.x += (sway * uTreeWindAmp + flutter * uTreeWindFlutter) * windWeight * windWeight;
                 transformed.z += cos(windPhase * 1.15) * uTreeWindAmp * 0.45 * windWeight;
                `
            );

            treeWindUniforms.push(shader.uniforms.uTreeWindTime);
        };

        material.userData.treeWindConfigured = true;
        material.needsUpdate = true;
    };

    const sceneLoadingItems = new Map();
    let sceneLoadingIdleTimer = null;
    const getPendingSceneLoadingItems = () => Array.from(sceneLoadingItems.values())
        .filter((item) => item.status === 'loading');
    const renderSceneLoadingNotice = (fallbackMessage = 'Waiting for input...') => {
        const nodeLoading = document.getElementById('avatar-dialogue-loading');
        if (!nodeLoading) return false;
        const pending = getPendingSceneLoadingItems();
        nodeLoading.classList.toggle('is-loading', pending.length > 0);
        nodeLoading.classList.toggle('is-ready', pending.length === 0 && sceneLoadingItems.size > 0);
        nodeLoading.dataset.sceneLoading = pending.length > 0 ? 'true' : 'false';
        if (pending.length > 0) {
            const labels = pending.slice(0, 3).map((item) => item.label).join('、');
            const more = pending.length > 3 ? ` 等 ${pending.length} 项` : `${pending.length} 项`;
            nodeLoading.textContent = `场景资源加载中：${labels || '资源'}（${more}），部分对象暂不可选`;
            return true;
        }
        if (fallbackMessage !== null) {
            nodeLoading.textContent = fallbackMessage;
        }
        return false;
    };
    const startSceneLoadingItem = (id, label) => {
        if (!id) return;
        window.clearTimeout(sceneLoadingIdleTimer);
        sceneLoadingItems.set(id, {
            id,
            label: label || '资源',
            status: 'loading',
            startedAt: Date.now()
        });
        renderSceneLoadingNotice(null);
    };
    const finishSceneLoadingItem = (id, message = '场景加载完成，可以点击对象') => {
        if (!id) return;
        sceneLoadingItems.delete(id);
        const hasPending = renderSceneLoadingNotice(message);
        if (!hasPending && message) {
            sceneLoadingIdleTimer = window.setTimeout(() => {
                renderSceneLoadingNotice('Waiting for input...');
            }, 1800);
        }
    };
    window.renderSceneLoadingNotice = renderSceneLoadingNotice;
    window.getSceneLoadingState = () => ({
        pending: getPendingSceneLoadingItems().map((item) => ({ ...item })),
        pendingCount: getPendingSceneLoadingItems().length
    });

    const treeLoader = new GLTFLoader();
    startSceneLoadingItem('environment:trees', '树木');
    treeLoader.load('./assets/tree/island_tree_01_4k.gltf/island_tree_01_4k.gltf', (gltf) => {
        const baseTree = gltf.scene;
        // 放大三倍 (10 -> 30)
        baseTree.scale.set(30, 30, 30); 
        
        // 开启阴影
        baseTree.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = false;
                child.receiveShadow = false;

                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach((material) => {
                    if (!material || typeof material.name !== 'string') return;

                    const materialName = material.name.toLowerCase();
                    if (materialName.includes('leaves')) {
                        configureTreeWindMaterial(material, child, {
                            amp: 0.22,
                            flutter: 0.05,
                            minWeight: 0.18,
                            weightStart: 0.02
                        });
                    } else if (materialName.includes('branches')) {
                        configureTreeWindMaterial(material, child, {
                            amp: 0.035,
                            flutter: 0.008,
                            minWeight: 0.0,
                            weightStart: 0.28
                        });
                    }
                });
            }
        });
        
        // 克隆并生成森林阵列
        for (let i = 0; i < treeCols; i++) {
            const treeClone = baseTree.clone();
            const x = (i - Math.floor(treeCols / 2)) * treeSpacing + SKYLIGHT_GRID_PHASE;
            const treeWorldObjectId = `world-tree-${i}`;
            treeClone.name = treeWorldObjectId;
            treeClone.position.set(x, -5, SKYLIGHT_CENTER_Z);
            treeClone.userData.worldObjectId = treeWorldObjectId;
            treeClone.userData.selectableType = 'tree';
            treeClone.userData.selectableFocusZ = SKYLIGHT_CENTER_Z + BG_FOCUS_CAMERA_OFFSET_Z;
            treeClone.userData.selectableProjectOffset = new THREE.Vector3(0, 78, 0);
            treeClone.userData.assetInfo = createAssetInfo({
                id: `asset-tree-${i}`,
                name: `Tree ${i + 1}`,
                kind: 'model',
                source: 'system',
                type: 'tree',
                collection: 'environment',
                desc: 'Environment tree collider'
            });
            
            // 给每棵树随机的旋转角度，避免看起来完全一样
            treeClone.rotation.y = Math.random() * Math.PI * 2;
            
            treesGroup.add(treeClone);
            registerSceneInstance({
                objectId: treeWorldObjectId,
                root: treeClone,
                worldObjectId: treeWorldObjectId,
                source: 'system-tree',
                destroy: () => {
                    treeClone.removeFromParent();
                }
            });
            treeSelectables.push(treeClone);
            registerHitTestTarget(treeClone, {
                type: 'tree'
            });
        }
        finishSceneLoadingItem('environment:trees');
    }, undefined, (error) => {
        console.error("Error loading tree:", error);
        finishSceneLoadingItem('environment:trees', '树木加载失败，其他已加载对象仍可点击');
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
    if (!START_WITH_EMPTY_SYSTEM_SCENE) bgScene.add(wall);

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

    if (!START_WITH_EMPTY_SYSTEM_SCENE) bgScene.add(wallPanels);

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
    const createAssetInfo = ({
        id = '',
        name = '',
        kind = '',
        source = 'system',
        type = '',
        collection = '',
        time = '',
        status = '',
        desc = '',
        url = ''
    } = {}) => ({
        id,
        name,
        kind,
        source,
        type,
        collection,
        time,
        status,
        desc,
        url
    });
    window.createBgLoader = createBgLoader;
    window.createBgLabel = createBgLabel;
    const aiManagedGroup = new THREE.Group();
    aiManagedGroup.name = 'ai-managed-group';
    bgScene.add(aiManagedGroup);
    const sceneObjectFactory = createSceneObjectFactory({
        scene: aiManagedGroup,
        createLabel: createBgLabel,
        createLoader: createBgLoader,
        registerHitTestTarget
    });
    const removeBgLabelReference = (root) => {
        if (!root) return;
        const labelIndex = window.bgLabels.indexOf(root);
        if (labelIndex >= 0) {
            window.bgLabels.splice(labelIndex, 1);
        }
    };
    const sceneObjectLifecycle = createSceneObjectLifecycle({
        sceneObjectRegistry,
        unregisterHitTestTargets,
        removeLabelReference: removeBgLabelReference,
        sceneObjectFactory,
        worldState
    });
    const registerSceneInstance = sceneObjectLifecycle.registerSceneInstance;
    const createManagedWorldObject = sceneObjectLifecycle.createManagedWorldObject;
    const replaceManagedSceneObject = sceneObjectLifecycle.replaceManagedSceneObject;
    window.createManagedWorldObject = createManagedWorldObject;
    window.replaceManagedSceneObject = replaceManagedSceneObject;
    if (!START_WITH_EMPTY_SYSTEM_SCENE) {
        startSceneLoadingItem('runtime:avatars', '角色');
        createAvatarWorldRuntime({
            scene: bgScene,
            createLabel: createBgLabel,
            createLoader: createBgLoader,
            focusOffsetZ: BG_FOCUS_CAMERA_OFFSET_Z
        }).then((runtime) => {
            if (avatarWorldRuntime) {
                avatarWorldRuntime.destroy();
            }
            unregisterHitTestTargets((target) => target.type === 'avatar');
            avatarWorldRuntime = runtime;
            runtime.getEntries().forEach((entry) => {
                window.bgLabels.push(entry.mesh);
                registerHitTestTarget(entry.mesh, {
                    type: 'avatar'
                });
                registerSceneInstance({
                    objectId: `avatar-${entry.key}`,
                    root: entry.mesh,
                    worldObjectId: `avatar-${entry.key}`,
                    source: 'avatar',
                    destroy: () => {}
                });
            });
            window.updateAvatarDialogueUi?.();
            finishSceneLoadingItem('runtime:avatars');
        }).catch((error) => {
            console.error('Failed to initialize avatar world runtime:', error);
            finishSceneLoadingItem('runtime:avatars', '角色加载失败，其他已加载对象仍可点击');
        });
    }

    const dedupeByAssetId = (items = []) => {
        const seen = new Set();
        return items.filter((item) => {
            const key = item?.assetId || item?.worldObjectId || item?.url || null;
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    };
    const paintingsData = dedupeByAssetId(worldCollections.getPaintingConfigs());

    const paintingsGroup = new THREE.Group();
    const paintingSelectables = [];
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

    // Keep one selectable per backing asset to avoid stacked duplicates stealing clicks.
    const paintingCols = paintingsData.length;
    const halfCols = Math.floor(paintingCols / 2);

    for (let c = 0; c < paintingCols; c++) {
        const dataIndex = c;
        
        const template = paintingTemplates[dataIndex];
        const paintingGroup = new THREE.Group();
        
        const x = (c - halfCols) * paintingSpacing;
        // 高度改为 wallCenterY 保持在墙面正中心，Z 轴稍微凸出墙板
        paintingGroup.position.set(x, wallCenterY, -294.6 + wallPanelThickness);
        
        const paintingData = paintingsData[dataIndex];
        const frame = new THREE.Mesh(template.frameGeo, frameMat);
        paintingGroup.add(frame);
        
        const canvasMesh = new THREE.Mesh(template.canvasGeo, template.canvasMat);
        canvasMesh.position.z = template.frameDepth / 2 + 0.01;
        paintingGroup.add(canvasMesh);

        // 创建标签并存储在 userData 中
        const paintingSceneObjectId = `${paintingData.worldObjectId || `painting-${dataIndex}` }__instance_${c}`;
        const label = createBgLabel(paintingData.name || "Art", paintingData.time || "", paintingData.desc || "");
        // 标签高度在画框上方
        const labelYOffset = (paintingData.height || 10) / 2 + 3;
        
        // 创建加载圈
        const loader = createBgLoader();
        
        paintingGroup.userData = { 
            worldObjectId: paintingSceneObjectId,
            labelType: 'painting', 
            labelElement: label, 
            labelWorldOffset: new THREE.Vector3(0, labelYOffset, 0),
            loaderElement: loader.container,
            loaderText: loader.text,
            getIsLoaded: template.getIsLoaded,
            selectableType: 'painting',
            assetInfo: createAssetInfo({
                id: paintingData.assetId || paintingData.worldObjectId || paintingSceneObjectId,
                name: paintingData.name || 'Art',
                kind: 'image',
                source: 'system',
                type: 'painting',
                collection: 'painting',
                time: paintingData.time || '',
                desc: paintingData.desc || '',
                url: paintingData.url || ''
            }),
            selectableFocusZ: (-294.6 + wallPanelThickness) + BG_FOCUS_CAMERA_OFFSET_Z
        };
        window.bgLabels.push(paintingGroup);

        paintingsGroup.add(paintingGroup);
        paintingSelectables.push(paintingGroup);
        registerHitTestTarget(paintingGroup, {
            type: 'painting'
        });
        registerSceneInstance({
            objectId: paintingSceneObjectId,
            root: paintingGroup,
            worldObjectId: paintingData.worldObjectId || paintingSceneObjectId,
            source: 'system',
            destroy: () => {}
        });
    }
    if (!START_WITH_EMPTY_SYSTEM_SCENE) bgScene.add(paintingsGroup);

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
    const productSelectables = [];
    const showcaseSpacing = 30; // 与角色/画作间距保持一致
    
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
    const productList = dedupeByAssetId(worldCollections.getProductConfigs());
    const showcaseCols = productList.length;
         
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
        const leftShowcaseCount = Math.ceil(showcaseCols / 2);
        const productLane = c < leftShowcaseCount
            ? c - leftShowcaseCount - 1
            : c - leftShowcaseCount + 1;
        const x = productLane * showcaseSpacing + showcaseSpacing * 0.5;
        const z = -70; // 中景位置，避免默认视角射线先穿过前景 Avatar。
        let productConfig = null;
        let productSceneObjectId = `product-placeholder__instance_${c}`;
        
        // 创建一个外层容器，用来承载几何体或加载后的模型
        const itemContainer = new THREE.Group();
        // 产品位于前景 Avatar 后方，抬高到墙面上半区，避免默认视角被前景角色遮挡拾取。
        const baseItemY = wallCenterY + 16;
        itemContainer.position.set(x, baseItemY, z);
        
        if (productList.length > 0) {
            // 根据循环索引 c 拿到对应的产品配置
            productConfig = productList[c % productList.length];
            productSceneObjectId = `${productConfig.worldObjectId || `product-${c % productList.length}` }__instance_${c}`;
            
            if (productConfig && productConfig.url) {
                if (productConfig.type === 'video') {
                    // --- 视频类型产品加载逻辑 ---
                    let videoTexture;
                    let video;
                    const productLoadingId = `product-video:${productSceneObjectId}`;
                    
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
                    // 3D 内嵌控制条已停用，视频交互统一进入右侧 AI 操作面板。
                    
                    // 将相关引用保存到 itemContainer 中，供全局动画更新
                    itemContainer.userData = {
                        worldObjectId: productSceneObjectId,
                        isVideo: true,
                        video: video
                    };
                    
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
                    itemContainer.userData.assetInfo = createAssetInfo({
                        id: productConfig.assetId || productSceneObjectId,
                        name: productConfig.name || 'Video',
                        kind: 'video',
                        source: 'system',
                        type: 'product',
                        collection: 'product',
                        time: productConfig.time || '',
                        desc: productConfig.desc || '',
                        url: productConfig.url || ''
                    });
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
                        
                        // 动态更新标签的高度，确保它始终在视频的正上方
                        itemContainer.userData.labelWorldOffset.y = height / 2 + 3;
                        
                    };

                    // 如果视频已经加载了元数据，直接调整比例
                    if (video.videoWidth) {
                        updateVideoLayout(video.videoWidth / video.videoHeight);
                    } else {
                        // 否则等待加载完成事件
                        startSceneLoadingItem(productLoadingId, productConfig.name || '视频');
                        video.addEventListener('loadedmetadata', () => {
                            updateVideoLayout(video.videoWidth / video.videoHeight);
                            finishSceneLoadingItem(productLoadingId);
                        }, { once: true });
                        video.addEventListener('error', () => {
                            finishSceneLoadingItem(productLoadingId, '视频加载失败，其他已加载对象仍可点击');
                        }, { once: true });
                    }
                    
                } else {
                    // --- 模型类型产品加载逻辑 (默认 GLB) ---
                    let isLoaded = false;
                    let loadProgress = 0;
                    const targetSize = productConfig.targetSize || 16;
                    const productLoadingId = `product-model:${productSceneObjectId}`;
                    
                    const label = createBgLabel(productConfig.name || "Model", productConfig.time || "", productConfig.desc || "");
                    const labelYOffset = targetSize / 2 + 3;
                    const loader = createBgLoader();
                    
                    itemContainer.userData.labelType = 'product';
                    itemContainer.userData.worldObjectId = productSceneObjectId;
                    itemContainer.userData.labelElement = label;
                    itemContainer.userData.labelWorldOffset = new THREE.Vector3(0, labelYOffset, 0);
                    itemContainer.userData.loaderElement = loader.container;
                    itemContainer.userData.loaderText = loader.text;
                    itemContainer.userData.getIsLoaded = () => isLoaded;
                    itemContainer.userData.assetInfo = createAssetInfo({
                        id: productConfig.assetId || productSceneObjectId,
                        name: productConfig.name || 'Model',
                        kind: 'glb',
                        source: 'system',
                        type: 'product',
                        collection: 'product',
                        time: productConfig.time || '',
                        desc: productConfig.desc || '',
                        url: productConfig.url || ''
                    });
                    window.bgLabels.push(itemContainer);

                    startSceneLoadingItem(productLoadingId, productConfig.name || '模型');
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
                        
                        finishSceneLoadingItem(productLoadingId);
                    }, (xhr) => {
                        if (xhr.lengthComputable) {
                            const percentComplete = Math.round((xhr.loaded / xhr.total) * 100);
                            if (loader.text) loader.text.innerText = percentComplete + '%';
                        }
                    }, (error) => {
                        console.error(`Error loading product (${productConfig.url}):`, error);
                        itemContainer.add(new THREE.Mesh(holoGeo, holoMat));
                        finishSceneLoadingItem(productLoadingId, '模型加载失败，已使用占位对象');
                    });
                }
            }
        } else {
            // 如果列表为空，默认使用占位符
            itemContainer.add(new THREE.Mesh(holoGeo, holoMat));
        }
        
        itemContainer.userData.selectableType = 'product';
        itemContainer.userData.selectableFocusZ = z + BG_FOCUS_CAMERA_OFFSET_Z;
        showcaseGroup.add(itemContainer);
        productSelectables.push(itemContainer);
        registerHitTestTarget(itemContainer, {
            type: 'product'
        });
        // #region debug-point product-registration
        if (window.__DEBUG_PRODUCT_PICKING__) {
            fetch('http://127.0.0.1:4321/logs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: 'product-picking-angle',
                    runId: window.__DEBUG_PRODUCT_PICKING_RUN_ID__ || 'pre-fix',
                    hypothesisId: 'H1-H4',
                    location: 'talkinghead.js:product-register',
                    msg: '[DEBUG] product registered for picking',
                    data: {
                        productSceneObjectId,
                        productName: productConfig?.name || null,
                        productType: productConfig?.type || null,
                        childCount: itemContainer.children.length,
                        position: {
                            x: itemContainer.position.x,
                            y: itemContainer.position.y,
                            z: itemContainer.position.z
                        }
                    },
                    ts: Date.now()
                })
            }).catch(() => {});
        }
        // #endregion
        registerSceneInstance({
            objectId: productSceneObjectId,
            root: itemContainer,
            worldObjectId: productConfig?.worldObjectId || productSceneObjectId,
            source: 'system',
            destroy: () => {}
        });
        animatedShowcaseItems.push({
            mesh: itemContainer,
            baseY: baseItemY,
            seed: c * 0.1, // 用于动画错位
            productIndex: productList.length > 0 ? (c % productList.length) : 0 // 记录产品索引，用于同步旋转
        });
    }
    if (!START_WITH_EMPTY_SYSTEM_SCENE) bgScene.add(showcaseGroup);

    // --- 展品交互 / 统一点击检测 ---
    let bgObjectPointerDownX = 0;
    let bgObjectPointerDownY = 0;
    let bgObjectPointerDownTime = 0;
    const bgObjectSelectWorldPos = new THREE.Vector3();
    let activeBackgroundSelectable = null;
    const getSelectionBoxColor = (type) => {
        return 0x00ff00;
    };
    createSelectionOverlay({
        THREE,
        scene: bgScene,
        selectionStore,
        getInteractionBox: (object) => pickingSystem.getInteractionBox(object),
        getSelectionBoxColor
    });
    createTransformGizmo({
        THREE,
        scene: bgScene,
        camera: bgCamera,
        domElement: bgCanvas,
        selectionStore,
        sceneObjectRegistry,
        worldState,
        getInteractionBox: (object) => pickingSystem.getInteractionBox(object),
        isPointerLocked: () => Boolean(window.bgPointerLocked)
    });
    selectionStore.subscribe((state) => {
        activeBackgroundSelectable = state.root || null;
        window.activeBackgroundSelectable = activeBackgroundSelectable;
    });
    const clearActiveBackgroundSelectable = (reason = 'clear') => {
        debugLogger.emit({sessionId:"hit-selection-accuracy",runId:"refactor",hypothesisId:"selection-store",location:"talkinghead.js:clearActiveBackgroundSelectable",msg:"[DEBUG] clear selection requested",data:{activeRootName:activeBackgroundSelectable?.name||null,activeWorldObjectId:activeBackgroundSelectable?.userData?.worldObjectId||null,reason}});
        selectionStore.clear(reason);
    };
    const focusSelectionAlongCurrentView = (focusPoint, selectedObject = null) => {
        if (!focusPoint) return null;
        const focusDistance = selectedObject?.userData?.selectableType === 'avatar' ? 55 : 42;
        const cameraFrom = bgCamera.position.clone();
        const viewDirection = focusPoint.clone().sub(cameraFrom);
        if (viewDirection.lengthSq() < 0.0001) return null;
        viewDirection.normalize();
        const desiredCamera = focusPoint.clone().addScaledVector(viewDirection, -focusDistance);
        desiredCamera.y = bgCamera.position.y;
        const lookDirection = focusPoint.clone().sub(desiredCamera).normalize();
        const nextYaw = Math.atan2(-lookDirection.x, -lookDirection.z);
        const nextPitch = Math.asin(THREE.MathUtils.clamp(lookDirection.y, -1, 1));
        const cameraState = cameraController.setTarget({
            x: desiredCamera.x,
            z: desiredCamera.z
        });
        window.bgTargetPositionX = cameraState.targetX;
        window.bgTargetPositionZ = cameraState.targetZ;
        window.bgTargetYaw = nextYaw;
        window.bgTargetPitch = nextPitch;
        return cameraState;
    };
    window.focusSelectionAlongCurrentView = focusSelectionAlongCurrentView;
    const setActiveBackgroundSelectable = (object, meta = {}) => {
        if (!object || !object.userData || !object.userData.selectableType) return;
        if (activeBackgroundSelectable === object) return;
        selectionStore.select({
            worldObjectId: object.userData.worldObjectId || null,
            root: object,
            hitPoint: meta.hitPoint || null,
            hitResult: meta.hitResult || null,
            reason: meta.reason || 'select'
        });
        debugLogger.emit({sessionId:"hit-selection-accuracy",runId:"refactor",hypothesisId:"selection-store",location:"talkinghead.js:setActiveBackgroundSelectable",msg:"[DEBUG] selection-store selected object",data:{rootName:object?.name||null,worldObjectId:object?.userData?.worldObjectId||null,selectableType:object?.userData?.selectableType||null}});
    };
    window.setActiveBackgroundSelectable = setActiveBackgroundSelectable;
    window.clearActiveBackgroundSelectable = clearActiveBackgroundSelectable;
    const toggleActiveBackgroundSelectable = (object, meta = {}) => {
        if (!object || !object.userData || !object.userData.selectableType) return false;
        if (activeBackgroundSelectable === object) {
            clearActiveBackgroundSelectable();
            return false;
        }
        setActiveBackgroundSelectable(object, meta);
        return true;
    };
    // Shift+点击：把对象加入/移出多选集合；返回该对象点击后是否处于选中状态。
    const additiveToggleSelectable = (object, meta = {}) => {
        if (!object || !object.userData || !object.userData.selectableType) return false;
        const id = object.userData.worldObjectId || sceneObjectRegistry.getWorldObjectIdByRoot(object) || null;
        const wasSelected = id ? selectionStore.isSelected(id) : false;
        selectionStore.toggleAdditive({
            worldObjectId: id,
            root: object,
            hitPoint: meta.hitPoint || null,
            hitResult: meta.hitResult || null,
            reason: meta.reason || 'shift-select'
        });
        return !wasSelected; // 之前没选 → 现在选中
    };
    window.additiveToggleSelectable = additiveToggleSelectable;

    window.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return; // 只响应左键
        if (e.target.closest && (e.target.closest('button') || e.target.closest('input') || e.target.closest('textarea') || e.target.closest('label'))) {
            return;
        }
        const isInputTarget = e.target.closest && e.target.closest('#avatar-dialogue-panel');
        if (isInputTarget) {
            return;
        }

        bgObjectPointerDownX = e.clientX;
        bgObjectPointerDownY = e.clientY;
        bgObjectPointerDownTime = Date.now();
    }, { capture: true }); // 使用捕获阶段，抢在其他元素之前处理

    window.addEventListener('pointerup', (e) => {
        if (e.button !== 0) return;
        if (window.__gizmoDragging__ || window.__gizmoConsumedPointerUp__) return;
        if (e.target.closest && (e.target.closest('button') || e.target.closest('input') || e.target.closest('textarea') || e.target.closest('label'))) {
            return;
        }
        const isInputTarget = e.target.closest && e.target.closest('#avatar-dialogue-panel');
        if (isInputTarget) {
            return;
        }
        // 解锁状态下，左键点击场景被忽略，保持已选中对象/坐标不变。
        // 这样从锁定 → 右键解锁去操作面板的过程中，左键点 panel 外的空白不会清掉选中状态。
        if (!window.bgPointerLocked) return;
        // #region debug-point I:pointerup-begin
        debugLogger.emit({sessionId:"hit-selection-accuracy",runId:"pre-fix-r3",hypothesisId:"I",location:"talkinghead.js:pointerup:begin",msg:"[DEBUG] pointerup selection flow begin",data:{clientX:e.clientX,clientY:e.clientY,bgPointerDownX:bgObjectPointerDownX,bgPointerDownY:bgObjectPointerDownY,bgPointerDownAgeMs:Date.now()-bgObjectPointerDownTime},ts:Date.now()});
        // #endregion

        const pointerXY = getEffectivePointerXY(e);
        const hitResult = queryBestHitTarget(pointerXY.x, pointerXY.y);
        const object = hitResult?.object || null;
        const clickedPoint = hitResult?.hitPoint?.clone?.()
            || getWorldPlanePointFromPointer(pointerXY.x, pointerXY.y);
        // #region debug-point AFH:pointerup-hit
        debugLogger.emit({sessionId:"avatar-focus-hit-test",runId:"post-fix",hypothesisId:"H1",location:"talkinghead.js:pointerup:hit",msg:"[DEBUG] pointerup resolved hit with camera state",data:{clientX:e.clientX,clientY:e.clientY,camera:{x:Number(bgCamera.position.x.toFixed(2)),y:Number(bgCamera.position.y.toFixed(2)),z:Number(bgCamera.position.z.toFixed(2)),targetX:window.bgTargetPositionX??null,targetZ:window.bgTargetPositionZ??null},winner:{mode:hitResult?.mode||null,type:hitResult?.target?.type||null,rootName:object?.name||null,worldObjectId:object?.userData?.worldObjectId||null,selectableType:object?.userData?.selectableType||null,distance:hitResult?.distance??null},clickedPoint:clickedPoint?{x:Number(clickedPoint.x.toFixed(2)),y:Number(clickedPoint.y.toFixed(2)),z:Number(clickedPoint.z.toFixed(2))}:null,activeBefore:activeBackgroundSelectable?.userData?.worldObjectId||null},ts:Date.now()});
        // #endregion
        // #region debug-point I:pointerup-after-hit
        debugLogger.emit({sessionId:"hit-selection-accuracy",runId:"pre-fix-r3",hypothesisId:"I",location:"talkinghead.js:pointerup:afterHit",msg:"[DEBUG] pointerup hit query resolved",data:{clientX:e.clientX,clientY:e.clientY,hitMode:hitResult?.mode||null,hitRootName:object?.name||null,hitWorldObjectId:object?.userData?.worldObjectId||null,hitSelectableType:object?.userData?.selectableType||null,hitDistance:hitResult?.distance??null,clickedPoint:clickedPoint?{x:Number(clickedPoint.x.toFixed(2)),y:Number(clickedPoint.y.toFixed(2)),z:Number(clickedPoint.z.toFixed(2))}:null},ts:Date.now()});
        // #endregion
        if (clickedPoint) {
            updateClickedWorldCoordinate(clickedPoint);
        }
        if (!object || !object.userData || !object.userData.selectableType) {
            // #region debug-point I:pointerup-create-branch
            debugLogger.emit({sessionId:"hit-selection-accuracy",runId:"pre-fix-r3",hypothesisId:"I",location:"talkinghead.js:pointerup:createBranch",msg:"[DEBUG] pointerup entered create branch",data:{clientX:e.clientX,clientY:e.clientY,hasClickedPoint:Boolean(clickedPoint),activeWorldObjectId:activeBackgroundSelectable?.userData?.worldObjectId||null},ts:Date.now()});
            // #endregion
            clearActiveBackgroundSelectable();
            updateSelectedAvatarEntry(null);
            if (clickedPoint) {
                aiActionContext.setTarget({
                    mode: 'create',
                    worldPoint: clickedPoint,
                    selectedObjectId: null,
                    selectedObjectType: null,
                    selectedObjectName: null
                });
                const nodeLoading = document.getElementById('avatar-dialogue-loading');
                if (nodeLoading && !window.renderSceneLoadingNotice?.('坐标已锁定，可以上传资产创建对象')) {
                    nodeLoading.textContent = '坐标已锁定，可以上传资产创建对象';
                }
            }
            return;
        }

        const selectableFocusPoint = getSelectableFocusPoint(object);
        if (selectableFocusPoint) {
            bgObjectSelectWorldPos.copy(selectableFocusPoint);
        } else {
            object.getWorldPosition(bgObjectSelectWorldPos);
        }
        // Shift+点击 = 多选（加减）；普通点击 = 单选替换。
        const selectFn = e.shiftKey ? additiveToggleSelectable : toggleActiveBackgroundSelectable;
        const isNowSelected = selectFn(object, {
            hitPoint: clickedPoint,
            hitResult,
            reason: e.shiftKey ? 'shift-select' : 'pointer-select'
        });
        if (object.userData.selectableType === 'avatar') {
            updateSelectedAvatarEntry(isNowSelected ? getAvatarEntryByMesh(object) : null, { playGreeting: isNowSelected });
        } else {
            updateSelectedAvatarEntry(null);
        }
        const sceneObjectId = sceneObjectRegistry.getWorldObjectIdByRoot(object) || object.userData.worldObjectId || null;
        // #region debug-point I:pointerup-select-branch
        debugLogger.emit({sessionId:"hit-selection-accuracy",runId:"pre-fix-r3",hypothesisId:"I",location:"talkinghead.js:pointerup:selectBranch",msg:"[DEBUG] pointerup entered select branch",data:{clientX:e.clientX,clientY:e.clientY,rootName:object?.name||null,worldObjectId:object?.userData?.worldObjectId||null,registryWorldObjectId:sceneObjectId,selectableType:object?.userData?.selectableType||null,activeWorldObjectIdBefore:activeBackgroundSelectable?.userData?.worldObjectId||null},ts:Date.now()});
        // #endregion
        if (!isNowSelected) {
            if (clickedPoint) {
                aiActionContext.setTarget({
                    mode: 'create',
                    worldPoint: clickedPoint,
                    selectedObjectId: null,
                    selectedObjectType: null,
                    selectedObjectName: null
                });
                const nodeLoading = document.getElementById('avatar-dialogue-loading');
                if (nodeLoading && !window.renderSceneLoadingNotice?.('对象已取消选中，当前回到坐标创建模式')) {
                    nodeLoading.textContent = '对象已取消选中，当前回到坐标创建模式';
                }
            }
            return;
        }
        // #region debug-point I:pointerup-final-select
        debugLogger.emit({sessionId:"hit-selection-accuracy",runId:"pre-fix-r3",hypothesisId:"I",location:"talkinghead.js:pointerup:finalSelect",msg:"[DEBUG] pointerup finalized selection",data:{clientX:e.clientX,clientY:e.clientY,rootName:object?.name||null,worldObjectId:object?.userData?.worldObjectId||null,registryWorldObjectId:sceneObjectId,activeWorldObjectIdAfter:activeBackgroundSelectable?.userData?.worldObjectId||null,selectableType:object?.userData?.selectableType||null,focusPoint:{x:Number(bgObjectSelectWorldPos.x.toFixed(2)),y:Number(bgObjectSelectWorldPos.y.toFixed(2)),z:Number(bgObjectSelectWorldPos.z.toFixed(2))}},ts:Date.now()});
        // #endregion
        aiActionContext.setTarget({
            mode: 'replace',
            worldPoint: clickedPoint || bgObjectSelectWorldPos,
            selectedObjectId: sceneObjectId,
            selectedObjectType: object.userData.selectableType,
            selectedObjectName: object.userData.labelElement?.querySelector?.('.avatar-name')?.textContent || sceneObjectId || object.userData.selectableType
        });
        const nodeLoading = document.getElementById('avatar-dialogue-loading');
        if (nodeLoading && !window.renderSceneLoadingNotice?.('对象已选中，可以上传资产替换或直接删除')) {
            nodeLoading.textContent = '对象已选中，可以上传资产替换或直接删除';
        }
    }, { capture: true });

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

    const FOG_CAMERA_ANCHORS = [
        { cameraZ: 40, fogTargetZ: -150 },                          // 第一列角色 -> 雾压到第二列产品
        { cameraZ: -150, fogTargetZ: -294.6 + wallPanelThickness }, // 第二列产品 -> 雾退到第三列画作
        { cameraZ: -294.6 + wallPanelThickness, fogTargetZ: SKYLIGHT_CENTER_Z },
        { cameraZ: SKYLIGHT_CENTER_Z, fogTargetZ: -895 },
        { cameraZ: -895, fogTargetZ: -895 }
    ];
    const getFogTargetZForCamera = (cameraZ) => {
        if (cameraZ >= FOG_CAMERA_ANCHORS[0].cameraZ) return FOG_CAMERA_ANCHORS[0].fogTargetZ;
        const lastAnchor = FOG_CAMERA_ANCHORS[FOG_CAMERA_ANCHORS.length - 1];
        if (cameraZ <= lastAnchor.cameraZ) return lastAnchor.fogTargetZ;

        for (let i = 0; i < FOG_CAMERA_ANCHORS.length - 1; i++) {
            const from = FOG_CAMERA_ANCHORS[i];
            const to = FOG_CAMERA_ANCHORS[i + 1];
            if (cameraZ <= from.cameraZ && cameraZ >= to.cameraZ) {
                const t = (cameraZ - from.cameraZ) / (to.cameraZ - from.cameraZ);
                return THREE.MathUtils.lerp(from.fogTargetZ, to.fogTargetZ, t);
            }
        }
        return lastAnchor.fogTargetZ;
    };

    // 背景纵深范围限制：已解除，允许相机自由移动（无限空间）。
    const BG_Z_MAX = Infinity;
    const BG_Z_MIN = -Infinity;
    const cameraController = createCameraController({
        camera: bgCamera,
        minZ: BG_Z_MIN,
        maxZ: BG_Z_MAX,
        initialTargetX: window.bgTargetPositionX,
        initialTargetZ: window.bgTargetPositionZ
    });
    const focusPolicy = createFocusPolicy({ cameraController, debugLogger });

    // 启动背景渲染动画循环
    let lastBgFrameTime = performance.now();
    const animateBg = () => {
        requestAnimationFrame(animateBg);
        const now = performance.now();
        const deltaSeconds = Math.min(0.05, (now - lastBgFrameTime) / 1000);
        lastBgFrameTime = now;

        const BG_LOOK_SENSITIVITY_X = 0.0024;
        const BG_LOOK_SENSITIVITY_Y = 0.0018;
        const BG_MOVE_SPEED = 82;
        if (window.bgPointerLocked) {
            window.bgTargetYaw -= window.bgLookDeltaX * BG_LOOK_SENSITIVITY_X;
            window.bgTargetPitch -= window.bgLookDeltaY * BG_LOOK_SENSITIVITY_Y;
            window.bgTargetPitch = THREE.MathUtils.euclideanModulo(window.bgTargetPitch + Math.PI, Math.PI * 2) - Math.PI;
            window.bgLookDeltaX = 0;
            window.bgLookDeltaY = 0;
        }

        const cosYaw = Math.cos(window.bgTargetYaw);
        const sinYaw = Math.sin(window.bgTargetYaw);
        const forwardX = -sinYaw;
        const forwardZ = -cosYaw;
        const rightX = cosYaw;
        const rightZ = -sinYaw;
        let moveX = 0;
        let moveZ = 0;
        if (window.bgMoveState.left) {
            moveX -= rightX;
            moveZ -= rightZ;
        }
        if (window.bgMoveState.right) {
            moveX += rightX;
            moveZ += rightZ;
        }
        if (window.bgMoveState.forward) {
            moveX += forwardX;
            moveZ += forwardZ;
        }
        if (window.bgMoveState.backward) {
            moveX -= forwardX;
            moveZ -= forwardZ;
        }
        if (moveX !== 0 || moveZ !== 0) {
            const moveLength = Math.hypot(moveX, moveZ) || 1;
            const step = BG_MOVE_SPEED * deltaSeconds;
            const cameraState = cameraController.moveTargetBy({
                x: (moveX / moveLength) * step,
                z: (moveZ / moveLength) * step
            });
            window.bgTargetPositionX = cameraState.targetX;
            window.bgTargetPositionZ = cameraState.targetZ;
        }
        const cameraState = cameraController.update({ lerp: 0.08, snapXThreshold: 0.01 });
        window.bgTargetPositionX = cameraState.targetX;
        window.bgTargetPositionZ = cameraState.targetZ;

        const isAtAvatarLayer = bgCamera.position.z > -50 && window.bgTargetPositionZ > -50;
        const fadeProgress = 1;

        // 保持相机高度稳定，避免推进到第二三列时角色投影被额外压缩或上抬。
        const BG_Y_BASE = 8;
        const currentY = BG_Y_BASE;
        bgCamera.position.y = currentY;
        // 鼠标边缘感应控制主视角，形成接近第一人称的自由观察。
        const lookDirection = window._bgLookDirection || (window._bgLookDirection = new THREE.Vector3());
        const lookTarget = window._bgLookTarget || (window._bgLookTarget = new THREE.Vector3());
        lookDirection.set(
            -Math.sin(window.bgTargetYaw) * Math.cos(window.bgTargetPitch),
            Math.sin(window.bgTargetPitch),
            -Math.cos(window.bgTargetYaw) * Math.cos(window.bgTargetPitch)
        );
        lookTarget.copy(bgCamera.position).addScaledVector(lookDirection, 1200);
        bgCamera.lookAt(lookTarget);

        avatarWorldRuntime?.update(deltaSeconds);

        // 推进所有用户上传对象（带 GLB 内置动画）的 AnimationMixer
        sceneObjectRegistry.forEachRecord((record) => {
            record.mixer?.update(deltaSeconds);
        });

        // 推进运动轨迹播放（沿航点移动对象）
        window.motionPlayer?.update?.(deltaSeconds);

        // 大黄和X角色的右键提示图标保持固定显示，不再随着推进淡出
        document.querySelectorAll('.mouse-click-anim').forEach(anim => {
            if (anim.parentElement) {
                anim.parentElement.style.opacity = '1';
                anim.parentElement.style.pointerEvents = 'none'; // 确保本身就不阻挡事件
            }
        });

        // 树叶风摆：只更新叶片材质的时间 uniform，不影响树干/枝干材质
        const treeWindTime = performance.now() * 0.001;
        treeWindUniforms.forEach((timeUniform) => {
            timeUniform.value = treeWindTime;
        });

        // 横向空间改为有限场景：建筑与阵列保持在固定世界坐标，不再跟随相机 X 循环平移。
        floor.position.x = 0;
        ceil.position.x = 0;
        skylightRoof.position.x = 0;
        skylightSky.position.x = 0;
        wall.position.x = 0;
        ceilLights.position.x = 0;
        floorTiles.position.x = 0;
        wallPanels.position.x = 0;
        
        // 背景对象阵列保持静态分布，不再做横向周期循环。
        paintingsGroup.position.x = 0;
        showcaseGroup.position.x = 0;
        skylightShaftsGroup.position.x = 0;
        treesGroup.position.x = 0;

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
        });



        // 墙面纹理保持固定，避免仍然产生横向“无限延展”的视觉错觉。
        wallTexture.offset.x = 0;
        // 地板瓷砖现在通过吸附位移实现循环，无需再做 UV offset
        // floorTexture.offset.x = (bgCamera.position.x / 4000) * 40; // 已停用

        // --- 更新 3D UI 标签 ---
        if (window.bgLabels) {
            const cameraZ = bgCamera.position.z;
            
            // 根据相机深度判断当前聚焦的层级
            let currentLayer = 'none';
            if (cameraZ > -50) {
                currentLayer = 'avatar';
            } else if (cameraZ <= -50 && cameraZ > -160) {
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
                        
                        // 只有当前被选中的对象才显示自己的 tag / loader。
                        if (labelType !== currentLayer || activeBackgroundSelectable !== obj) {
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
                                
                                // Tag 信息统一显示在右侧 AI 面板，不再悬浮在 3D 场景里。
                                labelElement.style.display = 'none';
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
            bgFog.color.setHex(0xffffff);
            
            // 地板：底板（缝隙）浅灰，瓷砖恢复为纯白底色让贴图正常呈现
            floorMat.color.setHex(0xdcdcdc);
            floorMat.emissive.setHex(0x000000);
            floorMat.emissiveIntensity = 0;
            floorTileMat.color.setHex(0xffffff);
            
            ceilMat.color.setHex(0xdcdcdc); // 恢复浅灰背板（缝隙颜色）
            ceilMat.emissive.setHex(0x000000);
            ceilMat.emissiveIntensity = 0;
            shaftWallMat.color.setHex(0xffffff);
            shaftWallMat.emissive.setHex(0xffffff);
            shaftWallMat.emissiveIntensity = 0.45;
            skylightRoofMat.color.setHex(0xcfd6db);
            skylightRoofMat.emissive.setHex(0x000000);
            skylightRoofMat.emissiveIntensity = 0;
            skylightSkyMat.color.setHex(0xbfe3ff);
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
            bgFog.color.setHex(0x020202);
            
            // 地板：底板（缝隙）调暗，瓷砖也调成中灰让混凝土纹理仍可见
            floorMat.color.setHex(0x222222);
            floorMat.emissive.setHex(0x000000);
            floorMat.emissiveIntensity = 0;
            floorTileMat.color.setHex(0x888888);
            
            ceilMat.color.setHex(0x050505);
            ceilMat.emissive.setHex(0x000000);
            ceilMat.emissiveIntensity = 0;
            shaftWallMat.color.setHex(0xbbbbbb);
            shaftWallMat.emissive.setHex(0x666666);
            shaftWallMat.emissiveIntensity = 0.6;
            skylightRoofMat.color.setHex(0x2a3136);
            skylightRoofMat.emissive.setHex(0x101820);
            skylightRoofMat.emissiveIntensity = 0.12;
            skylightSkyMat.color.setHex(0x345a78);
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
    window.focusBackgroundSlot = (targetX, targetZ) => {
        const state = focusPolicy.focusSelection({
            targetX,
            targetZ,
            activeType: activeBackgroundSelectable?.userData?.selectableType || null
        });
        window.bgTargetPositionX = state.targetX;
        window.bgTargetPositionZ = state.targetZ;
        if (window.bgTargetPositionZ > -50 && activeBackgroundSelectable?.userData?.selectableType !== 'avatar') {
            clearActiveBackgroundSelectable();
        }
    };
    
    // ⚙️ 滚轮前后推进设置
    // 滚轮不再单独修改 Z，而是沿当前主视角方向做前进/后退。
    const BG_WHEEL_MOVE_STEP = 24;    
    
    window.addEventListener('wheel', (e) => {
        // 阻止页面默认滚动行为，让滚轮专用于场景聚焦
        e.preventDefault();
        const moveSign = Math.sign(e.deltaY);
        if (moveSign === 0) return;
        const forwardX = -Math.sin(window.bgTargetYaw);
        const forwardZ = -Math.cos(window.bgTargetYaw);
        const state = cameraController.moveTargetBy({
            x: -forwardX * BG_WHEEL_MOVE_STEP * moveSign,
            z: -forwardZ * BG_WHEEL_MOVE_STEP * moveSign
        });
        window.bgTargetPositionX = state.targetX;
        window.bgTargetPositionZ = state.targetZ;
    }, { passive: false, capture: true });
};

initGlobalBackground();

// 走代理：本地由 proxy-server.js 注入 Authorization；线上 Vercel 由 /api/proxy/[...path].js 注入。
// 前端不再持有任何 API key。
const PROXY_API_URL = "/api/proxy/api/coding/v3/chat/completions";

// -----------------------------------------------------------------------
// 动作解析与执行逻辑 (Global Scope)
// -----------------------------------------------------------------------
window.processActions = (text, entry = selectedAvatarEntry) => {
    console.log("🔍 Processing Actions for text:", text);
    let cleanText = text || '';
    const controller = entry?.controller;
    const tags = cleanText.match(/\[[^\]]+\]/g) || [];
    tags.forEach((tag) => {
        controller?.handleActionTag?.(tag);
    });
    return cleanText.replace(/\[.*?\]/g, ' ').replace(/\s+/g, ' ').trim();
};

async function callVolcengineAI(userMessage, nodeLoading, entry) {
    console.log("🚀 Calling Volcengine AI...");
    if (!entry) {
        return "Please select an avatar first.";
    }
    if (nodeLoading) nodeLoading.textContent = "AI thinking...";

    const conversationHistory = getAvatarConversationHistory(entry);
    conversationHistory.push({
        role: "user",
        content: userMessage
    });

    const baseSystemPrompt = `${entry.config.personality || "You are a friendly AI assistant with a 3D avatar."}
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

Example: "[happy] Hello! [handup] Nice to meet you! [thumbup]"`;

    try {
        const response = await fetch(PROXY_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
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
        console.log("🤖 AI Original Response:", aiResponse);

        conversationHistory.push({
            role: "assistant",
            content: aiResponse
        });

        return aiResponse;
    } catch (error) {
        console.error("Error calling Volcengine AI:", error);
        if (nodeLoading) nodeLoading.textContent = `Network Error: ${error.message}`;
        return `I'm having trouble connecting. The error is: ${error.message}`;
    }
}

document.addEventListener('DOMContentLoaded', async function() {
    const nodeLoading = document.getElementById('avatar-dialogue-loading');

    const setMoveStateByKey = (code, isPressed) => {
        if (code === 'ArrowLeft' || code === 'KeyA') {
            window.bgMoveState.left = isPressed;
            return true;
        }
        if (code === 'ArrowRight' || code === 'KeyD') {
            window.bgMoveState.right = isPressed;
            return true;
        }
        if (code === 'ArrowUp' || code === 'KeyW') {
            window.bgMoveState.forward = isPressed;
            return true;
        }
        if (code === 'ArrowDown' || code === 'KeyS') {
            window.bgMoveState.backward = isPressed;
            return true;
        }
        return false;
    };

    window.addEventListener('keydown', (e) => {
        if (e.target.tagName.toLowerCase() === 'input' || e.target.tagName.toLowerCase() === 'textarea') {
            return;
        }
        if (setMoveStateByKey(e.code, true)) {
            e.preventDefault();
        }
    });
    window.addEventListener('keyup', (e) => {
        if (setMoveStateByKey(e.code, false)) {
            e.preventDefault();
        }
    });
    window.addEventListener('blur', () => {
        window.bgMoveState.left = false;
        window.bgMoveState.right = false;
        window.bgMoveState.forward = false;
        window.bgMoveState.backward = false;
        window.bgLookDeltaX = 0;
        window.bgLookDeltaY = 0;
    });

    // —— AI 编辑：施工态 + 草稿替换管线 + 撤销栈（依赖此处已就绪的场景级函数）——
    const constructionState = createConstructionState({ THREE });
    const reselectAfterRebuild = (worldObjectId, root) => {
        if (root) window.setActiveBackgroundSelectable?.(root, { reason: 'edit-replace' });
    };
    const editHistory = createEditHistory({
        worldState,
        sceneObjectRegistry,
        replaceManagedSceneObject,
        reselect: reselectAfterRebuild,
        onAfterUndo: () => { window.updateAvatarDialogueUi?.(); }
    });
    const objectEditPipeline = createObjectEditPipeline({
        worldState,
        sceneObjectRegistry,
        replaceManagedSceneObject,
        reselect: reselectAfterRebuild,
        constructionState,
        editHistory
    });
    const actionExecutor = createActionExecutor({
        worldState,
        sceneObjectRegistry,
        editHistory,
        objectEditPipeline
    });

    // —— 运动轨迹播放器 ——
    const motionPlayer = createMotionPlayer({
        worldState,
        sceneObjectRegistry,
        onChange: () => { window.updateAvatarDialogueUi?.(); }
    });
    window.motionPlayer = motionPlayer;

    // —— Agent：工具注册表 + 受控 ctx + 工具调用循环 ——
    const agentContext = createAgentContext({
        worldState,
        sceneObjectRegistry,
        selectionStore,
        actionExecutor,
        objectEditPipeline,
        createManagedWorldObject,
        reselect: reselectAfterRebuild,
        getCameraPlacement: (distance = 60) => {
            const dir = new THREE.Vector3();
            bgCamera.getWorldDirection(dir);
            const p = bgCamera.position.clone().addScaledVector(dir, distance);
            return { x: p.x, y: p.y, z: p.z };
        },
        getTargetPoint: () => aiActionContext.getState().worldPoint || null,
        motionPlayer
    });
    const agentToolRegistry = createToolRegistry();
    registerAgentTools({ registry: agentToolRegistry, ctx: agentContext });
    const agentRuntime = createAgentRuntime({ registry: agentToolRegistry });
    const conversationStore = createConversationStore();
    // 调试用：暴露 agent 内部，便于直接驱动与解剖生成结果
    window.agentRuntime = agentRuntime;
    window.conversationStore = conversationStore;
    window.agentContext = agentContext;
    window.agentToolRegistry = agentToolRegistry;

    const aiPanelController = createAiPanelController({
        document,
        window,
        worldState,
        aiActionContext,
        selectionStore,
        sceneObjectRegistry,
        aiOrchestrator,
        actionExecutor,
        agentRuntime,
        motionPlayer,
        conversationStore,
        createAssetFromUpload,
        uploadRuntime,
        createWorldObjectFromAsset,
        replaceWorldObjectAsset,
        createManagedWorldObject,
        replaceManagedSceneObject,
        deleteWorldObject: (worldObjectId) => {
            sceneObjectRegistry.destroyWorldObject(worldObjectId);
            worldState.removeWorldObject(worldObjectId);
        },
        clearSelection: (reason) => {
            clearActiveBackgroundSelectable(reason);
        },
        focusWorldObject: (worldObject) => {
            if (worldObject && typeof window.focusSelectionAlongCurrentView === 'function') {
                const sceneRecord = sceneObjectRegistry.getByWorldObjectId(worldObject.id);
                const focusPoint = sceneRecord?.root
                    ? getSelectableFocusPoint(sceneRecord.root) || sceneRecord.root.position
                    : new THREE.Vector3(worldObject.position.x, worldObject.position.y, worldObject.position.z);
                window.focusSelectionAlongCurrentView(focusPoint, sceneRecord?.root || null);
            }
        },
        updateSelectedAvatarEntry,
        debugLogger
    });
    aiPanelController.render();
    // Ctrl+Z / Cmd+Z 撤销最近一次 AI 变换编辑
    editHistory.bindKeyboard(window);

    try {
        const AudioContextCtor = window.AudioContext || window['webkitAudioContext'];
        const sharedAudioCtx = new AudioContextCtor();
        window.avatarAudioQueue = [];
        window.isAvatarAudioPlaying = false;
        window.speakingCount = 0;
        window.isSomeoneSpeaking = false;

        const playNextAvatarAudio = async () => {
            if (window.avatarAudioQueue.length === 0) {
                window.isAvatarAudioPlaying = false;
                return;
            }
            window.isAvatarAudioPlaying = true;
            const nextItem = window.avatarAudioQueue.shift();
            const entry = getAvatarEntryByKey(nextItem.entryKey);
            if (!entry) {
                playNextAvatarAudio();
                return;
            }
            window.speakingCount++;
            window.isSomeoneSpeaking = window.speakingCount > 0;
            entry.controller.onSpeechStart?.();
            const source = sharedAudioCtx.createBufferSource();
            source.buffer = nextItem.buffer;
            source.connect(sharedAudioCtx.destination);
            source.onended = () => {
                entry.controller.onSpeechEnd?.();
                window.speakingCount--;
                window.isSomeoneSpeaking = window.speakingCount > 0;
                playNextAvatarAudio();
            };
            source.start(0);
        };

        window.headtts = new HeadTTS({
            endpoints: ["webgpu", "wasm"],
            languages: ["en-us"],
            voices: ["af_bella", "af_sarah", "am_adam", "am_michael"],
            workerModule: "https://cdn.jsdelivr.net/npm/@met4citizen/headtts@1.2/modules/worker-tts.mjs",
            dictionaryURL: "https://cdn.jsdelivr.net/npm/@met4citizen/headtts@1.2/dictionaries/",
            audioCtx: sharedAudioCtx,
            trace: 0
        });
        headtts = window.headtts;

        headtts.onmessage = async (message) => {
            if (message.type === 'error') {
                console.error('TTS Error:', message.data?.error || 'Unknown error');
                return;
            }
            if (message.type !== 'audio') return;

            const speechEntry = getAvatarEntryByKey(window.pendingSpeechEntryKey) || selectedAvatarEntry;
            if (!speechEntry) return;

            try {
                if (sharedAudioCtx.state === 'suspended') {
                    await sharedAudioCtx.resume();
                }

                if (speechEntry.controller.type === 'talkinghead' && speechEntry.controller.speakAudio) {
                    window.speakingCount++;
                    window.isSomeoneSpeaking = window.speakingCount > 0;
                    speechEntry.controller.onSpeechStart?.();
                    try {
                        await speechEntry.controller.speakAudio(message.data, message.text || 'something');
                    } finally {
                        speechEntry.controller.onSpeechEnd?.();
                        window.speakingCount--;
                        window.isSomeoneSpeaking = window.speakingCount > 0;
                    }
                    return;
                }

                let audioBuffer = null;
                if (message.data && message.data.audio instanceof AudioBuffer) {
                    audioBuffer = message.data.audio;
                } else if (message.data instanceof ArrayBuffer || message.data?.buffer instanceof ArrayBuffer) {
                    const arrayBuffer = message.data instanceof ArrayBuffer ? message.data.slice(0) : message.data.buffer.slice(0);
                    audioBuffer = await sharedAudioCtx.decodeAudioData(arrayBuffer);
                }

                if (audioBuffer) {
                    window.avatarAudioQueue.push({ buffer: audioBuffer, entryKey: speechEntry.key });
                    if (!window.isAvatarAudioPlaying) {
                        playNextAvatarAudio();
                    }
                }
            } catch (error) {
                console.error(error);
            }
        };

        await headtts.connect(null, () => {});
        headtts.setup({
            voice: 'af_bella',
            language: 'en-us',
            speed: 1,
            audioEncoding: 'wav'
        });
    } catch (ttsError) {
        console.error('TTS loading failed:', ttsError);
    }

    if (nodeLoading) {
        nodeLoading.style.display = 'block';
        if (!window.renderSceneLoadingNotice?.('Waiting for input...')) {
            nodeLoading.textContent = 'Waiting for input...';
        }
    }

    document.addEventListener('visibilitychange', function() {
        avatarWorldRuntime?.getEntries?.().forEach((entry) => {
            if (document.visibilityState === 'visible') {
                entry.controller.start?.();
            } else {
                entry.controller.stop?.();
            }
        });
    });

    window.updateAvatarDialogueUi?.();
});
