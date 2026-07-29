// test/sgtm/sandbox-lint.test.js — the GTM server sandbox's LANGUAGE rules.
//
// serve-paths.test.js runs the Client source in Node against stubbed server
// APIs. That catches ordering and logic, but Node is not the sandbox: it happily
// executes `try/catch`, `parseInt`, `Array.isArray` and `'k' in obj`, all of
// which the sandbox rejects. A QA round proved the gap by mutating each of them
// into the source and watching the whole suite stay green.
//
// So this file lints the source text instead. It is deliberately blunt: the cost
// of a false positive is one comment; the cost of a miss is a container that
// will not import, or one that dies at runtime for every visitor.
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dir, '..', '..');
const FILES = {
  'sgtmClient/src/aGTM-sGTM-Client-jsSourceCode.js':
    readFileSync(join(ROOT, 'sgtmClient/src/aGTM-sGTM-Client-jsSourceCode.js'), 'utf8')
};

/**
 * Strip comments and string/template literals, so a rule name mentioned in prose
 * ("we cannot use parseInt here") is not reported as a violation. Blunt but
 * sufficient: the source has no regex literals containing quotes.
 */
function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
}

const BANNED = [
  { re: /\btry\s*\{/, what: 'try/catch', why: 'the sandbox has no exception handling — a throw kills the whole response' },
  { re: /\bcatch\s*\(/, what: 'catch()', why: 'the sandbox has no exception handling' },
  { re: /\bArray\s*(?:\.\s*isArray\b|\[\s*['"]isArray['"]\s*\])/, what: 'Array.isArray', why: 'not available — duck-check `typeof x.length === "number"` instead', keepStrings: true },
  // Bare mention, not just a call — `const pI = parseInt` aliased past a
  // call-shaped pattern in a mutation test.
  { re: /\bparseInt\b/, what: 'parseInt', why: 'not available — require("makeInteger")' },
  { re: /\bparseFloat\b/, what: 'parseFloat', why: 'not available — require("makeNumber")' },
  { re: /\bDate\s*(?:\.\s*now\b|\[)/, what: 'Date.now', why: 'not available — require("getTimestampMillis")' },
  { re: /\bnew\s+Date\b/, what: 'new Date', why: 'not available — require("getTimestampMillis")' },
  { re: /\bMath\s*\.\s*random\s*\(/, what: 'Math.random', why: 'not available — require("generateRandom")' },
  { re: /\bisNaN\s*\(/, what: 'isNaN', why: 'not available — use the `v !== v` self-comparison' },
  { re: /\bInfinity\b/, what: 'Infinity', why: 'no precedent in this file — express the bound arithmetically' },
  // NOTE: this one is checked against comment-stripped-but-string-KEPT source
  // (see `noComments` below). Stripping strings first turns `'blocked' in obj`
  // into `'' in obj` and the rule stops matching — which is exactly how a
  // mutation slipped past the first version of this lint.
  { re: /(?:^|[^.\w])(?:(['"])[\w$]+\1|[\w$]+)\s+in\s+[\w$]/, what: 'the `in` membership operator', why: 'the parser rejects `in` outside of for-in — use typeof obj.k !== "undefined"', keepStrings: true, allow: /\bfor\s*\(/ },
  { re: /=>/, what: 'arrow function', why: 'not supported by the sandbox parser' },
  // NOT linted: multi-line ternaries and boolean chains. The project notes warn
  // about them, and a real parser break was once traced to that shape — but the
  // blanket rule is demonstrably false: `hasRequiredConsent` (src ~line 99) is a
  // three-line `||` chain that has been importing and running in a live
  // container for months. A lint rule that flags working production code costs
  // more than it saves, and rewriting proven code to satisfy an unproven rule
  // would be the wrong way round. If the exact breaking shape is ever pinned
  // down, add a rule for THAT shape.
  { re: /`/, what: 'template literal', why: 'not supported by the sandbox parser' }
];

describe('sGTM Client — server sandbox language rules', () => {
  for (const [name, src] of Object.entries(FILES)) {
    const stripped = code(src);
    // Comments removed, string literals intact — for rules whose pattern lives
    // partly inside a quoted token.
    const noComments = src
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

    for (const rule of BANNED) {
      test(`${name}: no ${rule.what}`, () => {
        const subject = rule.keepStrings ? noComments : stripped;
        let m = subject.match(rule.re);
        // Some rules have a legitimate sibling form (for-in is allowed, the
        // `in` operator is not) — re-scan past allowed hits.
        if (m && rule.allow) {
          const re = new RegExp(rule.re.source, 'g');
          m = null;
          let hit;
          while ((hit = re.exec(subject)) !== null) {
            const before = subject.slice(Math.max(0, hit.index - 12), hit.index + hit[0].length);
            if (!rule.allow.test(before)) { m = hit; break; }
          }
        }
        if (m) {
          const line = subject.slice(0, m.index).split('\n').length;
          throw new Error(`${rule.what} at line ~${line}: ${rule.why}`);
        }
        expect(m).toBeNull();
      });
    }

    test(`${name}: every required() API is a known server-sandbox API`, () => {
      // A typo or an invented API name only shows up when GTM refuses the
      // import — worth catching here.
      const KNOWN = new Set([
        'claimRequest', 'computeEffectiveTldPlusOne', 'decodeUri', 'decodeUriComponent',
        'encodeUri', 'encodeUriComponent', 'extractEventsFromMpv1', 'extractEventsFromMpv2',
        'fromBase64', 'generateRandom', 'getAllEventData', 'getClientName', 'getCookieValues',
        'getEventData', 'getGoogleAuth', 'getRemoteAddress', 'getRequestBody', 'getRequestHeader',
        'getRequestMethod', 'getRequestPath', 'getRequestQueryParameter', 'getRequestQueryParameters',
        'getTimestamp', 'getTimestampMillis', 'getType', 'hmacSha256', 'isRequestMpv1',
        'isRequestMpv2', 'JSON', 'logToConsole', 'makeInteger', 'makeNumber', 'makeString',
        'makeTableMap', 'Math', 'Object', 'parseUrl', 'Promise', 'returnResponse', 'runContainer',
        'sendEventToGoogleAnalytics', 'sendHttpGet', 'sendHttpRequest', 'sendPixelFromBrowser',
        'setCookie', 'setPixelResponse', 'setResponseBody', 'setResponseHeader', 'setResponseStatus',
        'sha256', 'sha256Sync', 'templateDataStorage', 'testRegex', 'toBase64'
      ]);
      // Both quote styles — a mutation used require("…") to slip past.
      const used = [...src.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
      expect(used.length).toBeGreaterThan(0);
      const unknown = used.filter((n) => !KNOWN.has(n));
      expect(unknown).toEqual([]);
    });
  }
});
