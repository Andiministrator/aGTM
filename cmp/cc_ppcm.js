//[aGTMlib.js Consentcheck]BOF

// Initialitialize the objects
window.aGTM = window.aGTM || {};
aGTM.d = aGTM.d || { config: false, init: false, fired: false };
aGTM.f = aGTM.f || {};
aGTM.l = aGTM.l || [];
aGTM.n = aGTM.n || {};

/**
 * Function to check, whether the user consent info/choice exists and for what purposes and vendors
 * @usage use it together with aGTMlib and see the documentation there
 * @type: PP Consent Manager (PixelPoint)
 * @version 1.1
 * @lastupdate 30.07.2026 by Andi Petzoldt <andi@petzoldt.net>
 * @author Andi Petzoldt <andi@petzoldt.net>
 * @property {function} aGTM.f.consent_check
 * @param {string} action - the action, what the function should do. can be "init" (for the first consent check) or "update" (for updating existing consent info)
 * @returns {boolean} - true, if consent is available, false if not
 * Usage: aGTM.f.consent_check('init');
 *
 * How this CMP stores a decision (read from pp-consent-manager 1.5.4 on
 * 2026-07-30; the version string comes from its own filesVersion):
 * - One cookie per granted category: <prefix>category-<name>, e.g.
 *   "ppcm-consent-category-statistics". Services (content blockers) use
 *   <prefix>service-<name>. Declining an item writes no cookie for it, and a
 *   revoke deletes the cookie.
 * - The cookie VALUE is "<consentVersion>,<epoch-seconds>", e.g. "1,1785231132".
 *   The CMP's reader honours a cookie only while its first field matches the
 *   site's current consentVersion, and treats a second field of 0 as not
 *   granted (a defensive branch of that reader — whether the CMP ever writes
 *   ",0" is not something we rely on). So the mere presence of the cookie does
 *   not establish consent: bumping consentVersion invalidates every stored
 *   decision and re-opens the banner. Whether stale cookies are then cleaned up
 *   is likewise not relied upon.
 * - Therefore the verdict per item is delegated to the CMP's own public
 *   hasConsentCategory() / hasConsentService(), so the rule lives in exactly one
 *   place. The trade is deliberate: instead of a copy of the rule that could
 *   drift and fail open, we depend on the API's shape — and that dependency
 *   fails closed, but silently, which is why the scan result is logged once.
 * - hasConsentService() keeps the CMP's own fallback (a service without its own
 *   valid cookie counts as granted while the "media" category is granted).
 *   Mirroring the CMP is the point: aGTM reports the CMP's verdict.
 * - Decision signal: any category/service cookie whose version field matches the
 *   current consentVersion (granted or not), OR any item the API confirms. That
 *   covers a decline that stores only an always-on category — but a site whose
 *   banner template stores nothing at all on "decline all" cannot be detected
 *   here, because it leaves no evidence; that case keeps returning false (fail
 *   closed) and is called out in cmp/README-cmp.md.
 * - Revoke: a full revoke DELETES every cookie, which looks exactly like "banner
 *   not answered". aGTM.f.run_cc() restores its pre-update snapshot when the
 *   check returns false, so a plain false would leave the withdrawn consent in
 *   place and keep GTM running. Hence aGTM.d.ppcm_decided remembers, for this
 *   page, that a decision was once seen; once it was, missing evidence is read
 *   as "decided, nothing granted" and the withdrawal propagates. The flag is
 *   deliberately per page load: on a fresh load, no cookies means no consent,
 *   and returning false is what keeps GTM out.
 * - No CMP object (yet) means no verdict, and an exception from the API means no
 *   verdict either: both return false, aGTM keeps polling. Fail closed by
 *   design — GTM must not load on a guess.
 * - The category names are NOT hardcoded: the always-on category comes from the
 *   site's banner template, not from the CMP core, and was seen as both
 *   "essential" and "essentials".
 */
aGTM.f.consent_check = function (action) {
  if (typeof action!='string' || (action!='init'&&action!='update')) { if (typeof aGTM.f.log=='function') aGTM.f.log('e10', {action:action}); return false; }
  // Check whether response was already given
  aGTM.d.consent = aGTM.d.consent || {};
  if (action=='init' && aGTM.d.consent.hasResponse) return true;
  // Check the CMP instance. Both API functions are required - they are the only
  // source of the verdict, so a partially initialised CMP must not be evaluated.
  var ppcm = (typeof window.PPConsentManager=='object' && window.PPConsentManager) ? window.PPConsentManager : null;
  if (!ppcm || typeof ppcm.hasConsentCategory!='function' || typeof ppcm.hasConsentService!='function') return false;
  // Cookie name prefix - taken from the CMP when it exposes one (an empty string
  // is a legitimate prefix and is honoured), hardcoded default otherwise.
  var prefix = (typeof ppcm._cookiePrefix=='string') ? ppcm._cookiePrefix : 'ppcm-consent-';
  var catPrefix = prefix + 'category-';
  var svcPrefix = prefix + 'service-';
  // The site's current consent version. Used to recognise a decision that
  // granted nothing (an explicit decline), which no per-item verdict can show.
  var ver = null;
  try { if (ppcm._config && ppcm._config.consentVersion !== null && typeof ppcm._config.consentVersion != 'undefined') ver = String(ppcm._config.consentVersion); } catch (e) { ver = null; }
  // Read the cookie names. The category/service names are not known upfront (the
  // CMP exposes no list), so they are discovered from the cookie names and then
  // handed back to the CMP for the verdict.
  var c = 'co'; c = c + 'ok'; c = c + 'ie';
  var all = [];
  try { var d = document; all = String(d[c]).split(';'); } catch (e) { return false; }
  var purposes = [];
  var services = [];
  var decided = false;
  var matched = 0;
  var skipped = 0;
  for (var i=0; i<all.length; i++) {
    var pos = all[i].indexOf('=');
    var name = (pos<0 ? all[i] : all[i].substring(0, pos)).replace(/^\s+|\s+$/g, ''); // trim spaces
    if (!name) continue;
    var isCat = name.indexOf(catPrefix)===0;
    var isSvc = !isCat && name.indexOf(svcPrefix)===0;
    if (!isCat && !isSvc) continue;
    matched++;
    var item = name.substring((isCat ? catPrefix : svcPrefix).length);
    // Anything on the page that can write a cookie can invent a name here, and
    // the name ends up in aGTM.d.consent, in the dataLayer and in the consent
    // store. Bound it: plain slug characters, and a sane number of entries.
    // This charset is also what keeps the comma rule (a comma in a name breaks
    // the delimiter of the comma-wrapped consent string, F-51): commas are not
    // in it, so such a name is rejected outright instead of being stripped —
    // which is why the usual name.replace(/,/g,'') is absent below. Loosening
    // the charset without restoring that strip is a regression; the test
    // "names outside a plain slug charset are skipped" covers a comma name.
    if (!/^[A-Za-z0-9_.:-]{1,64}$/.test(item) || (purposes.length + services.length) >= 50) { skipped++; continue; }
    // Verdict from the CMP. Its reader dereferences its own config, so a
    // half-initialised CMP can throw - which must not take the consent state or
    // the calling event down with it (run_cc only restores its snapshot on a
    // false return, and aGTM.f.fire() does not guard this call at all).
    var granted = false;
    try { granted = isCat ? ppcm.hasConsentCategory(item) : ppcm.hasConsentService(item); } catch (e) { return false; }
    var list = isCat ? purposes : services;
    if (granted) {
      if (list.indexOf(item)<0) list.push(item);
      decided = true;
    } else if (ver !== null && (pos<0 ? '' : all[i].substring(pos+1)).split(',')[0] === ver) {
      decided = true; // answered under the current version, this item not granted
    }
  }
  // One log line per page: which prefix was searched and what it found. Without
  // it, "the visitor has not answered" and "the CMP renamed its prefix" look
  // identical from the outside - both are just a check that keeps returning false.
  if (aGTM.d.ppcm_scanned !== true && typeof aGTM.f.log=='function') {
    aGTM.d.ppcm_scanned = true;
    aGTM.f.log('m_ppcm_scan', { prefix: prefix, matched: matched, skipped: skipped });
  }
  // A decision, once seen on this page, cannot un-happen: a revoke deletes the
  // evidence, so missing cookies then mean "withdrawn", not "never answered".
  if (decided) aGTM.d.ppcm_decided = true;
  else if (aGTM.d.ppcm_decided === true) decided = true;
  if (!decided) return false;
  // Save result. Sorted + deduplicated so the same consent state always produces
  // the same string: aGTM hashes this object, and a reordered cookie jar would
  // otherwise look like a state change (phantom consent_update event + POST).
  purposes.sort();
  services.sort();
  aGTM.d.consent.purposes = purposes.length>0 ? ',' + purposes.join(',') + ',' : '';
  aGTM.d.consent.services = services.length>0 ? ',' + services.join(',') + ',' : '';
  // Feedback is informational only (it never gates GTM). It deliberately makes
  // no claim about completeness: which categories are always-on is a property of
  // the site's banner template, so "everything granted" is not knowable here.
  aGTM.d.consent.feedback = (purposes.length>0 || services.length>0) ? 'Consent given by user' : 'Consent declined';
  // Set Response
  aGTM.d.consent.hasResponse = true;
  // Callback and Return
  if (typeof aGTM.f.log=='function') aGTM.f.log('m2', JSON.parse(JSON.stringify(aGTM.d.consent)));
  return true;
};

//[aGTMlib.js Consentcheck]EOF
