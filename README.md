<div align="center">

<br/>

<pre align="center" style="font-family: monospace; font-size: 12px; line-height: 1.2; margin: 0 auto;">
██╗     ███╗   ███╗███████╗██╗  ██╗
██║     ████╗ ████║██╔════╝╚██╗██╔╝
██║     ██╔████╔██║███████╗ ╚███╔╝ 
██║     ██║╚██╔╝██║╚════██║ ██╔██╗ 
███████╗██║ ╚═╝ ██║███████║██╔╝ ██╗
╚══════╝╚═╝     ╚═╝╚══════╝╚═╝  ╚═╝
</pre>

**PTIT LMS Automation · Chrome Extension MV3**

[![Version](https://img.shields.io/badge/version-3.6-22c55e?style=flat-square&logo=semanticrelease&logoColor=white)](https://github.com/Giahung07/LMSX)
[![Chrome](https://img.shields.io/badge/Chrome-MV3-4285F4?style=flat-square&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com)
[![Edge](https://img.shields.io/badge/Edge-Supported-0078D4?style=flat-square&logo=microsoftedge&logoColor=white)](https://microsoftedge.microsoft.com)
[![Node](https://img.shields.io/badge/Node.js-required-339933?style=flat-square&logo=nodedotjs&logoColor=white)](#bước-2--build)
[![License](https://img.shields.io/badge/license-Personal-f59e0b?style=flat-square)](#lưu-ý)

<br/>

*Tự động hoá toàn bộ vòng lặp học — Video × Quiz × Chuyển bài — trên `lms.ptit.edu.vn`*

<br/>

</div>

---

## Tổng quan

LMSX v3.6 là Chrome Extension Manifest V3 được viết lại hoàn toàn theo kiến trúc module hoá. Extension tự động xử lý toàn bộ chu trình học:

```
Video (x4) ──▶ Quiz (AI) ──▶ Chuyển bài ──▶ lặp lại
```

Hệ thống dùng **Shadow DOM** để cách ly UI hoàn toàn khỏi trang LMS, **AES-GCM** để mã hoá session token, và **Gemini API** để giải trắc nghiệm chính xác cao.

---

## Tính năng

| Module | Mô tả |
|---|---|
| `automation/video.js` | Autoplay muted, khoá tốc độ **4×**, phát hiện >98% để chuyển bài |
| `automation/quiz.js` | Scrape câu hỏi → gửi **Gemini 2.5 Flash** → parse JSON → tự click đáp án |
| `automation/navigator.js` | Dò nút chuyển slide/bài học, xử lý SPA navigation |
| `stealth/bypass.js` | Vô hiệu hoá chặn Copy/Cut/Select/ContextMenu của OpenEdX |
| `ui/panel.js` | Floating panel **Shadow DOM** — drag, resize, minimize thành FAB |
| `background.js` | Service worker: AES-GCM encrypt token, intercept `Authorization` header |
| `inject.js` | Hook XHR/fetch trong page context, bridge event về content script |

---

## Cài đặt

### Yêu cầu

- Chrome ≥ 109 hoặc Edge ≥ 109 (Manifest V3)
- Node.js (bất kỳ version LTS nào)

### Bước 1 — Lấy source

```bash
git clone https://github.com/Giahung07/LMSX.git
cd LMSX
```

hoặc tải ZIP → giải nén.

### Bước 2 — Build

```bash
node build.js
# [build] added main.js
# [build] added storage/schema.js
# ...
# [build] content.js updated (2026-xx-xx)
```

> Trong quá trình dev: `node build.js --watch` để tự rebuild khi sửa file trong `src/`.

### Bước 3 — Load vào Chrome

1. Mở `chrome://extensions`
2. Bật **Developer mode** (góc phải trên)
3. Nhấn **Load unpacked** → chọn thư mục `LMSX`
4. Icon LMSX xuất hiện trên toolbar

---

## Cấu hình API Key

LMSX hỗ trợ hai nhà cung cấp AI — cấu hình qua panel (icon ⚙ góc phải):

### OpenRouter

1. Vào [openrouter.ai/keys](https://openrouter.ai/keys) → tạo API key
2. Dán vào ô **OpenRouter** trong panel
3. Model mặc định: `llama-3.3-70b-versatile`

### Groq

1. Vào [console.groq.com/keys](https://console.groq.com/keys) → tạo API key
2. Dán vào ô **Groq** trong panel
3. Model mặc định: `llama-3.3-70b-versatile`

> Không nhập API key → extension fallback sang chế độ phỏng đoán xoay vòng (vẫn pass quiz nhưng độ chính xác thấp hơn).

Key được lưu qua `chrome.storage.sync` — không gửi ra ngoài ngoài API call đến nhà cung cấp đã chọn.

---

## Sử dụng

Truy cập bất kỳ khoá học nào trên `lms.ptit.edu.vn` — panel LMSX tự động xuất hiện.

### Điều khiển panel

| Thao tác | Hành vi |
|---|---|
| Toggle **Auto** | Bật/tắt vòng lặp tự động toàn khoá học |
| Dot 🔴 | Thu nhỏ panel thành nút mini dock |
| Dot 🟡 | Thu gọn/mở rộng vùng log |
| Dot 🟢 | Chạy / Dừng automation |
| Icon ⚙️ | Xoay card sang cài đặt API key |
| Kéo titlebar | Di chuyển panel trên màn hình |
| Mini dock | Click để mở rộng panel khi đã thu nhỏ |

### Log panel

```
› Đọc câu hỏi...
✓ Scrape xong
› Gọi AI...
✓ Nhận phản hồi
› Đang điền đáp án...
✓ Xong
```

---

## Kiến trúc

```
LMSX/
├── manifest.json              MV3 config
├── background.js              Service worker (AES-GCM vault, message router)
├── content.js                 Build output — tự động tạo bởi build.js
├── inject.js                  Page context hook (XHR/fetch proxy)
├── obfuscate.js               Session hash cho class/event name
├── build.js                   Module bundler
│
├── src/
│   ├── main.js                Global state & constants
│   ├── init.js                Bootstrap
│   ├── storage/
│   │   ├── schema.js          Storage schema & defaults
│   │   └── adapter.js         chrome.storage wrapper
│   ├── runtime/
│   │   ├── logger.js          Log system
│   │   ├── state.js           Reactive state machine
│   │   ├── selectors.js       DOM selector registry
│   │   └── bridge.js          Content ↔ inject bridge
│   ├── network/
│   │   ├── providers.js       OpenRouter / Groq API client
│   │   └── bridge.js          Network event relay
│   ├── ui/
│   │   ├── css.js             Shadow DOM stylesheet (Space Grotesk, JetBrains Mono)
│   │   ├── html.js            Panel HTML template
│   │   └── panel.js           Panel controller (drag, resize, flip, dot states)
│   ├── automation/
│   │   ├── video.js           Video speed lock & completion detection
│   │   ├── quiz.js            Quiz scraper → AI → DOM click
│   │   └── navigator.js       Lesson navigation loop
│   └── stealth/
│       └── bypass.js          Anti-block (copy/select/contextmenu)
│
└── assets/
    ├── icons/                 icon16/32/48/128.png
    └── fonts/
        └── JetBrainsMono-Regular.woff2
```

### Luồng xử lý quiz

```
Page DOM
  │
  ├─▶ quiz.js          scrape câu hỏi + choices
  │
  ├─▶ providers.js     POST → OpenRouter / Groq API
  │     {
  │       model: "llama-3.3-70b-versatile",
  │       temperature: 0.1,
  │       response_format: { type: "json_object" }
  │     }
  │
  ├─▶ AI Response      { "reasoning": "...", "index": 2 }
  │
  └─▶ quiz.js          click choices[index] → submit
```

### Bảo mật

- `Authorization` header của LMS được intercept bởi `background.js` và lưu **in-memory** với AES-GCM 256-bit
- Vault tự xoá khi service worker suspend (`chrome.runtime.onSuspend`)
- Class name và event name được hash ngẫu nhiên mỗi session qua `obfuscate.js`
- API key chỉ tồn tại trong `chrome.storage.sync` — không bao giờ log ra console

---

## Troubleshooting

**Panel không hiện?**
→ Nhấn F5. SPA đôi khi mount trước khi content script ready. Nếu vẫn không được: reload extension tại `chrome://extensions`.

**AI trả lời sai / lỗi?**
→ Kiểm tra API key còn hạn. Xem log chi tiết ngay trên panel LMSX (vùng log màu đen). Hoặc mở DevTools (`F12`) → Console → tìm `[LMSX]` (chỉ hiện nếu bật verbose logs).

**Video không tăng tốc?**
→ Một số bài dùng iframe cross-origin. `all_frames: false` trong manifest — cân nhắc đổi sang `true` nếu cần.

**`content.js` không tồn tại sau clone?**
→ Chạy `node build.js` trước khi load unpacked.

---

## Lịch sử phiên bản

| Version | Highlights |
|---|---|
| **v3.6** | Modular src/, OpenRouter + Groq dual provider, Shadow DOM panel, AES-GCM vault, Stealth bypass |
| **v1.0** | Monolithic script, x4 speed, Gemini only |

---

## Lưu ý

> Dự án phục vụ mục đích cá nhân — tối ưu hoá thời gian học tập.

- Không phân phối lại dưới hình thức thương mại.
- Tác giả không chịu trách nhiệm nếu hệ thống LMS ghi nhận hành vi bất thường.
- Toàn bộ dữ liệu nhạy cảm được mã hoá cục bộ, không gửi về server của tác giả.

---

<div align="center">

Made with ♥ by **PGH** · PTIT · Manifest V3

</div>