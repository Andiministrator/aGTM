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
  { re: /\bArray\.isArray\b/, what: 'Array.isArray', why: 'not available — duck-check `typeof x.length === "number"` instead' },
  { re: /\bparseInt\s*\(/, what: 'parseInt', why: 'not available — require("makeInteger")' },
  { re: /\bparseFloat\s*\(/, what: 'parseFloat', why: 'not available — require("makeNumber")' },
  { re: /\bDate\s*\.\s*now\s*\(/, what: 'Date.now', why: 'not available — require("getTimestampMillis")' },
  { re: /\bnew\s+Date\b/, what: 'new Date', why: 'not available — require("getTimestampMillis")' },
  { re: /\bMath\s*\.\s*random\s*\(/, what: 'Math.random', why: 'not available — require("generateRandom")' },
  { re: /\bisNaN\s*\(/, what: 'isNaN', why: 'not available — use the `v !== v` self-comparison' },
  { re: /\bInfinity\b/, what: 'Infinity', why: 'no precedent in this file — express the bound arithmetically' },
  // NOTE: this one is checked against comment-stripped-but-string-KEPT source
  // (see `noComments` below). Stripping strings first turns `'blocked' in obj`
  // into `'' in obj` and the rule stops matching — which is exactly how a
  // mutation slipped past the first version of this lint.
  { re: /(?:^|[^.\w])(['"])[\w$]+\1\s+in\s+/, what: "'key' in obj", why: 'the parser rejects the `in` membership operator — use typeof obj.k !== "undefined"', keepStrings: true },
  { re: /=>/, what: 'arrow function', why: 'not supported by the sandbox parser' },
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
        const m = subject.match(rule.re);
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
      const used = [...src.matchAll(/require\('([^']+)'\)/g)].map((m) => m[1]);
      expect(used.length).toBeGreaterThan(0);
      const unknown = used.filter((n) => !KNOWN.has(n));
      expect(unknown).toEqual([]);
    });
  }
});
