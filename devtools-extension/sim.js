/**
 * aGTM Inspector — Simulation tab (OPT-IN WRITE channel).
 *
 * ⚠ POSTURE NOTE — read this before touching the file:
 * Every OTHER part of the Inspector is strictly READ-ONLY: reader.js is a pure
 * snapshot expression and the manifest declares no permissions. This tab is the
 * ONE deliberate exception — it DRIVES the inspected page (fires events, sets
 * consent, forces GTM injection, mocks the CMP). It does so through the SAME
 * chrome.devtools.inspectedWindow.eval() bridge (no new Chrome permission is
 * needed — eval can already mutate the page), but with MUTATING expressions
 * instead of reader.js's read-only snapshot.
 *
 * The read-only heritage is preserved by two guards:
 *   1. reader.js is untouched and stays a pure reader. All writes live HERE, in
 *      their own eval calls, clearly separated from the snapshot poll.
 *   2. Nothing writes to the page until the user flips the per-session
 *      "Write-Modus" toggle (default OFF, never persisted — off again on every
 *      panel open). With the toggle off this tab is as read-only as the rest.
 *
 * The injected code strings are ES5-safe on purpose (they run in whatever the
 * inspected page supports, mirroring reader.js). The panel-side code may use
 * ES6, but we keep the panel.js var/function style for consistency.
 *
 * Pure, page-independent code builders are exposed on window.aGTMInspectorSim
 * so test/devtools/sim.test.js can unit-test the generated strings without a
 * browser. The render/interaction layer defines the global renderSim() that
 * panel.js dispatches to.
 */
"use strict";

/* ==================================================================== *
 *  Pure code builders (testable — window.aGTMInspectorSim)             *
 * ==================================================================== */
(function () {
  var SIM = {};

  // JSON-embed a value into a code string. JSON is a valid JS expression, so a
  // stringified object/array/string can be pasted straight into the source.
  function J(x) { try { return JSON.stringify(x); } catch (e) { return "null"; } }
  SIM.J = J;

  // Turn a token list into aGTM's comma-WRAPPED consent string: ,a,b, — the exact
  // shape aGTM.f.chelp() matches against (given_cons.indexOf("," + need + ",")).
  // Empty / whitespace tokens are dropped; an empty list yields "" (all denied).
  function commaWrap(tokens) {
    var out = [];
    tokens = tokens || [];
    for (var i = 0; i < tokens.length; i++) {
      var t = (tokens[i] === null || typeof tokens[i] === "undefined") ? "" : String(tokens[i]);
      t = t.replace(/^\s+|\s+$/g, "");
      if (t) out.push(t);
    }
    return out.length ? "," + out.join(",") + "," : "";
  }
  SIM.commaWrap = commaWrap;

  // Wrap a mutating body into a self-invoking, fully try/catch'd expression that
  // ALWAYS returns a small serialisable effect object the panel reads back to show
  // the immediate result (before the next 700ms snapshot poll catches up).
  // `extra` (optional) is a trailing "key:val," fragment spliced into the returned
  // object literal so a builder can surface scenario-specific fields (e.g. how many
  // events were queued) computed from temp vars declared in `body`.
  function wrap(body, extra) {
    extra = extra || "";
    return "(function(){try{" +
      "var w=window;if(!w.aGTM||!w.aGTM.f||!w.aGTM.d)return{ok:false,error:'aGTM not present on this page'};" +
      "var A=w.aGTM;" +
      body +
      "var c=A.d.consent||{};" +
      "return{ok:true," + extra + "gtmConsent:!!c.gtmConsent,hasResponse:!!c.hasResponse,init:!!A.d.init," +
      "services:c.services||'',purposes:c.purposes||'',vendors:c.vendors||''," +
      "serviceIDs:c.serviceIDs||'',vendorIDs:c.vendorIDs||'',purposeIDs:c.purposeIDs||''," +
      "feedback:c.feedback||''," +
      "simActive:typeof A.f.__inspOrigCC==='function'," +
      "blocked:!!A.d.__inspBlocked," +
      "dataLayerLen:((w[(A.c&&A.c.gdl)||'dataLayer']||[]).length)||0};" +
      "}catch(e){return{ok:false,error:String(e)};}})()";
  }
  SIM.wrap = wrap;

  // Body that installs a consent_check STUB returning the given granular consent.
  // The original check is backed up ONCE under aGTM.f.__inspOrigCC (so Restore can
  // undo it). The stub keeps the same 'init' short-circuit as real checks.
  function stubBody(sel) {
    sel = sel || {};
    // Back up the TRUE original consent_check. If a block is currently active, the real
    // check lives in __inspBlockBak (the live consent_check is the block's `return false`
    // noop) — capture that, else a Block→Grant→Unblock→Restore sequence would restore the
    // noop and permanently deny consent (critic P3).
    return "A.f.__inspOrigCC=A.f.__inspOrigCC||(A.f.__inspBlockBak?A.f.__inspBlockBak.consent_check:A.f.consent_check);" +
      "A.f.consent_check=function(action){A.d.consent=A.d.consent||{};" +
      "if(action=='init'&&A.d.consent.hasResponse)return true;" +
      "A.d.consent.purposes=" + J(commaWrap(sel.purposes)) + ";" +
      "A.d.consent.services=" + J(commaWrap(sel.services)) + ";" +
      "A.d.consent.vendors=" + J(commaWrap(sel.vendors)) + ";" +
      "A.d.consent.purposeIDs=" + J(commaWrap(sel.purposeIDs)) + ";" +
      "A.d.consent.serviceIDs=" + J(commaWrap(sel.serviceIDs)) + ";" +
      "A.d.consent.vendorIDs=" + J(commaWrap(sel.vendorIDs)) + ";" +
      "A.d.consent.feedback='aGTM Inspector simulation';" +
      "A.d.consent.hasResponse=true;return true;};";
  }
  SIM.stubBody = stubBody;

  // Grant/deny: install the stub for `sel`, then run_cc('update'). run_cc does the
  // B2 field-reset, calls our stub, derives gtmConsent via chelp, and — when the
  // consent hash changed and GTM isn't injected yet — calls inject() itself
  // (aGTM.js run_cc, action==='update'). Deny is just the same with empty lists.
  function buildConsentCode(sel) {
    return wrap(stubBody(sel) + "A.f.run_cc('update');");
  }
  SIM.buildConsentCode = buildConsentCode;

  // Deny everything: empty selection → all consent strings "" → gtmConsent false.
  function buildDenyCode() {
    return buildConsentCode({ purposes: [], services: [], vendors: [] });
  }
  SIM.buildDenyCode = buildDenyCode;

  // Reset aGTM's consent STATE for observation and restore the original CMP check.
  // NOTE: cannot un-inject an already-loaded GTM (the <script> is in the DOM). A
  // true first-visit re-test needs a cookie clear + reload — see the tab's hint.
  function buildResetCode() {
    return wrap(
      "if(typeof A.f.__inspOrigCC==='function'){A.f.consent_check=A.f.__inspOrigCC;try{delete A.f.__inspOrigCC;}catch(e){A.f.__inspOrigCC=undefined;}}" +
      "A.d.consent={gtmConsent:false,hasResponse:false,feedback:'aGTM Inspector reset'};" +
      "A.d.last_consent_hash='';"
    );
  }
  SIM.buildResetCode = buildResetCode;

  // Restore the original consent_check without wiping consent state.
  function buildRestoreCode() {
    return wrap(
      "if(typeof A.f.__inspOrigCC==='function'){A.f.consent_check=A.f.__inspOrigCC;try{delete A.f.__inspOrigCC;}catch(e){A.f.__inspOrigCC=undefined;}}"
    );
  }
  SIM.buildRestoreCode = buildRestoreCode;

  // Fire an event through aGTM.f.fire(). `obj` is the (already validated) event
  // object; `flags` toggles the per-event bypass flags. JSON is a valid JS
  // expression so the object literal embeds directly.
  function buildFireCode(obj, flags) {
    obj = (obj && typeof obj === "object") ? obj : {};
    flags = flags || {};
    var merged = {};
    for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) merged[k] = obj[k];
    if (flags._noConsent) merged._noConsent = true;
    if (flags._noDLPush) merged._noDLPush = true;
    if (flags._post) merged._post = true;
    return wrap("A.f.fire(" + J(merged) + ");");
  }
  SIM.buildFireCode = buildFireCode;

  // Force GTM container load INDEPENDENT of consent. aGTM.f.inject() is itself
  // consent-gated (returns false unless aGTM.d.consent.hasResponse, and only loads
  // containers when gtmConsent — aGTM.js:1186/1210), so calling it here would be a
  // silent no-op in every reachable sim state. To genuinely force a load we call
  // aGTM.f.initGTM(false) directly (loads every container regardless of consent —
  // aGTM.js:1119) and mark aGTM.d.init. Falls back to inject() only if initGTM is
  // absent (very old library). Reports what it did so the effect panel is honest.
  function buildInjectCode() {
    return wrap(
      // Both initGTM and inject need a loaded config; report honestly if aGTM isn't init'd
      // yet (otherwise we'd mark init=true over a silent no-op).
      "if(!A.d.config)return{ok:false,error:'aGTM nicht initialisiert (aGTM.d.config fehlt) - erst aGTM.f.init() ausfuehren.'};" +
      "if(typeof A.f.initGTM==='function'){A.f.initGTM(false);A.d.init=true;}" +
      "else if(typeof A.f.inject==='function'){var _r=A.f.inject();if(_r===false)return{ok:false,error:'inject() vom Consent-Gate abgelehnt (hasResponse/gtmConsent) - und initGTM fehlt.'};}" +
      "else return{ok:false,error:'aGTM.f.initGTM/inject fehlen.'};"
    );
  }
  SIM.buildInjectCode = buildInjectCode;

  // Read-only probe: is a simulation stub / block currently installed on the page?
  function buildProbeCode() {
    return "(function(){try{var A=window.aGTM;return{simActive:!!(A&&A.f&&typeof A.f.__inspOrigCC==='function'),blocked:!!(A&&A.d&&A.d.__inspBlocked)};}catch(e){return{simActive:false,blocked:false};}})()";
  }
  SIM.buildProbeCode = buildProbeCode;

  // Block an existing aGTM integration: neutralise its loaders and consent check so
  // it can't (further) inject GTM, then a fresh integration can be tested in
  // isolation. Originals are backed up under aGTM.f.__inspBlockBak (restorable via
  // buildUnblockCode). NOTE: cannot un-inject a GTM that already loaded — the caveat
  // is surfaced in the tab.
  function buildBlockCode() {
    return wrap(
      "A.f.__inspBlockBak=A.f.__inspBlockBak||{inject:A.f.inject,initGTM:A.f.initGTM,gtm_load:A.f.gtm_load,consent_check:A.f.consent_check};" +
      "var noop=function(){};A.f.inject=noop;A.f.initGTM=noop;A.f.gtm_load=noop;" +
      "A.f.consent_check=function(){return false;};" +
      "A.d.__inspBlocked=true;"
    );
  }
  SIM.buildBlockCode = buildBlockCode;

  // Undo buildBlockCode: restore the neutralised functions.
  function buildUnblockCode() {
    return wrap(
      "if(A.f.__inspBlockBak){var b=A.f.__inspBlockBak;A.f.inject=b.inject;A.f.initGTM=b.initGTM;A.f.gtm_load=b.gtm_load;A.f.consent_check=b.consent_check;try{delete A.f.__inspBlockBak;}catch(e){A.f.__inspBlockBak=undefined;}}" +
      "try{delete A.d.__inspBlocked;}catch(e2){A.d.__inspBlocked=false;}"
    );
  }
  SIM.buildUnblockCode = buildUnblockCode;

  // Inject a pasted aGTM integration snippet into a page that has no aGTM yet (for
  // prospect demos). Runs the code at GLOBAL scope via a <script> element (so a bare
  // `var aGTM = …` / `aGTM.f.init()` behaves exactly as in a real integration —
  // wrapping it in a function would scope those away). Does NOT use aGTM, so it also
  // works when window.aGTM is absent.
  function buildInjectIntegrationCode(code) {
    return "(function(){try{" +
      "var d=(typeof document!=='undefined')?document:null;if(!d)return{ok:false,error:'no document'};" +
      "var s=d.createElement('script');s.type='text/javascript';s.text=" + J(String(code == null ? "" : code)) + ";" +
      "(d.head||d.documentElement).appendChild(s);" +
      "return{ok:true,injected:true,loaded:!!(window.aGTM&&window.aGTM.d)};" +
      "}catch(e){return{ok:false,error:String(e)};}})()";
  }
  SIM.buildInjectIntegrationCode = buildInjectIntegrationCode;

  /* ---- Card #50: Simulation-tab extra features ---------------------- */

  // The seven Google Consent Mode signal keys, in Google's canonical order.
  var GCM_SIGNALS = ["ad_storage", "analytics_storage", "ad_user_data",
    "ad_personalization", "functionality_storage", "personalization_storage",
    "security_storage"];
  SIM.GCM_SIGNALS = GCM_SIGNALS;

  // The three gtag consent verbs we can push. 'update' revises consent at any time;
  // 'default' seeds the pre-consent baseline and 'declare' announces an already-known
  // state — both of those are only read while the Google tag has not yet processed its
  // consent state, hence the timing guard below (card #51).
  var GCM_MODES = ["update", "default", "declare"];
  SIM.GCM_MODES = GCM_MODES;

  // (1) Push a Google Consent Mode command straight to the (GTM) dataLayer, exactly
  // like gtag('consent',<mode>,{…}) does — so GCM signals can be tested even when
  // aGTM is not on the page. The push carries a GENUINE `arguments` object (built via
  // an IIFE), which is what Google's tag reads; a plain array would NOT be treated as
  // a gtag command. `signals` maps a GCM key → 'granted'|'denied' (others dropped).
  // `gdlHint` (optional) overrides the dataLayer name; otherwise aGTM.c.gdl, else
  // 'dataLayer'. Independent of aGTM → its own wrapper (not wrap()).
  //
  // `opts` (card #51):
  //   mode          'update' (default) | 'default' | 'declare'
  //   waitForUpdate number → wait_for_update (ms); 'default' only, per Google's API
  //   regions       array of region codes → region: [...]; 'default' only
  //   force         push a late default/declare anyway (the guard reports, not blocks)
  //
  // TIMING GUARD — the point of the whole feature. 'default'/'declare' are only read
  // BEFORE the Google tag evaluates consent; afterwards the push lands in the dataLayer
  // and changes nothing, which would make a success message a lie (the F-84/F-90 class
  // of bug: a button that reports success while silently no-op'ing). We detect "too
  // late" via google_tag_data.ics (published once the tag processed consent) or, on an
  // aGTM page, aGTM.d.init === true (GTM injected). On a typical aGTM page BOTH are
  // false until consent is given — which is exactly why a default push is useful here.
  // 'update' is never guarded: revising consent later is precisely its purpose.
  function buildGcmPushCode(signals, gdlHint, opts) {
    signals = signals || {};
    opts = opts || {};
    var mode = opts.mode;
    if (GCM_MODES.indexOf(mode) < 0) mode = "update";
    var sig = {};
    for (var i = 0; i < GCM_SIGNALS.length; i++) {
      var k = GCM_SIGNALS[i], v = signals[k];
      if (v === "granted" || v === "denied") sig[k] = v;
    }
    // wait_for_update / region are 'default'-only in Google's API — silently sending
    // them with update/declare would suggest an effect that does not exist.
    var extra = {};
    if (mode === "default") {
      var wfu = Number(opts.waitForUpdate);
      if (isFinite(wfu) && wfu > 0) extra.wait_for_update = Math.round(wfu);
      var regs = [], src = opts.regions || [];
      for (var r = 0; r < src.length; r++) {
        var t = (src[r] === null || typeof src[r] === "undefined") ? "" : String(src[r]);
        t = t.replace(/^\s+|\s+$/g, "");
        if (t) regs.push(t.toUpperCase());
      }
      if (regs.length) extra.region = regs;
    }
    var guarded = (mode !== "update") && !opts.force;
    return "(function(){try{" +
      "var w=window;" +
      "var dl=" + J(gdlHint || "") + "||(w.aGTM&&w.aGTM.c&&w.aGTM.c.gdl)||'dataLayer';" +
      "var mode=" + J(mode) + ";" +
      "var ics=!!(w.google_tag_data&&w.google_tag_data.ics);" +
      "var injected=!!(w.aGTM&&w.aGTM.d&&w.aGTM.d.init);" +
      // aGTM.d.init only covers the consent-gated load. noConsent containers
      // (initGTM(true)) and the tab's own container-override (gtm_load) put GTM on the
      // page WITHOUT setting it — google_tag_manager catches those too.
      "var gtmObj=!!w.google_tag_manager;" +
      "var late=ics||injected||gtmObj;" +
      (guarded
        ? "if(late)return{ok:false,pushed:false,mode:mode,late:true,ics:ics,injected:injected,gtmObj:gtmObj," +
          "error:\"'\"+mode+\"' kommt zu spät: \"+(ics?'Das Google-Tag hat den Consent-Zustand bereits verarbeitet (google_tag_data.ics)':(injected?'aGTM hat den consent-gesteuerten Load bereits ausgeführt (aGTM.d.init)':'Es ist bereits ein GTM-Container auf der Seite (google_tag_manager)'))+\". Jetzt wirkt nur noch 'update'. Für einen echten Test: Cookies zurücksetzen + neu laden — oder 'trotzdem pushen' ankreuzen.\"};"
        : "") +
      // Only AFTER the guard — a refused push must not touch the page at all (it would
      // otherwise create window[dl] as a side effect of being rejected).
      "w[dl]=w[dl]||[];" +
      "var sig=" + J(sig) + ";" +
      "var cmd=" + J(extra) + ";" +
      "for(var q in cmd){if(Object.prototype.hasOwnProperty.call(cmd,q))sig[q]=cmd[q];}" +
      "(function(){w[dl].push(arguments);})('consent',mode,sig);" +
      "return{ok:true,pushed:true,mode:mode,late:late,ics:ics,injected:injected,gtmObj:gtmObj," +
      "signals:sig,dataLayer:dl,dataLayerLen:(w[dl].length)||0};" +
      "}catch(e){return{ok:false,error:String(e)};}})()";
  }
  SIM.buildGcmPushCode = buildGcmPushCode;

  // (2) Clear consent cookies (and optionally matching localStorage keys) for a real
  // first-visit re-test, then optionally reload. A cookie is deleted only when its
  // name CONTAINS one of `patterns` (case-sensitive substring) — an EMPTY pattern list
  // means "match every cookie" (nuclear, surfaced in the UI). Each match is expired
  // across the '/' + current-path × ('' + every parent domain) grid so host-only and
  // domain cookies both die. opts: {clearStorage, reload}. Independent of aGTM.
  function buildCookieResetCode(patterns, opts) {
    opts = opts || {};
    var pats = [];
    patterns = patterns || [];
    for (var i = 0; i < patterns.length; i++) {
      var t = (patterns[i] === null || typeof patterns[i] === "undefined") ? "" : String(patterns[i]);
      t = t.replace(/^\s+|\s+$/g, "");
      if (t) pats.push(t);
    }
    return "(function(){try{" +
      "var w=window,d=w.document,loc=w.location;if(!d||!loc)return{ok:false,error:'no document/location'};" +
      "var pats=" + J(pats) + ";" +
      // Matching: a plain fragment is a SUBSTRING match (unchanged), and `*` acts as a
      // wildcard so a pattern can be anchored — "__cmp*" = starts with, "*consent" = ends
      // with, "__cmp*45430" = both ends fixed. Everything else in the pattern is escaped,
      // so a dot in "_ga.foo" stays literal instead of matching any character.
      "function toRe(p){var e=p.replace(/[.+?^${}()|[\\]\\\\]/g,'\\\\$&').replace(/\\*/g,'[\\\\s\\\\S]*');" +
      "return new RegExp(p.indexOf('*')<0?e:('^'+e+'$'));}" +
      "var res=[];for(var pi=0;pi<pats.length;pi++){try{res.push(toRe(pats[pi]));}catch(er0){}}" +
      "function match(n){if(!res.length)return true;for(var i=0;i<res.length;i++){if(res[i].test(n))return true;}return false;}" +
      "var raw=(d.cookie||'').split(';');var names=[];" +
      "for(var r=0;r<raw.length;r++){var nm=raw[r].split('=')[0].replace(/^\\s+|\\s+$/g,'');if(nm&&match(nm)&&names.indexOf(nm)<0)names.push(nm);}" +
      "var host=String(loc.hostname||'').split('.');var domains=[''];" +
      "for(var h=0;h<host.length-1;h++){var dd=host.slice(h).join('.');domains.push('; domain='+dd);domains.push('; domain=.'+dd);}" +
      "var paths=['/'];var pp=loc.pathname||'/';if(paths.indexOf(pp)<0)paths.push(pp);" +
      "var exp='=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=';" +
      "for(var n=0;n<names.length;n++){for(var p=0;p<paths.length;p++){for(var q=0;q<domains.length;q++){try{d.cookie=names[n]+exp+paths[p]+domains[q];}catch(ec){}}}}" +
      "var lsCleared=0;" +
      (opts.clearStorage ? "try{var ls=w.localStorage;if(ls){var rm=[];for(var k=0;k<ls.length;k++){var key=ls.key(k);if(key&&match(key))rm.push(key);}for(var m=0;m<rm.length;m++){ls.removeItem(rm[m]);}lsCleared=rm.length;}}catch(el){}" : "") +
      "var out={ok:true,cleared:names,clearedCount:names.length,lsCleared:lsCleared};" +
      (opts.reload ? "out.reloading=true;try{if(typeof w.setTimeout==='function'){w.setTimeout(function(){try{loc.reload();}catch(e2){}},80);}else{loc.reload();}}catch(er){}" : "") +
      "return out;" +
      "}catch(e){return{ok:false,error:String(e)};}})()";
  }
  SIM.buildCookieResetCode = buildCookieResetCode;

  // (3) Scenario runner — one eval that walks the whole consent lifecycle so the user
  // watches deny → queued events → grant → inject+replay in a single click. Faithful to
  // the library path: a deny stub + run_cc('update') (GTM stays out), then fire() every
  // event (held in aGTM.d.f because there's no consent), then the grant stub for `sel` +
  // run_cc('update') which — on the consent change — injects GTM and replays the queue.
  // Surfaces queued/fired counts via wrap()'s `extra` so the effect panel proves the
  // events were actually parked before the grant.
  function buildScenarioCode(sel, events) {
    sel = sel || {};
    events = (events && events.length) ? events : [];
    var body =
      // Capture init BEFORE the run so we can tell "just injected" from "was already
      // injected" — on an already-injected page run_cc's inject()-once guard means the
      // grant step neither injects nor replays, so the queued events would be orphaned.
      "var _pre=!!A.d.init;" +
      stubBody({}) + "A.f.run_cc('update');" +
      // Delta against the queue length BEFORE our fires, so a pre-existing pre-consent
      // backlog in aGTM.d.f isn't counted as "queued by this scenario" (critic P3).
      "var _q0=(A.d.f&&A.d.f.length)||0;" +
      "var _evs=" + J(events) + ";for(var _i=0;_i<_evs.length;_i++){try{A.f.fire(_evs[_i]);}catch(_e){}}" +
      "var _q=((A.d.f&&A.d.f.length)||0)-_q0;if(_q<0)_q=0;" +
      stubBody(sel) + "A.f.run_cc('update');";
    return wrap(body, "scenario:{firedEvents:_evs.length,queuedWhileDenied:_q,alreadyInjected:_pre},");
  }
  SIM.buildScenarioCode = buildScenarioCode;

  // (4) Consent-store POST test — deliberately exercise the /aGTMconsent path. Installs
  // the `sel` stub, then blanks aGTM.d.consent_hash so run_cc('update')'s end-of-success
  // diff is GUARANTEED to differ from the stored hash → the real aGTM.f.xsend() POST to
  // consent_store_url fires (with its genuine onreadystatechange handler). No POST is
  // synthesised here — the library does it. Reports the URL (and errors out cleanly when
  // no consent_store_url is configured, since then there is nothing to hit).
  function buildConsentStoreTestCode(sel) {
    sel = sel || {};
    var body =
      "if(!A.c||!A.c.consent_store_url)return{ok:false,error:'consent_store_url ist nicht konfiguriert - kein /aGTMconsent-Endpunkt gesetzt.'};" +
      stubBody(sel) +
      "A.d.consent_hash='';" +
      "A.f.run_cc('update');";
    return wrap(body, "consentStoreUrl:(A.c&&A.c.consent_store_url)||'',");
  }
  SIM.buildConsentStoreTestCode = buildConsentStoreTestCode;

  // Load one or more GTM containers DIRECTLY via aGTM.f.gtm_load — independent of consent
  // and of the integration config. Lets a live page be pointed at a staging/demo container
  // without editing the real config (pairs with block). Each id is registered into
  // aGTM.c.gtm (marked hasLoaded so a later initGTM won't reload it) and injected with the
  // same call shape initGTM uses (aGTM.js:1127). Does NOT touch the configured containers'
  // load state, so the normal consent flow for those still works.
  function buildLoadContainerCode(ids) {
    ids = ids || [];
    return wrap(
      "if(typeof A.f.gtm_load!=='function')return{ok:false,error:'aGTM.f.gtm_load fehlt.'};" +
      // gtm_load no-ops (logs e7) when aGTM isn't initialised (aGTM.js:997) — bail honestly
      // instead of reporting a load that didn't happen (and marking hasLoaded).
      "if(!A.d.config)return{ok:false,error:'aGTM nicht initialisiert (aGTM.d.config fehlt) - erst aGTM.f.init() ausfuehren.'};" +
      "A.c=A.c||{};A.c.gtm=A.c.gtm||{};var _gdl=A.c.gdl||'dataLayer';" +
      "var _ids=" + J(ids) + ";var _loaded=[];" +
      "for(var _i=0;_i<_ids.length;_i++){var _id=(_ids[_i]==null?'':(''+_ids[_i])).replace(/^\\s+|\\s+$/g,'');if(!_id)continue;" +
        "if(!A.c.gtm[_id]||typeof A.c.gtm[_id]!=='object')A.c.gtm[_id]={};" +
        "A.c.gtm[_id].hasLoaded=true;" +
        "A.f.gtm_load(window,document,_id,(A.c.gtm[_id].idParam||''),_gdl,A.c.gtm[_id]);" +
        "_loaded.push(_id);}" +
      "if(!_loaded.length)return{ok:false,error:'Keine gültige Container-ID angegeben.'};",
      "loadedContainers:_loaded,"
    );
  }
  SIM.buildLoadContainerCode = buildLoadContainerCode;

  // Split a comma list (plain "a, b" from config OR comma-wrapped ",a,b," from
  // consent) into trimmed non-empty tokens.
  function splitTokens(str) {
    if (typeof str !== "string" || !str) return [];
    var out = [];
    var parts = str.split(",");
    for (var i = 0; i < parts.length; i++) {
      var t = parts[i].replace(/^\s+|\s+$/g, "");
      if (t) out.push(t);
    }
    return out;
  }
  SIM.splitTokens = splitTokens;

  if (typeof window !== "undefined") window.aGTMInspectorSim = SIM;
  if (typeof module !== "undefined" && module.exports) module.exports = SIM;
})();

/* ==================================================================== *
 *  Render / interaction layer (global renderSim, dispatched by panel)  *
 * ==================================================================== */

// Per-session write toggle — deliberately NOT persisted: every panel open starts
// read-only. state.sim (persisted subset) holds the consent builder + presets.
var SIM_WRITE = false;
var SIM_LS = "aGTMInspector.sim";
var SIM_LAST = null; // last write action result {ok,...} for the effect panel
var SIM_LAST_LS = "aGTMInspector.simLast";
// What the third-party-frame pass removed, folded into the next effect line.
var SIM_FRAME_EXTRA = null;
// The cookie reset reloads the page ~80 ms after it ran, which is exactly when its
// result would be shown — so the most important feedback ("which cookies went?") was
// gone before it could be read. Persist the last result briefly and restore it on the
// next render, so it survives the reload it triggered itself.
function simLastSave() {
  try {
    if (typeof localStorage === "undefined" || !SIM_LAST) return;
    localStorage.setItem(SIM_LAST_LS, JSON.stringify(SIM_LAST));
  } catch (e) { /* ignore */ }
}
function simLastRestore() {
  try {
    if (typeof localStorage === "undefined") return;
    var raw = localStorage.getItem(SIM_LAST_LS);
    if (!raw) return;
    var v = JSON.parse(raw);
    // Only a RECENT result — an hour-old message would be misleading noise.
    if (v && typeof v === "object" && v.ts && (nowMs() - v.ts) < 30000) SIM_LAST = v;
    localStorage.removeItem(SIM_LAST_LS);
  } catch (e) { /* ignore */ }
}

// Default GCM signal map: a denied-by-default baseline (storage that needs consent is
// denied; the two always-allowed functional/security signals granted) — the safe start
// for a first-visit consent test.
function simDefaultGcm() {
  return {
    ad_storage: "denied", analytics_storage: "denied", ad_user_data: "denied",
    ad_personalization: "denied", functionality_storage: "granted",
    personalization_storage: "denied", security_storage: "granted"
  };
}
// Curated default cookie-name fragments for the reset box. Matching is a plain
// substring test, so PREFIXES are the efficient form: "__cmp" covers Consentmanager's
// whole family (__cmpconsent<id>, __cmpccu<id>, __cmpcvcx…), which the earlier entry
// "cmpsettings" did NOT match — Consentmanager sites were silently unaffected by a
// reset (found on victors.de, 2026-07-27). `_tpf` is aGTM's own user-id cookie;
// the "aGTM"/"agtm" fragments do NOT match it.
var SIM_COOKIE_DEFAULT = "__cmp,CookieConsent,OptanonConsent,OptanonAlertBoxClosed,borlabs-cookie,klaro,cookiefirst,cmplz_,cookieyes,didomi,osano,TERMLY,cc_cookie,mtm_consent,_tracking_consent,cmpsettings,consentUUID,euconsent-v2,ucData,uc_settings,ccm_consent,_iub_cs,_tpf,aGTM,agtm";
// Earlier default lists. A user who never edited the field still carries the old string
// in localStorage, so an exact match is lifted to the current default instead of
// leaving them with a list that misses their CMP.
var SIM_COOKIE_DEFAULTS_PAST = [
  "CookieConsent,OptanonConsent,OptanonAlertBoxClosed,borlabs-cookie,klaro,cookiefirst,cmpsettings,consentUUID,euconsent-v2,ucData,uc_settings,ccm_consent,_iub_cs,aGTM,agtm",
  "__cmp,CookieConsent,OptanonConsent,OptanonAlertBoxClosed,borlabs-cookie,klaro,cookiefirst,cmplz_,cookieyes,didomi,osano,TERMLY,cc_cookie,mtm_consent,_tracking_consent,cmpsettings,consentUUID,euconsent-v2,ucData,uc_settings,ccm_consent,_iub_cs,aGTM,agtm"
];

function simState() {
  if (!state.sim) state.sim = { consent: null, presets: [], events: [], fireText: "", flags: {}, injectCode: "", blockIntent: false, active: false, host: null, _blockApplying: false, gcm: simDefaultGcm(), gcmMode: "update", gcmWait: "", gcmRegions: "", cookiePats: SIM_COOKIE_DEFAULT, cookieReload: true, cookieLS: false, cookieFrames: true, scenarioText: "", containerIds: "" };
  return state.sim;
}

/* ---------- persistence (per host) ---------- */
function simLoad(host) {
  var st = simState();
  st.host = host;
  st.consent = null; st.presets = []; st.events = []; st.fireText = ""; st.flags = {}; st.injectCode = ""; st.blockIntent = false;
  st.gcm = simDefaultGcm(); st.gcmMode = "update"; st.gcmWait = ""; st.gcmRegions = "";
  st.gcmForce = false; // never persisted — see the force checkbox handler
  st.cookiePats = SIM_COOKIE_DEFAULT; st.cookieReload = true; st.cookieLS = false; st.cookieFrames = true; st.scenarioText = ""; st.containerIds = "";
  try {
    if (typeof localStorage === "undefined") return;
    var all = JSON.parse(localStorage.getItem(SIM_LS) || "{}");
    var e = all && all[host];
    if (e && typeof e === "object") {
      if (e.consent && typeof e.consent === "object") st.consent = e.consent;
      if (Object.prototype.toString.call(e.presets) === "[object Array]") st.presets = e.presets;
      if (Object.prototype.toString.call(e.events) === "[object Array]") st.events = e.events;
      if (typeof e.fireText === "string") st.fireText = e.fireText;
      if (e.flags && typeof e.flags === "object") st.flags = e.flags;
      if (typeof e.injectCode === "string") st.injectCode = e.injectCode;
      if (typeof e.blockIntent === "boolean") st.blockIntent = e.blockIntent;
      if (e.gcm && typeof e.gcm === "object") st.gcm = e.gcm;
      if (typeof e.gcmMode === "string" && simGcmModes().indexOf(e.gcmMode) >= 0) st.gcmMode = e.gcmMode;
      if (typeof e.gcmWait === "string") st.gcmWait = e.gcmWait;
      if (typeof e.gcmRegions === "string") st.gcmRegions = e.gcmRegions;
      if (typeof e.cookiePats === "string") {
        st.cookiePats = (SIM_COOKIE_DEFAULTS_PAST.indexOf(e.cookiePats) >= 0) ? SIM_COOKIE_DEFAULT : e.cookiePats;
      }
      if (typeof e.cookieReload === "boolean") st.cookieReload = e.cookieReload;
      if (typeof e.cookieLS === "boolean") st.cookieLS = e.cookieLS;
      if (typeof e.cookieFrames === "boolean") st.cookieFrames = e.cookieFrames;
      if (typeof e.scenarioText === "string") st.scenarioText = e.scenarioText;
      if (typeof e.containerIds === "string") st.containerIds = e.containerIds;
    }
  } catch (er) { /* corrupt/unavailable → in-memory defaults */ }
}
function simSave() {
  var st = simState();
  try {
    if (typeof localStorage === "undefined" || !st.host) return;
    var all = {};
    try { all = JSON.parse(localStorage.getItem(SIM_LS) || "{}") || {}; } catch (e2) { all = {}; }
    all[st.host] = {
      consent: st.consent,
      presets: (st.presets || []).slice(0, 30),
      events: (st.events || []).slice(0, 10),
      fireText: st.fireText || "",
      flags: st.flags || {},
      injectCode: st.injectCode || "",
      blockIntent: !!st.blockIntent,
      gcm: st.gcm || simDefaultGcm(),
      gcmMode: st.gcmMode || "update",
      gcmWait: typeof st.gcmWait === "string" ? st.gcmWait : "",
      gcmRegions: typeof st.gcmRegions === "string" ? st.gcmRegions : "",
      cookiePats: typeof st.cookiePats === "string" ? st.cookiePats : SIM_COOKIE_DEFAULT,
      cookieReload: !!st.cookieReload,
      cookieLS: !!st.cookieLS,
      cookieFrames: !!st.cookieFrames,
      scenarioText: st.scenarioText || "",
      containerIds: st.containerIds || ""
    };
    localStorage.setItem(SIM_LS, JSON.stringify(all));
  } catch (er) { /* ignore */ }
}

/* ---------- consent-builder model ---------- */
// Build the consent selection from persisted state, seeded (first time) from the
// config's REQUIRED tokens (aGTM.c.gtmServices/gtmVendors/gtmPurposes) plus any
// tokens already present in the live consent — so the user immediately sees what
// GTM actually needs.
function simConsentModel(snap) {
  var st = simState();
  if (st.consent) return st.consent;
  var SIM = window.aGTMInspectorSim;
  var cfg = (snap && snap.config) || {};
  var cur = (snap && snap.consent) || {};
  function rows(reqStr, curStr, curIdStr) {
    var req = SIM.splitTokens(reqStr);
    var have = SIM.splitTokens(curStr);
    var ids = SIM.splitTokens(curIdStr);
    var seen = {}, list = [];
    req.concat(have).forEach(function (name, i) {
      if (seen[name]) return; seen[name] = 1;
      list.push({ name: name, id: "", on: true });
    });
    // Seed IDs positionally from the live consent's *IDs string when present.
    for (var k = 0; k < list.length && k < ids.length; k++) list[k].id = ids[k];
    return list;
  }
  st.consent = {
    purposes: rows(cfg.gtmPurposes, cur.purposes, cur.purposeIDs),
    services: rows(cfg.gtmServices, cur.services, cur.serviceIDs),
    vendors: rows(cfg.gtmVendors, cur.vendors, cur.vendorIDs),
    // Per-group toggle: express consent by ID (→ the *IDs go into the GTM-matched
    // string) instead of by name. Off = names, the common case.
    useId: { purposes: false, services: false, vendors: false }
  };
  return st.consent;
}

// Collect the {purposes,services,vendors,serviceIDs,vendorIDs,purposeIDs} arrays of
// the currently-ON rows — the input to the code builders. Honors the per-group
// useId toggle: when a group uses IDs, its IDs become the token GTM's chelp matches
// on (written to .services/.purposes/.vendors); otherwise the names are. The *IDs
// fields are always populated from the id column (real CMPs fill both).
function simSelection(model) {
  var u = model.useId || {};
  function on(list) { return (list || []).filter(function (r) { return r.on; }); }
  function names(list) { return on(list).map(function (r) { return r.name; }).filter(Boolean); }
  function ids(list) { return on(list).map(function (r) { return r.id; }).filter(Boolean); }
  // In ID-mode, the matched token is the row's ID — but fall back to its NAME per row
  // when the ID field is empty (F-1: a CMP may not expose IDs, so an ID-mode grant with
  // blank IDs would otherwise silently contribute nothing → gtmConsent stays false).
  function matchTok(list, useId) {
    if (!useId) return names(list);
    return on(list).map(function (r) { return r.id || r.name; }).filter(Boolean);
  }
  return {
    purposes: matchTok(model.purposes, u.purposes),
    services: matchTok(model.services, u.services),
    vendors: matchTok(model.vendors, u.vendors),
    purposeIDs: ids(model.purposes),
    serviceIDs: ids(model.services),
    vendorIDs: ids(model.vendors)
  };
}

/* ---------- write bridge (the ONE mutating eval path) ---------- */
function simRun(code, label) {
  if (!SIM_WRITE) return;
  try {
    chrome.devtools.inspectedWindow.eval(code, function (result, err) {
      if (err && (err.isError || err.isException)) {
        SIM_LAST = { ok: false, error: (err.value || "eval error"), label: label, ts: nowMs() };
      } else {
        SIM_LAST = result || { ok: false, error: "no result" };
        SIM_LAST.label = label; SIM_LAST.ts = nowMs();
        if (SIM_LAST.reloading) simLastSave();   // survive the reload we just triggered
        if (typeof SIM_LAST.simActive === "boolean") simState().active = SIM_LAST.simActive;
        // snap.blocked (from reader.js) is authoritative for the block state.
      }
      updateSimLive();
      poll(); // pull a fresh snapshot so the other tabs reflect the effect too
    });
  } catch (e) {
    SIM_LAST = { ok: false, error: String(e), label: label, ts: nowMs() };
    updateSimLive();
  }
}
// Third-party CMP frames (Consentmanager, Usercentrics, Cookiebot …) keep their OWN
// copy of the consent state in their OWN origin: cookies on their domain plus a
// localStorage under e.g. https://cdn.consentmanager.net. The page cannot touch either
// — same-origin policy — so a reset run only in the top frame leaves the CMP able to
// restore everything on the next load, and the banner never reappears.
//
// DevTools can reach into a frame WITHOUT any manifest permission:
// inspectedWindow.eval accepts { frameURL }, and getResources() lists what the page
// loaded. We collect the distinct third-party ORIGINS from those resources and run the
// same reset expression once per frame (never with `reload` — that is the top frame's
// job). Frames that are gone or refuse evaluation just report an error we ignore.
function simFrameOrigins(cb) {
  var out = [];
  try {
    if (!chrome.devtools.inspectedWindow.getResources) { cb(out); return; }
    chrome.devtools.inspectedWindow.getResources(function (resources) {
      var pageHost = (state.snap && state.snap.pageHost) || "";
      var seen = {};
      (resources || []).forEach(function (r) {
        var u = r && r.url;
        if (!u || u.indexOf("http") !== 0) return;
        var origin, host;
        try { var U = new URL(u); origin = U.origin; host = U.host; } catch (e) { return; }
        if (!origin || seen[origin]) return;
        // Same registrable-ish domain as the page → already covered by the top-frame run.
        if (pageHost && (host === pageHost || host.indexOf("." + pageHost) >= 0 ||
            pageHost.indexOf("." + host) >= 0)) return;
        seen[origin] = 1;
        out.push(origin);
      });
      cb(out);
    });
  } catch (e) { cb(out); }
}
// Run an expression inside a specific frame. Errors are swallowed: a frame may have
// been removed between discovery and execution, which is normal, not a failure.
function simRunInFrame(code, origin, done) {
  try {
    chrome.devtools.inspectedWindow.eval(code, { frameURL: origin + "/" }, function (result, err) {
      done(!err && result && result.ok ? result : null);
    });
  } catch (e) { done(null); }
}
function nowMs() { try { return Date.now(); } catch (e) { return 0; } }

/* ---------- render ---------- */
// Scaffold is built ONCE into the persistent #tab-sim section (so typing into the
// form is never clobbered by the 700ms poll). Only #sim-live repaints per poll.
function renderSim() {
  var snap = state.snap;
  var host = (snap && snap.pageHost) || "";
  var st = simState();
  if (st.host !== host) { simLoad(host); }
  if (!SIM_LAST) simLastRestore();

  // Rebuild the scaffold only when it isn't currently in the section (first
  // activation, or after the not-loaded branch paint()ed a placeholder over it).
  // Guarded on the section's own innerHTML — NOT el('sim-root') — so it works both
  // in the real DOM (getElementById returns null until built) and under the smoke
  // test's fake DOM (which auto-creates any queried node).
  var sec = el("tab-sim");
  if (!sec) return;
  var loadedNow = !!(snap && snap.loaded);
  // Rebuild when the scaffold is absent (first activation / painted over) OR when the
  // loaded-state flipped (the loaded and not-loaded scaffolds differ — the latter
  // only offers the integration-inject box).
  if ((sec.innerHTML || "").indexOf('id="sim-root"') < 0 || sec.__simLoaded !== loadedNow) {
    buildSimScaffold();
    sec.__simLoaded = loadedNow;
    // One read-only probe to learn whether a stub is already installed on the page.
    try {
      chrome.devtools.inspectedWindow.eval(window.aGTMInspectorSim.buildProbeCode(), function (r) {
        if (r && typeof r.simActive === "boolean") { simState().active = r.simActive; updateSimLive(); }
      });
    } catch (e) { /* ignore */ }
  }
  updateSimLive();
  maybeAutoBlock();
}

// Re-apply a persisted block when write-mode is on and the page reports itself
// un-blocked (e.g. after a reload) — so the demo/prospect block survives reloads.
// Guarded against re-entry while an apply is in flight; buildBlockCode is idempotent
// anyway (its backup is taken once).
function maybeAutoBlock() {
  var st = simState();
  var snap = state.snap || {};
  if (!SIM_WRITE || !st.blockIntent || !snap.loaded || snap.blocked || st._blockApplying) return;
  st._blockApplying = true;
  simRun(window.aGTMInspectorSim.buildBlockCode(), "aGTM blockiert (nach Reload)");
  // Release the in-flight guard after the poll settles (snap.blocked then true).
  try { if (typeof setTimeout === "function") setTimeout(function () { st._blockApplying = false; }, POLL_MS); }
  catch (e) { st._blockApplying = false; }
}

function buildSimScaffold() {
  var snap = state.snap || {};
  var st = simState();
  var loaded = !!snap.loaded;
  // Build (and cache) the consent model only when aGTM is loaded — otherwise config
  // is empty and caching an empty model would poison the later loaded render.
  var model = loaded ? simConsentModel(snap) : null;

  var h = '<div id="sim-root">';

  // ── Write-mode banner + toggle (pinned) ───────────────────────
  h += '<div class="card ' + (SIM_WRITE ? "warnbox" : "leakbox") + '" id="sim-mode">' +
    '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
    '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:700">' +
    '<input type="checkbox" id="sim-write"' + (SIM_WRITE ? " checked" : "") + '> ' +
    (SIM_WRITE ? "🔓 Write-Modus AKTIV" : "🔒 Write-Modus AUS") + "</label>" +
    '<span class="spacer" style="flex:1"></span>' +
    '<span class="muted">' + (SIM_WRITE
      ? "Aktionen schreiben jetzt auf die Seite (aGTM.f.fire/run_cc/inject)."
      : "Read-only. Zum Treiben der Seite einschalten.") + "</span></div>" +
    '<div class="muted" style="margin-top:6px;font-size:11px">Der Inspector ist ansonsten strikt read-only. Dieser Tab ist die einzige Ausnahme und wird bei jedem Öffnen wieder auf AUS gesetzt.</div>' +
    "</div>";

  // ── Live effect panel (pinned, repainted per poll) ────────────
  h += '<div class="card"><h2>Live-Zustand &amp; Effekt</h2><div id="sim-live"></div></div>';

  // Build the content boxes once, then assemble under section headers so the tab reads
  // as four labelled groups (Consent · Events · GTM & Integration · Umgebung) instead of
  // one long stack. GCM push, cookie reset and the integration-inject snippet are aGTM-
  // independent, so they also appear in the not-loaded view.
  var csUrl = (snap.config && snap.config.consent_store_url) || "";
  var blockDis = (!SIM_WRITE || !loaded) ? " disabled" : "";

  var gcmMode = simGcmMode(st);
  var boxGcm = '<div class="card"><h2>Google Consent Mode pushen</h2>' +
    '<div class="muted" style="margin-bottom:8px;font-size:11px">Schiebt ein <code>gtag(\'consent\',&lt;Modus&gt;,{…})</code> direkt in den dataLayer (echtes <code>arguments</code>-Objekt) — testet GCM-Signale <b>unabhängig von aGTM</b>. Häkchen = <code>granted</code>, sonst <code>denied</code>.</div>' +
    simGcmStatusLine(snap) +
    simGcmModeRow(gcmMode) +
    simGcmRows(st.gcm) +
    simGcmDefaultFields(st, gcmMode) +
    '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
    simBtn("sim-gcm-push", "consent " + gcmMode + " pushen", "acc") +
    (gcmMode === "update" ? "" : simFlag("sim-gcm-force", "trotzdem pushen (Timing-Guard aus)", !!st.gcmForce)) +
    "</div></div>";

  var boxCookie = '<div class="card"><h2>Cookies zurücksetzen + neu laden</h2>' +
    '<div class="muted" style="margin-bottom:8px;font-size:11px">Löscht passende Cookies (Name enthält eines der Muster; über alle Domain-/Pfad-Varianten) für einen echten Erstbesuch-Test. <b>Leeres Feld = ALLE Cookies</b> (inkl. Login!) — mit „localStorage auch leeren“ dann auch der <b>komplette</b> localStorage. Ein bereits injiziertes GTM lässt sich nur so via Reload „vergessen“. <b>Grenze:</b> gelöscht werden kann nur, was auf der <b>eigenen Domain</b> liegt — die Kopien mancher CMPs auf deren eigener Domain (z. B. <code>.consentmanager.net</code>) sind für die Seite unerreichbar und können den Zustand nach dem Reload wiederherstellen.</div>' +
    '<input type="text" id="sim-cookie-pats" spellcheck="false" placeholder="Cookie-Namen-Muster, kommagetrennt (leer = alle)" value="' + esc(typeof st.cookiePats === "string" ? st.cookiePats : "") + '" style="width:100%;font-family:ui-monospace,monospace;font-size:11px;background:var(--bg);color:var(--fg);border:1px solid var(--border);border-radius:6px;padding:6px">' +
    '<div class="muted" style="margin-top:4px;font-size:11px">Ein Muster trifft als <b>Teilstring</b> (<code>__cmp</code> trifft <code>__cmpccu45430</code>). <code>*</code> ist ein Platzhalter zum Verankern: <code>__cmp*</code> = beginnt mit, <code>*consent</code> = endet auf, <code>*</code> = alles.' +
    (st.cookiePats !== SIM_COOKIE_DEFAULT ? ' <a href="#" id="sim-cookie-reset-pats" style="color:var(--accent)">Standardliste wiederherstellen</a>' : "") + "</div>" +
    '<div class="toolbar" style="margin-top:8px">' +
    simFlag("sim-cookie-ls", "localStorage auch leeren", st.cookieLS) +
    simFlag("sim-cookie-frames", "auch in Drittanbieter-Frames (CMP)", st.cookieFrames) +
    simFlag("sim-cookie-reload", "danach neu laden", st.cookieReload) +
    '<span class="spacer" style="flex:1"></span>' +
    simBtn("sim-cookie-reset", "Cookies löschen", "warn") + "</div></div>";

  var boxIntegration = '<div class="card"><h2>aGTM-Integration injizieren</h2>' +
    '<div class="muted" style="margin-bottom:8px;font-size:11px">Für Seiten ohne aGTM: Integrationscode (Loader / <code>config</code> / <code>consent_check</code> / <code>init</code>) einfügen und injizieren — läuft im globalen Seitenkontext wie eine echte Einbindung. Pro Host gespeichert.</div>' +
    '<textarea id="sim-integration" spellcheck="false" placeholder="// aGTM-Integrationscode hier einfügen…" style="width:100%;min-height:90px;font-family:ui-monospace,monospace;font-size:12px;background:var(--bg);color:var(--fg);border:1px solid var(--border);border-radius:6px;padding:8px">' +
    esc(st.injectCode || "") + "</textarea>" +
    '<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">' +
    simBtn("sim-inject-int", "Integration injizieren", "acc") + "</div></div>";

  if (loaded) {
    // ── CONSENT ──────────────────────────────────────────────────
    // "Restore" folds in the former standalone "CMP mock" box: Grant already installs a
    // persistent consent_check stub (= mocks the CMP), so a separate mock box was redundant;
    // Restore (undo the stub without wiping consent) lives here next to Reset.
    h += simHead("Consent");
    h += '<div class="card"><h2>Consent simulieren</h2>' +
      '<div class="muted" style="margin-bottom:8px;font-size:11px">Wähle Kategorien / Services / Vendoren, für die Consent erteilt wird. Vorbelegt aus <code>gtmPurposes/gtmServices/gtmVendors</code> (was GTM benötigt) + aktuellem Consent. Pro Gruppe lässt sich per <b>IDs</b> umschalten, ob per <b>ID</b> statt Name konsentiert wird (die IDs landen dann im GTM-geprüften String + in <code>serviceIDs/vendorIDs/purposeIDs</code>; fehlt bei einer Zeile die ID, greift ihr Name). <b>Grant</b> installiert einen persistenten <code>consent_check</code>-Stub (mockt damit die CMP — auch der 2s-Poll sieht ihn) und ruft <code>run_cc(\'update\')</code> → echter Library-Pfad reset→check→chelp→gtmConsent→inject→replay. <b>Restore</b> stellt den originalen <code>consent_check</code> wieder her.</div>' +
      simConsentGroups(model) +
      '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">' +
      simBtn("sim-grant", "Consent erteilen (run_cc)", "acc") +
      simBtn("sim-deny", "Alles ablehnen", "") +
      simBtn("sim-reset", "Reset (leeren + Restore)", "") +
      simBtn("sim-restore", "Original consent_check wiederherstellen", "") +
      "</div>" +
      '<div class="muted" style="margin-top:6px;font-size:11px">Hinweis: Ein bereits injiziertes GTM lässt sich nicht „zurück-laden“. Für einen echten Erstbesuch-Test: „Umgebung“ → Cookies löschen + Seite neu laden.</div>' +
      simPresets(st) +
      "</div>";

    // ── EVENTS ───────────────────────────────────────────────────
    h += simHead("Events");
    h += '<div class="card"><h2>Event feuern</h2>' +
      '<textarea id="sim-fire" spellcheck="false" style="width:100%;min-height:70px;font-family:ui-monospace,monospace;font-size:12px;background:var(--bg);color:var(--fg);border:1px solid var(--border);border-radius:6px;padding:8px">' +
      esc(st.fireText || '{\n  "event": "test_event"\n}') + "</textarea>" +
      '<div class="toolbar" style="margin-top:8px">' +
      simFlag("sim-f-noconsent", "_noConsent", st.flags._noConsent) +
      simFlag("sim-f-nodl", "_noDLPush", st.flags._noDLPush) +
      simFlag("sim-f-post", "_post", st.flags._post) +
      '<span class="spacer" style="flex:1"></span>' +
      simBtn("sim-fire-btn", "fire()", "acc") + "</div>" +
      '<div id="sim-fire-err" class="muted" style="font-size:11px"></div>' +
      simEventHistory(st) +
      "</div>";

    h += '<div class="card"><h2>Szenario-Runner</h2>' +
      '<div class="muted" style="margin-bottom:8px;font-size:11px">Spielt in <b>einem Klick</b> den kompletten Ablauf durch: <b>ablehnen</b> → die Events unten <b>feuern</b> (werden bei fehlendem Consent in <code>aGTM.d.f</code> geparkt) → oben gewählten Consent <b>erteilen</b> (<code>run_cc</code> → inject → Replay der geparkten Events). Events als JSON-Array. <b>Voraussetzung für den Replay:</b> GTM darf noch <b>nicht</b> injiziert sein (sonst greift der inject-once-Schutz → kein Replay). Ist <code>consent_store_url</code> gesetzt, sendet der Lauf zwei echte Consent-Store-POSTs (deny, dann grant).</div>' +
      '<textarea id="sim-scn" spellcheck="false" style="width:100%;min-height:64px;font-family:ui-monospace,monospace;font-size:12px;background:var(--bg);color:var(--fg);border:1px solid var(--border);border-radius:6px;padding:8px">' +
      esc(st.scenarioText || '[\n  { "event": "page_view" },\n  { "event": "add_to_cart" }\n]') + "</textarea>" +
      '<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">' +
      simBtn("sim-scn-run", "Szenario starten (deny→fire→grant)", "acc") + "</div>" +
      '<div id="sim-scn-err" class="muted" style="font-size:11px"></div></div>';

    // ── GTM & INTEGRATION ────────────────────────────────────────
    h += simHead("GTM & Integration");
    h += '<div class="card"><h2>Anderen GTM-Container laden</h2>' +
      '<div class="muted" style="margin-bottom:8px;font-size:11px">Lädt gezielt einen (oder mehrere) GTM-Container <b>zusätzlich</b> — <b>unabhängig von Consent und Integrations-Config</b> — via <code>aGTM.f.gtm_load</code>. So lässt sich eine Live-Seite testweise auf einen <b>Staging-/Demo-Container</b> zeigen, ohne die echte Config zu ändern (oft kombiniert mit „Vorhandene Integration blockieren“). Kommagetrennt.</div>' +
      '<input type="text" id="sim-container-ids" spellcheck="false" placeholder="GTM-XXXX, GTM-YYYY" value="' + esc(typeof st.containerIds === "string" ? st.containerIds : "") + '" style="width:100%;font-family:ui-monospace,monospace;font-size:12px;background:var(--bg);color:var(--fg);border:1px solid var(--border);border-radius:6px;padding:6px">' +
      '<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">' +
      simBtn("sim-container-load", "Container laden", "warn") + "</div></div>";

    h += '<div class="card"><h2>GTM-Injection erzwingen</h2>' +
      '<div class="muted" style="margin-bottom:8px;font-size:11px">Lädt die <b>konfigurierten</b> Container via <code>aGTM.f.initGTM(false)</code> — <b>unabhängig vom Consent</b> (nicht das consent-gated <code>inject()</code>). Nützlich, um Container-Load isoliert zu testen.</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      simBtn("sim-inject", "GTM-Injection erzwingen", "warn") + "</div></div>";

    h += '<div class="card"><h2>Consent-Store-POST testen</h2>' +
      '<div class="muted" style="margin-bottom:8px;font-size:11px">Löst gezielt den <code>/aGTMconsent</code>-POST aus: installiert die oben gewählte Consent-Auswahl, leert <code>aGTM.d.consent_hash</code> (erzwingt den Diff) und ruft <code>run_cc(\'update\')</code> — der echte <code>aGTM.f.xsend()</code>-POST an <code>consent_store_url</code> feuert. ' +
      (csUrl ? 'Ziel: <code>' + esc(csUrl) + '</code>' : '<b>Kein <code>consent_store_url</code> konfiguriert</b> — der Test meldet das nur, ohne zu senden.') + '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      simBtn("sim-cstore", "Consent-Store-POST auslösen", "warn", !csUrl) + "</div></div>";

    h += '<div class="card"><h2>Vorhandene aGTM-Integration blockieren</h2>' +
      '<div class="muted" style="margin-bottom:8px;font-size:11px">Neutralisiert die geladene aGTM-Integration (<code>inject/initGTM/gtm_load</code> → no-op, <code>consent_check</code> → false), um z. B. eine eigene Integration isoliert zu testen. <b>Pro Host gespeichert</b> und bei aktivem Write-Modus nach einem Reload erneut angewandt. Ein <b>bereits</b> geladenes GTM lässt sich damit nicht zurückholen.</div>' +
      '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:600">' +
      '<input type="checkbox" id="sim-block-cb"' + (st.blockIntent ? " checked" : "") + blockDis + "> aGTM blockieren</label></div>";

    h += boxIntegration;

    // ── UMGEBUNG (aGTM-independent) ──────────────────────────────
    h += simHead("Umgebung");
    h += boxGcm + boxCookie;
  } else {
    h += simHead("Consent");
    h += '<div class="card"><div class="muted">Auf dieser Seite ist <code>window.aGTM</code> nicht geladen — Consent-/Event-Simulation braucht ein aktives aGTM. Du kannst unter „GTM & Integration“ eine Integration <b>injizieren</b> (für noch nicht integrierte Seiten).</div></div>';

    h += simHead("GTM & Integration");
    h += boxIntegration;

    h += simHead("Umgebung");
    h += boxGcm + boxCookie;
  }

  h += "</div>";

  var node = el("tab-sim");
  node.innerHTML = h;
  node.__lastHTML = null; // this tab is managed by hand, not by paint()
  attachSimListeners();
}

function simBtn(id, label, cls, forceDisabled) {
  var extra = cls ? (" " + cls) : "";
  var dis = (!SIM_WRITE || forceDisabled) ? " disabled" : "";
  // A disabled button swallows the click silently — say WHY on hover, otherwise "I
  // clicked and nothing happened" is the only feedback (write-mode resets to off on
  // every panel open, so this is the normal state after reloading the extension).
  var why = (!SIM_WRITE && !forceDisabled) ? ' title="Write-Modus ist aus — oben einschalten, um die Seite zu treiben."' : "";
  return '<button class="small sim-act' + extra + '" id="' + id + '"' + dis + why + ">" + esc(label) + "</button>";
}
// Section divider: an uppercase muted label with a trailing hairline, so the flat box
// stack reads as labelled groups (Consent · Events · GTM & Integration · Umgebung).
function simHead(title) {
  return '<div class="sim-sec" style="display:flex;align-items:center;gap:8px;margin:16px 2px 4px;color:var(--muted);font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">' +
    "<span>" + esc(title) + "</span><span style=\"flex:1;height:1px;background:var(--border)\"></span></div>";
}
function simFlag(id, label, on) {
  return '<label><input type="checkbox" id="' + id + '"' + (on ? " checked" : "") + "> " + esc(label) + "</label>";
}

/* ---------- GCM push box (card #51) ---------- */

// The builder owns the mode list; the panel never hard-codes it.
function simGcmModes() {
  return (window.aGTMInspectorSim && window.aGTMInspectorSim.GCM_MODES) || ["update", "default", "declare"];
}
function simGcmMode(st) {
  var m = st && st.gcmMode;
  return simGcmModes().indexOf(m) >= 0 ? m : "update";
}
// What each verb actually does — the timing rule is the part people get wrong, so it
// is spelled out per mode instead of hidden in a tooltip.
var SIM_GCM_MODE_HINT = {
  update: "Revidiert den Consent-Zustand — wirkt jederzeit, auch nach dem GTM-Load. Der Normalfall nach einer CMP-Entscheidung.",
  "default": "Setzt den Ausgangszustand VOR dem Consent. Wirkt nur, solange das Google-Tag den Zustand noch nicht verarbeitet hat — auf einer aGTM-Seite also, solange der consent-gesteuerte GTM-Load noch nicht gelaufen ist.",
  // Honest caveat: 'default' and 'update' are the documented gtag verbs. 'declare' is
  // primarily a GTM-template API (declareConsentState); that a dataLayer-pushed
  // declare command is dispatched by the Google tag is NOT documented. The Ist-Zustand
  // line's declare column is how you check whether it actually arrived.
  "declare": "Meldet einen bereits bekannten Zustand — genutzt von CMP-/Vendor-Templates. Gleiche Timing-Regel wie default. Achtung: offiziell dokumentiert sind nur update und default; ob ein per dataLayer gepushtes declare vom Google-Tag verarbeitet wird, zeigt dir die Herkunft-Spalte im Ist-Zustand oben."
};
function simGcmModeRow(mode) {
  var modes = simGcmModes(), h = '<div class="toolbar" style="margin:8px 0 6px;gap:12px">';
  for (var i = 0; i < modes.length; i++) {
    var m = modes[i];
    h += '<label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:12px">' +
      '<input type="radio" name="sim-gcm-mode" class="sim-gcm-mode" value="' + esc(m) + '"' +
      (m === mode ? " checked" : "") + "> <code>" + esc(m) + "</code></label>";
  }
  h += "</div>";
  return h + '<div class="muted" style="font-size:11px;margin-bottom:8px">' +
    esc(SIM_GCM_MODE_HINT[mode] || "") + "</div>";
}
// A wait_for_update the builder will drop: text was entered, but it is not a number > 0.
// Mirrors the builder's own `isFinite(wfu) && wfu > 0` test (sim.js buildGcmPushCode).
function simGcmWaitInvalid(v) {
  if (typeof v !== "string") return false;
  var t = v.replace(/^\s+|\s+$/g, "");
  if (!t) return false;                 // empty = deliberately unset, not an error
  var n = Number(t);
  return !(isFinite(n) && n > 0);
}
// wait_for_update / region are 'default'-only in Google's API, so the fields only
// exist in that mode — no dead inputs that quietly do nothing.
function simGcmDefaultFields(st, mode) {
  if (mode !== "default") return "";
  var inp = "font-family:ui-monospace,monospace;font-size:11px;background:var(--bg);color:var(--fg);border:1px solid var(--border);border-radius:6px;padding:5px";
  return '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;margin-top:10px">' +
    '<label style="font-size:11px">wait_for_update (ms)' +
    '<input type="text" id="sim-gcm-wait" inputmode="numeric" spellcheck="false" placeholder="z. B. 500" value="' +
    esc(typeof st.gcmWait === "string" ? st.gcmWait : "") + '" style="' + inp + ';width:100%;margin-top:3px">' +
    // A non-empty but unparsable value would otherwise be dropped silently and the push
    // would still report OK — say it right at the field instead.
    (simGcmWaitInvalid(st.gcmWait)
      ? '<span style="color:var(--err);font-size:10px">keine Zahl &gt; 0 — <code>wait_for_update</code> wird NICHT mitgesendet</span>'
      : "") + "</label>" +
    '<label style="font-size:11px">region (kommagetrennt, leer = global)' +
    '<input type="text" id="sim-gcm-regions" spellcheck="false" placeholder="z. B. DE,AT,US-CA" value="' +
    esc(typeof st.gcmRegions === "string" ? st.gcmRegions : "") + '" style="' + inp + ';width:100%;margin-top:3px"></label>' +
    '</div><div class="muted" style="font-size:11px;margin-top:4px">Ein Push = ein Region-Scope. Für mehrere unterschiedliche Defaults nacheinander pushen (Google wertet den spezifischsten Treffer aus).</div>';
}
// Current effective GCM state + where it came from, so the push has a visible
// before/after. This ALSO answers "was ist der implizite Status?" — implicit is not a
// command one can push, it is what Google assumes when no default ever arrived, so it
// belongs here as a reading, not as a fourth button.
// The scaffold is built once, so the line gets its own node that updateSimLive()
// refreshes on every 700 ms poll — otherwise the "before/after" would freeze at the
// state the box happened to be built with.
function simGcmStatusLine(snap) {
  return '<div id="sim-gcm-status" style="margin-bottom:8px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:11px">' +
    simGcmStatusInner(snap) + "</div>";
}
function simGcmStatusInner(snap) {
  var S = window.aGTMInspectorSignals;
  snap = snap || {};
  var model = S && S.gcmStatusModel
    ? S.gcmStatusModel(snap.gcm, (window.aGTMInspectorSim && window.aGTMInspectorSim.GCM_SIGNALS) || [])
    : { present: false, rows: [] };
  // The line must judge "window open?" by the SAME signals as the in-page guard,
  // otherwise it says "open" while the push is refused. The guard checks
  // google_tag_data.ics (which can exist with an EMPTY entries map, so snap.gcm alone
  // is not enough) or aGTM.d.init; gtmPresent additionally covers the paths that never
  // set aGTM.d.init (noConsent containers, the container-override button).
  var closed = model.present || !!snap.icsPresent || !!snap.init || !!snap.gtmPresent;
  if (!model.present) {
    if (closed) {
      return "<b>Ist-Zustand:</b> noch keine Kategorie-Werte lesbar, aber GTM ist bereits am Werk " +
        (snap.icsPresent ? "(<code>google_tag_data.ics</code> vorhanden)"
          : (snap.init ? "(aGTM hat den consent-gesteuerten Load ausgeführt)" : "(<code>google_tag_manager</code> vorhanden)")) +
        " → das Zeitfenster für <code>default</code>/<code>declare</code> ist <b>geschlossen</b>, nur <code>update</code> wirkt noch.";
    }
    return "<b>Ist-Zustand:</b> kein <code>google_tag_data.ics</code> — das Google-Tag hat noch keinen Consent-Zustand verarbeitet. " +
      "Ohne <code>default</code> gilt Googles <b>impliziter</b> Zustand (granted). Das Zeitfenster für <code>default</code>/<code>declare</code> ist <b>offen</b>.";
  }
  var h = '<b>Ist-Zustand</b> <span class="muted">(effektiv, Herkunft in Klammern)</span>' +
    '<div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px 10px">';
  for (var i = 0; i < model.rows.length; i++) {
    var r = model.rows[i];
    var col = r.value === true ? "var(--ok)" : (r.value === false ? "var(--err)" : "");
    var val = r.value === true ? "granted" : (r.value === false ? "denied" : "—");
    var org = (S && S.gcmOriginLabel) ? S.gcmOriginLabel(r.origin) : (r.origin || "");
    h += '<span class="mono" style="font-size:11px">' + esc(catShort(r.cat)) +
      ' <span style="color:' + col + '">' + esc(val) + "</span>" +
      (org ? ' <span class="muted">(' + esc(org) + ")</span>" : "") + "</span>";
  }
  return h + "</div>";
}

// One checkbox per Google Consent Mode signal (checked = granted). Data-driven from
// the builder's GCM_SIGNALS list so the panel never drifts from what the code embeds.
function simGcmRows(gcm) {
  gcm = gcm || {};
  var sigs = (window.aGTMInspectorSim && window.aGTMInspectorSim.GCM_SIGNALS) || [];
  var h = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:4px 12px">';
  for (var i = 0; i < sigs.length; i++) {
    var k = sigs[i], on = gcm[k] === "granted";
    h += '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px">' +
      '<input type="checkbox" class="sim-gcm" data-sig="' + esc(k) + '"' + (on ? " checked" : "") + '> ' +
      '<span class="mono">' + esc(k) + "</span></label>";
  }
  return h + "</div>";
}

function simConsentGroups(model) {
  var u = model.useId || {};
  return '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px">' +
    simGroup("Kategorien (purposes)", "purposes", model.purposes, !!u.purposes) +
    simGroup("Services", "services", model.services, !!u.services) +
    simGroup("Vendoren", "vendors", model.vendors, !!u.vendors) +
    "</div>";
}
// Every group has an "IDs" toggle (express consent by ID instead of name) and a
// per-row ID field. The ID field is emphasised when the group's toggle is on
// (that's the token GTM will actually match against).
function simGroup(title, key, rows, useId) {
  var h = '<div><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">' +
    '<span class="muted" style="font-weight:600;flex:1;min-width:0">' + esc(title) + "</span>" +
    '<label class="muted" style="font-size:10px;display:flex;align-items:center;gap:3px;cursor:pointer" title="Consent per ID statt Name ausdrücken">' +
    '<input type="checkbox" class="sim-useid" data-grp="' + key + '"' + (useId ? " checked" : "") + "> IDs</label></div>";
  if (!rows || !rows.length) {
    h += '<div class="muted" style="font-size:11px">— keine —</div>';
  } else {
    var idBorder = useId ? "var(--accent)" : "var(--border)";
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      h += '<div class="sim-cr" style="display:flex;align-items:center;gap:5px;margin:2px 0">' +
        '<label style="display:flex;align-items:center;gap:5px;flex:1;min-width:0;cursor:pointer">' +
        '<input type="checkbox" class="sim-tok" data-grp="' + key + '" data-i="' + i + '"' + (r.on ? " checked" : "") + ">" +
        '<span class="mono" style="overflow:hidden;text-overflow:ellipsis' + (useId ? ";color:var(--muted)" : "") + '">' + esc(r.name) + "</span></label>" +
        '<input type="text" class="sim-id" data-grp="' + key + '" data-i="' + i + '" placeholder="ID" value="' + esc(r.id || "") +
        '" style="width:64px;font-family:ui-monospace,monospace;font-size:11px;background:var(--bg);color:var(--fg);border:1px solid ' + idBorder + ';border-radius:4px;padding:1px 4px">' +
        "</div>";
    }
  }
  h += '<div style="margin-top:4px"><input type="text" class="sim-add" data-grp="' + key +
    '" placeholder="+ hinzufügen…" style="width:100%;font-size:11px;background:var(--bg);color:var(--fg);border:1px dashed var(--border);border-radius:4px;padding:2px 5px"></div>';
  return h + "</div>";
}

function simPresets(st) {
  var h = '<div style="margin-top:12px;border-top:1px solid var(--border);padding-top:8px">' +
    '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
    '<span class="muted" style="font-size:11px">Presets:</span>';
  var ps = st.presets || [];
  if (!ps.length) h += '<span class="muted" style="font-size:11px">— keine gespeichert —</span>';
  for (var i = 0; i < ps.length; i++) {
    h += '<span class="chip acc sim-preset" data-i="' + i + '" style="cursor:pointer" title="Laden">' + esc(ps[i].name) + "</span>" +
      '<span class="sim-preset-del" data-i="' + i + '" style="cursor:pointer;color:var(--err);margin-left:-2px;margin-right:6px" title="Löschen">×</span>';
  }
  h += '<span class="spacer" style="flex:1"></span>' +
    '<input type="text" id="sim-preset-name" placeholder="Name…" style="width:110px;font-size:11px;background:var(--bg);color:var(--fg);border:1px solid var(--border);border-radius:4px;padding:2px 5px">' +
    simBtn("sim-preset-save", "Auswahl speichern", "") + "</div></div>";
  return h;
}

function simEventHistory(st) {
  var ev = st.events || [];
  if (!ev.length) return "";
  var h = '<div style="margin-top:8px"><span class="muted" style="font-size:11px">Zuletzt:</span> ';
  for (var i = 0; i < ev.length; i++) {
    var label = ev[i].replace(/\s+/g, " ");
    if (label.length > 40) label = label.slice(0, 40) + "…";
    h += '<span class="chip sim-ev" data-i="' + i + '" style="cursor:pointer" title="Übernehmen">' + esc(label) + "</span>";
  }
  return h + "</div>";
}

/* ---------- live effect panel (only this repaints per poll) ---------- */
function updateSimLive() {
  var node = el("sim-live");
  if (!node) return;
  var snap = state.snap || {};
  var c = snap.consent || {};
  var st = simState();
  function pill(label, ok, txt) {
    var cls = ok === true ? "ok" : (ok === false ? "err" : "");
    return '<span class="chip ' + cls + '">' + esc(label) + (txt ? ": " + esc(txt) : "") + "</span>";
  }
  var h = "";
  if (!snap.loaded) {
    h += '<span class="chip err">aGTM nicht geladen</span>';
  } else {
    h += pill("gtmConsent", !!c.gtmConsent, c.gtmConsent ? "true" : "false");
    h += pill("hasResponse", !!c.hasResponse, c.hasResponse ? "true" : "false");
    h += pill("GTM injiziert", !!snap.init, snap.init ? "ja" : "nein");
    if (typeof snap.dataLayerLen === "number") h += '<span class="chip">dataLayer: ' + snap.dataLayerLen + "</span>";
    if (st.active) h += '<span class="chip warn">⚠ consent_check simuliert</span>';
    if (snap.blocked) h += '<span class="chip err">⊘ aGTM blockiert</span>';

    var idRow = c.serviceIDs || c.vendorIDs || c.purposeIDs;
    if (c.services || c.purposes || c.vendors || idRow) {
      h += '<div class="grid" style="margin-top:8px">';
      if (c.purposes) h += '<div class="k">purposes</div><div class="v">' + esc(c.purposes) + "</div>";
      if (c.services) h += '<div class="k">services</div><div class="v">' + esc(c.services) + "</div>";
      if (c.vendors) h += '<div class="k">vendors</div><div class="v">' + esc(c.vendors) + "</div>";
      if (c.purposeIDs) h += '<div class="k">purposeIDs</div><div class="v">' + esc(c.purposeIDs) + "</div>";
      if (c.serviceIDs) h += '<div class="k">serviceIDs</div><div class="v">' + esc(c.serviceIDs) + "</div>";
      if (c.vendorIDs) h += '<div class="k">vendorIDs</div><div class="v">' + esc(c.vendorIDs) + "</div>";
      h += "</div>";
    }
  }
  if (SIM_LAST) {
    var okc = SIM_LAST.ok ? "ok" : "err";
    h += '<div style="margin-top:8px;border-top:1px solid var(--border);padding-top:6px;font-size:11px">' +
      '<span class="chip ' + okc + '">' + (SIM_LAST.ok ? "OK" : "Fehler") + "</span> " +
      '<span class="muted">' + esc(SIM_LAST.label || "") + (SIM_LAST.ts ? " · " + fmtTime(SIM_LAST.ts) : "") + "</span>" +
      (SIM_LAST.error ? ' <span style="color:var(--err)">' + esc(SIM_LAST.error) + "</span>" : "");
    // Action-specific detail line (scenario counts / GCM signals / cookie reset / POST).
    var det = "";
    if (SIM_LAST.scenario) {
      det = "Events gefeuert: " + (SIM_LAST.scenario.firedEvents | 0) + " · bei Deny geparkt: " + (SIM_LAST.scenario.queuedWhileDenied | 0);
      if (SIM_LAST.scenario.alreadyInjected && (SIM_LAST.scenario.queuedWhileDenied | 0) > 0) {
        det += " · ⚠ GTM war bereits injiziert → kein Replay (Events bleiben in aGTM.d.f). Für einen echten Ablauf: Cookies löschen + neu laden.";
      }
    } else if (SIM_LAST.signals) {
      var parts = [];
      for (var sk in SIM_LAST.signals) if (Object.prototype.hasOwnProperty.call(SIM_LAST.signals, sk)) parts.push(sk + "=" + SIM_LAST.signals[sk]);
      det = "consent " + (SIM_LAST.mode || "update") + " → " + (SIM_LAST.dataLayer || "dataLayer") + ": " + (parts.join(", ") || "—");
      // A default/declare that went out AFTER the tag settled was forced past the guard —
      // it is in the dataLayer but changes nothing. Say so rather than leave a green OK.
      if (SIM_LAST.late && SIM_LAST.mode && SIM_LAST.mode !== "update") {
        det += " · ⚠ zu spät gepusht (Guard übergangen) — wirkungslos für den bereits verarbeiteten Zustand.";
      }
    } else if (typeof SIM_LAST.clearedCount === "number") {
      if (!SIM_LAST.clearedCount && !SIM_LAST.lsCleared) {
        // A reset that matched nothing used to report plain success — the user could not
        // tell the difference between "cleared" and "your CMP is not in the pattern list"
        // (that is how Consentmanager slipped through, see SIM_COOKIE_DEFAULT).
        det = "⚠ Kein Cookie passte auf die Muster — nichts gelöscht. Cookie-Namen im Application-Tab prüfen und ein passendes Fragment ergänzen (leeres Feld = alle Cookies).";
      } else {
        // Name the cookies, not just the count — that is what tells you whether YOUR
        // CMP was actually covered by the patterns.
        var nm = (SIM_LAST.cleared || []).slice(0, 8).join(", ");
        var more = (SIM_LAST.cleared || []).length > 8 ? " …" : "";
        det = "Cookies gelöscht: " + SIM_LAST.clearedCount + (nm ? " (" + nm + more + ")" : "") +
          (SIM_LAST.lsCleared ? " · localStorage: " + SIM_LAST.lsCleared : "");
        if (SIM_FRAME_EXTRA) {
          det += " · Drittanbieter-Frames: " + SIM_FRAME_EXTRA.frames +
            (SIM_FRAME_EXTRA.cookies.length ? " → " + SIM_FRAME_EXTRA.cookies.slice(0, 6).join(", ") : " → nichts gefunden") +
            (SIM_FRAME_EXTRA.ls ? " · localStorage: " + SIM_FRAME_EXTRA.ls : "");
        }
        det += (SIM_LAST.reloading ? " · lädt neu…" : "");
      }
    } else if (SIM_LAST.loadedContainers && SIM_LAST.loadedContainers.length) {
      det = "Container geladen: " + SIM_LAST.loadedContainers.join(", ");
    } else if (SIM_LAST.consentStoreUrl) {
      det = "POST → " + SIM_LAST.consentStoreUrl;
    }
    if (det) h += '<div class="muted" style="margin-top:3px;font-size:11px">' + esc(det) + "</div>";
    h += "</div>";
  }
  // The GCM box lives outside #sim-live but its "Ist-Zustand" line must track the poll,
  // so refresh it here — BEFORE the unchanged-HTML early return below, which only
  // concerns #sim-live's own markup.
  var gcmStat = el("sim-gcm-status");
  if (gcmStat) {
    var gh = simGcmStatusInner(snap);
    if (gcmStat.__lastHTML !== gh) { gcmStat.__lastHTML = gh; gcmStat.innerHTML = gh; }
  }
  if (node.__lastHTML === h) return;
  node.__lastHTML = h;
  node.innerHTML = h;
}

/* ---------- listeners ---------- */
// Delegated listeners live on the PERSISTENT #tab-sim node (which innerHTML swaps do
// NOT replace), so they must be attached exactly ONCE — otherwise every rebuild
// (write-toggle, preset load, event fire) would stack another handler and fire N×.
// Direct listeners on rebuilt inner nodes (buttons, toggle, flags) are (re)attached
// per build in attachSimListeners.
// Exact class-token test. The delegated handlers used to match with indexOf, which is
// fine while class names are disjoint — but "sim-gcm-mode" CONTAINS "sim-gcm", so the
// mode radios would have been processed as signal checkboxes (writing a null key into
// the persisted gcm map). Match whole tokens instead (card #51).
function hasCls(node, cls) {
  if (!node || !node.className) return false;
  return (" " + String(node.className) + " ").indexOf(" " + cls + " ") >= 0;
}

function attachSimDelegatedOnce() {
  var root = el("tab-sim");
  if (!root || root.__simDelegated) return;
  root.__simDelegated = true;

  // consent token checkboxes + per-group useId toggle
  root.addEventListener("change", function (e) {
    var t = e.target;
    // The GCM mode radios (id-less, class "sim-gcm-mode") come BEFORE the signal
    // checkboxes because a substring test would match both — see hasCls.
    if (t && t.id === "sim-gcm-force") { simState().gcmForce = !!t.checked; return; }
    if (hasCls(t, "sim-gcm-mode")) {
      if (!t.checked) return;
      var stm = simState();
      stm.gcmMode = t.value;
      stm.gcmForce = false;   // an override never carries over to another verb
      simSave(); buildSimScaffold();
      return;
    }
    if (!t || !t.className) return;
    var cn = String(t.className);
    if (cn.indexOf("sim-tok") >= 0) {
      var m = simConsentModel(state.snap || {});
      var g = t.getAttribute("data-grp"), i = +t.getAttribute("data-i");
      if (m[g] && m[g][i]) { m[g][i].on = t.checked; simSave(); }
    } else if (cn.indexOf("sim-useid") >= 0) {
      var m2 = simConsentModel(state.snap || {});
      if (!m2.useId) m2.useId = {};
      m2.useId[t.getAttribute("data-grp")] = t.checked;
      simSave();
      buildSimScaffold(); // re-render so the ID field emphasis + name dimming update
    } else if (hasCls(t, "sim-gcm")) {
      var st = simState();
      var sig = t.getAttribute("data-sig");
      if (!sig) return;   // no signal to toggle → never write a null key into st.gcm
      if (!st.gcm || typeof st.gcm !== "object") st.gcm = simDefaultGcm();
      st.gcm[sig] = t.checked ? "granted" : "denied";
      simSave();
    }
  });
  // id fields + fire textarea + integration textarea + cookie patterns + scenario
  root.addEventListener("input", function (e) {
    var t = e.target;
    if (t && t.className && String(t.className).indexOf("sim-id") >= 0) {
      var m = simConsentModel(state.snap || {});
      var g = t.getAttribute("data-grp"), i = +t.getAttribute("data-i");
      if (m[g] && m[g][i]) { m[g][i].id = t.value; simSave(); }
    } else if (t && t.id === "sim-fire") {
      simState().fireText = t.value; simSave();
    } else if (t && t.id === "sim-integration") {
      simState().injectCode = t.value; simSave();
    } else if (t && t.id === "sim-cookie-pats") {
      simState().cookiePats = t.value; simSave();
    } else if (t && t.id === "sim-gcm-wait") {
      simState().gcmWait = t.value; simSave();
    } else if (t && t.id === "sim-gcm-regions") {
      simState().gcmRegions = t.value; simSave();
    } else if (t && t.id === "sim-scn") {
      simState().scenarioText = t.value; simSave();
    } else if (t && t.id === "sim-container-ids") {
      simState().containerIds = t.value; simSave();
    }
  });
  // add a token on Enter in a .sim-add field
  root.addEventListener("keydown", function (e) {
    var t = e.target;
    if (e.key === "Enter" && t && t.className && String(t.className).indexOf("sim-add") >= 0) {
      e.preventDefault();
      var name = (t.value || "").replace(/^\s+|\s+$/g, "");
      if (!name) return;
      var m = simConsentModel(state.snap || {});
      var g = t.getAttribute("data-grp");
      var row = { name: name, id: "", on: true }; // uniform row shape across all groups
      m[g].push(row); simSave();
      buildSimScaffold();
    }
  });
  // presets + event-history chips (delegated because the chips are rebuilt often)
  root.addEventListener("click", function (e) {
    var t = e.target;
    if (t && t.className && String(t.className).indexOf("sim-preset-del") >= 0) {
      var i = +t.getAttribute("data-i"); var st = simState();
      st.presets.splice(i, 1); simSave(); buildSimScaffold();
    } else if (t && t.className && String(t.className).indexOf("sim-preset") >= 0) {
      var j = +t.getAttribute("data-i"); var st2 = simState();
      if (st2.presets[j]) { st2.consent = JSON.parse(JSON.stringify(st2.presets[j].consent)); simSave(); buildSimScaffold(); }
    } else if (t && t.className && String(t.className).indexOf("sim-ev") >= 0) {
      var k = +t.getAttribute("data-i"); var st3 = simState();
      var ta = el("sim-fire"); if (ta && st3.events[k]) { ta.value = st3.events[k]; st3.fireText = st3.events[k]; simSave(); }
    }
  });
}

// Direct listeners on the just-rebuilt inner nodes (recreated on every innerHTML
// swap, so old handlers are GC'd with the old nodes — no accumulation).
function attachSimListeners() {
  attachSimDelegatedOnce();

  // write toggle
  var wt = el("sim-write");
  if (wt) wt.addEventListener("change", function () {
    SIM_WRITE = wt.checked;
    buildSimScaffold(); // rebuild so buttons enable/disable + banner colour flip
  });

  // flag checkboxes
  ["_noConsent:sim-f-noconsent", "_noDLPush:sim-f-nodl", "_post:sim-f-post"].forEach(function (pair) {
    var parts = pair.split(":"), key = parts[0], id = parts[1];
    var b = el(id);
    if (b) b.addEventListener("change", function () { simState().flags[key] = b.checked; simSave(); });
  });

  // action buttons
  bindClick("sim-grant", function () {
    var sel = simSelection(simConsentModel(state.snap || {}));
    simRun(window.aGTMInspectorSim.buildConsentCode(sel), "Consent erteilt");
  });
  bindClick("sim-deny", function () {
    simRun(window.aGTMInspectorSim.buildDenyCode(), "Alles abgelehnt");
  });
  bindClick("sim-reset", function () {
    simRun(window.aGTMInspectorSim.buildResetCode(), "Reset + CMP restore");
  });
  bindClick("sim-restore", function () {
    simRun(window.aGTMInspectorSim.buildRestoreCode(), "consent_check wiederhergestellt");
  });
  bindClick("sim-inject", function () {
    simRun(window.aGTMInspectorSim.buildInjectCode(), "GTM-Injection erzwungen");
  });
  bindClick("sim-container-load", function () {
    var input = el("sim-container-ids");
    var raw = input ? input.value : (simState().containerIds || "");
    var ids = window.aGTMInspectorSim.splitTokens(raw);
    if (!ids.length) { return; }
    simState().containerIds = raw; simSave();
    simRun(window.aGTMInspectorSim.buildLoadContainerCode(ids), "GTM-Container geladen: " + ids.join(", "));
  });
  var blockCb = el("sim-block-cb");
  if (blockCb) blockCb.addEventListener("change", function () {
    var st = simState();
    st.blockIntent = blockCb.checked; simSave();
    if (blockCb.checked) simRun(window.aGTMInspectorSim.buildBlockCode(), "aGTM blockiert");
    else simRun(window.aGTMInspectorSim.buildUnblockCode(), "aGTM entsperrt");
  });
  bindClick("sim-inject-int", function () {
    var ta = el("sim-integration");
    var code = ta ? ta.value : "";
    if (!code || !String(code).replace(/^\s+|\s+$/g, "")) return;
    simState().injectCode = code; simSave();
    simRun(window.aGTMInspectorSim.buildInjectIntegrationCode(code), "Integration injiziert");
  });

  // GCM push. The mode radios, the two default-only text fields and the force
  // checkbox are all handled by the delegated listeners (attachSimDelegatedOnce) —
  // switching the mode rebuilds the scaffold, and `force` is deliberately NOT
  // persisted: overriding the timing guard is a one-off decision, not a setting that
  // should silently survive the next panel open.
  bindClick("sim-gcm-push", function () {
    var st = simState();
    var mode = simGcmMode(st);
    var code = window.aGTMInspectorSim.buildGcmPushCode(st.gcm, (state.snap && state.snap.gdl) || "", {
      mode: mode,
      waitForUpdate: st.gcmWait,
      regions: window.aGTMInspectorSim.splitTokens(st.gcmRegions || ""),
      force: !!st.gcmForce
    });
    // Label in the neutral form: the guard may refuse, and "gepusht" next to an error
    // chip would be exactly the false success this feature exists to prevent.
    simRun(code, "GCM consent " + mode + " push");
  });

  // Cookie reset flag checkboxes + button
  var ckLs = el("sim-cookie-ls");
  if (ckLs) ckLs.addEventListener("change", function () { simState().cookieLS = ckLs.checked; simSave(); });
  var ckFr = el("sim-cookie-frames");
  if (ckFr) ckFr.addEventListener("change", function () { simState().cookieFrames = ckFr.checked; simSave(); });
  var ckRl = el("sim-cookie-reload");
  if (ckRl) ckRl.addEventListener("change", function () { simState().cookieReload = ckRl.checked; simSave(); });
  bindClick("sim-cookie-reset-pats", function (ev) {
    if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
    var st = simState();
    st.cookiePats = SIM_COOKIE_DEFAULT; simSave(); buildSimScaffold();
  });
  bindClick("sim-cookie-reset", function () {
    var st = simState();
    var input = el("sim-cookie-pats");
    var raw = input ? input.value : (st.cookiePats || "");
    var pats = window.aGTMInspectorSim.splitTokens(raw);
    var SIMB = window.aGTMInspectorSim;
    // Third-party CMP frames first, THEN the top frame — the top-frame run is the one
    // that may reload, and a reload would cut the frame work short.
    if (!st.cookieFrames) {
      simRun(SIMB.buildCookieResetCode(pats, { clearStorage: !!st.cookieLS, reload: !!st.cookieReload }), "Cookies zurückgesetzt");
      return;
    }
    var frameCode = SIMB.buildCookieResetCode(pats, { clearStorage: !!st.cookieLS, reload: false });
    simFrameOrigins(function (origins) {
      var pending = origins.length, hits = [], lsHits = 0;
      function finish() {
        var res = simRun(SIMB.buildCookieResetCode(pats, { clearStorage: !!st.cookieLS, reload: !!st.cookieReload }), "Cookies zurückgesetzt");
        // Fold the frame results into the effect line once the top-frame call returns.
        SIM_FRAME_EXTRA = hits.length || lsHits
          ? { frames: origins.length, cookies: hits, ls: lsHits }
          : (origins.length ? { frames: origins.length, cookies: [], ls: 0 } : null);
        return res;
      }
      if (!pending) { finish(); return; }
      origins.forEach(function (o) {
        simRunInFrame(frameCode, o, function (r) {
          if (r) {
            (r.cleared || []).forEach(function (n) { if (hits.indexOf(n) < 0) hits.push(n); });
            lsHits += (r.lsCleared | 0);
          }
          if (--pending === 0) finish();
        });
      });
    });
  });

  // Scenario runner
  bindClick("sim-scn-run", function () {
    var ta = el("sim-scn"); var errEl = el("sim-scn-err");
    var evs;
    try { evs = JSON.parse(ta.value); } catch (e) { if (errEl) errEl.innerHTML = '<span style="color:var(--err)">Ungültiges JSON: ' + esc(e.message) + "</span>"; return; }
    if (Object.prototype.toString.call(evs) !== "[object Array]") { if (errEl) errEl.innerHTML = '<span style="color:var(--err)">Array von Event-Objekten erwartet</span>'; return; }
    if (errEl) errEl.textContent = "";
    simState().scenarioText = ta.value; simSave();
    var sel = simSelection(simConsentModel(state.snap || {}));
    simRun(window.aGTMInspectorSim.buildScenarioCode(sel, evs), "Szenario: deny→fire→grant");
  });

  // consent-store POST test
  bindClick("sim-cstore", function () {
    var sel = simSelection(simConsentModel(state.snap || {}));
    simRun(window.aGTMInspectorSim.buildConsentStoreTestCode(sel), "Consent-Store-POST ausgelöst");
  });
  bindClick("sim-fire-btn", function () {
    var ta = el("sim-fire"); var errEl = el("sim-fire-err");
    var obj;
    try { obj = JSON.parse(ta.value); } catch (e) { if (errEl) errEl.innerHTML = '<span style="color:var(--err)">Ungültiges JSON: ' + esc(e.message) + "</span>"; return; }
    if (!obj || typeof obj !== "object") { if (errEl) errEl.innerHTML = '<span style="color:var(--err)">Objekt erwartet</span>'; return; }
    if (errEl) errEl.textContent = "";
    var flags = simState().flags || {};
    // remember in history (dedup, newest first)
    var st = simState();
    var txt = ta.value;
    st.events = [txt].concat((st.events || []).filter(function (x) { return x !== txt; })).slice(0, 10);
    simSave();
    simRun(window.aGTMInspectorSim.buildFireCode(obj, flags), "fire " + (obj.event || "?"));
    buildSimScaffold();
  });

  // presets
  bindClick("sim-preset-save", function () {
    var nameEl = el("sim-preset-name");
    var name = (nameEl && nameEl.value || "").replace(/^\s+|\s+$/g, "");
    if (!name) return;
    var m = simConsentModel(state.snap || {});
    var st = simState();
    st.presets = (st.presets || []).filter(function (p) { return p.name !== name; });
    st.presets.unshift({ name: name, consent: JSON.parse(JSON.stringify(m)) });
    simSave(); buildSimScaffold();
  });
  // (preset/event-history chip clicks are handled by the delegated listener in
  // attachSimDelegatedOnce — do NOT re-attach a root click handler here.)
}

function bindClick(id, fn) {
  var b = el(id);
  if (b) b.addEventListener("click", fn);
}

// Expose the pure consent-selection mapping (name↔ID resolution per group) on the
// same namespace/exports as the code builders so it can be unit-tested.
if (typeof window !== "undefined" && window.aGTMInspectorSim) window.aGTMInspectorSim.simSelection = simSelection;
if (typeof module !== "undefined" && module.exports) module.exports.simSelection = simSelection;
// hasCls guards the delegated handlers against prefix collisions between class names
// (card #51) — pure and worth a regression test of its own.
if (typeof window !== "undefined" && window.aGTMInspectorSim) window.aGTMInspectorSim.hasCls = hasCls;
if (typeof module !== "undefined" && module.exports) module.exports.hasCls = hasCls;
// The curated cookie-name defaults, so the test asserts against the SHIPPED list
// instead of a copy that silently drifts from it.
if (typeof window !== "undefined" && window.aGTMInspectorSim) window.aGTMInspectorSim.SIM_COOKIE_DEFAULT = SIM_COOKIE_DEFAULT;
if (typeof module !== "undefined" && module.exports) module.exports.SIM_COOKIE_DEFAULT = SIM_COOKIE_DEFAULT;
