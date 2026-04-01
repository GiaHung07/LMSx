const LMSX_VERSION = '3.6';

const S = {
    version: LMSX_VERSION,
    buildStamp: typeof __LMSX_BUILD_STAMP__ !== 'undefined' ? __LMSX_BUILD_STAMP__ : 'dev',
    shadow: null,
    ui: null,
    logger: null,
    storage: null,
    settings: null,
    runtime: null,
    stats: null,
    uiPrefs: null,
    cache: {},
    videoCtrl: null,
    cleanup: [],
    timers: new Set(),
    observers: new Set(),
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const humanDelay = (min, max) => sleep(Math.round(min + Math.random() * (max - min)));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const nowTs = () => Date.now();
const nowIso = () => new Date().toISOString();
const timeLabel = (ts = Date.now()) => {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
};
function extractJsonCandidate(text) {
    if (typeof text !== 'string') return '';
    const trimmed = text.trim().replace(/^\uFEFF/, '').replace(/```json|```/gi, '').trim();
    if (!trimmed) return '';
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) return trimmed;

    const openers = new Set(['{', '[']);
    const closers = { '{': '}', '[': ']' };
    let start = -1;
    let stack = [];
    let inString = false;
    let escaped = false;

    for (let i = 0; i < trimmed.length; i++) {
        const ch = trimmed[i];
        if (inString) {
            if (escaped) escaped = false;
            else if (ch === '\\') escaped = true;
            else if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') {
            inString = true;
            continue;
        }
        if (openers.has(ch)) {
            if (start === -1) start = i;
            stack.push(closers[ch]);
            continue;
        }
        if (stack.length && ch === stack[stack.length - 1]) {
            stack.pop();
            if (!stack.length && start !== -1) return trimmed.slice(start, i + 1);
        }
    }
    return trimmed;
}

const safeJsonParse = (text, fallback = null) => {
    if (typeof text !== 'string' || !text.trim()) return fallback;
    const candidate = extractJsonCandidate(text);
    try {
        return JSON.parse(candidate);
    } catch {
        return fallback;
    }
};
const escapeHtml = text => String(text ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] || ch));
const normalizeText = text => String(text ?? '').replace(/\s+/g, ' ').trim();
const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));

function setManagedTimeout(fn, delay) {
    const timer = setTimeout(() => {
        S.timers.delete(timer);
        fn();
    }, delay);
    S.timers.add(timer);
    return timer;
}

function clearManagedTimeout(timer) {
    if (!timer) return;
    clearTimeout(timer);
    S.timers.delete(timer);
}

function addCleanup(fn) {
    if (typeof fn === 'function') S.cleanup.push(fn);
    return fn;
}

function registerObserver(observer) {
    if (!observer) return observer;
    S.observers.add(observer);
    addCleanup(() => {
        try { observer.disconnect(); } catch {}
        S.observers.delete(observer);
    });
    return observer;
}

function runCleanups() {
    while (S.cleanup.length) {
        const cleanup = S.cleanup.pop();
        try { cleanup?.(); } catch {}
    }
    for (const timer of [...S.timers]) clearManagedTimeout(timer);
    for (const observer of [...S.observers]) {
        try { observer.disconnect(); } catch {}
        S.observers.delete(observer);
    }
}
