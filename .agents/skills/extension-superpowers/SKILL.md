---
name: lmsx-extension
description: >
  Build, debug, maintain, and extend the LMSX v3.6 Chrome Extension for PTIT LMS automation.
  Covers all runtime boundaries (content script, service worker, inject hooks, bridge),
  the self-contained UI panel, quiz solver pipeline, video controller, and stealth layer.
---

# LMSX Extension — Master Skill

> **Scope**: This skill governs ALL work on the LMSX v3.6 Chrome Extension.
> Read this file in full before touching any source file.

---

## 1. Project Identity

| Key              | Value                                               |
|------------------|-----------------------------------------------------|
| Name             | LMSX                                                |
| Version          | 3.6.0                                               |
| Manifest         | V3                                                  |
| Target           | `https://lms.ptit.edu.vn/*`                         |
| UI Framework     | Vanilla JS + Closed Shadow DOM (self-contained)     |
| Language         | JavaScript (ES2020+)                                |
| UI Language      | Vietnamese (UTF-8, đầy đủ dấu)                     |

---

## 2. Bill of Materials (BOM)

### 2.1 Source Files — Active

| File                          | Role                  | Boundary          | Description                                                                 |
|-------------------------------|-----------------------|--------------------|-----------------------------------------------------------------------------|
| `manifest.json`               | Manifest              | —                  | MV3 config: permissions, content scripts, service worker, WAR              |
| `content.js`                  | Content Script        | **ISOLATED WORLD** | Main entry. Self-contained: inline CSS + HTML + panel controller + automation + quiz solver + video controller |
| `background.js`               | Service Worker        | **SW**             | AES-GCM secure session, config/stats CRUD via `chrome.storage`, token capture via `webRequest` |
| `inject.js`                   | Page Context Inject   | **PAGE WORLD**     | Hooks `fetch()` + `XMLHttpRequest` to capture API responses and dispatch via CustomEvent bridge |
| `obfuscate.js`                | Obfuscation Bootstrap | **ISOLATED WORLD** | Per-session random hash seed (`cyrb53`), exposes `window._O()` for dynamic class/event name rotation |
| `js/runtime/bridge.js`        | Bridge Protocol       | **ISOLATED WORLD** | Token-validated `CustomEvent` bridge between content script ↔ inject hooks |
| `lib/anime.min.js`            | Animation Library     | (unused in v3.6)   | Legacy dep — anime.js. Currently not loaded by content.js. Candidate for removal. |

### 2.2 Source Files — Dead / Deprecated

| File                   | Status         | Action            |
|------------------------|----------------|-------------------|
| `panel-template.html`  | **DEAD**       | Safe to delete. HTML is inlined in `content.js`. |
| `content.css`          | **DEAD**       | Safe to delete. CSS is inlined in `content.js`. |
| `hi.js`                | **DEAD**       | Legacy test/debug dump (347 KB). Safe to delete. |
| `lib/anime.min.js`     | **DEPRECATED** | Not imported in v3.6. Delete if no future need.  |

### 2.3 Assets

| Path                         | Usage                        |
|------------------------------|------------------------------|
| `assets/icons/icon16.png`    | Extension toolbar icon 16px  |
| `assets/icons/icon32.png`    | Extension toolbar icon 32px  |
| `assets/icons/icon48.png`    | Extension toolbar icon 48px  |
| `assets/icons/icon128.png`   | Chrome Web Store icon 128px  |

---

## 3. Architecture — Runtime Boundaries

```
┌──────────────────────────────────────────────────────────────┐
│  BROWSER (Brave / Chrome)                                    │
│                                                              │
│  ┌─── SERVICE WORKER (background.js) ──────────────────────┐ │
│  │  AES-GCM SecureSessionStorage                           │ │
│  │  Config/Stats CRUD (chrome.storage.local)               │ │
│  │  WebRequest token capture                               │ │
│  │  Message handler: storeSecure, retrieveSecure,          │ │
│  │    clearSecure, getConfig, saveConfig, getStats,        │ │
│  │    updateStats                                          │ │
│  └──────────────── chrome.runtime.onMessage ───────────────┘ │
│                          ▲                                   │
│                          │  sendMessage / onMessage          │
│                          ▼                                   │
│  ┌─── CONTENT SCRIPT (Isolated World) ─────────────────────┐ │
│  │  obfuscate.js  →  bridge.js  →  content.js              │ │
│  │                                                         │ │
│  │  ┌── content.js (self-contained) ─────────────────────┐ │ │
│  │  │  CSS (inline)        ← Design tokens + components  │ │ │
│  │  │  HTML (inline)       ← Panel / FAB / Toast markup   │ │ │
│  │  │  Shadow DOM (closed) ← UI encapsulation             │ │ │
│  │  │  PanelController     ← Drag / Resize / Min / Toggle │ │ │
│  │  │  VideoCtrl           ← x4 playback, auto-complete   │ │ │
│  │  │  QuizSolver          ← AI (Gemini) + cached answers │ │ │
│  │  │  CopyBypass          ← user-select override         │ │ │
│  │  │  NavigateNext        ← lesson auto-advance          │ │ │
│  │  │  ProgressTracker     ← DOM scraping → UI update     │ │ │
│  │  └────────────────────────────────────────────────────┘ │ │
│  └────────────── CustomEvent bridge ───────────────────────┘ │
│                          ▲                                   │
│              __lms_inject_xhr / __lms_inject_fetch            │
│                          │                                   │
│  ┌─── PAGE WORLD (inject.js) ──────────────────────────────┐ │
│  │  Hooks window.fetch + XMLHttpRequest                    │ │
│  │  Captures /api/, xblock, handler responses              │ │
│  │  Dispatches CustomEvent to document                     │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### 3.1 Communication Contracts

| From → To              | Channel                          | Payload Schema                                           |
|------------------------|----------------------------------|---------------------------------------------------------|
| inject → content       | `CustomEvent('__lms_inject_xhr')` / `__lms_inject_fetch` | `{ url, method, status, response, body, _ts }` |
| content → background   | `chrome.runtime.sendMessage`     | `{ action: string, ...params }`                         |
| background → content   | `sendResponse()`                 | `{ success: bool, data?: any, error?: string }`         |
| bridge → content       | `CustomEvent(obfuscated)`        | `{ ..., _token: bridgeToken, _ts: timestamp }`          |

---

## 4. Module Contracts (content.js)

### 4.1 `buildUI()`
```
Contract:
  - Creates zero-size fixed host: position:fixed, 0×0, overflow:visible
  - Attaches closed Shadow DOM
  - Injects <style> with CSS string constant
  - Injects HTML from HTML string constant
  - Appends FAB + Toast container
  - Attaches host to document.documentElement
  - Returns: ShadowRoot

Invariants:
  - Host MUST NOT have pointer-events:none (blocks all child events)
  - Host MUST be zero-size (prevents document flow disruption)
  - Shadow mode MUST be 'closed' (stealth)
```

### 4.2 `initPanel(root: ShadowRoot)`
```
Contract:
  - Wires all UI interactions: drag, resize, minimize, FAB, toggle, API input
  - Exposes S.ui = { setProgress, setLog, setApiStatus, toast, setRunning }

Sub-contracts:
  fixPosition():
    - Converts CSS right→left on first interaction
    - Prevents panel jump on first drag

  bindResize(el, dir):
    - dir ∈ {'e', 'w', 's', 'se'}
    - Converts right→left before resize
    - min-width: 200px, min-height: 150px
    - Uses panel.querySelectorAll('.RZ') (NOT root.querySelectorAll)

  drag:
    - Clamped to viewport: 0 ≤ left ≤ (vw - panelW), 0 ≤ top ≤ (vh - panelH)
    - Header only (ignores clicks on .H-dots children)
```

### 4.3 `S.ui` — Public API

| Method                               | Params                                       | Effect                                      |
|--------------------------------------|----------------------------------------------|---------------------------------------------|
| `setProgress(done, total, flags)`    | `flags: { video?: bool, quiz?: bool, hw?: bool }` | Updates %, fraction, fill bar, tag states  |
| `setLog(text, state, time?)`         | `state ∈ {'on', 'off'}`                     | Updates log text, dot color, timestamp      |
| `setApiStatus(state)`               | `state ∈ {'ok', 'err'}`                     | Updates pill badge color + text             |
| `toast(msg, type, duration?)`        | `type ∈ {'info', 'ok', 'warn', 'error'}`    | Creates timed toast notification            |
| `setRunning(bool)`                   | —                                            | Sync toggle UI state                        |

### 4.4 `VideoCtrl` class

```
Contract:
  constructor(): initializes null video, null timer
  findVideo(): searches document + iframes for <video>
  autoPlay(speed=4):
    - Returns false if no video found
    - Mutes → sets playbackRate → plays → unmutes after 1s
    - Polls every 800ms to re-enforce speed + check completion
    - Completion: video.ended event OR currentTime/duration ≥ 0.98
  onComplete(fn): registers callback for video end
  stop(): clears interval timer
```

### 4.5 Quiz Solver Pipeline

```
Flow:
  solveQuiz()
    ├── Detect QuizBody (PTIT class selectors)
    ├── Fallback to .xblock-problem → solveXBlock()
    ├── For each question → solveOneQ()
    │   ├── Extract question text + choice options
    │   ├── Check localStorage cache: lms_q_{qId}
    │   ├── If cached → click cached answer
    │   ├── If S.apiKey && attempts==0 → callGemini()
    │   │   ├── Fuzzy match: exact → contains → word overlap
    │   │   └── If score > 30 → click + cache
    │   └── Fallback: round-robin → options[attempts % length]
    └── Submit: click Submit/Check/Nộp button

Cache key: lms_q_{first50charsOfQuestion}
Cache val: answer index (integer)
Storage:  localStorage
```

### 4.6 `callGemini(question, choices)`

```
Contract:
  Endpoint: POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={apiKey}
  Prompt:   Vietnamese MCQ solver — returns EXACT answer text
  Config:   temperature=0.1, maxOutputTokens=200
  Returns:  string (answer text) | null

⚠ WARNING: This call is made from content script (visible in DevTools Network tab).
  Future: Move to background.js via chrome.runtime.sendMessage for stealth.
```

---

## 5. Design System (CSS Tokens)

```
Background:  --bg:#0D0D10  --s1:#131316  --s2:#17171B  --s3:#1D1D23  --s4:#23232A
Borders:     --bd:#26262E  --bd2:#30303A
Accent:      --red:#E8271A  --red2:#C01F15  --red-a/b: 8%/18% alpha
Success:     --green:#1DB954  --grn-a/b
Warning:     --amber:#D97706  --amb-a/b
Text:        --t1:#F0F0F4 (primary)  --t2:#9090A0 (secondary)  --t3:#606072 (muted)
Radius:      --r:14px  --r2:11px  --r3:9px  --r4:7px
```

### 5.1 CSS Class Map

| Class Prefix | Component          | Example                 |
|--------------|--------------------|-------------------------|
| `.H`         | Header             | `.H-wm`, `.H-dot`      |
| `.B`         | Body               | —                       |
| `.P`         | Progress block     | `.P-num`, `.P-fill`     |
| `.T`         | Toggle row         | `.T-dot`, `.T-sw`       |
| `.A`         | API key section    | `.A-inp`, `.A-pill`     |
| `.L`         | Log bar            | `.L-dot`, `.L-txt`      |
| `.F`         | Footer             | `.F-ver`, `.F-grip`     |
| `.RZ`        | Resize handles     | `.RZ-e`, `.RZ-se`       |
| `.FAB`       | Floating Action Btn| —                       |
| `.TT`        | Toast container    | `.TT-item`, `.TT-tag`  |

---

## 6. Stealth & Anti-Detection

| Technique                    | Implementation                                          |
|------------------------------|---------------------------------------------------------|
| Closed Shadow DOM            | Host UI invisible to page JS / `document.querySelector` |
| Zero-size host               | `position:fixed; width:0; height:0; overflow:visible`   |
| Session-rotated class names  | `obfuscate.js` + `cyrb53` hash per load (bridge only)   |
| Token-validated bridge       | `__bridgeToken` = 16-byte random hex via `crypto.getRandomValues` |
| Human-like delays            | `humanDelay(min, max)` = random sleep between actions    |
| Muted autoplay               | Video starts muted, unmutes after 1s                    |
| Copy/select bypass           | CSS `user-select:auto!important` + `stopImmediatePropagation` on 5 events |

---

## 7. Known Issues & Debt

| ID     | Severity | Description                                                    | Fix                                          |
|--------|----------|----------------------------------------------------------------|----------------------------------------------|
| BUG-01 | Medium   | Gemini API calls visible in DevTools Network tab               | Move to `background.js` via `sendMessage`    |
| BUG-02 | Low      | `manifest.json` still lists dead files in `web_accessible_resources` | Remove `panel-template.html`, `content.css`, `lib/anime.min.js` |
| BUG-03 | Low      | `obfuscate.js` + `bridge.js` loaded but mostly unused by v3.6  | Audit usage; remove if not needed            |
| BUG-04 | Low      | `hi.js` (347 KB) still in repo                                | Delete                                       |
| DEBT-1 | Medium   | No unit tests                                                  | Add Puppeteer/Playwright test harness        |
| DEBT-2 | Low      | No error telemetry                                             | Add structured logging to `background.js`    |

---

## 8. Coding Rules

### 8.1 Critical Rules (MUST follow)

1. **NEVER add `pointer-events: none` to the Shadow DOM host element** — it blocks ALL child interactions
2. **Always use `panel.querySelectorAll()` for elements inside panel** — NOT `root.querySelectorAll()` (shadow root doesn't relay properly for absolute-positioned children)
3. **Always convert `right → left` before drag/resize** — the panel starts with `right:16px`; JS must call `fixPosition()` before computing offsets
4. **CSS + HTML MUST remain inline in `content.js`** — external fetch causes race conditions and requires WAR declarations
5. **All user-facing text MUST be Vietnamese with proper diacritics (UTF-8)**
6. **Toast pointers: container `pointer-events:none`, individual toast `pointer-events:auto`**

### 8.2 Style Rules

1. Use the design token system (`--bg`, `--red`, `--t1`, etc.) — never hardcode colors
2. Maintain minimum contrast: text on dark backgrounds must be ≥ `#9090A0`
3. CSS class names use single-letter prefix convention (`.H`, `.P`, `.T`, etc.)
4. No external CSS frameworks or font imports

### 8.3 Architecture Rules

1. **Name the runtime boundary first** before editing any file (`ISOLATED WORLD`, `PAGE WORLD`, `SW`)
2. **State blast radius**: before touching shared state (`S`), list every function that reads/writes it
3. **UI updates ONLY via `S.ui.*` methods** — never query shadow DOM directly from automation logic
4. **Quiz answer cache uses `localStorage`** — key format: `lms_q_{normalized_question_text}`

---

## 9. Audit Trail — Change Log Hooks

When making changes, update this section with a new entry:

### Template
```
### [DATE] — [CHANGE TITLE]
- **Files**: list modified files
- **Boundary**: which runtime boundary affected
- **Blast radius**: what functions/modules may break
- **Test**: how verified
- **Rollback**: how to undo
```

### 2026-03-30 — v3.6 Self-Contained Rewrite
- **Files**: `content.js` (complete rewrite)
- **Boundary**: ISOLATED WORLD
- **Blast radius**: All UI + automation + quiz + video logic
- **Test**: Browser test via http-server: drag ✅, resize ✅, toggle ✅, minimize ✅, FAB ✅, API input ✅, toast ✅
- **Rollback**: Restore previous `content.js` + `content.css` + `panel-template.html`

---

## 10. Workflow Checklists

### 10.1 Adding a New UI Component
- [ ] Define CSS classes with single-letter prefix inside the `CSS` constant
- [ ] Add HTML markup inside the `HTML` constant
- [ ] Wire event listeners in `initPanel()`
- [ ] Expose public update method on `S.ui`
- [ ] Use design tokens for all colors/spacing
- [ ] Test: drag still works, resize still works, no layout shift on page

### 10.2 Modifying Quiz Logic
- [ ] Identify target question format (MCQ radio, checkbox, drag-and-drop, PTIT custom)
- [ ] Check if `inject.js` hooks capture the relevant API response
- [ ] Check if `onNetData()` parses the response correctly
- [ ] Update `solveOneQ()` or add new handler
- [ ] Test with cached answer, Gemini AI answer, and fallback round-robin
- [ ] Verify localStorage cache key format consistency

### 10.3 Modifying Video Logic
- [ ] Check if `findVideo()` selector covers the new player (plyr, video.js, native)
- [ ] Verify `playbackRate` is respected by the player
- [ ] Test completion detection (both `ended` event and 98% interval check)
- [ ] Verify `navigateNext()` triggers after completion

### 10.4 Debugging
- [ ] Open DevTools → Console → filter `[LMSX]`
- [ ] Check if `__lmsx_root__` element exists in DOM
- [ ] Inspect Shadow DOM (must use `$0.shadowRoot` from content script console, not page console)
- [ ] Check `localStorage` for API key: `lms_gemini_key`
- [ ] Check `localStorage` for cached answers: keys starting with `lms_q_`

---

## 11. File Dependency Graph

```
manifest.json
  ├── content_scripts (in order):
  │   ├── obfuscate.js     ← sets window._O, __SEED, __bridgeToken
  │   ├── bridge.js        ← uses _O, __bridgeToken → sets window.edxBridge
  │   └── content.js       ← main logic (self-contained UI + automation)
  ├── background:
  │   └── background.js    ← service worker (independent)
  └── web_accessible_resources:
      └── inject.js        ← fetched + injected into page world by content.js
```

---

## 12. Testing Protocol

### 12.1 Local Test (No Extension)
```bash
npx -y http-server c:\ShareX\LMS -p 8888 --cors -c-1
# Open http://127.0.0.1:8888/test-panel.html
# Verifies: UI rendering, drag, resize, toggle, minimize, FAB
# Does NOT verify: inject.js hooks, background.js, real quiz solving
```

### 12.2 Extension Test (Brave/Chrome)
```
1. Navigate to chrome://extensions
2. Enable Developer Mode
3. Click "Load unpacked" → select c:\ShareX\LMS
4. Navigate to https://lms.ptit.edu.vn/
5. Verify panel appears at top-right
6. Open DevTools Console → check for [LMSX] v3.6 logs
7. Test toggle → verify video auto-plays at x4
8. Test API key input → verify pill status changes
```
