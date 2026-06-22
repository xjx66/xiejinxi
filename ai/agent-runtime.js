// Agent 运行时：DeepSeek 工具调用循环。
// 给模型 目标 + 世界上下文 + 工具 schema → 模型决定调哪个工具 → 执行并回灌结果 → 循环，直到模型不再调工具或达步数上限。

const DEFAULT_PROXY_URL = '/api/deepseek/chat/completions';
const DEFAULT_MODEL = 'deepseek-chat';
const DEFAULT_MAX_STEPS = 8;

const SYSTEM_PROMPT = `你是一个 3D 世界编辑器里的 agent，通过调用工具来完成用户的操作请求。

工作方式：
- 先用 get_selected_object / list_objects 等了解当前状态，再动手。
- 优先用现成的工具（变换、加相框、裁剪图片等）。
- 如果没有现成工具能完成任务，就用 run_script 自己写一段 JS 代码（通过 ctx 操作世界）来实现。
- 完成后，用一句简短的中文总结你做了什么，并停止调用工具（即不要再返回 tool_calls）。
- 涉及“当前这个对象/这张图”时，objectId 用 null 表示当前选中对象。
- 若 worldContext.selection.selectedObjectIds 有多个（用户 Shift 多选了多个对象），且任务是批量的（如“把这几个排成一行/对齐/同时放大”），用 run_script + ctx.getSelectedObjects() 遍历它们逐个处理。
- 若 worldContext.targetPoint 非空，表示用户锁定了一个坐标、想在那里新建对象：用 ctx.createObject 创建（不要传 position，会自动放到该坐标并保持静止）。需要图片时先用 ctx.drawImage 程序化生成再 createObject。
- 生成 3D 对象：用 ctx.generate3DModel((THREE, group)=>{...}) 写 Three.js 几何体搭出造型（如桌子=面板+四条腿、树=圆柱+球），得到 assetId 后用 ctx.createObject({assetId, type:"model"}) 放入场景。几何体用 MeshStandardMaterial 才会被场景灯光照亮。模型尺寸会自动归一化，不必担心大小。
- 设定运动：用 set_motion 工具给选中对象设运动轨迹（航点数组），用户点面板"播放"对象就会沿轨迹移动。圆形/曲线等需要很多航点时，用 run_script 计算航点后调 ctx.setMotion。航点用世界坐标，可参考对象当前 position。设完告诉用户"点播放即可"。
- 绑骨模型的骨骼动作：有些 GLB 模型自带骨骼动作（如奔跑、挥手）。先用 list_animations 查看动作名（也可在 get_selected_object 的 animations 字段看到），再用 play_animation 播放。奔跑/行走/待机等连续动作设 loop:true；挥手/跳跃等一次性动作设 loop:false。骨骼动作（原地迈腿）与运动轨迹（位移）可同时使用，组合成"边跑边移动"。
- 为"只有骨架、没有现成动作"的模型现场创作动作：用 run_script。先 ctx.getRigInfo() 拿到骨骼名(bones)，从名字判断哪些是腿/臂/脊柱（如含 Leg/UpLeg/Arm/Spine/Hips 等），再 ctx.animateRig(null, (THREE, boneNames, helpers)=>{ return [ helpers.swing("左腿骨", {axis:"x",amplitudeDeg:35,period:1}), helpers.swing("右腿骨", {axis:"x",amplitudeDeg:35,period:1,phaseDeg:180}) /*左右反相*/ ]; }, {loop:true})。走/跑=左右腿与左右臂反相摆动；摆动轴通常用 "x"。骨骼名要严格用 getRigInfo 返回的原名。

坐标系：+x 右，+y 上，+z 朝向镜头。缩放 1.2=放大20%。
重要：所有对象都是世界里静止的。放置新对象只用 ctx.createObject（不传 position 会自动放到当前视野前方并保持静止）；绝不要把对象绑定到相机、也不要用 window/bgCamera/bgScene 等全局对象。`;

export const createAgentRuntime = ({
    fetchImpl = (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null),
    registry,
    proxyUrl = DEFAULT_PROXY_URL,
    model = DEFAULT_MODEL,
    maxSteps = DEFAULT_MAX_STEPS
}) => {
    if (!fetchImpl) throw new Error('createAgentRuntime: 没有可用的 fetch');
    if (!registry) throw new Error('createAgentRuntime: 缺少 tool registry');

    const callModel = async (messages, tools) => {
        const response = await fetchImpl(proxyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // max_tokens 要足够大：run_script 的 code 是一段 JS，参数 JSON 太短会被截断导致解析失败。
            body: JSON.stringify({ model, messages, tools, tool_choice: 'auto', temperature: 0, max_tokens: 4096 })
        });
        if (!response.ok) {
            const t = await response.text().catch(() => '');
            throw new Error(`模型调用失败 ${response.status} ${t.slice(0, 120)}`);
        }
        const data = await response.json();
        return data?.choices?.[0]?.message || {};
    };

    // run: 跑一次完整 agent 循环。
    //  history: 本会话之前的干净 user/assistant 轮次，提供跨轮上下文记忆。
    //  onStep({phase, name, args, result}) 用于把过程展示给用户。
    const run = async ({ goal, worldContext, history = [], onStep }) => {
        const tools = registry.toolSchemas();
        const messages = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...history, // 之前几轮的对话（记忆）
            {
                role: 'user',
                content: `【当前世界上下文】\n${JSON.stringify(worldContext || {}, null, 0)}\n\n【任务】\n${goal}`
            }
        ];

        for (let step = 0; step < maxSteps; step += 1) {
            const msg = await callModel(messages, tools);
            messages.push(msg);

            const toolCalls = msg.tool_calls || [];
            if (toolCalls.length === 0) {
                return { reply: msg.content || '完成', steps: step + 1 };
            }

            // 依次执行本轮的所有工具调用，把结果回灌
            for (const call of toolCalls) {
                const name = call.function?.name;
                const rawArgs = call.function?.arguments || '';
                let args = {};
                let parseFailed = false;
                try { args = rawArgs ? JSON.parse(rawArgs) : {}; } catch (_) { parseFailed = true; }

                onStep?.({ phase: 'call', name, args });
                // 参数非空却解析失败 = 多半被截断；给模型可操作的提示，而不是笼统报错让它原样重试。
                const result = (parseFailed && rawArgs.length > 0)
                    ? { error: '工具参数解析失败（很可能因过长被截断）。请把 run_script 的 code 写得更短、更紧凑，或拆成多次小的 run_script 调用。' }
                    : await registry.execute(name, args);
                onStep?.({ phase: 'result', name, args, result });
                messages.push({
                    role: 'tool',
                    tool_call_id: call.id,
                    content: JSON.stringify(result).slice(0, 4000)
                });
            }
        }
        return { reply: `已达到最大步数(${maxSteps})，可能未完全完成。`, steps: maxSteps };
    };

    return { run };
};
