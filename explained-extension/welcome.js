const $ = id => document.getElementById(id);
let saving = false;
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
$('done').onclick = () => window.close();
$('reload').onclick = init;
void init();
