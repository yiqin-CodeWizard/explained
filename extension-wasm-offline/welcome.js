const $ = id => document.getElementById(id);
let saving = false;
let opening = false;
let configured = false;
const editing = new URL(location.href).searchParams.get('edit') === '1';
const siteURL = 'https://yiqin-codewizard.github.io/explained-site/';
function complete(focus = false) {
  $('setup').hidden = true; $('complete').hidden = false;
  if (focus) $('complete-title').focus();
}
async function init() {
  $('reload').hidden = true; $('feedback').textContent = '';
  try {
    const [stored, connection] = await Promise.all([
      chrome.storage.local.get('settings'),
      chrome.runtime.sendMessage({ type: 'CONNECTION_STATUS' })
    ]);
    if (!['configured', 'missing'].includes(connection?.status)) throw new Error('SETTINGS_UNAVAILABLE');
    const prefs = Explained.settings(stored.settings);
    configured = connection.status === 'configured';
    $('context').checked = prefs.contextEnabled;
    $('api-key').disabled = false;
    $('api-key').required = !configured;
    $('api-key').placeholder = configured ? 'Key saved for this session · leave empty to keep it' : 'Paste your DeepSeek API key';
    $('context').disabled = false; $('enable').disabled = false;
    if (prefs.consent && prefs.enabled && configured && !editing) complete();
  } catch {
    $('feedback').textContent = 'Setup could not be loaded. Try again, or open API settings from the toolbar later.';
    $('reload').hidden = false;
  }
}
function validateField() {
  const value = $('api-key').value.trim();
  const valid = value ? /^[\x21-\x7e]{8,512}$/.test(value) : configured;
  $('api-key').setAttribute('aria-invalid', String(!valid));
  $('key-error').textContent = valid ? '' : 'Enter a valid DeepSeek API key.';
  return valid;
}
$('api-key').onblur = validateField;
$('api-key').oninput = () => { $('api-key').removeAttribute('aria-invalid'); $('key-error').textContent = ''; };
$('enable').onclick = async () => {
  if (saving || !validateField()) { if (!saving) $('api-key').focus(); return; }
  saving = true;
  for (const id of ['enable', 'later', 'context', 'api-key']) $(id).disabled = true;
  $('enable').textContent = 'Verifying key…'; $('feedback').textContent = '';
  try {
    const result = await chrome.runtime.sendMessage({ type: 'CONFIGURE_API', apiKey: $('api-key').value.trim(), contextEnabled: $('context').checked });
    if (!result?.ok) {
      $('key-error').textContent = Explained.apiError(result?.code);
      $('api-key').setAttribute('aria-invalid', 'true');
      return;
    }
    configured = true; $('api-key').value = ''; complete(true);
  } catch { $('feedback').textContent = 'Setup could not be saved. Your input is still here; please try again.'; }
  finally {
    saving = false;
    for (const id of ['enable', 'later', 'context', 'api-key']) $(id).disabled = false;
    $('enable').textContent = 'Enable lookups';
  }
};
$('later').onclick = () => window.close();
$('done').onclick = async () => {
  if (opening) return;
  opening = true; $('done').disabled = true; $('feedback').textContent = '';
  try {
    const [stored, connection] = await Promise.all([
      chrome.storage.local.get('settings'),
      chrome.runtime.sendMessage({ type: 'CONNECTION_STATUS' })
    ]);
    const prefs = Explained.settings(stored.settings);
    if (!prefs.consent || !prefs.enabled || connection?.status !== 'configured') { configured = false; $('api-key').required = true; $('api-key').placeholder = 'Paste your DeepSeek API key'; $('setup').hidden = false; $('complete').hidden = true; $('api-key').focus(); return; }
    const languagePath = { en: '', 'zh-CN': 'zh-cn/', 'zh-TW': 'zh-tw/' }[prefs.language];
    const url = new URL(languagePath, siteURL);
    url.searchParams.set('entry', 'welcome'); url.hash = 'practice';
    await chrome.tabs.create({ url: url.href, active: true }); window.close();
  } catch { $('feedback').textContent = 'The practice article could not be opened. Check your connection and try Start exploring again.'; }
  finally { opening = false; $('done').disabled = false; }
};
$('reload').onclick = init;
void init();
