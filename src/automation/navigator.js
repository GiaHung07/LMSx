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

function markNavigationSettling(reason = 'navigation', durationMs = 8000) {
    S.runtime._navigationSettlingUntil = nowTs() + durationMs;
    S.runtime._navigationSettlingReason = reason;
}

function isNavigationSettling() {
    return Number(S.runtime._navigationSettlingUntil || 0) > nowTs();
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

function isRenderableLessonNode(node) {
    if (!(node instanceof HTMLElement)) return false;
    if (!node.isConnected) return false;
    if (node.closest('#__lmsx_root__')) return false;
    const styles = getComputedStyle(node);
    if (styles.display === 'none' || styles.visibility === 'hidden') return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}

function collectLessonCandidates() {
    const raw = [
        ...document.querySelectorAll('[class*="Lesson-sc-"], [class*="lesson-item"], [class*="LessonItem"], [data-testid*="lesson"]'),
    ].filter(node => node instanceof HTMLElement)
        .filter(isRenderableLessonNode);
    const leafNodes = raw.filter(node => !raw.some(parent => parent !== node && parent.contains(node)));
    const items = leafNodes
        .map(node => {
            const clickable = node.querySelector('a[href], button, [role="button"]') || node;
            const text = normalizeText((clickable.textContent || node.textContent || '')).slice(0, 180);
            return {
                node,
                clickable,
                text,
                disabled: isLikelyDisabledLesson(node),
                chapterEl: node.closest('.ant-collapse-item'),
            };
        })
        .filter(item => item.text.length >= 4)
        .filter(item => isRenderableLessonNode(item.clickable));

    // De-duplicate: LMS renders 2 identical sidebars, keep only first occurrence of each lesson text
    const seen = new Set();
    return items.filter(item => {
        if (seen.has(item.text)) return false;
        seen.add(item.text);
        return true;
    });
}

function getCurrentLessonScore(item) {
    const node = item?.node;
    const clickable = item?.clickable;
    if (!(node instanceof HTMLElement) || !(clickable instanceof HTMLElement)) return 0;
    let score = 0;

    if (clickable.getAttribute('aria-current') === 'true' || clickable.getAttribute('aria-current') === 'page') {
        score = Math.max(score, 6);
    }

    const classText = `${node.className || ''} ${clickable.className || ''}`.toLowerCase();
    if (/(active|current|selected)/.test(classText)) {
        score = Math.max(score, 5);
    }

    if (clickable instanceof HTMLAnchorElement) {
        try {
            const href = new URL(clickable.href, location.href);
            if (href.pathname === location.pathname && href.search === location.search) {
                score = Math.max(score, 7);
            }
        } catch {}
    }

    // Styled-component detection: Current lesson has non-transparent background + dark blue left border
    // This is the most reliable hook for this LMS (no semantic class names or aria attributes)
    try {
        const styles = getComputedStyle(node);
        const bg = styles.backgroundColor;
        const borderL = styles.borderLeftColor;
        const borderLW = Number.parseFloat(styles.borderLeftWidth || '0');
        const isTransparent = v => !v || v === 'rgba(0, 0, 0, 0)' || v === 'transparent';
        if (!isTransparent(bg) && !isTransparent(borderL) && borderLW >= 2) {
            score = Math.max(score, 4);
        }
    } catch {}

    return score;
}

function findCurrentLessonIndex(candidates) {
    const scored = candidates
        .map((item, index) => ({ index, item, score: getCurrentLessonScore(item) }))
        .filter(entry => entry.score > 0);

    if (!scored.length) return -1;

    scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.index - b.index;
    });

    const best = scored[0];
    S.logger?.info('navigator', 'pick:current', `score=${best.score}, text="${best.item.text.slice(0, 60)}"`);
    return best.index;
}

function pickNextLessonCandidate() {
    const candidates = collectLessonCandidates();
    if (!candidates.length) {
        S.logger?.info('navigator', 'pick:empty', 'Không tìm thấy bài học nào trong sidebar');
        return { candidate: null, candidates, currentIndex: -1 };
    }
    const currentIndex = findCurrentLessonIndex(candidates);
    S.logger?.info('navigator', 'pick:index', `currentIndex=${currentIndex}, total=${candidates.length}, current="${candidates[currentIndex]?.text?.slice(0, 50) || 'N/A'}"`);

    if (currentIndex >= 0 && currentIndex < candidates.length - 1) {
        const next = candidates[currentIndex + 1];
        if (next.disabled) {
            S.logger?.warn('navigator', 'pick:blocked', `Adjacent lesson looks locked: "${next.text.slice(0, 60)}"`);
            return { candidate: null, candidates, currentIndex };
        }
        S.logger?.info('navigator', 'pick:next', `Next lesson: "${next.text.slice(0, 60)}"`);
        return { candidate: next, candidates, currentIndex };
    }
    if (currentIndex === candidates.length - 1) {
        S.logger?.info('navigator', 'pick:last', 'Bài hiện tại là bài cuối trong danh sách');
        return { candidate: null, candidates, currentIndex };
    }
    S.logger?.warn('navigator', 'pick:unknown-current', 'Không xác định được bài hiện tại, bỏ qua điều hướng bằng sidebar');
    return { candidate: null, candidates, currentIndex };
}

async function openNextChapterAfterCurrent(candidates, currentIndex) {
    const currentChapter = candidates[currentIndex]?.chapterEl;
    if (!(currentChapter instanceof HTMLElement)) return false;

    const chapters = [...document.querySelectorAll('.ant-collapse-item')].filter(node => node instanceof HTMLElement);
    const chapterIndex = chapters.indexOf(currentChapter);
    if (chapterIndex < 0) return false;

    for (let i = chapterIndex + 1; i < chapters.length; i++) {
        const nextChapter = chapters[i];
        const header = nextChapter.querySelector('.ant-collapse-header');
        if (!(header instanceof HTMLElement)) continue;
        header.scrollIntoView({ block: 'center', behavior: 'smooth' });
        await sleep(260);
        header.click();
        S.logger?.info('navigator', 'chapter:next', `Opened next chapter index=${i}`);
        await sleep(420);
        return true;
    }

    return false;
}

async function navigateNext(reason = 'next') {
    let pick = pickNextLessonCandidate();
    let lessonCandidate = pick.candidate;

    if (!lessonCandidate && pick.currentIndex >= 0 && pick.currentIndex === pick.candidates.length - 1) {
        const openedNextChapter = await openNextChapterAfterCurrent(pick.candidates, pick.currentIndex);
        if (openedNextChapter) {
            pick = pickNextLessonCandidate();
            lessonCandidate = pick.candidate;
        }
    }

    if (lessonCandidate?.clickable) {
        setState('ready', { capability: 'navigation', detail: `Đang mở bài tiếp theo: ${lessonCandidate.text.slice(0, 50)}` });
        lessonCandidate.clickable.scrollIntoView({ block: 'center', behavior: 'smooth' });
        await sleep(240 + Math.floor(Math.random() * 120));
        lessonCandidate.clickable.click();
        markNavigationSettling('lesson-click');
        updateStats({ navigations: S.stats.navigations + 1 });
        invalidateCapabilityCache('navigate-lesson-list');
        scheduleRun(`${reason}:after-lesson-click`, 1400);
        return true;
    }

    const caps = detectPageCapabilities(true);
    if (!caps.nextButton?.matched) {
        setState('completed', { capability: 'navigation', detail: 'Không còn bài tiếp theo (hết bài mở khóa hoặc đã hoàn thành)' });
        return false;
    }
    setState('ready', { capability: 'navigation', detail: 'Đang chuyển bài tiếp theo' });
    caps.nextButton.node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    await sleep(240 + Math.floor(Math.random() * 120));
    caps.nextButton.node.click();
    markNavigationSettling('next-button');
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

        if (S.runtime.state === 'running-video' && S.videoCtrl?.timer && reason === 'dom-mutation') {
            const vid = S.videoCtrl.video;
            if (vid && document.contains(vid) && !vid.paused) {
                return;
            }
        }

        setState('detecting-page', { capability: 'idle', detail: `Đang quét từ ${reason}` });
        const caps = detectPageCapabilities(true);
        S.runtime.capabilities = serializeCapabilities(caps);
        S.runtime.currentCapability = caps.currentCapability;
        S.runtime.lastUrl = location.href;
        updateProgress();
        persistRuntimeSoon();

        if (caps.quizStart?.matched || caps.quiz?.matched || caps.video?.matched) {
            S.runtime._navigationSettlingUntil = 0;
            S.runtime._navigationSettlingReason = '';
        }

        const jitter = () => Math.floor(Math.random() * 200) - 100;
        
        // Navigate sau video/quiz phải check TRƯỚC các xử lý chức năng để tránh kẹt trạng thái
        if (S.settings.automation.autoNextLesson && /^(video-complete|quiz-verified|quiz-await-network)$/.test(reason)) {
            const lastNav = S.runtime._lastAutoNavigate || 0;
            if (nowTs() - lastNav < 3000) {
                setState('ready', { capability: caps.currentCapability, detail: 'Chờ trước khi chuyển bài' });
                scheduleRun(reason, 120);
                return;
            }
            S.runtime._lastAutoNavigate = nowTs();
            S.runtime.quiz.awaitingNetwork = false;
            await navigateNext(reason);
            return;
        }
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

        // Moved autoNextLesson up to execute first

        if (caps.video?.matched) {
            const vid = caps.video.node;
            const isFinished = (S.videoCtrl && S.videoCtrl._ended && S.videoCtrl.video === vid) || 
                               vid.ended || 
                               (vid.duration && (vid.currentTime / vid.duration >= 0.995 || vid.duration - vid.currentTime <= 0.35));

            if (!isFinished) {
                setState('running-video', { capability: 'video', detail: 'Đang điều khiển video' });
                await ensureVideoPlayback();
                return;
            } else if (S.videoCtrl && S.videoCtrl.video === vid && !S.videoCtrl._ended) {
                S.videoCtrl.finish('threshold-detected');
            }
        }

        // No video/quiz/quizStart found on this page - try auto-navigate to next lesson
        if (S.settings.automation.autoNextLesson) {
            if (isNavigationSettling()) {
                setState('ready', { capability: caps.currentCapability, detail: 'Đang chờ bài mới tải xong' });
                scheduleRun('navigation-settle', 900);
                return;
            }
            const lastNav = S.runtime._lastAutoNavigate || 0;
            if (nowTs() - lastNav >= 3000) {
                S.runtime._lastAutoNavigate = nowTs();
                S.logger?.info('navigator', 'idle-navigate', `Không có nội dung cần xử lý, thử chuyển bài (lý do: ${reason})`);
                const navigated = await navigateNext('idle-auto');
                if (navigated) return;
                // navigateNext already set 'completed' state if nothing found
                return;
            }
        }

        setState('ready', { capability: caps.currentCapability, detail: 'Không có tác vụ tự động phù hợp trên trang này' });
        if (S.runtime.active) scheduleRun('idle-poll', 3500);
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
        markNavigationSettling(reason);
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

    const observer = registerObserver(new MutationObserver((mutations) => {
        const isSelf = mutations.every(m => {
            const el = m.target.nodeType === 1 ? m.target : m.target.parentElement;
            return el && el.closest && el.closest('#__lmsx_root__');
        });
        if (isSelf) return;

        clearManagedTimeout(S.runtime._domInvalidateTimer);
        S.runtime._domInvalidateTimer = setManagedTimeout(() => invalidateCapabilityCache('dom-mutation'), 250);
    }));
    observer.observe(document.documentElement, { childList: true, subtree: true });
}
