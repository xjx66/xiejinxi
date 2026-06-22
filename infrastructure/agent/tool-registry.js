// 工具注册表：每个工具 = { name, description, parameters(JSON Schema), handler(async) }。
// 提供给 LLM 的是 OpenAI function-calling 格式的 schema；execute 负责按名分发并捕获错误。

export const createToolRegistry = () => {
    const tools = new Map();

    const register = ({ name, description, parameters, handler }) => {
        if (!name || typeof handler !== 'function') {
            throw new Error('register: 需要 name 与 handler');
        }
        tools.set(name, {
            name,
            description: description || '',
            parameters: parameters || { type: 'object', properties: {} },
            handler
        });
    };

    const toolSchemas = () => Array.from(tools.values()).map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters }
    }));

    const has = (name) => tools.has(name);

    const execute = async (name, args = {}) => {
        const tool = tools.get(name);
        if (!tool) return { error: `未知工具: ${name}` };
        try {
            const result = await tool.handler(args || {});
            return result === undefined ? { ok: true } : result;
        } catch (error) {
            return { error: error?.message || String(error) };
        }
    };

    return { register, toolSchemas, has, execute, get size() { return tools.size; } };
};
