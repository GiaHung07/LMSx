// ── VIDEO ────────────────────────────────────────────────────
class VideoCtrl {
    constructor() { this.video = null; this.timer = null; this.cb = null; this._ended = false; }
    findVideo() {
        let v = document.querySelector('video');
        if (v) return v;
        try { for (const f of document.querySelectorAll('iframe')) { try { v = f.contentDocument?.querySelector('video'); if (v) return v; } catch {} } } catch {}
        return null;
    }
    async autoPlay(speed = 4) {
        this.video = this.findVideo();
        if (!this.video) return false;
        console.log('[LMSX] Video found, duration:', this.video.duration);
        this.video.muted = true;
        this.video.playbackRate = speed;
        try { await this.video.play(); } catch {
            const btn = document.querySelector('.plyr__control[data-plyr="play"], button[data-plyr="play"]');
            if (btn) { btn.click(); await sleep(500); }
            try { await this.video.play(); } catch (e) { console.error('[LMSX] Autoplay fail:', e); S.ui?.setLog('Autoplay bị chặn', 'off'); return false; }
        }
        console.log('[LMSX] Playing x' + speed);
        setTimeout(() => { try { if (this.video) this.video.muted = false; } catch {} }, 1000);
        this.video.addEventListener('ended', () => {
            if (this._ended) return; this._ended = true;
            console.log('[LMSX] Video ended'); this.stop(); S.ui?.setLog('Video xong!', 'off'); this.cb?.();
        }, { once: true });
        this.timer = setInterval(() => {
            if (!this.video || !S.active) { this.stop(); return; }
            if (this.video.playbackRate !== speed) this.video.playbackRate = speed;
            if (this.video.paused && S.active) this.video.play().catch(() => {});
            const dur = this.video.duration, cur = this.video.currentTime;
            if (!dur || isNaN(dur)) return;
            const pct = cur / dur;
            S.ui?.setLog(`Video x${speed} — ${Math.round(pct * 100)}%`, 'on');
            updateProgress();
            if (pct >= 0.98 || (dur - cur) <= 1) {
                if (this._ended) return; this._ended = true;
                console.log('[LMSX] Video complete (interval)'); this.stop(); S.ui?.setLog('Video xong!', 'off'); this.cb?.();
            }
        }, 800);
        return true;
    }
    onComplete(fn) { this.cb = fn; }
    stop() { clearInterval(this.timer); this.timer = null; }
}
