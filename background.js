// background.js: Service worker với AES-GCM encryption
chrome.runtime.onInstalled.addListener(() => {
    console.log('[LMS] Extension installed');
});

// AES-GCM Encryption utilities
const CryptoUtils = {
    async generateKey() {
        return await crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
        );
    },
    
    async exportKey(key) {
        const exported = await crypto.subtle.exportKey('raw', key);
        return Array.from(new Uint8Array(exported));
    },
    
    async encrypt(data, key) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(data);
        
        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            encoded
        );
        
        return {
            iv: Array.from(iv),
            data: Array.from(new Uint8Array(encrypted))
        };
    },
    
    async decrypt(encryptedObj, key) {
        const iv = new Uint8Array(encryptedObj.iv);
        const data = new Uint8Array(encryptedObj.data);
        
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            data
        );
        
        return new TextDecoder().decode(decrypted);
    }
};

// Secure session storage
class SecureSessionStorage {
    constructor() {
        this.key = null;
        this.data = new Map();
    }
    
    async init() {
        this.key = await CryptoUtils.generateKey();
    }
    
    async set(key, value) {
        if (!this.key) await this.init();
        const encrypted = await CryptoUtils.encrypt(JSON.stringify(value), this.key);
        this.data.set(key, encrypted);
    }
    
    async get(key) {
        const encrypted = this.data.get(key);
        if (!encrypted) return null;
        if (!this.key) return null;
        
        try {
            const decrypted = await CryptoUtils.decrypt(encrypted, this.key);
            return JSON.parse(decrypted);
        } catch (e) {
            return null;
        }
    }
    
    clear() {
        this.data.clear();
        this.key = null;
    }
}

const sessionStorage = new SecureSessionStorage();

// Message handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    handleMessage(request, sender, sendResponse);
    return true;
});

async function handleMessage(request, sender, sendResponse) {
    try {
        switch (request.action) {
            case 'storeSecure':
                await sessionStorage.set(request.key, request.data);
                sendResponse({ success: true });
                break;
                
            case 'retrieveSecure':
                const data = await sessionStorage.get(request.key);
                sendResponse({ success: true, data });
                break;
                
            case 'clearSecure':
                sessionStorage.clear();
                sendResponse({ success: true });
                break;
                
            case 'getConfig':
                chrome.storage.local.get('config', (result) => {
                    sendResponse({ config: result.config || getDefaultConfig() });
                });
                break;
                
            case 'saveConfig':
                chrome.storage.local.set({ config: request.config }, () => {
                    sendResponse({ success: true });
                });
                break;
                
            case 'getStats':
                chrome.storage.local.get('stats', (result) => {
                    sendResponse({ stats: result.stats || getDefaultStats() });
                });
                break;
                
            case 'updateStats':
                chrome.storage.local.get('stats', (result) => {
                    const stats = { ...result.stats, ...request.stats };
                    chrome.storage.local.set({ stats }, () => {
                        sendResponse({ success: true });
                    });
                });
                break;
                
            default:
                sendResponse({ error: 'Unknown action' });
        }
    } catch (e) {
        sendResponse({ error: e.message });
    }
}

function getDefaultConfig() {
    return {
        videoSpeed: 4,
        autoSubmitQuiz: true,
        autoNextLesson: true,
        stopOnNewContent: true,
        retryFailedQuiz: true,
        maxQuizRetries: 3,
        humanLikeDelay: true,
        typingSpeed: 50
    };
}

function getDefaultStats() {
    return {
        totalVideos: 0,
        totalQuizzes: 0,
        totalCorrect: 0,
        totalTime: 0,
        sessionsCompleted: 0
    };
}

// Cleanup on browser close
chrome.runtime.onSuspend.addListener(() => {
    sessionStorage.clear();
});

// WebRequest monitoring (for token capture if needed)
chrome.webRequest?.onBeforeSendHeaders?.addListener(
    (details) => {
        const authHeader = details.requestHeaders?.find(
            h => h.name.toLowerCase() === 'authorization'
        );
        
        if (authHeader && details.url.includes('lms.ptit.edu.vn')) {
            // Store encrypted token
            sessionStorage.set('authToken', authHeader.value);
        }
    },
    { urls: ['https://lms.ptit.edu.vn/*'] },
    ['requestHeaders']
);

console.log('[LMS] Background service worker initialized');
