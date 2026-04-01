function createLogger() {
    const maxEntries = 80;

    function push(level, module, event, detail = '', payload) {
        const verboseLogs = S.settings?.featureFlags?.verboseLogs === true;
        const allowLevel = level === 'warn' || level === 'error' || verboseLogs;
        if (!allowLevel) return null;

        const entry = {
            id: `${level}-${module}-${nowTs()}-${Math.random().toString(36).slice(2, 7)}`,
            timestamp: nowTs(),
            level,
            module,
            event,
            detail: typeof detail === 'string' ? detail : '',
            payload: payload === undefined ? null : payload,
        };

        if (S.runtime) {
            S.runtime.logs = Array.isArray(S.runtime.logs) ? S.runtime.logs : [];
            S.runtime.logs.push(entry);
            S.runtime.logs = S.runtime.logs.slice(-maxEntries);
        }

        const prefix = `[LMSX][${module}] ${event}`;
        const message = entry.detail ? `${prefix} ${entry.detail}` : prefix;
        const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : level === 'debug' ? console.debug : console.log;
        if (payload !== undefined) sink(message, payload);
        else sink(message);

        S.ui?.pushLog?.(entry);
        return entry;
    }

    return {
        debug(module, event, detail = '', payload) { return push('debug', module, event, detail, payload); },
        info(module, event, detail = '', payload) { return push('info', module, event, detail, payload); },
        warn(module, event, detail = '', payload) { return push('warn', module, event, detail, payload); },
        error(module, event, detail = '', payload) { return push('error', module, event, detail, payload); },
    };
}
