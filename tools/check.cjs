const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const extension = path.join(root, 'explained-extension');
const manifest = JSON.parse(fs.readFileSync(path.join(extension, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.equal(pkg.version, manifest.version, 'Package and manifest version must agree');
const resources = [manifest.background.service_worker, manifest.action.default_popup, ...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon), ...manifest.content_scripts.flatMap(script => script.js)];
for (const resource of resources) assert.ok(fs.existsSync(path.join(extension, resource)), `Missing manifest resource: ${resource}`);
const css = fs.readFileSync(path.join(extension, 'reader.css'), 'utf8');
const generated = fs.readFileSync(path.join(extension, 'reader-styles.js'), 'utf8');
const embeddedCSS = JSON.parse(generated.replace(/^globalThis\.ExplainedReaderCSS = /, '').trim().replace(/;$/, ''));
assert.equal(embeddedCSS, css, 'Run npm run package to regenerate reader-styles.js');
for (const folder of [extension, path.join(root, 'tests'), path.join(root, 'tools')]) {
  for (const file of fs.readdirSync(folder).filter(name => /\.(js|cjs)$/.test(name))) {
    const result = spawnSync(process.execPath, ['--check', path.join(folder, file)], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
}
for (const file of ['LICENSE', 'PRIVACY.md', 'THIRD_PARTY_NOTICES.md', 'docs/VALIDATION.md', 'docs/images/reading-note.png']) assert.ok(fs.existsSync(path.join(root, file)), `Missing repository file: ${file}`);
console.log('Resource, version, embedded stylesheet and JavaScript syntax checks passed.');
