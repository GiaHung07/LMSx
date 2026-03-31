// ── BUILD SHADOW DOM ─────────────────────────────────────────
function buildUI() {
    const host = document.createElement('div');
    host.id = '__lmsx_root__';
    host.style.cssText = 'position:fixed!important;top:0!important;left:0!important;width:0!important;height:0!important;overflow:visible!important;z-index:2147483647!important;';
    S.shadow = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = CSS;
    S.shadow.appendChild(style);

    const wrapper = document.createElement('div');
    wrapper.innerHTML = HTML;
    while (wrapper.firstChild) S.shadow.appendChild(wrapper.firstChild);

    document.documentElement.appendChild(host);
    return S.shadow;
}

// ── PANEL CONTROLLER ─────────────────────────────────────────
function initPanel(root) {
    const $ = id => root.getElementById(id);
    const panel = $('P');
    if (!panel) return;

    // Ensure panel gets pointer-events
    panel.style.pointerEvents = 'auto';

    // ─── DRAG ───
    const header = $('H');
    let dragging = false, sx = 0, sy = 0, sl = 0, st = 0;

    function fixPosition() {
        // Convert right→left on first interaction
        if (panel.style.left === '' || panel.style.left === 'auto') {
            const r = panel.getBoundingClientRect();
            panel.style.left = r.left + 'px';
            panel.style.top = r.top + 'px';
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
        }
    }

    header.addEventListener('mousedown', e => {
        if (e.target.closest('.H-dots')) return;
        e.preventDefault();
        fixPosition();
        dragging = true;
        panel.classList.add('is-dragging');
        const r = panel.getBoundingClientRect();
        sl = r.left; st = r.top; sx = e.clientX; sy = e.clientY;
        document.addEventListener('mousemove', dragMove);
        document.addEventListener('mouseup', dragUp);
    });
    function dragMove(e) {
        if (!dragging) return;
        const nx = sl + (e.clientX - sx);
        const ny = st + (e.clientY - sy);
        const mxL = window.innerWidth - panel.offsetWidth;
        const mxT = window.innerHeight - panel.offsetHeight;
        panel.style.left = Math.max(0, Math.min(mxL, nx)) + 'px';
        panel.style.top  = Math.max(0, Math.min(mxT, ny)) + 'px';
    }
    function dragUp() {
        dragging = false;
        panel.classList.remove('is-dragging');
        document.removeEventListener('mousemove', dragMove);
        document.removeEventListener('mouseup', dragUp);
    }

    // ─── RESIZE ───
    function bindResize(el, dir) {
        el.addEventListener('mousedown', e => {
            e.preventDefault(); e.stopPropagation();
            fixPosition();
            const r = panel.getBoundingClientRect();
            const ox = e.clientX, oy = e.clientY, ow = r.width, oh = r.height, oL = r.left;
            panel.classList.add('is-dragging');
            function rm(e) {
                const dx = e.clientX - ox, dy = e.clientY - oy;
                if (dir.includes('e')) panel.style.width = Math.max(200, ow + dx) + 'px';
                if (dir === 'w') { const nw = Math.max(200, ow - dx); panel.style.width = nw + 'px'; panel.style.left = (oL + ow - nw) + 'px'; }
                if (dir.includes('s')) panel.style.height = Math.max(150, oh + dy) + 'px';
            }
            function ru() { panel.classList.remove('is-dragging'); document.removeEventListener('mousemove', rm); document.removeEventListener('mouseup', ru); }
            document.addEventListener('mousemove', rm);
            document.addEventListener('mouseup', ru);
        });
    }
    panel.querySelectorAll('.RZ').forEach(h => { 
        h.style.pointerEvents = 'auto'; 
        bindResize(h, h.dataset.d); 
    });
    const grip = $('grip');
    if (grip) { grip.style.pointerEvents = 'auto'; bindResize(grip, 'se'); }

    // ─── MINIMIZE / CLOSE ───
    const fab = $('fab');
    $('dot-min')?.addEventListener('click', () => {
        panel.classList.add('P-hidden');
        if (fab) fab.classList.add('show');
    });
    $('dot-cls')?.addEventListener('click', () => {
        panel.classList.add('P-hidden');
        // close = no FAB shown
    });
    fab?.addEventListener('click', () => {
        panel.classList.remove('P-hidden');
        fab.classList.remove('show');
    });
    // Make FAB clickable
    if (fab) fab.style.pointerEvents = 'auto';

    // ─── TOGGLE ───
    let running = false;
    const tgl = $('tgl');
    tgl?.addEventListener('click', () => {
        running = !running;
        const es = ['tgl', 'tgl-dot', 'tgl-name', 'tgl-sub', 'tgl-sw'];
        es.forEach(id => $(id)?.classList.toggle('on', running));
        $('tgl-sub').textContent = running ? 'Đang chạy — auto video + quiz' : 'Nhấn để bắt đầu';
        setLog(running ? 'Đã kích hoạt...' : 'Chờ kích hoạt...', running ? 'on' : 'off');
        S.active = running;
        if (running) { startAutomation(); } else { stopAutomation(); }
    });

    // ─── API KEY ───
    const apiInp = $('api-inp');
    const apiBtn = $('api-btn');
    const aiSel = $('ai-sel');

    function updateApiUI() {
        if (!apiInp || !aiSel) return;
        const curKey = S.apiKeys[S.aiProvider] || '';
        apiInp.value = curKey;
        if (curKey) {
            apiBtn.classList.add('ok');
            apiBtn.textContent = 'OK';
        } else {
            apiBtn.classList.remove('ok');
            apiBtn.textContent = 'LƯU';
        }
    }

    if (aiSel) {
        aiSel.value = S.aiProvider;
        aiSel.addEventListener('change', (e) => {
            S.aiProvider = e.target.value;
            localStorage.setItem('lms_ai_provider', S.aiProvider);
            updateApiUI();
        });
    }

    updateApiUI();

    if (apiInp && apiBtn) {
        apiInp.addEventListener('input', () => {
            apiBtn.classList.remove('ok');
            apiBtn.textContent = 'LƯU';
        });

        apiBtn.addEventListener('click', () => {
            const val = apiInp.value.trim();
            S.apiKeys[S.aiProvider] = val;
            localStorage.setItem('lms_' + S.aiProvider + '_key', val);
            
            if (val) {
                apiBtn.classList.add('ok');
                apiBtn.textContent = 'OK';
                const name = aiSel ? aiSel.options[aiSel.selectedIndex].text : 'API';
                toast('Đã lưu ' + name + ' Key!', 'ok', 3000);
            } else {
                apiBtn.classList.remove('ok');
                apiBtn.textContent = 'LƯU';
                toast('Đã xóa bỏ API Key', 'warn', 3000);
            }
        });
    }

    // ─── PUBLIC UI API ───
    function setProgress(done, total, flags = {}) {
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        const el = $('pct'); if (el) el.innerHTML = `${pct}<sup>%</sup>`;
        const fl = $('fill'); if (fl) fl.style.width = `${pct}%`;
        const fr = $('frac'); if (fr) fr.textContent = `${done} / ${total || '?'} mục`;
        if (flags.video) $('tag-v')?.classList.add('done');
        if (flags.quiz) $('tag-q')?.classList.add('done');
        if (flags.hw) $('tag-h')?.classList.add('done');
    }

    function setLog(text, state = 'on', time = '') {
        const t = $('log-txt'), d = $('log-dot'), tm = $('log-tm');
        if (t) t.textContent = text;
        if (d) d.className = `L-dot ${state}`;
        if (tm) tm.textContent = time || _time();
    }

    function setApiStatus(state) {
        // Obsolete but kept for backwards compatibility internally if used
        if (apiBtn) {
            if (state === 'ok') {
                apiBtn.classList.add('ok');
                apiBtn.textContent = 'OK';
            } else {
                apiBtn.classList.remove('ok');
                apiBtn.textContent = 'LƯU';
            }
        }
    }

    const TOAST_ICONS = {
        ok: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
        warn: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
        error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
        info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`
    };
    function toast(msg, type = 'info', dur = 3500) {
        const c = $('toasts'); if (!c) return;
        const el = document.createElement('div');
        el.className = `TT-item ${type}`;
        el.innerHTML = `<div class="TT-icn">${TOAST_ICONS[type] || TOAST_ICONS.info}</div><div class="TT-msg">${msg.replace(/</g,'&lt;')}</div><div class="TT-ts">0s</div>`;
        el.style.pointerEvents = 'auto';
        c.appendChild(el);
        requestAnimationFrame(() => el.classList.add('show'));
        let sec = 0;
        const tick = setInterval(() => { sec++; const ts = el.querySelector('.TT-ts'); if (ts) ts.textContent = sec + 's'; }, 1000);
        setTimeout(() => { clearInterval(tick); el.classList.remove('show'); setTimeout(() => el.remove(), 250); }, dur);
    }

    // Expose to outer scope
    S.ui = { setProgress, setLog, setApiStatus, toast, setRunning: (v) => {
        running = v; S.active = v;
    }};

    setLog('Ready', 'off');
}
