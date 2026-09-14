// background.js - xu ly goi da API AI de tao comment
try { importScripts("i18n.js", "pageStore.js"); } catch (_) { }
const AI_DEFAULTS = {
  openai: { url: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini" },
  gemini: { url: "https://generativelanguage.googleapis.com/v1beta/models", model: "gemini-flash-lite-latest" },
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
  // Facebook drops colored backgrounds once the post exceeds its practical
  // 130-character limit, even though the composer can still accept text.
  return Math.min(130,Math.max(40,parseInt(value)||100));
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
function strictTrendRewritePrompt(template,sourceText,groupName,variant,background={}){
  const sentenceRule=background?.enabled
    ?" Với bài đăng nền màu, chỉ viết 1-2 câu hoàn chỉnh; ưu tiên chủ đề và một ý chính rõ ràng, chỉ thêm câu hỏi khi còn đủ chỗ."
    :" Viết 2-5 câu tự nhiên.";
  return String(template||"")
    +"\n\nBỐI CẢNH: Nhóm đích là \""+String(groupName||"").slice(0,180)+"\"; đây là biến thể số "+Math.max(1,parseInt(variant)||1)+"."
    +"\nBÀI ĐÃ HỌC TỪ NHÓM NGUỒN:\n"+String(sourceText||"").slice(0,6000)
    +"\nYÊU CẦU AN TOÀN: Đọc các bài trên để nắm dàn ý, góc nhìn và điểm được quan tâm, sau đó viết thành bài của chính mình theo dàn ý đó. Không sao chép nguyên văn câu nào, không bịa tên/người/giá/số liệu, không mạo danh tác giả, không giật tít, không spam, không lặp nguyên văn giữa các biến thể, không hashtag, không URL, không Markdown, không lời giải thích của AI. Chỉ trả về duy nhất nội dung bài đăng bằng tiếng Việt."+sentenceRule;
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
  const initialLength=backgroundTextLength(normalized);
  if(initialLength>=range.min&&initialLength<=range.max)return normalized;
  const repairKey=initialLength<range.min?"bg.postBgExpand":"bg.postBgRepair";
  const repairLabel=initialLength<range.min?"NỘI DUNG CẦN BỔ SUNG Ý":"NỘI DUNG CẦN NÉN";
  const repairPrompt=t(repairKey,range)+`\n\n${repairLabel}:\n`+normalized;
  let repaired=cleaner(await requestText(repairPrompt));
  if(!repaired)throw new Error(t("bg.contentEmpty"));
  if(backgroundTextLength(repaired)<=range.max)return repaired;
  // Một số model bám vào cận dưới của range nhưng vượt cận trên vài ký tự.
  // Lượt hai bỏ cận dưới và yêu cầu cứng giới hạn, để 100-130 ký tự vẫn là
  // một ý hoàn chỉnh thay vì hủy cả phiên đăng.
  const hardLimitPrompt=t("bg.postBgHardRepair",{max:range.max})+"\n\nNỘI DUNG CẦN NÉN:\n"+repaired;
  repaired=cleaner(await requestText(hardLimitPrompt));
  if(!repaired)throw new Error(t("bg.contentEmpty"));
  if(backgroundTextLength(repaired)<=range.max)return repaired;
  // Chỉ dùng fallback cục bộ khi lấy được ít nhất một câu đã kết thúc. Không
  // bao giờ cắt giữa câu để ép vào nền màu.
  const completeParts=normalized.match(/[^.!?。！？]+[.!?。！？]+/g)||[];
  let complete="";
  for(const part of completeParts){
    const candidate=`${complete}${part}`.trim();
    if(backgroundTextLength(candidate)>range.max)break;
    complete=candidate;
  }
  if(complete)return complete;
  const error=new Error(t("bg.postTooLong",{max:range.max}));
  error.backgroundTooLong=true;
  throw error;
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
  // Gemini API keys are accepted by generateContent; Interactions requires OAuth.
  const chosenModel=String(model||"gemini-flash-lite-latest").trim()||"gemini-flash-lite-latest";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(chosenModel)}:generateContent`;
  let res,data;
  for(let attempt=0;attempt<3;attempt++){
    res=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":apiKey},body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{temperature:0.8,maxOutputTokens:strictOutput?120:500}})});
    data=await res.json();
    if(res.ok)break;
    const message=data.error?.message||JSON.stringify(data).slice(0,500);
    if(res.status!==429||attempt===2){
      if(res.status===429)throw new Error(`${t("bg.quotaGemini",{model:chosenModel})} ${t("bg.detail")} ${message}`);
      throw new Error(message);
    }
    const retryText=JSON.stringify(data.error?.details||[]),match=retryText.match(/"retryDelay"\s*:\s*"(\d+)s"/i);
    const waitMs=Math.min(30000,Math.max(5000,(parseInt(match?.[1])||10)*1000));
    await new Promise(resolve=>setTimeout(resolve,waitMs));
  }
  const candidateText=(data.candidates||[]).flatMap(c=>c.content?.parts||[]).filter(p=>typeof p.text==="string").map(p=>p.text).join("\n");
  const output=String(candidateText||"").trim().replace(/^["']|["']$/g,"");
  if(!output)throw new Error("Gemini không trả về nội dung");
  return output;
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

// ===== LỊCH CHẠY =====
// Lịch chỉ là lớp điều phối: nó giữ một snapshot cấu hình của *một* feature
// và đến giờ gọi lại đúng message Start của feature đó. Không dùng chung loop,
// selector hay bộ đếm với các state machine ở content scripts.
const SCHEDULE_STORAGE_KEY="scheduledTasks";
const SCHEDULE_ALARM_PREFIX="fb-auto-schedule:";
// Khi service worker vừa thức dậy đúng lúc alarm đến hạn, onAlarm và
// restoreScheduleAlarms() có thể chạy cạnh nhau. Cho phép alarm được dựng
// lại trong một cửa sổ rất ngắn để không biến race này thành lịch thất bại;
// lịch quá hạn thật sự vẫn bị đánh dấu failed bên dưới.
const SCHEDULE_RESTORE_GRACE_MS=15000;
const SCHEDULE_ACTIVE_KEYS=["isRunning","friendConfirmActive","friendFoFActive","friendFoFScanActive","isScraping","isFeedInteracting","isAICommenting","groupInteractActive","groupCommentActive","groupPostActive","isGroupJoining","isDiscoverJoining","groupShareActive","salesPostActive","trendLearnActive","trendPostActive","pageGroupJoinActive","pageGroupPostActive","pageWatchActive","pageCommentActive"];
const SCHEDULE_FEATURES=new Set(["friend","scrape","feed","aiFeed","groupInteract","groupComment","groupPost","keyword","discover","share","sales","trendLearn","trendPost","pageGroupJoin","pageGroupPost","pageWatch","pageComment"]);
const SCHEDULE_ACTIVE_BY_FEATURE={friend:"isRunning",scrape:"isScraping",feed:"isFeedInteracting",aiFeed:"isAICommenting",groupInteract:"groupInteractActive",groupComment:"groupCommentActive",groupPost:"groupPostActive",keyword:"isGroupJoining",discover:"isDiscoverJoining",share:"groupShareActive",sales:"salesPostActive",trendLearn:"trendLearnActive",trendPost:"trendPostActive",pageGroupJoin:"pageGroupJoinActive",pageGroupPost:"pageGroupPostActive",pageWatch:"pageWatchActive",pageComment:"pageCommentActive"};
const SCHEDULE_GROUP_COLORS=["pink","green","red","orange","yellow","blue","purple","burgundy","beige","brown","gray","black"];
const scheduleAlarmName=id=>SCHEDULE_ALARM_PREFIX+id;
const scheduleSafeText=(value,max=1000)=>String(value||"").trim().slice(0,Math.max(1,Number(max)||1000));
const scheduleConfirmWaitSeconds=value=>{
  const parsed=Number.parseInt(value,10);
  const seconds=Number.isFinite(parsed)?parsed:90;
  return Math.min(600,Math.max(5,seconds));
};
function scheduleFacebookUrl(value,allowFbWatch=false){
  const raw=String(value||"").trim();
  let url;
  try{url=new URL(raw); }catch{throw new Error("URL Facebook trong lịch không hợp lệ");}
  const host=String(url.hostname||"").toLowerCase().replace(/\.$/,"");
  const facebook=host==="facebook.com"||host.endsWith(".facebook.com");
  if(!facebook&&!(allowFbWatch&&host==="fb.watch"))throw new Error("Lịch chỉ nhận URL Facebook");
  if(!/^https?:$/.test(url.protocol))throw new Error("URL Facebook trong lịch không hợp lệ");
  url.hash="";
  return url.toString();
}
function scheduleUrlKey(value){
  try{
    const url=new URL(String(value||""));
    const host=String(url.hostname||"").toLowerCase().replace(/^www\./,"");
    return `${host}${url.pathname.replace(/\/+$/g,"").toLowerCase()}`;
  }catch{return String(value||"").split(/[?#]/)[0].replace(/\/+$/g,"").toLowerCase();}
}
function normalizeScheduleGroup(raw={}){
  const url=scheduleFacebookUrl(raw.url||`https://www.facebook.com/groups/${raw.id||""}/`);
  let parsed;
  try{parsed=new URL(url);}catch{throw new Error("Nhóm trong lịch không hợp lệ");}
  const match=parsed.pathname.match(/^\/groups\/([^/?#]+)/i);
  if(!match)throw new Error("Nhóm trong lịch không hợp lệ");
  const id=String(raw.id||decodeURIComponent(match[1])||"").trim();
  if(!id)throw new Error("Nhóm trong lịch không hợp lệ");
  return {id,name:scheduleSafeText(raw.name||id,180),url:`https://www.facebook.com/groups/${encodeURIComponent(id)}/`,manualLink:!!raw.manualLink,explicitName:!!raw.explicitName};
}
function normalizeScheduleGroups(value,required=true){
  const groups=[];
  for(const raw of Array.isArray(value)?value:[]){
    try{const group=normalizeScheduleGroup(raw);if(!groups.some(item=>item.id===group.id))groups.push(group);}catch{}
  }
  if(required&&!groups.length)throw new Error("Cần chọn ít nhất một nhóm trước khi hẹn lịch");
  return groups.slice(0,500);
}
function normalizeSchedulePage(raw={}){
  const url=scheduleFacebookUrl(raw.url);
  return {id:scheduleSafeText(raw.id||"",180),name:scheduleSafeText(raw.name||"Trang Facebook",180),url};
}
function normalizeSchedulePages(value){
  const pages=[];
  for(const raw of Array.isArray(value)?value:[]){
    try{const page=normalizeSchedulePage(raw);if(!pages.some(item=>scheduleUrlKey(item.url)===scheduleUrlKey(page.url)))pages.push(page);}catch{}
  }
  return pages.slice(0,100);
}
function normalizeScheduleBackground(raw={}){
  const colors=(Array.isArray(raw.colors)?raw.colors:[]).filter(color=>SCHEDULE_GROUP_COLORS.includes(color));
  return {enabled:!!raw.enabled,mode:raw.mode==="fixed"?"fixed":"random",fixedColor:SCHEDULE_GROUP_COLORS.includes(raw.fixedColor)?raw.fixedColor:"pink",colors:colors.length?[...new Set(colors)]:SCHEDULE_GROUP_COLORS,maxChars:Math.min(130,Math.max(40,parseInt(raw.maxChars)||100)),fallback:"skip"};
}
function normalizeScheduleSalesMedia(raw){
  if(!raw||typeof raw!=="object")return null;
  const plan=Array.isArray(raw.plan)?raw.plan.slice(0,500).map(row=>Array.isArray(row)?row.map(value=>Math.max(0,parseInt(value)||0)).slice(0,20):[]):[];
  const manifest=Array.isArray(raw.manifest)?raw.manifest.slice(0,20).map(item=>({name:scheduleSafeText(item?.name||"media",180),type:scheduleSafeText(item?.type||"",80),size:Math.max(0,Number(item?.size)||0)})):[];
  return {enabled:!!raw.enabled,required:!!raw.required,count:Math.max(0,Math.min(20,parseInt(raw.count)||0)),random:!!raw.random,perGroup:Math.max(1,Math.min(20,parseInt(raw.perGroup)||1)),plan,manifest};
}
function scheduleDefaultLabel(feature){
  return ({friend:"Kết bạn",scrape:"Cào bài",feed:"Tương tác bản tin",aiFeed:"Comment AI bản tin",groupInteract:"Like/Random trong nhóm",groupComment:"Comment AI trong nhóm",groupPost:"Đăng bài AI lên nhóm",keyword:"Tham gia nhóm từ khóa",discover:"Tham gia nhóm khám phá",share:"Share bài vào nhóm",sales:"Đăng bài bán hàng",trendLearn:"Học bài theo Trend",trendPost:"Đăng bài Trend",pageGroupJoin:"Page tham gia nhóm",pageGroupPost:"Page đăng bài nhóm",pageWatch:"Theo dõi Page",pageComment:"Page Comment AI"}[feature]||feature);
}
function scheduleRestoreDecision(runAt,now=Date.now()){
  const when=Number(runAt);
  if(!Number.isFinite(when))return {kind:"invalid"};
  if(when<=now){
    if(now-when<=SCHEDULE_RESTORE_GRACE_MS)return {kind:"rearm",when:now+1000};
    return {kind:"expired"};
  }
  return {kind:"rearm",when};
}
function scheduleId(){return "sch_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,8);}
async function scheduledTasks(){
  const saved=await chrome.storage.local.get(SCHEDULE_STORAGE_KEY);
  return Array.isArray(saved[SCHEDULE_STORAGE_KEY])?saved[SCHEDULE_STORAGE_KEY]:[];
}
async function saveScheduledTasks(tasks){await chrome.storage.local.set({[SCHEDULE_STORAGE_KEY]:tasks});}
async function setScheduledTask(id,change){
  const tasks=await scheduledTasks(),index=tasks.findIndex(task=>task.id===id);
  if(index<0)return null;
  tasks[index]={...tasks[index],...change};
  await saveScheduledTasks(tasks);
  return tasks[index];
}
function normalizeScheduledTask(raw={}){
  const feature=SCHEDULE_FEATURES.has(raw.feature)?raw.feature:"";
  const runAt=Number(raw.runAt);
  if(!feature)throw new Error("Tính năng hẹn giờ chưa được hỗ trợ");
  if(!Number.isFinite(runAt)||runAt<Date.now()+25000)throw new Error("Thời điểm chạy phải sau hiện tại ít nhất 30 giây");
  const config=raw.config&&typeof raw.config==="object"?raw.config:{};
  let normalized;
  if(feature==="keyword"){
    if(!scheduleSafeText(config.keyword))throw new Error("Cần nhập từ khóa trước khi hẹn lịch");
    normalized={keyword:scheduleSafeText(config.keyword,180),minMembers:Math.max(0,parseInt(config.minMembers)||0),minPostsPerDay:Math.max(0,parseInt(config.minPostsPerDay)||0),targetJoin:Math.max(1,parseInt(config.targetJoin)||10),minDelay:Math.max(1,parseInt(config.minDelay)||5),maxDelay:Math.max(1,parseInt(config.maxDelay)||15),confirmWaitSeconds:scheduleConfirmWaitSeconds(config.confirmWaitSeconds),answersText:scheduleSafeText(config.answersText,4000),aiJoinEnabled:!!config.aiJoinEnabled,aiJoinPrompt:scheduleSafeText(config.aiJoinPrompt,4000)};
  }else if(feature==="discover"){
    normalized={target:Math.max(1,parseInt(config.target)||10),minDelay:Math.max(1,parseInt(config.minDelay)||5),maxDelay:Math.max(1,parseInt(config.maxDelay)||15),confirmWaitSeconds:scheduleConfirmWaitSeconds(config.confirmWaitSeconds),answersText:scheduleSafeText(config.answersText,4000),aiJoinEnabled:!!config.aiJoinEnabled,aiJoinPrompt:scheduleSafeText(config.aiJoinPrompt,4000)};
  }else if(feature==="friend"){
    if(config.mode==="friend-of-friend")throw new Error(t("sch.friendFoFUnsupported"));
    const mode=["suggestions","group-common","confirm"].includes(config.mode)?config.mode:"suggestions";
    normalized={mode,minDelay:Math.max(1000,parseInt(config.minDelay)||5000),maxDelay:Math.max(1000,parseInt(config.maxDelay)||15000),maxRequests:Math.max(1,Math.min(100,parseInt(config.maxRequests)||20)),minMutual:Math.max(0,parseInt(config.minMutual)||0),groups:normalizeScheduleGroups(config.groups,mode==="group-common"),confirmFilters:{minMutual:Math.max(0,Math.min(999,parseInt(config.confirmFilters?.minMutual)||0))}};
  }else if(feature==="scrape"){
    normalized={count:Math.max(1,Math.min(10000,parseInt(config.count)||200)),skipAds:config.skipAds!==false,sourceUrl:scheduleFacebookUrl(config.sourceUrl)};
  }else if(feature==="feed"){
    normalized={reaction:scheduleSafeText(config.reaction||"random",40)||"random",target:Math.max(1,Math.min(100,parseInt(config.target)||20)),minDelay:Math.max(1,parseInt(config.minDelay)||3),maxDelay:Math.max(1,parseInt(config.maxDelay)||8)};
  }else if(feature==="aiFeed"){
    normalized={target:Math.max(1,Math.min(100,parseInt(config.target)||10)),minDelay:Math.max(1,parseInt(config.minDelay)||10),maxDelay:Math.max(1,parseInt(config.maxDelay)||20),economyMode:scheduleSafeText(config.economyMode||"balanced",30)||"balanced",batchSize:Math.max(2,Math.min(10,parseInt(config.batchSize)||5)),cacheDays:Math.max(0,parseInt(config.cacheDays)||7)};
  }else if(feature==="groupInteract"||feature==="groupComment"){
    normalized={groups:normalizeScheduleGroups(config.groups),perGroup:Math.max(1,Math.min(100,parseInt(config.perGroup)||5)),minDelay:Math.max(1,parseInt(config.minDelay)||5),maxDelay:Math.max(1,parseInt(config.maxDelay)||12),reaction:scheduleSafeText(config.reaction||"random",40)||"random",targetGroups:Math.max(1,Math.min(500,parseInt(config.targetGroups)||1))};
  }else if(feature==="groupPost"){
    normalized={groups:normalizeScheduleGroups(config.groups),prompt:scheduleSafeText(config.prompt,4000),minDelay:Math.max(5,parseInt(config.minDelay)||25),maxDelay:Math.max(5,parseInt(config.maxDelay)||45),interGroupDelay:Math.min(3600,Math.max(5,parseInt(config.interGroupDelay)||30)),background:normalizeScheduleBackground(config.background)};
  }else if(feature==="share"){
    normalized={sourceUrl:scheduleFacebookUrl(config.sourceUrl,true),groups:normalizeScheduleGroups(config.groups),prompt:scheduleSafeText(config.prompt,4000),interGroupDelay:Math.min(3600,Math.max(5,parseInt(config.interGroupDelay)||30)),manualSourceText:scheduleSafeText(config.manualSourceText,6000)};
  }else if(feature==="sales"){
    normalized={groups:normalizeScheduleGroups(config.groups),sourceText:scheduleSafeText(config.sourceText,6000),productInfo:scheduleSafeText(config.productInfo,3000),prompt:scheduleSafeText(config.prompt,4000),interGroupDelay:Math.min(3600,Math.max(5,parseInt(config.interGroupDelay)||45)),styleProfileId:scheduleSafeText(config.styleProfileId,180),acceptedChatPosts:(Array.isArray(config.acceptedChatPosts)?config.acceptedChatPosts:[]).map(value=>scheduleSafeText(value,2000)).filter(Boolean).slice(0,500),media:normalizeScheduleSalesMedia(config.media)};
    if(!normalized.sourceText)throw new Error("Cần nhập thông tin sản phẩm trước khi hẹn lịch");
  }else if(feature==="trendLearn"){
    normalized={groups:normalizeScheduleGroups(config.groups),perGroup:Math.max(0,Math.min(100,parseInt(config.perGroup)||0)),unlimited:config.unlimited!==false};
  }else if(feature==="trendPost"){
    const groups=normalizeScheduleGroups(config.groups),jobs=(Array.isArray(config.jobs)?config.jobs:[]).map(job=>{let group;try{group=normalizeScheduleGroup(job?.group||{});}catch{return null;}return {group,groupIndex:Math.max(0,parseInt(job.groupIndex)||0),postIndex:Math.max(0,parseInt(job.postIndex)||0),groupPostTotal:Math.max(1,parseInt(job.groupPostTotal)||1),sourcePostIds:(Array.isArray(job.sourcePostIds)?job.sourcePostIds:[]).map(value=>scheduleSafeText(value,300)).filter(Boolean).slice(0,20),sourceText:scheduleSafeText(job.sourceText,1200),draft:scheduleSafeText(job.draft,2000),variant:Math.max(1,parseInt(job.variant)||1)};}).filter(Boolean);
    if(!jobs.length)throw new Error("Cần có bài đã học và nhóm đích trước khi hẹn lịch Trend");
    normalized={groups,jobs,drafts:(Array.isArray(config.drafts)?config.drafts:[]).map(value=>scheduleSafeText(value,2000)).slice(0,500),sourceText:scheduleSafeText(config.sourceText,6000),sourcePostIds:(Array.isArray(config.sourcePostIds)?config.sourcePostIds:[]).map(value=>scheduleSafeText(value,300)).filter(Boolean).slice(0,500),sourceMode:config.sourceMode==="sequential"?"sequential":"selected",distribution:scheduleSafeText(config.distribution||"auto",40)||"auto",postsPerGroup:Math.max(1,Math.min(30,parseInt(config.postsPerGroup)||1)),postDelay:Math.min(3600,Math.max(5,parseInt(config.postDelay)||30)),prompt:scheduleSafeText(config.prompt,4000),styleProfileId:scheduleSafeText(config.styleProfileId,180),interDelay:Math.min(3600,Math.max(5,parseInt(config.interDelay)||30)),anonymousMode:config.anonymousMode!==false,background:normalizeScheduleBackground(config.background)};
  }else if(feature==="pageGroupJoin"){
    normalized={page:normalizeSchedulePage(config.page),mode:config.mode==="discover"?"discover":"keyword",keyword:scheduleSafeText(config.keyword,180),target:Math.max(1,Math.min(100,parseInt(config.target)||10)),minDelay:Math.max(5,Math.min(3600,parseInt(config.minDelay)||15)),maxDelay:Math.max(5,Math.min(3600,parseInt(config.maxDelay)||30)),answers:Array.isArray(config.answers)?config.answers.map(value=>scheduleSafeText(value,500)).filter(Boolean).slice(0,30):[],aiEnabled:!!config.aiEnabled,aiPrompt:scheduleSafeText(config.aiPrompt,4000)};
    if(normalized.mode==="keyword"&&!normalized.keyword)throw new Error("Cần nhập từ khóa Page trước khi hẹn lịch");
  }else if(feature==="pageGroupPost"){
    normalized={page:normalizeSchedulePage(config.page),groups:normalizeScheduleGroups(config.groups),target:Math.max(1,Math.min(100,parseInt(config.target)||1)),minDelay:Math.max(5,Math.min(3600,parseInt(config.minDelay)||30)),maxDelay:Math.max(5,Math.min(3600,parseInt(config.maxDelay)||60)),prompt:scheduleSafeText(config.prompt,4000)};
  }else if(feature==="pageWatch"){
    normalized={page:normalizeSchedulePage(config.page),keyword:scheduleSafeText(config.keyword,180),target:Math.max(1,Math.min(100,parseInt(config.target)||10)),minFollowers:Math.max(0,parseInt(config.minFollowers)||0),exclude:scheduleSafeText(config.exclude,1000)};
    if(!normalized.keyword)throw new Error("Cần nhập từ khóa theo dõi Page trước khi hẹn lịch");
  }else if(feature==="pageComment"){
    normalized={page:normalizeSchedulePage(config.page),source:config.source==="followed"?"followed":"feed",pages:normalizeSchedulePages(config.pages),target:Math.max(1,Math.min(100,parseInt(config.target)||10)),minDelay:Math.max(5,Math.min(3600,parseInt(config.minDelay)||20)),maxDelay:Math.max(5,Math.min(3600,parseInt(config.maxDelay)||45)),prompt:scheduleSafeText(config.prompt,4000)};
    if(normalized.source==="followed"&&!normalized.pages.length)throw new Error("Cần có Page đã theo dõi trước khi hẹn lịch Comment");
  }
  return {
    id:scheduleId(),feature,label:scheduleSafeText(raw.label,120)||scheduleDefaultLabel(feature),runAt,createdAt:Date.now(),status:"scheduled",config:normalized
  };
}
async function hasActiveFeature(){const state=await chrome.storage.local.get(SCHEDULE_ACTIVE_KEYS);return SCHEDULE_ACTIVE_KEYS.some(key=>!!state[key]);}
async function scheduleAiConfig(){return getPageAiConfig({});}
async function scheduleFacebookTab(){
  const tabs=await chrome.tabs.query({url:["*://*.facebook.com/*"]});
  const tab=tabs.find(item=>item.active)||tabs[0];
  // Need a tab id before persisting ownerTabId. A blank tab is intentional:
  // state must be written before the Facebook content script can load.
  if(tab?.id!==undefined)return {id:tab.id};
  return chrome.tabs.create({url:"about:blank",active:true});
}
async function navigateScheduledTab(tabId,url,timeout=18000){
  return new Promise(resolve=>{
    let done=false;
    const finish=ok=>{if(done)return;done=true;chrome.tabs.onUpdated.removeListener(onUpdated);clearTimeout(timer);resolve(ok);};
    const onUpdated=(id,info)=>{if(id===tabId&&info.status==="complete")finish(true);};
    const timer=setTimeout(()=>finish(false),timeout);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.update(tabId,{url,active:true}).catch(()=>finish(false));
  });
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function sendScheduledTabMessage(tabId,message){
  return new Promise(resolve=>chrome.tabs.sendMessage(tabId,message,result=>resolve(chrome.runtime.lastError?null:result)));
}
async function sendScheduledStart(tabId,message,attempts=12){
  // `tabs.onUpdated: complete` can arrive before a Facebook content script is
  // ready after a cold extension/service-worker wake. Retrying a message that
  // was not delivered is safe; once it is delivered we stop immediately, so a
  // Join/Post action is never retried by this helper.
  for(let attempt=0;attempt<attempts;attempt++){
    const response=await sendScheduledTabMessage(tabId,message);
    if(response!==null)return response;
    await wait(650);
  }
  return null;
}
function scheduledActiveKey(task){
  return task.feature==="friend"&&task.config?.mode==="confirm"?"friendConfirmActive":SCHEDULE_ACTIVE_BY_FEATURE[task.feature];
}
function scheduledScrapeSourceKey(value){
  try{const url=new URL(String(value||"")),host=String(url.hostname||"").toLowerCase().replace(/\.$/,"");return `https://${host==="facebook.com"||host.endsWith(".facebook.com")?"facebook.com":host}${url.pathname}`.replace(/\/$/,"").toLowerCase();}catch{return scheduleUrlKey(value);}
}
function scheduledTargetUrl(task,cfg){
  switch(task.feature){
    case "friend":
      if(cfg.mode==="suggestions")return "https://www.facebook.com/friends/suggestions";
      if(cfg.mode==="confirm")return "https://www.facebook.com/friends/requests";
      return `https://www.facebook.com/groups/${encodeURIComponent(cfg.groups[0].id)}/members/`;
    case "scrape":return cfg.sourceUrl;
    case "feed":case "aiFeed":return "https://www.facebook.com/";
    case "keyword":return "https://www.facebook.com/search/groups/?q="+encodeURIComponent(cfg.keyword);
    case "discover":return "https://www.facebook.com/groups/discover";
    case "groupInteract":case "groupComment":case "groupPost":case "sales":case "trendLearn":case "trendPost":case "pageGroupPost":return cfg.groups[0].url;
    case "share":return cfg.sourceUrl;
    case "pageGroupJoin":return cfg.mode==="discover"?"https://www.facebook.com/groups/discover":"https://www.facebook.com/search/groups/?q="+encodeURIComponent(cfg.keyword);
    case "pageWatch":return "https://www.facebook.com/search/pages/?q="+encodeURIComponent(cfg.keyword);
    case "pageComment":return cfg.source==="feed"?"https://www.facebook.com/":cfg.pages[0].url;
    default:return "https://www.facebook.com/";
  }
}
function scheduledRouteMatches(task,cfg,url){
  try{
    const current=new URL(String(url||"")),host=current.hostname.toLowerCase();
    if(!(host==="facebook.com"||host.endsWith(".facebook.com")||host==="fb.watch"))return false;
    const path=current.pathname.replace(/\/+$/g,"").toLowerCase()||"/";
    switch(task.feature){
      case "friend":
        if(cfg.mode==="suggestions")return path==="/friends/suggestions";
        if(cfg.mode==="confirm")return path==="/friends/requests";
        return path.startsWith(`/groups/${String(cfg.groups[0].id).toLowerCase()}/members`);
      case "scrape":return scheduledScrapeSourceKey(url)===scheduledScrapeSourceKey(cfg.sourceUrl);
      case "feed":case "aiFeed":return path==="/"||path==="/home.php";
      case "keyword":return path.startsWith("/search/groups")&&current.searchParams.get("q")===cfg.keyword;
      case "discover":return path==="/groups/discover";
      case "groupInteract":case "groupComment":case "groupPost":case "sales":case "trendLearn":case "trendPost":case "pageGroupPost":return scheduleUrlKey(url)===scheduleUrlKey(cfg.groups[0].url);
      case "share":return true; // Facebook canonicalizes /share/* and fb.watch before share.js resolves the source.
      case "pageGroupJoin":return cfg.mode==="discover"?path==="/groups/discover":path.startsWith("/search/groups")&&current.searchParams.get("q")===cfg.keyword;
      case "pageWatch":return path.startsWith("/search/pages")&&current.searchParams.get("q")===cfg.keyword;
      case "pageComment":return cfg.source==="feed"?(path==="/"||path==="/home.php"):scheduleUrlKey(url)===scheduleUrlKey(cfg.pages[0].url);
      default:return false;
    }
  }catch{return false;}
}
async function persistScheduledFeatureState(task,cfg,tabId,runId){
  const ownerCfg={...cfg,ownerTabId:tabId,runId};
  switch(task.feature){
    case "friend":{
      const delay=Number(cfg.minDelay)||5000;
      if(cfg.mode==="confirm"){
        await chrome.storage.local.set({friendConfirmActive:true,friendConfirmAccepted:0,friendConfirmSkipped:0,friendConfirmUncertain:0,friendConfirmRunState:{active:true,runId,ownerTabId:tabId,mode:cfg.mode,config:cfg,acceptedCount:0,skippedCount:0,uncertainCount:0,attemptedKeys:[],emptyRounds:0,sourceReloads:0,nextAllowedAt:Date.now()+delay,status:t("sch.launching"),startedAt:Date.now()},friendConfirmStatus:t("sch.launching")});
      }else{
        await chrome.storage.local.set({isRunning:true,sentCount:0,friendSkipped:0,friendUncertain:0,friendRunState:{active:true,runId,ownerTabId:tabId,mode:cfg.mode,config:cfg,sentCount:0,skippedCount:0,uncertainCount:0,attemptedKeys:[],groupIndex:0,emptyRounds:0,sourceReloads:0,nextAllowedAt:Date.now()+delay,groupWaitKey:"",groupWaitStartedAt:0,status:t("sch.launching"),startedAt:Date.now()},friendStatus:t("sch.launching"),lastMessage:t("sch.launching")});
      }
      break;
    }
    case "scrape":
      await chrome.storage.local.set({isScraping:true,scrapeTarget:cfg.count,scrapeOwnerTabId:tabId,scrapeRunSourceUrl:scheduledScrapeSourceKey(cfg.sourceUrl),scrapeRequestedSourceUrl:cfg.sourceUrl,scrapeSkipAds:cfg.skipAds,scrapeStartedAt:Date.now(),scrapeStatus:t("sch.launching"),scrapeCount:0,scrapeReady:false,scrapeHasData:false});
      break;
    case "feed":
      await chrome.storage.local.set({isFeedInteracting:true,pendingFeedInteract:true,pendingFeedConfig:{...ownerCfg},feedStatus:t("sch.launching")});
      break;
    case "aiFeed":
      await chrome.storage.local.set({isAICommenting:true,pendingAIComment:true,pendingAIConfig:{...ownerCfg},aiCount:0,aiFeedReloadAttempts:0,aiStatus:t("sch.launching")});
      break;
    case "groupInteract":
      await chrome.storage.local.set({groupInteractActive:true,groupInteractRunId:runId,groupInteractConfig:ownerCfg,groupInteractIndex:0,groupInteractDone:0,groupInteractAiDone:0,groupInteractTotal:cfg.groups.length*cfg.perGroup,groupInteractCurrentGroupIndex:0,groupInteractCurrentGroupDone:0,groupInteractCurrentGroupAiDone:0,groupInteractReactedKeys:{},groupInteractReactionGuard:{},groupInteractCommentGuard:{},groupInteractStatus:t("sch.launching")});
      break;
    case "groupComment":
      await chrome.storage.local.set({groupCommentActive:true,groupCommentRunId:runId,groupCommentConfig:ownerCfg,groupCommentIndex:0,groupCommentDone:0,groupCommentTotal:cfg.groups.length*cfg.perGroup,groupCommentCurrentGroupIndex:0,groupCommentCurrentGroupDone:0,groupCommentHistory:{},groupCommentSubmissionGuard:{},groupCommentProcessedKeys:[],groupCommentRetryCounts:{},groupCommentSkipped:{},groupCommentStatus:t("sch.launching")});
      break;
    case "groupPost":
      await chrome.storage.local.set({groupPostActive:true,groupPostRunId:runId,groupPostConfig:ownerCfg,groupPostIndex:0,groupPostDone:0,groupPostSkipped:0,groupPostTotal:cfg.groups.length,groupPostNextAt:0,groupPostLastColor:"",groupPostRetryCount:0,groupPostPendingContent:"",groupPostPendingIndex:-1,groupPostStage:"",groupPostSubmitRunId:"",groupPostSubmitIndex:-1,groupPostSubmitDispatchedAt:0,groupPostStatus:t("sch.launching")});
      break;
    case "keyword":
      await chrome.storage.local.set({isGroupJoining:true,groupJoined:0,groupFound:0,groupJoinRunConfig:ownerCfg,groupStatus:t("sch.launching")});
      break;
    case "discover":
      await chrome.storage.local.set({isDiscoverJoining:true,discoverJoined:0,discoverRunConfig:ownerCfg,discoverStatus:t("sch.launching")});
      break;
    case "share":
      await chrome.storage.local.set({groupShareActive:true,groupShareConfig:ownerCfg,groupShareRunId:runId,groupShareOwnerTabId:tabId,groupShareStage:cfg.manualSourceText?"groups":"source",groupShareSourceText:cfg.manualSourceText||"",groupShareSourceKey:"",groupShareSourceResolvedUrl:cfg.manualSourceText?cfg.sourceUrl:"",groupShareSourceMediaKeys:[],groupSharePreviewRejected:false,groupSharePreviewKey:"",groupSharePreviewLinks:[],groupSharePreviewImages:[],groupShareSourceNavigationAt:Date.now(),groupShareIndex:0,groupShareDone:0,groupShareSkipped:0,groupShareTotal:cfg.groups.length,groupShareNextAt:0,groupSharePendingCaption:"",groupSharePendingIndex:-1,groupShareRecentCaptions:[],groupShareSubmitDispatchedAt:0,groupShareStatus:t("sch.launching")});
      break;
    case "sales":
      await chrome.storage.local.set({salesPostActive:true,salesPostRunId:runId,salesPostOwnerTabId:tabId,salesPostConfig:ownerCfg,salesPostIndex:0,salesPostDone:0,salesPostSkipped:0,salesPostTotal:cfg.groups.length,salesPostNextAt:0,salesPostPendingContent:"",salesPostPendingIndex:-1,salesPostStage:"",salesPostProofSeenAt:0,salesPostProofMethod:"",salesPostSubmitIndex:-1,salesPostSubmitDispatchedAt:0,salesPostStatus:t("sch.launching")});
      break;
    case "trendLearn":
      await chrome.storage.local.set({trendLearnActive:true,trendLearnRunId:runId,trendLearnOwnerTabId:tabId,trendLearnConfig:ownerCfg,trendLearnIndex:0,trendLearnPosts:[],trendLearnCount:0,trendLearnReady:false,trendLearnOutline:"",trendRewriteDrafts:[],trendLastDiag:null,trendLearnStatus:t("sch.launching")});
      break;
    case "trendPost":
      await chrome.storage.local.set({trendPostActive:true,trendPostRunId:runId,trendPostOwnerTabId:tabId,trendPostConfig:ownerCfg,trendPostIndex:0,trendPostDone:0,trendPostSkipped:0,trendPostTotal:cfg.jobs.length,trendPostNextAt:0,trendPostLastColor:"",trendPostStage:"",trendPostSubmitIndex:-1,trendPostSubmitDispatchedAt:0,trendPostAnonymousMode:cfg.anonymousMode?"anonymous":"normal",trendPostStatus:t("sch.launching")});
      break;
    case "pageGroupJoin":
      await chrome.storage.local.set({pageGroupJoinActive:true,pageGroupJoinRunId:runId,pageGroupJoinOwnerTabId:tabId,pageGroupJoinConfig:ownerCfg,pageGroupJoinRunState:{active:true,runId,ownerTabId:tabId,config:ownerCfg,joined:0,skipped:0,attemptedKeys:[],nextAllowedAt:Date.now()+cfg.minDelay*1000,status:t("sch.launching")},pageGroupJoinJoined:0,pageGroupJoinSkipped:0,pageGroupJoinAttemptedKeys:[],pageGroupJoinNextAt:Date.now()+cfg.minDelay*1000,pageGroupJoinStatus:t("sch.launching")});
      break;
    case "pageGroupPost":
      await chrome.storage.local.set({pageGroupPostActive:true,pageGroupPostRunId:runId,pageGroupPostOwnerTabId:tabId,pageGroupPostConfig:ownerCfg,pageGroupPostDone:0,pageGroupPostSkipped:0,pageGroupPostIndex:0,pageGroupPostStatus:t("sch.launching")});
      break;
    case "pageWatch":
      await chrome.storage.local.set({pageWatchActive:true,pageWatchRunId:runId,pageWatchOwnerTabId:tabId,pageWatchConfig:ownerCfg,pageWatchFollowed:0,pageWatchSkipped:0,pageWatchIndex:0,pageWatchSeenKeys:[],pageWatchStatus:t("sch.launching")});
      break;
    case "pageComment":
      await chrome.storage.local.set({pageCommentActive:true,pageCommentRunId:runId,pageCommentOwnerTabId:tabId,pageCommentConfig:ownerCfg,pageCommentDone:0,pageCommentPageIndex:0,pageCommentStatus:t("sch.launching")});
      break;
  }
}
function scheduledStartMessage(task,cfg,tabId){
  const base={ownerTabId:tabId};
  switch(task.feature){
    case "friend":return {action:cfg.mode==="confirm"?"friendConfirmStart":"friendStart",config:cfg,...base};
    case "scrape":return {action:"startScrape",count:cfg.count,skipAds:cfg.skipAds,sourceUrl:cfg.sourceUrl,...base};
    case "feed":return {action:"startFeedInteract",...cfg,...base};
    case "aiFeed":return {action:"startAIComment",...cfg,...base};
    case "groupInteract":return {action:"startGroupInteract",...cfg,...base};
    case "groupComment":return {action:"startGroupComment",...cfg,...base};
    case "groupPost":return {action:"startGroupPost",...cfg,...base};
    case "keyword":return {action:"startGroupJoin",...cfg,...base};
    case "discover":return {action:"startDiscoverJoin",...cfg,...base};
    case "share":return {action:"resumeGroupShare",...base};
    case "sales":return {action:"startSalesPost",runId:cfg.runId,config:cfg,...base};
    case "trendLearn":return {action:"startTrendLearn",runId:cfg.runId,config:cfg,...base};
    case "trendPost":return {action:"startTrendPost",runId:cfg.runId,config:cfg,...base};
    case "pageGroupJoin":return {action:"startPageGroupJoin",config:cfg,joined:0,skipped:0,attemptedKeys:[],nextAllowedAt:Date.now()+cfg.minDelay*1000,...base};
    case "pageGroupPost":return {action:"startPageGroupPost",config:cfg,runId:cfg.runId,...base};
    case "pageWatch":return {action:"startPageWatch",config:cfg,runId:cfg.runId,followed:0,skipped:0,seenKeys:[],...base};
    case "pageComment":return {action:"startPageComment",config:cfg,runId:cfg.runId,...base};
    default:return null;
  }
}
async function waitScheduledFeatureActive(tabId,task,timeout=9000){
  const activeKey=scheduledActiveKey(task)||task.feature;
  const until=Date.now()+timeout;
  while(Date.now()<until){
    const state=await chrome.storage.local.get(activeKey);
    if(state[activeKey])return true;
    await wait(650);
  }
  return false;
}
async function launchScheduledTask(task){
  if(task.feature==="friend"&&task.config?.mode==="friend-of-friend")throw new Error(t("sch.friendFoFUnsupported"));
  if(await hasActiveFeature())throw new Error("Đang có một tính năng khác chạy");
  const aiConfig=await scheduleAiConfig();
  const cfg={...task.config,aiConfig,runId:`schedule-${task.feature}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`};
  const safeAi={provider:aiConfig.provider,model:aiConfig.model,url:aiConfig.url};
  const safeCfg={...task.config,aiConfig:safeAi,runId:cfg.runId};
  const runtimeCfg=task.feature==="keyword"||task.feature==="discover"?cfg:safeCfg;
  const url=scheduledTargetUrl(task,runtimeCfg);
  const tab=await scheduleFacebookTab();
  if(!tab?.id)throw new Error("Không mở được tab Facebook");
  await persistScheduledFeatureState(task,runtimeCfg,tab.id,cfg.runId);
  // Persist first, subscribe to onUpdated second, then navigate. This makes
  // automatic resume and the direct Start message reliable after a cold load.
  const loaded=await navigateScheduledTab(tab.id,url);
  const current=await chrome.tabs.get(tab.id).catch(()=>null);
  const onExpectedRoute=!!current?.url&&scheduledRouteMatches(task,runtimeCfg,current.url);
  if(!loaded||!onExpectedRoute)throw new Error("Tab Facebook chưa tải đúng trang của lịch");
  const message=scheduledStartMessage(task,runtimeCfg,tab.id);
  const response=await sendScheduledStart(tab.id,message);
  if(response===null)throw new Error("Tab Facebook chưa nhận được lệnh khởi động");
  const activeKey=scheduledActiveKey(task),activeState=await chrome.storage.local.get(activeKey);
  if(response&&response.ok===false&&!activeState[activeKey])throw new Error(response.msg||response.error||"Không thể khởi động lịch");
  if(!await waitScheduledFeatureActive(tab.id,task))throw new Error("Tab Facebook chưa giữ được phiên chạy của lịch");
}
async function fireScheduledTask(id){
  const task=(await scheduledTasks()).find(item=>item.id===id);
  if(!task||task.status!=="scheduled")return;
  await setScheduledTask(id,{status:"starting",lastRunAt:Date.now(),error:""});
  try{
    await launchScheduledTask(task);
    await setScheduledTask(id,{status:"started",startedAt:Date.now()});
  }catch(error){
    const blocked=/Đang có một tính năng khác chạy/.test(String(error?.message||error));
    await setScheduledTask(id,{status:blocked?"blocked":"failed",error:scheduleSafeText(error?.message||error),finishedAt:Date.now()});
    // Do not leave an active flag behind if this scheduler itself failed before
    // a feature was able to receive its Start message.
    if(!blocked){
      const detail=String(error?.message||error);
      const statusKey=task.feature==="friend"&&task.config?.mode==="confirm"?"friendConfirmStatus":{friend:"friendStatus",scrape:"scrapeStatus",feed:"feedStatus",aiFeed:"aiStatus",groupInteract:"groupInteractStatus",groupComment:"groupCommentStatus",groupPost:"groupPostStatus",keyword:"groupStatus",discover:"discoverStatus",share:"groupShareStatus",sales:"salesPostStatus",trendLearn:"trendLearnStatus",trendPost:"trendPostStatus",pageGroupJoin:"pageGroupJoinStatus",pageGroupPost:"pageGroupPostStatus",pageWatch:"pageWatchStatus",pageComment:"pageCommentStatus"}[task.feature];
      await chrome.storage.local.set({[scheduledActiveKey(task)]:false,...(statusKey?{[statusKey]:t("sch.launchFailed",{error:detail})}:{})});
    }
  }
}
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name.startsWith(SCHEDULE_ALARM_PREFIX))fireScheduledTask(alarm.name.slice(SCHEDULE_ALARM_PREFIX.length));});
async function restoreScheduleAlarms(){
  // Reloading an unpacked MV3 extension can discard its alarms.  Rebuild all
  // future alarms from the durable task record instead of trusting the old
  // alarm to still exist. This is also safe after a worker suspension.
  const now=Date.now();
  const tasks=await scheduledTasks();
  let changed=false;
  for(const task of tasks){
    if(task.status!=="scheduled")continue;
    const decision=scheduleRestoreDecision(task.runAt,now);
    if(decision.kind==="invalid"){
      task.status="failed";
      task.error="Thời điểm lịch không hợp lệ; hãy tạo lịch mới";
      task.finishedAt=now;
      changed=true;
      continue;
    }
    const name=scheduleAlarmName(task.id);
    if(decision.kind==="expired"){
      task.status="failed";
      task.error="Đã quá giờ chạy; hãy tạo lịch mới";
      task.finishedAt=now;
      changed=true;
      continue;
    }
    // A same-name alarm may carry a stale time from before reload.
    await chrome.alarms.clear(name);
    chrome.alarms.create(name,{when:decision.when});
  }
  if(changed)await saveScheduledTasks(tasks);
}
restoreScheduleAlarms().catch(()=>{});
chrome.runtime.onStartup.addListener(()=>{restoreScheduleAlarms().catch(()=>{});});
chrome.runtime.onInstalled.addListener(()=>{restoreScheduleAlarms().catch(()=>{});});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse)=>{
  if(msg.action==="scheduleCreate"){
    (async()=>{try{const task=normalizeScheduledTask(msg.task);const tasks=await scheduledTasks();tasks.push(task);await saveScheduledTasks(tasks);chrome.alarms.create(scheduleAlarmName(task.id),{when:task.runAt});sendResponse({ok:true,task});}catch(error){sendResponse({ok:false,error:String(error?.message||error)});}})();
    return true;
  }
  if(msg.action==="scheduleCancel"||msg.action==="scheduleRemove"){
    (async()=>{try{const id=String(msg.id||"");await chrome.alarms.clear(scheduleAlarmName(id));const tasks=await scheduledTasks();const index=tasks.findIndex(task=>task.id===id);if(index<0)throw new Error("Không tìm thấy lịch chạy");if(msg.action==="scheduleRemove")tasks.splice(index,1);else tasks[index]={...tasks[index],status:"cancelled",cancelledAt:Date.now()};await saveScheduledTasks(tasks);sendResponse({ok:true});}catch(error){sendResponse({ok:false,error:String(error?.message||error)});}})();
    return true;
  }
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
        const background=msg.background&&typeof msg.background==="object"&&msg.background.enabled?{enabled:true,maxChars:normalizeBackgroundMaxChars(msg.background.maxChars)}:{enabled:false,maxChars:100};
        const template=String(msg.prompt||"Đọc các bài đã học rồi viết thành bài của mình theo dàn ý đó cho nhóm \"{groupName}\".").replaceAll("{groupName}",groupName);
        const bgPrompt=backgroundPromptRules(background)?`\n${backgroundPromptRules(background)}`:"";
        const prompt=strictTrendRewritePrompt([template,profileContext].filter(Boolean).join("\n\n")+bgPrompt,sourceText,groupName,msg.variant,background);
        let raw="";
        if(provider==="gemini")raw=await callGemini(key,model||"gemini-flash-lite-latest","",prompt,false);
        else if(provider==="claude"||provider==="Muse")raw=await callClaude(key,model,"",prompt,false);
        else{const def=AI_DEFAULTS[provider]||AI_DEFAULTS.openai;raw=await callOpenAICompatible(key,customUrl||def.url,model||def.model,"",prompt,false);}
        let content=cleanTrendPost(raw),backgroundFallback=false;
        try{
          content=await repairBackgroundPost(content,background,
            repairPrompt=>callConfiguredText(provider,key,model,customUrl,"",repairPrompt),
            value=>cleanTrendPost(value));
        }catch(error){
          // B2 vẫn phải đăng được nếu AI không nén vừa nền màu sau các lượt
          // sửa. Giữ bài chữ thường đầy đủ thay vì cắt câu hoặc bỏ qua nhóm.
          if(background.enabled&&error?.backgroundTooLong){
            content=cleanTrendPost(raw);
            backgroundFallback=true;
          }else throw error;
        }
        if(!content)throw new Error(t("bg.contentEmpty"));
        sendResponse({ok:true,content,length:[...content].length,backgroundEligible:!backgroundFallback&&[...content].length<=background.maxChars,backgroundFallback,provider,model});
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
          // Gõ theo các cụm rất nhỏ (mặc định 2 code-point) để Facebook không
          // phải xử lý một sự kiện DOM cho từng ký tự liên tiếp. Vẫn giữ tổng
          // nhịp nghỉ tương đương từng ký tự, nhưng giảm việc React thay
          // composer giữa chừng và để lại bản nháp bị cắt.
          const chars=[...inputText];
          const chunkSize=Math.max(1,parseInt(msg.typingChunkSize)|| (msg.humanLike?2:1));
          for(let index=0;index<chars.length;){
            const chunk=chars.slice(index,index+chunkSize);
            if(msg.abortStorageKey&&index%4===0){
              const runIdKey=String(msg.abortRunIdKey||"groupShareRunId");
              const guard=await chrome.storage.local.get([msg.abortStorageKey,runIdKey]);
              if(!guard[msg.abortStorageKey]||(msg.abortRunId&&guard[runIdKey]!==msg.abortRunId)){
                const stopped=new Error(t("bg.stoppedTyping"));
                stopped.code="ABORT_TYPING";
                throw stopped;
              }
            }
            await chrome.debugger.sendCommand(target,"Input.insertText",{text:chunk.join("")});
            let pause=0;
            for(const char of chunk){
              pause+=typingMin+Math.floor(Math.random()*(typingMax-typingMin+1));
              // Comment AI dùng nhịp gõ giống người hơn: nghỉ thêm sau dấu
              // câu và một nhịp rất ngắn sau khoảng trắng, nhưng vẫn giữ
              // khoảng ngẫu nhiên để không tạo tốc độ máy móc.
              if(msg.humanLike!==false&&/[,.!?;:…]/u.test(char)){
                pause+=140+Math.floor(Math.random()*181);
              }else if(msg.humanLike!==false&&char===" "){
                pause+=10+Math.floor(Math.random()*31);
              }
            }
            if(pause>0)await new Promise(r=>setTimeout(r,pause));
            index+=chunk.length;
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
      }catch(e){ sendResponse({ok:false,error:e.message,code:e.code||""}); }
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
