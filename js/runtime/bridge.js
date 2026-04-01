(function() {
    const tokenSeed = window.__bridgeToken || Math.random().toString(36).slice(2);
    const eventName = '__lmsx_bridge';

    window.edxBridge = {
        __bridgeToken: tokenSeed,
        __bridgeEventName: eventName,
        makeBridgeRequestId() {
            return `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        },
        withBridgeDetail(type, payload = {}) {
            return {
                token: tokenSeed,
                source: 'page',
                timestamp: Date.now(),
                requestId: this.makeBridgeRequestId(),
                type,
                payload,
            };
        },
        isValidBridgeEvent(event) {
            return event?.detail?.token === tokenSeed && event?.detail?.source === 'page';
        },
    };
})();
