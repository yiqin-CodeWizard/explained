importScripts('shared.js');

let active = null;
let revision = 0;
let queue = Promise.resolve();
let connectionQueue = Promise.resolve();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const serial = work => { queue = queue.catch(() => {}).then(work); return queue; };
const send = (port, message) => { try { port.postMessage(message); } catch { /* Reader closed. */ } };
const storedSettings = async () => Explained.settings((await chrome.storage.local.get('settings')).settings);
const isReader = sender => sender.id === chrome.runtime.id && sender.tab && sender.frameId === 0 && /^https?:\/\//.test(sender.url || '') && new URL(sender.url).origin !== 'https://chat.deepseek.com';

// Tab creation has its own lock. Opening DeepSeek must not wait behind a lookup
// that is itself waiting for the website to become ready.
function connectionTab(create = true, foreground = false) {
  connectionQueue = connectionQueue.catch(() => {}).then(() => prepareConnectionTab(create, foreground));
  return connectionQueue;
}
async function prepareConnectionTab(create, foreground) {
  const saved = (await chrome.storage.session.get('connectionTabId')).connectionTabId;
  if (Number.isInteger(saved)) {
    try {
      const tab = await chrome.tabs.get(saved);
      if ((tab.url || tab.pendingUrl || '').startsWith('https://chat.deepseek.com/')) {
        if (tab.discarded) await chrome.tabs.reload(tab.id);
        if (foreground) await chrome.tabs.update(tab.id, { active: true });
        return tab;
      }
    } catch { /* Closed tab: create a fresh background connection on demand. */ }
  }
  if (!create) return null;
  const tab = await chrome.tabs.create({ url: 'https://chat.deepseek.com/', active: foreground });
  await chrome.storage.session.set({ connectionTabId: tab.id });
  return tab;
}
async function readyTab(currentRevision) {
  const tab = await connectionTab();
  for (let i = 0; i < 60; i++) {
    if (revision !== currentRevision) throw new Error('CANCELLED');
    try {
      const status = await chrome.tabs.sendMessage(tab.id, { type: 'EX_PING' });
      if (status?.ready) {
        if (status.busy) {
          // A service-worker restart may leave a bounded request in the page.
          // Abort that orphan; never resubmit or retry its completion POST.
          const cancelled = await chrome.tabs.sendMessage(tab.id, { type: 'EX_CANCEL' });
          if (!cancelled?.cancelled) throw new Error('BUSY');
        }
        return tab;
      }
    } catch (error) {
      if (['BUSY'].includes(error.message)) throw error;
    }
    await sleep(250);
  }
  throw new Error('CONNECTION_UNAVAILABLE');
}
async function cancelActive() {
  const old = active;
  active = null;
  if (!old) return;
  clearTimeout(old.timer);
  send(old.port, { id: old.id, event: 'cancelled' });
  if (old.tabId) {
    try { await chrome.tabs.sendMessage(old.tabId, { type: 'EX_CANCEL', id: old.id }); } catch { /* Closed or navigated. */ }
  }
}
async function lookup(port, message, currentRevision) {
  await cancelActive();
  if (revision !== currentRevision) return;
  const prefs = await storedSettings();
  if (revision !== currentRevision) return;
  const host = new URL(port.sender.url).hostname;
  if (!prefs.enabled || !prefs.consent || prefs.pausedSites.includes(host)) {
    send(port, { id: message.id, event: 'error', code: 'PAUSED_OR_CONSENT_REQUIRED' }); return;
  }
  const task = { id: message.id, port, tabId: null };
  active = task;
  send(port, { id: message.id, event: 'connecting' });
  try {
    const tab = await readyTab(currentRevision);
    if (revision !== currentRevision || active !== task) return;
    task.tabId = tab.id;
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'EX_RUN', id: task.id, term: message.term, context: prefs.contextEnabled ? message.context : '',
      language: prefs.language, mode: message.mode, detail: message.detail === true
    });
    if (!response?.accepted) throw new Error(response?.code || 'REQUEST_REJECTED');
    if (active === task) task.timer = setTimeout(() => {
      if (active !== task) return;
      send(port, { id: task.id, event: 'error', code: 'TIMEOUT' });
      void serial(cancelActive);
    }, 70000);
  } catch (error) {
    if (revision !== currentRevision || active !== task) return;
    send(port, { id: task.id, event: 'error', code: ['BUSY', 'CONNECTION_UNAVAILABLE'].includes(error.message) ? error.message : 'CONNECTION_FAILED' });
    active = null;
  }
}
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'explained-reader' || !isReader(port.sender)) { port.disconnect(); return; }
  port.onMessage.addListener(message => {
    if (message.type === 'KEEPALIVE') return; // Incoming traffic keeps an active MV3 request alive.
    if (message.type === 'CANCEL') {
      if (port.lookupRevision === revision && (!message.id || port.lookupId === message.id)) {
        ++revision;
        void serial(cancelActive);
      }
      return;
    }
    if (message.type !== 'LOOKUP' || typeof message.id !== 'string' || message.id.length > 80 || typeof message.term !== 'string' || !message.term.trim() || message.term.length > 500 || typeof message.context !== 'string' || message.context.length > 600 || !['explain', 'news'].includes(message.mode)) return;
    const currentRevision = ++revision;
    port.lookupRevision = currentRevision;
    port.lookupId = message.id;
    void serial(() => lookup(port, message, currentRevision));
  });
  port.onDisconnect.addListener(() => {
    if (port.lookupRevision === revision) { ++revision; void serial(cancelActive); }
  });
});
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message.type === 'EX_EVENT') {
    if (!active || sender.tab?.id !== active.tabId || sender.frameId !== 0 || sender.origin !== 'https://chat.deepseek.com' || message.id !== active.id) return;
    const task = active;
    // Relay only the bounded product contract, never arbitrary page fields.
    if (!['stage', 'streaming', 'complete', 'error'].includes(message.event)) return;
    send(task.port, { id: task.id, event: message.event, text: typeof message.text === 'string' ? message.text.slice(0, 32768) : '', sources: Array.isArray(message.sources) ? message.sources.slice(0, 32) : [], code: typeof message.code === 'string' ? message.code.slice(0, 80) : '', stage: typeof message.stage === 'string' ? message.stage.slice(0, 40) : '' });
    if (['complete', 'error'].includes(message.event)) { clearTimeout(task.timer); active = null; }
    return;
  }
  const popup = !sender.tab && sender.url === chrome.runtime.getURL('popup.html');
  const reader = isReader(sender);
  if (message.type === 'OPEN_CONNECTION' && (popup || reader)) {
    connectionTab(true, true).then(() => reply({ ok: true }), () => reply({ ok: false })); return true;
  }
  if (message.type === 'CONNECTION_STATUS' && popup) {
    (async () => {
      const tab = await connectionTab(false);
      if (!tab) return { status: 'closed' };
      try {
        const status = await chrome.tabs.sendMessage(tab.id, { type: 'EX_PING' });
        return { status: status?.ready ? 'connected' : 'unavailable' };
      } catch { return { status: 'unavailable' }; }
    })().then(reply);
    return true;
  }
});
chrome.tabs.onRemoved.addListener(tabId => {
  if (active?.tabId === tabId) {
    send(active.port, { id: active.id, event: 'error', code: 'CONNECTION_CLOSED' });
    clearTimeout(active.timer); active = null; ++revision;
  }
});
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (active?.tabId === tabId && (change.status === 'loading' || change.discarded === true)) {
    send(active.port, { id: active.id, event: 'error', code: 'CONNECTION_INTERRUPTED' });
    clearTimeout(active.timer); active = null; ++revision;
    void chrome.tabs.sendMessage(tabId, { type: 'EX_CANCEL' }).catch(() => {});
  }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings && active) {
    const prefs = Explained.settings(changes.settings.newValue);
    const host = new URL(active.port.sender.url).hostname;
    if (!prefs.enabled || !prefs.consent || prefs.pausedSites.includes(host) || prefs.language !== Explained.settings(changes.settings.oldValue).language || prefs.contextEnabled !== Explained.settings(changes.settings.oldValue).contextEnabled) {
      ++revision; void serial(cancelActive);
    }
  }
});
