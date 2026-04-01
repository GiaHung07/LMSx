const HTML = `
<div class="scene" id="P">
  <div class="card" id="card">
    <div class="face front" id="frontFace">
      <div class="titlebar" id="H">
        <div class="dots">
          <div class="dot r" id="dotR" title="Ẩn panel"></div>
          <div class="dot y" id="dotY" title="Thu gọn"></div>
          <div class="dot g glow" id="dotG" title="Chạy"></div>
        </div>
        <div class="ptitle">LMSX</div>
        <button class="gear-btn" id="flipBtn" title="Cài đặt">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <path d="M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" stroke="currentColor" stroke-width="1.2"/>
            <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>

      <div class="collapsible" id="logSection" style="max-height:200px">
        <div class="log-wrap" id="logWrap">
          <div class="log-line vis">
            <span class="lt d">·</span>
            <span class="lm lo" id="status-note">Chờ câu hỏi...</span>
          </div>
        </div>
      </div>

      <div class="sep" id="sepEl"></div>
      <div class="footer" id="footerEl">
        <div class="status-left">
          <div class="live-dot idle" id="liveDot"></div>
          <span class="slabel" id="slabel">idle</span>
        </div>
        <div class="toggle-row">
          <span class="tlabel">Auto</span>
          <div class="tog on" id="tog"><div class="tog-thumb"></div></div>
        </div>
      </div>
    </div>

    <div class="face back">
      <div class="titlebar">
        <div class="dots">
          <div class="dot r"></div>
          <div class="dot y"></div>
          <div class="dot g"></div>
        </div>
        <div class="ptitle">Cài đặt</div>
        <div style="width:17px"></div>
      </div>

      <div class="back-body">
        <div class="section-label">API KEYS</div>

        <div class="api-block">
          <div class="api-provider">
            <div class="pdot or"></div>
            <span class="pname">OpenRouter</span>
          </div>
          <div class="api-row">
            <input class="api-input" id="orInput" type="password" placeholder="sk-or-v1-..." spellcheck="false" autocomplete="off"/>
            <button class="eye-btn" data-t="orInput" title="Hiện/Ẩn key">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" stroke-width="1.2"/>
                <circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.2"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="api-block">
          <div class="api-provider">
            <div class="pdot gr"></div>
            <span class="pname">Groq</span>
          </div>
          <div class="api-row">
            <input class="api-input" id="grInput" type="password" placeholder="gsk_..." spellcheck="false" autocomplete="off"/>
            <button class="eye-btn" data-t="grInput" title="Hiện/Ẩn key">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" stroke-width="1.2"/>
                <circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.2"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="divline"></div>
        <button class="save-btn" id="saveBtn">Lưu cài đặt</button>
        <div class="saved-hint" id="savedHint">✓ Đã lưu</div>

        <div class="back-footer">
          <button class="back-btn" id="backBtn">
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M7 2L3 6l4 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Quay lại
          </button>
          <div class="key-links">
            <a class="klink" href="https://openrouter.ai/keys" target="_blank">
              <div class="pdot or"></div>OR key
              <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M2 8L8 2M8 2H4M8 2v4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
            </a>
            <a class="klink" href="https://console.groq.com/keys" target="_blank">
              <div class="pdot gr"></div>Groq key
              <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M2 8L8 2M8 2H4M8 2v4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
  <button class="mini-dock" id="miniDock" title="Mở lại LMSX">
    <span class="mini-dot"></span>
    <span class="mini-label">LMSX</span>
  </button>
</div>
`;
