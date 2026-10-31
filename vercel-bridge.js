/*
 * IRD Assistant Vercel Web Runtime Bridge v2.7.9.12
 * Vercel-only adapter: exposes the small Chrome-extension API surface used by
 * the shared assistant.js, then routes those actions directly to the same
 * Google Apps Script Web App used by the Chrome/Edge extension.
 *
 * This file is loaded ONLY by the Vercel index.html. It does not alter the
 * browser-extension package, manifest, content scripts, or Apps Script.
 */
(function installIRDVercelBridge(global) {
  'use strict';

  const hasRealExtensionRuntime = Boolean(
    global.chrome &&
    global.chrome.runtime &&
    typeof global.chrome.runtime.sendMessage === 'function' &&
    global.chrome.storage &&
    global.chrome.storage.sync
  );
  if (hasRealExtensionRuntime) return;

  const DEFAULTS = {
    endpointUrl: '',
    spreadsheetId: '',
    sheetName: 'LIVE REQUESTS',
    historySheetName: 'HISTORY',
    staffName: '',
    staffList: '',
    computerName: '',
    reminderMinutes: 5,
    defaultTiming: 20
  };

  function parseStoredValue(raw, fallback) {
    if (raw === null || raw === undefined) return fallback;
    try { return JSON.parse(raw); } catch (_) { return raw; }
  }

  function storageArea(storage, prefix) {
    const keyOf = key => `${prefix}${String(key)}`;
    function get(keys, callback) {
      const promise = Promise.resolve().then(() => {
        const result = {};
        if (keys === null || keys === undefined) {
          for (let i = 0; i < storage.length; i++) {
            const rawKey = storage.key(i);
            if (!rawKey || !rawKey.startsWith(prefix)) continue;
            const key = rawKey.slice(prefix.length);
            result[key] = parseStoredValue(storage.getItem(rawKey), undefined);
          }
        } else if (typeof keys === 'string') {
          const key = keys;
          result[key] = parseStoredValue(storage.getItem(keyOf(key)), undefined);
        } else if (Array.isArray(keys)) {
          keys.forEach(key => { result[key] = parseStoredValue(storage.getItem(keyOf(key)), undefined); });
        } else if (typeof keys === 'object') {
          Object.keys(keys).forEach(key => {
            result[key] = parseStoredValue(storage.getItem(keyOf(key)), keys[key]);
          });
        }
        return result;
      });
      if (typeof callback === 'function') promise.then(callback);
      return promise;
    }
    function set(values, callback) {
      const promise = Promise.resolve().then(() => {
        Object.entries(values || {}).forEach(([key, value]) => {
          const raw = typeof value === 'string' ? value : JSON.stringify(value);
          storage.setItem(keyOf(key), raw);
        });
      });
      if (typeof callback === 'function') promise.then(callback);
      return promise;
    }
    function remove(keys, callback) {
      const list = Array.isArray(keys) ? keys : [keys];
      const promise = Promise.resolve().then(() => list.forEach(key => storage.removeItem(keyOf(key))));
      if (typeof callback === 'function') promise.then(callback);
      return promise;
    }
    function clear(callback) {
      const promise = Promise.resolve().then(() => {
        const removeKeys = [];
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          if (key && key.startsWith(prefix)) removeKeys.push(key);
        }
        removeKeys.forEach(key => storage.removeItem(key));
      });
      if (typeof callback === 'function') promise.then(callback);
      return promise;
    }
    return { get, set, remove, clear };
  }

  const syncStorage = storageArea(global.localStorage, '');
  const localStorageArea = storageArea(global.localStorage, 'ird.vercel.local.');
  const sessionStorageArea = storageArea(global.sessionStorage, 'ird.vercel.session.');

  function normalizeSpreadsheetId(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const match = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : raw.replace(/[?#].*$/i, '').replace(/\/edit.*$/i, '').trim();
  }

  async function getSettings() {
    return { ...DEFAULTS, ...(await syncStorage.get(DEFAULTS)) };
  }

  async function getIdentity(settings) {
    const readerName = String(settings.staffName || settings.computerName || 'IRD User').trim() || 'IRD User';
    if (String(settings.staffName || '').trim()) {
      return {
        readerKey: 'staff:' + String(settings.staffName).trim().toLowerCase().replace(/\s+/g, ' '),
        readerName
      };
    }
    const stored = await localStorageArea.get({ irdDiscussionDeviceId: '' });
    let id = String(stored.irdDiscussionDeviceId || '');
    if (!id) {
      id = global.crypto && typeof global.crypto.randomUUID === 'function'
        ? global.crypto.randomUUID()
        : 'device-' + Date.now().toString(36) + Math.random().toString(36).slice(2);
      await localStorageArea.set({ irdDiscussionDeviceId: id });
    }
    return { readerKey: 'device:' + id, readerName };
  }

  async function callAppsScript(action, payload = {}) {
    const settings = await getSettings();
    const endpointUrl = String(settings.endpointUrl || '').trim();
    const spreadsheetId = normalizeSpreadsheetId(settings.spreadsheetId);
    if (!endpointUrl) throw new Error('Google Apps Script Web App URL is not configured in Vercel Settings.');
    if (!spreadsheetId) throw new Error('Google Spreadsheet ID is not configured in Vercel Settings.');

    const body = {
      action,
      spreadsheetId,
      sheetName: settings.sheetName || 'LIVE REQUESTS',
      historySheetName: settings.historySheetName || 'HISTORY',
      computerName: settings.computerName || '',
      staffName: settings.staffName || '',
      reminderMinutes: Number(settings.reminderMinutes || 5),
      ...payload
    };

    const controller = new AbortController();
    const timeout = global.setTimeout(() => controller.abort(), 20000);
    let response;
    let raw;
    try {
      response = await global.fetch(endpointUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
        cache: 'no-store',
        redirect: 'follow',
        signal: controller.signal
      });
      raw = await response.text();
    } catch (error) {
      if (error && error.name === 'AbortError') throw new Error('Google Apps Script request timed out after 20 seconds.');
      throw new Error('Cannot reach Google Apps Script Web App: ' + String(error && error.message || error));
    } finally {
      global.clearTimeout(timeout);
    }

    let data;
    try { data = JSON.parse(raw); }
    catch (_) {
      const preview = String(raw || '').replace(/\s+/g, ' ').slice(0, 180);
      throw new Error('Google Apps Script returned a non-JSON response. Check Web App deployment access. Response: ' + preview);
    }
    if (!response.ok) throw new Error('Google Apps Script HTTP ' + response.status + ': ' + (data.error || response.statusText));
    if (data && data.ok === false) throw new Error(data.error || 'Google Apps Script request failed.');
    return data;
  }

  async function testDeviceNotification(withSound) {
    let soundOk = !withSound;
    let bannerOk = false;
    const errors = [];
    if (withSound) {
      try {
        const audio = new Audio('./order_overdue_alarm.wav');
        audio.preload = 'auto';
        await audio.play();
        soundOk = true;
      } catch (error) {
        errors.push('Alarm playback failed: ' + String(error && error.message || error));
      }
    }
    if (typeof global.Notification === 'undefined') {
      errors.push('This browser does not support notifications.');
    } else {
      try {
        let permission = global.Notification.permission;
        if (permission === 'default') permission = await global.Notification.requestPermission();
        if (permission !== 'granted') throw new Error('Notification permission is ' + permission + '.');
        if ('serviceWorker' in navigator) {
          await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
          const registration = await navigator.serviceWorker.ready;
          await registration.showNotification('IRD Assistant', {
            body: 'Test notification delivered successfully.',
            icon: './icon128.png', badge: './icon48.png', tag: 'ird-test-notification'
          });
        } else {
          new global.Notification('IRD Assistant', { body: 'Test notification delivered successfully.', icon: './icon48.png' });
        }
        bannerOk = true;
      } catch (error) {
        errors.push(String(error && error.message || error));
      }
    }
    return { ok: bannerOk && soundOk, banner: bannerOk, sound: soundOk, error: errors.join(' '), message: 'Notification test finished.' };
  }

  async function handleMessage(message) {
    const msg = message || {};
    const type = String(msg.type || '');

    if (type === 'GET_PENDING') {
      const stored = await sessionStorageArea.get({ pendingRequest: null });
      return { ok: true, request: stored.pendingRequest || null };
    }
    if (type === 'CLEAR_PENDING') {
      await sessionStorageArea.remove('pendingRequest');
      return { ok: true };
    }
    if (type === 'GET_ALERT') return { ok: true, alert: null };
    if (type === 'CLEAR_ALERT' || type === 'EVALUATE_LOCAL_NOTIFICATIONS' || type === 'RESET_ALERT_STATE') return { ok: true };
    if (type === 'GET_SYNC_STATUS') return { ok: true, status: { lastLiveSyncAt: 0, lastLiveSyncCount: 0, lastSyncError: '' } };
    if (type === 'TEST_NOTIFICATION') return testDeviceNotification(msg.withSound !== false);
    if (type === 'PLAY_ALARM' || msg.action === 'playAlarm') {
      try { const audio = new Audio('./order_overdue_alarm.wav'); await audio.play(); return { ok: true }; }
      catch (error) { return { ok: false, error: String(error && error.message || error) }; }
    }
    if (type === 'OPEN_ASSISTANT') return { ok: true };

    const settings = await getSettings();
    const identity = await getIdentity(settings);
    let action = '';
    let payload = {};

    switch (type) {
      case 'TEST_CONNECTION':
        action = 'testConnection';
        break;
      case 'FETCH_STAFF_DIRECTORY':
        action = 'getStaffDirectory';
        payload.directorySheetName = msg.directorySheetName || 'Staff Directory';
        break;
      case 'SAVE_REQUEST':
        action = 'createRequest';
        payload = { request: msg.request || {}, staffName: settings.staffName || '', computerName: settings.computerName || '' };
        break;
      case 'LIST_LIVE':
      case 'SYNC_NOW':
        action = 'listLive';
        payload = { readerKey: identity.readerKey, readerName: identity.readerName };
        break;
      case 'LIST_TODAY_HISTORY':
        action = 'listTodayHistory';
        payload = { clientDateKey: msg.clientDateKey || '', readerKey: identity.readerKey, readerName: identity.readerName };
        break;
      case 'ACKNOWLEDGE_REQUEST':
        action = 'acknowledgeRequest';
        payload = { requestId: msg.requestId, staffName: msg.staffName || '', clientTime: msg.clientTime || '' };
        break;
      case 'HANDOVER_REQUEST':
        action = 'handoverRequest';
        payload = { requestId: msg.requestId, toStaff: msg.toStaff || '', staffName: msg.staffName || '', note: msg.note || '' };
        break;
      case 'COMPLETE_REQUEST':
        action = 'completeRequest';
        payload = {
          requestId: msg.requestId,
          doneBy: msg.doneBy || '',
          completionStatus: msg.completionStatus || '',
          remark: msg.remark || '',
          remarkImages: Array.isArray(msg.remarkImages) ? msg.remarkImages : [],
          clientDateKey: msg.clientDateKey || '',
          clientTime: msg.clientTime || ''
        };
        break;
      case 'LIST_NOTIFICATIONS':
        action = 'listNotifications';
        payload = { readerKey: identity.readerKey, readerName: identity.readerName };
        break;
      case 'MARK_NOTIFICATION_READ':
        action = 'markNotificationRead';
        payload = { notificationId: msg.notificationId, readerKey: identity.readerKey, readerName: identity.readerName };
        break;
      case 'LIST_TASK_REPLIES':
        action = 'listTaskReplies';
        payload = { taskId: msg.taskId, readerKey: identity.readerKey, readerName: identity.readerName };
        break;
      case 'POST_TASK_REPLY':
        action = 'postTaskReply';
        payload = { taskId: msg.taskId, room: msg.room || '', senderName: settings.staffName || identity.readerName, message: msg.message || '' };
        break;
      case 'MARK_TASK_REPLIES_READ':
        action = 'markTaskRepliesRead';
        payload = { taskId: msg.taskId, readerKey: identity.readerKey, readerName: identity.readerName };
        break;
      default:
        return { ok: false, error: 'Unsupported Vercel action: ' + type };
    }

    const data = await callAppsScript(action, payload);
    if (type === 'SYNC_NOW') return { ok: true, data, rows: Array.isArray(data.rows) ? data.rows : [] };
    if (type === 'FETCH_STAFF_DIRECTORY') {
      const staff = Array.isArray(data.staff) ? data.staff : [];
      return { ok: true, staff, count: Number(data.count ?? staff.length), sourceSheet: data.sourceSheet || msg.directorySheetName || 'Staff Directory', data };
    }
    return { ok: true, data };
  }

  function sendMessage(message, callback) {
    const promise = Promise.resolve().then(() => handleMessage(message)).catch(error => ({
      ok: false,
      error: String(error && error.message || error)
    }));
    if (typeof callback === 'function') promise.then(callback);
    return promise;
  }

  const eventStub = { addListener() {}, removeListener() {}, hasListener() { return false; } };
  const chromeApi = global.chrome || {};
  chromeApi.runtime = {
    ...(chromeApi.runtime || {}),
    sendMessage,
    onMessage: eventStub,
    openOptionsPage: () => { global.location.href = './options.html'; return Promise.resolve(); },
    getURL: path => new URL(String(path || ''), global.location.href).href
  };
  chromeApi.storage = {
    ...(chromeApi.storage || {}),
    sync: syncStorage,
    local: localStorageArea,
    session: sessionStorageArea,
    onChanged: eventStub
  };
  chromeApi.tabs = {
    ...(chromeApi.tabs || {}),
    create: options => {
      const url = options && options.url ? options.url : './index.html';
      const opened = global.open(url, '_blank', 'noopener');
      return Promise.resolve({ id: opened ? 1 : undefined });
    }
  };
  global.chrome = chromeApi;
  global.IRDVercelBridge = { version: '2.7.9.12', handleMessage, callAppsScript };
  console.info('[IRD Assistant] Vercel runtime bridge ready v2.7.9.12');
})(window);
