class VideoCtrl {
    constructor() {
        this.video = null;
        this.timer = null;
        this.completeHandler = null;
        this._ended = false;
        this._onEnded = () => this.finish('ended');
    }

    attach(match) {
        const nextVideo = match?.node || detectVideoCapability().node;
        if (this.video === nextVideo) return this.video;
        this.stop();
        this.video = nextVideo || null;
        this._ended = false;
        if (this.video) this.video.addEventListener('ended', this._onEnded, { once: true });
        return this.video;
    }

    async autoPlay() {
        const video = this.attach(detectVideoCapability());
        if (!video) return false;
        const speed = 4;
        
        // Force speed immediately and multiple times
        video.playbackRate = speed;
        
        // Try to handle custom players (plyr, video.js, etc)
        this.forceCustomPlayerSpeed(speed);
        
        try {
            await video.play();
        } catch (error) {
            S.logger?.warn('video', 'play:blocked', error?.message || 'video.play blocked');
            return false;
        }

        // Force speed again after play starts
        video.playbackRate = speed;
        this.forceCustomPlayerSpeed(speed);

        this.timer = setInterval(() => this.tick(speed), 400);
        S.timers.add(this.timer);
        S.logger?.info('video', 'play:start', `Video autoplay x${speed}`);
        return true;
    }

    forceCustomPlayerSpeed(speed) {
        // Handle Plyr
        const plyr = document.querySelector('.plyr');
        if (plyr && plyr.plyr) plyr.plyr.speed = speed;
        
        // Handle video.js
        const vjs = document.querySelector('.video-js');
        if (vjs && vjs.player) vjs.player.playbackRate(speed);
        
        // Generic speed buttons on page
        document.querySelectorAll('[data-speed], [class*="speed"], [class*="playback-rate"]').forEach(el => {
            if (el.textContent?.includes('4') || el.getAttribute('data-speed') === '4') {
                el.click();
            }
        });
    }

    tick(speed) {
        if (!this.video || !S.runtime.active || S.runtime.state === 'paused') {
            this.stop();
            return;
        }
        if (this.video.playbackRate !== speed) this.video.playbackRate = speed;
        if (this.video.paused) this.video.play().catch(() => {});
        const duration = this.video.duration;
        const current = this.video.currentTime;
        if (!duration || Number.isNaN(duration)) return;
        const percent = clamp(Math.round((current / duration) * 100), 0, 100);
        setLastAction(`Video x${speed} • ${percent}%`);
        if ((current / duration) >= 0.98 || (duration - current) <= 1) this.finish('threshold');
    }

    onComplete(callback) {
        this.completeHandler = callback;
    }

    finish(reason) {
        if (this._ended) return;
        this._ended = true;
        this.stop();
        S.logger?.info('video', 'play:done', `Video complete (${reason})`);
        this.completeHandler?.(reason);
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            S.timers.delete(this.timer);
            this.timer = null;
        }
        if (this.video) {
            try { this.video.removeEventListener('ended', this._onEnded, { once: true }); } catch {}
        }
    }
}
