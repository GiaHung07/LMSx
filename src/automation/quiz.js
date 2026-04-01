function getQuizRoot() {
    const caps = detectPageCapabilities(true);
    return caps.quiz?.node || null;
}

function collectQuizContainers(root = getQuizRoot()) {
    if (!root) return [];
    let scoped = [...root.querySelectorAll('[class*="Question"]:not([class*="QuestionList"])')];
    if (scoped.length) {
        return scoped.filter(el => !scoped.some(parent => parent !== el && parent.contains(el)));
    }
    if (root.matches?.('.xblock-problem')) return [...root.querySelectorAll('.choicegroup, .field')];
    scoped = [...root.querySelectorAll('[class*="OptionList"], .choicegroup, .field')];
    return scoped.filter(el => !scoped.some(parent => parent !== el && parent.contains(el)));
}

function collectOptionNodes(container) {
    let options = [...container.querySelectorAll('[role="button"][aria-pressed]')];
    if (!options.length) {
        options = [
            ...container.querySelectorAll(
                'input[type="radio"], input[type="checkbox"], [class*="Option-sc"], [class*="Option"]:not([class*="OptionList"]), [class*="choice"], .ant-radio-wrapper, .ant-checkbox-wrapper'
            ),
        ];
    }
    const unique = [];
    const seen = new Set();
    for (const option of options) {
        if (!(option instanceof HTMLElement)) continue;
        if (seen.has(option)) continue;
        seen.add(option);
        unique.push(option);
    }
    return unique;
}

function getQuestionText(container) {
    const candidates = [...container.querySelectorAll('[class*="QuestionText"], [class*="question-text"], [class*="Prompt"], [class*="stem"], legend, .problem-header, h1, h2, h3, h4')];
    for (const node of candidates) {
        const text = normalizeText(node.textContent);
        if (text.length > 10) return text;
    }

    const clone = container.cloneNode(true);
    clone.querySelectorAll('input, button, label, [role="button"], [class*="Option"], [class*="choice"], .choicegroup').forEach(node => node.remove());
    const fallbackText = normalizeText(clone.textContent);
    if (fallbackText.length > 10) return fallbackText.slice(0, 320);

    return normalizeText(container.textContent).slice(0, 320);
}

function getChoiceText(option) {
    if (!(option instanceof HTMLElement)) return '';
    const directAria = normalizeText(option.getAttribute('aria-label') || '');
    if (directAria) return directAria;

    const nestedAriaNode = option.querySelector('[aria-label]');
    const nestedAria = normalizeText(nestedAriaNode?.getAttribute('aria-label') || '');
    if (nestedAria) return nestedAria;

    const fromLabel = option.querySelector('label') || option.closest('label');
    const fromLabelText = normalizeText(fromLabel?.innerText || fromLabel?.textContent || '');
    if (fromLabelText) return fromLabelText;

    if (option.matches('input')) {
        const byId = option.id && window.CSS?.escape ? document.querySelector(`label[for="${CSS.escape(option.id)}"]`) : null;
        const byIdText = normalizeText(byId?.innerText || byId?.textContent || '');
        if (byIdText) return byIdText;
        const roleBtn = option.closest('[role="button"]');
        const roleBtnAria = normalizeText(roleBtn?.getAttribute('aria-label') || roleBtn?.querySelector('[aria-label]')?.getAttribute('aria-label') || '');
        if (roleBtnAria) return roleBtnAria;
        const parentText = normalizeText(option.parentElement?.innerText || option.parentElement?.textContent || '');
        if (parentText) return parentText;
    }

    const fromInnerText = normalizeText(option.innerText || '');
    if (fromInnerText) return fromInnerText;

    return normalizeText(option.textContent || option.getAttribute('value') || option.getAttribute('title') || '');
}

function extractQuestionRecord(container, index) {
    const choiceNodes = collectOptionNodes(container);
    if (!choiceNodes.length) return null;
    const questionText = getQuestionText(container);
    const choiceTextsRaw = choiceNodes.map(getChoiceText);
    const nonEmptyChoices = choiceTextsRaw.filter(Boolean);
    let choiceTexts = choiceTextsRaw.map(text => text || '');

    if (nonEmptyChoices.length < Math.min(2, choiceNodes.length)) {
        const fallbackPool = [...container.querySelectorAll('[role="button"][aria-label], [role="button"] [aria-label], [class*="OptionContent"][aria-label], .ant-radio-wrapper, .ant-checkbox-wrapper')]
            .map(node => normalizeText(node.getAttribute?.('aria-label') || node.innerText || node.textContent || ''))
            .filter(Boolean);
        if (fallbackPool.length) {
            let fallbackCursor = 0;
            choiceTexts = choiceTexts.map(existing => {
                if (existing) return existing;
                const next = fallbackPool[fallbackCursor] || '';
                fallbackCursor += 1;
                return next;
            });
        }
    }

    choiceTexts = choiceTexts.filter(Boolean);
    const questionHash = makeQuestionHash(questionText, choiceTexts);
    const legacyHash = questionText.substring(0, 50).replace(/\s+/g, '_');
    return {
        index,
        container,
        questionText,
        choiceTexts,
        choiceNodes,
        questionHash,
        legacyHash,
    };
}

function buildQuizPayload() {
    const root = getQuizRoot();
    const questions = collectQuizContainers(root).map((container, index) => extractQuestionRecord(container, index)).filter(Boolean);
    return {
        schemaVersion: STORAGE_SCHEMA_VERSION,
        source: 'lmsx-export',
        exportedAt: nowTs(),
        url: location.href,
        provider: S.settings?.ai?.provider || 'gemini',
        questions: questions.map(question => ({
            questionHash: question.questionHash,
            legacyHash: question.legacyHash,
            questionText: question.questionText,
            choices: question.choiceTexts,
        })),
    };
}

function importAnswerSetFromText(rawText) {
    const parsed = safeJsonParse(rawText);
    const normalized = normalizeAnswerSet(parsed);
    if (!normalized) return { ok: false, error: 'JSON answers không hợp lệ' };
    normalized.answers = normalized.answers.map(answer => ({
        ...answer,
        confidence: answer.confidence || 0.95,
        source: answer.source || normalized.source || 'import',
    }));
    S.runtime.quiz.importedAnswerSet = normalized;
    S.runtime.quiz.lastPayload = S.runtime.quiz.lastPayload || buildQuizPayload();
    setLastAction(`Đã nạp ${normalized.answers.length} đáp án JSON`);
    persistRuntimeSoon();
    return { ok: true, count: normalized.answers.length };
}

function getImportedAnswerMap() {
    const imported = S.runtime.quiz.importedAnswerSet;
    if (!imported?.answers?.length) return new Map();
    return new Map(imported.answers.map(answer => [answer.questionHash, answer]));
}

function chooseIndexFromRecord(questionRecord, record) {
    if (!record) return null;
    if (Number.isInteger(record.selectedIndex) && record.selectedIndex >= 0 && record.selectedIndex < questionRecord.choiceNodes.length) return record.selectedIndex;
    if (record.selectedValue) {
        const normalized = normalizeText(record.selectedValue).toLowerCase();
        const exactIndex = questionRecord.choiceTexts.findIndex(choice => normalizeText(choice).toLowerCase() === normalized);
        if (exactIndex >= 0) return exactIndex;
        const containsIndex = questionRecord.choiceTexts.findIndex(choice => normalizeText(choice).toLowerCase().includes(normalized) || normalized.includes(normalizeText(choice).toLowerCase()));
        if (containsIndex >= 0) return containsIndex;
    }
    return null;
}

function findAnswerCandidate(questionRecord) {
    const importedMap = getImportedAnswerMap();
    const imported = importedMap.get(questionRecord.questionHash) || importedMap.get(questionRecord.legacyHash) || null;
    if (imported) {
        S.logger?.debug('quiz', 'candidate:found', `Found imported answer for Q${questionRecord.index}`, { hash: questionRecord.questionHash.slice(0, 20) });
        return imported;
    }
    const cached = S.cache[questionRecord.questionHash] || S.cache[questionRecord.legacyHash] || null;
    if (cached) {
        S.logger?.debug('quiz', 'candidate:cached', `Found cached answer for Q${questionRecord.index}`, { 
            hash: questionRecord.questionHash.slice(0, 20),
            hasVerified: cached.verifiedCorrect,
            confidence: cached.confidence,
            hasSelectedIndex: Number.isInteger(cached.selectedIndex)
        });
    } else {
        S.logger?.debug('quiz', 'candidate:miss', `No cache for Q${questionRecord.index}`, { 
            hash: questionRecord.questionHash.slice(0, 20),
            legacyHash: questionRecord.legacyHash,
            cacheKeys: Object.keys(S.cache).slice(0, 5)
        });
    }
    if (cached?.verifiedCorrect) return cached;
    return cached;
}

function getClickableNode(option) {
    if (!(option instanceof HTMLElement)) return null;
    if (option.matches('input')) return option.closest('label') || option;
    const buttonLike = option.closest('button, label, [role="button"]');
    return buttonLike || option;
}

async function clickAnswer(questionRecord, index) {
    const node = getClickableNode(questionRecord.choiceNodes[index]);
    if (!node) return false;
    node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    await sleep(260);
    node.click();
    return true;
}

async function resolveAnswerForQuestion(questionRecord, options = {}) {
    const ignoreCache = options.ignoreCache === true;
    const candidate = ignoreCache ? null : findAnswerCandidate(questionRecord);
    const candidateIndex = chooseIndexFromRecord(questionRecord, candidate);
    if (candidate && candidateIndex !== null && (candidate.verifiedCorrect || candidate.confidence >= 0.45)) return { record: candidate, index: candidateIndex };

    if (S.runtime?.quiz?.skipAiForRun && !ignoreCache) return { record: candidate, index: candidateIndex };

    const aiRecord = await resolveAnswerViaAI(questionRecord);
    const aiIndex = chooseIndexFromRecord(questionRecord, aiRecord);
    if (aiRecord && aiIndex !== null && aiRecord.confidence >= 0.45) {
        S.cache[questionRecord.questionHash] = aiRecord;
        S.storage.saveCacheRecord(aiRecord);
        return { record: aiRecord, index: aiIndex };
    }
    return { record: candidate, index: candidateIndex };
}

function getSubmitCandidateScore(node) {
    if (!(node instanceof HTMLElement)) return -1;
    const text = normalizeText(node.textContent || node.getAttribute('aria-label') || '').toLowerCase();
    if (!text) return -1;
    if (/(làm lại|restart|retry)/.test(text)) return -1;
    if (/(nộp bài|nộp quiz|submit quiz|hoàn tất|finish)/.test(text)) return 100;
    if (/(nộp|submit|kiểm tra|check)/.test(text)) return 80;
    return -1;
}

function findQuizSubmitNodeFallback() {
    const root = getQuizRoot();
    const pools = [];
    if (root) pools.push(...root.querySelectorAll('button, [role="button"], input[type="submit"], .submit, [data-testid*="submit"]'));
    pools.push(...document.querySelectorAll('button, [role="button"], input[type="submit"], .submit, [data-testid*="submit"]'));

    let bestNode = null;
    let bestScore = -1;
    for (const node of pools) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches('button:disabled, input:disabled')) continue;
        if (node.getAttribute('aria-disabled') === 'true') continue;
        const score = getSubmitCandidateScore(node);
        if (score <= bestScore) continue;
        bestNode = node;
        bestScore = score;
    }
    return bestNode;
}

async function submitQuizIfPossible() {
    const caps = detectPageCapabilities(true);
    const capabilityNode = caps.quizSubmit?.matched ? caps.quizSubmit.node : null;
    const submitNode = capabilityNode || findQuizSubmitNodeFallback();
    if (!submitNode) return { submitted: false, reason: 'submit-not-found' };
    submitNode.scrollIntoView({ block: 'center', behavior: 'smooth' });
    await sleep(250);
    submitNode.click();
    return { submitted: true, reason: 'clicked-submit' };
}

async function solveQuiz() {
    const root = getQuizRoot();
    if (!root) return { ok: false, waitingUser: true, reason: 'quiz-not-found' };
    const containers = collectQuizContainers(root);
    const extracted = containers.map((container, index) => extractQuestionRecord(container, index));
    const questions = extracted.filter(Boolean);
    if (!questions.length) return { ok: false, waitingUser: true, reason: 'question-not-found' };

    const droppedCount = containers.length - questions.length;
    if (droppedCount > 0) {
        S.logger?.warn('quiz', 'payload:dropped', `Bỏ qua ${droppedCount} block không trích được lựa chọn`, {
            containerCount: containers.length,
            extractedCount: questions.length,
            droppedPreview: extracted
                .map((item, idx) => ({ item, idx, text: normalizeText(containers[idx]?.textContent || '').slice(0, 120) }))
                .filter(entry => !entry.item)
                .slice(0, 4),
        });
    }

    const hashCounter = new Map();
    questions.forEach(q => hashCounter.set(q.questionHash, (hashCounter.get(q.questionHash) || 0) + 1));
    const duplicateHashes = [...hashCounter.entries()].filter(([, count]) => count > 1);
    if (duplicateHashes.length) {
        S.logger?.warn('quiz', 'payload:duplicate-hash', `Phát hiện ${duplicateHashes.length} hash trùng`, {
            duplicates: duplicateHashes.slice(0, 6),
        });
    }
    S.logger?.info('quiz', 'payload:summary', `Đã copy ${questions.length} câu từ web`, {
        total: questions.length,
        preview: questions.slice(0, 3).map(q => ({
            index: q.index + 1,
            hash: q.questionHash,
            text: q.questionText.slice(0, 120),
            choiceCount: q.choiceTexts.length,
            choices: q.choiceTexts.slice(0, 4),
        })),
    });
    S.logger?.debug('quiz', 'payload:full', `Full copied questions payload`, {
        total: questions.length,
        questions: questions.map(q => ({
            index: q.index + 1,
            questionHash: q.questionHash,
            legacyHash: q.legacyHash,
            questionText: q.questionText,
            choices: q.choiceTexts,
            choiceCount: q.choiceTexts.length,
        })),
    });
    const payloadText = questions.map(q => {
        const optionsText = q.choiceTexts.map((choice, choiceIndex) => `  [${choiceIndex}] ${choice}`).join('\n');
        return `Q${q.index + 1}: ${q.questionText}\n${optionsText}`;
    }).join('\n\n');
    S.logger?.debug('quiz', 'payload:text', `Copied questions as plain text\n${payloadText}`);

    // Cập nhật progress với số câu hỏi thực tế (không phải số DOM node sai)
    S.ui?.setProgress?.({
        done: 0,
        total: questions.length,
        percent: 0,
        source: 'quiz-actual',
        flags: { video: false, quiz: true, hw: false },
    });
    setLastAction(`Tìm thấy ${questions.length} câu hỏi`);

    S.runtime.quiz.lastPayload = buildQuizPayload();
    S.runtime.quiz.pendingQuestionHashes = questions.map(question => question.questionHash);
    S.runtime.quiz.skipAiForRun = false;
    updateStats({ quizzesDetected: S.stats.quizzesDetected + 1 });

    const forceBatchAi = true;
    S.logger?.info('quiz', 'mode', forceBatchAi ? 'AI-first mode: copy -> batch AI -> fill' : 'Cache-first mode');

    const missingCandidates = [];
    for (const q of questions) {
        if (forceBatchAi) {
            missingCandidates.push(q);
            continue;
        }
        const candidate = findAnswerCandidate(q);
        const candidateIndex = chooseIndexFromRecord(q, candidate);
        if (!(candidate && candidateIndex !== null && (candidate.verifiedCorrect || candidate.confidence >= 0.45))) {
            missingCandidates.push(q);
        }
    }

    const batchMapByQuestionIndex = new Map();
    if (missingCandidates.length > 0) {
        if (!S.runtime.active) return { ok: false, waitingUser: true, reason: 'automation-stopped' };
        S.logger?.info('quiz', 'batch', `Gửi ${missingCandidates.length}/${questions.length} câu cần AI giải`);
        const batchResults = await resolveAnswersBatchViaAI(missingCandidates);
        if (batchResults) {
            let cachedCount = 0;
            batchResults.forEach((res, idx) => {
                if (res) {
                    const qHash = missingCandidates[idx].questionHash;
                    const qIndex = missingCandidates[idx].index;
                    S.cache[qHash] = res;
                    S.storage.saveCacheRecord(res);
                    batchMapByQuestionIndex.set(qIndex, res);
                    cachedCount++;
                    S.logger?.debug('quiz', 'batch:cached', `Cached answer for Q${idx}: idx=${res.selectedIndex} conf=${res.confidence}`);
                }
            });
            S.logger?.info('quiz', 'batch:done', `Đã cache ${cachedCount}/${missingCandidates.length} đáp án từ batch AI`);
        } else {
            S.logger?.warn('quiz', 'batch', 'Lỗi batch AI; bỏ qua AI từng câu trong lượt này');
        }
        S.runtime.quiz.skipAiForRun = false;
    }

    S.logger?.info('quiz', 'apply:start', `Bắt đầu điền đáp án sau khi AI trả về`, {
        totalQuestions: questions.length,
        batchResolved: batchMapByQuestionIndex.size,
        forceBatchAi,
    });

    let applied = 0;
    let missingCount = 0;
    let waitingUser = false;
    const selectedAnswers = [];
    for (const question of questions) {
        if (!S.runtime.active) {
            return { ok: false, waitingUser: true, reason: 'automation-stopped' };
        }
        const batchRecord = batchMapByQuestionIndex.get(question.index) || null;
        let resolved = null;
        if (batchRecord) {
            resolved = { record: batchRecord, index: chooseIndexFromRecord(question, batchRecord) };
        }
        if (!resolved || resolved.index === null) {
            resolved = await resolveAnswerForQuestion(question, { ignoreCache: forceBatchAi });
        }
        if (!S.runtime.active) {
            return { ok: false, waitingUser: true, reason: 'automation-stopped' };
        }
        if (resolved.index === null) {
            waitingUser = true;
            missingCount += 1;
            selectedAnswers.push({
                questionNo: question.index + 1,
                selectedIndex: null,
                selectedText: '',
                questionText: question.questionText,
            });
            S.logger?.warn('quiz', 'answer:missing', `[${question.index + 1}/${questions.length}] Không có đáp án`, { questionText: question.questionText.substring(0, 80) });
            continue;
        }
        const ok = await clickAnswer(question, resolved.index);
        if (!ok) {
            waitingUser = true;
            continue;
        }
        applied++;
        S.stats.answersApplied += 1;
        const record = makeCacheRecord(question.questionHash, resolved.index, question.choiceTexts[resolved.index], resolved.record?.source || 'auto', {
            confidence: resolved.record?.confidence || 0.5,
            verifiedCorrect: resolved.record?.verifiedCorrect === true,
        });
        S.cache[question.questionHash] = record;
        S.storage.saveCacheRecord(record);
        selectedAnswers.push({
            questionNo: question.index + 1,
            selectedIndex: resolved.index,
            selectedText: question.choiceTexts[resolved.index] || '',
            questionText: question.questionText,
        });
        // Cập nhật progress sau mỗi câu được click
        setLastAction(`Câu ${applied}/${questions.length}: Đã chọn đáp án`);
        S.ui?.setProgress?.({
            done: applied,
            total: questions.length,
            percent: Math.round((applied / questions.length) * 100),
            source: 'quiz-actual',
            flags: { video: false, quiz: true, hw: false },
        });
        await humanDelay(220, 340);
    }
    persistStatsSoon();

    const selectedTextBlock = selectedAnswers
        .map(item => `Q${item.questionNo}: [${item.selectedIndex === null ? '?' : item.selectedIndex}] ${item.selectedText || '(missing)'}`)
        .join('\n');
    S.logger?.info('quiz', 'answer:selected', `Selected answers before submit\n${selectedTextBlock}`);
    S.logger?.debug('quiz', 'answer:selected:full', 'Selected answers detail', { answers: selectedAnswers });

    if (missingCount > 0 || applied < questions.length) {
        const detail = `Mới điền ${applied}/${questions.length} câu. Còn thiếu ${Math.max(0, questions.length - applied)} câu`;
        S.logger?.warn('quiz', 'fill:incomplete', detail, { applied, total: questions.length, missingCount });
        setState('waiting-user', { capability: 'quiz', detail });
        return { ok: false, waitingUser: true, reason: 'incomplete-fill', applied, total: questions.length };
    }

    if (!applied) {
        if (S.runtime.state !== 'waiting-user') {
            setState('waiting-user', { capability: 'quiz', detail: 'Không tìm được đáp án đủ tin cậy' });
        }
        return { ok: false, waitingUser: true, reason: 'no-answer-applied' };
    }

    if (!S.settings.automation.autoSubmitQuiz) {
        setState('waiting-user', { capability: 'quiz', detail: 'Đã điền đáp án, chờ người dùng nộp bài' });
        return { ok: true, applied, waitingUser: true, reason: 'submit-disabled' };
    }

    const submit = await submitQuizIfPossible();
    if (!submit.submitted) {
        setState('running-quiz', { capability: 'quiz', detail: 'Đã điền đáp án, đang tìm nút nộp' });
        return { ok: true, applied, waitingUser: false, reason: submit.reason };
    }

    S.runtime.quiz.awaitingNetwork = true;
    S.runtime.quiz.lastSubmittedAt = nowTs();
    setState('running-quiz', { capability: 'quiz', detail: 'Đã nộp quiz, chờ phản hồi' });
    S.logger?.info('quiz', 'submit', 'Submitted quiz automatically', { pending: S.runtime.quiz.pendingQuestionHashes.length });
    persistRuntimeSoon();
    return { ok: true, applied, submitted: true };
}

function markPendingAnswersVerified() {
    for (const questionHash of S.runtime.quiz.pendingQuestionHashes) {
        const existing = S.cache[questionHash];
        if (!existing) continue;
        const next = { ...existing, verifiedCorrect: true, updatedAt: nowTs() };
        S.cache[questionHash] = next;
        S.storage.saveCacheRecord(next);
    }
}

function parseNetworkPayload(payload) {
    if (!payload || typeof payload !== 'object') return null;
    const url = typeof payload.url === 'string' ? payload.url : '';
    if (!url || !/(problem_check|submit_quiz|handler\/xmodule_handler|answer)/.test(url)) return null;
    const response = typeof payload.response === 'string' ? safeJsonParse(payload.response) : payload.response;
    if (!response || typeof response !== 'object') return null;
    return { url, response };
}

function extractScoreRatioFromValue(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number' && Number.isFinite(value)) {
        if (value >= 0 && value <= 1) return value;
        return null;
    }
    if (typeof value === 'string') {
        const text = normalizeText(value);
        if (!text) return null;
        const frac = text.match(/([0-9]+(?:\.[0-9]+)?)\s*\/\s*([0-9]+(?:\.[0-9]+)?)/);
        if (frac) {
            const earned = Number(frac[1]);
            const total = Number(frac[2]);
            if (Number.isFinite(earned) && Number.isFinite(total) && total > 0) return earned / total;
        }
        const parsed = Number(text.replace(',', '.'));
        if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) return parsed;
    }
    return null;
}

function extractScoreRatio(data) {
    if (!data || typeof data !== 'object') return null;
    const direct = [
        data.score,
        data.grade,
        data.result?.score,
        data.result?.grade,
        data.data?.score,
        data.data?.grade,
    ];
    for (const candidate of direct) {
        const ratio = extractScoreRatioFromValue(candidate);
        if (ratio !== null) return ratio;
    }
    return null;
}

function extractScoreRatioFromDom() {
    const text = normalizeText(document.body?.innerText || '');
    if (!text) return null;
    const match = text.match(/kết\s*quả\s*[:：]?\s*([0-9]+(?:\.[0-9]+)?)\s*\/\s*([0-9]+(?:\.[0-9]+)?)/i);
    if (!match) return null;
    const earned = Number(match[1]);
    const total = Number(match[2]);
    if (!Number.isFinite(earned) || !Number.isFinite(total) || total <= 0) return null;
    return earned / total;
}

function handleQuizNetworkPayload(payload) {
    const parsed = parseNetworkPayload(payload);
    if (!parsed || !S.runtime.active) return;

    const data = parsed.response;
    let correct = null;
    if (data.correct_map && typeof data.correct_map === 'object') {
        const values = Object.values(data.correct_map);
        if (values.length) correct = values.every(item => item?.correctness === 'correct');
    } else if (data.is_correct === true) {
        correct = true;
    } else if (data.is_correct === false || data.success === false) {
        correct = false;
    } else {
        const scoreRatio = extractScoreRatio(data);
        if (scoreRatio !== null) {
            correct = scoreRatio >= 0.999;
            S.logger?.info('quiz', 'submit:score-ratio', `Score ratio detected ${(scoreRatio * 100).toFixed(1)}%`, { ratio: scoreRatio });
        } else if (data.passed === true) {
            const domRatio = extractScoreRatioFromDom();
            if (domRatio !== null) {
                correct = domRatio >= 0.999;
                S.logger?.info('quiz', 'submit:score-dom', `DOM score ratio detected ${(domRatio * 100).toFixed(1)}%`, { ratio: domRatio });
            } else {
                correct = false;
                S.logger?.warn('quiz', 'submit:ambiguous-pass', 'Received passed=true but no full-correct proof; treating as incorrect for retry');
            }
        } else if (data.passed === false) {
            correct = false;
        }
    }

    if (correct === null) return;

    if (correct) {
        markPendingAnswersVerified();
        S.runtime.quiz.awaitingNetwork = false;
        S.runtime.quiz.attempts = 0;
        updateStats({ answersVerified: S.stats.answersVerified + S.runtime.quiz.pendingQuestionHashes.length });
        setState('ready', { capability: 'quiz', detail: 'Quiz đã được xác nhận đúng' });
        S.ui?.toast?.('Quiz đúng, chuẩn bị sang bài tiếp theo', 'ok', 2600);
        if (S.settings.automation.autoNextLesson) scheduleRun('quiz-verified', 900);
        return;
    }

    S.runtime.quiz.attempts += 1;
    S.runtime.quiz.awaitingNetwork = false;
    const maxRetries = S.settings.automation.maxQuizRetries;
    S.logger?.warn('quiz', 'submit:incorrect', `Attempt ${S.runtime.quiz.attempts}/${maxRetries}`);
    if (S.runtime.quiz.attempts < maxRetries) {
        setState('running-quiz', { capability: 'quiz', detail: `Quiz sai, thử lại lần ${S.runtime.quiz.attempts + 1}` });
        scheduleRun('quiz-retry', 1400);
    } else {
        setState('waiting-user', { capability: 'quiz', detail: 'Quiz sai nhiều lần, chuyển sang chờ người dùng' });
        S.ui?.toast?.('Quiz chưa xác nhận đúng, cần kiểm tra thủ công', 'warn', 3400);
    }
}

