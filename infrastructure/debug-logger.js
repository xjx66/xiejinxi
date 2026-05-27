export const createDebugLogger = ({
    enabled = false,
    endpoint = 'http://127.0.0.1:7777/event',
    defaultSessionId = 'architecture-refactor'
} = {}) => {
    const isEnabled = () => {
        if (typeof enabled === 'function') return Boolean(enabled());
        return Boolean(enabled);
    };

    return {
        emit(event = {}) {
            if (!isEnabled()) return;
            const payload = {
                sessionId: event.sessionId || defaultSessionId,
                ts: Date.now(),
                ...event
            };
            fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).catch(() => {});
        }
    };
};
