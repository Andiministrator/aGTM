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
  cookieName: data.cookie_name || '_tpf',
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
const hasRequiredConsent = function(services, purposes, vendors) {
  if (!CFG.consentService && !CFG.consentPurpose && !CFG.consentVendor) return true;
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
        } else if (!granted && data.cookie_delete) {
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
// `ga4,,meta`, and chelp() then requires an EMPTY token: it searches for ",,"
// in the granted string, which no consent string contains. The gate would be
// shut for 100% of visitors on a site where the same configuration worked
// before the join existed, i.e. this fix would have caused a total measurement
// outage on the next template re-import. A blank-only cell ('   ') is the same
// failure with no trailing comma needed, and it passed the old truthiness
// guard untouched.
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
  // and none of them should reach the browser: an empty token closes the gate
  // for everybody, and a repetition would make the line below claim a
  // tightening that did not happen.
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
  if (botCheckEnabled && CFG.botCheckExpose && botState.verdict && typeof botState.verdict.isBot === 'boolean') c.bot = botState.verdict;
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
  const storeUrlBuilder = CFG.consentStoreEnabled ? '(function(c){var s=document.currentScript;if(s&&s.src){var i=s.src.lastIndexOf("/aGTM.js");if(i>=0)c.consent_store_url=s.src.substring(0,i)+"' + CONSENT_STORE_PATH + '";}return c;})' : '(function(c){return c;})';
  const config = 'aGTM.f.config(' + storeUrlBuilder + '(' + JSON.stringify(c) + '));';
  logToConsole('info', '\u2713 aGTM Config built', {uid: sessionData && sessionData.uid, sid: sessionData && sessionData.sid, ret: sessionData && sessionData.ret});

  // aGTM base64 payload (updated by build.sh)
  const agtm = fromBase64('d2luZG93LmFHVE09d2luZG93LmFHVE18fHt9LHdpbmRvdy5hR1RNLmM9d2luZG93LmFHVE0uY3x8e30sd2luZG93LmFHVE0uZD13aW5kb3cuYUdUTS5kfHx7fSx3aW5kb3cuYUdUTS5mPXdpbmRvdy5hR1RNLmZ8fHt9LHdpbmRvdy5hR1RNLmw9d2luZG93LmFHVE0ubHx8W10sd2luZG93LmFHVE0ubj13aW5kb3cuYUdUTS5ufHx7fSxhR1RNLmYucHJvcHNldD1mdW5jdGlvbihlLHQsYSl7dHJ5e2VbdF09ZVt0XXx8YX1jYXRjaChlKXt9fSxhR1RNLmYub2JqaW5pdD1mdW5jdGlvbigpe1tbYUdUTS5kLCJ2ZXJzaW9uIiwiMS41Il0sW2FHVE0uZCwiZiIsW11dLFthR1RNLmQsImNvbmZpZyIsITFdLFthR1RNLmQsImluaXQiLCExXSxbYUdUTS5kLCJkb21fcmVhZHkiLCExXSxbYUdUTS5kLCJwYWdlX3JlYWR5IiwhMV0sW2FHVE0uZCwiaXNfaWZyYW1lIix3aW5kb3cuc2VsZiE9PXdpbmRvdy50b3BdLFthR1RNLmQsImV2X2ZjdF9jdHIiLDBdLFthR1RNLmQsInRpbWVyIix7fV0sW2FHVE0uZCwiZXJyb3JfY291bnRlciIsMF0sW2FHVE0uZCwiZXJyb3JzIixbXV0sW2FHVE0uZCwiZGwiLFtdXSxbYUdUTS5kLCJzZXNzaW9uIix7fV0sW2FHVE0uZCwic2Vzc2lvbl9zdGF0dXMiLCIiXSxbYUdUTS5kLCJib3QiLHt9XSxbYUdUTS5kLCJjb25zZW50X2hhc2giLCIiXSxbYUdUTS5kLCJsYXN0X2NvbnNlbnRfaGFzaCIsIiJdLFthR1RNLmQsImF0dHJpYnV0aW9uIix7fV0sW2FHVE0uZCwiaWZyYW1lIix7Y291bnRlcjp7ZXZlbnRzOjB9LG9yaWdpbjoiIixpZkxpc3RlbjohMSx0b3BMaXN0ZW46ITEsaGFuZHNoYWtlOiExLHRpbWVyOm51bGx9XSxbYUdUTS5kLCJsYXN0X3VybCIsbG9jYXRpb24uaHJlZl0sW2FHVE0uZCwidXJsTGlzdGVuZXJfYWN0aXZlIiwhMV0sW2FHVE0uZCwicGFzc2l2ZV9zdXBwb3J0ZWQiLG51bGxdLFthR1RNLmYsInRsIix7fV0sW2FHVE0uZiwiZGwiLHt9XSxbYUdUTS5mLCJwbCIse31dLFthR1RNLCJsIixbXV0sW2FHVE0ubiwiY2siLCJjb29raWUiXSxbYUdUTS5uLCJ0bSIsImdvb2dsZXRhZ21hbmFnZXIiXSxbYUdUTS5uLCJ0YSIsInRhZ2Fzc2lzdGFudC5nb29nbGUiXV0uZm9yRWFjaChmdW5jdGlvbihlKXthR1RNLmYucHJvcHNldChlWzBdLGVbMV0sZVsyXSl9KX0sYUdUTS5mLm9iamluaXQoKSxhR1RNLmYubG9nPWZ1bmN0aW9uKGUsdCl7dmFyIGE9Im9iamVjdCI9PXR5cGVvZiB0JiZ0P0pTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkodCkpOnQ7YUdUTS5sLnB1c2goe2lkOmUsdGltZXN0YW1wOihuZXcgRGF0ZSkuZ2V0VGltZSgpLG9iajphfSl9LGFHVE0uZi5zdHJjbGVhbj1mdW5jdGlvbihlKXtyZXR1cm4gdm9pZCAwPT09ZXx8Im9iamVjdCI9PXR5cGVvZiBlJiYhZT8iIjooInN0cmluZyIhPXR5cGVvZiBlJiYoZT1lLnRvU3RyaW5nKCkpLGUucmVwbGFjZSgvW15hLXrDpMO2w7zDn0EtWsOEw5bDnDAtOV8tXS9nLCIiKSl9LGFHVE0uZi5zU3RyZj1mdW5jdGlvbihlKXtpZigib2JqZWN0IiE9dHlwZW9mIGV8fCFlKXt2YXIgdD1KU09OLnN0cmluZ2lmeSh7ZXZlbnQ6ImV4Y2VwdGlvbiIsZXJybXNnOiJEYXRhTGF5ZXIgRW50cnkgaXMgbm8gb2JqZWN0IixlcnJ0eXBlOiJETCBFcnJvciIsb2JqX3R5cGU6dHlwZW9mIGUsb2JqX3ZhbHVlOmV9KTtyZXR1cm4gYUdUTS5mLmxvZygiZTE2IixKU09OLnBhcnNlKHQpKSxKU09OLnN0cmluZ2lmeShudWxsKX12YXIgYT1bXTtyZXR1cm4gSlNPTi5zdHJpbmdpZnkoZSxmdW5jdGlvbihlLHQpe2lmKCJvYmplY3QiPT10eXBlb2YgdCYmbnVsbCE9PXQpe2lmKC0xIT09YS5pbmRleE9mKHQpKXJldHVybiJbQ2lyY3VsYXJdIjthLnB1c2godCl9cmV0dXJuIHR9KX0sYUdUTS5mLmFuPWZ1bmN0aW9uKGUsdCxhLG4pe2VbdF09YS5oYXNPd25Qcm9wZXJ0eSh0KT9hW3RdOm59LGFHVE0uZi5jb25zZW50X3NlcmlhbGl6ZT1mdW5jdGlvbihlKXtpZighZXx8Im9iamVjdCIhPXR5cGVvZiBlKXJldHVybiIiO3ZhciB0PXtndG1Db25zZW50OjEsYmxvY2tlZDoxfSxhPVtdO2Zvcih2YXIgbiBpbiBlKWUuaGFzT3duUHJvcGVydHkobikmJiF0W25dJiZhLnB1c2gobik7YS5zb3J0KCk7Zm9yKHZhciBvPVtdLHI9MDtyPGEubGVuZ3RoO3IrKyl7dmFyIHM9YVtyXSxpPWVbc107IiIhPT1pJiZudWxsIT1pJiZvLnB1c2gocysiPSIrKCJvYmplY3QiPT10eXBlb2YgaT9KU09OLnN0cmluZ2lmeShpKTpTdHJpbmcoaSkpKX1yZXR1cm4gby5qb2luKCJ8Iil9LGFHVE0uZi5wYXJzZVVybFBhcmFtcz1mdW5jdGlvbihlKXt2YXIgdD17fTtpZighZXx8Ij8iIT09ZS5jaGFyQXQoMCkpcmV0dXJuIHQ7Zm9yKHZhciBhPWUuc3Vic3RyaW5nKDEpLnNwbGl0KCImIiksbj0wO248YS5sZW5ndGg7bisrKXt2YXIgbz1hW25dLnNwbGl0KCI9Iik7aWYob1swXSl7dmFyIHIsczt0cnl7cj1kZWNvZGVVUklDb21wb25lbnQob1swXSl9Y2F0Y2goZSl7cj1vWzBdfWlmKG9bMV0pe3ZhciBpPW9bMV0ucmVwbGFjZSgvXCsvZywiICIpO3RyeXtzPWRlY29kZVVSSUNvbXBvbmVudChpKX1jYXRjaChlKXtzPWl9fWVsc2Ugcz0iIjt0W3JdPXN9fXJldHVybiB0fSxhR1RNLmYucmVzb2x2ZUF0dHJpYnV0aW9uPWZ1bmN0aW9uKGUpe3ZhciB0PWFHVE0uZi5wYXJzZVVybFBhcmFtcyh3aW5kb3cubG9jYXRpb24uc2VhcmNoKSxhPShhR1RNLmQuc2Vzc2lvbiYmYUdUTS5kLnNlc3Npb24uYXR0cmlidXRpb258fHt9KVtlXTthJiYib2JqZWN0Ij09dHlwZW9mIGF8fChhPXt9KTtmb3IodmFyIG49WyJnY2xpZCIsImZiY2xpZCIsIm1zY2xraWQiLCJ0dGNsaWQiLCJnYnJhaWQiLCJ3YnJhaWQiXSxvPSIiLHI9IiIscz0wO3M8bi5sZW5ndGg7cysrKXt2YXIgaT1uW3NdO2lmKHRbaV0pe289aSxyPXRbaV07YnJlYWt9fXJldHVybntzb3U6dC51dG1fc291cmNlfHxhLnNvdXx8IiIsY2FtOnQudXRtX2NhbXBhaWdufHxhLmNhbXx8IiIsbWVkOnQudXRtX21lZGl1bXx8YS5tZWR8fCIiLGNhbWlkOnQudXRtX2lkfHxhLmNhbWlkfHwiIixjbGk6cnx8YS5jbGl8fCIiLGNscDpvfHxhLmNscHx8IiIsY2xzOm8mJntnY2xpZDoiR29vZ2xlIEFkcyIsZmJjbGlkOiJNZXRhIixtc2Nsa2lkOiJNaWNyb3NvZnQgQWRzIix0dGNsaWQ6IlRpa1RvayBBZHMiLGdicmFpZDoiR29vZ2xlIEFkcyIsd2JyYWlkOiJHb29nbGUgQWRzIn1bb118fGEuY2xzfHwiIixhZnM6YS5hZnN8fCIiLHNyZTpkb2N1bWVudC5yZWZlcnJlcnx8YS5zcmV8fCIiLGxjczphLmxjc3x8IiIsZnNzOmEuZnNzfHwiIn19LGFHVE0uZi5jb25maWc9ZnVuY3Rpb24oZSl7aWYoYUdUTS5kLmNvbmZpZykiZnVuY3Rpb24iPT10eXBlb2YgYUdUTS5mLmxvZyYmYUdUTS5mLmxvZygiZTEiLGFHVE0uYyk7ZWxzZXtpZihhR1RNLmYuYW4oYUdUTS5jLCJkZWJ1ZyIsZSwhMSksYUdUTS5mLmFuKGFHVE0uYywicGF0aCIsZSwiIiksYUdUTS5mLmFuKGFHVE0uYywiZmlsZSIsZSwiYUdUTS5qcyIpLGFHVE0uZi5hbihhR1RNLmMsImNtcCIsZSwiIiksYUdUTS5jLm1pbj0iYm9vbGVhbiIhPXR5cGVvZiBlLm1pbnx8ZS5taW4sYUdUTS5mLmFuKGFHVE0uYywibm9uY2UiLGUsIiIpLGFHVE0uZi5hbihhR1RNLmMsImlmcmFtZVN1cHBvcnQiLGUsITEpLGFHVE0uZi5hbihhR1RNLmMsInZQYWdldmlld3MiLGUsITEpLGFHVE0uZi5hbihhR1RNLmMsInZQYWdldmlld3NUaW1lciIsZSwwKSxhR1RNLmYuYW4oYUdUTS5jLCJ2UGFnZXZpZXdzRmFsbGJhY2siLGUsITEpLGFHVE0uZi5hbihhR1RNLmMsImd0bUlEIixlLCIiKSxlLmd0bSlmb3IodmFyIHQgaW4gZS5ndG0pZS5ndG0uaGFzT3duUHJvcGVydHkodCkmJihhR1RNLmMuZ3RtSUQ9YUdUTS5jLmd0bUlEfHx0LGFHVE0uYy5ndG09YUdUTS5jLmd0bXx8e30sYUdUTS5jLmd0bVt0XT1lLmd0bVt0XXx8e30sYUdUTS5mLmFuKGFHVE0uYy5ndG1bdF0sIm5vQ29uc2VudCIsZS5ndG1bdF0sITEpLGFHVE0uZi5hbihhR1RNLmMuZ3RtW3RdLCJlbnYiLGUuZ3RtW3RdLCIiKSxhR1RNLmYuYW4oYUdUTS5jLmd0bVt0XSwiaWRQYXJhbSIsZS5ndG1bdF0sIiIpLGFHVE0uZi5hbihhR1RNLmMuZ3RtW3RdLCJndG1VUkwiLGUuZ3RtW3RdLCIiKSxhR1RNLmYuYW4oYUdUTS5jLmd0bVt0XSwiZ3RtSlMiLGUuZ3RtW3RdLCIiKSk7aWYoYUdUTS5mLmFuKGFHVE0uYywiZ2RsIixlLCJkYXRhTGF5ZXIiKSxhR1RNLmYuYW4oYUdUTS5jLCJndG1QdXJwb3NlcyIsZSwiIiksYUdUTS5mLmFuKGFHVE0uYywiZ3RtU2VydmljZXMiLGUsIiIpLGFHVE0uZi5hbihhR1RNLmMsImd0bVZlbmRvcnMiLGUsIiIpLGFHVE0uZi5hbihhR1RNLmMsImFsbG93RW1wdHlDb25zZW50Q29uZGl0aW9ucyIsZSwhMSksYUdUTS5mLmFuKGFHVE0uYywiZ3RtQXR0ciIsZSxudWxsKSxhR1RNLmYuYW4oYUdUTS5jLCJkbFNldCIsZSx7fSksYUdUTS5mLmFuKGFHVE0uYywidXNlTGlzdGVuZXIiLGUsITEpLGFHVE0uZi5hbihhR1RNLmMsImRsT3JnUHVzaCIsZSwiIiksYUdUTS5jLmRsU3RhdGVFdmVudHM9ImJvb2xlYW4iPT10eXBlb2YgZS5kbFN0YXRlRXZlbnRzJiZlLmRsU3RhdGVFdmVudHMsYUdUTS5jLmFQYWdldmlldz0iYm9vbGVhbiI9PXR5cGVvZiBlLmFQYWdldmlldyYmZS5hUGFnZXZpZXcsYUdUTS5jLnZQYWdldmlldz0iYm9vbGVhbiI9PXR5cGVvZiBlLnZQYWdldmlldyYmZS52UGFnZXZpZXcsYUdUTS5jLnNlbmRDb25zZW50RXZlbnQ9ImJvb2xlYW4iPT10eXBlb2YgZS5zZW5kQ29uc2VudEV2ZW50JiZlLnNlbmRDb25zZW50RXZlbnQsYUdUTS5mLmFuKGFHVE0uYywiY29uc2VudF9ldmVudHMiLGUsIiIpLGFHVE0uYy5jb25zZW50X2V2ZW50X2F0dHI9YUdUTS5jLmNvbnNlbnRfZXZlbnRfYXR0cnx8e30sInN0cmluZyI9PXR5cGVvZiBhR1RNLmMuY29uc2VudF9ldmVudHMmJmFHVE0uYy5jb25zZW50X2V2ZW50cyl7Zm9yKHZhciBhPWFHVE0uYy5jb25zZW50X2V2ZW50cy5zcGxpdCgiLCIpLG49W10sbz0wO288YS5sZW5ndGg7bysrKXt2YXIgcj1hW29dLnJlcGxhY2UoL15ccyt8XHMrJC9nLCIiKTtpZihyKXt2YXIgcz1yLmluZGV4T2YoIlsiKTtpZihzPj0wKXt2YXIgaT1yLnN1YnN0cmluZygwLHMpLGM9ci5zdWJzdHJpbmcocysxLHIuaW5kZXhPZigiXSIpKSxmPWMuaW5kZXhPZigiOiIpLFQ9e307Zj49MD9UW2Muc3Vic3RyaW5nKDAsZildPWMuc3Vic3RyaW5nKGYrMSk6VFtjXT0iIixhR1RNLmMuY29uc2VudF9ldmVudF9hdHRyW2ldPVQsbi5wdXNoKGkpfWVsc2Ugbi5wdXNoKHIpfX1hR1RNLmMuY29uc2VudF9ldmVudHM9bi5qb2luKCIsIil9aWYoYUdUTS5mLmFuKGFHVE0uYywidHJhbnNwb3J0X3VybCIsZSwiIiksYUdUTS5mLmFuKGFHVE0uYywidHJhbnNwb3J0X2VuYyIsZSwhMSksYUdUTS5mLmFuKGFHVE0uYywidHJhbnNwb3J0X3NhbHQiLGUsMCksYUdUTS5mLmFuKGFHVE0uYywidXNlcl9pZCIsZSwiIiksYUdUTS5mLmFuKGFHVE0uYywic2Vzc2lvbl9zYWx0IixlLDApLGFHVE0uZi5hbihhR1RNLmMsImNvbnNlbnRfc3RvcmVfdXJsIixlLCIiKSxhR1RNLmYuYW4oYUdUTS5jLCJjb25zZW50X3N0b3JlX2VuYyIsZSwhMSksYUdUTS5mLmFuKGFHVE0uYywiY29uc2VudF9wb2xsX21zIixlLDJlMyksZS5zZXNzaW9uJiYib2JqZWN0Ij09dHlwZW9mIGUuc2Vzc2lvbiYmKGUuc2Vzc2lvbi5zaWR8fGUuc2Vzc2lvbi5jb25zZW50fHxlLnNlc3Npb24uYXR0cmlidXRpb258fGUuc2Vzc2lvbi5zb3VyY2UpKXthR1RNLmQuc2Vzc2lvbj1KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihlLnNlc3Npb24pKTt2YXIgTT1lLnNlc3Npb24uY29uc2VudDtNJiYib2JqZWN0Ij09dHlwZW9mIE0mJiEwPT09TS5oYXNSZXNwb25zZSYmInN0cmluZyI9PXR5cGVvZiBNLnNlcnZpY2VzPyhhR1RNLmQuY29uc2VudD1KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihNKSksYUdUTS5kLmNvbnNlbnRfaGFzaD1hR1RNLmYuY29uc2VudF9zZXJpYWxpemUoYUdUTS5kLmNvbnNlbnQpLGFHVE0uZC5sYXN0X2NvbnNlbnRfaGFzaD1hR1RNLmQuY29uc2VudF9oYXNoLGFHVE0uZC5zZXNzaW9uX3N0YXR1cz0icHJlc2V0X3dpdGhfY29uc2VudCIsYUdUTS5mLmxvZygibV9zZXNzaW9uX3ByZXNldF9jb25zZW50IixNKSk6KGFHVE0uZC5zZXNzaW9uX3N0YXR1cz0icHJlc2V0IixhR1RNLmYubG9nKCJtX3Nlc3Npb25fcHJlc2V0IixlLnNlc3Npb24pKX1pZihlLmJvdCYmIm9iamVjdCI9PXR5cGVvZiBlLmJvdCYmImJvb2xlYW4iPT10eXBlb2YgZS5ib3QuaXNCb3QmJihhR1RNLmQuYm90PUpTT04ucGFyc2UoYUdUTS5mLnNTdHJmKGUuYm90KSksYUdUTS5mLmxvZygibV9ib3RfcHJlc2V0IixhR1RNLmQuYm90KSksZS5jb25zZW50PWUuY29uc2VudHx8e30sYUdUTS5jLmNvbnNlbnQ9YUdUTS5jLmNvbnNlbnR8fGUuY29uc2VudCxhR1RNLmYuYW4oYUdUTS5jLmNvbnNlbnQsImhhc1Jlc3BvbnNlIixlLmNvbnNlbnQsITEpLGFHVE0uZi5hbihhR1RNLmMuY29uc2VudCwiZmVlZGJhY2siLGUuY29uc2VudCwiIiksYUdUTS5mLmFuKGFHVE0uYy5jb25zZW50LCJwdXJwb3NlcyIsZS5jb25zZW50LCIiKSxhR1RNLmYuYW4oYUdUTS5jLmNvbnNlbnQsInNlcnZpY2VzIixlLmNvbnNlbnQsIiIpLGFHVE0uZi5hbihhR1RNLmMuY29uc2VudCwidmVuZG9ycyIsZS5jb25zZW50LCIiKSxhR1RNLmYuYW4oYUdUTS5jLmNvbnNlbnQsImNvbnNlbnRfaWQiLGUuY29uc2VudCwiIiksd2luZG93W2FHVE0uYy5nZGxdPXdpbmRvd1thR1RNLmMuZ2RsXXx8W10sYUdUTS5kLmNvbnNlbnQ9YUdUTS5kLmNvbnNlbnR8fEpTT04ucGFyc2UoYUdUTS5mLnNTdHJmKGFHVE0uYy5jb25zZW50KSksImJvb2xlYW4iIT10eXBlb2YgYUdUTS5kLmNvbnNlbnQuZ3RtQ29uc2VudCYmKGFHVE0uZC5jb25zZW50Lmd0bUNvbnNlbnQ9ITEpLGFHVE0uZC5jb25maWc9ITAsYUdUTS5kLmd0bUxvYWRlZD1bXSxhR1RNLmQuc2Vzc2lvbiYmYUdUTS5kLnNlc3Npb24uYXR0cmlidXRpb24mJiJvYmplY3QiPT10eXBlb2YgYUdUTS5kLnNlc3Npb24uYXR0cmlidXRpb24pZm9yKHZhciBkIGluIGFHVE0uZC5zZXNzaW9uLmF0dHJpYnV0aW9uKWFHVE0uZC5zZXNzaW9uLmF0dHJpYnV0aW9uLmhhc093blByb3BlcnR5KGQpJiYoYUdUTS5kLmF0dHJpYnV0aW9uW2RdPWFHVE0uZi5yZXNvbHZlQXR0cmlidXRpb24oZCkpOyJmdW5jdGlvbiI9PXR5cGVvZiBhR1RNLmYubG9nJiZhR1RNLmYubG9nKCJtMSIsYUdUTS5jKSwhMD09PWFHVE0uZC5jb25zZW50Lmhhc1Jlc3BvbnNlJiYiZnVuY3Rpb24iPT10eXBlb2YgYUdUTS5mLmNhbGxfY2MmJmFHVE0uZi5jYWxsX2NjKCl9fSxhR1RNLmYubG9hZF9jYz1mdW5jdGlvbihlLHQpe3ZhciBhPWRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoInNjcmlwdCIpLG49YUdUTS5jLnBhdGh8fCIiO24ubGVuZ3RoPjAmJiIvIiE9PW4uY2hhckF0KG4ubGVuZ3RoLTEpJiYobis9Ii8iKTt2YXIgbz0iY21wL2NjXyIrYUdUTS5mLnN0cmNsZWFuKGUpKyhhR1RNLmMubWluPyIubWluIjoiIikrIi5qcyI7YS5zcmM9bitvLGFHVE0uYy5ub25jZSYmKGEubm9uY2U9YUdUTS5jLm5vbmNlKSxhLm9ucmVhZHlzdGF0ZWNoYW5nZT1hLm9ubG9hZD1mdW5jdGlvbigpe2EucmVhZHlTdGF0ZSYmIS9sb2FkZWR8Y29tcGxldGUvLnRlc3QoYS5yZWFkeVN0YXRlKXx8ImZ1bmN0aW9uIj09dHlwZW9mIHQmJnQoKX0sYS5hc3luYz0hMCxkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKGEpfSxhR1RNLmYuY2hlbHA9ZnVuY3Rpb24oZSx0KXt2YXIgYT0hMDtpZihlKXtpZighdClyZXR1cm4hMTtlLnNwbGl0KCIsIikuZm9yRWFjaChmdW5jdGlvbihlKXt0LmluZGV4T2YoIiwiK2UudHJpbSgpKyIsIik8MCYmKGE9ITEpfSl9cmV0dXJuIGF9LGFHVE0uZi5ldmFsQ29ucz1mdW5jdGlvbihlLHQpe3ZhciBpc0NvbnNlbnRHaXZlbj1mdW5jdGlvbihlLHQpe3JldHVybiBlLmV2ZXJ5KGZ1bmN0aW9uKGUpe3JldHVybiB0LmluZGV4T2YoIiwiK2UrIiwiKT49MH0pfSxhPSFlLnB1cnBvc2VzLmxlbmd0aHx8aXNDb25zZW50R2l2ZW4oZS5wdXJwb3Nlcyx0LnB1cnBvc2VzKSxuPSFlLnNlcnZpY2VzLmxlbmd0aHx8aXNDb25zZW50R2l2ZW4oZS5zZXJ2aWNlcyx0LnNlcnZpY2VzKSxvPSFlLnZlbmRvcnMubGVuZ3RofHxpc0NvbnNlbnRHaXZlbihlLnZlbmRvcnMsdC52ZW5kb3JzKTtyZXR1cm4gYSYmbiYmb30sYUdUTS5mLnJ1bl9jYz1mdW5jdGlvbihlKXtpZighYUdUTS5kLmNvbmZpZylyZXR1cm4gYUdUTS5mLmxvZygiZTQiLG51bGwpLCExO2lmKCJzdHJpbmciIT10eXBlb2YgZXx8ImluaXQiIT09ZSYmInVwZGF0ZSIhPT1lKXJldHVybiBhR1RNLmYubG9nKCJlNSIse2FjdGlvbjplfSksITE7aWYoImZ1bmN0aW9uIiE9dHlwZW9mIGFHVE0uZi5jb25zZW50X2NoZWNrKXJldHVybiBhR1RNLmYubG9nKCJlMTQiLHthY3Rpb246ZX0pLCExO3ZhciB0PW51bGw7aWYoInVwZGF0ZSI9PT1lJiZhR1RNLmQuY29uc2VudCl7dD1KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihhR1RNLmQuY29uc2VudCkpO3ZhciBhPWFHVE0uZC5jb25zZW50O2EuaGFzUmVzcG9uc2U9ITEsYS5zZXJ2aWNlcz0iIixhLnB1cnBvc2VzPSIiLGEudmVuZG9ycz0iIixhLmNvbnNlbnRfaWQ9IiIsYS5zZXJ2aWNlSURzPSIiLGEuZmVlZGJhY2s9IiIsZGVsZXRlIGEuYmxvY2tlZH1pZighYUdUTS5mLmNvbnNlbnRfY2hlY2soZSkpcmV0dXJuIHQmJihhR1RNLmQuY29uc2VudD10KSxhR1RNLmYubG9nKCJtOCIsbnVsbCksITE7d2luZG93W2FHVE0uYy5nZGxdPXdpbmRvd1thR1RNLmMuZ2RsXXx8W107dmFyIG49Im5vbmUiPT09YUdUTS5jLmNtcHx8YUdUTS5jLmlmcmFtZVN1cHBvcnQmJmFHVE0uZC5pc19pZnJhbWU7ISghYUdUTS5jLmd0bVB1cnBvc2VzJiYhYUdUTS5jLmd0bVNlcnZpY2VzJiYhYUdUTS5jLmd0bVZlbmRvcnMpfHxufHxhR1RNLmMuYWxsb3dFbXB0eUNvbnNlbnRDb25kaXRpb25zP2FHVE0uZi5jaGVscChhR1RNLmMuZ3RtUHVycG9zZXMsYUdUTS5kLmNvbnNlbnQucHVycG9zZXMpJiZhR1RNLmYuY2hlbHAoYUdUTS5jLmd0bVNlcnZpY2VzLGFHVE0uZC5jb25zZW50LnNlcnZpY2VzKSYmYUdUTS5mLmNoZWxwKGFHVE0uYy5ndG1WZW5kb3JzLGFHVE0uZC5jb25zZW50LnZlbmRvcnMpP2FHVE0uZC5jb25zZW50Lmd0bUNvbnNlbnQ9ITA6YUdUTS5kLmNvbnNlbnQuZ3RtQ29uc2VudD0iYm9vbGVhbiI9PXR5cGVvZiBhR1RNLmQuY29uc2VudC5ibG9ja2VkJiZhR1RNLmQuY29uc2VudC5ibG9ja2VkOihhR1RNLmQuY29uc2VudC5ndG1Db25zZW50PSExLGFHVE0uZC5ub0NvbmRMb2dnZWR8fChhR1RNLmQubm9Db25kTG9nZ2VkPSEwLGFHVE0uZi5sb2coIm1fY29uc2VudF9ub19jb25kaXRpb25zIixudWxsKSkpO3ZhciBvPWFHVE0uZi5jb25zZW50X3NlcmlhbGl6ZShhR1RNLmQuY29uc2VudCkscj1vIT09YUdUTS5kLmxhc3RfY29uc2VudF9oYXNoO2lmKGFHVE0uZC5sYXN0X2NvbnNlbnRfaGFzaD1vLCJ1cGRhdGUiPT1lJiZyJiYoYUdUTS5kLmluaXR8fGFHVE0uZi5pbmplY3QoKSxhR1RNLmYuc2VuZG5hdXMoe2V2ZW50OiJhR1RNX2NvbnNlbnRfdXBkYXRlIixhR1RNdHM6KG5ldyBEYXRlKS5nZXRUaW1lKCksYUdUTWNvbnNlbnQ6YUdUTS5kLmNvbnNlbnQ/SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYoYUdUTS5kLmNvbnNlbnQpKTp7fX0pKSwidXBkYXRlIj09PWUmJiFyfHwiZnVuY3Rpb24iIT10eXBlb2YgYUdUTS5mLmNvbnNlbnRfY2FsbGJhY2t8fGFHVE0uZi5jb25zZW50X2NhbGxiYWNrKGUpLGFHVE0uYy5jb25zZW50X3N0b3JlX3VybCl7dmFyIHM9YUdUTS5kLmNvbnNlbnRfc3RvcmVfdHJ5O2lmKHMmJnMuaGFzaD09PW98fChzPWFHVE0uZC5jb25zZW50X3N0b3JlX3RyeT17aGFzaDpvLG46MCxidXN5OiExfSksbyE9PWFHVE0uZC5jb25zZW50X2hhc2gmJiFzLmJ1c3kmJnMubjwzKXtzLm4rKzt2YXIgaT17fTthR1RNLmQuc2Vzc2lvbiYmYUdUTS5kLnNlc3Npb24udWlkJiYoaS51aWQ9YUdUTS5kLnNlc3Npb24udWlkKSxhR1RNLmQuc2Vzc2lvbiYmYUdUTS5kLnNlc3Npb24uc2lkJiYoaS5zaWQ9YUdUTS5kLnNlc3Npb24uc2lkKTt2YXIgYz17fSxmPXtndG1Db25zZW50OjEsYmxvY2tlZDoxfTtmb3IodmFyIFQgaW4gYUdUTS5kLmNvbnNlbnQpaWYoYUdUTS5kLmNvbnNlbnQuaGFzT3duUHJvcGVydHkoVCkmJiFmW1RdKXt2YXIgTT1hR1RNLmQuY29uc2VudFtUXTsiIiE9PU0mJm51bGwhPU0mJihjW1RdPU0pfWkuY29uc2VudD1jO3ZhciBkPSEwPT09YUdUTS5jLmNvbnNlbnRfc3RvcmVfZW5jLEc9Im51bWJlciI9PXR5cGVvZiBhR1RNLmMuc2Vzc2lvbl9zYWx0JiZhR1RNLmMuc2Vzc2lvbl9zYWx0Pj0xP2FHVE0uYy5zZXNzaW9uX3NhbHQ6MDthR1RNLmYubG9nKCJtX2NvbnNlbnRfc3RvcmVfcG9zdCIse3VybDphR1RNLmMuY29uc2VudF9zdG9yZV91cmwsaGFzaDpvfSk7dmFyIGw9YUdUTS5mLnhzZW5kKGFHVE0uYy5jb25zZW50X3N0b3JlX3VybCxpLGQsRyk7bCYmKHMuYnVzeT0hMCxsLm9ucmVhZHlzdGF0ZWNoYW5nZT1mdW5jdGlvbigpe2lmKDQ9PT1sLnJlYWR5U3RhdGUpaWYocy5idXN5PSExLGwuc3RhdHVzPj0yMDAmJmwuc3RhdHVzPDMwMCl7aWYoYUdUTS5kLmNvbnNlbnRfaGFzaD1vLGFHVE0uZC5zZXNzaW9uX3N0YXR1cz0ic3luY2VkIixhR1RNLmYubG9nKCJtX2NvbnNlbnRfc3RvcmVfc3luY2VkIix7aGFzaDpvfSksbC5yZXNwb25zZVRleHQpdHJ5e3ZhciBlPUpTT04ucGFyc2UobC5yZXNwb25zZVRleHQpO2UmJiJzdHJpbmciPT10eXBlb2YgZS51aWQmJjA9PT1lLnVpZC5pbmRleE9mKCJDLiIpJiZhR1RNLmQuc2Vzc2lvbiYmZS51aWQhPT1hR1RNLmQuc2Vzc2lvbi51aWQmJihhR1RNLmYubG9nKCJtX3VpZF9wcm9tb3RlZCIse29sZDphR1RNLmQuc2Vzc2lvbi51aWQsbmV3OmUudWlkfSksYUdUTS5kLnNlc3Npb24udWlkPWUudWlkKX1jYXRjaChlKXthR1RNLmYubG9nKCJlX2NvbnNlbnRfc3RvcmVfcGFyc2UiLHttc2c6ZS5tZXNzYWdlfSl9fWVsc2UgYUdUTS5mLmxvZygiZV9jb25zZW50X3N0b3JlIix7c3RhdHVzOmwuc3RhdHVzLGF0dGVtcHQ6cy5ufSkscy5uPj0zJiZhR1RNLmYubG9nKCJlX2NvbnNlbnRfc3RvcmVfZ2F2ZV91cCIse2hhc2g6b30pfSl9ZWxzZSBvPT09YUdUTS5kLmNvbnNlbnRfaGFzaCYmKGFHVE0uZC5zZXNzaW9uX3N0YXR1cz0iY29uZmlybWVkIil9cmV0dXJuIGFHVE0uZi5sb2coIm0zIixhR1RNLmQuY29uc2VudCksITB9LGFHVE0uZi5jYWxsX2NjPWZ1bmN0aW9uKCl7cmV0dXJuISgiZnVuY3Rpb24iIT10eXBlb2YgYUdUTS5mLnJ1bl9jY3x8IWFHVE0uZi5ydW5fY2MoImluaXQiKSkmJih2b2lkIDAhPT1hR1RNLmQudGltZXIuY29uc2VudCYmKGNsZWFySW50ZXJ2YWwoYUdUTS5kLnRpbWVyLmNvbnNlbnQpLGRlbGV0ZSBhR1RNLmQudGltZXIuY29uc2VudCksISFhR1RNLmQuaW5pdHx8YUdUTS5mLmluamVjdCgpKX0sImZ1bmN0aW9uIiE9dHlwZW9mIGFHVE0uZi5jb25zZW50X2xpc3RlbmVyJiYoYUdUTS5mLmNvbnNlbnRfbGlzdGVuZXI9ZnVuY3Rpb24oKXthR1RNLmMudXNlTGlzdGVuZXJ8fCgiZnVuY3Rpb24iPT10eXBlb2YgYUdUTS5mLmNhbGxfY2MmJmFHVE0uZi5jYWxsX2NjKCk/ImZ1bmN0aW9uIj09dHlwZW9mIGFHVE0uZi5zdGFydF9jb25zZW50X3BvbGwmJmFHVE0uZi5zdGFydF9jb25zZW50X3BvbGwoKTphR1RNLmQudGltZXIuY29uc2VudD1zZXRJbnRlcnZhbChmdW5jdGlvbigpe2FHVE0uZi5jYWxsX2NjKCkmJiJmdW5jdGlvbiI9PXR5cGVvZiBhR1RNLmYuc3RhcnRfY29uc2VudF9wb2xsJiZhR1RNLmYuc3RhcnRfY29uc2VudF9wb2xsKCl9LDUwMCkpfSksYUdUTS5mLnN0YXJ0X2NvbnNlbnRfcG9sbD1mdW5jdGlvbigpe2FHVE0uYy5jb25zZW50X3N0b3JlX3VybCYmKCJudW1iZXIiIT10eXBlb2YgYUdUTS5jLmNvbnNlbnRfcG9sbF9tc3x8YUdUTS5jLmNvbnNlbnRfcG9sbF9tczw9MHx8YUdUTS5kLnRpbWVyJiZhR1RNLmQudGltZXIuY29uc2VudF9wb2xsfHwoYUdUTS5kLnRpbWVyPWFHVE0uZC50aW1lcnx8e30sYUdUTS5kLnRpbWVyLmNvbnNlbnRfcG9sbD1zZXRJbnRlcnZhbChmdW5jdGlvbigpeyJmdW5jdGlvbiI9PXR5cGVvZiBhR1RNLmYucnVuX2NjJiZhR1RNLmYucnVuX2NjKCJ1cGRhdGUiKX0sYUdUTS5jLmNvbnNlbnRfcG9sbF9tcykpKX0sYUdUTS5mLmdjPWZ1bmN0aW9uKGUpe2lmKCJzdHJpbmciIT10eXBlb2YgZXx8IWUpcmV0dXJuIG51bGw7dmFyIHQ9ZS5yZXBsYWNlKC9bLiorP14ke30oKXxbXF1cXF0vZywiXFwkJiIpLGE9bmV3IFJlZ0V4cCgiKD86Xnw7XFxzKikiK3QrIj0oW147XSspIiksbj1udWxsO3RyeXt2YXIgbz1kb2N1bWVudCxyPWEuZXhlYyhvW2FHVE0ubi5ja10pO3ImJnIubGVuZ3RoPjEmJihuPWRlY29kZVVSSUNvbXBvbmVudChyWzFdKSl9Y2F0Y2goZSl7fXJldHVybiBufSxhR1RNLmYuc2M9ZnVuY3Rpb24oZSx0KXtpZigic3RyaW5nIj09dHlwZW9mIGUmJmUmJnQmJiEvWzs9XHNdLy50ZXN0KGUpKXRyeXtkb2N1bWVudFthR1RNLm4uY2tdPWUrIj0iK2VuY29kZVVSSUNvbXBvbmVudCh0KSsiOyBTZWN1cmU7IFNhbWVTaXRlPUxheDsgcGF0aD0vIn1jYXRjaChlKXt9fSxhR1RNLmYudXJsUGFyYW09ZnVuY3Rpb24oZSx0KXtpZigic3RyaW5nIiE9dHlwZW9mIGV8fCFlKXJldHVybiBudWxsO3ZhciBhPWUucmVwbGFjZSgvWy4qKz9eJHt9KCl8W1xdXFxdL2csIlxcJCYiKSxuPW5ldyBSZWdFeHAoIls/Jl0iK2ErIig9KFteJiNdKil8JnwjfCQpIikuZXhlYyh0KTtyZXR1cm4gbiYmblsyXT9kZWNvZGVVUklDb21wb25lbnQoblsyXS5yZXBsYWNlKC9cKy9nLCIgIikpOm51bGx9LGFHVE0uZi5vcHRvdXQ9ZnVuY3Rpb24oKXt2YXIgZT0hMSx0PWFHVE0uZi51cmxQYXJhbSgiYUdUTW9wdG91dCIsd2luZG93LmxvY2F0aW9uLmhyZWYpO2lmKHQmJiIwIiE9PXQpYUdUTS5mLnNjKCJhR1RNb3B0b3V0IiwiMSIpLGU9ITA7ZWxzZSBpZigiMCI9PT10KWFHVE0uZi5zYygiYUdUTW9wdG91dCIsIjAiKTtlbHNle3ZhciBhPWFHVE0uZi5nYygiYUdUTW9wdG91dCIpO2EmJiIwIiE9PWEmJihlPSEwKX1pZihlKXtmb3IodmFyIG4gaW4gYUdUTSlhR1RNLmhhc093blByb3BlcnR5KG4pJiYiZiIhPT1uJiZkZWxldGUgYUdUTVtuXTtyZXR1cm4gYUdUTS5mLm9iamluaXQoKSwiZnVuY3Rpb24iPT10eXBlb2YgYUdUTS5mLm9wdG91dF9jYWxsYmFjayYmYUdUTS5mLm9wdG91dF9jYWxsYmFjaygpLCEwfXJldHVybiExfSxhR1RNLmYuYUdUTV9ldmVudD1mdW5jdGlvbihlKXsib2JqZWN0IiE9dHlwZW9mIGFHVE0uZC5jb25zZW50JiYoYUdUTS5kLmNvbnNlbnQ9bnVsbCksZXx8KGU9ImFHVE1fZXZlbnQiKTt2YXIgdD17ZXZlbnQ6ZSxhR1RNdHM6KG5ldyBEYXRlKS5nZXRUaW1lKCksYUdUTWNvbnNlbnQ6YUdUTS5kLmNvbnNlbnQ/SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYoYUdUTS5kLmNvbnNlbnQpKTp7fX07cmV0dXJuImFHVE1fcmVhZHkiPT1lJiYodC5hR1RNPXt2ZXJzaW9uOmFHVE0uZC52ZXJzaW9uLGlzX2lmcmFtZTphR1RNLmQuaXNfaWZyYW1lLGhhc3R5RXZlbnRzOmFHVE0uZC5mLGVycm9yczphR1RNLmQuZXJyb3JzfSksdH0sYUdUTS5mLnByb3h5U3VwcG9ydD1mdW5jdGlvbigpe2lmKCJmdW5jdGlvbiIhPXR5cGVvZiBQcm94eSlyZXR1cm4hMTt0cnl7cmV0dXJuIG5ldyBQcm94eShmdW5jdGlvbigpe30se2FwcGx5OmZ1bmN0aW9uKCl7cmV0dXJuITB9fSkoKX1jYXRjaChlKXtyZXR1cm4hMX19LGFHVE0uZi51cmxMaXN0ZW5lcj1mdW5jdGlvbihlLHQsYSl7aWYoIWFHVE0uZC51cmxMaXN0ZW5lcl9hY3RpdmUpe2FHVE0uZC51cmxMaXN0ZW5lcl9hY3RpdmU9ITAsIm51bWJlciIhPXR5cGVvZiB0JiYodD01MDApLCJib29sZWFuIiE9dHlwZW9mIGEmJihhPSExKSxhR1RNLmQubGFzdF91cmw9YUdUTS5kLmxhc3RfdXJsfHxhR1RNLmYuZ2V0VmFsKCJsIiwiaHJlZiIpLCJzdHJpbmciPT10eXBlb2YgYUdUTS5kLmxhc3RfdXJsJiZhR1RNLmQubGFzdF91cmx8fChhR1RNLmQubGFzdF91cmw9IiIpO3ZhciBjaGVja1VybENoYW5nZT1mdW5jdGlvbigpe3ZhciB0PWFHVE0uZi5nZXRWYWwoImwiLCJocmVmIil8fCIiO2lmKHQhPWFHVE0uZC5sYXN0X3VybCl7InN0cmluZyIhPXR5cGVvZiBlJiYoZT0idlBhZ2V2aWV3Iik7dmFyIGE9e2V2ZW50OmV9O2Eub2xkVVJMPWFHVE0uZC5sYXN0X3VybCxhLm5ld1VSTD10LGEubmV3VGl0bGU9ZG9jdW1lbnQudGl0bGUsYUdUTS5mLmZpcmUoYSksYUdUTS5kLmxhc3RfdXJsPXR9fTthR1RNLmYuZXZMc3RuKCJ3aW5kb3ciLCJwb3BzdGF0ZSIsY2hlY2tVcmxDaGFuZ2UpLGFHVE0uZi5ldkxzdG4oIndpbmRvdyIsImhhc2hjaGFuZ2UiLGNoZWNrVXJsQ2hhbmdlKTt2YXIgbj0hMTtpZihhR1RNLmYucHJveHlTdXBwb3J0KCkpe3ZhciBvPXthcHBseTpmdW5jdGlvbihlLHQsYSl7dmFyIG49ZS5hcHBseSh0LGEpO3JldHVybiBjaGVja1VybENoYW5nZSgpLG59fTtoaXN0b3J5LnB1c2hTdGF0ZT1uZXcgUHJveHkoaGlzdG9yeS5wdXNoU3RhdGUsbyksaGlzdG9yeS5yZXBsYWNlU3RhdGU9bmV3IFByb3h5KGhpc3RvcnkucmVwbGFjZVN0YXRlLG8pLG49ITB9KHQ+MCYmIW4mJmF8fHQ+MCYmIWEpJiZhR1RNLmYudGltZXIoInVybExpc3RlbmVyIixjaGVja1VybENoYW5nZSxudWxsLHQsMCl9fSxhR1RNLmYuZ3RtX2xvYWQ9ZnVuY3Rpb24oZSx0LGEsbixvLHIpe2lmKGFHVE0uZC5jb25maWcpe2lmKCJvYmplY3QiIT10eXBlb2YgYUdUTS5kLmd0bUxvYWRlZCYmKGFHVE0uZC5ndG1Mb2FkZWQ9W10pLGFHVE0uZC5ndG1Mb2FkZWQubGVuZ3RoPDEmJihhR1RNLmYuc2VuZG5hdXMoYUdUTS5mLmFHVE1fZXZlbnQoImFHVE1fcmVhZHkiKSksYSYmYUdUTS5mLnNlbmRuYXVzKHtldmVudDoiZ3RtLmpzIiwiZ3RtLnN0YXJ0IjoobmV3IERhdGUpLmdldFRpbWUoKX0pLGFHVE0uYy5hUGFnZXZpZXcmJmFHVE0uZi5zZW5kbmF1cyh7ZXZlbnQ6ImFQYWdldmlldyIsYUdUTXRzOihuZXcgRGF0ZSkuZ2V0VGltZSgpfSksYUdUTS5jLnZQYWdldmlldyYmYUdUTS5mLnNlbmRuYXVzKHtldmVudDoidlBhZ2V2aWV3IixhR1RNdHM6KG5ldyBEYXRlKS5nZXRUaW1lKCl9KSxhR1RNLmMudlBhZ2V2aWV3cyYmYUdUTS5mLnVybExpc3RlbmVyKCJ2UGFnZXZpZXciLGFHVE0uYy52UGFnZXZpZXdzVGltZXIsYUdUTS5jLnZQYWdldmlld3NGYWxsYmFjaykpLGFHVE0uZC5jb25zZW50RXZlbnRfZmlyZWQ9ImJvb2xlYW4iPT10eXBlb2YgYUdUTS5kLmNvbnNlbnRFdmVudF9maXJlZCYmYUdUTS5kLmNvbnNlbnRFdmVudF9maXJlZCxhR1RNLmMuc2VuZENvbnNlbnRFdmVudCYmIWFHVE0uZC5jb25zZW50RXZlbnRfZmlyZWQmJiJvYmplY3QiPT10eXBlb2YgYUdUTS5kLmNvbnNlbnQmJmFHVE0uZC5jb25zZW50Lmhhc1Jlc3BvbnNlJiYoYUdUTS5mLnNlbmRuYXVzKGFHVE0uZi5hR1RNX2V2ZW50KCJhR1RNX2NvbnNlbnQiKSksYUdUTS5kLmNvbnNlbnRFdmVudF9maXJlZD0hMCksYUdUTS5kLmd0bUxvYWRlZC5wdXNoKGF8fCJub19ndG1faWQiKSxhKXtufHwobj0iaWQiKTt2YXIgcz0hMSxpPWFHVE0uZi5nYygiYUdUTWRlYnVnIik7aWYoaSYmcGFyc2VJbnQoaSk+MCYmKHM9ITApLHN8fGFHVE0uZi51cmxQYXJhbSgiZ3RtX2RlYnVnIixkb2N1bWVudC5sb2NhdGlvbi5ocmVmKSYmKHM9ITApLCFzJiZkb2N1bWVudC5yZWZlcnJlcil7dmFyIGM9dC5jcmVhdGVFbGVtZW50KCJhIik7Yy5ocmVmPWRvY3VtZW50LnJlZmVycmVyLGMuaG9zdG5hbWU9PWFHVE0ubi50YSsiLmNvbSImJihzPSEwKX0haSYmcyYmYUdUTS5mLnNjKCJhR1RNZGVidWciLCIxIik7dmFyIGY9dC5jcmVhdGVFbGVtZW50KCJzY3JpcHQiKTtpZihmLmlkPSJhR1RNX3RtXyIrYSxmLmFzeW5jPSEwLCJvYmplY3QiPT10eXBlb2YgYUdUTS5jLmd0bUF0dHIpZm9yKHZhciBUIGluIGFHVE0uYy5ndG1BdHRyKWYuc2V0QXR0cmlidXRlKFQsYUdUTS5jLmd0bUF0dHJbVF0pO2lmKGFHVE0uYy5ub25jZSYmKGYubm9uY2U9YUdUTS5jLm5vbmNlKSxyLmd0bUpTJiYhcylmLmlubmVySFRNTD1hdG9iKHIuZ3RtSlMpO2Vsc2V7dmFyIE09ci5ndG1VUkx8fCJodHRwczovL3d3dy4iK2FHVE0ubi50bSsiLmNvbS9ndG0uanMiLGQ9ci5lbnZ8fCIiO2QmJiImIiE9PWQuY2hhckF0KDApJiYoZD0iJiIrZCk7dmFyIEc9LTE9PT1NLmluZGV4T2YoIj8iKT8iPyI6IiYiO2Yuc3JjPU0rRytuKyI9IithKyImbD0iK28rZH12YXIgbD10LmdldEVsZW1lbnRzQnlUYWdOYW1lKCJzY3JpcHQiKVswXTtsLnBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKGYsbCl9fWVsc2UgYUdUTS5mLmxvZygiZTciLG51bGwpfSxhR1RNLmYuZG9tcmVhZHk9ZnVuY3Rpb24oZSl7dmFyIHQ9ITE7YUdUTS5mLnZPYihlKXx8KGU9e2FNU0c6IkVtcHR5IERPTXJlYWR5IGV2ZW50IGZpcmVkLiJ9LHQ9ITApLGUuZXZlbnR8fChlLmV2ZW50PSJhRE9NcmVhZHkiKSxhR1RNLmQuZG9tX3JlYWR5JiZ0fHwoIWFHVE0uYy5kbFN0YXRlRXZlbnRzJiZ0fHxhR1RNLmYuZmlyZShlKSx0JiYoYUdUTS5kLmRvbV9yZWFkeT0hMCkpfSxhR1RNLmYucGFnZXJlYWR5PWZ1bmN0aW9uKGUpe3ZhciB0PSExO2FHVE0uZi52T2IoZSl8fChlPXthTVNHOiJFbXB0eSBQQUdFcmVhZHkgZXZlbnQgZmlyZWQuIn0sdD0hMCksZS5ldmVudHx8KGUuZXZlbnQ9ImFQQUdFcmVhZHkiKSxhR1RNLmQucGFnZV9yZWFkeSYmdHx8KCFhR1RNLmMuZGxTdGF0ZUV2ZW50cyYmdHx8YUdUTS5mLmZpcmUoZSksdCYmKGFHVE0uZC5wYWdlX3JlYWR5PSEwKSl9LGFHVE0uZi5pbml0R1RNPWZ1bmN0aW9uKGUpe3ZhciB0PSExO2lmKCJvYmplY3QiPT10eXBlb2YgYUdUTS5jLmd0bSYmYUdUTS5jLmd0bSlmb3IodmFyIGEgaW4gYUdUTS5jLmd0bSlhR1RNLmMuZ3RtLmhhc093blByb3BlcnR5KGEpJiYodD0hMCwiYm9vbGVhbiIhPXR5cGVvZiBhR1RNLmMuZ3RtW2FdLmhhc0xvYWRlZCYmKGFHVE0uYy5ndG1bYV0uaGFzTG9hZGVkPSExKSxhR1RNLmMuZ3RtW2FdLmhhc0xvYWRlZHx8ZSYmIWFHVE0uYy5ndG1bYV0ubm9Db25zZW50fHwoYUdUTS5mLmd0bV9sb2FkKHdpbmRvdyxkb2N1bWVudCxhLGFHVE0uYy5ndG1bYV0uaWRQYXJhbT9hR1RNLmMuZ3RtW2FdLmlkUGFyYW06IiIsYUdUTS5jLmdkbCxhR1RNLmMuZ3RtW2FdKSxhR1RNLmMuZ3RtW2FdLmhhc0xvYWRlZD0hMCkpO3R8fGV8fGFHVE0uZC5jb250YWluZXJMZXNzUnVufHxhR1RNLmQuaXNfaWZyYW1lfHwoYUdUTS5kLmNvbnRhaW5lckxlc3NSdW49ITAsYUdUTS5mLmd0bV9sb2FkKHdpbmRvdyxkb2N1bWVudCwiIiwiIixhR1RNLmMuZ2RsLHt9KSl9LGFHVE0uZi5jaGtEUHJlYWR5PWZ1bmN0aW9uKCl7dmFyIGU9ZG9jdW1lbnQucmVhZHlTdGF0ZTsiaW50ZXJhY3RpdmUiPT09ZXx8ImNvbXBsZXRlIj09PWU/YUdUTS5mLmRvbXJlYWR5KG51bGwpOmFHVE0uZi5ldkxzdG4oZG9jdW1lbnQsIkRPTUNvbnRlbnRMb2FkZWQiLGFHVE0uZi5kb21yZWFkeSksImNvbXBsZXRlIj09PWU/YUdUTS5mLnBhZ2VyZWFkeShudWxsKTphR1RNLmYuZXZMc3RuKHdpbmRvdywibG9hZCIsYUdUTS5mLnBhZ2VyZWFkeSl9LGFHVE0uZi5pbmplY3Q9ZnVuY3Rpb24oKXtpZighYUdUTS5kLmNvbmZpZylyZXR1cm4gYUdUTS5mLmxvZygiZTgiLG51bGwpLCExO2lmKCJvYmplY3QiIT10eXBlb2YgYUdUTS5kLmNvbnNlbnR8fCJib29sZWFuIiE9dHlwZW9mIGFHVE0uZC5jb25zZW50Lmhhc1Jlc3BvbnNlfHwhYUdUTS5kLmNvbnNlbnQuaGFzUmVzcG9uc2UpcmV0dXJuIGFHVE0uZi5sb2coImUxMyIsbnVsbCksITE7YUdUTS5kLmluaXR8fCgod2luZG93W2FHVE0uYy5nZGxdfHxbXSkuZm9yRWFjaChmdW5jdGlvbihlLHQpe2lmKCJvYmplY3QiPT10eXBlb2YgZSYmZSl7aWYoIWUuYUdUTWNoayl7ZS5hR1RNZGw9ITA7dmFyIGE9SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYoZSkpO3ZvaWQgMCE9PWFbImd0bS51bmlxdWVFdmVudElkIl0mJmRlbGV0ZSBhWyJndG0udW5pcXVlRXZlbnRJZCJdLGFHVE0uZC5mLnB1c2goYSl9fWVsc2UgYUdUTS5mLmxvZygiZTE3Iix7b2JqX3R5cGU6dHlwZW9mIGUsb2JqX3ZhbHVlOmUsaW5kZXg6dH0pLGFHVE0uZC5mLnB1c2goe2V2ZW50OiJleGNlcHRpb24iLGVycm1zZzoiRGF0YUxheWVyIEVudHJ5IGlzIG5vIG9iamVjdCIsZXJydHlwZToiREwgRXJyb3IiLG9ial90eXBlOnR5cGVvZiBlLG9ial92YWx1ZTplfSl9KSxhR1RNLmQuY29uc2VudC5ndG1Db25zZW50JiYoYUdUTS5mLmluaXRHVE0oITEpLGFHVE0uZC5pbml0PSEwKSxhR1RNLmQuaW5pdCYmYUdUTS5mLmNoa0RQcmVhZHkoKSk7cmV0dXJuImZ1bmN0aW9uIj09dHlwZW9mIGFHVE0uZi5pbmplY3RfY2FsbGJhY2smJmFHVE0uZi5pbmplY3RfY2FsbGJhY2soKSxhR1RNLmYubG9nKCJtNiIsbnVsbCksITB9LGFHVE0uZi5pRnJhbWVGaXJlPWZ1bmN0aW9uKGUpeyJvYmplY3QiPT10eXBlb2YgZSYmZSYmKGFHVE0uZC5pc19pZnJhbWUmJiJzdHJpbmciPT10eXBlb2YgZS5ldmVudCYmL14oYUdUTXxndG1cLnxbYXZdRE9NcmVhZHl8W2F2XVBBR0VyZWFkeSkvLnRlc3QoZS5ldmVudCk/YUdUTS5mLnNlbmRuYXVzKGUpOihlLmFHVE1fc291cmNlPSJpRnJhbWUgIitkb2N1bWVudC5sb2NhdGlvbi5ob3N0bmFtZSxhR1RNLmQuaWZyYW1lLmNvdW50ZXIuZXZlbnRzKyssZS5pZkV2Q3RyPWFHVE0uZC5pZnJhbWUuY291bnRlci5ldmVudHMsInN0cmluZyI9PXR5cGVvZiBlLmV2ZW50JiZlLmV2ZW50JiYoYUdUTS5kLmlmcmFtZS5jb3VudGVyW2UuZXZlbnRdPWFHVE0uZC5pZnJhbWUuY291bnRlcltlLmV2ZW50XXx8MCxhR1RNLmQuaWZyYW1lLmNvdW50ZXJbZS5ldmVudF0rKyxlWyJpZkV2Q3RyXyIrZS5ldmVudF09YUdUTS5kLmlmcmFtZS5jb3VudGVyW2UuZXZlbnRdKSxlLmFHVE10cyYmZGVsZXRlIGUuYUdUTXRzLGUuYUdUTXBhcmFtcyYmZGVsZXRlIGUuYUdUTXBhcmFtcyxhR1RNLmQuaWZyYW1lLm9yaWdpbj93aW5kb3cudG9wLnBvc3RNZXNzYWdlKGUsYUdUTS5kLmlmcmFtZS5vcmlnaW4pOmFHVE0uZC5mLnB1c2goZSkpKX0sYUdUTS5mLmlmSGFuZHNoYWtlPWZ1bmN0aW9uKCl7aWYoIWFHVE0uZC5pc19pZnJhbWUmJiFhR1RNLmQuaWZyYW1lLmhhbmRzaGFrZSl7dmFyIGU9ZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoImlmcmFtZSIpO2lmKCFlLmxlbmd0aClyZXR1cm47Zm9yKHZhciB0PTA7dDxlLmxlbmd0aDt0Kyspe3ZhciBhPWVbdF07YSYmYS5jb250ZW50V2luZG93JiZhLmNvbnRlbnRXaW5kb3cucG9zdE1lc3NhZ2UmJmEuY29udGVudFdpbmRvdy5wb3N0TWVzc2FnZSgiYUdUTV9Ub3AyaUZyYW1lIEhhbmRzaGFrZSIsIioiKX1hR1RNLmQuaWZyYW1lLmhhbmRzaGFrZT0hMH19LGFHVE0uZi5pZkhTbGlzdGVuPWZ1bmN0aW9uKGUpe2lmKGFHVE0uZC5pc19pZnJhbWUmJmUuc291cmNlPT09d2luZG93LnRvcCYmInN0cmluZyI9PXR5cGVvZiBlLmRhdGEmJiJhR1RNX1RvcDJpRnJhbWUgSGFuZHNoYWtlIj09ZS5kYXRhKWZvcihhR1RNLmQuaWZyYW1lLm9yaWdpbj1lLm9yaWdpbixhR1RNLmQuaWZyYW1lLmlmTGlzdGVuPSExLHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCJtZXNzYWdlIixhR1RNLmYuaWZIU2xpc3RlbiwhMSk7YUdUTS5kLmYubGVuZ3RoOyl7dmFyIHQ9YUdUTS5kLmYuc2hpZnQoKTthR1RNLmYuaUZyYW1lRmlyZSh0KX19LGFHVE0uZi52T2I9ZnVuY3Rpb24oZSl7aWYoIm9iamVjdCIhPXR5cGVvZiBlfHwhZSlyZXR1cm4hMTt0cnl7SlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShlKSl9Y2F0Y2goZSl7cmV0dXJuITF9cmV0dXJuITB9LGFHVE0uZi52U3Q9ZnVuY3Rpb24oZSl7dmFyIHQ9QXJyYXkuaXNBcnJheShlKT9lOiJzdHJpbmciPT10eXBlb2YgZT9bZV06W107cmV0dXJuIDAhPT10Lmxlbmd0aCYmdC5ldmVyeShmdW5jdGlvbihlKXtyZXR1cm4ic3RyaW5nIj09dHlwZW9mIGUmJiIiIT09ZX0pfSxhR1RNLmYucGFzc2l2ZVN1cHBvcnRlZD1mdW5jdGlvbigpe2lmKCJib29sZWFuIj09dHlwZW9mIGFHVE0uZC5wYXNzaXZlX3N1cHBvcnRlZClyZXR1cm4gYUdUTS5kLnBhc3NpdmVfc3VwcG9ydGVkO3ZhciBlPSExO3RyeXt2YXIgdD1PYmplY3QuZGVmaW5lUHJvcGVydHkoe30sInBhc3NpdmUiLHtnZXQ6ZnVuY3Rpb24oKXtyZXR1cm4gZT0hMCwhMH19KSxub29wPWZ1bmN0aW9uKCl7fTt3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigiYUdUTXBhc3NpdmV0ZXN0Iixub29wLHQpLHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCJhR1RNcGFzc2l2ZXRlc3QiLG5vb3AsdCl9Y2F0Y2godCl7ZT0hMX1yZXR1cm4gYUdUTS5kLnBhc3NpdmVfc3VwcG9ydGVkPWUsZX0sYUdUTS5mLnRocm90dGxlPWZ1bmN0aW9uKGUsdCl7aWYoImZ1bmN0aW9uIiE9dHlwZW9mIGUpcmV0dXJuIGU7aWYoIm51bWJlciIhPXR5cGVvZiB0fHx0PD0wKXJldHVybiBlO3ZhciBhPTAsbj1udWxsLG89bnVsbCxyPW51bGw7cmV0dXJuIGZ1bmN0aW9uKCl7dmFyIHM9RGF0ZS5ub3coKTtvPXRoaXMscj1hcmd1bWVudHM7dmFyIGk9dC0ocy1hKTtpPD0wPyhuJiYoY2xlYXJUaW1lb3V0KG4pLG49bnVsbCksYT1zLGUuYXBwbHkobyxyKSk6bnx8KG49c2V0VGltZW91dChmdW5jdGlvbigpe2E9RGF0ZS5ub3coKSxuPW51bGwsZS5hcHBseShvLHIpfSxpKSl9fSxhR1RNLmYuZXZMc3RuPWZ1bmN0aW9uKGUsdCxhLG4pe2lmKCJ3aW5kb3ciPT09ZSYmKGU9d2luZG93KSwiZG9jdW1lbnQiPT09ZSYmKGU9ZG9jdW1lbnQpLCJvYmplY3QiPT10eXBlb2YgZSYmZSYmInN0cmluZyI9PXR5cGVvZiB0JiYiZnVuY3Rpb24iPT10eXBlb2YgYSl7Im9iamVjdCI9PXR5cGVvZiBuJiZufHwobj17fSk7dHJ5e2lmKCJtZXNzYWdlIj09dClhR1RNLmQuaWZyYW1lLnRvcExpc3Rlbnx8YUdUTS5kLmlzX2lmcmFtZXx8KGFHVE0uZC5pZnJhbWUudG9wTGlzdGVuPSEwLGUuYWRkRXZlbnRMaXN0ZW5lcih0LGZ1bmN0aW9uKGUpe2Eodm9pZCAwIT09ZS5kYXRhP2UuZGF0YTpudWxsLCJzdHJpbmciPT10eXBlb2YgZS5vcmlnaW4/ZS5vcmlnaW46IiIpfSkpO2Vsc2V7dmFyIG89Im51bWJlciI9PXR5cGVvZiBuLnRocm90dGxlJiZuLnRocm90dGxlPjA/YUdUTS5mLnRocm90dGxlKGEsbi50aHJvdHRsZSk6YTshMD09PW4ucGFzc2l2ZSYmYUdUTS5mLnBhc3NpdmVTdXBwb3J0ZWQoKT9lLmFkZEV2ZW50TGlzdGVuZXIodCxvLHtwYXNzaXZlOiEwfSk6ZS5hZGRFdmVudExpc3RlbmVyKHQsbyl9fWNhdGNoKG4pe2FHVE0uZi5sb2coImUxMiIse2Vycm9yOm4sZWw6ZSxldjp0LGZjdDphfSl9fWVsc2UgYUdUTS5mLmxvZygiZTExIix7ZWw6ZSxldjp0LGZjdDphfSl9LGFHVE0uZi5ybUxzdG49ZnVuY3Rpb24oZSx0LGEpeyJ3aW5kb3ciPT09ZSYmKGU9d2luZG93KSwiZG9jdW1lbnQiPT09ZSYmKGU9ZG9jdW1lbnQpO3RyeXtlLnJlbW92ZUV2ZW50TGlzdGVuZXIodCxhKX1jYXRjaChlKXt9fSxhR1RNLmYuZ2V0VmFsPWZ1bmN0aW9uKGUsdCl7aWYoYUdUTS5mLnZTdChbZSx0XSkmJnQubWF0Y2goL1thLXpdKy9pKSYmKCJwIiE9ZXx8Im9iamVjdCI9PXR5cGVvZiBwZXJmb3JtYW5jZSYmcGVyZm9ybWFuY2UpKXN3aXRjaChlKXtjYXNlInciOnJldHVybiBhR1RNLmYudk9iKHdpbmRvd1t0XSk/SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYod2luZG93W3RdKSk6d2luZG93W3RdO2Nhc2UibiI6cmV0dXJuIGFHVE0uZi52T2IobmF2aWdhdG9yW3RdKT9KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihuYXZpZ2F0b3JbdF0pKTpuYXZpZ2F0b3JbdF07Y2FzZSJkIjpyZXR1cm4gZG9jdW1lbnRbdF07Y2FzZSJsIjpyZXR1cm4gZG9jdW1lbnQubG9jYXRpb25bdF07Y2FzZSJoIjpyZXR1cm4gZG9jdW1lbnQuaGVhZFt0XTtjYXNlImIiOnJldHVybiBkb2N1bWVudC5ib2R5W3RdO2Nhc2UicyI6cmV0dXJuIGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCJodG1sIilbMF0uc2Nyb2xsVG9wfHwwO2Nhc2UibSI6cmV0dXJuIHdpbmRvdy5zY3JlZW5bdF07Y2FzZSJjIjpyZXR1cm4gd2luZG93Lmdvb2dsZV90YWdfZGF0YSYmd2luZG93Lmdvb2dsZV90YWdfZGF0YS5pY3M/SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYod2luZG93Lmdvb2dsZV90YWdfZGF0YS5pY3MpKTpudWxsO2Nhc2UicCI6cmV0dXJuIm5vdyI9PXQ/cGVyZm9ybWFuY2Uubm93KCk6cGVyZm9ybWFuY2VbdF07ZGVmYXVsdDpyZXR1cm59fSxhR1RNLmYuZ2V0Tm9kZUF0dHI9ZnVuY3Rpb24oZSx0KXt2YXIgYT1kb2N1bWVudC5xdWVyeVNlbGVjdG9yKGUpO3JldHVybiBhP2EuZ2V0QXR0cmlidXRlKHQpOm51bGx9LGFHVE0uZi5uZXdOb2RlPWZ1bmN0aW9uKGUsdCxhKXtpZihhR1RNLmYudlN0KFtlLHRdKSYmIm9iamVjdCI9PXR5cGVvZiBhKXt2YXIgbj1kb2N1bWVudC5jcmVhdGVFbGVtZW50KGUpLG89ZG9jdW1lbnQucXVlcnlTZWxlY3Rvcih0KTtpZihvKXtmb3IodmFyIHIgaW4gYSlpZihhLmhhc093blByb3BlcnR5KHIpKXt2YXIgcz1yLnNwbGl0KCIuIik7MT09PXMubGVuZ3RoP24uc2V0QXR0cmlidXRlKHIsYVtyXSk6KG5bc1swXV18fChuW3NbMF1dPXt9KSxuW3NbMF1dW3NbMV1dPWFbcl0pfW8uYXBwZW5kQ2hpbGQobil9fX0sYUdUTS5mLmRlbE5vZGU9ZnVuY3Rpb24oZSl7aWYoYUdUTS5mLnZTdChlKSl7dmFyIHQ9ZG9jdW1lbnQucXVlcnlTZWxlY3RvcihlKTt0JiZ0LnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQodCl9fSxhR1RNLmYucGFnZWluZm89ZnVuY3Rpb24oZSl7dmFyIHQ9MCxhPTA7aWYoKGU9ZXx8e30pLmNvdW50V29yZHMmJmZ1bmN0aW9uIGdldFRleHQoZSl7aWYoMz09PWUubm9kZVR5cGUpe3ZhciBhPWUudGV4dENvbnRlbnQudHJpbSgpO2EmJih0Kz1hLnNwbGl0KC9ccysvKS5sZW5ndGgpfWVsc2UgaWYoMT09PWUubm9kZVR5cGUmJiEvXihzY3JpcHR8c3R5bGV8bm9zY3JpcHQpJC9pLnRlc3QoZS50YWdOYW1lKSlmb3IodmFyIG49MDtuPGUuY2hpbGROb2Rlcy5sZW5ndGg7bisrKWdldFRleHQoZS5jaGlsZE5vZGVzW25dKX0oZG9jdW1lbnQuYm9keSksZS5jb3VudEltYWdlcylmb3IodmFyIG49ZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoImltZyIpLG89MDtvPG4ubGVuZ3RoO28rKyluW29dLm5hdHVyYWxXaWR0aD4yNTAmJm5bb10ubmF0dXJhbEhlaWdodD4yNTAmJmErKztyZXR1cm57d29yZHM6dCxpbWFnZXM6YX19LGFHVE0uZi5jcExzdD1mdW5jdGlvbihlLHQsYSl7dHJ5e2UuYWRkRXZlbnRMaXN0ZW5lcih0LGZ1bmN0aW9uKGUpe3ZhciB0O3dpbmRvdy5nZXRTZWxlY3Rpb24mJih0PXdpbmRvdy5nZXRTZWxlY3Rpb24oKS50b1N0cmluZygpKSYmYSh0KX0pfWNhdGNoKHQpe2FHVE0uZi5sb2coImUxMiIse2VsZW1lbnQ6ZSxlcnJvcjp0fSl9fSxhR1RNLmYuZWxMc3Q9ZnVuY3Rpb24oZSx0LGEpe3RyeXtlLmFkZEV2ZW50TGlzdGVuZXIodCxmdW5jdGlvbihlKXtmb3IodmFyIHQ9dGhpcy50YWdOYW1lLnRvTG93ZXJDYXNlKCksbj0iIixvPSIiLHI9bnVsbCxzPW51bGwsaT0wLGM9dGhpcztjJiZjLnBhcmVudEVsZW1lbnQ7KWM9Yy5wYXJlbnRFbGVtZW50LCFuJiZjLmlkJiYobj0oInN0cmluZyI9PXR5cGVvZiBjLm5vZGVOYW1lP2Mubm9kZU5hbWUudG9Mb3dlckNhc2UoKSsiOiI6IiIpK2MuaWQpLCFvJiZjLmdldEF0dHJpYnV0ZSgiY2xhc3MiKSYmKG89KCJzdHJpbmciPT10eXBlb2YgYy5ub2RlTmFtZT9jLm5vZGVOYW1lLnRvTG93ZXJDYXNlKCkrIjoiOiIiKStjLmdldEF0dHJpYnV0ZSgiY2xhc3MiKSk7aWYoImlucHV0Ij09PXR8fCJzZWxlY3QiPT09dHx8InRleHRhcmVhIj09PXQpe2ZvcihjPXRoaXM7YyYmYy5wYXJlbnRFbGVtZW50JiYiZm9ybSIhPT1jLnRhZ05hbWUudG9Mb3dlckNhc2UoKTspYz1jLnBhcmVudEVsZW1lbnQ7ImZvcm0iPT09Yy50YWdOYW1lLnRvTG93ZXJDYXNlKCkmJihyPXtpZDpjLmlkLGNsYXNzOmMuZ2V0QXR0cmlidXRlKCJjbGFzcyIpLG5hbWU6Yy5nZXRBdHRyaWJ1dGUoIm5hbWUiKSxhY3Rpb246Yy5hY3Rpb24sZWxlbWVudHM6Yy5lbGVtZW50cy5sZW5ndGh9LHM9QXJyYXkucHJvdG90eXBlLmluZGV4T2YuY2FsbChjLmVsZW1lbnRzLHRoaXMpKzEpfSJvYmplY3QiPT10eXBlb2YgdGhpcy5lbGVtZW50cyYmIm51bWJlciI9PXR5cGVvZiB0aGlzLmVsZW1lbnRzLmxlbmd0aCYmKGk9dGhpcy5lbGVtZW50cy5sZW5ndGgpO3ZhciBmPXt0YWdOYW1lOnQsdGFyZ2V0OnRoaXMudGFyZ2V0fHwiIixwYXJlbnRJRDpuLHBhcmVudENsYXNzOm8saWQ6dGhpcy5pZHx8IiIsbmFtZTp0aGlzLmdldEF0dHJpYnV0ZSgibmFtZSIpfHwiIixjbGFzczp0aGlzLmdldEF0dHJpYnV0ZSgiY2xhc3MiKXx8IiIsaHJlZjp0aGlzLmhyZWZ8fCIiLHNyYzp0aGlzLnNyY3x8IiIsYWN0aW9uOnRoaXMuYWN0aW9ufHwiIix0eXBlOnRoaXMudHlwZXx8IiIsZWxlbWVudHM6aSxwb3NpdGlvbjpzLGZvcm06cixodG1sOnRoaXMub3V0ZXJIVE1MP3RoaXMub3V0ZXJIVE1MLnRvU3RyaW5nKCk6IiIsdGV4dDp0aGlzLm91dGVyVGV4dD90aGlzLm91dGVyVGV4dC50b1N0cmluZygpOiIifTtmLmh0bWwubGVuZ3RoPjUxMiYmKGYuaHRtbD1mLmh0bWwuc2xpY2UoMCw1MDkpKyIuLi4iKSxmLnRleHQubGVuZ3RoPjUxMiYmKGYudGV4dD1mLnRleHQuc2xpY2UoMCw1MDkpKyIuLi4iKSxhKGYpfSl9Y2F0Y2godCl7YUdUTS5mLmxvZygiZTEyIix7ZWxlbWVudDplLGVycm9yOnR9KX19LGFHVE0uZi5hZGRFbExzdD1mdW5jdGlvbihlLHQsYSl7aWYoYUdUTS5mLnZTdChbZSx0XSkmJiJmdW5jdGlvbiI9PXR5cGVvZiBhKXt2YXIgbj1kb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKGUpOyJvYmplY3QiPT10eXBlb2YgbiYmIm51bWJlciI9PXR5cGVvZiBuLmxlbmd0aCYmMCE9bi5sZW5ndGgmJm4uZm9yRWFjaChmdW5jdGlvbihlKXtpZigiY29weSI9PT10KWFHVE0uZi5jcExzdChlLHQsYSk7ZWxzZSBhR1RNLmYuZWxMc3QoZSx0LGEpfSl9fSxhR1RNLmYub2JzZXJ2ZXI9ZnVuY3Rpb24oZSx0LGEpe2lmKGFHVE0uZi52U3QoW2UsdF0pJiYiZnVuY3Rpb24iPT10eXBlb2YgYSl7bmV3IE11dGF0aW9uT2JzZXJ2ZXIoZnVuY3Rpb24obil7bi5mb3JFYWNoKGZ1bmN0aW9uKG4peyJjaGlsZExpc3QiPT09bi50eXBlJiZuLmFkZGVkTm9kZXMubGVuZ3RoJiZBcnJheS5wcm90b3R5cGUuZm9yRWFjaC5jYWxsKG4uYWRkZWROb2RlcyxmdW5jdGlvbihuKXtpZigxPT09bi5ub2RlVHlwZSYmInN0cmluZyI9PXR5cGVvZiBuLnRhZ05hbWUmJm4udGFnTmFtZS50b0xvd2VyQ2FzZSgpPT09ZS50b0xvd2VyQ2FzZSgpJiZhR1RNLmYuZWxMc3Qobix0LGEpLDE9PT1uLm5vZGVUeXBlJiZuLnF1ZXJ5U2VsZWN0b3JBbGwpe3ZhciBvPW4ucXVlcnlTZWxlY3RvckFsbChlLnRvTG93ZXJDYXNlKCkpO0FycmF5LnByb3RvdHlwZS5mb3JFYWNoLmNhbGwobyxmdW5jdGlvbihlKXthR1RNLmYuZWxMc3QoZSx0LGEpfSl9fSl9KX0pLm9ic2VydmUoZG9jdW1lbnQuYm9keSx7Y2hpbGRMaXN0OiEwLHN1YnRyZWU6ITAsYXR0cmlidXRlczohMX0pfX0sYUdUTS5mLnJUZXN0PWZ1bmN0aW9uKGUsdCl7cmV0dXJuIGFHVE0uZi52U3QoW2UsdF0pJiZuZXcgUmVnRXhwKHQsImkiKS50ZXN0KGUpfSxhR1RNLmYuck1hdGNoPWZ1bmN0aW9uKGUsdCl7cmV0dXJuIGUubWF0Y2gobmV3IFJlZ0V4cCh0KSl9LGFHVE0uZi5yUmVwbGFjZT1mdW5jdGlvbihlLHQsYSl7cmV0dXJuIGFHVE0uZi52U3QoW2UsdCxhXSk/ZS5yZXBsYWNlKG5ldyBSZWdFeHAodCwiZ2kiKSxhKTplfSxhR1RNLmYuaXNJRnJhbWU9ZnVuY3Rpb24oKXtyZXR1cm4gd2luZG93LnNlbGYhPT13aW5kb3cudG9wfSxhR1RNLmYuanNlcnJvcnM9ZnVuY3Rpb24oKXthR1RNLmYuZXZMc3RuKHdpbmRvdywiZXJyb3IiLGZ1bmN0aW9uKGUpe2lmKG51bGwhPT1lKXt2YXIgdD0ic3RyaW5nIj09dHlwZW9mIGUubWVzc2FnZT9lLm1lc3NhZ2U6IiIsYT0ic3RyaW5nIj09dHlwZW9mIGUuZmlsZW5hbWU/ZS5maWxlbmFtZToiIjtpZigic2NyaXB0IGVycm9yLiI9PXQudG9Mb3dlckNhc2UoKSl7aWYoIWEpcmV0dXJuO3Q9dC5yZXBsYWNlKCIuIiwiOiIpKyIgZXJyb3IgZnJvbSBvdGhlciBkb21haW4uIn1hJiYodCs9IiB8IGZpbGU6ICIrYSk7dmFyIG49YUdUTS5mLnN0cmNsZWFuKGUubGluZW5vKTsiMCI9PW4mJihuPSIiKSxuJiYodCs9IiB8IGxpbmU6ICIrbik7dmFyIG89YUdUTS5mLnN0cmNsZWFuKGUuY29sbm8pOyIwIj09byYmKG89IiIpLG8mJih0Kz0iIHwgY29sOiAiK28pLGFHVE0uZC5lcnJvcnMucHVzaCh0KTt2YXIgcj0iIjt0cnl7cj1uYXZpZ2F0b3IuYXBwQ29kZU5hbWUrIiB8ICIrbmF2aWdhdG9yLmFwcE5hbWUrIiB8ICIrbmF2aWdhdG9yLmFwcFZlcnNpb24rIiB8ICIrbmF2aWdhdG9yLnBsYXRmb3JtfWNhdGNoKGUpe31pZihhR1RNLmQuZXJyb3JfY291bnRlcisrPj0xMDApcmV0dXJuO2FHVE0uZC5lcnJvcl9jb3VudGVyPD01JiZhR1RNLmYuZmlyZSh7ZXZlbnQ6ImV4Y2VwdGlvbiIsZXJybXNnOnQsYnJvd3NlcjpyLGVycnR5cGU6IkpTIEVycm9yIix0aW1lc3RhbXA6KG5ldyBEYXRlKS5nZXRUaW1lKCksZXJyY3Q6YUdUTS5kLmVycm9yX2NvdW50ZXIsZXZlbnRNb2RlbDpudWxsfSl9fSl9LGFHVE0uZi50aW1lcmZrdD1mdW5jdGlvbihlKXt2YXIgdD1KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihlKSk7dC50aW1lcl9tcz0xKnQudGltZXJfbXMsdC50aW1lcl9jdCsrLHQudGltZXJfdG09dC50aW1lcl9tcyp0LnRpbWVyX2N0LHQudGltZXJfc2M9cGFyc2VGbG9hdCgodC50aW1lcl90bS8xZTMpLnRvRml4ZWQoMykpLHQuZXZlbnQ9dC5ldmVudHx8InRpbWVyIiwtMSE9PXQuZXZlbnQuaW5kZXhPZigiW3NdIikmJih0LmV2ZW50PXQuZXZlbnQucmVwbGFjZSgiW3NdIix0LnRpbWVyX3NjLnRvU3RyaW5nKCkpKSx0LmV2ZW50TW9kZWw9bnVsbCxhR1RNLmYuZmlyZSh0KX0sYUdUTS5mLnRpbWVyPWZ1bmN0aW9uKGUsdCxhLG4sbyl7aWYoIWUmJiJvYmplY3QiPT10eXBlb2YgYSYmYSYmInN0cmluZyI9PXR5cGVvZiBhLmV2ZW50JiYoZT1hLmV2ZW50KSxlPWV8fCJ0aW1lciIsZSs9Il8iKyhuZXcgRGF0ZSkuZ2V0VGltZSgpLnRvU3RyaW5nKCkrIl8iK01hdGguZmxvb3IoOTk5OTk5Kk1hdGgucmFuZG9tKCkrMSkudG9TdHJpbmcoKSxhR1RNLmYuc3RvcHRpbWVyKGUpLCJvYmplY3QiPT10eXBlb2YgYSYmYSl2YXIgcj1KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihhKSk7ZWxzZSByPXt9O3IudGltZXJfbm09ZSxyLnRpbWVyX21zPW4sci50aW1lcl9ycD1vLHIudGltZXJfY3Q9MCxyLmlkPTE9PT1yLnRpbWVyX3JwP3NldFRpbWVvdXQoZnVuY3Rpb24oKXt0P3Qocik6YUdUTS5mLnRpbWVyZmt0KHIpfSxuKTpzZXRJbnRlcnZhbChmdW5jdGlvbigpe3Q/dChyKTphR1RNLmYudGltZXJma3Qociksci50aW1lcl9jdCsrLHIudGltZXJfcnA+MCYmci50aW1lcl9jdD49ci50aW1lcl9ycCYmYUdUTS5mLnN0b3B0aW1lcihyLnRpbWVyX25tKX0sbiksYUdUTS5kLnRpbWVyW2VdPXJ9LGFHVE0uZi5zdG9wdGltZXI9ZnVuY3Rpb24oZSl7aWYoIm9iamVjdCIhPXR5cGVvZiBhR1RNLmQudGltZXImJihhR1RNLmQudGltZXI9e30pLCJvYmplY3QiPT10eXBlb2YgYUdUTS5kLnRpbWVyW2VdKXt2YXIgdD1hR1RNLmQudGltZXJbZV07MT09PXQudGltZXJfcnA/Y2xlYXJUaW1lb3V0KHQuaWQpOmNsZWFySW50ZXJ2YWwodC5pZCksZGVsZXRlIGFHVE0uZC50aW1lcltlXX19LGFHVE0uZi5kbHJlcGVhdD1mdW5jdGlvbihlKXtpZigib2JqZWN0Ij09dHlwZW9mIGUmJmUmJiFhR1RNLmQuZGxyZXBlYXREb25lKXt2YXIgZGJnPWZ1bmN0aW9uKHQsYSl7ZS5kZWJ1ZyYmIm9iamVjdCI9PXR5cGVvZiB3aW5kb3cuY29uc29sZSYmd2luZG93LmNvbnNvbGUubG9nJiZ3aW5kb3cuY29uc29sZS5sb2coImFHVE0gZGxyZXBlYXQ6ICIrdCxhKX0sZ2V0U3JjPWZ1bmN0aW9uKCl7cmV0dXJuImxpdmUiPT1lLnNvdXJjZT93aW5kb3dbYUdUTS5jLmdkbF18fFtdOiJkbCI9PWUuc291cmNlP2FHVE0uZC5kbHx8W106YUdUTS5kLmZ8fFtdfSxtYXRjaExpc3Q9ZnVuY3Rpb24oZSx0KXtmb3IodmFyIGE9ZS5zcGxpdCgiLCIpLG49MDtuPGEubGVuZ3RoO24rKyl7dmFyIG89YVtuXS5yZXBsYWNlKC9eXHMrfFxzKyQvZywiIik7aWYobyl7dmFyIHI9by5yZXBsYWNlKC9bLiorP14ke30oKXxbXF1cXF0vZywiXFwkJiIpLnJlcGxhY2UoL1xcXCovZywiLioiKTt0cnl7aWYobmV3IFJlZ0V4cCgiXiIrcisiJCIsImkiKS50ZXN0KHQpKXJldHVybiEwfWNhdGNoKGUpe319fXJldHVybiExfSxwYXJzZUNvbmQ9ZnVuY3Rpb24oZSl7aWYoIWUpcmV0dXJuIG51bGw7dmFyIHQ9ZS5pbmRleE9mKCJbIik7aWYodDwwKXJldHVybntldjplLGF0dHI6bnVsbCx2YWw6bnVsbH07dmFyIGE9ZS5pbmRleE9mKCJdIik7aWYoYTx0fHwhZS5zdWJzdHJpbmcoMCx0KSlyZXR1cm4gbnVsbDtpZihhKzEhPT1lLmxlbmd0aClyZXR1cm4gbnVsbDt2YXIgbj1lLnN1YnN0cmluZyh0KzEsYSksbz1uLmluZGV4T2YoIjoiKSxyPW8+PTA/bi5zdWJzdHJpbmcoMCxvKTpuO3JldHVybiByP3tldjplLnN1YnN0cmluZygwLHQpLGF0dHI6cix2YWw6bz49MD9uLnN1YnN0cmluZyhvKzEpOm51bGx9Om51bGx9LHRyaW09ZnVuY3Rpb24oZSl7cmV0dXJuIGUucmVwbGFjZSgvXlxzK3xccyskL2csIiIpfSx0PVtdO2lmKGUuZ2F0ZUV2ZW50cylmb3IodmFyIGE9ZS5nYXRlRXZlbnRzLnNwbGl0KCIsIiksbj0wO248YS5sZW5ndGg7bisrKXt2YXIgbz10cmltKGFbbl0pO2lmKG8pe3ZhciByPW8uaW5kZXhPZigiP2lmPSIpO2lmKHI8MCl0LnB1c2goe25hbWU6byxjb25kOm51bGx9KTtlbHNle3ZhciBzPXRyaW0oby5zdWJzdHJpbmcoMCxyKSk7aWYocyl7dmFyIGk9cGFyc2VDb25kKHRyaW0oby5zdWJzdHJpbmcocis0KSkpO2l8fGRiZygiaW52YWxpZCA/aWY9IHByZWRpY2F0ZSwgZ2F0ZSB0cmVhdGVkIGFzIHVuY29uZGl0aW9uYWw6ICIrbyksdC5wdXNoKHtuYW1lOnMsY29uZDppfSl9ZWxzZSBkYmcoImdhdGUgdG9rZW4gd2l0aCBlbXB0eSBuYW1lIGJlZm9yZSA/aWY9LCBza2lwcGVkOiAiK28pfX19dmFyIGhhc0V2ZW50PWZ1bmN0aW9uKGUsdCl7Zm9yKHZhciBhPTA7YTxlLmxlbmd0aDthKyspaWYoZVthXSYmZVthXS5ldmVudD09PXQpcmV0dXJuITA7cmV0dXJuITF9LGNvbmRTdGF0ZT1mdW5jdGlvbihlLHQpe2Zvcih2YXIgYT0hMSxuPTA7bjxlLmxlbmd0aDtuKyspe3ZhciBvPWVbbl07aWYobyYmby5ldmVudD09PXQuZXYpe2lmKGE9ITAsbnVsbD09dC5hdHRyKXJldHVybiAxO3ZhciByPW9bdC5hdHRyXTtpZihudWxsPT10LnZhbCl7aWYobnVsbCE9ciYmIiIhPT1yKXJldHVybiAxfWVsc2UgaWYoU3RyaW5nKHIpPT09dC52YWwpcmV0dXJuIDF9fXJldHVybiBhPzA6LTF9LGdhdGVSZWFkeT1mdW5jdGlvbihlKXtmb3IodmFyIGE9MDthPHQubGVuZ3RoO2ErKyl7dmFyIG49dFthXTtpZihuLmNvbmQpe3ZhciBvPWNvbmRTdGF0ZShlLG4uY29uZCk7aWYoMD09PW8pY29udGludWU7aWYoLTE9PT1vKXJldHVybiExfWlmKCFoYXNFdmVudChlLG4ubmFtZSkpcmV0dXJuITF9cmV0dXJuITB9LHBhc3Nlcz1mdW5jdGlvbih0KXtpZigib2JqZWN0IiE9dHlwZW9mIHR8fCF0KXJldHVybiExO2lmKCEwPT09dC5hR1RNcmVwZWF0ZWQpcmV0dXJuITE7aWYoITA9PT10LmFHVE1kbCl7aWYoIWUuZ3RtRmlyZWQpcmV0dXJuITF9ZWxzZSBpZighZS5hZ3RtRmlyZWQpcmV0dXJuITE7cmV0dXJuKCJzdHJpbmciIT10eXBlb2YgdC5ldmVudHx8MCE9PXQuZXZlbnQuaW5kZXhPZigiYUdUTSIpKSYmKCgic3RyaW5nIj09dHlwZW9mIHQuZXZlbnR8fCJzdHJpbmciIT10eXBlb2YgdC50eXBlfHwib2JqZWN0IiE9dHlwZW9mIHQuZmxhZ3N8fCF0LmZsYWdzfHwhdC5mbGFncy5lbmFibGVVbnRhZ2dlZFBhZ2VSZXBvcnRpbmcpJiYoISghZS5ndG1FdmVudHMmJiJzdHJpbmciPT10eXBlb2YgdC5ldmVudCYmL15ndG1cLihzdGFydHxpbml0X2NvbnNlbnR8aW5pdHxqc3xkb218bG9hZCkkL2kudGVzdCh0LmV2ZW50KSkmJighKGUud2hpdGVsaXN0JiYic3RyaW5nIj09dHlwZW9mIHQuZXZlbnQmJiFtYXRjaExpc3QoZS53aGl0ZWxpc3QsdC5ldmVudCkpJiYoKCFlLmJsYWNrbGlzdHx8InN0cmluZyIhPXR5cGVvZiB0LmV2ZW50fHwhbWF0Y2hMaXN0KGUuYmxhY2tsaXN0LHQuZXZlbnQpKSYmISghZS5tZXNzYWdlcyYmInN0cmluZyIhPXR5cGVvZiB0LmV2ZW50KSkpKSl9LGRvUmVwbGF5PWZ1bmN0aW9uKGEpe2FHVE0uZC5kbHJlcGVhdERvbmU9ITA7Zm9yKHZhciBuPWdldFNyYygpLG89biYmIm51bWJlciI9PXR5cGVvZiBuLmxlbmd0aD9uLmxlbmd0aDowLHI9Im9iamVjdCI9PXR5cGVvZiBhR1RNLmQuY29uc2VudCYmYUdUTS5kLmNvbnNlbnQmJmFHVE0uZC5jb25zZW50Lmd0bUNvbnNlbnQscz0wLGk9ZS5tYXhFdmVudHN8fDAsYz0wLFQ9MDtUPG87VCsrKWlmKHBhc3NlcyhuW1RdKSl7aWYoaSYmcz49aSlicmVhaztzKys7dmFyIE09SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYobltUXSkpO2lmKGUuY2xlYXJFY29tJiZyJiZ2b2lkIDAhPT1NLmVjb21tZXJjZSYmYUdUTS5mLmZpcmUoe2Vjb21tZXJjZTpudWxsLGFHVE1yZXBlYXRlZDohMH0pLGRlbGV0ZSBNLmFHVE10cyxkZWxldGUgTS5hR1RNcGFyYW1zLGRlbGV0ZSBNLmV2ZW50TW9kZWwsZGVsZXRlIE1bImd0bS51bmlxdWVFdmVudElkIl0sTS5hR1RNcmVwZWF0ZWQ9ITAsZS5hZGRwYXJhbWV0ZXImJmUuYWRkcGFyYW1ldGVyLmxlbmd0aClmb3IodmFyIGQ9MDtkPGUuYWRkcGFyYW1ldGVyLmxlbmd0aDtkKyspZS5hZGRwYXJhbWV0ZXJbZF0mJmUuYWRkcGFyYW1ldGVyW2RdLnBrZXkmJihNW2UuYWRkcGFyYW1ldGVyW2RdLnBrZXldPWUuYWRkcGFyYW1ldGVyW2RdLnB2YWx1ZSk7YUdUTS5mLmZpcmUoTSksYysrfXZhciBHPWE/IiI6ZnVuY3Rpb24oZSl7Zm9yKHZhciBhPVtdLG49MDtuPHQubGVuZ3RoO24rKyl7dmFyIG89dFtuXTtpZihvLmNvbmQpe3ZhciByPWNvbmRTdGF0ZShlLG8uY29uZCk7aWYoMD09PXIpY29udGludWU7aWYoLTE9PT1yKXthLnB1c2goby5jb25kLmV2KTtjb250aW51ZX19aGFzRXZlbnQoZSxvLm5hbWUpfHxhLnB1c2goby5uYW1lKX1yZXR1cm4gYX0obikuam9pbigiLCIpOyFhJiZlLmZhbGxiYWNrRXZlbnQmJmM+MCYmYUdUTS5mLmZpcmUoe2V2ZW50OiJhR1RNX3JlcGVhdF9mYWxsYmFjayIsYUdUTXJlcGVhdENvdW50OmMsYUdUTXJlcGVhdFNvdXJjZTplLnNvdXJjZSxhR1RNcmVwZWF0TWlzc2luZzpHLGFHVE1yZXBlYXRXYWl0ZWQ6Zn0pLGRiZygicmVwbGF5ZWQgIitjKyIgZXZlbnQocyksIGVucmljaGVkPSIrKGE/InllcyI6Im5vKGZhbGxiYWNrKSIpKyhhPyIiOiIsIG1pc3Npbmc9IitHKSl9O2lmKGRiZygic3RhcnQiLGUpLCFhR1RNLmQuZGxyZXBlYXRQb2xsaW5nKWlmKGdhdGVSZWFkeShnZXRTcmMoKSkpZG9SZXBsYXkoITApO2Vsc2V7YUdUTS5kLmRscmVwZWF0UG9sbGluZz0hMCxhR1RNLmQuZGxyZXBlYXRHYXRlPWUuZ2F0ZUV2ZW50c3x8IiI7dmFyIGM9Im51bWJlciI9PXR5cGVvZiBlLnBvbGxNcyYmZS5wb2xsTXM+PTUwP2UucG9sbE1zOjMwMCxmPSJudW1iZXIiPT10eXBlb2YgZS50aW1lb3V0TXMmJmUudGltZW91dE1zPjA/ZS50aW1lb3V0TXM6MCxUPWY+MD9mOjNlNCxNPTAsZD1zZXRJbnRlcnZhbChmdW5jdGlvbigpe2lmKGFHVE0uZC5kbHJlcGVhdERvbmUpY2xlYXJJbnRlcnZhbChkKTtlbHNle2lmKGdhdGVSZWFkeShnZXRTcmMoKSkpcmV0dXJuIGNsZWFySW50ZXJ2YWwoZCksdm9pZCBkb1JlcGxheSghMCk7KE0rPWMpPj1UJiYoY2xlYXJJbnRlcnZhbChkKSxmPjA/ZG9SZXBsYXkoITEpOihhR1RNLmQuZGxyZXBlYXRQb2xsaW5nPSExLGRiZygiZ2F0ZSBuZXZlciBzYXRpc2ZpZWQgd2l0aGluIGNhcCBhbmQgbm8gZmFsbGJhY2sgLSBub3RoaW5nIHJlcGVhdGVkOyBwb2xsaW5nIHJlbGVhc2VkIGZvciBhIGxhdGVyIGNhbGwiKSkpfX0sYyl9fX0sYUdUTS5mLmluaXQ9ZnVuY3Rpb24oKXshYUdUTS5jLmRlYnVnJiZhR1RNLmYub3B0b3V0KCl8fChhR1RNLmYuY29uZmlnKGFHVE0uYyksYUdUTS5jLmlmcmFtZVN1cHBvcnQmJmFHVE0uZC5pc19pZnJhbWU/KGFHVE0uZC5jb25zZW50Lmd0bUNvbnNlbnQ9ITAsYUdUTS5kLmNvbnNlbnQuaGFzUmVzcG9uc2U9ITAsYUdUTS5kLmNvbnNlbnQuZmVlZGJhY2s9IlBhZ2UgaXMgaUZyYW1lIixhR1RNLmQuaWZyYW1lLmlmTGlzdGVufHwoYUdUTS5kLmlmcmFtZS5pZkxpc3Rlbj0hMCx3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigibWVzc2FnZSIsYUdUTS5mLmlmSFNsaXN0ZW4pKSxhR1RNLmQuaW5pdHx8YUdUTS5mLmluamVjdCgpKToic3RyaW5nIj09dHlwZW9mIGFHVE0uYy5jbXAmJmFHVE0uYy5jbXA/Im5vbmUiPT1hR1RNLmMuY21wPyhhR1RNLmQuY29uc2VudD17Z3RtQ29uc2VudDohMCxoYXNSZXNwb25zZTohMCxmZWVkYmFjazoiTm8gQ29uc2VudCBDaGVjayBjb25maWd1cmVkIn0sYUdUTS5mLmluamVjdCgpKTooYUdUTS5mLmxvYWRfY2MoYUdUTS5jLmNtcCxhR1RNLmYuY29uc2VudF9saXN0ZW5lciksYUdUTS5mLmluaXRHVE0oITApKTooYUdUTS5mLmNvbnNlbnRfbGlzdGVuZXIoKSxhR1RNLmYuaW5pdEdUTSghMCkpLGFHVE0uZi5qc2Vycm9ycygpKX0sYUdUTS5mLmVuYz1mdW5jdGlvbihlLHQpe3ZhciBhPXQlNjMrMSxuPWJ0b2EodW5lc2NhcGUoZW5jb2RlVVJJQ29tcG9uZW50KGUpKSksbz0wOyI9Ij09PW4uY2hhckF0KG4ubGVuZ3RoLTEpJiZvKyssIj0iPT09bi5jaGFyQXQobi5sZW5ndGgtMikmJm8rKyxuPW4uc2xpY2UoMCxuLmxlbmd0aC1vKTtmb3IodmFyIHI9MT09PW8/In4iOjI9PT1vPyJ+fiI6IiIscz0iIixpPTA7aTxuLmxlbmd0aDtpKyspe3ZhciBjPSJBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWmFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6MDEyMzQ1Njc4OSsvIi5pbmRleE9mKG4uY2hhckF0KGkpKTtzKz1jPDA/bi5jaGFyQXQoaSk6IkFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU2Nzg5LV8iLmNoYXJBdCgoYythKSU2NCl9cmV0dXJuIG8/cy5zbGljZSgwLDMpK3Ircy5zbGljZSgzKTpzfSxhR1RNLmYueHNlbmQ9ZnVuY3Rpb24oZSx0LGEsbil7aWYoZSYmInN0cmluZyI9PXR5cGVvZiBlKXRyeXt2YXIgbyxyPW5ldyBYTUxIdHRwUmVxdWVzdDtyZXR1cm4gci5vcGVuKCJQT1NUIixlLCEwKSxyLnNldFJlcXVlc3RIZWFkZXIoIkNvbnRlbnQtVHlwZSIsImFwcGxpY2F0aW9uL2pzb24iKSxvPWEmJiJudW1iZXIiPT10eXBlb2YgbiYmbj49MT8neyJxIjoiJythR1RNLmYuZW5jKGFHVE0uZi5zU3RyZih0KSxuKSsnIn0nOid7ImUiOicrYUdUTS5mLnNTdHJmKHQpKyJ9IixyLnNlbmQobykscn1jYXRjaCh0KXtyZXR1cm4gYUdUTS5mLmxvZygiZV94c2VuZCIse21zZzp0Lm1lc3NhZ2UsdXJsOmV9KSxudWxsfX0sYUdUTS5mLnNlbmRuYXVzPWZ1bmN0aW9uKGUpe2lmKGUmJiJvYmplY3QiPT10eXBlb2YgZSl7dmFyIHQ9d2luZG93W2FHVE0uYy5nZGxdLnB1c2g7IWFHVE0uZC5vcmlnaW5hbERMcHVzaCYmL3NhbmRib3gvaS50ZXN0KHQudG9TdHJpbmcoKSkmJihhR1RNLmQub3JpZ2luYWxETHB1c2g9dCk7dmFyIGE9ITE7aWYoYUdUTS5jLmRsT3JnUHVzaCYmYUdUTS5kLm9yaWdpbmFsRExwdXNoJiZhR1RNLmQub3JpZ2luYWxETHB1c2ghPT10KXt2YXIgbj10LnRvU3RyaW5nKCk7L3NhbmRib3gvaS50ZXN0KG4pP2FHVE0uZC5vcmlnaW5hbERMcHVzaD10OihhPSEwLGFHVE0uZC5kbEhvb2tMb2dnZWR8fChhR1RNLmQub3JpZ2luYWxETHB1c2goe2V2ZW50OiJleGNlcHRpb24iLGVycnR5cGU6IkRMIEVycm9yIixlcnJtc2c6IkZ1bmN0aW9uIGRhdGFMYXllci5wdXNoIGhvb2tlZCAtIG5vIGxvbmdlciBmcm9tIEdUTSIsZmN0X2hvb2s6bixmY3Rfb3JpZzphR1RNLmQub3JpZ2luYWxETHB1c2gudG9TdHJpbmcoKSx0aW1lc3RhbXA6KG5ldyBEYXRlKS5nZXRUaW1lKCksZXZlbnRNb2RlbDpudWxsfSksYUdUTS5kLmRsSG9va0xvZ2dlZD0hMCksInJlc3RvcmUiPT09YUdUTS5jLmRsT3JnUHVzaCYmKHdpbmRvd1thR1RNLmMuZ2RsXS5wdXNoPWFHVE0uZC5vcmlnaW5hbERMcHVzaCxhPSExKSl9YSYmInVzZSI9PT1hR1RNLmMuZGxPcmdQdXNoP2FHVE0uZC5vcmlnaW5hbERMcHVzaChlKTp3aW5kb3dbYUdUTS5jLmdkbF0ucHVzaChlKSwiZnVuY3Rpb24iPT10eXBlb2YgYUdUTS5mLnNlbmRuYXVzX2NhbGxiYWNrJiZhR1RNLmYuc2VuZG5hdXNfY2FsbGJhY2soZSksYUdUTS5mLmxvZygibTkiLGUpfX0sYUdUTS5mLmZpcmU9ZnVuY3Rpb24oZSl7aWYoIm9iamVjdCI9PXR5cGVvZiBlJiZlKXt0cnl7aWYoIShhPUpTT04ucGFyc2UoYUdUTS5mLnNTdHJmKGUpKSkpcmV0dXJuIHZvaWQgYUdUTS5mLmxvZygiZTE1IixhKX1jYXRjaChuKXt2YXIgdD0iYUdUTSBGaXJlIEVycm9yIChKU09OLnBhcnNlKSI7InN0cmluZyI9PXR5cGVvZiBlLmV2ZW50JiYodD10KyIgKEV2ZW50OiAiK2UuZXZlbnQrIikiKTt2YXIgYT17ZXZlbnQ6ImV4Y2VwdGlvbiIsZXJybXNnOm4ubWVzc2FnZSxlcnJ0eXBlOnQsdGltZXN0YW1wOihuZXcgRGF0ZSkuZ2V0VGltZSgpLGVycmN0OmFHVE0uZC5lcnJvcl9jb3VudGVyfHwxLGV2ZW50TW9kZWw6bnVsbH07YUdUTS5mLmxvZygiZTE1IixhKX1pZighKCJudW1iZXIiPT10eXBlb2YgYS5hR1RNdHN8fCJvYmplY3QiPT10eXBlb2YgYS5ldmVudE1vZGVsJiZhLmV2ZW50TW9kZWx8fCJzdHJpbmciIT10eXBlb2YgYS5ldmVudCYmInN0cmluZyI9PXR5cGVvZiBhLnR5cGUmJiJvYmplY3QiPT10eXBlb2YgYS5mbGFncyYmImJvb2xlYW4iPT10eXBlb2YgYS5mbGFncy5lbmFibGVVbnRhZ2dlZFBhZ2VSZXBvcnRpbmcmJmEuZmxhZ3MuZW5hYmxlVW50YWdnZWRQYWdlUmVwb3J0aW5nKSl7aWYoYS5hR1RNdHM9RGF0ZS5ub3coKSxhLmV2ZW50TW9kZWw9bnVsbCxhR1RNLmMuY29uc2VudF9ldmVudHMmJiJzdHJpbmciPT10eXBlb2YgYS5ldmVudCYmKCIsIithR1RNLmMuY29uc2VudF9ldmVudHMrIiwiKS5pbmRleE9mKCIsIithLmV2ZW50KyIsIik+PTApaWYoIm9iamVjdCI9PXR5cGVvZiBhR1RNLmMuY29uc2VudF9ldmVudF9hdHRyW2EuZXZlbnRdKWZvcih2YXIgbiBpbiBhR1RNLmMuY29uc2VudF9ldmVudF9hdHRyW2EuZXZlbnRdKXZvaWQgMCE9PWFbbl0mJihhR1RNLmMuY29uc2VudF9ldmVudF9hdHRyW2EuZXZlbnRdW25dJiZhW25dIT1hR1RNLmMuY29uc2VudF9ldmVudF9hdHRyW2EuZXZlbnRdW25dfHxhR1RNLmYucnVuX2NjKCJ1cGRhdGUiKSk7ZWxzZSBhR1RNLmYucnVuX2NjKCJ1cGRhdGUiKTtpZihhR1RNLmMuZGxTZXQmJiJvYmplY3QiPT10eXBlb2YgZ29vZ2xlX3RhZ19tYW5hZ2VyJiYib2JqZWN0Ij09dHlwZW9mIGdvb2dsZV90YWdfbWFuYWdlclthR1RNLmMuZ3RtSURdJiZPYmplY3Qua2V5cyhhR1RNLmMuZGxTZXQpLmZvckVhY2goZnVuY3Rpb24oZSl7dmFyIHQ9YUdUTS5jLmRsU2V0W2VdLG49Z29vZ2xlX3RhZ19tYW5hZ2VyW2FHVE0uYy5ndG1JRF1bYUdUTS5jLmdkbF0uZ2V0KHQpO3ZvaWQgMCE9PW4mJihhW2VdPW4pfSksKCJvYmplY3QiIT10eXBlb2YgYUdUTS5kLmNvbnNlbnR8fCFhR1RNLmQuY29uc2VudC5oYXNSZXNwb25zZXx8IWFHVE0uZC5jb25zZW50Lmd0bUNvbnNlbnQpJiYoInN0cmluZyIhPXR5cGVvZiBhLmV2ZW50fHwwIT09YS5ldmVudC5pbmRleE9mKCJhR1RNIikpJiYhYS5fbm9Db25zZW50fHxhR1RNLmMuaWZyYW1lU3VwcG9ydCYmYUdUTS5kLmlzX2lmcmFtZSYmIWFHVE0uZC5pZnJhbWUub3JpZ2luKXJldHVybiBkZWxldGUgYS5hR1RNdHMsZGVsZXRlIGEuZXZlbnRNb2RlbCx2b2lkIGFHVE0uZC5mLnB1c2goSlNPTi5wYXJzZShhR1RNLmYuc1N0cmYoYSkpKTtpZihhLl9wb3N0JiYhYS5fcG9zdF9zZW50KXt2YXIgbz0ib2JqZWN0Ij09dHlwZW9mIGEuX3Bvc3Q/YS5fcG9zdDp7fSxyPSJzdHJpbmciPT10eXBlb2Ygby51cmwmJm8udXJsP28udXJsOmFHVE0uYy50cmFuc3BvcnRfdXJsO2lmKHIpe3ZhciBzPSJib29sZWFuIj09dHlwZW9mIG8uZW5jP28uZW5jOiEhYUdUTS5jLnRyYW5zcG9ydF9lbmMsaT0ibnVtYmVyIj09dHlwZW9mIG8uc2FsdCYmby5zYWx0Pj0xP28uc2FsdDoibnVtYmVyIj09dHlwZW9mIGFHVE0uYy50cmFuc3BvcnRfc2FsdCYmYUdUTS5jLnRyYW5zcG9ydF9zYWx0Pj0xP2FHVE0uYy50cmFuc3BvcnRfc2FsdDphR1RNLmMuc2Vzc2lvbl9zYWx0fHwwLGM9SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYoYSkpO2RlbGV0ZSBjLl9wb3N0LGRlbGV0ZSBjLl9wb3N0X3NlbnQsZGVsZXRlIGMuZXZlbnRNb2RlbCxvLmNvbnNlbnQmJiJvYmplY3QiPT10eXBlb2YgYUdUTS5kLmNvbnNlbnQmJihjLmNvbnNlbnQ9SlNPTi5wYXJzZShhR1RNLmYuc1N0cmYoYUdUTS5kLmNvbnNlbnQpKSksYUdUTS5mLnhzZW5kKHIsYyxzLGkpLGEuX3Bvc3Rfc2VudD0hMH19KGFHVE0uZC5jb25zZW50Lmd0bUNvbnNlbnR8fCJzdHJpbmciPT10eXBlb2YgYS5ldmVudCYmMD09PWEuZXZlbnQuaW5kZXhPZigiYUdUTSIpfHxhLl9ub0NvbnNlbnQpJiYoInN0cmluZyI9PXR5cGVvZiBhLmV2ZW50JiYwPT09YS5ldmVudC5pbmRleE9mKCJhR1RNIil8fChkZWxldGUgYVsiZ3RtLnVuaXF1ZUV2ZW50SWQiXSxkZWxldGUgYS5hR1RNcGFyYW1zLGEuYUdUTXBhcmFtcz1KU09OLnBhcnNlKGFHVE0uZi5zU3RyZihhKSkpLGFHVE0uZC5kbC5wdXNoKGEpLGEuX25vRExQdXNoPyJmdW5jdGlvbiI9PXR5cGVvZiBhR1RNLmYuc2VuZG5hdXNfY2FsbGJhY2smJmFHVE0uZi5zZW5kbmF1c19jYWxsYmFjayhhKTphR1RNLmMuaWZyYW1lU3VwcG9ydCYmYUdUTS5kLmlzX2lmcmFtZSYmInN0cmluZyI9PXR5cGVvZiBhLmV2ZW50P2FHVE0uZi5pRnJhbWVGaXJlKGEpOmFHVE0uZi5zZW5kbmF1cyhhKSksImZ1bmN0aW9uIj09dHlwZW9mIGFHVE0uZi5maXJlX2NhbGxiYWNrJiZhR1RNLmYuZmlyZV9jYWxsYmFjayhhKSxhR1RNLmYubG9nKCJtNyIsYSl9fWVsc2UgYUdUTS5mLmxvZygiZTkiLHtvOnR5cGVvZiBlfSl9Ow==');
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
    // to the Session API. (A cross-origin consent POST does not arrive at all —
    // F-160.)
    // Stricter than the POST handler, which deletes on any !granted: only
    // POSITIVE evidence counts here — an authoritative answer, a real CMP
    // decision (hasResponse, not the auto-denial block, an explicit signal)
    // that does not grant the required consent. No record, an outage or an
    // auto-denial say nothing about this visitor and leave the cookie alone —
    // deleting on ignorance would drop the ids of real visitors whose consent
    // simply is not on file. With no consent requirement configured,
    // hasRequiredConsent() is true and this never fires. Three of the terms
    // (sessionRead.ok, hasResponse, existingCookie) are already implied by the
    // pass-through filter further down and kept as defence in depth.
    const sessionConsentRevoked = CFG.cookieMode === 'consent' && !!existingCookie && sessionRead.ok && !!sessionConsent && sessionConsent.hasResponse === true && !sessionIsAutoDenial && sessionHasExplicitSignal && !hasRequiredConsent(sessionConsent.services || '', sessionConsent.purposes || '', sessionConsent.vendors || '');

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
          // saw a CMP (F-156). The auto-denial branch is excluded for the same
          // reason and is NOT a safe fallback: it sets gtmConsent from
          // autoDenyLoadGtm, which defaults to true, so it would load GTM too.
          // A cookie-bound uid keeps both branches — including an F.* cookie,
          // which IS per-browser (it sits in that browser) and still needs the
          // consent for the lazy F→C promote below. What stays open: the
          // consent is still PERSISTED under the shared fingerprint key when no
          // cookie exists, so the record can still be written by whoever gets
          // there first. Closing that is a separate step (F-156 option B).
          const uidIsBrowserBound = !!existingCookie;
          if (r.consent && typeof r.consent === 'object' && r.consent.hasResponse === true && uidIsBrowserBound) {
            sd.consent = r.consent;
            if (CFG.debug) logToConsole('debug', '✓ Session API returned stored consent', sd.consent);
          } else if (!uidIsBrowserBound) {
            if (CFG.debug) logToConsole('debug', '↷ No consent preset: uid is a shared fingerprint, not cookie-bound — the CMP decides');
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

