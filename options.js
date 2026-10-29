
// --- VERCEL WEB APP POLYFILL (Replaces Chrome Extension APIs) ---
window.chrome = window.chrome || {};

chrome.storage = chrome.storage || {};
const _storageHandler = {
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
chrome.storage.sync = chrome.storage.sync || _storageHandler;
chrome.storage.local = chrome.storage.local || _storageHandler;

chrome.runtime = chrome.runtime || {};
chrome.runtime.openOptionsPage = function() {
  window.location.href = 'options.html';
};
chrome.runtime.getManifest = function() {
  return { version: "3.0 (Web Native)" };
};
chrome.runtime.sendMessage = function(message, callback) {
  if (message.action === 'playAlarm' || message.action === 'testAlarm') {
    const alarm = new Audio('order_overdue_alarm.wav');
    alarm.play().catch(e => console.warn('Audio play required user interaction', e));
    if (callback) callback({ success: true });
  }
};
chrome.runtime.onMessage = chrome.runtime.onMessage || {
  addListener: function(fn) {
    window.addEventListener('message', (e) => {
       if (e.data && e.data.action) fn(e.data, {}, () => {});
    });
  }
};

chrome.tabs = chrome.tabs || {};
chrome.tabs.create = function(opt) {
  window.open(opt.url, '_blank');
};
// --- END POLYFILL ---

const ids=["endpointUrl","spreadsheetId","sheetName","historySheetName","staffName","staffList","computerName","defaultTiming","reminderMinutes","syncIntervalSeconds"];
const defaults={endpointUrl:"",spreadsheetId:"",sheetName:"LIVE REQUESTS",historySheetName:"HISTORY",staffName:"",staffList:"",computerName:"",defaultTiming:20,reminderMinutes:5,syncIntervalSeconds:30};
chrome.storage.sync.get(defaults,s=>ids.forEach(id=>document.getElementById(id).value=s[id]??""));
document.getElementById("save").onclick=async()=>{const o={};ids.forEach(id=>o[id]=document.getElementById(id).value);o.defaultTiming=Math.min(60,Math.max(5,Number(o.defaultTiming)||20));o.reminderMinutes=Math.max(0,Number(o.reminderMinutes)||0);await chrome.storage.sync.set(o);msg("✓ Settings saved.");};
document.getElementById("test").onclick=async()=>{msg("Testing…");const r=await chrome.runtime.sendMessage({type:"TEST_CONNECTION"});msg(r?.ok?`✓ Connected. ${r.data.message||""}`:`✗ ${r?.error||"Connection failed."}`,!r?.ok);};
function msg(t,e=false){const m=document.getElementById("msg");m.textContent=t;m.style.color=e?"#b42318":"#0b8f5a"}


document.getElementById("testNotification").onclick=async()=>{const el=document.getElementById("notifyMsg");el.textContent="Sending banner + testing alarm playback…";try{const r=await chrome.runtime.sendMessage({type:"TEST_NOTIFICATION",withSound:true});el.textContent=r?.ok&&r?.sound?"✓ Banner sent and audio playback confirmed by the browser. If you cannot hear it, check Windows volume/output device and mute settings.":`✗ ${r?.error||"Alarm playback was not confirmed."}`;el.style.color=r?.ok?"#0b8f5a":"#b42318";}catch(e){el.textContent=`✗ ${e?.message||e}`;el.style.color="#b42318";}};
document.getElementById("testBanner").onclick=async()=>{const el=document.getElementById("notifyMsg");el.textContent="Sending banner…";const r=await chrome.runtime.sendMessage({type:"TEST_NOTIFICATION",withSound:false});el.textContent=r?.ok?"✓ Test banner sent. Sound was intentionally disabled for this test.":`✗ ${r?.error||"Notification test failed."}`;};



document.getElementById("fetchStaff").onclick = async () => {
    msg("Fetching staff from Google Sheets...");
    const url = document.getElementById("endpointUrl").value;
    const sheetId = document.getElementById("spreadsheetId").value;
    
    if (!url || !sheetId) {
        msg("Please fill in Web App URL and Spreadsheet ID first.", true);
        return;
    }
    
    try {
        const response = await fetch(url, {
            method: "POST",
            body: JSON.stringify({
                action: "getStaffDirectory",
                spreadsheetId: sheetId
            }),
            headers: { "Content-Type": "text/plain" } // Apps script requires text/plain for CORS
        });
        const data = await response.json();
        
        if (data.ok && data.staff) {
            document.getElementById("staffList").value = data.staff.join(", ");
            msg("Staff list updated successfully.");
        } else {
            msg("Failed to fetch staff: " + (data.error || "Unknown error"), true);
        }
    } catch (e) {
        msg("Error fetching staff: " + e.message, true);
    }
};



function updateStaffDropdown() {
    const listStr = document.getElementById("staffList").value;
    const names = listStr.split(",").map(s => s.trim()).filter(Boolean);
    const select = document.getElementById("staffName");
    const currentVal = select.value;
    
    select.innerHTML = '<option value="">Select your name...</option>';
    names.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
    });
    
    if (names.includes(currentVal)) {
        select.value = currentVal;
    }
}

// Intercept the default sync load to update dropdown
const originalSyncGet = chrome.storage.sync.get;
chrome.storage.sync.get = function(def, cb) {
    originalSyncGet(def, (s) => {
        if(cb) cb(s);
        // After loading, update dropdown and set value
        updateStaffDropdown();
        document.getElementById("staffName").value = s.staffName || "";
    });
};

// Listen for changes to staffList to update dropdown
document.getElementById("staffList").addEventListener("change", updateStaffDropdown);
// Also update when fetch button modifies it
const observer = new MutationObserver(updateStaffDropdown);
observer.observe(document.getElementById("staffList"), { attributes: true, attributeFilter: ['value'] });
// Overwrite value setter to trigger event
const inputVal = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
Object.defineProperty(document.getElementById("staffList"), 'value', {
    get: function() { return inputVal.get.call(this); },
    set: function(val) { inputVal.set.call(this, val); updateStaffDropdown(); }
});



// --- ADVANCED VERCEL BACKEND POLYFILL ---
chrome.runtime.sendMessage = async function(message, callback) {
    const getSettings = () => new Promise(res => chrome.storage.sync.get(['endpointUrl', 'spreadsheetId', 'sheetName', 'historySheetName', 'staffName', 'computerName', 'reminderMinutes'], res));
    const s = await getSettings();
    
    // 1. Notification & Audio Handling for Web
    if (message.type === 'TEST_NOTIFICATION') {
        let soundOk = false;
        if (message.withSound) {
            try { 
                const audio = new Audio('order_overdue_alarm.wav');
                await audio.play();
                soundOk = true; 
            } catch(e){ console.warn("Audio blocked by browser:", e); }
        }
        
        // Request Web Notification permission
        if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
            await Notification.requestPermission();
        }
        if (Notification.permission === 'granted') {
            new Notification("IRD Assistant", {body: "Test Banner Berhasil!", icon: "icon48.png"});
        }
        
        const res = {ok: true, sound: soundOk, message: "Tested"};
        if(callback) callback(res);
        return res;
    }
    
    if (message.action === 'playAlarm' || message.type === 'PLAY_ALARM') {
        try { new Audio('order_overdue_alarm.wav').play(); } catch(e){}
        return {ok: true};
    }

    // 2. Local State Handling (Vercel uses localStorage)
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
        return {ok: true}; // Now handled natively inside realtimeSyncTick
    }

    // 3. API Routing to Google Apps Script
    if (!s.endpointUrl) return {ok: false, error: "Web App URL belum diisi di Settings."};
    if (!s.spreadsheetId) return {ok: false, error: "Spreadsheet ID belum diisi di Settings."};
    
    let payload = { spreadsheetId: s.spreadsheetId };
    
    switch (message.type) {
        case 'TEST_CONNECTION': payload.action = 'testConnection'; break;
        case 'SAVE_REQUEST': payload.action = 'createRequest'; payload.request = message.request; payload.staffName = s.staffName; payload.computerName = s.computerName; break;
        case 'LIST_LIVE': 
        case 'SYNC_NOW': payload.action = 'listLive'; payload.sheetName = s.sheetName || 'LIVE REQUESTS'; payload.reminderMinutes = s.reminderMinutes || 5; break;
        case 'LIST_TODAY_HISTORY': payload.action = 'listTodayHistory'; payload.historySheetName = s.historySheetName || 'HISTORY'; payload.clientDateKey = message.clientDateKey; break;
        case 'ACKNOWLEDGE_REQUEST': payload.action = 'acknowledgeRequest'; Object.assign(payload, message); break;
        case 'HANDOVER_REQUEST': payload.action = 'handoverRequest'; Object.assign(payload, message); break;
        case 'COMPLETE_REQUEST': payload.action = 'completeRequest'; Object.assign(payload, message); break;
        default: return {ok: false, error: "Unknown action: " + message.type};
    }
    
    try {
        const response = await fetch(s.endpointUrl, {
            method: "POST",
            body: JSON.stringify(payload),
            headers: { "Content-Type": "text/plain" }
        });
        const data = await response.json();
        if (callback) callback(data);
        return data;
    } catch (e) {
        const err = {ok: false, error: "Network Error: Pastikan URL Web App benar dan di-deploy Anyone/Me. (" + e.message + ")"};
        if (callback) callback(err);
        return err;
    }
};
