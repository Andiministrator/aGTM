---
name: config-builder
description: >
  Build a correct aGTM configuration and init snippet for a given site setup.
  Use this skill when someone wants to integrate aGTM or generate/adjust an
  aGTM.f.config({…}) call: choosing the CMP, wiring GTM containers, consent-update
  events, dataLayer enrichment (dlSet), consent-store/session options, noConsent
  containers, and the event flags. Produces a ready-to-paste snippet and checks it
  against the common integration traps.
---

# aGTM — Build a configuration + init snippet

Generates a correct `aGTM.f.config({…})` + `aGTM.f.init()` for an integrator's
setup. The **authoritative option list lives in the public docs** — always read
them rather than inventing options:

- `README.md` (repo root) — every config option with examples (the canonical
  source; do not hardcode an option that isn't documented there).
- `README-for-Integrators.md` — the data contract (aGTM object, dataLayer,
  session/consent/attribution) for sGTM/webGTM integrations.

## How aGTM boots (must-know)

- The library ships with **no active `aGTM.f.init()` call** — that is the
  integrator's responsibility, by design. The boot order is always:
  1. load `aGTM.js` (or `aGTM.min.js`),
  2. `aGTM.f.config({ … })`,
  3. `aGTM.f.init();`
- `config()` runs **before** `init()`. Putting the container ID, CMP, and consent
  wiring into `config()` is what `init()` then acts on.

## Step 1 — gather the setup (interview the user)

Ask only for what you don't already know:

- **GTM container(s):** one or more IDs. Any container that should load **before**
  consent (rare) gets `noConsent: true`.
- **CMP:** which consent tool? (lower-case name from the "Available CMPs" list in
  `CLAUDE.md`/`README.md`, e.g. `cookiebot`.) Special values: `none` = no consent
  gate, load GTM immediately; `''`/unset = no CMP wired.
- **Consent-update signal:** does the CMP fire a dataLayer **event** on
  change? → `consent_events: 'evName1,evName2'` (optionally
  `evName[attr:value]`). Does it instead push consent updates **directly** to the
  dataLayer (CCM19, Cookiebot, Usercentrics, …)? → rely on the periodic poll
  (`consent_poll_ms`, needs `consent_store_url`).
- **dataLayer variable name:** default `dataLayer`; override with `gdl` if the site
  uses a custom one.
- **Auto-enrichment:** any dataLayer variables to append to every event? →
  `dlSet: { targetProp: 'dlVariableName' }`.
- **Integration variant:** single JS file, a CMS/script-field snippet, a GTM
  Custom-HTML tag, or served by the sGTM Client. (README.md shows each variant.)
- **v1.5 features (optional):** consent-store/session passthrough
  (`consent_store_url`, `session`, `session_salt`, `consent_poll_ms`), POST
  transport (`transport_url`/`transport_enc`/`transport_salt`), iframe support.
- **Pre-consent events:** any event that must fire regardless of consent
  (`_noConsent`) and/or must not hit the GTM dataLayer (`_noDLPush`).

## Step 2 — produce the snippet

Follow the shape documented in `README.md` (do not deviate from documented
option names). Minimal example:

```html
<script type="text/javascript" src="/aGTM.min.js"></script>
<script type="text/javascript" nonce="…">
  aGTM.f.config({
     gtm: { 'GTM-XXXXXXXX': {} }   /* GTM container ID as key, options as value */
    ,cmp: 'cookiebot'              /* consent tool, lower-case; 'none' = no gate */
    ,consent_events: 'cmpEvent,cmpUpdate'
  });
  aGTM.f.init();
</script>
```

- A container that must load pre-consent: `gtm: { 'GTM-XXXX': { noConsent: true } }`
  — note the `aGTM_ready` event then fires **without** consent data; that
  container's tags must not assume consent.
- Per-event flags go on the event object passed to `aGTM.f.fire()`, not into
  `config()`: `_post`, `_noConsent`, `_noDLPush` (see README).

## Step 3 — validate against the common traps

Before handing it over, check (this is the audit half of `integration-check`):

- `config()` is present **and precedes** `init()`; `init()` is actually called.
- CMP name is spelled correctly and lower-case; it exists in the CMP list.
- If the CMP signals via an event → `consent_events` matches the **exact** event
  name(s) the CMP emits. If it pushes directly → poll is viable only with
  `consent_store_url` set.
- Custom dataLayer name → `gdl` set consistently everywhere.
- No use of the deprecated `vPageview` (use `aPageview`).
- If the snippet is destined for a GTM **Custom HTML** tag, keep it plain and
  avoid anything the environment forbids; when in doubt, prefer the external-file
  variant.
- Only documented options are used (cross-check `README.md`).

## Step 4 — tell the user what to verify live

Point them at `integration-check` (or the manual checks there): after deploying,
confirm `aGTM.d.consent.gtmConsent` flips to `true` after a consent decision and
that GTM actually injects (`aGTM.d.init === true`).
