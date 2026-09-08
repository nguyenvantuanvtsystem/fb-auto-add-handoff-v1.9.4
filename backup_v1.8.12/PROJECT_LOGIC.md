# FB Auto Tool — Logic handoff cho AI

Tài liệu này là bản mô tả hành vi cần giữ khi bảo trì dự án. AI tiếp quản phải đọc tài liệu này cùng `README.md` trước khi sửa code. Mỗi tính năng có state, nguồn dữ liệu và điều kiện thành công riêng; không dùng chung một bộ selector hoặc một cách xác nhận cho tất cả tính năng.

## Phiên bản và nguyên tắc chung

- Phiên bản hiện tại: **v1.8.12** (v1.6.3 là phiên bản đã test Comment AI 20/20).
- v1.8.12: luồng Khám phá có bộ canh URL; nếu người dùng điều hướng khỏi `/groups/discover` (kể cả chuyển trang SPA về Bảng tin/nhóm khác), cấu hình và tiến độ được lưu rồi tự quay lại để tiếp tục.
- v1.8.11: luồng Khám phá lưu `discoverRunConfig` và tiến độ; nếu phiên đang chạy bị điều hướng về Bảng tin, vào nhóm khác hoặc bất kỳ URL Facebook nào, tự quay lại đúng `/groups/discover` rồi tiếp tục, không reset bộ đếm.
- v1.8.10: mọi ô Prompt (đăng bài nhóm, trả lời câu hỏi tham gia và comment AI) tự lưu khi chỉnh sửa vào `chrome.storage.sync`; khi mở lại popup sẽ khôi phục cả giá trị rỗng đã lưu, không tự thay bằng prompt mẫu.
- v1.8.9: Comment AI lưu thêm dấu vân tay nội dung bài, giữ định danh ổn định qua lần Facebook render lại, nhận diện comment của chính tài khoản trong bài và bỏ qua bài đã xử lý; không gửi lặp khi DOM/URL thay đổi.
- Nút Reset Comment AI chỉ reset bộ đếm/phiên đang chạy, không xóa lịch sử chống trùng; lịch sử phải được giữ qua reload và các phiên mới.
- v1.8.8: luồng tham gia nhóm nhận diện “Xem xét quyền tham gia”, chọn quy tắc, xử lý nhiều bước Tiếp/Tiếp tục và dùng AI cho mọi câu hỏi mở.
- v1.8.7: nhận diện màn hình “Xem xét quyền tham gia”, tự chọn checkbox/quy tắc, xử lý nút Tiếp/Tiếp tục nhiều bước, dùng AI cho mọi câu hỏi mở và câu mẫu cho câu đồng ý nội quy.
- v1.8.6: sau khi Facebook xác nhận đăng bài, giữ nguyên nhóm 6–8 giây để bài kịp hiển thị trước khi chuyển nhóm kế tiếp.
- v1.8.5: tự đóng hộp thoại chào mừng nhóm nếu Facebook hiển thị khi vào nhóm, tránh che nút tạo bài và làm nhóm bị bỏ qua; chờ bảng màu render đầy đủ và nhận các nút nền dù đang ngoài phần nhìn thấy để tránh bỏ qua nhầm.
- v1.8.4: nếu nhóm có bảng nền nhưng không trùng màu đã tích, tự chọn nền khả dụng; nhóm bị bỏ qua không còn giữ bản nháp; bộ đếm tách rõ đã đăng và bỏ qua.
- v1.8.3: nhận đúng các nhãn composer Facebook mới như “Bạn viết gì đi…”, “Bạn đang nghĩ gì thế?” và “Bạn đang bán gì?”.
- v1.8.2: lỗi composer/bảng nền hoặc nhóm bị Facebook chuyển khỏi trang nhóm sẽ được thử lại rồi bỏ qua riêng nhóm đó, không dừng toàn bộ phiên.
- v1.8.1: giữ tùy chọn đăng chữ thường; chỉ tự bỏ qua nhóm không có bảng nền khi người dùng bật đăng kèm nền.
- v1.8.0: tách luồng đăng nhóm theo URL/nhóm đã tích chọn, luôn yêu cầu nền màu và tự bỏ qua nhóm không có bảng nền; thời gian chờ và giãn cách dùng mức tự động, không còn ô tùy chỉnh.
- v1.7.4: nếu cờ dừng trong bộ nhớ cũ còn sót sau reload nhưng `groupPostActive` vẫn true, tự dọn cờ và tiếp tục mở composer; chỉ dừng khi trạng thái lưu thật sự tắt.
- v1.7.3: đối chiếu nhóm đăng bài theo ID trong URL (vẫn nhận slug cũ), tránh tải lại chính nhóm hiện tại; ghi log điểm kiểm tra route và tiếp tục ngay nếu nhóm kế tiếp đã ở cùng URL.
- v1.7.2: thêm log chẩn đoán an toàn cho luồng đăng bài nhóm, không ghi API key/nội dung bài.
- v1.7.1: xác nhận nền theo trạng thái đã chọn hoặc style thực tế, không dựa vào nhãn “phông nền N” của nút.
- v1.7.0: nhận diện bảng màu theo cụm nút thực tế khi Facebook bỏ tiêu đề “Chọn phông nền”, hỗ trợ chooser đang mở và nhãn “Tím thẫm”.
- v1.6.9: xác nhận theo URL khi Facebook gỡ thẻ nhóm khỏi DOM sau khi gửi yêu cầu; kế thừa việc đọc chữ hiển thị thay vì `aria-label` cũ và giới hạn chờ hộp câu hỏi khoảng 11 giây.
- Đây là Chrome MV3 extension chạy trên Facebook; `popup.js` điều khiển, các content script thao tác DOM, `background.js` gọi API AI và thao tác tin cậy.
- Không dùng URL/DOM của Messenger, bình luận con hoặc quảng cáo làm đối tượng của bài viết chính.
- Mọi vòng lặp dài phải kiểm tra cờ dừng thường xuyên và lưu tiến độ vào `chrome.storage.local`.
- Chỉ tăng bộ đếm khi Facebook đã xác nhận hành động tương ứng. “Đã bấm” không đồng nghĩa “đã thành công”.
- Khi Facebook thay DOM/SPA route, phải tìm lại phần tử bằng selector có ngữ cảnh; không giữ một nút cũ qua lần render khác.
- Không log hoặc ghi API key vào tài liệu, console hay status.

## Kiến trúc file

| File | Trách nhiệm |
| --- | --- |
| `popup.html`, `popup.js` | Giao diện, đọc cấu hình, gửi lệnh, hiển thị state |
| `content.js` | Kết bạn và quét nhóm đã tham gia |
| `group.js` | Tham gia nhóm theo từ khóa/Khám phá, câu hỏi tham gia bằng AI |
| `feed.js` | Like/cảm xúc bản tin, tương tác nhóm, comment AI, đăng bài AI lên nhóm |
| `scrape.js` | Cào bài và tải dữ liệu |
| `background.js` | Gọi Gemini/OpenAI-compatible/Claude, nhập chữ và chuột tin cậy |

## Cấu hình AI dùng chung

`popup.js` dùng `getUnifiedAiConfig()` và `persistUnifiedAiConfig()` để mọi tính năng AI dùng cùng provider, key, model và Custom URL.

- Lưu tương thích ở `chrome.storage.sync`: `aiProvider`, `aiApiKey`, `aiModel`, `aiCustomUrl`, `aiKeys`, cùng các khóa `groupPostAi*` cũ.
- Lưu profile theo provider ở `chrome.storage.local.unifiedAiProfiles` để không phải nhập lại.
- Khi đổi provider, lấy profile riêng của provider đó; không ghi đè key của provider khác.
- Gemini dùng Interactions API (`v1beta/interactions`) với model mặc định `gemini-flash-lite-latest`, header `x-goog-api-key`.
- OpenAI, Groq, OpenRouter, DeepSeek, Mistral và Custom dùng định dạng OpenAI-compatible; Claude/Muse dùng `/v1/messages`.
- Nút Test API phải gọi `action: "aiTest"`, kiểm tra key/model/Custom URL và trả lỗi thân thiện.
- Nếu API lỗi hoặc hết quota, comment dùng câu mẫu dự phòng; đăng bài nhóm phải báo lỗi theo chính sách fallback, không tạo vòng lặp vô hạn.

## 1. Kết bạn (`content.js`)

### Mode Theo gợi ý (`suggestions`)

1. Chỉ chạy khi URL là `/friends/suggestions`.
2. Xác định vùng “Những người bạn có thể biết/Gợi ý”; chỉ lấy nút có nhãn kết bạn chính xác.
3. Tìm hồ sơ trong cùng thẻ/vùng với nút, lấy `profileKey` từ URL hoặc ID.
4. Xử lý tuần tự từ trên xuống; chờ delay Min–Max kể cả trước lời mời đầu tiên.
5. Sau khi bấm, phải chờ nhãn “Đã gửi/Hủy lời mời” hoặc thông báo thành công. Không tăng `sentCount` nếu chưa xác nhận.

### Mode Thành viên có điểm chung (`group-common`)

1. Với từng nhóm được tích chọn, mở `/groups/{id}/members/` đúng ID.
2. Chờ tối đa 120 giây cho nội dung. Khi thấy mục “Thành viên có điểm chung”, bấm đúng liên kết “Xem tất cả” dẫn tới `/members/things_in_common/`.
3. Chờ danh sách đầy đủ và nút “Thêm bạn bè”; xử lý theo thứ tự từ trên xuống, không lấy nút ngoài section.
4. Lọc `minMutual` nếu người dùng đặt số bạn chung tối thiểu; bỏ qua hồ sơ đã gửi/đã là bạn.
5. Nếu Facebook tải chậm, được reload tối đa một lần rồi tiếp tục chờ; không báo hoàn tất chỉ vì đã bấm “Thêm bạn bè”.

### Lịch sử, dừng và giới hạn

- State chính: `friendRunState`, `sentCount`, `friendProfileHistory`, `friendSkipped`, `friendUncertain`, `isRunning`.
- `friendProfileHistory` chống gửi trùng qua reload; trạng thái `uncertain` chỉ tồn tại tối đa 24 giờ.
- Nút Dừng đặt `active=false`, content script phải thoát ở điểm chờ tiếp theo. Không cộng lời mời chưa xác nhận.
- Khi Facebook báo giới hạn/chặn/xác minh, dừng an toàn và hiển thị cảnh báo; không cố vượt giới hạn.

### Theo bộ lọc tìm kiếm

Giao diện hiện tại chỉ có hai mode trên. Không tự coi trang `/search` là nguồn kết bạn; muốn bổ sung mode tìm kiếm phải tạo selector, state và điều kiện xác nhận riêng, sau đó cập nhật tài liệu này.

## 2. Tham gia nhóm (`group.js`)

### Theo từ khóa

- Mở trang tìm nhóm, thu thập card nhóm và lọc theo tên, số thành viên, số bài/ngày.
- Bấm tham gia từng nhóm theo thứ tự; sau mỗi lần bấm chờ trạng thái tham gia thật sự trước khi tăng `groupJoined`.
- Nếu có hộp “Câu hỏi dành cho người tham gia” hoặc “Xem xét quyền tham gia”, lấy tất cả textarea/contenteditable trong đúng dialog.
- Tự chọn các checkbox quy tắc; nếu có nút “Tiếp/Tiếp tục” thì xử lý từng bước trong cùng dialog trước khi gửi.
- Nếu bật AI, gọi `aiAnswerJoinQuestions` một lần cho toàn bộ câu hỏi mở, nhận mảng theo đúng thứ tự, điền từng ô rồi kiểm tra đủ số ô trước khi Gửi.
- Nếu chưa điền đủ hoặc Facebook chưa nhận câu trả lời, đóng dialog/bỏ qua nhóm; không báo đã tham gia.

### Phân loại câu hỏi và dùng AI

- Đây là logic riêng của tham gia nhóm, không dùng logic composer/lịch sử của Comment AI.
- Câu hỏi đồng ý nội quy, cam kết, không quảng cáo/spam, giữ vệ sinh… dùng `autoAnswers` có sẵn và không gọi API.
- Câu hỏi đồng ý nội quy dùng câu trả lời mẫu; mọi câu hỏi mở còn lại dùng AI nếu bật `aiJoinEnabled` (tắt AI thì dùng câu mẫu dự phòng).
- Dialog có nhiều câu hỏi được xử lý theo đúng thứ tự; kết quả AI được đặt lại đúng ô.
- Nếu AI không trả đủ câu hỏi mở, không gửi dialog và không tăng bộ đếm nhóm.

### Theo Khám phá

Luồng tương tự nhưng dùng danh sách `/groups/discover`; state tách biệt `pendingDiscoverJoin`, `discoverJoined`, `discoverStatus`, `isDiscoverJoining`. Dùng chung cấu hình AI/câu trả lời; tên nhóm được lấy từ link trong card và truyền vào AI khi gặp câu hỏi cần suy luận. Không trộn bộ đếm với luồng từ khóa.

## 3. Cào bài (`scrape.js`)

- Mở rộng “Xem thêm”, đọc bài viết ngoài vùng comment, loại trùng và lưu dữ liệu trong bộ nhớ của phiên.
- Cuộn từng nhịp để Facebook render; khi chiều cao không tăng nhiều vòng liên tiếp thì kết thúc với số bài thực tế, không tự bịa đủ target.
- State: `isScraping`, `scrapeTarget`, `scrapeCount`, `scrapeReady`, `scrapeHasData`.
- Chỉ cho tải MD/TXT/JSON khi `scrapeReady=true`; Reset xóa trạng thái sẵn sàng nhưng không xóa file người dùng đã tải.

## 4. Tương tác bản tin / cảm xúc (`feed.js`)

- Chỉ chạy trên `/` hoặc `/home.php`.
- `findFeedPosts()` lấy nút Like của bài gốc, tìm container có permalink + Like + Comment; loại Reels/Watch và bài có dấu hiệu quảng cáo.
- Like dùng click tin cậy và xác nhận nhãn/trạng thái đổi. Cảm xúc random chọn một trong Like/Love/Haha/Wow/Sad/Angry, mở picker rồi xác nhận đúng nhãn.
- Đánh dấu `data-feed-interacted="1"`, chờ delay Min–Max trước bài tiếp theo. Không thao tác nút Like trong comment con.
- Nếu DOM bị recycle, bỏ qua node cũ và tìm lại; không bấm lại một bài đã đánh dấu.

## 5. Comment AI trên Bảng tin — logic phải giữ nguyên

Đây là luồng đã test thực tế 20/20 ở v1.6.3.

### Chọn bài và chống sai nguồn

1. Chỉ khởi động trên Bảng tin (`isMainFacebookFeed()`), không tự comment ở trang nhóm/fanpage/profile.
2. Chỉ xử lý article do `findFeedPosts()` phát hiện trực tiếp và có `data-ai-feed-candidate="1"`.
3. Bỏ qua quảng cáo/“Được tài trợ”, Reels/Watch, bài không đọc được nội dung tối thiểu và bài đã có trong lịch sử.
4. `postIdentity()` ưu tiên ID canonical từ permalink/group post/story; không dùng text làm định danh duy nhất nếu đã có ID.

### State và chống trùng

- State chạy: `isAICommenting`, `aiCount`, `aiTarget`, `aiNextAllowedAt`, `aiActiveConfig`.
- Lịch sử: `aiCommentHistory`, `aiCommentSubmissionGuard`, `aiRecentPostKeys` trong `chrome.storage.local`.
- Ghi `aiCommentSubmissionGuard` ngay trước thao tác gửi. Nếu Facebook mất phản hồi, khóa bài đó và không gửi lại ở lần sau.
- Chỉ tăng `aiCount` sau `true` hoặc `already-commented`. Kết quả `unconfirmed-skip` không tính là thành công nhưng bài vẫn bị khóa để tránh trùng.

### Gọi AI và chuẩn hóa

- Chế độ `personal` gọi từng bài; `balanced` gom tối đa `aiBatchSize` bài; `max` dùng câu mẫu, không gọi API.
- Cache theo hash nội dung (`aiCommentCache`) trong số ngày cấu hình để giảm quota.
- Prompt yêu cầu một câu tự nhiên; `cleanGeneratedComment()` loại lời dẫn/Markdown/dấu ngoặc và bỏ dấu `!` ở cuối.
- Nếu API lỗi, dùng `fallbackComment()` và hiển thị trạng thái lỗi; không làm hỏng vòng lặp.

### Thao tác composer và xác nhận

1. Từ bài gốc bấm nút Bình luận chính **một lần duy nhất**. Không bấm lần hai khi Facebook đang tải vì có thể đóng composer.
2. Nếu Facebook mở permalink/detail đúng bài, cho phép thao tác chỉ khi route được mở từ nút của bài đang xử lý; nếu điều hướng sai thì quay về `/` và giữ pending state.
3. Chờ ô `[contenteditable]` ổn định. Ưu tiên focus trực tiếp vào ô đã xác định; chỉ dùng chuột tin cậy làm fallback, tránh Messenger.
4. Điền nội dung bằng `trustedInput` theo từng ký tự khi có cấu hình tốc độ; không dùng ô bình luận con.
5. Tìm nút “Đăng bình luận” trong đúng composer, bấm một lần và chờ composer/ô nhập thay đổi cùng bằng chứng comment trong đúng bài.
6. `commentProofExists()` không được coi text còn nằm trong contenteditable là comment đã đăng; phải tìm node comment ngoài editor.

### Timeout, bài kế tiếp và tải lại

- Nếu ô nhập chưa sẵn sàng, giữ đúng bài; không đóng để cuộn bài khác.
- Nếu đã gửi nhưng Facebook không trả bằng chứng sau 30 giây, `postAIComment()` trả `unconfirmed-skip`, khóa `postKey`, đóng view và cho vòng lặp tiếp tục bài kế tiếp.
- Nếu chưa gửi/route còn đúng bài nhưng chưa xác nhận, retry cùng bài theo state; không nhảy bài gây trùng.
- Khi hết bài hiện tại, cuộn từng nhịp; sau 16 vòng không có bài mới thì reload Bảng tin, giữ `pendingAIComment` và tiến độ, tối đa 10 lần.
- Khi `aiCount >= aiTarget`, đặt `isAICommenting=false`; không tạo thêm comment sau mốc target.

## 6. Đăng bài AI lên nhóm (`feed.js`)

1. Chỉ dùng các nhóm người dùng đã tích chọn; chuyển đúng `/groups/{id}/` và kiểm tra ID trước khi mở composer.
2. Gọi `aiGenerateGroupPost` với `{groupName}`; prompt phải tạo bài thảo luận tự nhiên, có thể có một câu hỏi nhưng **không** viết dạng Hỏi/Đáp và không tự trả lời.
3. Nếu bật nền: mở đúng “Phông nền”, chọn màu cố định hoặc random trong danh sách đã tích, chờ nền được xác nhận rồi mới nhập nội dung.
4. Nội dung nền phải một đoạn, không URL/hashtag/emoji/Markdown và nằm trong giới hạn ký tự; sau khi chọn nền phải nghỉ theo cấu hình.
5. Gõ từng ký tự, chờ nút Đăng khả dụng, nghỉ trước khi bấm. Chỉ chuyển nhóm sau khi Facebook xác nhận đăng.
6. Lỗi nền/nội dung được thử lại tối đa 3 lần tại **cùng nhóm**, không reload và không chuyển nhóm. Nếu fallback là `skip` thì bỏ qua nhóm; nếu `stop` thì dừng tại nhóm để kiểm tra.
7. State: `groupPostActive`, `groupPostIndex`, `groupPostDone`, `groupPostNextAt`, `groupPostPendingContent`, `groupPostPendingIndex`, `groupPostLastColor`.

## 7. Checklist kiểm thử sau khi sửa

1. Chạy `node --check feed.js`, `node --check content.js`, `node --check group.js`, `node --check background.js`, `node --check popup.js`.
2. Reload extension rồi reload Facebook; không đánh giá bản vá chỉ bằng content script cũ đang nằm trong tab.
3. Với Comment AI, test nhỏ trước (2–3 bài), sau đó mới test 20; kiểm tra log `Comment N`, bài bị bỏ qua và trạng thái cuối.
4. Xác nhận không có click vào Messenger, comment con, quảng cáo, Reels/Watch hoặc trang ngoài Bảng tin.
5. Xác nhận Dừng cắt được cả lúc đang delay, đang chờ Facebook render và đang tải API.
6. Với đăng nhóm, kiểm tra nền được xác nhận trước khi nhập, nội dung không có Hỏi/Đáp, và lỗi không chuyển nhóm sớm.
7. Không dùng một log “đã bấm” làm bằng chứng thành công; luôn kiểm tra state/DOM xác nhận tương ứng.

## Lịch sử logic quan trọng

- **v1.6.0:** chống comment trùng, bỏ quảng cáo, giới hạn đúng nguồn Bảng tin.
- **v1.6.1:** chỉ bấm nút Bình luận một lần khi composer tải chậm.
- **v1.6.2:** focus trực tiếp composer, tránh click nhầm Messenger.
- **v1.6.3:** timeout xác nhận 30 giây chuyển bài an toàn thay vì treo cả phiên; tự reload Bảng tin khi hết bài và tiếp tục tiến độ.
- **v1.6.4:** tách AI câu hỏi tham gia nhóm khỏi Comment AI; xác nhận tham gia chặt hơn, click tin cậy và giữ đúng trạng thái Dừng/Hết nhóm.
- **v1.6.5:** nhận diện cả nhãn “Truy cập” ngắn của Facebook khi xác nhận đã tham gia nhóm.
- **v1.6.6:** tách click khỏi bước chờ xác nhận để phản hồi chậm không làm bỏ qua nhóm; chờ dialog câu hỏi lâu hơn, xác nhận lại card theo URL sau khi Facebook thay DOM, dọn cờ chạy cũ sau tải lại khẩn cấp và chỉ tăng bộ đếm sau trạng thái thành công.
- **v1.6.7:** luồng Khám phá truyền đúng tên nhóm vào AI khi phải trả lời câu hỏi tham gia, vẫn dùng câu mẫu cho câu hỏi nội quy/đơn giản.
### v1.6.8
- Khi xác nhận nhóm, dùng nhãn chữ đang hiển thị trên nút trước, chỉ fallback sang `aria-label`; Facebook đôi lúc giữ `aria-label` “Tham gia nhóm …” sau khi đã đổi nút thành “Truy cập vào nhóm”.
- Chờ hộp câu hỏi tối đa khoảng 11 giây để không làm delay 5–15 giây bị kéo dài ở nhóm không có câu hỏi.
