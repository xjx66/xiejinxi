import { ACTION_TYPES, EDIT_ACTION_TYPES } from './action-protocol.js';

// 走 DeepSeek 代理：本地 proxy-server.js / 线上 /api/deepseek 注入 Authorization。
// DeepSeek 是 OpenAI 兼容接口，deepseek-chat = V3。
const DEFAULT_PROXY_URL = '/api/deepseek/chat/completions';
const DEFAULT_MODEL = 'deepseek-chat';

const SYSTEM_PROMPT = `你是一个 3D 世界编辑器的“动作规划器”。用户已经选中了世界里的一个对象，并用自然语言描述想怎么改它。
你的唯一任务：把用户意图翻译成一组**对该选中对象的编辑动作**，并只输出 JSON。

只允许这四种动作（其余一律不要输出）：

1) moveObject —— 移动
   payload: { "mode": "relative" | "absolute", "dx": number, "dy": number, "dz": number }
   - relative: dx/dy/dz 是相对当前位置的位移（世界单位）
   - absolute: 用 { "mode":"absolute", "x":number, "y":number, "z":number } 指定绝对坐标
   - 坐标系：+x 右、+y 上、+z 朝向镜头。一个“身位/一步”约等于 10~20 单位。

2) rotateObject —— 旋转
   payload: { "mode": "relative" | "absolute", "axis": "x" | "y" | "z", "degrees": number }
   - relative: 在当前角度上增量旋转 degrees 度
   - absolute: 把该轴角度直接设为 degrees 度
   - “转身/转向/旋转”一般指绕 y 轴。

3) scaleObject —— 缩放
   payload: { "factor": number }            // 统一缩放，1.2=放大20%，0.8=缩小20%
   或 payload: { "sx": number, "sy": number, "sz": number }  // 分轴缩放（绝对倍数）

4) editPresentation —— 改变呈现形态（仅对 image 类型对象有效）
   payload: { "patch": { "frameStyle": "frame" | "plain" } }
   - “加相框/装裱/做成画作/配个画框” → { "patch": { "frameStyle": "frame" } }
   - “去掉相框/裸图/不要框” → { "patch": { "frameStyle": "plain" } }
   - 若选中对象不是 image 类型，不要输出本动作。

输出格式（严格 JSON，不要代码块、不要多余文字）：
{ "actions": [ { "type": "...", "payload": { ... } } ], "reply": "一句话中文说明你做了什么" }

规则：
- 如果用户的意图无法用上述动作表达，返回 { "actions": [], "reply": "说明为什么做不了" }。
- 数值要合理；缩放 factor 限制在 0.1~10 之间。
- 可以一次返回多个动作（例如又移动又旋转）。`;

const stripCodeFence = (text) => {
    const trimmed = (text || '').trim();
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch) return fenceMatch[1].trim();
    return trimmed;
};

const extractJsonObject = (text) => {
    const cleaned = stripCodeFence(text);
    try {
        return JSON.parse(cleaned);
    } catch (_) {
        // 容错：截取第一个 { 到最后一个 } 之间的内容再试一次
        const start = cleaned.indexOf('{');
        const end = cleaned.lastIndexOf('}');
        if (start >= 0 && end > start) {
            return JSON.parse(cleaned.slice(start, end + 1));
        }
        throw new Error('无法从模型输出中解析出 JSON');
    }
};

const num = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// 把模型输出的原始 action 规整成执行器能直接吃的形状；非法的返回 null 被过滤掉。
const normalizeAction = (raw) => {
    if (!raw || typeof raw !== 'object') return null;
    const { type } = raw;
    if (!EDIT_ACTION_TYPES.includes(type)) return null;
    const p = raw.payload || {};

    if (type === ACTION_TYPES.MOVE_OBJECT) {
        if (p.mode === 'absolute') {
            return { type, payload: { mode: 'absolute', x: num(p.x), y: num(p.y), z: num(p.z) } };
        }
        return { type, payload: { mode: 'relative', dx: num(p.dx), dy: num(p.dy), dz: num(p.dz) } };
    }

    if (type === ACTION_TYPES.ROTATE_OBJECT) {
        const axis = ['x', 'y', 'z'].includes(p.axis) ? p.axis : 'y';
        return {
            type,
            payload: {
                mode: p.mode === 'absolute' ? 'absolute' : 'relative',
                axis,
                degrees: num(p.degrees)
            }
        };
    }

    if (type === ACTION_TYPES.SCALE_OBJECT) {
        if (p.sx != null || p.sy != null || p.sz != null) {
            return {
                type,
                payload: {
                    sx: clamp(num(p.sx, 1), 0.1, 10),
                    sy: clamp(num(p.sy, 1), 0.1, 10),
                    sz: clamp(num(p.sz, 1), 0.1, 10)
                }
            };
        }
        return { type, payload: { factor: clamp(num(p.factor, 1), 0.1, 10) } };
    }

    if (type === ACTION_TYPES.EDIT_PRESENTATION) {
        const patch = (raw.payload && raw.payload.patch) || {};
        const out = {};
        if (patch.frameStyle === 'frame' || patch.frameStyle === 'plain') {
            out.frameStyle = patch.frameStyle;
        }
        if (Object.keys(out).length === 0) return null; // 没有可识别的形态字段
        return { type, payload: { patch: out } };
    }

    return null;
};

export const createLlmEditPlanner = ({
    fetchImpl = (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null),
    proxyUrl = DEFAULT_PROXY_URL,
    model = DEFAULT_MODEL
} = {}) => {
    if (!fetchImpl) {
        throw new Error('createLlmEditPlanner: 当前环境没有可用的 fetch');
    }

    const callModel = async (messages) => {
        const response = await fetchImpl(proxyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                messages,
                max_tokens: 500,
                temperature: 0,
                // DeepSeek 支持强制 JSON 输出（prompt 中已含 "JSON" 字样，满足其要求）。
                response_format: { type: 'json_object' }
            })
        });
        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            throw new Error(`模型调用失败 ${response.status} ${errText.slice(0, 120)}`);
        }
        const data = await response.json();
        return data?.choices?.[0]?.message?.content || '';
    };

    const buildUserMessage = ({ prompt, context }) => {
        const sel = context?.selection || {};
        const wo = context?.selectedWorldObject || {};
        const lines = [
            '【选中对象当前状态】',
            `名称: ${sel.selectedObjectName || '(未命名)'}`,
            `类型: ${sel.selectedObjectType || wo.type || '(未知)'}`,
            `position: ${JSON.stringify(wo.position || null)}`,
            `rotation(弧度): ${JSON.stringify(wo.rotation || null)}`,
            `scale: ${JSON.stringify(wo.scale || null)}`,
            '',
            '【用户指令】',
            prompt || ''
        ];
        return lines.join('\n');
    };

    // plan: 调一次模型；解析失败重试一次（带纠正提示）。返回 { actions, reply }。
    const plan = async ({ prompt, context }) => {
        const messages = [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: buildUserMessage({ prompt, context }) }
        ];

        let lastError = null;
        for (let attempt = 0; attempt < 2; attempt += 1) {
            const content = await callModel(messages);
            try {
                const parsed = extractJsonObject(content);
                const rawActions = Array.isArray(parsed?.actions) ? parsed.actions : [];
                const actions = rawActions.map(normalizeAction).filter(Boolean);
                return { actions, reply: typeof parsed?.reply === 'string' ? parsed.reply : '' };
            } catch (error) {
                lastError = error;
                // 把模型上一轮的错误输出回灌，要求只返回 JSON。
                messages.push({ role: 'assistant', content });
                messages.push({
                    role: 'user',
                    content: '你的上一条输出无法被解析为 JSON。请只返回符合约定格式的 JSON，不要任何额外文字或代码块。'
                });
            }
        }
        throw lastError || new Error('模型未能返回可解析的编辑动作');
    };

    return { plan };
};
