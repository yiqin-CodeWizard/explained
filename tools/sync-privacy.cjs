/* Shared website policy for legacy website editions. The API edition owns its policy. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const policy = fs.readFileSync(path.join(root, 'site/privacy-policy.md'), 'utf8');
for (const name of ['PRIVACY.md', 'explained-extension-yellow/PRIVACY.md']) {
  if (fs.readFileSync(path.join(root, name), 'utf8') !== policy) fs.writeFileSync(path.join(root, name), policy);
}
console.log('Synchronized privacy policy for legacy website editions; API policy preserved.');
