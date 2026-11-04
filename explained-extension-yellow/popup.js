const $ = id => document.getElementById(id);
let prefs = Explained.defaults;
let hostname = null;
let writing = Promise.resolve();
let loaded = false;
function render() {
  $('enabled').hidden = !prefs.consent;
  $('enabled').textContent = prefs.enabled ? 'On' : 'Paused';
  $('enabled').setAttribute('aria-pressed', String(prefs.enabled));
  $('language').value = prefs.language;
  $('layout').value = prefs.layout;
  $('context').checked = prefs.contextEnabled;
  $('consent-panel').hidden = prefs.consent;
  for (const id of ['consent', 'language', 'layout', 'context', 'enabled']) $(id).disabled = !loaded;
  $('site').disabled = !loaded || !hostname;
  $('site').textContent = prefs.pausedSites.includes(hostname) ? 'Resume site' : 'Pause site';
}
function save(update) {
  writing = writing.catch(() => {}).then(async () => {
    const current = Explained.settings((await chrome.storage.local.get('settings')).settings);
    const next = Explained.settings(typeof update === 'function' ? update(current) : { ...current, ...update });
    await chrome.storage.local.set({ settings: next }); prefs = next; render(); return true;
  }).catch(() => { render(); $('feedback').textContent = 'Settings could not be saved. Reopen the extension panel and try again.'; return false; });
  return writing;
}
async function connectionStatus() {
  try {
    const result = await chrome.runtime.sendMessage({ type: 'CONNECTION_STATUS' });
    $('connection-status').textContent = { connected: 'Website connection ready', closed: 'Opens on your next lookup', unavailable: 'Open DeepSeek to check connection' }[result?.status] || 'Connection unavailable';
    $('connection').textContent = 'Open DeepSeek ↗';
  } catch { $('connection-status').textContent = 'Reload the extension to reconnect'; }
}
async function init() {
  loaded = false;
  hostname = null;
  $('reload').hidden = true;
  $('feedback').textContent = '';
  render();
  try {
    prefs = Explained.settings((await chrome.storage.local.get('settings')).settings);
    loaded = true;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = new URL(tab?.url);
      if (['http:', 'https:'].includes(url.protocol) && url.origin !== 'https://chat.deepseek.com' && !['chromewebstore.google.com'].includes(url.hostname)) hostname = url.hostname;
    } catch { /* Protected browser pages do not expose a usable URL. */ }
    $('site-name').textContent = hostname || 'Open a normal webpage to pause a site.';
    render(); void connectionStatus();
  } catch {
    $('feedback').textContent = 'Settings could not be loaded. Try again or reopen the extension panel.';
    $('connection-status').textContent = 'Settings unavailable';
    $('reload').hidden = false;
    render();
  }
}
$('enabled').onclick = () => save(current => ({ ...current, enabled: !current.enabled }));
$('consent').onclick = async () => { if (await save({ consent: true, enabled: true })) { $('feedback').textContent = 'You’re all set. Highlight a phrase for an automatic explanation, or switch to News for recent developments.'; $('enabled').focus(); } };
$('language').onchange = event => { const language = event.target.value; void save({ language }); };
$('layout').onchange = event => { const layout = event.target.value; void save({ layout }); };
$('context').onchange = event => { const contextEnabled = event.target.checked; void save({ contextEnabled }); };
$('site').onclick = () => { if (hostname) void save(current => ({ ...current, pausedSites: current.pausedSites.includes(hostname) ? current.pausedSites.filter(x => x !== hostname) : [...current.pausedSites, hostname] })); };
async function openConnection() {
  $('connection').disabled = true;
  $('feedback').textContent = 'Opening DeepSeek…';
  try {
    const result = await chrome.runtime.sendMessage({ type: 'OPEN_CONNECTION' });
    if (!result?.ok) throw new Error('OPEN_FAILED');
    $('feedback').textContent = 'DeepSeek opened. Return to your reading and choose Retry for an interrupted lookup, or highlight a new phrase.';
  } catch { $('feedback').textContent = 'Could not open DeepSeek. Try again, or reload the extension and refresh your reading page.'; }
  finally { $('connection').disabled = false; }
}
$('connection').onclick = openConnection;
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.settings) { prefs = Explained.settings(changes.settings.newValue); render(); } });
$('reload').onclick = init;
void init();
