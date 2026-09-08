# FB Auto Tool

Chrome Extension hỗ trợ kết bạn, cào bài, nhóm, tương tác bản tin và nội dung AI.


> **Tài liệu cho AI tiếp quản:** đọc [`PROJECT_LOGIC.md`](PROJECT_LOGIC.md) trước khi sửa. Tài liệu ghi state, selector theo ngữ cảnh, điều kiện xác nhận và logic riêng của từng tính năng.

## Kết bạn

Tab **Kết bạn** hiện có hai nguồn đã triển khai:

1. **Theo gợi ý**: mở trang Gợi ý kết bạn và chỉ quét thẻ hồ sơ trong khu vực gợi ý.
2. **Thành viên có điểm chung**: tải danh sách nhóm đã tham gia, kiên nhẫn chờ Facebook tải mục này, tự bấm “Xem tất cả”, tiếp tục chờ nút “Thêm bạn bè” rồi xử lý lần lượt từ trên xuống. Nếu Facebook tải quá lâu, tiện ích tải lại một lần và tiếp tục chờ trước khi chuyển nhóm.

Theo bộ lọc tìm kiếm chưa có mode riêng trong phiên bản hiện tại; nếu bổ sung phải tạo logic và state riêng, không dùng lẫn với hai nguồn trên.

Bộ máy kết bạn dùng chung có delay Min–Max, số bạn chung tối thiểu, quét thử không gửi, xác nhận trạng thái sau khi bấm, chống gửi trùng, lưu tiến trình qua reload và dừng khi Facebook cảnh báo hoặc giới hạn.

## Đăng bài AI lên nhóm

- Chọn các nhóm đã tham gia và dùng cấu hình AI/API dùng chung.
- Có bảng 12 màu nền trơn, cho chọn **Cố định một màu** hoặc **Random trong các màu đã tích**.
- Giới hạn ký tự tùy chỉnh (mặc định 100), tự làm sạch và rút gọn nội dung để Facebook giữ nền.
- Chế độ Random tránh lặp màu giữa hai nhóm liên tiếp; có thể đăng chữ thường hoặc bỏ qua nếu nhóm không hỗ trợ nền.
- Sau khi chọn nền, tiện ích chờ Facebook dựng lại ô soạn bài tối đa 10 giây. Nếu Facebook tải lỗi, tiện ích đóng bản nháp và thử lại ngay tại cùng nhóm, không tải lại trang; nội dung AI đã tạo vẫn được dùng lại để không tốn thêm lượt API.
- Mỗi bước mở bảng màu, chọn nền, điền nội dung và bấm Đăng đều được kiểm tra trên giao diện; nếu Facebook bỏ qua cú bấm đầu tiên, tiện ích thử lại ngay trong cùng bản nháp.
- Tự đóng hộp thoại “Chào mừng bạn đến với …” của nhóm nếu Facebook hiển thị khi vừa vào nhóm, để hộp thoại không che nút tạo bài.
- Có thể chỉnh thời gian nghỉ sau khi chọn nền, tốc độ gõ từng ký tự và thời gian nghỉ trước khi bấm Đăng.
- Tiện ích chỉ chuyển sang nhóm tiếp theo sau khi Facebook xác nhận đăng thành công. Nếu nền hoặc bài đăng chưa được xác nhận, tiện ích thử lại tối đa 3 lần tại đúng nhóm; nhóm không có nền/không mở được composer sau các lần thử sẽ được ghi nhận là **bỏ qua** và không làm kẹt cả phiên.
- Nút **Tạo thử nội dung + màu** chỉ hiển thị bản xem trước trong extension, không đăng lên Facebook.

## Cài đặt hoặc cập nhật

1. Mở `chrome://extensions`.
2. Bật **Chế độ dành cho nhà phát triển**.
3. Chọn **Tải tiện ích đã giải nén** và trỏ tới thư mục `fb-auto-add`; nếu đã cài thì bấm **Tải lại**.
4. Tải lại trang Facebook trước khi sử dụng phiên bản mới.

## Tệp chính

- `content.js`: ba chế độ kết bạn và bộ máy xác nhận/chống trùng.
- `scrape.js`: cào bài và xuất dữ liệu.
- `group.js`: tham gia nhóm và trả lời câu hỏi.
- Luồng **Khám phá** dùng chung cấu hình AI/câu trả lời của tham gia theo từ khóa; khi gặp màn hình “Xem xét quyền tham gia”, tiện ích chọn quy tắc, đi qua các bước Tiếp/Tiếp tục, dùng AI cho câu hỏi mở và câu mẫu cho nội quy.
- `feed.js`: tương tác bản tin, nhóm, đăng bài và comment AI.
- `background.js`: kết nối AI và thao tác chuột/bàn phím tin cậy.
- `popup.html`, `popup.js`: giao diện và cấu hình extension.
### v1.6.3

- Xác minh bình luận tối đa 30 giây; nếu Facebook không trả bằng chứng, khóa bài đã gửi để tránh trùng và tiếp tục bài kế tiếp thay vì treo cả phiên.

### v1.8.9

- Comment AI lưu dấu vân tay nội dung bài và định danh ổn định qua các lần Facebook tải lại DOM; nhận diện comment của chính tài khoản và bỏ qua bài đã xử lý để không gửi trùng.
- Nút Reset chỉ reset phiên và bộ đếm, vẫn giữ lịch sử chống trùng để không bình luận lại bài cũ.

### v1.8.10

- Các ô Prompt tự lưu ngay khi chỉnh sửa và được khôi phục khi mở lại extension; prompt đăng bài nhóm không tự quay về mẫu.

### v1.8.11

- Khi đang tham gia nhóm theo Khám phá mà người dùng chuyển sang Bảng tin hoặc URL Facebook khác, tiện ích tự quay lại `/groups/discover` và tiếp tục từ tiến độ đã lưu.

### v1.8.12

- Bổ sung bộ canh URL cho cả điều hướng SPA: rời `/groups/discover` sẽ tự lưu phiên, quay lại đúng trang Khám phá và tiếp tục không reset bộ đếm.

### v1.6.4

- Tách logic trả lời câu hỏi tham gia nhóm khỏi Comment AI: câu hỏi nội quy dùng câu mẫu, câu hỏi mở gọi AI khi bật AI.
- Chờ xác nhận nút Tham gia/Gửi bằng click tin cậy, không cộng nhóm khi Facebook chưa đổi trạng thái; Dừng không còn bị ghi đè thành “Xong”.
- Không lấy link nhóm toàn trang khi quét Khám phá, tránh bấm nhầm nhóm khác.

### v1.6.5

- Nhận diện đủ trạng thái Facebook đổi nút thành “Truy cập” hoặc “Truy cập vào nhóm” sau khi tham gia, tránh báo chưa xác nhận và bỏ sót bộ đếm.

### v1.6.6

- Tách click khỏi bước chờ xác nhận để phản hồi chậm không làm bỏ qua nhóm; chờ dialog câu hỏi lâu hơn, xác nhận lại card theo URL khi Facebook thay DOM, dọn cờ chạy cũ sau tải lại khẩn cấp và chỉ tăng bộ đếm sau trạng thái thành công.

### v1.6.7

- Luồng Khám phá truyền đúng tên nhóm vào AI khi phải trả lời câu hỏi tham gia, vẫn dùng câu mẫu cho câu hỏi nội quy/đơn giản.

### v1.6.2

- Ưu tiên focus trực tiếp ô bình luận đã nhận diện; chỉ dùng chuột hệ thống khi focus thất bại, tránh trúng khung Messenger nổi lúc Facebook vừa render lại.

### v1.6.1

- Sau khi mở đúng bài, Comment AI chỉ bấm nút Bình luận một lần và chờ ô nhập không giới hạn theo phiên chạy; không bấm lần hai làm đóng khung khi Facebook tải chậm.

### v1.6.0

- Comment AI chỉ nhận bài được phát hiện trực tiếp trên Bảng tin; trang chi tiết chỉ được dùng khi Facebook mở nó từ đúng nút Bình luận của bài đang xử lý.
- Bỏ qua quảng cáo/Được tài trợ trước khi gọi AI và trước khi thao tác bình luận.
- Lưu định danh bài đã xử lý trong lịch sử cục bộ để không comment trùng qua các lần chạy (trừ khi người dùng xóa dữ liệu extension).
- Khóa định danh ngay trước thao tác gửi; nếu Facebook mất phản hồi sau cú bấm, tiện ích ưu tiên bỏ qua bài đó ở lần sau thay vì có nguy cơ gửi trùng.

### v1.5.4

- Comment AI không còn coi nội dung vẫn nằm trong ô nhập là bình luận đã đăng.
- Nhận diện ô bình luận mới xuất hiện ngay sau lần bấm đúng nút Bình luận, kể cả khi Facebook mở lớp phủ bài viết.
- Nếu Facebook mở trang chi tiết của đúng bài từ Bảng tin, tiện ích chờ ô nhập, gửi và xác minh tại đó rồi mới quay lại Bảng tin.
- Không đóng bài và chuyển sang bài khác trước khi tìm thấy bình luận thực tế trong danh sách bình luận.

### v1.5.0

- Đăng bài nhóm có nền thử lại ngay trong cùng trang và cùng nhóm, không tự tải lại Facebook khi chọn nền hoặc nhập nội dung thất bại.
- Ưu tiên thao tác trực tiếp với bảng màu và gõ nội dung từng ký tự; chỉ dùng điều khiển chuột/bàn phím hệ thống làm phương án dự phòng.
- Không chuyển nhóm khi chưa xác nhận được nền, nội dung hoặc thao tác đăng.
### v1.7.2
- Bổ sung log chẩn đoán an toàn cho từng bước mở composer, chọn/xác nhận nền, điền nội dung và gửi bài (không ghi API key hoặc nội dung bài).

### v1.7.3
- Đối chiếu nhóm đăng bài theo ID trong URL (vẫn nhận slug cũ), tránh tải lại chính nhóm hiện tại; tiếp tục ngay nếu nhóm kế tiếp đã ở cùng URL.

### v1.7.4
- Dọn cờ dừng cũ sau reload khi phiên đăng nhóm vẫn active, tránh dừng ngay sau bước AI tạo nội dung.

### v1.8.0
- Luồng đăng nhóm dùng đúng danh sách đã tích chọn và đối chiếu theo URL/tiêu đề nhóm.
- Luôn đăng kèm nền màu; nhóm không có bảng nền được bỏ qua tự động.
- Thời gian chờ mở nhóm, composer, bảng màu, nhập nội dung và đăng được tự động điều chỉnh, không còn ô thời gian trong giao diện.

### v1.8.1
- Giữ tùy chọn đăng không kèm nền; chỉ bỏ qua nhóm thiếu bảng màu khi tùy chọn nền được bật.

### v1.8.2
- Composer/bảng nền không khả dụng hoặc Facebook chuyển khỏi trang nhóm sẽ được thử lại rồi bỏ qua nhóm đó, không dừng toàn bộ phiên.

### v1.8.3
- Bổ sung nhận diện các nhãn nút tạo bài Facebook mới như “Bạn viết gì đi…” và “Bạn đang nghĩ gì thế?”.

### v1.8.4
- Nếu nhóm có bảng nền nhưng không trùng màu đã tích, tự chọn nền khả dụng thay vì bỏ qua nhầm.
- Đóng bản nháp khi bỏ qua và hiển thị riêng số đã đăng/số bỏ qua.

### v1.8.5
- Tự đóng hộp thoại “Chào mừng bạn đến với …” khi Facebook hiển thị lúc vừa vào nhóm, tránh che nút tạo bài.

### v1.8.6
- Sau khi đăng thành công, giữ nguyên nhóm 6–8 giây để Facebook hiển thị bài trước khi chuyển nhóm tiếp theo.

### v1.8.7
- Xử lý màn hình “Xem xét quyền tham gia”: chọn quy tắc, đi qua bước Tiếp/Tiếp tục, dùng AI cho câu hỏi mở và câu trả lời mẫu cho nội quy.

### v1.8.8
- Mở rộng nhận diện trạng thái “Xem xét quyền tham gia” trong luồng tham gia theo từ khóa và Khám phá; tự chọn quy tắc rồi trả lời các câu hỏi mở bằng AI.

### v1.7.1
- Xác nhận nền màu bằng trạng thái đã chọn (`aria-current`/`aria-pressed`) hoặc style thực tế của ô nhập, tránh nhận sai khi Facebook chỉ hiển thị nhãn “phông nền N”.

### v1.7.0
- Cập nhật nhận diện bảng màu Facebook mới không có tiêu đề “Chọn phông nền”: tìm cụm nút màu theo vùng chứa thực tế.
- Hỗ trợ nhóm đã mở sẵn bảng nền, bổ sung nhận diện màu “Tím thẫm” cho chế độ random.

### v1.6.9
- Nếu Facebook gỡ thẻ nhóm khỏi DOM ngay sau khi gửi yêu cầu, chờ một nhịp rồi xác nhận theo URL nhóm thay vì để bộ đếm kẹt ở nhóm đó.
- Sửa nhận diện trạng thái nút tham gia: ưu tiên chữ hiển thị thay vì `aria-label` cũ của Facebook, tránh bộ đếm bị kẹt 0/10 dù nhóm đã chuyển sang “Truy cập vào nhóm”.
- Rút ngắn thời gian chờ hộp câu hỏi khi nhóm không yêu cầu trả lời (tối đa khoảng 11 giây, nhóm có câu hỏi vẫn được xử lý AI/câu trả lời mẫu).
