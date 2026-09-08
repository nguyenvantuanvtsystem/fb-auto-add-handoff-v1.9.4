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

// Tabs - 4 tab
const tabAdd = $("tabAdd");
const tabScrape = $("tabScrape");
const tabGroup = $("tabGroup");
const tabFeed = $("tabFeed");
const panelAdd = $("panelAdd");
const panelScrape = $("panelScrape");
const panelGroup = $("panelGroup");
const panelFeed = $("panelFeed");
function showTab(which){
  [tabAdd,tabScrape,tabGroup,tabFeed].forEach(t=>t.classList.remove("active"));
  [panelAdd,panelScrape,panelGroup,panelFeed].forEach(p=>p.classList.add("hidden"));
  if(which==="add"){ tabAdd.classList.add("active"); panelAdd.classList.remove("hidden"); }
  else if(which==="scrape"){ tabScrape.classList.add("active"); panelScrape.classList.remove("hidden"); }
  else if(which==="group"){ tabGroup.classList.add("active"); panelGroup.classList.remove("hidden"); }
  else { tabFeed.classList.add("active"); panelFeed.classList.remove("hidden"); }
}
tabAdd.onclick = () => showTab("add");
tabScrape.onclick = () => showTab("scrape");
tabGroup.onclick = () => {showTab("group");refreshUnifiedAiUi();};
tabFeed.onclick = () => {showTab("feed");refreshUnifiedAiUi();};

// ADD FRIEND
const startBtn = $("startBtn");
const scanBtn = $("scanBtn");
const minEl = $("minDelay");
const maxEl = $("maxDelay");
const maxReqEl = $("maxRequests");
const friendMinMutual=$("friendMinMutual");
const statusEl = $("status");
const countEl = $("count");
const friendSkippedEl=$("friendSkipped"),friendUncertainEl=$("friendUncertain");
const friendResetBtn=$("friendResetBtn"),friendClearHistoryBtn=$("friendClearHistoryBtn");
const friendSuggestionsPanel=$("friendSuggestionsPanel"),friendGroupPanel=$("friendGroupPanel");
const friendOpenSuggestionsBtn=$("friendOpenSuggestionsBtn"),loadFriendGroupsBtn=$("loadFriendGroupsBtn"),selectAllFriendGroupsBtn=$("selectAllFriendGroupsBtn");
const friendGroupKeyword=$("friendGroupKeyword"),friendGroupList=$("friendGroupList");
const friendModeButtons=[...document.querySelectorAll(".friend-mode-btn")];
let isRunning = false;
let friendMode="suggestions";
let friendGroups=[];

const friendEsc=value=>String(value||"").replace(/[<>&"]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[c]));

function setFriendMode(mode){
  friendMode=["suggestions","group-common"].includes(mode)?mode:"suggestions";
  friendModeButtons.forEach(button=>button.classList.toggle("active",button.dataset.friendMode===friendMode));
  friendSuggestionsPanel.classList.toggle("hidden",friendMode!=="suggestions");
  friendGroupPanel.classList.toggle("hidden",friendMode!=="group-common");
  chrome.storage.sync.set({friendMode});
}

friendModeButtons.forEach(button=>button.addEventListener("click",()=>setFriendMode(button.dataset.friendMode)));

function selectedFriendGroups(){
  const ids=[...friendGroupList.querySelectorAll(".friend-group-check:checked")].map(box=>box.value);
  return friendGroups.filter(group=>ids.includes(String(group.id)));
}

function renderFriendGroups(groups,selectedIds=[]){
  friendGroups=Array.isArray(groups)?groups:[];
  const selected=new Set((selectedIds||[]).map(String));
  if(!friendGroups.length){friendGroupList.innerHTML='<div class="hint" style="padding:6px">Chưa tìm thấy nhóm đã tham gia</div>';return;}
  friendGroupList.innerHTML=friendGroups.map(group=>`<label data-name="${friendEsc(group.name.toLocaleLowerCase("vi"))}" style="display:flex;align-items:center;gap:7px;padding:5px;margin:0;border-bottom:1px solid #eee;min-width:0"><input class="friend-group-check" type="checkbox" value="${friendEsc(group.id)}" ${selected.has(String(group.id))?"checked":""} style="width:auto"><img src="${friendEsc(group.icon||"icon128.png")}" style="width:28px;height:28px;border-radius:50%;object-fit:cover"><span style="font-size:12px;overflow:hidden;text-overflow:ellipsis">${friendEsc(group.name)}</span></label>`).join("");
}

function saveConfig() {
  const cfg = {
    minDelay: Math.max(1, parseInt(minEl.value) || 5) * 1000,
    maxDelay: Math.max(1, parseInt(maxEl.value) || 15) * 1000,
    maxRequests: Math.max(1, parseInt(maxReqEl.value) || 10),
    minMutual:Math.max(0,parseInt(friendMinMutual.value)||0),
    mode:friendMode,
    groups:selectedFriendGroups()
  };
  chrome.storage.sync.set({minDelay:cfg.minDelay,maxDelay:cfg.maxDelay,maxRequests:cfg.maxRequests,friendMinMutual:cfg.minMutual,friendMode:cfg.mode,friendGroupIds:cfg.groups.map(g=>String(g.id))});
  return cfg;
}

async function loadConfig() {
  const [sync,local]=await Promise.all([
    chrome.storage.sync.get(["minDelay","maxDelay","maxRequests","friendMinMutual","friendMode","friendGroupIds"]),
    chrome.storage.local.get(["joinedGroups","friendRunState","sentCount","isRunning","friendStatus","friendSkipped","friendUncertain"])
  ]);
  if(sync.minDelay)minEl.value=Math.round(sync.minDelay/1000);
  if(sync.maxDelay)maxEl.value=Math.round(sync.maxDelay/1000);
  if(sync.maxRequests)maxReqEl.value=sync.maxRequests;
  if(sync.friendMinMutual!==undefined)friendMinMutual.value=sync.friendMinMutual;
  setFriendMode(sync.friendMode||local.friendRunState?.mode||"suggestions");
  renderFriendGroups(local.joinedGroups||[],sync.friendGroupIds||[]);
  setRunning(!!local.isRunning);
  updateCount();
}

function updateCount() {
  chrome.storage.local.get(["sentCount","isRunning","friendStatus","lastMessage","friendSkipped","friendUncertain"], res => {
    const sent = res.sentCount || 0;
    const max = parseInt(maxReqEl.value) || 10;
    countEl.textContent = `${sent} / ${max}`;
    friendSkippedEl.textContent=res.friendSkipped||0;
    friendUncertainEl.textContent=res.friendUncertain||0;
    if(res.friendStatus||res.lastMessage)statusEl.textContent=res.friendStatus||res.lastMessage;
  });
}
function setRunning(running) {
  isRunning = running;
  startBtn.textContent = running ? "⏹ Dừng" : "▶ Bắt đầu";
  startBtn.classList.toggle("running", running);
}
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}
async function autoReloadAndRetry(tabId, msg, statusEl){
  statusEl.textContent = "Dang tu dong reload trang...";
  try{ await chrome.tabs.reload(tabId); }catch{}
  await new Promise(r=>setTimeout(r, 3500));
  return new Promise(resolve=>{
    chrome.tabs.sendMessage(tabId, msg, res=>{
      if(chrome.runtime.lastError){
        statusEl.textContent = "Da reload, dang thu lai...";
        setTimeout(()=> chrome.tabs.sendMessage(tabId, msg, res2=>{
          if(chrome.runtime.lastError) { statusEl.textContent="Van chua ket noi, hay doi 3s roi bam lai Bat dau"; resolve({ok:false}); }
          else resolve({ok:true, res:res2});
        }), 2000);
      } else resolve({ok:true, res});
    });
  });
}

function friendTargetUrl(cfg){
  if(cfg.mode==="suggestions")return "https://www.facebook.com/friends/suggestions";
  return cfg.groups[0]?`https://www.facebook.com/groups/${encodeURIComponent(cfg.groups[0].id)}/members/`:"https://www.facebook.com/friends/suggestions";
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
      resolve(retry.ok?(retry.res||{ok:true}):{ok:false,error:"Không kết nối được với trang Facebook"});
    }else resolve(response||{ok:false,error:"Trang Facebook không phản hồi"});
  }));
}

startBtn.addEventListener("click", async () => {
  if(isRunning){
    const stored=await chrome.storage.local.get("friendRunState"),state=stored.friendRunState||{};
    state.active=false;state.nextAllowedAt=0;
    await chrome.storage.local.set({friendRunState:state,isRunning:false,friendStatus:"Đã dừng bởi người dùng",lastMessage:"Đã dừng bởi người dùng"});
    const tab=await getActiveTab();if(tab?.url?.includes("facebook.com"))chrome.tabs.sendMessage(tab.id,{action:"friendStop"});
    setRunning(false);updateCount();return;
  }
  const {cfg,tab:initialTab}=await buildFriendConfig();
  if(cfg.minDelay>cfg.maxDelay){statusEl.textContent="Delay Min phải nhỏ hơn hoặc bằng Max";return;}
  if(cfg.mode==="group-common"&&!cfg.groups.length){statusEl.textContent="Hãy tích chọn ít nhất một nhóm";return;}
  let tab=initialTab;
  if(!tab||!tab.url?.includes("facebook.com")){
    statusEl.textContent="Đang mở nguồn kết bạn trên Facebook...";
    const url=friendTargetUrl(cfg);
    if(tab)await chrome.tabs.update(tab.id,{url});else tab=await chrome.tabs.create({url});
    await new Promise(resolve=>setTimeout(resolve,4200));
    tab=await getActiveTab();
  }
  statusEl.textContent="Đang khởi động, lần đầu cũng chờ đủ delay...";
  const response=await sendFriendCommand(tab,{action:"friendStart",config:cfg});
  if(response?.ok){setRunning(true);updateCount();}
  else statusEl.textContent=response?.error||"Không bắt đầu được tính năng kết bạn";
});

scanBtn.addEventListener("click", async () => {
  const {cfg,tab}=await buildFriendConfig();
  if(cfg.mode==="group-common"&&!cfg.groups.length){statusEl.textContent="Hãy chọn ít nhất một nhóm để quét";return;}
  if(!tab?.url?.includes("facebook.com")){statusEl.textContent="Hãy mở Facebook trước khi quét thử";return;}
  statusEl.textContent="Đang quét đúng nguồn, không gửi lời mời...";
  const response=await sendFriendCommand(tab,{action:"friendScan",config:cfg});
  if(response?.needsNavigation&&response.targetUrl){
    await chrome.tabs.update(tab.id,{url:response.targetUrl});
    await chrome.storage.local.set({friendStatus:"Đã mở đúng nguồn. Chờ Facebook tải xong rồi bấm Quét thử lần nữa"});
    return;
  }
  if(response?.ok){statusEl.textContent=response.sourceReady===false?"Chưa tìm thấy đúng mục Thành viên có điểm chung":`Đã phát hiện ${response.count||0} hồ sơ phù hợp và đánh dấu màu xanh`;countEl.textContent=`${response.count||0} hồ sơ`;}
  else statusEl.textContent=response?.error||"Không quét được nguồn này";
});

friendOpenSuggestionsBtn.onclick=async()=>{const tab=await getActiveTab();if(tab)await chrome.tabs.update(tab.id,{url:"https://www.facebook.com/friends/suggestions"});};

loadFriendGroupsBtn.onclick=async()=>{
  let tab=await getActiveTab();if(!tab)return;
  statusEl.textContent="Đang tải đầy đủ danh sách nhóm đã tham gia...";
  if(!/facebook\.com\/groups\/joins/.test(tab.url||"")){
    await chrome.tabs.update(tab.id,{url:"https://www.facebook.com/groups/joins/?nav_source=tab"});
    await new Promise(resolve=>setTimeout(resolve,5000));
    tab=await getActiveTab();
  }
  const response=await sendFriendCommand(tab,{action:"scanJoinedGroups"});
  if(!response?.ok){statusEl.textContent=response?.error||"Không tải được danh sách nhóm";return;}
  const groups=response.groups||[];
  renderFriendGroups(groups,groups.map(g=>String(g.id)));
  await chrome.storage.local.set({joinedGroups:groups});
  await chrome.storage.sync.set({friendGroupIds:groups.map(g=>String(g.id))});
  statusEl.textContent=`Đã tải ${groups.length} nhóm; hãy bỏ tích những nhóm không cần`;
};

selectAllFriendGroupsBtn.onclick=()=>{
  const visible=[...friendGroupList.querySelectorAll('label[data-name]')].filter(row=>row.style.display!=="none");
  const boxes=visible.map(row=>row.querySelector(".friend-group-check")).filter(Boolean);
  const turnOn=boxes.some(box=>!box.checked);boxes.forEach(box=>box.checked=turnOn);saveConfig();
};
friendGroupKeyword.oninput=()=>{const key=friendGroupKeyword.value.trim().toLocaleLowerCase("vi");friendGroupList.querySelectorAll('label[data-name]').forEach(row=>row.style.display=!key||row.dataset.name.includes(key)?"flex":"none");};
friendGroupList.addEventListener("change",event=>{if(event.target.classList.contains("friend-group-check"))saveConfig();});

friendResetBtn.onclick=async()=>{
  const tab=await getActiveTab();
  if(tab?.url?.includes("facebook.com"))await sendFriendCommand(tab,{action:"friendReset"});
  else await chrome.storage.local.set({isRunning:false,sentCount:0,friendSkipped:0,friendUncertain:0,friendStatus:"Đã reset tiến trình kết bạn"});
  setRunning(false);updateCount();
};
friendClearHistoryBtn.onclick=async()=>{
  if(!confirm("Xóa toàn bộ lịch sử chống gửi trùng? Những hồ sơ cũ có thể xuất hiện lại."))return;
  await chrome.storage.local.remove("friendProfileHistory");
  statusEl.textContent="Đã xóa lịch sử chống trùng";
};

chrome.storage.onChanged.addListener(changes => {
  if (changes.sentCount) { const max = parseInt(maxReqEl.value) || 10; countEl.textContent = `${changes.sentCount.newValue} / ${max}`; }
  if (changes.isRunning) setRunning(changes.isRunning.newValue);
  if (changes.friendStatus) statusEl.textContent = changes.friendStatus.newValue;
  else if (changes.lastMessage) statusEl.textContent = changes.lastMessage.newValue;
  if(changes.friendSkipped)friendSkippedEl.textContent=changes.friendSkipped.newValue||0;
  if(changes.friendUncertain)friendUncertainEl.textContent=changes.friendUncertain.newValue||0;
  if (changes.scrapeCount) { $("scrapeCount").textContent = `${changes.scrapeCount.newValue} bai`; }
  if (changes.scrapeStatus) { $("scrapeStatus").textContent = changes.scrapeStatus.newValue; }
  if (changes.groupStatus) { $("groupStatus").textContent = changes.groupStatus.newValue; }
  if (changes.groupJoined !== undefined) { const t=parseInt($("groupTarget").value)||10; $("groupCount").textContent = `${changes.groupJoined.newValue} / ${t}`; }
  if (changes.groupFound !== undefined) { /* optional */ }
  if (changes.isGroupJoining !== undefined) setGroupRunning(changes.isGroupJoining.newValue);
});
loadConfig();
[minEl,maxEl,maxReqEl,friendMinMutual].forEach(el=>el.addEventListener("change",saveConfig));

// SCRAPE - khong tu tai, chon format moi tai
const scrapeBtn = $("scrapeBtn");
const stopScrapeBtn = $("stopScrapeBtn");
const scrapeNum = $("scrapeNum");
const scrapeStatus = $("scrapeStatus");
const scrapeCountEl = $("scrapeCount");
const downloadGroup = $("downloadGroup");
const dlMd = $("dlMd");
const dlJson = $("dlJson");
const dlTxt = $("dlTxt");
let isScraping = false;

function setScraping(v) {
  isScraping = v;
  scrapeBtn.textContent = v ? "⏳ Đang cào..." : "▶ Bắt đầu cào";
  scrapeBtn.classList.toggle("running", v);
  if (v) downloadGroup.classList.add("hidden");
}

function updateDownloadVisibility(ready) {
  if (ready) downloadGroup.classList.remove("hidden");
}

async function requestDownload(format) {
  let tab = await getActiveTab();
  if (!tab || !tab.url.includes("facebook.com")) {
    scrapeStatus.textContent = "Dang tu dong mo Facebook de tai...";
    if(tab) await chrome.tabs.update(tab.id, { url: "https://www.facebook.com/" });
    else tab = await chrome.tabs.create({ url: "https://www.facebook.com/" });
    await new Promise(r=>setTimeout(r,3000));
    tab = await getActiveTab();
  }
  chrome.tabs.sendMessage(tab.id, { action: "downloadScrape", format }, async res => {
    if (chrome.runtime.lastError) {
      const retry = await autoReloadAndRetry(tab.id, { action: "downloadScrape", format }, scrapeStatus);
      if(retry.ok && retry.res.ok) scrapeStatus.textContent = `Da tai ${retry.res.count} bai dang ${format.toUpperCase()}`;
      else scrapeStatus.textContent = "Chua co du lieu de tai, hay cao truoc";
      return;
    }
    if (res && res.ok) scrapeStatus.textContent = `Da tai ${res.count} bai dang ${format.toUpperCase()}`;
    else scrapeStatus.textContent = "Chua co du lieu de tai, hay cao truoc";
  });
}

scrapeBtn.addEventListener("click", async () => {
  let tab = await getActiveTab();
  if (!tab || !tab.url.includes("facebook.com")) {
    scrapeStatus.textContent = "Dang tu dong mo Facebook...";
    if(tab) await chrome.tabs.update(tab.id, { url: "https://www.facebook.com/" });
    else tab = await chrome.tabs.create({ url: "https://www.facebook.com/" });
    await new Promise(r=>setTimeout(r,3000));
    tab = await getActiveTab();
  }
  if (isScraping) return;
  const count = parseInt(scrapeNum.value) || 20;
  chrome.storage.sync.set({ scrapeNum: count });
  chrome.tabs.sendMessage(tab.id, { action: "startScrape", count }, async res => {
    if (chrome.runtime.lastError) {
      const retry = await autoReloadAndRetry(tab.id, { action: "startScrape", count }, scrapeStatus);
      if(retry.ok){ setScraping(true); scrapeStatus.textContent = `Dang cao ${count} bai... xong se cho chon dinh dang de tai`; }
      return;
    }
    if (res && res.ok) { setScraping(true); scrapeStatus.textContent = `Dang cao ${count} bai... xong se cho chon dinh dang de tai`; }
  });
});

stopScrapeBtn.addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (tab) chrome.tabs.sendMessage(tab.id, { action: "stopScrape" }, () => setScraping(false));
  setScraping(false);
  scrapeStatus.textContent = "Da dung";
});

dlMd.onclick = () => requestDownload("md");
dlJson.onclick = () => requestDownload("json");
dlTxt.onclick = () => requestDownload("txt");

const resetBtn = $("resetScrapeBtn");
resetBtn.onclick = async () => {
  const tab = await getActiveTab();
  if (!tab || !tab.url.includes("facebook.com")) { scrapeStatus.textContent = "Mo dung trang Facebook roi Reset"; return; }
  chrome.tabs.sendMessage(tab.id, { action: "resetScrape" }, res => {
    if (chrome.runtime.lastError) { scrapeStatus.textContent = "Reload trang va thu lai"; return; }
    scrapeCountEl.textContent = "0 bai";
    downloadGroup.classList.add("hidden");
    scrapeStatus.textContent = "Da reset - keo xuong dung nam 2021 roi cao tiep";
    setScraping(false);
  });
};

// load scrape config
chrome.storage.sync.get(["scrapeNum"], res => {
  if (res.scrapeNum) scrapeNum.value = res.scrapeNum;
});
chrome.storage.local.get(["scrapeCount", "scrapeStatus", "scrapeReady"], res => {
  if (res.scrapeCount !== undefined) scrapeCountEl.textContent = `${res.scrapeCount} bai`;
  if (res.scrapeStatus) scrapeStatus.textContent = res.scrapeStatus;
  if (res.scrapeReady) updateDownloadVisibility(true);
});
// khi scrape xong, reset nút
chrome.storage.onChanged.addListener(changes => {
  if (changes.scrapeStatus && changes.scrapeStatus.newValue && changes.scrapeStatus.newValue.startsWith("Xong!")) {
    setScraping(false);
  }
  if (changes.scrapeStatus && changes.scrapeStatus.newValue === "Da dung") setScraping(false);
  if (changes.scrapeReady) updateDownloadVisibility(changes.scrapeReady.newValue);
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
  const saveNow=()=>chrome.storage.sync.set({[storageKey]:field.value});
  const save=()=>{
    clearTimeout(timer);
    timer=setTimeout(saveNow,250);
  };
  field.addEventListener("input",save);
  field.addEventListener("change",()=>{clearTimeout(timer);saveNow();});
  field.addEventListener("blur",()=>{clearTimeout(timer);saveNow();});
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
  groupStartBtn.textContent = v ? "⏳ Đang tham gia..." : "▶ Tìm & Tham gia";
  groupStartBtn.classList.toggle("running", v);
}
groupStartBtn.onclick = async ()=>{
  const keyword = groupKeyword.value.trim();
  if(!keyword){ groupStatus.textContent="Nhap tu khoa truoc"; return; }
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
  if(cfg.minDelay > cfg.maxDelay){ groupStatus.textContent="Min delay phai <= Max delay"; return; }
  chrome.storage.sync.set({ groupKeyword:keyword, groupMinMembers:cfg.minMembers, groupMinPosts:cfg.minPostsPerDay, groupTarget:cfg.targetJoin, groupMinDelay:cfg.minDelay, groupMaxDelay:cfg.maxDelay, groupAnswers: answersText,groupAiAnswersEnabled:cfg.aiJoinEnabled,groupAiAnswersPrompt:cfg.aiJoinPrompt });
  let tab = await getActiveTab();
  if(!tab || !tab.url.includes("facebook.com")){
    groupStatus.textContent="Dang tu dong mo Facebook...";
    if(tab) await chrome.tabs.update(tab.id, { url: "https://www.facebook.com/search/groups/?q="+encodeURIComponent(keyword) });
    else tab = await chrome.tabs.create({ url: "https://www.facebook.com/search/groups/?q="+encodeURIComponent(keyword) });
    await new Promise(r=>setTimeout(r,4000));
    tab = await getActiveTab();
  }
  chrome.tabs.sendMessage(tab.id, { action:"startGroupJoin", ...cfg }, async res=>{
    if(chrome.runtime.lastError){
      const retry = await autoReloadAndRetry(tab.id, { action:"startGroupJoin", ...cfg }, groupStatus);
      if(retry.ok){ setGroupRunning(true); groupStatus.textContent=`Dang tim nhom "${keyword}"...`; }
      return;
    }
    if(res && res.ok){ setGroupRunning(true); groupStatus.textContent=`Dang tim nhom "${keyword}"...`;}
  });
};
groupStopBtn.onclick = async ()=>{
  const tab=await getActiveTab();
  if(tab) chrome.tabs.sendMessage(tab.id, {action:"stopGroupJoin"}, ()=>setGroupRunning(false));
  setGroupRunning(false);
};
groupResetBtn.onclick = async ()=>{
  const tab=await getActiveTab();
  if(tab) chrome.tabs.sendMessage(tab.id, {action:"resetGroupJoin"}, ()=>{
    groupCount.textContent="0 / "+(parseInt(groupTarget.value)||10);
    groupStatus.textContent="Da reset";
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
  discoverStartBtn.textContent = v ? "⏳ Đang tham gia..." : "🧭 Tham gia theo Khám phá";
  discoverStartBtn.classList.toggle("running", v);
}
discoverStartBtn.onclick = async ()=>{
  const aiSaved=await getUnifiedAiConfig();
  const cfg = {
    target: parseInt(discoverTarget.value)||10,
    minDelay: parseInt(discoverMinDelay.value)||5,
    maxDelay: parseInt(discoverMaxDelay.value)||15,
    answersText: discoverAnswers.value.trim(),aiJoinEnabled:groupAiAnswersEnabled.checked,aiJoinPrompt:groupAiAnswersPrompt.value.trim(),aiConfig:aiSaved
  };
  if(cfg.minDelay > cfg.maxDelay){ discoverStatus.textContent="Min delay phai <= Max"; return; }
  chrome.storage.sync.set({ discoverTarget:cfg.target, discoverMinDelay:cfg.minDelay, discoverMaxDelay:cfg.maxDelay, discoverAnswers: cfg.answersText });
  let tab = await getActiveTab();
  if(!tab || !tab.url.includes("facebook.com")){
    discoverStatus.textContent="Dang tu dong mo trang Kham pha...";
    if(tab) await chrome.tabs.update(tab.id, { url: "https://www.facebook.com/groups/discover" });
    else tab = await chrome.tabs.create({ url: "https://www.facebook.com/groups/discover" });
    await new Promise(r=>setTimeout(r,4000));
    tab = await getActiveTab();
  }
  chrome.tabs.sendMessage(tab.id, { action:"startDiscoverJoin", ...cfg }, async res=>{
    if(chrome.runtime.lastError){
      const retry = await autoReloadAndRetry(tab.id, { action:"startDiscoverJoin", ...cfg }, discoverStatus);
      if(retry.ok){ setDiscoverRunning(true); discoverStatus.textContent=`Dang tham gia ${cfg.target} nhom theo Kham pha...`; }
      return;
    }
    if(res && res.ok){ setDiscoverRunning(true); discoverStatus.textContent=`Dang tham gia ${cfg.target} nhom theo Kham pha...`; }
  });
};
discoverStopBtn.onclick = async ()=>{
  const tab=await getActiveTab();
  if(tab) chrome.tabs.sendMessage(tab.id, {action:"stopDiscoverJoin"}, ()=>setDiscoverRunning(false));
  setDiscoverRunning(false);
};
discoverResetBtn.onclick = async ()=>{
  const tab=await getActiveTab();
  if(tab) chrome.tabs.sendMessage(tab.id, {action:"resetDiscoverJoin"}, ()=>{
    discoverCount.textContent="0 / "+(parseInt(discoverTarget.value)||10);
    discoverStatus.textContent="Da reset";
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
function setFeedRunning(v){ isFeedInteracting=v; feedStartBtn.textContent=v?"⏳ Đang tương tác...":"▶ Bắt đầu tương tác bản tin"; feedStartBtn.classList.toggle("running",v); }
feedStartBtn.onclick = async ()=>{
  const cfg={ reaction: feedReaction.value, target: parseInt(feedTarget.value)||20, minDelay: parseInt(feedMinDelay.value)||3, maxDelay: parseInt(feedMaxDelay.value)||8 };
  if(cfg.minDelay>cfg.maxDelay){ feedStatus.textContent="Min delay phai <= Max"; return; }
  chrome.storage.sync.set({ feedReaction:cfg.reaction, feedTarget:cfg.target, feedMinDelay:cfg.minDelay, feedMaxDelay:cfg.maxDelay });
  let tab=await getActiveTab();
  if(!tab || !tab.url.includes("facebook.com")){
    feedStatus.textContent="Dang tu dong mo ban tin...";
    if(tab) await chrome.tabs.update(tab.id, { url: "https://www.facebook.com/" });
    else tab = await chrome.tabs.create({ url: "https://www.facebook.com/" });
    await new Promise(r=>setTimeout(r,4000));
    tab = await getActiveTab();
  }
  chrome.tabs.sendMessage(tab.id, {action:"startFeedInteract", ...cfg}, async res=>{
    if(chrome.runtime.lastError){
      const retry = await autoReloadAndRetry(tab.id, {action:"startFeedInteract", ...cfg}, feedStatus);
      if(retry.ok){ setFeedRunning(true); feedStatus.textContent=`Dang tuong tac ${cfg.reaction} ${cfg.target} bai...`; }
      return;
    }
    if(res&&res.ok){ setFeedRunning(true); feedStatus.textContent=`Dang tuong tac ${cfg.reaction} ${cfg.target} bai...`; }
  });
};
feedStopBtn.onclick = async ()=>{ const tab=await getActiveTab(); if(tab) chrome.tabs.sendMessage(tab.id,{action:"stopFeedInteract"},()=>setFeedRunning(false)); setFeedRunning(false); };
feedResetBtn.onclick = async ()=>{ const tab=await getActiveTab(); if(tab) chrome.tabs.sendMessage(tab.id,{action:"resetFeedInteract"},()=>{ feedCountEl.textContent="0 / "+(parseInt(feedTarget.value)||20); feedStatus.textContent="Da reset"; setFeedRunning(false); }); };
const feedScanBtn = $("feedScanBtn");
feedScanBtn.onclick = async ()=>{
  const tab=await getActiveTab();
  if(!tab || !tab.url.includes("facebook.com")){ feedStatus.textContent="Hay mo facebook.com truoc"; return; }
  chrome.tabs.sendMessage(tab.id, {action:"scanFeedLikes"}, res=>{
    if(chrome.runtime.lastError){ feedStatus.textContent="Reload trang va thu lai"; return; }
    feedStatus.textContent=`Quet thay ${res.count} nut Like bai goc (vien xanh), comment like vien do - mo Console xem chi tiet`;
    feedCountEl.textContent=`${res.count} nut`;
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
const groupInteractMinDelay=$("groupInteractMinDelay"), groupInteractMaxDelay=$("groupInteractMaxDelay");
const groupInteractStartBtn=$("groupInteractStartBtn"), groupInteractStopBtn=$("groupInteractStopBtn");
const groupInteractStatus=$("groupInteractStatus"), groupInteractCount=$("groupInteractCount");
let joinedGroups=[];
function renderJoinedGroups(groups,selectedIds=[]){
  joinedGroups=groups||[];
  if(!joinedGroups.length){ joinedGroupList.innerHTML='<div class="hint" style="padding:6px">Không tìm thấy nhóm. Hãy thử tải lại.</div>'; return; }
  const selected=new Set(selectedIds);
  joinedGroupList.innerHTML=joinedGroups.map(g=>`<label data-group-name="${g.name.toLowerCase().replace(/[<>&"]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[c]))}" style="display:flex;align-items:center;gap:7px;padding:5px;margin:0;border-bottom:1px solid #eee;cursor:pointer"><input class="joined-group-check" type="checkbox" value="${g.id}" ${selected.has(g.id)?"checked":""} style="width:auto"><img src="${g.icon||"icon128.png"}" style="width:30px;height:30px;border-radius:50%;object-fit:cover"><span style="font-size:12px;line-height:1.2">${g.name.replace(/[<>&"]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[c]))}</span></label>`).join("");
}
loadJoinedGroupsBtn.onclick=async()=>{
  groupInteractStatus.textContent="Đang mở trang nhóm và tải danh sách...";
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
    groupInteractStatus.textContent=`Đã tải ${groups.length} nhóm đã tham gia`;
  }
};
selectAllGroupsBtn.onclick=()=>{
  const boxes=[...joinedGroupList.querySelectorAll('.joined-group-check')];
  const shouldCheck=boxes.some(b=>!b.checked); boxes.forEach(b=>b.checked=shouldCheck);
  selectAllGroupsBtn.textContent=shouldCheck?"☐ Bỏ chọn tất cả":"☑ Chọn tất cả";
};
selectKeywordGroupsBtn.onclick=()=>{
  const keys=groupInteractKeyword.value.toLowerCase().split(",").map(s=>s.trim()).filter(Boolean);
  if(!keys.length){groupInteractStatus.textContent="Hãy nhập ít nhất 1 từ khóa";return;}
  let matched=0;
  joinedGroupList.querySelectorAll('label[data-group-name]').forEach(row=>{
    const ok=keys.some(k=>row.dataset.groupName.includes(k));
    row.style.display=ok?"flex":"none";
    const box=row.querySelector('.joined-group-check'); box.checked=ok;
    if(ok)matched++;
  });
  groupInteractStatus.textContent=`Đã chọn ${matched} nhóm khớp từ khóa: ${keys.join(", ")}`;
};
groupInteractKeyword.addEventListener("input",()=>{if(!groupInteractKeyword.value.trim())joinedGroupList.querySelectorAll('label[data-group-name]').forEach(row=>row.style.display="flex");});
groupInteractStartBtn.onclick=async()=>{
  const ids=[...joinedGroupList.querySelectorAll('.joined-group-check:checked')].map(b=>b.value);
  const groups=joinedGroups.filter(g=>ids.includes(g.id));
  const cfg={groups,perGroup:parseInt(groupInteractTarget.value)||5,minDelay:parseInt(groupInteractMinDelay.value)||5,maxDelay:parseInt(groupInteractMaxDelay.value)||12,reaction:groupInteractReaction.value};
  if(!groups.length){groupInteractStatus.textContent="Hãy tích chọn ít nhất 1 nhóm";return;}
  if(cfg.minDelay>cfg.maxDelay){groupInteractStatus.textContent="Delay Min phải nhỏ hơn hoặc bằng Max";return;}
  chrome.storage.sync.set({groupInteractPerGroup:cfg.perGroup,groupInteractMinDelay:cfg.minDelay,groupInteractMaxDelay:cfg.maxDelay,groupInteractReaction:cfg.reaction});
  const tab=await getActiveTab(); if(!tab)return;
  chrome.tabs.sendMessage(tab.id,{action:"startGroupInteract",...cfg},async res=>{
    if(chrome.runtime.lastError){
      const retry=await autoReloadAndRetry(tab.id,{action:"startGroupInteract",...cfg},groupInteractStatus);
      if(!retry.ok)return;
    }
    groupInteractStatus.textContent=`Đang tương tác ${groups.length} nhóm...`;
  });
};
groupInteractStopBtn.onclick=async()=>{const tab=await getActiveTab();if(tab)chrome.tabs.sendMessage(tab.id,{action:"stopGroupInteract"});chrome.storage.local.set({groupInteractActive:false,groupInteractStatus:"Đã dừng"});};
chrome.storage.local.get(["joinedGroups","groupInteractStatus","groupInteractDone","groupInteractTotal"],r=>{if(r.joinedGroups)renderJoinedGroups(r.joinedGroups);if(r.groupInteractStatus)groupInteractStatus.textContent=r.groupInteractStatus;if(r.groupInteractDone!==undefined)groupInteractCount.textContent=`${r.groupInteractDone} / ${r.groupInteractTotal||0}`;});
chrome.storage.sync.get(["groupInteractPerGroup","groupInteractMinDelay","groupInteractMaxDelay","groupInteractReaction"],r=>{if(r.groupInteractPerGroup)groupInteractTarget.value=r.groupInteractPerGroup;if(r.groupInteractMinDelay)groupInteractMinDelay.value=r.groupInteractMinDelay;if(r.groupInteractMaxDelay)groupInteractMaxDelay.value=r.groupInteractMaxDelay;if(r.groupInteractReaction)groupInteractReaction.value=r.groupInteractReaction;});
chrome.storage.onChanged.addListener(c=>{if(c.groupInteractStatus)groupInteractStatus.textContent=c.groupInteractStatus.newValue;if(c.groupInteractDone||c.groupInteractTotal)chrome.storage.local.get(["groupInteractDone","groupInteractTotal"],r=>groupInteractCount.textContent=`${r.groupInteractDone||0} / ${r.groupInteractTotal||0}`);});

// DANG BAI AI LEN NHOM
const groupPostList=$("groupPostList"),loadPostGroupsBtn=$("loadPostGroupsBtn"),selectAllPostGroupsBtn=$("selectAllPostGroupsBtn");
const groupPostKeyword=$("groupPostKeyword"),groupPostPrompt=$("groupPostPrompt");
const groupPostStartBtn=$("groupPostStartBtn"),groupPostStopBtn=$("groupPostStopBtn"),groupPostStatus=$("groupPostStatus"),groupPostCount=$("groupPostCount");
const groupPostAiProvider=$("groupPostAiProvider"),groupPostAiKey=$("groupPostAiKey"),groupPostAiModel=$("groupPostAiModel"),groupPostAiCustomModel=$("groupPostAiCustomModel"),groupPostAiUrl=$("groupPostAiUrl"),groupPostAiTestBtn=$("groupPostAiTestBtn");
const groupPostBackgroundEnabled=$("groupPostBackgroundEnabled"),groupPostBackgroundOptions=$("groupPostBackgroundOptions"),groupPostBackgroundMode=$("groupPostBackgroundMode"),groupPostFixedColorWrap=$("groupPostFixedColorWrap"),groupPostFixedColor=$("groupPostFixedColor"),groupPostMaxChars=$("groupPostMaxChars");
const groupPostPreviewBtn=$("groupPostPreviewBtn"),groupPostPreview=$("groupPostPreview");
const GROUP_POST_PREVIEW_COLORS={pink:"#e91e63",green:"#2e7d32",red:"#d32f2f",orange:"#ef6c00",yellow:"#f9a825",blue:"#1976d2",purple:"#7b1fa2",burgundy:"#8e244d",beige:"#b9a07e",brown:"#6d4c41",gray:"#78909c",black:"#263238"};
const GROUP_POST_AUTO_TIMING=Object.freeze({minDelay:25,maxDelay:45});
let postGroups=[];
bindPromptPersistence("groupPostPrompt",groupPostPrompt);
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
  if(!postGroups.length){groupPostList.innerHTML='<div class="hint" style="padding:6px">Chưa có danh sách nhóm</div>';return;}
  const esc=s=>String(s||"").replace(/[<>&"]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[c]));
  groupPostList.innerHTML=postGroups.map(g=>`<label data-key="${esc(groupPostKey(g))}" data-name="${esc(String(g.name||"").toLocaleLowerCase("vi"))}" style="display:flex;align-items:center;gap:7px;padding:5px;margin:0;border-bottom:1px solid #eee"><input class="post-group-check" type="checkbox" value="${esc(groupPostKey(g))}" style="width:auto"><img src="${esc(g.icon||"icon128.png")}" style="width:30px;height:30px;border-radius:50%;object-fit:cover"><span style="font-size:12px">${esc(g.name)}</span></label>`).join("");
}
loadPostGroupsBtn.onclick=async()=>{
  let tab=await getActiveTab();if(!tab)return;
  groupPostStatus.textContent="Đang tải đầy đủ danh sách nhóm...";
  if(!/facebook\.com\/groups\/joins/.test(tab.url||"")){await chrome.tabs.update(tab.id,{url:"https://www.facebook.com/groups/joins/?nav_source=tab"});await new Promise(r=>setTimeout(r,5000));}
  const retry=await autoReloadAndRetry(tab.id,{action:"scanJoinedGroups"},groupPostStatus);
  const groups=retry.res?.groups||[];renderPostGroups(groups);chrome.storage.local.set({joinedGroups:groups});
  groupPostStatus.textContent=`Đã tải ${groups.length} nhóm`;
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
function renderGroupPostModels(provider,saved=""){const models=providerModels[provider]||[];groupPostAiModel.innerHTML=models.map(m=>`<option value="${m}">${m}</option>`).join("")+`<option value="__custom__">✏️ Model tùy chỉnh...</option>`;if(saved&&models.includes(saved)){groupPostAiModel.value=saved;groupPostAiCustomModel.classList.add("hidden");}else if(saved){groupPostAiModel.value="__custom__";groupPostAiCustomModel.value=saved;groupPostAiCustomModel.classList.remove("hidden");}else{groupPostAiModel.value=models.length?models[0]:"__custom__";groupPostAiCustomModel.classList.toggle("hidden",!!models.length);}}
async function refreshUnifiedAiUi(){const c=await getUnifiedAiConfig();groupPostAiProvider.value=c.provider;groupPostAiKey.value=c.key;groupPostAiUrl.value=c.url;renderGroupPostModels(c.provider,c.model);if(typeof aiProvider!=="undefined"){aiProvider.value=c.provider;aiApiKey.value=c.key;aiCustomUrl.value=c.url;renderAiModels(c.provider,c.model);}}
groupPostAiProvider.onchange=async()=>{const c=await getUnifiedAiConfig(groupPostAiProvider.value);groupPostAiKey.value=c.key;groupPostAiUrl.value=c.url;renderGroupPostModels(c.provider,c.model);};
groupPostAiModel.onchange=()=>groupPostAiCustomModel.classList.toggle("hidden",groupPostAiModel.value!=="__custom__");
async function saveGroupAiDraft(){groupPostAiKey.value=cleanPastedApiKey(groupPostAiKey.value);await persistUnifiedAiConfig({provider:groupPostAiProvider.value,key:groupPostAiKey.value,model:selectedGroupPostModel(),url:groupPostAiUrl.value.trim()});}
[groupPostAiKey,groupPostAiUrl,groupPostAiCustomModel].forEach(el=>el.addEventListener("change",saveGroupAiDraft));
groupPostAiModel.addEventListener("change",()=>{if(groupPostAiModel.value!=="__custom__")saveGroupAiDraft();});
groupPostPreviewBtn.onclick=async()=>{
  const group=selectedPostGroups()[0];
  if(!group){groupPostStatus.textContent="Hãy tích chọn ít nhất một nhóm để tạo thử";return;}
  const prompt=groupPostPrompt.value.trim(),background=readGroupPostBackgroundConfig();
  groupPostAiKey.value=cleanPastedApiKey(groupPostAiKey.value);
  const aiConfig={provider:groupPostAiProvider.value,key:groupPostAiKey.value,model:selectedGroupPostModel(),url:groupPostAiUrl.value.trim()};
  if(!aiConfig.key||!aiConfig.model){groupPostStatus.textContent="Hãy nhập API Key và chọn Model trước khi tạo thử";return;}
  if(!prompt.includes("{groupName}")){groupPostStatus.textContent="Prompt phải có {groupName}";return;}
  if(background.enabled&&background.mode==="random"&&!background.colors.length){groupPostStatus.textContent="Hãy chọn ít nhất một màu cho chế độ Random";return;}
  await persistUnifiedAiConfig(aiConfig);groupPostPreviewBtn.disabled=true;groupPostStatus.textContent=`AI đang tạo thử cho: ${group.name}`;
  try{
    const ai=await chrome.runtime.sendMessage({action:"aiGenerateGroupPost",groupName:group.name,prompt,aiConfig,background});
    if(!ai?.ok)throw new Error(ai?.error||"AI không tạo được bài");
    const color=background.enabled?(background.mode==="fixed"?background.fixedColor:background.colors[Math.floor(Math.random()*background.colors.length)]):"plain";
    groupPostPreview.textContent=ai.content;
    groupPostPreview.style.background=color==="plain"?"#f0f2f5":GROUP_POST_PREVIEW_COLORS[color];
    groupPostPreview.style.color=color==="plain"?"#050505":"#fff";
    groupPostPreview.classList.remove("hidden");
    groupPostStatus.textContent=`Bản thử ${ai.content.length}/${background.enabled?background.maxChars:"1800"} ký tự — chưa đăng lên Facebook`;
  }catch(e){groupPostStatus.textContent=`Lỗi tạo thử: ${e.message}`;}
  finally{groupPostPreviewBtn.disabled=false;}
};
groupPostStartBtn.onclick=async()=>{
  const groups=selectedPostGroups();
  const prompt=groupPostPrompt.value.trim(),minDelay=GROUP_POST_AUTO_TIMING.minDelay,maxDelay=GROUP_POST_AUTO_TIMING.maxDelay,background=readGroupPostBackgroundConfig();
  if(!groups.length){groupPostStatus.textContent="Hãy chọn ít nhất 1 nhóm";return;}
  groupPostAiKey.value=cleanPastedApiKey(groupPostAiKey.value);const aiConfig={provider:groupPostAiProvider.value,key:groupPostAiKey.value,model:selectedGroupPostModel(),url:groupPostAiUrl.value.trim()};
  if(!aiConfig.key){groupPostStatus.textContent="Hãy nhập API Key đăng nhóm";return;}
  if(!aiConfig.model){groupPostStatus.textContent="Hãy nhập Model đăng nhóm";return;}
  if(!prompt.includes("{groupName}")){groupPostStatus.textContent="Prompt phải có {groupName}";return;}
  await persistUnifiedAiConfig(aiConfig);const cfg={groups,prompt,minDelay,maxDelay,aiConfig,background};await chrome.storage.sync.set({groupPostPrompt:prompt,groupPostBackgroundEnabled:background.enabled,groupPostBackgroundMode:background.mode,groupPostFixedColor:background.fixedColor,groupPostBackgroundColors:background.colors,groupPostMaxChars:background.maxChars,groupPostBackgroundFallback:"skip"});
  const tab=await getActiveTab();if(!tab)return;
  chrome.tabs.sendMessage(tab.id,{action:"startGroupPost",...cfg},async res=>{if(chrome.runtime.lastError)await autoReloadAndRetry(tab.id,{action:"startGroupPost",...cfg},groupPostStatus);groupPostStatus.textContent=`Đang đăng lên ${groups.length} nhóm...`;});
};
groupPostStopBtn.onclick=async()=>{await chrome.storage.local.set({groupPostActive:false,groupPostNextAt:0,groupPostStatus:"Đã dừng đăng nhóm"});const tab=await getActiveTab();if(tab)chrome.tabs.sendMessage(tab.id,{action:"stopGroupPost"});};
chrome.storage.local.get(["joinedGroups","groupPostStatus","groupPostDone","groupPostSkipped","groupPostTotal"],r=>{if(r.joinedGroups)renderPostGroups(r.joinedGroups);if(r.groupPostStatus)groupPostStatus.textContent=r.groupPostStatus;groupPostCount.textContent=`${r.groupPostDone||0} / ${r.groupPostTotal||0} (bỏ qua ${r.groupPostSkipped||0})`;});
chrome.storage.sync.get(["groupPostPrompt","groupPostBackgroundEnabled","groupPostBackgroundMode","groupPostFixedColor","groupPostBackgroundColors","groupPostMaxChars"],async r=>{if(r.groupPostPrompt!==undefined)groupPostPrompt.value=r.groupPostPrompt;groupPostBackgroundEnabled.checked=r.groupPostBackgroundEnabled!==false;if(r.groupPostBackgroundMode)groupPostBackgroundMode.value=r.groupPostBackgroundMode==="fixed"?"fixed":"random";if(r.groupPostFixedColor&&GROUP_POST_PREVIEW_COLORS[r.groupPostFixedColor])groupPostFixedColor.value=r.groupPostFixedColor;if(Array.isArray(r.groupPostBackgroundColors)){document.querySelectorAll('.group-post-bg-color').forEach(el=>el.checked=r.groupPostBackgroundColors.includes(el.value));}if(r.groupPostMaxChars)groupPostMaxChars.value=r.groupPostMaxChars;toggleGroupPostBackgroundOptions();const c=await getUnifiedAiConfig();groupPostAiProvider.value=c.provider;groupPostAiKey.value=c.key;renderGroupPostModels(c.provider,c.model==="gemini-3.6-flash"?"gemini-flash-lite-latest":c.model);groupPostAiUrl.value=c.url;});
chrome.storage.onChanged.addListener(c=>{if(c.groupPostStatus)groupPostStatus.textContent=c.groupPostStatus.newValue;if(c.groupPostDone||c.groupPostSkipped||c.groupPostTotal)chrome.storage.local.get(["groupPostDone","groupPostSkipped","groupPostTotal"],r=>groupPostCount.textContent=`${r.groupPostDone||0} / ${r.groupPostTotal||0} (bỏ qua ${r.groupPostSkipped||0})`);});

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
  openai: "OpenAI: key sk-... , model gpt-4o-mini / gpt-3.5-turbo. Lay key tai platform.openai.com/api-keys",
  gemini: "Gemini AI Studio: dùng Interactions API mới. Free Tier khuyên chọn gemini-flash-lite-latest.",
  claude: "Claude: key sk-ant-... . Lay key tai console.anthropic.com",
  groq: "Groq: key gsk_... , model llama-3.1-8b-instant. Lay key tai console.groq.com",
  openrouter: "OpenRouter: key sk-or-... , model openai/gpt-4o-mini. Lay key tai openrouter.ai/keys",
  deepseek: "DeepSeek: key sk-... , model deepseek-chat. Lay key tai platform.deepseek.com",
  mistral: "Mistral: key ... , model mistral-small-latest. Lay key tai console.mistral.ai",
  custom: "Custom: dien URL OpenAI-compatible (https://api.xxx.com/v1/chat/completions) + key + model tuong ung"
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
  aiModel.innerHTML=models.map(m=>`<option value="${m}">${m}</option>`).join("")+`<option value="__custom__">✏️ Model tùy chỉnh...</option>`;
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
  if(!aiConfig.key){statusEl.textContent="Chưa nhập API Key";return;}
  if(!aiConfig.model){statusEl.textContent="Chưa chọn Model";return;}
  if(aiConfig.provider==="custom"&&!aiConfig.url){statusEl.textContent="Chưa nhập Custom URL";return;}
  const old=button.textContent;button.disabled=true;button.textContent="⏳ Đang kiểm tra API...";statusEl.textContent="Đang gửi yêu cầu kiểm tra...";
  try{const res=await chrome.runtime.sendMessage({action:"aiTest",aiConfig});statusEl.textContent=res?.ok?`✅ API hoạt động — ${res.result}`:`❌ Test thất bại: ${res?.error||"Không có phản hồi"}`;}
  catch(e){statusEl.textContent=`❌ Test thất bại: ${e.message}`;}
  finally{button.disabled=false;button.textContent=old;}
}
groupPostAiTestBtn.onclick=async()=>{groupPostAiKey.value=cleanPastedApiKey(groupPostAiKey.value);const aiConfig=await persistUnifiedAiConfig({provider:groupPostAiProvider.value,key:groupPostAiKey.value,model:selectedGroupPostModel(),url:groupPostAiUrl.value.trim()});await testAiConnection(aiConfig,groupPostStatus,groupPostAiTestBtn);};
aiTestBtn.onclick=async()=>{await saveAiKeys();await testAiConnection({provider:aiProvider.value,key:aiApiKey.value.trim(),model:selectedAiModel(),url:aiCustomUrl.value.trim()},aiStatus,aiTestBtn);};
[aiApiKey, aiCustomUrl, aiCustomModel].forEach(el=> el.addEventListener("change", saveAiKeys));
aiModel.addEventListener("change",()=>{aiCustomModel.classList.toggle("hidden",aiModel.value!=="__custom__");if(aiModel.value!=="__custom__")saveAiKeys();});
bindPromptPersistence("aiPrompt",aiPrompt);
let isAICommenting=false;
function setAIRunning(v){ isAICommenting=v; aiStartBtn.textContent=v?"⏳ Đang AI comment...":"🤖 Bắt đầu AI comment"; aiStartBtn.classList.toggle("running",v); }
aiStartBtn.onclick = async ()=>{
  await saveAiKeys();
  const prompt = aiPrompt.value.trim();
  if(!prompt.includes("{postText}")){ aiStatus.textContent="Prompt phai chua {postText}"; return; }
  const apiKey = aiApiKey.value.trim();
  if(!apiKey){ aiStatus.textContent="Nhap API Key cho "+aiProvider.value; return; }
  if(!selectedAiModel()){ aiStatus.textContent="Hãy chọn hoặc nhập Model"; return; }
  const cfg={ target: parseInt(aiTarget.value)||10, minDelay: parseInt(aiMinDelay.value)||10, maxDelay: parseInt(aiMaxDelay.value)||20,economyMode:aiEconomyMode.value,batchSize:Math.max(2,parseInt(aiBatchSize.value)||5),cacheDays:Math.max(0,parseInt(aiCacheDays.value)||7) };
  if(cfg.minDelay>cfg.maxDelay){ aiStatus.textContent="Min delay phai <= Max"; return; }
  chrome.storage.sync.set({ aiTarget:cfg.target, aiMinDelay:cfg.minDelay, aiMaxDelay:cfg.maxDelay,aiEconomyMode:cfg.economyMode,aiBatchSize:cfg.batchSize,aiCacheDays:cfg.cacheDays });
  let tab=await getActiveTab();
  const noFeedPage=!tab || !tab.url?.includes("facebook.com") || /facebook\.com\/groups\/(joins|feed|discover)(\/|\?|$)/.test(tab.url);
  if(noFeedPage){
    aiStatus.textContent="Dang tu dong mo ban tin de AI comment...";
    if(tab) await chrome.tabs.update(tab.id, { url: "https://www.facebook.com/" });
    else tab = await chrome.tabs.create({ url: "https://www.facebook.com/" });
    await new Promise(r=>setTimeout(r,4000));
    tab = await getActiveTab();
  }
  chrome.tabs.sendMessage(tab.id, {action:"startAIComment", ...cfg}, async res=>{
    if(chrome.runtime.lastError){
      const retry = await autoReloadAndRetry(tab.id, {action:"startAIComment", ...cfg}, aiStatus);
      if(retry.ok){ setAIRunning(true); aiStatus.textContent=`Dang AI comment ${cfg.target} bai...`; }
      else aiStatus.textContent=retry.res?.error||"Loi";
      return;
    }
    if(res&&res.ok){ setAIRunning(true); aiStatus.textContent=`Dang AI comment ${cfg.target} bai...`; }
    else aiStatus.textContent=res?.error||"Loi";
  });
};
aiStopBtn.onclick = async ()=>{ const tab=await getActiveTab(); if(tab) chrome.tabs.sendMessage(tab.id,{action:"stopAIComment"},()=>setAIRunning(false)); setAIRunning(false); };
aiResetBtn.onclick = async ()=>{ const tab=await getActiveTab(); if(tab) chrome.tabs.sendMessage(tab.id,{action:"resetAIComment"},()=>{ aiCountEl.textContent="0 / "+(parseInt(aiTarget.value)||10); aiStatus.textContent="Da reset"; setAIRunning(false); }); };
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
