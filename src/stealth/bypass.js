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
