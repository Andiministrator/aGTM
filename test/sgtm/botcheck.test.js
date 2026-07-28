// test/sgtm/botcheck.test.js — sGTM Client bot-check verdict handling.
//
// The Client's sandboxed JS is not importable (it runs in GTM's server sandbox
// and reads globals like `data`/`sendHttpGet`), and the bot-check path is async
// so it is not reachable from the GTM ___TESTS___ tab either (finding F-44).
// So we extract the ONE pure function on that path — botFieldsFromResponse —
// from the source and exercise it here, plus a set of structural guards over
// the surrounding code that would otherwise regress unnoticed.
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dir, '..', '..');
const SRC = readFileSync(join(ROOT, 'sgtmClient/src/aGTM-sGTM-Client-jsSourceCode.js'), 'utf8');
const TPL = readFileSync(join(ROOT, 'sgtmClient/template.tpl'), 'utf8');

/**
 * Pulls a top-level `const <name> = function(...) { … };` out of the Client
 * source and evaluates it. `JSON` is injected as a shim that mirrors the GTM
 * server sandbox, where JSON.parse returns undefined on malformed input
 * instead of throwing (Node's would throw) — the extracted function is written
 * against that contract, so the harness has to reproduce it.
 */
function extractSource(name) {
  const start = SRC.indexOf('const ' + name + ' = function(');
  if (start < 0) throw new Error('function not found in Client source: ' + name);
  const end = SRC.indexOf('\n};', start);
  if (end < 0) throw new Error('no top-level end found for: ' + name);
  return SRC.slice(start + ('const ' + name + ' = ').length, end + 3).replace(/;$/, '');
}

/** @param deps other top-level Client helpers the extracted function calls. */
function extractFn(name, deps = []) {
  const sandboxJSON = {
    parse: function (s) { try { return JSON.parse(s); } catch (e) { return undefined; } },
    stringify: JSON.stringify
  };
  const preamble = deps.map((d) => 'const ' + d + ' = ' + extractSource(d) + ';').join('\n');
  return new Function('JSON', preamble + '\nreturn (' + extractSource(name) + ');')(sandboxJSON);
}

// botStr is the shared length-cap helper — extract it too, otherwise the
// harness would silently test a different function than the Client runs.
const botFieldsFromResponse = extractFn('botFieldsFromResponse', ['botStr']);

// api4filter response contract (2026-07-14). Verbatim from the service docs.
const CLEAN = '{"isBot":false,"score":0,"band":"clean","signals":[],"primarySignal":null}';
const BOT = JSON.stringify({
  isBot: true, score: 100, band: 'bot', primarySignal: 'known_bot',
  signals: [{ type: 'bot_string', category: 'known_bot', score: 100, detail: { matched: 'ahrefsbot' } }]
});
const BORDERLINE = JSON.stringify({
  isBot: false, score: 40, band: 'clean', primarySignal: 'asn_spam',
  signals: [{
    type: 'asn_reputation', category: 'asn_spam', score: 40, confirmed: true,
    detail: { asn: '55967', asnOrg: 'Beijing Baidu Netcom Science and Technology Co., Ltd.', uniqueIps: 76, requests: 82, reqsPerIp: 1.08, consecutiveWindows: 6 }
  }]
});

describe('botFieldsFromResponse — whitelist', () => {
  test('maps a clean verdict', () => {
    const r = botFieldsFromResponse(CLEAN);
    expect(r.isBot).toBe(false);
    expect(r.score).toBe(0);
    expect(r.band).toBe('clean');
    expect(r.signals).toEqual([]);
    // primarySignal is null on a clean verdict -> not forwarded as a key
    expect(r.primarySignal).toBeUndefined();
  });

  test('maps a definitive bot verdict', () => {
    const r = botFieldsFromResponse(BOT);
    expect(r.isBot).toBe(true);
    expect(r.band).toBe('bot');
    expect(r.primarySignal).toBe('known_bot');
    expect(r.signals[0].category).toBe('known_bot');
  });

  test('maps a borderline ASN verdict incl. confirmed flag', () => {
    const r = botFieldsFromResponse(BORDERLINE);
    expect(r.isBot).toBe(false);
    expect(r.score).toBe(40);
    expect(r.primarySignal).toBe('asn_spam');
    expect(r.signals.length).toBe(1);
    expect(r.signals[0].type).toBe('asn_reputation');
    expect(r.signals[0].score).toBe(40);
    expect(r.signals[0].confirmed).toBe(true);
  });

  test('strips signals[].detail — it carries tenant-wide data about OTHER visitors', () => {
    const r = botFieldsFromResponse(BORDERLINE);
    expect(r.signals[0].detail).toBeUndefined();
    // Nothing from the detail block may survive anywhere in the payload
    const flat = JSON.stringify(r);
    expect(flat).not.toContain('55967');
    expect(flat).not.toContain('Baidu');
    expect(flat).not.toContain('uniqueIps');
  });

  test('drops unknown top-level fields instead of passing them through', () => {
    const r = botFieldsFromResponse('{"isBot":false,"clientIP":"1.2.3.4","internalRuleDump":{"a":1}}');
    expect(r.clientIP).toBeUndefined();
    expect(r.internalRuleDump).toBeUndefined();
    expect(Object.keys(r)).toEqual(['isBot']);
  });

  test('drops unknown fields inside a signal entry', () => {
    const r = botFieldsFromResponse('{"isBot":false,"signals":[{"category":"asn_spam","clientIP":"1.2.3.4"}]}');
    expect(r.signals[0].clientIP).toBeUndefined();
    expect(Object.keys(r.signals[0])).toEqual(['category']);
  });

  test('caps the signals list at 10 entries', () => {
    const many = { isBot: false, signals: [] };
    for (let i = 0; i < 25; i++) many.signals.push({ category: 'c' + i });
    expect(botFieldsFromResponse(JSON.stringify(many)).signals.length).toBe(10);
  });

  test('isBot must be a real boolean — a truthy non-boolean is no verdict at all', () => {
    expect(botFieldsFromResponse('{"isBot":"true"}')).toEqual({});
    expect(botFieldsFromResponse('{"isBot":1}')).toEqual({});
    expect(botFieldsFromResponse('{"isBot":true}').isBot).toBe(true);
    expect(botFieldsFromResponse('{"isBot":false}').isBot).toBe(false);
  });

  test('returns {} for an empty, missing or malformed body (no throw)', () => {
    expect(botFieldsFromResponse('')).toEqual({});
    expect(botFieldsFromResponse(undefined)).toEqual({});
    expect(botFieldsFromResponse(null)).toEqual({});
    expect(botFieldsFromResponse('not json')).toEqual({});
    expect(botFieldsFromResponse('[1,2,3]')).toEqual({});
  });

  test('a parseable body without a boolean isBot is NOT a verdict', () => {
    // A 5xx error body that happens to be JSON must not arrive in the browser
    // as {isBot:false} — that reads as "clean visitor" when the service in fact
    // said nothing at all.
    expect(botFieldsFromResponse('{"error":"upstream down"}')).toEqual({});
    expect(botFieldsFromResponse('{"score":40,"band":"clean"}')).toEqual({});
  });

  test('caps forwarded string values so a widened field cannot leak detail', () => {
    const long = 'asn_spam:AS55967/Beijing Baidu Netcom Science and Technology Co., Ltd./76ip/82req';
    const r = botFieldsFromResponse(JSON.stringify({
      isBot: false, band: long, primarySignal: long,
      signals: [{ type: long, category: long }]
    }));
    expect(r.band.length).toBe(64);
    expect(r.primarySignal.length).toBe(64);
    expect(r.signals[0].type.length).toBe(64);
    expect(r.signals[0].category.length).toBe(64);
    // Short, well-formed values must pass through untouched
    expect(botFieldsFromResponse('{"isBot":false,"band":"clean"}').band).toBe('clean');
  });

  test('a duck-typed non-array signals object does not throw (no try/catch in the sandbox)', () => {
    // The length duck-check accepts any object with a numeric length — for…of
    // would reject it with a TypeError and, without try/catch, kill the whole
    // /aGTM.js response for every visitor.
    expect(() => botFieldsFromResponse('{"isBot":false,"signals":{"length":2}}')).not.toThrow();
    expect(botFieldsFromResponse('{"isBot":false,"signals":{"length":2}}').signals).toEqual([]);
    const faux = '{"isBot":false,"signals":{"length":2,"0":{"category":"a"},"1":{"category":"b"}}}';
    expect(botFieldsFromResponse(faux).signals.length).toBe(2);
  });

  test('tolerates wrong types without throwing', () => {
    const r = botFieldsFromResponse('{"isBot":false,"score":"40","band":42,"primarySignal":[],"signals":"nope"}');
    expect(r.score).toBeUndefined();
    expect(r.band).toBeUndefined();
    expect(r.primarySignal).toBeUndefined();
    expect(r.signals).toBeUndefined();
  });

  test('survives a null entry inside signals', () => {
    const r = botFieldsFromResponse('{"isBot":false,"signals":[null,{"category":"asn_spam"}]}');
    expect(r.signals.length).toBe(1);
    expect(r.signals[0].category).toBe('asn_spam');
  });
});

describe('bot-check call site — structural guards', () => {
  // F-127: api4filter couples the HTTP status to the verdict (403 when isBot).
  // A `2xx only` gate therefore skips the body of exactly the bot responses and
  // lets every bot through. Introduced in v1.5 (9d302d7), fixed here.
  // The end marker is asserted separately: String.indexOf returns -1 when the
  // marker is gone, and slice(start, -1) would then silently widen the range
  // past the only other `statusCode >= 200` occurrence, so the guard would pass
  // for the wrong reason.
  const HANDLER_END = 'afterBotCheck(CFG.botCheckMode === \'block\' && botState.verdict.isBot === true);';

  test('the blocking decision is pinned to the actual verdict', () => {
    expect(SRC).toContain(HANDLER_END);
  });

  test('the bot-check response handler has no 2xx status gate', () => {
    const start = SRC.indexOf('sendHttpGet(botCheckUrl');
    expect(start).toBeGreaterThan(-1);
    const end = SRC.indexOf(HANDLER_END, start);
    expect(end).toBeGreaterThan(start);
    const handler = SRC.slice(start, end);
    expect(handler).not.toContain('statusCode >= 200');
    expect(handler).not.toContain('statusCode < 300');
    expect(handler).toContain('botFieldsFromResponse(r.body)');
  });

  test('the error path sets an explicit "no verdict" band instead of looking clean', () => {
    expect(SRC).toContain("botState.verdict = {isBot: false, band: 'unknown'};");
  });

  test('mode and expose are normalized against an unset/garbage template field', () => {
    // Only the literal 'mark' disables blocking — a misconfigured SELECT must
    // never silently switch the filter off (the F-29 lesson).
    expect(SRC).toContain("botCheckMode: data.botCheckMode === 'mark' ? 'mark' : 'block',");
    // Expose is opt-out: an existing config without the field keeps publishing.
    expect(SRC).toContain('botCheckExpose: data.botCheckExpose !== false,');
  });

  test('the verdict is forwarded as its own cfg key, not inside cfg.session', () => {
    expect(SRC).toContain('c.bot = botState.verdict;');
    expect(SRC).toContain('botCheckEnabled && CFG.botCheckExpose');
    // The session preset gate must stay exactly as it was — adding `bot` to it
    // would let a bot-only payload set session_status in the library.
    expect(SRC).toContain('sessionData.sid || sessionData.consent || sessionData.attribution || sessionData.source');
  });

  test('the verdict container is a const object, not a rebound top-level let', () => {
    // Mutating a property of a const container from inside a callback is the
    // pattern already proven live in this file (sessionData.uid in the promote
    // callback); rebinding a top-level `let` from a closure has no precedent
    // here and would be an unverified assumption in server-sandbox code.
    expect(SRC).toContain('const botState = {verdict: null};');
    expect(SRC).not.toContain('let botInfo');
  });

  test('the Session API counters are protected from a Sources API overwrite', () => {
    // fireSources() runs AFTER the counters are set and writes every non-meta
    // field into the same object, so they have to be on the meta blacklist.
    const meta = SRC.slice(SRC.indexOf('const SOURCES_META'), SRC.indexOf('\n', SRC.indexOf('const SOURCES_META')));
    for (const f of ['created', 'lastInteraction', 'pvCount', 'eventCount', 'sessionCount']) {
      expect(meta).toContain(f + ': 1');
    }
  });
});

describe('Session API counters — structural guards', () => {
  for (const f of ['created', 'lastInteraction', 'pvCount', 'eventCount', 'sessionCount']) {
    test('forwards ' + f, () => {
      expect(SRC).toContain("if (typeof r." + f + " === 'number') sd." + f + " = r." + f + ";");
    });
  }

  test('does not duplicate `counter` — it already ships as vct', () => {
    expect(SRC).toContain('sd.vct = r.counter || 0;');
    expect(SRC).not.toContain('sd.counter =');
  });

  test('leaves the ret/vct semantics untouched (they gate the auto-denial)', () => {
    expect(SRC).toContain('sd.ret = sd.vct > 0;');
    expect(SRC).not.toContain('sd.ret = sd.sessionCount');
  });
});

describe('sandboxed block <-> source sync invariant', () => {
  // CLAUDE.md: the ___SANDBOXED_JS_FOR_SERVER___ block and the source file must
  // stay byte-identical; build.sh only syncs the embedded base64 blob into both.
  // This was a manual `diff` step until now (finding F-43 came from it drifting).
  test('template.tpl sandboxed block equals the source file byte for byte', () => {
    const lines = TPL.split('\n');
    const start = lines.indexOf('___SANDBOXED_JS_FOR_SERVER___');
    const end = lines.indexOf('___SERVER_PERMISSIONS___');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    // Block content sits between the marker (+1 blank line) and the next marker
    const block = lines.slice(start + 2, end).join('\n');
    expect(block).toBe(SRC.replace(/\n$/, ''));
  });
});
