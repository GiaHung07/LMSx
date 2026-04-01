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





