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

**LMS Automation · Chrome Extension MV3**

[![Version](https://img.shields.io/badge/version-3.6.2-22c55e?style=flat-square&logo=semanticrelease&logoColor=white)](https://github.com/Giahung07/LMSx)
[![Chrome](https://img.shields.io/badge/Chrome-MV3-4285F4?style=flat-square&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com)
[![Edge](https://img.shields.io/badge/Edge-Supported-0078D4?style=flat-square&logo=microsoftedge&logoColor=white)](https://microsoftedge.microsoft.com)
[![Node](https://img.shields.io/badge/Node.js-required-339933?style=flat-square&logo=nodedotjs&logoColor=white)](#bước-2--build)
[![License](https://img.shields.io/badge/license-Personal-f59e0b?style=flat-square)](#lưu-ý)

<br/>

*Auto — Video × Quiz × Chuyển bài*

<br/>

</div>

---

## Tổng quan

LMSx v3.6.2 là Chrome Extension Manifest V3 được viết theo kiến trúc module hoá. Extension tự động xử lý toàn bộ chu trình học:

```text
Video (x4) -> Quiz (AI) -> Chuyển bài -> lặp lại
```

Hệ thống dùng **Shadow DOM** để cách ly UI khỏi trang LMS, **AES-GCM** để mã hoá session token, và hiện tại dùng **Groq API** để hỗ trợ giải quiz.

---

## Tính năng

| Module | Mô tả |
|---|---|
| `automation/video.js` | Autoplay video, khoá tốc độ **4x**, tự fallback mute nếu browser chặn autoplay, phát hiện gần hết video để chuyển bài |
| `automation/quiz.js` | Scrape câu hỏi -> gửi **Groq** -> parse JSON -> tự click đáp án và nộp bài |
| `automation/navigator.js` | Tìm bài hiện tại trong sidebar, đi bài liền kề, sang chapter kế tiếp khi cần |
| `stealth/bypass.js` | Vô hiệu hoá chặn Copy/Cut/Select/ContextMenu của OpenEdX |
| `ui/panel.js` | Floating panel Shadow DOM, drag, thu gọn, lưu key, hiển thị trạng thái |
| `background.js` | Service worker cho session vault và message routing |
| `inject.js` | Hook XHR/fetch trong page context, bridge event về content script |

---

## Cài đặt

### Yêu cầu

- Chrome >= 109 hoặc Edge >= 109
- Node.js LTS

### Bước 1 — Lấy source

```bash
git clone https://github.com/Giahung07/LMSx.git
cd LMSx
```

Hoặc tải ZIP rồi giải nén.

### Bước 2 — Build

```bash
node build.js
```

Trong quá trình dev có thể dùng:

```bash
node build.js --watch
```

### Phát hành tự động

Repo đã có GitHub Actions để tự build và upload file ZIP vào **Releases** khi push tag version.

Ví dụ:

```bash
git tag v3.6.2
git push origin v3.6.2
```

Workflow sẽ tự:
- patch `manifest.json` theo version của tag
- build `content.js`
- đóng gói `dist/LMSx-v3.6.zip`
- upload ZIP vào GitHub Release tương ứng

### Bước 3 — Load vào Chrome

1. Mở `chrome://extensions`
2. Bật **Developer mode**
3. Nhấn **Load unpacked**
4. Chọn thư mục `LMSx`

---

## Cấu hình API key

Hiện tại LMSx chỉ dùng **Groq**.

1. Vào [console.groq.com/keys](https://console.groq.com/keys)
2. Tạo API key
3. Dán vào ô **Groq** trong panel cài đặt
4. Nhấn **Lưu cài đặt**

Model mặc định đang dùng:

```text
llama-3.3-70b-versatile
```

Key được lưu qua `chrome.storage.sync` và đồng bộ vào cấu hình nội bộ của extension.

---

## Sử dụng

Truy cập một khoá học trên `lms.ptit.edu.vn`, panel LMSx sẽ xuất hiện.

### Điều khiển panel

| Thao tác | Hành vi |
|---|---|
| Toggle **Auto** | Bật/tắt automation |
| Dot đỏ | Thu nhỏ panel |
| Dot vàng | Thu gọn log |
| Dot xanh | Chạy / Dừng thủ công |
| Icon bánh răng | Mở mặt sau để nhập Groq key |
| Kéo titlebar | Di chuyển panel |

### Trạng thái thường gặp

```text
Đang chạy video x4...
Đọc câu hỏi...
Gọi AI...
Đang điền đáp án...
Xong
```

---

## Kiến trúc

```text
LMSx/
├── manifest.json
├── background.js
├── content.js
├── inject.js
├── obfuscate.js
├── build.js
├── src/
│   ├── main.js
│   ├── init.js
│   ├── storage/
│   ├── runtime/
│   ├── network/
│   ├── ui/
│   ├── automation/
│   └── stealth/
└── assets/
    ├── icons/
    └── fonts/
```

### Luồng quiz

```text
Page DOM
  -> quiz.js scrape câu hỏi + đáp án
  -> providers.js gọi Groq
  -> quiz.js parse kết quả
  -> click đáp án + nộp bài
```

### Luồng chuyển bài

```text
Video/Quiz hoàn tất
  -> navigator.js xác định bài hiện tại
  -> chọn bài liền kề trong chapter đang mở
  -> nếu đang ở cuối chapter thì mở chapter kế tiếp
  -> nếu không xác định được thì fallback sang nút Next thật trên trang
```

## Lưu ý

> Dự án phục vụ mục đích cá nhân để tối ưu thời gian học.

- AI không đảm bảo đúng 100%, nhưng thường đủ để qua
- Không phân phối lại dưới hình thức thương mại
- Tác giả không chịu trách nhiệm nếu LMS ghi nhận hành vi bất thường
- Dữ liệu nhạy cảm được lưu cục bộ
---

### Liên hệ

Nếu bạn có bất kỳ thắc mắc hoặc vấn đề nào liên quan đến repo, vui lòng liên hệ:

> Email: [lanmanptit@gmail.com](mailto:lanmanptit@gmail.com)
---

<div align="center">

Made with ♥ by **LanMan** · Manifest V3

</div>
