function buildUI() {
    const host = document.createElement('div');
    host.id = '__lmsx_root__';
    host.style.cssText = 'position:fixed!important;top:0!important;left:0!important;width:0!important;height:0!important;overflow:visible!important;z-index:2147483647!important;';
    S.shadow = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    const fontUrl = globalThis.chrome?.runtime?.getURL?.('JetBrainsMono-Regular.woff2') || '';
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

