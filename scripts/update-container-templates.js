// update-container-templates.js — re-syncs the templates embedded in the container exports
// gtm/aGTM-container-template-*.json from their repo sources. Called by build.sh after
// update-sgtm-template.js (which rewrites the library blob inside sgtmClient/template.tpl).
// Only templateData changes; the tags, triggers and variables of the exports stay as they are.

import { readFileSync, writeFileSync } from 'fs';
import { CONTAINER_FILES, checkContainer, repoTemplateData } from './container-templates-lib.js';

let changed = 0;
for (const file of CONTAINER_FILES) {
  const json = JSON.parse(readFileSync(file, 'utf8'));
  const stale = checkContainer(file, json).filter((r) => r.stale);
  if (!stale.length) continue;
  for (const t of json.containerVersion.customTemplate) {
    const r = stale.find((s) => s.name === t.name);
    if (r) t.templateData = repoTemplateData(r.source);
  }
  writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
  changed += stale.length;
  console.log(`  ${file}: ${stale.map((s) => s.name).join(', ')}`);
}
console.log(changed ? `OK: ${changed} embedded template(s) re-synced` : 'OK: container templates already in sync');
