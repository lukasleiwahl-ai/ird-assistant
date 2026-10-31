// v2.7.9.3 desktop Ack/Handover: controls are shown on live cards and enabled on staff selection.
/* IRD Assistant v2.7.5 */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
// Initialize timezone/clock state BEFORE the first call to localDateInputValue().
// Previously completedDateKey was evaluated before these const/let bindings,
// triggering a Temporal Dead Zone ReferenceError and preventing every UI
// event handler below from being registered.
const IRD_TIME_ZONE = 'Asia/Jakarta';
let serverClockOffsetMs = 0;
let serverClockSynchronized = false;
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

const DEFAULTS = {endpointUrl:"",spreadsheetId:"",sheetName:"LIVE REQUESTS",historySheetName:"HISTORY",staffName:"",staffList:"",defaultTiming:20,reminderMinutes:5,computerName:""};
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
function appNowMs(){ return Date.now() + (serverClockSynchronized ? serverClockOffsetMs : 0); }
function appNow(){ return new Date(appNowMs()); }
function acceptServerClock(serverNow){
  const serverMs=Date.parse(serverNow||'');
  if(!Number.isFinite(serverMs)) return;
  const nextOffset=serverMs-Date.now();
  serverClockOffsetMs=serverClockSynchronized?(serverClockOffsetMs*0.25+nextOffset*0.75):nextOffset;
  serverClockSynchronized=true;
}
function jakartaParts(date=appNow()){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:IRD_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
  const out={};parts.forEach(x=>{if(x.type!=='literal')out[x.type]=x.value;});return out;
}
function localDateInputValue(date = appNow()){
  const p=jakartaParts(date);return `${p.year}-${p.month}-${p.day}`;
}
function localTimeInputValue(date = appNow()){
  const p=jakartaParts(date);return `${p.hour}:${p.minute}`;
}
function parseDueInput(){
  const date=$('dueDate').value,time=$('dueTime').value;
  if(!date||!time||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time)) return null;
  const dt=new Date(`${date}T${time}:00+07:00`);
  return Number.isFinite(dt.getTime())?dt:null;
}
async function loadSettings(){
  settings={...DEFAULTS,...await chrome.storage.sync.get(DEFAULTS)};
  $('createdBy').value=settings.staffName||"";
  $('timing').value=String(settings.defaultTiming||20);
  $('dueDate').value=localDateInputValue();
  populatePics();
  updateDueFromTiming();
  $('computerText').textContent=settings.computerName||"";
  const connected=Boolean(settings.endpointUrl&&normalizeSpreadsheetId(settings.spreadsheetId));
  $('connectionDot').className='dot '+(connected?'ok':'bad');
  $('connectionText').textContent=connected?'Google Sheets connected':'Google Sheets not configured';
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
  const due=new Date(appNowMs()+mins*60000);
  $('dueDate').value=localDateInputValue(due);
  $('dueTime').value=localTimeInputValue(due);
}
async function getPending(){const r=await chrome.runtime.sendMessage({type:'GET_PENDING'});return r?.ok?r.request:null;}
async function getAlert(){const r=await chrome.runtime.sendMessage({type:'GET_ALERT'});return r?.ok?r.alert:null;}
function showAlert(alert){
  if(!alert){$('alertBanner').className='alert hidden';$('alertBanner').innerHTML='';return;}
  $('alertBanner').className=`alert ${esc(alert.level||'due')}`;
  let extra='';
  if(alert.level==='soon') extra=`Due in ${esc(alert.reminderMinutes||5)} min`;
  if(alert.level==='overdue') extra=`Overdue by ${esc(alert.overdueMinutes||1)} min`;
  if(alert.level==='due') extra='Due now';
  $('alertBanner').innerHTML=`🔔 ${esc(alert.label||'REMINDER')} • Room ${esc(alert.room||'-')}<small>${esc(alert.request||'Guest request')} • ${esc(extra)} • Due ${esc(alert.dueAt||'-')}</small>`;
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
  attachedImages.forEach(x=>{if(x.previewUrl) URL.revokeObjectURL(x.previewUrl);});
}
function resetAttachedImages(){revokeAttachedUrls();attachedImages=[];renderAttachedImages();}
function renderAttachedImages(){
  const grid=$('imagePreviewGrid');
  if(!grid) return;
  grid.innerHTML=attachedImages.map((img,i)=>`<div class="image-preview-card"><img src="${esc(img.previewUrl)}" alt="Attached image ${i+1}"><button type="button" class="image-remove" data-index="${i}" title="Remove">×</button><span class="image-count">${i+1}/${attachedImages.length}</span></div>`).join('');
  const note=$('imageUploadNote');
  if(note) note.textContent=attachedImages.length?`${attachedImages.length} image${attachedImages.length===1?'':'s'} attached. Images are stored in Google Drive when the task is saved.`:'';
}
function fileToDataUrl(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(r.error||new Error('Could not read image.'));r.readAsDataURL(file);});}
function renderRemarkImages(){
  const grid=$('remarkImagePreviewGrid');
  if(!grid) return;
  grid.innerHTML=attachedRemarkImages.map((img,i)=>`<div class="image-preview-card"><img src="${esc(img.previewUrl)}" alt="Evidence image ${i+1}"><button type="button" class="image-remove remark-image-remove" data-index="${i}" title="Remove">×</button><span class="image-count">${i+1}/${attachedRemarkImages.length}</span></div>`).join('');
  const note=$('remarkImageUploadNote');
  if(note) note.textContent=attachedRemarkImages.length?`${attachedRemarkImages.length} evidence image${attachedRemarkImages.length===1?'':'s'} attached.`:'';
}
function revokeRemarkImageUrls(){attachedRemarkImages.forEach(x=>{if(x.previewUrl) URL.revokeObjectURL(x.previewUrl);});}
function resetRemarkImages(){revokeRemarkImageUrls();attachedRemarkImages=[];renderRemarkImages();}
async function compressImageFile(file){
  if(!/^image\/(jpeg|png|webp)$/i.test(file.type)) throw new Error(`${file.name||'File'} is not a supported image.`);
  const source=await fileToDataUrl(file);
  const img=new Image();
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('Invalid image file.'));img.src=source;});
  const maxSide=1600;
  const scale=Math.min(1,maxSide/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height));
  const w=Math.max(1,Math.round((img.naturalWidth||img.width)*scale));
  const h=Math.max(1,Math.round((img.naturalHeight||img.height)*scale));
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,w,h);
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
  const list=Array.from(files||[]).filter(f=>f && /^image\/(jpeg|png|webp)$/i.test(f.type));
  if(!list.length) return;
  const remaining=5-attachedImages.length;
  if(remaining<=0){$('imageUploadNote').textContent='Maximum 5 images per task.';return;}
  const selected=list.slice(0,remaining);
  if(list.length>remaining) $('imageUploadNote').textContent='Maximum 5 images per task. Extra images were not added.';
  for(const file of selected){
    try{
      const dataUrl=await compressImageFile(file);
      const previewUrl=URL.createObjectURL(file);
      attachedImages.push({name:file.name||`image-${attachedImages.length+1}.jpg`,mimeType:'image/jpeg',dataUrl,previewUrl});
    }catch(e){$('imageUploadNote').textContent=e?.message||String(e);}
  }
  renderAttachedImages();
}
async function addRemarkImageFiles(files){
  const list=Array.from(files||[]).filter(f=>f && /^image\/(jpeg|png|webp)$/i.test(f.type));
  if(!list.length) return;
  const remaining=5-attachedRemarkImages.length;
  if(remaining<=0){$('remarkImageUploadNote').textContent='Maximum 5 evidence images.';return;}
  const selected=list.slice(0,remaining);
  if(list.length>remaining) $('remarkImageUploadNote').textContent='Maximum 5 evidence images. Extra images were not added.';
  for(const file of selected){
    try{
      const dataUrl=await compressImageFile(file);
      const previewUrl=URL.createObjectURL(file);
      attachedRemarkImages.push({name:file.name||`remark-${attachedRemarkImages.length+1}.jpg`,mimeType:'image/jpeg',dataUrl,previewUrl});
    }catch(e){$('remarkImageUploadNote').textContent=e?.message||String(e);}
  }
  renderRemarkImages();
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
function openImageUrl(url){if(url) chrome.tabs.create({url});}

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
  const requestObj={room,guestName,request,priority:$('priority').value,timing,dueAt,dueDate:$('dueDate').value,dueTime:$('dueTime').value,startAt:startAt.toISOString(),pic,notification,source:pending?.source||'',sourceChat:pending?.sourceChat||'',images:attachedImages.map(({name,mimeType,dataUrl})=>({name,mimeType,dataUrl}))};
  const r=await chrome.runtime.sendMessage({type:'SAVE_REQUEST',request:requestObj});
  btn.disabled=false;btn.textContent='▣ Save to Google Sheets';
  if(!r?.ok){err.textContent=r?.error||'Could not save request.';return;}
  $('requestForm').classList.add('hidden');$('savedState').classList.remove('hidden');
  $('savedState').innerHTML=`<div class="checkbig">✓</div><h3>Request Saved</h3><p><b>Room ${esc(room)}</b>${guestName?` • ${esc(guestName)}`:''}</p><p>${esc(requestObj.priority)} priority • Due: <b>${esc(r.data.dueAt||'')}</b></p><p>Saved to <b>${esc(settings.sheetName||'LIVE REQUESTS')}</b>.</p><div class="actions"><button id="newOne" class="secondary">New Request</button><button id="viewTasks" class="primary">View Tasks</button></div>`;
  await chrome.runtime.sendMessage({type:'CLEAR_PENDING'});
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
  await chrome.runtime.sendMessage({type:'CLEAR_PENDING'});
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
$('closeWindow').onclick=()=>window.close();$('cancel').onclick=resetForm;$('requestForm').addEventListener('submit',saveRequest);$('timing').addEventListener('change',updateDueFromTiming);$('refreshTasks').onclick=refreshTasks;$('refreshCompleted').onclick=refreshCompleted;$('openOptions').onclick=()=>chrome.runtime.openOptionsPage();
$('openSheet').onclick=()=>{const id=normalizeSpreadsheetId(settings.spreadsheetId);if(id) chrome.tabs.create({url:`https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/edit`});};
function classifyRow(row){
  const dueMs=Date.parse(row.dueIso||"");
  if(!Number.isFinite(dueMs)) return {state:'INVALID',label:'TIME ERROR',detail:'Time unavailable',remainingMs:NaN};
  const diff=dueMs-appNowMs();
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
  card.innerHTML=`<div class="task-top"><div class="room"></div><span class="priority"></span><span class="status hidden"></span></div><div class="req"></div><div class="task-image-slot"></div><div class="meta hidden">SLA <span class="sla"></span> min • Due <span class="due-at-legacy"></span> • <span class="countdown-legacy"></span> • PIC <span class="pic-legacy"></span></div><div class="ack-strip"><span class="ack-state"></span><span class="pic"></span></div><div class="due-strip"><span class="countdown"></span><span class="due-at"></span></div><div class="task-actions"><label class="done-by-wrap"><span>Done by :</span><select class="done-by" data-id="${esc(row.id)}"></select></label><div class="done-buttons"><button class="ack" data-id="${esc(row.id)}">✋ Ack</button><button class="handover" data-id="${esc(row.id)}">↔ Handover</button><button class="remark" data-id="${esc(row.id)}" hidden>💬 Remark</button><button class="reply" data-id="${esc(row.id)}">💬 Reply</button><button class="done" data-id="${esc(row.id)}">✓ Done</button></div><div class="task-discussion-preview hidden" aria-live="polite"></div></div>`;
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
  const discussion=row.discussionSummary||{};
  const replyCount=Number(discussion.count||0),unreadCount=Number(discussion.unreadCount||0);
  const replyButton=card.querySelector('.reply');
  if(replyButton){replyButton.textContent=replyCount?`💬 Reply (${replyCount})`:'💬 Reply';replyButton.classList.toggle('reply-unread',unreadCount>0);replyButton.title=unreadCount?`${unreadCount} unread reply${unreadCount===1?'':'ies'}`:'Open task discussion';}
  const preview=card.querySelector('.task-discussion-preview');
  if(preview){preview.classList.toggle('hidden',replyCount<1);preview.innerHTML=replyCount?`<div class="discussion-preview-head">💬 LATEST REPLY • ${esc(discussion.latestAtLabel||'')}</div><div class="discussion-preview-body"><b>${esc(discussion.latestSender||'IRD User')}</b><span>${esc(discussion.latestMessage||'')}</span></div><div class="discussion-preview-foot">${replyCount} message${replyCount===1?'':'s'} in this task${unreadCount?` • ${unreadCount} unread`:''}</div>`:'';}
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
  const r=await chrome.runtime.sendMessage({type:'LIST_LIVE'});
  if(!r?.ok){$('tasks').innerHTML=`<div class="error">${esc(r?.error||'Failed to load live requests.')}</div>`;$('taskCount').textContent='0';return;}
  acceptServerClock(r.data.serverNow);liveRows=r.data.rows||[];renderTasks();
}

function completedDateKeyNow(){
  return localDateInputValue(appNow());
}
async function loadCompletedCache(dateKey=completedDateKeyNow()){
  try {
    const stored=await chrome.storage.local.get({[COMPLETED_CACHE_KEY]:{}});
    const all=stored[COMPLETED_CACHE_KEY]||{};
    return Array.isArray(all[dateKey]) ? all[dateKey] : [];
  } catch (_) { return []; }
}
async function saveCompletedCache(dateKey, rows){
  try {
    const stored=await chrome.storage.local.get({[COMPLETED_CACHE_KEY]:{}});
    const all=stored[COMPLETED_CACHE_KEY]||{};
    all[dateKey]=Array.isArray(rows)?rows:[];
    // Keep only today's local cache. Google Sheets remains the permanent archive.
    Object.keys(all).forEach(k=>{if(k!==dateKey) delete all[k];});
    await chrome.storage.local.set({[COMPLETED_CACHE_KEY]:all});
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
  const discussion=row.discussionSummary||{};const replyCount=Number(discussion.count||0);const unreadCount=Number(discussion.unreadCount||0);
  const discussionPreview=replyCount?`<div class="discussion-preview completed-discussion-preview"><div class="discussion-preview-head">💬 LATEST REPLY • ${esc(discussion.latestAtLabel||'')}</div><div class="discussion-preview-body"><b>${esc(discussion.latestSender||'IRD User')}</b><span>${esc(discussion.latestMessage||'')}</span></div><div class="discussion-preview-foot">${replyCount} message${replyCount===1?'':'s'} in this task${unreadCount?` • ${unreadCount} unread`:''}</div></div>`:'';
  return `<article class="completed-card" data-id="${esc(row.id||'')}"><div class="completed-top"><span class="completed-check">✓</span><div><div class="completed-room">Room ${room}</div>${guest?`<div class="completed-guest">${guest}</div>`:''}</div><span class="completed-time">${time}</span></div><div class="completed-request">${task?`<b>${task}</b> • `:''}${request}</div>${imageThumbsHtml(row,'completed-images','images')}${remark?`<div class="remark-preview"><b>Remark:</b> ${esc(remark)}</div>`:''}${remarkImageRefsFromRow(row).length?`<div class="remark-evidence-preview"><b>Evidence:</b>${imageThumbsHtml(row,'completed-images','remarkImages')}</div>`:''}<div class="completed-meta"><span>Done by <b>${doneBy}</b></span>${duration!==''?`<span>Duration <b>${esc(duration)} min</b></span>`:''}<span class="${status.toLowerCase().includes('pending')?'pending-status':''}">${status}</span>${date?`<span>${date}</span>`:''}</div>${discussionPreview}<div class="completed-actions"><button type="button" class="secondary small-btn reply" data-id="${esc(row.id||'')}">💬 Reply${replyCount?` (${replyCount})`:''} / Discussion${unreadCount?' • Unread':''}</button></div></article>`;
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

  const r=await chrome.runtime.sendMessage({type:'LIST_TODAY_HISTORY', clientDateKey:currentKey});
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

  acceptServerClock(r.data?.serverNow);const remote=Array.isArray(r.data?.rows)?r.data.rows:[];
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
  const optimistic={id:requestId,room:sourceRow.room,guestName:sourceRow.guestName,request:sourceRow.request,task:sourceRow.task||'',doneBy:staff,completedTime:localTimeInputValue(),completedDate:completedDateKeyNow(),date:completedDateKeyNow(),duration:sourceRow.startIso?Math.max(0,Math.round((appNowMs()-Date.parse(sourceRow.startIso))/60000)):'',status:optimisticStatus,remark,images:imageRefsFromRow(sourceRow),remarkImages:remarkImages.map((x,i)=>({name:x.name,thumbnailUrl:x.dataUrl,viewUrl:x.dataUrl}))};
  if(done){done.disabled=true;done.textContent='Completing…';}
  closeCompletionModal();
  doneBySelections.delete(requestId);
  liveRows=liveRows.filter(row=>String(row.id)!==requestId);
  completedRows=[optimistic,...completedRows.filter(row=>String(row.id)!==requestId)];
  void saveCompletedCache(completedDateKeyNow(),completedRows);renderTasks();renderCompleted();
  const r=await chrome.runtime.sendMessage({type:'COMPLETE_REQUEST',requestId,doneBy:staff,completionStatus:mode==='pending'?'Completed with Pending':'',remark,remarkImages,clientDateKey:completedDateKeyNow(),clientTime:localTimeInputValue()});
  if(!r?.ok){
    completedRows=completedRows.filter(row=>String(row.id)!==requestId);void saveCompletedCache(completedDateKeyNow(),completedRows);
    liveRows=[sourceRow,...liveRows.filter(row=>String(row.id)!==requestId)];renderTasks();renderCompleted();alert(r?.error||'Could not complete request.');return;
  }
  acceptServerClock(r.data?.serverNow);const duration=r.data?.duration,doneBy=r.data?.doneBy||staff;
  const idx=completedRows.findIndex(row=>String(row.id)===requestId);
  if(idx>=0){completedRows[idx]={...completedRows[idx],duration,doneBy,status:r.data?.status||optimisticStatus,completedTime:r.data?.completedTime||completedRows[idx].completedTime,completedDate:r.data?.completedDate||completedRows[idx].completedDate,completedTimestamp:r.data?.completedTimestamp||completedRows[idx].completedTimestamp,remark:r.data?.remark??remark,remarkImages:r.data?.remarkImages||[]};void saveCompletedCache(completedDateKeyNow(),completedRows);renderCompleted();}
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
    try{const result=await chrome.runtime.sendMessage(message);if(!result?.ok)throw new Error(result?.error||'Action failed');await refreshTasks();alert(workflowAction.classList.contains('ack')?'Task acknowledged.':'Task handed over successfully.');}
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

chrome.runtime.onMessage.addListener(msg=>{
  if(msg?.type==='NEW_REQUEST') startFreshNewRequest();
  if(msg?.type==='PREFILL_REQUEST') populate(msg.request||{});
  if(msg?.type==='TASK_ALERT'){showAlert(msg.alert);switchTab('tasks');refreshTasks();}
});
$('chooseImages').onclick=()=>$('imageInput').click();
$('imageDropzone').onclick=()=>$('imageInput').click();
$('imageInput').addEventListener('change',e=>{addImageFiles(e.target.files);e.target.value='';});
['dragenter','dragover'].forEach(type=>$('imageDropzone').addEventListener(type,e=>{e.preventDefault();e.stopPropagation();$('imageDropzone').classList.add('dragover');}));
['dragleave','drop'].forEach(type=>$('imageDropzone').addEventListener(type,e=>{e.preventDefault();e.stopPropagation();$('imageDropzone').classList.remove('dragover');}));
$('imageDropzone').addEventListener('drop',e=>addImageFiles(e.dataTransfer.files));
$('imagePreviewGrid').addEventListener('click',e=>{const btn=e.target.closest('.image-remove');if(!btn)return;const i=Number(btn.dataset.index);if(Number.isInteger(i)&&attachedImages[i]){if(attachedImages[i].previewUrl)URL.revokeObjectURL(attachedImages[i].previewUrl);attachedImages.splice(i,1);renderAttachedImages();}});
$('chooseRemarkImages').onclick=()=>$('remarkImageInput').click();
$('remarkImageDropzone').onclick=()=>$('remarkImageInput').click();
$('remarkImageInput').addEventListener('change',e=>{addRemarkImageFiles(e.target.files);e.target.value='';});
['dragenter','dragover'].forEach(type=>$('remarkImageDropzone').addEventListener(type,e=>{e.preventDefault();e.stopPropagation();$('remarkImageDropzone').classList.add('dragover');}));
['dragleave','drop'].forEach(type=>$('remarkImageDropzone').addEventListener(type,e=>{e.preventDefault();e.stopPropagation();$('remarkImageDropzone').classList.remove('dragover');}));
$('remarkImageDropzone').addEventListener('drop',e=>addRemarkImageFiles(e.dataTransfer.files));
$('remarkImagePreviewGrid').addEventListener('click',e=>{const btn=e.target.closest('.remark-image-remove');if(!btn)return;const i=Number(btn.dataset.index);if(Number.isInteger(i)&&attachedRemarkImages[i]){if(attachedRemarkImages[i].previewUrl)URL.revokeObjectURL(attachedRemarkImages[i].previewUrl);attachedRemarkImages.splice(i,1);renderRemarkImages();}});
document.addEventListener('paste',e=>{const files=Array.from(e.clipboardData?.files||[]).filter(f=>f.type.startsWith('image/'));if(!files.length)return;const modalVisible=!$('remarkModal').classList.contains('hidden');const active=document.activeElement;if(modalVisible){e.preventDefault();addRemarkImageFiles(files);return;}if(active?.id==='request'||active?.tagName==='BODY'||active?.id==='imageDropzone'){e.preventDefault();addImageFiles(files);}});
document.querySelectorAll('input[name="completionMode"]').forEach(input=>input.addEventListener('change',()=>setCompletionMode(input.value)));

async function boot(){
  await loadSettings();
  // A newly created assistant window should start as a clean New Request unless
  // it was explicitly opened from a WhatsApp message with pendingRequest.
  const p=await getPending();
  if(p) populate(p); else resetForm();
  const alert=await getAlert();if(alert){showAlert(alert);switchTab('tasks');await chrome.runtime.sendMessage({type:'CLEAR_ALERT'});}
  completedRows=await loadCompletedCache(completedDateKeyNow());
  renderCompleted();
  await Promise.all([refreshTasks(), refreshCompleted()]);
  if(!p) updateDueFromTiming(); // now anchored to the Apps Script clock and WIB
  await refreshNotifications(false);
}
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
    const r=await chrome.runtime.sendMessage({type:'SYNC_NOW'});
    if(r?.ok && Array.isArray(r.rows)){
      liveRows=r.rows;
      if(activeTab==='tasks') renderTasks();
    }
    // Completed is a shared Google Sheets view, so every open computer must poll it
    // even when the Completed tab is not currently selected.
    if(Date.now()-lastCompletedRefreshAt>=5000){
      await refreshCompleted();
    }
    await chrome.runtime.sendMessage({type:'EVALUATE_LOCAL_NOTIFICATIONS'});
  } catch (_) {}
  finally {realtimeSyncBusy=false; }
}
realtimeSyncTick();
setInterval(realtimeSyncTick,1000);


// v2.7.9.8 additive features: shared notifications and task discussion.
let notificationRows=[];
let notificationKnownIds=new Set();
let notificationFeedReady=false;
let activeDiscussion=null;
let discussionRefreshBusy=false;
let identityPromise=null;
async function getAppIdentity(){
  const readerName=String(settings.staffName||settings.computerName||'IRD User').trim()||'IRD User';
  if(String(settings.staffName||'').trim()) return {readerKey:'staff:'+String(settings.staffName).trim().toLowerCase().replace(/\s+/g,' '),readerName};
  if(!identityPromise){identityPromise=(async()=>{const stored=await chrome.storage.local.get({irdDiscussionDeviceId:''});let id=String(stored.irdDiscussionDeviceId||'');if(!id){id=(globalThis.crypto&&globalThis.crypto.randomUUID)?globalThis.crypto.randomUUID():'device-'+Date.now().toString(36)+Math.random().toString(36).slice(2);await chrome.storage.local.set({irdDiscussionDeviceId:id});}return {readerKey:'device:'+id,readerName};})();}
  return identityPromise;
}
function unwrapFeatureResult(result){return result?.data||result;}
function renderNotifications(){
  const list=$('notificationList');if(!list)return;
  const unread=notificationRows.filter(x=>!x.isRead).length;
  const badge=$('notificationBadge');if(badge){badge.textContent=unread>99?'99+':String(unread);badge.classList.toggle('hidden',unread===0);}
  if(!notificationRows.length){list.innerHTML='<div class="notification-empty">No notifications yet.</div>';return;}
  list.innerHTML=notificationRows.map(item=>`<button type="button" class="notification-item ${item.isRead?'read':'unread'}" data-notification-id="${esc(item.id)}" data-task-id="${esc(item.taskId)}"><span class="notification-item-icon">✓</span><span class="notification-item-copy"><b>${esc(item.title||'Task Completed')}</b><span>${esc(item.message||'A task has been completed.')}</span><small>${esc(item.room?'Room '+item.room:'')} • ${esc(item.createdAtLabel||'')}</small></span>${item.isRead?'':'<i class="notification-unread-dot"></i>'}</button>`).join('');
}
let liveToastTimer=null;let liveToastTarget=null;
function showLiveToast(item){
  const toast=$('liveToast');if(!toast||!item)return;
  const isReply=item.type==='TASK_REPLY';toast.classList.toggle('reply',isReply);
  $('liveToastIcon').textContent=isReply?'💬':'✓';
  $('liveToastTitle').textContent=item.title||(isReply?'New Task Reply':'Task Completed');
  $('liveToastMessage').textContent=item.message||'';
  $('liveToastMeta').textContent=(item.room?'Room '+item.room+' • ':'')+(item.createdAtLabel||'Tap to open');
  liveToastTarget=item;toast.classList.remove('hidden');
  if(liveToastTimer)clearTimeout(liveToastTimer);
  liveToastTimer=setTimeout(()=>{toast.classList.add('hidden');liveToastTarget=null;},8500);
}
async function openLiveToastTarget(){
  const item=liveToastTarget;if(!item)return;
  $('liveToast').classList.add('hidden');if(liveToastTimer)clearTimeout(liveToastTimer);liveToastTarget=null;
  if(item.type==='TASK_REPLY'){
    const row=[...liveRows,...completedRows].find(x=>String(x.id)===String(item.taskId));
    await switchTab(row&&completedRows.some(x=>String(x.id)===String(item.taskId))?'completed':'tasks');
    await openDiscussion(item.taskId,item.room||row?.room||'',row?.request||row?.task||'');
  }else{
    await switchTab('completed');
    const card=Array.from(document.querySelectorAll('.completed-card')).find(x=>String(x.dataset.id)===String(item.taskId));
    if(card){card.scrollIntoView({behavior:'smooth',block:'center'});card.classList.add('notification-highlight');setTimeout(()=>card.classList.remove('notification-highlight'),1600);}
  }
}
async function refreshNotifications(showNew=false){
  const identity=await getAppIdentity();
  const response=await chrome.runtime.sendMessage({type:'LIST_NOTIFICATIONS',readerKey:identity.readerKey,readerName:identity.readerName});
  if(!response?.ok)return;
  const data=unwrapFeatureResult(response);acceptServerClock(data.serverNow);
  const rows=Array.isArray(data.rows)?data.rows:[];
  if(notificationFeedReady){
    const fresh=rows.filter(x=>!notificationKnownIds.has(String(x.id||''))).sort((a,b)=>(Date.parse(a.createdAt)||0)-(Date.parse(b.createdAt)||0));
    if(fresh.length)showLiveToast(fresh[fresh.length-1]);
  }
  notificationRows=rows;notificationKnownIds=new Set(rows.map(x=>String(x.id||'')));notificationFeedReady=true;renderNotifications();
}
async function markNotificationRead(notificationId){
  const response=await chrome.runtime.sendMessage({type:'MARK_NOTIFICATION_READ',notificationId});
  if(response?.ok){const item=notificationRows.find(x=>String(x.id)===String(notificationId));if(item)item.isRead=true;renderNotifications();}
}
async function openNotifications(){ $('notificationModal').classList.remove('hidden');await refreshNotifications(false); }
function closeNotifications(){ $('notificationModal').classList.add('hidden'); }
function discussionSenderName(){return String(settings.staffName||settings.computerName||'IRD User').trim()||'IRD User';}
function applyDiscussionSummary(taskId,rows){
  const list=Array.isArray(rows)?rows:[];const latest=list.length?list[list.length-1]:null;
  const summary={count:list.length,unreadCount:0,latestSender:latest?.senderName||'',latestMessage:latest?.message||'',latestAt:latest?.createdAt||'',latestAtLabel:latest?.createdAtLabel||''};
  liveRows.forEach(row=>{if(String(row.id)===String(taskId))row.discussionSummary=summary;});
  completedRows.forEach(row=>{if(String(row.id)===String(taskId))row.discussionSummary=summary;});
  if(activeTab==='tasks')renderTasks();if(activeTab==='completed')renderCompleted();
}
function renderDiscussion(rows){
  const list=$('discussionMessages');if(!Array.isArray(rows)||!rows.length){list.innerHTML='<div class="discussion-empty">No replies yet. Start the discussion for this task.</div>';return;}
  list.innerHTML=rows.map(row=>`<div class="discussion-message ${String(row.senderName||'')===discussionSenderName()?'own':''}"><b>${esc(row.senderName||'IRD User')}</b><p>${esc(row.message||'')}</p><small>${esc(row.createdAtLabel||'')}</small></div>`).join('');list.scrollTop=list.scrollHeight;
}
async function refreshDiscussion(){
  if(!activeDiscussion||discussionRefreshBusy)return null;
  discussionRefreshBusy=true;
  try{const response=await chrome.runtime.sendMessage({type:'LIST_TASK_REPLIES',taskId:activeDiscussion.taskId});if(!response?.ok)throw new Error(response?.error||'Could not load discussion.');const data=unwrapFeatureResult(response);acceptServerClock(data.serverNow);const rows=Array.isArray(data.rows)?data.rows:[];renderDiscussion(rows);return rows;}
  catch(error){$('discussionMessages').innerHTML=`<div class="completed-error">${esc(error.message||error)}</div>`;return null;}
  finally{discussionRefreshBusy=false;}
}
async function markDiscussionRead(taskId){return await chrome.runtime.sendMessage({type:'MARK_TASK_REPLIES_READ',taskId});}
async function openDiscussion(taskId,room,request){
  activeDiscussion={taskId:String(taskId),room:String(room||''),request:String(request||'')};
  $('discussionTitle').textContent=`Room ${activeDiscussion.room||'-'} • Task Discussion`;$('discussionSubtitle').textContent=activeDiscussion.request;
  $('discussionInput').value='';$('discussionError').textContent='';$('discussionModal').classList.remove('hidden');
  const rows=await refreshDiscussion();
  if(Array.isArray(rows)){
    const marked=await markDiscussionRead(activeDiscussion.taskId);
    if(marked?.ok)applyDiscussionSummary(activeDiscussion.taskId,rows);
  }
  if(activeTab==='tasks')await refreshTasks();else if(activeTab==='completed')await refreshCompleted();
  $('discussionInput').focus();
}
function closeDiscussion(){activeDiscussion=null;$('discussionModal').classList.add('hidden');}
async function sendDiscussionReply(){
  if(!activeDiscussion)return;
  const message=String($('discussionInput').value||'').trim();if(!message){$('discussionError').textContent='Please enter a reply.';return;}
  const button=$('sendDiscussionReply');button.disabled=true;button.textContent='Sending…';$('discussionError').textContent='';
  try{
    const response=await chrome.runtime.sendMessage({type:'POST_TASK_REPLY',taskId:activeDiscussion.taskId,room:activeDiscussion.room,message});
    if(!response?.ok)throw new Error(response?.error||'Could not send reply.');
    const data=unwrapFeatureResult(response);acceptServerClock(data.serverNow);$('discussionInput').value='';
    const taskId=activeDiscussion.taskId;const rows=await refreshDiscussion();
    if(Array.isArray(rows)){const marked=await markDiscussionRead(taskId);if(marked?.ok)applyDiscussionSummary(taskId,rows);}
    if(activeTab==='tasks')await refreshTasks();else if(activeTab==='completed')await refreshCompleted();
  }catch(error){$('discussionError').textContent=error.message||String(error);}
  finally{button.disabled=false;button.textContent='Send Reply';}
}
$('notificationBell').addEventListener('click',openNotifications);
$('liveToast').addEventListener('click',e=>{if(e.target.closest('#liveToastClose'))return;openLiveToastTarget();});
$('liveToastClose').addEventListener('click',e=>{e.stopPropagation();$('liveToast').classList.add('hidden');liveToastTarget=null;if(liveToastTimer)clearTimeout(liveToastTimer);});
$('closeNotifications').addEventListener('click',closeNotifications);
const notificationFooterClose = $('closeNotificationsFooter');
if (notificationFooterClose) notificationFooterClose.addEventListener('click', closeNotifications);
$('notificationModal').addEventListener('click',async e=>{
  if(e.target===$('notificationModal')){closeNotifications();return;}
  const item=e.target.closest('.notification-item');if(!item)return;
  const id=item.dataset.notificationId;await markNotificationRead(id);const taskId=item.dataset.taskId;closeNotifications();
  await switchTab('completed');setTimeout(()=>{const card=Array.from(document.querySelectorAll('.completed-card')).find(x=>String(x.dataset.id)===String(taskId));if(card){card.scrollIntoView({behavior:'smooth',block:'center'});card.classList.add('notification-highlight');setTimeout(()=>card.classList.remove('notification-highlight'),1600);}},250);
});
$('discussionClose').addEventListener('click',closeDiscussion);$('discussionCancel').addEventListener('click',closeDiscussion);
$('discussionModal').addEventListener('click',e=>{if(e.target===$('discussionModal'))closeDiscussion();});
$('sendDiscussionReply').addEventListener('click',sendDiscussionReply);
$('discussionInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendDiscussionReply();}});
$('tasks').addEventListener('click',async e=>{
  const button=e.target.closest('.reply');if(!button)return;
  const id=String(button.dataset.id||'');const row=liveRows.find(x=>String(x.id)===id);if(row)await openDiscussion(row.id,row.room,row.request);
});
$('completed').addEventListener('click',async e=>{
  const button=e.target.closest('.reply');if(!button)return;
  const id=String(button.dataset.id||'');const row=completedRows.find(x=>String(x.id)===id);if(row)await openDiscussion(row.id,row.room,row.request||row.task);
});
// Refresh internal Completed notifications and task reply previews while the app is open.
async function refreshSharedCommunication(){
  try{await refreshNotifications(false);if(activeDiscussion&&!$('discussionModal').classList.contains('hidden')){const rows=await refreshDiscussion();if(Array.isArray(rows))applyDiscussionSummary(activeDiscussion.taskId,rows);}}catch(_){}
}
setInterval(refreshSharedCommunication,5000);
