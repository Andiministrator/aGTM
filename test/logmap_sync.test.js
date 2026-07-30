// test/logmap_sync.test.js — every log id the code emits must be decodable, in
// BOTH decode tables.
//
// aGTM.f.log(id, obj) only stores the id; the human-readable text lives in two
// hand-maintained copies: aGTM.d.logmap in aGTM_debug.js and window.AGTM_LOGMAP in
// devtools-extension/logmap.js (the Inspector's Events tab decodes aGTM.l with it).
// An id that exists in neither shows up as an undecodable entry in the console
// helper and in the Inspector — the F-128 round had to add eight of those after the
// fact. This test turns that class of drift into a red test instead of a silent gap.
import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync } from 'fs';

// Ids emitted from the library and every CMP adapter: aGTM.f.log('<id>', …).
function emittedIds() {
  const files = ['aGTM.js', ...readdirSync('cmp')
    .filter(f => f.endsWith('.js') && !f.endsWith('.min.js'))
    .map(f => 'cmp/' + f)];
  const ids = new Map(); // id -> first file that emits it
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    const re = /aGTM\.f\.log\(\s*["']([A-Za-z0-9_]+)["']/g;
    let m;
    while ((m = re.exec(src)) !== null) if (!ids.has(m[1])) ids.set(m[1], file);
  }
  return ids;
}

// Keys of an object literal in a source file, read as text — neither file is a
// module, and evaluating them would need the whole browser-global setup.
function mapKeys(file, marker) {
  const src = readFileSync(file, 'utf8');
  const start = src.indexOf(marker);
  expect(start).toBeGreaterThan(-1);
  const end = src.indexOf('\n};', start);
  expect(end).toBeGreaterThan(start);
  const body = src.slice(start, end);
  const keys = new Set();
  const re = /^\s*[,]?\s*([A-Za-z0-9_]+)\s*:\s*\{/gm;
  let m;
  while ((m = re.exec(body)) !== null) keys.add(m[1]);
  return keys;
}

describe('log id decode tables', () => {
  const emitted  = emittedIds();
  const debugMap = mapKeys('aGTM_debug.js', 'aGTM.d.logmap = aGTM.d.logmap ||');
  const panelMap = mapKeys('devtools-extension/logmap.js', 'window.AGTM_LOGMAP =');

  test('the parser actually found the tables and the emitted ids', () => {
    expect(emitted.size).toBeGreaterThan(15);
    expect(debugMap.size).toBeGreaterThan(15);
    expect(panelMap.size).toBeGreaterThan(15);
  });

  test('every emitted id is decodable in aGTM_debug.js', () => {
    const missing = [...emitted].filter(([id]) => !debugMap.has(id))
      .map(([id, file]) => id + ' (from ' + file + ')');
    expect(missing).toEqual([]);
  });

  test('every emitted id is decodable in the Inspector logmap', () => {
    const missing = [...emitted].filter(([id]) => !panelMap.has(id))
      .map(([id, file]) => id + ' (from ' + file + ')');
    expect(missing).toEqual([]);
  });

  test('both tables carry the same ids (the Inspector copy is verbatim)', () => {
    expect([...debugMap].filter(id => !panelMap.has(id)).sort()).toEqual([]);
    expect([...panelMap].filter(id => !debugMap.has(id)).sort()).toEqual([]);
  });
});
