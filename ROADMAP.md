# aGTM Roadmap

This roadmap outlines planned features and milestones for aGTM. It reflects current intentions and may change.

## v1.5 — in development

- POST transport layer: `aGTM.f.xsend()` for direct HTTP POST to a configurable endpoint
- `aGTM.f.enc()` for payload obfuscation (Base64 + Caesar shift, compatible with aEvents GTM tag)
- New config options: `transport_url`, `transport_enc`, `transport_salt`
- `_post` event property in `aGTM.f.fire()` for per-event POST configuration and encryption
- Foundation for standalone aGTM usage without a webGTM container
- New CMPs: JTL Consent, JTL EU Cookie
- New GTM Variable Templates: Consent Check, Consent Info
- Build script (`build.sh`) for automated minification and Base64 generation

## v2.0 — planned (breaking changes)

- Remove deprecated `vPageview` event (deprecated since v1.4, use `aPageview` instead)
- Standalone mode: aGTM fully functional without a webGTM container — `aGTM.f.fire()` as a complete event dispatcher sending directly to sGTM via POST
- Consolidation of breaking changes accumulated since v1.0
