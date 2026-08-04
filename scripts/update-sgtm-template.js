// update-sgtm-template.js — injects the current aGTM.base64 content and version
// into sgtmClient/template.tpl. Called by build.sh after aGTM.base64 is generated.
//
// It ALSO injects the same base64 blob into the human-readable client source
// sgtmClient/src/aGTM-sGTM-Client-jsSourceCode.js. That file must stay
// byte-identical to the template's ___SANDBOXED_JS_FOR_SERVER___ block (the
// sandbox-sync invariant — see CLAUDE.md / Memory sgtm-client-source-template-
// sync). The blob is the only line that differs across a library rebuild, so
// syncing it here keeps source and template from drifting (was F-43).
//
// It FURTHER re-syncs the embedded CMP consent_check codes: the template's
// "Used CMP (Consent Tool)" SELECT field carries one minified consent_check
// function per CMP as its option `value` — the production copy the sGTM Client
// injects inline into /aGTM.js for Client users. Nothing rebuilt these from
// cmp/*.min.js, so CMP fixes (e.g. the F-51 comma strip) never reached Client
// users until a manual patch — F-52, analogous to the F-43 base64 drift. This
// script regenerates every embedded value from the freshly minified cmp/*.min.js
// so a `./build.sh` keeps them in lockstep. The values live ONLY in
// ___TEMPLATE_PARAMETERS___ (the SELECT UI) — the sandboxed server block reads
// the selected value at runtime — so this is a template-only sync.

import { readFileSync, writeFileSync } from 'fs';
import {
  CMP_MAP, extractConsentCheck, gtmEncodeString, escapeRegExp, parseTemplateCmpItems,
} from './cmp-sync-lib.js';

const TEMPLATE_PATH   = 'sgtmClient/template.tpl';
const CLIENT_SRC_PATH = 'sgtmClient/src/aGTM-sGTM-Client-jsSourceCode.js';
const BASE64_PATH     = 'aGTM.base64';
const AGTM_JS_PATH    = 'aGTM.js';

// Regenerate every embedded consent_check value in `tpl` from cmp/*.min.js.
// Returns { output, changed: [displayValues] }. Uses the shared CMP_MAP so the
// mapping cannot drift from the test-side drift guard (see cmp-sync-lib.js).
function syncCmpCodes(tpl) {
  // Guard: every embedded CMP must have a mapping (catches new/renamed options).
  var items = parseTemplateCmpItems(tpl);
  if (!items) {
    process.stderr.write('ERROR: cmp SELECT field not found in ' + TEMPLATE_PATH + '\n');
    process.exit(1);
  }
  var unmapped = items
    .map(function (it) { return it.displayValue; })
    .filter(function (dv) { return !(dv in CMP_MAP); });
  if (unmapped.length) {
    process.stderr.write('ERROR: template CMP option(s) without a CMP_MAP entry (F-52 drift guard): '
      + unmapped.join(', ') + '\n');
    process.exit(1);
  }

  var output = tpl;
  var changed = [];
  Object.keys(CMP_MAP).forEach(function (dv) {
    var file = 'cmp/' + CMP_MAP[dv] + '.min.js';
    var min;
    try {
      min = readFileSync(file, 'utf8');
    } catch (e) {
      process.stderr.write('ERROR: cannot read ' + file + ' for CMP "' + dv
        + '" (stale CMP_MAP?): ' + e.message + '\n');
      process.exit(1);
    }
    var extracted = extractConsentCheck(min);
    if (extracted === null) {
      process.stderr.write('ERROR: consent_check marker not found in ' + file + '\n');
      process.exit(1);
    }
    var newValue = gtmEncodeString(extracted);

    // Anchor on the displayValue that immediately follows the value in each
    // selectItem object, so the replacement is unambiguous and touches nothing
    // else. [^"\\]|\\. matches any JSON-escaped string content.
    var re = new RegExp('("value":\\s*")((?:\\\\.|[^"\\\\])*)("\\s*,\\s*"displayValue":\\s*"'
      + escapeRegExp(dv) + '")');
    if (!re.test(output)) {
      process.stderr.write('ERROR: could not locate embedded value for CMP "' + dv
        + '" in ' + TEMPLATE_PATH + ' (stale CMP_MAP?)\n');
      process.exit(1);
    }
    var oldValue = output.match(re)[2];
    if (oldValue !== newValue) changed.push(dv);
    // Function replacer: the value may contain `$` sequences ($&, $1, …) that the
    // string form of replace would interpret.
    output = output.replace(re, function (_m, pre, _old, post) {
      return pre + newValue + post;
    });
  });
  return { output: output, changed: changed };
}

// ── Read inputs ────────────────────────────────────────────────────────────

const newBase64  = readFileSync(BASE64_PATH,   'utf8').trim();
const template   = readFileSync(TEMPLATE_PATH, 'utf8');
const clientSrc  = readFileSync(CLIENT_SRC_PATH, 'utf8');
const agtmSource = readFileSync(AGTM_JS_PATH,  'utf8');

// ── Extract version from aGTM.js ───────────────────────────────────────────

const versionMatch = agtmSource.match(/@version\s+([\d.a-zA-Z-]+)/);
if (!versionMatch) {
  process.stderr.write('ERROR: Could not find @version in aGTM.js\n');
  process.exit(1);
}
const version = versionMatch[1];

// ── Validate BOTH files carry the base64 blob line BEFORE writing anything ──
// (validate-both-then-write-both avoids advancing template.tpl while the source
// is left behind on a missing-line error — no transient one-file drift.)

const b64Pattern = /const agtm = fromBase64\('[A-Za-z0-9+/=]+'\);/;
if (!b64Pattern.test(template)) {
  process.stderr.write('ERROR: Could not find fromBase64(...) line in ' + TEMPLATE_PATH + '\n');
  process.exit(1);
}
if (!b64Pattern.test(clientSrc)) {
  process.stderr.write('ERROR: Could not find fromBase64(...) line in ' + CLIENT_SRC_PATH + '\n');
  process.exit(1);
}

// Callback replacement form so the base64 payload is inserted literally — the
// string form of String.replace treats `$` sequences specially. The standard
// base64 alphabet never contains `$`, but the callback keeps this robust if the
// encoding ever changes.
const b64Line = "const agtm = fromBase64('" + newBase64 + "');";
const b64Replacer = function () { return b64Line; };

// ── Build template output (base64 + displayName version) ────────────────────

let updated = template.replace(b64Pattern, b64Replacer);
const verPattern = /"displayName":\s*"aGTM v[\d.a-zA-Z-]+"/;
if (verPattern.test(updated)) {
  updated = updated.replace(verPattern, '"displayName": "aGTM v' + version + '"');
}

// The same version once more, as a code constant this time: the Client serves it
// as the `x-agtm-version` response header, which is the only way to ask a live
// container which version it runs. It sat in the file unsynced (and unused) until
// 2026-08-04, so a bump would have moved the displayName while the header kept
// reporting the previous release — worse than no header at all. Lives in BOTH
// files, so it is replaced in both.
const codeVerPattern = /const aGTMversion = "[\d.a-zA-Z-]+";/;
const codeVerLine = 'const aGTMversion = "' + version + '";';
if (!codeVerPattern.test(updated) || !codeVerPattern.test(clientSrc)) {
  process.stderr.write('ERROR: Could not find `const aGTMversion = "..."` in template and/or client source\n');
  process.exit(1);
}
updated = updated.replace(codeVerPattern, function () { return codeVerLine; });

// ── Re-sync embedded CMP consent_check codes from cmp/*.min.js (F-52) ────────
const cmp = syncCmpCodes(updated);
updated = cmp.output;
if (cmp.changed.length) {
  process.stdout.write('  Re-synced ' + cmp.changed.length + ' embedded CMP consent_check code(s): '
    + cmp.changed.join(', ') + '\n');
} else {
  process.stdout.write('  In sync: all ' + Object.keys(CMP_MAP).length + ' embedded CMP consent_check codes\n');
}

// ── Build client-source output (same base64 blob → byte-identical block) ────

const clientUpdated = clientSrc
  .replace(b64Pattern, b64Replacer)
  .replace(codeVerPattern, function () { return codeVerLine; });

// ── Write both ──────────────────────────────────────────────────────────────

writeFileSync(TEMPLATE_PATH, updated, 'utf8');
process.stdout.write('  Updated: sgtmClient/template.tpl (aGTM v' + version + ', ' + newBase64.length + ' bytes base64)\n');

if (clientUpdated !== clientSrc) {
  writeFileSync(CLIENT_SRC_PATH, clientUpdated, 'utf8');
  process.stdout.write('  Updated: ' + CLIENT_SRC_PATH + ' (base64 blob re-synced)\n');
} else {
  process.stdout.write('  In sync: ' + CLIENT_SRC_PATH + ' (base64 blob already current)\n');
}
