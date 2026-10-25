<!-- aGTM Inspector rules for agents. Moved verbatim from the root CLAUDE.md on 2026-10-25; Claude Code loads this file when working in devtools-extension/. The root CLAUDE.md wins on conflict. Paths below are relative to the repository root. Excluded from aGTM-Inspector.zip by scripts/pack-devtools-extension.sh. -->

<!-- Abschnitt: aGTM Inspector (Chrome DevTools extension) -->

### aGTM Inspector (Chrome DevTools extension)

`devtools-extension/` ships an MV3 DevTools panel ("aGTM Inspector") for people
who build/validate/debug an integration — the human-facing companion to the
`live-inspector` skill. Eight tabs: **Diagnose** (health-score, consent timeline,
compliance report, session & IDs, GTM injection), **Consent** (consent lifecycle,
detected CMP, Google Consent Mode sequence, non-Google vendor detection), **Events** (queue/replay,
decoded `aGTM.l`), **dataLayer**, **Session** (session/attribution), **Config**
(effective config + traps + runtime diff), **Netzwerk** (`chrome.devtools.network`,
gzip/aEvents payload decode, pre-consent leak detection) and **Simulation**.

Every tab **except Simulation** is strictly read-only: the panel reads the page only
via `chrome.devtools.inspectedWindow.eval()` (running `reader.js`, a pure reader) and
`chrome.devtools.network`. **Simulation is the one deliberate write exception**
(`sim.js`): behind a per-session "Write-Modus" toggle (default off, never persisted)
it drives the page — simulated consent decisions, event firing, forced GTM injection,
Google-Consent-Mode pushes, cookie reset — through that same `eval()` bridge, which is
why `manifest.json` still declares **no** `permissions`/`host_permissions`. The cookie
reset also evaluates inside the page's **third-party frames** (a CMP keeps its own copy
of the consent in its own origin), via `eval(code, {frameURL})`. That stays inside the
same posture: DevTools gates frame evaluation on schemes, `chrome://`, Web-Store and
enterprise-policy hosts — **not** on `host_permissions`. It does require the frame's
exact committed **document URL** (an origin resolves to no frame — F-115), which is why
the candidates come from `getResources()` filtered to `type === "document"`.

The Consent tab's **"Erkanntes Consent-Tool"** card (`cmpdetect.js`) is the one part
that deliberately does **not** go through `reader.js`: "which CMP runs on this page" is
not aGTM's data and must answer on pages without aGTM at all, so it is its own read-only
`eval` chained inside the same poll. Its signature table is derived from our own
`cmp/cc_<name>.js` adapters — the first guard of each `consent_check` is exactly a
presence probe — and `test/devtools/cmpdetect.test.js` **drift-guards** it: every
`cmp/cc_*.js` must be either matched by a signature or listed in `UNDETECTABLE` with a
reason. Two are listed there on purpose: `cc_sourcepoint` (only checks `__tcfapi`, which
every IAB TCF CMP provides) and `cc_simple_cookie_regex_check` (a template with a freely
configured cookie name) — naming a CMP that isn't there is worse than naming none.
Two sharpenings came from a live shop that first reported three CMPs at once: a signature
may carry **`kind: "platform"`** (only `cc_shopify_consent` — `Shopify.customerPrivacy`
exists on every Shopify shop whoever drives it, so it is ranked and rendered apart from
the real CMP), and a **newer CMP version may publish the older one's API** (Usercentrics
v3 ships a working `UC_UI` incl. `getServicesBaseInfo`, so v2 carries a `deny` on
`__ucCmp.cmpController` — same shape as Borlabs 2 vs. 3).
**Adding a CMP adapter ⇒ add its signature or its exception**, same reflex as the
`CMP_MAP` entry for the sGTM Client sync and the configurator's `CMPData.cmps` entry
(key = file name without `cc_`, `consentTypes` = the fields the adapter writes;
drift-guarded by `test/cmp/configurator-sync.test.js`). The probe collects existence/`typeof` only: a
cookie string and a storage key *are* read to answer "does this key exist", but no
**value** is ever carried out of the page — it runs before any consent decision.

**What the card refuses to claim** (review round F-142…F-152, all fixed): only a
`strong` hit may contradict `aGTM.c.cmp`, and only after the contradiction survives two
consecutive polls (`cmpMismatchSettled` — same settle idea as the leak banner); an
adapter in `UNDETECTABLE` is never accused, because a comparison against a signature that
cannot exist is *impossible*, not failed (`comparable()`); a failed probe renders
"Messung fehlgeschlagen" instead of "no CMP found"; and a signature whose `need` is purely
cookie/storage-based is flagged `postDecision`, because that artefact only appears AFTER
the visitor answered — for those, absence proves nothing, the opposite of a JS-API
signature. Signatures use the adapters' own discriminators rather than a bare vendor
global (`window.Cookiebot = {}` must not read as "sicher"). The localStorage prefix scan
is gated on its own global and capped at 300 keys.

It is ES6+ (own browser context — **not** on the ES5/`build.sh` path), and its version
is coupled to the library version (see the build table). Distribution is "load
unpacked" or the tracked `aGTM-Inspector.zip` at the repo root. The pure modules are
unit-tested under `test/devtools/` (`netclassify`, `consentsignals`, `cmpdetect`,
`diagnose`, `jsonview`, the `sim` code builders) plus a `panel-smoke` integration test.
See `devtools-extension/README.md`.

---
