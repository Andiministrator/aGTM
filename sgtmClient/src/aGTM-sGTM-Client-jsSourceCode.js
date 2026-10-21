// ssGTM Doku: https://developers.google.com/tag-platform/tag-manager/server-side/api?hl=de
// aGTM Doku: https://github.com/Andiministrator/aGTM
const aGTMversion = "1.5";

// Fixed path the browser POSTs consent diffs to. The path is hard-coded so
// integrators don't have to assemble a URL — the sGTM Client builds the full
// URL from its own host. Keep in sync with the docs: a path collision with
// another claimed route on the same sGTM host would require patching this
// constant.
const CONSENT_STORE_PATH = '/aGTMconsent';

// Load Libraries
const claimRequest = require('claimRequest');
const setResponseStatus = require('setResponseStatus');
const setResponseHeader = require('setResponseHeader');
const setResponseBody = require('setResponseBody');
const returnResponse = require('returnResponse');
const getRequestPath = require('getRequestPath');
const getRequestMethod = require('getRequestMethod');
const getRequestQueryParameters = require('getRequestQueryParameters');
const getRequestBody = require('getRequestBody');
const sendHttpGet = require('sendHttpGet');
const sendHttpRequest = require('sendHttpRequest');
const getRequestHeader = require('getRequestHeader');
const getRemoteAddress = require('getRemoteAddress');
const getCookieValues = require('getCookieValues');
const setCookie = require('setCookie');
const fromBase64 = require('fromBase64');
const toBase64 = require('toBase64');
const sha256Sync = require('sha256Sync');
const JSON = require('JSON');
const Object = require('Object');
const encodeUriComponent = require('encodeUriComponent');
const logToConsole = require('logToConsole');
const makeInteger = require('makeInteger');
const makeNumber = require('makeNumber');
const makeString = require('makeString');
const generateRandom = require('generateRandom');
const getTimestampMillis = require('getTimestampMillis');
const Math = require('Math');
const computeEffectiveTldPlusOne = require('computeEffectiveTldPlusOne');

// Template config
const CFG = {
  debug: data.debug === true,
  tenantID: data.tenant_id || '',
  sessionApiUrl: data.session_api_url || '',
  // Consent-store route is enabled by default; integrator can disable via the
  // template UI. The route path is fixed (CONSENT_STORE_PATH); the browser-
  // facing URL is assembled from the request host.
  consentStoreEnabled: data.consent_store_enabled !== false,
  cookieMode: data.cookie_mode || 'always',
  consentService: data.consent_service || '',
  consentPurpose: data.consent_purpose || '',
  consentVendor: data.consent_vendor || '',
  // Deliberate opt-out of the F-165 gate: create the user-ID cookie on ANY
  // consent signal although no service/purpose/vendor is required. Only the
  // literal boolean true switches it on.
  cookieNoCondition: data.cookie_without_condition === true,
  cookieName: data.cookie_name || '_tpf',
  cookieLifetimeDays: makeNumber(data.cookie_lifetime || 365),
  cookieDomain: data.cookie_domain || 'auto',
  // F-160/F-189: further hosts whose pages may read this Client's responses with
  // credentials, on top of the cookie domain and its subdomains. Comma-separated;
  // a scheme or path written along is ignored, so "https://shop.example.net/"
  // means shop.example.net. Spaces are dropped by split/join rather than trim():
  // see trimCond below for why this file does not rely on String.prototype.trim.
  corsOrigins: makeString(data.cors_origins || '').split('\n').join(',').split(',').map(function(h) { const x = h.split(' ').join('').split('\u00a0').join('').split('\t').join('').split('\r').join('').toLowerCase(); const i = x.indexOf('://'); return (i >= 0 ? x.substring(i + 3) : x).split('/')[0].split(':')[0]; }).filter(function(h) { return !!h; }),
  fingerprintAllowed: data.fingerprint_allowed !== false,
  sgtmHost: data.sgtm_host || '',
  debugSuffix: data.debug_suffix || '',
  fipLimiter: data.fip_limiter || '$',
  // Server-side auto-denial: when a returning visitor has no recorded consent,
  // the Client constructs a denial-consent block. autoDenyLoadGtm controls
  // whether GTM is allowed to load under that denial. Default true.
  autoDenyLoadGtm: data.auto_deny_load_gtm !== false,
  // Bot check: what to do with a positive verdict, and whether to tell the page
  // about it at all. Normalized against an unset/garbage SELECT (F-29 lesson) —
  // only the literal 'mark' switches off blocking, everything else blocks, so a
  // misconfigured field can never silently disable the filter.
  botCheckMode: data.botCheckMode === 'mark' ? 'mark' : 'block',
  botCheckExpose: data.botCheckExpose !== false,
  // Sources API: POST after the session step on every aGTM.js request. Tenant
  // is reused from tenantID. Disabled by default. Race-free: the session is
  // already committed in Redis when this fires, so api4sources' user_id ->
  // session_id lookup hits. Sequential before buildAndSend — every non-meta
  // field of the response is captured into sessionData (e.g. `source`, the
  // affiliate cookie value by last-cookie-win) so it flows through cfg.session
  // into aGTM.d.session.* (readable in webGTM via a JS variable). With
  // sourcesAttribution on, the POST also requests ?attribution=true&method=...
  // and the returned attribution object is wrapped by method into
  // sessionData.attribution, feeding the library's resolveAttribution HYBRID
  // merge (aGTM.d.attribution[method]). Adds one internal round-trip to /aGTM.js.
  sourcesEnabled: data.sources_enabled === true,
  sourcesApiUrl: data.sources_api_url || '',
  sourcesAttribution: data.sources_attribution === true,
  // sources_method validated against the 5 api4sources methods; a stale or
  // overridden config value falls back to last_touch, otherwise attribution
  // would be requested/wrapped under an invalid method key (F-01).
  sourcesMethod: {last_touch: 1, first_touch: 1, last_click: 1, first_click: 1, last_non_direct_click: 1}[data.sources_method] === 1 ? data.sources_method : 'last_touch',
  // Pre-aGTM Init Code: arbitrary JS prepended verbatim to the /aGTM.js
  // response. Use case: CMP loaders that must define globals before aGTM
  // starts. Must be ES5; no try/catch wrap (silent errors hide bugs).
  preInitEnabled: data.pre_init_enabled === true,
  preInitCode: data.pre_init_code || ''
};

// ── Helper: check comma-delimited consent string ───────────────────────────
const inConsentStr = function(str, val) {
  return !!(val && str && str.indexOf(',' + val + ',') >= 0);
};
// No consent requirement configured at all (F-165). This used to mean "every
// consent signal grants the cookie" — including the essential-only answer most
// CMPs report after "deny all" (measured on CCM19: six "technically necessary"
// services), so a tenant who left the fields empty minted a one-year user-ID
// cookie after a REJECTION. An empty requirement is a blank, not a decision:
// it now grants nothing unless `cookie_without_condition` says otherwise.
const consentConditionMissing = !CFG.consentService && !CFG.consentPurpose && !CFG.consentVendor;
const hasRequiredConsent = function(services, purposes, vendors) {
  if (consentConditionMissing) return CFG.cookieNoCondition;
  return inConsentStr(services, CFG.consentService) ||
         inConsentStr(purposes, CFG.consentPurpose) ||
         inConsentStr(vendors, CFG.consentVendor);
};

// ── F→C user-ID promotion helpers ────────────────────────────────────────────
// Declared up-front because the /aGTMconsent POST handler below references
// them from a DIRECTLY EXECUTED top-level statement, and GTM's sandboxed-JS
// parser rejects that at parse time with "Illegal variable reference before
// declaration" (observed on import, commit d76d073).
//
// Precision matters here, because the two cases fail differently: a forward
// reference from inside a FUNCTION BODY imports fine — it only blows up at
// runtime, when the temporal dead zone is hit on the paths that actually reach
// it. That is what F-130 was: the container imported and ran for a live
// customer for weeks while /aGTM.js was dead for every configuration without a
// Session API. Parse-time rejection is the loud failure; the runtime one is the
// expensive one. Both are avoided by the same rule: helper before caller.

// Generate a stable cookie-based user ID. Format:
//   `C.1{lim}{tenant}{lim}{rand12}.{ms}`
// where `{lim}` is `CFG.fipLimiter` (default `$`).
//
// The literal `C.` prefix is mandated by the api4sgtm /promote endpoint
// (`new_user_id` must start with `"C."` — see
// internal/api/api4sgtm/team-spec.md §"Promote / Migrate session"). After
// the version digit `1` we switch to the configured `fipLimiter` so the
// C-format mirrors the F-format (`F{lim}1{lim}…`) for visual consistency
// in cookies, logs, and analytics dumps. With the default `$` limiter the
// resulting cookie value is e.g. `C.1$cl_example$987654321012.1714900000000`
// — matches the F-side shape `F$1$cl_example$<hash>.<date>` byte-for-byte
// after the second character.
const generateCookieUid = function() {
  const rand = generateRandom(123456789012, 999999999999);
  const tsm = getTimestampMillis();
  return 'C.1' + CFG.fipLimiter + CFG.tenantID + CFG.fipLimiter + makeString(rand) + '.' + makeString(tsm);
};

// Detect F.* fingerprint UID. Returns true when `uid` starts with the
// fingerprint prefix `F{lim}1{lim}` (e.g. `F$1$`). Gates F→C promote so
// only fingerprint users get promoted; cookie-based UIDs are already in
// their final form.
// The bare `F` is checked in addition to the full prefix on purpose: the
// prefix is built from `fipLimiter`, which the tenant may change at any time
// (the field offers it: "e.g. $ or ."). After such a change every previously
// written `F$1$…` value would stop being recognised — and the cookie guard
// below would happily refresh it for another year, i.e. the exact bug this
// guard exists to prevent. Broadening is fail-safe in both uses: a stray
// `F…` value at most triggers a promote attempt that 404s and falls back.
const fingerprintPrefix = 'F' + CFG.fipLimiter + '1' + CFG.fipLimiter;
const isFingerprintUid = function(uid) {
  return !!(uid && typeof uid === 'string' && (uid.indexOf(fingerprintPrefix) === 0 || uid.charAt(0) === 'F'));
};

// The cookie guard is a WHITELIST, not the negation of the check above. Only a
// minted cookie UID may be written, and `C.` is hard-coded by the api4sgtm
// contract (see generateCookieUid) — so unlike a fingerprint blacklist this
// cannot be widened by a config change, and an unexpected value fails toward
// "do not write" instead of toward "write it".
const isCookieUid = function(uid) {
  return !!(uid && typeof uid === 'string' && uid.indexOf('C.') === 0);
};

// Cookie names this Client used before the default became '_tpf'. Kept because
// a rename that only changes the default silently orphans every cookie already
// in a browser: the visitor looks brand new, loses their stable C.* id and gets
// asked by the CMP again, and — worse — an F.* value written by the bug F-153
// fixed would sit there untouched for its full lifetime, since the cleanup
// below searches under CFG.cookieName only.
//
// '_TPU' was the default from the v1.5 Session refactor until it was corrected.
// It was never a chosen name: it comes from the older, separate "user_id"
// server template (tmp/user_id v1.3.tpl), where it was the EXAMPLE in the field
// help — that field had no defaultValue at all ("If this field is left empty,
// no cookie will be created"). The refactor turned that example into a default,
// and nobody noticed because every real installation had cookie_name set to
// '_tpf' by hand. That is why '_tpf' is the default now: it is what actually
// runs, and a default that matches reality is worth more than one that reads
// well. Measured, not assumed — no customer site carries a '_TPU' cookie.
//
// Read only, never written. An entry equal to the configured name is skipped,
// so this stays correct whatever cookie_name is set to.
const LEGACY_COOKIE_NAMES = ['_TPU'];

// Reads the user-id cookie, falling back to the legacy names. Returns the value
// plus the name it came from ('' when it came from the configured one), because
// the caller has to delete that legacy cookie once the value has been carried
// over. Declared here, up-front, for the same reason as isFingerprintUid: the
// /aGTMconsent POST handler is a directly executed top-level statement and
// GTM's sandboxed-JS parser rejects forward references to const-bound function
// expressions.
// Deletes the user-id cookie under the CURRENT name and every legacy one.
// Reading is name-spanning (readUidCookie below), so deleting has to be too:
// a visitor whose id sits in a legacy cookie would otherwise receive a delete
// header for a name that does not exist in their browser, their actual cookie
// survives, and the next request reads the identity straight back in. That is
// the wrong asymmetry to have on the consent-withdrawal path of all places.
const deleteUidCookies = function(opts) {
  const names = [CFG.cookieName].concat(LEGACY_COOKIE_NAMES);
  for (const n of names) {
    if (n) setCookie(n, '', opts, true);
  }
};

const readUidCookie = function() {
  const cur = CFG.cookieName ? getCookieValues(CFG.cookieName, true) : null;
  const hit = (cur && cur.length > 0 && cur[0]) ? cur[0] : '';
  let out = {value: hit, legacy: '', stale: []};
  // Every legacy name is inspected, not just until the first hit. Stopping
  // early left a second, older cookie sitting in the browser whenever the
  // current one existed — including an F.* fingerprint, i.e. exactly what the
  // F-153 cleanup exists to remove, and it would become authoritative again
  // the moment the current cookie expires.
  for (const ln of LEGACY_COOKIE_NAMES) {
    if (ln !== CFG.cookieName) {
      const lv = getCookieValues(ln, true);
      const v = (lv && lv.length > 0 && lv[0]) ? lv[0] : '';
      if (v && !out.value) { out.value = v; out.legacy = ln; }
      else if (v) { out.stale.push(ln); }
    }
  }
  return out;
};

// F→C promote via api4sgtm /promote endpoint. Atomic Redis TxPipeline
// server-side: migrates the active session pointer from oldUid to newUid
// AND records the consent in one operation. Returns the new UID on success
// (via `then(newUid)`), `''` on failure (caller falls back to legacy F.*).
// Smoketest steps 19-20 verify the contract.
const tryPromote = function(oldUid, newUid, consent, then) {
  if (!CFG.sessionApiUrl || !CFG.tenantID || !oldUid || !newUid) {
    then('', false);
    return;
  }
  const promoteUrl = CFG.sessionApiUrl + '/' + CFG.tenantID + '/' + oldUid + '/promote';
  const promoteBody = JSON.stringify({new_user_id: newUid, consent: consent || {}});
  if (CFG.debug) logToConsole('debug', '→ Promote F→C', {url: promoteUrl, body: promoteBody});
  sendHttpRequest(promoteUrl, {method: 'POST', headers: {'Content-Type': 'application/json'}, timeout: 5000}, promoteBody).then(function(res) {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      if (CFG.debug) logToConsole('debug', '✓ Promote success', {old: oldUid, new: newUid, status: res.statusCode});
      then(newUid, false);
    } else {
      // Second argument: is this worth retrying on the next request? A 5xx is
      // an outage, a 404 ("no active session") or 409 ("target already has
      // one") is a verdict that will not change by asking again. The caller
      // uses it to decide whether an F.* cookie may be cleaned up: retrying
      // forever would keep the fingerprint in the browser indefinitely, which
      // is precisely what the cleanup exists to end.
      logToConsole('warn', '✗ Promote non-2xx — falling back to legacy F.* path', {status: res.statusCode, body: res.body});
      then('', res.statusCode >= 500);
    }
  }, function(e) {
    logToConsole('error', '✗ Promote error — falling back to legacy F.* path', e);
    then('', true);
  });
};

const rpath = getRequestPath();
const rmethod = getRequestMethod();

// ── CORS allow-list (F-160, F-189) ──────────────────────────────────────────
// Responses carry Access-Control-Allow-Origin (with credentials) only for an
// https origin whose host is the cookie domain or one of its subdomains, or is
// listed in cors_origins. This used to echo ANY origin, so every site the
// visitor later opened could fetch() /aGTM.js with credentials and read uid,
// sid and the stored consent (F-189). Loading the library via <script src>
// needs no CORS at all; the consent POST from a page on a sibling subdomain
// (rp.example.com serving www.example.com, the common reverse-proxy setup) does,
// or the library never sees the status and the cookie never reaches the server.
//
// cookie_domain 'auto' is the delivered default, so it cannot mean "no CORS":
// that would leave the consent store broken for exactly the setups F-160 is
// about. 'auto' resolves the same way setCookie resolves it - the eTLD+1 of the
// request host - and the origin must share it. Public-suffix aware for ICANN
// suffixes (two .co.uk sites are not siblings); whether the API also honours
// the list's private section (github.io, run.app) is undocumented, and a
// platform domain missing from the list is shared by all its tenants (F-241).
// Fails closed: when the public
// suffix list is unavailable the API returns its argument unchanged, two
// different subdomains then compare unequal, and no header is sent.
const hostOf = function(v) {
  const h = makeString(v || '').split(',')[0].split(' ').join('').toLowerCase();
  // An IPv6 literal never matches a domain; returning it whole keeps its colons
  // from being mistaken for a port separator.
  if (h.charAt(0) === '[') return h;
  return h.split(':')[0];
};
// The host setCookie's 'auto' uses: Forwarded host=, then X-Forwarded-Host,
// then Host (server-side API doc, setCookie "domain").
const requestHost = function() {
  const fwd = makeString(getRequestHeader('forwarded') || '').split(',')[0].split(';');
  for (let i = 0; i < fwd.length; i++) {
    const kv = fwd[i].split(' ').join('');
    if (kv.toLowerCase().indexOf('host=') === 0) return hostOf(kv.substring(5).split('"').join(''));
  }
  return hostOf(getRequestHeader('x-forwarded-host') || getRequestHeader('host') || '');
};
// Host of an https URL or origin, '' for anything else. Userinfo, a list of
// values or whitespace in the authority are refused outright: a browser never
// sends them, and accepting them would mean judging one host and echoing
// another.
const httpsHost = function(u) {
  const s = makeString(u || '');
  if (s.indexOf('https://') !== 0) return '';
  const auth = s.substring(8).split('/')[0].split('?')[0].split('#')[0];
  if (auth.indexOf('@') >= 0 || auth.indexOf(',') >= 0 || auth.indexOf(' ') >= 0) return '';
  return hostOf(auth);
};
const hostAllowed = function(host) {
  if (!host) return false;
  if (CFG.corsOrigins.indexOf(host) >= 0) return true;
  let dom = makeString(CFG.cookieDomain || '').split(' ').join('').toLowerCase();
  if (dom.charAt(0) === '.') dom = dom.substring(1);
  if (dom === 'auto') {
    const rh = requestHost();
    if (!rh) return false;
    const a = computeEffectiveTldPlusOne(host);
    const b = computeEffectiveTldPlusOne(rh);
    // '' = not a valid domain. Both must be real and equal.
    return !!a && !!b && a === b;
  }
  // A cookie domain that is itself a public suffix ('de', 'co.uk') has no
  // eTLD+1 and would vouch for every site under it. Requiring the host to share
  // the cookie domain's eTLD+1 also holds when the public suffix list is down:
  // the API then returns its argument, 'evil.de' !== 'de', and siblings compare
  // unequal too - fail closed instead of open.
  const domEtld = dom ? computeEffectiveTldPlusOne(dom) : '';
  if (!domEtld || computeEffectiveTldPlusOne(host) !== domEtld) return false;
  return host === dom || host.slice(-(dom.length + 1)) === '.' + dom;
};
const corsOrigin = function() {
  const origin = makeString(getRequestHeader('origin') || '');
  // An Origin is scheme://host[:port] and nothing else; it is echoed verbatim,
  // so anything with a path or trailing slash is refused, not trimmed.
  if (origin.split('/').length !== 3) return '';
  const host = httpsHost(origin);
  if (hostAllowed(host)) return origin;
  if (host && CFG.debug) logToConsole('debug', '✗ CORS: origin not allowed', {origin: origin, requestHost: requestHost(), cookieDomain: CFG.cookieDomain});
  return '';
};
// Vary on every response: a cache must not serve one origin's allowance (or its
// absence) to another.
const setCorsHeaders = function() {
  setResponseHeader('Vary', 'Origin');
  const allowed = corsOrigin();
  if (!allowed) return;
  setResponseHeader('Access-Control-Allow-Origin', allowed);
  setResponseHeader('Access-Control-Allow-Credentials', 'true');
};

// ── POST CONSENT_STORE_PATH handler ─────────────────────────────────────────
// Browser POSTs the latest consent state here. Two responsibilities:
//  1. Manage the user-ID cookie based on consent (cookieMode === 'consent').
//  2. Persist the consent block into the Session API record so that the next
//     library load returns it via cfg.session.consent (Phase 1 redesign).
if (CFG.consentStoreEnabled && rmethod === 'POST' && rpath.slice(-CONSENT_STORE_PATH.length) === CONSENT_STORE_PATH) {
  claimRequest();
  // Cross-site write guard (F-238). CORS only governs who may READ a response.
  // A foreign page can still SEND this POST - fetch(url, {mode: 'no-cors',
  // credentials: 'include'}) with a text/plain body is a simple request, the
  // user-id cookie is SameSite=None and travels along, and the body is parsed
  // whatever its Content-Type. Without this guard any site the visitor opens
  // could store a consent decision in the visitor's name. Sec-Fetch-Site is set
  // by the browser and cannot be forged by page script; 'cross-site' means a
  // different registrable domain. Such a request is accepted only from an origin
  // the allow-list names (cors_origins - a shop on another domain). same-site
  // (rp.example.com from www.example.com) and same-origin pass, and so does a
  // request without the header (older browsers, server-to-server): refusing those
  // would break consent storage for real visitors, and the gap they leave is the
  // one that existed before.
  if (makeString(getRequestHeader('sec-fetch-site') || '').toLowerCase() === 'cross-site' && !corsOrigin()) {
    if (CFG.debug) logToConsole('debug', '✗ Consent POST refused: cross-site origin not allowed', getRequestHeader('origin'));
    setResponseStatus(403);
    setResponseHeader('Vary', 'Origin');
    setResponseHeader('Cache-Control', 'no-store');
    setResponseHeader('x-agtm-version', aGTMversion);
    returnResponse();
    return;
  }
  const body = getRequestBody();
  if (CFG.debug) logToConsole('debug', '✓ Consent POST received', body);
  const cp = body ? JSON.parse(body) : null;

  // Encrypted-mode guard: when the library sends `consent_store_enc=true`,
  // the request body is `{"q":"<enc>"}`. Server-side decryption is not
  // implemented (would need a symmetric counterpart to aGTM.f.enc). Without
  // it, the legacy parser at the next line would silently treat the
  // encrypted blob as a flat object, falling back to the cookie value for
  // uid and an empty consent block — and the F→C promote would then write
  // that empty consent into the migrated session record (full-replace
  // semantics). Fail loudly instead so misconfiguration is visible.
  if (cp && cp.q && !cp.e) {
    logToConsole('warn', '✗ Encrypted consent_store payload not supported server-side — disable consent_store_enc until decrypt is implemented');
    setResponseStatus(501);
    setCorsHeaders();
    setResponseHeader('Content-Type', 'application/json');
    // This body is literally a statement about what this version supports, so it
    // has to say which version is talking. Same reason on the 200 below: a capture
    // of a consent problem often contains only the /aGTMconsent exchange.
    setResponseHeader('x-agtm-version', aGTMversion);
    setResponseBody('{"ok":false,"err":"consent_store_enc not supported server-side"}');
    returnResponse();
    return;
  }

  const cpData = (cp && cp.e) ? cp.e : (cp || {});

  // Resolve uid: explicit in payload first, then fall back to cookie.
  let cpUid = cpData.uid || '';
  if (!cpUid && CFG.cookieName) {
    // Legacy names included: a visitor still carrying the pre-rename cookie
    // would otherwise arrive here without a uid, get a fresh one minted, and
    // lose the session and consent recorded under the old id.
    cpUid = readUidCookie().value;
  }

  // Phase 3 payload shape: { uid, sid, consent: {...} }.
  // Backwards-compat: flat { uid, services, purposes, vendors, feedback }.
  // Ternary kept on a single line for the GTM sandboxed-JS parser.
  const cpConsent = (cpData.consent && typeof cpData.consent === 'object') ? cpData.consent : {hasResponse: true, services: cpData.services || '', purposes: cpData.purposes || '', vendors: cpData.vendors || '', feedback: cpData.feedback || ''};
  const cpServices = cpConsent.services || '';
  const cpPurposes = cpConsent.purposes || '';
  const cpVendors = cpConsent.vendors || '';
  const granted = hasRequiredConsent(cpServices, cpPurposes, cpVendors);
  // Reject the auto-denial sentinel even if it ever leaked into a CMP-driven
  // POST: the server-side auto-denial constructs `services: ',aGTMconsent,'`
  // — a real CMP never emits that exact value, so a match here is either
  // misconfiguration or a replay of the auto-denial block. Combined with the
  // explicit-signal check below, this protects against promoting a
  // non-consenting visitor.
  const isAutoDenialSentinel = cpServices === ',aGTMconsent,';
  // Explicit consent signal: at least one of services/purposes/vendors must
  // be non-empty. Without this, hasRequiredConsent() returns true on empty
  // input when no requirement is configured AND cookie_without_condition is
  // ticked (the deliberate opt-out of F-165) — and a corrupt or empty POST
  // payload would otherwise be considered "granted" and trigger promote.
  const hasExplicitSignal = !!(cpServices || cpPurposes || cpVendors);
  if (CFG.debug) logToConsole('debug', '✓ Consent POST parsed', {uid: cpUid, services: cpServices, purposes: cpPurposes, granted: granted, explicit: hasExplicitSignal});
  // Say so when the missing requirement is what stopped the cookie (F-165) —
  // without log volume. A visitor who never gets a C.* never gets their stored
  // decision back as a preset either, so the library re-POSTs the same decision on every page view: a
  // warn line here would be one per page view for every visitor who answered
  // the CMP. A once-per-instance flag would need templateDataStorage, which is
  // deliberately not used (Andi, 2026-10-20: server-side storage at this
  // traffic). So: a response header, visible in the browser's network tab
  // (same pattern as x-agtm-preset), plus a debug line.
  if (consentConditionMissing && !CFG.cookieNoCondition && hasExplicitSignal && !isAutoDenialSentinel && isFingerprintUid(cpUid) && CFG.cookieMode !== 'never') {
    setResponseHeader('x-agtm-uid-cookie', 'no-consent-requirement');
    if (CFG.debug) logToConsole('debug', '✗ User ID cookie not created: no consent requirement configured (Consent Service/Purpose/Vendor are empty). Fill one in, or tick "Create the user ID cookie without a consent requirement".');
  }

  // F→C promote applicability: when the visitor still carries an F.*
  // fingerprint UID and the CMP just granted consent (with an explicit
  // services/purposes/vendors signal, not just an empty payload), atomically
  // transition to a stable C.* cookie UID via api4sgtm /promote (one Redis
  // TxPipeline: session pointer migration + consent record write).
  // cookieMode='never' skips because the new C.* could not be persisted
  // browser-side and would be lost on the next visit. Single-line form
  // because GTM's sandboxed-JS parser is brittle around multi-line boolean
  // chains in some template-import paths.
  const shouldPromote = granted && hasExplicitSignal && !isAutoDenialSentinel && isFingerprintUid(cpUid) && CFG.sessionApiUrl && CFG.tenantID && CFG.cookieMode !== 'never';

  // Final stage: cookie write + consent persistence + response. `finalUid`
  // is the post-promote C.* uid when promote succeeded, else the original
  // cpUid. `consentAlreadyWritten` is true only when /promote returned 2xx
  // (it bundles consent atomically — skip the legacy /consent POST in that
  // case to avoid a redundant write).
  const writeCookieAndPersist = function(finalUid, consentAlreadyWritten) {
    const promoted = !!finalUid && finalUid !== cpUid;

    // 1. Cookie management
    if (CFG.cookieName) {
      const cookieOpts = {domain: CFG.cookieDomain, path: '/', sameSite: 'none', httpOnly: true, secure: true};
      if (promoted) {
        // F→C migration: write the new C.* cookie regardless of cookieMode
        // (always/consent — never is gated out earlier). Without this the
        // browser would keep the old F.* and the migration would be one-way
        // server-only on next /aGTM.js the cookie still says F.*.
        const maxAge = CFG.cookieLifetimeDays > 0 ? Math.floor(CFG.cookieLifetimeDays * 86400) : 0;
        if (maxAge > 0) cookieOpts['max-age'] = maxAge;
        setCookie(CFG.cookieName, finalUid, cookieOpts, true);
        if (CFG.debug) logToConsole('debug', '✓ User ID cookie set after promote', finalUid);
      } else if (CFG.cookieMode === 'consent') {
        // Legacy consent-mode cookie management. cookieMode='always' cookie
        // is refreshed by /aGTM.js GET, not here.
        //
        // Same rule as the GET path, expressed as a whitelist: only a minted
        // C.* may be written. `finalUid` is still the fingerprint whenever no
        // promote ran (no explicit consent signal, auto-denial sentinel) or
        // the promote failed — the `promoted` branch above is the only one
        // guaranteed to carry a C.*. Without this guard the consent handler
        // re-created on its own exactly what the promote exists to remove.
        if (granted && isCookieUid(finalUid)) {
          const maxAge = CFG.cookieLifetimeDays > 0 ? Math.floor(CFG.cookieLifetimeDays * 86400) : 0;
          if (maxAge > 0) cookieOpts['max-age'] = maxAge;
          setCookie(CFG.cookieName, finalUid, cookieOpts, true);
          if (CFG.debug) logToConsole('debug', '✓ User ID cookie set (consent granted)', finalUid);
        } else if (!granted && !consentConditionMissing && data.cookie_delete) {
          // `!consentConditionMissing`: an EMPTY requirement is a configuration
          // gap, not a withdrawal. Without this, upgrading a 'consent'-mode
          // tag whose fields were left empty would delete the cookie of every
          // visitor on their next consent POST (F-165).
          cookieOpts['max-age'] = 0;
          deleteUidCookies(cookieOpts);
          if (CFG.debug) logToConsole('debug', '✓ User ID cookie deleted (consent withdrawn)');
        }
      }
    }

    // `status` is what the Session API made of the write, passed on so the
    // library's retry can see it (F-236). It used to be a constant 200: the
    // library keeps consent_hash on a non-2xx and retries on the next run_cc,
    // but it never saw one, set session_status='synced' and gave up.
    const finishConsentPost = function(status) {
      setResponseStatus(status || 200);
      setCorsHeaders();
      setResponseHeader('Content-Type', 'application/json');
      setResponseHeader('x-agtm-version', aGTMversion);
      // Always echo finalUid so the browser can update aGTM.d.session.uid
      // after a successful F→C promote. When no promote happened the value
      // matches what the browser already holds — browser-side noop.
      setResponseBody(JSON.stringify({ok: !status || status < 300, uid: finalUid || cpUid}));
      returnResponse();
    };

    // 2. Persist consent into the Session API record so the next library
    //    load returns it via cfg.session.consent. Skip when /promote
    //    already wrote it atomically.
    if (consentAlreadyWritten) {
      if (CFG.debug) logToConsole('debug', '✓ Consent persistence skipped (already written by /promote)');
      finishConsentPost();
      return;
    }

    if (CFG.sessionApiUrl && CFG.tenantID && finalUid) {
      const writeUrl = CFG.sessionApiUrl + '/' + CFG.tenantID + '/' + finalUid + '/consent';
      const writeBody = JSON.stringify(cpConsent);
      if (CFG.debug) logToConsole('debug', '→ Persisting consent to Session API', {url: writeUrl, body: writeBody});
      const writeOpts = {method: 'POST', headers: {'Content-Type': 'application/json'}, timeout: 5000};
      const isOk = function(res) { return res.statusCode >= 200 && res.statusCode < 300; };
      // A transport error has no status of its own; 502 says "the upstream
      // failed", which is what happened, and lets the library retry.
      const failTransport = function(e) {
        logToConsole('error', '✗ Consent persistence error', e);
        finishConsentPost(502);
      };
      // Logged at warn, outside debug: this is the one place a consent
      // decision can be lost, and in a live container a debug line is silent.
      // The uid is deliberately not logged.
      const failStatus = function(stage, res) {
        logToConsole('warn', '✗ Consent not persisted', {stage: stage, status: res.statusCode});
        finishConsentPost(res.statusCode || 502);
      };
      sendHttpRequest(writeUrl, writeOpts, writeBody).then(function(res) {
        if (isOk(res)) {
          if (CFG.debug) logToConsole('debug', '✓ Consent persisted', {uid: finalUid, status: res.statusCode});
          finishConsentPost(200);
          return;
        }
        // Healing is reserved for a cookie-bound C.* uid. An F.* is a
        // server-side fingerprint shared by everyone behind the same NAT and
        // browser build; reopening a session under it would write a consent
        // into exactly the shared record F-156 is about. Its 404 goes to the
        // browser unhealed, as before, only no longer silently.
        if (res.statusCode !== 404 || !isCookieUid(finalUid)) {
          failStatus('write', res);
          return;
        }
        // 404 = no active session under this uid (api4sgtm /consent never
        // creates one). Typical cause: the session window ran out between the
        // page load and the decision — a banner or tab left open. Retrying
        // from the browser cannot help, so read the session — the same GET the
        // /aGTM.js path sends — and write once more (F-236). api4sgtm (stated
        // by its maintainer for the deployed build, 2026-09-29): /consent
        // answers 404 when no session pointer/object exists or more than
        // 30 min passed since the last session GET, and does NOT extend the
        // session; a session GET outside that window starts a new session
        // with counter 0. If the rewrite still fails, that status goes to the
        // browser, whose retry is capped.
        // Exactly one attempt.
        if (CFG.debug) logToConsole('debug', '↻ No active session — opening one and retrying the consent write', {uid: finalUid});
        sendHttpGet(CFG.sessionApiUrl + '/' + CFG.tenantID + '/' + finalUid, {timeout: 5000}).then(function(sres) {
          if (!isOk(sres)) {
            failStatus('session_open', sres);
            return;
          }
          sendHttpRequest(writeUrl, writeOpts, writeBody).then(function(rres) {
            if (!isOk(rres)) {
              failStatus('rewrite', rres);
              return;
            }
            if (CFG.debug) logToConsole('debug', '✓ Consent persisted into a reopened session', {uid: finalUid, status: rres.statusCode});
            finishConsentPost(200);
          }, failTransport);
        }, failTransport);
      }, failTransport);
    } else {
      if (CFG.debug) logToConsole('debug', '✗ Consent persistence skipped (no Session API or no uid)');
      finishConsentPost();
    }
  };

  // No Session API means there is no session pointer to migrate — and
  // therefore no reason to withhold the stable ID. `/promote` exists to move
  // server-side state; where there is none, the Client mints the C.* locally,
  // exactly as the pre-1.5 user-ID template did. Without this branch a tenant
  // running the Client WITHOUT api4sgtm would never receive a user-ID cookie
  // again once the fingerprint guard landed: both C.* producers hang off
  // `sessionApiUrl`, so `cookie_mode` and `cookie_lifetime` would silently
  // become dead options rather than the feature they advertise.
  const mintLocalUid = granted && hasExplicitSignal && !isAutoDenialSentinel && isFingerprintUid(cpUid) && (!CFG.sessionApiUrl || !CFG.tenantID) && CFG.cookieMode !== 'never';

  if (shouldPromote) {
    const newUid = generateCookieUid();
    if (CFG.debug) logToConsole('debug', '→ F→C promote applicable', {old: cpUid, new: newUid});
    tryPromote(cpUid, newUid, cpConsent, function(promotedUid) {
      if (promotedUid) {
        writeCookieAndPersist(promotedUid, true);
      } else {
        // Promote failed — fall back to legacy path under the original F.*.
        // No local mint here: the session record still lives under the F.*
        // key, and handing the browser an unrelated C.* would orphan it.
        writeCookieAndPersist(cpUid, false);
      }
    });
  } else if (mintLocalUid) {
    const localUid = generateCookieUid();
    if (CFG.debug) logToConsole('debug', '→ Minting local C.* (no Session API to migrate)', {old: cpUid, new: localUid});
    writeCookieAndPersist(localUid, false);
  } else {
    writeCookieAndPersist(cpUid, false);
  }
  return;
}

// ── GET /aGTM.js handler ─────────────────────────────────────────────────────
if (rpath.length < 8 || rpath.slice(rpath.length - 8) !== '/aGTM.js') return;

// ── Foreign embed (F-189 via <script src>, F-239) ────────────────────────────
// CORS only governs fetch(). A foreign page can include this URL as a classic
// <script src>: no Origin header, the SameSite=None user-id cookie travels, and
// the served script runs in the FOREIGN window, which then reads uid, sid and
// the stored consent straight out of aGTM.d. The same request would also push
// its ?c= page URL and referrer into the visitor's Sources record. So a request
// the browser marks `cross-site` gets the library WITHOUT anything personal -
// no session lookup, no cookie, no Sources write, no bot verdict, no consent
// store - unless the embedding page (its Referer; a script request carries no
// Origin) is on the allow-list. The library still loads and the CMP flow still
// works; only the preset is missing. same-site (www. embedding rp.) and
// same-origin pass, and so does a request without Sec-Fetch-Site (older
// browsers): refusing those would hit real visitors.
// A listed page that sends no Referer (Referrer-Policy no-referrer) can load the
// script with crossorigin="use-credentials": the browser then sends an Origin,
// which page script cannot forge.
const foreignEmbed = makeString(getRequestHeader('sec-fetch-site') || '').toLowerCase() === 'cross-site' && !hostAllowed(httpsHost(getRequestHeader('referer'))) && !corsOrigin();
// Only the host: a Referer can carry a full page URL with personal data in its
// query, and any foreign page can trigger this line.
if (foreignEmbed && CFG.debug) logToConsole('debug', '✗ Cross-site embed from a page not on the allow-list - serving without session data', httpsHost(getRequestHeader('referer')));

// cors_origins takes exact ASCII hosts. A wildcard or leading-dot entry looks like
// it should cover subdomains, and an internationalised name typed as Unicode looks
// like the host the browser sends as Punycode - both silently cover nothing. Say
// so, once per /aGTM.js request (tenant configuration, so `warn`). A dotless entry
// (localhost, an intranet name) is valid and stays quiet.
const corsOriginsNeverMatch = CFG.corsOrigins.filter(function(h) { return h.charAt(0) === '.' || h.charAt(0) === '*' || encodeUriComponent(h) !== h; });
if (corsOriginsNeverMatch.length > 0) logToConsole('warn', '\u2717 Additional CORS Origins: entries that never match (exact ASCII hosts only - no wildcard, no leading dot, Punycode for internationalised names): ' + corsOriginsNeverMatch.join(','));

// Decode ?c= → {u: pageUrl, r: referrer}
const queryParameters = getRequestQueryParameters();
const id = queryParameters.id || null;
let pageUrl = '', pageRef = '';
if (queryParameters.c) {
  const dec = JSON.parse(fromBase64(queryParameters.c));
  if (dec && typeof dec.u === 'string') pageUrl = dec.u;
  if (dec && typeof dec.r === 'string') pageRef = dec.r;
}

// ── URL parameters for the GTM container URL ─────────────────────────────────
// The library appends this string VERBATIM to the gtm.js URL
// (…gtm.js?id=GTM-X&l=dataLayer<env>), so it has to start with "&". Built once
// per request; the container table decides PER ROW which variant is used.
//
// This exists because the "Use env Parameter" column was a field with no effect:
// the column is named `gtm_use`, the code read `val.gtm_env`, and that column
// does not exist — so `env` was never set, in any configuration, since the
// column was introduced (e8a8207, 2025-09-24). Same class as F-159.
const MAX_REPEATS = 10;     // bounds the WORK, not just the output
const MAX_PARAM_LEN = 1000; // total budget for one container's parameter string
const buildParam = function(k, v) {
  if (typeof k !== 'string' || !k) return '';
  if (typeof v === 'string') {
    if (!v) return '';
    return '&' + encodeUriComponent(k) + '=' + encodeUriComponent(v);
  }
  // A repeated parameter (?a=1&a=2) arrives as an ARRAY of values, not a string.
  // Every value is reproduced in order — the only answer that is not a guess: it
  // hands GTM exactly the query string the caller sent. Dropping the parameter
  // would silently lose an env setting, and taking "the first one" would invent
  // a rule nobody agreed to. The string check has to come FIRST: a string has a
  // numeric .length too, and the sandbox has no Array.isArray to tell them apart.
  if (typeof v !== 'object' || !v || typeof v.length !== 'number') return '';
  const nrep = v.length > MAX_REPEATS ? MAX_REPEATS : v.length;
  // Caller-driven too — see the note on the length cap below.
  if (v.length > MAX_REPEATS) logToConsole('debug', '✗ URL parameter repeated more than ' + MAX_REPEATS + ' times, rest dropped', k);
  let outv = '';
  for (let ri = 0; ri < nrep; ri++) {
    if (typeof v[ri] === 'string' && v[ri]) outv = outv + '&' + encodeUriComponent(k) + '=' + encodeUriComponent(v[ri]);
  }
  return outv;
};
// Parameters aGTM owns and never forwards: `id` selects the container, `c`
// carries the base64 page payload, and `l` names the dataLayer — the library
// sets that one itself, so a caller's copy could only redirect GTM onto a
// dataLayer nobody writes to (a silent total measurement outage).
const ownParam = function(k) { return k === 'id' || k === 'c' || k === 'l'; };
// Appends `piece` to `str` while keeping the total under MAX_PARAM_LEN, checked
// BEFORE appending: a parameter is either fully present or absent. Truncating
// mid-parameter would yield a valid-looking but wrong URL — worse than a
// missing one. Returns null when it did not fit, so callers can report WHICH
// parameter was lost rather than only how many.
const addParam = function(str, piece) {
  if (!piece) return str;
  if (str.length + piece.length > MAX_PARAM_LEN) return null;
  return str + piece;
};
// "env": the three parameters GTM itself defines for environments.
const ENV_KEYS = ['gtm_auth', 'gtm_preview', 'gtm_cookies_win'];
let envParams = '';
let envOverflow = false;
for (const ek of ENV_KEYS) {
  const fit = addParam(envParams, buildParam(ek, queryParameters[ek]));
  if (fit === null) envOverflow = true;
  else envParams = fit;
}
// The three are an ATOMIC set: an environment request carrying gtm_preview but
// not gtm_auth is not a partial success, it is a request GTM answers with a
// stub. Keeping the survivors would turn "too long" into "GTM does not load"
// with no hint why, so the whole set goes. `debug` for the same reason as the
// "all" cap below: with the page query forwarded, any caller can trigger it.
if (envOverflow) {
  envParams = '';
  logToConsole('debug', '✗ env parameters exceed ' + MAX_PARAM_LEN + ' chars - none applied (the set is atomic)');
}
// "all": every query parameter except the ones aGTM owns — but the env
// parameters FIRST. Order decides what survives the budget, and it used to be
// the order of the request URL: a landing page carrying gclid/_gl/utm_* ahead
// of gtm_auth could push exactly the parameter out that the column exists for,
// leaving an environment request without its auth. GTM answers that with a
// stub, so GTM would fail to load for those visitors only — traffic-source
// dependent and near-impossible to diagnose.
let allParams = envParams;
let allDropped = [];
const qpKeys = Object.keys(queryParameters);
for (const qk of qpKeys) {
  if (!ownParam(qk) && ENV_KEYS.indexOf(qk) < 0) {
    const fit = addParam(allParams, buildParam(qk, queryParameters[qk]));
    if (fit === null) allDropped.push(qk);
    else allParams = fit;
  }
}
// Caller-driven, so `debug`: with the page query forwarded to /aGTM.js anyone
// can trigger it on every request. At `warn` it would both cost logging volume
// and drown the one line that means "your setup is broken" (an unusable value
// in the column), which stays at `warn` below.
if (allDropped.length > 0) logToConsole('debug', '✗ URL parameters exceed ' + MAX_PARAM_LEN + ' chars, dropped: ' + allDropped.join(','));
// Anything else: the column's own resolved value, taken verbatim — tenant-
// authored configuration, same trust level as the container URL itself. Only a
// leading "?"/"&" is normalised away.
const normParams = function(str) {
  // Only a string can be a parameter string. A variable may hand us a number,
  // a boolean or an object, and none of those belong in a URL.
  if (typeof str !== 'string') return '';
  let t = str;
  while (t.length > 0 && (t.charAt(0) === '?' || t.charAt(0) === '&')) { t = t.slice(1); }
  if (!t) return '';
  return '&' + t;
};
// Does a verbatim parameter string try to set a parameter aGTM owns? The column
// takes a VARIABLE, and the README teaches deriving a variable from the request
// URL two columns further up — so this value can be caller-influenced even
// though it is meant to be tenant-authored. `id` and `l` are refused here for
// the same reason they are never forwarded by "all from URL"; that the served
// googletagmanager.com honours the FIRST occurrence (measured, not promised)
// must not be what keeps this safe, and a self-hosted /gtm.js may differ.
const claimsOwnParam = function(str) {
  const parts = str.split('&');
  for (const pt of parts) {
    const eq = pt.indexOf('=');
    const key = eq < 0 ? pt : pt.slice(0, eq);
    if (ownParam(key)) return true;
    // A percent-escape in the KEY defeats a raw-name comparison: `%69d=` and
    // `%6C=` reach the receiving server as `id=` and `l=`. Rather than decode
    // (the sandbox would need another require, and double-encoding would still
    // need thought), any key carrying a `%` is refused — a legitimate GTM
    // parameter name never contains one.
    if (key.indexOf('%') >= 0) return true;
  }
  return false;
};
if (CFG.debug) logToConsole('debug', 'Request', {path: rpath, id: id, url: pageUrl, ref: pageRef});

if (!data.gtm) logToConsole('warn', '\u2717 No GTM Container configured');

if (id && data.gtm) {
  let ok = false;
  for (const v of data.gtm) { if (v.gtm_id === id) { ok = true; break; } }
  if (!ok) { logToConsole('warn', '\u2717 No matching GTM ID', id); return; }
}

claimRequest();

// Shared state
const clientIP = data.client_ip || getRemoteAddress() || '';
const userAgent = getRequestHeader('User-Agent') || '';

// ── Helper: generate fingerprint (serverside_fingerprint v1.1.tpl, plus the day)
// The day is part of the HASHED input, not only the trailing .YYYYMMDD: with the
// suffix alone the hash itself stayed the same across days and was visible in
// the value — the stable component CNIL's criterion 2 (a time-varying
// component) is about. The full uid rotated daily before as well, so from the
// day after the publish session keys change exactly as often as they did (on the
// publish day itself every cookieless visitor gets a new key once). Declared
// first: getFingerprint calls it. The day is read once per uid and passed in, so
// hash and suffix cannot straddle midnight. Same key, value and position as
// serverside_fingerprint v1.2 - change both together.
var getFingerprintTimestamp = function() {
  var ms = getTimestampMillis();
  var z = Math.floor(ms / 86400000);
  var rd = z + 719163;
  var d = rd - 1;
  var n400 = Math.floor(d / 146097); d = d - n400 * 146097;
  var n100 = Math.floor(d / 36524);  d = d - n100 * 36524;
  var n4   = Math.floor(d / 1461);   d = d - n4   * 1461;
  var n1   = Math.floor(d / 365);    d = d - n1   * 365;
  var year = 400 * n400 + 100 * n100 + 4 * n4 + n1 + 1;
  var doy  = d + 1;
  var ml   = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if ((year % 4 === 0) && (year % 100 !== 0 || year % 400 === 0)) ml[1] = 29;
  var month = 0;
  while (doy > ml[month]) { doy = doy - ml[month]; month = month + 1; }
  return '' + year + (month + 1 < 10 ? '0' : '') + (month + 1) + (doy < 10 ? '0' : '') + doy;
};
var getFingerprintString = function(day) {
  var requestHeaders = {
    'fp-day': day,
    'accept-language': getRequestHeader('accept-language'),
    'client-ip': clientIP,
    'sgtm-host': CFG.sgtmHost,
    'user-agent': userAgent,
    'sec-ch-ua': getRequestHeader('sec-ch-ua'),
    'sec-ch-ua-mobile': getRequestHeader('sec-ch-ua-mobile'),
    'sec-ch-ua-platform': getRequestHeader('sec-ch-ua-platform'),
    'x-geoip-asn': getRequestHeader('x-geoip-asn'),
    'x-geoip-country': getRequestHeader('x-geoip-country'),
    'x-geoip-country-code': getRequestHeader('x-geoip-country-code'),
    'x-geoip-org': getRequestHeader('x-geoip-org'),
    'x-scheme': getRequestHeader('x-scheme')
  };
  var buildStr = '';
  for (var key in requestHeaders) {
    if (requestHeaders[key]) buildStr += key + ':' + requestHeaders[key];
  }
  if (CFG.debug) logToConsole('debug', 'FP buildStr:', buildStr);
  return toBase64(sha256Sync(buildStr));
};
const getFingerprint = function() {
  const day = getFingerprintTimestamp();
  return 'F' + CFG.fipLimiter + '1' + CFG.fipLimiter + CFG.tenantID + CFG.fipLimiter + getFingerprintString(day) + '.' + day;
};

// ── Helper: write cookie ──────────────────────────────────────────────────────
const writeCookie = function(val, maxAgeSec) {
  if (!CFG.cookieName) return;
  const opts = {domain: CFG.cookieDomain, path: '/', sameSite: 'none', httpOnly: true, secure: true};
  // An explicit maxAgeSec is always honoured — that is how deletion is
  // expressed (`writeCookie('', 0)`). Without one, a non-positive
  // cookie_lifetime must yield a SESSION cookie, not `max-age: 0`: the old
  // form turned every write into a delete header, so a tenant who set the
  // lifetime to 0 silently had no cookie at all while the code read as if it
  // were writing one. The consent handler always did it this way.
  if (typeof maxAgeSec === 'number') {
    opts['max-age'] = maxAgeSec;
  } else if (CFG.cookieLifetimeDays > 0) {
    opts['max-age'] = Math.floor(CFG.cookieLifetimeDays * 86400);
  }
  setCookie(CFG.cookieName, val, opts, true);
};

// (generateCookieUid, isFingerprintUid, fingerprintPrefix, tryPromote
// are declared earlier — before the /aGTMconsent POST handler — because
// that handler uses them. GTM's sandboxed-JS parser rejects forward
// references to const-bound function expressions even at parse time
// ("Illegal variable reference before declaration"), and at runtime
// the const TDZ would throw before the function existed anyway.)

// SOURCES_META: api4sources response fields that are POST/transport status,
// NOT tracking payload. Every OTHER top-level field is passed through to
// sessionData verbatim (e.g. `source`); `attribution` is handled separately
// (wrapped by method). Reserved session keys (uid/sid/consent/...) are listed
// too so a future API field can never clobber the session record.
// The Session API counters are listed for the same reason: fireSources() runs
// AFTER afterSession() has filled them in, so without them here a Sources
// response carrying e.g. its own `created` would overwrite the session record's
// value and the Inspector would show a wrong session age.
const SOURCES_META = {ok: 1, tenant: 1, session_id: 1, ts: 1, skipped: 1, reason: 1, attribution: 1, uid: 1, sid: 1, consent: 1, ret: 1, vct: 1, sst: 1, ga4sid: 1, muidga4: 1, created: 1, lastInteraction: 1, pvCount: 1, eventCount: 1, sessionCount: 1};

// ── Helper: fire Sources API POST (sequential before buildAndSend) ───────────
// Called from afterSession() once the session is committed in Redis. The POST
// is awaited because its response carries tracking payload: `source` (the
// affiliate cookie value, last-cookie-win) and, when sourcesAttribution is on
// (?attribution=true&method=...), an `attribution` object. Every non-meta field
// is captured into sessionData so it flows through cfg.session into
// aGTM.d.session.* — readable in webGTM via a JS variable. attribution is
// wrapped by method into sessionData.attribution so the library's
// resolveAttribution() HYBRID merge lights up (aGTM.d.attribution[method]).
// page_location/referrer come from the ?c= payload; tenant from CFG; user_id
// from the resolved uid. api4sources looks up the active session_id from Redis
// (key customer_sessions:{tenant}:{user_id}) — race-free because the Session
// API write completed before this runs. On timeout/error/non-2xx nothing is
// captured and the rest proceeds (then() always runs).
const fireSources = function(sessionData, then) {
  const uid = sessionData && sessionData.uid;
  if (!CFG.sourcesEnabled) { then(); return; }
  if (!CFG.sourcesApiUrl || !CFG.tenantID || !uid || !pageUrl) {
    if (CFG.debug) logToConsole('debug', '✗ Sources skipped', {enabled: CFG.sourcesEnabled, url: !!CFG.sourcesApiUrl, tenant: !!CFG.tenantID, uid: !!uid, pageUrl: !!pageUrl});
    then();
    return;
  }
  const sep = CFG.sourcesApiUrl.charAt(CFG.sourcesApiUrl.length - 1) === '/' ? '' : '/';
  // Tenant is appended at runtime (field holds the bare base URL, WITHOUT tenant
  // or query). The attribution query, when enabled, goes AFTER the tenant so the
  // path stays /tp/sources/{tenant}?attribution=true&method=... per api4sources.
  let url = CFG.sourcesApiUrl + sep + CFG.tenantID;
  if (CFG.sourcesAttribution) url = url + '?attribution=true&method=' + CFG.sourcesMethod;
  const body = JSON.stringify({
    user_id: uid,
    page_location: pageUrl,
    referrer: pageRef,
    timestamp: getTimestampMillis()
  });
  if (CFG.debug) logToConsole('debug', '→ Sources POST', {url: url, body: body});
  sendHttpRequest(url, {method: 'POST', headers: {'Content-Type': 'application/json'}, timeout: 1500}, body).then(function(res) {
    if (res.statusCode >= 200 && res.statusCode < 300 && res.body) {
      const parsed = JSON.parse(res.body);
      if (parsed && typeof parsed === 'object') {
        // Pass through every non-meta top-level field verbatim. JSON.parse output
        // has only own enumerable keys, so no hasOwnProperty guard is needed.
        // Empty/null values are skipped so a present-but-empty field (e.g.
        // source='' when no affiliate cookie is set) creates no hollow session
        // entry — keeps the library's truthy preset gate meaningful.
        for (const k in parsed) {
          if (!SOURCES_META[k] && parsed[k] !== '' && parsed[k] !== null) sessionData[k] = parsed[k];
        }
        // attribution: wrap the flat object under the requested method key so the
        // library expects aGTM.d.session.attribution keyed by method. Only a
        // NON-empty object is wrapped — an empty {} would create a dead
        // aGTM.d.attribution[method] entry (F-02); CFG.sourcesMethod is already
        // validated (F-01) so no fallback is needed here.
        let hasAttr = false;
        if (parsed.attribution && typeof parsed.attribution === 'object') {
          for (const ak in parsed.attribution) { hasAttr = true; break; }
        }
        if (hasAttr) {
          sessionData.attribution = {};
          sessionData.attribution[CFG.sourcesMethod] = parsed.attribution;
        }
        if (CFG.debug) logToConsole('debug', '✓ Sources response', {status: res.statusCode, source: parsed.source, attribution: !!parsed.attribution});
      } else if (CFG.debug) {
        logToConsole('debug', '✗ Sources response not an object', res.body);
      }
    } else if (CFG.debug) {
      logToConsole('debug', '✗ Sources non-2xx', {status: res.statusCode, body: res.body});
    }
    then();
  }, function(e) {
    logToConsole('error', '✗ Sources error', e);
    then();
  });
};

// ── 1. Bot Check (first — no session/cookie for bots) ────────────────────────
const botCheckEnabled = data.botCheckEnabled === true;
const botCheckUrl = data.botCheck || '';

// Bot-check verdict forwarded to the browser as cfg.bot -> aGTM.d.bot. Only
// reachable when the visitor was NOT blocked (a detected bot gets a 403 and no
// library at all), so this is the "clean or borderline" case: webGTM can derive
// a traffic-type dimension from `band`/`score` instead of only hard-blocking.
//
// Deliberately a WHITELIST — the opposite of the Sources API capture, which
// blacklists known-bad keys and passes the rest through. Reason: this payload
// is readable by every script on the page, so a field the filter service adds
// later must be opted in by a code change rather than leaking on the next API
// deploy. api4filter response contract (2026-07-14, service README):
//   {"isBot":false,"score":0,"band":"clean","signals":[],"primarySignal":null}
//   signals[] = {type, category, score, confirmed?, detail{…}}
// `isBot` is the sole block trigger (definitive signals only) and `band==="bot"`
// holds exactly when `isBot===true`; `score`/`band`/`signals` never block by
// themselves — whether a tenant acts on them (e.g. a traffic_type dimension
// towards GA4) is decided here in webGTM, which is what this passthrough is for.
// A whitelisted key is only half the promise: an existing key whose VALUE the
// service later widens still leaks. A `primarySignal` refined from "asn_spam"
// to "asn_spam:AS55967/Baidu/76ip" carries exactly the detail stripped below —
// and at 27 characters a length cap would not have stopped it. Length is a
// volume defence; this is a content question. So the VALUES are whitelisted
// too. Anything outside the vocabulary collapses to 'other': a widened or
// invented value can still be seen ("something unknown fired"), but it cannot
// carry a payload. Adding a value to the service means adding it here — which
// is the point, PROVIDED the collapse is loud. It is: botFieldsFromResponse
// counts collapses and logs a warning, otherwise a vocabulary drift would go
// unnoticed exactly like the bugs this whole hardening pass was about.
//
// HOW WELL EACH TABLE IS BACKED — do not read this as "the contract says so":
//  - BOT_CATEGORIES: enumerated verbatim in the service spec. Solid.
//  - BOT_BANDS: `clean` and `bot` are documented ("band==='bot' iff isBot").
//    `suspicious` is INFERRED from the scoring description, not stated.
//  - BOT_TYPES: only `bot_string` and `asn_reputation` appear in the spec's
//    examples; the other four are BACK-TRANSLATED from a prose sentence
//    ("invalid client IP, detected cache hit, CIDR blocklist, UA bot string,
//    referrer string") and may not match the real identifiers. `type` has no
//    enumeration in the spec at all. Consequence of a wrong guess is a silent
//    'other' — visible in the log, not a security issue, but a loss of
//    resolution. Get the enumerations confirmed by the service owner.
// `unknown` is deliberately NOT a band value here: the Client uses it as its
// own "no usable verdict" sentinel (see botState below). Keeping it in the
// table would let a service-sent `unknown` masquerade as our outage marker.
const BOT_BANDS = {clean: 1, suspicious: 1, bot: 1};
const BOT_CATEGORIES = {known_bot: 1, cidr_block: 1, asn_spam: 1, invalid_request: 1};
const BOT_TYPES = {bot_string: 1, referrer_string: 1, cidr_block: 1, asn_reputation: 1, invalid_ip: 1, detected_cache: 1};

// Collects the values that fell outside the whitelist during one response, so
// the drift is reported once per request instead of once per field — and with
// the offending values, not just a count. A bare number is not actionable: an
// operator cannot tell which field moved without reproducing the request.
//
// Naming the values in the SERVER log is safe and deliberate: they come from the
// tenant's own filter service, not from the visitor. The whitelist exists to
// keep them out of the BROWSER, which it still does. Capped at 3 so a service
// that renames everything cannot turn one line into a payload.
const botDrift = {vals: []};

const botDriftNote = function(v) {
  if (botDrift.vals.length < 3) botDrift.vals.push(v);
};

const botEnum = function(v, allowed) {
  if (typeof v !== 'string' || !v) return '';
  if (allowed[v] !== 1) botDriftNote(v);
  // `=== 1`, not truthiness: a bare lookup walks the prototype chain, so
  // "toString" and "constructor" would come back truthy and be forwarded
  // verbatim — the whitelist would have a hole exactly where an attacker
  // looks first. Every table value is the literal 1, so an inherited function
  // can never match. (Same class as the session_status lookup fixed in F-55;
  // this way needs no hasOwnProperty, which has no precedent in this file.)
  return allowed[v] === 1 ? v : 'other';
};

// Scores are floored to an integer and bounded to the contract's 0..100, so the
// field carries a score and nothing else — a fractional score would otherwise be
// ~15 significant digits of free payload per signal. Returns null when there is
// no usable number, INCLUDING a value above 100 (see below).
const botScore = function(v) {
  // `v !== v` is the NaN test (no isNaN needed). No Infinity literal either —
  // the clamp below swallows both infinities on its own, and Math.floor is the
  // only global here with a precedent in this file.
  if (typeof v !== 'number' || v !== v) return null;
  if (v < 0) return 0;
  // Floor FIRST, then bound: 100.4 is a float artefact of a legal score and
  // becomes 100; only a genuine 101+ is rejected. Testing `v > 100` before
  // flooring made the field vanish for 100.0000001.
  //
  // A score above 100 is not "very suspicious", it is a contract violation —
  // clamping it to 100 would hand the most incriminating legal value to a
  // broken response, and a webGTM rule like `score >= 80 -> spam` would act on
  // it. No verdict is the honest answer. (This also swallows +Infinity, which
  // is why no Infinity literal is needed.)
  const f = Math.floor(v);
  if (f > 100) return null;
  return f;
};

const botFieldsFromResponse = function(body) {
  const out = {};
  botDrift.vals = [];
  if (typeof body !== 'string' || !body) return out;
  // The server sandbox's JSON.parse returns undefined (it does not throw) on
  // malformed input — the guard below covers that.
  const o = JSON.parse(body);
  if (!o || typeof o !== 'object') return out;
  // Only a real boolean counts as a verdict. A 5xx whose body happens to parse
  // (e.g. {"error":"upstream down"}) must NOT be reported to the browser as a
  // clean visitor — without this guard it would arrive as {isBot:false}.
  if (typeof o.isBot !== 'boolean') return out;
  out.isBot = o.isBot;
  // Each helper is called ONCE per field and its result reused. Calling twice
  // ("if (f(x)) out.k = f(x)") doubled the drift counter and the work.
  const oScore = botScore(o.score);
  if (oScore !== null) out.score = oScore;
  const oBand = botEnum(o.band, BOT_BANDS);
  if (oBand) out.band = oBand;
  const oPrim = botEnum(o.primarySignal, BOT_CATEGORIES);
  if (oPrim) out.primarySignal = oPrim;
  // Array duck-check: the sandbox has no Array.isArray. Index loop, not for…of:
  // the duck-check accepts any object with a numeric `length`, which for…of
  // would reject with a TypeError — and the sandbox has no try/catch, so that
  // would abort the whole /aGTM.js response.
  //
  // TWO bounds, not one. `sig.length < 10` caps the OUTPUT, but an object like
  // {"length": 50000000} with no index properties never grows `sig`, so that
  // bound never fires and the loop runs 50 million times — ~40 bytes of
  // response body stalling /aGTM.js, and with it the GTM load, for every
  // visitor. `i < 50` caps the WORK. Cap what the input controls, not only
  // what you emit.
  if (o.signals && typeof o.signals === 'object' && typeof o.signals.length === 'number') {
    const sig = [];
    for (let i = 0; i < o.signals.length && i < 50 && sig.length < 10; i++) {
      const s = o.signals[i];
      if (s && typeof s === 'object') {
        const e = {};
        const sType = botEnum(s.type, BOT_TYPES);
        if (sType) e.type = sType;
        const sCat = botEnum(s.category, BOT_CATEGORIES);
        if (sCat) e.category = sCat;
        const sScore = botScore(s.score);
        if (sScore !== null) e.score = sScore;
        if (s.confirmed === true) e.confirmed = true;
        // `detail` is deliberately NOT forwarded. For asn_reputation it carries
        // tenant-wide aggregates about OTHER visitors (asn, asnOrg, uniqueIps,
        // requests, consecutiveWindows) — that has no business being readable
        // by every script on the page. `category` is the stable, language-
        // neutral key templates are meant to branch on anyway.
        sig.push(e);
      }
    }
    out.signals = sig;
  }
  // One line per affected request, not per field. If this ever shows up in
  // production the service vocabulary has moved and the tables above are stale
  // — without it the loss is completely silent, in the browser and in the log.
  if (botDrift.vals.length > 0) logToConsole('warn', '\u2717 Bot check: value(s) outside the known vocabulary, collapsed to "other" - the api4filter contract may have changed. Seen (max 3):', botDrift.vals.join(', '));
  return out;
};

// Filled by the bot check before afterBotCheck() runs; read by buildAndSend().
// A const container mutated by property, NOT a rebound top-level `let`: writing
// a property from inside a callback is the pattern already proven live in this
// file (sessionData.uid in the promote callback, sessionData[k] in the sources
// callback), whereas rebinding a top-level binding from a closure has no
// precedent here and would be an unverified assumption in server-sandbox code.
const botState = {verdict: null};

// The six keys a consent-condition row may write, and the ONLY ones. Both Type
// columns are SELECTs, but both carry `macrosInSelect`, so the value is whatever
// a GTM variable resolved to at request time — and the row writes straight into
// the config object the browser receives. Without this gate a variable that
// resolves to `allowEmptyConsentConditions` sets it to a non-empty string, which
// is truthy at `aGTM.js` ("noConditions && !noGate && !allowEmptyConsentConditions"),
// i.e. it switches the whole F-167 fail-closed gate back OFF — and the checkbox
// below only overwrites it when it is ticked, so the value survives in exactly
// the default configuration. `cmp` -> `'none'` and `gtm` (which would corrupt the
// container table into a string) are reachable the same way. The README teaches
// deriving a GTM variable from the request URL, so this is not purely
// tenant-authored either.
//
// Whitelisted VALUES, not just shape — the same doctrine as the bot check, and
// `=== 1` rather than truthiness so `toString`/`constructor`/`__proto__` cannot
// inherit their way through (the F-01 lesson).
const CONSENT_KEYS = {gtmPurposes: 1, gtmServices: 1, gtmVendors: 1, ckPurposes: 1, ckServices: 1, ckVendors: 1};

// Types that appeared on more than one row, reported once each after the tables
// are read. A const container mutated by property, the pattern this file already
// uses for `botState` — and "one line per affected type" is the same shape as
// the bot-check drift line, for the same reason: a line per row would print
// intermediate values (`gtmVendors = v1,v2`) that are never actually served.
const dupCondTypes = {};

// Trim, written out because the server sandbox is not guaranteed to carry
// String.prototype.trim and this file uses no regex literals at all. Same
// charAt/slice shape as normParams() above.
const trimCond = function(s) {
  let a = 0;
  let b = s.length;
  while (a < b && ' \t\n\r'.indexOf(s.charAt(a)) >= 0) { a = a + 1; }
  while (b > a && ' \t\n\r'.indexOf(s.charAt(b - 1)) >= 0) { b = b - 1; }
  return s.slice(a, b);
};

// Merges a cell into an existing requirement and returns the CANONICAL comma
// form: every token trimmed, blanks dropped, repetitions dropped, order kept.
//
// Normalising rather than concatenating is what makes the join safe. A raw
// `existing + ',' + value` turns a single typed trailing comma — the likeliest
// typo in a column whose own help text says "comma-separated" — into
// `ga4,,meta`, and chelp() at the time required an EMPTY token: it searched
// for ",," in the granted string, which no consent string contains. The gate
// would have been shut for 100% of visitors on a site where the same configuration worked
// before the join existed, i.e. this fix would have caused a total measurement
// outage on the next template re-import. A blank-only cell ('   ') is the same
// failure with no trailing comma needed, and it passed the old truthiness
// guard untouched.
// The library's chelp() now skips empty tokens itself (a requirement typed in
// consent-string form, ",x,", blocked GTM silently behind a pre-1.5 Client), so
// this normalisation is defence in depth and the basis of the "adds nothing"
// report — it no longer decides the gate on its own.
const condTokens = function(existing, value) {
  const out = [];
  const parts = (existing ? existing + ',' + value : value).split(',');
  for (const p of parts) {
    const t = trimCond(p);
    if (t && out.indexOf(t) < 0) out.push(t);
  }
  return out.join(',');
};

// Adds one row of a consent-condition table to the config. Rows of the SAME
// type are merged instead of overwriting each other (F-173): a plain
// `c[type] = value` kept only the LAST row while the UI kept showing all of
// them, so an operator who required two services silently got the weaker gate —
// and the error direction was fail-open. A comma-joined value is exactly the
// form the library splits and ANDs (aGTM.f.chelp), so two rows now mean what
// the table looks like it means.
//
// Three ways a row can fail to carry a requirement, three distinct log lines,
// because they call for three different corrections: a type outside the six
// known keys (a variable resolved to something else), a value that is not a
// string at all (a variable resolved to a number — it would reach `.split()` in
// aGTM.f.chelp() and take run_cc() down for every visitor of that site), and a
// value that normalises away to nothing new (empty, blank, or a repetition of
// what is already required).
//
// All three are `warn`, not `debug`: unlike the caller-driven URL parameter
// caps, nobody but the tenant can produce them, and the consequence is a consent
// gate that differs from the one in the form. A row that vanishes without a
// trace is precisely what F-173 was — so no path here returns silently.
const addConsentCond = function(c, type, value) {
  if (CONSENT_KEYS[type] !== 1) {
    logToConsole('warn', '✗ Consent condition type is not one of gtmPurposes/gtmServices/gtmVendors/ckPurposes/ckServices/ckVendors, row ignored:', type);
    return;
  }
  if (typeof value !== 'string') {
    logToConsole('warn', '✗ Consent condition value is not a string (check that row\'s variable), row ignored:', type);
    return;
  }
  const before = c[type] || '';
  const merged = condTokens(before, value);
  // Covers the empty cell, the blank-only cell and the duplicate row that
  // repeats a value already required. All three are "this row changes nothing",
  // and none of them should reach the browser: an empty token used to close
  // the gate for everybody (chelp() now tolerates it), and a repetition would
  // make the line below claim a tightening that did not happen.
  if (merged === before) {
    logToConsole('warn', '✗ Consent condition row adds nothing (empty, blank, or a value already required), row ignored:', type);
    return;
  }
  c[type] = merged;
  if (before) dupCondTypes[type] = 1;
};

// Reports the joins of addConsentCond(), one line per affected TYPE with the
// final value. This is the more important of the two warnings. For a
// configuration written before v1.5 the join CHANGES what the gate requires: it
// used to demand the last row, now it demands all of them. That is the correct
// reading of the form and the direction is fail-closed, but a tenant must not
// have to read a changelog to find out why GTM stopped loading after an update.
// The line sits in the container log, i.e. where the symptom is.
//
// `isUnique` on the column cannot replace it: it only stops a NEW duplicate in
// the UI, it never sees a configuration that already exists, and it cannot see
// two rows whose type comes from a variable.
const logDupCondTypes = function(c) {
  for (const dt in dupCondTypes) {
    logToConsole('warn', '✗ Consent condition type listed more than once - the values are combined with AND, which is STRICTER than before v1.5. Merge them into a single comma-separated row:', dt, '=', c[dt]);
  }
};

// Declared BEFORE its callers on purpose. It used to sit at the end of the file,
// which made every synchronous serve path a forward reference to a `const`
// function expression — a temporal-dead-zone error in the server sandbox that
// killed /aGTM.js for any config without a Session API (the async path masked
// it, which is why it survived unnoticed). Helper before caller, always.
// ── Build and send response ───────────────────────────────────────────────────
const buildAndSend = function(sessionData) {
  // CMP
  let cmp = data.cmp || '';
  if (!cmp && data.cmp_custom_active) cmp = data.cmp_custom_code || '';

  // Config
  const c = {};
  if (data.gtm) {
    // `gtm_id_match` decides whether the ?id= parameter FILTERS the configured
    // containers or is merely validated. The v1.5 refactor dropped the flag and
    // filtered unconditionally, which broke the field's own promise ("If not
    // checked, all of the following GTM Containers will be fired") and, worse,
    // produced an EMPTY container list for a request without ?id= at all — the
    // library then loads and never injects GTM. Restored to the v1.4 semantics.
    const gtmIdMatch = typeof data.gtm_id_match === 'boolean' ? data.gtm_id_match : false;
    const qp_id = typeof id === 'string' ? id : '';
    if (gtmIdMatch && !qp_id) logToConsole('warn', '✗ ID matching is on but the request carries no ?id= - no container will load');
    const gtm = {};
    for (const v of data.gtm) {
      if (v.gtm_id && (!gtmIdMatch || v.gtm_id === qp_id)) {
        // Same shape as F-173 one table further down, and the same fail-open
        // direction: two rows carrying the same container id collapse into one,
        // the earlier row's settings vanish, and the UI keeps showing both. If
        // the surviving row is the one WITHOUT a consent check, the container
        // loads before any decision — a row the operator wrote to gate it is
        // simply gone. The id column has `isUnique`, but it also accepts a
        // variable (its own help text teaches deriving it from `?id=`), so the
        // UI cannot see a collision that only happens at request time.
        //
        // Only reported, not repaired: which row should win is a product
        // decision (the stricter one? the first? merged?), and unlike the
        // consent table there is no obviously correct merge for two differing
        // container settings. Reporting it costs nothing and ends the silence.
        if (gtm[v.gtm_id]) logToConsole('warn', '✗ GTM container listed more than once - only the LAST row applies, the earlier one is dropped (incl. its consent setting and URL):', v.gtm_id);
        gtm[v.gtm_id] = {};
        if (!v.gtm_consent) gtm[v.gtm_id].noConsent = true;
        // The column accepts a VARIABLE (macrosInSelect), so this value is not
        // limited to the three listed options — it is whatever the variable
        // resolved to at request time. Anything else IS the parameter string:
        // one field carries both the choice and, when it is neither of the
        // three, the value. That is why there is no second column.
        //
        // An UNSET column is deliberately not a parameter string: ''/undefined/
        // false is what an untouched row looks like, and appending something to
        // rows nobody configured would be the opposite of a default. A stored
        // boolean true is the former "yes" and keeps meaning the env parameters.
        let envStr = '';
        const mode = v.gtm_use;
        if (mode === 'env' || mode === true) {
          envStr = envParams;
          // The most common first-setup mistake: the column is set, but the
          // integration snippet does not carry the parameters. Every other
          // failure in here leaves a trace; this one used to be the silent one,
          // and it is the likeliest. `debug`, not `warn` — a setup where the
          // parameters appear only sometimes is legitimate.
          if (!envStr) logToConsole('debug', '✗ URL Parameters is "env" but the request carries none of ' + ENV_KEYS.join('/'));
        }
        else if (mode === 'all') envStr = allParams;
        else if (mode !== 'no' && mode !== false && mode !== '' && typeof mode !== 'undefined' && mode !== null) {
          // A resolved value only counts as a parameter string if it LOOKS like
          // one — it goes verbatim into the address the page loads GTM from, so
          // a variable that returns a container id, a stale "yes" or an error
          // message must not end up there. No "=", no parameters, and the
          // rejection is logged: a renamed variable would otherwise change which
          // environment a container loads without leaving a trace anywhere.
          // "> 1", not "> 0": cand starts with the "&" normParams prepends, so
          // an "=" at index 1 means a parameter with an EMPTY name ("&=value").
          // Caught by the test, not by reading it.
          const cand = normParams(mode);
          // Same budget as the request-derived paths. It ends up in the same
          // URL, so exempting it would have capped the mode nobody should use
          // and left the ones they do use open.
          if (!cand || cand.indexOf('=') < 2) logToConsole('warn', '✗ URL Parameters is neither no/env/all nor a k=v parameter string, ignored', mode);
          else if (cand.length > MAX_PARAM_LEN) logToConsole('warn', '✗ URL Parameters value exceeds ' + MAX_PARAM_LEN + ' chars, ignored');
          else if (claimsOwnParam(cand)) logToConsole('warn', '✗ URL Parameters must not set id, c or l - ignored', mode);
          else envStr = cand;
        }
        if (envStr) gtm[v.gtm_id].env = envStr;
        if (v.gtm_url) gtm[v.gtm_id].gtmURL = v.gtm_url;
      }
    }
    c.gtm = gtm;
  }
  if (data.consent) { for (const v of data.consent) { addConsentCond(c, v.consent_type, v.consent_value); } }
  if (data.ck_consent) { for (const v of data.ck_consent) { addConsentCond(c, v.ck_consent_type, v.ck_consent_value); } }
  logDupCondTypes(c);
  // Opt-out of the consent gate. Only reaches the library as `true`, so a
  // container that never saw this field keeps the safe default (fail-closed on
  // an empty condition table, F-167). Deliberately independent of the table
  // above: it must stay expressible to run no gate at all — that is a valid
  // setup for a container that carries nothing requiring consent — but it has
  // to be said out loud rather than fall out of an empty form.
  if (data.allow_empty_consent_conditions) c.allowEmptyConsentConditions = true;
  if (data.sendConsentEvent) c.sendConsentEvent = true;
  if (data.useListener) c.useListener = true;
  if (data.consent_events) c.consent_events = data.consent_events;
  if (data.aPageview) c.aPageview = true;
  if (data.vPageview) c.vPageview = true;
  if (data.vPageviews) c.vPageviews = true;
  if (data.dlStateEvents) c.dlStateEvents = true;
  if (data.gdl) c.gdl = data.gdl;
  if (data.dlOrgPush) c.dlOrgPush = data.dlOrgPush;
  if (typeof c.dlOrgPush !== 'string' || c.dlOrgPush === '-') c.dlOrgPush = '';
  if (data.iframeSupport) c.iframeSupport = true;
  if (data.iframeOrigins) c.iframeOrigins = data.iframeOrigins;
  if (data.nonce) c.nonce = data.nonce;
  if (data.debug) c.debug = true;
  // Session (pre-populated by sGTM Client; aGTM consumes via cfg.session).
  // aGTM's preset gate requires sid OR a valid consent block OR an attribution
  // object OR a source string — uid alone is ignored, so we don't bother
  // emitting in that case.
  if (sessionData && (sessionData.sid || sessionData.consent || sessionData.attribution || sessionData.source)) {
    c.session = sessionData;
  } else if (CFG.debug) {
    logToConsole('debug', '✗ session: nothing to pass through', sessionData);
  }
  // Bot-check verdict -> aGTM.d.bot. Its own top-level key rather than a field
  // of `session`, because the bot check runs BEFORE and independently of the
  // Session API: a session outage must not drop the verdict, and the verdict
  // must not open aGTM's session preset gate (which drives session_status).
  // botCheckExpose defaults to ON — not for backwards compatibility (nothing
  // published this before, the whole passthrough is new), but because the
  // verdict is the only way to measure anything: under `mark` a switched-off
  // expose makes the check a paid no-op. A tenant who wants filtering WITHOUT
  // telling the page can still uncheck it, and that choice has to exist,
  // because the verdict is a classification of this visitor written into a
  // global object before any consent decision.
  if (!foreignEmbed && botCheckEnabled && CFG.botCheckExpose && botState.verdict && typeof botState.verdict.isBot === 'boolean') c.bot = botState.verdict;
  // Reachable in two clicks and otherwise silent: the check costs an HTTP round
  // trip on every /aGTM.js, blocks nothing and publishes nothing.
  if (botCheckEnabled && botCheckUrl && CFG.botCheckMode === 'mark' && !CFG.botCheckExpose) {
    logToConsole('warn', '\u2717 Bot check: mode=mark with the browser passthrough off - the check runs, blocks nothing and reports nothing');
  }
  // Consent-store endpoint: NOT set server-side. The browser builds the URL
  // at runtime from document.currentScript.src (the URL it actually fetched
  // aGTM.js from) — see the IIFE injected into `config` below. Reason:
  // reverse-proxy setups (e.g. site /rp/tp/aGTM.js → upstream /aGTM.js)
  // strip the path prefix before the request reaches us, so rpath is wrong
  // here. Only the browser knows the real prefix. Standalone integrators
  // (without sGTM Client) set aGTM.c.consent_store_url manually.
  if (CFG.debug) {
    logToConsole('debug', CFG.consentStoreEnabled ? '✓ consent_store_url will be built browser-side from document.currentScript.src' : '✗ consent_store_url disabled by template config');
  }
  if (data.consent_store_enc) c.consent_store_enc = true;
  // session_salt is reused by aGTM for the consent-store POST encryption
  // (consent_store_enc) AND as a fallback for transport_salt.
  if (data.session_salt) { const ss = makeInteger(data.session_salt); if (ss > 0) c.session_salt = ss; }
  // POST Transport
  if (data.transport_url) c.transport_url = data.transport_url;
  if (data.transport_enc) c.transport_enc = true;
  if (data.transport_salt) { const ts = makeInteger(data.transport_salt); if (ts > 0) c.transport_salt = ts; }

  // Wrap config(c) in an IIFE that builds consent_store_url at runtime from
  // document.currentScript.src (the URL the browser actually fetched aGTM.js
  // from). This handles reverse-proxy setups: server sees /aGTM.js but the
  // browser came from /rp/tp/aGTM.js — only the browser knows the real
  // prefix. Builder runs before aGTM.f.config() so the URL is already on
  // aGTM.c.consent_store_url when run_cc fires from the B1 sync trigger.
  const storeUrlBuilder = (CFG.consentStoreEnabled && !foreignEmbed) ? '(function(c){var s=document.currentScript;if(s&&s.src){var i=s.src.lastIndexOf("/aGTM.js");if(i>=0)c.consent_store_url=s.src.substring(0,i)+"' + CONSENT_STORE_PATH + '";}return c;})' : '(function(c){return c;})';
  const config = 'aGTM.f.config(' + storeUrlBuilder + '(' + JSON.stringify(c) + '));';
  logToConsole('info', '\u2713 aGTM Config built', {uid: sessionData && sessionData.uid, sid: sessionData && sessionData.sid, ret: sessionData && sessionData.ret});

  // aGTM base64 payload (updated by build.sh)
  const agtm = fromBase64('d2luZG93LmFHVE09d2luZG93LmFHVE18fHt9LHdpbmRvdy5hR1RNLmM9d2luZG93LmFHVE0uY3x8e30sd2luZG93LmFHVE0uZD13aW5kb3cuYUdUTS5kfHx7fSx3aW5kb3cuYUdUTS5mPXdpbmRvdy5hR1RNLmZ8fHt9LHdpbmRvdy5hR1RNLmw9d2luZG93LmFHVE0ubHx8W10sd2luZG93LmFHVE0ubj13aW5kb3cuYUdUTS5ufHx7fSxhR1RNLmYucHJvcHNldD1mdW5jdGlvbihlLHQsYSl7dHJ5e2VbdF09ZVt0XXx8YX1jYXRjaChlKXt9fSxhR1RNLmYub2JqaW5pdD1mdW5jdGlvbigpe1tbYUdUTS5kLCJ2ZXJzaW9uIiwiMS41Il0sW2FHVE0uZCwiZiIsW11dLFthR1RNLmQsImNvbmZpZyIsITFdLFthR1RNLmQsImluaXQiLCExXSxbYUdUTS5kLCJkb21fcmVhZHkiLCExXSxbYUdUTS5kLCJwYWdlX3JlYWR5IiwhMV0sW2FHVE0uZCwiaXNfaWZyYW1lIix3aW5kb3cuc2VsZiE9PXdpbmRvdy50b3BdLFthR1RNLmQsImV2X2ZjdF9jdHIiLDBdLFthR1RNLmQsInRpbWVyIix7fV0sW2FHVE0uZCwiZXJyb3JfY291bnRlciIsMF0sW2FHVE0uZCwiZXJyb3JzIixbXV0sW2FHVE0uZCwiZGwiLFtdXSxbYUdUTS5kLCJzZXNzaW9uIix7fV0sW2FHVE0uZCwic2Vzc2lvbl9zdGF0dXMiLCIiXSxbYUdUTS5kLCJib3QiLHt9XSxbYUdUTS5kLCJjb25zZW50X2hhc2giLCIiXSxbYUdUTS5kLCJsYXN0X2NvbnNlbnRfaGFzaCIsIiJdLFthR1RNLmQsImF0dHJpYnV0aW9uIix7fV0sW2FHVE0uZCwiaWZyYW1lIix7Y291bnRlcjp7ZXZlbnRzOjB9LG9yaWdpbjoiIixpZkxpc3RlbjohMSx0b3BMaXN0ZW46ITEsaGFuZHNoYWtlOiExLHRpbWVyOm51bGx9XSxbYUdUTS5kLCJsYXN0X3VybCIsbG9jYXRpb24uaHJlZl0sW2FHVE0uZCwidXJsTGlzdGVuZXJfYWN0aXZlIiwhMV0sW2FHVE0uZCwicGFzc2l2ZV9zdXBwb3J0ZWQiLG51bGxdLFthR1RNLmYsInRsIix7fV0sW2FHVE0uZiwiZGwiLHt9XSxbYUdUTS5mLCJwbCIse31dLFthR1RNLCJsIixbXV0sW2FHVE0ubiwiY2siLCJjb29raWUiXSxbYUdUTS5uLCJ0bSIsImdvb2dsZXRhZ21hbmFnZXIiXSxbYUdUTS5uLCJ0YSIsInRhZ2Fzc2lzdGFudC5nb29nbGUiXV0uZm9yRWFjaChmdW5jdGlvbihlKXthR1RNLmYucHJvcHNldChlWzBdLGVbMV0sZVsyXSl9KX0sYUdUTS5mLm9iamluaXQoKSxhR1RNLmYubG9nPWZ1bmN0aW9uKGUsdCl7dmFyIGE9Im9iamVjdCI9PXR5cGVvZiB0JiZ0P0pTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkodCkpOnQ7YUdUTS5sLnB1c2goe2lkOmUsdGltZXN0YW1wOihuZXcgRGF0ZSkuZ2V0VGltZSgpLG9iajphfSl9LGFHVE0uZi5zdHJjbGVhbj1mdW5jdGlvbihlKXtyZXR1cm4gdm9pZCAwPT09ZXx8Im9iamVjdCI9PXR5cGVvZiBlJiYhZT8iIjooInN0cmluZyIhPXR5cGVvZiBlJiYoZT1lLnRvU3RyaW5nKCkpLGUucmVwbGFjZSgvW15hLXrDpMO2w7zDn0EtWsOEw5bDnDAtOV8tXS9nLCIiKSl9LGFHVE0uZi5zU3RyZj1mdW5jdGlvbihlKXtpZigib2JqZWN0IiE9dHlwZW9mIGV8fCFlKXt2YXIgdD1KU09OLnN0cmluZ2lmeSh7ZXZlbnQ6ImV4Y2VwdGlvbiIsZXJybXNnOiJEYXRhTGF5ZXIgRW50cnkgaXMgbm8gb2JqZWN0IixlcnJ0eXBlOiJETCBFcnJvciIsb2JqX3R5cGU6dHlwZW9mIGUsb2JqX3ZhbHVlOmV9KTtyZXR1cm4gYUdUTS5mLmxvZygiZTE2IixKU09OLnBhcnNlKHQpKSxKU09OLnN0cmluZ2lmeShudWxsKX12YXIgYT1bXTtyZXR1cm4gSlNPTi5zdHJpbmdpZnkoZSxmdW5jdGlvbihlLHQpe2lmKCJvYmplY3QiPT10eXBlb2YgdCYmbnVsbCE9PXQpe2lmKC0xIT09YS5pbmRleE9mKHQpKXJldHVybiJbQ2lyY3VsYXJdIjthLnB1c2godCl9cmV0dXJuIHR9KX0sYUdUTS5mLmFuPWZ1bmN0aW9uKGUsdCxhLG4pe2VbdF09YS5oYXNPd25Qcm9wZXJ0eSh0KT9hW3RdOm59LGFHVE0uZi5jb25zZW50X3NlcmlhbGl6ZT1mdW5jdGlvbihlKXtpZighZXx8Im9iamVjdCIhPXR5cGVvZiBlKXJldHVybiIiO3ZhciB0PXtndG1Db25zZW50OjEsYmxvY2tlZDoxfSxhPVtdO2Zvcih2YXIgbiBpbiBlKWUuaGFzT3duUHJvcGVydHkobikmJiF0W25dJiZhLnB1c2gobik7YS5zb3J0KCk7Zm9yKHZhciBvPVtdLHI9MDtyPGEubGVuZ3RoO3IrKyl7dmFyIHM9YVtyXSxpPWVbc107IiIhPT1pJiZudWxsIT1pJiZvLnB1c2gocysiPSIrKCJvYmplY3QiPT10eXBlb2YgaT9KU09OLnN0cmluZ2lmeShpKTpTdHJpbmcoaSkpKX1yZXR1cm4gby5qb2luKCJ8Iil9LGFHVE0uZi5wYXJzZVVybFBhcmFtcz1mdW5jdGlvbihlKXt2YXIgdD17fTtpZighZXx8Ij8iIT09ZS5jaGFyQXQoMCkpcmV0dXJuIHQ7Zm9yKHZhciBhPWUuc3Vic3RyaW5nKDEpLnNwbGl0KCImIiksbj0wO248YS5sZW5ndGg7bisrKXt2YXIgbz1hW25dLnNwbGl0KCI9Iik7aWYob1swXSl7dmFyIHIsczt0cnl7cj1kZWNvZGVVUklDb21wb25lbnQob1swXSl9Y2F0Y2goZSl7cj1vWzBdfWlmKG9bMV0pe3ZhciBpPW9bMV0ucmVwbGFjZSgvXCsvZywiICIpO3RyeXtzPWRlY29kZVVSSUNvbXBvbmVudChpKX1jYXRjaChlKXtzPWl9fWVsc2Ugcz0iIjt0W3JdPXN9fXJldHVybiB0fSxhR1RNLmYucmVzb2x2ZUF0dHJpYnV0aW9uPWZ1bmN0aW9uKGUpe3ZhciB0PWFHVE0uZi5wYXJzZVVybFBhcmFtcyh3aW5kb3cubG9jYXRpb24uc2VhcmNoKSxhPShhR1RNLmQuc2Vzc2lvbiYmYUdUTS5kLnNlc3Npb24uYXR0cmlidXRpb258fHt9KVtlXTthJiYib2JqZWN0Ij09dHlwZW9mIGF8fChhPXt9KTtmb3IodmFyIG49WyJnY2xpZCIsImZiY2xpZCIsIm1zY2xraWQiLCJ0dGNsaWQiLCJnYnJhaWQiLCJ3YnJhaWQiXSxvPSIiLHI9IiIscz0wO3M8bi5sZW5ndGg7cysrKXt2YXIgaT1uW3NdO2lmKHRbaV0pe289aSxyPXRbaV07YnJlYWt9fXJldHVybntzb3U6dC51dG1fc291cmNlfHxhLnNvdXx8IiIsY2FtOnQudXRtX2NhbXBhaWdufHxhLmNhbXx8IiIsbWVkOnQudXRtX21lZGl1bXx8YS5tZWR8fCIiLGNhbWlkOnQudXRtX2lkfHxhLmNhbWlkfHwiIixjbGk6cnx8YS5jbGl8fCIiLGNscDpvfHxhLmNscHx8IiIsY2xzOm8mJntnY2xpZDoiR29vZ2xlIEFkcyIsZmJjbGlkOiJNZXRhIixtc2Nsa2lkOiJNaWNyb3NvZnQgQWRzIix0dGNsaWQ6IlRpa1RvayBBZHMiLGdicmFpZDoiR29vZ2xlIEFkcyIsd2JyYWlkOiJHb29nbGUgQWRzIn1bb118fGEuY2xzfHwiIixhZnM6YS5hZnN8fCIiLHNyZTpkb2N1bWVudC5yZWZlcnJlcnx8YS5zcmV8fCIiLGxjczphLmxjc3x8IiIsZnNzOmEuZnNzfHwiIn19LGFHVE0uZi5jb25maWc9ZnVuY3Rpb24oZSl7aWYoYUdUTS5kLmNvbmZpZykiZnVuY3Rpb24iPT10eXBlb2YgYUdUTS5mLmxvZyYmYUdUTS5mLmxvZygiZTEiLGFHVE0uYyk7ZWxzZXtpZihhR1RNLmYuYW4oYUdUTS5jLCJkZWJ1ZyIsZSwhMSksYUdUTS5mLmFuKGFHVE0uYywicGF0aCIsZSwiIiksYUdUTS5mLmFuKGFHVE0uYywiZmlsZSIsZSwiYUdUTS5qcyIpLGFHVE0uZi5hbihhR1RNLmMsImNtcCIsZSwiIiksYUdUTS5jLm1pbj0iYm9vbGVhbiIhPXR5cGVvZiBlLm1pbnx8ZS5taW4sYUdUTS5mLmFuKGFHVE0uYywibm9uY2UiLGUsIiIpLGFHVE0uZi5hbihhR1RNLmMsImlmcmFtZVN1cHBvcnQiLGUsITEpLGFHVE0uZi5hbihhR1RNLmMsInZQYWdldmlld3MiLGUsITEpLGFHVE0uZi5hbihhR1RNLmMsInZQYWdldmlld3NUaW1lciIsZSwwKSxhR1RNLmYuYW4oYUdUTS5jLCJ2UGFnZXZpZXdzRmFsbGJhY2siLGUsITEpLGFHVE0uZi5hbihhR1RNLmMsImd0bUlEIixlLCIiKSxlLmd0bSlmb3IodmFyIHQgaW4gZS5ndG0pZS5ndG0uaGFzT3duUHJvcGVydHkodCkmJihhR1RNLmMuZ3RtSUQ9YUdUTS5jLmd0bUlEfHx0LGFHVE0uYy5ndG09YUdUTS5jLmd0bXx8e30sYUdUTS5jLmd0bVt0XT1lLmd0bVt0XXx8e30sYUdUTS5mLmFuKGFHVE0uYy5ndG1bdF0sIm5vQ29uc2VudCIsZS5ndG1bdF0sITEpLGFHVE0uZi5hbihhR1RNLmMuZ3RtW3RdLCJlbnYiLGUuZ3RtW3RdLCIiKSxhR1RNLmYuYW4oYUdUTS5jLmd0bVt0XSwiaWRQYXJhbSIsZS5ndG1bdF0sIiIpLGFHVE0uZi5hbihhR1RNLmMuZ3RtW3RdLCJndG1VUkwiLGUuZ3RtW3RdLCIiKSxhR1RNLmYuYW4oYUdUTS5jLmd0bVt0XSwiZ3RtSlMiLGUuZ3RtW3RdLCIiKSk7aWYoYUdUTS5mLmFuKGFHVE0uYywiZ2RsIixlLCJkYXRhTGF5ZXIiKSxhR1RNLmYuYW4oYUdUTS5jLCJndG1QdXJwb3NlcyIsZSwiIiksYUdUTS5mLmFuKGFHVE0uYywiZ3RtU2VydmljZXMiLGUsIiIpLGFHVE0uZi5hbihhR1RNLmMsImd0bVZlbmRvcnMiLGUsIiIpLGFHVE0uZi5hbihhR1RNLmMsImFsbG93RW1wdHlDb25zZW50Q29uZGl0aW9ucyIsZSwhMSksYUdUTS5mLmFuKGFHVE0uYywiZ3RtQXR0ciIsZSxudWxsKSxhR1RNLmYuYW4oYUdUTS5jLCJkbFNldCIsZSx7fSksYUdUTS5mLmFuKGFHVE0uYywidXNlTGlzdGVuZXIiLGUsITEpLGFHVE0uZi5hbihhR1RNLmMsImRsT3JnUHVzaCIsZSwiIiksYUdUTS5jLmRsU3RhdGVFdmVudHM9ImJvb2xlYW4iPT10eXBlb2YgZS5kbFN0YXRlRXZlbnRzJiZlLmRsU3RhdGVFdmVudHMsYUdUTS5jLmFQYWdldmlldz0iYm9vbGVhbiI9PXR5cGVvZiBlLmFQYWdldmlldyYmZS5hUGFnZXZpZXcsYUdUTS5jLnZQYWdldmlldz0iYm9vbGVhbiI9PXR5cGVvZiBlLnZQYWdldmlldyYmZS52UGFnZXZpZXcsYUdUTS5jLnNlbmRDb25zZW50RXZlbnQ9ImJvb2xlYW4iPT10eXBlb2YgZS5zZW5kQ29uc2VudEV2ZW50JiZlLnNlbmRDb25zZW50RXZlbnQsYUdUTS5mLmFuKGFHVE0uYywiY29uc2VudF9ldmVudHMiLGUsIiIpLGFHVE0uYy5jb25zZW50X2V2ZW50X2F0dHI9YUdUTS5jLmNvbnNlbnRfZXZlbnRfYXR0cnx8e30sInN0cmluZyI9PXR5cGVvZiBhR1RNLmMuY29uc2VudF9ldmVudHMmJmFHVE0uYy5jb25zZW50X2V2ZW50cyl7Zm9yKHZhciBhPWFHVE0uYy5jb25zZW50X2V2ZW50cy5zcGxpdCgiLCIpLG49W10sbz0wO288YS5sZW5ndGg7bysrKXt2YXIgcj1hW29dLnJlcGxhY2UoL15ccyt8XHMrJC9nLCIiKTtpZihyKXt2YXIgcz1yLmluZGV4T2YoIlsiKTtpZihzPj0wKXt2YXIgaT1yLnN1YnN0cmluZygwLHMpLGM9ci5zdWJzdHJpbmcocysxLHIuaW5kZXhPZigiXSIpKSxmPWMuaW5kZXhPZigiOiIpLFQ9e307Zj49MD9UW2Muc3Vic3RyaW5nKDAsZildPWMuc3Vic3RyaW5nKGYrMSk6VFtjXT0iIixhR1RNLmMuY29uc2VudF9ldmVudF9hdHRyW2ldPVQsbi5wdXNoKGkpfWVsc2Ugbi5wdXNoKHIpfX1hR1RNLmMuY29uc2VudF9ldmVudHM9bi5qb2luKCIsIil9aWYoYUdUTS5mLmFuKGFHVE0uYywidHJhbnNwb3J0X3VybCIsZSwiIiksYUdUTS5mLmFuKGFHVE0uYywidHJhbnNwb3J0X2VuYyIsZSwhMSksYUdUTS5mLmFuKGFHVE0uYywidHJhbnNwb3J0X3NhbHQiLGUsMCksYUdUTS5mLmFuKGFHVE0uYywidXNlcl9pZCIsZSwiIiksYUdUTS5mLmFuKGFHVE0uYywic2Vzc2lvbl9zYWx0IixlLDApLGFHVE0uZi5hbihhR1RNLmMsImNvbnNlbnRfc3RvcmVfdXJsIixlLCIiKSxhR1RNLmYuYW4oYUdUTS5jLCJjb25zZW50X3N0b3JlX2VuYyIsZSwhMSksYUdUTS5mLmFuKGFHVE0uYywiY29uc2VudF9wb2xsX21zIixlLDJlMyksZS5zZXNzaW9uJiYib2JqZWN0Ij09dHlwZW9mIGUuc2Vzc2lvbiYmKGUuc2Vzc2lvbi5zaWR8fGUuc2Vzc2lvbi5jb25zZW50fHxlLnNlc3Npb24uYXR0cmlidXRpb258fGUuc2Vzc2lvbi5zb3VyY2UpKXthR1RNLmQuc2Vzc2lvbj1KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihlLnNlc3Npb24pKTt2YXIgTT1lLnNlc3Npb24uY29uc2VudDtNJiYib2JqZWN0Ij09dHlwZW9mIE0mJiEwPT09TS5oYXNSZXNwb25zZSYmInN0cmluZyI9PXR5cGVvZiBNLnNlcnZpY2VzPyhhR1RNLmQuY29uc2VudD1KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihNKSksYUdUTS5kLmNvbnNlbnRfaGFzaD1hR1RNLmYuY29uc2VudF9zZXJpYWxpemUoYUdUTS5kLmNvbnNlbnQpLGFHVE0uZC5sYXN0X2NvbnNlbnRfaGFzaD1hR1RNLmQuY29uc2VudF9oYXNoLGFHVE0uZC5zZXNzaW9uX3N0YXR1cz0icHJlc2V0X3dpdGhfY29uc2VudCIsYUdUTS5mLmxvZygibV9zZXNzaW9uX3ByZXNldF9jb25zZW50IixNKSk6KGFHVE0uZC5zZXNzaW9uX3N0YXR1cz0icHJlc2V0IixhR1RNLmYubG9nKCJtX3Nlc3Npb25fcHJlc2V0IixlLnNlc3Npb24pKX1pZihlLmJvdCYmIm9iamVjdCI9PXR5cGVvZiBlLmJvdCYmImJvb2xlYW4iPT10eXBlb2YgZS5ib3QuaXNCb3QmJihhR1RNLmQuYm90PUpTT04ucGFyc2UoYUdUTS5mLnNTdHJmKGUuYm90KSksYUdUTS5mLmxvZygibV9ib3RfcHJlc2V0IixhR1RNLmQuYm90KSksZS5jb25zZW50PWUuY29uc2VudHx8e30sYUdUTS5jLmNvbnNlbnQ9YUdUTS5jLmNvbnNlbnR8fGUuY29uc2VudCxhR1RNLmYuYW4oYUdUTS5jLmNvbnNlbnQsImhhc1Jlc3BvbnNlIixlLmNvbnNlbnQsITEpLGFHVE0uZi5hbihhR1RNLmMuY29uc2VudCwiZmVlZGJhY2siLGUuY29uc2VudCwiIiksYUdUTS5mLmFuKGFHVE0uYy5jb25zZW50LCJwdXJwb3NlcyIsZS5jb25zZW50LCIiKSxhR1RNLmYuYW4oYUdUTS5jLmNvbnNlbnQsInNlcnZpY2VzIixlLmNvbnNlbnQsIiIpLGFHVE0uZi5hbihhR1RNLmMuY29uc2VudCwidmVuZG9ycyIsZS5jb25zZW50LCIiKSxhR1RNLmYuYW4oYUdUTS5jLmNvbnNlbnQsImNvbnNlbnRfaWQiLGUuY29uc2VudCwiIiksd2luZG93W2FHVE0uYy5nZGxdPXdpbmRvd1thR1RNLmMuZ2RsXXx8W10sYUdUTS5kLmNvbnNlbnQ9YUdUTS5kLmNvbnNlbnR8fEpTT04ucGFyc2UoYUdUTS5mLnNTdHJmKGFHVE0uYy5jb25zZW50KSksImJvb2xlYW4iIT10eXBlb2YgYUdUTS5kLmNvbnNlbnQuZ3RtQ29uc2VudCYmKGFHVE0uZC5jb25zZW50Lmd0bUNvbnNlbnQ9ITEpLGFHVE0uZC5jb25maWc9ITAsYUdUTS5kLmd0bUxvYWRlZD1bXSxhR1RNLmQuc2Vzc2lvbiYmYUdUTS5kLnNlc3Npb24uYXR0cmlidXRpb24mJiJvYmplY3QiPT10eXBlb2YgYUdUTS5kLnNlc3Npb24uYXR0cmlidXRpb24pZm9yKHZhciBkIGluIGFHVE0uZC5zZXNzaW9uLmF0dHJpYnV0aW9uKWFHVE0uZC5zZXNzaW9uLmF0dHJpYnV0aW9uLmhhc093blByb3BlcnR5KGQpJiYoYUdUTS5kLmF0dHJpYnV0aW9uW2RdPWFHVE0uZi5yZXNvbHZlQXR0cmlidXRpb24oZCkpOyJmdW5jdGlvbiI9PXR5cGVvZiBhR1RNLmYubG9nJiZhR1RNLmYubG9nKCJtMSIsYUdUTS5jKSwhMD09PWFHVE0uZC5jb25zZW50Lmhhc1Jlc3BvbnNlJiYiZnVuY3Rpb24iPT10eXBlb2YgYUdUTS5mLmNhbGxfY2MmJmFHVE0uZi5jYWxsX2NjKCl9fSxhR1RNLmYubG9hZF9jYz1mdW5jdGlvbihlLHQpe3ZhciBhPWRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoInNjcmlwdCIpLG49YUdUTS5jLnBhdGh8fCIiO24ubGVuZ3RoPjAmJiIvIiE9PW4uY2hhckF0KG4ubGVuZ3RoLTEpJiYobis9Ii8iKTt2YXIgbz0iY21wL2NjXyIrYUdUTS5mLnN0cmNsZWFuKGUpKyhhR1RNLmMubWluPyIubWluIjoiIikrIi5qcyI7YS5zcmM9bitvLGFHVE0uYy5ub25jZSYmKGEubm9uY2U9YUdUTS5jLm5vbmNlKSxhLm9ucmVhZHlzdGF0ZWNoYW5nZT1hLm9ubG9hZD1mdW5jdGlvbigpe2EucmVhZHlTdGF0ZSYmIS9sb2FkZWR8Y29tcGxldGUvLnRlc3QoYS5yZWFkeVN0YXRlKXx8ImZ1bmN0aW9uIj09dHlwZW9mIHQmJnQoKX0sYS5hc3luYz0hMCxkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKGEpfSxhR1RNLmYuY2hlbHA9ZnVuY3Rpb24oZSx0KXt2YXIgYT0hMDtpZihlKXtpZighdClyZXR1cm4hMTt2YXIgbj0wO2lmKGUuc3BsaXQoIiwiKS5mb3JFYWNoKGZ1bmN0aW9uKGUpeyhlPWUudHJpbSgpKSYmKG4rKyx0LmluZGV4T2YoIiwiK2UrIiwiKTwwJiYoYT0hMSkpfSksIW4pcmV0dXJuITF9cmV0dXJuIGF9LGFHVE0uZi5ldmFsQ29ucz1mdW5jdGlvbihlLHQpe3ZhciBpc0NvbnNlbnRHaXZlbj1mdW5jdGlvbihlLHQpe3JldHVybiBlLmV2ZXJ5KGZ1bmN0aW9uKGUpe3JldHVybiB0LmluZGV4T2YoIiwiK2UrIiwiKT49MH0pfSxhPSFlLnB1cnBvc2VzLmxlbmd0aHx8aXNDb25zZW50R2l2ZW4oZS5wdXJwb3Nlcyx0LnB1cnBvc2VzKSxuPSFlLnNlcnZpY2VzLmxlbmd0aHx8aXNDb25zZW50R2l2ZW4oZS5zZXJ2aWNlcyx0LnNlcnZpY2VzKSxvPSFlLnZlbmRvcnMubGVuZ3RofHxpc0NvbnNlbnRHaXZlbihlLnZlbmRvcnMsdC52ZW5kb3JzKTtyZXR1cm4gYSYmbiYmb30sYUdUTS5mLnJ1bl9jYz1mdW5jdGlvbihlKXtpZighYUdUTS5kLmNvbmZpZylyZXR1cm4gYUdUTS5mLmxvZygiZTQiLG51bGwpLCExO2lmKCJzdHJpbmciIT10eXBlb2YgZXx8ImluaXQiIT09ZSYmInVwZGF0ZSIhPT1lKXJldHVybiBhR1RNLmYubG9nKCJlNSIse2FjdGlvbjplfSksITE7aWYoImZ1bmN0aW9uIiE9dHlwZW9mIGFHVE0uZi5jb25zZW50X2NoZWNrKXJldHVybiBhR1RNLmYubG9nKCJlMTQiLHthY3Rpb246ZX0pLCExO3ZhciB0PW51bGw7aWYoInVwZGF0ZSI9PT1lJiZhR1RNLmQuY29uc2VudCl7dD1KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihhR1RNLmQuY29uc2VudCkpO3ZhciBhPWFHVE0uZC5jb25zZW50O2EuaGFzUmVzcG9uc2U9ITEsYS5zZXJ2aWNlcz0iIixhLnB1cnBvc2VzPSIiLGEudmVuZG9ycz0iIixhLmNvbnNlbnRfaWQ9IiIsYS5zZXJ2aWNlSURzPSIiLGEuZmVlZGJhY2s9IiIsZGVsZXRlIGEuYmxvY2tlZH1pZighYUdUTS5mLmNvbnNlbnRfY2hlY2soZSkpcmV0dXJuIHQmJihhR1RNLmQuY29uc2VudD10KSxhR1RNLmYubG9nKCJtOCIsbnVsbCksITE7d2luZG93W2FHVE0uYy5nZGxdPXdpbmRvd1thR1RNLmMuZ2RsXXx8W107dmFyIG49Im5vbmUiPT09YUdUTS5jLmNtcHx8YUdUTS5jLmlmcmFtZVN1cHBvcnQmJmFHVE0uZC5pc19pZnJhbWU7ISghYUdUTS5jLmd0bVB1cnBvc2VzJiYhYUdUTS5jLmd0bVNlcnZpY2VzJiYhYUdUTS5jLmd0bVZlbmRvcnMpfHxufHxhR1RNLmMuYWxsb3dFbXB0eUNvbnNlbnRDb25kaXRpb25zP2FHVE0uZi5jaGVscChhR1RNLmMuZ3RtUHVycG9zZXMsYUdUTS5kLmNvbnNlbnQucHVycG9zZXMpJiZhR1RNLmYuY2hlbHAoYUdUTS5jLmd0bVNlcnZpY2VzLGFHVE0uZC5jb25zZW50LnNlcnZpY2VzKSYmYUdUTS5mLmNoZWxwKGFHVE0uYy5ndG1WZW5kb3JzLGFHVE0uZC5jb25zZW50LnZlbmRvcnMpP2FHVE0uZC5jb25zZW50Lmd0bUNvbnNlbnQ9ITA6YUdUTS5kLmNvbnNlbnQuZ3RtQ29uc2VudD0iYm9vbGVhbiI9PXR5cGVvZiBhR1RNLmQuY29uc2VudC5ibG9ja2VkJiZhR1RNLmQuY29uc2VudC5ibG9ja2VkOihhR1RNLmQuY29uc2VudC5ndG1Db25zZW50PSExLGFHVE0uZC5ub0NvbmRMb2dnZWR8fChhR1RNLmQubm9Db25kTG9nZ2VkPSEwLGFHVE0uZi5sb2coIm1fY29uc2VudF9ub19jb25kaXRpb25zIixudWxsKSkpO3ZhciBvPWFHVE0uZi5jb25zZW50X3NlcmlhbGl6ZShhR1RNLmQuY29uc2VudCkscj1vIT09YUdUTS5kLmxhc3RfY29uc2VudF9oYXNoO2lmKGFHVE0uZC5sYXN0X2NvbnNlbnRfaGFzaD1vLCJ1cGRhdGUiPT1lJiZyJiYoYUdUTS5kLmluaXR8fGFHVE0uZi5pbmplY3QoKSxhR1RNLmYuc2VuZG5hdXMoe2V2ZW50OiJhR1RNX2NvbnNlbnRfdXBkYXRlIixhR1RNdHM6KG5ldyBEYXRlKS5nZXRUaW1lKCksYUdUTWNvbnNlbnQ6YUdUTS5kLmNvbnNlbnQ/SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYoYUdUTS5kLmNvbnNlbnQpKTp7fX0pKSwidXBkYXRlIj09PWUmJiFyfHwiZnVuY3Rpb24iIT10eXBlb2YgYUdUTS5mLmNvbnNlbnRfY2FsbGJhY2t8fGFHVE0uZi5jb25zZW50X2NhbGxiYWNrKGUpLGFHVE0uYy5jb25zZW50X3N0b3JlX3VybCl7dmFyIHM9YUdUTS5kLmNvbnNlbnRfc3RvcmVfdHJ5O2lmKHMmJnMuaGFzaD09PW98fChzPWFHVE0uZC5jb25zZW50X3N0b3JlX3RyeT17aGFzaDpvLG46MCxidXN5OiExfSksbyE9PWFHVE0uZC5jb25zZW50X2hhc2gmJiFzLmJ1c3kmJnMubjwzKXtzLm4rKzt2YXIgaT17fTthR1RNLmQuc2Vzc2lvbiYmYUdUTS5kLnNlc3Npb24udWlkJiYoaS51aWQ9YUdUTS5kLnNlc3Npb24udWlkKSxhR1RNLmQuc2Vzc2lvbiYmYUdUTS5kLnNlc3Npb24uc2lkJiYoaS5zaWQ9YUdUTS5kLnNlc3Npb24uc2lkKTt2YXIgYz17fSxmPXtndG1Db25zZW50OjEsYmxvY2tlZDoxfTtmb3IodmFyIFQgaW4gYUdUTS5kLmNvbnNlbnQpaWYoYUdUTS5kLmNvbnNlbnQuaGFzT3duUHJvcGVydHkoVCkmJiFmW1RdKXt2YXIgTT1hR1RNLmQuY29uc2VudFtUXTsiIiE9PU0mJm51bGwhPU0mJihjW1RdPU0pfWkuY29uc2VudD1jO3ZhciBkPSEwPT09YUdUTS5jLmNvbnNlbnRfc3RvcmVfZW5jLEc9Im51bWJlciI9PXR5cGVvZiBhR1RNLmMuc2Vzc2lvbl9zYWx0JiZhR1RNLmMuc2Vzc2lvbl9zYWx0Pj0xP2FHVE0uYy5zZXNzaW9uX3NhbHQ6MDthR1RNLmYubG9nKCJtX2NvbnNlbnRfc3RvcmVfcG9zdCIse3VybDphR1RNLmMuY29uc2VudF9zdG9yZV91cmwsaGFzaDpvfSk7dmFyIGw9YUdUTS5mLnhzZW5kKGFHVE0uYy5jb25zZW50X3N0b3JlX3VybCxpLGQsRywhMCk7IWwmJnMubj49MyYmYUdUTS5mLmxvZygiZV9jb25zZW50X3N0b3JlX2dhdmVfdXAiLHtoYXNoOm99KSxsJiYocy5idXN5PSEwLGwub25yZWFkeXN0YXRlY2hhbmdlPWZ1bmN0aW9uKCl7aWYoND09PWwucmVhZHlTdGF0ZSlpZihzLmJ1c3k9ITEsbC5zdGF0dXM+PTIwMCYmbC5zdGF0dXM8MzAwKXtpZihhR1RNLmQuY29uc2VudF9oYXNoPW8sYUdUTS5kLnNlc3Npb25fc3RhdHVzPSJzeW5jZWQiLGFHVE0uZi5sb2coIm1fY29uc2VudF9zdG9yZV9zeW5jZWQiLHtoYXNoOm99KSxsLnJlc3BvbnNlVGV4dCl0cnl7dmFyIGU9SlNPTi5wYXJzZShsLnJlc3BvbnNlVGV4dCk7ZSYmInN0cmluZyI9PXR5cGVvZiBlLnVpZCYmMD09PWUudWlkLmluZGV4T2YoIkMuIikmJmFHVE0uZC5zZXNzaW9uJiZlLnVpZCE9PWFHVE0uZC5zZXNzaW9uLnVpZCYmKGFHVE0uZi5sb2coIm1fdWlkX3Byb21vdGVkIix7b2xkOmFHVE0uZC5zZXNzaW9uLnVpZCxuZXc6ZS51aWR9KSxhR1RNLmQuc2Vzc2lvbi51aWQ9ZS51aWQpfWNhdGNoKGUpe2FHVE0uZi5sb2coImVfY29uc2VudF9zdG9yZV9wYXJzZSIse21zZzplLm1lc3NhZ2V9KX19ZWxzZSBhR1RNLmYubG9nKCJlX2NvbnNlbnRfc3RvcmUiLHtzdGF0dXM6bC5zdGF0dXMsYXR0ZW1wdDpzLm59KSxzLm4+PTMmJmFHVE0uZi5sb2coImVfY29uc2VudF9zdG9yZV9nYXZlX3VwIix7aGFzaDpvfSl9KX1lbHNlIG89PT1hR1RNLmQuY29uc2VudF9oYXNoJiYoYUdUTS5kLnNlc3Npb25fc3RhdHVzPSJjb25maXJtZWQiKX1yZXR1cm4gYUdUTS5mLmxvZygibTMiLGFHVE0uZC5jb25zZW50KSwhMH0sYUdUTS5mLmNhbGxfY2M9ZnVuY3Rpb24oKXtyZXR1cm4hKCJmdW5jdGlvbiIhPXR5cGVvZiBhR1RNLmYucnVuX2NjfHwhYUdUTS5mLnJ1bl9jYygiaW5pdCIpKSYmKHZvaWQgMCE9PWFHVE0uZC50aW1lci5jb25zZW50JiYoY2xlYXJJbnRlcnZhbChhR1RNLmQudGltZXIuY29uc2VudCksZGVsZXRlIGFHVE0uZC50aW1lci5jb25zZW50KSwhIWFHVE0uZC5pbml0fHxhR1RNLmYuaW5qZWN0KCkpfSwiZnVuY3Rpb24iIT10eXBlb2YgYUdUTS5mLmNvbnNlbnRfbGlzdGVuZXImJihhR1RNLmYuY29uc2VudF9saXN0ZW5lcj1mdW5jdGlvbigpe2FHVE0uYy51c2VMaXN0ZW5lcnx8KCJmdW5jdGlvbiI9PXR5cGVvZiBhR1RNLmYuY2FsbF9jYyYmYUdUTS5mLmNhbGxfY2MoKT8iZnVuY3Rpb24iPT10eXBlb2YgYUdUTS5mLnN0YXJ0X2NvbnNlbnRfcG9sbCYmYUdUTS5mLnN0YXJ0X2NvbnNlbnRfcG9sbCgpOmFHVE0uZC50aW1lci5jb25zZW50PXNldEludGVydmFsKGZ1bmN0aW9uKCl7YUdUTS5mLmNhbGxfY2MoKSYmImZ1bmN0aW9uIj09dHlwZW9mIGFHVE0uZi5zdGFydF9jb25zZW50X3BvbGwmJmFHVE0uZi5zdGFydF9jb25zZW50X3BvbGwoKX0sNTAwKSl9KSxhR1RNLmYuc3RhcnRfY29uc2VudF9wb2xsPWZ1bmN0aW9uKCl7YUdUTS5jLmNvbnNlbnRfc3RvcmVfdXJsJiYoIm51bWJlciIhPXR5cGVvZiBhR1RNLmMuY29uc2VudF9wb2xsX21zfHxhR1RNLmMuY29uc2VudF9wb2xsX21zPD0wfHxhR1RNLmQudGltZXImJmFHVE0uZC50aW1lci5jb25zZW50X3BvbGx8fChhR1RNLmQudGltZXI9YUdUTS5kLnRpbWVyfHx7fSxhR1RNLmQudGltZXIuY29uc2VudF9wb2xsPXNldEludGVydmFsKGZ1bmN0aW9uKCl7ImZ1bmN0aW9uIj09dHlwZW9mIGFHVE0uZi5ydW5fY2MmJmFHVE0uZi5ydW5fY2MoInVwZGF0ZSIpfSxhR1RNLmMuY29uc2VudF9wb2xsX21zKSkpfSxhR1RNLmYuZ2M9ZnVuY3Rpb24oZSl7aWYoInN0cmluZyIhPXR5cGVvZiBlfHwhZSlyZXR1cm4gbnVsbDt2YXIgdD1lLnJlcGxhY2UoL1suKis/XiR7fSgpfFtcXVxcXS9nLCJcXCQmIiksYT1uZXcgUmVnRXhwKCIoPzpefDtcXHMqKSIrdCsiPShbXjtdKykiKSxuPW51bGw7dHJ5e3ZhciBvPWRvY3VtZW50LHI9YS5leGVjKG9bYUdUTS5uLmNrXSk7ciYmci5sZW5ndGg+MSYmKG49ZGVjb2RlVVJJQ29tcG9uZW50KHJbMV0pKX1jYXRjaChlKXt9cmV0dXJuIG59LGFHVE0uZi5zYz1mdW5jdGlvbihlLHQpe2lmKCJzdHJpbmciPT10eXBlb2YgZSYmZSYmdCYmIS9bOz1cc10vLnRlc3QoZSkpdHJ5e2RvY3VtZW50W2FHVE0ubi5ja109ZSsiPSIrZW5jb2RlVVJJQ29tcG9uZW50KHQpKyI7IFNlY3VyZTsgU2FtZVNpdGU9TGF4OyBwYXRoPS8ifWNhdGNoKGUpe319LGFHVE0uZi51cmxQYXJhbT1mdW5jdGlvbihlLHQpe2lmKCJzdHJpbmciIT10eXBlb2YgZXx8IWUpcmV0dXJuIG51bGw7dmFyIGE9ZS5yZXBsYWNlKC9bLiorP14ke30oKXxbXF1cXF0vZywiXFwkJiIpLG49bmV3IFJlZ0V4cCgiWz8mXSIrYSsiKD0oW14mI10qKXwmfCN8JCkiKS5leGVjKHQpO3JldHVybiBuJiZuWzJdP2RlY29kZVVSSUNvbXBvbmVudChuWzJdLnJlcGxhY2UoL1wrL2csIiAiKSk6bnVsbH0sYUdUTS5mLm9wdG91dD1mdW5jdGlvbigpe3ZhciBlPSExLHQ9YUdUTS5mLnVybFBhcmFtKCJhR1RNb3B0b3V0Iix3aW5kb3cubG9jYXRpb24uaHJlZik7aWYodCYmIjAiIT09dClhR1RNLmYuc2MoImFHVE1vcHRvdXQiLCIxIiksZT0hMDtlbHNlIGlmKCIwIj09PXQpYUdUTS5mLnNjKCJhR1RNb3B0b3V0IiwiMCIpO2Vsc2V7dmFyIGE9YUdUTS5mLmdjKCJhR1RNb3B0b3V0Iik7YSYmIjAiIT09YSYmKGU9ITApfWlmKGUpe2Zvcih2YXIgbiBpbiBhR1RNKWFHVE0uaGFzT3duUHJvcGVydHkobikmJiJmIiE9PW4mJmRlbGV0ZSBhR1RNW25dO3JldHVybiBhR1RNLmYub2JqaW5pdCgpLCJmdW5jdGlvbiI9PXR5cGVvZiBhR1RNLmYub3B0b3V0X2NhbGxiYWNrJiZhR1RNLmYub3B0b3V0X2NhbGxiYWNrKCksITB9cmV0dXJuITF9LGFHVE0uZi5hR1RNX2V2ZW50PWZ1bmN0aW9uKGUpeyJvYmplY3QiIT10eXBlb2YgYUdUTS5kLmNvbnNlbnQmJihhR1RNLmQuY29uc2VudD1udWxsKSxlfHwoZT0iYUdUTV9ldmVudCIpO3ZhciB0PXtldmVudDplLGFHVE10czoobmV3IERhdGUpLmdldFRpbWUoKSxhR1RNY29uc2VudDphR1RNLmQuY29uc2VudD9KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihhR1RNLmQuY29uc2VudCkpOnt9fTtyZXR1cm4iYUdUTV9yZWFkeSI9PWUmJih0LmFHVE09e3ZlcnNpb246YUdUTS5kLnZlcnNpb24saXNfaWZyYW1lOmFHVE0uZC5pc19pZnJhbWUsaGFzdHlFdmVudHM6YUdUTS5kLmYsZXJyb3JzOmFHVE0uZC5lcnJvcnN9KSx0fSxhR1RNLmYucHJveHlTdXBwb3J0PWZ1bmN0aW9uKCl7aWYoImZ1bmN0aW9uIiE9dHlwZW9mIFByb3h5KXJldHVybiExO3RyeXtyZXR1cm4gbmV3IFByb3h5KGZ1bmN0aW9uKCl7fSx7YXBwbHk6ZnVuY3Rpb24oKXtyZXR1cm4hMH19KSgpfWNhdGNoKGUpe3JldHVybiExfX0sYUdUTS5mLnVybExpc3RlbmVyPWZ1bmN0aW9uKGUsdCxhKXtpZighYUdUTS5kLnVybExpc3RlbmVyX2FjdGl2ZSl7YUdUTS5kLnVybExpc3RlbmVyX2FjdGl2ZT0hMCwibnVtYmVyIiE9dHlwZW9mIHQmJih0PTUwMCksImJvb2xlYW4iIT10eXBlb2YgYSYmKGE9ITEpLGFHVE0uZC5sYXN0X3VybD1hR1RNLmQubGFzdF91cmx8fGFHVE0uZi5nZXRWYWwoImwiLCJocmVmIiksInN0cmluZyI9PXR5cGVvZiBhR1RNLmQubGFzdF91cmwmJmFHVE0uZC5sYXN0X3VybHx8KGFHVE0uZC5sYXN0X3VybD0iIik7dmFyIGNoZWNrVXJsQ2hhbmdlPWZ1bmN0aW9uKCl7dmFyIHQ9YUdUTS5mLmdldFZhbCgibCIsImhyZWYiKXx8IiI7aWYodCE9YUdUTS5kLmxhc3RfdXJsKXsic3RyaW5nIiE9dHlwZW9mIGUmJihlPSJ2UGFnZXZpZXciKTt2YXIgYT17ZXZlbnQ6ZX07YS5vbGRVUkw9YUdUTS5kLmxhc3RfdXJsLGEubmV3VVJMPXQsYS5uZXdUaXRsZT1kb2N1bWVudC50aXRsZSxhR1RNLmYuZmlyZShhKSxhR1RNLmQubGFzdF91cmw9dH19O2FHVE0uZi5ldkxzdG4oIndpbmRvdyIsInBvcHN0YXRlIixjaGVja1VybENoYW5nZSksYUdUTS5mLmV2THN0bigid2luZG93IiwiaGFzaGNoYW5nZSIsY2hlY2tVcmxDaGFuZ2UpO3ZhciBuPSExO2lmKGFHVE0uZi5wcm94eVN1cHBvcnQoKSl7dmFyIG89e2FwcGx5OmZ1bmN0aW9uKGUsdCxhKXt2YXIgbj1lLmFwcGx5KHQsYSk7cmV0dXJuIGNoZWNrVXJsQ2hhbmdlKCksbn19O2hpc3RvcnkucHVzaFN0YXRlPW5ldyBQcm94eShoaXN0b3J5LnB1c2hTdGF0ZSxvKSxoaXN0b3J5LnJlcGxhY2VTdGF0ZT1uZXcgUHJveHkoaGlzdG9yeS5yZXBsYWNlU3RhdGUsbyksbj0hMH0odD4wJiYhbiYmYXx8dD4wJiYhYSkmJmFHVE0uZi50aW1lcigidXJsTGlzdGVuZXIiLGNoZWNrVXJsQ2hhbmdlLG51bGwsdCwwKX19LGFHVE0uZi5ndG1fbG9hZD1mdW5jdGlvbihlLHQsYSxuLG8scil7aWYoYUdUTS5kLmNvbmZpZyl7aWYoIm9iamVjdCIhPXR5cGVvZiBhR1RNLmQuZ3RtTG9hZGVkJiYoYUdUTS5kLmd0bUxvYWRlZD1bXSksYUdUTS5kLmd0bUxvYWRlZC5sZW5ndGg8MSYmKGFHVE0uZi5zZW5kbmF1cyhhR1RNLmYuYUdUTV9ldmVudCgiYUdUTV9yZWFkeSIpKSxhJiZhR1RNLmYuc2VuZG5hdXMoe2V2ZW50OiJndG0uanMiLCJndG0uc3RhcnQiOihuZXcgRGF0ZSkuZ2V0VGltZSgpfSksYUdUTS5jLmFQYWdldmlldyYmYUdUTS5mLnNlbmRuYXVzKHtldmVudDoiYVBhZ2V2aWV3IixhR1RNdHM6KG5ldyBEYXRlKS5nZXRUaW1lKCl9KSxhR1RNLmMudlBhZ2V2aWV3JiZhR1RNLmYuc2VuZG5hdXMoe2V2ZW50OiJ2UGFnZXZpZXciLGFHVE10czoobmV3IERhdGUpLmdldFRpbWUoKX0pLGFHVE0uYy52UGFnZXZpZXdzJiZhR1RNLmYudXJsTGlzdGVuZXIoInZQYWdldmlldyIsYUdUTS5jLnZQYWdldmlld3NUaW1lcixhR1RNLmMudlBhZ2V2aWV3c0ZhbGxiYWNrKSksYUdUTS5kLmNvbnNlbnRFdmVudF9maXJlZD0iYm9vbGVhbiI9PXR5cGVvZiBhR1RNLmQuY29uc2VudEV2ZW50X2ZpcmVkJiZhR1RNLmQuY29uc2VudEV2ZW50X2ZpcmVkLGFHVE0uYy5zZW5kQ29uc2VudEV2ZW50JiYhYUdUTS5kLmNvbnNlbnRFdmVudF9maXJlZCYmIm9iamVjdCI9PXR5cGVvZiBhR1RNLmQuY29uc2VudCYmYUdUTS5kLmNvbnNlbnQuaGFzUmVzcG9uc2UmJihhR1RNLmYuc2VuZG5hdXMoYUdUTS5mLmFHVE1fZXZlbnQoImFHVE1fY29uc2VudCIpKSxhR1RNLmQuY29uc2VudEV2ZW50X2ZpcmVkPSEwKSxhR1RNLmQuZ3RtTG9hZGVkLnB1c2goYXx8Im5vX2d0bV9pZCIpLGEpe258fChuPSJpZCIpO3ZhciBzPSExLGk9YUdUTS5mLmdjKCJhR1RNZGVidWciKTtpZihpJiZwYXJzZUludChpKT4wJiYocz0hMCksc3x8YUdUTS5mLnVybFBhcmFtKCJndG1fZGVidWciLGRvY3VtZW50LmxvY2F0aW9uLmhyZWYpJiYocz0hMCksIXMmJmRvY3VtZW50LnJlZmVycmVyKXt2YXIgYz10LmNyZWF0ZUVsZW1lbnQoImEiKTtjLmhyZWY9ZG9jdW1lbnQucmVmZXJyZXIsYy5ob3N0bmFtZT09YUdUTS5uLnRhKyIuY29tIiYmKHM9ITApfSFpJiZzJiZhR1RNLmYuc2MoImFHVE1kZWJ1ZyIsIjEiKTt2YXIgZj10LmNyZWF0ZUVsZW1lbnQoInNjcmlwdCIpO2lmKGYuaWQ9ImFHVE1fdG1fIithLGYuYXN5bmM9ITAsIm9iamVjdCI9PXR5cGVvZiBhR1RNLmMuZ3RtQXR0cilmb3IodmFyIFQgaW4gYUdUTS5jLmd0bUF0dHIpZi5zZXRBdHRyaWJ1dGUoVCxhR1RNLmMuZ3RtQXR0cltUXSk7aWYoYUdUTS5jLm5vbmNlJiYoZi5ub25jZT1hR1RNLmMubm9uY2UpLHIuZ3RtSlMmJiFzKWYuaW5uZXJIVE1MPWF0b2Ioci5ndG1KUyk7ZWxzZXt2YXIgTT1yLmd0bVVSTHx8Imh0dHBzOi8vd3d3LiIrYUdUTS5uLnRtKyIuY29tL2d0bS5qcyIsZD1yLmVudnx8IiI7ZCYmIiYiIT09ZC5jaGFyQXQoMCkmJihkPSImIitkKTt2YXIgRz0tMT09PU0uaW5kZXhPZigiPyIpPyI/IjoiJiI7Zi5zcmM9TStHK24rIj0iK2ErIiZsPSIrbytkfXZhciBsPXQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoInNjcmlwdCIpWzBdO2wucGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUoZixsKX19ZWxzZSBhR1RNLmYubG9nKCJlNyIsbnVsbCl9LGFHVE0uZi5kb21yZWFkeT1mdW5jdGlvbihlKXt2YXIgdD0hMTthR1RNLmYudk9iKGUpfHwoZT17YU1TRzoiRW1wdHkgRE9NcmVhZHkgZXZlbnQgZmlyZWQuIn0sdD0hMCksZS5ldmVudHx8KGUuZXZlbnQ9ImFET01yZWFkeSIpLGFHVE0uZC5kb21fcmVhZHkmJnR8fCghYUdUTS5jLmRsU3RhdGVFdmVudHMmJnR8fGFHVE0uZi5maXJlKGUpLHQmJihhR1RNLmQuZG9tX3JlYWR5PSEwKSl9LGFHVE0uZi5wYWdlcmVhZHk9ZnVuY3Rpb24oZSl7dmFyIHQ9ITE7YUdUTS5mLnZPYihlKXx8KGU9e2FNU0c6IkVtcHR5IFBBR0VyZWFkeSBldmVudCBmaXJlZC4ifSx0PSEwKSxlLmV2ZW50fHwoZS5ldmVudD0iYVBBR0VyZWFkeSIpLGFHVE0uZC5wYWdlX3JlYWR5JiZ0fHwoIWFHVE0uYy5kbFN0YXRlRXZlbnRzJiZ0fHxhR1RNLmYuZmlyZShlKSx0JiYoYUdUTS5kLnBhZ2VfcmVhZHk9ITApKX0sYUdUTS5mLmluaXRHVE09ZnVuY3Rpb24oZSl7dmFyIHQ9ITE7aWYoIm9iamVjdCI9PXR5cGVvZiBhR1RNLmMuZ3RtJiZhR1RNLmMuZ3RtKWZvcih2YXIgYSBpbiBhR1RNLmMuZ3RtKWFHVE0uYy5ndG0uaGFzT3duUHJvcGVydHkoYSkmJih0PSEwLCJib29sZWFuIiE9dHlwZW9mIGFHVE0uYy5ndG1bYV0uaGFzTG9hZGVkJiYoYUdUTS5jLmd0bVthXS5oYXNMb2FkZWQ9ITEpLGFHVE0uYy5ndG1bYV0uaGFzTG9hZGVkfHxlJiYhYUdUTS5jLmd0bVthXS5ub0NvbnNlbnR8fChhR1RNLmYuZ3RtX2xvYWQod2luZG93LGRvY3VtZW50LGEsYUdUTS5jLmd0bVthXS5pZFBhcmFtP2FHVE0uYy5ndG1bYV0uaWRQYXJhbToiIixhR1RNLmMuZ2RsLGFHVE0uYy5ndG1bYV0pLGFHVE0uYy5ndG1bYV0uaGFzTG9hZGVkPSEwKSk7dHx8ZXx8YUdUTS5kLmNvbnRhaW5lckxlc3NSdW58fGFHVE0uZC5pc19pZnJhbWV8fChhR1RNLmQuY29udGFpbmVyTGVzc1J1bj0hMCxhR1RNLmYuZ3RtX2xvYWQod2luZG93LGRvY3VtZW50LCIiLCIiLGFHVE0uYy5nZGwse30pKX0sYUdUTS5mLmNoa0RQcmVhZHk9ZnVuY3Rpb24oKXt2YXIgZT1kb2N1bWVudC5yZWFkeVN0YXRlOyJpbnRlcmFjdGl2ZSI9PT1lfHwiY29tcGxldGUiPT09ZT9hR1RNLmYuZG9tcmVhZHkobnVsbCk6YUdUTS5mLmV2THN0bihkb2N1bWVudCwiRE9NQ29udGVudExvYWRlZCIsYUdUTS5mLmRvbXJlYWR5KSwiY29tcGxldGUiPT09ZT9hR1RNLmYucGFnZXJlYWR5KG51bGwpOmFHVE0uZi5ldkxzdG4od2luZG93LCJsb2FkIixhR1RNLmYucGFnZXJlYWR5KX0sYUdUTS5mLmluamVjdD1mdW5jdGlvbigpe2lmKCFhR1RNLmQuY29uZmlnKXJldHVybiBhR1RNLmYubG9nKCJlOCIsbnVsbCksITE7aWYoIm9iamVjdCIhPXR5cGVvZiBhR1RNLmQuY29uc2VudHx8ImJvb2xlYW4iIT10eXBlb2YgYUdUTS5kLmNvbnNlbnQuaGFzUmVzcG9uc2V8fCFhR1RNLmQuY29uc2VudC5oYXNSZXNwb25zZSlyZXR1cm4gYUdUTS5mLmxvZygiZTEzIixudWxsKSwhMTthR1RNLmQuaW5pdHx8KCh3aW5kb3dbYUdUTS5jLmdkbF18fFtdKS5mb3JFYWNoKGZ1bmN0aW9uKGUsdCl7aWYoIm9iamVjdCI9PXR5cGVvZiBlJiZlKXtpZighZS5hR1RNY2hrKXtlLmFHVE1kbD0hMDt2YXIgYT1KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihlKSk7dm9pZCAwIT09YVsiZ3RtLnVuaXF1ZUV2ZW50SWQiXSYmZGVsZXRlIGFbImd0bS51bmlxdWVFdmVudElkIl0sYUdUTS5kLmYucHVzaChhKX19ZWxzZSBhR1RNLmYubG9nKCJlMTciLHtvYmpfdHlwZTp0eXBlb2YgZSxvYmpfdmFsdWU6ZSxpbmRleDp0fSksYUdUTS5kLmYucHVzaCh7ZXZlbnQ6ImV4Y2VwdGlvbiIsZXJybXNnOiJEYXRhTGF5ZXIgRW50cnkgaXMgbm8gb2JqZWN0IixlcnJ0eXBlOiJETCBFcnJvciIsb2JqX3R5cGU6dHlwZW9mIGUsb2JqX3ZhbHVlOmV9KX0pLGFHVE0uZC5jb25zZW50Lmd0bUNvbnNlbnQmJihhR1RNLmYuaW5pdEdUTSghMSksYUdUTS5kLmluaXQ9ITApLGFHVE0uZC5pbml0JiZhR1RNLmYuY2hrRFByZWFkeSgpKTtyZXR1cm4iZnVuY3Rpb24iPT10eXBlb2YgYUdUTS5mLmluamVjdF9jYWxsYmFjayYmYUdUTS5mLmluamVjdF9jYWxsYmFjaygpLGFHVE0uZi5sb2coIm02IixudWxsKSwhMH0sYUdUTS5mLmlGcmFtZUZpcmU9ZnVuY3Rpb24oZSl7Im9iamVjdCI9PXR5cGVvZiBlJiZlJiYoYUdUTS5kLmlzX2lmcmFtZSYmInN0cmluZyI9PXR5cGVvZiBlLmV2ZW50JiYvXihhR1RNfGd0bVwufFthdl1ET01yZWFkeXxbYXZdUEFHRXJlYWR5KS8udGVzdChlLmV2ZW50KT9hR1RNLmYuc2VuZG5hdXMoZSk6KGUuYUdUTV9zb3VyY2U9ImlGcmFtZSAiK2RvY3VtZW50LmxvY2F0aW9uLmhvc3RuYW1lLGFHVE0uZC5pZnJhbWUuY291bnRlci5ldmVudHMrKyxlLmlmRXZDdHI9YUdUTS5kLmlmcmFtZS5jb3VudGVyLmV2ZW50cywic3RyaW5nIj09dHlwZW9mIGUuZXZlbnQmJmUuZXZlbnQmJihhR1RNLmQuaWZyYW1lLmNvdW50ZXJbZS5ldmVudF09YUdUTS5kLmlmcmFtZS5jb3VudGVyW2UuZXZlbnRdfHwwLGFHVE0uZC5pZnJhbWUuY291bnRlcltlLmV2ZW50XSsrLGVbImlmRXZDdHJfIitlLmV2ZW50XT1hR1RNLmQuaWZyYW1lLmNvdW50ZXJbZS5ldmVudF0pLGUuYUdUTXRzJiZkZWxldGUgZS5hR1RNdHMsZS5hR1RNcGFyYW1zJiZkZWxldGUgZS5hR1RNcGFyYW1zLGFHVE0uZC5pZnJhbWUub3JpZ2luP3dpbmRvdy50b3AucG9zdE1lc3NhZ2UoZSxhR1RNLmQuaWZyYW1lLm9yaWdpbik6YUdUTS5kLmYucHVzaChlKSkpfSxhR1RNLmYuaWZIYW5kc2hha2U9ZnVuY3Rpb24oKXtpZighYUdUTS5kLmlzX2lmcmFtZSYmIWFHVE0uZC5pZnJhbWUuaGFuZHNoYWtlKXt2YXIgZT1kb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgiaWZyYW1lIik7aWYoIWUubGVuZ3RoKXJldHVybjtmb3IodmFyIHQ9MDt0PGUubGVuZ3RoO3QrKyl7dmFyIGE9ZVt0XTthJiZhLmNvbnRlbnRXaW5kb3cmJmEuY29udGVudFdpbmRvdy5wb3N0TWVzc2FnZSYmYS5jb250ZW50V2luZG93LnBvc3RNZXNzYWdlKCJhR1RNX1RvcDJpRnJhbWUgSGFuZHNoYWtlIiwiKiIpfWFHVE0uZC5pZnJhbWUuaGFuZHNoYWtlPSEwfX0sYUdUTS5mLmlmSFNsaXN0ZW49ZnVuY3Rpb24oZSl7aWYoYUdUTS5kLmlzX2lmcmFtZSYmZS5zb3VyY2U9PT13aW5kb3cudG9wJiYic3RyaW5nIj09dHlwZW9mIGUuZGF0YSYmImFHVE1fVG9wMmlGcmFtZSBIYW5kc2hha2UiPT1lLmRhdGEpZm9yKGFHVE0uZC5pZnJhbWUub3JpZ2luPWUub3JpZ2luLGFHVE0uZC5pZnJhbWUuaWZMaXN0ZW49ITEsd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoIm1lc3NhZ2UiLGFHVE0uZi5pZkhTbGlzdGVuLCExKTthR1RNLmQuZi5sZW5ndGg7KXt2YXIgdD1hR1RNLmQuZi5zaGlmdCgpO2FHVE0uZi5pRnJhbWVGaXJlKHQpfX0sYUdUTS5mLnZPYj1mdW5jdGlvbihlKXtpZigib2JqZWN0IiE9dHlwZW9mIGV8fCFlKXJldHVybiExO3RyeXtKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KGUpKX1jYXRjaChlKXtyZXR1cm4hMX1yZXR1cm4hMH0sYUdUTS5mLnZTdD1mdW5jdGlvbihlKXt2YXIgdD1BcnJheS5pc0FycmF5KGUpP2U6InN0cmluZyI9PXR5cGVvZiBlP1tlXTpbXTtyZXR1cm4gMCE9PXQubGVuZ3RoJiZ0LmV2ZXJ5KGZ1bmN0aW9uKGUpe3JldHVybiJzdHJpbmciPT10eXBlb2YgZSYmIiIhPT1lfSl9LGFHVE0uZi5wYXNzaXZlU3VwcG9ydGVkPWZ1bmN0aW9uKCl7aWYoImJvb2xlYW4iPT10eXBlb2YgYUdUTS5kLnBhc3NpdmVfc3VwcG9ydGVkKXJldHVybiBhR1RNLmQucGFzc2l2ZV9zdXBwb3J0ZWQ7dmFyIGU9ITE7dHJ5e3ZhciB0PU9iamVjdC5kZWZpbmVQcm9wZXJ0eSh7fSwicGFzc2l2ZSIse2dldDpmdW5jdGlvbigpe3JldHVybiBlPSEwLCEwfX0pLG5vb3A9ZnVuY3Rpb24oKXt9O3dpbmRvdy5hZGRFdmVudExpc3RlbmVyKCJhR1RNcGFzc2l2ZXRlc3QiLG5vb3AsdCksd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoImFHVE1wYXNzaXZldGVzdCIsbm9vcCx0KX1jYXRjaCh0KXtlPSExfXJldHVybiBhR1RNLmQucGFzc2l2ZV9zdXBwb3J0ZWQ9ZSxlfSxhR1RNLmYudGhyb3R0bGU9ZnVuY3Rpb24oZSx0KXtpZigiZnVuY3Rpb24iIT10eXBlb2YgZSlyZXR1cm4gZTtpZigibnVtYmVyIiE9dHlwZW9mIHR8fHQ8PTApcmV0dXJuIGU7dmFyIGE9MCxuPW51bGwsbz1udWxsLHI9bnVsbDtyZXR1cm4gZnVuY3Rpb24oKXt2YXIgcz1EYXRlLm5vdygpO289dGhpcyxyPWFyZ3VtZW50czt2YXIgaT10LShzLWEpO2k8PTA/KG4mJihjbGVhclRpbWVvdXQobiksbj1udWxsKSxhPXMsZS5hcHBseShvLHIpKTpufHwobj1zZXRUaW1lb3V0KGZ1bmN0aW9uKCl7YT1EYXRlLm5vdygpLG49bnVsbCxlLmFwcGx5KG8scil9LGkpKX19LGFHVE0uZi5ldkxzdG49ZnVuY3Rpb24oZSx0LGEsbil7aWYoIndpbmRvdyI9PT1lJiYoZT13aW5kb3cpLCJkb2N1bWVudCI9PT1lJiYoZT1kb2N1bWVudCksIm9iamVjdCI9PXR5cGVvZiBlJiZlJiYic3RyaW5nIj09dHlwZW9mIHQmJiJmdW5jdGlvbiI9PXR5cGVvZiBhKXsib2JqZWN0Ij09dHlwZW9mIG4mJm58fChuPXt9KTt0cnl7aWYoIm1lc3NhZ2UiPT10KWFHVE0uZC5pZnJhbWUudG9wTGlzdGVufHxhR1RNLmQuaXNfaWZyYW1lfHwoYUdUTS5kLmlmcmFtZS50b3BMaXN0ZW49ITAsZS5hZGRFdmVudExpc3RlbmVyKHQsZnVuY3Rpb24oZSl7YSh2b2lkIDAhPT1lLmRhdGE/ZS5kYXRhOm51bGwsInN0cmluZyI9PXR5cGVvZiBlLm9yaWdpbj9lLm9yaWdpbjoiIil9KSk7ZWxzZXt2YXIgbz0ibnVtYmVyIj09dHlwZW9mIG4udGhyb3R0bGUmJm4udGhyb3R0bGU+MD9hR1RNLmYudGhyb3R0bGUoYSxuLnRocm90dGxlKTphOyEwPT09bi5wYXNzaXZlJiZhR1RNLmYucGFzc2l2ZVN1cHBvcnRlZCgpP2UuYWRkRXZlbnRMaXN0ZW5lcih0LG8se3Bhc3NpdmU6ITB9KTplLmFkZEV2ZW50TGlzdGVuZXIodCxvKX19Y2F0Y2gobil7YUdUTS5mLmxvZygiZTEyIix7ZXJyb3I6bixlbDplLGV2OnQsZmN0OmF9KX19ZWxzZSBhR1RNLmYubG9nKCJlMTEiLHtlbDplLGV2OnQsZmN0OmF9KX0sYUdUTS5mLnJtTHN0bj1mdW5jdGlvbihlLHQsYSl7IndpbmRvdyI9PT1lJiYoZT13aW5kb3cpLCJkb2N1bWVudCI9PT1lJiYoZT1kb2N1bWVudCk7dHJ5e2UucmVtb3ZlRXZlbnRMaXN0ZW5lcih0LGEpfWNhdGNoKGUpe319LGFHVE0uZi5nZXRWYWw9ZnVuY3Rpb24oZSx0KXtpZihhR1RNLmYudlN0KFtlLHRdKSYmdC5tYXRjaCgvW2Etel0rL2kpJiYoInAiIT1lfHwib2JqZWN0Ij09dHlwZW9mIHBlcmZvcm1hbmNlJiZwZXJmb3JtYW5jZSkpc3dpdGNoKGUpe2Nhc2UidyI6cmV0dXJuIGFHVE0uZi52T2Iod2luZG93W3RdKT9KU09OLnBhcnNlKGFHVE0uZi5zU3RyZih3aW5kb3dbdF0pKTp3aW5kb3dbdF07Y2FzZSJuIjpyZXR1cm4gYUdUTS5mLnZPYihuYXZpZ2F0b3JbdF0pP0pTT04ucGFyc2UoYUdUTS5mLnNTdHJmKG5hdmlnYXRvclt0XSkpOm5hdmlnYXRvclt0XTtjYXNlImQiOnJldHVybiBkb2N1bWVudFt0XTtjYXNlImwiOnJldHVybiBkb2N1bWVudC5sb2NhdGlvblt0XTtjYXNlImgiOnJldHVybiBkb2N1bWVudC5oZWFkW3RdO2Nhc2UiYiI6cmV0dXJuIGRvY3VtZW50LmJvZHlbdF07Y2FzZSJzIjpyZXR1cm4gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoImh0bWwiKVswXS5zY3JvbGxUb3B8fDA7Y2FzZSJtIjpyZXR1cm4gd2luZG93LnNjcmVlblt0XTtjYXNlImMiOnJldHVybiB3aW5kb3cuZ29vZ2xlX3RhZ19kYXRhJiZ3aW5kb3cuZ29vZ2xlX3RhZ19kYXRhLmljcz9KU09OLnBhcnNlKGFHVE0uZi5zU3RyZih3aW5kb3cuZ29vZ2xlX3RhZ19kYXRhLmljcykpOm51bGw7Y2FzZSJwIjpyZXR1cm4ibm93Ij09dD9wZXJmb3JtYW5jZS5ub3coKTpwZXJmb3JtYW5jZVt0XTtkZWZhdWx0OnJldHVybn19LGFHVE0uZi5nZXROb2RlQXR0cj1mdW5jdGlvbihlLHQpe3ZhciBhPWRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoZSk7cmV0dXJuIGE/YS5nZXRBdHRyaWJ1dGUodCk6bnVsbH0sYUdUTS5mLm5ld05vZGU9ZnVuY3Rpb24oZSx0LGEpe2lmKGFHVE0uZi52U3QoW2UsdF0pJiYib2JqZWN0Ij09dHlwZW9mIGEpe3ZhciBuPWRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoZSksbz1kb2N1bWVudC5xdWVyeVNlbGVjdG9yKHQpO2lmKG8pe2Zvcih2YXIgciBpbiBhKWlmKGEuaGFzT3duUHJvcGVydHkocikpe3ZhciBzPXIuc3BsaXQoIi4iKTsxPT09cy5sZW5ndGg/bi5zZXRBdHRyaWJ1dGUocixhW3JdKToobltzWzBdXXx8KG5bc1swXV09e30pLG5bc1swXV1bc1sxXV09YVtyXSl9by5hcHBlbmRDaGlsZChuKX19fSxhR1RNLmYuZGVsTm9kZT1mdW5jdGlvbihlKXtpZihhR1RNLmYudlN0KGUpKXt2YXIgdD1kb2N1bWVudC5xdWVyeVNlbGVjdG9yKGUpO3QmJnQucGFyZW50Tm9kZS5yZW1vdmVDaGlsZCh0KX19LGFHVE0uZi5wYWdlaW5mbz1mdW5jdGlvbihlKXt2YXIgdD0wLGE9MDtpZigoZT1lfHx7fSkuY291bnRXb3JkcyYmZnVuY3Rpb24gZ2V0VGV4dChlKXtpZigzPT09ZS5ub2RlVHlwZSl7dmFyIGE9ZS50ZXh0Q29udGVudC50cmltKCk7YSYmKHQrPWEuc3BsaXQoL1xzKy8pLmxlbmd0aCl9ZWxzZSBpZigxPT09ZS5ub2RlVHlwZSYmIS9eKHNjcmlwdHxzdHlsZXxub3NjcmlwdCkkL2kudGVzdChlLnRhZ05hbWUpKWZvcih2YXIgbj0wO248ZS5jaGlsZE5vZGVzLmxlbmd0aDtuKyspZ2V0VGV4dChlLmNoaWxkTm9kZXNbbl0pfShkb2N1bWVudC5ib2R5KSxlLmNvdW50SW1hZ2VzKWZvcih2YXIgbj1kb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgiaW1nIiksbz0wO288bi5sZW5ndGg7bysrKW5bb10ubmF0dXJhbFdpZHRoPjI1MCYmbltvXS5uYXR1cmFsSGVpZ2h0PjI1MCYmYSsrO3JldHVybnt3b3Jkczp0LGltYWdlczphfX0sYUdUTS5mLmNwTHN0PWZ1bmN0aW9uKGUsdCxhKXt0cnl7ZS5hZGRFdmVudExpc3RlbmVyKHQsZnVuY3Rpb24oZSl7dmFyIHQ7d2luZG93LmdldFNlbGVjdGlvbiYmKHQ9d2luZG93LmdldFNlbGVjdGlvbigpLnRvU3RyaW5nKCkpJiZhKHQpfSl9Y2F0Y2godCl7YUdUTS5mLmxvZygiZTEyIix7ZWxlbWVudDplLGVycm9yOnR9KX19LGFHVE0uZi5lbExzdD1mdW5jdGlvbihlLHQsYSl7dHJ5e2UuYWRkRXZlbnRMaXN0ZW5lcih0LGZ1bmN0aW9uKGUpe2Zvcih2YXIgdD10aGlzLnRhZ05hbWUudG9Mb3dlckNhc2UoKSxuPSIiLG89IiIscj1udWxsLHM9bnVsbCxpPTAsYz10aGlzO2MmJmMucGFyZW50RWxlbWVudDspYz1jLnBhcmVudEVsZW1lbnQsIW4mJmMuaWQmJihuPSgic3RyaW5nIj09dHlwZW9mIGMubm9kZU5hbWU/Yy5ub2RlTmFtZS50b0xvd2VyQ2FzZSgpKyI6IjoiIikrYy5pZCksIW8mJmMuZ2V0QXR0cmlidXRlKCJjbGFzcyIpJiYobz0oInN0cmluZyI9PXR5cGVvZiBjLm5vZGVOYW1lP2Mubm9kZU5hbWUudG9Mb3dlckNhc2UoKSsiOiI6IiIpK2MuZ2V0QXR0cmlidXRlKCJjbGFzcyIpKTtpZigiaW5wdXQiPT09dHx8InNlbGVjdCI9PT10fHwidGV4dGFyZWEiPT09dCl7Zm9yKGM9dGhpcztjJiZjLnBhcmVudEVsZW1lbnQmJiJmb3JtIiE9PWMudGFnTmFtZS50b0xvd2VyQ2FzZSgpOyljPWMucGFyZW50RWxlbWVudDsiZm9ybSI9PT1jLnRhZ05hbWUudG9Mb3dlckNhc2UoKSYmKHI9e2lkOmMuaWQsY2xhc3M6Yy5nZXRBdHRyaWJ1dGUoImNsYXNzIiksbmFtZTpjLmdldEF0dHJpYnV0ZSgibmFtZSIpLGFjdGlvbjpjLmFjdGlvbixlbGVtZW50czpjLmVsZW1lbnRzLmxlbmd0aH0scz1BcnJheS5wcm90b3R5cGUuaW5kZXhPZi5jYWxsKGMuZWxlbWVudHMsdGhpcykrMSl9Im9iamVjdCI9PXR5cGVvZiB0aGlzLmVsZW1lbnRzJiYibnVtYmVyIj09dHlwZW9mIHRoaXMuZWxlbWVudHMubGVuZ3RoJiYoaT10aGlzLmVsZW1lbnRzLmxlbmd0aCk7dmFyIGY9e3RhZ05hbWU6dCx0YXJnZXQ6dGhpcy50YXJnZXR8fCIiLHBhcmVudElEOm4scGFyZW50Q2xhc3M6byxpZDp0aGlzLmlkfHwiIixuYW1lOnRoaXMuZ2V0QXR0cmlidXRlKCJuYW1lIil8fCIiLGNsYXNzOnRoaXMuZ2V0QXR0cmlidXRlKCJjbGFzcyIpfHwiIixocmVmOnRoaXMuaHJlZnx8IiIsc3JjOnRoaXMuc3JjfHwiIixhY3Rpb246dGhpcy5hY3Rpb258fCIiLHR5cGU6dGhpcy50eXBlfHwiIixlbGVtZW50czppLHBvc2l0aW9uOnMsZm9ybTpyLGh0bWw6dGhpcy5vdXRlckhUTUw/dGhpcy5vdXRlckhUTUwudG9TdHJpbmcoKToiIix0ZXh0OnRoaXMub3V0ZXJUZXh0P3RoaXMub3V0ZXJUZXh0LnRvU3RyaW5nKCk6IiJ9O2YuaHRtbC5sZW5ndGg+NTEyJiYoZi5odG1sPWYuaHRtbC5zbGljZSgwLDUwOSkrIi4uLiIpLGYudGV4dC5sZW5ndGg+NTEyJiYoZi50ZXh0PWYudGV4dC5zbGljZSgwLDUwOSkrIi4uLiIpLGEoZil9KX1jYXRjaCh0KXthR1RNLmYubG9nKCJlMTIiLHtlbGVtZW50OmUsZXJyb3I6dH0pfX0sYUdUTS5mLmFkZEVsTHN0PWZ1bmN0aW9uKGUsdCxhKXtpZihhR1RNLmYudlN0KFtlLHRdKSYmImZ1bmN0aW9uIj09dHlwZW9mIGEpe3ZhciBuPWRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoZSk7Im9iamVjdCI9PXR5cGVvZiBuJiYibnVtYmVyIj09dHlwZW9mIG4ubGVuZ3RoJiYwIT1uLmxlbmd0aCYmbi5mb3JFYWNoKGZ1bmN0aW9uKGUpe2lmKCJjb3B5Ij09PXQpYUdUTS5mLmNwTHN0KGUsdCxhKTtlbHNlIGFHVE0uZi5lbExzdChlLHQsYSl9KX19LGFHVE0uZi5vYnNlcnZlcj1mdW5jdGlvbihlLHQsYSl7aWYoYUdUTS5mLnZTdChbZSx0XSkmJiJmdW5jdGlvbiI9PXR5cGVvZiBhKXtuZXcgTXV0YXRpb25PYnNlcnZlcihmdW5jdGlvbihuKXtuLmZvckVhY2goZnVuY3Rpb24obil7ImNoaWxkTGlzdCI9PT1uLnR5cGUmJm4uYWRkZWROb2Rlcy5sZW5ndGgmJkFycmF5LnByb3RvdHlwZS5mb3JFYWNoLmNhbGwobi5hZGRlZE5vZGVzLGZ1bmN0aW9uKG4pe2lmKDE9PT1uLm5vZGVUeXBlJiYic3RyaW5nIj09dHlwZW9mIG4udGFnTmFtZSYmbi50YWdOYW1lLnRvTG93ZXJDYXNlKCk9PT1lLnRvTG93ZXJDYXNlKCkmJmFHVE0uZi5lbExzdChuLHQsYSksMT09PW4ubm9kZVR5cGUmJm4ucXVlcnlTZWxlY3RvckFsbCl7dmFyIG89bi5xdWVyeVNlbGVjdG9yQWxsKGUudG9Mb3dlckNhc2UoKSk7QXJyYXkucHJvdG90eXBlLmZvckVhY2guY2FsbChvLGZ1bmN0aW9uKGUpe2FHVE0uZi5lbExzdChlLHQsYSl9KX19KX0pfSkub2JzZXJ2ZShkb2N1bWVudC5ib2R5LHtjaGlsZExpc3Q6ITAsc3VidHJlZTohMCxhdHRyaWJ1dGVzOiExfSl9fSxhR1RNLmYuclRlc3Q9ZnVuY3Rpb24oZSx0KXtyZXR1cm4gYUdUTS5mLnZTdChbZSx0XSkmJm5ldyBSZWdFeHAodCwiaSIpLnRlc3QoZSl9LGFHVE0uZi5yTWF0Y2g9ZnVuY3Rpb24oZSx0KXtyZXR1cm4gZS5tYXRjaChuZXcgUmVnRXhwKHQpKX0sYUdUTS5mLnJSZXBsYWNlPWZ1bmN0aW9uKGUsdCxhKXtyZXR1cm4gYUdUTS5mLnZTdChbZSx0LGFdKT9lLnJlcGxhY2UobmV3IFJlZ0V4cCh0LCJnaSIpLGEpOmV9LGFHVE0uZi5pc0lGcmFtZT1mdW5jdGlvbigpe3JldHVybiB3aW5kb3cuc2VsZiE9PXdpbmRvdy50b3B9LGFHVE0uZi5qc2Vycm9ycz1mdW5jdGlvbigpe2FHVE0uZi5ldkxzdG4od2luZG93LCJlcnJvciIsZnVuY3Rpb24oZSl7aWYobnVsbCE9PWUpe3ZhciB0PSJzdHJpbmciPT10eXBlb2YgZS5tZXNzYWdlP2UubWVzc2FnZToiIixhPSJzdHJpbmciPT10eXBlb2YgZS5maWxlbmFtZT9lLmZpbGVuYW1lOiIiO2lmKCJzY3JpcHQgZXJyb3IuIj09dC50b0xvd2VyQ2FzZSgpKXtpZighYSlyZXR1cm47dD10LnJlcGxhY2UoIi4iLCI6IikrIiBlcnJvciBmcm9tIG90aGVyIGRvbWFpbi4ifWEmJih0Kz0iIHwgZmlsZTogIithKTt2YXIgbj1hR1RNLmYuc3RyY2xlYW4oZS5saW5lbm8pOyIwIj09biYmKG49IiIpLG4mJih0Kz0iIHwgbGluZTogIituKTt2YXIgbz1hR1RNLmYuc3RyY2xlYW4oZS5jb2xubyk7IjAiPT1vJiYobz0iIiksbyYmKHQrPSIgfCBjb2w6ICIrbyksYUdUTS5kLmVycm9ycy5wdXNoKHQpO3ZhciByPSIiO3RyeXtyPW5hdmlnYXRvci5hcHBDb2RlTmFtZSsiIHwgIituYXZpZ2F0b3IuYXBwTmFtZSsiIHwgIituYXZpZ2F0b3IuYXBwVmVyc2lvbisiIHwgIituYXZpZ2F0b3IucGxhdGZvcm19Y2F0Y2goZSl7fWlmKGFHVE0uZC5lcnJvcl9jb3VudGVyKys+PTEwMClyZXR1cm47YUdUTS5kLmVycm9yX2NvdW50ZXI8PTUmJmFHVE0uZi5maXJlKHtldmVudDoiZXhjZXB0aW9uIixlcnJtc2c6dCxicm93c2VyOnIsZXJydHlwZToiSlMgRXJyb3IiLHRpbWVzdGFtcDoobmV3IERhdGUpLmdldFRpbWUoKSxlcnJjdDphR1RNLmQuZXJyb3JfY291bnRlcixldmVudE1vZGVsOm51bGx9KX19KX0sYUdUTS5mLnRpbWVyZmt0PWZ1bmN0aW9uKGUpe3ZhciB0PUpTT04ucGFyc2UoYUdUTS5mLnNTdHJmKGUpKTt0LnRpbWVyX21zPTEqdC50aW1lcl9tcyx0LnRpbWVyX2N0KyssdC50aW1lcl90bT10LnRpbWVyX21zKnQudGltZXJfY3QsdC50aW1lcl9zYz1wYXJzZUZsb2F0KCh0LnRpbWVyX3RtLzFlMykudG9GaXhlZCgzKSksdC5ldmVudD10LmV2ZW50fHwidGltZXIiLC0xIT09dC5ldmVudC5pbmRleE9mKCJbc10iKSYmKHQuZXZlbnQ9dC5ldmVudC5yZXBsYWNlKCJbc10iLHQudGltZXJfc2MudG9TdHJpbmcoKSkpLHQuZXZlbnRNb2RlbD1udWxsLGFHVE0uZi5maXJlKHQpfSxhR1RNLmYudGltZXI9ZnVuY3Rpb24oZSx0LGEsbixvKXtpZighZSYmIm9iamVjdCI9PXR5cGVvZiBhJiZhJiYic3RyaW5nIj09dHlwZW9mIGEuZXZlbnQmJihlPWEuZXZlbnQpLGU9ZXx8InRpbWVyIixlKz0iXyIrKG5ldyBEYXRlKS5nZXRUaW1lKCkudG9TdHJpbmcoKSsiXyIrTWF0aC5mbG9vcig5OTk5OTkqTWF0aC5yYW5kb20oKSsxKS50b1N0cmluZygpLGFHVE0uZi5zdG9wdGltZXIoZSksIm9iamVjdCI9PXR5cGVvZiBhJiZhKXZhciByPUpTT04ucGFyc2UoYUdUTS5mLnNTdHJmKGEpKTtlbHNlIHI9e307ci50aW1lcl9ubT1lLHIudGltZXJfbXM9bixyLnRpbWVyX3JwPW8sci50aW1lcl9jdD0wLHIuaWQ9MT09PXIudGltZXJfcnA/c2V0VGltZW91dChmdW5jdGlvbigpe3Q/dChyKTphR1RNLmYudGltZXJma3Qocil9LG4pOnNldEludGVydmFsKGZ1bmN0aW9uKCl7dD90KHIpOmFHVE0uZi50aW1lcmZrdChyKSxyLnRpbWVyX2N0Kyssci50aW1lcl9ycD4wJiZyLnRpbWVyX2N0Pj1yLnRpbWVyX3JwJiZhR1RNLmYuc3RvcHRpbWVyKHIudGltZXJfbm0pfSxuKSxhR1RNLmQudGltZXJbZV09cn0sYUdUTS5mLnN0b3B0aW1lcj1mdW5jdGlvbihlKXtpZigib2JqZWN0IiE9dHlwZW9mIGFHVE0uZC50aW1lciYmKGFHVE0uZC50aW1lcj17fSksIm9iamVjdCI9PXR5cGVvZiBhR1RNLmQudGltZXJbZV0pe3ZhciB0PWFHVE0uZC50aW1lcltlXTsxPT09dC50aW1lcl9ycD9jbGVhclRpbWVvdXQodC5pZCk6Y2xlYXJJbnRlcnZhbCh0LmlkKSxkZWxldGUgYUdUTS5kLnRpbWVyW2VdfX0sYUdUTS5mLmRscmVwZWF0PWZ1bmN0aW9uKGUpe2lmKCJvYmplY3QiPT10eXBlb2YgZSYmZSYmIWFHVE0uZC5kbHJlcGVhdERvbmUpe3ZhciBkYmc9ZnVuY3Rpb24odCxhKXtlLmRlYnVnJiYib2JqZWN0Ij09dHlwZW9mIHdpbmRvdy5jb25zb2xlJiZ3aW5kb3cuY29uc29sZS5sb2cmJndpbmRvdy5jb25zb2xlLmxvZygiYUdUTSBkbHJlcGVhdDogIit0LGEpfSxnZXRTcmM9ZnVuY3Rpb24oKXtyZXR1cm4ibGl2ZSI9PWUuc291cmNlP3dpbmRvd1thR1RNLmMuZ2RsXXx8W106ImRsIj09ZS5zb3VyY2U/YUdUTS5kLmRsfHxbXTphR1RNLmQuZnx8W119LG1hdGNoTGlzdD1mdW5jdGlvbihlLHQpe2Zvcih2YXIgYT1lLnNwbGl0KCIsIiksbj0wO248YS5sZW5ndGg7bisrKXt2YXIgbz1hW25dLnJlcGxhY2UoL15ccyt8XHMrJC9nLCIiKTtpZihvKXt2YXIgcj1vLnJlcGxhY2UoL1suKis/XiR7fSgpfFtcXVxcXS9nLCJcXCQmIikucmVwbGFjZSgvXFxcKi9nLCIuKiIpO3RyeXtpZihuZXcgUmVnRXhwKCJeIityKyIkIiwiaSIpLnRlc3QodCkpcmV0dXJuITB9Y2F0Y2goZSl7fX19cmV0dXJuITF9LHBhcnNlQ29uZD1mdW5jdGlvbihlKXtpZighZSlyZXR1cm4gbnVsbDt2YXIgdD1lLmluZGV4T2YoIlsiKTtpZih0PDApcmV0dXJue2V2OmUsYXR0cjpudWxsLHZhbDpudWxsfTt2YXIgYT1lLmluZGV4T2YoIl0iKTtpZihhPHR8fCFlLnN1YnN0cmluZygwLHQpKXJldHVybiBudWxsO2lmKGErMSE9PWUubGVuZ3RoKXJldHVybiBudWxsO3ZhciBuPWUuc3Vic3RyaW5nKHQrMSxhKSxvPW4uaW5kZXhPZigiOiIpLHI9bz49MD9uLnN1YnN0cmluZygwLG8pOm47cmV0dXJuIHI/e2V2OmUuc3Vic3RyaW5nKDAsdCksYXR0cjpyLHZhbDpvPj0wP24uc3Vic3RyaW5nKG8rMSk6bnVsbH06bnVsbH0sdHJpbT1mdW5jdGlvbihlKXtyZXR1cm4gZS5yZXBsYWNlKC9eXHMrfFxzKyQvZywiIil9LHQ9W107aWYoZS5nYXRlRXZlbnRzKWZvcih2YXIgYT1lLmdhdGVFdmVudHMuc3BsaXQoIiwiKSxuPTA7bjxhLmxlbmd0aDtuKyspe3ZhciBvPXRyaW0oYVtuXSk7aWYobyl7dmFyIHI9by5pbmRleE9mKCI/aWY9Iik7aWYocjwwKXQucHVzaCh7bmFtZTpvLGNvbmQ6bnVsbH0pO2Vsc2V7dmFyIHM9dHJpbShvLnN1YnN0cmluZygwLHIpKTtpZihzKXt2YXIgaT1wYXJzZUNvbmQodHJpbShvLnN1YnN0cmluZyhyKzQpKSk7aXx8ZGJnKCJpbnZhbGlkID9pZj0gcHJlZGljYXRlLCBnYXRlIHRyZWF0ZWQgYXMgdW5jb25kaXRpb25hbDogIitvKSx0LnB1c2goe25hbWU6cyxjb25kOml9KX1lbHNlIGRiZygiZ2F0ZSB0b2tlbiB3aXRoIGVtcHR5IG5hbWUgYmVmb3JlID9pZj0sIHNraXBwZWQ6ICIrbyl9fX12YXIgaGFzRXZlbnQ9ZnVuY3Rpb24oZSx0KXtmb3IodmFyIGE9MDthPGUubGVuZ3RoO2ErKylpZihlW2FdJiZlW2FdLmV2ZW50PT09dClyZXR1cm4hMDtyZXR1cm4hMX0sY29uZFN0YXRlPWZ1bmN0aW9uKGUsdCl7Zm9yKHZhciBhPSExLG49MDtuPGUubGVuZ3RoO24rKyl7dmFyIG89ZVtuXTtpZihvJiZvLmV2ZW50PT09dC5ldil7aWYoYT0hMCxudWxsPT10LmF0dHIpcmV0dXJuIDE7dmFyIHI9b1t0LmF0dHJdO2lmKG51bGw9PXQudmFsKXtpZihudWxsIT1yJiYiIiE9PXIpcmV0dXJuIDF9ZWxzZSBpZihTdHJpbmcocik9PT10LnZhbClyZXR1cm4gMX19cmV0dXJuIGE/MDotMX0sZ2F0ZVJlYWR5PWZ1bmN0aW9uKGUpe2Zvcih2YXIgYT0wO2E8dC5sZW5ndGg7YSsrKXt2YXIgbj10W2FdO2lmKG4uY29uZCl7dmFyIG89Y29uZFN0YXRlKGUsbi5jb25kKTtpZigwPT09byljb250aW51ZTtpZigtMT09PW8pcmV0dXJuITF9aWYoIWhhc0V2ZW50KGUsbi5uYW1lKSlyZXR1cm4hMX1yZXR1cm4hMH0scGFzc2VzPWZ1bmN0aW9uKHQpe2lmKCJvYmplY3QiIT10eXBlb2YgdHx8IXQpcmV0dXJuITE7aWYoITA9PT10LmFHVE1yZXBlYXRlZClyZXR1cm4hMTtpZighMD09PXQuYUdUTWRsKXtpZighZS5ndG1GaXJlZClyZXR1cm4hMX1lbHNlIGlmKCFlLmFndG1GaXJlZClyZXR1cm4hMTtyZXR1cm4oInN0cmluZyIhPXR5cGVvZiB0LmV2ZW50fHwwIT09dC5ldmVudC5pbmRleE9mKCJhR1RNIikpJiYoKCJzdHJpbmciPT10eXBlb2YgdC5ldmVudHx8InN0cmluZyIhPXR5cGVvZiB0LnR5cGV8fCJvYmplY3QiIT10eXBlb2YgdC5mbGFnc3x8IXQuZmxhZ3N8fCF0LmZsYWdzLmVuYWJsZVVudGFnZ2VkUGFnZVJlcG9ydGluZykmJighKCFlLmd0bUV2ZW50cyYmInN0cmluZyI9PXR5cGVvZiB0LmV2ZW50JiYvXmd0bVwuKHN0YXJ0fGluaXRfY29uc2VudHxpbml0fGpzfGRvbXxsb2FkKSQvaS50ZXN0KHQuZXZlbnQpKSYmKCEoZS53aGl0ZWxpc3QmJiJzdHJpbmciPT10eXBlb2YgdC5ldmVudCYmIW1hdGNoTGlzdChlLndoaXRlbGlzdCx0LmV2ZW50KSkmJigoIWUuYmxhY2tsaXN0fHwic3RyaW5nIiE9dHlwZW9mIHQuZXZlbnR8fCFtYXRjaExpc3QoZS5ibGFja2xpc3QsdC5ldmVudCkpJiYhKCFlLm1lc3NhZ2VzJiYic3RyaW5nIiE9dHlwZW9mIHQuZXZlbnQpKSkpKX0sZG9SZXBsYXk9ZnVuY3Rpb24oYSl7YUdUTS5kLmRscmVwZWF0RG9uZT0hMDtmb3IodmFyIG49Z2V0U3JjKCksbz1uJiYibnVtYmVyIj09dHlwZW9mIG4ubGVuZ3RoP24ubGVuZ3RoOjAscj0ib2JqZWN0Ij09dHlwZW9mIGFHVE0uZC5jb25zZW50JiZhR1RNLmQuY29uc2VudCYmYUdUTS5kLmNvbnNlbnQuZ3RtQ29uc2VudCxzPTAsaT1lLm1heEV2ZW50c3x8MCxjPTAsVD0wO1Q8bztUKyspaWYocGFzc2VzKG5bVF0pKXtpZihpJiZzPj1pKWJyZWFrO3MrKzt2YXIgTT1KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihuW1RdKSk7aWYoZS5jbGVhckVjb20mJnImJnZvaWQgMCE9PU0uZWNvbW1lcmNlJiZhR1RNLmYuZmlyZSh7ZWNvbW1lcmNlOm51bGwsYUdUTXJlcGVhdGVkOiEwfSksZGVsZXRlIE0uYUdUTXRzLGRlbGV0ZSBNLmFHVE1wYXJhbXMsZGVsZXRlIE0uZXZlbnRNb2RlbCxkZWxldGUgTVsiZ3RtLnVuaXF1ZUV2ZW50SWQiXSxNLmFHVE1yZXBlYXRlZD0hMCxlLmFkZHBhcmFtZXRlciYmZS5hZGRwYXJhbWV0ZXIubGVuZ3RoKWZvcih2YXIgZD0wO2Q8ZS5hZGRwYXJhbWV0ZXIubGVuZ3RoO2QrKyllLmFkZHBhcmFtZXRlcltkXSYmZS5hZGRwYXJhbWV0ZXJbZF0ucGtleSYmKE1bZS5hZGRwYXJhbWV0ZXJbZF0ucGtleV09ZS5hZGRwYXJhbWV0ZXJbZF0ucHZhbHVlKTthR1RNLmYuZmlyZShNKSxjKyt9dmFyIEc9YT8iIjpmdW5jdGlvbihlKXtmb3IodmFyIGE9W10sbj0wO248dC5sZW5ndGg7bisrKXt2YXIgbz10W25dO2lmKG8uY29uZCl7dmFyIHI9Y29uZFN0YXRlKGUsby5jb25kKTtpZigwPT09ciljb250aW51ZTtpZigtMT09PXIpe2EucHVzaChvLmNvbmQuZXYpO2NvbnRpbnVlfX1oYXNFdmVudChlLG8ubmFtZSl8fGEucHVzaChvLm5hbWUpfXJldHVybiBhfShuKS5qb2luKCIsIik7IWEmJmUuZmFsbGJhY2tFdmVudCYmYz4wJiZhR1RNLmYuZmlyZSh7ZXZlbnQ6ImFHVE1fcmVwZWF0X2ZhbGxiYWNrIixhR1RNcmVwZWF0Q291bnQ6YyxhR1RNcmVwZWF0U291cmNlOmUuc291cmNlLGFHVE1yZXBlYXRNaXNzaW5nOkcsYUdUTXJlcGVhdFdhaXRlZDpmfSksZGJnKCJyZXBsYXllZCAiK2MrIiBldmVudChzKSwgZW5yaWNoZWQ9IisoYT8ieWVzIjoibm8oZmFsbGJhY2spIikrKGE/IiI6IiwgbWlzc2luZz0iK0cpKX07aWYoZGJnKCJzdGFydCIsZSksIWFHVE0uZC5kbHJlcGVhdFBvbGxpbmcpaWYoZ2F0ZVJlYWR5KGdldFNyYygpKSlkb1JlcGxheSghMCk7ZWxzZXthR1RNLmQuZGxyZXBlYXRQb2xsaW5nPSEwLGFHVE0uZC5kbHJlcGVhdEdhdGU9ZS5nYXRlRXZlbnRzfHwiIjt2YXIgYz0ibnVtYmVyIj09dHlwZW9mIGUucG9sbE1zJiZlLnBvbGxNcz49NTA/ZS5wb2xsTXM6MzAwLGY9Im51bWJlciI9PXR5cGVvZiBlLnRpbWVvdXRNcyYmZS50aW1lb3V0TXM+MD9lLnRpbWVvdXRNczowLFQ9Zj4wP2Y6M2U0LE09MCxkPXNldEludGVydmFsKGZ1bmN0aW9uKCl7aWYoYUdUTS5kLmRscmVwZWF0RG9uZSljbGVhckludGVydmFsKGQpO2Vsc2V7aWYoZ2F0ZVJlYWR5KGdldFNyYygpKSlyZXR1cm4gY2xlYXJJbnRlcnZhbChkKSx2b2lkIGRvUmVwbGF5KCEwKTsoTSs9Yyk+PVQmJihjbGVhckludGVydmFsKGQpLGY+MD9kb1JlcGxheSghMSk6KGFHVE0uZC5kbHJlcGVhdFBvbGxpbmc9ITEsZGJnKCJnYXRlIG5ldmVyIHNhdGlzZmllZCB3aXRoaW4gY2FwIGFuZCBubyBmYWxsYmFjayAtIG5vdGhpbmcgcmVwZWF0ZWQ7IHBvbGxpbmcgcmVsZWFzZWQgZm9yIGEgbGF0ZXIgY2FsbCIpKSl9fSxjKX19fSxhR1RNLmYuaW5pdD1mdW5jdGlvbigpeyFhR1RNLmMuZGVidWcmJmFHVE0uZi5vcHRvdXQoKXx8KGFHVE0uZi5jb25maWcoYUdUTS5jKSxhR1RNLmMuaWZyYW1lU3VwcG9ydCYmYUdUTS5kLmlzX2lmcmFtZT8oYUdUTS5kLmNvbnNlbnQuZ3RtQ29uc2VudD0hMCxhR1RNLmQuY29uc2VudC5oYXNSZXNwb25zZT0hMCxhR1RNLmQuY29uc2VudC5mZWVkYmFjaz0iUGFnZSBpcyBpRnJhbWUiLGFHVE0uZC5pZnJhbWUuaWZMaXN0ZW58fChhR1RNLmQuaWZyYW1lLmlmTGlzdGVuPSEwLHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCJtZXNzYWdlIixhR1RNLmYuaWZIU2xpc3RlbikpLGFHVE0uZC5pbml0fHxhR1RNLmYuaW5qZWN0KCkpOiJzdHJpbmciPT10eXBlb2YgYUdUTS5jLmNtcCYmYUdUTS5jLmNtcD8ibm9uZSI9PWFHVE0uYy5jbXA/KGFHVE0uZC5jb25zZW50PXtndG1Db25zZW50OiEwLGhhc1Jlc3BvbnNlOiEwLGZlZWRiYWNrOiJObyBDb25zZW50IENoZWNrIGNvbmZpZ3VyZWQifSxhR1RNLmYuaW5qZWN0KCkpOihhR1RNLmYubG9hZF9jYyhhR1RNLmMuY21wLGFHVE0uZi5jb25zZW50X2xpc3RlbmVyKSxhR1RNLmYuaW5pdEdUTSghMCkpOihhR1RNLmYuY29uc2VudF9saXN0ZW5lcigpLGFHVE0uZi5pbml0R1RNKCEwKSksYUdUTS5mLmpzZXJyb3JzKCkpfSxhR1RNLmYuZW5jPWZ1bmN0aW9uKGUsdCl7dmFyIGE9dCU2MysxLG49YnRvYSh1bmVzY2FwZShlbmNvZGVVUklDb21wb25lbnQoZSkpKSxvPTA7Ij0iPT09bi5jaGFyQXQobi5sZW5ndGgtMSkmJm8rKywiPSI9PT1uLmNoYXJBdChuLmxlbmd0aC0yKSYmbysrLG49bi5zbGljZSgwLG4ubGVuZ3RoLW8pO2Zvcih2YXIgcj0xPT09bz8ifiI6Mj09PW8/In5+IjoiIixzPSIiLGk9MDtpPG4ubGVuZ3RoO2krKyl7dmFyIGM9IkFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU2Nzg5Ky8iLmluZGV4T2Yobi5jaGFyQXQoaSkpO3MrPWM8MD9uLmNoYXJBdChpKToiQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ejAxMjM0NTY3ODktXyIuY2hhckF0KChjK2EpJTY0KX1yZXR1cm4gbz9zLnNsaWNlKDAsMykrcitzLnNsaWNlKDMpOnN9LGFHVE0uZi54c2VuZD1mdW5jdGlvbihlLHQsYSxuLG8pe2lmKGUmJiJzdHJpbmciPT10eXBlb2YgZSl0cnl7dmFyIHIscz1uZXcgWE1MSHR0cFJlcXVlc3Q7cmV0dXJuIHMub3BlbigiUE9TVCIsZSwhMCksITA9PT1vPyhzLndpdGhDcmVkZW50aWFscz0hMCxzLnNldFJlcXVlc3RIZWFkZXIoIkNvbnRlbnQtVHlwZSIsInRleHQvcGxhaW47Y2hhcnNldD1VVEYtOCIpKTpzLnNldFJlcXVlc3RIZWFkZXIoIkNvbnRlbnQtVHlwZSIsImFwcGxpY2F0aW9uL2pzb24iKSxyPWEmJiJudW1iZXIiPT10eXBlb2YgbiYmbj49MT8neyJxIjoiJythR1RNLmYuZW5jKGFHVE0uZi5zU3RyZih0KSxuKSsnIn0nOid7ImUiOicrYUdUTS5mLnNTdHJmKHQpKyJ9IixzLnNlbmQociksc31jYXRjaCh0KXtyZXR1cm4gYUdUTS5mLmxvZygiZV94c2VuZCIse21zZzp0Lm1lc3NhZ2UsdXJsOmV9KSxudWxsfX0sYUdUTS5mLnN0YWNrU3JjPWZ1bmN0aW9uKGUpe3ZhciB0LGEsbj1TdHJpbmcoZXx8IiIpLm1hdGNoKC8oYmxvYjopP2h0dHBzPzpcL1wvW15ccygpJyJdKy9nKXx8W10sbz0iIixyPSIiO3RyeXtyPVN0cmluZyhsb2NhdGlvbi5ocmVmKS5zcGxpdCgvWz8jXS8pWzBdfWNhdGNoKGUpe31mb3IodD0wO3Q8bi5sZW5ndGg7dCsrKWlmKGE9blt0XS5yZXBsYWNlKC8oOlxkKyl7MSwyfSQvLCIiKS5zcGxpdCgvWz8jXS8pWzBdLHQpe2lmKGEhPT1vKXJldHVybiBhPT09cj8iaW5saW5lIjovXmJsb2I6Ly50ZXN0KGEpPyJibG9iIjphLnJlcGxhY2UoL14oaHR0cHM/OlwvXC8pW15cL10qQC8sIiQxIil9ZWxzZSBvPWE7cmV0dXJuIiJ9LGFHVE0uZi5kbEhvb2tUcmFwPWZ1bmN0aW9uKGUpe2lmKGUmJmFHVE0uZC5kbEhvb2tUcmFwIT09ZSl0cnl7dmFyIHQ9T2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcihlLCJwdXNoIiksYT1lLnB1c2g7aWYodCYmKCF0LmNvbmZpZ3VyYWJsZXx8ISgidmFsdWUiaW4gdCkpKXJldHVybjtPYmplY3QuZGVmaW5lUHJvcGVydHkoZSwicHVzaCIse2NvbmZpZ3VyYWJsZTohMCxlbnVtZXJhYmxlOiEwLGdldDpmdW5jdGlvbigpe3JldHVybiBhfSxzZXQ6ZnVuY3Rpb24odCl7dHJ5e2lmKCFhR1RNLmQub3JpZ2luYWxETHB1c2gmJi9zYW5kYm94L2kudGVzdChTdHJpbmcoYSkpJiYoYUdUTS5kLm9yaWdpbmFsRExwdXNoPWEpLCFhR1RNLmQub3JpZ2luYWxETHB1c2h8fC9zYW5kYm94L2kudGVzdChTdHJpbmcodCkpKXJldHVybiB2b2lkKGE9dCk7YUdUTS5kLmRsSG9va1NyY3x8KGFHVE0uZC5kbEhvb2tTcmM9YUdUTS5mLnN0YWNrU3JjKChuZXcgRXJyb3IpLnN0YWNrKSksT2JqZWN0LmRlZmluZVByb3BlcnR5KGUsInB1c2giLHt2YWx1ZTp0LHdyaXRhYmxlOiEwLGNvbmZpZ3VyYWJsZTohMCxlbnVtZXJhYmxlOiEwfSl9Y2F0Y2goZSl7YT10fX19KSxhR1RNLmQuZGxIb29rVHJhcD1lfWNhdGNoKGUpe319LGFHVE0uZi5zZW5kbmF1cz1mdW5jdGlvbihlKXtpZihlJiYib2JqZWN0Ij09dHlwZW9mIGUpe2FHVE0uYy5kbE9yZ1B1c2gmJmFHVE0uZi5kbEhvb2tUcmFwKHdpbmRvd1thR1RNLmMuZ2RsXSk7dmFyIHQ9d2luZG93W2FHVE0uYy5nZGxdLnB1c2g7IWFHVE0uZC5vcmlnaW5hbERMcHVzaCYmL3NhbmRib3gvaS50ZXN0KHQudG9TdHJpbmcoKSkmJihhR1RNLmQub3JpZ2luYWxETHB1c2g9dCk7dmFyIGE9ITE7aWYoYUdUTS5jLmRsT3JnUHVzaCYmYUdUTS5kLm9yaWdpbmFsRExwdXNoJiZhR1RNLmQub3JpZ2luYWxETHB1c2ghPT10KXt2YXIgbj10LnRvU3RyaW5nKCk7L3NhbmRib3gvaS50ZXN0KG4pP2FHVE0uZC5vcmlnaW5hbERMcHVzaD10OihhPSEwLGFHVE0uZC5kbEhvb2tMb2dnZWR8fChhR1RNLmQub3JpZ2luYWxETHB1c2goe2V2ZW50OiJleGNlcHRpb24iLGVycnR5cGU6IkRMIEVycm9yIixlcnJtc2c6IkZ1bmN0aW9uIGRhdGFMYXllci5wdXNoIGhvb2tlZCAtIG5vIGxvbmdlciBmcm9tIEdUTSIsZmN0X2hvb2s6bixmY3RfaG9va19zcmM6YUdUTS5kLmRsSG9va1NyY3x8IiIsZmN0X29yaWc6YUdUTS5kLm9yaWdpbmFsRExwdXNoLnRvU3RyaW5nKCksdGltZXN0YW1wOihuZXcgRGF0ZSkuZ2V0VGltZSgpLGV2ZW50TW9kZWw6bnVsbH0pLGFHVE0uZC5kbEhvb2tMb2dnZWQ9ITApLCJyZXN0b3JlIj09PWFHVE0uYy5kbE9yZ1B1c2gmJih3aW5kb3dbYUdUTS5jLmdkbF0ucHVzaD1hR1RNLmQub3JpZ2luYWxETHB1c2gsYT0hMSkpfWEmJiJ1c2UiPT09YUdUTS5jLmRsT3JnUHVzaD9hR1RNLmQub3JpZ2luYWxETHB1c2goZSk6d2luZG93W2FHVE0uYy5nZGxdLnB1c2goZSksImZ1bmN0aW9uIj09dHlwZW9mIGFHVE0uZi5zZW5kbmF1c19jYWxsYmFjayYmYUdUTS5mLnNlbmRuYXVzX2NhbGxiYWNrKGUpLGFHVE0uZi5sb2coIm05IixlKX19LGFHVE0uZi5maXJlPWZ1bmN0aW9uKGUpe2lmKCJvYmplY3QiPT10eXBlb2YgZSYmZSl7dHJ5e2lmKCEoYT1KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihlKSkpKXJldHVybiB2b2lkIGFHVE0uZi5sb2coImUxNSIsYSl9Y2F0Y2gobil7dmFyIHQ9ImFHVE0gRmlyZSBFcnJvciAoSlNPTi5wYXJzZSkiOyJzdHJpbmciPT10eXBlb2YgZS5ldmVudCYmKHQ9dCsiIChFdmVudDogIitlLmV2ZW50KyIpIik7dmFyIGE9e2V2ZW50OiJleGNlcHRpb24iLGVycm1zZzpuLm1lc3NhZ2UsZXJydHlwZTp0LHRpbWVzdGFtcDoobmV3IERhdGUpLmdldFRpbWUoKSxlcnJjdDphR1RNLmQuZXJyb3JfY291bnRlcnx8MSxldmVudE1vZGVsOm51bGx9O2FHVE0uZi5sb2coImUxNSIsYSl9aWYoISgibnVtYmVyIj09dHlwZW9mIGEuYUdUTXRzfHwib2JqZWN0Ij09dHlwZW9mIGEuZXZlbnRNb2RlbCYmYS5ldmVudE1vZGVsfHwic3RyaW5nIiE9dHlwZW9mIGEuZXZlbnQmJiJzdHJpbmciPT10eXBlb2YgYS50eXBlJiYib2JqZWN0Ij09dHlwZW9mIGEuZmxhZ3MmJiJib29sZWFuIj09dHlwZW9mIGEuZmxhZ3MuZW5hYmxlVW50YWdnZWRQYWdlUmVwb3J0aW5nJiZhLmZsYWdzLmVuYWJsZVVudGFnZ2VkUGFnZVJlcG9ydGluZykpe2lmKGEuYUdUTXRzPURhdGUubm93KCksYS5ldmVudE1vZGVsPW51bGwsYUdUTS5jLmNvbnNlbnRfZXZlbnRzJiYic3RyaW5nIj09dHlwZW9mIGEuZXZlbnQmJigiLCIrYUdUTS5jLmNvbnNlbnRfZXZlbnRzKyIsIikuaW5kZXhPZigiLCIrYS5ldmVudCsiLCIpPj0wKWlmKCJvYmplY3QiPT10eXBlb2YgYUdUTS5jLmNvbnNlbnRfZXZlbnRfYXR0clthLmV2ZW50XSlmb3IodmFyIG4gaW4gYUdUTS5jLmNvbnNlbnRfZXZlbnRfYXR0clthLmV2ZW50XSl2b2lkIDAhPT1hW25dJiYoYUdUTS5jLmNvbnNlbnRfZXZlbnRfYXR0clthLmV2ZW50XVtuXSYmYVtuXSE9YUdUTS5jLmNvbnNlbnRfZXZlbnRfYXR0clthLmV2ZW50XVtuXXx8YUdUTS5mLnJ1bl9jYygidXBkYXRlIikpO2Vsc2UgYUdUTS5mLnJ1bl9jYygidXBkYXRlIik7aWYoYUdUTS5jLmRsU2V0JiYib2JqZWN0Ij09dHlwZW9mIGdvb2dsZV90YWdfbWFuYWdlciYmIm9iamVjdCI9PXR5cGVvZiBnb29nbGVfdGFnX21hbmFnZXJbYUdUTS5jLmd0bUlEXSYmT2JqZWN0LmtleXMoYUdUTS5jLmRsU2V0KS5mb3JFYWNoKGZ1bmN0aW9uKGUpe3ZhciB0PWFHVE0uYy5kbFNldFtlXSxuPWdvb2dsZV90YWdfbWFuYWdlclthR1RNLmMuZ3RtSURdW2FHVE0uYy5nZGxdLmdldCh0KTt2b2lkIDAhPT1uJiYoYVtlXT1uKX0pLCgib2JqZWN0IiE9dHlwZW9mIGFHVE0uZC5jb25zZW50fHwhYUdUTS5kLmNvbnNlbnQuaGFzUmVzcG9uc2V8fCFhR1RNLmQuY29uc2VudC5ndG1Db25zZW50KSYmKCJzdHJpbmciIT10eXBlb2YgYS5ldmVudHx8MCE9PWEuZXZlbnQuaW5kZXhPZigiYUdUTSIpKSYmIWEuX25vQ29uc2VudHx8YUdUTS5jLmlmcmFtZVN1cHBvcnQmJmFHVE0uZC5pc19pZnJhbWUmJiFhR1RNLmQuaWZyYW1lLm9yaWdpbilyZXR1cm4gZGVsZXRlIGEuYUdUTXRzLGRlbGV0ZSBhLmV2ZW50TW9kZWwsdm9pZCBhR1RNLmQuZi5wdXNoKEpTT04ucGFyc2UoYUdUTS5mLnNTdHJmKGEpKSk7aWYoYS5fcG9zdCYmIWEuX3Bvc3Rfc2VudCl7dmFyIG89Im9iamVjdCI9PXR5cGVvZiBhLl9wb3N0P2EuX3Bvc3Q6e30scj0ic3RyaW5nIj09dHlwZW9mIG8udXJsJiZvLnVybD9vLnVybDphR1RNLmMudHJhbnNwb3J0X3VybDtpZihyKXt2YXIgcz0iYm9vbGVhbiI9PXR5cGVvZiBvLmVuYz9vLmVuYzohIWFHVE0uYy50cmFuc3BvcnRfZW5jLGk9Im51bWJlciI9PXR5cGVvZiBvLnNhbHQmJm8uc2FsdD49MT9vLnNhbHQ6Im51bWJlciI9PXR5cGVvZiBhR1RNLmMudHJhbnNwb3J0X3NhbHQmJmFHVE0uYy50cmFuc3BvcnRfc2FsdD49MT9hR1RNLmMudHJhbnNwb3J0X3NhbHQ6YUdUTS5jLnNlc3Npb25fc2FsdHx8MCxjPUpTT04ucGFyc2UoYUdUTS5mLnNTdHJmKGEpKTtkZWxldGUgYy5fcG9zdCxkZWxldGUgYy5fcG9zdF9zZW50LGRlbGV0ZSBjLmV2ZW50TW9kZWwsby5jb25zZW50JiYib2JqZWN0Ij09dHlwZW9mIGFHVE0uZC5jb25zZW50JiYoYy5jb25zZW50PUpTT04ucGFyc2UoYUdUTS5mLnNTdHJmKGFHVE0uZC5jb25zZW50KSkpLGFHVE0uZi54c2VuZChyLGMscyxpKSxhLl9wb3N0X3NlbnQ9ITB9fShhR1RNLmQuY29uc2VudC5ndG1Db25zZW50fHwic3RyaW5nIj09dHlwZW9mIGEuZXZlbnQmJjA9PT1hLmV2ZW50LmluZGV4T2YoImFHVE0iKXx8YS5fbm9Db25zZW50KSYmKCJzdHJpbmciPT10eXBlb2YgYS5ldmVudCYmMD09PWEuZXZlbnQuaW5kZXhPZigiYUdUTSIpfHwoZGVsZXRlIGFbImd0bS51bmlxdWVFdmVudElkIl0sZGVsZXRlIGEuYUdUTXBhcmFtcyxhLmFHVE1wYXJhbXM9SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYoYSkpKSxhR1RNLmQuZGwucHVzaChhKSxhLl9ub0RMUHVzaD8iZnVuY3Rpb24iPT10eXBlb2YgYUdUTS5mLnNlbmRuYXVzX2NhbGxiYWNrJiZhR1RNLmYuc2VuZG5hdXNfY2FsbGJhY2soYSk6YUdUTS5jLmlmcmFtZVN1cHBvcnQmJmFHVE0uZC5pc19pZnJhbWUmJiJzdHJpbmciPT10eXBlb2YgYS5ldmVudD9hR1RNLmYuaUZyYW1lRmlyZShhKTphR1RNLmYuc2VuZG5hdXMoYSkpLCJmdW5jdGlvbiI9PXR5cGVvZiBhR1RNLmYuZmlyZV9jYWxsYmFjayYmYUdUTS5mLmZpcmVfY2FsbGJhY2soYSksYUdUTS5mLmxvZygibTciLGEpfX1lbHNlIGFHVE0uZi5sb2coImU5Iix7bzp0eXBlb2YgZX0pfTs=');
  // Pre-aGTM Init Script: prepended verbatim before the library. User code
  // is wrapped in an IIFE inside try/catch so a runtime error does not
  // abort the rest of the /aGTM.js response. Note: a SYNTAX error in user
  // code still aborts parsing — try/catch only catches runtime throws.
  // Leading "\n" inside the IIFE protects against trailing line comments
  // in user code; trailing ";\n" closes any open expression cleanly.
  const preInit = (CFG.preInitEnabled && CFG.preInitCode) ? 'try{(function(){\n' + CFG.preInitCode + '\n;})();}catch(e){if(typeof console!=="undefined"&&console.error)console.error("[aGTM preInit]",e);}\n' : '';
  // A withheld preset must be visible to whoever integrates the page - otherwise
  // "the sGTM runs on another domain and nobody filled out Additional CORS Origins"
  // looks exactly like a first-time visitor, forever. Says nothing about the
  // visitor, so it is safe to print on any page.
  // Wrapped: a page that replaced console.warn with something that throws must
  // not lose the library over a notice.
  const foreignNotice = foreignEmbed ? 'try{if(typeof console!=="undefined"&&console.warn)console.warn("[aGTM] Served WITHOUT session data (no user id, no stored consent): this page is on another site than the sGTM host, and it is either missing from the sGTM Client field Additional CORS Origins or sent no Referer (Referrer-Policy no-referrer or same-origin). If this is your own site, add its host there, and load aGTM.js with crossorigin=use-credentials if it sends no Referer.");}catch(e){}\n' : '';
  const jsCode = preInit + foreignNotice + agtm + cmp + config + 'aGTM.f.init();';

  setResponseStatus(200);
  setCorsHeaders();
  // charset explicitly: a classic <script src> inherits the DOCUMENT's encoding
  // when the response omits it, and this body carries JSON.stringify(c) — page URL,
  // inline CMP code — so a non-UTF-8 page would mojibake the config. v1.4.3pre sent
  // it; the v1.5 refactor dropped it.
  setResponseHeader('Content-Type', 'text/javascript; charset=utf-8');
  // Which Client version answered. The v1.4.3pre client sent this and v1.5 lost
  // it, which is exactly backwards: a tenant runs the Client for months without
  // touching it, so "which version is live on this container" is a question only
  // the response itself can answer. Set on every /aGTM.js path incl. the 403s —
  // a blocked visitor is the case where you most want to know what blocked them.
  setResponseHeader('x-agtm-version', aGTMversion);
  // Same notice for whoever reads the network panel rather than the console.
  if (foreignEmbed) setResponseHeader('x-agtm-preset', 'withheld-cross-site');
  // This body is per-visitor: it inlines cfg.session with uid, sid and — for a
  // returning visitor — their recorded consent, while the URL
  // (/aGTM.js?id=GTM-XXX&c=<page>) is identical for everyone. A shared cache
  // (CDN, corporate proxy) that stores it hands one visitor's session and
  // consent decision to every subsequent one. Until the fingerprint guard
  // landed, nearly every response carried a Set-Cookie, which most CDNs treat
  // as "do not cache" — so removing those writes made this response MORE
  // cacheable. The guarantee has to be stated rather than inherited.
  setResponseHeader('Cache-Control', 'private, no-store');
  setResponseBody(jsCode);
  returnResponse();
};


const afterBotCheck = function(isBot) {
  if (isBot) {
    logToConsole('warn', '\u2717 Bot detected', userAgent);
    setResponseStatus(403);
    setResponseHeader('x-agtm-version', aGTMversion);
    returnResponse();
    return;
  }

  if (foreignEmbed) {
    buildAndSend(null);
    return;
  }

  // ── 2. User ID resolution ──────────────────────────────────────────────────
  // Phase 1 redesign collapses presession + session into a single Session API
  // call. The same uid is used throughout the lifecycle: existing cookie wins,
  // otherwise fingerprint. No more random uid generation — the session API
  // record key stays consistent across loads, so consent persisted under it on
  // one page is found on the next.
  const uidCookie = readUidCookie();
  const existingCookie = uidCookie.value;
  const legacyCookieName = uidCookie.legacy;
  const staleCookieNames = uidCookie.stale;
  const fpUid = CFG.fingerprintAllowed ? getFingerprint() + (CFG.debugSuffix ? '_' + CFG.debugSuffix : '') : '';
  const sessionUid = existingCookie || fpUid;
  if (CFG.debug) logToConsole('debug', 'User ID for session', sessionUid);

  // Two pieces of state the cookie cleanup below needs, held as const
  // containers with property mutation rather than as reassigned `let`. That is
  // the pattern proven inside this sandbox (see `sessionData.uid` in the
  // promote callback); rebinding a top-level `let` from inside a `.then()`
  // closure has no precedent here and was backed out once already.
  //
  // They must NOT live on `sessionData`: that object is handed to the browser
  // verbatim as `cfg.session`, so every field added to it becomes readable by
  // every script on the page.
  //
  // `sessionRead.ok` starts true because "no Session API configured" is not an
  // outage — there is simply no server memory, and a cleanup is safe. It is
  // cleared only when a configured Session API fails to answer authoritatively.
  const sessionRead = {ok: true};
  const promoteState = {retry: false};


  // ── 3. Single Session API call ────────────────────────────────────────────
  // Response may include a `consent` object (passed through to cfg.session.consent)
  // OR the Client constructs server-side auto-denial when the user is a returning
  // visitor with no recorded consent. Cookie management runs after this, based on
  // whether the resulting consent state grants the required services.
  const afterSession = function(sessionData) {
    // Lazy F→C promote: returning visitor whose cookie still carries an
    // F.* fingerprint while the Session API already has a real (non-auto-
    // denial) consent on file. Migrates them on this request so subsequent
    // api4sources/Session API writes land under C.* without waiting for
    // the cookie to expire (default 365 days). One-shot per visitor — once
    // the C.* cookie is set, existingCookie starts with C.* on the next
    // visit and this branch skips.
    //
    // Auto-denial guards (must all be defensive):
    //  - services sentinel `',aGTMconsent,'` — a real CMP never emits this.
    //  - `typeof blocked !== 'undefined'` — the auto-denial constructor
    //    sets `blocked` regardless of its value (CFG.autoDenyLoadGtm can
    //    be `false`, in which case `blocked: false` and a `blocked !== true`
    //    check would let promote fire on a denied visitor). Also: GTM's
    //    sandboxed-JS template parser does not accept the `in` membership
    //    operator (`'k' in obj`) outside of `for (k in obj)` loops, so the
    //    `typeof` form is required.
    //  - explicit signal: at least one of services/purposes/vendors must
    //    be non-empty, so we don't promote on an empty/corrupt session
    //    consent block when no consent_service is configured.
    const sessionConsent = sessionData.consent;
    const sessionIsAutoDenial = !!sessionConsent && (sessionConsent.services === ',aGTMconsent,' || typeof sessionConsent.blocked !== 'undefined');
    const sessionHasExplicitSignal = !!sessionConsent && !!((sessionConsent.services || '') || (sessionConsent.purposes || '') || (sessionConsent.vendors || ''));
    const sessionConsentGranted = !!sessionConsent && sessionConsent.hasResponse === true && !sessionIsAutoDenial && sessionHasExplicitSignal && hasRequiredConsent(sessionConsent.services || '', sessionConsent.purposes || '', sessionConsent.vendors || '');
    const shouldLazyPromote = sessionConsentGranted && isFingerprintUid(existingCookie) && CFG.sessionApiUrl && CFG.tenantID && CFG.cookieMode !== 'never';
    // A withdrawal the Session API has on record (F-154). Under
    // cookieMode='consent' the cookie's mere presence used to count as the
    // consent, so a recorded withdrawal never reached the cookie on this path;
    // it was even refreshed on every request. Only the /aGTMconsent POST writes
    // a decision into the record, and it deletes the cookie itself — so this
    // branch covers what that handler cannot: cookie_delete switched on after
    // the withdrawal, a changed consent requirement, a POST whose Set-Cookie
    // never reached the browser (plausibly a navigation that aborted the
    // request after the record was written — not observed), or another writer
    // to the Session API. (Before F-160 a cross-origin consent POST did not arrive at all.)
    // Stricter than the POST handler, which deletes on any !granted: only
    // POSITIVE evidence counts here — an authoritative answer, a real CMP
    // decision (hasResponse, not the auto-denial block, an explicit signal)
    // that does not grant the required consent. No record, an outage or an
    // auto-denial say nothing about this visitor and leave the cookie alone —
    // deleting on ignorance would drop the ids of real visitors whose consent
    // simply is not on file. With no consent requirement configured this never
    // fires: `!consentConditionMissing` below excludes it (F-165). Three of the terms
    // (sessionRead.ok, hasResponse, existingCookie) are already implied by the
    // pass-through filter further down and kept as defence in depth.
    // `!consentConditionMissing` for the same reason as in the POST handler: an
    // empty requirement is not evidence of a withdrawal (F-165).
    const sessionConsentRevoked = CFG.cookieMode === 'consent' && !consentConditionMissing && !!existingCookie && sessionRead.ok && !!sessionConsent && sessionConsent.hasResponse === true && !sessionIsAutoDenial && sessionHasExplicitSignal && !hasRequiredConsent(sessionConsent.services || '', sessionConsent.purposes || '', sessionConsent.vendors || '');

    const continueAfterSession = function() {
      let cookieAllowed = (CFG.cookieMode === 'always') ||
                         (CFG.cookieMode === 'consent' && !!existingCookie && !sessionConsentRevoked);
      if (CFG.cookieMode === 'consent' && !cookieAllowed && sessionData.consent) {
        const c = sessionData.consent;
        if (hasRequiredConsent(c.services || '', c.purposes || '', c.vendors || '')) {
          cookieAllowed = true;
        }
      }

      // Delete the cookie when the recorded consent was withdrawn (F-154).
      // The former condition here could never be true: under 'consent',
      // cookieAllowed WAS !!existingCookie, so "cookie present and not
      // allowed" was a contradiction. Name-spanning like the POST handler —
      // an id read from a legacy name would otherwise come straight back.
      // Logged at warn, not debug: in healthy operation the POST handler has
      // already deleted the cookie, so this firing is an anomaly — and a
      // mistyped consent requirement makes it fire for EVERY consenting
      // returning visitor, which would otherwise drop their ids silently. The
      // uid is left out on purpose; the requirement and the recorded strings
      // are what a tenant needs to spot a mismatch. Two limits, both accepted:
      // with cookie_delete off, the refresh stops for the same visitors WITHOUT
      // a log line (logging there would fire on every request); and a cookie
      // this delete cannot reach (another domain, or another path that still
      // covers the /aGTM.js request, e.g. after a cookie_domain change)
      // repeats this line on every request while the withdrawal stays on
      // record, until it expires — the refresh is stopped, so it does expire.
      if (sessionConsentRevoked && data.cookie_delete) {
        deleteUidCookies({domain: CFG.cookieDomain, path: '/', sameSite: 'none', httpOnly: true, secure: true, 'max-age': 0});
        logToConsole('warn', '✓ User ID cookie deleted: the recorded consent does not grant the required one', {required: {service: CFG.consentService, purpose: CFG.consentPurpose, vendor: CFG.consentVendor}, recorded: {services: sessionConsent.services || '', purposes: sessionConsent.purposes || '', vendors: sessionConsent.vendors || ''}});
      }
      // An F.* value must never sit in the user-ID cookie. The fingerprint is
      // derived from IP + UA + client hints + ASN/geo, so it is NOT
      // per-visitor: two people behind the same NAT running the same browser
      // share it. Without a cookie that collision stays transient (the
      // fingerprint carries a rolling YYYYMMDD); written into a cookie it
      // freezes for cookie_lifetime, and the second visitor inherits the
      // first one's identity AND their recorded consent. SESSION-REDESIGN §7b
      // named the format side of this when the F→C promote was introduced —
      // but the promote only healed the consent path while this branch kept
      // producing the problem (origin 9d302d7, same commit as F-127/F-130).
      //
      // The stable C.* is created the moment consent is granted (promote
      // path), which is the v1.3 semantics the redesign meant to preserve. A
      // visitor who has not answered the CMP therefore carries no cookie —
      // including under cookieMode='always'. Deliberate: 'always' means "set
      // the cookie regardless of consent", not "freeze a shared fingerprint".
      const willWriteFreshC = !!(cookieAllowed && isCookieUid(sessionData.uid));

      // Clean up a legacy F.* cookie from an earlier v1.5 deploy. Independent
      // of `cookie_delete`, because this is a data-integrity correction of the
      // Client's own past bug, not a consent decision — the field's help text
      // says so. Four guards, and every one of them was a review finding:
      //
      //  - `cookieMode !== 'never'`: in that mode the Client has never sent a
      //    Set-Cookie header of any kind, so there is nothing of ours to clean
      //    up and emitting one would break the mode's own promise.
      //  - `!willWriteFreshC`: this same request is about to overwrite it.
      //  - `sessionRead.ok`: a Session API that did not answer tells us
      //    NOTHING about this visitor. Without this the branch deleted every
      //    F.* cookie during an api4sgtm outage — the opposite of the promise
      //    made two lines down, and unrecoverable: after the outage the
      //    visitor re-derives today's fingerprint, so a consent stored under
      //    yesterday's is orphaned and they are asked again.
      //  - `!promoteRetry`: a promote that failed TRANSIENTLY (5xx/timeout)
      //    must keep the cookie so the next request can retry. A definitive
      //    refusal (404 "no active session", 409) is not retried — otherwise
      //    the fingerprint would stay in the browser forever, which is the
      //    state this cleanup exists to end.
      if (CFG.cookieMode !== 'never' && existingCookie && isFingerprintUid(existingCookie) && !willWriteFreshC && sessionRead.ok && !promoteState.retry) {
        writeCookie('', 0);
      }

      // Write/refresh cookie if allowed. For returning visitors with stored
      // granted consent this restores parity (otherwise the cookie max-age
      // expires until the user re-interacts with the CMP). When a lazy
      // promote happened above, sessionData.uid is now the new C.* — this
      // is what gets written, replacing the F.* in the browser.
      if (willWriteFreshC) {
        writeCookie(sessionData.uid);
      }

      // Retire the pre-rename cookie once its value has been carried over —
      // otherwise the browser keeps both and the old one, which no code writes
      // any more, would linger for its full lifetime. Two conditions, and the
      // second is the reason this is not just cosmetic:
      //  - willWriteFreshC: the value now lives under the current name, so the
      //    old one is redundant. Without this guard a cookieMode where nothing
      //    is written would delete the visitor's only id.
      //  - isFingerprintUid: an F.* under a legacy name is exactly what F-153
      //    set out to clear. That cleanup searches CFG.cookieName only, so
      //    after the rename it would never find these again.
      const legacyOpts = {domain: CFG.cookieDomain, path: '/', sameSite: 'none', httpOnly: true, secure: true, 'max-age': 0};
      const dropLegacy = !!legacyCookieName && CFG.cookieMode !== 'never' && (willWriteFreshC || isFingerprintUid(existingCookie));
      if (dropLegacy) {
        setCookie(legacyCookieName, '', legacyOpts, true);
        if (CFG.debug) logToConsole('debug', '✓ Retired legacy user-id cookie', legacyCookieName);
      }
      // Legacy cookies that were NOT the source of the uid: the current name
      // already carries the identity, so these are pure leftovers — and one of
      // them holding an F.* is the case the cleanup above cannot see, because
      // it only ever looks at the cookie the uid came from.
      if (CFG.cookieMode !== 'never') {
        for (const sn of staleCookieNames) {
          setCookie(sn, '', legacyOpts, true);
          if (CFG.debug) logToConsole('debug', '✓ Retired stale legacy user-id cookie', sn);
        }
      }

      if (CFG.debug) logToConsole('debug', '✓ Session', sessionData);
      // Sequential Sources API POST. Its response carries `source`, captured
      // into sessionData.source before buildAndSend so it flows into
      // cfg.session.source. No-op (then() runs on this tick) when sources_enabled
      // is false. Session is already committed in Redis — no race against
      // api4sources' session lookup.
      fireSources(sessionData, function() { buildAndSend(sessionData); });
    };

    if (shouldLazyPromote) {
      const newUid = generateCookieUid();
      if (CFG.debug) logToConsole('debug', '→ Lazy F→C promote (returning visitor with F.* cookie + stored consent)', {old: existingCookie, new: newUid});
      tryPromote(existingCookie, newUid, sessionConsent, function(promotedUid, transient) {
        if (promotedUid) {
          sessionData.uid = promotedUid;
        } else {
          promoteState.retry = !!transient;
        }
        continueAfterSession();
      });
    } else {
      continueAfterSession();
    }
  };

  if (CFG.sessionApiUrl && CFG.tenantID && sessionUid) {
    const sUrl = CFG.sessionApiUrl + '/' + CFG.tenantID + '/' + sessionUid;
    sendHttpGet(sUrl, {timeout: 5000}).then(function(res) {
      const sd = {uid: sessionUid, sid: '', ret: false, sst: true, vct: 0};
      // An authoritative answer — 200 with an empty body is a valid "no record
      // here", a 4xx/5xx is not an answer at all. Only the former licenses the
      // cookie cleanup to act on the absence of a consent.
      sessionRead.ok = res.statusCode >= 200 && res.statusCode < 300;
      if (res.statusCode === 200 && res.body) {
        const r = JSON.parse(res.body);
        if (r && r.sessionId) {
          sd.sid = r.sessionId;
          sd.vct = r.counter || 0;
          sd.ret = sd.vct > 0;
          if (r.ga4sid) sd.ga4sid = r.ga4sid;
          if (r.muidga4) sd.muidga4 = r.muidga4;
          // Session API counters, forwarded under their API names so a reader
          // can match them against the record 1:1. `counter` is NOT repeated —
          // it already ships as `vct` (its aGTM name since v1.0) and doubling
          // it would only grow every response. `customerId`/`user` are skipped
          // as redundant (tenant is configured, `user` === `uid`).
          // Note: `ret`/`vct` keep their existing meaning (requests within the
          // current session, NOT visits) — `sessionCount` is the visit count.
          // Not reconciled here on purpose: `ret` gates the server-side consent
          // auto-denial, so changing it would silently move a live consent gate.
          if (typeof r.created === 'number') sd.created = r.created;
          if (typeof r.lastInteraction === 'number') sd.lastInteraction = r.lastInteraction;
          if (typeof r.pvCount === 'number') sd.pvCount = r.pvCount;
          if (typeof r.eventCount === 'number') sd.eventCount = r.eventCount;
          if (typeof r.sessionCount === 'number') sd.sessionCount = r.sessionCount;
          // Pass through stored consent if present and valid — but ONLY for a
          // visitor this Client can actually tell apart from another one.
          // Without a cookie the session key is the server-side fingerprint,
          // which is derived from IP, user agent, client hints and ASN/geo and
          // is therefore NOT per-visitor: two people behind the same NAT on the
          // same browser build derive the SAME key. Passing the stored consent
          // through in that case hands visitor B the decision visitor A made —
          // aGTM sets preset_with_consent and injects GTM for someone who never
          // saw a CMP (F-156). A cookie-bound uid keeps this branch — including
          // an F.* cookie, which IS per-browser (it sits in that browser) and
          // still needs the consent for the lazy F→C promote below.
          // The auto-denial is for a returning visitor with NOTHING on file, with
          // or without a cookie (Andi, 2026-10-21; withheld for cookieless
          // visitors from 4ac262f to here). It cannot grant: services is the
          // sentinel ',aGTMconsent,', so no tag that requires a CMP consent fires
          // (GTM itself loads with autoDenyLoadGtm, and so do tags without any
          // consent condition). It must NOT replace a stored decision that is
          // withheld only because the uid is shared: for a visitor who clicked
          // "deny all" it would load GTM where their own denial does not, and
          // for one who agreed it would mask their grant at init (consent_check
          // short-circuits on hasResponse). Then no preset; the CMP decides.
          // What stays open: the
          // consent is still PERSISTED under the shared fingerprint key when no
          // cookie exists, so the record can still be written by whoever gets
          // there first. Closing that is a separate step (F-156 option B).
          const uidIsBrowserBound = !!existingCookie;
          const storedDecision = !!(r.consent && typeof r.consent === 'object' && r.consent.hasResponse === true);
          if (storedDecision && uidIsBrowserBound) {
            sd.consent = r.consent;
            if (CFG.debug) logToConsole('debug', '✓ Session API returned stored consent', sd.consent);
          } else if (storedDecision) {
            if (CFG.debug) logToConsole('debug', '↷ No consent preset: stored decision withheld, uid is a shared fingerprint — the CMP decides');
          } else if (sd.ret) {
            // Returning visitor with no recorded consent -> server-side auto-denial.
            // Replaces the old client-side session_apply_denial() (Phase 2 removal).
            // `blocked` mirrors `gtmConsent` so the aGTM run_cc() chelp fallback
            // honors the server policy: when chelp checks fail (services don't
            // match the requirement), gtmConsent falls back to `blocked`.
            sd.consent = {
              hasResponse: true,
              feedback: 'Consent denied by aGTM',
              services: ',aGTMconsent,',
              purposes: '',
              vendors: '',
              gtmConsent: CFG.autoDenyLoadGtm,
              blocked: CFG.autoDenyLoadGtm
            };
            if (CFG.debug) logToConsole('debug', '✓ Server-side auto-denial applied', sd.consent);
          }
        }
      }
      afterSession(sd);
    }, function(e) {
      logToConsole('error', '✗ Session API error', e);
      sessionRead.ok = false;
      afterSession({uid: sessionUid, sid: '', ret: false, sst: true, vct: 0});
    });
  } else {
    afterSession({uid: sessionUid, sid: '', ret: false, sst: true, vct: 0});
  }
};

// `mark` never blocks — including here. This branch used to send 403 without
// consulting the mode, which made the field's own help text ("nothing is
// blocked") untrue for exactly the visitors whose IP header failed to resolve,
// i.e. an infrastructure problem turning into a hard outage during the very
// rollout step that is supposed to be safe.
const botNoIpBlocks = CFG.botCheckMode === 'block';

// A foreign embed is checked like any other request: skipping it would let a
// bot dodge block mode with one forged header (Sec-Fetch-Site: cross-site), and
// leave mark mode blind for every visitor of a misconfigured cross-domain tenant.
// What a foreign page never gets is the verdict itself (buildAndSend drops c.bot).
if (botCheckEnabled && botCheckUrl) {
  if (!clientIP && botNoIpBlocks) {
    logToConsole('error', '\u2717 Bot check enabled but no client IP');
    setResponseStatus(403);
    setResponseHeader('x-agtm-version', aGTMversion);
    setResponseBody(fromBase64('Y29uc29sZS5lcnJvcignYUdUTSBFcnJvcjogSW52YWxpZCBvciBibG9ja2VkIElQIGFkZHJlc3MnKTs='));
    returnResponse();
  } else if (!clientIP) {
    logToConsole('warn', '\u2717 Bot check enabled but no client IP - passed through (mark mode)');
    // `reason` separates the three ways a verdict can be missing. Without it
    // "unknown" lumps together "the filter is down", "the filter answered
    // garbage" and "we never asked because the IP header did not resolve" —
    // and those call for completely different responses from an operator.
    botState.verdict = {isBot: false, band: 'unknown', reason: 'no_client_ip', mode: CFG.botCheckMode};
    afterBotCheck(false);
  } else {
    const plObj = {UserAgent: userAgent, ClientIP: clientIP};
    // URL-safe Base64 (base64url): the payload is placed in the URL PATH, so raw
    // Base64 '+' and '/' would corrupt it ('/' spawns extra path segments). Map
    // + -> - and / -> _ (single-line: the server sandbox can choke on multi-line
    // method chains). The bot-check service MUST decode base64url accordingly.
    const b64Payload = toBase64(JSON.stringify(plObj)).split('+').join('-').split('/').join('_');
    sendHttpGet(botCheckUrl + '/' + b64Payload, {timeout: 5000}).then(function(r) {
      // NO status-code gate. api4filter couples the HTTP status to the verdict
      // (403 when isBot, 200 otherwise), so a `2xx only` gate would skip the
      // body of exactly the responses that report a bot and let every bot
      // through (regression introduced with the v1.5 single-session refactor,
      // fixed as F-127). sendHttpGet resolves for any completed response, so
      // the verdict is read from the body regardless of status.
      botState.verdict = botFieldsFromResponse(r.body);
      // A response that arrived but carries no usable verdict (5xx with a JSON
      // error body, empty body, gateway HTML) is an OUTAGE, not a clean
      // visitor — and without this it would be indistinguishable from "check
      // disabled" in the browser. Only the transport-error path was covered
      // before, which is the rarer half of the failure modes.
      if (typeof botState.verdict.isBot !== 'boolean') botState.verdict = {isBot: false, band: 'unknown', reason: 'bad_answer'};
      // The mode travels with the verdict. Otherwise `mark` is invisible: a
      // page under `mark` looks exactly like one under `block` for as long as
      // no bot shows up, and nothing reminds anyone that the filter is off.
      botState.verdict.mode = CFG.botCheckMode;
      if (CFG.debug) logToConsole('debug', 'Bot check verdict', {status: r.statusCode, bot: botState.verdict});
      // `mark` reports the verdict but never blocks. It exists because a blocked
      // visitor is invisible: no library, no aGTM.d.bot, no way to count false
      // positives.
      //
      // NOT debug-gated, on purpose. The browser cannot be the measurement for
      // the mark phase: a webGTM variable is only read when a tag fires, tags
      // only fire once GTM is injected, and GTM is only injected after consent
      // — so every marked visitor who never answers the CMP (i.e. most
      // non-human traffic) contributes nothing. This line is the server-side
      // counterpart, and it is the only complete record of what `mark` saw.
      if (botState.verdict.isBot === true && CFG.botCheckMode === 'mark') {
        logToConsole('warn', '\u2717 Bot detected (mark mode - served anyway)', userAgent);
      }
      afterBotCheck(CFG.botCheckMode === 'block' && botState.verdict.isBot === true);
    }, function(e) {
      logToConsole('error', '\u2717 Bot check error', e);
      // An explicit "no verdict available" state. Without it a filter outage is
      // indistinguishable from a clean visitor in the browser, and a webGTM
      // traffic-type variable would silently report 'regular' for 100% of
      // traffic for as long as the outage lasts.
      botState.verdict = {isBot: false, band: 'unknown', reason: 'no_answer', mode: CFG.botCheckMode};
      afterBotCheck(false);
    });
  }
} else {
  // Fourth way to end up without a verdict: the check is switched on but no URL
  // was configured. Silent until now — and the only one with no browser-visible
  // trace either, because `absent` is the correct reading there.
  if (botCheckEnabled && !botCheckUrl) logToConsole('warn', '\u2717 Bot check enabled but no URL configured - no check was performed');
  afterBotCheck(false);
}

