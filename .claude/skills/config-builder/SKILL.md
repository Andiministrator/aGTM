---
name: config-builder
description: >
  Build a correct aGTM configuration and init snippet for a given site setup.
  Use this skill when someone wants to integrate aGTM or generate/adjust an
  aGTM.f.config({…}) call: choosing the CMP, wiring GTM containers, consent-update
  events, dataLayer enrichment (dlSet), consent-store/session options, noConsent
  containers, and the event flags. Produces a ready-to-paste snippet and
  sanity-checks it. To diagnose or audit an existing or live integration, use
  integration-check instead.
---

# aGTM — Build a configuration + init snippet

Generates a correct `aGTM.f.config({…})` + `aGTM.f.init()` for an integrator's
setup. The **authoritative option list lives in the public docs** — always read
them rather than inventing options:

- `README.md` (repo root) — every config option with examples (the canonical
  source; do not hardcode an option that isn't documented there).
- `cmp/README-cmp.md` — the authoritative CMP → `cmp` value list (exact slugs).
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
- **CMP:** which consent tool? Use the **exact `cmp` value** listed in
  `cmp/README-cmp.md` (labelled "value" there) — it is the `cc_<slug>.js` filename
  part (e.g. `cookiebot`, `usercentrics3`, `onetrust_cookiepro`), **not** a
  lower-cased display name. Special values: `none` = no consent gate, load GTM
  immediately; `''`/unset = no CMP wired.
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

Use only **documented option names** (cross-check `README.md`). README.md's
featured integration is a **self-bootstrapping loader** — an IIFE that injects
`aGTM(.min).js` and calls `aGTM.f.init()` on load — driven by a single config
object; prefer that shape and copy the loader from `README.md`. Its config core:

```js
{
   path: '/js/'                 /* path to the directory where aGTM is located */
  ,min: true                    /* load the .min.js library + .min CMP files */
  ,cmp: 'cookiebot'             /* exact slug from cmp/README-cmp.md; 'none' = no gate */
  ,gtm: { 'GTM-XXXXXXXX': {} }  /* GTM container ID as key, options as value */
  ,consent_events: 'cmpEvent,cmpUpdate'
}
```

Equivalent **manual** form (two script tags) if the loader isn't wanted — note
`config()` must precede `init()`:

```html
<script type="text/javascript" src="/aGTM.min.js"></script>
<script type="text/javascript" nonce="…">
  aGTM.f.config({ gtm: { 'GTM-XXXXXXXX': {} }, cmp: 'cookiebot', consent_events: 'cmpEvent,cmpUpdate' });
  aGTM.f.init();
</script>
```

- A container that must load pre-consent: `gtm: { 'GTM-XXXX': { noConsent: true } }`
  — note the `aGTM_ready` event then fires **without** consent data; that
  container's tags must not assume consent.
- Per-event flags go on the event object passed to `aGTM.f.fire()`, not into
  `config()`: `_post`, `_noConsent`, `_noDLPush` (see README).

## Step 3 — validate against the common traps

Before handing it over, run these quick self-checks (for a full diagnosis of an
existing or live integration, hand off to `integration-check`):

- `config()` is present **and precedes** `init()`; `init()` is actually called.
- The `cmp` value is an exact slug from `cmp/README-cmp.md` (not a display name).
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

Tell them to check this **from a fresh incognito window**, not the browser they built
the site in. Their own browser has already decided, GTM cannot be un-injected once it
loaded, and the stored decision lives in more places than the site's consent cookie —
so the usual "looks fine to me" test silently verifies the wrong state. `live-inspector`
→ "Getting a real first visit" has the details.
