function updateProgress(force = false) {
    const progress = detectProgressSnapshot();
    S.runtime.progress = progress;
    if (force) {
        const caps = detectPageCapabilities(true);
        S.runtime.capabilities = serializeCapabilities(caps);
        S.runtime.currentCapability = caps.currentCapability;
    }
    S.ui?.setProgress?.(progress);
    persistRuntimeSoon();
    return progress;
}

function clearRunnerTimer() {
    clearManagedTimeout(S.runtime?.runner?.pendingTimer);
    if (S.runtime?.runner) S.runtime.runner.pendingTimer = null;
}

function isTerminalHoldState() {
    return ['waiting-user', 'error', 'completed'].includes(S.runtime.state);
}

function canWakeFromHold(reason = '') {
    return /^(panel:toggle|panel:start|history:|history-|visibility:resume|video-complete|quiz-verified|quiz-await-network|manual)/.test(reason);
}

function scheduleRetry(bucket, reason) {
    const counts = S.runtime.runner.retryCount;
    counts[bucket] = (counts[bucket] || 0) + 1;
    if (counts[bucket] > S.settings.automation.maxQuizRetries) {
        clearRunnerTimer();
        setState('waiting-user', { capability: S.runtime.currentCapability, detail: `Retry vượt ngưỡng: ${reason}` });
        return;
    }
    const delay = 700 * counts[bucket];
    scheduleRun(reason, delay);
}

function scheduleRun(reason, delay = 0) {
    if (!S.runtime.active) return;
    if (isTerminalHoldState() && !canWakeFromHold(reason)) return;
    S.runtime.runner.pendingReason = reason;
    S.runtime.runner.pendingDelay = delay;
    if (S.runtime.runner.isRunning) return;
    clearRunnerTimer();
    S.runtime.runner.pendingTimer = setManagedTimeout(() => {
        S.runtime.runner.pendingTimer = null;
        runAutomationCycle(reason);
    }, delay);
    persistRuntimeSoon();
}

function isLikelyDisabledLesson(node) {
    if (!(node instanceof HTMLElement)) return true;
    const classText = `${node.className || ''} ${node.getAttribute('data-state') || ''}`.toLowerCase();
    if (/(disabled|locked|lock|unavailable)/.test(classText)) return true;
    if (node.getAttribute('aria-disabled') === 'true') return true;
    const text = normalizeText(node.textContent || '').toLowerCase();
    if (/(chưa mở|bị khóa|locked)/.test(text)) return true;
    return false;
}

function collectLessonCandidates() {
    const raw = [
        ...document.querySelectorAll('[class*="Lesson-sc-"], [class*="lesson-item"], [class*="LessonItem"], [data-testid*="lesson"]'),
    ].filter(node => node instanceof HTMLElement);
    const leafNodes = raw.filter(node => !raw.some(parent => parent !== node && parent.contains(node)));
    return leafNodes
        .map(node => {
            const clickable = node.querySelector('a[href], button, [role="button"]') || node;
            const text = normalizeText((clickable.textContent || node.textContent || '')).slice(0, 180);
            return { node, clickable, text };
        })
        .filter(item => item.text.length >= 4)
        .filter(item => !isLikelyDisabledLesson(item.node) && !isLikelyDisabledLesson(item.clickable));
}

function isCurrentLessonCandidate(item) {
    const node = item?.node;
    const clickable = item?.clickable;
    if (!(node instanceof HTMLElement) || !(clickable instanceof HTMLElement)) return false;
    if (clickable.getAttribute('aria-current') === 'true' || clickable.getAttribute('aria-current') === 'page') return true;
    const classText = `${node.className || ''} ${clickable.className || ''}`.toLowerCase();
    if (/(active|current|selected)/.test(classText)) return true;
    if (clickable instanceof HTMLAnchorElement) {
        try {
            const href = new URL(clickable.href, location.href);
            if (href.pathname === location.pathname && href.search === location.search) return true;
        } catch {}
    }
    return false;
}

function pickNextUnlockedLessonCandidate() {
    const candidates = collectLessonCandidates();
    if (!candidates.length) return null;
    const currentIndex = candidates.findIndex(isCurrentLessonCandidate);
    if (currentIndex >= 0 && currentIndex < candidates.length - 1) {
        return candidates[currentIndex + 1];
    }
    if (currentIndex === candidates.length - 1) return null;
    return candidates[candidates.length - 1];
}

async function navigateNext(reason = 'next') {
    const lessonCandidate = pickNextUnlockedLessonCandidate();
    if (lessonCandidate?.clickable) {
        setState('ready', { capability: 'navigation', detail: 'Đang mở bài tiếp theo trong danh sách' });
        lessonCandidate.clickable.scrollIntoView({ block: 'center', behavior: 'smooth' });
        await sleep(240 + Math.floor(Math.random() * 120));
        lessonCandidate.clickable.click();
        updateStats({ navigations: S.stats.navigations + 1 });
        invalidateCapabilityCache('navigate-lesson-list');
        scheduleRun(`${reason}:after-lesson-click`, 1400);
        return true;
    }

    const caps = detectPageCapabilities(true);
    if (!caps.nextButton?.matched) {
        setState('completed', { capability: 'navigation', detail: 'Không còn nút bài tiếp theo' });
        return false;
    }
    setState('ready', { capability: 'navigation', detail: 'Đang chuyển bài tiếp theo' });
    caps.nextButton.node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    await sleep(240 + Math.floor(Math.random() * 120));
    caps.nextButton.node.click();
    updateStats({ navigations: S.stats.navigations + 1 });
    invalidateCapabilityCache('navigate-next');
    scheduleRun(`${reason}:after-click`, 1400);
    return true;
}

async function ensureVideoPlayback() {
    if (!S.videoCtrl) S.videoCtrl = new VideoCtrl();
    S.videoCtrl.onComplete(() => {
        updateStats({ videosCompleted: S.stats.videosCompleted + 1 });
        setState('ready', { capability: 'video', detail: 'Video hoàn tất' });
        S.ui?.toast?.('Video đã xong', 'ok', 2200);
        if (S.settings.automation.autoNextLesson) scheduleRun('video-complete', 900);
    });
    const ok = await S.videoCtrl.autoPlay(S.settings.automation.videoSpeed);
    if (!ok) {
        scheduleRetry('video-play', 'video-playback-failed');
        return false;
    }
    return true;
}

function pauseAutomation(reason = 'pause') {
    if (!S.runtime.active) return;
    clearRunnerTimer();
    S.videoCtrl?.stop();
    setState('paused', { capability: S.runtime.currentCapability, detail: reason });
}

function startAutomation(reason = 'start') {
    S.runtime.runner.retryCount = {};
    delete S.runtime._aiBlocked;
    setActive(true, reason);
    S.runtime.mode = S.settings.featureFlags.compatBypass ? 'compat' : 'safe';
    setState('detecting-page', { capability: 'idle', detail: 'Đang quét trang hiện tại' });
    invalidateCapabilityCache('start-automation');
    scheduleRun(reason, 60);
}

function stopAutomation(reason = 'stop') {
    clearRunnerTimer();
    S.videoCtrl?.stop();
    S.runtime.quiz.awaitingNetwork = false;
    S.runtime.quiz.pendingQuestionHashes = [];
    setActive(false, reason);
    setState('idle', { capability: 'idle', detail: 'Đã dừng automation' });
}

async function runAutomationCycle(reason = 'manual') {
    if (!S.runtime.active || S.runtime.state === 'paused') return;
    if (isTerminalHoldState() && !canWakeFromHold(reason)) return;
    if (S.runtime.runner.isRunning) {
        S.runtime.runner.pendingReason = reason;
        return;
    }
    S.runtime.runner.isRunning = true;
    S.runtime.runner.lastRunAt = nowTs();
    const queuedReason = S.runtime.runner.pendingReason;
    S.runtime.runner.pendingReason = '';
    S.runtime.runner.abortVersion += 1;
    persistRuntimeSoon();

    try {
        if (document.hidden && S.settings.automation.pauseWhenHidden) {
            setState('paused', { capability: 'idle', detail: 'Tab đang ẩn' });
            return;
        }

        if (S.runtime.quiz.awaitingNetwork && (nowTs() - S.runtime.quiz.lastSubmittedAt) < 8000) {
            setState('running-quiz', { capability: 'quiz', detail: 'Đang chờ phản hồi từ quiz' });
            scheduleRun('quiz-await-network', 1600);
            return;
        }

        setState('detecting-page', { capability: 'idle', detail: `Scan từ ${reason}` });
        const caps = detectPageCapabilities(true);
        S.runtime.capabilities = serializeCapabilities(caps);
        S.runtime.currentCapability = caps.currentCapability;
        S.runtime.lastUrl = location.href;
        updateProgress();
        persistRuntimeSoon();

        const jitter = () => Math.floor(Math.random() * 200) - 100;
        if (caps.quizStart?.matched) {
            setState('running-quiz', { capability: 'quiz-start', detail: 'Bắt đầu quiz' });
            caps.quizStart.node.click();
            scheduleRun('quiz-started', 1200 + jitter());
            return;
        }

        if (caps.quiz?.matched) {
            setState('running-quiz', { capability: 'quiz', detail: 'Đang xử lý quiz' });
            const result = await solveQuiz();
            if (result.submitted) {
                scheduleRun('quiz-await-network', 5000 + jitter());
                return;
            }
            if (result.waitingUser) return;
            scheduleRun('quiz-follow-up', 1000 + jitter());
            return;
        }

        if (caps.video?.matched) {
            setState('running-video', { capability: 'video', detail: 'Đang điều khiển video' });
            await ensureVideoPlayback();
            return;
        }

        if (S.settings.automation.autoNextLesson && /^video-complete|quiz-verified|quiz-await-network/.test(reason)) {
            // Anti-loop: chỉ navigate 1 lần mỗi 3 giây
            const lastNav = S.runtime._lastAutoNavigate || 0;
            if (nowTs() - lastNav < 3000) {
                setState('ready', { capability: caps.currentCapability, detail: 'Chờ trước khi chuyển bài' });
                scheduleRun(reason, 120);
                return;
            }
            S.runtime._lastAutoNavigate = nowTs();
            // Clear awaiting flag để tránh kẹt state
            S.runtime.quiz.awaitingNetwork = false;
            await navigateNext(reason);
            return;
        }

        setState('ready', { capability: caps.currentCapability, detail: 'Không có tác vụ tự động phù hợp trên trang này' });
    } catch (error) {
        updateStats({ errors: S.stats.errors + 1 });
        S.logger?.error('runner', 'cycle:failed', error.message, { reason });
        setState('error', { capability: 'error', detail: error.message });
    } finally {
        S.runtime.runner.isRunning = false;
        const nextReason = S.runtime.runner.pendingReason || queuedReason;
        S.runtime.runner.pendingReason = '';
        persistRuntimeSoon();
        if (S.runtime.active && S.runtime.state !== 'paused' && !isTerminalHoldState() && nextReason) {
            scheduleRun(nextReason, 120);
        }
    }
}

function exportDebugSnapshot() {
    return S.storage.exportSnapshot().then(store => ({
        url: location.href,
        state: S.runtime.state,
        currentCapability: S.runtime.currentCapability,
        capabilities: S.runtime.capabilities,
        featureFlags: S.settings.featureFlags,
        recentLogs: S.runtime.logs.slice(-20),
        config: store.settings,
        stats: store.stats,
        runtime: store.runtime,
        cacheSummary: Object.values(store.cache).slice(0, 20),
    }));
}

function installNavigationWatcher() {
    let lastUrl = location.href;
    const onUrlMaybeChanged = reason => {
        if (location.href === lastUrl) return;
        lastUrl = location.href;
        invalidateCapabilityCache(reason);
        S.runtime.lastUrl = location.href;
        delete S.runtime._aiBlocked;
        S.runtime.lastAction = 'Chuẩn bị...';
        if (S.runtime.active) scheduleRun(reason, 300);
        else syncUi();
    };

    const wrapHistory = method => {
        const original = history[method];
        history[method] = function(...args) {
            const result = original.apply(this, args);
            setManagedTimeout(() => onUrlMaybeChanged(`history:${method}`), 0);
            return result;
        };
        addCleanup(() => {
            history[method] = original;
        });
    };
    wrapHistory('pushState');
    wrapHistory('replaceState');

    const popHandler = () => onUrlMaybeChanged('history:popstate');
    const hashHandler = () => onUrlMaybeChanged('history:hashchange');
    const visibilityHandler = () => {
        if (!document.hidden && S.runtime.active && S.runtime.state === 'paused') scheduleRun('visibility:resume', 120);
    };
    window.addEventListener('popstate', popHandler);
    window.addEventListener('hashchange', hashHandler);
    document.addEventListener('visibilitychange', visibilityHandler);
    addCleanup(() => window.removeEventListener('popstate', popHandler));
    addCleanup(() => window.removeEventListener('hashchange', hashHandler));
    addCleanup(() => document.removeEventListener('visibilitychange', visibilityHandler));

    const observer = registerObserver(new MutationObserver(() => {
        clearManagedTimeout(S.runtime._domInvalidateTimer);
        S.runtime._domInvalidateTimer = setManagedTimeout(() => invalidateCapabilityCache('dom-mutation'), 250);
    }));
    observer.observe(document.documentElement, { childList: true, subtree: true });
}
