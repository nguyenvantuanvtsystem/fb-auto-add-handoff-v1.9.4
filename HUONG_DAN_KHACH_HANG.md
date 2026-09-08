# FB Auto Tool v1.9.32 — Hướng dẫn cài đặt và sử dụng

Tài liệu này dành cho người dùng cuối. Extension chạy trên Google Chrome và thao tác trên tài khoản Facebook đang đăng nhập trong trình duyệt.

## 1. Thành phần trong bộ cài

Sau khi giải nén, thư mục extension phải có tối thiểu các file sau:

- `manifest.json`
- `popup.html`
- `popup.js`
- `background.js`
- `content.js`, `feed.js`, `group.js`, `scrape.js`, `share.js`, `sales.js`, `trend.js`, `i18n.js`
- `icon128.png`

Không đổi tên hoặc di chuyển riêng lẻ các file này. Extension không chứa sẵn API Key hay cookie Facebook; các thông tin đó không nằm trong file ZIP.

## 2. Cài đặt từ file ZIP

### Bước 1 — Giải nén

1. Tải file ZIP về máy.
2. Nhấp chuột phải vào file ZIP và chọn **Extract All… / Giải nén tất cả…**.
3. Chọn một thư mục dễ tìm, ví dụ Desktop, rồi bấm **Extract / Giải nén**.
4. Mở thư mục vừa giải nén và kiểm tra ngay bên trong có file `manifest.json`.

> Khi chọn thư mục ở bước cài Chrome, hãy chọn đúng thư mục chứa `manifest.json`, không chọn trực tiếp file ZIP và không chọn thư mục cha bên ngoài.

### Bước 2 — Nạp extension vào Chrome

1. Mở Chrome và truy cập `chrome://extensions`.
2. Bật **Developer mode / Chế độ dành cho nhà phát triển** ở góc phải.
3. Bấm **Load unpacked / Tải tiện ích đã giải nén**.
4. Chọn thư mục đã giải nén ở Bước 1.
5. Nếu thấy thẻ **FB Auto Tool - Add Scrape Group Feed AI**, cài đặt đã thành công.
6. Có thể bấm biểu tượng ghim trong Chrome để ghim extension lên thanh công cụ.
7. Mở hoặc tải lại một tab Facebook trước khi sử dụng.

### Cập nhật phiên bản mới

1. Dừng các phiên đang chạy trong extension.
2. Giải nén bản ZIP mới vào một thư mục riêng hoặc ghi đè thư mục cũ.
3. Vào `chrome://extensions` và bấm **Reload / Tải lại** trên thẻ FB Auto Tool.
4. Tải lại các tab Facebook đang mở.

Không xóa thư mục cấu hình Chrome hoặc dữ liệu trình duyệt để cập nhật. Nếu muốn giữ tiến trình và cấu hình, nên dùng lại cùng hồ sơ Chrome.

## 3. Chuẩn bị trước khi chạy

- Đăng nhập Facebook trong Chrome và mở một tab `facebook.com`.
- Lần đầu nên chạy thử một nhóm hoặc một bài để kiểm tra đúng tài khoản, route và bộ lọc.
- Bấm biểu tượng extension để mở popup. Nếu popup đang ở tab khác, chọn đúng tab tính năng ở hàng đầu.
- Mỗi tính năng có bộ đếm và trạng thái riêng. Chỉ tăng bộ đếm sau khi Facebook xác nhận thao tác thành công.
- Nút **Dừng** dừng phiên hiện tại; nút **Reset** xóa tiến trình của tính năng đó nhưng thường vẫn giữ cấu hình và danh sách đã chọn.
- Khi đang chạy, không nên sửa prompt hoặc thay đổi danh sách. Với các luồng đăng nhóm, Share và Đăng bán, prompt được chụp cố định cho phiên hiện tại; bấm **Dừng** rồi sửa nếu muốn áp dụng ngay.
- Facebook có thể giới hạn thao tác tự động. Nên đặt delay dài, chạy số lượng nhỏ và dừng khi Facebook cảnh báo.

## 4. Cấu hình AI dùng chung

Các tính năng Comment AI, Đăng bài AI, Học nhóm, Share bài, Đăng bán và trả lời câu hỏi tham gia nhóm dùng cấu hình AI chung.

1. Mở tab **📰 Bản tin & AI** hoặc khu vực cấu hình AI trong **👥 Nhóm**.
2. Chọn **AI Provider**: OpenAI, Gemini, Claude, Groq, OpenRouter, DeepSeek, Mistral hoặc Custom (OpenAI-compatible).
3. Nhập API Key của provider tương ứng.
4. Chọn model. Nếu chọn Custom, nhập thêm **Custom URL** dạng OpenAI-compatible.
5. Bấm **Lưu và Test API** để kiểm tra.
6. Có thể chọn hoặc bỏ qua **Hồ sơ văn phong** được tạo từ tab **📄 Cào bài**.

API Key được lưu trong bộ nhớ cấu hình của trình duyệt để dùng lại, không được đóng gói vào ZIP. Không gửi ảnh chụp API Key cho người khác và không chép key vào file extension.

## 5. Cách lấy API Key cho từng nền tảng

Bạn chỉ cần chọn **một** provider để bắt đầu. Mỗi provider có tài khoản, giới hạn và cách tính phí riêng. Tên nút trên website có thể thay đổi nhẹ theo thời điểm; luôn dùng đúng trang chính thức bên dưới.

### OpenAI

1. Mở trang [OpenAI API Keys](https://platform.openai.com/api-keys) và đăng nhập tài khoản OpenAI.
2. Bấm **Create new secret key** hoặc nút tạo key tương đương.
3. Đặt tên để dễ nhận biết, ví dụ `fb-auto-tool`.
4. Sao chép key ngay khi tạo. OpenAI chỉ hiển thị đầy đủ secret key lúc tạo; nếu mất key, tạo key mới.
5. Trong extension chọn **OpenAI**, dán key, chọn model rồi bấm **Lưu và Test API comment**.

API sử dụng có thể phát sinh chi phí hoặc giới hạn theo tài khoản/project. Có thể xem usage, billing và xóa key trong OpenAI Platform.

### Google Gemini

1. Mở [Google AI Studio - API Keys](https://aistudio.google.com/app/apikey) và đăng nhập Google.
2. Nếu được yêu cầu, chấp nhận điều khoản và chọn/import một Google Cloud project.
3. Bấm **Create API key**; với project có sẵn, chọn đúng project trước khi tạo.
4. Sao chép key và giữ trong nơi an toàn. Nên giới hạn key chỉ cho Gemini API nếu giao diện tài khoản cung cấp tùy chọn này.
5. Trong extension chọn **Gemini (Google)**, dán key, chọn model Gemini rồi bấm **Lưu và Test API**.

Google AI Studio có thể có hạn mức miễn phí; hạn mức cao hơn thường cần bật billing. Key Gemini cần được bảo vệ và không nên để ở chế độ unrestricted.

### Claude / Anthropic

1. Mở [Anthropic Console](https://console.anthropic.com/) và đăng nhập hoặc tạo tài khoản.
2. Hoàn tất phần workspace/billing nếu Console yêu cầu để bật API.
3. Mở phần **API Keys** trong Console, bấm **Create Key** hoặc nút tạo key tương đương.
4. Đặt tên, tạo key và sao chép ngay vì secret key thường chỉ hiển thị đầy đủ một lần.
5. Trong extension chọn **Claude (Anthropic)**, dán key, chọn model Claude rồi bấm **Lưu và Test API**.

Nếu tài khoản chưa có credit hoặc chưa bật quyền API, nút test có thể trả lỗi dù key đúng. Kiểm tra billing/usage trong Anthropic Console.

### Groq

1. Mở [Groq Console - API Keys](https://console.groq.com/keys) và đăng nhập.
2. Chọn project phù hợp nếu Console yêu cầu.
3. Bấm **Create API Key**, đặt tên và sao chép key.
4. Trong extension chọn **Groq (llama)**, dán key, chọn model Groq rồi bấm **Lưu và Test API**.

Groq có giới hạn tốc độ theo project/model. Nếu nhận lỗi 429, giảm số lượng, tăng delay hoặc chờ quota hồi phục.

### OpenRouter

1. Mở [OpenRouter - API Keys](https://openrouter.ai/settings/keys) và đăng nhập.
2. Bấm **Create Key**, đặt tên và nếu cần đặt giới hạn chi tiêu/ngày/tháng hoặc ngày hết hạn.
3. Sao chép key ngay sau khi tạo; key đầy đủ có thể chỉ được hiển thị một lần.
4. Trong extension chọn **OpenRouter**, dán key, chọn model trong danh sách rồi bấm **Lưu và Test API**.

OpenRouter truy cập nhiều model qua một key. Hãy kiểm tra model có sẵn, credit và limit của key; không nhầm **Management API Key** với key dùng để gọi chat completion.

### DeepSeek

1. Mở [DeepSeek Platform](https://platform.deepseek.com/) và đăng nhập.
2. Vào khu vực API hoặc API Keys, bấm **Create new API key**.
3. Đặt tên, tạo và sao chép key. Nếu tài khoản yêu cầu nạp credit/bật billing, hoàn tất bước đó trước khi test.
4. Trong extension chọn **DeepSeek**, dán key, chọn model DeepSeek rồi bấm **Lưu và Test API**.

DeepSeek dùng API tương thích OpenAI; nếu model mặc định không còn khả dụng, chọn model đang hiện trong danh sách extension hoặc cập nhật model theo tài liệu DeepSeek.

### Mistral

1. Mở [Mistral Studio - API Keys](https://console.mistral.ai/api-keys) và đăng nhập.
2. Nếu cần, kích hoạt Studio/workspace theo hướng dẫn trên trang.
3. Vào **API Keys**, bấm **Create new key**, đặt tên và đặt ngày hết hạn nếu muốn.
4. Sao chép key ngay sau khi tạo; key đầy đủ thường chỉ xuất hiện một lần.
5. Trong extension chọn **Mistral**, dán key, chọn model Mistral rồi bấm **Lưu và Test API**.

Mistral có thể cho dùng Free mode với hạn mức giới hạn; tài khoản/team cần billing để dùng hạn mức cao hơn hoặc một số model.

### Custom (OpenAI-compatible)

Chọn mục này khi bạn có một dịch vụ tương thích định dạng OpenAI Chat Completions.

1. Lấy API key trong dashboard của dịch vụ đó.
2. Chọn **Custom (OpenAI-compatible)**.
3. Dán key vào **API Key**.
4. Nhập đúng **Custom URL**, thường có dạng `https://ten-dich-vu/v1/chat/completions`.
5. Nhập đúng tên model của dịch vụ vào ô model tùy chỉnh.
6. Bấm **Lưu và Test API**.

Nếu test lỗi, kiểm tra lại URL, tên model, định dạng endpoint và dịch vụ có cho phép gọi trực tiếp từ extension hay không.

### Bảo mật API Key

- Không gửi API Key qua chat, email, ảnh chụp màn hình hoặc đưa vào file ZIP gửi khách.
- Không dán key vào prompt, bài đăng Facebook, README hoặc mã nguồn.
- Dùng key riêng cho từng mục đích, đặt giới hạn chi tiêu nếu nền tảng hỗ trợ và đặt ngày hết hạn.
- Nếu nghi ngờ lộ key, hãy thu hồi/xóa key cũ và tạo key mới ngay trên trang chính thức.
- Sau khi dán key vào extension, bấm test một lần rồi không cần copy key vào bất kỳ file nào trong thư mục extension.

### Các biến thường dùng trong prompt

- `{groupName}`: tên nhóm hiện tại.
- `{postText}`: nội dung bài đang đọc.
- `{sourceText}`: thông tin sản phẩm hoặc nội dung nguồn ở tab Đăng bán.
- `{productInfo}`: thông tin sản phẩm ở tab Đăng bán.
- `{questions}`: danh sách câu hỏi tham gia nhóm.

Giữ nguyên biến nếu prompt của tính năng yêu cầu biến đó. Nên ghi rõ ngôn ngữ, giọng điệu, số câu, độ dài và những điều AI không được làm.

## 6. Hướng dẫn từng tính năng

### A. 🤝 Kết bạn

Tab này có ba chế độ:

#### 1) Theo gợi ý

1. Chọn **Theo gợi ý**.
2. Bấm **Mở trang Gợi ý kết bạn**.
3. Cài số lượng tối đa và khoảng delay Min–Max.
4. Có thể bấm **Quét thử, không gửi** để kiểm tra các hồ sơ được nhận diện.
5. Bấm **Bắt đầu** để gửi lần lượt.

#### 2) Thành viên có điểm chung

1. Chọn **Thành viên có điểm chung**.
2. Bấm **Tải danh sách nhóm**.
3. Chọn nhóm cần quét, có thể lọc theo tên nhóm.
4. Cài số bạn chung tối thiểu, số lượng tối đa và delay.
5. Bấm **Quét thử** để xem dữ liệu trước; sau đó bấm **Bắt đầu**.

#### 3) Xác nhận lời mời

1. Chọn **Xác nhận lời mời**.
2. Bấm **Mở lời mời kết bạn**.
3. Có thể đặt bộ lọc số bạn chung, số nhóm chung, từ khóa quê quán, từ khóa trường học, yêu cầu ảnh đại diện và bỏ qua hồ sơ thiếu dữ liệu.
4. Bấm **Quét thử, không gửi** để xem hồ sơ đạt hoặc bị loại vì lý do nào.
5. Bấm **Bắt đầu** để chỉ xác nhận các hồ sơ đạt bộ lọc.

Luồng xác nhận lời mời chỉ dùng thông tin công khai Facebook đang hiển thị và chỉ tính thành công khi Facebook xác nhận đã trở thành bạn bè.

### B. 📄 Cào bài và tạo hồ sơ văn phong

1. Mở tab **Cào bài**.
2. Nhập URL Profile, Fanpage hoặc nhóm; nếu đã mở đúng trang Facebook thì có thể để trống.
3. Nhập số bài cần cào và chọn **Bỏ qua bài quảng cáo/Được tài trợ** nếu cần.
4. Bấm **Bắt đầu cào**. Extension sẽ tự cuộn và thu thập bài, text, link và ảnh theo dữ liệu Facebook hiển thị.
5. Khi xong, bấm tải dữ liệu dạng **Markdown**, **JSON** hoặc **TXT**.
6. Muốn tạo hồ sơ dùng cho AI, nhập tên hồ sơ rồi bấm **Tạo hồ sơ AI**. Sau đó chọn hồ sơ trong các tab AI.

Nên bấm **Reset** trước khi cào một nguồn mới nếu muốn tách dữ liệu giữa các lần cào. Chỉ cào nội dung công khai mà tài khoản có quyền xem.

### C. 👥 Nhóm — Đăng bài AI lên nhóm

1. Mở tab **Nhóm**, phần **Đăng bài AI lên nhóm**.
2. Bấm **Tải danh sách nhóm**, tích các nhóm muốn đăng và có thể lọc theo tên.
3. Đặt số nhóm muốn đăng và delay giữa các nhóm.
4. Cấu hình provider/model hoặc dùng cấu hình AI chung đã lưu.
5. Nhập prompt có `{groupName}`. Có thể chọn hồ sơ văn phong.
6. Chọn có đăng nền màu hay không. Nếu bật, chọn **Cố định một màu** hoặc **Random trong các màu đã tích**, rồi chọn các màu được phép.
7. Đặt giới hạn ký tự nếu dùng nền màu.
8. Dùng **Tạo thử nội dung + màu** để xem trước; nút này không đăng lên Facebook.
9. Bấm **Tạo và đăng bài lên nhóm đã chọn**.

Extension chỉ chuyển sang nhóm tiếp theo khi đã xác minh Facebook nhận bài. Nếu nhóm không hỗ trợ nền hoặc không xác minh được composer, nhóm đó có thể bị bỏ qua để tránh đăng sai.

### D. 👥 Nhóm — Tương tác nhóm đã tham gia

1. Trong tab **Nhóm**, phần **Tương tác nhóm đã tham gia**, bấm **Tải danh sách nhóm**.
2. Tích các nhóm cần chạy hoặc nhập từ khóa rồi bấm **Chọn theo từ khóa**.
3. Chọn cảm xúc: Like, Tym, Haha, Wow, Buồn, Phẫn nộ hoặc Random.
4. Đặt số nhóm, số bài mỗi nhóm và delay Min–Max.
5. Có thể bật **Bình luận AI cho mỗi bài đã thả cảm xúc** nếu đã cấu hình AI.
6. Bấm **Bắt đầu tương tác nhóm**.

Luồng này thả cảm xúc theo số bài đã đặt, và nếu bật AI thì bình luận được xử lý riêng từng bài. Trạng thái sẽ ghi lý do bài bị bỏ qua nếu không đủ điều kiện.

### E. 👥 Nhóm — Tìm và tham gia nhóm mới

#### Theo từ khóa

1. Chọn **Theo từ khóa**.
2. Nhập từ khóa, ví dụ `chứng khoán`, `marketing` hoặc `bất động sản`.
3. Đặt số thành viên tối thiểu, số bài/ngày tối thiểu, số nhóm muốn tham gia và delay.
4. Nhập câu trả lời mẫu, mỗi dòng một câu.
5. Có thể bật **Dùng AI đọc và trả lời câu hỏi tham gia**. AI sẽ dùng cấu hình đã cài; nếu lỗi sẽ dùng câu trả lời mẫu.
6. Bấm **Tìm & Tham gia (từ khóa)**.

#### Theo Khám phá

1. Chọn **Theo Khám phá**.
2. Đặt số nhóm, delay Min–Max và câu trả lời mẫu.
3. Bấm **Tham gia theo Khám phá**.

> Khi Facebook yêu cầu trả lời câu hỏi hoặc chấp nhận nội quy, extension chờ đúng hộp thoại và chỉ gửi khi nút xác nhận đã được bật. Khuyến nghị dùng delay 5–15 giây và số lượng vừa phải.

### F. 🔁 Share bài vào nhóm

1. Mở tab **Share bài**.
2. Dán link của một bài Facebook cụ thể mà tài khoản có quyền xem.
3. Bấm **Tải danh sách nhóm**, tích nhóm nhận bài.
4. Đặt số nhóm muốn share và delay giữa các lần share.
5. Nhập prompt có cả `{postText}` và `{groupName}` nếu muốn AI tạo lời dẫn khác nhau cho từng nhóm.
6. Có thể chọn hồ sơ văn phong.
7. Bấm **Bắt đầu Share**.

Extension mở bài nguồn để đọc đúng bài chính, sau đó vào từng nhóm, dựng link preview và chỉ bấm Đăng khi preview đúng bài nguồn. Nếu không xác minh được preview hoặc thao tác gửi, phiên sẽ dừng ở bước đó để tránh share sai hoặc gửi trùng.

### G. 🛍️ Đăng bán

1. Mở tab **Đăng bán**.
2. Nhập thông tin sản phẩm/nội dung nguồn và ghi chú nếu cần.
3. Chọn một hoặc nhiều ảnh/video; mỗi file tối đa 35 MB. Không chọn media vẫn có thể đăng bài chữ.
4. Bấm **Tải danh sách nhóm**, tích các nhóm muốn đăng, rồi đặt số nhóm và delay.
5. Chỉnh prompt biến thể theo nhóm nếu cần. Có thể dùng `{groupName}`, `{sourceText}` và `{productInfo}`.
6. Chọn hồ sơ văn phong và cấu hình AI dùng chung.
7. Xem trước hoặc bấm **Test API** trước khi chạy thật.
8. Bấm nút bắt đầu đăng bán.

AI tạo biến thể riêng theo từng nhóm. Bộ đếm chỉ tăng sau khi Facebook xác nhận bài đã gửi và hiển thị/chờ duyệt. Nếu một nhóm lỗi, trạng thái sẽ ghi nhận để không làm kẹt toàn bộ phiên.

### H. 📚 Học nhóm — Học bài và viết lại

Đây là quy trình hai bước, không đăng ngay ở bước học.

#### B1 — Học bài

1. Chọn nhóm nguồn từ danh sách nhóm đã tải hoặc dán link nhóm, mỗi dòng một link.
2. Có thể ghi theo dạng `URL | Tên nhóm` để cung cấp tên nhóm chính xác cho AI.
3. Chọn số bài mới nhất mỗi nhóm.
4. Bấm **Học bài** để lưu các bài đọc được.

#### Viết lại bằng AI

1. Chọn prompt viết lại và hồ sơ văn phong nếu cần.
2. Bấm **Viết lại bằng AI**.
3. Kiểm tra bản xem trước. Bước này chỉ tạo nội dung, chưa đăng Facebook.

#### B2 — Đăng bài viết lại

1. Chọn nhóm đích hoặc dán link nhóm đích theo từng dòng.
2. Nhập prompt theo group name nếu muốn điều chỉnh nội dung riêng theo từng nhóm; giữ `{groupName}`.
3. Có thể bật **Bắt buộc đăng ẩn danh**.
4. Có thể bật **Đăng kèm nền màu**, chọn màu cố định hoặc Random.
5. Bấm **Đăng bài viết lại**.

> Khi bật ẩn danh, nếu nhóm không xác nhận được chế độ ẩn danh thì extension sẽ bỏ qua nhóm, không tự chuyển sang đăng công khai. Bài đang chờ quản trị viên phê duyệt vẫn được coi là đã nhận nếu Facebook hiển thị rõ trạng thái đó.

### I. 📰 Bản tin & AI — Tương tác bản tin

1. Mở tab **Bản tin & AI**, phần **Tương tác bản tin**.
2. Chọn loại cảm xúc hoặc Random.
3. Đặt số lượng và delay Min–Max.
4. Dùng **Quét thử** để chỉ highlight bài được nhận diện, không like.
5. Bấm **Bắt đầu tương tác bản tin** để chạy thật.

Luồng này chỉ xử lý Bản tin chính, bỏ qua bài quảng cáo/sponsored, Reels/Watch và khu vực không phải bài mục tiêu.

### J. 📰 Bản tin & AI — Comment bằng AI

1. Cấu hình Provider, API Key, model và Custom URL nếu cần.
2. Nhập prompt có `{postText}`.
3. Chọn hồ sơ văn phong nếu muốn.
4. Đặt số bài muốn comment, delay, chế độ tiết kiệm và số bài mỗi request.
5. Bấm **Lưu và Test API comment**.
6. Có thể chọn:
   - **Cân bằng**: gom nhiều bài trong một request.
   - **Tiết kiệm tối đa**: ưu tiên câu mẫu cục bộ.
   - **Cá nhân hóa**: gọi AI cho từng bài.
7. Bấm **Bắt đầu AI comment**.

Comment chỉ được tính thành công khi Facebook hiển thị comment ngoài ô nhập. Nếu API lỗi, extension có thể dùng câu dự phòng an toàn; nếu Facebook không xác minh được việc gửi, bài sẽ không bị tính thành công và không tự gửi lại liên tục.

## 7. Dừng, tiếp tục và xử lý lỗi

- **Dừng**: dùng khi muốn ngắt phiên đang chạy. Chờ dòng trạng thái đổi sang đã dừng trước khi đổi cấu hình.
- **Reset**: dùng để xóa tiến trình của tính năng tương ứng và chạy lại từ đầu. Không bấm Reset của tính năng khác.
- Sau khi Facebook reload hoặc chuyển route, extension có thể tự quay lại nhiệm vụ đang chạy trên đúng tab sở hữu phiên.
- Nếu Facebook báo checkpoint, giới hạn, spam hoặc yêu cầu xác minh, hãy dừng phiên và xử lý trực tiếp trên Facebook. Không cố chạy tiếp để vượt hạn chế.
- Nếu extension không phản hồi: vào `chrome://extensions`, bấm **Reload**, tải lại tab Facebook rồi kiểm tra lại trạng thái. Chỉ Reset đúng tính năng nếu muốn bỏ tiến trình cũ.
- Nếu nút không tìm thấy, Facebook có thể đã thay đổi giao diện hoặc tài khoản chưa có quyền xem. Kiểm tra route, quyền truy cập nhóm/bài và thử một mục nhỏ hơn.

## 8. Gỡ cài đặt

1. Vào `chrome://extensions`.
2. Tìm **FB Auto Tool - Add Scrape Group Feed AI**.
3. Bấm **Remove / Xóa**.
4. Nếu không cần nữa, có thể xóa thư mục đã giải nén sau khi gỡ extension.

> Việc gỡ extension có thể làm mất cấu hình, lịch sử chống trùng, tiến trình và hồ sơ văn phong được lưu trong Chrome. Hãy tải dữ liệu cào ra file trước nếu cần giữ lại.
