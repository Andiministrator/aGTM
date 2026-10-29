// container-templates-lib.js — shared by scripts/update-container-templates.js (writer)
// and test/gtm/container-templates.test.js (drift guard).
//
// gtm/aGTM-container-template-web.json and gtm/aGTM-container-template-server.json are
// GTM container exports that EMBED copies of this repo's templates (customTemplate[].templateData).
// They are not exported from a GTM UI on every change, so without a sync the embedded copies go
// stale on the next template edit or library build — the server template carries the whole
// sgtmClient/template.tpl, including the base64 library blob that build.sh rewrites. That was the
// F-46 pattern with the 2025 workspace export.

import { readFileSync } from 'fs';

export const CONTAINER_FILES = ['gtm/aGTM-container-template-web.json', 'gtm/aGTM-container-template-server.json'];

// Embedded template name → repo source. A name in a container file without an entry here is an
// error (the writer and the guard both fail), so a new embedded template cannot slip past.
export const TEMPLATE_SOURCES = {
  'aGTM - Consent Mode': 'gtm/tags/consent-mode/aGTM tag - Consent Mode.tpl',
  'aGTM - DL Repeat': 'gtm/tags/dl-repeat/aGTM tag - DL Repeat.tpl',
  'aGTM - Form Events': 'gtm/tags/form-events/aGTM tag - Form Events.tpl',
  'aGTM - Scroll Events': 'gtm/tags/scroll-events/aGTM tag - Scroll Events.tpl',
  'aGTM - Timer Events': 'gtm/tags/timer-events/aGTM tag - Timer Events.tpl',
  'aGTM - Copy Events': 'gtm/tags/copy-events/aGTM tag - Copy Events.tpl',
  'aGTM - Click Events': 'gtm/tags/click-events/aGTM tag - Click Events.tpl',
  'aGTM var - Consent Check': 'gtm/variables/consent-check/aGTM var - Consent Check.tpl',
  'aGTM var - Consent Info': 'gtm/variables/consent-info/aGTM var - Consent Info.tpl',
  'aGTM v1.5': 'sgtmClient/template.tpl',
};

// The repo files carry a BOM and CRLF in places; GTM stores templateData without BOM and with LF.
export function repoTemplateData(path) {
  return readFileSync(path, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
}

// Returns [{ file, name, source, stale }] for every embedded template; throws on an unmapped name.
export function checkContainer(file, json) {
  const cv = json.containerVersion;
  return (cv.customTemplate || []).map((t) => {
    const source = TEMPLATE_SOURCES[t.name];
    if (!source) throw new Error(`${file}: embedded template "${t.name}" has no entry in TEMPLATE_SOURCES`);
    return { file, name: t.name, source, stale: t.templateData !== repoTemplateData(source) };
  });
}
