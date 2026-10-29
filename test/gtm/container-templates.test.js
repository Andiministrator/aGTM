// test/gtm/container-templates.test.js — drift guard for gtm/aGTM-container-template-*.json.
//
// Both container exports embed copies of this repo's templates. build.sh re-syncs them via
// scripts/update-container-templates.js; this test fails when a template (or the library blob in
// sgtmClient/template.tpl) changed without that sync, instead of shipping a stale export (F-46).
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { CONTAINER_FILES, checkContainer } from '../../scripts/container-templates-lib.js';

describe('container templates embed the current repo templates', () => {
  for (const file of CONTAINER_FILES) {
    const json = JSON.parse(readFileSync(file, 'utf8'));
    test(`${file} embeds at least one template`, () => {
      expect((json.containerVersion.customTemplate || []).length).toBeGreaterThan(0);
    });
    test(`${file}: every custom-template type used by a tag, variable or client is embedded`, () => {
      const cv = json.containerVersion;
      const types = new Set((cv.customTemplate || []).map((t) => `cvt_${cv.containerId}_${t.templateId}`));
      const missing = [...(cv.tag || []), ...(cv.variable || []), ...(cv.client || [])]
        .filter((o) => /^cvt_/.test(o.type) && !types.has(o.type)).map((o) => o.name);
      expect(missing).toEqual([]);
    });
    for (const r of checkContainer(file, json)) {
      test(`${file}: "${r.name}" equals ${r.source} (run ./build.sh)`, () => {
        expect(r.stale).toBe(false);
      });
    }
  }
});
