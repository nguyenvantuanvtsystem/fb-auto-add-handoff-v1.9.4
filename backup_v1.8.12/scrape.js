// scrape.js - Cào bài viết profile/page -> xuất md/json/txt
(() => {
  let isScraping = false;
  let collected = [];
  let seen = new Set();
  let targetCount = 20;
  let idleCount = 0;

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function expandSeeMore() {
    let clicked = 0;
    // FB dung div[role=button] chua text Xem them / See more
    document.querySelectorAll('div[role="button"]').forEach(btn => {
      const t = (btn.innerText || "").trim();
      if (t === "Xem thêm" || t === "See more" || t === "Xem Thêm" || t === "See More") {
        try { btn.click(); clicked++; } catch {}
      }
    });
    // mot so truong hop la span
    document.querySelectorAll('span').forEach(s => {
      const t = (s.innerText || "").trim();
      if (t === "Xem thêm" || t === "See more") {
        const btn = s.closest('div[role="button"]');
        if (btn) { try { btn.click(); clicked++; } catch {} }
        else if (s.parentElement && s.parentElement.getAttribute("role")==="button") { try { s.parentElement.click(); clicked++; } catch {} }
      }
    });
    return clicked;
  }

  function parseArticle(el) {
    if (el.dataset.scraped === "1") return null;

    function isInComment(node) {
      return !!node.closest('ul, div[aria-label*="Bình luận"], div[aria-label*="Comment"], div[data-pagelet*="Comment"]');
    }
    let text = "";
    // 1) bai thuong
    const msgDiv = el.querySelector('div[data-ad-preview="message"], div[data-ad-comet-preview="message"]');
    if (msgDiv && msgDiv.innerText.trim().length > 0 && !isInComment(msgDiv)) {
      text = msgDiv.innerText.trim();
    }
    // 2) bai nen mau (vang/xanh/do) - text nam trong div co background
    if (!text || text.length < 20) {
      const bgDiv = el.querySelector('div[style*="background-color"], div[style*="background"]');
      if (bgDiv && bgDiv.innerText.trim().length > 10 && !isInComment(bgDiv)) {
        // lay text trong div nen mau, thuong la chinh bai
        const t = bgDiv.innerText.trim();
        if (t.length > text.length) text = t;
      }
    }
    // 3) lay div[dir="auto"] dai nhat ngoai comment - khong cat cut
    if (!text || text.length < 20) {
      const candidates = el.querySelectorAll('div[dir="auto"]');
      let longest = "";
      candidates.forEach(c => {
        if (isInComment(c)) return;
        const t = (c.innerText || "").trim();
        // lay doan dai nhat, khong gioi han 5 ky tu, giu nguyen
        if (t.length > longest.length) longest = t;
      });
      if (longest.length > 0) text = longest;
    }
    // 4) fallback: clone bo comment roi lay toan bo text, khong slice 800 nua
    if (!text || text.length < 20) {
      const clone = el.cloneNode(true);
      clone.querySelectorAll('ul, div[aria-label*="Bình luận"], div[aria-label*="Comment"], div[data-pagelet*="Comment"]').forEach(n => n.remove());
      let full = (clone.innerText || "").trim();
      // bo dong dau la ten + time neu co
      const lines = full.split("\n").map(s=>s.trim()).filter(Boolean);
      // bo 2 dong dau neu la ten/time
      if (lines.length > 3 && lines[0].length < 60 && (lines[1].includes("Tháng") || lines[1].includes("năm") || lines[1].includes("·"))) {
        full = lines.slice(2).join("\n").trim();
      }
      text = full;
    }
    if (!text || text.length === 0) text = "[Bai nen mau - khong boc duoc text]";
    // cat header con sot dang "Doc To Hoe · 5 năm" hoac "Tháng 11, 2020" o dau bai
    text = text.replace(/^.*·\s*\d+\s*năm\s*/s, "").trim();
    text = text.replace(/^Tháng\s*\d+.*?\d{4}\s*·?\s*/s, "").trim();
    text = text.replace(/^Đốc Tờ Hoè\s*·.*?\n/s, "").trim();
    if (text.includes("Xem thêm bình luận") || text.includes("Xem them binh luan")) {
      text = text.split(/Xem thêm bình luận|Xem them binh luan/)[0].trim();
    }

    const imgs = [...el.querySelectorAll('img[src*="scontent"]')].map(i => i.src).slice(0, 3);

    // link bai viet - uu tien link co /posts/ that
    let link = "";
    const postLinks = [...el.querySelectorAll('a[href*="/posts/"]')].map(a=>a.href.split("?")[0]).filter(h=>h.includes("/posts/pfbid") || h.includes("/posts/"));
    if (postLinks.length > 0) link = postLinks[0];
    else {
      const linkEl = el.querySelector('a[href*="/permalink/"], a[href*="/videos/"], a[href*="/photos/"]');
      if (linkEl) link = linkEl.href.split("?")[0];
      else {
        const anchors = [...el.querySelectorAll('a[href]')];
        for (const a of anchors) {
          if (a.href.includes("/posts/") || a.href.includes("/permalink.php")) { link = a.href.split("?")[0]; break; }
        }
      }
    }
    if (!link || link.includes("?locale=")) link = ""; // bo link rac nhu ?locale=vi_VN
    const id = link || text.slice(0, 120);
    if (seen.has(id) && id.length > 0) return null;

    // thoi gian - tim span co chua nam/thang/gio
    let time = "";
    const timeCandidates = [...el.querySelectorAll('a[href*="/posts/"] span, abbr, span')];
    for (const c of timeCandidates) {
      const t = (c.innerText || "").trim();
      if (/^\d+\s*(năm|tháng|ngày|giờ|phút|tuần)/i.test(t) || /Tháng\s*\d+\s*năm\s*\d{4}/i.test(t) || /^\d{1,2}\/\d{1,2}\/\d{4}/.test(t) || /5 năm|6 năm|7 năm|8 năm|9 năm/.test(t)) {
        if (t.length < 30) { time = t; break; }
      }
    }
    if (!time) {
      // fallback: tim text co "·" + thoi gian
      const dotSpans = [...el.querySelectorAll('span')].map(s=>s.innerText.trim()).filter(s=> s.includes("năm") || s.includes("Tháng"));
      if (dotSpans.length > 0) time = dotSpans[0].slice(0,30);
    }

    // tac gia - lay tu h2/h3/strong dau tien, bo qua "Xem them"
    let author = "";
    const authorSelectors = ['h2 a span','h2 span','h3 a span','h3 span','a strong span','strong'];
    for (const sel of authorSelectors) {
      const aEl = el.querySelector(sel);
      if (aEl) {
        const t = aEl.innerText.trim();
        if (t && t.length >= 3 && t.length < 60 && !t.includes("Xem") && !t.includes("Thích") && !t.includes("Bình luận")) {
          // ten thuong co chu hoa, khong phai so
          if (/[A-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠƯ]/i.test(t)) { author = t; break; }
        }
      }
    }
    if (!author) {
      const h = el.querySelector('h2, h3');
      if (h) {
        const t = h.innerText.split("\n")[0].trim().split("·")[0].trim();
        if (t.length >=3 && t.length < 60) author = t;
      }
    }
    // lam sach text: bo prefix tac gia + time neu lap lai trong text
    if (author && text.startsWith(author)) text = text.slice(author.length).trim();
    text = text.replace(/^[·\s-]+/, "").trim();
    if (time && text.startsWith(time)) text = text.slice(time.length).trim();
    text = text.replace(/^[·\s-]+/, "").trim();
    // bo duoi Xem them / Thich / Binh luan con sot
    text = text.replace(/\s*Xem thêm.*$/s, "").replace(/\s*Xem them.*$/s, "").trim();
    text = text.replace(/\s*Thích.*$/s, "").replace(/\s*Like.*$/s, "").trim();
    // bo doan "· 5 năm" con dinh dau text
    text = text.replace(/^·\s*\d+\s*năm\s*/i, "").trim();
    text = text.replace(/\s{2,}/g, " ");

    return { id, author: author || "Doc To Hoe", time: time || "", text: text || "[Khong co noi dung text]", link: link || "", images: imgs, scrapedAt: new Date().toISOString() };
  }

  function extractPosts() {
    // Thu thap tu nhieu loai container cua FB (profile, page, group)
    let candidates = [];
    const sels = [
      'div[role="article"]',
      'div[data-pagelet^="FeedUnit"]',
      'div[data-pagelet="ProfileTileAbout"]',
      'div[data-pagelet="FeedUnit_0"] div',
      'div[data-ad-preview="message"]'
    ];
    // gom tat ca - khong loai theo do dai
    const seenEl = new Set();
    sels.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        let target = el;
        if (el.getAttribute("data-pagelet") && el.getAttribute("data-pagelet").startsWith("FeedUnit")) {
          const art = el.querySelector('div[role="article"]');
          if (art) target = art;
        }
        if (el.hasAttribute("data-ad-preview")) {
          target = el.closest('div[role="article"]') || el.closest('div[data-pagelet^="FeedUnit"]') || el;
        }
        // chi bo phan tu an (offsetParent null) nhung van giu lai neu co noi dung
        if (!seenEl.has(target) && (target.innerText || "").trim().length > 0) {
          // cho ca phan tu an neu la article (FB virtualized)
          if (target.offsetParent !== null || target.getAttribute("role") === "article") {
            seenEl.add(target);
            candidates.push(target);
          } else if ((target.innerText || "").length > 10) {
            seenEl.add(target);
            candidates.push(target);
          }
        }
      });
    });
    if (candidates.length < 3) {
      document.querySelectorAll('div[data-pagelet^="FeedUnit"]').forEach(el => {
        if (!seenEl.has(el) && (el.innerText || "").trim().length > 0) {
          candidates.push(el);
          seenEl.add(el);
        }
      });
    }

    let added = 0;
    let rawCount = candidates.length;
    for (const el of candidates) {
      if (collected.length >= targetCount) break;
      if (el.dataset.scraped === "1") continue;
      const data = parseArticle(el);
      if (data) {
        el.dataset.scraped = "1";
        el.style.outline = "2px solid #00c851";
        seen.add(data.id);
        collected.push(data);
        added++;
      } else {
        // khong loai - van danh dau de khong lap lai
        el.dataset.scraped = "1";
      }
    }
    if (rawCount > 0) console.log(`[Scrape] raw candidates=${rawCount}, added=${added}, total=${collected.length}`);
    return added;
  }

  function generateMD(data) {
    let md = `# Tong hop bai viet - ${new Date().toLocaleString("vi-VN")}\n`;
    md += `Nguon: ${window.location.href}\nSo bai: ${data.length}\n\n---\n\n`;
    data.forEach((p, i) => {
      const titleTime = p.time ? ` - ${p.time}` : "";
      md += `## ${i + 1}. ${p.author || "Khong ro tac gia"}${titleTime}\n\n`;
      if (p.link) md += `Link: ${p.link}\n\n`;
      else md += `Link: (khong lay duoc link bai goc)\n\n`;
      // dam bao text xuong dong dep, khong dinh chu
      const cleanText = (p.text || "").replace(/\s{2,}/g, " ").trim();
      md += `${cleanText}\n\n`;
      if (p.images.length > 0) {
        p.images.forEach(img => md += `![anh](${img})\n`);
        md += `\n`;
      }
      md += `---\n\n`;
    });
    return md;
  }

  function generateTXT(data) {
    return data.map((p, i) =>
      `=== Bai ${i + 1} ===\nTac gia: ${p.author || "N/A"}\nThoi gian: ${p.time || "N/A"}\nLink: ${p.link}\nNoi dung:\n${p.text}\n${p.images.length ? "Anh: " + p.images.join(", ") + "\n" : ""}`
    ).join("\n\n----------------\n\n");
  }

  function generateJSON(data) {
    return JSON.stringify({ source: window.location.href, exportedAt: new Date().toISOString(), count: data.length, posts: data }, null, 2);
  }

  function download(content, filename, mime) {
    const blob = new Blob([content], { type: mime + ";charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Luu lai lan cao gan nhat de tai lai theo format tu chon
  let lastCollected = [];

  function doDownload(format) {
    if (collected.length === 0 && lastCollected.length === 0) return false;
    const data = collected.length > 0 ? collected : lastCollected;
    const ts = new Date().toISOString().slice(0, 10);
    let content, filename, mime;
    if (format === "json") {
      content = generateJSON(data);
      filename = `fb_posts_${ts}.json`;
      mime = "application/json";
    } else if (format === "txt") {
      content = generateTXT(data);
      filename = `fb_posts_${ts}.txt`;
      mime = "text/plain";
    } else {
      content = generateMD(data);
      filename = `fb_posts_${ts}.md`;
      mime = "text/markdown";
    }
    download(content, filename, mime);
    chrome.storage.local.set({ scrapeStatus: `Da tai ${data.length} bai -> ${filename}` });
    return true;
  }

  async function scrapeLoop() {
    isScraping = true;
    collected = [];
    lastCollected = [];
    seen.clear();
    idleCount = 0;
    document.querySelectorAll('[data-scraped="1"]').forEach(el => { delete el.dataset.scraped; el.style.outline = ""; });

    chrome.storage.local.set({ scrapeStatus: "Dang cao...", scrapeCount: 0, scrapeReady: false });

    while (isScraping && collected.length < targetCount) {
      // mo rong tat ca bai bi cat "Xem them" truoc khi boc
      const expanded = expandSeeMore();
      if (expanded > 0) await sleep(800);
      const added = extractPosts();
      chrome.storage.local.set({ scrapeCount: collected.length, scrapeStatus: `Da lay ${collected.length}/${targetCount} (dang scroll...)` });

      if (added === 0) idleCount++;
      else idleCount = 0;

      // scroll manh hon, toi cuoi trang de FB load them
      if (idleCount >= 3) {
        window.scrollTo(0, document.body.scrollHeight);
        await sleep(3000);
        const added2 = extractPosts();
        if (added2 === 0) {
          // thu scroll nguoc len 1 chut roi xuong lai kich hoat lazy load
          window.scrollBy(0, -600);
          await sleep(1000);
          window.scrollTo(0, document.body.scrollHeight);
          await sleep(3000);
          if (extractPosts() === 0 && idleCount >= 6) {
            chrome.storage.local.set({ scrapeStatus: `Het bai hoac FB chan load, dung o ${collected.length} bai (da quet het trang)` });
            break;
          }
        } else idleCount = 0;
      } else {
        window.scrollTo(0, document.body.scrollHeight);
        await sleep(1800 + Math.random() * 700);
      }

      if (collected.length >= targetCount) break;
    }

    isScraping = false;
    chrome.storage.local.set({ isScraping:false });
    chrome.storage.local.remove(["scrapeTarget"]);

    if (collected.length === 0) {
      chrome.storage.local.set({ scrapeStatus: "Khong tim thay bai viet nao. Hay cuon xuong de load bai truoc khi cao.", scrapeReady: false });
      return;
    }

    lastCollected = [...collected];
    chrome.storage.local.set({ scrapeStatus: `Xong! Da cao ${collected.length} bai. Chon dinh dang ben duoi de tai.`, scrapeCount: collected.length, lastScrapeCount: collected.length, scrapeReady: true, scrapeHasData: true });
    console.log("[Scrape] Done, cho chon format de tai", collected);
  }

  function resetScrape() {
    isScraping = false;
    collected = [];
    lastCollected = [];
    seen.clear();
    idleCount = 0;
    document.querySelectorAll('[data-scraped="1"]').forEach(el => { delete el.dataset.scraped; el.style.outline = ""; });
    chrome.storage.local.set({ scrapeCount: 0, scrapeStatus: "Da reset - san sang cao dot moi", scrapeReady: false, scrapeHasData: false });
  }

  // tu dong tiep tuc sau reload - luu target de phuc hoi
  (async ()=>{
    const s = await chrome.storage.local.get(["isScraping","scrapeTarget","scrapeCountStored"]);
    if(s.isScraping && s.scrapeTarget){
      targetCount = s.scrapeTarget;
      console.log("[Scrape] Tu dong tiep tuc sau reload, target", targetCount);
      await new Promise(r=>setTimeout(r,2500));
      if(!isScraping){ isScraping=true; chrome.storage.local.set({ isScraping:true }); scrapeLoop(); }
    }
  })();

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "startScrape") {
      if (isScraping) { sendResponse({ ok: false, msg: "Dang cao roi" }); return true; }
      targetCount = Math.max(1, parseInt(msg.count) || 20);
      chrome.storage.local.set({ isScraping: true, scrapeTarget: targetCount });
      scrapeLoop();
      sendResponse({ ok: true });
    } else if (msg.action === "stopScrape") {
      isScraping = false;
      chrome.storage.local.set({ scrapeStatus: "Da dung", isScraping:false });
      chrome.storage.local.remove(["scrapeTarget"]);
      sendResponse({ ok: true });
    } else if (msg.action === "resetScrape") {
      resetScrape();
      sendResponse({ ok: true });
    } else if (msg.action === "downloadScrape") {
      const ok = doDownload(msg.format);
      sendResponse({ ok, count: (collected.length || lastCollected.length) });
    } else if (msg.action === "getScrapeStatus") {
      sendResponse({ isScraping, count: collected.length, ready: collected.length > 0 || lastCollected.length > 0 });
    }
    return true;
  });

  console.log("[Scrape] scrape.js loaded");
})();
