const {test}=require("node:test");
const assert=require("node:assert/strict");
const vm=require("node:vm");
const fs=require("node:fs");
const source=fs.readFileSync(require("node:path").join(__dirname,"../content.js"),"utf8");
function fn(name){
  const start=source.search(new RegExp("  (?:async )?function "+name+"\\("));
  assert.notEqual(start,-1);
  const tail=source.slice(start);
  const end=tail.slice(1).search(/\n  (?:async )?function /);
  return end<0?tail:tail.slice(0,end+1);
}
function selectors(){
  const scope={
    fofProfileLinks:n=>n.links||[],profileKeyFromHref:h=>h,
    lower:s=>s.toLowerCase(),buttonLabel:b=>b.label,
    isPendingFriendLabel:s=>/^(cancel request|request sent|hủy lời mời)$/.test(s),
    isExactAddFriendButton:b=>b.label==="Add friend"&&b.isConnected
  };
  vm.createContext(scope);
  vm.runInContext(["fofStreamCard","fofStreamRelationship","fofStreamButton"].map(fn).join("\n"),scope);
  return scope;
}
function card(key,label){
  const button={label,isConnected:true};
  const node={links:[],parentElement:null,querySelector:()=>button,querySelectorAll:()=>[button],closest:()=>null};
  const link={href:key,parentElement:node};node.links=[link];
  return {node,link,button};
}
test("pending neighbour cannot supply success proof or a button for another profile",()=>{
  const s=selectors(),a=card("a","Add friend"),b=card("b","Cancel request");
  const root={links:[a.link,b.link]};
  a.node.parentElement=root;b.node.parentElement=root;
  assert.equal(s.fofStreamButton(root,"a"),a.button);
  assert.equal(s.fofStreamButton(root,"b"),null);
  assert.equal(s.fofStreamRelationship(s.fofStreamCard(root,"a")),false);
  assert.equal(s.fofStreamRelationship(s.fofStreamCard(root,"b")),true);
});
test("ambiguous multi-profile ancestor is rejected",()=>{
  const s=selectors(),a=card("a","Add friend"),b=card("b","Cancel request");
  a.node.links.push(b.link);
  assert.equal(s.fofStreamCard({links:[a.link,b.link]},"a"),null);
});
function attempt(options={}){
  let history={},clicks=0,reads=0,lookups=0;
  const events=[];
  const button={isConnected:true,scrollIntoView(){},click(){clicks++;events.push("click");}};
  const scope={
    fofStreamButton:()=> (++lookups===2&&options.changed)?null:button,
    fofFriendsListRoot:()=>({}),fofStreamWait:async()=>true,
    loadFoFHistory:async()=>options.existing?{a:{status:"confirmed"}}:history,
    saveFoFHistory:async h=>{history=h;events.push("guard");},
    publishFoFSendState:async()=>{},
    readFoFSendState:async()=>{reads++;return options.stopped?null:{};},
    fofSendRestriction:()=>"",fofSourceFriendsPageMatches:()=>true,
    fofFriendsViewRestricted:()=>false,document:{querySelectorAll:()=>[]},
    isVisible:()=>true,isExactAddFriendButton:()=>true,
    fofStreamCard:()=>({}),fofStreamRelationship:()=>true,t:k=>k,
    Date
  };
  vm.createContext(scope);vm.runInContext(fn("fofStreamAttempt"),scope);
  return {run:()=>scope.fofStreamAttempt({key:"a",name:"Test"},{},"run"),
    get:()=>({history,clicks,events,reads})};
}
test("write-ahead history precedes the only click and exact card proof confirms",async()=>{
  const s=attempt();assert.equal(await s.run(),"confirmed");
  assert.deepEqual(s.get().events,["guard","click"]);
  assert.equal(s.get().clicks,1);
  assert.equal(s.get().history.a.status,"uncertain");
});
test("a previous send is never clicked again",async()=>{
  const s=attempt({existing:true});assert.equal(await s.run(),"skipped");assert.equal(s.get().clicks,0);
});
test("Stop after durable guard prevents dispatch",async()=>{
  const s=attempt({stopped:true});assert.equal(await s.run(),"stopped");assert.equal(s.get().clicks,0);
  assert.equal(s.get().history.a.status,"uncertain");
});
test("rerender to Cancel Request between delay and dispatch cannot be clicked",async()=>{
  const s=attempt({changed:true});assert.equal(await s.run(),"uncertain");assert.equal(s.get().clicks,0);
});
test("FoF history retains old uncertain entries and entries above legacy cap",async()=>{
  const history=Object.fromEntries(Array.from({length:2501},(_,i)=>["p"+i,{status:"uncertain",time:1}]));
  let saved;
  const scope={chrome:{storage:{local:{get:async()=>({friendFoFHistory:history}),set:async v=>{saved=v;}}}}};
  vm.createContext(scope);vm.runInContext(fn("loadFoFHistory")+"\n"+fn("saveFoFHistory"),scope);
  const loaded=await scope.loadFoFHistory();await scope.saveFoFHistory(loaded);
  assert.equal(Object.keys(saved.friendFoFHistory).length,2501);
});
test("navigation resume re-enters the active owner-tab run after SPA route change",async()=>{
  let timerCallback=null,started=0;
  const scope={
    fofSendResumeTimer:0,fofSendStopRequested:false,fofSendLoopActive:false,
    chrome:{storage:{local:{get:async()=>({friendFoFRunState:{active:true,runId:"run-1",ownerTabId:7},friendFoFActive:true})}}},
    ownTabId:async()=>7,friendFoFSendLoop:()=>{started++;},
    setTimeout:callback=>{timerCallback=callback;return 1;},clearTimeout:()=>{},console
  };
  vm.createContext(scope);vm.runInContext(fn("scheduleFoFSendResume"),scope);
  scope.scheduleFoFSendResume("run-1",0);
  assert.equal(typeof timerCallback,"function");
  await timerCallback();
  assert.equal(started,1);
});
test("navigation resume does not cross owner tabs",async()=>{
  let timerCallback=null,started=0;
  const scope={
    fofSendResumeTimer:0,fofSendStopRequested:false,fofSendLoopActive:false,
    chrome:{storage:{local:{get:async()=>({friendFoFRunState:{active:true,runId:"run-1",ownerTabId:8},friendFoFActive:true})}}},
    ownTabId:async()=>7,friendFoFSendLoop:()=>{started++;},
    setTimeout:callback=>{timerCallback=callback;return 1;},clearTimeout:()=>{},console
  };
  vm.createContext(scope);vm.runInContext(fn("scheduleFoFSendResume"),scope);
  scope.scheduleFoFSendResume("run-1",0);
  await timerCallback();
  assert.equal(started,0);
});
