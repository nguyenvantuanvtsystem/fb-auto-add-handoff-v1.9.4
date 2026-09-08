# FB Auto Tool — Logic handoff cho AI

Tài liệu này là bản mô tả hành vi cần giữ khi bảo trì dự án. AI tiếp quản phải đọc tài liệu này cùng `README.md` trước khi sửa code. Mỗi tính năng có state, nguồn dữ liệu và điều kiện thành công riêng; không dùng chung một bộ selector hoặc một cách xác nhận cho tất cả tính năng.

## Phiên bản và nguyên tắc chung

- Phiên bản hiện tại: **v1.9.40** (v1.6.3 là phiên bản đã test Comment AI 20/20).
- v1.9.40: B2 kiểm tra trạng thái thành viên của nhóm đích. Nếu Facebook hiển thị “Tham gia nhóm/Join group”, bỏ qua trước khi mở composer vì tài khoản chưa có quyền đăng; không coi việc mở/đóng composer là đã đăng.
- v1.9.39: Sau reload đồng bộ của B2, đọc lại cờ reload/run từ `chrome.storage.local` để tiếp tục đúng job thay vì lặp reload và đứng ở trạng thái chờ.
- v1.9.38: B2 kiểm tra cả trạng thái DOM/tên nhóm sau khi Facebook đổi URL; nếu URL đã đổi nhưng giao diện còn nhóm cũ, phiên tải lại đúng một lần rồi resume trước khi mở composer, tránh đăng nhầm nhóm hoặc báo proof sai.
- v1.9.37: Tất cả ô Prompt trong popup đều có khối hướng dẫn cho khách hàng; hướng dẫn phân biệt thảo luận, câu tương tác, hỏi–đáp và định dạng biến/đầu ra riêng của Comment AI, trả lời câu hỏi tham gia, Share, Đăng bán và Học nhóm.
- v1.9.36: B2 mặc định bật “Bắt buộc đăng ẩn danh” ở lần cấu hình đầu; thay đổi tích/bỏ tích được tự lưu trong `chrome.storage.sync.trendAnonymousMode` và giữ nguyên cho lần chạy sau.
- v1.9.35: B1 cho phép xóa thủ công từng bài hoặc các bài đã tích khỏi kho `trendLearnPosts`, có xác nhận và cập nhật bộ đếm/danh sách lựa chọn.
- v1.9.34: B2 Học nhóm cho phép tích bài học theo từng lượt hoặc lấy lần lượt bài còn lại; mỗi lượt tạo job riêng theo số bài mỗi nhóm, số nhóm và delay giữa từng bài. Bài học chỉ bị xóa sau proof đăng thành công, còn lỗi/bỏ qua thì vẫn giữ lại để chạy lại.
- B1 có thể xóa thủ công từng bài hoặc các bài đang tích khỏi `trendLearnPosts`; thao tác có xác nhận và cập nhật lại `trendLearnCount`/danh sách bài đã chọn.
- v1.9.33: B2 nhận cả nút submit Facebook hiển thị là “Gửi/Send” trong composer ẩn danh. Trước mọi lần chuyển nhóm, B2 đóng composer và xử lý hộp thoại bỏ bản nháp nếu còn mở, tránh điều hướng khi Facebook đang giữ draft gây cảnh báo native “Rời khỏi trang web?” và làm kẹt phiên.
- v1.9.32: các luồng đăng nhóm chụp prompt vào storage.local trước khi chạy và khóa ô prompt ở popup trong suốt phiên (Group Post, Share, Đăng bán, B2). Prompt sửa sau khi Start chỉ lưu cho phiên kế tiếp; Dừng/Hoàn tất mới mở khóa, tránh popup reload hoặc sửa prompt giữa chừng làm lệch phiên. Bổ sung hướng dẫn prompt ngay trong UI cho thảo luận, câu tương tác, hỏi–đáp, Share và đăng bán.
- v1.9.31: trước khi Group Post gõ nội dung, xóa và xác nhận bản nháp cũ trong composer bằng thao tác phím tin cậy + fallback DOM. Nếu Facebook giữ draft cũ thì dừng tại đúng nhóm, không nối hai bài làm vượt giới hạn ký tự và không bấm Đăng.
- v1.9.30: proof Đăng bài AI chấp nhận bài đã xuất hiện trong feed kèm thông báo rõ “đang chờ phê duyệt”/“pending review” dù Facebook render thông báo trong thẻ bài thay vì `role=status` hoặc `role=alert`, tránh dừng giả sau khi Facebook đã nhận bài.
- v1.9.29: Đăng bài nhóm và Học nhóm khi bật nền màu yêu cầu AI viết trong khoảng mục tiêu gần giới hạn (100 ký tự → 85–100, 125 → 110–125), giữ chủ đề + ý chính/góc nhìn + câu hỏi nếu còn chỗ. Nếu AI trả quá dài, gọi thêm một lượt nén hoàn chỉnh trước khi đăng; không còn cắt thẳng giữa câu, và nếu vẫn không đạt giới hạn thì bỏ qua/dừng an toàn.
- v1.9.28: khi Facebook thay DOM composer sau khi nhập/gửi, Comment AI tìm lại replacement theo scope và identity đúng bài, dọn draft lần hai trước mọi history/route/Stop/Reset; không dọn draft của bài khác.
- v1.9.27: Comment AI sở hữu riêng composer vừa nhập và dọn bản nháp bằng thao tác phím tin cậy trước mọi history/route/Stop/Reset. Chỉ đóng lớp phủ hoặc rời bài sau khi ô nhập thật sự rỗng; nếu Facebook không cho xóa draft thì dừng fail-closed, không chuyển bài và không hiện cảnh báo “Bạn chưa hoàn tất bình luận”.
- v1.9.26: sửa bộ chọn mode Xác nhận lời mời theo container heading thực tế của Facebook, loại link bạn chung để không nhận nhầm hồ sơ, tìm avatar dạng SVG `image[xlink:href]` theo đúng profile key trong cây cha của riêng thẻ lời mời, tách thống kê quét thành đạt/thiếu dữ liệu/không đạt, và chờ URL profile ổn định với tối đa một lần thử lại để tránh vòng lặp reload. Mỗi hồ sơ chỉ được mở đọc bổ sung một lần trong phiên; nếu sau lần đọc đó dữ liệu công khai vẫn thiếu và `skipUnknown=true`, hồ sơ phải được bỏ qua thay vì mở lặp vô hạn. Khi hết các card hiện có, luồng cuộn đúng scroll container của danh sách lời mời (neo theo nút xác nhận cuối), không chỉ cuộn `window`, để Facebook tải batch tiếp theo.
- v1.9.25: thêm mode Xác nhận lời mời kết bạn trên `/friends/requests` với state/history riêng `friendConfirm*`; có ô số bạn chung tối thiểu, số nhóm chung tối thiểu, từ khóa quê quán/trường học, yêu cầu ảnh đại diện và chính sách bỏ qua khi thiếu dữ liệu. Luồng chỉ đọc thông tin Facebook đang hiển thị công khai, có thể mở profile để đọc thêm, chỉ tăng bộ đếm sau proof “đã là bạn bè”, và không dùng lại state/selector/proof của luồng gửi lời mời.
- v1.9.24: B1 có bộ chọn nguồn học rõ ràng: theo link, theo danh sách nhóm nguồn đã chọn hoặc theo danh sách nhóm đích đã chọn; không còn suy luận ngầm từ checkbox cũ.
- v1.9.23: B2 không loại bài đã đăng khỏi proof chỉ vì bài đó có ô bình luận `contenteditable`; chỉ loại composer trong dialog, nên bài ẩn danh có nền được xác nhận đúng sau khi Facebook đưa vào feed.
- v1.9.22: B2 nhận diện composer Facebook đã chọn danh tính qua nút “Thành viên ẩn danh”/“Anonymous member” khi Facebook không render switch `role="switch"`; vẫn chỉ coi là xác nhận sau khi composer thuộc đúng nhóm và nhãn ẩn danh hiện diện.
- v1.9.21: B2 nhận diện cảnh báo giới hạn tần suất/spam của Facebook ngay sau khi bấm Đăng, kể cả khi Facebook render cảnh báo trong container không có role alert/status; phiên dừng và không tăng bộ đếm để tránh hiểu nhầm là đăng thành công.
- v1.9.20: link nhóm nguồn/đích là chế độ chỉ định trực tiếp. Khi ô link có dữ liệu, B1/B2 chỉ dùng các URL trong ô đó; khi ô link trống, mới dùng đúng các nhóm đã tích. UID số được giữ nguyên trong cấu hình và URL điều hướng.
- v1.9.19: kéo dài cửa sổ proof bài B2 từ 30 lên 60 giây để chờ feed Facebook chèn bài ẩn danh/nền chậm; tránh báo thất bại giả sau khi Facebook đã nhận lệnh đăng.
- v1.9.18: sửa click các nút màu trong bảng nền của B2 Học nhóm: thử native click trước khi dùng trusted mouse để Facebook cập nhật trạng thái nền sau animation; vẫn fail-closed nếu chưa có proof nền.
- v1.9.17: B2 Học nhóm có tùy chọn đăng kèm nền màu riêng: tắt để giữ text-only, chọn một màu cố định hoặc random trong các màu đã tích. Nền cố định chỉ được coi là thành công khi Facebook xác nhận đúng màu; Random chỉ chọn nền trơn thực tế, tránh lặp màu liền kề và không dùng gradient/hình minh họa. Nội dung được giới hạn tối đa 140 ký tự theo cấu hình để Facebook giữ nền; nếu không xác nhận được nền thì không nhập/không đăng nhóm đó.
- v1.9.16: B2 bắt buộc ẩn danh ưu tiên nút Facebook “Bài viết ẩn danh” khi nhóm cung cấp luồng composer riêng, xác nhận “Tạo bài viết ẩn danh” rồi mới kiểm tra switch và nhập bài; vẫn giữ fallback switch trong composer thường và không đăng công khai.
- v1.9.15: B1/B2 Học nhóm nhận thêm link nhóm theo từng dòng, vẫn giữ danh sách checkbox. Có thể ghi `URL | Tên nhóm` để truyền đúng tên hiển thị cho AI; link-only target sẽ mở nhóm thật rồi lấy tên Facebook trước khi AI tạo bài. Prompt B2 riêng được ghép với prompt viết lại và bắt buộc hỗ trợ `{groupName}`.
- v1.9.14: B2 Học nhóm có công tắc `trendAnonymousMode`/`trendAnonymousEnabled` để bắt buộc đăng ẩn danh. Trước khi nhập bài, `trend.js` phải tìm switch Facebook `Đăng ẩn danh` (`aria-checked=true`) và tự xác nhận hộp thoại công khai danh tính bằng nút OK nếu Facebook hiển thị; nhóm không có hoặc không xác nhận được switch bị bỏ qua, không fallback sang đăng công khai. Proof chờ duyệt rõ ràng được coi là terminal proof và vẫn giữ nhóm 8–12 giây.
- v1.9.13: bổ sung chờ riêng cho mọi luồng đăng nhóm (`feed.js`, `trend.js`, `share.js`, `sales.js`): đợi giao diện nhóm ổn định, đợi composer/editor thay DOM xong, sau cú bấm Đăng/Share chờ bài xuất hiện và giữ nhóm 8–12 giây trước khi điều hướng. Nếu đã gửi nhưng chưa thấy bài, phiên dừng tại nhóm và không tự bấm lại; các mốc `submit-*`/`waiting-visible` được lưu để reload không gây đăng trùng.
- v1.9.12: sửa chẩn đoán B1 không tự đánh dấu node “đã học” trước khi gọi parser; kết quả parse/loại bài phản ánh đúng DOM thực tế.
- v1.9.11: tiếp tục sửa B1 Học nhóm: `data-ad-preview="message"` là node chữ của bài thường trên Facebook, không được coi là quảng cáo; chỉ loại marker quảng cáo rõ ràng hoặc nhãn “Được tài trợ/Sponsored”.
- v1.9.10: sửa B1 Học nhóm theo DOM feed hiện tại của Facebook: bài viết chính thường là node con trực tiếp của `div[role="feed"]`, còn `div[role="article"]` là comment/reply; parser nhận diện post bằng nút hành động của bài, dùng fallback `textContent` khi `innerText` rỗng, vẫn loại chat/sponsored và lưu bài sau khi parse thành công. Popup ưu tiên tab Facebook đang active ở mọi cửa sổ để chẩn đoán/quét nhóm không bị gửi nhầm vào cửa sổ popup.
- v1.9.9: thêm tab Học nhóm (`trend.js`, state `trendLearn*`/`trendPost*` riêng). Tích nhóm nguồn từ danh sách `joinedGroups` có sẵn để cào bài mới nhất (tối đa 300 bài, `sorting_setting=CHRONOLOGICAL`), lưu `trendLearnPosts`, AI đọc bài đã lưu và viết thành bài của mình theo dàn ý (`aiRewriteTrend` + prompt `{groupName}`), rồi chọn nhóm đích để đăng text-only với proof dialog đóng. Không dùng chung selector/counter/proof của Cào bài/Đăng bán/Share.
- v1.9.8: Tab Đăng bán có prompt tùy chỉnh đã lưu và Chat AI riêng dùng cấu hình API chung; người dùng có thể gửi yêu cầu, duyệt từng phản hồi rồi chọn các bài hợp lý. Bài đã chọn được truyền qua `acceptedChatPosts` và dùng lần lượt cho các nhóm đầu tiên; nhóm còn lại vẫn sinh biến thể riêng, không tự dùng phản hồi chưa được duyệt.
- v1.9.7: Đăng bán tính cả ô `+N` của lưới media Facebook và số file trong input khi xác nhận tệp đã nhận; sau khi media làm Facebook thay composer, luồng focus lại editor hiện tại, thử nhập tin cậy rồi thay nội dung DOM có xác nhận. Nếu vẫn không có nội dung/media proof, phiên dừng tại đúng nhóm thay vì âm thầm chuyển nhóm.
- v1.9.6: Đăng bán cho phép chọn nhiều ảnh và video cùng lúc; lưu mảng media trong `chrome.storage.local.salesPostMedia` (vẫn đọc dữ liệu một file cũ), gửi toàn bộ file vào một input Facebook và chỉ coi media thành công khi đủ thumbnail/tên file được Facebook hiển thị. Sau khi Facebook thay dialog/contenteditable vì nhận media, luồng phải tìm lại composer hiện tại trước khi nhập nội dung và gửi.
- v1.9.5: thêm tab Đăng bài bán hàng bằng AI và state machine riêng trong `sales.js`. Luồng này chọn nhóm đã tham gia, media tùy chọn, prompt biến thể theo nhóm và hồ sơ văn phong; dùng chung cấu hình AI nhưng không dùng selector, counter, stop hay proof của Comment AI/Đăng nhóm/Share.
- v1.9.4: sửa đường dự phòng Comment AI/Tương tác nhóm khi API lỗi hoặc dùng economy `max`; Start của mọi luồng lưu state trước điều hướng, popup cào bài chuẩn hóa alias host Facebook và Reset hoạt động cả khi tab không còn ở Facebook; Tương tác nhóm/Đăng bài nhóm dùng `runId` riêng để chặn phiên cũ ghi đè hoặc bấm tiếp sau Stop/Start mới. Đăng bài nhóm lưu `submit-armed`/`submit-dispatched` và chỉ coi dialog đóng hoặc tín hiệu đăng/chờ duyệt rõ ràng là thành công, không retry cú bấm Đăng mơ hồ; nền màu chỉ xác nhận khi có trạng thái đã chọn hoặc style nền thật.
- v1.9.3: quy tắc DỪNG BẰNG MỌI GIÁ. Nút Dừng/Reset gửi tới TẤT CẢ tab Facebook và ghi cờ dừng trực tiếp (không phụ thuộc message tới tay); resume sau reload chỉ chạy trên đúng tab sở hữu (`ownerTabId`) và chỉ khi cờ chạy còn bật; mọi chờ dài đều kiểm tra cờ theo nhịp ngắn; kiểm tra dừng lần cuối ngay trước mọi hành động không đảo ngược (gửi comment/đăng bài/share/join/mời kết bạn).
- v1.9.2: quy tắc chung cho mọi nút Bắt đầu — persist phiên (active/config/counter) TRƯỚC khi chuyển trang/gửi lệnh nên tab tự resume đúng nhiệm vụ sau mọi điều hướng/reload/gửi hụt mà không cần bấm lại; gửi thất bại chỉ báo lỗi khi cờ chạy đã tắt, cờ còn bật nghĩa là phiên đang tự chạy. Đăng bài nhóm có thêm nút Reset; resume nhóm tự quay lại đúng nhóm khi lạc route; resume cào bài sửa lỗi không đọc `scrapeRunSourceUrl`.
- v1.9.1: chống ký tự lỗi U+FFFD/surrogate lẻ cuối comment (emoji bị chẻ đôi khiến Facebook từ chối bài). `trustedInput` gõ theo code-point thay vì UTF-16 unit; mọi `slice` giới hạn ký tự dùng `sliceByCodePoints`; `sanitizePostedText`/`sanitizeCommentOutput` loại U+FFFD và surrogate lẻ ở background (comment, caption share, bài nền) và chốt ở feed trước khi đăng.
- v1.9.0: đa ngôn ngữ Việt/Anh. `i18n.js` là từ điển + `t()` dùng chung cho popup, mọi content script và background (service worker nạp qua `importScripts`); chọn ngôn ngữ ở header popup, lưu `chrome.storage.sync.uiLang`. Chuỗi Facebook (selector/regex nhận diện UI, nhãn nút) KHÔNG được dịch — chỉ dịch text do extension hiển thị. Prompt AI mặc định và câu trả lời mẫu theo đúng ngôn ngữ UI; regex phân loại lỗi (skip nhóm, preview, duplicate) khớp cả hai ngôn ngữ; mã `code:"join-busy"` thay cho so khớp text. Thêm ngôn ngữ mới chỉ cần thêm block `Object.assign(I18N.xx, ...)`.
- v1.8.35: Comment AI Bảng tin tìm lại đúng bài theo định danh khi node bị Bảng tin thay mới trong lúc chờ AI (không bỏ qua lặng lẽ), `postAIComment` cũng tự phục hồi bài ở cửa vào; đã bấm Bình luận thì chờ ô nhập không giới hạn kèm đếm số giây đang chờ, không bấm lần hai và không chuyển bài.
- v1.8.34: tham gia nhóm theo từ khóa lưu `groupJoinRunConfig` trước khi chuyển trang nên tab tự resume đúng từ khóa sau mọi điều hướng/reload/gửi lệnh thất bại mà không cần bấm Start lại, giữ nguyên bộ đếm đã tham gia; đổi từ khóa giữa chừng bị chặn cho tới khi Dừng; Dừng/Reset xóa phiên ngay cả khi không với tới tab.
- v1.8.33: route trang tìm nhóm so cả query `q` — tab đang ở từ khóa cũ vẫn bị coi là sai route và tự chuyển sang từ khóa mới; mở popup tự về đúng panel của phiên đang chạy (Share > Nhóm > Bản tin & AI > Cào bài > Kết bạn), không có phiên chạy thì mở lại tab lần trước (`popupLastTab`), popup không tự đóng.
- v1.8.32: Comment AI trong tương tác nhóm đếm lý do bỏ qua từng bài (`groupInteractAiSkipped`: bài ngắn/đã xử lý/đã có comment/không nút BL/không thấy ô nhập/gửi chưa xác minh/lạc trang) và hiển thị trong status; nút Bình luận làm lạc trang thì khóa bài rồi tự quay lại nhóm; chờ ô nhập vẫn nhận ô mới ngay cả khi bài đã rời DOM.
- v1.8.31: mọi nút Bắt đầu đều chuyển trạng thái “đang chạy” (⏳ + class `running`) ngay khi bấm; Tương tác nhóm/Đăng nhóm/Share có helper riêng (`setGroupInteractRunning/setGroupPostRunning/setGroupShareRunning`) nối với cờ `groupInteractActive/groupPostActive/groupShareActive` để tự bật lại khi mở popup và tự tắt khi dừng/hoàn tất/lỗi.
- v1.8.30: mọi nút Bắt đầu đều đưa tab về đúng route nhiệm vụ dù đang ở trang nào (`ensureTaskTab`/`isPopupMainFeedUrl` trong `popup.js`); Tương tác bản tin chỉ chạy trên Bảng tin chính, sai route thì lưu `pendingFeedInteract` rồi về `/` trước khi chạy.
- v1.8.29: Tương tác nhóm có `groupInteractTargetGroups` (số nhóm đầu theo thứ tự đã tích) và checkbox `groupInteractAiComment`; khi bật, mỗi bài đã thả cảm xúc được comment AI bằng cấu hình chung + hồ sơ văn phong, có lịch sử/guard riêng `groupInteractCommentHistory/Guard/AiDone`, fallback câu mẫu khi API lỗi.
- v1.8.28: Đăng bài AI ở chế độ Random gom các nền trơn Facebook thực sự cung cấp rồi chọn ngẫu nhiên; nếu màu ưu tiên không có thì không còn rơi cố định vào màu đầu tiên, đồng thời tránh lặp màu vừa dùng khi còn lựa chọn.
- v1.8.27: Đăng bài AI ở chế độ Random chỉ khớp nền trơn; loại gradient/hình minh họa khỏi bộ màu, và fallback cũng chọn ngẫu nhiên nền trơn thay vì luôn lấy nút đầu tiên.
- v1.8.26: nhận diện dialog tham gia nhóm mới có tiêu đề “Trả lời câu hỏi”/thông báo yêu cầu đang chờ phê duyệt; tự tích checkbox trong dialog, xác nhận lựa chọn và chờ nút Gửi được bật trước khi gửi.
- v1.8.25: Sau khi xoá URL chữ, chờ card dựng lại tối đa 8 giây; xác nhận card được giữ bằng permalink/media hoặc overlap ảnh/meta/profile của card trước đó, tránh dừng nhầm vì Facebook thay DOM.
- v1.8.24: Share bài fail-closed theo đúng permalink hoặc media ID đã đọc từ bài nguồn. Không chấp nhận preview đang tải hoặc card chỉ trỏ tới profile; ghi lại lý do/links/ảnh quan sát được và không bấm Đăng nếu chưa xác nhận đúng bài.
- v1.8.23: Share bài đọc đúng bài chính trong modal Facebook, có khung nội dung/chat AI theo từng link và xoá URL chữ sau khi link-preview đã được dựng trước khi đăng.
- v1.8.22: thêm tab Share bài và file `share.js` với state `groupShare*` riêng. Tiện ích đọc đúng article từ link bài gốc, tạo lời dẫn AI khác nhau theo `{postText}` + `{groupName}`, mở đúng nhóm và chỉ bấm Đăng khi Facebook đã dựng link preview.
- v1.8.21: Đăng bài AI có `groupPostTargetGroups` (số nhóm xử lý theo thứ tự đã tích) và `groupPostInterDelay` (delay cố định giữa các nhóm, 5–3600 giây). Delay chỉ bắt đầu sau khi nhóm trước đã được xác nhận đăng hoặc bỏ qua.
- v1.8.20: đầu file TXT ghi `Nguon cao`, tiêu đề nguồn và số bài; trạng thái hoàn tất cũng hiển thị nguồn để dễ phát hiện phiên Bảng tin bị dùng nhầm.
- v1.8.19: loại các `role="article"` thuộc khung Messenger bằng dấu hiệu tin nhắn/ô nhập, không gán fallback tác giả thành Đốc Tờ Hoè và chỉ nhận thời gian theo mẫu Facebook hợp lệ.
- v1.8.18: khi nhập URL nguồn, popup đối chiếu URL thực tế sau điều hướng và content script kiểm tra lại trước khi cào; nếu Facebook redirect về Bảng tin/nguồn khác thì dọn dữ liệu cũ và không bắt đầu phiên.
- v1.8.17: file xuất có tên nguồn + timestamp riêng, kiểm tra dữ liệu thuộc đúng URL đang mở và từ chối tải nếu phát hiện dữ liệu từ nguồn khác; tránh mở nhầm file cào cũ.
- v1.8.16: phiên cào có `runSerial` và `scrapeRunSourceUrl`; phiên khôi phục chỉ được tiếp tục trên đúng nguồn, cờ treo từ nguồn cũ bị dọn để không tải nhầm dữ liệu profile/page trước đó.
- v1.8.15: bộ lọc cào bài loại article lồng trong bài chính (comment/reply), bỏ comment con khi bóc text và chỉ lưu nội dung bài viết chính.
- v1.8.14: sửa kiểm tra URL nguồn cào; chấp nhận đúng mọi hostname Facebook (`facebook.com`, `www.facebook.com`, `m.facebook.com` và subdomain hợp lệ), không còn từ chối URL profile hợp lệ như `/giapducthang20.10`.
- v1.8.13: thêm nguồn cào tùy chọn theo URL Profile/Fanpage/nhóm, bỏ qua bài được tài trợ, lưu tối đa 500 bài đã chuẩn hóa trong `chrome.storage.local.scrapePosts`, và tạo hồ sơ kiến thức/văn phong dùng chung cho Comment AI và Đăng bài AI. Hồ sơ ưu tiên API đã cấu hình nhưng luôn có heuristic cục bộ khi thiếu key, hết quota hoặc lỗi mạng; không sao chép nguyên văn/giả mạo danh tính.
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
| `i18n.js` | Từ điển Việt/Anh + `t()` dùng chung cho popup, mọi content script và background |
| `content.js` | Kết bạn và quét nhóm đã tham gia |
| `group.js` | Tham gia nhóm theo từ khóa/Khám phá, câu hỏi tham gia bằng AI |
| `feed.js` | Like/cảm xúc bản tin, tương tác nhóm, comment AI, đăng bài AI lên nhóm |
| `share.js` | Đọc bài nguồn và share lời dẫn AI + link-preview vào đúng nhóm |
| `sales.js` | Đăng bài bán hàng AI vào nhóm đã chọn, media tùy chọn và xác nhận gửi riêng |
| `trend.js` | Học bài mới nhất nhóm nguồn đã tích, AI viết lại theo dàn ý, đăng nhóm đích |
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
- Nếu API lỗi hoặc hết quota, comment dùng câu mẫu dự phòng; đăng bài nhóm và Share bài phải báo lỗi theo chính sách riêng, không tạo vòng lặp vô hạn. Share bài không dùng một lời dẫn chung để thay thế vì sẽ làm các nhóm bị trùng nội dung.

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

### Mode Xác nhận lời mời (`confirm`)

1. Chỉ chạy trên `/friends/requests`; chỉ lấy nút “Xác nhận/Chấp nhận/Confirm/Accept” trong thẻ lời mời có link hồ sơ, không lấy nút trong dialog/menu. Facebook có thể đặt danh sách lời mời ngoài `role="main"`, vì vậy selector phải tìm container theo heading “Lời mời kết bạn” và không được chọn link của bạn chung trong bảng/aria-label “bạn chung”.
2. Bộ lọc riêng trong `config.confirmFilters`: `minMutual`, `minCommonGroups`, `hometown`, `school`, `requirePhoto`, `skipUnknown`. Bộ lọc số dùng ô nhập; `0` nghĩa là tắt. Khi thiếu dữ liệu và `skipUnknown=true`, hồ sơ được bỏ qua, không tự coi là đạt.
3. Nếu bộ lọc cần thêm dữ liệu, luồng có thể mở đúng profile đúng một lần trong mỗi phiên, đọc text công khai, lưu lại các bằng chứng dạng số/boolean trong state rồi quay lại danh sách; không lưu nguyên văn hồ sơ vào log/handoff. State chỉ giữ URL/profile key tạm thời để resume đúng hồ sơ. Có bản ghi trong `profileEvidenceByKey` nghĩa là đã kiểm tra, kể cả khi các giá trị vẫn là `null`; với `skipUnknown=true`, hồ sơ đó được bỏ qua và không mở lại.
4. State riêng: `friendConfirmRunState`, `friendConfirmActive`, `friendConfirmAccepted`, `friendConfirmSkipped`, `friendConfirmUncertain`, `friendConfirmStatus`, `friendConfirmHistory`. `stage`, `pendingProfile` và `profileEvidenceByKey` bảo vệ reload giữa lúc đọc profile.
5. Trước cú bấm phải kiểm tra active/runId; sau cú bấm chỉ tăng `friendConfirmAccepted` khi nút/card chuyển sang “Bạn bè/Friends” hoặc Facebook đưa thông báo xác nhận rõ ràng. Trạng thái mơ hồ ghi `uncertain` và không retry.
6. Khi các card đang render đều đã xử lý, dùng nút xác nhận cuối làm neo để tìm ancestor có `overflow-y` cuộn được, cuộn chính container đó rồi mới tính một vòng chờ tải thêm; chỉ fallback sang `window` nếu trang không có scroll container riêng.

### Lịch sử, dừng và giới hạn

- State chính: `friendRunState`, `sentCount`, `friendProfileHistory`, `friendSkipped`, `friendUncertain`, `isRunning`.
- `friendProfileHistory` chống gửi trùng qua reload; trạng thái `uncertain` chỉ tồn tại tối đa 24 giờ.
- Nút Dừng đặt `active=false`, content script phải thoát ở điểm chờ tiếp theo. Không cộng lời mời chưa xác nhận.
- Khi Facebook báo giới hạn/chặn/xác minh, dừng an toàn và hiển thị cảnh báo; không cố vượt giới hạn.

### Theo bộ lọc tìm kiếm

Giao diện hiện tại có ba mode trên nhưng chưa có mode tìm kiếm riêng. Không tự coi trang `/search` là nguồn kết bạn; muốn bổ sung mode tìm kiếm phải tạo selector, state và điều kiện xác nhận riêng, sau đó cập nhật tài liệu này.

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

- Có thể cào nguồn đang mở hoặc nhập URL Facebook của Profile, Fanpage hay nhóm; chỉ dùng nội dung công khai mà tài khoản có quyền xem.
- Mở rộng “Xem thêm”, đọc bài viết ngoài vùng comment, loại trùng, bỏ bài có dấu hiệu Được tài trợ/Quảng cáo (có thể tắt tùy chọn), và lưu tối đa 500 bài đã chuẩn hóa trong `chrome.storage.local.scrapePosts` để tạo hồ sơ hoặc xuất file.
- Cuộn từng nhịp để Facebook render; khi chiều cao không tăng nhiều vòng liên tiếp thì kết thúc với số bài thực tế, không tự bịa đủ target.
- State: `isScraping`, `scrapeTarget`, `scrapeCount`, `scrapeReady`, `scrapeHasData`, `scrapePosts`.
- Chỉ cho tải MD/TXT/JSON khi `scrapeReady=true`; Reset xóa trạng thái sẵn sàng nhưng không xóa file người dùng đã tải.

### Hồ sơ kiến thức & văn phong

- Popup tạo hồ sơ từ ít nhất 3 bài đã cào. API AI (provider/key/model/Custom URL dùng chung) được gọi một lần để rút ra chủ đề, thuật ngữ, giọng điệu, cấu trúc câu và ví dụ ngắn; nếu API lỗi thì dùng hồ sơ heuristic cục bộ.
- Hồ sơ lưu trong `chrome.storage.local.styleProfiles`; `activeStyleProfileId` là hồ sơ đang dùng. Chọn “Không dùng hồ sơ” để tắt ảnh hưởng tới nội dung mới.
- `background.js` chỉ truyền hồ sơ tổng quát vào prompt của Comment AI, Đăng bài AI và lời dẫn Share bài; không dùng để nhận diện/giả mạo người khác và không đưa toàn bộ bài cào vào mỗi request.

## 4. Tương tác bản tin / cảm xúc (`feed.js`)

- Chỉ chạy trên `/` hoặc `/home.php`.
- `findFeedPosts()` lấy nút Like của bài gốc, tìm container có permalink + Like + Comment; loại Reels/Watch và bài có dấu hiệu quảng cáo.
- Like dùng click tin cậy và xác nhận nhãn/trạng thái đổi. Cảm xúc random chọn một trong Like/Love/Haha/Wow/Sad/Angry, mở picker rồi xác nhận đúng nhãn.
- Đánh dấu `data-feed-interacted="1"`, chờ delay Min–Max trước bài tiếp theo. Không thao tác nút Like trong comment con.
- Nếu DOM bị recycle, bỏ qua node cũ và tìm lại; không bấm lại một bài đã đánh dấu.
- Tương tác nhóm đã tham gia (`groupInteract*` trong `feed.js`): mở N nhóm đầu theo thứ tự đã tích (`groupInteractTargetGroups`), mỗi nhóm thả cảm xúc đúng `perGroup` bài với delay Min–Max. Khi bật `groupInteractAiComment`, mỗi bài đã react thành công được comment AI 1 lần bằng `aiGenerateComment` chung + `fallbackComment` khi lỗi; dùng `groupInteractPostAIComment()` riêng cho route nhóm (bấm 1 lần, chờ ô ≤12s, gõ trustedInput, gửi 1 lần, verify proof 30s ngoài editor), lịch sử/guard/counter riêng `groupInteractCommentHistory/Guard/AiDone`, không dùng chung `aiCommentHistory` của Bảng tin. Bỏ qua bài <15 ký tự, đã history, đã có comment của chính tài khoản; `unconfirmed-skip` vẫn khóa bài chống trùng.

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
- Mọi text đăng lên Facebook phải qua `sanitizePostedText`/`sanitizeCommentOutput` (loại U+FFFD và surrogate lẻ), gõ và cắt chuỗi theo code-point (`[...text]`, `sliceByCodePoints`), không bao giờ index/cắt theo UTF-16 unit — nếu không emoji cuối câu vỡ thành ký tự lỗi và Facebook từ chối bài.
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
2a. Prompt Group Post bắt buộc có {groupName}; người dùng có thể yêu cầu hướng thảo luận, câu tương tác hoặc hỏi–đáp, nhưng phải yêu cầu AI bám tên nhóm và chỉ trả về nội dung bài. Prompt được snapshot vào groupPostConfig.prompt trước khi chạy; popup khóa ô prompt trong phiên hiện tại và chỉ áp dụng thay đổi cho lượt sau.
4. Nếu bật nền: mở đúng “Phông nền”, chọn màu cố định hoặc random trong danh sách đã tích, chờ nền được xác nhận rồi mới nhập nội dung.
4. Nội dung nền phải một đoạn, không URL/hashtag/emoji/Markdown và nằm trong giới hạn ký tự; sau khi chọn nền phải nghỉ theo cấu hình.
5. Chờ giao diện nhóm ổn định tối đa 45 giây, chờ composer/editor ổn định tối đa 45 giây. Gõ từng ký tự, chờ nút Đăng khả dụng, nghỉ trước khi bấm. Sau xác nhận, chờ bài xuất hiện tối đa 30 giây và giữ nhóm thêm 8–12 giây rồi mới chuyển nhóm.
6. Lỗi nền/nội dung được thử lại tối đa 3 lần tại **cùng nhóm**, không reload và không chuyển nhóm. Nếu fallback là `skip` thì bỏ qua nhóm; nếu `stop` thì dừng tại nhóm để kiểm tra.
7. State: `groupPostActive`, `groupPostIndex`, `groupPostDone`, `groupPostNextAt`, `groupPostPendingContent`, `groupPostPendingIndex`, `groupPostLastColor`.
8. Chỉ xử lý N nhóm đầu theo thứ tự đã tích (`groupPostTargetGroups`), nghỉ `groupPostInterDelay` cố định giữa các nhóm; nút Reset (`groupPostResetBtn`) xóa tiến trình nhưng giữ danh sách nhóm và cấu hình. Các stage `submit-armed`/`submit-dispatched`/`waiting-visible`/`post-visible` đều dừng an toàn khi reload giữa chừng.

## 7. Share bài vào nhóm (`share.js`)

1. Chỉ nhận URL của một bài Facebook cụ thể; từ chối trang chủ, profile, trang nhóm chung và hostname giả dạng Facebook.
2. State chạy riêng: `groupShareActive`, `groupShareConfig`, `groupShareRunId`, `groupShareOwnerTabId`, `groupShareStage`, `groupShareSourceText`, `groupShareSourceKey`, `groupShareIndex`, `groupShareDone`, `groupShareSkipped`, `groupShareNextAt`, `groupSharePendingCaption`, `groupShareRecentCaptions`; bản nháp nguồn/chat nằm ở `groupShareSourceDraft*` và `groupShareAiChatMessages` theo URL.
3. Chỉ tab sở hữu `groupShareOwnerTabId` được khôi phục phiên qua điều hướng/reload. Mọi điểm chờ phải kiểm tra `active + runId + index` trước khi thao tác tiếp.
4. Giai đoạn nguồn mở đúng link, nhận cả modal “Bài viết của…”, tìm message bài chính theo permalink, mở “Xem thêm”, loại comment/reply/bài nhúng và lưu tối đa 4.000 ký tự. Không đọc được bài thì dừng; người dùng có thể dán nội dung thủ công vào khung AI.
5. Khung Chat AI dùng cấu hình API chung, lưu `groupShareAiChatMessages` theo link và hiển thị trạng thái xử lý/phản hồi. Mỗi nhóm gọi `aiGenerateGroupShareCaption` với `{postText}`, `{groupName}` và cuộc chat gần nhất; lời dẫn được làm sạch URL/hashtag/Markdown và không được trùng lời dẫn nhóm trước.
6. Chuyển nhóm theo ID/URL đã tích chọn, chỉ fallback sang tiêu đề nhóm khớp chính xác. Không khớp thì điều hướng lại, không mở composer ở trang sai.
7. Share được thực hiện bằng composer của nhóm: nhập `lời dẫn + link bài gốc` để Facebook dựng preview, sau đó xoá riêng URL chữ trong contenteditable và kiểm tra URL không còn ở phần văn bản. Chỉ cho bấm Đăng khi thẻ link-preview vẫn còn; xoá URL thất bại thì dừng trước cú gửi.
8. Chờ giao diện nhóm tối đa 45 giây và composer tối đa 45 giây. Nút Đăng chỉ bấm một lần. Trước bấm lưu `groupShareStage=submit-armed`; sau bấm lưu `groupShareSubmitDispatchedAt`. Nếu không có xác nhận hoặc bài chưa hiện sau tối đa 30 giây thì dừng `submitted-unconfirmed` và tuyệt đối không tự bấm lại.
9. Chỉ tăng `groupShareDone` khi Facebook đóng/làm trống composer sau khi nhận lệnh hoặc có thông báo thành công/chờ duyệt và bài đã được nhìn thấy trong vùng nhóm. Sau đó giữ nhóm 8–12 giây; `groupShareNextAt` là mốc tuyệt đối để reload vẫn giữ phần delay còn lại.
10. Dừng/Reset không xóa link, prompt, danh sách nhóm và cấu hình AI đã lưu. Share bài không được chạy đồng thời với đăng bài nhóm, comment, tương tác, tham gia nhóm, kết bạn hoặc cào bài trên cùng tab.

## 8. Đăng bài bán hàng bằng AI (`sales.js`)

1. Tab Đăng bán có UI và state prefix `salesPost*` riêng: `salesPostActive`, `salesPostRunId`, `salesPostOwnerTabId`, `salesPostConfig`, `salesPostIndex`, `salesPostDone`, `salesPostSkipped`, `salesPostTotal`, `salesPostNextAt`, `salesPostPendingContent`, `salesPostPendingIndex`, `salesPostStatus`. Chat duyệt bài dùng state riêng `salesAiChatMessages`, `salesAiChatAcceptedPosts`, `salesAiChatContextKey`, `salesAiChatActivity`, không dùng transcript/state của Share bài.
2. Popup lưu nguồn sản phẩm, ghi chú, prompt, số nhóm, delay và hồ sơ văn phong trong `chrome.storage.sync`; media tùy chọn lưu dạng mảng ở `chrome.storage.local.salesPostMedia` (tương thích object đơn của bản cũ), mỗi file tối đa 35 MB. API key không được ghi vào state chạy.
3. Chỉ lấy các nhóm đã tích chọn từ danh sách `scanJoinedGroups`, lọc từ khóa chỉ ảnh hưởng hiển thị; thứ tự chạy là thứ tự danh sách đã tích và giới hạn bởi `salesPostTargetGroups`.
4. Trước khi chạy, nút Preview/Test API chỉ gọi AI và không đăng. Prompt thay thế `{groupName}`, `{sourceText}`, `{productInfo}`; background tạo biến thể khác nhau cho từng nhóm, có thể thêm hồ sơ văn phong tổng quát đã chọn.
5. Trong `sales.js`, route/nhóm được đối chiếu trước khi mở composer. Composer, input media, contenteditable và nút Đăng luôn được tìm lại sau render (đặc biệt ngay sau khi gắn media); toàn bộ ảnh/video được nạp cùng một lần qua `DataTransfer`, và media chỉ được coi là gắn thành công khi Facebook hiện đủ thumbnail/media hoặc tên file tương ứng.
6. Nội dung được gõ bằng `trustedInput`, làm sạch URL/hashtag/Markdown/nhãn AI, rồi chờ nút Đăng khả dụng. Chờ nhóm/composer tối đa 45 giây, media tối đa 45 giây và nút Đăng tối đa 30 giây. Chỉ tăng `salesPostDone` khi dialog đóng hoặc Facebook đưa tín hiệu đăng/chờ duyệt, bài đã hiện và đã giữ nhóm 8–12 giây; lỗi nhóm thông thường tăng `salesPostSkipped` và chuyển tiếp sau khi ghi rõ lý do.
7. Mỗi nhóm có tối đa hai lần thử tại chính nhóm đó; nếu lần thử trước lỗi trước cú bấm Đăng, composer phải được đóng và mở lại sạch để không gắn media trùng. Lỗi toàn vẹn (Facebook chưa xác nhận đủ media, composer bị thay nhưng không có editor, hoặc nội dung không xuất hiện trong editor) sẽ dừng tại đúng nhóm sau các lần thử, không được âm thầm chuyển nhóm. Sau khi đã bấm Đăng mà không có proof hoặc bài chưa hiện sau tối đa 30 giây, phiên dừng tại nhóm để kiểm tra và không retry. Stage `salesPostStage` cùng `salesPostSubmitIndex` bảo vệ reload. Sau thành công/bỏ qua, `salesPostNextAt` giữ delay tuyệt đối trước nhóm tiếp theo; reload chỉ resume đúng run ID và tab sở hữu. Stop/Reset dừng chờ, xóa pending state phù hợp và không xóa prompt, nhóm hay media.
8. Luồng không tự đăng vào profile/fanpage, không xử lý comment/reply/Messenger. Khi người dùng muốn chạy thật phải kiểm tra đúng nhóm, nội dung và media trước cú bấm Đăng.

## 8b. Học bài nhóm nguồn và viết lại (`trend.js`, v1.9.17)

1. Tab Học nhóm dùng lại danh sách `joinedGroups` đã tải ở các tính năng khác; có nút tải lại riêng nhưng không quét song song khi luồng khác đang chạy. B1 có bộ chọn `trendLearnSourceMode` với ba chế độ độc lập: `links` học đúng các link trong `trendSourceLinks`, `source-selected` học đúng các nhóm được tích trong danh sách nguồn, `target-selected` học đúng các nhóm đích đã tích/nhập ở B2. B2 vẫn có `trendTargetLinks`: mỗi dòng là một URL `/groups/{id-or-slug}`; định dạng `URL | Tên nhóm` là tùy chọn để cung cấp tên hiển thị chính xác. Chế độ link không có link sẽ báo lỗi cấu hình, không tự rơi sang danh sách checkbox.
2. B1 — Học bài: tích nhóm nguồn, chọn số bài mới nhất mỗi nhóm (1–30, mặc định 10). State `trendLearnActive/RunId/OwnerTabId/Config/Index/Posts/Count/Ready` trong `chrome.storage.local`; prompt/config lưu `chrome.storage.sync`. Tab tự mở từng nhóm nguồn với `sorting_setting=CHRONOLOGICAL`, ưu tiên node con trực tiếp của `div[role="feed"]` có nút `Viết bình luận`/`Gửi nội dung này...` (và chỉ dùng `div[role=article]` khi có cùng dấu hiệu), đánh dấu `data-trend-learned` sau khi parse, bỏ sponsored/comment/bài <20 ký tự, lưu tối đa 300 bài vào `trendLearnPosts`. Chỉ bóc trong `div[role="main"]`, loại `[role=dialog/menu/complementary/navigation/banner]`, khung Messenger/chat (regex `Tin nhắn do/Mở đoạn chat/hoạt động gần nhất/...` kế thừa từ `scrape.js`) — không bao giờ lấy tin nhắn chat làm bài học. Bộ đọc dùng `innerText` và fallback `textContent` để chịu được Facebook render text ẩn trong SPA.
3. Viết lại: popup ghép bài đã lưu thành `sourceText` (tối đa 12 bài) rồi gọi `background.js:aiRewriteTrend` với `{groupName}` + hồ sơ văn phong chung. `trendPrompt` là prompt nền; `trendGroupPrompt` là prompt B2 riêng theo group name và được ghép thêm cho từng nhóm. AI chỉ học dàn ý/góc nhìn rồi viết thành bài của mình, không copy nguyên văn, không bịa số liệu. Nút "Viết lại" chỉ preview 1 bản; nút Đăng mới sinh biến thể riêng cho từng nhóm đích.
4. B2 — Đăng: chọn nhóm đích hoặc nhập link đích, giới hạn số nhóm + delay. Khi `trendTargetLinks` có dữ liệu, chỉ các link trong đó được chạy; khi ô link trống, chỉ checkbox được tích được chạy. State `trendPostActive/RunId/OwnerTabId/Config/Index/Done/Skipped/NextAt/LastColor` riêng, stage submit riêng, chờ giao diện nhóm/composer tối đa 45 giây, chờ bài hiển thị tối đa 30 giây và giữ nhóm 8–12 giây trước khi chuyển. Với link-only không có tên sau dấu `|`, `trend.js` lấy heading/tên trang Facebook sau khi vào nhóm rồi mới gọi AI bằng `sourceText + prompt + styleProfileId` lưu trong `trendPostConfig`, tránh gửi slug/ID giả làm `{groupName}`. Công tắc **Bắt buộc đăng ẩn danh** lưu ở `chrome.storage.sync.trendAnonymousMode`, truyền vào `trendPostConfig.anonymousMode`; khi bật, `trend.js` phải xác nhận switch `Đăng ẩn danh` của đúng composer trước khi gõ và xác nhận thêm hộp thoại “Bài viết ẩn danh”/OK nếu Facebook yêu cầu. Nhóm không hỗ trợ hoặc switch không chuyển sang `aria-checked=true` được bỏ qua an toàn, không đăng thường. Công tắc **Đăng kèm nền màu** lưu `trendBackgroundEnabled/Mode/FixedColor/Colors/MaxChars` trong `chrome.storage.sync` và truyền vào `trendPostConfig.background`; `fixed` chỉ chấp nhận đúng nền cố định, `random` chọn một màu trơn trong palette Facebook và tránh lặp màu liền kề. `trend.js` phải xác nhận nền qua trạng thái chọn hoặc style thật trước khi gõ; nếu Facebook không có/không xác nhận nền thì bỏ qua nhóm, không gõ text-only. Nếu Facebook báo bài đang chờ duyệt rõ ràng, đó là proof terminal thay cho feed-visible và vẫn phải giữ nhóm 8–12 giây. Proof không rõ hoặc bài không hiện thì dừng tại nhóm, không retry. Stop/Reset broadcast mọi tab + ghi flag trực tiếp; resume chỉ owner tab + runId khớp. Các stage danh tính và nền trước submit bảo vệ reload trước cú bấm Đăng.
   B2 có bộ chọn nguồn bài riêng: `trendPostSourceMode=selected` dùng các bài được tích trong danh sách B1, còn `sequential` lấy các bài còn lại từ mới nhất theo số bài mỗi nhóm. `trendPostSelectedIds` lưu ở `chrome.storage.sync`; `trendPostsPerGroup`, `trendTargetGroups` và `trendPostDelay` được chụp vào `trendPostConfig`. Run mới tạo một job cho từng bài đăng (`jobs`, `groupIndex`, `postIndex`, `trendPostIndex`); chỉ sau proof thành công mới xóa các `sourcePostIds` khỏi `trendLearnPosts` và cập nhật `trendLearnCount`. Bài lỗi/bỏ qua hoặc phiên dừng trước proof không tiêu hao bài học.
5. Tiến trình học hiển thị theo thời gian thực: status ghi rõ nhóm thứ mấy, vòng cuộn, số bài đã lấy/mục tiêu, số ô đã quét và tổng đã lưu; `trendLearnPosts` được lưu tạm sau mỗi vòng nên popup vẽ ngay danh sách bài (nguồn + trích đoạn + link, mới nhất lên đầu). Chuyển nhóm chờ URL đổi tối đa ~25s trong cùng context (chịu được SPA không reload); reload thật thì resume từ `trendLearnIndex` đã persist. Bấm Dừng không bị ghi đè thành "Học xong".
6. Cấu hình cũ `trendLearnFromTarget` vẫn được đọc để migrate một lần sang `trendLearnSourceMode`; cấu hình mới lưu mode rõ ràng trong `chrome.storage.sync`, đồng thời giữ khóa cũ để tương thích phiên bản trước. Danh sách nguồn luôn hiển thị để người dùng có thể tích/chuyển mode mà không phải tải lại popup.

## 9. Quy tắc Start/Stop chung (v1.9.2/v1.9.3) — bắt buộc cho mọi tính năng

### Universal Start: persist trước, bấm một lần chạy tới cùng

1. Mọi nút Bắt đầu lưu phiên (cờ active + config + counter) vào `chrome.storage.local` TRƯỚC khi chuyển trang/gửi lệnh, rồi mới điều hướng tới route nhiệm vụ (`ensureTaskTab`).
2. Content script tự resume phiên từ storage khi tải trang, kể cả khi `sendMessage` chưa từng tới nơi. Gửi thất bại chỉ báo lỗi khi cờ chạy đã tắt; cờ còn bật nghĩa là phiên đang tự chạy tiếp.
3. Từ chối thật (bận luồng khác, sai cấu hình) phải dọn cờ/config vừa persist để không còn phiên ma resume sau này.
4. Nút Dừng/Reset luôn ghi cờ dừng trực tiếp vào storage (không phụ thuộc message tới tay) để resume không hồi sinh phiên đã dừng.

### Universal Stop: dừng bằng mọi giá

1. Nút Dừng/Reset gửi lệnh tới TẤT CẢ tab Facebook (`broadcastToFacebookTabs`), không chỉ tab đang mở — phiên có thể đang chạy ở tab khác.
2. Mọi resume sau reload chỉ chạy trên đúng tab sở hữu (`ownerTabId`, do popup gắn khi Start và content xác nhận khi nhận lệnh); tab khác thấy cờ nhưng bỏ qua, nên không bao giờ có hai tab chạy cùng một tính năng.
3. Mọi chờ dài (delay giữa bài/nhóm, chờ schedule, chờ reload) phải kiểm tra cờ dừng theo nhịp ≤1 giây và thoát ngay.
4. Kiểm tra dừng lần cuối ngay TRƯỚC mọi hành động không đảo ngược: gửi comment (cả 2 luồng), bấm Đăng bài nhóm/Share, bấm Tham gia/Gửi, gửi lời mời kết bạn. Dừng trong lúc gõ thì chữ nằm yên trong ô, không gửi.
5. Khi thêm tính năng/state chạy mới: chọn ownerTabId + cờ active riêng, nối vào broadcast Stop/Reset, nối vào panel-restore của popup, và cập nhật tài liệu này.

## 10. Giao diện popup (Liquid Glass + icon + font)

- Theme nằm toàn bộ trong thẻ `<style>` của `popup.html`: nền mesh gradient, card kính mờ (`backdrop-filter: blur`), tab segmented, nút Start gradient xanh→tím, nút `running` gradient đỏ→cam, input kính mờ, chip status, số đếm chữ gradient.
- Mọi nút đều có class/state qua CSS; 9 nút Start chính và trạng thái `running` dùng selector theo ID với `!important` để thắng inline `style` cũ — khi đổi màu nút, sửa các rule này, không cần đụng HTML.
- Icon: KHÔNG nhúng SVG thủ công vào từng nút. `popup.js` tự gắn icon SVG nét mảnh (`ICON_MAP`, `iconizeEl`, `MutationObserver` ở cuối file) bằng cách thay emoji đầu text nút. Quy tắc khi sửa text nút:
  - Giữ emoji ở ĐẦU chuỗi text (kể cả text gán qua JS như `"⏳ Đang..."`) để icon tự gắn lại; iconize bỏ qua heading, `<option>` và status.
  - Chỗ nào lưu/khôi phục text nút thì dùng `innerHTML`, không dùng `textContent` (sẽ xóa thẻ `<svg>`).
- Font chữ `Be Vietnam Pro` (Google Fonts, tối ưu tiếng Việt) kèm fallback hệ thống khi offline.
- Mở popup tự về đúng panel của phiên đang chạy (Đăng bán > Share > Nhóm > Bản tin & AI > Cào bài > Kết bạn), không có phiên chạy thì mở lại `popupLastTab`; popup không tự đóng. Logic nằm cuối `popup.js`, dùng đúng thứ tự ưu tiên này khi thêm panel mới.
- Quy tắc bảng màu nền dùng chung cho mọi luồng đăng bài có nền: các ô màu phải nằm theo hàng ngang đều nhau, tối thiểu 6 cột với kích thước tối thiểu cố định, checkbox/nhãn dễ đọc và không chồng lấn. Khi card hẹp không đủ chỗ, bảng màu tự cuộn ngang bên trong chính vùng palette; không để palette làm tràn hoặc ép méo card. Luồng mới phải gắn class `.background-palette` và dùng lại style chung trong `popup.html`.

## 11. Checklist kiểm thử sau khi sửa

1. Chạy `node --check feed.js`, `node --check share.js`, `node --check content.js`, `node --check group.js`, `node --check background.js`, `node --check popup.js`, `node --check i18n.js`.
2. Reload extension rồi reload Facebook; không đánh giá bản vá chỉ bằng content script cũ đang nằm trong tab.
3. Với Comment AI, test nhỏ trước (2–3 bài), sau đó mới test 20; kiểm tra log `Comment N`, bài bị bỏ qua và trạng thái cuối.
4. Xác nhận không có click vào Messenger, comment con, quảng cáo, Reels/Watch hoặc trang ngoài Bảng tin.
5. Xác nhận Dừng cắt được cả lúc đang delay, đang chờ Facebook render và đang tải API.
6. Với đăng nhóm, kiểm tra nền được xác nhận trước khi nhập, nội dung không có Hỏi/Đáp, và lỗi không chuyển nhóm sớm.
7. Không dùng một log “đã bấm” làm bằng chứng thành công; luôn kiểm tra state/DOM xác nhận tương ứng.
8. Với Share bài, thử 1 nhóm trước: xác nhận AI đọc đúng bài, lời dẫn không chứa URL, preview xuất hiện trước nút Đăng, bộ đếm chỉ tăng sau khi composer được Facebook nhận và delay giữ đúng mốc.
9. Với Đăng bán, thử Preview/Test API trước; sau đó chỉ chạy 1 nhóm với một file, nhiều ảnh + video và không có media, kiểm tra đúng nhóm, đủ media được Facebook nhận, nội dung không có URL/hashtag/nhãn AI, bộ đếm chỉ tăng khi composer đóng hoặc có xác nhận, rồi mới thử nhiều nhóm và delay.

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
