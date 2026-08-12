# aGTM Roadmap

This roadmap outlines planned features and milestones for aGTM. It reflects current intentions and may change.

## v1.5 — in development

- **Session feature redesigned (server-side, single source of truth)** — see [SESSION-REDESIGN.md](SESSION-REDESIGN.md). aGTM no longer issues a client-side session HTTP call; session + consent state arrive via a pre-populated `cfg.session` from the sGTM Client. CMP-derived consent is diffed against the preset and POSTed to a dedicated `consent_store_url`. Returning visitors with stored consent get GTM injected on the first tick (no CMP wait).
- Adaptive CMP poll (`consent_poll_ms`, default 2000ms) catches CMPs that emit consent updates via direct `dataLayer.push()` (CCM19, Cookiebot, Usercentrics, Klaro in GTM-mode, …) without going through `aGTM.f.fire()`.
- Server-side auto-denial in the sGTM Client: returning visitors without recorded consent get a denial-consent block embedded in the library response — no client-side fetch+wait dance.
- POST transport layer: `aGTM.f.xsend()` for direct HTTP POST to a configurable endpoint
- `aGTM.f.enc()` for payload obfuscation (Base64 + Caesar shift, compatible with aEvents GTM tag)
- New config options: `transport_url`, `transport_enc`, `transport_salt`, `consent_store_url`, `consent_store_enc`, `consent_poll_ms`, `session_salt`, `session`, `user_id`
- `_post` event property in `aGTM.f.fire()` for per-event POST configuration and payload obfuscation
- `_noConsent` event property: bypasses consent gate for both DL push and POST
- `_noDLPush` event property: skips the GTM dataLayer push but still records internally + still POSTs — for Google-independent event transport
- Foundation for standalone aGTM usage without a webGTM container
- **DL-Repeat / late-enrichment engine moved into the library** (`aGTM.f.dlrepeat`): the GTM "DL Repeat" tag is now a thin wrapper; the library watches the chosen source (`aGTM.d.f` / `aGTM.d.dl` / live `dataLayer`) and replays matching earlier events once the wait-event(s) arrive (or after a timeout). Includes the conditional gate syntax (`G?if=E[A]`) and the opt-in `aGTM_repeat_fallback` error signal with `aGTMrepeatMissing`/`aGTMrepeatWaited` diagnostics.
- New CMPs: JTL Consent, JTL EU Cookie
- New GTM Variable Templates: Consent Check, Consent Info
- Build script (`build.sh`) for automated minification and Base64 generation
- **aGTM Inspector** — a Chrome DevTools panel (`devtools-extension/`) showing the consent lifecycle, event queue/replay, GTM injection, session/attribution, the effective config and aGTM-relevant network traffic live, with a Diagnose tab (health-score, consent timeline, compliance report) and an opt-in Simulation tab for driving the flow without clicking a real banner.
- Test suite grown to over 1000 tests (`bun test` — the exact number moves with every commit; what matters is `0 fail`), plus `___TESTS___` scenarios in every GTM template and the sGTM Client

## v1.6 — planned

- Browser-based test & demo playground (`agtm.net`) — interactive scenario runner with simulated GTM, mock CMP, and mock consent-store endpoint
- Additional CMP integrations (to be determined)
- Further standalone mode improvements (`aGTM.f.fire()` without webGTM container)
- **Knowledge Base** — structured documentation hub covering the full aGTM ecosystem: webGTM, sGTM, aGTM, GTAG, GA4 Analytics Events, aEvents Client/Tag, measurement protocols, consent flows. Target audience: developers integrating aGTM. Format: Markdown as single source of truth, allowing export to HTML, static site generators (e.g. Docusaurus, MkDocs) or a Markdown-based CMS.

## v2.0 — planned (breaking changes)

- Remove deprecated `vPageview` event (deprecated since v1.4, use `aPageview` instead)
- Standalone mode: aGTM fully functional without a webGTM container — `aGTM.f.fire()` as a complete event dispatcher sending directly to sGTM via POST
- Consolidation of breaking changes accumulated since v1.0
- **Own sGTM preview / event monitoring**: a lightweight real-time event viewer for the aEvents pipeline, independent of Google's sGTM Preview. The aEvents Client already captures all incoming events — a visualisation layer (e.g. WebSocket push to a debug UI) is the missing piece. Replaces dependency on sGTM Preview for aEvents debugging.
