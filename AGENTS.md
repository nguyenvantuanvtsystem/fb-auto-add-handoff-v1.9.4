# Instructions for Codex in this project

This is a Chrome MV3 extension that automates Facebook UI actions. Before making a change, read `PROJECT_LOGIC.md` and the relevant section of `README.md`. Treat those files as the project handoff and update them when behavior changes.

## Non-negotiable project rules

- Keep each feature's state machine, selectors, progress counters, stop logic, and success proof separate. Do not reuse Comment AI logic for group joining or Share bài.
- Use `chrome.storage.local` for running state/progress and `chrome.storage.sync` for user configuration. Never put API keys, cookies, or personal data in source, logs, screenshots, or handoff documents.
- A click is not success. Increment a counter only after Facebook exposes the expected confirmation/state change.
- Every long loop must check its stop flag and run id frequently, survive SPA rerenders, and avoid holding stale DOM nodes across navigation.
- Do not process Messenger, comments/replies, sponsored posts, or a different route as the target post unless the feature explicitly allows it.
- Preserve the existing backup directory. Do not delete or reset user worktree files without explicit approval.
- When testing a logged-in Facebook account, use read-only inspection unless the user explicitly authorizes a real action; never silently publish, comment, join, invite, or share.

## AI configuration

All AI features use the unified provider/key/model/Custom URL configuration implemented in `popup.js` and `background.js`. Keep provider profiles persistent and do not add a second unrelated API-key store.

## Verification

Run these checks after code changes:

```powershell
node --check background.js
node --check content.js
node --check feed.js
node --check group.js
node --check i18n.js
node --check scrape.js
node --check share.js
node --check sales.js
node --check popup.js
node -e "const m=require('./manifest.json'); console.log(m.version)"
```

For a browser regression test: reload the unpacked extension, reload the Facebook tab, reset only the relevant feature's run state, and test one item/group before a larger run. Record the observed status and route before changing selectors.

## Feature entry points

| Feature | Main files | State prefix / keys |
| --- | --- | --- |
| Kết bạn | `content.js` | `friendRunState`, `friendProfileHistory`, `isRunning` |
| Tham gia nhóm | `group.js` | `groupJoin*`, `discover*`, `isGroupJoining`, `isDiscoverJoining` |
| Bản tin, cảm xúc, Comment AI, Đăng bài AI | `feed.js` | `isFeedInteracting`, `isAICommenting`, `groupPost*` |
| Cào bài | `scrape.js` | `isScraping`, `scrape*`, `styleProfiles` |
| Share bài vào nhóm | `share.js` | `groupShare*` |
| Đăng bài bán hàng bằng AI | `sales.js` | `salesPost*` |
| Popup/config/background | `popup.js`, `popup.html`, `background.js` | unified AI config and UI state |

## Current release

Current source version is **1.9.26**. Universal Stop rule: Stop/Reset buttons broadcast to every Facebook tab and write stop flags directly; reload-resumes run only in the owner tab (`ownerTabId`) and only while the run flag is on; every long wait polls the flag and a final stop check gates each irreversible action (comment/post/share/join/invite/confirm-friend). Universal Start rule: persist the run (active/config/counters) BEFORE navigating or sending, so the tab self-resumes the exact task after any redirect/reload/failed send with a single press; a failed send only reports an error when the run flag is off. Group posting has a Reset button; group resumes return to the right group when off-route. Posted text is sanitized against U+FFFD/lone surrogates (`sanitizePostedText`/`sanitizeCommentOutput`), typed and truncated by code-point, never by UTF-16 unit. The UI is bilingual (Vietnamese/English) via the shared `i18n.js` dictionary and `t()` helper used by the popup, all content scripts and the background worker; the language switcher in the popup header persists to `chrome.storage.sync.uiLang`. Never translate Facebook-matching selectors/regexes — only extension-displayed text. Error-classifying regexes must match all UI languages; cross-file signals use `code` fields, not message text. Feed Comment AI re-finds the exact post by identity when the feed recycles its node during AI waits instead of silently skipping, and waits unboundedly for a slow comment box with an elapsed-seconds status. The fallback-comment path keeps the translator callable, so an API failure or economy mode still yields a safe local comment. Keyword group join persists `groupJoinRunConfig` before navigating so the tab self-resumes the exact keyword after any redirect/reload/failed send without another Start press, keeping the joined counter; switching keywords mid-run is blocked until Stop. Opening the popup returns to the running feature's panel (Đăng bán > Share > Group > Feed > Scrape > Friend) or the last opened tab (`popupLastTab`); the keyword join route matches the actual `q` query so a new keyword always navigates. Group interact AI comments now report per-post skip reasons (`groupInteractAiSkipped`) in the status line and return to the group when a comment click navigates away. Every Start button switches to a running state (⏳ + `running` class) immediately when pressed and restores it on popup reopen from its `*Active` flag; Group interact/post/Share and Đăng bán have their own running helpers. Every Start button first routes the tab to its task URL (search/discover/feed/first selected group) no matter which page is open; feed interaction runs only on the main feed and returns there via pending state when off-route. The previous Group interact update adds a target-group limit (first N checked groups) plus an optional per-post AI comment using the shared AI config, with its own `groupInteractCommentHistory/Guard/AiDone` state. The latest Group post fixes keep Random background selection on solid colors, reject gradient/illustration labels, randomize among the colors actually exposed by each group, and avoid repeating the last confirmed color when another is available. Group join recognizes Facebook's “Trả lời câu hỏi” dialog, selects checkbox answers, and waits for the enabled submit button before sending. Share bài still waits for Facebook to rebuild the preview after URL removal and verifies that the same permalink/media/card identity remains before publishing. Đăng bán là state machine riêng trong `sales.js`, có tab UI riêng, chọn nhiều ảnh/video cùng lúc, xác nhận đủ media trước khi nhập và đăng, prompt biến thể theo nhóm, hồ sơ văn phong và dùng chung cấu hình AI nhưng không dùng selector/counter/proof của các luồng khác. Friend confirmation is a separate `/friends/requests` state machine with `friendConfirm*` storage, numeric/keyword filters, profile inspection, and visible success proof before counting. See `CODEX_HANDOFF.md` for the complete transfer checklist.
### v1.9.4 test fixes

- Group Interact and Group Post use unique run IDs and per-group guards; Group Post records submit stages and fails closed after an ambiguous/reloaded click. Scrape canonicalizes Facebook host aliases before navigation and Reset writes storage even when no Facebook tab is reachable.
