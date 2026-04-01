(function() {
    'use strict';

    if (window.__lmsxPageInjected) return;
    window.__lmsxPageInjected = true;

    const bridgeToken = document.documentElement.dataset.lmsxBridgeToken || 'lmsx-token';
    const bridgeEvent = document.documentElement.dataset.lmsxBridgeEvent || '__lmsx_bridge';

    function dispatch(type, payload) {
        try {
            document.dispatchEvent(new CustomEvent(bridgeEvent, {
                bubbles: true,
                cancelable: false,
                detail: {
                    token: bridgeToken,
                    source: 'page',
                    timestamp: Date.now(),
                    requestId: `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    type,
                    payload,
                },
            }));
        } catch {}
    }

    function shouldCapture(url) {
        return typeof url === 'string' && /\/api\/|xblock|handler|problem_check|submit_quiz|answer/.test(url);
    }

    const OriginalXHR = window.XMLHttpRequest;
    window.XMLHttpRequest = class LMSXXHR extends OriginalXHR {
        open(method, url, ...args) {
            this.__lmsxUrl = typeof url === 'string' ? url : url?.toString?.() || '';
            this.__lmsxMethod = method;
            return super.open(method, url, ...args);
        }

        send(body) {
            this.__lmsxBody = body;
            const onDone = () => {
                if (!shouldCapture(this.__lmsxUrl)) return;
                dispatch('network:xhr', {
                    url: this.__lmsxUrl,
                    method: this.__lmsxMethod,
                    status: this.status,
                    response: this.responseText,
                    body: this.__lmsxBody,
                });
            };
            this.addEventListener('load', onDone, { once: true });
            this.addEventListener('error', onDone, { once: true });
            return super.send(body);
        }
    };

    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const [resource, options = {}] = args;
        const url = typeof resource === 'string' ? resource : resource?.url || resource?.toString?.() || '';
        const response = await originalFetch.apply(this, args);
        if (shouldCapture(url)) {
            try {
                const clone = response.clone();
                const text = await clone.text();
                dispatch('network:fetch', {
                    url,
                    method: options.method || 'GET',
                    status: response.status,
                    response: text,
                    body: options.body,
                });
            } catch {}
        }
        return response;
    };

    dispatch('bridge:ready', { href: location.href });
})();
