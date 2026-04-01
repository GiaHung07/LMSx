// Obfuscation: Hash ngẫu nhiên mỗi session cho class/event name
(function() {
    const SEED = Math.floor(Math.random() * 0x100000000).toString(36);
    const COUNTER = { value: 0 };
    
    const rotl = (x, n) => (x << n) | (x >>> (32 - n));
    const cyrb53 = (str) => {
        let h1 = 0xdeadbeef ^ SEED, h2 = 0x41c6ce57 ^ SEED;
        for (let i = 0; i < str.length; i++) {
            const ch = str.charCodeAt(i);
            h1 = Math.imul(h1 ^ ch, 2654435761);
            h2 = Math.imul(h2 ^ ch, 1597334677);
        }
        h1 = Math.imul(rotl(h1, 27) ^ h2, 2147483647);
        h2 = Math.imul(rotl(h2, 31) ^ h1, 2277739673);
        h1 ^= h2 >>> 0;
        h2 ^= h1 >>> 0;
        return (h1 >>> 0).toString(36).slice(0, 8) + (h2 >>> 0).toString(36).slice(0, 8);
    };

    const CACHE = {};

    const _O = (token) => {
        if (!token || typeof token !== 'string') return token;
        if (CACHE[token]) return CACHE[token];
        COUNTER.value++;
        CACHE[token] = 'css-' + cyrb53(token + SEED + COUNTER.value);
        return CACHE[token];
    };

    // Expose globally
    window._O = _O;
    window.__SEED = SEED;
    
    // Generate bridge token
    window.__bridgeToken = (() => {
        const arr = new Uint8Array(16);
        crypto.getRandomValues(arr);
        return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
    })();
})();
