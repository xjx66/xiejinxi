import { TalkingHead } from "talkinghead";
import { HeadTTS } from "headtts";
import * as THREE from "three";

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

const VOLCENGINE_API_KEY = "c0cb2129-ec07-46f8-9cf0-6c69a8f0a79a";
// 使用相对路径，在本地走 proxy-server.js 代理，在线上（如 Vercel 部署时）走 Serverless Function 代理
const PROXY_API_URL = "/api/proxy/api/coding/v3/chat/completions";

// -----------------------------------------------------------------------
// 动作解析与执行逻辑 (Global Scope)
// -----------------------------------------------------------------------
window.processActions = (text) => {
    console.log("🔍 Processing Actions for text:", text);
    let cleanText = text;
    
    // 确保 head 可用
    if (!head) {
        console.warn("⚠️ Head not initialized in processActions");
        return text;
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

async function callVolcengineAI(userMessage, nodeLoading) {
    conversationHistory.push({
        role: "user",
        content: userMessage
    });

    try {
        const response = await fetch(PROXY_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${VOLCENGINE_API_KEY}`
            },
            body: JSON.stringify({
                model: "ark-code-latest",
                messages: [
                    {
                        role: "system",
                        content: `You are a friendly AI assistant with a 3D avatar. 
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

Example: "[happy] Hello! [handup] Yay! [kiss] It's nice to meet you! [kneel] Please forgive me."`
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
        nodeLoading.textContent = "Loading Avatars...";

        const models = [
            { url: 'avaturn.glb', body: 'M', mood: 'neutral', preserve: false, name: 'Avaturn', status: '在职' },
            { url: 'avatarsdk.glb', body: 'M', mood: 'neutral', preserve: false, name: 'AvatarSDK', status: '已离职' },
            { url: 'brunette.glb', body: 'F', mood: 'neutral', preserve: false, name: 'Brunette', status: '在职' },
            { url: 'robot_dreams.glb', body: 'F', mood: 'robot', preserve: true, name: 'Robot', status: '在职' },
            { url: 'mpfb.glb', body: 'F', mood: 'neutral', preserve: false, name: 'MPFB', status: '已离职' }
        ];

        let heads = [];
        let activeIndex = 2; // 默认选中中间的 brunette 模型
        const itemSpacing = 250; // 平面平铺的水平间距

        const updateCarousel = () => {
            const items = turntable.querySelectorAll('.carousel-item');
            items.forEach((item, j) => {
                const offset = j - activeIndex;
                const tx = offset * itemSpacing;
                const scale = 1; // 所有人保持 1:1 的大小，不缩放，保持在同一条直线上
                const zIndex = offset === 0 ? 10 : 5 - Math.abs(offset);
                
                item.style.transform = `translateX(${tx}px) scale(${scale})`;
                item.style.zIndex = zIndex;
                
                if (offset === 0) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });
        };

        const switchModel = (newIndex) => {
            if (newIndex < 0) newIndex = models.length - 1;
            if (newIndex >= models.length) newIndex = 0;
            if (activeIndex === newIndex) return;

            activeIndex = newIndex;
            updateCarousel();

            head = heads[activeIndex];
            const m = models[activeIndex];
            window.robotState.currentModelUrl = m.url;
            
            heads.forEach((h, idx) => {
                h.opt.freeze = (idx !== activeIndex);
            });
            
            if (m.preserve && m.url.includes('robot_dreams.glb')) {
                robotState.isWaving = true;
                setTimeout(() => robotState.isWaving = false, 3000);
            }
        };

        let pointerDownX = 0;
        let pointerDownY = 0;
        let pointerDownTime = 0;

        // 记录鼠标按下的初始位置和时间
        turntable.addEventListener('pointerdown', (e) => {
            pointerDownX = e.clientX;
            pointerDownY = e.clientY;
            pointerDownTime = Date.now();
            // 注意：这里不拦截 pointerdown，让事件正常传递给底层的 Canvas，以便支持长按拖拽旋转
        }, true);

        // 在鼠标抬起时，判断是“单次点击”还是“拖拽旋转”
        turntable.addEventListener('pointerup', (e) => {
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
                // 根据点击位置的 X 坐标，判断是在屏幕的左半边还是右半边
                const rect = turntable.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const centerX = rect.width / 2;

                if (clickX < centerX) {
                    switchModel(activeIndex - 1); // 点左半屏，往左移
                } else {
                    switchModel(activeIndex + 1); // 点右半屏，往右移
                }
            }
            // 如果是拖拽（距离大）或长按（时间长），则什么也不做，让底层 Canvas 去处理旋转
        }, true);

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
            tag.innerHTML = `<span class="avatar-name">${m.name}</span><span class="avatar-status ${statusClass}">${m.status}</span>`;
            item.appendChild(tag);

            const h = new TalkingHead(item, {
                ttsEndpoint: "https://api.elevenlabs.io/v1/text-to-speech/", 
                lipsyncModules: ["en"],
                cameraView: "full",
                cameraY: 0.2,
                cameraDistance: 1.5,
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
                if (h !== head) return; // 只有当前激活的虚拟人才处理全局动画状态

                if (h.avatar && h.avatar.root && window.robotState.yOffset !== undefined) {
                    h.avatar.root.position.y = window.robotState.yOffset;
                    h.avatar.root.updateMatrixWorld(true);
                }

                if (h.avatar && h.avatar.preserveModelPose && h.armature) {
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
                        if (h.animations && h.animations.length > 1) {
                            if (h.mixer && !robotState.idleAction) {
                                const idleClip = h.animations[1];
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
            nodeLoading.style.display = 'block';
            nodeLoading.textContent = "Loading Avatars...";

            const loadPromises = models.map(async (m, i) => {
                const h = heads[i];
                let modelUrl = './avatars/' + m.url;

                await h.showAvatar({
                    url: modelUrl,
                    body: m.body,
                    avatarMood: m.mood,
                    lipsyncLang: 'en',
                    preserveModelPose: m.preserve
                });

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

                    if (m.url.includes('robot_dreams.glb') && i === activeIndex) {
                        robotState.isWaving = true;
                        setTimeout(() => robotState.isWaving = false, 3000);
                    }
                }
                
                // 将 AVATARSDK 和 AVATURN 模型向下移动 30 像素 (通过调整相机 Y 轴和目标)
                if (m.url.includes('avaturn.glb') || m.url.includes('avatarsdk.glb')) {
                    if (h.camera && h.cameraTarget) {
                        // 在 3D 中，要让模型向下移动，需要将摄像机向上移动
                        // 原本默认的 camera.position.y 是 0.2，向上移动约 0.05 对应屏幕上大约 30px
                        h.camera.position.y += 0.05; 
                        h.cameraTarget.y += 0.05;
                        h.camera.updateProjectionMatrix();
                    }
                }

                // 动态计算模型的 3D 边界框，将 Tag 放置在模型头顶 30 像素处
                const item = turntable.querySelector(`.carousel-item[data-index="${i}"]`);
                const tag = item.querySelector('.avatar-tag');
                if (tag && h.avatar && h.avatar.root && h.camera) {
                    // 确保矩阵更新，以获得正确的 3D 位置
                    h.avatar.root.updateMatrixWorld(true);
                    
                    let topPoint = new THREE.Vector3();
                    // 尝试获取头部骨骼
                    const headBone = h.avatar.root.getObjectByName('Head') || 
                                     h.avatar.root.getObjectByName('head') || 
                                     h.avatar.root.getObjectByName('mixamorigHead');
                                     
                    if (headBone) {
                        headBone.getWorldPosition(topPoint);
                        topPoint.y += 0.25; // 3D 空间中在头顶上方再加一点点偏移，以适应头发/帽子
                    } else {
                        // 降级方案：计算 3D Bounding Box
                        const box = new THREE.Box3().setFromObject(h.avatar.root);
                        const center = new THREE.Vector3();
                        box.getCenter(center);
                        topPoint.set(center.x, box.max.y, center.z);
                    }
                    
                    // 投影到摄像机的 2D 坐标系中（范围 [-1, 1]）
                    topPoint.project(h.camera);
                    
                    // 转换为容器内部的 CSS 像素坐标 (从顶部往下)
                    const clientHeight = item.clientHeight || 800;
                    const topPixel = (-(topPoint.y - 1) / 2) * clientHeight;
                    
                    // 限制在一个安全的范围，避免模型异常导致标签飞出屏幕
                    const safeTopPixel = Math.max(40, Math.min(topPixel, clientHeight - 100));
                    
                    // 固定在模型顶部再往上 30 像素
                    tag.style.top = `${safeTopPixel - 30}px`;
                }

                // 核心优化：加载完成后，如果不是当前激活的，限制更新频率而不是完全停止
                if (i !== activeIndex) {
                    // 延迟 1 秒冻结，确保 WebGL 完成了首帧的渲染和材质编译，否则模型会是不可见的
                    setTimeout(() => {
                        h.opt.freeze = true; // 冻结骨骼更新计算，但保持模型可见
                    }, 1000);
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
                try {
                    const text = nodeText.value;
                    if (text) {
                        console.log("🎤 HandleSpeak triggered with text:", text);
                        
                        nodeSpeak.disabled = true;
                        nodeText.disabled = true; // 禁用输入框
                        nodeText.style.opacity = '0.5'; // 变灰
                        nodeText.style.cursor = 'not-allowed';
                        // nodeSpeak.textContent = "思考中..."; // 按钮已隐藏，不需要更新文字
                        
                        const aiResponse = await callVolcengineAI(text, nodeLoading);
                        
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
                }
            };

            nodeSpeak.addEventListener('click', window.handleSpeak);

            nodeText.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    window.handleSpeak();
                }
            });
        }

        try {
            headtts = new HeadTTS({
                endpoints: ["webgpu", "wasm"],
                languages: ["en-us"],
                voices: ["af_bella", "af_sarah", "am_adam", "am_michael"],
                workerModule: "https://cdn.jsdelivr.net/npm/@met4citizen/headtts@1.2/modules/worker-tts.mjs",
                dictionaryURL: "https://cdn.jsdelivr.net/npm/@met4citizen/headtts@1.2/dictionaries/",
                audioCtx: head.audioCtx,
                trace: 0
            });

            // 简单的音频播放队列
            window.robotAudioQueue = [];
            window.isRobotPlaying = false;

            const playNextRobotAudio = (audioCtx) => {
                if (window.robotAudioQueue.length === 0) {
                    window.isRobotPlaying = false;
                    return;
                }

                window.isRobotPlaying = true;
                const buffer = window.robotAudioQueue.shift();

                const source = audioCtx.createBufferSource();
                source.buffer = buffer;
                source.connect(audioCtx.destination);
                window.currentRobotAudioSource = source;

                // console.log("🤖 Robot playing audio chunk...");
                
                // 触发旋转 (如果还没转)
                if (!window.robotState.isSpinning) {
                    window.robotState.isSpinning = true;
                    window.robotState.spinStartTime = Date.now();
                }

                source.onended = () => {
                    // console.log("🤖 Robot audio chunk ended");
                    window.currentRobotAudioSource = null;
                    // 播放下一段
                    playNextRobotAudio(audioCtx);
                };
                
                source.start(0);
            };

            headtts.onmessage = async (message) => {
                if (message.type === "audio") {
                    try {
                        // 🤖 Robot Isolation: 机器人专用处理逻辑
                        if (head.avatar && head.avatar.preserveModelPose) {
                            const messageData = message.data;
                            
                            // 定义 audioCtx
                            const audioCtx = head.audioCtx;
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
                        // speakAudio(audioBuffer, options, onEnd)
                        // options 里的 text 字段对于基于文本的口型同步是可选的，但对于基于音频分析的口型同步是必须的
                        head.speakAudio(message.data, { 
                            audio: message.data, 
                            // 传入文本有助于某些引擎做更精准的口型匹配，虽然 TalkingHead 主要靠音频分析
                            // 但如果 lipsyncModules 里配置了基于文本的模块，这个很有用
                            text: message.text || "something" 
                        });
                    } catch (error) {
                        console.error(error);
                    }
                } else if (message.type === "error") {
                    console.error("TTS Error:", message.data?.error || "Unknown error");
                }
            };

            nodeLoading.textContent = "Loading TTS...";
            await headtts.connect(null, (ev) => {
                if (ev) {
                    if (ev.lengthComputable) {
                        let val = Math.min(100, Math.round(ev.loaded / ev.total * 100));
                        nodeLoading.textContent = "Loading TTS " + val + "%";
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
