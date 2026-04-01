function extractAiKeyCandidate(rawValue = '') {
    const text = String(rawValue || '').trim();
    if (!text) return '';
    const match = text.match(/AIzaSy[0-9A-Za-z_-]{33}/);
    return match ? match[0] : text.replace(/\s+/g, '');
}

function pickBestAnswerCandidate(candidates) {
    const valid = candidates.filter(Boolean);
    if (!valid.length) return null;

    const scoreByIndex = new Map();
    valid.forEach(candidate => {
        const idx = candidate.selectedIndex;
        if (!Number.isInteger(idx)) return;
        const current = scoreByIndex.get(idx) || { count: 0, confidence: 0 };
        current.count += 1;
        current.confidence = Math.max(current.confidence, Number(candidate.confidence || 0));
        scoreByIndex.set(idx, current);
    });

    if (!scoreByIndex.size) return valid[0];
    let bestIndex = null;
    let bestCount = -1;
    let bestConfidence = -1;
    scoreByIndex.forEach((entry, idx) => {
        if (entry.count > bestCount || (entry.count === bestCount && entry.confidence > bestConfidence)) {
            bestIndex = idx;
            bestCount = entry.count;
            bestConfidence = entry.confidence;
        }
    });

    return valid
        .filter(candidate => candidate.selectedIndex === bestIndex)
        .sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0))[0] || valid[0];
}

function sanitizeAiKeyInput(rawValue = '') {
    return extractAiKeyCandidate(rawValue).trim();
}

function isLikelyApiKey(provider, value = '') {
    const v = String(value || '').trim();
    if (provider === 'groq') return v.startsWith('gsk_');
    return false;
}

async function testAiKey(provider, rawKey) {
    const key = sanitizeAiKeyInput(rawKey);
    if (!isLikelyApiKey(provider, key)) {
        return { ok: false, status: 'invalid', message: 'API key không đúng định dạng' };
    }

    try {
        if (provider !== 'groq') {
            return { ok: false, status: 'invalid', message: 'Provider không được hỗ trợ' };
        }
        const res = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 }),
        });

        const data = await res.json().catch(() => ({}));
        if (res.ok && !data.error) return { ok: true, status: 'ok', message: 'Key hoạt động bình thường' };

        const message = data.error?.message || `HTTP ${res.status}`;
        if (isPermanentAiError(message)) {
            const expired = /expired/i.test(message);
            return { ok: false, status: expired ? 'expired' : 'invalid', message };
        }
        if (isTemporaryAiThrottle(message) || res.status === 429) {
            return { ok: false, status: 'rate_limited', message };
        }
        return { ok: false, status: 'error', message };
    } catch (error) {
        return { ok: false, status: 'error', message: error?.message || 'Lỗi kết nối' };
    }
}
function getAiProviderConfig() {
    return { provider: 'groq', key: S.settings?.ai?.keys?.groq || '' };
}

function hasConfiguredAiKey() {
    const { provider, key } = getAiProviderConfig();
    const normalizedKey = sanitizeAiKeyInput(key);
    return !!normalizedKey && isLikelyApiKey(provider, normalizedKey);
}

function getMissingAiKeyMessage() {
    return 'Thiếu Groq API key. Hãy mở Cài đặt và nhập key.';
}

function isProviderBlocked(provider, key) {
    const fingerprint = getAiBlockFingerprint(provider, key);
    const blocked = S.runtime?._aiBlocked;
    if (blocked?.fingerprint !== fingerprint) return false;
    // Check if block is still active (temporary blocks have retryAt)
    if (blocked.retryAt && blocked.retryAt > nowTs()) return true;
    // Permanent blocks don't have retryAt
    if (!blocked.retryAt) return true;
    return false;
}

function getAiBlockFingerprint(provider, key) {
    return `${provider}:${String(key || '').slice(-8)}`;
}

function clearAiBlockIfKeyChanged(provider, key) {
    const nextFingerprint = getAiBlockFingerprint(provider, key);
    if (!S.runtime?._aiBlocked) return;
    if (S.runtime._aiBlocked.fingerprint !== nextFingerprint) {
        delete S.runtime._aiBlocked;
        return;
    }
    if (S.runtime._aiBlocked.retryAt && S.runtime._aiBlocked.retryAt <= nowTs()) {
        delete S.runtime._aiBlocked;
    }
}

function parseRetryAfterMs(message = '') {
    const match = String(message || '').match(/retry in\s+([0-9]+(?:\.[0-9]+)?)s/i);
    if (!match) return 0;
    return Math.max(0, Math.ceil(Number(match[1]) * 1000));
}

function normalizeAiErrorMessage(error) {
    const rawMessage = String(error?.message || error || '').trim();
    const rawName = String(error?.name || '').trim();
    const text = `${rawName} ${rawMessage}`.toLowerCase();

    if (!text) return 'Lỗi kết nối AI';
    if (
        text.includes('aborterror') ||
        text.includes('signal is aborted') ||
        text.includes('aborted without reason') ||
        text.includes('the operation was aborted') ||
        text.includes('operation was aborted')
    ) {
        return 'Yêu cầu AI hết thời gian phản hồi';
    }
    if (text.includes('failed to fetch') || text.includes('networkerror') || text.includes('load failed')) {
        return 'Không thể kết nối tới Groq';
    }
    return rawMessage || 'Lỗi kết nối AI';
}

function isPermanentAiError(message = '') {
    const text = String(message || '').toLowerCase();
    return (
        text.includes('api key expired') ||
        text.includes('invalid api key') ||
        text.includes('api key not valid') ||
        text.includes('api_key_invalid') ||
        text.includes('permission denied') ||
        text.includes('unauthorized') ||
        text.includes('invalid argument')
    );
}

function isTemporaryAiThrottle(message = '') {
    const text = String(message || '').toLowerCase();
    return (
        text.includes('quota') ||
        text.includes('billing') ||
        text.includes('rate limit') ||
        text.includes('too many') ||
        text.includes('429') ||
        text.includes('restricted') ||
        text.includes('limit') ||
        text.includes('exceeded') ||
        text.includes('resource has been exhausted')
    );
}

function handlePermanentAiFailure(provider, key, message) {
    S.runtime._aiBlocked = {
        provider,
        fingerprint: getAiBlockFingerprint(provider, key),
        message: 'Lỗi API',
        at: nowTs(),
    };
    clearRunnerTimer?.();
    setActive(false, 'fatal-ai-error');

    const PROVIDER_LABELS = { groq: 'Groq' };
    const providerLabel = PROVIDER_LABELS[provider] || provider;
    let vnMessage = 'Key không hợp lệ';
    const text = String(message || '').toLowerCase();
    if (text.includes('expired') || text.includes('api key expired')) {
        vnMessage = 'Key đã hết hạn';
    } else if (text.includes('invalid') || text.includes('not valid') || text.includes('api_key_invalid')) {
        vnMessage = 'Key sai hoặc không hợp lệ';
    } else if (text.includes('permission') || text.includes('unauthorized')) {
        vnMessage = 'Không có quyền truy cập';
    }

    const friendlyError = `Lỗi ${providerLabel}: ${vnMessage}`;
    S.ui?.toast?.(friendlyError, 'error', 6000);
    setState('waiting-user', {
        capability: 'quiz',
        detail: friendlyError,
    });
}

function handleTemporaryAiThrottle(provider, key, message) {
    const PROVIDER_LABELS = { groq: 'Groq' };
    const providerLabel = PROVIDER_LABELS[provider] || provider;
    const retryMs = parseRetryAfterMs(message) || 10000;
    const retryAt = nowTs() + retryMs;
    const retrySeconds = Math.max(1, Math.ceil(retryMs / 1000));
    S.runtime._aiBlocked = {
        provider,
        fingerprint: getAiBlockFingerprint(provider, key),
        message: 'Rate limited',
        at: nowTs(),
        retryAt,
    };
    clearRunnerTimer?.();
    setActive(false, 'ai-rate-limited');
    const friendlyError = `Lỗi ${providerLabel}: Chạm giới hạn tạm thời, thử lại sau ${retrySeconds}s`;
    S.ui?.toast?.(friendlyError, 'warn', 6000);
    setState('waiting-user', {
        capability: 'quiz',
        detail: friendlyError,
    });
}

const SUBJECT_PROFILES = [
    {
        id: 'marxist_political_economy',
        label: 'Kinh tế chính trị Mác-Lênin',
        patterns: [
            /kinh tế chính trị/i,
            /mác\s*-?\s*lênin/i,
            /marxist political economy/i,
            /hàng hoá|giá trị sử dụng|giá trị hàng hóa|quy luật giá trị|lao động trừu tượng|lao động cụ thể/i,
        ],
        guidance: [
            'Ưu tiên định nghĩa đúng theo giáo trình Kinh tế chính trị Mác-Lênin, không suy luận theo nghĩa đời thường.',
            'Phân biệt rất kỹ các cặp khái niệm: hàng hóa / sản phẩm, giá trị / giá trị sử dụng, lao động cụ thể / lao động trừu tượng, lao động tư nhân / lao động xã hội.',
            'Cảnh giác với đáp án nghe hợp lý nhưng sai đúng một cụm từ như công hữu, công cộng, sở hữu, phân công lao động xã hội, tách biệt kinh tế.',
        ],
    },
    {
        id: 'marxist_philosophy',
        label: 'Triết học Mác-Lênin',
        patterns: [
            /triết học/i,
            /duy vật biện chứng|duy vật lịch sử|lượng chất|phủ định của phủ định|mâu thuẫn biện chứng|ý thức xã hội/i,
        ],
        guidance: [
            'Ưu tiên khái niệm chuẩn của Triết học Mác-Lênin theo giáo trình Việt Nam.',
            'Phân biệt bản chất, hiện tượng, nội dung, hình thức, nguyên nhân, kết quả, khả năng, hiện thực và các cặp phạm trù tương tự.',
            'Với câu hỏi quy luật hay nguyên lý, chọn đáp án đúng và đầy đủ nhất, tránh đáp án chỉ đúng một phần.',
        ],
    },
    {
        id: 'scientific_socialism',
        label: 'Chủ nghĩa xã hội khoa học',
        patterns: [
            /chủ nghĩa xã hội khoa học/i,
            /cnxh khoa học/i,
            /sứ mệnh lịch sử|giai cấp công nhân|thời kỳ quá độ|nhà nước xã hội chủ nghĩa/i,
        ],
        guidance: [
            'Ưu tiên lập luận đúng theo giáo trình Chủ nghĩa xã hội khoa học của các trường đại học Việt Nam.',
            'Phân biệt điều kiện khách quan, nhân tố chủ quan, đặc trưng xã hội chủ nghĩa, thời kỳ quá độ và sứ mệnh lịch sử của giai cấp công nhân.',
        ],
    },
    {
        id: 'ho_chi_minh_thought',
        label: 'Tư tưởng Hồ Chí Minh',
        patterns: [
            /tư tưởng hồ chí minh/i,
            /hồ chí minh/i,
            /độc lập dân tộc gắn liền với chủ nghĩa xã hội|đại đoàn kết|đạo đức cách mạng/i,
        ],
        guidance: [
            'Ưu tiên nội dung đúng theo giáo trình Tư tưởng Hồ Chí Minh và các mệnh đề chuẩn trong học phần.',
            'Cẩn thận với các đáp án gần nghĩa nhưng sai ở mức độ, phạm vi hoặc thứ tự tư tưởng.',
        ],
    },
    {
        id: 'general_political_theory',
        label: 'Lý luận chính trị',
        patterns: [],
        guidance: [
            'Ưu tiên đáp án đúng theo giáo trình đại học Việt Nam và thuật ngữ chuẩn của môn học.',
            'Không chọn theo suy luận đời thường nếu đáp án lệch câu chữ so với định nghĩa học thuật.',
        ],
    },
];

function getRelevantPageTexts() {
    const selectors = [
        'title',
        'h1',
        'h2',
        '.ant-breadcrumb',
        '[class*="course"]',
        '[class*="Course"]',
        '[class*="header"]',
        '[class*="Header"]',
        '[class*="lesson"]',
    ];
    const values = new Set();

    const pushText = text => {
        const normalized = normalizeText(text || '');
        if (normalized.length >= 4) values.add(normalized.slice(0, 240));
    };

    pushText(document.title || '');
    selectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(node => {
            if (!(node instanceof HTMLElement)) return;
            pushText(node.innerText || node.textContent || '');
        });
    });

    return [...values].slice(0, 16);
}

function detectSubjectProfile(question = '', choices = [], extraTexts = []) {
    const haystack = [
        question,
        ...choices,
        ...extraTexts,
        ...getRelevantPageTexts(),
    ].join('\n').toLowerCase();

    let best = SUBJECT_PROFILES[SUBJECT_PROFILES.length - 1];
    let bestScore = -1;
    for (const profile of SUBJECT_PROFILES) {
        const score = profile.patterns.reduce((sum, pattern) => sum + (pattern.test(haystack) ? 1 : 0), 0);
        if (score > bestScore) {
            best = profile;
            bestScore = score;
        }
    }
    return best;
}

function buildSubjectContextBlock(profile, question, choices, extraTexts = []) {
    const pageTexts = [...new Set([...extraTexts, ...getRelevantPageTexts()])].slice(0, 6);
    const contextLines = [];
    contextLines.push(`Subject guess: ${profile.label}`);
    if (pageTexts.length) {
        contextLines.push(`Detected page context: ${pageTexts.join(' | ')}`);
    }
    contextLines.push(`Question focus: ${question}`);
    contextLines.push(`Choices count: ${choices.length}`);
    return contextLines.join('\n');
}

function buildSharedPromptRules(profile) {
    const guidanceLines = profile.guidance.map(line => `- ${line}`).join('\n');
    return `You are an expert assistant for Vietnamese university multiple-choice exams.
Your task is to answer according to the correct academic meaning of the specific subject, not according to casual everyday wording.

Subject-specific guidance:
${guidanceLines}

General reasoning rules:
- First identify the exact concept, law, category, figure, period, or definition being asked.
- Watch carefully for trap words such as "không", "ngoại trừ", "sai", "đúng nhất", "đầy đủ nhất", "bao gồm", "mọi", "tất cả", "chỉ", "duy nhất".
- If several options seem plausible, choose the one that is most standard, most textbook-accurate, and most complete.
- Reject options that are broadly true in life but not the formal textbook definition.
- selectedValue must exactly match one option text from the provided choices.

Strict output rules:
- Return ONLY one raw JSON object.
- No markdown, no code fences, no explanation outside JSON.
- selectedIndex must be a 0-based integer matching one provided option.
- selectedValue must copy the exact option text.
- reason must be short and specific.

Return exactly this schema:
{"selectedIndex": <integer>, "selectedValue": "<exact choice text>", "confidence": 0.95, "reason": "<short rationale>"}`;
}

function buildAiPrompt(question, choices, extraTexts = []) {
    const profile = detectSubjectProfile(question, choices, extraTexts);
    return `${buildSharedPromptRules(profile)}

${buildSubjectContextBlock(profile, question, choices, extraTexts)}

Question:
${question}

Choices:
${choices.map((choice, index) => `[${index}] ${choice}`).join('\n')}`;
}

function buildAiVerifyPrompt(question, choices, candidateIndex, extraTexts = []) {
    const profile = detectSubjectProfile(question, choices, extraTexts);
    return `${buildSharedPromptRules(profile)}

You are validating a previously selected answer.
- Candidate option to verify: [${candidateIndex}]
- Check whether it is truly the best answer according to the textbook meaning of ${profile.label}.
- If it is not the best answer, replace it with the correct one.

${buildSubjectContextBlock(profile, question, choices, extraTexts)}

Question:
${question}

Choices:
${choices.map((choice, index) => `[${index}] ${choice}`).join('\n')}`;
}

function normalizeAiAnswer(raw, questionHash, choices, provider) {
    if (!raw || typeof raw !== 'object') {
        S.logger?.warn('ai', 'normalize:fail', 'raw is not object', { rawType: typeof raw, raw: String(raw).slice(0, 200) });
        return null;
    }
    const rawIndex = raw?.selectedIndex ?? raw?.index;
    const selectedIndex = Number.isInteger(rawIndex) ? rawIndex : (typeof rawIndex === 'number' ? Math.round(rawIndex) : null);
    const selectedValue = typeof raw?.selectedValue === 'string' ? normalizeText(raw.selectedValue) : '';
    // AI often returns 0 confidence from template copying; force minimum 0.85 if it gave us an answer
    let confidence = clamp(Number(raw?.confidence) || 0, 0, 1);
    const hasValue = selectedIndex !== null || !!selectedValue;
    if (!hasValue) {
        S.logger?.warn('ai', 'normalize:empty', 'no selectedIndex or selectedValue', { raw: JSON.stringify(raw).slice(0, 200) });
        return null;
    }
    // If the AI returned an answer but confidence is suspiciously low (e.g. copied schema), boost it
    if (confidence < 0.5 && hasValue) {
        confidence = 0.85;
    }
    return normalizeCacheRecord({
        questionHash,
        selectedIndex,
        selectedValue: selectedValue || (selectedIndex !== null && selectedIndex < choices.length ? choices[selectedIndex] : ''),
        confidence,
        verifiedCorrect: false,
        source: provider,
        updatedAt: nowTs(),
    }, questionHash);
}



async function fetchWithTimeout(url, options, timeoutMs = 30000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        return response;
    } catch (error) {
        throw new Error(normalizeAiErrorMessage(error));
    } finally {
        clearTimeout(id);
    }
}

async function callGroqProvider(key, prompt) {
    const response = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            temperature: 0.1,
            response_format: { type: 'json_object' },
            messages: [{ role: 'user', content: prompt }],
        }),
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message || 'Groq request failed');
    return safeJsonParse(data.choices?.[0]?.message?.content || '');
}

async function resolveAnswerViaAI(questionRecord) {
    const { provider, key } = getAiProviderConfig();
    if (!key) return null;
    clearAiBlockIfKeyChanged(provider, key);
    if (isProviderBlocked(provider, key)) return null;
    return resolveWithProvider(provider, key, questionRecord);
}

async function resolveWithProvider(provider, key, questionRecord, options = {}) {
    const silent = options.silent === true;
    const prompt = options.promptOverride || buildAiPrompt(
        questionRecord.questionText,
        questionRecord.choiceTexts,
        [questionRecord.questionText, ...(questionRecord.choiceTexts || [])],
    );
    if (!silent) {
        S.logger?.info('ai', 'request', `Provider ${provider}`, { questionHash: questionRecord.questionHash });
        setState('waiting-ai', { capability: 'quiz', detail: `Đang hỏi ${provider}` });
    }
    try {
        const raw = await callGroqProvider(key, prompt);
        if (!silent) {
            S.logger?.debug('ai', 'single:raw', 'Raw AI response', { raw: JSON.stringify(raw).slice(0, 300) });
        }
        const normalized = normalizeAiAnswer(raw, questionRecord.questionHash, questionRecord.choiceTexts, provider);
        if (!normalized) throw new Error('Phản hồi AI không đúng định dạng');
        return normalized;
    } catch (error) {
        const message = normalizeAiErrorMessage(error);
        S.logger?.warn('ai', 'request:failed', message, { provider, questionHash: questionRecord.questionHash, silent });
        if (isPermanentAiError(message)) {
            handlePermanentAiFailure(provider, key, message);
        } else if (isTemporaryAiThrottle(message)) {
            handleTemporaryAiThrottle(provider, key, message);
        } else {
            if (!silent) S.ui?.toast?.(`Kết nối lỗi: ${message}`, 'error', 4500);
        }
        return null;
    }
}

function buildAiBatchPrompt(questionsList) {
    const extraTexts = questionsList.flatMap(q => [q.questionText, ...(q.choiceTexts || [])]).slice(0, 40);
    const profile = detectSubjectProfile('', [], extraTexts);
    let block = `${buildSharedPromptRules(profile)}

You will answer a batch of ${questionsList.length} multiple-choice questions from the same course context.
Subject focus for this batch: ${profile.label}

Batch output rules:
- Return ONLY one JSON object.
- The JSON must contain an "answers" array with EXACTLY ${questionsList.length} elements in the same order as the questions.
- Each answer object must use this schema:
{"selectedIndex": <0-based integer>, "selectedValue": "<exact option text>", "confidence": 0.95, "reason": "<very short rationale>"}

Detected page context:
${getRelevantPageTexts().slice(0, 6).join(' | ') || 'N/A'}

`;
    questionsList.forEach((q, i) => {
        block += `Q${i + 1}: ${q.questionText}\n`;
        q.choiceTexts.forEach((c, cIdx) => {
            block += `  [${cIdx}] ${c}\n`;
        });
        block += '\n';
    });
    return block;
}

function shouldRecheckBatchAnswer(questionRecord, answerRecord) {
    if (!questionRecord || !answerRecord) return false;
    const question = normalizeText(questionRecord.questionText || '').toLowerCase();
    const selectedText = normalizeText(answerRecord.selectedValue || '').toLowerCase();
    const trapQuestion = /(không|ngoại trừ|sai|except|not|least|đúng nhất|ý đúng|chọn ý đúng|tác động|gồm|bao gồm)/i.test(question);
    const riskyOption = /(mọi|tất cả|luôn|duy nhất|chỉ|hoàn toàn)/i.test(selectedText);
    const lowConfidence = Number(answerRecord.confidence || 0) < 0.93;
    return trapQuestion || riskyOption || lowConfidence;
}

async function refineRiskyBatchAnswers(questionRecords, results, provider, key) {
    const riskyIndexes = [];
    for (let i = 0; i < questionRecords.length; i++) {
        if (shouldRecheckBatchAnswer(questionRecords[i], results[i])) riskyIndexes.push(i);
    }
    if (!riskyIndexes.length) return results;

    const maxRechecks = Math.min(3, riskyIndexes.length);
    const recheckProvider = provider;
    const recheckKey = key;
    const next = [...results];

    S.logger?.info('ai', 'batch:recheck:start', `Rechecking ${maxRechecks}/${riskyIndexes.length} risky answers`, {
        provider: recheckProvider,
        riskyIndexes: riskyIndexes.slice(0, maxRechecks).map(i => i + 1),
    });

    for (const idx of riskyIndexes.slice(0, maxRechecks)) {
        const questionRecord = questionRecords[idx];
        const current = next[idx];
        const rechecked = await resolveWithProvider(recheckProvider, recheckKey, questionRecord, { silent: true });
        const verifyPrompt = buildAiVerifyPrompt(
            questionRecord.questionText,
            questionRecord.choiceTexts,
            rechecked?.selectedIndex ?? current?.selectedIndex ?? 0,
            [questionRecord.questionText, ...(questionRecord.choiceTexts || [])],
        );
        const verified = await resolveWithProvider(recheckProvider, recheckKey, questionRecord, {
            silent: true,
            promptOverride: verifyPrompt,
        });
        const best = pickBestAnswerCandidate([current, rechecked, verified]);
        if (!best) continue;
        const confidenceGain = Number(best.confidence || 0) - Number(current?.confidence || 0);
        const changedIndex = best.selectedIndex !== current?.selectedIndex;
        if (changedIndex || confidenceGain >= 0.05) {
            next[idx] = best;
            S.logger?.info('ai', 'batch:recheck:updated', `Updated Q${idx + 1} after recheck`, {
                from: current?.selectedIndex,
                to: best.selectedIndex,
                confidenceGain,
                provider: recheckProvider,
            });
        }
    }

    return next;
}

async function resolveAnswersBatchViaAI(questionRecords) {
    const { provider, key } = getAiProviderConfig();
    if (!key || questionRecords.length === 0) return null;
    clearAiBlockIfKeyChanged(provider, key);
    if (isProviderBlocked(provider, key)) return null;
    return resolveBatchWithProvider(provider, key, questionRecords);
}

async function resolveBatchWithProvider(provider, key, questionRecords) {
    const prompt = buildAiBatchPrompt(questionRecords);
    S.logger?.info('ai', 'request', `Batch asking ${provider} ${questionRecords.length} questions`);
    S.logger?.debug('ai', 'batch:prompt:full', 'Full batch prompt sent to AI', {
        provider,
        questionCount: questionRecords.length,
        prompt,
    });
    S.logger?.debug('ai', 'batch:prompt:text', `Prompt plain text sent to AI\n${prompt}`);
    S.logger?.debug('ai', 'batch:input:full', 'Full batch questionRecords input', {
        provider,
        questions: questionRecords.map((q, idx) => ({
            index: idx + 1,
            questionHash: q.questionHash,
            questionText: q.questionText,
            choices: q.choiceTexts,
        })),
    });
    setState('waiting-ai', { capability: 'quiz', detail: `Đang hỏi AI ${questionRecords.length} câu cùng lúc` });
    try {
        const raw = await callGroqProvider(key, prompt);

        S.logger?.info('ai', 'batch:raw', `Raw batch response type=${typeof raw}`, { rawPreview: JSON.stringify(raw).slice(0, 800) });
        S.logger?.debug('ai', 'batch:raw:full', `Full response for debug`, { raw: JSON.stringify(raw) });

        let answers = null;
        S.logger?.debug('ai', 'batch:parse:check', `Checking response structure`, { 
            hasAnswersArray: Array.isArray(raw?.answers), 
            isArray: Array.isArray(raw),
            keys: raw && typeof raw === 'object' ? Object.keys(raw) : 'N/A'
        });
        if (Array.isArray(raw?.answers)) {
            answers = raw.answers;
        } else if (Array.isArray(raw)) {
            answers = raw;
        } else if (raw && typeof raw === 'object') {
            const possibleArrays = Object.values(raw).filter(v => Array.isArray(v));
            if (possibleArrays.length === 1) {
                answers = possibleArrays[0];
                S.logger?.info('ai', 'batch:fallback', `Tìm thấy mảng đáp án ở key khác "answers"`, { count: answers.length });
            }
        }

        if (!answers || answers.length === 0) {
            S.logger?.warn('ai', 'batch:parse-fail', 'Could not extract answers array from response', { 
                rawKeys: raw ? Object.keys(raw) : 'null', 
                rawType: typeof raw,
                rawPreview: JSON.stringify(raw).slice(0, 800) 
            });
            throw new Error('Phản hồi AI không chứa mảng đáp án');
        }

        S.logger?.info('ai', 'batch:parsed', `Got ${answers.length} answers for ${questionRecords.length} questions`);
        
        // DEBUG: Check each answer before processing
        answers.forEach((ans, idx) => {
            S.logger?.debug('ai', 'batch:answer:check', `Q${idx}: ${ans ? 'has data' : 'NULL'}`, { 
                ansType: typeof ans, 
                ansPreview: ans ? JSON.stringify(ans).slice(0, 100) : 'null' 
            });
        });

        while (answers.length < questionRecords.length) {
            answers.push(null);
        }

        const results = questionRecords.map((qr, idx) => {
            const ans = answers[idx];
            if (!qr || !ans) {
                S.logger?.warn('ai', 'batch:item-null', `Answer ${idx} is null/missing`, { hasQr: !!qr, hasAns: !!ans, questionHash: qr?.questionHash?.slice(0, 20) });
                return null;
            }
            S.logger?.debug('ai', 'batch:normalize:start', `Normalizing Q${idx}`, { 
                ansKeys: Object.keys(ans || {}),
                questionHash: qr.questionHash?.slice(0, 20),
                choiceCount: qr.choiceTexts?.length 
            });
            const normalized = normalizeAiAnswer(ans, qr.questionHash, qr.choiceTexts, provider);
            if (!normalized) {
                S.logger?.warn('ai', 'batch:item-fail', `Failed to normalize answer ${idx}`, { ans: JSON.stringify(ans).slice(0, 300), choices: qr.choiceTexts });
            } else {
                S.logger?.debug('ai', 'batch:item-success', `Successfully normalized Q${idx}`, { selectedIndex: normalized.selectedIndex, confidence: normalized.confidence });
            }
            return normalized;
        });

        const refinedResults = await refineRiskyBatchAnswers(questionRecords, results, provider, key);
        const validCount = refinedResults.filter(Boolean).length;
        S.logger?.info('ai', 'batch:result', `Normalized ${validCount}/${questionRecords.length} answers successfully`);

        const selectedIndexCounts = {};
        refinedResults.filter(Boolean).forEach(record => {
            const keyName = Number.isInteger(record.selectedIndex) ? String(record.selectedIndex) : 'null';
            selectedIndexCounts[keyName] = (selectedIndexCounts[keyName] || 0) + 1;
        });
        S.logger?.info('ai', 'batch:distribution', 'Selected index distribution', {
            total: validCount,
            distribution: selectedIndexCounts,
        });

        const maxBucket = Math.max(0, ...Object.values(selectedIndexCounts));
        if (validCount >= 5 && maxBucket >= Math.ceil(validCount * 0.8)) {
            S.logger?.warn('ai', 'batch:suspicious', 'Batch answers are heavily concentrated at one index', {
                distribution: selectedIndexCounts,
            });
        }

        return validCount > 0 ? refinedResults : null;
    } catch (error) {
        const message = normalizeAiErrorMessage(error);
        S.logger?.warn('ai', 'request:failed', message, { provider, batchCount: questionRecords.length });
        if (isPermanentAiError(message)) {
            handlePermanentAiFailure(provider, key, message);
        } else if (isTemporaryAiThrottle(message)) {
            handleTemporaryAiThrottle(provider, key, message);
        } else {
            S.ui?.toast?.(`Lỗi phân tích: ${message}`, 'error', 4500);
        }
        return null;
    }
}
