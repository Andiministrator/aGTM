// update-sgtm-template.js — injects the current aGTM.base64 content and version
// into sgtmClient/template.tpl. Called by build.sh after aGTM.base64 is generated.
//
// It ALSO injects the same base64 blob into the human-readable client source
// sgtmClient/src/aGTM-sGTM-Client-jsSourceCode.js. That file must stay
// byte-identical to the template's ___SANDBOXED_JS_FOR_SERVER___ block (the
// sandbox-sync invariant — see CLAUDE.md / Memory sgtm-client-source-template-
// sync). The blob is the only line that differs across a library rebuild, so
// syncing it here keeps source and template from drifting (was F-43).

import { readFileSync, writeFileSync } from 'fs';

const TEMPLATE_PATH   = 'sgtmClient/template.tpl';
const CLIENT_SRC_PATH = 'sgtmClient/src/aGTM-sGTM-Client-jsSourceCode.js';
const BASE64_PATH     = 'aGTM.base64';
const AGTM_JS_PATH    = 'aGTM.js';

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

// ── Build client-source output (same base64 blob → byte-identical block) ────

const clientUpdated = clientSrc.replace(b64Pattern, b64Replacer);

// ── Write both ──────────────────────────────────────────────────────────────

writeFileSync(TEMPLATE_PATH, updated, 'utf8');
process.stdout.write('  Updated: sgtmClient/template.tpl (aGTM v' + version + ', ' + newBase64.length + ' bytes base64)\n');

if (clientUpdated !== clientSrc) {
  writeFileSync(CLIENT_SRC_PATH, clientUpdated, 'utf8');
  process.stdout.write('  Updated: ' + CLIENT_SRC_PATH + ' (base64 blob re-synced)\n');
} else {
  process.stdout.write('  In sync: ' + CLIENT_SRC_PATH + ' (base64 blob already current)\n');
}
