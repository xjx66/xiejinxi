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
// 使用相对路径，避免 localhost/127.0.0.1 跨域或解析问题
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
    const nodeAvatar = document.getElementById('talkinghead-container');
    const nodeLoading = document.getElementById('talkinghead-loading');
    const nodeSpeak = document.getElementById('talkinghead-speak');
    const nodeText = document.getElementById('talkinghead-text');

    if (!nodeAvatar) return;

    // WebSocket connection for real-time updates
    const ws = new WebSocket('ws://localhost:3000');
    
    ws.onopen = () => {
        console.log('Connected to WebSocket server');
    };
    
    ws.onmessage = async (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'assistant_message' && data.text) {
                console.log('Received assistant message:', data.text);
                
                // Speak the received text
                if (headtts) {
                    // If speaking, interrupt or queue? For now, interrupt.
                    head.stopSpeaking(); 
                    
                    // 使用新的统一处理函数
                    const cleanText = processActions(data.text);

                    // 使用 head.speakText 替代 headtts.synthesize + head.speakAudio
                    // 因为 head.speakText 内部会自动处理 TTS 和口型同步
                    // 但这里我们用的是外部的 HeadTTS 库，所以需要手动绑定
                    
                    // 关键修复：确保 audioCtx 状态是 running
                    if (head.audioCtx.state === 'suspended') {
                        await head.audioCtx.resume();
                    }

                    // 调用 TTS 生成音频
                    headtts.synthesize({
                        input: cleanText
                    });
                }
            }
        } catch (e) {
            console.error('Error processing WebSocket message:', e);
        }
    };

    try {
        nodeLoading.textContent = "Loading...";

        head = new TalkingHead(nodeAvatar, {
            ttsEndpoint: "https://api.elevenlabs.io/v1/text-to-speech/", 
            lipsyncModules: ["en"], // 关键：开启口型同步模块
            cameraView: "full",
            cameraY: 0.2, // 提高相机位置，让人物看起来向上移动
            cameraDistance: 1.5, // 再次拉近镜头，配合大容器 // 大幅拉远镜头，扩大显示范围 // 稍微拉远一点
            lightAmbientIntensity: 3,
            lightDirectIntensity: 5,
            cameraRotateEnable: true,
            cameraZoomEnable: true,
            mixerGainSpeech: 3
        });

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

        // -----------------------------------------------------------------------
        // 自定义动作 (Custom Gestures/Emojis)
        // -----------------------------------------------------------------------
        // 1. 定义 [kiss] 动作
        // 使用内置的 handRight IK 动画轨道，这比手动调用 ikSolve 更安全
        head.animEmojis['kiss'] = {
            dt: [1000, 1000, 500], 
            vs: {
                // 面部表情
                mouthPucker: [0, 1, 0],      
                mouthFunnel: [0, 0.5, 0],    
                eyesClosed: [0, 1, 0],       
                headRotateX: [0, 0.1, 0],
                
                // IK 手部控制 (相对于 RightShoulder 的坐标)
                // 坐标单位：米
                // x: 左右 (负左正右)
                // y: 上下 (负下正上)
                // z: 前后 (负后正前)
                handRight: [
                    { x: -0.2, y: 0.1, z: 0.25 }, // 阶段1: 移到嘴边 (左移, 微上, 前伸)
                    { x: 0.2, y: 0.2, z: 0.5 },   // 阶段2: 挥出飞吻 (右移, 上抬, 远伸)
                    null                          // 阶段3: 放下 (null 会让 IK 停止，手回到自然下垂)
                ]
            }
        };

        // 确保清除旧的 gestureTemplates
        if(head.gestureTemplates['kiss']) delete head.gestureTemplates['kiss'];

        // 2. 定义 [kneel] 跪下姿势 (修正版)
        // 关键：同时在 gestureTemplates 中定义，这样 playGesture 也能调用
        // 这对于 TalkingHead 来说是一种双重保险
        head.gestureTemplates['kneel'] = {
             // 腿部动作：膝盖弯曲，大腿后折
             'LeftUpLeg.rotation': { x: 0, y: 0, z: 0 }, 
             'RightUpLeg.rotation': { x: 0.1, y: 0, z: 0 },
             'LeftLeg.rotation': { x: 1.6, y: 0, z: 0 }, 
             'RightLeg.rotation': { x: 1.6, y: 0, z: 0 },
             'LeftFoot.rotation': { x: 0.5, y: 0, z: 0 },
             'RightFoot.rotation': { x: 0.5, y: 0, z: 0 },

             // 身体下沉
             'Hips.position': { x: 0, y: 0.55, z: 0 },
             
             // 上身前倾低头
             'Spine.rotation': { x: 0.2, y: 0, z: 0 },
             'Head.rotation': { x: 0.3, y: 0, z: 0 }, 
             
             // 手部下垂
             'LeftArm.rotation': { x: 0, y: 0, z: -0.2 },
             'RightArm.rotation': { x: 0, y: 0, z: 0.2 },
             'LeftForeArm.rotation': { x: -0.5, y: 0, z: 0 },
             'RightForeArm.rotation': { x: -0.5, y: 0, z: 0 }
        };

        head.poseTemplates['kneel'] = {
            // 关键：将 standing 设为 true，防止 TalkingHead 内部的 IK 逻辑干预跪下的姿态
            // 我们通过 props 手动控制所有的骨骼和 Hips 高度
            standing: true, sitting: false, kneeling: false, lying: false,
            props: {
                // 1. 身体整体下沉 (通过 Hips 位置控制)
                // 正常 Hips 约在 0.8-1.0m，我们把它降到 0.45m，确保膝盖贴地
                'Hips.position': { x: 0, y: 0.45, z: 0 },
                
                // 2. 腿部动作：模拟跪地姿态
                // 大腿 (UpLeg): 垂直 (x=0)
                // 小腿 (Leg): 向后折叠 (x=1.8 约100度)
                // 脚 (Foot): 脚背贴地 (x=0.5)
                'LeftUpLeg.rotation': { x: 0, y: 0.1, z: 0 }, // 稍微外八一点
                'RightUpLeg.rotation': { x: 0, y: -0.1, z: 0 },
                
                'LeftLeg.rotation': { x: 1.8, y: 0, z: 0 }, 
                'RightLeg.rotation': { x: 1.8, y: 0, z: 0 },
                
                'LeftFoot.rotation': { x: 0.8, y: 0, z: 0 },
                'RightFoot.rotation': { x: 0.8, y: 0, z: 0 },

                // 3. 上半身：顺从姿态
                'Spine.rotation': { x: 0.3, y: 0, z: 0 }, // 前倾
                'Head.rotation': { x: 0.4, y: 0, z: 0 },  // 低头
                
                // 4. 手部：自然垂下放在身前
                'LeftArm.rotation': { x: -0.2, y: 0, z: -0.2 },
                'RightArm.rotation': { x: -0.2, y: 0, z: 0.2 },
                'LeftForeArm.rotation': { x: -0.5, y: 0, z: 0 },
                'RightForeArm.rotation': { x: -0.5, y: 0, z: 0 },
                
                // 5. 表情：恳求
                'viseme_O': 0.3, 
                'browInnerUp': 1.0, 
                'eyesLookDown': 0.8 
            }
        };

        // 加载 Avatar
        // 默认加载 brunette 模型
        // 修正路径：确保使用存在的 brunette.glb
        const defaultModel = './avatars/brunette.glb';
        
        await head.showAvatar({
            url: defaultModel,
            body: 'F',
            avatarMood: 'neutral',
            lipsyncLang: 'en'
        }, (ev) => {
            if (ev.lengthComputable) {
                let val = Math.min(100, Math.round(ev.loaded / ev.total * 100));
                nodeLoading.textContent = "Loading " + val + "%";
            }
        });

        const nodeModelToggle = document.getElementById('modelToggle');
        const nodeModal = document.getElementById('modelSettingsModal');
        const nodeCloseBtn = document.getElementById('closeModelModal');
        const nodeApplyBtn = document.getElementById('applyModelSettings');
        
        // 模态框逻辑
        if (nodeModelToggle && nodeModal) {
            // 打开模态框
            nodeModelToggle.addEventListener('click', () => {
                nodeModal.style.display = 'flex';
                // 强制重绘以触发 transition
                requestAnimationFrame(() => {
                    nodeModal.classList.add('show');
                });
            });

            // 关闭模态框函数
            const closeModal = () => {
                nodeModal.classList.remove('show');
                setTimeout(() => {
                    nodeModal.style.display = 'none';
                }, 300);
            };

            if (nodeCloseBtn) nodeCloseBtn.addEventListener('click', closeModal);
            
            // 点击遮罩层关闭
            nodeModal.addEventListener('click', (e) => {
                if (e.target === nodeModal) closeModal();
            });

            // 选项选择逻辑
            const modelCards = document.querySelectorAll('#modelOptions .option-card');
            const voiceCards = document.querySelectorAll('#voiceOptions .option-card');

            modelCards.forEach(card => {
                if (card.id === 'importModelBtn') return;
                card.addEventListener('click', () => {
                    document.querySelectorAll('#modelOptions .option-card').forEach(c => c.classList.remove('active'));
                    card.classList.add('active');
                });
            });

            voiceCards.forEach(card => {
                if (card.id === 'importVoiceBtn') return;
                card.addEventListener('click', () => {
                    document.querySelectorAll('#voiceOptions .option-card').forEach(c => c.classList.remove('active'));
                    card.classList.add('active');
                });
            });

            // Import Logic
            const importModelBtn = document.getElementById('importModelBtn');
            const importModelInput = document.getElementById('importModelInput');
            
            if (importModelBtn && importModelInput) {
                importModelBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    importModelInput.click();
                });

                importModelInput.addEventListener('change', (e) => {
                    if (e.target.files && e.target.files[0]) {
                        const file = e.target.files[0];
                        const url = URL.createObjectURL(file);
                        
                        // Create new card
                        const newCard = document.createElement('div');
                        newCard.className = 'option-card';
                        newCard.dataset.model = url;
                        newCard.dataset.body = 'F'; // Default to full body
                        newCard.innerHTML = `
                            <span class="option-icon">📂</span>
                            <span class="option-name" title="${file.name}">${file.name.substring(0, 8)}..</span>
                        `;
                        
                        // Add click listener
                        newCard.addEventListener('click', () => {
                            document.querySelectorAll('#modelOptions .option-card').forEach(c => c.classList.remove('active'));
                            newCard.classList.add('active');
                        });

                        // Insert before import button
                        importModelBtn.parentNode.insertBefore(newCard, importModelBtn);
                        
                        // Select it
                        newCard.click();
                    }
                });
            }

            const importVoiceBtn = document.getElementById('importVoiceBtn');
            const importVoiceInput = document.getElementById('importVoiceInput');

            if (importVoiceBtn && importVoiceInput) {
                importVoiceBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    importVoiceInput.click();
                });

                importVoiceInput.addEventListener('change', (e) => {
                    if (e.target.files && e.target.files[0]) {
                        const file = e.target.files[0];
                        const url = URL.createObjectURL(file);
                        
                        const newCard = document.createElement('div');
                        newCard.className = 'option-card';
                        newCard.dataset.voice = url;
                        newCard.innerHTML = `
                            <span class="option-icon">📂</span>
                            <span class="option-name" title="${file.name}">${file.name.substring(0, 8)}..</span>
                        `;
                        
                        newCard.addEventListener('click', () => {
                            document.querySelectorAll('#voiceOptions .option-card').forEach(c => c.classList.remove('active'));
                            newCard.classList.add('active');
                        });

                        importVoiceBtn.parentNode.insertBefore(newCard, importVoiceBtn);
                        newCard.click();
                    }
                });
            }

            // Create Model Logic
            const createModelBtn = document.getElementById('createModelBtn');
            const createModal = document.getElementById('createModelModal');
            const closeCreateModal = document.getElementById('closeCreateModal');
            const generateBtn = document.getElementById('generateModelBtn');
            const tabs = document.querySelectorAll('.tab');
            const tabContents = document.querySelectorAll('.tab-content');
            
            // Image Upload Logic in Create Modal
            const imageUploadArea = document.getElementById('imageUploadArea');
            const modelImageInput = document.getElementById('modelImageInput');
            const imagePreview = document.getElementById('imagePreview');
            const previewImg = imagePreview ? imagePreview.querySelector('img') : null;
            const removeImageBtn = document.getElementById('removeImageBtn');

            if (createModelBtn && createModal) {
                // Open Create Modal
                createModelBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    createModal.style.display = 'flex';
                    // 强制重绘以触发 transition
                    requestAnimationFrame(() => {
                        createModal.classList.add('show');
                    });
                    // Hide Settings Modal
                    if (nodeModal) {
                        nodeModal.classList.remove('show');
                        setTimeout(() => {
                            nodeModal.style.display = 'none';
                        }, 300);
                    }
                });

                // Close Create Modal
                if (closeCreateModal) {
                    closeCreateModal.addEventListener('click', () => {
                        createModal.classList.remove('show');
                        setTimeout(() => {
                            createModal.style.display = 'none';
                            // Re-open Settings Modal
                            if (nodeModal) {
                                nodeModal.style.display = 'flex';
                                requestAnimationFrame(() => {
                                    nodeModal.classList.add('show');
                                });
                            }
                        }, 300);
                    });
                }

                // Tab Switching
                tabs.forEach(tab => {
                    tab.addEventListener('click', () => {
                        tabs.forEach(t => t.classList.remove('active'));
                        tabContents.forEach(c => c.classList.remove('active'));
                        
                        tab.classList.add('active');
                        document.getElementById(`${tab.dataset.tab}-content`).classList.add('active');
                    });
                });

                // Image Upload Handling
                if (imageUploadArea && modelImageInput) {
                    imageUploadArea.addEventListener('click', () => modelImageInput.click());
                    
                    // Drag and Drop
                    imageUploadArea.addEventListener('dragover', (e) => {
                        e.preventDefault();
                        imageUploadArea.style.borderColor = 'white';
                    });
                    
                    imageUploadArea.addEventListener('dragleave', (e) => {
                        e.preventDefault();
                        imageUploadArea.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                    });

                    imageUploadArea.addEventListener('drop', (e) => {
                        e.preventDefault();
                        imageUploadArea.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                            handleImageFile(e.dataTransfer.files[0]);
                        }
                    });

                    modelImageInput.addEventListener('change', (e) => {
                        if (e.target.files && e.target.files[0]) {
                            handleImageFile(e.target.files[0]);
                        }
                    });
                }

                function handleImageFile(file) {
                    if (file && file.type.startsWith('image/')) {
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            previewImg.src = e.target.result;
                            imageUploadArea.style.display = 'none';
                            imagePreview.style.display = 'flex';
                        };
                        reader.readAsDataURL(file);
                    }
                }

                if (removeImageBtn) {
                    removeImageBtn.addEventListener('click', (e) => {
                        e.stopPropagation(); // Prevent triggering upload area click if nested
                        modelImageInput.value = '';
                        previewImg.src = '';
                        imagePreview.style.display = 'none';
                        imageUploadArea.style.display = 'flex';
                    });
                }

                // Generate Button Logic
                if (generateBtn) {
                    generateBtn.addEventListener('click', async () => {
                        const activeTab = document.querySelector('.tab.active').dataset.tab;
                        const statusDiv = document.querySelector('.creation-status');
                        const statusText = document.getElementById('creationStatusText');
                        
                        generateBtn.disabled = true;
                        statusDiv.style.display = 'flex';
                        
                        try {
                            let resultUrl = null;
                            let jobId = null;

                            // Helper function to poll status
                            const pollStatus = async (jobId) => {
                                const maxRetries = 60; // 5 minutes (5s * 60)
                                let retries = 0;
                                
                                return new Promise((resolve, reject) => {
                                    const check = async () => {
                                        if (retries >= maxRetries) {
                                            reject(new Error("Timeout waiting for generation"));
                                            return;
                                        }
                                        
                                        try {
                                            const res = await fetch(`/api/hunyuan/query?jobId=${jobId}`);
                                            const data = await res.json();
                                            
                                            if (data.JobStatus === 'SUCCESS') {
                                                // Assuming ResultUrl contains the GLB file URL
                                                resolve(data.ResultUrl || (data.ResultList && data.ResultList[0] && data.ResultList[0].ModelUrl));
                                            } else if (data.JobStatus === 'FAILED') {
                                                reject(new Error("Generation failed"));
                                            } else {
                                                statusText.textContent = `Generating... (${data.JobStatus || 'Processing'})`;
                                                retries++;
                                                setTimeout(check, 5000);
                                            }
                                        } catch (e) {
                                            console.error("Polling error:", e);
                                            // Continue polling even on temporary network errors
                                            retries++;
                                            setTimeout(check, 5000);
                                        }
                                    };
                                    check();
                                });
                            };

                            if (activeTab === 'text-to-model') {
                                const prompt = document.getElementById('modelPrompt').value;
                                if (!prompt) throw new Error("Please enter a description.");
                                
                                statusText.textContent = "Submitting task...";
                                console.log("Generating model from text:", prompt);

                                const response = await fetch('/api/hunyuan/text-to-3d', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ prompt: prompt })
                                });
                                
                                if (!response.ok) {
                                    const err = await response.json();
                                    throw new Error(err.error || "Failed to submit task");
                                }
                                
                                const data = await response.json();
                                jobId = data.JobId;

                            } else {
                                // Image to Model
                                const file = modelImageInput.files[0];
                                const currentSrc = previewImg.src;
                                
                                if (!file && !currentSrc) throw new Error("Please upload an image.");
                                
                                statusText.textContent = "Submitting task...";
                                console.log("Generating model from image...");
                                
                                // Get Base64
                                let base64 = currentSrc;
                                if (file) {
                                    base64 = await new Promise((resolve) => {
                                        const reader = new FileReader();
                                        reader.onload = (e) => resolve(e.target.result);
                                        reader.readAsDataURL(file);
                                    });
                                }
                                
                                // Remove header (data:image/png;base64,) if present, or keep it depending on API req
                                // Typically APIs expect just base64 string or full data URI.
                                // Let's try sending full data URI first, or just the content.
                                // Tencent Cloud usually expects standard Base64 string without header for image content,
                                // BUT for `ImageUrl` field it expects a URL.
                                // If we use a custom field or if the API supports base64 directly..
                                // For now, let's send what we have.
                                
                                const response = await fetch('/api/hunyuan/image-to-3d', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ imageBase64: base64 })
                                });

                                if (!response.ok) {
                                    const err = await response.json();
                                    throw new Error(err.error || "Failed to submit task");
                                }
                                
                                const data = await response.json();
                                jobId = data.JobId;
                            }

                            if (jobId) {
                                statusText.textContent = "Waiting for generation...";
                                resultUrl = await pollStatus(jobId);
                            }

                            // Success Handling
                            if (resultUrl) {
                                // Add to list
                                const newCard = document.createElement('div');
                                newCard.className = 'option-card';
                                newCard.dataset.model = resultUrl;
                                newCard.dataset.body = 'F';
                                newCard.innerHTML = `
                                    <span class="option-icon">✨</span>
                                    <span class="option-name" title="Generated">Generated</span>
                                `;
                                
                                newCard.addEventListener('click', () => {
                                    document.querySelectorAll('#modelOptions .option-card').forEach(c => c.classList.remove('active'));
                                    newCard.classList.add('active');
                                });

                                const importBtn = document.getElementById('importModelBtn');
                                importBtn.parentNode.insertBefore(newCard, importBtn);
                                
                                // Close modal and select
                                createModal.classList.remove('show');
                                setTimeout(() => {
                                    createModal.style.display = 'none';
                                    if (nodeModal) {
                                        nodeModal.style.display = 'flex';
                                        requestAnimationFrame(() => nodeModal.classList.add('show'));
                                    }
                                }, 300);
                                
                                newCard.click();
                            }

                        } catch (error) {
                            console.error("Generation failed:", error);
                            statusText.textContent = "Error: " + error.message;
                            setTimeout(() => {
                                statusDiv.style.display = 'none';
                            }, 3000);
                        } finally {
                            generateBtn.disabled = false;
                        }
                    });
                }
            }

            // 应用更改
            if (nodeApplyBtn) {
                nodeApplyBtn.addEventListener('click', async () => {
                    try {
                        const selectedModel = document.querySelector('#modelOptions .option-card.active');
                        const selectedVoice = document.querySelector('#voiceOptions .option-card.active');
                        
                        if (!selectedModel || !selectedVoice) return;

                        nodeApplyBtn.disabled = true;
                        nodeApplyBtn.textContent = 'Applying...';
                        
                        // 1. 加载新模型
                        let modelUrl = selectedModel.dataset.model;
                        if (!modelUrl.startsWith('blob:') && !modelUrl.startsWith('http')) {
                            modelUrl = './avatars/' + modelUrl;
                        }
                        const bodyType = selectedModel.dataset.body;
                        
                        console.log(`Switching to model: ${modelUrl}`);
                        nodeLoading.style.display = 'block';
                        nodeLoading.textContent = `Loading Avatar...`;

                        // 针对 Robot 模型的特殊配置
                        let mood = 'neutral';
                        const isSpecialModel = modelUrl.includes('robot_dreams.glb') || modelUrl.includes('elonmask_animations.glb');
                        let finalBodyType = bodyType;
                        
                        if (isSpecialModel) {
                            mood = 'robot';
                            isKneeling = false; // 确保不处于跪下状态
                            // 关键修复：TalkingHead 的 'M' 或 'F' bodyType 默认只渲染上半身 (Half-body)
                            // 传入 'full' 或直接不传 (或者设为空/false) 可以强制渲染全身
                            // 对于自带完整骨骼和 Mesh 的特殊模型，我们不需要引擎来帮我们“截肢”
                            finalBodyType = 'F'; // 'F' 通常代表 Full body，'M' 代表 Half/Mid body (视引擎版本而定，也可能是 Male/Female)
                            // 如果 'F' 也不行，我们可以尝试传入 null
                            if (modelUrl.includes('elonmask_animations.glb')) {
                                finalBodyType = null; // 彻底禁用引擎自带的 Body 裁剪逻辑
                            }
                        }

                        // 保存当前模型标识，方便后续区分是 Robot 还是 Elon
                        window.robotState.currentModelUrl = modelUrl;

                        await head.showAvatar({
                            url: modelUrl,
                            body: finalBodyType,
                            avatarMood: mood,
                            lipsyncLang: 'en',
                            preserveModelPose: isSpecialModel
                        }, (ev) => {
                            if (ev.lengthComputable) {
                                let val = Math.min(100, Math.round(ev.loaded / ev.total * 100));
                                nodeLoading.textContent = `Loading Avatar ${val}%`;
                            }
                        });

                        // Robot 加载后播放挥手动作
                        if (isSpecialModel) {
                            console.log("🤖 Special Model loaded, configuring for custom animations...");
                            head.opt.avatarIdleHeadMove = false; // 禁用闲置头部晃动
                            head.opt.avatarSpeakingHeadMove = false; // 禁用说话头部晃动
                            head.opt.avatarIgnoreCamera = true; // 禁用注视摄像头
                            head.opt.disableBalance = true; // 禁用平衡
                            head.opt.freeze = false; // 开启 update 循环，但禁用默认动画
                            
                            // 仅针对 Robot 触发初始挥手
                            if (modelUrl.includes('robot_dreams.glb')) {
                                console.log("👋 Triggering initial wave for Robot...");
                                robotState.isWaving = true;
                                
                                // 3秒后停止挥手
                                setTimeout(() => {
                                    robotState.isWaving = false;
                                }, 3000);
                            }
                        } else {
                            head.opt.avatarIdleHeadMove = true;
                            head.opt.avatarSpeakingHeadMove = true;
                            head.opt.avatarIgnoreCamera = false;
                            head.opt.disableBalance = false;
                            head.opt.freeze = false;
                        }

                        // 2. 切换音色
                        if (headtts) {
                            const voiceId = selectedVoice.dataset.voice;
                            console.log(`Switching voice to: ${voiceId}`);
                            nodeLoading.textContent = `Switching Voice...`;
                            
                            await headtts.setup({
                                voice: voiceId,
                                language: "en-us",
                                speed: 1
                            });
                        }

                        // 3. 再次强制应用 Robot 配置 (防止被音色切换重置)
                        if (isSpecialModel) {
                            console.log("🤖 Re-applying Special Model isolation settings...");
                            head.opt.avatarIdleHeadMove = false;
                            head.opt.avatarSpeakingHeadMove = false;
                            head.opt.avatarIgnoreCamera = true;
                            head.opt.disableBalance = true;
                            // 确保 preserveModelPose 仍然为 true (虽然它是 avatar 属性，通常不会变)
                            if (head.avatar) head.avatar.preserveModelPose = true;

                            // 调整 Elon 模型的垂直位置 (CSS 终极物理外挂方案)
                            if (modelUrl.includes('elonmask_animations.glb')) {
                                setTimeout(() => {
                                    // 强制显示所有被引擎隐藏的 Mesh
                                    if (head.avatar && head.avatar.root) {
                                        head.avatar.root.traverse((node) => {
                                            if (node.isMesh && !node.visible) {
                                                node.visible = true;
                                                console.log("🚀 Forced hidden mesh to be visible:", node.name);
                                            }
                                            // 有些引擎会通过材质透明度来隐藏
                                            if (node.material && node.material.opacity === 0) {
                                                node.material.opacity = 1;
                                                node.material.transparent = false;
                                                console.log("🚀 Fixed transparent material on:", node.name);
                                            }
                                        });
                                    }

                                    // 撤销 CSS 物理外挂：恢复 Canvas 原始位置
                                    const container = document.getElementById('talkinghead-container');
                                    if (container) {
                                        container.style.transform = 'none';
                                        console.log("🚀 Removed CSS translation hack.");
                                    }
                                    
                                    // 既然模型全身已经露出来了，我们完全依靠相机来构图
                                    if (head.camera && head.cameraTarget) {
                                        // 缩小模型：直接缩放根节点
                                        if (head.avatar && head.avatar.root) {
                                            head.avatar.root.scale.set(0.35, 0.35, 0.35); // 大幅缩小到 35%
                                        }

                                        // 相机参数也稍微配合一下
                                        head.camera.position.y = 0.5; // 相机继续降，配合更小的模型
                                        head.camera.position.z = 1.5; // 相机拉近
                                        
                                        // 聚焦点稍微往上提一点，让他居中
                                        head.cameraTarget.y = 0.3; 
                                        
                                        head.camera.fov = 45; // 恢复默认视野
                                        head.camera.updateProjectionMatrix();
                                    }
                                }, 500);
                            } else {
                                // 切换回其他模型时，恢复 CSS
                                const container = document.getElementById('talkinghead-container');
                                if (container) {
                                    container.style.transform = 'none';
                                }
                            }
                        }

                        nodeLoading.style.display = 'none';
                        closeModal();
                        
                    } catch (error) {
                        console.error("Settings apply failed:", error);
                        nodeLoading.textContent = "Error: " + error.message;
                    } finally {
                        nodeApplyBtn.disabled = false;
                        nodeApplyBtn.textContent = 'Apply Changes';
                    }
                });
            }
        }

        // 3. 配置每帧的强制更新逻辑 (Force Update Logic)
        // 这是最强力的控制手段，可以绕过 poseTemplates 的限制
        // 我们在每帧渲染前，手动强制修改骨骼位置和旋转
        
        // 缓存骨骼对象 (需要等模型加载完后初始化)
        let bones = {};
        
        // 目标旋转值 (Target Rotations)
        const kneelTarget = {
            Hips: { y: 0.55 }, // 降低高度
            LeftUpLeg: { x: 0, y: 0.1, z: 0 }, 
            RightUpLeg: { x: 0, y: -0.1, z: 0 },
            LeftLeg: { x: 1.8, y: 0, z: 0 }, // 小腿后折
            RightLeg: { x: 1.8, y: 0, z: 0 },
            Spine: { x: 0.3, y: 0, z: 0 }, // 身体前倾
            Head: { x: 0.3, y: 0, z: 0 } // 低头
        };

        // 设置每帧回调
        head.opt.update = (dt) => {
            // 调试日志：每 100 帧打印一次，避免刷屏
            if (!window.frameCnt) window.frameCnt = 0;
            window.frameCnt++;
            
            // 🤖 强制调整特殊模型位置
            if (head.avatar && head.avatar.root && window.robotState.yOffset !== undefined) {
                // 持续覆盖高度，防止被引擎内部重置
                head.avatar.root.position.y = window.robotState.yOffset;
                // 强制更新矩阵
                head.avatar.root.updateMatrixWorld(true);
            }

            // 🤖 Robot Custom Animation
            if (head.avatar && head.avatar.preserveModelPose && head.armature) {
                const now = Date.now();
                
                // 🕺 0. 播放自带的动画 (如跳舞)
                if (robotState.isDancing && head.animations && head.animations.length > 0) {
                    if (head.mixer) {
                        // 如果还没有播放，就触发
                        if (!robotState.danceAction) {
                            console.log("🕺 Starting built-in animation...");
                            const clip = head.animations[0]; // 假设第一个动画就是我们想要的 (Armature)
                            const action = head.mixer.clipAction(clip, head.armature);
                            action.play();
                            action.setEffectiveWeight(1);
                            robotState.danceAction = action;
                        }
                    }
                    // 跳舞时，跳过我们自定义的闲置动画和特技，让自带动画完全接管
                    return; 
                } else if (robotState.danceAction) {
                    // 停止跳舞
                    console.log("🕺 Stopping built-in animation...");
                    robotState.danceAction.stop();
                    robotState.danceAction = null;
                }
                
                // 1. 闲置状态：左右轻微转头 (Sine wave)
                // 周期约 4 秒，幅度极小
                const headBone = head.armature.getObjectByName('Head');

                if (headBone) {
                    // 初始化缓存：只记录一次初始旋转
                    if (!headBone.userData.initialQuaternion) {
                        headBone.userData.initialQuaternion = headBone.quaternion.clone();
                        console.log("🤖 Robot Head bone found:", headBone);
                        console.log("🤖 Robot Head parent:", headBone.parent);
                        console.log("🤖 Robot Head initial rotation captured:", headBone.rotation);
                        
                        // 强制停止 AnimationMixer (如果有)
                        if (head.mixer) {
                            console.log("🤖 Stopping AnimationMixer for Robot...");
                            head.mixer.stopAllAction();
                        }
                    }

                    const idleAngle = Math.sin(now / 2000) * 0.1; // +/- 0.1 radians
                    
                    // 基于初始旋转进行叠加，而不是覆盖
                    const qDelta = new THREE.Quaternion();
                    qDelta.setFromAxisAngle(new THREE.Vector3(0, 1, 0), idleAngle); // 绕 Y 轴旋转
                    
                    headBone.quaternion.copy(headBone.userData.initialQuaternion).multiply(qDelta);
                }
                
                // 4. 头部旋转特技 (Speaking Spin) - 仅限 Robot 模型
                if (robotState.isSpinning && window.robotState.currentModelUrl && window.robotState.currentModelUrl.includes('robot_dreams.glb')) {
                    const headBone = head.armature.getObjectByName('Head');
                    if (headBone && headBone.userData.initialQuaternion) {
                        const spinDuration = 1500; // 1.5秒转完720度
                        const progress = (now - robotState.spinStartTime) / spinDuration;
                        
                        if (progress >= 1) {
                            robotState.isSpinning = false; // 结束旋转
                        } else {
                            // 720度 = 4 * PI
                            const spinAngle = progress * 4 * Math.PI; 
                            
                            // 叠加旋转 (绕 Y 轴)
                            const qSpin = new THREE.Quaternion();
                            qSpin.setFromAxisAngle(new THREE.Vector3(0, 1, 0), spinAngle);
                            
                            // 这里的逻辑是：先取初始姿态，叠加闲置摇头(如果有)，再叠加特技旋转
                            // 为了简化，我们直接在当前(包含闲置摇头)的 quaternion 上叠加
                            // 或者更严谨点：基于 initialQuaternion 重新计算所有叠加
                            // 让我们采用叠加策略：
                            // 1. 基础 = initialQuaternion
                            // 2. 闲置 = idleAngle (上面已经应用了)
                            // 3. 特技 = spinAngle
                            // 上面的代码已经设置了 headBone.quaternion = initial * idle
                            // 所以我们只需要再 multiply(qSpin) 即可
                            
                            headBone.quaternion.multiply(qSpin);
                        }
                    }
                }

                // 🔍 调试：检查 Hips 是否在动
                const hips = head.armature.getObjectByName('Hips');
                if (hips && window.frameCnt % 100 === 0) {
                    // console.log("🤖 Robot Hips Rotation:", hips.rotation);
                }
                
                // ⚠️ 已移除所有强制骨骼锁定 (Hips, Spine, Neck, Shoulder)
                // 因为 preserveModelPose + updatePoseBase 跳过逻辑已经确保了骨骼维持在初始姿态
                // 强制设为 0 反而会导致模型扭曲 (如果初始姿态不是 0)
                
                // 2. 挥手动作 (基于 Quaternion 增量)
                if (robotState.isWaving) {
                    const rightArm = head.armature.getObjectByName('RightArm');
                    const rightForeArm = head.armature.getObjectByName('RightForeArm');
                    
                    if (rightArm && rightForeArm) {
                        // 初始化缓存
                        if (!rightArm.userData.initialQuaternion) {
                            rightArm.userData.initialQuaternion = rightArm.quaternion.clone();
                        }
                        if (!rightForeArm.userData.initialQuaternion) {
                            rightForeArm.userData.initialQuaternion = rightForeArm.quaternion.clone();
                        }

                        // 计算动画进度 (0~1)
                        // 简单起见，我们假设一直挥手，不计算 fade in/out
                        // 如果要平滑，可以用 lerp
                        
                        // 抬起大臂 (绕 X 轴旋转，如果是往后了，可能是 Z 轴反了，或者需要绕 X 轴)
                        // 试错调整：
                        // 如果之前绕 Z 轴 (0,0,1) 往后了，那可能需要绕 X 轴 (1,0,0) 或者负 Z
                        // 对于 Mixamo T-Pose:
                        // X轴: 抬起/放下
                        // Y轴: 前后摆动
                        // Z轴: 扭转
                        // 但不同软件导出轴向不同。
                        
                        // 修正方案：尝试绕 X 轴旋转 (通常是抬起)
                        // 如果之前是 Z 轴 2.5 rad 导致往后，那可能是扭转过头了或者轴错了。
                        // 让我们尝试改为 X 轴旋转 -2.0 (负值通常是向上抬，取决于右手坐标系)
                        const liftAngle = -2.5; 
                        const qLift = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), liftAngle);
                        
                        // 我们希望平滑抬起，所以使用 slerp
                        // 但这里每帧都运行，我们需要一个 target quaternion
                        const qTargetArm = rightArm.userData.initialQuaternion.clone().multiply(qLift);
                        rightArm.quaternion.slerp(qTargetArm, 0.1); // 0.1 是平滑系数

                        // 挥动小臂 (绕 Z 轴摆动，或者 Y 轴)
                        const waveSpeed = 8;
                        const waveAngle = Math.sin(now / 1000 * waveSpeed) * 0.5 + 0.5; // 0.5 bias
                        const qWave = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), waveAngle);
                        
                        // 小臂也是相对于初始姿态
                        // 但小臂的初始姿态可能是弯曲的或直的
                        const qTargetForeArm = rightForeArm.userData.initialQuaternion.clone().multiply(qWave);
                        rightForeArm.quaternion.slerp(qTargetForeArm, 0.2);
                    }
                } else if (robotState.isRaisingHands) {
                    // 3. 双手举起动作 (新增)
                    // 模糊搜索骨骼，防止名称不匹配
                    const leftArm = head.armature.getObjectByName('LeftArm') || findBone(head.armature, 'Arm', 'L');
                    const rightArm = head.armature.getObjectByName('RightArm') || findBone(head.armature, 'Arm', 'R');
                    const leftForeArm = head.armature.getObjectByName('LeftForeArm') || findBone(head.armature, 'ForeArm', 'L');
                    const rightForeArm = head.armature.getObjectByName('RightForeArm') || findBone(head.armature, 'ForeArm', 'R');
                    
                    if (leftArm && rightArm && leftForeArm && rightForeArm) {
                        // 初始化缓存 (如果还没初始化)
                        if (!leftArm.userData.initialQuaternion) leftArm.userData.initialQuaternion = leftArm.quaternion.clone();
                        if (!rightArm.userData.initialQuaternion) rightArm.userData.initialQuaternion = rightArm.quaternion.clone();
                        if (!leftForeArm.userData.initialQuaternion) leftForeArm.userData.initialQuaternion = leftForeArm.quaternion.clone();
                        if (!rightForeArm.userData.initialQuaternion) rightForeArm.userData.initialQuaternion = rightForeArm.quaternion.clone();

                        // 抬起角度 (X轴负向，或者 Y 轴负向，取决于镜像)
                        // 右手是 X -2.5 (抬起)
                        // 左手通常是对称的。如果 X 轴朝向相同，也是 -2.5。如果 X 轴镜像，则是 +2.5。
                        // Mixamo 骨骼通常 LeftArm 和 RightArm 的 X 轴都是指向手腕方向? 不，通常是指向外侧?
                        // 让我们先尝试对称的 -2.5。如果不对，可能是 +2.5
                        const liftAngle = -2.5; 
                        
                        // 右手
                        const qLiftRight = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), liftAngle);
                        const qTargetRight = rightArm.userData.initialQuaternion.clone().multiply(qLiftRight);
                        rightArm.quaternion.slerp(qTargetRight, 0.2); // 0.1 -> 0.2

                        // 左手 (尝试相同的 -2.5)
                        const qLiftLeft = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), liftAngle);
                        const qTargetLeft = leftArm.userData.initialQuaternion.clone().multiply(qLiftLeft);
                        leftArm.quaternion.slerp(qTargetLeft, 0.2); // 0.1 -> 0.2

                        // 小臂稍微弯曲一点，显得自然
                        const bendAngle = 0.5; // 弯曲
                        // 右小臂 Z 轴 (内弯?)
                        const qBendRight = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), bendAngle); 
                        const qTargetForeRight = rightForeArm.userData.initialQuaternion.clone().multiply(qBendRight);
                        rightForeArm.quaternion.slerp(qTargetForeRight, 0.2); // 0.1 -> 0.2

                        // 左小臂 Z 轴 (如果是镜像，可能是 -0.5)
                        const qBendLeft = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -bendAngle);
                        const qTargetForeLeft = leftForeArm.userData.initialQuaternion.clone().multiply(qBendLeft);
                        leftForeArm.quaternion.slerp(qTargetForeLeft, 0.2); // 0.1 -> 0.2
                    } else {
                        console.warn("🤖 Missing arm bones for raise hands animation!");
                    }
                } else {
                    // 如果既不挥手也不举手，恢复左手 (右手已经在上面处理了，这里补充左手恢复逻辑)
                    // 注意：上面的 else 块只处理了右手。我们需要合并恢复逻辑。
                    
                    // 恢复右手 (复用上面的逻辑，但为了清晰，可以在这里统一处理所有肢体的恢复)
                    const rightArm = head.armature.getObjectByName('RightArm');
                    const rightForeArm = head.armature.getObjectByName('RightForeArm');
                    if (rightArm && rightArm.userData.initialQuaternion) rightArm.quaternion.slerp(rightArm.userData.initialQuaternion, 0.1);
                    if (rightForeArm && rightForeArm.userData.initialQuaternion) rightForeArm.quaternion.slerp(rightForeArm.userData.initialQuaternion, 0.1);

                    // 恢复左手
                    const leftArm = head.armature.getObjectByName('LeftArm');
                    const leftForeArm = head.armature.getObjectByName('LeftForeArm');
                    if (leftArm && leftArm.userData.initialQuaternion) leftArm.quaternion.slerp(leftArm.userData.initialQuaternion, 0.1);
                    if (leftForeArm && leftForeArm.userData.initialQuaternion) leftForeArm.quaternion.slerp(leftForeArm.userData.initialQuaternion, 0.1);
                }
            }
            
            if (isKneeling) {
                if (window.frameCnt % 100 === 0) console.log("Kneeling update active...");

                // 确保骨骼已加载
                if (!head.armature) return;

                // 获取骨骼
                const hips = head.armature.getObjectByName('Hips');
                const leftLeg = head.armature.getObjectByName('LeftLeg');
                const rightLeg = head.armature.getObjectByName('RightLeg');
                const leftUpLeg = head.armature.getObjectByName('LeftUpLeg');
                const rightUpLeg = head.armature.getObjectByName('RightUpLeg');

                if (hips) {
                    // 1. 强制按低 Hips (降低高度)
                    // 使用 lerp 渐变防止瞬间跳变
                    hips.position.y = hips.position.y * 0.9 + 0.55 * 0.1; 
                    
                    // 2. 强制弯曲膝盖 (修正方向)
                    // 之前 1.8 可能是正向旋转，导致膝盖反关节
                    // 我们尝试负值 -1.8，看看是否向后弯曲
                    if (leftLeg) leftLeg.rotation.x = -2.0;
                    if (rightLeg) rightLeg.rotation.x = -2.0;

                    // 3. 调整大腿角度
                    if (leftUpLeg) leftUpLeg.rotation.x = 0;
                    if (rightUpLeg) rightUpLeg.rotation.x = 0;
                }
            }
        };

        // 2. 可以在此继续添加其他自定义动作...
        // head.animEmojis['wink'] = { ... };

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
