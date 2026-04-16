// update-sgtm-template.js — injects the current aGTM.base64 content and version
// into sgtmClient/template.tpl. Called by build.sh after aGTM.base64 is generated.

import { readFileSync, writeFileSync } from 'fs';

const TEMPLATE_PATH  = 'sgtmClient/template.tpl';
const BASE64_PATH    = 'aGTM.base64';
const AGTM_JS_PATH   = 'aGTM.js';

// ── Read inputs ────────────────────────────────────────────────────────────

const newBase64  = readFileSync(BASE64_PATH,   'utf8').trim();
const template   = readFileSync(TEMPLATE_PATH, 'utf8');
const agtmSource = readFileSync(AGTM_JS_PATH,  'utf8');

// ── Extract version from aGTM.js ───────────────────────────────────────────

const versionMatch = agtmSource.match(/@version\s+([\d.]+)/);
if (!versionMatch) {
  process.stderr.write('ERROR: Could not find @version in aGTM.js\n');
  process.exit(1);
}
const version = versionMatch[1];

// ── Replace base64 payload ─────────────────────────────────────────────────

const b64Pattern = /const agtm = fromBase64\('[A-Za-z0-9+/=]+'\);/;
if (!b64Pattern.test(template)) {
  process.stderr.write('ERROR: Could not find fromBase64(...) line in ' + TEMPLATE_PATH + '\n');
  process.exit(1);
}
let updated = template.replace(b64Pattern, "const agtm = fromBase64('" + newBase64 + "');");

// ── Replace displayName version ────────────────────────────────────────────

const verPattern = /"displayName":\s*"aGTM v[\d.]+"/;
if (verPattern.test(updated)) {
  updated = updated.replace(verPattern, '"displayName": "aGTM v' + version + '"');
}

// ── Write result ───────────────────────────────────────────────────────────

writeFileSync(TEMPLATE_PATH, updated, 'utf8');
process.stdout.write('  Updated: sgtmClient/template.tpl (aGTM v' + version + ', ' + newBase64.length + ' bytes base64)\n');
