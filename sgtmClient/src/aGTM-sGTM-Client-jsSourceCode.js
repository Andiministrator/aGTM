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
  autoDenyLoadGtm: data.auto_deny_load_gtm !== false
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
  const cpData = (cp && cp.e) ? cp.e : (cp || {});

  // Resolve uid: explicit in payload first, then fall back to cookie.
  let cpUid = cpData.uid || '';
  if (!cpUid && CFG.cookieName) {
    const fbVals = getCookieValues(CFG.cookieName, true);
    cpUid = (fbVals && fbVals.length > 0) ? fbVals[0] : '';
  }

  // Phase 3 payload shape: { uid, sid, consent: {...} }.
  // Backwards-compat: flat { uid, services, purposes, vendors, feedback }.
  const cpConsent = (cpData.consent && typeof cpData.consent === 'object')
    ? cpData.consent
    : {
        hasResponse: true,
        services: cpData.services || '',
        purposes: cpData.purposes || '',
        vendors: cpData.vendors || '',
        feedback: cpData.feedback || ''
      };
  const cpServices = cpConsent.services || '';
  const cpPurposes = cpConsent.purposes || '';
  const cpVendors = cpConsent.vendors || '';
  if (CFG.debug) logToConsole('debug', '✓ Consent POST parsed', {uid: cpUid, services: cpServices, purposes: cpPurposes});

  // 1. Cookie management (unchanged behavior, only triggered in consent mode).
  if (CFG.cookieMode === 'consent' && CFG.cookieName) {
    const cookieOpts = {domain: CFG.cookieDomain, path: '/', sameSite: 'none', httpOnly: true, secure: true};
    const granted = hasRequiredConsent(cpServices, cpPurposes, cpVendors);
    if (granted && cpUid) {
      const maxAge = CFG.cookieLifetimeDays > 0 ? Math.floor(CFG.cookieLifetimeDays * 86400) : 0;
      if (maxAge > 0) cookieOpts['max-age'] = maxAge;
      setCookie(CFG.cookieName, cpUid, cookieOpts, true);
      if (CFG.debug) logToConsole('debug', '✓ User ID cookie set (consent granted)', cpUid);
    } else if (!granted && data.cookie_delete) {
      cookieOpts['max-age'] = 0;
      setCookie(CFG.cookieName, '', cookieOpts, true);
      if (CFG.debug) logToConsole('debug', '✓ User ID cookie deleted (consent withdrawn)');
    }
  }

  // 2. Persist consent into the Session API record so the next library load
  //    sees it via cfg.session.consent.
  const finishConsentPost = function() {
    setResponseStatus(200);
    setResponseHeader('Content-Type', 'application/json');
    setResponseBody('{"ok":true}');
    returnResponse();
  };

  if (CFG.sessionApiUrl && CFG.tenantID && cpUid) {
    const writeUrl = CFG.sessionApiUrl + '/' + CFG.tenantID + '/' + cpUid + '/consent';
    const writeBody = JSON.stringify(cpConsent);
    if (CFG.debug) logToConsole('debug', '→ Persisting consent to Session API', {url: writeUrl, body: writeBody});
    sendHttpRequest(writeUrl, {method: 'POST', headers: {'Content-Type': 'application/json'}, timeout: 5000}, writeBody).then(function(res) {
      if (CFG.debug) logToConsole('debug', '✓ Consent persisted', {uid: cpUid, status: res.statusCode});
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
    // granted consent this restores parity (otherwise the cookie max-age expires
    // until the user re-interacts with the CMP).
    if (cookieAllowed && sessionData.uid) {
      writeCookie(sessionData.uid);
    }

    if (CFG.debug) logToConsole('debug', '✓ Session', sessionData);
    buildAndSend(sessionData);
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
  // aGTM's preset gate requires sid OR a valid consent block — uid alone is
  // ignored, so we don't bother emitting in that case.
  if (sessionData && (sessionData.sid || sessionData.consent)) {
    c.session = sessionData;
  } else if (CFG.debug) {
    logToConsole('debug', '✗ session: nothing to pass through', sessionData);
  }
  // Consent-store endpoint (Phase 3 of the redesign POSTs consent diffs here).
  // URL is assembled from the request host + the same path prefix the library
  // route was served under + fixed CONSENT_STORE_PATH. The path prefix is
  // load-bearing for reverse-proxy setups (e.g. site serves aGTM.js under
  // /rp/tp/aGTM.js → consent must hit /rp/tp/aGTMconsent, not /aGTMconsent).
  // Integrator only flips a checkbox; no URL plumbing.
  if (CFG.consentStoreEnabled) {
    const host = CFG.sgtmHost || getRequestHeader('host') || '';
    if (host) {
      const libSuffix = '/aGTM.js';
      const libPathPrefix = rpath.length >= libSuffix.length ? rpath.slice(0, rpath.length - libSuffix.length) : '';
      c.consent_store_url = 'https://' + host + libPathPrefix + CONSENT_STORE_PATH;
      if (CFG.debug) logToConsole('debug', '✓ consent_store_url set', c.consent_store_url);
    } else if (CFG.debug) {
      logToConsole('debug', '✗ consent_store_url NOT set — host header missing and sgtm_host empty');
    }
  } else if (CFG.debug) {
    logToConsole('debug', '✗ consent_store_url NOT set — disabled by template config');
  }
  if (data.consent_store_enc) c.consent_store_enc = true;
  // session_salt is reused by aGTM for the consent-store POST encryption
  // (consent_store_enc) AND as a fallback for transport_salt.
  if (data.session_salt) { const ss = makeInteger(data.session_salt); if (ss > 0) c.session_salt = ss; }
  // POST Transport
  if (data.transport_url) c.transport_url = data.transport_url;
  if (data.transport_enc) c.transport_enc = true;
  if (data.transport_salt) { const ts = makeInteger(data.transport_salt); if (ts > 0) c.transport_salt = ts; }

  const config = 'aGTM.f.config(' + JSON.stringify(c) + ');';
  logToConsole('info', '\u2713 aGTM Config built', {uid: sessionData && sessionData.uid, sid: sessionData && sessionData.sid, ret: sessionData && sessionData.ret});

  // aGTM base64 payload (updated by build.sh)
  const agtm = fromBase64('d2luZG93LmFHVE09d2luZG93LmFHVE18fHt9LHdpbmRvdy5hR1RNLmM9d2luZG93LmFHVE0uY3x8e30sd2luZG93LmFHVE0uZD13aW5kb3cuYUdUTS5kfHx7fSx3aW5kb3cuYUdUTS5mPXdpbmRvdy5hR1RNLmZ8fHt9LHdpbmRvdy5hR1RNLmw9d2luZG93LmFHVE0ubHx8W10sd2luZG93LmFHVE0ubj13aW5kb3cuYUdUTS5ufHx7fSxhR1RNLmYucHJvcHNldD1mdW5jdGlvbihlLHQsYSl7dHJ5e2VbdF09ZVt0XXx8YX1jYXRjaChlKXt9fSxhR1RNLmYub2JqaW5pdD1mdW5jdGlvbigpe1tbYUdUTS5kLCJ2ZXJzaW9uIiwiMS41Il0sW2FHVE0uZCwiZiIsW11dLFthR1RNLmQsImNvbmZpZyIsITFdLFthR1RNLmQsImluaXQiLCExXSxbYUdUTS5kLCJkb21fcmVhZHkiLCExXSxbYUdUTS5kLCJwYWdlX3JlYWR5IiwhMV0sW2FHVE0uZCwiaXNfaWZyYW1lIix3aW5kb3cuc2VsZiE9PXdpbmRvdy50b3BdLFthR1RNLmQsImV2X2ZjdF9jdHIiLDBdLFthR1RNLmQsInRpbWVyIix7fV0sW2FHVE0uZCwiZXJyb3JfY291bnRlciIsMF0sW2FHVE0uZCwiZXJyb3JzIixbXV0sW2FHVE0uZCwiZGwiLFtdXSxbYUdUTS5kLCJzZXNzaW9uIix7fV0sW2FHVE0uZCwic2Vzc2lvbl9yZWFkeSIsITFdLFthR1RNLmQsInNlc3Npb25fc3RhdHVzIiwiIl0sW2FHVE0uZCwiaWZyYW1lIix7Y291bnRlcjp7ZXZlbnRzOjB9LG9yaWdpbjoiIixpZkxpc3RlbjohMSx0b3BMaXN0ZW46ITEsaGFuZHNoYWtlOiExLHRpbWVyOm51bGx9XSxbYUdUTS5kLCJsYXN0X3VybCIsbG9jYXRpb24uaHJlZl0sW2FHVE0uZiwidGwiLHt9XSxbYUdUTS5mLCJkbCIse31dLFthR1RNLmYsInBsIix7fV0sW2FHVE0sImwiLFtdXSxbYUdUTS5uLCJjayIsImNvb2tpZSJdLFthR1RNLm4sInRtIiwiZ29vZ2xldGFnbWFuYWdlciJdLFthR1RNLm4sInRhIiwidGFnYXNzaXN0YW50Lmdvb2dsZSJdXS5mb3JFYWNoKGZ1bmN0aW9uKGUpe2FHVE0uZi5wcm9wc2V0KGVbMF0sZVsxXSxlWzJdKX0pfSxhR1RNLmYub2JqaW5pdCgpLGFHVE0uZi5sb2c9ZnVuY3Rpb24oZSx0KXt2YXIgYT0ib2JqZWN0Ij09dHlwZW9mIHQmJnQ/SlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeSh0KSk6dDthR1RNLmwucHVzaCh7aWQ6ZSx0aW1lc3RhbXA6KG5ldyBEYXRlKS5nZXRUaW1lKCksb2JqOmF9KX0sYUdUTS5mLnN0cmNsZWFuPWZ1bmN0aW9uKGUpe3JldHVybiB2b2lkIDA9PT1lfHwib2JqZWN0Ij09dHlwZW9mIGUmJiFlPyIiOigic3RyaW5nIiE9dHlwZW9mIGUmJihlPWUudG9TdHJpbmcoKSksZS5yZXBsYWNlKC9bXmEtesOkw7bDvMOfQS1aw4TDlsOcMC05Xy1dL2csIiIpKX0sYUdUTS5mLnNTdHJmPWZ1bmN0aW9uKGUpe2lmKCJvYmplY3QiIT10eXBlb2YgZXx8IWUpe3ZhciB0PUpTT04uc3RyaW5naWZ5KHtldmVudDoiZXhjZXB0aW9uIixlcnJtc2c6IkRhdGFMYXllciBFbnRyeSBpcyBubyBvYmplY3QiLGVycnR5cGU6IkRMIEVycm9yIixvYmpfdHlwZTp0eXBlb2YgZSxvYmpfdmFsdWU6ZX0pO3JldHVybiBhR1RNLmYubG9nKCJlMTYiLEpTT04ucGFyc2UodCkpLEpTT04uc3RyaW5naWZ5KG51bGwpfXZhciBhPVtdO3JldHVybiBKU09OLnN0cmluZ2lmeShlLGZ1bmN0aW9uKGUsdCl7aWYoIm9iamVjdCI9PXR5cGVvZiB0JiZudWxsIT09dCl7aWYoLTEhPT1hLmluZGV4T2YodCkpcmV0dXJuIltDaXJjdWxhcl0iO2EucHVzaCh0KX1yZXR1cm4gdH0pfSxhR1RNLmYuYW49ZnVuY3Rpb24oZSx0LGEsbil7ZVt0XT1hLmhhc093blByb3BlcnR5KHQpP2FbdF06bn0sYUdUTS5mLmNvbmZpZz1mdW5jdGlvbihlKXtpZihhR1RNLmQuY29uZmlnKSJmdW5jdGlvbiI9PXR5cGVvZiBhR1RNLmYubG9nJiZhR1RNLmYubG9nKCJlMSIsYUdUTS5jKTtlbHNle2lmKGFHVE0uZi5hbihhR1RNLmMsImRlYnVnIixlLCExKSxhR1RNLmYuYW4oYUdUTS5jLCJwYXRoIixlLCIiKSxhR1RNLmYuYW4oYUdUTS5jLCJmaWxlIixlLCJhR1RNLmpzIiksYUdUTS5mLmFuKGFHVE0uYywiY21wIixlLCIiKSxhR1RNLmMubWluPSJib29sZWFuIiE9dHlwZW9mIGUubWlufHxlLm1pbixhR1RNLmYuYW4oYUdUTS5jLCJub25jZSIsZSwiIiksYUdUTS5mLmFuKGFHVE0uYywiaWZyYW1lU3VwcG9ydCIsZSwhMSksYUdUTS5mLmFuKGFHVE0uYywidlBhZ2V2aWV3cyIsZSwhMSksYUdUTS5mLmFuKGFHVE0uYywidlBhZ2V2aWV3c1RpbWVyIixlLDApLGFHVE0uZi5hbihhR1RNLmMsInZQYWdldmlld3NGYWxsYmFjayIsZSwhMSksYUdUTS5mLmFuKGFHVE0uYywiZ3RtSUQiLGUsIiIpLGUuZ3RtKWZvcih2YXIgdCBpbiBlLmd0bSllLmd0bS5oYXNPd25Qcm9wZXJ0eSh0KSYmKGFHVE0uYy5ndG1JRD1hR1RNLmMuZ3RtSUR8fHQsYUdUTS5jLmd0bT1hR1RNLmMuZ3RtfHx7fSxhR1RNLmMuZ3RtW3RdPWUuZ3RtW3RdfHx7fSxhR1RNLmYuYW4oYUdUTS5jLmd0bVt0XSwibm9Db25zZW50IixlLmd0bVt0XSwhMSksYUdUTS5mLmFuKGFHVE0uYy5ndG1bdF0sImVudiIsZS5ndG1bdF0sIiIpLGFHVE0uZi5hbihhR1RNLmMuZ3RtW3RdLCJpZFBhcmFtIixlLmd0bVt0XSwiIiksYUdUTS5mLmFuKGFHVE0uYy5ndG1bdF0sImd0bVVSTCIsZS5ndG1bdF0sIiIpLGFHVE0uZi5hbihhR1RNLmMuZ3RtW3RdLCJndG1KUyIsZS5ndG1bdF0sIiIpKTtpZihhR1RNLmYuYW4oYUdUTS5jLCJnZGwiLGUsImRhdGFMYXllciIpLGFHVE0uZi5hbihhR1RNLmMsImd0bVB1cnBvc2VzIixlLCIiKSxhR1RNLmYuYW4oYUdUTS5jLCJndG1TZXJ2aWNlcyIsZSwiIiksYUdUTS5mLmFuKGFHVE0uYywiZ3RtVmVuZG9ycyIsZSwiIiksYUdUTS5mLmFuKGFHVE0uYywiZ3RtQXR0ciIsZSxudWxsKSxhR1RNLmYuYW4oYUdUTS5jLCJkbFNldCIsZSx7fSksYUdUTS5mLmFuKGFHVE0uYywidXNlTGlzdGVuZXIiLGUsITEpLGFHVE0uZi5hbihhR1RNLmMsImRsT3JnUHVzaCIsZSwiIiksYUdUTS5jLmRsU3RhdGVFdmVudHM9ImJvb2xlYW4iPT10eXBlb2YgZS5kbFN0YXRlRXZlbnRzJiZlLmRsU3RhdGVFdmVudHMsYUdUTS5jLmFQYWdldmlldz0iYm9vbGVhbiI9PXR5cGVvZiBlLmFQYWdldmlldyYmZS5hUGFnZXZpZXcsYUdUTS5jLnZQYWdldmlldz0iYm9vbGVhbiI9PXR5cGVvZiBlLnZQYWdldmlldyYmZS52UGFnZXZpZXcsYUdUTS5jLnNlbmRDb25zZW50RXZlbnQ9ImJvb2xlYW4iPT10eXBlb2YgZS5zZW5kQ29uc2VudEV2ZW50JiZlLnNlbmRDb25zZW50RXZlbnQsYUdUTS5mLmFuKGFHVE0uYywiY29uc2VudF9ldmVudHMiLGUsIiIpLGFHVE0uYy5jb25zZW50X2V2ZW50X2F0dHI9YUdUTS5jLmNvbnNlbnRfZXZlbnRfYXR0cnx8e30sInN0cmluZyI9PXR5cGVvZiBhR1RNLmMuY29uc2VudF9ldmVudHMmJmFHVE0uYy5jb25zZW50X2V2ZW50cyl7Zm9yKHZhciBhPWFHVE0uYy5jb25zZW50X2V2ZW50cy5zcGxpdCgiLCIpLG49W10sbz0wO288YS5sZW5ndGg7bysrKXt2YXIgcj1hW29dLnJlcGxhY2UoL15ccyt8XHMrJC9nLCIiKTtpZihyKXt2YXIgcz1yLmluZGV4T2YoIlsiKTtpZihzPj0wKXt2YXIgaT1yLnN1YnN0cmluZygwLHMpLGM9ci5zdWJzdHJpbmcocysxLHIuaW5kZXhPZigiXSIpKSxmPWMuaW5kZXhPZigiOiIpLFQ9e307Zj49MD9UW2Muc3Vic3RyaW5nKDAsZildPWMuc3Vic3RyaW5nKGYrMSk6VFtjXT0iIixhR1RNLmMuY29uc2VudF9ldmVudF9hdHRyW2ldPVQsbi5wdXNoKGkpfWVsc2Ugbi5wdXNoKHIpfX1hR1RNLmMuY29uc2VudF9ldmVudHM9bi5qb2luKCIsIil9YUdUTS5mLmFuKGFHVE0uYywidHJhbnNwb3J0X3VybCIsZSwiIiksYUdUTS5mLmFuKGFHVE0uYywidHJhbnNwb3J0X2VuYyIsZSwhMSksYUdUTS5mLmFuKGFHVE0uYywidHJhbnNwb3J0X3NhbHQiLGUsMCksYUdUTS5mLmFuKGFHVE0uYywidXNlcl9pZCIsZSwiIiksYUdUTS5mLmFuKGFHVE0uYywic2Vzc2lvbl91cmwiLGUsIiIpLGFHVE0uZi5hbihhR1RNLmMsInNlc3Npb25fc2FsdCIsZSwwKSxhR1RNLmMuc2Vzc2lvbl93YWl0PSJib29sZWFuIj09dHlwZW9mIGUuc2Vzc2lvbl93YWl0JiZlLnNlc3Npb25fd2FpdCxhR1RNLmYuYW4oYUdUTS5jLCJzZXNzaW9uX3RpbWVvdXQiLGUsNWUzKSxhR1RNLmMuc2Vzc2lvbl9ndG1fb25fZGVueT0iYm9vbGVhbiIhPXR5cGVvZiBlLnNlc3Npb25fZ3RtX29uX2Rlbnl8fGUuc2Vzc2lvbl9ndG1fb25fZGVueSxlLmNvbnNlbnQ9ZS5jb25zZW50fHx7fSxhR1RNLmMuY29uc2VudD1hR1RNLmMuY29uc2VudHx8ZS5jb25zZW50LGFHVE0uZi5hbihhR1RNLmMuY29uc2VudCwiaGFzUmVzcG9uc2UiLGUuY29uc2VudCwhMSksYUdUTS5mLmFuKGFHVE0uYy5jb25zZW50LCJmZWVkYmFjayIsZS5jb25zZW50LCIiKSxhR1RNLmYuYW4oYUdUTS5jLmNvbnNlbnQsInB1cnBvc2VzIixlLmNvbnNlbnQsIiIpLGFHVE0uZi5hbihhR1RNLmMuY29uc2VudCwic2VydmljZXMiLGUuY29uc2VudCwiIiksYUdUTS5mLmFuKGFHVE0uYy5jb25zZW50LCJ2ZW5kb3JzIixlLmNvbnNlbnQsIiIpLGFHVE0uZi5hbihhR1RNLmMuY29uc2VudCwiY29uc2VudF9pZCIsZS5jb25zZW50LCIiKSx3aW5kb3dbYUdUTS5jLmdkbF09d2luZG93W2FHVE0uYy5nZGxdfHxbXSxhR1RNLmQuY29uc2VudD1hR1RNLmQuY29uc2VudHx8SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYoYUdUTS5jLmNvbnNlbnQpKSxhR1RNLmQuY29uc2VudC5ndG1Db25zZW50PSExLGFHVE0uZC5jb25maWc9ITAsYUdUTS5kLmd0bUxvYWRlZD1bXSwiZnVuY3Rpb24iPT10eXBlb2YgYUdUTS5mLmxvZyYmYUdUTS5mLmxvZygibTEiLGFHVE0uYyl9fSxhR1RNLmYubG9hZF9jYz1mdW5jdGlvbihlLHQpe3ZhciBhPWRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoInNjcmlwdCIpLG49YUdUTS5jLnBhdGh8fCIiO24ubGVuZ3RoPjAmJiIvIiE9PW4uY2hhckF0KG4ubGVuZ3RoLTEpJiYobis9Ii8iKTt2YXIgbz0iY21wL2NjXyIrYUdUTS5mLnN0cmNsZWFuKGUpKyhhR1RNLmMubWluPyIubWluIjoiIikrIi5qcyI7YS5zcmM9bitvLGFHVE0uYy5ub25jZSYmKGEubm9uY2U9YUdUTS5jLm5vbmNlKSxhLm9ucmVhZHlzdGF0ZWNoYW5nZT1hLm9ubG9hZD1mdW5jdGlvbigpe2EucmVhZHlTdGF0ZSYmIS9sb2FkZWR8Y29tcGxldGUvLnRlc3QoYS5yZWFkeVN0YXRlKXx8ImZ1bmN0aW9uIj09dHlwZW9mIHQmJnQoKX0sYS5hc3luYz0hMCxkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKGEpfSxhR1RNLmYuY2hlbHA9ZnVuY3Rpb24oZSx0KXt2YXIgYT0hMDtyZXR1cm4gZSYmdCYmZS5zcGxpdCgiLCIpLmZvckVhY2goZnVuY3Rpb24oZSl7dC5pbmRleE9mKCIsIitlLnRyaW0oKSsiLCIpPDAmJihhPSExKX0pLGF9LGFHVE0uZi5ldmFsQ29ucz1mdW5jdGlvbihlLHQpe3ZhciBpc0NvbnNlbnRHaXZlbj1mdW5jdGlvbihlLHQpe3JldHVybiBlLmV2ZXJ5KGZ1bmN0aW9uKGUpe3JldHVybiB0LmluZGV4T2YoIiwiK2UrIiwiKT49MH0pfSxhPSFlLnB1cnBvc2VzLmxlbmd0aHx8aXNDb25zZW50R2l2ZW4oZS5wdXJwb3Nlcyx0LnB1cnBvc2VzKSxuPSFlLnNlcnZpY2VzLmxlbmd0aHx8aXNDb25zZW50R2l2ZW4oZS5zZXJ2aWNlcyx0LnNlcnZpY2VzKSxvPSFlLnZlbmRvcnMubGVuZ3RofHxpc0NvbnNlbnRHaXZlbihlLnZlbmRvcnMsdC52ZW5kb3JzKTtyZXR1cm4gYSYmbiYmb30sYUdUTS5mLnJ1bl9jYz1mdW5jdGlvbihlKXtyZXR1cm4gYUdUTS5kLmNvbmZpZz8ic3RyaW5nIiE9dHlwZW9mIGV8fCJpbml0IiE9PWUmJiJ1cGRhdGUiIT09ZT8oYUdUTS5mLmxvZygiZTUiLHthY3Rpb246ZX0pLCExKToiZnVuY3Rpb24iIT10eXBlb2YgYUdUTS5mLmNvbnNlbnRfY2hlY2s/KGFHVE0uZi5sb2coImUxNCIse2FjdGlvbjplfSksITEpOmFHVE0uZi5jb25zZW50X2NoZWNrKGUpPygidXBkYXRlIj09PWUmJmRlbGV0ZSBhR1RNLmQuY29uc2VudC5ibG9ja2VkLHdpbmRvd1thR1RNLmMuZ2RsXT13aW5kb3dbYUdUTS5jLmdkbF18fFtdLGFHVE0uZi5jaGVscChhR1RNLmMuZ3RtUHVycG9zZXMsYUdUTS5kLmNvbnNlbnQucHVycG9zZXMpJiZhR1RNLmYuY2hlbHAoYUdUTS5jLmd0bVNlcnZpY2VzLGFHVE0uZC5jb25zZW50LnNlcnZpY2VzKSYmYUdUTS5mLmNoZWxwKGFHVE0uYy5ndG1WZW5kb3JzLGFHVE0uZC5jb25zZW50LnZlbmRvcnMpP2FHVE0uZC5jb25zZW50Lmd0bUNvbnNlbnQ9ITA6YUdUTS5kLmNvbnNlbnQuZ3RtQ29uc2VudD0iYm9vbGVhbiI9PXR5cGVvZiBhR1RNLmQuY29uc2VudC5ibG9ja2VkJiZhR1RNLmQuY29uc2VudC5ibG9ja2VkLCJ1cGRhdGUiPT1lJiYoYUdUTS5kLmluaXR8fGFHVE0uZi5pbmplY3QoKSxhR1RNLmYuc2VuZG5hdXMoe2V2ZW50OiJhR1RNX2NvbnNlbnRfdXBkYXRlIixhR1RNdHM6KG5ldyBEYXRlKS5nZXRUaW1lKCksYUdUTWNvbnNlbnQ6YUdUTS5kLmNvbnNlbnQ/SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYoYUdUTS5kLmNvbnNlbnQpKTp7fX0pKSwiZnVuY3Rpb24iPT10eXBlb2YgYUdUTS5mLmNvbnNlbnRfY2FsbGJhY2smJmFHVE0uZi5jb25zZW50X2NhbGxiYWNrKGUpLGFHVE0uZi5sb2coIm0zIixhR1RNLmQuY29uc2VudCksITApOihhR1RNLmYubG9nKCJtOCIsbnVsbCksITEpOihhR1RNLmYubG9nKCJlNCIsbnVsbCksITEpfSxhR1RNLmYuY2FsbF9jYz1mdW5jdGlvbigpe3JldHVybiEoImZ1bmN0aW9uIiE9dHlwZW9mIGFHVE0uZi5ydW5fY2N8fCFhR1RNLmYucnVuX2NjKCJpbml0IikpJiYodm9pZCAwIT09YUdUTS5kLnRpbWVyLmNvbnNlbnQmJihjbGVhckludGVydmFsKGFHVE0uZC50aW1lci5jb25zZW50KSxkZWxldGUgYUdUTS5kLnRpbWVyLmNvbnNlbnQpLCEhYUdUTS5kLmluaXR8fGFHVE0uZi5pbmplY3QoKSl9LCJmdW5jdGlvbiIhPXR5cGVvZiBhR1RNLmYuY29uc2VudF9saXN0ZW5lciYmKGFHVE0uZi5jb25zZW50X2xpc3RlbmVyPWZ1bmN0aW9uKCl7YUdUTS5jLnVzZUxpc3RlbmVyfHwoYUdUTS5kLnRpbWVyLmNvbnNlbnQ9c2V0SW50ZXJ2YWwoYUdUTS5mLmNhbGxfY2MsNTAwKSl9KSxhR1RNLmYuZ2M9ZnVuY3Rpb24oZSl7dmFyIHQ9bmV3IFJlZ0V4cChlKyI9KFteO10rKSIpLGE9bnVsbDt0cnl7dmFyIG49ZG9jdW1lbnQsbz10LmV4ZWMoblthR1RNLm4uY2tdKTtvJiZvLmxlbmd0aD4xJiYoYT1kZWNvZGVVUklDb21wb25lbnQob1sxXSkpfWNhdGNoKGUpe31yZXR1cm4gYX0sYUdUTS5mLnNjPWZ1bmN0aW9uKGUsdCl7aWYoInN0cmluZyI9PXR5cGVvZiBlJiZlJiZ0KXRyeXtkb2N1bWVudFthR1RNLm4uY2tdPWUrIj0iK3QrIjsgU2VjdXJlOyBTYW1lU2l0ZT1MYXg7IHBhdGg9LyJ9Y2F0Y2goZSl7fX0sYUdUTS5mLnVybFBhcmFtPWZ1bmN0aW9uKGUsdCl7dmFyIGE9bmV3IFJlZ0V4cCgiWz8mXSIrZSsiKD0oW14mI10qKXwmfCN8JCkiKS5leGVjKHQpO3JldHVybiBhJiZhWzJdP2RlY29kZVVSSUNvbXBvbmVudChhWzJdLnJlcGxhY2UoL1wrL2csIiAiKSk6bnVsbH0sYUdUTS5mLm9wdG91dD1mdW5jdGlvbigpe3ZhciBlPSExLHQ9YUdUTS5mLnVybFBhcmFtKCJhR1RNb3B0b3V0Iix3aW5kb3cubG9jYXRpb24uaHJlZik7aWYodCYmIjAiIT09dClhR1RNLmYuc2MoImFHVE1vcHRvdXQiLCIxIiksZT0hMDtlbHNlIGlmKCIwIj09PXQpYUdUTS5mLnNjKCJhR1RNb3B0b3V0IiwiMCIpO2Vsc2V7dmFyIGE9YUdUTS5mLmdjKCJhR1RNb3B0b3V0Iik7YSYmIjAiIT09YSYmKGU9ITApfWlmKGUpe2Zvcih2YXIgbiBpbiBhR1RNKWFHVE0uaGFzT3duUHJvcGVydHkobikmJiJmIiE9PW4mJmRlbGV0ZSBhR1RNW25dO3JldHVybiBhR1RNLmYub2JqaW5pdCgpLCJmdW5jdGlvbiI9PXR5cGVvZiBhR1RNLmYub3B0b3V0X2NhbGxiYWNrJiZhR1RNLmYub3B0b3V0X2NhbGxiYWNrKCksITB9cmV0dXJuITF9LGFHVE0uZi5hR1RNX2V2ZW50PWZ1bmN0aW9uKGUpeyJvYmplY3QiIT10eXBlb2YgYUdUTS5kLmNvbnNlbnQmJihhR1RNLmQuY29uc2VudD1udWxsKSxlfHwoZT0iYUdUTV9ldmVudCIpO3ZhciB0PXtldmVudDplLGFHVE10czoobmV3IERhdGUpLmdldFRpbWUoKSxhR1RNY29uc2VudDphR1RNLmQuY29uc2VudD9KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihhR1RNLmQuY29uc2VudCkpOnt9fTtyZXR1cm4iYUdUTV9yZWFkeSI9PWUmJih0LmFHVE09e3ZlcnNpb246YUdUTS5kLnZlcnNpb24saXNfaWZyYW1lOmFHVE0uZC5pc19pZnJhbWUsaGFzdHlFdmVudHM6YUdUTS5kLmYsZXJyb3JzOmFHVE0uZC5lcnJvcnN9KSx0fSxhR1RNLmYucHJveHlTdXBwb3J0PWZ1bmN0aW9uKCl7aWYoImZ1bmN0aW9uIiE9dHlwZW9mIFByb3h5KXJldHVybiExO3RyeXtyZXR1cm4gbmV3IFByb3h5KGZ1bmN0aW9uKCl7fSx7YXBwbHk6ZnVuY3Rpb24oKXtyZXR1cm4hMH19KSgpfWNhdGNoKGUpe3JldHVybiExfX0sYUdUTS5mLnVybExpc3RlbmVyPWZ1bmN0aW9uKGUsdCxhKXsibnVtYmVyIiE9dHlwZW9mIHQmJih0PTUwMCksImJvb2xlYW4iIT10eXBlb2YgYSYmKGE9ITEpLGFHVE0uZC5sYXN0X3VybD1hR1RNLmQubGFzdF91cmx8fGFHVE0uZi5nZXRWYWwoImwiLCJocmVmIiksInN0cmluZyI9PXR5cGVvZiBhR1RNLmQubGFzdF91cmwmJmFHVE0uZC5sYXN0X3VybHx8KGFHVE0uZC5sYXN0X3VybD0iIik7dmFyIGNoZWNrVXJsQ2hhbmdlPWZ1bmN0aW9uKCl7dmFyIHQ9YUdUTS5mLmdldFZhbCgibCIsImhyZWYiKXx8IiI7aWYodCE9YUdUTS5kLmxhc3RfdXJsKXsic3RyaW5nIiE9dHlwZW9mIGUmJihlPSJ2UGFnZXZpZXciKTt2YXIgYT17ZXZlbnQ6ZX07YS5vbGRVUkw9YUdUTS5kLmxhc3RfdXJsLGEubmV3VVJMPXQsYS5uZXdUaXRsZT1kb2N1bWVudC50aXRsZSxhR1RNLmYuZmlyZShhKSxhR1RNLmQubGFzdF91cmw9dH19O2FHVE0uZi5ldkxzdG4oIndpbmRvdyIsInBvcHN0YXRlIixjaGVja1VybENoYW5nZSksYUdUTS5mLmV2THN0bigid2luZG93IiwiaGFzaGNoYW5nZSIsY2hlY2tVcmxDaGFuZ2UpO3ZhciBuPSExO2lmKGFHVE0uZi5wcm94eVN1cHBvcnQoKSl7dmFyIG89e2FwcGx5OmZ1bmN0aW9uKGUsdCxhKXt2YXIgbj1lLmFwcGx5KHQsYSk7cmV0dXJuIGNoZWNrVXJsQ2hhbmdlKCksbn19O2hpc3RvcnkucHVzaFN0YXRlPW5ldyBQcm94eShoaXN0b3J5LnB1c2hTdGF0ZSxvKSxoaXN0b3J5LnJlcGxhY2VTdGF0ZT1uZXcgUHJveHkoaGlzdG9yeS5yZXBsYWNlU3RhdGUsbyksbj0hMH0odD4wJiYhbiYmYXx8dD4wJiYhYSkmJmFHVE0uZi50aW1lcigidXJsTGlzdGVuZXIiLGNoZWNrVXJsQ2hhbmdlLG51bGwsdCwwKX0sYUdUTS5mLmd0bV9sb2FkPWZ1bmN0aW9uKGUsdCxhLG4sbyxyKXtpZihhR1RNLmQuY29uZmlnKXtpZigib2JqZWN0IiE9dHlwZW9mIGFHVE0uZC5ndG1Mb2FkZWQmJihhR1RNLmQuZ3RtTG9hZGVkPVtdKSxhR1RNLmQuZ3RtTG9hZGVkLmxlbmd0aDwxJiYoYUdUTS5mLnNlbmRuYXVzKGFHVE0uZi5hR1RNX2V2ZW50KCJhR1RNX3JlYWR5IikpLGEmJmFHVE0uZi5zZW5kbmF1cyh7ZXZlbnQ6Imd0bS5qcyIsImd0bS5zdGFydCI6KG5ldyBEYXRlKS5nZXRUaW1lKCl9KSxhR1RNLmMuYVBhZ2V2aWV3JiZhR1RNLmYuc2VuZG5hdXMoe2V2ZW50OiJhUGFnZXZpZXciLGFHVE10czoobmV3IERhdGUpLmdldFRpbWUoKX0pLGFHVE0uYy52UGFnZXZpZXcmJmFHVE0uZi5zZW5kbmF1cyh7ZXZlbnQ6InZQYWdldmlldyIsYUdUTXRzOihuZXcgRGF0ZSkuZ2V0VGltZSgpfSksYUdUTS5jLnZQYWdldmlld3MmJmFHVE0uZi51cmxMaXN0ZW5lcigidlBhZ2V2aWV3IixhR1RNLmMudlBhZ2V2aWV3c1RpbWVyLGFHVE0uYy52UGFnZXZpZXdzRmFsbGJhY2spKSxhR1RNLmQuY29uc2VudEV2ZW50X2ZpcmVkPSJib29sZWFuIj09dHlwZW9mIGFHVE0uZC5jb25zZW50RXZlbnRfZmlyZWQmJmFHVE0uZC5jb25zZW50RXZlbnRfZmlyZWQsYUdUTS5jLnNlbmRDb25zZW50RXZlbnQmJiFhR1RNLmQuY29uc2VudEV2ZW50X2ZpcmVkJiYib2JqZWN0Ij09dHlwZW9mIGFHVE0uZC5jb25zZW50JiZhR1RNLmQuY29uc2VudC5oYXNSZXNwb25zZSYmKGFHVE0uZi5zZW5kbmF1cyhhR1RNLmYuYUdUTV9ldmVudCgiYUdUTV9jb25zZW50IikpLGFHVE0uZC5jb25zZW50RXZlbnRfZmlyZWQ9ITApLGEpe258fChuPSJpZCIpO3ZhciBzPSExLGk9YUdUTS5mLmdjKCJhR1RNZGVidWciKTtpZihpJiZwYXJzZUludChpKT4wJiYocz0hMCksc3x8YUdUTS5mLnVybFBhcmFtKCJndG1fZGVidWciLGRvY3VtZW50LmxvY2F0aW9uLmhyZWYpJiYocz0hMCksIXMmJmRvY3VtZW50LnJlZmVycmVyKXt2YXIgYz10LmNyZWF0ZUVsZW1lbnQoImEiKTtjLmhyZWY9ZG9jdW1lbnQucmVmZXJyZXIsYy5ob3N0bmFtZT09YUdUTS5uLnRhKyIuY29tIiYmKHM9ITApfSFpJiZzJiZhR1RNLmYuc2MoImFHVE1kZWJ1ZyIsIjEiKTt2YXIgZj10LmNyZWF0ZUVsZW1lbnQoInNjcmlwdCIpO2lmKGYuaWQ9ImFHVE1fdG1fIithLGYuYXN5bmM9ITAsIm9iamVjdCI9PXR5cGVvZiBhR1RNLmMuZ3RtQXR0cilmb3IodmFyIFQgaW4gYUdUTS5jLmd0bUF0dHIpZi5zZXRBdHRyaWJ1dGUoVCxhR1RNLmMuZ3RtQXR0cltUXSk7aWYoYUdUTS5jLm5vbmNlJiYoZi5ub25jZT1hR1RNLmMubm9uY2UpLHIuZ3RtSlMmJiFzKWYuaW5uZXJIVE1MPWF0b2Ioci5ndG1KUyk7ZWxzZXt2YXIgTT1yLmd0bVVSTHx8Imh0dHBzOi8vd3d3LiIrYUdUTS5uLnRtKyIuY29tL2d0bS5qcyIsRz1yLmVudnx8IiIsZD0tMT09PU0uaW5kZXhPZigiPyIpPyI/IjoiJiI7Zi5zcmM9TStkK24rIj0iK2ErIiZsPSIrbytHfXZhciBsPXQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoInNjcmlwdCIpWzBdO2wucGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUoZixsKSxhR1RNLmQuZ3RtTG9hZGVkLnB1c2goYXx8Im5vX2d0bV9pZCIpfX1lbHNlIGFHVE0uZi5sb2coImU3IixudWxsKX0sYUdUTS5mLmRvbXJlYWR5PWZ1bmN0aW9uKGUpe3ZhciB0PSExO2FHVE0uZi52T2IoZSl8fChlPXthTVNHOiJFbXB0eSBET01yZWFkeSBldmVudCBmaXJlZC4ifSx0PSEwKSxlLmV2ZW50fHwoZS5ldmVudD0iYURPTXJlYWR5IiksYUdUTS5kLmRvbV9yZWFkeSYmdHx8KCFhR1RNLmMuZGxTdGF0ZUV2ZW50cyYmdHx8YUdUTS5mLmZpcmUoZSksdCYmKGFHVE0uZC5kb21fcmVhZHk9ITApKX0sYUdUTS5mLnBhZ2VyZWFkeT1mdW5jdGlvbihlKXt2YXIgdD0hMTthR1RNLmYudk9iKGUpfHwoZT17YU1TRzoiRW1wdHkgUEFHRXJlYWR5IGV2ZW50IGZpcmVkLiJ9LHQ9ITApLGUuZXZlbnR8fChlLmV2ZW50PSJhUEFHRXJlYWR5IiksYUdUTS5kLnBhZ2VfcmVhZHkmJnR8fCghYUdUTS5jLmRsU3RhdGVFdmVudHMmJnR8fGFHVE0uZi5maXJlKGUpLHQmJihhR1RNLmQucGFnZV9yZWFkeT0hMCkpfSxhR1RNLmYuaW5pdEdUTT1mdW5jdGlvbihlKXtpZigib2JqZWN0Ij09dHlwZW9mIGFHVE0uYy5ndG0mJmFHVE0uYy5ndG0pe3ZhciB0PTA7Zm9yKHZhciBhIGluIGFHVE0uYy5ndG0pdCsrLGFHVE0uYy5ndG0uaGFzT3duUHJvcGVydHkoYSkmJigiYm9vbGVhbiIhPXR5cGVvZiBhR1RNLmMuZ3RtW2FdLmhhc0xvYWRlZCYmKGFHVE0uYy5ndG1bYV0uaGFzTG9hZGVkPSExKSxhR1RNLmMuZ3RtW2FdLmhhc0xvYWRlZHx8ZSYmIWFHVE0uYy5ndG1bYV0ubm9Db25zZW50fHwoYUdUTS5mLmd0bV9sb2FkKHdpbmRvdyxkb2N1bWVudCxhLGFHVE0uYy5ndG1bYV0uaWRQYXJhbT9hR1RNLmMuZ3RtW2FdLmlkUGFyYW06IiIsYUdUTS5jLmdkbCxhR1RNLmMuZ3RtW2FdKSxhR1RNLmMuZ3RtW2FdLmhhc0xvYWRlZD0hMCkpO3R8fGFHVE0uZi5ndG1fbG9hZCh3aW5kb3csZG9jdW1lbnQsIiIsYUdUTS5jLmd0bVthXS5pZFBhcmFtP2FHVE0uYy5ndG1bYV0uaWRQYXJhbToiIixhR1RNLmMuZ2RsLG51bGwpfX0sYUdUTS5mLmNoa0RQcmVhZHk9ZnVuY3Rpb24oKXt2YXIgZT1kb2N1bWVudC5yZWFkeVN0YXRlOyJpbnRlcmFjdGl2ZSI9PT1lfHwiY29tcGxldGUiPT09ZT9hR1RNLmYuZG9tcmVhZHkobnVsbCk6YUdUTS5mLmV2THN0bihkb2N1bWVudCwiRE9NQ29udGVudExvYWRlZCIsYUdUTS5mLmRvbXJlYWR5KSwiY29tcGxldGUiPT09ZT9hR1RNLmYucGFnZXJlYWR5KG51bGwpOmFHVE0uZi5ldkxzdG4od2luZG93LCJsb2FkIixhR1RNLmYucGFnZXJlYWR5KX0sYUdUTS5mLmluamVjdD1mdW5jdGlvbigpe2lmKCFhR1RNLmQuY29uZmlnKXJldHVybiBhR1RNLmYubG9nKCJlOCIsbnVsbCksITE7aWYoYUdUTS5jLnNlc3Npb25fd2FpdCYmIWFHVE0uZC5zZXNzaW9uX3JlYWR5KXJldHVybiExO2lmKCJvYmplY3QiIT10eXBlb2YgYUdUTS5kLmNvbnNlbnR8fCJib29sZWFuIiE9dHlwZW9mIGFHVE0uZC5jb25zZW50Lmhhc1Jlc3BvbnNlfHwhYUdUTS5kLmNvbnNlbnQuaGFzUmVzcG9uc2UpcmV0dXJuIGFHVE0uZi5sb2coImUxMyIsbnVsbCksITE7YUdUTS5kLmluaXR8fCgod2luZG93W2FHVE0uYy5nZGxdfHxbXSkuZm9yRWFjaChmdW5jdGlvbihlLHQpe2lmKCJvYmplY3QiPT10eXBlb2YgZSYmZSl7aWYoIWUuYUdUTWNoayl7ZS5hR1RNZGw9ITA7dmFyIGE9SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYoZSkpO3ZvaWQgMCE9PWFbImd0bS51bmlxdWVFdmVudElkIl0mJmRlbGV0ZSBhWyJndG0udW5pcXVlRXZlbnRJZCJdLGFHVE0uZC5mLnB1c2goYSl9fWVsc2UgYUdUTS5mLmxvZygiZTE3Iix7b2JqX3R5cGU6dHlwZW9mIGUsb2JqX3ZhbHVlOmUsaW5kZXg6dH0pLGFHVE0uZC5mLnB1c2goe2V2ZW50OiJleGNlcHRpb24iLGVycm1zZzoiRGF0YUxheWVyIEVudHJ5IGlzIG5vIG9iamVjdCIsZXJydHlwZToiREwgRXJyb3IiLG9ial90eXBlOnR5cGVvZiBlLG9ial92YWx1ZTplfSl9KSxhR1RNLmQuY29uc2VudC5ndG1Db25zZW50JiYoYUdUTS5mLmluaXRHVE0oITEpLGFHVE0uZC5pbml0PSEwKSxhR1RNLmQuaW5pdCYmYUdUTS5mLmNoa0RQcmVhZHkoKSk7cmV0dXJuImZ1bmN0aW9uIj09dHlwZW9mIGFHVE0uZi5pbmplY3RfY2FsbGJhY2smJmFHVE0uZi5pbmplY3RfY2FsbGJhY2soKSxhR1RNLmYubG9nKCJtNiIsbnVsbCksITB9LGFHVE0uZi5pRnJhbWVGaXJlPWZ1bmN0aW9uKGUpeyJvYmplY3QiPT10eXBlb2YgZSYmZSYmKGFHVE0uZC5pc19pZnJhbWUmJiJzdHJpbmciPT10eXBlb2YgZS5ldmVudCYmL14oYUdUTXxndG1cLnxbYXZdRE9NcmVhZHl8W2F2XVBBR0VyZWFkeSkvLnRlc3QoZS5ldmVudCk/YUdUTS5mLnNlbmRuYXVzKGUpOihlLmFHVE1fc291cmNlPSJpRnJhbWUgIitkb2N1bWVudC5sb2NhdGlvbi5ob3N0bmFtZSxhR1RNLmQuaWZyYW1lLmNvdW50ZXIuZXZlbnRzKyssZS5pZkV2Q3RyPWFHVE0uZC5pZnJhbWUuY291bnRlci5ldmVudHMsInN0cmluZyI9PXR5cGVvZiBlLmV2ZW50JiZlLmV2ZW50JiYoYUdUTS5kLmlmcmFtZS5jb3VudGVyW2UuZXZlbnRdPWFHVE0uZC5pZnJhbWUuY291bnRlcltlLmV2ZW50XXx8MCxhR1RNLmQuaWZyYW1lLmNvdW50ZXJbZS5ldmVudF0rKyxlWyJpZkV2Q3RyXyIrZS5ldmVudF09YUdUTS5kLmlmcmFtZS5jb3VudGVyW2UuZXZlbnRdKSxlLmFHVE10cyYmZGVsZXRlIGUuYUdUTXRzLGUuYUdUTXBhcmFtcyYmZGVsZXRlIGUuYUdUTXBhcmFtcyxhR1RNLmQuaWZyYW1lLm9yaWdpbj93aW5kb3cudG9wLnBvc3RNZXNzYWdlKGUsYUdUTS5kLmlmcmFtZS5vcmlnaW4pOmFHVE0uZC5mLnB1c2goZSkpKX0sYUdUTS5mLmlmSGFuZHNoYWtlPWZ1bmN0aW9uKCl7aWYoIWFHVE0uZC5pc19pZnJhbWUmJiFhR1RNLmQuaWZyYW1lLmhhbmRzaGFrZSl7dmFyIGU9ZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoImlmcmFtZSIpO2lmKCFlLmxlbmd0aClyZXR1cm47Zm9yKHZhciB0PTA7dDxlLmxlbmd0aDt0Kyspe3ZhciBhPWVbdF07YSYmYS5jb250ZW50V2luZG93JiZhLmNvbnRlbnRXaW5kb3cucG9zdE1lc3NhZ2UmJmEuY29udGVudFdpbmRvdy5wb3N0TWVzc2FnZSgiYUdUTV9Ub3AyaUZyYW1lIEhhbmRzaGFrZSIsIioiKX1hR1RNLmQuaWZyYW1lLmhhbmRzaGFrZT0hMH19LGFHVE0uZi5pZkhTbGlzdGVuPWZ1bmN0aW9uKGUpe2lmKGFHVE0uZC5pc19pZnJhbWUmJiJzdHJpbmciPT10eXBlb2YgZS5kYXRhJiYiYUdUTV9Ub3AyaUZyYW1lIEhhbmRzaGFrZSI9PWUuZGF0YSlmb3IoYUdUTS5kLmlmcmFtZS5vcmlnaW49ZS5vcmlnaW4sYUdUTS5kLmlmcmFtZS5pZkxpc3Rlbj0hMSx3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcigibWVzc2FnZSIsYUdUTS5mLmlmSFNsaXN0ZW4sITEpO2FHVE0uZC5mLmxlbmd0aDspe3ZhciB0PWFHVE0uZC5mLnNoaWZ0KCk7YUdUTS5mLmlGcmFtZUZpcmUodCl9fSxhR1RNLmYudk9iPWZ1bmN0aW9uKGUpe2lmKCJvYmplY3QiIT10eXBlb2YgZXx8IWUpcmV0dXJuITE7dHJ5e0pTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoZSkpfWNhdGNoKGUpe3JldHVybiExfXJldHVybiEwfSxhR1RNLmYudlN0PWZ1bmN0aW9uKGUpe3ZhciB0PUFycmF5LmlzQXJyYXkoZSk/ZToic3RyaW5nIj09dHlwZW9mIGU/W2VdOltdO3JldHVybiAwIT09dC5sZW5ndGgmJnQuZXZlcnkoZnVuY3Rpb24oZSl7cmV0dXJuInN0cmluZyI9PXR5cGVvZiBlJiYiIiE9PWV9KX0sYUdUTS5mLmV2THN0bj1mdW5jdGlvbihlLHQsYSl7aWYoIndpbmRvdyI9PT1lJiYoZT13aW5kb3cpLCJkb2N1bWVudCI9PT1lJiYoZT1kb2N1bWVudCksIm9iamVjdCI9PXR5cGVvZiBlJiZlJiYic3RyaW5nIj09dHlwZW9mIHQmJiJmdW5jdGlvbiI9PXR5cGVvZiBhKXRyeXsibWVzc2FnZSI9PXQ/YUdUTS5kLmlmcmFtZS50b3BMaXN0ZW58fGFHVE0uZC5pc19pZnJhbWV8fChhR1RNLmQuaWZyYW1lLnRvcExpc3Rlbj0hMCxlLmFkZEV2ZW50TGlzdGVuZXIodCxmdW5jdGlvbihlKXthKHZvaWQgMCE9PWUuZGF0YT9lLmRhdGE6bnVsbCwic3RyaW5nIj09dHlwZW9mIGUub3JpZ2luP2Uub3JpZ2luOiIiKX0pKTplLmFkZEV2ZW50TGlzdGVuZXIodCxhKX1jYXRjaChuKXthR1RNLmYubG9nKCJlMTIiLHtlcnJvcjpuLGVsOmUsZXY6dCxmY3Q6YX0pfWVsc2UgYUdUTS5mLmxvZygiZTExIix7ZWw6ZSxldjp0LGZjdDphfSl9LGFHVE0uZi5ybUxzdG49ZnVuY3Rpb24oZSx0LGEpeyJ3aW5kb3ciPT09ZSYmKGU9d2luZG93KSwiZG9jdW1lbnQiPT09ZSYmKGU9ZG9jdW1lbnQpO3RyeXtlLnJlbW92ZUV2ZW50TGlzdGVuZXIodCxhKX1jYXRjaChlKXt9fSxhR1RNLmYuZ2V0VmFsPWZ1bmN0aW9uKGUsdCl7aWYoYUdUTS5mLnZTdChbZSx0XSkmJnQubWF0Y2goL1thLXpdKy9pKSYmKCJwIiE9ZXx8Im9iamVjdCI9PXR5cGVvZiBwZXJmb3JtYW5jZSYmcGVyZm9ybWFuY2UpKXN3aXRjaChlKXtjYXNlInciOnJldHVybiBhR1RNLmYudk9iKHdpbmRvd1t0XSk/SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYod2luZG93W3RdKSk6d2luZG93W3RdO2Nhc2UibiI6cmV0dXJuIGFHVE0uZi52T2IobmF2aWdhdG9yW3RdKT9KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihuYXZpZ2F0b3JbdF0pKTpuYXZpZ2F0b3JbdF07Y2FzZSJkIjpyZXR1cm4gZG9jdW1lbnRbdF07Y2FzZSJsIjpyZXR1cm4gZG9jdW1lbnQubG9jYXRpb25bdF07Y2FzZSJoIjpyZXR1cm4gZG9jdW1lbnQuaGVhZFt0XTtjYXNlImIiOnJldHVybiBkb2N1bWVudC5ib2R5W3RdO2Nhc2UicyI6cmV0dXJuIGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCJodG1sIilbMF0uc2Nyb2xsVG9wfHwwO2Nhc2UibSI6cmV0dXJuIHdpbmRvdy5zY3JlZW5bdF07Y2FzZSJjIjpyZXR1cm4gd2luZG93Lmdvb2dsZV90YWdfZGF0YSYmd2luZG93Lmdvb2dsZV90YWdfZGF0YS5pY3M/SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYod2luZG93Lmdvb2dsZV90YWdfZGF0YS5pY3MpKTpudWxsO2Nhc2UicCI6cmV0dXJuIm5vdyI9PXQ/cGVyZm9ybWFuY2Uubm93KCk6cGVyZm9ybWFuY2VbdF07ZGVmYXVsdDpyZXR1cm59fSxhR1RNLmYuZ2V0Tm9kZUF0dHI9ZnVuY3Rpb24oZSx0KXt2YXIgYT1kb2N1bWVudC5xdWVyeVNlbGVjdG9yKGUpO3JldHVybiBhP2EuZ2V0QXR0cmlidXRlKHQpOm51bGx9LGFHVE0uZi5uZXdOb2RlPWZ1bmN0aW9uKGUsdCxhKXtpZihhR1RNLmYudlN0KFtlLHRdKSYmIm9iamVjdCI9PXR5cGVvZiBhKXt2YXIgbj1kb2N1bWVudC5jcmVhdGVFbGVtZW50KGUpLG89ZG9jdW1lbnQucXVlcnlTZWxlY3Rvcih0KTtpZihvKXtmb3IodmFyIHIgaW4gYSlpZihhLmhhc093blByb3BlcnR5KHIpKXt2YXIgcz1yLnNwbGl0KCIuIik7MT09PXMubGVuZ3RoP24uc2V0QXR0cmlidXRlKHIsYVtyXSk6KG5bc1swXV18fChuW3NbMF1dPXt9KSxuW3NbMF1dW3NbMV1dPWFbcl0pfW8uYXBwZW5kQ2hpbGQobil9fX0sYUdUTS5mLmRlbE5vZGU9ZnVuY3Rpb24oZSl7aWYoYUdUTS5mLnZTdChlKSl7dmFyIHQ9ZG9jdW1lbnQucXVlcnlTZWxlY3RvcihlKTt0JiZ0LnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQodCl9fSxhR1RNLmYucGFnZWluZm89ZnVuY3Rpb24oZSl7dmFyIHQ9MCxhPTA7aWYoKGU9ZXx8e30pLmNvdW50V29yZHMmJmZ1bmN0aW9uIGdldFRleHQoZSl7aWYoMz09PWUubm9kZVR5cGUpdCs9ZS50ZXh0Q29udGVudC50cmltKCkuc3BsaXQoL1xzKy8pLmxlbmd0aDtlbHNlIGlmKDE9PT1lLm5vZGVUeXBlJiYhL14oc2NyaXB0fHN0eWxlfG5vc2NyaXB0KSQvaS50ZXN0KGUudGFnTmFtZSkpZm9yKHZhciBhPTA7YTxlLmNoaWxkTm9kZXMubGVuZ3RoO2ErKylnZXRUZXh0KGUuY2hpbGROb2Rlc1thXSl9KGRvY3VtZW50LmJvZHkpLGUuY291bnRJbWFnZXMpZm9yKHZhciBuPWRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCJpbWciKSxvPTA7bzxuLmxlbmd0aDtvKyspbltvXS5uYXR1cmFsV2lkdGg+MjUwJiZuW29dLm5hdHVyYWxIZWlnaHQ+MjUwJiZhKys7cmV0dXJue3dvcmRzOnQsaW1hZ2VzOmF9fSxhR1RNLmYuY3BMc3Q9ZnVuY3Rpb24oZSx0LGEpe3RyeXtlLmFkZEV2ZW50TGlzdGVuZXIodCxmdW5jdGlvbihlKXt2YXIgdDt3aW5kb3cuZ2V0U2VsZWN0aW9uJiYodD13aW5kb3cuZ2V0U2VsZWN0aW9uKCkudG9TdHJpbmcoKSkmJmEodCl9KX1jYXRjaCh0KXthR1RNLmYubG9nKCJlMTIiLHtlbGVtZW50OmUsZXJyb3I6dH0pfX0sYUdUTS5mLmVsTHN0PWZ1bmN0aW9uKGUsdCxhKXt0cnl7ZS5hZGRFdmVudExpc3RlbmVyKHQsZnVuY3Rpb24oZSl7Zm9yKHZhciB0PXRoaXMudGFnTmFtZS50b0xvd2VyQ2FzZSgpLG49IiIsbz0iIixyPW51bGwscz1udWxsLGk9MCxjPXRoaXM7YyYmYy5wYXJlbnRFbGVtZW50OyljPWMucGFyZW50RWxlbWVudCwhbiYmYy5pZCYmKG49KCJzdHJpbmciPT10eXBlb2YgYy5ub2RlTmFtZT9jLm5vZGVOYW1lLnRvTG93ZXJDYXNlKCkrIjoiOiIiKStjLmlkKSwhbyYmYy5nZXRBdHRyaWJ1dGUoImNsYXNzIikmJihvPSgic3RyaW5nIj09dHlwZW9mIGMubm9kZU5hbWU/Yy5ub2RlTmFtZS50b0xvd2VyQ2FzZSgpKyI6IjoiIikrYy5nZXRBdHRyaWJ1dGUoImNsYXNzIikpO2lmKCJpbnB1dCI9PT10fHwic2VsZWN0Ij09PXR8fCJ0ZXh0YXJlYSI9PT10KXtmb3IoYz10aGlzO2MmJmMucGFyZW50RWxlbWVudCYmImZvcm0iIT09Yy50YWdOYW1lLnRvTG93ZXJDYXNlKCk7KWM9Yy5wYXJlbnRFbGVtZW50OyJmb3JtIj09PWMudGFnTmFtZS50b0xvd2VyQ2FzZSgpJiYocj17aWQ6Yy5pZCxjbGFzczpjLmdldEF0dHJpYnV0ZSgiY2xhc3MiKSxuYW1lOmMuZ2V0QXR0cmlidXRlKCJuYW1lIiksYWN0aW9uOmMuYWN0aW9uLGVsZW1lbnRzOmMuZWxlbWVudHMubGVuZ3RofSxzPUFycmF5LnByb3RvdHlwZS5pbmRleE9mLmNhbGwoYy5lbGVtZW50cyx0aGlzKSsxKX0ib2JqZWN0Ij09dHlwZW9mIHRoaXMuZWxlbWVudHMmJiJudW1iZXIiPT10eXBlb2YgdGhpcy5lbGVtZW50cy5sZW5ndGgmJihpPXRoaXMuZWxlbWVudHMubGVuZ3RoKTt2YXIgZj17dGFnTmFtZTp0LHRhcmdldDp0aGlzLnRhcmdldHx8IiIscGFyZW50SUQ6bixwYXJlbnRDbGFzczpvLGlkOnRoaXMuaWR8fCIiLG5hbWU6dGhpcy5nZXRBdHRyaWJ1dGUoIm5hbWUiKXx8IiIsY2xhc3M6dGhpcy5nZXRBdHRyaWJ1dGUoImNsYXNzIil8fCIiLGhyZWY6dGhpcy5ocmVmfHwiIixzcmM6dGhpcy5zcmN8fCIiLGFjdGlvbjp0aGlzLmFjdGlvbnx8IiIsdHlwZTp0aGlzLnR5cGV8fCIiLGVsZW1lbnRzOmkscG9zaXRpb246cyxmb3JtOnIsaHRtbDp0aGlzLm91dGVySFRNTD90aGlzLm91dGVySFRNTC50b1N0cmluZygpOiIiLHRleHQ6dGhpcy5vdXRlclRleHQ/dGhpcy5vdXRlclRleHQudG9TdHJpbmcoKToiIn07Zi5odG1sLmxlbmd0aD41MTImJihmLmh0bWw9Zi5odG1sLnNsaWNlKDAsNTA5KSsiLi4uIiksZi50ZXh0Lmxlbmd0aD41MTImJihmLnRleHQ9Zi50ZXh0LnNsaWNlKDAsNTA5KSsiLi4uIiksYShmKX0pfWNhdGNoKHQpe2FHVE0uZi5sb2coImUxMiIse2VsZW1lbnQ6ZSxlcnJvcjp0fSl9fSxhR1RNLmYuYWRkRWxMc3Q9ZnVuY3Rpb24oZSx0LGEpe2lmKGFHVE0uZi52U3QoW2UsdF0pJiYiZnVuY3Rpb24iPT10eXBlb2YgYSl7dmFyIG49ZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChlKTsib2JqZWN0Ij09dHlwZW9mIG4mJiJudW1iZXIiPT10eXBlb2Ygbi5sZW5ndGgmJjAhPW4ubGVuZ3RoJiZuLmZvckVhY2goZnVuY3Rpb24oZSl7aWYoImNvcHkiPT09dClhR1RNLmYuY3BMc3QoZSx0LGEpO2Vsc2UgYUdUTS5mLmVsTHN0KGUsdCxhKX0pfX0sYUdUTS5mLm9ic2VydmVyPWZ1bmN0aW9uKGUsdCxhKXtpZihhR1RNLmYudlN0KFtlLHRdKSYmImZ1bmN0aW9uIj09dHlwZW9mIGEpe25ldyBNdXRhdGlvbk9ic2VydmVyKGZ1bmN0aW9uKG4pe24uZm9yRWFjaChmdW5jdGlvbihuKXsiY2hpbGRMaXN0Ij09PW4udHlwZSYmbi5hZGRlZE5vZGVzLmxlbmd0aCYmQXJyYXkucHJvdG90eXBlLmZvckVhY2guY2FsbChuLmFkZGVkTm9kZXMsZnVuY3Rpb24obil7aWYoMT09PW4ubm9kZVR5cGUmJiJzdHJpbmciPT10eXBlb2Ygbi50YWdOYW1lJiZuLnRhZ05hbWUudG9Mb3dlckNhc2UoKT09PWUudG9Mb3dlckNhc2UoKSYmYUdUTS5mLmVsTHN0KG4sdCxhKSwxPT09bi5ub2RlVHlwZSYmbi5xdWVyeVNlbGVjdG9yQWxsKXt2YXIgbz1uLnF1ZXJ5U2VsZWN0b3JBbGwoZS50b0xvd2VyQ2FzZSgpKTtBcnJheS5wcm90b3R5cGUuZm9yRWFjaC5jYWxsKG8sZnVuY3Rpb24oZSl7YUdUTS5mLmVsTHN0KGUsdCxhKX0pfX0pfSl9KS5vYnNlcnZlKGRvY3VtZW50LmJvZHkse2NoaWxkTGlzdDohMCxzdWJ0cmVlOiEwLGF0dHJpYnV0ZXM6ITF9KX19LGFHVE0uZi5yVGVzdD1mdW5jdGlvbihlLHQpe3JldHVybiBhR1RNLmYudlN0KFtlLHRdKSYmbmV3IFJlZ0V4cCh0LCJpIikudGVzdChlKX0sYUdUTS5mLnJNYXRjaD1mdW5jdGlvbihlLHQpe3JldHVybiBlLm1hdGNoKG5ldyBSZWdFeHAodCkpfSxhR1RNLmYuclJlcGxhY2U9ZnVuY3Rpb24oZSx0LGEpe3JldHVybiBhR1RNLmYudlN0KFtlLHQsYV0pP2UucmVwbGFjZShuZXcgUmVnRXhwKHQsImdpIiksYSk6ZX0sYUdUTS5mLmlzSUZyYW1lPWZ1bmN0aW9uKCl7cmV0dXJuIHdpbmRvdy5zZWxmIT09d2luZG93LnRvcH0sYUdUTS5mLmpzZXJyb3JzPWZ1bmN0aW9uKCl7YUdUTS5mLmV2THN0bih3aW5kb3csImVycm9yIixmdW5jdGlvbihlKXtpZihudWxsIT09ZSl7dmFyIHQ9InN0cmluZyI9PXR5cGVvZiBlLm1lc3NhZ2U/ZS5tZXNzYWdlOiIiLGE9InN0cmluZyI9PXR5cGVvZiBlLmZpbGVuYW1lP2UuZmlsZW5hbWU6IiI7aWYoInNjcmlwdCBlcnJvci4iPT10LnRvTG93ZXJDYXNlKCkpe2lmKCFhKXJldHVybjt0PXQucmVwbGFjZSgiLiIsIjoiKSsiIGVycm9yIGZyb20gb3RoZXIgZG9tYWluLiJ9YSYmKHQrPSIgfCBmaWxlOiAiK2EpO3ZhciBuPWFHVE0uZi5zdHJjbGVhbihlLmxpbmVubyk7IjAiPT1uJiYobj0iIiksbiYmKHQrPSIgfCBsaW5lOiAiK24pO3ZhciBvPWFHVE0uZi5zdHJjbGVhbihlLmNvbG5vKTsiMCI9PW8mJihvPSIiKSxvJiYodCs9IiB8IGNvbDogIitvKSxhR1RNLmQuZXJyb3JzLnB1c2godCk7dmFyIHI9IiI7dHJ5e3I9bmF2aWdhdG9yLmFwcENvZGVOYW1lKyIgfCAiK25hdmlnYXRvci5hcHBOYW1lKyIgfCAiK25hdmlnYXRvci5hcHBWZXJzaW9uKyIgfCAiK25hdmlnYXRvci5wbGF0Zm9ybX1jYXRjaChlKXt9aWYoYUdUTS5kLmVycm9yX2NvdW50ZXIrKz49MTAwKXJldHVybjthR1RNLmQuZXJyb3JfY291bnRlcjw9NSYmYUdUTS5mLmZpcmUoe2V2ZW50OiJleGNlcHRpb24iLGVycm1zZzp0LGJyb3dzZXI6cixlcnJ0eXBlOiJKUyBFcnJvciIsdGltZXN0YW1wOihuZXcgRGF0ZSkuZ2V0VGltZSgpLGVycmN0OmFHVE0uZC5lcnJvcl9jb3VudGVyLGV2ZW50TW9kZWw6bnVsbH0pfX0pfSxhR1RNLmYudGltZXJma3Q9ZnVuY3Rpb24oZSl7dmFyIHQ9SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYoZSkpO3QudGltZXJfbXM9MSp0LnRpbWVyX21zLHQudGltZXJfY3QrKyx0LnRpbWVyX3RtPXQudGltZXJfbXMqdC50aW1lcl9jdCx0LnRpbWVyX3NjPXBhcnNlRmxvYXQoKHQudGltZXJfdG0vMWUzKS50b0ZpeGVkKDMpKSx0LmV2ZW50PXQuZXZlbnR8fCJ0aW1lciIsLTEhPT10LmV2ZW50LmluZGV4T2YoIltzXSIpJiYodC5ldmVudD10LmV2ZW50LnJlcGxhY2UoIltzXSIsdC50aW1lcl9zYy50b1N0cmluZygpKSksdC5ldmVudE1vZGVsPW51bGwsYUdUTS5mLmZpcmUodCl9LGFHVE0uZi50aW1lcj1mdW5jdGlvbihlLHQsYSxuLG8pe2lmKCFlJiYib2JqZWN0Ij09dHlwZW9mIGEmJmEmJiJzdHJpbmciPT10eXBlb2YgYS5ldmVudCYmKGU9YS5ldmVudCksZT1lfHwidGltZXIiLGUrPSJfIisobmV3IERhdGUpLmdldFRpbWUoKS50b1N0cmluZygpKyJfIitNYXRoLmZsb29yKDk5OTk5OSpNYXRoLnJhbmRvbSgpKzEpLnRvU3RyaW5nKCksYUdUTS5mLnN0b3B0aW1lcihlKSwib2JqZWN0Ij09dHlwZW9mIGEmJmEpdmFyIHI9SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYoYSkpO2Vsc2Ugcj17fTtyLnRpbWVyX25tPWUsci50aW1lcl9tcz1uLHIudGltZXJfcnA9byxyLnRpbWVyX2N0PTAsci5pZD0xPT09ci50aW1lcl9ycD9zZXRUaW1lb3V0KGZ1bmN0aW9uKCl7dD90KHIpOmFHVE0uZi50aW1lcmZrdChyKX0sbik6c2V0SW50ZXJ2YWwoZnVuY3Rpb24oKXt0P3Qocik6YUdUTS5mLnRpbWVyZmt0KHIpLHIudGltZXJfY3QrKyxyLnRpbWVyX3JwPjAmJnIudGltZXJfY3Q+PXIudGltZXJfcnAmJmFHVE0uZi5zdG9wdGltZXIoci50aW1lcl9ubSl9LG4pLGFHVE0uZC50aW1lcltlXT1yfSxhR1RNLmYuc3RvcHRpbWVyPWZ1bmN0aW9uKGUpe2lmKCJvYmplY3QiIT10eXBlb2YgYUdUTS5kLnRpbWVyJiYoYUdUTS5kLnRpbWVyPXt9KSwib2JqZWN0Ij09dHlwZW9mIGFHVE0uZC50aW1lcltlXSl7dmFyIHQ9YUdUTS5kLnRpbWVyW2VdOzE9PT10LnRpbWVyX3JwP2NsZWFyVGltZW91dCh0LmlkKTpjbGVhckludGVydmFsKHQuaWQpLGRlbGV0ZSBhR1RNLmQudGltZXJbZV19fSxhR1RNLmYuaW5pdD1mdW5jdGlvbigpeyFhR1RNLmMuZGVidWcmJmFHVE0uZi5vcHRvdXQoKXx8KGFHVE0uZi5jb25maWcoYUdUTS5jKSxhR1RNLmYuc2Vzc2lvbl9mZXRjaCgpLGFHVE0uYy5pZnJhbWVTdXBwb3J0JiZhR1RNLmQuaXNfaWZyYW1lPyhhR1RNLmQuY29uc2VudC5ndG1Db25zZW50PSEwLGFHVE0uZC5jb25zZW50Lmhhc1Jlc3BvbnNlPSEwLGFHVE0uZC5jb25zZW50LmZlZWRiYWNrPSJQYWdlIGlzIGlGcmFtZSIsYUdUTS5kLmlmcmFtZS5pZkxpc3Rlbnx8KGFHVE0uZC5pZnJhbWUuaWZMaXN0ZW49ITAsd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoIm1lc3NhZ2UiLGFHVE0uZi5pZkhTbGlzdGVuKSksYUdUTS5kLmluaXR8fGFHVE0uZi5pbmplY3QoKSk6InN0cmluZyI9PXR5cGVvZiBhR1RNLmMuY21wJiZhR1RNLmMuY21wPyJub25lIj09YUdUTS5jLmNtcD8oYUdUTS5kLmNvbnNlbnQ9e2d0bUNvbnNlbnQ6ITAsaGFzUmVzcG9uc2U6ITAsZmVlZGJhY2s6Ik5vIENvbnNlbnQgQ2hlY2sgY29uZmlndXJlZCJ9LGFHVE0uZi5pbmplY3QoKSk6KGFHVE0uZi5sb2FkX2NjKGFHVE0uYy5jbXAsYUdUTS5mLmNvbnNlbnRfbGlzdGVuZXIpLGFHVE0uZi5pbml0R1RNKCEwKSk6KGFHVE0uZi5jb25zZW50X2xpc3RlbmVyKCksYUdUTS5mLmluaXRHVE0oITApKSxhR1RNLmYuanNlcnJvcnMoKSl9LGFHVE0uZi5lbmM9ZnVuY3Rpb24oZSx0KXt2YXIgYT10JTYzKzEsbj1idG9hKHVuZXNjYXBlKGVuY29kZVVSSUNvbXBvbmVudChlKSkpLG89MDsiPSI9PT1uLmNoYXJBdChuLmxlbmd0aC0xKSYmbysrLCI9Ij09PW4uY2hhckF0KG4ubGVuZ3RoLTIpJiZvKyssbj1uLnNsaWNlKDAsbi5sZW5ndGgtbyk7Zm9yKHZhciByPTE9PT1vPyJ+IjoyPT09bz8ifn4iOiIiLHM9IiIsaT0wO2k8bi5sZW5ndGg7aSsrKXt2YXIgYz0iQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ejAxMjM0NTY3ODkrLyIuaW5kZXhPZihuLmNoYXJBdChpKSk7cys9YzwwP24uY2hhckF0KGkpOiJBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWmFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6MDEyMzQ1Njc4OS1fIi5jaGFyQXQoKGMrYSklNjQpfXJldHVybiBvP3Muc2xpY2UoMCwzKStyK3Muc2xpY2UoMyk6c30sYUdUTS5mLnhzZW5kPWZ1bmN0aW9uKGUsdCxhLG4pe2lmKGUmJiJzdHJpbmciPT10eXBlb2YgZSl0cnl7dmFyIG8scj1uZXcgWE1MSHR0cFJlcXVlc3Q7cmV0dXJuIHIub3BlbigiUE9TVCIsZSwhMCksci5zZXRSZXF1ZXN0SGVhZGVyKCJDb250ZW50LVR5cGUiLCJhcHBsaWNhdGlvbi9qc29uIiksbz1hJiYibnVtYmVyIj09dHlwZW9mIG4mJm4+PTE/J3sicSI6IicrYUdUTS5mLmVuYyhhR1RNLmYuc1N0cmYodCksbikrJyJ9JzoneyJlIjonK2FHVE0uZi5zU3RyZih0KSsifSIsci5zZW5kKG8pLHJ9Y2F0Y2godCl7cmV0dXJuIGFHVE0uZi5sb2coImVfeHNlbmQiLHttc2c6dC5tZXNzYWdlLHVybDplfSksbnVsbH19LGFHVE0uZi54ZmV0Y2g9ZnVuY3Rpb24oZSx0LGEsbixvKXtpZighZXx8InN0cmluZyIhPXR5cGVvZiBlKXJldHVybiJmdW5jdGlvbiI9PXR5cGVvZiBvJiZvKG51bGwpLG51bGw7dHJ5e3ZhciByLHM9bmV3IFhNTEh0dHBSZXF1ZXN0O3JldHVybiBzLm9wZW4oIlBPU1QiLGUsITApLHMuc2V0UmVxdWVzdEhlYWRlcigiQ29udGVudC1UeXBlIiwiYXBwbGljYXRpb24vanNvbiIpLHI9YSYmIm51bWJlciI9PXR5cGVvZiBuJiZuPj0xPyd7InEiOiInK2FHVE0uZi5lbmMoYUdUTS5mLnNTdHJmKHQpLG4pKycifSc6J3siZSI6JythR1RNLmYuc1N0cmYodCkrIn0iLHMub25yZWFkeXN0YXRlY2hhbmdlPWZ1bmN0aW9uKCl7aWYoND09PXMucmVhZHlTdGF0ZSlpZihzLnN0YXR1cz49MjAwJiZzLnN0YXR1czwzMDApdHJ5e3ZhciB0PUpTT04ucGFyc2Uocy5yZXNwb25zZVRleHQpOyJmdW5jdGlvbiI9PXR5cGVvZiBvJiZvKHQpfWNhdGNoKHQpe2FHVE0uZi5sb2coImVfeGZldGNoIix7bXNnOiJKU09OIHBhcnNlIGVycm9yIix1cmw6ZX0pLCJmdW5jdGlvbiI9PXR5cGVvZiBvJiZvKG51bGwpfWVsc2UgYUdUTS5mLmxvZygiZV94ZmV0Y2giLHttc2c6IkhUVFAgIitzLnN0YXR1cyx1cmw6ZX0pLCJmdW5jdGlvbiI9PXR5cGVvZiBvJiZvKG51bGwpfSxzLnNlbmQociksc31jYXRjaCh0KXtyZXR1cm4gYUdUTS5mLmxvZygiZV94ZmV0Y2giLHttc2c6dC5tZXNzYWdlLHVybDplfSksImZ1bmN0aW9uIj09dHlwZW9mIG8mJm8obnVsbCksbnVsbH19LGFHVE0uZi5zZXNzaW9uX2ZldGNoPWZ1bmN0aW9uKCl7aWYoIWFHVE0uYy51c2VyX2lkfHwhYUdUTS5jLnNlc3Npb25fdXJsKXJldHVybiBhR1RNLmQuc2Vzc2lvbl9yZWFkeT0hMCx2b2lkKGFHVE0uZC5zZXNzaW9uX3N0YXR1cz0iaW5hY3RpdmUiKTt2YXIgZT0ibnVtYmVyIj09dHlwZW9mIGFHVE0uYy5zZXNzaW9uX3RpbWVvdXQmJmFHVE0uYy5zZXNzaW9uX3RpbWVvdXQ+MD9hR1RNLmMuc2Vzc2lvbl90aW1lb3V0OjVlMyx0PSExLGE9bnVsbCxuPW51bGwsbz17dXNlcl9pZDphR1RNLmMudXNlcl9pZCx1cmw6YUdUTS5mLmdldFZhbCgibCIsImhyZWYiKXx8IiIscmVmOmRvY3VtZW50LnJlZmVycmVyfHwiIn0scj0ibnVtYmVyIj09dHlwZW9mIGFHVE0uYy5zZXNzaW9uX3NhbHQmJmFHVE0uYy5zZXNzaW9uX3NhbHQ+PTE/YUdUTS5jLnNlc3Npb25fc2FsdDowO2E9YUdUTS5mLnhmZXRjaChhR1RNLmMuc2Vzc2lvbl91cmwsbyxyPj0xLHIsZnVuY3Rpb24oZSl7aWYoIXQpe2lmKHQ9ITAsY2xlYXJUaW1lb3V0KG4pLCFlfHwib2JqZWN0IiE9dHlwZW9mIGV8fCJzdHJpbmciIT10eXBlb2YgZS5zaWR8fCFlLnNpZClyZXR1cm4gYUdUTS5mLmxvZygibV9zZXNzaW9uX2ludmFsaWQiLGUpLGFHVE0uZC5zZXNzaW9uX3JlYWR5PSEwLGFHVE0uZC5zZXNzaW9uX3N0YXR1cz1udWxsPT09ZT8iZXJyb3IiOiJpbnZhbGlkIix2b2lkKGFHVE0uYy5zZXNzaW9uX3dhaXQmJiFhR1RNLmQuaW5pdCYmYUdUTS5mLmluamVjdCgpKTthR1RNLmQuc2Vzc2lvbj1lLGFHVE0uZC5zZXNzaW9uX3JlYWR5PSEwLGFHVE0uZC5zZXNzaW9uX3N0YXR1cz0ib2siLGFHVE0uZi5sb2coIm1fc2Vzc2lvbl9vayIsZSksITA9PT1lLnJldCYmITE9PT1lLmNzdCYmKGFHVE0uZC5jb25zZW50PWFHVE0uZC5jb25zZW50fHx7fSxhR1RNLmQuY29uc2VudC5oYXNSZXNwb25zZXx8KGFHVE0uZC5jb25zZW50Lmhhc1Jlc3BvbnNlPSEwLGFHVE0uZC5jb25zZW50LmZlZWRiYWNrPSJDb25zZW50IGRlbmllZCBieSBhR1RNIixhR1RNLmQuY29uc2VudC5zZXJ2aWNlcz0iLGFHVE1jb25zZW50LCIsYUdUTS5kLmNvbnNlbnQuYmxvY2tlZD0hMD09PWFHVE0uYy5zZXNzaW9uX2d0bV9vbl9kZW55LGFHVE0uZC5jb25zZW50Lmd0bUNvbnNlbnQ9YUdUTS5kLmNvbnNlbnQuYmxvY2tlZCkpLGFHVE0uYy5zZXNzaW9uX3dhaXQmJiFhR1RNLmQuaW5pdCYmYUdUTS5mLmluamVjdCgpfX0pLG49c2V0VGltZW91dChmdW5jdGlvbigpe2lmKCF0KXtpZih0PSEwLGEpdHJ5e2EuYWJvcnQoKX1jYXRjaChlKXt9YUdUTS5mLmxvZygibV9zZXNzaW9uX3RpbWVvdXQiLG51bGwpLGFHVE0uZC5zZXNzaW9uX3JlYWR5PSEwLGFHVE0uZC5zZXNzaW9uX3N0YXR1cz0idGltZW91dCIsYUdUTS5jLnNlc3Npb25fd2FpdCYmIWFHVE0uZC5pbml0JiZhR1RNLmYuaW5qZWN0KCl9fSxlKX0sYUdUTS5mLnNlbmRuYXVzPWZ1bmN0aW9uKGUpe2lmKGUmJiJvYmplY3QiPT10eXBlb2YgZSl7dmFyIHQ9d2luZG93W2FHVE0uYy5nZGxdLnB1c2g7IWFHVE0uZC5vcmlnaW5hbERMcHVzaCYmL3NhbmRib3gvaS50ZXN0KHQudG9TdHJpbmcoKSkmJihhR1RNLmQub3JpZ2luYWxETHB1c2g9dCk7dmFyIGE9ITE7aWYoYUdUTS5jLmRsT3JnUHVzaCYmYUdUTS5kLm9yaWdpbmFsRExwdXNoJiZhR1RNLmQub3JpZ2luYWxETHB1c2ghPT10KXt2YXIgbj10LnRvU3RyaW5nKCk7L3NhbmRib3gvaS50ZXN0KG4pP2FHVE0uZC5vcmlnaW5hbERMcHVzaD10OihhPSEwLGFHVE0uZC5kbEhvb2tMb2dnZWR8fChhR1RNLmQub3JpZ2luYWxETHB1c2goe2V2ZW50OiJleGNlcHRpb24iLGVycnR5cGU6IkRMIEVycm9yIixlcnJtc2c6IkZ1bmN0aW9uIGRhdGFMYXllci5wdXNoIGhvb2tlZCAtIG5vIGxvbmdlciBmcm9tIEdUTSIsZmN0X2hvb2s6bixmY3Rfb3JpZzphR1RNLmQub3JpZ2luYWxETHB1c2gudG9TdHJpbmcoKSx0aW1lc3RhbXA6KG5ldyBEYXRlKS5nZXRUaW1lKCksZXZlbnRNb2RlbDpudWxsfSksYUdUTS5kLmRsSG9va0xvZ2dlZD0hMCksInJlc3RvcmUiPT09YUdUTS5jLmRsT3JnUHVzaCYmKHdpbmRvd1thR1RNLmMuZ2RsXS5wdXNoPWFHVE0uZC5vcmlnaW5hbERMcHVzaCxhPSExKSl9YSYmInVzZSI9PT1hR1RNLmMuZGxPcmdQdXNoP2FHVE0uZC5vcmlnaW5hbERMcHVzaChlKTp3aW5kb3dbYUdUTS5jLmdkbF0ucHVzaChlKSwiZnVuY3Rpb24iPT10eXBlb2YgYUdUTS5mLnNlbmRuYXVzX2NhbGxiYWNrJiZhR1RNLmYuc2VuZG5hdXNfY2FsbGJhY2soZSksYUdUTS5mLmxvZygibTkiLGUpfX0sYUdUTS5mLmZpcmU9ZnVuY3Rpb24oZSl7aWYoIm9iamVjdCI9PXR5cGVvZiBlJiZlKXt0cnl7aWYoIShhPUpTT04ucGFyc2UoYUdUTS5mLnNTdHJmKGUpKSkpcmV0dXJuIHZvaWQgYUdUTS5mLmxvZygiZTE1IixhKX1jYXRjaChuKXt2YXIgdD0iYUdUTSBGaXJlIEVycm9yIChKU09OLnBhcnNlKSI7InN0cmluZyI9PXR5cGVvZiBlLmV2ZW50JiYodD10KyIgKEV2ZW50OiAiK2UuZXZlbnQrIikiKTt2YXIgYT17ZXZlbnQ6ImV4Y2VwdGlvbiIsZXJybXNnOm4ubWVzc2FnZSxlcnJ0eXBlOnQsdGltZXN0YW1wOihuZXcgRGF0ZSkuZ2V0VGltZSgpLGVycmN0OmFHVE0uZC5lcnJvcl9jb3VudGVyfHwxLGV2ZW50TW9kZWw6bnVsbH07YUdUTS5mLmxvZygiZTE1IixhKX1pZighKCJudW1iZXIiPT10eXBlb2YgYS5hR1RNdHN8fCJvYmplY3QiPT10eXBlb2YgYS5ldmVudE1vZGVsJiZhLmV2ZW50TW9kZWx8fCJzdHJpbmciIT10eXBlb2YgYS5ldmVudCYmInN0cmluZyI9PXR5cGVvZiBhLnR5cGUmJiJvYmplY3QiPT10eXBlb2YgYS5mbGFncyYmImJvb2xlYW4iPT10eXBlb2YgYS5mbGFncy5lbmFibGVVbnRhZ2dlZFBhZ2VSZXBvcnRpbmcmJmEuZmxhZ3MuZW5hYmxlVW50YWdnZWRQYWdlUmVwb3J0aW5nKSl7aWYoYS5hR1RNdHM9RGF0ZS5ub3coKSxhLmV2ZW50TW9kZWw9bnVsbCxhR1RNLmMuY29uc2VudF9ldmVudHMmJiJzdHJpbmciPT10eXBlb2YgYS5ldmVudCYmKCIsIithR1RNLmMuY29uc2VudF9ldmVudHMrIiwiKS5pbmRleE9mKCIsIithLmV2ZW50KyIsIik+PTApaWYoIm9iamVjdCI9PXR5cGVvZiBhR1RNLmMuY29uc2VudF9ldmVudF9hdHRyW2EuZXZlbnRdKWZvcih2YXIgbiBpbiBhR1RNLmMuY29uc2VudF9ldmVudF9hdHRyW2EuZXZlbnRdKXZvaWQgMCE9PWFbbl0mJihhR1RNLmMuY29uc2VudF9ldmVudF9hdHRyW2EuZXZlbnRdW25dJiZhW25dIT1hR1RNLmMuY29uc2VudF9ldmVudF9hdHRyW2EuZXZlbnRdW25dfHxhR1RNLmYucnVuX2NjKCJ1cGRhdGUiKSk7ZWxzZSBhR1RNLmYucnVuX2NjKCJ1cGRhdGUiKTtpZihhR1RNLmMuZGxTZXQmJiJvYmplY3QiPT10eXBlb2YgZ29vZ2xlX3RhZ19tYW5hZ2VyJiYib2JqZWN0Ij09dHlwZW9mIGdvb2dsZV90YWdfbWFuYWdlclthR1RNLmMuZ3RtSURdJiZPYmplY3Qua2V5cyhhR1RNLmMuZGxTZXQpLmZvckVhY2goZnVuY3Rpb24oZSl7dmFyIHQ9YUdUTS5jLmRsU2V0W2VdLG49Z29vZ2xlX3RhZ19tYW5hZ2VyW2FHVE0uYy5ndG1JRF1bYUdUTS5jLmdkbF0uZ2V0KHQpO3ZvaWQgMCE9PW4mJihhW2VdPW4pfSksKCJvYmplY3QiIT10eXBlb2YgYUdUTS5kLmNvbnNlbnR8fCFhR1RNLmQuY29uc2VudC5oYXNSZXNwb25zZXx8IWFHVE0uZC5jb25zZW50Lmd0bUNvbnNlbnQpJiYoInN0cmluZyIhPXR5cGVvZiBhLmV2ZW50fHwwIT09YS5ldmVudC5pbmRleE9mKCJhR1RNIikpJiYhYS5fbm9Db25zZW50fHxhR1RNLmMuaWZyYW1lU3VwcG9ydCYmYUdUTS5kLmlzX2lmcmFtZSYmIWFHVE0uZC5pZnJhbWUub3JpZ2luKXJldHVybiBkZWxldGUgYS5hR1RNdHMsZGVsZXRlIGEuZXZlbnRNb2RlbCx2b2lkIGFHVE0uZC5mLnB1c2goSlNPTi5wYXJzZShhR1RNLmYuc1N0cmYoYSkpKTtpZihhLl9wb3N0JiYhYS5fcG9zdF9zZW50KXt2YXIgbz0ib2JqZWN0Ij09dHlwZW9mIGEuX3Bvc3Q/YS5fcG9zdDp7fSxyPSJzdHJpbmciPT10eXBlb2Ygby51cmwmJm8udXJsP28udXJsOmFHVE0uYy50cmFuc3BvcnRfdXJsO2lmKHIpe3ZhciBzPSJib29sZWFuIj09dHlwZW9mIG8uZW5jP28uZW5jOiEhYUdUTS5jLnRyYW5zcG9ydF9lbmMsaT0ibnVtYmVyIj09dHlwZW9mIG8uc2FsdCYmby5zYWx0Pj0xP28uc2FsdDoibnVtYmVyIj09dHlwZW9mIGFHVE0uYy50cmFuc3BvcnRfc2FsdCYmYUdUTS5jLnRyYW5zcG9ydF9zYWx0Pj0xP2FHVE0uYy50cmFuc3BvcnRfc2FsdDphR1RNLmMuc2Vzc2lvbl9zYWx0fHwwLGM9SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYoYSkpO2RlbGV0ZSBjLl9wb3N0LGRlbGV0ZSBjLl9wb3N0X3NlbnQsZGVsZXRlIGMuZXZlbnRNb2RlbCxvLmNvbnNlbnQmJiJvYmplY3QiPT10eXBlb2YgYUdUTS5kLmNvbnNlbnQmJihjLmNvbnNlbnQ9SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYoYUdUTS5kLmNvbnNlbnQpKSksYUdUTS5mLnhzZW5kKHIsYyxzLGkpLGEuX3Bvc3Rfc2VudD0hMH19KGFHVE0uZC5jb25zZW50Lmd0bUNvbnNlbnR8fCJzdHJpbmciPT10eXBlb2YgYS5ldmVudCYmMD09PWEuZXZlbnQuaW5kZXhPZigiYUdUTSIpfHxhLl9ub0NvbnNlbnQpJiYoInN0cmluZyI9PXR5cGVvZiBhLmV2ZW50JiYwPT09YS5ldmVudC5pbmRleE9mKCJhR1RNIil8fChkZWxldGUgYVsiZ3RtLnVuaXF1ZUV2ZW50SWQiXSxkZWxldGUgYS5hR1RNcGFyYW1zLGEuYUdUTXBhcmFtcz1KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihhKSkpLGFHVE0uZC5kbC5wdXNoKGEpLGEuX25vRExQdXNoPyJmdW5jdGlvbiI9PXR5cGVvZiBhR1RNLmYuc2VuZG5hdXNfY2FsbGJhY2smJmFHVE0uZi5zZW5kbmF1c19jYWxsYmFjayhhKTphR1RNLmMuaWZyYW1lU3VwcG9ydCYmYUdUTS5kLmlzX2lmcmFtZSYmInN0cmluZyI9PXR5cGVvZiBhLmV2ZW50P2FHVE0uZi5pRnJhbWVGaXJlKGEpOmFHVE0uZi5zZW5kbmF1cyhhKSksImZ1bmN0aW9uIj09dHlwZW9mIGFHVE0uZi5maXJlX2NhbGxiYWNrJiZhR1RNLmYuZmlyZV9jYWxsYmFjayhhKSxhR1RNLmYubG9nKCJtNyIsYSl9fWVsc2UgYUdUTS5mLmxvZygiZTkiLHtvOnR5cGVvZiBlfSl9Ow==');
  const origin = getRequestHeader('origin') || '';
  const jsCode = agtm + cmp + config + 'aGTM.f.init();';

  setResponseStatus(200);
  if (origin) {
    setResponseHeader('Access-Control-Allow-Origin', origin);
    setResponseHeader('Access-Control-Allow-Credentials', 'true');
  }
  setResponseHeader('Content-Type', 'application/javascript');
  setResponseBody(jsCode);
  returnResponse();
};
