importScripts('shared.js', 'api-client.js');

let active = null;
let revision = 0;
let queue = Promise.resolve();
let configuring = false;
const serial = work => { queue = queue.catch(() => {}).then(work); return queue; };
const send = (port, message) => { try { port.postMessage(message); } catch { /* Reader closed. */ } };
// Keys live only in trusted session memory. Never adopt a legacy on-disk key.
// Gate all operations on access restrictions and deletion, including worker restarts.
const privateStorage = Promise.all([
  chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
  chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })
]).then(() => chrome.storage.local.remove('apiKey'));
const storedSettings = async () => { await privateStorage; return Explained.settings((await chrome.storage.local.get('settings')).settings); };
const isReader = sender => sender.id === chrome.runtime.id && sender.tab && sender.frameId === 0 && /^https?:\/\//.test(sender.url || '') && new URL(sender.url).origin !== 'https://chat.deepseek.com';
const isPage = (sender, file) => sender.id === chrome.runtime.id && sender.url?.split('?')[0] === chrome.runtime.getURL(file);
async function openSetup(edit = true) {
  const url = chrome.runtime.getURL('welcome.html') + (edit ? '?edit=1' : '');
  await chrome.windows.create({ url, type: 'popup', width: 520, height: 800, focused: true })
    .catch(() => chrome.tabs.create({ url, active: true }));
}
chrome.runtime.onInstalled.addListener(details => {
  void (async () => {
    await privateStorage;
    await chrome.storage.session.remove('connectionTabId');
    const { apiKey } = await chrome.storage.session.get('apiKey');
    if (details.reason === 'install' || (details.reason === 'update' && !DeepSeekAPI.key(apiKey))) await openSetup(false);
  })().catch(() => {});
});
function cancelActive() {
  const old = active;
  active = null;
  if (!old) return;
  clearTimeout(old.timer); old.controller.abort();
  send(old.port, { id: old.id, event: 'cancelled' });
}
async function lookup(port, message, currentRevision) {
  cancelActive();
  if (revision !== currentRevision) return;
  let task;
  try {
    const prefs = await storedSettings();
    if (revision !== currentRevision) return;
    const host = new URL(port.sender.url).hostname;
    if (!prefs.enabled || !prefs.consent || prefs.pausedSites.includes(host)) {
      send(port, { id: message.id, event: 'error', code: 'PAUSED_OR_CONSENT_REQUIRED' }); return;
    }
    const { apiKey } = await chrome.storage.session.get('apiKey');
    if (revision !== currentRevision) return;
    if (!DeepSeekAPI.key(apiKey)) { send(port, { id: message.id, event: 'error', code: 'API_KEY_REQUIRED' }); return; }
    task = { id: message.id, port, controller: new AbortController() };
    active = task;
    send(port, { id: task.id, event: 'connecting' });
    task.timer = setTimeout(() => {
      if (active !== task) return;
      active = null; task.controller.abort();
      send(port, { id: task.id, event: 'error', code: 'TIMEOUT' });
    }, 70000);
    // Do not await the network inside the queue: a later lookup can cancel it.
    void DeepSeekAPI.run({ term: message.term, context: prefs.contextEnabled ? message.context : '',
      language: prefs.language, mode: message.mode, detail: message.detail === true }, apiKey, task.controller.signal,
      event => {
        if (active !== task || revision !== currentRevision) return;
        send(port, { id: task.id, ...event });
        if (event.event === 'complete') { clearTimeout(task.timer); active = null; }
      }).catch(cause => {
      if (active !== task || revision !== currentRevision) return;
      clearTimeout(task.timer); active = null;
      send(port, { id: task.id, event: 'error', code: cause.code || 'API_NETWORK_ERROR' });
    });
  } catch {
    if (revision === currentRevision) send(port, { id: message.id, event: 'error', code: 'SETTINGS_UNAVAILABLE' });
    if (task && active === task) cancelActive();
  }
}
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'explained-reader' || !isReader(port.sender)) { port.disconnect(); return; }
  port.onMessage.addListener(message => {
    if (message.type === 'KEEPALIVE') return;
    if (message.type === 'CANCEL') {
      if (port.lookupRevision === revision && (!message.id || port.lookupId === message.id)) { ++revision; void serial(cancelActive); }
      return;
    }
    if (message.type !== 'LOOKUP' || typeof message.id !== 'string' || message.id.length > 80 || typeof message.term !== 'string' || !message.term.trim() || message.term.length > 500 || typeof message.context !== 'string' || message.context.length > 600 || !['explain', 'news'].includes(message.mode)) return;
    const currentRevision = ++revision;
    port.lookupRevision = currentRevision; port.lookupId = message.id;
    void serial(() => lookup(port, message, currentRevision));
  });
  port.onDisconnect.addListener(() => {
    if (port.lookupRevision === revision) { ++revision; void serial(cancelActive); }
  });
});
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return;
  const popup = isPage(sender, 'popup.html'), welcome = isPage(sender, 'welcome.html'), reader = isReader(sender);
  if (message.type === 'GET_SETTINGS' && (reader || popup || welcome)) {
    storedSettings().then(settings => reply({ settings }), () => reply({ error: 'SETTINGS_UNAVAILABLE' })); return true;
  }
  if (message.type === 'OPEN_CONNECTION' && (popup || reader)) {
    openSetup().then(() => reply({ ok: true }), () => reply({ ok: false })); return true;
  }
  if (message.type === 'CONNECTION_STATUS' && (popup || welcome)) {
    (async () => { await privateStorage; return { status: DeepSeekAPI.key((await chrome.storage.session.get('apiKey')).apiKey) ? 'configured' : 'missing' }; })()
      .then(reply, () => reply({ status: 'unavailable' })); return true;
  }
  if (message.type === 'CONFIGURE_API' && welcome) {
    if (configuring) { reply({ ok: false, code: 'API_CONFIG_BUSY' }); return; }
    configuring = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    (async () => {
      await privateStorage;
      const stored = await chrome.storage.local.get('settings');
      const session = await chrome.storage.session.get('apiKey');
      const apiKey = typeof message.apiKey === 'string' && message.apiKey.trim() ? DeepSeekAPI.key(message.apiKey) : DeepSeekAPI.key(session.apiKey);
      if (!apiKey) throw Object.assign(new Error(), { code: 'API_KEY_REQUIRED' });
      await DeepSeekAPI.validate(apiKey, controller.signal);
      const settings = { ...Explained.settings(stored.settings), enabled: true, consent: true, contextEnabled: message.contextEnabled !== false };
      await chrome.storage.local.set({ settings });
      await chrome.storage.session.set({ apiKey });
      reply({ ok: true });
    })().catch(cause => reply({ ok: false, code: controller.signal.aborted ? 'TIMEOUT' : cause.code || 'SETTINGS_UNAVAILABLE' }))
      .finally(() => { clearTimeout(timer); configuring = false; });
    return true;
  }
});
chrome.storage.onChanged.addListener((changes, area) => {
  const settingsChanged = area === 'local' && !!changes.settings;
  const keyChanged = area === 'session' && !!changes.apiKey;
  if (!settingsChanged && !keyChanged) return;
  if (active) {
    const prefs = Explained.settings(changes.settings?.newValue);
    const previous = Explained.settings(changes.settings?.oldValue);
    const host = new URL(active.port.sender.url).hostname;
    if (keyChanged || !prefs.enabled || !prefs.consent || prefs.pausedSites.includes(host) || prefs.language !== previous.language || prefs.contextEnabled !== previous.contextEnabled) { ++revision; void serial(cancelActive); }
  }
  void (async () => {
    const settings = await storedSettings();
    const tabs = await chrome.tabs.query({});
    await Promise.allSettled(tabs.filter(tab => /^https?:\/\//.test(tab.url || '')).map(tab => chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_CHANGED', settings, keyChanged })));
  })().catch(() => {});
});
