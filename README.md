# FB Auto Tool

v1.9.58: bộ chọn phân bài B2 luôn hiển thị. Khi đang dùng **Dùng lần lượt bài còn lại**, nó được làm mờ và khóa kèm hướng dẫn chuyển sang **Dùng các bài đã tích** — không còn biến mất khỏi giao diện.

v1.9.57: B2 có bộ chọn rõ ràng cho bài đã tích: **Nhiều bài → 1 nhóm**, **1 bài → nhiều nhóm**, hoặc **Nhiều bài → nhiều nhóm, tự chia đều**; radio mặc định **Tự nhận diện** giữ hành vi cũ. Chọn từng trường hợp sẽ kiểm tra chính xác số bài/số nhóm trước khi gọi AI hoặc đăng.

v1.9.56: B2 **Học nhóm** tự lập kế hoạch khi dùng bài đã tích ở B1: một bài được biến thể cho mọi nhóm đích; nhiều bài được chia đều, không trùng nguồn. Kế hoạch hiển thị trước khi đăng (ví dụ 10 bài / 5 nhóm = 2 bài mỗi nhóm). Ô số bài mỗi nhóm chỉ áp dụng cho chế độ **Dùng lần lượt bài còn lại**.

v1.9.55: giao diện B1 **Học nhóm** chỉ hiện ô **Số bài tối đa mỗi nhóm** khi tắt **Học đến hết**, giúp ô nhập luôn đủ rộng và tránh hiểu nhầm rằng cần điền khi đang cào không giới hạn.

v1.9.54: B1 **Học nhóm** mặc định học đến hết bài Facebook có thể tải, không còn giới hạn cứng 30 bài/nhóm, 8 vòng cuộn hay 300 bài trong kho. Có thể tắt **Học đến hết** để đặt giới hạn riêng; chế độ không giới hạn dừng khi Facebook không còn bài mới, người dùng bấm Dừng hoặc kho lưu trữ đầy.

v1.9.53: mode **Xác nhận lời mời** tự áp dụng bộ lọc trong cấu hình chung ngay khi bấm **Bắt đầu**; người dùng không cần bấm **Quét thử** trước. Quét thử chỉ còn là xem trước tùy chọn. Trạng thái chạy cũng báo rõ khi đang tự lọc theo cấu hình đã lưu.

v1.9.52 bổ sung cho tab **Đăng bán** hai chế độ media rõ ràng: đăng toàn bộ media đã chọn hoặc random media theo từng nhóm. Kế hoạch random được chụp để reload vẫn giữ đúng selection và tránh lặp y hệt nhóm liền trước. Tab **Nuôi Page** vẫn gồm Page tham gia nhóm, đăng bài nhóm bằng AI theo chủ đề/bài gần đây, theo dõi Page theo từ khóa/bộ lọc và Comment AI bằng Page cho Bản tin hoặc Page đã theo dõi. Các luồng Page có state/selector/proof riêng; Comment AI cá nhân trong `feed.js` không thay đổi. Hồ sơ/cache dài hạn của Nuôi Page lưu qua IndexedDB extension, còn trạng thái chạy vẫn dùng `chrome.storage.local`.

Chrome Extension hỗ trợ kết bạn, cào bài, đăng/share bài vào nhóm, tương tác bản tin và nội dung AI.


> **Tài liệu cho AI tiếp quản:** đọc [`PROJECT_LOGIC.md`](PROJECT_LOGIC.md) trước khi sửa. Tài liệu ghi state, selector theo ngữ cảnh, điều kiện xác nhận và logic riêng của từng tính năng.

## Kết bạn

Tab **Kết bạn** hiện có ba mode đã triển khai:

1. **Theo gợi ý**: mở trang Gợi ý kết bạn và chỉ quét thẻ hồ sơ trong khu vực gợi ý.
2. **Thành viên có điểm chung**: tải danh sách nhóm đã tham gia, kiên nhẫn chờ Facebook tải mục này, tự bấm “Xem tất cả”, tiếp tục chờ nút “Thêm bạn bè” rồi xử lý lần lượt từ trên xuống. Nếu Facebook tải quá lâu, tiện ích tải lại một lần và tiếp tục chờ trước khi chuyển nhóm.
3. **Xác nhận lời mời**: mở trang lời mời đến, cho phép điền số bạn chung tối thiểu, số nhóm chung tối thiểu, từ khóa quê quán/trường học, yêu cầu ảnh đại diện và bỏ qua hồ sơ thiếu dữ liệu. Khi bấm **Bắt đầu**, tiện ích tự áp dụng bộ lọc cho từng hồ sơ; **Quét thử** chỉ dùng để xem trước lý do đạt/không đạt, không phải bước bắt buộc. Chỉ xác nhận sau khi Facebook trả về trạng thái đã là bạn bè.

Theo bộ lọc tìm kiếm chưa có mode riêng trong phiên bản hiện tại; nếu bổ sung phải tạo logic và state riêng, không dùng lẫn với hai nguồn trên.

Bộ máy kết bạn dùng chung có delay Min–Max, quét thử không gửi, chống gửi trùng, lưu tiến trình qua reload và dừng khi Facebook cảnh báo hoặc giới hạn. Luồng xác nhận lời mời dùng state/history/counter/proof riêng; chỉ dùng dữ liệu công khai Facebook đang hiển thị và không suy đoán thông tin cá nhân.

## Tương tác nhóm đã tham gia

- Tải danh sách nhóm, tích chọn, lọc nhanh theo từ khóa tên nhóm.
- Giới hạn **số nhóm muốn tương tác** (chạy N nhóm đầu theo thứ tự đã tích) và **số bài mỗi nhóm**, delay Min–Max, cảm xúc cố định hoặc ngẫu nhiên.
- Bật **Bình luận AI** để mỗi bài đã thả cảm xúc được comment một lần bằng cấu hình AI dùng chung (fallback câu mẫu khi lỗi); lý do bỏ qua từng bài hiện rõ trong trạng thái.

## Nuôi Page

Tab **🌱 Nuôi Page** là nơi chứa các tính năng liên quan đến Page mà nick cá nhân đang quản trị.

- Tải danh sách Page từ trang Pages của Facebook và chọn đúng một Page trước khi chạy.
- Cho Page tham gia nhóm theo **từ khóa** hoặc theo **nhóm đề xuất**.
- Trước mỗi lần tham gia, tiện ích phải xác minh Facebook đang hoạt động với tư cách Page, không phải nick cá nhân.
- Câu hỏi nội quy dùng câu trả lời mẫu; câu hỏi mở có thể dùng AI với Provider/Model/Custom URL dùng chung. Nếu AI không trả lời đủ hoặc Facebook chưa nhận đủ ô, nhóm được bỏ qua.
- State, counter, selector, run ID và proof của Page tách khỏi luồng tham gia nhóm của nick cá nhân.
- **Đăng bài nhóm bằng AI:** nhập danh sách nhóm hoặc dùng nhóm Page đã tham gia; AI đọc tên nhóm và bài gần đây để tạo bài mở thảo luận, sau đó Page đăng một lần và chỉ tính khi có proof Facebook.
- **Theo dõi Page:** tìm Page theo từ khóa, follower tối thiểu và từ khóa loại trừ; Page đã theo dõi được lưu riêng để làm nguồn cho Comment AI.
- **Comment AI bằng Page:** chọn Bản tin hoặc Page đã theo dõi; AI đọc bài và tạo comment theo prompt Page, không chạy thêm bước phân loại chủ đề. Luồng Page không dùng state/history/selector/proof của Comment AI cá nhân.

## Ngôn ngữ và giao diện

- Chọn 🇻🇳 Tiếng Việt / 🇬🇧 English ở góc phải header; toàn bộ giao diện, trạng thái và nội dung AI sinh ra theo đúng ngôn ngữ, áp dụng ngay không cần tải lại.
- Nút Start nào đang chạy đều chuyển trạng thái ⏳; mở extension tự về đúng panel của phiên đang chạy.
- Các bảng chọn nền màu dùng chung bố cục ngang đều, 6 ô mỗi hàng và kích thước tối thiểu cố định; nếu card hẹp, chỉ vùng bảng màu có thanh cuộn ngang để không làm vỡ giao diện. Tính năng đăng bài mới có nền phải dùng lại quy tắc này.

## Đăng bài AI lên nhóm

- Chọn các nhóm đã tham gia và dùng cấu hình AI/API dùng chung.
- Giới hạn **số nhóm muốn đăng** (N nhóm đầu theo thứ tự đã tích) và **delay giữa mỗi nhóm**; nút **Reset** xóa tiến trình nhưng giữ danh sách nhóm và cấu hình.
- Có bảng 12 màu nền trơn, cho chọn **Cố định một màu** hoặc **Random trong các màu đã tích**.
- Giới hạn ký tự tùy chỉnh (mặc định 100), tự làm sạch và rút gọn nội dung để Facebook giữ nền.
- Prompt Group Post luôn phải có {groupName}. Trong phần hướng dẫn ngay dưới ô Prompt có mẫu cho 3 mục tiêu: thảo luận (nêu góc nhìn + câu hỏi mở), câu tương tác (một câu hỏi ngắn dễ trả lời) và hỏi–đáp (nêu vấn đề + bối cảnh + xin lời khuyên). Có thể dùng mục tiêu khác, miễn là nêu rõ đối tượng, giọng điệu, số câu/độ dài và các điều cấm.
- Khi một phiên đăng nhóm đang chạy, prompt được chụp cố định cho phiên đó và ô prompt chuyển sang chỉ đọc. Prompt sửa sau khi bấm Start sẽ dùng từ phiên kế tiếp; hãy bấm Dừng rồi sửa nếu muốn đổi ngay.
- Chế độ Random tránh lặp màu giữa hai nhóm liên tiếp; có thể đăng chữ thường hoặc bỏ qua nếu nhóm không hỗ trợ nền.
- Sau khi chọn nền, tiện ích chờ Facebook dựng lại ô soạn bài tối đa 10 giây. Nếu Facebook tải lỗi, tiện ích đóng bản nháp và thử lại ngay tại cùng nhóm, không tải lại trang; nội dung AI đã tạo vẫn được dùng lại để không tốn thêm lượt API.
- Mỗi bước mở bảng màu, chọn nền, điền nội dung và bấm Đăng đều được kiểm tra trên giao diện; nếu Facebook bỏ qua cú bấm đầu tiên, tiện ích thử lại ngay trong cùng bản nháp.
- Tự đóng hộp thoại “Chào mừng bạn đến với …” của nhóm nếu Facebook hiển thị khi vừa vào nhóm, để hộp thoại không che nút tạo bài.
- Có thể chỉnh thời gian nghỉ sau khi chọn nền, tốc độ gõ từng ký tự và thời gian nghỉ trước khi bấm Đăng.
- Tiện ích chỉ chuyển sang nhóm tiếp theo sau khi Facebook xác nhận đăng thành công. Nếu nền hoặc bài đăng chưa được xác nhận, tiện ích thử lại tối đa 3 lần tại đúng nhóm; nhóm không có nền/không mở được composer sau các lần thử sẽ được ghi nhận là **bỏ qua** và không làm kẹt cả phiên.
- Nút **Tạo thử nội dung + màu** chỉ hiển thị bản xem trước trong extension, không đăng lên Facebook.

- v1.9.13: mọi luồng đăng nhóm chờ giao diện nhóm ổn định tối đa 45 giây, chờ composer/editor sau render tối đa 45 giây, chờ bài vừa đăng xuất hiện tối đa 30 giây và giữ nhóm thêm 8–12 giây trước khi chuyển. Nếu Facebook đã nhận cú bấm nhưng bài chưa được xác minh là đã hiển thị, phiên dừng tại nhóm để tránh đăng trùng.

## Học bài nhóm và viết lại

- Tab **📚 Học nhóm** mới: dùng lại danh sách nhóm đã tải ở các tính năng khác, không cần tải lại.
- **B1:** có thể tích nhóm nguồn hoặc dán **link nhóm nguồn, mỗi dòng một link** → bấm **Học bài**. Mặc định bật **Học đến hết bài có thể tải (không giới hạn)**; nếu tắt, người dùng đặt số bài tối đa mỗi nhóm. Nếu ô link có dữ liệu, chỉ các URL trong ô được dùng; nếu ô link trống, chỉ các nhóm đã tích được dùng. Có thể ghi `URL | Tên nhóm` để AI nhận đúng tên hiển thị.
- Bấm **Viết lại bằng AI**: AI đọc bài đã lưu, rút dàn ý rồi viết thành bài của bạn theo prompt `{groupName}`, chỉ xem trước, không đăng ngay.
- **B2:** có thể tích nhóm đích hoặc dán **link nhóm đích, mỗi dòng một link** → bấm **Đăng bài viết lại**. Nếu ô link có dữ liệu, chỉ các URL trong ô được dùng; nếu ô link trống, chỉ các nhóm đã tích được dùng. Link-only không có tên sẽ được mở trước để lấy tên nhóm Facebook rồi mới gọi AI.
- B2 có thêm **Prompt AI theo group name**, dùng `{groupName}`. Prompt này được ghép với prompt viết lại và chạy riêng cho từng nhóm đích.
- B2 có tùy chọn **Bắt buộc đăng ẩn danh**. Khi bật, tiện ích chỉ nhập/bấm Đăng sau khi Facebook xác nhận switch **Đăng ẩn danh** trong composer và tự xác nhận hộp thoại “Bài viết ẩn danh” nếu Facebook hiện; nhóm không hỗ trợ hoặc không xác nhận được sẽ được bỏ qua, không tự chuyển sang đăng công khai. Trạng thái bài đang chờ quản trị viên phê duyệt cũng được xác nhận và giữ nhóm trước khi đi tiếp.
- B2 có tùy chọn **Đăng kèm nền màu**: tắt để đăng chữ thường, chọn **Cố định một màu** hoặc **Random** trong các màu đã tích. Nền cố định phải đúng màu đã chọn; Random chỉ dùng nền trơn Facebook thực sự cung cấp, tránh lặp màu liên tiếp. Nội dung được rút gọn theo giới hạn ký tự nền; nếu nền không được Facebook xác nhận, nhóm được bỏ qua và không đăng chữ thường.
- B2 cũng chờ nhóm/composer tải chậm và chờ bài hiển thị trước khi chuyển nhóm; trạng thái submit được lưu để reload không bấm Đăng lần hai.
- v1.9.41: B2 ghi nhận lần đầu bài vừa đăng xuất hiện trong feed làm proof, rồi giữ nhóm đủ cửa sổ an toàn; tránh báo thất bại giả khi Facebook tái chế node bài ẩn danh sau khi đã hiển thị.
- v1.9.42: B2 phân phối nguồn theo từng lượt: tích đúng 1 bài thì dùng lại bài đó cho nhiều nhóm; tích từ 2 bài trở lên thì mỗi slot nhóm/bài nhận một bài khác nhau theo thứ tự, không tự lặp. Nếu thiếu bài riêng, phiên báo lỗi trước khi đăng; bài dùng cho nhiều nhóm chỉ bị xóa sau job cuối đã xác nhận.
- v1.9.45: mọi đường quay lại/reload Bảng tin của Comment AI đều dọn composer/lớp phủ do AI mở trước khi Facebook cảnh báo rời trang; lớp phủ rỗng được đóng, draft có chữ vẫn được bảo toàn và phiên dừng fail-closed.
- v1.9.44: Comment AI không mắc vô hạn khi Facebook mở lớp phủ bài viết nhưng chưa dựng ô nhập; chỉ đóng lớp phủ rỗng vừa mở bởi cú click của luồng, reload có kiểm soát khi bài rời DOM quá lâu và giữ nguyên bộ đếm/guard. Draft có chữ vẫn được bảo toàn và phiên dừng fail-closed.
- v1.9.43: Comment AI không xóa nhầm bản nháp người dùng trong bài đã có comment; nếu Facebook giữ composer AI tạm thời khi tab chạy nền, phiên sẽ giữ bài và thử dọn lại thay vì dừng toàn bộ.
- B2 khi dùng bài đã tích tự lập kế hoạch: **1 bài / nhiều nhóm** thì biến thể bài đó cho từng nhóm; **nhiều bài / 1 nhóm** thì đăng toàn bộ các bài vào nhóm đó; **nhiều bài / nhiều nhóm** thì chia đều các bài, không trùng nguồn (ví dụ 10 bài / 5 nhóm = 2 bài mỗi nhóm). Có radio chọn rõ từng trường hợp hoặc chọn **Tự nhận diện**; các lựa chọn được kiểm tra trước khi gọi AI hoặc đăng. Kế hoạch hiện trước khi đăng. Chế độ **Dùng lần lượt bài còn lại** mới dùng số bài mỗi nhóm; bài nguồn chỉ bị xóa khỏi danh sách sau khi Facebook xác nhận đăng thành công.
- Phân phối bài B2: nếu chỉ tích 1 bài, bài đó được dùng cho nhiều nhóm; nếu tích nhiều bài, các bài được gán lần lượt vào từng slot đăng (nhóm 1/bài 1, nhóm 2/bài 2...; khi mỗi nhóm có nhiều bài thì lấp đầy từng nhóm theo thứ tự), không dùng trùng. Không đủ bài cho số slot sẽ dừng trước khi đăng.
- B1 có thể xóa thủ công từng bài không phù hợp hoặc xóa hàng loạt các bài đang tích; tiện ích hỏi xác nhận trước khi xóa khỏi kho bài học.
- Prompt B2 có hai lớp: Prompt viết lại quyết định cách biến bài đã học thành bài mới; Prompt theo group name điều chỉnh bài cho từng nhóm. Cả hai nên yêu cầu không sao chép nguyên văn, không bịa dữ kiện và có thể chọn hướng thảo luận, tương tác hoặc hỏi–đáp.

- v1.9.15: B1/B2 hỗ trợ link nhóm theo từng dòng, giữ nguyên checkbox, gộp và loại trùng theo group path; `URL | Tên nhóm` giúp AI nhận tên nhóm chính xác. Link-only target lấy tên thật sau khi mở nhóm trước khi tạo nội dung.

## Đăng bài bán hàng bằng AI

- Có tab **Đăng bán** riêng, không trộn state/selector/counter với Đăng bài AI, Comment AI hoặc Share bài.
- Nhập bài viết/thông tin sản phẩm và ghi chú tùy chọn; có thể chọn nhiều ảnh và video cùng lúc (tối đa 35 MB mỗi file). Không chọn media thì vẫn đăng chữ bình thường.
- Có hai chế độ media: **Đăng toàn bộ media đã chọn** hoặc **Random media theo từng nhóm**. Với Random, chọn số media mỗi nhóm (1–20); kế hoạch được lưu theo phiên, tránh lặp đúng cùng một tập media giữa hai nhóm liền trước nhưng không phải bảo đảm tránh giới hạn spam của Facebook.
- Chọn danh sách nhóm đã tham gia, lọc theo từ khóa, giới hạn số nhóm và delay giữa các nhóm. Thứ tự xử lý đúng theo danh sách đã tích.
- Prompt mặc định tạo bài tiếng Việt theo hướng vừa bán hàng vừa hỏi ý kiến; hỗ trợ `{groupName}`, `{sourceText}`, `{productInfo}` và tự lưu khi chỉnh sửa.
- AI tạo biến thể riêng cho từng nhóm, có thể dùng hồ sơ văn phong đã cào và cấu hình Provider/API Key/Model/Custom URL dùng chung.
- Bản xem trước và nút Test API không đăng thật. Khi chạy, chỉ tăng bộ đếm sau khi Facebook xác nhận composer đã gửi; nhóm lỗi được ghi nhận bỏ qua để không kẹt toàn bộ phiên.
- Khi đăng thật, luồng chờ nhóm/composer tải chậm, chờ bài hiển thị rồi mới tăng bộ đếm và giữ nhóm 8–12 giây trước khi sang nhóm kế tiếp.
- Proof sau khi bấm Đăng quét cả các post-like node trong main/feed, không loại thẻ bài chỉ vì có ô bình luận; thông báo hoặc banner Facebook báo đã đăng/đang chờ phê duyệt (kể cả banner không có role) được chấp nhận. Cửa sổ 30 giây là thời gian chờ proof đầu tiên, sau đó giữ nhóm 8–12 giây riêng để không báo lỗi giả khi bài lên chậm.

## Share bài vào nhóm

- Nhập link của một bài Facebook cụ thể, tải danh sách nhóm đã tham gia rồi tích các nhóm nhận bài.
- Tiện ích mở đúng link nguồn, đọc nội dung của article bài gốc và không lấy comment/reply làm nội dung cho AI.
- AI dùng chung Provider, API Key, Model, Custom URL và hồ sơ văn phong đã lưu; mỗi nhóm được tạo một lời dẫn riêng từ `{postText}` và `{groupName}`.
- Có số nhóm muốn share và delay cố định 5–3600 giây giữa hai lần share đã được Facebook nhận.
- Tại từng nhóm, tiện ích mở composer riêng, gõ chậm lời dẫn cùng link gốc và chỉ bấm Đăng sau khi Facebook dựng thẻ xem trước của bài nguồn.
- Nếu không đọc được bài, không có link preview, API lỗi hoặc thao tác gửi không được xác nhận, phiên dừng tại đúng bước để tránh đăng bài chỉ có URL hoặc gửi lặp.
- Sau khi Share được xác nhận, luồng còn chờ nội dung lời dẫn xuất hiện trong feed và giữ nhóm 8–12 giây trước khi chuyển nhóm.
- State `groupShare*` và file `share.js` hoàn toàn tách khỏi Comment AI và Đăng bài nền màu.

## Cài đặt hoặc cập nhật

1. Mở `chrome://extensions`.
2. Bật **Chế độ dành cho nhà phát triển**.
3. Chọn **Tải tiện ích đã giải nén** và trỏ tới thư mục `fb-auto-add`; nếu đã cài thì bấm **Tải lại**.
4. Tải lại trang Facebook trước khi sử dụng phiên bản mới.

## Tệp chính

- `content.js`: ba chế độ kết bạn và bộ máy xác nhận/chống trùng.
- `scrape.js`: cào bài và xuất dữ liệu.
- `group.js`: tham gia nhóm và trả lời câu hỏi.
- `page.js`: chọn Page, tham gia nhóm, đăng bài nhóm AI, theo dõi Page và Comment AI bằng Page; state machine và actor verification riêng.
- `pageStore.js`: IndexedDB cho dữ liệu dài hạn của Nuôi Page.
- Luồng **Khám phá** dùng chung cấu hình AI/câu trả lời của tham gia theo từ khóa; khi gặp màn hình “Xem xét quyền tham gia”, tiện ích chọn quy tắc, đi qua các bước Tiếp/Tiếp tục, dùng AI cho câu hỏi mở và câu mẫu cho nội quy.
- `feed.js`: tương tác bản tin, nhóm, đăng bài và comment AI.
- `share.js`: đọc bài nguồn, tạo lời dẫn riêng và share link-preview lần lượt vào đúng nhóm.
- `sales.js`: state machine Đăng bài bán hàng, chọn nhóm/media, tạo nội dung AI và xác nhận gửi riêng.
- `trend.js`: học bài mới nhất nhóm nguồn đã tích, AI viết lại theo dàn ý, đăng nhóm đích.
- `background.js`: kết nối AI và thao tác chuột/bàn phím tin cậy.
- `popup.html`, `popup.js`: giao diện và cấu hình extension.
- `i18n.js`: từ điển Việt/Anh dùng chung cho popup, content scripts và background.


### v1.8.13

- Thêm tab **Cào bài**: nhập URL Profile/Fanpage/nhóm hoặc dùng trang đang mở, tự cuộn lấy bài, bỏ qua bài quảng cáo và xuất Markdown/JSON/TXT.
- Lưu tối đa 500 bài đã cào trong extension để tạo **hồ sơ kiến thức & văn phong**. Hồ sơ dùng chung cho Comment AI, Đăng bài AI và lời dẫn Share bài, gọi provider đã cấu hình một lần và có fallback heuristic cục bộ khi API lỗi/hết quota.
- Hồ sơ chỉ là tóm tắt chủ đề/phong cách tổng quát, không sao chép nguyên văn hay giả mạo danh tính; có thể chọn/tắt/xóa trong tab Cào bài.

### v1.8.14

- Sửa kiểm tra URL nguồn cào để nhận đúng `facebook.com`, `www.facebook.com`, `m.facebook.com` và các subdomain Facebook hợp lệ.

### v1.8.15

- Cào bài chỉ lấy article bài viết chính; comment/reply lồng bên trong được loại khỏi dữ liệu và hồ sơ văn phong.

### v1.8.16

- Khóa phiên cào theo nguồn URL và mã phiên; dữ liệu/cờ của nguồn cũ không còn được khôi phục khi chuyển sang profile hoặc fanpage khác.

### v1.8.17

- File xuất được đặt tên theo nguồn và timestamp; extension kiểm tra nguồn trước khi tải để không xuất nhầm dữ liệu cào cũ.

### v1.8.18

- Đối chiếu URL sau khi Facebook mở nguồn cào; nếu bị redirect sang Bảng tin hoặc nguồn khác, extension dọn dữ liệu cũ và không cào nhầm.

### v1.8.19

- Bộ cào loại khung Messenger đang dùng `role="article"`, không trộn tin nhắn vào bài viết; fallback tác giả/thời gian cũng được làm sạch.

### v1.8.20

- File TXT và trạng thái hoàn tất ghi rõ URL/tiêu đề nguồn cùng số bài để kiểm tra nhanh kết quả cào.

### v1.8.21

- Đăng bài AI thêm số nhóm muốn đăng và delay giữa mỗi nhóm; vẫn giữ thời gian chờ tự động riêng cho composer, nền màu, gõ và nút Đăng.

### v1.8.22

- Thêm tab **Share bài**: nhập link bài Facebook, chọn nhóm đã tham gia, giới hạn số nhóm và delay giữa mỗi lần share.
- AI đọc nội dung bài gốc và tạo lời dẫn khác nhau theo tên từng nhóm bằng cấu hình API dùng chung.
- Chỉ bấm Đăng khi link đã tạo thẻ xem trước; bộ đếm chỉ tăng sau tín hiệu Facebook đã nhận composer, và cú gửi không xác nhận sẽ không được bấm lại.

### v1.8.23

- Sửa bộ đọc link bài gốc trong modal “Bài viết của…”: ưu tiên đúng bài chính, không lấy bài nền hoặc comment.
- Thêm khung nội dung bài đã đọc, trạng thái API và chat AI trong tab Share; có thể dán/chỉnh nội dung thủ công khi Facebook không tải được.
- Cuộc chat được lưu theo link và đưa làm ngữ cảnh cho lời dẫn từng nhóm; sau khi preview link xuất hiện, tiện ích xoá URL chữ khỏi composer trước khi bấm Đăng.

### v1.8.24

- Share bài chỉ tiếp tục khi Facebook đã tải xong thẻ xem trước và thẻ có đúng permalink hoặc media của bài nguồn; không còn coi nút Xóa/Remove chung là bằng chứng.
- Nếu preview còn đang tải hoặc trỏ sang profile/bài khác, phiên dừng trước khi bấm Đăng và lưu chi tiết để kiểm tra, tránh share nhầm.

### v1.8.25

- Sau khi xoá URL chữ, chờ Facebook dựng lại card tối đa 8 giây và đối chiếu định danh ảnh/meta/profile của chính card vừa xác nhận; không đánh trượt card chỉ vì DOM bị thay mới.

### v1.8.26

- Sửa luồng tham gia nhóm với dialog mới “Trả lời câu hỏi”: nhận diện thông báo yêu cầu đang chờ phê duyệt, tự tích các lựa chọn checkbox, điền câu trả lời và chờ nút **Gửi** được Facebook bật trước khi gửi.

### v1.8.27

- Sửa Đăng bài AI kèm nền màu: chế độ Random không còn nhận nhầm gradient/hình minh họa có chứa tên màu (ví dụ “vàng–cam–hồng”) và không còn luôn chọn nút nền đầu tiên khi phải fallback; chỉ chọn nền trơn và fallback ngẫu nhiên giữa các nền trơn khả dụng.

### v1.9.6

- Đăng bán cho phép chọn đồng thời nhiều ảnh và video; danh sách media được lưu riêng, hiển thị đầy đủ trong popup, tìm lại ô nội dung sau khi Facebook dựng lại composer vì nhận media và chỉ tiếp tục từng nhóm khi Facebook xác nhận đủ thumbnail/media đã gắn.

### v1.9.7

- Đăng bán nhận diện cả số media ẩn sau ô `+N` của Facebook và số file trong input, không bỏ qua nhóm chỉ vì lưới thumbnail đang ảo hóa.
- Sau khi Facebook thay composer, tiện ích focus lại đúng editor hiện tại, thử nhập bằng điều khiển tin cậy rồi fallback thay nội dung có xác nhận. Nếu vẫn không có nội dung hoặc media proof, phiên dừng tại đúng nhóm để kiểm tra thay vì tự chuyển nhóm và báo tiến trình sai.

### v1.9.12

- Chẩn đoán Học nhóm không còn đánh dấu node là “đã học” trước khi parser chạy, tránh báo parse rớt giả.

### v1.9.13

- Bổ sung chờ giao diện nhóm/composer cho cả Đăng bài AI, B2, Share bài và Đăng bán khi mạng chậm hoặc Facebook render SPA lâu.
- Sau cú bấm Đăng/Share, mỗi luồng chờ bài xuất hiện trong feed trước khi chuyển nhóm; giữ nhóm thêm 8–12 giây và dừng an toàn nếu không xác minh được, không retry cú bấm có nguy cơ trùng.

### v1.9.14

- B2 Học nhóm thêm công tắc **Bắt buộc đăng ẩn danh**; xác nhận switch và hộp thoại xác nhận của Facebook trước khi nhập/đăng, bỏ qua nhóm không hỗ trợ thay vì fallback đăng công khai.
- B2 chấp nhận proof rõ ràng “đang chờ quản trị viên phê duyệt” là kết quả terminal hợp lệ, vẫn giữ nhóm 8–12 giây trước khi chuyển.

### v1.9.15

- B1/B2 Học nhóm thêm ô link nhóm theo từng dòng, vẫn giữ ô chọn nhóm; khi có link thì chỉ chạy theo link, khi để trống thì chạy đúng nhóm đã tích.
- Hỗ trợ `URL | Tên nhóm`; link-only ở B2 sẽ lấy tên hiển thị thật sau khi mở nhóm trước khi AI tạo bài.
- Thêm Prompt AI theo group name dùng `{groupName}`, được ghép riêng cho từng nhóm đích.

### v1.9.16

- B2 bắt buộc đăng ẩn danh ưu tiên nút “Bài viết ẩn danh” của Facebook, tự xác nhận “Tạo bài viết ẩn danh” trước khi kiểm tra switch và nhập bài.
- Vẫn giữ fallback cho composer thường có switch “Đăng ẩn danh”; không fallback sang đăng công khai.

### v1.9.17

- B2 Học nhóm thêm đăng kèm nền màu: tắt/mở, cố định một màu hoặc random trong palette đã tích, giới hạn ký tự và lưu cấu hình riêng.
- Nền phải được Facebook xác nhận trước khi nhập nội dung; nền cố định không tự đổi sang màu khác, còn random tránh gradient/hình minh họa và tránh lặp màu vừa đăng.

### v1.9.18

- Sửa thao tác chọn màu nền của B2 Học nhóm: ưu tiên native click sau khi bảng màu Facebook animation xong, rồi mới dùng trusted mouse dự phòng; vẫn không nhập/đăng nếu Facebook không xác nhận nền.

### v1.9.19

- Kéo dài cửa sổ xác minh bài B2 từ 30 lên 60 giây để chờ feed Facebook chèn bài ẩn danh/kèm nền chậm, tránh báo thất bại giả sau khi Facebook đã nhận lệnh đăng.

### v1.9.20

- Link nhóm nguồn và đích là chế độ chỉ định trực tiếp: khi ô link có dữ liệu, chỉ các URL trong ô được dùng; khi ô link trống, mới dùng nhóm đã tích.
- Link nhóm nguồn/đích trở thành lựa chọn trực tiếp: có link thì chỉ chạy theo link, không trộn với danh sách checkbox; để trống link thì chạy đúng các nhóm đã tích.

### v1.9.21

- Đăng bài viết lại nhận diện cảnh báo Facebook giới hạn tần suất/spam sau thao tác Đăng, dừng phiên an toàn và giữ nguyên bộ đếm để không báo thành công giả.

### v1.9.22

- B2 nhận diện composer Facebook đã chọn danh tính qua nút “Thành viên ẩn danh”/“Anonymous member” khi Facebook không render switch `role="switch"`; không đăng công khai nếu trạng thái ẩn danh chưa được xác nhận.

### v1.9.23

- B2 proof bài vừa đăng không loại article chỉ vì article có ô bình luận `contenteditable`; chỉ loại composer trong dialog, giúp xác nhận đúng bài ẩn danh có nền sau khi Facebook chèn bài vào feed.

### v1.9.24

- B1 có bộ chọn nguồn học rõ ràng: theo link nhóm, theo danh sách nhóm nguồn đã chọn hoặc theo danh sách nhóm đích đã chọn. Chế độ link không có link sẽ báo lỗi thay vì tự dùng danh sách khác; cấu hình cũ được migrate tự động.

### v1.9.28

- Comment AI xử lý trường hợp Facebook thay DOM ô comment sau khi nhập/gửi: tìm lại composer replacement theo đúng bài, dọn và xác nhận ô rỗng trước khi quay route hoặc dừng, tránh cảnh báo “Bạn chưa hoàn tất bình luận?”.

### v1.9.30

- Đăng bài AI nhận diện đúng bài đã vào feed nhưng đang chờ quản trị viên phê duyệt, kể cả khi Facebook render proof trong thẻ bài thay vì vùng trạng thái; không còn báo lỗi giả “đã nhận lệnh nhưng chưa thấy bài”.

### v1.9.31

- Group Post xóa và xác nhận bản nháp cũ trong composer trước khi gõ nội dung mới. Nếu Facebook vẫn giữ draft, luồng dừng tại đúng nhóm để không nối hai lần thử thành một bài vượt giới hạn ký tự.

### v1.9.32

- Khóa prompt của Group Post, B2, Share bài và Đăng bán trong lúc phiên đang chạy; prompt mới chỉ áp dụng cho phiên kế tiếp, tránh sửa giữa chừng làm lệch cấu hình đang resume.
- Bổ sung hướng dẫn prompt song ngữ trong popup, kèm mẫu thảo luận, câu tương tác, hỏi–đáp, Share lời dẫn và đăng bán.

### v1.9.33

- B2 nhận đúng nút gửi “Gửi/Send” mà Facebook dùng cho composer ẩn danh.
- Trước khi chuyển nhóm, B2 đóng composer và xử lý hộp thoại bỏ bản nháp nếu còn mở, tránh cảnh báo “Rời khỏi trang web?” và không làm kẹt phiên sau nhóm lỗi.

### v1.9.34

- B2 có bộ chọn bài học theo từng lượt: dùng các bài đã tích hoặc dùng lần lượt bài còn lại từ mới nhất.
- B2 đăng theo từng job với cấu hình số bài mỗi nhóm, số nhóm và delay giữa mỗi bài; chỉ tiêu hao bài học sau proof đăng thành công, bài lỗi/bỏ qua vẫn còn để chạy lại.

### v1.9.35

- B1 có thể xóa từng bài học hoặc xóa hàng loạt các bài đang tích, có xác nhận trước khi xóa khỏi kho.

### v1.9.36

- B2 mặc định bật “Bắt buộc đăng ẩn danh” cho lần cấu hình đầu tiên và tự lưu trạng thái tích/bỏ tích; lần chạy sau giữ nguyên lựa chọn gần nhất.

### v1.9.37

- Bổ sung khối “Cách viết Prompt hiệu quả” cho toàn bộ các ô Prompt trong popup, với hướng dẫn theo đúng biến và định dạng đầu ra của từng tính năng.

### v1.9.38

- B2 kiểm tra sự đồng bộ giữa URL và DOM/tên nhóm Facebook trước khi đăng. Nếu Facebook còn giữ giao diện nhóm cũ sau khi SPA đổi URL, tiện ích tải lại đúng một lần rồi resume từ state đã lưu, tránh đăng nhầm nhóm hoặc xác minh sai bài.

### v1.9.39

- B2 đọc lại cờ reload/run sau khi tải lại trang đồng bộ, tránh lặp reload và tiếp tục đúng bài/nhóm đang xử lý.

### v1.9.40

- B2 kiểm tra tài khoản đã là thành viên nhóm trước khi mở composer. Nhóm hiển thị “Tham gia nhóm/Join group” sẽ được bỏ qua an toàn vì chưa có quyền đăng.

### v1.9.29

- Đăng bài nhóm và Học nhóm khi bật nền màu yêu cầu AI giữ đủ chủ đề, ý chính/góc nhìn và câu hỏi nếu còn chỗ trong khoảng mục tiêu gần giới hạn (100 ký tự → 85–100; 125 → 110–125).
- Nếu AI trả quá dài, tiện ích gọi thêm một lượt nén nội dung hoàn chỉnh trước khi nhập Facebook; không cắt thẳng giữa câu. Nếu vẫn không đạt tối đa ký tự, nhóm được bỏ qua/dừng an toàn thay vì đăng bài cụt.

### v1.9.27

- Comment AI ghi nhớ đúng composer do nó vừa nhập. Trước khi Stop/Reset, đóng bài, quay về Bảng tin hoặc đổi route, tiện ích xóa bản nháp bằng Ctrl+A/Backspace tin cậy và xác nhận ô đã rỗng; nếu không xóa được thì dừng tại bài hiện tại để tránh cảnh báo Facebook “Bạn chưa hoàn tất bình luận?” hoặc làm mất draft.

### v1.9.26

- Sửa Quét thử/Xác nhận lời mời khi Facebook render danh sách ngoài `role="main"`; bộ quét tìm đúng container lời mời và không lấy link của bạn chung làm hồ sơ người gửi.
- Bộ lọc ảnh đại diện đi lên cây cha của riêng thẻ lời mời để nhận cấu trúc SVG image hiện tại của Facebook, chỉ tính ảnh thuộc đúng profile key và dừng trước container chứa nhiều lời mời.
- Kết quả Quét thử hiển thị riêng số hồ sơ đạt, thiếu dữ liệu và không đạt thay vì gọi toàn bộ hồ sơ phát hiện được là phù hợp.
- Khi mở profile để đọc thêm, luồng chờ URL/profile key ổn định, chỉ thử điều hướng lại một lần và dừng an toàn nếu vẫn không đúng hồ sơ. Mỗi hồ sơ chỉ được đọc bổ sung một lần trong phiên; nếu dữ liệu công khai vẫn thiếu thì bỏ qua theo cấu hình, không mở lại vô hạn.
- Khi hết batch đang hiển thị, luồng cuộn đúng khung danh sách lời mời của Facebook để tải thêm hồ sơ, kể cả khi danh sách nằm trong panel cuộn riêng thay vì cuộn toàn trang.

### v1.9.25

- Thêm mode **Xác nhận lời mời** trong tab Kết bạn, mở `/friends/requests` và có các ô nhập số bạn chung tối thiểu, số nhóm chung tối thiểu, quê quán, trường học, yêu cầu ảnh đại diện và chính sách bỏ qua dữ liệu chưa đọc được.
- Luồng xác nhận có Quét thử, state/history riêng, có thể mở profile để đọc thêm thông tin công khai, và chỉ tăng bộ đếm sau khi Facebook xác nhận đã trở thành bạn bè.

### v1.9.11

- Học nhóm không còn loại nhầm bài viết thường khi Facebook dùng `data-ad-preview="message"`; bộ lọc quảng cáo chỉ nhận marker/nhãn quảng cáo rõ ràng.

### v1.9.10

- Sửa **Học nhóm** theo cấu trúc Facebook hiện tại: bài viết chính được lấy từ các node trực tiếp trong `role="feed"` có hành động bài viết; không còn loại nhầm toàn bộ bài thành comment do phụ thuộc `div[role="article"]`.
- Parser có fallback `textContent` khi `innerText` chưa được Facebook render; popup ưu tiên tab Facebook active khi mở từ cửa sổ popup riêng. B1 vẫn chỉ đọc và chỉ lưu bài sau khi parse thành công.

### v1.9.8

- Tab Đăng bán có ô Prompt riêng (tự lưu) và khung Chat AI dùng chung Provider/API Key/Model/Custom URL.
- Có thể chat để yêu cầu AI viết hoặc chỉnh một bài, bấm **Dùng bài này** để duyệt. Các bài đã duyệt được dùng lần lượt cho các nhóm đầu tiên; nội dung chưa duyệt không được tự động đăng.

### v1.9.5

- Thêm tab **Đăng bán** độc lập: tạo bài bán hàng AI theo từng nhóm, chọn media tùy chọn, dùng hồ sơ văn phong và cấu hình AI dùng chung.
- Thêm state `salesPost*`, bộ đếm/stop/reset riêng, giới hạn nhóm + delay, preview/Test API không đăng và xác nhận gửi trước khi chuyển nhóm.

### v1.9.4

- Sửa Comment AI và bình luận AI trong tương tác nhóm: khi API lỗi hoặc chọn chế độ dùng câu mẫu, tiện ích vẫn tạo được câu dự phòng theo ngôn ngữ đang dùng thay vì dừng vì lỗi nội bộ.
- Mọi Start lưu state trước khi đổi route; Scrape đối chiếu alias Facebook theo cùng path và Reset vẫn hoạt động khi tab không ở Facebook. Group Interact/Đăng nhóm có run ID và guard riêng để phiên cũ không chạy tiếp sau Stop rồi Start lại.
- Đăng nhóm ghi nhận hai giai đoạn `submit-armed`/`submit-dispatched`, chỉ xác nhận khi dialog đóng hoặc Facebook báo đã đăng/chờ duyệt; không bấm lại khi kết quả mơ hồ. Nền màu chỉ được tính là đã áp dụng khi có trạng thái chọn hoặc style nền thực tế.

### v1.9.3

- Nút Dừng/Reset dừng thật bằng mọi giá: gửi tới mọi tab Facebook, ghi cờ dừng trực tiếp, resume sau reload chỉ chạy đúng tab sở hữu và chỉ khi chưa dừng.
- Không còn chuyện Dừng rồi mà comment/bài vẫn được gửi: kiểm tra dừng lần cuối ngay trước mỗi cú gửi, chờ dài nào cũng thoát được.

### v1.9.2

- Quy tắc chung: bấm Bắt đầu 1 lần là chạy tới cùng — phiên được lưu trước khi chuyển trang nên tab tự tiếp tục đúng nhiệm vụ sau mọi điều hướng/reload, không cần mở extension bấm lại.
- Đăng bài AI lên nhóm có thêm nút Reset tiến trình.
- Sửa resume cào bài (trước đây reload là mất phiên) và resume nhóm tự quay lại đúng nhóm khi lạc trang.

### v1.9.1

- Sửa lỗi comment AI dính ký tự lạ ở cuối (do emoji bị chẻ đôi khi gõ/cắt chuỗi) khiến Facebook từ chối đăng: gõ theo code-point, cắt chuỗi an toàn, lọc sạch trước khi đăng.

### v1.9.0

- Hỗ trợ 2 ngôn ngữ Việt/Anh cho toàn bộ giao diện, trạng thái, prompt AI mặc định và câu trả lời mẫu: chọn ở góc phải header extension, tự áp dụng ngay không cần tải lại.
- Mọi tính năng AI (comment, đăng bài, share, trả lời câu hỏi nhóm, hồ sơ văn phong) sinh nội dung theo đúng ngôn ngữ đã chọn.

### v1.8.35

- Comment AI Bảng tin không còn bỏ qua bài chỉ vì Bảng tin thay mới node trong lúc chờ AI: tự tìm lại đúng bài theo định danh rồi mới thao tác, chỉ bỏ khi bài thật sự không còn.
- Đã bấm Bình luận thì chờ ô nhập tải xong không giới hạn, hiển thị số giây đang chờ, không bấm lần hai và không nhảy sang bài khác.

### v1.8.34

- Tham gia nhóm theo từ khóa không còn dừng giữa chừng bắt bấm lại: phiên được lưu trước khi chuyển trang, tab tự tiếp tục đúng từ khóa sau mọi điều hướng/reload, giữ nguyên số nhóm đã tham gia.
- Đổi từ khóa khi phiên cũ còn chạy bị chặn rõ ràng tới khi Dừng; nút Dừng/Reset dọn phiên ngay cả khi tab không phản hồi.

### v1.8.33

- Tham gia nhóm theo từ khóa mới không còn kẹt ở trang tìm kiếm của từ khóa cũ: tab tự chuyển sang đúng từ khóa rồi mới chạy.
- Mở extension tự về đúng panel của tính năng đang chạy; không có gì chạy thì mở lại tab lần trước, popup giữ nguyên không tự đóng.

### v1.8.32

- Comment AI trong tương tác nhóm nay báo rõ từng bài bị bỏ vì sao (bài ngắn, đã xử lý, đã có comment, không thấy nút/ô nhập, gửi chưa xác minh, lạc trang) ngay trong dòng trạng thái.
- Nút Bình luận làm Facebook chuyển trang thì bài được khóa chống lặp và phiên tự quay lại nhóm tiếp tục; chờ ô nhập không còn bỏ sót ô đã mở khi bài rời DOM.

### v1.8.31

- Mọi nút Bắt đầu trong extension đều chuyển sang trạng thái “đang chạy” (⏳) ngay khi bấm, kể cả lúc đang mở đúng route nhiệm vụ; mở lại popup vẫn thấy đúng trạng thái của phiên đang chạy.
- Ba nút Tương tác nhóm, Đăng nhóm và Share bài trước đây không đổi trạng thái, nay đã có trạng thái riêng và tự tắt khi dừng, hoàn tất hoặc khởi động lỗi.

### v1.8.30

- Mọi nút Bắt đầu đều đưa tab về đúng route nhiệm vụ dù đang ở trang Facebook nào: tìm nhóm theo từ khóa về trang tìm kiếm, Khám phá về `/groups/discover`, Bản tin/Comment AI về Bảng tin chính, Tương tác/Đăng nhóm về nhóm đầu tiên đã chọn.
- Tương tác bản tin từ chối chạy trên route sai, lưu phiên nháp rồi tự về Bảng tin trước khi tương tác.

### v1.8.29

- Tương tác nhóm đã tham gia thêm ô **Số nhóm muốn tương tác**: chỉ chạy N nhóm đầu theo thứ tự đã tích, giống Đăng bài AI.
- Thêm checkbox **Bình luận AI cho mỗi bài đã thả cảm xúc**: dùng cấu hình AI chung + hồ sơ văn phong, fallback câu mẫu khi API lỗi, chống trùng riêng theo nhóm, không trộn lịch sử Comment AI Bảng tin.

### v1.8.28

- Sửa tiếp lỗi lặp màu: khi nhóm chỉ cung cấp một phần bảng màu, tiện ích lập danh sách nền trơn thực tế rồi chọn ngẫu nhiên trong danh sách đó, tránh rơi cố định vào màu đỏ đầu tiên và tránh lặp màu vừa dùng nếu còn màu khác.

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

### v1.9.39
- B2 đọc lại cờ reload/run sau khi tải lại trang đồng bộ, tránh lặp reload và tiếp tục đúng bài/nhóm đang xử lý.
