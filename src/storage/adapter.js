function chromeStorageGet(keys) {
    return new Promise(resolve => {
        try {
            chrome.storage.local.get(keys, result => {
                if (chrome.runtime.lastError) {
                    console.warn('[LMSx] storage get error:', chrome.runtime.lastError.message);
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
                    console.warn('[LMSx] storage set error:', chrome.runtime.lastError.message);
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

            localStorage.removeItem('lms_openrouter_key');
            localStorage.removeItem('lms_gemini_key');
            localStorage.removeItem('lms_custom_key');

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
        store.runtime.lastError = null;
        store.runtime.lastUrl = location.href;
        store.runtime.lastAction = 'Đang chờ';
        store.runtime.logs = [];
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
