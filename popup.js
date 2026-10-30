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
        const s = await getSettings();
        
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
                bannerError = "This browser does not support desktop notifications.";
            } else {
                try {
                    let permission = Notification.permission;
                    if (permission === "default") permission = await Notification.requestPermission();
                    if (permission === "granted") {
                        new Notification("IRD Assistant", {body: "Test Banner Berhasil!", icon: "icon48.png"});
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

        if (!s.endpointUrl) return {ok: false, error: "Web App URL belum diisi di Settings."};
        if (!s.spreadsheetId) return {ok: false, error: "Spreadsheet ID belum diisi di Settings."};
        
        let payload = { spreadsheetId: s.spreadsheetId, sheetName: s.sheetName || "LIVE REQUESTS", historySheetName: s.historySheetName || "HISTORY" };
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

const $=id=>document.getElementById(id);
VercelStorage.sync.get({endpointUrl:"",spreadsheetId:"",sheetName:"LIVE REQUESTS",staffName:""},s=>{
  const ok=!!s.endpointUrl&&!!String(s.spreadsheetId||"").trim();
  $("status").innerHTML=ok?`<span class="ok">● Connected</span> • ${s.sheetName} • ${s.staffName||"Staff not set"}`:`<span class="err">● Google Sheets not configured</span>`;
});
$("openAssistant").onclick=()=>VercelBackend.sendMessage({type:"OPEN_ASSISTANT",request:{__mode:"new"}});
$("options").onclick=()=>VercelBackend.openOptionsPage();
$("live").onclick=async()=>{
  $("list").textContent="Loading…";
  const r=await VercelBackend.sendMessage({type:"LIST_LIVE"});
  if(!r?.ok){$("list").innerHTML=`<div class="err">${r?.error||"Failed"}</div>`;return;}
  const rows=r.rows||[];
  $("list").innerHTML=rows.slice(0,12).map(x=>`<div class="task"><b>Room ${x.room}</b><br>${x.request}<br><span class="small">${x.status||"Pending"} • due ${x.dueAt||"-"}</span></div>`).join("")||"<div class='small'>No live requests.</div>";
};