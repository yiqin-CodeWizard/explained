/* Static pages remain readable without JavaScript. The home and reading-room views share article state. */
(() => {
  'use strict';
  const root = document.documentElement;
  const aliases = { energy: 'drug-development', pricing: 'scientific-understanding', choices: 'deepseek-v4' };
  const topicKeys = ['drug-development', 'scientific-understanding', 'deepseek-v4'];
  const resolveTopic = key => Object.hasOwn(aliases, key) ? aliases[key] : key;
  const known = key => topicKeys.includes(key);
  function state() {
    const query = new URLSearchParams(location.search);
    const hash = resolveTopic(location.hash.replace('#article-', ''));
    const topic = resolveTopic(query.get('topic'));
    return { topic: known(hash) ? hash : known(topic) ? topic : root.dataset.defaultTopic, explicit: known(hash) || known(topic), welcome: query.get('entry') === 'welcome' };
  }
  const topics = [...document.querySelectorAll('[data-topic]')];
  const articles = [...document.querySelectorAll('[data-article]')];
  function showArticle(focus = false) {
    if (!articles.length) return;
    const selected = state();
    articles.forEach(article => { article.hidden = article.dataset.article !== selected.topic; });
    topics.forEach(link => {
      if (link.dataset.topic === selected.topic) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
    document.querySelectorAll('[data-language-link]').forEach(link => {
      link.dataset.baseHref ||= link.getAttribute('href');
      const target = new URL(link.dataset.baseHref, location.href);
      if (root.dataset.page !== 'home' || selected.explicit || selected.welcome) {
        target.searchParams.set('topic', selected.topic);
        if (selected.welcome) target.searchParams.set('entry', 'welcome');
        target.hash = selected.welcome ? 'practice' : `article-${selected.topic}`;
      } else if (location.hash === '#practice') target.hash = 'practice';
      link.href = target.href;
    });
    const banner = document.querySelector('[data-welcome]');
    if (banner) banner.hidden = !selected.welcome;
    if (focus) document.getElementById(`title-${selected.topic}`)?.focus({ preventScroll: true });
  }
  showArticle();
  if (articles.length && state().welcome) requestAnimationFrame(() => {
    document.getElementById('welcome-title')?.focus({ preventScroll: true });
    document.getElementById('practice')?.scrollIntoView({ behavior: 'instant' });
  });
  if (articles.length && state().explicit && location.hash.startsWith('#article-') && !document.getElementById(location.hash.slice(1))) {
    requestAnimationFrame(() => document.getElementById(`article-${state().topic}`)?.scrollIntoView({ behavior: 'instant' }));
  }
  topics.forEach(link => link.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const target = new URL(location.href);
    target.searchParams.set('topic', link.dataset.topic);
    target.hash = `article-${link.dataset.topic}`;
    if (target.href !== location.href) history.pushState(null, '', target);
    showArticle(true);
  }));
  window.addEventListener('popstate', () => showArticle());
  window.addEventListener('hashchange', () => showArticle());
  const menu = document.querySelector('.language-menu');
  if (menu) {
    document.addEventListener('click', event => { if (!menu.contains(event.target)) menu.open = false; });
    menu.addEventListener('keydown', event => {
      if (event.key === 'Escape') { menu.open = false; menu.querySelector('summary').focus(); }
    });
  }
})();
