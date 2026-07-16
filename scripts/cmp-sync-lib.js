// cmp-sync-lib.js — pure, side-effect-free helpers for the embedded-CMP-code
// sync (F-52). Shared by scripts/update-sgtm-template.js (the writer, run from
// build.sh) and test/cmp/template-sync.test.js (the drift guard) so the CMP
// mapping and the extract/encode rules live in exactly ONE place and cannot
// drift apart.

import { readFileSync } from 'fs';

// Maps each SELECT option's displayValue (the human-readable CMP name shown in
// the GTM UI) to its cmp/cc_<name>.min.js source. Empirically verified: for a
// CMP already in sync, the min.js — with its namespace-bootstrap prefix stripped
// (see CMP_MARK) — round-trips byte-identically to the embedded template value.
// Two cmp/ files (cc_jtl_consent, cc_jtl_eu_cookie) are intentionally NOT offered
// as embedded SELECT options and therefore have no entry here.
export const CMP_MAP = {
  'Borlabs v2':                          'cc_borlabs2',
  'Borlabs v3':                          'cc_borlabs3',
  'CCM19':                               'cc_ccm19',
  'Clickkeks':                           'cc_clickskeks',
  'Consentmanager':                      'cc_consentmanager',
  'Cookiebot':                           'cc_cookiebot',
  'CookieFirst':                         'cc_cookiefirst',
  'Klaro!':                              'cc_klaro',
  'Magento CC Cookie':                   'cc_magento_cc_cookie',
  'Matomo Consent Check':                'cc_matomo',
  'OneTrust CookiePro':                  'cc_onetrust_cookiepro',
  'Orestbida Cookie Consent':            'cc_orestbida_cookieconsent',
  'Shopware Acris Cookie':               'cc_shopware_acris_cookie',
  'Simple Cookie RegEx Check':           'cc_simple_cookie_regex_check',
  'Sourcepoint':                         'cc_sourcepoint',
  'Tramino':                             'cc_tramino',
  'Usercentrics v2':                     'cc_usercentrics',
  'Usercentrics v3 and newer Cookiebot': 'cc_usercentrics3',
  'Shopify Consent Tool':                'cc_shopify_consent',
  'Perspective Funnel Consent Banner':   'cc_perspectivefunnel',
  'Secure Privacy':                      'cc_secure_privacy',
  'Shopware 5 Cookie':                   'cc_shopware5_cookie',
  'Shopware 6 Cookie':                   'cc_shopware6_cookie',
};

// The embedded value starts at the consent_check assignment — the min.js
// namespace-bootstrap prefix (window.aGTM=…,aGTM.n=aGTM.n||{},) is dropped
// because the sGTM Client has already initialised the aGTM object.
export const CMP_MARK = 'aGTM.f.consent_check=function';

// Extract the consent_check body (from CMP_MARK to end, trailing whitespace
// trimmed) out of a minified cmp file's contents. Returns null if the marker
// is absent (callers decide how loud to be about that).
export function extractConsentCheck(minSource) {
  const idx = minSource.indexOf(CMP_MARK);
  if (idx < 0) return null;
  return minSource.slice(idx).replace(/\s+$/, '');
}

// Convenience: read cmp/<basename>.min.js and extract its consent_check body.
export function embeddedValueForFile(basename) {
  return extractConsentCheck(readFileSync('cmp/' + basename + '.min.js', 'utf8'));
}

// Re-escape a raw JS string the way GTM serialises .tpl option values: standard
// JSON string escaping PLUS \u00xx for =, &, <, > (GTM's HTML-safety escaping).
// Verified to reproduce every already-synced embedded value byte-for-byte.
export function gtmEncodeString(str) {
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    const code = str.charCodeAt(i);
    if (ch === '\\') out += '\\\\';
    else if (ch === '"') out += '\\"';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (ch === '=') out += '\\u003d';
    else if (ch === '&') out += '\\u0026';
    else if (ch === '<') out += '\\u003c';
    else if (ch === '>') out += '\\u003e';
    else if (code < 0x20) out += '\\u' + code.toString(16).padStart(4, '0');
    else out += ch;
  }
  return out;
}

// Strip a string for safe use inside a RegExp literal.
export function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Parse the cmp SELECT items ({ value, displayValue }) out of a .tpl file's
// text. `value` is JSON-decoded (so it is the actual JS string, escapes
// resolved). Returns null if the field is not present.
export function parseTemplateCmpItems(tpl) {
  const startTok = '___TEMPLATE_PARAMETERS___';
  const start = tpl.indexOf(startTok) + startTok.length;
  const end = tpl.indexOf('___SANDBOXED_JS_FOR_SERVER___');
  const params = JSON.parse(tpl.slice(start, end).trim());
  let found = null;
  (function walk(o) {
    if (found) return;
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (o && typeof o === 'object') {
      if (o.name === 'cmp' && Array.isArray(o.selectItems)) { found = o.selectItems; return; }
      for (const k in o) if (o[k] && typeof o[k] === 'object') walk(o[k]);
    }
  })(params);
  return found;
}
