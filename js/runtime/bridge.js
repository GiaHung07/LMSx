// Bridge: Communication channel giữa content script và page context
(function() {
    const TOKEN = window.__bridgeToken || 'default-token';
    const OB = window._O || (x => x);
    
    const EVENT_NAME = OB('__lms_bridge');
    const EVENT_RESPONSE = OB('__lms_bridge_response');
    
    window.edxBridge = {
        __bridgeToken: TOKEN,
        __bridgeEventName: EVENT_NAME,
        __obfEvent: OB,
        
        // Validate bridge event
        isValidBridgeEvent: (e) => {
            return e?.detail?._token === TOKEN;
        },
        
        // Create bridge detail object
        withBridgeDetail: (data) => ({
            ...data,
            _token: TOKEN,
            _ts: Date.now()
        }),
        
        // Dispatch bridge event
        __dispatchBridgeEvent: (target, type, init = {}) => {
            const detail = window.edxBridge.withBridgeDetail(init.detail || {});
            const event = new CustomEvent(type, {
                bubbles: true,
                cancelable: false,
                detail
            });
            target.dispatchEvent(event);
        },
        
        // Add bridge listener
        __addBridgeListener: (target, type, callback) => {
            const handler = (e) => {
                if (!window.edxBridge.isValidBridgeEvent(e)) return;
                callback(e);
            };
            target.addEventListener(type, handler);
            return handler;
        },
        
        // Remove bridge listener
        __removeBridgeListener: (target, type, handler) => {
            target.removeEventListener(type, handler);
        },
        
        // Make request ID
        makeBridgeRequestId: () => {
            return 'req-' + Math.random().toString(36).slice(2, 11) + '-' + Date.now();
        }
    };

    // Expose obfuscated helpers
    window.__obfClassToken = (token) => {
        if (!token?.startsWith('lms-')) return token;
        return OB(token.replace('lms-', ''));
    };
    
    window.__obfClassList = (classes) => {
        if (typeof classes !== 'string') return classes;
        return classes.split(/\s+/).map(window.__obfClassToken).join(' ');
    };
    
    window.__obfSelector = (selector) => {
        if (typeof selector !== 'string') return selector;
        return selector.replace(/\.lms-([a-zA-Z0-9_-]+)\b/g, (_, cls) => {
            return '.' + OB(cls);
        });
    };
})();
