# Codex handoff — FB Auto Tool

## v1.9.133 — Navigation resume for source streaming

- The direct friend-of-friend stream now schedules an owner-tab/run-ID guarded resume before every source-profile/Friends-list navigation. This covers Facebook SPA route changes where the content script remains alive, while the existing bootstrap handles hard reloads.
- Stop/reset and a new run cancel stale resume timers; a short retry waits for the previous loop to exit. No live friend request was sent during verification.

## v1.9.132 — Stream requests from the selected source

- Start snapshots source/config and opens its Friends list, handling single-profile cards in DOM order before loading more. No source pre-scan/preview queue or candidate navigation.
- Durable write-ahead history prevents retries across Stop/Reset/reload/new runs; no TTL or legacy 2,000-entry pruning. Resolve exact card and Add Friend label immediately before synchronous click. Pending/Friends labels are never clicked.
- Proof is scoped to the candidate card. Ambiguous results/dialogs stop for inspection. Legacy preview runs require an explicit restart with source.
- Validation: seven mocked regressions in tests/fof-stream.test.cjs and required syntax checks. No real request sent for this release.

## v1.9.131 — Friends list batch-loading fix

- Fixed both friend-of-friend scanners stopping on Facebook's first rendered batch. The loading marker is now treated as a signal to keep scrolling; it no longer suppresses the scroll that triggers the next batch.
- The resolver handles Facebook's split layouts explicitly: the current account's `/friends/list/` is mounted under `role=navigation`, while a source profile's Friends list remains scoped to `role=main`.
- Every cycle re-discovers the list/scroller, moves to the current tail and polls DOM progress while checking Stop/run ID every 500 ms. Completion requires two independent no-progress samples at the bottom with no loading marker; 320 rounds, 5,000 profiles or 120 seconds without progress fail closed as partial.
- Read-only live DOM verification covered the current-account Friends route and a source profile's full Friends route: scrolling caused both roots to append additional profiles. No Add Friend control was clicked.

## v1.9.130 — Friends-of-friend source scan and preview queue

- Friend tab adds a separate `friend-of-friend` mode. The source can be an explicit Facebook profile link, or a profile selected by name from the current account's scanned Friends list.
- The mode scans only Friends links/lists exposed by Facebook to the current account, verifies the source route, deduplicates candidates by profile key, and requires a preview before sending. Hidden or unavailable lists are reported as restricted/unknown/partial instead of treated as empty.
- Scan and send use separate state, run IDs, stop paths, counters, history and success proof. Friend-of-friend scheduling is rejected because the source-scan and preview phases must be completed interactively first.

## v1.9.129 — Page Care UI temporarily paused

- The popup no longer renders the Page Care tab/panel, new Page schedule choices, or Page cards in the Run Center. A stale `popupLastTab: "page"` falls back safely to the Add-friend tab.
- Page source, stored settings, and isolated state machines remain in place; restoring the UI does not require a data migration or reset.

## v1.9.128 — Page actor picker recovery and fail-closed stop

- Nuôi Page recognizes Facebook's profile picker even when the picker root is exposed through `aria-modal`/profile markers, loads more Pages, and searches the picker when the configured Page is not initially visible. After selecting a Page, it reopens the picker and requires a selected/acting-as marker; a `Switch to...` option or click alone is never proof.
- After two consecutive actor-verification failures, Page group join stops with a clear unavailable-Page status instead of mass-skipping groups. The `pageGroupJoin*` state, run ID, counter, and proof remain isolated.
- Skip reasons are no longer overwritten immediately by the loop progress status. Open-question AI requests have a 30-second timeout and continue polling Stop/run ID.

## v1.9.127 — Verify actor menu after click

- Nuôi Page now verifies that Facebook's actor menu actually appeared after the click. If a trusted coordinate dispatch reports success while the menu remains closed during a header rerender, it retries once with the DOM click and still requires Page identity evidence before processing.

## v1.9.126 — Fixed actor visibility detection

- Nuôi Page no longer rejects Facebook's fixed `Trang cá nhân của bạn` actor button just because its `offsetParent` is `null`; `page.js` now uses computed visibility and viewport dimensions. Other feature state machines remain separate.

## v1.9.125 — Selected Page actor evidence

- `actorEvidence()` now accepts Facebook's `đang chọn` / `selected` marker for the configured Page, in addition to acting-as labels. This prevents a successful Page selection from being treated as unverified.

## v1.9.124 — Load more Page actor options

- When Facebook's identity picker exposes `Xem thêm trang` / `See more pages`, Page actor selection loads more options up to eight times before failing closed. It re-finds the configured Page after each render and still requires actor evidence after selection.

## v1.9.123 — Full Page-list actor selection

- Page actor selection now opens Facebook's `Xem tất cả trang cá nhân` / `See all profiles` when the configured Page is not in the quick-switch options, then selects the Page from the refreshed menu. Join, Post, Watch and Comment keep separate Page state/proof.

## v1.9.122 — Page actor switch label fix

- Page join/post actor resolvers now include Facebook's current `Trang cá nhân của bạn` / `Your profile` / `Your account` identity-menu labels, so the configured Page can be selected before processing. Page state, selectors, counters and proof remain separate.

## v1.9.121 — Page running-label translation fix

- `popup.js` now uses the existing `pg.busy` dictionary key for the Page group-join running button. The raw `p.pgBusy` key no longer appears; Page state machine, selectors, counters and proof are unchanged.

## v1.9.120 — Stable Suggestions order

- Friend Suggestions now preserves Facebook DOM order from `querySelectorAll()` and no longer sorts candidates by viewport coordinates. This keeps the queue top-to-bottom across scroll/re-render cycles.
- Existing “request sent” cards remain excluded because they have no valid Add Friend control. The change is isolated to `collectCandidates()` in `content.js`; Group-common and confirmation state machines are unchanged.

## v1.9.119 — Inline schedule controls

- Mỗi feature panel có ô `datetime-local` và nút `📅 Hẹn lịch cấu hình này` riêng: Friend, Scrape, Feed, AI Feed, Group Interact, Group Comment, Group Post, Share, Sales, Trend Learn, Trend Post, Page Group Join, Page Group Post, Page Watch và Page Comment. Keyword/Discover giữ control inline đã có.
- `popup.js` chỉ bind các nút này vào `createFeatureSchedule()`/`scheduleSnapshot()` theo feature; background scheduler, route, state, counter và success proof không bị tách/ghép lại.
- Khi sửa thêm feature schedule, phải giữ đủ 17 binding, không đưa API key vào snapshot, và cập nhật bộ kiểm tra static/syntax.

## v1.9.118 — Schedule entry point always visible

- `popup.html` thêm nút `📅 Lịch chạy` ở đầu popup, dùng lại `showTab("schedule")`; đây chỉ là shortcut UI, không thay đổi adapter hay state machine của feature.

## v1.9.117 — Schedule adapters for all features

- `popup.html`/`popup.js` have a dedicated Schedule tab and `scheduledTasks` UI. The list is an observer/manager only; it never drives Facebook DOM directly.
- `background.js` owns `chrome.alarms` using `fb-auto-schedule:`. It blocks a due task if any existing feature active flag is true, and records `blocked` rather than interrupting work.
- The Schedule tab now has feature-specific adapters for Friend, Scrape, Feed/AI, joined-group interaction/comment/post, Discover/Keyword Join, Share, Sales, Trend Learn/Post and Page Join/Post/Watch/Comment. Each adapter snapshots only its own route/config/state and calls the feature's existing Start or resume message.
- Schedule snapshots omit API keys. The unified AI configuration is read at due time; media schedules keep only a manifest/plan and use the existing local media store at runtime.

## v1.9.106 — Trung tâm tiến trình

- `popup.html/js` bổ sung `runCenter`: thanh sticky chỉ hiện khi có feature chạy. Nó thuần quan sát state local hiện hữu của toàn bộ feature, hiển thị card tiến độ/status và điều hướng về phần cấu hình tương ứng.
- Không tạo stop path mới: nút card bấm đúng Stop button sẵn có, bảo toàn stop broadcast, run ID và cleanup từng state machine. Khi thêm feature mới, chỉ thêm metadata vào `RUN_CENTER_FEATURES`, không ghép state hay selector với feature khác.

This document packages the working context for moving the project to another computer or another Codex task. It intentionally contains no API key, cookie, Facebook session, or private account data.

## 1. Project snapshot

- Project: `fb-auto-add`
- Type: Chrome Manifest V3 unpacked extension
- Current source version: **1.9.133**
- Last handoff date: 2026-09-13 (Asia/Ho_Chi_Minh)
- Primary site: Facebook web UI; selectors and labels are expected to change over time.
- Existing fallback copy: `backup_v1.8.12/` (keep it intact).
- Canonical logic reference: `PROJECT_LOGIC.md`.
- User-facing changelog and setup: `README.md`.

### Latest validation — Học nhóm

- v1.9.10 sửa parser B1 theo DOM Facebook hiện tại: post chính thường nằm trực tiếp trong `div[role="feed"]`, còn `div[role="article"]` là comment/reply; chỉ nhận node có hành động bài viết và fallback `textContent` khi `innerText` rỗng.
- v1.9.11 sửa false positive quảng cáo: `data-ad-preview="message"` xuất hiện trên bài thường, nên không được dùng một mình để loại bài; chỉ giữ marker/nhãn quảng cáo rõ ràng.
- v1.9.12 sửa chẩn đoán B1: không gắn `dataset.trendLearned` trước khi gọi parser, để số parse rớt phản ánh đúng kết quả.
- v1.9.13 bổ sung wait state riêng cho mọi luồng đăng nhóm: chờ group/composer chậm tối đa 45 giây, chờ bài xuất hiện tối đa 30 giây, giữ nhóm 8–12 giây trước điều hướng; `submit-armed`/`submitted`/`waiting-visible`/`post-visible` bảo vệ reload và không retry sau cú bấm mơ hồ.
- v1.9.14 thêm công tắc B2 `trendAnonymousMode`: khi bật, `trend.js` xác nhận switch Facebook `Đăng ẩn danh` và hộp thoại “Bài viết ẩn danh”/OK trước khi nhập/bấm Đăng; nhóm không hỗ trợ hoặc không xác nhận được bị bỏ qua, không fallback đăng công khai. Proof “đang chờ duyệt” rõ ràng được chấp nhận và vẫn có hold 8–12 giây.
- v1.9.15 thêm ô link nhóm nguồn/đích theo từng dòng, vẫn gộp với checkbox và loại trùng; hỗ trợ `URL | Tên nhóm`. B2 có `trendGroupPrompt` dùng `{groupName}`; link-only target lấy tên heading Facebook sau khi mở nhóm rồi mới gọi AI, không dùng slug/ID làm tên nhóm nếu có thể xác định tên thật.
- Đã test read-only trên nhóm công khai trong Chrome sau khi reload extension + reload tab: chẩn đoán đạt 1/1 parse thành công, B1 lấy được 6/10 bài ở lượt test ngắn, hiển thị danh sách và kết thúc an toàn; không chạy B2/không đăng bài.
- `popup.js:getActiveTab()` ưu tiên Facebook tab active ở mọi cửa sổ, tránh lỗi popup gửi chẩn đoán/quét nhóm vào cửa sổ popup nội bộ.
- v1.9.87: Facebook hiện dùng `Trả lời dưới tên X` cho composer comment chính trên trang permalink nhưng `Trả lời với vai trò X` cho composer reply con. `isReplyCommentBox` chỉ loại nhãn reply có đích rõ ràng, để Comment AI nhóm nhận đúng composer chính mà vẫn tránh trả lời chồng vào comment con.
- v1.9.88: `groupCommentDraftScope` ghi nhớ dialog sở hữu composer. Cleanup chấp nhận replacement có đúng text/đoạn text đã nhập trong chính dialog đó ngay cả khi Facebook đổi node làm identity/signature tạm thời lệch; không mở route tiếp khi draft còn chữ.
- v1.9.92: Comment AI nhóm ghi nhớ ngắn hạn các text do chính lượt AI sở hữu. Khi Facebook giữ composer nổi của bài trước sau khi đổi permalink, cleanup quét/dọn orphan composer theo đoạn text đã sở hữu trước khi xử lý/chuyển bài; Stop/Reset dọn xong mới xóa ownership memory và không chạm draft không khớp AI.
- v1.9.93: Comment AI nhóm xử lý mọi bài đăng cấp cao có nút Bình luận, không loại caption ngắn hoặc comment AI trùng ý comment khác; bài ảnh dùng alt text/ngữ cảnh dự phòng. Lạc permalink hoặc composer tải chậm không đánh dấu bài đã xử lý ngay, thử lại tối đa 3 lần; vẫn loại reply/comment con, Messenger, quảng cáo và Reel/Watch, chỉ tăng bộ đếm sau proof.
- v1.9.94: Sau khi mở nhóm, Comment AI chờ feed render 6 giây rồi polling tối đa 18 vòng x 2,5 giây nếu chưa có bài; trạng thái hiển thị đang chờ feed để không kết thúc 0 bài trên mạng chậm.
- v1.9.95: Riêng Comment AI nhóm không coi `data-ad-preview="message"` đứng một mình là quảng cáo; giữ các bài thường có nút Bình luận chính, nhưng vẫn loại dấu hiệu quảng cáo rõ ràng, Reel/Watch, reply/comment con và Messenger.
- v1.9.100: Đã tái hiện Kết bạn theo Gợi ý có 20 nút “Thêm bạn bè” hợp lệ nhưng state đứng ở “Đang chuẩn bị nguồn”: resume run cũ và Start run mới đua nhau qua `loopActive`. `friendLoop` tự handoff sang run active mới trong `finally`, nên không kẹt sau chuyển route/reload.
- v1.9.101: Đã tái hiện Xác nhận lời mời dừng ngay với `Cannot read properties of undefined (reading 'hometown')`: state tạm trước điều hướng có `confirmFilters`, còn resume đọc `filters`. Normalizer nhận cả hai và vòng resume chuẩn hóa trước lọc; handoff run mới cũng được áp dụng riêng cho state machine xác nhận.
- v1.9.102: Xác nhận lời mời chỉ còn ngưỡng bạn chung + giãn cách/giới hạn chung. Đã bỏ UI và logic đọc nhóm chung, quê quán, trường học, ảnh đại diện; không mở profile để lấy dữ liệu bổ sung. Ngưỡng 0 xác nhận mọi card hợp lệ, ngưỡng >0 bỏ card thiếu/chưa đủ số bạn chung.
- v1.9.103: Đã quan sát Facebook render “Đã chấp nhận lời mời kết bạn” cho đúng profile trong khi counter vẫn 0 vì code đọc node nút cũ sau re-render. Proof nay re-find card theo profile key hoặc nhận live message mới rồi mới tăng counter.
- v1.9.104: Tham gia nhóm theo từ khóa lấy tên từ link tiêu đề cùng URL nhóm, không còn dùng link ảnh/URL; selector Join khóa vào control trực tiếp của card. Lượt Facebook không xác nhận vẫn phải chờ delay trước lần bấm kế tiếp.
- v1.9.105: Tham gia nhóm hiển thị countdown delay từng giây và polling Stop khi chờ. Popup có `groupAiUsage` để audit việc AI viết đủ/thiếu câu trả lời mở theo nhóm; câu nội quy chỉ dùng mẫu. Audit không chứa câu hỏi, câu trả lời hay API key.
- v1.9.107: Luồng Khám phá được xác nhận trên DOM Facebook hiện tại có hai khu “Nhóm của bạn bè” và “Gợi ý khác”. Extractor nay scope đúng “Gợi ý khác”, lấy card/tên nhóm đúng và chờ giãn cách có countdown cả sau proof thất bại.
- v1.9.99: `groupCommentHistory` chỉ còn audit; lượt Start mới không dùng history cũ để bỏ qua bài đang thấy. Chỉ guard cùng run ID (reload mơ hồ) và proof comment thật của chính tài khoản trong DOM mới chặn đăng, đáp ứng luồng đọc/comment mọi bài hiện tại.
- v1.9.98: Sau proof comment trong dialog/permalink, `continueGroupComment` persist đầy đủ counter/history rồi quay về route nhóm trước lượt tiếp. Không tiếp tục quét card nền ở permalink, vì Facebook có thể gán cùng permalink cho nhiều card và làm composer bài tiếp theo không tìm thấy.
- v1.9.97: Đã tái hiện Facebook mở permalink bằng dialog nhưng giữ card cùng permalink ở nền: Composer nền có thể được focus/gõ trong khi editor dialog đang trống. `findGroupPostDetailComposer` khóa Comment AI nhóm vào editor `role="dialog"` đang hiển thị trước mọi fallback; route permalink không còn đủ để chọn card nền.
- v1.9.96: Comment AI nhóm ưu tiên composer mới xuất hiện sau cú click, kiểm tra đúng bài/permalink và giữ node vừa mở trong lúc Facebook re-render; composer cũ phía trên chỉ là fallback sau thời gian chờ, tránh nội dung nhảy xuống ô khác.
- v1.9.91: Với layout lớp bài viết không có `role="dialog"`, cleanup dùng permalink hiện tại làm scope fallback khi ownership memory còn hiệu lực, dọn replacement đúng bài trước khi cho phép dừng/chuyển nhóm.
- v1.9.90: Sau khi Facebook xác nhận comment trên permalink, cleanup nhận diện composer replacement theo permalink đúng bài ngay cả khi scope/identity DOM cũ biến mất; không đóng overlay/chuyển tiếp khi fragment do lượt AI sở hữu còn sót.
- v1.9.89: Group Comment AI chờ editor ổn định sau khi mở, ưu tiên replacement cùng bài, focus lại và xác nhận ô vẫn rỗng trước khi gõ để giảm hụt phần đầu câu khi Facebook re-render composer.

## 2. How to transfer to a new machine

1. Copy the complete project directory, including `AGENTS.md`, `CODEX_HANDOFF.md`, `CODEX_SKILLS.md`, `PROJECT_LOGIC.md`, `README.md`, source files, and `backup_v1.8.12/`.
2. Open the copied folder as the working directory in Codex.
3. Ask Codex to read `AGENTS.md`, then `CODEX_HANDOFF.md`, `PROJECT_LOGIC.md`, and the relevant `README.md` section before changing code.
4. Load the extension from `chrome://extensions` → Developer mode → Load unpacked. Select the copied project folder, not the backup folder.
5. Reload the Facebook tab after every extension reload. Existing Facebook sessions and extension storage are machine/browser-specific and are not part of this package.
6. Re-enter the user's own API key in the extension UI on the new machine. Do not copy it into a file or prompt.
7. Run the verification commands in `AGENTS.md`, then test one item/group per feature before a larger run.

## 3. Context accumulated from the previous work

### v1.9.27 — Feed Comment AI draft cleanup

- Đã tái hiện trên Facebook: Comment AI đã nhập text vào composer của bài chi tiết nhưng khi route/phiên bị dừng chuyển về Bảng tin, Facebook giữ draft và hiện “Rời khỏi trang? Bạn chưa hoàn tất bình luận?”.
- `feed.js` hiện giữ `aiCommentDraftBox/aiCommentDraftScope` riêng cho composer do Comment AI sở hữu. Trước `history.go()`, `location.href/replace`, đóng overlay, Stop/Reset và kết thúc verify, luồng dùng `trustedKey` Ctrl+A/Backspace rồi fallback `execCommand("delete")`; chỉ điều hướng khi editor đã rỗng. Nếu không dọn được, trả về stopped/fail-closed.
- `background.js` cho phép `trustedKey` nhận `modifiers` để gửi Ctrl+A qua Chrome DevTools Protocol. Không dùng logic draft này cho Group Interact hoặc các luồng khác.

### v1.9.28 — Feed Comment AI replacement composer cleanup

- Lượt test sau 1.9.27 vẫn tái hiện cảnh báo khi Facebook thay DOM composer sau bước nhập/gửi; con trỏ cũ đã rỗng nhưng composer replacement còn draft trước `history.go(-1)`.
- `feed.js` ghi identity/signature của bài và trước mọi route/Stop/Reset tìm lại composer replacement trong đúng scope hoặc đúng bài, dọn lần hai và chỉ cho phép điều hướng khi replacement cũng rỗng.

### v1.9.29 — Semantic character limits for colored-background posts

- `background.js` dùng chung quy tắc mục tiêu gần giới hạn cho Đăng bài nhóm và Học nhóm B2: 100 ký tự nhắm 85–100, 125 nhắm 110–125; nội dung phải giữ chủ đề và ý chính/góc nhìn, thêm câu hỏi nếu còn chỗ.
- Nếu phản hồi AI vượt giới hạn, service worker gọi thêm một lượt nén nội dung hoàn chỉnh trước khi trả về content. Không đăng nếu lượt nén vẫn vượt tối đa, tránh cắt cụt ý.
- `feed.js` và `trend.js` vẫn giữ composer, state, counter và proof riêng; hàm cắt cục bộ chỉ còn là guard cho pending draft cũ và ưu tiên ranh giới câu.

### v1.9.30 — Pending-moderation proof for group posts

- Feed group posting now accepts matching post content plus Facebook's explicit “Bài viết đang chờ phê duyệt”/“pending review” card text as visible success proof, even when Facebook does not expose that text through `role=status` or `role=alert`.

### v1.9.32 — Prompt snapshot and in-run locking

- Các luồng Group Post, Share bài, Đăng bán và B2 đều truyền prompt đã chụp vào state chạy ở storage.local trước khi điều hướng/gửi.
- Popup khóa các ô prompt khi cờ active tương ứng bật và mở khóa khi Stop/Reset/hoàn tất. Người dùng vẫn xem được prompt; thay đổi mới được lưu cho lượt sau, tránh sửa giữa chừng làm lệch phiên resume.
- Popup có hướng dẫn song ngữ ngay dưới từng prompt: Group Post/B2 phân biệt thảo luận, câu tương tác và hỏi–đáp; Share giải thích postText/groupName; Đăng bán giải thích sourceText/productInfo.

### v1.9.33 — B2 anonymous submit and composer cleanup

- B2 nhận cả nút “Gửi/Send” khi Facebook dùng nhãn gửi riêng cho composer ẩn danh.
- Trước khi điều hướng sang nhóm kế tiếp, B2 đóng composer đang giữ draft và xử lý hộp thoại bỏ bài nếu Facebook hiện; không điều hướng khi composer còn mở để tránh cảnh báo native “Rời khỏi trang web?”.

### v1.9.34 — B2 learned-post selection and per-post scheduling

- B2 có thể dùng các bài học được tích rõ ràng hoặc lấy lần lượt các bài còn lại mới nhất. Lựa chọn lưu ở `chrome.storage.sync`, bài học vẫn ở `chrome.storage.local`.
- B2 tạo một job riêng cho từng bài đăng, lưu chỉ số bài/nhóm, `trendPostsPerGroup`, `trendTargetGroups` và `trendPostDelay`. Bài nguồn chỉ bị xóa sau khi Facebook xác nhận đăng; bài lỗi/bỏ qua không bị tiêu hao.

### v1.9.35 — Manual learned-post deletion

- B1 có nút xóa từng bài và xóa hàng loạt các bài đang tích, luôn hỏi xác nhận trước khi cập nhật `trendLearnPosts` và `trendLearnCount`.

### v1.9.36 — Anonymous-post preference persistence

- B2 bật sẵn tùy chọn bắt buộc đăng ẩn danh khi chưa có cấu hình; mọi thay đổi tích/bỏ tích được lưu ở `chrome.storage.sync.trendAnonymousMode` và khôi phục khi mở popup lần sau.

### v1.9.37 — Prompt guidance across the popup

- Mọi ô Prompt đều có khối hướng dẫn khách hàng mở rộng được, dùng cùng bố cục và nêu đúng biến bắt buộc/định dạng đầu ra của từng tính năng.

### v1.9.31 — Group Post stale-draft guard

- Trước khi gõ bài AI, `feed.js` xóa bản nháp còn sót trong composer bằng `trustedKey` chọn tất cả/xóa, rồi fallback chọn nội dung + `execCommand("delete")` và xác nhận ô đã rỗng.
- Nếu bản nháp không xóa được, phiên dừng tại nhóm hiện tại để tránh nối nội dung của lần thử trước và vượt giới hạn ký tự; không bấm Đăng.

### Kết bạn

- Implemented “Theo gợi ý” with a source-specific selector and confirmation after each invitation.
- Implemented “Thành viên có điểm chung trong nhóm”: open the selected group's member page, wait for Facebook's delayed section, click “Xem tất cả”, then process “Thêm bạn bè” from top to bottom with delay and duplicate history.
- The join/common-member route waits and can reload once; counters only increase after Facebook exposes a real state change.
- A separate search-filter mode was planned but is not currently a distinct implementation; do not silently route `/search` into another mode.
- v1.9.25 adds a separate incoming friend-request confirmation mode on `/friends/requests`. Its popup fields are stored in sync as `friendConfirm*`; run/progress/history live under `friendConfirm*` in local storage, and profile inspection stores numeric/boolean evidence plus a temporary profile key/URL needed to resume. The list selector must tolerate Facebook rendering the requests outside `role="main"`; use the requests heading/container and exclude mutual-friend links from tables or mutual-friend aria labels. Avatar proof must accept Facebook's SVG `image[xlink:href]` form but only from a link with the candidate's profile key. Profile inspection waits for a stable route/key, retries navigation at most once, and fails closed on a mismatch instead of reloading forever. Treat the presence of a `profileEvidenceByKey` entry as an inspection proof even when every optional value is still unknown; with `skipUnknown=true`, skip that profile after its first inspection instead of reopening it. When the rendered batch is exhausted, anchor on the final confirm button and scroll its nearest real overflow container so Facebook's left-hand requests panel can load more cards; only fall back to window scrolling when needed. Do not merge this flow into outgoing `friendRunState`/`friendProfileHistory`; it only counts a confirmation after a visible Facebook proof.

### Tham gia nhóm

- Keyword and Explore modes have separate progress/state. If the user navigates to the home feed or another Facebook route during Explore, the feature returns to `/groups/discover` and resumes saved progress.
- “Xem xét quyền tham gia” and “Câu hỏi dành cho người tham gia” dialogs are handled in `group.js`.
- Rule/consent questions use saved automatic answers. Open questions can call the shared AI provider and are filled in the original question order.
- A group is counted only after Facebook changes to a joined/access state. Slow dialogs, multi-step “Tiếp/Tiếp tục”, delayed “Truy cập”, and welcome overlays were specifically handled.

### Đăng bài AI lên nhóm

- Uses the groups selected in the popup, an optional target count, and an inter-group delay.
- Keeps both normal text posting and colored-background posting. Background mode supports fixed/random colors, skips unsupported groups, and waits for the composer/background UI to settle.
- It must remain in the exact selected group and advance only after Facebook confirms posting. Keep automatic waits for composer, color picker, typing, and post confirmation separate from inter-group delay.

### Comment AI / Bản tin

- Comment AI is restricted to the main feed, excludes ads/sponsored posts, comments/replies, Reels/Watch, and non-feed routes.
- It uses a stable post identity and `aiCommentHistory`/submission guard to avoid commenting the same post twice, even after Facebook rerenders or the page reloads.
- The comment flow clicks the main comment control once, waits for the correct composer, types gradually, sends once, and verifies a real comment outside the editor. Text remaining in the input is never proof of success.
- If Facebook does not confirm a submission, the post is guarded against retries; do not falsely increment the success count.

### Cào bài và hồ sơ văn phong

- `scrape.js` reads public posts from the current Profile/Fanpage/group or a supplied Facebook URL, expands “Xem thêm”, excludes nested comments/replies and optionally sponsored posts, deduplicates, and exports TXT/JSON/Markdown.
- Scrape runs and exports are tied to the source URL so old content from another profile/page cannot be reused accidentally.
- `styleProfiles` stores a compact topic/style profile. It is shared by Comment AI, Đăng bài AI, and Share bài; it must not copy a person's posts verbatim or impersonate them.

### Share bài vào nhóm — current design

- `share.js` is a separate state machine with `groupShare*` keys. It reads one specific Facebook post URL, extracts the primary article (not the background feed/comment), generates a group-specific AI lead, and shares to selected joined groups in order.
- `popup.js` provides source URL, selected groups, target count, inter-group delay, prompt, shared AI configuration, source-text editor, and a chat box. Chat history is scoped to the source URL.
- The source URL is typed into Facebook's composer together with the AI lead. The code waits for a link-preview before deleting the visible URL text.
- The preview check is fail-closed: a generic “Xóa/Remove” control is not enough. It looks for the exact source permalink, a matching source media filename/ID, or (when Facebook hides the permalink) a stable card tied to the source profile while the raw source URL is still present.
- After Backspace, Facebook may replace the preview DOM. v1.8.25 waits up to 8 seconds and accepts only if the same permalink/media/image/meta/card identity is preserved. Otherwise it stops before “Đăng”.
- The share counter increments only after Facebook gives a success/pending-for-review proof. A failed or unconfirmed send must never be retried automatically as if it were new.

### Đăng bài bán hàng bằng AI — current design

- `sales.js` is a separate content-script state machine with `salesPost*` progress, stop and pending-content keys. It never reuses the Comment AI, Group Post or Share selectors/counters/proofs.
- The popup has a separate **Đăng bán** tab. It loads joined groups, filters the visible list by keyword, preserves the checked order, limits the number of target groups and waits a fixed delay between groups.
- Product/source text, optional notes, a saved prompt (`{groupName}`, `{sourceText}`, `{productInfo}`), multiple images/videos and an optional style profile are supported. Preview and Test API are non-publishing checks; all AI requests use the unified provider/key/model/Custom URL profile.
- Media is stored as an array in `chrome.storage.local.salesPostMedia` with backward-compatible reading of the old single-object shape. Each selected file is capped at 35 MB; `sales.js` sends the full selection through one Facebook file input, reacquires the current composer/contenteditable after Facebook rerenders it, and requires matching rendered media/file-name proof before typing/posting.
- Each group receives a generated variant. `sales.js` verifies the exact group route, composer, complete media attachment and post confirmation. A pre-submit retry closes and reopens the composer so media cannot accumulate; an ambiguous post click stops the run at that group and is never retried. Other errors increment the skip count with a reason and advance only after the run state is persisted. Reload resumes only for the saved run ID/owner tab.

### Popup UI: Liquid Glass + auto SVG icons + font (no version bump, ships in v1.9.x)

- All theme CSS lives in the `<style>` block of `popup.html` (mesh-gradient body, frosted `.card`s with `backdrop-filter`, segmented `.tabs`, gradient hero Start buttons, red-orange `button.running`, frosted inputs/lists, gradient `.count`). Legacy inline `style="background:..."` on buttons is intentionally overridden by grouped ID selectors with `!important` — change colors there, not in HTML.
- Do NOT hand-write SVG into buttons. `popup.js` auto-mounts stroke icons (`ICON_MAP` + `iconizeEl` + a `MutationObserver` at the end of the file) by replacing the LEADING emoji of each button/tab label. Rules: keep the emoji first in every button string (including JS-assigned `⏳...` running texts); `iconize` skips headings, `<option>`s and statuses; anywhere button text is saved/restored must use `innerHTML`, never `textContent`, or the `<svg>` is destroyed.
- Font is Be Vietnam Pro via Google Fonts with system fallback when offline; popup panels auto-restore per `popupLastTab` / running-feature priority (Đăng bán > Share > Nhóm > Feed > Scrape > Kết bạn).

### Universal Stop-by-any-means (v1.9.3)

- Every Stop/Reset broadcasts to all Facebook tabs (`broadcastToFacebookTabs`) AND writes stop flags/clears pending runs directly in storage, so stopping works even with several FB tabs open or the message missed.
- Reload resumes are gated on `ownerTabId` (persisted at Start, stamped by content on receipt) plus the run flag — a stopped run never resurrects, and two tabs never run the same feature concurrently.
- Final stop checks sit immediately before each irreversible action (AI comment send ×2 flows, group-post submit, share submit, friend invite); long schedule waits poll the flag.

### Universal persist-first Start (v1.9.2)

- Every Start persists its run (active flag + config + counters) before navigating/sending: friend (`friendRunState`), keyword join (`groupJoinRunConfig`), Discover (`discoverRunConfig`), feed/AI (`pendingFeedInteract`/`pendingAIComment`), group interact/post (full config), scrape (target + source URL), share (already did). Content self-resumes on load; group resumes navigate back to the right group when off-route; scrape resume now reads `scrapeRunSourceUrl`.
- A failed send only reports an error when the run flag is off — flag still on means the run self-healed. Genuine refusals (busy/cross-flow) revert the persisted flags. Stop/Reset clear persisted runs directly, even when the tab is unreachable. Group posting gained a Reset button (`groupPostResetBtn`).

### Comment sanitization (v1.9.1)

- `trustedInput` types by code-point (`[...text]`), all truncations use `sliceByCodePoints`, and `sanitizePostedText`/`sanitizeCommentOutput` strip U+FFFD + lone surrogates (background comment/caption/group-post paths plus a final feed-side gate). Never index/slice posted text by UTF-16 unit.

### Comment fallback integrity (v1.9.4)

- `fallbackComment()` keeps the normalized post text in a variable that does not shadow the shared `t()` translator. Feed Comment AI economy mode and the Group Interact AI fallback now always produce a local, translated safe comment after an AI error instead of throwing before the composer step.

### Run identity and submit proof (v1.9.4)

- Popup Start persists each task before navigation, including the canonical Facebook source key for Scrape and a unique `runId` for Group Interact/Group Post. A stale callback or a second Start cannot reset or overwrite the newer run; Stop/Reset remains authoritative through direct storage writes.
- Group Interact persists the current group's reaction count and reaction/comment guards, so reload resumes without repeating an already attempted post. Group Post persists `submit-armed` before the single Post click and `submit-dispatched` immediately after; a reload at either stage stops at that group for manual inspection instead of posting a duplicate. A disabled button or emptied editor is never treated as publish proof.
- Scrape normalizes trusted `facebook.com`/`www`/`m` aliases to the same path, polls its storage stop flag during scrolling, and never logs post bodies or source URLs.

### Slow Facebook group posting (v1.9.13)

- `feed.js`, `trend.js`, `share.js` and `sales.js` keep separate group-ready/composer-ready/post-visible waits and counters.
- A successful submit is not enough to navigate immediately: each feature re-finds the current feed post, waits for it to appear, then holds the group for 8–12 seconds. If a submit was dispatched but visibility cannot be verified, the run stops at that group and the persisted stage prevents a duplicate after reload.

### Anonymous rewritten posts (v1.9.14)

- The B2 Học nhóm toggle is stored as `chrome.storage.sync.trendAnonymousMode` and passed through `trendPostConfig.anonymousMode`.
- Before typing, `trend.js` finds the current composer's Facebook switch labelled `Đăng ẩn danh`/`Post anonymously`, confirms Facebook's disclosure dialog when shown, and requires `aria-checked=true`. Unsupported or ambiguous groups are skipped without public fallback. A new explicit pending-approval alert is terminal proof, followed by the normal 8–12 second hold.

### Bilingual UI vi/en (v1.9.0)

- `i18n.js` (loaded first in manifest content scripts, via `<script>` in popup, via `importScripts` in background) holds the `I18N` dictionary plus `t()`, `initI18n()`, `setUILang()` and `applyI18n()` (`data-i18n` / `data-i18n-ph` / `data-i18n-html`, `data-i18n-once` for user-editable prompt defaults). Language persists in `chrome.storage.sync.uiLang`; content scripts follow mid-run changes via `onChanged`.
- ~720 keys cover all popup UI, run statuses, default AI prompts, fallback samples and background prompt rules, so AI output follows the UI language. Facebook-matching selectors/regexes and error-classifier regexes were kept bilingual on purpose; cross-file busy signals use `code:"join-busy"`.

### Feed Comment AI slow-box wait (v1.8.35)

- `aiCommentLoop` re-finds a recycled post by identity (`findFeedPostByIdentity` + candidate flag) instead of silently skipping it; `postAIComment` entry does the same recovery.
- After the single comment click, the box wait is unbounded with an elapsed-seconds status — no second click, no post switch. Only a truly vanished post is skipped, with a visible status.

### Keyword join self-resume (v1.8.34)

- Popup persists `groupJoinRunConfig` (+ `isGroupJoining`) before navigating; `group.js` auto-resumes the exact keyword on any load (redirect/reload/missed send) via `applySearchRunConfig()` + restored `groupJoined` count. Finish/Stop/Reset always clear the run config, including direct storage writes from popup when the tab is unreachable.
- Starting a different keyword (or Discover) mid-run is blocked with a naming message until Stop, preventing reloads from resuming the wrong task.

### Keyword route + popup panel restore (v1.8.33)

- Keyword join route matching compares the actual `q` query, so starting a new keyword while the tab shows an old search always navigates first.
- `showTab()` persists `popupLastTab`; opening the popup returns to the running feature's panel (Share > Group > Feed > Scrape > Friend) or the last tab. The popup never self-closes.

### Group interact AI skip reasons (v1.8.32)

- `feed.js` tracks `groupInteractAiSkipped` per reason (short/seen/own/nobutton/boxtimeout/unconfirmed/navigated) and shows the breakdown in the status line, so `reacts = AI comments + skips` always adds up.
- A comment click that navigates away locks the post against repeats and returns to the group URL; the run resumes after reload. The comment-box wait now also accepts a newly opened box when the article left the DOM.

### Start-button running state (v1.8.31)

- `popup.js` adds `setGroupInteractRunning/setGroupPostRunning/setGroupShareRunning` (⏳ text + `running` class), wired to `groupInteractActive/groupPostActive/groupShareActive` for init restore, change listeners, Stop/Reset, and failure reverts.
- All other Starts (friend/feed/AI/keyword/Discover/scrape) now set running optimistically right after validation and revert on failed `sendMessage`/retry, so the button reflects the run even during route navigation.

### Task-route guarantee (v1.8.30)

- `popup.js` adds `ensureTaskTab()` + `isPopupMainFeedUrl()`. Every Start routes first: keyword join → its `/search/groups/?q=`, Discover → `/groups/discover`, feed/AI comment → main feed `/`, group interact/post → first selected group. Non-Facebook tabs are also routed instead of failing `sendMessage`.
- `feed.js` `feedInteractLoop()` and `pendingFeedInteract` resume run only on `/` or `/home.php`; off-route saves pending state and returns to `/` before interacting.

### Group interact target limit + AI comment (v1.8.29)

- `popup.html/js` adds `groupInteractGroupLimit` (first N checked groups, same pattern as `groupPostTargetGroups`) and `groupInteractAiComment` checkbox, persisted as `groupInteractTargetGroups` / `groupInteractAiComment` in `chrome.storage.sync`.
- `feed.js` slices `groupInteractConfig.groups` by `targetGroups` on both start and resume, and when `aiComment` is on, calls shared `aiGenerateComment` per reacted post with `fallbackComment` on API failure.
- Group commenting uses a separate `groupInteractPostAIComment()` flow scoped to group routes plus separate `groupInteractCommentHistory/Guard/AiDone` state; it never reuses feed `aiCommentHistory`, clicks Comment once, waits for the box, types via `trustedInput`, sends once, and verifies proof outside the editor (30s, `unconfirmed-skip` locks the post).

### Group join dialog compatibility (v1.8.26)

- Facebook may show a dialog titled “Trả lời câu hỏi” with “Yêu cầu tham gia của bạn đang chờ phê duyệt” instead of the older membership-question labels. `group.js` now recognizes both forms, selects visible/label-wrapped checkbox controls, verifies all selections, fills text answers, and waits briefly for the enabled **Gửi** button before submitting.

### Group post background selection (v1.8.27)

- In Random mode, `feed.js` now rejects gradient and illustration palette labels even when they contain a solid-color word. Matching is restricted to solid colors, and an unsupported selected color falls back to a random solid palette item instead of the first (often decorative) item.

### Group post background selection (v1.8.28)

- `feed.js` first builds the list of solid colors actually exposed by Facebook for the current group. Random mode chooses from that list, rather than scanning the configured colors in fixed order (which previously repeated the first available red background); it also excludes the last confirmed color whenever another solid choice exists.

## 4. File responsibilities

| File | Responsibility |
| --- | --- |
| `manifest.json` | MV3 manifest, content-script routing, version |
| `popup.html` | Extension UI for all tabs/features |
| `popup.js` | UI events, persistent config, run initialization and reset |
| `i18n.js` | Shared vi/en dictionary + `t()` for popup, content scripts, background |
| `background.js` | AI providers, trusted keyboard/mouse operations, API test |
| `content.js` | Friend modes and joined-group scanning |
| `group.js` | Join-by-keyword/Explore flows and join questions |
| `feed.js` | Feed interaction, group interact (+AI comments), Comment AI, AI group posting/backgrounds |
| `scrape.js` | Source-bound scraping, export, style profile |
| `share.js` | Source article extraction, AI lead, preview validation, Share bài loop |
| `sales.js` | Sales-post state machine, group/media selection, AI variants and publish proof |
| `PROJECT_LOGIC.md` | Detailed state/selector/success-proof contract |
| `README.md` | User setup and changelog |
| `AGENTS.md` | Instructions automatically read by Codex |
| `CODEX_SKILLS.md` | Portable description of environment capabilities and browser-test rules |

## 5. Shared AI configuration contract

`getUnifiedAiConfig()` / `persistUnifiedAiConfig()` in `popup.js` are the single source of truth. Provider profiles are kept separately so changing provider does not erase another provider's key. Configuration is persisted in extension storage, not this repository.

Supported paths currently include Gemini, OpenAI-compatible providers (OpenAI/Groq/OpenRouter/DeepSeek/Mistral), Claude/Muse, and Custom URL. Gemini uses the API-key `models/{model}:generateContent` path implemented in `background.js`; preserve the user's selected model and Custom URL. Every AI feature should use the same saved config and the existing Test API action.

## 6. Debugging protocol for a new Codex session

1. Identify the feature from the popup tab and use only its state prefix/file.
2. Read the current `chrome.storage.local` status through the extension UI/logs when possible; do not inspect cookies or browser profile storage.
3. Confirm the actual Facebook route and visible text before changing a selector.
4. Log only safe diagnostics: route, index, group/post key, stage, selector outcome, and error class. Never log API keys or full private post text.
5. Reproduce on one item, keep the composer open when safe, and distinguish “Facebook accepted a click” from “Facebook confirmed success”.
6. Patch with `apply_patch`, bump the manifest/UI/content-script version when content-script behavior changes, and update this document plus `PROJECT_LOGIC.md`/`README.md`.
7. Run all `node --check` commands, reload the unpacked extension and Facebook tab, reset the relevant feature, then test one item before scaling up.

## 7. Known limitations to keep visible

- Facebook is an SPA with frequent DOM/label changes. Selectors must be scoped to the current dialog/article/card and reacquired after rerenders.
- A Facebook link preview may expose a profile URL instead of a post permalink. Share bài therefore uses source media/card identity and stops if the identity cannot be proved.
- API quotas, login restrictions, group approval questions, ad labeling, and Facebook anti-automation behavior are external conditions. Do not hide these as successful actions or attempt to bypass limits.
- A new computer does not inherit the old browser session, extension storage, downloaded scrape files, or API keys. Those must be set up deliberately by the user.

## 8. Suggested first prompt on the new machine

> Read `AGENTS.md`, `CODEX_HANDOFF.md`, `PROJECT_LOGIC.md`, and the relevant section of `README.md`. Do not change code yet. Summarize the feature state machines, current version, known limitations, and the exact read-only test plan for the feature I name next.
