// page.js - Nuôi Page: chọn Page đang quản trị và tham gia nhóm
// theo từ khóa / nhóm đề xuất. Luồng này cố ý tách khỏi group.js:
// state, selector, actor verification, counter và success proof đều riêng.
(() => {
  const FLAG = "pageGroupJoinActive";
  const STATE_KEY = "pageGroupJoinRunState";
  const CONFIG_KEY = "pageGroupJoinConfig";
  const PAGE_MANAGER_URL = "https://www.facebook.com/pages/?category=your_pages";
  const DISCOVER_URL = "https://www.facebook.com/groups/discover";

  let active = false;
  let currentRunId = "";
  let currentConfig = null;
  let joined = 0;
  let skipped = 0;
  let nextAllowedAt = 0;
  let attempted = new Set();

  // Page Care feature state is intentionally separate from pageGroupJoin*.
  const PAGE_POST_FLAG = "pageGroupPostActive";
  const PAGE_WATCH_FLAG = "pageWatchActive";
  const PAGE_COMMENT_FLAG = "pageCommentActive";
  let pagePostRunId = "", pageWatchRunId = "", pageCommentRunId = "";
  let pagePostConfig = null, pageWatchConfig = null, pageCommentConfig = null;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const clean = value => String(value || "").replace(/[\u200B-\u200D\u2060\uFEFF]/g, "").replace(/\s+/g, " ").trim();
  const visible = el => {
    if (!el?.isConnected || el.offsetParent === null) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const labelOf = el => clean(el?.innerText || el?.textContent || el?.getAttribute?.("aria-label") || el?.getAttribute?.("title"));
  const facebookUrl = value => {
    try {
      const url = new URL(String(value || ""), location.origin);
      const host = url.hostname.toLowerCase();
      if (!(host === "facebook.com" || host.endsWith(".facebook.com"))) return null;
      url.hash = "";
      ["ref", "refid", "__tn__", "__cft__", "mibextid", "locale"].forEach(key => url.searchParams.delete(key));
      return url;
    } catch (_) { return null; }
  };
  const canonicalUrl = value => {
    const url = facebookUrl(value);
    return url ? url.toString().replace(/\/$/, "") : "";
  };
  const pageKey = page => {
    const url = facebookUrl(page?.url || page);
    if (!url) return clean(page?.id || page?.name).toLowerCase();
    const id = url.searchParams.get("id");
    if (id) return `id:${id}`;
    return url.pathname.replace(/\/+$/, "").toLowerCase() || canonicalUrl(url);
  };
  const groupKey = href => {
    const url = facebookUrl(href);
    if (!url) return "";
    const match = url.pathname.match(/^\/groups\/([^/?#]+)/i);
    return match ? `/groups/${String(match[1]).toLowerCase()}` : "";
  };
  const groupUrlFromKey = key => `https://www.facebook.com${String(key || "")}/`;
  const routeUrl = config => config?.mode === "discover"
    ? DISCOVER_URL
    : `https://www.facebook.com/search/groups/?q=${encodeURIComponent(String(config?.keyword || "").trim())}`;
  const routeMatches = config => {
    const current = facebookUrl(location.href);
    if (!current) return false;
    if (config?.mode === "discover") return /^\/groups\/discover(?:\/|$)/i.test(current.pathname);
    return /^\/search\/groups(?:\/|$)/i.test(current.pathname) && current.searchParams.get("q") === String(config?.keyword || "").trim();
  };
  const successLabel = /(truy cập(?: vào nhóm)?|đã tham gia|đã gửi yêu cầu|hủy yêu cầu|request sent|joined|pending|visit group|cancel request|membership request is pending)/i;
  const joinLabel = /^(?:tham gia(?: nhóm)?|yêu cầu tham gia|join(?: group)?|request to join|join as|tham gia với tư cách)/i;
  const questionDialogLabel = /trả lời (?:các )?câu hỏi|câu hỏi dành cho người tham gia|yêu cầu tham gia của bạn đang chờ|membership questions|answer (?:the )?questions|review (?:your )?(?:membership|join)|xem xét quyền tham gia|quy tắc nhóm|group rules/i;

  async function owns(runId, ownerTabId) {
    if (!runId || !ownerTabId) return true;
    try {
      const result = await chrome.runtime.sendMessage({ action: "getSenderTabId" });
      return !result?.tabId || result.tabId === ownerTabId;
    } catch (_) { return true; }
  }

  async function live(runId = currentRunId) {
    if (!active || (runId && currentRunId && runId !== currentRunId)) return false;
    try {
      const stored = await chrome.storage.local.get([FLAG, STATE_KEY]);
      return !!stored[FLAG] && (!runId || !stored[STATE_KEY]?.runId || stored[STATE_KEY].runId === runId);
    } catch (_) { return false; }
  }

  async function liveAiConfig() {
    const runtime = currentConfig?.aiConfig || {};
    if (runtime.key) return runtime;
    try {
      const [sync, local] = await Promise.all([
        chrome.storage.sync.get(["aiProvider", "aiApiKey", "aiModel", "aiCustomUrl", "aiKeys"]),
        chrome.storage.local.get("unifiedAiProfiles")
      ]);
      const provider = runtime.provider || sync.aiProvider || "gemini";
      const saved = sync.aiKeys?.[provider] || local.unifiedAiProfiles?.[provider] || {};
      return {
        provider,
        key: saved.key || (provider === sync.aiProvider ? sync.aiApiKey : "") || "",
        model: runtime.model || saved.model || (provider === sync.aiProvider ? sync.aiModel : "") || "",
        url: runtime.url || saved.url || (provider === sync.aiProvider ? sync.aiCustomUrl : "") || ""
      };
    } catch (_) { return runtime; }
  }

  async function writeState(patch = {}) {
    const state = {
      active,
      runId: currentRunId,
      ownerTabId: currentConfig?.ownerTabId || 0,
      config: currentConfig ? { ...currentConfig, aiConfig: currentConfig.aiConfig ? { ...currentConfig.aiConfig, key: undefined } : undefined } : null,
      joined,
      skipped,
      nextAllowedAt,
      attemptedKeys: [...attempted],
      status: patch.status || "",
      ...patch
    };
    if (state.config?.aiConfig) delete state.config.aiConfig.key;
    await chrome.storage.local.set({
      [FLAG]: active,
      [STATE_KEY]: state,
      pageGroupJoinJoined: joined,
      pageGroupJoinSkipped: skipped,
      pageGroupJoinStatus: state.status || "",
      pageGroupJoinNextAt: nextAllowedAt,
      pageGroupJoinAttemptedKeys: [...attempted]
    });
  }

  function pageNameInText(text, name) {
    const haystack = clean(text).toLocaleLowerCase("vi");
    const needle = clean(name).toLocaleLowerCase("vi");
    return !!needle && haystack.includes(needle);
  }

  function actorEvidence(page) {
    if (!page?.name) return false;
    const name = clean(page.name);
    const currentPath = facebookUrl(location.href)?.pathname || "";
    const pagePath = facebookUrl(page.url)?.pathname || "";
    if (pagePath && currentPath === pagePath) return true;
    const nodes = [...document.querySelectorAll('[aria-label],button,[role="button"],[role="menuitem"]')]
      .filter(visible)
      .map(labelOf)
      .filter(Boolean);
    return nodes.some(text => pageNameInText(text, name) && /(trang|page|hồ sơ|profile|account|tài khoản|đang dùng|acting as|switch)/i.test(text));
  }

  function managedPageLinks() {
    const managerRoute = /\/pages(?:\/|$)/i.test(location.pathname);
    const excluded = /^(?:home|friends|groups|watch|reels?|marketplace|events|messages|notifications|settings|search|login|privacy|help|photo|video|stories|story|permalink|share)$/i;
    const results = [];
    const seen = new Set();
    for (const link of document.querySelectorAll('a[href]')) {
      if (!visible(link)) continue;
      const url = facebookUrl(link.href);
      if (!url) continue;
      const parts = url.pathname.split("/").filter(Boolean);
      const isPagePath = /^\/pages(?:\/|$)/i.test(url.pathname) || (managerRoute && parts.length === 1 && !excluded.test(parts[0]));
      if (!isPagePath) continue;
      const card = link.closest('[role="article"],li,[data-pagelet],div[role="listitem"]') || link.parentElement;
      const cardText = clean(card?.innerText || link.innerText || link.getAttribute("aria-label"));
      if (!managerRoute && !/quản lý|manage|trang của bạn|your pages/i.test(cardText)) continue;
      const heading = card?.querySelector?.('h1,h2,h3,h4,[role="heading"]');
      const name = clean(link.getAttribute("aria-label") || link.innerText || heading?.innerText || link.textContent || cardText.split("\n")[0]);
      if (!name || name.length < 2 || name.length > 140 || /^(?:xem|see|quản lý|manage|trang|pages?)$/i.test(name)) continue;
      const item = { id: url.searchParams.get("id") || parts[parts.length - 1] || name, name, url: canonicalUrl(url) };
      const key = pageKey(item);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      results.push(item);
    }
    return results.slice(0, 100);
  }

  function groupCardForLink(link) {
    const candidates = [
      link.closest('[role="article"]'),
      link.closest('li'),
      link.closest('[data-pagelet]'),
      link.closest('div[role="listitem"]'),
      link.parentElement?.parentElement,
      link.parentElement
    ].filter(Boolean);
    const withJoin = candidates.filter(node => [...node.querySelectorAll('button,[role="button"],a')].some(control => joinLabel.test(labelOf(control))));
    return withJoin.sort((a, b) => {
      const aLinks = a.querySelectorAll('a[href*="/groups/"]').length;
      const bLinks = b.querySelectorAll('a[href*="/groups/"]').length;
      return (aLinks - bLinks) || (a.innerText.length - b.innerText.length);
    })[0] || candidates[0] || null;
  }

  function findJoinControl(card) {
    if (!card) return null;
    const controls = [...card.querySelectorAll('button,[role="button"],a')].filter(visible);
    const candidate = controls.find(control => {
      const text = labelOf(control);
      if (!text || !joinLabel.test(text)) return false;
      if (/mời|invite|rời|leave|hủy|cancel|đã tham gia|joined|đang chờ|pending|truy cập|visit/i.test(text)) return false;
      return true;
    });
    return candidate || null;
  }

  function findGroupCards() {
    const seen = new Set();
    const cards = [];
    for (const link of document.querySelectorAll('a[href*="/groups/"]')) {
      const key = groupKey(link.href);
      if (!key || seen.has(key)) continue;
      const card = groupCardForLink(link);
      if (!card || !visible(card)) continue;
      const text = clean(card.innerText || card.textContent);
      if (!text || /được tài trợ|sponsored|messenger|tin nhắn/i.test(text)) continue;
      const button = findJoinControl(card);
      if (!button) continue;
      const name = clean(link.innerText || link.getAttribute("aria-label") || text.split("\n")[0]);
      if (!name) continue;
      seen.add(key);
      cards.push({ key, url: canonicalUrl(link.href) || groupUrlFromKey(key), name, card, button });
    }
    return cards;
  }

  async function controlledClick(element, runId) {
    if (!element || !visible(element) || !(await live(runId))) return false;
    try { element.scrollIntoView({ behavior: "instant", block: "center" }); } catch (_) { try { element.scrollIntoView({ block: "center" }); } catch (_) {} }
    await sleep(180);
    if (!(await live(runId))) return false;
    const rect = element.getBoundingClientRect();
    try {
      const trusted = await chrome.runtime.sendMessage({ action: "trustedMouse", kind: "click", x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) });
      if (trusted?.ok) return true;
    } catch (_) {}
    try { element.click(); return true; } catch (_) { return false; }
  }

  function visibleQuestionDialog() {
    return [...document.querySelectorAll('div[role="dialog"],[aria-modal="true"]')]
      .find(dialog => visible(dialog) && questionDialogLabel.test(clean(dialog.innerText || dialog.getAttribute("aria-label"))));
  }

  function inputQuestion(input, index) {
    const labelled = clean(input.getAttribute("aria-label") || input.getAttribute("placeholder"));
    if (labelled && !/trả lời|answer|viết|write/i.test(labelled)) return labelled;
    let node = input;
    for (let level = 0; level < 5 && node; level++, node = node.parentElement) {
      let sibling = node.previousElementSibling;
      while (sibling) {
        const text = clean(sibling.innerText || sibling.textContent);
        if (text.length > 5 && text.length < 500 && !/viết câu trả lời|write an answer/i.test(text)) return text;
        sibling = sibling.previousElementSibling;
      }
    }
    return t("pgq.questionFallback", { n: index + 1 });
  }

  function consentQuestion(question) {
    return /đồng ý|chấp nhận|cam kết|tuân thủ|quy tắc|nội quy|quy định|không quảng cáo|không spam|không bán hàng|tôn trọng thành viên|group rules|agree|follow the rules/i.test(clean(question));
  }

  function pageCannedAnswer(question, index) {
    const answers = Array.isArray(currentConfig?.answers) && currentConfig.answers.length ? currentConfig.answers : t("pg.answersDefault").split("\n");
    if (consentQuestion(question)) return answers[0] || t("pg.answersDefault").split("\n")[0];
    if (/mục đích|lý do|tham gia để|mong muốn|đóng góp|why|purpose/i.test(question)) return answers[1] || answers[0];
    return answers[index % Math.max(1, answers.length)] || answers[0];
  }

  function checkboxChecked(box) {
    if (box.matches?.('input[type="checkbox"]')) return !!box.checked;
    return String(box.getAttribute("aria-checked") || box.getAttribute("data-checked") || box.getAttribute("aria-pressed") || "").toLowerCase() === "true";
  }

  async function selectDialogCheckboxes(dialog, runId) {
    for (let pass = 0; pass < 3; pass++) {
      const current = visibleQuestionDialog() || dialog;
      const boxes = [...current.querySelectorAll('input[type="checkbox"],[role="checkbox"]')];
      const unchecked = boxes.filter(box => !checkboxChecked(box));
      if (!unchecked.length) return true;
      let clicked = false;
      for (const box of unchecked) {
        const target = box.closest("label,[role=checkbox]") || box;
        if (await controlledClick(target, runId)) clicked = true;
        await sleep(220);
      }
      if (!clicked) break;
    }
    const current = visibleQuestionDialog() || dialog;
    return [...current.querySelectorAll('input[type="checkbox"],[role="checkbox"]')].every(checkboxChecked);
  }

  async function answerPageQuestions(groupName, runId) {
    // Facebook có thể dựng dialog chậm hoặc dựng lại dialog sau checkbox.
    // Không giữ node cũ qua các lượt render.
    for (let pass = 0; pass < 16; pass++) {
      if (!(await live(runId))) return { ok: false, hadDialog: true };
      const dialog = visibleQuestionDialog();
      if (!dialog) {
        if (pass >= 5) return { ok: true, hadDialog: false };
        await sleep(650);
        continue;
      }
      await chrome.storage.local.set({ pageGroupJoinStatus: t("pgq.reviewing", { name: groupName }) });
      if (!(await selectDialogCheckboxes(dialog, runId))) return { ok: false, hadDialog: true };
      const current = visibleQuestionDialog() || dialog;
      const inputs = [...current.querySelectorAll('textarea,input[type="text"],[role="textbox"],[contenteditable="true"]')]
        .filter(input => visible(input) && !input.disabled && input.getAttribute("aria-disabled") !== "true");
      const questions = inputs.map(inputQuestion);
      const answers = Array(inputs.length).fill("");
      const aiIndexes = questions.map((question, index) => consentQuestion(question) ? -1 : index).filter(index => index >= 0);
      if (currentConfig?.aiEnabled && aiIndexes.length) {
        await chrome.storage.local.set({ pageGroupJoinStatus: t("pgq.aiThinking", { n: aiIndexes.length, name: groupName }) });
        let response = null;
        try {
          response = await chrome.runtime.sendMessage({
            action: "aiAnswerJoinQuestions",
            groupName,
            questions: aiIndexes.map(index => questions[index]),
            prompt: currentConfig.aiPrompt,
            aiConfig: await liveAiConfig()
          });
        } catch (_) {}
        if (response?.ok) (response.answers || []).slice(0, aiIndexes.length).forEach((answer, index) => { answers[aiIndexes[index]] = clean(answer); });
        if (aiIndexes.some(index => !answers[index])) return { ok: false, hadDialog: true };
      }
      let filled = 0;
      for (let index = 0; index < inputs.length; index++) {
        if (!(await live(runId))) return { ok: false, hadDialog: true };
        const input = inputs[index];
        const answer = answers[index] || pageCannedAnswer(questions[index], index);
        try {
          input.scrollIntoView({ block: "center" });
          input.click();
          input.focus();
          document.execCommand("selectAll", false, null);
          const typed = await chrome.runtime.sendMessage({ action: "trustedInput", text: answer, pressEnter: false });
          const actual = clean(input.value || input.innerText || input.textContent);
          if (!typed?.ok || actual.length < 2) continue;
          filled++;
        } catch (_) {}
      }
      if (filled < inputs.length) return { ok: false, hadDialog: true };
      let submit = null;
      for (let attempt = 0; attempt < 12 && !submit; attempt++) {
        const liveDialog = visibleQuestionDialog() || dialog;
        submit = [...liveDialog.querySelectorAll('button,[role="button"],div[role="button"]')]
          .find(button => visible(button) && /^(?:gửi|gửi yêu cầu|send|submit|hoàn tất|done|tiếp|tiếp tục|continue|next|tham gia nhóm|join group|xác nhận|confirm)$/i.test(labelOf(button)) && button.getAttribute("aria-disabled") !== "true" && !button.disabled);
        if (!submit) await sleep(350);
      }
      if (!submit || !(await controlledClick(submit, runId))) return { ok: false, hadDialog: true };
      const end = Date.now() + 9000;
      while (Date.now() < end) {
        if (!(await live(runId))) return { ok: false, hadDialog: true };
        if (!visibleQuestionDialog()) return { ok: true, hadDialog: true };
        await sleep(450);
      }
      return { ok: false, hadDialog: true };
    }
    return { ok: false, hadDialog: true };
  }

  async function switchToSelectedPage(page, runId) {
    if (actorEvidence(page)) return true;
    const switchButtons = [...document.querySelectorAll('button,[role="button"],[aria-haspopup="menu"]')]
      .filter(visible)
      .filter(button => /xem tất cả trang cá nhân|see all profiles|chuyển (?:sang|đổi) (?:trang|hồ sơ|tài khoản)|switch profile|switch account|đổi tài khoản|switch/i.test(labelOf(button)));
    for (const button of switchButtons) {
      if (!(await controlledClick(button, runId))) continue;
      await sleep(500);
      const option = [...document.querySelectorAll('[role="menuitem"],a,button,[role="button"]')]
        .filter(visible)
        .find(item => pageNameInText(labelOf(item), page.name) && !/nhóm|group/i.test(labelOf(item)));
      if (option && await controlledClick(option, runId)) {
        const deadline = Date.now() + 12000;
        while (Date.now() < deadline) {
          if (!(await live(runId))) return false;
          if (actorEvidence(page)) return true;
          await sleep(500);
        }
      }
    }
    return actorEvidence(page);
  }

  async function waitJoinProof(item, initialLabel, runId) {
    const deadline = Date.now() + 30000;
    let sawDialog = false;
    while (Date.now() < deadline) {
      if (!(await live(runId))) return false;
      if (visibleQuestionDialog()) { sawDialog = true; await sleep(500); continue; }
      // Facebook có thể thay toàn bộ card sau cú click. Tìm lại theo group
      // key mỗi vòng, không giữ DOM node cũ làm bằng chứng thành công.
      const liveLink = [...document.querySelectorAll('a[href*="/groups/"]')]
        .find(link => groupKey(link.href) === item.key);
      const liveCard = liveLink ? groupCardForLink(liveLink) : null;
      const liveControls = [
        ...(item.button?.isConnected ? [item.button] : []),
        ...(liveCard ? [...liveCard.querySelectorAll('button,[role="button"],a')] : [])
      ].filter(visible);
      const buttonText = liveControls.map(labelOf).find(text => successLabel.test(text) && text !== initialLabel) || "";
      if (buttonText) return true;
      const cardText = liveCard ? clean(liveCard.innerText || liveCard.textContent) : (item.card?.isConnected ? clean(item.card.innerText || item.card.textContent) : "");
      if (cardText && successLabel.test(cardText) && pageNameInText(cardText, item.name)) return true;
      const bodyText = clean(document.body?.innerText || "");
      if (sawDialog && successLabel.test(bodyText) && pageNameInText(bodyText, item.name)) return true;
      await sleep(700);
    }
    return false;
  }

  async function waitUntilAllowed(runId) {
    while (Date.now() < nextAllowedAt) {
      if (!(await live(runId))) return false;
      await sleep(Math.min(800, Math.max(100, nextAllowedAt - Date.now())));
    }
    return live(runId);
  }

  function randomDelay() {
    const min = Math.max(5, parseInt(currentConfig?.minDelay) || 15) * 1000;
    const max = Math.max(min, (parseInt(currentConfig?.maxDelay) || 30) * 1000);
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  async function returnToSource(runId) {
    if (!(await live(runId)) || routeMatches(currentConfig)) return true;
    location.replace(routeUrl(currentConfig));
    return false;
  }

  async function processCard(item, runId) {
    if (attempted.has(item.key)) return false;
    attempted.add(item.key);
    await writeState({ status: t("pg.processing", { name: item.name }) });
    if (!(await waitUntilAllowed(runId))) return false;
    const directPageControl = pageNameInText(labelOf(item.button), currentConfig.page.name);
    if (!directPageControl && !(await switchToSelectedPage(currentConfig.page, runId))) {
      skipped++;
      nextAllowedAt = Date.now() + randomDelay();
      await writeState({ status: t("pg.noPageActor", { name: currentConfig.page.name }), skipped });
      return false;
    }
    const button = item.button?.isConnected ? item.button : findJoinControl(item.card);
    if (!button || successLabel.test(labelOf(button))) {
      skipped++;
      nextAllowedAt = Date.now() + randomDelay();
      await writeState({ status: t("pg.questionFailed", { name: item.name }), skipped });
      return false;
    }
    const initialLabel = labelOf(button);
    if (!(await controlledClick(button, runId))) {
      skipped++;
      nextAllowedAt = Date.now() + randomDelay();
      await writeState({ status: t("pg.unconfirmed", { name: item.name }), skipped });
      return false;
    }
    const answered = await answerPageQuestions(item.name, runId);
    if (!answered.ok) {
      skipped++;
      nextAllowedAt = Date.now() + randomDelay();
      await writeState({ status: t("pg.questionFailed", { name: item.name }), skipped });
      return false;
    }
    const proof = await waitJoinProof(item, initialLabel, runId);
    if (!proof) {
      skipped++;
      nextAllowedAt = Date.now() + randomDelay();
      await writeState({ status: t("pg.unconfirmed", { name: item.name }), skipped });
      return false;
    }
    joined++;
    nextAllowedAt = Date.now() + randomDelay();
    const history = await chrome.storage.local.get("pageGroupJoinHistory");
    const rows = Array.isArray(history.pageGroupJoinHistory) ? history.pageGroupJoinHistory : [];
    rows.push({ pageKey: pageKey(currentConfig.page), groupKey: item.key, status: "confirmed", at: Date.now() });
    await chrome.storage.local.set({ pageGroupJoinHistory: rows.slice(-500) });
    await writeState({ status: t("pg.confirmed", { name: item.name }), joined, skipped });
    return true;
  }

  async function joinLoop(runId, resume = false) {
    if (!(await live(runId))) return;
    if (!routeMatches(currentConfig)) { await returnToSource(runId); return; }
    let emptyRounds = 0;
    while (await live(runId)) {
      if (joined >= Math.max(1, parseInt(currentConfig.target) || 1)) {
        active = false;
        await writeState({ active: false, status: t("pg.done", { joined }) });
        return;
      }
      if (!routeMatches(currentConfig)) { await returnToSource(runId); return; }
      const cards = findGroupCards();
      const available = cards.filter(card => !attempted.has(card.key));
      if (!available.length) {
        emptyRounds++;
        if (emptyRounds >= 4) {
          active = false;
          await writeState({ active: false, status: t("pg.noMore", { joined, skipped }) });
          return;
        }
        window.scrollBy({ top: Math.max(420, Math.floor(window.innerHeight * 0.8)), behavior: "smooth" });
        await sleep(1400);
        continue;
      }
      emptyRounds = 0;
      for (const item of available) {
        if (!(await live(runId)) || joined >= Math.max(1, parseInt(currentConfig.target) || 1)) break;
        await processCard(item, runId);
        await writeState({ joined, skipped, status: t("pg.progress", { joined, target: currentConfig.target, skipped }) });
        if (!(await live(runId))) return;
      }
      window.scrollBy({ top: Math.max(420, Math.floor(window.innerHeight * 0.8)), behavior: "smooth" });
      await sleep(1200);
    }
  }

  // -----------------------------------------------------------------------
  // Page group posts. This is a separate state machine from feed.js Group
  // Post: it verifies the Page actor, owns its composer, and has its own proof.
  // -----------------------------------------------------------------------
  async function pageFeatureLive(flag, runId) {
    if (!runId) return false;
    try {
      const stored = await chrome.storage.local.get([flag, `${flag}RunId`]);
      return !!stored[flag] && (!stored[`${flag}RunId`] || stored[`${flag}RunId`] === runId);
    } catch (_) { return false; }
  }

  async function pageFeatureClick(element, flag, runId) {
    if (!element || !visible(element) || !(await pageFeatureLive(flag, runId))) return false;
    try { element.scrollIntoView({ behavior: "instant", block: "center" }); } catch (_) { try { element.scrollIntoView({ block: "center" }); } catch (_) {} }
    await sleep(180);
    if (!(await pageFeatureLive(flag, runId))) return false;
    const rect = element.getBoundingClientRect();
    try {
      const trusted = await chrome.runtime.sendMessage({ action: "trustedMouse", kind: "click", x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) });
      if (trusted?.ok) return true;
    } catch (_) {}
    try { element.click(); return true; } catch (_) { return false; }
  }

  async function pageSwitchActor(page, flag, runId) {
    if (actorEvidence(page)) return true;
    const controls = [...document.querySelectorAll('button,[role="button"],[aria-haspopup="menu"]')]
      .filter(visible)
      .filter(button => /xem tất cả trang cá nhân|see all profiles|chuyển (?:sang|đổi) (?:trang|hồ sơ|tài khoản)|switch profile|switch account|đổi tài khoản|switch/i.test(labelOf(button)));
    for (const control of controls) {
      if (!(await pageFeatureClick(control, flag, runId))) continue;
      await sleep(500);
      const option = [...document.querySelectorAll('[role="menuitem"],a,button,[role="button"]')]
        .filter(visible)
        .find(item => pageNameInText(labelOf(item), page.name) && !/nhóm|group/i.test(labelOf(item)));
      if (option && await pageFeatureClick(option, flag, runId)) {
        const deadline = Date.now() + 12000;
        while (Date.now() < deadline) {
          if (!(await pageFeatureLive(flag, runId))) return false;
          if (actorEvidence(page)) return true;
          await sleep(500);
        }
      }
    }
    return actorEvidence(page);
  }

  function pageGroupRoute() {
    return /^\/groups\/[^/]+/i.test(facebookUrl(location.href)?.pathname || "");
  }
  function pageCurrentGroupKey() { return groupKey(location.href); }
  function pageCurrentGroupName() {
    const heading = [...document.querySelectorAll('h1,h2,[role="heading"]')].filter(visible)
      .map(labelOf).find(text => text && text.length >= 2 && text.length <= 180);
    return heading || clean(document.title).replace(/\s*[|·].*$/, "").slice(0, 180);
  }
  function pageRecentGroupPosts() {
    const rows = [];
    const seen = new Set();
    for (const node of [...document.querySelectorAll('[role="article"],article,[data-pagelet^="FeedUnit_"]')]) {
      if (!visible(node) || node.closest('[role="dialog"]')) continue;
      const text = clean(node.innerText || node.textContent);
      if (text.length < 30 || /được tài trợ|sponsored|tin nhắn|messenger/i.test(text)) continue;
      const key = text.slice(0, 180).toLocaleLowerCase("vi");
      if (seen.has(key)) continue;
      seen.add(key); rows.push(text.slice(0, 900));
      if (rows.length >= 8) break;
    }
    return rows;
  }
  function pageGroupPostOpener() {
    const labels = /^(?:bạn\s+(?:đang\s+)?(?:viết|nghĩ)\s+gì(?:\s+đi)?(?:\s+thế)?\s*\??|viết gì đó\.?|tạo bài viết|write something|create post)$/i;
    return [...document.querySelectorAll('[role="main"] [role="button"],[role="main"] button,[role="main"] [tabindex],button,[role="button"]')]
      .filter(visible).filter(control => !control.closest('[role="dialog"]')).find(control => labels.test(labelOf(control))) || null;
  }
  function pageGroupPostEditor(dialog) {
    return [...(dialog || document).querySelectorAll('[contenteditable="true"][role="textbox"],[contenteditable="true"]')]
      .find(box => visible(box) && !/bình luận|comment/i.test(box.getAttribute("aria-label") || "")) || null;
  }
  function pageGroupPostDialog() {
    return [...document.querySelectorAll('[role="dialog"],[aria-modal="true"]')].filter(visible).find(dialog => {
      if (!pageGroupPostEditor(dialog)) return false;
      const text = clean(dialog.innerText || dialog.getAttribute("aria-label"));
      return /tạo bài viết|create post|bài viết|post/i.test(text);
    }) || null;
  }
  function pageGroupPostButton(dialog) {
    return [...(dialog || document).querySelectorAll('button,[role="button"],div[role="button"]')]
      .filter(visible).find(button => /^(?:đăng|post|publish|gửi|send)$/i.test(labelOf(button)) && !button.disabled && button.getAttribute("aria-disabled") !== "true") || null;
  }
  async function waitPageGroupComposer(flag, runId, timeoutMs = 15000) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      if (!(await pageFeatureLive(flag, runId))) return null;
      const dialog = pageGroupPostDialog(), editor = dialog && pageGroupPostEditor(dialog);
      if (dialog && editor) return { dialog, editor };
      await sleep(350);
    }
    return null;
  }
  async function pageClearGroupDraft(editor, flag, runId) {
    const current = clean(editor?.innerText || editor?.textContent || editor?.value);
    if (!current) return true;
    try { editor.focus(); editor.click(); } catch (_) {}
    try { await chrome.runtime.sendMessage({ action: "trustedKey", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: /Mac|iPhone|iPad/i.test(navigator.platform || "") ? 4 : 2, abortStorageKey: flag, abortRunId: runId }); } catch (_) {}
    try { await chrome.runtime.sendMessage({ action: "trustedKey", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8, abortStorageKey: flag, abortRunId: runId }); } catch (_) {}
    await sleep(250);
    return !clean(editor.innerText || editor.textContent || editor.value);
  }
  function pageGroupPostVisible(content) {
    const expected = clean(content).slice(0, 80).toLocaleLowerCase("vi");
    if (expected.length < 10) return false;
    const root = document.querySelector('[role="main"]') || document.body;
    return [...root.querySelectorAll('[role="article"],article,[data-pagelet]')]
      .filter(visible)
      .filter(node => !node.closest('[role="dialog"],[aria-modal="true"]'))
      .some(card => {
        const textNodes = [...card.querySelectorAll('span,p,div')]
          .filter(node => visible(node) && !node.querySelector('[contenteditable="true"],[role="textbox"]'))
          .filter(node => !node.closest('[contenteditable="true"],[role="textbox"],[role="dialog"],[aria-modal="true"]'));
        return textNodes.some(node => {
          const text = clean(node.innerText || node.textContent).toLocaleLowerCase("vi");
          return text.length < 1500 && text.includes(expected);
        });
      });
  }
  async function pageSubmitGroupPost(composer, content, flag, runId, groupName) {
    if (!(await pageFeatureLive(flag, runId))) return false;
    const button = pageGroupPostButton(composer.dialog);
    if (!button) return false;
    await chrome.storage.local.set({ pageGroupPostStage: "submit-armed", pageGroupPostStatus: t("pgp.submitting", { name: groupName }) });
    if (!(await pageFeatureLive(flag, runId))) return false;
    if (!(await pageFeatureClick(button, flag, runId))) return false;
    await chrome.storage.local.set({ pageGroupPostStage: "submit-dispatched", pageGroupPostSubmitAt: Date.now() });
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (!(await pageFeatureLive(flag, runId))) return false;
      const statusText = clean([...document.querySelectorAll('[role="status"],[role="alert"]')].filter(visible).map(labelOf).join(" "));
      if (pageGroupPostVisible(content) || /bài viết.{0,80}(?:đã đăng|đang chờ|phê duyệt)|post.{0,80}(?:published|pending|review)/i.test(statusText)) return true;
      await sleep(500);
    }
    return false;
  }
  function pagePostSkipCount() {
    pagePostConfig.skipped = (pagePostConfig.skipped || 0) + 1;
    return pagePostConfig.skipped;
  }
  async function closePageGroupComposer() {
    const dialog = pageGroupPostDialog();
    if (!dialog) return true;
    const close = [...dialog.querySelectorAll('button,[role="button"]')].filter(visible).find(button => /^(?:đóng|close)$/i.test(labelOf(button)));
    if (close) { try { close.click(); } catch (_) {} await sleep(400); }
    const discard = [...document.querySelectorAll('button,[role="button"]')].filter(visible).find(button => /^(?:bỏ|bỏ bài viết|discard|discard post)$/i.test(labelOf(button)));
    if (discard) { try { discard.click(); } catch (_) {} await sleep(400); }
    return !pageGroupPostDialog();
  }
  async function pageGroupPostOne(group, runId, index) {
    if (!(await pageFeatureLive(PAGE_POST_FLAG, runId))) return false;
    if (!pageGroupRoute() || pageCurrentGroupKey() !== group.key) { location.replace(group.url); return false; }
    if (!(await pageSwitchActor(pagePostConfig.page, PAGE_POST_FLAG, runId))) {
      await chrome.storage.local.set({ pageGroupPostSkipped: pagePostSkipCount(), pageGroupPostStatus: t("pgp.noPageActor", { name: pagePostConfig.page.name }) });
      return false;
    }
    const groupName = pageCurrentGroupName() || group.name || group.key;
    const recentPosts = pageRecentGroupPosts();
    const ai = await liveAiConfig();
    const profile = pagePostConfig.pageProfile || null;
    const generated = await chrome.runtime.sendMessage({ action: "aiGeneratePageGroupPost", groupName, pageName: pagePostConfig.page.name, recentPosts, prompt: pagePostConfig.prompt, pageProfile: profile, aiConfig: ai }).catch(() => null);
    if (!generated?.ok || !generated.content) {
      await chrome.storage.local.set({ pageGroupPostSkipped: pagePostSkipCount(), pageGroupPostStatus: generated?.error || t("pgp.aiFailed", { name: groupName }) });
      return false;
    }
    const opener = pageGroupPostOpener();
    if (!opener || !(await pageFeatureClick(opener, PAGE_POST_FLAG, runId))) {
      await chrome.storage.local.set({ pageGroupPostSkipped: pagePostSkipCount(), pageGroupPostStatus: t("pgp.noComposer", { name: groupName }) });
      return false;
    }
    const composer = await waitPageGroupComposer(PAGE_POST_FLAG, runId);
    if (!composer || !(await pageClearGroupDraft(composer.editor, PAGE_POST_FLAG, runId))) {
      await closePageGroupComposer();
      await chrome.storage.local.set({ pageGroupPostSkipped: pagePostSkipCount(), pageGroupPostStatus: t("pgp.draftBusy", { name: groupName }) });
      return false;
    }
    composer.editor.focus(); composer.editor.click();
    const typed = await chrome.runtime.sendMessage({ action: "trustedInput", text: generated.content, pressEnter: false, typingMinDelay: 18, typingMaxDelay: 35 }).catch(() => null);
    if (!typed?.ok || !clean(composer.editor.innerText || composer.editor.textContent || composer.editor.value).includes(clean(generated.content).slice(0, 35))) {
      await closePageGroupComposer();
      await chrome.storage.local.set({ pageGroupPostSkipped: pagePostSkipCount(), pageGroupPostStatus: t("pgp.typeFailed", { name: groupName }) });
      return false;
    }
    const posted = await pageSubmitGroupPost(composer, generated.content, PAGE_POST_FLAG, runId, groupName);
    if (!posted) {
      await chrome.storage.local.set({ pageGroupPostSkipped: pagePostSkipCount(), pageGroupPostStatus: t("pgp.unconfirmed", { name: groupName }) });
      return false;
    }
    const done = (pagePostConfig.done || 0) + 1;
    pagePostConfig.done = done;
    await chrome.storage.local.set({ pageGroupPostDone: done, pageGroupPostStatus: t("pgp.confirmed", { name: groupName }), pageGroupPostLastContent: generated.content.slice(0, 500) });
    await chrome.runtime.sendMessage({ action: "pageStore", op: "put", store: "contentCache", value: { id: `group-post:${pageKey(pagePostConfig.page)}:${group.key}:${Date.now()}`, source: "page-group-post", groupKey: group.key, content: generated.content, at: Date.now() } }).catch(() => {});
    return true;
  }
  async function pageGroupPostLoop(runId) {
    const groups = Array.isArray(pagePostConfig?.groups) ? pagePostConfig.groups : [];
    const target = Math.min(groups.length, Math.max(1, parseInt(pagePostConfig?.target) || groups.length));
    for (let index = Math.max(0, parseInt(pagePostConfig?.index) || 0); index < target; index++) {
      if (!(await pageFeatureLive(PAGE_POST_FLAG, runId))) return;
      const group = groups[index];
      pagePostConfig.index = index;
      await chrome.storage.local.set({ pageGroupPostIndex: index, pageGroupPostStatus: t("pgp.progress", { done: pagePostConfig.done || 0, target, name: group.name || group.key }) });
      if (!pageGroupRoute() || pageCurrentGroupKey() !== group.key) { location.replace(group.url); return; }
      await pageGroupPostOne(group, runId, index);
      if (!(await pageFeatureLive(PAGE_POST_FLAG, runId))) return;
      if (!pageGroupRoute() || pageCurrentGroupKey() !== group.key) return;
      const min = Math.max(5, parseInt(pagePostConfig.minDelay) || 15), max = Math.max(min, parseInt(pagePostConfig.maxDelay) || 30);
      const wait = min * 1000 + Math.floor(Math.random() * Math.max(1, (max - min) * 1000));
      const until = Date.now() + wait;
      while (Date.now() < until) { if (!(await pageFeatureLive(PAGE_POST_FLAG, runId))) return; await sleep(Math.min(800, until - Date.now())); }
    }
    await chrome.storage.local.set({ [PAGE_POST_FLAG]: false, pageGroupPostStatus: t("pgp.done", { done: pagePostConfig.done || 0, skipped: pagePostConfig.skipped || 0 }) });
    pagePostConfig = null;
  }

  // -----------------------------------------------------------------------
  // Follow Pages by keyword. Public Page cards are scanned separately from
  // managed Pages; follow proof and history never share group-join state.
  // -----------------------------------------------------------------------
  function pageSearchRoute() {
    const url = facebookUrl(location.href);
    return /^\/search\/pages(?:\/|$)/i.test(url?.pathname || "");
  }
  function pageSearchQueryMatches(keyword) {
    return pageSearchRoute() && facebookUrl(location.href)?.searchParams.get("q") === String(keyword || "").trim();
  }
  function pageCardForLink(link) {
    const candidates = [link.closest('[role="article"]'), link.closest('li'), link.closest('[data-pagelet]'), link.closest('div[role="listitem"]'), link.parentElement?.parentElement, link.parentElement].filter(Boolean);
    return candidates.sort((a, b) => {
      const aButtons = a.querySelectorAll('button,[role="button"]').length, bButtons = b.querySelectorAll('button,[role="button"]').length;
      return (bButtons - aButtons) || (a.innerText.length - b.innerText.length);
    })[0] || null;
  }
  function pageFollowButton(card) {
    return [...(card || document).querySelectorAll('button,[role="button"],a')].filter(visible).find(control => {
      const text = labelOf(control);
      return /^(?:theo dõi|follow)(?: trang| page)?$/i.test(text) || /^(?:theo dõi|follow)\s+/i.test(text) && !/đang theo dõi|following|bỏ theo dõi|unfollow/i.test(text);
    }) || null;
  }
  function pageFollowingEvidence(card) {
    return [...(card || document).querySelectorAll('button,[role="button"],a')].filter(visible).some(control => /^(?:đang theo dõi|following|following\s)/i.test(labelOf(control)));
  }
  function pageFollowerNumber(text) {
    const match = String(text || "").match(/([\d.,]+)\s*(k|m|nghìn|triệu|thousand|million)?\s*(?:người theo dõi|followers|lượt thích|likes)?/i);
    if (!match) return 0;
    const raw = Number(String(match[1]).replace(/[.,](?=\d{3}(?:\D|$))/g, "").replace(/,/g, "."));
    const suffix = String(match[2] || "").toLowerCase();
    if (/k|nghìn|thousand/.test(suffix)) return Math.round(raw * 1000);
    if (/m|triệu|million/.test(suffix)) return Math.round(raw * 1000000);
    return Number.isFinite(raw) ? raw : 0;
  }
  function findPageWatchCards() {
    const exclude = String(pageWatchConfig?.exclude || "").split(/[,\n]/).map(clean).filter(Boolean).map(value => value.toLocaleLowerCase("vi"));
    const minFollowers = Math.max(0, parseInt(pageWatchConfig?.minFollowers) || 0);
    const seen = new Set(), rows = [];
    for (const link of document.querySelectorAll('a[href]')) {
      if (!visible(link)) continue;
      const url = facebookUrl(link.href);
      if (!url || /\/groups\/|\/pages\/|\/search\/|\/watch|\/reels|\/marketplace|\/events/i.test(url.pathname)) continue;
      const card = pageCardForLink(link);
      if (!card || !visible(card)) continue;
      const text = clean(card.innerText || card.textContent);
      if (text.length < 5 || /được tài trợ|sponsored|messenger|tin nhắn/i.test(text)) continue;
      const name = clean(link.innerText || link.getAttribute("aria-label") || text.split("\n")[0]);
      if (!name || name.length < 2 || name.length > 180) continue;
      const key = pageKey({ name, url: canonicalUrl(url) });
      if (!key || seen.has(key)) continue;
      const haystack = `${name} ${text}`.toLocaleLowerCase("vi");
      if (exclude.some(value => value && haystack.includes(value))) continue;
      const followers = pageFollowerNumber(text);
      if (minFollowers && followers && followers < minFollowers) continue;
      if (minFollowers && !followers) continue;
      seen.add(key);
      rows.push({ key, name, url: canonicalUrl(url), followers, card, following: pageFollowingEvidence(card), button: pageFollowButton(card) });
      if (rows.length >= 100) break;
    }
    return rows;
  }
  async function saveFollowedPage(row) {
    const value = { id: row.key, key: row.key, name: row.name, url: row.url, followers: row.followers || 0, followedAt: Date.now() };
    await chrome.runtime.sendMessage({ action: "pageStore", op: "put", store: "followedPages", value }).catch(() => {});
    const stored = await chrome.storage.local.get("pageFollowedPages");
    const rows = Array.isArray(stored.pageFollowedPages) ? stored.pageFollowedPages.filter(item => item?.key !== row.key) : [];
    rows.push(value);
    await chrome.storage.local.set({ pageFollowedPages: rows.slice(-500) });
  }
  async function pageWatchOne(row, runId) {
    if (!(await pageFeatureLive(PAGE_WATCH_FLAG, runId))) return false;
    if (!(await pageSwitchActor(pageWatchConfig.page, PAGE_WATCH_FLAG, runId))) {
      pageWatchConfig.skipped = (pageWatchConfig.skipped || 0) + 1;
      await chrome.storage.local.set({ pageWatchSkipped: pageWatchConfig.skipped, pageWatchStatus: t("pgw.noPageActor", { name: pageWatchConfig.page.name }) });
      return false;
    }
    if (row.following || pageFollowingEvidence(row.card)) {
      await saveFollowedPage(row); return true;
    }
    const button = row.button?.isConnected ? row.button : pageFollowButton(row.card);
    if (!button || !(await pageFeatureClick(button, PAGE_WATCH_FLAG, runId))) {
      pageWatchConfig.skipped = (pageWatchConfig.skipped || 0) + 1;
      await chrome.storage.local.set({ pageWatchSkipped: pageWatchConfig.skipped, pageWatchStatus: t("pgw.noFollow", { name: row.name }) });
      return false;
    }
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (!(await pageFeatureLive(PAGE_WATCH_FLAG, runId))) return false;
      const liveCard = row.card?.isConnected ? row.card : pageCardForLink([...document.querySelectorAll('a[href]')].find(link => pageKey({ url: link.href }) === row.key));
      if (pageFollowingEvidence(liveCard) || /đang theo dõi|following/i.test(clean(liveCard?.innerText || ""))) {
        await saveFollowedPage(row); return true;
      }
      await sleep(500);
    }
    pageWatchConfig.skipped = (pageWatchConfig.skipped || 0) + 1;
    await chrome.storage.local.set({ pageWatchSkipped: pageWatchConfig.skipped, pageWatchStatus: t("pgw.unconfirmed", { name: row.name }) });
    return false;
  }
  async function pageWatchLoop(runId) {
    if (!pageSearchQueryMatches(pageWatchConfig?.keyword)) { location.replace(`https://www.facebook.com/search/pages/?q=${encodeURIComponent(pageWatchConfig?.keyword || "")}`); return; }
    const target = Math.max(1, Math.min(100, parseInt(pageWatchConfig?.target) || 10));
    let processed = 0, emptyRounds = 0;
    while (await pageFeatureLive(PAGE_WATCH_FLAG, runId) && processed < target) {
      const rows = findPageWatchCards();
      const available = rows.filter(row => !(pageWatchConfig.seenKeys || []).includes(row.key));
      if (!available.length) {
        emptyRounds++;
        if (emptyRounds >= 4) break;
        window.scrollBy({ top: Math.max(450, Math.floor(window.innerHeight * .8)), behavior: "smooth" });
        await sleep(1200); continue;
      }
      emptyRounds = 0;
      for (const row of available) {
        if (!(await pageFeatureLive(PAGE_WATCH_FLAG, runId)) || processed >= target) break;
        pageWatchConfig.seenKeys = [...(pageWatchConfig.seenKeys || []), row.key];
        if (await pageWatchOne(row, runId)) pageWatchConfig.followed = (pageWatchConfig.followed || 0) + 1;
        processed++;
        await chrome.storage.local.set({ pageWatchIndex: processed, pageWatchFollowed: pageWatchConfig.followed || 0, pageWatchSkipped: pageWatchConfig.skipped || 0, pageWatchSeenKeys: pageWatchConfig.seenKeys, pageWatchStatus: t("pgw.progress", { done: pageWatchConfig.followed || 0, target, name: row.name }) });
      }
      window.scrollBy({ top: Math.max(450, Math.floor(window.innerHeight * .8)), behavior: "smooth" });
      await sleep(1200);
    }
    await chrome.storage.local.set({ [PAGE_WATCH_FLAG]: false, pageWatchStatus: t("pgw.done", { followed: pageWatchConfig.followed || 0, skipped: pageWatchConfig.skipped || 0 }) });
    pageWatchConfig = null;
  }

  // -----------------------------------------------------------------------
  // Page Comment AI. It deliberately mirrors the simple personal-feed flow:
  // read the exact post, ask the configured AI for one comment, submit once,
  // then require visible proof. No extra topic-classification AI is used.
  // -----------------------------------------------------------------------
  function pageMainFeedRoute() {
    const url = facebookUrl(location.href);
    return !!url && (url.pathname === "/" || url.pathname === "/home.php");
  }
  function pageCommentTargetRoute() {
    if (pageCommentConfig?.source === "feed") return pageMainFeedRoute();
    const page = pageCommentConfig?.pages?.[Math.max(0, parseInt(pageCommentConfig?.pageIndex) || 0)];
    if (!page) return false;
    const wanted = facebookUrl(page.url), current = facebookUrl(location.href);
    return !!wanted && !!current && pageKey({ url: wanted }) === pageKey({ url: current });
  }
  function pageArticleText(article) {
    return clean(article?.innerText || article?.textContent).slice(0, 2600);
  }
  function pagePostKey(article) {
    const link = [...(article || document).querySelectorAll('a[href]')].map(a => facebookUrl(a.href)).find(url => url && (/\/posts\/|\/permalink\/|story_fbid=|\/photo/i.test(url.pathname + url.search)));
    if (link) return link.toString().replace(/\/$/, "");
    const text = pageArticleText(article).slice(0, 500).toLocaleLowerCase("vi");
    let hash = 2166136261;
    for (const ch of text) { hash ^= ch.charCodeAt(0); hash = Math.imul(hash, 16777619); }
    return `text:${(hash >>> 0).toString(36)}`;
  }
  function pageCommentButton(article) {
    return [...(article || document).querySelectorAll('button,[role="button"],a')].filter(visible).find(control => {
      const text = labelOf(control);
      if (!/bình luận|comment/i.test(text)) return false;
      if (/trả lời|reply|comment on this/i.test(text)) return false;
      if (control.closest("ul") || control.closest('[aria-label*="Bình luận"],[aria-label*="Comment"]')?.closest("ul")) return false;
      return true;
    }) || null;
  }
  function pageCommentBox(scope) {
    return [...(scope || document).querySelectorAll('div[contenteditable="true"],[role="textbox"]')].filter(visible).find(box => {
      const label = `${box.getAttribute("aria-label") || ""} ${box.getAttribute("placeholder") || ""}`;
      return !/tìm kiếm|search|tin nhắn|message/i.test(label) && !box.closest("form[role=search]");
    }) || null;
  }
  function pageCommentSendButton(box) {
    let node = box;
    for (let depth = 0; node && depth < 8; depth++, node = node.parentElement) {
      const button = [...node.querySelectorAll('button,[role="button"],div[role="button"]')].filter(visible).find(control => /^(?:đăng bình luận|comment|bình luận|gửi|send|post)$/i.test(labelOf(control)) && !control.disabled && control.getAttribute("aria-disabled") !== "true");
      if (button) return button;
    }
    return [...document.querySelectorAll('button,[role="button"]')].filter(visible).find(control => /^(?:đăng bình luận|comment|bình luận|gửi|send)$/i.test(labelOf(control)) && !control.disabled) || null;
  }
  function pageCommentProof(scope, expected) {
    const needle = clean(expected).slice(0, 70).toLocaleLowerCase("vi");
    if (needle.length < 5) return false;
    return [...(scope || document).querySelectorAll("div,span,p")].filter(visible).some(node => {
      if (node.matches('[contenteditable="true"],[role="textbox"]') || node.closest('[contenteditable="true"],[role="textbox"]')) return false;
      const text = clean(node.innerText || node.textContent).toLocaleLowerCase("vi");
      return text.includes(needle) && text.length < 500;
    });
  }
  function pageFeedArticles() {
    const rows = [], seen = new Set();
    for (const article of document.querySelectorAll('[role="article"],article,[data-pagelet^="FeedUnit_"]')) {
      if (!visible(article) || article.closest('[role="dialog"]')) continue;
      const text = pageArticleText(article);
      if (text.length < 15 || /được tài trợ|sponsored/i.test(text)) continue;
      const button = pageCommentButton(article);
      if (!button) continue;
      const key = pagePostKey(article);
      if (!key || seen.has(key)) continue;
      seen.add(key); rows.push({ article, key, text, button });
      if (rows.length >= 50) break;
    }
    return rows;
  }
  async function waitPageCommentBox(article, previousBoxes, runId) {
    const end = Date.now() + 60000;
    while (Date.now() < end) {
      if (!(await pageFeatureLive(PAGE_COMMENT_FLAG, runId))) return null;
      const inline = pageCommentBox(article);
      if (inline) return { box: inline, scope: article };
      const opened = [...document.querySelectorAll('div[contenteditable="true"],[role="textbox"]')].filter(visible).find(box => !previousBoxes.has(box) && !/tìm kiếm|search|tin nhắn|message/i.test(labelOf(box)));
      if (opened) return { box: opened, scope: opened.closest('[role="dialog"]') || article || document.body };
      await sleep(500);
    }
    return null;
  }
  async function closePageCommentView(scope) {
    if (!scope || scope === document.body || scope === document) return true;
    const close = [...scope.querySelectorAll('button,[role="button"]')].filter(visible).find(control => /^(?:đóng|close|quay lại|back)$/i.test(labelOf(control)));
    if (close) { try { close.click(); } catch (_) {} await sleep(400); }
    return true;
  }
  async function postPageComment(article, text, key, runId) {
    const button = article?.button?.isConnected ? article.button : pageCommentButton(article?.article || article);
    if (!button || !(await pageFeatureClick(button, PAGE_COMMENT_FLAG, runId))) return "unconfirmed-skip";
    const previousBoxes = new Set([...document.querySelectorAll('div[contenteditable="true"],[role="textbox"]')].filter(visible));
    const composer = await waitPageCommentBox(article.article || article, previousBoxes, runId);
    if (!composer) return "unconfirmed-skip";
    const box = composer.box;
    box.focus(); box.click();
    const typed = await chrome.runtime.sendMessage({ action: "trustedInput", text, pressEnter: false, typingMinDelay: 20, typingMaxDelay: 45 }).catch(() => null);
    if (!typed?.ok) { await closePageCommentView(composer.scope); return "unconfirmed-skip"; }
    const liveBeforeSubmit = await chrome.storage.local.get(PAGE_COMMENT_FLAG);
    if (!(await pageFeatureLive(PAGE_COMMENT_FLAG, runId)) || liveBeforeSubmit[PAGE_COMMENT_FLAG] === false) return "stopped";
    const send = pageCommentSendButton(box);
    if (!send || !(await pageFeatureClick(send, PAGE_COMMENT_FLAG, runId))) return "unconfirmed-skip";
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (!(await pageFeatureLive(PAGE_COMMENT_FLAG, runId))) return "stopped";
      if (pageCommentProof(composer.scope, text) || pageCommentProof(article.article || article, text)) { await closePageCommentView(composer.scope); return true; }
      await sleep(500);
    }
    await closePageCommentView(composer.scope);
    return "unconfirmed-skip";
  }
  async function pageCommentOne(item, runId) {
    if (!(await pageSwitchActor(pageCommentConfig.page, PAGE_COMMENT_FLAG, runId))) return "skip";
    const ai = await liveAiConfig();
    const response = await chrome.runtime.sendMessage({ action: "aiGeneratePageComment", postText: item.text, pageName: pageCommentConfig.page.name, source: pageCommentConfig.source === "feed" ? "Bản tin" : "Page đã theo dõi", prompt: pageCommentConfig.prompt, pageProfile: pageCommentConfig.pageProfile, aiConfig: ai }).catch(() => null);
    if (!response?.ok || !response.comment) {
      await chrome.storage.local.set({ pageCommentStatus: response?.error || t("pgc.aiFailed") });
      return "skip";
    }
    return postPageComment(item, response.comment, item.key, runId);
  }
  async function pageCommentLoop(runId) {
    if (!(await pageFeatureLive(PAGE_COMMENT_FLAG, runId))) return;
    if (!pageCommentTargetRoute()) {
      const page = pageCommentConfig.source === "feed" ? null : pageCommentConfig.pages?.[Math.max(0, parseInt(pageCommentConfig.pageIndex) || 0)];
      location.replace(page ? page.url : "https://www.facebook.com/");
      return;
    }
    if (!(await pageSwitchActor(pageCommentConfig.page, PAGE_COMMENT_FLAG, runId))) {
      await chrome.storage.local.set({ pageCommentStatus: t("pgc.noPageActor", { name: pageCommentConfig.page.name }) });
      return;
    }
    const historyStore = await chrome.storage.local.get("pageCommentHistory");
    const history = historyStore.pageCommentHistory && typeof historyStore.pageCommentHistory === "object" ? historyStore.pageCommentHistory : {};
    let emptyRounds = 0;
    while (await pageFeatureLive(PAGE_COMMENT_FLAG, runId) && (pageCommentConfig.done || 0) < Math.max(1, parseInt(pageCommentConfig.target) || 1)) {
      const posts = pageFeedArticles().filter(item => !history[item.key]);
      if (!posts.length) {
        emptyRounds++;
        if (emptyRounds >= 4) break;
        window.scrollBy({ top: Math.max(450, Math.floor(window.innerHeight * .8)), behavior: "smooth" });
        await sleep(1200); continue;
      }
      emptyRounds = 0;
      for (const item of posts) {
        if (!(await pageFeatureLive(PAGE_COMMENT_FLAG, runId)) || (pageCommentConfig.done || 0) >= Math.max(1, parseInt(pageCommentConfig.target) || 1)) break;
        history[item.key] = { time: Date.now(), source: pageCommentConfig.source, state: "submitting" };
        await chrome.storage.local.set({ pageCommentHistory: history, pageCommentStatus: t("pgc.processing", { n: (pageCommentConfig.done || 0) + 1 }) });
        const result = await pageCommentOne(item, runId);
        if (result === "stopped") return;
        if (result === true) { pageCommentConfig.done = (pageCommentConfig.done || 0) + 1; history[item.key] = { time: Date.now(), source: pageCommentConfig.source, state: "confirmed" }; }
        else history[item.key] = { time: Date.now(), source: pageCommentConfig.source, state: "unconfirmed" };
        await chrome.storage.local.set({ pageCommentDone: pageCommentConfig.done || 0, pageCommentHistory: history, pageCommentStatus: t("pgc.progress", { done: pageCommentConfig.done || 0, target: pageCommentConfig.target }) });
        const min = Math.max(5, parseInt(pageCommentConfig.minDelay) || 15), max = Math.max(min, parseInt(pageCommentConfig.maxDelay) || 30), until = Date.now() + min * 1000 + Math.floor(Math.random() * Math.max(1, (max - min) * 1000));
        while (Date.now() < until) { if (!(await pageFeatureLive(PAGE_COMMENT_FLAG, runId))) return; await sleep(Math.min(800, until - Date.now())); }
      }
      window.scrollBy({ top: Math.max(450, Math.floor(window.innerHeight * .8)), behavior: "smooth" });
      await sleep(1000);
    }
    if (pageCommentConfig.source === "followed" && (pageCommentConfig.pageIndex || 0) + 1 < (pageCommentConfig.pages || []).length) {
      pageCommentConfig.pageIndex = (pageCommentConfig.pageIndex || 0) + 1;
      await chrome.storage.local.set({ pageCommentConfig, pageCommentPageIndex: pageCommentConfig.pageIndex, pageCommentStatus: t("pgc.nextPage") });
      location.replace(pageCommentConfig.pages[pageCommentConfig.pageIndex].url);
      return;
    }
    await chrome.storage.local.set({ [PAGE_COMMENT_FLAG]: false, pageCommentStatus: t("pgc.done", { done: pageCommentConfig.done || 0 }) });
    pageCommentConfig = null;
  }

  async function scanManagedPages() {
    const pages = managedPageLinks();
    return { ok: true, pages };
  }

  function applyConfig(config) {
    currentConfig = { ...(config || {}), page: config?.page || null, aiConfig: config?.aiConfig || {} };
    currentRunId = String(config?.runId || currentRunId || "");
    active = true;
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[FLAG]?.newValue === false) active = false;
    if (changes[PAGE_POST_FLAG]?.newValue === false) pagePostConfig = null;
    if (changes[PAGE_WATCH_FLAG]?.newValue === false) pageWatchConfig = null;
    if (changes[PAGE_COMMENT_FLAG]?.newValue === false) pageCommentConfig = null;
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "startPageGroupPost") {
      if (pagePostConfig) { sendResponse({ ok: false, code: "page-post-busy", error: t("pgp.busy") }); return true; }
      pagePostRunId = String(message.runId || message.config?.runId || `page-post-${Date.now()}`);
      pagePostConfig = { ...(message.config || {}), runId: pagePostRunId, ownerTabId: message.ownerTabId || message.config?.ownerTabId || sender.tab?.id || 0, done: Math.max(0, parseInt(message.done) || 0), skipped: Math.max(0, parseInt(message.skipped) || 0), index: Math.max(0, parseInt(message.index) || 0) };
      chrome.storage.local.set({ [PAGE_POST_FLAG]: true, pageGroupPostRunId: pagePostRunId, pageGroupPostOwnerTabId: pagePostConfig.ownerTabId, pageGroupPostConfig: { ...pagePostConfig, aiConfig: pagePostConfig.aiConfig ? { provider: pagePostConfig.aiConfig.provider, model: pagePostConfig.aiConfig.model, url: pagePostConfig.aiConfig.url } : undefined }, pageGroupPostDone: pagePostConfig.done, pageGroupPostSkipped: pagePostConfig.skipped, pageGroupPostIndex: pagePostConfig.index, pageGroupPostStatus: t("pgp.running") }).then(() => pageGroupPostLoop(pagePostRunId));
      sendResponse({ ok: true });
      return true;
    }
    if (message.action === "stopPageGroupPost") {
      pagePostConfig = null;
      chrome.storage.local.set({ [PAGE_POST_FLAG]: false, pageGroupPostStatus: t("pgp.stopped") });
      sendResponse({ ok: true });
      return true;
    }
    if (message.action === "resetPageGroupPost") {
      pagePostConfig = null;
      chrome.storage.local.set({ [PAGE_POST_FLAG]: false, pageGroupPostDone: 0, pageGroupPostSkipped: 0, pageGroupPostIndex: 0, pageGroupPostStatus: t("pgp.reset") });
      chrome.storage.local.remove("pageGroupPostConfig");
      sendResponse({ ok: true });
      return true;
    }
    if (message.action === "startPageWatch") {
      if (pageWatchConfig) { sendResponse({ ok: false, code: "page-watch-busy", error: t("pgw.busy") }); return true; }
      pageWatchRunId = String(message.runId || message.config?.runId || `page-watch-${Date.now()}`);
      pageWatchConfig = { ...(message.config || {}), runId: pageWatchRunId, ownerTabId: message.ownerTabId || message.config?.ownerTabId || sender.tab?.id || 0, followed: Math.max(0, parseInt(message.followed) || 0), skipped: Math.max(0, parseInt(message.skipped) || 0), seenKeys: Array.isArray(message.seenKeys) ? message.seenKeys : [] };
      chrome.storage.local.set({ [PAGE_WATCH_FLAG]: true, pageWatchRunId, pageWatchOwnerTabId: pageWatchConfig.ownerTabId, pageWatchConfig: { ...pageWatchConfig, aiConfig: pageWatchConfig.aiConfig ? { provider: pageWatchConfig.aiConfig.provider, model: pageWatchConfig.aiConfig.model, url: pageWatchConfig.aiConfig.url } : undefined }, pageWatchFollowed: pageWatchConfig.followed, pageWatchSkipped: pageWatchConfig.skipped, pageWatchSeenKeys: pageWatchConfig.seenKeys, pageWatchStatus: t("pgw.running") }).then(() => pageWatchLoop(pageWatchRunId));
      sendResponse({ ok: true });
      return true;
    }
    if (message.action === "stopPageWatch") {
      pageWatchConfig = null;
      chrome.storage.local.set({ [PAGE_WATCH_FLAG]: false, pageWatchStatus: t("pgw.stopped") });
      sendResponse({ ok: true });
      return true;
    }
    if (message.action === "resetPageWatch") {
      pageWatchConfig = null;
      chrome.storage.local.set({ [PAGE_WATCH_FLAG]: false, pageWatchFollowed: 0, pageWatchSkipped: 0, pageWatchIndex: 0, pageWatchSeenKeys: [], pageWatchStatus: t("pgw.reset") });
      chrome.storage.local.remove("pageWatchConfig");
      sendResponse({ ok: true });
      return true;
    }
    if (message.action === "startPageComment") {
      if (pageCommentConfig) { sendResponse({ ok: false, code: "page-comment-busy", error: t("pgc.busy") }); return true; }
      pageCommentRunId = String(message.runId || message.config?.runId || `page-comment-${Date.now()}`);
      pageCommentConfig = { ...(message.config || {}), runId: pageCommentRunId, ownerTabId: message.ownerTabId || message.config?.ownerTabId || sender.tab?.id || 0, done: Math.max(0, parseInt(message.done) || 0), pageIndex: Math.max(0, parseInt(message.pageIndex) || 0) };
      chrome.storage.local.set({ [PAGE_COMMENT_FLAG]: true, pageCommentRunId, pageCommentOwnerTabId: pageCommentConfig.ownerTabId, pageCommentConfig: { ...pageCommentConfig, aiConfig: pageCommentConfig.aiConfig ? { provider: pageCommentConfig.aiConfig.provider, model: pageCommentConfig.aiConfig.model, url: pageCommentConfig.aiConfig.url } : undefined }, pageCommentDone: pageCommentConfig.done, pageCommentPageIndex: pageCommentConfig.pageIndex, pageCommentStatus: t("pgc.running") }).then(() => pageCommentLoop(pageCommentRunId));
      sendResponse({ ok: true });
      return true;
    }
    if (message.action === "stopPageComment") {
      pageCommentConfig = null;
      chrome.storage.local.set({ [PAGE_COMMENT_FLAG]: false, pageCommentStatus: t("pgc.stopped") });
      sendResponse({ ok: true });
      return true;
    }
    if (message.action === "resetPageComment") {
      pageCommentConfig = null;
      chrome.storage.local.set({ [PAGE_COMMENT_FLAG]: false, pageCommentDone: 0, pageCommentStatus: t("pgc.reset") });
      chrome.storage.local.remove("pageCommentConfig");
      sendResponse({ ok: true });
      return true;
    }
    if (message.action === "scanManagedPages") {
      scanManagedPages().then(sendResponse).catch(error => sendResponse({ ok: false, error: String(error?.message || error) }));
      return true;
    }
    if (message.action === "startPageGroupJoin") {
      if (active) { sendResponse({ ok: false, code: "page-join-busy", error: t("pg.busy") }); return true; }
      const config = message.config || message;
      applyConfig({ ...config, ownerTabId: message.ownerTabId || config.ownerTabId || 0 });
      joined = Math.max(0, parseInt(message.joined) || 0);
      skipped = Math.max(0, parseInt(message.skipped) || 0);
      nextAllowedAt = Math.max(0, parseInt(message.nextAllowedAt) || 0);
      attempted = new Set(Array.isArray(message.attemptedKeys) ? message.attemptedKeys : []);
      chrome.storage.local.set({ [FLAG]: true, [CONFIG_KEY]: { ...config, aiConfig: config.aiConfig ? { ...config.aiConfig, key: undefined } : undefined } });
      joinLoop(currentRunId, false);
      sendResponse({ ok: true });
      return true;
    }
    if (message.action === "stopPageGroupJoin") {
      active = false;
      chrome.storage.local.set({ [FLAG]: false, pageGroupJoinStatus: t("pg.stopped") });
      chrome.storage.local.remove([CONFIG_KEY, STATE_KEY, "pageGroupJoinAttemptedKeys"]);
      sendResponse({ ok: true });
      return true;
    }
    if (message.action === "resetPageGroupJoin") {
      active = false;
      joined = 0;
      skipped = 0;
      attempted = new Set();
      nextAllowedAt = 0;
      chrome.storage.local.set({ [FLAG]: false, pageGroupJoinJoined: 0, pageGroupJoinSkipped: 0, pageGroupJoinStatus: t("pg.reset"), pageGroupJoinNextAt: 0 });
      chrome.storage.local.remove([CONFIG_KEY, STATE_KEY, "pageGroupJoinAttemptedKeys"]);
      sendResponse({ ok: true });
      return true;
    }
    if (message.action === "getPageGroupJoinStatus") {
      sendResponse({ active, joined, skipped, runId: currentRunId });
      return true;
    }
    return false;
  });

  (async () => {
    const stored = await chrome.storage.local.get([FLAG, STATE_KEY, CONFIG_KEY, "pageGroupJoinJoined", "pageGroupJoinSkipped", "pageGroupJoinNextAt", "pageGroupJoinAttemptedKeys"]);
    const state = stored[STATE_KEY];
    const config = stored[CONFIG_KEY] || state?.config;
    if (!stored[FLAG] || !config || !config.page || !(await owns(state?.runId, state?.ownerTabId))) return;
    applyConfig(config);
    currentRunId = String(state?.runId || config.runId || "");
    joined = Math.max(0, parseInt(stored.pageGroupJoinJoined ?? state?.joined) || 0);
    skipped = Math.max(0, parseInt(stored.pageGroupJoinSkipped ?? state?.skipped) || 0);
    nextAllowedAt = Math.max(0, parseInt(stored.pageGroupJoinNextAt ?? state?.nextAllowedAt) || 0);
    attempted = new Set(Array.isArray(stored.pageGroupJoinAttemptedKeys || state?.attemptedKeys) ? (stored.pageGroupJoinAttemptedKeys || state.attemptedKeys) : []);
    await sleep(1500);
    if (!routeMatches(currentConfig)) { location.replace(routeUrl(currentConfig)); return; }
    joinLoop(currentRunId, true);
  })();

  (async () => {
    try {
      const stored = await chrome.storage.local.get([
        PAGE_POST_FLAG, "pageGroupPostConfig", "pageGroupPostRunId", "pageGroupPostDone", "pageGroupPostSkipped", "pageGroupPostIndex",
        PAGE_WATCH_FLAG, "pageWatchConfig", "pageWatchRunId", "pageWatchFollowed", "pageWatchSkipped", "pageWatchIndex", "pageWatchSeenKeys",
        PAGE_COMMENT_FLAG, "pageCommentConfig", "pageCommentRunId", "pageCommentDone", "pageCommentPageIndex"
      ]);
      if (stored[PAGE_POST_FLAG] && stored.pageGroupPostConfig && await owns(stored.pageGroupPostRunId, stored.pageGroupPostConfig.ownerTabId)) {
        pagePostRunId = String(stored.pageGroupPostRunId || stored.pageGroupPostConfig.runId || "");
        pagePostConfig = { ...stored.pageGroupPostConfig, done: stored.pageGroupPostDone || 0, skipped: stored.pageGroupPostSkipped || 0, index: stored.pageGroupPostIndex || 0 };
        await sleep(1200); pageGroupPostLoop(pagePostRunId);
        return;
      }
      if (stored[PAGE_WATCH_FLAG] && stored.pageWatchConfig && await owns(stored.pageWatchRunId, stored.pageWatchConfig.ownerTabId)) {
        pageWatchRunId = String(stored.pageWatchRunId || stored.pageWatchConfig.runId || "");
        pageWatchConfig = { ...stored.pageWatchConfig, followed: stored.pageWatchFollowed || 0, skipped: stored.pageWatchSkipped || 0, seenKeys: stored.pageWatchSeenKeys || [] };
        await sleep(1200); pageWatchLoop(pageWatchRunId);
        return;
      }
      if (stored[PAGE_COMMENT_FLAG] && stored.pageCommentConfig && await owns(stored.pageCommentRunId, stored.pageCommentConfig.ownerTabId)) {
        pageCommentRunId = String(stored.pageCommentRunId || stored.pageCommentConfig.runId || "");
        pageCommentConfig = { ...stored.pageCommentConfig, done: stored.pageCommentDone || 0, pageIndex: stored.pageCommentPageIndex || 0 };
        await sleep(1200); pageCommentLoop(pageCommentRunId);
      }
    } catch (error) { console.warn("[Page] resume feature failed", error); }
  })();

  console.log("[Page] page.js loaded");
})();
