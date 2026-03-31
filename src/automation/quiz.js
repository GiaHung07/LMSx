async function callAI(question, choices) {
    const provider = S.aiProvider || 'gemini';
    const key = S.apiKeys[provider];
    if (!key) { S.ui?.toast(`Vui lòng nhập API Key cho ${provider.toUpperCase()}`, 'warn'); return null; }
    
    if (provider === 'gemini') return callGemini(key, question, choices);
    if (provider === 'openai') return callOpenAI(key, question, choices);
    if (provider === 'claude') return callClaude(key, question, choices);
    return null;
}

async function callOpenAI(key, question, choices) {
    try {
        S.ui?.setLog('Phân tích qua ChatGPT...', 'on');
        const prompt = `You are an elite academic expert and multiple-choice question analyst with decades of experience across all academic disciplines including Computer Science, Mathematics, Physics, Chemistry, Biology, History, Literature, Law, Economics, and more.
Your singular mission: Analyze the given question and identify the single correct answer with maximum precision.

═══════════════════════════════════════════
CHAIN-OF-THOUGHT REASONING PROTOCOL
═══════════════════════════════════════════
Before answering, you MUST silently execute these steps:
STEP 1 — DECONSTRUCT THE QUESTION
  • Identify the subject domain and topic
  • Extract the core concept being tested
  • Flag any negation words: "KHÔNG", "NGOẠI TRỪ", "SAI", "không phải", "except", "not", "never"
  • Flag superlatives: "đầu tiên", "duy nhất", "tốt nhất", "chính xác nhất", "luôn luôn", "tất cả"

STEP 2 — TRAP DETECTION (Critical)
  • Identify distractor choices designed to mislead
  • Watch for: partially correct answers, reversed logic, common misconceptions
  • Watch for: choices that sound correct but fail edge cases
  • Watch for: absolute statements that are almost always false

STEP 3 — EVALUATE EACH CHOICE
  • Assess each option independently against verified knowledge
  • Eliminate definitively wrong options first
  • For remaining candidates, apply domain-specific rules

STEP 4 — CROSS-VALIDATE
  • Confirm your chosen answer directly satisfies the question's exact requirement
  • Re-read the question one final time with your answer in mind
  • If negation was detected, double-check your logic is inverted correctly

═══════════════════════════════════════════
QUESTION & CHOICES
═══════════════════════════════════════════
Question: "${question}"

Choices:
${choices.map((c, i) => `[${i}] ${c}`).join('\n')}

═══════════════════════════════════════════
ABSOLUTE OUTPUT RULES — NO EXCEPTIONS
═══════════════════════════════════════════
⚠️  YOUR ENTIRE RESPONSE MUST BE EXACTLY ONE RAW JSON OBJECT.
⚠️  DO NOT output markdown, code fences, explanations, greetings, or ANY text outside the JSON.
⚠️  DO NOT wrap in \`\`\`json ... \`\`\`. Return pure JSON only.
⚠️  The "index" field MUST be a plain integer (0, 1, 2, ...) matching the [ ] bracket number.
⚠️  Failure to follow this format will cause system crash. There is NO fallback.

Required JSON schema (strict):
{
  "reasoning": "<Your full chain-of-thought: domain identification → trap detection → elimination → final validation. Be thorough. This is where accuracy is built.>",
  "index": <integer_only>
}`;
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.1, response_format: { type: "json_object" } })
        });
        const data = await res.json();
        if (data.error) { console.error('[LMSX] OpenAI Error:', data.error); S.ui?.toast(`Lỗi ChatGPT: ${data.error.message}`, 'error', 6000); return null; }
        const text = data.choices?.[0]?.message?.content?.trim();
        if (text) { const json = JSON.parse(text); return parseInt(json.index); }
    } catch (e) {
        console.error('[LMSX] OpenAI Net:', e); S.ui?.toast('Lỗi kết nối OpenAI', 'error');
    }
    return null;
}

async function callClaude(key, question, choices) {
    try {
        S.ui?.setLog('Phân tích qua Claude...', 'on');
        const prompt = `You are an elite academic expert and multiple-choice question analyst with decades of experience across all academic disciplines including Computer Science, Mathematics, Physics, Chemistry, Biology, History, Literature, Law, Economics, and more.
Your singular mission: Analyze the given question and identify the single correct answer with maximum precision.

═══════════════════════════════════════════
CHAIN-OF-THOUGHT REASONING PROTOCOL
═══════════════════════════════════════════
Before answering, you MUST silently execute these steps:
STEP 1 — DECONSTRUCT THE QUESTION
  • Identify the subject domain and topic
  • Extract the core concept being tested
  • Flag any negation words: "KHÔNG", "NGOẠI TRỪ", "SAI", "không phải", "except", "not", "never"
  • Flag superlatives: "đầu tiên", "duy nhất", "tốt nhất", "chính xác nhất", "luôn luôn", "tất cả"

STEP 2 — TRAP DETECTION (Critical)
  • Identify distractor choices designed to mislead
  • Watch for: partially correct answers, reversed logic, common misconceptions
  • Watch for: choices that sound correct but fail edge cases
  • Watch for: absolute statements that are almost always false

STEP 3 — EVALUATE EACH CHOICE
  • Assess each option independently against verified knowledge
  • Eliminate definitively wrong options first
  • For remaining candidates, apply domain-specific rules

STEP 4 — CROSS-VALIDATE
  • Confirm your chosen answer directly satisfies the question's exact requirement
  • Re-read the question one final time with your answer in mind
  • If negation was detected, double-check your logic is inverted correctly

═══════════════════════════════════════════
QUESTION & CHOICES
═══════════════════════════════════════════
Question: "${question}"

Choices:
${choices.map((c, i) => `[${i}] ${c}`).join('\n')}

═══════════════════════════════════════════
ABSOLUTE OUTPUT RULES — NO EXCEPTIONS
═══════════════════════════════════════════
⚠️  YOUR ENTIRE RESPONSE MUST BE EXACTLY ONE RAW JSON OBJECT.
⚠️  DO NOT output markdown, code fences, explanations, greetings, or ANY text outside the JSON.
⚠️  DO NOT wrap in \`\`\`json ... \`\`\`. Return pure JSON only.
⚠️  The "index" field MUST be a plain integer (0, 1, 2, ...) matching the [ ] bracket number.
⚠️  Failure to follow this format will cause system crash. There is NO fallback.

Required JSON schema (strict):
{
  "reasoning": "<Your full chain-of-thought: domain identification → trap detection → elimination → final validation. Be thorough. This is where accuracy is built.>",
  "index": <integer_only>
}`;
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
            body: JSON.stringify({ model: 'claude-3-5-sonnet-latest', max_tokens: 100, temperature: 0.1, messages: [{ role: 'user', content: prompt }] })
        });
        const data = await res.json();
        if (data.error) { console.error('[LMSX] Claude Error:', data.error); S.ui?.toast(`Lỗi Claude: ${data.error.message}`, 'error', 6000); return null; }
        let text = data.content?.[0]?.text?.trim() || '';
        text = text.replace(/```json|```/gi, '').trim(); 
        if (text) { const json = JSON.parse(text); return parseInt(json.index); }
    } catch (e) {
        console.error('[LMSX] Claude Net:', e); S.ui?.toast('Lỗi kết nối Claude', 'error');
    }
    return null;
}

async function callGemini(key, question, choices) {
    try {
        S.ui?.setLog('Phân tích qua Gemini...', 'on');
        const prompt = `You are an elite academic expert and multiple-choice question analyst with decades of experience across all academic disciplines including Computer Science, Mathematics, Physics, Chemistry, Biology, History, Literature, Law, Economics, and more.
Your singular mission: Analyze the given question and identify the single correct answer with maximum precision.

═══════════════════════════════════════════
CHAIN-OF-THOUGHT REASONING PROTOCOL
═══════════════════════════════════════════
Before answering, you MUST silently execute these steps:
STEP 1 — DECONSTRUCT THE QUESTION
  • Identify the subject domain and topic
  • Extract the core concept being tested
  • Flag any negation words: "KHÔNG", "NGOẠI TRỪ", "SAI", "không phải", "except", "not", "never"
  • Flag superlatives: "đầu tiên", "duy nhất", "tốt nhất", "chính xác nhất", "luôn luôn", "tất cả"

STEP 2 — TRAP DETECTION (Critical)
  • Identify distractor choices designed to mislead
  • Watch for: partially correct answers, reversed logic, common misconceptions
  • Watch for: choices that sound correct but fail edge cases
  • Watch for: absolute statements that are almost always false

STEP 3 — EVALUATE EACH CHOICE
  • Assess each option independently against verified knowledge
  • Eliminate definitively wrong options first
  • For remaining candidates, apply domain-specific rules

STEP 4 — CROSS-VALIDATE
  • Confirm your chosen answer directly satisfies the question's exact requirement
  • Re-read the question one final time with your answer in mind
  • If negation was detected, double-check your logic is inverted correctly

═══════════════════════════════════════════
QUESTION & CHOICES
═══════════════════════════════════════════
Question: "${question}"

Choices:
${choices.map((c, i) => `[${i}] ${c}`).join('\n')}

═══════════════════════════════════════════
ABSOLUTE OUTPUT RULES — NO EXCEPTIONS
═══════════════════════════════════════════
⚠️  YOUR ENTIRE RESPONSE MUST BE EXACTLY ONE RAW JSON OBJECT.
⚠️  DO NOT output markdown, code fences, explanations, greetings, or ANY text outside the JSON.
⚠️  DO NOT wrap in \`\`\`json ... \`\`\`. Return pure JSON only.
⚠️  The "index" field MUST be a plain integer (0, 1, 2, ...) matching the [ ] bracket number.
⚠️  Failure to follow this format will cause system crash. There is NO fallback.

Required JSON schema (strict):
{
  "reasoning": "<Your full chain-of-thought: domain identification → trap detection → elimination → final validation. Be thorough. This is where accuracy is built.>",
  "index": <integer_only>
}`;
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, responseMimeType: "application/json" } })
        });
        const data = await res.json();
        if (data.error) { console.error('[LMSX] Gemini Error:', data.error); S.ui?.toast(`Lỗi AI: ${data.error.message}`, 'error', 6000); return null; }
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) {
            const json = JSON.parse(text);
            return parseInt(json.index);
        }
    } catch (e) { 
        console.error('[LMSX] Gemini Net:', e); S.ui?.toast('Lỗi Parse JSON từ Gemini AI', 'error', 4000);
    }
    return null;
}

// ── QUIZ ─────────────────────────────────────────────────────
async function solveQuiz() {
    const quizBody = document.querySelector('[class*="lesson-quiz-styles__QuizBody"], [class*="QuizBody"], [class*="QuizContent"]');
    if (!quizBody) {
        const xb = document.querySelector('.xblock-problem');
        if (xb) return solveXBlock(xb);
        return false;
    }
    const questions = quizBody.querySelectorAll('[class*="Question"]:not([class*="QuestionList"])');
    const targets = questions.length ? questions : quizBody.querySelectorAll('[class*="OptionList"]');
    for (const q of targets) await solveOneQ(q);
    await humanDelay(1500, 3000);
    // Đoạn code bấm Nộp bài / Kiểm tra đã bị loại bỏ theo yêu cầu: "không auto next/ném bài"
    S.ui?.toast('AI đã điền xong đáp án!', 'ok');
    return true;
}

async function solveOneQ(container) {
    let questionText = '';
    for (const l of container.querySelectorAll('label, [class*="Label"], [class*="question"]')) { if (l.textContent.trim().length > 10) { questionText = l.textContent.trim(); break; } }
    if (!questionText) { const h = container.closest('[class*="Question"]')?.querySelector('h2, h3, h4'); questionText = h?.textContent?.trim() || container.textContent.substring(0, 200).trim(); }
    let options = [...container.querySelectorAll('[role="button"][aria-pressed]')];
    if (!options.length) options = [...container.querySelectorAll('[class*="Option"]:not([class*="OptionList"]), [class*="choice"], input[type="radio"]')];
    if (!options.length) return;
    const choiceTexts = options.map(o => (o.querySelector('label')?.textContent || o.textContent).trim());
    const qId = questionText.substring(0, 50).replace(/\s+/g, '_');
    S.quizState.qId = qId;
    const cached = localStorage.getItem(`lms_q_${qId}`);
    if (cached !== null) { const i = parseInt(cached); if (i >= 0 && i < options.length) { await humanDelay(500, 1500); options[i].click(); return; } }
    if (S.apiKeys[S.aiProvider] && S.quizState.attempts === 0) {
        S.ui?.setLog('AI đang phân tích câu hỏi...', 'on');
        const aiIdx = await callAI(questionText, choiceTexts);
        if (typeof aiIdx === 'number' && typeof aiIdx !== 'NaN' && aiIdx >= 0 && aiIdx < options.length) {
            S.ui?.setLog('AI chốt: Đáp án ' + (aiIdx + 1), 'off'); 
            S.ui?.toast(`AI chọn đáp án: ${aiIdx + 1}`, 'ok');
            await humanDelay(1000, 2000); 
            options[aiIdx].click(); 
            localStorage.setItem(`lms_q_${qId}`, aiIdx.toString()); 
            return; 
        } else {
            S.ui?.setLog('AI Fail → Dùng Fallback...', 'warn');
        }
    }
    const idx = S.quizState.attempts % options.length;
    await humanDelay(800, 2000); options[idx].click();
}

async function solveXBlock(c) {
    for (const g of c.querySelectorAll('.choicegroup, .field')) {
        const inps = [...g.querySelectorAll('input[type="radio"]')]; if (!inps.length) continue;
        const idx = S.quizState.attempts % inps.length; await humanDelay(800, 2000); inps[idx].click();
    }
    await humanDelay(1000, 2000);
    // Đoạn code bấm submit XBlock đã bị bỏ
    return true;
}
