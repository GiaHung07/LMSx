// ── PROGRESS FROM DOM ────────────────────────────────────────
function updateProgress() {
    if (!S.ui) return;
    let pct = 0, done = 0, total = 0;
    const progEl = document.querySelector('.progress .sr-only, .progress-bar, [class*="progress"]');
    if (progEl) {
        const m = (progEl.textContent || '').match(/(\d+)%/);
        if (m) pct = parseInt(m[1]);
        else pct = parseInt(progEl.style?.width) || 0;
        const navItems = document.querySelectorAll('.sequence-nav-button:not(.button-next):not(.button-previous)');
        total = navItems.length || (S.stats.vid + S.stats.quiz) || 1;
        done = Math.round((pct / 100) * total);
    } else {
        done = S.stats.vid + S.stats.quiz;
        total = S.stats.total || done || 0;
    }
    S.ui.setProgress(done, total, {
        video: !!document.querySelector('video'),
        quiz: !!document.querySelector('[class*="QuizBody"], .xblock-problem')
    });
}

// ── AUTOMATION ───────────────────────────────────────────────
function startAutomation() { S.active = true; S.ui?.toast('Auto ON', 'ok'); loop(); }
function stopAutomation() { S.active = false; S.ui?.toast('Auto OFF', 'warn'); S.videoCtrl?.stop(); }

async function navigateNext() {
    if (!S.active) return;
    S.ui?.setLog('Chuyển bài...', 'on');
    await humanDelay(2000, 5000);
    const sels = ['.sequence-nav-button.button-next', '.next-button', 'button.next', '[data-next]'];
    let btn = null;
    for (const s of sels) { btn = document.querySelector(s); if (btn && !btn.disabled) break; btn = null; }
    if (btn) { btn.click(); await humanDelay(3000, 5000); }
    else { S.ui?.setLog('Hoàn thành!', 'off'); S.ui?.toast('Hoàn thành khóa học!', 'ok', 5000); S.ui?.setRunning(false); }
}

// ── MAIN LOOP ────────────────────────────────────────────────
async function loop() {
    if (!S.active) return;
    updateProgress();
    
    // Tự động bấm "Bắt đầu làm bài"
    const btns = Array.from(document.querySelectorAll('button span, button'));
    for (const b of btns) {
        if (b.textContent.trim().toLowerCase() === 'bắt đầu làm bài' || b.textContent.trim().toLowerCase() === 'làm lại bài') {
            S.ui?.setLog('Bấm bắt đầu quiz...', 'on');
            (b.closest('button') || b).click();
            await humanDelay(2000, 3000);
            if (S.active) loop();
            return;
        }
    }

    const hasVid = new VideoCtrl().findVideo();
    const hasQz = document.querySelector('[class*="lesson-quiz-styles__QuizBody"], [class*="QuizBody"], .xblock-problem');
    
    if (hasVid) {
        S.videoCtrl?.stop();
        S.videoCtrl = new VideoCtrl();
        S.ui?.setLog('Phát video x4...', 'on');
        const ok = await S.videoCtrl.autoPlay(4);
        if (ok) { 
            S.ui?.toast('Video x4 ▶', 'info'); 
            S.videoCtrl.onComplete(() => { 
                S.stats.vid++; 
                updateProgress(); 
                S.ui?.toast('Video xong! Vui lòng tự Next', 'ok'); 
                S.ui?.setLog('Hoàn thành Video', 'off'); 
            }); 
        } else { 
            S.ui?.setLog('Chờ video...', 'on'); 
            await sleep(3000); 
            if (S.active) loop(); 
        }
    } else if (hasQz) {
        S.ui?.setLog('Đang Giải Quiz...', 'on'); S.ui?.toast('Phát hiện bài tập!', 'warn');
        await solveQuiz(); 
        S.stats.quiz++; 
        updateProgress();
        S.ui?.setLog('Đã đánh đáp án - Vui lòng tự Nộp bài!', 'off'); 
    } else {
        S.ui?.setLog('Mở khóa Copy... Chế độ tự Do', 'on');
    }
}

// ── URL WATCHER ──────────────────────────────────────────────
function watchURL() {
    let last = location.href;
    new MutationObserver(() => { if (location.href !== last) { last = location.href; if (S.active) { S.ui?.setLog('Trang mới...', 'on'); setTimeout(loop, 2000 + Math.random() * 3000); } } }).observe(document, { subtree: true, childList: true });
}
