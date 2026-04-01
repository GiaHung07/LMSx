// content.js - LMSX build
(function () {
    'use strict';
    const __LMSX_BUILD_STAMP__ = "2026-04-01T08:46:38.857Z";

    // -- main.js --
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


    // -- storage/schema.js --
    const STORAGE_SCHEMA_VERSION = 3;
    const UI_LAYOUT_VERSION = 'mac-card-v1';
    const STORAGE_KEYS = {
        settings: 'lmsx_settings',
        runtime: 'lmsx_runtime',
        stats: 'lmsx_stats',
        uiPrefs: 'lmsx_ui_prefs',
        cache: 'lmsx_cache',
    };

    const AI_PROVIDERS = ['groq', 'openrouter', 'gemini', 'custom'];
    const STATE_VALUES = ['idle', 'detecting-page', 'ready', 'running-video', 'waiting-ai', 'running-quiz', 'waiting-user', 'paused', 'error', 'completed'];
    const RUNNER_MAX_RETRIES = 3;

    function createDefaultSettings() {
        return {
            schemaVersion: STORAGE_SCHEMA_VERSION,
            ai: {
                provider: 'groq',
                keys: {
                    groq: '',
                    openrouter: '',
                    gemini: '',
                    custom: '',
                },
                customBaseUrl: 'https://api.openai.com/v1',
                customModel: 'gpt-4o-mini',
            },
            automation: {
                videoSpeed: 4,
                autoSubmitQuiz: true,
                autoNextLesson: true,
                maxQuizRetries: RUNNER_MAX_RETRIES,
                pauseWhenHidden: false,
            },
            featureFlags: {
                compatBypass: false,
                debugPanel: false,
                verboseLogs: false,
            },
        };
    }

    function createDefaultRuntime() {
        return {
            active: false,
            mode: 'safe',
            state: 'idle',
            lastError: null,
            lastUrl: location.href,
            currentCapability: 'unknown',
            lastAction: 'Đang chờ',
            stateMeta: {},
            progress: {
                done: 0,
                total: 0,
                percent: 0,
                source: 'fallback',
                flags: { video: false, quiz: false, hw: false },
            },
            capabilities: {
                pageType: null,
                quiz: null,
                quizStart: null,
                quizSubmit: null,
                video: null,
                nextButton: null,
                progress: null,
            },
            runner: {
                isRunning: false,
                pendingReason: '',
                pendingDelay: 0,
                pendingTimer: null,
                abortVersion: 0,
                retryCount: {},
                lastRunAt: 0,
            },
            quiz: {
                attempts: 0,
                lastPayload: null,
                importedAnswerSet: null,
                pendingQuestionHashes: [],
                awaitingNetwork: false,
                lastSubmittedAt: 0,
            },
            bridge: {
                ready: false,
                lastMessageAt: 0,
            },
            logs: [],
        };
    }

    function createDefaultStats() {
        return {
            sessionStartedAt: nowIso(),
            videosCompleted: 0,
            quizzesDetected: 0,
            answersApplied: 0,
            answersVerified: 0,
            navigations: 0,
            errors: 0,
        };
    }

    function createDefaultUiPrefs() {
        return {
            layoutVersion: UI_LAYOUT_VERSION,
            panel: {
                left: null,
                top: 16,
                width: 300,
                height: 300,
                minimized: false,
                closed: false,
            },
            drawerOpen: false,
        };
    }

    function shallowClone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function normalizeProvider(value) {
        return AI_PROVIDERS.includes(value) ? value : 'gemini';
    }

    function normalizeSettings(input) {
        const defaults = createDefaultSettings();
        const value = input && typeof input === 'object' ? input : {};
        const keys = value.ai?.keys && typeof value.ai.keys === 'object' ? value.ai.keys : {};
        return {
            schemaVersion: STORAGE_SCHEMA_VERSION,
            ai: {
                provider: normalizeProvider(value.ai?.provider),
                keys: {
                    groq: typeof keys.groq === 'string' ? keys.groq : defaults.ai.keys.groq,
                    openrouter: typeof keys.openrouter === 'string' ? keys.openrouter : defaults.ai.keys.openrouter,
                    gemini: typeof keys.gemini === 'string' ? keys.gemini : defaults.ai.keys.gemini,
                    custom: typeof keys.custom === 'string' ? keys.custom : defaults.ai.keys.custom,
                },
                customBaseUrl: typeof value.ai?.customBaseUrl === 'string' ? value.ai.customBaseUrl : defaults.ai.customBaseUrl,
                customModel: typeof value.ai?.customModel === 'string' ? value.ai.customModel : defaults.ai.customModel,
            },
            automation: {
                videoSpeed: clamp(Number(value.automation?.videoSpeed) || defaults.automation.videoSpeed, 1, 16),
                autoSubmitQuiz: value.automation?.autoSubmitQuiz !== false,
                autoNextLesson: value.automation?.autoNextLesson !== false,
                maxQuizRetries: clamp(Number(value.automation?.maxQuizRetries) || defaults.automation.maxQuizRetries, 1, 6),
                pauseWhenHidden: value.automation?.pauseWhenHidden === true,
            },
            featureFlags: {
                compatBypass: value.featureFlags?.compatBypass === true,
                debugPanel: value.featureFlags?.debugPanel === true,
                verboseLogs: value.featureFlags?.verboseLogs === true,
            },
        };
    }

    function normalizeRunner(input) {
        const defaults = createDefaultRuntime().runner;
        const value = input && typeof input === 'object' ? input : {};
        return {
            isRunning: false,
            pendingReason: typeof value.pendingReason === 'string' ? value.pendingReason : defaults.pendingReason,
            pendingDelay: clamp(Number(value.pendingDelay) || 0, 0, 15000),
            pendingTimer: null,
            abortVersion: Number(value.abortVersion) || defaults.abortVersion,
            retryCount: value.retryCount && typeof value.retryCount === 'object' ? value.retryCount : {},
            lastRunAt: Number(value.lastRunAt) || defaults.lastRunAt,
        };
    }

    function normalizeRuntime(input) {
        const defaults = createDefaultRuntime();
        const value = input && typeof input === 'object' ? input : {};
        return {
            active: false,
            mode: value.mode === 'compat' ? 'compat' : 'safe',
            state: STATE_VALUES.includes(value.state) ? value.state : defaults.state,
            lastError: value.lastError && typeof value.lastError === 'object' ? value.lastError : null,
            lastUrl: typeof value.lastUrl === 'string' ? value.lastUrl : location.href,
            currentCapability: typeof value.currentCapability === 'string' ? value.currentCapability : defaults.currentCapability,
            lastAction: typeof value.lastAction === 'string' ? value.lastAction : defaults.lastAction,
            stateMeta: value.stateMeta && typeof value.stateMeta === 'object' ? value.stateMeta : {},
            progress: {
                done: clamp(Number(value.progress?.done) || 0, 0, 999999),
                total: clamp(Number(value.progress?.total) || 0, 0, 999999),
                percent: clamp(Number(value.progress?.percent) || 0, 0, 100),
                source: typeof value.progress?.source === 'string' ? value.progress.source : defaults.progress.source,
                flags: {
                    video: value.progress?.flags?.video === true,
                    quiz: value.progress?.flags?.quiz === true,
                    hw: value.progress?.flags?.hw === true,
                },
            },
            capabilities: value.capabilities && typeof value.capabilities === 'object' ? value.capabilities : shallowClone(defaults.capabilities),
            runner: normalizeRunner(value.runner),
            quiz: {
                attempts: clamp(Number(value.quiz?.attempts) || 0, 0, 20),
                lastPayload: value.quiz?.lastPayload && typeof value.quiz.lastPayload === 'object' ? value.quiz.lastPayload : null,
                importedAnswerSet: value.quiz?.importedAnswerSet && typeof value.quiz.importedAnswerSet === 'object' ? value.quiz.importedAnswerSet : null,
                pendingQuestionHashes: Array.isArray(value.quiz?.pendingQuestionHashes) ? value.quiz.pendingQuestionHashes.filter(Boolean) : [],
                awaitingNetwork: value.quiz?.awaitingNetwork === true,
                lastSubmittedAt: Number(value.quiz?.lastSubmittedAt) || 0,
            },
            bridge: {
                ready: value.bridge?.ready === true,
                lastMessageAt: Number(value.bridge?.lastMessageAt) || 0,
            },
            logs: Array.isArray(value.logs) ? value.logs.slice(-40) : [],
        };
    }

    function normalizeStats(input) {
        const defaults = createDefaultStats();
        const value = input && typeof input === 'object' ? input : {};
        return {
            sessionStartedAt: typeof value.sessionStartedAt === 'string' ? value.sessionStartedAt : defaults.sessionStartedAt,
            videosCompleted: clamp(Number(value.videosCompleted) || 0, 0, 999999),
            quizzesDetected: clamp(Number(value.quizzesDetected) || 0, 0, 999999),
            answersApplied: clamp(Number(value.answersApplied) || 0, 0, 999999),
            answersVerified: clamp(Number(value.answersVerified) || 0, 0, 999999),
            navigations: clamp(Number(value.navigations) || 0, 0, 999999),
            errors: clamp(Number(value.errors) || 0, 0, 999999),
        };
    }

    function normalizeUiPrefs(input) {
        const defaults = createDefaultUiPrefs();
        const value = input && typeof input === 'object' ? input : {};
        const layoutVersion = typeof value.layoutVersion === 'string' ? value.layoutVersion : '';
        const useDefaultCompactSize = layoutVersion !== UI_LAYOUT_VERSION;
        return {
            layoutVersion: UI_LAYOUT_VERSION,
            panel: {
                left: Number.isFinite(value.panel?.left) ? value.panel.left : defaults.panel.left,
                top: Number.isFinite(value.panel?.top) ? value.panel.top : defaults.panel.top,
                width: clamp(useDefaultCompactSize ? defaults.panel.width : (Number(value.panel?.width) || defaults.panel.width), 300, 300),
                height: clamp(useDefaultCompactSize ? defaults.panel.height : (Number(value.panel?.height) || defaults.panel.height), 280, 360),
                minimized: value.panel?.minimized === true,
                closed: value.panel?.closed === true,
            },
            drawerOpen: value.drawerOpen === true,
        };
    }

    function normalizeCacheRecord(input, questionHash = '') {
        if (!input || typeof input !== 'object') return null;
        const selectedIndex = Number.isInteger(input.selectedIndex) ? input.selectedIndex : null;
        const selectedValue = typeof input.selectedValue === 'string' ? normalizeText(input.selectedValue) : '';
        if (selectedIndex === null && !selectedValue) return null;
        return {
            questionHash: typeof input.questionHash === 'string' ? input.questionHash : questionHash,
            selectedIndex,
            selectedValue,
            verifiedCorrect: input.verifiedCorrect === true,
            source: typeof input.source === 'string' ? input.source : 'unknown',
            confidence: clamp(Number(input.confidence) || 0, 0, 1),
            updatedAt: Number(input.updatedAt) || nowTs(),
        };
    }

    function normalizeCache(input) {
        const cache = {};
        const value = input && typeof input === 'object' ? input : {};
        Object.entries(value).forEach(([key, record]) => {
            const normalized = normalizeCacheRecord(record, key);
            if (normalized) cache[key] = normalized;
        });
        return cache;
    }

    function makeQuestionHash(questionText, choices = []) {
        const raw = `${normalizeText(questionText).toLowerCase()}||${choices.map(choice => normalizeText(choice).toLowerCase()).join('||')}`;
        let hash = 2166136261;
        for (let i = 0; i < raw.length; i++) {
            hash ^= raw.charCodeAt(i);
            hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
        }
        return `q_${(hash >>> 0).toString(36)}`;
    }

    function makeCacheRecord(questionHash, selectedIndex, selectedValue, source, extra = {}) {
        return normalizeCacheRecord({
            questionHash,
            selectedIndex: Number.isInteger(selectedIndex) ? selectedIndex : null,
            selectedValue: selectedValue ?? '',
            verifiedCorrect: extra.verifiedCorrect === true,
            source: source || 'unknown',
            confidence: typeof extra.confidence === 'number' ? extra.confidence : 0,
            updatedAt: extra.updatedAt || nowTs(),
        }, questionHash);
    }

    function normalizeAnswerSet(input) {
        if (!input || typeof input !== 'object') return null;
        const answers = Array.isArray(input.answers) ? input.answers : [];
        const normalizedAnswers = answers.map(answer => normalizeCacheRecord(answer, answer?.questionHash)).filter(Boolean);
        if (!normalizedAnswers.length) return null;
        return {
            answers: normalizedAnswers,
            source: typeof input.source === 'string' ? input.source : 'import',
            importedAt: Number(input.importedAt) || nowTs(),
        };
    }







    // -- storage/adapter.js --
    function chromeStorageGet(keys) {
        return new Promise(resolve => {
            try {
                chrome.storage.local.get(keys, result => {
                    if (chrome.runtime.lastError) {
                        console.warn('[LMSX] storage get error:', chrome.runtime.lastError.message);
                        resolve({});
                        return;
                    }
                    resolve(result || {});
                });
            } catch {
                resolve({});
            }
        });
    }

    function chromeStorageSet(payload) {
        return new Promise(resolve => {
            try {
                chrome.storage.local.set(payload, () => {
                    if (chrome.runtime.lastError) {
                        console.warn('[LMSX] storage set error:', chrome.runtime.lastError.message);
                    }
                    resolve();
                });
            } catch {
                resolve();
            }
        });
    }

    function createStorageAdapter() {
        async function persistAll(store) {
            await chromeStorageSet({
                [STORAGE_KEYS.settings]: normalizeSettings(store.settings),
                [STORAGE_KEYS.runtime]: normalizeRuntime(store.runtime),
                [STORAGE_KEYS.stats]: normalizeStats(store.stats),
                [STORAGE_KEYS.uiPrefs]: normalizeUiPrefs(store.uiPrefs),
                [STORAGE_KEYS.cache]: normalizeCache(store.cache),
            });
        }

        function migrateLegacyLocalStorage(store) {
            let changed = false;
            try {
                const provider = localStorage.getItem('lms_ai_provider');
                const hasStoredKey = AI_PROVIDERS.some(name => typeof store.settings.ai.keys[name] === 'string' && store.settings.ai.keys[name].trim());
                if (!hasStoredKey && provider && store.settings.ai.provider !== provider && AI_PROVIDERS.includes(provider)) {
                    store.settings.ai.provider = provider;
                    changed = true;
                }

                AI_PROVIDERS.forEach(name => {
                    const keyName = `lms_${name}_key`;
                    const legacyKey = localStorage.getItem(keyName);
                    const existingKey = typeof store.settings.ai.keys[name] === 'string' ? store.settings.ai.keys[name].trim() : '';
                    if (!existingKey && typeof legacyKey === 'string' && legacyKey) {
                        store.settings.ai.keys[name] = legacyKey;
                        changed = true;
                    }
                });

                for (let i = 0; i < localStorage.length; i++) {
                    const legacyKey = localStorage.key(i);
                    if (!legacyKey || !legacyKey.startsWith('lms_q_')) continue;
                    const rawValue = localStorage.getItem(legacyKey);
                    if (!rawValue) continue;
                    const questionHash = legacyKey.replace(/^lms_q_/, '');
                    if (store.cache[questionHash]) continue;
                    const parsed = safeJsonParse(rawValue);
                    let record = null;
                    if (parsed && typeof parsed === 'object') {
                        record = normalizeCacheRecord({ ...parsed, questionHash }, questionHash);
                    } else if (/^\d+$/.test(rawValue.trim())) {
                        record = makeCacheRecord(questionHash, Number(rawValue), '', 'legacy-index');
                    } else {
                        record = makeCacheRecord(questionHash, null, rawValue, 'legacy-value');
                    }
                    if (record) {
                        store.cache[questionHash] = record;
                        changed = true;
                    }
                }
            } catch {}
            return changed;
        }

        async function init() {
            const raw = await chromeStorageGet(Object.values(STORAGE_KEYS));
            const store = {
                settings: normalizeSettings(raw[STORAGE_KEYS.settings]),
                runtime: normalizeRuntime(raw[STORAGE_KEYS.runtime]),
                stats: normalizeStats(raw[STORAGE_KEYS.stats]),
                uiPrefs: normalizeUiPrefs(raw[STORAGE_KEYS.uiPrefs]),
                cache: normalizeCache(raw[STORAGE_KEYS.cache]),
            };

            const migrated = migrateLegacyLocalStorage(store);
            store.runtime.active = false;
            store.runtime.state = 'idle';
            store.runtime.lastUrl = location.href;
            store.runtime.runner = normalizeRunner(store.runtime.runner);

            if (migrated || !raw[STORAGE_KEYS.settings] || !raw[STORAGE_KEYS.runtime] || !raw[STORAGE_KEYS.stats] || !raw[STORAGE_KEYS.uiPrefs]) {
                await persistAll(store);
            }

            return store;
        }

        return {
            init,
            async saveSettings(settings) {
                const normalized = normalizeSettings(settings);
                await chromeStorageSet({ [STORAGE_KEYS.settings]: normalized });
                try {
                    localStorage.setItem('lms_ai_provider', normalized.ai.provider);
                    AI_PROVIDERS.forEach(name => {
                        const keyName = `lms_${name}_key`;
                        const keyValue = normalized.ai.keys[name] || '';
                        if (keyValue) localStorage.setItem(keyName, keyValue);
                        else localStorage.removeItem(keyName);
                    });
                } catch {}
            },
            async saveRuntimeSnapshot(runtime) {
                const snapshot = normalizeRuntime(runtime);
                snapshot.active = false;
                snapshot.runner.pendingTimer = null;
                snapshot.runner.isRunning = false;
                await chromeStorageSet({ [STORAGE_KEYS.runtime]: snapshot });
            },
            async saveStats(stats) {
                await chromeStorageSet({ [STORAGE_KEYS.stats]: normalizeStats(stats) });
            },
            async saveUiPrefs(uiPrefs) {
                await chromeStorageSet({ [STORAGE_KEYS.uiPrefs]: normalizeUiPrefs(uiPrefs) });
            },
            async saveCache(cache) {
                await chromeStorageSet({ [STORAGE_KEYS.cache]: normalizeCache(cache) });
            },
            async saveCacheRecord(record) {
                const cache = normalizeCache(S.cache);
                const normalized = normalizeCacheRecord(record, record?.questionHash);
                if (!normalized) return;
                cache[normalized.questionHash] = normalized;
                S.cache = cache;
                await chromeStorageSet({ [STORAGE_KEYS.cache]: cache });
            },
            async exportSnapshot() {
                return {
                    settings: normalizeSettings(S.settings),
                    runtime: normalizeRuntime(S.runtime),
                    stats: normalizeStats(S.stats),
                    uiPrefs: normalizeUiPrefs(S.uiPrefs),
                    cache: normalizeCache(S.cache),
                };
            },
        };
    }


    // -- runtime/logger.js --
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


    // -- runtime/state.js --
    function persistRuntimeSoon() {
        clearManagedTimeout(S.runtime?._persistTimer);
        if (!S.storage || !S.runtime) return;
        S.runtime._persistTimer = setManagedTimeout(() => {
            S.storage.saveRuntimeSnapshot(S.runtime);
            S.runtime._persistTimer = null;
        }, 120);
    }

    function persistStatsSoon() {
        clearManagedTimeout(S.stats?._persistTimer);
        if (!S.storage || !S.stats) return;
        S.stats._persistTimer = setManagedTimeout(() => {
            S.storage.saveStats(S.stats);
            S.stats._persistTimer = null;
        }, 120);
    }

    function persistUiPrefsSoon() {
        clearManagedTimeout(S.uiPrefs?._persistTimer);
        if (!S.storage || !S.uiPrefs) return;
        S.uiPrefs._persistTimer = setManagedTimeout(() => {
            S.storage.saveUiPrefs(S.uiPrefs);
            S.uiPrefs._persistTimer = null;
        }, 120);
    }

    function syncUi() {
        S.ui?.sync?.();
    }

    function setLastAction(detail) {
        if (!S.runtime) return;
        S.runtime.lastAction = detail || '';
        syncUi();
        persistRuntimeSoon();
    }

    function setState(next, meta = {}) {
        if (!STATE_VALUES.includes(next)) next = 'error';
        const prev = S.runtime.state;
        S.runtime.state = next;
        S.runtime.stateMeta = meta && typeof meta === 'object' ? meta : {};
        if (typeof meta.capability === 'string') S.runtime.currentCapability = meta.capability;
        if (typeof meta.detail === 'string' && meta.detail) S.runtime.lastAction = meta.detail;
        if (prev !== next) {
            S.logger?.info('state', 'transition', `${prev} -> ${next}`, meta);
        }
        syncUi();
        persistRuntimeSoon();
    }

    function setActive(next, reason = '') {
        S.runtime.active = !!next;
        if (!S.runtime.active) {
            S.runtime.quiz.awaitingNetwork = false;
            S.runtime.quiz.pendingQuestionHashes = [];
        }
        S.logger?.info('state', next ? 'active:on' : 'active:off', reason || (next ? 'Automation enabled' : 'Automation disabled'));
        syncUi();
        persistRuntimeSoon();
    }

    function updateStats(patch = {}) {
        S.stats = normalizeStats({ ...S.stats, ...patch });
        syncUi();
        persistStatsSoon();
    }

    function patchRuntime(patch = {}) {
        S.runtime = normalizeRuntime({ ...S.runtime, ...patch });
        syncUi();
        persistRuntimeSoon();
    }

    function updateUiPrefs(patch = {}) {
        S.uiPrefs = normalizeUiPrefs({
            ...S.uiPrefs,
            ...patch,
            panel: {
                ...S.uiPrefs.panel,
                ...(patch.panel || {}),
            },
        });
        syncUi();
        persistUiPrefsSoon();
    }


    // -- runtime/selectors.js --
    const SELECTOR_REGISTRY = {
        quiz: [
            '[class*="lesson-quiz-styles__QuizBody"]',
            '[class*="QuizBody"]',
            '[class*="QuizContent"]',
            '.xblock-problem',
        ],
        quizStart: [
            'button[data-testid*="start"]',
            'button',
        ],
        quizSubmit: [
            'button[type="submit"]',
            'button[data-testid*="submit"]',
            '.submit.btn-brand',
            '.submit.button',
            '.check',
        ],
        nextButton: [
            '.sequence-nav-button.button-next',
            '.next-button',
            'button.next',
            '[data-next]',
            'a.next',
        ],
        progress: [
            '.sequence-navigation .progress .sr-only',
            '.sequence-navigation .progress-bar',
            '[aria-label*="progress" i]',
            '[data-progress]',
            '[class*="progress"]',
        ],
    };

    const CAPABILITY_CACHE = {
        value: null,
        at: 0,
    };

    function invalidateCapabilityCache(reason = 'manual') {
        CAPABILITY_CACHE.value = null;
        CAPABILITY_CACHE.at = 0;
        S.logger?.debug('selectors', 'invalidate', reason);
    }

    function summarizeNode(node) {
        if (!(node instanceof HTMLElement)) return null;
        return {
            tag: node.tagName.toLowerCase(),
            id: node.id || '',
            className: typeof node.className === 'string' ? node.className.slice(0, 120) : '',
            text: normalizeText(node.textContent).slice(0, 120),
        };
    }

    function makeSelectorMatch(type, node, selector, confidence, meta = {}) {
        return {
            matched: !!node,
            type,
            node: node || null,
            sourceSelector: selector || '',
            confidence,
            meta,
        };
    }

    function serializeSelectorMatch(match) {
        if (!match) return null;
        return {
            matched: !!match.matched,
            type: match.type,
            sourceSelector: match.sourceSelector,
            confidence: match.confidence,
            meta: match.meta || {},
            node: summarizeNode(match.node),
        };
    }

    function serializeCapabilities(caps) {
        return {
            pageType: caps.pageType,
            currentCapability: caps.currentCapability,
            quiz: serializeSelectorMatch(caps.quiz),
            quizStart: serializeSelectorMatch(caps.quizStart),
            quizSubmit: serializeSelectorMatch(caps.quizSubmit),
            video: serializeSelectorMatch(caps.video),
            nextButton: serializeSelectorMatch(caps.nextButton),
            progress: serializeSelectorMatch(caps.progress),
        };
    }

    function findFirstVisible(selectors, filter) {
        if (!Array.isArray(selectors)) return { node: null, selector: '' };
        for (const selector of selectors) {
            const nodes = document.querySelectorAll(selector);
            for (const node of nodes) {
                if (typeof filter === 'function' && !filter(node)) continue;
                return { node, selector };
            }
        }
        return { node: null, selector: '' };
    }

    function isEnabledButton(node) {
        if (!(node instanceof HTMLElement)) return false;
        if (node.disabled) return false;
        const text = normalizeText(node.textContent).toLowerCase();
        return !!text;
    }

    function detectQuizCapability() {
        const match = findFirstVisible(SELECTOR_REGISTRY.quiz);
        return makeSelectorMatch('quiz', match.node, match.selector, match.node ? 0.95 : 0);
    }

    function detectQuizStartCapability() {
        const candidates = [];
        SELECTOR_REGISTRY.quizStart.forEach(selector => document.querySelectorAll(selector).forEach(node => candidates.push({ selector, node })));
        const match = candidates.find(item => {
            if (!isEnabledButton(item.node)) return false;
            const text = normalizeText(item.node.textContent).toLowerCase();
            return text === 'bắt đầu làm bài' || text === 'làm lại bài' || text === 'start quiz' || text === 'start';
        });
        return makeSelectorMatch('quizStart', match?.node || null, match?.selector || '', match ? 0.92 : 0);
    }

    function detectQuizSubmitCapability() {
        const match = findFirstVisible(SELECTOR_REGISTRY.quizSubmit, node => {
            if (!isEnabledButton(node)) return false;
            const text = normalizeText(node.textContent).toLowerCase();
            return /(nộp|kiểm tra|submit|check|finish)/.test(text);
        });
        return makeSelectorMatch('quizSubmit', match.node, match.selector, match.node ? 0.82 : 0);
    }

    function detectNextCapability() {
        const match = findFirstVisible(SELECTOR_REGISTRY.nextButton, node => {
            if (!(node instanceof HTMLElement)) return false;
            return !node.disabled && node.getAttribute('aria-disabled') !== 'true';
        });
        return makeSelectorMatch('nextButton', match.node, match.selector, match.node ? 0.84 : 0);
    }

    function detectVideoCapability() {
        let node = document.querySelector('video');
        let selector = 'video';
        if (!node) {
            try {
                for (const frame of document.querySelectorAll('iframe')) {
                    try {
                        node = frame.contentDocument?.querySelector('video');
                        if (node) {
                            selector = 'iframe video';
                            break;
                        }
                    } catch {}
                }
            } catch {}
        }
        return makeSelectorMatch('video', node, selector, node ? 0.96 : 0);
    }

    function detectProgressCapability() {
        const direct = findFirstVisible(SELECTOR_REGISTRY.progress);
        return makeSelectorMatch('progress', direct.node, direct.selector, direct.node ? 0.7 : 0);
    }

    function detectQuizQuestionProgress() {
        const quizRoot = document.querySelector('[class*="lesson-quiz-styles__QuizBody"], [class*="QuizBody"], [class*="QuizContent"], .xblock-problem');
        if (!quizRoot) return null;

        // Dùng cùng logic collectQuizContainers: lọc anti-nesting để tránh đếm trùng
        // (QuestionText, QuestionBody,... đều có class "Question" → phải lọc parent.contains)
        let containers;
        const byQuestion = [...quizRoot.querySelectorAll('[class*="Question"]:not([class*="QuestionList"])')];
        if (byQuestion.length) {
            containers = byQuestion.filter(el => !byQuestion.some(p => p !== el && p.contains(el)));
        } else if (quizRoot.matches?.('.xblock-problem')) {
            containers = [...quizRoot.querySelectorAll('.choicegroup, .field')];
        } else {
            const fallback = [...quizRoot.querySelectorAll('[class*="OptionList"], .choicegroup, .field')];
            containers = fallback.filter(el => !fallback.some(p => p !== el && p.contains(el)));
        }

        // Loại bỏ container không có option nào (không phải câu hỏi)
        const questions = containers.filter(node => {
            if (!(node instanceof HTMLElement)) return false;
            return !!node.querySelector('input[type="radio"], input[type="checkbox"], [role="button"][aria-pressed], [class*="Option"]:not([class*="OptionList"])');
        });

        const total = questions.length;
        if (!total) return null;

        let done = 0;
        questions.forEach(node => {
            const checked = node.querySelector('input:checked, [aria-pressed="true"], [aria-checked="true"]');
            if (checked) done += 1;
        });

        return {
            done: clamp(done, 0, total),
            total,
            percent: total ? Math.round((done / total) * 100) : 0,
            source: 'quiz-dom',
            flags: {
                video: false,
                quiz: true,
                hw: false,
            },
        };
    }

    function detectProgressSnapshot() {
        const quizProgress = detectQuizQuestionProgress();
        if (quizProgress) return quizProgress;
        const specific = document.querySelector('.sequence-navigation .progress .sr-only');
        if (specific) {
            const text = normalizeText(specific.textContent);
            const percentMatch = text.match(/(\d+)\s*%/);
            const navItems = document.querySelectorAll('.sequence-nav-button:not(.button-next):not(.button-previous)');
            const total = clamp(navItems.length || 0, 0, 999999);
            const percent = clamp(Number(percentMatch?.[1]) || 0, 0, 100);
            const done = total ? Math.round((percent / 100) * total) : 0;
            return {
                done,
                total,
                percent,
                source: 'dom-specific',
                flags: {
                    video: !!detectVideoCapability().matched,
                    quiz: !!detectQuizCapability().matched,
                    hw: false,
                },
            };
        }

        const labelled = document.querySelector('[aria-label*="progress" i], [data-progress]');
        if (labelled) {
            const text = normalizeText(labelled.getAttribute('aria-label') || labelled.getAttribute('data-progress') || labelled.textContent);
            const countMatch = text.match(/(\d+)\s*\/\s*(\d+)/);
            const percentMatch = text.match(/(\d+)\s*%/);
            const total = clamp(Number(countMatch?.[2]) || 0, 0, 999999);
            const done = clamp(Number(countMatch?.[1]) || (total ? Math.round((Number(percentMatch?.[1]) || 0) * total / 100) : 0), 0, total || 999999);
            const percent = total ? Math.round((done / total) * 100) : clamp(Number(percentMatch?.[1]) || 0, 0, 100);
            return {
                done,
                total,
                percent,
                source: 'aria-data',
                flags: {
                    video: !!detectVideoCapability().matched,
                    quiz: !!detectQuizCapability().matched,
                    hw: false,
                },
            };
        }

        const fallbackTotal = Math.max(S.stats.videosCompleted + S.stats.quizzesDetected, S.runtime.progress.total || 0, 0);
        const fallbackDone = clamp(S.stats.videosCompleted + S.stats.answersVerified, 0, fallbackTotal || 999999);
        const fallbackPercent = fallbackTotal ? Math.round((fallbackDone / fallbackTotal) * 100) : 0;
        return {
            done: fallbackDone,
            total: fallbackTotal,
            percent: fallbackPercent,
            source: 'fallback',
            flags: {
                video: !!detectVideoCapability().matched,
                quiz: !!detectQuizCapability().matched,
                hw: false,
            },
        };
    }

    function detectPageCapabilities(force = false) {
        const age = nowTs() - CAPABILITY_CACHE.at;
        if (!force && CAPABILITY_CACHE.value && age < 1200) return CAPABILITY_CACHE.value;

        const quiz = detectQuizCapability();
        const quizStart = detectQuizStartCapability();
        const quizSubmit = detectQuizSubmitCapability();
        const video = detectVideoCapability();
        const nextButton = detectNextCapability();
        const progress = detectProgressCapability();

        const pageType = quiz.matched ? 'quiz' : video.matched ? 'video' : 'generic';
        const currentCapability = quizStart.matched ? 'quiz-start' : quiz.matched ? 'quiz' : video.matched ? 'video' : nextButton.matched ? 'navigation' : 'idle';

        CAPABILITY_CACHE.value = {
            pageType,
            currentCapability,
            quiz,
            quizStart,
            quizSubmit,
            video,
            nextButton,
            progress,
        };
        CAPABILITY_CACHE.at = nowTs();
        return CAPABILITY_CACHE.value;
    }



    // -- network/providers.js --
    function extractAiKeyCandidate(rawValue = '') {
        const text = String(rawValue || '').trim();
        if (!text) return '';
        const match = text.match(/AIzaSy[0-9A-Za-z_-]{33}/);
        return match ? match[0] : text.replace(/\s+/g, '');
    }

    function pickBestAnswerCandidate(candidates) {
        const valid = candidates.filter(Boolean);
        if (!valid.length) return null;

        const scoreByIndex = new Map();
        valid.forEach(candidate => {
            const idx = candidate.selectedIndex;
            if (!Number.isInteger(idx)) return;
            const current = scoreByIndex.get(idx) || { count: 0, confidence: 0 };
            current.count += 1;
            current.confidence = Math.max(current.confidence, Number(candidate.confidence || 0));
            scoreByIndex.set(idx, current);
        });

        if (!scoreByIndex.size) return valid[0];
        let bestIndex = null;
        let bestCount = -1;
        let bestConfidence = -1;
        scoreByIndex.forEach((entry, idx) => {
            if (entry.count > bestCount || (entry.count === bestCount && entry.confidence > bestConfidence)) {
                bestIndex = idx;
                bestCount = entry.count;
                bestConfidence = entry.confidence;
            }
        });

        return valid
            .filter(candidate => candidate.selectedIndex === bestIndex)
            .sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0))[0] || valid[0];
    }

    function sanitizeAiKeyInput(rawValue = '') {
        return extractAiKeyCandidate(rawValue).trim();
    }

    function isLikelyApiKey(provider, value = '') {
        const v = String(value || '').trim();
        if (provider === 'groq') return v.startsWith('gsk_');
        if (provider === 'openrouter') return v.startsWith('sk-or-') || v.length > 20;
        return false;
    }

    async function testAiKey(provider, rawKey) {
        const key = sanitizeAiKeyInput(rawKey);
        if (!isLikelyApiKey(provider, key)) {
            return { ok: false, status: 'invalid', message: 'API key không đúng định dạng' };
        }

        try {
            let res;
            if (provider === 'groq') {
                res = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
                    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 }),
                });
            } else if (provider === 'openrouter') {
                res = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST', headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${key}`,
                        'HTTP-Referer': location.origin || 'https://lmsx.local',
                        'X-Title': 'LMSX Quiz Assistant',
                    },
                    body: JSON.stringify({ model: 'meta-llama/llama-3.3-70b-instruct:free', messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 }),
                });
            } else {
                 return { ok: false, status: 'invalid', message: 'Provider không được hỗ trợ' };
            }

            const data = await res.json().catch(() => ({}));
            if (res.ok && !data.error) return { ok: true, status: 'ok', message: 'Key hoạt động bình thường' };

            const message = data.error?.message || `HTTP ${res.status}`;
            if (isPermanentAiError(message)) {
                const expired = /expired/i.test(message);
                return { ok: false, status: expired ? 'expired' : 'invalid', message };
            }
            if (isTemporaryAiThrottle(message) || res.status === 429) {
                return { ok: false, status: 'rate_limited', message };
            }
            return { ok: false, status: 'error', message };
        } catch (error) {
            return { ok: false, status: 'error', message: error?.message || 'Lỗi kết nối' };
        }
    }
    function getAiProviderConfig() {
        const provider = normalizeProvider(S.settings?.ai?.provider);
        const key = S.settings?.ai?.keys?.[provider] || '';
        return { provider, key };
    }

    function getFallbackProviderConfig(excludeProvider) {
        const fallbackOrder = ['groq', 'openrouter'];
        for (const provider of fallbackOrder) {
            if (provider === excludeProvider) continue;
            const key = S.settings?.ai?.keys?.[provider] || '';
            if (key && !isProviderBlocked(provider, key)) {
                return { provider, key };
            }
        }
        return null;
    }

    function isProviderBlocked(provider, key) {
        const fingerprint = getAiBlockFingerprint(provider, key);
        const blocked = S.runtime?._aiBlocked;
        if (blocked?.fingerprint !== fingerprint) return false;
        // Check if block is still active (temporary blocks have retryAt)
        if (blocked.retryAt && blocked.retryAt > nowTs()) return true;
        // Permanent blocks don't have retryAt
        if (!blocked.retryAt) return true;
        return false;
    }

    function getAiBlockFingerprint(provider, key) {
        return `${provider}:${String(key || '').slice(-8)}`;
    }

    function clearAiBlockIfKeyChanged(provider, key) {
        const nextFingerprint = getAiBlockFingerprint(provider, key);
        if (!S.runtime?._aiBlocked) return;
        if (S.runtime._aiBlocked.fingerprint !== nextFingerprint) {
            delete S.runtime._aiBlocked;
            return;
        }
        if (S.runtime._aiBlocked.retryAt && S.runtime._aiBlocked.retryAt <= nowTs()) {
            delete S.runtime._aiBlocked;
        }
    }

    function parseRetryAfterMs(message = '') {
        const match = String(message || '').match(/retry in\s+([0-9]+(?:\.[0-9]+)?)s/i);
        if (!match) return 0;
        return Math.max(0, Math.ceil(Number(match[1]) * 1000));
    }

    function isPermanentAiError(message = '') {
        const text = String(message || '').toLowerCase();
        return (
            text.includes('api key expired') ||
            text.includes('invalid api key') ||
            text.includes('api key not valid') ||
            text.includes('api_key_invalid') ||
            text.includes('permission denied') ||
            text.includes('unauthorized') ||
            text.includes('invalid argument')
        );
    }

    function isTemporaryAiThrottle(message = '') {
        const text = String(message || '').toLowerCase();
        return (
            text.includes('quota') ||
            text.includes('billing') ||
            text.includes('rate limit') ||
            text.includes('too many') ||
            text.includes('429') ||
            text.includes('restricted') ||
            text.includes('limit') ||
            text.includes('exceeded') ||
            text.includes('resource has been exhausted')
        );
    }

    function handlePermanentAiFailure(provider, key, message) {
        S.runtime._aiBlocked = {
            provider,
            fingerprint: getAiBlockFingerprint(provider, key),
            message: 'Lỗi API',
            at: nowTs(),
        };
        clearRunnerTimer?.();
        setActive(false, 'fatal-ai-error');

        const PROVIDER_LABELS = { groq: 'Groq', openrouter: 'OpenRouter' };
        const providerLabel = PROVIDER_LABELS[provider] || provider;
        let vnMessage = 'Key không hợp lệ';
        const text = String(message || '').toLowerCase();
        if (text.includes('expired') || text.includes('api key expired')) {
            vnMessage = 'Key đã hết hạn';
        } else if (text.includes('invalid') || text.includes('not valid') || text.includes('api_key_invalid')) {
            vnMessage = 'Key sai hoặc không hợp lệ';
        } else if (text.includes('permission') || text.includes('unauthorized')) {
            vnMessage = 'Không có quyền truy cập';
        }

        const friendlyError = `Lỗi ${providerLabel}: ${vnMessage}`;
        S.ui?.toast?.(friendlyError, 'error', 6000);
        setState('waiting-user', {
            capability: 'quiz',
            detail: friendlyError,
        });
    }

    function handleTemporaryAiThrottle(provider, key, message) {
        const PROVIDER_LABELS = { groq: 'Groq', openrouter: 'OpenRouter' };
        const providerLabel = PROVIDER_LABELS[provider] || provider;
        const retryMs = parseRetryAfterMs(message) || 10000;
        const retryAt = nowTs() + retryMs;
        const retrySeconds = Math.max(1, Math.ceil(retryMs / 1000));
        S.runtime._aiBlocked = {
            provider,
            fingerprint: getAiBlockFingerprint(provider, key),
            message: 'Rate limited',
            at: nowTs(),
            retryAt,
        };
        clearRunnerTimer?.();
        setActive(false, 'ai-rate-limited');
        const friendlyError = `Lỗi ${providerLabel}: Chạm giới hạn tạm thời, thử lại sau ${retrySeconds}s`;
        S.ui?.toast?.(friendlyError, 'warn', 6000);
        setState('waiting-user', {
            capability: 'quiz',
            detail: friendlyError,
        });
    }

    function buildAiPrompt(question, choices) {
        return `You are a world-class expert in Marxist Political Economy and Vietnamese university multiple-choice exams.
    Use rigorous reasoning internally to identify concept, detect traps, eliminate wrong choices, and select the most academically correct option.

    Question:
    ${question}

    Choices:
    ${choices.map((choice, index) => `[${index}] ${choice}`).join('\n')}

    STRICT OUTPUT RULES:
    - Return ONLY one raw JSON object
    - No markdown, no code fences, no text outside JSON
    - selectedIndex must be an integer matching one [N] option

    Return EXACTLY this schema:
    {"selectedIndex": <integer>, "selectedValue": "<exact choice text>", "confidence": 0.95, "reason": "<short rationale>"}`;
    }

    function buildAiVerifyPrompt(question, choices, candidateIndex) {
        return `You are validating a multiple-choice answer for a Vietnamese Marxist Political Economy exam.
    Check whether candidate option [${candidateIndex}] is truly the best answer.
    If it is wrong, pick the correct option.

    Question:
    ${question}

    Choices:
    ${choices.map((choice, index) => `[${index}] ${choice}`).join('\n')}

    Return ONLY one JSON object, no markdown:
    {"selectedIndex": <integer>, "selectedValue": "<exact choice text>", "confidence": 0.95, "reason": "<short rationale>"}`;
    }

    function normalizeAiAnswer(raw, questionHash, choices, provider) {
        if (!raw || typeof raw !== 'object') {
            S.logger?.warn('ai', 'normalize:fail', 'raw is not object', { rawType: typeof raw, raw: String(raw).slice(0, 200) });
            return null;
        }
        const rawIndex = raw?.selectedIndex ?? raw?.index;
        const selectedIndex = Number.isInteger(rawIndex) ? rawIndex : (typeof rawIndex === 'number' ? Math.round(rawIndex) : null);
        const selectedValue = typeof raw?.selectedValue === 'string' ? normalizeText(raw.selectedValue) : '';
        // AI often returns 0 confidence from template copying; force minimum 0.85 if it gave us an answer
        let confidence = clamp(Number(raw?.confidence) || 0, 0, 1);
        const hasValue = selectedIndex !== null || !!selectedValue;
        if (!hasValue) {
            S.logger?.warn('ai', 'normalize:empty', 'no selectedIndex or selectedValue', { raw: JSON.stringify(raw).slice(0, 200) });
            return null;
        }
        // If the AI returned an answer but confidence is suspiciously low (e.g. copied schema), boost it
        if (confidence < 0.5 && hasValue) {
            confidence = 0.85;
        }
        return normalizeCacheRecord({
            questionHash,
            selectedIndex,
            selectedValue: selectedValue || (selectedIndex !== null && selectedIndex < choices.length ? choices[selectedIndex] : ''),
            confidence,
            verifiedCorrect: false,
            source: provider,
            updatedAt: nowTs(),
        }, questionHash);
    }



    async function fetchWithTimeout(url, options, timeoutMs = 30000) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, { ...options, signal: controller.signal });
            return response;
        } finally {
            clearTimeout(id);
        }
    }

    async function callOpenRouterProvider(key, prompt) {
        const response = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`,
                'HTTP-Referer': location.origin || 'https://lmsx.local',
                'X-Title': 'LMSX Quiz Assistant',
            },
            body: JSON.stringify({
                model: 'meta-llama/llama-3.3-70b-instruct:free',
                temperature: 0.1,
                response_format: { type: 'json_object' },
                messages: [{ role: 'user', content: prompt }],
            }),
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error.message || 'OpenRouter request failed');
        const content = data.choices?.[0]?.message?.content || '';
        return safeJsonParse(content.replace(/```json|```/gi, '').trim());
    }

    async function callGroqProvider(key, prompt) {
        const response = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                temperature: 0.1,
                response_format: { type: 'json_object' },
                messages: [{ role: 'user', content: prompt }],
            }),
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error.message || 'Groq request failed');
        return safeJsonParse(data.choices?.[0]?.message?.content || '');
    }

    async function resolveAnswerViaAI(questionRecord) {
        const { provider, key } = getAiProviderConfig();
        if (!key) return null;
        clearAiBlockIfKeyChanged(provider, key);
        if (isProviderBlocked(provider, key)) {
            // Try fallback
            const fallback = getFallbackProviderConfig(provider);
            if (fallback) {
                S.logger?.info('ai', 'fallback:attempt', `Primary ${provider} blocked, trying ${fallback.provider}`);
                return resolveWithProvider(fallback.provider, fallback.key, questionRecord);
            }
            return null;
        }
        return resolveWithProvider(provider, key, questionRecord);
    }

    async function resolveWithProvider(provider, key, questionRecord, options = {}) {
        const silent = options.silent === true;
        const prompt = options.promptOverride || buildAiPrompt(questionRecord.questionText, questionRecord.choiceTexts);
        if (!silent) {
            S.logger?.info('ai', 'request', `Provider ${provider}`, { questionHash: questionRecord.questionHash });
            setState('waiting-ai', { capability: 'quiz', detail: `Đang hỏi ${provider}` });
        }
        try {
            let raw = null;
            if (provider === 'groq') raw = await callGroqProvider(key, prompt);
            else raw = await callOpenRouterProvider(key, prompt);
            if (!silent) {
                S.logger?.debug('ai', 'single:raw', 'Raw AI response', { raw: JSON.stringify(raw).slice(0, 300) });
            }
            const normalized = normalizeAiAnswer(raw, questionRecord.questionHash, questionRecord.choiceTexts, provider);
            if (!normalized) throw new Error('AI response did not match schema');
            return normalized;
        } catch (error) {
            S.logger?.warn('ai', 'request:failed', error.message, { provider, questionHash: questionRecord.questionHash, silent });
            if (isPermanentAiError(error.message)) {
                handlePermanentAiFailure(provider, key, error.message);
            } else if (isTemporaryAiThrottle(error.message)) {
                handleTemporaryAiThrottle(provider, key, error.message);
                // Try fallback on rate limit
                const fallback = getFallbackProviderConfig(provider);
                if (fallback) {
                    S.logger?.info('ai', 'fallback:rate-limit', `Trying ${fallback.provider} after ${provider} rate limited`);
                    return resolveWithProvider(fallback.provider, fallback.key, questionRecord, options);
                }
            } else {
                if (!silent) S.ui?.toast?.(`Kết nối lỗi: ${error.message}`, 'error', 4500);
            }
            return null;
        }
    }

    function buildAiBatchPrompt(questionsList) {
        let block = `You are a world-class expert in Marxist Political Economy, Vietnamese academic curriculum, and multiple-choice exam analysis.
    Use rigorous internal reasoning for each question: identify concept, detect traps (NOT/EXCEPT/overgeneralization), eliminate wrong options, then pick the most precise answer.

    I have ${questionsList.length} multiple-choice questions. Answer ALL of them.
    Return ONLY a JSON object. No markdown fences. No text outside JSON.
    The JSON must have an "answers" array with EXACTLY ${questionsList.length} elements (one per question, in order).
    Each element schema:
    {"selectedIndex": <0-based integer>, "selectedValue": "<exact option text>", "confidence": 0.95, "reason": "<very short rationale>"}

    `;
        questionsList.forEach((q, i) => {
            block += `Q${i + 1}: ${q.questionText}\n`;
            q.choiceTexts.forEach((c, cIdx) => {
                block += `  [${cIdx}] ${c}\n`;
            });
            block += '\n';
        });
        return block;
    }

    function shouldRecheckBatchAnswer(questionRecord, answerRecord) {
        if (!questionRecord || !answerRecord) return false;
        const question = normalizeText(questionRecord.questionText || '').toLowerCase();
        const selectedText = normalizeText(answerRecord.selectedValue || '').toLowerCase();
        const trapQuestion = /(không|ngoại trừ|sai|except|not|least|đúng nhất|ý đúng|chọn ý đúng|tác động|gồm|bao gồm)/i.test(question);
        const riskyOption = /(mọi|tất cả|luôn|duy nhất|chỉ|hoàn toàn)/i.test(selectedText);
        const lowConfidence = Number(answerRecord.confidence || 0) < 0.93;
        return trapQuestion || riskyOption || lowConfidence;
    }

    async function refineRiskyBatchAnswers(questionRecords, results, provider, key) {
        const riskyIndexes = [];
        for (let i = 0; i < questionRecords.length; i++) {
            if (shouldRecheckBatchAnswer(questionRecords[i], results[i])) riskyIndexes.push(i);
        }
        if (!riskyIndexes.length) return results;

        const maxRechecks = Math.min(3, riskyIndexes.length);
        const fallback = getFallbackProviderConfig(provider);
        const recheckProvider = fallback?.provider || provider;
        const recheckKey = fallback?.key || key;
        const next = [...results];

        S.logger?.info('ai', 'batch:recheck:start', `Rechecking ${maxRechecks}/${riskyIndexes.length} risky answers`, {
            provider: recheckProvider,
            riskyIndexes: riskyIndexes.slice(0, maxRechecks).map(i => i + 1),
        });

        for (const idx of riskyIndexes.slice(0, maxRechecks)) {
            const questionRecord = questionRecords[idx];
            const current = next[idx];
            const rechecked = await resolveWithProvider(recheckProvider, recheckKey, questionRecord, { silent: true });
            const verifyPrompt = buildAiVerifyPrompt(questionRecord.questionText, questionRecord.choiceTexts, rechecked?.selectedIndex ?? current?.selectedIndex ?? 0);
            const verified = await resolveWithProvider(recheckProvider, recheckKey, questionRecord, {
                silent: true,
                promptOverride: verifyPrompt,
            });
            const best = pickBestAnswerCandidate([current, rechecked, verified]);
            if (!best) continue;
            const confidenceGain = Number(best.confidence || 0) - Number(current?.confidence || 0);
            const changedIndex = best.selectedIndex !== current?.selectedIndex;
            if (changedIndex || confidenceGain >= 0.05) {
                next[idx] = best;
                S.logger?.info('ai', 'batch:recheck:updated', `Updated Q${idx + 1} after recheck`, {
                    from: current?.selectedIndex,
                    to: best.selectedIndex,
                    confidenceGain,
                    provider: recheckProvider,
                });
            }
        }

        return next;
    }

    async function resolveAnswersBatchViaAI(questionRecords) {
        const { provider, key } = getAiProviderConfig();
        if (!key || questionRecords.length === 0) return null;
        clearAiBlockIfKeyChanged(provider, key);
        if (isProviderBlocked(provider, key)) {
            const fallback = getFallbackProviderConfig(provider);
            if (fallback) {
                S.logger?.info('ai', 'fallback:attempt', `Primary ${provider} blocked, trying ${fallback.provider} for batch`);
                return resolveBatchWithProvider(fallback.provider, fallback.key, questionRecords);
            }
            return null;
        }
        return resolveBatchWithProvider(provider, key, questionRecords);
    }

    async function resolveBatchWithProvider(provider, key, questionRecords) {
        const prompt = buildAiBatchPrompt(questionRecords);
        S.logger?.info('ai', 'request', `Batch asking ${provider} ${questionRecords.length} questions`);
        S.logger?.debug('ai', 'batch:prompt:full', 'Full batch prompt sent to AI', {
            provider,
            questionCount: questionRecords.length,
            prompt,
        });
        S.logger?.debug('ai', 'batch:prompt:text', `Prompt plain text sent to AI\n${prompt}`);
        S.logger?.debug('ai', 'batch:input:full', 'Full batch questionRecords input', {
            provider,
            questions: questionRecords.map((q, idx) => ({
                index: idx + 1,
                questionHash: q.questionHash,
                questionText: q.questionText,
                choices: q.choiceTexts,
            })),
        });
        setState('waiting-ai', { capability: 'quiz', detail: `Đang hỏi AI ${questionRecords.length} câu cùng lúc` });
        try {
            let raw = null;
            if (provider === 'groq') raw = await callGroqProvider(key, prompt);
            else raw = await callOpenRouterProvider(key, prompt);

            S.logger?.info('ai', 'batch:raw', `Raw batch response type=${typeof raw}`, { rawPreview: JSON.stringify(raw).slice(0, 800) });
            S.logger?.debug('ai', 'batch:raw:full', `Full response for debug`, { raw: JSON.stringify(raw) });

            let answers = null;
            S.logger?.debug('ai', 'batch:parse:check', `Checking response structure`, { 
                hasAnswersArray: Array.isArray(raw?.answers), 
                isArray: Array.isArray(raw),
                keys: raw && typeof raw === 'object' ? Object.keys(raw) : 'N/A'
            });
            if (Array.isArray(raw?.answers)) {
                answers = raw.answers;
            } else if (Array.isArray(raw)) {
                answers = raw;
            } else if (raw && typeof raw === 'object') {
                const possibleArrays = Object.values(raw).filter(v => Array.isArray(v));
                if (possibleArrays.length === 1) {
                    answers = possibleArrays[0];
                    S.logger?.info('ai', 'batch:fallback', `Found answers array in key other than 'answers'`, { count: answers.length });
                }
            }

            if (!answers || answers.length === 0) {
                S.logger?.warn('ai', 'batch:parse-fail', 'Could not extract answers array from response', { 
                    rawKeys: raw ? Object.keys(raw) : 'null', 
                    rawType: typeof raw,
                    rawPreview: JSON.stringify(raw).slice(0, 800) 
                });
                throw new Error('AI response did not contain answers array');
            }

            S.logger?.info('ai', 'batch:parsed', `Got ${answers.length} answers for ${questionRecords.length} questions`);
            
            // DEBUG: Check each answer before processing
            answers.forEach((ans, idx) => {
                S.logger?.debug('ai', 'batch:answer:check', `Q${idx}: ${ans ? 'has data' : 'NULL'}`, { 
                    ansType: typeof ans, 
                    ansPreview: ans ? JSON.stringify(ans).slice(0, 100) : 'null' 
                });
            });

            while (answers.length < questionRecords.length) {
                answers.push(null);
            }

            const results = questionRecords.map((qr, idx) => {
                const ans = answers[idx];
                if (!qr || !ans) {
                    S.logger?.warn('ai', 'batch:item-null', `Answer ${idx} is null/missing`, { hasQr: !!qr, hasAns: !!ans, questionHash: qr?.questionHash?.slice(0, 20) });
                    return null;
                }
                S.logger?.debug('ai', 'batch:normalize:start', `Normalizing Q${idx}`, { 
                    ansKeys: Object.keys(ans || {}),
                    questionHash: qr.questionHash?.slice(0, 20),
                    choiceCount: qr.choiceTexts?.length 
                });
                const normalized = normalizeAiAnswer(ans, qr.questionHash, qr.choiceTexts, provider);
                if (!normalized) {
                    S.logger?.warn('ai', 'batch:item-fail', `Failed to normalize answer ${idx}`, { ans: JSON.stringify(ans).slice(0, 300), choices: qr.choiceTexts });
                } else {
                    S.logger?.debug('ai', 'batch:item-success', `Successfully normalized Q${idx}`, { selectedIndex: normalized.selectedIndex, confidence: normalized.confidence });
                }
                return normalized;
            });

            const refinedResults = await refineRiskyBatchAnswers(questionRecords, results, provider, key);
            const validCount = refinedResults.filter(Boolean).length;
            S.logger?.info('ai', 'batch:result', `Normalized ${validCount}/${questionRecords.length} answers successfully`);

            const selectedIndexCounts = {};
            refinedResults.filter(Boolean).forEach(record => {
                const keyName = Number.isInteger(record.selectedIndex) ? String(record.selectedIndex) : 'null';
                selectedIndexCounts[keyName] = (selectedIndexCounts[keyName] || 0) + 1;
            });
            S.logger?.info('ai', 'batch:distribution', 'Selected index distribution', {
                total: validCount,
                distribution: selectedIndexCounts,
            });

            const maxBucket = Math.max(0, ...Object.values(selectedIndexCounts));
            if (validCount >= 5 && maxBucket >= Math.ceil(validCount * 0.8)) {
                S.logger?.warn('ai', 'batch:suspicious', 'Batch answers are heavily concentrated at one index', {
                    distribution: selectedIndexCounts,
                });
            }

            return validCount > 0 ? refinedResults : null;
        } catch (error) {
            S.logger?.warn('ai', 'request:failed', error.message, { provider, batchCount: questionRecords.length });
            if (isPermanentAiError(error.message)) {
                handlePermanentAiFailure(provider, key, error.message);
            } else if (isTemporaryAiThrottle(error.message)) {
                handleTemporaryAiThrottle(provider, key, error.message);
                // Try fallback on rate limit
                const fallback = getFallbackProviderConfig(provider);
                if (fallback) {
                    S.logger?.info('ai', 'fallback:rate-limit', `Trying ${fallback.provider} for batch after ${provider} rate limited`);
                    return resolveBatchWithProvider(fallback.provider, fallback.key, questionRecords);
                }
            } else {
                S.ui?.toast?.(`Lỗi phân tích: ${error.message}`, 'error', 4500);
            }
            return null;
        }
    }


    // -- network/bridge.js --
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


    // -- ui/css.js --
    const CSS = `
    :host{all:initial;color-scheme:dark;-webkit-font-smoothing:antialiased}
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    button,input,select{font:inherit}

    .scene{position:fixed;top:16px;right:16px;width:300px;perspective:900px;z-index:2147483647}
    .scene.is-dragging{user-select:none}
    .scene.docked{top:auto!important;right:16px!important;bottom:16px!important;left:auto!important;width:auto;perspective:none}
    .card{width:300px;position:relative;transform-style:preserve-3d;transition:transform 0.55s cubic-bezier(.4,0,.2,1)}
    .card.flipped{transform:rotateY(180deg)}
    .scene.docked .card{display:none}
    .face{
      width:300px;background:#0D0D10;
      border-radius:14px;border:.5px solid rgba(255,255,255,.07);
      overflow:hidden;backface-visibility:hidden;-webkit-backface-visibility:hidden;
      font-family:'JetBrains Mono',monospace;transition:border-radius .3s
    }
    .face.back{position:absolute;top:0;left:0;transform:rotateY(180deg)}

    .titlebar{display:flex;align-items:center;padding:10px 13px;border-bottom:.5px solid rgba(255,255,255,.05);cursor:grab}
    .titlebar:active{cursor:grabbing}
    .dots{display:flex;gap:6px}
    .dot{width:11px;height:11px;border-radius:50%;cursor:pointer;flex-shrink:0;transition:filter .15s,opacity .15s;position:relative}
    .dot:hover{filter:brightness(1.35)}
    .dot.r{background:#FF5F57}
    .dot.y{background:#FEBC2E}
    .dot.g{background:#28C840}
    .dot.g.glow{animation:gpulse 2s ease-in-out infinite}
    @keyframes gpulse{0%,100%{box-shadow:0 0 0 0 rgba(40,200,64,.55)}50%{box-shadow:0 0 0 5px rgba(40,200,64,0)}}
    .dot.r::after,.dot.y::after,.dot.g::after{content:'';position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .15s;border-radius:50%}
    .dot.r:hover::after{content:'×';font-size:9px;color:rgba(0,0,0,.6);opacity:1}
    .dot.y:hover::after{content:'−';font-size:9px;color:rgba(0,0,0,.6);opacity:1}
    .dot.g:hover::after{content:'▶';font-size:6px;color:rgba(0,0,0,.6);opacity:1}

    .ptitle{flex:1;text-align:center;font-size:11.5px;font-weight:500;color:rgba(255,255,255,.34);letter-spacing:.09em}
    .gear-btn{background:none;border:none;cursor:pointer;padding:2px;display:flex;align-items:center;color:rgba(255,255,255,.28);transition:color .15s}
    .gear-btn:hover{color:rgba(255,255,255,.65)}

    .collapsible{transition:max-height .35s cubic-bezier(.4,0,.2,1),opacity .3s;overflow:hidden}
    .collapsible.collapsed{max-height:0!important;opacity:0;pointer-events:none}

    .log-wrap{padding:11px 13px;min-height:105px;display:flex;flex-direction:column;max-height:200px;overflow:hidden}
    .log-line{display:flex;align-items:baseline;gap:6px;font-family:'JetBrains Mono',monospace;font-size:11px;line-height:1.85;opacity:0;transform:translateY(3px);transition:opacity .2s,transform .2s}
    .log-line.vis{opacity:1;transform:none}
    .log-line.dim{opacity:.18}
    .lt{flex-shrink:0;width:13px;text-align:center;font-size:11px}
    .lt.ok{color:#28C840}.lt.spin{color:#FEBC2E}.lt.err{color:#FF5F57}.lt.d{color:rgba(255,255,255,.15)}
    .lm{color:rgba(255,255,255,.68);font-size:11px}
    .lm.hi{color:rgba(255,255,255,.82)}
    .lm.lo{color:rgba(255,255,255,.34)}

    .sep{height:.5px;background:rgba(255,255,255,.05);margin:0 13px}
    .footer{display:flex;align-items:center;justify-content:space-between;padding:8px 13px 11px}
    .status-left{display:flex;align-items:center;gap:7px}

    .live-dot{width:5px;height:5px;border-radius:50%;flex-shrink:0;transition:background .3s}
    .live-dot.idle{background:#252525}
    .live-dot.running{background:#FEBC2E;animation:lp .9s ease-in-out infinite}
    .live-dot.done{background:#28C840;animation:lp 2.2s ease-in-out infinite}
    @keyframes lp{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.2;transform:scale(.6)}}

    .slabel{font-size:10.5px;color:rgba(255,255,255,.34);transition:color .3s;letter-spacing:.03em}
    .slabel.running{color:rgba(254,188,46,.72)}
    .slabel.done{color:rgba(40,200,64,.72)}

    .toggle-row{display:flex;align-items:center;gap:7px}
    .tlabel{font-size:11px;color:rgba(255,255,255,.52)}
    .tog{width:30px;height:17px;border-radius:9px;background:#1a1a1a;border:.5px solid rgba(255,255,255,.08);cursor:pointer;position:relative;transition:background .2s,border-color .2s}
    .tog.on{background:#172e1a;border-color:rgba(40,200,64,.25)}
    .tog-thumb{position:absolute;top:2.5px;left:2.5px;width:12px;height:12px;border-radius:50%;background:#383838;transition:transform .2s,background .2s}
    .tog.on .tog-thumb{transform:translateX(13px);background:#28C840}

    .back-body{padding:14px 13px 13px}
    .section-label{font-size:10px;font-weight:500;color:rgba(255,255,255,.44);letter-spacing:.1em;margin-bottom:10px}
    .api-block{margin-bottom:10px}
    .api-provider{display:flex;align-items:center;gap:6px;margin-bottom:5px}
    .pdot{width:5px;height:5px;border-radius:50%;flex-shrink:0}
    .pdot.or{background:#7C5CFC}
    .pdot.gr{background:#F55036}
    .pname{font-size:11px;color:rgba(255,255,255,.56);font-weight:500;letter-spacing:.04em}
    .api-row{display:flex;gap:6px;align-items:center}
    .api-input{flex:1;background:#0a0a0d;border:.5px solid rgba(255,255,255,.08);border-radius:6px;padding:7px 9px;color:rgba(255,255,255,.72);font-size:11px;font-family:'JetBrains Mono',monospace;outline:none;transition:border-color .15s;min-width:0}
    .api-input:focus{border-color:rgba(255,255,255,.22)}
    .api-input::placeholder{color:rgba(255,255,255,.12)}
    .eye-btn{background:#0a0a0d;border:.5px solid rgba(255,255,255,.08);border-radius:6px;cursor:pointer;padding:6px 8px;color:rgba(255,255,255,.22);transition:all .15s;flex-shrink:0;display:flex;align-items:center}
    .eye-btn:hover{border-color:rgba(255,255,255,.18);color:rgba(255,255,255,.55)}
    .divline{height:.5px;background:rgba(255,255,255,.04);margin:10px 0}
    .save-btn{width:100%;background:#172e1a;border:.5px solid rgba(40,200,64,.2);border-radius:7px;padding:8px;color:rgba(40,200,64,.75);font-size:11.5px;font-family:'JetBrains Mono',monospace;font-weight:500;cursor:pointer;transition:all .15s;letter-spacing:.04em}
    .save-btn:hover{background:#1d3820;border-color:rgba(40,200,64,.4);color:#28C840}
    .saved-hint{text-align:center;font-size:10.5px;color:rgba(40,200,64,.72);margin-top:7px;opacity:0;transition:opacity .25s;height:16px}
    .back-footer{display:flex;align-items:center;justify-content:space-between;margin-top:11px;padding-top:10px;border-top:.5px solid rgba(255,255,255,.04)}
    .back-btn{background:none;border:none;cursor:pointer;font-size:11px;color:rgba(255,255,255,.44);font-family:'JetBrains Mono',monospace;display:flex;align-items:center;gap:4px;padding:0;transition:color .15s}
    .back-btn:hover{color:rgba(255,255,255,.5)}
    .key-links{display:flex;gap:10px;align-items:center}
    .klink{font-size:10.5px;color:rgba(255,255,255,.44);text-decoration:none;display:flex;align-items:center;gap:3px;transition:color .15s}
    .klink:hover{color:rgba(255,255,255,.45)}

    .mini-dock{display:none;align-items:center;gap:7px;padding:8px 12px;border-radius:999px;background:#0D0D10;border:.5px solid rgba(255,255,255,.08);color:rgba(255,255,255,.78);font-family:'JetBrains Mono',monospace;font-size:11px;cursor:pointer;box-shadow:0 8px 18px rgba(0,0,0,.35);transition:transform .15s,box-shadow .15s,color .15s,border-color .15s}
    .mini-dock:hover{transform:translateY(-1px);border-color:rgba(255,255,255,.2);color:rgba(255,255,255,.9)}
    .mini-dock:active{transform:translateY(0)}
    .mini-dot{width:6px;height:6px;border-radius:50%;background:#FF5F57;box-shadow:0 0 6px rgba(255,95,87,.6)}
    .mini-label{letter-spacing:.08em}
    .scene.docked .mini-dock{display:flex}

    @media (max-width:420px){
      .scene{right:8px;left:8px;width:auto}
      .card,.face{width:100%}
    }
    `;



    // -- ui/html.js --
    const HTML = `
    <div class="scene" id="P">
      <div class="card" id="card">
        <div class="face front" id="frontFace">
          <div class="titlebar" id="H">
            <div class="dots">
              <div class="dot r" id="dotR" title="Ẩn panel"></div>
              <div class="dot y" id="dotY" title="Thu gọn"></div>
              <div class="dot g glow" id="dotG" title="Chạy"></div>
            </div>
            <div class="ptitle">LMSX</div>
            <button class="gear-btn" id="flipBtn" title="Cài đặt">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" stroke="currentColor" stroke-width="1.2"/>
                <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
              </svg>
            </button>
          </div>

          <div class="collapsible" id="logSection" style="max-height:200px">
            <div class="log-wrap" id="logWrap">
              <div class="log-line vis">
                <span class="lt d">·</span>
                <span class="lm lo" id="status-note">Chờ câu hỏi...</span>
              </div>
            </div>
          </div>

          <div class="sep" id="sepEl"></div>
          <div class="footer" id="footerEl">
            <div class="status-left">
              <div class="live-dot idle" id="liveDot"></div>
              <span class="slabel" id="slabel">idle</span>
            </div>
            <div class="toggle-row">
              <span class="tlabel">Auto</span>
              <div class="tog on" id="tog"><div class="tog-thumb"></div></div>
            </div>
          </div>
        </div>

        <div class="face back">
          <div class="titlebar">
            <div class="dots">
              <div class="dot r"></div>
              <div class="dot y"></div>
              <div class="dot g"></div>
            </div>
            <div class="ptitle">Cài đặt</div>
            <div style="width:17px"></div>
          </div>

          <div class="back-body">
            <div class="section-label">API KEYS</div>

            <div class="api-block">
              <div class="api-provider">
                <div class="pdot or"></div>
                <span class="pname">OpenRouter</span>
              </div>
              <div class="api-row">
                <input class="api-input" id="orInput" type="password" placeholder="sk-or-v1-..." spellcheck="false" autocomplete="off"/>
                <button class="eye-btn" data-t="orInput" title="Hiện/Ẩn key">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" stroke-width="1.2"/>
                    <circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.2"/>
                  </svg>
                </button>
              </div>
            </div>

            <div class="api-block">
              <div class="api-provider">
                <div class="pdot gr"></div>
                <span class="pname">Groq</span>
              </div>
              <div class="api-row">
                <input class="api-input" id="grInput" type="password" placeholder="gsk_..." spellcheck="false" autocomplete="off"/>
                <button class="eye-btn" data-t="grInput" title="Hiện/Ẩn key">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" stroke-width="1.2"/>
                    <circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.2"/>
                  </svg>
                </button>
              </div>
            </div>

            <div class="divline"></div>
            <button class="save-btn" id="saveBtn">Lưu cài đặt</button>
            <div class="saved-hint" id="savedHint">✓ Đã lưu</div>

            <div class="back-footer">
              <button class="back-btn" id="backBtn">
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <path d="M7 2L3 6l4 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Quay lại
              </button>
              <div class="key-links">
                <a class="klink" href="https://openrouter.ai/keys" target="_blank">
                  <div class="pdot or"></div>OR key
                  <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M2 8L8 2M8 2H4M8 2v4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
                </a>
                <a class="klink" href="https://console.groq.com/keys" target="_blank">
                  <div class="pdot gr"></div>Groq key
                  <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M2 8L8 2M8 2H4M8 2v4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
      <button class="mini-dock" id="miniDock" title="Mở lại LMSX">
        <span class="mini-dot"></span>
        <span class="mini-label">LMSX</span>
      </button>
    </div>
    `;


    // -- ui/panel.js --
    function buildUI() {
        const host = document.createElement('div');
        host.id = '__lmsx_root__';
        host.style.cssText = 'position:fixed!important;top:0!important;left:0!important;width:0!important;height:0!important;overflow:visible!important;z-index:2147483647!important;';
        S.shadow = host.attachShadow({ mode: 'closed' });

        const style = document.createElement('style');
        const fontUrl = globalThis.chrome?.runtime?.getURL?.('assets/fonts/JetBrainsMono-Regular.woff2') || '';
        const fontFace = fontUrl
            ? `@font-face{font-family:'JetBrains Mono';src:url('${fontUrl}') format('woff2');font-weight:400;font-style:normal;font-display:swap;}`
            : '';
        style.textContent = `${fontFace}\n${CSS}`;
        S.shadow.appendChild(style);

        const wrapper = document.createElement('div');
        wrapper.innerHTML = HTML;
        while (wrapper.firstChild) S.shadow.appendChild(wrapper.firstChild);

        document.documentElement.appendChild(host);
        return S.shadow;
    }

    function initPanel(root) {
        const $ = id => root.getElementById(id);
        const panel = $('P');
        if (!panel) return;
        const ids = {
            card: $('card'),
            miniDock: $('miniDock'),
            logSection: $('logSection'),
            logWrap: $('logWrap'),
            statusNote: $('status-note'),
            sepEl: $('sepEl'),
            footerEl: $('footerEl'),
            liveDot: $('liveDot'),
            slabel: $('slabel'),
            toggle: $('tog'),
            orInput: $('orInput'),
            grInput: $('grInput'),
            saveBtn: $('saveBtn'),
            savedHint: $('savedHint'),
        };

        let dragging = false;
        let sx = 0;
        let sy = 0;
        let sl = 0;
        let st = 0;
        let collapsed = false;
        let hidden = false;

        function setDockedState(nextHidden, persist = true) {
            hidden = nextHidden === true;
            panel.classList.toggle('docked', hidden);
            if (persist) {
                updateUiPrefs({ panel: { minimized: hidden, closed: false } });
            }
        }

        function applyPanelPrefs() {
            const prefs = S.uiPrefs.panel;
            const width = clamp(Number(prefs.width) || 300, 300, 300);
            const top = Number.isFinite(prefs.top) ? prefs.top : 16;
            setDockedState(prefs.minimized === true, false);
            panel.style.width = `${width}px`;
            panel.style.top = `${top}px`;
            if (prefs.left !== null && prefs.left !== undefined) {
                panel.style.left = `${prefs.left}px`;
                panel.style.right = 'auto';
            } else {
                panel.style.right = '16px';
                panel.style.left = 'auto';
            }
        }

        function clampPanel() {
            const rect = panel.getBoundingClientRect();
            const nextLeft = clamp(rect.left, 0, Math.max(0, window.innerWidth - rect.width));
            const nextTop = clamp(rect.top, 0, Math.max(0, window.innerHeight - rect.height));
            panel.style.left = `${nextLeft}px`;
            panel.style.top = `${nextTop}px`;
            panel.style.right = 'auto';
            updateUiPrefs({ panel: { left: nextLeft, top: nextTop, width: rect.width, height: rect.height, minimized: false, closed: false } });
        }

        function startDragging(event) {
            if (event.target.closest('.dots') || event.target.closest('button') || event.target.closest('a') || event.target.closest('input')) return;
            event.preventDefault();
            dragging = true;
            panel.classList.add('is-dragging');
            const rect = panel.getBoundingClientRect();
            sl = rect.left;
            st = rect.top;
            sx = event.clientX;
            sy = event.clientY;
        }

        panel.querySelectorAll('.titlebar').forEach(node => {
            node.addEventListener('mousedown', startDragging);
        });

        document.addEventListener('mousemove', event => {
            if (!dragging) return;
            const nextLeft = clamp(sl + (event.clientX - sx), 0, Math.max(0, window.innerWidth - panel.offsetWidth));
            const nextTop = clamp(st + (event.clientY - sy), 0, Math.max(0, window.innerHeight - panel.offsetHeight));
            panel.style.left = `${nextLeft}px`;
            panel.style.top = `${nextTop}px`;
            panel.style.right = 'auto';
        });
        document.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            panel.classList.remove('is-dragging');
            clampPanel();
        });

        function setStatus(state, label) {
            if (ids.liveDot) ids.liveDot.className = `live-dot ${state}`;
            if (ids.slabel) {
                ids.slabel.className = `slabel ${state}`;
                ids.slabel.textContent = label || state;
            }
        }

        function logTypeFromLevel(level) {
            if (level === 'error') return 'err';
            if (level === 'warn') return 'spin';
            if (level === 'info') return 'ok';
            return 'd';
        }

        function mapToPhaseLog(entry) {
            if (!entry || typeof entry !== 'object') return null;
            const moduleName = String(entry.module || '');
            const eventName = String(entry.event || '');
            const level = String(entry.level || '');
            const detail = sanitizePanelMessage(entry.detail || '');

            if (moduleName === 'quiz' && eventName === 'payload:summary') {
                return { type: 'spin', text: 'Đọc câu hỏi...' };
            }
            if (moduleName === 'quiz' && (eventName === 'payload:text' || eventName === 'payload:full')) {
                return { type: 'ok', text: 'Scrape xong' };
            }
            if (moduleName === 'ai' && (eventName === 'request' || eventName.startsWith('batch:prompt') || eventName.startsWith('batch:input'))) {
                return { type: 'spin', text: 'Gọi AI...' };
            }
            if (moduleName === 'ai' && (eventName === 'batch:parsed' || eventName === 'batch:result')) {
                return { type: 'ok', text: 'Nhận phản hồi' };
            }
            if (moduleName === 'quiz' && eventName === 'apply:start') {
                return { type: 'spin', text: 'Đang điền đáp án...' };
            }
            if (moduleName === 'quiz' && eventName === 'submit') {
                return { type: 'ok', text: 'Xong' };
            }
            if (moduleName === 'video' && eventName === 'play:start') {
                return { type: 'spin', text: 'Đang chạy video x4...' };
            }
            if (moduleName === 'video' && eventName === 'play:done') {
                return { type: 'ok', text: 'Video xong' };
            }

            if (moduleName === 'ui' && eventName === 'toast' && detail) {
                return { type: level === 'error' ? 'err' : level === 'warn' ? 'spin' : 'ok', text: detail };
            }

            if ((level === 'warn' || level === 'error') && detail) {
                return { type: level === 'error' ? 'err' : 'spin', text: detail };
            }

            return null;
        }

        function sanitizePanelMessage(value) {
            const text = String(value || '').replace(/\s+/g, ' ').trim();
            if (!text) return '';
            if (/^selected answers before submit/i.test(text)) return '';
            return text.length > 120 ? `${text.slice(0, 117)}...` : text;
        }

        function deriveRuntimePhaseLog() {
            const state = String(S.runtime?.state || '');
            const lastAction = String(S.runtime?.lastAction || '').toLowerCase();
            const stateDetail = String(S.runtime?.stateMeta?.detail || '').toLowerCase();
            const running = S.runtime?.active && state !== 'paused';
            const caps = S.runtime?.capabilities || {};
            const isQuizStart = caps?.quizStart?.matched;
            const isQuizActive = caps?.quiz?.matched;

            // Trang mới / chưa bắt đầu quiz: không hiển thị pha quiz cũ
            if (state === 'idle' || state === 'detecting-page' || isQuizStart) {
                if (running) return { type: 'spin', text: 'Đang quét trang...' };
                return { type: 'ok', text: 'Sẵn sàng' };
            }

            if (state === 'completed') return { type: 'ok', text: 'Xong' };
            if (state === 'running-video') return { type: 'spin', text: 'Đang chạy video x4...' };
            if (state === 'waiting-ai') return { type: 'spin', text: 'Gọi AI...' };

            // Chỉ hiện pha quiz khi đang thực sự trong quiz
            if (state === 'running-quiz' && isQuizActive) {
                if (stateDetail.includes('tìm nút nộp')) {
                    return { type: 'spin', text: 'Đang tìm nút nộp bài...' };
                }
                if (stateDetail.includes('chờ phản hồi') || stateDetail.includes('đã nộp')) {
                    return { type: 'spin', text: 'Đã nộp bài, chờ phản hồi...' };
                }
                if (lastAction.includes('điền') || lastAction.includes('áp án')) {
                    return { type: 'spin', text: 'Đang điền đáp án...' };
                }
            }

            if (running && (state === 'ready' || state === 'running-quiz')) {
                return { type: 'spin', text: 'Đang quét trang...' };
            }
            return null;
        }

        function renderLogList() {
            if (!ids.logWrap) return;
            const runtimeLogs = S.runtime.logs || [];
            const phaseLogs = [];
            runtimeLogs.forEach(entry => {
                const mapped = mapToPhaseLog(entry);
                if (!mapped) return;
                const prev = phaseLogs[phaseLogs.length - 1];
                if (prev && prev.text === mapped.text) return;
                phaseLogs.push(mapped);
            });

            const runtimePhase = deriveRuntimePhaseLog();
            if (runtimePhase) {
                const prev = phaseLogs[phaseLogs.length - 1];
                if (!prev || prev.text !== runtimePhase.text) phaseLogs.push(runtimePhase);
            }

            const logs = phaseLogs.slice(-6);
            ids.logWrap.innerHTML = '';
            if (!logs.length) {
                const line = document.createElement('div');
                line.className = 'log-line vis';
                line.innerHTML = `<span class="lt d">·</span><span class="lm lo">${escapeHtml(S.runtime.lastAction || 'Chờ câu hỏi...')}</span>`;
                ids.logWrap.appendChild(line);
                return;
            }

            logs.forEach((entry, index) => {
                const line = document.createElement('div');
                const text = escapeHtml(entry.text || '...');
                const type = entry.type || logTypeFromLevel(entry.level);
                const isLatest = index === logs.length - 1;
                line.className = `log-line vis${isLatest ? '' : ' dim'}`;
                line.innerHTML = `<span class="lt ${type}">${type === 'err' ? '✕' : type === 'ok' ? '✓' : type === 'spin' ? '›' : '·'}</span><span class="lm${isLatest ? ' hi' : ''}">${text}</span>`;
                ids.logWrap.appendChild(line);
            });
        }

        function syncStatus() {
            const running = S.runtime.active && S.runtime.state !== 'paused';
            const done = S.runtime.state === 'completed';
            if (done) setStatus('done', 'done');
            else if (running) setStatus('running', 'running');
            else setStatus('idle', 'idle');

            if (ids.statusNote) ids.statusNote.textContent = S.runtime.lastAction || 'Chờ câu hỏi...';
            renderLogList();
        }

        function showSavedHint(message = '✓ Đã lưu') {
            if (!ids.savedHint) return;
            ids.savedHint.textContent = message;
            ids.savedHint.style.opacity = '1';
            setManagedTimeout(() => {
                ids.savedHint.style.opacity = '0';
                setManagedTimeout(() => ids.card?.classList.remove('flipped'), 320);
            }, 1100);
        }

        function getChromeStorage() {
            return globalThis.chrome?.storage?.sync || null;
        }

        function chromeSyncGet(keys) {
            const storage = getChromeStorage();
            if (!storage) return Promise.resolve({});
            return new Promise(resolve => {
                storage.get(keys, result => resolve(result || {}));
            });
        }

        function chromeSyncSet(payload) {
            const storage = getChromeStorage();
            if (!storage) return Promise.resolve();
            return new Promise(resolve => {
                storage.set(payload, () => resolve());
            });
        }

        async function loadKeys() {
            const result = await chromeSyncGet(['lmsx_or_key', 'lmsx_gr_key', 'lmsx_model']);
            const nextOr = sanitizeAiKeyInput(result.lmsx_or_key || S.settings.ai.keys.openrouter || '');
            const nextGr = sanitizeAiKeyInput(result.lmsx_gr_key || S.settings.ai.keys.groq || '');
            const nextModel = normalizeProvider(result.lmsx_model || S.settings.ai.provider || 'groq');
            const preferred = nextModel === 'openrouter' || nextModel === 'groq' ? nextModel : S.settings.ai.provider;

            if (ids.orInput) ids.orInput.value = nextOr;
            if (ids.grInput) ids.grInput.value = nextGr;

            const changed = nextOr !== S.settings.ai.keys.openrouter || nextGr !== S.settings.ai.keys.groq || preferred !== S.settings.ai.provider;
            S.settings.ai.keys.openrouter = nextOr;
            S.settings.ai.keys.groq = nextGr;
            S.settings.ai.provider = preferred;
            S.runtime._draftAiKey = sanitizeAiKeyInput(S.settings.ai.keys[S.settings.ai.provider] || '');
            if (changed) await S.storage.saveSettings(S.settings);
        }

        function resolveProviderForRun() {
            const current = normalizeProvider(S.settings.ai.provider);
            const hasCurrent = !!sanitizeAiKeyInput(S.settings.ai.keys[current] || '');
            if (hasCurrent) return current;
            const hasGroq = !!sanitizeAiKeyInput(S.settings.ai.keys.groq || '');
            const hasOr = !!sanitizeAiKeyInput(S.settings.ai.keys.openrouter || '');
            if (hasGroq) return 'groq';
            if (hasOr) return 'openrouter';
            return current;
        }

        async function saveKeys() {
            const orVal = sanitizeAiKeyInput(ids.orInput?.value || '');
            const grVal = sanitizeAiKeyInput(ids.grInput?.value || '');

            if (orVal && !isLikelyApiKey('openrouter', orVal)) {
                showSavedHint('✕ OR key sai định dạng');
                return;
            }
            if (grVal && !isLikelyApiKey('groq', grVal)) {
                showSavedHint('✕ Groq key sai định dạng');
                return;
            }

            S.settings.ai.keys.openrouter = orVal;
            S.settings.ai.keys.groq = grVal;
            S.settings.ai.provider = resolveProviderForRun();
            S.runtime._draftAiKey = sanitizeAiKeyInput(S.settings.ai.keys[S.settings.ai.provider] || '');
            delete S.runtime._aiBlocked;
            await S.storage.saveSettings(S.settings);

            await chromeSyncSet({
                lmsx_or_key: orVal,
                lmsx_gr_key: grVal,
                lmsx_model: S.settings.ai.provider,
            });
            showSavedHint('✓ Đã lưu');
        }

        async function toggleRun() {
            if (hidden) {
                setDockedState(false);
                ids.logSection?.classList.remove('collapsed');
                if (ids.sepEl) ids.sepEl.style.display = '';
                if (ids.footerEl) ids.footerEl.style.cssText = '';
            }
            if (collapsed) {
                collapsed = false;
                ids.logSection?.classList.remove('collapsed');
            }

            if (S.runtime.active && S.runtime.state !== 'paused') {
                stopAutomation('panel:dotG');
                return;
            }

            S.settings.ai.provider = resolveProviderForRun();
            S.runtime._draftAiKey = sanitizeAiKeyInput(S.settings.ai.keys[S.settings.ai.provider] || '');
            await S.storage.saveSettings(S.settings);
            startAutomation('panel:dotG');
        }

        $('dotR')?.addEventListener('click', () => {
            setDockedState(!hidden);
            if (hidden) {
                ids.logSection?.classList.add('collapsed');
                if (ids.sepEl) ids.sepEl.style.display = 'none';
                if (ids.footerEl) {
                    ids.footerEl.style.cssText = 'max-height:0;opacity:0;overflow:hidden;padding:0;pointer-events:none;transition:max-height .3s,opacity .3s,padding .3s';
                }
                return;
            }
            if (ids.sepEl) ids.sepEl.style.display = '';
            if (ids.footerEl) ids.footerEl.style.cssText = '';
            if (!collapsed) ids.logSection?.classList.remove('collapsed');
        });

        ids.miniDock?.addEventListener('click', () => {
            setDockedState(false);
            if (ids.sepEl) ids.sepEl.style.display = '';
            if (ids.footerEl) ids.footerEl.style.cssText = '';
            if (!collapsed) ids.logSection?.classList.remove('collapsed');
        });

        $('dotY')?.addEventListener('click', () => {
            if (hidden) return;
            collapsed = !collapsed;
            ids.logSection?.classList.toggle('collapsed', collapsed);
        });

        $('dotG')?.addEventListener('click', () => { toggleRun(); });
        ids.toggle?.addEventListener('click', async () => {
            const nextAuto = !(S.settings.automation.autoSubmitQuiz !== false);
            S.settings.automation.autoSubmitQuiz = nextAuto;
            await S.storage.saveSettings(S.settings);
            ids.toggle.classList.toggle('on', nextAuto);
        });

        $('flipBtn')?.addEventListener('click', () => ids.card?.classList.add('flipped'));
        $('backBtn')?.addEventListener('click', () => ids.card?.classList.remove('flipped'));

        panel.querySelectorAll('.eye-btn').forEach(button => {
            button.addEventListener('click', () => {
                const target = $(button.dataset.t);
                if (!target) return;
                target.type = target.type === 'password' ? 'text' : 'password';
            });
        });

        ids.saveBtn?.addEventListener('click', () => { saveKeys(); });

        function toast(message, type = 'info') {
            S.runtime.lastAction = message;
            S.runtime.logs.push({ level: type, module: 'ui', event: 'toast', detail: message, timestamp: nowTs() });
            S.runtime.logs = S.runtime.logs.slice(-40);
            syncStatus();
        }

        function sync() {
            if (!S.settings || !S.runtime || !S.uiPrefs) return;
            applyPanelPrefs();
            if (ids.toggle) ids.toggle.classList.toggle('on', S.settings.automation.autoSubmitQuiz !== false);
            syncStatus();
        }

        function pushLog() {
            syncStatus();
        }

        S.ui = {
            toast,
            pushLog,
            sync,
            setProgress(progress) {
                S.runtime.progress = progress;
                syncStatus();
            },
        };

        applyPanelPrefs();
        loadKeys().finally(() => {
            sync();
        });

        addCleanup(() => {
            panel.remove();
        });
    }



    // -- automation/video.js --
    class VideoCtrl {
        constructor() {
            this.video = null;
            this.timer = null;
            this.completeHandler = null;
            this._ended = false;
            this._onEnded = () => this.finish('ended');
        }

        attach(match) {
            const nextVideo = match?.node || detectVideoCapability().node;
            if (this.video === nextVideo) return this.video;
            this.stop();
            this.video = nextVideo || null;
            this._ended = false;
            if (this.video) this.video.addEventListener('ended', this._onEnded, { once: true });
            return this.video;
        }

        async autoPlay() {
            const video = this.attach(detectVideoCapability());
            if (!video) return false;
            const speed = 4;
            
            try {
                await video.play();
            } catch (error) {
                S.logger?.warn('video', 'play:blocked', error?.message || 'video.play blocked');
                return false;
            }

            // Wait 2s for player to initialize, then force x4
            await sleep(2000);
            
            // Force speed
            video.playbackRate = speed;
            this.forceCustomPlayerSpeed(speed);

            this.timer = setInterval(() => this.tick(speed), 400);
            S.timers.add(this.timer);
            S.logger?.info('video', 'play:start', `Video autoplay x${speed}`);
            return true;
        }

        forceCustomPlayerSpeed(speed) {
            // Try Plyr API first
            const plyrContainer = document.querySelector('.plyr');
            if (plyrContainer) {
                // Try to access Plyr instance
                const plyrInstance = plyrContainer.plyr || window.plyr || (window.Plyr && window.Plyr.get && window.Plyr.get(plyrContainer));
                if (plyrInstance && plyrInstance.speed) {
                    plyrInstance.speed = speed;
                    return;
                }
            }
            
            // Click speed menu then select 4x
            const speedBtn = document.querySelector('button[data-plyr="speed"], .plyr__controls button[aria-label*="speed" i], .plyr button[title*="speed" i]');
            if (speedBtn) {
                speedBtn.click();
                setTimeout(() => {
                    // Find 4x option in the opened menu
                    const menuItems = document.querySelectorAll('.plyr__menu__container [role="menuitem"], .plyr__menu [role="menuitem"], [data-plyr="speed"] + * [role="menuitem"]');
                    for (const item of menuItems) {
                        if (item.textContent?.includes('4') || item.getAttribute('data-value') === '4') {
                            item.click();
                            break;
                        }
                    }
                }, 150);
                return;
            }
            
            // Handle video.js
            const vjs = document.querySelector('.video-js');
            if (vjs && vjs.player) vjs.player.playbackRate(speed);
            
            // Generic speed buttons
            document.querySelectorAll('[data-speed], [class*="speed"]').forEach(el => {
                if (el.textContent?.includes('4') || el.getAttribute('data-speed') === '4') {
                    el.click();
                }
            });
        }

        tick(speed) {
            if (!this.video || !S.runtime.active || S.runtime.state === 'paused') {
                this.stop();
                return;
            }
            if (this.video.playbackRate !== speed) this.video.playbackRate = speed;
            if (this.video.paused) this.video.play().catch(() => {});
            const duration = this.video.duration;
            const current = this.video.currentTime;
            if (!duration || Number.isNaN(duration)) return;
            const percent = clamp(Math.round((current / duration) * 100), 0, 100);
            setLastAction(`Video x${speed} • ${percent}%`);
            if ((current / duration) >= 0.98 || (duration - current) <= 1) this.finish('threshold');
        }

        onComplete(callback) {
            this.completeHandler = callback;
        }

        finish(reason) {
            if (this._ended) return;
            this._ended = true;
            this.stop();
            S.logger?.info('video', 'play:done', `Video complete (${reason})`);
            this.completeHandler?.(reason);
        }

        stop() {
            if (this.timer) {
                clearInterval(this.timer);
                S.timers.delete(this.timer);
                this.timer = null;
            }
            if (this.video) {
                try { this.video.removeEventListener('ended', this._onEnded, { once: true }); } catch {}
            }
        }
    }


    // -- automation/quiz.js --
    function getQuizRoot() {
        const caps = detectPageCapabilities(true);
        return caps.quiz?.node || null;
    }

    function collectQuizContainers(root = getQuizRoot()) {
        if (!root) return [];
        let scoped = [...root.querySelectorAll('[class*="Question"]:not([class*="QuestionList"])')];
        if (scoped.length) {
            return scoped.filter(el => !scoped.some(parent => parent !== el && parent.contains(el)));
        }
        if (root.matches?.('.xblock-problem')) return [...root.querySelectorAll('.choicegroup, .field')];
        scoped = [...root.querySelectorAll('[class*="OptionList"], .choicegroup, .field')];
        return scoped.filter(el => !scoped.some(parent => parent !== el && parent.contains(el)));
    }

    function collectOptionNodes(container) {
        let options = [...container.querySelectorAll('[role="button"][aria-pressed]')];
        if (!options.length) {
            options = [
                ...container.querySelectorAll(
                    'input[type="radio"], input[type="checkbox"], [class*="Option-sc"], [class*="Option"]:not([class*="OptionList"]), [class*="choice"], .ant-radio-wrapper, .ant-checkbox-wrapper'
                ),
            ];
        }
        const unique = [];
        const seen = new Set();
        for (const option of options) {
            if (!(option instanceof HTMLElement)) continue;
            if (seen.has(option)) continue;
            seen.add(option);
            unique.push(option);
        }
        return unique;
    }

    function getQuestionText(container) {
        const candidates = [...container.querySelectorAll('[class*="QuestionText"], [class*="question-text"], [class*="Prompt"], [class*="stem"], legend, .problem-header, h1, h2, h3, h4')];
        for (const node of candidates) {
            const text = normalizeText(node.textContent);
            if (text.length > 10) return text;
        }

        const clone = container.cloneNode(true);
        clone.querySelectorAll('input, button, label, [role="button"], [class*="Option"], [class*="choice"], .choicegroup').forEach(node => node.remove());
        const fallbackText = normalizeText(clone.textContent);
        if (fallbackText.length > 10) return fallbackText.slice(0, 320);

        return normalizeText(container.textContent).slice(0, 320);
    }

    function getChoiceText(option) {
        if (!(option instanceof HTMLElement)) return '';
        const directAria = normalizeText(option.getAttribute('aria-label') || '');
        if (directAria) return directAria;

        const nestedAriaNode = option.querySelector('[aria-label]');
        const nestedAria = normalizeText(nestedAriaNode?.getAttribute('aria-label') || '');
        if (nestedAria) return nestedAria;

        const fromLabel = option.querySelector('label') || option.closest('label');
        const fromLabelText = normalizeText(fromLabel?.innerText || fromLabel?.textContent || '');
        if (fromLabelText) return fromLabelText;

        if (option.matches('input')) {
            const byId = option.id && window.CSS?.escape ? document.querySelector(`label[for="${CSS.escape(option.id)}"]`) : null;
            const byIdText = normalizeText(byId?.innerText || byId?.textContent || '');
            if (byIdText) return byIdText;
            const roleBtn = option.closest('[role="button"]');
            const roleBtnAria = normalizeText(roleBtn?.getAttribute('aria-label') || roleBtn?.querySelector('[aria-label]')?.getAttribute('aria-label') || '');
            if (roleBtnAria) return roleBtnAria;
            const parentText = normalizeText(option.parentElement?.innerText || option.parentElement?.textContent || '');
            if (parentText) return parentText;
        }

        const fromInnerText = normalizeText(option.innerText || '');
        if (fromInnerText) return fromInnerText;

        return normalizeText(option.textContent || option.getAttribute('value') || option.getAttribute('title') || '');
    }

    function extractQuestionRecord(container, index) {
        const choiceNodes = collectOptionNodes(container);
        if (!choiceNodes.length) return null;
        const questionText = getQuestionText(container);
        const choiceTextsRaw = choiceNodes.map(getChoiceText);
        const nonEmptyChoices = choiceTextsRaw.filter(Boolean);
        let choiceTexts = choiceTextsRaw.map(text => text || '');

        if (nonEmptyChoices.length < Math.min(2, choiceNodes.length)) {
            const fallbackPool = [...container.querySelectorAll('[role="button"][aria-label], [role="button"] [aria-label], [class*="OptionContent"][aria-label], .ant-radio-wrapper, .ant-checkbox-wrapper')]
                .map(node => normalizeText(node.getAttribute?.('aria-label') || node.innerText || node.textContent || ''))
                .filter(Boolean);
            if (fallbackPool.length) {
                let fallbackCursor = 0;
                choiceTexts = choiceTexts.map(existing => {
                    if (existing) return existing;
                    const next = fallbackPool[fallbackCursor] || '';
                    fallbackCursor += 1;
                    return next;
                });
            }
        }

        choiceTexts = choiceTexts.filter(Boolean);
        const questionHash = makeQuestionHash(questionText, choiceTexts);
        const legacyHash = questionText.substring(0, 50).replace(/\s+/g, '_');
        return {
            index,
            container,
            questionText,
            choiceTexts,
            choiceNodes,
            questionHash,
            legacyHash,
        };
    }

    function buildQuizPayload() {
        const root = getQuizRoot();
        const questions = collectQuizContainers(root).map((container, index) => extractQuestionRecord(container, index)).filter(Boolean);
        return {
            schemaVersion: STORAGE_SCHEMA_VERSION,
            source: 'lmsx-export',
            exportedAt: nowTs(),
            url: location.href,
            provider: S.settings?.ai?.provider || 'gemini',
            questions: questions.map(question => ({
                questionHash: question.questionHash,
                legacyHash: question.legacyHash,
                questionText: question.questionText,
                choices: question.choiceTexts,
            })),
        };
    }

    function importAnswerSetFromText(rawText) {
        const parsed = safeJsonParse(rawText);
        const normalized = normalizeAnswerSet(parsed);
        if (!normalized) return { ok: false, error: 'JSON answers không hợp lệ' };
        normalized.answers = normalized.answers.map(answer => ({
            ...answer,
            confidence: answer.confidence || 0.95,
            source: answer.source || normalized.source || 'import',
        }));
        S.runtime.quiz.importedAnswerSet = normalized;
        S.runtime.quiz.lastPayload = S.runtime.quiz.lastPayload || buildQuizPayload();
        setLastAction(`Đã nạp ${normalized.answers.length} đáp án JSON`);
        persistRuntimeSoon();
        return { ok: true, count: normalized.answers.length };
    }

    function getImportedAnswerMap() {
        const imported = S.runtime.quiz.importedAnswerSet;
        if (!imported?.answers?.length) return new Map();
        return new Map(imported.answers.map(answer => [answer.questionHash, answer]));
    }

    function chooseIndexFromRecord(questionRecord, record) {
        if (!record) return null;
        if (Number.isInteger(record.selectedIndex) && record.selectedIndex >= 0 && record.selectedIndex < questionRecord.choiceNodes.length) return record.selectedIndex;
        if (record.selectedValue) {
            const normalized = normalizeText(record.selectedValue).toLowerCase();
            const exactIndex = questionRecord.choiceTexts.findIndex(choice => normalizeText(choice).toLowerCase() === normalized);
            if (exactIndex >= 0) return exactIndex;
            const containsIndex = questionRecord.choiceTexts.findIndex(choice => normalizeText(choice).toLowerCase().includes(normalized) || normalized.includes(normalizeText(choice).toLowerCase()));
            if (containsIndex >= 0) return containsIndex;
        }
        return null;
    }

    function findAnswerCandidate(questionRecord) {
        const importedMap = getImportedAnswerMap();
        const imported = importedMap.get(questionRecord.questionHash) || importedMap.get(questionRecord.legacyHash) || null;
        if (imported) {
            S.logger?.debug('quiz', 'candidate:found', `Found imported answer for Q${questionRecord.index}`, { hash: questionRecord.questionHash.slice(0, 20) });
            return imported;
        }
        const cached = S.cache[questionRecord.questionHash] || S.cache[questionRecord.legacyHash] || null;
        if (cached) {
            S.logger?.debug('quiz', 'candidate:cached', `Found cached answer for Q${questionRecord.index}`, { 
                hash: questionRecord.questionHash.slice(0, 20),
                hasVerified: cached.verifiedCorrect,
                confidence: cached.confidence,
                hasSelectedIndex: Number.isInteger(cached.selectedIndex)
            });
        } else {
            S.logger?.debug('quiz', 'candidate:miss', `No cache for Q${questionRecord.index}`, { 
                hash: questionRecord.questionHash.slice(0, 20),
                legacyHash: questionRecord.legacyHash,
                cacheKeys: Object.keys(S.cache).slice(0, 5)
            });
        }
        if (cached?.verifiedCorrect) return cached;
        return cached;
    }

    function getClickableNode(option) {
        if (!(option instanceof HTMLElement)) return null;
        if (option.matches('input')) return option.closest('label') || option;
        const buttonLike = option.closest('button, label, [role="button"]');
        return buttonLike || option;
    }

    async function clickAnswer(questionRecord, index) {
        const node = getClickableNode(questionRecord.choiceNodes[index]);
        if (!node) return false;
        node.scrollIntoView({ block: 'center', behavior: 'smooth' });
        await sleep(260);
        node.click();
        return true;
    }

    async function resolveAnswerForQuestion(questionRecord, options = {}) {
        const ignoreCache = options.ignoreCache === true;
        const candidate = ignoreCache ? null : findAnswerCandidate(questionRecord);
        const candidateIndex = chooseIndexFromRecord(questionRecord, candidate);
        if (candidate && candidateIndex !== null && (candidate.verifiedCorrect || candidate.confidence >= 0.45)) return { record: candidate, index: candidateIndex };

        if (S.runtime?.quiz?.skipAiForRun && !ignoreCache) return { record: candidate, index: candidateIndex };

        const aiRecord = await resolveAnswerViaAI(questionRecord);
        const aiIndex = chooseIndexFromRecord(questionRecord, aiRecord);
        if (aiRecord && aiIndex !== null && aiRecord.confidence >= 0.45) {
            S.cache[questionRecord.questionHash] = aiRecord;
            S.storage.saveCacheRecord(aiRecord);
            return { record: aiRecord, index: aiIndex };
        }
        return { record: candidate, index: candidateIndex };
    }

    function getSubmitCandidateScore(node) {
        if (!(node instanceof HTMLElement)) return -1;
        const text = normalizeText(node.textContent || node.getAttribute('aria-label') || '').toLowerCase();
        if (!text) return -1;
        if (/(làm lại|restart|retry)/.test(text)) return -1;
        if (/(nộp bài|nộp quiz|submit quiz|hoàn tất|finish)/.test(text)) return 100;
        if (/(nộp|submit|kiểm tra|check)/.test(text)) return 80;
        return -1;
    }

    function findQuizSubmitNodeFallback() {
        const root = getQuizRoot();
        const pools = [];
        if (root) pools.push(...root.querySelectorAll('button, [role="button"], input[type="submit"], .submit, [data-testid*="submit"]'));
        pools.push(...document.querySelectorAll('button, [role="button"], input[type="submit"], .submit, [data-testid*="submit"]'));

        let bestNode = null;
        let bestScore = -1;
        for (const node of pools) {
            if (!(node instanceof HTMLElement)) continue;
            if (node.matches('button:disabled, input:disabled')) continue;
            if (node.getAttribute('aria-disabled') === 'true') continue;
            const score = getSubmitCandidateScore(node);
            if (score <= bestScore) continue;
            bestNode = node;
            bestScore = score;
        }
        return bestNode;
    }

    async function submitQuizIfPossible() {
        const caps = detectPageCapabilities(true);
        const capabilityNode = caps.quizSubmit?.matched ? caps.quizSubmit.node : null;
        const submitNode = capabilityNode || findQuizSubmitNodeFallback();
        if (!submitNode) return { submitted: false, reason: 'submit-not-found' };
        submitNode.scrollIntoView({ block: 'center', behavior: 'smooth' });
        await sleep(250);
        submitNode.click();
        return { submitted: true, reason: 'clicked-submit' };
    }

    async function solveQuiz() {
        const root = getQuizRoot();
        if (!root) return { ok: false, waitingUser: true, reason: 'quiz-not-found' };
        const containers = collectQuizContainers(root);
        const extracted = containers.map((container, index) => extractQuestionRecord(container, index));
        const questions = extracted.filter(Boolean);
        if (!questions.length) return { ok: false, waitingUser: true, reason: 'question-not-found' };

        const droppedCount = containers.length - questions.length;
        if (droppedCount > 0) {
            S.logger?.warn('quiz', 'payload:dropped', `Bỏ qua ${droppedCount} block không trích được lựa chọn`, {
                containerCount: containers.length,
                extractedCount: questions.length,
                droppedPreview: extracted
                    .map((item, idx) => ({ item, idx, text: normalizeText(containers[idx]?.textContent || '').slice(0, 120) }))
                    .filter(entry => !entry.item)
                    .slice(0, 4),
            });
        }

        const hashCounter = new Map();
        questions.forEach(q => hashCounter.set(q.questionHash, (hashCounter.get(q.questionHash) || 0) + 1));
        const duplicateHashes = [...hashCounter.entries()].filter(([, count]) => count > 1);
        if (duplicateHashes.length) {
            S.logger?.warn('quiz', 'payload:duplicate-hash', `Phát hiện ${duplicateHashes.length} hash trùng`, {
                duplicates: duplicateHashes.slice(0, 6),
            });
        }
        S.logger?.info('quiz', 'payload:summary', `Đã copy ${questions.length} câu từ web`, {
            total: questions.length,
            preview: questions.slice(0, 3).map(q => ({
                index: q.index + 1,
                hash: q.questionHash,
                text: q.questionText.slice(0, 120),
                choiceCount: q.choiceTexts.length,
                choices: q.choiceTexts.slice(0, 4),
            })),
        });
        S.logger?.debug('quiz', 'payload:full', `Full copied questions payload`, {
            total: questions.length,
            questions: questions.map(q => ({
                index: q.index + 1,
                questionHash: q.questionHash,
                legacyHash: q.legacyHash,
                questionText: q.questionText,
                choices: q.choiceTexts,
                choiceCount: q.choiceTexts.length,
            })),
        });
        const payloadText = questions.map(q => {
            const optionsText = q.choiceTexts.map((choice, choiceIndex) => `  [${choiceIndex}] ${choice}`).join('\n');
            return `Q${q.index + 1}: ${q.questionText}\n${optionsText}`;
        }).join('\n\n');
        S.logger?.debug('quiz', 'payload:text', `Copied questions as plain text\n${payloadText}`);

        // Cập nhật progress với số câu hỏi thực tế (không phải số DOM node sai)
        S.ui?.setProgress?.({
            done: 0,
            total: questions.length,
            percent: 0,
            source: 'quiz-actual',
            flags: { video: false, quiz: true, hw: false },
        });
        setLastAction(`Tìm thấy ${questions.length} câu hỏi`);

        S.runtime.quiz.lastPayload = buildQuizPayload();
        S.runtime.quiz.pendingQuestionHashes = questions.map(question => question.questionHash);
        S.runtime.quiz.skipAiForRun = false;
        updateStats({ quizzesDetected: S.stats.quizzesDetected + 1 });

        const forceBatchAi = true;
        S.logger?.info('quiz', 'mode', forceBatchAi ? 'AI-first mode: copy -> batch AI -> fill' : 'Cache-first mode');

        const missingCandidates = [];
        for (const q of questions) {
            if (forceBatchAi) {
                missingCandidates.push(q);
                continue;
            }
            const candidate = findAnswerCandidate(q);
            const candidateIndex = chooseIndexFromRecord(q, candidate);
            if (!(candidate && candidateIndex !== null && (candidate.verifiedCorrect || candidate.confidence >= 0.45))) {
                missingCandidates.push(q);
            }
        }

        const batchMapByQuestionIndex = new Map();
        if (missingCandidates.length > 0) {
            if (!S.runtime.active) return { ok: false, waitingUser: true, reason: 'automation-stopped' };
            S.logger?.info('quiz', 'batch', `Gửi ${missingCandidates.length}/${questions.length} câu cần AI giải`);
            const batchResults = await resolveAnswersBatchViaAI(missingCandidates);
            if (batchResults) {
                let cachedCount = 0;
                batchResults.forEach((res, idx) => {
                    if (res) {
                        const qHash = missingCandidates[idx].questionHash;
                        const qIndex = missingCandidates[idx].index;
                        S.cache[qHash] = res;
                        S.storage.saveCacheRecord(res);
                        batchMapByQuestionIndex.set(qIndex, res);
                        cachedCount++;
                        S.logger?.debug('quiz', 'batch:cached', `Cached answer for Q${idx}: idx=${res.selectedIndex} conf=${res.confidence}`);
                    }
                });
                S.logger?.info('quiz', 'batch:done', `Đã cache ${cachedCount}/${missingCandidates.length} đáp án từ batch AI`);
            } else {
                S.logger?.warn('quiz', 'batch', 'Lỗi batch AI; bỏ qua AI từng câu trong lượt này');
            }
            S.runtime.quiz.skipAiForRun = false;
        }

        S.logger?.info('quiz', 'apply:start', `Bắt đầu điền đáp án sau khi AI trả về`, {
            totalQuestions: questions.length,
            batchResolved: batchMapByQuestionIndex.size,
            forceBatchAi,
        });

        let applied = 0;
        let missingCount = 0;
        let waitingUser = false;
        const selectedAnswers = [];
        for (const question of questions) {
            if (!S.runtime.active) {
                return { ok: false, waitingUser: true, reason: 'automation-stopped' };
            }
            const batchRecord = batchMapByQuestionIndex.get(question.index) || null;
            let resolved = null;
            if (batchRecord) {
                resolved = { record: batchRecord, index: chooseIndexFromRecord(question, batchRecord) };
            }
            if (!resolved || resolved.index === null) {
                resolved = await resolveAnswerForQuestion(question, { ignoreCache: forceBatchAi });
            }
            if (!S.runtime.active) {
                return { ok: false, waitingUser: true, reason: 'automation-stopped' };
            }
            if (resolved.index === null) {
                waitingUser = true;
                missingCount += 1;
                selectedAnswers.push({
                    questionNo: question.index + 1,
                    selectedIndex: null,
                    selectedText: '',
                    questionText: question.questionText,
                });
                S.logger?.warn('quiz', 'answer:missing', `[${question.index + 1}/${questions.length}] Không có đáp án`, { questionText: question.questionText.substring(0, 80) });
                continue;
            }
            const ok = await clickAnswer(question, resolved.index);
            if (!ok) {
                waitingUser = true;
                continue;
            }
            applied++;
            S.stats.answersApplied += 1;
            const record = makeCacheRecord(question.questionHash, resolved.index, question.choiceTexts[resolved.index], resolved.record?.source || 'auto', {
                confidence: resolved.record?.confidence || 0.5,
                verifiedCorrect: resolved.record?.verifiedCorrect === true,
            });
            S.cache[question.questionHash] = record;
            S.storage.saveCacheRecord(record);
            selectedAnswers.push({
                questionNo: question.index + 1,
                selectedIndex: resolved.index,
                selectedText: question.choiceTexts[resolved.index] || '',
                questionText: question.questionText,
            });
            // Cập nhật progress sau mỗi câu được click
            setLastAction(`Câu ${applied}/${questions.length}: Đã chọn đáp án`);
            S.ui?.setProgress?.({
                done: applied,
                total: questions.length,
                percent: Math.round((applied / questions.length) * 100),
                source: 'quiz-actual',
                flags: { video: false, quiz: true, hw: false },
            });
            await humanDelay(220, 340);
        }
        persistStatsSoon();

        const selectedTextBlock = selectedAnswers
            .map(item => `Q${item.questionNo}: [${item.selectedIndex === null ? '?' : item.selectedIndex}] ${item.selectedText || '(missing)'}`)
            .join('\n');
        S.logger?.info('quiz', 'answer:selected', `Selected answers before submit\n${selectedTextBlock}`);
        S.logger?.debug('quiz', 'answer:selected:full', 'Selected answers detail', { answers: selectedAnswers });

        if (missingCount > 0 || applied < questions.length) {
            const detail = `Mới điền ${applied}/${questions.length} câu. Còn thiếu ${Math.max(0, questions.length - applied)} câu`;
            S.logger?.warn('quiz', 'fill:incomplete', detail, { applied, total: questions.length, missingCount });
            setState('waiting-user', { capability: 'quiz', detail });
            return { ok: false, waitingUser: true, reason: 'incomplete-fill', applied, total: questions.length };
        }

        if (!applied) {
            if (S.runtime.state !== 'waiting-user') {
                setState('waiting-user', { capability: 'quiz', detail: 'Không tìm được đáp án đủ tin cậy' });
            }
            return { ok: false, waitingUser: true, reason: 'no-answer-applied' };
        }

        if (!S.settings.automation.autoSubmitQuiz) {
            setState('waiting-user', { capability: 'quiz', detail: 'Đã điền đáp án, chờ người dùng nộp bài' });
            return { ok: true, applied, waitingUser: true, reason: 'submit-disabled' };
        }

        const submit = await submitQuizIfPossible();
        if (!submit.submitted) {
            setState('running-quiz', { capability: 'quiz', detail: 'Đã điền đáp án, đang tìm nút nộp' });
            return { ok: true, applied, waitingUser: false, reason: submit.reason };
        }

        S.runtime.quiz.awaitingNetwork = true;
        S.runtime.quiz.lastSubmittedAt = nowTs();
        setState('running-quiz', { capability: 'quiz', detail: 'Đã nộp quiz, chờ phản hồi' });
        S.logger?.info('quiz', 'submit', 'Submitted quiz automatically', { pending: S.runtime.quiz.pendingQuestionHashes.length });
        persistRuntimeSoon();
        return { ok: true, applied, submitted: true };
    }

    function markPendingAnswersVerified() {
        for (const questionHash of S.runtime.quiz.pendingQuestionHashes) {
            const existing = S.cache[questionHash];
            if (!existing) continue;
            const next = { ...existing, verifiedCorrect: true, updatedAt: nowTs() };
            S.cache[questionHash] = next;
            S.storage.saveCacheRecord(next);
        }
    }

    function parseNetworkPayload(payload) {
        if (!payload || typeof payload !== 'object') return null;
        const url = typeof payload.url === 'string' ? payload.url : '';
        if (!url || !/(problem_check|submit_quiz|handler\/xmodule_handler|answer)/.test(url)) return null;
        const response = typeof payload.response === 'string' ? safeJsonParse(payload.response) : payload.response;
        if (!response || typeof response !== 'object') return null;
        return { url, response };
    }

    function extractScoreRatioFromValue(value) {
        if (value === null || value === undefined) return null;
        if (typeof value === 'number' && Number.isFinite(value)) {
            if (value >= 0 && value <= 1) return value;
            return null;
        }
        if (typeof value === 'string') {
            const text = normalizeText(value);
            if (!text) return null;
            const frac = text.match(/([0-9]+(?:\.[0-9]+)?)\s*\/\s*([0-9]+(?:\.[0-9]+)?)/);
            if (frac) {
                const earned = Number(frac[1]);
                const total = Number(frac[2]);
                if (Number.isFinite(earned) && Number.isFinite(total) && total > 0) return earned / total;
            }
            const parsed = Number(text.replace(',', '.'));
            if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) return parsed;
        }
        return null;
    }

    function extractScoreRatio(data) {
        if (!data || typeof data !== 'object') return null;
        const direct = [
            data.score,
            data.grade,
            data.result?.score,
            data.result?.grade,
            data.data?.score,
            data.data?.grade,
        ];
        for (const candidate of direct) {
            const ratio = extractScoreRatioFromValue(candidate);
            if (ratio !== null) return ratio;
        }
        return null;
    }

    function extractScoreRatioFromDom() {
        const text = normalizeText(document.body?.innerText || '');
        if (!text) return null;
        const match = text.match(/kết\s*quả\s*[:：]?\s*([0-9]+(?:\.[0-9]+)?)\s*\/\s*([0-9]+(?:\.[0-9]+)?)/i);
        if (!match) return null;
        const earned = Number(match[1]);
        const total = Number(match[2]);
        if (!Number.isFinite(earned) || !Number.isFinite(total) || total <= 0) return null;
        return earned / total;
    }

    function handleQuizNetworkPayload(payload) {
        const parsed = parseNetworkPayload(payload);
        if (!parsed || !S.runtime.active) return;

        const data = parsed.response;
        let correct = null;
        if (data.correct_map && typeof data.correct_map === 'object') {
            const values = Object.values(data.correct_map);
            if (values.length) correct = values.every(item => item?.correctness === 'correct');
        } else if (data.is_correct === true) {
            correct = true;
        } else if (data.is_correct === false || data.success === false) {
            correct = false;
        } else {
            const scoreRatio = extractScoreRatio(data);
            if (scoreRatio !== null) {
                correct = scoreRatio >= 0.999;
                S.logger?.info('quiz', 'submit:score-ratio', `Score ratio detected ${(scoreRatio * 100).toFixed(1)}%`, { ratio: scoreRatio });
            } else if (data.passed === true) {
                const domRatio = extractScoreRatioFromDom();
                if (domRatio !== null) {
                    correct = domRatio >= 0.999;
                    S.logger?.info('quiz', 'submit:score-dom', `DOM score ratio detected ${(domRatio * 100).toFixed(1)}%`, { ratio: domRatio });
                } else {
                    correct = false;
                    S.logger?.warn('quiz', 'submit:ambiguous-pass', 'Received passed=true but no full-correct proof; treating as incorrect for retry');
                }
            } else if (data.passed === false) {
                correct = false;
            }
        }

        if (correct === null) return;

        if (correct) {
            markPendingAnswersVerified();
            S.runtime.quiz.awaitingNetwork = false;
            S.runtime.quiz.attempts = 0;
            updateStats({ answersVerified: S.stats.answersVerified + S.runtime.quiz.pendingQuestionHashes.length });
            setState('ready', { capability: 'quiz', detail: 'Quiz đã được xác nhận đúng' });
            S.ui?.toast?.('Quiz đúng, chuẩn bị sang bài tiếp theo', 'ok', 2600);
            if (S.settings.automation.autoNextLesson) scheduleRun('quiz-verified', 900);
            return;
        }

        S.runtime.quiz.attempts += 1;
        S.runtime.quiz.awaitingNetwork = false;
        const maxRetries = S.settings.automation.maxQuizRetries;
        S.logger?.warn('quiz', 'submit:incorrect', `Attempt ${S.runtime.quiz.attempts}/${maxRetries}`);
        if (S.runtime.quiz.attempts < maxRetries) {
            setState('running-quiz', { capability: 'quiz', detail: `Quiz sai, thử lại lần ${S.runtime.quiz.attempts + 1}` });
            scheduleRun('quiz-retry', 1400);
        } else {
            setState('waiting-user', { capability: 'quiz', detail: 'Quiz sai nhiều lần, chuyển sang chờ người dùng' });
            S.ui?.toast?.('Quiz chưa xác nhận đúng, cần kiểm tra thủ công', 'warn', 3400);
        }
    }



    // -- automation/navigator.js --
    function updateProgress(force = false) {
        const progress = detectProgressSnapshot();
        S.runtime.progress = progress;
        if (force) {
            const caps = detectPageCapabilities(true);
            S.runtime.capabilities = serializeCapabilities(caps);
            S.runtime.currentCapability = caps.currentCapability;
        }
        S.ui?.setProgress?.(progress);
        persistRuntimeSoon();
        return progress;
    }

    function clearRunnerTimer() {
        clearManagedTimeout(S.runtime?.runner?.pendingTimer);
        if (S.runtime?.runner) S.runtime.runner.pendingTimer = null;
    }

    function isTerminalHoldState() {
        return ['waiting-user', 'error', 'completed'].includes(S.runtime.state);
    }

    function canWakeFromHold(reason = '') {
        return /^(panel:toggle|panel:start|history:|history-|visibility:resume|video-complete|quiz-verified|quiz-await-network|manual)/.test(reason);
    }

    function scheduleRetry(bucket, reason) {
        const counts = S.runtime.runner.retryCount;
        counts[bucket] = (counts[bucket] || 0) + 1;
        if (counts[bucket] > S.settings.automation.maxQuizRetries) {
            clearRunnerTimer();
            setState('waiting-user', { capability: S.runtime.currentCapability, detail: `Retry vượt ngưỡng: ${reason}` });
            return;
        }
        const delay = 700 * counts[bucket];
        scheduleRun(reason, delay);
    }

    function scheduleRun(reason, delay = 0) {
        if (!S.runtime.active) return;
        if (isTerminalHoldState() && !canWakeFromHold(reason)) return;
        S.runtime.runner.pendingReason = reason;
        S.runtime.runner.pendingDelay = delay;
        if (S.runtime.runner.isRunning) return;
        clearRunnerTimer();
        S.runtime.runner.pendingTimer = setManagedTimeout(() => {
            S.runtime.runner.pendingTimer = null;
            runAutomationCycle(reason);
        }, delay);
        persistRuntimeSoon();
    }

    function isLikelyDisabledLesson(node) {
        if (!(node instanceof HTMLElement)) return true;
        const classText = `${node.className || ''} ${node.getAttribute('data-state') || ''}`.toLowerCase();
        if (/(disabled|locked|lock|unavailable)/.test(classText)) return true;
        if (node.getAttribute('aria-disabled') === 'true') return true;
        const text = normalizeText(node.textContent || '').toLowerCase();
        if (/(chưa mở|bị khóa|locked)/.test(text)) return true;
        return false;
    }

    function collectLessonCandidates() {
        const raw = [
            ...document.querySelectorAll('[class*="Lesson-sc-"], [class*="lesson-item"], [class*="LessonItem"], [data-testid*="lesson"]'),
        ].filter(node => node instanceof HTMLElement);
        const leafNodes = raw.filter(node => !raw.some(parent => parent !== node && parent.contains(node)));
        return leafNodes
            .map(node => {
                const clickable = node.querySelector('a[href], button, [role="button"]') || node;
                const text = normalizeText((clickable.textContent || node.textContent || '')).slice(0, 180);
                return { node, clickable, text };
            })
            .filter(item => item.text.length >= 4)
            .filter(item => !isLikelyDisabledLesson(item.node) && !isLikelyDisabledLesson(item.clickable));
    }

    function isCurrentLessonCandidate(item) {
        const node = item?.node;
        const clickable = item?.clickable;
        if (!(node instanceof HTMLElement) || !(clickable instanceof HTMLElement)) return false;
        if (clickable.getAttribute('aria-current') === 'true' || clickable.getAttribute('aria-current') === 'page') return true;
        const classText = `${node.className || ''} ${clickable.className || ''}`.toLowerCase();
        if (/(active|current|selected)/.test(classText)) return true;
        if (clickable instanceof HTMLAnchorElement) {
            try {
                const href = new URL(clickable.href, location.href);
                if (href.pathname === location.pathname && href.search === location.search) return true;
            } catch {}
        }
        return false;
    }

    function pickNextUnlockedLessonCandidate() {
        const candidates = collectLessonCandidates();
        if (!candidates.length) return null;
        const currentIndex = candidates.findIndex(isCurrentLessonCandidate);
        if (currentIndex >= 0 && currentIndex < candidates.length - 1) {
            return candidates[currentIndex + 1];
        }
        if (currentIndex === candidates.length - 1) return null;
        return candidates[candidates.length - 1];
    }

    async function navigateNext(reason = 'next') {
        const lessonCandidate = pickNextUnlockedLessonCandidate();
        if (lessonCandidate?.clickable) {
            setState('ready', { capability: 'navigation', detail: 'Đang mở bài tiếp theo trong danh sách' });
            lessonCandidate.clickable.scrollIntoView({ block: 'center', behavior: 'smooth' });
            await sleep(240 + Math.floor(Math.random() * 120));
            lessonCandidate.clickable.click();
            updateStats({ navigations: S.stats.navigations + 1 });
            invalidateCapabilityCache('navigate-lesson-list');
            scheduleRun(`${reason}:after-lesson-click`, 1400);
            return true;
        }

        const caps = detectPageCapabilities(true);
        if (!caps.nextButton?.matched) {
            setState('completed', { capability: 'navigation', detail: 'Không còn nút bài tiếp theo' });
            return false;
        }
        setState('ready', { capability: 'navigation', detail: 'Đang chuyển bài tiếp theo' });
        caps.nextButton.node.scrollIntoView({ block: 'center', behavior: 'smooth' });
        await sleep(240 + Math.floor(Math.random() * 120));
        caps.nextButton.node.click();
        updateStats({ navigations: S.stats.navigations + 1 });
        invalidateCapabilityCache('navigate-next');
        scheduleRun(`${reason}:after-click`, 1400);
        return true;
    }

    async function ensureVideoPlayback() {
        if (!S.videoCtrl) S.videoCtrl = new VideoCtrl();
        S.videoCtrl.onComplete(() => {
            updateStats({ videosCompleted: S.stats.videosCompleted + 1 });
            setState('ready', { capability: 'video', detail: 'Video hoàn tất' });
            S.ui?.toast?.('Video đã xong', 'ok', 2200);
            if (S.settings.automation.autoNextLesson) scheduleRun('video-complete', 900);
        });
        const ok = await S.videoCtrl.autoPlay(S.settings.automation.videoSpeed);
        if (!ok) {
            scheduleRetry('video-play', 'video-playback-failed');
            return false;
        }
        return true;
    }

    function pauseAutomation(reason = 'pause') {
        if (!S.runtime.active) return;
        clearRunnerTimer();
        S.videoCtrl?.stop();
        setState('paused', { capability: S.runtime.currentCapability, detail: reason });
    }

    function startAutomation(reason = 'start') {
        S.runtime.runner.retryCount = {};
        delete S.runtime._aiBlocked;
        setActive(true, reason);
        S.runtime.mode = S.settings.featureFlags.compatBypass ? 'compat' : 'safe';
        setState('detecting-page', { capability: 'idle', detail: 'Đang quét trang hiện tại' });
        invalidateCapabilityCache('start-automation');
        scheduleRun(reason, 60);
    }

    function stopAutomation(reason = 'stop') {
        clearRunnerTimer();
        S.videoCtrl?.stop();
        S.runtime.quiz.awaitingNetwork = false;
        S.runtime.quiz.pendingQuestionHashes = [];
        setActive(false, reason);
        setState('idle', { capability: 'idle', detail: 'Đã dừng automation' });
    }

    async function runAutomationCycle(reason = 'manual') {
        if (!S.runtime.active || S.runtime.state === 'paused') return;
        if (isTerminalHoldState() && !canWakeFromHold(reason)) return;
        if (S.runtime.runner.isRunning) {
            S.runtime.runner.pendingReason = reason;
            return;
        }
        S.runtime.runner.isRunning = true;
        S.runtime.runner.lastRunAt = nowTs();
        const queuedReason = S.runtime.runner.pendingReason;
        S.runtime.runner.pendingReason = '';
        S.runtime.runner.abortVersion += 1;
        persistRuntimeSoon();

        try {
            if (document.hidden && S.settings.automation.pauseWhenHidden) {
                setState('paused', { capability: 'idle', detail: 'Tab đang ẩn' });
                return;
            }

            if (S.runtime.quiz.awaitingNetwork && (nowTs() - S.runtime.quiz.lastSubmittedAt) < 8000) {
                setState('running-quiz', { capability: 'quiz', detail: 'Đang chờ phản hồi từ quiz' });
                scheduleRun('quiz-await-network', 1600);
                return;
            }

            setState('detecting-page', { capability: 'idle', detail: `Scan từ ${reason}` });
            const caps = detectPageCapabilities(true);
            S.runtime.capabilities = serializeCapabilities(caps);
            S.runtime.currentCapability = caps.currentCapability;
            S.runtime.lastUrl = location.href;
            updateProgress();
            persistRuntimeSoon();

            const jitter = () => Math.floor(Math.random() * 200) - 100;
            if (caps.quizStart?.matched) {
                setState('running-quiz', { capability: 'quiz-start', detail: 'Bắt đầu quiz' });
                caps.quizStart.node.click();
                scheduleRun('quiz-started', 1200 + jitter());
                return;
            }

            if (caps.quiz?.matched) {
                setState('running-quiz', { capability: 'quiz', detail: 'Đang xử lý quiz' });
                const result = await solveQuiz();
                if (result.submitted) {
                    scheduleRun('quiz-await-network', 5000 + jitter());
                    return;
                }
                if (result.waitingUser) return;
                scheduleRun('quiz-follow-up', 1000 + jitter());
                return;
            }

            if (caps.video?.matched) {
                setState('running-video', { capability: 'video', detail: 'Đang điều khiển video' });
                await ensureVideoPlayback();
                return;
            }

            if (S.settings.automation.autoNextLesson && /^video-complete|quiz-verified|quiz-await-network/.test(reason)) {
                // Anti-loop: chỉ navigate 1 lần mỗi 3 giây
                const lastNav = S.runtime._lastAutoNavigate || 0;
                if (nowTs() - lastNav < 3000) {
                    setState('ready', { capability: caps.currentCapability, detail: 'Chờ trước khi chuyển bài' });
                    scheduleRun(reason, 120);
                    return;
                }
                S.runtime._lastAutoNavigate = nowTs();
                // Clear awaiting flag để tránh kẹt state
                S.runtime.quiz.awaitingNetwork = false;
                await navigateNext(reason);
                return;
            }

            setState('ready', { capability: caps.currentCapability, detail: 'Không có tác vụ tự động phù hợp trên trang này' });
        } catch (error) {
            updateStats({ errors: S.stats.errors + 1 });
            S.logger?.error('runner', 'cycle:failed', error.message, { reason });
            setState('error', { capability: 'error', detail: error.message });
        } finally {
            S.runtime.runner.isRunning = false;
            const nextReason = S.runtime.runner.pendingReason || queuedReason;
            S.runtime.runner.pendingReason = '';
            persistRuntimeSoon();
            if (S.runtime.active && S.runtime.state !== 'paused' && !isTerminalHoldState() && nextReason) {
                scheduleRun(nextReason, 120);
            }
        }
    }

    function exportDebugSnapshot() {
        return S.storage.exportSnapshot().then(store => ({
            url: location.href,
            state: S.runtime.state,
            currentCapability: S.runtime.currentCapability,
            capabilities: S.runtime.capabilities,
            featureFlags: S.settings.featureFlags,
            recentLogs: S.runtime.logs.slice(-20),
            config: store.settings,
            stats: store.stats,
            runtime: store.runtime,
            cacheSummary: Object.values(store.cache).slice(0, 20),
        }));
    }

    function installNavigationWatcher() {
        let lastUrl = location.href;
        const onUrlMaybeChanged = reason => {
            if (location.href === lastUrl) return;
            lastUrl = location.href;
            invalidateCapabilityCache(reason);
            S.runtime.lastUrl = location.href;
            delete S.runtime._aiBlocked;
            S.runtime.lastAction = 'Chuẩn bị...';
            if (S.runtime.active) scheduleRun(reason, 300);
            else syncUi();
        };

        const wrapHistory = method => {
            const original = history[method];
            history[method] = function(...args) {
                const result = original.apply(this, args);
                setManagedTimeout(() => onUrlMaybeChanged(`history:${method}`), 0);
                return result;
            };
            addCleanup(() => {
                history[method] = original;
            });
        };
        wrapHistory('pushState');
        wrapHistory('replaceState');

        const popHandler = () => onUrlMaybeChanged('history:popstate');
        const hashHandler = () => onUrlMaybeChanged('history:hashchange');
        const visibilityHandler = () => {
            if (!document.hidden && S.runtime.active && S.runtime.state === 'paused') scheduleRun('visibility:resume', 120);
        };
        window.addEventListener('popstate', popHandler);
        window.addEventListener('hashchange', hashHandler);
        document.addEventListener('visibilitychange', visibilityHandler);
        addCleanup(() => window.removeEventListener('popstate', popHandler));
        addCleanup(() => window.removeEventListener('hashchange', hashHandler));
        addCleanup(() => document.removeEventListener('visibilitychange', visibilityHandler));

        const observer = registerObserver(new MutationObserver(() => {
            clearManagedTimeout(S.runtime._domInvalidateTimer);
            S.runtime._domInvalidateTimer = setManagedTimeout(() => invalidateCapabilityCache('dom-mutation'), 250);
        }));
        observer.observe(document.documentElement, { childList: true, subtree: true });
    }


    // -- stealth/bypass.js --
    function bypassProtections() {
        const style = document.createElement('style');
        style.id = '__lmsx_copy_bypass__';
        style.textContent = `*{user-select:text!important;-webkit-user-select:text!important;}`;
        (document.head || document.documentElement).appendChild(style);
        addCleanup(() => style.remove());

        if (!S.settings.featureFlags.compatBypass) {
            S.logger?.info('bypass', 'mode', 'Safe mode copy override enabled');
            return;
        }

        const events = ['copy', 'cut', 'contextmenu', 'selectstart', 'dragstart'];
        const handler = event => {
            event.stopPropagation();
        };
        events.forEach(name => window.addEventListener(name, handler, true));
        addCleanup(() => events.forEach(name => window.removeEventListener(name, handler, true)));
        S.logger?.warn('bypass', 'mode', 'Compat bypass mode enabled');
    }


    // -- init.js --
    async function init() {
        if (window.__lmsxInitialized) return;
        window.__lmsxInitialized = true;

        S.logger = createLogger();
        S.logger.info('init', 'boot', `LMSX ${LMSX_VERSION} starting`);

        try {
            S.storage = createStorageAdapter();
            const store = await S.storage.init();
            S.settings = store.settings;
            S.runtime = store.runtime;
            S.stats = store.stats;
            S.uiPrefs = store.uiPrefs;
            S.cache = store.cache;
            if (S.settings.featureFlags.verboseLogs !== true) {
                S.settings.featureFlags.verboseLogs = true;
                await S.storage.saveSettings(S.settings);
            }
            S.runtime.mode = S.settings.featureFlags.compatBypass ? 'compat' : 'safe';
            S.runtime._draftAiKey = sanitizeAiKeyInput(S.settings.ai.keys[S.settings.ai.provider] || '');

            const root = buildUI();
            initPanel(root);
            bypassProtections();
            injectHooks();
            installNavigationWatcher();
            updateProgress(true);
            setState('idle', { capability: 'idle', detail: 'Sẵn sàng. Bấm Start để chạy.' });
            S.ui?.sync?.();
            S.logger.info('init', 'ready', 'Panel ready and idle by default');
        } catch (error) {
            console.error('[LMSX] init failed', error);
            if (S.runtime) {
                S.runtime.lastError = { message: error.message, at: nowIso() };
                setState('error', { capability: 'error', detail: error.message });
            }
        }
    }

    if (!document.getElementById('__lmsx_root__')) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
        else init();
    }

    window.addEventListener('beforeunload', () => {
        try { stopAutomation('beforeunload'); } catch {}
        runCleanups();
    });

})();
