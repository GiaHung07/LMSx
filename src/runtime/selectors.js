const SELECTOR_REGISTRY = {
    quiz: [
        '[class*="lesson-quiz-styles__QuizBody"]',
        '[class*="QuizBody"]',
        '[class*="QuizContent"]',
        '.xblock-problem',
    ],
    quizStart: [
        'button[data-testid*="start"]',
        'button',
    ],
    quizSubmit: [
        'button[type="submit"]',
        'button[data-testid*="submit"]',
        '.submit.btn-brand',
        '.submit.button',
        '.check',
    ],
    nextButton: [
        '.sequence-nav-button.button-next',
        '.next-button',
        'button.next',
        '[data-next]',
        'a.next',
    ],
    progress: [
        '.sequence-navigation .progress .sr-only',
        '.sequence-navigation .progress-bar',
        '[aria-label*="progress" i]',
        '[data-progress]',
        '[class*="progress"]',
    ],
};

const CAPABILITY_CACHE = {
    value: null,
    at: 0,
};

function invalidateCapabilityCache(reason = 'manual') {
    CAPABILITY_CACHE.value = null;
    CAPABILITY_CACHE.at = 0;
    S.logger?.debug('selectors', 'invalidate', reason);
}

function summarizeNode(node) {
    if (!(node instanceof HTMLElement)) return null;
    return {
        tag: node.tagName.toLowerCase(),
        id: node.id || '',
        className: typeof node.className === 'string' ? node.className.slice(0, 120) : '',
        text: normalizeText(node.textContent).slice(0, 120),
    };
}

function makeSelectorMatch(type, node, selector, confidence, meta = {}) {
    return {
        matched: !!node,
        type,
        node: node || null,
        sourceSelector: selector || '',
        confidence,
        meta,
    };
}

function serializeSelectorMatch(match) {
    if (!match) return null;
    return {
        matched: !!match.matched,
        type: match.type,
        sourceSelector: match.sourceSelector,
        confidence: match.confidence,
        meta: match.meta || {},
        node: summarizeNode(match.node),
    };
}

function serializeCapabilities(caps) {
    return {
        pageType: caps.pageType,
        currentCapability: caps.currentCapability,
        quiz: serializeSelectorMatch(caps.quiz),
        quizStart: serializeSelectorMatch(caps.quizStart),
        quizSubmit: serializeSelectorMatch(caps.quizSubmit),
        video: serializeSelectorMatch(caps.video),
        nextButton: serializeSelectorMatch(caps.nextButton),
        progress: serializeSelectorMatch(caps.progress),
    };
}

function findFirstVisible(selectors, filter) {
    if (!Array.isArray(selectors)) return { node: null, selector: '' };
    for (const selector of selectors) {
        const nodes = document.querySelectorAll(selector);
        for (const node of nodes) {
            if (typeof filter === 'function' && !filter(node)) continue;
            return { node, selector };
        }
    }
    return { node: null, selector: '' };
}

function isEnabledButton(node) {
    if (!(node instanceof HTMLElement)) return false;
    if (node.disabled) return false;
    const text = normalizeText(node.textContent).toLowerCase();
    return !!text;
}

function detectQuizCapability() {
    const match = findFirstVisible(SELECTOR_REGISTRY.quiz);
    return makeSelectorMatch('quiz', match.node, match.selector, match.node ? 0.95 : 0);
}

function detectQuizStartCapability() {
    const candidates = [];
    SELECTOR_REGISTRY.quizStart.forEach(selector => document.querySelectorAll(selector).forEach(node => candidates.push({ selector, node })));
    const match = candidates.find(item => {
        if (!isEnabledButton(item.node)) return false;
        const text = normalizeText(item.node.textContent).toLowerCase();
        return text === 'bắt đầu làm bài' || text === 'làm lại bài' || text === 'start quiz' || text === 'start';
    });
    return makeSelectorMatch('quizStart', match?.node || null, match?.selector || '', match ? 0.92 : 0);
}

function detectQuizSubmitCapability() {
    const match = findFirstVisible(SELECTOR_REGISTRY.quizSubmit, node => {
        if (!isEnabledButton(node)) return false;
        const text = normalizeText(node.textContent).toLowerCase();
        return /(nộp|kiểm tra|submit|check|finish)/.test(text);
    });
    return makeSelectorMatch('quizSubmit', match.node, match.selector, match.node ? 0.82 : 0);
}

function detectNextCapability() {
    const match = findFirstVisible(SELECTOR_REGISTRY.nextButton, node => {
        if (!(node instanceof HTMLElement)) return false;
        return !node.disabled && node.getAttribute('aria-disabled') !== 'true';
    });
    return makeSelectorMatch('nextButton', match.node, match.selector, match.node ? 0.84 : 0);
}

function detectVideoCapability() {
    let node = document.querySelector('video');
    let selector = 'video';
    if (!node) {
        try {
            for (const frame of document.querySelectorAll('iframe')) {
                try {
                    node = frame.contentDocument?.querySelector('video');
                    if (node) {
                        selector = 'iframe video';
                        break;
                    }
                } catch {}
            }
        } catch {}
    }
    return makeSelectorMatch('video', node, selector, node ? 0.96 : 0);
}

function detectProgressCapability() {
    const direct = findFirstVisible(SELECTOR_REGISTRY.progress);
    return makeSelectorMatch('progress', direct.node, direct.selector, direct.node ? 0.7 : 0);
}

function detectQuizQuestionProgress() {
    const quizRoot = document.querySelector('[class*="lesson-quiz-styles__QuizBody"], [class*="QuizBody"], [class*="QuizContent"], .xblock-problem');
    if (!quizRoot) return null;

    // Dùng cùng logic collectQuizContainers: lọc anti-nesting để tránh đếm trùng
    // (QuestionText, QuestionBody,... đều có class "Question" → phải lọc parent.contains)
    let containers;
    const byQuestion = [...quizRoot.querySelectorAll('[class*="Question"]:not([class*="QuestionList"])')];
    if (byQuestion.length) {
        containers = byQuestion.filter(el => !byQuestion.some(p => p !== el && p.contains(el)));
    } else if (quizRoot.matches?.('.xblock-problem')) {
        containers = [...quizRoot.querySelectorAll('.choicegroup, .field')];
    } else {
        const fallback = [...quizRoot.querySelectorAll('[class*="OptionList"], .choicegroup, .field')];
        containers = fallback.filter(el => !fallback.some(p => p !== el && p.contains(el)));
    }

    // Loại bỏ container không có option nào (không phải câu hỏi)
    const questions = containers.filter(node => {
        if (!(node instanceof HTMLElement)) return false;
        return !!node.querySelector('input[type="radio"], input[type="checkbox"], [role="button"][aria-pressed], [class*="Option"]:not([class*="OptionList"])');
    });

    const total = questions.length;
    if (!total) return null;

    let done = 0;
    questions.forEach(node => {
        const checked = node.querySelector('input:checked, [aria-pressed="true"], [aria-checked="true"]');
        if (checked) done += 1;
    });

    return {
        done: clamp(done, 0, total),
        total,
        percent: total ? Math.round((done / total) * 100) : 0,
        source: 'quiz-dom',
        flags: {
            video: false,
            quiz: true,
            hw: false,
        },
    };
}

function detectProgressSnapshot() {
    const quizProgress = detectQuizQuestionProgress();
    if (quizProgress) return quizProgress;
    const specific = document.querySelector('.sequence-navigation .progress .sr-only');
    if (specific) {
        const text = normalizeText(specific.textContent);
        const percentMatch = text.match(/(\d+)\s*%/);
        const navItems = document.querySelectorAll('.sequence-nav-button:not(.button-next):not(.button-previous)');
        const total = clamp(navItems.length || 0, 0, 999999);
        const percent = clamp(Number(percentMatch?.[1]) || 0, 0, 100);
        const done = total ? Math.round((percent / 100) * total) : 0;
        return {
            done,
            total,
            percent,
            source: 'dom-specific',
            flags: {
                video: !!detectVideoCapability().matched,
                quiz: !!detectQuizCapability().matched,
                hw: false,
            },
        };
    }

    const labelled = document.querySelector('[aria-label*="progress" i], [data-progress]');
    if (labelled) {
        const text = normalizeText(labelled.getAttribute('aria-label') || labelled.getAttribute('data-progress') || labelled.textContent);
        const countMatch = text.match(/(\d+)\s*\/\s*(\d+)/);
        const percentMatch = text.match(/(\d+)\s*%/);
        const total = clamp(Number(countMatch?.[2]) || 0, 0, 999999);
        const done = clamp(Number(countMatch?.[1]) || (total ? Math.round((Number(percentMatch?.[1]) || 0) * total / 100) : 0), 0, total || 999999);
        const percent = total ? Math.round((done / total) * 100) : clamp(Number(percentMatch?.[1]) || 0, 0, 100);
        return {
            done,
            total,
            percent,
            source: 'aria-data',
            flags: {
                video: !!detectVideoCapability().matched,
                quiz: !!detectQuizCapability().matched,
                hw: false,
            },
        };
    }

    const fallbackTotal = Math.max(S.stats.videosCompleted + S.stats.quizzesDetected, S.runtime.progress.total || 0, 0);
    const fallbackDone = clamp(S.stats.videosCompleted + S.stats.answersVerified, 0, fallbackTotal || 999999);
    const fallbackPercent = fallbackTotal ? Math.round((fallbackDone / fallbackTotal) * 100) : 0;
    return {
        done: fallbackDone,
        total: fallbackTotal,
        percent: fallbackPercent,
        source: 'fallback',
        flags: {
            video: !!detectVideoCapability().matched,
            quiz: !!detectQuizCapability().matched,
            hw: false,
        },
    };
}

function detectPageCapabilities(force = false) {
    const age = nowTs() - CAPABILITY_CACHE.at;
    if (!force && CAPABILITY_CACHE.value && age < 1200) return CAPABILITY_CACHE.value;

    const quiz = detectQuizCapability();
    const quizStart = detectQuizStartCapability();
    const quizSubmit = detectQuizSubmitCapability();
    const video = detectVideoCapability();
    const nextButton = detectNextCapability();
    const progress = detectProgressCapability();

    const pageType = quiz.matched ? 'quiz' : video.matched ? 'video' : 'generic';
    const currentCapability = quizStart.matched ? 'quiz-start' : quiz.matched ? 'quiz' : video.matched ? 'video' : nextButton.matched ? 'navigation' : 'idle';

    CAPABILITY_CACHE.value = {
        pageType,
        currentCapability,
        quiz,
        quizStart,
        quizSubmit,
        video,
        nextButton,
        progress,
    };
    CAPABILITY_CACHE.at = nowTs();
    return CAPABILITY_CACHE.value;
}

