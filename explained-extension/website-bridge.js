/* Only this isolated-world bridge can relay extension requests to the site client. */
(() => {
  let active = null;
  function post(nonce, detail) {
    window.postMessage({ channel: 'EXPLAINED_DIRECT_CONTROL_V1', nonce, ...detail }, location.origin);
  }
  function probe() {
    const nonce = crypto.randomUUID();
    return new Promise(resolve => {
      const cleanup = () => { clearTimeout(timer); window.removeEventListener('message', listener); };
      const listener = event => {
        if (event.source !== window || event.origin !== location.origin || event.data?.channel !== 'EXPLAINED_DIRECT_OUTPUT_V1' || event.data.nonce !== nonce || event.data.event !== 'ready') return;
        cleanup();
        resolve({ ready: true, version: '0.1.2', authenticated: event.data.authenticated === true, busy: !!active || event.data.busy === true });
      };
      const timer = setTimeout(() => { cleanup(); resolve({ ready: false }); }, 1500);
      window.addEventListener('message', listener);
      post(nonce, { action: 'probe' });
    });
  }
  function run(request) {
    const nonce = crypto.randomUUID();
    let resolveDone;
    const task = { id: request.id, done: new Promise(resolve => { resolveDone = resolve; }) };
    active = task;
    const emit = data => chrome.runtime.sendMessage({ type: 'EX_EVENT', id: request.id, ...data }).catch(() => {});
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener('message', listener);
      post(nonce, { action: 'cancel' });
      if (active === task) active = null;
      resolveDone();
    };
    task.cancel = cleanup;
    const listener = event => {
      const m = event.data;
      if (event.source !== window || event.origin !== location.origin || m?.channel !== 'EXPLAINED_DIRECT_OUTPUT_V1' || m.nonce !== nonce) return;
      if (m.event === 'stage') emit({ event: 'stage', stage: m.stage });
      if (['text', 'complete'].includes(m.event) && typeof m.text === 'string' && m.text.length <= 32768) {
        const sources = (Array.isArray(m.sources) ? m.sources : []).slice(0, 32).flatMap(s => {
          const url = Explained.safeURL(s?.url);
          const citationIds = (Array.isArray(s?.citationIds) ? s.citationIds : []).filter(id => typeof id === 'string' && /^(?:0|[1-9]\d{0,8})$/.test(id)).slice(0, 64);
          return url ? [{ url, label: String(s.label || new URL(url).hostname).slice(0, 200), citationIds }] : [];
        });
        emit({ event: m.event === 'text' ? 'streaming' : 'complete', text: m.text, sources });
        if (m.event === 'complete') cleanup();
      }
      if (m.event === 'error') {
        const code = typeof m.code === 'string' && /^[A-Z_]{1,80}$/.test(m.code) ? m.code : 'REQUEST_FAILED';
        emit({ event: 'error', code, stage: typeof m.stage === 'string' && /^[a-z_]{1,40}$/.test(m.stage) ? m.stage : 'request' });
        cleanup();
      }
    };
    const timer = setTimeout(() => { emit({ event: 'error', code: 'TIMEOUT', stage: 'request' }); cleanup(); }, 65000);
    window.addEventListener('message', listener);
    post(nonce, { action: 'run', prompt: Explained.promptFor(request), mode: request.mode });
  }
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.id !== chrome.runtime.id || sender.tab || (sender.url && !sender.url.startsWith(chrome.runtime.getURL('')))) return;
    if (message.type === 'EX_PING') { probe().then(reply); return true; }
    if (message.type === 'EX_CANCEL') {
      if (active && (!message.id || message.id === active.id)) active.cancel();
      // The page aborts asynchronously. Wait for its active controller to settle
      // before acknowledging, so a new request cannot be silently dropped.
      (async () => {
        for (let i = 0; i < 20; i++) {
          const status = await probe();
          if (!status.busy) { reply({ cancelled: true }); return; }
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        reply({ cancelled: false });
      })();
      return true;
    }
    if (message.type !== 'EX_RUN') return;
    if (active) { reply({ accepted: false, code: 'BUSY' }); return; }
    if (typeof message.id !== 'string' || message.id.length > 80 || typeof message.term !== 'string' || !message.term.trim() || message.term.length > 500 || typeof message.context !== 'string' || message.context.length > 600 || !['explain', 'news'].includes(message.mode) || !Object.hasOwn(Explained.languages, message.language)) {
      reply({ accepted: false, code: 'INVALID_REQUEST' }); return;
    }
    run(message);
    reply({ accepted: true });
  });
})();
