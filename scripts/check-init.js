// check-init.js — strips comments from aGTM.js and checks for active aGTM.f.init() call.
// Called by build.sh. Writes "found" to stdout if an uncommented init() is detected.
import { readFileSync } from 'fs';

let code = readFileSync('aGTM.js', 'utf8');
code = code.replace(/\/\*[\s\S]*?\*\//g, '');
code = code.replace(/\/\/.*/g, '');
if (/aGTM\.f\.init\s*\(\s*\)/.test(code)) process.stdout.write('found');
