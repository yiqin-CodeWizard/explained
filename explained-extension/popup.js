const $ = id => document.getElementById(id);
let prefs = Explained.defaults;
let hostname = null;
let writing = Promise.resolve();
function render() {
  $('enabled').textContent = prefs.enabled ? 'On' : 'Paused';
  $('enabled').setAttribute('aria-pressed', String(prefs.enabled));
  $('language').value = prefs.language;
  $('layout').value = prefs.layout;
  $('context').checked = prefs.contextEnabled;
  $('consent-panel').hidden = prefs.consent;
  $('site').disabled = !hostname;
  $('site').textContent = prefs.pausedSites.includes(hostname) ? 'Resume site' : 'Pause site';
}
function save(update) {
  writing = writing.catch(() => {}).then(async () => {
    const current = Explained.settings((await chrome.storage.local.get('settings')).settings);
    prefs = Explained.settings(typeof update === 'function' ? update(current) : { ...current, ...update });
    await chrome.storage.local.set({ settings: prefs }); render();
  }).catch(() => { $('feedback').textContent = 'Settings could not be saved. Reopen the extension panel and try again.'; });
  return writing;
}
async function connectionStatus() {
  try {
    const result = await chrome.runtime.sendMessage({ type: 'CONNECTION_STATUS' });
    $('connection-status').textContent = { connected: 'Session detected · checked on lookup', login: 'Sign in needed', closed: 'Opens on your next lookup', unavailable: 'Open DeepSeek to check connection' }[result?.status] || 'Connection unavailable';
    $('connection').textContent = result?.status === 'connected' ? 'Open DeepSeek ↗' : 'Open / sign in ↗';
  } catch { $('connection-status').textContent = 'Reload the extension to reconnect'; }
}
async function init() {
  prefs = Explained.settings((await chrome.storage.local.get('settings')).settings);
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = new URL(tab?.url);
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== 'https://chat.deepseek.com' && !['chromewebstore.google.com'].includes(url.hostname)) hostname = url.hostname;
  } catch { /* Protected browser pages do not expose a usable URL. */ }
  $('site-name').textContent = hostname || 'Open a normal webpage to pause a site.';
  render(); void connectionStatus();
}
$('enabled').onclick = () => save(current => ({ ...current, enabled: !current.enabled }));
$('consent').onclick = () => save({ consent: true });
$('language').onchange = event => { const language = event.target.value; void save({ language }); };
$('layout').onchange = event => { const layout = event.target.value; void save({ layout }); };
$('context').onchange = event => { const contextEnabled = event.target.checked; void save({ contextEnabled }); };
$('site').onclick = () => { if (hostname) void save(current => ({ ...current, pausedSites: current.pausedSites.includes(hostname) ? current.pausedSites.filter(x => x !== hostname) : [...current.pausedSites, hostname] })); };
$('connection').onclick = async () => {
  try { await chrome.runtime.sendMessage({ type: 'OPEN_CONNECTION' }); } catch { $('feedback').textContent = 'Could not open DeepSeek. Reload the extension and retry.'; }
};
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.settings) { prefs = Explained.settings(changes.settings.newValue); render(); } });
void init();
