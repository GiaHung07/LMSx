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
