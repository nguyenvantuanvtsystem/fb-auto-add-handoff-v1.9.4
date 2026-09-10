const $ = id => document.getElementById(id);

async function getUnifiedAiConfig(preferredProvider=""){
  const [sync,local]=await Promise.all([chrome.storage.sync.get(["aiProvider","aiApiKey","aiModel","aiCustomUrl","aiKeys","groupPostAiProvider","groupPostAiKey","groupPostAiModel","groupPostAiUrl"]),chrome.storage.local.get("unifiedAiProfiles")]);
  const currentHasKey=!!(sync.aiKeys?.[sync.aiProvider]?.key||sync.aiApiKey),legacyHasKey=!!sync.groupPostAiKey;
  const provider=preferredProvider||(currentHasKey?sync.aiProvider:"")||(legacyHasKey?sync.groupPostAiProvider:"")||sync.aiProvider||sync.groupPostAiProvider||"gemini",profile=sync.aiKeys?.[provider]||local.unifiedAiProfiles?.[provider]||{};
  const isCurrent=provider===sync.aiProvider,isLegacy=provider===sync.groupPostAiProvider;
  return {provider,key:profile.key||(isCurrent?sync.aiApiKey:"")||(isLegacy?sync.groupPostAiKey:"")||"",model:profile.model||(isCurrent?sync.aiModel:"")||(isLegacy?sync.groupPostAiModel:"")||(provider==="gemini"?"gemini-flash-lite-latest":""),url:profile.url||(isCurrent?sync.aiCustomUrl:"")||(isLegacy?sync.groupPostAiUrl:"")||""};
}
async function persistUnifiedAiConfig(config){
  const c={provider:config.provider||"gemini",key:String(config.key||"").trim(),model:String(config.model||"").trim(),url:String(config.url||"").trim()};
  const [sync,local]=await Promise.all([chrome.storage.sync.get("aiKeys"),chrome.storage.local.get("unifiedAiProfiles")]);
  const keys={...(sync.aiKeys||{}),[c.provider]:{key:c.key,model:c.model,url:c.url}},profiles={...(local.unifiedAiProfiles||{}),[c.provider]:{key:c.key,model:c.model,url:c.url}};
  await Promise.all([chrome.storage.sync.set({aiProvider:c.provider,aiApiKey:c.key,aiModel:c.model,aiCustomUrl:c.url,aiKeys:keys,groupPostAiProvider:c.provider,groupPostAiKey:c.key,groupPostAiModel:c.model,groupPostAiUrl:c.url}),chrome.storage.local.set({unifiedAiProfiles:profiles})]);
  return c;
}
getUnifiedAiConfig().then(c=>{if(c.key)persistUnifiedAiConfig(c);}).catch(()=>{});

// Tabs - moi tinh nang lon co panel va state rieng
const tabAdd = $("tabAdd");
const tabScrape = $("tabScrape");
const tabGroup = $("tabGroup");
const tabPage = $("tabPage");
const tabShare = $("tabShare");
const tabSales = $("tabSales");
const tabTrend = $("tabTrend");
const tabFeed = $("tabFeed");
const panelAdd = $("panelAdd");
const panelScrape = $("panelScrape");
const panelGroup = $("panelGroup");
const panelPage = $("panelPage");
const panelShare = $("panelShare");
const panelSales = $("panelSales");
const panelTrend = $("panelTrend");
const panelFeed = $("panelFeed");
function showTab(which){
  [tabAdd,tabScrape,tabGroup,tabPage,tabShare,tabSales,tabTrend,tabFeed].forEach(t=>t&&t.classList.remove("active"));
  [panelAdd,panelScrape,panelGroup,panelPage,panelShare,panelSales,panelTrend,panelFeed].forEach(p=>p&&p.classList.add("hidden"));
  if(which==="add"){ tabAdd.classList.add("active"); panelAdd.classList.remove("hidden"); }
  else if(which==="scrape"){ tabScrape.classList.add("active"); panelScrape.classList.remove("hidden"); }
  else if(which==="group"){ tabGroup.classList.add("active"); panelGroup.classList.remove("hidden"); }
  else if(which==="page"){ tabPage.classList.add("active"); panelPage.classList.remove("hidden"); try{refreshPageAiSummary();}catch(_){} }
  else if(which==="share"){ tabShare.classList.add("active"); panelShare.classList.remove("hidden"); }
  else if(which==="sales"){ tabSales.classList.add("active"); panelSales.classList.remove("hidden"); try{refreshSalesAiSummary();}catch(_){} }
  else if(which==="trend"){ tabTrend.classList.add("active"); panelTrend.classList.remove("hidden"); try{refreshTrendAiSummary();}catch(_){} }
  else { tabFeed.classList.add("active"); panelFeed.classList.remove("hidden"); }
  try{chrome.storage.local.set({popupLastTab:which});}catch{}
}
tabAdd.onclick = () => showTab("add");
tabScrape.onclick = () => showTab("scrape");
tabGroup.onclick = () => {showTab("group");refreshUnifiedAiUi();};
tabPage.onclick = () => {showTab("page");refreshPageAiSummary();};
tabShare.onclick = () => {showTab("share");refreshShareAiSummary();};
tabSales.onclick = () => {showTab("sales");refreshSalesAiSummary();};
tabTrend.onclick = () => {showTab("trend");try{refreshTrendAiSummary();}catch(_){}};
tabFeed.onclick = () => {showTab("feed");refreshUnifiedAiUi();};

// Ngôn ngữ giao diện (popup + mọi content script dùng chung qua i18n.js).
// applyI18n chạy đồng bộ trước mọi lần đọc storage bất đồng bộ nên prompt
// mặc định theo đúng ngôn ngữ, cấu hình đã lưu của người dùng vẫn giữ nguyên.
(async()=>{
  await initI18n();
  applyI18n({initial:true});
  const sel=$("uiLang");
  if(sel){
    sel.value=I18N_LANG;
    sel.addEventListener("change",async()=>{
      await setUILang(sel.value);
      applyI18n();
      try{updateAiDesc();}catch(_){}
      try{await refreshShareAiSummary();}catch(_){}
      try{const saved=await chrome.storage.local.get("salesPostMedia");renderSalesMediaPreview(saved.salesPostMedia);}catch(_){}
    });
  }
  // Mô tả provider và tóm tắt AI phụ thuộc ngôn ngữ — vẽ lại sau khi biết lang.
  try{updateAiDesc();}catch(_){}
  try{await refreshShareAiSummary();}catch(_){}
})();

// ADD FRIEND
const startBtn = $("startBtn");
const scanBtn = $("scanBtn");
const minEl = $("minDelay");
const maxEl = $("maxDelay");
const maxReqEl = $("maxRequests");
const friendMinMutual=$("friendMinMutual");
const friendConfirmMinMutual=$("friendConfirmMinMutual");
const friendConfirmMinGroups=$("friendConfirmMinGroups");
const friendConfirmHometown=$("friendConfirmHometown");
const friendConfirmSchool=$("friendConfirmSchool");
const friendConfirmRequirePhoto=$("friendConfirmRequirePhoto");
const friendConfirmSkipUnknown=$("friendConfirmSkipUnknown");
const statusEl = $("status");
const countEl = $("count");
const friendSkippedEl=$("friendSkipped"),friendUncertainEl=$("friendUncertain");
const friendResetBtn=$("friendResetBtn"),friendClearHistoryBtn=$("friendClearHistoryBtn");
const friendSuggestionsPanel=$("friendSuggestionsPanel"),friendGroupPanel=$("friendGroupPanel"),friendConfirmPanel=$("friendConfirmPanel"),friendConfirmFilters=$("friendConfirmFilters");
const friendOpenSuggestionsBtn=$("friendOpenSuggestionsBtn"),friendOpenConfirmBtn=$("friendOpenConfirmBtn"),loadFriendGroupsBtn=$("loadFriendGroupsBtn"),selectAllFriendGroupsBtn=$("selectAllFriendGroupsBtn");
const friendGroupKeyword=$("friendGroupKeyword"),friendGroupList=$("friendGroupList");
const friendConfirmResults=$("friendConfirmResults");
const friendOutgoingMutualWrap=$("friendOutgoingMutualWrap");
const friendModeButtons=[...document.querySelectorAll(".friend-mode-btn")];
let isRunning = false;
let friendMode="suggestions";
let friendGroups=[];

const friendEsc=value=>String(value||"").replace(/[<>&"]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[c]));

function renderFriendConfirmScan(candidates){
  if(!friendConfirmResults)return;
  if(!candidates.length){friendConfirmResults.innerHTML='<div class="hint" style="padding:6px">'+friendEsc(t("fr.confirmNoCandidates"))+'</div>';return;}
  friendConfirmResults.innerHTML=candidates.map(candidate=>{
    const state=candidate.decision||"unknown";
    const color=state==="pass"?"#0b7a35":state==="reject"?"#b42318":"#8a5a00";
    const reason=(candidate.reasonCodes||[]).map(code=>t(`fr.confirmReason_${code}`)||code).join(" · ");
    const mutual=candidate.mutualCount==null?"?":candidate.mutualCount;
    const groups=candidate.commonGroupCount==null?"?":candidate.commonGroupCount;
    return `<div style="padding:6px;border-bottom:1px solid #eee;font-size:11px"><b>${friendEsc(candidate.name||candidate.key)}</b><span style="float:right;color:${color};font-weight:700">${friendEsc(t("fr.confirmDecision_"+state))}</span><div style="color:#65676b">${friendEsc(t("fr.confirmEvidence",{mutual,groups}))}</div><div style="color:${color}">${friendEsc(reason||t("fr.confirmNoReason"))}</div></div>`;
  }).join("");
}

function setFriendMode(mode){
  if(isRunning&&mode!==friendMode){statusEl.textContent=t("p.frModeLocked");return;}
  friendMode=["suggestions","group-common","confirm"].includes(mode)?mode:"suggestions";
  friendModeButtons.forEach(button=>button.classList.toggle("active",button.dataset.friendMode===friendMode));
  friendSuggestionsPanel.classList.toggle("hidden",friendMode!=="suggestions");
  friendGroupPanel.classList.toggle("hidden",friendMode!=="group-common");
  friendConfirmPanel.classList.toggle("hidden",friendMode!=="confirm");
  friendConfirmFilters.classList.toggle("hidden",friendMode!=="confirm");
  friendOutgoingMutualWrap.classList.toggle("hidden",friendMode==="confirm");
  chrome.storage.sync.set({friendMode});
  updateCount();
}

friendModeButtons.forEach(button=>button.addEventListener("click",()=>setFriendMode(button.dataset.friendMode)));

function selectedFriendGroups(){
  const ids=[...friendGroupList.querySelectorAll(".friend-group-check:checked")].map(box=>box.value);
  return friendGroups.filter(group=>ids.includes(String(group.id)));
}

function renderFriendGroups(groups,selectedIds=[]){
  friendGroups=Array.isArray(groups)?groups:[];
  const selected=new Set((selectedIds||[]).map(String));
  if(!friendGroups.length){friendGroupList.innerHTML='<div class="hint" style="padding:6px">'+t("p.frNoGroupsJoined")+'</div>';return;}
  friendGroupList.innerHTML=friendGroups.map(group=>`<label data-name="${friendEsc(group.name.toLocaleLowerCase("vi"))}" style="display:flex;align-items:center;gap:7px;padding:5px;margin:0;border-bottom:1px solid #eee;min-width:0"><input class="friend-group-check" type="checkbox" value="${friendEsc(group.id)}" ${selected.has(String(group.id))?"checked":""} style="width:auto"><img src="${friendEsc(group.icon||"icon128.png")}" style="width:28px;height:28px;border-radius:50%;object-fit:cover"><span style="font-size:12px;overflow:hidden;text-overflow:ellipsis">${friendEsc(group.name)}</span></label>`).join("");
}

function saveConfig() {
  const cfg = {
    minDelay: Math.max(1, parseInt(minEl.value) || 5) * 1000,
    maxDelay: Math.max(1, parseInt(maxEl.value) || 15) * 1000,
    maxRequests: Math.max(1, parseInt(maxReqEl.value) || 10),
    minMutual:Math.max(0,parseInt(friendMinMutual.value)||0),
    mode:friendMode,
    groups:selectedFriendGroups(),
    confirmFilters:{
      minMutual:Math.max(0,parseInt(friendConfirmMinMutual.value)||0),
      minCommonGroups:Math.max(0,parseInt(friendConfirmMinGroups.value)||0),
      hometown:String(friendConfirmHometown.value||"").trim(),
      school:String(friendConfirmSchool.value||"").trim(),
      requirePhoto:!!friendConfirmRequirePhoto.checked,
      skipUnknown:!!friendConfirmSkipUnknown.checked
    }
  };
  chrome.storage.sync.set({
    minDelay:cfg.minDelay,maxDelay:cfg.maxDelay,maxRequests:cfg.maxRequests,
    friendMinMutual:cfg.minMutual,friendMode:cfg.mode,friendGroupIds:cfg.groups.map(g=>String(g.id)),
    friendConfirmMinMutual:cfg.confirmFilters.minMutual,
    friendConfirmMinGroups:cfg.confirmFilters.minCommonGroups,
    friendConfirmHometown:cfg.confirmFilters.hometown,
    friendConfirmSchool:cfg.confirmFilters.school,
    friendConfirmRequirePhoto:cfg.confirmFilters.requirePhoto,
    friendConfirmSkipUnknown:cfg.confirmFilters.skipUnknown
  });
  return cfg;
}

async function loadConfig() {
  const [sync,local]=await Promise.all([
    chrome.storage.sync.get(["minDelay","maxDelay","maxRequests","friendMinMutual","friendMode","friendGroupIds","friendConfirmMinMutual","friendConfirmMinGroups","friendConfirmHometown","friendConfirmSchool","friendConfirmRequirePhoto","friendConfirmSkipUnknown"]),
    chrome.storage.local.get(["joinedGroups","friendRunState","sentCount","isRunning","friendStatus","friendSkipped","friendUncertain","friendConfirmRunState","friendConfirmAccepted","friendConfirmActive","friendConfirmSkipped","friendConfirmUncertain","friendConfirmStatus"])
  ]);
  if(sync.minDelay)minEl.value=Math.round(sync.minDelay/1000);
  if(sync.maxDelay)maxEl.value=Math.round(sync.maxDelay/1000);
  if(sync.maxRequests)maxReqEl.value=sync.maxRequests;
  if(sync.friendMinMutual!==undefined)friendMinMutual.value=sync.friendMinMutual;
  if(sync.friendConfirmMinMutual!==undefined)friendConfirmMinMutual.value=sync.friendConfirmMinMutual;
  if(sync.friendConfirmMinGroups!==undefined)friendConfirmMinGroups.value=sync.friendConfirmMinGroups;
  if(sync.friendConfirmHometown!==undefined)friendConfirmHometown.value=sync.friendConfirmHometown;
  if(sync.friendConfirmSchool!==undefined)friendConfirmSchool.value=sync.friendConfirmSchool;
  if(sync.friendConfirmRequirePhoto!==undefined)friendConfirmRequirePhoto.checked=!!sync.friendConfirmRequirePhoto;
  if(sync.friendConfirmSkipUnknown!==undefined)friendConfirmSkipUnknown.checked=!!sync.friendConfirmSkipUnknown;
  const restoredMode=local.friendConfirmActive||local.friendConfirmRunState?.active?"confirm":(sync.friendMode||local.friendRunState?.mode||"suggestions");
  setFriendMode(restoredMode);
  renderFriendGroups(local.joinedGroups||[],sync.friendGroupIds||[]);
  setRunning(restoredMode==="confirm"?!!local.friendConfirmActive:!!local.isRunning);
  updateCount();
}

function updateCount() {
  chrome.storage.local.get(["sentCount","isRunning","friendStatus","lastMessage","friendSkipped","friendUncertain","friendConfirmAccepted","friendConfirmActive","friendConfirmStatus","friendConfirmSkipped","friendConfirmUncertain"], res => {
    const confirming=friendMode==="confirm";
    const sent = confirming ? (res.friendConfirmAccepted||0) : (res.sentCount||0);
    const max = parseInt(maxReqEl.value) || 10;
    countEl.textContent = `${sent} / ${max}`;
    friendSkippedEl.textContent=confirming?(res.friendConfirmSkipped||0):(res.friendSkipped||0);
    friendUncertainEl.textContent=confirming?(res.friendConfirmUncertain||0):(res.friendUncertain||0);
    const status=confirming?(res.friendConfirmStatus||""):(res.friendStatus||res.lastMessage||"");
    if(status)statusEl.textContent=status;
  });
}
function setRunning(running) {
  isRunning = running;
  startBtn.textContent = running ? t("c.stop") : t("fr.start");
  startBtn.classList.toggle("running", running);
}
async function getActiveTab() {
  // The extension popup can be hosted in a separate Chrome popup window.
  // In that case `currentWindow: true` may resolve to the popup/internal
  // window instead of the user's active Facebook tab, so messages such as
  // trendDiagnose and scanJoinedGroups never reach the content script.
  // Prefer an active Facebook tab from any window, then fall back to the
  // current window, and finally to any open Facebook tab.
  const isFacebookTab=tab=>{
    try{
      const host=new URL(tab?.url||"").hostname.toLowerCase();
      return host==="facebook.com"||host.endsWith(".facebook.com");
    }catch{return false;}
  };
  const activeFacebook=await chrome.tabs.query({active:true,url:["*://facebook.com/*","*://*.facebook.com/*"]});
  if(activeFacebook[0])return activeFacebook[0];
  const [current]=await chrome.tabs.query({active:true,currentWindow:true});
  if(isFacebookTab(current))return current;
  const facebookTabs=await chrome.tabs.query({url:["*://facebook.com/*","*://*.facebook.com/*"]});
  return facebookTabs.find(isFacebookTab)||null;
}
async function autoReloadAndRetry(tabId, msg, statusEl){
  statusEl.textContent = t("p.autoReload");
  try{ await chrome.tabs.reload(tabId); }catch{}
  await new Promise(r=>setTimeout(r, 3500));
  return new Promise(resolve=>{
    chrome.tabs.sendMessage(tabId, msg, res=>{
      if(chrome.runtime.lastError){
        statusEl.textContent = t("p.reloading");
        setTimeout(()=> chrome.tabs.sendMessage(tabId, msg, res2=>{
          if(chrome.runtime.lastError) { statusEl.textContent=t("p.noConnRetry"); resolve({ok:false}); }
          else resolve({ok:true, res:res2});
        }), 2000);
      } else resolve({ok:true, res});
    });
  });
}

function friendTargetUrl(cfg){
  if(cfg.mode==="suggestions")return "https://www.facebook.com/friends/suggestions";
  if(cfg.mode==="confirm")return "https://www.facebook.com/friends/requests";
  return cfg.groups[0]?`https://www.facebook.com/groups/${encodeURIComponent(cfg.groups[0].id)}/members/`:"https://www.facebook.com/friends/suggestions";
}

// Dù tab đang ở trang nào, mỗi nút Bắt đầu phải đưa về đúng route nhiệm vụ
// trước khi gửi lệnh cho content script.
function isPopupMainFeedUrl(url){
  try{
    const u=new URL(url);
    if(!(u.hostname==="facebook.com"||u.hostname.endsWith(".facebook.com")))return false;
    return u.pathname==="/"||u.pathname==="/home.php";
  }catch{return false;}
}
async function ensureTaskTab(targetUrl,statusEl,statusText,routeMatches,beforeNavigate){
  let tab=await getActiveTab();
  // A run must be durable before a navigation starts.  Creating an inert tab
  // first also gives the persisted run a stable owner when there was no tab.
  if(!tab)tab=await chrome.tabs.create({url:"about:blank",active:true});
  const needsNav=!tab.url?.includes("facebook.com")||(typeof routeMatches==="function"&&!routeMatches(tab.url||""));
  if(typeof beforeNavigate==="function")await beforeNavigate(tab,needsNav);
  if(!needsNav)return tab;
  if(statusEl&&statusText)statusEl.textContent=statusText;
  await chrome.tabs.update(tab.id,{url:targetUrl});
  await new Promise(r=>setTimeout(r,4500));
  // Do not accidentally hand a run to a different tab if the user changed
  // the active tab while the target route was loading.
  try{return await chrome.tabs.get(tab.id);}catch{return null;}
}
// Quy tắc chung: persist phiên TRƯỚC khi chuyển trang/gửi lệnh để tab tự
// resume sau mọi điều hướng/reload/gửi hụt. Khi gửi thất bại, chỉ coi là lỗi
// nếu cờ chạy đã tắt (từ chối thật); cờ còn bật nghĩa là phiên đang tự chạy.
async function runStillActive(flag){
  try{const live=await chrome.storage.local.get(flag);return !!(live&&live[flag]);}catch{return false;}
}
// Quy tắc DỪNG BẰNG MỌI GIÁ: lệnh dừng gửi tới TẤT CẢ tab Facebook (phiên có
// thể đang chạy ở tab khác tab đang mở), đồng thời ghi cờ dừng trực tiếp để
// các điểm resume không hồi sinh phiên đã dừng.
async function broadcastToFacebookTabs(msg){
  try{
    const tabs=await chrome.tabs.query({url:"*://*.facebook.com/*"});
    await Promise.all((tabs||[]).map(t=>new Promise(resolve=>{try{chrome.tabs.sendMessage(t.id,msg,()=>resolve());}catch{resolve();}})));
  }catch{}
}

async function buildFriendConfig(){
  const cfg=saveConfig();
  const tab=await getActiveTab();
  return {cfg,tab};
}

async function sendFriendCommand(tab,msg){
  return new Promise(resolve=>chrome.tabs.sendMessage(tab.id,msg,async response=>{
    if(chrome.runtime.lastError){
      const retry=await autoReloadAndRetry(tab.id,msg,statusEl);
      resolve(retry.ok?(retry.res||{ok:true}):{ok:false,error:t("p.frNoConn")});
    }else resolve(response||{ok:false,error:t("p.frNoResp")});
  }));
}

startBtn.addEventListener("click", async () => {
  if(isRunning){
    if(friendMode==="confirm"){
      const stored=await chrome.storage.local.get("friendConfirmRunState"),state=stored.friendConfirmRunState||{};
      state.active=false;state.nextAllowedAt=0;
      await chrome.storage.local.set({friendConfirmRunState:state,friendConfirmActive:false,friendConfirmStatus:t("p.frStoppedByUser")});
      broadcastToFacebookTabs({action:"friendConfirmStop"});
    }else{
      const stored=await chrome.storage.local.get("friendRunState"),state=stored.friendRunState||{};
      state.active=false;state.nextAllowedAt=0;
      await chrome.storage.local.set({friendRunState:state,isRunning:false,friendStatus:t("p.frStoppedByUser"),lastMessage:t("p.frStoppedByUser")});
      broadcastToFacebookTabs({action:"friendStop"});
    }
    const tab=await getActiveTab();
    if(tab?.url?.includes("facebook.com"))chrome.tabs.sendMessage(tab.id,{action:friendMode==="confirm"?"friendConfirmStop":"friendStop"});
    setRunning(false);updateCount();return;
  }
  const {cfg,tab:initialTab}=await buildFriendConfig();
  if(cfg.minDelay>cfg.maxDelay){statusEl.textContent=t("p.gjBadDelay");return;}
  if(cfg.mode==="group-common"&&!cfg.groups.length){statusEl.textContent=t("p.frNeedGroups");return;}
  const busyOther=await chrome.storage.local.get(["isRunning","friendConfirmActive","isFeedInteracting","isAICommenting","isGroupJoining","isDiscoverJoining","pageGroupJoinActive","pageGroupPostActive","pageWatchActive","pageCommentActive","groupInteractActive","groupPostActive","groupShareActive","salesPostActive","trendLearnActive","trendPostActive"]);
  if(Object.values(busyOther).some(Boolean)){statusEl.textContent=t("c.frBusyOther");return;}
  const targetUrl=friendTargetUrl(cfg);
  const friendRunId=`friend-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const friendDelayMs=cfg.minDelay+Math.random()*Math.max(0,cfg.maxDelay-cfg.minDelay);
  const confirming=cfg.mode==="confirm";
  let tab=await ensureTaskTab(
    targetUrl,
    statusEl,
    t("p.frOpenSource"),
    url=>{try{return new URL(url).pathname.replace(/\/$/,"")===new URL(targetUrl).pathname.replace(/\/$/,"");}catch{return false;}},
    async owner=>{
      if(confirming){
        await chrome.storage.local.set({friendConfirmActive:true,friendConfirmAccepted:0,friendConfirmSkipped:0,friendConfirmUncertain:0,friendConfirmRunState:{active:true,runId:friendRunId,ownerTabId:owner.id,mode:cfg.mode,config:cfg,acceptedCount:0,skippedCount:0,uncertainCount:0,attemptedKeys:[],emptyRounds:0,sourceReloads:0,nextAllowedAt:Date.now()+friendDelayMs,stage:"list",pendingProfile:null,profileEvidenceByKey:{},status:t("c.frConfirmPreparing"),startedAt:Date.now()},friendConfirmStatus:t("c.frConfirmPreparing")});
      }else{
        await chrome.storage.local.set({isRunning:true,sentCount:0,friendSkipped:0,friendUncertain:0,friendRunState:{active:true,runId:friendRunId,ownerTabId:owner.id,mode:cfg.mode,config:cfg,sentCount:0,skippedCount:0,uncertainCount:0,attemptedKeys:[],groupIndex:0,emptyRounds:0,sourceReloads:0,nextAllowedAt:Date.now()+friendDelayMs,groupWaitKey:"",groupWaitStartedAt:0,status:t("c.frPreparing"),startedAt:Date.now()},friendStatus:t("c.frPreparing")});
      }
    }
  );
  if(!tab){setRunning(false);await chrome.storage.local.set({isRunning:false});statusEl.textContent=t("p.frStartFail");return;}
  statusEl.textContent=t("p.frStarting");
  setRunning(true);
  const response=await sendFriendCommand(tab,{action:confirming?"friendConfirmStart":"friendStart",config:cfg});
  if(response?.ok){setRunning(true);updateCount();}
  else if(response?.error&&response.error===t("c.frBusyOther")){
    setRunning(false);
    if(confirming){const st=await chrome.storage.local.get("friendConfirmRunState"),fs=st.friendConfirmRunState||{};fs.active=false;await chrome.storage.local.set({friendConfirmRunState:fs,friendConfirmActive:false});}
    else{const st=await chrome.storage.local.get("friendRunState"),fs=st.friendRunState||{};fs.active=false;await chrome.storage.local.set({friendRunState:fs,isRunning:false});}
    statusEl.textContent=response.error;
  }
  else if(await runStillActive(confirming?"friendConfirmActive":"isRunning")){setRunning(true);updateCount();}
  else if(confirming){setRunning(false);const st2=await chrome.storage.local.get("friendConfirmRunState"),fs2=st2.friendConfirmRunState||{};fs2.active=false;await chrome.storage.local.set({friendConfirmRunState:fs2,friendConfirmActive:false});statusEl.textContent=response?.error||t("p.frStartFail");}
  else{setRunning(false);const st2=await chrome.storage.local.get("friendRunState"),fs2=st2.friendRunState||{};fs2.active=false;await chrome.storage.local.set({friendRunState:fs2,isRunning:false});statusEl.textContent=response?.error||t("p.frStartFail");}
});

scanBtn.addEventListener("click", async () => {
  const {cfg,tab}=await buildFriendConfig();
  if(cfg.mode==="group-common"&&!cfg.groups.length){statusEl.textContent=t("p.frNeedScanGroups");return;}
  if(!tab?.url?.includes("facebook.com")){statusEl.textContent=t("p.frNeedFb");return;}
  statusEl.textContent=t("p.frScanning");
  const response=await sendFriendCommand(tab,{action:cfg.mode==="confirm"?"friendConfirmScan":"friendScan",config:cfg});
  if(response?.needsNavigation&&response.targetUrl){
    await chrome.tabs.update(tab.id,{url:response.targetUrl});
    await chrome.storage.local.set({[cfg.mode==="confirm"?"friendConfirmStatus":"friendStatus"]:t("p.frReopened")});
    return;
  }
  if(response?.ok){
    if(cfg.mode==="confirm"){
      const candidates=response.candidates||[];
      const totals=candidates.reduce((sum,candidate)=>{
        const decision=["pass","reject","unknown"].includes(candidate.decision)?candidate.decision:"unknown";
        sum[decision]+=1;
        return sum;
      },{pass:0,reject:0,unknown:0});
      statusEl.textContent=t("p.frConfirmFound",{total:candidates.length,pass:totals.pass,unknown:totals.unknown,reject:totals.reject});
      countEl.textContent=t("p.frConfirmFoundCount",{pass:totals.pass,total:candidates.length});
      renderFriendConfirmScan(candidates);
    }else{
      statusEl.textContent=response.sourceReady===false?t("p.frNoSection"):t("p.frFound",{n:response.count||0});
      countEl.textContent=t("p.frFoundCount",{n:response.count||0});
    }
  }
  else statusEl.textContent=response?.error||t("p.frScanFail");
});

friendOpenSuggestionsBtn.onclick=async()=>{const tab=await getActiveTab();if(tab)await chrome.tabs.update(tab.id,{url:"https://www.facebook.com/friends/suggestions"});};
friendOpenConfirmBtn.onclick=async()=>{const tab=await getActiveTab();if(tab)await chrome.tabs.update(tab.id,{url:"https://www.facebook.com/friends/requests"});};

loadFriendGroupsBtn.onclick=async()=>{
  let tab=await getActiveTab();if(!tab)return;
  statusEl.textContent=t("p.loadAllGroups");
  if(!/facebook\.com\/groups\/joins/.test(tab.url||"")){
    await chrome.tabs.update(tab.id,{url:"https://www.facebook.com/groups/joins/?nav_source=tab"});
    await new Promise(resolve=>setTimeout(resolve,5000));
    tab=await getActiveTab();
  }
  const response=await sendFriendCommand(tab,{action:"scanJoinedGroups"});
  if(!response?.ok){statusEl.textContent=response?.error||t("p.loadGroupsFail");return;}
  const groups=response.groups||[];
  renderFriendGroups(groups,groups.map(g=>String(g.id)));
  await chrome.storage.local.set({joinedGroups:groups});
  await chrome.storage.sync.set({friendGroupIds:groups.map(g=>String(g.id))});
  statusEl.textContent=t("p.frLoadedGroups",{n:groups.length});
};

selectAllFriendGroupsBtn.onclick=()=>{
  const visible=[...friendGroupList.querySelectorAll('label[data-name]')].filter(row=>row.style.display!=="none");
  const boxes=visible.map(row=>row.querySelector(".friend-group-check")).filter(Boolean);
  const turnOn=boxes.some(box=>!box.checked);boxes.forEach(box=>box.checked=turnOn);saveConfig();
};
friendGroupKeyword.oninput=()=>{const key=friendGroupKeyword.value.trim().toLocaleLowerCase("vi");friendGroupList.querySelectorAll('label[data-name]').forEach(row=>row.style.display=!key||row.dataset.name.includes(key)?"flex":"none");};
friendGroupList.addEventListener("change",event=>{if(event.target.classList.contains("friend-group-check"))saveConfig();});

friendResetBtn.onclick=async()=>{
  if(friendMode==="confirm"){
    const saved=await chrome.storage.local.get("friendConfirmRunState");
    const state=saved.friendConfirmRunState&&typeof saved.friendConfirmRunState==="object"?{...saved.friendConfirmRunState,active:false,nextAllowedAt:0,acceptedCount:0,skippedCount:0,uncertainCount:0,attemptedKeys:[],emptyRounds:0,sourceReloads:0,stage:"list",pendingProfile:null,profileEvidenceByKey:{}}:{active:false,nextAllowedAt:0,acceptedCount:0,skippedCount:0,uncertainCount:0,attemptedKeys:[],stage:"list",profileEvidenceByKey:{}};
    await chrome.storage.local.set({friendConfirmActive:false,friendConfirmAccepted:0,friendConfirmSkipped:0,friendConfirmUncertain:0,friendConfirmStatus:t("p.frResetDone"),friendConfirmRunState:state});
  }else{
    const saved=await chrome.storage.local.get("friendRunState");
    const friendRunState=saved.friendRunState&&typeof saved.friendRunState==="object"?{...saved.friendRunState,active:false,nextAllowedAt:0}:{active:false,nextAllowedAt:0};
    // Persist the stop first; the owner tab may have navigated or its message
    // port may already be gone.
    await chrome.storage.local.set({isRunning:false,sentCount:0,friendSkipped:0,friendUncertain:0,friendStatus:t("p.frResetDone"),friendRunState});
  }
  const tab=await getActiveTab();
  const resetAction=friendMode==="confirm"?"friendConfirmReset":"friendReset";
  if(tab?.url?.includes("facebook.com"))await sendFriendCommand(tab,{action:resetAction});
  broadcastToFacebookTabs({action:resetAction});
  setRunning(false);updateCount();
};
friendClearHistoryBtn.onclick=async()=>{
  if(!confirm(t("p.frClearConfirm")))return;
  await chrome.storage.local.remove(friendMode==="confirm"?"friendConfirmHistory":"friendProfileHistory");
  statusEl.textContent=t("p.frClearDone");
};

chrome.storage.onChanged.addListener(changes => {
  if (changes.sentCount||changes.friendConfirmAccepted||changes.friendConfirmActive||changes.friendStatus||changes.friendConfirmStatus) updateCount();
  if (changes.isRunning&&friendMode!=="confirm") setRunning(changes.isRunning.newValue);
  if (changes.friendConfirmActive&&friendMode==="confirm") setRunning(changes.friendConfirmActive.newValue);
  if (changes.friendStatus&&friendMode!=="confirm") statusEl.textContent = changes.friendStatus.newValue;
  else if (changes.friendConfirmStatus&&friendMode==="confirm") statusEl.textContent = changes.friendConfirmStatus.newValue;
  else if (changes.lastMessage&&friendMode!=="confirm") statusEl.textContent = changes.lastMessage.newValue;
  if(changes.friendSkipped&&friendMode!=="confirm")friendSkippedEl.textContent=changes.friendSkipped.newValue||0;
  if(changes.friendUncertain&&friendMode!=="confirm")friendUncertainEl.textContent=changes.friendUncertain.newValue||0;
  if(changes.friendConfirmSkipped&&friendMode==="confirm")friendSkippedEl.textContent=changes.friendConfirmSkipped.newValue||0;
  if(changes.friendConfirmUncertain&&friendMode==="confirm")friendUncertainEl.textContent=changes.friendConfirmUncertain.newValue||0;
  if (changes.scrapeCount) { $("scrapeCount").textContent = t("sc.countPosts",{n:changes.scrapeCount.newValue}); }
  if (changes.scrapeStatus) { $("scrapeStatus").textContent = changes.scrapeStatus.newValue; }
  if (changes.groupStatus) { $("groupStatus").textContent = changes.groupStatus.newValue; }
  if (changes.groupJoined !== undefined) { const t=parseInt($("groupTarget").value)||10; $("groupCount").textContent = `${changes.groupJoined.newValue} / ${t}`; }
  if (changes.groupFound !== undefined) { /* optional */ }
  if (changes.isGroupJoining !== undefined) setGroupRunning(changes.isGroupJoining.newValue);
});
loadConfig();
[minEl,maxEl,maxReqEl,friendMinMutual,friendConfirmMinMutual,friendConfirmMinGroups,friendConfirmHometown,friendConfirmSchool,friendConfirmRequirePhoto,friendConfirmSkipUnknown].forEach(el=>el.addEventListener("change",saveConfig));

// SCRAPE - khong tu tai, chon format moi tai
const scrapeBtn = $("scrapeBtn");
const stopScrapeBtn = $("stopScrapeBtn");
const scrapeNum = $("scrapeNum");
const scrapeStatus = $("scrapeStatus");
const scrapeCountEl = $("scrapeCount");
const scrapeSourceUrl = $("scrapeSourceUrl");
const scrapeSkipAds = $("scrapeSkipAds");
const downloadGroup = $("downloadGroup");
const dlMd = $("dlMd");
const dlJson = $("dlJson");
const dlTxt = $("dlTxt");
let isScraping = false;

function scrapeSourceKey(url=""){
  try{
    const u=new URL(url,location.href);
    const host=String(u.hostname||"").toLowerCase().replace(/\.$/,"");
    const origin=host==="facebook.com"||host.endsWith(".facebook.com")?"https://facebook.com":u.origin.toLowerCase();
    return `${origin}${u.pathname}`.replace(/\/$/,"").toLowerCase();
  }catch{return String(url||"").split(/[?#]/)[0].replace(/\/$/,"").toLowerCase();}
}

function setScraping(v) {
  isScraping = v;
  scrapeBtn.textContent = v ? t("p.scraping") : t("sc.start");
  scrapeBtn.classList.toggle("running", v);
  if (v) downloadGroup.classList.add("hidden");
}

function updateDownloadVisibility(ready) {
  if (ready) downloadGroup.classList.remove("hidden");
}

async function requestDownload(format) {
  let tab = await getActiveTab();
  if (!tab || !tab.url.includes("facebook.com")) {
    scrapeStatus.textContent = t("p.scAutoDl");
    if(tab) await chrome.tabs.update(tab.id, { url: "https://www.facebook.com/" });
    else tab = await chrome.tabs.create({ url: "https://www.facebook.com/" });
    await new Promise(r=>setTimeout(r,3000));
    tab = await getActiveTab();
  }
  chrome.tabs.sendMessage(tab.id, { action: "downloadScrape", format }, async res => {
    if (chrome.runtime.lastError) {
      const retry = await autoReloadAndRetry(tab.id, { action: "downloadScrape", format }, scrapeStatus);
      if(retry.ok && retry.res?.ok) scrapeStatus.textContent = t("p.scDlDone",{n:retry.res.count,fmt:format.toUpperCase()});
      else if(retry.res?.reason === "source-mismatch") scrapeStatus.textContent = t("p.scWrongSource");
      else scrapeStatus.textContent = t("p.scNoData");
      return;
    }
    if (res && res.ok) scrapeStatus.textContent = t("p.scDlDone",{n:res.count,fmt:format.toUpperCase()});
    else scrapeStatus.textContent = res?.reason === "source-mismatch" ? t("p.scWrongSource") : t("p.scNoData");
  });
}

scrapeBtn.addEventListener("click", async () => {
  const shareRun=await chrome.storage.local.get(["groupShareActive","salesPostActive","trendLearnActive","trendPostActive","pageGroupJoinActive","pageGroupPostActive","pageWatchActive","pageCommentActive"]);if(Object.values(shareRun).some(Boolean)){scrapeStatus.textContent=(shareRun.pageGroupJoinActive||shareRun.pageGroupPostActive||shareRun.pageWatchActive||shareRun.pageCommentActive)?t("pg.busyOther"):t("p.shBusyScrape");return;}
  if(isScraping)return;
  const sourceUrl = scrapeSourceUrl.value.trim();
  if(sourceUrl){
    let parsed;
    try{ parsed=new URL(sourceUrl); }catch{ scrapeStatus.textContent=t("p.scBadUrl"); return; }
    const hostname=String(parsed.hostname||"").toLowerCase().replace(/\.$/,"");
    const isFacebookHost=hostname==="facebook.com"||hostname.endsWith(".facebook.com");
    if(!isFacebookHost){ scrapeStatus.textContent=t("p.scNeedFbUrl"); return; }
  }
  const count = parseInt(scrapeNum.value) || 20;
  const skipAds = scrapeSkipAds.checked;
  chrome.storage.sync.set({ scrapeNum: count, scrapeSourceUrl: sourceUrl, scrapeSkipAds: skipAds });
  setScraping(true);
  const activeTab=await getActiveTab();
  const targetUrl=sourceUrl||(activeTab?.url?.includes("facebook.com")?activeTab.url:"https://www.facebook.com/");
  const wantedSource=scrapeSourceKey(sourceUrl||targetUrl);
  // Store the exact source and option before the tab navigates.  The content
  // script will only resume after it sees this same path, so an old route
  // cannot scrape during the redirect.
  let tab=await ensureTaskTab(
    targetUrl,
    scrapeStatus,
    sourceUrl?t("p.scOpeningSource"):t("p.scAutoOpen"),
    url=>sourceUrl?scrapeSourceKey(url)===wantedSource:!!String(url||"").includes("facebook.com"),
    async owner=>{
      await chrome.storage.local.set({isScraping:true,scrapeTarget:count,scrapeOwnerTabId:owner.id,scrapeRunSourceUrl:wantedSource,scrapeRequestedSourceUrl:sourceUrl||wantedSource,scrapeSkipAds:skipAds,scrapeStartedAt:Date.now(),scrapeStatus:t("p.scRunning",{n:count})});
    }
  );
  if(!tab||!tab.url?.includes("facebook.com")||(sourceUrl&&scrapeSourceKey(tab.url)!==wantedSource)){
    scrapeStatus.textContent=sourceUrl?t("p.scLeftSource"):t("p.scMismatch");
    await chrome.storage.local.set({isScraping:false,scrapeReady:false,scrapeHasData:false,scrapeCount:0});
    await chrome.storage.local.remove(["scrapePosts","scrapeTarget","scrapeRunSourceUrl","scrapeRequestedSourceUrl","scrapeSkipAds","scrapeStartedAt"]);
    setScraping(false);
    return;
  }
  chrome.tabs.sendMessage(tab.id, { action: "startScrape", count, skipAds, sourceUrl }, async res => {
    if (chrome.runtime.lastError) {
      const retry = await autoReloadAndRetry(tab.id, { action: "startScrape", count, skipAds, sourceUrl }, scrapeStatus);
      if(retry.ok&&retry.res?.ok){ setScraping(true); scrapeStatus.textContent = t("p.scRunning",{n:count}); }
      else if(await runStillActive("isScraping")){ setScraping(true); scrapeStatus.textContent = t("p.scRunning",{n:count}); }
      else{setScraping(false);scrapeStatus.textContent=retry.res?.error||t("p.scMismatch");}
      return;
    }
    if (res && res.ok) { setScraping(true); scrapeStatus.textContent = t("p.scRunning",{n:count}); }
    else if(res && !res.ok){await chrome.storage.local.set({isScraping:false});await chrome.storage.local.remove(["scrapeTarget"]);setScraping(false);scrapeStatus.textContent=res.error||t("p.scMismatch");}
  });
});

stopScrapeBtn.addEventListener("click", async () => {
  setScraping(false);
  await chrome.storage.local.set({isScraping:false});
  await chrome.storage.local.remove(["scrapeTarget"]);
  broadcastToFacebookTabs({action:"stopScrape"});
  const tab = await getActiveTab();
  if (tab) chrome.tabs.sendMessage(tab.id, { action: "stopScrape" }, () => setScraping(false));
  scrapeStatus.textContent = t("p.stoppedX");
});

dlMd.onclick = () => requestDownload("md");
dlJson.onclick = () => requestDownload("json");
dlTxt.onclick = () => requestDownload("txt");

const resetBtn = $("resetScrapeBtn");
resetBtn.onclick = async () => {
  // Reset must work even if the tab was closed, redirected, or is no longer
  // on Facebook.  Broadcast is only the fast path; storage is the authority.
  await chrome.storage.local.set({scrapeCount:0,scrapeStatus:t("p.scResetDone"),scrapeReady:false,scrapeHasData:false,isScraping:false});
  await chrome.storage.local.remove(["scrapePosts","scrapeTarget","scrapeRunSourceUrl","scrapeRequestedSourceUrl","scrapeSkipAds","scrapeStartedAt"]);
  scrapeCountEl.textContent=t("sc.countPosts",{n:0});
  downloadGroup.classList.add("hidden");
  scrapeStatus.textContent=t("p.scResetDone");
  setScraping(false);
  broadcastToFacebookTabs({action:"resetScrape"});
  const tab = await getActiveTab();
  if(tab?.url?.includes("facebook.com"))chrome.tabs.sendMessage(tab.id,{action:"resetScrape"},()=>{});
};

// load scrape config
chrome.storage.sync.get(["scrapeNum","scrapeSourceUrl","scrapeSkipAds"], res => {
  if (res.scrapeNum) scrapeNum.value = res.scrapeNum;
  if (res.scrapeSourceUrl !== undefined) scrapeSourceUrl.value = res.scrapeSourceUrl;
  if (res.scrapeSkipAds !== undefined) scrapeSkipAds.checked = res.scrapeSkipAds;
});
chrome.storage.local.get(["scrapeCount", "scrapeStatus", "scrapeReady", "isScraping"], res => {
  if (res.scrapeCount !== undefined) scrapeCountEl.textContent = t("sc.countPosts",{n:res.scrapeCount});
  if (res.scrapeStatus) scrapeStatus.textContent = res.scrapeStatus;
  if (res.scrapeReady) updateDownloadVisibility(true);
  if (res.isScraping) setScraping(true);
});
// khi scrape xong, reset nút
chrome.storage.onChanged.addListener(changes => {
  if (changes.isScraping !== undefined && !changes.isScraping.newValue) setScraping(false);
  if (changes.scrapeReady) updateDownloadVisibility(changes.scrapeReady.newValue);
});

// NUÔI PAGE - chọn Page đang quản trị + tham gia nhóm theo nguồn riêng.
// Không dùng lại state/counter/selector/proof của group.js.
const pageStatus=$("pageStatus"),pageJoinStatus=$("pageJoinStatus"),managedPageList=$("managedPageList");
const loadManagedPagesBtn=$("loadManagedPagesBtn"),refreshManagedPagesBtn=$("refreshManagedPagesBtn");
const pageModeKeywordBtn=$("pageModeKeywordBtn"),pageModeDiscoverBtn=$("pageModeDiscoverBtn"),pageKeywordOptions=$("pageKeywordOptions");
const pageGroupKeyword=$("pageGroupKeyword"),pageGroupTarget=$("pageGroupTarget"),pageGroupMinDelay=$("pageGroupMinDelay"),pageGroupMaxDelay=$("pageGroupMaxDelay");
const pageGroupAnswers=$("pageGroupAnswers"),pageGroupAiEnabled=$("pageGroupAiEnabled"),pageGroupAiPrompt=$("pageGroupAiPrompt");
const pageGroupStartBtn=$("pageGroupStartBtn"),pageGroupStopBtn=$("pageGroupStopBtn"),pageGroupResetBtn=$("pageGroupResetBtn"),pageGroupCount=$("pageGroupCount");
let managedPages=[],selectedManagedPage=null,pageJoinMode="keyword",pageJoinRunning=false;

function pageEsc(value){return String(value||"").replace(/[<>&"]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[c]));}
function pageKeyForPopup(page){
  try{const u=new URL(String(page?.url||""));return u.searchParams.get("id")||u.pathname.replace(/\/+$/g,"").toLowerCase()||String(page?.name||"").toLowerCase();}catch{return String(page?.id||page?.name||"").toLowerCase();}
}
function renderManagedPages(pages,selectedKey=""){
  managedPages=Array.isArray(pages)?pages:[];
  if(!managedPages.length){managedPageList.innerHTML='<div class="hint" style="padding:6px">'+t("pg.noPages")+'</div>';return;}
  const chosen=selectedKey||pageKeyForPopup(selectedManagedPage);
  managedPageList.innerHTML=managedPages.map((page,index)=>{
    const key=pageKeyForPopup(page),checked=key===chosen?"checked":"";
    return `<label style="display:flex;align-items:center;gap:8px;padding:7px;margin:0;border-bottom:1px solid #eee;cursor:pointer"><input class="managed-page-radio" type="radio" name="managedPage" value="${pageEsc(key)}" ${checked} style="width:auto"><span style="display:flex;flex-direction:column;min-width:0"><b style="font-size:12px;overflow:hidden;text-overflow:ellipsis">${pageEsc(page.name||t("pg.pageFallback",{n:index+1}))}</b><small style="color:#65676b;overflow:hidden;text-overflow:ellipsis">${pageEsc(page.url||"")}</small></span></label>`;
  }).join("");
  const picked=managedPages.find(page=>pageKeyForPopup(page)===chosen);
  if(picked)selectedManagedPage=picked;
}
function setPageMode(mode){
  if(pageJoinRunning&&mode!==pageJoinMode){pageJoinStatus.textContent=t("pg.modeLocked");return;}
  pageJoinMode=mode==="discover"?"discover":"keyword";
  pageModeKeywordBtn.style.background=pageJoinMode==="keyword"?"#1565c0":"#e4e6eb";
  pageModeKeywordBtn.style.color=pageJoinMode==="keyword"?"#fff":"#050505";
  pageModeDiscoverBtn.style.background=pageJoinMode==="discover"?"#00897b":"#e4e6eb";
  pageModeDiscoverBtn.style.color=pageJoinMode==="discover"?"#fff":"#050505";
  pageKeywordOptions.classList.toggle("hidden",pageJoinMode!=="keyword");
  chrome.storage.sync.set({pageJoinMode});
}
function setPageRunning(value){
  pageJoinRunning=!!value;
  pageGroupStartBtn.textContent=pageJoinRunning?t("p.pgBusy"):t("pg.start");
  pageGroupStartBtn.classList.toggle("running",pageJoinRunning);
}
async function refreshPageAiSummary(){
  // Giữ cấu hình AI thống nhất; không tạo ô API key riêng cho Nuôi Page.
  try{const cfg=await getUnifiedAiConfig();pageStatus.dataset.aiReady=cfg.key&&cfg.model?"true":"false";}catch(_){}
}
async function scanManagedPages(){
  let tab=await getActiveTab();
  if(!tab){pageStatus.textContent=t("pg.noFb");return;}
  pageStatus.textContent=t("pg.openManager");
  if(!/facebook\.com\/pages(?:[/?]|$)/i.test(tab.url||"")){
    await chrome.tabs.update(tab.id,{url:"https://www.facebook.com/pages/?category=your_pages"});
    await new Promise(resolve=>setTimeout(resolve,4500));
  }
  const response=await new Promise(resolve=>chrome.tabs.sendMessage(tab.id,{action:"scanManagedPages"},async result=>{
    if(chrome.runtime.lastError){const retry=await autoReloadAndRetry(tab.id,{action:"scanManagedPages"},pageStatus);resolve(retry.ok?(retry.res||{ok:false}):{ok:false});}
    else resolve(result||{ok:false});
  }));
  if(!response?.ok){pageStatus.textContent=response?.error||t("pg.scanFail");return;}
  renderManagedPages(response.pages||[],pageKeyForPopup(selectedManagedPage));
  await chrome.storage.local.set({managedPages:response.pages||[]});
  pageStatus.textContent=response.pages?.length?t("pg.loadedPages",{n:response.pages.length}):t("pg.noPages");
}
loadManagedPagesBtn.onclick=scanManagedPages;
refreshManagedPagesBtn.onclick=scanManagedPages;
managedPageList.addEventListener("change",event=>{
  if(!event.target.classList.contains("managed-page-radio"))return;
  selectedManagedPage=managedPages.find(page=>pageKeyForPopup(page)===event.target.value)||null;
  if(selectedManagedPage){chrome.storage.sync.set({pageSelected:selectedManagedPage});pageStatus.textContent=t("pg.selected",{name:selectedManagedPage.name});}
});
pageModeKeywordBtn.onclick=()=>setPageMode("keyword");
pageModeDiscoverBtn.onclick=()=>setPageMode("discover");
bindPromptPersistence("pageGroupAiPrompt",pageGroupAiPrompt);
pageGroupAnswers.addEventListener("change",()=>chrome.storage.sync.set({pageGroupAnswers:pageGroupAnswers.value}));
pageGroupAiEnabled.addEventListener("change",()=>chrome.storage.sync.set({pageGroupAiEnabled:pageGroupAiEnabled.checked}));
pageGroupKeyword.addEventListener("change",()=>chrome.storage.sync.set({pageGroupKeyword:pageGroupKeyword.value}));
pageGroupAiPrompt.addEventListener("change",()=>chrome.storage.sync.set({pageGroupAiPrompt:pageGroupAiPrompt.value}));
async function pageBusyWithOtherRun(){
  const keys=["isRunning","friendConfirmActive","isScraping","isFeedInteracting","isAICommenting","isGroupJoining","isDiscoverJoining","groupInteractActive","groupPostActive","groupShareActive","salesPostActive","trendLearnActive","trendPostActive","pageGroupJoinActive","pageGroupPostActive","pageWatchActive","pageCommentActive"];
  const state=await chrome.storage.local.get(keys);return keys.some(key=>!!state[key]);
}
pageGroupStartBtn.onclick=async()=>{
  if(pageJoinRunning){pageJoinStatus.textContent=t("pg.alreadyRunning");return;}
  if(!selectedManagedPage){pageJoinStatus.textContent=t("pg.needPage");return;}
  const keyword=pageGroupKeyword.value.trim();
  if(pageJoinMode==="keyword"&&!keyword){pageJoinStatus.textContent=t("pg.needKeyword");return;}
  const target=Math.max(1,Math.min(100,parseInt(pageGroupTarget.value)||10));
  const minDelay=Math.max(5,Math.min(3600,parseInt(pageGroupMinDelay.value)||15));
  const maxDelay=Math.max(5,Math.min(3600,parseInt(pageGroupMaxDelay.value)||30));
  if(minDelay>maxDelay){pageJoinStatus.textContent=t("pg.badDelay");return;}
  if(await pageBusyWithOtherRun()){pageJoinStatus.textContent=t("pg.busyOther");return;}
  const aiConfig=await getUnifiedAiConfig();
  const runId=`page-group-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const cfg={page:selectedManagedPage,mode:pageJoinMode,keyword,target,minDelay,maxDelay,answers:pageGroupAnswers.value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean),aiEnabled:!!pageGroupAiEnabled.checked,aiPrompt:pageGroupAiPrompt.value.trim(),aiConfig,runId};
  const safeCfg={...cfg,aiConfig:{provider:aiConfig.provider,model:aiConfig.model,url:aiConfig.url}};
  await chrome.storage.sync.set({pageSelected:selectedManagedPage,pageJoinMode,pageGroupKeyword:keyword,pageGroupTarget:target,pageGroupMinDelay:minDelay,pageGroupMaxDelay:maxDelay,pageGroupAnswers:pageGroupAnswers.value,pageGroupAiEnabled:cfg.aiEnabled,pageGroupAiPrompt:cfg.aiPrompt});
  setPageRunning(true);
  const targetUrl=pageJoinMode==="discover"?"https://www.facebook.com/groups/discover":"https://www.facebook.com/search/groups/?q="+encodeURIComponent(keyword);
  const tab=await ensureTaskTab(targetUrl,pageJoinStatus,t("pg.openRoute"),url=>pageJoinMode==="discover"?/\/groups\/discover(?:\/|\?|$)/.test(url):/\/search\/groups(?:\/|\?|$)/.test(url)&&new URL(url).searchParams.get("q")===keyword,async owner=>{
    await chrome.storage.local.set({pageGroupJoinActive:true,pageGroupJoinRunId:runId,pageGroupJoinOwnerTabId:owner.id,pageGroupJoinConfig:{...safeCfg,ownerTabId:owner.id},pageGroupJoinRunState:{active:true,runId,ownerTabId:owner.id,config:{...safeCfg,ownerTabId:owner.id},joined:0,skipped:0,attemptedKeys:[],nextAllowedAt:Date.now()+minDelay*1000,status:t("pg.starting")},pageGroupJoinJoined:0,pageGroupJoinSkipped:0,pageGroupJoinAttemptedKeys:[],pageGroupJoinNextAt:Date.now()+minDelay*1000,pageGroupJoinStatus:t("pg.starting")});
  });
  if(!tab){setPageRunning(false);await chrome.storage.local.set({pageGroupJoinActive:false});return;}
  chrome.tabs.sendMessage(tab.id,{action:"startPageGroupJoin",config:cfg,ownerTabId:tab.id,nextAllowedAt:Date.now()+minDelay*1000,joined:0,skipped:0,attemptedKeys:[]},async result=>{
    if(chrome.runtime.lastError){const retry=await autoReloadAndRetry(tab.id,{action:"startPageGroupJoin",config:cfg,ownerTabId:tab.id},pageJoinStatus);if(retry.ok||await runStillActive("pageGroupJoinActive")){pageJoinStatus.textContent=t("pg.running");return;}setPageRunning(false);pageJoinStatus.textContent=t("pg.startFail");return;}
    if(result?.ok||await runStillActive("pageGroupJoinActive")){pageJoinStatus.textContent=t("pg.running");return;}
    setPageRunning(false);pageJoinStatus.textContent=result?.error||t("pg.startFail");
  });
};
pageGroupStopBtn.onclick=async()=>{
  setPageRunning(false);
  await chrome.storage.local.set({pageGroupJoinActive:false,pageGroupJoinStatus:t("pg.stopped")});
  broadcastToFacebookTabs({action:"stopPageGroupJoin"});
};
pageGroupResetBtn.onclick=async()=>{
  setPageRunning(false);
  await chrome.storage.local.set({pageGroupJoinActive:false,pageGroupJoinJoined:0,pageGroupJoinSkipped:0,pageGroupJoinNextAt:0,pageGroupJoinStatus:t("pg.reset")});
  broadcastToFacebookTabs({action:"resetPageGroupJoin"});
};
chrome.storage.sync.get(["pageSelected","pageJoinMode","pageGroupKeyword","pageGroupTarget","pageGroupMinDelay","pageGroupMaxDelay","pageGroupAnswers","pageGroupAiEnabled","pageGroupAiPrompt"],saved=>{
  if(saved.pageSelected)selectedManagedPage=saved.pageSelected;
  if(saved.pageJoinMode)setPageMode(saved.pageJoinMode);
  if(saved.pageGroupKeyword!==undefined)pageGroupKeyword.value=saved.pageGroupKeyword;
  if(saved.pageGroupTarget!==undefined)pageGroupTarget.value=saved.pageGroupTarget;
  if(saved.pageGroupMinDelay!==undefined)pageGroupMinDelay.value=saved.pageGroupMinDelay;
  if(saved.pageGroupMaxDelay!==undefined)pageGroupMaxDelay.value=saved.pageGroupMaxDelay;
  if(saved.pageGroupAnswers!==undefined)pageGroupAnswers.value=saved.pageGroupAnswers;
  if(saved.pageGroupAiEnabled!==undefined)pageGroupAiEnabled.checked=saved.pageGroupAiEnabled;
  if(saved.pageGroupAiPrompt!==undefined)pageGroupAiPrompt.value=saved.pageGroupAiPrompt;
});
chrome.storage.local.get(["managedPages","pageGroupJoinStatus","pageGroupJoinJoined","pageGroupJoinSkipped","pageGroupJoinActive"],saved=>{
  if(saved.managedPages)renderManagedPages(saved.managedPages,pageKeyForPopup(selectedManagedPage));
  if(saved.pageGroupJoinStatus)pageJoinStatus.textContent=saved.pageGroupJoinStatus;
  pageGroupCount.textContent=`${saved.pageGroupJoinJoined||0} / ${pageGroupTarget.value||0}`;
  if(saved.pageGroupJoinActive)setPageRunning(true);
});
chrome.storage.onChanged.addListener((changes,area)=>{
  if(area!=="local")return;
  if(changes.pageGroupJoinStatus)pageJoinStatus.textContent=changes.pageGroupJoinStatus.newValue||"";
  if(changes.pageGroupJoinJoined||changes.pageGroupJoinSkipped)chrome.storage.local.get(["pageGroupJoinJoined","pageGroupJoinSkipped"],r=>{pageGroupCount.textContent=`${r.pageGroupJoinJoined||0} / ${pageGroupTarget.value||0} (bỏ qua ${r.pageGroupJoinSkipped||0})`;});
  if(changes.pageGroupJoinActive)setPageRunning(!!changes.pageGroupJoinActive.newValue);
});

// Page Care: group posts, followed Pages and Page Comment AI. These handlers
// only use page* state and message names; personal Comment AI remains in feed.js.
const pageGroupPostLinks=$("pageGroupPostLinks"),pageGroupPostTarget=$("pageGroupPostTarget"),pageGroupPostMinDelay=$("pageGroupPostMinDelay"),pageGroupPostMaxDelay=$("pageGroupPostMaxDelay"),pageGroupPostPrompt=$("pageGroupPostPrompt");
const pageGroupPostStartBtn=$("pageGroupPostStartBtn"),pageGroupPostStopBtn=$("pageGroupPostStopBtn"),pageGroupPostResetBtn=$("pageGroupPostResetBtn"),pageGroupPostStatus=$("pageGroupPostStatus"),pageGroupPostCount=$("pageGroupPostCount");
const pageWatchKeyword=$("pageWatchKeyword"),pageWatchTarget=$("pageWatchTarget"),pageWatchMinFollowers=$("pageWatchMinFollowers"),pageWatchExclude=$("pageWatchExclude");
const pageWatchStartBtn=$("pageWatchStartBtn"),pageWatchStopBtn=$("pageWatchStopBtn"),pageWatchResetBtn=$("pageWatchResetBtn"),pageWatchStatus=$("pageWatchStatus"),pageWatchCount=$("pageWatchCount");
const pageCommentSource=$("pageCommentSource"),pageCommentTarget=$("pageCommentTarget"),pageCommentMinDelay=$("pageCommentMinDelay"),pageCommentMaxDelay=$("pageCommentMaxDelay"),pageCommentPrompt=$("pageCommentPrompt");
const pageCommentStartBtn=$("pageCommentStartBtn"),pageCommentStopBtn=$("pageCommentStopBtn"),pageCommentResetBtn=$("pageCommentResetBtn"),pageCommentStatus=$("pageCommentStatus"),pageCommentCount=$("pageCommentCount");
let pagePostRunning=false,pageWatchRunning=false,pageCommentRunning=false;
function setPagePostRunning(value){pagePostRunning=!!value;pageGroupPostStartBtn.textContent=pagePostRunning?t("pgp.running"):t("pgp.start");pageGroupPostStartBtn.classList.toggle("running",pagePostRunning);}
function setPageWatchRunning(value){pageWatchRunning=!!value;pageWatchStartBtn.textContent=pageWatchRunning?t("pgw.running"):t("pgw.start");pageWatchStartBtn.classList.toggle("running",pageWatchRunning);}
function setPageCommentRunning(value){pageCommentRunning=!!value;pageCommentStartBtn.textContent=pageCommentRunning?t("pgc.running"):t("pgc.start");pageCommentStartBtn.classList.toggle("running",pageCommentRunning);}
function pageParseLines(value){return String(value||"").split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map(line=>{const [url,...nameParts]=line.split("|");return {url:canonicalFacebookUrl(url.trim()),name:nameParts.join("|").trim()};}).filter(row=>row.url);}
function canonicalFacebookUrl(value){try{const u=new URL(String(value||""));if(!(u.hostname==="facebook.com"||u.hostname.endsWith(".facebook.com")))return "";u.hash="";["ref","refid","__tn__","__cft__","mibextid","locale"].forEach(k=>u.searchParams.delete(k));return u.toString().replace(/\/$/,"");}catch{return "";}}
function pageGroupKeyFromUrl(value){try{const u=new URL(value);const m=u.pathname.match(/^\/groups\/([^/?#]+)/i);return m?`/groups/${String(m[1]).toLowerCase()}`:"";}catch{return "";}}
async function pageGroupPostTargets(){
  const explicit=pageParseLines(pageGroupPostLinks.value).map(row=>({...row,key:pageGroupKeyFromUrl(row.url)})).filter(row=>row.key);
  if(explicit.length)return explicit;
  const selectedKey=pageKeyForPopup(selectedManagedPage),stored=await chrome.storage.local.get("pageGroupJoinHistory"),rows=Array.isArray(stored.pageGroupJoinHistory)?stored.pageGroupJoinHistory:[];
  const seen=new Set();return rows.filter(row=>row.status==="confirmed"&&(!selectedKey||row.pageKey===selectedKey)&&row.groupKey&&!seen.has(row.groupKey)&&seen.add(row.groupKey)).map(row=>({key:row.groupKey,url:`https://www.facebook.com${row.groupKey}/`,name:""}));
}
async function pageFeatureBusy(){
  const state=await chrome.storage.local.get(["isRunning","friendConfirmActive","isScraping","isFeedInteracting","isAICommenting","isGroupJoining","isDiscoverJoining","groupInteractActive","groupPostActive","groupShareActive","salesPostActive","trendLearnActive","trendPostActive","pageGroupJoinActive","pageGroupPostActive","pageWatchActive","pageCommentActive"]);
  return Object.values(state).some(Boolean);
}
function pageStoreMessage(message){return new Promise(resolve=>chrome.runtime.sendMessage(message,response=>resolve(response||{ok:false})));}

pageGroupPostPrompt.addEventListener("change",()=>chrome.storage.sync.set({pageGroupPostPrompt:pageGroupPostPrompt.value}));
pageGroupPostLinks.addEventListener("change",()=>chrome.storage.sync.set({pageGroupPostLinks:pageGroupPostLinks.value}));
pageGroupPostTarget.addEventListener("change",()=>chrome.storage.sync.set({pageGroupPostTarget:pageGroupPostTarget.value}));
pageGroupPostMinDelay.addEventListener("change",()=>chrome.storage.sync.set({pageGroupPostMinDelay:pageGroupPostMinDelay.value}));
pageGroupPostMaxDelay.addEventListener("change",()=>chrome.storage.sync.set({pageGroupPostMaxDelay:pageGroupPostMaxDelay.value}));
pageWatchKeyword.addEventListener("change",()=>chrome.storage.sync.set({pageWatchKeyword:pageWatchKeyword.value}));
pageWatchTarget.addEventListener("change",()=>chrome.storage.sync.set({pageWatchTarget:pageWatchTarget.value}));
pageWatchMinFollowers.addEventListener("change",()=>chrome.storage.sync.set({pageWatchMinFollowers:pageWatchMinFollowers.value}));
pageWatchExclude.addEventListener("change",()=>chrome.storage.sync.set({pageWatchExclude:pageWatchExclude.value}));
pageCommentSource.addEventListener("change",()=>chrome.storage.sync.set({pageCommentSource:pageCommentSource.value}));
pageCommentPrompt.addEventListener("change",()=>chrome.storage.sync.set({pageCommentPrompt:pageCommentPrompt.value}));
pageCommentTarget.addEventListener("change",()=>chrome.storage.sync.set({pageCommentTarget:pageCommentTarget.value}));
pageCommentMinDelay.addEventListener("change",()=>chrome.storage.sync.set({pageCommentMinDelay:pageCommentMinDelay.value}));
pageCommentMaxDelay.addEventListener("change",()=>chrome.storage.sync.set({pageCommentMaxDelay:pageCommentMaxDelay.value}));

pageGroupPostStartBtn.onclick=async()=>{
  if(pagePostRunning){pageGroupPostStatus.textContent=t("pgp.busy");return;}
  if(!selectedManagedPage){pageGroupPostStatus.textContent=t("pg.needPage");return;}
  const groups=await pageGroupPostTargets();if(!groups.length){pageGroupPostStatus.textContent=t("pgp.groups");return;}
  const target=Math.max(1,Math.min(groups.length,parseInt(pageGroupPostTarget.value)||groups.length)),minDelay=Math.max(5,Math.min(3600,parseInt(pageGroupPostMinDelay.value)||30)),maxDelay=Math.max(5,Math.min(3600,parseInt(pageGroupPostMaxDelay.value)||60));
  if(minDelay>maxDelay){pageGroupPostStatus.textContent=t("pg.badDelay");return;}
  if(await pageFeatureBusy()){pageGroupPostStatus.textContent=t("pg.busyOther");return;}
  const aiConfig=await getUnifiedAiConfig(),runId=`page-post-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,cfg={page:selectedManagedPage,groups,target,minDelay,maxDelay,prompt:pageGroupPostPrompt.value.trim(),aiConfig,done:0,skipped:0,index:0,runId};
  const safeCfg={...cfg,aiConfig:{provider:aiConfig.provider,model:aiConfig.model,url:aiConfig.url}};
  await chrome.storage.sync.set({pageSelected:selectedManagedPage,pageGroupPostLinks:pageGroupPostLinks.value,pageGroupPostTarget:target,pageGroupPostMinDelay:minDelay,pageGroupPostMaxDelay:maxDelay,pageGroupPostPrompt:cfg.prompt});
  setPagePostRunning(true);
  const first=groups[0];
  const tab=await ensureTaskTab(first.url,pageGroupPostStatus,t("pgp.running"),url=>pageGroupKeyFromUrl(url)===first.key,async owner=>{await chrome.storage.local.set({pageGroupPostActive:true,pageGroupPostRunId:runId,pageGroupPostOwnerTabId:owner.id,pageGroupPostConfig:{...safeCfg,ownerTabId:owner.id},pageGroupPostDone:0,pageGroupPostSkipped:0,pageGroupPostIndex:0,pageGroupPostStatus:t("pgp.running")});});
  if(!tab){setPagePostRunning(false);await chrome.storage.local.set({pageGroupPostActive:false});return;}
  chrome.tabs.sendMessage(tab.id,{action:"startPageGroupPost",config:cfg,runId,ownerTabId:tab.id},async response=>{if(chrome.runtime.lastError){const retry=await autoReloadAndRetry(tab.id,{action:"startPageGroupPost",config:cfg,runId,ownerTabId:tab.id},pageGroupPostStatus);if(retry.ok||await runStillActive("pageGroupPostActive")){pageGroupPostStatus.textContent=t("pgp.running");return;}setPagePostRunning(false);return;}if(response?.ok||await runStillActive("pageGroupPostActive"))pageGroupPostStatus.textContent=t("pgp.running");else{setPagePostRunning(false);pageGroupPostStatus.textContent=response?.error||t("pgp.busy");}});
};
pageGroupPostStopBtn.onclick=async()=>{setPagePostRunning(false);await chrome.storage.local.set({pageGroupPostActive:false,pageGroupPostStatus:t("pgp.stopped")});broadcastToFacebookTabs({action:"stopPageGroupPost"});};
pageGroupPostResetBtn.onclick=async()=>{setPagePostRunning(false);await chrome.storage.local.set({pageGroupPostActive:false,pageGroupPostDone:0,pageGroupPostSkipped:0,pageGroupPostIndex:0,pageGroupPostStatus:t("pgp.resetStatus")});broadcastToFacebookTabs({action:"resetPageGroupPost"});};

pageWatchStartBtn.onclick=async()=>{
  if(pageWatchRunning){pageWatchStatus.textContent=t("pgw.busy");return;}
  if(!selectedManagedPage){pageWatchStatus.textContent=t("pg.needPage");return;}
  const keyword=pageWatchKeyword.value.trim();if(!keyword){pageWatchStatus.textContent=t("pg.needKeyword");return;}
  if(await pageFeatureBusy()){pageWatchStatus.textContent=t("pg.busyOther");return;}
  const target=Math.max(1,Math.min(100,parseInt(pageWatchTarget.value)||10)),runId=`page-watch-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,cfg={page:selectedManagedPage,keyword,target,minFollowers:Math.max(0,parseInt(pageWatchMinFollowers.value)||0),exclude:pageWatchExclude.value.trim(),runId,followed:0,skipped:0,seenKeys:[]};
  await chrome.storage.sync.set({pageSelected:selectedManagedPage,pageWatchKeyword:keyword,pageWatchTarget:target,pageWatchMinFollowers:cfg.minFollowers,pageWatchExclude:cfg.exclude});
  setPageWatchRunning(true);
  const url=`https://www.facebook.com/search/pages/?q=${encodeURIComponent(keyword)}`;
  const tab=await ensureTaskTab(url,pageWatchStatus,t("pgw.running"),value=>{try{const u=new URL(value);return /\/search\/pages(?:\/|$)/i.test(u.pathname)&&u.searchParams.get("q")===keyword;}catch{return false;}},async owner=>{await chrome.storage.local.set({pageWatchActive:true,pageWatchRunId:runId,pageWatchOwnerTabId:owner.id,pageWatchConfig:{...cfg,ownerTabId:owner.id},pageWatchFollowed:0,pageWatchSkipped:0,pageWatchIndex:0,pageWatchSeenKeys:[],pageWatchStatus:t("pgw.running")});});
  if(!tab){setPageWatchRunning(false);await chrome.storage.local.set({pageWatchActive:false});return;}
  chrome.tabs.sendMessage(tab.id,{action:"startPageWatch",config:cfg,runId,ownerTabId:tab.id},async response=>{if(chrome.runtime.lastError){const retry=await autoReloadAndRetry(tab.id,{action:"startPageWatch",config:cfg,runId,ownerTabId:tab.id},pageWatchStatus);if(retry.ok||await runStillActive("pageWatchActive")){pageWatchStatus.textContent=t("pgw.running");return;}setPageWatchRunning(false);return;}if(response?.ok||await runStillActive("pageWatchActive"))pageWatchStatus.textContent=t("pgw.running");else{setPageWatchRunning(false);pageWatchStatus.textContent=response?.error||t("pgw.busy");}});
};
pageWatchStopBtn.onclick=async()=>{setPageWatchRunning(false);await chrome.storage.local.set({pageWatchActive:false,pageWatchStatus:t("pgw.stopped")});broadcastToFacebookTabs({action:"stopPageWatch"});};
pageWatchResetBtn.onclick=async()=>{setPageWatchRunning(false);await chrome.storage.local.set({pageWatchActive:false,pageWatchFollowed:0,pageWatchSkipped:0,pageWatchIndex:0,pageWatchSeenKeys:[],pageWatchStatus:t("pgw.resetStatus")});broadcastToFacebookTabs({action:"resetPageWatch"});};

pageCommentStartBtn.onclick=async()=>{
  if(pageCommentRunning){pageCommentStatus.textContent=t("pgc.busy");return;}
  if(!selectedManagedPage){pageCommentStatus.textContent=t("pg.needPage");return;}
  const source=pageCommentSource.value||"feed",stored=await chrome.storage.local.get("pageFollowedPages"),pages=Array.isArray(stored.pageFollowedPages)?stored.pageFollowedPages:[];
  if(source==="followed"&&!pages.length){pageCommentStatus.textContent=t("pgw.hint");return;}
  if(await pageFeatureBusy()){pageCommentStatus.textContent=t("pg.busyOther");return;}
  const target=Math.max(1,Math.min(100,parseInt(pageCommentTarget.value)||10)),minDelay=Math.max(5,Math.min(3600,parseInt(pageCommentMinDelay.value)||20)),maxDelay=Math.max(5,Math.min(3600,parseInt(pageCommentMaxDelay.value)||45));
  if(minDelay>maxDelay){pageCommentStatus.textContent=t("pg.badDelay");return;}
  const aiConfig=await getUnifiedAiConfig(),runId=`page-comment-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,cfg={page:selectedManagedPage,source,pages,target,minDelay,maxDelay,prompt:pageCommentPrompt.value.trim(),aiConfig,done:0,pageIndex:0,runId};
  const safeCfg={...cfg,aiConfig:{provider:aiConfig.provider,model:aiConfig.model,url:aiConfig.url}};
  await chrome.storage.sync.set({pageSelected:selectedManagedPage,pageCommentSource:source,pageCommentTarget:target,pageCommentMinDelay:minDelay,pageCommentMaxDelay:maxDelay,pageCommentPrompt:cfg.prompt});
  setPageCommentRunning(true);
  const targetUrl=source==="feed"?"https://www.facebook.com/":pages[0].url;
  const route=value=>source==="feed"?isPopupMainFeedUrl(value):canonicalFacebookUrl(value)?.replace(/\/$/,"")===canonicalFacebookUrl(pages[0].url)?.replace(/\/$/,"");
  const tab=await ensureTaskTab(targetUrl,pageCommentStatus,t("pgc.running"),route,async owner=>{await chrome.storage.local.set({pageCommentActive:true,pageCommentRunId:runId,pageCommentOwnerTabId:owner.id,pageCommentConfig:{...safeCfg,ownerTabId:owner.id},pageCommentDone:0,pageCommentPageIndex:0,pageCommentStatus:t("pgc.running")});});
  if(!tab){setPageCommentRunning(false);await chrome.storage.local.set({pageCommentActive:false});return;}
  chrome.tabs.sendMessage(tab.id,{action:"startPageComment",config:cfg,runId,ownerTabId:tab.id},async response=>{if(chrome.runtime.lastError){const retry=await autoReloadAndRetry(tab.id,{action:"startPageComment",config:cfg,runId,ownerTabId:tab.id},pageCommentStatus);if(retry.ok||await runStillActive("pageCommentActive")){pageCommentStatus.textContent=t("pgc.running");return;}setPageCommentRunning(false);return;}if(response?.ok||await runStillActive("pageCommentActive"))pageCommentStatus.textContent=t("pgc.running");else{setPageCommentRunning(false);pageCommentStatus.textContent=response?.error||t("pgc.busy");}});
};
pageCommentStopBtn.onclick=async()=>{setPageCommentRunning(false);await chrome.storage.local.set({pageCommentActive:false,pageCommentStatus:t("pgc.stopped")});broadcastToFacebookTabs({action:"stopPageComment"});};
pageCommentResetBtn.onclick=async()=>{setPageCommentRunning(false);await chrome.storage.local.set({pageCommentActive:false,pageCommentDone:0,pageCommentStatus:t("pgc.resetStatus")});broadcastToFacebookTabs({action:"resetPageComment"});};

chrome.storage.sync.get(["pageGroupPostLinks","pageGroupPostTarget","pageGroupPostMinDelay","pageGroupPostMaxDelay","pageGroupPostPrompt","pageWatchKeyword","pageWatchTarget","pageWatchMinFollowers","pageWatchExclude","pageCommentSource","pageCommentTarget","pageCommentMinDelay","pageCommentMaxDelay","pageCommentPrompt"],saved=>{
  if(saved.pageGroupPostLinks!==undefined)pageGroupPostLinks.value=saved.pageGroupPostLinks;
  if(saved.pageGroupPostTarget!==undefined)pageGroupPostTarget.value=saved.pageGroupPostTarget;
  if(saved.pageGroupPostMinDelay!==undefined)pageGroupPostMinDelay.value=saved.pageGroupPostMinDelay;
  if(saved.pageGroupPostMaxDelay!==undefined)pageGroupPostMaxDelay.value=saved.pageGroupPostMaxDelay;
  if(saved.pageGroupPostPrompt!==undefined)pageGroupPostPrompt.value=saved.pageGroupPostPrompt;
  if(saved.pageWatchKeyword!==undefined)pageWatchKeyword.value=saved.pageWatchKeyword;
  if(saved.pageWatchTarget!==undefined)pageWatchTarget.value=saved.pageWatchTarget;
  if(saved.pageWatchMinFollowers!==undefined)pageWatchMinFollowers.value=saved.pageWatchMinFollowers;
  if(saved.pageWatchExclude!==undefined)pageWatchExclude.value=saved.pageWatchExclude;
  if(saved.pageCommentSource!==undefined)pageCommentSource.value=saved.pageCommentSource;
  if(saved.pageCommentTarget!==undefined)pageCommentTarget.value=saved.pageCommentTarget;
  if(saved.pageCommentMinDelay!==undefined)pageCommentMinDelay.value=saved.pageCommentMinDelay;
  if(saved.pageCommentMaxDelay!==undefined)pageCommentMaxDelay.value=saved.pageCommentMaxDelay;
  if(saved.pageCommentPrompt!==undefined)pageCommentPrompt.value=saved.pageCommentPrompt;
});
chrome.storage.local.get(["pageGroupPostActive","pageGroupPostStatus","pageGroupPostDone","pageGroupPostSkipped","pageGroupPostConfig","pageWatchActive","pageWatchStatus","pageWatchFollowed","pageWatchSkipped","pageWatchConfig","pageCommentActive","pageCommentStatus","pageCommentDone","pageCommentConfig"],saved=>{
  if(saved.pageGroupPostStatus)pageGroupPostStatus.textContent=saved.pageGroupPostStatus;
  pageGroupPostCount.textContent=`${saved.pageGroupPostDone||0} / ${saved.pageGroupPostConfig?.target||pageGroupPostTarget.value||0}`;
  if(saved.pageWatchStatus)pageWatchStatus.textContent=saved.pageWatchStatus;
  pageWatchCount.textContent=`${saved.pageWatchFollowed||0} / ${saved.pageWatchConfig?.target||pageWatchTarget.value||0} (bỏ qua ${saved.pageWatchSkipped||0})`;
  if(saved.pageCommentStatus)pageCommentStatus.textContent=saved.pageCommentStatus;
  pageCommentCount.textContent=`${saved.pageCommentDone||0} / ${saved.pageCommentConfig?.target||pageCommentTarget.value||0}`;
  if(saved.pageGroupPostActive)setPagePostRunning(true);if(saved.pageWatchActive)setPageWatchRunning(true);if(saved.pageCommentActive)setPageCommentRunning(true);
});
chrome.storage.onChanged.addListener((changes,area)=>{
  if(area!=="local")return;
  if(changes.pageGroupPostStatus)pageGroupPostStatus.textContent=changes.pageGroupPostStatus.newValue||"";
  if(changes.pageGroupPostDone||changes.pageGroupPostSkipped)chrome.storage.local.get(["pageGroupPostDone","pageGroupPostSkipped","pageGroupPostConfig"],r=>{pageGroupPostCount.textContent=`${r.pageGroupPostDone||0} / ${r.pageGroupPostConfig?.target||pageGroupPostTarget.value||0} (bỏ qua ${r.pageGroupPostSkipped||0})`;});
  if(changes.pageWatchStatus)pageWatchStatus.textContent=changes.pageWatchStatus.newValue||"";
  if(changes.pageWatchFollowed||changes.pageWatchSkipped)chrome.storage.local.get(["pageWatchFollowed","pageWatchSkipped","pageWatchConfig"],r=>{pageWatchCount.textContent=`${r.pageWatchFollowed||0} / ${r.pageWatchConfig?.target||pageWatchTarget.value||0} (bỏ qua ${r.pageWatchSkipped||0})`;});
  if(changes.pageCommentStatus)pageCommentStatus.textContent=changes.pageCommentStatus.newValue||"";
  if(changes.pageCommentDone)chrome.storage.local.get(["pageCommentDone","pageCommentConfig"],r=>{pageCommentCount.textContent=`${r.pageCommentDone||0} / ${r.pageCommentConfig?.target||pageCommentTarget.value||0}`;});
  if(changes.pageGroupPostActive)setPagePostRunning(!!changes.pageGroupPostActive.newValue);
  if(changes.pageWatchActive)setPageWatchRunning(!!changes.pageWatchActive.newValue);
  if(changes.pageCommentActive)setPageCommentRunning(!!changes.pageCommentActive.newValue);
});

// GROUP - sub tabs
const subTabSearch = $("subTabSearch");
const subTabDiscover = $("subTabDiscover");
const groupSearchPanel = $("groupSearchPanel");
const groupDiscoverPanel = $("groupDiscoverPanel");
function showGroupSub(which){
  if(which==="discover"){
    subTabDiscover.style.background="#009688"; subTabDiscover.style.color="#fff";
    subTabSearch.style.background="#e4e6eb"; subTabSearch.style.color="#050505";
    groupDiscoverPanel.classList.remove("hidden"); groupSearchPanel.classList.add("hidden");
  } else {
    subTabSearch.style.background="#1877F2"; subTabSearch.style.color="#fff";
    subTabDiscover.style.background="#e4e6eb"; subTabDiscover.style.color="#050505";
    groupSearchPanel.classList.remove("hidden"); groupDiscoverPanel.classList.add("hidden");
  }
  chrome.storage.sync.set({ groupSubTab: which });
}
subTabSearch.onclick = ()=> showGroupSub("search");
subTabDiscover.onclick = ()=> showGroupSub("discover");
chrome.storage.sync.get(["groupSubTab"], res=>{ showGroupSub(res.groupSubTab==="discover"?"discover":"search"); });

// GROUP JOIN - SEARCH
const groupKeyword = $("groupKeyword");
const groupMinMembers = $("groupMinMembers");
const groupMinPosts = $("groupMinPosts");
const groupTarget = $("groupTarget");
const groupMinDelay = $("groupMinDelay");
const groupMaxDelay = $("groupMaxDelay");
const groupAnswers = $("groupAnswers");
const groupAiAnswersEnabled=$("groupAiAnswersEnabled"),groupAiAnswersPrompt=$("groupAiAnswersPrompt");
const groupStartBtn = $("groupStartBtn");
const groupStopBtn = $("groupStopBtn");
const groupResetBtn = $("groupResetBtn");
const groupStatus = $("groupStatus");
const groupCount = $("groupCount");

// Prompt được lưu ngay khi người dùng chỉnh sửa, không đợi bấm nút chạy.
// Dùng debounce nhẹ để không ghi storage cho từng phím ở tốc độ quá nhanh.
function bindPromptPersistence(storageKey,field){
  if(!field)return;
  let timer=0;
  const saveNow=()=>{if(field.readOnly)return Promise.resolve();return chrome.storage.sync.set({[storageKey]:field.value});};
  const save=()=>{
    clearTimeout(timer);
    timer=setTimeout(saveNow,250);
  };
  field.addEventListener("input",save);
  field.addEventListener("change",()=>{clearTimeout(timer);saveNow();});
  field.addEventListener("blur",()=>{clearTimeout(timer);saveNow();});
}
// Mỗi phiên đăng nhóm dùng một snapshot prompt đã lưu trong storage.local.
// Giữ ô prompt ở chế độ chỉ đọc trong lúc chạy để người dùng không tưởng
// prompt mới đang áp dụng cho phiên hiện tại hoặc làm lệch cấu hình khi popup
// đóng/mở giữa các lần điều hướng. Dừng/hoàn tất sẽ mở khóa để chuẩn bị lượt sau.
function setPromptEditorState(locked,fields,hintId){
  (Array.isArray(fields)?fields:[fields]).filter(Boolean).forEach(field=>{
    field.readOnly=!!locked;
    field.classList.toggle("prompt-locked",!!locked);
    field.setAttribute("aria-readonly",locked?"true":"false");
    field.title=locked?t("prompt.lockedTitle"):"";
  });
  const hint=hintId&&$(hintId);
  if(hint)hint.classList.toggle("hidden",!locked);
}
bindPromptPersistence("groupAiAnswersPrompt",groupAiAnswersPrompt);

// GROUP DISCOVER
const discoverTarget = $("discoverTarget");
const discoverMinDelay = $("discoverMinDelay");
const discoverMaxDelay = $("discoverMaxDelay");
const discoverAnswers = $("discoverAnswers");
const discoverStartBtn = $("discoverStartBtn");
const discoverStopBtn = $("discoverStopBtn");
const discoverResetBtn = $("discoverResetBtn");
const discoverStatus = $("discoverStatus");
const discoverCount = $("discoverCount");
let isGroupJoining=false;
function setGroupRunning(v){
  isGroupJoining=v;
  groupStartBtn.textContent = v ? t("p.busyJoin") : t("p.gjIdle");
  groupStartBtn.classList.toggle("running", v);
}
groupStartBtn.onclick = async ()=>{
  const shareRun=await chrome.storage.local.get(["groupShareActive","salesPostActive","trendLearnActive","trendPostActive","pageGroupJoinActive","pageGroupPostActive","pageWatchActive","pageCommentActive"]);if(Object.values(shareRun).some(Boolean)){groupStatus.textContent=(shareRun.pageGroupJoinActive||shareRun.pageGroupPostActive||shareRun.pageWatchActive||shareRun.pageCommentActive)?t("pg.busyOther"):t("p.shBusyJoin");return;}
  const crossRun=await chrome.storage.local.get(["isDiscoverJoining"]);
  if(crossRun.isDiscoverJoining){groupStatus.textContent=t("p.gjDiscoverBusy");return;}
  const keyword = groupKeyword.value.trim();
  if(!keyword){ groupStatus.textContent=t("p.gjNeedKeyword"); return; }
  // Phiên cũ khác từ khóa vẫn chạy thì không đè cấu hình — nếu không tab
  // reload giữa chừng sẽ resume nhầm sang từ khóa mới.
  const runningState=await chrome.storage.local.get(["isGroupJoining","groupJoinRunConfig"]);
  if(runningState.isGroupJoining&&runningState.groupJoinRunConfig&&runningState.groupJoinRunConfig.keyword&&runningState.groupJoinRunConfig.keyword!==keyword){
    groupStatus.textContent=t("p.gjDiffKeywordKw",{kw:runningState.groupJoinRunConfig.keyword});
    setGroupRunning(true);return;
  }
  const answersText = groupAnswers.value.trim();
  const aiSaved=await getUnifiedAiConfig();
  const cfg = {
    keyword,
    minMembers: parseInt(groupMinMembers.value)||0,
    minPostsPerDay: parseInt(groupMinPosts.value)||0,
    targetJoin: parseInt(groupTarget.value)||10,
    minDelay: parseInt(groupMinDelay.value)||5,
    maxDelay: parseInt(groupMaxDelay.value)||15,
    answersText,aiJoinEnabled:groupAiAnswersEnabled.checked,aiJoinPrompt:groupAiAnswersPrompt.value.trim(),aiConfig:aiSaved
  };
  if(cfg.minDelay > cfg.maxDelay){ groupStatus.textContent=t("p.gjBadDelay2"); return; }
  chrome.storage.sync.set({ groupKeyword:keyword, groupMinMembers:cfg.minMembers, groupMinPosts:cfg.minPostsPerDay, groupTarget:cfg.targetJoin, groupMinDelay:cfg.minDelay, groupMaxDelay:cfg.maxDelay, groupAnswers: answersText,groupAiAnswersEnabled:cfg.aiJoinEnabled,groupAiAnswersPrompt:cfg.aiJoinPrompt });
  // Lưu phiên trước điều hướng để tab tự resume đúng từ khóa sau mọi reload.
  setGroupRunning(true);
  const searchUrl="https://www.facebook.com/search/groups/?q="+encodeURIComponent(keyword);
  let tab = await ensureTaskTab(
    searchUrl,
    groupStatus,
    t("p.gjOpening"),
    url=>{
      // Tab đang ở từ khóa CŨ vẫn là sai route — phải so cả query q.
      try{
        const u=new URL(url);
        if(!u.pathname.startsWith("/search/groups"))return false;
        return u.searchParams.get("q")===keyword;
      }catch{return url.includes("/search/groups/?q="+encodeURIComponent(keyword));}
    },
    async owner=>{
      await chrome.storage.local.set({isGroupJoining:true,groupJoined:0,groupFound:0,groupJoinRunConfig:{...cfg,ownerTabId:owner.id},groupStatus:t("p.gjOpeningKw",{kw:keyword})});
    }
  );if(!tab){setGroupRunning(false);await chrome.storage.local.set({isGroupJoining:false});await chrome.storage.local.remove(["groupJoinRunConfig"]);return;}
  chrome.tabs.sendMessage(tab.id, { action:"startGroupJoin", ...cfg,ownerTabId:tab.id }, async res=>{
    if(chrome.runtime.lastError){
      const retry = await autoReloadAndRetry(tab.id, { action:"startGroupJoin", ...cfg,ownerTabId:tab.id }, groupStatus);
      // Gửi không tới cũng không sao: phiên đã lưu, tab tự tiếp tục.
      groupStatus.textContent=retry.ok?t("p.gjRunning",{kw:keyword}):t("p.gjSaved",{kw:keyword});
      return;
    }
    if(res && res.ok){ setGroupRunning(true); groupStatus.textContent=t("p.gjRunning",{kw:keyword});}
    else if(res && (res.code==="join-busy"||(res.msg && /luồng tham gia nhóm khác/.test(res.msg)))){ setGroupRunning(true); groupStatus.textContent=t("p.gjRunning",{kw:keyword}); }
    else{setGroupRunning(false);await chrome.storage.local.set({isGroupJoining:false});await chrome.storage.local.remove(["groupJoinRunConfig"]);groupStatus.textContent=res?.msg||t("p.gjStartFail");}
  });
};
groupStopBtn.onclick = async ()=>{
  setGroupRunning(false);
  await chrome.storage.local.set({isGroupJoining:false,groupStatus:t("p.stoppedX")});
  await chrome.storage.local.remove(["groupJoinRunConfig","pendingSearchJoin","pendingSearchKeyword","pendingSearchConfig"]);
  broadcastToFacebookTabs({action:"stopGroupJoin"});
  const tab=await getActiveTab();
  if(tab) chrome.tabs.sendMessage(tab.id, {action:"stopGroupJoin"}, ()=>setGroupRunning(false));
};
groupResetBtn.onclick = async ()=>{
  await chrome.storage.local.set({groupJoined:0,groupFound:0,isGroupJoining:false,groupStatus:t("p.resetDone")});
  await chrome.storage.local.remove(["groupJoinRunConfig","pendingSearchJoin","pendingSearchKeyword","pendingSearchConfig"]);
  broadcastToFacebookTabs({action:"resetGroupJoin"});
  const tab=await getActiveTab();
  if(tab) chrome.tabs.sendMessage(tab.id, {action:"resetGroupJoin"}, ()=>{
    groupCount.textContent="0 / "+(parseInt(groupTarget.value)||10);
    groupStatus.textContent=t("p.resetDone");
    setGroupRunning(false);
  });
};
// load group config
chrome.storage.sync.get(["groupKeyword","groupMinMembers","groupMinPosts","groupTarget","groupMinDelay","groupMaxDelay","groupAnswers","groupAiAnswersEnabled","groupAiAnswersPrompt"], res=>{
  if(res.groupKeyword) groupKeyword.value=res.groupKeyword;
  if(res.groupMinMembers!==undefined) groupMinMembers.value=res.groupMinMembers;
  if(res.groupMinPosts!==undefined) groupMinPosts.value=res.groupMinPosts;
  if(res.groupTarget) groupTarget.value=res.groupTarget;
  if(res.groupMinDelay) groupMinDelay.value=res.groupMinDelay;
  if(res.groupMaxDelay) groupMaxDelay.value=res.groupMaxDelay;
  if(res.groupAnswers) groupAnswers.value=res.groupAnswers;
  if(res.groupAiAnswersEnabled!==undefined)groupAiAnswersEnabled.checked=res.groupAiAnswersEnabled;
  if(res.groupAiAnswersPrompt!==undefined)groupAiAnswersPrompt.value=res.groupAiAnswersPrompt;
  groupCount.textContent = `0 / ${parseInt(groupTarget.value)||10}`;
});
chrome.storage.local.get(["groupStatus","groupJoined","groupFound","isGroupJoining"], res=>{
  if(res.groupStatus) groupStatus.textContent=res.groupStatus;
  if(res.groupJoined!==undefined) groupCount.textContent=`${res.groupJoined} / ${parseInt(groupTarget.value)||10}`;
  if(res.isGroupJoining) setGroupRunning(true);
});
groupTarget.addEventListener("change", ()=>{ groupCount.textContent=`${0} / ${parseInt(groupTarget.value)||10}`; });

// DISCOVER JOIN handlers
let isDiscoverJoining=false;
function setDiscoverRunning(v){
  isDiscoverJoining=v;
  discoverStartBtn.textContent = v ? t("p.busyJoin") : t("gd.start");
  discoverStartBtn.classList.toggle("running", v);
}
discoverStartBtn.onclick = async ()=>{
  const shareRun=await chrome.storage.local.get(["groupShareActive","salesPostActive","trendLearnActive","trendPostActive","pageGroupJoinActive","pageGroupPostActive","pageWatchActive","pageCommentActive"]);if(Object.values(shareRun).some(Boolean)){discoverStatus.textContent=(shareRun.pageGroupJoinActive||shareRun.pageGroupPostActive||shareRun.pageWatchActive||shareRun.pageCommentActive)?t("pg.busyOther"):t("p.shBusyJoin");return;}
  const keywordRun=await chrome.storage.local.get(["isGroupJoining","groupJoinRunConfig"]);
  if(keywordRun.isGroupJoining){discoverStatus.textContent=keywordRun.groupJoinRunConfig?.keyword?t("p.gdKeywordBusyKw",{kw:keywordRun.groupJoinRunConfig.keyword}):t("p.gdKeywordBusy");return;}
  const aiSaved=await getUnifiedAiConfig();
  const cfg = {
    target: parseInt(discoverTarget.value)||10,
    minDelay: parseInt(discoverMinDelay.value)||5,
    maxDelay: parseInt(discoverMaxDelay.value)||15,
    answersText: discoverAnswers.value.trim(),aiJoinEnabled:groupAiAnswersEnabled.checked,aiJoinPrompt:groupAiAnswersPrompt.value.trim(),aiConfig:aiSaved
  };
  if(cfg.minDelay > cfg.maxDelay){ discoverStatus.textContent=t("p.delayBad"); return; }
  chrome.storage.sync.set({ discoverTarget:cfg.target, discoverMinDelay:cfg.minDelay, discoverMaxDelay:cfg.maxDelay, discoverAnswers: cfg.answersText });
  setDiscoverRunning(true);
  const discoverRunConfig={target:cfg.target,minDelay:cfg.minDelay,maxDelay:cfg.maxDelay,answersText:cfg.answersText,aiJoinEnabled:cfg.aiJoinEnabled,aiJoinPrompt:cfg.aiJoinPrompt,aiConfig:cfg.aiConfig};
  let tab = await ensureTaskTab(
    "https://www.facebook.com/groups/discover",
    discoverStatus,
    t("p.gdOpening"),
    url=>/\/groups\/discover(\/|\?|$)/.test(url),
    async owner=>{
      await chrome.storage.local.set({isDiscoverJoining:true,discoverJoined:0,discoverRunConfig:{...discoverRunConfig,ownerTabId:owner.id},discoverStatus:t("p.gdRunning",{n:cfg.target})});
    }
  );if(!tab){setDiscoverRunning(false);await chrome.storage.local.set({isDiscoverJoining:false});await chrome.storage.local.remove(["discoverRunConfig","pendingDiscoverJoin","pendingDiscoverConfig"]);return;}
  chrome.tabs.sendMessage(tab.id, { action:"startDiscoverJoin", ...cfg,ownerTabId:tab.id }, async res=>{
    if(chrome.runtime.lastError){
      const retry = await autoReloadAndRetry(tab.id, { action:"startDiscoverJoin", ...cfg,ownerTabId:tab.id }, discoverStatus);
      if(retry.ok){ setDiscoverRunning(true); discoverStatus.textContent=t("p.gdRunning",{n:cfg.target}); }
      else if(await runStillActive("isDiscoverJoining")){ setDiscoverRunning(true); discoverStatus.textContent=t("p.gdRunning",{n:cfg.target}); }
      else{await chrome.storage.local.remove(["discoverRunConfig","pendingDiscoverJoin","pendingDiscoverConfig"]);setDiscoverRunning(false);}
      return;
    }
    if(res && res.ok){ setDiscoverRunning(true); discoverStatus.textContent=t("p.gdRunning",{n:cfg.target}); }
    else if(res && res.code==="join-busy"){await chrome.storage.local.set({isDiscoverJoining:false});await chrome.storage.local.remove(["discoverRunConfig","pendingDiscoverJoin","pendingDiscoverConfig"]);setDiscoverRunning(false);discoverStatus.textContent=res?.msg||t("p.gdStartFail");}
    else if(await runStillActive("isDiscoverJoining")){ setDiscoverRunning(true); discoverStatus.textContent=t("p.gdRunning",{n:cfg.target}); }
    else{setDiscoverRunning(false);discoverStatus.textContent=res?.msg||t("p.gdStartFail");}
  });
};
discoverStopBtn.onclick = async ()=>{
  setDiscoverRunning(false);
  await chrome.storage.local.set({isDiscoverJoining:false,discoverStatus:t("p.stoppedX")});
  await chrome.storage.local.remove(["discoverRunConfig","pendingDiscoverJoin","pendingDiscoverConfig"]);
  broadcastToFacebookTabs({action:"stopDiscoverJoin"});
  const tab=await getActiveTab();
  if(tab) chrome.tabs.sendMessage(tab.id, {action:"stopDiscoverJoin"}, ()=>setDiscoverRunning(false));
};
discoverResetBtn.onclick = async ()=>{
  await chrome.storage.local.set({discoverJoined:0,isDiscoverJoining:false,discoverStatus:t("p.resetDone")});
  await chrome.storage.local.remove(["discoverRunConfig","pendingDiscoverJoin","pendingDiscoverConfig"]);
  broadcastToFacebookTabs({action:"resetDiscoverJoin"});
  const tab=await getActiveTab();
  if(tab) chrome.tabs.sendMessage(tab.id, {action:"resetDiscoverJoin"}, ()=>{
    discoverCount.textContent="0 / "+(parseInt(discoverTarget.value)||10);
    discoverStatus.textContent=t("p.resetDone");
    setDiscoverRunning(false);
  });
};
chrome.storage.sync.get(["discoverTarget","discoverMinDelay","discoverMaxDelay","discoverAnswers"], res=>{
  if(res.discoverTarget) discoverTarget.value=res.discoverTarget;
  if(res.discoverMinDelay) discoverMinDelay.value=res.discoverMinDelay;
  if(res.discoverMaxDelay) discoverMaxDelay.value=res.discoverMaxDelay;
  if(res.discoverAnswers) discoverAnswers.value=res.discoverAnswers;
  discoverCount.textContent=`0 / ${parseInt(discoverTarget.value)||10}`;
});
chrome.storage.local.get(["discoverStatus","discoverJoined","isDiscoverJoining"], res=>{
  if(res.discoverStatus) discoverStatus.textContent=res.discoverStatus;
  if(res.discoverJoined!==undefined) discoverCount.textContent=`${res.discoverJoined} / ${parseInt(discoverTarget.value)||10}`;
  if(res.isDiscoverJoining) setDiscoverRunning(true);
});
chrome.storage.onChanged.addListener(changes=>{
  if(changes.discoverStatus) discoverStatus.textContent=changes.discoverStatus.newValue;
  if(changes.discoverJoined!==undefined) discoverCount.textContent=`${changes.discoverJoined.newValue} / ${parseInt(discoverTarget.value)||10}`;
  if(changes.isDiscoverJoining!==undefined) setDiscoverRunning(changes.isDiscoverJoining.newValue);
});
discoverTarget.addEventListener("change", ()=>{ discoverCount.textContent=`${0} / ${parseInt(discoverTarget.value)||10}`; });

// FEED & AI
const feedReaction = $("feedReaction");
const feedTarget = $("feedTarget");
const feedMinDelay = $("feedMinDelay");
const feedMaxDelay = $("feedMaxDelay");
const feedStartBtn = $("feedStartBtn");
const feedStopBtn = $("feedStopBtn");
const feedResetBtn = $("feedResetBtn");
const feedStatus = $("feedStatus");
const feedCountEl = $("feedCount");
let isFeedInteracting=false;
function setFeedRunning(v){ isFeedInteracting=v; feedStartBtn.textContent=v?t("p.fdBusy"):t("fd.start"); feedStartBtn.classList.toggle("running",v); }
feedStartBtn.onclick = async ()=>{
  const shareRun=await chrome.storage.local.get(["groupShareActive","salesPostActive","trendLearnActive","trendPostActive","pageGroupJoinActive","pageGroupPostActive","pageWatchActive","pageCommentActive"]);if(Object.values(shareRun).some(Boolean)){feedStatus.textContent=(shareRun.pageGroupJoinActive||shareRun.pageGroupPostActive||shareRun.pageWatchActive||shareRun.pageCommentActive)?t("pg.busyOther"):t("p.shBusyFeed");return;}
  const cfg={ reaction: feedReaction.value, target: parseInt(feedTarget.value)||20, minDelay: parseInt(feedMinDelay.value)||3, maxDelay: parseInt(feedMaxDelay.value)||8 };
  if(cfg.minDelay>cfg.maxDelay){ feedStatus.textContent=t("p.delayBad"); return; }
  chrome.storage.sync.set({ feedReaction:cfg.reaction, feedTarget:cfg.target, feedMinDelay:cfg.minDelay, feedMaxDelay:cfg.maxDelay });
  setFeedRunning(true);
  let tab=await ensureTaskTab(
    "https://www.facebook.com/",
    feedStatus,
    t("p.fdOpening"),
    isPopupMainFeedUrl,
    async owner=>{
      await chrome.storage.local.set({isFeedInteracting:true,pendingFeedInteract:true,pendingFeedConfig:{target:cfg.target,minDelay:cfg.minDelay,maxDelay:cfg.maxDelay,reaction:cfg.reaction,ownerTabId:owner.id},feedStatus:t("p.fdOpening")});
    }
  );if(!tab){setFeedRunning(false);await chrome.storage.local.set({isFeedInteracting:false});await chrome.storage.local.remove(["pendingFeedInteract","pendingFeedConfig"]);return;}
  chrome.tabs.sendMessage(tab.id, {action:"startFeedInteract", ...cfg,ownerTabId:tab.id}, async res=>{
    if(chrome.runtime.lastError){
      const retry = await autoReloadAndRetry(tab.id, {action:"startFeedInteract", ...cfg,ownerTabId:tab.id}, feedStatus);
      if(retry.ok){ setFeedRunning(true); feedStatus.textContent=t("p.fdRunning",{reaction:cfg.reaction,n:cfg.target}); }
      else if(await runStillActive("isFeedInteracting")||await runStillActive("pendingFeedInteract")){ setFeedRunning(true); feedStatus.textContent=t("p.fdRunning",{reaction:cfg.reaction,n:cfg.target}); }
      else{await chrome.storage.local.remove(["pendingFeedInteract","pendingFeedConfig"]);setFeedRunning(false);}
      return;
    }
    if(res&&res.ok){ setFeedRunning(true); feedStatus.textContent=t("p.fdRunning",{reaction:cfg.reaction,n:cfg.target}); }
    else if(await runStillActive("isFeedInteracting")){ setFeedRunning(true); feedStatus.textContent=t("p.fdRunning",{reaction:cfg.reaction,n:cfg.target}); }
    else{await chrome.storage.local.remove(["pendingFeedInteract","pendingFeedConfig"]);setFeedRunning(false);feedStatus.textContent=res?.error||t("p.fdStartFail");}
  });
};
feedStopBtn.onclick = async ()=>{ setFeedRunning(false); await chrome.storage.local.set({isFeedInteracting:false,feedStatus:t("p.stoppedX")}); await chrome.storage.local.remove(["pendingFeedInteract","pendingFeedConfig"]); const tab=await getActiveTab(); if(tab)chrome.tabs.sendMessage(tab.id,{action:"stopFeedInteract"},()=>{}); broadcastToFacebookTabs({action:"stopFeedInteract"}); };
feedResetBtn.onclick = async ()=>{ setFeedRunning(false); await chrome.storage.local.set({feedCount:0,feedStatus:t("p.resetDone"),isFeedInteracting:false}); await chrome.storage.local.remove(["pendingFeedInteract","pendingFeedConfig"]); feedCountEl.textContent="0 / "+(parseInt(feedTarget.value)||20); const tab=await getActiveTab(); if(tab)chrome.tabs.sendMessage(tab.id,{action:"resetFeedInteract"},()=>{}); broadcastToFacebookTabs({action:"resetFeedInteract"}); };
const feedScanBtn = $("feedScanBtn");
feedScanBtn.onclick = async ()=>{
  const tab=await getActiveTab();
  if(!tab || !tab.url.includes("facebook.com")){ feedStatus.textContent=t("p.fdNeedFb"); return; }
  chrome.tabs.sendMessage(tab.id, {action:"scanFeedLikes"}, res=>{
    if(chrome.runtime.lastError){ feedStatus.textContent=t("p.reloadRetry"); return; }
    feedStatus.textContent=t("p.fdScanOk",{n:res.count});
    feedCountEl.textContent=t("p.fdScanCount",{n:res.count});
  });
};
chrome.storage.sync.get(["feedReaction","feedTarget","feedMinDelay","feedMaxDelay"], res=>{
  if(res.feedReaction) feedReaction.value=res.feedReaction;
  if(res.feedTarget) feedTarget.value=res.feedTarget;
  if(res.feedMinDelay) feedMinDelay.value=res.feedMinDelay;
  if(res.feedMaxDelay) feedMaxDelay.value=res.feedMaxDelay;
  feedCountEl.textContent=`0 / ${parseInt(feedTarget.value)||20}`;
});
chrome.storage.local.get(["feedStatus","feedCount","isFeedInteracting"], res=>{
  if(res.feedStatus) feedStatus.textContent=res.feedStatus;
  if(res.feedCount!==undefined) feedCountEl.textContent=`${res.feedCount} / ${parseInt(feedTarget.value)||20}`;
  if(res.isFeedInteracting) setFeedRunning(true);
});
chrome.storage.onChanged.addListener(changes=>{
  if(changes.feedStatus) feedStatus.textContent=changes.feedStatus.newValue;
  if(changes.feedCount!==undefined) feedCountEl.textContent=`${changes.feedCount.newValue} / ${parseInt(feedTarget.value)||20}`;
  if(changes.isFeedInteracting!==undefined) setFeedRunning(changes.isFeedInteracting.newValue);
});
feedTarget.addEventListener("change", ()=>{ feedCountEl.textContent=`${0} / ${parseInt(feedTarget.value)||20}`; });

// TUONG TAC NHOM DA THAM GIA
const joinedGroupList=$("joinedGroupList"), loadJoinedGroupsBtn=$("loadJoinedGroupsBtn"), selectAllGroupsBtn=$("selectAllGroupsBtn");
const groupInteractKeyword=$("groupInteractKeyword"),selectKeywordGroupsBtn=$("selectKeywordGroupsBtn");
const groupInteractReaction=$("groupInteractReaction"), groupInteractTarget=$("groupInteractTarget");
const groupInteractGroupLimit=$("groupInteractGroupLimit"), groupInteractAiComment=$("groupInteractAiComment");
const groupInteractMinDelay=$("groupInteractMinDelay"), groupInteractMaxDelay=$("groupInteractMaxDelay");
const groupInteractStartBtn=$("groupInteractStartBtn"), groupInteractStopBtn=$("groupInteractStopBtn");
const groupInteractStatus=$("groupInteractStatus"), groupInteractCount=$("groupInteractCount");
let isGroupInteractRunning=false;
function setGroupInteractRunning(v){isGroupInteractRunning=v;groupInteractStartBtn.textContent=v?t("p.giBusy"):t("gi.start");groupInteractStartBtn.classList.toggle("running",v);}
let joinedGroups=[];
function renderJoinedGroups(groups,selectedIds=[]){
  joinedGroups=groups||[];
  if(!joinedGroups.length){ joinedGroupList.innerHTML='<div class="hint" style="padding:6px">'+t("p.giNotFound")+'</div>'; return; }
  const selected=new Set(selectedIds);
  const escapeHtml=value=>String(value||"").replace(/[<>&"]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[c]));
  joinedGroupList.innerHTML=joinedGroups.map(g=>{
    const name=String(g?.name||""),id=String(g?.id||""),icon=String(g?.icon||"icon128.png");
    return `<label data-group-name="${escapeHtml(name.toLowerCase())}" style="display:flex;align-items:center;gap:7px;padding:5px;margin:0;border-bottom:1px solid #eee;cursor:pointer"><input class="joined-group-check" type="checkbox" value="${escapeHtml(id)}" ${selected.has(id)?"checked":""} style="width:auto"><img src="${escapeHtml(icon)}" style="width:30px;height:30px;border-radius:50%;object-fit:cover"><span style="font-size:12px;line-height:1.2">${escapeHtml(name)}</span></label>`;
  }).join("");
}
loadJoinedGroupsBtn.onclick=async()=>{
  groupInteractStatus.textContent=t("p.giLoadGroups");
  let tab=await getActiveTab();
  if(!tab) return;
  if(!/facebook\.com\/groups\/(feed|joins)/.test(tab.url||"")){
    await chrome.tabs.update(tab.id,{url:"https://www.facebook.com/groups/joins/?nav_source=tab"});
    await new Promise(r=>setTimeout(r,5000));
  }
  const retry=await autoReloadAndRetry(tab.id,{action:"scanJoinedGroups"},groupInteractStatus);
  if(retry.ok){
    const groups=retry.res?.groups||[];
    renderJoinedGroups(groups,groups.map(g=>g.id));
    chrome.storage.local.set({joinedGroups:groups});
    groupInteractStatus.textContent=t("p.giLoadedGroups",{n:groups.length});
  }
};
selectAllGroupsBtn.onclick=()=>{
  const boxes=[...joinedGroupList.querySelectorAll('.joined-group-check')];
  const shouldCheck=boxes.some(b=>!b.checked); boxes.forEach(b=>b.checked=shouldCheck);
  selectAllGroupsBtn.textContent=shouldCheck?t("p.selNone"):t("c.selectAll");
};
selectKeywordGroupsBtn.onclick=()=>{
  const keys=groupInteractKeyword.value.toLowerCase().split(",").map(s=>s.trim()).filter(Boolean);
  if(!keys.length){groupInteractStatus.textContent=t("p.giNeedKeyword");return;}
  let matched=0;
  joinedGroupList.querySelectorAll('label[data-group-name]').forEach(row=>{
    const ok=keys.some(k=>row.dataset.groupName.includes(k));
    row.style.display=ok?"flex":"none";
    const box=row.querySelector('.joined-group-check'); box.checked=ok;
    if(ok)matched++;
  });
  groupInteractStatus.textContent=t("p.giMatched",{n:matched,keys:keys.join(", ")});
};
groupInteractKeyword.addEventListener("input",()=>{if(!groupInteractKeyword.value.trim())joinedGroupList.querySelectorAll('label[data-group-name]').forEach(row=>row.style.display="flex");});
groupInteractStartBtn.onclick=async()=>{
  const shareRun=await chrome.storage.local.get(["groupShareActive","salesPostActive","trendLearnActive","trendPostActive","pageGroupJoinActive","pageGroupPostActive","pageWatchActive","pageCommentActive"]);if(Object.values(shareRun).some(Boolean)){groupInteractStatus.textContent=(shareRun.pageGroupJoinActive||shareRun.pageGroupPostActive||shareRun.pageWatchActive||shareRun.pageCommentActive)?t("pg.busyOther"):t("p.shBusyInteract");return;}
  const ids=[...joinedGroupList.querySelectorAll('.joined-group-check:checked')].map(b=>b.value);
  const selectedGroups=joinedGroups.filter(g=>ids.includes(g.id));
  const requestedGroups=Math.max(1,parseInt(groupInteractGroupLimit.value)||1);
  const groups=selectedGroups.slice(0,Math.min(requestedGroups,selectedGroups.length));
  const runId=`group-interact-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const cfg={groups,perGroup:parseInt(groupInteractTarget.value)||5,minDelay:parseInt(groupInteractMinDelay.value)||5,maxDelay:parseInt(groupInteractMaxDelay.value)||12,reaction:groupInteractReaction.value,targetGroups:requestedGroups,aiComment:!!groupInteractAiComment.checked,runId};
  if(!selectedGroups.length){groupInteractStatus.textContent=t("p.giNeedGroups");return;}
  if(requestedGroups>selectedGroups.length){groupInteractStatus.textContent=t("p.giOnlyReal",{n:selectedGroups.length});}
  if(cfg.minDelay>cfg.maxDelay){groupInteractStatus.textContent=t("p.gjBadDelay");return;}
  groupInteractGroupLimit.value=requestedGroups;
  chrome.storage.sync.set({groupInteractTargetGroups:requestedGroups,groupInteractAiComment:cfg.aiComment,groupInteractPerGroup:cfg.perGroup,groupInteractMinDelay:cfg.minDelay,groupInteractMaxDelay:cfg.maxDelay,groupInteractReaction:cfg.reaction});
  setGroupInteractRunning(true);
  const tab=await ensureTaskTab(
    groups[0].url,
    groupInteractStatus,
    t("p.openFirstGroup",{name:groups[0].name}),
    url=>url.includes("facebook.com/groups/"),
    async owner=>{
      await chrome.storage.local.set({groupInteractActive:true,groupInteractRunId:runId,groupInteractConfig:{...cfg,ownerTabId:owner.id},groupInteractIndex:0,groupInteractDone:0,groupInteractAiDone:0,groupInteractTotal:groups.length*cfg.perGroup,groupInteractCurrentGroupIndex:0,groupInteractCurrentGroupDone:0,groupInteractCurrentGroupAiDone:0,groupInteractReactedKeys:{},groupInteractReactionGuard:{},groupInteractCommentGuard:{},groupInteractStatus:t("gi2.starting")});
    }
  );if(!tab){setGroupInteractRunning(false);await chrome.storage.local.set({groupInteractActive:false});return;}
  chrome.tabs.sendMessage(tab.id,{action:"startGroupInteract",...cfg,ownerTabId:tab.id},async res=>{
    if(chrome.runtime.lastError){
      const retry=await autoReloadAndRetry(tab.id,{action:"startGroupInteract",...cfg,ownerTabId:tab.id},groupInteractStatus);
      if(retry.ok&&retry.res?.ok){groupInteractStatus.textContent=t("p.giRunningCount",{n:groups.length});return;}
      if(await runStillActive("groupInteractActive")){groupInteractStatus.textContent=t("p.giRunningCount",{n:groups.length});return;}
      setGroupInteractRunning(false);return;
    }
    if(res&&res.ok){groupInteractStatus.textContent=t("p.giRunningCount",{n:groups.length});return;}
    if(await runStillActive("groupInteractActive")){groupInteractStatus.textContent=t("p.giRunningCount",{n:groups.length});return;}
    await chrome.storage.local.set({groupInteractActive:false});
    setGroupInteractRunning(false);groupInteractStatus.textContent=res?.error||t("p.giStartFail");return;
  });
};
groupInteractStopBtn.onclick=async()=>{setGroupInteractRunning(false);await chrome.storage.local.set({groupInteractActive:false,groupInteractStatus:t("p.stopped")});broadcastToFacebookTabs({action:"stopGroupInteract"});const tab=await getActiveTab();if(tab)chrome.tabs.sendMessage(tab.id,{action:"stopGroupInteract"});};
chrome.storage.local.get(["joinedGroups","groupInteractStatus","groupInteractDone","groupInteractTotal","groupInteractActive"],r=>{if(r.joinedGroups)renderJoinedGroups(r.joinedGroups);if(r.groupInteractStatus)groupInteractStatus.textContent=r.groupInteractStatus;if(r.groupInteractDone!==undefined)groupInteractCount.textContent=`${r.groupInteractDone} / ${r.groupInteractTotal||0}`;if(r.groupInteractActive)setGroupInteractRunning(true);});
chrome.storage.sync.get(["groupInteractTargetGroups","groupInteractAiComment","groupInteractPerGroup","groupInteractMinDelay","groupInteractMaxDelay","groupInteractReaction"],r=>{if(r.groupInteractTargetGroups)groupInteractGroupLimit.value=r.groupInteractTargetGroups;if(typeof r.groupInteractAiComment==="boolean")groupInteractAiComment.checked=r.groupInteractAiComment;if(r.groupInteractPerGroup)groupInteractTarget.value=r.groupInteractPerGroup;if(r.groupInteractMinDelay)groupInteractMinDelay.value=r.groupInteractMinDelay;if(r.groupInteractMaxDelay)groupInteractMaxDelay.value=r.groupInteractMaxDelay;if(r.groupInteractReaction)groupInteractReaction.value=r.groupInteractReaction;});
[groupInteractGroupLimit,groupInteractAiComment].forEach(el=>el.addEventListener("change",()=>{
  const target=Math.max(1,parseInt(groupInteractGroupLimit.value)||1);
  groupInteractGroupLimit.value=target;
  chrome.storage.sync.set({groupInteractTargetGroups:target,groupInteractAiComment:!!groupInteractAiComment.checked});
}));
chrome.storage.onChanged.addListener(c=>{if(c.groupInteractStatus)groupInteractStatus.textContent=c.groupInteractStatus.newValue;if(c.groupInteractActive!==undefined)setGroupInteractRunning(c.groupInteractActive.newValue);if(c.groupInteractDone||c.groupInteractTotal)chrome.storage.local.get(["groupInteractDone","groupInteractTotal"],r=>groupInteractCount.textContent=`${r.groupInteractDone||0} / ${r.groupInteractTotal||0}`);});

// DANG BAI AI LEN NHOM
const groupPostList=$("groupPostList"),loadPostGroupsBtn=$("loadPostGroupsBtn"),selectAllPostGroupsBtn=$("selectAllPostGroupsBtn");
const groupPostKeyword=$("groupPostKeyword"),groupPostPrompt=$("groupPostPrompt");
const groupPostStartBtn=$("groupPostStartBtn"),groupPostStopBtn=$("groupPostStopBtn"),groupPostResetBtn=$("groupPostResetBtn"),groupPostStatus=$("groupPostStatus"),groupPostCount=$("groupPostCount");
const groupPostTargetGroups=$("groupPostTargetGroups"),groupPostInterDelay=$("groupPostInterDelay");
const groupPostAiProvider=$("groupPostAiProvider"),groupPostAiKey=$("groupPostAiKey"),groupPostAiModel=$("groupPostAiModel"),groupPostAiCustomModel=$("groupPostAiCustomModel"),groupPostAiUrl=$("groupPostAiUrl"),groupPostAiTestBtn=$("groupPostAiTestBtn");
const groupPostBackgroundEnabled=$("groupPostBackgroundEnabled"),groupPostBackgroundOptions=$("groupPostBackgroundOptions"),groupPostBackgroundMode=$("groupPostBackgroundMode"),groupPostFixedColorWrap=$("groupPostFixedColorWrap"),groupPostFixedColor=$("groupPostFixedColor"),groupPostMaxChars=$("groupPostMaxChars");
const groupPostPreviewBtn=$("groupPostPreviewBtn"),groupPostPreview=$("groupPostPreview");
let isGroupPostRunning=false;
function setGroupPostRunning(v){isGroupPostRunning=v;groupPostStartBtn.textContent=v?t("p.gpBusy"):t("gp.start");groupPostStartBtn.classList.toggle("running",v);setPromptEditorState(v,groupPostPrompt,"groupPostPromptLockHint");}
const GROUP_POST_PREVIEW_COLORS={pink:"#e91e63",green:"#2e7d32",red:"#d32f2f",orange:"#ef6c00",yellow:"#f9a825",blue:"#1976d2",purple:"#7b1fa2",burgundy:"#8e244d",beige:"#b9a07e",brown:"#6d4c41",gray:"#78909c",black:"#263238"};
const GROUP_POST_AUTO_TIMING=Object.freeze({minDelay:25,maxDelay:45});
let postGroups=[];
bindPromptPersistence("groupPostPrompt",groupPostPrompt);
[groupPostTargetGroups,groupPostInterDelay].forEach(el=>el.addEventListener("change",()=>{
  const target=Math.max(1,parseInt(groupPostTargetGroups.value)||1),delay=Math.min(3600,Math.max(5,parseInt(groupPostInterDelay.value)||30));
  groupPostTargetGroups.value=target;groupPostInterDelay.value=delay;
  chrome.storage.sync.set({groupPostTargetGroups:target,groupPostInterDelay:delay});
}));
function groupPostKey(g){
  try{
    const u=new URL(String(g?.url||""),location.origin);
    const path=u.pathname.match(/^\/groups\/([^/?#]+)/i)?.[1];
    if(path)return `/groups/${String(path).toLowerCase()}`;
  }catch(_){ }
  return String(g?.id||g?.name||"").trim().toLowerCase();
}
function renderPostGroups(groups){
  const seen=new Set();
  postGroups=(groups||[]).filter(g=>{const key=groupPostKey(g);if(!key||seen.has(key))return false;seen.add(key);return true;});
  if(!postGroups.length){groupPostList.innerHTML='<div class="hint" style="padding:6px">'+t("c.noGroups")+'</div>';return;}
  const esc=s=>String(s||"").replace(/[<>&"]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[c]));
  groupPostList.innerHTML=postGroups.map(g=>`<label data-key="${esc(groupPostKey(g))}" data-name="${esc(String(g.name||"").toLocaleLowerCase("vi"))}" style="display:flex;align-items:center;gap:7px;padding:5px;margin:0;border-bottom:1px solid #eee"><input class="post-group-check" type="checkbox" value="${esc(groupPostKey(g))}" style="width:auto"><img src="${esc(g.icon||"icon128.png")}" style="width:30px;height:30px;border-radius:50%;object-fit:cover"><span style="font-size:12px">${esc(g.name)}</span></label>`).join("");
}
loadPostGroupsBtn.onclick=async()=>{
  let tab=await getActiveTab();if(!tab)return;
  groupPostStatus.textContent=t("p.gpLoadGroups");
  if(!/facebook\.com\/groups\/joins/.test(tab.url||"")){await chrome.tabs.update(tab.id,{url:"https://www.facebook.com/groups/joins/?nav_source=tab"});await new Promise(r=>setTimeout(r,5000));}
  const retry=await autoReloadAndRetry(tab.id,{action:"scanJoinedGroups"},groupPostStatus);
  const groups=retry.res?.groups||[];renderPostGroups(groups);chrome.storage.local.set({joinedGroups:groups});
  groupPostStatus.textContent=t("p.gpLoaded",{n:groups.length});
};
selectAllPostGroupsBtn.onclick=()=>{const rows=[...groupPostList.querySelectorAll('label[data-name]')].filter(r=>r.style.display!=="none"),bs=rows.map(r=>r.querySelector('.post-group-check')).filter(Boolean);const on=bs.some(b=>!b.checked);bs.forEach(b=>b.checked=on);};
groupPostKeyword.oninput=()=>{const k=groupPostKeyword.value.trim().toLocaleLowerCase("vi");groupPostList.querySelectorAll('label[data-name]').forEach(r=>r.style.display=!k||r.dataset.name.toLocaleLowerCase("vi").includes(k)?"flex":"none");};
function selectedPostGroups(){const keys=new Set([...groupPostList.querySelectorAll('.post-group-check:checked')].map(b=>b.value));return postGroups.filter(g=>keys.has(groupPostKey(g)));}
function readGroupPostBackgroundConfig(){
  const mode=groupPostBackgroundMode.value==="fixed"?"fixed":"random";
  const fixedColor=GROUP_POST_PREVIEW_COLORS[groupPostFixedColor.value]?groupPostFixedColor.value:"pink";
  const colors=[...document.querySelectorAll('.group-post-bg-color:checked')].map(el=>el.value).filter(v=>GROUP_POST_PREVIEW_COLORS[v]);
  return {
    enabled:!!groupPostBackgroundEnabled.checked,
    mode,
    fixedColor,
    colors:colors.length?colors:Object.keys(GROUP_POST_PREVIEW_COLORS),
    maxChars:Math.min(140,Math.max(40,parseInt(groupPostMaxChars.value)||100)),
    fallback:"skip"
  };
}
function toggleGroupPostBackgroundOptions(){groupPostBackgroundOptions.classList.toggle("hidden",!groupPostBackgroundEnabled.checked);groupPostFixedColorWrap.classList.toggle("hidden",groupPostBackgroundMode.value!=="fixed");}
async function saveGroupPostBackgroundDraft(){const bg=readGroupPostBackgroundConfig();await chrome.storage.sync.set({groupPostBackgroundEnabled:bg.enabled,groupPostBackgroundMode:bg.mode,groupPostFixedColor:bg.fixedColor,groupPostBackgroundColors:bg.colors,groupPostMaxChars:bg.maxChars,groupPostBackgroundFallback:"skip"});}
groupPostBackgroundEnabled.addEventListener("change",()=>{toggleGroupPostBackgroundOptions();saveGroupPostBackgroundDraft();});
groupPostBackgroundMode.addEventListener("change",()=>{toggleGroupPostBackgroundOptions();saveGroupPostBackgroundDraft();});
groupPostFixedColor.addEventListener("change",saveGroupPostBackgroundDraft);
document.querySelectorAll('.group-post-bg-color').forEach(el=>el.addEventListener("change",saveGroupPostBackgroundDraft));
[groupPostMaxChars].forEach(el=>el.addEventListener("change",saveGroupPostBackgroundDraft));
function selectedGroupPostModel(){return groupPostAiModel.value==="__custom__"?groupPostAiCustomModel.value.trim():groupPostAiModel.value;}
function cleanPastedApiKey(value){return String(value||"").trim().replace(/^GEMINI_API_KEY\s*=\s*/i,"").replace(/^['"]|['"]$/g,"").trim();}
function renderGroupPostModels(provider,saved=""){const models=providerModels[provider]||[];groupPostAiModel.innerHTML=models.map(m=>`<option value="${m}">${m}</option>`).join("")+`<option value="__custom__">✏️ ${t("c.customModel")}</option>`;if(saved&&models.includes(saved)){groupPostAiModel.value=saved;groupPostAiCustomModel.classList.add("hidden");}else if(saved){groupPostAiModel.value="__custom__";groupPostAiCustomModel.value=saved;groupPostAiCustomModel.classList.remove("hidden");}else{groupPostAiModel.value=models.length?models[0]:"__custom__";groupPostAiCustomModel.classList.toggle("hidden",!!models.length);}}
async function refreshUnifiedAiUi(){const c=await getUnifiedAiConfig();groupPostAiProvider.value=c.provider;groupPostAiKey.value=c.key;groupPostAiUrl.value=c.url;renderGroupPostModels(c.provider,c.model);if(typeof aiProvider!=="undefined"){aiProvider.value=c.provider;aiApiKey.value=c.key;aiCustomUrl.value=c.url;renderAiModels(c.provider,c.model);}}
groupPostAiProvider.onchange=async()=>{const c=await getUnifiedAiConfig(groupPostAiProvider.value);groupPostAiKey.value=c.key;groupPostAiUrl.value=c.url;renderGroupPostModels(c.provider,c.model);};
groupPostAiModel.onchange=()=>groupPostAiCustomModel.classList.toggle("hidden",groupPostAiModel.value!=="__custom__");
async function saveGroupAiDraft(){groupPostAiKey.value=cleanPastedApiKey(groupPostAiKey.value);await persistUnifiedAiConfig({provider:groupPostAiProvider.value,key:groupPostAiKey.value,model:selectedGroupPostModel(),url:groupPostAiUrl.value.trim()});}
[groupPostAiKey,groupPostAiUrl,groupPostAiCustomModel].forEach(el=>el.addEventListener("change",saveGroupAiDraft));
groupPostAiModel.addEventListener("change",()=>{if(groupPostAiModel.value!=="__custom__")saveGroupAiDraft();});
groupPostPreviewBtn.onclick=async()=>{
  const group=selectedPostGroups()[0];
  if(!group){groupPostStatus.textContent=t("p.gpNeedPreviewGroups");return;}
  const prompt=groupPostPrompt.value.trim(),background=readGroupPostBackgroundConfig();
  groupPostAiKey.value=cleanPastedApiKey(groupPostAiKey.value);
  const aiConfig={provider:groupPostAiProvider.value,key:groupPostAiKey.value,model:selectedGroupPostModel(),url:groupPostAiUrl.value.trim()};
  if(!aiConfig.key||!aiConfig.model){groupPostStatus.textContent=t("p.gpNeedKeyModel");return;}
  if(!prompt.includes("{groupName}")){groupPostStatus.textContent=t("p.gpNeedPrompt");return;}
  if(background.enabled&&background.mode==="random"&&!background.colors.length){groupPostStatus.textContent=t("p.gpNeedColor");return;}
  await persistUnifiedAiConfig(aiConfig);groupPostPreviewBtn.disabled=true;groupPostStatus.textContent=t("p.gpPreviewRun",{name:group.name});
  try{
    const ai=await chrome.runtime.sendMessage({action:"aiGenerateGroupPost",groupName:group.name,prompt,aiConfig,background});
    if(!ai?.ok)throw new Error(ai?.error||t("p.gpAiFail"));
    const color=background.enabled?(background.mode==="fixed"?background.fixedColor:background.colors[Math.floor(Math.random()*background.colors.length)]):"plain";
    groupPostPreview.textContent=ai.content;
    groupPostPreview.style.background=color==="plain"?"#f0f2f5":GROUP_POST_PREVIEW_COLORS[color];
    groupPostPreview.style.color=color==="plain"?"#050505":"#fff";
    groupPostPreview.classList.remove("hidden");
    groupPostStatus.textContent=t("p.gpPreviewOk",{len:ai.content.length,max:background.enabled?background.maxChars:"1800"});
  }catch(e){groupPostStatus.textContent=t("p.gpPreviewFail",{err:e.message});}
  finally{groupPostPreviewBtn.disabled=false;}
};
groupPostStartBtn.onclick=async()=>{
  if(isGroupPostRunning){groupPostStatus.textContent=t("p.gpBusy");return;}
  const shareRun=await chrome.storage.local.get(["groupShareActive","salesPostActive","trendLearnActive","trendPostActive","pageGroupJoinActive","pageGroupPostActive","pageWatchActive","pageCommentActive"]);if(Object.values(shareRun).some(Boolean)){groupPostStatus.textContent=(shareRun.pageGroupJoinActive||shareRun.pageGroupPostActive||shareRun.pageWatchActive||shareRun.pageCommentActive)?t("pg.busyOther"):t("p.shBusyPost");return;}
  const selectedGroups=selectedPostGroups();
  const requestedGroups=Math.max(1,parseInt(groupPostTargetGroups.value)||1);
  const groups=selectedGroups.slice(0,Math.min(requestedGroups,selectedGroups.length));
  const prompt=groupPostPrompt.value.trim(),minDelay=GROUP_POST_AUTO_TIMING.minDelay,maxDelay=GROUP_POST_AUTO_TIMING.maxDelay,background=readGroupPostBackgroundConfig();
  if(!selectedGroups.length){groupPostStatus.textContent=t("p.gpNeedGroups");return;}
  if(requestedGroups>selectedGroups.length){groupPostStatus.textContent=t("p.gpOnlyReal",{n:selectedGroups.length});}
  const interGroupDelay=Math.min(3600,Math.max(5,parseInt(groupPostInterDelay.value)||30));
  groupPostInterDelay.value=interGroupDelay;
  groupPostAiKey.value=cleanPastedApiKey(groupPostAiKey.value);const aiConfig={provider:groupPostAiProvider.value,key:groupPostAiKey.value,model:selectedGroupPostModel(),url:groupPostAiUrl.value.trim()};
  if(!aiConfig.key){groupPostStatus.textContent=t("p.gpNeedKey");return;}
  if(!aiConfig.model){groupPostStatus.textContent=t("p.gpNeedModel");return;}
  if(!prompt.includes("{groupName}")){groupPostStatus.textContent=t("p.gpNeedPrompt");return;}
  const runId=`group-post-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  await persistUnifiedAiConfig(aiConfig);const cfg={groups,prompt,minDelay,maxDelay,interGroupDelay,aiConfig,background,runId};await chrome.storage.sync.set({groupPostPrompt:prompt,groupPostTargetGroups:requestedGroups,groupPostInterDelay:interGroupDelay,groupPostBackgroundEnabled:background.enabled,groupPostBackgroundMode:background.mode,groupPostFixedColor:background.fixedColor,groupPostBackgroundColors:background.colors,groupPostMaxChars:background.maxChars,groupPostBackgroundFallback:"skip"});
  setGroupPostRunning(true);
  const tab=await ensureTaskTab(
    groups[0].url,
    groupPostStatus,
    t("p.openFirstGroup",{name:groups[0].name}),
    url=>url.includes("facebook.com/groups/"),
    async owner=>{
      await chrome.storage.local.set({groupPostActive:true,groupPostRunId:runId,groupPostConfig:{...cfg,ownerTabId:owner.id},groupPostIndex:0,groupPostDone:0,groupPostSkipped:0,groupPostTotal:groups.length,groupPostNextAt:0,groupPostLastColor:"",groupPostRetryCount:0,groupPostPendingContent:"",groupPostPendingIndex:-1,groupPostStage:"",groupPostSubmitRunId:"",groupPostSubmitIndex:-1,groupPostSubmitDispatchedAt:0,groupPostStatus:t("gp2.starting")});
    }
  );if(!tab){setGroupPostRunning(false);await chrome.storage.local.set({groupPostActive:false});return;}
  chrome.tabs.sendMessage(tab.id,{action:"startGroupPost",...cfg,ownerTabId:tab.id},async res=>{
    if(chrome.runtime.lastError){
      const retry=await autoReloadAndRetry(tab.id,{action:"startGroupPost",...cfg,ownerTabId:tab.id},groupPostStatus);
      if(retry.ok&&retry.res?.ok){groupPostStatus.textContent=t("p.gpRunning",{n:groups.length,d:interGroupDelay});return;}
      if(await runStillActive("groupPostActive")){groupPostStatus.textContent=t("p.gpRunning",{n:groups.length,d:interGroupDelay});return;}
      setGroupPostRunning(false);groupPostStatus.textContent=retry.res?.error||t("p.gpStartFail");return;
    }
    if(res&&res.ok){groupPostStatus.textContent=t("p.gpRunning",{n:groups.length,d:interGroupDelay});return;}
    if(await runStillActive("groupPostActive")){groupPostStatus.textContent=t("p.gpRunning",{n:groups.length,d:interGroupDelay});return;}
    await chrome.storage.local.set({groupPostActive:false});
    setGroupPostRunning(false);groupPostStatus.textContent=res?.error||t("p.gpStartFail");return;
  });
};
groupPostStopBtn.onclick=async()=>{setGroupPostRunning(false);await chrome.storage.local.set({groupPostActive:false,groupPostNextAt:0,groupPostStage:"",groupPostStatus:t("p.gpStopped")});broadcastToFacebookTabs({action:"stopGroupPost"});const tab=await getActiveTab();if(tab)chrome.tabs.sendMessage(tab.id,{action:"stopGroupPost"});};
groupPostResetBtn.onclick=async()=>{setGroupPostRunning(false);await chrome.storage.local.set({groupPostActive:false,groupPostRunId:"",groupPostIndex:0,groupPostDone:0,groupPostSkipped:0,groupPostTotal:0,groupPostNextAt:0,groupPostLastColor:"",groupPostRetryCount:0,groupPostPendingContent:"",groupPostPendingIndex:-1,groupPostStage:"",groupPostSubmitRunId:"",groupPostSubmitIndex:-1,groupPostSubmitDispatchedAt:0,groupPostStatus:t("gp.resetDone")});broadcastToFacebookTabs({action:"stopGroupPost"});const tab=await getActiveTab();if(tab)chrome.tabs.sendMessage(tab.id,{action:"stopGroupPost"});};
chrome.storage.local.get(["joinedGroups","groupPostStatus","groupPostDone","groupPostSkipped","groupPostTotal","groupPostActive"],r=>{if(r.joinedGroups)renderPostGroups(r.joinedGroups);if(r.groupPostStatus)groupPostStatus.textContent=r.groupPostStatus;groupPostCount.textContent=t("p.gpCount",{d:r.groupPostDone||0,t:r.groupPostTotal||0,s:r.groupPostSkipped||0});if(r.groupPostActive)setGroupPostRunning(true);});
chrome.storage.sync.get(["groupPostPrompt","groupPostTargetGroups","groupPostInterDelay","groupPostBackgroundEnabled","groupPostBackgroundMode","groupPostFixedColor","groupPostBackgroundColors","groupPostMaxChars"],async r=>{if(r.groupPostPrompt!==undefined)groupPostPrompt.value=r.groupPostPrompt;if(r.groupPostTargetGroups!==undefined)groupPostTargetGroups.value=r.groupPostTargetGroups;if(r.groupPostInterDelay!==undefined)groupPostInterDelay.value=Math.min(3600,Math.max(5,r.groupPostInterDelay));groupPostBackgroundEnabled.checked=r.groupPostBackgroundEnabled!==false;if(r.groupPostBackgroundMode)groupPostBackgroundMode.value=r.groupPostBackgroundMode==="fixed"?"fixed":"random";if(r.groupPostFixedColor&&GROUP_POST_PREVIEW_COLORS[r.groupPostFixedColor])groupPostFixedColor.value=r.groupPostFixedColor;if(Array.isArray(r.groupPostBackgroundColors)){document.querySelectorAll('.group-post-bg-color').forEach(el=>el.checked=r.groupPostBackgroundColors.includes(el.value));}if(r.groupPostMaxChars)groupPostMaxChars.value=r.groupPostMaxChars;toggleGroupPostBackgroundOptions();const c=await getUnifiedAiConfig();groupPostAiProvider.value=c.provider;groupPostAiKey.value=c.key;renderGroupPostModels(c.provider,c.model==="gemini-3.6-flash"?"gemini-flash-lite-latest":c.model);groupPostAiUrl.value=c.url;});
chrome.storage.onChanged.addListener(c=>{if(c.groupPostStatus)groupPostStatus.textContent=c.groupPostStatus.newValue;if(c.groupPostActive!==undefined)setGroupPostRunning(c.groupPostActive.newValue);if(c.groupPostDone||c.groupPostSkipped||c.groupPostTotal)chrome.storage.local.get(["groupPostDone","groupPostSkipped","groupPostTotal"],r=>groupPostCount.textContent=t("p.gpCount",{d:r.groupPostDone||0,t:r.groupPostTotal||0,s:r.groupPostSkipped||0}));});

// SHARE BAI FACEBOOK VAO NHOM - state va logic tach rieng voi dang bai AI
const groupShareSourceUrl=$("groupShareSourceUrl"),groupShareTargetGroups=$("groupShareTargetGroups"),groupShareInterDelay=$("groupShareInterDelay"),groupSharePrompt=$("groupSharePrompt");
const groupShareCount=$("groupShareCount"),groupShareStatus=$("groupShareStatus"),groupShareAiSummary=$("groupShareAiSummary"),groupShareAiTestBtn=$("groupShareAiTestBtn");
const groupShareStartBtn=$("groupShareStartBtn"),groupShareStopBtn=$("groupShareStopBtn"),groupShareResetBtn=$("groupShareResetBtn");
let isGroupShareRunning=false;
function setGroupShareRunning(v){isGroupShareRunning=v;groupShareStartBtn.textContent=v?t("p.shBusy"):t("sh.start");groupShareStartBtn.classList.toggle("running",v);setPromptEditorState(v,groupSharePrompt,"groupSharePromptLockHint");}
const loadShareGroupsBtn=$("loadShareGroupsBtn"),selectAllShareGroupsBtn=$("selectAllShareGroupsBtn"),groupShareKeyword=$("groupShareKeyword"),groupShareList=$("groupShareList");
const groupShareSourceText=$("groupShareSourceText"),groupShareAiTranscript=$("groupShareAiTranscript"),groupShareAiActivity=$("groupShareAiActivity"),groupShareAiChatInput=$("groupShareAiChatInput"),groupShareAiChatBtn=$("groupShareAiChatBtn"),groupShareAiClearBtn=$("groupShareAiClearBtn");
let shareGroups=[],shareAiMessages=[],shareAiSourceUrl="",shareSourceSaveTimer=0,shareSourceDirty=false;
bindPromptPersistence("groupSharePrompt",groupSharePrompt);
function shareEscape(value){return String(value||"").replace(/[<>&"]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[c]));}
function normalizeFacebookShareSource(value){
  const raw=String(value||"").trim();if(!raw)throw new Error(t("p.shNeedLink"));
  let url;try{url=new URL(raw);}catch{throw new Error(t("p.shBadUrl"));}
  const host=url.hostname.toLowerCase();
  if(!(host==="facebook.com"||host.endsWith(".facebook.com")||host==="fb.watch"))throw new Error(t("p.shNeedFb"));
  if(!/^https?:$/.test(url.protocol))throw new Error(t("p.shBadProto"));
  const isPostLink=host==="fb.watch"||/\/(?:posts?|permalink|photos?|videos?|reel|watch)\/|\/groups\/[^/]+\/(?:posts?|permalink)\/|\/share\/(?:p|r|v)\/|\/(?:story|permalink)\.php/i.test(url.pathname)||url.searchParams.has("story_fbid")||url.searchParams.has("fbid");
  if(!isPostLink)throw new Error(t("p.shNotPost"));
  url.hash="";
  ["__cft__","__tn__","mibextid","ref","refid","locale","comment_id","reply_comment_id"].forEach(key=>url.searchParams.delete(key));
  return url.toString();
}
function renderShareGroups(groups,selectedIds=[]){
  const selected=new Set((selectedIds||[]).map(String)),seen=new Set();
  shareGroups=(groups||[]).filter(group=>{const key=groupPostKey(group);if(!key||seen.has(key))return false;seen.add(key);return true;});
  if(!shareGroups.length){groupShareList.innerHTML='<div class="hint" style="padding:6px">'+t("c.noGroups")+'</div>';return;}
  groupShareList.innerHTML=shareGroups.map(group=>{const key=groupPostKey(group);return `<label data-name="${shareEscape(String(group.name||"").toLocaleLowerCase("vi"))}" style="display:flex;align-items:center;gap:7px;padding:5px;margin:0;border-bottom:1px solid #eee;min-width:0"><input class="share-group-check" type="checkbox" value="${shareEscape(key)}" ${selected.has(key)?"checked":""} style="width:auto"><img src="${shareEscape(group.icon||"icon128.png")}" style="width:28px;height:28px;border-radius:50%;object-fit:cover"><span style="font-size:12px;overflow:hidden;text-overflow:ellipsis">${shareEscape(group.name)}</span></label>`;}).join("");
}
function selectedShareGroups(){const keys=new Set([...groupShareList.querySelectorAll(".share-group-check:checked")].map(box=>box.value));return shareGroups.filter(group=>keys.has(groupPostKey(group)));}
function shareComparableUrl(value){try{return normalizeFacebookShareSource(value).replace(/\/$/,"");}catch{return String(value||"").trim().replace(/\/$/,"");}}
function renderShareAiTranscript(){
  if(!shareAiMessages.length){groupShareAiTranscript.innerHTML='<div class="hint">'+t("sh.noChat")+'</div>';return;}
  groupShareAiTranscript.innerHTML=shareAiMessages.slice(-20).map(item=>`<div class="share-ai-message ${item.role==="assistant"?"assistant":"user"}"><b>${item.role==="assistant"?t("p.shRoleAi"):t("p.shRoleYou")}:</b> ${shareEscape(item.content)}</div>`).join("");
  groupShareAiTranscript.scrollTop=groupShareAiTranscript.scrollHeight;
}
async function persistShareSourceDraft(){
  const sourceUrl=shareComparableUrl(groupShareSourceUrl.value),text=groupShareSourceText.value.trim();
  shareAiSourceUrl=sourceUrl;shareSourceDirty=false;
  await chrome.storage.local.set({groupShareSourceDraftText:text,groupShareSourceDraftUrl:sourceUrl});
}
async function resetShareAiForNewUrl(){
  const sourceUrl=shareComparableUrl(groupShareSourceUrl.value);
  if(!shareAiSourceUrl||sourceUrl===shareComparableUrl(shareAiSourceUrl))return;
  shareAiSourceUrl=sourceUrl;shareAiMessages=[];groupShareSourceText.value="";renderShareAiTranscript();
  groupShareAiActivity.textContent=t("p.shLinkChanged");
  await chrome.storage.local.set({groupShareSourceDraftText:"",groupShareSourceDraftUrl:sourceUrl,groupShareAiChatMessages:[],groupShareAiChatSourceUrl:sourceUrl,groupShareAiActivity:groupShareAiActivity.textContent});
}
async function saveShareDraft(){
  const target=Math.max(1,parseInt(groupShareTargetGroups.value)||1),delay=Math.min(3600,Math.max(5,parseInt(groupShareInterDelay.value)||30));
  groupShareTargetGroups.value=target;groupShareInterDelay.value=delay;
  await Promise.all([chrome.storage.sync.set({groupShareSourceUrl:groupShareSourceUrl.value.trim(),groupShareTargetGroups:target,groupShareInterDelay:delay}),chrome.storage.local.set({groupShareSelectedIds:selectedShareGroups().map(groupPostKey)})]);
}
async function refreshShareAiSummary(){const config=await getUnifiedAiConfig();groupShareAiSummary.textContent=config.key?t("p.shAiSummaryUse",{prov:config.provider,model:config.model||t("p.noModelYet")}):t("p.gpNeedKeyTab");groupShareAiChatBtn.textContent=config.provider==="gemini"?t("p.shChatSendGemini"):t("p.shChatSendProv",{prov:config.provider||"AI"});}
[groupShareSourceUrl,groupShareTargetGroups,groupShareInterDelay].forEach(el=>el.addEventListener("change",saveShareDraft));
groupShareSourceUrl.addEventListener("change",resetShareAiForNewUrl);
groupShareSourceText.addEventListener("input",()=>{shareSourceDirty=true;clearTimeout(shareSourceSaveTimer);shareSourceSaveTimer=setTimeout(persistShareSourceDraft,350);});
groupShareList.addEventListener("change",event=>{if(event.target.classList.contains("share-group-check"))saveShareDraft();});
groupShareKeyword.oninput=()=>{const key=groupShareKeyword.value.trim().toLocaleLowerCase("vi");groupShareList.querySelectorAll("label[data-name]").forEach(row=>row.style.display=!key||row.dataset.name.includes(key)?"flex":"none");};
selectAllShareGroupsBtn.onclick=()=>{const rows=[...groupShareList.querySelectorAll("label[data-name]")].filter(row=>row.style.display!=="none"),boxes=rows.map(row=>row.querySelector(".share-group-check")).filter(Boolean),turnOn=boxes.some(box=>!box.checked);boxes.forEach(box=>box.checked=turnOn);saveShareDraft();};
loadShareGroupsBtn.onclick=async()=>{
  let tab=await getActiveTab();if(!tab)return;
  groupShareStatus.textContent=t("p.loadAllGroups");
  if(!/facebook\.com\/groups\/joins/.test(tab.url||"")){await chrome.tabs.update(tab.id,{url:"https://www.facebook.com/groups/joins/?nav_source=tab"});await new Promise(resolve=>setTimeout(resolve,5000));tab=await getActiveTab();}
  const response=await new Promise(resolve=>chrome.tabs.sendMessage(tab.id,{action:"scanJoinedGroups"},async res=>{if(chrome.runtime.lastError){const retry=await autoReloadAndRetry(tab.id,{action:"scanJoinedGroups"},groupShareStatus);resolve(retry.res||{ok:false});}else resolve(res||{ok:false});}));
  if(!response?.ok){groupShareStatus.textContent=response?.error||t("p.loadGroupsFail");return;}
  const groups=response.groups||[];renderShareGroups(groups,groups.map(groupPostKey));
  await chrome.storage.local.set({joinedGroups:groups,groupShareSelectedIds:groups.map(groupPostKey)});
  groupShareStatus.textContent=t("p.shLoaded",{n:groups.length});
};
groupShareStartBtn.onclick=async()=>{
  if(isGroupShareRunning){groupShareStatus.textContent=t("p.shBusySelf");return;}
  let sourceUrl;try{sourceUrl=normalizeFacebookShareSource(groupShareSourceUrl.value);}catch(error){groupShareStatus.textContent=error.message;return;}
  const picked=selectedShareGroups(),target=Math.max(1,parseInt(groupShareTargetGroups.value)||1),groups=picked.slice(0,Math.min(target,picked.length));
  if(!picked.length){groupShareStatus.textContent=t("p.shNeedGroups");return;}
  const prompt=groupSharePrompt.value.trim();
  if(!prompt.includes("{postText}")||!prompt.includes("{groupName}")){groupShareStatus.textContent=t("p.shNeedPrompt");return;}
  const interGroupDelay=Math.min(3600,Math.max(5,parseInt(groupShareInterDelay.value)||30)),aiConfig=await getUnifiedAiConfig();
  if(!aiConfig.key){groupShareStatus.textContent=t("p.shNeedLeadKey");return;}
  if(!aiConfig.model){groupShareStatus.textContent=t("p.shNeedLeadModel");return;}
  const running=await chrome.storage.local.get(["groupPostActive","groupShareActive","salesPostActive","trendLearnActive","trendPostActive","pageGroupJoinActive","pageGroupPostActive","pageWatchActive","pageCommentActive","groupInteractActive","isAICommenting","isFeedInteracting","isGroupJoining","isDiscoverJoining","isRunning","friendConfirmActive","isScraping"]);
  if(Object.entries(running).some(([key,value])=>key!=="groupShareActive"&&!!value)){groupShareStatus.textContent=t("p.shBusyOther");return;}
  if(running.groupShareActive){groupShareStatus.textContent=t("p.shBusySelf");return;}
  const draftUrl=shareComparableUrl(groupShareSourceUrl.value),storedDraftUrl=shareComparableUrl(shareAiSourceUrl),typedSource=groupShareSourceText.value.replace(/\s+/g," ").trim();
  const manualSourceText=typedSource.length>=10&&(shareSourceDirty||!storedDraftUrl||storedDraftUrl===draftUrl)?typedSource:"";
  if(typedSource&&typedSource.length<10){groupShareStatus.textContent=t("p.shShortPost");return;}
  if(manualSourceText)await chrome.storage.local.set({groupShareSourceDraftText:manualSourceText,groupShareSourceDraftUrl:sourceUrl});
  let tab=await getActiveTab();
  if(!tab)tab=await chrome.tabs.create({url:"about:blank"});
  const runId=`group-share-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const cfg={sourceUrl,groups,prompt,interGroupDelay,aiConfig,runId,ownerTabId:tab.id,manualSourceText};
  await Promise.all([
    chrome.storage.sync.set({groupShareSourceUrl:sourceUrl,groupShareTargetGroups:target,groupShareInterDelay:interGroupDelay,groupSharePrompt:prompt}),
    chrome.storage.local.set({groupShareActive:true,groupShareConfig:cfg,groupShareSelectedIds:picked.map(groupPostKey),groupShareRunId:runId,groupShareOwnerTabId:tab.id,groupShareStage:manualSourceText?"groups":"source",groupShareSourceText:manualSourceText,groupShareSourceKey:"",groupShareSourceResolvedUrl:manualSourceText?sourceUrl:"",groupShareSourceMediaKeys:[],groupSharePreviewRejected:false,groupSharePreviewKey:"",groupSharePreviewLinks:[],groupSharePreviewImages:[],groupShareSourceNavigationAt:Date.now(),groupShareIndex:0,groupShareDone:0,groupShareSkipped:0,groupShareTotal:groups.length,groupShareNextAt:0,groupSharePendingCaption:"",groupSharePendingIndex:-1,groupShareRecentCaptions:[],groupShareSubmitDispatchedAt:0,groupShareStatus:manualSourceText?t("p.shManualReady"):t("p.shOpeningSource")})
  ]);
  shareAiSourceUrl=sourceUrl;shareSourceDirty=false;groupShareSourceUrl.value=sourceUrl;groupShareStatus.textContent=manualSourceText?t("p.shManual",{n:groups.length}):t("p.shReading",{n:groups.length});
  setGroupShareRunning(true);
  await chrome.tabs.update(tab.id,{url:sourceUrl});
};
groupShareStopBtn.onclick=async()=>{
  setGroupShareRunning(false);
  await chrome.storage.local.set({groupShareActive:false,groupShareNextAt:0,groupShareStatus:t("p.shStopped")});
  broadcastToFacebookTabs({action:"stopGroupShare"});
  const tab=await getActiveTab();if(tab?.url?.includes("facebook.com"))chrome.tabs.sendMessage(tab.id,{action:"stopGroupShare"});
};
groupShareResetBtn.onclick=async()=>{
  setGroupShareRunning(false);
  await chrome.storage.local.set({groupShareActive:false,groupShareRunId:"",groupShareOwnerTabId:0,groupShareStage:"",groupShareSourceText:"",groupShareSourceKey:"",groupShareSourceResolvedUrl:"",groupShareSourceMediaKeys:[],groupSharePreviewRejected:false,groupSharePreviewKey:"",groupSharePreviewLinks:[],groupSharePreviewImages:[],groupShareIndex:0,groupShareDone:0,groupShareSkipped:0,groupShareTotal:0,groupShareNextAt:0,groupSharePendingCaption:"",groupSharePendingIndex:-1,groupShareRecentCaptions:[],groupShareSubmitDispatchedAt:0,groupShareStatus:t("p.shResetDone")});
  broadcastToFacebookTabs({action:"resetGroupShare"});
  groupShareCount.textContent="0 / 0";
};
groupShareAiTestBtn.onclick=async()=>{const config=await getUnifiedAiConfig();await testAiConnection(config,groupShareStatus,groupShareAiTestBtn);await refreshShareAiSummary();};
groupShareAiClearBtn.onclick=async()=>{
  shareAiMessages=[];renderShareAiTranscript();groupShareAiActivity.textContent=t("p.shChatCleared");
  await chrome.storage.local.set({groupShareAiChatMessages:[],groupShareAiChatSourceUrl:shareComparableUrl(groupShareSourceUrl.value),groupShareAiActivity:groupShareAiActivity.textContent,groupShareLastAiReply:""});
};
groupShareAiChatBtn.onclick=async()=>{
  const message=groupShareAiChatInput.value.trim();if(!message){groupShareAiActivity.textContent=t("p.shNeedChat");return;}
  const postText=groupShareSourceText.value.replace(/\s+/g," ").trim();if(postText.length<10){groupShareAiActivity.textContent=t("p.shNeedPost");return;}
  let aiConfig=await getUnifiedAiConfig();if(!aiConfig.key||!aiConfig.model){groupShareAiActivity.textContent=t("p.shNeedLeadBoth");return;}
  const sourceUrl=shareComparableUrl(groupShareSourceUrl.value);
  if(shareAiSourceUrl&&sourceUrl!==shareComparableUrl(shareAiSourceUrl)){shareAiMessages=[];}
  shareAiSourceUrl=sourceUrl;shareAiMessages=[...shareAiMessages,{role:"user",content:message,at:Date.now()}].slice(-20);renderShareAiTranscript();
  groupShareAiChatInput.value="";groupShareAiChatBtn.disabled=true;groupShareAiActivity.textContent=t("p.shAiWorking",{prov:aiConfig.provider==="gemini"?"Gemini":aiConfig.provider});
  await chrome.storage.local.set({groupShareSourceDraftText:postText,groupShareSourceDraftUrl:sourceUrl,groupShareAiChatMessages:shareAiMessages,groupShareAiChatSourceUrl:sourceUrl,groupShareAiActivity:groupShareAiActivity.textContent});
  try{
    const response=await chrome.runtime.sendMessage({action:"aiGroupShareChat",postText,sourceUrl,messages:shareAiMessages,aiConfig});
    if(!response?.ok)throw new Error(response?.error||t("p.shAiNoReply"));
    shareAiMessages=[...shareAiMessages,{role:"assistant",content:String(response.reply||"").trim(),at:Date.now()}].slice(-20);renderShareAiTranscript();
    groupShareAiActivity.textContent=t("p.shAiDone",{prov:response.provider||aiConfig.provider,model:response.model||aiConfig.model});
    await chrome.storage.local.set({groupShareAiChatMessages:shareAiMessages,groupShareAiChatSourceUrl:sourceUrl,groupShareAiActivity:groupShareAiActivity.textContent,groupShareLastAiReply:response.reply||""});
  }catch(error){groupShareAiActivity.textContent=t("p.shAiFail",{err:error.message});await chrome.storage.local.set({groupShareAiActivity:groupShareAiActivity.textContent});}
  finally{groupShareAiChatBtn.disabled=false;}
};
groupShareAiChatInput.addEventListener("keydown",event=>{if(event.key==="Enter"&&(event.ctrlKey||event.metaKey)){event.preventDefault();groupShareAiChatBtn.click();}});
chrome.storage.local.get(["joinedGroups","groupShareSelectedIds","groupShareStatus","groupShareDone","groupShareSkipped","groupShareTotal","groupShareActive","groupShareSourceText","groupShareSourceResolvedUrl","groupShareSourceDraftText","groupShareSourceDraftUrl","groupShareAiChatMessages","groupShareAiChatSourceUrl","groupShareAiActivity"],async local=>{
  const sync=await chrome.storage.sync.get(["groupShareSourceUrl","groupShareTargetGroups","groupShareInterDelay","groupSharePrompt"]);
  renderShareGroups(local.joinedGroups||[],local.groupShareSelectedIds||[]);
  if(sync.groupShareSourceUrl!==undefined)groupShareSourceUrl.value=sync.groupShareSourceUrl;
  if(sync.groupShareTargetGroups!==undefined)groupShareTargetGroups.value=sync.groupShareTargetGroups;
  if(sync.groupShareInterDelay!==undefined)groupShareInterDelay.value=Math.min(3600,Math.max(5,sync.groupShareInterDelay));
  if(sync.groupSharePrompt!==undefined)groupSharePrompt.value=sync.groupSharePrompt;
  if(local.groupShareStatus)groupShareStatus.textContent=local.groupShareStatus;
  const currentUrl=shareComparableUrl(groupShareSourceUrl.value),runtimeUrl=shareComparableUrl(local.groupShareSourceResolvedUrl||"");
  const draftUrl=shareComparableUrl(local.groupShareSourceDraftUrl||"");
  groupShareSourceText.value=runtimeUrl&&runtimeUrl===currentUrl&&local.groupShareSourceText?local.groupShareSourceText:(draftUrl===currentUrl?local.groupShareSourceDraftText||"":"");
  shareAiSourceUrl=shareComparableUrl(local.groupShareAiChatSourceUrl||draftUrl||currentUrl);
  shareAiMessages=shareAiSourceUrl===currentUrl&&Array.isArray(local.groupShareAiChatMessages)?local.groupShareAiChatMessages:[];renderShareAiTranscript();
  if(local.groupShareAiActivity)groupShareAiActivity.textContent=local.groupShareAiActivity;
  if(local.groupShareActive)setGroupShareRunning(true);
  groupShareCount.textContent=t("p.shCount",{d:local.groupShareDone||0,t:local.groupShareTotal||0,s:local.groupShareSkipped||0});
  refreshShareAiSummary();
});
chrome.storage.onChanged.addListener((changes,area)=>{if(area!=="local")return;if(changes.groupShareStatus)groupShareStatus.textContent=changes.groupShareStatus.newValue;if(changes.groupShareActive!==undefined)setGroupShareRunning(changes.groupShareActive.newValue);if(changes.groupShareSourceText?.newValue&&document.activeElement!==groupShareSourceText){groupShareSourceText.value=changes.groupShareSourceText.newValue;persistShareSourceDraft();}if(changes.groupShareAiActivity)groupShareAiActivity.textContent=changes.groupShareAiActivity.newValue||t("sh.aiWaiting");if(changes.groupShareDone||changes.groupShareSkipped||changes.groupShareTotal)chrome.storage.local.get(["groupShareDone","groupShareSkipped","groupShareTotal"],state=>groupShareCount.textContent=t("p.shCount",{d:state.groupShareDone||0,t:state.groupShareTotal||0,s:state.groupShareSkipped||0}));});

// AI COMMENT
const aiProvider = $("aiProvider");
const aiApiKey = $("aiApiKey");
const aiModel = $("aiModel");
const aiCustomModel = $("aiCustomModel");
const aiCustomUrl = $("aiCustomUrl");
const aiPrompt = $("aiPrompt");
const aiTarget = $("aiTarget");
const aiMinDelay = $("aiMinDelay");
const aiMaxDelay = $("aiMaxDelay");
const aiEconomyMode=$("aiEconomyMode"),aiBatchSize=$("aiBatchSize"),aiCacheDays=$("aiCacheDays");
const aiStartBtn = $("aiStartBtn");
const aiStopBtn = $("aiStopBtn");
const aiResetBtn = $("aiResetBtn");
const aiTestBtn = $("aiTestBtn");
const aiStatus = $("aiStatus");
const aiCountEl = $("aiCount");
const aiDesc = $("aiDesc");
const providerDesc = {
  openai: t("ai.dp.openai"),
  gemini: t("ai.dp.gemini"),
  claude: t("ai.dp.Muse"),
  groq: t("ai.dp.groq"),
  openrouter: t("ai.dp.openrouter"),
  deepseek: t("ai.dp.deepseek"),
  mistral: t("ai.dp.mistral"),
  custom: t("ai.dp.custom")
};
const providerModels={
  openai:["gpt-5-mini","gpt-4.1-mini","gpt-4o-mini"],
  gemini:["gemini-flash-lite-latest","gemini-3.5-flash-lite","gemini-3.1-flash-lite","gemini-2.5-flash-lite","gemini-3.7-flash","gemini-3.6-flash","gemini-3.5-flash"],
  claude:["claude-sonnet-4-20250514","claude-3-5-sonnet-20241022","claude-3-5-haiku-20241022","claude-3-haiku-20240307"],
  groq:["llama-3.3-70b-versatile","llama-3.1-8b-instant","openai/gpt-oss-20b"],
  openrouter:["openai/gpt-4o-mini","openai/gpt-4.1-mini","google/gemini-2.5-flash","anthropic/claude-sonnet-4"],
  deepseek:["deepseek-chat","deepseek-reasoner"],
  mistral:["mistral-small-latest","mistral-medium-latest","mistral-large-latest"],
  custom:[]
};
function selectedAiModel(){return aiModel.value==="__custom__"?aiCustomModel.value.trim():aiModel.value;}
function renderAiModels(provider,savedModel=""){
  const models=providerModels[provider]||[];
  aiModel.innerHTML=models.map(m=>`<option value="${m}">${m}</option>`).join("")+`<option value="__custom__">✏️ ${t("c.customModel")}</option>`;
  if(savedModel && models.includes(savedModel)){aiModel.value=savedModel;aiCustomModel.classList.add("hidden");}
  else if(savedModel){aiModel.value="__custom__";aiCustomModel.value=savedModel;aiCustomModel.classList.remove("hidden");}
  else if(models.length){aiModel.value=models[0];aiCustomModel.classList.add("hidden");}
  else{aiModel.value="__custom__";aiCustomModel.value="";aiCustomModel.classList.remove("hidden");}
}
function updateAiDesc(){
  const p = aiProvider.value;
  aiDesc.textContent = providerDesc[p] || "";
  // load key/model da luu cho provider nay
  chrome.storage.sync.get(["aiKeys"], res=>{
    const keys = res.aiKeys || {};
    if(keys[p]){
      aiApiKey.value = keys[p].key || "";
      let savedModel=keys[p].model||"";
      if(p==="gemini" && (/^gemini-(1\.5|2\.0)/.test(savedModel)||savedModel==="gemini-3.6-flash")) savedModel="gemini-flash-lite-latest";
      renderAiModels(p,savedModel);
      aiCustomUrl.value = keys[p].url || "";
    } else {
      aiApiKey.value = "";
      // giu model mac dinh
      renderAiModels(p,"");
      aiCustomUrl.value = "";
    }
  });
}
aiProvider.addEventListener("change", updateAiDesc);
updateAiDesc();
function saveAiKeys(){
  const p = aiProvider.value;
  return persistUnifiedAiConfig({provider:p,key:aiApiKey.value.trim(),model:selectedAiModel(),url:aiCustomUrl.value.trim()}).then(()=>chrome.storage.sync.set({aiPrompt:aiPrompt.value}));
}
async function testAiConnection(aiConfig,statusEl,button){
  if(!aiConfig.key){statusEl.textContent=t("p.needKey");return;}
  if(!aiConfig.model){statusEl.textContent=t("p.needModel");return;}
  if(aiConfig.provider==="custom"&&!aiConfig.url){statusEl.textContent=t("p.needUrl");return;}
  const old=button.innerHTML;button.disabled=true;button.textContent=t("p.testing");statusEl.textContent=t("p.sendingTest");
  try{const res=await chrome.runtime.sendMessage({action:"aiTest",aiConfig});statusEl.textContent=res?.ok?t("p.testOk",{res:res.result}):t("p.testFail",{err:res?.error||t("p.noResponse")});}
  catch(e){statusEl.textContent=t("p.testFail",{err:e.message});}
  finally{button.disabled=false;button.innerHTML=old;}
}
groupPostAiTestBtn.onclick=async()=>{groupPostAiKey.value=cleanPastedApiKey(groupPostAiKey.value);const aiConfig=await persistUnifiedAiConfig({provider:groupPostAiProvider.value,key:groupPostAiKey.value,model:selectedGroupPostModel(),url:groupPostAiUrl.value.trim()});await testAiConnection(aiConfig,groupPostStatus,groupPostAiTestBtn);};
aiTestBtn.onclick=async()=>{await saveAiKeys();await testAiConnection({provider:aiProvider.value,key:aiApiKey.value.trim(),model:selectedAiModel(),url:aiCustomUrl.value.trim()},aiStatus,aiTestBtn);};
[aiApiKey, aiCustomUrl, aiCustomModel].forEach(el=> el.addEventListener("change", saveAiKeys));
aiModel.addEventListener("change",()=>{aiCustomModel.classList.toggle("hidden",aiModel.value!=="__custom__");if(aiModel.value!=="__custom__")saveAiKeys();});
bindPromptPersistence("aiPrompt",aiPrompt);

// ĐĂNG BÀI BÁN HÀNG - state và tiến trình tách riêng với Đăng bài AI/Share bài
const salesSourceText=$("salesSourceText"),salesProductInfo=$("salesProductInfo"),salesMediaInput=$("salesMediaInput"),salesMediaPreview=$("salesMediaPreview"),salesClearMediaBtn=$("salesClearMediaBtn"),salesMediaMode=$("salesMediaMode"),salesMediaPerGroup=$("salesMediaPerGroup");
const salesPrompt=$("salesPrompt"),salesStyleProfile=$("salesStyleProfile"),salesPostTargetGroups=$("salesPostTargetGroups"),salesPostInterDelay=$("salesPostInterDelay");
const salesPreviewBtn=$("salesPreviewBtn"),salesAiTestBtn=$("salesAiTestBtn"),salesPreview=$("salesPreview"),salesStartBtn=$("salesStartBtn"),salesStopBtn=$("salesStopBtn"),salesResetBtn=$("salesResetBtn");
const salesAiChatInput=$("salesAiChatInput"),salesAiChatTranscript=$("salesAiChatTranscript"),salesAiChatActivity=$("salesAiChatActivity"),salesAiChatBtn=$("salesAiChatBtn"),salesAiChatClearBtn=$("salesAiChatClearBtn"),salesAiChatUseLastBtn=$("salesAiChatUseLastBtn");
const salesPostStatus=$("salesPostStatus"),salesPostCount=$("salesPostCount"),salesAiSummary=$("salesAiSummary"),salesGroupKeyword=$("salesGroupKeyword"),salesGroupList=$("salesGroupList"),loadSalesGroupsBtn=$("loadSalesGroupsBtn"),selectAllSalesGroupsBtn=$("selectAllSalesGroupsBtn");
let salesGroups=[];
let salesIsRunning=false;
let salesSelectedMediaCount=0;
let salesMediaLoaded=false;
let salesAiMessages=[],salesAiAcceptedPosts=[],salesAiChatContextKey="";
function setSalesRunning(value){
  salesIsRunning=!!value;
  salesStartBtn.innerHTML=salesIsRunning?"⏳ Đang đăng bài bán hàng...":"▶ Tạo và đăng bài bán hàng";
  salesStartBtn.classList.toggle("running",salesIsRunning);
  salesMediaInput.disabled=salesIsRunning;
  salesClearMediaBtn.disabled=salesIsRunning;
  salesMediaMode.disabled=salesIsRunning;
  updateSalesMediaRandomUi();
  setPromptEditorState(salesIsRunning,salesPrompt,"salesPromptLockHint");
}
function salesEsc(value){return String(value||"").replace(/[<>&"]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[c]));}
function salesChatFingerprint(value){let hash=2166136261;for(const ch of String(value||"")){hash^=ch.codePointAt(0);hash=Math.imul(hash,16777619);}return (hash>>>0).toString(16);}
function salesChatContextFingerprint(){return salesChatFingerprint([salesSourceText.value,salesProductInfo.value,salesPrompt.value].map(value=>String(value||"").trim()).join("\u001f"));}
function cleanSalesChatPost(value){
  let text=String(value||"").replace(/```[a-z]*|```/gi," ").replace(/\*\*/g,"").split(/\r?\n/).map(line=>line.trim()).filter(Boolean)
    .filter(line=>!/^(dưới đây|sau đây|gợi ý|phương án|bài đăng|nội dung|đây là)\s*:/i.test(line)).join(" ");
  text=text.replace(/^[-*•\d.)\s]+/,"").replace(/^['"“”]+|['"“”]+$/g,"").replace(/https?:\/\/\S+/gi," ").replace(/(^|\s)#[\p{L}\p{N}_-]+/gu," ").replace(/\s+/g," ").trim();
  return [...text].length>900?[...text].slice(0,900).join("").replace(/\s+\S*$/g,"").trim():text;
}
function renderSalesAiChat(){
  if(!salesAiMessages.length){salesAiChatTranscript.innerHTML='<div class="hint">'+t("sales.noChat")+'</div>';salesAiChatUseLastBtn.disabled=true;return;}
  salesAiChatTranscript.innerHTML=salesAiMessages.slice(-20).map((item,index)=>{
    const assistant=item.role==="assistant";
    return `<div class="share-ai-message ${assistant?"assistant":"user"}"><b>${assistant?"AI":"Bạn"}:</b> ${salesEsc(item.content)}${assistant?`<br><button class="sales-chat-use" data-index="${index}" style="margin-top:5px;background:#e8f5e9;color:#1b5e20;border:1px solid #81c784">${t("sales.chatUse")}</button>`:""}</div>`;
  }).join("");
  salesAiChatTranscript.scrollTop=salesAiChatTranscript.scrollHeight;
  salesAiChatUseLastBtn.disabled=!salesAiMessages.some(item=>item.role==="assistant");
}
async function persistSalesAiChat(){
  await chrome.storage.local.set({salesAiChatMessages:salesAiMessages.slice(-20),salesAiChatAcceptedPosts:salesAiAcceptedPosts.slice(0,50),salesAiChatContextKey:salesAiChatContextKey,salesAiChatActivity:salesAiChatActivity.textContent||"",salesAiChatLastReply:[...salesAiMessages].reverse().find(item=>item.role==="assistant")?.content||""});
}
async function restoreSalesAiChat(){
  const saved=await chrome.storage.local.get(["salesAiChatMessages","salesAiChatAcceptedPosts","salesAiChatContextKey","salesAiChatActivity"]),current=salesChatContextFingerprint();
  if(saved.salesAiChatContextKey&&saved.salesAiChatContextKey===current){
    salesAiChatContextKey=current;
    salesAiMessages=Array.isArray(saved.salesAiChatMessages)?saved.salesAiChatMessages.filter(item=>item&&item.content).slice(-20):[];
    salesAiAcceptedPosts=Array.isArray(saved.salesAiChatAcceptedPosts)?saved.salesAiChatAcceptedPosts.map(cleanSalesChatPost).filter(Boolean).slice(0,50):[];
    renderSalesAiChat();
    if(saved.salesAiChatActivity)salesAiChatActivity.textContent=saved.salesAiChatActivity;
  }
}
async function useSalesChatMessage(index){
  const item=salesAiMessages[index];if(item?.role!=="assistant")return;
  const post=cleanSalesChatPost(item.content);if([...post].length<20){salesAiChatActivity.textContent=t("sales.chatNoReply");return;}
  const key=post.toLocaleLowerCase("vi").replace(/\s+/g," ").trim();
  if(!salesAiAcceptedPosts.some(value=>value.toLocaleLowerCase("vi").replace(/\s+/g," ").trim()===key))salesAiAcceptedPosts=[...salesAiAcceptedPosts,post].slice(0,50);
  salesAiChatContextKey=salesChatContextFingerprint();
  salesAiChatActivity.textContent=t("sales.chatUsed",{n:salesAiAcceptedPosts.length});
  await persistSalesAiChat();
}
function renderSalesGroups(groups,selected=[]){
  const chosen=new Set((selected||[]).map(String)),seen=new Set();
  salesGroups=(groups||[]).filter(g=>{const key=groupPostKey(g);if(!key||seen.has(key))return false;seen.add(key);return true;});
  if(!salesGroups.length){salesGroupList.innerHTML='<div class="hint" style="padding:6px">Chưa có danh sách nhóm</div>';return;}
  salesGroupList.innerHTML=salesGroups.map(g=>{const key=groupPostKey(g);return `<label data-name="${salesEsc(String(g.name||"").toLocaleLowerCase("vi"))}" style="display:flex;align-items:center;gap:7px;padding:5px;margin:0;border-bottom:1px solid #eee;min-width:0"><input class="sales-group-check" type="checkbox" value="${salesEsc(key)}" ${chosen.has(key)?"checked":""} style="width:auto"><img src="${salesEsc(g.icon||"icon128.png")}" style="width:28px;height:28px;border-radius:50%;object-fit:cover"><span style="font-size:12px;overflow:hidden;text-overflow:ellipsis">${salesEsc(g.name)}</span></label>`;}).join("");
}
function selectedSalesGroups(){const keys=new Set([...salesGroupList.querySelectorAll(".sales-group-check:checked")].map(b=>b.value));return salesGroups.filter(g=>keys.has(groupPostKey(g)));}
function salesAiConfig(){return getUnifiedAiConfig();}
async function refreshSalesAiSummary(){const c=await salesAiConfig();salesAiSummary.textContent=c.key?`Đang dùng ${c.provider} • ${c.model||"chưa chọn model"} • API Key đã lưu`:`Chưa có API Key dùng chung. Hãy cấu hình ở tab Nhóm hoặc Bản tin & AI.`;}
function persistSalesDraft(){
  const target=Math.max(1,Math.min(500,parseInt(salesPostTargetGroups.value)||1)),delay=Math.min(3600,Math.max(5,parseInt(salesPostInterDelay.value)||45));
  const perGroup=normalizeSalesMediaPerGroup(salesMediaPerGroup.value,salesMediaLoaded?(salesSelectedMediaCount||1):20);
  salesPostTargetGroups.value=target;salesPostInterDelay.value=delay;salesMediaPerGroup.value=perGroup;
  const randomMedia=salesMediaMode.value==="random";
  return chrome.storage.sync.set({salesSourceText:salesSourceText.value,salesProductInfo:salesProductInfo.value,salesPrompt:salesPrompt.value,salesPostTargetGroups:target,salesPostInterDelay:delay,salesStyleProfile:salesStyleProfile.value,salesMediaMode:salesMediaMode.value,salesMediaRandom:randomMedia,salesMediaPerGroup:perGroup});
}
bindPromptPersistence("salesPrompt",salesPrompt);
[salesSourceText,salesProductInfo,salesPostTargetGroups,salesPostInterDelay,salesStyleProfile].forEach(el=>el.addEventListener("change",persistSalesDraft));
salesAiChatTranscript.addEventListener("click",event=>{const button=event.target.closest?.(".sales-chat-use");if(button)useSalesChatMessage(Number(button.dataset.index));});
salesAiChatUseLastBtn.onclick=async()=>{const index=[...salesAiMessages].map((item,i)=>item.role==="assistant"?i:-1).filter(i=>i>=0).pop();if(index!==undefined&&index>=0)await useSalesChatMessage(index);};
salesAiChatClearBtn.onclick=async()=>{salesAiMessages=[];salesAiAcceptedPosts=[];salesAiChatContextKey=salesChatContextFingerprint();salesAiChatActivity.textContent=t("sales.chatCleared");renderSalesAiChat();await persistSalesAiChat();};
salesAiChatBtn.onclick=async()=>{
  const message=salesAiChatInput.value.trim();if(!message){salesAiChatActivity.textContent=t("sales.chatNeedMessage");return;}
  const source=salesSourceText.value.trim();if(source.length<10){salesAiChatActivity.textContent=t("sales.chatNeedSource");return;}
  const aiConfig=await salesAiConfig();if(!aiConfig.key||!aiConfig.model){salesAiChatActivity.textContent=t("p.gpNeedKeyTab");return;}
  const contextKey=salesChatContextFingerprint();
  if(salesAiChatContextKey&&salesAiChatContextKey!==contextKey){salesAiMessages=[];salesAiAcceptedPosts=[];}
  salesAiChatContextKey=contextKey;salesAiMessages=[...salesAiMessages,{role:"user",content:message,at:Date.now()}].slice(-20);renderSalesAiChat();
  salesAiChatInput.value="";salesAiChatBtn.disabled=true;salesAiChatActivity.textContent=t("sales.chatWorking",{prov:aiConfig.provider==="gemini"?"Gemini":aiConfig.provider});await persistSalesAiChat();
  try{
    const response=await chrome.runtime.sendMessage({action:"aiSalesPostChat",sourceText:source,productInfo:salesProductInfo.value.trim(),prompt:salesPrompt.value,messages:salesAiMessages,aiConfig});
    if(!response?.ok)throw new Error(response?.error||t("sales.chatNoReply"));
    const reply=cleanSalesChatPost(response.reply);if(!reply)throw new Error(t("sales.chatNoReply"));
    salesAiMessages=[...salesAiMessages,{role:"assistant",content:reply,at:Date.now()}].slice(-20);renderSalesAiChat();salesAiChatActivity.textContent=t("sales.chatDone",{prov:response.provider||aiConfig.provider,model:response.model||aiConfig.model});await persistSalesAiChat();
  }catch(error){salesAiChatActivity.textContent=t("sales.chatNoReply")+": "+error.message;await persistSalesAiChat();}
  finally{salesAiChatBtn.disabled=false;}
};
salesAiChatInput.addEventListener("keydown",event=>{if(event.key==="Enter"&&(event.ctrlKey||event.metaKey)){event.preventDefault();salesAiChatBtn.click();}});
salesGroupKeyword.oninput=()=>{const key=salesGroupKeyword.value.trim().toLocaleLowerCase("vi");salesGroupList.querySelectorAll("label[data-name]").forEach(row=>row.style.display=!key||row.dataset.name.includes(key)?"flex":"none");};
selectAllSalesGroupsBtn.onclick=()=>{const rows=[...salesGroupList.querySelectorAll("label[data-name]")].filter(row=>row.style.display!=="none"),boxes=rows.map(row=>row.querySelector(".sales-group-check")).filter(Boolean),on=boxes.some(b=>!b.checked);boxes.forEach(b=>b.checked=on);};
loadSalesGroupsBtn.onclick=async()=>{
  let tab=await getActiveTab();if(!tab)return;
  salesPostStatus.textContent="Đang tải đầy đủ danh sách nhóm đã tham gia...";
  if(!/facebook\.com\/groups\/joins/.test(tab.url||"")){await chrome.tabs.update(tab.id,{url:"https://www.facebook.com/groups/joins/?nav_source=tab"});await new Promise(r=>setTimeout(r,5000));tab=await getActiveTab();}
  const retry=await autoReloadAndRetry(tab.id,{action:"scanJoinedGroups"},salesPostStatus),groups=retry.res?.groups||[];
  renderSalesGroups(groups,groups.map(groupPostKey));await chrome.storage.local.set({joinedGroups:groups});salesPostStatus.textContent=`Đã tải ${groups.length} nhóm đã tham gia`;
};
function salesMediaList(value){
  const raw=Array.isArray(value)?value:(value?[value]:[]);
  return raw.filter(item=>item&&typeof item==="object"&&item.dataUrl&&/^(image|video)\//i.test(String(item.type||"")));
}
function normalizeSalesMediaPerGroup(value,available){
  const max=Math.max(1,Math.min(20,Number(available)||1));
  return Math.max(1,Math.min(max,parseInt(value)||1));
}
function updateSalesMediaRandomUi(){
  if(!salesMediaMode||!salesMediaPerGroup)return;
  const mediaCount=salesSelectedMediaCount;
  const max=Math.max(1,Math.min(20,salesMediaLoaded?(mediaCount||1):20));
  salesMediaPerGroup.max=max;
  if(salesMediaLoaded)salesMediaPerGroup.value=normalizeSalesMediaPerGroup(salesMediaPerGroup.value,mediaCount||1);
  salesMediaPerGroup.disabled=salesIsRunning||salesMediaMode.value!=="random"||!mediaCount;
}
function shuffleSalesMediaIndices(size){
  const values=Array.from({length:Math.max(0,Number(size)||0)},(_,index)=>index);
  for(let index=values.length-1;index>0;index--){const swap=Math.floor(Math.random()*(index+1));[values[index],values[swap]]=[values[swap],values[index]];}
  return values;
}
function buildSalesMediaPlan(mediaCount,groupCount,perGroup){
  const total=Math.max(0,Number(mediaCount)||0),groups=Math.max(0,Number(groupCount)||0),take=normalizeSalesMediaPerGroup(perGroup,total||1),plan=[];
  const signature=values=>[...values].sort((a,b)=>a-b).join(",");
  let previous="";
  for(let index=0;index<groups;index++){
    let selected=shuffleSalesMediaIndices(total).slice(0,take);
    if(previous&&signature(selected)===previous){
      if(take<total){
        const replacement=shuffleSalesMediaIndices(total).find(value=>!selected.includes(value));
        if(replacement!==undefined)selected[take-1]=replacement;
      }else if(selected.length>1){
        selected=[...selected.slice(1),selected[0]];
      }
    }
    plan.push(selected);previous=signature(selected);
  }
  return plan;
}
function salesMediaSize(bytes){
  const value=Number(bytes)||0;
  return `${Math.round(value/1024/1024*10)/10} MB`;
}
function renderSalesMediaPreview(value){
  const media=salesMediaList(value);
  salesMediaLoaded=true;
  salesSelectedMediaCount=media.length;
  if(!media.length){salesMediaPreview.textContent=t("sales.mediaNone");updateSalesMediaRandomUi();return;}
  const names=media.map(item=>`${item.name||"media"} (${salesMediaSize(item.size)})`).join(", ");
  salesMediaPreview.textContent=t("sales.mediaSelected",{n:media.length,names});
  updateSalesMediaRandomUi();
}
async function clearSalesMedia(){salesMediaInput.value="";await chrome.storage.local.remove("salesPostMedia");renderSalesMediaPreview([]);}
salesClearMediaBtn.onclick=clearSalesMedia;
salesMediaMode.addEventListener("change",()=>{updateSalesMediaRandomUi();persistSalesDraft();});
salesMediaPerGroup.addEventListener("change",()=>{updateSalesMediaRandomUi();persistSalesDraft();});
salesMediaInput.onchange=async()=>{
  const files=[...(salesMediaInput.files||[])];
  if(!files.length){await chrome.storage.local.remove("salesPostMedia");renderSalesMediaPreview([]);return;}
  const maxBytes=35*1024*1024;
  const invalid=files.find(file=>!/^(image|video)\//i.test(String(file.type||""))||file.size>maxBytes);
  if(invalid){
    salesMediaInput.value="";
    await chrome.storage.local.remove("salesPostMedia");
    salesSelectedMediaCount=0;updateSalesMediaRandomUi();
    salesMediaPreview.textContent=!/^(image|video)\//i.test(String(invalid.type||""))?t("sales.mediaTypeError",{name:invalid.name||"file"}):t("sales.mediaSizeError",{name:invalid.name||"file"});
    return;
  }
  salesMediaPreview.textContent=t("sales.mediaSaving",{n:files.length});
  try{
    const media=[];
    for(const file of files){
      const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});
      media.push({name:file.name,type:file.type,size:file.size,dataUrl});
    }
    await chrome.storage.local.set({salesPostMedia:media});
    renderSalesMediaPreview(media);
  }catch(error){
    salesMediaInput.value="";
    await chrome.storage.local.remove("salesPostMedia");
    salesMediaPreview.textContent=t("sales.mediaSaveError",{err:error.message||"unknown error"});
  }
};
async function buildSalesConfig(){
  const picked=selectedSalesGroups(),target=Math.max(1,Math.min(500,parseInt(salesPostTargetGroups.value)||1)),groups=picked.slice(0,target),source=salesSourceText.value.trim(),info=salesProductInfo.value.trim(),prompt=salesPrompt.value.trim(),aiConfig=await salesAiConfig();
  if(!source)throw new Error("Hãy nhập thông tin sản phẩm hoặc dán bài viết gốc");
  if(!groups.length)throw new Error("Hãy tích chọn ít nhất một nhóm");
  if(!prompt.includes("{groupName}")||!prompt.includes("{sourceText}")||!prompt.includes("{productInfo}"))throw new Error("Prompt phải có {groupName}, {sourceText} và {productInfo}");
  if(!aiConfig.key||!aiConfig.model)throw new Error("Chưa có API Key/Model AI dùng chung");
  const media=salesMediaList((await chrome.storage.local.get("salesPostMedia")).salesPostMedia).slice(0,20),randomMedia=salesMediaMode.value==="random"&&media.length>0,perGroup=normalizeSalesMediaPerGroup(salesMediaPerGroup.value,media.length||1),plan=randomMedia?buildSalesMediaPlan(media.length,groups.length,perGroup):[];
  const contextKey=salesChatContextFingerprint(),acceptedChatPosts=salesAiChatContextKey===contextKey?salesAiAcceptedPosts.slice(0,groups.length):[];
  return {groups,sourceText:source,productInfo:info,prompt,interGroupDelay:Math.min(3600,Math.max(5,parseInt(salesPostInterDelay.value)||45)),aiConfig,styleProfileId:salesStyleProfile.value||"",acceptedChatPosts,media:{enabled:media.length>0,required:media.length>0,count:media.length,random:randomMedia,perGroup,plan,manifest:media.map(item=>({name:String(item.name||"media"),type:String(item.type||""),size:Number(item.size)||0}))}};
}
salesPreviewBtn.onclick=async()=>{
  salesPreviewBtn.disabled=true;salesPostStatus.textContent="AI đang tạo bài thử — chưa đăng lên Facebook";
  try{const cfg=await buildSalesConfig(),accepted=cfg.acceptedChatPosts?.[0],response=accepted?{ok:true,content:accepted,fromChat:true}:await chrome.runtime.sendMessage({action:"aiGenerateSalesPost",groupName:cfg.groups[0].name,sourceText:cfg.sourceText,productInfo:cfg.productInfo,prompt:cfg.prompt,aiConfig:cfg.aiConfig,styleProfileId:cfg.styleProfileId,variant:1});if(!response?.ok)throw new Error(response?.error||"AI không tạo được bài");salesPreview.textContent=response.content;salesPreview.classList.remove("hidden");salesPostStatus.textContent=accepted?`Đang xem bài đã chọn từ chat (${[...response.content].length} ký tự)`: `Bản thử ${response.content.length} ký tự cho: ${cfg.groups[0].name}`;}catch(error){salesPostStatus.textContent=`Lỗi tạo bài thử: ${error.message}`;}finally{salesPreviewBtn.disabled=false;}
};
salesAiTestBtn.onclick=async()=>{const c=await salesAiConfig();await testAiConnection(c,salesPostStatus,salesAiTestBtn);await refreshSalesAiSummary();};
salesStartBtn.onclick=async()=>{
  if(salesIsRunning)return;
  setSalesRunning(true);
  try{
    const other=await chrome.storage.local.get(["groupPostActive","groupShareActive","isAICommenting","isFeedInteracting","isGroupJoining","isDiscoverJoining","pageGroupJoinActive","pageGroupPostActive","pageWatchActive","pageCommentActive","isRunning","friendConfirmActive","isScraping","salesPostActive","trendLearnActive","trendPostActive"]);
    if(Object.entries(other).some(([key,value])=>key!=="salesPostActive"&&!!value))throw new Error("Một tính năng Facebook khác đang chạy; hãy dừng trước khi đăng bán hàng");
    if(other.salesPostActive)throw new Error("Một phiên đăng bán hàng đang chạy");
    const cfg=await buildSalesConfig(),tab=await getActiveTab();if(!tab)throw new Error("Không tìm thấy tab Facebook");
    // Không ghi API key vào chrome.storage.local; background đọc key từ unified sync config.
    const runtimeCfg={...cfg,aiConfig:{provider:cfg.aiConfig.provider,model:cfg.aiConfig.model,url:cfg.aiConfig.url}};
    const runId=`sales-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    await persistSalesDraft();await chrome.storage.local.set({salesPostConfig:runtimeCfg,salesPostRunId:runId,salesPostOwnerTabId:tab.id,salesPostActive:true,salesPostIndex:0,salesPostDone:0,salesPostSkipped:0,salesPostTotal:cfg.groups.length,salesPostNextAt:0,salesPostPendingContent:"",salesPostPendingIndex:-1,salesPostStage:"",salesPostProofSeenAt:0,salesPostProofMethod:"",salesPostSubmitIndex:-1,salesPostSubmitDispatchedAt:0,salesPostStatus:`Đang chuẩn bị đăng lên ${cfg.groups.length} nhóm...`});
    salesPostStatus.textContent=`Đang chuẩn bị đăng lên ${cfg.groups.length} nhóm...`;
    if(!tab.url?.includes("facebook.com/groups/")){await chrome.tabs.update(tab.id,{url:cfg.groups[0].url});await new Promise(r=>setTimeout(r,4500));}
    chrome.tabs.sendMessage(tab.id,{action:"startSalesPost",runId,config:runtimeCfg},async res=>{if(chrome.runtime.lastError){const retry=await autoReloadAndRetry(tab.id,{action:"startSalesPost",runId,config:runtimeCfg},salesPostStatus);if(!retry.ok)salesPostStatus.textContent="Không kết nối được với trang Facebook";}else if(!res?.ok){salesPostStatus.textContent=res?.error||"Không khởi động được đăng bán hàng";}});
  }catch(error){setSalesRunning(false);salesPostStatus.textContent=error.message;}
};
salesStopBtn.onclick=async()=>{setSalesRunning(false);await chrome.storage.local.set({salesPostActive:false,salesPostNextAt:0,salesPostStage:"",salesPostProofSeenAt:0,salesPostProofMethod:"",salesPostStatus:"Đã dừng đăng bài bán hàng"});broadcastToFacebookTabs({action:"stopSalesPost"});const tab=await getActiveTab();if(tab?.url?.includes("facebook.com"))chrome.tabs.sendMessage(tab.id,{action:"stopSalesPost"});};
salesResetBtn.onclick=async()=>{setSalesRunning(false);const tab=await getActiveTab();if(tab?.url?.includes("facebook.com"))chrome.tabs.sendMessage(tab.id,{action:"resetSalesPost"});await chrome.storage.local.set({salesPostActive:false,salesPostRunId:"",salesPostOwnerTabId:0,salesPostConfig:null,salesPostIndex:0,salesPostDone:0,salesPostSkipped:0,salesPostTotal:0,salesPostNextAt:0,salesPostPendingContent:"",salesPostPendingIndex:-1,salesPostStage:"",salesPostProofSeenAt:0,salesPostProofMethod:"",salesPostSubmitIndex:-1,salesPostSubmitDispatchedAt:0,salesPostStatus:"Đã reset tiến trình đăng bán hàng"});broadcastToFacebookTabs({action:"resetSalesPost"});};
chrome.storage.sync.get(["salesSourceText","salesProductInfo","salesPrompt","salesPostTargetGroups","salesPostInterDelay","salesStyleProfile","salesMediaMode","salesMediaRandom","salesMediaPerGroup"],r=>{if(r.salesSourceText!==undefined)salesSourceText.value=r.salesSourceText;if(r.salesProductInfo!==undefined)salesProductInfo.value=r.salesProductInfo;if(r.salesPrompt!==undefined)salesPrompt.value=r.salesPrompt;if(r.salesPostTargetGroups!==undefined)salesPostTargetGroups.value=r.salesPostTargetGroups;if(r.salesPostInterDelay!==undefined)salesPostInterDelay.value=r.salesPostInterDelay;if(r.salesStyleProfile!==undefined)salesStyleProfile.value=r.salesStyleProfile;salesMediaMode.value=r.salesMediaMode==="random"||r.salesMediaMode==="all"?r.salesMediaMode:(r.salesMediaRandom?"random":"all");if(r.salesMediaPerGroup!==undefined)salesMediaPerGroup.value=r.salesMediaPerGroup;updateSalesMediaRandomUi();restoreSalesAiChat();});
 chrome.storage.local.get(["joinedGroups","salesPostStatus","salesPostDone","salesPostSkipped","salesPostTotal","salesPostActive","salesPostMedia"],r=>{if(r.joinedGroups)renderSalesGroups(r.joinedGroups);if(r.salesPostStatus)salesPostStatus.textContent=r.salesPostStatus;salesPostCount.textContent=`${r.salesPostDone||0} / ${r.salesPostTotal||0} (bỏ qua ${r.salesPostSkipped||0})`;setSalesRunning(!!r.salesPostActive);renderSalesMediaPreview(r.salesPostMedia);});
chrome.storage.onChanged.addListener((changes,area)=>{if(area!=="local")return;if(changes.salesPostStatus)salesPostStatus.textContent=changes.salesPostStatus.newValue||"";if(changes.salesPostActive)setSalesRunning(!!changes.salesPostActive.newValue);if(changes.salesPostDone||changes.salesPostSkipped||changes.salesPostTotal)chrome.storage.local.get(["salesPostDone","salesPostSkipped","salesPostTotal"],r=>salesPostCount.textContent=`${r.salesPostDone||0} / ${r.salesPostTotal||0} (bỏ qua ${r.salesPostSkipped||0})`);});
refreshSalesAiSummary();


// HỌC BÀI NHÓM NGUỒN -> VIẾT LẠI -> ĐĂNG NHÓM ĐÍCH (state trend* riêng)
const trendSourceList=$("trendSourceList"),trendTargetList=$("trendTargetList");
const trendSourceKeyword=$("trendSourceKeyword"),trendTargetKeyword=$("trendTargetKeyword");
const trendSourceLinks=$("trendSourceLinks"),trendTargetLinks=$("trendTargetLinks");
const loadTrendGroupsBtn=$("loadTrendGroupsBtn"),selectAllTrendSourceBtn=$("selectAllTrendSourceBtn"),selectAllTrendTargetBtn=$("selectAllTrendTargetBtn");
const trendPerGroup=$("trendPerGroup"),trendPerGroupWrap=$("trendPerGroupWrap"),trendLearnUnlimited=$("trendLearnUnlimited"),trendPrompt=$("trendPrompt"),trendGroupPrompt=$("trendGroupPrompt"),trendStyleProfile=$("trendStyleProfile");
const trendTargetGroups=$("trendTargetGroups"),trendPostsPerGroup=$("trendPostsPerGroup"),trendPostsPerGroupWrap=$("trendPostsPerGroupWrap"),trendPostDelay=$("trendPostDelay"),trendPostSourceMode=$("trendPostSourceMode"),trendDistributionModes=$("trendDistributionModes"),trendDistributionHint=$("trendDistributionHint"),trendPostPlan=$("trendPostPlan");
const trendAnonymousEnabled=$("trendAnonymousEnabled");
const trendBackgroundEnabled=$("trendBackgroundEnabled"),trendBackgroundOptions=$("trendBackgroundOptions"),trendBackgroundMode=$("trendBackgroundMode"),trendFixedColorWrap=$("trendFixedColorWrap"),trendFixedColor=$("trendFixedColor"),trendBackgroundMaxChars=$("trendBackgroundMaxChars");
const trendLearnBtn=$("trendLearnBtn"),trendLearnStopBtn=$("trendLearnStopBtn"),trendLearnResetBtn=$("trendLearnResetBtn");
const trendLearnSourceMode=$("trendLearnSourceMode"),trendSourceWrap=$("trendSourceWrap");
const trendRewriteBtn=$("trendRewriteBtn"),trendAiTestBtn=$("trendAiTestBtn");
const trendPostBtn=$("trendPostBtn"),trendPostStopBtn=$("trendPostStopBtn"),trendPostResetBtn=$("trendPostResetBtn");
const trendLearnStatus=$("trendLearnStatus"),trendLearnCount=$("trendLearnCount"),trendPostStatus=$("trendPostStatus"),trendPostCount=$("trendPostCount");
const trendOutline=$("trendOutline"),trendPreview=$("trendPreview"),trendAiSummary=$("trendAiSummary");
const trendLearnedList=$("trendLearnedList"),trendSelectedPostCount=$("trendSelectedPostCount"),trendSelectAllPostsBtn=$("trendSelectAllPostsBtn"),trendClearPostsBtn=$("trendClearPostsBtn"),trendDeleteSelectedPostsBtn=$("trendDeleteSelectedPostsBtn");
let trendGroups=[],trendLearnRunning=false,trendPostRunning=false,trendPostSelectedIds=new Set();
function trendEsc(v){return String(v||"").replace(/[<>&"]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[c]));}
function trendLearnMode(){
  const mode=String(trendLearnSourceMode?.value||"").trim();
  if(["links","source-selected","target-selected"].includes(mode))return mode;
  // Tương thích cấu hình cũ trước khi có bộ chọn rõ ràng.
  if(String(trendSourceLinks?.value||"").trim())return "links";
  return "target-selected";
}
function trendPostDistributionMode(){
  const value=document.querySelector('.trend-distribution-mode:checked')?.value;
  return ["auto","many-to-one","one-to-many","many-to-many"].includes(value)?value:"auto";
}
function trendLearnIdleLabel(){
  const mode=trendLearnMode();
  if(mode==="links")return t("trend2.learnLinksBtn");
  if(mode==="source-selected")return t("trend2.learnSourceListBtn");
  return t("trend2.learnTargetListBtn");
}
function setTrendLearnRunning(v){trendLearnRunning=!!v;trendLearnBtn.innerHTML=trendLearnRunning?"⏳ Đang học bài...":trendLearnIdleLabel();trendLearnBtn.classList.toggle("running",trendLearnRunning);}
function setTrendPostRunning(v){trendPostRunning=!!v;trendPostBtn.innerHTML=trendPostRunning?"⏳ Đang đăng bài viết lại...":"▶ Đăng bài viết lại";trendPostBtn.classList.toggle("running",trendPostRunning);setPromptEditorState(trendPostRunning,[trendPrompt,trendGroupPrompt],"trendPostPromptLockHint");}
function renderTrendGroups(groups){
  const seen=new Set();
  trendGroups=(groups||[]).filter(g=>{const k=groupPostKey(g);if(!k||seen.has(k))return false;seen.add(k);return true;});
  const html=trendGroups.length?trendGroups.map(g=>{const k=groupPostKey(g);return `<label data-name="${trendEsc(String(g.name||"").toLocaleLowerCase("vi"))}" style="display:flex;align-items:center;gap:7px;padding:5px;margin:0;border-bottom:1px solid #eee;min-width:0"><input class="trend-check" type="checkbox" value="${trendEsc(k)}" style="width:auto"><img src="${trendEsc(g.icon||"icon128.png")}" style="width:28px;height:28px;border-radius:50%;object-fit:cover"><span style="font-size:12px;overflow:hidden;text-overflow:ellipsis">${trendEsc(g.name)}</span></label>`;}).join(""):'<div class="hint" style="padding:6px">Chưa có danh sách nhóm</div>';
  if(trendSourceList)trendSourceList.innerHTML=html;
  if(trendTargetList)trendTargetList.innerHTML=html;
  updateTrendPostPlan();
}
function selectedTrendGroups(listEl){
  if(!listEl)return [];
  const keys=new Set([...listEl.querySelectorAll(".trend-check:checked")].map(b=>b.value));
  return trendGroups.filter(g=>keys.has(groupPostKey(g)));
}
const TREND_GROUP_LINK_RESERVED=new Set(["feed","discover","joins","create","notifications","your_groups"]);
function trendFallbackGroupName(id){
  const raw=String(id||"").trim();
  if(/^\d+$/.test(raw))return `Nhóm ${raw}`;
  return raw.replace(/[-_]+/g," ").replace(/\s+/g," ").trim()||"Nhóm Facebook";
}
function parseTrendGroupLinks(raw,label="Link nhóm"){
  const text=String(raw||"").trim();
  if(!text)return [];
  const groups=[],bad=[];
  text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean).forEach((line,index)=>{
    const divider=line.indexOf("|");
    const linkText=(divider>=0?line.slice(0,divider):line).trim();
    const explicitName=(divider>=0?line.slice(divider+1):"").trim().replace(/\s+/g," ");
    let href=linkText;
    if(!/^https?:\/\//i.test(href))href=`https://${href}`;
    try{
      const u=new URL(href);
      if(!/(^|\.)facebook\.com$/i.test(u.hostname))throw new Error("hostname");
      const match=u.pathname.match(/^\/groups\/([^/?#]+)(?:\/)?$/i);
      if(!match)throw new Error("path");
      const id=decodeURIComponent(match[1]).trim();
      if(!id||TREND_GROUP_LINK_RESERVED.has(id.toLocaleLowerCase("vi")))throw new Error("reserved");
      groups.push({id,name:explicitName||trendFallbackGroupName(id),url:`https://www.facebook.com/groups/${encodeURIComponent(id)}/`,icon:"",manualLink:true,explicitName:!!explicitName});
    }catch{bad.push(index+1);}
  });
  if(bad.length)throw new Error(`${label} không hợp lệ ở dòng ${bad.join(", ")}. Dùng URL dạng https://www.facebook.com/groups/... hoặc URL | Tên nhóm`);
  return groups;
}
function mergeTrendGroups(base=[],manual=[]){
  const out=[],byKey=new Map();
  const add=group=>{
    const key=groupPostKey(group);if(!key)return;
    const existing=byKey.get(key);
    if(!existing){byKey.set(key,group);out.push(group);return;}
    if(group.explicitName){Object.assign(existing,{name:group.name,explicitName:true});}
    if(!existing.url&&group.url)existing.url=group.url;
  };
  (Array.isArray(base)?base:[]).forEach(add);
  (Array.isArray(manual)?manual:[]).forEach(add);
  return out;
}
function trendSourceGroupsForRun(){
  const mode=trendLearnMode();
  if(mode==="links")return parseTrendGroupLinks(trendSourceLinks?.value,"Link nhóm nguồn");
  if(mode==="target-selected")return trendTargetGroupsForRun();
  return selectedTrendGroups(trendSourceList);
}
function trendTargetGroupsForRun(){
  const raw=String(trendTargetLinks?.value||"").trim();
  const manual=parseTrendGroupLinks(raw,"Link nhóm đích");
  // Link targets are an alternative to the checkbox list, not an addition to
  // it. When present, navigate/post only to the exact URLs supplied here.
  return raw?manual:selectedTrendGroups(trendTargetList);
}
function trendRewritePrompt(){
  const base=String(trendPrompt?.value||"").trim();
  const byGroup=String(trendGroupPrompt?.value||"").trim();
  if(!base.includes("{groupName}"))throw new Error("Prompt viết lại phải có {groupName}");
  if(byGroup&&!byGroup.includes("{groupName}"))throw new Error("Prompt theo group name phải có {groupName}");
  return [base,byGroup].filter(Boolean).join("\n\n");
}
function readTrendBackgroundConfig(){
  const allowed=Object.keys(GROUP_POST_PREVIEW_COLORS||{});
  const mode=trendBackgroundMode?.value==="fixed"?"fixed":"random";
  const fixedColor=allowed.includes(trendFixedColor?.value)?trendFixedColor.value:"pink";
  const colors=[...document.querySelectorAll(".trend-post-bg-color:checked")].map(el=>el.value).filter(v=>allowed.includes(v));
  return {
    enabled:!!trendBackgroundEnabled?.checked,
    mode,
    fixedColor,
    colors:colors.length?[...new Set(colors)]:allowed,
    maxChars:Math.min(140,Math.max(40,parseInt(trendBackgroundMaxChars?.value)||100)),
    fallback:"skip"
  };
}
function toggleTrendBackgroundOptions(){
  if(trendBackgroundOptions)trendBackgroundOptions.style.display=trendBackgroundEnabled?.checked?"":"none";
  if(trendFixedColorWrap)trendFixedColorWrap.style.display=trendBackgroundMode?.value==="fixed"?"":"none";
}
async function saveTrendBackgroundDraft(){
  const bg=readTrendBackgroundConfig();
  if(trendBackgroundMaxChars)trendBackgroundMaxChars.value=bg.maxChars;
  await chrome.storage.sync.set({trendBackgroundEnabled:bg.enabled,trendBackgroundMode:bg.mode,trendBackgroundFixedColor:bg.fixedColor,trendBackgroundColors:bg.colors,trendBackgroundMaxChars:bg.maxChars});
}
function trendLearnedPostId(post){return String(post?.id||post?.link||post?.text||"").trim().slice(0,300);}
function updateTrendSelectedPostCount(){
  if(trendSelectedPostCount)trendSelectedPostCount.textContent=t("trend2.selectedPostsCount",{n:trendPostSelectedIds.size});
}
function renderTrendLearned(posts){
  const box=trendLearnedList||$("trendLearnedList");
  if(!box)return;
  const rows=Array.isArray(posts)?posts:[];
  const available=new Set(rows.map(trendLearnedPostId).filter(Boolean));
  const beforeSelected=trendPostSelectedIds.size;
  trendPostSelectedIds=new Set([...trendPostSelectedIds].filter(id=>available.has(id)));
  if(beforeSelected!==trendPostSelectedIds.size)chrome.storage.sync.set({trendPostSelectedIds:[...trendPostSelectedIds]}).catch(()=>{});
  if(!rows.length){box.innerHTML='<div class="hint" style="padding:6px">Chưa học được bài nào</div>';updateTrendSelectedPostCount();updateTrendPostPlan();return;}
  box.innerHTML=rows.slice(-50).reverse().map((p,i)=>{
    const postId=trendLearnedPostId(p),checked=postId&&trendPostSelectedIds.has(postId)?" checked":"";
    const src=trendEsc(p.sourceGroupName||"nhóm nguồn");
    const text=trendEsc(String(p.text||"").replace(/\s+/g," ").trim().slice(0,140));
    const link=String(p.link||"");
    const a=/^https?:\/\//i.test(link)?` <a href="${trendEsc(link)}" target="_blank" style="font-size:11px">mở bài</a>`:"";
    const deleteTitle=trendEsc(t("trend2.deleteOnePost"));
    return `<div style="display:flex;align-items:flex-start;gap:6px;padding:5px;border-bottom:1px solid #eee;font-size:12px"><label style="display:flex;align-items:flex-start;gap:6px;flex:1;cursor:pointer"><input class="trend-source-post-check" type="checkbox" data-post-id="${trendEsc(postId)}"${checked} style="width:auto;margin-top:2px"><span><b>${rows.length-i}. [${src}]</b> ${text}…${a}</span></label><button type="button" class="trend-delete-post-btn" data-post-id="${trendEsc(postId)}" title="${deleteTitle}" aria-label="${deleteTitle}" style="padding:2px 6px;background:#ffebe6;color:#c0392b;border:1px solid #f5c6c6;font-size:11px">🗑</button></div>`;
  }).join("");
  updateTrendSelectedPostCount();
  updateTrendPostPlan();
}
function renderTrendDiag(diag){
  const box=$("trendLearnedList");
  if(!box||!diag||!diag.ok||!diag.stage)return;
  const s=diag.stage,f=diag.fail||{},g=diag.signals||{};
  const lines=[
    `Chẩn đoán trang: ${diag.url||""}`,
    `Ô article: toàn trang=${s.docArticles}, vùng chính=${s.mainArticles}, bóc được=${s.parsed}`,
    `Bị loại: chat/comment=${f.comment||0}, rỗng=${f.empty||0}, quảng cáo=${f.sponsored||0}, rớt=${f.parseFail||0}`
  ];
  if(g.loginForm)lines.push("⚠ Thấy form đăng nhập — tab này CHƯA đăng nhập Facebook!");
  else if(g.joinPrompt)lines.push("⚠ Thấy chữ tham gia nhóm — có thể chưa vào nhóm / đang chờ duyệt / nhóm kín.");
  else if(g.notAvailable)lines.push("⚠ Trang đang báo lỗi hiển thị nội dung.");
  (diag.samples||[]).forEach((sm,i)=>lines.push(`Mẫu ${i+1}: ${String(sm.text||"").slice(0,140)}`));
  box.innerHTML=`<div style="font-size:12px;white-space:pre-wrap;word-break:break-word;padding:6px">${trendEsc(lines.join("\n"))}</div>`;
}
async function refreshTrendAiSummary(){try{const c=await getUnifiedAiConfig();if(trendAiSummary)trendAiSummary.textContent=c.key?`Đang dùng ${c.provider} • ${c.model||"chưa chọn model"} • API Key đã lưu`:`Chưa có API Key dùng chung. Hãy cấu hình ở tab Nhóm.`;}catch{}}
function persistTrendDraft(){
  const unlimited=trendLearnUnlimited?trendLearnUnlimited.checked:true;
  const distributionMode=trendPostDistributionMode();
  const per=Math.max(1,parseInt(trendPerGroup.value)||10),target=Math.max(1,Math.min(500,parseInt(trendTargetGroups.value)||3)),postsPerGroup=Math.max(1,Math.min(30,parseInt(trendPostsPerGroup?.value)||1)),postDelay=Math.min(3600,Math.max(5,parseInt(trendPostDelay?.value)||30));
  trendPerGroup.value=per;trendTargetGroups.value=target;if(trendPostsPerGroup)trendPostsPerGroup.value=postsPerGroup;if(trendPostDelay)trendPostDelay.value=postDelay;
  const background=readTrendBackgroundConfig();
  const learnMode=trendLearnMode();
  return chrome.storage.sync.set({trendPerGroup:per,trendLearnUnlimited:unlimited,trendPrompt:trendPrompt.value,trendGroupPrompt:trendGroupPrompt?.value||"",trendSourceLinks:trendSourceLinks?.value||"",trendTargetLinks:trendTargetLinks?.value||"",trendStyleProfile:trendStyleProfile.value,trendTargetGroups:target,trendInterDelay:postDelay,trendPostsPerGroup:postsPerGroup,trendPostDelay:postDelay,trendPostSourceMode:trendPostSourceMode?.value==="sequential"?"sequential":"selected",trendPostDistributionMode:distributionMode,trendPostSelectedIds:[...trendPostSelectedIds],trendLearnSourceMode:learnMode,trendLearnFromTarget:learnMode==="target-selected",trendAnonymousMode:!!(trendAnonymousEnabled&&trendAnonymousEnabled.checked),trendBackgroundEnabled:background.enabled,trendBackgroundMode:background.mode,trendBackgroundFixedColor:background.fixedColor,trendBackgroundColors:background.colors,trendBackgroundMaxChars:background.maxChars});
}
function applyTrendLearnMode(){
  const linksMode=trendLearnMode()==="links";
  // Luôn hiện danh sách nhóm nguồn để người dùng có thể chuyển chế độ;
  // ô link chỉ hoạt động khi chọn chế độ học theo link.
  if(trendSourceWrap)trendSourceWrap.style.display="";
  if(trendSourceLinks){trendSourceLinks.disabled=!linksMode;trendSourceLinks.style.opacity=linksMode?"1":".65";}
  if(trendLearnBtn)trendLearnBtn.innerHTML=trendLearnRunning?"⏳ Đang học bài...":trendLearnIdleLabel();
}
function toggleTrendLearnLimit(){
  if(trendPerGroupWrap)trendPerGroupWrap.style.display=trendLearnUnlimited?.checked?"none":"";
}
toggleTrendLearnLimit();
toggleTrendPostDistributionUI();
if(trendLearnSourceMode)trendLearnSourceMode.addEventListener("change",()=>{applyTrendLearnMode();persistTrendDraft();});
if(trendSourceLinks)trendSourceLinks.addEventListener("input",()=>{if(trendLearnMode()==="links")applyTrendLearnMode();});
if(typeof bindPromptPersistence==="function")bindPromptPersistence("trendPrompt",trendPrompt);
if(typeof bindPromptPersistence==="function")bindPromptPersistence("trendGroupPrompt",trendGroupPrompt);
[trendSourceLinks,trendTargetLinks,trendPerGroup,trendTargetGroups,trendPostsPerGroup,trendPostDelay,trendStyleProfile,trendAnonymousEnabled].forEach(el=>el&&el.addEventListener("change",persistTrendDraft));
trendLearnUnlimited?.addEventListener("change",()=>{toggleTrendLearnLimit();persistTrendDraft();});
trendPostSourceMode?.addEventListener("change",()=>{toggleTrendPostDistributionUI();persistTrendDraft();updateTrendPostPlan();});
document.querySelectorAll(".trend-distribution-mode").forEach(input=>input.addEventListener("change",()=>{
  if(input.checked&&input.value==="many-to-one"&&trendTargetGroups)trendTargetGroups.value=1;
  persistTrendDraft();
  updateTrendPostPlan();
}));
[trendTargetGroups,trendPostsPerGroup].forEach(el=>el?.addEventListener("change",updateTrendPostPlan));
trendTargetLinks?.addEventListener("input",updateTrendPostPlan);
trendTargetList?.addEventListener("change",updateTrendPostPlan);
trendBackgroundEnabled?.addEventListener("change",()=>{toggleTrendBackgroundOptions();saveTrendBackgroundDraft();});
trendBackgroundMode?.addEventListener("change",()=>{toggleTrendBackgroundOptions();saveTrendBackgroundDraft();});
trendFixedColor?.addEventListener("change",saveTrendBackgroundDraft);
trendBackgroundMaxChars?.addEventListener("change",saveTrendBackgroundDraft);
document.querySelectorAll(".trend-post-bg-color").forEach(el=>el.addEventListener("change",saveTrendBackgroundDraft));
if(trendSourceKeyword)trendSourceKeyword.oninput=()=>{const k=trendSourceKeyword.value.trim().toLocaleLowerCase("vi");trendSourceList.querySelectorAll("label[data-name]").forEach(r=>r.style.display=!k||r.dataset.name.includes(k)?"flex":"none");};
if(trendTargetKeyword)trendTargetKeyword.oninput=()=>{const k=trendTargetKeyword.value.trim().toLocaleLowerCase("vi");trendTargetList.querySelectorAll("label[data-name]").forEach(r=>r.style.display=!k||r.dataset.name.includes(k)?"flex":"none");};
if(selectAllTrendSourceBtn)selectAllTrendSourceBtn.onclick=()=>{const rows=[...trendSourceList.querySelectorAll("label[data-name]")].filter(r=>r.style.display!=="none"),bs=rows.map(r=>r.querySelector(".trend-check")).filter(Boolean),on=bs.some(b=>!b.checked);bs.forEach(b=>b.checked=on);};
if(selectAllTrendTargetBtn)selectAllTrendTargetBtn.onclick=()=>{const rows=[...trendTargetList.querySelectorAll("label[data-name]")].filter(r=>r.style.display!=="none"),bs=rows.map(r=>r.querySelector(".trend-check")).filter(Boolean),on=bs.some(b=>!b.checked);bs.forEach(b=>b.checked=on);};
if(trendLearnedList)trendLearnedList.addEventListener("change",e=>{const input=e.target.closest?.(".trend-source-post-check");if(!input)return;const id=String(input.dataset.postId||"");if(!id)return;if(input.checked)trendPostSelectedIds.add(id);else trendPostSelectedIds.delete(id);updateTrendSelectedPostCount();chrome.storage.sync.set({trendPostSelectedIds:[...trendPostSelectedIds]});updateTrendPostPlan();});
async function deleteTrendLearnedPosts(ids,confirmDelete=true){
  const wanted=new Set((Array.isArray(ids)?ids:[]).map(String).filter(Boolean));
  if(!wanted.size){if(trendLearnStatus)trendLearnStatus.textContent=t("trend2.noPostsSelected");return;}
  if(confirmDelete&&!window.confirm(t("trend2.deleteConfirm",{n:wanted.size})))return;
  const saved=await chrome.storage.local.get(["trendLearnPosts"]),posts=Array.isArray(saved.trendLearnPosts)?saved.trendLearnPosts:[],remaining=posts.filter(post=>!wanted.has(trendLearnedPostId(post)));
  const removed=posts.length-remaining.length;
  trendPostSelectedIds=new Set([...trendPostSelectedIds].filter(id=>!wanted.has(id)));
  await chrome.storage.local.set({trendLearnPosts:remaining,trendLearnCount:remaining.length,trendLearnReady:remaining.length>0,trendLearnStatus:t("trend2.deletedPosts",{n:removed})});
  await chrome.storage.sync.set({trendPostSelectedIds:[...trendPostSelectedIds]});
  renderTrendLearned(remaining);
}
if(trendSelectAllPostsBtn)trendSelectAllPostsBtn.onclick=async()=>{const saved=await chrome.storage.local.get(["trendLearnPosts"]),ids=(Array.isArray(saved.trendLearnPosts)?saved.trendLearnPosts:[]).map(trendLearnedPostId).filter(Boolean);trendPostSelectedIds=new Set(ids);renderTrendLearned(saved.trendLearnPosts||[]);await chrome.storage.sync.set({trendPostSelectedIds:ids});await updateTrendPostPlan();};
if(trendClearPostsBtn)trendClearPostsBtn.onclick=async()=>{trendPostSelectedIds=new Set();updateTrendSelectedPostCount();renderTrendLearned((await chrome.storage.local.get(["trendLearnPosts"])).trendLearnPosts||[]);await chrome.storage.sync.set({trendPostSelectedIds:[]});await updateTrendPostPlan();};
if(trendDeleteSelectedPostsBtn)trendDeleteSelectedPostsBtn.onclick=async()=>{await deleteTrendLearnedPosts([...trendPostSelectedIds]);};
if(trendLearnedList)trendLearnedList.addEventListener("click",async e=>{const btn=e.target.closest?.(".trend-delete-post-btn");if(!btn)return;await deleteTrendLearnedPosts([String(btn.dataset.postId||"")]);});
if(loadTrendGroupsBtn)loadTrendGroupsBtn.onclick=async()=>{
  let tab=await getActiveTab();if(!tab||!trendLearnStatus)return;
  trendLearnStatus.textContent="Đang tải danh sách nhóm đã tham gia...";
  if(!/facebook\.com\/groups\/joins/.test(tab.url||"")){await chrome.tabs.update(tab.id,{url:"https://www.facebook.com/groups/joins/?nav_source=tab"});await new Promise(r=>setTimeout(r,5000));tab=await getActiveTab();}
  const retry=await autoReloadAndRetry(tab.id,{action:"scanJoinedGroups"},trendLearnStatus),groups=retry.res?.groups||[];
  renderTrendGroups(groups);await chrome.storage.local.set({joinedGroups:groups});
  trendLearnStatus.textContent=`Đã tải ${groups.length} nhóm. Tích nhóm nguồn rồi bấm Học bài.`;
};
function trendSourceText(posts,maxChars=6000){
  return (Array.isArray(posts)?posts:[]).filter(p=>p&&String(p.text||"").trim().length>=30).slice(0,12).map((p,i)=>`[Bài ${i+1} từ ${p.sourceGroupName||"nhóm nguồn"}]: ${String(p.text||"").replace(/\s+/g," ").trim().slice(0,700)}`).join("\n\n").slice(0,maxChars);
}
function trendSelectedPostPlan(posts,groups){
  const sourcePosts=Array.isArray(posts)?posts:[],targets=Array.isArray(groups)?groups:[];
  if(!sourcePosts.length||!targets.length)return {entries:[],counts:[],reuseSingle:false};
  if(sourcePosts.length===1){
    return {entries:targets.map((group,groupIndex)=>({group,groupIndex,posts:[sourcePosts[0]]})),counts:targets.map(()=>1),reuseSingle:true};
  }
  if(sourcePosts.length<targets.length)throw new Error(t("trend2.planNeedMore",{posts:sourcePosts.length,groups:targets.length}));
  const base=Math.floor(sourcePosts.length/targets.length),extra=sourcePosts.length%targets.length;
  let cursor=0;
  const entries=targets.map((group,groupIndex)=>{
    const count=base+(groupIndex<extra?1:0),assigned=sourcePosts.slice(cursor,cursor+count);
    cursor+=count;
    return {group,groupIndex,posts:assigned};
  });
  return {entries,counts:entries.map(entry=>entry.posts.length),reuseSingle:false};
}
function trendSelectedPostPlanForMode(posts,groups,mode=trendPostDistributionMode()){
  const sourcePosts=Array.isArray(posts)?posts:[],targets=Array.isArray(groups)?groups:[];
  if(mode==="many-to-one"){
    if(sourcePosts.length<2)throw new Error(t("trend2.modeNeedsManyPosts"));
    if(targets.length!==1)throw new Error(t("trend2.modeNeedsOneGroup"));
  }else if(mode==="one-to-many"){
    if(sourcePosts.length!==1)throw new Error(t("trend2.modeNeedsOnePost"));
    if(targets.length<2)throw new Error(t("trend2.modeNeedsManyGroups"));
  }else if(mode==="many-to-many"){
    if(sourcePosts.length<2)throw new Error(t("trend2.modeNeedsManyPosts"));
    if(targets.length<2)throw new Error(t("trend2.modeNeedsManyGroups"));
  }
  return trendSelectedPostPlan(sourcePosts,targets);
}
function trendSequentialPostPlan(posts,groups,postsPerGroup){
  const sourcePosts=Array.isArray(posts)?posts:[],targets=Array.isArray(groups)?groups:[];
  const perGroup=Math.max(1,Number(postsPerGroup)||1),total=targets.length*perGroup;
  if(sourcePosts.length<total)throw new Error(t("trend2.notEnoughUniquePosts",{total,groups:targets.length,perGroup,available:sourcePosts.length}));
  let cursor=0;
  const entries=targets.map((group,groupIndex)=>{
    const assigned=sourcePosts.slice(cursor,cursor+perGroup);cursor+=perGroup;
    return {group,groupIndex,posts:assigned};
  });
  return {entries,counts:entries.map(entry=>entry.posts.length),reuseSingle:false};
}
function trendPlanSummary(plan,postCount,groupCount){
  if(plan.reuseSingle)return t("trend2.planReuse",{groups:groupCount});
  const counts=plan.counts||[],unique=[...new Set(counts)];
  if(unique.length===1)return t("trend2.planEqual",{posts:postCount,groups:groupCount,perGroup:unique[0]||0});
  return t("trend2.planUneven",{posts:postCount,groups:groupCount,counts:counts.join(" / ")});
}
function toggleTrendPostDistributionUI(){
  const selected=trendPostSourceMode?.value!=="sequential";
  if(trendPostsPerGroupWrap)trendPostsPerGroupWrap.style.display=selected?"none":"";
  if(trendDistributionModes){
    trendDistributionModes.style.display="";
    trendDistributionModes.style.opacity=selected?"1":".58";
    trendDistributionModes.setAttribute("aria-disabled",String(!selected));
  }
  if(trendDistributionHint)trendDistributionHint.textContent=selected?t("trend2.distributionHint"):t("trend2.distributionSequentialHint");
  document.querySelectorAll(".trend-distribution-mode").forEach(input=>input.disabled=!selected);
}
async function updateTrendPostPlan(){
  if(!trendPostPlan)return;
  try{
    const picked=trendTargetGroupsForRun();
    const target=Math.max(1,Math.min(500,parseInt(trendTargetGroups?.value)||3)),groups=picked.slice(0,target);
    if(!groups.length){trendPostPlan.textContent=t("trend2.planEmpty");return;}
    const mode=trendPostSourceMode?.value==="sequential"?"sequential":"selected";
    const perGroup=Math.max(1,Math.min(30,parseInt(trendPostsPerGroup?.value)||1));
    const required=mode==="sequential"?groups.length*perGroup:null;
    const selection=await trendPostSourcePostsForRun(required),posts=selection.posts;
    if(!posts.length){trendPostPlan.textContent=mode==="sequential"?t("trend2.planSequentialEmpty"):t("trend2.planSelectPosts");return;}
    const plan=mode==="selected"?trendSelectedPostPlanForMode(posts,groups):trendSequentialPostPlan(posts,groups,perGroup);
    trendPostPlan.textContent=mode==="selected"?trendPlanSummary(plan,posts.length,groups.length):t("trend2.planSequential",{groups:groups.length,perGroup,total:groups.length*perGroup});
  }catch(e){trendPostPlan.textContent=String(e?.message||e||t("trend2.planEmpty"));}
}
async function trendPostSourcePostsForRun(requiredCount=null){
  const saved=await chrome.storage.local.get(["trendLearnPosts"]),posts=Array.isArray(saved.trendLearnPosts)?saved.trendLearnPosts:[];
  const mode=trendPostSourceMode?.value==="sequential"?"sequential":"selected";
  const perGroup=Math.max(1,Math.min(30,parseInt(trendPostsPerGroup?.value)||1));
  const hasRequiredCount=requiredCount!==null&&requiredCount!==undefined&&Number.isFinite(Number(requiredCount));
  const limit=hasRequiredCount?Math.max(1,Number(requiredCount)):perGroup;
  if(mode==="sequential")return {mode,posts:posts.slice(0,limit)};
  const selected=new Set([...trendPostSelectedIds]);
  return {mode,posts:posts.filter(post=>selected.has(trendLearnedPostId(post)))};
}
if(trendLearnBtn)trendLearnBtn.onclick=async()=>{
  // Bấm Học khi phiên cũ còn cờ = dừng phiên cũ rồi học lại từ đầu,
  // tránh kẹt vì cờ running sót lại từ lần bấm trước.
  if(trendLearnRunning){
    setTrendLearnRunning(false);
    try{
      await chrome.storage.local.set({trendLearnActive:false,trendLearnStatus:"Đang dừng phiên học cũ để học lại..."});
      broadcastToFacebookTabs({action:"stopTrendLearn"});
      const tab0=await getActiveTab();if(tab0?.url?.includes("facebook.com"))chrome.tabs.sendMessage(tab0.id,{action:"stopTrendLearn"});
    }catch{}
    await new Promise(r=>setTimeout(r,900));
  }
  setTrendLearnRunning(true);
  try{
    const other=await chrome.storage.local.get(["groupPostActive","groupShareActive","isAICommenting","isFeedInteracting","isGroupJoining","isDiscoverJoining","pageGroupJoinActive","pageGroupPostActive","pageWatchActive","pageCommentActive","isRunning","friendConfirmActive","isScraping","salesPostActive","trendPostActive"]);
    if(Object.values(other).some(Boolean))throw new Error("Một tính năng khác đang chạy; hãy dừng trước khi học bài");
    const mode=trendLearnMode();
    let picked=trendSourceGroupsForRun();
    const learnNote=mode==="links"?" (theo link nguồn)":mode==="source-selected"?" (theo danh sách nhóm nguồn đã chọn)":" (theo danh sách nhóm đích đã chọn)";
    if(mode==="links"&&!String(trendSourceLinks?.value||"").trim())throw new Error("Hãy nhập ít nhất một link nhóm nguồn");
    if(!picked.length)throw new Error(mode==="target-selected"?"Hãy tích ít nhất một nhóm đích ở B2":"Hãy tích ít nhất một nhóm nguồn trong danh sách bên dưới");
    const unlimited=trendLearnUnlimited?trendLearnUnlimited.checked:true;
    const per=Math.max(1,parseInt(trendPerGroup.value)||10);
    const tab=await getActiveTab();if(!tab)throw new Error("Không tìm thấy tab Facebook");
    const runId=`trend-learn-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const learnCfg={groups:picked.slice(0,20),perGroup:unlimited?0:per,unlimited};
    await persistTrendDraft();
    await chrome.storage.local.set({trendLearnConfig:learnCfg,trendLearnRunId:runId,trendLearnOwnerTabId:tab.id,trendLearnActive:true,trendLearnIndex:0,trendLearnPosts:[],trendLearnCount:0,trendLearnReady:false,trendLastDiag:null,trendLearnStatus:`Đang chuẩn bị học ${learnCfg.groups.length} nhóm${learnNote}${unlimited?" — không giới hạn số bài":""}...`});
    trendLearnStatus.textContent=`Đang chuẩn bị học ${learnCfg.groups.length} nhóm${learnNote}${unlimited?" — không giới hạn số bài":""}...`;
    const first=learnCfg.groups[0];
    if(!tab.url?.includes("facebook.com/groups/")){await chrome.tabs.update(tab.id,{url:first.url});await new Promise(r=>setTimeout(r,4500));}
    chrome.tabs.sendMessage(tab.id,{action:"startTrendLearn",runId,config:learnCfg},async res=>{
      if(chrome.runtime.lastError){const retry=await autoReloadAndRetry(tab.id,{action:"startTrendLearn",runId,config:learnCfg},trendLearnStatus);if(!retry.ok){setTrendLearnRunning(false);trendLearnStatus.textContent="Không kết nối được với trang Facebook";}}
      else if(!res?.ok){const still=await runStillActive("trendLearnActive");if(!still){setTrendLearnRunning(false);trendLearnStatus.textContent=res?.error||"Không khởi động được học bài";}}
    });
  }catch(e){setTrendLearnRunning(false);trendLearnStatus.textContent=e.message;}
};
if(trendLearnStopBtn)trendLearnStopBtn.onclick=async()=>{setTrendLearnRunning(false);await chrome.storage.local.set({trendLearnActive:false,trendLearnStatus:"Đã dừng học bài"});broadcastToFacebookTabs({action:"stopTrendLearn"});const tab=await getActiveTab();if(tab?.url?.includes("facebook.com"))chrome.tabs.sendMessage(tab.id,{action:"stopTrendLearn"});};
const trendDiagnoseBtn=$("trendDiagnoseBtn");
if(trendDiagnoseBtn)trendDiagnoseBtn.onclick=async()=>{
  const box=$("trendLearnedList");
  trendDiagnoseBtn.disabled=true;
  try{
    const tab=await getActiveTab();
    if(!tab||!/facebook\.com/i.test(tab.url||""))throw new Error("Hãy mở một trang Facebook (tốt nhất là đúng nhóm cần học) rồi bấm lại");
    const res=await new Promise(resolve=>{
      chrome.tabs.sendMessage(tab.id,{action:"trendDiagnose"},r=>{
        if(chrome.runtime.lastError)resolve({ok:false,error:"Không kết nối được tab (hãy reload extension + reload tab Facebook)"});
        else resolve(r||{ok:false,error:"Không phản hồi"});
      });
    });
    if(!res?.ok)throw new Error(res?.error||"Chẩn đoán thất bại");
    const s=res.stage,f=res.fail,g=res.signals;
    const lines=[
      `URL: ${res.url}`,
      `Tiêu đề: ${res.title}`,
      `Vùng chính role=main: ${res.hasMain?"có":"KHÔNG"}`,
      `Tổng ô article: toàn trang=${s.docArticles}, trong vùng chính=${s.mainArticles}`,
      `Ứng viên bài có hành động: ${s.postCandidates||0}`,
      `Qua lọc comment/chat: ${s.notComment} | có chữ: ${s.hasText} | không quảng cáo: ${s.notSponsored} | bóc được: ${s.parsed}`,
      `Bị loại: chat/comment=${f.comment}, rỗng=${f.empty}, quảng cáo=${f.sponsored}, parse rớt=${f.parseFail}`,
      `Dấu hiệu trang: đăng nhập=${g.loginForm?"CÓ (chưa đăng nhập!)":"không"} | nút tham gia=${g.joinPrompt?"CÓ (chưa vào nhóm!)":"không"} | lỗi hiển thị=${g.notAvailable?"CÓ":"không"} | role=feed=${g.feedRole}`
    ];
    (res.samples||[]).forEach((sm,i)=>lines.push(`Mẫu ${i+1}: ${sm.text}${sm.link?" | "+sm.link:""}`));
    if(box)box.innerHTML=`<div style="font-size:12px;white-space:pre-wrap;word-break:break-word;padding:6px">${trendEsc(lines.join("\n"))}</div>`;
    trendLearnStatus.textContent=`Chẩn đoán xong: ${s.parsed} bài bóc được trên trang đang mở.`;
  }catch(e){
    trendLearnStatus.textContent=`Lỗi chẩn đoán: ${e.message}`;
    if(box)box.innerHTML=`<div class="hint" style="padding:6px">Lỗi chẩn đoán: ${trendEsc(e.message)}</div>`;
  }finally{trendDiagnoseBtn.disabled=false;}
};
if(trendLearnResetBtn)trendLearnResetBtn.onclick=async()=>{setTrendLearnRunning(false);const tab=await getActiveTab();if(tab?.url?.includes("facebook.com"))chrome.tabs.sendMessage(tab.id,{action:"resetTrendLearn"});await chrome.storage.local.set({trendLearnActive:false,trendLearnRunId:"",trendLearnOwnerTabId:0,trendLearnConfig:null,trendLearnIndex:0,trendLearnPosts:[],trendLearnCount:0,trendLearnReady:false,trendLearnOutline:"",trendRewriteDrafts:[],trendLastDiag:null,trendLearnStatus:"Đã reset học bài"});broadcastToFacebookTabs({action:"resetTrendLearn"});if(trendOutline)trendOutline.classList.add("hidden");if(trendPreview)trendPreview.classList.add("hidden");};
async function trendBuildRewrite(showStatus=true){
  const pickedPosts=await trendPostSourcePostsForRun(),posts=pickedPosts.posts;
  if(posts.length<1)throw new Error("Chưa có bài đã học. Hãy học bài trước.");
  const source=trendSourceText(posts);
  if(source.length<30)throw new Error("Bài đã học quá ngắn, hãy học thêm nhóm khác.");
  const prompt=trendRewritePrompt();
  const aiConfig=await getUnifiedAiConfig();
  if(!aiConfig.key||!aiConfig.model)throw new Error("Chưa có API Key/Model AI dùng chung");
  const targets=trendTargetGroupsForRun();
  if(!targets.length)throw new Error("Hãy tích ít nhất một nhóm đích để xem trước bài viết lại");
  const first=targets[0];
  if(showStatus)trendLearnStatus.textContent="AI đang đọc bài đã học và viết lại...";
  const runtimeAi={provider:aiConfig.provider,model:aiConfig.model,url:aiConfig.url};
  const res=await chrome.runtime.sendMessage({action:"aiRewriteTrend",sourceText:source,groupName:first.name,prompt,aiConfig:runtimeAi,styleProfileId:trendStyleProfile.value||"",variant:1,background:readTrendBackgroundConfig()});
  if(!res?.ok)throw new Error(res?.error||"AI không viết lại được");
  return {posts,source,content:res.content,first};
}
if(trendRewriteBtn)trendRewriteBtn.onclick=async()=>{
  trendRewriteBtn.disabled=true;
  try{
    await persistTrendDraft();
    const r=await trendBuildRewrite(true);
    const saved=await chrome.storage.local.get(["trendLearnPosts"]);
    const outline=`Đã học ${saved.trendLearnPosts?.length||r.posts.length} bài. Nguồn: ${[...new Set(r.posts.slice(0,12).map(p=>p.sourceGroupName).filter(Boolean))].join(", ").slice(0,200)}`;
    await chrome.storage.local.set({trendLearnOutline:outline,trendRewriteDrafts:[r.content]});
    if(trendOutline){trendOutline.textContent=outline;trendOutline.classList.remove("hidden");}
    if(trendPreview){trendPreview.textContent=`Bài viết lại thử cho "${r.first.name}":\n\n${r.content}`;trendPreview.classList.remove("hidden");}
    trendLearnStatus.textContent=`Đã viết lại xong 1 bản thử cho ${r.first.name}. Bấm Đăng để AI viết biến thể cho từng nhóm đích.`;
  }catch(e){trendLearnStatus.textContent=`Lỗi viết lại: ${e.message}`;}
  finally{trendRewriteBtn.disabled=false;}
};
if(trendAiTestBtn)trendAiTestBtn.onclick=async()=>{const c=await getUnifiedAiConfig();await testAiConnection(c,trendLearnStatus,trendAiTestBtn);await refreshTrendAiSummary();};
if(trendPostBtn)trendPostBtn.onclick=async()=>{
  if(trendPostRunning)return;
  setTrendPostRunning(true);
  try{
    const other=await chrome.storage.local.get(["groupPostActive","groupShareActive","isAICommenting","isFeedInteracting","isGroupJoining","isDiscoverJoining","pageGroupJoinActive","pageGroupPostActive","pageWatchActive","pageCommentActive","isRunning","friendConfirmActive","isScraping","salesPostActive","trendLearnActive"]);
    if(Object.values(other).some(Boolean))throw new Error("Một tính năng khác đang chạy; hãy dừng trước khi đăng");
    const picked=trendTargetGroupsForRun();
    if(!picked.length)throw new Error("Hãy tích ít nhất một nhóm đích");
    const target=Math.max(1,Math.min(500,parseInt(trendTargetGroups.value)||3)),requestedPostsPerGroup=Math.max(1,Math.min(30,parseInt(trendPostsPerGroup?.value)||1)),postDelay=Math.min(3600,Math.max(5,parseInt(trendPostDelay?.value)||30)),groups=picked.slice(0,target);
    const sourceMode=trendPostSourceMode?.value==="sequential"?"sequential":"selected";
    const requestedSlots=groups.length*requestedPostsPerGroup;
    const sourceSelection=await trendPostSourcePostsForRun(sourceMode==="sequential"?requestedSlots:null),posts=sourceSelection.posts;
    if(!posts.length)throw new Error(sourceSelection.mode==="sequential"?"Không còn bài học chưa dùng để đăng.":"Hãy tích ít nhất một bài học để đăng trong lượt B2.");
    const distributionMode=sourceSelection.mode==="selected"?trendPostDistributionMode():"sequential";
    const postPlan=sourceSelection.mode==="selected"
      ?trendSelectedPostPlanForMode(posts,groups,distributionMode)
      :trendSequentialPostPlan(posts,groups,requestedPostsPerGroup);
    const postsPerGroup=Math.max(1,...postPlan.counts);
    const source=trendSourceText(posts);
    const prompt=trendRewritePrompt();
    const background=readTrendBackgroundConfig();
    const aiConfig=await getUnifiedAiConfig();
    if(!aiConfig.key||!aiConfig.model)throw new Error("Chưa có API Key/Model AI dùng chung");
    const sourcePostIds=[...new Set(posts.map(trendLearnedPostId).filter(Boolean))],jobs=[];
    postPlan.entries.forEach(entry=>entry.posts.forEach((sourcePost,postIndex)=>{
      const jobSourceId=trendLearnedPostId(sourcePost),jobSourceText=trendSourceText([sourcePost]);
      jobs.push({group:{...entry.group},groupIndex:entry.groupIndex,postIndex,groupPostTotal:entry.posts.length,sourcePostIds:jobSourceId?[jobSourceId]:[],sourceText:jobSourceText,draft:"",variant:jobs.length+1});
    }));
    trendLearnStatus.textContent=`${trendPlanSummary(postPlan,posts.length,groups.length)} AI đang viết ${jobs.length} bài...`;
    const runtimeAi={provider:aiConfig.provider,model:aiConfig.model,url:aiConfig.url};
    const drafts=[];
    for(let i=0;i<jobs.length;i++){
      const job=jobs[i],group=job.group;
      // Link-only targets may contain a numeric ID/slug but not the displayed
      // Facebook group name. Let trend.js resolve that name after opening the
      // actual group, then generate the draft there instead of guessing it.
      if(group.manualLink&&!group.explicitName){
        drafts.push("");
        job.draft="";
        trendLearnStatus.textContent=`Sẽ lấy tên thật của nhóm ${job.groupIndex+1}/${groups.length} khi mở nhóm...`;
        continue;
      }
      const res=await chrome.runtime.sendMessage({action:"aiRewriteTrend",sourceText:job.sourceText,groupName:group.name,prompt,aiConfig:runtimeAi,styleProfileId:trendStyleProfile.value||"",variant:job.variant,background});
      if(!res?.ok)throw new Error(`AI lỗi ở nhóm ${group.name}: ${res?.error||"unknown"}`);
      drafts.push(res.content);
      job.draft=res.content;
      trendLearnStatus.textContent=`AI đã viết ${i+1}/${jobs.length} bài...`;
    }
    await chrome.storage.local.set({trendRewriteDrafts:drafts});
    if(trendPreview){const previewDraft=drafts.find(Boolean)||"AI sẽ lấy tên thật của nhóm sau khi mở từng link đích.";trendPreview.textContent=`Đã chuẩn bị ${drafts.length} bài. Bản đầu cho "${groups[0].name}":\n\n${previewDraft}`;trendPreview.classList.remove("hidden");}
    const tab=await getActiveTab();if(!tab)throw new Error("Không tìm thấy tab Facebook");
    const runId=`trend-post-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const cfg={groups,jobs,drafts,sourceText:source,sourcePostIds,sourceMode:sourceSelection.mode,distribution:distributionMode,postsPerGroup,postDelay,prompt,styleProfileId:trendStyleProfile.value||"",interDelay:postDelay,anonymousMode:!!(trendAnonymousEnabled&&trendAnonymousEnabled.checked),background};
    await persistTrendDraft();
    const postConfig={groups,jobs,drafts,sourceText:cfg.sourceText,sourcePostIds,sourceMode:cfg.sourceMode,distribution:cfg.distribution,postsPerGroup,postDelay,prompt,styleProfileId:cfg.styleProfileId,interDelay:cfg.interDelay,anonymousMode:cfg.anonymousMode,background:cfg.background};
    await chrome.storage.local.set({trendPostConfig:postConfig,trendPostRunId:runId,trendPostOwnerTabId:tab.id,trendPostActive:true,trendPostIndex:0,trendPostDone:0,trendPostSkipped:0,trendPostTotal:jobs.length,trendPostNextAt:0,trendPostLastColor:"",trendPostStage:"",trendPostSubmitIndex:-1,trendPostSubmitDispatchedAt:0,trendPostAnonymousMode:cfg.anonymousMode?"anonymous":"normal",trendPostStatus:`Đang chuẩn bị đăng ${jobs.length} bài vào ${groups.length} nhóm...`});
    trendPostStatus.textContent=`Đang chuẩn bị đăng ${jobs.length} bài vào ${groups.length} nhóm...`;
    if(!tab.url?.includes("facebook.com/groups/")){await chrome.tabs.update(tab.id,{url:groups[0].url});await new Promise(r=>setTimeout(r,4500));}
    chrome.tabs.sendMessage(tab.id,{action:"startTrendPost",runId,config:postConfig},async res=>{
      if(chrome.runtime.lastError){const retry=await autoReloadAndRetry(tab.id,{action:"startTrendPost",runId,config:postConfig},trendPostStatus);if(!retry.ok){setTrendPostRunning(false);trendPostStatus.textContent="Không kết nối được trang Facebook";}}
      else if(!res?.ok){const still=await runStillActive("trendPostActive");if(!still){setTrendPostRunning(false);trendPostStatus.textContent=res?.error||"Không khởi động được đăng bài";}}
    });
  }catch(e){setTrendPostRunning(false);trendPostStatus.textContent=e.message;}
};
if(trendPostStopBtn)trendPostStopBtn.onclick=async()=>{setTrendPostRunning(false);await chrome.storage.local.set({trendPostActive:false,trendPostNextAt:0,trendPostStage:"",trendPostStatus:"Đã dừng đăng bài viết lại"});broadcastToFacebookTabs({action:"stopTrendPost"});const tab=await getActiveTab();if(tab?.url?.includes("facebook.com"))chrome.tabs.sendMessage(tab.id,{action:"stopTrendPost"});};
if(trendPostResetBtn)trendPostResetBtn.onclick=async()=>{setTrendPostRunning(false);const tab=await getActiveTab();if(tab?.url?.includes("facebook.com"))chrome.tabs.sendMessage(tab.id,{action:"resetTrendPost"});await chrome.storage.local.set({trendPostActive:false,trendPostRunId:"",trendPostOwnerTabId:0,trendPostConfig:null,trendPostIndex:0,trendPostDone:0,trendPostSkipped:0,trendPostTotal:0,trendPostNextAt:0,trendPostLastColor:"",trendPostStage:"",trendPostSubmitIndex:-1,trendPostSubmitDispatchedAt:0,trendPostStatus:"Đã reset đăng bài viết lại"});broadcastToFacebookTabs({action:"resetTrendPost"});};
try{
  chrome.storage.sync.get(["trendPerGroup","trendLearnUnlimited","trendPrompt","trendGroupPrompt","trendSourceLinks","trendTargetLinks","trendStyleProfile","trendTargetGroups","trendInterDelay","trendPostsPerGroup","trendPostDelay","trendPostSourceMode","trendPostDistributionMode","trendPostSelectedIds","trendLearnSourceMode","trendLearnFromTarget","trendBackgroundEnabled","trendBackgroundMode","trendBackgroundFixedColor","trendBackgroundColors","trendBackgroundMaxChars"],r=>{
    if(r.trendPerGroup!==undefined&&trendPerGroup)trendPerGroup.value=Math.max(1,parseInt(r.trendPerGroup)||10);
    if(trendLearnUnlimited)trendLearnUnlimited.checked=r.trendLearnUnlimited!==false;
    toggleTrendLearnLimit();
    if(r.trendPrompt!==undefined&&trendPrompt)trendPrompt.value=r.trendPrompt;
    if(r.trendGroupPrompt!==undefined&&trendGroupPrompt)trendGroupPrompt.value=r.trendGroupPrompt;
    if(r.trendSourceLinks!==undefined&&trendSourceLinks)trendSourceLinks.value=r.trendSourceLinks;
    if(r.trendTargetLinks!==undefined&&trendTargetLinks)trendTargetLinks.value=r.trendTargetLinks;
    if(r.trendTargetGroups!==undefined&&trendTargetGroups)trendTargetGroups.value=r.trendTargetGroups;
    if(trendPostsPerGroup)trendPostsPerGroup.value=Math.max(1,Math.min(30,parseInt(r.trendPostsPerGroup)||1));
    if(trendPostDelay)trendPostDelay.value=Math.min(3600,Math.max(5,parseInt(r.trendPostDelay??r.trendInterDelay)||30));
    if(trendPostSourceMode)trendPostSourceMode.value=r.trendPostSourceMode==="sequential"?"sequential":"selected";
    const savedDistribution=["auto","many-to-one","one-to-many","many-to-many"].includes(r.trendPostDistributionMode)?r.trendPostDistributionMode:"auto";
    document.querySelectorAll(".trend-distribution-mode").forEach(input=>input.checked=input.value===savedDistribution);
    toggleTrendPostDistributionUI();
    trendPostSelectedIds=new Set(Array.isArray(r.trendPostSelectedIds)?r.trendPostSelectedIds.map(String):[]);
    chrome.storage.local.get(["trendLearnPosts"]).then(s=>renderTrendLearned(s.trendLearnPosts||[])).catch(()=>{});
    if(r.trendStyleProfile!==undefined&&trendStyleProfile)trendStyleProfile.value=r.trendStyleProfile;
    if(trendLearnSourceMode){
      const legacyMode=String(r.trendSourceLinks||"").trim()?"links":(r.trendLearnFromTarget===false?"source-selected":"target-selected");
      trendLearnSourceMode.value=["links","source-selected","target-selected"].includes(r.trendLearnSourceMode)?r.trendLearnSourceMode:legacyMode;
    }
    if(trendAnonymousEnabled)trendAnonymousEnabled.checked=r.trendAnonymousMode!==false;
    if(trendBackgroundEnabled)trendBackgroundEnabled.checked=r.trendBackgroundEnabled===true;
    if(trendBackgroundMode)trendBackgroundMode.value=r.trendBackgroundMode==="fixed"?"fixed":"random";
    if(trendFixedColor&&GROUP_POST_PREVIEW_COLORS[r.trendBackgroundFixedColor])trendFixedColor.value=r.trendBackgroundFixedColor;
    if(Array.isArray(r.trendBackgroundColors))document.querySelectorAll(".trend-post-bg-color").forEach(el=>el.checked=r.trendBackgroundColors.includes(el.value));
    if(trendBackgroundMaxChars&&r.trendBackgroundMaxChars)trendBackgroundMaxChars.value=r.trendBackgroundMaxChars;
    toggleTrendBackgroundOptions();
    applyTrendLearnMode();
    updateTrendPostPlan();
  });
  chrome.storage.local.get(["joinedGroups","trendLearnStatus","trendLearnCount","trendLearnActive","trendLearnPosts","trendLastDiag","trendLearnOutline","trendRewriteDrafts","trendPostStatus","trendPostDone","trendPostSkipped","trendPostTotal","trendPostActive"],r=>{
    if(r.joinedGroups)renderTrendGroups(r.joinedGroups);
    if(r.trendLearnStatus&&trendLearnStatus)trendLearnStatus.textContent=r.trendLearnStatus;
    if(trendLearnCount)trendLearnCount.textContent=`${r.trendLearnCount||0} bài`;
    renderTrendLearned(r.trendLearnPosts||[]);
    if(!(r.trendLearnPosts||[]).length&&r.trendLastDiag)renderTrendDiag(r.trendLastDiag);
    setTrendLearnRunning(!!r.trendLearnActive);
    if(r.trendLearnOutline&&trendOutline){trendOutline.textContent=r.trendLearnOutline;trendOutline.classList.remove("hidden");}
    if(r.trendRewriteDrafts?.[0]&&trendPreview){trendPreview.textContent=r.trendRewriteDrafts[0];trendPreview.classList.remove("hidden");}
    if(r.trendPostStatus&&trendPostStatus)trendPostStatus.textContent=r.trendPostStatus;
    if(trendPostCount)trendPostCount.textContent=`${r.trendPostDone||0} / ${r.trendPostTotal||0} (bỏ qua ${r.trendPostSkipped||0})`;
    setTrendPostRunning(!!r.trendPostActive);
  });
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area!=="local")return;
    if(changes.joinedGroups&&changes.joinedGroups.newValue)renderTrendGroups(changes.joinedGroups.newValue);
    if(changes.trendLearnStatus&&trendLearnStatus)trendLearnStatus.textContent=changes.trendLearnStatus.newValue||"";
    if(changes.trendLearnCount&&trendLearnCount)trendLearnCount.textContent=`${changes.trendLearnCount.newValue||0} bài`;
    if(changes.trendLearnPosts)renderTrendLearned(changes.trendLearnPosts.newValue||[]);
    if(changes.trendLastDiag&&changes.trendLastDiag.newValue)renderTrendDiag(changes.trendLastDiag.newValue);
    if(changes.trendLearnActive)setTrendLearnRunning(!!changes.trendLearnActive.newValue);
    if(changes.trendPostStatus&&trendPostStatus)trendPostStatus.textContent=changes.trendPostStatus.newValue||"";
    if(changes.trendPostActive)setTrendPostRunning(!!changes.trendPostActive.newValue);
    if(changes.trendPostDone||changes.trendPostSkipped||changes.trendPostTotal)chrome.storage.local.get(["trendPostDone","trendPostSkipped","trendPostTotal"],r=>{if(trendPostCount)trendPostCount.textContent=`${r.trendPostDone||0} / ${r.trendPostTotal||0} (bỏ qua ${r.trendPostSkipped||0})`;});
  });
  refreshTrendAiSummary();
}catch(e){}


// HỒ SƠ KIẾN THỨC & VĂN PHONG DÙNG CHUNG CHO CÁC TÍNH NĂNG AI
const styleProfileName = $("styleProfileName");
const createStyleProfileBtn = $("createStyleProfileBtn");
const refreshStyleProfilesBtn = $("refreshStyleProfilesBtn");
const deleteStyleProfileBtn = $("deleteStyleProfileBtn");
const styleProfileStatus = $("styleProfileStatus");
const styleProfileSelects = [$("scrapeStyleProfile"),$("groupPostStyleProfile"),$("aiStyleProfile"),$("salesStyleProfile"),$("trendStyleProfile")].filter(Boolean);
let styleProfileCache = {};

function renderStyleProfileOptions(profiles, activeId=""){
  styleProfileCache = profiles && typeof profiles === "object" ? profiles : {};
  styleProfileSelects.forEach(select=>{
    const previous=select.value;
    select.textContent="";
    const empty=document.createElement("option");
    empty.value=""; empty.textContent=t("st.none"); select.appendChild(empty);
    Object.values(styleProfileCache).sort((a,b)=>String(a?.name||"").localeCompare(String(b?.name||""),"vi")).forEach(profile=>{
      if(!profile?.id)return;
      const option=document.createElement("option");
      option.value=profile.id;
      option.textContent=t("p.profileLabel",{name:profile.name||profile.id,n:profile.sampleCount||0});
      select.appendChild(option);
    });
    select.value=activeId && styleProfileCache[activeId] ? activeId : (styleProfileCache[previous]?previous:"");
  });
}

async function refreshStyleProfiles(){
  const saved=await chrome.storage.local.get(["styleProfiles","activeStyleProfileId","styleProfileStatus"]);
  renderStyleProfileOptions(saved.styleProfiles||{},saved.activeStyleProfileId||"");
  if(styleProfileStatus && saved.styleProfileStatus)styleProfileStatus.textContent=saved.styleProfileStatus;
  return saved;
}

async function setActiveStyleProfile(id){
  const activeId=styleProfileCache[id]?id:"";
  styleProfileSelects.forEach(select=>{select.value=activeId;});
  await chrome.storage.local.set({activeStyleProfileId:activeId,styleProfileStatus:activeId?t("p.profileUsing",{name:styleProfileCache[activeId]?.name||activeId}):t("p.profileOff")});
}

styleProfileSelects.forEach(select=>select.addEventListener("change",()=>setActiveStyleProfile(select.value)));
refreshStyleProfilesBtn.onclick=()=>refreshStyleProfiles();

createStyleProfileBtn.onclick=async()=>{
  const oldText=createStyleProfileBtn.innerHTML;
  createStyleProfileBtn.disabled=true;
  styleProfileStatus.textContent=t("p.fetchingPosts");
  try{
    let stored=await chrome.storage.local.get("scrapePosts"),posts=Array.isArray(stored.scrapePosts)?stored.scrapePosts:[];
    if(posts.length<3){
      const tab=await getActiveTab();
      if(tab?.id){
        const response=await new Promise(resolve=>chrome.tabs.sendMessage(tab.id,{action:"getScrapeData"},res=>resolve(chrome.runtime.lastError?null:res)));
        if(response?.ok&&Array.isArray(response.posts))posts=response.posts;
      }
    }
    if(posts.length<3)throw new Error(t("p.needPosts"));
    const name=styleProfileName.value.trim()||t("st.defaultName");
    styleProfileStatus.textContent=t("p.analyzing",{n:posts.length});
    const result=await chrome.runtime.sendMessage({action:"aiBuildStyleProfile",posts:posts.slice(-500),name,aiConfig:await getUnifiedAiConfig()});
    if(!result?.ok)throw new Error(result?.error||t("p.profileFail"));
    styleProfileStatus.textContent=t("p.profileBuilt",{name:result.profile?.name||name,n:result.profile?.sampleCount||posts.length});
    await refreshStyleProfiles();
  }catch(error){styleProfileStatus.textContent=t("p.profileErr",{err:error.message||error});}
  finally{createStyleProfileBtn.disabled=false;createStyleProfileBtn.innerHTML=oldText;}
};

deleteStyleProfileBtn.onclick=async()=>{
  const active=(await chrome.storage.local.get("activeStyleProfileId")).activeStyleProfileId||styleProfileSelects[0]?.value||"";
  if(!active||!styleProfileCache[active]){styleProfileStatus.textContent=t("p.needProfile");return;}
  if(!confirm(t("p.profileConfirmDel",{name:styleProfileCache[active].name||active})))return;
  const profiles={...styleProfileCache};delete profiles[active];
  await chrome.storage.local.set({styleProfiles:profiles,activeStyleProfileId:"",styleProfileStatus:t("p.profileDeleted")});
  await refreshStyleProfiles();
};

refreshStyleProfiles();
chrome.storage.onChanged.addListener(changes=>{
  if(changes.styleProfiles||changes.activeStyleProfileId||changes.styleProfileStatus)refreshStyleProfiles();
});

let isAICommenting=false;
function setAIRunning(v){ isAICommenting=v; aiStartBtn.textContent=v?t("p.aiBusy"):t("ai.start"); aiStartBtn.classList.toggle("running",v); }
aiStartBtn.onclick = async ()=>{
  const shareRun=await chrome.storage.local.get(["groupShareActive","salesPostActive","trendLearnActive","trendPostActive","pageGroupJoinActive","pageGroupPostActive","pageWatchActive","pageCommentActive"]);if(Object.values(shareRun).some(Boolean)){aiStatus.textContent=(shareRun.pageGroupJoinActive||shareRun.pageGroupPostActive||shareRun.pageWatchActive||shareRun.pageCommentActive)?t("pg.busyOther"):t("p.shBusyAi");return;}
  await saveAiKeys();
  const prompt = aiPrompt.value.trim();
  if(!prompt.includes("{postText}")){ aiStatus.textContent=t("p.aiNeedPrompt"); return; }
  const apiKey = aiApiKey.value.trim();
  if(!apiKey){ aiStatus.textContent=t("p.aiNeedKeyFor",{p:aiProvider.value}); return; }
  if(!selectedAiModel()){ aiStatus.textContent=t("p.aiNeedModel"); return; }
  const cfg={ target: parseInt(aiTarget.value)||10, minDelay: parseInt(aiMinDelay.value)||10, maxDelay: parseInt(aiMaxDelay.value)||20,economyMode:aiEconomyMode.value,batchSize:Math.max(2,parseInt(aiBatchSize.value)||5),cacheDays:Math.max(0,parseInt(aiCacheDays.value)||7) };
  if(cfg.minDelay>cfg.maxDelay){ aiStatus.textContent=t("p.delayBad"); return; }
  chrome.storage.sync.set({ aiTarget:cfg.target, aiMinDelay:cfg.minDelay, aiMaxDelay:cfg.maxDelay,aiEconomyMode:cfg.economyMode,aiBatchSize:cfg.batchSize,aiCacheDays:cfg.cacheDays });
  setAIRunning(true);
  let tab=await ensureTaskTab(
    "https://www.facebook.com/",
    aiStatus,
    t("p.aiOpening"),
    isPopupMainFeedUrl,
    async owner=>{
      // A new Start resets only its own counter; reload-resume never reaches
      // this callback, so the in-progress count remains intact.
      await chrome.storage.local.set({isAICommenting:true,pendingAIComment:true,pendingAIConfig:{target:cfg.target,minDelay:cfg.minDelay,maxDelay:cfg.maxDelay,economyMode:cfg.economyMode,batchSize:cfg.batchSize,cacheDays:cfg.cacheDays,ownerTabId:owner.id},aiCount:0,aiFeedReloadAttempts:0,aiStatus:t("p.aiOpening")});
    }
  );if(!tab){setAIRunning(false);await chrome.storage.local.set({isAICommenting:false});await chrome.storage.local.remove(["pendingAIComment","pendingAIConfig"]);return;}
  chrome.tabs.sendMessage(tab.id, {action:"startAIComment", ...cfg,ownerTabId:tab.id}, async res=>{
    if(chrome.runtime.lastError){
      const retry = await autoReloadAndRetry(tab.id, {action:"startAIComment", ...cfg,ownerTabId:tab.id}, aiStatus);
      if(retry.ok){ setAIRunning(true); aiStatus.textContent=t("p.aiRunning",{n:cfg.target}); }
      else if(await runStillActive("isAICommenting")||await runStillActive("pendingAIComment")){setAIRunning(true);aiStatus.textContent=t("p.aiRunning",{n:cfg.target});}
      else{await chrome.storage.local.remove(["pendingAIComment","pendingAIConfig"]);setAIRunning(false);aiStatus.textContent=retry.res?.error||t("p.aiStartFail");}
      return;
    }
    if(res&&res.ok){ setAIRunning(true); aiStatus.textContent=t("p.aiRunning",{n:cfg.target}); }
    else if(await runStillActive("isAICommenting")){ setAIRunning(true); aiStatus.textContent=t("p.aiRunning",{n:cfg.target}); }
    else{await chrome.storage.local.remove(["pendingAIComment","pendingAIConfig"]);setAIRunning(false);aiStatus.textContent=res?.error||t("p.aiStartFail");}
  });
};
aiStopBtn.onclick = async ()=>{ setAIRunning(false); await chrome.storage.local.set({isAICommenting:false,aiStatus:t("p.stoppedX"),aiActiveConfig:null,aiNextAllowedAt:0,pendingAIComment:false,aiFeedReloadAttempts:0}); const tab=await getActiveTab(); if(tab)chrome.tabs.sendMessage(tab.id,{action:"stopAIComment"},()=>{}); broadcastToFacebookTabs({action:"stopAIComment"}); };
aiResetBtn.onclick = async ()=>{ setAIRunning(false); aiCountEl.textContent="0 / "+(parseInt(aiTarget.value)||10); await chrome.storage.local.set({aiCount:0,aiStatus:t("p.resetDone"),isAICommenting:false,aiActiveConfig:null,pendingAIComment:false,aiNextAllowedAt:0,aiFeedReloadAttempts:0}); const tab=await getActiveTab(); if(tab)chrome.tabs.sendMessage(tab.id,{action:"resetAIComment"},()=>{}); broadcastToFacebookTabs({action:"resetAIComment"}); };
chrome.storage.sync.get(["aiProvider","aiPrompt","aiTarget","aiMinDelay","aiMaxDelay","aiKeys","aiEconomyMode","aiBatchSize","aiCacheDays"], res=>{
  if(res.aiProvider) { aiProvider.value=res.aiProvider; updateAiDesc(); }
  if(res.aiPrompt!==undefined) aiPrompt.value=res.aiPrompt;
  if(res.aiTarget) aiTarget.value=res.aiTarget;
  if(res.aiMinDelay) aiMinDelay.value=res.aiMinDelay;
  if(res.aiMaxDelay) aiMaxDelay.value=res.aiMaxDelay;
  if(res.aiEconomyMode)aiEconomyMode.value=res.aiEconomyMode;
  if(res.aiBatchSize)aiBatchSize.value=res.aiBatchSize;
  if(res.aiCacheDays!==undefined)aiCacheDays.value=res.aiCacheDays;
  // aiKeys se load trong updateAiDesc
  aiCountEl.textContent=`0 / ${parseInt(aiTarget.value)||10}`;
});
chrome.storage.local.get(["aiStatus","aiCount","isAICommenting"], res=>{
  if(res.aiStatus) aiStatus.textContent=res.aiStatus;
  if(res.aiCount!==undefined) aiCountEl.textContent=`${res.aiCount} / ${parseInt(aiTarget.value)||10}`;
  if(res.isAICommenting) setAIRunning(true);
});
chrome.storage.onChanged.addListener(changes=>{
  if(changes.aiStatus) aiStatus.textContent=changes.aiStatus.newValue;
  if(changes.aiCount!==undefined) aiCountEl.textContent=`${changes.aiCount.newValue} / ${parseInt(aiTarget.value)||10}`;
  if(changes.isAICommenting!==undefined) setAIRunning(changes.isAICommenting.newValue);
});
aiTarget.addEventListener("change", ()=>{ aiCountEl.textContent=`${0} / ${parseInt(aiTarget.value)||10}`; });

// ICON SVG cho nút/tab — thay emoji đầu nút bằng icon nét mảnh đồng bộ.
// Chạy 1 lần khi mở popup + tự gắn lại mỗi khi JS đổi text nút (observer).
const ICON_MAP={"🤝":"i-users","📄":"i-file","👥":"i-layers","🔁":"i-repeat","📰":"i-news","▶":"i-play","⏹":"i-stop","⏳":"i-load","↺":"i-reset","🔍":"i-search","🔎":"i-search","☑":"i-checksq","☐":"i-square","🔄":"i-refresh","🧪":"i-flask","👁":"i-eye","✨":"i-spark","🤖":"i-spark","⬇":"i-down","🗑":"i-trash","🧹":"i-x","💬":"i-send","🧭":"i-compass"};
const ICON_KEYS=Object.keys(ICON_MAP).sort((a,b)=>b.length-a.length);
const SVG_NS="http://www.w3.org/2000/svg";
const ICON_SYMBOLS=`<symbol id="i-play" viewBox="0 0 24 24"><polygon points="7 4 20 12 7 20 7 4" fill="currentColor" stroke="none"/></symbol>`
+`<symbol id="i-stop" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" stroke="none"/></symbol>`
+`<symbol id="i-load" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-6.2-8.56"/></symbol>`
+`<symbol id="i-reset" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></symbol>`
+`<symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></symbol>`
+`<symbol id="i-checksq" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5"/><path d="m9 12 2 2 4-4"/></symbol>`
+`<symbol id="i-square" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="5"/></symbol>`
+`<symbol id="i-refresh" viewBox="0 0 24 24"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></symbol>`
+`<symbol id="i-flask" viewBox="0 0 24 24"><path d="M10 2v7.5a2 2 0 0 1-.2.9L4.7 20.5a1 1 0 0 0 .9 1.5h12.8a1 1 0 0 0 .9-1.5L14.2 10.4a2 2 0 0 1-.2-.9V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/></symbol>`
+`<symbol id="i-eye" viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></symbol>`
+`<symbol id="i-spark" viewBox="0 0 24 24"><path d="M12 3l1.9 5.8 5.8 1.9-5.8 1.9L12 18.4l-1.9-5.8L4.3 10.7l5.8-1.9L12 3Z"/><path d="M19 3l.8 2.2L22 6l-2.2.8L19 9l-.8-2.2L16 6l2.2-.8L19 3Z"/></symbol>`
+`<symbol id="i-down" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></symbol>`
+`<symbol id="i-trash" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></symbol>`
+`<symbol id="i-x" viewBox="0 0 24 24"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></symbol>`
+`<symbol id="i-send" viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4 20-7Z"/><path d="M22 2 11 13"/></symbol>`
+`<symbol id="i-compass" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></symbol>`
+`<symbol id="i-users" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></symbol>`
+`<symbol id="i-file" viewBox="0 0 24 24"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></symbol>`
+`<symbol id="i-layers" viewBox="0 0 24 24"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/></symbol>`
+`<symbol id="i-repeat" viewBox="0 0 24 24"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></symbol>`
+`<symbol id="i-news" viewBox="0 0 24 24"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0V9"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/></symbol>`;
function mountIconSprite(){
  if(document.getElementById("fbIconSprite"))return;
  const svg=document.createElementNS(SVG_NS,"svg");
  svg.setAttribute("id","fbIconSprite");
  svg.setAttribute("width","0");svg.setAttribute("height","0");
  svg.setAttribute("aria-hidden","true");
  svg.style.position="absolute";
  const defs=document.createElementNS(SVG_NS,"defs");
  defs.innerHTML=ICON_SYMBOLS;
  svg.appendChild(defs);
  document.body.insertBefore(svg,document.body.firstChild);
}
function iconizeEl(el){
  const node=el.firstChild;
  if(!node||node.nodeType!==3)return;
  const text=node.nodeValue;
  for(const key of ICON_KEYS){
    if(text.startsWith(key)){
      const svg=document.createElementNS(SVG_NS,"svg");
      svg.setAttribute("class","ic"+(key==="⏳"?" spin":""));
      svg.setAttribute("viewBox","0 0 24 24");
      svg.setAttribute("fill","none");
      svg.setAttribute("stroke","currentColor");
      svg.setAttribute("stroke-width","2");
      svg.setAttribute("stroke-linecap","round");
      svg.setAttribute("stroke-linejoin","round");
      svg.setAttribute("aria-hidden","true");
      const use=document.createElementNS(SVG_NS,"use");
      use.setAttribute("href","#"+ICON_MAP[key]);
      svg.appendChild(use);
      node.nodeValue=text.slice(key.length);
      el.insertBefore(svg,node);
      break;
    }
  }
}
function iconize(root=document){
  root.querySelectorAll("button,.tab").forEach(iconizeEl);
}
mountIconSprite();
iconize();
let iconizeQueued=false;
new MutationObserver(()=>{
  if(iconizeQueued)return;
  iconizeQueued=true;
  queueMicrotask(()=>{iconizeQueued=false;try{iconize();}catch{}});
}).observe(document.body,{childList:true,characterData:true,subtree:true});

// Mở popup: tự về đúng panel của phiên đang chạy (ưu tiên Share > Nhóm >
// Bản tin & AI > Cào bài > Kết bạn); không có phiên chạy thì mở lại tab
// của lần trước. Popup không tự đóng — trạng thái cập nhật trực tiếp.
(async()=>{
  try{
    const r=await chrome.storage.local.get(["salesPostActive","trendLearnActive","trendPostActive","groupShareActive","groupPostActive","groupInteractActive","isGroupJoining","isDiscoverJoining","pageGroupJoinActive","pageGroupPostActive","pageWatchActive","pageCommentActive","isAICommenting","isFeedInteracting","isScraping","isRunning","friendConfirmActive","popupLastTab"]);
    const panel=r.salesPostActive?"sales"
      :(r.trendLearnActive||r.trendPostActive)?"trend"
      :r.groupShareActive?"share"
      :(r.pageGroupJoinActive||r.pageGroupPostActive||r.pageWatchActive||r.pageCommentActive)?"page"
      :(r.groupPostActive||r.groupInteractActive||r.isGroupJoining||r.isDiscoverJoining)?"group"
      :(r.isAICommenting||r.isFeedInteracting)?"feed"
      :r.isScraping?"scrape"
      :(r.isRunning||r.friendConfirmActive)?"add"
      :(r.popupLastTab||"");
    if(panel)showTab(panel);
  }catch{}
})();
