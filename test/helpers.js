// test/helpers.js — shared utilities for aGTM tests

/**
 * Resets all aGTM runtime state and optionally applies a fresh config.
 * Call in beforeEach() to guarantee test isolation.
 * @param {object} cfg — passed to aGTM.f.config() when non-empty
 */
export function resetAGTM(cfg = {}) {
  // Full data/config wipe so objinit() sets correct defaults
  globalThis.aGTM.d = {};
  globalThis.aGTM.c = {};
  globalThis.aGTM.l = [];
  globalThis.aGTM.n = {};
  globalThis.aGTM.f.objinit();
  if (Object.keys(cfg).length > 0) {
    globalThis.aGTM.f.config(cfg);
  }
}

/**
 * Controllable XMLHttpRequest mock.
 * Install with MockXHR.install() in beforeEach, reset with MockXHR.reset().
 *
 * Usage in tests:
 *   MockXHR.last.respond(200, { sid: 'abc' });  // simulate 2xx JSON response
 *   MockXHR.last.respond(500, 'error');          // simulate error response
 */
export class MockXHR {
  constructor() {
    this.readyState = 0;
    this.status     = 0;
    this.responseText = '';
    this.onreadystatechange = null;
    this.method   = null;
    this.url      = null;
    this._body    = null;
    this._aborted = false;
    this._headers = {};
    MockXHR.instances.push(this);
    MockXHR.last = this;
  }

  open(method, url)          { this.method = method; this.url = url; }
  setRequestHeader(k, v)     { this._headers[k] = v; }
  send(body)                 { this._body = body; }
  abort()                    { this._aborted = true; }

  /** Simulate a server response (synchronous, fires onreadystatechange). */
  respond(status, data) {
    this.status       = status;
    this.responseText = typeof data === 'string' ? data : JSON.stringify(data);
    this.readyState   = 4;
    if (typeof this.onreadystatechange === 'function') this.onreadystatechange();
  }

  /** Replace global XMLHttpRequest with MockXHR and clear instance list. */
  static install() {
    MockXHR.instances = [];
    MockXHR.last      = null;
    globalThis.XMLHttpRequest = MockXHR;
  }

  /** Clear instance tracking without reinstalling. */
  static reset() {
    MockXHR.instances = [];
    MockXHR.last      = null;
  }
}
MockXHR.instances = [];
MockXHR.last      = null;
