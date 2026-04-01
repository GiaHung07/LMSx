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
