// FB Auto Tool - three-source friend request engine.
(() => {
  const MODE_SUGGESTIONS="suggestions";
  const MODE_GROUP_COMMON="group-common";
  const MODE_CONFIRM="confirm";
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
  let confirmLoopActive=false;
  let confirmLocalRunId="";
  let confirmStopRequested=false;

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

  async function loadConfirmHistory(){
    const stored=await chrome.storage.local.get("friendConfirmHistory");
    const history=stored.friendConfirmHistory&&typeof stored.friendConfirmHistory==="object"?stored.friendConfirmHistory:{};
    const now=Date.now();
    for(const [key,item] of Object.entries(history)){
      if(!item?.time||(item.status==="uncertain"&&now-item.time>HISTORY_UNCERTAIN_TTL))delete history[key];
    }
    return history;
  }

  async function saveConfirmHistory(history){
    const entries=Object.entries(history).sort((a,b)=>(b[1]?.time||0)-(a[1]?.time||0)).slice(0,MAX_TRACKED_PROFILES);
    await chrome.storage.local.set({friendConfirmHistory:Object.fromEntries(entries)});
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

  function normalizeConfirmConfig(input={}){
    const source=input.confirmFilters&&typeof input.confirmFilters==="object"?input.confirmFilters:{};
    const cleanKeyword=value=>cleanText(value).slice(0,120);
    return {
      mode:MODE_CONFIRM,
      minDelay:Math.min(Math.max(1000,parseInt(input.minDelay)||5000),Math.max(1000,parseInt(input.maxDelay)||15000)),
      maxDelay:Math.max(Math.max(1000,parseInt(input.minDelay)||5000),Math.max(1000,parseInt(input.maxDelay)||15000)),
      maxRequests:Math.max(1,Math.min(100,parseInt(input.maxRequests)||20)),
      filters:{
        minMutual:Math.max(0,Math.min(999,parseInt(source.minMutual)||0)),
        minCommonGroups:Math.max(0,Math.min(999,parseInt(source.minCommonGroups)||0)),
        hometown:cleanKeyword(source.hometown),
        school:cleanKeyword(source.school),
        requirePhoto:!!source.requirePhoto,
        skipUnknown:source.skipUnknown!==false
      }
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
    await publishState(state,reason||t("c.frStopped"));
  }

  function pageRestriction(){
    if(/checkpoint|login|recover/i.test(location.pathname))return t("c.frLogin");
    const text=[...document.querySelectorAll('[role="alert"],[role="dialog"]')]
      .filter(isVisible).map(el=>lower(el.innerText||el.textContent)).join(" ");
    if(/tạm thời bị chặn|bạn không thể gửi lời mời kết bạn|không thể gửi lời mời kết bạn lúc này|temporarily blocked|you can.t send friend requests|friend request limit|xác minh tài khoản/.test(text)){
      return t("c.frLimited");
    }
    if(/bạn có biết người này|do you know this person/.test(text))return t("c.frWarnDlg");
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

  async function maybeConfirmFriendDialog(runId){
    const dialogs=[...document.querySelectorAll('[role="dialog"]')].filter(isVisible);
    for(const dialog of dialogs){
      const dialogText=lower(dialog.innerText||dialog.textContent);
      if(/bạn có biết người này|do you know this person|tạm thời bị chặn|temporarily blocked/.test(dialogText))return "blocked";
      const confirm=[...dialog.querySelectorAll('button,[role="button"]')].find(el=>/^(?:gửi lời mời kết bạn|gửi lời mời|send friend request|send request)$/.test(lower(buttonLabel(el)))&&isVisible(el));
      // Một số luồng Facebook cần cú xác nhận thứ hai mới gửi lời mời.
      // Kiểm tra cờ Dừng ngay trước cú bấm không đảo ngược này.
      if(confirm){
        if(!await readActiveState(runId))return "stopped";
        return await trustedClick(confirm)?"clicked":"failed";
      }
    }
    return "none";
  }

  async function attemptCandidate(candidate,runId){
    // DỪNG BẰNG MỌI GIÁ: kiểm tra lại ngay trước cú bấm gửi lời mời.
    if(!await readActiveState(runId))return {kind:"stopped"};
    const successBefore=new Set([...document.querySelectorAll('[role="alert"],[role="status"]')]
      .filter(isVisible).map(el=>lower(el.innerText||el.textContent)).filter(Boolean));
    candidate.button.style.outline="3px solid #00a400";
    if(!await trustedClick(candidate.button))return {kind:"failed",message:t("c.frNoBtn")};
    await sleep(500);
    const dialogResult=await maybeConfirmFriendDialog(runId);
    if(dialogResult==="stopped")return {kind:"stopped"};
    if(dialogResult==="blocked")return {kind:"blocked",message:t("c.frWarnShown")};
    if(dialogResult==="failed")return {kind:"uncertain",message:t("c.frNoConfirm")};
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
    return {kind:"uncertain",message:t("c.frNoProof")};
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
        await publishState(state,t("c.frWait",{s:seconds,from:state.sentCount,to:state.config.maxRequests}));
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
      await publishState(state,t("c.frLoadingMore",{n:state.emptyRounds}));
      window.scrollBy({top:Math.max(650,innerHeight*.72),behavior:"smooth"});
      await sleep(1400);
      return "continue";
    }
    if((parseInt(state.sourceReloads)||0)<1){
      state.sourceReloads=(parseInt(state.sourceReloads)||0)+1;
      state.emptyRounds=0;
      await publishState(state,t("c.frReloadOnce"));
      location.reload();
      return "navigate";
    }
    await stopRun(t("c.frNoMore",{from:state.sentCount,to:state.config.maxRequests}),runId);
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
      await stopRun(t("c.frGroupsDone",{from:state.sentCount,to:state.config.maxRequests}),runId);
      return "stop";
    }
    const group=state.config.groups[state.groupIndex];
    await publishState(state,t("c.frNextGroup",{i:state.groupIndex+1,total:state.config.groups.length,name:group.name}));
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
      const groupName=group?.name||t("c.frGroupN",{n:state.groupIndex+1});
      const message=phase==="members"
        ? t("c.frWaitMembers",{name:groupName,from:elapsedSeconds,to:limitSeconds})
        : t("c.frWaitList",{from:elapsedSeconds,to:limitSeconds});
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
        ? t("c.frReloadMembers")
        : t("c.frReloadList"));
      location.reload();
      return "navigate";
    }
    if(phase==="members"){
      const target=groupCommonAllUrl(group);
      if(target){
        state.groupWaitKey="";
        state.groupWaitStartedAt=0;
        state.sourceReloads=0;
        await publishState(state,t("c.frNoSeeAll"));
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
    await publishState(state,t("c.frClickSeeAll"));
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
      await publishState(state,t("c.frListReady"));
      return "continue";
    }
    await publishState(state,t("c.frSeeAllStuck"));
    location.assign(href);
    return "navigate";
  }

  // ---- Incoming friend-request confirmation: separate state machine ----
  // This flow intentionally does not reuse outgoing-invite selectors, counters,
  // history or proof. It only reads public UI text exposed by Facebook.
  function isConfirmSource(){
    return /^\/friends\/requests(?:\/|$)/i.test(location.pathname);
  }

  function confirmTargetUrl(){
    return `${location.origin}/friends/requests`;
  }

  function isExactConfirmButton(el){
    if(!el||!isVisible(el)||el.matches('[aria-disabled="true"],:disabled'))return false;
    const text=lower(buttonLabel(el));
    return /^(?:xác nhận|chap nhan|chấp nhận|accept|confirm)(?:\s+(?:lời mời|request|friend request))?$/.test(text);
  }

  function findConfirmSourceRoot(){
    const roots=[...document.querySelectorAll('div[role="main"],main')];
    const usableRoot=roots.find(root=>rawConfirmButtons(root).length);
    if(usableRoot)return usableRoot;
    const requestHeadings=[...document.querySelectorAll('[role="heading"],h1,h2,h3,h4')]
      .filter(heading=>/(?:lời mời kết bạn|friend requests?)/i.test(cleanText(heading.innerText||heading.textContent)));
    for(const heading of requestHeadings){
      let node=heading.parentElement;
      for(let depth=0;node&&node!==document.body&&depth<14;depth++,node=node.parentElement){
        if(rawConfirmButtons(node).length)return node;
      }
    }
    return rawConfirmButtons(document.body).length?document.body:null;
  }

  function findConfirmProfileLink(cardNode){
    let best=null;
    let bestScore=-1;
    for(const link of [...(cardNode?.querySelectorAll?.("a[href]")||[])]){
      const key=profileKeyFromHref(link.href||"");
      const ariaLabel=lower(link.getAttribute("aria-label")||"");
      if(!key||/\/friends\/requests|\/friends\/suggestions|\/friends\//i.test(link.href||""))continue;
      if(link.closest("table")||/(?:bạn chung|mutual friend|common friend)/i.test(ariaLabel))continue;
      let score=1;
      if(link.querySelector("img"))score+=5;
      if(link.closest('h1,h2,h3,h4,strong,[role="heading"]'))score+=3;
      if(link.getAttribute("aria-label"))score+=2;
      if(score>bestScore){bestScore=score;best=link;}
    }
    return best;
  }

  function hasRenderableProfileImage(root){
    if(!root?.querySelectorAll)return false;
    if(root.querySelector("img[src]"))return true;
    return [...root.querySelectorAll("svg image")]
      .some(image=>!!(image.getAttribute("href")||image.getAttribute("xlink:href")));
  }

  function confirmProfileHasPhoto(root,profileKey){
    if(!root?.querySelectorAll||!profileKey)return false;
    return [...root.querySelectorAll("a[href]")]
      .some(link=>profileKeyFromHref(link.href||"")===profileKey&&hasRenderableProfileImage(link));
  }

  function confirmProfileHasPhotoNear(button,profileKey,sourceRoot){
    let node=button?.parentElement;
    for(let depth=0;node&&node!==sourceRoot&&depth<14;depth++,node=node.parentElement){
      if(rawConfirmButtons(node).length>1)return false;
      if(confirmProfileHasPhoto(node,profileKey))return true;
    }
    return false;
  }

  function confirmCandidateFromButton(button,sourceRoot){
    if(!isExactConfirmButton(button)||button.closest('[role="dialog"],[role="menu"]'))return null;
    const main=sourceRoot||document.querySelector('div[role="main"],main');
    if(!main||!main.contains(button))return null;
    let node=button.parentElement;
    for(let depth=0;node&&node!==main&&depth<12;depth++,node=node.parentElement){
      const link=findConfirmProfileLink(node);
      if(!link)continue;
      const key=profileKeyFromHref(link.href||"");
      if(!key)continue;
      const cardText=cleanText(node.innerText||node.textContent);
      const linkText=cleanText(link.getAttribute("aria-label")||link.innerText||link.textContent);
      const name=(linkText||cardText.split(" ").slice(0,8).join(" ")).slice(0,120);
      const mutualMatch=cardText.match(/(?:^|\s)(\d{1,4})\s+(?:bạn chung|mutual friends?)(?:\s|$)/i)
        ||cardText.match(/(?:có|has)\s+(\d{1,4})\s+(?:bạn chung|mutual friends?)/i);
      const groupMatch=cardText.match(/(?:^|\s)(\d{1,4})\s+(?:nhóm chung|common groups?|groups in common)(?:\s|$)/i);
      const schoolMarker=/(?:học tại|đã học tại|trường học|cùng học|studied at|went to|school together|common school)/i.test(cardText);
      const hometownMarker=/(?:quê quán|đến từ|sống tại|hometown|from\s+[A-ZÀ-Ỹ][\p{L}\s.'-]{2,80}|lives in\s+[A-ZÀ-Ỹ][\p{L}\s.'-]{2,80})/iu.test(cardText);
      const profilePhoto=confirmProfileHasPhotoNear(button,key,main);
      return {
        key,name,url:link.href,button,card:node,
        mutualCount:mutualMatch?parseInt(mutualMatch[1]):null,
        commonGroupCount:groupMatch?parseInt(groupMatch[1]):null,
        hometownText:hometownMarker?cardText:"",
        schoolText:schoolMarker?cardText:"",
        hasProfilePhoto:profilePhoto,
        hometownKnown:hometownMarker,
        schoolKnown:schoolMarker
      };
    }
    return null;
  }

  function rawConfirmButtons(root){
    return root?[...root.querySelectorAll('button,[role="button"]')].filter(isExactConfirmButton):[];
  }

  function findConfirmScrollContainer(anchor){
    let node=anchor?.parentElement;
    for(let depth=0;node&&node!==document.body&&depth<18;depth++,node=node.parentElement){
      const style=getComputedStyle(node);
      if(node.scrollHeight>node.clientHeight+80&&/(?:auto|scroll|overlay)/i.test(style.overflowY||""))return node;
    }
    return document.scrollingElement||document.documentElement;
  }

  function scrollConfirmSource(sourceRoot){
    const buttons=rawConfirmButtons(sourceRoot);
    const anchor=buttons[buttons.length-1];
    if(anchor?.scrollIntoView)anchor.scrollIntoView({block:"end",inline:"nearest",behavior:"auto"});
    const scroller=findConfirmScrollContainer(anchor);
    const distance=Math.max(650,(scroller?.clientHeight||innerHeight)*.72);
    if(scroller&&scroller!==document.documentElement&&scroller!==document.body){
      scroller.scrollBy({top:distance,behavior:"smooth"});
      return;
    }
    window.scrollBy({top:distance,behavior:"smooth"});
  }

  function evaluateConfirmCandidate(candidate,filters){
    const reasonCodes=[];
    let rejected=false;
    let unknown=false;
    const keyword=value=>lower(value).replace(/\s+/g," ");
    const hometown=keyword(filters.hometown);
    const school=keyword(filters.school);
    if(filters.minMutual>0){
      if(candidate.mutualCount==null){unknown=true;reasonCodes.push("mutual-unknown");}
      else if(candidate.mutualCount<filters.minMutual){rejected=true;reasonCodes.push("mutual-too-low");}
    }
    if(hometown){
      if(!candidate.hometownKnown){unknown=true;reasonCodes.push("hometown-unknown");}
      else if(!keyword(candidate.hometownText).includes(hometown)){rejected=true;reasonCodes.push("hometown-mismatch");}
    }
    if(filters.minCommonGroups>0){
      if(candidate.commonGroupCount==null){unknown=true;reasonCodes.push("groups-unknown");}
      else if(candidate.commonGroupCount<filters.minCommonGroups){rejected=true;reasonCodes.push("groups-too-few");}
    }
    if(school){
      if(!candidate.schoolKnown){unknown=true;reasonCodes.push("school-unknown");}
      else if(!keyword(candidate.schoolText).includes(school)){rejected=true;reasonCodes.push("school-mismatch");}
    }
    if(filters.requirePhoto&&!candidate.hasProfilePhoto){rejected=true;reasonCodes.push("photo-missing");}
    if(rejected)return {decision:"reject",reasonCodes};
    if(unknown&&filters.skipUnknown)return {decision:"unknown",reasonCodes};
    if(!reasonCodes.length)reasonCodes.push("eligible");
    return {decision:"pass",reasonCodes};
  }

  function confirmFiltersNeedProfile(filters){
    return !!(filters.hometown||filters.school||filters.minCommonGroups>0||filters.minMutual>0);
  }

  function readConfirmProfileEvidence(){
    const main=findConfirmSourceRoot()||document.body;
    const text=cleanText(main?.innerText||main?.textContent).slice(0,60000);
    const mutualMatch=text.match(/(?:^|\s)(\d{1,4})\s+(?:bạn chung|mutual friends?)(?:\s|$)/i)
      ||text.match(/(?:có|has)\s+(\d{1,4})\s+(?:bạn chung|mutual friends?)/i);
    const groupMatch=text.match(/(?:^|\s)(\d{1,4})\s+(?:nhóm chung|common groups?|groups in common)(?:\s|$)/i);
    const schoolKnown=/(?:học tại|đã học tại|trường học|cùng học|studied at|went to|school together|common school)/i.test(text);
    const hometownKnown=/(?:quê quán|đến từ|sống tại|hometown|from\s+[A-ZÀ-Ỹ][\p{L}\s.'-]{2,80}|lives in\s+[A-ZÀ-Ỹ][\p{L}\s.'-]{2,80})/iu.test(text);
    return {
      mutualCount:mutualMatch?parseInt(mutualMatch[1]):null,
      commonGroupCount:groupMatch?parseInt(groupMatch[1]):null,
      hometownText:hometownKnown?text:"",
      schoolText:schoolKnown?text:"",
      hometownKnown,schoolKnown,
      hasProfilePhoto:confirmProfileHasPhoto(main,profileKeyFromHref(location.href||""))
    };
  }

  function applyConfirmProfileEvidence(candidate,evidence){
    if(!evidence)return;
    if(candidate.mutualCount==null&&evidence.mutualCount!=null)candidate.mutualCount=evidence.mutualCount;
    if(candidate.commonGroupCount==null&&evidence.commonGroupCount!=null)candidate.commonGroupCount=evidence.commonGroupCount;
    if(!candidate.hometownKnown&&evidence.hometownKnown){candidate.hometownKnown=true;candidate.hometownText=evidence.hometownText;}
    if(!candidate.schoolKnown&&evidence.schoolKnown){candidate.schoolKnown=true;candidate.schoolText=evidence.schoolText;}
    if(evidence.hasProfilePhoto)candidate.hasProfilePhoto=true;
  }

  function collectConfirmCandidates(state,history){
    const main=findConfirmSourceRoot();
    if(!main)return {ready:false,candidates:[]};
    const attempted=new Set(state.attemptedKeys||[]);
    const map=new Map();
    for(const button of rawConfirmButtons(main)){
      const candidate=confirmCandidateFromButton(button,main);
      if(!candidate||attempted.has(candidate.key)||history[candidate.key])continue;
      applyConfirmProfileEvidence(candidate,state.profileEvidenceByKey?.[candidate.key]);
      const evaluated=evaluateConfirmCandidate(candidate,state.config.filters);
      Object.assign(candidate,evaluated);
      if(!map.has(candidate.key))map.set(candidate.key,candidate);
    }
    const candidates=[...map.values()];
    candidates.sort((a,b)=>{
      const rectA=a.button.getBoundingClientRect(),rectB=b.button.getBoundingClientRect();
      if(Math.abs(rectA.top-rectB.top)>12)return rectA.top-rectB.top;
      return rectA.left-rectB.left;
    });
    return {ready:true,candidates};
  }

  function highlightConfirmCandidates(candidates){
    document.querySelectorAll('[data-friend-confirm-scan="1"]').forEach(el=>{delete el.dataset.friendConfirmScan;el.style.outline="";});
    for(const candidate of candidates){
      candidate.button.dataset.friendConfirmScan="1";
      candidate.button.style.outline=`3px solid ${candidate.decision==="pass"?"#00a400":candidate.decision==="reject"?"#d93025":"#f0a000"}`;
      candidate.button.title=`FB Auto Tool: ${candidate.name||candidate.key}`;
    }
  }

  function confirmRestriction(){
    if(/checkpoint|login|recover/i.test(location.pathname))return t("c.frLogin");
    const text=[...document.querySelectorAll('[role="alert"],[role="status"],[role="dialog"]')]
      .filter(isVisible).map(el=>lower(el.innerText||el.textContent)).join(" ");
    if(/tạm thời bị chặn|không thể xác nhận|không thể chấp nhận|temporarily blocked|you can.t confirm|can.t accept|verify your identity|xác minh tài khoản/.test(text))return t("c.frConfirmLimited");
    return "";
  }

  async function publishConfirmState(state,message){
    if(message)state.status=message;
    state.updatedAt=Date.now();
    await chrome.storage.local.set({
      friendConfirmRunState:state,
      friendConfirmActive:!!state.active,
      friendConfirmAccepted:state.acceptedCount||0,
      friendConfirmSkipped:state.skippedCount||0,
      friendConfirmUncertain:state.uncertainCount||0,
      friendConfirmStatus:state.status||""
    });
  }

  async function readConfirmActiveState(runId){
    const stored=await chrome.storage.local.get("friendConfirmRunState");
    const state=stored.friendConfirmRunState;
    if(!state?.active||state.runId!==runId||confirmStopRequested)return null;
    return state;
  }

  async function stopConfirmRun(reason,runId=""){
    const stored=await chrome.storage.local.get("friendConfirmRunState");
    const state=stored.friendConfirmRunState||{};
    if(runId&&state.runId&&state.runId!==runId)return;
    state.active=false;
    state.nextAllowedAt=0;
    confirmStopRequested=true;
    await publishConfirmState(state,reason||t("c.frConfirmStopped"));
  }

  async function waitConfirmSchedule(runId){
    while(true){
      const state=await readConfirmActiveState(runId);
      if(!state)return false;
      const remain=(parseInt(state.nextAllowedAt)||0)-Date.now();
      if(remain<=0)return true;
      const seconds=Math.max(1,Math.ceil(remain/1000));
      if(state.lastShownSecond!==seconds){
        state.lastShownSecond=seconds;
        await publishConfirmState(state,t("c.frConfirmWait",{s:seconds,from:state.acceptedCount,to:state.config.maxRequests}));
      }
      await sleep(Math.min(500,remain));
    }
  }

  async function attemptConfirmCandidate(candidate,runId){
    if(!await readConfirmActiveState(runId))return {kind:"stopped"};
    const beforeAlerts=new Set([...document.querySelectorAll('[role="alert"],[role="status"]')]
      .filter(isVisible).map(el=>lower(el.innerText||el.textContent)).filter(Boolean));
    candidate.button.style.outline="3px solid #00a400";
    if(!await trustedClick(candidate.button))return {kind:"failed",message:t("c.frConfirmNoBtn")};
    for(let i=0;i<30;i++){
      if(!await readConfirmActiveState(runId))return {kind:"stopped"};
      const restriction=confirmRestriction();
      if(restriction)return {kind:"blocked",message:restriction};
      const label=buttonLabel(candidate.button);
      const cardText=cleanText(candidate.card?.innerText||candidate.card?.textContent);
      const successAlert=[...document.querySelectorAll('[role="alert"],[role="status"]')]
        .filter(isVisible).map(el=>lower(el.innerText||el.textContent))
        .some(text=>!beforeAlerts.has(text)&&/(?:đã xác nhận|đã chấp nhận|bây giờ là bạn bè|request accepted|you are now friends|now friends)/.test(text));
      const becameFriends=/(?:^|\s)(?:bạn bè|đã là bạn bè|friends)(?:\s|$)/i.test(lower(label))
        ||/(?:^|\s)(?:bạn bè|đã là bạn bè|friends)(?:\s|$)/i.test(lower(cardText));
      if(successAlert||becameFriends)return {kind:"confirmed"};
      await sleep(500);
    }
    return {kind:"uncertain",message:t("c.frConfirmNoProof")};
  }

  function isPendingConfirmProfile(pending){
    const currentKey=profileKeyFromHref(location.href||"");
    if(currentKey&&currentKey===pending?.key)return true;
    try{
      const current=new URL(location.href,location.origin);
      const target=new URL(pending?.url||"",location.origin);
      if(current.origin!==target.origin)return false;
      const currentId=current.searchParams.get("id");
      const targetId=target.searchParams.get("id");
      if(currentId&&targetId)return currentId===targetId;
      const currentPath=current.pathname.replace(/\/+$/,"").toLocaleLowerCase("vi");
      const targetPath=target.pathname.replace(/\/+$/,"").toLocaleLowerCase("vi");
      return currentPath===targetPath&&currentPath!=="/profile.php"&&!!profileKeyFromHref(current.href);
    }catch{return false;}
  }

  async function waitForPendingConfirmProfile(pending,runId){
    for(let i=0;i<24;i++){
      if(isPendingConfirmProfile(pending))return true;
      if(isConfirmSource()||!await readConfirmActiveState(runId))return false;
      await sleep(250);
    }
    return isPendingConfirmProfile(pending);
  }

  async function friendConfirmLoop(runId){
    if(confirmLoopActive)return;
    confirmLoopActive=true;
    confirmLocalRunId=runId;
    confirmStopRequested=false;
    try{
      while(true){
        let state=await readConfirmActiveState(runId);
        if(!state)return;
        if(state.stage==="inspect-profile"&&state.pendingProfile?.key){
          const pending=state.pendingProfile;
          const inspectRestriction=confirmRestriction();
          if(inspectRestriction){await stopConfirmRun(inspectRestriction,runId);return;}
          const onPendingProfile=!isConfirmSource()&&await waitForPendingConfirmProfile(pending,runId);
          state=await readConfirmActiveState(runId);
          if(!state)return;
          if(onPendingProfile){
            state.profileEvidenceByKey=state.profileEvidenceByKey&&typeof state.profileEvidenceByKey==="object"?state.profileEvidenceByKey:{};
            state.profileEvidenceByKey[pending.key]=readConfirmProfileEvidence();
            state.stage="returning-list";
            await publishConfirmState(state,t("c.frConfirmReturning"));
            location.assign(pending.returnUrl||confirmTargetUrl());
            return;
          }
          if(!isConfirmSource()){
            const openAttempts=parseInt(pending.openAttempts)||0;
            if(openAttempts>=1){await stopConfirmRun(t("c.frConfirmProfileMismatch"),runId);return;}
            pending.openAttempts=openAttempts+1;
            state.pendingProfile=pending;
            await publishConfirmState(state,t("c.frConfirmInspecting"));
            location.assign(pending.url);
            return;
          }
          state.stage="list";
          state.pendingProfile=null;
          await publishConfirmState(state);
          continue;
        }
        if(state.stage==="returning-list"&&isConfirmSource()){
          state.stage="list";
          state.pendingProfile=null;
          await publishConfirmState(state);
        }
        if(state.acceptedCount>=state.config.maxRequests){await stopConfirmRun(t("c.frConfirmDone",{from:state.acceptedCount,to:state.config.maxRequests}),runId);return;}
        if(!isConfirmSource()){
          await publishConfirmState(state,t("c.frConfirmOpening"));
          location.assign(confirmTargetUrl());
          return;
        }
        const restriction=confirmRestriction();
        if(restriction){await stopConfirmRun(restriction,runId);return;}
        if(!await waitConfirmSchedule(runId))return;
        state=await readConfirmActiveState(runId);
        if(!state)return;
        const history=await loadConfirmHistory();
        const found=collectConfirmCandidates(state,history);
        if(!found.candidates.length){
          state.emptyRounds=(parseInt(state.emptyRounds)||0)+1;
          if(state.emptyRounds<9){
            await publishConfirmState(state,t("c.frConfirmLoading",{n:state.emptyRounds}));
            scrollConfirmSource(findConfirmSourceRoot());
            await sleep(1400);
            continue;
          }
          if((parseInt(state.sourceReloads)||0)<1){
            state.sourceReloads=(parseInt(state.sourceReloads)||0)+1;
            state.emptyRounds=0;
            await publishConfirmState(state,t("c.frConfirmReload"));
            location.reload();
            return;
          }
          await stopConfirmRun(t("c.frConfirmNoMore",{from:state.acceptedCount,to:state.config.maxRequests}),runId);
          return;
        }
        state.emptyRounds=0;
        state.sourceReloads=0;
        const candidate=found.candidates[0];
        state.attemptedKeys=[...(state.attemptedKeys||[]),candidate.key].slice(-1000);
        if(candidate.decision!=="pass"){
          const alreadyInspected=Object.prototype.hasOwnProperty.call(state.profileEvidenceByKey||{},candidate.key);
          if(candidate.decision==="unknown"&&confirmFiltersNeedProfile(state.config.filters)&&candidate.url&&!alreadyInspected){
            state.attemptedKeys=state.attemptedKeys.slice(0,-1);
            state.stage="inspect-profile";
            state.pendingProfile={key:candidate.key,url:candidate.url,returnUrl:location.href,openAttempts:0};
            await publishConfirmState(state,t("c.frConfirmInspecting"));
            location.assign(candidate.url);
            return;
          }
          state.skippedCount=(parseInt(state.skippedCount)||0)+1;
          history[candidate.key]={status:candidate.decision,time:Date.now()};
          await saveConfirmHistory(history);
          const reason=candidate.reasonCodes.map(code=>t(`fr.confirmReason_${code}`)||code).join(", ");
          await publishConfirmState(state,t("c.frConfirmSkipped",{name:candidate.name||t("c.frSomeone"),reason}));
          continue;
        }
        await publishConfirmState(state,t("c.frConfirmChecking",{name:candidate.name||t("c.frSomeone")}));
        const result=await attemptConfirmCandidate(candidate,runId);
        state=await readConfirmActiveState(runId);
        if(!state||result.kind==="stopped")return;
        if(result.kind==="blocked"){await stopConfirmRun(result.message||t("c.frConfirmLimited"),runId);return;}
        if(result.kind==="confirmed"){
          state.acceptedCount=(parseInt(state.acceptedCount)||0)+1;
          history[candidate.key]={status:"confirmed",time:Date.now()};
          await saveConfirmHistory(history);
          state.nextAllowedAt=state.acceptedCount<state.config.maxRequests?Date.now()+rand(state.config.minDelay,state.config.maxDelay):0;
          await publishConfirmState(state,t("c.frConfirmAccepted",{from:state.acceptedCount,to:state.config.maxRequests,name:candidate.name||candidate.key}));
        }else if(result.kind==="uncertain"){
          state.uncertainCount=(parseInt(state.uncertainCount)||0)+1;
          history[candidate.key]={status:"uncertain",time:Date.now()};
          await saveConfirmHistory(history);
          state.nextAllowedAt=Date.now()+rand(state.config.minDelay,state.config.maxDelay);
          await publishConfirmState(state,t("c.frConfirmUncertain",{name:candidate.name||t("c.frSomeone")}));
        }else{
          state.skippedCount=(parseInt(state.skippedCount)||0)+1;
          history[candidate.key]={status:"skipped",time:Date.now()};
          await saveConfirmHistory(history);
          state.nextAllowedAt=Date.now()+rand(state.config.minDelay,state.config.maxDelay);
          await publishConfirmState(state,t("c.frConfirmSkipped",{name:candidate.name||t("c.frSomeone"),reason:result.message||t("c.frConfirmNoBtn")}));
        }
      }
    }catch(error){
      console.error("[FriendConfirm]",error);
      await stopConfirmRun(t("c.frConfirmError",{err:error.message}),runId);
    }finally{
      confirmLoopActive=false;
      if(confirmLocalRunId===runId)confirmLocalRunId="";
    }
  }

  async function startFriendConfirm(inputConfig){
    const other=await chrome.storage.local.get(["isRunning","isFeedInteracting","isAICommenting","isGroupJoining","isDiscoverJoining","groupInteractActive","groupPostActive","groupShareActive","salesPostActive","trendLearnActive","trendPostActive"]);
    if(Object.values(other).some(Boolean))return {ok:false,error:t("c.frBusyOther")};
    const config=normalizeConfirmConfig(inputConfig);
    const tabId=await ownTabId();
    const runId=`friend-confirm-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const state={active:true,runId,ownerTabId:tabId,mode:MODE_CONFIRM,config,acceptedCount:0,skippedCount:0,uncertainCount:0,attemptedKeys:[],emptyRounds:0,sourceReloads:0,nextAllowedAt:Date.now()+rand(config.minDelay,config.maxDelay),stage:"list",pendingProfile:null,profileEvidenceByKey:{},status:t("c.frConfirmPreparing"),startedAt:Date.now()};
    confirmStopRequested=false;
    await publishConfirmState(state,state.status);
    setTimeout(()=>friendConfirmLoop(runId),100);
    return {ok:true,runId};
  }

  async function scanFriendConfirm(inputConfig){
    const config=normalizeConfirmConfig(inputConfig);
    if(!isConfirmSource())return {ok:false,needsNavigation:true,targetUrl:confirmTargetUrl()};
    const state={mode:MODE_CONFIRM,config,attemptedKeys:[]};
    const history=await loadConfirmHistory();
    const found=collectConfirmCandidates(state,history);
    highlightConfirmCandidates(found.candidates);
    return {ok:true,count:found.candidates.length,sourceReady:found.ready,candidates:found.candidates.slice(0,50).map(candidate=>({key:candidate.key,name:candidate.name,mutualCount:candidate.mutualCount,commonGroupCount:candidate.commonGroupCount,decision:candidate.decision,reasonCodes:candidate.reasonCodes}))};
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
          await stopRun(t("c.frDoneAll",{from:state.sentCount,to:state.config.maxRequests}),runId);
          return;
        }
        const restriction=pageRestriction();
        if(restriction){await stopRun(restriction,runId);return;}
        if(!isCorrectSource(state)){
          const target=expectedSourceUrl(state);
          if(!target){await stopRun(t("c.frNoSource"),runId);return;}
          await publishState(state,t("c.frOpening"));
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
        const mutualText=candidate.mutualCount==null?"":t("c.frMutual",{n:candidate.mutualCount});
        await publishState(state,t("c.frSending",{name:candidate.name||t("c.frSomeone")}));
        const result=await attemptCandidate(candidate,runId);
        state=await readActiveState(runId);
        if(!state||result.kind==="stopped")return;
        if(result.kind==="blocked"){
          await stopRun(result.message||t("c.frBlockedOp"),runId);
          return;
        }
        if(result.kind==="confirmed"){
          state.sentCount=(parseInt(state.sentCount)||0)+1;
          history[candidate.key]={status:"confirmed",time:Date.now(),name:candidate.name,mode:state.mode};
          await saveHistory(history);
          state.nextAllowedAt=state.sentCount<state.config.maxRequests?Date.now()+rand(state.config.minDelay,state.config.maxDelay):0;
          await publishState(state,t("c.frConfirmed",{from:state.sentCount,to:state.config.maxRequests,name:candidate.name||candidate.key}));
        }else if(result.kind==="uncertain"){
          state.uncertainCount=(parseInt(state.uncertainCount)||0)+1;
          history[candidate.key]={status:"uncertain",time:Date.now(),name:candidate.name,mode:state.mode};
          await saveHistory(history);
          state.nextAllowedAt=Date.now()+rand(state.config.minDelay,state.config.maxDelay);
          await publishState(state,t("c.frSkippedDup",{msg:result.message,from:state.sentCount,to:state.config.maxRequests}));
        }else{
          state.skippedCount=(parseInt(state.skippedCount)||0)+1;
          state.nextAllowedAt=Date.now()+rand(state.config.minDelay,state.config.maxDelay);
          await publishState(state,t("c.frSkipped",{msg:result.message||t("c.frSkippedOne"),from:state.sentCount,to:state.config.maxRequests}));
        }
      }
    }catch(error){
      console.error("[Friend]",error);
      await stopRun(t("c.frError",{err:error.message}),runId);
    }finally{
      loopActive=false;
      if(localRunId===runId)localRunId="";
    }
  }

  async function startFriend(inputConfig){
    if(inputConfig?.mode===MODE_CONFIRM)return startFriendConfirm(inputConfig);
    const other=await chrome.storage.local.get(["friendConfirmActive","isFeedInteracting","isAICommenting","isGroupJoining","isDiscoverJoining","groupInteractActive","groupPostActive","groupShareActive","salesPostActive","trendLearnActive","trendPostActive"]);
    if(Object.values(other).some(Boolean))return {ok:false,error:t("c.frBusyOther")};
    const config=normalizeConfig(inputConfig);
    if(config.mode===MODE_GROUP_COMMON&&!config.groups.length)return {ok:false,error:t("p.frNeedGroups")};
    const tabId=await ownTabId();
    const runId=`friend-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const state={
      active:true,runId,ownerTabId:tabId,mode:config.mode,config,sentCount:0,skippedCount:0,uncertainCount:0,
      attemptedKeys:[],groupIndex:0,emptyRounds:0,sourceReloads:0,nextAllowedAt:Date.now()+rand(config.minDelay,config.maxDelay),
      groupWaitKey:"",groupWaitStartedAt:0,
      status:t("c.frPreparing"),startedAt:Date.now()
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
        ? {ok:false,needsNavigation:true,targetUrl:new URL(link.href,location.origin).href,message:t("c.frOpeningFull")}
        : {ok:false,sourceReady:false,error:t("c.frNoSeeAllBtn")};
    }
    if(config.mode===MODE_GROUP_COMMON&&!groupCommonFullListReady()){
      return {ok:false,sourceReady:false,error:t("c.frFullLoading")};
    }
    const history=await loadHistory();
    const found=collectCandidates(state,history);
    highlightCandidates(found.candidates);
    return {ok:true,count:found.candidates.length,sourceReady:found.ready,candidates:found.candidates.slice(0,20).map(c=>({key:c.key,name:c.name,mutualCount:c.mutualCount}))};
  }

  chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
    if(msg.action==="friendConfirmStart"){
      startFriendConfirm(msg.config||{}).then(sendResponse).catch(e=>sendResponse({ok:false,error:e.message}));
      return true;
    }
    if(msg.action==="friendConfirmStop"){
      stopConfirmRun(t("p.frStoppedByUser")).then(()=>sendResponse({ok:true}));
      return true;
    }
    if(msg.action==="friendConfirmReset"){
      stopConfirmRun(t("p.frResetDone")).then(async()=>{
        const stored=await chrome.storage.local.get("friendConfirmRunState"),state=stored.friendConfirmRunState||{};
        Object.assign(state,{acceptedCount:0,skippedCount:0,uncertainCount:0,attemptedKeys:[],emptyRounds:0,sourceReloads:0,stage:"list",pendingProfile:null,profileEvidenceByKey:{}});
        await publishConfirmState(state,t("p.frResetDone"));
        sendResponse({ok:true});
      });
      return true;
    }
    if(msg.action==="friendConfirmScan"){
      scanFriendConfirm(msg.config||{}).then(sendResponse).catch(e=>sendResponse({ok:false,error:e.message}));
      return true;
    }
    if(msg.action==="friendStart"||msg.action==="start"){
      startFriend(msg.config||{}).then(sendResponse).catch(e=>sendResponse({ok:false,error:e.message}));
      return true;
    }
    if(msg.action==="friendStop"||msg.action==="stop"){
      stopRun(t("p.frStoppedByUser")).then(()=>sendResponse({ok:true}));
      return true;
    }
    if(msg.action==="friendReset"){
      stopRun(t("p.frResetDone")).then(async()=>{
        const stored=await chrome.storage.local.get("friendRunState"),state=stored.friendRunState||{};
        Object.assign(state,{sentCount:0,skippedCount:0,uncertainCount:0,attemptedKeys:[],groupIndex:0,emptyRounds:0,sourceReloads:0,groupWaitKey:"",groupWaitStartedAt:0});
        await publishState(state,t("p.frResetDone"));
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
    if(changes.friendConfirmRunState?.newValue?.active===false||changes.friendConfirmActive?.newValue===false)confirmStopRequested=true;
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

  (async()=>{
    const stored=await chrome.storage.local.get("friendConfirmRunState");
    const state=stored.friendConfirmRunState;
    if(!state?.active||!state.runId)return;
    const tabId=await ownTabId();
    if(state.ownerTabId&&tabId&&state.ownerTabId!==tabId)return;
    await sleep(1800);
    friendConfirmLoop(state.runId);
  })();

  console.log("[Friend] Friend request and confirmation engines loaded");
})();
