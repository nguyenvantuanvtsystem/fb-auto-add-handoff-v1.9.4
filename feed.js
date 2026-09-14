// feed.js - Tuong tac ban tin + Comment AI
(() => {
  let isFeedInteracting = false;
  let feedCount = 0, feedTarget = 20;
  let feedMinDelay = 3000, feedMaxDelay = 8000;
  let feedReaction = "random";

  let isAICommenting = false;
  let aiCount = 0, aiTarget = 10;
  let aiMinDelay = 10000, aiMaxDelay = 20000;
  let aiEconomyMode="balanced",aiBatchSize=5,aiCacheDays=7;
  // Chỉ theo dõi composer do Comment AI vừa mở và nhập. Không đụng vào
  // composer người dùng chưa được luồng này sở hữu.
  let aiCommentDraftBox=null, aiCommentDraftScope=null;
  let aiCommentDraftIdentity="", aiCommentDraftSignature="";
  let aiActivationActive=false,aiActivationBox=null,aiActivationScope=null;

  function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
  function rand(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }
  // Quy tắc DỪNG BẰNG MỌI GIÁ + chống chạy trùng: resume sau reload chỉ chạy
  // trên đúng tab sở hữu. Tab khác thấy cờ nhưng bỏ qua (Dừng thì dọn cờ).
  async function runOwnedByThisTab(ownerTabId){
    if(!ownerTabId)return true;
    try{
      const r=await chrome.runtime.sendMessage({action:"getSenderTabId"});
      const myId=r&&r.tabId;
      return !myId||myId===ownerTabId;
    }catch{return true;}
  }
  function setAiDelayRange(minValue,maxValue){
    const minSec=Math.max(1,parseInt(minValue)||10);
    const maxSec=Math.max(1,parseInt(maxValue)||20);
    aiMinDelay=Math.min(minSec,maxSec)*1000;
    aiMaxDelay=Math.max(minSec,maxSec)*1000;
  }
  function isRenderedElement(el){
    if(!el?.isConnected || el.getClientRects().length===0) return false;
    const style=getComputedStyle(el);
    if(style.display==="none" || style.visibility==="hidden" || style.visibility==="collapse" || Number(style.opacity)===0) return false;
    const r=el.getBoundingClientRect();
    return r.width>0 && r.height>0;
  }
  function commentCacheKey(text){let h=2166136261;for(const c of String(text).slice(0,500)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return "p"+(h>>>0).toString(36);}
  function postContentKey(text){
    const normalized=String(text||"").replace(/[\u200B-\u200D\u2060\uFEFF]/g," ").replace(/\s+/g," ").trim().toLowerCase();
    return normalized.length>=15?commentCacheKey(normalized):"";
  }
  // Chốt chặn cuối trước khi đăng: loại U+FFFD và surrogate lẻ (emoji bị chẻ)
  // để comment không dính ký tự lỗi và không bị Facebook từ chối.
  function sanitizeCommentOutput(value){
    return String(value||"")
      .replace(/\uFFFD/g,"")
      .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g,"")
      .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,"");
  }
  function fallbackComment(text){const lowerText=String(text).toLowerCase();const pools=lowerText.match(/tuyển dụng|việc làm|ứng tuyển|job|hiring|career|apply/i)?[t("ai.fb.hire1"),t("ai.fb.hire2")]:lowerText.match(/bán|giá|sản phẩm|mua|buy|price|product|sale|shop/i)?[t("ai.fb.sale1"),t("ai.fb.sale2")]:lowerText.match(/công nghệ|ai|máy tính|phần mềm|tech|software|computer|gadget/i)?[t("ai.fb.tech1"),t("ai.fb.tech2")]:[t("ai.fb.gen1"),t("ai.fb.gen2"),t("ai.fb.gen3")];return pools[Math.floor(Math.random()*pools.length)];}

  async function trustedMouse(el, kind, isStillActive){
    if(isStillActive&&!await isStillActive())return false;
    if(!isRenderedElement(el)) return false;
    try {
      el.scrollIntoView({behavior:"instant",block:"center"});
    } catch {
      try { el.scrollIntoView({behavior:"smooth",block:"center"}); } catch {}
    }
    await sleep(200);
    if(isStillActive&&!await isStillActive())return false;
    const r=el.getBoundingClientRect();
    const x=Math.round(r.left+r.width/2), y=Math.round(r.top+r.height/2);
    let debuggerOk = false;
    if(x >= 0 && y >= 0 && x <= window.innerWidth && y <= window.innerHeight){
      const hit=document.elementFromPoint(x,y);
      if(hit && (hit===el || el.contains(hit) || hit.contains(el))){
        try{
          const res=await chrome.runtime.sendMessage({action:"trustedMouse",kind,x,y});
          if(res?.ok) debuggerOk = true;
        }catch(_){}
      }
    }
    if(debuggerOk) return true;
    try {
      if(kind==="click") {
        el.focus();
        el.click();
      } else if (kind==="hover") {
        el.dispatchEvent(new MouseEvent('mouseover', {bubbles: true}));
        el.dispatchEvent(new MouseEvent('mouseenter', {bubbles: true}));
      }
      return true;
    } catch {
      return false;
    }
  }

  const REACTION_LABELS = {
    like: ["Thích","Like"],
    love: ["Yêu thích","Love"],
    haha: ["Haha"],
    wow: ["Wow","Ngạc nhiên"],
    sad: ["Buồn","Sad"],
    angry: ["Phẫn nộ","Angry","Giận dữ"]
  };
  function findReactionBtn(type){
    const labels = REACTION_LABELS[type]||[];
    // FB moi dat cac nut trong dialog "Cam xuc", moi nut co wrapper rieng nen
    // khong the dem sibling nhu giao dien cu.
    const picker = document.querySelector('[role="dialog"][aria-label="Cảm xúc"], [role="dialog"][aria-label="Reactions"]');
    if(!picker) return null;
    const all = [...picker.querySelectorAll('[role="button"][aria-label], div[aria-label]')];
    for(const lab of labels){
      for(const btn of all){
        const lb=(btn.getAttribute("aria-label")||"").trim();
        if(lb!==lab) continue;
        if(!isRenderedElement(btn)) continue;
        return btn;
      }
    }
    return null;
  }
  async function doReact(btn, type, isStillActive){
    const t = type==="random" ? ["like","love","haha","wow","sad","angry"][Math.floor(Math.random()*6)] : type;
    if(t==="like"){
      if(!await trustedMouse(btn,"click",isStillActive)) return {used:t,success:false};
      await sleep(900);
      const changed=!btn.isConnected || !isLabel(btn,["thích","thich","like"]);
      return {used:t,success:changed};
    }
    // Dung su kien chuot that qua trinh duyet; Facebook bo qua click gia lap.
    for(let attempt=0;attempt<2;attempt++){
      if(!await trustedMouse(btn,"hover",isStillActive)) return {used:t,success:false};
      await sleep(1100);
      const rBtn=findReactionBtn(t);
      if(!rBtn) continue;
      if(!await trustedMouse(rBtn,"click",isStillActive)) continue;
      await sleep(1000);
      const labels=REACTION_LABELS[t]||[];
      const state=(btn.getAttribute("aria-label")||"").toLowerCase();
      const changed=!btn.isConnected || labels.some(x=>state.includes(x.toLowerCase()));
      if(changed) return {used:t,success:true};
    }
    return {used:t,success:false};
  }

  function isInCommentLike(btn){
    if(btn.closest('ul')) return true;
    if(btn.closest('div[aria-label*="Bình luận"]') && !btn.closest('div[role="article"]')?.querySelector('div[role="button"][aria-label*="Like"]')?.contains(btn)) {
      // neu nam trong vung binh luan va khong phai action bar chinh
    }
    // cach chac chan: neu btn nam trong 1 comment item (co avatar nho + "Trả lời")
    let cur = btn.parentElement;
    for(let i=0;i<6 && cur; i++){
      if(cur.innerText && cur.innerText.includes("Trả lời") && cur.innerText.includes("Thích")) {
        // neu container chua ca Thich + Tra loi thi la comment like
        if(cur.querySelector('span') && cur.innerText.length < 200) return true;
      }
      cur = cur.parentElement;
    }
    return false;
  }

  function buttonLabel(btn){
    return ((btn.getAttribute("aria-label")||btn.innerText||btn.textContent||"").trim().toLowerCase());
  }

  function isMainCommentActionLabel(value){
    const label=typeof value==="string" ? value.trim().toLowerCase() : buttonLabel(value);
    if(!label) return false;
    // Facebook dùng aria-label dạng "Bình luận dưới tên ..." cho từng
    // comment con. Đây không phải nút comment của bài viết gốc.
    if(/^(?:bình luận|comment)\s+(?:dưới|vào|của|by|on|to)\b/i.test(label)) return false;
    if(/^(?:bình luận|viết bình luận|comment|write a comment)(?:\s+.*)?$/i.test(label)) return true;
    if(/^(?:viết|đăng)\s+bình luận/i.test(label)) return true;
    return label==="bình luận" || label==="comment";
  }

  function isLabel(btn, labels){
    const label=buttonLabel(btn);
    return labels.some(x=>label===x || label.startsWith(x+" "));
  }

  function findMainActionBar(likeBtn){
    if(!likeBtn) return null;
    let node=likeBtn.parentElement;
    for(let depth=0; depth<6 && node; depth++, node=node.parentElement){
      const buttons=[...node.querySelectorAll('[role="button"]')];
      const hasComment=buttons.some(b=>{ const l=buttonLabel(b); return l.includes("bình luận")||l.includes("comment"); });
      const hasLikeOrShare=buttons.some(b=>{ const l=buttonLabel(b); return l.includes("thích")||l.includes("like")||l.includes("chia sẻ")||l.includes("share"); });
      if(hasComment && hasLikeOrShare) return node;
    }
    return likeBtn.parentElement?.parentElement || null;
  }

  function findFeedPostContainer(btn){
    if(!btn) return null;
    const semantic=btn.closest('[data-pagelet^="FeedUnit_"], div[role="article"], div[aria-describedby]');
    if(semantic) return semantic;

    // Facebook hiện tại có nhiều bài không còn data-pagelet/role="article".
    // Ba parent cố định trước đây thường chỉ là thanh Like/Comment (text rất
    // ngắn), làm extension tưởng bài không có nội dung rồi tải bài khác.
    let best=null;
    let node=btn.parentElement;
    for(let depth=0;depth<22&&node;depth++,node=node.parentElement){
      const text=(node.innerText||"").trim();
      const hasPermalink=!!findPostPermalink(node);
      const buttons=[...node.querySelectorAll('[role="button"]')];
      const hasLike=buttons.some(b=>isLabel(b,["thích","thich","like"]));
      const hasComment=buttons.some(b=>isMainCommentActionLabel(buttonLabel(b)));
      if(hasPermalink&&hasLike&&hasComment&&text.length>=15) return node;
      if(hasLike&&hasComment&&text.length>=60&&!best) best=node;
    }
    return best||btn.parentElement?.parentElement?.parentElement||btn.parentElement;
  }
  function findGroupCommentPostContainer(btn){
    if(!btn)return null;
    const semantic=btn.closest('[data-pagelet^="FeedUnit_"], div[role="article"], div[aria-describedby]');
    if(semantic)return semantic;
    let best=null,node=btn.parentElement;
    for(let depth=0;depth<24&&node;depth++,node=node.parentElement){
      const text=String(node.innerText||"").trim();
      const hasPermalink=!!findPostPermalink(node);
      const labels=[...node.querySelectorAll('[role="button"]')].map(buttonLabel);
      const hasReaction=labels.some(label=>/(?:thích|like|tym|love|haha|wow|buồn|sad|phẫn nộ|angry|gỡ|thay đổi cảm xúc|change reaction)/i.test(label));
      const hasComment=labels.some(isMainCommentActionLabel);
      if(hasPermalink&&hasReaction&&hasComment&&text.length>=15)return node;
      if(hasReaction&&hasComment&&text.length>=60&&!best)best=node;
    }
    return best||btn.parentElement;
  }
  function findGroupCommentPosts(){
    const posts=[],seen=new Set(),seenIds=new Set();
    const candidates=[...document.querySelectorAll('[role="button"], [aria-label*="bình luận" i], [aria-label*="comment" i]')]
      .filter(btn=>isRenderedElement(btn)&&!btn.closest('ul')&&isMainCommentActionLabel(buttonLabel(btn)));
    for(const btn of candidates){
      const post=findGroupCommentPostContainer(btn);
      if(!post||seen.has(post)||isSponsoredPost(post,{ignoreGenericPreview:true})||post.querySelector('a[href*="/reel/"],a[href*="/watch/"]'))continue;
      // Khi lớp chi tiết "Bài viết" đang mở, cùng một bài xuất hiện hai lần
      // (card dưới feed + hộp thoại overlay). Chặn trùng theo identity ngay
      // từ khâu quét để không sinh hai comment khác nhau chồng lên cùng bài.
      let pid="";
      try{pid=postIdentity(post)||"";}catch(_){pid="";}
      if(pid&&seenIds.has(pid))continue;
      post._commentBtn=btn;seen.add(post);if(pid)seenIds.add(pid);posts.push(post);
    }
    return posts;
  }

  function isSponsoredPost(article,options={}){
    if(!article) return false;
    if(article.querySelector('a[href*="/ads/about"], a[href*="facebook.com/ads/about"], a[href*="facebook.com/about/ads"], a[href*="/ads/library"], a[href*="/adpreferences"]')) return true;
    // Facebook also emits data-ad-preview="message" on ordinary posts. The
    // group Comment AI path ignores that legacy hint and keeps only explicit
    // ad markers, so normal visible posts are not silently dropped.
    if(article.querySelector('[data-ad-comet-preview]')) return true;
    if(!options.ignoreGenericPreview&&article.querySelector('[data-ad-preview]')) return true;
    if(article.querySelector('[aria-label="Được tài trợ" i], [aria-label="Sponsored" i], [aria-label="Quảng cáo" i], [aria-label*="nội dung được tài trợ" i]')) return true;
    
    const headerCands = article.querySelectorAll('h2, h3, h4, h5, [role="heading"], span[dir="auto"]');
    for(const h of headerCands){
      const t = (h.innerText || h.textContent || "").trim();
      if(/^(?:được tài trợ|sponsored|quảng cáo|advertisement|ad)$/i.test(t)){
        if(t.length < 25) return true;
      }
    }
    return false;
  }

  function isMessengerChatBox(el){
    if(!el) return false;
    if(el.closest('[role="dialog"][aria-label*="Chat" i], [role="dialog"][aria-label*="Messenger" i], [role="dialog"][aria-label*="Trò chuyện" i], [role="dialog"][aria-label*="Tin nhắn" i], [aria-label*="Nhắn tin" i], [data-pagelet*="ChatTab"], [data-pagelet*="Messenger"], [data-pagelet*="Chat"]')) return true;
    
    const label = ((el.getAttribute("aria-label")||"") + " " + (el.getAttribute("aria-placeholder")||"") + " " + (el.getAttribute("placeholder")||"")).toLowerCase();
    if(/(?:nhập tin nhắn|type a message|viết tin nhắn|tin nhắn|message|chat)/.test(label) && !/(?:bình luận|comment)/.test(label)){
      return true;
    }
    
    let parent = el.parentElement;
    for(let i=0; i<8 && parent; i++){
      const parentLabel = (parent.getAttribute("aria-label")||"").toLowerCase();
      if(/(?:tin nhắn|messenger|chat|hộp thoại trò chuyện)/.test(parentLabel) && !/(?:bình luận|comment)/.test(parentLabel)){
        return true;
      }
      if(parent.querySelector('a[href*="/messages/t/"], a[href*="/messages/read/"]')) return true;
      parent = parent.parentElement;
    }
    return false;
  }

  function findFeedPosts(){
    if(!isMainFacebookFeed())return [];
    const posts=[], seen=new Set(), seenKeys=new Set(), seenContentKeys=new Set();
    const candidates = [...document.querySelectorAll('[role="button"], [aria-label*="bình luận" i], [aria-label*="comment" i]')].filter(b => {
      if(!isRenderedElement(b)) return false;
      const label = buttonLabel(b);
      return isMainCommentActionLabel(label);
    });

    for(const btn of candidates){
      if(btn.closest('ul') || isInCommentLike(btn)) continue;
      const post = findFeedPostContainer(btn);
      if(!post || seen.has(post)) continue;
      
      if(post.querySelector('a[href*="/reel/"],a[href*="/watch/"]')) continue;
      if(isSponsoredPost(post)) continue;
      const postKey=postIdentity(post);
      const contentKey=postContentKey(extractPostText(post));
      if((postKey&&seenKeys.has(postKey))||(contentKey&&seenContentKeys.has(contentKey))) continue;
      post._commentBtn = btn; // Lưu trực tiếp tham chiếu nút Bình luận
      post.dataset.aiFeedCandidate="1";
      seen.add(post);
      if(postKey) seenKeys.add(postKey);
      if(contentKey) seenContentKeys.add(contentKey);
      posts.push(post);
    }
    return posts;
  }

  function findPostPermalink(article){
    const links=[...article.querySelectorAll('a[href]')].map(a=>a.href).filter(h=>/\/posts\/|\/permalink(?:\.php|\/)|\/story\.php|\/photo(?:\.php|\/)|\/videos?\/|\/share\/p\/|[?&](?:story_fbid|fbid)=/i.test(h));
    const score=h=>{
      if(/\/groups\/[^/]+\/(?:posts|permalink)\/[^/?#]+/i.test(h))return 500;
      if(/\/[^/]+\/posts\/[^/?#]+/i.test(h))return 450;
      if(/[?&]story_fbid=/i.test(h))return 400;
      if(/\/permalink\.php/i.test(h))return 350;
      if(/\/share\/p\//i.test(h))return 300;
      if(/[?&]fbid=|\/photo/i.test(h))return 200;
      return 100;
    };
    return links.sort((a,b)=>score(b)-score(a))[0]||"";
  }

  function postIdentity(article){
    if(!article) return "";
    // Giữ khóa ổn định khi Facebook bổ sung permalink sau lần render đầu.
    // Không giữ khóa DOM ngẫu nhiên vì Facebook có thể tái sử dụng node cho
    // một bài khác khi cuộn.
    const existing=String(article.dataset?.postUid||"");
    if(/^fb:(?:group|post|media|id|text):/.test(existing))return existing;
    // DOM của Facebook thường bị thay mới sau khi mở/đăng comment. Mã ngẫu
    // nhiên theo DOM cũ khiến cùng một bài bị coi là bài mới và comment lặp.
    const permalink=findPostPermalink(article);
    if(permalink){
      try{
        const url=new URL(permalink,location.href);
        const groupMatch=url.pathname.match(/^\/groups\/([^/]+)\/(?:posts|permalink)\/([^/?#]+)/i);
        const postMatch=url.pathname.match(/^\/([^/]+)\/posts\/([^/?#]+)/i);
        const storyId=url.searchParams.get("story_fbid");
        const mediaId=url.searchParams.get("fbid");
        let canonical="";
        if(groupMatch)canonical=`fb:group:${groupMatch[1].toLowerCase()}:${groupMatch[2].toLowerCase()}`;
        else if(postMatch)canonical=`fb:post:${postMatch[1].toLowerCase()}:${postMatch[2].toLowerCase()}`;
        else if(storyId)canonical=`fb:post:${String(storyId).toLowerCase()}`;
        else if(mediaId)canonical=`fb:media:${String(mediaId).toLowerCase()}`;
        if(canonical){article.dataset.postUid=canonical;return canonical;}
        const path=url.pathname.replace(/\/+$/,"/").toLowerCase();
        const keep=["story_fbid","fbid","id"].filter(k=>url.searchParams.has(k))
          .map(k=>`${k}=${url.searchParams.get(k)}`).join("&");
        const stable=`fb:${url.origin.toLowerCase()}${path}${keep?`?${keep}`:""}`;
        article.dataset.postUid=stable;
        return stable;
      }catch(_){
        // Nếu href không parse được, tiếp tục thử các định danh trong DOM.
      }
    }

    const dataFt=article.getAttribute("data-ft");
    if(dataFt){
      try{
        const parsed=JSON.parse(dataFt);
        const id=parsed.top_level_post_id||parsed.story_id||parsed.mf_story_key||parsed.content_id;
        if(id){
          const stable=`fb:id:${String(id)}`;
          article.dataset.postUid=stable;
          return stable;
        }
      }catch(_){ }
    }

    const attrId=article.getAttribute("data-story-id")||article.getAttribute("data-post-id")||article.getAttribute("data-id");
    if(attrId){
      const stable=`fb:id:${attrId}`;
      article.dataset.postUid=stable;
      return stable;
    }

    // Fallback ổn định theo nội dung, để vẫn chặn lặp khi Facebook không
    // cung cấp permalink trong DOM. Có thể bỏ qua hai bài trùng nội dung,
    // nhưng an toàn hơn việc đăng lặp cùng một bài.
    const content=extractPostText(article).trim();
    const contentKey=commentCacheKey(content);
    if(content.length>=15){
      const stable=`fb:text:${contentKey}`;
      article.dataset.postUid=stable;
      return stable;
    }

    if(article.dataset.postUid?.startsWith("fb:")) return article.dataset.postUid;
    article.dataset.postUid = "fb:dom:" + Math.random().toString(36).slice(2, 10) + "_" + Date.now();
    return article.dataset.postUid;
  }

  function findFeedPostByIdentity(identity){
    if(!identity) return null;
    const exact=findFeedPosts().find(post=>postIdentity(post)===identity);
    if(exact) return exact;

    // Sau khi Facebook render lại, nút comment có thể chưa xuất hiện ngay.
    // Tìm lại đúng container có cùng permalink nhưng không chọn comment con.
    const roots=[...document.querySelectorAll('[data-pagelet^="FeedUnit_"], div[role="article"], div[aria-describedby]')];
    const matches=[];
    const seen=new Set();
    for(const root of roots){
      if(seen.has(root)) continue;
      seen.add(root);
      if(postIdentity(root)===identity) matches.push(root);
    }
    return matches.find(post=>findCommentButton(post))||matches[0]||null;
  }

  function commentProofExists(root, proof){
    if(!root||!proof) return false;
    const normalize=s=>String(s||"").replace(/[\u200B-\u200D\u2060\uFEFF]/g,"").replace(/\s+/g," ").trim().toLowerCase();
    const expected=normalize(proof).slice(0,60);
    if(!expected) return false;
    const nodes=[...root.querySelectorAll('[role="article"], [aria-label*="bình luận" i], [aria-label*="comment" i]')]
      .filter(node=>node!==root)
      // Nội dung còn nằm trong ô nhập chưa phải là bình luận đã được đăng.
      .filter(node=>!node.matches('[contenteditable="true"],[role="textbox"]')&&!node.closest('[contenteditable="true"],[role="textbox"]'))
      .filter(node=>{
        const label=(node.getAttribute("aria-label")||"").toLowerCase();
        return label.includes("bình luận")||label.includes("comment")||!!node.closest("ul");
      });
    return nodes.some(node=>normalize(node.innerText||node.textContent).includes(expected));
  }
  function hasOwnComment(root){
    if(!root)return false;
    // Khi comment của chính tài khoản đã hiển thị, Facebook đặt nút
    // “Chỉnh sửa hoặc xóa bình luận này” lên comment đó. Đây là tín hiệu
    // ổn định hơn tên tài khoản (có thể bị rút gọn/đổi ngôn ngữ).
    return [...root.querySelectorAll('[aria-label]')].some(el=>/chỉnh sửa hoặc xóa bình luận này|edit or delete this comment/i.test(el.getAttribute('aria-label')||""));
  }
  function existingGroupCommentTexts(article){
    if(!article)return [];
    const normalize=s=>String(s||"").replace(/[\u200B-\u200D\u2060\uFEFF]/g,"").replace(/\s+/g," ").trim().toLowerCase();
    // Cùng cách chọn node với commentProofExists, nhưng trả về nội dung các
    // comment đã có (loại nội dung còn nằm trong ô nhập của chính mình).
    const nodes=[...article.querySelectorAll('[role="article"], [aria-label*="bình luận" i], [aria-label*="comment" i]')]
      .filter(node=>node!==article)
      .filter(node=>!node.matches('[contenteditable="true"],[role="textbox"]')&&!node.closest('[contenteditable="true"],[role="textbox"]'))
      .filter(node=>{
        const label=(node.getAttribute("aria-label")||"").toLowerCase();
        return label.includes("bình luận")||label.includes("comment")||!!node.closest("ul");
      });
    const texts=[];
    for(const node of nodes){
      const text=normalize(node.innerText||node.textContent);
      if(text.length>=20)texts.push(text);
    }
    return [...new Set(texts)].slice(0,60);
  }
  function groupCommentDuplicatesExisting(article, commentText){
    const normalize=s=>String(s||"").replace(/[\u200B-\u200D\u2060\uFEFF]/g,"").replace(/\s+/g," ").trim().toLowerCase();
    const mine=normalize(commentText);
    if(mine.length<25)return false;
    // Câu AI trùng gần nguyên văn comment đã có: hoặc toàn bộ câu AI đã
    // được người khác nói, hoặc câu AI ôm trọn một comment dài của người
    // khác. Cả hai đều là đăng chồng — phải bỏ qua, không được gửi.
    return existingGroupCommentTexts(article).some(existing=>{
      if(existing.includes(mine))return true;
      return existing.length>=30&&mine.includes(existing);
    });
  }

  function isValidFeedLike(btn, expectedBar){
    if(!isRenderedElement(btn)) return false;
    if(btn.dataset.feedInteracted==="1" || btn.getAttribute("aria-pressed")==="true") return false;
    if(!isLabel(btn,["thích","thich","like"])) return false;
    const bar=findMainActionBar(btn);
    return !!bar && (!expectedBar || bar===expectedBar);
  }

  function findFeedLikeButtons(){
    const btns=[];
    const seenBars=new Set();
    const candidates=document.querySelectorAll('[role="button"][aria-label="Thích"], [role="button"][aria-label="Thich"], [role="button"][aria-label="Like"]');
    for(const btn of candidates){
      if(!isValidFeedLike(btn)) continue;
      const bar=findMainActionBar(btn);
      const post=findFeedPostContainer(btn);
      if(!bar || seenBars.has(bar) || post?.dataset.feedInteracted==="1") continue;
      seenBars.add(bar);
      btns.push(btn);
    }
    if(btns.length===0 && document.querySelectorAll('div[role="article"]').length>0){
      console.log(`[Feed] khong tim thay nut bai goc trong ${document.querySelectorAll('div[role="article"]').length} bai, tong nut Like:`, document.querySelectorAll('div[role="button"][aria-label="Thích"], div[role="button"][aria-label="Like"]').length);
    }
    return btns;
  }
  function scanFeedLikes(){
    const btns=findFeedLikeButtons();
    btns.forEach(b=>{ b.style.outline="3px dashed #00c851"; b.scrollIntoView({behavior:"smooth", block:"center"}); });
    // highlight comment like do de phan biet
    document.querySelectorAll('div[role="button"][aria-label="Thích"], div[role="button"][aria-label="Like"]').forEach(b=>{
      if(!btns.includes(b) && isRenderedElement(b) && b.closest('div[role="article"]')){
        if(b.closest('ul') || (b.parentElement && b.parentElement.innerText.includes("Trả lời"))){
          b.style.outline="2px solid red";
        }
      }
    });
    return btns.length;
  }

  // Lay noi dung bai viet de gui AI
  function extractPostText(article){
    function isInComment(n){ return !!n?.closest?.('ul, div[aria-label*="Bình luận"], div[aria-label*="Comment"]'); }
    // Comment con trong overlay chi tiết/feed thường là role="article" lồng
    // nhau mà không có ul hay aria-label "Bình luận" ở tổ tiên. Chỉ dùng cho
    // nhánh fallback (không đụng msgDiv/bgDiv chính xác) để khỏi nuốt comment
    // của người khác thành "nội dung bài" ở post ảnh caption ngắn.
    function isInNestedCommentItem(n){
      if(!n?.closest)return true;
      const inner=n.closest('div[role="article"]');
      if(!inner||inner===article)return false;
      const t=String(inner.innerText||inner.textContent||"");
      if(t.length>600)return false;
      const btns=[...inner.querySelectorAll('[role="button"]')].map(buttonLabel);
      const hasReply=btns.some(l=>l==="trả lời"||l==="reply")||/(?:trả lời|reply)/i.test(t.slice(0,200));
      const hasMainComment=btns.some(isMainCommentActionLabel);
      return hasReply&&!hasMainComment;
    }
    let text="";
    const msgDiv = article.querySelector('div[data-ad-preview="message"], div[data-ad-comet-preview="message"]');
    if(msgDiv && !isInComment(msgDiv) && msgDiv.innerText.trim().length>0) text=msgDiv.innerText.trim();
    if(!text || text.length<20){
      const bgDiv = article.querySelector('div[style*="background-color"], div[style*="background"]');
      if(bgDiv && !isInComment(bgDiv) && bgDiv.innerText.trim().length>10) text=bgDiv.innerText.trim();
    }
    if(!text || text.length<20){
      const cands = article.querySelectorAll('div[dir="auto"]');
      let longest="";
      cands.forEach(c=>{ if(isInComment(c)||isInNestedCommentItem(c)) return; const t=(c.innerText||"").trim(); if(t.length>longest.length) longest=t; });
      if(longest) text=longest;
    }
    if(!text) text = article.innerText ? article.innerText.slice(0,800).trim() : "";
    // bo header
    text = text.replace(/^.*·\s*\d+\s*năm\s*/s,"").trim();
    text = text.replace(/^Tháng\s*\d+.*?\d{4}\s*·?\s*/s,"").trim();
    return text.slice(0, 2000); // gioi han gui AI
  }

  function groupCommentSourceText(article){
    const primary=String(extractPostText(article)||"").trim();
    if(primary)return primary;
    // Bài chỉ có ảnh đôi khi không có message div. Lấy mô tả ảnh công khai
    // nếu Facebook đã render alt text, để AI vẫn có dữ liệu thay vì bỏ qua.
    const alts=[...article.querySelectorAll("img[alt]")]
      .map(img=>String(img.getAttribute("alt")||"").trim())
      .filter(text=>text.length>=2&&!/^(?:profile picture|ảnh đại diện|thích|like|avatar)$/i.test(text));
    if(alts.length)return alts.join(" ").slice(0,2000);
    // Không có text/alt vẫn là bài có thể bình luận. Gửi một nguồn tối thiểu
    // để AI biết đây là bài hình ảnh đang hiển thị, thay vì loại bài vì ngắn.
    return "Bài viết hình ảnh đang hiển thị trong nhóm; hãy phản hồi tự nhiên và hỏi thêm một chi tiết phù hợp với bài.";
  }

  function isReplyCommentBox(el){
    if(!el?.getAttribute)return false;
    // Chỉ loại ô trả lời comment con khi Facebook nêu rõ đích trả lời. Trên
    // giao diện tiếng Việt hiện tại, ô comment chính cũng có nhãn
    // "Trả lời dưới tên X", còn ô reply con có nhãn "Trả lời với vai trò X".
    // Regex cũ chỉ tìm chữ "trả lời" nên đã loại nhầm composer chính trong
    // trang permalink, làm Comment AI báo không thấy ô nhập.
    // Chỉ loại ở khâu CHỌN ô để gõ; khâu dọn draft vẫn quét cả ô reply để
    // không sót bản nháp do phiên cũ để lại.
    const label=((el.getAttribute("aria-label")||"")+" "+(el.getAttribute("aria-placeholder")||"")+" "+(el.getAttribute("placeholder")||"")).toLowerCase();
    return /(?:trả lời\s+(?:với\s+vai\s+trò|cho|lại)|reply(?:ing)?\s+(?:as|to)|respond(?:ing)?\s+to)/.test(label);
  }
  function findCommentBox(article){
    if(!article) return null;
    const boxes=[...article.querySelectorAll('div[contenteditable="true"], [role="textbox"]')].filter(el => {
      if(!isRenderedElement(el)) return false;
      if(isMessengerChatBox(el)) return false; // Không lấy ô chat Messenger
      if(isReplyCommentBox(el)) return false; // Không gõ vào ô Trả lời comment con
      const isEditable = el.isContentEditable || el.getAttribute("contenteditable")==="true" || el.getAttribute("role")==="textbox";
      if(!isEditable) return false;
      const label = ((el.getAttribute("aria-label")||"") + " " + (el.getAttribute("aria-placeholder")||"") + " " + (el.getAttribute("placeholder")||"")).toLowerCase();
      if(/(?:nhập tin nhắn|message|chat)/.test(label) && !/(?:bình luận|comment)/.test(label)) return false;
      return true;
    });
    return boxes[0] || null;
  }
  function exactCommentScopeForBox(box, identity, signature){
    if(!box || isMessengerChatBox(box)) return null;
    let node=box.parentElement, fallback=null;
    for(let depth=0;depth<18&&node;depth++,node=node.parentElement){
      if(node.getAttribute("role")==="dialog") fallback=node;
      const r=node.getBoundingClientRect(), style=getComputedStyle(node);
      if(style.position==="fixed"&&r.width>280&&r.height>220){fallback=node;break;}
    }
    if(!fallback) return null;
    if(identity&&postIdentity(fallback)===identity) return fallback;
    const wanted=String(signature||"").replace(/\s+/g," ").trim().toLowerCase().slice(0,60);
    const actual=String(fallback.innerText||fallback.textContent||"").replace(/\s+/g," ").trim().toLowerCase();
    return wanted&&actual.includes(wanted)?fallback:null;
  }
  function findExactCommentBox(article, identity, signature){
    const inline=findCommentBox(article);
    if(inline) return {box:inline,scope:article};
    // Một số layout Facebook mở khung "Bài viết" ngay trên Bảng tin thay vì
    // tạo contenteditable trong card gốc. Chỉ nhận ô trong lớp phủ khớp đúng
    // permalink hoặc phần đầu nội dung của bài hiện tại.
    const boxes=[...document.querySelectorAll('div[contenteditable="true"], [role="textbox"]')].filter(el=>{
      if(!isRenderedElement(el)||isMessengerChatBox(el)||isReplyCommentBox(el))return false;
      const label=((el.getAttribute("aria-label")||"")+" "+(el.getAttribute("aria-placeholder")||"")+" "+(el.getAttribute("placeholder")||"")).toLowerCase();
      return !/(?:nhập tin nhắn|message|chat)/.test(label)||/(?:bình luận|comment)/.test(label);
    });
    for(const box of boxes){
      const scope=exactCommentScopeForBox(box,identity,signature);
      if(scope)return {box,scope};
    }
    return null;
  }
  function visibleCommentBoxes(){
    return [...document.querySelectorAll('div[contenteditable="true"], [role="textbox"]')].filter(el=>{
      if(!isRenderedElement(el)||isMessengerChatBox(el))return false;
      const label=((el.getAttribute("aria-label")||"")+" "+(el.getAttribute("aria-placeholder")||"")+" "+(el.getAttribute("placeholder")||"")).toLowerCase();
      return !/(?:nhập tin nhắn|type a message|viết tin nhắn|tin nhắn|message|chat)/.test(label)||/(?:bình luận|comment)/.test(label);
    });
  }
  function rememberAIActivation(box,scope){
    aiActivationActive=true;
    if(box)aiActivationBox=box;
    if(scope)aiActivationScope=scope;
  }
  function clearAIActivationMemory(){
    aiActivationActive=false;
    aiActivationBox=null;
    aiActivationScope=null;
  }
  function findAIActivationDialog(){
    return [...document.querySelectorAll('[role="dialog"]')].reverse().find(dialog=>{
      if(!isRenderedElement(dialog))return false;
      const text=String(dialog.innerText||dialog.textContent||"");
      return /bài viết|post|bình luận|comment/i.test(text);
    })||null;
  }
  async function cleanupAIActivation(reason=""){
    if(!aiActivationActive)return true;
    let box=aiActivationBox?.isConnected?aiActivationBox:null;
    let scope=aiActivationScope?.isConnected?aiActivationScope:null;
    if(!box){
      const opened=visibleCommentBoxes().find(candidate=>candidate.closest('[role="dialog"]'))||null;
      if(opened){
        box=opened;
        scope=scope||opened.closest('[role="dialog"]');
      }
    }
    scope=scope||findAIActivationDialog();
    if(box&&commentDraftText(box)){
      const cleared=await clearAICommentDraft(box);
      if(!cleared){
        console.warn(`[AI] Không thể xóa bản nháp trước khi ${reason||"điều hướng"}`);
        chrome.storage.local.set({aiStatus:t("ai2.draftBlocked",{from:aiCount,to:aiTarget})});
        return false;
      }
    }
    if(scope?.isConnected)await closeExactCommentOverlay(scope);
    clearAIActivationMemory();
    return true;
  }
  async function prepareAIPageTransition(reason=""){
    const activationCleaned=await cleanupAIActivation(reason);
    const composerCleaned=activationCleaned&&await cleanupAICommentComposer(undefined,undefined,reason);
    // A detached/empty editor is not proof that Facebook released its draft.
    // Never discard an unowned draft or navigate through a leave warning.
    if(!composerCleaned||aiLeaveWarningVisible()||visibleCommentBoxes().some(box=>commentDraftText(box))){
      isAICommenting=false;
      await chrome.storage.local.set({isAICommenting:false,pendingAIComment:false,aiStatus:t("ai2.transitionBlocked",{from:aiCount,to:aiTarget})});
      return false;
    }
    return true;
  }
  function aiLeaveWarningVisible(){
    return [...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].some(el=>
      isRenderedElement(el)&&/chưa hoàn tất bình luận|chưa hoàn thành bình luận|haven.t finished your comment|unfinished comment|leave (?:this )?page/i.test(el.innerText||el.textContent||""));
  }
  let aiFeedNavigationDispatched=false;
  async function navigateAIToMainFeed(){
    if(aiFeedNavigationDispatched)return true;
    if(!await prepareAIPageTransition("quay lại Bảng tin"))return false;
    const state=await chrome.storage.local.get(["isAICommenting","aiActiveConfig","pendingAIConfig"]);
    if(state.isAICommenting===false)return false;
    const ownerTabId=(await chrome.runtime.sendMessage({action:"getSenderTabId"}))?.tabId;
    const owner=state.aiActiveConfig?.ownerTabId||state.pendingAIConfig?.ownerTabId;
    if(owner&&owner!==ownerTabId)return false;
    await chrome.storage.local.set({pendingAIComment:true,pendingAIConfig:{target:aiTarget,minDelay:aiMinDelay/1000,maxDelay:aiMaxDelay/1000,economyMode:aiEconomyMode,batchSize:aiBatchSize,cacheDays:aiCacheDays,ownerTabId}});
    if((await chrome.storage.local.get("isAICommenting")).isAICommenting===false)return false;
    aiFeedNavigationDispatched=true;
    location.assign("https://www.facebook.com/");
    return true;
  }
  function findCommentBoxOpenedByClick(previousBoxes){
    const opened=visibleCommentBoxes().filter(box=>!previousBoxes.has(box)&&!isReplyCommentBox(box));
    const box=opened.find(b=>b.closest('[role="dialog"]'))||opened[0]||null;
    if(!box)return null;
    const scope=box.closest('[role="dialog"]')||findFeedPostContainer(box)||box.parentElement;
    return {box,scope};
  }
  function findGroupPostDetailComposer(identity,signature){
    // Khi Facebook chuyển một bài nhóm sang permalink, nó vẫn giữ card cũ
    // phía sau lớp phủ. Hai card đều có thể có composer, nhưng chỉ composer
    // nằm trong lớp phủ mới là nơi người dùng đang nhìn thấy và là đích của
    // route permalink. Không cho phép fallback sang card nền trong trường
    // hợp này, nếu không chữ sẽ bị gõ "ở bên dưới" còn ô trong bài nổi trống.
    if(!identity||!isFacebookPostDetailPage()||!groupCommentRouteMatchesIdentity(identity))return null;
    const dialogs=[...document.querySelectorAll('[role="dialog"]')].filter(isRenderedElement).reverse();
    for(const dialog of dialogs){
      const boxes=[...dialog.querySelectorAll('div[contenteditable="true"], [role="textbox"]')].filter(box=>{
        if(!isRenderedElement(box)||isMessengerChatBox(box)||isReplyCommentBox(box))return false;
        const label=((box.getAttribute("aria-label")||"")+" "+(box.getAttribute("aria-placeholder")||"")+" "+(box.getAttribute("placeholder")||"")).toLowerCase();
        return !/(?:nhập tin nhắn|type a message|viết tin nhắn|tin nhắn|message|chat)/.test(label)||/(?:bình luận|comment)/.test(label);
      });
      if(!boxes.length)continue;
      // Một dialog xác nhận/nháp không phải bài viết không được dùng làm
      // fallback; dialog post phải chứa ngữ cảnh post/comment hoặc khớp
      // identity/signature đã chọn trước đó.
      const text=String(dialog.innerText||dialog.textContent||"");
      const matched=postIdentity(dialog)===identity||exactCommentScopeForBox(boxes[0],identity,signature)===dialog;
      if(matched||/(?:bài viết|post|bình luận|comment)/i.test(text))return {box:boxes[0],scope:dialog};
    }
    return null;
  }
  function findGroupCommentBoxOpenedByClick(previousBoxes,identity,signature){
    const detail=findGroupPostDetailComposer(identity,signature);
    if(detail&&!previousBoxes.has(detail.box))return detail;
    const opened=visibleCommentBoxes().filter(box=>!previousBoxes.has(box)&&!isReplyCommentBox(box));
    if(!opened.length)return null;
    const candidates=opened.map(box=>{
      const label=((box.getAttribute("aria-label")||"")+" "+(box.getAttribute("aria-placeholder")||"")+" "+(box.getAttribute("placeholder")||"")).toLowerCase();
      const exactScope=exactCommentScopeForBox(box,identity,signature);
      const postScope=findFeedPostContainer(box);
      const postMatches=!!(postScope&&identity&&postIdentity(postScope)===identity);
      // Route permalink chỉ là bằng chứng khi composer thuộc dialog chi tiết.
      // Không cộng điểm cho mọi ô ở card nền, vì Facebook giữ chúng sống phía
      // sau lớp phủ và chúng có thể trùng permalink do SPA render.
      const detailMatches=!!(box.closest('[role="dialog"]')&&identity&&groupCommentRouteMatchesIdentity(identity)&&isFacebookPostDetailPage());
      const mainLabel=/(?:bình luận|comment)/.test(label)&&!/(?:trả lời|reply)/.test(label);
      const score=(exactScope?100:0)+(postMatches?90:0)+(mainLabel?40:0)+(box.closest('[role="dialog"]')?20:0)+(detailMatches?10:0);
      return {box,scope:exactScope||postScope||box.closest('[role="dialog"]')||box.parentElement,score,exactScope,postMatches,detailMatches};
    }).sort((a,b)=>b.score-a.score);
    const best=candidates[0];
    // Không lấy một composer mới của bài khác. Khi Facebook vừa mở trang
    // permalink, route + composer chính là bằng chứng đủ để nhận đúng bài;
    // trên feed thì phải khớp container/permalink của bài vừa bấm.
    if(!best||(!best.exactScope&&!best.postMatches&&!best.detailMatches))return null;
    return {box:best.box,scope:best.scope};
  }
  async function closeExactCommentOverlay(scope){
    if(!scope||scope===document.body||scope===document.documentElement)return;
    const close=[...scope.querySelectorAll('[role="button"],button')].filter(btn=>{
      if(!isRenderedElement(btn))return false;
      const label=buttonLabel(btn);
      return /^(đóng|close|thoát|quay lại|back)(?:\s|$)/i.test(label);
    });
    if(close[0]){try{await trustedMouse(close[0],"click");}catch(_){}}
  }
  function commentDraftText(box){
    if(!box)return "";
    return String(box.innerText??box.textContent??box.value??"")
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g,"").trim();
  }
  function normalizeCommentComposerText(value){
    return String(value||"")
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g,"")
      .replace(/\u00A0/g," ")
      .replace(/\s+/g," ")
      .trim();
  }
  function commentComposerText(box){
    return normalizeCommentComposerText(box?.innerText??box?.textContent??box?.value??"");
  }
  async function waitForExactCommentDraft(box,expected,resolveReplacement,stillActive,timeout=5000){
    const wanted=normalizeCommentComposerText(expected);
    if(!wanted)return null;
    const deadline=Date.now()+timeout;
    let current=box;
    while(Date.now()<deadline){
      if(stillActive&&!await stillActive())return null;
      if(current?.isConnected&&normalizeCommentComposerText(commentComposerText(current))===wanted)return current;
      // Facebook can keep the old editor connected while mounting a new
      // editor for the same post. Inspect the resolver on every poll and
      // prefer a replacement that already contains the complete text.
      if(typeof resolveReplacement==="function"){
        const replacement=resolveReplacement(current)||null;
        if(replacement?.isConnected&&normalizeCommentComposerText(commentComposerText(replacement))===wanted)return replacement;
        if(replacement?.isConnected&&replacement!==current&&(!current?.isConnected||!commentComposerText(current)))current=replacement;
      }
      await sleep(150);
    }
    return null;
  }
  async function fillAndVerifyCommentBox(box,commentText,resolveReplacement,stillActive,typingGuard={}){
    if(!box?.isConnected||isMessengerChatBox(box))return {ok:false,reason:"box-timeout",box};
    // Không ghi đè bản nháp có sẵn của người dùng. Chỉ khi ô rỗng tại thời
    // điểm bắt đầu, tiện ích mới sở hữu ô đó và được phép dọn nếu nhập hụt.
    if(commentComposerText(box))return {ok:false,reason:"draft",box};
    // Facebook thường mount lại editor ngay sau khi mở khung bình luận.
    // Chờ editor ổn định và ưu tiên replacement cùng bài trước khi gõ để
    // không làm mất các code-point đầu câu khi React đổi node đang focus.
    await sleep(850);
    const readyReplacement=typeof resolveReplacement==="function"?resolveReplacement(box):null;
    if(readyReplacement?.isConnected&&readyReplacement!==box&&!commentComposerText(readyReplacement))box=readyReplacement;
    if(!box?.isConnected||isMessengerChatBox(box))return {ok:false,reason:"box-timeout",box};
    if(commentComposerText(box))return {ok:false,reason:"draft",box};
    try{box.focus();box.click();}catch(_){ }
    if(document.activeElement!==box&&!box.contains(document.activeElement))return {ok:false,reason:"box-timeout",box};
    let typed=await chrome.runtime.sendMessage({
      action:"trustedInput",
      text:commentText,
      pressEnter:false,
      // Gõ chậm, có nhịp ngẫu nhiên và dừng nhẹ sau dấu câu để giống người
      // thật hơn; vẫn xác nhận đủ nội dung trước khi cho phép gửi.
      typingMinDelay:45,
      typingMaxDelay:105,
      typingChunkSize:2,
      humanLike:true,
      abortStorageKey:typingGuard.storageKey||"",
      abortRunId:typingGuard.runId||"",
      abortRunIdKey:typingGuard.runIdKey||""
    }).catch(()=>null);
    if(typed?.code==="ABORT_TYPING"){
      if(box?.isConnected)await clearAICommentDraft(box);
      return {ok:false,reason:"stopped",box};
    }
    if(!typed?.ok){
      try{box.focus();document.execCommand("insertText",false,commentText);}catch{ }
    }
    const exact=await waitForExactCommentDraft(box,commentText,resolveReplacement,stillActive);
    if(exact)return {ok:true,box:exact};
    // Không bao giờ bấm Gửi khi editor chỉ nhận một phần (ví dụ "Chuẩ")
    // hoặc Facebook vừa thay DOM giữa lúc nhập. Ô này ban đầu rỗng nên việc
    // dọn phần nhập hụt không chạm vào bản nháp của người dùng.
    // Facebook có thể thay hẳn composer trong lúc gõ. Khi đó box cũ vẫn còn
    // connected hoặc đã rời DOM, còn phần nhập hụt nằm ở một node mới; luôn
    // thử dọn cả replacement trước khi cho phép luồng đổi bài/đổi nhóm để
    // tránh hộp thoại "Rời khỏi trang?" và bản nháp bị bỏ lại.
    const replacement=typeof resolveReplacement==="function"?resolveReplacement():null;
    const cleanupCandidates=[];
    for(const candidate of [replacement,box]){
      if(candidate?.isConnected&&!cleanupCandidates.includes(candidate))cleanupCandidates.push(candidate);
    }
    for(const candidate of cleanupCandidates)await clearAICommentDraft(candidate);
    return {ok:false,reason:"typeincomplete",box};
  }
  function isAICommentComposer(box){
    if(!box?.isConnected||isMessengerChatBox(box))return false;
    const editable=box.isContentEditable||box.getAttribute("contenteditable")==="true"||box.getAttribute("role")==="textbox";
    if(!editable||box.getClientRects().length===0)return false;
    const label=((box.getAttribute("aria-label")||"")+" "+(box.getAttribute("aria-placeholder")||"")+" "+(box.getAttribute("placeholder")||"")).toLowerCase();
    return !/(?:nhập tin nhắn|type a message|viết tin nhắn|tin nhắn|message|chat)/.test(label)||/(?:bình luận|comment)/.test(label);
  }
  function findLiveAICommentDraftBox(scope,preferred){
    const preferredLive=isAICommentComposer(preferred);
    if(preferredLive&&commentDraftText(preferred))return preferred;
    const roots=[];
    for(const root of [scope,aiCommentDraftScope]){
      if(root?.isConnected&&!roots.includes(root))roots.push(root);
    }
    for(const root of roots){
      const candidate=[...root.querySelectorAll('div[contenteditable="true"],[role="textbox"]')]
        .find(box=>isAICommentComposer(box)&&commentDraftText(box));
      if(candidate)return candidate;
    }
    // Facebook đôi khi thay hẳn composer sau khi gửi/xác minh nhưng giữ
    // đúng bài trong một node mới. Tìm lại theo identity của bài, không lấy
    // draft không liên quan của người dùng ở bài khác.
    if(aiCommentDraftIdentity){
      const candidate=visibleCommentBoxes().find(box=>{
        if(!isAICommentComposer(box)||!commentDraftText(box))return false;
        const matched=exactCommentScopeForBox(box,aiCommentDraftIdentity,aiCommentDraftSignature);
        return !!matched;
      });
      if(candidate)return candidate;
    }
    return preferredLive?preferred:null;
  }
  async function clearAICommentDraft(box){
    if(!box?.isConnected||isMessengerChatBox(box))return true;
    if(!commentDraftText(box))return true;
    try{box.focus();box.click();}catch(_){ }
    // Facebook đôi khi nhận focus DOM nhưng không cập nhật composer nội bộ;
    // click tin cậy trước khi gửi phím giúp đồng bộ đúng editor trong modal.
    try{await trustedMouse(box,"click");}catch(_){ }
    // Facebook giữ draft ở contenteditable; Ctrl+A + Backspace qua CDP làm
    // thay đổi giống thao tác người dùng và cập nhật state nội bộ của Facebook.
    const selectModifier=/Mac|iPhone|iPad/i.test(navigator.platform||"")?4:2;
    try{await chrome.runtime.sendMessage({action:"trustedKey",key:"a",code:"KeyA",windowsVirtualKeyCode:65,modifiers:selectModifier});}catch(_){ }
    try{await chrome.runtime.sendMessage({action:"trustedKey",key:"Backspace",code:"Backspace",windowsVirtualKeyCode:8});}catch(_){ }
    await sleep(250);
    if(commentDraftText(box)){
      // Fallback cho layout Facebook không nhận Ctrl+A từ debugger.
      try{
        const selection=window.getSelection(),range=document.createRange();
        range.selectNodeContents(box);selection.removeAllRanges();selection.addRange(range);
        try{document.execCommand("selectAll",false,null);}catch(_){ }
        document.execCommand("delete",false,null);
        box.dispatchEvent(new InputEvent("beforeinput",{bubbles:true,inputType:"deleteContentBackward",data:null}));
        box.dispatchEvent(new InputEvent("input",{bubbles:true,inputType:"deleteContentBackward",data:null}));
      }catch(_){ }
      await sleep(250);
    }
    if(commentDraftText(box)){
      // Last resort chỉ áp dụng cho composer đã được Comment AI sở hữu. Việc
      // phát sự kiện đầy đủ giúp React/Facebook ghi nhận trạng thái rỗng.
      try{
        box.textContent="";
        box.innerHTML="";
        try{document.execCommand("insertText",false,"");}catch(_){ }
        box.dispatchEvent(new InputEvent("beforeinput",{bubbles:true,inputType:"deleteContentBackward",data:null}));
        box.dispatchEvent(new InputEvent("input",{bubbles:true,inputType:"deleteContentBackward",data:null}));
        box.dispatchEvent(new Event("change",{bubbles:true}));
      }catch(_){ }
      await sleep(250);
    }
    return !commentDraftText(box);
  }
  async function cleanupAICommentComposer(scope=aiCommentDraftScope,box=aiCommentDraftBox,reason="",closeView=true){
    const draftScope=scope||aiCommentDraftScope;
    // Chỉ dọn composer mà Comment AI đã sở hữu. Trước đây khi đang xử lý
    // một bài đã có comment, helper quét mọi ô nhập trong scope và có thể
    // đụng vào bản nháp do người dùng tự gõ; nếu Facebook không cho xóa ô
    // đó, cả phiên bị báo "Đã dừng xử lý bài hiện tại" dù không phải lỗi AI.
    const ownedDraft=box||aiCommentDraftBox;
    const hasOwnedDraft=!!ownedDraft||!!aiCommentDraftIdentity;
    let draftBox=hasOwnedDraft?findLiveAICommentDraftBox(draftScope,ownedDraft):null;
    if(!draftBox)return true;
    let cleared=await clearAICommentDraft(draftBox);
    // Composer có thể được Facebook thay DOM ngay sau lần xóa đầu tiên;
    // xác minh lại và dọn replacement trước khi cho phép đổi route.
    for(let attempt=0;cleared&&attempt<2;attempt++){
      const replacement=findLiveAICommentDraftBox(draftScope,draftBox);
      if(!replacement||!commentDraftText(replacement))break;
      draftBox=replacement;
      cleared=await clearAICommentDraft(draftBox);
    }
    if(!cleared){
      console.warn(`[AI] Không thể xóa bản nháp trước khi ${reason||"kết thúc thao tác"}`);
      chrome.storage.local.set({aiStatus:t("ai2.draftBlocked",{from:aiCount,to:aiTarget})});
      return false;
    }
    if(draftBox===aiCommentDraftBox||!commentDraftText(aiCommentDraftBox)){
      aiCommentDraftBox=null;aiCommentDraftScope=null;
      aiCommentDraftIdentity="";aiCommentDraftSignature="";
    }
    if(closeView&&draftScope?.isConnected)await closeExactCommentOverlay(draftScope);
    return true;
  }
  function findVisibleCommentBox(root=document){
    const boxes=[...root.querySelectorAll('div[contenteditable="true"], [role="textbox"]')].filter(el=>{
      if(!isRenderedElement(el)) return false;
      if(isMessengerChatBox(el)) return false; // Không lấy ô chat Messenger
      const isEditable = el.isContentEditable || el.getAttribute("contenteditable")==="true" || el.getAttribute("role")==="textbox";
      if(!isEditable) return false;
      const label = ((el.getAttribute("aria-label")||"") + " " + (el.getAttribute("aria-placeholder")||"") + " " + (el.getAttribute("placeholder")||"")).toLowerCase();
      if(/(?:nhập tin nhắn|message|chat)/.test(label) && !/(?:bình luận|comment)/.test(label)) return false;
      return true;
    });
    return boxes.find(b=>b.closest('[role="dialog"]') && !isMessengerChatBox(b))||boxes[0]||null;
  }
  function findCommentSendButton(box){
    if(!box) return null;
    const br=box.getBoundingClientRect();
    let node=box.parentElement;
    for(let depth=0;depth<7&&node;depth++,node=node.parentElement){
      const buttons=[...node.querySelectorAll('[role="button"],button')].filter(b=>{
        if(!isRenderedElement(b)||b.getAttribute("aria-disabled")==="true"||b.disabled) return false;
        const label=buttonLabel(b);
        if(/gửi nội dung|share|clip âm thanh|lượt thích|gif|nhãn dán|sticker|ảnh|camera|emoji|cảm xúc/.test(label)) return false;
        const r=b.getBoundingClientRect();
        const named=/^(đăng bình luận|post comment|gửi bình luận|send comment|gửi|send|bình luận|comment)/.test(label);
        const arrowPosition=r.left>=br.right-90 && r.top<br.bottom+15 && r.bottom>br.top && !!b.querySelector("svg");
        return named||arrowPosition;
      });
      const exact=buttons.find(b=>/^(đăng bình luận|post comment|gửi bình luận|send comment)$/.test(buttonLabel(b)));
      if(exact)return exact;
      if(buttons.length) return buttons[buttons.length-1];
    }
    return null;
  }
  function findCommentButton(article){
    if(!article) return null;

    if(article._commentBtn && isRenderedElement(article._commentBtn)){
      return article._commentBtn;
    }

    const buttons=[...article.querySelectorAll('[role="button"]')].filter(b=>{
      if(!isRenderedElement(b)) return false;
      const label=buttonLabel(b);
      if(!isMainCommentActionLabel(label)) return false;
      if(b.closest('ul')) return false;
      return true;
    });

    if(buttons.length > 0) return buttons[0];

    const candidates=[...article.querySelectorAll('div, span, a')].filter(el => {
      if(!isRenderedElement(el) || el.children.length > 2) return false;
      const text=(el.innerText || el.textContent || "").trim().toLowerCase();
      return /^(?:bình luận|viết bình luận|comment)$/i.test(text);
    });

    return candidates[0] || null;
  }
  function isFacebookPostDetailPage(){
    return location.hostname.endsWith("facebook.com")&&(
      /^\/groups\/[^/]+\/(?:permalink|posts)\/[^/]+/i.test(location.pathname)||
      /^\/[^/]+\/posts\/[^/]+/i.test(location.pathname)||
      /^\/(?:photo|story\.php|permalink\.php)/i.test(location.pathname)
    );
  }

  async function postAIComment(article, commentText, expectedIdentity){
    // Chỉ nhận bài được quét trực tiếp từ Bảng tin. Trang chi tiết chỉ được
    // dùng tiếp nếu chính nút Bình luận của bài này vừa mở nó.
    if(!isMainFacebookFeed())return "skip";
    if(!article?.isConnected){
      // Node bài có thể đã bị Bảng tin thay mới trong lúc chờ AI — tìm lại
      // đúng bài theo định danh, chỉ bỏ khi thật sự không còn.
      const refound=expectedIdentity?findFeedPostByIdentity(expectedIdentity):null;
      if(refound){ article=refound; article.dataset.aiFeedCandidate="1"; }
      else return "skip";
    }
    if(article.dataset.aiFeedCandidate!=="1")return "skip";
    if(isSponsoredPost(article))return "skip";
    let currentArticle=article;
    const targetIdentity=expectedIdentity||postIdentity(currentArticle);
    const normalize=s=>String(s||"").replace(/[\u200B-\u200D\u2060\uFEFF]/g,"").replace(/\s+/g," ").trim().toLowerCase();
    const proof=normalize(commentText).slice(0,60);
    const postSignature=normalize(extractPostText(currentArticle)).slice(0,60);
    let routeRetries=0,targetDetailOpened=false,commentActivationStarted=false;
    let boxWaitStartedAt=0,refindStartedAt=0;
    let activationPreviousBoxes=new Set(),activatedBox=null,activatedScope=null;
    const cleanupUnfinishedActivation=async()=>{
      // Facebook đôi khi mở lớp phủ bài viết nhưng chưa dựng contenteditable.
      // Chỉ đóng lớp phủ vừa xuất hiện sau cú click này; nếu ô đó đã có chữ,
      // coi là draft cần bảo toàn và dừng fail-closed thay vì xóa của người dùng.
      const opened=findCommentBoxOpenedByClick(activationPreviousBoxes)||(()=>{
        const dialog=[...document.querySelectorAll('[role="dialog"]')].find(d=>{
          if(!isRenderedElement(d))return false;
          const text=String(d.innerText||d.textContent||"");
          return /bài viết|post|bình luận|comment/i.test(text);
        });
        if(!dialog)return null;
        const box=visibleCommentBoxes().find(b=>b.closest('[role="dialog"]')===dialog);
        return {box:null,scope:dialog,openedWithoutBox:!box};
      })();
      if(!opened)return true;
      if(opened.box&&commentDraftText(opened.box))return false;
      await closeExactCommentOverlay(opened.scope);
      clearAIActivationMemory();
      return true;
    };
    const finishCommentView=async scope=>{
      // Facebook đôi lúc giữ composer cũ thêm vài nhịp, nhất là khi tab bị
      // background-throttle lúc màn hình tắt. Không kết thúc toàn bộ phiên
      // vì lỗi dọn giao diện tạm thời; giữ đúng bài và thử lại cho tới khi
      // người dùng bấm Dừng. Bộ đếm/lịch sử chỉ được cập nhật sau khi hàm
      // này trả về thành công.
      let cleanupAttempt=0;
      while(isAICommenting){
        const cleaned=await cleanupAICommentComposer(scope,undefined,"xác minh và rời bài");
        if(cleaned)break;
        cleanupAttempt++;
        if(cleanupAttempt>=5){
          await chrome.storage.local.set({aiStatus:t("ai2.draftBlocked",{from:aiCount,to:aiTarget})});
          isAICommenting=false;
          return false;
        }
        await chrome.storage.local.set({aiStatus:t("ai2.draftRetry",{from:aiCount+1,to:aiTarget,attempt:cleanupAttempt})});
        await sleep(Math.min(3000,800+cleanupAttempt*400));
      }
      if(!isAICommenting)return false;
      if(targetDetailOpened){
        await chrome.storage.local.set({aiStatus:t("ai2.verified",{from:aiCount+1,to:aiTarget})});
        return returnToMainFeedViaHistory();
      }
      await closeExactCommentOverlay(scope);
      clearAIActivationMemory();
      return true;
    };

    // Chỉ kết thúc khi người dùng dừng hoặc đã tìm thấy và xác minh được
    // comment trong đúng container của bài hiện tại. Không chuyển sang bài
    // khác trong lúc đang chờ Facebook render.
    while(isAICommenting){
      if(!isMainFacebookFeed()&&!(targetDetailOpened&&isFacebookPostDetailPage())){
        const cleaned=await cleanupAICommentComposer(undefined,undefined,"quay lại Bảng tin");
        if(!cleaned){isAICommenting=false;return "stopped";}
        const returned=await returnToMainFeedViaHistory();
        if(!returned){
          await chrome.storage.local.set({pendingAIComment:true,pendingAIConfig:{target:aiTarget,minDelay:aiMinDelay/1000,maxDelay:aiMaxDelay/1000,economyMode:aiEconomyMode,batchSize:aiBatchSize,cacheDays:aiCacheDays},aiStatus:t("ai2.offFeed")});
          if(!await navigateAIToMainFeed())return "stopped";
          return "navigated";
        }
        currentArticle=null;
        await sleep(1000);
      }

      if(!targetDetailOpened&&(!currentArticle?.isConnected || (targetIdentity && postIdentity(currentArticle)!==targetIdentity))){
        currentArticle=findFeedPostByIdentity(targetIdentity);
        if(!currentArticle){
          if(!refindStartedAt)refindStartedAt=Date.now();
          const refindSeconds=Math.floor((Date.now()-refindStartedAt)/1000);
          if(refindSeconds>=20){
            const reloadState=await chrome.storage.local.get("aiFeedReloadAttempts");
            const reloadAttempts=(parseInt(reloadState.aiFeedReloadAttempts)||0)+1;
            if(reloadAttempts<=10){
              const cleaned=await cleanupUnfinishedActivation();
              if(!cleaned){
                await chrome.storage.local.set({aiStatus:t("ai2.draftBlocked",{from:aiCount,to:aiTarget})});
                return "stopped";
              }
              await chrome.storage.local.set({
                pendingAIComment:true,
                pendingAIConfig:{target:aiTarget,minDelay:aiMinDelay/1000,maxDelay:aiMaxDelay/1000,economyMode:aiEconomyMode,batchSize:aiBatchSize,cacheDays:aiCacheDays},
                aiFeedReloadAttempts:reloadAttempts,
                isAICommenting:true,
                aiStatus:t("ai2.reloading",{n:reloadAttempts,from:aiCount,to:aiTarget})
              });
              if(!await prepareAIPageTransition("tải lại Bảng tin")||(await chrome.storage.local.get("isAICommenting")).isAICommenting===false)return "stopped";
              location.reload();
              return "page-reloading";
            }
            await chrome.storage.local.set({aiStatus:t("ai2.gaveUp",{from:aiCount,to:aiTarget}),aiFeedReloadAttempts:0});
            return "stopped";
          }
          chrome.storage.local.set({aiStatus:t("ai2.refinding",{from:aiCount,to:aiTarget})});
          await sleep(1000);
          continue;
        }
        refindStartedAt=0;
      }

      // Sau khi nút Bình luận đã mở đúng trang chi tiết, tuyệt đối không
      // bấm lại nút đó. Facebook có thể cần khá lâu mới dựng ô contenteditable.
      if(targetDetailOpened&&commentActivationStarted){
        const opened=findCommentBoxOpenedByClick(activationPreviousBoxes);
        const candidate=opened||(()=>{const b=visibleCommentBoxes().find(x=>x.closest('main'))||visibleCommentBoxes()[0];return b?{box:b,scope:findFeedPostContainer(b)||b.closest('main')||b.parentElement}:null;})();
        if(candidate){activatedBox=candidate.box;activatedScope=candidate.scope;currentArticle=candidate.scope;rememberAIActivation(candidate.box,candidate.scope);}
        else{
          await chrome.storage.local.set({aiStatus:t("ai2.waitBoxOpen",{from:aiCount,to:aiTarget})});
          await sleep(1000);
          continue;
        }
      }

      if(isSponsoredPost(currentArticle)){
        console.warn("[AI] Bài viết là quảng cáo / được tài trợ, bỏ qua bài này");
        return "skip";
      }
      if(currentArticle.querySelector('a[href*="/reel/"],a[href*="/watch/"],a[href^="https://l.facebook.com/l.php"],a[href^="http://l.facebook.com/l.php"]')) return "skip";

      try { currentArticle.scrollIntoView({behavior:"instant",block:"center"}); } catch {}
      await sleep(400);
      if(!currentArticle.isConnected) continue;

      let commentScope=currentArticle;
      let exactBox=findExactCommentBox(currentArticle,targetIdentity,postSignature);
      let box=exactBox?.box||activatedBox||null;
      if(exactBox)commentScope=exactBox.scope;
      else if(activatedBox&&activatedScope)commentScope=activatedScope;
      if(!box){
        if(commentActivationStarted){
          const opened=findCommentBoxOpenedByClick(activationPreviousBoxes);
          if(opened){box=opened.box;commentScope=opened.scope;activatedBox=box;activatedScope=commentScope;rememberAIActivation(box,commentScope);}
          if(!box){
            const waitedSec=boxWaitStartedAt?Math.max(1,Math.round((Date.now()-boxWaitStartedAt)/1000)):0;
            await chrome.storage.local.set({aiStatus:t("ai2.waitBoxSecs",{secs:waitedSec,from:aiCount,to:aiTarget})});
            // Facebook đôi khi giữ lớp phủ mở nhưng không dựng contenteditable;
            // chờ vô hạn sẽ làm phiên mắc kẹt và khi reload tạo cảnh báo
            // "Bạn chưa hoàn tất bình luận". Sau 60 giây, chỉ dọn lớp phủ do
            // chính Comment AI mở (draft có chữ thì fail-closed), giữ nguyên
            // bộ đếm/guard rồi reload có kiểm soát để dựng lại bài.
            if(waitedSec>=60){
              const cleaned=await cleanupUnfinishedActivation();
              if(!cleaned){
                await chrome.storage.local.set({aiStatus:t("ai2.draftBlocked",{from:aiCount,to:aiTarget})});
                return "stopped";
              }
              const reloadState=await chrome.storage.local.get("aiFeedReloadAttempts");
              const reloadAttempts=(parseInt(reloadState.aiFeedReloadAttempts)||0)+1;
              if(reloadAttempts<=10){
                await chrome.storage.local.set({
                  pendingAIComment:true,
                  pendingAIConfig:{target:aiTarget,minDelay:aiMinDelay/1000,maxDelay:aiMaxDelay/1000,economyMode:aiEconomyMode,batchSize:aiBatchSize,cacheDays:aiCacheDays},
                  aiFeedReloadAttempts:reloadAttempts,
                  isAICommenting:true,
                  aiStatus:t("ai2.reloading",{n:reloadAttempts,from:aiCount,to:aiTarget})
                });
                if(!await prepareAIPageTransition("tải lại Bảng tin")||(await chrome.storage.local.get("isAICommenting")).isAICommenting===false)return "stopped";
                location.reload();
                return "page-reloading";
              }
              await chrome.storage.local.set({aiStatus:t("ai2.gaveUp",{from:aiCount,to:aiTarget}),aiFeedReloadAttempts:0});
              return "stopped";
            }
            await sleep(1000);
            continue;
          }
        }
      }
      if(!box){
        const commentBtn=findCommentButton(currentArticle);
        if(!commentBtn){
          chrome.storage.local.set({aiStatus:t("ai2.waitBtn",{from:aiCount,to:aiTarget})});
          await sleep(1000);
          continue;
        }

        activationPreviousBoxes=new Set(visibleCommentBoxes());
        commentActivationStarted=true;
        rememberAIActivation(null,currentArticle);
        boxWaitStartedAt=Date.now();
        try{commentBtn.click();}catch(_){ }
        await sleep(500);

        // Tuyệt đối không bình luận ở trang chi tiết hoặc trong nhóm. Nếu
        // click làm Facebook điều hướng, quay lại Bảng tin và thử lại bài này.
        if(!isMainFacebookFeed()){
          if(isFacebookPostDetailPage()){
            targetDetailOpened=true;
            await chrome.storage.local.set({aiStatus:t("ai2.detailOpened",{from:aiCount,to:aiTarget})});
          }else{
            routeRetries++;
            console.warn(`[AI] Nút Bình luận điều hướng sai khỏi bài hiện tại (lần ${routeRetries})`);
            chrome.storage.local.set({aiStatus:t("ai2.wrongRoute",{n:routeRetries})});
            const cleaned=await cleanupAICommentComposer(undefined,undefined,"xử lý route sai");
            if(!cleaned){isAICommenting=false;return "stopped";}
            const returned=await returnToMainFeedViaHistory();
            if(!returned){
              await chrome.storage.local.set({pendingAIComment:true,pendingAIConfig:{target:aiTarget,minDelay:aiMinDelay/1000,maxDelay:aiMaxDelay/1000,economyMode:aiEconomyMode,batchSize:aiBatchSize,cacheDays:aiCacheDays},aiStatus:t("ai2.findPost")});
              if(!await navigateAIToMainFeed())return "stopped";
              return "navigated";
            }
            currentArticle=null;
            await sleep(1000);
            continue;
          }
        }

        // Chờ vô hạn có kiểm soát cho chính bài này; không fallback sang
        // findVisibleCommentBox(document) vì có thể lấy nhầm bài khác.
        for(let wait=0; wait<30 && isAICommenting; wait++){
          await sleep(400);
          if(!isMainFacebookFeed()){
            if(targetDetailOpened&&isFacebookPostDetailPage()){
              const opened=findCommentBoxOpenedByClick(activationPreviousBoxes);
              const fallback=opened||(()=>{const b=visibleCommentBoxes().find(x=>x.closest('main'))||visibleCommentBoxes()[0];return b?{box:b,scope:findFeedPostContainer(b)||b.closest('main')||b.parentElement}:null;})();
              if(fallback){box=fallback.box;commentScope=fallback.scope;currentArticle=commentScope;rememberAIActivation(box,commentScope);}
            }else{currentArticle=null;break;}
          }
           if(currentArticle?.isConnected){
             exactBox=findExactCommentBox(currentArticle,targetIdentity,postSignature);
             box=exactBox?.box||null;
             if(exactBox)commentScope=exactBox.scope;
           }
           if(!box){
            const opened=findCommentBoxOpenedByClick(activationPreviousBoxes);
            if(opened){box=opened.box;commentScope=opened.scope;rememberAIActivation(box,commentScope);}
           }
           if(!box){
            const replacement=findFeedPostByIdentity(targetIdentity);
            if(replacement){
              currentArticle=replacement;
              exactBox=findExactCommentBox(currentArticle,targetIdentity,postSignature);
              box=exactBox?.box||null;
              if(exactBox)commentScope=exactBox.scope;
            }
          }
          if(box) break;
          if(wait%5===4) chrome.storage.local.set({aiStatus:t("ai2.waitBoxDots",{secs:Math.ceil((wait+1)*0.4),from:aiCount,to:aiTarget})});
        }
        if(!isAICommenting) return "stopped";
        if(!box){
          const cleaned=await cleanupUnfinishedActivation();
          if(!cleaned){
            await chrome.storage.local.set({aiStatus:t("ai2.draftBlocked",{from:aiCount,to:aiTarget})});
            return "stopped";
          }
          targetDetailOpened=false;
          commentActivationStarted=false;
          boxWaitStartedAt=0;
          activationPreviousBoxes=new Set();
          activatedBox=null;
          activatedScope=null;
          clearAIActivationMemory();
          currentArticle=null;
          chrome.storage.local.set({aiStatus:t("ai2.refinding",{from:aiCount,to:aiTarget})});
          await sleep(700);
          continue;
        }
        activatedBox=box;activatedScope=commentScope;
      }

      routeRetries=0;

      if(isMessengerChatBox(box)){
        console.warn("[AI] Phát hiện nhầm khung chat Messenger, tiếp tục tìm đúng ô comment trong bài");
        await sleep(1000);
        continue;
      }
      if(!targetDetailOpened&&targetIdentity && postIdentity(currentArticle)!==targetIdentity) continue;

      // Nếu comment đã tồn tại trong đúng bài (ví dụ phiên trước đã gửi),
      // coi bài là đã xử lý và không gửi lại.
      if(commentProofExists(commentScope,proof)||commentProofExists(currentArticle,proof)){
        console.log("[AI] Bài đã có comment này, không đăng lặp");
        return (await finishCommentView(commentScope))?"already-commented":"stopped";
      }

      try { box.scrollIntoView({behavior:"instant",block:"center"}); } catch {}
      await sleep(300);
      // Ưu tiên focus trực tiếp. Gọi chuột hệ thống dù ô đã focus có thể
      // trúng một khung Messenger nổi khi Facebook vừa render lại bố cục.
      let boxFocused=false;
      try{box.focus();box.click();boxFocused=document.activeElement===box||box.contains(document.activeElement);}catch(_){ }
      if(!boxFocused&&box.isConnected){
        try{await trustedMouse(box,"click");boxFocused=document.activeElement===box||box.contains(document.activeElement);}catch(_){ }
      }
      await sleep(300);
      if(!boxFocused||isMessengerChatBox(document.activeElement)){
        console.warn("[AI] Đang focus nhầm vào ô Messenger chat, tiếp tục tìm đúng ô comment");
        await sleep(1000);
        continue;
      }

      chrome.storage.local.set({aiStatus:t("ai2.typing",{from:aiCount,to:aiTarget})});
      aiCommentDraftBox=box;aiCommentDraftScope=commentScope;
      aiCommentDraftIdentity=targetIdentity||"";aiCommentDraftSignature=postSignature||"";
      // Chỉ nhập chữ ở bước này. Enter và click nút gửi trước đây cùng được
      // gọi, gây nguy cơ đăng một comment hai lần. Chờ đủ toàn bộ nội dung
      // trong đúng editor trước khi cho phép bấm Gửi.
      const filled=await fillAndVerifyCommentBox(
        box,
        commentText,
        (preferred)=>{
          const exact=findExactCommentBox(currentArticle,targetIdentity,postSignature);
          const exactBox=exact?.box||null;
          if(exactBox&&normalizeCommentComposerText(commentComposerText(exactBox))===normalizeCommentComposerText(commentText))return exactBox;
          const replacement=visibleCommentBoxes().find(candidate=>{
            if(!isAICommentComposer(candidate)||!commentDraftText(candidate))return false;
            return !!exactCommentScopeForBox(candidate,targetIdentity,postSignature);
          });
          return replacement||exactBox||preferred||null;
        },
        ()=>isAICommenting&&((chrome.storage.local.get("isAICommenting").then(state=>state.isAICommenting!==false))),
        {storageKey:"isAICommenting"}
      );
      if(filled.box?.isConnected)box=filled.box;
      if(!filled.ok){
        if(filled.reason==="draft"){
          await chrome.storage.local.set({aiStatus:t("ai2.draftBlocked",{from:aiCount,to:aiTarget})});
          return "stopped";
        }
        if(filled.reason==="stopped"){
          await cleanupAICommentComposer(commentScope,box,"Dừng");
          isAICommenting=false;
          return "stopped";
        }
        await cleanupAICommentComposer(commentScope,box,"thử lại bước nhập",false);
        chrome.storage.local.set({aiStatus:t("ai2.typeFailRetry",{from:aiCount,to:aiTarget})});
        await sleep(1000);
        continue;
      }

      // DỪNG BẰNG MỌI GIÁ: kiểm tra lại ngay trước cú gửi — Dừng trong lúc
      // gõ mà vẫn gửi là lỗi nghiêm trọng.
      const liveBeforeSubmit=await chrome.storage.local.get("isAICommenting");
      if(!isAICommenting||liveBeforeSubmit.isAICommenting===false) {
        await cleanupAICommentComposer(commentScope,box,"Dừng");
        isAICommenting=false;
        return "stopped";
      }
      const sendBtn=findCommentSendButton(box);
      let submitted=false;
      // Khóa bài trước cú gửi. Nếu Facebook/extension mất phản hồi ngay sau
      // thao tác, lần chạy sau vẫn không gửi lại và tạo comment trùng.
      const guardKey=targetIdentity||postIdentity(currentArticle);
      const guardStored=await chrome.storage.local.get("aiCommentSubmissionGuard");
      const submissionGuard=guardStored.aiCommentSubmissionGuard&&typeof guardStored.aiCommentSubmissionGuard==="object"?guardStored.aiCommentSubmissionGuard:{};
      if(guardKey){submissionGuard[guardKey]={time:Date.now(),source:"feed",state:"submitting"};await chrome.storage.local.set({aiCommentSubmissionGuard:submissionGuard});}
      const liveAtSubmit=await chrome.storage.local.get("isAICommenting");
      if(!isAICommenting||liveAtSubmit.isAICommenting===false) {
        await cleanupAICommentComposer(commentScope,box,"Dừng");
        isAICommenting=false;
        return "stopped";
      }
      if(sendBtn&&!isMessengerChatBox(sendBtn)){
        try { submitted=!!(await trustedMouse(sendBtn,"click")); } catch {}
      }else{
        // Chỉ dùng Enter làm fallback khi Facebook không render nút gửi.
        try{
          const enter=await chrome.runtime.sendMessage({action:"trustedInput",text:"",pressEnter:true,typingMinDelay:0,typingMaxDelay:0});
          submitted=!!enter?.ok;
        }catch(_){ }
      }
      if(!submitted){
        await cleanupAICommentComposer(commentScope,box,"thử lại vì chưa có nút gửi",false);
        if(guardKey){delete submissionGuard[guardKey];await chrome.storage.local.set({aiCommentSubmissionGuard:submissionGuard});}
        chrome.storage.local.set({aiStatus:t("ai2.noSendBtn",{from:aiCount,to:aiTarget})});
        await sleep(1000);
        continue;
      }

      chrome.storage.local.set({aiStatus:t("ai2.sentVerifying",{from:aiCount+1,to:aiTarget})});
      // Sau khi gửi, tiếp tục quan sát đúng bài cho đến khi thấy proof.
      // Không coi ô trống là thành công vì ô có thể trống do Facebook reset.
      const verifyDeadline=Date.now()+30000;
      while(isAICommenting){
        await sleep(500);
        if(!isMainFacebookFeed()&&!(targetDetailOpened&&isFacebookPostDetailPage())){
          const cleaned=await cleanupAICommentComposer(undefined,undefined,"xác minh sau khi Facebook lạc route");
          if(!cleaned){isAICommenting=false;return "stopped";}
          const returned=await returnToMainFeedViaHistory();
          if(!returned){
            await chrome.storage.local.set({pendingAIComment:true,pendingAIConfig:{target:aiTarget,minDelay:aiMinDelay/1000,maxDelay:aiMaxDelay/1000,economyMode:aiEconomyMode,batchSize:aiBatchSize,cacheDays:aiCacheDays},aiStatus:t("ai2.sentOffFeed")});
            if(!await navigateAIToMainFeed())return "stopped";
            return "navigated";
          }
        }
        let scope=commentScope;
        if(!scope?.isConnected){
          scope=findFeedPostByIdentity(targetIdentity);
          if(scope) currentArticle=scope;
        }
        if(scope&&commentProofExists(scope,proof)){
          return (await finishCommentView(scope))?true:"stopped";
        }
        if(currentArticle&&commentProofExists(currentArticle,proof)){
          return (await finishCommentView(commentScope))?true:"stopped";
        }
        if(Date.now()>=verifyDeadline){
          await chrome.storage.local.set({aiStatus:t("ai2.unconfirmedLock",{from:aiCount,to:aiTarget})});
          return (await finishCommentView(commentScope))?"unconfirmed-skip":"stopped";
        }
        chrome.storage.local.set({aiStatus:t("ai2.waitProof",{from:aiCount+1,to:aiTarget})});
      }
      await cleanupAICommentComposer(undefined,undefined,"Dừng trong lúc xác minh");
      return "stopped";
    }
    return "stopped";
  }

  async function feedInteractLoop(){
    if(!location.href.includes("facebook.com")){
      chrome.storage.local.set({ pendingFeedInteract: true, pendingFeedConfig: { target: feedTarget, minDelay: feedMinDelay/1000, maxDelay: feedMaxDelay/1000, reaction: feedReaction } });
      location.href = "https://www.facebook.com/";
      return;
    }
    if(!isMainFacebookFeed()){
      chrome.storage.local.set({ pendingFeedInteract: true, pendingFeedConfig: { target: feedTarget, minDelay: feedMinDelay/1000, maxDelay: feedMaxDelay/1000, reaction: feedReaction }, feedStatus:t("p.fdOpening") });
      location.href = "https://www.facebook.com/";
      return;
    }
    chrome.storage.local.remove(["pendingFeedInteract"]);
    isFeedInteracting=true;
    feedCount=0;
    chrome.storage.local.set({ feedStatus:t("fd2.starting"), feedCount:0, isFeedInteracting:true });
    let idle=0;
    let scrollTries=0;
    while(isFeedInteracting && feedCount < feedTarget){
      let btns = findFeedLikeButtons();
      // debug log
      if(btns.length>0) console.log(`[Feed] tim thay ${btns.length} nut Like bai goc`);
      if(btns.length===0){
        idle++;
        // tu dong scroll lien tuc thay vi bao xong ngay
        if(idle>=2){
          window.scrollTo(0, document.body.scrollHeight);
          await sleep(3000);
          scrollTries++;
          btns=findFeedLikeButtons();
          if(btns.length>0){ idle=0; scrollTries=0; }
          else if(idle>=8 || scrollTries>=6){
            if(feedCount===0){
              chrome.storage.local.set({ feedStatus:t("fd2.noButtons",{n:scrollTries}) });
            } else {
              chrome.storage.local.set({ feedStatus:t("fd2.outOfPosts",{done:feedCount,target:feedTarget}) });
            }
            break;
          }
        } else { window.scrollBy(0,900); await sleep(1800); continue; }
      } else { idle=0; scrollTries=0; }
      for(const btn of btns){
        if(!isFeedInteracting || feedCount>=feedTarget) break;
        const actionBar=findMainActionBar(btn);
        const art=findFeedPostContainer(btn);
        btn.scrollIntoView({behavior:"smooth", block:"center"});
        await sleep(600);
          try{
            // Facebook co the tai lai/recycle DOM sau khi cuon. Kiem tra lai de
            // khong bam vao mot nut vua bi doi sang bai khac.
          if(!isValidFeedLike(btn, actionBar)) continue;
          const liveBeforeReact=await chrome.storage.local.get("isFeedInteracting");
          if(!isFeedInteracting||liveBeforeReact.isFeedInteracting===false){isFeedInteracting=false;break;}
          const result = await doReact(btn, feedReaction);
          if(!result.success){
            console.warn(`[Feed] Facebook khong ghi nhan ${result.used}, bo qua bai nay`);
            btn.dataset.feedInteracted="1";
            continue;
          }
          const used=result.used;
          btn.dataset.feedInteracted="1";
          if(art) art.dataset.feedInteracted="1";
          if(art) art.style.outline="2px solid #1877F2";
          else btn.style.outline="2px solid #1877F2";
          feedCount++;
          chrome.storage.local.set({ feedCount, feedStatus:t("fd2.reacted",{reaction:used,done:feedCount,target:feedTarget}) });
        }catch(e){ console.warn(e); }
        if(feedCount>=feedTarget) break;
        await sleep(rand(feedMinDelay, feedMaxDelay));
        if(!isFeedInteracting) break;
      }
      if(feedCount>=feedTarget) break;
      window.scrollTo(0, document.body.scrollHeight);
      await sleep(2000);
    }
    const feedStillActive=await chrome.storage.local.get("isFeedInteracting");
    if(!isFeedInteracting||feedStillActive.isFeedInteracting===false)return;
    isFeedInteracting=false;
    if(feedCount===0){
      chrome.storage.local.set({ isFeedInteracting:false, feedStatus:t("fd2.zeroFound",{target:feedTarget}) });
    } else {
      chrome.storage.local.set({ isFeedInteracting:false, feedStatus:t("fd2.doneAll",{done:feedCount,target:feedTarget}) });
    }
  }

  function isMainFacebookFeed(){return location.hostname.endsWith("facebook.com")&&(location.pathname==="/"||location.pathname==="/home.php");}
  async function returnToMainFeedViaHistory(){
    if(!await prepareAIPageTransition("quay lại Bảng tin"))return false;
    if(isMainFacebookFeed())return true;
    // Only one back action: repeated history.go queued leave prompts and
    // eventually landed on an unrelated old group. Stop during every wait.
    if((await chrome.storage.local.get("isAICommenting")).isAICommenting===false)return false;
    const previousUrl=location.href;
    history.go(-1);
    for(let i=0;i<32;i++){
      await sleep(250);
      if((await chrome.storage.local.get("isAICommenting")).isAICommenting===false||aiLeaveWarningVisible())return false;
      if(isMainFacebookFeed())return true;
      if(location.href!==previousUrl)break;
    }
    return false;
  }
  async function aiCommentLoop(resume=false){
    if(!isMainFacebookFeed()){
      chrome.storage.local.set({ pendingAIComment: true, pendingAIConfig: { target: aiTarget, minDelay: aiMinDelay/1000, maxDelay: aiMaxDelay/1000,economyMode:aiEconomyMode,batchSize:aiBatchSize,cacheDays:aiCacheDays } });
      await navigateAIToMainFeed();
      return;
    }
    chrome.storage.local.remove(["pendingAIComment"]);
    isAICommenting=true;
    if(!resume)aiCount=0;
    let loopOwnerTabId=0;
    try{loopOwnerTabId=(await chrome.runtime.sendMessage({action:"getSenderTabId"}))?.tabId||0;}catch{}
    chrome.storage.local.set({ aiStatus:resume?t("ai2.resumed",{from:aiCount,to:aiTarget}):t("ai2.starting"), aiCount, isAICommenting:true,aiActiveConfig:{target:aiTarget,minDelay:aiMinDelay/1000,maxDelay:aiMaxDelay/1000,economyMode:aiEconomyMode,batchSize:aiBatchSize,cacheDays:aiCacheDays,ownerTabId:loopOwnerTabId} });
    let idle=0;
    let sawPost=false;
    let lastAiFailure="";
    const cacheStored=await chrome.storage.local.get(["aiCommentCache","aiRecentPostKeys","aiRecentPostContentKeys","aiCommentHistory","aiCommentSubmissionGuard"]),commentCache=cacheStored.aiCommentCache||{};
    const commentHistory=cacheStored.aiCommentHistory&&typeof cacheStored.aiCommentHistory==="object"?cacheStored.aiCommentHistory:{};
    const submissionGuard=cacheStored.aiCommentSubmissionGuard&&typeof cacheStored.aiCommentSubmissionGuard==="object"?cacheStored.aiCommentSubmissionGuard:{};
    const persistedCommentedKeys=new Set(Array.isArray(cacheStored.aiRecentPostKeys)?cacheStored.aiRecentPostKeys:[]);
    const seenContentKeys=new Set(Array.isArray(cacheStored.aiRecentPostContentKeys)?cacheStored.aiRecentPostContentKeys:[]);
    Object.values(commentHistory).forEach(entry=>{if(entry?.contentKey)seenContentKeys.add(String(entry.contentKey));});
    for(const key of persistedCommentedKeys)if(!commentHistory[key])commentHistory[key]={time:0,legacy:true};
    const seenPostKeys = new Set([...persistedCommentedKeys,...Object.keys(commentHistory),...Object.keys(submissionGuard)]);
    const cacheMaxAge=Math.max(0,aiCacheDays)*86400000;let apiRequests=0,cacheHits=0;
    for(const [k,v] of Object.entries(commentCache)){if(!v?.time||Date.now()-v.time>cacheMaxAge)delete commentCache[k];}
    while(isAICommenting && aiCount < aiTarget){
      const articles = findFeedPosts();
      if(articles.length) sawPost=true;
      let foundNew=false;
      for(let artIndex=0;artIndex<articles.length;artIndex++){
        const art=articles[artIndex];
        if(!isAICommenting || aiCount>=aiTarget) break;
        if(!isMainFacebookFeed()){await navigateAIToMainFeed();return;}
        if(art.dataset.aiCommented==="1") continue;
        if(art.dataset.aiFeedCandidate!=="1"||isSponsoredPost(art)){
          chrome.storage.local.set({aiStatus:t("ai2.adSkipped",{from:aiCount,to:aiTarget})});
          continue;
        }
        const postKey=postIdentity(art);
        const text = extractPostText(art);
        if(!text || text.trim().length < 15){
          console.warn("[AI] Không lấy được đủ nội dung bài viết để tạo comment, bỏ qua bài này");
          chrome.storage.local.set({aiStatus:t("ai2.unreadable",{from:aiCount,to:aiTarget})});
          continue;
        }
        const contentKey=postContentKey(text);
        if(seenPostKeys.has(postKey)||contentKey&&seenContentKeys.has(contentKey)) continue;
        if(hasOwnComment(art)){
          seenPostKeys.add(postKey);
          if(contentKey)seenContentKeys.add(contentKey);
          console.log("[AI] Bài đã có comment của tài khoản, bỏ qua để chống trùng");
          continue;
        }
        // bo bai da tuong tac qua roi? van comment duoc
        art.scrollIntoView({behavior:"smooth", block:"center"});
        await sleep(800);
        let commentText = "";
        const cacheKey=contentKey||commentCacheKey(text);
        if(cacheMaxAge&&commentCache[cacheKey]?.comment){commentText=commentCache[cacheKey].comment;cacheHits++;}
        else if(aiEconomyMode==="max")commentText=fallbackComment(text);
        else try{
          if(aiEconomyMode==="personal"){
            const res=await chrome.runtime.sendMessage({action:"aiGenerateComment",postText:text.slice(0,500)});apiRequests++;
            if(!res?.ok)throw new Error(res?.error||t("ai2.genFail"));commentText=res.comment;
            if(cacheMaxAge)commentCache[cacheKey]={comment:commentText,time:Date.now()};
          }else{
            // Luôn đưa bài hiện tại vào batch. Trước đây việc đọc lại DOM sau
            // khi cuộn có thể trả về chuỗi rỗng, khiến request được gửi với
            // posts=[] và bị báo nhầm là lỗi API.
            const batch=[text.slice(0,500)];
            const batchKeys=new Set([cacheKey]);
            for(const candidate of articles.slice(artIndex+1)){
              const tx=extractPostText(candidate);
              const candidateKey=tx&&tx.length>=15?postContentKey(tx):"";
              if(tx&&tx.length>=15&&!batchKeys.has(candidateKey)&&!commentCache[candidateKey]){
                batch.push(tx.slice(0,500));
                batchKeys.add(candidateKey);
              }
              if(batch.length>=aiBatchSize)break;
            }
            const res=await chrome.runtime.sendMessage({action:"aiGenerateCommentBatch",posts:batch});apiRequests++;
            if(!res?.ok)throw new Error(res?.error||t("ai2.genBatchFail"));
            batch.forEach((tx,i)=>{if(res.comments?.[i]){const key=postContentKey(tx)||commentCacheKey(tx);commentCache[key]={comment:res.comments[i],time:Date.now()};}});
            commentText=commentCache[cacheKey]?.comment||res.comments?.[0]||"";
          }
          await chrome.storage.local.set({aiCommentCache:commentCache,aiApiRequests:apiRequests,aiCacheHits:cacheHits});
        }catch(e){console.warn("[AI] dung cau mau du phong",e);lastAiFailure=`API lỗi, đang dùng câu mẫu dự phòng: ${e.message}`;commentText=fallbackComment(text);chrome.storage.local.set({aiStatus:lastAiFailure});}
        // Chuan hoa lan cuoi de ca comment cu trong cache cung khong con dau ! o cuoi.
        commentText=sanitizeCommentOutput(String(commentText||"").trim()).replace(/[!！]+\s*$/g,"").trimEnd();
        if(!commentText) continue;
        foundNew=true;
        let liveArt = (art && art.isConnected) ? art : null;
        if(!liveArt && postKey){
          // Bảng tin ảo hóa node trong lúc cuộn/chờ AI — tìm lại đúng bài
          // theo định danh thay vì bỏ qua.
          chrome.storage.local.set({aiStatus:t("ai2.refound",{from:aiCount,to:aiTarget})});
          liveArt = findFeedPostByIdentity(postKey);
          if(liveArt) liveArt.dataset.aiFeedCandidate="1";
        }
        if(!liveArt){ console.warn("[AI] Bài đã rời khỏi DOM và không tìm lại được, bỏ qua bài này"); chrome.storage.local.set({aiStatus:t("ai2.refoundGone",{from:aiCount,to:aiTarget})}); continue; }
        let ok=false,attemptError="";
        try{ ok=await postAIComment(liveArt,commentText,postKey); }
        catch(e){ console.warn("[AI] comment loi",e); attemptError=`Lỗi đăng bình luận: ${e.message}`;lastAiFailure=attemptError; chrome.storage.local.set({aiStatus:lastAiFailure}); }
        if((ok===false||ok==null)&&!attemptError)ok="unconfirmed";
        if(ok==="stale"){
          lastAiFailure=t("ai2.staleKept");
          chrome.storage.local.set({aiStatus:lastAiFailure});
          isAICommenting=false;
          break;
        }
        if(ok==="skip"){console.log("[AI] Bỏ qua bài không đủ điều kiện, không phải lỗi comment");continue;}
        if(ok==="box-timeout"||ok==="unconfirmed"){
          // Không được đánh dấu thành công hoặc chuyển bài khi chưa xác minh
          // comment xuất hiện đúng trong bài hiện tại.
          lastAiFailure=t("ai2.unconfirmedRetry");
          chrome.storage.local.set({aiStatus:lastAiFailure});
          // Nếu một phiên bản Facebook cũ trả về trạng thái này, lùi chỉ số
          // để vòng for thử lại đúng bài; tuyệt đối không nhảy sang bài kế.
          artIndex=Math.max(-1,artIndex-1);
          continue;
        }
        if(ok==="unconfirmed-skip"){
          // Đã bấm gửi nhưng Facebook không trả bằng chứng: giữ khóa bài để
          // lần sau không gửi trùng, đồng thời vẫn cho phép phiên chạy tiếp.
          seenPostKeys.add(postKey);
          if(contentKey){
            seenContentKeys.add(contentKey);
            await chrome.storage.local.set({aiRecentPostContentKeys:[...seenContentKeys].slice(-500)});
          }
          continue;
        }
        if(ok==="stopped"){
          if((await chrome.storage.local.get("isAICommenting")).isAICommenting===false)return;
          lastAiFailure=t("ai2.stoppedPost");
          chrome.storage.local.set({aiStatus:lastAiFailure});
          isAICommenting=false;
          break;
        }
        if(ok==="page-reloading"){
          return;
        }
        if(ok==="navigated"){
          await navigateAIToMainFeed();return;
        }
        if(ok===true||ok==="already-commented"){
          if(liveArt.isConnected){
            liveArt.dataset.aiCommented="1";
            liveArt.style.outline="2px solid #9c27b0";
          }
          aiCount++;
          persistedCommentedKeys.add(postKey);
          seenPostKeys.add(postKey);
          if(contentKey)seenContentKeys.add(contentKey);
          commentHistory[postKey]={time:Date.now(),source:"feed",contentKey:contentKey||""};
          const recentKeys=[...persistedCommentedKeys].slice(-500);
          const recentContentKeys=[...seenContentKeys].slice(-500);
          const handledAsExisting=ok==="already-commented";
          chrome.storage.local.set({ aiCount, aiApiRequests:apiRequests,aiCacheHits:cacheHits,aiRecentPostKeys:recentKeys,aiRecentPostContentKeys:recentContentKeys,aiCommentHistory:commentHistory,aiFeedReloadAttempts:0,aiStatus:handledAsExisting?t("ai2.existing",{from:aiCount,to:aiTarget}):t("ai2.counted",{from:aiCount,to:aiTarget,api:apiRequests,hits:cacheHits}) });
          console.log(handledAsExisting?`[AI] Bài đã có comment, bỏ qua đăng lặp (${aiCount})`:`[AI] Comment ${aiCount}: ${commentText}`);
          if(aiCount<aiTarget){
            const delayMs=rand(aiMinDelay,aiMaxDelay),nextAt=Date.now()+delayMs;
            await chrome.storage.local.set({aiNextAllowedAt:nextAt,aiStatus:t("ai2.waitNext",{from:aiCount,to:aiTarget,secs:Math.ceil(delayMs/1000)})});
            while(isAICommenting&&Date.now()<nextAt){
              const seconds=Math.max(1,Math.ceil((nextAt-Date.now())/1000));
              chrome.storage.local.set({aiStatus:t("ai2.waitNext",{from:aiCount,to:aiTarget,secs:seconds})});
              await sleep(Math.min(1000,nextAt-Date.now()));
            }
            window.scrollBy(0,Math.max(650,innerHeight*.65));
            await sleep(1000);
          }
        }else{
          if(!lastAiFailure) lastAiFailure=t("ai2.unknownOp");
          chrome.storage.local.set({aiStatus:lastAiFailure});
          isAICommenting=false;
          break;
        }
        if(aiCount>=aiTarget) break;
      }
      if(!foundNew){
        idle++;
        // Cho Facebook mot nhip render tai vi tri hien tai truoc khi cuon. Ban cu
        // cuon ngay moi vong nen de vuot qua bai vua tai xong.
        if(idle%2===0){
          chrome.storage.local.set({aiStatus:t("ai2.loadingMore",{from:aiCount,to:aiTarget})});
          window.scrollBy(0,Math.max(520,innerHeight*.62));
          await sleep(idle%6===0?2600:1700);
        }else{
          chrome.storage.local.set({aiStatus:t("ai2.checkingNow",{from:aiCount,to:aiTarget})});
          await sleep(1200);
        }
        if(idle>=16){
          const reloadState=await chrome.storage.local.get("aiFeedReloadAttempts");
          const reloadAttempts=(parseInt(reloadState.aiFeedReloadAttempts)||0)+1;
          if(reloadAttempts<=10){
            await chrome.storage.local.set({
              pendingAIComment:true,
              pendingAIConfig:{target:aiTarget,minDelay:aiMinDelay/1000,maxDelay:aiMaxDelay/1000,economyMode:aiEconomyMode,batchSize:aiBatchSize,cacheDays:aiCacheDays},
              aiFeedReloadAttempts:reloadAttempts,
              isAICommenting:true,
              aiStatus:t("ai2.reloading",{n:reloadAttempts,from:aiCount,to:aiTarget})
            });
            await sleep(rand(2500,4500));
            if(!isAICommenting)return;
            const prepared=await prepareAIPageTransition("tải lại Bảng tin");
            if(!prepared){isAICommenting=false;return;}
            location.reload();
            return;
          }
          lastAiFailure=t("ai2.gaveUp",{from:aiCount,to:aiTarget});
          chrome.storage.local.set({aiStatus:lastAiFailure,aiFeedReloadAttempts:0});
          break;
        }
      } else idle=0;
      if(aiCount>=aiTarget) break;
    }
    const aiStillActive=await chrome.storage.local.get("isAICommenting");
    if(!isAICommenting||aiStillActive.isAICommenting===false)return;
    isAICommenting=false;
    const zeroMessage=lastAiFailure || (!sawPost
      ? t("ai2.noPostHere")
      : t("ai2.seenNoComment"));
    const finalMessage=aiCount>=aiTarget
      ? t("ai2.doneAll",{from:aiCount,to:aiTarget})
      : lastAiFailure || (aiCount>0 ? t("ai2.pausedAt",{from:aiCount,to:aiTarget}) : zeroMessage);
    chrome.storage.local.set({ isAICommenting:false, aiActiveConfig:null,aiStatus:finalMessage });
  }

  function resetFeed(){
    isFeedInteracting=false; feedCount=0;
    document.querySelectorAll('[data-feed-interacted="1"]').forEach(el=>{ delete el.dataset.feedInteracted; el.style.outline=""; });
    chrome.storage.local.set({ feedCount:0, feedStatus:t("p.resetDone"), isFeedInteracting:false });
    chrome.storage.local.remove(["pendingFeedInteract","pendingFeedConfig"]);
  }
  function resetAI(){
    isAICommenting=false; aiCount=0;
    void cleanupAICommentComposer(undefined,undefined,"Reset");
    document.querySelectorAll('[data-ai-commented="1"]').forEach(el=>{ delete el.dataset.aiCommented; el.style.outline=""; });
    // Reset chỉ mở một phiên mới; giữ lịch sử/dấu vân tay để không gửi lại
    // những bài đã xử lý ở phiên trước. Xóa lịch sử phải là thao tác riêng,
    // không được xảy ra khi người dùng chỉ muốn đặt bộ đếm về 0.
    chrome.storage.local.set({ aiCount:0, aiStatus:t("ai2.resetKept"), isAICommenting:false,aiActiveConfig:null,pendingAIComment:false,aiNextAllowedAt:0,aiFeedReloadAttempts:0 });
  }

  async function scanJoinedGroups(){
    const skip=new Set(["feed","discover","joins","create","notifications","your_groups"]);
    const map=new Map();
    // Facebook can concatenate notification words with the actor name, e.g.
    // "Chưa đọcLão Già...". Do not require a trailing word boundary here.
    const notificationText=/(?:^|\s)(?:chưa\s*đọc|unread|đã nhắc đến bạn|đã gắn thẻ|đã từ chối|đã gỡ bài(?: viết)?|đã bày tỏ cảm xúc|đã phản hồi bình luận|thích bài viết của bạn|mentioned you|tagged (?:you|everyone)|removed your post|replied to your comment)/i;
    function collect(){
      for(const a of document.querySelectorAll('a[href*="/groups/"]')){
        let url;
        try{ url=new URL(a.href,location.origin); }catch{ continue; }
        if(url.hostname!==location.hostname) continue;
        const m=url.pathname.match(/^\/groups\/([^/?#]+)/);
        if(!m || skip.has(m[1].toLowerCase())) continue;
        // The joined-groups screen has notification links and post permalinks
        // that also start with /groups/<id>. Only a group-home link can be a
        // selectable destination; never turn a notification into a group.
        if(!/^\/groups\/[^/?#]+\/?$/i.test(url.pathname)) continue;
        const id=m[1];
        let name=(a.getAttribute("aria-label")||a.innerText||a.textContent||"").trim().replace(/\s+/g," ");
        if(!name || name.length<2 || name.length>150 || notificationText.test(name)) continue;
        const box=a.closest('div[role="listitem"], div')||a.parentElement;
        const img=a.querySelector("img")||box?.querySelector("img");
        const icon=img?.src||"";
        const cleanUrl=`${location.origin}/groups/${id}/`;
        if(!map.has(id) || name.length>map.get(id).name.length) map.set(id,{id,name,url:cleanUrl,icon});
      }
    }
    let stable=0,lastSize=0;
    for(let i=0;i<45 && stable<6;i++){
      collect();
      stable=map.size===lastSize?stable+1:0; lastSize=map.size;
      const panels=[...document.querySelectorAll("div")].filter(d=>d.scrollHeight>d.clientHeight+100 && getComputedStyle(d).overflowY==="auto" && (d.innerText||"").includes("Nhóm bạn đã tham gia"));
      panels.forEach(p=>p.scrollTop=Math.min(p.scrollHeight,p.scrollTop+Math.max(600,p.clientHeight*.8)));
      window.scrollTo(0,document.body.scrollHeight);
      await sleep(650);
    }
    collect();
    window.scrollTo(0,0);
    return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name,"vi"));
  }

  let isGroupInteracting=false;
  let groupStopRequested=false;
  let isGroupCommenting=false;
  let groupCommentStopRequested=false;
  // Composer riêng của Comment AI theo nhóm. Không dùng chung với luồng
  // Comment AI Bản tin để tránh dọn nhầm bản nháp khi hai state machine đổi
  // route gần nhau.
  let groupCommentDraftBox=null;
  let groupCommentDraftArticle=null;
  let groupCommentDraftScope=null;
  let groupCommentDraftIdentity="";
  let groupCommentDraftSignature="";
  let groupCommentDraftExpected="";
  // Facebook có thể giữ một composer nổi của bài trước sau khi đã gửi và
  // đổi URL sang permalink bài kế tiếp. Giữ một danh sách ngắn các đoạn text
  // mà chính lượt Comment AI đã sở hữu để dọn orphan composer về sau; không
  // dùng selector/counter của Comment AI Bản tin hoặc luồng khác.
  let groupCommentDraftOwnedHistory=[];
  function groupCommentDraftMatchesExpected(draft,expected){
    const actual=normalizeCommentComposerText(draft);
    const wanted=normalizeCommentComposerText(expected);
    if(actual.length<12||!wanted)return false;
    return actual===wanted||wanted.startsWith(actual)||wanted.endsWith(actual)||(actual.length>=12&&wanted.includes(actual));
  }
  function rememberGroupCommentDraftOwnership(expected,identity,signature){
    const wanted=normalizeCommentComposerText(expected);
    if(wanted.length<12)return;
    groupCommentDraftOwnedHistory=groupCommentDraftOwnedHistory.filter(entry=>entry.text!==wanted);
    groupCommentDraftOwnedHistory.push({text:wanted,identity:identity||"",signature:signature||"",time:Date.now()});
    if(groupCommentDraftOwnedHistory.length>40)groupCommentDraftOwnedHistory=groupCommentDraftOwnedHistory.slice(-40);
  }
  function clearGroupCommentDraftOwnedHistory(){groupCommentDraftOwnedHistory=[];}
  function rememberGroupCommentDraft(box,article,identity,signature,expectedText=""){
    groupCommentDraftBox=box||null;
    groupCommentDraftArticle=article||null;
    // Giữ chính lớp chi tiết đã chứa composer được xác nhận rỗng trước khi
    // gõ. Sau khi gửi, Facebook có thể thay editor bằng một node mới và
    // tạm thời làm identity/signature của node cha không còn khớp; vẫn được
    // phép dọn replacement nếu nó nằm trong đúng dialog do lượt này mở.
    groupCommentDraftScope=box?.closest?.('[role="dialog"]')||null;
    groupCommentDraftIdentity=identity||"";
    groupCommentDraftSignature=signature||"";
    groupCommentDraftExpected=normalizeCommentComposerText(expectedText);
    rememberGroupCommentDraftOwnership(groupCommentDraftExpected,groupCommentDraftIdentity,groupCommentDraftSignature);
  }
  function clearGroupCommentDraftMemory(){
    groupCommentDraftBox=null;
    groupCommentDraftArticle=null;
    groupCommentDraftScope=null;
    groupCommentDraftIdentity="";
    groupCommentDraftSignature="";
    groupCommentDraftExpected="";
  }
  function groupCommentRouteMatchesIdentity(identity){
    const key=String(identity||"").toLowerCase();
    const match=key.match(/^fb:group:([^:]+):([^:]+)$/);
    const path=String(location.pathname||"").toLowerCase().replace(/\/+$/,"/");
    // Trang chi tiết nhóm của Facebook có thể bỏ hẳn role="dialog" và thay
    // toàn bộ ancestor của composer. Khi đó, permalink hiện tại cùng với
    // ownership memory của lượt AI là scope hẹp nhất còn lại để nhận diện
    // replacement; không dùng fallback này trên feed nhóm thông thường.
    if(!match)return /\/groups\/[^/]+\/(?:posts|permalink)\/[^/]+\//.test(path);
    const groupPrefix=`/groups/${match[1]}/`;
    if(!path.includes(groupPrefix))return false;
    return path.includes(`/posts/${match[2]}/`)||path.includes(`/permalink/${match[2]}/`);
  }
  function findGroupCommentDraftReplacement(preferred){
    const entries=[];
    if(groupCommentDraftExpected)entries.push({text:groupCommentDraftExpected,identity:groupCommentDraftIdentity,signature:groupCommentDraftSignature});
    for(const entry of groupCommentDraftOwnedHistory){
      if(!entries.some(current=>current.text===entry.text))entries.push(entry);
    }
    const owned=visibleCommentBoxes().find(candidate=>{
      const draft=commentDraftText(candidate);
      // Chỉ dọn text đã được ghi nhận khi ô ban đầu còn rỗng và sau đó được
      // lượt AI sở hữu. Điều này xử lý cả composer mồ côi sau khi URL đổi,
      // đồng thời không quét/xóa bản nháp người dùng không khớp text AI.
      return entries.some(entry=>groupCommentDraftMatchesExpected(draft,entry.text));
    });
    if(owned)return owned;
    const article=groupCommentDraftArticle?.isConnected?groupCommentDraftArticle:null;
    if(article&&groupCommentDraftIdentity){
      const exact=findExactCommentBox(article,groupCommentDraftIdentity,groupCommentDraftSignature);
      if(exact?.box&&commentDraftText(exact.box))return exact.box;
    }
    if(groupCommentDraftIdentity){
      const exact=visibleCommentBoxes().find(candidate=>{
        if(!isAICommentComposer(candidate)||!commentDraftText(candidate))return false;
        return !!exactCommentScopeForBox(candidate,groupCommentDraftIdentity,groupCommentDraftSignature);
      });
      if(exact)return exact;
    }
    return preferred?.isConnected&&commentDraftText(preferred)?preferred:null;
  }
  function findAllGroupCommentDraftReplacements(){
    const entries=[];
    if(groupCommentDraftExpected)entries.push(groupCommentDraftExpected);
    for(const entry of groupCommentDraftOwnedHistory){
      if(!entries.includes(entry.text))entries.push(entry.text);
    }
    if(!entries.length)return [];
    return visibleCommentBoxes().filter(candidate=>entries.some(expected=>groupCommentDraftMatchesExpected(commentDraftText(candidate),expected)));
  }
  async function cleanupGroupCommentDraft(preferred){
    let candidate=preferred||groupCommentDraftBox;
    const ownedScopes=new Set();
    for(let attempt=0;attempt<3;attempt++){
      // Besides the original composer, Facebook may have mounted an overlay
      // composer for the same post. Clear every owned fragment before a route
      // change, otherwise Facebook raises its "Rời khỏi trang web?" warning.
      const candidates=[];
      for(const box of [candidate,groupCommentDraftBox,findGroupCommentDraftReplacement(candidate),...findAllGroupCommentDraftReplacements()]){
        if(box?.isConnected&&!candidates.includes(box))candidates.push(box);
      }
      for(const box of candidates){
        if(!commentDraftText(box))continue;
        const scope=groupCommentDraftIdentity?exactCommentScopeForBox(box,groupCommentDraftIdentity,groupCommentDraftSignature):null;
        if(scope?.isConnected)ownedScopes.add(scope);
        const cleared=await clearAICommentDraft(box);
        if(!cleared)return false;
      }
      // The detail overlay can be mounted just after the visible composer
      // becomes empty, then restore a trailing fragment of the AI text a few
      // hundred milliseconds later. Keep the ownership memory and wait for a
      // quiet settle period before closing/navigating, otherwise Facebook
      // raises its native "Rời khỏi trang?" warning on the next post.
      await sleep(600);
      candidate=findGroupCommentDraftReplacement(candidate);
      if(!candidate||!commentDraftText(candidate)){
        if(attempt<2) continue;
        for(const scope of ownedScopes)await closeExactCommentOverlay(scope);
        clearGroupCommentDraftMemory();
        return true;
      }
    }
    return !candidate?.isConnected||!commentDraftText(candidate);
  }
  function groupCommentLeaveWarningVisible(){
    return [...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].some(el=>
      isRenderedElement(el)&&/chưa hoàn tất bình luận|chưa hoàn thành bình luận|rời khỏi trang|haven.t finished your comment|unfinished comment|leave (?:this )?page|discard (?:comment|changes)|bỏ bình luận|hủy bình luận/i.test(el.innerText||el.textContent||""));
  }
  // Guard chung trước mọi lần đổi nhóm của Tương tác nhóm/Comment AI.
  // Facebook gắn beforeunload khi composer còn bản nháp nên điều hướng lúc
  // này sẽ bật đồng thời cảnh báo native "Rời khỏi trang web?" của Chrome và
  // hộp thoại "Rời khỏi trang? Bạn chưa hoàn tất bình luận" của Facebook,
  // làm kẹt phiên như ảnh báo lỗi. Không bao giờ điều hướng xuyên qua các
  // cảnh báo này: dọn draft do AI sở hữu, đóng overlay, rồi xác minh ô thật
  // sự rỗng trước khi cho phép chuyển nhóm.
  async function prepareGroupCommentTransition(mode="reaction",reason="đổi nhóm"){
    const cleaned=await cleanupGroupCommentDraft();
    const hasDraft=visibleCommentBoxes().some(box=>commentDraftText(box));
    if(!cleaned||hasDraft||groupCommentLeaveWarningVisible()){
      const state=groupModeState(mode);
      try{
        await chrome.storage.local.set({[state.statusKey]:t("gi2.transitionBlocked",{reason})});
      }catch(_){ }
      return false;
    }
    return true;
  }
  async function safeGroupNavigate(url,mode="reaction",runId="",reason="đổi nhóm"){
    if(!url)return false;
    if(runId&&!await groupModeRunActive(mode,runId))return false;
    if(!await prepareGroupCommentTransition(mode,reason))return false;
    if(runId&&!await groupModeRunActive(mode,runId))return false;
    location.href=url;
    return true;
  }
  function groupModeState(mode="reaction"){
    return mode==="comment"?{
      activeKey:"groupCommentActive",runIdKey:"groupCommentRunId",configKey:"groupCommentConfig",indexKey:"groupCommentIndex",doneKey:"groupCommentDone",totalKey:"groupCommentTotal",statusKey:"groupCommentStatus",stopKey:"comment",runFn:groupCommentRunActive
    }:{
      activeKey:"groupInteractActive",runIdKey:"groupInteractRunId",configKey:"groupInteractConfig",indexKey:"groupInteractIndex",doneKey:"groupInteractDone",totalKey:"groupInteractTotal",statusKey:"groupInteractStatus",stopKey:"reaction",runFn:groupInteractRunActive
    };
  }
  async function groupInteractRunActive(runId){
    if(groupStopRequested)return false;
    const live=await chrome.storage.local.get(["groupInteractActive","groupInteractRunId"]);
    return !!live.groupInteractActive&&!!runId&&live.groupInteractRunId===runId;
  }
  async function groupCommentRunActive(runId){
    if(groupCommentStopRequested)return false;
    const live=await chrome.storage.local.get(["groupCommentActive","groupCommentRunId"]);
    return !!live.groupCommentActive&&!!runId&&live.groupCommentRunId===runId;
  }
  async function groupModeRunActive(mode,runId){return mode==="comment"?groupCommentRunActive(runId):groupInteractRunActive(runId);}
  async function groupSleep(ms,runId=""){
    const end=Date.now()+ms;
    while(Date.now()<end){
      if(groupStopRequested||(runId&&!await groupInteractRunActive(runId))) return false;
      await sleep(Math.min(250,end-Date.now()));
    }
    return !groupStopRequested&&(!runId||await groupInteractRunActive(runId));
  }
  async function groupCommentSleep(ms,runId=""){
    const end=Date.now()+ms;
    while(Date.now()<end){
      if(groupCommentStopRequested||(runId&&!await groupCommentRunActive(runId))) return false;
      await sleep(Math.min(250,end-Date.now()));
    }
    return !groupCommentStopRequested&&(!runId||await groupCommentRunActive(runId));
  }
  chrome.storage.onChanged.addListener((changes,areaName)=>{
    if(areaName!=="local") return;
    if(changes.isFeedInteracting?.newValue===false) isFeedInteracting=false;
    if(changes.isAICommenting?.newValue===false){
      isAICommenting=false;
      void cleanupAICommentComposer(undefined,undefined,"Dừng");
    }
    if(changes.groupInteractActive?.newValue===false) groupStopRequested=true;
    if(changes.groupCommentActive?.newValue===false) groupCommentStopRequested=true;
  });
  async function groupInteractPostAIComment(article, commentText, expectedIdentity, wantedPath, runId="",mode="reaction"){
    const modeStopped=()=>mode==="comment"?groupCommentStopRequested:groupStopRequested;
    if(runId&&!await groupModeRunActive(mode,runId)) return "stopped";
    if(!article?.isConnected) return "skip";
    if(isSponsoredPost(article,{ignoreGenericPreview:mode==="comment"})) return "skip";
    if(article.querySelector('a[href*="/reel/"],a[href*="/watch/"]')) return "skip";
    const normalize=s=>String(s||"").replace(/[\u200B-\u200D\u2060\uFEFF]/g,"").replace(/\s+/g," ").trim().toLowerCase();
    const proof=normalize(commentText).slice(0,60);
    if(!proof) return "skip";
    const signature=normalize(extractPostText(article)).slice(0,60);
    let currentArticle=article;
    if(commentProofExists(currentArticle,proof)) return "already-commented";
    // Dọn orphan composer của các lượt AI trước ngay trước khi mở bài mới.
    // Nếu chờ tới lúc Facebook đã đổi permalink, chính click mở bài kế tiếp
    // có thể kích hoạt cảnh báo "Rời khỏi trang?" trước khi cleanup kịp chạy.
    if(groupCommentDraftOwnedHistory.length||groupCommentDraftExpected){
      const previousCleaned=await cleanupGroupCommentDraft();
      if(!previousCleaned)return "draft";
    }
    const previousBoxes=new Set(visibleCommentBoxes());
    const commentBtn=findCommentButton(currentArticle);
    if(!commentBtn) return "skip";
    if(runId&&!await groupModeRunActive(mode,runId)) return "stopped";
    try{await trustedMouse(commentBtn,"click",()=>groupModeRunActive(mode,runId));}catch(_){ }
    let box=null,scope=currentArticle;
    for(let wait=0;wait<30;wait++){
      if(modeStopped()||(runId&&!await groupModeRunActive(mode,runId))) return "stopped";
      const live=await chrome.storage.local.get(mode==="comment"?["groupCommentActive","groupCommentRunId"]:["groupInteractActive","groupInteractRunId"]);
      if(!(mode==="comment"?live.groupCommentActive:live.groupInteractActive)||(runId&&(mode==="comment"?live.groupCommentRunId:live.groupInteractRunId)!==runId)) return "stopped";
      if(wantedPath && !location.pathname.startsWith(wantedPath)) return "navigated";
      if(!currentArticle.isConnected){
        const replacement=expectedIdentity?findFeedPostByIdentity(expectedIdentity):null;
        if(replacement) currentArticle=replacement;
        else{
          // Bài đã rời DOM (Facebook mở trang chi tiết/lớp phủ) nhưng ô nhập
          // có thể đã mở — vẫn nhận ô mới thay vì chờ mù rồi báo timeout.
          const openedEarly=findGroupCommentBoxOpenedByClick(previousBoxes,expectedIdentity,signature);
          if(openedEarly?.box){box=openedEarly.box;scope=openedEarly.scope;currentArticle=openedEarly.scope;break;}
          await sleep(400);continue;
        }
      }
      // Ở permalink Facebook dựng song song card cũ phía sau và bài trong
      // cửa sổ nổi. Luôn lấy editor trong cửa sổ nổi trước khi xét card cũ;
      // đây là composer mà người dùng thấy và cũng tránh để lại draft ẩn ở
      // nền khi chuyển sang bài/nhóm tiếp theo.
      const detailComposer=findGroupPostDetailComposer(expectedIdentity,signature);
      if(detailComposer?.box){box=detailComposer.box;scope=detailComposer.scope;currentArticle=detailComposer.scope;break;}
      // Facebook thường giữ composer rỗng của card cũ rồi mount một composer
      // mới ở lớp chi tiết. Ưu tiên node mới xuất hiện sau cú click; nếu chọn
      // node cũ ngay lập tức thì React sẽ chuyển phần gõ xuống node mới, làm
      // người dùng thấy ô phía trên mở nhưng không có chữ.
      const opened=findGroupCommentBoxOpenedByClick(previousBoxes,expectedIdentity,signature);
      if(opened?.box){box=opened.box;scope=opened.scope;break;}
      const exact=findExactCommentBox(currentArticle,expectedIdentity,signature);
      const exactIsNew=!!(exact?.box&&!previousBoxes.has(exact.box));
      if(exact?.box&&(exactIsNew||wait>=8)){box=exact.box;scope=exact.scope;break;}
      await sleep(400);
    }
    if(!box||!box.isConnected) return "box-timeout";
    if(isMessengerChatBox(box)) return "box-timeout";
    try{box.scrollIntoView({behavior:"instant",block:"center"});}catch{ }
    await sleep(300);
    let focused=false;
    try{box.focus();box.click();focused=document.activeElement===box||box.contains(document.activeElement);}catch(_){ }
    if(!focused&&box.isConnected){
      try{await trustedMouse(box,"click");focused=document.activeElement===box||box.contains(document.activeElement);}catch(_){ }
    }
    if(!focused||isMessengerChatBox(document.activeElement)) return "box-timeout";
    // Ghi nhớ ngay khi đã xác nhận ô đang rỗng. Nếu Facebook thay composer
    // giữa lúc gõ, nhánh nhập hụt vẫn phải lần lại đúng bài để dọn phần nháp
    // do chính lượt Comment AI này tạo ra. Không ghi nhớ ô đã có draft để
    // không bao giờ dọn nhầm nội dung người dùng.
    const ownsComposer=!commentComposerText(box);
    if(ownsComposer) rememberGroupCommentDraft(box,currentArticle,expectedIdentity,signature,commentText);
    const resolveGroupComposer=(preferred)=>{
      const detailComposer=findGroupPostDetailComposer(expectedIdentity,signature);
      if(detailComposer?.box){
        scope=detailComposer.scope;
        if(normalizeCommentComposerText(commentComposerText(detailComposer.box))===normalizeCommentComposerText(commentText))return detailComposer.box;
        if(!commentComposerText(detailComposer.box))return detailComposer.box;
      }
      const exact=findExactCommentBox(currentArticle,expectedIdentity,signature);
      const exactBox=exact?.box||null;
      if(exact){scope=exact.scope;}
      if(exactBox&&normalizeCommentComposerText(commentComposerText(exactBox))===normalizeCommentComposerText(commentText))return exactBox;
      // `preferred` là composer vừa được mở sau cú click. Nếu nó còn rỗng,
      // giữ focus ở chính node này; không quay ngược về composer cũ đang nằm
      // phía trên vì Facebook có thể thay node trong lúc bắt đầu gõ.
      if(preferred?.isConnected&&!commentComposerText(preferred))return preferred;
      const replacement=findGroupCommentDraftReplacement(preferred||exactBox);
      return replacement||exactBox||preferred||null;
    };
    const typingGuard={
      storageKey:mode==="comment"?"groupCommentActive":"groupInteractActive",
      runId,
      runIdKey:mode==="comment"?"groupCommentRunId":"groupInteractRunId"
    };
    let filled=await fillAndVerifyCommentBox(box,commentText,resolveGroupComposer,()=>groupModeRunActive(mode,runId),typingGuard);
    // Facebook có thể thay composer đúng lúc đang gõ. Nếu lần đầu chỉ tạo
    // được bản nháp hụt, đã dọn sạch ô do AI sở hữu thì thử lại một lần trên
    // composer mới của chính bài đó; không chuyển bài và không gửi nội dung
    // chưa được xác nhận đủ.
    if(!filled.ok&&filled.reason==="typeincomplete"&&!modeStopped()&&await groupModeRunActive(mode,runId)){
      await cleanupGroupCommentDraft(filled.box||box);
      await sleep(500);
      const retryBox=resolveGroupComposer(box);
      if(retryBox?.isConnected&&!commentComposerText(retryBox)){
        rememberGroupCommentDraft(retryBox,currentArticle,expectedIdentity,signature,commentText);
        filled=await fillAndVerifyCommentBox(retryBox,commentText,resolveGroupComposer,()=>groupModeRunActive(mode,runId),typingGuard);
      }
    }
    if(filled.box?.isConnected)box=filled.box;
    if(!filled.ok){
      if(filled.reason==="typeincomplete"||filled.reason==="stopped"){
        await cleanupGroupCommentDraft(box);
      }else{
        clearGroupCommentDraftMemory();
      }
      return filled.reason||"typeincomplete";
    }
    if(!ownsComposer) clearGroupCommentDraftMemory();
    // DỪNG BẰNG MỌI GIÁ: kiểm tra lại ngay trước cú gửi. Nếu đã sở hữu
    // composer và đã gõ nội dung, phải dọn draft trước khi trả về để lần
    // điều hướng kế tiếp không bật cảnh báo "Rời khỏi trang?".
    if(modeStopped()||(runId&&!await groupModeRunActive(mode,runId))){
      await cleanupGroupCommentDraft(box);
      return "stopped";
    }
    const guardKey=expectedIdentity||postIdentity(currentArticle);
    const guardKeyName=mode==="comment"?"groupCommentSubmissionGuard":"groupInteractCommentGuard";
    const guardStored=await chrome.storage.local.get(guardKeyName);
    const guard=guardStored[guardKeyName]&&typeof guardStored[guardKeyName]==="object"?guardStored[guardKeyName]:{};
    if(guardKey){guard[guardKey]={time:Date.now(),source:mode==="comment"?"group-comment":"group-interact",state:"submitting",runId};await chrome.storage.local.set({[guardKeyName]:guard});}
    if(runId&&!await groupModeRunActive(mode,runId)){
      await cleanupGroupCommentDraft(box);
      await closeExactCommentOverlay(scope);
      return "stopped";
    }
    const sendBtn=findCommentSendButton(box);
    let submitted=false;
    if(sendBtn&&!isMessengerChatBox(sendBtn)){
      try{submitted=!!(await trustedMouse(sendBtn,"click",()=>groupModeRunActive(mode,runId)));}catch{ }
    }else{
      try{const enter=await chrome.runtime.sendMessage({action:"trustedInput",text:"",pressEnter:true,typingMinDelay:0,typingMaxDelay:0});submitted=!!enter?.ok;}catch(_){ }
    }
    if(!submitted){
      if(guardKey){delete guard[guardKey];await chrome.storage.local.set({[guardKeyName]:guard});}
      return "box-timeout";
    }
    const deadline=Date.now()+30000;
    while(true){
      if(modeStopped()||(runId&&!await groupModeRunActive(mode,runId))){
        await cleanupGroupCommentDraft(box);
        await closeExactCommentOverlay(scope);
        return "stopped";
      }
      const live=await chrome.storage.local.get(mode==="comment"?["groupCommentActive","groupCommentRunId"]:["groupInteractActive","groupInteractRunId"]);
      if(!(mode==="comment"?live.groupCommentActive:live.groupInteractActive)||(runId&&(mode==="comment"?live.groupCommentRunId:live.groupInteractRunId)!==runId)){
        await cleanupGroupCommentDraft(box);
        await closeExactCommentOverlay(scope);
        return "stopped";
      }
      await sleep(500);
      let checkScope=scope?.isConnected?scope:findFeedPostByIdentity(expectedIdentity);
      // Facebook đôi khi render comment vừa gửi vào lớp chi tiết/overlay
      // nằm ngoài container bài cũ (đặc biệt khi nút Bình luận mở permalink).
      // Vẫn ưu tiên xác nhận theo đúng bài; nếu route nhóm đã chuyển sang
      // permalink thì kiểm tra thêm vùng comment đang hiển thị trên trang.
      const pageProof=location.pathname.includes("/groups/")&&commentProofExists(document,proof);
      if((checkScope&&commentProofExists(checkScope,proof))||pageProof){
        const cleaned=await cleanupGroupCommentDraft(box);
        await closeExactCommentOverlay(scope);
        return cleaned?true:"draft";
      }
      if(currentArticle?.isConnected&&commentProofExists(currentArticle,proof)){
        const cleaned=await cleanupGroupCommentDraft(box);
        await closeExactCommentOverlay(scope);
        return cleaned?true:"draft";
      }
      if(Date.now()>=deadline){
        await cleanupGroupCommentDraft(box);
        await closeExactCommentOverlay(scope);
        return "unconfirmed-skip";
      }
    }
  }
  async function continueGroupInteraction(){
    if(isGroupInteracting) return;
    isGroupInteracting=true;
    let activeRunId="";
    try{
      let stored=await chrome.storage.local.get(["groupInteractActive","groupInteractRunId","groupInteractConfig","groupInteractIndex","groupInteractDone","groupInteractAiDone","groupInteractCommentHistory","groupInteractCommentGuard","groupInteractAiSkipped","groupInteractCurrentGroupIndex","groupInteractCurrentGroupDone","groupInteractCurrentGroupAiDone","groupInteractReactedKeys","groupInteractReactionGuard"]);
      let cfg=stored.groupInteractConfig;
      if(!stored.groupInteractActive || !cfg?.groups?.length) return;
      activeRunId=String(stored.groupInteractRunId||cfg.runId||"");
      if(!activeRunId){
        activeRunId=`group-interact-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
        cfg={...cfg,runId:activeRunId};
        await chrome.storage.local.set({groupInteractRunId:activeRunId,groupInteractConfig:cfg});
      }
      if(!await groupInteractRunActive(activeRunId))return;
      if(cfg.targetGroups) cfg={...cfg,groups:cfg.groups.slice(0,Math.max(1,parseInt(cfg.targetGroups)||cfg.groups.length))};
      // Like/Random is a standalone run. AI comments have their own start,
      // counters, guards and resume state below; an old persisted aiComment
      // flag must never silently combine the two actions again.
      const aiCommentEnabled=false;
      let index=parseInt(stored.groupInteractIndex)||0;
      let totalDone=parseInt(stored.groupInteractDone)||0;
      let totalAiDone=parseInt(stored.groupInteractAiDone)||0;
      let commentHistory=stored.groupInteractCommentHistory&&typeof stored.groupInteractCommentHistory==="object"?stored.groupInteractCommentHistory:{};
      const commentGuard=stored.groupInteractCommentGuard&&typeof stored.groupInteractCommentGuard==="object"?stored.groupInteractCommentGuard:{};
      const seenCommentKeys=new Set(Object.keys(commentHistory));
      // A reload after a comment send is ambiguous.  Treat its pre-send guard
      // as seen for this run so the same post is never sent twice.
      Object.entries(commentGuard).forEach(([key,value])=>{if(value?.runId===activeRunId)seenCommentKeys.add(key);});
      let reactedKeys=stored.groupInteractReactedKeys&&typeof stored.groupInteractReactedKeys==="object"?stored.groupInteractReactedKeys:{};
      let reactionGuard=stored.groupInteractReactionGuard&&typeof stored.groupInteractReactionGuard==="object"?stored.groupInteractReactionGuard:{};
      const seenReactionKeys=new Set(Object.keys(reactedKeys));
      Object.entries(reactionGuard).forEach(([key,value])=>{if(value?.runId===activeRunId)seenReactionKeys.add(key);});
      let aiSkipped=(stored.groupInteractAiSkipped&&typeof stored.groupInteractAiSkipped==="object")?stored.groupInteractAiSkipped:{};
      const AI_SKIP_NAMES={short:t("ai.skip.short"),seen:t("ai.skip.seen"),own:t("ai.skip.own"),nobutton:t("ai.skip.nobutton"),boxtimeout:t("ai.skip.boxtimeout"),draft:t("ai.skip.draft"),typeincomplete:t("ai.skip.typeincomplete"),unconfirmed:t("ai.skip.unconfirmed"),navigated:t("ai.skip.navigated"),duplicate:t("ai.skip.duplicate")};
      const aiSkippedTotal=()=>Object.values(aiSkipped).reduce((s,n)=>s+(parseInt(n)||0),0);
      const aiSkipSummary=()=>{const parts=Object.entries(aiSkipped).filter(([,n])=>(parseInt(n)||0)>0).map(([k,n])=>`${n} ${AI_SKIP_NAMES[k]||k}`);return parts.length?t("ai.skippedSummary",{total:aiSkippedTotal(),parts:parts.join(", ")}):"";};
      const noteAiSkip=(reason)=>{aiSkipped[reason]=(parseInt(aiSkipped[reason])||0)+1;};
      const groupAiStatus=(groupDoneNow,groupAiDoneNow)=>aiCommentEnabled?" • "+t("ai.aiDoneCount",{n:groupAiDoneNow})+(aiSkippedTotal()?` • ${t("ai.skippedN",{n:aiSkippedTotal()})}`:""):"";
      const statusSuffix=()=>aiCommentEnabled?" • "+t("ai.aiDoneCount",{n:totalAiDone})+aiSkipSummary():"";
      let groupDone=Number(stored.groupInteractCurrentGroupIndex)===index?Math.max(0,parseInt(stored.groupInteractCurrentGroupDone)||0):0;
      let groupAiDone=Number(stored.groupInteractCurrentGroupIndex)===index?Math.max(0,parseInt(stored.groupInteractCurrentGroupAiDone)||0):0;
      if(index>=cfg.groups.length){
        await chrome.storage.local.set({groupInteractActive:false,groupInteractStatus:t("gi2.allDone",{n:cfg.groups.length,done:totalDone,suffix:statusSuffix()})});
        return;
      }
      const group=cfg.groups[index];
      const wantedPath=new URL(group.url).pathname.replace(/\/$/,"");
      if(!location.pathname.startsWith(wantedPath)){
        if(!await groupInteractRunActive(activeRunId)) return;
        await chrome.storage.local.set({groupInteractStatus:t("gi2.opening",{i:index+1,t:cfg.groups.length,name:group.name})});
        if(!await groupInteractRunActive(activeRunId)) return;
        await safeGroupNavigate(group.url,"reaction",activeRunId,"mở nhóm");
        return;
      }
      await chrome.storage.local.set({groupInteractStatus:t("gi2.interacting",{i:index+1,t:cfg.groups.length,name:group.name})});
      if(!await groupSleep(2500,activeRunId)) return;
      let emptyTries=0;
      let noProgressRounds=0;
      while(groupDone<cfg.perGroup){
        if(!await groupInteractRunActive(activeRunId)) return;
        const groupDoneBeforeRound=groupDone;
        let buttons=findFeedLikeButtons();
        if(!buttons.length){
          emptyTries++;
          window.scrollBy(0,Math.max(850,innerHeight*.8));
          if(!await groupSleep(1800,activeRunId)) return;
          if(emptyTries>=7) break;
          continue;
        }
        emptyTries=0;
        for(const btn of buttons){
          if(groupDone>=cfg.perGroup || !await groupInteractRunActive(activeRunId)) break;
          const bar=findMainActionBar(btn),post=findFeedPostContainer(btn);
          btn.scrollIntoView({behavior:"smooth",block:"center"});
          if(!await groupSleep(650,activeRunId)) return;
          if(!isValidFeedLike(btn,bar)) continue;
          try{
            const postTextBefore=post?extractPostText(post):"";
            const reactionKey=post?(postIdentity(post)||postContentKey(postTextBefore)):"";
            if(reactionKey&&seenReactionKeys.has(reactionKey))continue;
            if(!await groupInteractRunActive(activeRunId))return;
            if(reactionKey){
              reactionGuard[reactionKey]={time:Date.now(),runId:activeRunId,state:"reacting"};
              await chrome.storage.local.set({groupInteractReactionGuard:reactionGuard});
              if(!await groupInteractRunActive(activeRunId))return;
            }
            const result=await doReact(btn,cfg.reaction,()=>groupInteractRunActive(activeRunId));
            if(!await groupInteractRunActive(activeRunId)) return;
            btn.dataset.feedInteracted="1";
            if(post) post.dataset.feedInteracted="1";
            if(!result.success){
              if(reactionKey){delete reactionGuard[reactionKey];await chrome.storage.local.set({groupInteractReactionGuard:reactionGuard});}
              continue;
            }
            if(reactionKey){
              seenReactionKeys.add(reactionKey);
              reactedKeys[reactionKey]={time:Date.now(),runId:activeRunId};
              delete reactionGuard[reactionKey];
            }
            groupDone++; totalDone++;
            if(post) post.style.outline="2px solid #00897b";
            if(aiCommentEnabled&&post&&post.isConnected){
              const postKey=postIdentity(post);
              const postText=extractPostText(post);
              const contentKey=postContentKey(postText);
              const alreadySeen=(postKey&&seenCommentKeys.has(postKey))||(contentKey&&Object.values(commentHistory).some(e=>e?.contentKey===contentKey));
              const ownComment=hasOwnComment(post);
              if(!postText||postText.trim().length<15)noteAiSkip("short");
              else if(alreadySeen)noteAiSkip("seen");
              else if(ownComment){
                noteAiSkip("own");
                if(postKey&&!seenCommentKeys.has(postKey)){seenCommentKeys.add(postKey);commentHistory[postKey]={time:Date.now(),source:"group-interact",contentKey:contentKey||"",existing:true};}
              }
              else{
                let commentText="";
                try{
                  const aiRes=await chrome.runtime.sendMessage({action:"aiGenerateComment",postText:postText.slice(0,500)});
                  if(!aiRes?.ok) throw new Error(aiRes?.error||t("ai2.genFailAi"));
                  commentText=sanitizeCommentOutput(String(aiRes.comment||"").trim()).replace(/[!！]+\s*$/g,"").trimEnd();
                }catch(e){console.warn("[Group Interact AI]",e);commentText=fallbackComment(postText);}
                if(commentText){
                  const aiResult=await groupInteractPostAIComment(post,commentText,postKey,wantedPath,activeRunId);
                  if(!await groupInteractRunActive(activeRunId)) return;
                  if(aiResult===true||aiResult==="already-commented"){
                    groupAiDone++;totalAiDone++;
                    if(postKey){seenCommentKeys.add(postKey);commentHistory[postKey]={time:Date.now(),source:"group-interact",contentKey:contentKey||""};}
                    if(post.isConnected) post.style.outline="2px solid #9c27b0";
                  }else if(aiResult==="unconfirmed-skip"){
                    noteAiSkip("unconfirmed");
                    if(postKey){seenCommentKeys.add(postKey);commentHistory[postKey]={time:Date.now(),source:"group-interact",contentKey:contentKey||"",unconfirmed:true};}
                  }else if(aiResult==="navigated"){
                    // Nút Bình luận đưa Facebook sang trang khác (viewer ảnh,
                    // permalink lạ...): khóa bài chống lặp rồi quay lại nhóm,
                    // phiên tự tiếp tục sau khi tải lại.
                    noteAiSkip("navigated");
                    if(postKey){seenCommentKeys.add(postKey);commentHistory[postKey]={time:Date.now(),source:"group-interact",contentKey:contentKey||"",navigated:true};}
                    await chrome.storage.local.set({groupInteractDone:totalDone,groupInteractAiDone:totalAiDone,groupInteractCurrentGroupIndex:index,groupInteractCurrentGroupDone:groupDone,groupInteractCurrentGroupAiDone:groupAiDone,groupInteractReactedKeys:reactedKeys,groupInteractReactionGuard:reactionGuard,groupInteractAiSkipped:aiSkipped,groupInteractCommentHistory:commentHistory,groupInteractStatus:t("gi2.postDone",{name:group.name,done:groupDone,per:cfg.perGroup,ai:groupAiStatus(groupDone,groupAiDone)})+t("gi2.navBack")});
                    await safeGroupNavigate(group.url,"reaction",activeRunId,"quay lại nhóm sau khi Facebook chuyển trang");
                    return;
                  }else if(aiResult==="stopped"){
                    return;
                  }else{
                    noteAiSkip(aiResult==="skip"?"nobutton":"boxtimeout");
                  }
                }
              }
            }
            await chrome.storage.local.set({groupInteractDone:totalDone,groupInteractAiDone:totalAiDone,groupInteractCurrentGroupIndex:index,groupInteractCurrentGroupDone:groupDone,groupInteractCurrentGroupAiDone:groupAiDone,groupInteractReactedKeys:reactedKeys,groupInteractReactionGuard:reactionGuard,groupInteractAiSkipped:aiSkipped,groupInteractCommentHistory:commentHistory,groupInteractStatus:t("gi2.postDone",{name:group.name,done:groupDone,per:cfg.perGroup,ai:groupAiStatus(groupDone,groupAiDone)})});
            if(groupDone<cfg.perGroup && !await groupSleep(rand(cfg.minDelay*1000,cfg.maxDelay*1000),activeRunId)) return;
          }catch(e){ console.warn("[Group Interact]",e); }
        }
        if(groupDone<cfg.perGroup){
          // Facebook can keep the same already-processed reaction buttons in
          // the DOM forever. A non-empty list is not proof that this round
          // made progress, so stop retrying the same nodes after a few rounds.
          noProgressRounds=groupDone===groupDoneBeforeRound?noProgressRounds+1:0;
          if(noProgressRounds>=3)break;
          window.scrollBy(0,innerHeight*.9);
          if(!await groupSleep(1500,activeRunId)) return;
        }
      }
      if(!await groupInteractRunActive(activeRunId)) return;
      index++;
      if(aiCommentEnabled) console.warn("[Group Interact AI] chi tiết bỏ comment:",{...aiSkipped});
      await chrome.storage.local.set({groupInteractIndex:index,groupInteractAiDone:totalAiDone,groupInteractCurrentGroupIndex:index,groupInteractCurrentGroupDone:0,groupInteractCurrentGroupAiDone:0,groupInteractReactedKeys:{},groupInteractReactionGuard:{},groupInteractAiSkipped:aiSkipped,groupInteractCommentHistory:commentHistory,groupInteractStatus:t("gi2.groupDone",{name:group.name,done:groupDone,per:cfg.perGroup,ai:aiCommentEnabled?" • "+t("ai.aiDoneCount",{n:groupAiDone})+aiSkipSummary():""})});
      if(index<cfg.groups.length){
        if(!await groupSleep(rand(cfg.minDelay*1000,cfg.maxDelay*1000),activeRunId)) return;
        if(!await groupInteractRunActive(activeRunId)) return;
        await safeGroupNavigate(cfg.groups[index].url,"reaction",activeRunId,"sang nhóm kế tiếp");
      }else{
        if(await groupInteractRunActive(activeRunId))await chrome.storage.local.set({groupInteractActive:false,groupInteractStatus:t("gi2.allDone",{n:cfg.groups.length,done:totalDone,suffix:statusSuffix()})});
      }
    }finally{
      isGroupInteracting=false;
      const next=await chrome.storage.local.get(["groupInteractActive","groupInteractRunId"]);
      if(next.groupInteractActive&&next.groupInteractRunId&&next.groupInteractRunId!==activeRunId)setTimeout(continueGroupInteraction,0);
    }
  }

  async function continueGroupComment(){
    if(isGroupCommenting)return;
    isGroupCommenting=true;
    let activeRunId="";
    try{
      let stored=await chrome.storage.local.get(["groupCommentActive","groupCommentRunId","groupCommentConfig","groupCommentIndex","groupCommentDone","groupCommentTotal","groupCommentHistory","groupCommentSubmissionGuard","groupCommentProcessedKeys","groupCommentSkipped","groupCommentRetryCounts","groupCommentCurrentGroupIndex","groupCommentCurrentGroupDone"]);
      let cfg=stored.groupCommentConfig;
      if(!stored.groupCommentActive||!cfg?.groups?.length)return;
      activeRunId=String(stored.groupCommentRunId||cfg.runId||"");
      if(!activeRunId){
        activeRunId=`group-comment-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
        cfg={...cfg,runId:activeRunId};
        await chrome.storage.local.set({groupCommentRunId:activeRunId,groupCommentConfig:cfg});
      }
      if(!await groupCommentRunActive(activeRunId))return;
      if(cfg.targetGroups)cfg={...cfg,groups:cfg.groups.slice(0,Math.max(1,parseInt(cfg.targetGroups)||cfg.groups.length))};
      let index=parseInt(stored.groupCommentIndex)||0;
      let totalDone=parseInt(stored.groupCommentDone)||0;
      let commentHistory=stored.groupCommentHistory&&typeof stored.groupCommentHistory==="object"?stored.groupCommentHistory:{};
      const submissionGuard=stored.groupCommentSubmissionGuard&&typeof stored.groupCommentSubmissionGuard==="object"?stored.groupCommentSubmissionGuard:{};
      // Lịch sử cũ chỉ là nhật ký/audit, không phải bộ lọc của lượt mới.
      // Người dùng yêu cầu mọi bài đang thấy được AI đọc và comment; dùng
      // history xuyên phiên ở đây từng làm các bài mới bị báo nhầm là
      // "đã xử lý" sau khi Facebook tái dùng permalink/DOM. Chỉ guard của
      // CHÍNH run hiện tại mới chặn gửi lại một submit còn mơ hồ sau reload.
      const activeRunSubmissionKeys=new Set();
      Object.entries(submissionGuard).forEach(([key,value])=>{if(value?.runId===activeRunId)activeRunSubmissionKeys.add(key);});
      const processedKeys=new Set(Array.isArray(stored.groupCommentProcessedKeys)?stored.groupCommentProcessedKeys:[]);
      const skipped=stored.groupCommentSkipped&&typeof stored.groupCommentSkipped==="object"?stored.groupCommentSkipped:{};
      const retryCounts=stored.groupCommentRetryCounts&&typeof stored.groupCommentRetryCounts==="object"?stored.groupCommentRetryCounts:{};
      const skipNames={short:t("ai.skip.short"),seen:t("ai.skip.seen"),own:t("ai.skip.own"),nobutton:t("ai.skip.nobutton"),boxtimeout:t("ai.skip.boxtimeout"),draft:t("ai.skip.draft"),typeincomplete:t("ai.skip.typeincomplete"),unconfirmed:t("ai.skip.unconfirmed"),navigated:t("ai.skip.navigated"),duplicate:t("ai.skip.duplicate")};
      const skipTotal=()=>Object.values(skipped).reduce((sum,n)=>sum+(parseInt(n)||0),0);
      const skipSummary=()=>{const parts=Object.entries(skipped).filter(([,n])=>(parseInt(n)||0)>0).map(([key,n])=>`${n} ${skipNames[key]||key}`);return parts.length?` • ${t("ai.skippedSummary",{total:skipTotal(),parts:parts.join(", ")})}`:"";};
      const noteSkip=reason=>{skipped[reason]=(parseInt(skipped[reason])||0)+1;};
      let groupDone=Number(stored.groupCommentCurrentGroupIndex)===index?Math.max(0,parseInt(stored.groupCommentCurrentGroupDone)||0):0;
      let noProgressRounds=0;
      if(index>=cfg.groups.length){
        await chrome.storage.local.set({groupCommentActive:false,groupCommentStatus:t("gi2.commentAllDone",{n:cfg.groups.length,done:totalDone,suffix:skipSummary()})});
        return;
      }
      const group=cfg.groups[index];
      const wantedPath=new URL(group.url).pathname.replace(/\/$/,"");
      if(!location.pathname.startsWith(wantedPath)){
        if(!await groupCommentRunActive(activeRunId))return;
        await chrome.storage.local.set({groupCommentStatus:t("gi2.commentOpening",{i:index+1,t:cfg.groups.length,name:group.name})});
        if(!await groupCommentRunActive(activeRunId))return;
        await safeGroupNavigate(group.url,"comment",activeRunId,"mở nhóm");
        return;
      }
      await chrome.storage.local.set({groupCommentStatus:t("gi2.commentInteracting",{i:index+1,t:cfg.groups.length,name:group.name})});
      // A group navigation can resolve before Facebook has mounted the first
      // feed card. On a slow connection the old 2.5s grace period ended the
      // run while the page was still a skeleton, reporting 0 comments even
      // though posts appeared a few seconds later. Give the route a longer
      // bounded settle period, then keep polling below while the feed grows.
      if(!await groupCommentSleep(6000,activeRunId))return;
      let emptyTries=0;
      while(groupDone<cfg.perGroup){
        if(!await groupCommentRunActive(activeRunId))return;
        const posts=findGroupCommentPosts();
        if(!posts.length){
          emptyTries++;
          await chrome.storage.local.set({groupCommentStatus:`${t("gi2.commentInteracting",{i:index+1,t:cfg.groups.length,name:group.name})} ${t("gi2.commentWaiting",{try:emptyTries,max:18})}`});
          window.scrollBy(0,Math.max(850,innerHeight*.8));
          if(emptyTries>=18)break;
          if(!await groupCommentSleep(2500,activeRunId))return;
          continue;
        }
        emptyTries=0;
        const groupDoneBeforeRound=groupDone;
        for(const post of posts){
          if(groupDone>=cfg.perGroup||!await groupCommentRunActive(activeRunId))break;
          if(!post||!post.isConnected)continue;
          const postText=groupCommentSourceText(post);
          const postKey=postIdentity(post)||postContentKey(postText);
          if(postKey&&processedKeys.has(postKey))continue;
          if(postKey)processedKeys.add(postKey);
          let result="";
          if(isSponsoredPost(post,{ignoreGenericPreview:true})||post.querySelector('a[href*="/reel/"],a[href*="/watch/"]')){noteSkip("nobutton");}
          else if(postKey&&activeRunSubmissionKeys.has(postKey)){noteSkip("seen");}
          // Không comment chồng lên chính comment đang hiển thị của tài khoản.
          // Đây là proof trực tiếp từ Facebook, khác với lịch sử nội bộ cũ.
          else if(hasOwnComment(post)){
            noteSkip("own");
            if(postKey)commentHistory[postKey]={time:Date.now(),source:"group-comment",contentKey:postContentKey(postText),existing:true,runId:activeRunId};
          }
          else{
            let commentText="";
            try{
              const aiRes=await chrome.runtime.sendMessage({action:"aiGenerateComment",postText:postText.slice(0,500)});
              if(!aiRes?.ok)throw new Error(aiRes?.error||"AI failed");
              commentText=sanitizeCommentOutput(String(aiRes.comment||"").trim()).replace(/[!！]+\s*$/g,"").trimEnd();
            }catch(error){console.warn("[Group Comment AI]",error);commentText=fallbackComment(postText);}
            if(!commentText){noteSkip("nobutton");}
            else{
              result=await groupInteractPostAIComment(post,commentText,postKey,wantedPath,activeRunId,"comment");
              if(result===true||result==="already-commented"){
                groupDone++;totalDone++;
                if(postKey)delete retryCounts[postKey];
                if(postKey){activeRunSubmissionKeys.add(postKey);commentHistory[postKey]={time:Date.now(),source:"group-comment",contentKey:postContentKey(postText),runId:activeRunId};}
                if(post.isConnected)post.style.outline="2px solid #9c27b0";
              }else if(result==="unconfirmed-skip"){
                noteSkip("unconfirmed");
                if(postKey){activeRunSubmissionKeys.add(postKey);commentHistory[postKey]={time:Date.now(),source:"group-comment",contentKey:postContentKey(postText),unconfirmed:true,runId:activeRunId};}
              }else if(result==="navigated"){
                const attempts=postKey?(parseInt(retryCounts[postKey])||0)+1:4;
                if(postKey&&attempts<=3){
                  retryCounts[postKey]=attempts;
                  processedKeys.delete(postKey);
                  await chrome.storage.local.set({groupCommentIndex:index,groupCommentDone:totalDone,groupCommentCurrentGroupIndex:index,groupCommentCurrentGroupDone:groupDone,groupCommentHistory:commentHistory,groupCommentProcessedKeys:[...processedKeys].slice(-500),groupCommentRetryCounts:retryCounts,groupCommentSkipped:skipped,groupCommentStatus:`${t("gi2.commentNavBack")} Thử lại bài ${attempts}/3`});
                  await safeGroupNavigate(group.url,"comment",activeRunId,"quay lại nhóm để thử lại bài");
                  return;
                }
                noteSkip("navigated");
                await chrome.storage.local.set({groupCommentIndex:index,groupCommentDone:totalDone,groupCommentCurrentGroupIndex:index,groupCommentCurrentGroupDone:groupDone,groupCommentHistory:commentHistory,groupCommentProcessedKeys:[...processedKeys].slice(-500),groupCommentSkipped:skipped,groupCommentStatus:t("gi2.commentNavBack")});
                await safeGroupNavigate(group.url,"comment",activeRunId,"quay lại nhóm sau khi Facebook chuyển trang");
                return;
              }else if(result==="stopped")return;
              else if(result==="boxtimeout"||result==="typeincomplete"){
                const attempts=postKey?(parseInt(retryCounts[postKey])||0)+1:4;
                if(postKey&&attempts<=3){
                  retryCounts[postKey]=attempts;
                  processedKeys.delete(postKey);
                }else noteSkip(result==="typeincomplete"?"typeincomplete":"boxtimeout");
              }else noteSkip(result==="skip"?"nobutton":result==="draft"?"draft":"boxtimeout");
            }
          }
          await chrome.storage.local.set({groupCommentDone:totalDone,groupCommentCurrentGroupIndex:index,groupCommentCurrentGroupDone:groupDone,groupCommentHistory:commentHistory,groupCommentProcessedKeys:[...processedKeys].slice(-500),groupCommentRetryCounts:retryCounts,groupCommentSkipped:skipped,groupCommentStatus:t("gi2.commentPostDone",{name:group.name,done:groupDone,per:cfg.perGroup,suffix:skipSummary()})});
          // Sau proof Facebook đôi lúc giữ URL permalink và dialog của bài
          // vừa comment thêm một nhịp. Nếu tiếp tục quét ở route đó, mọi card
          // nền có thể mang cùng permalink và editor của bài kế tiếp không
          // còn mở đúng chỗ, dẫn tới nhiều lần "không thấy ô nhập". Quay về
          // route gốc của nhóm sau từng lượt đã xử lý; tiến trình/history đã
          // được persist ở trên nên reload/resume không đăng lặp.
          const currentPath=location.pathname.replace(/\/$/,"");
          if((result===true||result==="already-commented")&&groupDone<cfg.perGroup&&currentPath!==wantedPath){
            await safeGroupNavigate(group.url,"comment",activeRunId,"quay lại nhóm sau khi comment");
            return;
          }
          if(groupDone<cfg.perGroup&&!await groupCommentSleep(rand(cfg.minDelay*1000,cfg.maxDelay*1000),activeRunId))return;
        }
        if(groupDone<cfg.perGroup){
          // Facebook often leaves the same visible cards in place while the
          // next batch is still loading. Give the group feed several bounded
          // scroll/load rounds before concluding there are no more candidates;
          // two rounds was too short on a slow connection and could end a
          // configured 5-post run while the third card was arriving.
          // The cap still prevents an unchanged DOM from running forever.
          noProgressRounds=groupDone===groupDoneBeforeRound?noProgressRounds+1:0;
          if(noProgressRounds>=6)break;
          window.scrollBy(0,innerHeight*.9);
          if(!await groupCommentSleep(2500,activeRunId))return;
        }
      }
      if(!await groupCommentRunActive(activeRunId))return;
      index++;
      await chrome.storage.local.set({groupCommentIndex:index,groupCommentDone:totalDone,groupCommentCurrentGroupIndex:index,groupCommentCurrentGroupDone:0,groupCommentProcessedKeys:[],groupCommentRetryCounts:{},groupCommentSkipped:skipped,groupCommentHistory:commentHistory,groupCommentStatus:t("gi2.commentGroupDone",{name:group.name,done:groupDone,per:cfg.perGroup,suffix:skipSummary()})});
      if(index<cfg.groups.length){
        if(!await groupCommentSleep(rand(cfg.minDelay*1000,cfg.maxDelay*1000),activeRunId))return;
        if(!await groupCommentRunActive(activeRunId))return;
        await safeGroupNavigate(cfg.groups[index].url,"comment",activeRunId,"sang nhóm kế tiếp");
      }else if(await groupCommentRunActive(activeRunId)){
        await chrome.storage.local.set({groupCommentActive:false,groupCommentStatus:t("gi2.commentAllDone",{n:cfg.groups.length,done:totalDone,suffix:skipSummary()})});
      }
    }finally{
      isGroupCommenting=false;
      const next=await chrome.storage.local.get(["groupCommentActive","groupCommentRunId"]);
      if(next.groupCommentActive&&next.groupCommentRunId&&next.groupCommentRunId!==activeRunId)setTimeout(continueGroupComment,0);
    }
  }

  let isGroupPosting=false,groupPostStopRequested=false;
  const GROUP_POST_AUTO={
    interGroupMin:25,interGroupMax:45,
    afterPostMin:8,afterPostMax:12,
    afterBgMin:3,afterBgMax:5,
    typingMin:60,typingMax:130,
    beforePostMin:3,beforePostMax:6,
    groupReadyWait:45000,groupStableWait:1600,
    composerOpenWait:45000,composerReadyWait:45000,
    paletteWait:20000,backgroundConfirmWait:20000,submitWait:30000,
    postVisibleWait:30000,contentVerifyWait:20000
  };
  async function groupPostRunActive(runId){
    if(groupPostStopRequested)return false;
    const live=await chrome.storage.local.get(["groupPostActive","groupPostRunId"]);
    return !!live.groupPostActive&&!!runId&&live.groupPostRunId===runId;
  }
  async function groupPostSleep(ms,runId=""){
    const end=Date.now()+ms;
    while(Date.now()<end){
      if(groupPostStopRequested||(runId&&!await groupPostRunActive(runId)))return false;
      await sleep(Math.min(250,end-Date.now()));
    }
    return !groupPostStopRequested&&(!runId||await groupPostRunActive(runId));
  }
  async function waitForGroupPostSchedule(nextAt,index,total,name,runId=""){
    while(Date.now()<nextAt){
      if(groupPostStopRequested||(runId&&!await groupPostRunActive(runId)))return false;
      const live=await chrome.storage.local.get(["groupPostActive","groupPostRunId"]);
      if(!live.groupPostActive||(runId&&live.groupPostRunId!==runId))return false;
      const seconds=Math.max(1,Math.ceil((nextAt-Date.now())/1000));
      await chrome.storage.local.set({groupPostStatus:t("gp2.waitPost",{s:seconds,i:index+1,t:total,name:name})});
      await sleep(Math.min(1000,Math.max(1,nextAt-Date.now())));
    }
    return !groupPostStopRequested&&(!runId||await groupPostRunActive(runId));
  }
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==="local"&&changes.groupPostActive?.newValue===false)groupPostStopRequested=true;});
  const GROUP_POST_COLOR_NAMES={pink:"hồng",green:"xanh lá",red:"đỏ",orange:"cam",yellow:"vàng",blue:"xanh dương",purple:"tím",burgundy:"đỏ thẫm",beige:"be",brown:"nâu",gray:"xám",black:"đen"};
  function groupPostColorName(color){const key="c.color"+String(color||"").charAt(0).toUpperCase()+String(color||"").slice(1);return GROUP_POST_COLOR_NAMES[color]?t(key):t("gp2.colorPlain");}
  function normalizeGroupPostBackground(input){
    const allowed=Object.keys(GROUP_POST_COLOR_NAMES),chosen=Array.isArray(input?.colors)?input.colors.filter(c=>allowed.includes(c)):[];
    const colors=chosen.length?[...new Set(chosen)]:allowed;
    const mode=input?.mode==="fixed"?"fixed":"random",fixedColor=allowed.includes(input?.fixedColor)?input.fixedColor:"pink";
    // Tôn trọng lựa chọn bật/tắt nền; khi bật nền, nhóm không có bảng màu sẽ được bỏ qua.
    const enabled=input?.enabled!==false;
    return {enabled,mode,fixedColor,colors,maxChars:Math.min(130,Math.max(40,parseInt(input?.maxChars)||100)),fallback:"skip",afterBgMin:GROUP_POST_AUTO.afterBgMin,afterBgMax:GROUP_POST_AUTO.afterBgMax,typingMin:GROUP_POST_AUTO.typingMin,typingMax:GROUP_POST_AUTO.typingMax,beforePostMin:GROUP_POST_AUTO.beforePostMin,beforePostMax:GROUP_POST_AUTO.beforePostMax};
  }
  function chooseGroupPostColor(background,lastColor){
    if(background.mode==="fixed")return background.fixedColor;
    const valid=(background.colors||[]).filter(c=>GROUP_POST_COLOR_NAMES[c]);
    const pool=valid.length>1?valid.filter(c=>c!==lastColor):valid;
    return pool.length?pool[Math.floor(Math.random()*pool.length)]:"";
  }
  function findVisibleButton(root,patterns){
    return [...(root||document).querySelectorAll('[role="button"],button')].find(el=>{
      if(!isRenderedElement(el))return false;
      const label=buttonLabel(el);
      return patterns.some(pattern=>pattern.test(label));
    })||null;
  }
  function isViewportInteractive(el){
    if(!isRenderedElement(el))return false;
    const r=el.getBoundingClientRect();
    if(r.right<=0||r.bottom<=0||r.left>=innerWidth||r.top>=innerHeight)return false;
    const x=Math.max(0,Math.min(innerWidth-1,r.left+r.width/2)),y=Math.max(0,Math.min(innerHeight-1,r.top+r.height/2));
    const hit=document.elementFromPoint(x,y);
    return !!hit&&(el.contains(hit)||hit.contains(el));
  }
  function isInsideViewport(el){
    if(!isRenderedElement(el))return false;
    const r=el.getBoundingClientRect();
    return r.right>0&&r.bottom>0&&r.left<innerWidth&&r.top<innerHeight;
  }
  async function waitGroupPostCondition(predicate,timeoutMs=3000){
    const end=Date.now()+timeoutMs;
    while(Date.now()<end){
      if(groupPostStopRequested)return false;
      try{if(await predicate())return true;}catch(_){ }
      await sleep(180);
    }
    return false;
  }
  async function clickGroupPostControl(el,predicate,timeoutMs=3000,fallbackDelayMs=900){
    if(!el?.isConnected)return false;
    el.scrollIntoView({block:"center",inline:"center"});await sleep(220);
    try{el.click();}catch(_){ }
    const firstWait=Math.min(timeoutMs,Math.max(300,fallbackDelayMs));
    if(await waitGroupPostCondition(predicate,firstWait))return true;
    if(!el.isConnected)return false;
    try{await trustedMouse(el,"click");}catch(_){return false;}
    return waitGroupPostCondition(predicate,Math.max(300,timeoutMs-firstWait));
  }
  async function pacedGroupPostWait(minSeconds,maxSeconds,label,runId=""){
    const total=rand(Math.max(1,minSeconds)*1000,Math.max(minSeconds,maxSeconds)*1000),end=Date.now()+total;
    while(Date.now()<end){
      if(groupPostStopRequested||(runId&&!await groupPostRunActive(runId)))return false;
      const left=Math.max(1,Math.ceil((end-Date.now())/1000));
      await chrome.storage.local.set({groupPostStatus:t("gp2.waitLeft",{label:label,left:left})});
      await sleep(Math.min(500,Math.max(1,end-Date.now())));
    }
    return !groupPostStopRequested&&(!runId||await groupPostRunActive(runId));
  }
  function isDecorativeGroupPostBackground(label){
    const text=String(label||"").toLowerCase();
    // The configured palette is explicitly for Facebook's solid colors.
    // Gradient/illustration labels often contain a solid-color word (for
    // example "vàng, cam sang hồng"). Treat those words as non-matches so
    // random mode cannot keep selecting the same decorative card.
    return /gradient|chuyển\s*sắc|nền\s*chuyển\s*màu|hình\s*minh\s*họa|illustration/.test(text);
  }
  function backgroundLabelScore(color,label){
    const text=String(label||"").toLowerCase();
    if(!/phông nền|background/.test(text))return -1;
    if(isDecorativeGroupPostBackground(text))return -1;
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
    if(/chuyển sắc|gradient|minh họa.*(?:hoa|trái tim|sóng|đồi|cát)/.test(text))score-=35;
    if(/nhạt|light/.test(text))score-=8;
    if(/sẫm|thẫm|dark/.test(text))score-=4;
    if(new RegExp(`màu ${GROUP_POST_COLOR_NAMES[color]},`).test(text))score+=15;
    return score;
  }
  function findBackgroundChooser(){
    const isColorButton=el=>{
      // Palette items can be below the visible fold while Facebook is
      // animating the composer. They are still valid controls; the click
      // helper scrolls the chosen item into view before activating it.
      if(!isRenderedElement(el))return false;
      const label=buttonLabel(el).toLowerCase();
      return /phông nền|background/.test(label)&&!/^không có phông nền$|^no background$/.test(label)&&!/^(?:ẩn|hiển thị) các lựa chọn phông nền$/.test(label)&&!/^(?:tùy chọn phông nền|background options)$/.test(label);
    };
    const colors=[...document.querySelectorAll('[role="button"],button')].filter(isColorButton);
    if(!colors.length)return null;
    // Facebook thường không render tiêu đề “Chọn phông nền”; bảng màu chỉ
    // còn các nút aria-label “..., phông nền, phông nền N”. Tìm tổ tiên nhỏ
    // nhất chứa cả cụm nút màu thay vì phụ thuộc vào một tiêu đề dễ đổi.
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
  function findSolidBackgroundRoot(chooser){
    if(!chooser)return null;
    const heading=[...chooser.querySelectorAll('[role="heading"],h1,h2,h3')].find(h=>/^(một màu trơn|solid colors?)$/.test(buttonLabel(h)));
    if(!heading)return chooser;
    let node=heading.parentElement;
    for(let depth=0;node&&node!==chooser&&depth<7;depth++,node=node.parentElement){
      const count=[...node.querySelectorAll('[role="button"],button')].filter(b=>/phông nền|background/.test(buttonLabel(b))).length;
      if(count>=4&&count<=40)return node;
    }
    return chooser;
  }
  async function closeBackgroundChooserOnly(){
    const chooser=findBackgroundChooser();
    const back=chooser&&findVisibleButton(chooser,[/^(quay lại|back)$/]);
    if(!back)return;
    await clickGroupPostControl(back,()=>!findBackgroundChooser(),2000);
  }
  async function closeBackgroundPickerToPlain(dialog){
    await closeBackgroundChooserOnly();
    const noBackground=findVisibleButton(dialog,[/^(không có phông nền|no background)$/]);
    if(noBackground)await clickGroupPostControl(noBackground,()=>{
      const live=findGroupPostDialog(),box=live&&findGroupPostEditor(live);return !box||!editorStillHasBackground(box,live);
    },2000);
  }
  function groupPostBackgroundApplied(color,dialog){
    const live=findGroupPostDialog()||dialog,box=live&&findGroupPostEditor(live);
    const selectedPreview=[...(live||document).querySelectorAll('[role="button"],button')].some(b=>{
      const label=buttonLabel(b);
      const selected=b.getAttribute("aria-current")==="true"||b.getAttribute("aria-pressed")==="true"||b.getAttribute("data-selected")==="true";
      const matches=color==="auto"?/phông nền\s+\d+\s*$|background\s+\d+\s*$/.test(label):backgroundLabelScore(color,label)>=0;
      // A visible palette item is not proof that it was selected.  Facebook
      // can leave every color rendered while the editor still has the old
      // background, which made random mode appear stuck on one color.
      return isRenderedElement(b)&&matches&&selected;
    });
    return selectedPreview||!!(box&&editorStillHasBackground(box,live));
  }
  async function applyGroupPostBackground(dialog,preferredColor,allowedColors,lastColor=""){
    const expanded=findVisibleButton(dialog,[/^(ẩn các lựa chọn phông nền|hide background options)$/]);
    const toggle=findVisibleButton(dialog,[/^(hiển thị các tùy chọn phông nền|show background options)$/]);
    if(!expanded&&!toggle)return {applied:false,reason:t("gp2.errNoPaletteBtn")};
    await chrome.storage.local.set({groupPostStatus:t("gp2.paletteOpening")});
    console.log("[GroupPost] background palette requested");
    if(!expanded&&!await clickGroupPostControl(toggle,()=>!!findVisibleButton(dialog,[/^(ẩn các lựa chọn phông nền|hide background options)$/]),GROUP_POST_AUTO.paletteWait,1500))return {applied:false,reason:t("gp2.errPaletteClosed")};
    let chooserBefore=null;
    await waitGroupPostCondition(()=>!!(chooserBefore=findBackgroundChooser()),GROUP_POST_AUTO.paletteWait);
    const more=findVisibleButton(dialog,[/^(tùy chọn phông nền|background options)$/]);
    // Một số phiên bản Facebook hiển thị sẵn toàn bộ màu ngay sau khi bật
    // toggle; không bấm “Tùy chọn phông nền” lần nữa vì thao tác đó sẽ đóng
    // bảng màu vừa mở.
    if(!chooserBefore&&more&&!await clickGroupPostControl(more,()=>!!findBackgroundChooser(),GROUP_POST_AUTO.paletteWait,1500))return {applied:false,reason:t("gp2.errPalettePartial")};
    const chooser=findBackgroundChooser(),root=findSolidBackgroundRoot(chooser)||dialog;
    const paletteButtons=[...((root||dialog).querySelectorAll('[role="button"],button'))].filter(b=>isRenderedElement(b)&&/phông nền|background/i.test(buttonLabel(b)));
    console.log(`[GroupPost] palette candidates ${paletteButtons.length}`);
    const ordered=[...(allowedColors||[])].filter((c,i,a)=>GROUP_POST_COLOR_NAMES[c]&&a.indexOf(c)===i);
    const availableByColor=new Map();
    for(const color of ordered){
      const candidates=[...root.querySelectorAll('[role="button"],button')].map(button=>({button,score:backgroundLabelScore(color,buttonLabel(button))})).filter(item=>item.score>=0).sort((a,b)=>b.score-a.score);
      if(candidates[0])availableByColor.set(color,candidates[0]);
    }
    const available=[...availableByColor.entries()].map(([color,item])=>({color,...item}));
    console.log(`[GroupPost] solid backgrounds available ${available.map(item=>item.color).join(",")||"none"}`);
    let selected=null,selectedColor="",selectedScore=-1;
    // Keep the configured random choice when that solid color exists. If the
    // current group exposes a smaller palette, choose randomly from the
    // available solid colors instead of falling through the configured color
    // list in a fixed order (which previously caused repeated red posts).
    const preferred=preferredColor&&availableByColor.get(preferredColor);
    if(preferred){selected=preferred.button;selectedColor=preferredColor;selectedScore=preferred.score;}
    else if(available.length){
      const nonRepeat=lastColor?available.filter(item=>item.color!==lastColor):available;
      const pool=nonRepeat.length?nonRepeat:available;
      const picked=pool[Math.floor(Math.random()*pool.length)];
      selected=picked.button;selectedColor=picked.color;selectedScore=picked.score;
    }
    if(!selected){
      // Nếu nhóm có bảng nền nhưng không có đúng màu đã tích, vẫn chọn một
      // nền khả dụng để không bỏ qua nhầm nhóm có thể đăng kèm nền.
      const fallback=paletteButtons.map(button=>{
        if(!isRenderedElement(button))return null;
        const label=buttonLabel(button);
        if(!/phông nền|background/.test(label)||isDecorativeGroupPostBackground(label)||/^không có phông nền$|^no background$/.test(label)||/^(?:ẩn|hiển thị) các lựa chọn phông nền$/.test(label)||/^(?:tùy chọn phông nền|background options)$/.test(label))return null;
        const detectedColor=Object.keys(GROUP_POST_COLOR_NAMES).find(color=>backgroundLabelScore(color,label)>=0)||"auto";
        return {button,color:detectedColor,score:detectedColor==="auto"?1:backgroundLabelScore(detectedColor,label)};
      }).filter(Boolean);
      // If the selected colors are not offered by this group, choose a
      // random *solid* fallback. Never use the first palette item: Facebook
      // often puts a decorative gradient first, which looked like a fixed
      // color across the whole run.
      if(fallback.length){
        const nonRepeat=lastColor?fallback.filter(item=>item.color!==lastColor):fallback;
        const pool=nonRepeat.length?nonRepeat:fallback;
        const picked=pool[Math.floor(Math.random()*pool.length)];
        selected=picked.button;selectedColor=picked.color;selectedScore=picked.score;
      }
    }
    if(!selected){await closeBackgroundPickerToPlain(dialog);return {applied:false,reason:t("gp2.errNoColor")};}
    await chrome.storage.local.set({groupPostStatus:t("gp2.picking",{color:groupPostColorName(selectedColor)})});
    console.log(`[GroupPost] selecting background ${selectedColor}`);
    if(!await clickGroupPostControl(selected,()=>groupPostBackgroundApplied(selectedColor,dialog),GROUP_POST_AUTO.backgroundConfirmWait,1800)){
      await closeBackgroundPickerToPlain(dialog);return {applied:false,reason:t("gp2.errNoConfirm",{color:groupPostColorName(selectedColor)})};
    }
    await closeBackgroundChooserOnly();
    await chrome.storage.local.set({groupPostStatus:t("gp2.pickedReady",{color:groupPostColorName(selectedColor)})});
    console.log(`[GroupPost] background confirmed ${selectedColor}`);
    return {applied:true,color:selectedColor,label:buttonLabel(selected),score:selectedScore};
  }
  function findGroupPostEditor(dialog){
    return [...dialog.querySelectorAll('[contenteditable="true"][role="textbox"],[contenteditable="true"]')].find(b=>isRenderedElement(b)&&!/bình luận|comment/.test((b.getAttribute("aria-label")||"").toLowerCase()))||null;
  }
  function editorStillHasBackground(box,dialog){
    let node=box;
    for(let depth=0;node&&node!==dialog&&depth<8;depth++,node=node.parentElement){
      const style=getComputedStyle(node),image=style.backgroundImage,color=style.backgroundColor;
      if(image&&image!=="none")return true;
      if(color&&!/^(?:rgba?\(0, 0, 0, 0\)|transparent|rgb\(255, 255, 255\)|rgb\(240, 242, 245\))$/.test(color))return true;
    }
    return false;
  }
  function findGroupPostDialog(){
    const dialogs=[...document.querySelectorAll('[role="dialog"]')].filter(isRenderedElement);
    return dialogs.find(d=>{
      if(!findGroupPostEditor(d))return false;
      const text=(d.innerText||d.getAttribute("aria-label")||"").toLowerCase();
      if(/tạo bài viết|create post/.test(text))return true;
      const hasPostButton=!!findVisibleButton(d,[/^(đăng|post)$/]);
      const hasPostTools=!!findVisibleButton(d,[/phông nền|background/,/thêm vào bài viết|add to your post/]);
      return hasPostButton&&hasPostTools;
    })||null;
  }
  async function waitForGroupPostComposer(timeoutMs=10000,stableMs=700){
    const end=Date.now()+timeoutMs;
    let stableDialog=null,stableBox=null,stableSince=0;
    while(Date.now()<end){
      if(groupPostStopRequested)return null;
      if(findGroupWelcomeDialog()){
        await dismissGroupWelcomeDialog();
        await sleep(250);
        continue;
      }
      const dialog=findGroupPostDialog(),box=dialog&&findGroupPostEditor(dialog);
      if(dialog&&box){
        if(dialog===stableDialog&&box===stableBox){if(Date.now()-stableSince>=stableMs)return {dialog,box};}
        else{stableDialog=dialog;stableBox=box;stableSince=Date.now();}
      }else{stableDialog=null;stableBox=null;stableSince=0;}
      await sleep(250);
    }
    return null;
  }
  function findGroupPostOpener(){
    const labelMatches=label=>{
      const value=normalizedGroupPostText(label).replace(/[.…]+$/g,"").trim();
      return /^(?:bạn\s+(?:đang\s+)?(?:viết|bán)\s+gì(?:\s+đi)?(?:\s+thế)?\s*\??|bạn\s+đang\s+nghĩ\s+gì(?:\s+thế)?\s*\??|viết\s+gì\s+đó\s*\.?|tạo\s+bài\s+viết|write\s+something|create\s+post)$/i.test(value);
    };
    const roots=[document.querySelector('[role="main"]'),document.body].filter(Boolean);
    const candidates=[];
    for(const root of roots){
      for(const el of root.querySelectorAll('[role="button"],button,[tabindex],div,span')){
        if(!isRenderedElement(el)||el.closest('[role="dialog"]'))continue;
        const label=buttonLabel(el);
        if(!labelMatches(label)||label.length>80)continue;
        const r=el.getBoundingClientRect();
        if(r.width<20||r.height<10)continue;
        const clickable=el.matches('[role="button"],button,[tabindex]')?el:(el.closest('[role="button"],button,[tabindex]')||el);
        if(!candidates.some(c=>c===clickable))candidates.push(clickable);
      }
      if(candidates.length)break;
    }
    return candidates.sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top)[0]||null;
  }
  function normalizedGroupPostText(value){
    return String(value||"").replace(/[\u200B-\u200D\u2060\uFEFF]/g,"").replace(/\s+/g," ").trim();
  }
  async function clearGroupPostDraft(box,runId=""){
    if(!box?.isConnected)return false;
    const read=()=>normalizedGroupPostText(box.innerText||box.textContent||box.value||"");
    if(!read())return true;
    try{box.focus();box.click();}catch(_){ }
    if(document.activeElement!==box&&!box.contains(document.activeElement)){
      try{await trustedMouse(box,"click");}catch(_){ }
    }
    if(document.activeElement!==box&&!box.contains(document.activeElement))return false;
    const selectModifier=/Mac|iPhone|iPad/i.test(navigator.platform||"")?4:2;
    try{await chrome.runtime.sendMessage({action:"trustedKey",key:"a",code:"KeyA",windowsVirtualKeyCode:65,modifiers:selectModifier,abortStorageKey:"groupPostActive",abortRunId:runId});}catch(_){ }
    try{await chrome.runtime.sendMessage({action:"trustedKey",key:"Backspace",code:"Backspace",windowsVirtualKeyCode:8,abortStorageKey:"groupPostActive",abortRunId:runId});}catch(_){ }
    await sleep(250);
    let liveDialog=findGroupPostDialog(),liveBox=liveDialog&&findGroupPostEditor(liveDialog)||box;
    let remaining=normalizedGroupPostText(liveBox?.innerText||liveBox?.textContent||liveBox?.value||"");
    if(remaining){
      try{
        const selection=window.getSelection(),range=document.createRange();
        range.selectNodeContents(liveBox);selection.removeAllRanges();selection.addRange(range);
        document.execCommand("delete",false,null);
        liveBox.dispatchEvent(new InputEvent("input",{bubbles:true,inputType:"deleteContentBackward",data:null}));
      }catch(_){ }
      await sleep(250);
      liveDialog=findGroupPostDialog();liveBox=liveDialog&&findGroupPostEditor(liveDialog)||liveBox;
      remaining=normalizedGroupPostText(liveBox?.innerText||liveBox?.textContent||liveBox?.value||"");
    }
    return !remaining;
  }
  async function typeGroupPostContent(box,content,minDelay,maxDelay,runId=""){
    const expected=normalizedGroupPostText(content),prefix=expected.slice(0,40);
    try{box.focus();box.click();}catch(_){ }
    if(document.activeElement!==box&&!box.contains(document.activeElement)){
      try{await trustedMouse(box,"click");}catch(_){ }
    }
    if(document.activeElement!==box&&!box.contains(document.activeElement))return {ok:false,error:t("gp2.noCursor")};
    // Facebook can restore a draft from an earlier failed/aborted attempt.
    // Clear it before typing so retries never concatenate two posts.
    if(!await clearGroupPostDraft(box,runId))return {ok:false,error:t("gp2.draftBusy")};
    for(const char of String(content||"")){
      if(groupPostStopRequested||(runId&&!await groupPostRunActive(runId)))return {ok:false,error:t("bg.stoppedTyping")};
      if(!box.isConnected)break;
      let inserted=false;
      try{inserted=!!document.execCommand("insertText",false,char);}catch(_){ }
      if(!inserted)break;
      if(!await groupPostSleep(rand(minDelay,maxDelay),runId))return {ok:false,error:t("bg.stoppedTyping")};
    }
    await sleep(350);
    let composer=await waitForGroupPostComposer(GROUP_POST_AUTO.contentVerifyWait,250),liveBox=composer?.box;
    let actual=normalizedGroupPostText(liveBox?.innerText||liveBox?.textContent);
    if(prefix&&actual.includes(prefix))return {ok:true,composer,actual};
    // Chỉ dùng bộ gõ hệ thống khi ô thật sự trống để không chèn lặp nội dung.
    if(!actual){
      liveBox=liveBox||box;
      try{liveBox.focus();liveBox.click();}catch(_){ }
      const typed=await chrome.runtime.sendMessage({action:"trustedInput",text:content,pressEnter:false,typingMinDelay:minDelay,typingMaxDelay:maxDelay});
      if(!typed?.ok)return {ok:false,error:typed?.error||t("gp2.typeFailText")};
      await sleep(500);
      composer=await waitForGroupPostComposer(GROUP_POST_AUTO.contentVerifyWait,250);liveBox=composer?.box;
      actual=normalizedGroupPostText(liveBox?.innerText||liveBox?.textContent);
      if(prefix&&actual.includes(prefix))return {ok:true,composer,actual};
    }
    return {ok:false,error:actual?t("gp2.partialContent"):t("gp2.noContent")};
  }
  async function dismissGroupPostComposer(){
    await closeBackgroundChooserOnly();
    let dialog=findGroupPostDialog();
    if(dialog){
      const close=findVisibleButton(dialog,[/^(đóng|close)$/,/(đóng|close).*(tạo bài viết|create post|hộp thoại|dialog)/]);
      if(close)await clickGroupPostControl(close,()=>!findGroupPostDialog(),2200,700);
    }
    const discard=findVisibleButton(document,[/^(bỏ|bỏ bài viết|bỏ bản nháp|discard|discard post)$/]);
    if(discard)await clickGroupPostControl(discard,()=>!findGroupPostDialog(),2200,700);
    return !findGroupPostDialog();
  }
  function findGroupWelcomeDialog(){
    const dialogs=[...document.querySelectorAll('[role="dialog"]')].filter(isRenderedElement);
    return dialogs.find(dialog=>{
      if(findGroupPostEditor(dialog))return false;
      const text=normalizedGroupPostText(dialog.innerText||dialog.textContent||dialog.getAttribute("aria-label")||"").toLowerCase();
      // Facebook shows a first-visit welcome card over some groups. It blocks
      // the composer until it is closed, but is unrelated to the post itself.
      if(!/chào mừng(?: bạn)?(?: đến với)?|welcome(?:\s+to)?/.test(text))return false;
      // Keep this scoped to a dismissible welcome card. Other Facebook
      // dialogs (reports, post composer, etc.) must never be closed here.
      return !!findVisibleButton(dialog,[/^(đóng|close)$/i,/(?:đóng|close).*(?:hộp thoại|dialog|cửa sổ)/i,/^(tiếp|next)$/i]);
    })||null;
  }
  async function dismissGroupWelcomeDialog(){
    for(let attempt=0;attempt<3;attempt++){
      const dialog=findGroupWelcomeDialog();
      if(!dialog)return true;
      const close=findVisibleButton(dialog,[/^(đóng|close)$/i,/(?:đóng|close).*(?:hộp thoại|dialog|cửa sổ)/i]);
      const next=!close&&findVisibleButton(dialog,[/^(tiếp|next)$/i]);
      const control=close||next;
      if(!control)break;
      console.log(`[GroupPost] ${close?"closing":"advancing"} group welcome dialog`);
      await clickGroupPostControl(control,()=>!findGroupWelcomeDialog(),3500,700);
      if(!findGroupWelcomeDialog())return true;
      await sleep(250);
    }
    return !findGroupWelcomeDialog();
  }
  function groupPostSuccessConfirmed(dialog){
    if(!dialog?.isConnected||!isRenderedElement(dialog))return true;
    const statusText=[...document.querySelectorAll('[role="status"],[role="alert"]')]
      .filter(isRenderedElement).map(el=>normalizedGroupPostText(el.innerText||el.textContent)).join(" ").toLowerCase();
    // A disabled button or an emptied editor only says the click changed the
    // composer; it does not prove Facebook accepted the post.  Accept only a
    // closed composer or Facebook's explicit publish/review acknowledgement.
    return /(?:bài viết.{0,80}(?:đã (?:được )?đăng|đang chờ.{0,40}phê duyệt)|post.{0,80}(?:published|(?:is )?pending.{0,40}(?:review|approval)))/i.test(statusText);
  }
  function groupPostContentVisible(content){
    const expected=normalizedGroupPostText(content).slice(0,80).toLocaleLowerCase("vi");
    if(expected.length<10)return false;
    const main=document.querySelector('[role="main"]')||document.body;
    const mainText=normalizedGroupPostText(main.innerText||main.textContent||"").toLocaleLowerCase("vi");
    // A group can publish the post into the feed immediately while marking
    // it as pending moderator approval. Facebook renders that acknowledgement
    // in the post card, not in role=status/alert, so treat matching content
    // plus the explicit pending proof as visible instead of reporting a
    // false "accepted but not displayed" failure.
    if(mainText.includes(expected)&&/(?:bài viết.{0,100}đang chờ.{0,60}phê duyệt|post.{0,100}(?:pending|awaiting).{0,60}(?:review|approval))/i.test(mainText))return true;
    const feed=main.querySelector('[role="feed"]');
    const candidates=[...main.querySelectorAll('[role="article"],[data-pagelet^="FeedUnit_"],[data-ad-preview="message"]'),...(feed?[...feed.children]:[])];
    return candidates.some(node=>{
      if(!isRenderedElement(node)||node.closest('[role="dialog"]')||node.querySelector('[contenteditable="true"]'))return false;
      const text=normalizedGroupPostText(node.innerText||node.textContent).toLocaleLowerCase("vi");
      return text.includes(expected);
    });
  }
  async function waitForGroupPostDisplayed(content,groupName,runId,index){
    const deadline=Date.now()+GROUP_POST_AUTO.postVisibleWait,holdMs=rand(GROUP_POST_AUTO.afterPostMin*1000,GROUP_POST_AUTO.afterPostMax*1000);
    const started=Date.now();
    while(Date.now()<deadline){
      if(!await groupPostRunActive(runId))return false;
      const left=Math.max(1,Math.ceil((deadline-Date.now())/1000));
      await chrome.storage.local.set({groupPostStage:"waiting-visible",groupPostStatus:t("gp2.waitVisible",{name:groupName,left})});
      if(groupPostContentVisible(content)&&Date.now()-started>=holdMs){
        await chrome.storage.local.set({groupPostStage:"post-visible"});
        return true;
      }
      await sleep(500);
    }
    const error=new Error(t("gp2.postNotVisible",{name:groupName}));
    error.postDisplayUnconfirmed=true;
    throw error;
  }
  async function submitGroupPostOnce(postBtn,dialog,runId,index){
    if(!await groupPostRunActive(runId))return false;
    await chrome.storage.local.set({groupPostStage:"submit-armed",groupPostSubmitRunId:runId,groupPostSubmitIndex:index,groupPostSubmitDispatchedAt:0});
    if(!await groupPostRunActive(runId))return false;
    // One trusted click only.  Retrying the Post control after a slow UI
    // update can create duplicate posts, so an ambiguous result fails closed.
    if(!await trustedMouse(postBtn,"click",()=>groupPostRunActive(runId)))return false;
    if(!await groupPostRunActive(runId))return false;
    await chrome.storage.local.set({groupPostStage:"submit-dispatched",groupPostSubmitRunId:runId,groupPostSubmitIndex:index,groupPostSubmitDispatchedAt:Date.now()});
    const deadline=Date.now()+GROUP_POST_AUTO.submitWait;
    while(Date.now()<deadline){
      if(!await groupPostRunActive(runId))return false;
      if(groupPostSuccessConfirmed(dialog))return true;
      await sleep(400);
    }
    return groupPostSuccessConfirmed(dialog);
  }
  async function createGroupPost(content,backgroundInput={},preferredColor="",lastColor="",runId="",index=-1,groupName=""){
    const background=normalizeGroupPostBackground(backgroundInput);
    if(runId&&!await groupPostRunActive(runId))throw new Error(t("gp2.stoppedBeforePost"));
    // Dismiss Facebook's first-visit welcome card before looking for the
    // composer; otherwise the card can intercept the click and look like a
    // missing/incorrect "Tạo bài viết" button.
    await dismissGroupWelcomeDialog();
    const opener=findGroupPostOpener();if(!opener)throw new Error(t("gp2.noOpener"));
    console.log("[GroupPost] opening composer");
    if(!await clickGroupPostControl(opener,()=>!!findGroupPostDialog(),GROUP_POST_AUTO.composerOpenWait,1800))throw new Error(t("gp2.openFail"));
    let composer=await waitForGroupPostComposer(GROUP_POST_AUTO.composerReadyWait);
    if(!composer)throw new Error(t("gp2.composerLoading"));
    let {dialog,box}=composer;
    let backgroundResult={applied:false,color:"",reason:t("gp2.bgOff")};
    if(background.enabled){
      const usableColors=background.mode==="fixed"?[background.fixedColor]:background.colors;
      backgroundResult=await applyGroupPostBackground(dialog,preferredColor,usableColors,lastColor);
      if(!backgroundResult.applied){
        if(background.fallback==="skip")throw new Error(t("gp2.skippedBySetting",{reason:backgroundResult.reason}));
        throw new Error(t("gp2.noFill",{reason:backgroundResult.reason}));
      }
      if(backgroundResult.applied&&!await pacedGroupPostWait(background.afterBgMin,background.afterBgMax,t("gp2.restAfterBg",{color:groupPostColorName(backgroundResult.color)}),runId))throw new Error(t("gp2.stoppedAfterBg"));
    }
    composer=await waitForGroupPostComposer(GROUP_POST_AUTO.composerReadyWait);
    if(!composer)throw new Error(t("gp2.reloadInputFail"));
    ({dialog,box}=composer);
    box.scrollIntoView({block:"center"});await sleep(250);
    await chrome.storage.local.set({groupPostStatus:t("gp2.filling",{n:content.length})});
    const typed=await typeGroupPostContent(box,content,background.typingMin,background.typingMax,runId);
    if(!typed.ok)throw new Error(typed.error);
    console.log(`[GroupPost] content filled ${content.length} chars`);
    composer=typed.composer;
    if(!composer)throw new Error("Facebook làm mới ô nhập sau khi điền nội dung");
    ({dialog,box}=composer);
    if(backgroundResult.applied&&!editorStillHasBackground(box,dialog)){
      backgroundResult={applied:false,color:"",reason:t("gp2.bgDropped")};
      if(background.fallback==="skip")throw new Error(t("gp2.skippedBySetting",{reason:backgroundResult.reason}));
      throw new Error(t("gp2.stopAtGroup",{reason:backgroundResult.reason}));
    }
    let postBtn=null;
    for(let i=0;i<80&&!postBtn;i++){
      dialog=findGroupPostDialog()||dialog;
      postBtn=[...dialog.querySelectorAll('[role="button"],button')].find(b=>{
        const l=buttonLabel(b);return isRenderedElement(b)&&b.getAttribute("aria-disabled")!=="true"&&!b.disabled&&(l==="đăng"||l==="post");
      })||null;
      if(!postBtn)await sleep(250);
    }
    if(!postBtn)throw new Error(t("gp2.notReady"));
    if(!await pacedGroupPostWait(background.beforePostMin,background.beforePostMax,t("gp2.restBeforePost"),runId))throw new Error(t("gp2.stoppedBeforePost"));
    await chrome.storage.local.set({groupPostStatus:t("gp2.readyToPost")});
    // DỪNG BẰNG MỌI GIÁ: kiểm tra lại ngay trước cú bấm Đăng.
    if(groupPostStopRequested||(runId&&!await groupPostRunActive(runId)))throw new Error(t("gp2.stoppedBeforePost"));
    const submitted=await submitGroupPostOnce(postBtn,dialog,runId,index);
    if(!submitted)throw new Error(t("gp2.submitFail"));
    if(!await waitForGroupPostDisplayed(content,groupName,runId,index))throw new Error(t("gp2.submitFail"));
    console.log("[GroupPost] submit dispatched");
    return {ok:true,backgroundApplied:backgroundResult.applied,color:backgroundResult.color,reason:backgroundResult.reason};
  }
  function groupPostRouteIds(group){
    const ids=[];
    try{
      const raw=new URL(String(group?.url||""),location.href).pathname.match(/^\/groups\/([^/?#]+)/i)?.[1];
      if(raw)ids.push(String(raw).toLowerCase());
    }catch(_){ }
    const legacy=String(group?.id||"").trim().toLowerCase();
    if(legacy&&!ids.includes(legacy))ids.push(legacy);
    return ids;
  }
  function groupPostCurrentGroupMatches(group,currentId,wantedIds){
    if(currentId&&wantedIds.includes(currentId))return true;
    // Facebook có thể đổi slug thành ID số sau khi mở nhóm. Khi đó dùng tiêu đề
    // nhóm đang hiển thị để xác nhận đúng trang, không reload về chính nhóm đó.
    const expected=normalizedGroupPostText(group?.name).toLocaleLowerCase("vi");
    if(!expected||expected.length<2)return false;
    const candidates=[document.querySelector('h1'),document.querySelector('[role="main"] h1'),document.querySelector('meta[property="og:title"]')];
    return candidates.some(el=>{
      const value=el?.getAttribute?.("content")||el?.innerText||el?.textContent||"";
      const actual=normalizedGroupPostText(value).toLocaleLowerCase("vi");
      return actual===expected||actual.startsWith(`${expected} |`)||actual.includes(expected);
    });
  }
  async function waitForGroupPostGroupReady(group,runId,index,total){
    const deadline=Date.now()+GROUP_POST_AUTO.groupReadyWait;
    let lastMarker="",stableSince=0;
    while(Date.now()<deadline){
      if(!await groupPostRunActive(runId))return false;
      const ids=groupPostRouteIds(group),currentId=String(location.pathname.match(/^\/groups\/([^/?#]+)/i)?.[1]||"").toLowerCase();
      const matched=groupPostCurrentGroupMatches(group,currentId,ids),main=document.querySelector('[role="main"]'),heading=document.querySelector('h1,[role="main"] h1');
      if(matched&&main&&heading){
        await dismissGroupWelcomeDialog();
        const marker=`${currentId}|${normalizedGroupPostText(heading.innerText||heading.textContent)}|${main.childElementCount}`;
        if(marker===lastMarker&&Date.now()-stableSince>=GROUP_POST_AUTO.groupStableWait)return true;
        if(marker!==lastMarker){lastMarker=marker;stableSince=Date.now();}
      }else{lastMarker="";stableSince=0;}
      const left=Math.max(1,Math.ceil((deadline-Date.now())/1000));
      await chrome.storage.local.set({groupPostStatus:t("gp2.waitGroup",{i:index+1,t:total,name:group.name,left})});
      await sleep(500);
    }
    return false;
  }
  async function continueGroupPost(){
    if(isGroupPosting)return;
    isGroupPosting=true;
    let activeRunId="";
    try{
      const s=await chrome.storage.local.get(["groupPostActive","groupPostRunId","groupPostConfig","groupPostIndex","groupPostDone","groupPostSkipped","groupPostNextAt","groupPostLastColor","groupPostRetryCount","groupPostPendingContent","groupPostPendingIndex","groupPostStage","groupPostSubmitRunId","groupPostSubmitIndex","groupPostSubmitDispatchedAt"]);
      let cfg=s.groupPostConfig;
      if(!s.groupPostActive||!cfg?.groups?.length)return;
      activeRunId=String(s.groupPostRunId||cfg.runId||"");
      // Backward-compatible migration for an in-progress run from the
      // previous release.  New runs always receive a durable ID in popup.js.
      if(!activeRunId){
        activeRunId=`group-post-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
        cfg={...cfg,runId:activeRunId};
        await chrome.storage.local.set({groupPostRunId:activeRunId,groupPostConfig:cfg});
      }
      if(!await groupPostRunActive(activeRunId))return;
      let index=parseInt(s.groupPostIndex)||0,done=parseInt(s.groupPostDone)||0;
      let skipped=parseInt(s.groupPostSkipped)||0;
      // Reloading after the one Post click but before Facebook's confirmation
      // is ambiguous.  Stop at the same group rather than opening a second
      // composer and risking a duplicate post.
      if((s.groupPostStage==="submit-armed"||s.groupPostStage==="submit-dispatched"||s.groupPostStage==="waiting-visible"||s.groupPostStage==="post-visible")&&s.groupPostSubmitRunId===activeRunId&&Number(s.groupPostSubmitIndex)===index){
        await chrome.storage.local.set({groupPostActive:false,groupPostNextAt:0,groupPostStatus:t("gp2.stoppedAt",{name:cfg.groups[index]?.name||"",err:t("gp2.unconfirmed"),d:done,t:cfg.groups.length,s:skipped})});
        return;
      }
      if(index>=cfg.groups.length){await chrome.storage.local.set({groupPostActive:false,groupPostNextAt:0,groupPostSkipped:skipped,groupPostStatus:t("gp2.doneAll",{d:done,t:cfg.groups.length,s:skipped})});return;}
      const group=cfg.groups[index],wantedIds=groupPostRouteIds(group);
      const currentId=String(location.pathname.match(/^\/groups\/([^/?#]+)/i)?.[1]||"").toLowerCase();
      console.log(`[GroupPost] checking selected group index=${index+1}`);
      if(!wantedIds.length||!groupPostCurrentGroupMatches(group,currentId,wantedIds)){
        if(!await groupPostRunActive(activeRunId))return;
        await chrome.storage.local.set({groupPostStatus:t("gp2.openingGroup",{i:index+1,t:cfg.groups.length,name:group.name})});
        location.assign(group.url);return;
      }
      // Some groups display a welcome dialog only after the route settles.
      // Close it before waiting or opening the post composer.
      await dismissGroupWelcomeDialog();
      if(!await waitForGroupPostGroupReady(group,activeRunId,index,cfg.groups.length)){
        await chrome.storage.local.set({groupPostActive:false,groupPostNextAt:0,groupPostStatus:t("gp2.groupLoading")});
        return;
      }
      const nextAt=Number(s.groupPostNextAt)||0;
      if(nextAt>Date.now()&&!await waitForGroupPostSchedule(nextAt,index,cfg.groups.length,group.name,activeRunId))return;
      if(!await groupPostSleep(2200,activeRunId))return;
      await chrome.storage.local.set({groupPostStatus:t("gp2.aiWriting",{name:group.name})});
      const background=normalizeGroupPostBackground(cfg.background),preferredColor=background.enabled?chooseGroupPostColor(background,s.groupPostLastColor):"";
      let ai;
      if(Number(s.groupPostPendingIndex)===index&&String(s.groupPostPendingContent||"").trim())ai={ok:true,content:String(s.groupPostPendingContent).trim()};
      else{
        ai=await chrome.runtime.sendMessage({action:"aiGenerateGroupPost",groupName:group.name,prompt:cfg.prompt,aiConfig:cfg.aiConfig,background});
        if(ai?.ok&&await groupPostRunActive(activeRunId))await chrome.storage.local.set({groupPostPendingContent:ai.content,groupPostPendingIndex:index});
      }
      if(!ai?.ok)throw new Error(ai?.error||t("p.gpAiFail"));
      console.log(`[GroupPost] AI content ready index=${index+1}`);
      if(!await groupPostRunActive(activeRunId))return;
      console.log(`[GroupPost] preparing composer index=${index+1}`);
      const colorText=preferredColor?` ${t("gp2.withBg",{color:groupPostColorName(preferredColor)})}`:"";
      await chrome.storage.local.set({groupPostStatus:t("gp2.posting",{len:ai.content.length,color:colorText,name:group.name})});
      let completedCurrent=false,skippedCurrent=false;
      for(let attempt=1;attempt<=3&&!completedCurrent&&!skippedCurrent;attempt++){
        await chrome.storage.local.set({groupPostRetryCount:attempt-1,groupPostStatus:t("gp2.retrying",{n:attempt,name:group.name})});
        try{
          const posted=await createGroupPost(ai.content,background,preferredColor,s.groupPostLastColor,activeRunId,index,group.name);
          if(!await groupPostRunActive(activeRunId))return;
          done++;completedCurrent=true;
          const detail=posted.backgroundApplied?t("gp2.bgDetail",{color:groupPostColorName(posted.color)}):t("gp2.plainPost");
          await chrome.storage.local.set({groupPostDone:done,groupPostLastColor:posted.backgroundApplied?posted.color:s.groupPostLastColor||"",groupPostRetryCount:0,groupPostPendingContent:"",groupPostPendingIndex:-1,groupPostStage:"",groupPostSubmitRunId:"",groupPostSubmitIndex:-1,groupPostSubmitDispatchedAt:0,groupPostStatus:t("gp2.posted",{d:done,t:cfg.groups.length,detail:detail,name:group.name})});
          console.log(`[GroupPost] posted ${done}/${cfg.groups.length} background=${posted.backgroundApplied?posted.color:"plain"}`);
          // waitForGroupPostDisplayed đã vừa xác minh bài trong feed vừa giữ
          // nguyên nhóm 8–12 giây; không chờ lặp thêm ở đây.
        }catch(e){
          if(!await groupPostRunActive(activeRunId))return;
          const explicitSkip=/đã bỏ qua theo cài đặt|skipped per setting/i.test(e.message);
          const skippableGroupError=/không tìm thấy nút tạo bài viết|không bấm được nút tạo bài viết|chưa tải xong cửa sổ tạo bài viết|chưa tải lại ô nhập|nhóm không có nút chọn nền màu|không mở được bảng nền màu|chưa mở toàn bộ bảng màu|không tìm thấy màu nền|không xác nhận nền|create-post button not found|could not click the create-post button|did not load the composer in time|did not reload the input after background pick|no background palette button|could not open the background palette|did not open the full palette|no usable background color|did not confirm the .* background/i.test(String(e.message||""));
          const mayAlreadyBePosted=e.postDisplayUnconfirmed||/chưa xác nhận đăng bài|không nhận thao tác bấm nút đăng|hasn't confirmed the post|did not accept the Post click/i.test(e.message);
          console.log(`[GroupPost] attempt ${attempt}/3 failed index=${index+1}: ${String(e.message||" lỗi không rõ").slice(0,180)}`);
          if(explicitSkip){
            skippedCurrent=true;
            skipped++;
            await dismissGroupPostComposer();
            await chrome.storage.local.set({groupPostSkipped:skipped,groupPostRetryCount:0,groupPostPendingContent:"",groupPostPendingIndex:-1,groupPostStatus:t("gp2.skippedWithErr",{name:group.name,err:e.message,d:done,t:cfg.groups.length,s:skipped})});
            break;
          }
          if(skippableGroupError&&attempt>=2){
            skippedCurrent=true;
            skipped++;
            await dismissGroupPostComposer();
            await chrome.storage.local.set({groupPostSkipped:skipped,groupPostRetryCount:0,groupPostPendingContent:"",groupPostPendingIndex:-1,groupPostStatus:t("gp2.skippedGroup",{name:group.name,err:e.message,d:done,t:cfg.groups.length,s:skipped})});
            console.log(`[GroupPost] skipped index=${index+1} reason=${String(e.message||" lỗi không rõ").slice(0,160)}`);
            break;
          }
          if(mayAlreadyBePosted||attempt>=3){
            await chrome.storage.local.set({groupPostActive:false,groupPostNextAt:0,groupPostIndex:index,groupPostRetryCount:attempt,groupPostStatus:t("gp2.stoppedAt",{name:group.name,err:e.message,d:done,t:cfg.groups.length,s:skipped})});
            return;
          }
          const closed=await dismissGroupPostComposer();
          if(!closed){
            await chrome.storage.local.set({groupPostActive:false,groupPostNextAt:0,groupPostIndex:index,groupPostRetryCount:attempt,groupPostStatus:t("gp2.stoppedDraft",{name:group.name,err:e.message})});
            return;
          }
          await chrome.storage.local.set({groupPostStatus:t("gp2.retryWait",{n:attempt,err:e.message})});
          if(!await pacedGroupPostWait(2,3,t("gp2.reopenComposer"),activeRunId))return;
        }
      }
      if(!completedCurrent&&!skippedCurrent)return;
      index++;
      if(index<cfg.groups.length&&await groupPostRunActive(activeRunId)){
        const configuredDelay=Number(cfg.interGroupDelay);
        const delaySeconds=Number.isFinite(configuredDelay)&&configuredDelay>=5?Math.min(3600,configuredDelay):rand(GROUP_POST_AUTO.interGroupMin,GROUP_POST_AUTO.interGroupMax);
        const nextRun=Date.now()+delaySeconds*1000;
        await chrome.storage.local.set({groupPostIndex:index,groupPostNextAt:nextRun,groupPostRetryCount:0,groupPostPendingContent:"",groupPostPendingIndex:-1,groupPostStatus:t("gp2.nextGroup",{d:done,t:cfg.groups.length,delay:Math.round(delaySeconds),next:cfg.groups[index].name,s:skipped})});
        const live=await chrome.storage.local.get(["groupPostActive","groupPostRunId"]);
        if(live.groupPostActive&&live.groupPostRunId===activeRunId&&!groupPostStopRequested){
          const nextIds=groupPostRouteIds(cfg.groups[index]);
          if(nextIds.includes(String(location.pathname.match(/^\/groups\/([^/?#]+)/i)?.[1]||"").toLowerCase())){
            setTimeout(continueGroupPost,250);
          }else location.assign(cfg.groups[index].url);
        }
      } else if(await groupPostRunActive(activeRunId))await chrome.storage.local.set({groupPostActive:false,groupPostIndex:index,groupPostSkipped:skipped,groupPostNextAt:0,groupPostStatus:t("gp2.doneAll",{d:done,t:cfg.groups.length,s:skipped})});
    }catch(e){
      console.warn("[GroupPost] error",e);
      if(activeRunId&&await groupPostRunActive(activeRunId))await chrome.storage.local.set({groupPostActive:false,groupPostStatus:`Lỗi đăng nhóm: ${e.message}`});
    }finally{
      isGroupPosting=false;
      // A newly started run can arrive while the old one is unwinding.  Let
      // it take over only after the old run has released this in-tab lock.
      const next=await chrome.storage.local.get(["groupPostActive","groupPostRunId"]);
      if(next.groupPostActive&&next.groupPostRunId&&next.groupPostRunId!==activeRunId)setTimeout(continueGroupPost,0);
    }
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse)=>{
    if(msg.action==="scanFeedLikes"){
      const n=scanFeedLikes();
      sendResponse({count:n});
      return true;
    } else if(msg.action==="scanJoinedGroups"){
      scanJoinedGroups().then(groups=>sendResponse({ok:true,groups})).catch(e=>sendResponse({ok:false,error:e.message}));
      return true;
    } else if(msg.action==="startGroupInteract"){
      const runId=String(msg.runId||`group-interact-${Date.now()}-${Math.random().toString(36).slice(2,8)}`);
      const requestedGroups=Math.max(1,parseInt(msg.targetGroups)||(msg.groups||[]).length||1);
      const limitedGroups=(msg.groups||[]).slice(0,Math.min(requestedGroups,(msg.groups||[]).length));
      const cfg={groups:limitedGroups,perGroup:Math.max(1,parseInt(msg.perGroup)||5),minDelay:Math.max(1,parseInt(msg.minDelay)||5),maxDelay:Math.max(1,parseInt(msg.maxDelay)||12),reaction:msg.reaction||"random",targetGroups:requestedGroups,runId,ownerTabId:(sender&&sender.tab&&sender.tab.id)||msg.ownerTabId||0};
      chrome.storage.local.get(["groupInteractActive","groupInteractRunId","groupCommentActive"]).then(current=>{
        if(current.groupCommentActive){sendResponse({ok:false,error:t("p.giBusyOtherMode")});return;}
        if(current.groupInteractActive&&current.groupInteractRunId===runId){
          groupStopRequested=false;
          sendResponse({ok:true,resumed:true});
          setTimeout(continueGroupInteraction,0);
          return;
        }
        if(current.groupInteractActive&&current.groupInteractRunId!==runId){sendResponse({ok:false,error:t("p.giStartFail")});return;}
        groupStopRequested=false;
        clearGroupCommentDraftMemory();
        clearGroupCommentDraftOwnedHistory();
        chrome.storage.local.set({groupInteractActive:true,groupInteractRunId:runId,groupInteractConfig:cfg,groupInteractIndex:0,groupInteractDone:0,groupInteractAiDone:0,groupInteractTotal:cfg.groups.length*cfg.perGroup,groupInteractCurrentGroupIndex:0,groupInteractCurrentGroupDone:0,groupInteractCurrentGroupAiDone:0,groupInteractReactedKeys:{},groupInteractReactionGuard:{},groupInteractCommentGuard:{},groupInteractStatus:t("gi2.starting")}).then(()=>{sendResponse({ok:true});setTimeout(continueGroupInteraction,200);});
      });
      return true;
    } else if(msg.action==="startGroupPost"){
      const runId=String(msg.runId||`group-post-${Date.now()}-${Math.random().toString(36).slice(2,8)}`);
      const cfg={groups:msg.groups||[],prompt:msg.prompt||"",minDelay:Math.max(5,parseInt(msg.minDelay)||20),maxDelay:Math.max(5,parseInt(msg.maxDelay)||40),interGroupDelay:Math.min(3600,Math.max(5,parseInt(msg.interGroupDelay)||30)),aiConfig:msg.aiConfig||{},background:normalizeGroupPostBackground(msg.background),runId,ownerTabId:(sender&&sender.tab&&sender.tab.id)||msg.ownerTabId||0};
      chrome.storage.local.get(["groupShareActive","groupPostActive","groupPostRunId"]).then(other=>{
        if(other.groupShareActive){sendResponse({ok:false,error:t("p.shBusyPost")});return;}
        // Popup persisted this exact run before navigating.  Do not reset its
        // counters/config when the delayed message reaches the reloaded tab.
        if(other.groupPostActive&&other.groupPostRunId===runId){
          groupPostStopRequested=false;
          sendResponse({ok:true,resumed:true});
          setTimeout(continueGroupPost,0);
          return;
        }
        if(other.groupPostActive&&other.groupPostRunId!==runId){sendResponse({ok:false,error:t("p.gpStartFail")});return;}
        groupPostStopRequested=false;
        chrome.storage.local.set({groupPostActive:true,groupPostRunId:runId,groupPostConfig:cfg,groupPostIndex:0,groupPostDone:0,groupPostSkipped:0,groupPostTotal:cfg.groups.length,groupPostNextAt:0,groupPostLastColor:"",groupPostRetryCount:0,groupPostPendingContent:"",groupPostPendingIndex:-1,groupPostStage:"",groupPostSubmitRunId:"",groupPostSubmitIndex:-1,groupPostSubmitDispatchedAt:0,groupPostStatus:t("gp2.starting")}).then(()=>{sendResponse({ok:true});setTimeout(continueGroupPost,200);});
      });return true;
    } else if(msg.action==="stopGroupPost"){
      groupPostStopRequested=true;chrome.storage.local.set({groupPostActive:false,groupPostNextAt:0,groupPostStatus:t("p.gpStopped")}).then(()=>sendResponse({ok:true}));return true;
    } else if(msg.action==="startGroupComment"){
      const runId=String(msg.runId||`group-comment-${Date.now()}-${Math.random().toString(36).slice(2,8)}`);
      const requestedGroups=Math.max(1,parseInt(msg.targetGroups)||(msg.groups||[]).length||1);
      const limitedGroups=(msg.groups||[]).slice(0,Math.min(requestedGroups,(msg.groups||[]).length));
      const cfg={groups:limitedGroups,perGroup:Math.max(1,parseInt(msg.perGroup)||5),minDelay:Math.max(1,parseInt(msg.minDelay)||5),maxDelay:Math.max(1,parseInt(msg.maxDelay)||12),targetGroups:requestedGroups,runId,ownerTabId:(sender&&sender.tab&&sender.tab.id)||msg.ownerTabId||0};
      chrome.storage.local.get(["groupCommentActive","groupCommentRunId","groupInteractActive"]).then(current=>{
        if(current.groupInteractActive){sendResponse({ok:false,error:t("p.giBusyOtherMode")});return;}
        if(current.groupCommentActive&&current.groupCommentRunId===runId){
          groupCommentStopRequested=false;sendResponse({ok:true,resumed:true});setTimeout(continueGroupComment,0);return;
        }
        if(current.groupCommentActive&&current.groupCommentRunId!==runId){sendResponse({ok:false,error:t("p.giStartFail")});return;}
        groupCommentStopRequested=false;
        clearGroupCommentDraftMemory();
        clearGroupCommentDraftOwnedHistory();
        chrome.storage.local.set({groupCommentActive:true,groupCommentRunId:runId,groupCommentConfig:cfg,groupCommentIndex:0,groupCommentDone:0,groupCommentTotal:cfg.groups.length*cfg.perGroup,groupCommentCurrentGroupIndex:0,groupCommentCurrentGroupDone:0,groupCommentHistory:{},groupCommentSubmissionGuard:{},groupCommentProcessedKeys:[],groupCommentRetryCounts:{},groupCommentSkipped:{},groupCommentStatus:t("gi2.commentStarting")}).then(()=>{sendResponse({ok:true});setTimeout(continueGroupComment,200);});
      });
      return true;
    } else if(msg.action==="stopGroupInteract"){
      groupStopRequested=true;
      chrome.storage.local.set({groupInteractActive:false,groupInteractStatus:t("p.stopped")}).then(()=>{
        void (async()=>{await cleanupGroupCommentDraft();clearGroupCommentDraftMemory();clearGroupCommentDraftOwnedHistory();})();
        sendResponse({ok:true});
      });
      return true;
    } else if(msg.action==="stopGroupComment"){
      groupCommentStopRequested=true;
      chrome.storage.local.set({groupCommentActive:false,groupCommentStatus:t("p.stopped")}).then(()=>{
        void (async()=>{await cleanupGroupCommentDraft();clearGroupCommentDraftMemory();clearGroupCommentDraftOwnedHistory();})();
        sendResponse({ok:true});
      });
      return true;
    } else if(msg.action==="resetGroupInteract"){
      groupStopRequested=true;
      // Reset mở phiên mới nhưng giữ lịch sử chống trùng để không thả cảm
      // xúc lặp vào cùng bài; chỉ zero bộ đếm/guards/tiến trình nhóm hiện tại.
      document.querySelectorAll('[data-feed-interacted="1"]').forEach(el=>{delete el.dataset.feedInteracted;el.style.outline="";});
      void (async()=>{await cleanupGroupCommentDraft();clearGroupCommentDraftMemory();clearGroupCommentDraftOwnedHistory();})();
      chrome.storage.local.set({groupInteractActive:false,groupInteractRunId:"",groupInteractIndex:0,groupInteractDone:0,groupInteractAiDone:0,groupInteractTotal:0,groupInteractCurrentGroupIndex:0,groupInteractCurrentGroupDone:0,groupInteractCurrentGroupAiDone:0,groupInteractReactionGuard:{},groupInteractCommentGuard:{},groupInteractAiSkipped:{},groupInteractStatus:t("gi.reactionResetDone")}).then(()=>sendResponse({ok:true}));
      return true;
    } else if(msg.action==="resetGroupComment"){
      groupCommentStopRequested=true;
      // Reset chỉ zero bộ đếm/phiên đang chạy, giữ groupCommentHistory để
      // phiên mới không comment lặp vào bài đã xử lý (giống Reset Comment AI
      // Bản tin). Dọn luôn draft do AI sở hữu để không kẹt cảnh báo rời trang.
      void (async()=>{await cleanupGroupCommentDraft();clearGroupCommentDraftMemory();clearGroupCommentDraftOwnedHistory();})();
      chrome.storage.local.set({groupCommentActive:false,groupCommentRunId:"",groupCommentIndex:0,groupCommentDone:0,groupCommentTotal:0,groupCommentCurrentGroupIndex:0,groupCommentCurrentGroupDone:0,groupCommentSubmissionGuard:{},groupCommentProcessedKeys:[],groupCommentRetryCounts:{},groupCommentSkipped:{},groupCommentStatus:t("gi.commentResetDone")}).then(()=>sendResponse({ok:true}));
      return true;
    } else if(msg.action==="startFeedInteract"){
      if(isFeedInteracting){ sendResponse({ok:false}); return true; }
      feedTarget=parseInt(msg.target)||20;
      feedMinDelay=(parseInt(msg.minDelay)||3)*1000;
      feedMaxDelay=(parseInt(msg.maxDelay)||8)*1000;
      feedReaction=msg.reaction||"random";
      chrome.storage.local.set({ isFeedInteracting:true });
      feedInteractLoop();
      sendResponse({ok:true});
    } else if(msg.action==="stopFeedInteract"){
      isFeedInteracting=false;
      chrome.storage.local.set({ isFeedInteracting:false, feedStatus:t("p.stoppedX") });
      chrome.storage.local.remove(["pendingFeedInteract","pendingFeedConfig"]);
      sendResponse({ok:true});
    } else if(msg.action==="resetFeedInteract"){
      resetFeed(); sendResponse({ok:true});
    } else if(msg.action==="startAIComment"){
      if(isAICommenting){ sendResponse({ok:false}); return true; }
      aiTarget=parseInt(msg.target)||10;
      setAiDelayRange(msg.minDelay,msg.maxDelay);
      aiEconomyMode=msg.economyMode||"balanced";aiBatchSize=Math.max(2,Math.min(10,parseInt(msg.batchSize)||5));aiCacheDays=Math.max(0,parseInt(msg.cacheDays)||7);
      chrome.storage.local.get("aiCount").then(saved=>{
        aiCount=Math.max(0,parseInt(saved.aiCount)||0);
        if(aiCount>=aiTarget)aiCount=0;
        chrome.storage.local.set({ isAICommenting:true,aiNextAllowedAt:0,aiFeedReloadAttempts:0 });
        aiCommentLoop(aiCount>0);
        sendResponse({ok:true,resumed:aiCount>0,aiCount});
      }).catch(e=>sendResponse({ok:false,error:e.message}));
      return true;
    } else if(msg.action==="stopAIComment"){
      isAICommenting=false;
      void cleanupAICommentComposer(undefined,undefined,"Dừng");
      chrome.storage.local.set({ isAICommenting:false, aiStatus:t("p.stoppedX"),aiActiveConfig:null,aiNextAllowedAt:0,pendingAIComment:false,aiFeedReloadAttempts:0 });
      sendResponse({ok:true});
    } else if(msg.action==="resetAIComment"){
      resetAI(); sendResponse({ok:true});
    }
    return true;
  });

  // tu dong tiep tuc sau khi redirect tu popup
  (async ()=>{
    const p = await chrome.storage.local.get(["pendingFeedInteract","pendingFeedConfig","pendingAIComment","pendingAIConfig","groupInteractActive","groupInteractConfig","groupInteractIndex","groupCommentActive","groupCommentConfig","groupCommentIndex","groupPostActive","groupPostConfig","groupPostIndex","isAICommenting","aiActiveConfig","aiCount","aiNextAllowedAt"]);
    // Phiên nhóm đang chạy nhưng tab không ở route nhóm (vd: reload rớt ra
    // ngoài, người dùng chuyển trang): tự về đúng nhóm rồi tiếp tục.
    const groupTaskUrl=(cfgKey,indexKey)=>{
      try{
        const cfg=p[cfgKey],groups=cfg&&cfg.groups;
        if(!groups||!groups.length)return "";
        const index=Math.min(Math.max(0,parseInt(p[indexKey])||0),groups.length-1);
        return groups[index].url||"";
      }catch{return "";}
    };
    if(p.groupPostActive && (await runOwnedByThisTab(p.groupPostConfig&&p.groupPostConfig.ownerTabId))){
      if(location.href.includes("facebook.com/groups/")){await sleep(1000);continueGroupPost();}
      else{const targetUrl=groupTaskUrl("groupPostConfig","groupPostIndex");if(targetUrl)location.assign(targetUrl);}
    }
    if(p.groupInteractActive && (await runOwnedByThisTab(p.groupInteractConfig&&p.groupInteractConfig.ownerTabId))){
      if(location.href.includes("facebook.com/groups/")){
        await sleep(1200);
        continueGroupInteraction();
      }
      else{const targetUrl=groupTaskUrl("groupInteractConfig","groupInteractIndex");if(targetUrl)location.assign(targetUrl);}
    }
    if(p.groupCommentActive && (await runOwnedByThisTab(p.groupCommentConfig&&p.groupCommentConfig.ownerTabId))){
      if(location.href.includes("facebook.com/groups/")){await sleep(1200);continueGroupComment();}
      else{const targetUrl=groupTaskUrl("groupCommentConfig","groupCommentIndex");if(targetUrl)location.assign(targetUrl);}
    }
    if(p.pendingFeedInteract && p.pendingFeedConfig && p.isFeedInteracting!==false && (await runOwnedByThisTab(p.pendingFeedConfig.ownerTabId)) && location.href.includes("facebook.com")){
      if(!isMainFacebookFeed()){ location.href="https://www.facebook.com/"; return; }
      const cfg = p.pendingFeedConfig;
      feedTarget = parseInt(cfg.target)||20;
      feedMinDelay = (parseInt(cfg.minDelay)||3)*1000;
      feedMaxDelay = (parseInt(cfg.maxDelay)||8)*1000;
      feedReaction = cfg.reaction||"random";
      chrome.storage.local.remove(["pendingFeedInteract","pendingFeedConfig"]);
      await sleep(2500);
      if(!isFeedInteracting){ isFeedInteracting=true; chrome.storage.local.set({ isFeedInteracting:true }); feedInteractLoop(); }
    }
    if(p.pendingAIComment && p.pendingAIConfig && p.isAICommenting!==false && (await runOwnedByThisTab(p.pendingAIConfig.ownerTabId)) && location.href.includes("facebook.com")){
      const cfg = p.pendingAIConfig;
      aiTarget = parseInt(cfg.target)||10;
      setAiDelayRange(cfg.minDelay,cfg.maxDelay);
      aiEconomyMode=cfg.economyMode||"balanced";aiBatchSize=Math.max(2,Math.min(10,parseInt(cfg.batchSize)||5));aiCacheDays=Math.max(0,parseInt(cfg.cacheDays)||7);
      chrome.storage.local.remove(["pendingAIComment","pendingAIConfig"]);
      await sleep(2500);
      aiCount=parseInt(p.aiCount)||0;
      if(aiCount>=aiTarget)aiCount=0;
      if(!isMainFacebookFeed()){await navigateAIToMainFeed();return;}
      // DỪNG BẰNG MỌI GIÁ: thoát ngay nếu cờ chạy đã tắt trong lúc chờ.
      while(Date.now()<(parseInt(p.aiNextAllowedAt)||0)){
        const aliveNow=await chrome.storage.local.get("isAICommenting");
        if(aliveNow.isAICommenting===false)return;
        const seconds=Math.max(1,Math.ceil(((parseInt(p.aiNextAllowedAt)||0)-Date.now())/1000));
        await chrome.storage.local.set({aiStatus:t("ai2.waitNext",{from:aiCount,to:aiTarget,secs:seconds})});
        await sleep(Math.min(1000,(parseInt(p.aiNextAllowedAt)||0)-Date.now()));
      }
      {
        const aliveNow=await chrome.storage.local.get("isAICommenting");
        if(aliveNow.isAICommenting===false)return;
      }
      if(!isAICommenting){ isAICommenting=true; chrome.storage.local.set({ isAICommenting:true }); aiCommentLoop(aiCount>0); }
    }else if(p.isAICommenting&&p.aiActiveConfig&&(await runOwnedByThisTab(p.aiActiveConfig.ownerTabId))){
      const cfg=p.aiActiveConfig;aiTarget=parseInt(cfg.target)||10;setAiDelayRange(cfg.minDelay,cfg.maxDelay);aiEconomyMode=cfg.economyMode||"balanced";aiBatchSize=parseInt(cfg.batchSize)||5;aiCacheDays=parseInt(cfg.cacheDays)||7;aiCount=parseInt(p.aiCount)||0;
      if(!isMainFacebookFeed()){await navigateAIToMainFeed();return;}
      await sleep(1800);if(!isAICommenting){isAICommenting=true;aiCommentLoop(true);}
    }
  })();

  console.log("[Feed] feed.js loaded v1.9.45");
})();
