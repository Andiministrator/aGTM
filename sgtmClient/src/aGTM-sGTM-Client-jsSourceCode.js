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
  sourcesMethod: data.sources_method || 'last_touch',
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
        // library expects aGTM.d.session.attribution keyed by method.
        if (parsed.attribution && typeof parsed.attribution === 'object') {
          sessionData.attribution = {};
          sessionData.attribution[CFG.sourcesMethod || 'last_touch'] = parsed.attribution;
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
  const agtm = fromBase64('d2luZG93LmFHVE09d2luZG93LmFHVE18fHt9LHdpbmRvdy5hR1RNLmM9d2luZG93LmFHVE0uY3x8e30sd2luZG93LmFHVE0uZD13aW5kb3cuYUdUTS5kfHx7fSx3aW5kb3cuYUdUTS5mPXdpbmRvdy5hR1RNLmZ8fHt9LHdpbmRvdy5hR1RNLmw9d2luZG93LmFHVE0ubHx8W10sd2luZG93LmFHVE0ubj13aW5kb3cuYUdUTS5ufHx7fSxhR1RNLmYucHJvcHNldD1mdW5jdGlvbihlLHQsYSl7dHJ5e2VbdF09ZVt0XXx8YX1jYXRjaChlKXt9fSxhR1RNLmYub2JqaW5pdD1mdW5jdGlvbigpe1tbYUdUTS5kLCJ2ZXJzaW9uIiwiMS41Il0sW2FHVE0uZCwiZiIsW11dLFthR1RNLmQsImNvbmZpZyIsITFdLFthR1RNLmQsImluaXQiLCExXSxbYUdUTS5kLCJkb21fcmVhZHkiLCExXSxbYUdUTS5kLCJwYWdlX3JlYWR5IiwhMV0sW2FHVE0uZCwiaXNfaWZyYW1lIix3aW5kb3cuc2VsZiE9PXdpbmRvdy50b3BdLFthR1RNLmQsImV2X2ZjdF9jdHIiLDBdLFthR1RNLmQsInRpbWVyIix7fV0sW2FHVE0uZCwiZXJyb3JfY291bnRlciIsMF0sW2FHVE0uZCwiZXJyb3JzIixbXV0sW2FHVE0uZCwiZGwiLFtdXSxbYUdUTS5kLCJzZXNzaW9uIix7fV0sW2FHVE0uZCwic2Vzc2lvbl9zdGF0dXMiLCIiXSxbYUdUTS5kLCJjb25zZW50X2hhc2giLCIiXSxbYUdUTS5kLCJsYXN0X2NvbnNlbnRfaGFzaCIsIiJdLFthR1RNLmQsImlmcmFtZSIse2NvdW50ZXI6e2V2ZW50czowfSxvcmlnaW46IiIsaWZMaXN0ZW46ITEsdG9wTGlzdGVuOiExLGhhbmRzaGFrZTohMSx0aW1lcjpudWxsfV0sW2FHVE0uZCwibGFzdF91cmwiLGxvY2F0aW9uLmhyZWZdLFthR1RNLmYsInRsIix7fV0sW2FHVE0uZiwiZGwiLHt9XSxbYUdUTS5mLCJwbCIse31dLFthR1RNLCJsIixbXV0sW2FHVE0ubiwiY2siLCJjb29raWUiXSxbYUdUTS5uLCJ0bSIsImdvb2dsZXRhZ21hbmFnZXIiXSxbYUdUTS5uLCJ0YSIsInRhZ2Fzc2lzdGFudC5nb29nbGUiXV0uZm9yRWFjaChmdW5jdGlvbihlKXthR1RNLmYucHJvcHNldChlWzBdLGVbMV0sZVsyXSl9KX0sYUdUTS5mLm9iamluaXQoKSxhR1RNLmYubG9nPWZ1bmN0aW9uKGUsdCl7dmFyIGE9Im9iamVjdCI9PXR5cGVvZiB0JiZ0P0pTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkodCkpOnQ7YUdUTS5sLnB1c2goe2lkOmUsdGltZXN0YW1wOihuZXcgRGF0ZSkuZ2V0VGltZSgpLG9iajphfSl9LGFHVE0uZi5zdHJjbGVhbj1mdW5jdGlvbihlKXtyZXR1cm4gdm9pZCAwPT09ZXx8Im9iamVjdCI9PXR5cGVvZiBlJiYhZT8iIjooInN0cmluZyIhPXR5cGVvZiBlJiYoZT1lLnRvU3RyaW5nKCkpLGUucmVwbGFjZSgvW15hLXrDpMO2w7zDn0EtWsOEw5bDnDAtOV8tXS9nLCIiKSl9LGFHVE0uZi5zU3RyZj1mdW5jdGlvbihlKXtpZigib2JqZWN0IiE9dHlwZW9mIGV8fCFlKXt2YXIgdD1KU09OLnN0cmluZ2lmeSh7ZXZlbnQ6ImV4Y2VwdGlvbiIsZXJybXNnOiJEYXRhTGF5ZXIgRW50cnkgaXMgbm8gb2JqZWN0IixlcnJ0eXBlOiJETCBFcnJvciIsb2JqX3R5cGU6dHlwZW9mIGUsb2JqX3ZhbHVlOmV9KTtyZXR1cm4gYUdUTS5mLmxvZygiZTE2IixKU09OLnBhcnNlKHQpKSxKU09OLnN0cmluZ2lmeShudWxsKX12YXIgYT1bXTtyZXR1cm4gSlNPTi5zdHJpbmdpZnkoZSxmdW5jdGlvbihlLHQpe2lmKCJvYmplY3QiPT10eXBlb2YgdCYmbnVsbCE9PXQpe2lmKC0xIT09YS5pbmRleE9mKHQpKXJldHVybiJbQ2lyY3VsYXJdIjthLnB1c2godCl9cmV0dXJuIHR9KX0sYUdUTS5mLmFuPWZ1bmN0aW9uKGUsdCxhLG4pe2VbdF09YS5oYXNPd25Qcm9wZXJ0eSh0KT9hW3RdOm59LGFHVE0uZi5jb25zZW50X3NlcmlhbGl6ZT1mdW5jdGlvbihlKXtpZighZXx8Im9iamVjdCIhPXR5cGVvZiBlKXJldHVybiIiO3ZhciB0PXtndG1Db25zZW50OjEsYmxvY2tlZDoxfSxhPVtdO2Zvcih2YXIgbiBpbiBlKWUuaGFzT3duUHJvcGVydHkobikmJiF0W25dJiZhLnB1c2gobik7YS5zb3J0KCk7Zm9yKHZhciBvPVtdLHI9MDtyPGEubGVuZ3RoO3IrKyl7dmFyIHM9YVtyXSxpPWVbc107IiIhPT1pJiZudWxsIT1pJiZvLnB1c2gocysiPSIrKCJvYmplY3QiPT10eXBlb2YgaT9KU09OLnN0cmluZ2lmeShpKTpTdHJpbmcoaSkpKX1yZXR1cm4gby5qb2luKCJ8Iil9LGFHVE0uZi5jb25maWc9ZnVuY3Rpb24oZSl7aWYoYUdUTS5kLmNvbmZpZykiZnVuY3Rpb24iPT10eXBlb2YgYUdUTS5mLmxvZyYmYUdUTS5mLmxvZygiZTEiLGFHVE0uYyk7ZWxzZXtpZihhR1RNLmYuYW4oYUdUTS5jLCJkZWJ1ZyIsZSwhMSksYUdUTS5mLmFuKGFHVE0uYywicGF0aCIsZSwiIiksYUdUTS5mLmFuKGFHVE0uYywiZmlsZSIsZSwiYUdUTS5qcyIpLGFHVE0uZi5hbihhR1RNLmMsImNtcCIsZSwiIiksYUdUTS5jLm1pbj0iYm9vbGVhbiIhPXR5cGVvZiBlLm1pbnx8ZS5taW4sYUdUTS5mLmFuKGFHVE0uYywibm9uY2UiLGUsIiIpLGFHVE0uZi5hbihhR1RNLmMsImlmcmFtZVN1cHBvcnQiLGUsITEpLGFHVE0uZi5hbihhR1RNLmMsInZQYWdldmlld3MiLGUsITEpLGFHVE0uZi5hbihhR1RNLmMsInZQYWdldmlld3NUaW1lciIsZSwwKSxhR1RNLmYuYW4oYUdUTS5jLCJ2UGFnZXZpZXdzRmFsbGJhY2siLGUsITEpLGFHVE0uZi5hbihhR1RNLmMsImd0bUlEIixlLCIiKSxlLmd0bSlmb3IodmFyIHQgaW4gZS5ndG0pZS5ndG0uaGFzT3duUHJvcGVydHkodCkmJihhR1RNLmMuZ3RtSUQ9YUdUTS5jLmd0bUlEfHx0LGFHVE0uYy5ndG09YUdUTS5jLmd0bXx8e30sYUdUTS5jLmd0bVt0XT1lLmd0bVt0XXx8e30sYUdUTS5mLmFuKGFHVE0uYy5ndG1bdF0sIm5vQ29uc2VudCIsZS5ndG1bdF0sITEpLGFHVE0uZi5hbihhR1RNLmMuZ3RtW3RdLCJlbnYiLGUuZ3RtW3RdLCIiKSxhR1RNLmYuYW4oYUdUTS5jLmd0bVt0XSwiaWRQYXJhbSIsZS5ndG1bdF0sIiIpLGFHVE0uZi5hbihhR1RNLmMuZ3RtW3RdLCJndG1VUkwiLGUuZ3RtW3RdLCIiKSxhR1RNLmYuYW4oYUdUTS5jLmd0bVt0XSwiZ3RtSlMiLGUuZ3RtW3RdLCIiKSk7aWYoYUdUTS5mLmFuKGFHVE0uYywiZ2RsIixlLCJkYXRhTGF5ZXIiKSxhR1RNLmYuYW4oYUdUTS5jLCJndG1QdXJwb3NlcyIsZSwiIiksYUdUTS5mLmFuKGFHVE0uYywiZ3RtU2VydmljZXMiLGUsIiIpLGFHVE0uZi5hbihhR1RNLmMsImd0bVZlbmRvcnMiLGUsIiIpLGFHVE0uZi5hbihhR1RNLmMsImd0bUF0dHIiLGUsbnVsbCksYUdUTS5mLmFuKGFHVE0uYywiZGxTZXQiLGUse30pLGFHVE0uZi5hbihhR1RNLmMsInVzZUxpc3RlbmVyIixlLCExKSxhR1RNLmYuYW4oYUdUTS5jLCJkbE9yZ1B1c2giLGUsIiIpLGFHVE0uYy5kbFN0YXRlRXZlbnRzPSJib29sZWFuIj09dHlwZW9mIGUuZGxTdGF0ZUV2ZW50cyYmZS5kbFN0YXRlRXZlbnRzLGFHVE0uYy5hUGFnZXZpZXc9ImJvb2xlYW4iPT10eXBlb2YgZS5hUGFnZXZpZXcmJmUuYVBhZ2V2aWV3LGFHVE0uYy52UGFnZXZpZXc9ImJvb2xlYW4iPT10eXBlb2YgZS52UGFnZXZpZXcmJmUudlBhZ2V2aWV3LGFHVE0uYy5zZW5kQ29uc2VudEV2ZW50PSJib29sZWFuIj09dHlwZW9mIGUuc2VuZENvbnNlbnRFdmVudCYmZS5zZW5kQ29uc2VudEV2ZW50LGFHVE0uZi5hbihhR1RNLmMsImNvbnNlbnRfZXZlbnRzIixlLCIiKSxhR1RNLmMuY29uc2VudF9ldmVudF9hdHRyPWFHVE0uYy5jb25zZW50X2V2ZW50X2F0dHJ8fHt9LCJzdHJpbmciPT10eXBlb2YgYUdUTS5jLmNvbnNlbnRfZXZlbnRzJiZhR1RNLmMuY29uc2VudF9ldmVudHMpe2Zvcih2YXIgYT1hR1RNLmMuY29uc2VudF9ldmVudHMuc3BsaXQoIiwiKSxuPVtdLG89MDtvPGEubGVuZ3RoO28rKyl7dmFyIHI9YVtvXS5yZXBsYWNlKC9eXHMrfFxzKyQvZywiIik7aWYocil7dmFyIHM9ci5pbmRleE9mKCJbIik7aWYocz49MCl7dmFyIGk9ci5zdWJzdHJpbmcoMCxzKSxjPXIuc3Vic3RyaW5nKHMrMSxyLmluZGV4T2YoIl0iKSksZj1jLmluZGV4T2YoIjoiKSxUPXt9O2Y+PTA/VFtjLnN1YnN0cmluZygwLGYpXT1jLnN1YnN0cmluZyhmKzEpOlRbY109IiIsYUdUTS5jLmNvbnNlbnRfZXZlbnRfYXR0cltpXT1ULG4ucHVzaChpKX1lbHNlIG4ucHVzaChyKX19YUdUTS5jLmNvbnNlbnRfZXZlbnRzPW4uam9pbigiLCIpfWlmKGFHVE0uZi5hbihhR1RNLmMsInRyYW5zcG9ydF91cmwiLGUsIiIpLGFHVE0uZi5hbihhR1RNLmMsInRyYW5zcG9ydF9lbmMiLGUsITEpLGFHVE0uZi5hbihhR1RNLmMsInRyYW5zcG9ydF9zYWx0IixlLDApLGFHVE0uZi5hbihhR1RNLmMsInVzZXJfaWQiLGUsIiIpLGFHVE0uZi5hbihhR1RNLmMsInNlc3Npb25fc2FsdCIsZSwwKSxhR1RNLmYuYW4oYUdUTS5jLCJjb25zZW50X3N0b3JlX3VybCIsZSwiIiksYUdUTS5mLmFuKGFHVE0uYywiY29uc2VudF9zdG9yZV9lbmMiLGUsITEpLGFHVE0uZi5hbihhR1RNLmMsImNvbnNlbnRfcG9sbF9tcyIsZSwyZTMpLGUuc2Vzc2lvbiYmIm9iamVjdCI9PXR5cGVvZiBlLnNlc3Npb24mJihlLnNlc3Npb24uc2lkfHxlLnNlc3Npb24uY29uc2VudCkpe2FHVE0uZC5zZXNzaW9uPUpTT04ucGFyc2UoYUdUTS5mLnNTdHJmKGUuc2Vzc2lvbikpO3ZhciBNPWUuc2Vzc2lvbi5jb25zZW50O00mJiJvYmplY3QiPT10eXBlb2YgTSYmITA9PT1NLmhhc1Jlc3BvbnNlJiYic3RyaW5nIj09dHlwZW9mIE0uc2VydmljZXM/KGFHVE0uZC5jb25zZW50PUpTT04ucGFyc2UoYUdUTS5mLnNTdHJmKE0pKSxhR1RNLmQuY29uc2VudF9oYXNoPWFHVE0uZi5jb25zZW50X3NlcmlhbGl6ZShhR1RNLmQuY29uc2VudCksYUdUTS5kLmxhc3RfY29uc2VudF9oYXNoPWFHVE0uZC5jb25zZW50X2hhc2gsYUdUTS5kLnNlc3Npb25fc3RhdHVzPSJwcmVzZXRfd2l0aF9jb25zZW50IixhR1RNLmYubG9nKCJtX3Nlc3Npb25fcHJlc2V0X2NvbnNlbnQiLE0pKTooYUdUTS5kLnNlc3Npb25fc3RhdHVzPSJwcmVzZXQiLGFHVE0uZi5sb2coIm1fc2Vzc2lvbl9wcmVzZXQiLGUuc2Vzc2lvbikpfWUuY29uc2VudD1lLmNvbnNlbnR8fHt9LGFHVE0uYy5jb25zZW50PWFHVE0uYy5jb25zZW50fHxlLmNvbnNlbnQsYUdUTS5mLmFuKGFHVE0uYy5jb25zZW50LCJoYXNSZXNwb25zZSIsZS5jb25zZW50LCExKSxhR1RNLmYuYW4oYUdUTS5jLmNvbnNlbnQsImZlZWRiYWNrIixlLmNvbnNlbnQsIiIpLGFHVE0uZi5hbihhR1RNLmMuY29uc2VudCwicHVycG9zZXMiLGUuY29uc2VudCwiIiksYUdUTS5mLmFuKGFHVE0uYy5jb25zZW50LCJzZXJ2aWNlcyIsZS5jb25zZW50LCIiKSxhR1RNLmYuYW4oYUdUTS5jLmNvbnNlbnQsInZlbmRvcnMiLGUuY29uc2VudCwiIiksYUdUTS5mLmFuKGFHVE0uYy5jb25zZW50LCJjb25zZW50X2lkIixlLmNvbnNlbnQsIiIpLHdpbmRvd1thR1RNLmMuZ2RsXT13aW5kb3dbYUdUTS5jLmdkbF18fFtdLGFHVE0uZC5jb25zZW50PWFHVE0uZC5jb25zZW50fHxKU09OLnBhcnNlKGFHVE0uZi5zU3RyZihhR1RNLmMuY29uc2VudCkpLCJib29sZWFuIiE9dHlwZW9mIGFHVE0uZC5jb25zZW50Lmd0bUNvbnNlbnQmJihhR1RNLmQuY29uc2VudC5ndG1Db25zZW50PSExKSxhR1RNLmQuY29uZmlnPSEwLGFHVE0uZC5ndG1Mb2FkZWQ9W10sImZ1bmN0aW9uIj09dHlwZW9mIGFHVE0uZi5sb2cmJmFHVE0uZi5sb2coIm0xIixhR1RNLmMpLCEwPT09YUdUTS5kLmNvbnNlbnQuaGFzUmVzcG9uc2UmJiJmdW5jdGlvbiI9PXR5cGVvZiBhR1RNLmYuY2FsbF9jYyYmYUdUTS5mLmNhbGxfY2MoKX19LGFHVE0uZi5sb2FkX2NjPWZ1bmN0aW9uKGUsdCl7dmFyIGE9ZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgic2NyaXB0Iiksbj1hR1RNLmMucGF0aHx8IiI7bi5sZW5ndGg+MCYmIi8iIT09bi5jaGFyQXQobi5sZW5ndGgtMSkmJihuKz0iLyIpO3ZhciBvPSJjbXAvY2NfIithR1RNLmYuc3RyY2xlYW4oZSkrKGFHVE0uYy5taW4/Ii5taW4iOiIiKSsiLmpzIjthLnNyYz1uK28sYUdUTS5jLm5vbmNlJiYoYS5ub25jZT1hR1RNLmMubm9uY2UpLGEub25yZWFkeXN0YXRlY2hhbmdlPWEub25sb2FkPWZ1bmN0aW9uKCl7YS5yZWFkeVN0YXRlJiYhL2xvYWRlZHxjb21wbGV0ZS8udGVzdChhLnJlYWR5U3RhdGUpfHwiZnVuY3Rpb24iPT10eXBlb2YgdCYmdCgpfSxhLmFzeW5jPSEwLGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoYSl9LGFHVE0uZi5jaGVscD1mdW5jdGlvbihlLHQpe3ZhciBhPSEwO3JldHVybiBlJiZ0JiZlLnNwbGl0KCIsIikuZm9yRWFjaChmdW5jdGlvbihlKXt0LmluZGV4T2YoIiwiK2UudHJpbSgpKyIsIik8MCYmKGE9ITEpfSksYX0sYUdUTS5mLmV2YWxDb25zPWZ1bmN0aW9uKGUsdCl7dmFyIGlzQ29uc2VudEdpdmVuPWZ1bmN0aW9uKGUsdCl7cmV0dXJuIGUuZXZlcnkoZnVuY3Rpb24oZSl7cmV0dXJuIHQuaW5kZXhPZigiLCIrZSsiLCIpPj0wfSl9LGE9IWUucHVycG9zZXMubGVuZ3RofHxpc0NvbnNlbnRHaXZlbihlLnB1cnBvc2VzLHQucHVycG9zZXMpLG49IWUuc2VydmljZXMubGVuZ3RofHxpc0NvbnNlbnRHaXZlbihlLnNlcnZpY2VzLHQuc2VydmljZXMpLG89IWUudmVuZG9ycy5sZW5ndGh8fGlzQ29uc2VudEdpdmVuKGUudmVuZG9ycyx0LnZlbmRvcnMpO3JldHVybiBhJiZuJiZvfSxhR1RNLmYucnVuX2NjPWZ1bmN0aW9uKGUpe2lmKCFhR1RNLmQuY29uZmlnKXJldHVybiBhR1RNLmYubG9nKCJlNCIsbnVsbCksITE7aWYoInN0cmluZyIhPXR5cGVvZiBlfHwiaW5pdCIhPT1lJiYidXBkYXRlIiE9PWUpcmV0dXJuIGFHVE0uZi5sb2coImU1Iix7YWN0aW9uOmV9KSwhMTtpZigiZnVuY3Rpb24iIT10eXBlb2YgYUdUTS5mLmNvbnNlbnRfY2hlY2spcmV0dXJuIGFHVE0uZi5sb2coImUxNCIse2FjdGlvbjplfSksITE7dmFyIHQ9bnVsbDtpZigidXBkYXRlIj09PWUmJmFHVE0uZC5jb25zZW50KXt0PUpTT04ucGFyc2UoYUdUTS5mLnNTdHJmKGFHVE0uZC5jb25zZW50KSk7dmFyIGE9YUdUTS5kLmNvbnNlbnQ7YS5oYXNSZXNwb25zZT0hMSxhLnNlcnZpY2VzPSIiLGEucHVycG9zZXM9IiIsYS52ZW5kb3JzPSIiLGEuY29uc2VudF9pZD0iIixhLnNlcnZpY2VJRHM9IiIsYS5mZWVkYmFjaz0iIixkZWxldGUgYS5ibG9ja2VkfWlmKCFhR1RNLmYuY29uc2VudF9jaGVjayhlKSlyZXR1cm4gdCYmKGFHVE0uZC5jb25zZW50PXQpLGFHVE0uZi5sb2coIm04IixudWxsKSwhMTt3aW5kb3dbYUdUTS5jLmdkbF09d2luZG93W2FHVE0uYy5nZGxdfHxbXSxhR1RNLmYuY2hlbHAoYUdUTS5jLmd0bVB1cnBvc2VzLGFHVE0uZC5jb25zZW50LnB1cnBvc2VzKSYmYUdUTS5mLmNoZWxwKGFHVE0uYy5ndG1TZXJ2aWNlcyxhR1RNLmQuY29uc2VudC5zZXJ2aWNlcykmJmFHVE0uZi5jaGVscChhR1RNLmMuZ3RtVmVuZG9ycyxhR1RNLmQuY29uc2VudC52ZW5kb3JzKT9hR1RNLmQuY29uc2VudC5ndG1Db25zZW50PSEwOmFHVE0uZC5jb25zZW50Lmd0bUNvbnNlbnQ9ImJvb2xlYW4iPT10eXBlb2YgYUdUTS5kLmNvbnNlbnQuYmxvY2tlZCYmYUdUTS5kLmNvbnNlbnQuYmxvY2tlZDt2YXIgbj1hR1RNLmYuY29uc2VudF9zZXJpYWxpemUoYUdUTS5kLmNvbnNlbnQpLG89biE9PWFHVE0uZC5sYXN0X2NvbnNlbnRfaGFzaDtpZihhR1RNLmQubGFzdF9jb25zZW50X2hhc2g9biwidXBkYXRlIj09ZSYmbyYmKGFHVE0uZC5pbml0fHxhR1RNLmYuaW5qZWN0KCksYUdUTS5mLnNlbmRuYXVzKHtldmVudDoiYUdUTV9jb25zZW50X3VwZGF0ZSIsYUdUTXRzOihuZXcgRGF0ZSkuZ2V0VGltZSgpLGFHVE1jb25zZW50OmFHVE0uZC5jb25zZW50P0pTT04ucGFyc2UoYUdUTS5mLnNTdHJmKGFHVE0uZC5jb25zZW50KSk6e319KSksInVwZGF0ZSI9PT1lJiYhb3x8ImZ1bmN0aW9uIiE9dHlwZW9mIGFHVE0uZi5jb25zZW50X2NhbGxiYWNrfHxhR1RNLmYuY29uc2VudF9jYWxsYmFjayhlKSxhR1RNLmMuY29uc2VudF9zdG9yZV91cmwpaWYobiE9PWFHVE0uZC5jb25zZW50X2hhc2gpe3ZhciByPXt9O2FHVE0uZC5zZXNzaW9uJiZhR1RNLmQuc2Vzc2lvbi51aWQmJihyLnVpZD1hR1RNLmQuc2Vzc2lvbi51aWQpLGFHVE0uZC5zZXNzaW9uJiZhR1RNLmQuc2Vzc2lvbi5zaWQmJihyLnNpZD1hR1RNLmQuc2Vzc2lvbi5zaWQpO3ZhciBzPXt9LGk9e2d0bUNvbnNlbnQ6MSxibG9ja2VkOjF9O2Zvcih2YXIgYyBpbiBhR1RNLmQuY29uc2VudClpZihhR1RNLmQuY29uc2VudC5oYXNPd25Qcm9wZXJ0eShjKSYmIWlbY10pe3ZhciBmPWFHVE0uZC5jb25zZW50W2NdOyIiIT09ZiYmbnVsbCE9ZiYmKHNbY109Zil9ci5jb25zZW50PXM7dmFyIFQ9ITA9PT1hR1RNLmMuY29uc2VudF9zdG9yZV9lbmMsTT0ibnVtYmVyIj09dHlwZW9mIGFHVE0uYy5zZXNzaW9uX3NhbHQmJmFHVE0uYy5zZXNzaW9uX3NhbHQ+PTE/YUdUTS5jLnNlc3Npb25fc2FsdDowO2FHVE0uZi5sb2coIm1fY29uc2VudF9zdG9yZV9wb3N0Iix7dXJsOmFHVE0uYy5jb25zZW50X3N0b3JlX3VybCxoYXNoOm59KTt2YXIgRz1hR1RNLmYueHNlbmQoYUdUTS5jLmNvbnNlbnRfc3RvcmVfdXJsLHIsVCxNKTtHJiYoRy5vbnJlYWR5c3RhdGVjaGFuZ2U9ZnVuY3Rpb24oKXs0PT09Ry5yZWFkeVN0YXRlJiYoRy5zdGF0dXM+PTIwMCYmRy5zdGF0dXM8MzAwPyhhR1RNLmQuY29uc2VudF9oYXNoPW4sYUdUTS5kLnNlc3Npb25fc3RhdHVzPSJzeW5jZWQiLGFHVE0uZi5sb2coIm1fY29uc2VudF9zdG9yZV9zeW5jZWQiLHtoYXNoOm59KSk6YUdUTS5mLmxvZygiZV9jb25zZW50X3N0b3JlIix7c3RhdHVzOkcuc3RhdHVzfSkpfSl9ZWxzZSBhR1RNLmQuc2Vzc2lvbl9zdGF0dXM9ImNvbmZpcm1lZCI7cmV0dXJuIGFHVE0uZi5sb2coIm0zIixhR1RNLmQuY29uc2VudCksITB9LGFHVE0uZi5jYWxsX2NjPWZ1bmN0aW9uKCl7cmV0dXJuISgiZnVuY3Rpb24iIT10eXBlb2YgYUdUTS5mLnJ1bl9jY3x8IWFHVE0uZi5ydW5fY2MoImluaXQiKSkmJih2b2lkIDAhPT1hR1RNLmQudGltZXIuY29uc2VudCYmKGNsZWFySW50ZXJ2YWwoYUdUTS5kLnRpbWVyLmNvbnNlbnQpLGRlbGV0ZSBhR1RNLmQudGltZXIuY29uc2VudCksISFhR1RNLmQuaW5pdHx8YUdUTS5mLmluamVjdCgpKX0sImZ1bmN0aW9uIiE9dHlwZW9mIGFHVE0uZi5jb25zZW50X2xpc3RlbmVyJiYoYUdUTS5mLmNvbnNlbnRfbGlzdGVuZXI9ZnVuY3Rpb24oKXthR1RNLmMudXNlTGlzdGVuZXJ8fCgiZnVuY3Rpb24iPT10eXBlb2YgYUdUTS5mLmNhbGxfY2MmJmFHVE0uZi5jYWxsX2NjKCk/ImZ1bmN0aW9uIj09dHlwZW9mIGFHVE0uZi5zdGFydF9jb25zZW50X3BvbGwmJmFHVE0uZi5zdGFydF9jb25zZW50X3BvbGwoKTphR1RNLmQudGltZXIuY29uc2VudD1zZXRJbnRlcnZhbChmdW5jdGlvbigpe2FHVE0uZi5jYWxsX2NjKCkmJiJmdW5jdGlvbiI9PXR5cGVvZiBhR1RNLmYuc3RhcnRfY29uc2VudF9wb2xsJiZhR1RNLmYuc3RhcnRfY29uc2VudF9wb2xsKCl9LDUwMCkpfSksYUdUTS5mLnN0YXJ0X2NvbnNlbnRfcG9sbD1mdW5jdGlvbigpe2FHVE0uYy5jb25zZW50X3N0b3JlX3VybCYmKCJudW1iZXIiIT10eXBlb2YgYUdUTS5jLmNvbnNlbnRfcG9sbF9tc3x8YUdUTS5jLmNvbnNlbnRfcG9sbF9tczw9MHx8YUdUTS5kLnRpbWVyJiZhR1RNLmQudGltZXIuY29uc2VudF9wb2xsfHwoYUdUTS5kLnRpbWVyPWFHVE0uZC50aW1lcnx8e30sYUdUTS5kLnRpbWVyLmNvbnNlbnRfcG9sbD1zZXRJbnRlcnZhbChmdW5jdGlvbigpeyJmdW5jdGlvbiI9PXR5cGVvZiBhR1RNLmYucnVuX2NjJiZhR1RNLmYucnVuX2NjKCJ1cGRhdGUiKX0sYUdUTS5jLmNvbnNlbnRfcG9sbF9tcykpKX0sYUdUTS5mLmdjPWZ1bmN0aW9uKGUpe3ZhciB0PW5ldyBSZWdFeHAoZSsiPShbXjtdKykiKSxhPW51bGw7dHJ5e3ZhciBuPWRvY3VtZW50LG89dC5leGVjKG5bYUdUTS5uLmNrXSk7byYmby5sZW5ndGg+MSYmKGE9ZGVjb2RlVVJJQ29tcG9uZW50KG9bMV0pKX1jYXRjaChlKXt9cmV0dXJuIGF9LGFHVE0uZi5zYz1mdW5jdGlvbihlLHQpe2lmKCJzdHJpbmciPT10eXBlb2YgZSYmZSYmdCl0cnl7ZG9jdW1lbnRbYUdUTS5uLmNrXT1lKyI9Iit0KyI7IFNlY3VyZTsgU2FtZVNpdGU9TGF4OyBwYXRoPS8ifWNhdGNoKGUpe319LGFHVE0uZi51cmxQYXJhbT1mdW5jdGlvbihlLHQpe3ZhciBhPW5ldyBSZWdFeHAoIls/Jl0iK2UrIig9KFteJiNdKil8JnwjfCQpIikuZXhlYyh0KTtyZXR1cm4gYSYmYVsyXT9kZWNvZGVVUklDb21wb25lbnQoYVsyXS5yZXBsYWNlKC9cKy9nLCIgIikpOm51bGx9LGFHVE0uZi5vcHRvdXQ9ZnVuY3Rpb24oKXt2YXIgZT0hMSx0PWFHVE0uZi51cmxQYXJhbSgiYUdUTW9wdG91dCIsd2luZG93LmxvY2F0aW9uLmhyZWYpO2lmKHQmJiIwIiE9PXQpYUdUTS5mLnNjKCJhR1RNb3B0b3V0IiwiMSIpLGU9ITA7ZWxzZSBpZigiMCI9PT10KWFHVE0uZi5zYygiYUdUTW9wdG91dCIsIjAiKTtlbHNle3ZhciBhPWFHVE0uZi5nYygiYUdUTW9wdG91dCIpO2EmJiIwIiE9PWEmJihlPSEwKX1pZihlKXtmb3IodmFyIG4gaW4gYUdUTSlhR1RNLmhhc093blByb3BlcnR5KG4pJiYiZiIhPT1uJiZkZWxldGUgYUdUTVtuXTtyZXR1cm4gYUdUTS5mLm9iamluaXQoKSwiZnVuY3Rpb24iPT10eXBlb2YgYUdUTS5mLm9wdG91dF9jYWxsYmFjayYmYUdUTS5mLm9wdG91dF9jYWxsYmFjaygpLCEwfXJldHVybiExfSxhR1RNLmYuYUdUTV9ldmVudD1mdW5jdGlvbihlKXsib2JqZWN0IiE9dHlwZW9mIGFHVE0uZC5jb25zZW50JiYoYUdUTS5kLmNvbnNlbnQ9bnVsbCksZXx8KGU9ImFHVE1fZXZlbnQiKTt2YXIgdD17ZXZlbnQ6ZSxhR1RNdHM6KG5ldyBEYXRlKS5nZXRUaW1lKCksYUdUTWNvbnNlbnQ6YUdUTS5kLmNvbnNlbnQ/SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYoYUdUTS5kLmNvbnNlbnQpKTp7fX07cmV0dXJuImFHVE1fcmVhZHkiPT1lJiYodC5hR1RNPXt2ZXJzaW9uOmFHVE0uZC52ZXJzaW9uLGlzX2lmcmFtZTphR1RNLmQuaXNfaWZyYW1lLGhhc3R5RXZlbnRzOmFHVE0uZC5mLGVycm9yczphR1RNLmQuZXJyb3JzfSksdH0sYUdUTS5mLnByb3h5U3VwcG9ydD1mdW5jdGlvbigpe2lmKCJmdW5jdGlvbiIhPXR5cGVvZiBQcm94eSlyZXR1cm4hMTt0cnl7cmV0dXJuIG5ldyBQcm94eShmdW5jdGlvbigpe30se2FwcGx5OmZ1bmN0aW9uKCl7cmV0dXJuITB9fSkoKX1jYXRjaChlKXtyZXR1cm4hMX19LGFHVE0uZi51cmxMaXN0ZW5lcj1mdW5jdGlvbihlLHQsYSl7Im51bWJlciIhPXR5cGVvZiB0JiYodD01MDApLCJib29sZWFuIiE9dHlwZW9mIGEmJihhPSExKSxhR1RNLmQubGFzdF91cmw9YUdUTS5kLmxhc3RfdXJsfHxhR1RNLmYuZ2V0VmFsKCJsIiwiaHJlZiIpLCJzdHJpbmciPT10eXBlb2YgYUdUTS5kLmxhc3RfdXJsJiZhR1RNLmQubGFzdF91cmx8fChhR1RNLmQubGFzdF91cmw9IiIpO3ZhciBjaGVja1VybENoYW5nZT1mdW5jdGlvbigpe3ZhciB0PWFHVE0uZi5nZXRWYWwoImwiLCJocmVmIil8fCIiO2lmKHQhPWFHVE0uZC5sYXN0X3VybCl7InN0cmluZyIhPXR5cGVvZiBlJiYoZT0idlBhZ2V2aWV3Iik7dmFyIGE9e2V2ZW50OmV9O2Eub2xkVVJMPWFHVE0uZC5sYXN0X3VybCxhLm5ld1VSTD10LGEubmV3VGl0bGU9ZG9jdW1lbnQudGl0bGUsYUdUTS5mLmZpcmUoYSksYUdUTS5kLmxhc3RfdXJsPXR9fTthR1RNLmYuZXZMc3RuKCJ3aW5kb3ciLCJwb3BzdGF0ZSIsY2hlY2tVcmxDaGFuZ2UpLGFHVE0uZi5ldkxzdG4oIndpbmRvdyIsImhhc2hjaGFuZ2UiLGNoZWNrVXJsQ2hhbmdlKTt2YXIgbj0hMTtpZihhR1RNLmYucHJveHlTdXBwb3J0KCkpe3ZhciBvPXthcHBseTpmdW5jdGlvbihlLHQsYSl7dmFyIG49ZS5hcHBseSh0LGEpO3JldHVybiBjaGVja1VybENoYW5nZSgpLG59fTtoaXN0b3J5LnB1c2hTdGF0ZT1uZXcgUHJveHkoaGlzdG9yeS5wdXNoU3RhdGUsbyksaGlzdG9yeS5yZXBsYWNlU3RhdGU9bmV3IFByb3h5KGhpc3RvcnkucmVwbGFjZVN0YXRlLG8pLG49ITB9KHQ+MCYmIW4mJmF8fHQ+MCYmIWEpJiZhR1RNLmYudGltZXIoInVybExpc3RlbmVyIixjaGVja1VybENoYW5nZSxudWxsLHQsMCl9LGFHVE0uZi5ndG1fbG9hZD1mdW5jdGlvbihlLHQsYSxuLG8scil7aWYoYUdUTS5kLmNvbmZpZyl7aWYoIm9iamVjdCIhPXR5cGVvZiBhR1RNLmQuZ3RtTG9hZGVkJiYoYUdUTS5kLmd0bUxvYWRlZD1bXSksYUdUTS5kLmd0bUxvYWRlZC5sZW5ndGg8MSYmKGFHVE0uZi5zZW5kbmF1cyhhR1RNLmYuYUdUTV9ldmVudCgiYUdUTV9yZWFkeSIpKSxhJiZhR1RNLmYuc2VuZG5hdXMoe2V2ZW50OiJndG0uanMiLCJndG0uc3RhcnQiOihuZXcgRGF0ZSkuZ2V0VGltZSgpfSksYUdUTS5jLmFQYWdldmlldyYmYUdUTS5mLnNlbmRuYXVzKHtldmVudDoiYVBhZ2V2aWV3IixhR1RNdHM6KG5ldyBEYXRlKS5nZXRUaW1lKCl9KSxhR1RNLmMudlBhZ2V2aWV3JiZhR1RNLmYuc2VuZG5hdXMoe2V2ZW50OiJ2UGFnZXZpZXciLGFHVE10czoobmV3IERhdGUpLmdldFRpbWUoKX0pLGFHVE0uYy52UGFnZXZpZXdzJiZhR1RNLmYudXJsTGlzdGVuZXIoInZQYWdldmlldyIsYUdUTS5jLnZQYWdldmlld3NUaW1lcixhR1RNLmMudlBhZ2V2aWV3c0ZhbGxiYWNrKSksYUdUTS5kLmNvbnNlbnRFdmVudF9maXJlZD0iYm9vbGVhbiI9PXR5cGVvZiBhR1RNLmQuY29uc2VudEV2ZW50X2ZpcmVkJiZhR1RNLmQuY29uc2VudEV2ZW50X2ZpcmVkLGFHVE0uYy5zZW5kQ29uc2VudEV2ZW50JiYhYUdUTS5kLmNvbnNlbnRFdmVudF9maXJlZCYmIm9iamVjdCI9PXR5cGVvZiBhR1RNLmQuY29uc2VudCYmYUdUTS5kLmNvbnNlbnQuaGFzUmVzcG9uc2UmJihhR1RNLmYuc2VuZG5hdXMoYUdUTS5mLmFHVE1fZXZlbnQoImFHVE1fY29uc2VudCIpKSxhR1RNLmQuY29uc2VudEV2ZW50X2ZpcmVkPSEwKSxhKXtufHwobj0iaWQiKTt2YXIgcz0hMSxpPWFHVE0uZi5nYygiYUdUTWRlYnVnIik7aWYoaSYmcGFyc2VJbnQoaSk+MCYmKHM9ITApLHN8fGFHVE0uZi51cmxQYXJhbSgiZ3RtX2RlYnVnIixkb2N1bWVudC5sb2NhdGlvbi5ocmVmKSYmKHM9ITApLCFzJiZkb2N1bWVudC5yZWZlcnJlcil7dmFyIGM9dC5jcmVhdGVFbGVtZW50KCJhIik7Yy5ocmVmPWRvY3VtZW50LnJlZmVycmVyLGMuaG9zdG5hbWU9PWFHVE0ubi50YSsiLmNvbSImJihzPSEwKX0haSYmcyYmYUdUTS5mLnNjKCJhR1RNZGVidWciLCIxIik7dmFyIGY9dC5jcmVhdGVFbGVtZW50KCJzY3JpcHQiKTtpZihmLmlkPSJhR1RNX3RtXyIrYSxmLmFzeW5jPSEwLCJvYmplY3QiPT10eXBlb2YgYUdUTS5jLmd0bUF0dHIpZm9yKHZhciBUIGluIGFHVE0uYy5ndG1BdHRyKWYuc2V0QXR0cmlidXRlKFQsYUdUTS5jLmd0bUF0dHJbVF0pO2lmKGFHVE0uYy5ub25jZSYmKGYubm9uY2U9YUdUTS5jLm5vbmNlKSxyLmd0bUpTJiYhcylmLmlubmVySFRNTD1hdG9iKHIuZ3RtSlMpO2Vsc2V7dmFyIE09ci5ndG1VUkx8fCJodHRwczovL3d3dy4iK2FHVE0ubi50bSsiLmNvbS9ndG0uanMiLEc9ci5lbnZ8fCIiLGQ9LTE9PT1NLmluZGV4T2YoIj8iKT8iPyI6IiYiO2Yuc3JjPU0rZCtuKyI9IithKyImbD0iK28rR312YXIgbD10LmdldEVsZW1lbnRzQnlUYWdOYW1lKCJzY3JpcHQiKVswXTtsLnBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKGYsbCksYUdUTS5kLmd0bUxvYWRlZC5wdXNoKGF8fCJub19ndG1faWQiKX19ZWxzZSBhR1RNLmYubG9nKCJlNyIsbnVsbCl9LGFHVE0uZi5kb21yZWFkeT1mdW5jdGlvbihlKXt2YXIgdD0hMTthR1RNLmYudk9iKGUpfHwoZT17YU1TRzoiRW1wdHkgRE9NcmVhZHkgZXZlbnQgZmlyZWQuIn0sdD0hMCksZS5ldmVudHx8KGUuZXZlbnQ9ImFET01yZWFkeSIpLGFHVE0uZC5kb21fcmVhZHkmJnR8fCghYUdUTS5jLmRsU3RhdGVFdmVudHMmJnR8fGFHVE0uZi5maXJlKGUpLHQmJihhR1RNLmQuZG9tX3JlYWR5PSEwKSl9LGFHVE0uZi5wYWdlcmVhZHk9ZnVuY3Rpb24oZSl7dmFyIHQ9ITE7YUdUTS5mLnZPYihlKXx8KGU9e2FNU0c6IkVtcHR5IFBBR0VyZWFkeSBldmVudCBmaXJlZC4ifSx0PSEwKSxlLmV2ZW50fHwoZS5ldmVudD0iYVBBR0VyZWFkeSIpLGFHVE0uZC5wYWdlX3JlYWR5JiZ0fHwoIWFHVE0uYy5kbFN0YXRlRXZlbnRzJiZ0fHxhR1RNLmYuZmlyZShlKSx0JiYoYUdUTS5kLnBhZ2VfcmVhZHk9ITApKX0sYUdUTS5mLmluaXRHVE09ZnVuY3Rpb24oZSl7aWYoIm9iamVjdCI9PXR5cGVvZiBhR1RNLmMuZ3RtJiZhR1RNLmMuZ3RtKXt2YXIgdD0wO2Zvcih2YXIgYSBpbiBhR1RNLmMuZ3RtKXQrKyxhR1RNLmMuZ3RtLmhhc093blByb3BlcnR5KGEpJiYoImJvb2xlYW4iIT10eXBlb2YgYUdUTS5jLmd0bVthXS5oYXNMb2FkZWQmJihhR1RNLmMuZ3RtW2FdLmhhc0xvYWRlZD0hMSksYUdUTS5jLmd0bVthXS5oYXNMb2FkZWR8fGUmJiFhR1RNLmMuZ3RtW2FdLm5vQ29uc2VudHx8KGFHVE0uZi5ndG1fbG9hZCh3aW5kb3csZG9jdW1lbnQsYSxhR1RNLmMuZ3RtW2FdLmlkUGFyYW0/YUdUTS5jLmd0bVthXS5pZFBhcmFtOiIiLGFHVE0uYy5nZGwsYUdUTS5jLmd0bVthXSksYUdUTS5jLmd0bVthXS5oYXNMb2FkZWQ9ITApKTt0fHxhR1RNLmYuZ3RtX2xvYWQod2luZG93LGRvY3VtZW50LCIiLGFHVE0uYy5ndG1bYV0uaWRQYXJhbT9hR1RNLmMuZ3RtW2FdLmlkUGFyYW06IiIsYUdUTS5jLmdkbCxudWxsKX19LGFHVE0uZi5jaGtEUHJlYWR5PWZ1bmN0aW9uKCl7dmFyIGU9ZG9jdW1lbnQucmVhZHlTdGF0ZTsiaW50ZXJhY3RpdmUiPT09ZXx8ImNvbXBsZXRlIj09PWU/YUdUTS5mLmRvbXJlYWR5KG51bGwpOmFHVE0uZi5ldkxzdG4oZG9jdW1lbnQsIkRPTUNvbnRlbnRMb2FkZWQiLGFHVE0uZi5kb21yZWFkeSksImNvbXBsZXRlIj09PWU/YUdUTS5mLnBhZ2VyZWFkeShudWxsKTphR1RNLmYuZXZMc3RuKHdpbmRvdywibG9hZCIsYUdUTS5mLnBhZ2VyZWFkeSl9LGFHVE0uZi5pbmplY3Q9ZnVuY3Rpb24oKXtpZighYUdUTS5kLmNvbmZpZylyZXR1cm4gYUdUTS5mLmxvZygiZTgiLG51bGwpLCExO2lmKCJvYmplY3QiIT10eXBlb2YgYUdUTS5kLmNvbnNlbnR8fCJib29sZWFuIiE9dHlwZW9mIGFHVE0uZC5jb25zZW50Lmhhc1Jlc3BvbnNlfHwhYUdUTS5kLmNvbnNlbnQuaGFzUmVzcG9uc2UpcmV0dXJuIGFHVE0uZi5sb2coImUxMyIsbnVsbCksITE7YUdUTS5kLmluaXR8fCgod2luZG93W2FHVE0uYy5nZGxdfHxbXSkuZm9yRWFjaChmdW5jdGlvbihlLHQpe2lmKCJvYmplY3QiPT10eXBlb2YgZSYmZSl7aWYoIWUuYUdUTWNoayl7ZS5hR1RNZGw9ITA7dmFyIGE9SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYoZSkpO3ZvaWQgMCE9PWFbImd0bS51bmlxdWVFdmVudElkIl0mJmRlbGV0ZSBhWyJndG0udW5pcXVlRXZlbnRJZCJdLGFHVE0uZC5mLnB1c2goYSl9fWVsc2UgYUdUTS5mLmxvZygiZTE3Iix7b2JqX3R5cGU6dHlwZW9mIGUsb2JqX3ZhbHVlOmUsaW5kZXg6dH0pLGFHVE0uZC5mLnB1c2goe2V2ZW50OiJleGNlcHRpb24iLGVycm1zZzoiRGF0YUxheWVyIEVudHJ5IGlzIG5vIG9iamVjdCIsZXJydHlwZToiREwgRXJyb3IiLG9ial90eXBlOnR5cGVvZiBlLG9ial92YWx1ZTplfSl9KSxhR1RNLmQuY29uc2VudC5ndG1Db25zZW50JiYoYUdUTS5mLmluaXRHVE0oITEpLGFHVE0uZC5pbml0PSEwKSxhR1RNLmQuaW5pdCYmYUdUTS5mLmNoa0RQcmVhZHkoKSk7cmV0dXJuImZ1bmN0aW9uIj09dHlwZW9mIGFHVE0uZi5pbmplY3RfY2FsbGJhY2smJmFHVE0uZi5pbmplY3RfY2FsbGJhY2soKSxhR1RNLmYubG9nKCJtNiIsbnVsbCksITB9LGFHVE0uZi5pRnJhbWVGaXJlPWZ1bmN0aW9uKGUpeyJvYmplY3QiPT10eXBlb2YgZSYmZSYmKGFHVE0uZC5pc19pZnJhbWUmJiJzdHJpbmciPT10eXBlb2YgZS5ldmVudCYmL14oYUdUTXxndG1cLnxbYXZdRE9NcmVhZHl8W2F2XVBBR0VyZWFkeSkvLnRlc3QoZS5ldmVudCk/YUdUTS5mLnNlbmRuYXVzKGUpOihlLmFHVE1fc291cmNlPSJpRnJhbWUgIitkb2N1bWVudC5sb2NhdGlvbi5ob3N0bmFtZSxhR1RNLmQuaWZyYW1lLmNvdW50ZXIuZXZlbnRzKyssZS5pZkV2Q3RyPWFHVE0uZC5pZnJhbWUuY291bnRlci5ldmVudHMsInN0cmluZyI9PXR5cGVvZiBlLmV2ZW50JiZlLmV2ZW50JiYoYUdUTS5kLmlmcmFtZS5jb3VudGVyW2UuZXZlbnRdPWFHVE0uZC5pZnJhbWUuY291bnRlcltlLmV2ZW50XXx8MCxhR1RNLmQuaWZyYW1lLmNvdW50ZXJbZS5ldmVudF0rKyxlWyJpZkV2Q3RyXyIrZS5ldmVudF09YUdUTS5kLmlmcmFtZS5jb3VudGVyW2UuZXZlbnRdKSxlLmFHVE10cyYmZGVsZXRlIGUuYUdUTXRzLGUuYUdUTXBhcmFtcyYmZGVsZXRlIGUuYUdUTXBhcmFtcyxhR1RNLmQuaWZyYW1lLm9yaWdpbj93aW5kb3cudG9wLnBvc3RNZXNzYWdlKGUsYUdUTS5kLmlmcmFtZS5vcmlnaW4pOmFHVE0uZC5mLnB1c2goZSkpKX0sYUdUTS5mLmlmSGFuZHNoYWtlPWZ1bmN0aW9uKCl7aWYoIWFHVE0uZC5pc19pZnJhbWUmJiFhR1RNLmQuaWZyYW1lLmhhbmRzaGFrZSl7dmFyIGU9ZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoImlmcmFtZSIpO2lmKCFlLmxlbmd0aClyZXR1cm47Zm9yKHZhciB0PTA7dDxlLmxlbmd0aDt0Kyspe3ZhciBhPWVbdF07YSYmYS5jb250ZW50V2luZG93JiZhLmNvbnRlbnRXaW5kb3cucG9zdE1lc3NhZ2UmJmEuY29udGVudFdpbmRvdy5wb3N0TWVzc2FnZSgiYUdUTV9Ub3AyaUZyYW1lIEhhbmRzaGFrZSIsIioiKX1hR1RNLmQuaWZyYW1lLmhhbmRzaGFrZT0hMH19LGFHVE0uZi5pZkhTbGlzdGVuPWZ1bmN0aW9uKGUpe2lmKGFHVE0uZC5pc19pZnJhbWUmJiJzdHJpbmciPT10eXBlb2YgZS5kYXRhJiYiYUdUTV9Ub3AyaUZyYW1lIEhhbmRzaGFrZSI9PWUuZGF0YSlmb3IoYUdUTS5kLmlmcmFtZS5vcmlnaW49ZS5vcmlnaW4sYUdUTS5kLmlmcmFtZS5pZkxpc3Rlbj0hMSx3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcigibWVzc2FnZSIsYUdUTS5mLmlmSFNsaXN0ZW4sITEpO2FHVE0uZC5mLmxlbmd0aDspe3ZhciB0PWFHVE0uZC5mLnNoaWZ0KCk7YUdUTS5mLmlGcmFtZUZpcmUodCl9fSxhR1RNLmYudk9iPWZ1bmN0aW9uKGUpe2lmKCJvYmplY3QiIT10eXBlb2YgZXx8IWUpcmV0dXJuITE7dHJ5e0pTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoZSkpfWNhdGNoKGUpe3JldHVybiExfXJldHVybiEwfSxhR1RNLmYudlN0PWZ1bmN0aW9uKGUpe3ZhciB0PUFycmF5LmlzQXJyYXkoZSk/ZToic3RyaW5nIj09dHlwZW9mIGU/W2VdOltdO3JldHVybiAwIT09dC5sZW5ndGgmJnQuZXZlcnkoZnVuY3Rpb24oZSl7cmV0dXJuInN0cmluZyI9PXR5cGVvZiBlJiYiIiE9PWV9KX0sYUdUTS5mLmV2THN0bj1mdW5jdGlvbihlLHQsYSl7aWYoIndpbmRvdyI9PT1lJiYoZT13aW5kb3cpLCJkb2N1bWVudCI9PT1lJiYoZT1kb2N1bWVudCksIm9iamVjdCI9PXR5cGVvZiBlJiZlJiYic3RyaW5nIj09dHlwZW9mIHQmJiJmdW5jdGlvbiI9PXR5cGVvZiBhKXRyeXsibWVzc2FnZSI9PXQ/YUdUTS5kLmlmcmFtZS50b3BMaXN0ZW58fGFHVE0uZC5pc19pZnJhbWV8fChhR1RNLmQuaWZyYW1lLnRvcExpc3Rlbj0hMCxlLmFkZEV2ZW50TGlzdGVuZXIodCxmdW5jdGlvbihlKXthKHZvaWQgMCE9PWUuZGF0YT9lLmRhdGE6bnVsbCwic3RyaW5nIj09dHlwZW9mIGUub3JpZ2luP2Uub3JpZ2luOiIiKX0pKTplLmFkZEV2ZW50TGlzdGVuZXIodCxhKX1jYXRjaChuKXthR1RNLmYubG9nKCJlMTIiLHtlcnJvcjpuLGVsOmUsZXY6dCxmY3Q6YX0pfWVsc2UgYUdUTS5mLmxvZygiZTExIix7ZWw6ZSxldjp0LGZjdDphfSl9LGFHVE0uZi5ybUxzdG49ZnVuY3Rpb24oZSx0LGEpeyJ3aW5kb3ciPT09ZSYmKGU9d2luZG93KSwiZG9jdW1lbnQiPT09ZSYmKGU9ZG9jdW1lbnQpO3RyeXtlLnJlbW92ZUV2ZW50TGlzdGVuZXIodCxhKX1jYXRjaChlKXt9fSxhR1RNLmYuZ2V0VmFsPWZ1bmN0aW9uKGUsdCl7aWYoYUdUTS5mLnZTdChbZSx0XSkmJnQubWF0Y2goL1thLXpdKy9pKSYmKCJwIiE9ZXx8Im9iamVjdCI9PXR5cGVvZiBwZXJmb3JtYW5jZSYmcGVyZm9ybWFuY2UpKXN3aXRjaChlKXtjYXNlInciOnJldHVybiBhR1RNLmYudk9iKHdpbmRvd1t0XSk/SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYod2luZG93W3RdKSk6d2luZG93W3RdO2Nhc2UibiI6cmV0dXJuIGFHVE0uZi52T2IobmF2aWdhdG9yW3RdKT9KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihuYXZpZ2F0b3JbdF0pKTpuYXZpZ2F0b3JbdF07Y2FzZSJkIjpyZXR1cm4gZG9jdW1lbnRbdF07Y2FzZSJsIjpyZXR1cm4gZG9jdW1lbnQubG9jYXRpb25bdF07Y2FzZSJoIjpyZXR1cm4gZG9jdW1lbnQuaGVhZFt0XTtjYXNlImIiOnJldHVybiBkb2N1bWVudC5ib2R5W3RdO2Nhc2UicyI6cmV0dXJuIGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCJodG1sIilbMF0uc2Nyb2xsVG9wfHwwO2Nhc2UibSI6cmV0dXJuIHdpbmRvdy5zY3JlZW5bdF07Y2FzZSJjIjpyZXR1cm4gd2luZG93Lmdvb2dsZV90YWdfZGF0YSYmd2luZG93Lmdvb2dsZV90YWdfZGF0YS5pY3M/SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYod2luZG93Lmdvb2dsZV90YWdfZGF0YS5pY3MpKTpudWxsO2Nhc2UicCI6cmV0dXJuIm5vdyI9PXQ/cGVyZm9ybWFuY2Uubm93KCk6cGVyZm9ybWFuY2VbdF07ZGVmYXVsdDpyZXR1cm59fSxhR1RNLmYuZ2V0Tm9kZUF0dHI9ZnVuY3Rpb24oZSx0KXt2YXIgYT1kb2N1bWVudC5xdWVyeVNlbGVjdG9yKGUpO3JldHVybiBhP2EuZ2V0QXR0cmlidXRlKHQpOm51bGx9LGFHVE0uZi5uZXdOb2RlPWZ1bmN0aW9uKGUsdCxhKXtpZihhR1RNLmYudlN0KFtlLHRdKSYmIm9iamVjdCI9PXR5cGVvZiBhKXt2YXIgbj1kb2N1bWVudC5jcmVhdGVFbGVtZW50KGUpLG89ZG9jdW1lbnQucXVlcnlTZWxlY3Rvcih0KTtpZihvKXtmb3IodmFyIHIgaW4gYSlpZihhLmhhc093blByb3BlcnR5KHIpKXt2YXIgcz1yLnNwbGl0KCIuIik7MT09PXMubGVuZ3RoP24uc2V0QXR0cmlidXRlKHIsYVtyXSk6KG5bc1swXV18fChuW3NbMF1dPXt9KSxuW3NbMF1dW3NbMV1dPWFbcl0pfW8uYXBwZW5kQ2hpbGQobil9fX0sYUdUTS5mLmRlbE5vZGU9ZnVuY3Rpb24oZSl7aWYoYUdUTS5mLnZTdChlKSl7dmFyIHQ9ZG9jdW1lbnQucXVlcnlTZWxlY3RvcihlKTt0JiZ0LnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQodCl9fSxhR1RNLmYucGFnZWluZm89ZnVuY3Rpb24oZSl7dmFyIHQ9MCxhPTA7aWYoKGU9ZXx8e30pLmNvdW50V29yZHMmJmZ1bmN0aW9uIGdldFRleHQoZSl7aWYoMz09PWUubm9kZVR5cGUpdCs9ZS50ZXh0Q29udGVudC50cmltKCkuc3BsaXQoL1xzKy8pLmxlbmd0aDtlbHNlIGlmKDE9PT1lLm5vZGVUeXBlJiYhL14oc2NyaXB0fHN0eWxlfG5vc2NyaXB0KSQvaS50ZXN0KGUudGFnTmFtZSkpZm9yKHZhciBhPTA7YTxlLmNoaWxkTm9kZXMubGVuZ3RoO2ErKylnZXRUZXh0KGUuY2hpbGROb2Rlc1thXSl9KGRvY3VtZW50LmJvZHkpLGUuY291bnRJbWFnZXMpZm9yKHZhciBuPWRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCJpbWciKSxvPTA7bzxuLmxlbmd0aDtvKyspbltvXS5uYXR1cmFsV2lkdGg+MjUwJiZuW29dLm5hdHVyYWxIZWlnaHQ+MjUwJiZhKys7cmV0dXJue3dvcmRzOnQsaW1hZ2VzOmF9fSxhR1RNLmYuY3BMc3Q9ZnVuY3Rpb24oZSx0LGEpe3RyeXtlLmFkZEV2ZW50TGlzdGVuZXIodCxmdW5jdGlvbihlKXt2YXIgdDt3aW5kb3cuZ2V0U2VsZWN0aW9uJiYodD13aW5kb3cuZ2V0U2VsZWN0aW9uKCkudG9TdHJpbmcoKSkmJmEodCl9KX1jYXRjaCh0KXthR1RNLmYubG9nKCJlMTIiLHtlbGVtZW50OmUsZXJyb3I6dH0pfX0sYUdUTS5mLmVsTHN0PWZ1bmN0aW9uKGUsdCxhKXt0cnl7ZS5hZGRFdmVudExpc3RlbmVyKHQsZnVuY3Rpb24oZSl7Zm9yKHZhciB0PXRoaXMudGFnTmFtZS50b0xvd2VyQ2FzZSgpLG49IiIsbz0iIixyPW51bGwscz1udWxsLGk9MCxjPXRoaXM7YyYmYy5wYXJlbnRFbGVtZW50OyljPWMucGFyZW50RWxlbWVudCwhbiYmYy5pZCYmKG49KCJzdHJpbmciPT10eXBlb2YgYy5ub2RlTmFtZT9jLm5vZGVOYW1lLnRvTG93ZXJDYXNlKCkrIjoiOiIiKStjLmlkKSwhbyYmYy5nZXRBdHRyaWJ1dGUoImNsYXNzIikmJihvPSgic3RyaW5nIj09dHlwZW9mIGMubm9kZU5hbWU/Yy5ub2RlTmFtZS50b0xvd2VyQ2FzZSgpKyI6IjoiIikrYy5nZXRBdHRyaWJ1dGUoImNsYXNzIikpO2lmKCJpbnB1dCI9PT10fHwic2VsZWN0Ij09PXR8fCJ0ZXh0YXJlYSI9PT10KXtmb3IoYz10aGlzO2MmJmMucGFyZW50RWxlbWVudCYmImZvcm0iIT09Yy50YWdOYW1lLnRvTG93ZXJDYXNlKCk7KWM9Yy5wYXJlbnRFbGVtZW50OyJmb3JtIj09PWMudGFnTmFtZS50b0xvd2VyQ2FzZSgpJiYocj17aWQ6Yy5pZCxjbGFzczpjLmdldEF0dHJpYnV0ZSgiY2xhc3MiKSxuYW1lOmMuZ2V0QXR0cmlidXRlKCJuYW1lIiksYWN0aW9uOmMuYWN0aW9uLGVsZW1lbnRzOmMuZWxlbWVudHMubGVuZ3RofSxzPUFycmF5LnByb3RvdHlwZS5pbmRleE9mLmNhbGwoYy5lbGVtZW50cyx0aGlzKSsxKX0ib2JqZWN0Ij09dHlwZW9mIHRoaXMuZWxlbWVudHMmJiJudW1iZXIiPT10eXBlb2YgdGhpcy5lbGVtZW50cy5sZW5ndGgmJihpPXRoaXMuZWxlbWVudHMubGVuZ3RoKTt2YXIgZj17dGFnTmFtZTp0LHRhcmdldDp0aGlzLnRhcmdldHx8IiIscGFyZW50SUQ6bixwYXJlbnRDbGFzczpvLGlkOnRoaXMuaWR8fCIiLG5hbWU6dGhpcy5nZXRBdHRyaWJ1dGUoIm5hbWUiKXx8IiIsY2xhc3M6dGhpcy5nZXRBdHRyaWJ1dGUoImNsYXNzIil8fCIiLGhyZWY6dGhpcy5ocmVmfHwiIixzcmM6dGhpcy5zcmN8fCIiLGFjdGlvbjp0aGlzLmFjdGlvbnx8IiIsdHlwZTp0aGlzLnR5cGV8fCIiLGVsZW1lbnRzOmkscG9zaXRpb246cyxmb3JtOnIsaHRtbDp0aGlzLm91dGVySFRNTD90aGlzLm91dGVySFRNTC50b1N0cmluZygpOiIiLHRleHQ6dGhpcy5vdXRlclRleHQ/dGhpcy5vdXRlclRleHQudG9TdHJpbmcoKToiIn07Zi5odG1sLmxlbmd0aD41MTImJihmLmh0bWw9Zi5odG1sLnNsaWNlKDAsNTA5KSsiLi4uIiksZi50ZXh0Lmxlbmd0aD41MTImJihmLnRleHQ9Zi50ZXh0LnNsaWNlKDAsNTA5KSsiLi4uIiksYShmKX0pfWNhdGNoKHQpe2FHVE0uZi5sb2coImUxMiIse2VsZW1lbnQ6ZSxlcnJvcjp0fSl9fSxhR1RNLmYuYWRkRWxMc3Q9ZnVuY3Rpb24oZSx0LGEpe2lmKGFHVE0uZi52U3QoW2UsdF0pJiYiZnVuY3Rpb24iPT10eXBlb2YgYSl7dmFyIG49ZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChlKTsib2JqZWN0Ij09dHlwZW9mIG4mJiJudW1iZXIiPT10eXBlb2Ygbi5sZW5ndGgmJjAhPW4ubGVuZ3RoJiZuLmZvckVhY2goZnVuY3Rpb24oZSl7aWYoImNvcHkiPT09dClhR1RNLmYuY3BMc3QoZSx0LGEpO2Vsc2UgYUdUTS5mLmVsTHN0KGUsdCxhKX0pfX0sYUdUTS5mLm9ic2VydmVyPWZ1bmN0aW9uKGUsdCxhKXtpZihhR1RNLmYudlN0KFtlLHRdKSYmImZ1bmN0aW9uIj09dHlwZW9mIGEpe25ldyBNdXRhdGlvbk9ic2VydmVyKGZ1bmN0aW9uKG4pe24uZm9yRWFjaChmdW5jdGlvbihuKXsiY2hpbGRMaXN0Ij09PW4udHlwZSYmbi5hZGRlZE5vZGVzLmxlbmd0aCYmQXJyYXkucHJvdG90eXBlLmZvckVhY2guY2FsbChuLmFkZGVkTm9kZXMsZnVuY3Rpb24obil7aWYoMT09PW4ubm9kZVR5cGUmJiJzdHJpbmciPT10eXBlb2Ygbi50YWdOYW1lJiZuLnRhZ05hbWUudG9Mb3dlckNhc2UoKT09PWUudG9Mb3dlckNhc2UoKSYmYUdUTS5mLmVsTHN0KG4sdCxhKSwxPT09bi5ub2RlVHlwZSYmbi5xdWVyeVNlbGVjdG9yQWxsKXt2YXIgbz1uLnF1ZXJ5U2VsZWN0b3JBbGwoZS50b0xvd2VyQ2FzZSgpKTtBcnJheS5wcm90b3R5cGUuZm9yRWFjaC5jYWxsKG8sZnVuY3Rpb24oZSl7YUdUTS5mLmVsTHN0KGUsdCxhKX0pfX0pfSl9KS5vYnNlcnZlKGRvY3VtZW50LmJvZHkse2NoaWxkTGlzdDohMCxzdWJ0cmVlOiEwLGF0dHJpYnV0ZXM6ITF9KX19LGFHVE0uZi5yVGVzdD1mdW5jdGlvbihlLHQpe3JldHVybiBhR1RNLmYudlN0KFtlLHRdKSYmbmV3IFJlZ0V4cCh0LCJpIikudGVzdChlKX0sYUdUTS5mLnJNYXRjaD1mdW5jdGlvbihlLHQpe3JldHVybiBlLm1hdGNoKG5ldyBSZWdFeHAodCkpfSxhR1RNLmYuclJlcGxhY2U9ZnVuY3Rpb24oZSx0LGEpe3JldHVybiBhR1RNLmYudlN0KFtlLHQsYV0pP2UucmVwbGFjZShuZXcgUmVnRXhwKHQsImdpIiksYSk6ZX0sYUdUTS5mLmlzSUZyYW1lPWZ1bmN0aW9uKCl7cmV0dXJuIHdpbmRvdy5zZWxmIT09d2luZG93LnRvcH0sYUdUTS5mLmpzZXJyb3JzPWZ1bmN0aW9uKCl7YUdUTS5mLmV2THN0bih3aW5kb3csImVycm9yIixmdW5jdGlvbihlKXtpZihudWxsIT09ZSl7dmFyIHQ9InN0cmluZyI9PXR5cGVvZiBlLm1lc3NhZ2U/ZS5tZXNzYWdlOiIiLGE9InN0cmluZyI9PXR5cGVvZiBlLmZpbGVuYW1lP2UuZmlsZW5hbWU6IiI7aWYoInNjcmlwdCBlcnJvci4iPT10LnRvTG93ZXJDYXNlKCkpe2lmKCFhKXJldHVybjt0PXQucmVwbGFjZSgiLiIsIjoiKSsiIGVycm9yIGZyb20gb3RoZXIgZG9tYWluLiJ9YSYmKHQrPSIgfCBmaWxlOiAiK2EpO3ZhciBuPWFHVE0uZi5zdHJjbGVhbihlLmxpbmVubyk7IjAiPT1uJiYobj0iIiksbiYmKHQrPSIgfCBsaW5lOiAiK24pO3ZhciBvPWFHVE0uZi5zdHJjbGVhbihlLmNvbG5vKTsiMCI9PW8mJihvPSIiKSxvJiYodCs9IiB8IGNvbDogIitvKSxhR1RNLmQuZXJyb3JzLnB1c2godCk7dmFyIHI9IiI7dHJ5e3I9bmF2aWdhdG9yLmFwcENvZGVOYW1lKyIgfCAiK25hdmlnYXRvci5hcHBOYW1lKyIgfCAiK25hdmlnYXRvci5hcHBWZXJzaW9uKyIgfCAiK25hdmlnYXRvci5wbGF0Zm9ybX1jYXRjaChlKXt9aWYoYUdUTS5kLmVycm9yX2NvdW50ZXIrKz49MTAwKXJldHVybjthR1RNLmQuZXJyb3JfY291bnRlcjw9NSYmYUdUTS5mLmZpcmUoe2V2ZW50OiJleGNlcHRpb24iLGVycm1zZzp0LGJyb3dzZXI6cixlcnJ0eXBlOiJKUyBFcnJvciIsdGltZXN0YW1wOihuZXcgRGF0ZSkuZ2V0VGltZSgpLGVycmN0OmFHVE0uZC5lcnJvcl9jb3VudGVyLGV2ZW50TW9kZWw6bnVsbH0pfX0pfSxhR1RNLmYudGltZXJma3Q9ZnVuY3Rpb24oZSl7dmFyIHQ9SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYoZSkpO3QudGltZXJfbXM9MSp0LnRpbWVyX21zLHQudGltZXJfY3QrKyx0LnRpbWVyX3RtPXQudGltZXJfbXMqdC50aW1lcl9jdCx0LnRpbWVyX3NjPXBhcnNlRmxvYXQoKHQudGltZXJfdG0vMWUzKS50b0ZpeGVkKDMpKSx0LmV2ZW50PXQuZXZlbnR8fCJ0aW1lciIsLTEhPT10LmV2ZW50LmluZGV4T2YoIltzXSIpJiYodC5ldmVudD10LmV2ZW50LnJlcGxhY2UoIltzXSIsdC50aW1lcl9zYy50b1N0cmluZygpKSksdC5ldmVudE1vZGVsPW51bGwsYUdUTS5mLmZpcmUodCl9LGFHVE0uZi50aW1lcj1mdW5jdGlvbihlLHQsYSxuLG8pe2lmKCFlJiYib2JqZWN0Ij09dHlwZW9mIGEmJmEmJiJzdHJpbmciPT10eXBlb2YgYS5ldmVudCYmKGU9YS5ldmVudCksZT1lfHwidGltZXIiLGUrPSJfIisobmV3IERhdGUpLmdldFRpbWUoKS50b1N0cmluZygpKyJfIitNYXRoLmZsb29yKDk5OTk5OSpNYXRoLnJhbmRvbSgpKzEpLnRvU3RyaW5nKCksYUdUTS5mLnN0b3B0aW1lcihlKSwib2JqZWN0Ij09dHlwZW9mIGEmJmEpdmFyIHI9SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYoYSkpO2Vsc2Ugcj17fTtyLnRpbWVyX25tPWUsci50aW1lcl9tcz1uLHIudGltZXJfcnA9byxyLnRpbWVyX2N0PTAsci5pZD0xPT09ci50aW1lcl9ycD9zZXRUaW1lb3V0KGZ1bmN0aW9uKCl7dD90KHIpOmFHVE0uZi50aW1lcmZrdChyKX0sbik6c2V0SW50ZXJ2YWwoZnVuY3Rpb24oKXt0P3Qocik6YUdUTS5mLnRpbWVyZmt0KHIpLHIudGltZXJfY3QrKyxyLnRpbWVyX3JwPjAmJnIudGltZXJfY3Q+PXIudGltZXJfcnAmJmFHVE0uZi5zdG9wdGltZXIoci50aW1lcl9ubSl9LG4pLGFHVE0uZC50aW1lcltlXT1yfSxhR1RNLmYuc3RvcHRpbWVyPWZ1bmN0aW9uKGUpe2lmKCJvYmplY3QiIT10eXBlb2YgYUdUTS5kLnRpbWVyJiYoYUdUTS5kLnRpbWVyPXt9KSwib2JqZWN0Ij09dHlwZW9mIGFHVE0uZC50aW1lcltlXSl7dmFyIHQ9YUdUTS5kLnRpbWVyW2VdOzE9PT10LnRpbWVyX3JwP2NsZWFyVGltZW91dCh0LmlkKTpjbGVhckludGVydmFsKHQuaWQpLGRlbGV0ZSBhR1RNLmQudGltZXJbZV19fSxhR1RNLmYuaW5pdD1mdW5jdGlvbigpeyFhR1RNLmMuZGVidWcmJmFHVE0uZi5vcHRvdXQoKXx8KGFHVE0uZi5jb25maWcoYUdUTS5jKSxhR1RNLmMuaWZyYW1lU3VwcG9ydCYmYUdUTS5kLmlzX2lmcmFtZT8oYUdUTS5kLmNvbnNlbnQuZ3RtQ29uc2VudD0hMCxhR1RNLmQuY29uc2VudC5oYXNSZXNwb25zZT0hMCxhR1RNLmQuY29uc2VudC5mZWVkYmFjaz0iUGFnZSBpcyBpRnJhbWUiLGFHVE0uZC5pZnJhbWUuaWZMaXN0ZW58fChhR1RNLmQuaWZyYW1lLmlmTGlzdGVuPSEwLHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCJtZXNzYWdlIixhR1RNLmYuaWZIU2xpc3RlbikpLGFHVE0uZC5pbml0fHxhR1RNLmYuaW5qZWN0KCkpOiJzdHJpbmciPT10eXBlb2YgYUdUTS5jLmNtcCYmYUdUTS5jLmNtcD8ibm9uZSI9PWFHVE0uYy5jbXA/KGFHVE0uZC5jb25zZW50PXtndG1Db25zZW50OiEwLGhhc1Jlc3BvbnNlOiEwLGZlZWRiYWNrOiJObyBDb25zZW50IENoZWNrIGNvbmZpZ3VyZWQifSxhR1RNLmYuaW5qZWN0KCkpOihhR1RNLmYubG9hZF9jYyhhR1RNLmMuY21wLGFHVE0uZi5jb25zZW50X2xpc3RlbmVyKSxhR1RNLmYuaW5pdEdUTSghMCkpOihhR1RNLmYuY29uc2VudF9saXN0ZW5lcigpLGFHVE0uZi5pbml0R1RNKCEwKSksYUdUTS5mLmpzZXJyb3JzKCkpfSxhR1RNLmYuZW5jPWZ1bmN0aW9uKGUsdCl7dmFyIGE9dCU2MysxLG49YnRvYSh1bmVzY2FwZShlbmNvZGVVUklDb21wb25lbnQoZSkpKSxvPTA7Ij0iPT09bi5jaGFyQXQobi5sZW5ndGgtMSkmJm8rKywiPSI9PT1uLmNoYXJBdChuLmxlbmd0aC0yKSYmbysrLG49bi5zbGljZSgwLG4ubGVuZ3RoLW8pO2Zvcih2YXIgcj0xPT09bz8ifiI6Mj09PW8/In5+IjoiIixzPSIiLGk9MDtpPG4ubGVuZ3RoO2krKyl7dmFyIGM9IkFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU2Nzg5Ky8iLmluZGV4T2Yobi5jaGFyQXQoaSkpO3MrPWM8MD9uLmNoYXJBdChpKToiQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ejAxMjM0NTY3ODktXyIuY2hhckF0KChjK2EpJTY0KX1yZXR1cm4gbz9zLnNsaWNlKDAsMykrcitzLnNsaWNlKDMpOnN9LGFHVE0uZi54c2VuZD1mdW5jdGlvbihlLHQsYSxuKXtpZihlJiYic3RyaW5nIj09dHlwZW9mIGUpdHJ5e3ZhciBvLHI9bmV3IFhNTEh0dHBSZXF1ZXN0O3JldHVybiByLm9wZW4oIlBPU1QiLGUsITApLHIuc2V0UmVxdWVzdEhlYWRlcigiQ29udGVudC1UeXBlIiwiYXBwbGljYXRpb24vanNvbiIpLG89YSYmIm51bWJlciI9PXR5cGVvZiBuJiZuPj0xPyd7InEiOiInK2FHVE0uZi5lbmMoYUdUTS5mLnNTdHJmKHQpLG4pKycifSc6J3siZSI6JythR1RNLmYuc1N0cmYodCkrIn0iLHIuc2VuZChvKSxyfWNhdGNoKHQpe3JldHVybiBhR1RNLmYubG9nKCJlX3hzZW5kIix7bXNnOnQubWVzc2FnZSx1cmw6ZX0pLG51bGx9fSxhR1RNLmYuc2VuZG5hdXM9ZnVuY3Rpb24oZSl7aWYoZSYmIm9iamVjdCI9PXR5cGVvZiBlKXt2YXIgdD13aW5kb3dbYUdUTS5jLmdkbF0ucHVzaDshYUdUTS5kLm9yaWdpbmFsRExwdXNoJiYvc2FuZGJveC9pLnRlc3QodC50b1N0cmluZygpKSYmKGFHVE0uZC5vcmlnaW5hbERMcHVzaD10KTt2YXIgYT0hMTtpZihhR1RNLmMuZGxPcmdQdXNoJiZhR1RNLmQub3JpZ2luYWxETHB1c2gmJmFHVE0uZC5vcmlnaW5hbERMcHVzaCE9PXQpe3ZhciBuPXQudG9TdHJpbmcoKTsvc2FuZGJveC9pLnRlc3Qobik/YUdUTS5kLm9yaWdpbmFsRExwdXNoPXQ6KGE9ITAsYUdUTS5kLmRsSG9va0xvZ2dlZHx8KGFHVE0uZC5vcmlnaW5hbERMcHVzaCh7ZXZlbnQ6ImV4Y2VwdGlvbiIsZXJydHlwZToiREwgRXJyb3IiLGVycm1zZzoiRnVuY3Rpb24gZGF0YUxheWVyLnB1c2ggaG9va2VkIC0gbm8gbG9uZ2VyIGZyb20gR1RNIixmY3RfaG9vazpuLGZjdF9vcmlnOmFHVE0uZC5vcmlnaW5hbERMcHVzaC50b1N0cmluZygpLHRpbWVzdGFtcDoobmV3IERhdGUpLmdldFRpbWUoKSxldmVudE1vZGVsOm51bGx9KSxhR1RNLmQuZGxIb29rTG9nZ2VkPSEwKSwicmVzdG9yZSI9PT1hR1RNLmMuZGxPcmdQdXNoJiYod2luZG93W2FHVE0uYy5nZGxdLnB1c2g9YUdUTS5kLm9yaWdpbmFsRExwdXNoLGE9ITEpKX1hJiYidXNlIj09PWFHVE0uYy5kbE9yZ1B1c2g/YUdUTS5kLm9yaWdpbmFsRExwdXNoKGUpOndpbmRvd1thR1RNLmMuZ2RsXS5wdXNoKGUpLCJmdW5jdGlvbiI9PXR5cGVvZiBhR1RNLmYuc2VuZG5hdXNfY2FsbGJhY2smJmFHVE0uZi5zZW5kbmF1c19jYWxsYmFjayhlKSxhR1RNLmYubG9nKCJtOSIsZSl9fSxhR1RNLmYuZmlyZT1mdW5jdGlvbihlKXtpZigib2JqZWN0Ij09dHlwZW9mIGUmJmUpe3RyeXtpZighKGE9SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYoZSkpKSlyZXR1cm4gdm9pZCBhR1RNLmYubG9nKCJlMTUiLGEpfWNhdGNoKG4pe3ZhciB0PSJhR1RNIEZpcmUgRXJyb3IgKEpTT04ucGFyc2UpIjsic3RyaW5nIj09dHlwZW9mIGUuZXZlbnQmJih0PXQrIiAoRXZlbnQ6ICIrZS5ldmVudCsiKSIpO3ZhciBhPXtldmVudDoiZXhjZXB0aW9uIixlcnJtc2c6bi5tZXNzYWdlLGVycnR5cGU6dCx0aW1lc3RhbXA6KG5ldyBEYXRlKS5nZXRUaW1lKCksZXJyY3Q6YUdUTS5kLmVycm9yX2NvdW50ZXJ8fDEsZXZlbnRNb2RlbDpudWxsfTthR1RNLmYubG9nKCJlMTUiLGEpfWlmKCEoIm51bWJlciI9PXR5cGVvZiBhLmFHVE10c3x8Im9iamVjdCI9PXR5cGVvZiBhLmV2ZW50TW9kZWwmJmEuZXZlbnRNb2RlbHx8InN0cmluZyIhPXR5cGVvZiBhLmV2ZW50JiYic3RyaW5nIj09dHlwZW9mIGEudHlwZSYmIm9iamVjdCI9PXR5cGVvZiBhLmZsYWdzJiYiYm9vbGVhbiI9PXR5cGVvZiBhLmZsYWdzLmVuYWJsZVVudGFnZ2VkUGFnZVJlcG9ydGluZyYmYS5mbGFncy5lbmFibGVVbnRhZ2dlZFBhZ2VSZXBvcnRpbmcpKXtpZihhLmFHVE10cz1EYXRlLm5vdygpLGEuZXZlbnRNb2RlbD1udWxsLGFHVE0uYy5jb25zZW50X2V2ZW50cyYmInN0cmluZyI9PXR5cGVvZiBhLmV2ZW50JiYoIiwiK2FHVE0uYy5jb25zZW50X2V2ZW50cysiLCIpLmluZGV4T2YoIiwiK2EuZXZlbnQrIiwiKT49MClpZigib2JqZWN0Ij09dHlwZW9mIGFHVE0uYy5jb25zZW50X2V2ZW50X2F0dHJbYS5ldmVudF0pZm9yKHZhciBuIGluIGFHVE0uYy5jb25zZW50X2V2ZW50X2F0dHJbYS5ldmVudF0pdm9pZCAwIT09YVtuXSYmKGFHVE0uYy5jb25zZW50X2V2ZW50X2F0dHJbYS5ldmVudF1bbl0mJmFbbl0hPWFHVE0uYy5jb25zZW50X2V2ZW50X2F0dHJbYS5ldmVudF1bbl18fGFHVE0uZi5ydW5fY2MoInVwZGF0ZSIpKTtlbHNlIGFHVE0uZi5ydW5fY2MoInVwZGF0ZSIpO2lmKGFHVE0uYy5kbFNldCYmIm9iamVjdCI9PXR5cGVvZiBnb29nbGVfdGFnX21hbmFnZXImJiJvYmplY3QiPT10eXBlb2YgZ29vZ2xlX3RhZ19tYW5hZ2VyW2FHVE0uYy5ndG1JRF0mJk9iamVjdC5rZXlzKGFHVE0uYy5kbFNldCkuZm9yRWFjaChmdW5jdGlvbihlKXt2YXIgdD1hR1RNLmMuZGxTZXRbZV0sbj1nb29nbGVfdGFnX21hbmFnZXJbYUdUTS5jLmd0bUlEXVthR1RNLmMuZ2RsXS5nZXQodCk7dm9pZCAwIT09biYmKGFbZV09bil9KSwoIm9iamVjdCIhPXR5cGVvZiBhR1RNLmQuY29uc2VudHx8IWFHVE0uZC5jb25zZW50Lmhhc1Jlc3BvbnNlfHwhYUdUTS5kLmNvbnNlbnQuZ3RtQ29uc2VudCkmJigic3RyaW5nIiE9dHlwZW9mIGEuZXZlbnR8fDAhPT1hLmV2ZW50LmluZGV4T2YoImFHVE0iKSkmJiFhLl9ub0NvbnNlbnR8fGFHVE0uYy5pZnJhbWVTdXBwb3J0JiZhR1RNLmQuaXNfaWZyYW1lJiYhYUdUTS5kLmlmcmFtZS5vcmlnaW4pcmV0dXJuIGRlbGV0ZSBhLmFHVE10cyxkZWxldGUgYS5ldmVudE1vZGVsLHZvaWQgYUdUTS5kLmYucHVzaChKU09OLnBhcnNlKGFHVE0uZi5zU3RyZihhKSkpO2lmKGEuX3Bvc3QmJiFhLl9wb3N0X3NlbnQpe3ZhciBvPSJvYmplY3QiPT10eXBlb2YgYS5fcG9zdD9hLl9wb3N0Ont9LHI9InN0cmluZyI9PXR5cGVvZiBvLnVybCYmby51cmw/by51cmw6YUdUTS5jLnRyYW5zcG9ydF91cmw7aWYocil7dmFyIHM9ImJvb2xlYW4iPT10eXBlb2Ygby5lbmM/by5lbmM6ISFhR1RNLmMudHJhbnNwb3J0X2VuYyxpPSJudW1iZXIiPT10eXBlb2Ygby5zYWx0JiZvLnNhbHQ+PTE/by5zYWx0OiJudW1iZXIiPT10eXBlb2YgYUdUTS5jLnRyYW5zcG9ydF9zYWx0JiZhR1RNLmMudHJhbnNwb3J0X3NhbHQ+PTE/YUdUTS5jLnRyYW5zcG9ydF9zYWx0OmFHVE0uYy5zZXNzaW9uX3NhbHR8fDAsYz1KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihhKSk7ZGVsZXRlIGMuX3Bvc3QsZGVsZXRlIGMuX3Bvc3Rfc2VudCxkZWxldGUgYy5ldmVudE1vZGVsLG8uY29uc2VudCYmIm9iamVjdCI9PXR5cGVvZiBhR1RNLmQuY29uc2VudCYmKGMuY29uc2VudD1KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihhR1RNLmQuY29uc2VudCkpKSxhR1RNLmYueHNlbmQocixjLHMsaSksYS5fcG9zdF9zZW50PSEwfX0oYUdUTS5kLmNvbnNlbnQuZ3RtQ29uc2VudHx8InN0cmluZyI9PXR5cGVvZiBhLmV2ZW50JiYwPT09YS5ldmVudC5pbmRleE9mKCJhR1RNIil8fGEuX25vQ29uc2VudCkmJigic3RyaW5nIj09dHlwZW9mIGEuZXZlbnQmJjA9PT1hLmV2ZW50LmluZGV4T2YoImFHVE0iKXx8KGRlbGV0ZSBhWyJndG0udW5pcXVlRXZlbnRJZCJdLGRlbGV0ZSBhLmFHVE1wYXJhbXMsYS5hR1RNcGFyYW1zPUpTT04ucGFyc2UoYUdUTS5mLnNTdHJmKGEpKSksYUdUTS5kLmRsLnB1c2goYSksYS5fbm9ETFB1c2g/ImZ1bmN0aW9uIj09dHlwZW9mIGFHVE0uZi5zZW5kbmF1c19jYWxsYmFjayYmYUdUTS5mLnNlbmRuYXVzX2NhbGxiYWNrKGEpOmFHVE0uYy5pZnJhbWVTdXBwb3J0JiZhR1RNLmQuaXNfaWZyYW1lJiYic3RyaW5nIj09dHlwZW9mIGEuZXZlbnQ/YUdUTS5mLmlGcmFtZUZpcmUoYSk6YUdUTS5mLnNlbmRuYXVzKGEpKSwiZnVuY3Rpb24iPT10eXBlb2YgYUdUTS5mLmZpcmVfY2FsbGJhY2smJmFHVE0uZi5maXJlX2NhbGxiYWNrKGEpLGFHVE0uZi5sb2coIm03IixhKX19ZWxzZSBhR1RNLmYubG9nKCJlOSIse286dHlwZW9mIGV9KX07');
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
