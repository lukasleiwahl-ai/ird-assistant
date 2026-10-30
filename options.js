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

const ids=["endpointUrl","spreadsheetId","sheetName","historySheetName","staffName","staffList","computerName","defaultTiming","reminderMinutes","syncIntervalSeconds"];
const defaults={endpointUrl:"",spreadsheetId:"",sheetName:"LIVE REQUESTS",historySheetName:"HISTORY",staffName:"",staffList:"",computerName:"",defaultTiming:20,reminderMinutes:5,syncIntervalSeconds:10};
VercelStorage.sync.get(defaults,s=>ids.forEach(id=>document.getElementById(id).value=s[id]??""));
document.getElementById("save").onclick=async()=>{const o={};ids.forEach(id=>o[id]=document.getElementById(id).value);o.defaultTiming=Math.min(60,Math.max(5,Number(o.defaultTiming)||20));o.reminderMinutes=Math.max(0,Number(o.reminderMinutes)||0);await VercelStorage.sync.set(o);msg("✓ Settings saved.");};
document.getElementById("test").onclick=async()=>{msg("Testing…");const r=await VercelBackend.sendMessage({type:"TEST_CONNECTION"});msg(r?.ok?`✓ Connected. ${r.message||""}`:`✗ ${r?.error||"Connection failed."}`,!r?.ok);};
function msg(t,e=false){const m=document.getElementById("msg");m.textContent=t;m.style.color=e?"#b42318":"#0b8f5a"}


document.getElementById("testNotification").onclick=async()=>{const el=document.getElementById("notifyMsg");el.textContent="Sending device notification + testing alarm playback…";try{if(typeof Notification!=="undefined"&&Notification.permission==="default")await Notification.requestPermission();const r=await VercelBackend.sendMessage({type:"TEST_NOTIFICATION",withSound:true});el.textContent=r?.ok?"✓ Device notification displayed and alarm playback confirmed.":`✗ ${r?.error||"Device notification or alarm test failed."}`;el.style.color=r?.ok?"#0b8f5a":"#b42318";}catch(e){el.textContent=`✗ ${e?.message||e}`;el.style.color="#b42318";}};
document.getElementById("testBanner").onclick=async()=>{const el=document.getElementById("notifyMsg");el.textContent="Sending device notification…";try{if(typeof Notification!=="undefined"&&Notification.permission==="default")await Notification.requestPermission();const r=await VercelBackend.sendMessage({type:"TEST_NOTIFICATION",withSound:false});el.textContent=r?.banner?"✓ Test device notification displayed. Sound was intentionally disabled.":`✗ ${r?.error||"Notification test failed."}`;el.style.color=r?.banner?"#0b8f5a":"#b42318";}catch(e){el.textContent=`✗ ${e?.message||e}`;el.style.color="#b42318";}};




function pushMessage(text, isError=false) {
    const el = document.getElementById("pushMsg");
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? "#b42318" : "#0b8f5a";
}

function base64UrlToUint8Array(base64Url) {
    const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
    const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64);
    const output = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
    return output;
}

function isIosDevice() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

async function enablePushOnThisDevice() {
    const button = document.getElementById("enablePush");
    button.disabled = true;
    pushMessage("Preparing notification permission and device registration…");
    try {
        const endpointUrl = String(document.getElementById("endpointUrl").value || "").trim();
        const spreadsheetIdRaw = String(document.getElementById("spreadsheetId").value || "").trim();
        const spreadsheetMatch = spreadsheetIdRaw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        const spreadsheetId = spreadsheetMatch ? spreadsheetMatch[1] : spreadsheetIdRaw.replace(/[?#].*$/i, "").replace(/\/edit.*$/i, "").trim();
        if (!endpointUrl || !spreadsheetId) throw new Error("Save the Apps Script URL and Spreadsheet ID first.");
        if (!window.isSecureContext) throw new Error("Notifications require HTTPS. Open the deployed Vercel HTTPS address.");
        if (!("serviceWorker" in navigator) || !("PushManager" in window) || typeof Notification === "undefined") {
            throw new Error("This browser does not support Web Push. Use an up-to-date Chrome, Edge, or Safari PWA.");
        }
        const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
        if (isIosDevice() && !standalone) {
            throw new Error("On iPhone/iPad, add IRD Assistant to the Home Screen first, open it from its icon, then enable notifications here.");
        }
        let permission = Notification.permission;
        if (permission === "default") permission = await Notification.requestPermission();
        if (permission !== "granted") throw new Error("Notification permission is " + permission + ". Enable notifications for this site in browser settings.");

        const registration = await navigator.serviceWorker.register("./service-worker.js", { scope: "./" });
        await navigator.serviceWorker.ready;
        const pushApiUrl = new URL("./api/push", window.location.href).toString();
        const configResponse = await fetch(pushApiUrl, { method: "GET", cache: "no-store" });
        const config = await configResponse.json();
        if (!configResponse.ok || !config.ok || !config.publicKey) throw new Error(config.error || "Vercel Push endpoint is not configured. Deploy the /api/push function and VAPID public key first.");

        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: base64UrlToUint8Array(config.publicKey)
            });
        }
        const staffName = String(document.getElementById("staffName").value || "").trim();
        const computerName = String(document.getElementById("computerName").value || "").trim();
        const payload = {
            action: "registerPushSubscription",
            spreadsheetId,
            sheetName: String(document.getElementById("sheetName").value || "LIVE REQUESTS").trim(),
            historySheetName: String(document.getElementById("historySheetName").value || "HISTORY").trim(),
            subscription: subscription.toJSON(),
            staffName,
            computerName,
            userAgent: navigator.userAgent,
            pushApiUrl
        };
        const response = await fetch(endpointUrl, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload),
            cache: "no-store"
        });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || "Apps Script could not save this device's push subscription.");
        if (result.triggerReady) {
            pushMessage("✓ This device is registered. Background push scheduler is already active.");
        } else {
            pushMessage("✓ This device is registered. One-time administrator setup remains: set IRD_PUSH_SECRET in Apps Script/Vercel, then run installPushNotifications() in the Apps Script editor.");
        }
    } catch (error) {
        pushMessage(error && error.message ? error.message : String(error), true);
    } finally {
        button.disabled = false;
    }
}

const enablePushButton = document.getElementById("enablePush");
if (enablePushButton) enablePushButton.addEventListener("click", enablePushOnThisDevice);

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
                spreadsheetId: sheetId,
                directorySheetName: "Staff Directory"
            }),
            headers: { "Content-Type": "text/plain" } // Apps script requires text/plain for CORS
        });
        const data = await response.json();
        
        if (data.ok && Array.isArray(data.staff)) {
            document.getElementById("staffList").value = data.staff.join(", ");
            if (data.staff.length) {
                msg(`Staff list updated from ${data.sourceSheet || "Google Sheets"} (${data.staff.length} names).`);
            } else {
                msg(`Connected to ${data.sourceSheet || "the staff sheet"}, but no staff names were found in column A. Check that names start below the header.` , true);
            }
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
const originalSyncGet = VercelStorage.sync.get;
VercelStorage.sync.get = function(def, cb) {
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