// background.js - xu ly goi da API AI de tao comment
try { importScripts("i18n.js", "pageStore.js"); } catch (_) { }
const AI_DEFAULTS = {
  openai: { url: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini" },
  gemini: { url: "https://generativelanguage.googleapis.com/v1beta/interactions", model: "gemini-flash-lite-latest" },
  Muse: { url: "https://api.anthropic.com/v1/messages", model: "claude-3-haiku-20240307" },
  groq: { url: "https://api.groq.com/openai/v1/chat/completions", model: "llama-3.1-8b-instant" },
  openrouter: { url: "https://openrouter.ai/api/v1/chat/completions", model: "openai/gpt-4o-mini" },
  deepseek: { url: "https://api.deepseek.com/v1/chat/completions", model: "deepseek-chat" },
  mistral: { url: "https://api.mistral.ai/v1/chat/completions", model: "mistral-small-latest" },
  custom: { url: "", model: "" }
};

function normalizeApiKey(value){
  return String(value||"").trim().replace(/^GEMINI_API_KEY\s*=\s*/i,"").replace(/^['"]|['"]$/g,"").trim();
}
function friendlyAiError(error,provider){
  const raw=String(error?.message||error||t("bg.errApi"));
  if(/API_KEY_INVALID|API key not valid/i.test(raw))return t("bg.errKeyInvalid",{provider:provider});
  if(/PERMISSION_DENIED/i.test(raw))return t("bg.errPermDenied",{provider:provider});
  return raw;
}

// Ký tự thay thế U+FFFD (AI đôi khi sinh ra) và surrogate lẻ (do cắt chuỗi
// giữa cặp emoji) hiện thành ký tự lỗi và khiến Facebook từ chối bài. Cắt chuỗi
// luôn theo code-point, không bao giờ theo UTF-16 unit.
function sanitizePostedText(value){
  return String(value||"")
    .replace(/\uFFFD/g,"")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g,"")
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,"");
}
function sliceByCodePoints(value,max){
  const chars=[...String(value||"")];
  return chars.length>max?chars.slice(0,max).join(""):chars.join("");
}
function normalizeBackgroundMaxChars(value){
  return Math.min(140,Math.max(40,parseInt(value)||100));
}
function backgroundTargetRange(value){
  const max=normalizeBackgroundMaxChars(value);
  return {min:max>=60?Math.max(40,max-15):max,max};
}
function backgroundTextLength(value){
  return [...sanitizePostedText(value||"")].length;
}
function backgroundPromptRules(background={}){
  if(!background.enabled)return "";
  return `${t("bg.postBgRules",backgroundTargetRange(background.maxChars))} ${t("bg.postBgSemantic")}`;
}
function cleanGeneratedComment(raw){
  let text=String(raw||"").replace(/```[a-z]*|```/gi,"").trim();
  let lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const meta=/^(dưới đây|sau đây|gợi ý|lựa chọn|option|phương án|bình luận\s*:|comment\s*:|\*\*|#+\s)/i;
  lines=lines.filter(line=>!meta.test(line) && !/^[-*•]\s*$/.test(line));
  let picked=lines.find(line=>line.length>=5 && line.length<=300) || lines[0] || text;
  picked=picked
    .replace(/^[-*•\d.)\s]+/,"")
    .replace(/\*\*/g,"")
    .replace(/["“”]/g,"")
    .replace(/^(bình luận|comment)\s*:\s*/i,"")
    .trim();
  // Neu model van noi dai dong trong cung mot dong, lay phan sau dau hai cham.
  if(/^(dưới đây|gợi ý|lựa chọn|option)/i.test(picked) && picked.includes(":")) picked=picked.split(":").slice(1).join(":").trim();
  // Khong de AI ket thuc binh luan bang dau cham than, ke ca bien the full-width.
  return sanitizePostedText(sliceByCodePoints(picked,240)).replace(/[!！]+\s*$/g,"").trimEnd();
}
function strictCommentPrompt(text){
  return `${text}\n\n${t("bg.commentRules")}`;
}
function strictGroupPostPrompt(text,background={}){
  const backgroundRules=backgroundPromptRules(background);
  return `${text}\n\n${t("bg.postRules")}${backgroundRules} ${t("bg.postOnlyContent")}`;
}
function fitGroupPostToBackground(text,maxChars){
  const max=normalizeBackgroundMaxChars(maxChars);
  let value=sanitizePostedText(text).replace(/\s+/g," ").trim();
  if([...value].length<=max)return value;
  // Emergency fallback only. AI repair normally runs before this path, so
  // prefer a complete sentence/clause instead of cutting the middle of one.
  const sentenceParts=value.match(/[^.!?。！？]+[.!?。！？]+/g)||[];
  let complete="";
  for(const part of sentenceParts){
    const candidate=`${complete}${part}`.trim();
    if([...candidate].length>max)break;
    complete=candidate;
  }
  if(complete)return complete;
  const keepQuestion=/\?\s*$/.test(value),room=Math.max(1,max-(keepQuestion?1:0));
  let shortened=sliceByCodePoints(value,room).replace(/\s+\S*$/,"").replace(/[,:;.!?…\-]+\s*$/g,"").trim();
  if(!shortened)shortened=sliceByCodePoints(value,room).trim();
  shortened=sanitizePostedText(shortened);
  return sliceByCodePoints(`${shortened}${keepQuestion?"?":""}`,max).trim();
}
function cleanGroupPost(raw,background={}){
  let content=String(raw||"").replace(/```[a-z]*|```/gi,"").split(/\r?\n/)
    .map(s=>s.trim()).filter(s=>s&&!/^(hỏi|đáp|q|a)\s*:/i.test(s)&&!/^\*\*(hỏi|đáp|q|a)/i.test(s))
    .join(background.enabled?" ":"\n").replace(/\*\*/g,"").trim();
  if(background.enabled){
    content=content.replace(/https?:\/\/\S+/gi,"").replace(/(^|\s)#[\p{L}\p{N}_-]+/gu," ").replace(/\s+/g," ").trim();
    return sanitizePostedText(content);
  }
  return sanitizePostedText(sliceByCodePoints(content,1800));
}
function strictSalesPostPrompt(text,groupName,sourceText,productInfo,variant){
  return String(text||"")+"\n\nBỐI CẢNH: Nhóm đích là \""+String(groupName||"").slice(0,180)+"\"; đây là biến thể số "+Math.max(1,parseInt(variant)||1)+".\nTHÔNG TIN GỐC: "+String(sourceText||"").slice(0,3500)+"\nGHI CHÚ SẢN PHẨM: "+String(productInfo||"").slice(0,1800)+"\nYÊU CẦU AN TOÀN: Chỉ dùng dữ kiện xuất hiện trong thông tin gốc và ghi chú; không tự bịa giá, tình trạng, bảo hành, địa điểm, công dụng hay cam kết. Không mạo danh, không khẳng định chắc chắn điều chưa có nguồn. Viết tự nhiên như một người đang hỏi ý kiến để bán/định giá sản phẩm, không giật tít, không spam, không lặp nguyên văn giữa các biến thể, không hashtag, không URL, không Markdown, không nhãn Hỏi/Đáp, không lời giải thích của AI. Chỉ trả về duy nhất nội dung bài đăng bằng tiếng Việt, dài 2-4 câu.";
}
function compactSalesChat(messages=[]){
  const rows=(Array.isArray(messages)?messages:[]).slice(-12).map(item=>({
    role:item?.role==="assistant"?"assistant":"user",
    content:String(item?.content||"").replace(/\s+/g," ").trim().slice(0,1200)
  })).filter(item=>item.content);
  let used=0;
  return rows.reverse().filter(item=>{used+=item.content.length;return used<=6000;}).reverse();
}
function strictSalesChatPrompt(template,sourceText,productInfo,messages=[]){
  const conversation=compactSalesChat(messages).map(item=>`${item.role==="assistant"?"AI":"Người dùng"}: ${item.content}`).join("\n");
  return `${String(template||"")}\n\nTHÔNG TIN SẢN PHẨM: ${String(sourceText||"").slice(0,5000)}\nGHI CHÚ BỔ SUNG: ${String(productInfo||"").slice(0,2200)}\n${conversation?`CUỘC TRAO ĐỔI GẦN NHẤT:\n${conversation}\n`:""}YÊU CẦU CHAT: Hãy áp dụng yêu cầu mới nhất của người dùng để viết lại bài đăng bán hàng. Chỉ trả về duy nhất một phương án bài đăng hoàn chỉnh bằng tiếng Việt, dài 2-4 câu, tự nhiên như người thật vừa bán hàng vừa hỏi ý kiến. Chỉ dùng dữ kiện đã cung cấp; không bịa giá/thông số/tình trạng, không URL, hashtag, Markdown, nhãn Hỏi/Đáp, lời giải thích hay danh sách nhiều phương án.`;
}
function cleanSalesPost(raw){
  let text=String(raw||"").replace(/```[a-z]*|```/gi," ").replace(/\*\*/g,"").split(/\r?\n/).map(s=>s.trim()).filter(Boolean).join(" ");
  text=text.replace(/^(?:bài đăng|nội dung|tiêu đề|gợi ý)\s*:\s*/i,"").replace(/^["“”]+|["“”]+$/g,"").replace(/(^|\s)#[\p{L}\p{N}_-]+/gu," ").replace(/https?:\/\/\S+/gi," ").replace(/\s+/g," ").trim();
  if([...text].length>900)text=sliceByCodePoints(text,900).replace(/\s+\S*$/," ").replace(/[,:;.!?…-]+\s*$/g,"").trim();
  return sanitizePostedText(text);
}
// Học bài nhóm (trend): đọc bài đã cào từ nhóm nguồn, rút dàn ý rồi viết
// thành bài của mình cho nhóm đích. Không sao chép nguyên văn/giả mạo.
function strictTrendRewritePrompt(template,sourceText,groupName,variant){
  return String(template||"")
    +"\n\nBỐI CẢNH: Nhóm đích là \""+String(groupName||"").slice(0,180)+"\"; đây là biến thể số "+Math.max(1,parseInt(variant)||1)+"."
    +"\nBÀI ĐÃ HỌC TỪ NHÓM NGUỒN:\n"+String(sourceText||"").slice(0,6000)
    +"\nYÊU CẦU AN TOÀN: Đọc các bài trên để nắm dàn ý, góc nhìn và điểm được quan tâm, sau đó viết thành bài của chính mình theo dàn ý đó. Không sao chép nguyên văn câu nào, không bịa tên/người/giá/số liệu, không mạo danh tác giả, không giật tít, không spam, không lặp nguyên văn giữa các biến thể, không hashtag, không URL, không Markdown, không lời giải thích của AI. Chỉ trả về duy nhất nội dung bài đăng bằng tiếng Việt, 2-5 câu tự nhiên.";
}
function cleanTrendPost(raw){
  let text=String(raw||"").replace(/```[a-z]*|```/gi," ").replace(/\*\*/g,"").split(/\r?\n/).map(s=>s.trim()).filter(Boolean).join(" ");
  text=text.replace(/^(?:dàn ý|outline|bài đăng|nội dung|gợi ý)\s*:\s*/i,"").replace(/^["“”]+|["“”]+$/g,"").replace(/(^|\s)#[\p{L}\p{N}_-]+/gu," ").replace(/https?:\/\/\S+/gi," ").replace(/\s+/g," ").trim();
  if([...text].length>1200)text=sliceByCodePoints(text,1200).replace(/\s+\S*$/," ").replace(/[,:;.!?…-]+\s*$/g,"").trim();
  return sanitizePostedText(text);
}
async function callConfiguredText(provider,key,model,customUrl,postText,prompt){
  if(provider==="gemini")return callGemini(key,model||"gemini-flash-lite-latest",postText,prompt,false);
  if(provider==="claude"||provider==="Muse")return callClaude(key,model,postText,prompt,false);
  const def=AI_DEFAULTS[provider]||AI_DEFAULTS.openai;
  return callOpenAICompatible(key,customUrl||def.url,model||def.model,postText,prompt,false);
}
async function repairBackgroundPost(content,background,requestText,cleaner){
  if(!background.enabled)return cleaner(content);
  const range=backgroundTargetRange(background.maxChars);
  const normalized=cleaner(content);
  if(backgroundTextLength(normalized)<=range.max)return normalized;
  const repairPrompt=t("bg.postBgRepair",range)+"\n\nNỘI DUNG CẦN NÉN:\n"+normalized;
  const repaired=cleaner(await requestText(repairPrompt));
  if(!repaired)throw new Error(t("bg.contentEmpty"));
  if(backgroundTextLength(repaired)>range.max)throw new Error(t("bg.postTooLong",{max:range.max}));
  return repaired;
}

function strictGroupShareCaptionPrompt(text,recentCaptions=[]){
  const avoid=(Array.isArray(recentCaptions)?recentCaptions:[]).slice(-8).map((caption,index)=>`${index+1}. ${String(caption||"").slice(0,260)}`).join("\n");
  return `${text}\n\n${t("bg.leadRules")}${avoid?`${t("bg.leadAvoided")}\n${avoid}`:""}`;
}
function normalizeGroupShareCaption(value){return String(value||"").toLocaleLowerCase("vi").replace(/https?:\/\/\S+/gi,"").replace(/[^\p{L}\p{N}]+/gu," ").replace(/\s+/g," ").trim();}
function cleanGroupShareCaption(raw){
  let caption=String(raw||"").replace(/```[a-z]*|```/gi," ").replace(/\*\*/g,"").split(/\r?\n/).map(line=>line.trim()).filter(Boolean).join(" ");
  caption=sanitizePostedText(caption.replace(/^(?:tiêu đề|lời dẫn|caption|nội dung)\s*:\s*/i,"").replace(/^[-*•\d.)\s]+/,"").replace(/^['"“”]+|['"“”]+$/g,"").replace(/https?:\/\/\S+/gi,"").replace(/(^|\s)#[\p{L}\p{N}_-]+/gu," ").replace(/\s+/g," ").trim());
  if([...caption].length>280)caption=sliceByCodePoints(caption,280).replace(/\s+\S*$/,"").replace(/[,:;.!?…\-]+\s*$/g,"").trim();
  return sanitizePostedText(caption).replace(/[!！]+\s*$/g,"").trimEnd();
}

function compactGroupShareChat(messages=[]){
  const rows=(Array.isArray(messages)?messages:[]).slice(-12).map(item=>({
    role:item?.role==="assistant"?"assistant":"user",
    content:String(item?.content||"").replace(/\s+/g," ").trim().slice(0,1000)
  })).filter(item=>item.content);
  let used=0;
  return rows.reverse().filter(item=>{used+=item.content.length;return used<=5000;}).reverse();
}
function formatGroupShareChatContext(messages=[]){
  return compactGroupShareChat(messages).map(item=>`${item.role==="assistant"?t("bg.chatAi"):t("bg.chatUser")}: ${item.content}`).join("\n");
}

function compactProfilePosts(posts){
  return (Array.isArray(posts)?posts:[]).map(p=>({
    text:String(p?.text||"").replace(/\s+/g," ").trim().slice(0,700),
    author:String(p?.author||"").slice(0,80),
    sourceType:String(p?.sourceType||"").slice(0,30),
    isSponsored:!!p?.isSponsored
  })).filter(p=>p.text.length>=15).slice(0,80);
}
function profileIdFromName(name){
  const base=String(name||t("bg.profileShort")).toLowerCase().replace(/[^a-z0-9\u00c0-\u024f]+/gi,"-").replace(/^-+|-+$/g,"").slice(0,40)||"ho-so";
  return `sp_${base}_${Date.now().toString(36)}`;
}
function heuristicStyleProfile(posts,name){
  const rows=compactProfilePosts(posts),texts=rows.map(p=>p.text),all=texts.join(" ");
  const words=all.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[],stop=new Set(t("bg.stopwords").split(/\s+/));
  const freq=new Map();for(const w of words){if(stop.has(w))continue;freq.set(w,(freq.get(w)||0)+1);}
  const commonTerms=[...freq.entries()].sort((a,b)=>b[1]-a[1]).slice(0,15).map(([w])=>w);
  const sentences=all.split(/[.!?]+/).map(s=>s.trim()).filter(Boolean),avgWords=sentences.length?Math.round(sentences.reduce((n,s)=>n+(s.match(/[\p{L}\p{N}]+/gu)||[]).length,0)/sentences.length):0;
  const emojiCount=(all.match(/[\p{Extended_Pictographic}]/gu)||[]).length;
  const punctuation=["?","!",":","…"].map(ch=>({ch,count:(all.split(ch).length-1)})).filter(x=>x.count>0).sort((a,b)=>b.count-a.count).map(x=>x.ch);
  const first=texts.slice(0,3);
  return {name:String(name||t("st.defaultName")).trim().slice(0,80)||t("st.defaultName"),source:"heuristic",createdAt:new Date().toISOString(),sampleCount:rows.length,knowledge:{topics:commonTerms.slice(0,8),commonTerms,knownFacts:[],doNotInvent:[t("bg.hDoNotInvent")]},style:{tone:t("bg.hTone"),voice:t("bg.hVoice"),averageWordsPerSentence:avgWords,emojiUsage:emojiCount?t("bg.hEmojiSometimes"):t("bg.hEmojiRare"),punctuation,commonOpeners:first.map(t=>t.slice(0,80))},examples:first};
}
function parseProfileJson(raw){
  let text=String(raw||"").replace(/```json|```/gi," ").trim();
  const first=text.indexOf("{"),last=text.lastIndexOf("}");
  if(first>=0&&last>first)text=text.slice(first,last+1);
  try{const parsed=JSON.parse(text);return parsed&&typeof parsed==="object"?parsed:null;}catch{return null;}
}
function profilePrompt(rows,name){
  const sample=(Array.isArray(rows)?rows:[]).slice(0,40).map(row=>({...row,text:String(row?.text||"").slice(0,500)}));
  return t("bg.profilePrompt",{name:String(name||t("bg.profileShort")).slice(0,80)})+"\n"+JSON.stringify(sample);
}
async function getActiveStyleContext(profileId=""){
  const saved=await chrome.storage.local.get(["styleProfiles","activeStyleProfileId"]),profile=saved.styleProfiles?.[profileId||saved.activeStyleProfileId];
  if(!profile)return "";
  const compact={name:profile.name,knowledge:profile.knowledge||{},style:profile.style||{},examples:(profile.examples||[]).slice(0,3).map(x=>String(x).slice(0,300))};
  return `${t("bg.styleCtx")} ${JSON.stringify(compact)}`;
}

async function callOpenAICompatible(apiKey, url, model, postText, promptTemplate, strictOutput=true){
  const base=(promptTemplate || t("bg.commentDefaultFull")).replaceAll("{postText}", postText.slice(0,1500)).replaceAll("{groupName}",postText.slice(0,200));
  const prompt = strictOutput?strictCommentPrompt(base):base;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: strictOutput?120:400,
      temperature: 0.8
    })
  });
  const data = await res.json();
  if(!res.ok) throw new Error(data.error?.message || JSON.stringify(data).slice(0,300));
  return (data.choices?.[0]?.message?.content || "").trim().replace(/^["']|["']$/g,"");
}

async function callGemini(apiKey, model, postText, promptTemplate, strictOutput=true){
  const basePrompt = (promptTemplate || t("bg.commentDefaultFull")).replace("{postText}", postText.slice(0,1500));
  const prompt=strictOutput?strictCommentPrompt(basePrompt):basePrompt.replaceAll("{groupName}",postText.slice(0,200));
  const url = "https://generativelanguage.googleapis.com/v1beta/interactions";
  let res,data;
  for(let attempt=0;attempt<3;attempt++){
    res=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":apiKey},body:JSON.stringify({model:model||"gemini-flash-lite-latest",input:prompt,store:false,generation_config:{temperature:0.8,max_output_tokens:strictOutput?120:500}})});
    data=await res.json();
    if(res.ok)break;
    const message=data.error?.message||JSON.stringify(data).slice(0,500);
    if(res.status!==429||attempt===2){
      if(res.status===429)throw new Error(`${t("bg.quotaGemini",{model:model})} ${t("bg.detail")} ${message}`);
      throw new Error(message);
    }
    const retryText=JSON.stringify(data.error?.details||[]),match=retryText.match(/"retryDelay"\s*:\s*"(\d+)s"/i);
    const waitMs=Math.min(30000,Math.max(5000,(parseInt(match?.[1])||10)*1000));
    await new Promise(resolve=>setTimeout(resolve,waitMs));
  }
  const stepText=(data.steps||[]).flatMap(s=>s.content||[]).filter(c=>c.type==="text").map(c=>c.text||"").join("\n");
  return (data.output_text || stepText || "").trim().replace(/^["']|["']$/g,"");
}

async function callClaude(apiKey, model, postText, promptTemplate, strictOutput=true){
  const base=(promptTemplate || t("bg.commentDefaultFull")).replaceAll("{postText}",postText.slice(0,1500)).replaceAll("{groupName}",postText.slice(0,200));
  const prompt = strictOutput?strictCommentPrompt(base):base;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: model||"claude-3-haiku-20240307", max_tokens:strictOutput?120:400, messages: [{ role: "user", content: prompt }] })
  });
  const data = await res.json();
  if(!res.ok) throw new Error(data.error?.message || JSON.stringify(data).slice(0,300));
  return (data.content?.[0]?.text || "").trim().replace(/^["']|["']$/g,"");
}

function normalizeSalesMedia(value){
  const raw=Array.isArray(value)?value:(value?[value]:[]);
  return raw.filter(item=>item&&typeof item==="object"&&item.dataUrl&&/^(image|video)\//i.test(String(item.type||"")));
}

async function getPageAiConfig(own={}){
  const cfg=await chrome.storage.sync.get(["aiProvider","aiApiKey","aiModel","aiCustomUrl","aiKeys"]);
  const provider=own.provider||cfg.aiProvider||"gemini",saved=cfg.aiKeys?.[provider]||{};
  return {
    provider,
    key:normalizeApiKey(own.key||saved.key||(provider===cfg.aiProvider?cfg.aiApiKey:"")||""),
    model:own.model||saved.model||(provider===cfg.aiProvider?cfg.aiModel:"")||AI_DEFAULTS[provider]?.model||"",
    url:own.url||saved.url||(provider===cfg.aiProvider?cfg.aiCustomUrl:"")||""
  };
}
function pageProfilePromptContext(profile){
  if(!profile||typeof profile!=="object")return "";
  const compact={name:profile.name||"",niche:profile.niche||profile.topic||"",products:profile.products||profile.offer||"",tone:profile.tone||profile.style||"",rules:profile.rules||profile.doNotInvent||""};
  return `HỒ SƠ PAGE: ${JSON.stringify(compact)}`;
}
function cleanPageGroupPost(raw){
  let text=String(raw||"").replace(/```[a-z]*|```/gi," ").replace(/\*\*/g,"").split(/\r?\n/).map(s=>s.trim()).filter(Boolean).join(" ");
  text=text.replace(/^(?:bài đăng|nội dung|gợi ý|post|content)\s*:\s*/i,"").replace(/^['"“”]+|['"“”]+$/g,"").replace(/https?:\/\/\S+/gi," ").replace(/(^|\s)#[\p{L}\p{N}_-]+/gu," ").replace(/\s+/g," ").trim();
  return sanitizePostedText(sliceByCodePoints(text,1800));
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse)=>{
  if(msg.action==="pageStore"){
    (async()=>{
      try{
        if(!globalThis.PageStore)throw new Error("Page Care database unavailable");
        const op=String(msg.op||"list"),store=String(msg.store||"");
        if(op==="put")sendResponse({ok:true,value:await PageStore.put(store,msg.value||{})});
        else if(op==="get")sendResponse({ok:true,value:await PageStore.get(store,msg.id)});
        else if(op==="list")sendResponse({ok:true,values:await PageStore.list(store,msg.limit)});
        else if(op==="remove")sendResponse({ok:true,value:await PageStore.remove(store,msg.id)});
        else if(op==="clear")sendResponse({ok:true,value:await PageStore.clear(store)});
        else throw new Error("Unknown Page Care database operation");
      }catch(error){sendResponse({ok:false,error:String(error?.message||error)});}
    })();
    return true;
  }
  if(msg.action==="aiGeneratePageGroupPost"){
    (async()=>{
      try{
        const ai=await getPageAiConfig(msg.aiConfig||{});
        if(!ai.key)throw new Error(t("bg.noKeyProv",{provider:ai.provider}));
        if(!ai.model)throw new Error(t("bg.noModelProv",{provider:ai.provider}));
        if(ai.provider==="custom"&&!ai.url)throw new Error(t("bg.noCustomUrlAi"));
        const groupName=String(msg.groupName||"").trim().slice(0,180),pageName=String(msg.pageName||"").trim().slice(0,180);
        const recent=(Array.isArray(msg.recentPosts)?msg.recentPosts:[]).map((text,i)=>`${i+1}. ${String(text||"").replace(/\s+/g," ").trim().slice(0,900)}`).filter(Boolean).slice(0,8).join("\n");
        const template=String(msg.prompt||t("pgp.promptDefault"))
          .replaceAll("{groupName}",groupName).replaceAll("{pageName}",pageName).replaceAll("{recentPosts}",recent||t("pgp.noRecent"));
        const prompt=[template,pageProfilePromptContext(msg.pageProfile),"YÊU CẦU: Chỉ trả về duy nhất nội dung bài đăng. Viết tự nhiên, tạo thảo luận đúng chủ đề nhóm, không bịa số liệu, không sao chép nguyên văn bài khác, không hashtag, không URL, không giải thích của AI."].filter(Boolean).join("\n\n");
        let raw="";
        if(ai.provider==="gemini")raw=await callGemini(ai.key,ai.model,"",prompt,false);
        else if(ai.provider==="claude"||ai.provider==="Muse")raw=await callClaude(ai.key,ai.model,"",prompt,false);
        else{const def=AI_DEFAULTS[ai.provider]||AI_DEFAULTS.openai;raw=await callOpenAICompatible(ai.key,ai.url||def.url,ai.model||def.model,"",prompt,false);}
        const content=cleanPageGroupPost(raw);
        if(!content)throw new Error(t("bg.contentEmpty"));
        sendResponse({ok:true,content,provider:ai.provider,model:ai.model});
      }catch(error){sendResponse({ok:false,error:friendlyAiError(error,msg.aiConfig?.provider||"AI")});}
    })();
    return true;
  }
  if(msg.action==="aiGeneratePageComment"){
    (async()=>{
      try{
        const ai=await getPageAiConfig(msg.aiConfig||{});
        if(!ai.key)throw new Error(t("bg.noKeyProv",{provider:ai.provider}));
        if(!ai.model)throw new Error(t("bg.noModelProv",{provider:ai.provider}));
        if(ai.provider==="custom"&&!ai.url)throw new Error(t("bg.noCustomUrlAi"));
        const postText=String(msg.postText||"").replace(/\s+/g," ").trim().slice(0,2200),pageName=String(msg.pageName||"").trim().slice(0,180);
        if(postText.length<10)throw new Error(t("bg.postTooShort"));
        const template=String(msg.prompt||t("pgc.promptDefault")).replaceAll("{postText}",postText).replaceAll("{pageName}",pageName).replaceAll("{source}",String(msg.source||"Bản tin"));
        const prompt=[template,pageProfilePromptContext(msg.pageProfile)].filter(Boolean).join("\n\n");
        let raw="";
        if(ai.provider==="gemini")raw=await callGemini(ai.key,ai.model,postText,prompt,true);
        else if(ai.provider==="claude"||ai.provider==="Muse")raw=await callClaude(ai.key,ai.model,postText,prompt,true);
        else{const def=AI_DEFAULTS[ai.provider]||AI_DEFAULTS.openai;raw=await callOpenAICompatible(ai.key,ai.url||def.url,ai.model||def.model,postText,prompt,true);}
        const comment=cleanGeneratedComment(raw);
        if(!comment)throw new Error(t("bg.aiEmpty"));
        sendResponse({ok:true,comment,provider:ai.provider,model:ai.model});
      }catch(error){sendResponse({ok:false,error:friendlyAiError(error,msg.aiConfig?.provider||"AI")});}
    })();
    return true;
  }
  if(msg.action==="getSenderTabId"){
    sendResponse({tabId:sender.tab?.id||null});
    return true;
  }
  if(msg.action==="aiGenerateCommentBatch"){
    (async()=>{try{
      const cfg=await chrome.storage.sync.get(["aiProvider","aiApiKey","aiModel","aiPrompt","aiCustomUrl","aiKeys"]),provider=cfg.aiProvider||"gemini",saved=cfg.aiKeys?.[provider]||{};
      const key=normalizeApiKey(saved.key||cfg.aiApiKey||""),model=saved.model||cfg.aiModel||AI_DEFAULTS[provider]?.model||"",customUrl=saved.url||cfg.aiCustomUrl||"";
      if(!key)throw new Error(t("bg.noKeyProv",{provider:provider}));
      const posts=(msg.posts||[]).slice(0,10).map((p,i)=>({id:i+1,text:String(p||"").replace(/\s+/g," ").trim().slice(0,500)}));
      if(!posts.length)throw new Error(t("bg.noPosts"));
      const style=(cfg.aiPrompt||t("bg.commentDefaultStyle")).replaceAll("{postText}",t("bg.eachPost")),profileContext=await getActiveStyleContext();
      const prompt=`${style}${profileContext?`\n${profileContext}`:""}\n${t("bg.batchPrompt",{n:posts.length})}\n${JSON.stringify(posts)}`;
      let raw="";
      if(provider==="gemini")raw=await callGemini(key,model||"gemini-flash-lite-latest","",prompt,false);
      else if(provider==="claude"||provider==="Muse")raw=await callClaude(key,model,"",prompt,false);
      else{const def=AI_DEFAULTS[provider]||AI_DEFAULTS.openai;raw=await callOpenAICompatible(key,customUrl||def.url,model||def.model,"",prompt,false);}
      let comments;try{comments=JSON.parse(String(raw).replace(/```json|```/gi,"").trim());}catch{comments=String(raw).split(/\r?\n/).map(s=>s.replace(/^[-*\d.)\s]+/,"").trim()).filter(Boolean);}
      if(!Array.isArray(comments)||comments.length<posts.length)throw new Error(t("bg.batchShort"));
      comments=comments.slice(0,posts.length).map(cleanGeneratedComment);
      if(comments.some(c=>!c))throw new Error(t("bg.batchEmpty"));
      sendResponse({ok:true,comments});
    }catch(e){sendResponse({ok:false,error:friendlyAiError(e,"AI")});}})();return true;
  }
  if(msg.action==="aiAnswerJoinQuestions"){
    (async()=>{try{
      const own=msg.aiConfig||{},provider=own.provider||"gemini",key=normalizeApiKey(own.key),model=own.model||AI_DEFAULTS[provider]?.model||"",customUrl=own.url||"";
      if(!key)throw new Error(t("bg.noKeyJoin"));
      const questions=(msg.questions||[]).map((q,i)=>`${i+1}. ${String(q).slice(0,400)}`).join("\n");
      const base=(msg.prompt||t("bg.joinDefault")).replaceAll("{groupName}",String(msg.groupName||"").slice(0,150)).replaceAll("{questions}",questions);
      const prompt=`${base}\n${t("bg.joinTail",{n:(msg.questions||[]).length})}`;let raw="";
      if(provider==="gemini")raw=await callGemini(key,model||"gemini-flash-lite-latest",msg.groupName,prompt,false);
      else if(provider==="claude"||provider==="Muse")raw=await callClaude(key,model,msg.groupName,prompt,false);
      else{const def=AI_DEFAULTS[provider]||AI_DEFAULTS.openai;raw=await callOpenAICompatible(key,customUrl||def.url,model||def.model,msg.groupName,prompt,false);}
      let answers;try{answers=JSON.parse(String(raw).replace(/```json|```/gi,"").trim());}catch{answers=String(raw).split(/\r?\n/).map(s=>s.replace(/^[-*\d.)\s]+/,"").trim()).filter(Boolean);}
      if(!Array.isArray(answers)||!answers.length)throw new Error(t("bg.joinInvalid"));
      sendResponse({ok:true,answers:answers.map(a=>String(a).trim().slice(0,500))});
    }catch(e){sendResponse({ok:false,error:friendlyAiError(e,msg.aiConfig?.provider||"Gemini")});}})();return true;
  }
  if(msg.action==="aiTest"){
    (async()=>{
      try{
        const own=msg.aiConfig||{},provider=own.provider||"gemini",key=normalizeApiKey(own.key),model=own.model||"",customUrl=own.url||"";
        if(!key)throw new Error(t("bg.noKey"));
        if(!model)throw new Error(t("bg.noModel"));
        if(provider==="custom"&&!customUrl)throw new Error(t("bg.noCustomUrl"));
        const testPrompt=t("bg.testPrompt");let result="";
        if(provider==="gemini")result=await callGemini(key,model,t("bg.testPostText"),testPrompt,false);
        else if(provider==="claude"||provider==="Muse")result=await callClaude(key,model,t("bg.testPostText"),testPrompt,false);
        else{const def=AI_DEFAULTS[provider]||AI_DEFAULTS.openai;result=await callOpenAICompatible(key,customUrl||def.url,model||def.model,t("bg.testPostText"),testPrompt,false);}
        if(!String(result||"").trim())throw new Error(t("bg.testEmpty"));
        sendResponse({ok:true,result:String(result).trim().slice(0,120)});
      }catch(e){sendResponse({ok:false,error:friendlyAiError(e,msg.aiConfig?.provider||"Gemini")});}
    })();
    return true;
  }
  if(msg.action==="aiBuildStyleProfile"){
    (async()=>{
      try{
        const rows=compactProfilePosts(msg.posts),name=String(msg.name||t("st.defaultName")).trim().slice(0,80)||t("st.defaultName");
        if(rows.length<3)throw new Error(t("bg.profileNeed3"));
        const localProfile=heuristicStyleProfile(rows,name);
        const cfg=await chrome.storage.sync.get(["aiProvider","aiApiKey","aiModel","aiCustomUrl","aiKeys"]),own=msg.aiConfig||{};
        const provider=own.provider||cfg.aiProvider||"gemini",saved=cfg.aiKeys?.[provider]||{},key=normalizeApiKey(own.key||saved.key||cfg.aiApiKey||""),model=own.model||saved.model||cfg.aiModel||AI_DEFAULTS[provider]?.model||"",customUrl=own.url||saved.url||cfg.aiCustomUrl||"";
        let parsed=null,source="heuristic";
        if(key){
          try{
            const prompt=profilePrompt(rows,name);let raw="";
            if(provider==="gemini")raw=await callGemini(key,model||"gemini-flash-lite-latest","",prompt,false);
            else if(provider==="claude"||provider==="Muse")raw=await callClaude(key,model,"",prompt,false);
            else{const def=AI_DEFAULTS[provider]||AI_DEFAULTS.openai;raw=await callOpenAICompatible(key,customUrl||def.url,model||def.model,"",prompt,false);}
            parsed=parseProfileJson(raw);if(parsed)source=provider;
          }catch(error){
            // Hồ sơ vẫn được tạo bằng heuristic nếu API hết quota/lỗi mạng.
            console.warn("[AI profile] API failed, using local heuristic",friendlyAiError(error,provider));
          }
        }
        const profile={...localProfile,...parsed, id:profileIdFromName(name),name,source,sampleCount:rows.length,createdAt:new Date().toISOString(),examples:Array.isArray(parsed?.examples)&&parsed.examples.length?parsed.examples.slice(0,3).map(x=>String(x).slice(0,400)):localProfile.examples};
        profile.knowledge={...localProfile.knowledge,...(parsed?.knowledge||{})};
        profile.style={...localProfile.style,...(parsed?.style||{})};
        const store=await chrome.storage.local.get("styleProfiles"),profiles=store.styleProfiles&&typeof store.styleProfiles==="object"?store.styleProfiles:{};
        profiles[profile.id]=profile;
        await chrome.storage.local.set({styleProfiles:profiles,activeStyleProfileId:profile.id,styleProfileStatus:t("bg.profileSaved",{name:name,n:rows.length,source:source})});
        sendResponse({ok:true,profile});
      }catch(e){sendResponse({ok:false,error:friendlyAiError(e,t("bg.profileProvider"))});}
    })();
    return true;
  }
  if(msg.action==="salesGetMedia"){
    (async()=>{try{const saved=await chrome.storage.local.get("salesPostMedia");sendResponse({ok:true,media:normalizeSalesMedia(saved.salesPostMedia)});}catch(error){sendResponse({ok:false,error:error.message});}})();
    return true;
  }
  if(msg.action==="aiGenerateSalesPost"){
    (async()=>{
      try{
        const cfg=await chrome.storage.sync.get(["aiProvider","aiApiKey","aiModel","aiCustomUrl","aiKeys"]),own=msg.aiConfig||{};
        const provider=own.provider||cfg.aiProvider||"gemini",saved=cfg.aiKeys?.[provider]||{};
        const key=normalizeApiKey(own.key||saved.key||cfg.aiApiKey||""),model=own.model||saved.model||cfg.aiModel||AI_DEFAULTS[provider]?.model||"",customUrl=own.url||saved.url||cfg.aiCustomUrl||"";
        if(!key)throw new Error(t("bg.noKeyProv",{provider:provider}));
        if(!model)throw new Error(t("bg.noModelProv",{provider:provider}));
        if(provider==="custom"&&!customUrl)throw new Error(t("bg.noCustomUrlAi"));
        const sourceText=String(msg.sourceText||"").replace(/\s+/g," ").trim().slice(0,5000),productInfo=String(msg.productInfo||"").replace(/\s+/g," ").trim().slice(0,2200),groupName=String(msg.groupName||"").trim().slice(0,180);
        if(sourceText.length<10)throw new Error(t("bg.postTooShort"));
        const profileContext=await getActiveStyleContext(String(msg.styleProfileId||""));
        const template=String(msg.prompt||t("bg.salesDefault")).replaceAll("{groupName}",groupName).replaceAll("{sourceText}",sourceText).replaceAll("{productInfo}",productInfo);
        const prompt=strictSalesPostPrompt([template,profileContext].filter(Boolean).join("\n\n"),groupName,sourceText,productInfo,msg.variant);
        let raw="";
        if(provider==="gemini")raw=await callGemini(key,model||"gemini-flash-lite-latest","",prompt,false);
        else if(provider==="claude"||provider==="Muse")raw=await callClaude(key,model,"",prompt,false);
        else{const def=AI_DEFAULTS[provider]||AI_DEFAULTS.openai;raw=await callOpenAICompatible(key,customUrl||def.url,model||def.model,"",prompt,false);}
        const content=cleanSalesPost(raw);if(!content)throw new Error(t("bg.contentEmpty"));
        sendResponse({ok:true,content,length:content.length,provider,model});
      }catch(error){sendResponse({ok:false,error:friendlyAiError(error,msg.aiConfig?.provider||"AI")});}
    })();
    return true;
  }
  if(msg.action==="aiSalesPostChat"){
    (async()=>{
      try{
        const cfg=await chrome.storage.sync.get(["aiProvider","aiApiKey","aiModel","aiCustomUrl","aiKeys"]),own=msg.aiConfig||{};
        const provider=own.provider||cfg.aiProvider||"gemini",saved=cfg.aiKeys?.[provider]||{};
        const key=normalizeApiKey(own.key||saved.key||cfg.aiApiKey||""),model=own.model||saved.model||cfg.aiModel||AI_DEFAULTS[provider]?.model||"",customUrl=own.url||saved.url||cfg.aiCustomUrl||"";
        if(!key)throw new Error(t("bg.noKeyProv",{provider:provider}));
        if(!model)throw new Error(t("bg.noModelProv",{provider:provider}));
        if(provider==="custom"&&!customUrl)throw new Error(t("bg.noCustomUrlAi"));
        const sourceText=String(msg.sourceText||"").replace(/\s+/g," ").trim().slice(0,5000),productInfo=String(msg.productInfo||"").replace(/\s+/g," ").trim().slice(0,2200),messageList=compactSalesChat(msg.messages||[]);
        if(sourceText.length<10)throw new Error(t("bg.salesChatNoSource"));
        if(!messageList.some(item=>item.role==="user"))throw new Error(t("bg.salesChatNoUser"));
        const groupName=String(msg.groupName||"").trim().slice(0,180),template=String(msg.prompt||t("bg.salesDefault")).replaceAll("{groupName}",groupName).replaceAll("{sourceText}",sourceText).replaceAll("{productInfo}",productInfo);
        const prompt=strictSalesChatPrompt(template,sourceText,productInfo,messageList);
        let raw="";
        if(provider==="gemini")raw=await callGemini(key,model||"gemini-flash-lite-latest","",prompt,false);
        else if(provider==="claude"||provider==="Muse")raw=await callClaude(key,model,"",prompt,false);
        else{const def=AI_DEFAULTS[provider]||AI_DEFAULTS.openai;raw=await callOpenAICompatible(key,customUrl||def.url,model||def.model,"",prompt,false);}
        const reply=cleanSalesPost(raw);if(!reply)throw new Error(t("bg.salesChatNoReply"));
        sendResponse({ok:true,reply,length:[...reply].length,provider,model});
      }catch(error){sendResponse({ok:false,error:friendlyAiError(error,msg.aiConfig?.provider||"AI")});}
    })();
    return true;
  }
  if(msg.action==="aiGenerateGroupPost"){
    (async()=>{
      try{
        const cfg=await chrome.storage.sync.get(["aiProvider","aiApiKey","aiModel","aiCustomUrl","aiKeys"]),own=msg.aiConfig||{};
        const provider=own.provider||cfg.aiProvider||"gemini", saved=cfg.aiKeys?.[provider]||{};
        const key=normalizeApiKey(own.key||saved.key||cfg.aiApiKey||""), model=own.model||saved.model||cfg.aiModel||"", customUrl=own.url||saved.url||cfg.aiCustomUrl||"";
        if(!key) throw new Error(t("bg.noKeyProv",{provider:provider}));
        let content="";
        const background=msg.background&&typeof msg.background==="object"?msg.background:{};
        const profileContext=await getActiveStyleContext();
        const groupPrompt=strictGroupPostPrompt([msg.prompt||"",profileContext].filter(Boolean).join("\n\n"),background);
        content=await callConfiguredText(provider,key,model,customUrl,msg.groupName,groupPrompt);
        content=await repairBackgroundPost(content,background,
          repairPrompt=>callConfiguredText(provider,key,model,customUrl,msg.groupName,repairPrompt),
          value=>cleanGroupPost(value,background));
        if(!content) throw new Error(t("bg.contentEmpty"));
        sendResponse({ok:true,content,length:backgroundTextLength(content),backgroundEligible:!!background.enabled&&backgroundTextLength(content)<=normalizeBackgroundMaxChars(background.maxChars)});
      }catch(e){sendResponse({ok:false,error:friendlyAiError(e,msg.aiConfig?.provider||"Gemini")});}
    })();
    return true;
  }
  if(msg.action==="aiGenerateGroupShareCaption"){
    (async()=>{
      try{
        const cfg=await chrome.storage.sync.get(["aiProvider","aiApiKey","aiModel","aiCustomUrl","aiKeys"]),own=msg.aiConfig||{};
        const provider=own.provider||cfg.aiProvider||"gemini",saved=cfg.aiKeys?.[provider]||{};
        const key=normalizeApiKey(own.key||saved.key||cfg.aiApiKey||""),model=own.model||saved.model||cfg.aiModel||AI_DEFAULTS[provider]?.model||"",customUrl=own.url||saved.url||cfg.aiCustomUrl||"";
        if(!key)throw new Error(t("bg.noKeyProv",{provider:provider}));
        if(!model)throw new Error(t("bg.noModelProv",{provider:provider}));
        if(provider==="custom"&&!customUrl)throw new Error(t("bg.noCustomUrlAi"));
        const postText=String(msg.postText||"").replace(/\s+/g," ").trim().slice(0,4000);
        if(postText.length<10)throw new Error(t("bg.postTooShort"));
        const groupName=String(msg.groupName||"").trim().slice(0,180),sourceUrl=String(msg.sourceUrl||"").slice(0,1000);
        const base=(msg.prompt||t("bg.leadDefault"))
          .replaceAll("{postText}",postText).replaceAll("{groupName}",groupName).replaceAll("{sourceUrl}",sourceUrl);
        const profileContext=await getActiveStyleContext(),chatContext=formatGroupShareChatContext(msg.chatMessages||[]);
        const prompt=strictGroupShareCaptionPrompt([
          base,
          profileContext,
          chatContext?`${t("bg.chatCtx")}\n${chatContext}`:"",
          t("bg.variantNote",{n:Math.max(1,parseInt(msg.variant)||1),group:groupName})
        ].filter(Boolean).join("\n\n"),msg.recentCaptions||[]);
        let raw="";
        if(provider==="gemini")raw=await callGemini(key,model||"gemini-flash-lite-latest","",prompt,false);
        else if(provider==="claude"||provider==="Muse")raw=await callClaude(key,model,"",prompt,false);
        else{const def=AI_DEFAULTS[provider]||AI_DEFAULTS.openai;raw=await callOpenAICompatible(key,customUrl||def.url,model||def.model,"",prompt,false);}
        const caption=cleanGroupShareCaption(raw);
        if(!caption)throw new Error(t("bg.leadEmpty"));
        const normalized=normalizeGroupShareCaption(caption),used=(msg.recentCaptions||[]).some(value=>normalizeGroupShareCaption(value)===normalized);
        if(used)throw new Error(t("bg.leadDup"));
        sendResponse({ok:true,caption});
      }catch(error){sendResponse({ok:false,error:friendlyAiError(error,msg.aiConfig?.provider||"AI")});}
    })();
    return true;
  }
  if(msg.action==="aiGroupShareChat"){
    (async()=>{
      try{
        const cfg=await chrome.storage.sync.get(["aiProvider","aiApiKey","aiModel","aiCustomUrl","aiKeys"]),own=msg.aiConfig||{};
        const provider=own.provider||cfg.aiProvider||"gemini",saved=cfg.aiKeys?.[provider]||{};
        const key=normalizeApiKey(own.key||saved.key||cfg.aiApiKey||""),model=own.model||saved.model||cfg.aiModel||AI_DEFAULTS[provider]?.model||"",customUrl=own.url||saved.url||cfg.aiCustomUrl||"";
        if(!key)throw new Error(t("bg.noKeyProv",{provider:provider}));
        if(!model)throw new Error(t("bg.noModelProv",{provider:provider}));
        if(provider==="custom"&&!customUrl)throw new Error(t("bg.noCustomUrlAi"));
        const postText=String(msg.postText||"").replace(/\s+/g," ").trim().slice(0,6000);
        if(postText.length<10)throw new Error(t("bg.chatNoPost"));
        const conversation=formatGroupShareChatContext(msg.messages||[]);
        if(!conversation||!compactGroupShareChat(msg.messages||[]).some(item=>item.role==="user"))throw new Error(t("bg.chatNoUser"));
        const prompt=t("bg.chatPrompt",{post:postText,conv:conversation});
        let reply="";
        if(provider==="gemini")reply=await callGemini(key,model||"gemini-flash-lite-latest","",prompt,false);
        else if(provider==="claude"||provider==="Muse")reply=await callClaude(key,model,"",prompt,false);
        else{const def=AI_DEFAULTS[provider]||AI_DEFAULTS.openai;reply=await callOpenAICompatible(key,customUrl||def.url,model||def.model,"",prompt,false);}
        reply=String(reply||"").replace(/```[a-z]*|```/gi,"").trim().slice(0,3000);
        if(!reply)throw new Error(t("bg.chatEmpty"));
        sendResponse({ok:true,reply,provider,model});
      }catch(error){sendResponse({ok:false,error:friendlyAiError(error,msg.aiConfig?.provider||"Gemini")});}
    })();
    return true;
  }
  if(msg.action==="aiRewriteTrend"){
    (async()=>{
      try{
        const cfg=await chrome.storage.sync.get(["aiProvider","aiApiKey","aiModel","aiCustomUrl","aiKeys"]),own=msg.aiConfig||{};
        const provider=own.provider||cfg.aiProvider||"gemini",saved=cfg.aiKeys?.[provider]||{};
        const key=normalizeApiKey(own.key||saved.key||cfg.aiApiKey||""),model=own.model||saved.model||cfg.aiModel||AI_DEFAULTS[provider]?.model||"",customUrl=own.url||saved.url||cfg.aiCustomUrl||"";
        if(!key)throw new Error(t("bg.noKeyProv",{provider:provider}));
        if(!model)throw new Error(t("bg.noModelProv",{provider:provider}));
        if(provider==="custom"&&!customUrl)throw new Error(t("bg.noCustomUrlAi"));
        const sourceText=String(msg.sourceText||"").replace(/\s+/g," ").trim().slice(0,6000);
        if(sourceText.length<30)throw new Error(t("bg.postTooShort"));
        const groupName=String(msg.groupName||"").trim().slice(0,180);
        const profileContext=await getActiveStyleContext(String(msg.styleProfileId||""));
        const background=msg.background&&typeof msg.background==="object"&&msg.background.enabled?{enabled:true,maxChars:Math.min(140,Math.max(40,parseInt(msg.background.maxChars)||100))}:{enabled:false,maxChars:100};
        const template=String(msg.prompt||"Đọc các bài đã học rồi viết thành bài của mình theo dàn ý đó cho nhóm \"{groupName}\".").replaceAll("{groupName}",groupName);
        const bgPrompt=backgroundPromptRules(background)?`\n${backgroundPromptRules(background)}`:"";
        const prompt=strictTrendRewritePrompt([template,profileContext].filter(Boolean).join("\n\n")+bgPrompt,sourceText,groupName,msg.variant);
        let raw="";
        if(provider==="gemini")raw=await callGemini(key,model||"gemini-flash-lite-latest","",prompt,false);
        else if(provider==="claude"||provider==="Muse")raw=await callClaude(key,model,"",prompt,false);
        else{const def=AI_DEFAULTS[provider]||AI_DEFAULTS.openai;raw=await callOpenAICompatible(key,customUrl||def.url,model||def.model,"",prompt,false);}
        let content=cleanTrendPost(raw);
        content=await repairBackgroundPost(content,background,
          repairPrompt=>callConfiguredText(provider,key,model,customUrl,"",repairPrompt),
          value=>cleanTrendPost(value));
        if(!content)throw new Error(t("bg.contentEmpty"));
        sendResponse({ok:true,content,length:[...content].length,provider,model});
      }catch(error){sendResponse({ok:false,error:friendlyAiError(error,msg.aiConfig?.provider||"AI")});}
    })();
    return true;
  }
  if(msg.action==="trustedInput"){
    (async ()=>{
      const tabId=sender.tab?.id;
      if(!tabId) throw new Error("Khong xac dinh duoc tab Facebook");
      const target={tabId}; let attached=false;
      try{
        await chrome.debugger.attach(target,"1.3"); attached=true;
        const inputText=String(msg.text||"");
        const typingMin=Math.max(0,parseInt(msg.typingMinDelay)||0);
        const typingMax=Math.max(typingMin,parseInt(msg.typingMaxDelay)||typingMin);
        if(inputText&&typingMax>0){
          // Gõ theo code-point để không chẻ đôi emoji (surrogate pair) thành
          // ký tự lẻ — Facebook sẽ từ chối bài chứa surrogate lẻ.
          const chars=[...inputText];
          for(let index=0;index<chars.length;index++){
            const char=chars[index];
            if(msg.abortStorageKey&&index%4===0){
              const guard=await chrome.storage.local.get([msg.abortStorageKey,"groupShareRunId"]);
              if(!guard[msg.abortStorageKey]||(msg.abortRunId&&guard.groupShareRunId!==msg.abortRunId))throw new Error(t("bg.stoppedTyping"));
            }
            await chrome.debugger.sendCommand(target,"Input.insertText",{text:char});
            const pause=typingMin+Math.floor(Math.random()*(typingMax-typingMin+1));
            if(pause>0)await new Promise(r=>setTimeout(r,pause));
          }
        }else{
          await chrome.debugger.sendCommand(target,"Input.insertText",{text:inputText});
        }
        if(msg.pressEnter){
          await chrome.debugger.sendCommand(target,"Input.dispatchKeyEvent",{type:"rawKeyDown",key:"Enter",code:"Enter",windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});
          await chrome.debugger.sendCommand(target,"Input.dispatchKeyEvent",{type:"char",key:"Enter",code:"Enter",text:"\r",unmodifiedText:"\r",windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});
          await chrome.debugger.sendCommand(target,"Input.dispatchKeyEvent",{type:"keyUp",key:"Enter",code:"Enter",windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});
        }
        sendResponse({ok:true});
      }catch(e){ sendResponse({ok:false,error:e.message}); }
      finally{ if(attached){try{await chrome.debugger.detach(target);}catch(_){}} }
    })().catch(e=>sendResponse({ok:false,error:e.message}));
    return true;
  }
  if(msg.action==="trustedKey"){
    (async()=>{
      const tabId=sender.tab?.id;
      if(!tabId){sendResponse({ok:false,error:"Khong xac dinh duoc tab Facebook"});return;}
      const target={tabId};let attached=false;
      try{
        if(msg.abortStorageKey){const guard=await chrome.storage.local.get([msg.abortStorageKey,"groupShareRunId"]);if(!guard[msg.abortStorageKey]||(msg.abortRunId&&guard.groupShareRunId!==msg.abortRunId))throw new Error(t("bg.stoppedEdit"));}
        await chrome.debugger.attach(target,"1.3");attached=true;
        const key=String(msg.key||"Backspace"),code=String(msg.code||key),vk=Number(msg.windowsVirtualKeyCode)||8,modifiers=Number(msg.modifiers)||0;
        await chrome.debugger.sendCommand(target,"Input.dispatchKeyEvent",{type:"rawKeyDown",key,code,windowsVirtualKeyCode:vk,nativeVirtualKeyCode:vk,modifiers});
        await chrome.debugger.sendCommand(target,"Input.dispatchKeyEvent",{type:"keyUp",key,code,windowsVirtualKeyCode:vk,nativeVirtualKeyCode:vk,modifiers});
        sendResponse({ok:true});
      }catch(error){sendResponse({ok:false,error:error.message});}
      finally{if(attached){try{await chrome.debugger.detach(target);}catch(_){}}}
    })();
    return true;
  }
  if(msg.action==="trustedMouse"){
    (async ()=>{
      const tabId=sender.tab?.id;
      if(!tabId) throw new Error("Khong xac dinh duoc tab Facebook");
      const target={tabId};
      let attached=false;
      try{
        await chrome.debugger.attach(target,"1.3");
        attached=true;
        await chrome.debugger.sendCommand(target,"Input.dispatchMouseEvent",{
          type:"mouseMoved", x:msg.x, y:msg.y, button:"none", buttons:0
        });
        if(msg.kind==="click"){
          await chrome.debugger.sendCommand(target,"Input.dispatchMouseEvent",{
            type:"mousePressed", x:msg.x, y:msg.y, button:"left", buttons:1, clickCount:1
          });
          await chrome.debugger.sendCommand(target,"Input.dispatchMouseEvent",{
            type:"mouseReleased", x:msg.x, y:msg.y, button:"left", buttons:0, clickCount:1
          });
        }
        sendResponse({ok:true});
      }catch(e){
        console.error("[Mouse]",e);
        sendResponse({ok:false,error:e.message});
      }finally{
        if(attached){ try{ await chrome.debugger.detach(target); }catch(_){} }
      }
    })().catch(e=>sendResponse({ok:false,error:e.message}));
    return true;
  }
  if(msg.action==="aiGenerateComment"){
    (async ()=>{
      try{
        const cfg = await chrome.storage.sync.get(["aiProvider","aiApiKey","aiModel","aiPrompt","aiCustomUrl","aiKeys"]);
        // aiKeys luu theo provider de ho tro nhieu API
        let provider = cfg.aiProvider || "openai";
        let apiKey = cfg.aiApiKey || "";
        let model = cfg.aiModel || "";
        let promptTemplate = cfg.aiPrompt || "";
        const profileContext=await getActiveStyleContext();
        if(profileContext)promptTemplate=[promptTemplate,profileContext].filter(Boolean).join("\n\n");
        let customUrl = cfg.aiCustomUrl || "";
        // neu co aiKeys multi
        if(cfg.aiKeys && cfg.aiKeys[provider]){
          const p = cfg.aiKeys[provider];
          apiKey = p.key || apiKey;
          model = p.model || model;
          customUrl = p.url || customUrl;
        }
        if(!apiKey) throw new Error(t("bg.noKeyTabAi",{provider:provider}));

        let comment="";
        if(provider==="openai" || provider==="groq" || provider==="openrouter" || provider==="deepseek" || provider==="mistral"){
          const def = AI_DEFAULTS[provider] || AI_DEFAULTS.openai;
          const url = customUrl || def.url;
          const m = model || def.model;
          comment = await callOpenAICompatible(apiKey, url, m, msg.postText, promptTemplate);
        } else if(provider==="gemini"){
          const m = model || "gemini-flash-lite-latest";
          comment = await callGemini(apiKey, m, msg.postText, promptTemplate);
        } else if(provider==="claude" || provider==="Muse"){
          const m = model || "claude-3-haiku-20240307";
          comment = await callClaude(apiKey, m, msg.postText, promptTemplate);
        } else if(provider==="custom"){
          if(!customUrl) throw new Error(t("bg.noCustomUrlApi"));
          const m = model || "gpt-3.5-turbo";
          comment = await callOpenAICompatible(apiKey, customUrl, m, msg.postText, promptTemplate);
        } else {
          throw new Error(t("bg.noProvider",{provider:provider}));
        }
        comment=cleanGeneratedComment(comment);
        if(!comment) throw new Error(t("bg.aiEmpty"));
        sendResponse({ ok:true, comment });
      } catch(e){
        console.error("[AI] loi",e);
        sendResponse({ ok:false, error: e.message });
      }
    })();
    return true; // async
  }
});
