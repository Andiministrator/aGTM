---
name: cmp-integration
description: >
  Add, fix, or test an aGTM CMP consent_check (cmp/cc_<name>.js). Use this skill
  whenever the task involves a Consent Management Platform integration in aGTM:
  creating a new CMP adapter, changing an existing consent_check, fixing
  comma/ES5/consent-string issues, or testing one. Covers both delivery paths
  (standalone cmp/*.min.js and the sGTM Client's embedded copy) and the
  build/test/sync invariants.
---

# aGTM — Add / fix / test a CMP consent_check

Self-contained contributor guide for working on CMP adapters. For deeper
architecture, see `CLAUDE.md` (sections "CMP Files", "Build Process",
"Embedded CMP consent_check sync").

## Ground rules (always)

- **ES5 only.** `cmp/*.js` runs in the browser AND part of it is embedded into
  GTM's sandboxed environment. Use only `var` and `function` expressions. **No**
  arrow functions, `let`/`const`, template literals, `class`, or spread. The
  minifier (terser `--ecma 5`) **does not transpile** — it only minifies, so any
  ES6 in the source survives into `.min.js` and the embedded template value. The
  ES5 rule must hold in the **source**.
- **Consent-string format:** comma-delimited **and** comma-wrapped:
  `,Name1,Name2,`. A service/purpose/vendor **name containing a comma** (e.g. TCF
  vendors like "Amazon.com, Inc.") breaks the delimiter, so a later `split(",")`
  splits wrong and the consent match / hash / store is corrupted. **Always strip
  commas globally from any human-readable name that is joined into
  `services`/`purposes`/`vendors`:** `name.replace(/,/g, '')` — never
  `replace(',', '')`, which only replaces the first comma. Guard with
  `typeof name === 'string'` first. IDs / object keys / slugs are comma-free and
  need no strip.
- **Signature:** `aGTM.f.consent_check = function(action) { … }`, where `action`
  is `'init'` or `'update'`. Returns `true`/`false`; writes its result into
  `aGTM.d.consent`. Clean reference implementation to copy from: `cmp/cc_ccm19.js`.
- **Two delivery paths** (both must be correct):
  1. **Standalone integrators:** `aGTM.f.load_cc` loads `cmp/cc_<name>.min.js`. A
     fix here takes effect after a rebuild + CDN deploy.
  2. **sGTM Client users:** the Client injects the selected CMP code **inline**
     into the `/aGTM.js` response. That code lives as an embedded, minified string
     in the `cmp` SELECT of `sgtmClient/template.tpl`
     (`___TEMPLATE_PARAMETERS___`). 23 of the 25 CMP files are embedded
     (`cc_jtl_consent` and `cc_jtl_eu_cookie` are intentionally not offered as
     embedded options).

## Core invariant

> **A CMP fix is not finished until `./build.sh` has run** — it regenerates the
> `.min.js` AND automatically re-syncs the embedded template value — **and
> `bun test` is green.** For the sGTM-Client delivery path, the fix only goes live
> for those users once the operator **re-imports the sGTM Client template** (the
> sync only refreshes the template file). Call that out to the user.

---

## Flow A — fix an existing CMP

1. **Locate the bug** in `cmp/cc_<name>.js` (the source, not `.min.js`). Common
   classes:
   - Missing / first-only comma strip (`replace(',', …)` → `/,/g`). Find names
     joined into the consent string with:
     `grep -nE '\.(name|label|title)\b' cmp/cc_*.js`, then check whether the value
     is joined and whether a global `/,/g` strip + string guard is present.
   - ES6 leak (arrow / `let` / `const` / template literal / `class` / spread).
     Sweep with `grep -nE '=>|\blet\b|\bconst\b|\bclass\b' cmp/cc_*.js`.
   - Fail-open consent gate (an empty string wrongly treated as "granted").
2. **Fix in ES5.** Bump the header `@version` and update `@lastupdate`.
3. **Add a regression test** in `test/cmp/` (see "Testing" below). It must turn
   **red without the fix** — verify by mentally (or actually) removing the fix.
4. Run `./build.sh` — it must finish **without warnings**. It regenerates the
   `.min.js` and (if the CMP is embedded) re-syncs the template value; watch for
   the log line `Re-synced N embedded CMP consent_check code(s): …`.
5. Run `bun test` — everything green, including the drift guard
   `test/cmp/template-sync.test.js`.
6. **Docs:** add a `CHANGELOG.md` entry.
7. Commit (English Conventional Commit, e.g. `fix(cmp): …`).

## Flow B — add a new CMP

1. **Create the source:** `cmp/cc_<name>.js`. Copy the structure from
   `cmp/cc_ccm19.js`:
   - `//[aGTMlib.js Consentcheck]BOF` … `EOF` markers
   - namespace bootstrap (`window.aGTM = window.aGTM || {}; …`)
   - JSDoc header (`@type`, `@version 1.0`, `@lastupdate`, `@author`)
   - `aGTM.f.consent_check = function(action) { … }` with:
     - an action guard (only `init` / `update`, else return `false`)
     - `if (action == 'init' && aGTM.d.consent.hasResponse) return true;` (this is
       load-bearing for the preset-with-consent fast path)
     - read the CMP's browser global defensively (`typeof window.X === 'object'`)
     - write names into `services`/`purposes`/`vendors` with `.replace(/,/g, '')`
       + a string guard, comma-wrapped: `',' + arr.join(',') + ','`
     - set `aGTM.d.consent.hasResponse = true;` at the end, `return true;`
2. **Offer it as an embedded option? (usually yes.)** If the CMP should be
   selectable in the sGTM Client:
   - Add `'<Display Name>': 'cc_<name>'` to `CMP_MAP` in
     `scripts/cmp-sync-lib.js`. **Required** — the sync writer fails loudly for any
     SELECT option without a mapping.
   - Add a SELECT item to the `cmp` field's `selectItems` in
     `sgtmClient/template.tpl` (`___TEMPLATE_PARAMETERS___`) with a `displayValue`
     exactly equal to the `CMP_MAP` key. Leave `value` empty — `build.sh` fills it.
   - If the CMP should **not** be embedded (like the jtl adapters): touch neither
     `CMP_MAP` nor the SELECT.
3. **Register in the docs:** add the CMP **with its exact `cmp` slug** to
   `cmp/README-cmp.md` — the authoritative CMP → value list that integrators read —
   and add its display name to the "Available CMPs" list in `CLAUDE.md`.
4. **Add a test** at `test/cmp/cc_<name>.test.js` (see "Testing").
5. Run `./build.sh` (no warnings; it minifies and fills the SELECT value), then
   `bun test` green.
6. Commit.

---

## Testing (`test/cmp/`)

Two layers — both matter:

- **Behavioural** (fixture → `consent_check` → `aGTM.d.consent`): one
  `test/cmp/cc_<name>.test.js` per CMP, using `test/cmp/harness.js`.
  - `beforeEach(() => { resetAGTM(); loadCMP('<name>'); })` — order matters
    (`resetAGTM` first, then `loadCMP`, which overwrites `aGTM.f.consent_check`).
  - `runConsentCheck(globalName, globalValue, action)` installs the CMP-specific
    browser global for the duration of the call and restores it in `finally`.
    **Each CMP reads a different global** (`Cookiebot`, `UC_UI`, `__ucCmp`,
    `Shopify`, `sp`, `CCM`, cookie-based for Shopware, …) — read the source to see
    which.
  - Pattern (see `test/cmp/cookiebot.test.js`): absent global → `false`; invalid
    action → `false`; `hasResponse:false` → `false`; granted → assert the
    comma-wrapped string; nothing granted → `''`.
  - Every test must fail without the fix (avoid tautological tests).
- **Structural drift guard** (`test/cmp/template-sync.test.js`): asserts, for all
  embedded CMPs, that the embedded template value equals the `cmp/*.min.js`
  source, plus mapping completeness. It runs automatically with `bun test`; you
  add nothing here unless you introduce a new embedded CMP (then it covers that
  one automatically once `CMP_MAP`, the SELECT item, and `build.sh` line up).

**Verifying an adapter against the real CMP** — the unit tests run against fixtures, so
they cannot tell you the fixture matches reality. Two runs, two different states:
**(a) first visit** — `consent_check('init')` must return `false` and leave
`hasResponse` false (this is the fail-open test); **(b) return visit after a decision** —
`'init'` must map the stored decision into `aGTM.d.consent`. Only (a) needs a genuinely
clean browser, and that is harder to get than it looks — see `live-inspector`,
"Getting a real first visit". Capture the CMP's runtime shape in both states with
`live-inspector` Playbook C: a fixture written from a guessed shape passes its test and
fails in production.

**Note:** `build.sh` does not run `bun test`, and there is no CI. The self-healing
protection against template drift is the sync writer inside `build.sh` itself; the
drift-guard test depends on you running `bun test` — always do so before committing.

## Pre-commit checklist

- [ ] ES5 clean (no `=>`/`let`/`const`/template literal/`class`/spread in source)
- [ ] Comma-bearing names stripped globally (`/,/g`) + string-guarded where joined
- [ ] Header `@version` / `@lastupdate` updated
- [ ] Regression test present and red without the fix
- [ ] `./build.sh` runs **without warnings**; saw the `Re-synced …` log (if embedded)
- [ ] `bun test` green (drift guard included)
- [ ] `CHANGELOG.md` updated (+ `CLAUDE.md` & `README.md` for a new CMP)
- [ ] Told the operator: **re-import the sGTM Client** for the embedded copy to go live
