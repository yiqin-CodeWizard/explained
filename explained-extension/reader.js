(() => {
  if (window !== window.top || document.contentType !== 'text/html' || document.designMode === 'on') return;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let prefs = Explained.defaults;
  let host, shadow, port, heartbeat, debounce, rangeForPosition;
  let lastFocus = null;
  let pointerStart = null;
  const state = { open: false, id: null, term: '', context: '', capturedContext: '', mode: 'explain', detail: false, contextOpen: false, phase: '', text: '', sources: [], code: '', cache: new Map() };
  const text = (en, zh, tw = zh) => prefs.language === 'en' ? en : prefs.language === 'zh-TW' ? tw : zh;
  const allowed = () => prefs.enabled && !prefs.pausedSites.includes(location.hostname);
  const editable = node => {
    const el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    return !el || el.isContentEditable || !!el.closest('input,textarea,select,[role="textbox"],script,style,noscript,[hidden],[inert]');
  };
  function readable(node) {
    const el = node.parentElement;
    return !editable(node) && el?.getClientRects().length > 0 && getComputedStyle(el).visibility === 'visible' && !el.closest('[aria-hidden="true"]');
  }
  function siblingText(element) {
    if (!element || editable(element)) return '';
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, { acceptNode: node => readable(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
    let result = '', node, count = 0;
    while ((node = walker.nextNode()) && count++ < 300 && result.length < 2400) result += node.textContent;
    return result;
  }
  function mount() {
    if (host?.isConnected) return;
    host = document.createElement('explained-reader');
    host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;pointer-events:none!important;z-index:2147483647!important;color-scheme:light!important';
    shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = globalThis.ExplainedReaderCSS;
    shadow.append(style, Object.assign(document.createElement('div'), { id: 'root' }));
    shadow.addEventListener('click', onAction);
    shadow.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.stopPropagation(); close(true); }
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) && event.target.matches('[role="tab"]')) {
        event.preventDefault(); state.mode = event.target.dataset.mode === 'explain' ? 'news' : 'explain';
        void lookup(); render(); shadow.querySelector(`[data-mode="${state.mode}"]`)?.focus();
      }
    });
    document.documentElement.append(host);
  }
  function stop() {
    clearInterval(heartbeat);
    if (port && state.id) { try { port.postMessage({ type: 'CANCEL', id: state.id }); } catch {} }
    state.id = null;
  }
  function close(restoreFocus = false) {
    clearTimeout(debounce); stop(); state.open = false; state.cache.clear(); render();
    if (restoreFocus && lastFocus?.isConnected) lastFocus.focus({ preventScroll: true });
  }
  function connect() {
    if (port) return;
    port = chrome.runtime.connect({ name: 'explained-reader' });
    const connected = port;
    port.onMessage.addListener(message => {
      if (!state.open || !state.id || message.id !== state.id) return;
      if (message.event === 'cancelled') { state.phase = 'cancelled'; state.id = null; clearInterval(heartbeat); }
      if (message.event === 'connecting') state.phase = 'connecting';
      if (message.event === 'stage') state.phase = 'loading';
      if (['streaming', 'complete'].includes(message.event)) {
        state.text = message.text || ''; state.sources = message.sources || []; state.phase = message.event === 'complete' ? 'ready' : 'streaming';
        if (message.event === 'complete') {
          state.cache.set(cacheKey(), { text: state.text, sources: state.sources });
          state.id = null; clearInterval(heartbeat);
        }
      }
      if (message.event === 'error') { state.phase = 'error'; state.code = message.code; state.id = null; clearInterval(heartbeat); }
      render();
    });
    port.onDisconnect.addListener(() => {
      if (port !== connected) return;
      port = null; clearInterval(heartbeat);
      if (state.id && state.open) { state.id = null; state.phase = 'error'; state.code = 'EXTENSION_RELOADED'; render(); }
    });
  }
  function cacheKey() { return `${state.mode}/${state.detail}/${prefs.language}/${prefs.contextEnabled}`; }
  async function lookup(force = false) {
    stop();
    if (!state.open || !allowed()) return;
    if (!prefs.consent) { state.phase = 'consent'; render(); return; }
    state.context = prefs.contextEnabled ? state.capturedContext : '';
    const cached = !force && state.cache.get(cacheKey());
    if (cached) { Object.assign(state, cached, { phase: 'ready' }); render(); return; }
    state.id = crypto.randomUUID(); state.phase = 'connecting'; state.text = ''; state.sources = []; state.code = '';
    try {
      connect();
      port.postMessage({ type: 'LOOKUP', id: state.id, term: state.term, context: state.context, mode: state.mode, detail: state.detail });
      heartbeat = setInterval(() => { try { port?.postMessage({ type: 'KEEPALIVE' }); } catch {} }, 15000);
    } catch { state.phase = 'error'; state.code = 'EXTENSION_RELOADED'; state.id = null; }
    render();
  }
  function captureContext(range) {
    let block = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
    block = block.closest('p,li,blockquote,section,article,main,div,td,h1,h2,h3,h4') || block;
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, { acceptNode: node => readable(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
    let all = '', start = -1, end = -1, node, count = 0;
    while ((node = walker.nextNode()) && count++ < 3000) {
      const base = all.length;
      if (node === range.startContainer) start = base + range.startOffset;
      else if (start < 0 && range.comparePoint(node, 0) === 0) start = base;
      all += node.textContent;
      if (node === range.endContainer) end = base + range.endOffset;
      else if (start >= 0 && range.comparePoint(node, node.length) === 0) end = all.length;
      if (end >= 0 && all.length > end + 1200) break;
      if (start < 0 && all.length > 4000) all = all.slice(-1200);
    }
    if (start < 0 || end < start) return range.toString().slice(0, 600);
    // Include neighboring paragraphs when the containing block is short.
    const previous = block.previousElementSibling;
    const next = block.nextElementSibling;
    if (previous && !editable(previous) && !previous.querySelector('input,textarea,[contenteditable],script,style')) {
      const prefix = siblingText(previous).slice(-600) + ' ';
      all = prefix + all; start += prefix.length; end += prefix.length;
    }
    if (next && !editable(next) && !next.querySelector('input,textarea,[contenteditable],script,style')) all += ' ' + siblingText(next).slice(0, 600);
    return Explained.contextWindow(all, start, end);
  }
  function selection() {
    if (!allowed() || document.designMode === 'on') return;
    const selected = window.getSelection();
    if (!selected?.rangeCount || selected.isCollapsed || editable(selected.anchorNode) || editable(selected.focusNode) || host?.contains(selected.anchorNode)) return;
    const range = selected.getRangeAt(0);
    // Exclude selections that cross an editor or form, as well as endpoints in it.
    if (range.cloneContents().querySelector('input,textarea,select,[contenteditable],[role="textbox"]')) return;
    const term = selected.toString().trim();
    if (!term || term.length > 500) return;
    const context = captureContext(range);
    if (state.open && state.term === term && state.capturedContext === context) return;
    stop(); state.cache.clear();
    lastFocus = document.activeElement;
    rangeForPosition = range.cloneRange();
    Object.assign(state, { open: true, term, capturedContext: context, context: prefs.contextEnabled ? context : '', mode: 'explain', detail: false, contextOpen: false });
    void lookup();
  }
  function sourceLinks(sources) {
    return sources.flatMap(s => {
      const url = Explained.safeURL(s?.url);
      return url ? [`<a class="source-chip" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(new URL(url).hostname.replace(/^www\./, ''))}</a>`] : [];
    }).join('');
  }
  function answer() {
    if (state.phase === 'consent') return `<div class="empty-state"><h3>${text('A little context, a clearer answer','一点语境，理解更清楚','一點語境，理解更清楚')}</h3><p>${text('Explained sends your selected text and, when enabled, up to 600 characters of nearby context to your signed-in DeepSeek website. DeepSeek may keep these chats. Input fields and editors are excluded.','Explained 会将所选文字及启用时最多 600 字符的附近上下文发送到已登录的 DeepSeek 网页。DeepSeek 可能保留这些对话。输入框和编辑器不在支持范围内。')}</p><button data-action="consent">${text('Enable and explain','启用并解释','啟用並解釋')}</button><p>${text('Context sharing can be turned off in the toolbar panel.','可在工具栏面板中关闭上下文分享。')}</p></div>`;
    const waiting = ['connecting', 'loading', 'streaming'].includes(state.phase);
    const loading = waiting ? `<p class="loading-label" role="status"><i></i>${state.phase === 'connecting' ? text('Connecting to DeepSeek…','正在连接 DeepSeek…') : state.mode === 'news' ? text('Searching recent coverage…','正在搜索近期报道…') : text('Finding the meaning in context…','正在结合语境解释…')}</p>` : '';
    let body = '';
    if (state.mode === 'news' && state.phase === 'ready') {
      const result = Explained.newsResult(state.text, state.sources);
      body = `<p class="news-intro">${text('Past 30 days · AI summaries · check original sources','近 30 天 · AI 摘要 · 请核对原始来源')}</p>`;
      if (result.raw) body += `<p class="answer-copy">${esc(result.raw)}</p><p class="notice">${esc(result.note)}</p>${sourceLinks(result.sources)}`;
      else if (result.stories.length) {
        body += result.stories.map(s => `<article class="news-story"><time datetime="${s.date}">${s.date}</time><p>${esc(s.summary)}</p>${sourceLinks(s.sources)}${!s.sources.length ? `<p class="notice">${text('No matching source was decoded for this story. Treat this summary as unverified.','未解码到与此条新闻匹配的来源，请将此摘要视为未核实。')}</p>` : ''}</article>`).join('');
        const used = new Set(result.stories.flatMap(s => s.sources.map(x => x.url)));
        const extra = result.sources.filter(s => !used.has(s.url));
        if (extra.length) body += `<details><summary>${text('Other search sources · not matched to a story','其他搜索来源 · 尚未匹配到具体新闻')}</summary>${sourceLinks(extra)}</details>`;
        if (result.note) body += `<p class="notice">${esc(result.note)}</p>`;
      } else body += `<div class="empty-state"><h3>${result.rejected ? text('No dated stories in this window','没有符合日期范围的新闻') : text('No recent coverage returned','未返回近期报道')}</h3><p>${esc(result.note || text('DeepSeek returned no relevant stories for the past 30 days.','DeepSeek 未返回近 30 天的相关新闻。'))}</p></div>`;
      if (!result.sources.length && (result.raw || result.stories.length)) body += `<p class="notice">${text('No structured source URLs were decoded.','未解码到结构化来源链接。')}</p>`;
    } else if (state.text && state.mode === 'explain') body = `<p class="answer-copy">${esc(state.text)}</p>`;
    // News JSON is kept out of the reading card until it can be parsed completely.
    if (!state.text && waiting) body = '<div class="skeleton" aria-hidden="true"><i></i><i></i><i></i></div>';
    if (state.phase === 'error' || state.phase === 'cancelled') {
      const message = state.code === 'LOGIN_REQUIRED' ? text('Sign in to the dedicated DeepSeek tab, then retry.','请先在专用 DeepSeek 标签页登录，再重试。') : state.code === 'EXTENSION_RELOADED' ? text('Refresh this webpage after reloading the extension.','扩展重载后，请刷新当前网页。') : state.phase === 'cancelled' ? text('This lookup was stopped. You can retry when ready.','本次查询已停止，可随时重试。') : text('The website connection was interrupted or rejected. Open DeepSeek to check login or verification, then retry.','网页连接中断或请求被拒绝。请打开 DeepSeek 检查登录或验证，再重试。');
      body += `<div class="empty-state" role="status"><h3>${text('Needs a moment','需要处理一下')}</h3><p>${message}</p>${state.code ? `<p class="notice">${esc(state.code)}</p>` : ''}<button data-action="connection">${text('Open DeepSeek','打开 DeepSeek')}</button> <button data-action="retry">${text('Retry','重试')}</button></div>`;
    }
    if (state.mode === 'explain' && state.phase === 'ready') body += `<button class="more-btn" data-action="more">${state.detail ? text('Keep it short','简短显示') : text('Explain a little more','再解释一点')}</button>`;
    return loading + body;
  }
  function tabs() {
    return `<div class="answer-tabs" role="tablist" aria-label="Answer type">${['explain', 'news'].map(mode => `<button role="tab" tabindex="${state.mode === mode ? '0' : '-1'}" aria-selected="${state.mode === mode}" data-mode="${mode}" class="${state.mode === mode ? 'active' : ''}">${mode === 'explain' ? text('Explain','解释','解釋') : text('News','新闻','新聞')} ${mode === 'news' ? '↗' : ''}</button>`).join('')}</div>`;
  }
  function contextBlock() {
    return `<button class="context-toggle" data-action="context" aria-expanded="${state.contextOpen}">${state.contextOpen ? '−' : '+'} ${text('Context used','使用的上下文')}</button>${state.contextOpen ? `<div class="context-block">${esc(prefs.contextEnabled ? state.context : text('Context sharing is off. Only the selected text is sent.','上下文分享已关闭，仅发送所选文字。'))}</div>` : ''}`;
  }
  function render() {
    if (!host && !state.open) return;
    mount();
    const root = shadow.getElementById('root');
    const focused = shadow.activeElement?.dataset;
    const focusKey = focused?.action ? `[data-action="${focused.action}"]` : focused?.mode ? `[data-mode="${focused.mode}"]` : null;
    const scroller = shadow.querySelector('.card-main,.split-answer,.variant-c');
    const scrollTop = scroller?.scrollTop || 0;
    if (!state.open || !allowed()) { root.replaceChildren(); return; }
    const closeButton = `<button class="icon-btn" data-action="close" aria-label="${text('Close answer','关闭回答')}">×</button>`;
    const title = `<h2>${esc(state.term)}</h2><div class="meaning">${text('Selected phrase · in context','所选短语 · 结合语境')}</div>`;
    const footer = `<div class="card-footer"><span>DeepSeek · ${text('AI response','AI 回答')}</span><span>${esc(Explained.languages[prefs.language])} · ${text('General','通用')}</span></div>`;
    const content = answer();
    let html;
    if (prefs.layout === 'B') html = `<section class="assistant variant-b" role="region" aria-label="Explained"><div class="split-context"><span class="identity">e. &nbsp; EXPLAINED</span>${title}<span class="context-label">${text('IN THIS CONTEXT','在此语境中')}</span><div class="context-block">${esc(prefs.contextEnabled ? state.context : text('Context sharing off','上下文分享已关闭'))}</div><span class="small-tag">${text('A little more understanding','多理解一点')}</span></div><div class="split-answer"><div class="split-top"><span>EXPLAINED</span>${closeButton}</div>${tabs()}${content}${footer}</div></section>`;
    else if (prefs.layout === 'C') html = `<section class="assistant variant-c" role="region" aria-label="Explained reading margin"><div class="margin-top"><span>e. &nbsp; READING COMPANION</span>${closeButton}</div>${title}${['explain', 'news'].map((mode, i) => `<div class="rail-section"><button data-mode="${mode}" aria-expanded="${state.mode === mode}" class="${state.mode === mode ? 'active' : ''}"><span>0${i + 1}</span><strong>${mode === 'explain' ? text('Understand the term','理解术语') : text('What’s happening','最近发生了什么')}</strong><span>${state.mode === mode ? '−' : '+'}</span></button>${state.mode === mode ? `<div class="section-body">${content}</div>` : ''}</div>`).join('')}${contextBlock()}${footer}</section>`;
    else html = `<section class="assistant variant-a" role="region" aria-label="Explained"><div class="card-top"><span class="identity"><span class="tiny-logo">e.</span> EXPLAINED</span>${closeButton}</div><div class="card-main">${title}${tabs()}${content}${contextBlock()}${footer}</div></section>`;
    root.innerHTML = html;
    const nextScroller = shadow.querySelector('.card-main,.split-answer,.variant-c');
    if (nextScroller) nextScroller.scrollTop = scrollTop;
    position();
    if (focusKey) shadow.querySelector(focusKey)?.focus({ preventScroll: true });
  }
  function position() {
    const card = shadow?.querySelector('.assistant');
    if (!card || prefs.layout === 'C') return;
    const bounds = rangeForPosition?.startContainer.isConnected ? rangeForPosition.getBoundingClientRect() : null;
    const r = bounds || { left: 12, right: 12, top: 12, bottom: 12 };
    const margin = 12, width = card.offsetWidth, height = card.offsetHeight;
    const x = Math.max(margin, Math.min(r.right + margin, innerWidth - width - margin));
    let y = r.bottom + margin;
    if (y + height > innerHeight - margin) y = r.top - height - margin;
    card.style.left = x + 'px';
    card.style.top = Math.max(margin, Math.min(y, innerHeight - height - margin)) + 'px';
  }
  async function onAction(event) {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.dataset.mode) {
      if (state.mode === target.dataset.mode) return;
      state.mode = target.dataset.mode; state.detail = false; await lookup(); return;
    }
    const action = target.dataset.action;
    if (action === 'close') close(true);
    if (action === 'context') { state.contextOpen = !state.contextOpen; render(); }
    if (action === 'more') { state.detail = !state.detail; await lookup(); }
    if (action === 'retry') await lookup(true);
    if (action === 'connection') {
      try { await chrome.runtime.sendMessage({ type: 'OPEN_CONNECTION' }); } catch { state.code = 'EXTENSION_RELOADED'; render(); }
    }
    if (action === 'consent') {
      try {
        const latest = Explained.settings((await chrome.storage.local.get('settings')).settings);
        prefs = { ...latest, consent: true };
        await chrome.storage.local.set({ settings: prefs });
        await lookup();
      } catch { state.phase = 'error'; state.code = 'EXTENSION_RELOADED'; render(); }
    }
  }
  document.addEventListener('pointerdown', event => {
    clearTimeout(debounce);
    pointerStart = null;
    if (event.composedPath().includes(host)) return;
    const selected = getSelection();
    if (selected?.rangeCount && !selected.isCollapsed) {
      const range = selected.getRangeAt(0);
      pointerStart = { start: range.startContainer, startOffset: range.startOffset, end: range.endContainer, endOffset: range.endOffset, x: event.clientX, y: event.clientY };
    }
    if (state.open) close();
  }, true);
  document.addEventListener('pointerup', event => {
    if (event.button !== 0 || event.composedPath().includes(host) || editable(event.target)) return;
    // Clicking outside can leave the old browser selection intact. That click
    // dismisses the card; it must not immediately reopen the same lookup.
    const selected = getSelection(), before = pointerStart;
    pointerStart = null;
    if (before && selected?.rangeCount && event.detail < 2 && Math.hypot(event.clientX - before.x, event.clientY - before.y) < 3) {
      const range = selected.getRangeAt(0);
      if (range.startContainer === before.start && range.startOffset === before.startOffset && range.endContainer === before.end && range.endOffset === before.endOffset) return;
    }
    clearTimeout(debounce); debounce = setTimeout(selection, 220);
  });
  document.addEventListener('keyup', event => {
    if (event.composedPath().includes(host)) return;
    if (event.shiftKey && (event.key.startsWith('Arrow') || ['Home', 'End'].includes(event.key))) {
      clearTimeout(debounce); debounce = setTimeout(selection, 220);
    }
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && state.open) close(true); });
  window.addEventListener('pagehide', () => { close(); port?.disconnect(); });
  window.addEventListener('resize', position);
  window.addEventListener('scroll', position, { passive: true, capture: true });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.settings) return;
    const previous = prefs; prefs = Explained.settings(changes.settings.newValue);
    if (!allowed()) close();
    else if (state.open && (previous.language !== prefs.language || previous.contextEnabled !== prefs.contextEnabled)) {
      state.cache.clear(); state.phase = 'cancelled'; stop(); state.text = ''; state.sources = [];
      state.context = prefs.contextEnabled ? state.capturedContext : ''; render();
    } else render();
  });
  chrome.storage.local.get('settings').then(result => { prefs = Explained.settings(result.settings); }).catch(() => {});
})();
