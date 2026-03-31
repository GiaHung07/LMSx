// Global State & Utilities
const S = {
    shadow: null, active: false,
    stats: { vid: 0, quiz: 0, ok: 0, total: 0 },
    quizState: { attempts: 0, qId: null },
    videoCtrl: null,
    apiKey: (() => { try { return localStorage.getItem('lms_gemini_key') || ''; } catch { return ''; } })(),
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const humanDelay = (min, max) => sleep(min + Math.random() * (max - min));
const _time = () => { const d = new Date(); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };
