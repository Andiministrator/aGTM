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
  const agtm = fromBase64('d2luZG93LmFHVE09d2luZG93LmFHVE18fHt9LHdpbmRvdy5hR1RNLmM9d2luZG93LmFHVE0uY3x8e30sd2luZG93LmFHVE0uZD13aW5kb3cuYUdUTS5kfHx7fSx3aW5kb3cuYUdUTS5mPXdpbmRvdy5hR1RNLmZ8fHt9LHdpbmRvdy5hR1RNLmw9d2luZG93LmFHVE0ubHx8W10sd2luZG93LmFHVE0ubj13aW5kb3cuYUdUTS5ufHx7fSxhR1RNLmYucHJvcHNldD1mdW5jdGlvbihlLHQsYSl7dHJ5e2VbdF09ZVt0XXx8YX1jYXRjaChlKXt9fSxhR1RNLmYub2JqaW5pdD1mdW5jdGlvbigpe1tbYUdUTS5kLCJ2ZXJzaW9uIiwiMS41Il0sW2FHVE0uZCwiZiIsW11dLFthR1RNLmQsImNvbmZpZyIsITFdLFthR1RNLmQsImluaXQiLCExXSxbYUdUTS5kLCJkb21fcmVhZHkiLCExXSxbYUdUTS5kLCJwYWdlX3JlYWR5IiwhMV0sW2FHVE0uZCwiaXNfaWZyYW1lIix3aW5kb3cuc2VsZiE9PXdpbmRvdy50b3BdLFthR1RNLmQsImV2X2ZjdF9jdHIiLDBdLFthR1RNLmQsInRpbWVyIix7fV0sW2FHVE0uZCwiZXJyb3JfY291bnRlciIsMF0sW2FHVE0uZCwiZXJyb3JzIixbXV0sW2FHVE0uZCwiZGwiLFtdXSxbYUdUTS5kLCJzZXNzaW9uIix7fV0sW2FHVE0uZCwic2Vzc2lvbl9zdGF0dXMiLCIiXSxbYUdUTS5kLCJjb25zZW50X2hhc2giLCIiXSxbYUdUTS5kLCJsYXN0X2NvbnNlbnRfaGFzaCIsIiJdLFthR1RNLmQsImF0dHJpYnV0aW9uIix7fV0sW2FHVE0uZCwiaWZyYW1lIix7Y291bnRlcjp7ZXZlbnRzOjB9LG9yaWdpbjoiIixpZkxpc3RlbjohMSx0b3BMaXN0ZW46ITEsaGFuZHNoYWtlOiExLHRpbWVyOm51bGx9XSxbYUdUTS5kLCJsYXN0X3VybCIsbG9jYXRpb24uaHJlZl0sW2FHVE0uZCwidXJsTGlzdGVuZXJfYWN0aXZlIiwhMV0sW2FHVE0uZCwicGFzc2l2ZV9zdXBwb3J0ZWQiLG51bGxdLFthR1RNLmYsInRsIix7fV0sW2FHVE0uZiwiZGwiLHt9XSxbYUdUTS5mLCJwbCIse31dLFthR1RNLCJsIixbXV0sW2FHVE0ubiwiY2siLCJjb29raWUiXSxbYUdUTS5uLCJ0bSIsImdvb2dsZXRhZ21hbmFnZXIiXSxbYUdUTS5uLCJ0YSIsInRhZ2Fzc2lzdGFudC5nb29nbGUiXV0uZm9yRWFjaChmdW5jdGlvbihlKXthR1RNLmYucHJvcHNldChlWzBdLGVbMV0sZVsyXSl9KX0sYUdUTS5mLm9iamluaXQoKSxhR1RNLmYubG9nPWZ1bmN0aW9uKGUsdCl7dmFyIGE9Im9iamVjdCI9PXR5cGVvZiB0JiZ0P0pTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkodCkpOnQ7YUdUTS5sLnB1c2goe2lkOmUsdGltZXN0YW1wOihuZXcgRGF0ZSkuZ2V0VGltZSgpLG9iajphfSl9LGFHVE0uZi5zdHJjbGVhbj1mdW5jdGlvbihlKXtyZXR1cm4gdm9pZCAwPT09ZXx8Im9iamVjdCI9PXR5cGVvZiBlJiYhZT8iIjooInN0cmluZyIhPXR5cGVvZiBlJiYoZT1lLnRvU3RyaW5nKCkpLGUucmVwbGFjZSgvW15hLXrDpMO2w7zDn0EtWsOEw5bDnDAtOV8tXS9nLCIiKSl9LGFHVE0uZi5zU3RyZj1mdW5jdGlvbihlKXtpZigib2JqZWN0IiE9dHlwZW9mIGV8fCFlKXt2YXIgdD1KU09OLnN0cmluZ2lmeSh7ZXZlbnQ6ImV4Y2VwdGlvbiIsZXJybXNnOiJEYXRhTGF5ZXIgRW50cnkgaXMgbm8gb2JqZWN0IixlcnJ0eXBlOiJETCBFcnJvciIsb2JqX3R5cGU6dHlwZW9mIGUsb2JqX3ZhbHVlOmV9KTtyZXR1cm4gYUdUTS5mLmxvZygiZTE2IixKU09OLnBhcnNlKHQpKSxKU09OLnN0cmluZ2lmeShudWxsKX12YXIgYT1bXTtyZXR1cm4gSlNPTi5zdHJpbmdpZnkoZSxmdW5jdGlvbihlLHQpe2lmKCJvYmplY3QiPT10eXBlb2YgdCYmbnVsbCE9PXQpe2lmKC0xIT09YS5pbmRleE9mKHQpKXJldHVybiJbQ2lyY3VsYXJdIjthLnB1c2godCl9cmV0dXJuIHR9KX0sYUdUTS5mLmFuPWZ1bmN0aW9uKGUsdCxhLG4pe2VbdF09YS5oYXNPd25Qcm9wZXJ0eSh0KT9hW3RdOm59LGFHVE0uZi5jb25zZW50X3NlcmlhbGl6ZT1mdW5jdGlvbihlKXtpZighZXx8Im9iamVjdCIhPXR5cGVvZiBlKXJldHVybiIiO3ZhciB0PXtndG1Db25zZW50OjEsYmxvY2tlZDoxfSxhPVtdO2Zvcih2YXIgbiBpbiBlKWUuaGFzT3duUHJvcGVydHkobikmJiF0W25dJiZhLnB1c2gobik7YS5zb3J0KCk7Zm9yKHZhciBvPVtdLHI9MDtyPGEubGVuZ3RoO3IrKyl7dmFyIHM9YVtyXSxpPWVbc107IiIhPT1pJiZudWxsIT1pJiZvLnB1c2gocysiPSIrKCJvYmplY3QiPT10eXBlb2YgaT9KU09OLnN0cmluZ2lmeShpKTpTdHJpbmcoaSkpKX1yZXR1cm4gby5qb2luKCJ8Iil9LGFHVE0uZi5wYXJzZVVybFBhcmFtcz1mdW5jdGlvbihlKXt2YXIgdD17fTtpZighZXx8Ij8iIT09ZS5jaGFyQXQoMCkpcmV0dXJuIHQ7Zm9yKHZhciBhPWUuc3Vic3RyaW5nKDEpLnNwbGl0KCImIiksbj0wO248YS5sZW5ndGg7bisrKXt2YXIgbz1hW25dLnNwbGl0KCI9Iik7aWYob1swXSl7dmFyIHIsczt0cnl7cj1kZWNvZGVVUklDb21wb25lbnQob1swXSl9Y2F0Y2goZSl7cj1vWzBdfWlmKG9bMV0pe3ZhciBpPW9bMV0ucmVwbGFjZSgvXCsvZywiICIpO3RyeXtzPWRlY29kZVVSSUNvbXBvbmVudChpKX1jYXRjaChlKXtzPWl9fWVsc2Ugcz0iIjt0W3JdPXN9fXJldHVybiB0fSxhR1RNLmYucmVzb2x2ZUF0dHJpYnV0aW9uPWZ1bmN0aW9uKGUpe3ZhciB0PWFHVE0uZi5wYXJzZVVybFBhcmFtcyh3aW5kb3cubG9jYXRpb24uc2VhcmNoKSxhPShhR1RNLmQuc2Vzc2lvbiYmYUdUTS5kLnNlc3Npb24uYXR0cmlidXRpb258fHt9KVtlXTthJiYib2JqZWN0Ij09dHlwZW9mIGF8fChhPXt9KTtmb3IodmFyIG49WyJnY2xpZCIsImZiY2xpZCIsIm1zY2xraWQiLCJ0dGNsaWQiLCJnYnJhaWQiLCJ3YnJhaWQiXSxvPSIiLHI9IiIscz0wO3M8bi5sZW5ndGg7cysrKXt2YXIgaT1uW3NdO2lmKHRbaV0pe289aSxyPXRbaV07YnJlYWt9fXJldHVybntzb3U6dC51dG1fc291cmNlfHxhLnNvdXx8IiIsY2FtOnQudXRtX2NhbXBhaWdufHxhLmNhbXx8IiIsbWVkOnQudXRtX21lZGl1bXx8YS5tZWR8fCIiLGNhbWlkOnQudXRtX2lkfHxhLmNhbWlkfHwiIixjbGk6cnx8YS5jbGl8fCIiLGNscDpvfHxhLmNscHx8IiIsY2xzOm8mJntnY2xpZDoiR29vZ2xlIEFkcyIsZmJjbGlkOiJNZXRhIixtc2Nsa2lkOiJNaWNyb3NvZnQgQWRzIix0dGNsaWQ6IlRpa1RvayBBZHMiLGdicmFpZDoiR29vZ2xlIEFkcyIsd2JyYWlkOiJHb29nbGUgQWRzIn1bb118fGEuY2xzfHwiIixhZnM6YS5hZnN8fCIiLHNyZTpkb2N1bWVudC5yZWZlcnJlcnx8YS5zcmV8fCIiLGxjczphLmxjc3x8IiIsZnNzOmEuZnNzfHwiIn19LGFHVE0uZi5jb25maWc9ZnVuY3Rpb24oZSl7aWYoYUdUTS5kLmNvbmZpZykiZnVuY3Rpb24iPT10eXBlb2YgYUdUTS5mLmxvZyYmYUdUTS5mLmxvZygiZTEiLGFHVE0uYyk7ZWxzZXtpZihhR1RNLmYuYW4oYUdUTS5jLCJkZWJ1ZyIsZSwhMSksYUdUTS5mLmFuKGFHVE0uYywicGF0aCIsZSwiIiksYUdUTS5mLmFuKGFHVE0uYywiZmlsZSIsZSwiYUdUTS5qcyIpLGFHVE0uZi5hbihhR1RNLmMsImNtcCIsZSwiIiksYUdUTS5jLm1pbj0iYm9vbGVhbiIhPXR5cGVvZiBlLm1pbnx8ZS5taW4sYUdUTS5mLmFuKGFHVE0uYywibm9uY2UiLGUsIiIpLGFHVE0uZi5hbihhR1RNLmMsImlmcmFtZVN1cHBvcnQiLGUsITEpLGFHVE0uZi5hbihhR1RNLmMsInZQYWdldmlld3MiLGUsITEpLGFHVE0uZi5hbihhR1RNLmMsInZQYWdldmlld3NUaW1lciIsZSwwKSxhR1RNLmYuYW4oYUdUTS5jLCJ2UGFnZXZpZXdzRmFsbGJhY2siLGUsITEpLGFHVE0uZi5hbihhR1RNLmMsImd0bUlEIixlLCIiKSxlLmd0bSlmb3IodmFyIHQgaW4gZS5ndG0pZS5ndG0uaGFzT3duUHJvcGVydHkodCkmJihhR1RNLmMuZ3RtSUQ9YUdUTS5jLmd0bUlEfHx0LGFHVE0uYy5ndG09YUdUTS5jLmd0bXx8e30sYUdUTS5jLmd0bVt0XT1lLmd0bVt0XXx8e30sYUdUTS5mLmFuKGFHVE0uYy5ndG1bdF0sIm5vQ29uc2VudCIsZS5ndG1bdF0sITEpLGFHVE0uZi5hbihhR1RNLmMuZ3RtW3RdLCJlbnYiLGUuZ3RtW3RdLCIiKSxhR1RNLmYuYW4oYUdUTS5jLmd0bVt0XSwiaWRQYXJhbSIsZS5ndG1bdF0sIiIpLGFHVE0uZi5hbihhR1RNLmMuZ3RtW3RdLCJndG1VUkwiLGUuZ3RtW3RdLCIiKSxhR1RNLmYuYW4oYUdUTS5jLmd0bVt0XSwiZ3RtSlMiLGUuZ3RtW3RdLCIiKSk7aWYoYUdUTS5mLmFuKGFHVE0uYywiZ2RsIixlLCJkYXRhTGF5ZXIiKSxhR1RNLmYuYW4oYUdUTS5jLCJndG1QdXJwb3NlcyIsZSwiIiksYUdUTS5mLmFuKGFHVE0uYywiZ3RtU2VydmljZXMiLGUsIiIpLGFHVE0uZi5hbihhR1RNLmMsImd0bVZlbmRvcnMiLGUsIiIpLGFHVE0uZi5hbihhR1RNLmMsImd0bUF0dHIiLGUsbnVsbCksYUdUTS5mLmFuKGFHVE0uYywiZGxTZXQiLGUse30pLGFHVE0uZi5hbihhR1RNLmMsInVzZUxpc3RlbmVyIixlLCExKSxhR1RNLmYuYW4oYUdUTS5jLCJkbE9yZ1B1c2giLGUsIiIpLGFHVE0uYy5kbFN0YXRlRXZlbnRzPSJib29sZWFuIj09dHlwZW9mIGUuZGxTdGF0ZUV2ZW50cyYmZS5kbFN0YXRlRXZlbnRzLGFHVE0uYy5hUGFnZXZpZXc9ImJvb2xlYW4iPT10eXBlb2YgZS5hUGFnZXZpZXcmJmUuYVBhZ2V2aWV3LGFHVE0uYy52UGFnZXZpZXc9ImJvb2xlYW4iPT10eXBlb2YgZS52UGFnZXZpZXcmJmUudlBhZ2V2aWV3LGFHVE0uYy5zZW5kQ29uc2VudEV2ZW50PSJib29sZWFuIj09dHlwZW9mIGUuc2VuZENvbnNlbnRFdmVudCYmZS5zZW5kQ29uc2VudEV2ZW50LGFHVE0uZi5hbihhR1RNLmMsImNvbnNlbnRfZXZlbnRzIixlLCIiKSxhR1RNLmMuY29uc2VudF9ldmVudF9hdHRyPWFHVE0uYy5jb25zZW50X2V2ZW50X2F0dHJ8fHt9LCJzdHJpbmciPT10eXBlb2YgYUdUTS5jLmNvbnNlbnRfZXZlbnRzJiZhR1RNLmMuY29uc2VudF9ldmVudHMpe2Zvcih2YXIgYT1hR1RNLmMuY29uc2VudF9ldmVudHMuc3BsaXQoIiwiKSxuPVtdLG89MDtvPGEubGVuZ3RoO28rKyl7dmFyIHI9YVtvXS5yZXBsYWNlKC9eXHMrfFxzKyQvZywiIik7aWYocil7dmFyIHM9ci5pbmRleE9mKCJbIik7aWYocz49MCl7dmFyIGk9ci5zdWJzdHJpbmcoMCxzKSxjPXIuc3Vic3RyaW5nKHMrMSxyLmluZGV4T2YoIl0iKSksZj1jLmluZGV4T2YoIjoiKSxUPXt9O2Y+PTA/VFtjLnN1YnN0cmluZygwLGYpXT1jLnN1YnN0cmluZyhmKzEpOlRbY109IiIsYUdUTS5jLmNvbnNlbnRfZXZlbnRfYXR0cltpXT1ULG4ucHVzaChpKX1lbHNlIG4ucHVzaChyKX19YUdUTS5jLmNvbnNlbnRfZXZlbnRzPW4uam9pbigiLCIpfWlmKGFHVE0uZi5hbihhR1RNLmMsInRyYW5zcG9ydF91cmwiLGUsIiIpLGFHVE0uZi5hbihhR1RNLmMsInRyYW5zcG9ydF9lbmMiLGUsITEpLGFHVE0uZi5hbihhR1RNLmMsInRyYW5zcG9ydF9zYWx0IixlLDApLGFHVE0uZi5hbihhR1RNLmMsInVzZXJfaWQiLGUsIiIpLGFHVE0uZi5hbihhR1RNLmMsInNlc3Npb25fc2FsdCIsZSwwKSxhR1RNLmYuYW4oYUdUTS5jLCJjb25zZW50X3N0b3JlX3VybCIsZSwiIiksYUdUTS5mLmFuKGFHVE0uYywiY29uc2VudF9zdG9yZV9lbmMiLGUsITEpLGFHVE0uZi5hbihhR1RNLmMsImNvbnNlbnRfcG9sbF9tcyIsZSwyZTMpLGUuc2Vzc2lvbiYmIm9iamVjdCI9PXR5cGVvZiBlLnNlc3Npb24mJihlLnNlc3Npb24uc2lkfHxlLnNlc3Npb24uY29uc2VudHx8ZS5zZXNzaW9uLmF0dHJpYnV0aW9ufHxlLnNlc3Npb24uc291cmNlKSl7YUdUTS5kLnNlc3Npb249SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYoZS5zZXNzaW9uKSk7dmFyIE09ZS5zZXNzaW9uLmNvbnNlbnQ7TSYmIm9iamVjdCI9PXR5cGVvZiBNJiYhMD09PU0uaGFzUmVzcG9uc2UmJiJzdHJpbmciPT10eXBlb2YgTS5zZXJ2aWNlcz8oYUdUTS5kLmNvbnNlbnQ9SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYoTSkpLGFHVE0uZC5jb25zZW50X2hhc2g9YUdUTS5mLmNvbnNlbnRfc2VyaWFsaXplKGFHVE0uZC5jb25zZW50KSxhR1RNLmQubGFzdF9jb25zZW50X2hhc2g9YUdUTS5kLmNvbnNlbnRfaGFzaCxhR1RNLmQuc2Vzc2lvbl9zdGF0dXM9InByZXNldF93aXRoX2NvbnNlbnQiLGFHVE0uZi5sb2coIm1fc2Vzc2lvbl9wcmVzZXRfY29uc2VudCIsTSkpOihhR1RNLmQuc2Vzc2lvbl9zdGF0dXM9InByZXNldCIsYUdUTS5mLmxvZygibV9zZXNzaW9uX3ByZXNldCIsZS5zZXNzaW9uKSl9aWYoZS5jb25zZW50PWUuY29uc2VudHx8e30sYUdUTS5jLmNvbnNlbnQ9YUdUTS5jLmNvbnNlbnR8fGUuY29uc2VudCxhR1RNLmYuYW4oYUdUTS5jLmNvbnNlbnQsImhhc1Jlc3BvbnNlIixlLmNvbnNlbnQsITEpLGFHVE0uZi5hbihhR1RNLmMuY29uc2VudCwiZmVlZGJhY2siLGUuY29uc2VudCwiIiksYUdUTS5mLmFuKGFHVE0uYy5jb25zZW50LCJwdXJwb3NlcyIsZS5jb25zZW50LCIiKSxhR1RNLmYuYW4oYUdUTS5jLmNvbnNlbnQsInNlcnZpY2VzIixlLmNvbnNlbnQsIiIpLGFHVE0uZi5hbihhR1RNLmMuY29uc2VudCwidmVuZG9ycyIsZS5jb25zZW50LCIiKSxhR1RNLmYuYW4oYUdUTS5jLmNvbnNlbnQsImNvbnNlbnRfaWQiLGUuY29uc2VudCwiIiksd2luZG93W2FHVE0uYy5nZGxdPXdpbmRvd1thR1RNLmMuZ2RsXXx8W10sYUdUTS5kLmNvbnNlbnQ9YUdUTS5kLmNvbnNlbnR8fEpTT04ucGFyc2UoYUdUTS5mLnNTdHJmKGFHVE0uYy5jb25zZW50KSksImJvb2xlYW4iIT10eXBlb2YgYUdUTS5kLmNvbnNlbnQuZ3RtQ29uc2VudCYmKGFHVE0uZC5jb25zZW50Lmd0bUNvbnNlbnQ9ITEpLGFHVE0uZC5jb25maWc9ITAsYUdUTS5kLmd0bUxvYWRlZD1bXSxhR1RNLmQuc2Vzc2lvbiYmYUdUTS5kLnNlc3Npb24uYXR0cmlidXRpb24mJiJvYmplY3QiPT10eXBlb2YgYUdUTS5kLnNlc3Npb24uYXR0cmlidXRpb24pZm9yKHZhciBkIGluIGFHVE0uZC5zZXNzaW9uLmF0dHJpYnV0aW9uKWFHVE0uZC5zZXNzaW9uLmF0dHJpYnV0aW9uLmhhc093blByb3BlcnR5KGQpJiYoYUdUTS5kLmF0dHJpYnV0aW9uW2RdPWFHVE0uZi5yZXNvbHZlQXR0cmlidXRpb24oZCkpOyJmdW5jdGlvbiI9PXR5cGVvZiBhR1RNLmYubG9nJiZhR1RNLmYubG9nKCJtMSIsYUdUTS5jKSwhMD09PWFHVE0uZC5jb25zZW50Lmhhc1Jlc3BvbnNlJiYiZnVuY3Rpb24iPT10eXBlb2YgYUdUTS5mLmNhbGxfY2MmJmFHVE0uZi5jYWxsX2NjKCl9fSxhR1RNLmYubG9hZF9jYz1mdW5jdGlvbihlLHQpe3ZhciBhPWRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoInNjcmlwdCIpLG49YUdUTS5jLnBhdGh8fCIiO24ubGVuZ3RoPjAmJiIvIiE9PW4uY2hhckF0KG4ubGVuZ3RoLTEpJiYobis9Ii8iKTt2YXIgbz0iY21wL2NjXyIrYUdUTS5mLnN0cmNsZWFuKGUpKyhhR1RNLmMubWluPyIubWluIjoiIikrIi5qcyI7YS5zcmM9bitvLGFHVE0uYy5ub25jZSYmKGEubm9uY2U9YUdUTS5jLm5vbmNlKSxhLm9ucmVhZHlzdGF0ZWNoYW5nZT1hLm9ubG9hZD1mdW5jdGlvbigpe2EucmVhZHlTdGF0ZSYmIS9sb2FkZWR8Y29tcGxldGUvLnRlc3QoYS5yZWFkeVN0YXRlKXx8ImZ1bmN0aW9uIj09dHlwZW9mIHQmJnQoKX0sYS5hc3luYz0hMCxkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKGEpfSxhR1RNLmYuY2hlbHA9ZnVuY3Rpb24oZSx0KXt2YXIgYT0hMDtyZXR1cm4gZSYmdCYmZS5zcGxpdCgiLCIpLmZvckVhY2goZnVuY3Rpb24oZSl7dC5pbmRleE9mKCIsIitlLnRyaW0oKSsiLCIpPDAmJihhPSExKX0pLGF9LGFHVE0uZi5ldmFsQ29ucz1mdW5jdGlvbihlLHQpe3ZhciBpc0NvbnNlbnRHaXZlbj1mdW5jdGlvbihlLHQpe3JldHVybiBlLmV2ZXJ5KGZ1bmN0aW9uKGUpe3JldHVybiB0LmluZGV4T2YoIiwiK2UrIiwiKT49MH0pfSxhPSFlLnB1cnBvc2VzLmxlbmd0aHx8aXNDb25zZW50R2l2ZW4oZS5wdXJwb3Nlcyx0LnB1cnBvc2VzKSxuPSFlLnNlcnZpY2VzLmxlbmd0aHx8aXNDb25zZW50R2l2ZW4oZS5zZXJ2aWNlcyx0LnNlcnZpY2VzKSxvPSFlLnZlbmRvcnMubGVuZ3RofHxpc0NvbnNlbnRHaXZlbihlLnZlbmRvcnMsdC52ZW5kb3JzKTtyZXR1cm4gYSYmbiYmb30sYUdUTS5mLnJ1bl9jYz1mdW5jdGlvbihlKXtpZighYUdUTS5kLmNvbmZpZylyZXR1cm4gYUdUTS5mLmxvZygiZTQiLG51bGwpLCExO2lmKCJzdHJpbmciIT10eXBlb2YgZXx8ImluaXQiIT09ZSYmInVwZGF0ZSIhPT1lKXJldHVybiBhR1RNLmYubG9nKCJlNSIse2FjdGlvbjplfSksITE7aWYoImZ1bmN0aW9uIiE9dHlwZW9mIGFHVE0uZi5jb25zZW50X2NoZWNrKXJldHVybiBhR1RNLmYubG9nKCJlMTQiLHthY3Rpb246ZX0pLCExO3ZhciB0PW51bGw7aWYoInVwZGF0ZSI9PT1lJiZhR1RNLmQuY29uc2VudCl7dD1KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihhR1RNLmQuY29uc2VudCkpO3ZhciBhPWFHVE0uZC5jb25zZW50O2EuaGFzUmVzcG9uc2U9ITEsYS5zZXJ2aWNlcz0iIixhLnB1cnBvc2VzPSIiLGEudmVuZG9ycz0iIixhLmNvbnNlbnRfaWQ9IiIsYS5zZXJ2aWNlSURzPSIiLGEuZmVlZGJhY2s9IiIsZGVsZXRlIGEuYmxvY2tlZH1pZighYUdUTS5mLmNvbnNlbnRfY2hlY2soZSkpcmV0dXJuIHQmJihhR1RNLmQuY29uc2VudD10KSxhR1RNLmYubG9nKCJtOCIsbnVsbCksITE7d2luZG93W2FHVE0uYy5nZGxdPXdpbmRvd1thR1RNLmMuZ2RsXXx8W10sYUdUTS5mLmNoZWxwKGFHVE0uYy5ndG1QdXJwb3NlcyxhR1RNLmQuY29uc2VudC5wdXJwb3NlcykmJmFHVE0uZi5jaGVscChhR1RNLmMuZ3RtU2VydmljZXMsYUdUTS5kLmNvbnNlbnQuc2VydmljZXMpJiZhR1RNLmYuY2hlbHAoYUdUTS5jLmd0bVZlbmRvcnMsYUdUTS5kLmNvbnNlbnQudmVuZG9ycyk/YUdUTS5kLmNvbnNlbnQuZ3RtQ29uc2VudD0hMDphR1RNLmQuY29uc2VudC5ndG1Db25zZW50PSJib29sZWFuIj09dHlwZW9mIGFHVE0uZC5jb25zZW50LmJsb2NrZWQmJmFHVE0uZC5jb25zZW50LmJsb2NrZWQ7dmFyIG49YUdUTS5mLmNvbnNlbnRfc2VyaWFsaXplKGFHVE0uZC5jb25zZW50KSxvPW4hPT1hR1RNLmQubGFzdF9jb25zZW50X2hhc2g7aWYoYUdUTS5kLmxhc3RfY29uc2VudF9oYXNoPW4sInVwZGF0ZSI9PWUmJm8mJihhR1RNLmQuaW5pdHx8YUdUTS5mLmluamVjdCgpLGFHVE0uZi5zZW5kbmF1cyh7ZXZlbnQ6ImFHVE1fY29uc2VudF91cGRhdGUiLGFHVE10czoobmV3IERhdGUpLmdldFRpbWUoKSxhR1RNY29uc2VudDphR1RNLmQuY29uc2VudD9KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihhR1RNLmQuY29uc2VudCkpOnt9fSkpLCJ1cGRhdGUiPT09ZSYmIW98fCJmdW5jdGlvbiIhPXR5cGVvZiBhR1RNLmYuY29uc2VudF9jYWxsYmFja3x8YUdUTS5mLmNvbnNlbnRfY2FsbGJhY2soZSksYUdUTS5jLmNvbnNlbnRfc3RvcmVfdXJsKWlmKG4hPT1hR1RNLmQuY29uc2VudF9oYXNoKXt2YXIgcj17fTthR1RNLmQuc2Vzc2lvbiYmYUdUTS5kLnNlc3Npb24udWlkJiYoci51aWQ9YUdUTS5kLnNlc3Npb24udWlkKSxhR1RNLmQuc2Vzc2lvbiYmYUdUTS5kLnNlc3Npb24uc2lkJiYoci5zaWQ9YUdUTS5kLnNlc3Npb24uc2lkKTt2YXIgcz17fSxpPXtndG1Db25zZW50OjEsYmxvY2tlZDoxfTtmb3IodmFyIGMgaW4gYUdUTS5kLmNvbnNlbnQpaWYoYUdUTS5kLmNvbnNlbnQuaGFzT3duUHJvcGVydHkoYykmJiFpW2NdKXt2YXIgZj1hR1RNLmQuY29uc2VudFtjXTsiIiE9PWYmJm51bGwhPWYmJihzW2NdPWYpfXIuY29uc2VudD1zO3ZhciBUPSEwPT09YUdUTS5jLmNvbnNlbnRfc3RvcmVfZW5jLE09Im51bWJlciI9PXR5cGVvZiBhR1RNLmMuc2Vzc2lvbl9zYWx0JiZhR1RNLmMuc2Vzc2lvbl9zYWx0Pj0xP2FHVE0uYy5zZXNzaW9uX3NhbHQ6MDthR1RNLmYubG9nKCJtX2NvbnNlbnRfc3RvcmVfcG9zdCIse3VybDphR1RNLmMuY29uc2VudF9zdG9yZV91cmwsaGFzaDpufSk7dmFyIGQ9YUdUTS5mLnhzZW5kKGFHVE0uYy5jb25zZW50X3N0b3JlX3VybCxyLFQsTSk7ZCYmKGQub25yZWFkeXN0YXRlY2hhbmdlPWZ1bmN0aW9uKCl7aWYoND09PWQucmVhZHlTdGF0ZSlpZihkLnN0YXR1cz49MjAwJiZkLnN0YXR1czwzMDApe2lmKGFHVE0uZC5jb25zZW50X2hhc2g9bixhR1RNLmQuc2Vzc2lvbl9zdGF0dXM9InN5bmNlZCIsYUdUTS5mLmxvZygibV9jb25zZW50X3N0b3JlX3N5bmNlZCIse2hhc2g6bn0pLGQucmVzcG9uc2VUZXh0KXRyeXt2YXIgZT1KU09OLnBhcnNlKGQucmVzcG9uc2VUZXh0KTtlJiYic3RyaW5nIj09dHlwZW9mIGUudWlkJiYwPT09ZS51aWQuaW5kZXhPZigiQy4iKSYmYUdUTS5kLnNlc3Npb24mJmUudWlkIT09YUdUTS5kLnNlc3Npb24udWlkJiYoYUdUTS5mLmxvZygibV91aWRfcHJvbW90ZWQiLHtvbGQ6YUdUTS5kLnNlc3Npb24udWlkLG5ldzplLnVpZH0pLGFHVE0uZC5zZXNzaW9uLnVpZD1lLnVpZCl9Y2F0Y2goZSl7YUdUTS5mLmxvZygiZV9jb25zZW50X3N0b3JlX3BhcnNlIix7bXNnOmUubWVzc2FnZX0pfX1lbHNlIGFHVE0uZi5sb2coImVfY29uc2VudF9zdG9yZSIse3N0YXR1czpkLnN0YXR1c30pfSl9ZWxzZSBhR1RNLmQuc2Vzc2lvbl9zdGF0dXM9ImNvbmZpcm1lZCI7cmV0dXJuIGFHVE0uZi5sb2coIm0zIixhR1RNLmQuY29uc2VudCksITB9LGFHVE0uZi5jYWxsX2NjPWZ1bmN0aW9uKCl7cmV0dXJuISgiZnVuY3Rpb24iIT10eXBlb2YgYUdUTS5mLnJ1bl9jY3x8IWFHVE0uZi5ydW5fY2MoImluaXQiKSkmJih2b2lkIDAhPT1hR1RNLmQudGltZXIuY29uc2VudCYmKGNsZWFySW50ZXJ2YWwoYUdUTS5kLnRpbWVyLmNvbnNlbnQpLGRlbGV0ZSBhR1RNLmQudGltZXIuY29uc2VudCksISFhR1RNLmQuaW5pdHx8YUdUTS5mLmluamVjdCgpKX0sImZ1bmN0aW9uIiE9dHlwZW9mIGFHVE0uZi5jb25zZW50X2xpc3RlbmVyJiYoYUdUTS5mLmNvbnNlbnRfbGlzdGVuZXI9ZnVuY3Rpb24oKXthR1RNLmMudXNlTGlzdGVuZXJ8fCgiZnVuY3Rpb24iPT10eXBlb2YgYUdUTS5mLmNhbGxfY2MmJmFHVE0uZi5jYWxsX2NjKCk/ImZ1bmN0aW9uIj09dHlwZW9mIGFHVE0uZi5zdGFydF9jb25zZW50X3BvbGwmJmFHVE0uZi5zdGFydF9jb25zZW50X3BvbGwoKTphR1RNLmQudGltZXIuY29uc2VudD1zZXRJbnRlcnZhbChmdW5jdGlvbigpe2FHVE0uZi5jYWxsX2NjKCkmJiJmdW5jdGlvbiI9PXR5cGVvZiBhR1RNLmYuc3RhcnRfY29uc2VudF9wb2xsJiZhR1RNLmYuc3RhcnRfY29uc2VudF9wb2xsKCl9LDUwMCkpfSksYUdUTS5mLnN0YXJ0X2NvbnNlbnRfcG9sbD1mdW5jdGlvbigpe2FHVE0uYy5jb25zZW50X3N0b3JlX3VybCYmKCJudW1iZXIiIT10eXBlb2YgYUdUTS5jLmNvbnNlbnRfcG9sbF9tc3x8YUdUTS5jLmNvbnNlbnRfcG9sbF9tczw9MHx8YUdUTS5kLnRpbWVyJiZhR1RNLmQudGltZXIuY29uc2VudF9wb2xsfHwoYUdUTS5kLnRpbWVyPWFHVE0uZC50aW1lcnx8e30sYUdUTS5kLnRpbWVyLmNvbnNlbnRfcG9sbD1zZXRJbnRlcnZhbChmdW5jdGlvbigpeyJmdW5jdGlvbiI9PXR5cGVvZiBhR1RNLmYucnVuX2NjJiZhR1RNLmYucnVuX2NjKCJ1cGRhdGUiKX0sYUdUTS5jLmNvbnNlbnRfcG9sbF9tcykpKX0sYUdUTS5mLmdjPWZ1bmN0aW9uKGUpe2lmKCJzdHJpbmciIT10eXBlb2YgZXx8IWUpcmV0dXJuIG51bGw7dmFyIHQ9ZS5yZXBsYWNlKC9bLiorP14ke30oKXxbXF1cXF0vZywiXFwkJiIpLGE9bmV3IFJlZ0V4cCgiKD86Xnw7XFxzKikiK3QrIj0oW147XSspIiksbj1udWxsO3RyeXt2YXIgbz1kb2N1bWVudCxyPWEuZXhlYyhvW2FHVE0ubi5ja10pO3ImJnIubGVuZ3RoPjEmJihuPWRlY29kZVVSSUNvbXBvbmVudChyWzFdKSl9Y2F0Y2goZSl7fXJldHVybiBufSxhR1RNLmYuc2M9ZnVuY3Rpb24oZSx0KXtpZigic3RyaW5nIj09dHlwZW9mIGUmJmUmJnQpdHJ5e2RvY3VtZW50W2FHVE0ubi5ja109ZSsiPSIrdCsiOyBTZWN1cmU7IFNhbWVTaXRlPUxheDsgcGF0aD0vIn1jYXRjaChlKXt9fSxhR1RNLmYudXJsUGFyYW09ZnVuY3Rpb24oZSx0KXt2YXIgYT1uZXcgUmVnRXhwKCJbPyZdIitlKyIoPShbXiYjXSopfCZ8I3wkKSIpLmV4ZWModCk7cmV0dXJuIGEmJmFbMl0/ZGVjb2RlVVJJQ29tcG9uZW50KGFbMl0ucmVwbGFjZSgvXCsvZywiICIpKTpudWxsfSxhR1RNLmYub3B0b3V0PWZ1bmN0aW9uKCl7dmFyIGU9ITEsdD1hR1RNLmYudXJsUGFyYW0oImFHVE1vcHRvdXQiLHdpbmRvdy5sb2NhdGlvbi5ocmVmKTtpZih0JiYiMCIhPT10KWFHVE0uZi5zYygiYUdUTW9wdG91dCIsIjEiKSxlPSEwO2Vsc2UgaWYoIjAiPT09dClhR1RNLmYuc2MoImFHVE1vcHRvdXQiLCIwIik7ZWxzZXt2YXIgYT1hR1RNLmYuZ2MoImFHVE1vcHRvdXQiKTthJiYiMCIhPT1hJiYoZT0hMCl9aWYoZSl7Zm9yKHZhciBuIGluIGFHVE0pYUdUTS5oYXNPd25Qcm9wZXJ0eShuKSYmImYiIT09biYmZGVsZXRlIGFHVE1bbl07cmV0dXJuIGFHVE0uZi5vYmppbml0KCksImZ1bmN0aW9uIj09dHlwZW9mIGFHVE0uZi5vcHRvdXRfY2FsbGJhY2smJmFHVE0uZi5vcHRvdXRfY2FsbGJhY2soKSwhMH1yZXR1cm4hMX0sYUdUTS5mLmFHVE1fZXZlbnQ9ZnVuY3Rpb24oZSl7Im9iamVjdCIhPXR5cGVvZiBhR1RNLmQuY29uc2VudCYmKGFHVE0uZC5jb25zZW50PW51bGwpLGV8fChlPSJhR1RNX2V2ZW50Iik7dmFyIHQ9e2V2ZW50OmUsYUdUTXRzOihuZXcgRGF0ZSkuZ2V0VGltZSgpLGFHVE1jb25zZW50OmFHVE0uZC5jb25zZW50P0pTT04ucGFyc2UoYUdUTS5mLnNTdHJmKGFHVE0uZC5jb25zZW50KSk6e319O3JldHVybiJhR1RNX3JlYWR5Ij09ZSYmKHQuYUdUTT17dmVyc2lvbjphR1RNLmQudmVyc2lvbixpc19pZnJhbWU6YUdUTS5kLmlzX2lmcmFtZSxoYXN0eUV2ZW50czphR1RNLmQuZixlcnJvcnM6YUdUTS5kLmVycm9yc30pLHR9LGFHVE0uZi5wcm94eVN1cHBvcnQ9ZnVuY3Rpb24oKXtpZigiZnVuY3Rpb24iIT10eXBlb2YgUHJveHkpcmV0dXJuITE7dHJ5e3JldHVybiBuZXcgUHJveHkoZnVuY3Rpb24oKXt9LHthcHBseTpmdW5jdGlvbigpe3JldHVybiEwfX0pKCl9Y2F0Y2goZSl7cmV0dXJuITF9fSxhR1RNLmYudXJsTGlzdGVuZXI9ZnVuY3Rpb24oZSx0LGEpe2lmKCFhR1RNLmQudXJsTGlzdGVuZXJfYWN0aXZlKXthR1RNLmQudXJsTGlzdGVuZXJfYWN0aXZlPSEwLCJudW1iZXIiIT10eXBlb2YgdCYmKHQ9NTAwKSwiYm9vbGVhbiIhPXR5cGVvZiBhJiYoYT0hMSksYUdUTS5kLmxhc3RfdXJsPWFHVE0uZC5sYXN0X3VybHx8YUdUTS5mLmdldFZhbCgibCIsImhyZWYiKSwic3RyaW5nIj09dHlwZW9mIGFHVE0uZC5sYXN0X3VybCYmYUdUTS5kLmxhc3RfdXJsfHwoYUdUTS5kLmxhc3RfdXJsPSIiKTt2YXIgY2hlY2tVcmxDaGFuZ2U9ZnVuY3Rpb24oKXt2YXIgdD1hR1RNLmYuZ2V0VmFsKCJsIiwiaHJlZiIpfHwiIjtpZih0IT1hR1RNLmQubGFzdF91cmwpeyJzdHJpbmciIT10eXBlb2YgZSYmKGU9InZQYWdldmlldyIpO3ZhciBhPXtldmVudDplfTthLm9sZFVSTD1hR1RNLmQubGFzdF91cmwsYS5uZXdVUkw9dCxhLm5ld1RpdGxlPWRvY3VtZW50LnRpdGxlLGFHVE0uZi5maXJlKGEpLGFHVE0uZC5sYXN0X3VybD10fX07YUdUTS5mLmV2THN0bigid2luZG93IiwicG9wc3RhdGUiLGNoZWNrVXJsQ2hhbmdlKSxhR1RNLmYuZXZMc3RuKCJ3aW5kb3ciLCJoYXNoY2hhbmdlIixjaGVja1VybENoYW5nZSk7dmFyIG49ITE7aWYoYUdUTS5mLnByb3h5U3VwcG9ydCgpKXt2YXIgbz17YXBwbHk6ZnVuY3Rpb24oZSx0LGEpe3ZhciBuPWUuYXBwbHkodCxhKTtyZXR1cm4gY2hlY2tVcmxDaGFuZ2UoKSxufX07aGlzdG9yeS5wdXNoU3RhdGU9bmV3IFByb3h5KGhpc3RvcnkucHVzaFN0YXRlLG8pLGhpc3RvcnkucmVwbGFjZVN0YXRlPW5ldyBQcm94eShoaXN0b3J5LnJlcGxhY2VTdGF0ZSxvKSxuPSEwfSh0PjAmJiFuJiZhfHx0PjAmJiFhKSYmYUdUTS5mLnRpbWVyKCJ1cmxMaXN0ZW5lciIsY2hlY2tVcmxDaGFuZ2UsbnVsbCx0LDApfX0sYUdUTS5mLmd0bV9sb2FkPWZ1bmN0aW9uKGUsdCxhLG4sbyxyKXtpZihhR1RNLmQuY29uZmlnKXtpZigib2JqZWN0IiE9dHlwZW9mIGFHVE0uZC5ndG1Mb2FkZWQmJihhR1RNLmQuZ3RtTG9hZGVkPVtdKSxhR1RNLmQuZ3RtTG9hZGVkLmxlbmd0aDwxJiYoYUdUTS5mLnNlbmRuYXVzKGFHVE0uZi5hR1RNX2V2ZW50KCJhR1RNX3JlYWR5IikpLGEmJmFHVE0uZi5zZW5kbmF1cyh7ZXZlbnQ6Imd0bS5qcyIsImd0bS5zdGFydCI6KG5ldyBEYXRlKS5nZXRUaW1lKCl9KSxhR1RNLmMuYVBhZ2V2aWV3JiZhR1RNLmYuc2VuZG5hdXMoe2V2ZW50OiJhUGFnZXZpZXciLGFHVE10czoobmV3IERhdGUpLmdldFRpbWUoKX0pLGFHVE0uYy52UGFnZXZpZXcmJmFHVE0uZi5zZW5kbmF1cyh7ZXZlbnQ6InZQYWdldmlldyIsYUdUTXRzOihuZXcgRGF0ZSkuZ2V0VGltZSgpfSksYUdUTS5jLnZQYWdldmlld3MmJmFHVE0uZi51cmxMaXN0ZW5lcigidlBhZ2V2aWV3IixhR1RNLmMudlBhZ2V2aWV3c1RpbWVyLGFHVE0uYy52UGFnZXZpZXdzRmFsbGJhY2spKSxhR1RNLmQuY29uc2VudEV2ZW50X2ZpcmVkPSJib29sZWFuIj09dHlwZW9mIGFHVE0uZC5jb25zZW50RXZlbnRfZmlyZWQmJmFHVE0uZC5jb25zZW50RXZlbnRfZmlyZWQsYUdUTS5jLnNlbmRDb25zZW50RXZlbnQmJiFhR1RNLmQuY29uc2VudEV2ZW50X2ZpcmVkJiYib2JqZWN0Ij09dHlwZW9mIGFHVE0uZC5jb25zZW50JiZhR1RNLmQuY29uc2VudC5oYXNSZXNwb25zZSYmKGFHVE0uZi5zZW5kbmF1cyhhR1RNLmYuYUdUTV9ldmVudCgiYUdUTV9jb25zZW50IikpLGFHVE0uZC5jb25zZW50RXZlbnRfZmlyZWQ9ITApLGEpe258fChuPSJpZCIpO3ZhciBzPSExLGk9YUdUTS5mLmdjKCJhR1RNZGVidWciKTtpZihpJiZwYXJzZUludChpKT4wJiYocz0hMCksc3x8YUdUTS5mLnVybFBhcmFtKCJndG1fZGVidWciLGRvY3VtZW50LmxvY2F0aW9uLmhyZWYpJiYocz0hMCksIXMmJmRvY3VtZW50LnJlZmVycmVyKXt2YXIgYz10LmNyZWF0ZUVsZW1lbnQoImEiKTtjLmhyZWY9ZG9jdW1lbnQucmVmZXJyZXIsYy5ob3N0bmFtZT09YUdUTS5uLnRhKyIuY29tIiYmKHM9ITApfSFpJiZzJiZhR1RNLmYuc2MoImFHVE1kZWJ1ZyIsIjEiKTt2YXIgZj10LmNyZWF0ZUVsZW1lbnQoInNjcmlwdCIpO2lmKGYuaWQ9ImFHVE1fdG1fIithLGYuYXN5bmM9ITAsIm9iamVjdCI9PXR5cGVvZiBhR1RNLmMuZ3RtQXR0cilmb3IodmFyIFQgaW4gYUdUTS5jLmd0bUF0dHIpZi5zZXRBdHRyaWJ1dGUoVCxhR1RNLmMuZ3RtQXR0cltUXSk7aWYoYUdUTS5jLm5vbmNlJiYoZi5ub25jZT1hR1RNLmMubm9uY2UpLHIuZ3RtSlMmJiFzKWYuaW5uZXJIVE1MPWF0b2Ioci5ndG1KUyk7ZWxzZXt2YXIgTT1yLmd0bVVSTHx8Imh0dHBzOi8vd3d3LiIrYUdUTS5uLnRtKyIuY29tL2d0bS5qcyIsZD1yLmVudnx8IiIsRz0tMT09PU0uaW5kZXhPZigiPyIpPyI/IjoiJiI7Zi5zcmM9TStHK24rIj0iK2ErIiZsPSIrbytkfXZhciBsPXQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoInNjcmlwdCIpWzBdO2wucGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUoZixsKSxhR1RNLmQuZ3RtTG9hZGVkLnB1c2goYXx8Im5vX2d0bV9pZCIpfX1lbHNlIGFHVE0uZi5sb2coImU3IixudWxsKX0sYUdUTS5mLmRvbXJlYWR5PWZ1bmN0aW9uKGUpe3ZhciB0PSExO2FHVE0uZi52T2IoZSl8fChlPXthTVNHOiJFbXB0eSBET01yZWFkeSBldmVudCBmaXJlZC4ifSx0PSEwKSxlLmV2ZW50fHwoZS5ldmVudD0iYURPTXJlYWR5IiksYUdUTS5kLmRvbV9yZWFkeSYmdHx8KCFhR1RNLmMuZGxTdGF0ZUV2ZW50cyYmdHx8YUdUTS5mLmZpcmUoZSksdCYmKGFHVE0uZC5kb21fcmVhZHk9ITApKX0sYUdUTS5mLnBhZ2VyZWFkeT1mdW5jdGlvbihlKXt2YXIgdD0hMTthR1RNLmYudk9iKGUpfHwoZT17YU1TRzoiRW1wdHkgUEFHRXJlYWR5IGV2ZW50IGZpcmVkLiJ9LHQ9ITApLGUuZXZlbnR8fChlLmV2ZW50PSJhUEFHRXJlYWR5IiksYUdUTS5kLnBhZ2VfcmVhZHkmJnR8fCghYUdUTS5jLmRsU3RhdGVFdmVudHMmJnR8fGFHVE0uZi5maXJlKGUpLHQmJihhR1RNLmQucGFnZV9yZWFkeT0hMCkpfSxhR1RNLmYuaW5pdEdUTT1mdW5jdGlvbihlKXtpZigib2JqZWN0Ij09dHlwZW9mIGFHVE0uYy5ndG0mJmFHVE0uYy5ndG0pe3ZhciB0PTA7Zm9yKHZhciBhIGluIGFHVE0uYy5ndG0pdCsrLGFHVE0uYy5ndG0uaGFzT3duUHJvcGVydHkoYSkmJigiYm9vbGVhbiIhPXR5cGVvZiBhR1RNLmMuZ3RtW2FdLmhhc0xvYWRlZCYmKGFHVE0uYy5ndG1bYV0uaGFzTG9hZGVkPSExKSxhR1RNLmMuZ3RtW2FdLmhhc0xvYWRlZHx8ZSYmIWFHVE0uYy5ndG1bYV0ubm9Db25zZW50fHwoYUdUTS5mLmd0bV9sb2FkKHdpbmRvdyxkb2N1bWVudCxhLGFHVE0uYy5ndG1bYV0uaWRQYXJhbT9hR1RNLmMuZ3RtW2FdLmlkUGFyYW06IiIsYUdUTS5jLmdkbCxhR1RNLmMuZ3RtW2FdKSxhR1RNLmMuZ3RtW2FdLmhhc0xvYWRlZD0hMCkpO3R8fGFHVE0uZi5ndG1fbG9hZCh3aW5kb3csZG9jdW1lbnQsIiIsYUdUTS5jLmd0bVthXS5pZFBhcmFtP2FHVE0uYy5ndG1bYV0uaWRQYXJhbToiIixhR1RNLmMuZ2RsLG51bGwpfX0sYUdUTS5mLmNoa0RQcmVhZHk9ZnVuY3Rpb24oKXt2YXIgZT1kb2N1bWVudC5yZWFkeVN0YXRlOyJpbnRlcmFjdGl2ZSI9PT1lfHwiY29tcGxldGUiPT09ZT9hR1RNLmYuZG9tcmVhZHkobnVsbCk6YUdUTS5mLmV2THN0bihkb2N1bWVudCwiRE9NQ29udGVudExvYWRlZCIsYUdUTS5mLmRvbXJlYWR5KSwiY29tcGxldGUiPT09ZT9hR1RNLmYucGFnZXJlYWR5KG51bGwpOmFHVE0uZi5ldkxzdG4od2luZG93LCJsb2FkIixhR1RNLmYucGFnZXJlYWR5KX0sYUdUTS5mLmluamVjdD1mdW5jdGlvbigpe2lmKCFhR1RNLmQuY29uZmlnKXJldHVybiBhR1RNLmYubG9nKCJlOCIsbnVsbCksITE7aWYoIm9iamVjdCIhPXR5cGVvZiBhR1RNLmQuY29uc2VudHx8ImJvb2xlYW4iIT10eXBlb2YgYUdUTS5kLmNvbnNlbnQuaGFzUmVzcG9uc2V8fCFhR1RNLmQuY29uc2VudC5oYXNSZXNwb25zZSlyZXR1cm4gYUdUTS5mLmxvZygiZTEzIixudWxsKSwhMTthR1RNLmQuaW5pdHx8KCh3aW5kb3dbYUdUTS5jLmdkbF18fFtdKS5mb3JFYWNoKGZ1bmN0aW9uKGUsdCl7aWYoIm9iamVjdCI9PXR5cGVvZiBlJiZlKXtpZighZS5hR1RNY2hrKXtlLmFHVE1kbD0hMDt2YXIgYT1KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihlKSk7dm9pZCAwIT09YVsiZ3RtLnVuaXF1ZUV2ZW50SWQiXSYmZGVsZXRlIGFbImd0bS51bmlxdWVFdmVudElkIl0sYUdUTS5kLmYucHVzaChhKX19ZWxzZSBhR1RNLmYubG9nKCJlMTciLHtvYmpfdHlwZTp0eXBlb2YgZSxvYmpfdmFsdWU6ZSxpbmRleDp0fSksYUdUTS5kLmYucHVzaCh7ZXZlbnQ6ImV4Y2VwdGlvbiIsZXJybXNnOiJEYXRhTGF5ZXIgRW50cnkgaXMgbm8gb2JqZWN0IixlcnJ0eXBlOiJETCBFcnJvciIsb2JqX3R5cGU6dHlwZW9mIGUsb2JqX3ZhbHVlOmV9KX0pLGFHVE0uZC5jb25zZW50Lmd0bUNvbnNlbnQmJihhR1RNLmYuaW5pdEdUTSghMSksYUdUTS5kLmluaXQ9ITApLGFHVE0uZC5pbml0JiZhR1RNLmYuY2hrRFByZWFkeSgpKTtyZXR1cm4iZnVuY3Rpb24iPT10eXBlb2YgYUdUTS5mLmluamVjdF9jYWxsYmFjayYmYUdUTS5mLmluamVjdF9jYWxsYmFjaygpLGFHVE0uZi5sb2coIm02IixudWxsKSwhMH0sYUdUTS5mLmlGcmFtZUZpcmU9ZnVuY3Rpb24oZSl7Im9iamVjdCI9PXR5cGVvZiBlJiZlJiYoYUdUTS5kLmlzX2lmcmFtZSYmInN0cmluZyI9PXR5cGVvZiBlLmV2ZW50JiYvXihhR1RNfGd0bVwufFthdl1ET01yZWFkeXxbYXZdUEFHRXJlYWR5KS8udGVzdChlLmV2ZW50KT9hR1RNLmYuc2VuZG5hdXMoZSk6KGUuYUdUTV9zb3VyY2U9ImlGcmFtZSAiK2RvY3VtZW50LmxvY2F0aW9uLmhvc3RuYW1lLGFHVE0uZC5pZnJhbWUuY291bnRlci5ldmVudHMrKyxlLmlmRXZDdHI9YUdUTS5kLmlmcmFtZS5jb3VudGVyLmV2ZW50cywic3RyaW5nIj09dHlwZW9mIGUuZXZlbnQmJmUuZXZlbnQmJihhR1RNLmQuaWZyYW1lLmNvdW50ZXJbZS5ldmVudF09YUdUTS5kLmlmcmFtZS5jb3VudGVyW2UuZXZlbnRdfHwwLGFHVE0uZC5pZnJhbWUuY291bnRlcltlLmV2ZW50XSsrLGVbImlmRXZDdHJfIitlLmV2ZW50XT1hR1RNLmQuaWZyYW1lLmNvdW50ZXJbZS5ldmVudF0pLGUuYUdUTXRzJiZkZWxldGUgZS5hR1RNdHMsZS5hR1RNcGFyYW1zJiZkZWxldGUgZS5hR1RNcGFyYW1zLGFHVE0uZC5pZnJhbWUub3JpZ2luP3dpbmRvdy50b3AucG9zdE1lc3NhZ2UoZSxhR1RNLmQuaWZyYW1lLm9yaWdpbik6YUdUTS5kLmYucHVzaChlKSkpfSxhR1RNLmYuaWZIYW5kc2hha2U9ZnVuY3Rpb24oKXtpZighYUdUTS5kLmlzX2lmcmFtZSYmIWFHVE0uZC5pZnJhbWUuaGFuZHNoYWtlKXt2YXIgZT1kb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgiaWZyYW1lIik7aWYoIWUubGVuZ3RoKXJldHVybjtmb3IodmFyIHQ9MDt0PGUubGVuZ3RoO3QrKyl7dmFyIGE9ZVt0XTthJiZhLmNvbnRlbnRXaW5kb3cmJmEuY29udGVudFdpbmRvdy5wb3N0TWVzc2FnZSYmYS5jb250ZW50V2luZG93LnBvc3RNZXNzYWdlKCJhR1RNX1RvcDJpRnJhbWUgSGFuZHNoYWtlIiwiKiIpfWFHVE0uZC5pZnJhbWUuaGFuZHNoYWtlPSEwfX0sYUdUTS5mLmlmSFNsaXN0ZW49ZnVuY3Rpb24oZSl7aWYoYUdUTS5kLmlzX2lmcmFtZSYmZS5zb3VyY2U9PT13aW5kb3cudG9wJiYic3RyaW5nIj09dHlwZW9mIGUuZGF0YSYmImFHVE1fVG9wMmlGcmFtZSBIYW5kc2hha2UiPT1lLmRhdGEpZm9yKGFHVE0uZC5pZnJhbWUub3JpZ2luPWUub3JpZ2luLGFHVE0uZC5pZnJhbWUuaWZMaXN0ZW49ITEsd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoIm1lc3NhZ2UiLGFHVE0uZi5pZkhTbGlzdGVuLCExKTthR1RNLmQuZi5sZW5ndGg7KXt2YXIgdD1hR1RNLmQuZi5zaGlmdCgpO2FHVE0uZi5pRnJhbWVGaXJlKHQpfX0sYUdUTS5mLnZPYj1mdW5jdGlvbihlKXtpZigib2JqZWN0IiE9dHlwZW9mIGV8fCFlKXJldHVybiExO3RyeXtKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KGUpKX1jYXRjaChlKXtyZXR1cm4hMX1yZXR1cm4hMH0sYUdUTS5mLnZTdD1mdW5jdGlvbihlKXt2YXIgdD1BcnJheS5pc0FycmF5KGUpP2U6InN0cmluZyI9PXR5cGVvZiBlP1tlXTpbXTtyZXR1cm4gMCE9PXQubGVuZ3RoJiZ0LmV2ZXJ5KGZ1bmN0aW9uKGUpe3JldHVybiJzdHJpbmciPT10eXBlb2YgZSYmIiIhPT1lfSl9LGFHVE0uZi5wYXNzaXZlU3VwcG9ydGVkPWZ1bmN0aW9uKCl7aWYoImJvb2xlYW4iPT10eXBlb2YgYUdUTS5kLnBhc3NpdmVfc3VwcG9ydGVkKXJldHVybiBhR1RNLmQucGFzc2l2ZV9zdXBwb3J0ZWQ7dmFyIGU9ITE7dHJ5e3ZhciB0PU9iamVjdC5kZWZpbmVQcm9wZXJ0eSh7fSwicGFzc2l2ZSIse2dldDpmdW5jdGlvbigpe3JldHVybiBlPSEwLCEwfX0pLG5vb3A9ZnVuY3Rpb24oKXt9O3dpbmRvdy5hZGRFdmVudExpc3RlbmVyKCJhR1RNcGFzc2l2ZXRlc3QiLG5vb3AsdCksd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoImFHVE1wYXNzaXZldGVzdCIsbm9vcCx0KX1jYXRjaCh0KXtlPSExfXJldHVybiBhR1RNLmQucGFzc2l2ZV9zdXBwb3J0ZWQ9ZSxlfSxhR1RNLmYudGhyb3R0bGU9ZnVuY3Rpb24oZSx0KXtpZigiZnVuY3Rpb24iIT10eXBlb2YgZSlyZXR1cm4gZTtpZigibnVtYmVyIiE9dHlwZW9mIHR8fHQ8PTApcmV0dXJuIGU7dmFyIGE9MCxuPW51bGwsbz1udWxsLHI9bnVsbDtyZXR1cm4gZnVuY3Rpb24oKXt2YXIgcz1EYXRlLm5vdygpO289dGhpcyxyPWFyZ3VtZW50czt2YXIgaT10LShzLWEpO2k8PTA/KG4mJihjbGVhclRpbWVvdXQobiksbj1udWxsKSxhPXMsZS5hcHBseShvLHIpKTpufHwobj1zZXRUaW1lb3V0KGZ1bmN0aW9uKCl7YT1EYXRlLm5vdygpLG49bnVsbCxlLmFwcGx5KG8scil9LGkpKX19LGFHVE0uZi5ldkxzdG49ZnVuY3Rpb24oZSx0LGEsbil7aWYoIndpbmRvdyI9PT1lJiYoZT13aW5kb3cpLCJkb2N1bWVudCI9PT1lJiYoZT1kb2N1bWVudCksIm9iamVjdCI9PXR5cGVvZiBlJiZlJiYic3RyaW5nIj09dHlwZW9mIHQmJiJmdW5jdGlvbiI9PXR5cGVvZiBhKXsib2JqZWN0Ij09dHlwZW9mIG4mJm58fChuPXt9KTt0cnl7aWYoIm1lc3NhZ2UiPT10KWFHVE0uZC5pZnJhbWUudG9wTGlzdGVufHxhR1RNLmQuaXNfaWZyYW1lfHwoYUdUTS5kLmlmcmFtZS50b3BMaXN0ZW49ITAsZS5hZGRFdmVudExpc3RlbmVyKHQsZnVuY3Rpb24oZSl7YSh2b2lkIDAhPT1lLmRhdGE/ZS5kYXRhOm51bGwsInN0cmluZyI9PXR5cGVvZiBlLm9yaWdpbj9lLm9yaWdpbjoiIil9KSk7ZWxzZXt2YXIgbz0ibnVtYmVyIj09dHlwZW9mIG4udGhyb3R0bGUmJm4udGhyb3R0bGU+MD9hR1RNLmYudGhyb3R0bGUoYSxuLnRocm90dGxlKTphOyEwPT09bi5wYXNzaXZlJiZhR1RNLmYucGFzc2l2ZVN1cHBvcnRlZCgpP2UuYWRkRXZlbnRMaXN0ZW5lcih0LG8se3Bhc3NpdmU6ITB9KTplLmFkZEV2ZW50TGlzdGVuZXIodCxvKX19Y2F0Y2gobil7YUdUTS5mLmxvZygiZTEyIix7ZXJyb3I6bixlbDplLGV2OnQsZmN0OmF9KX19ZWxzZSBhR1RNLmYubG9nKCJlMTEiLHtlbDplLGV2OnQsZmN0OmF9KX0sYUdUTS5mLnJtTHN0bj1mdW5jdGlvbihlLHQsYSl7IndpbmRvdyI9PT1lJiYoZT13aW5kb3cpLCJkb2N1bWVudCI9PT1lJiYoZT1kb2N1bWVudCk7dHJ5e2UucmVtb3ZlRXZlbnRMaXN0ZW5lcih0LGEpfWNhdGNoKGUpe319LGFHVE0uZi5nZXRWYWw9ZnVuY3Rpb24oZSx0KXtpZihhR1RNLmYudlN0KFtlLHRdKSYmdC5tYXRjaCgvW2Etel0rL2kpJiYoInAiIT1lfHwib2JqZWN0Ij09dHlwZW9mIHBlcmZvcm1hbmNlJiZwZXJmb3JtYW5jZSkpc3dpdGNoKGUpe2Nhc2UidyI6cmV0dXJuIGFHVE0uZi52T2Iod2luZG93W3RdKT9KU09OLnBhcnNlKGFHVE0uZi5zU3RyZih3aW5kb3dbdF0pKTp3aW5kb3dbdF07Y2FzZSJuIjpyZXR1cm4gYUdUTS5mLnZPYihuYXZpZ2F0b3JbdF0pP0pTT04ucGFyc2UoYUdUTS5mLnNTdHJmKG5hdmlnYXRvclt0XSkpOm5hdmlnYXRvclt0XTtjYXNlImQiOnJldHVybiBkb2N1bWVudFt0XTtjYXNlImwiOnJldHVybiBkb2N1bWVudC5sb2NhdGlvblt0XTtjYXNlImgiOnJldHVybiBkb2N1bWVudC5oZWFkW3RdO2Nhc2UiYiI6cmV0dXJuIGRvY3VtZW50LmJvZHlbdF07Y2FzZSJzIjpyZXR1cm4gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoImh0bWwiKVswXS5zY3JvbGxUb3B8fDA7Y2FzZSJtIjpyZXR1cm4gd2luZG93LnNjcmVlblt0XTtjYXNlImMiOnJldHVybiB3aW5kb3cuZ29vZ2xlX3RhZ19kYXRhJiZ3aW5kb3cuZ29vZ2xlX3RhZ19kYXRhLmljcz9KU09OLnBhcnNlKGFHVE0uZi5zU3RyZih3aW5kb3cuZ29vZ2xlX3RhZ19kYXRhLmljcykpOm51bGw7Y2FzZSJwIjpyZXR1cm4ibm93Ij09dD9wZXJmb3JtYW5jZS5ub3coKTpwZXJmb3JtYW5jZVt0XTtkZWZhdWx0OnJldHVybn19LGFHVE0uZi5nZXROb2RlQXR0cj1mdW5jdGlvbihlLHQpe3ZhciBhPWRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoZSk7cmV0dXJuIGE/YS5nZXRBdHRyaWJ1dGUodCk6bnVsbH0sYUdUTS5mLm5ld05vZGU9ZnVuY3Rpb24oZSx0LGEpe2lmKGFHVE0uZi52U3QoW2UsdF0pJiYib2JqZWN0Ij09dHlwZW9mIGEpe3ZhciBuPWRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoZSksbz1kb2N1bWVudC5xdWVyeVNlbGVjdG9yKHQpO2lmKG8pe2Zvcih2YXIgciBpbiBhKWlmKGEuaGFzT3duUHJvcGVydHkocikpe3ZhciBzPXIuc3BsaXQoIi4iKTsxPT09cy5sZW5ndGg/bi5zZXRBdHRyaWJ1dGUocixhW3JdKToobltzWzBdXXx8KG5bc1swXV09e30pLG5bc1swXV1bc1sxXV09YVtyXSl9by5hcHBlbmRDaGlsZChuKX19fSxhR1RNLmYuZGVsTm9kZT1mdW5jdGlvbihlKXtpZihhR1RNLmYudlN0KGUpKXt2YXIgdD1kb2N1bWVudC5xdWVyeVNlbGVjdG9yKGUpO3QmJnQucGFyZW50Tm9kZS5yZW1vdmVDaGlsZCh0KX19LGFHVE0uZi5wYWdlaW5mbz1mdW5jdGlvbihlKXt2YXIgdD0wLGE9MDtpZigoZT1lfHx7fSkuY291bnRXb3JkcyYmZnVuY3Rpb24gZ2V0VGV4dChlKXtpZigzPT09ZS5ub2RlVHlwZSl0Kz1lLnRleHRDb250ZW50LnRyaW0oKS5zcGxpdCgvXHMrLykubGVuZ3RoO2Vsc2UgaWYoMT09PWUubm9kZVR5cGUmJiEvXihzY3JpcHR8c3R5bGV8bm9zY3JpcHQpJC9pLnRlc3QoZS50YWdOYW1lKSlmb3IodmFyIGE9MDthPGUuY2hpbGROb2Rlcy5sZW5ndGg7YSsrKWdldFRleHQoZS5jaGlsZE5vZGVzW2FdKX0oZG9jdW1lbnQuYm9keSksZS5jb3VudEltYWdlcylmb3IodmFyIG49ZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoImltZyIpLG89MDtvPG4ubGVuZ3RoO28rKyluW29dLm5hdHVyYWxXaWR0aD4yNTAmJm5bb10ubmF0dXJhbEhlaWdodD4yNTAmJmErKztyZXR1cm57d29yZHM6dCxpbWFnZXM6YX19LGFHVE0uZi5jcExzdD1mdW5jdGlvbihlLHQsYSl7dHJ5e2UuYWRkRXZlbnRMaXN0ZW5lcih0LGZ1bmN0aW9uKGUpe3ZhciB0O3dpbmRvdy5nZXRTZWxlY3Rpb24mJih0PXdpbmRvdy5nZXRTZWxlY3Rpb24oKS50b1N0cmluZygpKSYmYSh0KX0pfWNhdGNoKHQpe2FHVE0uZi5sb2coImUxMiIse2VsZW1lbnQ6ZSxlcnJvcjp0fSl9fSxhR1RNLmYuZWxMc3Q9ZnVuY3Rpb24oZSx0LGEpe3RyeXtlLmFkZEV2ZW50TGlzdGVuZXIodCxmdW5jdGlvbihlKXtmb3IodmFyIHQ9dGhpcy50YWdOYW1lLnRvTG93ZXJDYXNlKCksbj0iIixvPSIiLHI9bnVsbCxzPW51bGwsaT0wLGM9dGhpcztjJiZjLnBhcmVudEVsZW1lbnQ7KWM9Yy5wYXJlbnRFbGVtZW50LCFuJiZjLmlkJiYobj0oInN0cmluZyI9PXR5cGVvZiBjLm5vZGVOYW1lP2Mubm9kZU5hbWUudG9Mb3dlckNhc2UoKSsiOiI6IiIpK2MuaWQpLCFvJiZjLmdldEF0dHJpYnV0ZSgiY2xhc3MiKSYmKG89KCJzdHJpbmciPT10eXBlb2YgYy5ub2RlTmFtZT9jLm5vZGVOYW1lLnRvTG93ZXJDYXNlKCkrIjoiOiIiKStjLmdldEF0dHJpYnV0ZSgiY2xhc3MiKSk7aWYoImlucHV0Ij09PXR8fCJzZWxlY3QiPT09dHx8InRleHRhcmVhIj09PXQpe2ZvcihjPXRoaXM7YyYmYy5wYXJlbnRFbGVtZW50JiYiZm9ybSIhPT1jLnRhZ05hbWUudG9Mb3dlckNhc2UoKTspYz1jLnBhcmVudEVsZW1lbnQ7ImZvcm0iPT09Yy50YWdOYW1lLnRvTG93ZXJDYXNlKCkmJihyPXtpZDpjLmlkLGNsYXNzOmMuZ2V0QXR0cmlidXRlKCJjbGFzcyIpLG5hbWU6Yy5nZXRBdHRyaWJ1dGUoIm5hbWUiKSxhY3Rpb246Yy5hY3Rpb24sZWxlbWVudHM6Yy5lbGVtZW50cy5sZW5ndGh9LHM9QXJyYXkucHJvdG90eXBlLmluZGV4T2YuY2FsbChjLmVsZW1lbnRzLHRoaXMpKzEpfSJvYmplY3QiPT10eXBlb2YgdGhpcy5lbGVtZW50cyYmIm51bWJlciI9PXR5cGVvZiB0aGlzLmVsZW1lbnRzLmxlbmd0aCYmKGk9dGhpcy5lbGVtZW50cy5sZW5ndGgpO3ZhciBmPXt0YWdOYW1lOnQsdGFyZ2V0OnRoaXMudGFyZ2V0fHwiIixwYXJlbnRJRDpuLHBhcmVudENsYXNzOm8saWQ6dGhpcy5pZHx8IiIsbmFtZTp0aGlzLmdldEF0dHJpYnV0ZSgibmFtZSIpfHwiIixjbGFzczp0aGlzLmdldEF0dHJpYnV0ZSgiY2xhc3MiKXx8IiIsaHJlZjp0aGlzLmhyZWZ8fCIiLHNyYzp0aGlzLnNyY3x8IiIsYWN0aW9uOnRoaXMuYWN0aW9ufHwiIix0eXBlOnRoaXMudHlwZXx8IiIsZWxlbWVudHM6aSxwb3NpdGlvbjpzLGZvcm06cixodG1sOnRoaXMub3V0ZXJIVE1MP3RoaXMub3V0ZXJIVE1MLnRvU3RyaW5nKCk6IiIsdGV4dDp0aGlzLm91dGVyVGV4dD90aGlzLm91dGVyVGV4dC50b1N0cmluZygpOiIifTtmLmh0bWwubGVuZ3RoPjUxMiYmKGYuaHRtbD1mLmh0bWwuc2xpY2UoMCw1MDkpKyIuLi4iKSxmLnRleHQubGVuZ3RoPjUxMiYmKGYudGV4dD1mLnRleHQuc2xpY2UoMCw1MDkpKyIuLi4iKSxhKGYpfSl9Y2F0Y2godCl7YUdUTS5mLmxvZygiZTEyIix7ZWxlbWVudDplLGVycm9yOnR9KX19LGFHVE0uZi5hZGRFbExzdD1mdW5jdGlvbihlLHQsYSl7aWYoYUdUTS5mLnZTdChbZSx0XSkmJiJmdW5jdGlvbiI9PXR5cGVvZiBhKXt2YXIgbj1kb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKGUpOyJvYmplY3QiPT10eXBlb2YgbiYmIm51bWJlciI9PXR5cGVvZiBuLmxlbmd0aCYmMCE9bi5sZW5ndGgmJm4uZm9yRWFjaChmdW5jdGlvbihlKXtpZigiY29weSI9PT10KWFHVE0uZi5jcExzdChlLHQsYSk7ZWxzZSBhR1RNLmYuZWxMc3QoZSx0LGEpfSl9fSxhR1RNLmYub2JzZXJ2ZXI9ZnVuY3Rpb24oZSx0LGEpe2lmKGFHVE0uZi52U3QoW2UsdF0pJiYiZnVuY3Rpb24iPT10eXBlb2YgYSl7bmV3IE11dGF0aW9uT2JzZXJ2ZXIoZnVuY3Rpb24obil7bi5mb3JFYWNoKGZ1bmN0aW9uKG4peyJjaGlsZExpc3QiPT09bi50eXBlJiZuLmFkZGVkTm9kZXMubGVuZ3RoJiZBcnJheS5wcm90b3R5cGUuZm9yRWFjaC5jYWxsKG4uYWRkZWROb2RlcyxmdW5jdGlvbihuKXtpZigxPT09bi5ub2RlVHlwZSYmInN0cmluZyI9PXR5cGVvZiBuLnRhZ05hbWUmJm4udGFnTmFtZS50b0xvd2VyQ2FzZSgpPT09ZS50b0xvd2VyQ2FzZSgpJiZhR1RNLmYuZWxMc3Qobix0LGEpLDE9PT1uLm5vZGVUeXBlJiZuLnF1ZXJ5U2VsZWN0b3JBbGwpe3ZhciBvPW4ucXVlcnlTZWxlY3RvckFsbChlLnRvTG93ZXJDYXNlKCkpO0FycmF5LnByb3RvdHlwZS5mb3JFYWNoLmNhbGwobyxmdW5jdGlvbihlKXthR1RNLmYuZWxMc3QoZSx0LGEpfSl9fSl9KX0pLm9ic2VydmUoZG9jdW1lbnQuYm9keSx7Y2hpbGRMaXN0OiEwLHN1YnRyZWU6ITAsYXR0cmlidXRlczohMX0pfX0sYUdUTS5mLnJUZXN0PWZ1bmN0aW9uKGUsdCl7cmV0dXJuIGFHVE0uZi52U3QoW2UsdF0pJiZuZXcgUmVnRXhwKHQsImkiKS50ZXN0KGUpfSxhR1RNLmYuck1hdGNoPWZ1bmN0aW9uKGUsdCl7cmV0dXJuIGUubWF0Y2gobmV3IFJlZ0V4cCh0KSl9LGFHVE0uZi5yUmVwbGFjZT1mdW5jdGlvbihlLHQsYSl7cmV0dXJuIGFHVE0uZi52U3QoW2UsdCxhXSk/ZS5yZXBsYWNlKG5ldyBSZWdFeHAodCwiZ2kiKSxhKTplfSxhR1RNLmYuaXNJRnJhbWU9ZnVuY3Rpb24oKXtyZXR1cm4gd2luZG93LnNlbGYhPT13aW5kb3cudG9wfSxhR1RNLmYuanNlcnJvcnM9ZnVuY3Rpb24oKXthR1RNLmYuZXZMc3RuKHdpbmRvdywiZXJyb3IiLGZ1bmN0aW9uKGUpe2lmKG51bGwhPT1lKXt2YXIgdD0ic3RyaW5nIj09dHlwZW9mIGUubWVzc2FnZT9lLm1lc3NhZ2U6IiIsYT0ic3RyaW5nIj09dHlwZW9mIGUuZmlsZW5hbWU/ZS5maWxlbmFtZToiIjtpZigic2NyaXB0IGVycm9yLiI9PXQudG9Mb3dlckNhc2UoKSl7aWYoIWEpcmV0dXJuO3Q9dC5yZXBsYWNlKCIuIiwiOiIpKyIgZXJyb3IgZnJvbSBvdGhlciBkb21haW4uIn1hJiYodCs9IiB8IGZpbGU6ICIrYSk7dmFyIG49YUdUTS5mLnN0cmNsZWFuKGUubGluZW5vKTsiMCI9PW4mJihuPSIiKSxuJiYodCs9IiB8IGxpbmU6ICIrbik7dmFyIG89YUdUTS5mLnN0cmNsZWFuKGUuY29sbm8pOyIwIj09byYmKG89IiIpLG8mJih0Kz0iIHwgY29sOiAiK28pLGFHVE0uZC5lcnJvcnMucHVzaCh0KTt2YXIgcj0iIjt0cnl7cj1uYXZpZ2F0b3IuYXBwQ29kZU5hbWUrIiB8ICIrbmF2aWdhdG9yLmFwcE5hbWUrIiB8ICIrbmF2aWdhdG9yLmFwcFZlcnNpb24rIiB8ICIrbmF2aWdhdG9yLnBsYXRmb3JtfWNhdGNoKGUpe31pZihhR1RNLmQuZXJyb3JfY291bnRlcisrPj0xMDApcmV0dXJuO2FHVE0uZC5lcnJvcl9jb3VudGVyPD01JiZhR1RNLmYuZmlyZSh7ZXZlbnQ6ImV4Y2VwdGlvbiIsZXJybXNnOnQsYnJvd3NlcjpyLGVycnR5cGU6IkpTIEVycm9yIix0aW1lc3RhbXA6KG5ldyBEYXRlKS5nZXRUaW1lKCksZXJyY3Q6YUdUTS5kLmVycm9yX2NvdW50ZXIsZXZlbnRNb2RlbDpudWxsfSl9fSl9LGFHVE0uZi50aW1lcmZrdD1mdW5jdGlvbihlKXt2YXIgdD1KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihlKSk7dC50aW1lcl9tcz0xKnQudGltZXJfbXMsdC50aW1lcl9jdCsrLHQudGltZXJfdG09dC50aW1lcl9tcyp0LnRpbWVyX2N0LHQudGltZXJfc2M9cGFyc2VGbG9hdCgodC50aW1lcl90bS8xZTMpLnRvRml4ZWQoMykpLHQuZXZlbnQ9dC5ldmVudHx8InRpbWVyIiwtMSE9PXQuZXZlbnQuaW5kZXhPZigiW3NdIikmJih0LmV2ZW50PXQuZXZlbnQucmVwbGFjZSgiW3NdIix0LnRpbWVyX3NjLnRvU3RyaW5nKCkpKSx0LmV2ZW50TW9kZWw9bnVsbCxhR1RNLmYuZmlyZSh0KX0sYUdUTS5mLnRpbWVyPWZ1bmN0aW9uKGUsdCxhLG4sbyl7aWYoIWUmJiJvYmplY3QiPT10eXBlb2YgYSYmYSYmInN0cmluZyI9PXR5cGVvZiBhLmV2ZW50JiYoZT1hLmV2ZW50KSxlPWV8fCJ0aW1lciIsZSs9Il8iKyhuZXcgRGF0ZSkuZ2V0VGltZSgpLnRvU3RyaW5nKCkrIl8iK01hdGguZmxvb3IoOTk5OTk5Kk1hdGgucmFuZG9tKCkrMSkudG9TdHJpbmcoKSxhR1RNLmYuc3RvcHRpbWVyKGUpLCJvYmplY3QiPT10eXBlb2YgYSYmYSl2YXIgcj1KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihhKSk7ZWxzZSByPXt9O3IudGltZXJfbm09ZSxyLnRpbWVyX21zPW4sci50aW1lcl9ycD1vLHIudGltZXJfY3Q9MCxyLmlkPTE9PT1yLnRpbWVyX3JwP3NldFRpbWVvdXQoZnVuY3Rpb24oKXt0P3Qocik6YUdUTS5mLnRpbWVyZmt0KHIpfSxuKTpzZXRJbnRlcnZhbChmdW5jdGlvbigpe3Q/dChyKTphR1RNLmYudGltZXJma3Qociksci50aW1lcl9jdCsrLHIudGltZXJfcnA+MCYmci50aW1lcl9jdD49ci50aW1lcl9ycCYmYUdUTS5mLnN0b3B0aW1lcihyLnRpbWVyX25tKX0sbiksYUdUTS5kLnRpbWVyW2VdPXJ9LGFHVE0uZi5zdG9wdGltZXI9ZnVuY3Rpb24oZSl7aWYoIm9iamVjdCIhPXR5cGVvZiBhR1RNLmQudGltZXImJihhR1RNLmQudGltZXI9e30pLCJvYmplY3QiPT10eXBlb2YgYUdUTS5kLnRpbWVyW2VdKXt2YXIgdD1hR1RNLmQudGltZXJbZV07MT09PXQudGltZXJfcnA/Y2xlYXJUaW1lb3V0KHQuaWQpOmNsZWFySW50ZXJ2YWwodC5pZCksZGVsZXRlIGFHVE0uZC50aW1lcltlXX19LGFHVE0uZi5kbHJlcGVhdD1mdW5jdGlvbihlKXtpZigib2JqZWN0Ij09dHlwZW9mIGUmJmUmJiFhR1RNLmQuZGxyZXBlYXREb25lKXt2YXIgZGJnPWZ1bmN0aW9uKHQsYSl7ZS5kZWJ1ZyYmIm9iamVjdCI9PXR5cGVvZiB3aW5kb3cuY29uc29sZSYmd2luZG93LmNvbnNvbGUubG9nJiZ3aW5kb3cuY29uc29sZS5sb2coImFHVE0gZGxyZXBlYXQ6ICIrdCxhKX0sZ2V0U3JjPWZ1bmN0aW9uKCl7cmV0dXJuImxpdmUiPT1lLnNvdXJjZT93aW5kb3dbYUdUTS5jLmdkbF18fFtdOiJkbCI9PWUuc291cmNlP2FHVE0uZC5kbHx8W106YUdUTS5kLmZ8fFtdfSxtYXRjaExpc3Q9ZnVuY3Rpb24oZSx0KXtmb3IodmFyIGE9ZS5zcGxpdCgiLCIpLG49MDtuPGEubGVuZ3RoO24rKyl7dmFyIG89YVtuXS5yZXBsYWNlKC9eXHMrfFxzKyQvZywiIik7aWYobyl7dmFyIHI9by5yZXBsYWNlKC9bLiorP14ke30oKXxbXF1cXF0vZywiXFwkJiIpLnJlcGxhY2UoL1xcXCovZywiLioiKTt0cnl7aWYobmV3IFJlZ0V4cCgiXiIrcisiJCIsImkiKS50ZXN0KHQpKXJldHVybiEwfWNhdGNoKGUpe319fXJldHVybiExfSxwYXJzZUNvbmQ9ZnVuY3Rpb24oZSl7aWYoIWUpcmV0dXJuIG51bGw7dmFyIHQ9ZS5pbmRleE9mKCJbIik7aWYodDwwKXJldHVybntldjplLGF0dHI6bnVsbCx2YWw6bnVsbH07dmFyIGE9ZS5pbmRleE9mKCJdIik7aWYoYTx0fHwhZS5zdWJzdHJpbmcoMCx0KSlyZXR1cm4gbnVsbDtpZihhKzEhPT1lLmxlbmd0aClyZXR1cm4gbnVsbDt2YXIgbj1lLnN1YnN0cmluZyh0KzEsYSksbz1uLmluZGV4T2YoIjoiKSxyPW8+PTA/bi5zdWJzdHJpbmcoMCxvKTpuO3JldHVybiByP3tldjplLnN1YnN0cmluZygwLHQpLGF0dHI6cix2YWw6bz49MD9uLnN1YnN0cmluZyhvKzEpOm51bGx9Om51bGx9LHRyaW09ZnVuY3Rpb24oZSl7cmV0dXJuIGUucmVwbGFjZSgvXlxzK3xccyskL2csIiIpfSx0PVtdO2lmKGUuZ2F0ZUV2ZW50cylmb3IodmFyIGE9ZS5nYXRlRXZlbnRzLnNwbGl0KCIsIiksbj0wO248YS5sZW5ndGg7bisrKXt2YXIgbz10cmltKGFbbl0pO2lmKG8pe3ZhciByPW8uaW5kZXhPZigiP2lmPSIpO2lmKHI8MCl0LnB1c2goe25hbWU6byxjb25kOm51bGx9KTtlbHNle3ZhciBzPXRyaW0oby5zdWJzdHJpbmcoMCxyKSk7aWYocyl7dmFyIGk9cGFyc2VDb25kKHRyaW0oby5zdWJzdHJpbmcocis0KSkpO2l8fGRiZygiaW52YWxpZCA/aWY9IHByZWRpY2F0ZSwgZ2F0ZSB0cmVhdGVkIGFzIHVuY29uZGl0aW9uYWw6ICIrbyksdC5wdXNoKHtuYW1lOnMsY29uZDppfSl9ZWxzZSBkYmcoImdhdGUgdG9rZW4gd2l0aCBlbXB0eSBuYW1lIGJlZm9yZSA/aWY9LCBza2lwcGVkOiAiK28pfX19dmFyIGhhc0V2ZW50PWZ1bmN0aW9uKGUsdCl7Zm9yKHZhciBhPTA7YTxlLmxlbmd0aDthKyspaWYoZVthXSYmZVthXS5ldmVudD09PXQpcmV0dXJuITA7cmV0dXJuITF9LGNvbmRTdGF0ZT1mdW5jdGlvbihlLHQpe2Zvcih2YXIgYT0hMSxuPTA7bjxlLmxlbmd0aDtuKyspe3ZhciBvPWVbbl07aWYobyYmby5ldmVudD09PXQuZXYpe2lmKGE9ITAsbnVsbD09dC5hdHRyKXJldHVybiAxO3ZhciByPW9bdC5hdHRyXTtpZihudWxsPT10LnZhbCl7aWYobnVsbCE9ciYmIiIhPT1yKXJldHVybiAxfWVsc2UgaWYoU3RyaW5nKHIpPT09dC52YWwpcmV0dXJuIDF9fXJldHVybiBhPzA6LTF9LGdhdGVSZWFkeT1mdW5jdGlvbihlKXtmb3IodmFyIGE9MDthPHQubGVuZ3RoO2ErKyl7dmFyIG49dFthXTtpZihuLmNvbmQpe3ZhciBvPWNvbmRTdGF0ZShlLG4uY29uZCk7aWYoMD09PW8pY29udGludWU7aWYoLTE9PT1vKXJldHVybiExfWlmKCFoYXNFdmVudChlLG4ubmFtZSkpcmV0dXJuITF9cmV0dXJuITB9LHBhc3Nlcz1mdW5jdGlvbih0KXtpZigib2JqZWN0IiE9dHlwZW9mIHR8fCF0KXJldHVybiExO2lmKCEwPT09dC5hR1RNcmVwZWF0ZWQpcmV0dXJuITE7aWYoITA9PT10LmFHVE1kbCl7aWYoIWUuZ3RtRmlyZWQpcmV0dXJuITF9ZWxzZSBpZighZS5hZ3RtRmlyZWQpcmV0dXJuITE7cmV0dXJuKCJzdHJpbmciIT10eXBlb2YgdC5ldmVudHx8MCE9PXQuZXZlbnQuaW5kZXhPZigiYUdUTSIpKSYmKCgic3RyaW5nIj09dHlwZW9mIHQuZXZlbnR8fCJzdHJpbmciIT10eXBlb2YgdC50eXBlfHwib2JqZWN0IiE9dHlwZW9mIHQuZmxhZ3N8fCF0LmZsYWdzfHwhdC5mbGFncy5lbmFibGVVbnRhZ2dlZFBhZ2VSZXBvcnRpbmcpJiYoISghZS5ndG1FdmVudHMmJiJzdHJpbmciPT10eXBlb2YgdC5ldmVudCYmL15ndG1cLihzdGFydHxpbml0X2NvbnNlbnR8aW5pdHxqc3xkb218bG9hZCkkL2kudGVzdCh0LmV2ZW50KSkmJighKGUud2hpdGVsaXN0JiYic3RyaW5nIj09dHlwZW9mIHQuZXZlbnQmJiFtYXRjaExpc3QoZS53aGl0ZWxpc3QsdC5ldmVudCkpJiYoKCFlLmJsYWNrbGlzdHx8InN0cmluZyIhPXR5cGVvZiB0LmV2ZW50fHwhbWF0Y2hMaXN0KGUuYmxhY2tsaXN0LHQuZXZlbnQpKSYmISghZS5tZXNzYWdlcyYmInN0cmluZyIhPXR5cGVvZiB0LmV2ZW50KSkpKSl9LGRvUmVwbGF5PWZ1bmN0aW9uKGEpe2FHVE0uZC5kbHJlcGVhdERvbmU9ITA7Zm9yKHZhciBuPWdldFNyYygpLG89biYmIm51bWJlciI9PXR5cGVvZiBuLmxlbmd0aD9uLmxlbmd0aDowLHI9Im9iamVjdCI9PXR5cGVvZiBhR1RNLmQuY29uc2VudCYmYUdUTS5kLmNvbnNlbnQmJmFHVE0uZC5jb25zZW50Lmd0bUNvbnNlbnQscz0wLGk9ZS5tYXhFdmVudHN8fDAsYz0wLFQ9MDtUPG87VCsrKWlmKHBhc3NlcyhuW1RdKSl7aWYoaSYmcz49aSlicmVhaztzKys7dmFyIE09SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYobltUXSkpO2lmKGUuY2xlYXJFY29tJiZyJiZ2b2lkIDAhPT1NLmVjb21tZXJjZSYmYUdUTS5mLmZpcmUoe2Vjb21tZXJjZTpudWxsLGFHVE1yZXBlYXRlZDohMH0pLGRlbGV0ZSBNLmFHVE10cyxkZWxldGUgTS5hR1RNcGFyYW1zLGRlbGV0ZSBNLmV2ZW50TW9kZWwsZGVsZXRlIE1bImd0bS51bmlxdWVFdmVudElkIl0sTS5hR1RNcmVwZWF0ZWQ9ITAsZS5hZGRwYXJhbWV0ZXImJmUuYWRkcGFyYW1ldGVyLmxlbmd0aClmb3IodmFyIGQ9MDtkPGUuYWRkcGFyYW1ldGVyLmxlbmd0aDtkKyspZS5hZGRwYXJhbWV0ZXJbZF0mJmUuYWRkcGFyYW1ldGVyW2RdLnBrZXkmJihNW2UuYWRkcGFyYW1ldGVyW2RdLnBrZXldPWUuYWRkcGFyYW1ldGVyW2RdLnB2YWx1ZSk7YUdUTS5mLmZpcmUoTSksYysrfXZhciBHPWE/IiI6ZnVuY3Rpb24oZSl7Zm9yKHZhciBhPVtdLG49MDtuPHQubGVuZ3RoO24rKyl7dmFyIG89dFtuXTtpZihvLmNvbmQpe3ZhciByPWNvbmRTdGF0ZShlLG8uY29uZCk7aWYoMD09PXIpY29udGludWU7aWYoLTE9PT1yKXthLnB1c2goby5jb25kLmV2KTtjb250aW51ZX19aGFzRXZlbnQoZSxvLm5hbWUpfHxhLnB1c2goby5uYW1lKX1yZXR1cm4gYX0obikuam9pbigiLCIpOyFhJiZlLmZhbGxiYWNrRXZlbnQmJmM+MCYmYUdUTS5mLmZpcmUoe2V2ZW50OiJhR1RNX3JlcGVhdF9mYWxsYmFjayIsYUdUTXJlcGVhdENvdW50OmMsYUdUTXJlcGVhdFNvdXJjZTplLnNvdXJjZSxhR1RNcmVwZWF0TWlzc2luZzpHLGFHVE1yZXBlYXRXYWl0ZWQ6Zn0pLGRiZygicmVwbGF5ZWQgIitjKyIgZXZlbnQocyksIGVucmljaGVkPSIrKGE/InllcyI6Im5vKGZhbGxiYWNrKSIpKyhhPyIiOiIsIG1pc3Npbmc9IitHKSl9O2lmKGRiZygic3RhcnQiLGUpLCFhR1RNLmQuZGxyZXBlYXRQb2xsaW5nKWlmKGdhdGVSZWFkeShnZXRTcmMoKSkpZG9SZXBsYXkoITApO2Vsc2V7YUdUTS5kLmRscmVwZWF0UG9sbGluZz0hMDt2YXIgYz0ibnVtYmVyIj09dHlwZW9mIGUucG9sbE1zJiZlLnBvbGxNcz49NTA/ZS5wb2xsTXM6MzAwLGY9Im51bWJlciI9PXR5cGVvZiBlLnRpbWVvdXRNcyYmZS50aW1lb3V0TXM+MD9lLnRpbWVvdXRNczowLFQ9Zj4wP2Y6M2U0LE09MCxkPXNldEludGVydmFsKGZ1bmN0aW9uKCl7aWYoYUdUTS5kLmRscmVwZWF0RG9uZSljbGVhckludGVydmFsKGQpO2Vsc2V7aWYoZ2F0ZVJlYWR5KGdldFNyYygpKSlyZXR1cm4gY2xlYXJJbnRlcnZhbChkKSx2b2lkIGRvUmVwbGF5KCEwKTsoTSs9Yyk+PVQmJihjbGVhckludGVydmFsKGQpLGY+MD9kb1JlcGxheSghMSk6KGFHVE0uZC5kbHJlcGVhdFBvbGxpbmc9ITEsZGJnKCJnYXRlIG5ldmVyIHNhdGlzZmllZCB3aXRoaW4gY2FwIGFuZCBubyBmYWxsYmFjayAtIG5vdGhpbmcgcmVwZWF0ZWQ7IHBvbGxpbmcgcmVsZWFzZWQgZm9yIGEgbGF0ZXIgY2FsbCIpKSl9fSxjKX19fSxhR1RNLmYuaW5pdD1mdW5jdGlvbigpeyFhR1RNLmMuZGVidWcmJmFHVE0uZi5vcHRvdXQoKXx8KGFHVE0uZi5jb25maWcoYUdUTS5jKSxhR1RNLmMuaWZyYW1lU3VwcG9ydCYmYUdUTS5kLmlzX2lmcmFtZT8oYUdUTS5kLmNvbnNlbnQuZ3RtQ29uc2VudD0hMCxhR1RNLmQuY29uc2VudC5oYXNSZXNwb25zZT0hMCxhR1RNLmQuY29uc2VudC5mZWVkYmFjaz0iUGFnZSBpcyBpRnJhbWUiLGFHVE0uZC5pZnJhbWUuaWZMaXN0ZW58fChhR1RNLmQuaWZyYW1lLmlmTGlzdGVuPSEwLHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCJtZXNzYWdlIixhR1RNLmYuaWZIU2xpc3RlbikpLGFHVE0uZC5pbml0fHxhR1RNLmYuaW5qZWN0KCkpOiJzdHJpbmciPT10eXBlb2YgYUdUTS5jLmNtcCYmYUdUTS5jLmNtcD8ibm9uZSI9PWFHVE0uYy5jbXA/KGFHVE0uZC5jb25zZW50PXtndG1Db25zZW50OiEwLGhhc1Jlc3BvbnNlOiEwLGZlZWRiYWNrOiJObyBDb25zZW50IENoZWNrIGNvbmZpZ3VyZWQifSxhR1RNLmYuaW5qZWN0KCkpOihhR1RNLmYubG9hZF9jYyhhR1RNLmMuY21wLGFHVE0uZi5jb25zZW50X2xpc3RlbmVyKSxhR1RNLmYuaW5pdEdUTSghMCkpOihhR1RNLmYuY29uc2VudF9saXN0ZW5lcigpLGFHVE0uZi5pbml0R1RNKCEwKSksYUdUTS5mLmpzZXJyb3JzKCkpfSxhR1RNLmYuZW5jPWZ1bmN0aW9uKGUsdCl7dmFyIGE9dCU2MysxLG49YnRvYSh1bmVzY2FwZShlbmNvZGVVUklDb21wb25lbnQoZSkpKSxvPTA7Ij0iPT09bi5jaGFyQXQobi5sZW5ndGgtMSkmJm8rKywiPSI9PT1uLmNoYXJBdChuLmxlbmd0aC0yKSYmbysrLG49bi5zbGljZSgwLG4ubGVuZ3RoLW8pO2Zvcih2YXIgcj0xPT09bz8ifiI6Mj09PW8/In5+IjoiIixzPSIiLGk9MDtpPG4ubGVuZ3RoO2krKyl7dmFyIGM9IkFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU2Nzg5Ky8iLmluZGV4T2Yobi5jaGFyQXQoaSkpO3MrPWM8MD9uLmNoYXJBdChpKToiQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ejAxMjM0NTY3ODktXyIuY2hhckF0KChjK2EpJTY0KX1yZXR1cm4gbz9zLnNsaWNlKDAsMykrcitzLnNsaWNlKDMpOnN9LGFHVE0uZi54c2VuZD1mdW5jdGlvbihlLHQsYSxuKXtpZihlJiYic3RyaW5nIj09dHlwZW9mIGUpdHJ5e3ZhciBvLHI9bmV3IFhNTEh0dHBSZXF1ZXN0O3JldHVybiByLm9wZW4oIlBPU1QiLGUsITApLHIuc2V0UmVxdWVzdEhlYWRlcigiQ29udGVudC1UeXBlIiwiYXBwbGljYXRpb24vanNvbiIpLG89YSYmIm51bWJlciI9PXR5cGVvZiBuJiZuPj0xPyd7InEiOiInK2FHVE0uZi5lbmMoYUdUTS5mLnNTdHJmKHQpLG4pKycifSc6J3siZSI6JythR1RNLmYuc1N0cmYodCkrIn0iLHIuc2VuZChvKSxyfWNhdGNoKHQpe3JldHVybiBhR1RNLmYubG9nKCJlX3hzZW5kIix7bXNnOnQubWVzc2FnZSx1cmw6ZX0pLG51bGx9fSxhR1RNLmYuc2VuZG5hdXM9ZnVuY3Rpb24oZSl7aWYoZSYmIm9iamVjdCI9PXR5cGVvZiBlKXt2YXIgdD13aW5kb3dbYUdUTS5jLmdkbF0ucHVzaDshYUdUTS5kLm9yaWdpbmFsRExwdXNoJiYvc2FuZGJveC9pLnRlc3QodC50b1N0cmluZygpKSYmKGFHVE0uZC5vcmlnaW5hbERMcHVzaD10KTt2YXIgYT0hMTtpZihhR1RNLmMuZGxPcmdQdXNoJiZhR1RNLmQub3JpZ2luYWxETHB1c2gmJmFHVE0uZC5vcmlnaW5hbERMcHVzaCE9PXQpe3ZhciBuPXQudG9TdHJpbmcoKTsvc2FuZGJveC9pLnRlc3Qobik/YUdUTS5kLm9yaWdpbmFsRExwdXNoPXQ6KGE9ITAsYUdUTS5kLmRsSG9va0xvZ2dlZHx8KGFHVE0uZC5vcmlnaW5hbERMcHVzaCh7ZXZlbnQ6ImV4Y2VwdGlvbiIsZXJydHlwZToiREwgRXJyb3IiLGVycm1zZzoiRnVuY3Rpb24gZGF0YUxheWVyLnB1c2ggaG9va2VkIC0gbm8gbG9uZ2VyIGZyb20gR1RNIixmY3RfaG9vazpuLGZjdF9vcmlnOmFHVE0uZC5vcmlnaW5hbERMcHVzaC50b1N0cmluZygpLHRpbWVzdGFtcDoobmV3IERhdGUpLmdldFRpbWUoKSxldmVudE1vZGVsOm51bGx9KSxhR1RNLmQuZGxIb29rTG9nZ2VkPSEwKSwicmVzdG9yZSI9PT1hR1RNLmMuZGxPcmdQdXNoJiYod2luZG93W2FHVE0uYy5nZGxdLnB1c2g9YUdUTS5kLm9yaWdpbmFsRExwdXNoLGE9ITEpKX1hJiYidXNlIj09PWFHVE0uYy5kbE9yZ1B1c2g/YUdUTS5kLm9yaWdpbmFsRExwdXNoKGUpOndpbmRvd1thR1RNLmMuZ2RsXS5wdXNoKGUpLCJmdW5jdGlvbiI9PXR5cGVvZiBhR1RNLmYuc2VuZG5hdXNfY2FsbGJhY2smJmFHVE0uZi5zZW5kbmF1c19jYWxsYmFjayhlKSxhR1RNLmYubG9nKCJtOSIsZSl9fSxhR1RNLmYuZmlyZT1mdW5jdGlvbihlKXtpZigib2JqZWN0Ij09dHlwZW9mIGUmJmUpe3RyeXtpZighKGE9SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYoZSkpKSlyZXR1cm4gdm9pZCBhR1RNLmYubG9nKCJlMTUiLGEpfWNhdGNoKG4pe3ZhciB0PSJhR1RNIEZpcmUgRXJyb3IgKEpTT04ucGFyc2UpIjsic3RyaW5nIj09dHlwZW9mIGUuZXZlbnQmJih0PXQrIiAoRXZlbnQ6ICIrZS5ldmVudCsiKSIpO3ZhciBhPXtldmVudDoiZXhjZXB0aW9uIixlcnJtc2c6bi5tZXNzYWdlLGVycnR5cGU6dCx0aW1lc3RhbXA6KG5ldyBEYXRlKS5nZXRUaW1lKCksZXJyY3Q6YUdUTS5kLmVycm9yX2NvdW50ZXJ8fDEsZXZlbnRNb2RlbDpudWxsfTthR1RNLmYubG9nKCJlMTUiLGEpfWlmKCEoIm51bWJlciI9PXR5cGVvZiBhLmFHVE10c3x8Im9iamVjdCI9PXR5cGVvZiBhLmV2ZW50TW9kZWwmJmEuZXZlbnRNb2RlbHx8InN0cmluZyIhPXR5cGVvZiBhLmV2ZW50JiYic3RyaW5nIj09dHlwZW9mIGEudHlwZSYmIm9iamVjdCI9PXR5cGVvZiBhLmZsYWdzJiYiYm9vbGVhbiI9PXR5cGVvZiBhLmZsYWdzLmVuYWJsZVVudGFnZ2VkUGFnZVJlcG9ydGluZyYmYS5mbGFncy5lbmFibGVVbnRhZ2dlZFBhZ2VSZXBvcnRpbmcpKXtpZihhLmFHVE10cz1EYXRlLm5vdygpLGEuZXZlbnRNb2RlbD1udWxsLGFHVE0uYy5jb25zZW50X2V2ZW50cyYmInN0cmluZyI9PXR5cGVvZiBhLmV2ZW50JiYoIiwiK2FHVE0uYy5jb25zZW50X2V2ZW50cysiLCIpLmluZGV4T2YoIiwiK2EuZXZlbnQrIiwiKT49MClpZigib2JqZWN0Ij09dHlwZW9mIGFHVE0uYy5jb25zZW50X2V2ZW50X2F0dHJbYS5ldmVudF0pZm9yKHZhciBuIGluIGFHVE0uYy5jb25zZW50X2V2ZW50X2F0dHJbYS5ldmVudF0pdm9pZCAwIT09YVtuXSYmKGFHVE0uYy5jb25zZW50X2V2ZW50X2F0dHJbYS5ldmVudF1bbl0mJmFbbl0hPWFHVE0uYy5jb25zZW50X2V2ZW50X2F0dHJbYS5ldmVudF1bbl18fGFHVE0uZi5ydW5fY2MoInVwZGF0ZSIpKTtlbHNlIGFHVE0uZi5ydW5fY2MoInVwZGF0ZSIpO2lmKGFHVE0uYy5kbFNldCYmIm9iamVjdCI9PXR5cGVvZiBnb29nbGVfdGFnX21hbmFnZXImJiJvYmplY3QiPT10eXBlb2YgZ29vZ2xlX3RhZ19tYW5hZ2VyW2FHVE0uYy5ndG1JRF0mJk9iamVjdC5rZXlzKGFHVE0uYy5kbFNldCkuZm9yRWFjaChmdW5jdGlvbihlKXt2YXIgdD1hR1RNLmMuZGxTZXRbZV0sbj1nb29nbGVfdGFnX21hbmFnZXJbYUdUTS5jLmd0bUlEXVthR1RNLmMuZ2RsXS5nZXQodCk7dm9pZCAwIT09biYmKGFbZV09bil9KSwoIm9iamVjdCIhPXR5cGVvZiBhR1RNLmQuY29uc2VudHx8IWFHVE0uZC5jb25zZW50Lmhhc1Jlc3BvbnNlfHwhYUdUTS5kLmNvbnNlbnQuZ3RtQ29uc2VudCkmJigic3RyaW5nIiE9dHlwZW9mIGEuZXZlbnR8fDAhPT1hLmV2ZW50LmluZGV4T2YoImFHVE0iKSkmJiFhLl9ub0NvbnNlbnR8fGFHVE0uYy5pZnJhbWVTdXBwb3J0JiZhR1RNLmQuaXNfaWZyYW1lJiYhYUdUTS5kLmlmcmFtZS5vcmlnaW4pcmV0dXJuIGRlbGV0ZSBhLmFHVE10cyxkZWxldGUgYS5ldmVudE1vZGVsLHZvaWQgYUdUTS5kLmYucHVzaChKU09OLnBhcnNlKGFHVE0uZi5zU3RyZihhKSkpO2lmKGEuX3Bvc3QmJiFhLl9wb3N0X3NlbnQpe3ZhciBvPSJvYmplY3QiPT10eXBlb2YgYS5fcG9zdD9hLl9wb3N0Ont9LHI9InN0cmluZyI9PXR5cGVvZiBvLnVybCYmby51cmw/by51cmw6YUdUTS5jLnRyYW5zcG9ydF91cmw7aWYocil7dmFyIHM9ImJvb2xlYW4iPT10eXBlb2Ygby5lbmM/by5lbmM6ISFhR1RNLmMudHJhbnNwb3J0X2VuYyxpPSJudW1iZXIiPT10eXBlb2Ygby5zYWx0JiZvLnNhbHQ+PTE/by5zYWx0OiJudW1iZXIiPT10eXBlb2YgYUdUTS5jLnRyYW5zcG9ydF9zYWx0JiZhR1RNLmMudHJhbnNwb3J0X3NhbHQ+PTE/YUdUTS5jLnRyYW5zcG9ydF9zYWx0OmFHVE0uYy5zZXNzaW9uX3NhbHR8fDAsYz1KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihhKSk7ZGVsZXRlIGMuX3Bvc3QsZGVsZXRlIGMuX3Bvc3Rfc2VudCxkZWxldGUgYy5ldmVudE1vZGVsLG8uY29uc2VudCYmIm9iamVjdCI9PXR5cGVvZiBhR1RNLmQuY29uc2VudCYmKGMuY29uc2VudD1KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihhR1RNLmQuY29uc2VudCkpKSxhR1RNLmYueHNlbmQocixjLHMsaSksYS5fcG9zdF9zZW50PSEwfX0oYUdUTS5kLmNvbnNlbnQuZ3RtQ29uc2VudHx8InN0cmluZyI9PXR5cGVvZiBhLmV2ZW50JiYwPT09YS5ldmVudC5pbmRleE9mKCJhR1RNIil8fGEuX25vQ29uc2VudCkmJigic3RyaW5nIj09dHlwZW9mIGEuZXZlbnQmJjA9PT1hLmV2ZW50LmluZGV4T2YoImFHVE0iKXx8KGRlbGV0ZSBhWyJndG0udW5pcXVlRXZlbnRJZCJdLGRlbGV0ZSBhLmFHVE1wYXJhbXMsYS5hR1RNcGFyYW1zPUpTT04ucGFyc2UoYUdUTS5mLnNTdHJmKGEpKSksYUdUTS5kLmRsLnB1c2goYSksYS5fbm9ETFB1c2g/ImZ1bmN0aW9uIj09dHlwZW9mIGFHVE0uZi5zZW5kbmF1c19jYWxsYmFjayYmYUdUTS5mLnNlbmRuYXVzX2NhbGxiYWNrKGEpOmFHVE0uYy5pZnJhbWVTdXBwb3J0JiZhR1RNLmQuaXNfaWZyYW1lJiYic3RyaW5nIj09dHlwZW9mIGEuZXZlbnQ/YUdUTS5mLmlGcmFtZUZpcmUoYSk6YUdUTS5mLnNlbmRuYXVzKGEpKSwiZnVuY3Rpb24iPT10eXBlb2YgYUdUTS5mLmZpcmVfY2FsbGJhY2smJmFHVE0uZi5maXJlX2NhbGxiYWNrKGEpLGFHVE0uZi5sb2coIm03IixhKX19ZWxzZSBhR1RNLmYubG9nKCJlOSIse286dHlwZW9mIGV9KX07');
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
