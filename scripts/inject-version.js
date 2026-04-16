// inject-version.js — reads VERSION file and propagates it to aGTM.js and package.json.
// Called by build.sh as the very first step, before minification.
//
// Updates:
//   aGTM.js     — @version header comment and aGTM.d.version string
//   package.json — version field

import { readFileSync, writeFileSync } from 'fs';

const VERSION_PATH     = 'VERSION';
const AGTM_JS_PATH     = 'aGTM.js';
const PACKAGE_JSON_PATH = 'package.json';

// ── Read version ───────────────────────────────────────────────────────────

const version = readFileSync(VERSION_PATH, 'utf8').trim();
if (!version || !/^[\d]+\.[\d]+(\.[\d]+)?(-[a-zA-Z0-9.]+)?$/.test(version)) {
  process.stderr.write('ERROR: Invalid version in VERSION file: "' + version + '"\n');
  process.stderr.write('       Expected format: 1.6  or  1.6.1  or  1.6-pre\n');
  process.exit(1);
}

// ── Update aGTM.js ─────────────────────────────────────────────────────────

let agtm = readFileSync(AGTM_JS_PATH, 'utf8');

// Replace @version in JSDoc header
const prevVersion = (agtm.match(/@version\s+([\d.a-zA-Z-]+)/) || [])[1] || '?';

agtm = agtm.replace(
  /(@version\s+)[\d.a-zA-Z-]+/,
  '$1' + version
);

// Replace aGTM.d.version string in objinit()
agtm = agtm.replace(
  /(\[aGTM\.d,\s*"version",\s*")[\d.a-zA-Z-]+(")/,
  '$1' + version + '$2'
);

// Update @lastupdate date
const today = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
agtm = agtm.replace(
  /(@lastupdate\s+)[\d.]+(\s+by)/,
  '$1' + today + '$2'
);

writeFileSync(AGTM_JS_PATH, agtm, 'utf8');

// ── Update package.json ────────────────────────────────────────────────────

const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8'));
pkg.version = version;
writeFileSync(PACKAGE_JSON_PATH, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

// ── Report ─────────────────────────────────────────────────────────────────

process.stdout.write('  Version: ' + prevVersion + ' → ' + version + '\n');
