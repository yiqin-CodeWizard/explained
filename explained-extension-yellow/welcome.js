const $ = id => document.getElementById(id);
let saving = false;
let opening = false;
const siteURL = 'https://yiqin-codewizard.github.io/explained-site/';
function complete(focus = false) {
  $('setup').hidden = true;
  $('complete').hidden = false;
  if (focus) $('complete-title').focus();
}
async function init() {
  $('reload').hidden = true;
  $('feedback').textContent = '';
  try {
    const prefs = Explained.settings((await chrome.storage.local.get('settings')).settings);
    $('context').checked = prefs.contextEnabled;
    $('context').disabled = false;
    $('enable').disabled = false;
    if (prefs.consent && prefs.enabled) complete();
  } catch {
    $('feedback').textContent = 'Setup could not be loaded. Try again, or enable lookups from the Explained toolbar panel later.';
    $('reload').hidden = false;
  }
}
$('enable').onclick = async () => {
  if (saving) return;
  saving = true;
  const contextEnabled = $('context').checked;
  $('enable').disabled = true;
  $('later').disabled = true;
  $('context').disabled = true;
  $('enable').textContent = 'Enabling…';
  $('feedback').textContent = '';
  try {
    const latest = Explained.settings((await chrome.storage.local.get('settings')).settings);
    await chrome.storage.local.set({ settings: { ...latest, consent: true, enabled: true, contextEnabled } });
    complete(true);
  } catch {
    $('feedback').textContent = 'Lookups could not be enabled. Your setup is still here; please try again.';
  } finally {
    saving = false;
    $('enable').disabled = false;
    $('later').disabled = false;
    $('context').disabled = false;
    $('enable').textContent = 'Enable lookups';
  }
};
$('later').onclick = () => window.close();
$('done').onclick = async () => {
  if (opening) return;
  opening = true;
  $('done').disabled = true;
  $('feedback').textContent = '';
  try {
    const prefs = Explained.settings((await chrome.storage.local.get('settings')).settings);
    if (!prefs.consent || !prefs.enabled) {
      $('setup').hidden = false;
      $('complete').hidden = true;
      $('enable').focus();
      return;
    }
    const languagePath = { en: '', 'zh-CN': 'zh-cn/', 'zh-TW': 'zh-tw/' }[prefs.language];
    const url = new URL(languagePath, siteURL);
    url.searchParams.set('entry', 'welcome');
    url.hash = 'practice';
    await chrome.tabs.create({ url: url.href, active: true });
    window.close();
  } catch {
    $('feedback').textContent = 'The practice article could not be opened. Check your connection and try Start exploring again.';
  } finally {
    opening = false;
    $('done').disabled = false;
  }
};
$('reload').onclick = init;
void init();
