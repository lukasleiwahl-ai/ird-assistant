// --- VERCEL NATIVE BACKEND ---
window.VercelStorageHandler = {
    get: function(keys, callback) {
        let result = {};
        if (keys === null) {
            for (let i = 0; i < localStorage.length; i++) {
                let k = localStorage.key(i);
                try { result[k] = JSON.parse(localStorage.getItem(k)); } catch(e) { result[k] = localStorage.getItem(k); }
            }
        } else if (typeof keys === 'string') {
            let val = localStorage.getItem(keys);
            try { result[keys] = val ? JSON.parse(val) : undefined; } catch(e) { result[keys] = val; }
        } else if (Array.isArray(keys)) {
            keys.forEach(k => {
                let val = localStorage.getItem(k);
                try { result[k] = val ? JSON.parse(val) : undefined; } catch(e) { result[k] = val; }
            });
        } else if (typeof keys === 'object') {
            Object.keys(keys).forEach(k => {
                let val = localStorage.getItem(k);
                if (val !== null) {
                    try { result[k] = JSON.parse(val); } catch(e) { result[k] = val; }
                } else {
                    result[k] = keys[k];
                }
            });
        }
        if (callback) setTimeout(() => callback(result), 0);
        // Support both the legacy callback API and modern async/await callers.
        // The previous implementation returned undefined, so `await get()`
        // resolved immediately and silently discarded the saved settings.
        return Promise.resolve(result);
    },
    set: function(data, callback) {
        Object.keys(data).forEach(k => {
            let val = typeof data[k] === 'object' ? JSON.stringify(data[k]) : data[k];
            localStorage.setItem(k, val);
        });
        if (callback) setTimeout(callback, 0);
    },
    remove: function(keys, callback) {
        let keyList = Array.isArray(keys) ? keys : [keys];
        keyList.forEach(k => localStorage.removeItem(k));
        if (callback) setTimeout(callback, 0);
    }
};
window.VercelStorage = { sync: window.VercelStorageHandler, local: window.VercelStorageHandler };

window.VercelTabs = {
    create: function(opt) { window.open(opt.url, '_blank'); }
};

window.VercelBackend = {
    openOptionsPage: function() { window.location.href = 'options.html'; },
    onMessage: {
        addListener: function(fn) {
            window.addEventListener('message', (e) => {
                if (e.data && e.data.action) fn(e.data, {}, () => {});
            });
        }
    },
    sendMessage: async function(message, callback) {
        const getSettings = () => new Promise(res => window.VercelStorage.sync.get(['endpointUrl', 'spreadsheetId', 'sheetName', 'historySheetName', 'staffName', 'computerName', 'reminderMinutes'], res));

        // Run user-gesture-sensitive local tests before awaiting settings storage.
        // This lets the audio test retain the browser's transient user activation.
        if (message.type === 'TEST_NOTIFICATION') {
            let soundOk = !message.withSound;
            let bannerOk = false;
            let soundError = "";
            let bannerError = "";
            if (message.withSound) {
                try {
                    const audio = new Audio('order_overdue_alarm.wav');
                    audio.preload = "auto";
                    await audio.play();
                    soundOk = true;
                } catch(e) {
                    soundError = "Audio playback was blocked or unavailable. Click the test button again and check browser sound permissions.";
                }
            }
            if (typeof Notification === "undefined") {
                bannerError = "This browser does not support notifications.";
            } else {
                try {
                    let permission = Notification.permission;
                    if (permission === "default") permission = await Notification.requestPermission();
                    if (permission === "granted") {
                        if ("serviceWorker" in navigator) {
                            await navigator.serviceWorker.register("./service-worker.js");
                            const registration = await navigator.serviceWorker.ready;
                            await registration.showNotification("IRD Assistant", {body:"Test Banner Berhasil!", icon:"./icon128.png", badge:"./icon48.png", tag:"ird-test-banner", data:{url:"./index.html?tab=tasks"}});
                        } else {
                            new Notification("IRD Assistant", {body:"Test Banner Berhasil!", icon:"./icon48.png"});
                        }
                        bannerOk = true;
                    } else bannerError = "Notification permission is " + permission + ". Allow notifications for this site in browser settings.";
                } catch(e) { bannerError = "Could not display notification: " + String(e && e.message || e); }
            }
            const ok = bannerOk && soundOk;
            const res = {ok:ok, sound:soundOk, banner:bannerOk, error:[bannerError,soundError].filter(Boolean).join(" "), message:ok?"Banner and alarm test completed.":"One or more notification tests failed."};
            if(callback) callback(res);
            return res;
        }
        
        if (message.action === 'playAlarm' || message.type === 'PLAY_ALARM') {
            try { new Audio('order_overdue_alarm.wav').play(); } catch(e){}
            return {ok: true};
        }

        if (message.type === 'GET_PENDING') {
            const p = localStorage.getItem('pendingRequest');
            return p ? {ok: true, request: JSON.parse(p)} : {ok: false};
        }
        if (message.type === 'CLEAR_PENDING') {
            localStorage.removeItem('pendingRequest');
            return {ok: true};
        }
        if (message.type === 'GET_ALERT' || message.type === 'CLEAR_ALERT') {
            return {ok: true, alert: null};
        }
        if (message.type === 'EVALUATE_LOCAL_NOTIFICATIONS') {
            return {ok: true};
        }

        const s = await getSettings();
        if (!s.endpointUrl) return {ok: false, error: "Web App URL belum diisi di Settings."};
        if (!s.spreadsheetId) return {ok: false, error: "Spreadsheet ID belum diisi di Settings."};
        
        let payload = { spreadsheetId: s.spreadsheetId, sheetName: s.sheetName || "LIVE REQUESTS", historySheetName: s.historySheetName || "HISTORY" };
        switch (message.type) {
            case 'TEST_CONNECTION': payload.action = 'testConnection'; break;
            case 'SAVE_REQUEST': payload.action = 'createRequest'; payload.request = message.request; payload.staffName = s.staffName; payload.computerName = s.computerName; break;
            case 'LIST_LIVE': 
            case 'SYNC_NOW': payload.action = 'listLive'; payload.sheetName = s.sheetName || 'LIVE REQUESTS'; payload.reminderMinutes = s.reminderMinutes || 5; break;
            case 'LIST_TODAY_HISTORY': payload.action = 'listTodayHistory'; payload.historySheetName = s.historySheetName || 'HISTORY'; break;
            case 'ACKNOWLEDGE_REQUEST': payload.action = 'acknowledgeRequest'; Object.assign(payload, message); break;
            case 'HANDOVER_REQUEST': payload.action = 'handoverRequest'; Object.assign(payload, message); break;
            case 'COMPLETE_REQUEST': payload.action = 'completeRequest'; Object.assign(payload, message); break;
            default: return {ok: false, error: "Unknown action: " + message.type};
        }
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);
            let response;
            let raw;
            try {
                response = await fetch(s.endpointUrl, {
                    method: "POST",
                    body: JSON.stringify(payload),
                    headers: { "Content-Type": "text/plain;charset=utf-8" },
                    signal: controller.signal,
                    cache: "no-store"
                });
                raw = await response.text();
            } finally {
                clearTimeout(timeoutId);
            }
            let data;
            try { data = JSON.parse(raw); }
            catch (_) { throw new Error("Backend returned an invalid response. Check the Apps Script deployment and execution log."); }
            if (!response.ok) throw new Error("HTTP " + response.status + ": " + (data.error || response.statusText || "Request failed"));
            if (callback) callback(data);
            return data;
        } catch (e) {
            const detail = e && e.name === "AbortError" ? "Request timed out after 15 seconds." : String(e && e.message || e);
            const err = {ok: false, error: "Backend connection failed: " + detail};
            if (callback) callback(err);
            return err;
        }
    }
};
// --- END VERCEL NATIVE BACKEND ---

// v2.7.9.3 desktop Ack/Handover: controls are shown on live cards and enabled on staff selection.
/* IRD Assistant v2.7.5 */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
let settings = {};
let pending = null;
let liveRows = [];
let completedRows = [];
let activeTab = "new";
let completedDateKey = localDateInputValue();
let lastCompletedRefreshAt = 0;
let attachedImages = [];
let attachedRemarkImages = [];
let pendingCompletion = null;
const COMPLETED_CACHE_KEY = 'completedHistoryByDate';

const DEFAULTS = {endpointUrl:"",spreadsheetId:"",sheetName:"LIVE REQUESTS",historySheetName:"HISTORY",staffName:"",staffList:"",defaultTiming:20,reminderMinutes:5,computerName:"",syncIntervalSeconds:10};
function getNotificationChoice(){
  return document.querySelector('input[name="notification"]:checked')?.value || "banner";
}
function setNotificationChoice(value){
  const v=value === "banner-alarm" ? "banner-alarm" : "banner";
  const input=document.querySelector(`input[name="notification"][value="${v}"]`);
  if(input) input.checked=true;
  document.querySelectorAll(".notification-option").forEach(el=>el.classList.toggle("selected",el.dataset.value===v));
}

function normalizeSpreadsheetId(value){
  const v=String(value||"").trim();
  if(!v) return "";
  const m=v.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m?m[1]:v.replace(/[?#].*$/i,"").replace(/\/edit.*$/i,"").trim();
}
const IRD_TIME_ZONE = 'Asia/Jakarta';
function jakartaDateTimeParts(date = new Date()){
  const parts=new Intl.DateTimeFormat('en-GB',{
    timeZone:IRD_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).formatToParts(date);
  const values={};
  parts.forEach(part=>{if(part.type!=='literal') values[part.type]=part.value;});
  return values;
}
function localDateInputValue(date = new Date()){
  const p=jakartaDateTimeParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}
function localTimeInputValue(date = new Date()){
  const p=jakartaDateTimeParts(date);
  return `${p.hour}:${p.minute}`;
}
function parseDueInput(){
  const date=$('dueDate').value,time=$('dueTime').value;
  if(!date||!time) return null;
  // Due date/time fields represent hotel local time, not the device timezone.
  const dt=new Date(`${date}T${time}:00+07:00`);
  return Number.isFinite(dt.getTime())?dt:null;
}
function updateConnectionIndicator(){
  const hasEndpoint=Boolean(String(settings.endpointUrl||'').trim());
  const hasSpreadsheet=Boolean(normalizeSpreadsheetId(settings.spreadsheetId));
  const configured=hasEndpoint&&hasSpreadsheet;
  $('connectionDot').className='dot '+(configured?'ok':'bad');
  $('connectionText').textContent=configured?'Google Sheets connected':'Google Sheets not configured';
}

async function refreshSettingsSnapshot(){
  const stored=await VercelStorage.sync.get(DEFAULTS);
  settings={...DEFAULTS,...(stored||{})};
  $('computerText').textContent=settings.computerName||"";
  updateConnectionIndicator();
  return settings;
}

async function loadSettings(){
  await refreshSettingsSnapshot();
  $('createdBy').value=settings.staffName||"";
  $('timing').value=String(settings.defaultTiming||20);
  $('dueDate').value=localDateInputValue();
  populatePics();
  updateDueFromTiming();
}
function populatePics(){
  const names=String(settings.staffList||"").split(",").map(s=>s.trim()).filter(Boolean);
  if(settings.staffName&&!names.includes(settings.staffName)) names.unshift(settings.staffName);
  $('pic').innerHTML = names.length ? names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('') : '<option value="">Select PIC</option>';
  if(settings.staffName) $('pic').value=settings.staffName;
}
function updateDueFromTiming(){
  const mins=Math.min(60,Math.max(5,Number($('timing').value)||20));
  $('timing').value=String(mins);
  const due=new Date(Date.now()+mins*60000);
  $('dueDate').value=localDateInputValue(due);
  $('dueTime').value=localTimeInputValue(due);
}
async function getPending(){const r=await VercelBackend.sendMessage({type:'GET_PENDING'});return r?.ok?r.request:null;}
function showAlert(alert){
  const banner=$('alertBanner');
  if(!alert){banner.className='alert hidden';banner.innerHTML='';return;}
  banner.className=`alert ${esc(alert.level||'due')}`;
  const extra=alert.level==='soon'?`Due in ${esc(alert.reminderMinutes||5)} min`:alert.level==='overdue'?`Overdue by ${esc(alert.overdueMinutes||1)} min`:'Due now';
  const count=Number(alert.count||1);
  banner.innerHTML=`<span class="alert-title">🔔 ${esc(alert.label||'REMINDER')} • Room ${esc(alert.room||'-')}</span><small>${esc(alert.request||'Guest request')} • ${extra} • Due ${esc(alert.dueAt||'-')}${count>1?` • +${count-1} more task(s)`:''}</small>`;
  banner.setAttribute('role','alert');
  banner.setAttribute('aria-live','assertive');
}

async function ensureServiceWorker(){
  if(!('serviceWorker' in navigator) || !window.isSecureContext) return null;
  try { return await navigator.serviceWorker.register('./service-worker.js',{scope:'./'}); }
  catch(error){ console.warn('IRD Assistant service worker registration failed:',error); return null; }
}

async function showDeviceNotification(title,body,tag,requestId){
  if(typeof Notification==='undefined' || Notification.permission!=='granted') return false;
  try{
    let registration=await navigator.serviceWorker?.getRegistration();
    if(!registration) registration=await ensureServiceWorker();
    if(registration && navigator.serviceWorker){
      registration=await navigator.serviceWorker.ready;
    }
    if(registration && registration.showNotification){
      await registration.showNotification(title,{body,icon:'./icon128.png',badge:'./icon48.png',tag,renotify:false,requireInteraction:true,data:{url:'./index.html?tab=tasks',requestId}});
    }else{
      new Notification(title,{body,icon:'./icon48.png',tag});
    }
    return true;
  }catch(error){console.warn('Notification display failed:',error);return false;}
}

function evaluateDueNotifications(rows){
  const now=Date.now();
  const reminderMs=Math.max(0,Number(settings.reminderMinutes)||0)*60000;
  const active=[];
  (Array.isArray(rows)?rows:[]).forEach(row=>{
    const dueMs=Date.parse(row.dueIso||'');
    if(!Number.isFinite(dueMs)) return;
    const diff=dueMs-now;
    let level='';
    if(diff<=-60000) level='overdue';
    else if(diff<=0) level='due';
    else if(reminderMs>0 && diff<=reminderMs) level='soon';
    if(level) active.push({row,diff,level,dueMs});
  });
  const rank={overdue:0,due:1,soon:2};
  active.sort((a,b)=>rank[a.level]-rank[b.level] || a.dueMs-b.dueMs);
  if(!active.length){showAlert(null);return;}
  const first=active[0],row=first.row;
  const label=first.level==='overdue'?'OVERDUE':first.level==='due'?'DUE NOW':'DUE SOON';
  showAlert({level:first.level,label,room:row.room,request:row.request,dueAt:row.dueAt,reminderMinutes:Math.ceil(first.diff/60000),overdueMinutes:Math.max(1,Math.floor(-first.diff/60000)),count:active.length});

  active.forEach(item=>{
    const id=String(item.row.id||'');
    if(!id) return;
    const stage=item.level;
    const key=`ird-notified:${id}:${stage}`;
    if(localStorage.getItem(key)) return;
    const rowItem=item.row;
    const noticeTitle=stage==='overdue'?'IRD Assistant — OVERDUE':stage==='due'?'IRD Assistant — DUE NOW':'IRD Assistant — DUE SOON';
    const noticeBody=`Room ${rowItem.room||'-'} • ${rowItem.request||'Guest request'}`;
    if(typeof Notification!=='undefined' && Notification.permission==='granted'){
      localStorage.setItem(key,'pending');
      void showDeviceNotification(noticeTitle,noticeBody,`ird-${id}`,id).then(shown=>{
        if(shown) localStorage.setItem(key,String(Date.now()));
        else localStorage.removeItem(key);
      });
    }
    if(stage==='due' && String(rowItem.notification||'banner').includes('alarm')){
      const alarmKey=`ird-alarm:${id}:due`;
      if(!localStorage.getItem(alarmKey)){
        localStorage.setItem(alarmKey,'pending');
        const audio=new Audio('./order_overdue_alarm.wav');
        audio.play().then(()=>localStorage.setItem(alarmKey,String(Date.now()))).catch(()=>localStorage.removeItem(alarmKey));
      }
    }
  });
}
function populate(p){
  pending=p||null;
  if(!p) return;
  $('requestForm').classList.remove('hidden'); $('savedState').classList.add('hidden'); $('formError').textContent='';
  $('room').value=p.room||""; $('guestName').value=p.guestName||""; $('request').value=p.request||""; $('priority').value=p.priority||"Normal";
  $('timing').value=String(Math.min(60,Math.max(5,Number(p.timing)||Number(settings.defaultTiming)||20)));
  const due = p.dueIso ? new Date(p.dueIso) : null;
  if(due && Number.isFinite(due.getTime())){ $('dueDate').value=localDateInputValue(due); $('dueTime').value=localTimeInputValue(due); }
  else updateDueFromTiming();
  if(p.requestedTime && /^\d{1,2}:\d{2}$/.test(p.requestedTime)) $('dueTime').value=p.requestedTime;
  setNotificationChoice(p.notification || 'banner');
  resetAttachedImages();
  $('importBanner').classList.remove('hidden');
}
function dueIsoFromFields(){const dt=parseDueInput();return dt?dt.toISOString():null;}
function imageDataUrlSizeBytes(dataUrl){
  const s=String(dataUrl||'');
  const comma=s.indexOf(',');
  if(comma<0) return 0;
  const b64=s.slice(comma+1).replace(/\s/g,'');
  return Math.floor((b64.length*3)/4) - (b64.endsWith('==')?2:b64.endsWith('=')?1:0);
}
function revokeAttachedUrls(){
  attachedImages.forEach(x=>{if(String(x.previewUrl||'').startsWith('blob:')) URL.revokeObjectURL(x.previewUrl);});
}
function resetAttachedImages(){revokeAttachedUrls();attachedImages=[];renderAttachedImages();}
function renderAttachedImages(){
  const grid=$('imagePreviewGrid');
  if(!grid) return;
  grid.innerHTML=attachedImages.map((img,i)=>`<div class="image-preview-card"><img src="${esc(img.previewUrl)}" alt="Attached image ${i+1}"><button type="button" class="image-remove" data-index="${i}" title="Remove">×</button><span class="image-count">${i+1}/${attachedImages.length}</span></div>`).join('');
  const note=$('imageUploadNote');
  if(note) note.textContent=attachedImages.length?`${attachedImages.length} image${attachedImages.length===1?'':'s'} attached. Images are stored in Google Drive when the task is saved.`:'';
}
function fileToDataUrl(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(r.error||new Error('Could not read image.'));const ext=String(file?.name||'').toLowerCase();const fallbackMime=/\.png$/.test(ext)?'image/png':/\.webp$/.test(ext)?'image/webp':/\.heif$/.test(ext)?'image/heif':/\.heic$/.test(ext)?'image/heic':'image/jpeg';const source=String(file?.type||'').startsWith('image/')?file:new Blob([file],{type:fallbackMime});r.readAsDataURL(source);});}
function renderRemarkImages(){
  const grid=$('remarkImagePreviewGrid');
  if(!grid) return;
  grid.innerHTML=attachedRemarkImages.map((img,i)=>`<div class="image-preview-card"><img src="${esc(img.previewUrl)}" alt="Evidence image ${i+1}"><button type="button" class="image-remove remark-image-remove" data-index="${i}" title="Remove">×</button><span class="image-count">${i+1}/${attachedRemarkImages.length}</span></div>`).join('');
  const note=$('remarkImageUploadNote');
  if(note) note.textContent=attachedRemarkImages.length?`${attachedRemarkImages.length} evidence image${attachedRemarkImages.length===1?'':'s'} attached.`:'';
}
function revokeRemarkImageUrls(){attachedRemarkImages.forEach(x=>{if(String(x.previewUrl||'').startsWith('blob:')) URL.revokeObjectURL(x.previewUrl);});}
function resetRemarkImages(){revokeRemarkImageUrls();attachedRemarkImages=[];renderRemarkImages();}
function isImageFile(file){
  if(!file) return false;
  const type=String(file.type||'').toLowerCase();
  const name=String(file.name||'').toLowerCase();
  return type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|avif|gif|bmp)$/i.test(name);
}
function normalizedImageName(file,index){
  const base=String(file?.name||`image-${index+1}`).replace(/\.[^.]+$/,'').replace(/[^a-zA-Z0-9_-]+/g,'_').slice(0,80)||`image-${index+1}`;
  return `${base}.jpg`;
}
async function compressImageFile(file){
  if(!isImageFile(file)) throw new Error(`${file?.name||'File'} is not a supported image.`);
  const source=await fileToDataUrl(file);
  const img=new Image();
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('This photo format could not be opened by the browser. On iPhone, set Camera > Formats > Most Compatible, then take the photo again.'));img.src=source;});
  const maxSide=1600;
  const scale=Math.min(1,maxSide/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height));
  const w=Math.max(1,Math.round((img.naturalWidth||img.width)*scale));
  const h=Math.max(1,Math.round((img.naturalHeight||img.height)*scale));
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d');if(!ctx) throw new Error('Image processing is unavailable in this browser.');ctx.drawImage(img,0,0,w,h);
  const dataUrl=canvas.toDataURL('image/jpeg',0.82);
  const bytes=imageDataUrlSizeBytes(dataUrl);
  if(bytes>1400000) {
    const tighter=canvas.toDataURL('image/jpeg',0.68);
    if(imageDataUrlSizeBytes(tighter)<=1400000) return tighter;
    throw new Error(`${file.name||'Image'} is too large after compression. Please use a smaller image.`);
  }
  return dataUrl;
}
async function addImageFiles(files){
  const allFiles=Array.from(files||[]);
  const list=allFiles.filter(isImageFile);
  if(!list.length){if(allFiles.length) $('imageUploadNote').textContent='Please select a supported photo (JPG, PNG, WebP or a browser-supported camera image).';return;}
  const remaining=5-attachedImages.length;
  if(remaining<=0){$('imageUploadNote').textContent='Maximum 5 images per task.';return;}
  const selected=list.slice(0,remaining);
  const notes=[];
  if(list.length>remaining) notes.push('Maximum 5 images per task. Extra images were not added.');
  for(const file of selected){
    try{
      const dataUrl=await compressImageFile(file);
      attachedImages.push({name:normalizedImageName(file,attachedImages.length),mimeType:'image/jpeg',dataUrl,previewUrl:dataUrl});
    }catch(e){notes.push(e?.message||String(e));}
  }
  renderAttachedImages();
  if(notes.length) $('imageUploadNote').textContent=notes.join(' ');
}
async function addRemarkImageFiles(files){
  const allFiles=Array.from(files||[]);
  const list=allFiles.filter(isImageFile);
  if(!list.length){if(allFiles.length) $('remarkImageUploadNote').textContent='Please select a supported evidence photo.';return;}
  const remaining=5-attachedRemarkImages.length;
  if(remaining<=0){$('remarkImageUploadNote').textContent='Maximum 5 evidence images.';return;}
  const selected=list.slice(0,remaining);
  const notes=[];
  if(list.length>remaining) notes.push('Maximum 5 evidence images. Extra images were not added.');
  for(const file of selected){
    try{
      const dataUrl=await compressImageFile(file);
      attachedRemarkImages.push({name:normalizedImageName(file,attachedRemarkImages.length),mimeType:'image/jpeg',dataUrl,previewUrl:dataUrl});
    }catch(e){notes.push(e?.message||String(e));}
  }
  renderRemarkImages();
  if(notes.length) $('remarkImageUploadNote').textContent=notes.join(' ');
}
function imageRefsFromRow(row){
  if(Array.isArray(row?.images)) return row.images;
  try { return row?.images ? JSON.parse(row.images) : []; } catch (_) { return []; }
}
function remarkImageRefsFromRow(row){
  if(Array.isArray(row?.remarkImages)) return row.remarkImages;
  try { return row?.remarkImages ? JSON.parse(row.remarkImages) : []; } catch (_) { return []; }
}
function imageThumbsHtml(row, cls='task-images', source='images'){
  const images=source==='remarkImages'?remarkImageRefsFromRow(row):imageRefsFromRow(row);
  if(!images.length) return '';
  const shown=images.slice(0,4);
  return `<div class="${cls}">${shown.map((img,i)=>`<img class="${cls==='task-images'?'task-image-thumb':'completed-images'}" src="${esc(img.thumbnailUrl||img.viewUrl||'')}" data-image-url="${esc(img.viewUrl||img.thumbnailUrl||'')}" alt="${source==='remarkImages'?'Evidence':'Task'} image ${i+1}" title="Open image">`).join('')}${images.length>4?`<span class="task-image-more">+${images.length-4}</span>`:''}</div>`;
}
function openImageUrl(url){if(url) VercelTabs.create({url});}

async function saveRequest(e){
  e.preventDefault();
  const err=$('formError');err.textContent='';
  const room=$('room').value.trim(),guestName=$('guestName').value.trim(),request=$('request').value.trim();
  const timing=Math.min(60,Math.max(5,Number($('timing').value)||0)),pic=$('pic').value.trim(),dueAt=dueIsoFromFields();
  if(!room){err.textContent='Please enter a room number or room/unit name.';return;}
  if(!request){err.textContent='Please enter the guest request.';return;}
  if(!(timing>=5&&timing<=60)){err.textContent='Timing must be between 5 and 60 minutes.';return;}
  if(!dueAt){err.textContent='Please select a valid due date and time.';return;}
  if(!pic){err.textContent='Please select a PIC.';return;}
  if(!$('track').checked){err.textContent='Enable Google Sheets tracking to save this request.';return;}
  const btn=$('save');btn.disabled=true;btn.textContent='Saving…';
  const startAt=new Date();
  const notification=getNotificationChoice();
  const requestObj={room,guestName,request,priority:$('priority').value,timing,dueAt,startAt:startAt.toISOString(),pic,notification,source:pending?.source||'',sourceChat:pending?.sourceChat||'',images:attachedImages.map(({name,mimeType,dataUrl})=>({name,mimeType,dataUrl}))};
  const r=await VercelBackend.sendMessage({type:'SAVE_REQUEST',request:requestObj});
  btn.disabled=false;btn.textContent='▣ Save to Google Sheets';
  if(!r?.ok){err.textContent=r?.error||'Could not save request.';return;}
  $('requestForm').classList.add('hidden');$('savedState').classList.remove('hidden');
  $('savedState').innerHTML=`<div class="checkbig">✓</div><h3>Request Saved</h3><p><b>Room ${esc(room)}</b>${guestName?` • ${esc(guestName)}`:''}</p><p>${esc(requestObj.priority)} priority • Due: <b>${esc(r.dueAt||'')}</b></p><p>Saved to <b>${esc(settings.sheetName||'LIVE REQUESTS')}</b>.</p><div class="actions"><button id="newOne" class="secondary">New Request</button><button id="viewTasks" class="primary">View Tasks</button></div>`;
  await VercelBackend.sendMessage({type:'CLEAR_PENDING'});
  $('newOne').onclick=resetForm;$('viewTasks').onclick=()=>switchTab('tasks');
  // Refresh in the background; do not make the Save action wait for a second
  // Google Sheets round-trip.
  refreshTasks().catch(()=>{});
}
function resetForm(){
  $('requestForm').reset();
  $('track').checked=true;
  setNotificationChoice('banner');
  $('priority').value='Normal';
  $('timing').value=String(settings.defaultTiming||20);
  $('createdBy').value=settings.staffName||'';
  $('dueDate').value=localDateInputValue();
  populatePics();
  $('savedState').classList.add('hidden');
  $('requestForm').classList.remove('hidden');
  $('importBanner').classList.add('hidden');
  $('formError').textContent='';
  pending=null;
  resetAttachedImages();
  updateDueFromTiming();
}
async function startFreshNewRequest(){
  await VercelBackend.sendMessage({type:'CLEAR_PENDING'});
  resetForm();
}
function switchTab(name){
  activeTab=name;
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('active',p.id===`tab-${name}`));
  if(name==='tasks') refreshTasks();
  if(name==='completed') refreshCompleted();
}
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));
$('closeWindow').onclick=()=>window.close();$('cancel').onclick=resetForm;$('requestForm').addEventListener('submit',saveRequest);$('timing').addEventListener('change',updateDueFromTiming);$('refreshTasks').onclick=refreshTasks;$('refreshCompleted').onclick=refreshCompleted;$('openOptions').onclick=()=>VercelBackend.openOptionsPage();
$('openSheet').onclick=()=>{const id=normalizeSpreadsheetId(settings.spreadsheetId);if(id) VercelTabs.create({url:`https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/edit`});};
function classifyRow(row){
  const dueMs=Date.parse(row.dueIso||"");
  if(!Number.isFinite(dueMs)) return {state:'INVALID',label:'TIME ERROR',detail:'Time unavailable',remainingMs:NaN};
  const diff=dueMs-Date.now();
  if(diff>0){
    const reminderMs=Math.max(0,Number(settings.reminderMinutes||5))*60000;
    if(reminderMs>0 && diff<=reminderMs) return {state:'SOON',label:'DUE SOON',detail:`Due in ${Math.max(1,Math.ceil(diff/60000))} min`,remainingMs:diff};
    return {state:'PENDING',label:'PENDING',detail:`Due in ${Math.max(1,Math.ceil(diff/60000))} min`,remainingMs:diff};
  }
  if(diff>-60000) return {state:'DUE',label:'DUE NOW',detail:'Due now',remainingMs:diff};
  const overdue=Math.max(1,Math.floor((-diff)/60000));
  return {state:'OVERDUE',label:'OVERDUE',detail:`Overdue by ${overdue} min`,remainingMs:diff,overdueMinutes:overdue};
}
function getDoneByNames(){
  const names=[];
  const add=value=>{
    const n=String(value||"").trim();
    if(n && !names.includes(n)) names.push(n);
  };
  String(settings.staffList||"").split(",").forEach(add);
  add(settings.staffName);
  liveRows.forEach(row=>add(row.pic));
  return names;
}
function doneByOptions(selected=""){
  const names=getDoneByNames();
  const options=['<option value="">Select name...</option>'];
  names.forEach(name=>{
    const isSelected=String(name)===String(selected)?" selected":"";
    options.push(`<option value="${esc(name)}"${isSelected}>${esc(name)}</option>`);
  });
  if(!names.length) options.push('<option value="" disabled>No staff names configured</option>');
  return options.join('');
}
function updateDoneButtons(){
  document.querySelectorAll('.task-card').forEach(card=>{
    const select=card.querySelector('.done-by');
    const button=card.querySelector('.done');
    if(button) button.disabled=!select || !select.value;
  });
}

// v2.7.5: update task cards in place instead of replacing the entire Tasks DOM.
// This keeps native <select> controls open/stable while the live countdown updates.
const doneBySelections = new Map();

function buildTaskCard(row){
  const card=document.createElement('article');
  card.className='task-card';
  card.dataset.id=String(row.id);
  card.innerHTML=`<div class="task-top"><div class="room"></div><span class="priority"></span><span class="status hidden"></span></div><div class="req"></div><div class="task-image-slot"></div><div class="meta hidden">SLA <span class="sla"></span> min • Due <span class="due-at-legacy"></span> • <span class="countdown-legacy"></span> • PIC <span class="pic-legacy"></span></div><div class="ack-strip"><span class="ack-state"></span><span class="pic"></span></div><div class="due-strip"><span class="countdown"></span><span class="due-at"></span></div><div class="task-actions"><label class="done-by-wrap"><span>Done by :</span><select class="done-by" data-id="${esc(row.id)}"></select></label><div class="done-buttons"><button class="ack" data-id="${esc(row.id)}">✋ Ack</button><button class="handover" data-id="${esc(row.id)}">↔ Handover</button><button class="remark" data-id="${esc(row.id)}" hidden>💬 Remark</button><button class="done" data-id="${esc(row.id)}">✓ Done</button></div></div>`;
  const select=card.querySelector('.done-by');
  const selected=doneBySelections.get(String(row.id))||settings.staffName||String(row.pic||'').trim();
  select.innerHTML=doneByOptions(selected);
  select.dataset.optionsSignature=getDoneByNames().join('\u001f');
  if(selected) select.value=selected;
  return card;
}

function updateTaskCard(card,row){
  const s=classifyRow(row);
  const cls={PENDING:'pending',SOON:'soon',DUE:'due-now',OVERDUE:'overdue'}[s.state]||'overdue';
  const room=card.querySelector('.room');
  const status=card.querySelector('.status');
  const req=card.querySelector('.req');
  const sla=card.querySelector('.sla');
  const dueAt=card.querySelector('.due-at');
  const countdown=card.querySelector('.countdown');
  const pic=card.querySelector('.pic');
  const priority=card.querySelector('.priority');
  const ackState=card.querySelector('.ack-state');
  const imageSlot=card.querySelector('.task-image-slot');
  if(room) room.textContent=`Room ${row.room||''}`;
  if(status){status.className=`status ${cls} hidden`;status.textContent=s.label;}
  if(priority){const p=String(row.priority||'Normal');priority.className='priority '+p.toLowerCase();priority.textContent=(p.toLowerCase()==='urgent'?'🔴 ':p.toLowerCase()==='high'?'🟠 ':'🟢 ')+p;}
  if(req) req.textContent=String(row.request||'');
  if(sla) sla.textContent=String(row.timing??'');
  if(dueAt) dueAt.textContent='Due '+String(row.dueAt||'-');
  if(countdown){countdown.textContent=s.detail;countdown.className='countdown '+cls;}
  if(pic) pic.textContent='PIC: '+String(row.pic||'-');
  if(ackState){const acknowledged=String(row.acknowledgedBy||'').trim();ackState.textContent=acknowledged?'✓ Acknowledged by '+acknowledged:'⌛ Pending Ack';ackState.className='ack-state '+(acknowledged?'acknowledged':'pending-ack');}
  if(imageSlot) imageSlot.innerHTML=imageThumbsHtml(row,'task-images');
  card.classList.toggle('has-images',imageRefsFromRow(row).length>0);
  card.dataset.id=String(row.id);
  const select=card.querySelector('.done-by');
  const selected=doneBySelections.get(String(row.id))||settings.staffName||String(row.pic||'').trim();
  if(select){
    const signature=getDoneByNames().join('\u001f');
    if(select.dataset.optionsSignature!==signature){
      const current=selected||select.value||'';
      select.innerHTML=doneByOptions(current);
      if(current) select.value=current;
      select.dataset.optionsSignature=signature;
    }
    if(!select.value && selected && getDoneByNames().includes(selected)) select.value=selected;
    if(select.value) doneBySelections.set(String(row.id),select.value);
  }
  const staffReady=Boolean(select&&select.value);
  ['.done','.ack','.handover'].forEach(selector=>{const button=card.querySelector(selector);if(button)button.disabled=!staffReady;});
  const remarkButton=card.querySelector('.remark');if(remarkButton)remarkButton.disabled=!staffReady;
}

function renderTasks(){
  const rows=liveRows;
  $('taskCount').textContent=String(rows.length);
  const container=$('tasks');
  if(!rows.length){
    if(!container.querySelector('.empty')) container.innerHTML='<div class="empty">No live guest requests.</div>';
    return;
  }

  // Remove the empty state without rebuilding existing task cards.
  const empty=container.querySelector('.empty');
  if(empty) empty.remove();

  const wantedIds=new Set(rows.map(row=>String(row.id)));
  Array.from(container.querySelectorAll('.task-card')).forEach(card=>{
    if(!wantedIds.has(String(card.dataset.id))){
      doneBySelections.delete(String(card.dataset.id));
      card.remove();
    }
  });

  // Reuse existing cards. This is the key fix for the disappearing native dropdown.
  rows.forEach((row,index)=>{
    let card=container.querySelector(`.task-card[data-id="${CSS.escape(String(row.id))}"]`);
    if(!card){
      card=buildTaskCard(row);
      const ref=container.children[index];
      if(ref) container.insertBefore(card,ref); else container.appendChild(card);
    }
    updateTaskCard(card,row);
  });
}

function updateLiveTaskDisplay(){
  if(activeTab!=='tasks') return;
  document.querySelectorAll('.task-card').forEach(card=>{
    const id=String(card.dataset.id);
    const row=liveRows.find(r=>String(r.id)===id);
    if(row) updateTaskCard(card,row);
  });
  $('taskCount').textContent=String(liveRows.length);
}

async function refreshTasks(){
  const r=await VercelBackend.sendMessage({type:'LIST_LIVE'});
  if(!r?.ok){$('tasks').innerHTML=`<div class="error">${esc(r?.error||'Failed to load live requests.')}</div>`;$('taskCount').textContent='0';return;}
  liveRows=r.rows||[];renderTasks();
}

function completedDateKeyNow(){
  return localDateInputValue(new Date());
}
async function loadCompletedCache(dateKey=completedDateKeyNow()){
  try {
    const stored=await VercelStorage.local.get({[COMPLETED_CACHE_KEY]:{}});
    const all=stored[COMPLETED_CACHE_KEY]||{};
    return Array.isArray(all[dateKey]) ? all[dateKey] : [];
  } catch (_) { return []; }
}
async function saveCompletedCache(dateKey, rows){
  try {
    const stored=await VercelStorage.local.get({[COMPLETED_CACHE_KEY]:{}});
    const all=stored[COMPLETED_CACHE_KEY]||{};
    all[dateKey]=Array.isArray(rows)?rows:[];
    // Keep only today's local cache. Google Sheets remains the permanent archive.
    Object.keys(all).forEach(k=>{if(k!==dateKey) delete all[k];});
    await VercelStorage.local.set({[COMPLETED_CACHE_KEY]:all});
  } catch (_) {}
}

function formatCompletedTime(row){
  return String(row.completedTime||row.completedAt||'').trim() || '-';
}

function completedCardHtml(row){
  const room=esc(row.room||'-');
  const guest=esc(row.guestName||'');
  const request=esc(row.request||'Guest request');
  const task=esc(row.task||'');
  const doneBy=esc(row.doneBy||'-');
  const duration=String(row.duration ?? '').trim();
  const status=esc(row.status||'COMPLETED');
  const time=esc(formatCompletedTime(row));
  const date=esc(row.completedDate||row.date||'');
  const remark=String(row.remark||row.remarks||'').trim();
  return `<article class="completed-card"><div class="completed-top"><span class="completed-check">✓</span><div><div class="completed-room">Room ${room}</div>${guest?`<div class="completed-guest">${guest}</div>`:''}</div><span class="completed-time">${time}</span></div><div class="completed-request">${task?`<b>${task}</b> • `:''}${request}</div>${imageThumbsHtml(row,'completed-images','images')}${remark?`<div class="remark-preview"><b>Remark:</b> ${esc(remark)}</div>`:''}${remarkImageRefsFromRow(row).length?`<div class="remark-evidence-preview"><b>Evidence:</b>${imageThumbsHtml(row,'completed-images','remarkImages')}</div>`:''}<div class="completed-meta"><span>Done by <b>${doneBy}</b></span>${duration!==''?`<span>Duration <b>${esc(duration)} min</b></span>`:''}<span class="${status.toLowerCase().includes('pending')?'pending-status':''}">${status}</span>${date?`<span>${date}</span>`:''}</div></article>`;
}

function renderCompleted(){
  const rows=Array.isArray(completedRows)?completedRows:[];
  $('completedCount').textContent=String(rows.length);
  const container=$('completed');
  if(!rows.length){
    container.innerHTML='<div class="completed-empty">No completed tasks for today.</div>';
    return;
  }
  container.innerHTML=rows.map(completedCardHtml).join('');
}

async function refreshCompleted(){
  const currentKey=completedDateKeyNow();
  if(currentKey!==completedDateKey){
    completedDateKey=currentKey;
    completedRows=[];
    await saveCompletedCache(currentKey, []);
    renderCompleted();
  }

  // Load the same-day local cache first. This prevents a temporary Google Apps
  // Script/read mismatch from making a just-completed task disappear.
  const cached=await loadCompletedCache(currentKey);
  if(cached.length){
    completedRows=cached;
    renderCompleted();
  }

  const r=await VercelBackend.sendMessage({type:'LIST_TODAY_HISTORY'});
  if(!r?.ok){
    // Keep the local same-day cache only as an offline fallback.
    lastCompletedRefreshAt=Date.now();
    if(completedRows.length) renderCompleted();
    else {
      $('completed').innerHTML=`<div class="completed-error">${esc(r?.error||"Failed to load today's completed history.")}</div>`;
      $('completedCount').textContent='0';
    }
    return;
  }

  const remote=Array.isArray(r.rows)?r.rows:[];
  // Google Sheets HISTORY is the shared source of truth across computers.
  // The local cache is only an offline/temporary fallback when the remote read fails.
  // Never merge stale local-only rows into a successful remote result because that
  // would make one computer display records that do not exist in the shared sheet.
  completedRows=remote.filter(row=>{
    const d=String(row.completedDate||row.date||'').trim();
    return !d || d===currentKey || d.split('/').reverse().join('-')===currentKey;
  });
  completedDateKey=currentKey;
  await saveCompletedCache(currentKey, completedRows);
  lastCompletedRefreshAt=Date.now();
  renderCompleted();
}
document.querySelectorAll('.notification-option').forEach(option=>{
  option.addEventListener('click',()=>setNotificationChoice(option.dataset.value));
});

$('tasks').addEventListener('change',e=>{
  const select=e.target.closest('.done-by');
  if(select){
    const card=select.closest('.task-card');
    const button=card?.querySelector('.done');
    if(button) button.disabled=!select.value;
    const remarkButton=card?.querySelector('.remark');if(remarkButton) remarkButton.disabled=!select.value;
    const ackButton=card?.querySelector('.ack');if(ackButton) ackButton.disabled=!select.value;
    const handoverButton=card?.querySelector('.handover');if(handoverButton) handoverButton.disabled=!select.value;
    const id=String(select.dataset.id||card?.dataset.id||'');
    if(id){
      if(select.value) doneBySelections.set(id,select.value);
      else doneBySelections.delete(id);
    }
  }
});
function setCompletionMode(mode){
  const value=mode==='pending'?'pending':'full';
  document.querySelectorAll('.completion-option').forEach(el=>el.classList.toggle('selected',el.dataset.value===value));
  const input=document.querySelector(`input[name="completionMode"][value="${value}"]`); if(input) input.checked=true;
  const required=$('remarkRequired');
  const field=$('remarkInput');
  if(required) required.textContent=value==='pending'?'*':'';
  if(field){field.required=value==='pending';field.placeholder=value==='pending'?'Example: Towel delivered. Amenities not available, will send later.':'Optional internal remark.';}
}
function openCompletionModal(sourceRow,requestId,staff){
  pendingCompletion={sourceRow,requestId,staff};
  $('remarkTaskLabel').textContent=`Room ${sourceRow.room||'-'} • ${sourceRow.request||'Guest request'}`;
  $('remarkInput').value='';$('remarkError').textContent='';
  resetRemarkImages();
  setCompletionMode('full');
  $('remarkModal').classList.remove('hidden');
  setTimeout(()=>$('remarkInput').focus(),0);
}
function closeCompletionModal(){pendingCompletion=null;resetRemarkImages();$('remarkModal').classList.add('hidden');}
async function confirmCompletion(){
  if(!pendingCompletion) return;
  const {sourceRow,requestId,staff}=pendingCompletion;
  const mode=document.querySelector('input[name="completionMode"]:checked')?.value||'full';
  const remark=String($('remarkInput').value||'').trim();
  const remarkImages=attachedRemarkImages.map(({name,mimeType,dataUrl})=>({name,mimeType,dataUrl}));
  if(mode==='pending' && !remark){$('remarkError').textContent='Remark is required when completing with pending.';return;}
  const card=document.querySelector(`.task-card[data-id="${CSS.escape(requestId)}"]`);
  const done=card?.querySelector('.done');
  const optimisticStatus=mode==='pending'?'Completed with Pending':'COMPLETED';
  const optimistic={id:requestId,room:sourceRow.room,guestName:sourceRow.guestName,request:sourceRow.request,task:sourceRow.task||'',doneBy:staff,completedTime:localTimeInputValue(),completedDate:completedDateKeyNow(),date:completedDateKeyNow(),duration:sourceRow.startIso?Math.max(0,Math.round((Date.now()-Date.parse(sourceRow.startIso))/60000)):'',status:optimisticStatus,remark,images:imageRefsFromRow(sourceRow),remarkImages:remarkImages.map((x,i)=>({name:x.name,thumbnailUrl:x.dataUrl,viewUrl:x.dataUrl}))};
  if(done){done.disabled=true;done.textContent='Completing…';}
  closeCompletionModal();
  doneBySelections.delete(requestId);
  liveRows=liveRows.filter(row=>String(row.id)!==requestId);
  completedRows=[optimistic,...completedRows.filter(row=>String(row.id)!==requestId)];
  void saveCompletedCache(completedDateKeyNow(),completedRows);renderTasks();renderCompleted();
  const r=await VercelBackend.sendMessage({type:'COMPLETE_REQUEST',requestId,doneBy:staff,completionStatus:mode==='pending'?'Completed with Pending':'',remark,remarkImages});
  if(!r?.ok){
    completedRows=completedRows.filter(row=>String(row.id)!==requestId);void saveCompletedCache(completedDateKeyNow(),completedRows);
    liveRows=[sourceRow,...liveRows.filter(row=>String(row.id)!==requestId)];renderTasks();renderCompleted();alert(r?.error||'Could not complete request.');return;
  }
  const duration=r.duration,doneBy=r.doneBy||staff;
  const idx=completedRows.findIndex(row=>String(row.id)===requestId);
  if(idx>=0){completedRows[idx]={...completedRows[idx],duration,doneBy,status:r.status||optimisticStatus,completedDate:r.completedDate||completedRows[idx].completedDate,completedTime:r.completedTime||completedRows[idx].completedTime,completedTimestamp:r.completedTimestamp||'',remark:r.remark??remark,remarkImages:r.remarkImages||[]};void saveCompletedCache(completedDateKeyNow(),completedRows);renderCompleted();}
  setTimeout(()=>refreshCompleted().catch(()=>{}),1200);refreshTasks().catch(()=>{});
}
$('tasks').addEventListener('change',e=>{
  const select=e.target.closest('.done-by');
  if(select){
    const card=select.closest('.task-card');const button=card?.querySelector('.done');if(button) button.disabled=!select.value;
    const remarkButton=card?.querySelector('.remark');if(remarkButton) remarkButton.disabled=!select.value;
    const ackButton=card?.querySelector('.ack');if(ackButton) ackButton.disabled=!select.value;
    const handoverButton=card?.querySelector('.handover');if(handoverButton) handoverButton.disabled=!select.value;
    const id=String(select.dataset.id||card?.dataset.id||'');if(id){if(select.value) doneBySelections.set(id,select.value);else doneBySelections.delete(id);}
  }
});
$('tasks').addEventListener('click',async e=>{
  const img=e.target.closest('[data-image-url]');if(img){openImageUrl(img.dataset.imageUrl);return;}
  const workflowAction=e.target.closest('.ack,.handover');
  if(workflowAction){
    const card=workflowAction.closest('.task-card');const select=card?.querySelector('.done-by');const staff=String(select?.value||'').trim();
    const requestId=String(workflowAction.dataset.id||'');if(!staff||!requestId)return;
    const row=liveRows.find(x=>String(x.id)===requestId);if(!row)return;
    let message;
    if(workflowAction.classList.contains('ack')){
      workflowAction.disabled=true;workflowAction.textContent='Saving…';
      message={type:'ACKNOWLEDGE_REQUEST',requestId,staffName:staff,clientTime:localTimeInputValue()};
    }else{
      const target=prompt('Handover this task to which staff member?\nAvailable staff: '+getDoneByNames().join(', '));
      if(!target||!target.trim())return;
      if(target.trim()===staff){alert('Choose a different staff member for handover.');return;}
      workflowAction.disabled=true;workflowAction.textContent='Saving…';
      message={type:'HANDOVER_REQUEST',requestId,toStaff:target.trim(),staffName:staff,note:'Handover from '+staff+' to '+target.trim()};
    }
    try{const result=await VercelBackend.sendMessage(message);if(!result?.ok)throw new Error(result?.error||'Action failed');await refreshTasks();alert(workflowAction.classList.contains('ack')?'Task acknowledged.':'Task handed over successfully.');}
    catch(err){alert(err.message||'Could not update task.');}
    finally{if(document.body.contains(workflowAction)){workflowAction.disabled=false;workflowAction.textContent=workflowAction.classList.contains('ack')?'✋ Ack':'↔ Handover';}}
    return;
  }
  const action=e.target.closest('.done,.remark');if(!action)return;
  const card=action.closest('.task-card');const select=card?.querySelector('.done-by');const staff=String(select?.value||'').trim();if(!staff)return;
  const requestId=String(action.dataset.id||'');const sourceRow=liveRows.find(row=>String(row.id)===requestId);if(!sourceRow)return;
  openCompletionModal(sourceRow,requestId,staff);
  if(action.classList.contains('remark')) setTimeout(()=>setCompletionMode('pending'),0);
});
$('completed').addEventListener('click',e=>{const img=e.target.closest('[data-image-url]');if(img) openImageUrl(img.dataset.imageUrl);});
document.querySelectorAll('.completion-option').forEach(option=>option.addEventListener('click',()=>setCompletionMode(option.dataset.value)));
$('closeRemark').onclick=closeCompletionModal;$('cancelRemark').onclick=closeCompletionModal;$('confirmDone').onclick=confirmCompletion;
$('remarkModal').addEventListener('click',e=>{if(e.target===$('remarkModal'))closeCompletionModal();});

VercelBackend.onMessage.addListener(msg=>{
  if(msg?.type==='NEW_REQUEST') startFreshNewRequest();
  if(msg?.type==='PREFILL_REQUEST') populate(msg.request||{});
  if(msg?.type==='TASK_ALERT'){showAlert(msg.alert);switchTab('tasks');refreshTasks();}
});
$('alertBanner').addEventListener('click',()=>switchTab('tasks'));
// Primary Add Image action opens the rear camera on supported mobile browsers.
$('chooseImages').onclick=()=>$('cameraInput').click();
$('chooseGalleryImages').onclick=()=>$('imageInput').click();
$('imageDropzone').onclick=()=>$('imageInput').click();
$('imageInput').addEventListener('change',e=>{addImageFiles(e.target.files);e.target.value='';});
$('cameraInput').addEventListener('change',e=>{addImageFiles(e.target.files);e.target.value='';});
['dragenter','dragover'].forEach(type=>$('imageDropzone').addEventListener(type,e=>{e.preventDefault();e.stopPropagation();$('imageDropzone').classList.add('dragover');}));
['dragleave','drop'].forEach(type=>$('imageDropzone').addEventListener(type,e=>{e.preventDefault();e.stopPropagation();$('imageDropzone').classList.remove('dragover');}));
$('imageDropzone').addEventListener('drop',e=>addImageFiles(e.dataTransfer.files));
$('imagePreviewGrid').addEventListener('click',e=>{const btn=e.target.closest('.image-remove');if(!btn)return;const i=Number(btn.dataset.index);if(Number.isInteger(i)&&attachedImages[i]){if(String(attachedImages[i].previewUrl||'').startsWith('blob:'))URL.revokeObjectURL(attachedImages[i].previewUrl);attachedImages.splice(i,1);renderAttachedImages();}});
// Primary Evidence Add Image action opens the rear camera on supported mobile browsers.
$('chooseRemarkImages').onclick=()=>$('remarkCameraInput').click();
$('chooseRemarkGalleryImages').onclick=()=>$('remarkImageInput').click();
$('remarkImageDropzone').onclick=()=>$('remarkImageInput').click();
$('remarkImageInput').addEventListener('change',e=>{addRemarkImageFiles(e.target.files);e.target.value='';});
$('remarkCameraInput').addEventListener('change',e=>{addRemarkImageFiles(e.target.files);e.target.value='';});
['dragenter','dragover'].forEach(type=>$('remarkImageDropzone').addEventListener(type,e=>{e.preventDefault();e.stopPropagation();$('remarkImageDropzone').classList.add('dragover');}));
['dragleave','drop'].forEach(type=>$('remarkImageDropzone').addEventListener(type,e=>{e.preventDefault();e.stopPropagation();$('remarkImageDropzone').classList.remove('dragover');}));
$('remarkImageDropzone').addEventListener('drop',e=>addRemarkImageFiles(e.dataTransfer.files));
$('remarkImagePreviewGrid').addEventListener('click',e=>{const btn=e.target.closest('.remark-image-remove');if(!btn)return;const i=Number(btn.dataset.index);if(Number.isInteger(i)&&attachedRemarkImages[i]){if(String(attachedRemarkImages[i].previewUrl||'').startsWith('blob:'))URL.revokeObjectURL(attachedRemarkImages[i].previewUrl);attachedRemarkImages.splice(i,1);renderRemarkImages();}});
document.addEventListener('paste',e=>{const files=Array.from(e.clipboardData?.files||[]).filter(f=>f.type.startsWith('image/'));if(!files.length)return;const modalVisible=!$('remarkModal').classList.contains('hidden');const active=document.activeElement;if(modalVisible){e.preventDefault();addRemarkImageFiles(files);return;}if(active?.id==='request'||active?.tagName==='BODY'||active?.id==='imageDropzone'){e.preventDefault();addImageFiles(files);}});
document.querySelectorAll('input[name="completionMode"]').forEach(input=>input.addEventListener('change',()=>setCompletionMode(input.value)));

async function boot(){
  await loadSettings();
  // A newly created assistant window should start as a clean New Request unless
  // it was explicitly opened from a WhatsApp message with pendingRequest.
  const p=await getPending();
  if(p) populate(p); else resetForm();
  await ensureServiceWorker();
  const queryTab=new URLSearchParams(window.location.search).get('tab');
  if(queryTab==='tasks') switchTab('tasks');
  completedRows=await loadCompletedCache(completedDateKeyNow());
  renderCompleted();
  await Promise.all([refreshTasks(), refreshCompleted()]);
  // Shared Google Sheets polling starts only after per-device settings are loaded.
  realtimeSyncTick();
  window.setInterval(realtimeSyncTick, Math.max(5, Number(settings.syncIntervalSeconds) || 10) * 1000);
}

// Settings are stored in this browser's localStorage by options.html. When the
// app is restored from the back/forward cache, refocused, or updated by another
// same-origin page, refresh the snapshot so the footer cannot remain stale.
let connectionRefreshInProgress=false;
async function refreshConnectionStatus(){
  if(connectionRefreshInProgress) return;
  connectionRefreshInProgress=true;
  try { await refreshSettingsSnapshot(); }
  catch(error) { console.warn('Could not refresh local settings snapshot:', error); }
  finally { connectionRefreshInProgress=false; }
}
window.addEventListener('pageshow', () => { refreshConnectionStatus(); });
window.addEventListener('focus', () => { refreshConnectionStatus(); });
window.addEventListener('storage', event => {
  const relevantKeys=['endpointUrl','spreadsheetId','sheetName','historySheetName','staffName','staffList','computerName','defaultTiming','reminderMinutes','syncIntervalSeconds'];
  if(event.key===null || relevantKeys.includes(event.key)) refreshConnectionStatus();
});

boot();
setInterval(()=>{
  updateLiveTaskDisplay();
  const currentKey=completedDateKeyNow();
  if(currentKey!==completedDateKey){
    completedDateKey=currentKey;
    completedRows=[];
    renderCompleted();
    refreshCompleted().catch(()=>{});
  }
},1000);
let realtimeSyncBusy=false;
async function realtimeSyncTick(){
  if(realtimeSyncBusy) return;
  realtimeSyncBusy=true;
  try {
    // v2.7.8: one shared-sheet read per foreground tick. The background returns
    // the fresh rows, so we do not immediately perform a second LIST_LIVE read.
    // The local snapshot is evaluated for DUE SOON / DUE NOW / OVERDUE on the
    // same foreground cycle.
    const r=await VercelBackend.sendMessage({type:'SYNC_NOW'});
    if(r?.ok && Array.isArray(r.rows)){
      liveRows=r.rows;
      if(activeTab==='tasks') renderTasks();
    }
    // Completed is a shared Google Sheets view, so every open computer must poll it
    // even when the Completed tab is not currently selected.
    if(Date.now()-lastCompletedRefreshAt>=(Math.max(5,Number(settings.syncIntervalSeconds)||10)*1000)){
      await refreshCompleted();
    }
    
    // Evaluate shared task due times into an in-app banner, device notification and optional alarm.
    evaluateDueNotifications(liveRows);

  } catch (_) {}
  finally {realtimeSyncBusy=false; }
}
