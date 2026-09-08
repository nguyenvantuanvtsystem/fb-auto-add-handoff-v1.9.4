// background.js - xu ly goi da API AI de tao comment
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
  const raw=String(error?.message||error||"Lỗi API");
  if(/API_KEY_INVALID|API key not valid/i.test(raw))return `API Key ${provider} không hợp lệ. Hãy tạo/copy lại key tại Google AI Studio, chỉ dán chuỗi key (thường bắt đầu bằng AIza), rồi bấm Test API.`;
  if(/PERMISSION_DENIED/i.test(raw))return `API Key ${provider} chưa có quyền dùng Gemini API hoặc đang bị giới hạn theo website/IP.`;
  return raw;
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
  return picked.slice(0,240).replace(/[!！]+\s*$/g,"").trimEnd();
}
function strictCommentPrompt(text){
  return `${text}\n\nQUY TẮC BẮT BUỘC: Chỉ trả về duy nhất nội dung của MỘT bình luận hoàn chỉnh. Không lời dẫn, không giải thích, không liệt kê lựa chọn, không Markdown, không nhãn 'Bình luận:', không đặt trong dấu ngoặc kép, không kết thúc bằng dấu chấm than.`;
}
function strictGroupPostPrompt(text,background={}){
  const enabled=!!background.enabled,maxChars=Math.min(140,Math.max(40,parseInt(background.maxChars)||100));
  const backgroundRules=enabled?` Nội dung phải nằm trong ${Math.max(20,maxChars-35)}-${maxChars} KÝ TỰ tính cả khoảng trắng, chỉ MỘT đoạn, không xuống dòng, không emoji, không hashtag, không đường dẫn để Facebook giữ được nền màu.`:"";
  return `${text}\n\nYÊU CẦU BẮT BUỘC: Viết như một bài chia sẻ/thảo luận tự nhiên. Có thể đặt MỘT câu hỏi ở cuối để mời thành viên trao đổi nhưng KHÔNG tự trả lời. Tuyệt đối không dùng các nhãn 'Hỏi:', 'Đáp:', 'Q:', 'A:', không viết theo mẫu hỏi-đáp, không lời dẫn của AI, không Markdown.${backgroundRules} Chỉ trả về nội dung bài đăng.`;
}
function fitGroupPostToBackground(text,maxChars){
  const max=Math.min(140,Math.max(40,parseInt(maxChars)||100));
  let value=String(text||"").replace(/\s+/g," ").trim();
  if(value.length<=max)return value;
  const keepQuestion=/\?\s*$/.test(value),room=Math.max(1,max-(keepQuestion?1:0));
  let shortened=value.slice(0,room).replace(/\s+\S*$/,"").replace(/[,:;.!?…\-]+\s*$/g,"").trim();
  if(!shortened)shortened=value.slice(0,room).trim();
  return `${shortened}${keepQuestion?"?":""}`.slice(0,max).trim();
}
function cleanGroupPost(raw,background={}){
  let content=String(raw||"").replace(/```[a-z]*|```/gi,"").split(/\r?\n/)
    .map(s=>s.trim()).filter(s=>s&&!/^(hỏi|đáp|q|a)\s*:/i.test(s)&&!/^\*\*(hỏi|đáp|q|a)/i.test(s))
    .join(background.enabled?" ":"\n").replace(/\*\*/g,"").trim();
  if(background.enabled){
    content=content.replace(/https?:\/\/\S+/gi,"").replace(/(^|\s)#[\p{L}\p{N}_-]+/gu," ").replace(/\s+/g," ").trim();
    return fitGroupPostToBackground(content,background.maxChars);
  }
  return content.slice(0,1800);
}

async function callOpenAICompatible(apiKey, url, model, postText, promptTemplate, strictOutput=true){
  const base=(promptTemplate || "Viet mot binh luan ngan gon, tu nhien bang tieng Viet, phu hop voi noi dung bai viet sau (1-2 cau, than thien): \"{postText}\"").replaceAll("{postText}", postText.slice(0,1500)).replaceAll("{groupName}",postText.slice(0,200));
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
  const basePrompt = (promptTemplate || "Viet mot binh luan ngan gon, tu nhien bang tieng Viet, phu hop voi noi dung bai viet sau (1-2 cau, than thien): \"{postText}\"").replace("{postText}", postText.slice(0,1500));
  const prompt=strictOutput?strictCommentPrompt(basePrompt):basePrompt.replaceAll("{groupName}",postText.slice(0,200));
  const url = "https://generativelanguage.googleapis.com/v1beta/interactions";
  let res,data;
  for(let attempt=0;attempt<3;attempt++){
    res=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":apiKey},body:JSON.stringify({model:model||"gemini-flash-lite-latest",input:prompt,store:false,generation_config:{temperature:0.8,max_output_tokens:strictOutput?120:500}})});
    data=await res.json();
    if(res.ok)break;
    const message=data.error?.message||JSON.stringify(data).slice(0,500);
    if(res.status!==429||attempt===2){
      if(res.status===429)throw new Error(`Gemini hết hạn mức hiện tại cho model ${model}. Hãy chọn gemini-flash-lite-latest, đợi quota theo phút hoặc kiểm tra quota dự án trong AI Studio. Chi tiết: ${message}`);
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
  const base=(promptTemplate || "Viet mot binh luan ngan gon, tu nhien bang tieng Viet, phu hop voi noi dung bai viet sau (1-2 cau, than thien): \"{postText}\"").replaceAll("{postText}",postText.slice(0,1500)).replaceAll("{groupName}",postText.slice(0,200));
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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse)=>{
  if(msg.action==="getSenderTabId"){
    sendResponse({tabId:sender.tab?.id||null});
    return true;
  }
  if(msg.action==="aiGenerateCommentBatch"){
    (async()=>{try{
      const cfg=await chrome.storage.sync.get(["aiProvider","aiApiKey","aiModel","aiPrompt","aiCustomUrl","aiKeys"]),provider=cfg.aiProvider||"gemini",saved=cfg.aiKeys?.[provider]||{};
      const key=normalizeApiKey(saved.key||cfg.aiApiKey||""),model=saved.model||cfg.aiModel||AI_DEFAULTS[provider]?.model||"",customUrl=saved.url||cfg.aiCustomUrl||"";
      if(!key)throw new Error("Chưa nhập API Key cho "+provider);
      const posts=(msg.posts||[]).slice(0,10).map((p,i)=>({id:i+1,text:String(p||"").replace(/\s+/g," ").trim().slice(0,500)}));
      if(!posts.length)throw new Error("Không có bài để tạo comment");
      const style=(cfg.aiPrompt||"Viết một bình luận ngắn gọn, tự nhiên bằng tiếng Việt").replaceAll("{postText}","nội dung từng bài");
      const prompt=`${style}\nTạo đúng ${posts.length} bình luận tương ứng với các bài sau. Mỗi bình luận chỉ 1 câu, tối đa 30 từ, không lời dẫn, không Markdown, không trùng nhau. Chỉ trả về JSON array gồm ${posts.length} chuỗi theo đúng thứ tự.\n${JSON.stringify(posts)}`;
      let raw="";
      if(provider==="gemini")raw=await callGemini(key,model||"gemini-flash-lite-latest","",prompt,false);
      else if(provider==="claude"||provider==="Muse")raw=await callClaude(key,model,"",prompt,false);
      else{const def=AI_DEFAULTS[provider]||AI_DEFAULTS.openai;raw=await callOpenAICompatible(key,customUrl||def.url,model||def.model,"",prompt,false);}
      let comments;try{comments=JSON.parse(String(raw).replace(/```json|```/gi,"").trim());}catch{comments=String(raw).split(/\r?\n/).map(s=>s.replace(/^[-*\d.)\s]+/,"").trim()).filter(Boolean);}
      if(!Array.isArray(comments)||comments.length<posts.length)throw new Error("AI không trả về đủ comment theo lô");
      comments=comments.slice(0,posts.length).map(cleanGeneratedComment);
      if(comments.some(c=>!c))throw new Error("AI trả về comment rỗng");
      sendResponse({ok:true,comments});
    }catch(e){sendResponse({ok:false,error:friendlyAiError(e,"AI")});}})();return true;
  }
  if(msg.action==="aiAnswerJoinQuestions"){
    (async()=>{try{
      const own=msg.aiConfig||{},provider=own.provider||"gemini",key=normalizeApiKey(own.key),model=own.model||AI_DEFAULTS[provider]?.model||"",customUrl=own.url||"";
      if(!key)throw new Error("Chưa có API Key cho AI trả lời câu hỏi tham gia nhóm");
      const questions=(msg.questions||[]).map((q,i)=>`${i+1}. ${String(q).slice(0,400)}`).join("\n");
      const base=(msg.prompt||"Trả lời ngắn gọn các câu hỏi để tham gia nhóm {groupName}. Trả về mảng JSON theo đúng thứ tự: {questions}").replaceAll("{groupName}",String(msg.groupName||"").slice(0,150)).replaceAll("{questions}",questions);
      const prompt=`${base}\nChỉ trả về JSON array gồm đúng ${(msg.questions||[]).length} chuỗi, không Markdown, không giải thích.`;let raw="";
      if(provider==="gemini")raw=await callGemini(key,model||"gemini-flash-lite-latest",msg.groupName,prompt,false);
      else if(provider==="claude"||provider==="Muse")raw=await callClaude(key,model,msg.groupName,prompt,false);
      else{const def=AI_DEFAULTS[provider]||AI_DEFAULTS.openai;raw=await callOpenAICompatible(key,customUrl||def.url,model||def.model,msg.groupName,prompt,false);}
      let answers;try{answers=JSON.parse(String(raw).replace(/```json|```/gi,"").trim());}catch{answers=String(raw).split(/\r?\n/).map(s=>s.replace(/^[-*\d.)\s]+/,"").trim()).filter(Boolean);}
      if(!Array.isArray(answers)||!answers.length)throw new Error("AI không trả về câu trả lời hợp lệ");
      sendResponse({ok:true,answers:answers.map(a=>String(a).trim().slice(0,500))});
    }catch(e){sendResponse({ok:false,error:friendlyAiError(e,msg.aiConfig?.provider||"Gemini")});}})();return true;
  }
  if(msg.action==="aiTest"){
    (async()=>{
      try{
        const own=msg.aiConfig||{},provider=own.provider||"gemini",key=normalizeApiKey(own.key),model=own.model||"",customUrl=own.url||"";
        if(!key)throw new Error("Chưa nhập API Key");
        if(!model)throw new Error("Chưa chọn Model");
        if(provider==="custom"&&!customUrl)throw new Error("Chưa nhập Custom URL");
        const testPrompt="Chỉ trả về đúng một từ: OK";let result="";
        if(provider==="gemini")result=await callGemini(key,model,"Kiểm tra kết nối",testPrompt,false);
        else if(provider==="claude"||provider==="Muse")result=await callClaude(key,model,"Kiểm tra kết nối",testPrompt,false);
        else{const def=AI_DEFAULTS[provider]||AI_DEFAULTS.openai;result=await callOpenAICompatible(key,customUrl||def.url,model||def.model,"Kiểm tra kết nối",testPrompt,false);}
        if(!String(result||"").trim())throw new Error("API kết nối nhưng trả về nội dung rỗng");
        sendResponse({ok:true,result:String(result).trim().slice(0,120)});
      }catch(e){sendResponse({ok:false,error:friendlyAiError(e,msg.aiConfig?.provider||"Gemini")});}
    })();
    return true;
  }
  if(msg.action==="aiGenerateGroupPost"){
    (async()=>{
      try{
        const cfg=await chrome.storage.sync.get(["aiProvider","aiApiKey","aiModel","aiCustomUrl","aiKeys"]),own=msg.aiConfig||{};
        const provider=own.provider||cfg.aiProvider||"gemini", saved=cfg.aiKeys?.[provider]||{};
        const key=normalizeApiKey(own.key||saved.key||cfg.aiApiKey||""), model=own.model||saved.model||cfg.aiModel||"", customUrl=own.url||saved.url||cfg.aiCustomUrl||"";
        if(!key) throw new Error("Chưa nhập API Key cho "+provider);
        let content="";
        const background=msg.background&&typeof msg.background==="object"?msg.background:{};
        const groupPrompt=strictGroupPostPrompt(msg.prompt||"",background);
        if(provider==="gemini") content=await callGemini(key,model||"gemini-flash-lite-latest",msg.groupName,groupPrompt,false);
        else if(provider==="claude"||provider==="Muse") content=await callClaude(key,model,msg.groupName,groupPrompt,false);
        else{
          const def=AI_DEFAULTS[provider]||AI_DEFAULTS.openai;
          content=await callOpenAICompatible(key,customUrl||def.url,model||def.model,msg.groupName,groupPrompt,false);
        }
        content=cleanGroupPost(content,background);
        if(!content) throw new Error("AI trả về nội dung rỗng");
        sendResponse({ok:true,content,length:content.length,backgroundEligible:!!background.enabled&&content.length<=Math.min(140,Math.max(40,parseInt(background.maxChars)||100))});
      }catch(e){sendResponse({ok:false,error:friendlyAiError(e,msg.aiConfig?.provider||"Gemini")});}
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
          for(const char of inputText){
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
        let customUrl = cfg.aiCustomUrl || "";
        // neu co aiKeys multi
        if(cfg.aiKeys && cfg.aiKeys[provider]){
          const p = cfg.aiKeys[provider];
          apiKey = p.key || apiKey;
          model = p.model || model;
          customUrl = p.url || customUrl;
        }
        if(!apiKey) throw new Error("Chua nhap API Key cho " + provider + ". Vao tab AI de nhap.");

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
          if(!customUrl) throw new Error("Chua nhap URL cho Custom API");
          const m = model || "gpt-3.5-turbo";
          comment = await callOpenAICompatible(apiKey, customUrl, m, msg.postText, promptTemplate);
        } else {
          throw new Error("Provider khong ho tro: "+provider);
        }
        comment=cleanGeneratedComment(comment);
        if(!comment) throw new Error("AI tra ve rong");
        sendResponse({ ok:true, comment });
      } catch(e){
        console.error("[AI] loi",e);
        sendResponse({ ok:false, error: e.message });
      }
    })();
    return true; // async
  }
});
