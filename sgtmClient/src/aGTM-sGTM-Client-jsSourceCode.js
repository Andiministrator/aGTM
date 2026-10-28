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
const decodeUriComponent = require('decodeUriComponent');
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
      // The body only under debug: its shape on errors is not specified and
      // may carry the uid; the warn line runs in every environment.
      logToConsole('warn', '✗ Promote non-2xx — falling back to legacy F.* path', {status: res.statusCode});
      if (CFG.debug) logToConsole('debug', 'Promote response body', res.body);
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
  // Objection (F-259): a tab loaded before the opt-out can still post a banner
  // change. Store nothing, set no cookie - answer 204, which the library takes
  // as done and does not retry.
  const postOptOut = (getCookieValues('aGTMoptout', true) || [])[0] || '';
  if (postOptOut && postOptOut !== '0') {
    if (CFG.debug) logToConsole('debug', '\u2717 Consent POST ignored: opt-out (aGTMoptout)');
    setResponseStatus(204);
    setCorsHeaders();
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
        // browser unhealed, and the library takes a 404 as final (F-248).
        // It still logs at warn: it is not healed by design, but WHY it
        // happens as often as it does (10,000 to 126,000 a day on one
        // tenant, sharply up with the 30.09. update) is open (F-249), and
        // while it is, this line is the Client's only live signal for it.
        // The header names the case for whoever reads a single response.
        if (res.statusCode === 404 && !isCookieUid(finalUid)) {
          setResponseHeader('x-agtm-consent', 'not-persisted-fingerprint');
          failStatus('write', res);
          return;
        }
        if (res.statusCode !== 404) {
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

// ── Opt-out = the visitor's objection (F-259) ───────────────────────────────
// The library stops completely when it finds `aGTMoptout` (cookie, or the
// ?aGTMoptout= parameter on the page that loads it). The calls this Client makes
// on its own before the library runs - Session API, Sources API, the user-ID
// cookie - have to stop as well, or the objection holds only in the browser.
// The page parameter decides first, as in the library: "0" withdraws the
// objection on this very request, anything else declares it before the library
// has written the cookie. Read exactly like aGTM.f.urlParam: the first
// occurrence after a "?", "&" or "#" anywhere in the URL (hash routers put the
// query behind the "#"), the value URL-decoded, an empty value counts as absent.
// A for-of loop at top level, not a forEach callback: rebinding a top-level
// binding from a closure has no precedent in this file (see the bot check).
// The library writes the cookie for the registrable domain, so it reaches this
// Client on a subdomain. The script itself is still served: the library has to
// run to keep, renew or withdraw the objection.
let optOut = '';
let optOutSeen = false;
for (const kv of pageUrl.split('#').join('&').split('?').join('&').split('&')) {
  const p = kv.split('=');
  if (!optOutSeen && p[0] === 'aGTMoptout') { optOutSeen = true; optOut = p.length > 1 ? (decodeUriComponent(p.slice(1).join('=')) || '') : ''; }
}
if (!optOut) optOut = (getCookieValues('aGTMoptout', true) || [])[0] || '';
const optedOut = !!optOut && optOut !== '0';
if (optedOut && CFG.debug) logToConsole('debug', '\u2717 Opt-out (aGTMoptout) - serving without session data, no Session/Sources API call');

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
        // direction: two rows carrying the same container id used to collapse
        // into the LAST one, the earlier row's settings vanished, and the UI
        // kept showing both. If the surviving row was the one WITHOUT a consent
        // check, the container loaded before any decision — a row the operator
        // wrote to gate it was simply gone. The id column has `isUnique`, but it also accepts a
        // variable (its own help text teaches deriving it from `?id=`), so the
        // UI cannot see a collision that only happens at request time.
        //
        // Decided for v1.5 (F-192): the STRICTER row wins — the one with a
        // consent check — and it wins as a whole row: its URL and its URL
        // parameters apply, nothing of the other row is merged in. Merging
        // would build a container setting nobody wrote. Between two rows of the
        // same strictness the later one wins, as it always did. The dropped row
        // stays visible as a warn line, because the UI keeps showing both.
        const row = {};
        if (!v.gtm_consent) row.noConsent = true;
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
        if (envStr) row.env = envStr;
        if (v.gtm_url) row.gtmURL = v.gtm_url;
        const prevRow = gtm[v.gtm_id];
        const keepPrevRow = !!prevRow && !prevRow.noConsent && !!row.noConsent;
        if (prevRow) logToConsole('warn', '✗ GTM container listed more than once - the row with a consent check wins as a whole (its URL and parameters), nothing is merged; same strictness: the later row wins. Dropped:', v.gtm_id, keepPrevRow ? 'later row' : 'earlier row');
        if (!keepPrevRow) gtm[v.gtm_id] = row;
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
  // Opt-out semantics: only an explicit false switches the error capture off,
  // so a container saved before the field existed keeps the library default (F-190).
  if (data.jsErrors === false) c.jsErrors = false;
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
  // debug makes the library ignore the opt-out cookie - never hand it a visitor who objected.
  if (data.debug && !optedOut) c.debug = true;
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
  // Debug only: uid and sid identify the visitor, and an unconditional line put
  // them into the server log on every request (logging is scoped to all
  // environments) - readable by anyone with log access (Kritiker 2026-10-22, K3).
  if (CFG.debug) logToConsole('debug', '\u2713 aGTM Config built', {uid: sessionData && sessionData.uid, sid: sessionData && sessionData.sid, ret: sessionData && sessionData.ret});

  // aGTM base64 payload (updated by build.sh)
  const agtm = fromBase64('d2luZG93LmFHVE09d2luZG93LmFHVE18fHt9LHdpbmRvdy5hR1RNLmM9d2luZG93LmFHVE0uY3x8e30sd2luZG93LmFHVE0uZD13aW5kb3cuYUdUTS5kfHx7fSx3aW5kb3cuYUdUTS5mPXdpbmRvdy5hR1RNLmZ8fHt9LHdpbmRvdy5hR1RNLmw9d2luZG93LmFHVE0ubHx8W10sd2luZG93LmFHVE0ubj13aW5kb3cuYUdUTS5ufHx7fSxhR1RNLmYucHJvcHNldD1mdW5jdGlvbihlLHQsbil7dHJ5e2VbdF09ZVt0XXx8bn1jYXRjaChlKXt9fSxhR1RNLmYub2JqaW5pdD1mdW5jdGlvbigpe1tbYUdUTS5kLCJ2ZXJzaW9uIiwiMS41Il0sW2FHVE0uZCwiZiIsW11dLFthR1RNLmQsImNvbmZpZyIsITFdLFthR1RNLmQsImluaXQiLCExXSxbYUdUTS5kLCJkb21fcmVhZHkiLCExXSxbYUdUTS5kLCJwYWdlX3JlYWR5IiwhMV0sW2FHVE0uZCwiaXNfaWZyYW1lIix3aW5kb3cuc2VsZiE9PXdpbmRvdy50b3BdLFthR1RNLmQsImV2X2ZjdF9jdHIiLDBdLFthR1RNLmQsInRpbWVyIix7fV0sW2FHVE0uZCwiZXJyb3JfY291bnRlciIsMF0sW2FHVE0uZCwiZXJyb3JzIixbXV0sW2FHVE0uZCwiZGwiLFtdXSxbYUdUTS5kLCJzZXNzaW9uIix7fV0sW2FHVE0uZCwic2Vzc2lvbl9zdGF0dXMiLCIiXSxbYUdUTS5kLCJib3QiLHt9XSxbYUdUTS5kLCJjb25zZW50X2hhc2giLCIiXSxbYUdUTS5kLCJsYXN0X2NvbnNlbnRfaGFzaCIsIiJdLFthR1RNLmQsImFkV2FpdCIsMF0sW2FHVE0uZCwiYXR0cmlidXRpb24iLHt9XSxbYUdUTS5kLCJpZnJhbWUiLHtjb3VudGVyOntldmVudHM6MH0sb3JpZ2luOiIiLGlmTGlzdGVuOiExLHRvcExpc3RlbjohMSxoYW5kc2hha2U6ITEsdGltZXI6bnVsbH1dLFthR1RNLmQsImxhc3RfdXJsIixsb2NhdGlvbi5ocmVmXSxbYUdUTS5kLCJ1cmxMaXN0ZW5lcl9hY3RpdmUiLCExXSxbYUdUTS5kLCJwYXNzaXZlX3N1cHBvcnRlZCIsbnVsbF0sW2FHVE0uZiwidGwiLHt9XSxbYUdUTS5mLCJkbCIse31dLFthR1RNLmYsInBsIix7fV0sW2FHVE0sImwiLFtdXSxbYUdUTS5uLCJjayIsImNvb2tpZSJdLFthR1RNLm4sInRtIiwiZ29vZ2xldGFnbWFuYWdlciJdLFthR1RNLm4sInRhIiwidGFnYXNzaXN0YW50Lmdvb2dsZSJdXS5mb3JFYWNoKGZ1bmN0aW9uKGUpe2FHVE0uZi5wcm9wc2V0KGVbMF0sZVsxXSxlWzJdKX0pfSxhR1RNLmYub2JqaW5pdCgpLGFHVE0uZi5sb2c9ZnVuY3Rpb24oZSx0KXt2YXIgbj0ib2JqZWN0Ij09dHlwZW9mIHQmJnQ/SlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeSh0KSk6dDthR1RNLmwucHVzaCh7aWQ6ZSx0aW1lc3RhbXA6RGF0ZS5ub3coKSxvYmo6bn0pfSxhR1RNLmYuc3RyY2xlYW49ZnVuY3Rpb24oZSl7cmV0dXJuIHZvaWQgMD09PWV8fCJvYmplY3QiPT10eXBlb2YgZSYmIWU/IiI6KCJzdHJpbmciIT10eXBlb2YgZSYmKGU9ZS50b1N0cmluZygpKSxlLnJlcGxhY2UoL1teYS16w6TDtsO8w59BLVrDhMOWw5wwLTlfLV0vZywiIikpfSxhR1RNLmYuc1N0cmY9ZnVuY3Rpb24oZSl7aWYoIm9iamVjdCIhPXR5cGVvZiBlfHwhZSl7dmFyIHQ9SlNPTi5zdHJpbmdpZnkoe2V2ZW50OiJleGNlcHRpb24iLGVycm1zZzoiRGF0YUxheWVyIEVudHJ5IGlzIG5vIG9iamVjdCIsZXJydHlwZToiREwgRXJyb3IiLG9ial90eXBlOnR5cGVvZiBlLG9ial92YWx1ZTplfSk7cmV0dXJuIGFHVE0uZi5sb2coImUxNiIsSlNPTi5wYXJzZSh0KSksSlNPTi5zdHJpbmdpZnkobnVsbCl9dmFyIG49W107cmV0dXJuIEpTT04uc3RyaW5naWZ5KGUsZnVuY3Rpb24oZSx0KXtpZigib2JqZWN0Ij09dHlwZW9mIHQmJm51bGwhPT10KXtpZigtMSE9PW4uaW5kZXhPZih0KSlyZXR1cm4iW0NpcmN1bGFyXSI7bi5wdXNoKHQpfXJldHVybiB0fSl9LGFHVE0uZi5hbj1mdW5jdGlvbihlLHQsbixhKXtlW3RdPW4uaGFzT3duUHJvcGVydHkodCk/blt0XTphfSxhR1RNLmYuY29uc2VudF9zZXJpYWxpemU9ZnVuY3Rpb24oZSl7aWYoIWV8fCJvYmplY3QiIT10eXBlb2YgZSlyZXR1cm4iIjt2YXIgdD17Z3RtQ29uc2VudDoxLGJsb2NrZWQ6MX0sbj1bXTtmb3IodmFyIGEgaW4gZSllLmhhc093blByb3BlcnR5KGEpJiYhdFthXSYmbi5wdXNoKGEpO24uc29ydCgpO2Zvcih2YXIgbz1bXSxyPTA7cjxuLmxlbmd0aDtyKyspe3ZhciBzPW5bcl0saT1lW3NdOyIiIT09aSYmbnVsbCE9aSYmby5wdXNoKHMrIj0iKygib2JqZWN0Ij09dHlwZW9mIGk/SlNPTi5zdHJpbmdpZnkoaSk6U3RyaW5nKGkpKSl9cmV0dXJuIG8uam9pbigifCIpfSxhR1RNLmYucGFyc2VVcmxQYXJhbXM9ZnVuY3Rpb24oZSl7dmFyIHQ9e307aWYoIWV8fCI/IiE9PWUuY2hhckF0KDApKXJldHVybiB0O2Zvcih2YXIgbj1lLnN1YnN0cmluZygxKS5zcGxpdCgiJiIpLGE9MDthPG4ubGVuZ3RoO2ErKyl7dmFyIG89blthXS5zcGxpdCgiPSIpO2lmKG9bMF0pe3ZhciByLHM7dHJ5e3I9ZGVjb2RlVVJJQ29tcG9uZW50KG9bMF0pfWNhdGNoKGUpe3I9b1swXX1pZihvWzFdKXt2YXIgaT1vWzFdLnJlcGxhY2UoL1wrL2csIiAiKTt0cnl7cz1kZWNvZGVVUklDb21wb25lbnQoaSl9Y2F0Y2goZSl7cz1pfX1lbHNlIHM9IiI7dFtyXT1zfX1yZXR1cm4gdH0sYUdUTS5mLnJlc29sdmVBdHRyaWJ1dGlvbj1mdW5jdGlvbihlKXt2YXIgdD1hR1RNLmYucGFyc2VVcmxQYXJhbXMod2luZG93LmxvY2F0aW9uLnNlYXJjaCksbj0oYUdUTS5kLnNlc3Npb24mJmFHVE0uZC5zZXNzaW9uLmF0dHJpYnV0aW9ufHx7fSlbZV07biYmIm9iamVjdCI9PXR5cGVvZiBufHwobj17fSk7Zm9yKHZhciBhPVsiZ2NsaWQiLCJmYmNsaWQiLCJtc2Nsa2lkIiwidHRjbGlkIiwiZ2JyYWlkIiwid2JyYWlkIl0sbz0iIixyPSIiLHM9MDtzPGEubGVuZ3RoO3MrKyl7dmFyIGk9YVtzXTtpZih0W2ldKXtvPWkscj10W2ldO2JyZWFrfX1yZXR1cm57c291OnQudXRtX3NvdXJjZXx8bi5zb3V8fCIiLGNhbTp0LnV0bV9jYW1wYWlnbnx8bi5jYW18fCIiLG1lZDp0LnV0bV9tZWRpdW18fG4ubWVkfHwiIixjYW1pZDp0LnV0bV9pZHx8bi5jYW1pZHx8IiIsY2xpOnJ8fG4uY2xpfHwiIixjbHA6b3x8bi5jbHB8fCIiLGNsczpvJiZ7Z2NsaWQ6Ikdvb2dsZSBBZHMiLGZiY2xpZDoiTWV0YSIsbXNjbGtpZDoiTWljcm9zb2Z0IEFkcyIsdHRjbGlkOiJUaWtUb2sgQWRzIixnYnJhaWQ6Ikdvb2dsZSBBZHMiLHdicmFpZDoiR29vZ2xlIEFkcyJ9W29dfHxuLmNsc3x8IiIsYWZzOm4uYWZzfHwiIixzcmU6ZG9jdW1lbnQucmVmZXJyZXJ8fG4uc3JlfHwiIixsY3M6bi5sY3N8fCIiLGZzczpuLmZzc3x8IiJ9fSxhR1RNLmYuY29uZmlnPWZ1bmN0aW9uKGUpe2lmKGFHVE0uZC5jb25maWcpImZ1bmN0aW9uIj09dHlwZW9mIGFHVE0uZi5sb2cmJmFHVE0uZi5sb2coImUxIixhR1RNLmMpO2Vsc2UgaWYoZS5kZWJ1Z3x8IWFHVE0uZC5vcHRvdXQmJiFhR1RNLmYub3B0b3V0KCkpe3ZhciB0PWZ1bmN0aW9uKHQsbixhLG8pe2E/YUdUTS5mLmFuKGEsdCxvLG4pOmFHVE0uZi5hbihhR1RNLmMsdCxlLG4pfTtpZih0KCJkZWJ1ZyIsITEpLHQoInBhdGgiLCIiKSx0KCJmaWxlIiwiYUdUTS5qcyIpLHQoImNtcCIsIiIpLGFHVE0uYy5taW49ImJvb2xlYW4iIT10eXBlb2YgZS5taW58fGUubWluLHQoIm5vbmNlIiwiIiksdCgiaWZyYW1lU3VwcG9ydCIsITEpLHQoInZQYWdldmlld3MiLCExKSx0KCJ2UGFnZXZpZXdzVGltZXIiLDApLHQoInZQYWdldmlld3NGYWxsYmFjayIsITEpLHQoImd0bUlEIiwiIiksZS5ndG0pZm9yKHZhciBuIGluIGUuZ3RtKWUuZ3RtLmhhc093blByb3BlcnR5KG4pJiYoYUdUTS5jLmd0bUlEPWFHVE0uYy5ndG1JRHx8bixhR1RNLmMuZ3RtPWFHVE0uYy5ndG18fHt9LGFHVE0uYy5ndG1bbl09ZS5ndG1bbl18fHt9LHQoIm5vQ29uc2VudCIsITEsYUdUTS5jLmd0bVtuXSxlLmd0bVtuXSksdCgiZW52IiwiIixhR1RNLmMuZ3RtW25dLGUuZ3RtW25dKSx0KCJpZFBhcmFtIiwiIixhR1RNLmMuZ3RtW25dLGUuZ3RtW25dKSx0KCJndG1VUkwiLCIiLGFHVE0uYy5ndG1bbl0sZS5ndG1bbl0pLHQoImd0bUpTIiwiIixhR1RNLmMuZ3RtW25dLGUuZ3RtW25dKSk7aWYodCgiZ2RsIiwiZGF0YUxheWVyIiksdCgiZ3RtUHVycG9zZXMiLCIiKSx0KCJndG1TZXJ2aWNlcyIsIiIpLHQoImd0bVZlbmRvcnMiLCIiKSx0KCJhbGxvd0VtcHR5Q29uc2VudENvbmRpdGlvbnMiLCExKSx0KCJndG1BdHRyIixudWxsKSx0KCJkbFNldCIse30pLHQoInVzZUxpc3RlbmVyIiwhMSksdCgiZGxPcmdQdXNoIiwiIiksYUdUTS5jLmRsU3RhdGVFdmVudHM9ImJvb2xlYW4iPT10eXBlb2YgZS5kbFN0YXRlRXZlbnRzJiZlLmRsU3RhdGVFdmVudHMsYUdUTS5jLmFQYWdldmlldz0iYm9vbGVhbiI9PXR5cGVvZiBlLmFQYWdldmlldyYmZS5hUGFnZXZpZXcsYUdUTS5jLnZQYWdldmlldz0iYm9vbGVhbiI9PXR5cGVvZiBlLnZQYWdldmlldyYmZS52UGFnZXZpZXcsYUdUTS5jLnNlbmRDb25zZW50RXZlbnQ9ImJvb2xlYW4iPT10eXBlb2YgZS5zZW5kQ29uc2VudEV2ZW50JiZlLnNlbmRDb25zZW50RXZlbnQsYUdUTS5jLmpzRXJyb3JzPSJib29sZWFuIiE9dHlwZW9mIGUuanNFcnJvcnN8fGUuanNFcnJvcnMsdCgiY29uc2VudF9ldmVudHMiLCIiKSxhR1RNLmMuY29uc2VudF9ldmVudF9hdHRyPWFHVE0uYy5jb25zZW50X2V2ZW50X2F0dHJ8fHt9LCJzdHJpbmciPT10eXBlb2YgYUdUTS5jLmNvbnNlbnRfZXZlbnRzJiZhR1RNLmMuY29uc2VudF9ldmVudHMpe2Zvcih2YXIgYT1hR1RNLmMuY29uc2VudF9ldmVudHMuc3BsaXQoIiwiKSxvPVtdLHI9MDtyPGEubGVuZ3RoO3IrKyl7dmFyIHM9YVtyXS5yZXBsYWNlKC9eXHMrfFxzKyQvZywiIik7aWYocyl7dmFyIGk9cy5pbmRleE9mKCJbIik7aWYoaT49MCl7dmFyIGM9cy5zdWJzdHJpbmcoMCxpKSxmPXMuc3Vic3RyaW5nKGkrMSxzLmluZGV4T2YoIl0iKSksZD1mLmluZGV4T2YoIjoiKSxNPXt9O2Q+PTA/TVtmLnN1YnN0cmluZygwLGQpXT1mLnN1YnN0cmluZyhkKzEpOk1bZl09IiIsYUdUTS5jLmNvbnNlbnRfZXZlbnRfYXR0cltjXT1NLG8ucHVzaChjKX1lbHNlIG8ucHVzaChzKX19YUdUTS5jLmNvbnNlbnRfZXZlbnRzPW8uam9pbigiLCIpfWlmKHQoInRyYW5zcG9ydF91cmwiLCIiKSx0KCJ0cmFuc3BvcnRfZW5jIiwhMSksdCgidHJhbnNwb3J0X3NhbHQiLDApLHQoInVzZXJfaWQiLCIiKSx0KCJzZXNzaW9uX3NhbHQiLDApLHQoImNvbnNlbnRfc3RvcmVfdXJsIiwiIiksdCgiY29uc2VudF9zdG9yZV9lbmMiLCExKSx0KCJjb25zZW50X3BvbGxfbXMiLDJlMyksZS5zZXNzaW9uJiYib2JqZWN0Ij09dHlwZW9mIGUuc2Vzc2lvbiYmKGUuc2Vzc2lvbi5zaWR8fGUuc2Vzc2lvbi5jb25zZW50fHxlLnNlc3Npb24uYXR0cmlidXRpb258fGUuc2Vzc2lvbi5zb3VyY2UpKXthR1RNLmQuc2Vzc2lvbj1KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihlLnNlc3Npb24pKTt2YXIgVD1lLnNlc3Npb24uY29uc2VudDtUJiYib2JqZWN0Ij09dHlwZW9mIFQmJiEwPT09VC5oYXNSZXNwb25zZSYmInN0cmluZyI9PXR5cGVvZiBULnNlcnZpY2VzPyhhR1RNLmQuY29uc2VudD1KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihUKSksYUdUTS5kLmNvbnNlbnRfaGFzaD1hR1RNLmYuY29uc2VudF9zZXJpYWxpemUoYUdUTS5kLmNvbnNlbnQpLGFHVE0uZC5sYXN0X2NvbnNlbnRfaGFzaD1hR1RNLmQuY29uc2VudF9oYXNoLGFHVE0uZC5zZXNzaW9uX3N0YXR1cz0icHJlc2V0X3dpdGhfY29uc2VudCIsYUdUTS5mLmxvZygibV9zZXNzaW9uX3ByZXNldF9jb25zZW50IixUKSk6KGFHVE0uZC5zZXNzaW9uX3N0YXR1cz0icHJlc2V0IixhR1RNLmYubG9nKCJtX3Nlc3Npb25fcHJlc2V0IixlLnNlc3Npb24pKX1pZihlLmJvdCYmIm9iamVjdCI9PXR5cGVvZiBlLmJvdCYmImJvb2xlYW4iPT10eXBlb2YgZS5ib3QuaXNCb3QmJihhR1RNLmQuYm90PUpTT04ucGFyc2UoYUdUTS5mLnNTdHJmKGUuYm90KSksYUdUTS5mLmxvZygibV9ib3RfcHJlc2V0IixhR1RNLmQuYm90KSksZS5jb25zZW50PWUuY29uc2VudHx8e30sYUdUTS5jLmNvbnNlbnQ9YUdUTS5jLmNvbnNlbnR8fGUuY29uc2VudCx0KCJoYXNSZXNwb25zZSIsITEsYUdUTS5jLmNvbnNlbnQsZS5jb25zZW50KSx0KCJmZWVkYmFjayIsIiIsYUdUTS5jLmNvbnNlbnQsZS5jb25zZW50KSx0KCJwdXJwb3NlcyIsIiIsYUdUTS5jLmNvbnNlbnQsZS5jb25zZW50KSx0KCJzZXJ2aWNlcyIsIiIsYUdUTS5jLmNvbnNlbnQsZS5jb25zZW50KSx0KCJ2ZW5kb3JzIiwiIixhR1RNLmMuY29uc2VudCxlLmNvbnNlbnQpLHQoImNvbnNlbnRfaWQiLCIiLGFHVE0uYy5jb25zZW50LGUuY29uc2VudCksd2luZG93W2FHVE0uYy5nZGxdPXdpbmRvd1thR1RNLmMuZ2RsXXx8W10sYUdUTS5kLmNvbnNlbnQ9YUdUTS5kLmNvbnNlbnR8fEpTT04ucGFyc2UoYUdUTS5mLnNTdHJmKGFHVE0uYy5jb25zZW50KSksImJvb2xlYW4iIT10eXBlb2YgYUdUTS5kLmNvbnNlbnQuZ3RtQ29uc2VudCYmKGFHVE0uZC5jb25zZW50Lmd0bUNvbnNlbnQ9ITEpLGFHVE0uZC5jb25maWc9ITAsYUdUTS5kLmd0bUxvYWRlZD1bXSxhR1RNLmQuc2Vzc2lvbiYmYUdUTS5kLnNlc3Npb24uYXR0cmlidXRpb24mJiJvYmplY3QiPT10eXBlb2YgYUdUTS5kLnNlc3Npb24uYXR0cmlidXRpb24pZm9yKHZhciBsIGluIGFHVE0uZC5zZXNzaW9uLmF0dHJpYnV0aW9uKWFHVE0uZC5zZXNzaW9uLmF0dHJpYnV0aW9uLmhhc093blByb3BlcnR5KGwpJiYoYUdUTS5kLmF0dHJpYnV0aW9uW2xdPWFHVE0uZi5yZXNvbHZlQXR0cmlidXRpb24obCkpOyJmdW5jdGlvbiI9PXR5cGVvZiBhR1RNLmYubG9nJiZhR1RNLmYubG9nKCJtMSIsYUdUTS5jKSwhMD09PWFHVE0uZC5jb25zZW50Lmhhc1Jlc3BvbnNlJiYiZnVuY3Rpb24iPT10eXBlb2YgYUdUTS5mLmNhbGxfY2MmJmFHVE0uZi5jYWxsX2NjKCl9fSxhR1RNLmYubG9hZF9jYz1mdW5jdGlvbihlLHQpe3ZhciBuPWRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoInNjcmlwdCIpLGE9YUdUTS5jLnBhdGh8fCIiO2EubGVuZ3RoPjAmJiIvIiE9PWEuY2hhckF0KGEubGVuZ3RoLTEpJiYoYSs9Ii8iKTt2YXIgbz0iY21wL2NjXyIrYUdUTS5mLnN0cmNsZWFuKGUpKyhhR1RNLmMubWluPyIubWluIjoiIikrIi5qcyI7bi5zcmM9YStvLGFHVE0uYy5ub25jZSYmKG4ubm9uY2U9YUdUTS5jLm5vbmNlKSxuLm9ucmVhZHlzdGF0ZWNoYW5nZT1uLm9ubG9hZD1mdW5jdGlvbigpe24ucmVhZHlTdGF0ZSYmIS9sb2FkZWR8Y29tcGxldGUvLnRlc3Qobi5yZWFkeVN0YXRlKXx8ImZ1bmN0aW9uIj09dHlwZW9mIHQmJnQoKX0sbi5hc3luYz0hMCxkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKG4pfSxhR1RNLmYuY2hlbHA9ZnVuY3Rpb24oZSx0KXt2YXIgbj0hMDtpZihlKXtpZighdClyZXR1cm4hMTt2YXIgYT0wO2lmKGUuc3BsaXQoIiwiKS5mb3JFYWNoKGZ1bmN0aW9uKGUpeyhlPWUudHJpbSgpKSYmKGErKyx0LmluZGV4T2YoIiwiK2UrIiwiKTwwJiYobj0hMSkpfSksIWEpcmV0dXJuITF9cmV0dXJuIG59LGFHVE0uZi5ldmFsQ29ucz1mdW5jdGlvbihlLHQpe3ZhciBuPWZ1bmN0aW9uKGUsdCl7cmV0dXJuIGUuZXZlcnkoZnVuY3Rpb24oZSl7cmV0dXJuIHQuaW5kZXhPZigiLCIrZSsiLCIpPj0wfSl9LGE9IWUucHVycG9zZXMubGVuZ3RofHxuKGUucHVycG9zZXMsdC5wdXJwb3Nlcyksbz0hZS5zZXJ2aWNlcy5sZW5ndGh8fG4oZS5zZXJ2aWNlcyx0LnNlcnZpY2VzKSxyPSFlLnZlbmRvcnMubGVuZ3RofHxuKGUudmVuZG9ycyx0LnZlbmRvcnMpO3JldHVybiBhJiZvJiZyfSxhR1RNLmYucnVuX2NjPWZ1bmN0aW9uKGUpe2lmKCFhR1RNLmQuY29uZmlnKXJldHVybiBhR1RNLmYubG9nKCJlNCIsbnVsbCksITE7aWYoInN0cmluZyIhPXR5cGVvZiBlfHwiaW5pdCIhPT1lJiYidXBkYXRlIiE9PWUpcmV0dXJuIGFHVE0uZi5sb2coImU1Iix7YWN0aW9uOmV9KSwhMTt2YXIgdD0iaW5pdCI9PT1lJiZhR1RNLmQuY29uc2VudCYmIixhR1RNY29uc2VudCwiPT09YUdUTS5kLmNvbnNlbnQuc2VydmljZXM7aWYoImZ1bmN0aW9uIiE9dHlwZW9mIGFHVE0uZi5jb25zZW50X2NoZWNrKXJldHVybiB0JiYoYUdUTS5kLmNvbnNlbnQuZ3RtQ29uc2VudD0hMSksYUdUTS5mLmxvZygiZTE0Iix7YWN0aW9uOmV9KSwhMTt2YXIgbj1udWxsO2lmKCgidXBkYXRlIj09PWV8fHQpJiZhR1RNLmQuY29uc2VudCl7bj1KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihhR1RNLmQuY29uc2VudCkpO3ZhciBhPWFHVE0uZC5jb25zZW50O2EuaGFzUmVzcG9uc2U9ITEsYS5zZXJ2aWNlcz0iIixhLnB1cnBvc2VzPSIiLGEudmVuZG9ycz0iIixhLmNvbnNlbnRfaWQ9IiIsYS5zZXJ2aWNlSURzPSIiLGEuZmVlZGJhY2s9IiIsZGVsZXRlIGEuYmxvY2tlZH12YXIgbz0hMSxyPW58fGFHVE0uZC5jb25zZW50JiZKU09OLnBhcnNlKGFHVE0uZi5zU3RyZihhR1RNLmQuY29uc2VudCkpO3RyeXtvPWFHVE0uZi5jb25zZW50X2NoZWNrKGUpfWNhdGNoKHQpe2FHVE0uZC5jb25zZW50PXJ8fGFHVE0uZC5jb25zZW50LGFHVE0uZC5jY0VyckxvZ2dlZHx8KGFHVE0uZC5jY0VyckxvZ2dlZD0hMCxhR1RNLmYubG9nKCJlX2NvbnNlbnRfY2hlY2siLHthY3Rpb246ZSxtc2c6dCYmdC5tZXNzYWdlfSkpfWlmKCFvJiYobiYmKGFHVE0uZC5jb25zZW50PW4pLCF0fHwrK2FHVE0uZC5hZFdhaXQ8NSkpcmV0dXJuIHQmJihhR1RNLmQuY29uc2VudC5ndG1Db25zZW50PSExKSxhR1RNLmYubG9nKCJtOCIsbnVsbCksITE7d2luZG93W2FHVE0uYy5nZGxdPXdpbmRvd1thR1RNLmMuZ2RsXXx8W107dmFyIHM9Im5vbmUiPT09YUdUTS5jLmNtcHx8YUdUTS5jLmlmcmFtZVN1cHBvcnQmJmFHVE0uZC5pc19pZnJhbWU7ISghYUdUTS5jLmd0bVB1cnBvc2VzJiYhYUdUTS5jLmd0bVNlcnZpY2VzJiYhYUdUTS5jLmd0bVZlbmRvcnMpfHxzfHxhR1RNLmMuYWxsb3dFbXB0eUNvbnNlbnRDb25kaXRpb25zP2FHVE0uZi5jaGVscChhR1RNLmMuZ3RtUHVycG9zZXMsYUdUTS5kLmNvbnNlbnQucHVycG9zZXMpJiZhR1RNLmYuY2hlbHAoYUdUTS5jLmd0bVNlcnZpY2VzLGFHVE0uZC5jb25zZW50LnNlcnZpY2VzKSYmYUdUTS5mLmNoZWxwKGFHVE0uYy5ndG1WZW5kb3JzLGFHVE0uZC5jb25zZW50LnZlbmRvcnMpP2FHVE0uZC5jb25zZW50Lmd0bUNvbnNlbnQ9ITA6YUdUTS5kLmNvbnNlbnQuZ3RtQ29uc2VudD0iYm9vbGVhbiI9PXR5cGVvZiBhR1RNLmQuY29uc2VudC5ibG9ja2VkJiZhR1RNLmQuY29uc2VudC5ibG9ja2VkOihhR1RNLmQuY29uc2VudC5ndG1Db25zZW50PSExLGFHVE0uZC5ub0NvbmRMb2dnZWR8fChhR1RNLmQubm9Db25kTG9nZ2VkPSEwLGFHVE0uZi5sb2coIm1fY29uc2VudF9ub19jb25kaXRpb25zIixudWxsKSkpO3ZhciBpPWFHVE0uZi5jb25zZW50X3NlcmlhbGl6ZShhR1RNLmQuY29uc2VudCksYz1pIT09YUdUTS5kLmxhc3RfY29uc2VudF9oYXNoO2lmKGFHVE0uZC5sYXN0X2NvbnNlbnRfaGFzaD1pLCJ1cGRhdGUiPT1lJiZjJiYoYUdUTS5kLmluaXR8fGFHVE0uZi5pbmplY3QoKSxhR1RNLmYuc2VuZG5hdXMoe2V2ZW50OiJhR1RNX2NvbnNlbnRfdXBkYXRlIixhR1RNdHM6RGF0ZS5ub3coKSxhR1RNY29uc2VudDphR1RNLmQuY29uc2VudD9KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihhR1RNLmQuY29uc2VudCkpOnt9fSkpLCJ1cGRhdGUiPT09ZSYmIWN8fCJmdW5jdGlvbiIhPXR5cGVvZiBhR1RNLmYuY29uc2VudF9jYWxsYmFja3x8YUdUTS5mLmNvbnNlbnRfY2FsbGJhY2soZSksYUdUTS5jLmNvbnNlbnRfc3RvcmVfdXJsKXt2YXIgZj1hR1RNLmQuY29uc2VudF9zdG9yZV90cnk7aWYoZiYmZi5oYXNoPT09aXx8KGY9YUdUTS5kLmNvbnNlbnRfc3RvcmVfdHJ5PXtoYXNoOmksbjowLGJ1c3k6ITF9KSxpIT09YUdUTS5kLmNvbnNlbnRfaGFzaCYmIWYuYnVzeSYmZi5uPDMpe2YubisrO3ZhciBkPXt9O2FHVE0uZC5zZXNzaW9uJiZhR1RNLmQuc2Vzc2lvbi51aWQmJihkLnVpZD1hR1RNLmQuc2Vzc2lvbi51aWQpLGFHVE0uZC5zZXNzaW9uJiZhR1RNLmQuc2Vzc2lvbi5zaWQmJihkLnNpZD1hR1RNLmQuc2Vzc2lvbi5zaWQpO3ZhciBNPXt9LFQ9e2d0bUNvbnNlbnQ6MSxibG9ja2VkOjF9O2Zvcih2YXIgbCBpbiBhR1RNLmQuY29uc2VudClpZihhR1RNLmQuY29uc2VudC5oYXNPd25Qcm9wZXJ0eShsKSYmIVRbbF0pe3ZhciBHPWFHVE0uZC5jb25zZW50W2xdOyIiIT09RyYmbnVsbCE9RyYmKE1bbF09Ryl9ZC5jb25zZW50PU07dmFyIHU9ITA9PT1hR1RNLmMuY29uc2VudF9zdG9yZV9lbmMscD0ibnVtYmVyIj09dHlwZW9mIGFHVE0uYy5zZXNzaW9uX3NhbHQmJmFHVE0uYy5zZXNzaW9uX3NhbHQ+PTE/YUdUTS5jLnNlc3Npb25fc2FsdDowO2FHVE0uZi5sb2coIm1fY29uc2VudF9zdG9yZV9wb3N0Iix7dXJsOmFHVE0uYy5jb25zZW50X3N0b3JlX3VybCxoYXNoOml9KTt2YXIgZz1hR1RNLmYueHNlbmQoYUdUTS5jLmNvbnNlbnRfc3RvcmVfdXJsLGQsdSxwLCEwKTshZyYmZi5uPj0zJiZhR1RNLmYubG9nKCJlX2NvbnNlbnRfc3RvcmVfZ2F2ZV91cCIse2hhc2g6aX0pLGcmJihmLmJ1c3k9ITAsZy5vbnJlYWR5c3RhdGVjaGFuZ2U9ZnVuY3Rpb24oKXtpZig0PT09Zy5yZWFkeVN0YXRlKWlmKGYuYnVzeT0hMSxnLnN0YXR1cz49MjAwJiZnLnN0YXR1czwzMDApe2lmKGFHVE0uZC5jb25zZW50X2hhc2g9aSxhR1RNLmQuc2Vzc2lvbl9zdGF0dXM9InN5bmNlZCIsYUdUTS5mLmxvZygibV9jb25zZW50X3N0b3JlX3N5bmNlZCIse2hhc2g6aX0pLGcucmVzcG9uc2VUZXh0KXRyeXt2YXIgZT1KU09OLnBhcnNlKGcucmVzcG9uc2VUZXh0KTtlJiYic3RyaW5nIj09dHlwZW9mIGUudWlkJiYwPT09ZS51aWQuaW5kZXhPZigiQy4iKSYmYUdUTS5kLnNlc3Npb24mJmUudWlkIT09YUdUTS5kLnNlc3Npb24udWlkJiYoYUdUTS5mLmxvZygibV91aWRfcHJvbW90ZWQiLHtvbGQ6YUdUTS5kLnNlc3Npb24udWlkLG5ldzplLnVpZH0pLGFHVE0uZC5zZXNzaW9uLnVpZD1lLnVpZCl9Y2F0Y2goZSl7YUdUTS5mLmxvZygiZV9jb25zZW50X3N0b3JlX3BhcnNlIix7bXNnOmUubWVzc2FnZX0pfX1lbHNle2FHVE0uZi5sb2coImVfY29uc2VudF9zdG9yZSIse3N0YXR1czpnLnN0YXR1cyxhdHRlbXB0OmYubn0pO3ZhciB0PWcuc3RhdHVzOyh0Pj00MDAmJnQ8NTAwJiY0MDghPT10JiY0MjkhPT10fHw1MDE9PT10KSYmKGYubj0zKSxmLm4+PTMmJmFHVE0uZi5sb2coImVfY29uc2VudF9zdG9yZV9nYXZlX3VwIix7aGFzaDppfSl9fSl9ZWxzZSBpPT09YUdUTS5kLmNvbnNlbnRfaGFzaCYmKGFHVE0uZC5zZXNzaW9uX3N0YXR1cz0iY29uZmlybWVkIil9cmV0dXJuIGFHVE0uZi5sb2coIm0zIixhR1RNLmQuY29uc2VudCksITB9LGFHVE0uZi5jYWxsX2NjPWZ1bmN0aW9uKCl7cmV0dXJuISgiZnVuY3Rpb24iIT10eXBlb2YgYUdUTS5mLnJ1bl9jY3x8IWFHVE0uZi5ydW5fY2MoImluaXQiKSkmJih2b2lkIDAhPT1hR1RNLmQudGltZXIuY29uc2VudCYmKGNsZWFySW50ZXJ2YWwoYUdUTS5kLnRpbWVyLmNvbnNlbnQpLGRlbGV0ZSBhR1RNLmQudGltZXIuY29uc2VudCksISFhR1RNLmQuaW5pdHx8YUdUTS5mLmluamVjdCgpKX0sImZ1bmN0aW9uIiE9dHlwZW9mIGFHVE0uZi5jb25zZW50X2xpc3RlbmVyJiYoYUdUTS5mLmNvbnNlbnRfbGlzdGVuZXI9ZnVuY3Rpb24oKXthR1RNLmMudXNlTGlzdGVuZXJ8fCgiZnVuY3Rpb24iPT10eXBlb2YgYUdUTS5mLmNhbGxfY2MmJmFHVE0uZi5jYWxsX2NjKCk/ImZ1bmN0aW9uIj09dHlwZW9mIGFHVE0uZi5zdGFydF9jb25zZW50X3BvbGwmJmFHVE0uZi5zdGFydF9jb25zZW50X3BvbGwoKTphR1RNLmQudGltZXIuY29uc2VudD1zZXRJbnRlcnZhbChmdW5jdGlvbigpe2FHVE0uZi5jYWxsX2NjKCkmJiJmdW5jdGlvbiI9PXR5cGVvZiBhR1RNLmYuc3RhcnRfY29uc2VudF9wb2xsJiZhR1RNLmYuc3RhcnRfY29uc2VudF9wb2xsKCl9LDUwMCkpfSksYUdUTS5mLnN0YXJ0X2NvbnNlbnRfcG9sbD1mdW5jdGlvbigpe2FHVE0uYy5jb25zZW50X3N0b3JlX3VybCYmKCJudW1iZXIiIT10eXBlb2YgYUdUTS5jLmNvbnNlbnRfcG9sbF9tc3x8YUdUTS5jLmNvbnNlbnRfcG9sbF9tczw9MHx8YUdUTS5kLnRpbWVyJiZhR1RNLmQudGltZXIuY29uc2VudF9wb2xsfHwoYUdUTS5kLnRpbWVyPWFHVE0uZC50aW1lcnx8e30sYUdUTS5kLnRpbWVyLmNvbnNlbnRfcG9sbD1zZXRJbnRlcnZhbChmdW5jdGlvbigpeyJmdW5jdGlvbiI9PXR5cGVvZiBhR1RNLmYucnVuX2NjJiZhR1RNLmYucnVuX2NjKCJ1cGRhdGUiKX0sYUdUTS5jLmNvbnNlbnRfcG9sbF9tcykpKX0sYUdUTS5mLmdjPWZ1bmN0aW9uKGUpe2lmKCJzdHJpbmciIT10eXBlb2YgZXx8IWUpcmV0dXJuIG51bGw7dmFyIHQ9ZS5yZXBsYWNlKC9bLiorP14ke30oKXxbXF1cXF0vZywiXFwkJiIpLG49bmV3IFJlZ0V4cCgiKD86Xnw7XFxzKikiK3QrIj0oW147XSspIiksYT1udWxsO3RyeXt2YXIgbz1kb2N1bWVudCxyPW4uZXhlYyhvW2FHVE0ubi5ja10pO3ImJnIubGVuZ3RoPjEmJihhPWRlY29kZVVSSUNvbXBvbmVudChyWzFdKSl9Y2F0Y2goZSl7fXJldHVybiBhfSxhR1RNLmYuc2M9ZnVuY3Rpb24oZSx0KXtpZigic3RyaW5nIj09dHlwZW9mIGUmJmUmJnQmJiEvWzs9XHNdLy50ZXN0KGUpKXRyeXtkb2N1bWVudFthR1RNLm4uY2tdPWUrIj0iK2VuY29kZVVSSUNvbXBvbmVudCh0KSsiOyBTZWN1cmU7IFNhbWVTaXRlPUxheDsgcGF0aD0vIn1jYXRjaChlKXt9fSxhR1RNLmYudXJsUGFyYW09ZnVuY3Rpb24oZSx0KXtpZigic3RyaW5nIiE9dHlwZW9mIGV8fCFlKXJldHVybiBudWxsO3ZhciBuPWUucmVwbGFjZSgvWy4qKz9eJHt9KCl8W1xdXFxdL2csIlxcJCYiKSxhPW5ldyBSZWdFeHAoIls/Jl0iK24rIig9KFteJiNdKil8JnwjfCQpIikuZXhlYyh0KTtyZXR1cm4gYSYmYVsyXT9kZWNvZGVVUklDb21wb25lbnQoYVsyXS5yZXBsYWNlKC9cKy9nLCIgIikpOm51bGx9LGFHVE0uZi5vcHRvdXQ9ZnVuY3Rpb24oKXt2YXIgZT1hR1RNLmYudXJsUGFyYW0oImFHVE1vcHRvdXQiLHdpbmRvdy5sb2NhdGlvbi5ocmVmKSx0PWFHVE0uZi5nYygiYUdUTW9wdG91dCIpLG49d2luZG93LmxvY2F0aW9uLmhvc3RuYW1lLnNwbGl0KCIuIiksYT1kb2N1bWVudCxvPWZ1bmN0aW9uKGUsdCxuKXthW2FHVE0ubi5ja109ImFHVE1vcHRvdXQ9IitlKyI7IG1heC1hZ2U9Iit0KyhuPyI7IGRvbWFpbj0iK246IiIpKyI7IHBhdGg9LzsgU2VjdXJlOyBTYW1lU2l0ZT1MYXgifSxyPWZ1bmN0aW9uKGUsdCl7dmFyIGE7Zm9yKG8oZSwwKSxhPTA7YTxuLmxlbmd0aC0xO2ErKylvKGUsMCxuLnNsaWNlKGEpLmpvaW4oIi4iKSk7aWYodCl7Zm9yKGE9bi5sZW5ndGgtMjthPj0wO2EtLSlpZihvKGUsdCxuLnNsaWNlKGEpLmpvaW4oIi4iKSksYUdUTS5mLmdjKCJhR1RNb3B0b3V0Iik9PT1lKXJldHVybjtvKGUsdCl9fTtpZigiMCI9PT1lKXJldHVybiByKCIwIiwwKSwhMTt2YXIgcz0iIis4NjRlNSpNYXRoLmZsb29yKERhdGUubm93KCkvODY0ZTUpLGk9ZT9zOnQmJiIwIiE9PXQ/L15cZHsxM30kLy50ZXN0KHQpP3Q6czoiIjtpZighaSlyZXR1cm4hMTtmb3IodmFyIGMgaW4gcihpLDM0MTI4ZTMpLGFHVE0pYUdUTS5oYXNPd25Qcm9wZXJ0eShjKSYmImYiIT09YyYmZGVsZXRlIGFHVE1bY107cmV0dXJuIGFHVE0uYz17fSxhR1RNLmQ9e30sYUdUTS5sPVtdLGFHVE0ubj17fSxhR1RNLmYub2JqaW5pdCgpLGFHVE0uZC5vcHRvdXQ9ITAsImZ1bmN0aW9uIj09dHlwZW9mIGFHVE0uZi5vcHRvdXRfY2FsbGJhY2smJmFHVE0uZi5vcHRvdXRfY2FsbGJhY2soKSwhMH0sYUdUTS5mLmFHVE1fZXZlbnQ9ZnVuY3Rpb24oZSl7Im9iamVjdCIhPXR5cGVvZiBhR1RNLmQuY29uc2VudCYmKGFHVE0uZC5jb25zZW50PW51bGwpLGV8fChlPSJhR1RNX2V2ZW50Iik7dmFyIHQ9e2V2ZW50OmUsYUdUTXRzOkRhdGUubm93KCksYUdUTWNvbnNlbnQ6YUdUTS5kLmNvbnNlbnQ/SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYoYUdUTS5kLmNvbnNlbnQpKTp7fX07cmV0dXJuImFHVE1fcmVhZHkiPT1lJiYodC5hR1RNPXt2ZXJzaW9uOmFHVE0uZC52ZXJzaW9uLGlzX2lmcmFtZTphR1RNLmQuaXNfaWZyYW1lLGhhc3R5RXZlbnRzOmFHVE0uZC5mLGVycm9yczphR1RNLmQuZXJyb3JzfSksdH0sYUdUTS5mLnByb3h5U3VwcG9ydD1mdW5jdGlvbigpe2lmKCJmdW5jdGlvbiIhPXR5cGVvZiBQcm94eSlyZXR1cm4hMTt0cnl7cmV0dXJuIG5ldyBQcm94eShmdW5jdGlvbigpe30se2FwcGx5OmZ1bmN0aW9uKCl7cmV0dXJuITB9fSkoKX1jYXRjaChlKXtyZXR1cm4hMX19LGFHVE0uZi51cmxMaXN0ZW5lcj1mdW5jdGlvbihlLHQsbil7aWYoIWFHVE0uZC51cmxMaXN0ZW5lcl9hY3RpdmUpe2FHVE0uZC51cmxMaXN0ZW5lcl9hY3RpdmU9ITAsIm51bWJlciIhPXR5cGVvZiB0JiYodD01MDApLCJib29sZWFuIiE9dHlwZW9mIG4mJihuPSExKSxhR1RNLmQubGFzdF91cmw9YUdUTS5kLmxhc3RfdXJsfHxhR1RNLmYuZ2V0VmFsKCJsIiwiaHJlZiIpLCJzdHJpbmciPT10eXBlb2YgYUdUTS5kLmxhc3RfdXJsJiZhR1RNLmQubGFzdF91cmx8fChhR1RNLmQubGFzdF91cmw9IiIpO3ZhciBhPWZ1bmN0aW9uKCl7dmFyIHQ9YUdUTS5mLmdldFZhbCgibCIsImhyZWYiKXx8IiI7aWYodCE9YUdUTS5kLmxhc3RfdXJsKXsic3RyaW5nIiE9dHlwZW9mIGUmJihlPSJ2UGFnZXZpZXciKTt2YXIgbj17ZXZlbnQ6ZX07bi5vbGRVUkw9YUdUTS5kLmxhc3RfdXJsLG4ubmV3VVJMPXQsbi5uZXdUaXRsZT1kb2N1bWVudC50aXRsZSxhR1RNLmYuZmlyZShuKSxhR1RNLmQubGFzdF91cmw9dH19O2FHVE0uZi5ldkxzdG4oIndpbmRvdyIsInBvcHN0YXRlIixhKSxhR1RNLmYuZXZMc3RuKCJ3aW5kb3ciLCJoYXNoY2hhbmdlIixhKTt2YXIgbz0hMTtpZihhR1RNLmYucHJveHlTdXBwb3J0KCkpe3ZhciByPXthcHBseTpmdW5jdGlvbihlLHQsbil7dmFyIG89ZS5hcHBseSh0LG4pO3JldHVybiBhKCksb319O2hpc3RvcnkucHVzaFN0YXRlPW5ldyBQcm94eShoaXN0b3J5LnB1c2hTdGF0ZSxyKSxoaXN0b3J5LnJlcGxhY2VTdGF0ZT1uZXcgUHJveHkoaGlzdG9yeS5yZXBsYWNlU3RhdGUsciksbz0hMH0odD4wJiYhbyYmbnx8dD4wJiYhbikmJmFHVE0uZi50aW1lcigidXJsTGlzdGVuZXIiLGEsbnVsbCx0LDApfX0sYUdUTS5mLmd0bV9sb2FkPWZ1bmN0aW9uKGUsdCxuLGEsbyxyKXtpZihhR1RNLmQuY29uZmlnKXtpZigib2JqZWN0IiE9dHlwZW9mIGFHVE0uZC5ndG1Mb2FkZWQmJihhR1RNLmQuZ3RtTG9hZGVkPVtdKSxhR1RNLmQuZ3RtTG9hZGVkLmxlbmd0aDwxJiYoYUdUTS5mLnNlbmRuYXVzKGFHVE0uZi5hR1RNX2V2ZW50KCJhR1RNX3JlYWR5IikpLG4mJmFHVE0uZi5zZW5kbmF1cyh7ZXZlbnQ6Imd0bS5qcyIsImd0bS5zdGFydCI6RGF0ZS5ub3coKX0pLGFHVE0uYy5hUGFnZXZpZXcmJmFHVE0uZi5zZW5kbmF1cyh7ZXZlbnQ6ImFQYWdldmlldyIsYUdUTXRzOkRhdGUubm93KCl9KSxhR1RNLmMudlBhZ2V2aWV3JiZhR1RNLmYuc2VuZG5hdXMoe2V2ZW50OiJ2UGFnZXZpZXciLGFHVE10czpEYXRlLm5vdygpfSksYUdUTS5jLnZQYWdldmlld3MmJmFHVE0uZi51cmxMaXN0ZW5lcigidlBhZ2V2aWV3IixhR1RNLmMudlBhZ2V2aWV3c1RpbWVyLGFHVE0uYy52UGFnZXZpZXdzRmFsbGJhY2spKSxhR1RNLmQuY29uc2VudEV2ZW50X2ZpcmVkPSJib29sZWFuIj09dHlwZW9mIGFHVE0uZC5jb25zZW50RXZlbnRfZmlyZWQmJmFHVE0uZC5jb25zZW50RXZlbnRfZmlyZWQsYUdUTS5jLnNlbmRDb25zZW50RXZlbnQmJiFhR1RNLmQuY29uc2VudEV2ZW50X2ZpcmVkJiYib2JqZWN0Ij09dHlwZW9mIGFHVE0uZC5jb25zZW50JiZhR1RNLmQuY29uc2VudC5oYXNSZXNwb25zZSYmKGFHVE0uZi5zZW5kbmF1cyhhR1RNLmYuYUdUTV9ldmVudCgiYUdUTV9jb25zZW50IikpLGFHVE0uZC5jb25zZW50RXZlbnRfZmlyZWQ9ITApLGFHVE0uZC5ndG1Mb2FkZWQucHVzaChufHwibm9fZ3RtX2lkIiksbil7YXx8KGE9ImlkIik7dmFyIHM9ITEsaT1hR1RNLmYuZ2MoImFHVE1kZWJ1ZyIpO2lmKGkmJnBhcnNlSW50KGkpPjAmJihzPSEwKSxzfHxhR1RNLmYudXJsUGFyYW0oImd0bV9kZWJ1ZyIsZG9jdW1lbnQubG9jYXRpb24uaHJlZikmJihzPSEwKSwhcyYmZG9jdW1lbnQucmVmZXJyZXIpe3ZhciBjPXQuY3JlYXRlRWxlbWVudCgiYSIpO2MuaHJlZj1kb2N1bWVudC5yZWZlcnJlcixjLmhvc3RuYW1lPT1hR1RNLm4udGErIi5jb20iJiYocz0hMCl9IWkmJnMmJmFHVE0uZi5zYygiYUdUTWRlYnVnIiwiMSIpO3ZhciBmPXQuY3JlYXRlRWxlbWVudCgic2NyaXB0Iik7aWYoZi5pZD0iYUdUTV90bV8iK24sZi5hc3luYz0hMCwib2JqZWN0Ij09dHlwZW9mIGFHVE0uYy5ndG1BdHRyKWZvcih2YXIgZCBpbiBhR1RNLmMuZ3RtQXR0cilmLnNldEF0dHJpYnV0ZShkLGFHVE0uYy5ndG1BdHRyW2RdKTtpZihhR1RNLmMubm9uY2UmJihmLm5vbmNlPWFHVE0uYy5ub25jZSksci5ndG1KUyYmIXMpZi5pbm5lckhUTUw9YXRvYihyLmd0bUpTKTtlbHNle3ZhciBNPXIuZ3RtVVJMfHwiaHR0cHM6Ly93d3cuIithR1RNLm4udG0rIi5jb20vZ3RtLmpzIixUPXIuZW52fHwiIjtUJiYiJiIhPT1ULmNoYXJBdCgwKSYmKFQ9IiYiK1QpO3ZhciBsPS0xPT09TS5pbmRleE9mKCI/Iik/Ij8iOiImIjtmLnNyYz1NK2wrYSsiPSIrbisiJmw9IitvK1R9dmFyIEc9dC5nZXRFbGVtZW50c0J5VGFnTmFtZSgic2NyaXB0IilbMF07Ry5wYXJlbnROb2RlLmluc2VydEJlZm9yZShmLEcpfX1lbHNlIGFHVE0uZi5sb2coImU3IixudWxsKX0sYUdUTS5mLmRvbXJlYWR5PWZ1bmN0aW9uKGUpe3ZhciB0PSExO2FHVE0uZi52T2IoZSl8fChlPXthTVNHOiJFbXB0eSBET01yZWFkeSBldmVudCBmaXJlZC4ifSx0PSEwKSxlLmV2ZW50fHwoZS5ldmVudD0iYURPTXJlYWR5IiksYUdUTS5kLmRvbV9yZWFkeSYmdHx8KCFhR1RNLmMuZGxTdGF0ZUV2ZW50cyYmdHx8YUdUTS5mLmZpcmUoZSksdCYmKGFHVE0uZC5kb21fcmVhZHk9ITApKX0sYUdUTS5mLnBhZ2VyZWFkeT1mdW5jdGlvbihlKXt2YXIgdD0hMTthR1RNLmYudk9iKGUpfHwoZT17YU1TRzoiRW1wdHkgUEFHRXJlYWR5IGV2ZW50IGZpcmVkLiJ9LHQ9ITApLGUuZXZlbnR8fChlLmV2ZW50PSJhUEFHRXJlYWR5IiksYUdUTS5kLnBhZ2VfcmVhZHkmJnR8fCghYUdUTS5jLmRsU3RhdGVFdmVudHMmJnR8fGFHVE0uZi5maXJlKGUpLHQmJihhR1RNLmQucGFnZV9yZWFkeT0hMCkpfSxhR1RNLmYuaW5pdEdUTT1mdW5jdGlvbihlKXt2YXIgdD0hMTtpZigib2JqZWN0Ij09dHlwZW9mIGFHVE0uYy5ndG0mJmFHVE0uYy5ndG0pZm9yKHZhciBuIGluIGFHVE0uYy5ndG0pYUdUTS5jLmd0bS5oYXNPd25Qcm9wZXJ0eShuKSYmKHQ9ITAsImJvb2xlYW4iIT10eXBlb2YgYUdUTS5jLmd0bVtuXS5oYXNMb2FkZWQmJihhR1RNLmMuZ3RtW25dLmhhc0xvYWRlZD0hMSksYUdUTS5jLmd0bVtuXS5oYXNMb2FkZWR8fGUmJiFhR1RNLmMuZ3RtW25dLm5vQ29uc2VudHx8KGFHVE0uZi5ndG1fbG9hZCh3aW5kb3csZG9jdW1lbnQsbixhR1RNLmMuZ3RtW25dLmlkUGFyYW0/YUdUTS5jLmd0bVtuXS5pZFBhcmFtOiIiLGFHVE0uYy5nZGwsYUdUTS5jLmd0bVtuXSksYUdUTS5jLmd0bVtuXS5oYXNMb2FkZWQ9ITApKTt0fHxlfHxhR1RNLmQuY29udGFpbmVyTGVzc1J1bnx8YUdUTS5kLmlzX2lmcmFtZXx8KGFHVE0uZC5jb250YWluZXJMZXNzUnVuPSEwLGFHVE0uZi5ndG1fbG9hZCh3aW5kb3csZG9jdW1lbnQsIiIsIiIsYUdUTS5jLmdkbCx7fSkpfSxhR1RNLmYuY2hrRFByZWFkeT1mdW5jdGlvbigpe3ZhciBlPWRvY3VtZW50LnJlYWR5U3RhdGU7ImludGVyYWN0aXZlIj09PWV8fCJjb21wbGV0ZSI9PT1lP2FHVE0uZi5kb21yZWFkeShudWxsKTphR1RNLmYuZXZMc3RuKGRvY3VtZW50LCJET01Db250ZW50TG9hZGVkIixhR1RNLmYuZG9tcmVhZHkpLCJjb21wbGV0ZSI9PT1lP2FHVE0uZi5wYWdlcmVhZHkobnVsbCk6YUdUTS5mLmV2THN0bih3aW5kb3csImxvYWQiLGFHVE0uZi5wYWdlcmVhZHkpfSxhR1RNLmYuaW5qZWN0PWZ1bmN0aW9uKCl7aWYoIWFHVE0uZC5jb25maWcpcmV0dXJuIGFHVE0uZi5sb2coImU4IixudWxsKSwhMTtpZigib2JqZWN0IiE9dHlwZW9mIGFHVE0uZC5jb25zZW50fHwiYm9vbGVhbiIhPXR5cGVvZiBhR1RNLmQuY29uc2VudC5oYXNSZXNwb25zZXx8IWFHVE0uZC5jb25zZW50Lmhhc1Jlc3BvbnNlKXJldHVybiBhR1RNLmYubG9nKCJlMTMiLG51bGwpLCExO2FHVE0uZC5pbml0fHwoKHdpbmRvd1thR1RNLmMuZ2RsXXx8W10pLmZvckVhY2goZnVuY3Rpb24oZSx0KXtpZigib2JqZWN0Ij09dHlwZW9mIGUmJmUpe2lmKCFlLmFHVE1jaGspe2UuYUdUTWRsPSEwO3ZhciBuPUpTT04ucGFyc2UoYUdUTS5mLnNTdHJmKGUpKTt2b2lkIDAhPT1uWyJndG0udW5pcXVlRXZlbnRJZCJdJiZkZWxldGUgblsiZ3RtLnVuaXF1ZUV2ZW50SWQiXSxhR1RNLmQuZi5wdXNoKG4pfX1lbHNlIGFHVE0uZi5sb2coImUxNyIse29ial90eXBlOnR5cGVvZiBlLG9ial92YWx1ZTplLGluZGV4OnR9KSxhR1RNLmQuZi5wdXNoKHtldmVudDoiZXhjZXB0aW9uIixlcnJtc2c6IkRhdGFMYXllciBFbnRyeSBpcyBubyBvYmplY3QiLGVycnR5cGU6IkRMIEVycm9yIixvYmpfdHlwZTp0eXBlb2YgZSxvYmpfdmFsdWU6ZX0pfSksYUdUTS5kLmNvbnNlbnQuZ3RtQ29uc2VudCYmKGFHVE0uZi5pbml0R1RNKCExKSxhR1RNLmQuaW5pdD0hMCksYUdUTS5kLmluaXQmJmFHVE0uZi5jaGtEUHJlYWR5KCkpO3JldHVybiJmdW5jdGlvbiI9PXR5cGVvZiBhR1RNLmYuaW5qZWN0X2NhbGxiYWNrJiZhR1RNLmYuaW5qZWN0X2NhbGxiYWNrKCksYUdUTS5mLmxvZygibTYiLG51bGwpLCEwfSxhR1RNLmYuaUZyYW1lRmlyZT1mdW5jdGlvbihlKXsib2JqZWN0Ij09dHlwZW9mIGUmJmUmJihhR1RNLmQuaXNfaWZyYW1lJiYic3RyaW5nIj09dHlwZW9mIGUuZXZlbnQmJi9eKGFHVE18Z3RtXC58W2F2XURPTXJlYWR5fFthdl1QQUdFcmVhZHkpLy50ZXN0KGUuZXZlbnQpP2FHVE0uZi5zZW5kbmF1cyhlKTooZS5hR1RNX3NvdXJjZT0iaUZyYW1lICIrZG9jdW1lbnQubG9jYXRpb24uaG9zdG5hbWUsYUdUTS5kLmlmcmFtZS5jb3VudGVyLmV2ZW50cysrLGUuaWZFdkN0cj1hR1RNLmQuaWZyYW1lLmNvdW50ZXIuZXZlbnRzLCJzdHJpbmciPT10eXBlb2YgZS5ldmVudCYmZS5ldmVudCYmKGFHVE0uZC5pZnJhbWUuY291bnRlcltlLmV2ZW50XT1hR1RNLmQuaWZyYW1lLmNvdW50ZXJbZS5ldmVudF18fDAsYUdUTS5kLmlmcmFtZS5jb3VudGVyW2UuZXZlbnRdKyssZVsiaWZFdkN0cl8iK2UuZXZlbnRdPWFHVE0uZC5pZnJhbWUuY291bnRlcltlLmV2ZW50XSksZS5hR1RNdHMmJmRlbGV0ZSBlLmFHVE10cyxlLmFHVE1wYXJhbXMmJmRlbGV0ZSBlLmFHVE1wYXJhbXMsYUdUTS5kLmlmcmFtZS5vcmlnaW4/d2luZG93LnRvcC5wb3N0TWVzc2FnZShlLGFHVE0uZC5pZnJhbWUub3JpZ2luKTphR1RNLmQuZi5wdXNoKGUpKSl9LGFHVE0uZi5pZkhhbmRzaGFrZT1mdW5jdGlvbigpe2lmKCFhR1RNLmQuaXNfaWZyYW1lJiYhYUdUTS5kLmlmcmFtZS5oYW5kc2hha2Upe3ZhciBlPWRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCJpZnJhbWUiKTtpZighZS5sZW5ndGgpcmV0dXJuO2Zvcih2YXIgdD0wO3Q8ZS5sZW5ndGg7dCsrKXt2YXIgbj1lW3RdO24mJm4uY29udGVudFdpbmRvdyYmbi5jb250ZW50V2luZG93LnBvc3RNZXNzYWdlJiZuLmNvbnRlbnRXaW5kb3cucG9zdE1lc3NhZ2UoImFHVE1fVG9wMmlGcmFtZSBIYW5kc2hha2UiLCIqIil9YUdUTS5kLmlmcmFtZS5oYW5kc2hha2U9ITB9fSxhR1RNLmYuaWZIU2xpc3Rlbj1mdW5jdGlvbihlKXtpZihhR1RNLmQuaXNfaWZyYW1lJiZlLnNvdXJjZT09PXdpbmRvdy50b3AmJiJzdHJpbmciPT10eXBlb2YgZS5kYXRhJiYiYUdUTV9Ub3AyaUZyYW1lIEhhbmRzaGFrZSI9PWUuZGF0YSlmb3IoYUdUTS5kLmlmcmFtZS5vcmlnaW49ZS5vcmlnaW4sYUdUTS5kLmlmcmFtZS5pZkxpc3Rlbj0hMSx3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcigibWVzc2FnZSIsYUdUTS5mLmlmSFNsaXN0ZW4sITEpO2FHVE0uZC5mLmxlbmd0aDspe3ZhciB0PWFHVE0uZC5mLnNoaWZ0KCk7YUdUTS5mLmlGcmFtZUZpcmUodCl9fSxhR1RNLmYudk9iPWZ1bmN0aW9uKGUpe2lmKCJvYmplY3QiIT10eXBlb2YgZXx8IWUpcmV0dXJuITE7dHJ5e0pTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoZSkpfWNhdGNoKGUpe3JldHVybiExfXJldHVybiEwfSxhR1RNLmYudlN0PWZ1bmN0aW9uKGUpe3ZhciB0PUFycmF5LmlzQXJyYXkoZSk/ZToic3RyaW5nIj09dHlwZW9mIGU/W2VdOltdO3JldHVybiAwIT09dC5sZW5ndGgmJnQuZXZlcnkoZnVuY3Rpb24oZSl7cmV0dXJuInN0cmluZyI9PXR5cGVvZiBlJiYiIiE9PWV9KX0sYUdUTS5mLnBhc3NpdmVTdXBwb3J0ZWQ9ZnVuY3Rpb24oKXtpZigiYm9vbGVhbiI9PXR5cGVvZiBhR1RNLmQucGFzc2l2ZV9zdXBwb3J0ZWQpcmV0dXJuIGFHVE0uZC5wYXNzaXZlX3N1cHBvcnRlZDt2YXIgZT0hMTt0cnl7dmFyIHQ9T2JqZWN0LmRlZmluZVByb3BlcnR5KHt9LCJwYXNzaXZlIix7Z2V0OmZ1bmN0aW9uKCl7cmV0dXJuIGU9ITAsITB9fSksbj1mdW5jdGlvbigpe307d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoImFHVE1wYXNzaXZldGVzdCIsbix0KSx3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcigiYUdUTXBhc3NpdmV0ZXN0IixuLHQpfWNhdGNoKHQpe2U9ITF9cmV0dXJuIGFHVE0uZC5wYXNzaXZlX3N1cHBvcnRlZD1lLGV9LGFHVE0uZi50aHJvdHRsZT1mdW5jdGlvbihlLHQpe2lmKCJmdW5jdGlvbiIhPXR5cGVvZiBlKXJldHVybiBlO2lmKCJudW1iZXIiIT10eXBlb2YgdHx8dDw9MClyZXR1cm4gZTt2YXIgbj0wLGE9bnVsbCxvPW51bGwscj1udWxsO3JldHVybiBmdW5jdGlvbigpe3ZhciBzPURhdGUubm93KCk7bz10aGlzLHI9YXJndW1lbnRzO3ZhciBpPXQtKHMtbik7aTw9MD8oYSYmKGNsZWFyVGltZW91dChhKSxhPW51bGwpLG49cyxlLmFwcGx5KG8scikpOmF8fChhPXNldFRpbWVvdXQoZnVuY3Rpb24oKXtuPURhdGUubm93KCksYT1udWxsLGUuYXBwbHkobyxyKX0saSkpfX0sYUdUTS5mLmV2THN0bj1mdW5jdGlvbihlLHQsbixhKXtpZigid2luZG93Ij09PWUmJihlPXdpbmRvdyksImRvY3VtZW50Ij09PWUmJihlPWRvY3VtZW50KSwib2JqZWN0Ij09dHlwZW9mIGUmJmUmJiJzdHJpbmciPT10eXBlb2YgdCYmImZ1bmN0aW9uIj09dHlwZW9mIG4peyJvYmplY3QiPT10eXBlb2YgYSYmYXx8KGE9e30pO3RyeXtpZigibWVzc2FnZSI9PXQpYUdUTS5kLmlmcmFtZS50b3BMaXN0ZW58fGFHVE0uZC5pc19pZnJhbWV8fChhR1RNLmQuaWZyYW1lLnRvcExpc3Rlbj0hMCxlLmFkZEV2ZW50TGlzdGVuZXIodCxmdW5jdGlvbihlKXtuKHZvaWQgMCE9PWUuZGF0YT9lLmRhdGE6bnVsbCwic3RyaW5nIj09dHlwZW9mIGUub3JpZ2luP2Uub3JpZ2luOiIiKX0pKTtlbHNle3ZhciBvPSJudW1iZXIiPT10eXBlb2YgYS50aHJvdHRsZSYmYS50aHJvdHRsZT4wP2FHVE0uZi50aHJvdHRsZShuLGEudGhyb3R0bGUpOm47ITA9PT1hLnBhc3NpdmUmJmFHVE0uZi5wYXNzaXZlU3VwcG9ydGVkKCk/ZS5hZGRFdmVudExpc3RlbmVyKHQsbyx7cGFzc2l2ZTohMH0pOmUuYWRkRXZlbnRMaXN0ZW5lcih0LG8pfX1jYXRjaChhKXthR1RNLmYubG9nKCJlMTIiLHtlcnJvcjphLGVsOmUsZXY6dCxmY3Q6bn0pfX1lbHNlIGFHVE0uZi5sb2coImUxMSIse2VsOmUsZXY6dCxmY3Q6bn0pfSxhR1RNLmYucm1Mc3RuPWZ1bmN0aW9uKGUsdCxuKXsid2luZG93Ij09PWUmJihlPXdpbmRvdyksImRvY3VtZW50Ij09PWUmJihlPWRvY3VtZW50KTt0cnl7ZS5yZW1vdmVFdmVudExpc3RlbmVyKHQsbil9Y2F0Y2goZSl7fX0sYUdUTS5mLmdldFZhbD1mdW5jdGlvbihlLHQpe2lmKGFHVE0uZi52U3QoW2UsdF0pJiZ0Lm1hdGNoKC9bYS16XSsvaSkmJigicCIhPWV8fCJvYmplY3QiPT10eXBlb2YgcGVyZm9ybWFuY2UmJnBlcmZvcm1hbmNlKSlzd2l0Y2goZSl7Y2FzZSJ3IjpyZXR1cm4gYUdUTS5mLnZPYih3aW5kb3dbdF0pP0pTT04ucGFyc2UoYUdUTS5mLnNTdHJmKHdpbmRvd1t0XSkpOndpbmRvd1t0XTtjYXNlIm4iOnJldHVybiBhR1RNLmYudk9iKG5hdmlnYXRvclt0XSk/SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYobmF2aWdhdG9yW3RdKSk6bmF2aWdhdG9yW3RdO2Nhc2UiZCI6cmV0dXJuIGRvY3VtZW50W3RdO2Nhc2UibCI6cmV0dXJuIGRvY3VtZW50LmxvY2F0aW9uW3RdO2Nhc2UiaCI6cmV0dXJuIGRvY3VtZW50LmhlYWRbdF07Y2FzZSJiIjpyZXR1cm4gZG9jdW1lbnQuYm9keVt0XTtjYXNlInMiOnJldHVybiBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgiaHRtbCIpWzBdLnNjcm9sbFRvcHx8MDtjYXNlIm0iOnJldHVybiB3aW5kb3cuc2NyZWVuW3RdO2Nhc2UiYyI6cmV0dXJuIHdpbmRvdy5nb29nbGVfdGFnX2RhdGEmJndpbmRvdy5nb29nbGVfdGFnX2RhdGEuaWNzP0pTT04ucGFyc2UoYUdUTS5mLnNTdHJmKHdpbmRvdy5nb29nbGVfdGFnX2RhdGEuaWNzKSk6bnVsbDtjYXNlInAiOnJldHVybiJub3ciPT10P3BlcmZvcm1hbmNlLm5vdygpOnBlcmZvcm1hbmNlW3RdO2RlZmF1bHQ6cmV0dXJufX0sYUdUTS5mLmdldE5vZGVBdHRyPWZ1bmN0aW9uKGUsdCl7dmFyIG49ZG9jdW1lbnQucXVlcnlTZWxlY3RvcihlKTtyZXR1cm4gbj9uLmdldEF0dHJpYnV0ZSh0KTpudWxsfSxhR1RNLmYubmV3Tm9kZT1mdW5jdGlvbihlLHQsbil7aWYoYUdUTS5mLnZTdChbZSx0XSkmJiJvYmplY3QiPT10eXBlb2Ygbil7dmFyIGE9ZG9jdW1lbnQuY3JlYXRlRWxlbWVudChlKSxvPWRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IodCk7aWYobyl7Zm9yKHZhciByIGluIG4paWYobi5oYXNPd25Qcm9wZXJ0eShyKSl7dmFyIHM9ci5zcGxpdCgiLiIpOzE9PT1zLmxlbmd0aD9hLnNldEF0dHJpYnV0ZShyLG5bcl0pOihhW3NbMF1dfHwoYVtzWzBdXT17fSksYVtzWzBdXVtzWzFdXT1uW3JdKX1vLmFwcGVuZENoaWxkKGEpfX19LGFHVE0uZi5kZWxOb2RlPWZ1bmN0aW9uKGUpe2lmKGFHVE0uZi52U3QoZSkpe3ZhciB0PWRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoZSk7dCYmdC5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKHQpfX0sYUdUTS5mLnBhZ2VpbmZvPWZ1bmN0aW9uKGUpe3ZhciB0PTAsbj0wO2lmKChlPWV8fHt9KS5jb3VudFdvcmRzJiZmdW5jdGlvbiBlKG4pe2lmKDM9PT1uLm5vZGVUeXBlKXt2YXIgYT1uLnRleHRDb250ZW50LnRyaW0oKTthJiYodCs9YS5zcGxpdCgvXHMrLykubGVuZ3RoKX1lbHNlIGlmKDE9PT1uLm5vZGVUeXBlJiYhL14oc2NyaXB0fHN0eWxlfG5vc2NyaXB0KSQvaS50ZXN0KG4udGFnTmFtZSkpZm9yKHZhciBvPTA7bzxuLmNoaWxkTm9kZXMubGVuZ3RoO28rKyllKG4uY2hpbGROb2Rlc1tvXSl9KGRvY3VtZW50LmJvZHkpLGUuY291bnRJbWFnZXMpZm9yKHZhciBhPWRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCJpbWciKSxvPTA7bzxhLmxlbmd0aDtvKyspYVtvXS5uYXR1cmFsV2lkdGg+MjUwJiZhW29dLm5hdHVyYWxIZWlnaHQ+MjUwJiZuKys7cmV0dXJue3dvcmRzOnQsaW1hZ2VzOm59fSxhR1RNLmYuY3BMc3Q9ZnVuY3Rpb24oZSx0LG4pe3RyeXtlLmFkZEV2ZW50TGlzdGVuZXIodCxmdW5jdGlvbihlKXt2YXIgdDt3aW5kb3cuZ2V0U2VsZWN0aW9uJiYodD13aW5kb3cuZ2V0U2VsZWN0aW9uKCkudG9TdHJpbmcoKSkmJm4odCl9KX1jYXRjaCh0KXthR1RNLmYubG9nKCJlMTIiLHtlbGVtZW50OmUsZXJyb3I6dH0pfX0sYUdUTS5mLmVsTHN0PWZ1bmN0aW9uKGUsdCxuKXt0cnl7ZS5hZGRFdmVudExpc3RlbmVyKHQsZnVuY3Rpb24oZSl7Zm9yKHZhciB0PXRoaXMudGFnTmFtZS50b0xvd2VyQ2FzZSgpLGE9IiIsbz0iIixyPW51bGwscz1udWxsLGk9MCxjPXRoaXM7YyYmYy5wYXJlbnRFbGVtZW50OyljPWMucGFyZW50RWxlbWVudCwhYSYmYy5pZCYmKGE9KCJzdHJpbmciPT10eXBlb2YgYy5ub2RlTmFtZT9jLm5vZGVOYW1lLnRvTG93ZXJDYXNlKCkrIjoiOiIiKStjLmlkKSwhbyYmYy5nZXRBdHRyaWJ1dGUoImNsYXNzIikmJihvPSgic3RyaW5nIj09dHlwZW9mIGMubm9kZU5hbWU/Yy5ub2RlTmFtZS50b0xvd2VyQ2FzZSgpKyI6IjoiIikrYy5nZXRBdHRyaWJ1dGUoImNsYXNzIikpO2lmKCJpbnB1dCI9PT10fHwic2VsZWN0Ij09PXR8fCJ0ZXh0YXJlYSI9PT10KXtmb3IoYz10aGlzO2MmJmMucGFyZW50RWxlbWVudCYmImZvcm0iIT09Yy50YWdOYW1lLnRvTG93ZXJDYXNlKCk7KWM9Yy5wYXJlbnRFbGVtZW50OyJmb3JtIj09PWMudGFnTmFtZS50b0xvd2VyQ2FzZSgpJiYocj17aWQ6Yy5pZCxjbGFzczpjLmdldEF0dHJpYnV0ZSgiY2xhc3MiKSxuYW1lOmMuZ2V0QXR0cmlidXRlKCJuYW1lIiksYWN0aW9uOmMuYWN0aW9uLGVsZW1lbnRzOmMuZWxlbWVudHMubGVuZ3RofSxzPUFycmF5LnByb3RvdHlwZS5pbmRleE9mLmNhbGwoYy5lbGVtZW50cyx0aGlzKSsxKX0ib2JqZWN0Ij09dHlwZW9mIHRoaXMuZWxlbWVudHMmJiJudW1iZXIiPT10eXBlb2YgdGhpcy5lbGVtZW50cy5sZW5ndGgmJihpPXRoaXMuZWxlbWVudHMubGVuZ3RoKTt2YXIgZj17dGFnTmFtZTp0LHRhcmdldDp0aGlzLnRhcmdldHx8IiIscGFyZW50SUQ6YSxwYXJlbnRDbGFzczpvLGlkOnRoaXMuaWR8fCIiLG5hbWU6dGhpcy5nZXRBdHRyaWJ1dGUoIm5hbWUiKXx8IiIsY2xhc3M6dGhpcy5nZXRBdHRyaWJ1dGUoImNsYXNzIil8fCIiLGhyZWY6dGhpcy5ocmVmfHwiIixzcmM6dGhpcy5zcmN8fCIiLGFjdGlvbjp0aGlzLmFjdGlvbnx8IiIsdHlwZTp0aGlzLnR5cGV8fCIiLGVsZW1lbnRzOmkscG9zaXRpb246cyxmb3JtOnIsaHRtbDp0aGlzLm91dGVySFRNTD90aGlzLm91dGVySFRNTC50b1N0cmluZygpOiIiLHRleHQ6dGhpcy5vdXRlclRleHQ/dGhpcy5vdXRlclRleHQudG9TdHJpbmcoKToiIn07Zi5odG1sLmxlbmd0aD41MTImJihmLmh0bWw9Zi5odG1sLnNsaWNlKDAsNTA5KSsiLi4uIiksZi50ZXh0Lmxlbmd0aD41MTImJihmLnRleHQ9Zi50ZXh0LnNsaWNlKDAsNTA5KSsiLi4uIiksbihmKX0pfWNhdGNoKHQpe2FHVE0uZi5sb2coImUxMiIse2VsZW1lbnQ6ZSxlcnJvcjp0fSl9fSxhR1RNLmYuYWRkRWxMc3Q9ZnVuY3Rpb24oZSx0LG4pe2lmKGFHVE0uZi52U3QoW2UsdF0pJiYiZnVuY3Rpb24iPT10eXBlb2Ygbil7dmFyIGE9ZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChlKTsib2JqZWN0Ij09dHlwZW9mIGEmJiJudW1iZXIiPT10eXBlb2YgYS5sZW5ndGgmJjAhPWEubGVuZ3RoJiZhLmZvckVhY2goZnVuY3Rpb24oZSl7aWYoImNvcHkiPT09dClhR1RNLmYuY3BMc3QoZSx0LG4pO2Vsc2UgYUdUTS5mLmVsTHN0KGUsdCxuKX0pfX0sYUdUTS5mLm9ic2VydmVyPWZ1bmN0aW9uKGUsdCxuKXtpZihhR1RNLmYudlN0KFtlLHRdKSYmImZ1bmN0aW9uIj09dHlwZW9mIG4pe25ldyBNdXRhdGlvbk9ic2VydmVyKGZ1bmN0aW9uKGEpe2EuZm9yRWFjaChmdW5jdGlvbihhKXsiY2hpbGRMaXN0Ij09PWEudHlwZSYmYS5hZGRlZE5vZGVzLmxlbmd0aCYmQXJyYXkucHJvdG90eXBlLmZvckVhY2guY2FsbChhLmFkZGVkTm9kZXMsZnVuY3Rpb24oYSl7aWYoMT09PWEubm9kZVR5cGUmJiJzdHJpbmciPT10eXBlb2YgYS50YWdOYW1lJiZhLnRhZ05hbWUudG9Mb3dlckNhc2UoKT09PWUudG9Mb3dlckNhc2UoKSYmYUdUTS5mLmVsTHN0KGEsdCxuKSwxPT09YS5ub2RlVHlwZSYmYS5xdWVyeVNlbGVjdG9yQWxsKXt2YXIgbz1hLnF1ZXJ5U2VsZWN0b3JBbGwoZS50b0xvd2VyQ2FzZSgpKTtBcnJheS5wcm90b3R5cGUuZm9yRWFjaC5jYWxsKG8sZnVuY3Rpb24oZSl7YUdUTS5mLmVsTHN0KGUsdCxuKX0pfX0pfSl9KS5vYnNlcnZlKGRvY3VtZW50LmJvZHkse2NoaWxkTGlzdDohMCxzdWJ0cmVlOiEwLGF0dHJpYnV0ZXM6ITF9KX19LGFHVE0uZi5yVGVzdD1mdW5jdGlvbihlLHQpe3JldHVybiBhR1RNLmYudlN0KFtlLHRdKSYmbmV3IFJlZ0V4cCh0LCJpIikudGVzdChlKX0sYUdUTS5mLnJNYXRjaD1mdW5jdGlvbihlLHQpe3JldHVybiBlLm1hdGNoKG5ldyBSZWdFeHAodCkpfSxhR1RNLmYuclJlcGxhY2U9ZnVuY3Rpb24oZSx0LG4pe3JldHVybiBhR1RNLmYudlN0KFtlLHQsbl0pP2UucmVwbGFjZShuZXcgUmVnRXhwKHQsImdpIiksbik6ZX0sYUdUTS5mLmlzSUZyYW1lPWZ1bmN0aW9uKCl7cmV0dXJuIHdpbmRvdy5zZWxmIT09d2luZG93LnRvcH0sYUdUTS5mLmpzZXJyb3JzPWZ1bmN0aW9uKCl7YUdUTS5mLmV2THN0bih3aW5kb3csImVycm9yIixmdW5jdGlvbihlKXtpZihudWxsIT09ZSl7dmFyIHQ9InN0cmluZyI9PXR5cGVvZiBlLm1lc3NhZ2U/ZS5tZXNzYWdlOiIiLG49InN0cmluZyI9PXR5cGVvZiBlLmZpbGVuYW1lP2UuZmlsZW5hbWU6IiI7aWYoInNjcmlwdCBlcnJvci4iPT10LnRvTG93ZXJDYXNlKCkpe2lmKCFuKXJldHVybjt0PXQucmVwbGFjZSgiLiIsIjoiKSsiIGVycm9yIGZyb20gb3RoZXIgZG9tYWluLiJ9biYmKHQrPSIgfCBmaWxlOiAiK24pO3ZhciBhPWFHVE0uZi5zdHJjbGVhbihlLmxpbmVubyk7IjAiPT1hJiYoYT0iIiksYSYmKHQrPSIgfCBsaW5lOiAiK2EpO3ZhciBvPWFHVE0uZi5zdHJjbGVhbihlLmNvbG5vKTsiMCI9PW8mJihvPSIiKSxvJiYodCs9IiB8IGNvbDogIitvKSxhR1RNLmQuZXJyb3JzLnB1c2godCk7dmFyIHI9IiI7dHJ5e3I9bmF2aWdhdG9yLmFwcENvZGVOYW1lKyIgfCAiK25hdmlnYXRvci5hcHBOYW1lKyIgfCAiK25hdmlnYXRvci5hcHBWZXJzaW9uKyIgfCAiK25hdmlnYXRvci5wbGF0Zm9ybX1jYXRjaChlKXt9aWYoYUdUTS5kLmVycm9yX2NvdW50ZXIrKz49MTAwKXJldHVybjthR1RNLmQuZXJyb3JfY291bnRlcjw9NSYmYUdUTS5mLmZpcmUoe2V2ZW50OiJleGNlcHRpb24iLGVycm1zZzp0LGJyb3dzZXI6cixlcnJ0eXBlOiJKUyBFcnJvciIsdGltZXN0YW1wOkRhdGUubm93KCksZXJyY3Q6YUdUTS5kLmVycm9yX2NvdW50ZXIsZXZlbnRNb2RlbDpudWxsfSl9fSl9LGFHVE0uZi50aW1lcmZrdD1mdW5jdGlvbihlKXt2YXIgdD1KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihlKSk7dC50aW1lcl9tcz0xKnQudGltZXJfbXMsdC50aW1lcl9jdCsrLHQudGltZXJfdG09dC50aW1lcl9tcyp0LnRpbWVyX2N0LHQudGltZXJfc2M9cGFyc2VGbG9hdCgodC50aW1lcl90bS8xZTMpLnRvRml4ZWQoMykpLHQuZXZlbnQ9dC5ldmVudHx8InRpbWVyIiwtMSE9PXQuZXZlbnQuaW5kZXhPZigiW3NdIikmJih0LmV2ZW50PXQuZXZlbnQucmVwbGFjZSgiW3NdIix0LnRpbWVyX3NjLnRvU3RyaW5nKCkpKSx0LmV2ZW50TW9kZWw9bnVsbCxhR1RNLmYuZmlyZSh0KX0sYUdUTS5mLnRpbWVyPWZ1bmN0aW9uKGUsdCxuLGEsbyl7aWYoIWUmJiJvYmplY3QiPT10eXBlb2YgbiYmbiYmInN0cmluZyI9PXR5cGVvZiBuLmV2ZW50JiYoZT1uLmV2ZW50KSxlPWV8fCJ0aW1lciIsZSs9Il8iK0RhdGUubm93KCkudG9TdHJpbmcoKSsiXyIrTWF0aC5mbG9vcig5OTk5OTkqTWF0aC5yYW5kb20oKSsxKS50b1N0cmluZygpLGFHVE0uZi5zdG9wdGltZXIoZSksIm9iamVjdCI9PXR5cGVvZiBuJiZuKXZhciByPUpTT04ucGFyc2UoYUdUTS5mLnNTdHJmKG4pKTtlbHNlIHI9e307ci50aW1lcl9ubT1lLHIudGltZXJfbXM9YSxyLnRpbWVyX3JwPW8sci50aW1lcl9jdD0wLHIuaWQ9MT09PXIudGltZXJfcnA/c2V0VGltZW91dChmdW5jdGlvbigpe3Q/dChyKTphR1RNLmYudGltZXJma3Qocil9LGEpOnNldEludGVydmFsKGZ1bmN0aW9uKCl7dD90KHIpOmFHVE0uZi50aW1lcmZrdChyKSxyLnRpbWVyX2N0Kyssci50aW1lcl9ycD4wJiZyLnRpbWVyX2N0Pj1yLnRpbWVyX3JwJiZhR1RNLmYuc3RvcHRpbWVyKHIudGltZXJfbm0pfSxhKSxhR1RNLmQudGltZXJbZV09cn0sYUdUTS5mLnN0b3B0aW1lcj1mdW5jdGlvbihlKXtpZigib2JqZWN0IiE9dHlwZW9mIGFHVE0uZC50aW1lciYmKGFHVE0uZC50aW1lcj17fSksIm9iamVjdCI9PXR5cGVvZiBhR1RNLmQudGltZXJbZV0pe3ZhciB0PWFHVE0uZC50aW1lcltlXTsxPT09dC50aW1lcl9ycD9jbGVhclRpbWVvdXQodC5pZCk6Y2xlYXJJbnRlcnZhbCh0LmlkKSxkZWxldGUgYUdUTS5kLnRpbWVyW2VdfX0sYUdUTS5mLmRscmVwZWF0PWZ1bmN0aW9uKGUpe2lmKCJvYmplY3QiPT10eXBlb2YgZSYmZSYmIWFHVE0uZC5kbHJlcGVhdERvbmUpe3ZhciB0PWZ1bmN0aW9uKHQsbil7ZS5kZWJ1ZyYmIm9iamVjdCI9PXR5cGVvZiB3aW5kb3cuY29uc29sZSYmd2luZG93LmNvbnNvbGUubG9nJiZ3aW5kb3cuY29uc29sZS5sb2coImFHVE0gZGxyZXBlYXQ6ICIrdCxuKX0sbj1mdW5jdGlvbigpe3JldHVybiJsaXZlIj09ZS5zb3VyY2U/d2luZG93W2FHVE0uYy5nZGxdfHxbXToiZGwiPT1lLnNvdXJjZT9hR1RNLmQuZGx8fFtdOmFHVE0uZC5mfHxbXX0sYT1mdW5jdGlvbihlLHQpe2Zvcih2YXIgbj1lLnNwbGl0KCIsIiksYT0wO2E8bi5sZW5ndGg7YSsrKXt2YXIgbz1uW2FdLnJlcGxhY2UoL15ccyt8XHMrJC9nLCIiKTtpZihvKXt2YXIgcj1vLnJlcGxhY2UoL1suKis/XiR7fSgpfFtcXVxcXS9nLCJcXCQmIikucmVwbGFjZSgvXFxcKi9nLCIuKiIpO3RyeXtpZihuZXcgUmVnRXhwKCJeIityKyIkIiwiaSIpLnRlc3QodCkpcmV0dXJuITB9Y2F0Y2goZSl7fX19cmV0dXJuITF9LG89ZnVuY3Rpb24oZSl7aWYoIWUpcmV0dXJuIG51bGw7dmFyIHQ9ZS5pbmRleE9mKCJbIik7aWYodDwwKXJldHVybntldjplLGF0dHI6bnVsbCx2YWw6bnVsbH07dmFyIG49ZS5pbmRleE9mKCJdIik7aWYobjx0fHwhZS5zdWJzdHJpbmcoMCx0KSlyZXR1cm4gbnVsbDtpZihuKzEhPT1lLmxlbmd0aClyZXR1cm4gbnVsbDt2YXIgYT1lLnN1YnN0cmluZyh0KzEsbiksbz1hLmluZGV4T2YoIjoiKSxyPW8+PTA/YS5zdWJzdHJpbmcoMCxvKTphO3JldHVybiByP3tldjplLnN1YnN0cmluZygwLHQpLGF0dHI6cix2YWw6bz49MD9hLnN1YnN0cmluZyhvKzEpOm51bGx9Om51bGx9LHI9ZnVuY3Rpb24oZSl7cmV0dXJuIGUucmVwbGFjZSgvXlxzK3xccyskL2csIiIpfSxzPVtdO2lmKGUuZ2F0ZUV2ZW50cylmb3IodmFyIGk9ZS5nYXRlRXZlbnRzLnNwbGl0KCIsIiksYz0wO2M8aS5sZW5ndGg7YysrKXt2YXIgZj1yKGlbY10pO2lmKGYpe3ZhciBkPWYuaW5kZXhPZigiP2lmPSIpO2lmKGQ8MClzLnB1c2goe25hbWU6Zixjb25kOm51bGx9KTtlbHNle3ZhciBNPXIoZi5zdWJzdHJpbmcoMCxkKSk7aWYoTSl7dmFyIFQ9byhyKGYuc3Vic3RyaW5nKGQrNCkpKTtUfHx0KCJpbnZhbGlkID9pZj0gcHJlZGljYXRlLCBnYXRlIHRyZWF0ZWQgYXMgdW5jb25kaXRpb25hbDogIitmKSxzLnB1c2goe25hbWU6TSxjb25kOlR9KX1lbHNlIHQoImdhdGUgdG9rZW4gd2l0aCBlbXB0eSBuYW1lIGJlZm9yZSA/aWY9LCBza2lwcGVkOiAiK2YpfX19dmFyIGw9ZnVuY3Rpb24oZSx0KXtmb3IodmFyIG49MDtuPGUubGVuZ3RoO24rKylpZihlW25dJiZlW25dLmV2ZW50PT09dClyZXR1cm4hMDtyZXR1cm4hMX0sRz1mdW5jdGlvbihlLHQpe2Zvcih2YXIgbj0hMSxhPTA7YTxlLmxlbmd0aDthKyspe3ZhciBvPWVbYV07aWYobyYmby5ldmVudD09PXQuZXYpe2lmKG49ITAsbnVsbD09dC5hdHRyKXJldHVybiAxO3ZhciByPW9bdC5hdHRyXTtpZihudWxsPT10LnZhbCl7aWYobnVsbCE9ciYmIiIhPT1yKXJldHVybiAxfWVsc2UgaWYoU3RyaW5nKHIpPT09dC52YWwpcmV0dXJuIDF9fXJldHVybiBuPzA6LTF9LHU9ZnVuY3Rpb24oZSl7Zm9yKHZhciB0PTA7dDxzLmxlbmd0aDt0Kyspe3ZhciBuPXNbdF07aWYobi5jb25kKXt2YXIgYT1HKGUsbi5jb25kKTtpZigwPT09YSljb250aW51ZTtpZigtMT09PWEpcmV0dXJuITF9aWYoIWwoZSxuLm5hbWUpKXJldHVybiExfXJldHVybiEwfSxwPWZ1bmN0aW9uKHQpe2lmKCJvYmplY3QiIT10eXBlb2YgdHx8IXQpcmV0dXJuITE7aWYoITA9PT10LmFHVE1yZXBlYXRlZClyZXR1cm4hMTtpZighMD09PXQuYUdUTWRsKXtpZighZS5ndG1GaXJlZClyZXR1cm4hMX1lbHNlIGlmKCFlLmFndG1GaXJlZClyZXR1cm4hMTtyZXR1cm4oInN0cmluZyIhPXR5cGVvZiB0LmV2ZW50fHwwIT09dC5ldmVudC5pbmRleE9mKCJhR1RNIikpJiYoKCJzdHJpbmciPT10eXBlb2YgdC5ldmVudHx8InN0cmluZyIhPXR5cGVvZiB0LnR5cGV8fCJvYmplY3QiIT10eXBlb2YgdC5mbGFnc3x8IXQuZmxhZ3N8fCF0LmZsYWdzLmVuYWJsZVVudGFnZ2VkUGFnZVJlcG9ydGluZykmJighKCFlLmd0bUV2ZW50cyYmInN0cmluZyI9PXR5cGVvZiB0LmV2ZW50JiYvXmd0bVwuKHN0YXJ0fGluaXRfY29uc2VudHxpbml0fGpzfGRvbXxsb2FkKSQvaS50ZXN0KHQuZXZlbnQpKSYmKCEoZS53aGl0ZWxpc3QmJiJzdHJpbmciPT10eXBlb2YgdC5ldmVudCYmIWEoZS53aGl0ZWxpc3QsdC5ldmVudCkpJiYoKCFlLmJsYWNrbGlzdHx8InN0cmluZyIhPXR5cGVvZiB0LmV2ZW50fHwhYShlLmJsYWNrbGlzdCx0LmV2ZW50KSkmJiEoIWUubWVzc2FnZXMmJiJzdHJpbmciIT10eXBlb2YgdC5ldmVudCkpKSkpfSxnPWZ1bmN0aW9uKGEpe2FHVE0uZC5kbHJlcGVhdERvbmU9ITA7Zm9yKHZhciBvPW4oKSxyPW8mJiJudW1iZXIiPT10eXBlb2Ygby5sZW5ndGg/by5sZW5ndGg6MCxpPSJvYmplY3QiPT10eXBlb2YgYUdUTS5kLmNvbnNlbnQmJmFHVE0uZC5jb25zZW50JiZhR1RNLmQuY29uc2VudC5ndG1Db25zZW50LGM9MCxmPWUubWF4RXZlbnRzfHwwLGQ9MCxNPTA7TTxyO00rKylpZihwKG9bTV0pKXtpZihmJiZjPj1mKWJyZWFrO2MrKzt2YXIgVD1KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihvW01dKSk7aWYoZS5jbGVhckVjb20mJmkmJnZvaWQgMCE9PVQuZWNvbW1lcmNlJiZhR1RNLmYuZmlyZSh7ZWNvbW1lcmNlOm51bGwsYUdUTXJlcGVhdGVkOiEwfSksZGVsZXRlIFQuYUdUTXRzLGRlbGV0ZSBULmFHVE1wYXJhbXMsZGVsZXRlIFQuZXZlbnRNb2RlbCxkZWxldGUgVFsiZ3RtLnVuaXF1ZUV2ZW50SWQiXSxULmFHVE1yZXBlYXRlZD0hMCxlLmFkZHBhcmFtZXRlciYmZS5hZGRwYXJhbWV0ZXIubGVuZ3RoKWZvcih2YXIgdT0wO3U8ZS5hZGRwYXJhbWV0ZXIubGVuZ3RoO3UrKyllLmFkZHBhcmFtZXRlclt1XSYmZS5hZGRwYXJhbWV0ZXJbdV0ucGtleSYmKFRbZS5hZGRwYXJhbWV0ZXJbdV0ucGtleV09ZS5hZGRwYXJhbWV0ZXJbdV0ucHZhbHVlKTthR1RNLmYuZmlyZShUKSxkKyt9dmFyIGc9YT8iIjpmdW5jdGlvbihlKXtmb3IodmFyIHQ9W10sbj0wO248cy5sZW5ndGg7bisrKXt2YXIgYT1zW25dO2lmKGEuY29uZCl7dmFyIG89RyhlLGEuY29uZCk7aWYoMD09PW8pY29udGludWU7aWYoLTE9PT1vKXt0LnB1c2goYS5jb25kLmV2KTtjb250aW51ZX19bChlLGEubmFtZSl8fHQucHVzaChhLm5hbWUpfXJldHVybiB0fShvKS5qb2luKCIsIik7IWEmJmUuZmFsbGJhY2tFdmVudCYmZD4wJiZhR1RNLmYuZmlyZSh7ZXZlbnQ6ImFHVE1fcmVwZWF0X2ZhbGxiYWNrIixhR1RNcmVwZWF0Q291bnQ6ZCxhR1RNcmVwZWF0U291cmNlOmUuc291cmNlLGFHVE1yZXBlYXRNaXNzaW5nOmcsYUdUTXJlcGVhdFdhaXRlZDp2fSksdCgicmVwbGF5ZWQgIitkKyIgZXZlbnQocyksIGVucmljaGVkPSIrKGE/InllcyI6Im5vKGZhbGxiYWNrKSIpKyhhPyIiOiIsIG1pc3Npbmc9IitnKSl9O2lmKHQoInN0YXJ0IixlKSwhYUdUTS5kLmRscmVwZWF0UG9sbGluZylpZih1KG4oKSkpZyghMCk7ZWxzZXthR1RNLmQuZGxyZXBlYXRQb2xsaW5nPSEwLGFHVE0uZC5kbHJlcGVhdEdhdGU9ZS5nYXRlRXZlbnRzfHwiIjt2YXIgbT0ibnVtYmVyIj09dHlwZW9mIGUucG9sbE1zJiZlLnBvbGxNcz49NTA/ZS5wb2xsTXM6MzAwLHY9Im51bWJlciI9PXR5cGVvZiBlLnRpbWVvdXRNcyYmZS50aW1lb3V0TXM+MD9lLnRpbWVvdXRNczowLF89dj4wP3Y6M2U0LGg9MCx5PXNldEludGVydmFsKGZ1bmN0aW9uKCl7aWYoYUdUTS5kLmRscmVwZWF0RG9uZSljbGVhckludGVydmFsKHkpO2Vsc2V7aWYodShuKCkpKXJldHVybiBjbGVhckludGVydmFsKHkpLHZvaWQgZyghMCk7KGgrPW0pPj1fJiYoY2xlYXJJbnRlcnZhbCh5KSx2PjA/ZyghMSk6KGFHVE0uZC5kbHJlcGVhdFBvbGxpbmc9ITEsdCgiZ2F0ZSBuZXZlciBzYXRpc2ZpZWQgd2l0aGluIGNhcCBhbmQgbm8gZmFsbGJhY2sgLSBub3RoaW5nIHJlcGVhdGVkOyBwb2xsaW5nIHJlbGVhc2VkIGZvciBhIGxhdGVyIGNhbGwiKSkpfX0sbSl9fX0sYUdUTS5mLmluaXQ9ZnVuY3Rpb24oKXthR1RNLmYuY29uZmlnKGFHVE0uYyksYUdUTS5kLmNvbmZpZyYmKGFHVE0uYy5pZnJhbWVTdXBwb3J0JiZhR1RNLmQuaXNfaWZyYW1lPyhhR1RNLmQuY29uc2VudC5ndG1Db25zZW50PSEwLGFHVE0uZC5jb25zZW50Lmhhc1Jlc3BvbnNlPSEwLGFHVE0uZC5jb25zZW50LmZlZWRiYWNrPSJQYWdlIGlzIGlGcmFtZSIsYUdUTS5kLmlmcmFtZS5pZkxpc3Rlbnx8KGFHVE0uZC5pZnJhbWUuaWZMaXN0ZW49ITAsd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoIm1lc3NhZ2UiLGFHVE0uZi5pZkhTbGlzdGVuKSksYUdUTS5kLmluaXR8fGFHVE0uZi5pbmplY3QoKSk6InN0cmluZyI9PXR5cGVvZiBhR1RNLmMuY21wJiZhR1RNLmMuY21wPyJub25lIj09YUdUTS5jLmNtcD8oYUdUTS5kLmNvbnNlbnQ9e2d0bUNvbnNlbnQ6ITAsaGFzUmVzcG9uc2U6ITAsZmVlZGJhY2s6Ik5vIENvbnNlbnQgQ2hlY2sgY29uZmlndXJlZCJ9LGFHVE0uZi5pbmplY3QoKSk6KGFHVE0uZi5sb2FkX2NjKGFHVE0uYy5jbXAsYUdUTS5mLmNvbnNlbnRfbGlzdGVuZXIpLGFHVE0uZi5pbml0R1RNKCEwKSk6KGFHVE0uZi5jb25zZW50X2xpc3RlbmVyKCksYUdUTS5mLmluaXRHVE0oITApKSxhR1RNLmMuanNFcnJvcnMmJmFHVE0uZi5qc2Vycm9ycygpKX0sYUdUTS5mLmVuYz1mdW5jdGlvbihlLHQpe3ZhciBuPXQlNjMrMSxhPWJ0b2EodW5lc2NhcGUoZW5jb2RlVVJJQ29tcG9uZW50KGUpKSksbz0wOyI9Ij09PWEuY2hhckF0KGEubGVuZ3RoLTEpJiZvKyssIj0iPT09YS5jaGFyQXQoYS5sZW5ndGgtMikmJm8rKyxhPWEuc2xpY2UoMCxhLmxlbmd0aC1vKTtmb3IodmFyIHI9MT09PW8/In4iOjI9PT1vPyJ+fiI6IiIscz0iIixpPTA7aTxhLmxlbmd0aDtpKyspe3ZhciBjPSJBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWmFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6MDEyMzQ1Njc4OSsvIi5pbmRleE9mKGEuY2hhckF0KGkpKTtzKz1jPDA/YS5jaGFyQXQoaSk6IkFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU2Nzg5LV8iLmNoYXJBdCgoYytuKSU2NCl9cmV0dXJuIG8/cy5zbGljZSgwLDMpK3Ircy5zbGljZSgzKTpzfSxhR1RNLmYueHNlbmQ9ZnVuY3Rpb24oZSx0LG4sYSxvKXtpZihlJiYic3RyaW5nIj09dHlwZW9mIGUmJiFhR1RNLmQub3B0b3V0KXRyeXt2YXIgcixzPW5ldyBYTUxIdHRwUmVxdWVzdDtyZXR1cm4gcy5vcGVuKCJQT1NUIixlLCEwKSwhMD09PW8/KHMud2l0aENyZWRlbnRpYWxzPSEwLHMuc2V0UmVxdWVzdEhlYWRlcigiQ29udGVudC1UeXBlIiwidGV4dC9wbGFpbjtjaGFyc2V0PVVURi04IikpOnMuc2V0UmVxdWVzdEhlYWRlcigiQ29udGVudC1UeXBlIiwiYXBwbGljYXRpb24vanNvbiIpLHI9biYmIm51bWJlciI9PXR5cGVvZiBhJiZhPj0xPyd7InEiOiInK2FHVE0uZi5lbmMoYUdUTS5mLnNTdHJmKHQpLGEpKycifSc6J3siZSI6JythR1RNLmYuc1N0cmYodCkrIn0iLHMuc2VuZChyKSxzfWNhdGNoKHQpe3JldHVybiBhR1RNLmYubG9nKCJlX3hzZW5kIix7bXNnOnQubWVzc2FnZSx1cmw6ZX0pLG51bGx9fSxhR1RNLmYuc3RhY2tTcmM9ZnVuY3Rpb24oZSl7dmFyIHQsbixhPVN0cmluZyhlfHwiIikubWF0Y2goLyhibG9iOik/aHR0cHM/OlwvXC9bXlxzKCknIl0rL2cpfHxbXSxvPSIiLHI9IiI7dHJ5e3I9U3RyaW5nKGxvY2F0aW9uLmhyZWYpLnNwbGl0KC9bPyNdLylbMF19Y2F0Y2goZSl7fWZvcih0PTA7dDxhLmxlbmd0aDt0KyspaWYobj1hW3RdLnJlcGxhY2UoLyg6XGQrKXsxLDJ9JC8sIiIpLnNwbGl0KC9bPyNdLylbMF0sdCl7aWYobiE9PW8pcmV0dXJuIG49PT1yPyJpbmxpbmUiOi9eYmxvYjovLnRlc3Qobik/ImJsb2IiOm4ucmVwbGFjZSgvXihodHRwcz86XC9cLylbXlwvXSpALywiJDEiKX1lbHNlIG89bjtyZXR1cm4iIn0sYUdUTS5mLmRsSG9va1RyYXA9ZnVuY3Rpb24oZSl7aWYoZSYmYUdUTS5kLmRsSG9va1RyYXAhPT1lKXRyeXt2YXIgdD1PYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKGUsInB1c2giKSxuPWUucHVzaDtpZih0JiYoIXQuY29uZmlndXJhYmxlfHwhKCJ2YWx1ZSJpbiB0KSkpcmV0dXJuO09iamVjdC5kZWZpbmVQcm9wZXJ0eShlLCJwdXNoIix7Y29uZmlndXJhYmxlOiEwLGVudW1lcmFibGU6ITAsZ2V0OmZ1bmN0aW9uKCl7cmV0dXJuIG59LHNldDpmdW5jdGlvbih0KXt0cnl7aWYoIWFHVE0uZC5vcmlnaW5hbERMcHVzaCYmL3NhbmRib3gvaS50ZXN0KFN0cmluZyhuKSkmJihhR1RNLmQub3JpZ2luYWxETHB1c2g9biksIWFHVE0uZC5vcmlnaW5hbERMcHVzaHx8L3NhbmRib3gvaS50ZXN0KFN0cmluZyh0KSkpcmV0dXJuIHZvaWQobj10KTthR1RNLmQuZGxIb29rU3JjfHwoYUdUTS5kLmRsSG9va1NyYz1hR1RNLmYuc3RhY2tTcmMoKG5ldyBFcnJvcikuc3RhY2spKSxPYmplY3QuZGVmaW5lUHJvcGVydHkoZSwicHVzaCIse3ZhbHVlOnQsd3JpdGFibGU6ITAsY29uZmlndXJhYmxlOiEwLGVudW1lcmFibGU6ITB9KX1jYXRjaChlKXtuPXR9fX0pLGFHVE0uZC5kbEhvb2tUcmFwPWV9Y2F0Y2goZSl7fX0sYUdUTS5mLnNlbmRuYXVzPWZ1bmN0aW9uKGUpe2lmKGUmJiJvYmplY3QiPT10eXBlb2YgZSl7YUdUTS5jLmRsT3JnUHVzaCYmYUdUTS5mLmRsSG9va1RyYXAod2luZG93W2FHVE0uYy5nZGxdKTt2YXIgdD13aW5kb3dbYUdUTS5jLmdkbF0ucHVzaDshYUdUTS5kLm9yaWdpbmFsRExwdXNoJiYvc2FuZGJveC9pLnRlc3QodC50b1N0cmluZygpKSYmKGFHVE0uZC5vcmlnaW5hbERMcHVzaD10KTt2YXIgbj0hMTtpZihhR1RNLmMuZGxPcmdQdXNoJiZhR1RNLmQub3JpZ2luYWxETHB1c2gmJmFHVE0uZC5vcmlnaW5hbERMcHVzaCE9PXQpe3ZhciBhPXQudG9TdHJpbmcoKTsvc2FuZGJveC9pLnRlc3QoYSk/YUdUTS5kLm9yaWdpbmFsRExwdXNoPXQ6KG49ITAsYUdUTS5kLmRsSG9va0xvZ2dlZHx8KGFHVE0uZC5vcmlnaW5hbERMcHVzaCh7ZXZlbnQ6ImV4Y2VwdGlvbiIsZXJydHlwZToiREwgRXJyb3IiLGVycm1zZzoiRnVuY3Rpb24gZGF0YUxheWVyLnB1c2ggaG9va2VkIC0gbm8gbG9uZ2VyIGZyb20gR1RNIixmY3RfaG9vazphLGZjdF9ob29rX3NyYzphR1RNLmQuZGxIb29rU3JjfHwiIixmY3Rfb3JpZzphR1RNLmQub3JpZ2luYWxETHB1c2gudG9TdHJpbmcoKSx0aW1lc3RhbXA6RGF0ZS5ub3coKSxldmVudE1vZGVsOm51bGx9KSxhR1RNLmQuZGxIb29rTG9nZ2VkPSEwKSwicmVzdG9yZSI9PT1hR1RNLmMuZGxPcmdQdXNoJiYod2luZG93W2FHVE0uYy5nZGxdLnB1c2g9YUdUTS5kLm9yaWdpbmFsRExwdXNoLG49ITEpKX1uJiYidXNlIj09PWFHVE0uYy5kbE9yZ1B1c2g/YUdUTS5kLm9yaWdpbmFsRExwdXNoKGUpOndpbmRvd1thR1RNLmMuZ2RsXS5wdXNoKGUpLCJmdW5jdGlvbiI9PXR5cGVvZiBhR1RNLmYuc2VuZG5hdXNfY2FsbGJhY2smJmFHVE0uZi5zZW5kbmF1c19jYWxsYmFjayhlKSxhR1RNLmYubG9nKCJtOSIsZSl9fSxhR1RNLmYuZmlyZT1mdW5jdGlvbihlKXtpZighYUdUTS5kLm9wdG91dClpZigib2JqZWN0Ij09dHlwZW9mIGUmJmUpe3RyeXtpZighKG49SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYoZSkpKSlyZXR1cm4gdm9pZCBhR1RNLmYubG9nKCJlMTUiLG4pfWNhdGNoKGEpe3ZhciB0PSJhR1RNIEZpcmUgRXJyb3IgKEpTT04ucGFyc2UpIjsic3RyaW5nIj09dHlwZW9mIGUuZXZlbnQmJih0PXQrIiAoRXZlbnQ6ICIrZS5ldmVudCsiKSIpO3ZhciBuPXtldmVudDoiZXhjZXB0aW9uIixlcnJtc2c6YS5tZXNzYWdlLGVycnR5cGU6dCx0aW1lc3RhbXA6RGF0ZS5ub3coKSxlcnJjdDphR1RNLmQuZXJyb3JfY291bnRlcnx8MSxldmVudE1vZGVsOm51bGx9O2FHVE0uZi5sb2coImUxNSIsbil9aWYoISgibnVtYmVyIj09dHlwZW9mIG4uYUdUTXRzfHwib2JqZWN0Ij09dHlwZW9mIG4uZXZlbnRNb2RlbCYmbi5ldmVudE1vZGVsfHwic3RyaW5nIiE9dHlwZW9mIG4uZXZlbnQmJiJzdHJpbmciPT10eXBlb2Ygbi50eXBlJiYib2JqZWN0Ij09dHlwZW9mIG4uZmxhZ3MmJiJib29sZWFuIj09dHlwZW9mIG4uZmxhZ3MuZW5hYmxlVW50YWdnZWRQYWdlUmVwb3J0aW5nJiZuLmZsYWdzLmVuYWJsZVVudGFnZ2VkUGFnZVJlcG9ydGluZykpe2lmKG4uYUdUTXRzPURhdGUubm93KCksbi5ldmVudE1vZGVsPW51bGwsYUdUTS5jLmNvbnNlbnRfZXZlbnRzJiYic3RyaW5nIj09dHlwZW9mIG4uZXZlbnQmJigiLCIrYUdUTS5jLmNvbnNlbnRfZXZlbnRzKyIsIikuaW5kZXhPZigiLCIrbi5ldmVudCsiLCIpPj0wKWlmKCJvYmplY3QiPT10eXBlb2YgYUdUTS5jLmNvbnNlbnRfZXZlbnRfYXR0cltuLmV2ZW50XSlmb3IodmFyIGEgaW4gYUdUTS5jLmNvbnNlbnRfZXZlbnRfYXR0cltuLmV2ZW50XSl2b2lkIDAhPT1uW2FdJiYoYUdUTS5jLmNvbnNlbnRfZXZlbnRfYXR0cltuLmV2ZW50XVthXSYmblthXSE9YUdUTS5jLmNvbnNlbnRfZXZlbnRfYXR0cltuLmV2ZW50XVthXXx8YUdUTS5mLnJ1bl9jYygidXBkYXRlIikpO2Vsc2UgYUdUTS5mLnJ1bl9jYygidXBkYXRlIik7aWYoYUdUTS5jLmRsU2V0JiYib2JqZWN0Ij09dHlwZW9mIGdvb2dsZV90YWdfbWFuYWdlciYmIm9iamVjdCI9PXR5cGVvZiBnb29nbGVfdGFnX21hbmFnZXJbYUdUTS5jLmd0bUlEXSYmT2JqZWN0LmtleXMoYUdUTS5jLmRsU2V0KS5mb3JFYWNoKGZ1bmN0aW9uKGUpe3ZhciB0PWFHVE0uYy5kbFNldFtlXSxhPWdvb2dsZV90YWdfbWFuYWdlclthR1RNLmMuZ3RtSURdW2FHVE0uYy5nZGxdLmdldCh0KTt2b2lkIDAhPT1hJiYobltlXT1hKX0pLCgib2JqZWN0IiE9dHlwZW9mIGFHVE0uZC5jb25zZW50fHwhYUdUTS5kLmNvbnNlbnQuaGFzUmVzcG9uc2V8fCFhR1RNLmQuY29uc2VudC5ndG1Db25zZW50KSYmKCJzdHJpbmciIT10eXBlb2Ygbi5ldmVudHx8MCE9PW4uZXZlbnQuaW5kZXhPZigiYUdUTSIpKSYmIW4uX25vQ29uc2VudHx8YUdUTS5jLmlmcmFtZVN1cHBvcnQmJmFHVE0uZC5pc19pZnJhbWUmJiFhR1RNLmQuaWZyYW1lLm9yaWdpbilyZXR1cm4gZGVsZXRlIG4uYUdUTXRzLGRlbGV0ZSBuLmV2ZW50TW9kZWwsdm9pZCBhR1RNLmQuZi5wdXNoKEpTT04ucGFyc2UoYUdUTS5mLnNTdHJmKG4pKSk7aWYobi5fcG9zdCYmIW4uX3Bvc3Rfc2VudCl7dmFyIG89Im9iamVjdCI9PXR5cGVvZiBuLl9wb3N0P24uX3Bvc3Q6e30scj0ic3RyaW5nIj09dHlwZW9mIG8udXJsJiZvLnVybD9vLnVybDphR1RNLmMudHJhbnNwb3J0X3VybDtpZihyKXt2YXIgcz0iYm9vbGVhbiI9PXR5cGVvZiBvLmVuYz9vLmVuYzohIWFHVE0uYy50cmFuc3BvcnRfZW5jLGk9Im51bWJlciI9PXR5cGVvZiBvLnNhbHQmJm8uc2FsdD49MT9vLnNhbHQ6Im51bWJlciI9PXR5cGVvZiBhR1RNLmMudHJhbnNwb3J0X3NhbHQmJmFHVE0uYy50cmFuc3BvcnRfc2FsdD49MT9hR1RNLmMudHJhbnNwb3J0X3NhbHQ6YUdUTS5jLnNlc3Npb25fc2FsdHx8MCxjPUpTT04ucGFyc2UoYUdUTS5mLnNTdHJmKG4pKTtkZWxldGUgYy5fcG9zdCxkZWxldGUgYy5fcG9zdF9zZW50LGRlbGV0ZSBjLmV2ZW50TW9kZWwsby5jb25zZW50JiYib2JqZWN0Ij09dHlwZW9mIGFHVE0uZC5jb25zZW50JiYoYy5jb25zZW50PUpTT04ucGFyc2UoYUdUTS5mLnNTdHJmKGFHVE0uZC5jb25zZW50KSkpLGFHVE0uZi54c2VuZChyLGMscyxpKSxuLl9wb3N0X3NlbnQ9ITB9fShhR1RNLmQuY29uc2VudC5ndG1Db25zZW50fHwic3RyaW5nIj09dHlwZW9mIG4uZXZlbnQmJjA9PT1uLmV2ZW50LmluZGV4T2YoImFHVE0iKXx8bi5fbm9Db25zZW50KSYmKCJzdHJpbmciPT10eXBlb2Ygbi5ldmVudCYmMD09PW4uZXZlbnQuaW5kZXhPZigiYUdUTSIpfHwoZGVsZXRlIG5bImd0bS51bmlxdWVFdmVudElkIl0sZGVsZXRlIG4uYUdUTXBhcmFtcyxuLmFHVE1wYXJhbXM9SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYobikpKSxhR1RNLmQuZGwucHVzaChuKSxuLl9ub0RMUHVzaD8iZnVuY3Rpb24iPT10eXBlb2YgYUdUTS5mLnNlbmRuYXVzX2NhbGxiYWNrJiZhR1RNLmYuc2VuZG5hdXNfY2FsbGJhY2sobik6YUdUTS5jLmlmcmFtZVN1cHBvcnQmJmFHVE0uZC5pc19pZnJhbWUmJiJzdHJpbmciPT10eXBlb2Ygbi5ldmVudD9hR1RNLmYuaUZyYW1lRmlyZShuKTphR1RNLmYuc2VuZG5hdXMobikpLCJmdW5jdGlvbiI9PXR5cGVvZiBhR1RNLmYuZmlyZV9jYWxsYmFjayYmYUdUTS5mLmZpcmVfY2FsbGJhY2sobiksYUdUTS5mLmxvZygibTciLG4pfX1lbHNlIGFHVE0uZi5sb2coImU5Iix7bzp0eXBlb2YgZX0pfTs=');
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

  if (foreignEmbed || optedOut) {
    // The objection covers an identity set before it, too (F-263, Andi
    // 2026-10-28): delete every user-id cookie the request carries,
    // independent of "Delete cookie on consent withdrawal" - that switch is
    // about a withdrawn consent, this is an objection to any measurement.
    // Only when one is there, so an opted-out visitor does not get a delete
    // header on every request.
    if (optedOut) {
      const uidOut = readUidCookie();
      if (uidOut.value || uidOut.stale.length > 0) {
        deleteUidCookies({domain: CFG.cookieDomain, path: '/', sameSite: 'none', httpOnly: true, secure: true, 'max-age': 0});
        if (CFG.debug) logToConsole('debug', '\u2713 User ID cookie deleted (opt-out)');
      }
    }
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
          // for one who agreed it would mask their grant (the library asks the
          // CMP first since F-249, but only for ~1.5 s). Then no preset; the CMP decides.
          // What stays open: the
          // consent is still PERSISTED under the shared fingerprint key when no
          // cookie exists, so the record can still be written by whoever gets
          // there first. Closing that is a separate step (F-156 option B).
          const uidIsBrowserBound = !!existingCookie;
          const storedDecision = !!(r.consent && typeof r.consent === 'object' && r.consent.hasResponse === true);
          // A preset is only acted on where the library can later replace it
          // with the CMP's own answer (F-251). storeLive: this Client actually
          // stores consent - with the store off, or with consent_store_enc (the
          // POST gets 501, nothing is written), a record on file is stale and no
          // consent poll runs to update it, so it would stand for the whole page.
          // presetLiftable additionally needs the poll: under useListener the
          // library runs no init poll, so it could not wait for the CMP's answer
          // before the auto-denial stands (library side: F-249, run_cc('init')).
          const storeLive = CFG.consentStoreEnabled && !data.consent_store_enc;
          const presetLiftable = storeLive && !data.useListener;
          if (storedDecision && uidIsBrowserBound && storeLive) {
            sd.consent = r.consent;
            if (CFG.debug) logToConsole('debug', '✓ Session API returned stored consent', sd.consent);
          } else if (storedDecision) {
            if (CFG.debug) logToConsole('debug', '↷ No consent preset: stored decision withheld (uid is a shared fingerprint, or the consent store is not live) — the CMP decides');
          } else if (sd.ret && presetLiftable) {
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

