// content.js — LMSX v3.6 (Modular Build)
(function () {
    'use strict';

    // ── MAIN.JS ──
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


    // ── UI/CSS.JS ──
    const CSS = `
    :host{all:initial;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;}
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;outline:none;border:none;}

    .lms-panel{
      --bg:#0D0D10;--s1:#131316;--s2:#17171B;--s3:#1D1D23;--s4:#23232A;
      --bd:#26262E;--bd2:#30303A;
      --red:#E8271A;--red2:#C01F15;--red-a:rgba(232,39,26,.08);--red-b:rgba(232,39,26,.18);
      --green:#1DB954;--grn-a:rgba(29,185,84,.08);--grn-b:rgba(29,185,84,.18);
      --amber:#D97706;--amb-a:rgba(217,119,6,.08);--amb-b:rgba(217,119,6,.18);
      --t1:#F0F0F4;--t2:#9090A0;--t3:#606072;
      --r:14px;--r2:11px;--r3:9px;--r4:7px;
      position:fixed;top:16px;right:16px;width:252px;min-width:200px;
      background:var(--bg);border:1px solid var(--bd);border-radius:var(--r);
      color:var(--t1);z-index:2147483647;display:flex;flex-direction:column;
      box-shadow:0 8px 32px rgba(0,0,0,.55);font-size:13px;line-height:1.4;
      overflow:visible;
    }
    .lms-panel.is-dragging{user-select:none;}
    .P-hidden{display:none!important;}

    /* HEADER */
    .H{padding:10px 12px;display:flex;align-items:center;justify-content:space-between;
      border-bottom:1px solid var(--bd);background:var(--s1);border-radius:var(--r) var(--r) 0 0;
      cursor:grab;user-select:none;flex-shrink:0;}
    .H:active{cursor:grabbing;}
    .H-wm{font-size:15px;font-weight:800;letter-spacing:-.5px;color:var(--t1);display:flex;align-items:center;gap:0;}
    .H-wm em{color:var(--red);font-style:normal;}
    .H-meta{font-size:9px;color:var(--t3);font-weight:500;margin-left:8px;padding-left:8px;border-left:1px solid var(--bd2);letter-spacing:.2px;}
    .H-dots{display:flex;gap:5px;align-items:center;}
    .H-dot{width:11px;height:11px;border-radius:50%;cursor:pointer;flex-shrink:0;transition:filter .12s;}
    .H-dot:hover{filter:brightness(1.5);}
    .H-dot--min{background:var(--s4);border:1px solid var(--bd2);}
    .H-dot--cls{background:var(--red);opacity:.7;}

    /* BODY */
    .B{padding:13px 12px;display:flex;flex-direction:column;gap:11px;flex:1;background:var(--bg);}

    /* PROGRESS */
    .P{background:var(--s2);border:1px solid var(--bd);border-radius:var(--r2);padding:13px 13px 11px;}
    .P-top{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:9px;}
    .P-num{font-size:34px;font-weight:800;letter-spacing:-1.5px;line-height:1;color:var(--t1);}
    .P-num sup{font-size:14px;font-weight:700;color:var(--t2);vertical-align:super;margin-left:1px;}
    .P-rt{text-align:right;}
    .P-lbl{font-size:8px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--t2);}
    .P-val{font-size:11px;font-weight:700;color:var(--t2);margin-top:3px;}
    .P-track{height:5px;background:var(--s4);border-radius:3px;overflow:hidden;}
    .P-fill{height:100%;border-radius:3px;background:var(--red);width:0%;transition:width .5s cubic-bezier(.4,0,.2,1);}
    .P-tags{display:flex;gap:8px;margin-top:7px;}
    .P-tag{font-size:8px;font-weight:700;letter-spacing:.4px;color:var(--t3);display:flex;align-items:center;gap:3px;}
    .P-tag::before{content:'';width:5px;height:5px;border-radius:50%;background:var(--s4);border:1px solid var(--bd2);flex-shrink:0;}
    .P-tag.done{color:var(--green);}
    .P-tag.done::before{background:var(--green);border-color:var(--green);}

    /* TOGGLE */
    .T{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-radius:var(--r3);
      border:1px solid var(--bd);background:var(--s2);cursor:pointer;user-select:none;
      transition:border-color .15s,background .15s;}
    .T.on{border-color:var(--red-b);background:var(--red-a);}
    .T-left{display:flex;align-items:center;gap:9px;}
    .T-dot{width:6px;height:6px;border-radius:50%;background:var(--t3);flex-shrink:0;transition:background .2s;}
    .T-dot.on{background:var(--green);animation:glow 1.8s ease-in-out infinite;}
    @keyframes glow{0%,100%{box-shadow:0 0 0 0 rgba(29,185,84,.5);}60%{box-shadow:0 0 0 5px rgba(29,185,84,0);}}
    .T-name{font-size:12px;font-weight:700;color:var(--t2);transition:color .15s;}
    .T-name.on{color:var(--t1);}
    .T-sub{font-size:9px;color:var(--t3);margin-top:2px;transition:color .15s;}
    .T-sub.on{color:rgba(232,39,26,.6);}
    .T-sw{width:34px;height:19px;background:var(--s4);border:1px solid var(--bd2);border-radius:10px;
      position:relative;flex-shrink:0;transition:background .2s,border-color .2s;}
    .T-sw::after{content:'';position:absolute;top:2px;left:2px;width:13px;height:13px;
      background:var(--t3);border-radius:50%;transition:transform .2s,background .2s;}
    .T-sw.on{background:var(--red);border-color:var(--red2);}
    .T-sw.on::after{transform:translateX(15px);background:#fff;}

    /* API KEY */
    .A-lbl{font-size:8px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--t2);margin-bottom:5px;display:block;}
    .A-row{display:flex;gap:5px;}
    .A-inp{flex:1;height:33px;padding:0 9px;background:var(--s2);border:1px solid var(--bd)!important;
      border-radius:var(--r4);color:var(--t1);font-size:10px;font-family:monospace;transition:border-color .15s!important;}
    .A-inp::placeholder{color:var(--t3);font-size:9px;}
    .A-inp:focus{border-color:var(--red)!important;}
    .A-btn{height:33px;padding:0 12px;border-radius:var(--r4);background:var(--s4);border:1px solid var(--bd2);
      color:var(--t2);font-size:9px;font-weight:800;letter-spacing:1px;cursor:pointer;transition:all .15s;flex-shrink:0;}
    .A-btn:hover{background:var(--s3);color:var(--t1);}
    .A-btn.ok{background:var(--grn-a);border-color:var(--grn-b);color:var(--green);}
    .A-sel{height:20px;padding:0 4px;background:var(--bg);border:1px solid var(--bd);border-radius:3px;color:var(--t2);font-size:9px;font-weight:700;font-family:inherit;outline:none;}
    .A-sel:focus{border-color:var(--red);color:var(--t1);}

    /* LOG */
    .L{display:flex;align-items:center;gap:7px;padding:8px 10px;border-radius:var(--r4);background:var(--s2);border:1px solid var(--bd);}
    .L-dot{width:5px;height:5px;border-radius:50%;flex-shrink:0;}
    .L-dot.on{background:var(--green);animation:glow 1.8s ease-in-out infinite;}
    .L-dot.off{background:var(--t3);}
    .L-txt{font-size:10px;font-weight:600;color:var(--t2);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .L-tm{font-size:8px;color:var(--t3);flex-shrink:0;font-variant-numeric:tabular-nums;}

    /* FOOTER */
    .F{padding:7px 12px;border-top:1px solid var(--bd);display:flex;align-items:center;justify-content:space-between;
      flex-shrink:0;background:var(--s1);border-radius:0 0 var(--r) var(--r);}
    .F-left{font-size:8px;color:var(--t3);font-weight:700;letter-spacing:.5px;}
    .F-right{display:flex;align-items:center;gap:8px;}
    .F-ver{font-size:8px;color:var(--t3);font-weight:600;background:var(--s3);border:1px solid var(--bd);border-radius:3px;padding:2px 5px;letter-spacing:.3px;}
    .F-grip{width:12px;height:12px;opacity:.4;cursor:nwse-resize;flex-shrink:0;}
    .F-grip svg{display:block;width:100%;height:100%;}
    .F-grip:hover{opacity:.8;}

    /* RESIZE HANDLES */
    .RZ{position:absolute;z-index:20;background:transparent;}
    .RZ-e{right:0;top:14px;bottom:14px;width:6px;cursor:ew-resize;}
    .RZ-s{bottom:0;left:14px;right:14px;height:6px;cursor:ns-resize;}
    .RZ-se{right:0;bottom:0;width:18px;height:18px;cursor:nwse-resize;}
    .RZ-w{left:0;top:14px;bottom:14px;width:6px;cursor:ew-resize;}

    /* FAB */
    .FAB{position:fixed;bottom:16px;right:16px;width:40px;height:40px;background:#E8271A;border-radius:11px;
      display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:2147483647;
      opacity:0;transform:scale(0);transition:transform .15s,opacity .15s;
      box-shadow:0 4px 14px rgba(232,39,26,.35);}
    .FAB svg{width:18px;height:18px;fill:#fff;}
    .FAB:hover{transform:scale(1.07)!important;}
    .FAB:active{transform:scale(.94)!important;}
    .FAB.show{opacity:1;transform:scale(1);}

    /* TOASTS */
    .TT{position:fixed;bottom:64px;right:16px;display:flex;flex-direction:column-reverse;gap:5px;z-index:2147483648;pointer-events:none;}
    .TT-item{pointer-events:auto;display:flex;align-items:center;gap:8px;padding:9px 11px;border-radius:8px;
      border:1px solid transparent;max-width:240px;opacity:0;transform:translateX(40px);transition:opacity .2s,transform .2s;}
    .TT-item.show{opacity:1;transform:translateX(0);}
    .TT-item.info{background:rgba(59,130,246,.08);border-color:rgba(59,130,246,.18);}
    .TT-item.ok{background:rgba(29,185,84,.08);border-color:rgba(29,185,84,.18);}
    .TT-item.warn{background:rgba(217,119,6,.08);border-color:rgba(217,119,6,.18);}
    .TT-item.error{background:rgba(232,39,26,.08);border-color:rgba(232,39,26,.18);}
    .TT-icn{width:14px;height:14px;flex-shrink:0;display:flex;align-items:center;}
    .TT-icn svg{width:100%;height:100%;}
    .TT-item.info .TT-icn{color:#3B82F6;}
    .TT-item.ok .TT-icn{color:#1DB954;}
    .TT-item.warn .TT-icn{color:#D97706;}
    .TT-item.error .TT-icn{color:#E8271A;}
    .TT-msg{font-size:10px;font-weight:600;color:#F0F0F4;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .TT-ts{font-size:8px;color:#606072;flex-shrink:0;font-variant-numeric:tabular-nums;}
    `;


    // ── UI/HTML.JS ──
    const GRIP_SVG = `<svg viewBox="0 0 12 12" fill="none"><line x1="4" y1="11" x2="11" y2="4" stroke="#606072" stroke-width="1.5" stroke-linecap="round"/><line x1="7" y1="11" x2="11" y2="7" stroke="#606072" stroke-width="1.5" stroke-linecap="round"/><line x1="10" y1="11" x2="11" y2="10" stroke="#606072" stroke-width="1.5" stroke-linecap="round"/></svg>`;
    const BOLT_SVG = `<svg viewBox="0 0 24 24"><path d="M11 21h-1l1-7H7.5c-.88 0-.33-.75-.31-.78C8.48 10.94 10.42 7.54 13.01 3h1l-1 7h3.51c.4 0 .62.19.4.66C12.97 17.55 11 21 11 21z"/></svg>`;

    const HTML = `
    <div class="lms-panel" id="P">
      <div class="H" id="H">
        <div class="H-wm">LMS<em>X</em><span class="H-meta">v3.6 · PTIT</span></div>
        <div class="H-dots">
          <div class="H-dot H-dot--min" id="dot-min" title="Thu nhỏ"></div>
          <div class="H-dot H-dot--cls" id="dot-cls" title="Đóng"></div>
        </div>
      </div>
      <div class="B">
        <div class="P">
          <div class="P-top">
            <div class="P-num" id="pct">0<sup>%</sup></div>
            <div class="P-rt"><div class="P-lbl">TIẾN ĐỘ</div><div class="P-val" id="frac">— / — mục</div></div>
          </div>
          <div class="P-track"><div class="P-fill" id="fill"></div></div>
          <div class="P-tags">
            <div class="P-tag" id="tag-v">Video</div>
            <div class="P-tag" id="tag-q">Quiz</div>
            <div class="P-tag" id="tag-h">Bài tập</div>
          </div>
        </div>
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
            <span class="A-lbl" style="margin-bottom:0;">AI PROVIDER</span>
            <select class="A-sel" id="ai-sel">
              <option value="gemini">Gemini (Google)</option>
              <option value="openai">ChatGPT (OpenAI)</option>
              <option value="claude">Claude (Anthropic)</option>
            </select>
          </div>
          <div class="A-row">
            <input type="password" spellcheck="false" class="A-inp" id="api-inp" placeholder="Nhập API key...">
            <button class="A-btn" id="api-btn">LƯU</button>
          </div>
        </div>
      </div>
      <div class="F">
        <div class="F-left">PTIT LMS</div>
        <div class="F-right">
          <div class="F-ver">v3.6</div>
          <div class="F-grip" id="grip" title="Kéo để resize">${GRIP_SVG}</div>
        </div>
      </div>
      <div class="RZ RZ-e" data-d="e"></div>
      <div class="RZ RZ-s" data-d="s"></div>
      <div class="RZ RZ-se" data-d="se"></div>
      <div class="RZ RZ-w" data-d="w"></div>
    </div>
    <div class="FAB" id="fab">${BOLT_SVG}</div>
    <div class="TT" id="toasts"></div>
    `;


    // ── UI/PANEL.JS ──
    // ── BUILD SHADOW DOM ─────────────────────────────────────────
    function buildUI() {
        const host = document.createElement('div');
        host.id = '__lmsx_root__';
        host.style.cssText = 'position:fixed!important;top:0!important;left:0!important;width:0!important;height:0!important;overflow:visible!important;z-index:2147483647!important;';
        S.shadow = host.attachShadow({ mode: 'closed' });

        const style = document.createElement('style');
        style.textContent = CSS;
        S.shadow.appendChild(style);

        const wrapper = document.createElement('div');
        wrapper.innerHTML = HTML;
        while (wrapper.firstChild) S.shadow.appendChild(wrapper.firstChild);

        document.documentElement.appendChild(host);
        return S.shadow;
    }

    // ── PANEL CONTROLLER ─────────────────────────────────────────
    function initPanel(root) {
        const $ = id => root.getElementById(id);
        const panel = $('P');
        if (!panel) return;

        // Ensure panel gets pointer-events
        panel.style.pointerEvents = 'auto';

        // ─── DRAG ───
        const header = $('H');
        let dragging = false, sx = 0, sy = 0, sl = 0, st = 0;

        function fixPosition() {
            // Convert right→left on first interaction
            if (panel.style.left === '' || panel.style.left === 'auto') {
                const r = panel.getBoundingClientRect();
                panel.style.left = r.left + 'px';
                panel.style.top = r.top + 'px';
                panel.style.right = 'auto';
                panel.style.bottom = 'auto';
            }
        }

        header.addEventListener('mousedown', e => {
            if (e.target.closest('.H-dots')) return;
            e.preventDefault();
            fixPosition();
            dragging = true;
            panel.classList.add('is-dragging');
            const r = panel.getBoundingClientRect();
            sl = r.left; st = r.top; sx = e.clientX; sy = e.clientY;
            document.addEventListener('mousemove', dragMove);
            document.addEventListener('mouseup', dragUp);
        });
        function dragMove(e) {
            if (!dragging) return;
            const nx = sl + (e.clientX - sx);
            const ny = st + (e.clientY - sy);
            const mxL = window.innerWidth - panel.offsetWidth;
            const mxT = window.innerHeight - panel.offsetHeight;
            panel.style.left = Math.max(0, Math.min(mxL, nx)) + 'px';
            panel.style.top  = Math.max(0, Math.min(mxT, ny)) + 'px';
        }
        function dragUp() {
            dragging = false;
            panel.classList.remove('is-dragging');
            document.removeEventListener('mousemove', dragMove);
            document.removeEventListener('mouseup', dragUp);
        }

        // ─── RESIZE ───
        function bindResize(el, dir) {
            el.addEventListener('mousedown', e => {
                e.preventDefault(); e.stopPropagation();
                fixPosition();
                const r = panel.getBoundingClientRect();
                const ox = e.clientX, oy = e.clientY, ow = r.width, oh = r.height, oL = r.left;
                panel.classList.add('is-dragging');
                function rm(e) {
                    const dx = e.clientX - ox, dy = e.clientY - oy;
                    if (dir.includes('e')) panel.style.width = Math.max(200, ow + dx) + 'px';
                    if (dir === 'w') { const nw = Math.max(200, ow - dx); panel.style.width = nw + 'px'; panel.style.left = (oL + ow - nw) + 'px'; }
                    if (dir.includes('s')) panel.style.height = Math.max(150, oh + dy) + 'px';
                }
                function ru() { panel.classList.remove('is-dragging'); document.removeEventListener('mousemove', rm); document.removeEventListener('mouseup', ru); }
                document.addEventListener('mousemove', rm);
                document.addEventListener('mouseup', ru);
            });
        }
        panel.querySelectorAll('.RZ').forEach(h => { 
            h.style.pointerEvents = 'auto'; 
            bindResize(h, h.dataset.d); 
        });
        const grip = $('grip');
        if (grip) { grip.style.pointerEvents = 'auto'; bindResize(grip, 'se'); }

        // ─── MINIMIZE / CLOSE ───
        const fab = $('fab');
        $('dot-min')?.addEventListener('click', () => {
            panel.classList.add('P-hidden');
            if (fab) fab.classList.add('show');
        });
        $('dot-cls')?.addEventListener('click', () => {
            panel.classList.add('P-hidden');
            // close = no FAB shown
        });
        fab?.addEventListener('click', () => {
            panel.classList.remove('P-hidden');
            fab.classList.remove('show');
        });
        // Make FAB clickable
        if (fab) fab.style.pointerEvents = 'auto';

        // ─── TOGGLE ───
        let running = false;
        const tgl = $('tgl');
        tgl?.addEventListener('click', () => {
            running = !running;
            const es = ['tgl', 'tgl-dot', 'tgl-name', 'tgl-sub', 'tgl-sw'];
            es.forEach(id => $(id)?.classList.toggle('on', running));
            $('tgl-sub').textContent = running ? 'Đang chạy — auto video + quiz' : 'Nhấn để bắt đầu';
            setLog(running ? 'Đã kích hoạt...' : 'Chờ kích hoạt...', running ? 'on' : 'off');
            S.active = running;
            if (running) { startAutomation(); } else { stopAutomation(); }
        });

        // ─── API KEY ───
        const apiInp = $('api-inp');
        const apiBtn = $('api-btn');
        const aiSel = $('ai-sel');

        function updateApiUI() {
            if (!apiInp || !aiSel) return;
            const curKey = S.apiKeys[S.aiProvider] || '';
            apiInp.value = curKey;
            if (curKey) {
                apiBtn.classList.add('ok');
                apiBtn.textContent = 'OK';
            } else {
                apiBtn.classList.remove('ok');
                apiBtn.textContent = 'LƯU';
            }
        }

        if (aiSel) {
            aiSel.value = S.aiProvider;
            aiSel.addEventListener('change', (e) => {
                S.aiProvider = e.target.value;
                localStorage.setItem('lms_ai_provider', S.aiProvider);
                updateApiUI();
            });
        }

        updateApiUI();

        if (apiInp && apiBtn) {
            apiInp.addEventListener('input', () => {
                apiBtn.classList.remove('ok');
                apiBtn.textContent = 'LƯU';
            });

            apiBtn.addEventListener('click', () => {
                const val = apiInp.value.trim();
                S.apiKeys[S.aiProvider] = val;
                localStorage.setItem('lms_' + S.aiProvider + '_key', val);
                
                if (val) {
                    apiBtn.classList.add('ok');
                    apiBtn.textContent = 'OK';
                    const name = aiSel ? aiSel.options[aiSel.selectedIndex].text : 'API';
                    toast('Đã lưu ' + name + ' Key!', 'ok', 3000);
                } else {
                    apiBtn.classList.remove('ok');
                    apiBtn.textContent = 'LƯU';
                    toast('Đã xóa bỏ API Key', 'warn', 3000);
                }
            });
        }

        // ─── PUBLIC UI API ───
        function setProgress(done, total, flags = {}) {
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            const el = $('pct'); if (el) el.innerHTML = `${pct}<sup>%</sup>`;
            const fl = $('fill'); if (fl) fl.style.width = `${pct}%`;
            const fr = $('frac'); if (fr) fr.textContent = `${done} / ${total || '?'} mục`;
            if (flags.video) $('tag-v')?.classList.add('done');
            if (flags.quiz) $('tag-q')?.classList.add('done');
            if (flags.hw) $('tag-h')?.classList.add('done');
        }

        function setLog(text, state = 'on', time = '') {
            const t = $('log-txt'), d = $('log-dot'), tm = $('log-tm');
            if (t) t.textContent = text;
            if (d) d.className = `L-dot ${state}`;
            if (tm) tm.textContent = time || _time();
        }

        function setApiStatus(state) {
            // Obsolete but kept for backwards compatibility internally if used
            if (apiBtn) {
                if (state === 'ok') {
                    apiBtn.classList.add('ok');
                    apiBtn.textContent = 'OK';
                } else {
                    apiBtn.classList.remove('ok');
                    apiBtn.textContent = 'LƯU';
                }
            }
        }

        const TOAST_ICONS = {
            ok: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
            warn: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
            error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
            info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`
        };
        function toast(msg, type = 'info', dur = 3500) {
            const c = $('toasts'); if (!c) return;
            const el = document.createElement('div');
            el.className = `TT-item ${type}`;
            el.innerHTML = `<div class="TT-icn">${TOAST_ICONS[type] || TOAST_ICONS.info}</div><div class="TT-msg">${msg.replace(/</g,'&lt;')}</div><div class="TT-ts">0s</div>`;
            el.style.pointerEvents = 'auto';
            c.appendChild(el);
            requestAnimationFrame(() => el.classList.add('show'));
            let sec = 0;
            const tick = setInterval(() => { sec++; const ts = el.querySelector('.TT-ts'); if (ts) ts.textContent = sec + 's'; }, 1000);
            setTimeout(() => { clearInterval(tick); el.classList.remove('show'); setTimeout(() => el.remove(), 250); }, dur);
        }

        // Expose to outer scope
        S.ui = { setProgress, setLog, setApiStatus, toast, setRunning: (v) => {
            running = v; S.active = v;
        }};

        setLog('Ready', 'off');
    }


    // ── AUTOMATION/VIDEO.JS ──
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


    // ── AUTOMATION/QUIZ.JS ──
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


    // ── AUTOMATION/NAVIGATOR.JS ──
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


    // ── STEALTH/BYPASS.JS ──
    function bypassProtections() {
        ['copy', 'cut', 'contextmenu', 'selectstart', 'dragstart'].forEach(ev => {
            window.addEventListener(ev, e => e.stopPropagation(), true);
        });
        const s = document.createElement('style');
        s.textContent = '* { user-select: text !important; -webkit-user-select: text !important; -moz-user-select: text !important; -ms-user-select: text !important; }';
        (document.head || document.documentElement).appendChild(s);
        setInterval(() => {
            document.oncontextmenu = null; document.onselectstart = null; document.oncopy = null; document.oncut = null;
        }, 1000);
        console.log('[LMSX] Copy bypass active - Ultimate Mode');
    }

    // ── NETWORK HOOKS ────────────────────────────────────────────
    function injectHooks() {
        try {
            const s = document.createElement('script');
            s.src = chrome.runtime.getURL('inject.js');
            s.onload = () => s.remove();
            (document.head || document.documentElement).appendChild(s);
        } catch {}
        document.addEventListener('__lms_inject_fetch', onNetData);
        document.addEventListener('__lms_inject_xhr', onNetData);
    }

    function onNetData(e) {
        if (!S.active) return;
        const url = e.detail?.url; if (!url) return;
        if (!url.includes('problem_check') && !url.includes('submit_quiz') && !url.includes('handler/xmodule_handler') && !url.includes('answer')) return;
        try {
            const data = typeof e.detail.response === 'string' ? JSON.parse(e.detail.response) : e.detail.response;
            if (!data) return;
            let correct = false;
            if (data.correct_map) {
                correct = Object.values(data.correct_map).every(r => r.correctness === 'correct');
                if (correct && S.quizState.qId) {
                    Object.entries(data.correct_map).forEach(([k, r]) => {
                        if (r.correctness === 'correct') { const i = document.querySelector(`[name="${k}"]:checked`); if (i) localStorage.setItem(`lms_q_${S.quizState.qId}`, i.id); }
                    });
                }
            } else if (data.success === true || data.passed === true || data.is_correct === true) { correct = true; }
            S.quizState.attempts++;
            if (correct) {
                S.ui?.setLog('Đáp án chính xác!', 'off'); S.ui?.toast('Đáp án chính xác!', 'ok');
                S.stats.ok++; updateProgress(); S.quizState.attempts = 0;
                setTimeout(navigateNext, 2000);
            } else {
                S.ui?.setLog(`Sai (lần ${S.quizState.attempts})`, 'on');
                if (S.quizState.attempts < 3) {
                    setTimeout(() => { const rb = document.querySelector('.reset-button, .reset, [id*="reset"]'); if (rb) rb.click(); setTimeout(loop, 2000); }, 2000);
                } else { S.ui?.setLog('Bỏ qua, đi tiếp', 'off'); setTimeout(navigateNext, 2000); }
            }
        } catch (err) { console.error('[LMSX] onNetData:', err); }
    }


    // ── INIT.JS ──
    // ── INIT ─────────────────────────────────────────────────────
    function init() {
        console.log('[LMSX] v3.6 initializing...');
        const root = buildUI();
        initPanel(root);
        bypassProtections();
        try { injectHooks(); } catch {}
        S.active = true;
        setTimeout(loop, 2000);
        watchURL();
        updateProgress();
        console.log('[LMSX] v3.6 ready');
    }

    // Start sequence
    // Prevent multiple injections
    if (!document.getElementById('__lmsx_root__')) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    }

})();
