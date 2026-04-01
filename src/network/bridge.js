function getBridgeConfig() {
    const token = window.edxBridge?.__bridgeToken || Math.random().toString(36).slice(2);
    const eventName = window.edxBridge?.__bridgeEventName || '__lmsx_bridge';
    document.documentElement.dataset.lmsxBridgeToken = token;
    document.documentElement.dataset.lmsxBridgeEvent = eventName;
    return { token, eventName };
}

function validateBridgeMessage(detail) {
    const token = document.documentElement.dataset.lmsxBridgeToken;
    if (!detail || typeof detail !== 'object') return { ok: false, reason: 'empty-detail' };
    if (detail.token !== token) return { ok: false, reason: 'token-mismatch' };
    if (detail.source !== 'page') return { ok: false, reason: 'source-mismatch' };
    if (typeof detail.type !== 'string') return { ok: false, reason: 'missing-type' };
    if (typeof detail.requestId !== 'string') return { ok: false, reason: 'missing-request-id' };
    if (!Number.isFinite(detail.timestamp)) return { ok: false, reason: 'missing-timestamp' };
    return { ok: true };
}

function injectHooks() {
    const { eventName } = getBridgeConfig();
    const existing = document.getElementById('__lmsx_inject__');
    if (!existing) {
        try {
            const script = document.createElement('script');
            script.id = '__lmsx_inject__';
            script.src = chrome.runtime.getURL('inject.js');
            script.onload = () => script.remove();
            (document.head || document.documentElement).appendChild(script);
        } catch (error) {
            S.logger?.warn('bridge', 'inject:failed', error.message);
        }
    }

    const handler = event => {
        const validation = validateBridgeMessage(event.detail);
        if (!validation.ok) {
            S.logger?.warn('bridge', 'message:rejected', validation.reason, event.detail);
            return;
        }
        const detail = event.detail;
        S.runtime.bridge.ready = true;
        S.runtime.bridge.lastMessageAt = detail.timestamp;
        persistRuntimeSoon();

        if (detail.type === 'bridge:ready') {
            S.logger?.info('bridge', 'ready', 'Page bridge is ready');
            return;
        }

        if (detail.type === 'network:xhr' || detail.type === 'network:fetch') {
            handleQuizNetworkPayload(detail.payload);
        }
    };

    document.addEventListener(eventName, handler);
    addCleanup(() => document.removeEventListener(eventName, handler));
}
