// FB Auto Tool - three-source friend request engine.
(() => {
  const MODE_SUGGESTIONS="suggestions";
  const MODE_GROUP_COMMON="group-common";
  const HISTORY_UNCERTAIN_TTL=24*60*60*1000;
  const MAX_TRACKED_PROFILES=2000;
  const GROUP_LOAD_WAIT_MS=120000;
  const GROUP_LOADING_GRACE_MS=30000;
  const GROUP_LOAD_RELOADS=1;
  const RESERVED_PATHS=new Set([
    "about","ads","bookmarks","events","friends","gaming","groups","help","home.php",
    "marketplace","messages","notifications","pages","photo","privacy","profile.php","reel",
    "search","settings","stories","watch"
  ]);

  let loopActive=false;
  let localRunId="";
  let stopRequested=false;

  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const cleanText=value=>String(value||"").replace(/[\u200B-\u200D\u2060\uFEFF]/g,"").replace(/\s+/g," ").trim();
  const lower=value=>cleanText(value).toLocaleLowerCase("vi");
  const rand=(min,max)=>Math.floor(Math.random()*(Math.max(min,max)-Math.min(min,max)+1))+Math.min(min,max);

  function isVisible(el){
    if(!el?.isConnected)return false;
    const rect=el.getBoundingClientRect();
    if(rect.width<8||rect.height<8)return false;
    const style=getComputedStyle(el);
    return style.display!=="none"&&style.visibility!=="hidden"&&Number(style.opacity||1)>0;
  }

  function buttonLabel(el){
    return cleanText(el?.getAttribute?.("aria-label")||el?.innerText||el?.textContent);
  }

  function isExactAddFriendButton(el){
    if(!el||!isVisible(el)||el.matches('[aria-disabled="true"],:disabled'))return false;
    const text=lower(buttonLabel(el));
    if(!text||text.length>150)return false;
    if(/^(?:kết bạn|thêm bạn|thêm bạn bè|gửi lời mời kết bạn|gửi yêu cầu kết bạn|gửi lời mời|add friend)(?:\s+(?:với|with|cho|tới|đến)\s+.{1,100})?$/.test(text))return true;
    if(/^thêm\s+.{1,100}\s+(?:làm bạn bè|vào danh sách bạn bè|vào bạn bè)$/.test(text))return true;
    if(/^(?:gửi lời mời kết bạn|gửi yêu cầu kết bạn|kết bạn|thêm bạn|add friend)\s+.{1,100}$/.test(text))return true;
    return false;
  }

  function isPendingFriendLabel(value){
    return /^(?:đã gửi|đã gửi lời mời|hủy lời mời|hủy yêu cầu|request sent|cancel request)(?:\s+.*)?$/.test(lower(value));
  }

  function profileKeyFromHref(href){
    let url;
    try{url=new URL(href,location.origin);}catch{return "";}
    if(!/(^|\.)facebook\.com$/i.test(url.hostname))return "";
    const id=url.searchParams.get("id");
    if(id&&/^\d+$/.test(id))return `id:${id}`;
    const groupUser=url.pathname.match(/^\/groups\/[^/]+\/user\/(\d+)/i);
    if(groupUser)return `id:${groupUser[1]}`;
    const peopleMatch=url.pathname.match(/^\/people\/[^/]+\/(\d+)/i)||url.pathname.match(/^\/people\/(\d+)/i);
    if(peopleMatch)return `id:${peopleMatch[1]}`;
    const parts=url.pathname.split("/").filter(Boolean);
    if(parts.length===1){
      const username=decodeURIComponent(parts[0]).toLocaleLowerCase("vi");
      if(!username||RESERVED_PATHS.has(username)||(username.includes(".")&&/^(?:home|login)\./.test(username)))return "";
      if(!/^[\p{L}\p{N}._-]{2,100}$/u.test(username))return "";
      return `user:${username}`;
    }
    if(parts.length===2&&parts[0].toLowerCase()==="people"){
      const username=decodeURIComponent(parts[1]).toLocaleLowerCase("vi");
      if(username&&!RESERVED_PATHS.has(username)&&/^[\p{L}\p{N}._-]{2,100}$/u.test(username))return `user:${username}`;
    }
    return "";
  }

  function findPrimaryProfileLink(cardNode){
    const links=[...cardNode.querySelectorAll('a[href]')];
    let bestLink=null;
    let bestScore=-1;
    for(const link of links){
      const href=link.href||"";
      if(/mutual|friends_mutual|\/friends\//i.test(href))continue;
      const key=profileKeyFromHref(href);
      if(!key)continue;
      let score=1;
      if(link.querySelector('img'))score+=5;
      if(link.closest('h1,h2,h3,h4,strong,[role="heading"]'))score+=3;
      if(link.getAttribute("aria-label"))score+=2;
      if(score>bestScore){
        bestScore=score;
        bestLink=link;
      }
    }
    return bestLink;
  }

  function candidateFromButton(button,sourceRoot){
    if(!isExactAddFriendButton(button)||button.closest('[role="dialog"],[role="menu"]'))return null;
    const main=sourceRoot||button.closest('div[role="main"],main')||document.querySelector('div[role="main"],main');
    if(!main||!main.contains(button))return null;
    let node=button.parentElement;
    for(let depth=0;node&&node!==main&&depth<10;depth++,node=node.parentElement){
      const link=findPrimaryProfileLink(node);
      if(!link)continue;
      const key=profileKeyFromHref(link.href);
      if(!key)continue;
      const linkText=cleanText(link.getAttribute("aria-label")||link.innerText||link.textContent);
      const name=(linkText||cleanText(node.innerText||node.textContent).split(" ").slice(0,8).join(" ")).slice(0,120);
      const cardText=cleanText(node.innerText||node.textContent);
      const mutualMatch=cardText.match(/(\d{1,4})\s+(?:bạn chung|mutual friends?)/i);
      return {key,name,url:link.href,button,card:node,mutualCount:mutualMatch?parseInt(mutualMatch[1]):null};
    }
    return null;
  }

  function rawAddButtons(root){
    if(!root)return [];
    return [...root.querySelectorAll('button,[role="button"]')].filter(isExactAddFriendButton);
  }

  function findGroupCommonHeadings(){
    const main=document.querySelector('div[role="main"],main');
    if(!main)return [];
    const headingPattern=/(?:thành viên có điểm chung|những thành viên có điểm chung|cùng có điểm chung|members? with things in common|people with things in common|things in common)/i;
    return [...main.querySelectorAll('[role="heading"],h1,h2,h3,h4,span,div')].filter(el=>{
      if(!isVisible(el))return false;
      const value=lower(el.getAttribute("aria-label")||(el.children.length?el.innerText:el.textContent));
      return value.length<=120&&headingPattern.test(value);
    });
  }

  function findGroupCommonSection(){
    const main=document.querySelector('div[role="main"],main');
    if(!main)return null;
    for(const heading of findGroupCommonHeadings()){
      let node=heading.parentElement;
      for(let depth=0;node&&node!==main&&depth<9;depth++,node=node.parentElement){
        if(rawAddButtons(node).length)return node;
      }
    }
    return null;
  }

  function isGroupCommonAllPage(){
    return /^\/groups\/[^/]+\/members\/things_in_common(?:\/|$)/i.test(location.pathname);
  }

  function findGroupCommonAllLink(){
    const main=document.querySelector('div[role="main"],main');
    if(!main)return null;
    for(const heading of findGroupCommonHeadings()){
      let node=heading.parentElement;
      for(let depth=0;node&&node!==main&&depth<10;depth++,node=node.parentElement){
        const link=[...node.querySelectorAll('a[href]')].find(el=>{
          if(!isVisible(el)||!/^(?:xem tất cả|see all)$/.test(lower(buttonLabel(el))))return false;
          try{
            const url=new URL(el.href,location.origin);
            return /^\/groups\/[^/]+\/members\/things_in_common(?:\/|$)/i.test(url.pathname);
          }catch{return false;}
        });
        if(link)return link;
      }
    }
    return null;
  }

  function groupCommonFullListReady(){
    if(isGroupCommonAllPage()){
      const main=document.querySelector('div[role="main"],main');
      return !!(main && rawAddButtons(main).length>0);
    }
    return findGroupCommonHeadings().length>0&&!findGroupCommonAllLink();
  }

  function currentSourceRoot(mode){
    if(mode===MODE_GROUP_COMMON){
      if(isGroupCommonAllPage()){
        const section=findGroupCommonSection();
        return section||document.querySelector('div[role="main"],main');
      }
      const section=findGroupCommonSection();
      return section||document.querySelector('div[role="main"],main');
    }
    if(mode===MODE_SUGGESTIONS){
      const headings=[...document.querySelectorAll('[role="heading"],h1,h2,h3')]
        .filter(h=>isVisible(h)&&/(?:những người bạn có thể biết|gợi ý|gợi ý kết bạn|people you may know|suggestions)/i.test(lower(h.innerText||h.textContent)));
      for(const heading of headings){
        let node=heading.parentElement;
        for(let depth=0;node&&node!==document.body&&depth<12;depth++,node=node.parentElement){
          if(rawAddButtons(node).length)return node;
        }
      }
      const namedNav=[...document.querySelectorAll('nav,[role="navigation"]')]
        .find(root=>isVisible(root)&&/(?:gợi ý|suggestions)/i.test(lower(root.getAttribute("aria-label")))&&rawAddButtons(root).length);
      if(namedNav)return namedNav;
    }
    return document.querySelector('div[role="main"],main');
  }

  function sourceReady(mode){
    if(mode===MODE_SUGGESTIONS)return /\/friends\/suggestions(?:\/|$)/.test(location.pathname);
    return mode===MODE_GROUP_COMMON&&/^\/groups\/[^/]+\/members(?:\/|$)/.test(location.pathname);
  }

  function groupMembersUrl(group){
    const id=String(group?.id||"").trim();
    if(!id)return "";
    return `${location.origin}/groups/${encodeURIComponent(id)}/members/`;
  }

  function groupCommonAllUrl(group){
    const id=String(group?.id||"").trim();
    if(!id)return "";
    return `${location.origin}/groups/${encodeURIComponent(id)}/members/things_in_common/`;
  }

  function expectedSourceUrl(state){
    if(state.mode===MODE_SUGGESTIONS)return `${location.origin}/friends/suggestions`;
    const group=state.config?.groups?.[state.groupIndex||0];
    return groupMembersUrl(group);
  }

  function isCorrectSource(state){
    if(!sourceReady(state.mode))return false;
    if(state.mode!==MODE_GROUP_COMMON)return true;
    const group=state.config?.groups?.[state.groupIndex||0];
    const current=location.pathname.match(/^\/groups\/([^/]+)/i)?.[1]||"";
    return decodeURIComponent(current)===String(group?.id||"");
  }

  async function ownTabId(){
    try{return (await chrome.runtime.sendMessage({action:"getSenderTabId"}))?.tabId||null;}catch{return null;}
  }

  async function loadHistory(){
    const stored=await chrome.storage.local.get("friendProfileHistory");
    const history=stored.friendProfileHistory&&typeof stored.friendProfileHistory==="object"?stored.friendProfileHistory:{};
    const now=Date.now();
    for(const [key,item] of Object.entries(history)){
      if(!item?.time||(item.status==="uncertain"&&now-item.time>HISTORY_UNCERTAIN_TTL))delete history[key];
    }
    return history;
  }

  async function saveHistory(history){
    const entries=Object.entries(history).sort((a,b)=>(b[1]?.time||0)-(a[1]?.time||0)).slice(0,MAX_TRACKED_PROFILES);
    await chrome.storage.local.set({friendProfileHistory:Object.fromEntries(entries)});
  }

  function normalizeConfig(input={}){
    const min=Math.max(1000,parseInt(input.minDelay)||5000);
    const max=Math.max(1000,parseInt(input.maxDelay)||15000);
    const mode=[MODE_SUGGESTIONS,MODE_GROUP_COMMON].includes(input.mode)?input.mode:MODE_SUGGESTIONS;
    return {
      mode,
      minDelay:Math.min(min,max),
      maxDelay:Math.max(min,max),
      maxRequests:Math.max(1,Math.min(100,parseInt(input.maxRequests)||20)),
      minMutual:Math.max(0,parseInt(input.minMutual)||0),
      groups:Array.isArray(input.groups)?input.groups.filter(g=>g?.id).map(g=>({id:String(g.id),name:cleanText(g.name),url:g.url||""})):[]
    };
  }

  async function publishState(state,message){
    if(message)state.status=message;
    state.updatedAt=Date.now();
    await chrome.storage.local.set({
      friendRunState:state,
      isRunning:!!state.active,
      sentCount:state.sentCount||0,
      friendSkipped:state.skippedCount||0,
      friendUncertain:state.uncertainCount||0,
      friendStatus:state.status||"",
      lastMessage:state.status||""
    });
  }

  async function readActiveState(runId){
    const stored=await chrome.storage.local.get("friendRunState");
    const state=stored.friendRunState;
    if(!state?.active||state.runId!==runId||stopRequested)return null;
    return state;
  }

  async function stopRun(reason,runId=""){
    const stored=await chrome.storage.local.get("friendRunState");
    const state=stored.friendRunState||{};
    if(runId&&state.runId&&state.runId!==runId)return;
    state.active=false;
    state.nextAllowedAt=0;
    stopRequested=true;
    await publishState(state,reason||"Đã dừng kết bạn");
  }

  function pageRestriction(){
    if(/checkpoint|login|recover/i.test(location.pathname))return "Facebook yêu cầu đăng nhập hoặc xác minh tài khoản";
    const text=[...document.querySelectorAll('[role="alert"],[role="dialog"]')]
      .filter(isVisible).map(el=>lower(el.innerText||el.textContent)).join(" ");
    if(/tạm thời bị chặn|bạn không thể gửi lời mời kết bạn|không thể gửi lời mời kết bạn lúc này|temporarily blocked|you can.t send friend requests|friend request limit|xác minh tài khoản/.test(text)){
      return "Facebook đang giới hạn gửi lời mời; đã dừng để bảo vệ tài khoản";
    }
    if(/bạn có biết người này|do you know this person/.test(text))return "Facebook đang cảnh báo về lời mời kết bạn; đã dừng";
    return "";
  }

  function collectCandidates(state,history){
    const root=currentSourceRoot(state.mode);
    if(!root)return {ready:false,candidates:[]};
    const attempted=new Set(state.attemptedKeys||[]);
    const map=new Map();
    for(const button of rawAddButtons(root)){
      const candidate=candidateFromButton(button,root);
      if(!candidate||attempted.has(candidate.key)||history[candidate.key])continue;
      if(state.config.minMutual>0&&(candidate.mutualCount==null||candidate.mutualCount<state.config.minMutual))continue;
      if(!map.has(candidate.key))map.set(candidate.key,candidate);
    }
    const candidates=[...map.values()];
    candidates.sort((a,b)=>{
      const rectA=a.button.getBoundingClientRect();
      const rectB=b.button.getBoundingClientRect();
      if(Math.abs(rectA.top - rectB.top) > 12){
        return rectA.top - rectB.top;
      }
      return rectA.left - rectB.left;
    });
    return {ready:true,candidates};
  }

  function highlightCandidates(candidates){
    document.querySelectorAll('[data-friend-scan="1"]').forEach(el=>{delete el.dataset.friendScan;el.style.outline="";});
    for(const candidate of candidates){
      candidate.button.dataset.friendScan="1";
      candidate.button.style.outline="3px solid #1877f2";
      candidate.button.title=`FB Auto Tool: ${candidate.name||candidate.key}`;
    }
  }

  async function trustedClick(el){
    if(!isVisible(el))return false;
    try{
      el.scrollIntoView({behavior:"instant",block:"center"});
    }catch{
      try{el.scrollIntoView({behavior:"smooth",block:"center"});}catch{}
    }
    await sleep(400);
    const rect=el.getBoundingClientRect();
    const x=Math.round(rect.left+rect.width/2),y=Math.round(rect.top+rect.height/2);
    let debuggerSuccess=false;
    if(x>=0&&y>=0&&x<=window.innerWidth&&y<=window.innerHeight){
      const hit=document.elementFromPoint(x,y);
      if(hit&&(hit===el||el.contains(hit)||hit.contains(el))){
        try{
          const result=await chrome.runtime.sendMessage({action:"trustedMouse",kind:"click",x,y});
          if(result?.ok)debuggerSuccess=true;
        }catch{}
      }
    }
    if(debuggerSuccess)return true;
    try{el.click();return true;}catch{return false;}
  }

  async function maybeConfirmFriendDialog(){
    const dialogs=[...document.querySelectorAll('[role="dialog"]')].filter(isVisible);
    for(const dialog of dialogs){
      const dialogText=lower(dialog.innerText||dialog.textContent);
      if(/bạn có biết người này|do you know this person|tạm thời bị chặn|temporarily blocked/.test(dialogText))return "blocked";
      const confirm=[...dialog.querySelectorAll('button,[role="button"]')].find(el=>/^(?:gửi lời mời kết bạn|gửi lời mời|send friend request|send request)$/.test(lower(buttonLabel(el)))&&isVisible(el));
      if(confirm)return await trustedClick(confirm)?"clicked":"failed";
    }
    return "none";
  }

  async function attemptCandidate(candidate,runId){
    const successBefore=new Set([...document.querySelectorAll('[role="alert"],[role="status"]')]
      .filter(isVisible).map(el=>lower(el.innerText||el.textContent)).filter(Boolean));
    candidate.button.style.outline="3px solid #00a400";
    if(!await trustedClick(candidate.button))return {kind:"failed",message:"Không bấm được đúng nút Kết bạn"};
    await sleep(500);
    const dialogResult=await maybeConfirmFriendDialog();
    if(dialogResult==="blocked")return {kind:"blocked",message:"Facebook hiển thị cảnh báo lời mời kết bạn"};
    if(dialogResult==="failed")return {kind:"uncertain",message:"Không bấm được nút xác nhận lời mời"};
    for(let i=0;i<14;i++){
      if(!await readActiveState(runId))return {kind:"stopped"};
      const restriction=pageRestriction();
      if(restriction)return {kind:"blocked",message:restriction};
      const currentLabel=buttonLabel(candidate.button);
      const cardText=cleanText(candidate.card?.innerText||candidate.card?.textContent);
      const successAlert=[...document.querySelectorAll('[role="alert"],[role="status"]')]
        .filter(isVisible).map(el=>lower(el.innerText||el.textContent))
        .some(text=>!successBefore.has(text)&&/đã gửi lời mời kết bạn|friend request (?:was )?sent/.test(text));
      if(isPendingFriendLabel(currentLabel)||/(?:đã gửi lời mời|hủy lời mời|request sent|cancel request)/i.test(cardText)||successAlert)return {kind:"confirmed"};
      await sleep(500);
    }
    return {kind:"uncertain",message:"Facebook chưa trả về xác nhận gửi lời mời"};
  }

  async function waitForSchedule(runId){
    while(true){
      const state=await readActiveState(runId);
      if(!state)return false;
      const remain=(parseInt(state.nextAllowedAt)||0)-Date.now();
      if(remain<=0)return true;
      const seconds=Math.max(1,Math.ceil(remain/1000));
      if(state.lastShownSecond!==seconds){
        state.lastShownSecond=seconds;
        await publishState(state,`Chờ ${seconds} giây trước lời mời tiếp theo (${state.sentCount}/${state.config.maxRequests})`);
      }
      await sleep(Math.min(500,remain));
    }
  }

  async function moveOrFinishEmpty(state,runId){
    if(state.mode===MODE_GROUP_COMMON){
      return waitForGroupContent(state,runId,isGroupCommonAllPage()?"full":"members");
    }
    state.emptyRounds=(parseInt(state.emptyRounds)||0)+1;
    if(state.emptyRounds<9){
      await publishState(state,`Đang tải thêm người phù hợp (${state.emptyRounds}/9)`);
      window.scrollBy({top:Math.max(650,innerHeight*.72),behavior:"smooth"});
      await sleep(1400);
      return "continue";
    }
    if((parseInt(state.sourceReloads)||0)<1){
      state.sourceReloads=(parseInt(state.sourceReloads)||0)+1;
      state.emptyRounds=0;
      await publishState(state,"Chưa có người mới, đang tải lại nguồn một lần");
      location.reload();
      return "navigate";
    }
    await stopRun(`Không còn người phù hợp để tiếp tục. Đã xác nhận ${state.sentCount}/${state.config.maxRequests}`,runId);
    return "stop";
  }

  function mainIsStillLoading(){
    const main=document.querySelector('div[role="main"],main');
    if(!main)return true;
    return [...main.querySelectorAll('[role="status"],[aria-busy="true"]')].some(el=>{
      if(!isVisible(el))return false;
      const text=lower(el.getAttribute("aria-label")||el.innerText||el.textContent);
      return el.getAttribute("aria-busy")==="true"||/^(?:đang tải|loading)(?:\.{0,3})?$/.test(text);
    });
  }

  function prepareGroupWait(state,phase){
    const group=state.config?.groups?.[state.groupIndex||0];
    const key=`${String(group?.id||"")}:${phase}`;
    if(state.groupWaitKey!==key){
      state.groupWaitKey=key;
      state.groupWaitStartedAt=Date.now();
      state.emptyRounds=0;
      state.sourceReloads=0;
    }
    if(!Number.isFinite(Number(state.groupWaitStartedAt))||Number(state.groupWaitStartedAt)<=0){
      state.groupWaitStartedAt=Date.now();
    }
    return group;
  }

  async function advanceGroup(state,runId){
    state.groupIndex=(parseInt(state.groupIndex)||0)+1;
    state.emptyRounds=0;
    state.sourceReloads=0;
    state.groupWaitKey="";
    state.groupWaitStartedAt=0;
    if(state.groupIndex>=state.config.groups.length){
      await stopRun(`Hoàn tất các nhóm đã chọn: xác nhận ${state.sentCount}/${state.config.maxRequests} lời mời`,runId);
      return "stop";
    }
    const group=state.config.groups[state.groupIndex];
    await publishState(state,`Đang chuyển sang nhóm ${state.groupIndex+1}/${state.config.groups.length}: ${group.name}`);
    location.assign(expectedSourceUrl(state));
    return "navigate";
  }

  async function waitForGroupContent(state,runId,phase){
    const group=prepareGroupWait(state,phase);
    state.emptyRounds=(parseInt(state.emptyRounds)||0)+1;
    const elapsed=Math.max(0,Date.now()-Number(state.groupWaitStartedAt));
    const loading=mainIsStillLoading();
    const limit=GROUP_LOAD_WAIT_MS+(loading?GROUP_LOADING_GRACE_MS:0);
    if(elapsed<limit){
      const elapsedSeconds=Math.floor(elapsed/1000);
      const limitSeconds=Math.ceil(limit/1000);
      const groupName=group?.name||`nhóm ${state.groupIndex+1}`;
      const message=phase==="members"
        ? `Đang chờ ${groupName} tải mục Thành viên có điểm chung và nút Xem tất cả (${elapsedSeconds}/${limitSeconds} giây)`
        : `Đang chờ danh sách đầy đủ xuất hiện nút Thêm bạn bè (${elapsedSeconds}/${limitSeconds} giây)`;
      await publishState(state,message);
      window.scrollBy({top:Math.max(520,innerHeight*.58),behavior:"smooth"});
      await sleep(2200);
      return "continue";
    }
    if((parseInt(state.sourceReloads)||0)<GROUP_LOAD_RELOADS){
      state.sourceReloads=(parseInt(state.sourceReloads)||0)+1;
      state.groupWaitStartedAt=Date.now();
      state.emptyRounds=0;
      await publishState(state,phase==="members"
        ? "Facebook tải mục thành viên quá lâu, đang tải lại nhóm và chờ thêm một lần"
        : "Danh sách đầy đủ tải quá lâu, đang tải lại và tiếp tục chờ nút Thêm bạn bè");
      location.reload();
      return "navigate";
    }
    if(phase==="members"){
      const target=groupCommonAllUrl(group);
      if(target){
        state.groupWaitKey="";
        state.groupWaitStartedAt=0;
        state.sourceReloads=0;
        await publishState(state,"Chưa thấy nút Xem tất cả, đang mở trực tiếp danh sách Thành viên có điểm chung để tiếp tục chờ");
        location.assign(target);
        return "navigate";
      }
    }
    return advanceGroup(state,runId);
  }

  async function openGroupCommonFullList(state,runId){
    if(state.mode!==MODE_GROUP_COMMON||isGroupCommonAllPage())return "ready";
    const link=findGroupCommonAllLink();
    if(!link){
      const action=await moveOrFinishEmpty(state,runId);
      return action;
    }
    state.emptyRounds=0;
    const href=new URL(link.href,location.origin).href;
    await publishState(state,"Đang bấm Xem tất cả để tải đầy đủ Thành viên có điểm chung...");
    const clicked=await trustedClick(link);
    if(clicked){
      for(let i=0;i<20&&!isGroupCommonAllPage();i++){
        if(!await readActiveState(runId))return "stop";
        await sleep(250);
      }
    }
    if(isGroupCommonAllPage()){
      state.emptyRounds=0;
      state.sourceReloads=0;
      state.groupWaitKey="";
      state.groupWaitStartedAt=0;
      await publishState(state,"Đã mở danh sách đầy đủ, đang chờ nút Thêm bạn bè xuất hiện...");
      return "continue";
    }
    await publishState(state,"Nút Xem tất cả chưa chuyển trang, đang mở trực tiếp danh sách đầy đủ...");
    location.assign(href);
    return "navigate";
  }

  async function friendLoop(runId){
    if(loopActive)return;
    loopActive=true;
    localRunId=runId;
    stopRequested=false;
    try{
      while(true){
        let state=await readActiveState(runId);
        if(!state)return;
        if(state.sentCount>=state.config.maxRequests){
          await stopRun(`Hoàn thành ${state.sentCount}/${state.config.maxRequests} lời mời đã được Facebook xác nhận`,runId);
          return;
        }
        const restriction=pageRestriction();
        if(restriction){await stopRun(restriction,runId);return;}
        if(!isCorrectSource(state)){
          const target=expectedSourceUrl(state);
          if(!target){await stopRun("Thiếu nguồn kết bạn đã chọn",runId);return;}
          await publishState(state,"Đang mở đúng nguồn kết bạn...");
          location.assign(target);
          return;
        }
        if(state.mode===MODE_GROUP_COMMON&&!isGroupCommonAllPage()){
          const action=await openGroupCommonFullList(state,runId);
          if(action==="continue")continue;
          return;
        }
        if(state.mode===MODE_GROUP_COMMON&&!groupCommonFullListReady()){
          const action=await waitForGroupContent(state,runId,"full");
          if(action==="continue")continue;
          return;
        }
        if(!await waitForSchedule(runId))return;
        state=await readActiveState(runId);
        if(!state)return;
        const history=await loadHistory();
        const found=collectCandidates(state,history);
        if(!found.candidates.length){
          const action=await moveOrFinishEmpty(state,runId);
          if(action!=="continue")return;
          continue;
        }
        state.emptyRounds=0;
        state.sourceReloads=0;
        state.groupWaitStartedAt=Date.now();
        const candidate=found.candidates[0];
        state.attemptedKeys=[...(state.attemptedKeys||[]),candidate.key].slice(-1000);
        const mutualText=candidate.mutualCount==null?"":` (${candidate.mutualCount} bạn chung)`;
        await publishState(state,`Đang gửi lời mời tới ${candidate.name||"một người phù hợp"}${mutualText}...`);
        const result=await attemptCandidate(candidate,runId);
        state=await readActiveState(runId);
        if(!state||result.kind==="stopped")return;
        if(result.kind==="blocked"){
          await stopRun(result.message||"Facebook đã chặn thao tác",runId);
          return;
        }
        if(result.kind==="confirmed"){
          state.sentCount=(parseInt(state.sentCount)||0)+1;
          history[candidate.key]={status:"confirmed",time:Date.now(),name:candidate.name,mode:state.mode};
          await saveHistory(history);
          state.nextAllowedAt=state.sentCount<state.config.maxRequests?Date.now()+rand(state.config.minDelay,state.config.maxDelay):0;
          await publishState(state,`Đã xác nhận ${state.sentCount}/${state.config.maxRequests}: ${candidate.name||candidate.key}`);
        }else if(result.kind==="uncertain"){
          state.uncertainCount=(parseInt(state.uncertainCount)||0)+1;
          history[candidate.key]={status:"uncertain",time:Date.now(),name:candidate.name,mode:state.mode};
          await saveHistory(history);
          state.nextAllowedAt=Date.now()+rand(state.config.minDelay,state.config.maxDelay);
          await publishState(state,`${result.message}. Đã bỏ qua để tránh gửi lặp (${state.sentCount}/${state.config.maxRequests})`);
        }else{
          state.skippedCount=(parseInt(state.skippedCount)||0)+1;
          state.nextAllowedAt=Date.now()+rand(state.config.minDelay,state.config.maxDelay);
          await publishState(state,`${result.message||"Đã bỏ qua một hồ sơ"} (${state.sentCount}/${state.config.maxRequests})`);
        }
      }
    }catch(error){
      console.error("[Friend]",error);
      await stopRun(`Lỗi kết bạn: ${error.message}`,runId);
    }finally{
      loopActive=false;
      if(localRunId===runId)localRunId="";
    }
  }

  async function startFriend(inputConfig){
    const other=await chrome.storage.local.get(["isFeedInteracting","isAICommenting","isGroupJoining","isDiscoverJoining","groupInteractActive","groupPostActive"]);
    if(Object.values(other).some(Boolean))return {ok:false,error:"Hãy dừng tính năng Facebook khác trước khi chạy Kết bạn"};
    const config=normalizeConfig(inputConfig);
    if(config.mode===MODE_GROUP_COMMON&&!config.groups.length)return {ok:false,error:"Hãy chọn ít nhất một nhóm"};
    const tabId=await ownTabId();
    const runId=`friend-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const state={
      active:true,runId,ownerTabId:tabId,mode:config.mode,config,sentCount:0,skippedCount:0,uncertainCount:0,
      attemptedKeys:[],groupIndex:0,emptyRounds:0,sourceReloads:0,nextAllowedAt:Date.now()+rand(config.minDelay,config.maxDelay),
      groupWaitKey:"",groupWaitStartedAt:0,
      status:"Đang chuẩn bị nguồn kết bạn...",startedAt:Date.now()
    };
    stopRequested=false;
    await chrome.storage.sync.set({minDelay:config.minDelay,maxDelay:config.maxDelay,maxRequests:config.maxRequests,friendMode:config.mode,friendMinMutual:config.minMutual});
    await publishState(state,state.status);
    setTimeout(()=>friendLoop(runId),100);
    return {ok:true,runId};
  }

  async function scanFriend(inputConfig){
    const config=normalizeConfig(inputConfig);
    const state={mode:config.mode,config,groupIndex:0,attemptedKeys:[]};
    if(!isCorrectSource(state))return {ok:false,needsNavigation:true,targetUrl:expectedSourceUrl(state)};
    if(config.mode===MODE_GROUP_COMMON&&!isGroupCommonAllPage()){
      const link=findGroupCommonAllLink();
      return link
        ? {ok:false,needsNavigation:true,targetUrl:new URL(link.href,location.origin).href,message:"Đang mở danh sách đầy đủ Thành viên có điểm chung"}
        : {ok:false,sourceReady:false,error:"Chưa tải được nút Xem tất cả của mục Thành viên có điểm chung"};
    }
    if(config.mode===MODE_GROUP_COMMON&&!groupCommonFullListReady()){
      return {ok:false,sourceReady:false,error:"Trang Xem tất cả đang tải danh sách Thành viên có điểm chung"};
    }
    const history=await loadHistory();
    const found=collectCandidates(state,history);
    highlightCandidates(found.candidates);
    return {ok:true,count:found.candidates.length,sourceReady:found.ready,candidates:found.candidates.slice(0,20).map(c=>({key:c.key,name:c.name,mutualCount:c.mutualCount}))};
  }

  chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
    if(msg.action==="friendStart"||msg.action==="start"){
      startFriend(msg.config||{}).then(sendResponse).catch(e=>sendResponse({ok:false,error:e.message}));
      return true;
    }
    if(msg.action==="friendStop"||msg.action==="stop"){
      stopRun("Đã dừng bởi người dùng").then(()=>sendResponse({ok:true}));
      return true;
    }
    if(msg.action==="friendReset"){
      stopRun("Đã reset tiến trình kết bạn").then(async()=>{
        const stored=await chrome.storage.local.get("friendRunState"),state=stored.friendRunState||{};
        Object.assign(state,{sentCount:0,skippedCount:0,uncertainCount:0,attemptedKeys:[],groupIndex:0,emptyRounds:0,sourceReloads:0,groupWaitKey:"",groupWaitStartedAt:0});
        await publishState(state,"Đã reset tiến trình kết bạn");
        sendResponse({ok:true});
      });
      return true;
    }
    if(msg.action==="friendClearHistory"){
      chrome.storage.local.remove("friendProfileHistory").then(()=>sendResponse({ok:true}));
      return true;
    }
    if(msg.action==="friendScan"||msg.action==="scan"){
      scanFriend(msg.config||{}).then(sendResponse).catch(e=>sendResponse({ok:false,error:e.message}));
      return true;
    }
    if(msg.action==="getStatus"){
      chrome.storage.local.get(["friendRunState","sentCount","isRunning"]).then(s=>sendResponse({isRunning:!!s.isRunning,sentCount:s.sentCount||0,state:s.friendRunState||null}));
      return true;
    }
    return false;
  });

  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area!=="local")return;
    if(changes.friendRunState?.newValue?.active===false||changes.isRunning?.newValue===false)stopRequested=true;
  });

  (async()=>{
    const stored=await chrome.storage.local.get("friendRunState");
    const state=stored.friendRunState;
    if(!state?.active||!state.runId)return;
    const tabId=await ownTabId();
    if(state.ownerTabId&&tabId&&state.ownerTabId!==tabId)return;
    await sleep(1800);
    friendLoop(state.runId);
  })();

  console.log("[Friend] Three-source friend engine loaded");
})();
