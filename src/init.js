// ── INIT ─────────────────────────────────────────────────────
function init() {
    console.log('[LMSX] v3.6 initializing...');
    const root = buildUI();
    initPanel(root);
    bypassProtections();
    try { injectHooks(); } catch {}
    S.active = true;
    setTimeout(loop, 2000);
    watchURL();
    updateProgress();
    console.log('[LMSX] v3.6 ready');
}

// Start sequence
// Prevent multiple injections
if (!document.getElementById('__lmsx_root__')) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}
