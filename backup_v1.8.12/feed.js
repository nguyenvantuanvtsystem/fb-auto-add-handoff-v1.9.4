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

  function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
  function rand(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }
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
  function fallbackComment(text){const t=String(text).toLowerCase();const pools=t.match(/tuyển dụng|việc làm|ứng tuyển/)?["Thông tin này khá hữu ích, cảm ơn bạn đã chia sẻ.","Cơ hội đáng để mọi người quan tâm và tìm hiểu thêm."]:t.match(/bán|giá|sản phẩm|mua/)?["Sản phẩm trông khá ổn, cảm ơn bạn đã chia sẻ thông tin.","Thông tin rõ ràng và hữu ích cho người đang quan tâm."]:t.match(/công nghệ|ai|máy tính|phần mềm/)?["Chủ đề rất đáng quan tâm, mình cũng muốn tìm hiểu thêm.","Góc chia sẻ hay và khá thiết thực trong thời điểm này."]:["Cảm ơn bạn đã chia sẻ nội dung hữu ích này.","Góc nhìn khá hay, mình rất đồng tình với chia sẻ này.","Nội dung thú vị và đáng để mọi người cùng trao đổi."];return pools[Math.floor(Math.random()*pools.length)];}

  async function trustedMouse(el, kind){
    if(!isRenderedElement(el)) return false;
    try {
      el.scrollIntoView({behavior:"instant",block:"center"});
    } catch {
      try { el.scrollIntoView({behavior:"smooth",block:"center"}); } catch {}
    }
    await sleep(200);
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
  async function doReact(btn, type){
    const t = type==="random" ? ["like","love","haha","wow","sad","angry"][Math.floor(Math.random()*6)] : type;
    if(t==="like"){
      if(!await trustedMouse(btn,"click")) return {used:t,success:false};
      await sleep(900);
      const changed=!btn.isConnected || !isLabel(btn,["thích","thich","like"]);
      return {used:t,success:changed};
    }
    // Dung su kien chuot that qua trinh duyet; Facebook bo qua click gia lap.
    for(let attempt=0;attempt<2;attempt++){
      if(!await trustedMouse(btn,"hover")) return {used:t,success:false};
      await sleep(1100);
      const rBtn=findReactionBtn(t);
      if(!rBtn) continue;
      if(!await trustedMouse(rBtn,"click")) continue;
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

  function isSponsoredPost(article){
    if(!article) return false;
    if(article.querySelector('a[href*="/ads/about"], a[href*="facebook.com/ads/about"], a[href*="facebook.com/about/ads"], a[href*="/ads/library"], a[href*="/adpreferences"]')) return true;
    if(article.querySelector('[data-ad-comet-preview], [data-ad-preview]')) return true;
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
    function isInComment(n){ return !!n.closest('ul, div[aria-label*="Bình luận"], div[aria-label*="Comment"]'); }
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
      cands.forEach(c=>{ if(isInComment(c)) return; const t=(c.innerText||"").trim(); if(t.length>longest.length) longest=t; });
      if(longest) text=longest;
    }
    if(!text) text = article.innerText ? article.innerText.slice(0,800).trim() : "";
    // bo header
    text = text.replace(/^.*·\s*\d+\s*năm\s*/s,"").trim();
    text = text.replace(/^Tháng\s*\d+.*?\d{4}\s*·?\s*/s,"").trim();
    return text.slice(0, 2000); // gioi han gui AI
  }

  function findCommentBox(article){
    if(!article) return null;
    const boxes=[...article.querySelectorAll('div[contenteditable="true"], [role="textbox"]')].filter(el => {
      if(!isRenderedElement(el)) return false;
      if(isMessengerChatBox(el)) return false; // Không lấy ô chat Messenger
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
      if(!isRenderedElement(el)||isMessengerChatBox(el))return false;
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
  function findCommentBoxOpenedByClick(previousBoxes){
    const opened=visibleCommentBoxes().filter(box=>!previousBoxes.has(box));
    const box=opened.find(b=>b.closest('[role="dialog"]'))||opened[0]||null;
    if(!box)return null;
    const scope=box.closest('[role="dialog"]')||findFeedPostContainer(box)||box.parentElement;
    return {box,scope};
  }
  async function closeExactCommentOverlay(scope){
    if(!scope||scope===document.body||scope===document.documentElement)return;
    const close=[...scope.querySelectorAll('[role="button"],button')].filter(btn=>{
      if(!isRenderedElement(btn))return false;
      const label=buttonLabel(btn);
      return /^(đóng|close|thoát|quay lại|back)(?:s|$)/i.test(label);
    });
    if(close[0]){try{await trustedMouse(close[0],"click");}catch(_){}}
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
    if(!isMainFacebookFeed()||!article?.isConnected||article.dataset.aiFeedCandidate!=="1")return "skip";
    if(isSponsoredPost(article))return "skip";
    let currentArticle=article;
    const targetIdentity=expectedIdentity||postIdentity(currentArticle);
    const normalize=s=>String(s||"").replace(/[\u200B-\u200D\u2060\uFEFF]/g,"").replace(/\s+/g," ").trim().toLowerCase();
    const proof=normalize(commentText).slice(0,60);
    const postSignature=normalize(extractPostText(currentArticle)).slice(0,60);
    let routeRetries=0,targetDetailOpened=false,commentActivationStarted=false;
    let activationPreviousBoxes=new Set(),activatedBox=null,activatedScope=null;
    const finishCommentView=async scope=>{
      if(targetDetailOpened){
        await chrome.storage.local.set({aiStatus:`Đã xác minh bình luận, đang quay lại Bảng tin (${aiCount+1}/${aiTarget})`});
        return returnToMainFeedViaHistory();
      }
      await closeExactCommentOverlay(scope);
      return true;
    };

    // Chỉ kết thúc khi người dùng dừng hoặc đã tìm thấy và xác minh được
    // comment trong đúng container của bài hiện tại. Không chuyển sang bài
    // khác trong lúc đang chờ Facebook render.
    while(isAICommenting){
      if(!isMainFacebookFeed()&&!(targetDetailOpened&&isFacebookPostDetailPage())){
        const returned=await returnToMainFeedViaHistory();
        if(!returned){
          await chrome.storage.local.set({pendingAIComment:true,pendingAIConfig:{target:aiTarget,minDelay:aiMinDelay/1000,maxDelay:aiMaxDelay/1000,economyMode:aiEconomyMode,batchSize:aiBatchSize,cacheDays:aiCacheDays},aiStatus:"Facebook không ở Bảng tin, đang quay lại để xử lý đúng bài"});
          location.href="https://www.facebook.com/";
          return "navigated";
        }
        currentArticle=null;
        await sleep(1000);
      }

      if(!targetDetailOpened&&(!currentArticle?.isConnected || (targetIdentity && postIdentity(currentArticle)!==targetIdentity))){
        currentArticle=findFeedPostByIdentity(targetIdentity);
        if(!currentArticle){
          chrome.storage.local.set({aiStatus:`Đang tìm lại đúng bài hiện tại, chưa chuyển sang bài mới (${aiCount}/${aiTarget})`});
          await sleep(1000);
          continue;
        }
      }

      // Sau khi nút Bình luận đã mở đúng trang chi tiết, tuyệt đối không
      // bấm lại nút đó. Facebook có thể cần khá lâu mới dựng ô contenteditable.
      if(targetDetailOpened&&commentActivationStarted){
        const opened=findCommentBoxOpenedByClick(activationPreviousBoxes);
        const candidate=opened||(()=>{const b=visibleCommentBoxes().find(x=>x.closest('main'))||visibleCommentBoxes()[0];return b?{box:b,scope:findFeedPostContainer(b)||b.closest('main')||b.parentElement}:null;})();
        if(candidate){activatedBox=candidate.box;activatedScope=candidate.scope;currentArticle=candidate.scope;}
        else{
          await chrome.storage.local.set({aiStatus:`Đúng bài đã mở; đang chờ Facebook tải ô bình luận, không bấm lại và không đóng bài (${aiCount}/${aiTarget})`});
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
          if(opened){box=opened.box;commentScope=opened.scope;activatedBox=box;activatedScope=commentScope;}
          if(!box){
            await chrome.storage.local.set({aiStatus:`Đã mở Bình luận; đang tiếp tục chờ ô nhập tải xong, không bấm lần hai (${aiCount}/${aiTarget})`});
            await sleep(1000);
            continue;
          }
        }
      }
      if(!box){
        const commentBtn=findCommentButton(currentArticle);
        if(!commentBtn){
          chrome.storage.local.set({aiStatus:`Đang chờ nút Bình luận của đúng bài hiện tại... (${aiCount}/${aiTarget})`});
          await sleep(1000);
          continue;
        }

        activationPreviousBoxes=new Set(visibleCommentBoxes());
        commentActivationStarted=true;
        try{commentBtn.click();}catch(_){ }
        await sleep(500);

        // Tuyệt đối không bình luận ở trang chi tiết hoặc trong nhóm. Nếu
        // click làm Facebook điều hướng, quay lại Bảng tin và thử lại bài này.
        if(!isMainFacebookFeed()){
          if(isFacebookPostDetailPage()){
            targetDetailOpened=true;
            await chrome.storage.local.set({aiStatus:`Facebook đã mở đúng bài; đang chờ ô bình luận tải xong (${aiCount}/${aiTarget})`});
          }else{
            routeRetries++;
            console.warn(`[AI] Nút Bình luận điều hướng sai khỏi bài hiện tại (lần ${routeRetries})`);
            chrome.storage.local.set({aiStatus:`Facebook mở sai trang, đang quay lại Bảng tin và giữ nguyên bài hiện tại (lần ${routeRetries})...`});
            const returned=await returnToMainFeedViaHistory();
            if(!returned){
              await chrome.storage.local.set({pendingAIComment:true,pendingAIConfig:{target:aiTarget,minDelay:aiMinDelay/1000,maxDelay:aiMaxDelay/1000,economyMode:aiEconomyMode,batchSize:aiBatchSize,cacheDays:aiCacheDays},aiStatus:"Đang quay lại Bảng tin để tìm đúng bài"});
              location.replace("https://www.facebook.com/");
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
              if(fallback){box=fallback.box;commentScope=fallback.scope;currentArticle=commentScope;}
            }else{currentArticle=null;break;}
          }
           if(currentArticle?.isConnected){
             exactBox=findExactCommentBox(currentArticle,targetIdentity,postSignature);
             box=exactBox?.box||null;
             if(exactBox)commentScope=exactBox.scope;
           }
           if(!box){
            const opened=findCommentBoxOpenedByClick(activationPreviousBoxes);
            if(opened){box=opened.box;commentScope=opened.scope;}
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
          if(wait%5===4) chrome.storage.local.set({aiStatus:`Đang chờ ô Bình luận của đúng bài... ${Math.ceil((wait+1)*0.4)}s (${aiCount}/${aiTarget})`});
        }
        if(!isAICommenting) return "stopped";
        if(!box) continue;
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
        await finishCommentView(commentScope);
        return "already-commented";
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

      chrome.storage.local.set({aiStatus:`Đang nhập comment đúng bài... (${aiCount}/${aiTarget})`});
      // Chỉ nhập chữ ở bước này. Enter và click nút gửi trước đây cùng được
      // gọi, gây nguy cơ đăng một comment hai lần.
      const typed=await chrome.runtime.sendMessage({action:"trustedInput",text:commentText,pressEnter:false,typingMinDelay:25,typingMaxDelay:55});
      if(!typed?.ok){
        try { box.focus(); document.execCommand("insertText",false,commentText); } catch {}
      }
      await sleep(600);
      if(!typed?.ok && !normalize(box.innerText||box.textContent||box.value).includes(normalize(commentText).slice(0,20))){
        chrome.storage.local.set({aiStatus:`Chưa nhập được comment vào đúng ô, đang thử lại bài hiện tại... (${aiCount}/${aiTarget})`});
        await sleep(1000);
        continue;
      }

      const sendBtn=findCommentSendButton(box);
      let submitted=false;
      // Khóa bài trước cú gửi. Nếu Facebook/extension mất phản hồi ngay sau
      // thao tác, lần chạy sau vẫn không gửi lại và tạo comment trùng.
      const guardKey=targetIdentity||postIdentity(currentArticle);
      const guardStored=await chrome.storage.local.get("aiCommentSubmissionGuard");
      const submissionGuard=guardStored.aiCommentSubmissionGuard&&typeof guardStored.aiCommentSubmissionGuard==="object"?guardStored.aiCommentSubmissionGuard:{};
      if(guardKey){submissionGuard[guardKey]={time:Date.now(),source:"feed",state:"submitting"};await chrome.storage.local.set({aiCommentSubmissionGuard:submissionGuard});}
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
        if(guardKey){delete submissionGuard[guardKey];await chrome.storage.local.set({aiCommentSubmissionGuard:submissionGuard});}
        chrome.storage.local.set({aiStatus:`Chưa thấy nút gửi của đúng ô comment, đang thử lại bài hiện tại... (${aiCount}/${aiTarget})`});
        await sleep(1000);
        continue;
      }

      chrome.storage.local.set({aiStatus:`Đã gửi, đang xác minh comment nằm đúng bài... (${aiCount+1}/${aiTarget})`});
      // Sau khi gửi, tiếp tục quan sát đúng bài cho đến khi thấy proof.
      // Không coi ô trống là thành công vì ô có thể trống do Facebook reset.
      const verifyDeadline=Date.now()+30000;
      while(isAICommenting){
        await sleep(500);
        if(!isMainFacebookFeed()&&!(targetDetailOpened&&isFacebookPostDetailPage())){
          const returned=await returnToMainFeedViaHistory();
          if(!returned){
            await chrome.storage.local.set({pendingAIComment:true,pendingAIConfig:{target:aiTarget,minDelay:aiMinDelay/1000,maxDelay:aiMaxDelay/1000,economyMode:aiEconomyMode,batchSize:aiBatchSize,cacheDays:aiCacheDays},aiStatus:"Đã gửi nhưng Facebook rời Bảng tin, đang quay lại để xác minh đúng bài"});
            location.replace("https://www.facebook.com/");
            return "navigated";
          }
        }
        let scope=commentScope;
        if(!scope?.isConnected){
          scope=findFeedPostByIdentity(targetIdentity);
          if(scope) currentArticle=scope;
        }
        if(scope&&commentProofExists(scope,proof)){
          await finishCommentView(scope);
          return true;
        }
        if(currentArticle&&commentProofExists(currentArticle,proof)){
          await finishCommentView(commentScope);
          return true;
        }
        if(Date.now()>=verifyDeadline){
          await chrome.storage.local.set({aiStatus:`Facebook chưa xác minh được comment sau 30 giây; đã khóa bài này để không gửi trùng và chuyển sang bài kế tiếp (${aiCount}/${aiTarget})`});
          await finishCommentView(commentScope);
          return "unconfirmed-skip";
        }
        chrome.storage.local.set({aiStatus:`Đang chờ xác nhận comment đúng bài... (${aiCount+1}/${aiTarget})`});
      }
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
    chrome.storage.local.remove(["pendingFeedInteract"]);
    isFeedInteracting=true;
    feedCount=0;
    chrome.storage.local.set({ feedStatus:"Dang tuong tac ban tin...", feedCount:0, isFeedInteracting:true });
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
              chrome.storage.local.set({ feedStatus:`Khong tim thay nut Like bai goc (da cuon ${scrollTries} lan). Hay cuon tay xuong ban tin roi bam Reset va thu lai. Mo F12 Console xem log [Feed].` });
            } else {
              chrome.storage.local.set({ feedStatus:`Het bai, dung o ${feedCount}/${feedTarget}` });
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
          chrome.storage.local.set({ feedCount, feedStatus:`Da ${used} ${feedCount}/${feedTarget} bai` });
        }catch(e){ console.warn(e); }
        if(feedCount>=feedTarget) break;
        await sleep(rand(feedMinDelay, feedMaxDelay));
      }
      if(feedCount>=feedTarget) break;
      window.scrollTo(0, document.body.scrollHeight);
      await sleep(2000);
    }
    isFeedInteracting=false;
    if(feedCount===0){
      chrome.storage.local.set({ isFeedInteracting:false, feedStatus:`Chua tuong tac duoc bai nao (0/${feedTarget}). Hay dam bao dang o facebook.com/ ban tin, cuon xuong de load bai roi bam Reset va thu lai.` });
    } else {
      chrome.storage.local.set({ isFeedInteracting:false, feedStatus:`Xong! Da tuong tac ${feedCount}/${feedTarget} bai ban tin` });
    }
  }

  function isMainFacebookFeed(){return location.hostname.endsWith("facebook.com")&&(location.pathname==="/"||location.pathname==="/home.php");}
  async function returnToMainFeedViaHistory(maxSteps=4){
    for(let step=0;step<maxSteps&&!isMainFacebookFeed();step++){
      if(!location.hostname.endsWith("facebook.com"))return false;
      try{ history.go(-1); }catch(_){ return false; }
      // Facebook cập nhật URL theo SPA không đồng bộ. Chờ đến khi thực sự
      // quay lại / hoặc /home.php, không gọi history.back liên tiếp khi trang
      // chi tiết còn đang tải vì có thể bỏ qua luôn lịch sử của Bảng tin.
      for(let i=0;i<32&&!isMainFacebookFeed();i++) await sleep(250);
      if(isMainFacebookFeed()) return true;
    }
    return isMainFacebookFeed();
  }
  async function aiCommentLoop(resume=false){
    if(!isMainFacebookFeed()){
      chrome.storage.local.set({ pendingAIComment: true, pendingAIConfig: { target: aiTarget, minDelay: aiMinDelay/1000, maxDelay: aiMaxDelay/1000,economyMode:aiEconomyMode,batchSize:aiBatchSize,cacheDays:aiCacheDays } });
      location.href = "https://www.facebook.com/";
      return;
    }
    chrome.storage.local.remove(["pendingAIComment"]);
    isAICommenting=true;
    if(!resume)aiCount=0;
    chrome.storage.local.set({ aiStatus:resume?`Tiếp tục AI comment từ ${aiCount}/${aiTarget}...`:"Đang comment AI...", aiCount, isAICommenting:true,aiActiveConfig:{target:aiTarget,minDelay:aiMinDelay/1000,maxDelay:aiMaxDelay/1000,economyMode:aiEconomyMode,batchSize:aiBatchSize,cacheDays:aiCacheDays} });
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
        if(!isMainFacebookFeed()){await chrome.storage.local.set({pendingAIComment:true,pendingAIConfig:{target:aiTarget,minDelay:aiMinDelay/1000,maxDelay:aiMaxDelay/1000,economyMode:aiEconomyMode,batchSize:aiBatchSize,cacheDays:aiCacheDays},aiStatus:`Facebook chuyển sai trang, đang quay lại Bảng tin (${aiCount}/${aiTarget})`});location.href="https://www.facebook.com/";return;}
        if(art.dataset.aiCommented==="1") continue;
        if(art.dataset.aiFeedCandidate!=="1"||isSponsoredPost(art)){
          chrome.storage.local.set({aiStatus:`Đã bỏ qua quảng cáo hoặc nội dung ngoài Bảng tin (${aiCount}/${aiTarget})`});
          continue;
        }
        const postKey=postIdentity(art);
        const text = extractPostText(art);
        if(!text || text.trim().length < 15){
          console.warn("[AI] Không lấy được đủ nội dung bài viết để tạo comment, bỏ qua bài này");
          chrome.storage.local.set({aiStatus:`Không đọc được nội dung bài viết, đang tìm bài tiếp theo (${aiCount}/${aiTarget})`});
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
            if(!res?.ok)throw new Error(res?.error||"không tạo được comment");commentText=res.comment;
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
            if(!res?.ok)throw new Error(res?.error||"không tạo được comment theo lô");
            batch.forEach((tx,i)=>{if(res.comments?.[i]){const key=postContentKey(tx)||commentCacheKey(tx);commentCache[key]={comment:res.comments[i],time:Date.now()};}});
            commentText=commentCache[cacheKey]?.comment||res.comments?.[0]||"";
          }
          await chrome.storage.local.set({aiCommentCache:commentCache,aiApiRequests:apiRequests,aiCacheHits:cacheHits});
        }catch(e){console.warn("[AI] dung cau mau du phong",e);lastAiFailure=`API lỗi, đang dùng câu mẫu dự phòng: ${e.message}`;commentText=fallbackComment(text);chrome.storage.local.set({aiStatus:lastAiFailure});}
        // Chuan hoa lan cuoi de ca comment cu trong cache cung khong con dau ! o cuoi.
        commentText=String(commentText||"").trim().replace(/[!！]+\s*$/g,"").trimEnd();
        if(!commentText) continue;
        foundNew=true;
        const liveArt = (art && art.isConnected) ? art : null;
        if(!liveArt){ console.warn("[AI] Bài đã rời khỏi DOM, bỏ qua an toàn"); continue; }
        let ok=false,attemptError="";
        try{ ok=await postAIComment(liveArt,commentText,postKey); }
        catch(e){ console.warn("[AI] comment loi",e); attemptError=`Lỗi đăng bình luận: ${e.message}`;lastAiFailure=attemptError; chrome.storage.local.set({aiStatus:lastAiFailure}); }
        if((ok===false||ok==null)&&!attemptError)ok="unconfirmed";
        if(ok==="stale"){
          lastAiFailure="Bài hiện tại đã thay đổi trước khi thao tác. Đang giữ nguyên bài, không chuyển bài mới.";
          chrome.storage.local.set({aiStatus:lastAiFailure});
          isAICommenting=false;
          break;
        }
        if(ok==="skip"){console.log("[AI] Bỏ qua bài không đủ điều kiện, không phải lỗi comment");continue;}
        if(ok==="box-timeout"||ok==="unconfirmed"){
          // Không được đánh dấu thành công hoặc chuyển bài khi chưa xác minh
          // comment xuất hiện đúng trong bài hiện tại.
          lastAiFailure="Chưa xác minh được comment trong đúng bài hiện tại. Đang giữ bài để thử lại.";
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
          lastAiFailure="Đã dừng xử lý bài hiện tại.";
          chrome.storage.local.set({aiStatus:lastAiFailure});
          isAICommenting=false;
          break;
        }
        if(ok==="navigated"){
          await chrome.storage.local.set({pendingAIComment:true,pendingAIConfig:{target:aiTarget,minDelay:aiMinDelay/1000,maxDelay:aiMaxDelay/1000,economyMode:aiEconomyMode,batchSize:aiBatchSize,cacheDays:aiCacheDays},aiStatus:`Đã chặn điều hướng sai, đang quay lại Bảng tin (${aiCount}/${aiTarget})`});
          location.href="https://www.facebook.com/";return;
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
          chrome.storage.local.set({ aiCount, aiApiRequests:apiRequests,aiCacheHits:cacheHits,aiRecentPostKeys:recentKeys,aiRecentPostContentKeys:recentContentKeys,aiCommentHistory:commentHistory,aiFeedReloadAttempts:0,aiStatus:handledAsExisting?`Bài đã có comment, không đăng lặp (${aiCount}/${aiTarget})`:`Đã comment ${aiCount}/${aiTarget} • API ${apiRequests} lần • Cache ${cacheHits}` });
          console.log(handledAsExisting?`[AI] Bài đã có comment, bỏ qua đăng lặp (${aiCount})`:`[AI] Comment ${aiCount}: ${commentText}`);
          if(aiCount<aiTarget){
            const delayMs=rand(aiMinDelay,aiMaxDelay),nextAt=Date.now()+delayMs;
            await chrome.storage.local.set({aiNextAllowedAt:nextAt,aiStatus:`Đã comment ${aiCount}/${aiTarget}. Chờ ${Math.ceil(delayMs/1000)} giây trước bài tiếp theo`});
            while(isAICommenting&&Date.now()<nextAt){
              const seconds=Math.max(1,Math.ceil((nextAt-Date.now())/1000));
              chrome.storage.local.set({aiStatus:`Đã comment ${aiCount}/${aiTarget}. Chờ ${seconds} giây trước bài tiếp theo`});
              await sleep(Math.min(1000,nextAt-Date.now()));
            }
            window.scrollBy(0,Math.max(650,innerHeight*.65));
            await sleep(1000);
          }
        }else{
          if(!lastAiFailure) lastAiFailure="Lỗi thao tác bình luận không xác định.";
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
          chrome.storage.local.set({aiStatus:`Đang tải thêm bài mới... (${aiCount}/${aiTarget})`});
          window.scrollBy(0,Math.max(520,innerHeight*.62));
          await sleep(idle%6===0?2600:1700);
        }else{
          chrome.storage.local.set({aiStatus:`Đang kiểm tra bài hiện tại... (${aiCount}/${aiTarget})`});
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
              aiStatus:`Chưa có bài mới. Đang tải lại Bảng tin lần ${reloadAttempts}/10 và tiếp tục ${aiCount}/${aiTarget}`
            });
            await sleep(rand(2500,4500));
            location.reload();
            return;
          }
          lastAiFailure=`Đã giữ tiến độ ${aiCount}/${aiTarget} nhưng Facebook không cung cấp thêm bài sau 10 lần tải lại.`;
          chrome.storage.local.set({aiStatus:lastAiFailure,aiFeedReloadAttempts:0});
          break;
        }
      } else idle=0;
      if(aiCount>=aiTarget) break;
    }
    isAICommenting=false;
    const zeroMessage=lastAiFailure || (!sawPost
      ? "Không tìm thấy bài viết trên trang này. Hãy mở Bảng tin hoặc một nhóm cụ thể."
      : "Đã thấy bài nhưng chưa comment được.");
    const finalMessage=aiCount>=aiTarget
      ? `Xong! Đã AI comment ${aiCount}/${aiTarget} bài`
      : lastAiFailure || (aiCount>0 ? `Đã tạm dừng ở ${aiCount}/${aiTarget} bài` : zeroMessage);
    chrome.storage.local.set({ isAICommenting:false, aiActiveConfig:null,aiStatus:finalMessage });
  }

  function resetFeed(){
    isFeedInteracting=false; feedCount=0;
    document.querySelectorAll('[data-feed-interacted="1"]').forEach(el=>{ delete el.dataset.feedInteracted; el.style.outline=""; });
    chrome.storage.local.set({ feedCount:0, feedStatus:"Da reset", isFeedInteracting:false });
  }
  function resetAI(){
    isAICommenting=false; aiCount=0;
    document.querySelectorAll('[data-ai-commented="1"]').forEach(el=>{ delete el.dataset.aiCommented; el.style.outline=""; });
    // Reset chỉ mở một phiên mới; giữ lịch sử/dấu vân tay để không gửi lại
    // những bài đã xử lý ở phiên trước. Xóa lịch sử phải là thao tác riêng,
    // không được xảy ra khi người dùng chỉ muốn đặt bộ đếm về 0.
    chrome.storage.local.set({ aiCount:0, aiStatus:"Đã reset phiên (giữ lịch sử chống trùng)", isAICommenting:false,aiActiveConfig:null,pendingAIComment:false,aiNextAllowedAt:0,aiFeedReloadAttempts:0 });
  }

  async function scanJoinedGroups(){
    const skip=new Set(["feed","discover","joins","create","notifications","your_groups"]);
    const map=new Map();
    function collect(){
      for(const a of document.querySelectorAll('a[href*="/groups/"]')){
        let url;
        try{ url=new URL(a.href,location.origin); }catch{ continue; }
        if(url.hostname!==location.hostname) continue;
        const m=url.pathname.match(/^\/groups\/([^/?#]+)/);
        if(!m || skip.has(m[1].toLowerCase())) continue;
        const id=m[1];
        let name=(a.getAttribute("aria-label")||a.innerText||a.textContent||"").trim().replace(/\s+/g," ");
        if(!name || name.length<2 || name.length>150) continue;
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
  async function groupSleep(ms){
    const end=Date.now()+ms;
    while(Date.now()<end){
      if(groupStopRequested) return false;
      await sleep(Math.min(250,end-Date.now()));
    }
    return !groupStopRequested;
  }
  chrome.storage.onChanged.addListener((changes,areaName)=>{
    if(areaName!=="local") return;
    if(changes.groupInteractActive?.newValue===false) groupStopRequested=true;
  });
  async function continueGroupInteraction(){
    if(isGroupInteracting) return;
    isGroupInteracting=true;
    groupStopRequested=false;
    try{
      let stored=await chrome.storage.local.get(["groupInteractActive","groupInteractConfig","groupInteractIndex","groupInteractDone"]);
      const cfg=stored.groupInteractConfig;
      if(!stored.groupInteractActive || !cfg?.groups?.length) return;
      let index=parseInt(stored.groupInteractIndex)||0;
      let totalDone=parseInt(stored.groupInteractDone)||0;
      if(index>=cfg.groups.length){
        await chrome.storage.local.set({groupInteractActive:false,groupInteractStatus:`Hoàn tất ${cfg.groups.length} nhóm, đã tương tác ${totalDone} bài`});
        return;
      }
      const group=cfg.groups[index];
      const wantedPath=new URL(group.url).pathname.replace(/\/$/,"");
      if(!location.pathname.startsWith(wantedPath)){
        if(groupStopRequested) return;
        await chrome.storage.local.set({groupInteractStatus:`Đang mở nhóm ${index+1}/${cfg.groups.length}: ${group.name}`});
        if(groupStopRequested) return;
        location.href=group.url;
        return;
      }
      await chrome.storage.local.set({groupInteractStatus:`Đang tương tác nhóm ${index+1}/${cfg.groups.length}: ${group.name}`});
      if(!await groupSleep(2500)) return;
      let groupDone=0,emptyTries=0;
      while(groupDone<cfg.perGroup){
        const live=await chrome.storage.local.get("groupInteractActive");
        if(!live.groupInteractActive || groupStopRequested) return;
        let buttons=findFeedLikeButtons();
        if(!buttons.length){
          emptyTries++;
          window.scrollBy(0,Math.max(850,innerHeight*.8));
          if(!await groupSleep(1800)) return;
          if(emptyTries>=7) break;
          continue;
        }
        emptyTries=0;
        for(const btn of buttons){
          if(groupDone>=cfg.perGroup || groupStopRequested) break;
          const bar=findMainActionBar(btn),post=findFeedPostContainer(btn);
          btn.scrollIntoView({behavior:"smooth",block:"center"});
          if(!await groupSleep(650)) return;
          if(!isValidFeedLike(btn,bar)) continue;
          try{
            const result=await doReact(btn,cfg.reaction);
            if(groupStopRequested) return;
            btn.dataset.feedInteracted="1";
            if(post) post.dataset.feedInteracted="1";
            if(!result.success) continue;
            groupDone++; totalDone++;
            if(post) post.style.outline="2px solid #00897b";
            await chrome.storage.local.set({groupInteractDone:totalDone,groupInteractStatus:`${group.name}: ${groupDone}/${cfg.perGroup} bài`});
            if(groupDone<cfg.perGroup && !await groupSleep(rand(cfg.minDelay*1000,cfg.maxDelay*1000))) return;
          }catch(e){ console.warn("[Group Interact]",e); }
        }
        if(groupDone<cfg.perGroup){ window.scrollBy(0,innerHeight*.9); if(!await groupSleep(1500)) return; }
      }
      if(groupStopRequested) return;
      index++;
      await chrome.storage.local.set({groupInteractIndex:index,groupInteractStatus:`Xong ${group.name}: ${groupDone}/${cfg.perGroup} bài`});
      if(index<cfg.groups.length){
        if(!await groupSleep(rand(cfg.minDelay*1000,cfg.maxDelay*1000))) return;
        const active=await chrome.storage.local.get("groupInteractActive");
        if(!active.groupInteractActive || groupStopRequested) return;
        location.href=cfg.groups[index].url;
      }else{
        await chrome.storage.local.set({groupInteractActive:false,groupInteractStatus:`Hoàn tất ${cfg.groups.length} nhóm, đã tương tác ${totalDone} bài`});
      }
    }finally{ isGroupInteracting=false; }
  }

  let isGroupPosting=false,groupPostStopRequested=false;
  const GROUP_POST_AUTO={
    interGroupMin:25,interGroupMax:45,
    afterPostMin:6,afterPostMax:8,
    afterBgMin:3,afterBgMax:5,
    typingMin:60,typingMax:130,
    beforePostMin:3,beforePostMax:6,
    composerOpenWait:20000,composerReadyWait:25000,
    paletteWait:10000,backgroundConfirmWait:10000,submitWait:10000
  };
  async function groupPostSleep(ms){const end=Date.now()+ms;while(Date.now()<end){if(groupPostStopRequested)return false;await sleep(Math.min(250,end-Date.now()));}return !groupPostStopRequested;}
  async function waitForGroupPostSchedule(nextAt,index,total,name){
    while(Date.now()<nextAt){
      if(groupPostStopRequested)return false;
      const live=await chrome.storage.local.get("groupPostActive");
      if(!live.groupPostActive)return false;
      const seconds=Math.max(1,Math.ceil((nextAt-Date.now())/1000));
      await chrome.storage.local.set({groupPostStatus:`Chờ ${seconds}s trước khi đăng nhóm ${index+1}/${total}: ${name}`});
      await sleep(Math.min(1000,Math.max(1,nextAt-Date.now())));
    }
    return !groupPostStopRequested;
  }
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==="local"&&changes.groupPostActive?.newValue===false)groupPostStopRequested=true;});
  const GROUP_POST_COLOR_NAMES={pink:"hồng",green:"xanh lá",red:"đỏ",orange:"cam",yellow:"vàng",blue:"xanh dương",purple:"tím",burgundy:"đỏ thẫm",beige:"be",brown:"nâu",gray:"xám",black:"đen"};
  function normalizeGroupPostBackground(input){
    const allowed=Object.keys(GROUP_POST_COLOR_NAMES),chosen=Array.isArray(input?.colors)?input.colors.filter(c=>allowed.includes(c)):[];
    const colors=chosen.length?[...new Set(chosen)]:allowed;
    const mode=input?.mode==="fixed"?"fixed":"random",fixedColor=allowed.includes(input?.fixedColor)?input.fixedColor:"pink";
    // Tôn trọng lựa chọn bật/tắt nền; khi bật nền, nhóm không có bảng màu sẽ được bỏ qua.
    const enabled=input?.enabled!==false;
    return {enabled,mode,fixedColor,colors,maxChars:Math.min(140,Math.max(40,parseInt(input?.maxChars)||100)),fallback:"skip",afterBgMin:GROUP_POST_AUTO.afterBgMin,afterBgMax:GROUP_POST_AUTO.afterBgMax,typingMin:GROUP_POST_AUTO.typingMin,typingMax:GROUP_POST_AUTO.typingMax,beforePostMin:GROUP_POST_AUTO.beforePostMin,beforePostMax:GROUP_POST_AUTO.beforePostMax};
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
  async function pacedGroupPostWait(minSeconds,maxSeconds,label){
    const total=rand(Math.max(1,minSeconds)*1000,Math.max(minSeconds,maxSeconds)*1000),end=Date.now()+total;
    while(Date.now()<end){
      if(groupPostStopRequested)return false;
      const left=Math.max(1,Math.ceil((end-Date.now())/1000));
      await chrome.storage.local.set({groupPostStatus:`${label} — còn ${left}s`});
      await sleep(Math.min(500,Math.max(1,end-Date.now())));
    }
    return !groupPostStopRequested;
  }
  function backgroundLabelScore(color,label){
    const text=String(label||"").toLowerCase();
    if(!/phông nền|background/.test(text))return -1;
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
      return isRenderedElement(b)&&matches&&(selected||!/phông nền\s+\d+\s*$|background\s+\d+\s*$/.test(label));
    });
    return selectedPreview||!!(box&&!findBackgroundChooser()&&editorStillHasBackground(box,live));
  }
  async function applyGroupPostBackground(dialog,preferredColor,allowedColors){
    const expanded=findVisibleButton(dialog,[/^(ẩn các lựa chọn phông nền|hide background options)$/]);
    const toggle=findVisibleButton(dialog,[/^(hiển thị các tùy chọn phông nền|show background options)$/]);
    if(!expanded&&!toggle)return {applied:false,reason:"Nhóm không có nút chọn nền màu"};
    await chrome.storage.local.set({groupPostStatus:"Đã mở trình soạn bài, đang mở bảng màu nền..."});
    console.log("[GroupPost] background palette requested");
    if(!expanded&&!await clickGroupPostControl(toggle,()=>!!findVisibleButton(dialog,[/^(ẩn các lựa chọn phông nền|hide background options)$/]),GROUP_POST_AUTO.paletteWait,1500))return {applied:false,reason:"Không mở được bảng nền màu"};
    let chooserBefore=null;
    await waitGroupPostCondition(()=>!!(chooserBefore=findBackgroundChooser()),GROUP_POST_AUTO.paletteWait);
    const more=findVisibleButton(dialog,[/^(tùy chọn phông nền|background options)$/]);
    // Một số phiên bản Facebook hiển thị sẵn toàn bộ màu ngay sau khi bật
    // toggle; không bấm “Tùy chọn phông nền” lần nữa vì thao tác đó sẽ đóng
    // bảng màu vừa mở.
    if(!chooserBefore&&more&&!await clickGroupPostControl(more,()=>!!findBackgroundChooser(),GROUP_POST_AUTO.paletteWait,1500))return {applied:false,reason:"Facebook chưa mở toàn bộ bảng màu"};
    const chooser=findBackgroundChooser(),root=findSolidBackgroundRoot(chooser)||dialog;
    const paletteButtons=[...((root||dialog).querySelectorAll('[role="button"],button'))].filter(b=>isRenderedElement(b)&&/phông nền|background/i.test(buttonLabel(b)));
    console.log(`[GroupPost] palette candidates ${paletteButtons.length}`);
    const ordered=[preferredColor,...(allowedColors||[])].filter((c,i,a)=>GROUP_POST_COLOR_NAMES[c]&&a.indexOf(c)===i);
    let selected=null,selectedColor="",selectedScore=-1;
    for(const color of ordered){
      const candidates=[...root.querySelectorAll('[role="button"],button')].map(button=>({button,score:backgroundLabelScore(color,buttonLabel(button))})).filter(item=>item.score>=0).sort((a,b)=>b.score-a.score);
      if(candidates[0]){selected=candidates[0].button;selectedColor=color;selectedScore=candidates[0].score;break;}
    }
    if(!selected){
      // Nếu nhóm có bảng nền nhưng không có đúng màu đã tích, vẫn chọn một
      // nền khả dụng để không bỏ qua nhầm nhóm có thể đăng kèm nền.
      const fallback=paletteButtons.filter(b=>{
        if(!isRenderedElement(b))return false;
        const label=buttonLabel(b);
        return /phông nền|background/.test(label)&&!/^không có phông nền$|^no background$/.test(label)&&!/^(?:ẩn|hiển thị) các lựa chọn phông nền$/.test(label)&&!/^(?:tùy chọn phông nền|background options)$/.test(label);
      });
      if(fallback[0]){selected=fallback[0];selectedColor="auto";selectedScore=1;}
    }
    if(!selected){await closeBackgroundPickerToPlain(dialog);return {applied:false,reason:"Không tìm thấy màu nền khả dụng"};}
    await chrome.storage.local.set({groupPostStatus:`Đang chọn nền ${GROUP_POST_COLOR_NAMES[selectedColor]}...`});
    console.log(`[GroupPost] selecting background ${selectedColor}`);
    if(!await clickGroupPostControl(selected,()=>groupPostBackgroundApplied(selectedColor,dialog),GROUP_POST_AUTO.backgroundConfirmWait,1800)){
      await closeBackgroundPickerToPlain(dialog);return {applied:false,reason:`Facebook không xác nhận nền ${GROUP_POST_COLOR_NAMES[selectedColor]}`};
    }
    await closeBackgroundChooserOnly();
    await chrome.storage.local.set({groupPostStatus:`Đã chọn nền ${GROUP_POST_COLOR_NAMES[selectedColor]}, đang chuẩn bị điền nội dung...`});
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
  async function typeGroupPostContent(box,content,minDelay,maxDelay){
    const expected=normalizedGroupPostText(content),prefix=expected.slice(0,40);
    try{box.focus();box.click();}catch(_){ }
    if(document.activeElement!==box&&!box.contains(document.activeElement)){
      try{await trustedMouse(box,"click");}catch(_){ }
    }
    if(document.activeElement!==box&&!box.contains(document.activeElement))return {ok:false,error:"Không đặt được con trỏ vào ô nhập bài viết"};
    for(const char of String(content||"")){
      if(groupPostStopRequested)return {ok:false,error:"Đã dừng trong lúc nhập nội dung"};
      if(!box.isConnected)break;
      let inserted=false;
      try{inserted=!!document.execCommand("insertText",false,char);}catch(_){ }
      if(!inserted)break;
      if(!await groupPostSleep(rand(minDelay,maxDelay)))return {ok:false,error:"Đã dừng trong lúc nhập nội dung"};
    }
    await sleep(350);
    let composer=await waitForGroupPostComposer(4000,250),liveBox=composer?.box;
    let actual=normalizedGroupPostText(liveBox?.innerText||liveBox?.textContent);
    if(prefix&&actual.includes(prefix))return {ok:true,composer,actual};
    // Chỉ dùng bộ gõ hệ thống khi ô thật sự trống để không chèn lặp nội dung.
    if(!actual){
      liveBox=liveBox||box;
      try{liveBox.focus();liveBox.click();}catch(_){ }
      const typed=await chrome.runtime.sendMessage({action:"trustedInput",text:content,pressEnter:false,typingMinDelay:minDelay,typingMaxDelay:maxDelay});
      if(!typed?.ok)return {ok:false,error:typed?.error||"Không nhập được nội dung bài viết"};
      await sleep(500);
      composer=await waitForGroupPostComposer(5000,250);liveBox=composer?.box;
      actual=normalizedGroupPostText(liveBox?.innerText||liveBox?.textContent);
      if(prefix&&actual.includes(prefix))return {ok:true,composer,actual};
    }
    return {ok:false,error:actual?"Facebook chỉ nhận một phần nội dung; sẽ đóng bản nháp và thử lại":"Facebook chưa nhận nội dung bài viết"};
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
  async function createGroupPost(content,backgroundInput={},preferredColor=""){
    const background=normalizeGroupPostBackground(backgroundInput);
    // Dismiss Facebook's first-visit welcome card before looking for the
    // composer; otherwise the card can intercept the click and look like a
    // missing/incorrect "Tạo bài viết" button.
    await dismissGroupWelcomeDialog();
    const opener=findGroupPostOpener();if(!opener)throw new Error("Không tìm thấy nút Tạo bài viết trong nhóm");
    console.log("[GroupPost] opening composer");
    if(!await clickGroupPostControl(opener,()=>!!findGroupPostDialog(),GROUP_POST_AUTO.composerOpenWait,1800))throw new Error("Không bấm được nút Tạo bài viết trong nhóm");
    let composer=await waitForGroupPostComposer(GROUP_POST_AUTO.composerReadyWait);
    if(!composer)throw new Error("Facebook chưa tải xong cửa sổ Tạo bài viết sau thời gian chờ tự động");
    let {dialog,box}=composer;
    let backgroundResult={applied:false,color:"",reason:"Đã tắt nền màu"};
    if(background.enabled){
      const usableColors=background.mode==="fixed"?[background.fixedColor]:background.colors;
      backgroundResult=await applyGroupPostBackground(dialog,preferredColor,usableColors);
      if(!backgroundResult.applied){
        if(background.fallback==="skip")throw new Error(`${backgroundResult.reason}; đã bỏ qua theo cài đặt`);
        throw new Error(`${backgroundResult.reason}. Nền chưa được xác nhận nên không điền nội dung và không chuyển nhóm`);
      }
      if(backgroundResult.applied&&!await pacedGroupPostWait(background.afterBgMin,background.afterBgMax,`Đã chọn nền ${GROUP_POST_COLOR_NAMES[backgroundResult.color]}, đang nghỉ trước khi nhập`))throw new Error("Đã dừng trong lúc chờ sau khi chọn nền");
    }
    composer=await waitForGroupPostComposer(GROUP_POST_AUTO.composerReadyWait);
    if(!composer)throw new Error("Facebook chưa tải lại ô nhập sau khi chọn nền trong thời gian chờ tự động");
    ({dialog,box}=composer);
    box.scrollIntoView({block:"center"});await sleep(250);
    await chrome.storage.local.set({groupPostStatus:`Đang điền ${content.length} ký tự vào bài viết...`});
    const typed=await typeGroupPostContent(box,content,background.typingMin,background.typingMax);
    if(!typed.ok)throw new Error(typed.error);
    console.log(`[GroupPost] content filled ${content.length} chars`);
    composer=typed.composer;
    if(!composer)throw new Error("Facebook làm mới ô nhập sau khi điền nội dung");
    ({dialog,box}=composer);
    if(backgroundResult.applied&&!editorStillHasBackground(box,dialog)){
      backgroundResult={applied:false,color:"",reason:"Facebook đã bỏ nền sau khi nhập nội dung"};
      if(background.fallback==="skip")throw new Error(`${backgroundResult.reason}; đã bỏ qua theo cài đặt`);
      throw new Error(`${backgroundResult.reason}. Đã dừng tại đúng nhóm để không đăng sai`);
    }
    let postBtn=null;
    for(let i=0;i<80&&!postBtn;i++){
      dialog=findGroupPostDialog()||dialog;
      postBtn=[...dialog.querySelectorAll('[role="button"],button')].find(b=>{
        const l=buttonLabel(b);return isRenderedElement(b)&&b.getAttribute("aria-disabled")!=="true"&&!b.disabled&&(l==="đăng"||l==="post");
      })||null;
      if(!postBtn)await sleep(250);
    }
    if(!postBtn)throw new Error("Nút Đăng chưa sẵn sàng");
    if(!await pacedGroupPostWait(background.beforePostMin,background.beforePostMax,"Đã điền xong nội dung, đang nghỉ trước khi Đăng"))throw new Error("Đã dừng trước khi bấm Đăng");
    await chrome.storage.local.set({groupPostStatus:"Nội dung và nền đã sẵn sàng, đang bấm Đăng một lần..."});
    const submitted=await clickGroupPostControl(postBtn,()=>{
      if(!dialog.isConnected||!isRenderedElement(dialog))return true;
      const currentText=String(box.innerText||box.textContent||"").replace(/[\u200B-\u200D\u2060\uFEFF]/g,"").trim();
      return postBtn.getAttribute("aria-disabled")==="true"||postBtn.disabled||!currentText;
    },GROUP_POST_AUTO.submitWait,2200);
    if(!submitted)throw new Error("Facebook không nhận thao tác bấm nút Đăng");
    console.log("[GroupPost] submit dispatched");
    for(let i=0;i<14;i++){
      await sleep(500);
      if(!dialog.isConnected||!isRenderedElement(dialog))return {ok:true,backgroundApplied:backgroundResult.applied,color:backgroundResult.color,reason:backgroundResult.reason};
      if(postBtn.getAttribute("aria-disabled")==="true"||postBtn.disabled)return {ok:true,backgroundApplied:backgroundResult.applied,color:backgroundResult.color,reason:"Facebook đã nhận lệnh đăng"};
    }
    throw new Error("Facebook chưa xác nhận đăng bài");
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
  async function continueGroupPost(){
    if(isGroupPosting)return;isGroupPosting=true;groupPostStopRequested=false;
    try{
      const s=await chrome.storage.local.get(["groupPostActive","groupPostConfig","groupPostIndex","groupPostDone","groupPostSkipped","groupPostNextAt","groupPostLastColor","groupPostRetryCount","groupPostPendingContent","groupPostPendingIndex"]),cfg=s.groupPostConfig;
      if(!s.groupPostActive||!cfg?.groups?.length)return;
      let index=parseInt(s.groupPostIndex)||0,done=parseInt(s.groupPostDone)||0;
      let skipped=parseInt(s.groupPostSkipped)||0;
      if(index>=cfg.groups.length){await chrome.storage.local.set({groupPostActive:false,groupPostNextAt:0,groupPostSkipped:skipped,groupPostStatus:`Hoàn tất: đã đăng ${done}/${cfg.groups.length}, bỏ qua ${skipped} nhóm`});return;}
      const group=cfg.groups[index],wantedIds=groupPostRouteIds(group);
      const currentId=String(location.pathname.match(/^\/groups\/([^/?#]+)/i)?.[1]||"").toLowerCase();
      console.log(`[GroupPost] route check index=${index+1} current=${currentId||"none"} expected=${wantedIds.join(",")||"none"}`);
      if(!wantedIds.length||!groupPostCurrentGroupMatches(group,currentId,wantedIds)){
        if(groupPostStopRequested)return;
        await chrome.storage.local.set({groupPostStatus:`Đang mở đúng nhóm ${index+1}/${cfg.groups.length}: ${group.name}`});
        location.assign(group.url);return;
      }
      // Some groups display a welcome dialog only after the route settles.
      // Close it before waiting or opening the post composer.
      await dismissGroupWelcomeDialog();
      const nextAt=Number(s.groupPostNextAt)||0;
      if(nextAt>Date.now()&&!await waitForGroupPostSchedule(nextAt,index,cfg.groups.length,group.name))return;
      if(!await groupPostSleep(2200))return;
      await chrome.storage.local.set({groupPostStatus:`AI đang viết bài cho: ${group.name}`});
      const background=normalizeGroupPostBackground(cfg.background),preferredColor=background.enabled?chooseGroupPostColor(background,s.groupPostLastColor):"";
      let ai;
      if(Number(s.groupPostPendingIndex)===index&&String(s.groupPostPendingContent||"").trim())ai={ok:true,content:String(s.groupPostPendingContent).trim()};
      else{
        ai=await chrome.runtime.sendMessage({action:"aiGenerateGroupPost",groupName:group.name,prompt:cfg.prompt,aiConfig:cfg.aiConfig,background});
        if(ai?.ok)await chrome.storage.local.set({groupPostPendingContent:ai.content,groupPostPendingIndex:index});
      }
      if(!ai?.ok)throw new Error(ai?.error||"AI không tạo được bài");
      console.log(`[GroupPost] AI content ready for group ${group.id||index+1}`);
      if(groupPostStopRequested){
        const liveAfterAI=await chrome.storage.local.get("groupPostActive");
        if(!liveAfterAI.groupPostActive){console.log(`[GroupPost] stopped after AI before composer group=${group.id||index+1}`);return;}
        // Cờ trong bộ nhớ có thể còn từ trang trước; nếu phiên vẫn active thì tiếp tục.
        groupPostStopRequested=false;
        console.log(`[GroupPost] cleared stale stop flag before composer group=${group.id||index+1}`);
      }
      console.log(`[GroupPost] preparing composer group=${group.id||index+1}`);
      const colorText=preferredColor?` với nền ${GROUP_POST_COLOR_NAMES[preferredColor]}`:"";
      await chrome.storage.local.set({groupPostStatus:`Đang đăng bài ${ai.content.length} ký tự${colorText} vào: ${group.name}`});
      let completedCurrent=false,skippedCurrent=false;
      for(let attempt=1;attempt<=3&&!completedCurrent&&!skippedCurrent;attempt++){
        await chrome.storage.local.set({groupPostRetryCount:attempt-1,groupPostStatus:`Đang thử ${attempt}/3 tại đúng nhóm ${group.name}; không tải lại trang`});
        try{
          const posted=await createGroupPost(ai.content,background,preferredColor);
          done++;completedCurrent=true;
          const detail=posted.backgroundApplied?`nền ${GROUP_POST_COLOR_NAMES[posted.color]}`:"chữ thường";
          await chrome.storage.local.set({groupPostDone:done,groupPostLastColor:posted.backgroundApplied?posted.color:s.groupPostLastColor||"",groupPostRetryCount:0,groupPostPendingContent:"",groupPostPendingIndex:-1,groupPostStatus:`Đã đăng ${done}/${cfg.groups.length} (${detail}): ${group.name}`});
          console.log(`[GroupPost] posted ${done}/${cfg.groups.length} group=${group.id||index+1} background=${posted.backgroundApplied?posted.color:"plain"}`);
          // Giữ nguyên nhóm vài giây sau khi Facebook nhận bài để bài mới
          // kịp xuất hiện trên giao diện và người dùng có thể nhìn thấy bài
          // đã đăng trước khi tiện ích điều hướng sang nhóm kế tiếp.
          if(!await pacedGroupPostWait(GROUP_POST_AUTO.afterPostMin,GROUP_POST_AUTO.afterPostMax,`Đã đăng bài, đang chờ Facebook hiển thị tại ${group.name}`))return;
        }catch(e){
          const explicitSkip=/đã bỏ qua theo cài đặt/i.test(e.message);
          const skippableGroupError=/không tìm thấy nút tạo bài viết|không bấm được nút tạo bài viết|chưa tải xong cửa sổ tạo bài viết|chưa tải lại ô nhập|nhóm không có nút chọn nền màu|không mở được bảng nền màu|chưa mở toàn bộ bảng màu|không tìm thấy màu nền|không xác nhận nền/i.test(String(e.message||""));
          const mayAlreadyBePosted=/chưa xác nhận đăng bài|không nhận thao tác bấm nút đăng/i.test(e.message);
          console.log(`[GroupPost] attempt ${attempt}/3 failed group=${group.id||index+1}: ${String(e.message||" lỗi không rõ").slice(0,180)}`);
          if(explicitSkip){
            skippedCurrent=true;
            skipped++;
            await dismissGroupPostComposer();
            await chrome.storage.local.set({groupPostSkipped:skipped,groupPostRetryCount:0,groupPostPendingContent:"",groupPostPendingIndex:-1,groupPostStatus:`Đã bỏ qua ${group.name} (${e.message}); đã đăng ${done}/${cfg.groups.length}, bỏ qua ${skipped}`});
            break;
          }
          if(skippableGroupError&&attempt>=2){
            skippedCurrent=true;
            skipped++;
            await dismissGroupPostComposer();
            await chrome.storage.local.set({groupPostSkipped:skipped,groupPostRetryCount:0,groupPostPendingContent:"",groupPostPendingIndex:-1,groupPostStatus:`Bỏ qua nhóm ${group.name}: ${e.message}; đã đăng ${done}/${cfg.groups.length}, bỏ qua ${skipped}`});
            console.log(`[GroupPost] skipped group=${group.id||index+1} reason=${String(e.message||" lỗi không rõ").slice(0,160)}`);
            break;
          }
          if(mayAlreadyBePosted||attempt>=3){
            await chrome.storage.local.set({groupPostActive:false,groupPostNextAt:0,groupPostIndex:index,groupPostRetryCount:attempt,groupPostStatus:`Đã dừng tại nhóm ${group.name}: ${e.message}. Không tải lại trang và không chuyển nhóm khác`});
            return;
          }
          const closed=await dismissGroupPostComposer();
          if(!closed){
            await chrome.storage.local.set({groupPostActive:false,groupPostNextAt:0,groupPostIndex:index,groupPostRetryCount:attempt,groupPostStatus:`Đã dừng tại nhóm ${group.name}: không đóng được bản nháp sau lỗi ${e.message}. Không tải lại trang`});
            return;
          }
          await chrome.storage.local.set({groupPostStatus:`Lần ${attempt}/3 chưa thành công: ${e.message}. Đang chờ để thử lại ngay tại nhóm này, không tải lại trang`});
          if(!await pacedGroupPostWait(2,3,"Chuẩn bị mở lại trình soạn bài cùng nhóm"))return;
        }
      }
      if(!completedCurrent&&!skippedCurrent)return;
      index++;
      if(index<cfg.groups.length&&!groupPostStopRequested){
        const nextRun=Date.now()+rand(GROUP_POST_AUTO.interGroupMin*1000,GROUP_POST_AUTO.interGroupMax*1000);
        await chrome.storage.local.set({groupPostIndex:index,groupPostNextAt:nextRun,groupPostRetryCount:0,groupPostPendingContent:"",groupPostPendingIndex:-1,groupPostStatus:`Đang chuyển sang nhóm ${index+1}/${cfg.groups.length}: ${cfg.groups[index].name} (đã đăng ${done}, bỏ qua ${skipped})`});
        const live=await chrome.storage.local.get("groupPostActive");
        if(live.groupPostActive&&!groupPostStopRequested){
          const nextIds=groupPostRouteIds(cfg.groups[index]);
          if(nextIds.includes(String(location.pathname.match(/^\/groups\/([^/?#]+)/i)?.[1]||"").toLowerCase())){
            setTimeout(continueGroupPost,250);
          }else location.assign(cfg.groups[index].url);
        }
      } else await chrome.storage.local.set({groupPostActive:false,groupPostIndex:index,groupPostSkipped:skipped,groupPostNextAt:0,groupPostStatus:`Hoàn tất: đã đăng ${done}/${cfg.groups.length}, bỏ qua ${skipped} nhóm`});
    }catch(e){console.warn("[GroupPost] error",e);await chrome.storage.local.set({groupPostActive:false,groupPostStatus:`Lỗi đăng nhóm: ${e.message}`});}
    finally{isGroupPosting=false;}
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
      groupStopRequested=false;
      const cfg={groups:msg.groups||[],perGroup:Math.max(1,parseInt(msg.perGroup)||5),minDelay:Math.max(1,parseInt(msg.minDelay)||5),maxDelay:Math.max(1,parseInt(msg.maxDelay)||12),reaction:msg.reaction||"random"};
      chrome.storage.local.set({groupInteractActive:true,groupInteractConfig:cfg,groupInteractIndex:0,groupInteractDone:0,groupInteractTotal:cfg.groups.length*cfg.perGroup,groupInteractStatus:"Đang bắt đầu tương tác nhóm..."}).then(()=>{sendResponse({ok:true});setTimeout(continueGroupInteraction,200);});
      return true;
    } else if(msg.action==="startGroupPost"){
      const cfg={groups:msg.groups||[],prompt:msg.prompt||"",minDelay:Math.max(5,parseInt(msg.minDelay)||20),maxDelay:Math.max(5,parseInt(msg.maxDelay)||40),aiConfig:msg.aiConfig||{},background:normalizeGroupPostBackground(msg.background)};
      groupPostStopRequested=false;
      chrome.storage.local.set({groupPostActive:true,groupPostConfig:cfg,groupPostIndex:0,groupPostDone:0,groupPostSkipped:0,groupPostTotal:cfg.groups.length,groupPostNextAt:0,groupPostLastColor:"",groupPostRetryCount:0,groupPostPendingContent:"",groupPostPendingIndex:-1,groupPostStatus:"Đang bắt đầu đăng bài nhóm..."}).then(()=>{sendResponse({ok:true});setTimeout(continueGroupPost,200);});return true;
    } else if(msg.action==="stopGroupPost"){
      groupPostStopRequested=true;chrome.storage.local.set({groupPostActive:false,groupPostNextAt:0,groupPostStatus:"Đã dừng đăng nhóm"}).then(()=>sendResponse({ok:true}));return true;
    } else if(msg.action==="stopGroupInteract"){
      groupStopRequested=true;
      chrome.storage.local.set({groupInteractActive:false,groupInteractStatus:"Đã dừng"}).then(()=>sendResponse({ok:true}));
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
      chrome.storage.local.set({ isFeedInteracting:false, feedStatus:"Da dung" });
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
      chrome.storage.local.set({ isAICommenting:false, aiStatus:"Da dung",aiActiveConfig:null,aiNextAllowedAt:0,pendingAIComment:false,aiFeedReloadAttempts:0 });
      sendResponse({ok:true});
    } else if(msg.action==="resetAIComment"){
      resetAI(); sendResponse({ok:true});
    }
    return true;
  });

  // tu dong tiep tuc sau khi redirect tu popup
  (async ()=>{
    const p = await chrome.storage.local.get(["pendingFeedInteract","pendingFeedConfig","pendingAIComment","pendingAIConfig","groupInteractActive","groupPostActive","isAICommenting","aiActiveConfig","aiCount","aiNextAllowedAt"]);
    if(p.groupPostActive&&location.href.includes("facebook.com/groups/")){await sleep(1000);continueGroupPost();}
    if(p.groupInteractActive && location.href.includes("facebook.com/groups/")){
      await sleep(1200);
      continueGroupInteraction();
    }
    if(p.pendingFeedInteract && p.pendingFeedConfig && location.href.includes("facebook.com")){
      const cfg = p.pendingFeedConfig;
      feedTarget = parseInt(cfg.target)||20;
      feedMinDelay = (parseInt(cfg.minDelay)||3)*1000;
      feedMaxDelay = (parseInt(cfg.maxDelay)||8)*1000;
      feedReaction = cfg.reaction||"random";
      chrome.storage.local.remove(["pendingFeedInteract","pendingFeedConfig"]);
      await sleep(2500);
      if(!isFeedInteracting){ isFeedInteracting=true; chrome.storage.local.set({ isFeedInteracting:true }); feedInteractLoop(); }
    }
    if(p.pendingAIComment && p.pendingAIConfig && location.href.includes("facebook.com")){
      const cfg = p.pendingAIConfig;
      aiTarget = parseInt(cfg.target)||10;
      setAiDelayRange(cfg.minDelay,cfg.maxDelay);
      aiEconomyMode=cfg.economyMode||"balanced";aiBatchSize=Math.max(2,Math.min(10,parseInt(cfg.batchSize)||5));aiCacheDays=Math.max(0,parseInt(cfg.cacheDays)||7);
      chrome.storage.local.remove(["pendingAIComment","pendingAIConfig"]);
      await sleep(2500);
      aiCount=parseInt(p.aiCount)||0;
      if(!isMainFacebookFeed()){location.href="https://www.facebook.com/";return;}
      while(Date.now()<(parseInt(p.aiNextAllowedAt)||0)){
        const seconds=Math.max(1,Math.ceil(((parseInt(p.aiNextAllowedAt)||0)-Date.now())/1000));
        await chrome.storage.local.set({aiStatus:`Đã comment ${aiCount}/${aiTarget}. Chờ ${seconds} giây trước bài tiếp theo`});
        await sleep(Math.min(1000,(parseInt(p.aiNextAllowedAt)||0)-Date.now()));
      }
      if(!isAICommenting){ isAICommenting=true; chrome.storage.local.set({ isAICommenting:true }); aiCommentLoop(aiCount>0); }
    }else if(p.isAICommenting&&p.aiActiveConfig){
      const cfg=p.aiActiveConfig;aiTarget=parseInt(cfg.target)||10;setAiDelayRange(cfg.minDelay,cfg.maxDelay);aiEconomyMode=cfg.economyMode||"balanced";aiBatchSize=parseInt(cfg.batchSize)||5;aiCacheDays=parseInt(cfg.cacheDays)||7;aiCount=parseInt(p.aiCount)||0;
      if(!isMainFacebookFeed()){await chrome.storage.local.set({pendingAIComment:true,pendingAIConfig:cfg,aiStatus:`Đang quay lại Bảng tin để tiếp tục ${aiCount}/${aiTarget}`});location.href="https://www.facebook.com/";return;}
      await sleep(1800);if(!isAICommenting){isAICommenting=true;aiCommentLoop(true);}
    }
  })();

  console.log("[Feed] feed.js loaded v1.8.12");
})();
