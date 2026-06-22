// 多会话存储：每个会话有独立的消息历史（上下文记忆），持久化到 localStorage。
// 消息只保留干净的 user/assistant 轮次（不含工具调用内部细节），作为下一轮的上下文喂给 agent。

const STORAGE_KEY = 'ai-conversations-v1';
const MAX_CONVERSATIONS = 30;
const MAX_MESSAGES_PER_CONV = 40; // 控制单会话上下文长度（约 20 轮）

const genId = () => `conv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const now = () => Date.now();

const deriveTitle = (text) => {
    const t = (text || '').trim().replace(/\s+/g, ' ');
    if (!t) return '新对话';
    return t.length > 18 ? `${t.slice(0, 18)}…` : t;
};

export const createConversationStore = ({ storage = (typeof localStorage !== 'undefined' ? localStorage : null) } = {}) => {
    const listeners = new Set();

    const load = () => {
        try {
            const raw = storage?.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && Array.isArray(parsed.conversations)) return parsed;
            }
        } catch (_) { /* 忽略损坏数据 */ }
        return null;
    };

    const persist = () => {
        try { storage?.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { /* 配额满等忽略 */ }
    };

    const emit = () => { const snap = getState(); listeners.forEach((fn) => fn(snap)); };

    const makeConversation = () => ({ id: genId(), title: '新对话', createdAt: now(), updatedAt: now(), messages: [] });

    let state = load() || { conversations: [], currentId: null };
    if (state.conversations.length === 0) {
        const c = makeConversation();
        state = { conversations: [c], currentId: c.id };
        persist();
    } else if (!state.conversations.find((c) => c.id === state.currentId)) {
        state.currentId = state.conversations[0].id;
    }

    function getState() {
        return {
            currentId: state.currentId,
            conversations: state.conversations.map((c) => ({ id: c.id, title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt, messageCount: c.messages.length }))
        };
    }

    const getCurrent = () => state.conversations.find((c) => c.id === state.currentId) || null;

    // 返回当前会话用于喂给模型的历史（干净的 user/assistant 轮次）
    const getHistory = () => (getCurrent()?.messages || []).map((m) => ({ role: m.role, content: m.content }));

    const newConversation = () => {
        // 若当前会话还是空的，直接复用，避免堆一堆空会话
        const cur = getCurrent();
        if (cur && cur.messages.length === 0) { emit(); return cur.id; }
        const c = makeConversation();
        state.conversations.unshift(c);
        if (state.conversations.length > MAX_CONVERSATIONS) state.conversations.length = MAX_CONVERSATIONS;
        state.currentId = c.id;
        persist();
        emit();
        return c.id;
    };

    const switchTo = (id) => {
        if (!state.conversations.find((c) => c.id === id)) return;
        state.currentId = id;
        persist();
        emit();
    };

    const deleteConversation = (id) => {
        state.conversations = state.conversations.filter((c) => c.id !== id);
        if (state.conversations.length === 0) {
            const c = makeConversation();
            state.conversations = [c];
            state.currentId = c.id;
        } else if (state.currentId === id) {
            state.currentId = state.conversations[0].id;
        }
        persist();
        emit();
    };

    // 追加一轮对话（用户 + 助手）到当前会话
    const addTurn = (userText, assistantText) => {
        const cur = getCurrent();
        if (!cur) return;
        cur.messages.push({ role: 'user', content: userText });
        cur.messages.push({ role: 'assistant', content: assistantText });
        if (cur.messages.length > MAX_MESSAGES_PER_CONV) {
            cur.messages.splice(0, cur.messages.length - MAX_MESSAGES_PER_CONV);
        }
        if (cur.title === '新对话') cur.title = deriveTitle(userText);
        cur.updatedAt = now();
        persist();
        emit();
    };

    const subscribe = (fn) => { listeners.add(fn); fn(getState()); return () => listeners.delete(fn); };

    return { getState, getCurrent, getHistory, newConversation, switchTo, deleteConversation, addTurn, subscribe };
};
