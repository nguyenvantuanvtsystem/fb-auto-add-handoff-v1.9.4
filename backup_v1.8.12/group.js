// group.js - Tham gia nhóm theo từ khoá + lọc thành viên + bài/ngày + tự trả lời câu hỏi
(() => {
  let isJoining = false;
  let joinedCount = 0;
  let targetJoin = 10;
  let minMembers = 10000;
  let minPostsPerDay = 5;
  let minDelay = 5000, maxDelay = 15000;
  let autoAnswers = ["Tôi đồng ý với quy tắc nhóm", "Tôi muốn học hỏi và đóng góp tích cực", "Có, tôi sẽ tuân thủ nội quy"];
  let aiJoinEnabled=false,aiJoinPrompt="",aiJoinConfig={};

  function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
  function randDelay(){ return Math.floor(Math.random()*(maxDelay-minDelay+1))+minDelay; }
  const cleanText=value=>String(value||"").replace(/[\u200B-\u200D\u2060\uFEFF]/g,"").replace(/\s+/g," ").trim();
  const isVisible=el=>{if(!el?.isConnected||el.offsetParent===null)return false;const r=el.getBoundingClientRect();return r.width>0&&r.height>0;};
  const isJoinActive=()=>isJoining||isDiscoverJoining;
  // Facebook đôi khi giữ aria-label cũ ("Tham gia nhóm …") trong khi
  // chữ hiển thị trên nút đã đổi sang "Truy cập vào nhóm". Ưu tiên phần
  // chữ đang nhìn thấy để xác nhận đúng trạng thái; chỉ dùng aria-label
  // khi nút không có text (ví dụ nút đóng hộp thoại).
  const labelOf=el=>cleanText(el?.innerText||el?.textContent||el?.getAttribute?.("aria-label"));
  // Facebook có lúc chỉ hiện "Truy cập" sau khi tham gia, có lúc hiện
  // "Truy cập vào nhóm"; cả hai đều là trạng thái thành công.
  const successJoinLabel=/(?:truy cập(?:\s+vào nhóm)?|visit group|đã tham gia|joined|đã gửi yêu cầu|request sent|hủy yêu cầu|cancel request|xem xét quyền tham gia|review (?:your )?(?:membership|join))/i;
  async function waitForCondition(predicate,timeout=3000){
    const end=Date.now()+timeout;
    while(Date.now()<end){
      if(!isJoinActive())return false;
      try{if(await predicate())return true;}catch{}
      await sleep(180);
    }
    return false;
  }
  async function clickGroupControl(el){
    if(!isJoinActive()||!isVisible(el)||el.matches?.('[aria-disabled="true"],:disabled'))return false;
    try{el.scrollIntoView({behavior:"instant",block:"center"});}catch{try{el.scrollIntoView({block:"center"});}catch{}}
    await sleep(220);
    const clickOnce=async()=>{
      if(!isJoinActive())return false;
      const r=el.getBoundingClientRect(),x=Math.round(r.left+r.width/2),y=Math.round(r.top+r.height/2);
      const hit=document.elementFromPoint(x,y);
      if(hit&&(hit===el||el.contains(hit)||hit.contains(el))){
        try{const trusted=await chrome.runtime.sendMessage({action:"trustedMouse",kind:"click",x,y});if(trusted?.ok)return true;}catch{}
      }
      try{el.click();return true;}catch{return false;}
    };
    // Nút Tham gia/Gửi có tác dụng phụ; tuyệt đối không bấm lần hai khi
    // Facebook chỉ phản hồi chậm, nếu không có thể gửi/cancel hai lần.
    // Chỉ trả về việc click đã được phát đi. Việc chờ dialog/trạng thái
    // được thực hiện riêng để phản hồi chậm không làm bỏ qua nhóm.
    return clickOnce();
  }
  function isMembershipReviewText(value){
    const text=cleanText(value).toLocaleLowerCase("vi");
    return /câu hỏi dành cho người tham gia|membership questions|gửi yêu cầu tham gia|xem xét quyền tham gia|review (?:your )?(?:membership|join)|review membership|quy tắc nhóm|group rules/i.test(text);
  }
  function visibleMembershipDialog(){return [...document.querySelectorAll('div[role="dialog"]')].find(d=>isVisible(d)&&isMembershipReviewText(d.innerText||d.getAttribute("aria-label")||""));}
  async function closeMembershipDialog(){
    const d=visibleMembershipDialog();if(!d)return true;
    const close=[...d.querySelectorAll('[aria-label],div[role="button"],button')].find(b=>isVisible(b)&&/^(đóng|close)$/i.test(labelOf(b)));
    if(!close)return false;
    if(!await clickGroupControl(close))return false;
    return await waitForCondition(()=>!visibleMembershipDialog(),3500);
  }
  async function waitForJoinConfirmation(button,container,timeout=30000,href="",initialLabel=""){
    // Dùng nhãn chụp trước cú bấm. Facebook đôi khi đổi nút sang
    // “Truy cập” trước khi hàm xác nhận bắt đầu chạy.
    const initialButton=cleanText(initialLabel||labelOf(button));
    const end=Date.now()+timeout;
    let detachedAt=0;
    while(Date.now()<end){
      if(!isJoinActive())return false;
      if(visibleMembershipDialog()){await sleep(500);continue;}
      // React có thể thay toàn bộ card sau khi gửi yêu cầu. Tìm lại card
      // theo URL nhóm để không mất tín hiệu thành công khi node cũ detached.
      let currentContainer=container;
      if((!currentContainer||!currentContainer.isConnected)&&href){
        const link=[...document.querySelectorAll('a[href*="/groups/"]')].find(a=>a.href.split("?")[0]===href);
        currentContainer=link?.closest('div[role="article"],div[data-pagelet]')||link?.parentElement?.parentElement||link?.parentElement||null;
      }
      const liveButtons=[];
      if(button?.isConnected)liveButtons.push(button);
      if(currentContainer?.isConnected)liveButtons.push(...currentContainer.querySelectorAll('button,[role="button"],a'));
      const buttonText=liveButtons.map(labelOf).find(text=>successJoinLabel.test(text)&&text!==initialButton);
      if(buttonText)return true;
      // Một số thẻ bị Facebook gỡ khỏi DOM ngay sau khi gửi yêu cầu thay vì
      // đổi nhãn nút. Nếu đã có URL nhóm và nút cũ bị detach, chờ một nhịp
      // ngắn để loại trừ rerender rồi coi đó là xác nhận thành công.
      if(href&&button&&!button.isConnected){
        if(!detachedAt)detachedAt=Date.now();
        const liveLink=[...document.querySelectorAll('a[href*="/groups/"]')].find(a=>a.href.split("?")[0]===href);
        if(!liveLink&&Date.now()-detachedAt>=1800)return true;
      }else if(button?.isConnected){
        detachedAt=0;
      }
      await sleep(700);
    }
    return false;
  }

  function questionForInput(inp,idx){
    const labelled=inp.getAttribute("aria-label")||inp.getAttribute("placeholder")||"";
    if(labelled&&!/trả lời|answer|viết/i.test(labelled))return labelled.trim();
    let node=inp;
    for(let level=0;level<5&&node;level++,node=node.parentElement){
      let prev=node.previousElementSibling;
      while(prev){const text=(prev.innerText||prev.textContent||"").trim().replace(/\s+/g," ");if(text.length>5&&text.length<400&&!/viết câu trả lời|write an answer/i.test(text))return text;prev=prev.previousElementSibling;}
    }
    return `Câu hỏi ${idx+1}`;
  }
  function isConsentQuestion(question){
    const text=cleanText(question).toLocaleLowerCase("vi");
    return /(?:đồng ý|đồng tình|chấp nhận|cam kết|tuân thủ|quy tắc|nội quy|quy định|không quảng cáo|không spam|không bán hàng|không đăng bài|không mua bán|không làm phiền|giữ sạch|ra về|rác|tôn trọng thành viên)/i.test(text);
  }
  function needsAiAnswer(question){
    const text=cleanText(question).toLocaleLowerCase("vi");
    if(isConsentQuestion(text))return false;
    // Các câu hỏi mở của nhóm đều được đưa cho AI khi người dùng bật AI;
    // chỉ câu đồng ý quy tắc mới dùng câu trả lời mẫu. Cách này bao phủ cả
    // câu hỏi “Xem xét quyền tham gia” mà Facebook thay đổi nội dung/nhãn.
    return text.length>=2;
  }
  function cannedAnswerForQuestion(question,index){
    const text=cleanText(question).toLocaleLowerCase("vi");
    if(isConsentQuestion(text))return autoAnswers[0]||"Tôi đồng ý với quy tắc nhóm";
    if(/(?:mục đích|lý do|mong muốn|tham gia để|đóng góp|bạn sẽ làm gì|what.*join|why.*join)/i.test(text))return autoAnswers[1]||"Tôi muốn học hỏi và đóng góp tích cực";
    return autoAnswers[index % Math.max(1,autoAnswers.length)]||autoAnswers[0]||"Tôi đồng ý với quy tắc nhóm";
  }
  async function autoAnswerGroupQuestions(groupName="",triggerButton=null){
    // Dialog hỏi thành viên có thể xuất hiện trễ, nhưng không nên cộng thêm
    // 24 giây cho mọi nhóm không có câu hỏi. Chờ tối đa khoảng 11 giây;
    // nếu nút đã đổi trạng thái thì thoát ngay để áp dụng delay cấu hình.
    for(let tries=0; tries<16; tries++){
      if(!isJoinActive())return false;
      await sleep(700);
      const dialog=visibleMembershipDialog();
      if(!dialog){
        // Không có câu hỏi và nút đã đổi sang trạng thái thành công thì
        // chuyển ngay sang bước xác nhận, tránh chờ đủ 20 giây vô ích.
        if(triggerButton&&successJoinLabel.test(labelOf(triggerButton)))return false;
        continue;
      }
      chrome.storage.local.set({groupStatus:`Đang xem xét quyền tham gia nhóm ${groupName||"đang chọn"}...`});
      // Một số nhóm mở màn hình “Xem xét quyền tham gia” với checkbox quy
      // tắc thay vì ô câu hỏi. Chọn tất cả checkbox trước khi điền câu hỏi;
      // thao tác này không gửi yêu cầu và có thể lặp an toàn sau khi React
      // thay DOM.
      dialog.querySelectorAll('input[type="checkbox"]').forEach(cb=>{ if(!cb.checked){ try{ cb.click(); }catch{} } });
      dialog.querySelectorAll('div[role="checkbox"][aria-checked="false"], [role="checkbox"][aria-checked="false"] button').forEach(cb=>{ try{ cb.click(); }catch{} });
      const inputs = [...dialog.querySelectorAll('textarea, input[type="text"], [role="textbox"]')].filter(inp=>isVisible(inp)&&!inp.disabled&&inp.getAttribute("aria-disabled")!=="true");
      const questions=inputs.map(questionForInput);
      const answers=Array(inputs.length).fill("");
      const aiIndexes=questions.map((question,index)=>needsAiAnswer(question)?index:-1).filter(index=>index>=0);
      if(aiJoinEnabled&&aiIndexes.length){
        const aiQuestions=aiIndexes.map(index=>questions[index]);
        chrome.storage.local.set({groupStatus:`AI đang tính/trả lời ${aiQuestions.length} câu hỏi cần suy luận của nhóm ${groupName||"đang chọn"}...`});
        try{
          const ai=await chrome.runtime.sendMessage({action:"aiAnswerJoinQuestions",groupName:groupName||document.title,questions:aiQuestions,prompt:aiJoinPrompt,aiConfig:aiJoinConfig});
          if(ai?.ok){
            (ai.answers||[]).slice(0,aiIndexes.length).forEach((answer,index)=>{answers[aiIndexes[index]]=String(answer||"").trim();});
          }else console.warn("[Group AI]",ai?.error);
        }catch(e){console.warn("[Group AI]",e);}
        const missing=aiIndexes.filter(index=>!answers[index]);
        if(missing.length){
          chrome.storage.local.set({groupStatus:`AI chưa trả lời đủ câu hỏi cần tính (${aiIndexes.length-missing.length}/${aiIndexes.length}) của ${groupName||"nhóm"}; không gửi câu trả lời sai`});
          return false;
        }
      }
      let filled=0;
      for(let idx=0;idx<inputs.length;idx++){
        if(!isJoinActive())return false;
        const inp=inputs[idx];
        const ans = answers[idx]||cannedAnswerForQuestion(questions[idx],idx);
        try{
          inp.scrollIntoView({block:"center"});inp.click();inp.focus();document.execCommand("selectAll",false,null);
          const typed=await chrome.runtime.sendMessage({action:"trustedInput",text:ans,pressEnter:false});
          if(!typed?.ok)throw new Error(typed?.error||"Không nhập được bằng bàn phím");
          await sleep(350);
          const actual=cleanText(inp.value||inp.innerText||inp.textContent||"");
          if(actual.length<2)throw new Error("Facebook chưa nhận câu trả lời");
          filled++;
        }catch(e){ console.warn("[Group] dien cau hoi loi",e); }
      }
      if(inputs.length&&filled<inputs.length){chrome.storage.local.set({groupStatus:`Chưa điền đủ câu hỏi (${filled}/${inputs.length}) của ${groupName||"nhóm"}`});return false;}
      const btns = [...dialog.querySelectorAll('div[role="button"], button')];
      let submitBtn = null;
      for(const b of btns){
        const t=labelOf(b).toLowerCase();
        if(/^(?:gửi|gửi yêu cầu|gửi yêu cầu tham gia|gui|send|submit|hoàn tất|done|tham gia nhóm|join group|yêu cầu tham gia|đồng ý|tôi đồng ý|đồng ý với quy tắc|tôi đồng ý với quy tắc nhóm|chấp nhận|xác nhận|tiếp|tiếp tục|continue|next)$/i.test(t)){
          if(isVisible(b)&&b.getAttribute("aria-disabled")!=="true"&&!b.disabled) { submitBtn = b; break; }
        }
      }
      if(submitBtn){
        await sleep(600);
        const clicked=await clickGroupControl(submitBtn);
        if(clicked){
          const beforeDialogText=cleanText(dialog.innerText||"");
          const changed=await waitForCondition(()=>{
            const live=visibleMembershipDialog();
            return !live||!submitBtn.isConnected||submitBtn.getAttribute("aria-disabled")==="true"||cleanText(live.innerText||"")!==beforeDialogText;
          },8000);
          if(!visibleMembershipDialog()){console.log("[Group] Auto tra loi + bam Gui");await sleep(700);return true;}
          // “Tiếp/Tiếp tục” can advance from the rules screen to the
          // questions screen. Re-scan the new dialog instead of treating the
          // first step as a completed membership request.
          if(changed){await sleep(700);continue;}
        }
        chrome.storage.local.set({groupStatus:`Đã điền câu trả lời nhưng Facebook chưa nhận nút Gửi của ${groupName||"nhóm"}`});
        return false;
      }
      chrome.storage.local.set({groupStatus:`Đã điền câu trả lời nhưng nút Gửi của ${groupName||"nhóm"} chưa sẵn sàng`});
      return false;
    }
    return false;
  }

  function parseNumber(str){
    if(!str) return 0;
    str = str.toLowerCase().replace(/,/g,".").trim();
    let m = str.match(/([\d\.]+)\s*([km]?)/);
    if(!m) return parseInt(str.replace(/\D/g,""))||0;
    let num = parseFloat(m[1]);
    let unit = m[2];
    if(unit==="k") num*=1000;
    if(unit==="m") num*=1000000;
    return Math.round(num);
  }

  function extractGroupCards(){
    const candidates = [];
    document.querySelectorAll('a[href*="/groups/"]').forEach(a=>{
      const href = a.href.split("?")[0];
      if(!href.match(/\/groups\/\d+|\/groups\/[^\/]+\/?$/)) return;
      const card = a.closest('div[data-visualcompletion="ignore-dynamic"], div[role="article"], div') || a.parentElement;
      let container = a.closest('div[data-pagelet], div[role="article"]');
      if(!container) container = card.parentElement ? card.parentElement.parentElement : card;
      if(!container) return;
      if(container.dataset.groupParsed==="1") return;
      const txt = (container.innerText || "").toLowerCase();
      if(!txt.includes("thành viên") && !txt.includes("member")) return;
      let memberText = "";
      const memMatch = (container.innerText || "").match(/([\d\.,]+[KkMm]?)\s*(thành viên|member)/i);
      if(memMatch) memberText = memMatch[0];
      let members = parseNumber(memberText);
      let postsPerDay = 0;
      const txtOrig = container.innerText || "";
      let postMatch = txtOrig.match(/(\d+)\+?\s*bài viết\/?\s*(ngày|một ngày|day)/i);
      if(postMatch) postsPerDay = parseInt(postMatch[1]);
      else {
        postMatch = txtOrig.match(/(\d+)\+?\s*posts?\s*(a day|per day|\/day)/i);
        if(postMatch) postsPerDay = parseInt(postMatch[1]);
        else {
          const alt = txtOrig.match(/(\d+)\s*bài viết/i);
          if(alt) postsPerDay = parseInt(alt[1]) > 50 ? 10 : parseInt(alt[1]);
        }
      }
      let joinBtn = null;
      const btns = container.querySelectorAll('div[role="button"], a[role="button"], span');
      for(const b of btns){
        const t = (b.innerText || b.textContent || "").trim().toLowerCase();
        if(t==="tham gia nhóm" || t==="tham gia" || t==="join group" || t==="join" || t==="tham gia nhóm" ){
          const clickable = b.closest('div[role="button"]') || b;
          if(clickable.offsetParent !== null) { joinBtn = clickable; break; }
        }
      }
      if(!joinBtn){
        const nearBtns = document.querySelectorAll('div[role="button"]');
        for(const b of nearBtns){
          const t=(b.innerText||"").trim().toLowerCase();
          if(t.includes("tham gia") || t==="join" || t==="join group"){
            if(container.contains(b) || b.closest('div[data-pagelet]')===container) { joinBtn=b; break; }
          }
        }
      }
      const joinedTxt = txt.includes("đã tham gia") || txt.includes("joined") || txt.includes("đã gửi yêu cầu") || txt.includes("request sent");
      if(joinedTxt) return;
      container.dataset.groupParsed="1";
      candidates.push({ container, href, name: (a.innerText || a.textContent || href).trim().slice(0,80), members, memberText, postsPerDay, joinBtn, rawText: txtOrig.slice(0,300) });
    });
    return candidates;
  }

  function isPassFilter(g){
    return g.members >= minMembers && (minPostsPerDay===0 || g.postsPerDay >= minPostsPerDay || g.postsPerDay===0);
  }

  async function joinLoop(keyword){
    if(!location.href.includes("/search/groups")){
      chrome.storage.local.set({ pendingSearchJoin: true, pendingSearchKeyword: keyword, pendingSearchConfig: { minMembers, minPostsPerDay, targetJoin, minDelay, maxDelay, autoAnswers,aiJoinEnabled,aiJoinPrompt,aiJoinConfig } });
      const url = `https://www.facebook.com/search/groups/?q=${encodeURIComponent(keyword)}`;
      location.href = url;
      return;
    }
    chrome.storage.local.remove(["pendingSearchJoin","pendingSearchKeyword","pendingSearchConfig"]);
    isJoining = true;
    joinedCount = 0;
    chrome.storage.local.set({ groupStatus: `Dang tim nhom voi tu khoa "${keyword}"...`, groupJoined:0, groupFound:0 });
    let idle=0;
    let seenHrefs = new Set();
    let totalFound=0;
    let endStatus="";
    while(isJoining && joinedCount < targetJoin){
      const cards = extractGroupCards();
      const filtered = cards.filter(c=>{ if(seenHrefs.has(c.href)) return false; seenHrefs.add(c.href); return isPassFilter(c); });
      totalFound += filtered.length;
      chrome.storage.local.set({ groupFound: totalFound, groupStatus: `Tim thay ${totalFound} nhom dat tieu chi, da tham gia ${joinedCount}/${targetJoin}` });
      filtered.forEach(g=>{ if(g.joinBtn) g.joinBtn.style.outline="2px dashed #1877F2"; if(g.container) g.container.style.outline="1px solid #00c851"; });
      for(const g of filtered){
        if(!isJoining || joinedCount >= targetJoin) break;
        if(!g.joinBtn||!isVisible(g.joinBtn)||!g.joinBtn.isConnected) continue;
        g.joinBtn.scrollIntoView({behavior:"smooth", block:"center"});
        await sleep(800);
        try{
          const beforeJoinLabel=labelOf(g.joinBtn);
          const clicked=await clickGroupControl(g.joinBtn);
          if(!clicked){chrome.storage.local.set({groupStatus:`Facebook chưa nhận nút Tham gia của ${g.name}, bỏ qua an toàn`});continue;}
          const answered = await autoAnswerGroupQuestions(g.name,g.joinBtn);
          if(!answered&&visibleMembershipDialog()){chrome.storage.local.set({groupStatus:`Bỏ qua ${g.name}: Facebook chưa nhận đủ câu trả lời`});await closeMembershipDialog();await sleep(700);continue;}
          chrome.storage.local.set({groupStatus:`Đang chờ Facebook xác nhận tham gia: ${g.name}...`});
          const confirmed=await waitForJoinConfirmation(g.joinBtn,g.container,30000,g.href,beforeJoinLabel);
          if(!confirmed){chrome.storage.local.set({groupStatus:`Chưa xác nhận tham gia ${g.name}, không cộng vào kết quả`});continue;}
          joinedCount++;
          const extra = answered ? " (da tu tra loi cau hoi)" : "";
          chrome.storage.local.set({ groupJoined: joinedCount, groupStatus: `Da gui yeu cau ${joinedCount}/${targetJoin}: ${g.name} (${g.memberText})${extra}` });
          console.log(`[Group] Joined ${joinedCount}: ${g.name} members=${g.members} posts/day=${g.postsPerDay} link=${g.href} answered=${answered}`);
        }catch(e){ console.warn("[Group] click loi",e); }
        if(joinedCount >= targetJoin) break;
        await sleep(randDelay());
      }
      if(joinedCount >= targetJoin) break;
      const before = document.body.scrollHeight;
      window.scrollTo(0, document.body.scrollHeight);
      await sleep(2500);
      if(document.body.scrollHeight === before){ idle++; if(idle>=3){ endStatus=`Hết nhóm hoặc Facebook không tải thêm, dừng ở ${joinedCount}/${targetJoin} (tìm thấy ${totalFound} nhóm đạt tiêu chí)`; break; } } else idle=0;
      if(filtered.length===0){ idle++; if(idle>=4){endStatus=`Không còn nhóm mới đạt tiêu chí, dừng ở ${joinedCount}/${targetJoin}`;break;} }
    }
    if(!isJoining&&!endStatus)endStatus=`Đã dừng bởi người dùng ở ${joinedCount}/${targetJoin}`;
    if(!endStatus&&joinedCount>=targetJoin)endStatus=`Xong! Đã tham gia ${joinedCount}/${targetJoin} nhóm`;
    if(!endStatus)endStatus=`Đã kết thúc ở ${joinedCount}/${targetJoin} nhóm`;
    isJoining=false;
    chrome.storage.local.set({ groupStatus:endStatus, groupJoined: joinedCount, isGroupJoining:false });
  }

  function resetGroup(){
    isJoining=false;
    joinedCount=0;
    document.querySelectorAll('[data-group-parsed="1"]').forEach(el=>{ delete el.dataset.groupParsed; el.style.outline=""; });
    chrome.storage.local.set({ groupStatus:"Da reset - san sang tim nhom moi", groupJoined:0, groupFound:0, isGroupJoining:false });
    chrome.storage.local.remove(["discoverGroups","discoverIndex"]);
  }

  // ===== THAM GIA THEO KHAM PHA (Goi y khac) =====
  let isDiscoverJoining = false;
  let discoverJoined = 0;
  let discoverTarget = 10;
  let discoverMinDelay = 5000, discoverMaxDelay = 15000;
  const DISCOVER_URL = "https://www.facebook.com/groups/discover";
  const isDiscoverPage = ()=>/^\/groups\/discover\/?$/i.test(location.pathname);
  let discoverRouteGuardTimer=0;
  let discoverRedirecting=false;
  function discoverRunConfig(){
    return {
      target: discoverTarget,
      minDelay: discoverMinDelay/1000,
      maxDelay: discoverMaxDelay/1000,
      answersText: autoAnswers.join("\n"),
      aiJoinEnabled,
      aiJoinPrompt,
      aiConfig: aiJoinConfig
    };
  }
  function applyDiscoverConfig(cfg={}){
    discoverTarget = Math.max(1,parseInt(cfg.target)||10);
    discoverMinDelay = Math.max(1,parseInt(cfg.minDelay)||5)*1000;
    discoverMaxDelay = Math.max(discoverMinDelay,Math.max(1,parseInt(cfg.maxDelay)||15)*1000);
    if(cfg.answersText!==undefined){
      autoAnswers = String(cfg.answersText||"").split("\n").map(s=>s.trim()).filter(Boolean);
      if(autoAnswers.length===0)autoAnswers=["Tôi đồng ý với quy tắc nhóm"];
    }
    aiJoinEnabled=!!cfg.aiJoinEnabled;
    aiJoinPrompt=cfg.aiJoinPrompt||"";
    aiJoinConfig=cfg.aiConfig||{};
  }
  async function requestDiscoverReturn(){
    if(!isDiscoverJoining||isDiscoverPage())return isDiscoverPage();
    if(discoverRedirecting)return false;
    discoverRedirecting=true;
    const config=discoverRunConfig();
    try{
      await chrome.storage.local.set({
        pendingDiscoverJoin:true,
        pendingDiscoverConfig:config,
        discoverRunConfig:config,
        isDiscoverJoining:true,
        discoverStatus:`Đang quay lại trang Khám phá để tiếp tục (${discoverJoined}/${discoverTarget})...`
      });
      if(isDiscoverJoining&&!isDiscoverPage())location.replace(DISCOVER_URL);
    }catch(_){
      discoverRedirecting=false;
    }
    return false;
  }
  function startDiscoverRouteGuard(){
    if(discoverRouteGuardTimer)return;
    discoverRouteGuardTimer=setInterval(()=>{
      if(!isDiscoverJoining){clearDiscoverRouteGuard();return;}
      if(!isDiscoverPage())requestDiscoverReturn();
    },800);
  }
  function clearDiscoverRouteGuard(){
    if(discoverRouteGuardTimer){clearInterval(discoverRouteGuardTimer);discoverRouteGuardTimer=0;}
    discoverRedirecting=false;
  }
  function randDiscoverDelay(){ return Math.floor(Math.random()*(discoverMaxDelay-discoverMinDelay+1))+discoverMinDelay; }

  function extractDiscoverCards(){
    const candidates = [];
    // tren trang facebook.com/groups/discover hoac /groups/ - moi card la div chua "Tham gia nhóm"
    document.querySelectorAll('div[role="button"]').forEach(btn=>{
      const t = (btn.innerText||"").trim().toLowerCase();
      if(t !== "tham gia nhóm" && t !== "tham gia" && t !== "join group" && t !== "join") return;
      if(btn.dataset.discoverParsed==="1") return;
      if(btn.offsetParent===null) return;
      // bo nut da tham gia / da gui
      const container = btn.closest('div[data-pagelet], div[style*="border"], div') || btn.parentElement;
      const txt = (container ? container.innerText : btn.parentElement.innerText || "").toLowerCase();
      if(txt.includes("đã tham gia") || txt.includes("joined") || txt.includes("đã gửi")) return;
      // tim link nhom gan do
      let href = "";
      let name = "";
      let node=btn;
      for(let depth=0;node&&depth<10&&!href;depth++,node=node.parentElement){
        const linkEl=[...node.querySelectorAll('a[href*="/groups/"]')].find(a=>a.href&&!/\/groups\/(?:discover|joins|feed)(?:\/|$)/i.test(a.href));
        if(linkEl){
          href=linkEl.href.split("?")[0];
          name=cleanText(linkEl.innerText||linkEl.textContent||"").slice(0,120);
        }
      }
      btn.dataset.discoverParsed="1";
      candidates.push({ btn, href, name, container });
    });
    // fallback: tim tat ca nut Tham gia nhom con sot
    if(candidates.length===0){
      document.querySelectorAll('span').forEach(s=>{
        const t=(s.innerText||"").trim().toLowerCase();
        if(t==="tham gia nhóm"){
          const btn=s.closest('div[role="button"]');
          if(btn && btn.dataset.discoverParsed!=="1" && btn.offsetParent!==null){
            btn.dataset.discoverParsed="1";
            const container=btn.closest('div');
            candidates.push({ btn, href:"", name:cleanText(container?.innerText||"").slice(0,120), container });
          }
        }
      });
    }
    return candidates;
  }

  async function discoverLoop(resume=false){
    const config=discoverRunConfig();
    // Chỉ trang /groups/discover mới là nguồn dữ liệu của luồng Khám phá.
    // Nếu người dùng bấm về Bảng tin, vào nhóm khác hoặc mở URL Facebook
    // khác, giữ nguyên tiến độ rồi tự quay lại đúng trang này.
    if(!isDiscoverPage()){
      await requestDiscoverReturn();
      return;
    }
    if(resume){
      const saved=await chrome.storage.local.get(["discoverJoined","discoverRunConfig"]);
      if(saved.discoverRunConfig){applyDiscoverConfig(saved.discoverRunConfig);}
      discoverJoined=Math.max(0,parseInt(saved.discoverJoined)||0);
    }else{
      discoverJoined=0;
    }
    // Xóa cờ chờ chỉ sau khi đã vào đúng trang; runConfig vẫn được giữ để
    // khôi phục nếu người dùng rời trang lần nữa giữa chừng.
    await chrome.storage.local.set({
      discoverJoined,
      discoverRunConfig:discoverRunConfig(),
      isDiscoverJoining:true,
      discoverStatus:resume&&discoverJoined?`Tiếp tục Khám phá từ ${discoverJoined}/${discoverTarget}...`:"Đang tham gia theo Khám phá..."
    });
    chrome.storage.local.remove(["pendingDiscoverJoin","pendingDiscoverConfig"]);
    startDiscoverRouteGuard();
    let idle=0;
    let endStatus="";
    while(isDiscoverJoining && discoverJoined < discoverTarget){
      if(!isDiscoverPage()){
        await requestDiscoverReturn();
        return;
      }
      const cards = extractDiscoverCards();
      if(cards.length===0){
        idle++;
        if(idle>=2){
          window.scrollTo(0, document.body.scrollHeight);
          await sleep(2500);
          const more = extractDiscoverCards();
          if(more.length===0 && idle>=4){
            endStatus=`Hết nhóm gợi ý, dừng ở ${discoverJoined}/${discoverTarget}`;
            break;
          }
        } else {
          window.scrollBy(0, 800);
          await sleep(1500);
          continue;
        }
      } else idle=0;

      for(const c of cards){
        if(!isDiscoverJoining || discoverJoined >= discoverTarget) break;
        if(!isDiscoverPage()){
          await requestDiscoverReturn();
          return;
        }
        if(!c.btn?.isConnected||!isVisible(c.btn))continue;
        c.btn.scrollIntoView({behavior:"smooth", block:"center"});
        await sleep(700);
        try{
          const beforeJoinLabel=labelOf(c.btn);
          const clicked=await clickGroupControl(c.btn);
          if(!clicked){chrome.storage.local.set({discoverStatus:"Facebook chưa nhận nút Tham gia, bỏ qua nhóm này"});continue;}
          const answered = await autoAnswerGroupQuestions(c.name||"",c.btn);
          if(!answered&&visibleMembershipDialog()){chrome.storage.local.set({discoverStatus:"Bỏ qua nhóm: Facebook chưa nhận đủ câu trả lời"});await closeMembershipDialog();await sleep(700);continue;}
          chrome.storage.local.set({discoverStatus:`Đang chờ Facebook xác nhận nhóm ${discoverJoined+1}/${discoverTarget}...`});
          const confirmed=await waitForJoinConfirmation(c.btn,c.container,30000,c.href,beforeJoinLabel);
          if(!confirmed){chrome.storage.local.set({discoverStatus:"Facebook chưa xác nhận tham gia, không cộng nhóm này"});continue;}
          discoverJoined++;
          const extra = answered ? " (da tra loi)" : "";
          chrome.storage.local.set({ discoverJoined, discoverStatus: `Da tham gia ${discoverJoined}/${discoverTarget}${extra}` });
          console.log(`[Discover] Joined ${discoverJoined}/${discoverTarget} href=${c.href} answered=${answered}`);
        }catch(e){ console.warn(e); }
        if(discoverJoined >= discoverTarget) break;
        await sleep(randDiscoverDelay());
      }
      if(discoverJoined >= discoverTarget) break;
      window.scrollTo(0, document.body.scrollHeight);
      await sleep(2200);
    }
    if(!isDiscoverJoining&&!endStatus)endStatus=`Đã dừng bởi người dùng ở ${discoverJoined}/${discoverTarget}`;
    if(!endStatus&&discoverJoined>=discoverTarget)endStatus=`Xong! Đã tham gia ${discoverJoined}/${discoverTarget} nhóm theo Khám phá`;
    if(!endStatus)endStatus=`Đã kết thúc ở ${discoverJoined}/${discoverTarget} nhóm theo Khám phá`;
    isDiscoverJoining=false;
    clearDiscoverRouteGuard();
    chrome.storage.local.set({ isDiscoverJoining:false, discoverStatus:endStatus });
    chrome.storage.local.remove(["discoverRunConfig","pendingDiscoverJoin","pendingDiscoverConfig"]);
  }

  function resetDiscover(){
    isDiscoverJoining=false;
    clearDiscoverRouteGuard();
    discoverJoined=0;
    document.querySelectorAll('[data-discover-parsed="1"]').forEach(el=>{ delete el.dataset.discoverParsed; el.style.outline=""; });
    chrome.storage.local.set({ discoverJoined:0, discoverStatus:"Da reset Kham pha", isDiscoverJoining:false });
    chrome.storage.local.remove(["discoverRunConfig","pendingDiscoverJoin","pendingDiscoverConfig"]);
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse)=>{
    if(msg.action==="startGroupJoin"){
      if(isJoining||isDiscoverJoining){ sendResponse({ok:false, msg:"Một luồng tham gia nhóm khác đang chạy"}); return true; }
      minMembers = parseInt(msg.minMembers)||10000;
      minPostsPerDay = parseInt(msg.minPostsPerDay)||0;
      targetJoin = parseInt(msg.targetJoin)||10;
      minDelay = (parseInt(msg.minDelay)||5)*1000;
      maxDelay = (parseInt(msg.maxDelay)||15)*1000;
      if(msg.answers && Array.isArray(msg.answers) && msg.answers.length>0){
        autoAnswers = msg.answers;
      } else if(msg.answersText){
        autoAnswers = msg.answersText.split("\n").map(s=>s.trim()).filter(Boolean);
        if(autoAnswers.length===0) autoAnswers = ["Tôi đồng ý với quy tắc nhóm"];
      }
      aiJoinEnabled=!!msg.aiJoinEnabled;aiJoinPrompt=msg.aiJoinPrompt||"";aiJoinConfig=msg.aiConfig||{};
      chrome.storage.local.set({ isGroupJoining:true });
      joinLoop(msg.keyword);
      sendResponse({ok:true});
    } else if(msg.action==="startDiscoverJoin"){
      if(isDiscoverJoining||isJoining){ sendResponse({ok:false, msg:"Một luồng tham gia nhóm khác đang chạy"}); return true; }
      discoverTarget = parseInt(msg.target)||10;
      discoverMinDelay = (parseInt(msg.minDelay)||5)*1000;
      discoverMaxDelay = (parseInt(msg.maxDelay)||15)*1000;
      if(msg.answersText){
        autoAnswers = msg.answersText.split("\n").map(s=>s.trim()).filter(Boolean);
        if(autoAnswers.length===0) autoAnswers = ["Tôi đồng ý với quy tắc nhóm"];
      }
      aiJoinEnabled=!!msg.aiJoinEnabled;aiJoinPrompt=msg.aiJoinPrompt||"";aiJoinConfig=msg.aiConfig||{};
      const runConfig=discoverRunConfig();
      chrome.storage.local.set({ isDiscoverJoining:true,discoverJoined:0,discoverRunConfig:runConfig,discoverStatus:`Đang tham gia ${discoverTarget} nhóm theo Khám phá...` });
      discoverLoop(false);
      sendResponse({ok:true});
    } else if(msg.action==="stopGroupJoin"){
      isJoining=false;
      chrome.storage.local.set({ isGroupJoining:false, groupStatus:"Da dung" });
      sendResponse({ok:true});
    } else if(msg.action==="stopDiscoverJoin"){
      isDiscoverJoining=false;
      clearDiscoverRouteGuard();
      chrome.storage.local.set({ isDiscoverJoining:false, discoverStatus:"Da dung" });
      chrome.storage.local.remove(["discoverRunConfig","pendingDiscoverJoin","pendingDiscoverConfig"]);
      sendResponse({ok:true});
    } else if(msg.action==="resetGroupJoin"){
      resetGroup();
      sendResponse({ok:true});
    } else if(msg.action==="resetDiscoverJoin"){
      resetDiscover();
      sendResponse({ok:true});
    } else if(msg.action==="getGroupStatus"){
      sendResponse({isJoining, joinedCount});
    } else if(msg.action==="getDiscoverStatus"){
      sendResponse({isDiscoverJoining, discoverJoined});
    }
    return true;
  });

  // Tự khôi phục luồng Khám phá sau mọi điều hướng. Không chỉ kiểm tra
  // /groups: /groups/{id}, /home và các trang Facebook khác đều phải quay
  // lại /groups/discover nếu phiên đang hoạt động.
  (async ()=>{
    const p = await chrome.storage.local.get(["pendingDiscoverJoin","pendingDiscoverConfig","isDiscoverJoining","discoverRunConfig","discoverJoined"]);
    const cfg=p.discoverRunConfig||p.pendingDiscoverConfig||(p.isDiscoverJoining?{target:10,minDelay:5,maxDelay:15,answersText:"",aiJoinEnabled:false,aiJoinPrompt:"",aiConfig:{}}:null);
    if(p.isDiscoverJoining&&cfg){
      applyDiscoverConfig(cfg);
      discoverJoined=Math.max(0,parseInt(p.discoverJoined)||0);
      isDiscoverJoining=true;
      if(!isDiscoverPage()){
        await requestDiscoverReturn();
        return;
      }
      await sleep(1800);
      if(isDiscoverJoining)discoverLoop(true);
    }else if(p.pendingDiscoverJoin&&p.pendingDiscoverConfig&&isDiscoverPage()){
      // Tương thích với các phiên cũ chỉ lưu pendingDiscoverConfig.
      applyDiscoverConfig(p.pendingDiscoverConfig);
      discoverJoined=Math.max(0,parseInt(p.discoverJoined)||0);
      isDiscoverJoining=true;
      await sleep(1800);
      discoverLoop(true);
    }
  })();

  // tu dong tiep tuc tim nhom theo tu khoa sau khi redirect
  (async ()=>{
    const s = await chrome.storage.local.get(["pendingSearchJoin","pendingSearchKeyword","pendingSearchConfig","isGroupJoining"]);
    if(s.pendingSearchJoin && s.pendingSearchKeyword && location.href.includes("/search/groups")){
      const cfg = s.pendingSearchConfig;
      if(cfg){
        minMembers = cfg.minMembers; minPostsPerDay = cfg.minPostsPerDay; targetJoin = cfg.targetJoin; minDelay=cfg.minDelay; maxDelay=cfg.maxDelay; autoAnswers=cfg.autoAnswers||autoAnswers;aiJoinEnabled=!!cfg.aiJoinEnabled;aiJoinPrompt=cfg.aiJoinPrompt||"";aiJoinConfig=cfg.aiJoinConfig||{};
      }
      chrome.storage.local.remove(["pendingSearchJoin","pendingSearchKeyword","pendingSearchConfig"]);
      await sleep(2500);
      if(!isJoining){
        isJoining=true;
        chrome.storage.local.set({ isGroupJoining:true, groupStatus:`Tu dong bat dau tim "${s.pendingSearchKeyword}"...` });
        joinLoop(s.pendingSearchKeyword);
      }
    }
  })();

  console.log("[Group] group.js loaded v1.8.12");
})();
