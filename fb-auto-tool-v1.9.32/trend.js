// trend.js - Học bài mới nhất từ nhóm nguồn đã tích/nhập link -> AI viết lại -> đăng nhóm đích.
// State machine riêng, không dùng chung scrape*/sales*/share* (theo AGENTS.md).
(function(){
  "use strict";
  if(window.__fbTrendV1924)return;
  window.__fbTrendV1924=true;
  console.log("[Trend] loaded v1.9.24");

  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const clean=v=>String(v||"").replace(/[ -­⁠⁡⁢⁣﻿]/g," ").replace(/\s+/g," ").trim();
  const labelOf=el=>clean(el?.innerText||el?.textContent||el?.getAttribute?.("aria-label")||"").toLocaleLowerCase("vi");
  const visible=el=>{
    if(!el?.isConnected)return false;
    try{
      const st=getComputedStyle(el),r=el.getBoundingClientRect();
      return r.width>0&&r.height>0&&st.display!=="none"&&st.visibility!=="hidden"&&st.opacity!=="0";
    }catch{return false;}
  };
  let learnLoopActive=false,postLoopActive=false;
  let learnStop=false,postStop=false;
  let learnRestart=false,postRestart=false;
  let learnRunId="",postRunId="",ownerTabId=0;

  async function getTabId(){
    if(ownerTabId)return ownerTabId;
    try{const r=await chrome.runtime.sendMessage({action:"getSenderTabId"});ownerTabId=Number(r?.tabId)||0;}catch{ownerTabId=0;}
    return ownerTabId;
  }
  async function learnActive(){
    if(learnStop)return false;
    const s=await chrome.storage.local.get(["trendLearnActive","trendLearnRunId","trendLearnOwnerTabId"]);
    const owner=Number(s.trendLearnOwnerTabId)||0,me=await getTabId();
    return !!s.trendLearnActive&&(!owner||owner===me)&&(!learnRunId||s.trendLearnRunId===learnRunId);
  }
  async function postActive(){
    if(postStop)return false;
    const s=await chrome.storage.local.get(["trendPostActive","trendPostRunId","trendPostOwnerTabId"]);
    const owner=Number(s.trendPostOwnerTabId)||0,me=await getTabId();
    return !!s.trendPostActive&&(!owner||owner===me)&&(!postRunId||s.trendPostRunId===postRunId);
  }
  async function learnStatus(msg,extra={}){await chrome.storage.local.set({trendLearnStatus:String(msg),...extra});}
  async function postStatus(msg,extra={}){await chrome.storage.local.set({trendPostStatus:String(msg),...extra});}
  const TREND_POST_AUTO={
    groupReadyWait:45000,groupStableWait:1600,
    composerWait:45000,anonymousWait:45000,paletteWait:20000,backgroundConfirmWait:20000,submitWait:30000,
    afterBgMin:3,afterBgMax:5,
    // Facebook can acknowledge the submit before the new anonymous post is
    // inserted into the SPA feed. Keep the proof window longer so a slow
    // feed does not report a false failure after a real publish.
    postVisibleWait:60000,afterPostMin:8,afterPostMax:12
  };
  async function waitWhileActive(ms,check){
    const end=Date.now()+Math.max(0,ms);
    while(Date.now()<end){
      if(!await check())return false;
      await sleep(Math.min(500,end-Date.now()));
    }
    return await check();
  }

  // ---------- LEARN: bóc bài mới nhất trong nhóm ----------
  // Chỉ bóc article trong vùng nội dung chính (role="main"). Khung chat
  // Messenger, sidebar, dialog, menu cũng dùng role="article" nhưng nằm ngoài
  // role="main" nên phải loại ngay từ gốc.
  function trendFeedRoot(){return document.querySelector('div[role="main"]')||document;}
  function trendFeed(){return trendFeedRoot().querySelector('div[role="feed"]')||document.querySelector('div[role="feed"]');}
  function trendText(el){return clean(el?.innerText||el?.textContent||"");}
  function trendExpandSeeMore(){
    let n=0;
    trendFeedRoot().querySelectorAll('div[role="button"]').forEach(b=>{
      const t=trendText(b);
      if(t==="Xem thêm"||t==="See more"){try{b.click();n++;}catch{}}
    });
    return n;
  }
  function trendIsSponsored(el){
    if(!el)return false;
    // Facebook uses data-ad-preview="message" for ordinary post text too;
    // treating that generic message node as an ad drops normal group posts.
    if(el.querySelector('a[href*="/ads/about"]'))return true;
    const explicitAdMarker=[...el.querySelectorAll('[data-ad-comet-preview],[data-ad-preview]')]
      .some(x=>!/^message$/i.test(String(x.getAttribute('data-ad-comet-preview')||x.getAttribute('data-ad-preview')||'')));
    if(explicitAdMarker)return true;
    return [...el.querySelectorAll('span[dir="auto"]')].some(x=>/^(được tài trợ|sponsored|quảng cáo)$/i.test(clean(x.innerText||x.textContent)));
  }
  function trendHasPostAction(el){
    if(!el)return false;
    const labels=[...el.querySelectorAll('button,[role="button"]')].map(labelOf);
    return labels.some(v=>/^(?:viết bình luận|write a comment)$/.test(v))
      ||labels.some(v=>/^(?:gửi nội dung này cho bạn bè hoặc đăng lên trang cá nhân của bạn\.?|send this to friends or post it on your profile\.?)$/i.test(v))
      ||!!el.querySelector('a[href*="/posts/"],a[href*="/permalink/"],a[href*="/videos/"],a[href*="/photos/"]');
  }
  function trendPostCandidates(){
    const root=trendFeedRoot(),feed=trendFeed();
    const direct=feed?[...feed.children].filter(trendHasPostAction):[];
    const articles=[...root.querySelectorAll('div[role="article"]')]
      .filter(el=>trendHasPostAction(el)&&!trendIsComment(el));
    return [...new Set([...direct,...articles])];
  }
  function trendIsComment(el){
    if(!el)return true;
    // Loại khung Messenger / chat / sidebar / dialog / menu — chúng cũng dùng
    // role="article" nhưng không phải bài viết trong nhóm.
    if(el.closest('[role="dialog"],[role="menu"],[role="complementary"],[role="navigation"],[role="banner"],[aria-label*="Messenger" i]'))return true;
    if(el.closest('ul[role="list"],[aria-label*="Bình luận" i],[aria-label*="Comment" i],[aria-label*="đoạn chat" i]'))return true;
    // Facebook currently wraps a real group post in another role=article.
    // The old unconditional nested-article rejection discarded every real
    // post because the useful inner article was the one containing the main
    // action bar. Keep nested articles only when they expose post signals;
    // ordinary reply/comment articles still fail closed.
    if(el.matches('div[role="article"]')&&el.parentElement?.closest('div[role="article"]')&&!trendHasPostAction(el))return true;
    if(!el.matches('div[role="article"]')&&el.closest('div[role="article"]'))return true;
    // Tin nhắn Messenger có chuỗi đặc trưng của ô nhập/ảnh chat (kế thừa từ scrape.js).
    const rawText=trendText(el).slice(0,1400);
    if(/(?:Nhập,?\s*Tin nhắn do|Tin nhắn do|đã gửi\s+\d+\s+ảnh|Hình ảnh trong tin nhắn|Mở đoạn chat|Đóng đoạn chat|type\s+(?:a\s+)?message|message\s+(?:sent|by)|images?\s+in\s+(?:a\s+)?message|open\s+chat|close\s+chat|hoạt động gần nhất|active\s+\d+\s*(?:m|h)\s*ago)/i.test(rawText))return true;
    return false;
  }
  function trendParseArticle(el,group){
    if(!el||el.dataset.trendLearned==="1")return null;
    if(trendIsSponsored(el))return null;
    const inComment=n=>{const a=n.closest('div[role="article"]');return !!a&&a!==el;};
    let text="";
    const msg=el.querySelector('div[data-ad-preview="message"],div[data-ad-comet-preview="message"]');
    if(msg&&!inComment(msg)&&trendText(msg).length>10)text=trendText(msg);
    if(text.length<20){
      let best="";
      el.querySelectorAll('div[dir="auto"]').forEach(c=>{
        if(inComment(c))return;
        const t=trendText(c);
        if(t.length>best.length)best=t;
      });
      if(best)text=best;
    }
    if(text.length<20)return null;
    text=text.replace(/\s*Xem thêm.*$/s,"").trim();
    if(text.length<20)return null;
    let link="";
    try{
      const a=el.querySelector('a[href*="/posts/"],a[href*="/permalink/"],a[href*="/videos/"],a[href*="/photos/"]');
      if(a)link=String(a.href||"").split("?")[0];
    }catch{}
    const id=link||text.slice(0,120);
    return {
      id:String(id).slice(0,300),
      text:text.slice(0,2000),
      link:link||"",
      author:"",
      time:"",
      sourceGroupId:String(group?.id||""),
      sourceGroupName:String(group?.name||""),
      sourceUrl:String(group?.url||location.href),
      scrapedAt:new Date().toISOString()
    };
  }
  function currentGroupId(){return String(location.pathname.match(/^\/groups\/([^/?#]+)/i)?.[1]||"").toLowerCase();}
  function trendPageGroupName(fallback=""){
    const candidates=[];
    try{
      document.querySelectorAll('div[role="main"] h1,h1').forEach(el=>{
        if(!visible(el))return;
        const text=clean(el.innerText||el.textContent||"");
        if(text)candidates.push(text);
      });
    }catch{}
    try{
      const title=clean(document.title||"").replace(/\s*[|·-]\s*(?:Facebook|Meta).*$/i,"").trim();
      if(title)candidates.push(title);
    }catch{}
    const reject=/^(?:facebook|home|groups?|nhóm|đăng nhập|log in|sign in)$/i;
    return candidates.find(text=>text.length>=2&&text.length<=150&&!reject.test(text))||String(fallback||"").trim();
  }
  function trendResolvedGroup(group){
    if(group?.explicitName)return {...group,groupNameResolved:true};
    const name=trendPageGroupName(group?.name||"");
    return name&&name!==String(group?.name||"")?{...group,name,groupNameResolved:true}:group;
  }
  function groupMatches(group){
    const cur=currentGroupId();
    try{
      const id=new URL(String(group?.url||""),location.href).pathname.match(/^\/groups\/([^/?#]+)/i)?.[1];
      if(id&&String(id).toLowerCase()===cur)return true;
    }catch{}
    return String(group?.id||"").toLowerCase()===cur;
  }
  function newestGroupUrl(group){
    try{
      const u=new URL(String(group?.url||""),location.href);
      if(!/\/groups\//i.test(u.pathname))return String(group?.url||"");
      u.searchParams.set("sorting_setting","CHRONOLOGICAL");
      return u.toString();
    }catch{return String(group?.url||"");}
  }
  function plainGroupUrl(group){
    try{
      const u=new URL(String(group?.url||""),location.href);
      if(!/\/groups\//i.test(u.pathname))return String(group?.url||"");
      u.search="";
      return u.toString();
    }catch{return String(group?.url||"");}
  }
  function countMainArticles(){
    try{return trendPostCandidates().length;}catch{return 0;}
  }
  // Đợi feed nhóm render. Tham số sorting_setting đôi khi khiến Facebook trả
  // trang trắng → thử lại bằng URL nhóm gốc rồi mới kết luận không có bài.
  async function ensureGroupFeed(group){
    for(let i=0;i<8;i++){
      if(!await learnActive())return false;
      if(countMainArticles()>0)return true;
      await sleep(1000);
    }
    try{
      const plain=plainGroupUrl(group);
      if(plain&&plain!==location.href){
        await learnStatus(`Trang sắp xếp không hiện bài, thử lại bằng link nhóm gốc: ${group.name}...`);
        location.assign(plain);
      }
    }catch{}
    const end=Date.now()+12000;
    while(Date.now()<end){
      if(!await learnActive())return false;
      if(countMainArticles()>0)return true;
      await sleep(1000);
    }
    return countMainArticles()>0;
  }
  // Facebook thường điều hướng SPA (không reload thật) nên sau location.assign
  // phải chờ URL đổi ngay trong context hiện tại thay vì return và hy vọng
  // resume sau reload. Nếu reload thật xảy ra, context chết và khối resume
  // cuối file sẽ tiếp tục từ trendLearnIndex đã persist.
  async function gotoGroupAndWait(group,check){
    try{location.assign(newestGroupUrl(group));}catch{}
    const end=Date.now()+25000;
    while(Date.now()<end){
      if(!await check())return false;
      try{if(groupMatches(group))return true;}catch{}
      await sleep(700);
    }
    try{return groupMatches(group);}catch{return false;}
  }

  async function learnOneGroup(group,perGroup,seen,onRound){
    let got=[],scanned=0,totalInMain=0;
    // cuộn + mở rộng vài nhịp để lấy bài mới nhất đang hiển thị
    for(let round=0;round<8&&got.length<perGroup;round++){
      if(!await learnActive())return {got,scanned,totalInMain};
      trendExpandSeeMore();
      await sleep(900);
      if(!await learnActive())return {got,scanned,totalInMain};
      totalInMain=countMainArticles();
      const candidates=trendPostCandidates()
        .filter(el=>el.dataset.trendLearned!=="1"&&trendText(el).length>0)
        // Prefer Facebook's useful inner post article over its empty wrapper.
        .sort((a,b)=>b.querySelectorAll('div[role="article"]').length-a.querySelectorAll('div[role="article"]').length);
      scanned+=candidates.length;
      for(const el of candidates){
        if(got.length>=perGroup)break;
        const d=trendParseArticle(el,group);
        el.dataset.trendLearned="1";
        if(!d)continue;
        if(seen.has(d.id))continue;
        seen.add(d.id);
        got.push(d);
      }
      try{if(onRound)await onRound({round:round+1,rounds:8,got:got.length,scanned,totalInMain,items:got.slice()});}catch{}
      if(got.length>=perGroup)break;
      window.scrollTo(0,document.body.scrollHeight);
      if(!await waitWhileActive(1800,learnActive))return {got,scanned,totalInMain};
    }
    return {got,scanned,totalInMain};
  }

  async function learnRun(){
    if(learnLoopActive)return;
    learnLoopActive=true;learnStop=false;
    try{
      const s=await chrome.storage.local.get(["trendLearnActive","trendLearnRunId","trendLearnConfig","trendLearnIndex","trendLearnPosts"]);
      learnRunId=String(s.trendLearnRunId||"");
      const cfg=s.trendLearnConfig;
      if(!s.trendLearnActive||!cfg?.groups?.length){learnLoopActive=false;return;}
      let index=Number(s.trendLearnIndex)||0;
      let all=Array.isArray(s.trendLearnPosts)?s.trendLearnPosts:[];
      const seen=new Set(all.map(p=>String(p?.id||"")));
      const perGroup=Math.max(1,Math.min(30,Number(cfg.perGroup)||10));
      while(index<cfg.groups.length){
        if(!await learnActive())return;
        let group=cfg.groups[index];
        if(!groupMatches(group)){
          await learnStatus(`Đang mở nhóm nguồn ${index+1}/${cfg.groups.length}: ${group.name}...`);
          await chrome.storage.local.set({trendLearnIndex:index});
          const arrived=await gotoGroupAndWait(group,learnActive);
          if(!await learnActive())return;
          if(!arrived||!groupMatches(group)){
            index++;
            await chrome.storage.local.set({trendLearnIndex:index,trendLearnStatus:`Không vào được nhóm ${group.name}, bỏ qua sang nhóm tiếp theo`});
            continue;
          }
          await waitWhileActive(2500,learnActive);
          if(!await learnActive())return;
        }
        await learnStatus(`Đang học nhóm ${index+1}/${cfg.groups.length}: ${group.name} — mục tiêu ${perGroup} bài (đã lưu ${all.length})`);
        await waitWhileActive(2000,learnActive);
        if(!await learnActive())return;
        // Chờ feed render thật; trang trắng (URL sắp xếp lỗi/chưa vào nhóm)
        // thì thử link gốc trước khi kết luận.
        await learnStatus(`Đang chờ bài viết hiện ra tại: ${group.name}...`);
        const hasFeed=await ensureGroupFeed(group);
        if(!await learnActive())return;
        if(!hasFeed){
          index++;
          const diag=await diagnosePage();
          await chrome.storage.local.set({trendLearnIndex:index,trendLastDiag:diag,trendLearnStatus:`Nhóm ${index}/${cfg.groups.length}: ${group.name} — không thấy ô bài viết nào hiện ra.${diagSummary(diag)}`});
          if(index<cfg.groups.length&&await learnActive()){
            await gotoGroupAndWait(cfg.groups[index],learnActive);
            if(!await learnActive())return;
          }
          continue;
        }
        const resolvedGroup=trendResolvedGroup(group);
        if(resolvedGroup!==group){
          group=resolvedGroup;
          cfg.groups[index]=group;
          await chrome.storage.local.set({trendLearnConfig:cfg});
        }
        const groupNo=index+1,groupTotal=cfg.groups.length;
        const res=await learnOneGroup(group,perGroup,seen,async p=>{
          // Lưu tạm từng vòng để popup hiện số bài tăng dần theo thời gian thực.
          const preview=[...all,...(Array.isArray(p.items)?p.items:[])].slice(-300);
          await chrome.storage.local.set({
            trendLearnPosts:preview,
            trendLearnCount:preview.length,
            trendLearnStatus:`Đang học nhóm ${groupNo}/${groupTotal}: ${group.name} — vòng ${p.round}/${p.rounds}, đã lấy ${p.got}/${perGroup} bài (quét ${p.scanned}/${p.totalInMain} ô, tổng lưu ${preview.length})`
          });
        });
        const got=res.got,scanned=res.scanned,totalInMain=res.totalInMain;
        all=[...all,...got].slice(-300);
        index++;
        const stash={trendLearnPosts:all,trendLearnCount:all.length,trendLearnIndex:index};
        if(!got.length){
          stash.trendLastDiag=await diagnosePage();
          stash.trendLearnStatus=`Nhóm ${groupNo}/${groupTotal}: ${group.name} — thấy ${totalInMain} ô bài nhưng quét ${scanned} ô không giữ được bài nào (bài quá ngắn/toàn ảnh?). Tổng lưu ${all.length}, sang nhóm tiếp theo.${diagSummary(stash.trendLastDiag)}`;
        }else{
          stash.trendLearnStatus=`Đã học xong nhóm ${groupNo}/${groupTotal}: ${group.name} — lấy ${got.length}/${perGroup} bài (tổng lưu ${all.length})`;
        }
        await chrome.storage.local.set(stash);
        if(index<cfg.groups.length&&await learnActive()){
          // Persist trước khi chuyển trang để reload thật (nếu có) resume đúng.
          // Nếu là SPA thì chờ URL đổi ngay trong context này rồi lặp tiếp.
          await gotoGroupAndWait(cfg.groups[index],learnActive);
          if(!await learnActive())return;
          continue;
        }
      }
      // Chỉ ghi "hoàn tất" khi cờ chạy còn bật; nếu user đã Dừng thì giữ
      // nguyên trạng thái dừng, không ghi đè thành xong.
      if(await learnActive()){
        await chrome.storage.local.set({trendLearnActive:false,trendLearnIndex:index,trendLearnReady:all.length>0,trendLearnStatus:all.length?`Học xong ${all.length} bài từ ${cfg.groups.length} nhóm. Bấm "Viết lại bằng AI".`:"Không học được bài nào. Hãy mở nhóm bằng tay kiểm tra: đã tham gia nhóm chưa, nhóm có bài chữ (không phải toàn ảnh/video) không, rồi thử lại với nhóm công khai khác."});
      }
    }catch(e){
      try{await learnStatus(`Lỗi học bài: ${e.message}`,{trendLearnActive:false});}catch{}
    }finally{
      learnLoopActive=false;
      // Phiên mới tới trong lúc vòng cũ còn sống: vòng cũ thoát vì lệch
      // runId, nên phải chạy lại phiên mới ở đây, không thì kẹt "không chạy".
      if(learnRestart){
        learnRestart=false;
        try{if(await learnActive())setTimeout(learnRun,300);}catch{}
      }
    }
  }

  // ---------- POST: đăng bài đã viết lại ----------
  function trendEditorIn(root=document){
    const list=[...root.querySelectorAll('[contenteditable="true"],textarea')].filter(visible);
    return list.sort((a,b)=>{
      const sa=/bạn viết gì|tạo bài|write something|create post/i.test(labelOf(a))?1:0;
      const sb=/bạn viết gì|tạo bài|write something|create post/i.test(labelOf(b))?1:0;
      return sb-sa;
    })[0]||null;
  }
  function trendDialog(){
    const ds=[...document.querySelectorAll('[role="dialog"]')].filter(visible);
    return ds.reverse().find(d=>trendEditorIn(d))||null;
  }
  function trendOpener(){
    const btns=[...document.querySelectorAll('[role="button"],button')].filter(visible);
    return btns.find(el=>/^(bạn viết gì đó|bạn viết gì|tạo bài viết|write something|create post)/i.test(labelOf(el)))
      ||btns.find(el=>/bạn viết gì|tạo bài viết|write something|create post/i.test(labelOf(el)))||null;
  }
  function trendAnonymousOpener(){
    const btns=[...document.querySelectorAll('[role="button"],button')].filter(el=>visible(el)&&!el.closest('[role="dialog"]'));
    return btns.find(el=>/^(bài viết ẩn danh|anonymous post)$/i.test(labelOf(el)))||null;
  }
  function trendAnonymousCreateButton(){
    const btns=[...document.querySelectorAll('[role="button"],button')].filter(visible);
    return btns.find(el=>/^(tạo bài viết ẩn danh|create anonymous post)$/i.test(labelOf(el)))||null;
  }
  function trendPostButton(root){
    return [...(root||document).querySelectorAll('[role="button"],button')].find(el=>/^(đăng|post|publish)$/.test(labelOf(el))&&visible(el)&&el.getAttribute("aria-disabled")!=="true"&&!el.disabled)||null;
  }
  async function trendWaitFor(fn,timeout=15000){
    const end=Date.now()+timeout;
    while(Date.now()<end){
      if(!await postActive())return null;
      try{const v=fn();if(v)return v;}catch{}
      await sleep(220);
    }
    return null;
  }
  async function trendWaitStableComposer(timeout=TREND_POST_AUTO.composerWait){
    const end=Date.now()+timeout;let stableDialog=null,stableEditor=null,stableAt=0;
    while(Date.now()<end){
      if(!await postActive())return null;
      const current=trendDialog(),editor=current&&trendEditorIn(current);
      if(current&&editor){
        if(current===stableDialog&&editor===stableEditor&&Date.now()-stableAt>=900)return current;
        if(current!==stableDialog||editor!==stableEditor){stableDialog=current;stableEditor=editor;stableAt=Date.now();}
      }else{stableDialog=null;stableEditor=null;stableAt=0;}
      await sleep(250);
    }
    return null;
  }
  async function trendClick(el){
    if(!visible(el))return false;
    try{el.scrollIntoView({block:"center"});}catch{}
    await sleep(250);
    try{
      const r=el.getBoundingClientRect();
      const res=await chrome.runtime.sendMessage({action:"trustedMouse",kind:"click",x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)});
      if(res?.ok)return true;
    }catch{}
    try{el.click();return true;}catch{return false;}
  }
  const TREND_BACKGROUND_COLOR_NAMES={pink:"hồng",green:"xanh lá",red:"đỏ",orange:"cam",yellow:"vàng",blue:"xanh dương",purple:"tím",burgundy:"đỏ thẫm",beige:"be",brown:"nâu",gray:"xám",black:"đen"};
  function trendBackgroundColorName(color){
    const keys={pink:"c.colorPink",green:"c.colorGreen",red:"c.colorRed",orange:"c.colorOrange",yellow:"c.colorYellow",blue:"c.colorBlue",purple:"c.colorPurple",burgundy:"c.colorBurgundy",beige:"c.colorBeige",brown:"c.colorBrown",gray:"c.colorGray",black:"c.colorBlack"};
    return TREND_BACKGROUND_COLOR_NAMES[color]?t(keys[color])||TREND_BACKGROUND_COLOR_NAMES[color]:t("gp2.colorPlain");
  }
  function normalizeTrendBackground(input){
    const allowed=Object.keys(TREND_BACKGROUND_COLOR_NAMES);
    const colors=Array.isArray(input?.colors)?[...new Set(input.colors.filter(c=>allowed.includes(c)))]:[];
    return {
      enabled:input?.enabled===true,
      mode:input?.mode==="fixed"?"fixed":"random",
      fixedColor:allowed.includes(input?.fixedColor)?input.fixedColor:"pink",
      colors:colors.length?colors:allowed,
      maxChars:Math.min(140,Math.max(40,parseInt(input?.maxChars)||100)),
      fallback:"skip"
    };
  }
  function trendFindVisibleButton(root,patterns){
    return [...(root||document).querySelectorAll('[role="button"],button')].find(el=>visible(el)&&patterns.some(pattern=>pattern.test(labelOf(el))))||null;
  }
  async function trendWaitCondition(fn,timeout=3000){
    const end=Date.now()+timeout;
    while(Date.now()<end){
      if(!await postActive())return false;
      try{if(await fn())return true;}catch{}
      await sleep(180);
    }
    return false;
  }
  async function trendClickAndWait(el,predicate,timeout=3000,fallbackDelay=900){
    if(!el?.isConnected||!visible(el))return false;
    try{el.scrollIntoView({block:"center",inline:"center"});}catch{}
    await sleep(220);
    // Facebook's palette items are React controls. A native click dispatch
    // updates the selected state more reliably than a coordinate click when
    // the palette has just animated into place. Keep the trusted mouse path
    // as the fallback for controls that do not respond to native click.
    try{el.click();}catch{}
    if(await trendWaitCondition(predicate,Math.min(timeout,Math.max(300,fallbackDelay))))return true;
    if(!el.isConnected)return false;
    if(!await trendClick(el))return false;
    return trendWaitCondition(predicate,Math.max(300,timeout-fallbackDelay));
  }
  function trendIsDecorativeBackground(label){
    return /gradient|chuyển\s*sắc|nền\s*chuyển\s*màu|hình\s*minh\s*họa|illustration/i.test(String(label||""));
  }
  function trendBackgroundLabelScore(color,label){
    const text=String(label||"").toLocaleLowerCase("vi");
    if(!/phông nền|background/.test(text)||trendIsDecorativeBackground(text))return -1;
    let matched=false,score=0;
    if(color==="pink")matched=/màu hồng|hồng\b|pink/.test(text)&&!/đỏ/.test(text);
    if(color==="green")matched=/xanh lá cây|màu xanh lá|green/.test(text);
    if(color==="red")matched=/(?:màu )?đỏ(?:[,\s]|$)|red/.test(text)&&!/hồng|sẫm|thẫm|điều|burgundy/.test(text);
    if(color==="orange")matched=/màu cam|cam\b|orange/.test(text);
    if(color==="yellow")matched=/màu vàng(?:[,\s]|$)|yellow/.test(text);
    if(color==="blue")matched=/xanh da trời|xanh dương|xanh bạc|blue/.test(text);
    if(color==="purple")matched=/màu tím(?:[,\s]|$)|tím đậm|tím sẫm|tím thẫm|purple/.test(text)&&!/hồng/.test(text);
    if(color==="burgundy")matched=/đỏ sẫm|đỏ thẫm|đỏ điều|burgundy/.test(text);
    if(color==="beige")matched=/màu be(?:[,\s]|$)|beige/.test(text);
    if(color==="brown")matched=/màu nâu|brown/.test(text);
    if(color==="gray")matched=/màu xám|xám nhạt|gray|grey/.test(text);
    if(color==="black")matched=/đen|màu đen|minh họa đen|black/.test(text);
    if(!matched)return -1;
    score+=100;
    if(/một màu trơn|solid/.test(text))score+=30;
    if(/nhạt|light/.test(text))score-=8;
    if(/sẫm|thẫm|dark/.test(text))score-=4;
    if(new RegExp(`màu ${TREND_BACKGROUND_COLOR_NAMES[color]},`).test(text))score+=15;
    return score;
  }
  function trendFindBackgroundChooser(){
    const isColorButton=el=>{
      if(!visible(el))return false;
      const label=labelOf(el);
      return /phông nền|background/.test(label)
        &&!/^không có phông nền$|^no background$/.test(label)
        &&!/^(?:ẩn|hiển thị) các lựa chọn phông nền$|^(?:hide|show) background options$/.test(label)
        &&!/^(?:tùy chọn phông nền|background options)$/.test(label);
    };
    const colors=[...document.querySelectorAll('[role="button"],button')].filter(isColorButton);
    if(!colors.length)return null;
    let best=null;
    for(const button of colors){
      let node=button.parentElement;
      for(let depth=0;node&&depth<8;depth++,node=node.parentElement){
        const count=[...node.querySelectorAll('[role="button"],button')].filter(isColorButton).length;
        if(count>=Math.min(3,colors.length)&&count<=32){
          const size=node.querySelectorAll('*').length;
          if(!best||size<best.size)best={node,size};
        }
      }
    }
    return best?.node||colors[0].parentElement||null;
  }
  function trendFindSolidBackgroundRoot(chooser){
    if(!chooser)return null;
    const heading=[...chooser.querySelectorAll('[role="heading"],h1,h2,h3')].find(h=>/^(một màu trơn|solid colors?)$/.test(labelOf(h)));
    if(!heading)return chooser;
    let node=heading.parentElement;
    for(let depth=0;node&&node!==chooser&&depth<7;depth++,node=node.parentElement){
      const count=[...node.querySelectorAll('[role="button"],button')].filter(b=>/phông nền|background/.test(labelOf(b))).length;
      if(count>=4&&count<=40)return node;
    }
    return chooser;
  }
  function trendEditorHasBackground(box,dialog){
    let node=box;
    for(let depth=0;node&&node!==dialog&&depth<8;depth++,node=node.parentElement){
      const style=getComputedStyle(node),image=style.backgroundImage,color=style.backgroundColor;
      if(image&&image!=="none")return true;
      if(color&&!/^(?:rgba?\(0, 0, 0, 0\)|transparent|rgb\(255, 255, 255\)|rgb\(240, 242, 245\))$/.test(color))return true;
    }
    return false;
  }
  function trendBackgroundApplied(color,dialog){
    const live=trendDialog()||dialog,box=live&&trendEditorIn(live);
    const selected=[...(live||document).querySelectorAll('[role="button"],button')].some(button=>{
      const label=labelOf(button),marked=button.getAttribute("aria-current")==="true"||button.getAttribute("aria-pressed")==="true"||button.getAttribute("data-selected")==="true";
      return visible(button)&&marked&&trendBackgroundLabelScore(color,label)>=0;
    });
    return selected||!!(box&&trendEditorHasBackground(box,live));
  }
  async function trendCloseBackgroundChooser(){
    const chooser=trendFindBackgroundChooser(),back=chooser&&trendFindVisibleButton(chooser,[/^(quay lại|back)$/]);
    if(back)await trendClickAndWait(back,()=>!trendFindBackgroundChooser(),2000);
  }
  async function trendApplyBackground(dialog,background,lastColor=""){
    const expanded=trendFindVisibleButton(dialog,[/^(ẩn các lựa chọn phông nền|hide background options)$/]);
    const toggle=trendFindVisibleButton(dialog,[/^(hiển thị các tùy chọn phông nền|show background options)$/]);
    if(!expanded&&!toggle)return {applied:false,reason:t("gp2.errNoPaletteBtn")};
    await postStatus(t("gp2.paletteOpening"),{trendPostStage:"background-opening"});
    if(!expanded&&!await trendClickAndWait(toggle,()=>!!trendFindVisibleButton(dialog,[/^(ẩn các lựa chọn phông nền|hide background options)$/]),TREND_POST_AUTO.paletteWait,1500))return {applied:false,reason:t("gp2.errPaletteClosed")};
    let chooser=null;
    await trendWaitCondition(()=>!!(chooser=trendFindBackgroundChooser()),TREND_POST_AUTO.paletteWait);
    const more=trendFindVisibleButton(dialog,[/^(tùy chọn phông nền|background options)$/]);
    if(!chooser&&more&&!await trendClickAndWait(more,()=>!!trendFindBackgroundChooser(),TREND_POST_AUTO.paletteWait,1500))return {applied:false,reason:t("gp2.errPalettePartial")};
    chooser=trendFindBackgroundChooser();
    const root=trendFindSolidBackgroundRoot(chooser)||dialog;
    const palette=[...root.querySelectorAll('[role="button"],button')].filter(button=>visible(button)&&/phông nền|background/i.test(labelOf(button)));
    const allowed=[...(background.mode==="fixed"?[background.fixedColor]:background.colors)].filter((c,i,a)=>TREND_BACKGROUND_COLOR_NAMES[c]&&a.indexOf(c)===i);
    const byColor=new Map();
    for(const color of allowed){
      const candidate=[...root.querySelectorAll('[role="button"],button')].map(button=>({button,score:trendBackgroundLabelScore(color,labelOf(button))})).filter(item=>item.score>=0).sort((a,b)=>b.score-a.score)[0];
      if(candidate)byColor.set(color,candidate);
    }
    const available=[...byColor.entries()].map(([color,item])=>({color,...item}));
    let selected=null,selectedColor="",selectedScore=-1;
    if(background.mode==="fixed"){
      const fixed=byColor.get(background.fixedColor);
      if(fixed){selected=fixed.button;selectedColor=background.fixedColor;selectedScore=fixed.score;}
    }else if(available.length){
      const nonRepeat=lastColor?available.filter(item=>item.color!==lastColor):available;
      const pool=nonRepeat.length?nonRepeat:available;
      const picked=pool[Math.floor(Math.random()*pool.length)];
      selected=picked.button;selectedColor=picked.color;selectedScore=picked.score;
    }else if(background.mode!=="fixed"){
      // Facebook có thể chỉ trả về một phần bảng màu của từng nhóm. Random
      // vẫn chọn ngẫu nhiên một nền trơn thực tế, không lấy gradient đầu tiên.
      const fallback=palette.map(button=>{
        const label=labelOf(button);
        if(!/phông nền|background/.test(label)||trendIsDecorativeBackground(label)||/^không có phông nền$|^no background$/.test(label))return null;
        const color=Object.keys(TREND_BACKGROUND_COLOR_NAMES).find(c=>trendBackgroundLabelScore(c,label)>=0)||"";
        return color?{button,color,score:trendBackgroundLabelScore(color,label)}:null;
      }).filter(Boolean);
      const nonRepeat=lastColor?fallback.filter(item=>item.color!==lastColor):fallback;
      const pool=nonRepeat.length?nonRepeat:fallback;
      if(pool.length){const picked=pool[Math.floor(Math.random()*pool.length)];selected=picked.button;selectedColor=picked.color;selectedScore=picked.score;}
    }
    if(!selected){await trendCloseBackgroundChooser();return {applied:false,reason:t("gp2.errNoColor")};}
    await postStatus(t("gp2.picking",{color:trendBackgroundColorName(selectedColor)}),{trendPostStage:"background-selecting",trendPostBackgroundColor:selectedColor});
    if(!await trendClickAndWait(selected,()=>trendBackgroundApplied(selectedColor,dialog),TREND_POST_AUTO.backgroundConfirmWait,1800)){
      await trendCloseBackgroundChooser();
      return {applied:false,reason:t("gp2.errNoConfirm",{color:trendBackgroundColorName(selectedColor)})};
    }
    await trendCloseBackgroundChooser();
    await postStatus(t("gp2.pickedReady",{color:trendBackgroundColorName(selectedColor)}),{trendPostStage:"background-confirmed",trendPostBackgroundColor:selectedColor});
    return {applied:true,color:selectedColor,score:selectedScore};
  }
  function trendFitBackgroundText(content,maxChars){
    let value=clean(content).replace(/https?:\/\/\S+/gi,"").replace(/(^|\s)#[\p{L}\p{N}_-]+/gu," ").replace(/\s+/g," ").trim();
    const max=Math.min(140,Math.max(40,parseInt(maxChars)||100));
    if([...value].length<=max)return value;
    // AI normally repairs an over-limit draft before this guard. If an old
    // pending draft reaches the composer, keep a complete sentence first.
    const sentenceParts=value.match(/[^.!?。！？]+[.!?。！？]+/g)||[];
    let complete="";
    for(const part of sentenceParts){
      const candidate=`${complete}${part}`.trim();
      if([...candidate].length>max)break;
      complete=candidate;
    }
    if(complete)return complete;
    const chars=[...value].slice(0,max),keepQuestion=/\?\s*$/.test(value);
    let shortened=chars.join("").replace(/\s+\S*$/," ").replace(/[,:;.!?…\-]+\s*$/g,"").trim();
    if(!shortened)shortened=chars.join("").trim();
    return [...`${shortened}${keepQuestion?"?":""}`].slice(0,max).join("").trim();
  }
  async function waitTrendPostGroupReady(group){
    const deadline=Date.now()+TREND_POST_AUTO.groupReadyWait;
    let lastMarker="",stableSince=0;
    while(Date.now()<deadline){
      if(!await postActive())return false;
      const main=document.querySelector('[role="main"]'),heading=document.querySelector('h1,[role="main"] h1'),opener=trendOpener();
      if(groupMatches(group)&&main&&heading&&opener){
        const marker=`${location.pathname}|${clean(heading.innerText||heading.textContent)}|${main.childElementCount}`;
        if(marker===lastMarker&&Date.now()-stableSince>=TREND_POST_AUTO.groupStableWait)return true;
        if(marker!==lastMarker){lastMarker=marker;stableSince=Date.now();}
      }else{lastMarker="";stableSince=0;}
      const left=Math.max(1,Math.ceil((deadline-Date.now())/1000));
      await postStatus(t("trend2.waitGroup",{name:group.name,left}));
      await sleep(500);
    }
    return false;
  }
  async function gotoTrendPostGroupAndWait(group){
    try{location.assign(newestGroupUrl(group));}catch{}
    const deadline=Date.now()+TREND_POST_AUTO.groupReadyWait+15000;
    while(Date.now()<deadline){
      if(!await postActive())return false;
      if(groupMatches(group))return await waitTrendPostGroupReady(group);
      await sleep(700);
    }
    return false;
  }
  async function trendOpenComposer(anonymousMode,index){
    const d=trendDialog();
    if(d&&trendEditorIn(d))return trendWaitStableComposer();
    const btn=await trendWaitFor(()=>anonymousMode?(trendAnonymousOpener()||trendOpener()):trendOpener(),TREND_POST_AUTO.composerWait);
    if(!btn)throw new Error("Không thấy nút Tạo bài viết trong nhóm đích");
    if(!await trendClick(btn))throw new Error("Không bấm được nút Tạo bài viết");
    if(anonymousMode&&/^(bài viết ẩn danh|anonymous post)$/i.test(labelOf(btn))){
      await chrome.storage.local.set({trendPostStage:"anonymous-confirmation",trendPostSubmitIndex:index,trendPostAnonymousMode:"anonymous"});
      const confirm=await trendWaitFor(trendAnonymousCreateButton,TREND_POST_AUTO.anonymousWait);
      if(confirm){
        if(!await trendClick(confirm))throw new Error("Không xác nhận được hộp thoại Bài viết ẩn danh");
      }
    }
    const opened=await trendWaitStableComposer();
    if(!opened)throw new Error("Facebook chưa mở ô đăng bài");
    return opened;
  }
  function trendAnonymousSwitch(root=document){
    const scope=root||document;
    return [...scope.querySelectorAll('[role="switch"],[role="checkbox"],input[type="checkbox"],[role="button"],button')]
      .filter(visible)
      .find(el=>{
        const ids=String(el.getAttribute("aria-labelledby")||"").split(/\s+/).filter(Boolean);
        const labelled=ids.map(id=>document.getElementById(id)).map(labelOf).join(" ");
        const parent=labelOf(el.closest("label")||el.parentElement);
        const text=[labelOf(el),labelled,parent].filter(Boolean).join(" ");
        if(!/ẩn danh|anonymous/i.test(text))return false;
        const role=String(el.getAttribute("role")||el.tagName||"").toLowerCase();
        if((role==="button"||role==="")&&!/(?:thành viên ẩn danh|anonymous (?:member|participant))/i.test(text))return false;
        return true;
      })||null;
  }
  function trendAnonymousChecked(el){
    if(!el)return false;
    const aria=el.getAttribute("aria-checked");
    if(aria!==null)return aria==="true";
    if(typeof el.checked==="boolean")return el.checked;
    if(/(?:thành viên ẩn danh|anonymous (?:member|participant))/i.test(labelOf(el)))return true;
    return /^(?:checked|on|true)$/i.test(String(el.getAttribute("data-state")||""));
  }
  function trendAnonymousDisclosure(){
    return [...document.querySelectorAll('[role="dialog"]')].filter(visible).find(dialog=>{
      const text=labelOf(dialog);
      return /(?:bài viết ẩn danh|anonymous post)/i.test(text)
        && /(?:không bao gồm tên|không nhìn thấy tên|won't include your name|won.?t include your name|profile picture)/i.test(text);
    })||null;
  }
  async function trendConfirmAnonymousDisclosure(index,groupName){
    const deadline=Date.now()+TREND_POST_AUTO.anonymousWait;
    while(Date.now()<deadline){
      if(!await postActive())throw new Error("Đã dừng khi xác nhận chế độ ẩn danh");
      const disclosure=trendAnonymousDisclosure();
      if(disclosure){
        const ok=[...disclosure.querySelectorAll('[role="button"],button')]
          .find(el=>/^(?:ok|okay|đồng ý|got it)$/i.test(labelOf(el))&&visible(el));
        if(ok){
          await chrome.storage.local.set({trendPostStage:"anonymous-confirmation",trendPostSubmitIndex:index,trendPostAnonymousMode:"anonymous"});
          if(!await trendClick(ok))throw new Error("Không xác nhận được hộp thoại Đăng ẩn danh");
          await sleep(500);
          continue;
        }
      }
      const current=trendAnonymousSwitch(trendDialog()||document);
      if(current&&trendAnonymousChecked(current))return current;
      await postStatus(t("trend2.waitAnonymous",{name:groupName,left:Math.max(1,Math.ceil((deadline-Date.now())/1000))}),{trendPostStage:"anonymous-arming",trendPostSubmitIndex:index,trendPostAnonymousMode:"anonymous"});
      await sleep(220);
    }
    return null;
  }
  async function trendEnsureAnonymous(root,enabled,index,groupName){
    let sw=trendAnonymousSwitch(root);
    if(!enabled){
      if(sw&&trendAnonymousChecked(sw)){
        await chrome.storage.local.set({trendPostStage:"anonymous-arming",trendPostSubmitIndex:index,trendPostAnonymousMode:"normal"});
        if(!await postActive())throw new Error("Đã dừng trước khi tắt chế độ ẩn danh");
        if(!await trendClick(sw))throw new Error("Không tắt được chế độ ẩn danh");
        sw=await trendWaitFor(()=>trendAnonymousSwitch(trendDialog()||root),TREND_POST_AUTO.anonymousWait);
        if(!sw||trendAnonymousChecked(sw))throw new Error("Facebook chưa xác nhận tắt chế độ ẩn danh");
      }
      await chrome.storage.local.set({trendPostStage:"identity-confirmed",trendPostSubmitIndex:index,trendPostAnonymousMode:"normal"});
      return false;
    }
    const deadline=Date.now()+TREND_POST_AUTO.anonymousWait;
    while(Date.now()<deadline&&!sw){
      if(!await postActive())throw new Error("Đã dừng trước khi bật chế độ ẩn danh");
      const left=Math.max(1,Math.ceil((deadline-Date.now())/1000));
      await postStatus(t("trend2.waitAnonymous",{name:groupName,left}),{trendPostStage:"anonymous-arming",trendPostSubmitIndex:index,trendPostAnonymousMode:"anonymous"});
      sw=trendAnonymousSwitch(trendDialog()||root);
      if(!sw)await sleep(300);
    }
    if(!sw){
      const error=new Error(t("trend2.anonymousUnavailable",{name:groupName}));
      error.anonymousUnsupported=true;
      throw error;
    }
    if(!trendAnonymousChecked(sw)){
      await chrome.storage.local.set({trendPostStage:"anonymous-arming",trendPostSubmitIndex:index,trendPostAnonymousMode:"anonymous"});
      if(!await postActive())throw new Error("Đã dừng trước khi bật chế độ ẩn danh");
      if(!await trendClick(sw))throw new Error("Không bấm được công tắc Đăng ẩn danh");
    }
    const confirmed=await trendConfirmAnonymousDisclosure(index,groupName);
    if(!confirmed){
      const error=new Error(t("trend2.anonymousUnavailable",{name:groupName}));
      error.anonymousUnsupported=true;
      throw error;
    }
    await chrome.storage.local.set({trendPostStage:"anonymous-confirmed",trendPostSubmitIndex:index,trendPostAnonymousMode:"anonymous"});
    return true;
  }
  function trendPostContentVisible(content){
    const expected=clean(content).slice(0,80).toLocaleLowerCase("vi");
    if(expected.length<10)return false;
    const main=document.querySelector('[role="main"]')||document.body;
    const feed=main.querySelector('[role="feed"]');
    const candidates=[...main.querySelectorAll('[role="article"],[data-pagelet^="FeedUnit_"],[data-ad-preview="message"]'),...(feed?[...feed.children]:[])];
    return candidates.some(node=>{
      // A published article normally contains its own comment editor. Do not
      // discard the article just because that editor is present; only dialog
      // content is a composer and must be excluded from the proof scan.
      if(!visible(node)||node.closest('[role="dialog"]'))return false;
      return clean(node.innerText||node.textContent).toLocaleLowerCase("vi").includes(expected);
    });
  }
  async function waitForTrendPostDisplayed(content,groupName,proof={}){
    const deadline=Date.now()+TREND_POST_AUTO.postVisibleWait,holdMs=TREND_POST_AUTO.afterPostMin*1000+Math.floor(Math.random()*(TREND_POST_AUTO.afterPostMax-TREND_POST_AUTO.afterPostMin+1))*1000;
    const started=Date.now();
    if(proof.pending){
      while(Date.now()-started<holdMs){
        if(!await postActive())return false;
        const left=Math.max(1,Math.ceil((holdMs-(Date.now()-started))/1000));
        await postStatus(t("trend2.waitPending",{name:groupName,left}),{trendPostStage:"waiting-pending"});
        await sleep(500);
      }
      await chrome.storage.local.set({trendPostStage:"post-pending"});
      return true;
    }
    while(Date.now()<deadline){
      if(!await postActive())return false;
      const left=Math.max(1,Math.ceil((deadline-Date.now())/1000));
      await postStatus(t("trend2.waitVisible",{name:groupName,left}),{trendPostStage:"waiting-visible"});
      if(trendPostContentVisible(content)&&Date.now()-started>=holdMs){await chrome.storage.local.set({trendPostStage:"post-visible"});return true;}
      await sleep(500);
    }
    const error=new Error(t("trend2.postNotVisible",{name:groupName}));error.postDisplayUnconfirmed=true;throw error;
  }
  async function trendDraftForGroup(cfg,group,index){
    const resolved=trendResolvedGroup(group);
    if(resolved!==group){
      cfg.groups[index]=resolved;
      await chrome.storage.local.set({trendPostConfig:cfg});
    }
    let draft=String(cfg.drafts?.[index]||cfg.drafts?.[index%Math.max(1,cfg.drafts?.length||1)]||"").trim();
    // A URL-only manual target deliberately leaves its draft empty so the
    // actual Facebook group heading can be used as {groupName} after arrival.
    if(resolved.manualLink&&!resolved.explicitName&&!resolved.groupNameResolved)draft="";
    if(!draft&&cfg.sourceText&&cfg.prompt){
      if(!await postActive())throw new Error("Đã dừng trước khi AI xử lý nhóm");
      await postStatus(`AI đang xử lý bài theo đúng tên nhóm: ${resolved.name}`);
      const result=await chrome.runtime.sendMessage({action:"aiRewriteTrend",sourceText:cfg.sourceText,groupName:resolved.name,prompt:cfg.prompt,styleProfileId:cfg.styleProfileId||"",variant:index+1,background:normalizeTrendBackground(cfg.background)});
      if(!result?.ok)throw new Error(result?.error||`AI không xử lý được nhóm ${resolved.name}`);
      draft=String(result.content||"").trim();
      cfg.drafts=Array.isArray(cfg.drafts)?cfg.drafts:[];
      cfg.drafts[index]=draft;
      cfg.groups[index]={...resolved,groupNameResolved:true};
      await chrome.storage.local.set({trendPostConfig:cfg,trendRewriteDrafts:cfg.drafts});
    }
    return {group:resolved,draft};
  }
  function trendVisibleAlerts(){return [...document.querySelectorAll('[role="alert"],[role="status"]')].filter(visible).map(el=>clean(el.innerText||el.textContent)).filter(Boolean);}
  function trendIsRateLimitText(text){
    const value=clean(text).toLocaleLowerCase("vi");
    return /bảo vệ cộng đồng khỏi spam|giới hạn tần suất|thử lại sau|rate.?limit|too many actions|temporarily blocked|action blocked|try again later|you.?re temporarily blocked/i.test(value);
  }
  function trendVisibleRateLimitText(){
    const alert=trendVisibleAlerts().find(trendIsRateLimitText);
    if(alert)return alert;
    // Facebook đôi khi render cảnh báo trong container thường, không gắn role=alert/status.
    const bodyText=clean(document.body?.innerText||"");
    return trendIsRateLimitText(bodyText)?bodyText:"";
  }
  function trendRateLimitError(text){
    const error=new Error(t("trend2.rateLimited"));
    error.rateLimited=true;
    error.facebookMessage=clean(text);
    return error;
  }
  async function trendTypeAndSubmit(content,groupName,index,anonymousMode,backgroundInput={},lastColor=""){
    const background=normalizeTrendBackground(backgroundInput);
    const postContent=background.enabled?trendFitBackgroundText(content,background.maxChars):String(content||"");
    let dialog=await trendOpenComposer(!!anonymousMode,index);
    await trendEnsureAnonymous(dialog,!!anonymousMode,index,groupName);
    dialog=await trendWaitStableComposer();
    if(!dialog)throw new Error("Facebook chưa giữ được composer sau khi chọn danh tính");
    let backgroundResult={applied:false,color:"",reason:t("gp2.bgOff")};
    if(background.enabled){
      backgroundResult=await trendApplyBackground(dialog,background,lastColor);
      if(!backgroundResult.applied)throw new Error(t("gp2.skippedBySetting",{reason:backgroundResult.reason}));
      const rest=TREND_POST_AUTO.afterBgMin*1000+Math.floor(Math.random()*(TREND_POST_AUTO.afterBgMax-TREND_POST_AUTO.afterBgMin+1))*1000;
      if(!await waitWhileActive(rest,postActive))throw new Error(t("gp2.stoppedAfterBg"));
      dialog=await trendWaitStableComposer();
      if(!dialog)throw new Error(t("gp2.reloadInputFail"));
    }
    let editor=trendEditorIn(dialog);
    if(!editor)throw new Error("Facebook chưa có ô nội dung");
    try{editor.focus();}catch{}
    await sleep(300);
    let ok=false;
    try{
      const res=await chrome.runtime.sendMessage({action:"trustedInput",text:postContent,typingMinDelay:24,typingMaxDelay:70});
      ok=!!res?.ok;
    }catch{}
    await sleep(600);
    dialog.querySelectorAll('[contenteditable="true"]').forEach(()=>{});
    const current=trendDialog()||dialog;
    editor=trendEditorIn(current)||editor;
    const typed=clean(editor?.innerText||editor?.textContent||editor?.value||"");
    if(!ok||typed.length<10){
      try{
        editor.focus();
        document.execCommand("selectAll",false,null);
        document.execCommand("insertText",false,postContent);
      }catch{
        try{editor.textContent=postContent;editor.dispatchEvent(new InputEvent("input",{bubbles:true}));}catch{}
      }
      await sleep(600);
    }
    const afterNode=await trendWaitFor(()=>{const node=trendEditorIn(trendDialog()||dialog),text=clean(node?.innerText||node?.textContent||node?.value||"");return text.length>=10?node:null;},20000);
    const after=clean(afterNode?.innerText||afterNode?.textContent||afterNode?.value||"");
    if(after.length<10)throw new Error("Facebook chưa nhận nội dung bài viết lại");
    const liveDialog=trendDialog()||dialog,liveEditor=trendEditorIn(liveDialog);
    if(backgroundResult.applied&&!trendEditorHasBackground(liveEditor,liveDialog))throw new Error(t("gp2.bgDropped"));
    if(!await postActive())throw new Error("Đã dừng trước khi bấm Đăng");
    const scope=trendDialog()||dialog;
    const btn=trendPostButton(scope);
    if(!btn)throw new Error("Nút Đăng chưa sẵn sàng");
    const before=after.slice(0,45).toLocaleLowerCase("vi");
    const beforeAlerts=new Set(trendVisibleAlerts()),dispatchedAt=Date.now();
    await chrome.storage.local.set({trendPostStage:"submit-armed",trendPostSubmitIndex:index,trendPostSubmitDispatchedAt:0});
    if(!await postActive())throw new Error("Đã dừng trước khi bấm Đăng");
    if(!await trendClick(btn))throw new Error("Không bấm được nút Đăng");
    await chrome.storage.local.set({trendPostStage:"submitted",trendPostSubmitIndex:index,trendPostSubmitDispatchedAt:dispatchedAt});
    let pendingConfirmation="",rateLimitMessage="";
    const proof=await trendWaitFor(()=>{
      const rateAlert=trendVisibleRateLimitText();
      if(rateAlert){rateLimitMessage=rateAlert;return {rateLimited:true};}
      const alert=trendVisibleAlerts().filter(text=>!beforeAlerts.has(text)).find(text=>/đã (?:được )?đăng|đang chờ phê duyệt|chờ quản trị viên|published|pending(?:s+for)?s+(?:review|approval)/i.test(text));
      if(alert){pendingConfirmation=alert;return true;}
      const dd=trendDialog();
      if(!dd&&Date.now()-dispatchedAt>900)return true;
      const ed=trendEditorIn(dd);
      const now=clean(ed?.innerText||ed?.textContent||"").toLocaleLowerCase("vi");
      return Date.now()-dispatchedAt>900&&(!now||!now.includes(before));
    },TREND_POST_AUTO.submitWait);
    if(rateLimitMessage)throw trendRateLimitError(rateLimitMessage);
    if(!proof)throw new Error("Facebook chưa xác nhận đăng bài (cần kiểm tra thủ công), dừng để tránh trùng");
    await waitForTrendPostDisplayed(postContent,groupName,{pending:!!pendingConfirmation});
    return {ok:true,content:postContent,backgroundApplied:backgroundResult.applied,color:backgroundResult.color};
  }

  async function postRun(){
    if(postLoopActive)return;
    postLoopActive=true;postStop=false;
    try{
      const first=await chrome.storage.local.get(["trendPostActive","trendPostRunId","trendPostConfig"]);
      postRunId=String(first.trendPostRunId||"");
      const cfg=first.trendPostConfig;
      if(!first.trendPostActive||!cfg?.groups?.length){postLoopActive=false;return;}
      // Vòng lặp xử lý từng nhóm: reload thật thì context chết và resume cuối
      // file tiếp tục từ index đã persist; SPA thì lặp tiếp ngay.
      while(true){
        const s=await chrome.storage.local.get(["trendPostActive","trendPostRunId","trendPostIndex","trendPostDone","trendPostSkipped","trendPostNextAt","trendPostLastColor","trendPostStage","trendPostSubmitIndex","trendPostSubmitDispatchedAt"]);
        if(!await postActive()){postLoopActive=false;return;}
        let index=Number(s.trendPostIndex)||0,done=Number(s.trendPostDone)||0,skipped=Number(s.trendPostSkipped)||0;
        if(index>=cfg.groups.length){
          await postStatus(`Hoàn tất: đã đăng ${done}/${cfg.groups.length}, bỏ qua ${skipped} nhóm`,{trendPostActive:false,trendPostNextAt:0});
          postLoopActive=false;return;
        }
        let group=cfg.groups[index];
        if((s.trendPostStage==="anonymous-arming"||s.trendPostStage==="anonymous-confirmation"||s.trendPostStage==="anonymous-confirmed"||s.trendPostStage==="identity-confirmed"||s.trendPostStage==="submit-armed"||s.trendPostStage==="submitted"||s.trendPostStage==="waiting-visible"||s.trendPostStage==="waiting-pending"||s.trendPostStage==="post-visible"||s.trendPostStage==="post-pending")&&Number(s.trendPostSubmitIndex)===index){
          await postStatus(`Đã dừng tại ${group.name}: Facebook đã nhận cú bấm Đăng nhưng phiên bị tải lại trước khi xác minh bài hiển thị`,{trendPostActive:false,trendPostNextAt:0});
          postLoopActive=false;return;
        }
        let draft="";
        if(!groupMatches(group)){
          await postStatus(`Đang mở nhóm đích ${index+1}/${cfg.groups.length}: ${group.name}...`);
          await chrome.storage.local.set({trendPostIndex:index});
          const arrived=await gotoTrendPostGroupAndWait(group);
          if(!await postActive()){postLoopActive=false;return;}
          if(!arrived||!groupMatches(group)){await postStatus(t("trend2.groupLoading"),{trendPostActive:false,trendPostNextAt:0,trendPostIndex:index});postLoopActive=false;return;}
          else await postStatus(`Đã vào nhóm đích ${index+1}/${cfg.groups.length}: ${group.name}`);
        }
        if(groupMatches(group)){
          const nextAt=Number(s.trendPostNextAt)||0;
          if(nextAt>Date.now()&&!await waitWhileActive(nextAt-Date.now(),postActive)){postLoopActive=false;return;}
          try{
            const prepared=await trendDraftForGroup(cfg,group,index);
            group=prepared.group;draft=prepared.draft;
            if(!draft)throw new Error("chưa có bài viết lại");
            await postStatus(`Đang đăng bài viết lại ${index+1}/${cfg.groups.length} tại ${group.name}`);
            const posted=await trendTypeAndSubmit(draft,group.name,index,!!cfg.anonymousMode,cfg.background,s.trendPostLastColor||"");
            if(!await postActive()){postLoopActive=false;return;}
            done++;index++;
            await chrome.storage.local.set({trendPostDone:done,trendPostIndex:index,trendPostLastColor:posted.backgroundApplied?posted.color:(s.trendPostLastColor||""),trendPostStage:"",trendPostSubmitIndex:-1,trendPostSubmitDispatchedAt:0,trendPostStatus:`Đã đăng ${done}/${cfg.groups.length}: ${group.name}${posted.backgroundApplied?` — nền ${trendBackgroundColorName(posted.color)}`:""}`});
          }catch(e){
            const msg=String(e?.message||e);
            if(e?.rateLimited||e?.postDisplayUnconfirmed||/chưa xác nhận đăng bài/i.test(msg)){
              await postStatus(`Dừng tại ${group.name}: ${msg}`,{trendPostActive:false,trendPostNextAt:0,trendPostIndex:index});
              postLoopActive=false;return;
            }
            skipped++;index++;
            await chrome.storage.local.set({trendPostSkipped:skipped,trendPostIndex:index,trendPostStage:"",trendPostSubmitIndex:-1,trendPostSubmitDispatchedAt:0,trendPostStatus:`Bỏ qua ${group.name}: ${msg}`});
          }
        }
        if(index<cfg.groups.length&&await postActive()){
          const delay=Math.min(3600,Math.max(5,Number(cfg.interDelay)||30));
          await chrome.storage.local.set({trendPostIndex:index,trendPostNextAt:Date.now()+delay*1000,trendPostStatus:`Đã xong ${done}/${cfg.groups.length}; chờ ${delay}s trước ${cfg.groups[index].name}`});
          const arrived=await gotoTrendPostGroupAndWait(cfg.groups[index]);
          if(!await postActive()){postLoopActive=false;return;}
          if(!arrived){await postStatus(t("trend2.groupLoading"),{trendPostActive:false,trendPostNextAt:0,trendPostIndex:index});postLoopActive=false;return;}
          continue;
        }else if(await postActive()){
          const fin=await chrome.storage.local.get(["trendPostDone","trendPostSkipped","trendPostIndex"]);
          await postStatus(`Hoàn tất: đã đăng ${fin.trendPostDone||done}/${cfg.groups.length}, bỏ qua ${fin.trendPostSkipped||skipped} nhóm`,{trendPostActive:false,trendPostNextAt:0,trendPostIndex:Number(fin.trendPostIndex)||index});
          postLoopActive=false;return;
        }else{postLoopActive=false;return;}
      }
    }catch(e){
      try{await postStatus(`Lỗi đăng bài viết lại: ${e.message}`,{trendPostActive:false});}catch{}
    }finally{
      postLoopActive=false;
      if(postRestart){
        postRestart=false;
        try{if(await postActive())setTimeout(postRun,300);}catch{}
      }
    }
  }

  chrome.storage.onChanged.addListener((ch,area)=>{
    if(area!=="local")return;
    if(ch.trendLearnActive?.newValue===false)learnStop=true;
    if(ch.trendPostActive?.newValue===false)postStop=true;
  });

  // Chẩn đoán read-only: không đổi state, chỉ đọc DOM trang đang mở để biết
  // vì sao không học được bài (0 article? bị lọc? parse rớt? chưa join?).
  // Đặt ở scope IIFE để cả learnRun và handler tin nhắn đều gọi được.
  async function diagnosePage(){
    try{
      const main=document.querySelector('div[role="main"]');
      const docArticles=document.querySelectorAll('div[role="article"]').length;
      const inMain=main?[...main.querySelectorAll('div[role="article"]')]:[];
      const posts=trendPostCandidates();
      const stage={docArticles,mainArticles:inMain.length,postCandidates:posts.length,notComment:0,hasText:0,notSponsored:0,parsed:0};
      const fail={comment:0,empty:0,sponsored:0,parseFail:0};
      const samples=[];
      for(const el of posts.slice(0,15)){
        const raw=trendText(el);
        if(trendIsComment(el)){fail.comment++;continue;}
        stage.notComment++;
        if(!raw){fail.empty++;continue;}
        stage.hasText++;
        if(trendIsSponsored(el)){fail.sponsored++;continue;}
        stage.notSponsored++;
        const was=el.dataset.trendLearned;
        let d=null;
        try{d=trendParseArticle(el,{name:"",id:"",url:location.href});}catch{}
        if(was===undefined)delete el.dataset.trendLearned;
        else el.dataset.trendLearned=was;
        if(d){stage.parsed++;if(samples.length<3)samples.push({text:raw.slice(0,180),link:d.link||""});}
        else fail.parseFail++;
      }
      const body=(document.body?.innerText||"").slice(0,4000);
      const signals={
        loginForm:!!document.querySelector('input[type="password"]'),
        joinPrompt:/(tham gia nhóm|join group|yêu cầu tham gia)/i.test(body),
        notAvailable:/(rất tiếc|something went wrong|content isn't available|nội dung này không hiển thị)/i.test(body),
        feedRole:document.querySelectorAll('div[role="feed"]').length
      };
      return {ok:true,url:location.href,title:document.title||"",hasMain:!!main,stage,fail,samples,signals};
    }catch(e){return {ok:false,error:String(e?.message||e)};}
  }
  function diagSummary(d){
    if(!d||!d.ok)return "";
    const s=d.stage,f=d.fail,g=d.signals;
    let extra="";
    if(g.loginForm)extra=" Phát hiện form đăng nhập — nick này CHƯA đăng nhập Facebook trên tab này!";
    else if(g.joinPrompt)extra=" Thấy chữ tham gia nhóm — có thể chưa vào nhóm, đang chờ duyệt, hoặc nhóm kín giới hạn xem.";
    else if(g.notAvailable)extra=" Trang đang báo lỗi hiển thị nội dung.";
    else if(!d.hasMain)extra=" Trang không có vùng nội dung chính (có thể chưa tải xong hoặc không phải trang nhóm).";
    return ` [Chẩn đoán: toàn trang ${s.docArticles} ô article, vùng chính ${s.mainArticles} ô, ứng viên bài=${s.postCandidates||0}, bóc được ${s.parsed}; loại chat=${f.comment}/rỗng=${f.empty}/quảng cáo=${f.sponsored}/rớt=${f.parseFail}.${extra}]`;
  }

  chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
    if(msg.action==="startTrendLearn"){
      learnRunId=String(msg.runId||"");learnStop=false;ownerTabId=Number(sender.tab?.id)||ownerTabId;
      chrome.storage.local.set({trendLearnActive:true,trendLearnRunId:learnRunId,trendLearnOwnerTabId:ownerTabId,trendLearnConfig:msg.config,trendLearnIndex:0,trendLearnPosts:[],trendLearnCount:0,trendLearnReady:false,trendLearnStatus:"Đang bắt đầu học bài từ nhóm nguồn..."}).then(()=>{
        if(learnLoopActive)learnRestart=true;
        else setTimeout(learnRun,300);
        sendResponse({ok:true});
      });
      return true;
    }
    if(msg.action==="stopTrendLearn"){learnStop=true;learnRestart=false;chrome.storage.local.set({trendLearnActive:false,trendLearnStatus:"Đã dừng học bài"}).then(()=>sendResponse({ok:true}));return true;}
    if(msg.action==="resetTrendLearn"){learnStop=true;learnRestart=false;chrome.storage.local.set({trendLearnActive:false,trendLearnRunId:"",trendLearnOwnerTabId:0,trendLearnConfig:null,trendLearnIndex:0,trendLearnPosts:[],trendLearnCount:0,trendLearnReady:false,trendLearnOutline:"",trendRewriteDrafts:[],trendLastDiag:null,trendLearnStatus:"Đã reset học bài"}).then(()=>sendResponse({ok:true}));return true;}
    if(msg.action==="getTrendLearnData"){
      (async()=>{const s=await chrome.storage.local.get(["trendLearnPosts","trendLearnCount"]);const d=Array.isArray(s.trendLearnPosts)?s.trendLearnPosts:[];sendResponse({ok:true,posts:d,count:d.length});})();
      return true;
    }
    if(msg.action==="trendDiagnose"){
      diagnosePage().then(r=>sendResponse(r));
      return true;
    }
    if(msg.action==="startTrendPost"){
      postRunId=String(msg.runId||"");postStop=false;ownerTabId=Number(sender.tab?.id)||ownerTabId;
      chrome.storage.local.set({trendPostActive:true,trendPostRunId:postRunId,trendPostOwnerTabId:ownerTabId,trendPostConfig:msg.config,trendPostIndex:0,trendPostDone:0,trendPostSkipped:0,trendPostTotal:msg.config?.groups?.length||0,trendPostNextAt:0,trendPostLastColor:"",trendPostStage:"",trendPostSubmitIndex:-1,trendPostSubmitDispatchedAt:0,trendPostAnonymousMode:msg.config?.anonymousMode?"anonymous":"normal",trendPostStatus:"Đang bắt đầu đăng bài viết lại..."}).then(()=>{if(postLoopActive)postRestart=true;else setTimeout(postRun,300);sendResponse({ok:true});});
      return true;
    }
    if(msg.action==="stopTrendPost"){postStop=true;postRestart=false;chrome.storage.local.set({trendPostActive:false,trendPostNextAt:0,trendPostStage:"",trendPostStatus:"Đã dừng đăng bài viết lại"}).then(()=>sendResponse({ok:true}));return true;}
    if(msg.action==="resetTrendPost"){postStop=true;postRestart=false;chrome.storage.local.set({trendPostActive:false,trendPostRunId:"",trendPostOwnerTabId:0,trendPostConfig:null,trendPostIndex:0,trendPostDone:0,trendPostSkipped:0,trendPostTotal:0,trendPostNextAt:0,trendPostLastColor:"",trendPostStage:"",trendPostSubmitIndex:-1,trendPostSubmitDispatchedAt:0,trendPostStatus:"Đã reset đăng bài viết lại"}).then(()=>sendResponse({ok:true}));return true;}
    return false;
  });

  // Resume sau reload: chỉ owner tab + cờ còn bật.
  chrome.storage.local.get(["trendLearnActive","trendLearnRunId","trendLearnOwnerTabId","trendPostActive","trendPostRunId","trendPostOwnerTabId"]).then(async s=>{
    try{
      const me=(await chrome.runtime.sendMessage({action:"getSenderTabId"}))?.tabId||0;
      if(s.trendLearnActive&&(!s.trendLearnOwnerTabId||Number(s.trendLearnOwnerTabId)===Number(me))){learnRunId=String(s.trendLearnRunId||"");ownerTabId=Number(me)||0;setTimeout(learnRun,800);}
      if(s.trendPostActive&&(!s.trendPostOwnerTabId||Number(s.trendPostOwnerTabId)===Number(me))){postRunId=String(s.trendPostRunId||"");ownerTabId=Number(me)||0;setTimeout(postRun,1200);}
    }catch{}
  }).catch(()=>{});
})();
