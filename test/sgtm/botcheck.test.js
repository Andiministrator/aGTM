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

/** Pulls a single-line `const NAME = {...};` table out of the Client source. */
function extractConst(name) {
  const m = SRC.match(new RegExp('^const ' + name + ' = (\\{.*\\});$', 'm'));
  if (!m) throw new Error('const table not found in Client source: ' + name);
  return 'const ' + name + ' = ' + m[1] + ';';
}

/**
 * @param deps   other top-level helper functions the extracted one calls
 * @param tables single-line `const X = {…}` lookup tables it reads
 */
function extractFn(name, deps = [], tables = [], sink) {
  const sandboxJSON = {
    parse: function (s) { try { return JSON.parse(s); } catch (e) { return undefined; } },
    stringify: JSON.stringify
  };
  const preamble = tables.map(extractConst)
    .concat(deps.map((d) => 'const ' + d + ' = ' + extractSource(d) + ';'))
    .join('\n');
  const log = (...a) => { if (sink) sink.push(a.join(' ')); };
  return new Function('JSON', 'logToConsole', preamble + '\nreturn (' + extractSource(name) + ');')(sandboxJSON, log);
}

// Collects the Client's warn lines so the drift alarm can be asserted.
const LOGS = [];

// The value-whitelist helpers and their vocabulary tables come from the source
// too — otherwise the harness would silently test a different function than the
// Client runs.
const botFieldsFromResponse = extractFn(
  'botFieldsFromResponse', ['botEnum', 'botScore'],
  ['BOT_BANDS', 'BOT_CATEGORIES', 'BOT_TYPES', 'botDrift'], LOGS
);
const botEnum = extractFn('botEnum', [], ['botDrift']);
const botScore = extractFn('botScore');

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

  test('collapses a widened value to "other" instead of forwarding it', () => {
    // The exact case the value whitelist exists for. A length cap would NOT
    // have caught this — the string is 27 characters.
    const widened = 'asn_spam:AS55967/Baidu/76ip';
    const r = botFieldsFromResponse(JSON.stringify({
      isBot: false, band: widened, primarySignal: widened,
      signals: [{ type: widened, category: widened }]
    }));
    expect(r.band).toBe('other');
    expect(r.primarySignal).toBe('other');
    expect(r.signals[0].type).toBe('other');
    expect(r.signals[0].category).toBe('other');
    // Nothing of the widened payload survives anywhere
    expect(JSON.stringify(r)).not.toContain('AS55967');
    expect(JSON.stringify(r)).not.toContain('Baidu');
  });

  test('passes the contract vocabulary through untouched', () => {
    expect(botFieldsFromResponse('{"isBot":false,"band":"clean"}').band).toBe('clean');
    expect(botFieldsFromResponse('{"isBot":true,"band":"bot"}').band).toBe('bot');
    // `unknown` is NOT part of the service vocabulary — the Client owns it as
    // its "no usable verdict" sentinel, so a service-sent one must not
    // masquerade as our outage marker.
    expect(botFieldsFromResponse('{"isBot":false,"band":"unknown"}').band).toBe('other');
    expect(botFieldsFromResponse('{"isBot":false,"primarySignal":"known_bot"}').primarySignal).toBe('known_bot');
    expect(botFieldsFromResponse(BORDERLINE).signals[0].type).toBe('asn_reputation');
    expect(botFieldsFromResponse(BORDERLINE).signals[0].category).toBe('asn_spam');
  });

  test('botEnum: every whitelisted value round-trips, everything else is "other"', () => {
    for (const v of ['clean', 'suspicious', 'bot', 'unknown']) {
      expect(botEnum(v, { clean: 1, suspicious: 1, bot: 1, unknown: 1 })).toBe(v);
    }
    expect(botEnum('nope', { clean: 1 })).toBe('other');
    expect(botEnum('', { clean: 1 })).toBe('');
    expect(botEnum(42, { clean: 1 })).toBe('');
    // Prototype keys must not count as whitelisted values
    expect(botEnum('toString', { clean: 1 })).toBe('other');
    expect(botEnum('constructor', { clean: 1 })).toBe('other');
  });

  test('botScore clamps to 0..100 and floors, so the field carries a score and nothing else', () => {
    expect(botScore(0)).toBe(0);
    expect(botScore(40)).toBe(40);
    expect(botScore(100)).toBe(100);
    expect(botScore(-5)).toBe(0);
    // Above 100 is a contract violation, not "very suspicious" — clamping it to
    // 100 would hand the most incriminating legal value to a broken response.
    expect(botScore(101)).toBeNull();
    expect(botScore(1e999)).toBeNull();       // +Infinity
    expect(botScore(-1e999)).toBe(0);
    expect(botScore(40.123456789012345)).toBe(40); // ~15 digits of free payload, gone
    expect(botScore(NaN)).toBeNull();
    expect(botScore('40')).toBeNull();
    expect(botScore(undefined)).toBeNull();
  });

  test('an out-of-range score never reaches the payload', () => {
    const r = botFieldsFromResponse('{"isBot":false,"score":1e999,"signals":[{"category":"asn_spam","score":-7.5}]}');
    expect(r.score).toBeUndefined();          // dropped, not clamped to 100
    expect(r.signals[0].score).toBe(0);
    expect(JSON.stringify(r)).not.toContain('null');
  });

  test('a vocabulary collapse is reported — a silent drift would be the same bug class again', () => {
    LOGS.length = 0;
    botFieldsFromResponse('{"isBot":false,"band":"brandNewBand","primarySignal":"brandNewCategory"}');
    expect(LOGS.length).toBe(1);
    expect(LOGS[0]).toContain('outside the known vocabulary');
    expect(LOGS[0]).toContain('2 value(s)');
    // One line per affected request, not per field
    LOGS.length = 0;
    botFieldsFromResponse(CLEAN);
    expect(LOGS.length).toBe(0);
  });

  test('bounds the WORK, not only the output — a length-only object cannot stall /aGTM.js', () => {
    // {"length":50000000} passes the duck-check and never grows `sig`, so the
    // output cap alone would spin 50 million times while /aGTM.js — and with it
    // the GTM load — waits. ~40 bytes of response body.
    const start = performance.now();
    const r = botFieldsFromResponse('{"isBot":false,"signals":{"length":50000000}}');
    const ms = performance.now() - start;
    expect(r.signals).toEqual([]);
    expect(ms).toBeLessThan(50);
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

  test('every "no verdict" path is marked, and the three causes stay apart', () => {
    // "unknown" alone lumps together "the filter is down", "the filter answered
    // garbage" and "we never asked because the IP header did not resolve" —
    // three situations an operator has to respond to differently.
    expect(SRC).toContain("band: 'unknown', reason: 'no_answer'");
    expect(SRC).toContain("band: 'unknown', reason: 'bad_answer'");
    expect(SRC).toContain("band: 'unknown', reason: 'no_client_ip'");
  });

  test('a bot seen under "mark" is logged server-side, not only in debug', () => {
    // The browser cannot measure the mark phase: a webGTM variable is only read
    // when a tag fires, and tags need GTM, and GTM needs consent. Marked
    // visitors who never answer the CMP contribute nothing.
    expect(SRC).toContain("Bot detected (mark mode - served anyway)");
    const i = SRC.indexOf("Bot detected (mark mode");
    // must not be inside a CFG.debug branch
    expect(SRC.slice(SRC.lastIndexOf('\n', SRC.lastIndexOf('\n', i) - 1), i)).not.toContain('CFG.debug');
  });

  test('the mode travels with the verdict — otherwise "mark" is invisible', () => {
    expect(SRC).toContain('botState.verdict.mode = CFG.botCheckMode;');
  });

  test('"mark" also refuses to block on the missing-client-IP path', () => {
    // This branch used to send 403 unconditionally, which made the field's own
    // help text ("nothing is blocked") untrue for exactly the visitors whose IP
    // header fails to resolve.
    expect(SRC).toContain("const botNoIpBlocks = CFG.botCheckMode === 'block';");
    expect(SRC).toContain('if (!clientIP && botNoIpBlocks) {');
    expect(SRC).toContain('} else if (!clientIP) {');
  });

  test('mark + passthrough off is warned about instead of running as a silent no-op', () => {
    expect(SRC).toContain("CFG.botCheckMode === 'mark' && !CFG.botCheckExpose");
  });

  test('buildAndSend is declared before its callers (no forward reference)', () => {
    // A `const` function expression referenced before its declaration is a
    // temporal-dead-zone error. Every synchronous serve path (no Session API,
    // or an empty session uid) reached buildAndSend that way and killed the
    // whole /aGTM.js response; only the async path masked it.
    const decl = SRC.indexOf('const buildAndSend = function(');
    const firstCall = SRC.indexOf('buildAndSend(sessionData)');
    expect(decl).toBeGreaterThan(-1);
    expect(firstCall).toBeGreaterThan(-1);
    expect(decl).toBeLessThan(firstCall);
    // and before both of its indirect callers
    expect(decl).toBeLessThan(SRC.indexOf('const afterBotCheck = function('));
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
