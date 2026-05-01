# aGTM Roadmap

This roadmap outlines planned features and milestones for aGTM. It reflects current intentions and may change.

## v1.5 — released *01.05.2026*

- **Session feature redesigned (server-side, single source of truth)** — see [SESSION-REDESIGN.md](SESSION-REDESIGN.md). aGTM no longer issues a client-side session HTTP call; session + consent state arrive via a pre-populated `cfg.session` from the sGTM Client. CMP-derived consent is diffed against the preset and POSTed to a dedicated `consent_store_url`. Returning visitors with stored consent get GTM injected on the first tick (no CMP wait).
- Adaptive CMP poll (`consent_poll_ms`, default 2000ms) catches CMPs that emit consent updates via direct `dataLayer.push()` (CCM19, Cookiebot, Usercentrics, Klaro in GTM-mode, …) without going through `aGTM.f.fire()`.
- Server-side auto-denial in the sGTM Client: returning visitors without recorded consent get a denial-consent block embedded in the library response — no client-side fetch+wait dance.
- POST transport layer: `aGTM.f.xsend()` for direct HTTP POST to a configurable endpoint
- `aGTM.f.enc()` for payload obfuscation (Base64 + Caesar shift, compatible with aEvents GTM tag)
- New config options: `transport_url`, `transport_enc`, `transport_salt`, `consent_store_url`, `consent_store_enc`, `consent_poll_ms`, `session_salt`, `session`, `user_id`
- `_post` event property in `aGTM.f.fire()` for per-event POST configuration and encryption
- `_noConsent` event property: bypasses consent gate for both DL push and POST
- `_noDLPush` event property: skips the GTM dataLayer push but still records internally + still POSTs — for Google-independent event transport
- Foundation for standalone aGTM usage without a webGTM container
- New CMPs: JTL Consent, JTL EU Cookie
- New GTM Variable Templates: Consent Check, Consent Info
- Build script (`build.sh`) for automated minification and Base64 generation
- Test suite grown to 134 tests across 13 files (`bun test`)

## Backlog / To Be Reviewed

- **`ck` URL parameter for consent signaling**: Appends a `ck` parameter to the GTM request URL (`gtm.js`) based on the user's consent state (`ck=0`: inactive, `ck=1`: active but no consent, `ck=2`: active and consent granted). Intended to pass consent information to server-side GTM (sGTM) during the webGTM delivery request. Config options would be `ckServices`, `ckVendors`, `ckPurposes`. Feature is documented in `README.md` but not yet implemented in code. **To be reviewed:** check whether this is still needed given the POST transport layer added in v1.5, or whether it should be properly implemented or removed.

## v1.6 — planned

- Browser-based test & demo playground (`agtm.net`) — interactive scenario runner with simulated GTM, mock CMP, and mock consent-store endpoint
- Additional CMP integrations (to be determined)
- Review and potential implementation of `ck` URL parameter feature (see Backlog above)
- Further standalone mode improvements (`aGTM.f.fire()` without webGTM container)
- **Knowledge Base** — structured documentation hub covering the full aGTM ecosystem: webGTM, sGTM, aGTM, GTAG, GA4 Analytics Events, aEvents Client/Tag, measurement protocols, consent flows. Target audience: developers integrating aGTM. Format: Markdown as single source of truth, allowing export to HTML, static site generators (e.g. Docusaurus, MkDocs) or a Markdown-based CMS.

## v2.0 — planned (breaking changes)

- Remove deprecated `vPageview` event (deprecated since v1.4, use `aPageview` instead)
- Standalone mode: aGTM fully functional without a webGTM container — `aGTM.f.fire()` as a complete event dispatcher sending directly to sGTM via POST
- Consolidation of breaking changes accumulated since v1.0
- **Own sGTM preview / event monitoring**: a lightweight real-time event viewer for the aEvents pipeline, independent of Google's sGTM Preview. The aEvents Client already captures all incoming events — a visualisation layer (e.g. WebSocket push to a debug UI) is the missing piece. Replaces dependency on sGTM Preview for aEvents debugging.
