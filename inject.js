// inject.js: Hook XHR/Fetch trong page context để capture data
(function() {
    'use strict';
    
    // Skip if already injected
    if (window.__lmsInjected) return;
    window.__lmsInjected = true;
    
    const ORIGIN = location.origin;
    
    // Utility to dispatch bridge event
    const dispatchBridge = (type, detail) => {
        try {
            const event = new CustomEvent('__lms_inject_' + type, {
                bubbles: true,
                cancelable: false,
                detail: { ...detail, _ts: Date.now() }
            });
            document.dispatchEvent(event);
        } catch (e) {}
    };
    
    // Hook XHR
    const OriginalXHR = XMLHttpRequest;
    const hookedXHR = class extends OriginalXHR {
        constructor() {
            super();
            this._lmsUrl = null;
            this._lmsMethod = null;
            this._lmsBody = null;
        }
        
        open(method, url, ...args) {
            this._lmsUrl = url;
            this._lmsMethod = method;
            return super.open(method, url, ...args);
        }
        
        send(body) {
            this._lmsBody = body;
            
            const onLoad = () => {
                try {
                    if (this._lmsUrl?.includes('/api/') || 
                        this._lmsUrl?.includes('xblock') ||
                        this._lmsUrl?.includes('handler')) {
                        
                        dispatchBridge('xhr', {
                            url: this._lmsUrl,
                            method: this._lmsMethod,
                            status: this.status,
                            response: this.responseText,
                            body: this._lmsBody
                        });
                    }
                } catch (e) {}
            };
            
            this.addEventListener('load', onLoad);
            this.addEventListener('error', onLoad);
            
            return super.send(body);
        }
    };
    
    // Hook Fetch
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const [url, options = {}] = args;
        const urlStr = typeof url === 'string' ? url : url?.url || url?.toString();
        
        try {
            const response = await originalFetch.apply(this, args);
            
            if (urlStr?.includes('/api/') || 
                urlStr?.includes('xblock') ||
                urlStr?.includes('handler')) {
                
                const clone = response.clone();
                const text = await clone.text();
                
                dispatchBridge('fetch', {
                    url: urlStr,
                    method: options.method || 'GET',
                    status: response.status,
                    response: text,
                    body: options.body
                });
            }
            
            return response;
        } catch (error) {
            throw error;
        }
    };
    
    // Expose OriginalXHR for internal use
    window.__OriginalXHR = OriginalXHR;
    
    // Notify content script
    dispatchBridge('ready', { origin: ORIGIN });
})();
