const DEFAULTS = { targetLanguage: "ur", sourceLanguage: "auto", mode: "both" };
const pageTranslationControllers = new Map();
const HISTORY_KEY = "bbTranslationHistory";
const EXCLUSIONS_KEY = "bbExcludedSites";
const HISTORY_LIMIT = 40;

async function getSettings() {
  try { return { ...DEFAULTS, ...(await chrome.storage.sync.get(DEFAULTS)) }; }
  catch { return { ...DEFAULTS }; }
}
function splitText(text, limit = 1400) {
  const parts=[]; let remaining=text;
  while(remaining.length>limit){let cut=remaining.lastIndexOf(" ",limit);if(cut<limit*.55)cut=limit;parts.push(remaining.slice(0,cut));remaining=remaining.slice(cut);}
  if(remaining)parts.push(remaining); return parts;
}
async function saveHistory(sourceText, translatedText, sourceLanguage, targetLanguage) {
  if (!sourceText || !translatedText) return;
  try {
    const data=await chrome.storage.local.get({[HISTORY_KEY]:[]});
    const history=Array.isArray(data[HISTORY_KEY])?data[HISTORY_KEY]:[];
    history.unshift({id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      sourceText:String(sourceText).slice(0,5000),translatedText:String(translatedText).slice(0,5000),
      sourceLanguage,targetLanguage,createdAt:Date.now()});
    await chrome.storage.local.set({[HISTORY_KEY]:history.slice(0,HISTORY_LIMIT)});
  } catch(e) { console.warn("Blue Bridge could not save local history",e); }
}
async function translateChunk(text, source, target, jobId=null) {
  const params=new URLSearchParams({client:"gtx",sl:source==="auto"?"auto":source,tl:target,dt:"t",q:text});
  const controller=new AbortController();
  if(jobId){if(!pageTranslationControllers.has(jobId))pageTranslationControllers.set(jobId,new Set());pageTranslationControllers.get(jobId).add(controller);}
  const timeout=setTimeout(()=>controller.abort(),20000); let response;
  try {
    response=await fetch(`https://translate.googleapis.com/translate_a/single?${params}`,{method:"GET",cache:"no-store",signal:controller.signal});
  } catch(error) {
    if(error.name==="AbortError"){if(jobId&&!pageTranslationControllers.has(jobId))throw new Error("Translation stopped.");throw new Error("The translation service took too long. Please try again.");}
    throw new Error("Could not reach the translation service. Check your internet connection.");
  } finally {
    clearTimeout(timeout);
    if(jobId&&pageTranslationControllers.has(jobId)){const set=pageTranslationControllers.get(jobId);set.delete(controller);if(!set.size)pageTranslationControllers.delete(jobId);}
  }
  if(!response.ok){if(response.status===429)throw new Error("The translation service is receiving too many requests. Wait a little and try again.");throw new Error(`Translation service returned HTTP ${response.status}.`);}
  let data;try{data=await response.json();}catch{throw new Error("The translation service returned an unreadable response.");}
  const translated=(data?.[0]||[]).map(row=>row?.[0]||"").join("");
  if(!translated)throw new Error("No translation was returned. Try again in a moment.");
  return translated;
}
async function translate(text,source="auto",target="ur",jobId=null){
  if(typeof text!=="string"||!text.trim())throw new Error("Enter some text to translate.");
  if(text.length>50000)throw new Error("This text section is unusually large. Please translate a smaller section.");
  if(!target||target==="auto")throw new Error("Choose a target language.");
  const translated=[];for(const chunk of splitText(text))translated.push(await translateChunk(chunk,source||"auto",target,jobId));
  return translated.join("");
}
function normalizeHost(value){
  let raw=String(value||"").trim().toLowerCase();if(!raw)return "";
  try {const url=new URL(raw.includes("://")?raw:`https://${raw}`);return url.hostname.replace(/^www\./,"");}
  catch{return raw.replace(/^https?:\/\//,"").replace(/^www\./,"").split(/[/?#]/)[0];}
}
async function isExcluded(url){
  const host=normalizeHost(url);if(!host)return false;
  const { [EXCLUSIONS_KEY]:items=[] }=await chrome.storage.local.get({[EXCLUSIONS_KEY]:[]});
  return items.some(item=>{const domain=normalizeHost(item);return domain&&(host===domain||host.endsWith(`.${domain}`));});
}
async function sendTabAction(tabId,type,value){
  const message={type};
  if(type==="BB_SHOW_TRANSLATION")message.text=value;
  else if(value!==undefined)message.target=value;
  try{return await chrome.tabs.sendMessage(tabId,message);}
  catch {
    await chrome.scripting.executeScript({target:{tabId},files:["content.js"]});
    await chrome.scripting.insertCSS({target:{tabId},files:["content.css"]});
    return chrome.tabs.sendMessage(tabId,message);
  }
}
chrome.runtime.onInstalled.addListener(()=>{
  chrome.contextMenus.removeAll(()=>{
    chrome.contextMenus.create({id:"blue-bridge-selection",title:"Translate selection with Blue Bridge",contexts:["selection"]});
  });
});
chrome.contextMenus.onClicked.addListener(async(info,tab)=>{
  if(info.menuItemId!=="blue-bridge-selection"||!tab?.id)return;
  try{
    if(await isExcluded(tab.url))return;
    const s=await getSettings(),source=info.selectionText||"";
    const translatedText=await translate(source,s.sourceLanguage,s.targetLanguage);
    await saveHistory(source,translatedText,s.sourceLanguage,s.targetLanguage);
    await sendTabAction(tab.id,"BB_SHOW_TRANSLATION",translatedText);
  }catch(error){try{await sendTabAction(tab.id,"BB_SHOW_TRANSLATION",`Blue Bridge: ${error.message}`);}catch{}}
});
chrome.commands.onCommand.addListener(async command=>{
  if(command==="_execute_action")return;
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!tab?.id||await isExcluded(tab.url))return;
  try{
    if(command==="translate-page"){const s=await getSettings();await sendTabAction(tab.id,"BB_TRANSLATE_PAGE",s.targetLanguage);}
    if(command==="restore-page")await sendTabAction(tab.id,"BB_RESTORE_PAGE");
    if(command==="translate-selection"){
      const selected=await sendTabAction(tab.id,"BB_GET_SELECTION");
      if(!selected?.text) return;
      const s=await getSettings(),translated=await translate(selected.text,s.sourceLanguage,s.targetLanguage);
      await saveHistory(selected.text,translated,s.sourceLanguage,s.targetLanguage);
      await sendTabAction(tab.id,"BB_SHOW_TRANSLATION",translated);
    }
  }catch(e){console.warn("Blue Bridge shortcut could not run on this page",e);}
});
chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  if(message?.type==="BB_CANCEL_TRANSLATION"){
    const controllers=pageTranslationControllers.get(message.jobId);
    if(controllers){pageTranslationControllers.delete(message.jobId);for(const c of controllers)c.abort();}
    sendResponse({ok:true});return false;
  }
  if(message?.type==="BB_TRANSLATE"){
    translate(message.text,message.sourceLanguage||"auto",message.targetLanguage||"ur",message.jobId||null)
      .then(async translatedText=>{if(!message.jobId)await saveHistory(message.text,translatedText,message.sourceLanguage||"auto",message.targetLanguage||"ur");sendResponse({ok:true,translatedText});})
      .catch(error=>sendResponse({ok:false,error:error.message}));return true;
  }
  if(message?.type==="BB_GET_SETTINGS"){
    getSettings().then(settings=>sendResponse({ok:true,settings})).catch(()=>sendResponse({ok:true,settings:{...DEFAULTS}}));return true;
  }
  return false;
});
