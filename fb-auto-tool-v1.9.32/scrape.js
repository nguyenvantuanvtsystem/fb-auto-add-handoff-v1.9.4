// scrape.js - Cào bài viết profile/page -> xuất md/json/txt
(() => {
  let isScraping = false;
  let collected = [];
  let seen = new Set();
  let targetCount = 20;
  let idleCount = 0;
  let skipSponsored = true;
  let runSerial = 0;

  function sourceKey(url=location.href){
    try{
      const u=new URL(url,location.href),host=String(u.hostname||"").toLowerCase().replace(/\.$/,"");
      // Facebook thường đổi m./www./web. sang hostname khác sau điều hướng.
      // Chỉ chuẩn hoá các hostname Facebook đã tin cậy; path vẫn là định danh
      // bắt buộc để không dùng dữ liệu của một nguồn khác.
      const canonicalHost=host==="facebook.com"||host.endsWith(".facebook.com")?"facebook.com":host;
      const origin=canonicalHost==="facebook.com"?"https://facebook.com":`${u.protocol.toLowerCase()}//${u.host.toLowerCase()}`;
      return `${origin}${u.pathname}`.replace(/\/$/g,"").toLowerCase();
    }catch{return String(url||"").split(/[?#]/)[0].replace(/\/$/g,"").toLowerCase();}
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // Popup ghi cờ dừng trực tiếp vào storage để Stop vẫn có hiệu lực khi
  // message tới content script bị lỡ. Mọi nhịp chờ của scraper phải đọc cờ
  // này, đồng thời khoá đúng nguồn đang cào để không tiếp tục ở route khác.
  async function scrapeRunActive(runId){
    if(!isScraping||runId!==runSerial)return false;
    try{
      const state=await chrome.storage.local.get(["isScraping","scrapeRunSourceUrl"]);
      const sameSource=!state.scrapeRunSourceUrl||sourceKey(state.scrapeRunSourceUrl)===sourceKey(location.href);
      if(!state.isScraping||!sameSource){isScraping=false;return false;}
      return true;
    }catch{return false;}
  }

  async function scrapeSleep(ms,runId){
    const end=Date.now()+Math.max(0,ms);
    while(Date.now()<end){
      if(!await scrapeRunActive(runId))return false;
      await sleep(Math.min(500,end-Date.now()));
    }
    return scrapeRunActive(runId);
  }

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

  function isSponsoredArticle(el) {
    if(!el) return false;
    if(el.querySelector('a[href*="/ads/about"],a[href*="facebook.com/ads/about"],a[href*="/ads/library"],[data-ad-comet-preview],[data-ad-preview]')) return true;
    if(el.querySelector('[aria-label="Được tài trợ" i],[aria-label="Sponsored" i],[aria-label="Quảng cáo" i]')) return true;
    return [...el.querySelectorAll('h2,h3,h4,h5,[role="heading"],span[dir="auto"]')]
      .some(node=>/^(?:được tài trợ|sponsored|quảng cáo|advertisement|ad)$/i.test((node.innerText||node.textContent||'').trim()));
  }

  // Comment trên Facebook thường cũng dùng role="article" nhưng nằm lồng
  // trong article của bài chính. Chỉ nhận article ngoài cùng làm bài viết.
  function isCommentCandidate(el) {
    if(!el) return true;
    if(el.closest('ul[role="list"], [aria-label*="Bình luận" i], [aria-label*="Comment" i], [data-pagelet*="Comment" i]')) return true;
    if(el.matches('div[role="article"]') && el.parentElement?.closest('div[role="article"]')) return true;
    if(!el.matches('div[role="article"]') && el.closest('div[role="article"]')) return true;
    const rawText=(el.innerText||"").replace(/\s+/g," ").trim().slice(0,1400);
    // Các cửa sổ Messenger cũng dùng role="article" nhưng có chuỗi đặc trưng
    // của tin nhắn/ô nhập; không được đưa vào dữ liệu bài viết.
    if(/(?:Nhập,?\s*Tin nhắn do|Tin nhắn do|đã gửi\s+\d+\s+ảnh|Hình ảnh trong tin nhắn|Mở đoạn chat|Đóng đoạn chat|type\s+(?:a\s+)?message|message\s+(?:sent|by)|images?\s+in\s+(?:a\s+)?message|open\s+chat|close\s+chat)/i.test(rawText)) return true;
    const head=(el.querySelector('h2,h3,h4,[role="heading"]')?.innerText||'').trim();
    return /^(trả lời|reply)\b/i.test(head);
  }

  function parseArticle(el) {
    if (el.dataset.scraped === "1") return null;
    if (skipSponsored && isSponsoredArticle(el)) return null;

    function isInComment(node) {
      if(node.closest('ul, div[aria-label*="Bình luận"], div[aria-label*="Comment"], div[data-pagelet*="Comment"]')) return true;
      const nestedArticle=node.closest('div[role="article"]');
      return !!nestedArticle && nestedArticle!==el;
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
      clone.querySelectorAll('ul, div[aria-label*="Bình luận"], div[aria-label*="Comment"], div[data-pagelet*="Comment"], div[role="article"]').forEach(n => n.remove());
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
      const dotSpans = [...el.querySelectorAll('span')].map(s=>s.innerText.trim()).filter(s=>/^\d+\s*(năm|tháng|ngày|giờ|phút|tuần)\b/i.test(s)||/^Tháng\s*\d+.*\d{4}/i.test(s));
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

    const path=location.pathname||"";
    const sourceType=/^\/groups\//i.test(path)?"group":(/^\/pages\//i.test(path)?"page":"profile");
    const sourceTitle=(document.title||"").replace(/^\(\d+\)\s*/g,"").replace(/\s*\|\s*Facebook\s*$/i,"").trim();
    return { id, author: author || (sourceTitle && !/^Facebook$/i.test(sourceTitle)?sourceTitle:t("sc.unknownAuthorDiac")), time: time || "", text: text || t("sc.noText"), link: link || "", images: imgs, isSponsored:isSponsoredArticle(el), sourceType, sourceUrl:location.href, sourceTitle:document.title||"", scrapedAt: new Date().toISOString() };
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
        if(isCommentCandidate(target)) return;
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
          if(isCommentCandidate(el)) return;
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
    let md = t("sc.mdTitle",{d:new Date().toLocaleString(I18N_LANG==="en"?"en-US":"vi-VN")})+`\n`;
    md += t("sc.mdHead",{src:window.location.href,n:data.length});
    data.forEach((p, i) => {
      const titleTime = p.time ? ` - ${p.time}` : "";
      md += `## ${i + 1}. ${p.author || t("sc.unknownAuthor")}${titleTime}\n\n`;
      if (p.link) md += `Link: ${p.link}\n\n`;
      else md += t("sc.noLink")+`\n\n`;
      // dam bao text xuong dong dep, khong dinh chu
      const cleanText = (p.text || "").replace(/\s{2,}/g, " ").trim();
      md += `${cleanText}\n\n`;
      if (p.images.length > 0) {
        p.images.forEach(img => md += `![${t("sc.imgAlt")}](${img})\n`);
        md += `\n`;
      }
      md += `---\n\n`;
    });
    return md;
  }

  function generateTXT(data) {
    const source=data.find(p=>p?.sourceUrl)?.sourceUrl||window.location.href;
    const sourceTitle=data.find(p=>p?.sourceTitle)?.sourceTitle||document.title||"Facebook";
    const header=t("sc.txtHead",{src:source,title:sourceTitle,n:data.length});
    return header+data.map((p, i) =>
      `=== ${t("sc.txtPost")} ${i + 1} ===\n${t("sc.txtAuthor")} ${p.author || "N/A"}\n${t("sc.txtTime")} ${p.time || "N/A"}\nLink: ${p.link}\n${t("sc.txtContent")}\n${p.text}\n${p.images.length ? t("sc.txtImages") + " " + p.images.join(", ") + "\n" : ""}`
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
  let lastDownloadReason = "";

  function doDownload(format) {
    lastDownloadReason = "";
    if (collected.length === 0 && lastCollected.length === 0) { lastDownloadReason="no-data"; return false; }
    const data = collected.length > 0 ? collected : lastCollected;
    const sourceKeys=[...new Set(data.map(p=>p?.sourceUrl?sourceKey(p.sourceUrl):"").filter(Boolean))];
    if(sourceKeys.length && (sourceKeys.length>1 || sourceKeys[0]!==sourceKey(location.href))){
      chrome.storage.local.set({scrapeStatus:t("sc.wrongSourceDl")});
      lastDownloadReason="source-mismatch";
      return false;
    }
    const ts = new Date().toISOString().replace(/[:.]/g,"-").slice(0, 19);
    const sourceName=(document.title||"facebook").replace(/[^\p{L}\p{N}_-]+/gu,"-").replace(/^-+|-+$/g,"").slice(0,50)||"facebook";
    let content, filename, mime;
    if (format === "json") {
      content = generateJSON(data);
      filename = `fb_posts_${sourceName}_${ts}.json`;
      mime = "application/json";
    } else if (format === "txt") {
      content = generateTXT(data);
      filename = `fb_posts_${sourceName}_${ts}.txt`;
      mime = "text/plain";
    } else {
      content = generateMD(data);
      filename = `fb_posts_${sourceName}_${ts}.md`;
      mime = "text/markdown";
    }
    download(content, filename, mime);
    chrome.storage.local.set({ scrapeStatus: t("sc.downloaded",{n:data.length,file:filename}) });
    return true;
  }

  async function scrapeLoop(resume=false) {
    const runId=++runSerial;
    isScraping = true;
    if(resume){
      const saved=await chrome.storage.local.get("scrapePosts");
      collected=Array.isArray(saved.scrapePosts)?saved.scrapePosts.slice(0,500):[];
      lastCollected=[...collected];
      seen=new Set(collected.map(p=>String(p?.id||"")).filter(Boolean));
    }else{
      collected = [];
      lastCollected = [];
      seen.clear();
      await chrome.storage.local.remove("scrapePosts");
    }
    idleCount = 0;
    document.querySelectorAll('[data-scraped="1"]').forEach(el => { delete el.dataset.scraped; el.style.outline = ""; });

    await chrome.storage.local.set({ scrapeStatus: resume?t("sc.resumed",{from:collected.length,to:targetCount}):t("sc.starting"), scrapeCount: collected.length, scrapeReady: false, scrapeRunSourceUrl:sourceKey(location.href), scrapeSkipAds:skipSponsored, scrapeStartedAt:Date.now(), isScraping:true });

    while (collected.length < targetCount) {
      if(!await scrapeRunActive(runId))return;
      // mo rong tat ca bai bi cat "Xem them" truoc khi boc
      const expanded = expandSeeMore();
      if (expanded > 0 && !await scrapeSleep(800,runId))return;
      if(!await scrapeRunActive(runId))return;
      const added = extractPosts();
      if(!await scrapeRunActive(runId))return;
      await chrome.storage.local.set({ scrapePosts:collected.slice(-500), scrapeCount: collected.length, scrapeStatus: t("sc.progress",{from:collected.length,to:targetCount}) });

      if (added === 0) idleCount++;
      else idleCount = 0;

      // scroll manh hon, toi cuoi trang de FB load them
      if (idleCount >= 3) {
        if(!await scrapeRunActive(runId))return;
        window.scrollTo(0, document.body.scrollHeight);
        if(!await scrapeSleep(3000,runId))return;
        const added2 = extractPosts();
        if (added2 === 0) {
          // thu scroll nguoc len 1 chut roi xuong lai kich hoat lazy load
          if(!await scrapeRunActive(runId))return;
          window.scrollBy(0, -600);
          if(!await scrapeSleep(1000,runId))return;
          if(!await scrapeRunActive(runId))return;
          window.scrollTo(0, document.body.scrollHeight);
          if(!await scrapeSleep(3000,runId))return;
          if(!await scrapeRunActive(runId))return;
          if (extractPosts() === 0 && idleCount >= 6) {
            await chrome.storage.local.set({ scrapeStatus: t("sc.stalled",{n:collected.length}) });
            break;
          }
        } else idleCount = 0;
      } else {
        if(!await scrapeRunActive(runId))return;
        window.scrollTo(0, document.body.scrollHeight);
        if(!await scrapeSleep(1800 + Math.random() * 700,runId))return;
      }

      if (collected.length >= targetCount) break;
    }

    // Một phiên mới có thể đã được bắt đầu trong lúc phiên cũ đang chờ
    // Facebook render; phiên cũ tuyệt đối không được ghi đè state mới.
    if(!await scrapeRunActive(runId))return;
    isScraping = false;
    await chrome.storage.local.set({ isScraping:false });
    await chrome.storage.local.remove(["scrapeTarget"]);

    if (collected.length === 0) {
      await chrome.storage.local.set({ scrapeStatus: t("sc.noPosts"), scrapeReady: false });
      return;
    }

    lastCollected = [...collected];
    await chrome.storage.local.set({ scrapePosts:lastCollected.slice(-500), scrapeStatus: t("sc.done",{n:collected.length,src:document.title||sourceKey(location.href)}), scrapeCount: collected.length, lastScrapeCount: collected.length, scrapeReady: true, scrapeHasData: true });
    console.log("[Scrape] done",{count:collected.length});
  }

  function resetScrape() {
    runSerial++;
    isScraping = false;
    collected = [];
    lastCollected = [];
    seen.clear();
    idleCount = 0;
    document.querySelectorAll('[data-scraped="1"]').forEach(el => { delete el.dataset.scraped; el.style.outline = ""; });
    chrome.storage.local.set({ scrapeCount: 0, scrapeStatus: t("sc.resetDone"), scrapeReady: false, scrapeHasData: false, isScraping:false });
    chrome.storage.local.remove(["scrapePosts","scrapeTarget","scrapeRunSourceUrl","scrapeRequestedSourceUrl","scrapeSkipAds","scrapeStartedAt"]);
  }

  // tu dong tiep tuc sau reload - luu target de phuc hoi
  (async ()=>{
    const s = await chrome.storage.local.get(["isScraping","scrapeTarget","scrapeCountStored","scrapePosts","scrapeRunSourceUrl","scrapeSkipAds","scrapeOwnerTabId"]);
    if(s.scrapeOwnerTabId){
      try{
        const r=await chrome.runtime.sendMessage({action:"getSenderTabId"});
        const myId=r&&r.tabId;
        if(myId&&myId!==s.scrapeOwnerTabId)return;
      }catch{}
    }
    if(Array.isArray(s.scrapePosts)&&s.scrapePosts.length){lastCollected=s.scrapePosts.slice(-500);}
    const sameSource=!!s.scrapeRunSourceUrl&&sourceKey(s.scrapeRunSourceUrl)===sourceKey(location.href);
    if(s.isScraping && s.scrapeTarget && sameSource){
      targetCount = s.scrapeTarget;
      skipSponsored = s.scrapeSkipAds !== false;
      console.log("[Scrape] Tu dong tiep tuc sau reload, target", targetCount);
      await new Promise(r=>setTimeout(r,2500));
      const live=await chrome.storage.local.get("isScraping");
      if(live.isScraping&&!isScraping){ isScraping=true; await chrome.storage.local.set({ isScraping:true }); scrapeLoop(true); }
    }else if(s.isScraping){
      // Cờ cũ từ nguồn khác không được phép khôi phục sang profile/page mới.
      await chrome.storage.local.set({isScraping:false,scrapeReady:false,scrapeHasData:false,scrapeCount:0});
      await chrome.storage.local.remove(["scrapePosts","scrapeTarget","scrapeRunSourceUrl","scrapeRequestedSourceUrl","scrapeSkipAds","scrapeStartedAt"]);
    }
  })();

  // Stop/Reset từ popup ghi storage trực tiếp trước, vì vậy listener này là
  // phương án an toàn khi chrome.tabs.sendMessage không tới tab đang chạy.
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area!=="local")return;
    if(changes.isScraping?.newValue===false){
      isScraping=false;
      runSerial++;
    }
  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "startScrape") {
      // Bắt đầu nguồn mới luôn thay thế phiên cũ (kể cả phiên khôi phục bị treo).
      if(msg.sourceUrl && sourceKey(msg.sourceUrl)!==sourceKey(location.href)){
        sendResponse({ok:false,error:t("sc.leftSource")});
        return true;
      }
      if (isScraping) isScraping=false;
      targetCount = Math.max(1, parseInt(msg.count) || 20);
      skipSponsored = msg.skipAds !== false;
      chrome.storage.local.set({ isScraping: true, scrapeTarget: targetCount, scrapeSkipAds:skipSponsored, scrapeRunSourceUrl:sourceKey(location.href), scrapeRequestedSourceUrl:msg.sourceUrl||sourceKey(location.href), scrapeStartedAt:Date.now() });
      scrapeLoop(false);
      sendResponse({ ok: true });
    } else if (msg.action === "stopScrape") {
      isScraping = false;
      runSerial++;
      chrome.storage.local.set({ scrapeStatus: t("sc.stopped"), isScraping:false });
      chrome.storage.local.remove(["scrapeTarget"]);
      sendResponse({ ok: true });
    } else if (msg.action === "resetScrape") {
      resetScrape();
      sendResponse({ ok: true });
    } else if (msg.action === "downloadScrape") {
      const ok = doDownload(msg.format);
      sendResponse({ ok, reason:lastDownloadReason, count: (collected.length || lastCollected.length) });
    } else if (msg.action === "getScrapeData") {
      (async()=>{
        const saved=await chrome.storage.local.get("scrapePosts");
        const data=collected.length?collected:(lastCollected.length?lastCollected:(Array.isArray(saved.scrapePosts)?saved.scrapePosts:[]));
        sendResponse({ok:true,posts:data.slice(-500),count:data.length});
      })();
    } else if (msg.action === "getScrapeStatus") {
      sendResponse({ isScraping, count: collected.length, ready: collected.length > 0 || lastCollected.length > 0 });
    }
    return true;
  });

  console.log("[Scrape] scrape.js loaded");
})();
