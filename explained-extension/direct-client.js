// Experimental direct website POST client. No UI submission, token export,
// request replay, verification bypass, retries, or official paid model API.
(() => {
  if (location.origin !== 'https://chat.deepseek.com') return;
  const CONTROL = 'EXPLAINED_DIRECT_CONTROL_V1';
  const OUTPUT = 'EXPLAINED_DIRECT_OUTPUT_V1';
  const VERSION = '0.1.2';
  const PUBLIC_SOLVER = 'https://fe-static.deepseek.com/chat/static/sha3_wasm_bg.7b9ca65ddd.wasm';
  const pageFetch = window.fetch.bind(window);
  const clientMetadata = {};
  // Learn only public client-version metadata from the site's normal traffic.
  // Authorization, proof and cookie headers are never captured here.
  window.fetch = function (...args) {
    try {
      const input = args[0];
      const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url, location.href);
      if (url.origin === location.origin) {
        const headers = new Headers(args[1]?.headers || (input instanceof Request ? input.headers : undefined));
        for (const key of ['x-client-platform', 'x-client-version', 'x-app-version', 'x-client-locale', 'x-client-timezone-offset']) {
          const value = headers.get(key);
          if (value && value.length <= 120) clientMetadata[key] = value;
        }
      }
    } catch { /* Forward unrecognized fetch arguments unchanged. */ }
    return pageFetch(...args);
  };
  let active = null;
  let worker = null;
  let workerJob = 0;

  // Runs off the UI thread. The module is a public vendor asset, not an auth
  // credential. It has no imports and receives only the server's fresh challenge.
  function solverWorker() {
    let cachedURL = '';
    let cachedModule = null;
    self.onmessage = async event => {
      const { job, challenge, url } = event.data;
      try {
        if (!cachedModule || cachedURL !== url) {
          const response = await fetch(url, { credentials: 'omit', redirect: 'error' });
          if (!response.ok) throw new Error('SOLVER_DOWNLOAD_FAILED');
          const bytes = await response.arrayBuffer();
          if (bytes.byteLength > 4000000) throw new Error('SOLVER_TOO_LARGE');
          const module = await WebAssembly.compile(bytes);
          if (WebAssembly.Module.imports(module).length) throw new Error('SOLVER_IMPORTS_UNSUPPORTED');
          cachedURL = url;
          cachedModule = module;
        }
        const { exports: e } = await WebAssembly.instantiate(cachedModule, {});
        if (!e.memory || !e.wasm_solve || !e.__wbindgen_export_0 || !e.__wbindgen_add_to_stack_pointer) throw new Error('SOLVER_ABI_CHANGED');
        const encoder = new TextEncoder();
        const values = [challenge.challenge, `${challenge.salt}_${challenge.expire_at}_`].map(text => encoder.encode(text));
        const pointers = values.map(value => {
          const pointer = e.__wbindgen_export_0(value.length, 1) >>> 0;
          new Uint8Array(e.memory.buffer, pointer, value.length).set(value);
          return pointer;
        });
        const stack = e.__wbindgen_add_to_stack_pointer(-16);
        let answer;
        try {
          e.wasm_solve(stack, pointers[0], values[0].length, pointers[1], values[1].length, challenge.difficulty);
          const result = new DataView(e.memory.buffer);
          answer = result.getFloat64(stack + 8, true);
          if (!result.getInt32(stack, true) || !Number.isSafeInteger(answer) || answer < 0) throw new Error('SOLVER_NO_RESULT');
        } finally { e.__wbindgen_add_to_stack_pointer(16); }
        self.postMessage({ job, answer });
      } catch (error) {
        const allowed = new Set(['SOLVER_DOWNLOAD_FAILED', 'SOLVER_TOO_LARGE', 'SOLVER_IMPORTS_UNSUPPORTED', 'SOLVER_ABI_CHANGED', 'SOLVER_NO_RESULT']);
        self.postMessage({ job, error: allowed.has(error.message) ? error.message : 'SOLVER_BLOCKED_OR_FAILED' });
        cachedModule = null;
      }
    };
  }

  function solverURL(override) {
    const valid = value => {
      try {
        const url = new URL(value, location.href);
        return url.protocol === 'https:' && !url.username && !url.password &&
          [location.origin, 'https://fe-static.deepseek.com'].includes(url.origin) &&
          /(?:^|\/)sha3_wasm_bg\.[\w-]+\.wasm$/.test(url.pathname) && !url.search && !url.hash ? url.href : null;
      } catch { return null; }
    };
    if (override) {
      const url = valid(override);
      if (!url) throw Object.assign(new Error(), { code: 'SOLVER_URL_NOT_ALLOWED' });
      return url;
    }
    const observed = performance.getEntriesByType('resource').map(entry => valid(entry.name)).find(Boolean);
    return observed || PUBLIC_SOLVER;
  }

  function solve(challenge, url, signal) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) { reject(Object.assign(new Error(), { code: 'ABORTED' })); return; }
      if (!worker) {
        try {
          const blob = URL.createObjectURL(new Blob([`(${solverWorker.toString()})()`], { type: 'text/javascript' }));
          try { worker = new Worker(blob); } finally { URL.revokeObjectURL(blob); }
        } catch { reject(Object.assign(new Error(), { code: 'SOLVER_WORKER_BLOCKED' })); return; }
      }
      const current = worker;
      const job = ++workerJob;
      let timer;
      const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); current.removeEventListener('message', receive); current.removeEventListener('error', failed); };
      const stop = code => { cleanup(); current.terminate(); if (worker === current) worker = null; reject(Object.assign(new Error(), { code })); };
      const abort = () => stop('ABORTED');
      const failed = () => stop('SOLVER_WORKER_BLOCKED');
      const receive = event => {
        if (event.data?.job !== job) return;
        cleanup();
        if (event.data.error) reject(Object.assign(new Error(), { code: event.data.error }));
        else if (Number.isSafeInteger(event.data.answer) && event.data.answer >= 0) resolve(event.data.answer);
        else reject(Object.assign(new Error(), { code: 'SOLVER_INVALID_RESULT' }));
      };
      current.addEventListener('message', receive);
      current.addEventListener('error', failed);
      signal.addEventListener('abort', abort, { once: true });
      timer = setTimeout(() => stop('SOLVER_TIMEOUT'), 15000);
      current.postMessage({ job, challenge, url });
    });
  }

  function sessionToken() {
    // This value stays in the webpage and is sent only to its own origin.
    let raw;
    try { raw = localStorage.getItem('userToken'); } catch { return null; }
    if (!raw) return null;
    try {
      const decoded = JSON.parse(raw);
      if (typeof decoded === 'string') return decoded;
      if (typeof decoded?.value === 'string') return decoded.value;
      return null;
    } catch { return /^[\w.\-]+$/.test(raw) ? raw : null; }
  }

  const post = (run, event, detail = {}) => {
    if (active !== run) return;
    window.postMessage({ channel: OUTPUT, nonce: run.nonce, event, version: VERSION, atMs: Date.now(), visibility: document.visibilityState, elapsedMs: Math.round(performance.now() - run.started), ...detail }, location.origin);
  };

  async function runDirect(message) {
    const run = { nonce: message.nonce, started: performance.now(), controller: new AbortController(), stage: 'authentication', phaseMs: {} };
    active = run;
    const deadline = setTimeout(() => run.controller.abort(), 60000);
    let reader;
    const stage = name => { run.stage = name; post(run, 'stage', { stage: name, phaseMs: { ...run.phaseMs } }); };
    try {
      stage('authentication');
      const token = sessionToken();
      if (!token) throw Object.assign(new Error(), { code: 'LOGIN_REQUIRED' });
      const baseHeaders = { 'x-client-platform': 'web', ...clientMetadata, 'content-type': 'application/json', authorization: `Bearer ${token}` };
      const jsonPost = async (path, body, name) => {
        const start = performance.now();
        const response = await window.fetch(path, { method: 'POST', credentials: 'same-origin', redirect: 'error', headers: baseHeaders, body: JSON.stringify(body), signal: run.controller.signal });
        if (!response.ok) throw Object.assign(new Error(), { code: 'HTTP_REJECTED', httpStatus: response.status, failedStage: name });
        let envelope;
        try { envelope = await response.json(); } catch { throw Object.assign(new Error(), { code: 'INVALID_JSON', failedStage: name }); }
        const business = envelope?.data;
        if ((typeof envelope?.code === 'number' && envelope.code !== 0) || (typeof business?.biz_code === 'number' && business.biz_code !== 0) || !business?.biz_data) {
          throw Object.assign(new Error(), { code: 'BUSINESS_REJECTED', businessCode: business?.biz_code ?? envelope?.code, failedStage: name });
        }
        run.phaseMs[name] = Math.round(performance.now() - start);
        return business.biz_data;
      };
      const url = solverURL(message.solverURL || '');
      stage('session-and-challenge');
      const [session, issued] = await Promise.all([
        jsonPost('/api/v0/chat_session/create', {}, 'session'),
        jsonPost('/api/v0/chat/create_pow_challenge', { target_path: '/api/v0/chat/completion' }, 'challenge')
      ]);
      const sessionID = session.chat_session?.id || session.id;
      const challenge = issued.challenge;
      if (typeof sessionID !== 'string' || !sessionID || !challenge || challenge.algorithm !== 'DeepSeekHashV1' ||
          typeof challenge.challenge !== 'string' || !/^[a-f\d]{64}$/i.test(challenge.challenge) ||
          typeof challenge.salt !== 'string' || challenge.salt.length > 2048 ||
          typeof challenge.signature !== 'string' || challenge.signature.length > 4096 ||
          !Number.isFinite(challenge.expire_at) || !Number.isInteger(challenge.difficulty) || challenge.difficulty < 1 || challenge.difficulty > 5000000) {
        throw Object.assign(new Error(), { code: 'REQUEST_CONTRACT_CHANGED' });
      }
      const expires = challenge.expire_at > 1000000000000 ? challenge.expire_at : challenge.expire_at * 1000;
      if (expires <= Date.now()) throw Object.assign(new Error(), { code: 'CHALLENGE_EXPIRED' });
      stage('solver');
      const solveStart = performance.now();
      const answer = await solve(challenge, url, run.controller.signal);
      run.phaseMs.solver = Math.round(performance.now() - solveStart);
      if (expires <= Date.now()) throw Object.assign(new Error(), { code: 'CHALLENGE_EXPIRED' });
      const proof = btoa(JSON.stringify({ algorithm: challenge.algorithm, challenge: challenge.challenge, salt: challenge.salt, answer, signature: challenge.signature, target_path: '/api/v0/chat/completion' }));
      stage('completion');
      const requestStartedMs = Math.round(performance.now() - run.started);
      const response = await window.fetch('/api/v0/chat/completion', {
        method: 'POST', credentials: 'same-origin', redirect: 'error',
        headers: { ...baseHeaders, accept: 'text/event-stream', 'x-ds-pow-response': proof },
        body: JSON.stringify({ chat_session_id: sessionID, parent_message_id: null, model_type: 'default', prompt: message.prompt, ref_file_ids: [], thinking_enabled: false, search_enabled: message.mode === 'news', action: null, preempt: false }),
        signal: run.controller.signal
      });
      const base = { networkRequestStartedMs: requestStartedMs, phaseMs: { ...run.phaseMs } };
      post(run, 'headers', { ...base, httpStatus: response.status });
      if (!response.ok) throw Object.assign(new Error(), { code: 'HTTP_REJECTED', httpStatus: response.status });
      if (!/text\/event-stream/i.test(response.headers.get('content-type') || '') || !response.body) throw Object.assign(new Error(), { code: 'EXPECTED_SSE_RESPONSE' });
      stage('stream');
      reader = response.body.getReader();
      const utf8 = new TextDecoder();
      const parser = new globalThis.HighlightStreamDecoder();
      let bytes = 0;
      let networkFirstByteMs = null;
      let networkFirstTextMs = null;
      let lastPayload = '';
      const publish = () => {
        const state = parser.state();
        if (state.text.trim()) {
          networkFirstTextMs ??= Math.round(performance.now() - run.started);
          const serialized = JSON.stringify([state.text, state.sources]);
          if (serialized !== lastPayload) {
            lastPayload = serialized;
            post(run, 'text', { ...state, ...base, networkFirstByteMs, networkFirstTextMs });
          }
        }
        return state;
      };
      let state;
      while (true) {
        const { done, value } = await reader.read();
        if (done) { parser.feed(utf8.decode()); parser.end(); state = publish(); break; }
        bytes += value.byteLength;
        if (bytes > 1048576) throw Object.assign(new Error(), { code: 'STREAM_LIMIT' });
        if (networkFirstByteMs === null) {
          networkFirstByteMs = Math.round(performance.now() - run.started);
          post(run, 'first_byte', { ...base, networkFirstByteMs });
        }
        parser.feed(utf8.decode(value, { stream: true }));
        state = publish();
        if (state.finished && state.text.trim()) break;
      }
      if (!state?.text.trim() || !state.finished || state.failure) throw Object.assign(new Error(), { code: state?.format === 'unrecognized' ? 'STREAM_FORMAT_UNRECOGNIZED' : 'STREAM_NOT_FINISHED_NORMALLY' });
      post(run, 'complete', { ...state, ...base, networkFirstByteMs, networkFirstTextMs });
    } catch (error) {
      const wasAborted = run.controller.signal.aborted;
      run.controller.abort();
      const safeCodes = new Set(['LOGIN_REQUIRED', 'HTTP_REJECTED', 'INVALID_JSON', 'BUSINESS_REJECTED', 'REQUEST_CONTRACT_CHANGED', 'CHALLENGE_EXPIRED', 'SOLVER_URL_NOT_ALLOWED', 'SOLVER_DOWNLOAD_FAILED', 'SOLVER_TOO_LARGE', 'SOLVER_IMPORTS_UNSUPPORTED', 'SOLVER_ABI_CHANGED', 'SOLVER_NO_RESULT', 'SOLVER_WORKER_BLOCKED', 'SOLVER_BLOCKED_OR_FAILED', 'SOLVER_TIMEOUT', 'SOLVER_INVALID_RESULT', 'EXPECTED_SSE_RESPONSE', 'STREAM_LIMIT', 'STREAM_FORMAT_UNRECOGNIZED', 'STREAM_NOT_FINISHED_NORMALLY']);
      post(run, 'error', { stage: error.failedStage || run.stage, code: wasAborted && !safeCodes.has(error.code) ? 'ABORTED_OR_FAILED' : (safeCodes.has(error.code) ? error.code : 'REQUEST_FAILED'), httpStatus: Number.isInteger(error.httpStatus) ? error.httpStatus : undefined, businessCode: Number.isInteger(error.businessCode) ? error.businessCode : undefined, phaseMs: { ...run.phaseMs } });
    } finally {
      clearTimeout(deadline);
      if (reader) { void reader.cancel().catch(() => {}); }
      if (active === run) active = null;
    }
  }

  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data;
    if (!data || data.channel !== CONTROL || typeof data.nonce !== 'string' || data.nonce.length > 80) return;
    if (data.action === 'probe') {
      let authenticated = false;
      try { authenticated = !!sessionToken(); } catch { /* Report only presence, never the value. */ }
      window.postMessage({ channel: OUTPUT, nonce: data.nonce, event: 'ready', version: VERSION, atMs: Date.now(), busy: !!active, authenticated }, location.origin);
    } else if (data.action === 'cancel' && active?.nonce === data.nonce) {
      active.controller.abort();
      // A cancelled proof computation must not occupy the next lookup's worker.
      worker?.terminate();
      worker = null;
    } else if (data.action === 'run' && !active && typeof data.prompt === 'string' && data.prompt.trim() && data.prompt.length <= 6000 && ['explain', 'news'].includes(data.mode) && (!data.solverURL || typeof data.solverURL === 'string')) {
      void runDirect(data);
    }
  });
})();
