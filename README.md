<div align="center">

# LMSX (PTIT LMS Auto)

### Bảng Điều Khiển Tự Động Học · Hệ thống bài giảng số PTIT

[![Chrome](https://img.shields.io/badge/Chrome-MV3-4285F4?logo=googlechrome&logoColor=white&style=flat-square)](https://chromewebstore.google.com)
[![Edge](https://img.shields.io/badge/Edge-Supported-0078D4?logo=microsoftedge&logoColor=white&style=flat-square)](https://microsoftedge.microsoft.com)
[![Version](https://img.shields.io/badge/Version-v3.6-22c55e?style=flat-square)](#lịch-sử-phiên-bản)
[![License](https://img.shields.io/badge/License-Personal-f59e0b?style=flat-square)](#lưu-ý)

**LMSX v3.6** là tiện ích trình duyệt Manifest V3 được tái cấu trúc hoàn toàn, tự động hóa toàn diện quá trình học trên nền tảng [lms.ptit.edu.vn](https://lms.ptit.edu.vn). Extention cung cấp tính năng tự động phát video tốc độ x4, ứng dụng trí tuệ nhân tạo (Gemini API) để giải quiz và chuyển bài tự động. Hệ thống mới được trang bị UI thông minh ngăn cách (Shadow DOM) tĩnh, siêu mượt.

</div>

---

## Mục lục

- [Tính năng Mới (v3.6)](#tính-năng-mới-v36)
- [Cài đặt Gemini API Key](#cài-đặt-gemini-api-key-để-giải-quiz-ai)
- [Hướng Dẫn Cài Đặt Tools](#hướng-dẫn-cài-đặt-tools)
- [Hướng dẫn sử dụng](#hướng-dẫn-sử-dụng)
- [Kiến trúc hệ thống](#kiến-trúc-hệ-thống)
- [Câu hỏi thường gặp](#câu-hỏi-thường-gặp)
- [Lưu ý](#lưu-ý)

---

## Tính năng Mới (v3.6)

| Tính năng                        | Mô tả                                                                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Video Tốc Độ Cao (x4)**        | Tự ngầm phát (muted autoplay), khóa tốc độ 4x liên tục, tự detect >98% để qua bài                                                |
| **Giải Quiz Bằng AI Gemini**     | Scan câu hỏi, trích xuất text gửi qua Gemini 2.5 Flash xử lý đáp án cực kỳ chính xác. Fallback luân phiên vòng tròn nếu AI sai/lỗi |
| **Chuyển Bài Tự Động**           | Hoàn tất Video hoặc Quiz xong hệ thống tự động dò tìm nút ấn chuyển slide/bài học tiếp theo (Navigator)                          |
| **Kháng Detect Bắt dính**        | Chống chặn Copy/Cut/Select của hệ thống mặc định (Stealth Bypass)                                                                |
| **UI Chuyên Nghiệp (ShadowDOM)** | Panel xịn mịn hỗ trợ kéo thả (Drag), phóng to thu nhỏ (Resize), ẩn vào góc (minimize FAB), có báo thức log toast (Native UI)     |

---

## Cài đặt Gemini API Key (Để giải Quiz AI)

Tiện ích LMSX v3.6 sử dụng mô hình trí tuệ nhân tạo của Google (Gemini API) để tăng tính chuẩn xác khi giải bài tập Trắc Nghiệm và Điền từ. Mã API là miễn phí.
_Nếu bạn không nhập API Key, Tools sẽ giải bằng phỏng đoán quay vòng (Vẫn vượt qua quiz)._

1. Truy cập [Google AI Studio - Get API Key](https://aistudio.google.com/app/apikey) (Tham khảo docs nhanh: [Google AI Quickstart](https://ai.google.dev/gemini-api/docs/quickstart)).
2. Đăng nhập bằng tài khoản Google của bạn.
3. Nhấp vào **"Create API Key"** (màu xanh).
4. **Copy mã API này** và dán vào ô **`GEMINI API`** trên Panel của tiện ích khi khởi động LMSX.
   _(Extenion sẽ tự động lưu lại trong bộ nhớ trình duyệt `localStorage` an toàn để dùng cho các bài học sau)_

---

## Hướng Dẫn Cài Đặt Tools

> **Yêu cầu:** Google Chrome ≥ 109 hoặc Microsoft Edge ≥ 109 (hỗ trợ Manifest V3) và **Node.js**.

### Bước 1 — Lấy Source

```bash
# Clone repository
git clone https://github.com/Giahung07/LMSX.git

# Hoặc tải ZIP và giải nén (Folder: LMS)
```

### Bước 2 — Build và Tải vào trình duyệt

Do phiên bản 3.6 sử dụng kiến trúc modules hoá chuyên nghiệp:

1. Mở Terminal (CMD/PowerShell) ở thư mục `LMS`.
2. Chạy lệnh: `node build.js` để gói code module thành file `content.js` chuẩn.
3. Mở Trình duyệt, truy cập `chrome://extensions` (Chrome) hoặc `edge://extensions` (Edge).
4. Bật **Developer mode** ở góc trên bên phải.
5. Nhấn **Load unpacked** → Chọn đến thư mục `LMS`.
6. Biểu tượng LMSX Auto xuất hiện và bật sáng.

---

## Hướng dẫn sử dụng

Khi vào bất kỳ khóa học nào trên `lms.ptit.edu.vn`, panel LMSX v3.6 tự động xuất hiện.

### Các thao tác giao diện chung

| Thao tác                  | Hành vi                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| **Công tắc `Automation`** | Gạt bật lên màu đỏ: Tools bắt đầu vòng lặp auto toàn khoá học (Nhấn để ON/OFF)                   |
| **Thanh Tiêu Đề**         | Click giữ chuột phần Header để **Kéo** bảng đi muôn nơi                                          |
| **Góc dưới cùng (⤡ )**    | Click vào góc dưới bên phải panel để **Mở rộng / Kéo dãn** (Resize) màn hình log                 |
| **Dấu ( - ) / Đóng**      | Nhấn dấu trừ để thu gọn Panel thành 1 Nút Mini (FAB) hình Tia Sét tròn nhỏ bên góc trái màn hình |
| **Log Board**             | Màn hình đen theo dõi trực tuyến hành vi của Automation và tiến độ bài học.                      |

---

## Kiến trúc hệ thống

Hệ thống được thiết kế theo dạng Component Module cao cấp:

```
LMSX/
├── build.js               Script gộp module (node)
├── content.js             Output file sau khi build (Self-contained)
├── manifest.json          Cấu hình MV3
├── background.js          Service worker: AES-GCM encryption
├── obfuscate.js           Hash ngẫu nhiên class/event name
├── inject.js              Hook XHR/fetch trong page context
├── js/runtime/bridge.js   Communication bridge
├── src/                   Thư mục source code cho build
│   ├── main.js            ← Global scope & states
│   ├── init.js            ← Khởi động
│   ├── ui/                ← Layout System (CSS/HTML strings), Animation
│   ├── automation/        ← Engine giải Video / AI Quiz / Navigate Loop
│   └── stealth/           ← Bypass chặn hành vi
└── assets/                Icons và resources
```

### Luồng dữ liệu Xử lý

```
lms.ptit.edu.vn → XHR API calls
    │
    ├─▶ background.js   AES-GCM encrypt token → session storage
    ├─▶ inject.js       Proxy hook XHR/fetch → bridge event (Bắt correct_map của Quiz API)
    └─▶ content.js      Detect content → Đẩy qua Gemini qua fetch AI api → Push lại DOM Submit
```

---

## Câu hỏi thường gặp

<details>
<summary><strong>Panel không hiện ra?</strong></summary>
Nhấn <strong>F5</strong> tải lại trang, do SPA đôi khi Load chưa đồng bộ kịp. Hoặc tải lại extenion.
</details>

<details>
<summary><strong>Gemini báo ERR?</strong></summary>
Mã API Key bạn dán chưa đúng hoặc đã hết hạn (Quota exceeded). Vui lòng check Console (`F12`) để xem chi tiết mã lỗi từ Google.
</details>

<details>
<summary><strong>Tại sao dùng Shadow DOM?</strong></summary>
Để cách ly hoàn toàn CSS của thẻ, nhằm đảm bảo không bị xung đột Style với các nút UI của hệ thống LMS OpenEdx. Cực kỳ ổn định.
</details>

---

## Lịch sử phiên bản

| Phiên bản | Thay đổi                                                                                                                    |
| --------- | --------------------------------------------------------------------------------------------------------------------------- |
| **v3.6**  | Modular architecture (Tách src), Gemini AI integration, ShadowDOM Encapsulation, Stealth Copy, Remove Mako Templates limit. |
| **v1.0**  | Bản nguyên thể: x4 Speed, Chế độ cũ (Watch/Run/Auto)                                                                        |

---

## Lưu ý

> Dự án cho mục đích cá nhân và tối ưu hóa thời gian học tập.

- Không phân phối lại dưới mục đích thương mại.
- Công cụ sử dụng kiến thức AI Machine Learning để trợ giúp kỹ năng giải toán, tác giả không chịu trách nhiệm trong việc hệ thống ghi nhận.
- Mọi dữ liệu Storage khóa AES mã hóa ở Background cục bộ.

---

<div align="center">

Made with ♥ · PGH · Manifest V3

</div>

# LMSx
