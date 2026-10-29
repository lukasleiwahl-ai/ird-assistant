/**
 * IRD Assistant — Guest Request Tracker v2.7.9.2 — History Image Display Fixed + Ack/Handover Compatibility
 * Central Google Sheets backend with robust timestamp storage and live SLA state.
 *
 * Deploy as Web App -> Execute as: Me.
 */

const HEADERS = [
  "Request ID", "Date", "Start Time", "Start Timestamp", "Room", "Guest Name", "Guest Request",
  "Priority", "Timing (Min)", "Due Time", "Due Timestamp", "Notification", "Completed Date", "Completed Time", "Duration (Min)",
  "Status", "Done By", "PIC", "Created By", "Computer", "Source", "Remarks", "Images", "Image Links", "Remark Images", "Remark Image Links"
];

function doGet(e) {
  return json_({
    ok: true,
    service: "IRD Assistant — Guest Request Tracker",
    version: "2.7.9.2-history-image-ack-handover-hotfix",
    message: "Web App is online. Use POST for API requests."
  });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) throw new Error("Empty request body.");
    const p = JSON.parse(e.postData.contents);
    const spreadsheetId = normalizeSpreadsheetId_(p.spreadsheetId);
    if (!spreadsheetId) throw new Error("Spreadsheet ID is missing or invalid.");
    const ss = SpreadsheetApp.openById(spreadsheetId);

    switch (p.action) {
      case "testConnection":
        prepareSheets_(ss, p);
        if (p.checkDrive !== false) getImageFolder_();
        return json_({ok:true, message:"Google Sheets and Google Drive connection are working."});
      case "createRequest": return json_(createRequest_(ss, p));
      case "acknowledgeRequest": return json_(acknowledgeRequest_(ss, p));
      case "reassignRequest":
      case "handoverRequest": return json_(reassignRequest_(ss, p));
      case "completeRequest": return json_(completeRequest_(ss, p));
      case "listLive": return json_(listLive_(ss, p));
      case "listTodayHistory": return json_(listTodayHistory_(ss, p));

      case "getStaffDirectory": return json_(getStaffDirectory_(ss, p));

      default: throw new Error("Unknown action: " + p.action);
    }
  } catch (err) {
    return json_({ok:false, error:String(err && err.message || err)});
  }
}

function setupSpreadsheet() {
  throw new Error("For v2.6.9, use the extension's Test Connection button instead of running setupSpreadsheet().");
}

function prepareSheets_(ss, p) {
  const live = getOrCreateSheet_(ss, p.sheetName || "LIVE REQUESTS");
  const hist = getOrCreateSheet_(ss, p.historySheetName || "HISTORY");
  const daily = getOrCreateSheet_(ss, "DAILY SUMMARY");
  const staff = getOrCreateSheet_(ss, "STAFF PERFORMANCE");
  const settings = getOrCreateSheet_(ss, "SETTINGS");
  ensureHeaders_(live);
  ensureHeaders_(hist);
  configureImageColumns_(live);
  configureImageColumns_(hist);
  if (daily.getLastRow() === 0) daily.getRange(1,1,1,5).setValues([["Date","Total Orders","Completed","Pending","Overdue"]]);
  if (staff.getLastRow() === 0) staff.getRange(1,1,1,6).setValues([["Staff","Orders","On Time","Late","Avg Duration","Overdue"]]);
  if (settings.getLastRow() === 0) settings.getRange(1,1,1,2).setValues([["Setting","Value"]]);
  live.setFrozenRows(1); hist.setFrozenRows(1);
}

function createRequest_(ss, p) {
  const lock = LockService.getScriptLock();
  // Keep the critical section short. Reads no longer take this lock, so Save/Complete
  // are not blocked by dashboard refreshes from multiple computers.
  if (!lock.tryLock(3000)) throw new Error("Google Sheets is busy. Please try Save again.");
  try {
    const live = getOrCreateSheet_(ss, p.sheetName || "LIVE REQUESTS");
    ensureHeadersFast_(live);
    configureImageColumns_(live);
    const r = p.request || {};
    const start = parseDate_(r.startAt) || new Date();
    if (isNaN(start.getTime())) throw new Error("Invalid start time.");

    const timing = clampTiming_(r.timing);
    let due = parseDate_(r.dueAt);
    if (!due) due = new Date(start.getTime() + timing * 60000);
    if (due.getTime() <= start.getTime() && !r.requestedTime) {
      due = new Date(start.getTime() + timing * 60000);
    }

    const id = String(r.requestId || Utilities.getUuid());
    const imageRefs = uploadTaskImages_(r.images || [], id);
    const obj = {
      "Request ID": id,
      "Date": date_(start),
      "Start Time": time_(start),
      "Start Timestamp": start,
      "Room": String(r.room || "").trim(),
      "Guest Name": String(r.guestName || "").trim(),
      "Guest Request": String(r.request || "").trim(),
      "Priority": String(r.priority || "Normal"),
      "Timing (Min)": timing,
      "Due Time": time_(due),
      "Due Timestamp": due,
      "Notification": normalizeNotification_(r.notification),
      "Completed Time": "",
      "Duration (Min)": "",
      "Status": statusForNow_(due, new Date(), p.reminderMinutes),
      "Done By": "",
      "PIC": String(r.pic || "").trim(),
      "Created By": String(p.staffName || p.createdBy || ""),
      "Computer": String(p.computerName || ""),
      "Source": String(r.source || "").slice(0, 4000),
      "Remarks": "",
      // Images are rendered as embedded thumbnails over the grid, not IMAGE() formulas.
      // Google Sheets IMAGE() cannot reliably render private Drive-hosted image URLs.
      "Images": "",
      "Image Links": imageRefs.length ? JSON.stringify(imageRefs) : ""
    };
    appendObject_(live, obj);
    // Keep task creation responsive; render the Drive-backed thumbnails when the task
    // is moved into HISTORY. The extension itself previews images on live task cards.
    return {
      ok:true,
      id:id,
      dueAt:time_(due),
      dueIso:due.toISOString(),
      notification:normalizeNotification_(r.notification),
      startIso:start.toISOString(),
      status:obj.Status,
      images:imageRefs,
      message:"Request saved."
    };
  } finally {
    lock.releaseLock();
  }
}


/**
 * Compatibility handlers for clients that send the legacy Android actions.
 * Metadata columns are appended by name, so existing image/history columns are not shifted.
 */
function acknowledgeRequest_(ss, p) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) throw new Error("Google Sheets is busy. Please try Ack again.");
  try {
    const sh = getOrCreateSheet_(ss, p.sheetName || "LIVE REQUESTS");
    ensureHeadersFast_(sh);
    const headers = headerMap_(sh);
    const id = String(p.requestId || p.id || "").trim();
    const staff = String(p.staffName || p.staff || "").trim();
    if (!id) throw new Error("Request ID is required for acknowledgeRequest.");
    if (!staff) throw new Error("Staff name is required for acknowledgeRequest.");
    const idCol = headers["Request ID"];
    const picCol = headers["PIC"];
    if (idCol == null) throw new Error("Request ID column is missing from LIVE REQUESTS.");
    if (picCol == null) throw new Error("PIC column is missing from LIVE REQUESTS.");
    const values = sh.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][idCol] || "") !== id) continue;
      sh.getRange(i + 1, picCol + 1).setValue(staff);
      const ackByCol = ensureOptionalColumn_(sh, "Acknowledged By");
      const ackAtCol = ensureOptionalColumn_(sh, "Acknowledged At");
      sh.getRange(i + 1, ackByCol).setValue(staff);
      sh.getRange(i + 1, ackAtCol).setValue(String(p.clientTime || p.acknowledgedAt || new Date().toISOString()));
      return {ok:true, id:id, pic:staff, acknowledgedBy:staff, message:"Request acknowledged."};
    }
    throw new Error("Request ID not found in LIVE REQUESTS: " + id);
  } finally {
    lock.releaseLock();
  }
}

function reassignRequest_(ss, p) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) throw new Error("Google Sheets is busy. Please try Handover again.");
  try {
    const sh = getOrCreateSheet_(ss, p.sheetName || "LIVE REQUESTS");
    ensureHeadersFast_(sh);
    const headers = headerMap_(sh);
    const id = String(p.requestId || p.id || "").trim();
    const toStaff = String(p.toStaff || p.staffName || p.staff || "").trim();
    if (!id) throw new Error("Request ID is required for handover.");
    if (!toStaff) throw new Error("Destination staff name is required for handover.");
    const idCol = headers["Request ID"];
    const picCol = headers["PIC"];
    if (idCol == null) throw new Error("Request ID column is missing from LIVE REQUESTS.");
    if (picCol == null) throw new Error("PIC column is missing from LIVE REQUESTS.");
    const values = sh.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][idCol] || "") !== id) continue;
      sh.getRange(i + 1, picCol + 1).setValue(toStaff);
      const ackByCol = ensureOptionalColumn_(sh, "Acknowledged By");
      const ackAtCol = ensureOptionalColumn_(sh, "Acknowledged At");
      const handoverCol = ensureOptionalColumn_(sh, "Handover Note");
      sh.getRange(i + 1, ackByCol).clearContent();
      sh.getRange(i + 1, ackAtCol).clearContent();
      const note = String(p.note || p.handoverNote || ("Handover to " + toStaff)).trim();
      sh.getRange(i + 1, handoverCol).setValue(note);
      return {ok:true, id:id, pic:toStaff, handoverNote:note, message:"Request handed over."};
    }
    throw new Error("Request ID not found in LIVE REQUESTS: " + id);
  } finally {
    lock.releaseLock();
  }
}

// Returns a 1-based column number, creating the metadata header at the end if needed.
function ensureOptionalColumn_(sh, headerName) {
  let headers = headerMap_(sh);
  if (headers[headerName] != null) return headers[headerName] + 1;
  const nextCol = Math.max(sh.getLastColumn(), 1) + 1;
  sh.getRange(1, nextCol).setValue(headerName);
  return nextCol;
}

function completeRequest_(ss, p) {
  const lock = LockService.getScriptLock();
  // Only the write/move operation is serialized. Dashboard reads do not acquire the lock.
  if (!lock.tryLock(3000)) throw new Error("Google Sheets is busy. Please try Mark Complete again.");
  try {
    const live = getOrCreateSheet_(ss, p.sheetName || "LIVE REQUESTS");
    const hist = getOrCreateSheet_(ss, p.historySheetName || "HISTORY");
    ensureHeadersFast_(live);
    ensureHeadersFast_(hist);
    configureImageColumns_(live);
    configureImageColumns_(hist);
    const headers = headerMap_(live);
    const data = live.getDataRange().getValues();
    const id = String(p.requestId || "");
    const idCol = headers["Request ID"];
    if (idCol == null) throw new Error("Request ID column is missing.");

    for (let i=1;i<data.length;i++) {
      if (String(data[i][idCol]) !== id) continue;
      const rowObj=rowToObject_(headers,data[i]);
      const start=timestampFromRow_(rowObj,"Start Timestamp",rowObj["Date"],rowObj["Start Time"]);
      const due=timestampFromRow_(rowObj,"Due Timestamp",rowObj["Date"],rowObj["Due Time"]);
      const now=new Date();
      const duration=start?Math.max(0,Math.round((now.getTime()-start.getTime())/60000)):"";
      const clientDateKey=normalizeDateKey_(p.clientDateKey||"");
      rowObj["Completed Date"]=clientDateKey || date_(now);
      rowObj["Completed Time"]=String(p.clientTime||time_(now));
      rowObj["Duration (Min)"]=duration;
      const requestedCompletionStatus=String(p.completionStatus||"").trim();
      rowObj["Status"]=requestedCompletionStatus==="Completed with Pending"?"Completed with Pending":((due && now.getTime()<=due.getTime())?"Completed / On Time":"Completed / Late");
      rowObj["Done By"]=String(p.doneBy||p.staffName||"");
      rowObj["Remarks"]=String(p.remark||"").trim().slice(0,5000);
      const taskImageRefs=parseImageRefs_(rowObj["Image Links"]);
      const remarkImageRefs=uploadRemarkImages_(p.remarkImages||[], id);
      // Clear old formula/error cells; keep all Drive references in the link columns.
      rowObj["Images"]="";
      rowObj["Remark Images"]="";
      rowObj["Image Links"]=taskImageRefs.length ? JSON.stringify(taskImageRefs) : String(rowObj["Image Links"]||"");
      rowObj["Remark Image Links"]=remarkImageRefs.length ? JSON.stringify(remarkImageRefs) : "";
      appendObject_(hist,rowObj);
      const historyRow=hist.getLastRow();
      if(taskImageRefs.length) renderImageRefsForRow_(hist,historyRow,taskImageRefs,"task",id);
      if(remarkImageRefs.length) renderImageRefsForRow_(hist,historyRow,remarkImageRefs,"remark",id);
      // Remove generated thumbnails from LIVE REQUESTS before moving/deleting its row.
      removeGeneratedImagesForRequest_(live,id);
      live.deleteRow(i+1);
      return {ok:true,status:rowObj["Status"],duration:duration,doneBy:rowObj["Done By"],remark:String(rowObj["Remarks"]||""),remarkImages:remarkImageRefs};
    }
    throw new Error("Request ID not found in LIVE REQUESTS.");
  } finally {
    lock.releaseLock();
  }
}

function listLive_(ss,p) {
  // IMPORTANT: this is a read path. It intentionally does not use ScriptLock.
  // Multiple computers can refresh the dashboard without blocking Save/Complete.
  const live=getOrCreateSheet_(ss,p.sheetName||"LIVE REQUESTS");
  ensureHeadersFast_(live);
  const headers=headerMap_(live), values=live.getDataRange().getValues(), rows=[];
  const now=new Date();
  for(let i=1;i<values.length;i++){
    if(!values[i][headers["Request ID"]]) continue;
    const o=rowToObject_(headers,values[i]);
    const due=timestampFromRow_(o,"Due Timestamp",o["Date"],o["Due Time"]);
    const start=timestampFromRow_(o,"Start Timestamp",o["Date"],o["Start Time"]);
    const computed=statusForNow_(due, now, p.reminderMinutes);
    // Do not write status during a read. The extension computes the live status too.
    // This removes an unnecessary write/lock source during frequent refreshes.
    rows.push({
      id:String(o["Request ID"]), date:String(o["Date"]||""), startTime:String(o["Start Time"]||""),
      startIso:start?start.toISOString():"", room:String(o["Room"]||""), guestName:String(o["Guest Name"]||""),
      request:String(o["Guest Request"]||""), priority:String(o["Priority"]||"Normal"), timing:Number(o["Timing (Min)"]||20),
      dueAt:timeFromCell_(o["Due Time"]), dueIso:due?due.toISOString():"", status:computed,
      pic:String(o["PIC"]||""), createdBy:String(o["Created By"]||""), computer:String(o["Computer"]||""),
      acknowledgedBy:String(o["Acknowledged By"]||""), acknowledgedAt:String(o["Acknowledged At"]||""),
      handoverNote:String(o["Handover Note"]||""),
      notification:normalizeNotification_(o["Notification"]),
      images:parseImageRefs_(o["Image Links"])
    });
  }
  return {ok:true,serverNow:new Date().toISOString(),rows:rows};
}

function listTodayHistory_(ss,p) {
  const hist=getOrCreateSheet_(ss,p.historySheetName||"HISTORY");
  ensureHeadersFast_(hist);
  const headers=headerMap_(hist), values=hist.getDataRange().getValues(), rows=[];
  // Prefer the extension's local date key. This prevents a mismatch when the
  // Apps Script project timezone differs from the operator's computer timezone.
  const clientToday=normalizeDateKey_(p.clientDateKey||"");
  const today=clientToday || normalizeDateKey_(date_(new Date()));
  const dateCol=headers["Completed Date"];
  for(let i=1;i<values.length;i++){
    if(!values[i][headers["Request ID"]]) continue;
    const o=rowToObject_(headers,values[i]);
    const status=String(o["Status"]||"").trim().toLowerCase();
    if(!status.startsWith("completed")) continue;
    let completedDate=dateCol!=null?o["Completed Date"]:"";
    // Backward compatibility for older HISTORY rows created before Completed Date
    // existed: use the original Date only when the new field is unavailable/empty.
    if(completedDate===null || completedDate===undefined || completedDate==="") completedDate=o["Date"]||"";
    if(normalizeDateKey_(completedDate)!==today) continue;
    rows.push({
      id:String(o["Request ID"]||""),
      date:String(o["Date"]||""),
      completedDate:formatDateForClient_(completedDate),
      room:String(o["Room"]||""),
      guestName:String(o["Guest Name"]||""),
      request:String(o["Guest Request"]||""),
      task:String(o["Task"]||""),
      completedTime:timeFromCell_(o["Completed Time"]),
      duration:String(o["Duration (Min)"]??""),
      doneBy:String(o["Done By"]||""),
      status:String(o["Status"]||"COMPLETED"),
      remark:String(o["Remarks"]||""),
      images:parseImageRefs_(o["Image Links"]),
      remarkImages:parseImageRefs_(o["Remark Image Links"])
    });
  }
  rows.sort((a,b)=>String(b.completedTime).localeCompare(String(a.completedTime)));
  return {ok:true,today:today,rows:rows};
}

// Normalize all date representations used by old/new HISTORY rows and by the
// extension into one canonical key: yyyy-MM-dd.
function normalizeDateKey_(value){
  if(value instanceof Date && !isNaN(value.getTime())){
    return Utilities.formatDate(value,Session.getScriptTimeZone(),"yyyy-MM-dd");
  }
  const s=String(value||"").trim();
  if(!s) return "";
  let m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(m) return `${m[1]}-${m[2]}-${m[3]}`;
  m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if(m) return `${m[3]}-${m[2]}-${m[1]}`;
  const d=new Date(s);
  return isNaN(d.getTime())?"":Utilities.formatDate(d,Session.getScriptTimeZone(),"yyyy-MM-dd");
}

function formatDateForClient_(value){
  const key=normalizeDateKey_(value);
  return key || String(value||"");
}

function statusForNow_(due, now, reminderMinutes) {
  if(!due || isNaN(due.getTime())) return "Time Error";
  const current=now||new Date();
  const diff=due.getTime()-current.getTime();
  if(diff>0){
    const mins=Math.max(0, Number(reminderMinutes || 5));
    if(mins>0 && diff<=mins*60000) return "Due Soon";
    return "Pending";
  }
  if(diff>-60000) return "DUE NOW";
  return "OVERDUE";
}

function timestampFromRow_(o,stampHeader,dateVal,timeVal){
  const raw=o[stampHeader];
  const parsed=parseDate_(raw);
  if(parsed && parsed.getFullYear() >= 2000) return parsed;
  return combineDateTime_(dateVal,timeVal);
}

function parseDate_(value){
  if(value instanceof Date && !isNaN(value.getTime())) return new Date(value.getTime());
  if(value===null||value===undefined||value==="") return null;
  const d=new Date(String(value));
  return isNaN(d.getTime())?null:d;
}

function appendObject_(sh,obj){
  const headers=headerMap_(sh), row=new Array(sh.getLastColumn()).fill("");
  Object.keys(obj).forEach(k=>{if(headers[k]!=null)row[headers[k]]=obj[k];});
  sh.appendRow(row);
}
function rowToObject_(headers,row){const o={};Object.keys(headers).forEach(k=>o[k]=row[headers[k]]);return o;}
function headerMap_(sh){
  const lastColumn=Math.max(sh.getLastColumn(),1), headers=sh.getRange(1,1,1,lastColumn).getValues()[0].map(x=>String(x||"").trim()),m={};
  headers.forEach((h,i)=>{if(h)m[h]=i;}); return m;
}
function ensureHeadersFast_(sh){
  if(sh.getLastRow()===0 || sh.getLastColumn()===0){
    sh.getRange(1,1,1,HEADERS.length).setValues([HEADERS]);
    sh.setFrozenRows(1);
    return;
  }
  const m=headerMap_(sh), missing=HEADERS.filter(h=>m[h]==null);
  if(missing.length) sh.getRange(1,sh.getLastColumn()+1,1,missing.length).setValues([missing]);
  if(sh.getFrozenRows()===0) sh.setFrozenRows(1);
}

function ensureHeaders_(sh){
  if(sh.getLastRow()===0||sh.getLastColumn()===0){sh.getRange(1,1,1,HEADERS.length).setValues([HEADERS]);}
  else {const m=headerMap_(sh), missing=HEADERS.filter(h=>m[h]==null); if(missing.length) sh.getRange(1,sh.getLastColumn()+1,1,missing.length).setValues([missing]);}
  sh.setFrozenRows(1);
  const refreshed = headerMap_(sh);
  ["Start Timestamp", "Due Timestamp"].forEach(h => {
    if (refreshed[h] != null && sh.getMaxRows() > 1) {
      sh.getRange(2, refreshed[h] + 1, sh.getMaxRows() - 1, 1).setNumberFormat("dd/MM/yyyy HH:mm:ss");
    }
  });
}
function getOrCreateSheet_(ss,name){return ss.getSheetByName(name)||ss.insertSheet(name);}
function normalizeNotification_(v){return String(v||"banner").trim()==="banner-alarm"?"banner-alarm":"banner";}
function clampTiming_(v){const n=Number(v||20);return Math.min(60,Math.max(5,isFinite(n)?n:20));}
function normalizeSpreadsheetId_(value){
  const v=String(value||"").trim();if(!v)return"";const m=v.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);return m?m[1]:v.replace(/[?#].*$/i,"").replace(/\/edit.*$/i,"").trim();
}
function date_(d){return Utilities.formatDate(d,Session.getScriptTimeZone(),"dd/MM/yyyy");}
function time_(d){return Utilities.formatDate(d,Session.getScriptTimeZone(),"HH:mm");}
function timeFromCell_(v){
  if(v instanceof Date && !isNaN(v.getTime())) return Utilities.formatDate(v,Session.getScriptTimeZone(),"HH:mm");
  const s=String(v||"").trim(); const m=s.match(/^(\d{1,2}):(\d{2})/); return m?`${String(Number(m[1])).padStart(2,'0')}:${m[2]}`:s;
}
function combineDateTime_(dateVal,timeVal){
  if(!dateVal||!timeVal)return null;
  let year,month,day;
  if(dateVal instanceof Date){
    year=Number(Utilities.formatDate(dateVal,Session.getScriptTimeZone(),"yyyy"));month=Number(Utilities.formatDate(dateVal,Session.getScriptTimeZone(),"MM"));day=Number(Utilities.formatDate(dateVal,Session.getScriptTimeZone(),"dd"));
  } else {const m=String(dateVal).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(!m)return null;day=Number(m[1]);month=Number(m[2]);year=Number(m[3]);}
  let hh=0,mm=0;
  if(timeVal instanceof Date){hh=Number(Utilities.formatDate(timeVal,Session.getScriptTimeZone(),"HH"));mm=Number(Utilities.formatDate(timeVal,Session.getScriptTimeZone(),"mm"));}
  else {const tm=String(timeVal).match(/^(\d{1,2}):(\d{2})/);if(!tm)return null;hh=Number(tm[1]);mm=Number(tm[2]);}
  const out=new Date(year,month-1,day,hh,mm,0,0);return isNaN(out.getTime())?null:out;
}

function authorizeDrive(){
  const folder=getImageFolder_();
  return {ok:true,folderId:folder.getId(),folderName:folder.getName(),message:"Google Drive authorization is ready. You can now use image attachments."};
}
function getImageFolder_(){
  try{
    const props=PropertiesService.getScriptProperties();
    const stored=String(props.getProperty("IRD_IMAGE_FOLDER_ID")||"").trim();
    if(stored){
      try{return DriveApp.getFolderById(stored);}catch(_){}
    }
    const folders=DriveApp.getFoldersByName("IRD Images");
    const folder=folders.hasNext()?folders.next():DriveApp.createFolder("IRD Images");
    props.setProperty("IRD_IMAGE_FOLDER_ID",folder.getId());
    return folder;
  }catch(err){
    throw new Error("Google Drive authorization is required. In the Apps Script editor, run authorizeDrive() once with the same Google account used to deploy the Web App, approve Drive access, then redeploy the Web App as a new version. Original error: "+String(err&&err.message||err));
  }
}
function safeFileName_(name,fallback){
  const base=String(name||fallback||"image.jpg").replace(/[^a-zA-Z0-9._-]+/g,"_").slice(0,120);
  return base||fallback||"image.jpg";
}
function uploadTaskImages_(images,taskId){
  const list=Array.isArray(images)?images.slice(0,5):[];
  if(!list.length) return [];
  const folder=getImageFolder_();
  const refs=[];
  list.forEach((img,index)=>{
    const dataUrl=String(img?.dataUrl||"");
    const m=dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i);
    if(!m) throw new Error("Invalid image payload for attachment " + (index+1) + ".");
    const mime=m[1].toLowerCase();
    const bytes=Utilities.base64Decode(m[2]);
    if(bytes.length>1500000) throw new Error("Image " + (index+1) + " is too large. Maximum is 1.5 MB after compression.");
    const ext=mime==="image/png"?"png":mime==="image/webp"?"webp":"jpg";
    const filename=safeFileName_(img?.name,taskId+"_"+(index+1)+"."+ext).replace(/\.(png|webp|jpeg)$/i,"."+ext);
    const file=folder.createFile(Utilities.newBlob(bytes,mime,taskId+"_"+(index+1)+"_"+filename));
    try{file.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW);}catch(_){}
    const id=file.getId();
    refs.push({id, name:file.getName(), mimeType:mime, viewUrl:"https://drive.google.com/file/d/"+id+"/view", thumbnailUrl:"https://drive.google.com/thumbnail?id="+id+"&sz=w1200"});
  });
  return refs;
}
function uploadRemarkImages_(images,taskId){
  const list=Array.isArray(images)?images.slice(0,5):[];
  if(!list.length) return [];
  return uploadImageList_(list,taskId,"remark");
}
function uploadImageList_(images,taskId,prefix){
  const folder=getImageFolder_();
  const refs=[];
  images.forEach((img,index)=>{
    const dataUrl=String(img?.dataUrl||"");
    const m=dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i);
    if(!m) throw new Error("Invalid image payload for "+prefix+" attachment "+(index+1)+".");
    const mime=m[1].toLowerCase();
    const bytes=Utilities.base64Decode(m[2]);
    if(bytes.length>1500000) throw new Error("Image "+(index+1)+" is too large. Maximum is 1.5 MB after compression.");
    const ext=mime==="image/png"?"png":mime==="image/webp"?"webp":"jpg";
    const fallback=taskId+"_"+prefix+"_"+(index+1)+"."+ext;
    const filename=safeFileName_(img?.name,fallback).replace(/\.(png|webp|jpeg)$/i,"."+ext);
    const file=folder.createFile(Utilities.newBlob(bytes,mime,taskId+"_"+prefix+"_"+filename));
    try{file.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW);}catch(_){}
    const id=file.getId();
    refs.push({id,name:file.getName(),mimeType:mime,viewUrl:"https://drive.google.com/file/d/"+id+"/view",thumbnailUrl:"https://drive.google.com/thumbnail?id="+id+"&sz=w1200"});
  });
  return refs;
}
function parseImageRefs_(value){
  const s=String(value||"").trim();
  if(!s) return [];
  try{const a=JSON.parse(s);return Array.isArray(a)?a:[];}catch(_) {return [];}
}
/**
 * Fixed-size thumbnail layout for the Images and Remark Images columns.
 * The adjacent *Links columns remain the durable Drive reference/source of truth.
 */
function configureImageColumns_(sh){
  const m=headerMap_(sh);
  if(m["Images"]!=null) sh.setColumnWidth(m["Images"]+1,480);
  if(m["Image Links"]!=null) sh.setColumnWidth(m["Image Links"]+1,220);
  if(m["Remark Images"]!=null) sh.setColumnWidth(m["Remark Images"]+1,480);
  if(m["Remark Image Links"]!=null) sh.setColumnWidth(m["Remark Image Links"]+1,220);
}

function renderImageRefsForRow_(sh,row,refs,kind,requestId){
  if(!Array.isArray(refs)||!refs.length||row<2) return 0;
  const m=headerMap_(sh);
  const header=kind==="remark"?"Remark Images":"Images";
  if(m[header]==null) return 0;
  removeGeneratedImagesForRequest_(sh,requestId,kind);
  const column=m[header]+1;
  let inserted=0;
  refs.slice(0,5).forEach((ref,index)=>{
    const fileId=String(ref&&ref.id||"").trim();
    if(!fileId) return;
    try{
      const blob=DriveApp.getFileById(fileId).getBlob();
      if(blob.getBytes().length>2*1024*1024) throw new Error("Image exceeds Google Sheets' 2 MB embedded-image limit.");
      const image=sh.insertImage(blob,column,row,index*94+4,7);
      image.setWidth(88).setHeight(76)
        .setAltTextTitle("IRDTHUMB|"+kind+"|"+String(requestId||"")+"|"+(index+1))
        .setAltTextDescription((kind==="remark"?"Remark evidence":"Task image")+" for request "+String(requestId||""));
      inserted++;
    }catch(err){
      Logger.log("IRD thumbnail insert failed for request "+requestId+" / "+kind+" / "+fileId+": "+String(err&&err.message||err));
    }
  });
  if(inserted>0) sh.setRowHeight(row,92);
  return inserted;
}

function removeGeneratedImagesForRequest_(sh,requestId,kind){
  const prefix="IRDTHUMB|"+(kind?String(kind)+"|":"");
  const exactRequest=String(requestId||"");
  sh.getImages().forEach(image=>{
    const title=String(image.getAltTextTitle()||"");
    if(!title.startsWith("IRDTHUMB|")) return;
    if(kind && !title.startsWith(prefix)) return;
    if(exactRequest && title.indexOf("|"+exactRequest+"|")<0) return;
    image.remove();
  });
}

/**
 * One-time backfill for existing HISTORY/LIVE REQUESTS rows that currently show #REF!.
 * Run from the Apps Script editor: repairHistoryImageThumbnails("SPREADSHEET_ID").
 * It clears only the display/formula cells (Images and Remark Images); Drive link JSON is preserved.
 */
function repairHistoryImageThumbnails(spreadsheetId){
  let ss;
  const configuredId=spreadsheetId||PropertiesService.getScriptProperties().getProperty("IRD_SPREADSHEET_ID")||"";
  const normalized=normalizeSpreadsheetId_(configuredId);
  if(normalized) ss=SpreadsheetApp.openById(normalized);
  else ss=SpreadsheetApp.getActiveSpreadsheet();
  if(!ss) throw new Error("Pass a Spreadsheet ID or run this from a bound spreadsheet script.");
  const results={ok:true,spreadsheetId:ss.getId(),sheets:[],inserted:0,failed:0};
  ["HISTORY","LIVE REQUESTS"].forEach(name=>{
    const sh=ss.getSheetByName(name);
    if(!sh||sh.getLastRow()<2) return;
    ensureHeadersFast_(sh);
    configureImageColumns_(sh);
    // Remove only thumbnails generated by this repair/version; other sheet images are untouched.
    sh.getImages().forEach(image=>{if(String(image.getAltTextTitle()||"").startsWith("IRDTHUMB|")) image.remove();});
    const m=headerMap_(sh), last=sh.getLastRow();
    const rows=sh.getRange(2,1,last-1,sh.getLastColumn()).getValues();
    let sheetInserted=0,sheetFailed=0;
    rows.forEach((values,index)=>{
      const row=index+2;
      const o=rowToObject_(m,values);
      const taskRefs=parseImageRefs_(o["Image Links"]);
      const remarkRefs=parseImageRefs_(o["Remark Image Links"]);
      // Remove broken IMAGE() formulas and #REF! values without touching the source links.
      if(m["Images"]!=null) sh.getRange(row,m["Images"]+1).clearContent();
      if(m["Remark Images"]!=null) sh.getRange(row,m["Remark Images"]+1).clearContent();
      if(taskRefs.length){
        const count=renderImageRefsForRow_(sh,row,taskRefs,"task",String(o["Request ID"]||""));
        sheetInserted+=count; if(count<Math.min(taskRefs.length,5)) sheetFailed+=Math.min(taskRefs.length,5)-count;
      }
      if(remarkRefs.length){
        const count=renderImageRefsForRow_(sh,row,remarkRefs,"remark",String(o["Request ID"]||""));
        sheetInserted+=count; if(count<Math.min(remarkRefs.length,5)) sheetFailed+=Math.min(remarkRefs.length,5)-count;
      }
    });
    results.sheets.push({name:name,inserted:sheetInserted,failed:sheetFailed});
    results.inserted+=sheetInserted; results.failed+=sheetFailed;
  });
  return results;
}
function json_(o){return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);}



function getStaffDirectory_(ss, p) {
  try {
    // Looks for a sheet named "STAFF DIRECTORY" or reads from "STAFF PERFORMANCE" as fallback
    const sheetName = p.directorySheetName || "STAFF DIRECTORY";
    let sh = ss.getSheetByName(sheetName);
    let colIndex = 1; // Assuming names are in column A
    
    if (!sh) {
      // Fallback to STAFF PERFORMANCE if DIRECTORY doesn't exist
      sh = ss.getSheetByName("STAFF PERFORMANCE");
      if (!sh) return { ok: false, error: "Staff sheet not found." };
    }
    
    const data = sh.getDataRange().getValues();
    if (data.length < 2) return { ok: true, staff: [] };
    
    // Extract unique staff names from the first column, skipping header
    const names = [];
    for (let i = 1; i < data.length; i++) {
      const name = String(data[i][colIndex - 1] || "").trim();
      if (name && !names.includes(name)) {
        names.push(name);
      }
    }
    
    return { ok: true, staff: names };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
