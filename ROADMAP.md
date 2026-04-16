# aGTM Roadmap

This roadmap outlines planned features and milestones for aGTM. It reflects current intentions and may change.

## v1.5 — released *16.04.2026*

- POST transport layer: `aGTM.f.xsend()` for direct HTTP POST to a configurable endpoint
- `aGTM.f.enc()` for payload obfuscation (Base64 + Caesar shift, compatible with aEvents GTM tag)
- New config options: `transport_url`, `transport_enc`, `transport_salt`
- `_post` event property in `aGTM.f.fire()` for per-event POST configuration and encryption
- `_noConsent` event property: bypasses consent gate for both DL push and POST
- Foundation for standalone aGTM usage without a webGTM container
- New CMPs: JTL Consent, JTL EU Cookie
- New GTM Variable Templates: Consent Check, Consent Info
- Build script (`build.sh`) for automated minification and Base64 generation

## Backlog / To Be Reviewed

- **`ck` URL parameter for consent signaling**: Appends a `ck` parameter to the GTM request URL (`gtm.js`) based on the user's consent state (`ck=0`: inactive, `ck=1`: active but no consent, `ck=2`: active and consent granted). Intended to pass consent information to server-side GTM (sGTM) during the webGTM delivery request. Config options would be `ckServices`, `ckVendors`, `ckPurposes`. Feature is documented in `README.md` but not yet implemented in code. **To be reviewed:** check whether this is still needed given the POST transport layer added in v1.5, or whether it should be properly implemented or removed.

## v1.6 — planned

- Browser-based test & demo playground (`agtm.net`) — interactive scenario runner with simulated GTM, mock CMP and session endpoint
- Additional CMP integrations (to be determined)
- Review and potential implementation of `ck` URL parameter feature (see Backlog above)
- Further standalone mode improvements (`aGTM.f.fire()` without webGTM container)

## v2.0 — planned (breaking changes)

- Remove deprecated `vPageview` event (deprecated since v1.4, use `aPageview` instead)
- Standalone mode: aGTM fully functional without a webGTM container — `aGTM.f.fire()` as a complete event dispatcher sending directly to sGTM via POST
- Consolidation of breaking changes accumulated since v1.0
