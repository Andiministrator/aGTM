/**
 * aGTM Inspector — log decode table.
 *
 * Verbatim copy of aGTM.d.logmap from aGTM_debug.js (repo root). aGTM.l entries are
 * { id, timestamp, obj }; this maps the id to a human-readable type/message.
 *
 * KEEP IN SYNC: if aGTM_debug.js's logmap changes, update this copy. (A future
 * build-time sync script — like scripts/cmp-sync-lib.js — could automate this.)
 */
window.AGTM_LOGMAP = {
  e1:  { type: "err", msg: "call of function aGTM.f.config, but config was already set" },
  e2:  { type: "err", msg: "call of function aGTM.f.consent_check, but you need to run the config before" },
  e3:  { type: "err", msg: "aGTM.f.consent_check called, but action argument (a) is not valid" },
  e4:  { type: "err", msg: "call of function aGTM.f.consent, but you need to run the config before" },
  e5:  { type: "err", msg: "aGTM.f.consent called, but action argument (a) is not valid" },
  e6:  { type: "err", msg: "" },
  e7:  { type: "err", msg: "call of function aGTM.f.tm_init, but you need to run the config before" },
  e8:  { type: "err", msg: "call of function aGTM.f.tm_inject, but you need to run the config before" },
  e9:  { type: "err", msg: "aGTM.f.fire called, but argument is not an object" },
  e10: { type: "err", msg: "aGTM.f.consent_check called, but action argument (a) is not valid" },
  e11: { type: "err", msg: "aGTM.f.addEvListener called, but one argument is not valid" },
  e12: { type: "err", msg: "aGTM.f.addEvListener called, but there is a problem with with addEventListener" },
  e13: { type: "err", msg: "call of function aGTM.f.tm_inject, but consent not available" },
  e14: { type: "err", msg: "call of function aGTM.f.run_cc, but consent_check function not available" },
  e15: { type: "err", msg: "aGTM.f.fire Error, Object cannot be parsed with JSON.parse" },
  e16: { type: "err", msg: "aGTM.f.sStrf Error, no object (or null) given" },
  e17: { type: "err", msg: "aGTM.f.inject Error, DataLayer Object is not an object (or null)" },
  m1:  { type: "msg", msg: "aGTM.f.config was successful set" },
  m2:  { type: "msg", msg: "aGTM.f.consent_check has checked the consent and consent is available now" },
  m3:  { type: "msg", msg: "Consent Setup complete" },
  m5:  { type: "msg", msg: "GTAG initial call injected" },
  m6:  { type: "msg", msg: "GTM initial call injected" },
  m7:  { type: "msg", msg: "Event prepared for dataLayer.push" },
  m8:  { type: "msg", msg: "Consent Setup called, but consent not (yet) available" },
  m9:  { type: "msg", msg: "Event fired to dataLayer" },
  m_consent_no_conditions:  { type: "msg", msg: "GTM was NOT loaded: no consent condition is configured (gtmPurposes/gtmServices/gtmVendors are all empty). An empty requirement is fail-closed since v1.5 — configure a condition, or set allowEmptyConsentConditions:true to load GTM without any consent gate" },
  m_session_preset:         { type: "msg", msg: "Session preset accepted from cfg.session (no usable consent block)" },
  m_session_preset_consent: { type: "msg", msg: "Session preset accepted from cfg.session, incl. a valid consent block" },
  m_bot_preset:             { type: "msg", msg: "Bot-check verdict accepted from cfg.bot into aGTM.d.bot" },
  m_ppcm_scan:              { type: "msg", msg: "PP Consent Manager: cookie scan result (prefix searched, matching/skipped cookies)" },
  m_consent_store_post:     { type: "msg", msg: "Consent diff POSTed to consent_store_url" },
  m_consent_store_synced:   { type: "msg", msg: "Consent store POST confirmed by the server (2xx)" },
  m_uid_promoted:           { type: "msg", msg: "Server promoted the user ID (F.* fingerprint to C.* cookie), adopted" },
  e_consent_store:          { type: "err", msg: "Consent store POST failed (non-2xx response)" },
  e_consent_store_parse:    { type: "err", msg: "Consent store response could not be parsed as JSON" },
  e_xsend:                  { type: "err", msg: "aGTM.f.xsend Error, request could not be sent" }
};
