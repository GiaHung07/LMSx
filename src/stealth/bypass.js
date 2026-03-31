function bypassProtections() {
    ['copy', 'cut', 'contextmenu', 'selectstart', 'dragstart'].forEach(ev => {
        window.addEventListener(ev, e => e.stopPropagation(), true);
    });
    const s = document.createElement('style');
    s.textContent = '* { user-select: text !important; -webkit-user-select: text !important; -moz-user-select: text !important; -ms-user-select: text !important; }';
    (document.head || document.documentElement).appendChild(s);
    setInterval(() => {
        document.oncontextmenu = null; document.onselectstart = null; document.oncopy = null; document.oncut = null;
    }, 1000);
    console.log('[LMSX] Copy bypass active - Ultimate Mode');
}

// ── NETWORK HOOKS ────────────────────────────────────────────
function injectHooks() {
    try {
        const s = document.createElement('script');
        s.src = chrome.runtime.getURL('inject.js');
        s.onload = () => s.remove();
        (document.head || document.documentElement).appendChild(s);
    } catch {}
    document.addEventListener('__lms_inject_fetch', onNetData);
    document.addEventListener('__lms_inject_xhr', onNetData);
}

function onNetData(e) {
    if (!S.active) return;
    const url = e.detail?.url; if (!url) return;
    if (!url.includes('problem_check') && !url.includes('submit_quiz') && !url.includes('handler/xmodule_handler') && !url.includes('answer')) return;
    try {
        const data = typeof e.detail.response === 'string' ? JSON.parse(e.detail.response) : e.detail.response;
        if (!data) return;
        let correct = false;
        if (data.correct_map) {
            correct = Object.values(data.correct_map).every(r => r.correctness === 'correct');
            if (correct && S.quizState.qId) {
                Object.entries(data.correct_map).forEach(([k, r]) => {
                    if (r.correctness === 'correct') { const i = document.querySelector(`[name="${k}"]:checked`); if (i) localStorage.setItem(`lms_q_${S.quizState.qId}`, i.id); }
                });
            }
        } else if (data.success === true || data.passed === true || data.is_correct === true) { correct = true; }
        S.quizState.attempts++;
        if (correct) {
            S.ui?.setLog('Đáp án chính xác!', 'off'); S.ui?.toast('Đáp án chính xác!', 'ok');
            S.stats.ok++; updateProgress(); S.quizState.attempts = 0;
            setTimeout(navigateNext, 2000);
        } else {
            S.ui?.setLog(`Sai (lần ${S.quizState.attempts})`, 'on');
            if (S.quizState.attempts < 3) {
                setTimeout(() => { const rb = document.querySelector('.reset-button, .reset, [id*="reset"]'); if (rb) rb.click(); setTimeout(loop, 2000); }, 2000);
            } else { S.ui?.setLog('Bỏ qua, đi tiếp', 'off'); setTimeout(navigateNext, 2000); }
        }
    } catch (err) { console.error('[LMSX] onNetData:', err); }
}
