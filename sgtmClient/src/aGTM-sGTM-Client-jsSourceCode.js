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
const logToConsole = require('logToConsole');
const makeInteger = require('makeInteger');
const makeNumber = require('makeNumber');
const makeString = require('makeString');
const generateRandom = require('generateRandom');
const getTimestampMillis = require('getTimestampMillis');
const Math = require('Math');

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
  cookieName: data.cookie_name || '_TPU',
  cookieLifetimeDays: makeNumber(data.cookie_lifetime || 365),
  cookieDomain: data.cookie_domain || 'auto',
  fingerprintAllowed: data.fingerprint_allowed !== false,
  sgtmHost: data.sgtm_host || '',
  debugSuffix: data.debug_suffix || '',
  fipLimiter: data.fip_limiter || '$',
  // Server-side auto-denial: when a returning visitor has no recorded consent,
  // the Client constructs a denial-consent block. autoDenyLoadGtm controls
  // whether GTM is allowed to load under that denial. Default true.
  autoDenyLoadGtm: data.auto_deny_load_gtm !== false,
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
const hasRequiredConsent = function(services, purposes, vendors) {
  if (!CFG.consentService && !CFG.consentPurpose && !CFG.consentVendor) return true;
  return inConsentStr(services, CFG.consentService) ||
         inConsentStr(purposes, CFG.consentPurpose) ||
         inConsentStr(vendors, CFG.consentVendor);
};

// ── F→C user-ID promotion helpers ────────────────────────────────────────────
// Declared up-front because the /aGTMconsent POST handler below references
// them, and GTM's sandboxed-JS parser rejects forward references to
// const-bound function expressions at parse time with "Illegal variable
// reference before declaration".

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
const fingerprintPrefix = 'F' + CFG.fipLimiter + '1' + CFG.fipLimiter;
const isFingerprintUid = function(uid) {
  return !!(uid && typeof uid === 'string' && uid.indexOf(fingerprintPrefix) === 0);
};

// F→C promote via api4sgtm /promote endpoint. Atomic Redis TxPipeline
// server-side: migrates the active session pointer from oldUid to newUid
// AND records the consent in one operation. Returns the new UID on success
// (via `then(newUid)`), `''` on failure (caller falls back to legacy F.*).
// Smoketest steps 19-20 verify the contract.
const tryPromote = function(oldUid, newUid, consent, then) {
  if (!CFG.sessionApiUrl || !CFG.tenantID || !oldUid || !newUid) {
    then('');
    return;
  }
  const promoteUrl = CFG.sessionApiUrl + '/' + CFG.tenantID + '/' + oldUid + '/promote';
  const promoteBody = JSON.stringify({new_user_id: newUid, consent: consent || {}});
  if (CFG.debug) logToConsole('debug', '→ Promote F→C', {url: promoteUrl, body: promoteBody});
  sendHttpRequest(promoteUrl, {method: 'POST', headers: {'Content-Type': 'application/json'}, timeout: 5000}, promoteBody).then(function(res) {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      if (CFG.debug) logToConsole('debug', '✓ Promote success', {old: oldUid, new: newUid, status: res.statusCode});
      then(newUid);
    } else {
      logToConsole('warn', '✗ Promote non-2xx — falling back to legacy F.* path', {status: res.statusCode, body: res.body});
      then('');
    }
  }, function(e) {
    logToConsole('error', '✗ Promote error — falling back to legacy F.* path', e);
    then('');
  });
};

const rpath = getRequestPath();
const rmethod = getRequestMethod();

// ── POST CONSENT_STORE_PATH handler ─────────────────────────────────────────
// Browser POSTs the latest consent state here. Two responsibilities:
//  1. Manage the user-ID cookie based on consent (cookieMode === 'consent').
//  2. Persist the consent block into the Session API record so that the next
//     library load returns it via cfg.session.consent (Phase 1 redesign).
if (CFG.consentStoreEnabled && rmethod === 'POST' && rpath.slice(-CONSENT_STORE_PATH.length) === CONSENT_STORE_PATH) {
  claimRequest();
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
    setResponseHeader('Content-Type', 'application/json');
    setResponseBody('{"ok":false,"err":"consent_store_enc not supported server-side"}');
    returnResponse();
    return;
  }

  const cpData = (cp && cp.e) ? cp.e : (cp || {});

  // Resolve uid: explicit in payload first, then fall back to cookie.
  let cpUid = cpData.uid || '';
  if (!cpUid && CFG.cookieName) {
    const fbVals = getCookieValues(CFG.cookieName, true);
    cpUid = (fbVals && fbVals.length > 0) ? fbVals[0] : '';
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
  // input when no consent_service is configured (line ~95, default-permissive
  // for tenants that don't use the consent gate) — and a corrupt or empty
  // POST payload would otherwise be considered "granted" and trigger promote.
  const hasExplicitSignal = !!(cpServices || cpPurposes || cpVendors);
  if (CFG.debug) logToConsole('debug', '✓ Consent POST parsed', {uid: cpUid, services: cpServices, purposes: cpPurposes, granted: granted, explicit: hasExplicitSignal});

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
        if (granted && finalUid) {
          const maxAge = CFG.cookieLifetimeDays > 0 ? Math.floor(CFG.cookieLifetimeDays * 86400) : 0;
          if (maxAge > 0) cookieOpts['max-age'] = maxAge;
          setCookie(CFG.cookieName, finalUid, cookieOpts, true);
          if (CFG.debug) logToConsole('debug', '✓ User ID cookie set (consent granted)', finalUid);
        } else if (!granted && data.cookie_delete) {
          cookieOpts['max-age'] = 0;
          setCookie(CFG.cookieName, '', cookieOpts, true);
          if (CFG.debug) logToConsole('debug', '✓ User ID cookie deleted (consent withdrawn)');
        }
      }
    }

    const finishConsentPost = function() {
      setResponseStatus(200);
      setResponseHeader('Content-Type', 'application/json');
      // Always echo finalUid so the browser can update aGTM.d.session.uid
      // after a successful F→C promote. When no promote happened the value
      // matches what the browser already holds — browser-side noop.
      setResponseBody(JSON.stringify({ok: true, uid: finalUid || cpUid}));
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
      sendHttpRequest(writeUrl, {method: 'POST', headers: {'Content-Type': 'application/json'}, timeout: 5000}, writeBody).then(function(res) {
        if (CFG.debug) logToConsole('debug', '✓ Consent persisted', {uid: finalUid, status: res.statusCode});
        finishConsentPost();
      }, function(e) {
        logToConsole('error', '✗ Consent persistence error', e);
        // Still return 200 — cookie management already done; persistence is server-side concern
        finishConsentPost();
      });
    } else {
      if (CFG.debug) logToConsole('debug', '✗ Consent persistence skipped (no Session API or no uid)');
      finishConsentPost();
    }
  };

  if (shouldPromote) {
    const newUid = generateCookieUid();
    if (CFG.debug) logToConsole('debug', '→ F→C promote applicable', {old: cpUid, new: newUid});
    tryPromote(cpUid, newUid, cpConsent, function(promotedUid) {
      if (promotedUid) {
        writeCookieAndPersist(promotedUid, true);
      } else {
        // Promote failed — fall back to legacy path under the original F.*
        writeCookieAndPersist(cpUid, false);
      }
    });
  } else {
    writeCookieAndPersist(cpUid, false);
  }
  return;
}

// ── GET /aGTM.js handler ─────────────────────────────────────────────────────
if (rpath.length < 8 || rpath.slice(rpath.length - 8) !== '/aGTM.js') return;

// Decode ?c= → {u: pageUrl, r: referrer}
const queryParameters = getRequestQueryParameters();
const id = queryParameters.id || null;
let pageUrl = '', pageRef = '';
if (queryParameters.c) {
  const dec = JSON.parse(fromBase64(queryParameters.c));
  if (dec && typeof dec.u === 'string') pageUrl = dec.u;
  if (dec && typeof dec.r === 'string') pageRef = dec.r;
}
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

// ── Helper: generate fingerprint (exact logic from serverside_fingerprint v1.1.tpl)
var getFingerprintString = function() {
  var requestHeaders = {
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
const getFingerprint = function() {
  return 'F' + CFG.fipLimiter + '1' + CFG.fipLimiter + CFG.tenantID + CFG.fipLimiter + getFingerprintString() + '.' + getFingerprintTimestamp();
};

// ── Helper: write cookie ──────────────────────────────────────────────────────
const writeCookie = function(val, maxAgeSec) {
  if (!CFG.cookieName) return;
  const opts = {domain: CFG.cookieDomain, path: '/', sameSite: 'none', httpOnly: true, secure: true};
  const maxAge = (typeof maxAgeSec === 'number') ? maxAgeSec : (CFG.cookieLifetimeDays > 0 ? Math.floor(CFG.cookieLifetimeDays * 86400) : 0);
  opts['max-age'] = maxAge;
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
const SOURCES_META = {ok: 1, tenant: 1, session_id: 1, ts: 1, skipped: 1, reason: 1, attribution: 1, uid: 1, sid: 1, consent: 1, ret: 1, vct: 1, sst: 1, ga4sid: 1, muidga4: 1};

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

const afterBotCheck = function(isBot) {
  if (isBot) {
    logToConsole('warn', '\u2717 Bot detected', userAgent);
    setResponseStatus(403);
    returnResponse();
    return;
  }

  // ── 2. User ID resolution ──────────────────────────────────────────────────
  // Phase 1 redesign collapses presession + session into a single Session API
  // call. The same uid is used throughout the lifecycle: existing cookie wins,
  // otherwise fingerprint. No more random uid generation — the session API
  // record key stays consistent across loads, so consent persisted under it on
  // one page is found on the next.
  const uidVals = getCookieValues(CFG.cookieName, true);
  const existingCookie = (uidVals && uidVals.length > 0) ? uidVals[0] : '';
  const fpUid = CFG.fingerprintAllowed ? getFingerprint() + (CFG.debugSuffix ? '_' + CFG.debugSuffix : '') : '';
  const sessionUid = existingCookie || fpUid;
  if (CFG.debug) logToConsole('debug', 'User ID for session', sessionUid);


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

    const continueAfterSession = function() {
      let cookieAllowed = (CFG.cookieMode === 'always') ||
                         (CFG.cookieMode === 'consent' && !!existingCookie);
      if (CFG.cookieMode === 'consent' && !cookieAllowed && sessionData.consent) {
        const c = sessionData.consent;
        if (hasRequiredConsent(c.services || '', c.purposes || '', c.vendors || '')) {
          cookieAllowed = true;
        }
      }

      // Delete cookie if consent required but not granted
      if (!cookieAllowed && data.cookie_delete && existingCookie && CFG.cookieMode === 'consent') {
        writeCookie('', 0);
      }
      // Write/refresh cookie if allowed. For returning visitors with stored
      // granted consent this restores parity (otherwise the cookie max-age
      // expires until the user re-interacts with the CMP). When a lazy
      // promote happened above, sessionData.uid is now the new C.* — this
      // is what gets written, replacing the F.* in the browser.
      if (cookieAllowed && sessionData.uid) {
        writeCookie(sessionData.uid);
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
      tryPromote(existingCookie, newUid, sessionConsent, function(promotedUid) {
        if (promotedUid) {
          sessionData.uid = promotedUid;
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
      if (res.statusCode === 200 && res.body) {
        const r = JSON.parse(res.body);
        if (r && r.sessionId) {
          sd.sid = r.sessionId;
          sd.vct = r.counter || 0;
          sd.ret = sd.vct > 0;
          if (r.ga4sid) sd.ga4sid = r.ga4sid;
          if (r.muidga4) sd.muidga4 = r.muidga4;
          // Pass through stored consent if present and valid
          if (r.consent && typeof r.consent === 'object' && r.consent.hasResponse === true) {
            sd.consent = r.consent;
            if (CFG.debug) logToConsole('debug', '✓ Session API returned stored consent', sd.consent);
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
      afterSession({uid: sessionUid, sid: '', ret: false, sst: true, vct: 0});
    });
  } else {
    afterSession({uid: sessionUid, sid: '', ret: false, sst: true, vct: 0});
  }
};

if (botCheckEnabled && botCheckUrl) {
  if (!clientIP) {
    logToConsole('error', '\u2717 Bot check enabled but no client IP');
    setResponseStatus(403);
    setResponseBody(fromBase64('Y29uc29sZS5lcnJvcignYUdUTSBFcnJvcjogSW52YWxpZCBvciBibG9ja2VkIElQIGFkZHJlc3MnKTs='));
    returnResponse();
  } else {
    const plObj = {UserAgent: userAgent, ClientIP: clientIP};
    sendHttpGet(botCheckUrl + '/' + toBase64(JSON.stringify(plObj)), {timeout: 5000}).then(function(r) {
      let bot = false;
      if (r.statusCode >= 200 && r.statusCode < 300 && r.body) { const o = JSON.parse(r.body); if (o && o.isBot) bot = true; }
      afterBotCheck(bot);
    }, function(e) { logToConsole('error', '\u2717 Bot check error', e); afterBotCheck(false); });
  }
} else {
  afterBotCheck(false);
}

// ── Build and send response ───────────────────────────────────────────────────
const buildAndSend = function(sessionData) {
  // CMP
  let cmp = data.cmp || '';
  if (!cmp && data.cmp_custom_active) cmp = data.cmp_custom_code || '';

  // Config
  const c = {};
  if (data.gtm) {
    const qp_id = typeof id === 'string' ? id : '';
    const gtm = {};
    for (const v of data.gtm) {
      if (v.gtm_id && v.gtm_id === qp_id) {
        gtm[v.gtm_id] = {};
        if (!v.gtm_consent) gtm[v.gtm_id].noConsent = true;
        if (v.gtm_env) gtm[v.gtm_id].env = v.gtm_env;
        if (v.gtm_url) gtm[v.gtm_id].gtmURL = v.gtm_url;
      }
    }
    c.gtm = gtm;
  }
  if (data.consent) { for (const v of data.consent) { c[v.consent_type] = v.consent_value; } }
  if (data.ck_consent) { for (const v of data.ck_consent) { c[v.ck_consent_type] = v.ck_consent_value; } }
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
  const storeUrlBuilder = CFG.consentStoreEnabled ? '(function(c){var s=document.currentScript;if(s&&s.src){var i=s.src.lastIndexOf("/aGTM.js");if(i>=0)c.consent_store_url=s.src.substring(0,i)+"' + CONSENT_STORE_PATH + '";}return c;})' : '(function(c){return c;})';
  const config = 'aGTM.f.config(' + storeUrlBuilder + '(' + JSON.stringify(c) + '));';
  logToConsole('info', '\u2713 aGTM Config built', {uid: sessionData && sessionData.uid, sid: sessionData && sessionData.sid, ret: sessionData && sessionData.ret});

  // aGTM base64 payload (updated by build.sh)
  const agtm = fromBase64('d2luZG93LmFHVE09d2luZG93LmFHVE18fHt9LHdpbmRvdy5hR1RNLmM9d2luZG93LmFHVE0uY3x8e30sd2luZG93LmFHVE0uZD13aW5kb3cuYUdUTS5kfHx7fSx3aW5kb3cuYUdUTS5mPXdpbmRvdy5hR1RNLmZ8fHt9LHdpbmRvdy5hR1RNLmw9d2luZG93LmFHVE0ubHx8W10sd2luZG93LmFHVE0ubj13aW5kb3cuYUdUTS5ufHx7fSxhR1RNLmYucHJvcHNldD1mdW5jdGlvbihlLHQsYSl7dHJ5e2VbdF09ZVt0XXx8YX1jYXRjaChlKXt9fSxhR1RNLmYub2JqaW5pdD1mdW5jdGlvbigpe1tbYUdUTS5kLCJ2ZXJzaW9uIiwiMS41Il0sW2FHVE0uZCwiZiIsW11dLFthR1RNLmQsImNvbmZpZyIsITFdLFthR1RNLmQsImluaXQiLCExXSxbYUdUTS5kLCJkb21fcmVhZHkiLCExXSxbYUdUTS5kLCJwYWdlX3JlYWR5IiwhMV0sW2FHVE0uZCwiaXNfaWZyYW1lIix3aW5kb3cuc2VsZiE9PXdpbmRvdy50b3BdLFthR1RNLmQsImV2X2ZjdF9jdHIiLDBdLFthR1RNLmQsInRpbWVyIix7fV0sW2FHVE0uZCwiZXJyb3JfY291bnRlciIsMF0sW2FHVE0uZCwiZXJyb3JzIixbXV0sW2FHVE0uZCwiZGwiLFtdXSxbYUdUTS5kLCJzZXNzaW9uIix7fV0sW2FHVE0uZCwic2Vzc2lvbl9zdGF0dXMiLCIiXSxbYUdUTS5kLCJjb25zZW50X2hhc2giLCIiXSxbYUdUTS5kLCJsYXN0X2NvbnNlbnRfaGFzaCIsIiJdLFthR1RNLmQsImF0dHJpYnV0aW9uIix7fV0sW2FHVE0uZCwiaWZyYW1lIix7Y291bnRlcjp7ZXZlbnRzOjB9LG9yaWdpbjoiIixpZkxpc3RlbjohMSx0b3BMaXN0ZW46ITEsaGFuZHNoYWtlOiExLHRpbWVyOm51bGx9XSxbYUdUTS5kLCJsYXN0X3VybCIsbG9jYXRpb24uaHJlZl0sW2FHVE0uZCwidXJsTGlzdGVuZXJfYWN0aXZlIiwhMV0sW2FHVE0uZCwicGFzc2l2ZV9zdXBwb3J0ZWQiLG51bGxdLFthR1RNLmYsInRsIix7fV0sW2FHVE0uZiwiZGwiLHt9XSxbYUdUTS5mLCJwbCIse31dLFthR1RNLCJsIixbXV0sW2FHVE0ubiwiY2siLCJjb29raWUiXSxbYUdUTS5uLCJ0bSIsImdvb2dsZXRhZ21hbmFnZXIiXSxbYUdUTS5uLCJ0YSIsInRhZ2Fzc2lzdGFudC5nb29nbGUiXV0uZm9yRWFjaChmdW5jdGlvbihlKXthR1RNLmYucHJvcHNldChlWzBdLGVbMV0sZVsyXSl9KX0sYUdUTS5mLm9iamluaXQoKSxhR1RNLmYubG9nPWZ1bmN0aW9uKGUsdCl7dmFyIGE9Im9iamVjdCI9PXR5cGVvZiB0JiZ0P0pTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkodCkpOnQ7YUdUTS5sLnB1c2goe2lkOmUsdGltZXN0YW1wOihuZXcgRGF0ZSkuZ2V0VGltZSgpLG9iajphfSl9LGFHVE0uZi5zdHJjbGVhbj1mdW5jdGlvbihlKXtyZXR1cm4gdm9pZCAwPT09ZXx8Im9iamVjdCI9PXR5cGVvZiBlJiYhZT8iIjooInN0cmluZyIhPXR5cGVvZiBlJiYoZT1lLnRvU3RyaW5nKCkpLGUucmVwbGFjZSgvW15hLXrDpMO2w7zDn0EtWsOEw5bDnDAtOV8tXS9nLCIiKSl9LGFHVE0uZi5zU3RyZj1mdW5jdGlvbihlKXtpZigib2JqZWN0IiE9dHlwZW9mIGV8fCFlKXt2YXIgdD1KU09OLnN0cmluZ2lmeSh7ZXZlbnQ6ImV4Y2VwdGlvbiIsZXJybXNnOiJEYXRhTGF5ZXIgRW50cnkgaXMgbm8gb2JqZWN0IixlcnJ0eXBlOiJETCBFcnJvciIsb2JqX3R5cGU6dHlwZW9mIGUsb2JqX3ZhbHVlOmV9KTtyZXR1cm4gYUdUTS5mLmxvZygiZTE2IixKU09OLnBhcnNlKHQpKSxKU09OLnN0cmluZ2lmeShudWxsKX12YXIgYT1bXTtyZXR1cm4gSlNPTi5zdHJpbmdpZnkoZSxmdW5jdGlvbihlLHQpe2lmKCJvYmplY3QiPT10eXBlb2YgdCYmbnVsbCE9PXQpe2lmKC0xIT09YS5pbmRleE9mKHQpKXJldHVybiJbQ2lyY3VsYXJdIjthLnB1c2godCl9cmV0dXJuIHR9KX0sYUdUTS5mLmFuPWZ1bmN0aW9uKGUsdCxhLG4pe2VbdF09YS5oYXNPd25Qcm9wZXJ0eSh0KT9hW3RdOm59LGFHVE0uZi5jb25zZW50X3NlcmlhbGl6ZT1mdW5jdGlvbihlKXtpZighZXx8Im9iamVjdCIhPXR5cGVvZiBlKXJldHVybiIiO3ZhciB0PXtndG1Db25zZW50OjEsYmxvY2tlZDoxfSxhPVtdO2Zvcih2YXIgbiBpbiBlKWUuaGFzT3duUHJvcGVydHkobikmJiF0W25dJiZhLnB1c2gobik7YS5zb3J0KCk7Zm9yKHZhciBvPVtdLHI9MDtyPGEubGVuZ3RoO3IrKyl7dmFyIHM9YVtyXSxpPWVbc107IiIhPT1pJiZudWxsIT1pJiZvLnB1c2gocysiPSIrKCJvYmplY3QiPT10eXBlb2YgaT9KU09OLnN0cmluZ2lmeShpKTpTdHJpbmcoaSkpKX1yZXR1cm4gby5qb2luKCJ8Iil9LGFHVE0uZi5wYXJzZVVybFBhcmFtcz1mdW5jdGlvbihlKXt2YXIgdD17fTtpZighZXx8Ij8iIT09ZS5jaGFyQXQoMCkpcmV0dXJuIHQ7Zm9yKHZhciBhPWUuc3Vic3RyaW5nKDEpLnNwbGl0KCImIiksbj0wO248YS5sZW5ndGg7bisrKXt2YXIgbz1hW25dLnNwbGl0KCI9Iik7aWYob1swXSl7dmFyIHIsczt0cnl7cj1kZWNvZGVVUklDb21wb25lbnQob1swXSl9Y2F0Y2goZSl7cj1vWzBdfWlmKG9bMV0pe3ZhciBpPW9bMV0ucmVwbGFjZSgvXCsvZywiICIpO3RyeXtzPWRlY29kZVVSSUNvbXBvbmVudChpKX1jYXRjaChlKXtzPWl9fWVsc2Ugcz0iIjt0W3JdPXN9fXJldHVybiB0fSxhR1RNLmYucmVzb2x2ZUF0dHJpYnV0aW9uPWZ1bmN0aW9uKGUpe3ZhciB0PWFHVE0uZi5wYXJzZVVybFBhcmFtcyh3aW5kb3cubG9jYXRpb24uc2VhcmNoKSxhPShhR1RNLmQuc2Vzc2lvbiYmYUdUTS5kLnNlc3Npb24uYXR0cmlidXRpb258fHt9KVtlXTthJiYib2JqZWN0Ij09dHlwZW9mIGF8fChhPXt9KTtmb3IodmFyIG49WyJnY2xpZCIsImZiY2xpZCIsIm1zY2xraWQiLCJ0dGNsaWQiLCJnYnJhaWQiLCJ3YnJhaWQiXSxvPSIiLHI9IiIscz0wO3M8bi5sZW5ndGg7cysrKXt2YXIgaT1uW3NdO2lmKHRbaV0pe289aSxyPXRbaV07YnJlYWt9fXJldHVybntzb3U6dC51dG1fc291cmNlfHxhLnNvdXx8IiIsY2FtOnQudXRtX2NhbXBhaWdufHxhLmNhbXx8IiIsbWVkOnQudXRtX21lZGl1bXx8YS5tZWR8fCIiLGNhbWlkOnQudXRtX2lkfHxhLmNhbWlkfHwiIixjbGk6cnx8YS5jbGl8fCIiLGNscDpvfHxhLmNscHx8IiIsY2xzOm8mJntnY2xpZDoiR29vZ2xlIEFkcyIsZmJjbGlkOiJNZXRhIixtc2Nsa2lkOiJNaWNyb3NvZnQgQWRzIix0dGNsaWQ6IlRpa1RvayBBZHMiLGdicmFpZDoiR29vZ2xlIEFkcyIsd2JyYWlkOiJHb29nbGUgQWRzIn1bb118fGEuY2xzfHwiIixhZnM6YS5hZnN8fCIiLHNyZTpkb2N1bWVudC5yZWZlcnJlcnx8YS5zcmV8fCIiLGxjczphLmxjc3x8IiIsZnNzOmEuZnNzfHwiIn19LGFHVE0uZi5jb25maWc9ZnVuY3Rpb24oZSl7aWYoYUdUTS5kLmNvbmZpZykiZnVuY3Rpb24iPT10eXBlb2YgYUdUTS5mLmxvZyYmYUdUTS5mLmxvZygiZTEiLGFHVE0uYyk7ZWxzZXtpZihhR1RNLmYuYW4oYUdUTS5jLCJkZWJ1ZyIsZSwhMSksYUdUTS5mLmFuKGFHVE0uYywicGF0aCIsZSwiIiksYUdUTS5mLmFuKGFHVE0uYywiZmlsZSIsZSwiYUdUTS5qcyIpLGFHVE0uZi5hbihhR1RNLmMsImNtcCIsZSwiIiksYUdUTS5jLm1pbj0iYm9vbGVhbiIhPXR5cGVvZiBlLm1pbnx8ZS5taW4sYUdUTS5mLmFuKGFHVE0uYywibm9uY2UiLGUsIiIpLGFHVE0uZi5hbihhR1RNLmMsImlmcmFtZVN1cHBvcnQiLGUsITEpLGFHVE0uZi5hbihhR1RNLmMsInZQYWdldmlld3MiLGUsITEpLGFHVE0uZi5hbihhR1RNLmMsInZQYWdldmlld3NUaW1lciIsZSwwKSxhR1RNLmYuYW4oYUdUTS5jLCJ2UGFnZXZpZXdzRmFsbGJhY2siLGUsITEpLGFHVE0uZi5hbihhR1RNLmMsImd0bUlEIixlLCIiKSxlLmd0bSlmb3IodmFyIHQgaW4gZS5ndG0pZS5ndG0uaGFzT3duUHJvcGVydHkodCkmJihhR1RNLmMuZ3RtSUQ9YUdUTS5jLmd0bUlEfHx0LGFHVE0uYy5ndG09YUdUTS5jLmd0bXx8e30sYUdUTS5jLmd0bVt0XT1lLmd0bVt0XXx8e30sYUdUTS5mLmFuKGFHVE0uYy5ndG1bdF0sIm5vQ29uc2VudCIsZS5ndG1bdF0sITEpLGFHVE0uZi5hbihhR1RNLmMuZ3RtW3RdLCJlbnYiLGUuZ3RtW3RdLCIiKSxhR1RNLmYuYW4oYUdUTS5jLmd0bVt0XSwiaWRQYXJhbSIsZS5ndG1bdF0sIiIpLGFHVE0uZi5hbihhR1RNLmMuZ3RtW3RdLCJndG1VUkwiLGUuZ3RtW3RdLCIiKSxhR1RNLmYuYW4oYUdUTS5jLmd0bVt0XSwiZ3RtSlMiLGUuZ3RtW3RdLCIiKSk7aWYoYUdUTS5mLmFuKGFHVE0uYywiZ2RsIixlLCJkYXRhTGF5ZXIiKSxhR1RNLmYuYW4oYUdUTS5jLCJndG1QdXJwb3NlcyIsZSwiIiksYUdUTS5mLmFuKGFHVE0uYywiZ3RtU2VydmljZXMiLGUsIiIpLGFHVE0uZi5hbihhR1RNLmMsImd0bVZlbmRvcnMiLGUsIiIpLGFHVE0uZi5hbihhR1RNLmMsImd0bUF0dHIiLGUsbnVsbCksYUdUTS5mLmFuKGFHVE0uYywiZGxTZXQiLGUse30pLGFHVE0uZi5hbihhR1RNLmMsInVzZUxpc3RlbmVyIixlLCExKSxhR1RNLmYuYW4oYUdUTS5jLCJkbE9yZ1B1c2giLGUsIiIpLGFHVE0uYy5kbFN0YXRlRXZlbnRzPSJib29sZWFuIj09dHlwZW9mIGUuZGxTdGF0ZUV2ZW50cyYmZS5kbFN0YXRlRXZlbnRzLGFHVE0uYy5hUGFnZXZpZXc9ImJvb2xlYW4iPT10eXBlb2YgZS5hUGFnZXZpZXcmJmUuYVBhZ2V2aWV3LGFHVE0uYy52UGFnZXZpZXc9ImJvb2xlYW4iPT10eXBlb2YgZS52UGFnZXZpZXcmJmUudlBhZ2V2aWV3LGFHVE0uYy5zZW5kQ29uc2VudEV2ZW50PSJib29sZWFuIj09dHlwZW9mIGUuc2VuZENvbnNlbnRFdmVudCYmZS5zZW5kQ29uc2VudEV2ZW50LGFHVE0uZi5hbihhR1RNLmMsImNvbnNlbnRfZXZlbnRzIixlLCIiKSxhR1RNLmMuY29uc2VudF9ldmVudF9hdHRyPWFHVE0uYy5jb25zZW50X2V2ZW50X2F0dHJ8fHt9LCJzdHJpbmciPT10eXBlb2YgYUdUTS5jLmNvbnNlbnRfZXZlbnRzJiZhR1RNLmMuY29uc2VudF9ldmVudHMpe2Zvcih2YXIgYT1hR1RNLmMuY29uc2VudF9ldmVudHMuc3BsaXQoIiwiKSxuPVtdLG89MDtvPGEubGVuZ3RoO28rKyl7dmFyIHI9YVtvXS5yZXBsYWNlKC9eXHMrfFxzKyQvZywiIik7aWYocil7dmFyIHM9ci5pbmRleE9mKCJbIik7aWYocz49MCl7dmFyIGk9ci5zdWJzdHJpbmcoMCxzKSxjPXIuc3Vic3RyaW5nKHMrMSxyLmluZGV4T2YoIl0iKSksZj1jLmluZGV4T2YoIjoiKSxUPXt9O2Y+PTA/VFtjLnN1YnN0cmluZygwLGYpXT1jLnN1YnN0cmluZyhmKzEpOlRbY109IiIsYUdUTS5jLmNvbnNlbnRfZXZlbnRfYXR0cltpXT1ULG4ucHVzaChpKX1lbHNlIG4ucHVzaChyKX19YUdUTS5jLmNvbnNlbnRfZXZlbnRzPW4uam9pbigiLCIpfWlmKGFHVE0uZi5hbihhR1RNLmMsInRyYW5zcG9ydF91cmwiLGUsIiIpLGFHVE0uZi5hbihhR1RNLmMsInRyYW5zcG9ydF9lbmMiLGUsITEpLGFHVE0uZi5hbihhR1RNLmMsInRyYW5zcG9ydF9zYWx0IixlLDApLGFHVE0uZi5hbihhR1RNLmMsInVzZXJfaWQiLGUsIiIpLGFHVE0uZi5hbihhR1RNLmMsInNlc3Npb25fc2FsdCIsZSwwKSxhR1RNLmYuYW4oYUdUTS5jLCJjb25zZW50X3N0b3JlX3VybCIsZSwiIiksYUdUTS5mLmFuKGFHVE0uYywiY29uc2VudF9zdG9yZV9lbmMiLGUsITEpLGFHVE0uZi5hbihhR1RNLmMsImNvbnNlbnRfcG9sbF9tcyIsZSwyZTMpLGUuc2Vzc2lvbiYmIm9iamVjdCI9PXR5cGVvZiBlLnNlc3Npb24mJihlLnNlc3Npb24uc2lkfHxlLnNlc3Npb24uY29uc2VudHx8ZS5zZXNzaW9uLmF0dHJpYnV0aW9ufHxlLnNlc3Npb24uc291cmNlKSl7YUdUTS5kLnNlc3Npb249SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYoZS5zZXNzaW9uKSk7dmFyIE09ZS5zZXNzaW9uLmNvbnNlbnQ7TSYmIm9iamVjdCI9PXR5cGVvZiBNJiYhMD09PU0uaGFzUmVzcG9uc2UmJiJzdHJpbmciPT10eXBlb2YgTS5zZXJ2aWNlcz8oYUdUTS5kLmNvbnNlbnQ9SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYoTSkpLGFHVE0uZC5jb25zZW50X2hhc2g9YUdUTS5mLmNvbnNlbnRfc2VyaWFsaXplKGFHVE0uZC5jb25zZW50KSxhR1RNLmQubGFzdF9jb25zZW50X2hhc2g9YUdUTS5kLmNvbnNlbnRfaGFzaCxhR1RNLmQuc2Vzc2lvbl9zdGF0dXM9InByZXNldF93aXRoX2NvbnNlbnQiLGFHVE0uZi5sb2coIm1fc2Vzc2lvbl9wcmVzZXRfY29uc2VudCIsTSkpOihhR1RNLmQuc2Vzc2lvbl9zdGF0dXM9InByZXNldCIsYUdUTS5mLmxvZygibV9zZXNzaW9uX3ByZXNldCIsZS5zZXNzaW9uKSl9aWYoZS5jb25zZW50PWUuY29uc2VudHx8e30sYUdUTS5jLmNvbnNlbnQ9YUdUTS5jLmNvbnNlbnR8fGUuY29uc2VudCxhR1RNLmYuYW4oYUdUTS5jLmNvbnNlbnQsImhhc1Jlc3BvbnNlIixlLmNvbnNlbnQsITEpLGFHVE0uZi5hbihhR1RNLmMuY29uc2VudCwiZmVlZGJhY2siLGUuY29uc2VudCwiIiksYUdUTS5mLmFuKGFHVE0uYy5jb25zZW50LCJwdXJwb3NlcyIsZS5jb25zZW50LCIiKSxhR1RNLmYuYW4oYUdUTS5jLmNvbnNlbnQsInNlcnZpY2VzIixlLmNvbnNlbnQsIiIpLGFHVE0uZi5hbihhR1RNLmMuY29uc2VudCwidmVuZG9ycyIsZS5jb25zZW50LCIiKSxhR1RNLmYuYW4oYUdUTS5jLmNvbnNlbnQsImNvbnNlbnRfaWQiLGUuY29uc2VudCwiIiksd2luZG93W2FHVE0uYy5nZGxdPXdpbmRvd1thR1RNLmMuZ2RsXXx8W10sYUdUTS5kLmNvbnNlbnQ9YUdUTS5kLmNvbnNlbnR8fEpTT04ucGFyc2UoYUdUTS5mLnNTdHJmKGFHVE0uYy5jb25zZW50KSksImJvb2xlYW4iIT10eXBlb2YgYUdUTS5kLmNvbnNlbnQuZ3RtQ29uc2VudCYmKGFHVE0uZC5jb25zZW50Lmd0bUNvbnNlbnQ9ITEpLGFHVE0uZC5jb25maWc9ITAsYUdUTS5kLmd0bUxvYWRlZD1bXSxhR1RNLmQuc2Vzc2lvbiYmYUdUTS5kLnNlc3Npb24uYXR0cmlidXRpb24mJiJvYmplY3QiPT10eXBlb2YgYUdUTS5kLnNlc3Npb24uYXR0cmlidXRpb24pZm9yKHZhciBkIGluIGFHVE0uZC5zZXNzaW9uLmF0dHJpYnV0aW9uKWFHVE0uZC5zZXNzaW9uLmF0dHJpYnV0aW9uLmhhc093blByb3BlcnR5KGQpJiYoYUdUTS5kLmF0dHJpYnV0aW9uW2RdPWFHVE0uZi5yZXNvbHZlQXR0cmlidXRpb24oZCkpOyJmdW5jdGlvbiI9PXR5cGVvZiBhR1RNLmYubG9nJiZhR1RNLmYubG9nKCJtMSIsYUdUTS5jKSwhMD09PWFHVE0uZC5jb25zZW50Lmhhc1Jlc3BvbnNlJiYiZnVuY3Rpb24iPT10eXBlb2YgYUdUTS5mLmNhbGxfY2MmJmFHVE0uZi5jYWxsX2NjKCl9fSxhR1RNLmYubG9hZF9jYz1mdW5jdGlvbihlLHQpe3ZhciBhPWRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoInNjcmlwdCIpLG49YUdUTS5jLnBhdGh8fCIiO24ubGVuZ3RoPjAmJiIvIiE9PW4uY2hhckF0KG4ubGVuZ3RoLTEpJiYobis9Ii8iKTt2YXIgbz0iY21wL2NjXyIrYUdUTS5mLnN0cmNsZWFuKGUpKyhhR1RNLmMubWluPyIubWluIjoiIikrIi5qcyI7YS5zcmM9bitvLGFHVE0uYy5ub25jZSYmKGEubm9uY2U9YUdUTS5jLm5vbmNlKSxhLm9ucmVhZHlzdGF0ZWNoYW5nZT1hLm9ubG9hZD1mdW5jdGlvbigpe2EucmVhZHlTdGF0ZSYmIS9sb2FkZWR8Y29tcGxldGUvLnRlc3QoYS5yZWFkeVN0YXRlKXx8ImZ1bmN0aW9uIj09dHlwZW9mIHQmJnQoKX0sYS5hc3luYz0hMCxkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKGEpfSxhR1RNLmYuY2hlbHA9ZnVuY3Rpb24oZSx0KXt2YXIgYT0hMDtyZXR1cm4gZSYmdCYmZS5zcGxpdCgiLCIpLmZvckVhY2goZnVuY3Rpb24oZSl7dC5pbmRleE9mKCIsIitlLnRyaW0oKSsiLCIpPDAmJihhPSExKX0pLGF9LGFHVE0uZi5ldmFsQ29ucz1mdW5jdGlvbihlLHQpe3ZhciBpc0NvbnNlbnRHaXZlbj1mdW5jdGlvbihlLHQpe3JldHVybiBlLmV2ZXJ5KGZ1bmN0aW9uKGUpe3JldHVybiB0LmluZGV4T2YoIiwiK2UrIiwiKT49MH0pfSxhPSFlLnB1cnBvc2VzLmxlbmd0aHx8aXNDb25zZW50R2l2ZW4oZS5wdXJwb3Nlcyx0LnB1cnBvc2VzKSxuPSFlLnNlcnZpY2VzLmxlbmd0aHx8aXNDb25zZW50R2l2ZW4oZS5zZXJ2aWNlcyx0LnNlcnZpY2VzKSxvPSFlLnZlbmRvcnMubGVuZ3RofHxpc0NvbnNlbnRHaXZlbihlLnZlbmRvcnMsdC52ZW5kb3JzKTtyZXR1cm4gYSYmbiYmb30sYUdUTS5mLnJ1bl9jYz1mdW5jdGlvbihlKXtpZighYUdUTS5kLmNvbmZpZylyZXR1cm4gYUdUTS5mLmxvZygiZTQiLG51bGwpLCExO2lmKCJzdHJpbmciIT10eXBlb2YgZXx8ImluaXQiIT09ZSYmInVwZGF0ZSIhPT1lKXJldHVybiBhR1RNLmYubG9nKCJlNSIse2FjdGlvbjplfSksITE7aWYoImZ1bmN0aW9uIiE9dHlwZW9mIGFHVE0uZi5jb25zZW50X2NoZWNrKXJldHVybiBhR1RNLmYubG9nKCJlMTQiLHthY3Rpb246ZX0pLCExO3ZhciB0PW51bGw7aWYoInVwZGF0ZSI9PT1lJiZhR1RNLmQuY29uc2VudCl7dD1KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihhR1RNLmQuY29uc2VudCkpO3ZhciBhPWFHVE0uZC5jb25zZW50O2EuaGFzUmVzcG9uc2U9ITEsYS5zZXJ2aWNlcz0iIixhLnB1cnBvc2VzPSIiLGEudmVuZG9ycz0iIixhLmNvbnNlbnRfaWQ9IiIsYS5zZXJ2aWNlSURzPSIiLGEuZmVlZGJhY2s9IiIsZGVsZXRlIGEuYmxvY2tlZH1pZighYUdUTS5mLmNvbnNlbnRfY2hlY2soZSkpcmV0dXJuIHQmJihhR1RNLmQuY29uc2VudD10KSxhR1RNLmYubG9nKCJtOCIsbnVsbCksITE7d2luZG93W2FHVE0uYy5nZGxdPXdpbmRvd1thR1RNLmMuZ2RsXXx8W10sYUdUTS5mLmNoZWxwKGFHVE0uYy5ndG1QdXJwb3NlcyxhR1RNLmQuY29uc2VudC5wdXJwb3NlcykmJmFHVE0uZi5jaGVscChhR1RNLmMuZ3RtU2VydmljZXMsYUdUTS5kLmNvbnNlbnQuc2VydmljZXMpJiZhR1RNLmYuY2hlbHAoYUdUTS5jLmd0bVZlbmRvcnMsYUdUTS5kLmNvbnNlbnQudmVuZG9ycyk/YUdUTS5kLmNvbnNlbnQuZ3RtQ29uc2VudD0hMDphR1RNLmQuY29uc2VudC5ndG1Db25zZW50PSJib29sZWFuIj09dHlwZW9mIGFHVE0uZC5jb25zZW50LmJsb2NrZWQmJmFHVE0uZC5jb25zZW50LmJsb2NrZWQ7dmFyIG49YUdUTS5mLmNvbnNlbnRfc2VyaWFsaXplKGFHVE0uZC5jb25zZW50KSxvPW4hPT1hR1RNLmQubGFzdF9jb25zZW50X2hhc2g7aWYoYUdUTS5kLmxhc3RfY29uc2VudF9oYXNoPW4sInVwZGF0ZSI9PWUmJm8mJihhR1RNLmQuaW5pdHx8YUdUTS5mLmluamVjdCgpLGFHVE0uZi5zZW5kbmF1cyh7ZXZlbnQ6ImFHVE1fY29uc2VudF91cGRhdGUiLGFHVE10czoobmV3IERhdGUpLmdldFRpbWUoKSxhR1RNY29uc2VudDphR1RNLmQuY29uc2VudD9KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihhR1RNLmQuY29uc2VudCkpOnt9fSkpLCJ1cGRhdGUiPT09ZSYmIW98fCJmdW5jdGlvbiIhPXR5cGVvZiBhR1RNLmYuY29uc2VudF9jYWxsYmFja3x8YUdUTS5mLmNvbnNlbnRfY2FsbGJhY2soZSksYUdUTS5jLmNvbnNlbnRfc3RvcmVfdXJsKWlmKG4hPT1hR1RNLmQuY29uc2VudF9oYXNoKXt2YXIgcj17fTthR1RNLmQuc2Vzc2lvbiYmYUdUTS5kLnNlc3Npb24udWlkJiYoci51aWQ9YUdUTS5kLnNlc3Npb24udWlkKSxhR1RNLmQuc2Vzc2lvbiYmYUdUTS5kLnNlc3Npb24uc2lkJiYoci5zaWQ9YUdUTS5kLnNlc3Npb24uc2lkKTt2YXIgcz17fSxpPXtndG1Db25zZW50OjEsYmxvY2tlZDoxfTtmb3IodmFyIGMgaW4gYUdUTS5kLmNvbnNlbnQpaWYoYUdUTS5kLmNvbnNlbnQuaGFzT3duUHJvcGVydHkoYykmJiFpW2NdKXt2YXIgZj1hR1RNLmQuY29uc2VudFtjXTsiIiE9PWYmJm51bGwhPWYmJihzW2NdPWYpfXIuY29uc2VudD1zO3ZhciBUPSEwPT09YUdUTS5jLmNvbnNlbnRfc3RvcmVfZW5jLE09Im51bWJlciI9PXR5cGVvZiBhR1RNLmMuc2Vzc2lvbl9zYWx0JiZhR1RNLmMuc2Vzc2lvbl9zYWx0Pj0xP2FHVE0uYy5zZXNzaW9uX3NhbHQ6MDthR1RNLmYubG9nKCJtX2NvbnNlbnRfc3RvcmVfcG9zdCIse3VybDphR1RNLmMuY29uc2VudF9zdG9yZV91cmwsaGFzaDpufSk7dmFyIGQ9YUdUTS5mLnhzZW5kKGFHVE0uYy5jb25zZW50X3N0b3JlX3VybCxyLFQsTSk7ZCYmKGQub25yZWFkeXN0YXRlY2hhbmdlPWZ1bmN0aW9uKCl7aWYoND09PWQucmVhZHlTdGF0ZSlpZihkLnN0YXR1cz49MjAwJiZkLnN0YXR1czwzMDApe2lmKGFHVE0uZC5jb25zZW50X2hhc2g9bixhR1RNLmQuc2Vzc2lvbl9zdGF0dXM9InN5bmNlZCIsYUdUTS5mLmxvZygibV9jb25zZW50X3N0b3JlX3N5bmNlZCIse2hhc2g6bn0pLGQucmVzcG9uc2VUZXh0KXRyeXt2YXIgZT1KU09OLnBhcnNlKGQucmVzcG9uc2VUZXh0KTtlJiYic3RyaW5nIj09dHlwZW9mIGUudWlkJiYwPT09ZS51aWQuaW5kZXhPZigiQy4iKSYmYUdUTS5kLnNlc3Npb24mJmUudWlkIT09YUdUTS5kLnNlc3Npb24udWlkJiYoYUdUTS5mLmxvZygibV91aWRfcHJvbW90ZWQiLHtvbGQ6YUdUTS5kLnNlc3Npb24udWlkLG5ldzplLnVpZH0pLGFHVE0uZC5zZXNzaW9uLnVpZD1lLnVpZCl9Y2F0Y2goZSl7YUdUTS5mLmxvZygiZV9jb25zZW50X3N0b3JlX3BhcnNlIix7bXNnOmUubWVzc2FnZX0pfX1lbHNlIGFHVE0uZi5sb2coImVfY29uc2VudF9zdG9yZSIse3N0YXR1czpkLnN0YXR1c30pfSl9ZWxzZSBhR1RNLmQuc2Vzc2lvbl9zdGF0dXM9ImNvbmZpcm1lZCI7cmV0dXJuIGFHVE0uZi5sb2coIm0zIixhR1RNLmQuY29uc2VudCksITB9LGFHVE0uZi5jYWxsX2NjPWZ1bmN0aW9uKCl7cmV0dXJuISgiZnVuY3Rpb24iIT10eXBlb2YgYUdUTS5mLnJ1bl9jY3x8IWFHVE0uZi5ydW5fY2MoImluaXQiKSkmJih2b2lkIDAhPT1hR1RNLmQudGltZXIuY29uc2VudCYmKGNsZWFySW50ZXJ2YWwoYUdUTS5kLnRpbWVyLmNvbnNlbnQpLGRlbGV0ZSBhR1RNLmQudGltZXIuY29uc2VudCksISFhR1RNLmQuaW5pdHx8YUdUTS5mLmluamVjdCgpKX0sImZ1bmN0aW9uIiE9dHlwZW9mIGFHVE0uZi5jb25zZW50X2xpc3RlbmVyJiYoYUdUTS5mLmNvbnNlbnRfbGlzdGVuZXI9ZnVuY3Rpb24oKXthR1RNLmMudXNlTGlzdGVuZXJ8fCgiZnVuY3Rpb24iPT10eXBlb2YgYUdUTS5mLmNhbGxfY2MmJmFHVE0uZi5jYWxsX2NjKCk/ImZ1bmN0aW9uIj09dHlwZW9mIGFHVE0uZi5zdGFydF9jb25zZW50X3BvbGwmJmFHVE0uZi5zdGFydF9jb25zZW50X3BvbGwoKTphR1RNLmQudGltZXIuY29uc2VudD1zZXRJbnRlcnZhbChmdW5jdGlvbigpe2FHVE0uZi5jYWxsX2NjKCkmJiJmdW5jdGlvbiI9PXR5cGVvZiBhR1RNLmYuc3RhcnRfY29uc2VudF9wb2xsJiZhR1RNLmYuc3RhcnRfY29uc2VudF9wb2xsKCl9LDUwMCkpfSksYUdUTS5mLnN0YXJ0X2NvbnNlbnRfcG9sbD1mdW5jdGlvbigpe2FHVE0uYy5jb25zZW50X3N0b3JlX3VybCYmKCJudW1iZXIiIT10eXBlb2YgYUdUTS5jLmNvbnNlbnRfcG9sbF9tc3x8YUdUTS5jLmNvbnNlbnRfcG9sbF9tczw9MHx8YUdUTS5kLnRpbWVyJiZhR1RNLmQudGltZXIuY29uc2VudF9wb2xsfHwoYUdUTS5kLnRpbWVyPWFHVE0uZC50aW1lcnx8e30sYUdUTS5kLnRpbWVyLmNvbnNlbnRfcG9sbD1zZXRJbnRlcnZhbChmdW5jdGlvbigpeyJmdW5jdGlvbiI9PXR5cGVvZiBhR1RNLmYucnVuX2NjJiZhR1RNLmYucnVuX2NjKCJ1cGRhdGUiKX0sYUdUTS5jLmNvbnNlbnRfcG9sbF9tcykpKX0sYUdUTS5mLmdjPWZ1bmN0aW9uKGUpe2lmKCJzdHJpbmciIT10eXBlb2YgZXx8IWUpcmV0dXJuIG51bGw7dmFyIHQ9ZS5yZXBsYWNlKC9bLiorP14ke30oKXxbXF1cXF0vZywiXFwkJiIpLGE9bmV3IFJlZ0V4cCgiKD86Xnw7XFxzKikiK3QrIj0oW147XSspIiksbj1udWxsO3RyeXt2YXIgbz1kb2N1bWVudCxyPWEuZXhlYyhvW2FHVE0ubi5ja10pO3ImJnIubGVuZ3RoPjEmJihuPWRlY29kZVVSSUNvbXBvbmVudChyWzFdKSl9Y2F0Y2goZSl7fXJldHVybiBufSxhR1RNLmYuc2M9ZnVuY3Rpb24oZSx0KXtpZigic3RyaW5nIj09dHlwZW9mIGUmJmUmJnQpdHJ5e2RvY3VtZW50W2FHVE0ubi5ja109ZSsiPSIrdCsiOyBTZWN1cmU7IFNhbWVTaXRlPUxheDsgcGF0aD0vIn1jYXRjaChlKXt9fSxhR1RNLmYudXJsUGFyYW09ZnVuY3Rpb24oZSx0KXtpZigic3RyaW5nIiE9dHlwZW9mIGV8fCFlKXJldHVybiBudWxsO3ZhciBhPWUucmVwbGFjZSgvWy4qKz9eJHt9KCl8W1xdXFxdL2csIlxcJCYiKSxuPW5ldyBSZWdFeHAoIls/Jl0iK2ErIig9KFteJiNdKil8JnwjfCQpIikuZXhlYyh0KTtyZXR1cm4gbiYmblsyXT9kZWNvZGVVUklDb21wb25lbnQoblsyXS5yZXBsYWNlKC9cKy9nLCIgIikpOm51bGx9LGFHVE0uZi5vcHRvdXQ9ZnVuY3Rpb24oKXt2YXIgZT0hMSx0PWFHVE0uZi51cmxQYXJhbSgiYUdUTW9wdG91dCIsd2luZG93LmxvY2F0aW9uLmhyZWYpO2lmKHQmJiIwIiE9PXQpYUdUTS5mLnNjKCJhR1RNb3B0b3V0IiwiMSIpLGU9ITA7ZWxzZSBpZigiMCI9PT10KWFHVE0uZi5zYygiYUdUTW9wdG91dCIsIjAiKTtlbHNle3ZhciBhPWFHVE0uZi5nYygiYUdUTW9wdG91dCIpO2EmJiIwIiE9PWEmJihlPSEwKX1pZihlKXtmb3IodmFyIG4gaW4gYUdUTSlhR1RNLmhhc093blByb3BlcnR5KG4pJiYiZiIhPT1uJiZkZWxldGUgYUdUTVtuXTtyZXR1cm4gYUdUTS5mLm9iamluaXQoKSwiZnVuY3Rpb24iPT10eXBlb2YgYUdUTS5mLm9wdG91dF9jYWxsYmFjayYmYUdUTS5mLm9wdG91dF9jYWxsYmFjaygpLCEwfXJldHVybiExfSxhR1RNLmYuYUdUTV9ldmVudD1mdW5jdGlvbihlKXsib2JqZWN0IiE9dHlwZW9mIGFHVE0uZC5jb25zZW50JiYoYUdUTS5kLmNvbnNlbnQ9bnVsbCksZXx8KGU9ImFHVE1fZXZlbnQiKTt2YXIgdD17ZXZlbnQ6ZSxhR1RNdHM6KG5ldyBEYXRlKS5nZXRUaW1lKCksYUdUTWNvbnNlbnQ6YUdUTS5kLmNvbnNlbnQ/SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYoYUdUTS5kLmNvbnNlbnQpKTp7fX07cmV0dXJuImFHVE1fcmVhZHkiPT1lJiYodC5hR1RNPXt2ZXJzaW9uOmFHVE0uZC52ZXJzaW9uLGlzX2lmcmFtZTphR1RNLmQuaXNfaWZyYW1lLGhhc3R5RXZlbnRzOmFHVE0uZC5mLGVycm9yczphR1RNLmQuZXJyb3JzfSksdH0sYUdUTS5mLnByb3h5U3VwcG9ydD1mdW5jdGlvbigpe2lmKCJmdW5jdGlvbiIhPXR5cGVvZiBQcm94eSlyZXR1cm4hMTt0cnl7cmV0dXJuIG5ldyBQcm94eShmdW5jdGlvbigpe30se2FwcGx5OmZ1bmN0aW9uKCl7cmV0dXJuITB9fSkoKX1jYXRjaChlKXtyZXR1cm4hMX19LGFHVE0uZi51cmxMaXN0ZW5lcj1mdW5jdGlvbihlLHQsYSl7aWYoIWFHVE0uZC51cmxMaXN0ZW5lcl9hY3RpdmUpe2FHVE0uZC51cmxMaXN0ZW5lcl9hY3RpdmU9ITAsIm51bWJlciIhPXR5cGVvZiB0JiYodD01MDApLCJib29sZWFuIiE9dHlwZW9mIGEmJihhPSExKSxhR1RNLmQubGFzdF91cmw9YUdUTS5kLmxhc3RfdXJsfHxhR1RNLmYuZ2V0VmFsKCJsIiwiaHJlZiIpLCJzdHJpbmciPT10eXBlb2YgYUdUTS5kLmxhc3RfdXJsJiZhR1RNLmQubGFzdF91cmx8fChhR1RNLmQubGFzdF91cmw9IiIpO3ZhciBjaGVja1VybENoYW5nZT1mdW5jdGlvbigpe3ZhciB0PWFHVE0uZi5nZXRWYWwoImwiLCJocmVmIil8fCIiO2lmKHQhPWFHVE0uZC5sYXN0X3VybCl7InN0cmluZyIhPXR5cGVvZiBlJiYoZT0idlBhZ2V2aWV3Iik7dmFyIGE9e2V2ZW50OmV9O2Eub2xkVVJMPWFHVE0uZC5sYXN0X3VybCxhLm5ld1VSTD10LGEubmV3VGl0bGU9ZG9jdW1lbnQudGl0bGUsYUdUTS5mLmZpcmUoYSksYUdUTS5kLmxhc3RfdXJsPXR9fTthR1RNLmYuZXZMc3RuKCJ3aW5kb3ciLCJwb3BzdGF0ZSIsY2hlY2tVcmxDaGFuZ2UpLGFHVE0uZi5ldkxzdG4oIndpbmRvdyIsImhhc2hjaGFuZ2UiLGNoZWNrVXJsQ2hhbmdlKTt2YXIgbj0hMTtpZihhR1RNLmYucHJveHlTdXBwb3J0KCkpe3ZhciBvPXthcHBseTpmdW5jdGlvbihlLHQsYSl7dmFyIG49ZS5hcHBseSh0LGEpO3JldHVybiBjaGVja1VybENoYW5nZSgpLG59fTtoaXN0b3J5LnB1c2hTdGF0ZT1uZXcgUHJveHkoaGlzdG9yeS5wdXNoU3RhdGUsbyksaGlzdG9yeS5yZXBsYWNlU3RhdGU9bmV3IFByb3h5KGhpc3RvcnkucmVwbGFjZVN0YXRlLG8pLG49ITB9KHQ+MCYmIW4mJmF8fHQ+MCYmIWEpJiZhR1RNLmYudGltZXIoInVybExpc3RlbmVyIixjaGVja1VybENoYW5nZSxudWxsLHQsMCl9fSxhR1RNLmYuZ3RtX2xvYWQ9ZnVuY3Rpb24oZSx0LGEsbixvLHIpe2lmKGFHVE0uZC5jb25maWcpe2lmKCJvYmplY3QiIT10eXBlb2YgYUdUTS5kLmd0bUxvYWRlZCYmKGFHVE0uZC5ndG1Mb2FkZWQ9W10pLGFHVE0uZC5ndG1Mb2FkZWQubGVuZ3RoPDEmJihhR1RNLmYuc2VuZG5hdXMoYUdUTS5mLmFHVE1fZXZlbnQoImFHVE1fcmVhZHkiKSksYSYmYUdUTS5mLnNlbmRuYXVzKHtldmVudDoiZ3RtLmpzIiwiZ3RtLnN0YXJ0IjoobmV3IERhdGUpLmdldFRpbWUoKX0pLGFHVE0uYy5hUGFnZXZpZXcmJmFHVE0uZi5zZW5kbmF1cyh7ZXZlbnQ6ImFQYWdldmlldyIsYUdUTXRzOihuZXcgRGF0ZSkuZ2V0VGltZSgpfSksYUdUTS5jLnZQYWdldmlldyYmYUdUTS5mLnNlbmRuYXVzKHtldmVudDoidlBhZ2V2aWV3IixhR1RNdHM6KG5ldyBEYXRlKS5nZXRUaW1lKCl9KSxhR1RNLmMudlBhZ2V2aWV3cyYmYUdUTS5mLnVybExpc3RlbmVyKCJ2UGFnZXZpZXciLGFHVE0uYy52UGFnZXZpZXdzVGltZXIsYUdUTS5jLnZQYWdldmlld3NGYWxsYmFjaykpLGFHVE0uZC5jb25zZW50RXZlbnRfZmlyZWQ9ImJvb2xlYW4iPT10eXBlb2YgYUdUTS5kLmNvbnNlbnRFdmVudF9maXJlZCYmYUdUTS5kLmNvbnNlbnRFdmVudF9maXJlZCxhR1RNLmMuc2VuZENvbnNlbnRFdmVudCYmIWFHVE0uZC5jb25zZW50RXZlbnRfZmlyZWQmJiJvYmplY3QiPT10eXBlb2YgYUdUTS5kLmNvbnNlbnQmJmFHVE0uZC5jb25zZW50Lmhhc1Jlc3BvbnNlJiYoYUdUTS5mLnNlbmRuYXVzKGFHVE0uZi5hR1RNX2V2ZW50KCJhR1RNX2NvbnNlbnQiKSksYUdUTS5kLmNvbnNlbnRFdmVudF9maXJlZD0hMCksYSl7bnx8KG49ImlkIik7dmFyIHM9ITEsaT1hR1RNLmYuZ2MoImFHVE1kZWJ1ZyIpO2lmKGkmJnBhcnNlSW50KGkpPjAmJihzPSEwKSxzfHxhR1RNLmYudXJsUGFyYW0oImd0bV9kZWJ1ZyIsZG9jdW1lbnQubG9jYXRpb24uaHJlZikmJihzPSEwKSwhcyYmZG9jdW1lbnQucmVmZXJyZXIpe3ZhciBjPXQuY3JlYXRlRWxlbWVudCgiYSIpO2MuaHJlZj1kb2N1bWVudC5yZWZlcnJlcixjLmhvc3RuYW1lPT1hR1RNLm4udGErIi5jb20iJiYocz0hMCl9IWkmJnMmJmFHVE0uZi5zYygiYUdUTWRlYnVnIiwiMSIpO3ZhciBmPXQuY3JlYXRlRWxlbWVudCgic2NyaXB0Iik7aWYoZi5pZD0iYUdUTV90bV8iK2EsZi5hc3luYz0hMCwib2JqZWN0Ij09dHlwZW9mIGFHVE0uYy5ndG1BdHRyKWZvcih2YXIgVCBpbiBhR1RNLmMuZ3RtQXR0cilmLnNldEF0dHJpYnV0ZShULGFHVE0uYy5ndG1BdHRyW1RdKTtpZihhR1RNLmMubm9uY2UmJihmLm5vbmNlPWFHVE0uYy5ub25jZSksci5ndG1KUyYmIXMpZi5pbm5lckhUTUw9YXRvYihyLmd0bUpTKTtlbHNle3ZhciBNPXIuZ3RtVVJMfHwiaHR0cHM6Ly93d3cuIithR1RNLm4udG0rIi5jb20vZ3RtLmpzIixkPXIuZW52fHwiIixHPS0xPT09TS5pbmRleE9mKCI/Iik/Ij8iOiImIjtmLnNyYz1NK0crbisiPSIrYSsiJmw9IitvK2R9dmFyIGw9dC5nZXRFbGVtZW50c0J5VGFnTmFtZSgic2NyaXB0IilbMF07bC5wYXJlbnROb2RlLmluc2VydEJlZm9yZShmLGwpLGFHVE0uZC5ndG1Mb2FkZWQucHVzaChhfHwibm9fZ3RtX2lkIil9fWVsc2UgYUdUTS5mLmxvZygiZTciLG51bGwpfSxhR1RNLmYuZG9tcmVhZHk9ZnVuY3Rpb24oZSl7dmFyIHQ9ITE7YUdUTS5mLnZPYihlKXx8KGU9e2FNU0c6IkVtcHR5IERPTXJlYWR5IGV2ZW50IGZpcmVkLiJ9LHQ9ITApLGUuZXZlbnR8fChlLmV2ZW50PSJhRE9NcmVhZHkiKSxhR1RNLmQuZG9tX3JlYWR5JiZ0fHwoIWFHVE0uYy5kbFN0YXRlRXZlbnRzJiZ0fHxhR1RNLmYuZmlyZShlKSx0JiYoYUdUTS5kLmRvbV9yZWFkeT0hMCkpfSxhR1RNLmYucGFnZXJlYWR5PWZ1bmN0aW9uKGUpe3ZhciB0PSExO2FHVE0uZi52T2IoZSl8fChlPXthTVNHOiJFbXB0eSBQQUdFcmVhZHkgZXZlbnQgZmlyZWQuIn0sdD0hMCksZS5ldmVudHx8KGUuZXZlbnQ9ImFQQUdFcmVhZHkiKSxhR1RNLmQucGFnZV9yZWFkeSYmdHx8KCFhR1RNLmMuZGxTdGF0ZUV2ZW50cyYmdHx8YUdUTS5mLmZpcmUoZSksdCYmKGFHVE0uZC5wYWdlX3JlYWR5PSEwKSl9LGFHVE0uZi5pbml0R1RNPWZ1bmN0aW9uKGUpe2lmKCJvYmplY3QiPT10eXBlb2YgYUdUTS5jLmd0bSYmYUdUTS5jLmd0bSl7dmFyIHQ9MDtmb3IodmFyIGEgaW4gYUdUTS5jLmd0bSl0KyssYUdUTS5jLmd0bS5oYXNPd25Qcm9wZXJ0eShhKSYmKCJib29sZWFuIiE9dHlwZW9mIGFHVE0uYy5ndG1bYV0uaGFzTG9hZGVkJiYoYUdUTS5jLmd0bVthXS5oYXNMb2FkZWQ9ITEpLGFHVE0uYy5ndG1bYV0uaGFzTG9hZGVkfHxlJiYhYUdUTS5jLmd0bVthXS5ub0NvbnNlbnR8fChhR1RNLmYuZ3RtX2xvYWQod2luZG93LGRvY3VtZW50LGEsYUdUTS5jLmd0bVthXS5pZFBhcmFtP2FHVE0uYy5ndG1bYV0uaWRQYXJhbToiIixhR1RNLmMuZ2RsLGFHVE0uYy5ndG1bYV0pLGFHVE0uYy5ndG1bYV0uaGFzTG9hZGVkPSEwKSk7dHx8YUdUTS5mLmd0bV9sb2FkKHdpbmRvdyxkb2N1bWVudCwiIixhR1RNLmMuZ3RtW2FdLmlkUGFyYW0/YUdUTS5jLmd0bVthXS5pZFBhcmFtOiIiLGFHVE0uYy5nZGwsbnVsbCl9fSxhR1RNLmYuY2hrRFByZWFkeT1mdW5jdGlvbigpe3ZhciBlPWRvY3VtZW50LnJlYWR5U3RhdGU7ImludGVyYWN0aXZlIj09PWV8fCJjb21wbGV0ZSI9PT1lP2FHVE0uZi5kb21yZWFkeShudWxsKTphR1RNLmYuZXZMc3RuKGRvY3VtZW50LCJET01Db250ZW50TG9hZGVkIixhR1RNLmYuZG9tcmVhZHkpLCJjb21wbGV0ZSI9PT1lP2FHVE0uZi5wYWdlcmVhZHkobnVsbCk6YUdUTS5mLmV2THN0bih3aW5kb3csImxvYWQiLGFHVE0uZi5wYWdlcmVhZHkpfSxhR1RNLmYuaW5qZWN0PWZ1bmN0aW9uKCl7aWYoIWFHVE0uZC5jb25maWcpcmV0dXJuIGFHVE0uZi5sb2coImU4IixudWxsKSwhMTtpZigib2JqZWN0IiE9dHlwZW9mIGFHVE0uZC5jb25zZW50fHwiYm9vbGVhbiIhPXR5cGVvZiBhR1RNLmQuY29uc2VudC5oYXNSZXNwb25zZXx8IWFHVE0uZC5jb25zZW50Lmhhc1Jlc3BvbnNlKXJldHVybiBhR1RNLmYubG9nKCJlMTMiLG51bGwpLCExO2FHVE0uZC5pbml0fHwoKHdpbmRvd1thR1RNLmMuZ2RsXXx8W10pLmZvckVhY2goZnVuY3Rpb24oZSx0KXtpZigib2JqZWN0Ij09dHlwZW9mIGUmJmUpe2lmKCFlLmFHVE1jaGspe2UuYUdUTWRsPSEwO3ZhciBhPUpTT04ucGFyc2UoYUdUTS5mLnNTdHJmKGUpKTt2b2lkIDAhPT1hWyJndG0udW5pcXVlRXZlbnRJZCJdJiZkZWxldGUgYVsiZ3RtLnVuaXF1ZUV2ZW50SWQiXSxhR1RNLmQuZi5wdXNoKGEpfX1lbHNlIGFHVE0uZi5sb2coImUxNyIse29ial90eXBlOnR5cGVvZiBlLG9ial92YWx1ZTplLGluZGV4OnR9KSxhR1RNLmQuZi5wdXNoKHtldmVudDoiZXhjZXB0aW9uIixlcnJtc2c6IkRhdGFMYXllciBFbnRyeSBpcyBubyBvYmplY3QiLGVycnR5cGU6IkRMIEVycm9yIixvYmpfdHlwZTp0eXBlb2YgZSxvYmpfdmFsdWU6ZX0pfSksYUdUTS5kLmNvbnNlbnQuZ3RtQ29uc2VudCYmKGFHVE0uZi5pbml0R1RNKCExKSxhR1RNLmQuaW5pdD0hMCksYUdUTS5kLmluaXQmJmFHVE0uZi5jaGtEUHJlYWR5KCkpO3JldHVybiJmdW5jdGlvbiI9PXR5cGVvZiBhR1RNLmYuaW5qZWN0X2NhbGxiYWNrJiZhR1RNLmYuaW5qZWN0X2NhbGxiYWNrKCksYUdUTS5mLmxvZygibTYiLG51bGwpLCEwfSxhR1RNLmYuaUZyYW1lRmlyZT1mdW5jdGlvbihlKXsib2JqZWN0Ij09dHlwZW9mIGUmJmUmJihhR1RNLmQuaXNfaWZyYW1lJiYic3RyaW5nIj09dHlwZW9mIGUuZXZlbnQmJi9eKGFHVE18Z3RtXC58W2F2XURPTXJlYWR5fFthdl1QQUdFcmVhZHkpLy50ZXN0KGUuZXZlbnQpP2FHVE0uZi5zZW5kbmF1cyhlKTooZS5hR1RNX3NvdXJjZT0iaUZyYW1lICIrZG9jdW1lbnQubG9jYXRpb24uaG9zdG5hbWUsYUdUTS5kLmlmcmFtZS5jb3VudGVyLmV2ZW50cysrLGUuaWZFdkN0cj1hR1RNLmQuaWZyYW1lLmNvdW50ZXIuZXZlbnRzLCJzdHJpbmciPT10eXBlb2YgZS5ldmVudCYmZS5ldmVudCYmKGFHVE0uZC5pZnJhbWUuY291bnRlcltlLmV2ZW50XT1hR1RNLmQuaWZyYW1lLmNvdW50ZXJbZS5ldmVudF18fDAsYUdUTS5kLmlmcmFtZS5jb3VudGVyW2UuZXZlbnRdKyssZVsiaWZFdkN0cl8iK2UuZXZlbnRdPWFHVE0uZC5pZnJhbWUuY291bnRlcltlLmV2ZW50XSksZS5hR1RNdHMmJmRlbGV0ZSBlLmFHVE10cyxlLmFHVE1wYXJhbXMmJmRlbGV0ZSBlLmFHVE1wYXJhbXMsYUdUTS5kLmlmcmFtZS5vcmlnaW4/d2luZG93LnRvcC5wb3N0TWVzc2FnZShlLGFHVE0uZC5pZnJhbWUub3JpZ2luKTphR1RNLmQuZi5wdXNoKGUpKSl9LGFHVE0uZi5pZkhhbmRzaGFrZT1mdW5jdGlvbigpe2lmKCFhR1RNLmQuaXNfaWZyYW1lJiYhYUdUTS5kLmlmcmFtZS5oYW5kc2hha2Upe3ZhciBlPWRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCJpZnJhbWUiKTtpZighZS5sZW5ndGgpcmV0dXJuO2Zvcih2YXIgdD0wO3Q8ZS5sZW5ndGg7dCsrKXt2YXIgYT1lW3RdO2EmJmEuY29udGVudFdpbmRvdyYmYS5jb250ZW50V2luZG93LnBvc3RNZXNzYWdlJiZhLmNvbnRlbnRXaW5kb3cucG9zdE1lc3NhZ2UoImFHVE1fVG9wMmlGcmFtZSBIYW5kc2hha2UiLCIqIil9YUdUTS5kLmlmcmFtZS5oYW5kc2hha2U9ITB9fSxhR1RNLmYuaWZIU2xpc3Rlbj1mdW5jdGlvbihlKXtpZihhR1RNLmQuaXNfaWZyYW1lJiZlLnNvdXJjZT09PXdpbmRvdy50b3AmJiJzdHJpbmciPT10eXBlb2YgZS5kYXRhJiYiYUdUTV9Ub3AyaUZyYW1lIEhhbmRzaGFrZSI9PWUuZGF0YSlmb3IoYUdUTS5kLmlmcmFtZS5vcmlnaW49ZS5vcmlnaW4sYUdUTS5kLmlmcmFtZS5pZkxpc3Rlbj0hMSx3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcigibWVzc2FnZSIsYUdUTS5mLmlmSFNsaXN0ZW4sITEpO2FHVE0uZC5mLmxlbmd0aDspe3ZhciB0PWFHVE0uZC5mLnNoaWZ0KCk7YUdUTS5mLmlGcmFtZUZpcmUodCl9fSxhR1RNLmYudk9iPWZ1bmN0aW9uKGUpe2lmKCJvYmplY3QiIT10eXBlb2YgZXx8IWUpcmV0dXJuITE7dHJ5e0pTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoZSkpfWNhdGNoKGUpe3JldHVybiExfXJldHVybiEwfSxhR1RNLmYudlN0PWZ1bmN0aW9uKGUpe3ZhciB0PUFycmF5LmlzQXJyYXkoZSk/ZToic3RyaW5nIj09dHlwZW9mIGU/W2VdOltdO3JldHVybiAwIT09dC5sZW5ndGgmJnQuZXZlcnkoZnVuY3Rpb24oZSl7cmV0dXJuInN0cmluZyI9PXR5cGVvZiBlJiYiIiE9PWV9KX0sYUdUTS5mLnBhc3NpdmVTdXBwb3J0ZWQ9ZnVuY3Rpb24oKXtpZigiYm9vbGVhbiI9PXR5cGVvZiBhR1RNLmQucGFzc2l2ZV9zdXBwb3J0ZWQpcmV0dXJuIGFHVE0uZC5wYXNzaXZlX3N1cHBvcnRlZDt2YXIgZT0hMTt0cnl7dmFyIHQ9T2JqZWN0LmRlZmluZVByb3BlcnR5KHt9LCJwYXNzaXZlIix7Z2V0OmZ1bmN0aW9uKCl7cmV0dXJuIGU9ITAsITB9fSksbm9vcD1mdW5jdGlvbigpe307d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoImFHVE1wYXNzaXZldGVzdCIsbm9vcCx0KSx3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcigiYUdUTXBhc3NpdmV0ZXN0Iixub29wLHQpfWNhdGNoKHQpe2U9ITF9cmV0dXJuIGFHVE0uZC5wYXNzaXZlX3N1cHBvcnRlZD1lLGV9LGFHVE0uZi50aHJvdHRsZT1mdW5jdGlvbihlLHQpe2lmKCJmdW5jdGlvbiIhPXR5cGVvZiBlKXJldHVybiBlO2lmKCJudW1iZXIiIT10eXBlb2YgdHx8dDw9MClyZXR1cm4gZTt2YXIgYT0wLG49bnVsbCxvPW51bGwscj1udWxsO3JldHVybiBmdW5jdGlvbigpe3ZhciBzPURhdGUubm93KCk7bz10aGlzLHI9YXJndW1lbnRzO3ZhciBpPXQtKHMtYSk7aTw9MD8obiYmKGNsZWFyVGltZW91dChuKSxuPW51bGwpLGE9cyxlLmFwcGx5KG8scikpOm58fChuPXNldFRpbWVvdXQoZnVuY3Rpb24oKXthPURhdGUubm93KCksbj1udWxsLGUuYXBwbHkobyxyKX0saSkpfX0sYUdUTS5mLmV2THN0bj1mdW5jdGlvbihlLHQsYSxuKXtpZigid2luZG93Ij09PWUmJihlPXdpbmRvdyksImRvY3VtZW50Ij09PWUmJihlPWRvY3VtZW50KSwib2JqZWN0Ij09dHlwZW9mIGUmJmUmJiJzdHJpbmciPT10eXBlb2YgdCYmImZ1bmN0aW9uIj09dHlwZW9mIGEpeyJvYmplY3QiPT10eXBlb2YgbiYmbnx8KG49e30pO3RyeXtpZigibWVzc2FnZSI9PXQpYUdUTS5kLmlmcmFtZS50b3BMaXN0ZW58fGFHVE0uZC5pc19pZnJhbWV8fChhR1RNLmQuaWZyYW1lLnRvcExpc3Rlbj0hMCxlLmFkZEV2ZW50TGlzdGVuZXIodCxmdW5jdGlvbihlKXthKHZvaWQgMCE9PWUuZGF0YT9lLmRhdGE6bnVsbCwic3RyaW5nIj09dHlwZW9mIGUub3JpZ2luP2Uub3JpZ2luOiIiKX0pKTtlbHNle3ZhciBvPSJudW1iZXIiPT10eXBlb2Ygbi50aHJvdHRsZSYmbi50aHJvdHRsZT4wP2FHVE0uZi50aHJvdHRsZShhLG4udGhyb3R0bGUpOmE7ITA9PT1uLnBhc3NpdmUmJmFHVE0uZi5wYXNzaXZlU3VwcG9ydGVkKCk/ZS5hZGRFdmVudExpc3RlbmVyKHQsbyx7cGFzc2l2ZTohMH0pOmUuYWRkRXZlbnRMaXN0ZW5lcih0LG8pfX1jYXRjaChuKXthR1RNLmYubG9nKCJlMTIiLHtlcnJvcjpuLGVsOmUsZXY6dCxmY3Q6YX0pfX1lbHNlIGFHVE0uZi5sb2coImUxMSIse2VsOmUsZXY6dCxmY3Q6YX0pfSxhR1RNLmYucm1Mc3RuPWZ1bmN0aW9uKGUsdCxhKXsid2luZG93Ij09PWUmJihlPXdpbmRvdyksImRvY3VtZW50Ij09PWUmJihlPWRvY3VtZW50KTt0cnl7ZS5yZW1vdmVFdmVudExpc3RlbmVyKHQsYSl9Y2F0Y2goZSl7fX0sYUdUTS5mLmdldFZhbD1mdW5jdGlvbihlLHQpe2lmKGFHVE0uZi52U3QoW2UsdF0pJiZ0Lm1hdGNoKC9bYS16XSsvaSkmJigicCIhPWV8fCJvYmplY3QiPT10eXBlb2YgcGVyZm9ybWFuY2UmJnBlcmZvcm1hbmNlKSlzd2l0Y2goZSl7Y2FzZSJ3IjpyZXR1cm4gYUdUTS5mLnZPYih3aW5kb3dbdF0pP0pTT04ucGFyc2UoYUdUTS5mLnNTdHJmKHdpbmRvd1t0XSkpOndpbmRvd1t0XTtjYXNlIm4iOnJldHVybiBhR1RNLmYudk9iKG5hdmlnYXRvclt0XSk/SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYobmF2aWdhdG9yW3RdKSk6bmF2aWdhdG9yW3RdO2Nhc2UiZCI6cmV0dXJuIGRvY3VtZW50W3RdO2Nhc2UibCI6cmV0dXJuIGRvY3VtZW50LmxvY2F0aW9uW3RdO2Nhc2UiaCI6cmV0dXJuIGRvY3VtZW50LmhlYWRbdF07Y2FzZSJiIjpyZXR1cm4gZG9jdW1lbnQuYm9keVt0XTtjYXNlInMiOnJldHVybiBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgiaHRtbCIpWzBdLnNjcm9sbFRvcHx8MDtjYXNlIm0iOnJldHVybiB3aW5kb3cuc2NyZWVuW3RdO2Nhc2UiYyI6cmV0dXJuIHdpbmRvdy5nb29nbGVfdGFnX2RhdGEmJndpbmRvdy5nb29nbGVfdGFnX2RhdGEuaWNzP0pTT04ucGFyc2UoYUdUTS5mLnNTdHJmKHdpbmRvdy5nb29nbGVfdGFnX2RhdGEuaWNzKSk6bnVsbDtjYXNlInAiOnJldHVybiJub3ciPT10P3BlcmZvcm1hbmNlLm5vdygpOnBlcmZvcm1hbmNlW3RdO2RlZmF1bHQ6cmV0dXJufX0sYUdUTS5mLmdldE5vZGVBdHRyPWZ1bmN0aW9uKGUsdCl7dmFyIGE9ZG9jdW1lbnQucXVlcnlTZWxlY3RvcihlKTtyZXR1cm4gYT9hLmdldEF0dHJpYnV0ZSh0KTpudWxsfSxhR1RNLmYubmV3Tm9kZT1mdW5jdGlvbihlLHQsYSl7aWYoYUdUTS5mLnZTdChbZSx0XSkmJiJvYmplY3QiPT10eXBlb2YgYSl7dmFyIG49ZG9jdW1lbnQuY3JlYXRlRWxlbWVudChlKSxvPWRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IodCk7aWYobyl7Zm9yKHZhciByIGluIGEpaWYoYS5oYXNPd25Qcm9wZXJ0eShyKSl7dmFyIHM9ci5zcGxpdCgiLiIpOzE9PT1zLmxlbmd0aD9uLnNldEF0dHJpYnV0ZShyLGFbcl0pOihuW3NbMF1dfHwobltzWzBdXT17fSksbltzWzBdXVtzWzFdXT1hW3JdKX1vLmFwcGVuZENoaWxkKG4pfX19LGFHVE0uZi5kZWxOb2RlPWZ1bmN0aW9uKGUpe2lmKGFHVE0uZi52U3QoZSkpe3ZhciB0PWRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoZSk7dCYmdC5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKHQpfX0sYUdUTS5mLnBhZ2VpbmZvPWZ1bmN0aW9uKGUpe3ZhciB0PTAsYT0wO2lmKChlPWV8fHt9KS5jb3VudFdvcmRzJiZmdW5jdGlvbiBnZXRUZXh0KGUpe2lmKDM9PT1lLm5vZGVUeXBlKXQrPWUudGV4dENvbnRlbnQudHJpbSgpLnNwbGl0KC9ccysvKS5sZW5ndGg7ZWxzZSBpZigxPT09ZS5ub2RlVHlwZSYmIS9eKHNjcmlwdHxzdHlsZXxub3NjcmlwdCkkL2kudGVzdChlLnRhZ05hbWUpKWZvcih2YXIgYT0wO2E8ZS5jaGlsZE5vZGVzLmxlbmd0aDthKyspZ2V0VGV4dChlLmNoaWxkTm9kZXNbYV0pfShkb2N1bWVudC5ib2R5KSxlLmNvdW50SW1hZ2VzKWZvcih2YXIgbj1kb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgiaW1nIiksbz0wO288bi5sZW5ndGg7bysrKW5bb10ubmF0dXJhbFdpZHRoPjI1MCYmbltvXS5uYXR1cmFsSGVpZ2h0PjI1MCYmYSsrO3JldHVybnt3b3Jkczp0LGltYWdlczphfX0sYUdUTS5mLmNwTHN0PWZ1bmN0aW9uKGUsdCxhKXt0cnl7ZS5hZGRFdmVudExpc3RlbmVyKHQsZnVuY3Rpb24oZSl7dmFyIHQ7d2luZG93LmdldFNlbGVjdGlvbiYmKHQ9d2luZG93LmdldFNlbGVjdGlvbigpLnRvU3RyaW5nKCkpJiZhKHQpfSl9Y2F0Y2godCl7YUdUTS5mLmxvZygiZTEyIix7ZWxlbWVudDplLGVycm9yOnR9KX19LGFHVE0uZi5lbExzdD1mdW5jdGlvbihlLHQsYSl7dHJ5e2UuYWRkRXZlbnRMaXN0ZW5lcih0LGZ1bmN0aW9uKGUpe2Zvcih2YXIgdD10aGlzLnRhZ05hbWUudG9Mb3dlckNhc2UoKSxuPSIiLG89IiIscj1udWxsLHM9bnVsbCxpPTAsYz10aGlzO2MmJmMucGFyZW50RWxlbWVudDspYz1jLnBhcmVudEVsZW1lbnQsIW4mJmMuaWQmJihuPSgic3RyaW5nIj09dHlwZW9mIGMubm9kZU5hbWU/Yy5ub2RlTmFtZS50b0xvd2VyQ2FzZSgpKyI6IjoiIikrYy5pZCksIW8mJmMuZ2V0QXR0cmlidXRlKCJjbGFzcyIpJiYobz0oInN0cmluZyI9PXR5cGVvZiBjLm5vZGVOYW1lP2Mubm9kZU5hbWUudG9Mb3dlckNhc2UoKSsiOiI6IiIpK2MuZ2V0QXR0cmlidXRlKCJjbGFzcyIpKTtpZigiaW5wdXQiPT09dHx8InNlbGVjdCI9PT10fHwidGV4dGFyZWEiPT09dCl7Zm9yKGM9dGhpcztjJiZjLnBhcmVudEVsZW1lbnQmJiJmb3JtIiE9PWMudGFnTmFtZS50b0xvd2VyQ2FzZSgpOyljPWMucGFyZW50RWxlbWVudDsiZm9ybSI9PT1jLnRhZ05hbWUudG9Mb3dlckNhc2UoKSYmKHI9e2lkOmMuaWQsY2xhc3M6Yy5nZXRBdHRyaWJ1dGUoImNsYXNzIiksbmFtZTpjLmdldEF0dHJpYnV0ZSgibmFtZSIpLGFjdGlvbjpjLmFjdGlvbixlbGVtZW50czpjLmVsZW1lbnRzLmxlbmd0aH0scz1BcnJheS5wcm90b3R5cGUuaW5kZXhPZi5jYWxsKGMuZWxlbWVudHMsdGhpcykrMSl9Im9iamVjdCI9PXR5cGVvZiB0aGlzLmVsZW1lbnRzJiYibnVtYmVyIj09dHlwZW9mIHRoaXMuZWxlbWVudHMubGVuZ3RoJiYoaT10aGlzLmVsZW1lbnRzLmxlbmd0aCk7dmFyIGY9e3RhZ05hbWU6dCx0YXJnZXQ6dGhpcy50YXJnZXR8fCIiLHBhcmVudElEOm4scGFyZW50Q2xhc3M6byxpZDp0aGlzLmlkfHwiIixuYW1lOnRoaXMuZ2V0QXR0cmlidXRlKCJuYW1lIil8fCIiLGNsYXNzOnRoaXMuZ2V0QXR0cmlidXRlKCJjbGFzcyIpfHwiIixocmVmOnRoaXMuaHJlZnx8IiIsc3JjOnRoaXMuc3JjfHwiIixhY3Rpb246dGhpcy5hY3Rpb258fCIiLHR5cGU6dGhpcy50eXBlfHwiIixlbGVtZW50czppLHBvc2l0aW9uOnMsZm9ybTpyLGh0bWw6dGhpcy5vdXRlckhUTUw/dGhpcy5vdXRlckhUTUwudG9TdHJpbmcoKToiIix0ZXh0OnRoaXMub3V0ZXJUZXh0P3RoaXMub3V0ZXJUZXh0LnRvU3RyaW5nKCk6IiJ9O2YuaHRtbC5sZW5ndGg+NTEyJiYoZi5odG1sPWYuaHRtbC5zbGljZSgwLDUwOSkrIi4uLiIpLGYudGV4dC5sZW5ndGg+NTEyJiYoZi50ZXh0PWYudGV4dC5zbGljZSgwLDUwOSkrIi4uLiIpLGEoZil9KX1jYXRjaCh0KXthR1RNLmYubG9nKCJlMTIiLHtlbGVtZW50OmUsZXJyb3I6dH0pfX0sYUdUTS5mLmFkZEVsTHN0PWZ1bmN0aW9uKGUsdCxhKXtpZihhR1RNLmYudlN0KFtlLHRdKSYmImZ1bmN0aW9uIj09dHlwZW9mIGEpe3ZhciBuPWRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoZSk7Im9iamVjdCI9PXR5cGVvZiBuJiYibnVtYmVyIj09dHlwZW9mIG4ubGVuZ3RoJiYwIT1uLmxlbmd0aCYmbi5mb3JFYWNoKGZ1bmN0aW9uKGUpe2lmKCJjb3B5Ij09PXQpYUdUTS5mLmNwTHN0KGUsdCxhKTtlbHNlIGFHVE0uZi5lbExzdChlLHQsYSl9KX19LGFHVE0uZi5vYnNlcnZlcj1mdW5jdGlvbihlLHQsYSl7aWYoYUdUTS5mLnZTdChbZSx0XSkmJiJmdW5jdGlvbiI9PXR5cGVvZiBhKXtuZXcgTXV0YXRpb25PYnNlcnZlcihmdW5jdGlvbihuKXtuLmZvckVhY2goZnVuY3Rpb24obil7ImNoaWxkTGlzdCI9PT1uLnR5cGUmJm4uYWRkZWROb2Rlcy5sZW5ndGgmJkFycmF5LnByb3RvdHlwZS5mb3JFYWNoLmNhbGwobi5hZGRlZE5vZGVzLGZ1bmN0aW9uKG4pe2lmKDE9PT1uLm5vZGVUeXBlJiYic3RyaW5nIj09dHlwZW9mIG4udGFnTmFtZSYmbi50YWdOYW1lLnRvTG93ZXJDYXNlKCk9PT1lLnRvTG93ZXJDYXNlKCkmJmFHVE0uZi5lbExzdChuLHQsYSksMT09PW4ubm9kZVR5cGUmJm4ucXVlcnlTZWxlY3RvckFsbCl7dmFyIG89bi5xdWVyeVNlbGVjdG9yQWxsKGUudG9Mb3dlckNhc2UoKSk7QXJyYXkucHJvdG90eXBlLmZvckVhY2guY2FsbChvLGZ1bmN0aW9uKGUpe2FHVE0uZi5lbExzdChlLHQsYSl9KX19KX0pfSkub2JzZXJ2ZShkb2N1bWVudC5ib2R5LHtjaGlsZExpc3Q6ITAsc3VidHJlZTohMCxhdHRyaWJ1dGVzOiExfSl9fSxhR1RNLmYuclRlc3Q9ZnVuY3Rpb24oZSx0KXtyZXR1cm4gYUdUTS5mLnZTdChbZSx0XSkmJm5ldyBSZWdFeHAodCwiaSIpLnRlc3QoZSl9LGFHVE0uZi5yTWF0Y2g9ZnVuY3Rpb24oZSx0KXtyZXR1cm4gZS5tYXRjaChuZXcgUmVnRXhwKHQpKX0sYUdUTS5mLnJSZXBsYWNlPWZ1bmN0aW9uKGUsdCxhKXtyZXR1cm4gYUdUTS5mLnZTdChbZSx0LGFdKT9lLnJlcGxhY2UobmV3IFJlZ0V4cCh0LCJnaSIpLGEpOmV9LGFHVE0uZi5pc0lGcmFtZT1mdW5jdGlvbigpe3JldHVybiB3aW5kb3cuc2VsZiE9PXdpbmRvdy50b3B9LGFHVE0uZi5qc2Vycm9ycz1mdW5jdGlvbigpe2FHVE0uZi5ldkxzdG4od2luZG93LCJlcnJvciIsZnVuY3Rpb24oZSl7aWYobnVsbCE9PWUpe3ZhciB0PSJzdHJpbmciPT10eXBlb2YgZS5tZXNzYWdlP2UubWVzc2FnZToiIixhPSJzdHJpbmciPT10eXBlb2YgZS5maWxlbmFtZT9lLmZpbGVuYW1lOiIiO2lmKCJzY3JpcHQgZXJyb3IuIj09dC50b0xvd2VyQ2FzZSgpKXtpZighYSlyZXR1cm47dD10LnJlcGxhY2UoIi4iLCI6IikrIiBlcnJvciBmcm9tIG90aGVyIGRvbWFpbi4ifWEmJih0Kz0iIHwgZmlsZTogIithKTt2YXIgbj1hR1RNLmYuc3RyY2xlYW4oZS5saW5lbm8pOyIwIj09biYmKG49IiIpLG4mJih0Kz0iIHwgbGluZTogIituKTt2YXIgbz1hR1RNLmYuc3RyY2xlYW4oZS5jb2xubyk7IjAiPT1vJiYobz0iIiksbyYmKHQrPSIgfCBjb2w6ICIrbyksYUdUTS5kLmVycm9ycy5wdXNoKHQpO3ZhciByPSIiO3RyeXtyPW5hdmlnYXRvci5hcHBDb2RlTmFtZSsiIHwgIituYXZpZ2F0b3IuYXBwTmFtZSsiIHwgIituYXZpZ2F0b3IuYXBwVmVyc2lvbisiIHwgIituYXZpZ2F0b3IucGxhdGZvcm19Y2F0Y2goZSl7fWlmKGFHVE0uZC5lcnJvcl9jb3VudGVyKys+PTEwMClyZXR1cm47YUdUTS5kLmVycm9yX2NvdW50ZXI8PTUmJmFHVE0uZi5maXJlKHtldmVudDoiZXhjZXB0aW9uIixlcnJtc2c6dCxicm93c2VyOnIsZXJydHlwZToiSlMgRXJyb3IiLHRpbWVzdGFtcDoobmV3IERhdGUpLmdldFRpbWUoKSxlcnJjdDphR1RNLmQuZXJyb3JfY291bnRlcixldmVudE1vZGVsOm51bGx9KX19KX0sYUdUTS5mLnRpbWVyZmt0PWZ1bmN0aW9uKGUpe3ZhciB0PUpTT04ucGFyc2UoYUdUTS5mLnNTdHJmKGUpKTt0LnRpbWVyX21zPTEqdC50aW1lcl9tcyx0LnRpbWVyX2N0KyssdC50aW1lcl90bT10LnRpbWVyX21zKnQudGltZXJfY3QsdC50aW1lcl9zYz1wYXJzZUZsb2F0KCh0LnRpbWVyX3RtLzFlMykudG9GaXhlZCgzKSksdC5ldmVudD10LmV2ZW50fHwidGltZXIiLC0xIT09dC5ldmVudC5pbmRleE9mKCJbc10iKSYmKHQuZXZlbnQ9dC5ldmVudC5yZXBsYWNlKCJbc10iLHQudGltZXJfc2MudG9TdHJpbmcoKSkpLHQuZXZlbnRNb2RlbD1udWxsLGFHVE0uZi5maXJlKHQpfSxhR1RNLmYudGltZXI9ZnVuY3Rpb24oZSx0LGEsbixvKXtpZighZSYmIm9iamVjdCI9PXR5cGVvZiBhJiZhJiYic3RyaW5nIj09dHlwZW9mIGEuZXZlbnQmJihlPWEuZXZlbnQpLGU9ZXx8InRpbWVyIixlKz0iXyIrKG5ldyBEYXRlKS5nZXRUaW1lKCkudG9TdHJpbmcoKSsiXyIrTWF0aC5mbG9vcig5OTk5OTkqTWF0aC5yYW5kb20oKSsxKS50b1N0cmluZygpLGFHVE0uZi5zdG9wdGltZXIoZSksIm9iamVjdCI9PXR5cGVvZiBhJiZhKXZhciByPUpTT04ucGFyc2UoYUdUTS5mLnNTdHJmKGEpKTtlbHNlIHI9e307ci50aW1lcl9ubT1lLHIudGltZXJfbXM9bixyLnRpbWVyX3JwPW8sci50aW1lcl9jdD0wLHIuaWQ9MT09PXIudGltZXJfcnA/c2V0VGltZW91dChmdW5jdGlvbigpe3Q/dChyKTphR1RNLmYudGltZXJma3Qocil9LG4pOnNldEludGVydmFsKGZ1bmN0aW9uKCl7dD90KHIpOmFHVE0uZi50aW1lcmZrdChyKSxyLnRpbWVyX2N0Kyssci50aW1lcl9ycD4wJiZyLnRpbWVyX2N0Pj1yLnRpbWVyX3JwJiZhR1RNLmYuc3RvcHRpbWVyKHIudGltZXJfbm0pfSxuKSxhR1RNLmQudGltZXJbZV09cn0sYUdUTS5mLnN0b3B0aW1lcj1mdW5jdGlvbihlKXtpZigib2JqZWN0IiE9dHlwZW9mIGFHVE0uZC50aW1lciYmKGFHVE0uZC50aW1lcj17fSksIm9iamVjdCI9PXR5cGVvZiBhR1RNLmQudGltZXJbZV0pe3ZhciB0PWFHVE0uZC50aW1lcltlXTsxPT09dC50aW1lcl9ycD9jbGVhclRpbWVvdXQodC5pZCk6Y2xlYXJJbnRlcnZhbCh0LmlkKSxkZWxldGUgYUdUTS5kLnRpbWVyW2VdfX0sYUdUTS5mLmRscmVwZWF0PWZ1bmN0aW9uKGUpe2lmKCJvYmplY3QiPT10eXBlb2YgZSYmZSYmIWFHVE0uZC5kbHJlcGVhdERvbmUpe3ZhciBkYmc9ZnVuY3Rpb24odCxhKXtlLmRlYnVnJiYib2JqZWN0Ij09dHlwZW9mIHdpbmRvdy5jb25zb2xlJiZ3aW5kb3cuY29uc29sZS5sb2cmJndpbmRvdy5jb25zb2xlLmxvZygiYUdUTSBkbHJlcGVhdDogIit0LGEpfSxnZXRTcmM9ZnVuY3Rpb24oKXtyZXR1cm4ibGl2ZSI9PWUuc291cmNlP3dpbmRvd1thR1RNLmMuZ2RsXXx8W106ImRsIj09ZS5zb3VyY2U/YUdUTS5kLmRsfHxbXTphR1RNLmQuZnx8W119LG1hdGNoTGlzdD1mdW5jdGlvbihlLHQpe2Zvcih2YXIgYT1lLnNwbGl0KCIsIiksbj0wO248YS5sZW5ndGg7bisrKXt2YXIgbz1hW25dLnJlcGxhY2UoL15ccyt8XHMrJC9nLCIiKTtpZihvKXt2YXIgcj1vLnJlcGxhY2UoL1suKis/XiR7fSgpfFtcXVxcXS9nLCJcXCQmIikucmVwbGFjZSgvXFxcKi9nLCIuKiIpO3RyeXtpZihuZXcgUmVnRXhwKCJeIityKyIkIiwiaSIpLnRlc3QodCkpcmV0dXJuITB9Y2F0Y2goZSl7fX19cmV0dXJuITF9LHBhcnNlQ29uZD1mdW5jdGlvbihlKXtpZighZSlyZXR1cm4gbnVsbDt2YXIgdD1lLmluZGV4T2YoIlsiKTtpZih0PDApcmV0dXJue2V2OmUsYXR0cjpudWxsLHZhbDpudWxsfTt2YXIgYT1lLmluZGV4T2YoIl0iKTtpZihhPHR8fCFlLnN1YnN0cmluZygwLHQpKXJldHVybiBudWxsO2lmKGErMSE9PWUubGVuZ3RoKXJldHVybiBudWxsO3ZhciBuPWUuc3Vic3RyaW5nKHQrMSxhKSxvPW4uaW5kZXhPZigiOiIpLHI9bz49MD9uLnN1YnN0cmluZygwLG8pOm47cmV0dXJuIHI/e2V2OmUuc3Vic3RyaW5nKDAsdCksYXR0cjpyLHZhbDpvPj0wP24uc3Vic3RyaW5nKG8rMSk6bnVsbH06bnVsbH0sdHJpbT1mdW5jdGlvbihlKXtyZXR1cm4gZS5yZXBsYWNlKC9eXHMrfFxzKyQvZywiIil9LHQ9W107aWYoZS5nYXRlRXZlbnRzKWZvcih2YXIgYT1lLmdhdGVFdmVudHMuc3BsaXQoIiwiKSxuPTA7bjxhLmxlbmd0aDtuKyspe3ZhciBvPXRyaW0oYVtuXSk7aWYobyl7dmFyIHI9by5pbmRleE9mKCI/aWY9Iik7aWYocjwwKXQucHVzaCh7bmFtZTpvLGNvbmQ6bnVsbH0pO2Vsc2V7dmFyIHM9dHJpbShvLnN1YnN0cmluZygwLHIpKTtpZihzKXt2YXIgaT1wYXJzZUNvbmQodHJpbShvLnN1YnN0cmluZyhyKzQpKSk7aXx8ZGJnKCJpbnZhbGlkID9pZj0gcHJlZGljYXRlLCBnYXRlIHRyZWF0ZWQgYXMgdW5jb25kaXRpb25hbDogIitvKSx0LnB1c2goe25hbWU6cyxjb25kOml9KX1lbHNlIGRiZygiZ2F0ZSB0b2tlbiB3aXRoIGVtcHR5IG5hbWUgYmVmb3JlID9pZj0sIHNraXBwZWQ6ICIrbyl9fX12YXIgaGFzRXZlbnQ9ZnVuY3Rpb24oZSx0KXtmb3IodmFyIGE9MDthPGUubGVuZ3RoO2ErKylpZihlW2FdJiZlW2FdLmV2ZW50PT09dClyZXR1cm4hMDtyZXR1cm4hMX0sY29uZFN0YXRlPWZ1bmN0aW9uKGUsdCl7Zm9yKHZhciBhPSExLG49MDtuPGUubGVuZ3RoO24rKyl7dmFyIG89ZVtuXTtpZihvJiZvLmV2ZW50PT09dC5ldil7aWYoYT0hMCxudWxsPT10LmF0dHIpcmV0dXJuIDE7dmFyIHI9b1t0LmF0dHJdO2lmKG51bGw9PXQudmFsKXtpZihudWxsIT1yJiYiIiE9PXIpcmV0dXJuIDF9ZWxzZSBpZihTdHJpbmcocik9PT10LnZhbClyZXR1cm4gMX19cmV0dXJuIGE/MDotMX0sZ2F0ZVJlYWR5PWZ1bmN0aW9uKGUpe2Zvcih2YXIgYT0wO2E8dC5sZW5ndGg7YSsrKXt2YXIgbj10W2FdO2lmKG4uY29uZCl7dmFyIG89Y29uZFN0YXRlKGUsbi5jb25kKTtpZigwPT09byljb250aW51ZTtpZigtMT09PW8pcmV0dXJuITF9aWYoIWhhc0V2ZW50KGUsbi5uYW1lKSlyZXR1cm4hMX1yZXR1cm4hMH0scGFzc2VzPWZ1bmN0aW9uKHQpe2lmKCJvYmplY3QiIT10eXBlb2YgdHx8IXQpcmV0dXJuITE7aWYoITA9PT10LmFHVE1yZXBlYXRlZClyZXR1cm4hMTtpZighMD09PXQuYUdUTWRsKXtpZighZS5ndG1GaXJlZClyZXR1cm4hMX1lbHNlIGlmKCFlLmFndG1GaXJlZClyZXR1cm4hMTtyZXR1cm4oInN0cmluZyIhPXR5cGVvZiB0LmV2ZW50fHwwIT09dC5ldmVudC5pbmRleE9mKCJhR1RNIikpJiYoKCJzdHJpbmciPT10eXBlb2YgdC5ldmVudHx8InN0cmluZyIhPXR5cGVvZiB0LnR5cGV8fCJvYmplY3QiIT10eXBlb2YgdC5mbGFnc3x8IXQuZmxhZ3N8fCF0LmZsYWdzLmVuYWJsZVVudGFnZ2VkUGFnZVJlcG9ydGluZykmJighKCFlLmd0bUV2ZW50cyYmInN0cmluZyI9PXR5cGVvZiB0LmV2ZW50JiYvXmd0bVwuKHN0YXJ0fGluaXRfY29uc2VudHxpbml0fGpzfGRvbXxsb2FkKSQvaS50ZXN0KHQuZXZlbnQpKSYmKCEoZS53aGl0ZWxpc3QmJiJzdHJpbmciPT10eXBlb2YgdC5ldmVudCYmIW1hdGNoTGlzdChlLndoaXRlbGlzdCx0LmV2ZW50KSkmJigoIWUuYmxhY2tsaXN0fHwic3RyaW5nIiE9dHlwZW9mIHQuZXZlbnR8fCFtYXRjaExpc3QoZS5ibGFja2xpc3QsdC5ldmVudCkpJiYhKCFlLm1lc3NhZ2VzJiYic3RyaW5nIiE9dHlwZW9mIHQuZXZlbnQpKSkpKX0sZG9SZXBsYXk9ZnVuY3Rpb24oYSl7YUdUTS5kLmRscmVwZWF0RG9uZT0hMDtmb3IodmFyIG49Z2V0U3JjKCksbz1uJiYibnVtYmVyIj09dHlwZW9mIG4ubGVuZ3RoP24ubGVuZ3RoOjAscj0ib2JqZWN0Ij09dHlwZW9mIGFHVE0uZC5jb25zZW50JiZhR1RNLmQuY29uc2VudCYmYUdUTS5kLmNvbnNlbnQuZ3RtQ29uc2VudCxzPTAsaT1lLm1heEV2ZW50c3x8MCxjPTAsVD0wO1Q8bztUKyspaWYocGFzc2VzKG5bVF0pKXtpZihpJiZzPj1pKWJyZWFrO3MrKzt2YXIgTT1KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihuW1RdKSk7aWYoZS5jbGVhckVjb20mJnImJnZvaWQgMCE9PU0uZWNvbW1lcmNlJiZhR1RNLmYuZmlyZSh7ZWNvbW1lcmNlOm51bGwsYUdUTXJlcGVhdGVkOiEwfSksZGVsZXRlIE0uYUdUTXRzLGRlbGV0ZSBNLmFHVE1wYXJhbXMsZGVsZXRlIE0uZXZlbnRNb2RlbCxkZWxldGUgTVsiZ3RtLnVuaXF1ZUV2ZW50SWQiXSxNLmFHVE1yZXBlYXRlZD0hMCxlLmFkZHBhcmFtZXRlciYmZS5hZGRwYXJhbWV0ZXIubGVuZ3RoKWZvcih2YXIgZD0wO2Q8ZS5hZGRwYXJhbWV0ZXIubGVuZ3RoO2QrKyllLmFkZHBhcmFtZXRlcltkXSYmZS5hZGRwYXJhbWV0ZXJbZF0ucGtleSYmKE1bZS5hZGRwYXJhbWV0ZXJbZF0ucGtleV09ZS5hZGRwYXJhbWV0ZXJbZF0ucHZhbHVlKTthR1RNLmYuZmlyZShNKSxjKyt9dmFyIEc9YT8iIjpmdW5jdGlvbihlKXtmb3IodmFyIGE9W10sbj0wO248dC5sZW5ndGg7bisrKXt2YXIgbz10W25dO2lmKG8uY29uZCl7dmFyIHI9Y29uZFN0YXRlKGUsby5jb25kKTtpZigwPT09ciljb250aW51ZTtpZigtMT09PXIpe2EucHVzaChvLmNvbmQuZXYpO2NvbnRpbnVlfX1oYXNFdmVudChlLG8ubmFtZSl8fGEucHVzaChvLm5hbWUpfXJldHVybiBhfShuKS5qb2luKCIsIik7IWEmJmUuZmFsbGJhY2tFdmVudCYmYz4wJiZhR1RNLmYuZmlyZSh7ZXZlbnQ6ImFHVE1fcmVwZWF0X2ZhbGxiYWNrIixhR1RNcmVwZWF0Q291bnQ6YyxhR1RNcmVwZWF0U291cmNlOmUuc291cmNlLGFHVE1yZXBlYXRNaXNzaW5nOkcsYUdUTXJlcGVhdFdhaXRlZDpmfSksZGJnKCJyZXBsYXllZCAiK2MrIiBldmVudChzKSwgZW5yaWNoZWQ9IisoYT8ieWVzIjoibm8oZmFsbGJhY2spIikrKGE/IiI6IiwgbWlzc2luZz0iK0cpKX07aWYoZGJnKCJzdGFydCIsZSksIWFHVE0uZC5kbHJlcGVhdFBvbGxpbmcpaWYoZ2F0ZVJlYWR5KGdldFNyYygpKSlkb1JlcGxheSghMCk7ZWxzZXthR1RNLmQuZGxyZXBlYXRQb2xsaW5nPSEwO3ZhciBjPSJudW1iZXIiPT10eXBlb2YgZS5wb2xsTXMmJmUucG9sbE1zPj01MD9lLnBvbGxNczozMDAsZj0ibnVtYmVyIj09dHlwZW9mIGUudGltZW91dE1zJiZlLnRpbWVvdXRNcz4wP2UudGltZW91dE1zOjAsVD1mPjA/ZjozZTQsTT0wLGQ9c2V0SW50ZXJ2YWwoZnVuY3Rpb24oKXtpZihhR1RNLmQuZGxyZXBlYXREb25lKWNsZWFySW50ZXJ2YWwoZCk7ZWxzZXtpZihnYXRlUmVhZHkoZ2V0U3JjKCkpKXJldHVybiBjbGVhckludGVydmFsKGQpLHZvaWQgZG9SZXBsYXkoITApOyhNKz1jKT49VCYmKGNsZWFySW50ZXJ2YWwoZCksZj4wP2RvUmVwbGF5KCExKTooYUdUTS5kLmRscmVwZWF0UG9sbGluZz0hMSxkYmcoImdhdGUgbmV2ZXIgc2F0aXNmaWVkIHdpdGhpbiBjYXAgYW5kIG5vIGZhbGxiYWNrIC0gbm90aGluZyByZXBlYXRlZDsgcG9sbGluZyByZWxlYXNlZCBmb3IgYSBsYXRlciBjYWxsIikpKX19LGMpfX19LGFHVE0uZi5pbml0PWZ1bmN0aW9uKCl7IWFHVE0uYy5kZWJ1ZyYmYUdUTS5mLm9wdG91dCgpfHwoYUdUTS5mLmNvbmZpZyhhR1RNLmMpLGFHVE0uYy5pZnJhbWVTdXBwb3J0JiZhR1RNLmQuaXNfaWZyYW1lPyhhR1RNLmQuY29uc2VudC5ndG1Db25zZW50PSEwLGFHVE0uZC5jb25zZW50Lmhhc1Jlc3BvbnNlPSEwLGFHVE0uZC5jb25zZW50LmZlZWRiYWNrPSJQYWdlIGlzIGlGcmFtZSIsYUdUTS5kLmlmcmFtZS5pZkxpc3Rlbnx8KGFHVE0uZC5pZnJhbWUuaWZMaXN0ZW49ITAsd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoIm1lc3NhZ2UiLGFHVE0uZi5pZkhTbGlzdGVuKSksYUdUTS5kLmluaXR8fGFHVE0uZi5pbmplY3QoKSk6InN0cmluZyI9PXR5cGVvZiBhR1RNLmMuY21wJiZhR1RNLmMuY21wPyJub25lIj09YUdUTS5jLmNtcD8oYUdUTS5kLmNvbnNlbnQ9e2d0bUNvbnNlbnQ6ITAsaGFzUmVzcG9uc2U6ITAsZmVlZGJhY2s6Ik5vIENvbnNlbnQgQ2hlY2sgY29uZmlndXJlZCJ9LGFHVE0uZi5pbmplY3QoKSk6KGFHVE0uZi5sb2FkX2NjKGFHVE0uYy5jbXAsYUdUTS5mLmNvbnNlbnRfbGlzdGVuZXIpLGFHVE0uZi5pbml0R1RNKCEwKSk6KGFHVE0uZi5jb25zZW50X2xpc3RlbmVyKCksYUdUTS5mLmluaXRHVE0oITApKSxhR1RNLmYuanNlcnJvcnMoKSl9LGFHVE0uZi5lbmM9ZnVuY3Rpb24oZSx0KXt2YXIgYT10JTYzKzEsbj1idG9hKHVuZXNjYXBlKGVuY29kZVVSSUNvbXBvbmVudChlKSkpLG89MDsiPSI9PT1uLmNoYXJBdChuLmxlbmd0aC0xKSYmbysrLCI9Ij09PW4uY2hhckF0KG4ubGVuZ3RoLTIpJiZvKyssbj1uLnNsaWNlKDAsbi5sZW5ndGgtbyk7Zm9yKHZhciByPTE9PT1vPyJ+IjoyPT09bz8ifn4iOiIiLHM9IiIsaT0wO2k8bi5sZW5ndGg7aSsrKXt2YXIgYz0iQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ejAxMjM0NTY3ODkrLyIuaW5kZXhPZihuLmNoYXJBdChpKSk7cys9YzwwP24uY2hhckF0KGkpOiJBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWmFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6MDEyMzQ1Njc4OS1fIi5jaGFyQXQoKGMrYSklNjQpfXJldHVybiBvP3Muc2xpY2UoMCwzKStyK3Muc2xpY2UoMyk6c30sYUdUTS5mLnhzZW5kPWZ1bmN0aW9uKGUsdCxhLG4pe2lmKGUmJiJzdHJpbmciPT10eXBlb2YgZSl0cnl7dmFyIG8scj1uZXcgWE1MSHR0cFJlcXVlc3Q7cmV0dXJuIHIub3BlbigiUE9TVCIsZSwhMCksci5zZXRSZXF1ZXN0SGVhZGVyKCJDb250ZW50LVR5cGUiLCJhcHBsaWNhdGlvbi9qc29uIiksbz1hJiYibnVtYmVyIj09dHlwZW9mIG4mJm4+PTE/J3sicSI6IicrYUdUTS5mLmVuYyhhR1RNLmYuc1N0cmYodCksbikrJyJ9JzoneyJlIjonK2FHVE0uZi5zU3RyZih0KSsifSIsci5zZW5kKG8pLHJ9Y2F0Y2godCl7cmV0dXJuIGFHVE0uZi5sb2coImVfeHNlbmQiLHttc2c6dC5tZXNzYWdlLHVybDplfSksbnVsbH19LGFHVE0uZi5zZW5kbmF1cz1mdW5jdGlvbihlKXtpZihlJiYib2JqZWN0Ij09dHlwZW9mIGUpe3ZhciB0PXdpbmRvd1thR1RNLmMuZ2RsXS5wdXNoOyFhR1RNLmQub3JpZ2luYWxETHB1c2gmJi9zYW5kYm94L2kudGVzdCh0LnRvU3RyaW5nKCkpJiYoYUdUTS5kLm9yaWdpbmFsRExwdXNoPXQpO3ZhciBhPSExO2lmKGFHVE0uYy5kbE9yZ1B1c2gmJmFHVE0uZC5vcmlnaW5hbERMcHVzaCYmYUdUTS5kLm9yaWdpbmFsRExwdXNoIT09dCl7dmFyIG49dC50b1N0cmluZygpOy9zYW5kYm94L2kudGVzdChuKT9hR1RNLmQub3JpZ2luYWxETHB1c2g9dDooYT0hMCxhR1RNLmQuZGxIb29rTG9nZ2VkfHwoYUdUTS5kLm9yaWdpbmFsRExwdXNoKHtldmVudDoiZXhjZXB0aW9uIixlcnJ0eXBlOiJETCBFcnJvciIsZXJybXNnOiJGdW5jdGlvbiBkYXRhTGF5ZXIucHVzaCBob29rZWQgLSBubyBsb25nZXIgZnJvbSBHVE0iLGZjdF9ob29rOm4sZmN0X29yaWc6YUdUTS5kLm9yaWdpbmFsRExwdXNoLnRvU3RyaW5nKCksdGltZXN0YW1wOihuZXcgRGF0ZSkuZ2V0VGltZSgpLGV2ZW50TW9kZWw6bnVsbH0pLGFHVE0uZC5kbEhvb2tMb2dnZWQ9ITApLCJyZXN0b3JlIj09PWFHVE0uYy5kbE9yZ1B1c2gmJih3aW5kb3dbYUdUTS5jLmdkbF0ucHVzaD1hR1RNLmQub3JpZ2luYWxETHB1c2gsYT0hMSkpfWEmJiJ1c2UiPT09YUdUTS5jLmRsT3JnUHVzaD9hR1RNLmQub3JpZ2luYWxETHB1c2goZSk6d2luZG93W2FHVE0uYy5nZGxdLnB1c2goZSksImZ1bmN0aW9uIj09dHlwZW9mIGFHVE0uZi5zZW5kbmF1c19jYWxsYmFjayYmYUdUTS5mLnNlbmRuYXVzX2NhbGxiYWNrKGUpLGFHVE0uZi5sb2coIm05IixlKX19LGFHVE0uZi5maXJlPWZ1bmN0aW9uKGUpe2lmKCJvYmplY3QiPT10eXBlb2YgZSYmZSl7dHJ5e2lmKCEoYT1KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihlKSkpKXJldHVybiB2b2lkIGFHVE0uZi5sb2coImUxNSIsYSl9Y2F0Y2gobil7dmFyIHQ9ImFHVE0gRmlyZSBFcnJvciAoSlNPTi5wYXJzZSkiOyJzdHJpbmciPT10eXBlb2YgZS5ldmVudCYmKHQ9dCsiIChFdmVudDogIitlLmV2ZW50KyIpIik7dmFyIGE9e2V2ZW50OiJleGNlcHRpb24iLGVycm1zZzpuLm1lc3NhZ2UsZXJydHlwZTp0LHRpbWVzdGFtcDoobmV3IERhdGUpLmdldFRpbWUoKSxlcnJjdDphR1RNLmQuZXJyb3JfY291bnRlcnx8MSxldmVudE1vZGVsOm51bGx9O2FHVE0uZi5sb2coImUxNSIsYSl9aWYoISgibnVtYmVyIj09dHlwZW9mIGEuYUdUTXRzfHwib2JqZWN0Ij09dHlwZW9mIGEuZXZlbnRNb2RlbCYmYS5ldmVudE1vZGVsfHwic3RyaW5nIiE9dHlwZW9mIGEuZXZlbnQmJiJzdHJpbmciPT10eXBlb2YgYS50eXBlJiYib2JqZWN0Ij09dHlwZW9mIGEuZmxhZ3MmJiJib29sZWFuIj09dHlwZW9mIGEuZmxhZ3MuZW5hYmxlVW50YWdnZWRQYWdlUmVwb3J0aW5nJiZhLmZsYWdzLmVuYWJsZVVudGFnZ2VkUGFnZVJlcG9ydGluZykpe2lmKGEuYUdUTXRzPURhdGUubm93KCksYS5ldmVudE1vZGVsPW51bGwsYUdUTS5jLmNvbnNlbnRfZXZlbnRzJiYic3RyaW5nIj09dHlwZW9mIGEuZXZlbnQmJigiLCIrYUdUTS5jLmNvbnNlbnRfZXZlbnRzKyIsIikuaW5kZXhPZigiLCIrYS5ldmVudCsiLCIpPj0wKWlmKCJvYmplY3QiPT10eXBlb2YgYUdUTS5jLmNvbnNlbnRfZXZlbnRfYXR0clthLmV2ZW50XSlmb3IodmFyIG4gaW4gYUdUTS5jLmNvbnNlbnRfZXZlbnRfYXR0clthLmV2ZW50XSl2b2lkIDAhPT1hW25dJiYoYUdUTS5jLmNvbnNlbnRfZXZlbnRfYXR0clthLmV2ZW50XVtuXSYmYVtuXSE9YUdUTS5jLmNvbnNlbnRfZXZlbnRfYXR0clthLmV2ZW50XVtuXXx8YUdUTS5mLnJ1bl9jYygidXBkYXRlIikpO2Vsc2UgYUdUTS5mLnJ1bl9jYygidXBkYXRlIik7aWYoYUdUTS5jLmRsU2V0JiYib2JqZWN0Ij09dHlwZW9mIGdvb2dsZV90YWdfbWFuYWdlciYmIm9iamVjdCI9PXR5cGVvZiBnb29nbGVfdGFnX21hbmFnZXJbYUdUTS5jLmd0bUlEXSYmT2JqZWN0LmtleXMoYUdUTS5jLmRsU2V0KS5mb3JFYWNoKGZ1bmN0aW9uKGUpe3ZhciB0PWFHVE0uYy5kbFNldFtlXSxuPWdvb2dsZV90YWdfbWFuYWdlclthR1RNLmMuZ3RtSURdW2FHVE0uYy5nZGxdLmdldCh0KTt2b2lkIDAhPT1uJiYoYVtlXT1uKX0pLCgib2JqZWN0IiE9dHlwZW9mIGFHVE0uZC5jb25zZW50fHwhYUdUTS5kLmNvbnNlbnQuaGFzUmVzcG9uc2V8fCFhR1RNLmQuY29uc2VudC5ndG1Db25zZW50KSYmKCJzdHJpbmciIT10eXBlb2YgYS5ldmVudHx8MCE9PWEuZXZlbnQuaW5kZXhPZigiYUdUTSIpKSYmIWEuX25vQ29uc2VudHx8YUdUTS5jLmlmcmFtZVN1cHBvcnQmJmFHVE0uZC5pc19pZnJhbWUmJiFhR1RNLmQuaWZyYW1lLm9yaWdpbilyZXR1cm4gZGVsZXRlIGEuYUdUTXRzLGRlbGV0ZSBhLmV2ZW50TW9kZWwsdm9pZCBhR1RNLmQuZi5wdXNoKEpTT04ucGFyc2UoYUdUTS5mLnNTdHJmKGEpKSk7aWYoYS5fcG9zdCYmIWEuX3Bvc3Rfc2VudCl7dmFyIG89Im9iamVjdCI9PXR5cGVvZiBhLl9wb3N0P2EuX3Bvc3Q6e30scj0ic3RyaW5nIj09dHlwZW9mIG8udXJsJiZvLnVybD9vLnVybDphR1RNLmMudHJhbnNwb3J0X3VybDtpZihyKXt2YXIgcz0iYm9vbGVhbiI9PXR5cGVvZiBvLmVuYz9vLmVuYzohIWFHVE0uYy50cmFuc3BvcnRfZW5jLGk9Im51bWJlciI9PXR5cGVvZiBvLnNhbHQmJm8uc2FsdD49MT9vLnNhbHQ6Im51bWJlciI9PXR5cGVvZiBhR1RNLmMudHJhbnNwb3J0X3NhbHQmJmFHVE0uYy50cmFuc3BvcnRfc2FsdD49MT9hR1RNLmMudHJhbnNwb3J0X3NhbHQ6YUdUTS5jLnNlc3Npb25fc2FsdHx8MCxjPUpTT04ucGFyc2UoYUdUTS5mLnNTdHJmKGEpKTtkZWxldGUgYy5fcG9zdCxkZWxldGUgYy5fcG9zdF9zZW50LGRlbGV0ZSBjLmV2ZW50TW9kZWwsby5jb25zZW50JiYib2JqZWN0Ij09dHlwZW9mIGFHVE0uZC5jb25zZW50JiYoYy5jb25zZW50PUpTT04ucGFyc2UoYUdUTS5mLnNTdHJmKGFHVE0uZC5jb25zZW50KSkpLGFHVE0uZi54c2VuZChyLGMscyxpKSxhLl9wb3N0X3NlbnQ9ITB9fShhR1RNLmQuY29uc2VudC5ndG1Db25zZW50fHwic3RyaW5nIj09dHlwZW9mIGEuZXZlbnQmJjA9PT1hLmV2ZW50LmluZGV4T2YoImFHVE0iKXx8YS5fbm9Db25zZW50KSYmKCJzdHJpbmciPT10eXBlb2YgYS5ldmVudCYmMD09PWEuZXZlbnQuaW5kZXhPZigiYUdUTSIpfHwoZGVsZXRlIGFbImd0bS51bmlxdWVFdmVudElkIl0sZGVsZXRlIGEuYUdUTXBhcmFtcyxhLmFHVE1wYXJhbXM9SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYoYSkpKSxhR1RNLmQuZGwucHVzaChhKSxhLl9ub0RMUHVzaD8iZnVuY3Rpb24iPT10eXBlb2YgYUdUTS5mLnNlbmRuYXVzX2NhbGxiYWNrJiZhR1RNLmYuc2VuZG5hdXNfY2FsbGJhY2soYSk6YUdUTS5jLmlmcmFtZVN1cHBvcnQmJmFHVE0uZC5pc19pZnJhbWUmJiJzdHJpbmciPT10eXBlb2YgYS5ldmVudD9hR1RNLmYuaUZyYW1lRmlyZShhKTphR1RNLmYuc2VuZG5hdXMoYSkpLCJmdW5jdGlvbiI9PXR5cGVvZiBhR1RNLmYuZmlyZV9jYWxsYmFjayYmYUdUTS5mLmZpcmVfY2FsbGJhY2soYSksYUdUTS5mLmxvZygibTciLGEpfX1lbHNlIGFHVE0uZi5sb2coImU5Iix7bzp0eXBlb2YgZX0pfTs=');
  const origin = getRequestHeader('origin') || '';
  // Pre-aGTM Init Script: prepended verbatim before the library. User code
  // is wrapped in an IIFE inside try/catch so a runtime error does not
  // abort the rest of the /aGTM.js response. Note: a SYNTAX error in user
  // code still aborts parsing — try/catch only catches runtime throws.
  // Leading "\n" inside the IIFE protects against trailing line comments
  // in user code; trailing ";\n" closes any open expression cleanly.
  const preInit = (CFG.preInitEnabled && CFG.preInitCode) ? 'try{(function(){\n' + CFG.preInitCode + '\n;})();}catch(e){if(typeof console!=="undefined"&&console.error)console.error("[aGTM preInit]",e);}\n' : '';
  const jsCode = preInit + agtm + cmp + config + 'aGTM.f.init();';

  setResponseStatus(200);
  if (origin) {
    setResponseHeader('Access-Control-Allow-Origin', origin);
    setResponseHeader('Access-Control-Allow-Credentials', 'true');
  }
  setResponseHeader('Content-Type', 'application/javascript');
  setResponseBody(jsCode);
  returnResponse();
};
