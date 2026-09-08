# FB Auto Tool v1.8.35 — Danh sách tính năng chi tiết (kèm ảnh bán hàng)

Thư mục này chứa ảnh giao diện thật của extension, chụp từ `popup.html` v1.8.35.
Dùng để làm slide / landing page / báo giá.

## Ảnh trong thư mục

| Ảnh | Tính năng |
| --- | --- |
| `01-ket-ban-theo-goi-y.png` | Tab Kết bạn — chế độ 1: Theo gợi ý |
| `02-ket-ban-thanh-vien-chung.png` | Tab Kết bạn — chế độ 2: Thành viên có điểm chung |
| `03-cao-bai-hoc-van-phong.png` | Tab Cào bài + Học kiến thức & văn phong |
| `04-nhom-dang-bai-tuong-tac-tham-gia-tukhoa.png` | Tab Nhóm — Đăng bài AI + Tương tác nhóm + Tìm & tham gia theo từ khóa |
| `05-nhom-kham-pha-discover.png` | Tab Nhóm — Tham gia theo Khám phá (Discover) |
| `06-share-bai-vao-nhom.png` | Tab Share bài vào nhóm + Chat AI |
| `07-ban-tin-va-comment-AI.png` | Tab Bản tin & AI — Tương tác bản tin + Comment AI |

---

## 1. Kết bạn tự động (2 chế độ) — `01`, `02`

**Chế độ 1 — Theo gợi ý (`/friends/suggestions`):**
- Tự mở trang Gợi ý kết bạn, chỉ quét nút Kết bạn trong vùng nội dung chính.
- Xử lý tuần tự từ trên xuống, delay Min–Max (VD 15–30s), kể cả trước lời mời đầu tiên.
- Chỉ tăng bộ đếm khi Facebook hiện “Đã gửi / Hủy lời mời”.
- Có nút Quét thử (không gửi), Reset tiến trình, Xóa lịch sử chống trùng.

**Chế độ 2 — Thành viên có điểm chung (theo nhóm):**
- Tải danh sách nhóm đã tham gia, lọc theo tên, chọn tất cả / chọn lẻ.
- Tự mở `/groups/{id}/members/`, chờ mục “Thành viên có điểm chung”, tự bấm “Xem tất cả”, chờ nút “Thêm bạn bè”.
- Lọc số bạn chung tối thiểu, bỏ qua đã gửi / đã là bạn, reload 1 lần nếu Facebook tải chậm.
- Chống gửi trùng `friendProfileHistory` qua reload, trạng thái uncertain tự hết sau 24h.
- Tự dừng khi Facebook cảnh báo / giới hạn / xác minh.

**Điểm bán:** an toàn, có xác nhận thật, không spam blind, có chế độ test trước.

## 2. Cào bài + Hồ sơ văn phong — `03`

- Nguồn: URL Profile / Fanpage / Nhóm nhập tay, hoặc trang đang mở.
- Tự cuộn + bấm “Xem thêm”, bóc text / link / ảnh, loại comment/reply lồng nhau, loại Messenger, loại bài quảng cáo (tùy chọn).
- Lưu tối đa 500 bài chuẩn hóa trong `chrome.storage.local.scrapePosts`.
- Xuất Markdown / JSON / TXT, tên file theo nguồn + timestamp, kiểm tra đúng nguồn trước khi tải.
- Khóa phiên cào theo URL + runSerial, chống tải nhầm dữ liệu nguồn cũ.
- **Học kiến thức & văn phong:** từ ≥3 bài đã cào, gọi AI 1 lần để rút chủ đề / thuật ngữ / giọng điệu / cấu trúc câu, fallback heuristic cục bộ khi mất mạng / hết quota. Hồ sơ dùng chung cho Comment AI, Đăng bài AI, Share bài.

**Điểm bán:** vừa là tool research đối thủ / khách hàng, vừa là “bộ não” giúp AI viết đúng giọng.

## 3. Đăng bài AI lên nhóm đã tham gia — `04` (nửa trái)

- Chọn nhóm đã tham gia, lọc tên, giới hạn số nhóm + delay giữa nhóm (5–3600s).
- AI dùng chung provider/key/model/Custom URL + hồ sơ văn phong, prompt có `{groupName}`.
- Bảng 12 màu nền trơn: Cố định 1 màu hoặc Random trong màu đã tích, tránh lặp màu liên tiếp, tự bỏ qua nhóm không có bảng nền (tùy chọn).
- Xác nhận nền theo trạng thái thật, gõ từng ký tự, chờ nút Đăng, chỉ chuyển nhóm sau khi Facebook xác nhận. Lỗi thử lại 3 lần tại cùng nhóm, không reload, không kẹt phiên.
- Nút “Tạo thử nội dung + màu” chỉ preview, không đăng.
- 8 provider: Gemini / OpenAI / Claude / Groq / OpenRouter / DeepSeek / Mistral / Custom, nút Test API riêng.

**Điểm bán:** nuôi group / seeding / bán hàng bằng content AI nền màu nổi bật.

## 4. Tương tác nhóm đã tham gia — `04` (nửa phải)

- Mở N nhóm đầu theo thứ tự đã tích, mỗi nhóm thả cảm xúc đúng số bài, delay Min–Max.
- 7 lựa chọn: Like / Love / Haha / Wow / Sad / Angry / Random.
- Tùy chọn **Bình luận AI cho mỗi bài đã thả cảm xúc**: dùng AI chung + văn phong, chống trùng riêng, fallback câu mẫu, báo lý do skip chi tiết trong status, tự quay lại nhóm nếu comment làm lạc trang.
- Chọn nhóm theo từ khóa (nhiều từ, cách nhau dấu phẩy).

**Điểm bán:** tăng tương tác / uy tín nick trong nhóm để bán hàng, không bị coi là clone.

## 5. Tìm & tham gia nhóm mới — `04` (dưới) + `05`

**Theo từ khóa (`facebook.com/search/groups/?q=`):**
- Lọc thành viên tối thiểu, bài/ngày tối thiểu, số nhóm muốn tham gia, delay.
- Tự trả lời hộp “Câu hỏi / Xem xét quyền tham gia / Trả lời câu hỏi”: tự tích checkbox, đi nhiều bước Tiếp/Tục, chờ nút Gửi được bật.
- Câu nội quy dùng câu mẫu, câu mở dùng AI (`{groupName}` + `{questions}`), thiếu câu trả lời thì không gửi, không tăng đếm.
- Tự resume đúng từ khóa sau redirect/reload, chặn đổi từ khóa giữa phiên.

**Theo Khám phá (`/groups/discover`):**
- Cuộn mục “Gợi ý khác”, tham gia từng card, dùng chung AI/câu mẫu, bộ đếm riêng, tự quay lại Discover nếu bị SPA đá về Feed.

**Điểm bán:** build dàn nick / phủ thị trường theo từ khóa (chứng khoán, BĐS, marketing…).

## 6. Share bài vào nhóm — `06`

- Nhập link 1 bài Facebook cụ thể, tiện ích mở đúng link (kể cả modal “Bài viết của…”), đọc article chính, loại comment/reply, lưu 4000 ký tự.
- Khung “Nội dung AI đã đọc” cho phép dán/sửa tay nếu Facebook chặn.
- **Chat AI trước khi share:** lưu theo link, làm ngữ cảnh cho lời dẫn từng nhóm.
- Mỗi nhóm 1 lời dẫn riêng từ `{postText}` + `{groupName}` + chat, làm sạch URL/hashtag/Markdown, chống trùng nhóm trước.
- Tại nhóm: gõ lời dẫn + link để dựng preview, xóa URL chữ, chỉ bấm Đăng khi preview đúng permalink/media, bấm 1 lần, chỉ tăng đếm khi composer được Facebook nhận. Fail-closed: không preview / sai bài / không xác nhận thì dừng, không đăng bài chỉ có URL.

**Điểm bán:** seeding 1 bài bán hàng ra hàng chục nhóm mà mỗi nhóm một caption khác nhau, an toàn.

## 7. Tương tác bản tin — `07` (trái)

- Chỉ chạy trên Bảng tin chính `/`, tự đưa tab về đúng route khi bấm Start.
- Like / Love / Haha / Wow / Sad / Angry / Random, xác nhận trạng thái đã đổi, đánh dấu đã tương tác, bỏ qua Reels/Watch/quảng cáo/comment con.
- Delay Min–Max, quét thử highlight không like, Reset/Dừng đầy đủ.

## 8. Comment AI bản tin — `07` (phải, đã test 20/20)

- 8 provider chung, lưu nhiều key (mỗi provider 1 key), Test API, prompt có `{postText}`.
- 3 chế độ tiết kiệm: Cân bằng (gom lô), Tiết kiệm tối đa (câu mẫu), Cá nhân hóa (từng bài) + cache theo ngày.
- Chống trùng 3 lớp: identity canonical + vân tay nội dung + nhận diện comment của chính mình; Reset không xóa lịch sử.
- Bấm Bình luận 1 lần duy nhất, chờ ô nhập không giới hạn có đếm giây, gõ trustedInput, bấm Đăng 1 lần, xác minh comment ngoài editor trong 30s. DOM recycle thì tìm lại đúng bài, hết bài thì cuộn/reload giữ tiến độ (tối đa 10 lần).

**Điểm bán:** comment dạo tự nhiên để kéo tương tác / inbox, tiết kiệm quota AI.

## 9. Nền tảng chung (điểm cộng khi chốt sale)

- Chrome MV3, chạy trên facebook.com, popup 800px 5 tab, tự về đúng panel đang chạy khi mở lại.
- Mọi nút Start đều chuyển trạng thái ⏳ ngay khi bấm và tự routing về đúng trang nhiệm vụ.
- Mọi bộ đếm chỉ tăng sau xác nhận Facebook (“bấm không算 thành công”).
- Vòng lặp dài có stop flag + runId, sống qua SPA rerender, không giữ DOM stale.
- `chrome.storage.local` cho tiến trình, `chrome.storage.sync` cho cấu hình; không để API key/cookie vào log.
- Không động vào Messenger, comment con, sponsored nếu tính năng không cho phép.

---
Chụp bằng Chrome 152 headless, window 840px, từ file `popup.html` gốc (đã gỡ `popup.js` chỉ để chụp tĩnh).
