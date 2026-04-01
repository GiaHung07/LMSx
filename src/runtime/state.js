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
