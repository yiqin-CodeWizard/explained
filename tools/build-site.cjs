/* Build the complete static Pages artifact, including a matching extension download. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { renderPage, pageEntries, escape } = require('../site/render.cjs');
const config = require('../site/config.json');
const root = path.resolve(__dirname, '..');
require('./sync-privacy.cjs');
const output = path.join(root, '_site');
const baseURL = new URL(config.url);
if (baseURL.protocol !== 'https:' || baseURL.search || baseURL.hash || !baseURL.pathname.endsWith('/')) throw new Error('site/config.json needs an HTTPS site URL ending in /.');
if (config.customDomain && (baseURL.hostname !== config.customDomain || baseURL.pathname !== '/')) throw new Error('A custom domain must match the configured host and use its root as the site base URL.');
for (const resource of ['site.css', 'site.js', 'favicon.svg', 'favicon.png', 'brand-mark.png', 'share.png']) {
  if (!fs.existsSync(path.join(root, 'site/assets', resource))) throw new Error(`Missing website resource: ${resource}`);
}
if (config.downloadEdition !== 'extension-wasm-offline') throw new Error('The public download must use the API edition.');
const packaged = spawnSync(process.env.PYTHON || 'python3', ['tools/package-wasm-offline.py'], { cwd: root, encoding: 'utf8' });
if (packaged.status !== 0) throw new Error(packaged.stderr || 'Extension packaging failed.');
const manifest = JSON.parse(fs.readFileSync(path.join(root, config.downloadEdition, 'manifest.json'), 'utf8'));
const filename = `${config.downloadEdition}-v${manifest.version}.zip`;
const zip = path.join(root, filename);
if (crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex') !== config.downloadSha256) throw new Error('Download differs from the approved release checksum. Publish changed extension files under a new version and checksum.');
const release = { version: manifest.version, filename, size: `${Math.round(fs.statSync(zip).size / 1024)} KB` };
// Only this generated output directory is replaced. Source and prototypes are never published.
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(path.join(output, 'downloads'), { recursive: true });
fs.cpSync(path.join(root, 'site/assets'), path.join(output, 'assets'), { recursive: true });
fs.copyFileSync(path.join(root, 'site/PUBLIC-README.md'), path.join(output, 'README.md'));
if (config.customDomain) fs.writeFileSync(path.join(output, 'CNAME'), config.customDomain + '\n');
for (const file of [filename, `${filename}.sha256`]) fs.copyFileSync(path.join(root, file), path.join(output, 'downloads', file));
// Public distribution policies travel with the independently published website.
for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'SECURITY.md']) fs.copyFileSync(path.join(root, file), path.join(output, file));
for (const entry of pageEntries()) {
  const directory = path.join(output, entry.path);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'index.html'), renderPage(entry.language, release, entry.key));
}
const privacy = fs.readFileSync(path.join(root, 'PRIVACY.md'), 'utf8');
fs.writeFileSync(path.join(output, 'PRIVACY.md'), privacy);
function inlinePolicy(value) {
  return escape(value).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+|SECURITY\.md)\)/g, (_, label, url) => `<a href="${url === 'SECURITY.md' ? `${config.repository}/blob/main/SECURITY.md` : url}">${label}</a>`);
}
// The policy uses headings, paragraphs, one table and bullet lists. Keep its
// authoritative wording while rendering those constructs as accessible HTML.
function renderPolicy(markdown) {
  return markdown.trim().split(/\n\s*\n/).filter(block => !block.startsWith('# ')).map(block => {
    if (block.startsWith('## ')) return `<h2>${inlinePolicy(block.slice(3))}</h2>`;
    if (block.startsWith('|')) {
      const rows = block.split('\n').map(row => row.split('|').slice(1, -1).map(cell => cell.trim()));
      return `<div class="policy-table"><table><thead><tr>${rows[0].map(cell => `<th scope="col">${inlinePolicy(cell)}</th>`).join('')}</tr></thead><tbody>${rows.slice(2).map(row => `<tr>${row.map(cell => `<td>${inlinePolicy(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    }
    if (block.startsWith('- ')) return `<ul>${block.split('\n').map(item => `<li>${inlinePolicy(item.replace(/^- /, ''))}</li>`).join('')}</ul>`;
    return `<p>${inlinePolicy(block)}</p>`;
  }).join('\n');
}
// Preserve the full authoritative policy instead of creating a second, abbreviated policy.
fs.writeFileSync(path.join(output, 'privacy.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Privacy and permissions for Explained, Explained Yellow, extension-wasm-offline and the public website."><title>Privacy and permissions — Explained</title><link rel="canonical" href="${new URL('privacy.html', config.url).href}"><link rel="stylesheet" href="assets/site.css?v=privacy-ui-20261022"><link rel="icon" type="image/png" sizes="32x32" href="assets/favicon.png?v=privacy-ui-20261022"></head><body><main class="policy wrap"><a class="text-link" href="./">← Back to Explained</a><h1>Your reading, with your permission.</h1><p>Explained · Explained Yellow · extension-wasm-offline</p>${renderPolicy(privacy)}</main></body></html>\n`);
fs.writeFileSync(path.join(output, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${new URL('sitemap.xml', config.url).href}\n`);
fs.writeFileSync(path.join(output, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...pageEntries().filter(item => item.language.key !== 'mixed').map(item => item.path), 'privacy.html'].map(item => `<url><loc>${escape(new URL(item, config.url).href)}</loc></url>`).join('')}</urlset>\n`);
fs.writeFileSync(path.join(output, '404.html'), '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page not found — Explained</title><body><h1>A small detour.</h1><p>This page could not be found.</p><a href="' + config.url + '">Back to Explained</a></body></html>\n');
fs.writeFileSync(path.join(output, '.nojekyll'), '');
console.log(packaged.stdout.trim());
console.log(`Built ${pageEntries().length} localized pages, privacy, crawler metadata and a verified release download in _site/.`);
