# Codex handoff — FB Auto Tool

This document packages the working context for moving the project to another computer or another Codex task. It intentionally contains no API key, cookie, Facebook session, or private account data.

## 1. Project snapshot

- Project: `fb-auto-add`
- Type: Chrome Manifest V3 unpacked extension
- Current source version: **1.9.37**
- Last handoff date: 2026-09-07 (Asia/Ho_Chi_Minh)
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

Supported paths currently include Gemini, OpenAI-compatible providers (OpenAI/Groq/OpenRouter/DeepSeek/Mistral), Claude/Muse, and Custom URL. Gemini uses the current Interactions API path implemented in `background.js`; preserve the user's selected model and Custom URL. Every AI feature should use the same saved config and the existing Test API action.

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
