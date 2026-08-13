#!/usr/bin/env node
/**
 * Prints the part of a built cmp/cc_<name>.min.js that belongs into the sGTM
 * Client's "Your Code for CMP Check" field: everything from
 * `aGTM.f.consent_check=function` onward.
 *
 * The leading namespace bootstrap (`window.aGTM=…`) is dropped because the
 * Client has already initialised the aGTM object — the same rule the build uses
 * when it syncs the embedded copies into template.tpl (see scripts/cmp-sync-lib.js).
 *
 * This exists so nobody hand-copies that snippet again: a hand-made copy has no
 * drift guard, and the next adapter fix would leave it stale and unnoticed.
 *
 *   node scripts/extract-cmp-for-sgtm.js onetrust_cookiepro
 *   node scripts/extract-cmp-for-sgtm.js onetrust_cookiepro > tmp/onetrust.js
 */
const fs = require('fs');
const name = process.argv[2];
if (!name) {
  console.error('usage: node scripts/extract-cmp-for-sgtm.js <cmp-name>   (e.g. onetrust_cookiepro)');
  process.exit(1);
}
const file = 'cmp/cc_' + name + '.min.js';
if (!fs.existsSync(file)) {
  console.error('not found: ' + file + ' — run ./build.sh first, or check the name');
  process.exit(1);
}
const src = fs.readFileSync(file, 'utf8').trim();
const marker = 'aGTM.f.consent_check=function';
const i = src.indexOf(marker);
if (i < 0) {
  console.error('marker not found in ' + file + ': ' + marker);
  process.exit(1);
}
process.stdout.write(src.slice(i) + '\n');
