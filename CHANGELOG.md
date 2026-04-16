# Changelog

## Version 1.5 — *16.04.2026*
- Session & User Data feature: `aGTM.f.xfetch()` for POST with response handling
- New config options: `user_id`, `session_url`, `session_salt`, `session_wait`, `session_timeout`, `session_gtm_on_deny`
- Session data stored in `aGTM.d.session` (fields: `sid`, `uid`, `sst`, `ret`, `cst`, `ref`, `vct` + dynamic)
- Auto-denial: returning visitors without consent decision get `hasResponse=true`, `services=",aGTMconsent,"`, `gtmConsent=session_gtm_on_deny`; explicit later CMP decision always overrides
- `session_salt` doubles as fallback salt for POST transport
- iframe queue bug fixed: `iFrameFire()` now correctly queues to `aGTM.d.f`
- Consent polling interval changed from 1000ms to 500ms
- POST transport layer added: `aGTM.f.xsend()` for direct HTTP POST, `aGTM.f.enc()` for payload obfuscation
- New config options: `transport_url`, `transport_enc`, `transport_salt`
- `_post` event property in `aGTM.f.fire()` for per-event POST configuration (optional encryption, deduplication via `_post_sent`)
- `_noConsent` event property: bypasses consent gate in `fire()` for both DL push and POST; event remains visible in dataLayer
- Foundation for standalone aGTM usage without webGTM
- New CMPs: JTL Consent, JTL EU Cookie
- New GTM Variable Templates: Consent Check, Consent Info
- GTM template files renamed (spaces instead of dashes)
- Build script (`build.sh`) added for automated minification and Base64 generation
- `iframeSupport`, `gtmAttr`, `dlSet`, `vPageviewsTimer`, `vPageviewsFallback` config options documented
- Developer documentation expanded
- Debug `console.log` removed from `urlListener`
- String obfuscation for Google identifiers unified

## Version 1.4.2 — *11.09.2025*
- CMP cookie-storage check added for Service/Vendor/Purpose
- Bot Check API added to sGTM template
- GTM Variable Templates added
- New CMPs: Shopware 5 Cookie, Shopware 6 Cookie
- Bugfix in OneTrust CookiePro Consent Check

## Version 1.4.1 — *04.07.2025*
- Improved Usercentrics v3 Consent Check
- New CMP: Shopify Consent
- Improved Click Listener
- aGTM Configurator added (thanks to marco.brenn@inbiz.de)

## Version 1.4 — *27.05.2025*
- `sStrf` function improved
- Click Listener Tag: outbound click bug fixed, configurable event name added
- Pageview Template: virtual pageview support added; event renamed from `vPageview` to `aPageview` (**breaking**), `vPageview` deprecated (removed in 2.0)
- dataLayer monitoring and restoring feature added (`dlOrgPush`)
- `aGTM.f.init()` removed from end of `aGTM.js` and `aGTM.min.js`
- New Base64 version `aGTM.base64` added

## Version 1.3 — *25.03.2025*
- sGTM Client Template added
- Custom `JSON.stringify` function to handle circular objects
- Fix for non-object dataLayer entries
- New CMPs: Secure Privacy, Perspective Funnel

## Version 1.2.2 — *10.02.2025*
- Exception handling for unexpected event objects
- Bugfix for initialization with legacy CMP functions
- MS Consent Mode bug fixed

## Version 1.2.1 — *22.01.2025*
- New and updated CMP functions
- Fix for missing `aGTM.n` object

## Version 1.2 — *07.11.2024*
- New GTM option `noConsent`: fire container without consent check
- New CMP option `none`: skip consent check entirely
- New setting `sendConsentEvent`
- aGTM can now load without injecting a container
- OptOut function added
- Bugfix for multiple GTM containers
- MS Consent Mode added to Consent Mode Template
- New CMP functions
- GTM templates moved into per-template subdirectories

## Version 1.1.3 — *27.06.2024*
- GTM PING filter in `fire` function
- New settings in GTM Repeat and Click Templates

## Version 1.1.2 — *19.06.2024*
- Bugfix for JS Error Listener
- New CMPs: Shopware Acris Cookie, Clickskeks

## Version 1.1.1 — *13.06.2024*
- Bugfix for DOMready/PAGEready listener and vPageview template

## Version 1.1 — *04.06.2024*
- Improved functions for GTM Custom Template usage
- New GTM Template: Pageview/State Events with device info and bot detection
- **Breaking:** default values of `dlStateEvents` and `vPageview` changed from `true` to `false`

## Version 1.0.1 — *28.05.2024*
- Bugfix in `config` function
- Documentation adjustments

## Version 1.0 — *10.04.2024*
- Initial release
