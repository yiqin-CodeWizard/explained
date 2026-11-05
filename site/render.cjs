/* Shared, build-time page shell for the static product site. */
const fs = require('node:fs');
const nodePath = require('node:path');
const crypto = require('node:crypto');
const { icons, locales, articles } = require('./content.json');
const pages = require('./pages.json');
const pageCopy = require('./pages/copy.json');
const documents = require('./pages/documents.json');
const config = require('./config.json');
const sections = require('./sections.cjs');
const blog = require('./blog.cjs');
const languages = [
  { key: 'en', path: '', label: 'English', lang: 'en' },
  { key: 'zh-CN', path: 'zh-cn/', label: '简体中文', lang: 'zh-CN' },
  { key: 'zh-TW', path: 'zh-tw/', label: '繁體中文', lang: 'zh-TW' },
  { key: 'mixed', path: 'mixed/', label: 'English + 中文', lang: 'en' }
];
const escape = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const rich = value => escape(value).replace(/&lt;(\/?)(br|em|strong|code)&gt;/g, '<$1$2>');
const icon = name => icons[name];
const versions = {};
function assetVersion(file) {
  return versions[file] ||= crypto.createHash('sha256').update(fs.readFileSync(nodePath.join(__dirname, 'assets', file))).digest('hex').slice(0, 12);
}
function articleCopy(key, locale) {
  const article = articles[key];
  const copy = article[locale === 'zh-CN' ? 'cn' : locale === 'zh-TW' ? 'tw' : 'en'];
  return { ...copy, category: article.category, source: article.source, sourceName: article.sourceName,
    chineseTerms: locale === 'mixed' ? article.cn.terms : null, notes: locale === 'mixed' ? article.cn.notes : copy.notes };
}
function term(copy, index) {
  return escape(copy.terms[index]) + (copy.chineseTerms ? `<span lang="zh-CN">（${escape(copy.chineseTerms[index])}）</span>` : '');
}
function paragraph(value, copy) {
  return escape(value).replace(/\{([0-2])\}/g, (_, index) => `<mark>${term(copy, Number(index))}</mark>`);
}
function pagePath(language, key) { return language.path + pages[key].path; }
function pageVariants(key) { return languages.filter(language => pages[key].languages.includes(language.key)); }
function pageEntries() { return Object.keys(pages).flatMap(key => pageVariants(key).map(language => ({ key, language, path: pagePath(language, key) }))); }
function context(language, release, key, siteConfig) {
  const locale = language.key;
  const t = locales[locale];
  const ui = pageCopy[locale] || pageCopy.en;
  const base = new URL(siteConfig.url);
  const path = suffix => new URL(suffix, base).pathname;
  const url = (page, langKey = locale) => {
    const selected = languages.find(item => item.key === langKey && pages[page].languages.includes(langKey)) || languages[0];
    return path(pagePath(selected, page));
  };
  const asset = file => `${path(`assets/${file}`)}?v=${assetVersion(file)}`;
  const download = path(`downloads/${release.filename}`);
  const copy = articleCopy(siteConfig.defaultTopic, locale);
  const privacyLabel = `${escape(t.privacyLink)}${locale.startsWith('zh') ? ' (English)' : ''}`;
  const installBody = `<p class="install-intro">${escape(t.installIntro)}</p><p class="requirements">${escape(ui.requirements)}</p><ol class="install-steps">${[1, 2, 3, 4].map(n => `<li><span class="step-number" aria-hidden="true">0${n}</span><span>${rich(t[`install${n}`])}</span></li>`).join('')}</ol><p><a class="text-link" href="${url('apiKey')}">${escape(ui.apiKey)}${pages.apiKey.languages.includes(locale) ? '' : ' (English)'} ${icon('arrow')}</a></p><p class="install-privacy">${escape(t.installPrivacy)} <a href="${path('privacy.html')}">${privacyLabel}</a>.</p><div class="install-actions"><a class="button" href="${download}" download data-download>${icon('down')}${escape(t.installButton)}</a><span class="download-meta">v${escape(release.version)} · ${escape(t.downloadSize)} · ${release.size}</span></div><p class="install-checksum"><a href="${download}.sha256">${escape(t.checksum)}</a> · <a href="${siteConfig.repository}" target="_blank" rel="noopener">${escape(t.source)} ↗</a></p>`;
  return { language, release, key, locale, t, ui, copy, asset, path, url, download, installBody, escape, rich, icon, articleCopy, term, paragraph, articles, config: siteConfig };
}
function nextStep(ctx) {
  return `<section class="wrap next-step"><div><h2>${escape(ctx.ui.afterInstall)}</h2><p>${escape(ctx.ui.afterInstallBody)}</p></div><a class="button" href="${ctx.url('try')}">${escape(ctx.ui.allArticles)} ${icon('arrow')}</a></section>`;
}
function home(ctx) {
  const features = `<section class="capabilities wrap" aria-labelledby="capability-title"><h2 id="capability-title" class="sr-only">${escape(ctx.ui.capabilities)}</h2><div class="capability-grid">${ctx.ui.features.map(([title, description]) => `<div><h3>${escape(title)}</h3><p>${escape(description)}</p></div>`).join('')}</div></section>`;
  return sections.hero(ctx) + sections.practice(ctx) + sections.how(ctx) + features + sections.story(ctx) + `<section class="wrap next-step" id="install"><div><h2>${escape(ctx.t.installTitle)}</h2><p>${escape(ctx.t.experimental)}</p></div><a class="button" href="${ctx.url('download')}">${escape(ctx.ui.download)} ${icon('arrow')}</a></section>` + sections.privacy(ctx);
}
function documentPage(ctx) {
  const doc = documents[ctx.key][ctx.locale];
  const link = item => `<a href="${item.external || (item.href ? ctx.path(item.href) : ctx.url(item.page))}"${item.external ? ' target="_blank" rel="noopener"' : ''}>${escape(item.label)}</a>`;
  return `<header class="page-heading wrap"><p class="eyebrow">${escape(doc.eyebrow)}</p><h1>${escape(doc.title)}</h1><p class="page-lead">${escape(doc.lead)}</p></header><div class="document-layout wrap"><nav class="document-toc" aria-label="${escape(ctx.ui.toc)}"><p class="eyebrow">${escape(ctx.ui.toc)}</p><ol>${doc.sections.map(section => `<li><a href="#${section.id}">${escape(section.title)}</a></li>`).join('')}</ol></nav><article class="document-prose">${doc.sections.map(section => `<section id="${section.id}"><h2>${escape(section.title)}</h2>${section.paragraphs.map(p => `<p>${rich(p)}</p>`).join('')}${section.items.length ? `<ul>${section.items.map(p => `<li>${rich(p)}</li>`).join('')}</ul>` : ''}${section.image ? `<figure><a href="${ctx.asset(section.image)}" target="_blank" rel="noopener"><img src="${ctx.asset(section.image)}" width="1280" height="944" loading="lazy" alt="${escape(section.caption)}"></a><figcaption>${escape(section.caption)}</figcaption></figure>` : ''}${section.links.length ? `<ul class="related-links">${section.links.map(item => `<li>${link(item)}</li>`).join('')}</ul>` : ''}</section>`).join('')}</article></div>` + nextStep(ctx);
}
function guideIndex(ctx) {
  return `<header class="page-heading wrap"><p class="eyebrow">${escape(ctx.ui.guidesEyebrow)}</p><h1>${escape(ctx.ui.guidesHeading)}</h1><p class="page-lead">${escape(ctx.ui.descriptionGuides)}</p></header><section class="wrap reading-tiles guide-tiles" aria-label="${escape(ctx.ui.guides)}">${['apiKey', 'research', 'context'].map((key, index) => {
    const doc = documents[key][ctx.locale];
    return `<a class="reading-tile" href="${ctx.url(key)}"><span class="eyebrow">0${index + 1}</span><h2>${escape(doc.title)}</h2><p>${escape(doc.lead)}</p><span class="text-link">${escape(ctx.ui.startReading)} ${icon('arrow')}</span></a>`;
  }).join('')}</section>` + nextStep(ctx);
}
function body(ctx) {
  if (ctx.key === 'home') return home(ctx);
  if (ctx.key === 'blog') return blog.index(ctx);
  if (ctx.key === 'blogLaunch') return blog.launch(ctx);
  if (ctx.key === 'guides') return guideIndex(ctx);
  if (documents[ctx.key]) return documentPage(ctx);
  if (ctx.key === 'try') return sections.practice(ctx) + `<p class="wrap"><a class="text-link" href="${ctx.url('help')}">${escape(ctx.ui.help)} ${icon('arrow')}</a></p><section class="wrap next-step"><h2>${escape(ctx.ui.needSetup)}</h2><a class="button" href="${ctx.url('download')}">${escape(ctx.ui.download)} ${icon('arrow')}</a></section>`;
  return sections.install(ctx) + nextStep(ctx) + sections.privacy(ctx);
}
function renderPage(language, release, key = 'home', siteConfig = config) {
  if (!pages[key]?.languages.includes(language.key)) throw new Error(`Page ${key} is not available in ${language.key}`);
  const ctx = context(language, release, key, siteConfig);
  const { t, ui, url, asset, path, locale } = ctx;
  const suffix = key[0].toUpperCase() + key.slice(1);
  const title = ui[`title${suffix}`];
  const description = ui[`description${suffix}`];
  const canonical = new URL(pagePath(language, key), siteConfig.url).href;
  const variants = pageVariants(key);
  const indexed = locale !== 'mixed';
  const metadata = key === 'try' || key === 'guides' || documents[key] ? { '@context': 'https://schema.org', '@type': ['try', 'guides'].includes(key) ? 'CollectionPage' : 'WebPage', name: title, description, url: canonical, inLanguage: language.lang } : {
    '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'Explained', description: pageCopy.en.descriptionHome,
    applicationCategory: 'BrowserApplication', operatingSystem: 'Chrome 114+', softwareVersion: release.version, url: new URL('', siteConfig.url).href,
    downloadUrl: new URL(`downloads/${release.filename}`, siteConfig.url).href, inLanguage: ['en', 'zh-CN', 'zh-TW'], license: 'https://opensource.org/license/mit'
  };
  const isGuide = ['apiKey', 'research', 'context'].includes(key);
  const blogMetadata = {
    blog: { '@type': 'Blog' },
    blogLaunch: { '@type': 'BlogPosting', headline: ui.blogLaunch, datePublished: blog.published }
  }[key];
  const blogNav = locale === 'en' && ['home', 'blog', 'blogLaunch'].includes(key)
    ? `<a href="${url('blog')}"${key === 'blog' ? ' aria-current="page"' : ''}>${escape(ui.blog)}</a>`
    : '';
  const parent = isGuide ? 'guides' : key === 'blogLaunch' ? 'blog' : null;
  const crumbs = [{ name: ui.home, item: new URL(pagePath(language, 'home'), siteConfig.url).href }];
  if (parent) crumbs.push({ name: ui[parent], item: new URL(pagePath(language, parent), siteConfig.url).href });
  crumbs.push({ name: ui[key], item: canonical });
  const website = { '@context': 'https://schema.org', '@type': 'WebSite', '@id': new URL('#website', siteConfig.url).href,
    name: 'Explained', url: siteConfig.url, description: locales.en.officialSite, inLanguage: ['en', 'zh-CN', 'zh-TW'] };
  const structured = key === 'home' ? [website, metadata] : [blogMetadata ? { '@context': 'https://schema.org', ...blogMetadata, name: ui[key], description, url: canonical, inLanguage: language.lang } : metadata, { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbs.map((item, index) => ({ '@type': 'ListItem', position: index + 1, ...item })) }];
  const languageLinks = variants.map(item => `<li><a href="${url(key, item.key)}" lang="${item.lang}" hreflang="${item.lang}" data-language-link="${item.key}"${item.key === locale ? ' aria-current="page"' : ''}>${escape(item.label)}${item.key === locale ? icon('check') : ''}</a></li>`).join('');
  return `<!doctype html>
<html lang="${language.lang}" data-locale="${locale}" data-page="${key}" data-default-topic="${siteConfig.defaultTopic}">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="${escape(description)}"><meta name="theme-color" content="#fffdf4">
<title>${escape(title)}</title><link rel="canonical" href="${canonical}">
${indexed ? variants.filter(item => item.key !== 'mixed').map(item => `<link rel="alternate" hreflang="${item.lang}" href="${new URL(pagePath(item, key), siteConfig.url).href}">`).join('\n') + `<link rel="alternate" hreflang="x-default" href="${new URL(pages[key].path, siteConfig.url).href}">` : '<meta name="robots" content="noindex,follow">'}
<meta property="og:type" content="${key === 'blogLaunch' ? 'article' : 'website'}"><meta property="og:site_name" content="Explained"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${canonical}">
<meta property="og:image" content="${new URL('assets/share.png', siteConfig.url).href}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="Explained. Keep reading. Stay curious."><meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" sizes="32x32" href="${asset('favicon.png')}"><link rel="stylesheet" href="${asset('site.css')}"><script src="${asset('site.js')}" defer></script>
<script type="application/ld+json">${JSON.stringify(structured).replace(/</g, '\\u003c')}</script>
</head>
<body id="top"><a class="skip" href="#content">${escape(ui.skip)}</a>
<header class="topbar wrap"><a class="brand" href="${url('home')}" aria-label="Explained"><img class="brand-mark" src="${asset('brand-mark.png')}" width="35" height="35" alt="">explained</a><nav class="main-nav" aria-label="${escape(ui.navigation)}"><a href="${key === 'home' ? '#practice' : url('try')}"${key === 'try' ? ' aria-current="page"' : ''}>${escape(ui.try)}</a><a href="${url('guides')}"${key === 'guides' ? ' aria-current="page"' : ''}>${escape(ui.guides)}${pages.guides.languages.includes(locale) ? '' : ' (English)'}</a><a href="${url('help')}"${key === 'help' ? ' aria-current="page"' : ''}>${escape(ui.help)}</a>${blogNav}<a href="${siteConfig.repository}" target="_blank" rel="noopener" aria-label="${escape(t.source)}">GitHub ↗</a><a class="mobile-download" href="${url('download')}"${key === 'download' ? ' aria-current="page"' : ''}>${escape(ui.download)}</a></nav><div class="nav-tools"><details class="language-menu"><summary aria-label="${escape(t.readingLanguage)}">${icon('globe')}<span>${escape(language.label)}</span><span aria-hidden="true">⌄</span></summary><ul>${languageLinks}</ul></details><a class="button small" href="${url('download')}">${escape(t.download)}${icon('arrow')}</a></div></header>
<main id="content">${key !== 'home' ? `<nav class="breadcrumbs wrap" aria-label="${escape(ui.navigation)}"><a href="${url('home')}">${escape(ui.home)}</a><span aria-hidden="true">/</span>${parent ? `<a href="${url(parent)}">${escape(ui[parent])}</a><span aria-hidden="true">/</span>` : ''}<span aria-current="page">${escape(ui[key])}</span></nav>` : ''}${body(ctx)}</main>
<footer class="site-footer wrap"><div><a class="footer-title" href="${url('home')}">explained.</a><p>${escape(t.footer)}</p><p class="site-identity">${escape(t.officialSite)}</p><p class="independent">${escape(t.independent)}</p></div><nav class="footer-links" aria-label="${escape(ui.navigation)}"><a href="${url('download')}">${escape(ui.download)}</a><a href="${key === 'home' ? '#practice' : url('try')}">${escape(ui.try)}</a><a href="${url('guides')}">${escape(ui.guides)}${pages.guides.languages.includes(locale) ? '' : ' (English)'}</a><a href="${url('help')}">${escape(ui.help)}</a><a href="${url('apiKey')}">${escape(ui.apiKey)}${pages.apiKey.languages.includes(locale) ? '' : ' (English)'}</a><a href="${url('changelog')}">${escape(ui.changelog)}${pages.changelog.languages.includes(locale) ? '' : ' (English)'}</a><a href="${path('privacy.html')}">${escape(t.privacy)}${locale.startsWith('zh') ? ' (English)' : ''}</a><a href="${siteConfig.repository}" target="_blank" rel="noopener">${escape(t.source)} ↗</a></nav></footer>
</body></html>\n`;
}
module.exports = { renderPage, languages, escape, pages, pagePath, pageEntries };
