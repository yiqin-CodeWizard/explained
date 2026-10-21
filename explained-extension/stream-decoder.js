// Experimental decoder for observed SSE formats, not an official DeepSeek contract.
// Only explicit assistant RESPONSE/content fields become output. Reasoning,
// search-tool fragments, titles, identifiers and arbitrary string fields do not.
(() => {
  class HighlightStreamDecoder {
    constructor() {
      this.buffer = '';
      this.lines = [];
      this.event = '';
      this.response = { fragments: [] };
      this.path = '';
      this.operation = 'APPEND';
      this.openaiText = '';
      this.frames = 0;
      this.recognized = 0;
      this.format = 'unrecognized';
      this.finished = false;
      this.failure = null;
      this.sources = new Map();
    }

    feed(chunk) {
      this.buffer += chunk;
      if (this.buffer.length > 262144) throw new Error('SSE frame exceeds prototype limit');
      let end;
      while ((end = this.buffer.indexOf('\n')) !== -1) {
        const line = this.buffer.slice(0, end).replace(/\r$/, '');
        this.buffer = this.buffer.slice(end + 1);
        if (!line) this.dispatch();
        else if (line.startsWith('data:')) this.lines.push(line.slice(5).replace(/^ /, ''));
        else if (line.startsWith('event:')) this.event = line.slice(6).trim();
      }
      if (this.text().length > 32768) throw new Error('Answer exceeds prototype limit');
    }

    end() {
      if (this.buffer.startsWith('data:')) this.lines.push(this.buffer.slice(5).replace(/^ /, ''));
      this.buffer = '';
      this.dispatch();
    }

    dispatch() {
      const payload = this.lines.join('\n');
      const event = this.event;
      this.lines = [];
      this.event = '';
      if (!payload) return;
      this.frames++;
      if (payload.trim() === '[DONE]') {
        if (this.format !== 'unrecognized') this.finished = true;
        return;
      }
      let value;
      try { value = JSON.parse(payload); } catch { return; }
      if (!value || typeof value !== 'object') return;
      // A transport/control event is never answer text.
      if (value.type === 'error' || event === 'error') {
        this.failure = 'stream-error';
        return;
      }
      if (Array.isArray(value.choices)) {
        this.metadata(value.search_results);
        this.metadata(value.citations);
        this.format = 'openai-delta';
        this.recognized++;
        const choice = value.choices[0];
        if (typeof choice?.delta?.content === 'string') this.openaiText += choice.delta.content;
        if (choice?.finish_reason === 'stop') this.finished = true;
        else if (choice?.finish_reason) this.failure = 'non-normal-finish';
        return;
      }
      if (value.v?.response && typeof value.v.response === 'object') {
        this.snapshot(value.v.response);
        return;
      }
      if (typeof value.p === 'string' || Object.hasOwn(value, 'v')) this.patch(value);
    }

    status(value) {
      if (value === 'FINISHED') this.finished = true;
      if (['INCOMPLETE', 'CONTENT_FILTER', 'ERROR', 'FAILED', 'CANCELLED', 'INTERRUPTED'].includes(value)) this.failure = value;
    }

    fragment(value) {
      if (['TOOL_SEARCH', 'TOOL_OPEN'].includes(value?.type)) {
        this.metadata(value.results || value.search_results || value.sources);
        if (typeof value.content === 'string' && value.content.length < 131072) {
          try { this.metadata(JSON.parse(value.content)); } catch { /* Never parse model prose as source metadata. */ }
        }
      }
      return { type: typeof value?.type === 'string' ? value.type : '', content: typeof value?.content === 'string' ? value.content.slice(0, 32768) : '' };
    }

    metadata(value, depth = 0) {
      if (depth > 5 || this.sources.size >= 32 || !value) return;
      if (Array.isArray(value)) { for (const item of value.slice(0, 64)) this.metadata(item, depth + 1); return; }
      if (typeof value !== 'object') return;
      if (typeof value.url === 'string') {
        try {
          const url = new URL(value.url);
          if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) {
            const label = String(value.index ?? value.id ?? value.title ?? url.hostname).slice(0, 200);
            this.sources.set(url.href, { url: url.href, label });
          }
        } catch { /* Omit malformed metadata URLs. */ }
      }
      for (const key of ['search_results', 'results', 'citations', 'references', 'sources', 'items', 'data', 'result']) {
        if (value[key] && typeof value[key] === 'object') this.metadata(value[key], depth + 1);
      }
    }

    snapshot(value) {
      this.format = 'deepseek-patch';
      this.recognized++;
      for (const key of ['search_results', 'citations', 'references', 'sources']) this.metadata(value[key]);
      this.response = { fragments: Array.isArray(value.fragments) ? value.fragments.slice(0, 64).map(v => this.fragment(v)) : [] };
      if (typeof value.content === 'string') this.response.content = value.content;
      this.status(value.status);
      // Some snapshot/fragment frames are followed by pathless text deltas.
      if (this.response.fragments.length) this.path = 'response/fragments/-1/content';
      else if (typeof value.content === 'string') this.path = 'response/content';
      this.operation = 'APPEND';
    }

    patch(frame, base = '') {
      const explicit = typeof frame.p === 'string';
      let path = explicit ? frame.p.replace(/^\//, '') : this.path;
      if (explicit && base && !path.startsWith('response/')) path = `${base}/${path}`;
      const op = frame.o || (/\/content$/.test(path) ? 'APPEND' : (explicit ? 'SET' : this.operation));
      const value = frame.v;
      if (/^response\/(?:search_results|citations|references|sources)(?:\/|$)/.test(path)) this.metadata(value);
      if (op === 'BATCH' && Array.isArray(value)) {
        for (const child of value) if (child && typeof child === 'object') this.patch(child, path);
        return;
      }
      if (explicit) { this.path = path; this.operation = op; }
      if (path === 'response' && value && typeof value === 'object' && !Array.isArray(value)) {
        this.snapshot(value);
        return;
      }
      if (path === 'response/status') {
        this.status(value);
        return;
      }
      if (path === 'response/quasi_status') {
        if (value !== 'FINISHED') this.status(value);
        return;
      }
      if (path === 'response/fragments' && Array.isArray(value)) {
        this.format = 'deepseek-patch';
        this.recognized++;
        const incoming = value.map(v => this.fragment(v));
        this.response.fragments = (op === 'APPEND' ? [...this.response.fragments, ...incoming] : incoming).slice(0, 64);
        this.path = 'response/fragments/-1/content';
        this.operation = 'APPEND';
        return;
      }
      if (path === 'response/content' && typeof value === 'string') {
        this.format = 'deepseek-patch';
        this.recognized++;
        this.response.content = op === 'APPEND' ? (this.response.content || '') + value : value;
        return;
      }
      const match = /^response\/fragments\/(-1|\d+)(?:\/(content|type))?$/.exec(path);
      if (!match) return;
      let index = Number(match[1]);
      if (index === -1) index = this.response.fragments.length - 1;
      if (index < 0 || index >= 64) return;
      this.format = 'deepseek-patch';
      this.recognized++;
      if (!match[2] && value && typeof value === 'object') {
        this.response.fragments[index] = this.fragment(value);
      } else {
        const fragment = this.response.fragments[index] ||= { type: '', content: '' };
        if (match[2] === 'type' && typeof value === 'string') fragment.type = value;
        if (match[2] === 'content' && typeof value === 'string') fragment.content = op === 'APPEND' ? fragment.content + value : value;
      }
    }

    text() {
      if (this.format === 'openai-delta') return this.openaiText;
      const fragments = this.response.fragments.filter(f => f?.type === 'RESPONSE');
      return fragments.length ? fragments.map(f => f.content).join('') : (this.response.content || '');
    }

    state() {
      return { text: this.text(), sources: [...this.sources.values()], format: this.format, frames: this.frames, recognizedFrames: this.recognized, finished: this.finished && !this.failure, failure: this.failure };
    }
  }
  globalThis.HighlightStreamDecoder = HighlightStreamDecoder;
})();
