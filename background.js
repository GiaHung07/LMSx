chrome.runtime.onInstalled.addListener(() => {
    console.log('[LMSx][background] installed');
});

const CryptoUtils = {
    async generateKey() {
        return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    },
    async encrypt(data, key) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(data);
        const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
        return { iv: Array.from(iv), data: Array.from(new Uint8Array(encrypted)) };
    },
    async decrypt(encryptedObj, key) {
        const iv = new Uint8Array(encryptedObj.iv);
        const data = new Uint8Array(encryptedObj.data);
        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
        return new TextDecoder().decode(decrypted);
    },
};

class EphemeralSessionVault {
    constructor() {
        this.key = null;
        this.data = new Map();
    }

    async ensureKey() {
        if (!this.key) this.key = await CryptoUtils.generateKey();
    }

    async set(name, value) {
        await this.ensureKey();
        const encrypted = await CryptoUtils.encrypt(JSON.stringify(value), this.key);
        this.data.set(name, encrypted);
    }

    async get(name) {
        const encrypted = this.data.get(name);
        if (!encrypted || !this.key) return null;
        try {
            return JSON.parse(await CryptoUtils.decrypt(encrypted, this.key));
        } catch {
            return null;
        }
    }

    clear() {
        this.data.clear();
        this.key = null;
    }
}

const sessionVault = new EphemeralSessionVault();

function localGet(key) {
    return new Promise(resolve => {
        chrome.storage.local.get(key, result => resolve(result || {}));
    });
}

function localSet(value) {
    return new Promise(resolve => {
        chrome.storage.local.set(value, () => resolve());
    });
}

function getDefaultConfig() {
    return {
        videoSpeed: 4,
        autoSubmitQuiz: true,
        autoNextLesson: true,
        pauseWhenHidden: false,
        maxQuizRetries: 3,
    };
}

function getDefaultStats() {
    return {
        videosCompleted: 0,
        quizzesDetected: 0,
        answersApplied: 0,
        answersVerified: 0,
        navigations: 0,
        errors: 0,
    };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    handleMessage(request).then(sendResponse).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
});

async function handleMessage(request) {
    switch (request?.action) {
        case 'vault:set':
            await sessionVault.set(request.key, request.data);
            return { ok: true, storage: 'ephemeral-session' };
        case 'vault:get':
            return { ok: true, storage: 'ephemeral-session', data: await sessionVault.get(request.key) };
        case 'vault:clear':
            sessionVault.clear();
            return { ok: true, storage: 'ephemeral-session' };
        case 'vault:info':
            return { ok: true, storage: 'ephemeral-session', note: 'Data is cleared when the service worker unloads.' };
        case 'getConfig':
            return { ok: true, config: (await localGet('config')).config || getDefaultConfig() };
        case 'saveConfig':
            await localSet({ config: request.config || getDefaultConfig() });
            return { ok: true };
        case 'getStats':
            return { ok: true, stats: (await localGet('stats')).stats || getDefaultStats() };
        case 'updateStats': {
            const existing = (await localGet('stats')).stats || getDefaultStats();
            const stats = { ...existing, ...(request.stats || {}) };
            await localSet({ stats });
            return { ok: true, stats };
        }
        default:
            return { ok: false, error: 'Unknown action' };
    }
}

chrome.runtime.onSuspend.addListener(() => {
    sessionVault.clear();
    console.log('[LMSx][background] session vault cleared on suspend');
});

chrome.webRequest?.onBeforeSendHeaders?.addListener(
    details => {
        const authHeader = details.requestHeaders?.find(header => header.name.toLowerCase() === 'authorization');
        if (authHeader && details.url.includes('lms.ptit.edu.vn')) sessionVault.set('authToken', authHeader.value);
    },
    { urls: ['https://lms.ptit.edu.vn/*'] },
    ['requestHeaders']
);

console.log('[LMSx][background] ready');
