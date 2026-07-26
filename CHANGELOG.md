# Changelog

## Version 1.5 — *in development*

### Fixed — bot-check payload now uses URL-safe Base64 (base64url)

The sGTM Client's optional bot check appends a Base64-encoded `{UserAgent,
ClientIP}` JSON object to the configured bot-check URL as a **path segment**.
Standard Base64 can contain `+` and `/`; the `/` spawns spurious path segments
(and `+` decodes to a space), corrupting the request. The payload is now encoded
as **base64url** (`+` → `-`, `/` → `_`) via a single-line `.split().join()` chain
(sandbox-safe). Applied identically to `sgtmClient/template.tpl` and
`sgtmClient/src/…`; the field help documents the encoding. **The bot-check
service must decode base64url accordingly.**

### Added — aGTM Inspector: Diagnose tab (Health-Score · Consent-Timeline · Compliance-Report)

A new **read-only Diagnose tab** (now the default tab) bundles three at-a-glance
diagnostics, all off the ES5/`build.sh` path with no new manifest permissions:

- **Health-Score** — a pass/warn/fail traffic-light aggregating the known failure
  modes (consent mechanism present, consent recognised, GTM injected, pre-consent
  leaks, config traps) into one readout plus a per-check list. Missing consent
  mechanism or a pre-consent leak turns the overall score red.
- **Consent-Timeline** — a ms-stamped waterfall (page load → `config()` → CMP
  decision → GTM inject → first tag fire) resolved from `aGTM.l` log ids,
  `aGTM.d.dl` event timestamps and the network capture, anchored to a new
  read-only `navStart` (`performance.timing.navigationStart`) in `reader.js`.
  Bars are **colour-coded per milestone** (reusing the panel palette); a first
  tag fire landing **before** the CMP-decision marker is painted **red** with a
  "⚠ vor Consent" flag — a pre-consent leak surfaced right on the timeline.
- **Compliance-Report** — a one-click shareable snapshot (Markdown/JSON to
  clipboard, or `.md` download) from leaks + consent flow + config traps +
  `consent_check` status, for the consulting/hand-off scenario.
- **Session & IDs** — the current session-id / user-id / CRM `user_id` with a
  first-observed timestamp, **plus a live change history**: the panel diffs the ids
  on every poll and logs each change (from → to, timestamped), so the v1.5 F→C
  user-id promote (fingerprint `F.…` → stable cookie `C.…` after consent) is
  visible as it happens. The history is **persisted per host** via `localStorage`
  (survives a panel close / DevTools reopen; no cross-site mixing). The Session-API
  payload delivered on the `/aGTM.js` request is surfaced as a **KPI stat-tile row**
  with smart derivations — returning-visitor vs first-visit (from `sessionCount`),
  events-per-pageview engagement, and a **live session age** from the authentic
  server `created` timestamp — with a clear caveat that the counters are a
  **page-load snapshot** (they don't advance during the page; only the age is live).

The aggregation lives in a new pure `diagnose.js` (browser global + node-require,
like `netclassify.js`) and is unit-tested (`test/devtools/diagnose.test.js` +
panel smoke coverage). The config-trap and pre-consent-leak logic is now shared
between the Config/Network tabs and the Diagnose tab (no duplication).

**Critic round (F-70…F-73):** the leak health-check no longer reports a false
green when the pre-consent window was not observed — a clean "pass" now requires
that a navigation was witnessed or the capture began at page load, otherwise it
stays N/A (a captured leak is always a fail). The Consent-Timeline anchors its
"CMP decision" marker to the *first* consent completion (log `m3`/`m2`) so a later
re-consent can't sort it behind "GTM injected"; network-derived markers use the
request start (finished ts − duration) instead of the finish time; and the
"since page load" label/anchor is now conditional (falls back to "first marker"
when `navStart` is unavailable). When the debug log is inactive, the marker falls
back to a new read-only `consentFirstTs` (the **first** consent event) rather than
`consentTs` (the last one), which the 2s consent poll / CMP re-pushes keep advancing
— that was stretching the timeline bar to tens of seconds (Andi 2026-07-26).

### Added — aGTM Inspector: consent fingerprint in the list view · library size-budget guard (＋ critic round 2)

- **Consent fingerprint in the list view**: gcs/gcd requests now show a compact per-category
  granted/denied/unset pill cluster (green/red/grey) inline in the Network list — scan a whole
  request list and see what each hit was allowed to do without expanding. The same fingerprint
  appears on dataLayer `gtag('consent',…)` command rows. gcd (4 signals) is preferred over gcs
  (2) when both are present.
- **Library size-budget guard** (`test/size-budget.test.js`): `bun test` now fails if
  `aGTM.min.js` exceeds a deliberate raw/gzip ceiling — enforcing aGTM's "stay lean, not a
  monster like GTM" goal automatically. A real increase requires a conscious budget bump (the
  paper trail). Current: raw 35 932 B / gzip 10 815 B; budget 37 000 / 11 300.
- **Critic round 2 fixes**: the F-64 event-table expand key used the *display* index, which for
  the reverse-ordered dispatched-events list shifted on every new event and collapsed open rows
  — now a stable natural-order ordinal. Reader clones `dl`/`queue` per entry via `safeObj` (a
  fired event carrying a DOM ref no longer fails the whole snapshot). The pre-consent leak stamp
  is reconciled at render time against `consentTs`, so a tracker that legitimately fired right
  after "Accept" (before the next 700 ms poll) is no longer flagged. Leak banner notes its count
  is filter-independent.

### Added — aGTM Inspector: pre-consent leak detector + gcs/gcd decode (＋ critic-round fixes F-56…F-66)

- **Pre-consent leak detector** (Network tab): every captured request is stamped with whether
  aGTM had consent (`gtmConsent`) *at capture time*. A tracking/marketing hit — Google tags
  (gtm.js/gtag.js/GA collect) **or** a known third-party pixel (Meta, TikTok, Microsoft UET,
  Clarity, LinkedIn, Pinterest, Criteo, Snap, X/Twitter, DoubleClick, …) — that fired while
  consent was still `false` raises a red **Pre-Consent-Leak** banner (grouped by vendor) plus a
  per-row `⚠ pre-consent` badge. aGTM's own infra (`/aGTM.js`, `/aGTMconsent`, sources, sGTM SW)
  is never flagged. The classifier lives in `netclassify.js` (`trackerInfo`/`trackingHit`) and is
  unit-tested.
- **Google Consent Mode signal decode (gcs/gcd)**: the network detail now decodes the `gcs`
  (classic `G1<ad_storage><analytics_storage>`) and `gcd` (Consent Mode v2, four signals
  ad_storage/analytics_storage/ad_user_data/ad_personalization) parameters into per-category
  granted/denied chips, with the raw code shown for verification. Unknown gcd letters are
  surfaced raw (never a fabricated state). Decoder lives in a new pure module `consentsignals.js`
  (unit-tested); spec verified against public Consent-Mode-v2 documentation.
- **Critic-round hardening (F-56…F-66)**: reader clones `config`/`consent`/`session.raw`/
  `attribution` **per field** via `safeObj` (one non-serialisable value no longer fails the whole
  snapshot → `{loaded:false}`); dataLayer row `#`/expand-key uses the **absolute** index (stable
  when the 150-tail window slides); base64-encoded POST bodies are recognised as binary and
  gunzipped; `aeBrute` gets a memo-guard in the detail path; the network classifier no longer
  mislabels a foreign `/gtm.js` or bare `/collect`; internal-log `hasObj` tracks the shown object;
  an event-less `{ecommerce:…}` push is categorised E-Commerce; a consent-/attribution-only preset
  session is no longer shown "empty"; event-table expand keys include the list index; the network
  search caret is preserved mid-string; and dead code + a GCM `declare` column were cleaned up.

### Added — aGTM Inspector (Chrome DevTools extension)

A new read-only DevTools panel under `devtools-extension/` (MVP, Apache 2.0) for
the people who build, validate, and debug a tracking integration. It surfaces
aGTM's internal state live in six tabs: **Consent** (`aGTM.d.consent`,
`session_status`, consent hashes, active CMP — "does GTM load, and why not?"),
**Events** (the `aGTM.d.f` queue, dispatched `aGTM.d.dl`, and the decoded `aGTM.l`
log, with `_noConsent`/`_noDLPush`/`_post` flags per event), **GTM** (container
injection status from `aGTM.c.gtm` + `aGTM.d.gtmLoaded`), **Session** (session
source + `aGTM.d.attribution`), **Config** (`aGTM.c` with highlighted config
traps), and **Netzwerk** (gtm.js / `/aGTMconsent` / `/aGTM.js` / sources / GA hits
via `chrome.devtools.network`).

It reads the page only through `chrome.devtools.inspectedWindow.eval()` (running
`reader.js` in page context, read-only) and `chrome.devtools.network` — so
`manifest.json` declares **no** `permissions` and **no** `host_permissions`.
Distribution is "load unpacked" from the repo (no Chrome Web Store review needed);
a store listing is an optional later step. It is the human-facing companion to the
`live-inspector` skill. See `devtools-extension/README.md`.

The panel is strictly read-only and reviewed for panel-context XSS (every
page-derived value is HTML-escaped). The network classifier lives in a separate,
unit-tested module (`netclassify.js`, `test/devtools/netclassify.test.js`) and
recognises both reverse-proxy (`/rp/tp/…`) and dedicated/root-hosted sGTM domains
without sweeping in first-party traffic. The reader snapshot is hardened so a
single non-serialisable logged object can't fail the whole snapshot.

### Changed — aGTM Inspector: finer network classification within the sGTM scope

The generic "sGTM/aEvents" label is split: the real **aEvents** endpoint (`…/ae`) is labelled
`aEvents`, the sGTM first-party **service-worker** bootstrap (`/_/service_worker/…/sw_iframe.html`,
reverse-proxied by the customer) `sGTM SW`, and everything else on the learned sGTM path stays
generic `sGTM` — so the service-worker iframe is no longer mislabelled as an event.

### Fixed — aGTM Inspector: aEvents false positives, gzip garbage, payload decoding

- **No more aEvents false positives**: a decoded payload is only treated as aEvents when it
  is a plain object carrying a known aEvents field (`event`/`event_name`/`ae_timestamp`/
  `page_location`) — a Clarity `collect` JSON array (`[…]` / `{0:…,1:…}`) no longer gets an
  `aEvents ✓` badge.
- **No more gzip mojibake**: the HAR body string can be a *lossy* UTF-8 decode of the real
  bytes, so a "successful" inflate can still be garbage. The decompressed output is now
  validated as text — if it isn't, the panel shows a clean note instead of control-char
  soup.
- **Payload section decodes in place**: the separate "aEvents (entschlüsselt)" section is
  gone; the **Payload** section itself now shows the decoded aEvents event (so expanding
  the payload always shows plaintext, not the raw `{"q":…}`).

### Added — aGTM Inspector: scroll anchoring + persisted settings

- **No more scroll jumps**: the streaming tabs (Events / dataLayer / Network) prepend new
  rows at the top on each poll; the panel now anchors the scroll position so the view only
  jumps when you're at the very top — scroll down and it stays put as new rows arrive.
  Switching tabs resets to the top.
- **Settings persist across sessions** via `localStorage` (no extra manifest permission):
  the Network "nur aGTM-relevant" toggle and hidden hosts (e.g. Clarity ticked off) are
  restored next time you open the panel.

### Added — aGTM Inspector: aEvents payload decoding

The Network tab now **decodes aEvents payloads**. The aEvents webGTM tag sends events as
`?e=<JSON>` (plain) or `?q=<enc>` (obfuscated: Base64 → Caesar shift over a URL-safe
alphabet, `~` at position 3 encoding the stripped padding, `shift = salt%63+1`). The panel
decodes both — for the obfuscated form it **brute-forces all 63 possible shifts** and keeps
the one that yields valid JSON, so **no salt is needed**. Handles both transports: the
URL-query GET pixel **and** the XHR/POST body (`{"q":…}` / `{"e":…}`, used by the
reverse-proxied `…/ae` endpoint). The decoded event object is shown as its own collapsible
"aEvents (entschlüsselt)" detail section, its event name appears under the type badge, and a
preview surfaces the event + consent signal + custom params inline (badge `aEvents ✓`).
Verified against the real `enc()` scheme (all padding cases + UTF-8) and a live fc-moto payload.

### Added — aGTM Inspector: network filtering, property IDs, gzip-decoded previews

Sixth polish round on the DevTools panel:
- **Network filtering**: a search box (free-text over URL/type/event/ID; prefix `-` to
  exclude, e.g. `-clarity` to hide Microsoft Clarity) plus per-host checkboxes to toggle
  whole hosts on/off. The search field keeps focus/caret across the live re-render.
- **Property / measurement / stream ID** (`id` for GTM/gtag, `tid` for GA4/Ads collect)
  is printed under the type badge next to the event name.
- **Decoded payload in the preview line**: gzip `collect` bodies are now decompressed
  eagerly so the row preview shows the real body (marked `gunzip`), not just a note.

### Added/Fixed — aGTM Inspector: sent consent payloads, vendor state, gzip-safe network

Fifth polish round on the DevTools panel (all UI/reader; still read-only):
- **Sent consent payloads**: each `default`/`update`/`declare` row in the Consent-Mode
  sequence is now **click-to-expand** into the full object that was actually pushed
  (not just the per-category chips).
- **Vendor consent state** (where synchronously readable, read-only): the vendor box
  now shows GPC (`navigator.globalPrivacyControl`), the TCF string (cookie
  `euconsent-v2`), US-Privacy (`usprivacy`), and Amazon ACS (`amzn_consent`) — with a
  clear note that live TCF/GPP values need async APIs a read-only reader must not drive.
- **dataLayer consent markers**: `gtag('consent', default|update|declare, …)` pushes are
  called out inline in the dataLayer timeline as highlighted `⚑ consent …` markers (full
  object expandable), so you see *when* each consent command was sent relative to events.
- **Fixed — gzip/binary POST bodies no longer render as mojibake**: GA4/sGTM `collect`
  bodies are frequently gzip-compressed (magic `1f 8b`); the panel now detects binary/gzip
  payloads and shows a `binär / gzip · N Bytes` note (in both the inline preview and the
  expanded detail) instead of garbled text, and skips `en`-extraction on such bodies.
- **GET-parameter fallback**: when a request has no readable body, the full decoded query
  string is shown as the payload substitute (so a gzip'd `collect` POST still surfaces its
  `v`/`tid`/`cid`/`gcs`/`gcd`/`en`… query signals).
- **Consent tab: restored the per-category state table** (Kategorie · aktuell · default ·
  update · implicit) as the "Gesamtzustand" view — the earlier, clearer layout — columns
  now cluster tight next to the category — kept alongside the sequence flow above it.
- **Consent sequence works for GTM-template CMPs**: when consent is set via the sandboxed
  GTM Consent API (`setDefault/updateConsentState`) instead of `gtag('consent',…)`, there
  are no dataLayer commands — the flow is now reconstructed from `google_tag_data.ics`
  (declare/implicit/default/update per category) so it's no longer empty.
- **Network detail split into separate collapsible sub-sections** (General, Query-String,
  Request-/Response-Header, Payload) instead of one JSON blob; the Payload section
  JSON-highlights when parseable and falls back to the GET params when there's no body.
- **Vendor activity state**: vendors without a readable consent API (Meta, TikTok,
  Pinterest, Criteo, UET, LinkedIn, Snap, X) now show `aktiv (Cookie)` when their tracking
  cookie is set (pixel fired → post-consent) as a pragmatic state proxy.
- **gzip/binary payloads are now decompressed** — the panel reconstructs the request
  body bytes and runs them through the native `DecompressionStream('gzip')`, so a GA4/sGTM
  `collect` POST shows its real decoded body (falls back to the note if decoding fails).
- **Microsoft UET readable consent state** — reads `uetq.uetConfig.consent.adStorageAllowed`
  so UET shows real `ad_storage granted/denied` (the only non-Google vendor with a JS getter).
- **Consent commands surfaced even when above the dataLayer tail window**, and
  `gtm.init_consent` (GTM-template consent init) is marked inline; the vendor rows expand
  into richer per-vendor detail (signal, reads-TCF, DACH gating note); the GCM table columns
  cluster tight next to the category.

### Added — aGTM Inspector: consent-mode sequence, vendor detection, dataLayer categories

Fourth polish round on the DevTools panel (all UI/reader; still read-only):
- **Google Consent Mode sequence** on the Consent tab: reads the `gtag('consent',…)`
  commands from the dataLayer and lays out the flow — **declare / implicit (Google
  default)** → **default** → **update**, each in order (numbered when repeated), with
  per-category granted/denied chips — then the **final per-category state** (`update >
  default > declare/implicit`) with the last-changed timestamp and detected region.
- **Non-Google vendor/framework detection**: a box that flags which consent frameworks
  and vendor pixels are present on the page (TCF `__tcfapi`, GPP `__gpp`, USP, GPC, and
  Meta/Microsoft-UET/TikTok/LinkedIn/Pinterest/Amazon/Criteo/Snap/X) and the consent
  signal each expects — sourced from `knowledge/consent/12-…`.
- **Coloured dataLayer categories**: each push is tagged and colour-coded — aGTM, GTM,
  E-Commerce (GA4 ecommerce events / `ecommerce` key), Pageview, Consent, gtag command,
  or Message.
- **Network event name + payload**: the request's event name (`en`, from query or POST
  body) is printed under the type badge, and a compact payload preview is shown inline
  under the URL (full body still in the expand view).

### Added — aGTM Inspector: Google Consent Mode box, smart URLs, inline previews

Third polish round on the DevTools panel (all UI/reader; still read-only):
- **Google Consent Mode box** on the Consent tab: reads GTM's internal
  `google_tag_data.ics.entries` and shows the effective per-category status
  (`ad_storage`, `analytics_storage`, `ad_user_data`, … derived as
  `update > default > implicit`) with granted/denied chips + the detected region.
- **Smart, colourful network URLs**: dimmed host, emphasised path, and the meaningful
  GTM/GA4/consent query params (`id`, `en`, `gcs`, `gcd`, `dma`, …) surfaced as chips
  with a "+N Param" overflow count.
- **Inline object previews**: event rows (dispatched/queue/dataLayer) show a compact,
  dimmed preview of the object's notable fields to the right of the event name, using
  the remaining row width (full object still one click away).
- **Config runtime-diff**: the Config tab now shows what aGTM derived/changed at
  runtime (first snapshot → current) as a `neu`/`geändert`/`entfernt` table, so you can
  see e.g. a browser-derived `consent_store_url` or container `hasLoaded` flip.
  (A precise integrator-input-vs-effective diff would need a small `aGTM.f.config`
  hook — deliberately not added so the sGTM base64 blob stays untouched.)
- **Tighter tables** (narrow columns cluster left, the event/URL column takes the
  rest), internal-log column order reworked (Zeit · Event · Meldung · ID · ×), and the
  dataLayer relationship column relabelled `(a)GTM` right after the index.

### Added — aGTM Inspector: dataLayer tab, log bundling, se_data fallback, expandable network

Second polish round on the DevTools panel (all UI/reader; still read-only):
- **New dataLayer tab.** Shows the real `window[gdl]` contents (click-to-expand),
  each push badged by its aGTM relationship: *via aGTM* (`aGTMts` → came through
  `aGTM.f.fire()`), *repeated* (DL-Repeat tag), `_noConsent`/`_post`, and
  GTM-/aGTM-internal events.
- **Internal log is bundled with counts.** `aGTM.l` entries are grouped by id+event,
  so the ~2s consent poll's repeated `m2`/`m3` collapse into one counted row
  (`×N`, latest-first) instead of flooding the table; the id chip is coloured by type
  and the *which event* column now surfaces (`m7`/`m9` carry the event, `m2`/`m3`
  carry the consent object).
- **Session `window.se_data` fallback.** When `aGTM.d.session` is empty the panel
  looks for a site session object (`window.se_data`, as on victors.de) and shows it.
- **Expandable network rows.** Each captured request expands into full request/
  response detail (headers, mime, timing, server IP, capped POST body) — useful for
  eyeballing an sGTM event POST.
- **Colourful JSON everywhere.** Session, Config, and every expanded object now use
  the syntax highlighter; the Config tab is relabelled as the *effective* config.
- **Compact tables** and a clearer "Message" label for event-less pushes.
- **Coverage:** an integration smoke test (`test/devtools/panel-smoke.test.js`) evals
  the four panel scripts against a fake DOM/chrome and renders every tab, guarding
  against renderer regressions.

### Added — aGTM Inspector: downloadable ZIP, expandable objects, richer GTM tab

Follow-up polish for the DevTools panel:
- **Downloadable ZIP.** `./scripts/pack-devtools-extension.sh` bundles the extension
  into `aGTM-Inspector.zip` (extracts to a clean `aGTM-Inspector/` folder) so it can
  be grabbed and "load unpacked" without cloning. It is a derived artifact — rerun
  the script after any change (not wired into `build.sh`; the panel is off the
  ES5/build path).
- **Click-to-expand objects.** Event-Log (`aGTM.d.dl`) and queue rows expand into a
  syntax-highlighted full event object; the decoded internal log (`aGTM.l`) now shows
  *which event* (`obj.event`) each entry belongs to and expands into the full logged
  object. The highlighter is a pure, unit-tested module (`jsonview.js`,
  `test/devtools/jsonview.test.js`) — every token is HTML-escaped (no panel XSS).
  The reader re-attaches `aGTM.l[].obj` but clones each entry **individually** so one
  non-serialisable logged object degrades to a sentinel instead of failing the whole
  snapshot (keeps the F-55 robustness guarantee).
- **Queue is no longer misleading after consent.** Once consent is present / GTM is
  injected, the "waiting for consent" queue is relabelled as **history** (its events
  were already replayed as `hastyEvents`; `aGTM.d.f` is not cleared after inject).
- **Richer GTM tab.** Adds live `dataLayer` length, per-container load mode
  (Google / custom-sGTM / inline base64 + env), and a DOM-level list of the actually
  injected `<script id="aGTM_tm_…">` tags with their load host — proof of what really
  loaded and from where.

### Added — Claude Code skills for contributors & integrators

The repo now ships four [Claude Code](https://claude.com/claude-code) skills
under `.claude/skills/` (Apache 2.0, available automatically on clone):
`cmp-integration` (add/fix/test a CMP `consent_check`), `config-builder` (generate
a correct `aGTM.f.config({…})` + init snippet and check it against the common
traps), `integration-check` (diagnose & audit a configured integration), and
`live-inspector` (drive a real browser to run a live end-to-end consent-flow check
via the Claude-in-Chrome extension or the Chrome DevTools MCP). See
`.claude/skills/README.md` for install & usage.

### Fixed — comma-strip completed across remaining CMP consent checks (F-51b)

Five more CMP consent checks pushed human-readable service/purpose names into
the comma-delimited consent string without stripping embedded commas, so a name
like "Meta Platforms, Inc." would split into phantom entries and cause a consent
mismatch: `cc_matomo`, `cc_shopware5_cookie`, `cc_usercentrics3`,
`cc_jtl_eu_cookie` and `cc_shopware_acris_cookie`. All now strip with `/,/g`
behind a `typeof === 'string'` guard (same pattern as `cc_ccm19`/`cc_usercentrics`),
closing the comma class repo-wide. `./build.sh` re-synced the four embedded
template copies automatically via the F-52 mechanism. New discriminating harness
tests in `test/cmp/comma_strip.test.js`.

### Fixed — ES5 compliance in `cmp/cc_shopify_consent.js` (F-53)

The Shopify consent check used an ES6 arrow function in the
`Shopify.loadFeatures` callback. Since terser (`--ecma 5`) minifies but does not
transpile, the arrow survived into `cmp/cc_shopify_consent.min.js` (and the
embedded sGTM template value), breaking the repo's ES5-only rule and very old
browsers (IE11). Replaced with a plain function expression (behaviourally
identical — the callback uses neither `this` nor `arguments`). Rebuild
re-synced the embedded template copy automatically via the F-52 mechanism.

### Fixed — sGTM Client template re-syncs embedded CMP `consent_check` codes (F-52)

The sGTM Client template (`sgtmClient/template.tpl`) embeds one minified
`consent_check` function per CMP as its "Used CMP (Consent Tool)" SELECT option
`value` — the production copy the Client injects inline into `/aGTM.js` for
Client users. Nothing rebuilt these from `cmp/*.min.js`, so CMP fixes never
reached Client users until manually patched (5 codes had drifted, including the
F-51 comma-strip fix in Usercentrics v2). `scripts/update-sgtm-template.js` now
regenerates all 23 embedded values from the freshly minified `cmp/*.min.js` on
every `./build.sh`, and a new drift-guard test (`test/cmp/template-sync.test.js`)
fails CI if any embedded value ever diverges from its source again. Shared
mapping/extraction logic lives in `scripts/cmp-sync-lib.js` so the writer and the
guard cannot disagree.

### Added — passive/throttle options for `aGTM.f.evLstn` (Core Web Vitals)

`aGTM.f.evLstn(el, ev, fct, opts)` gained an optional 4th argument
`{ passive, throttle }` (ignored for `message` listeners). Passive listeners
never block scrolling/touch (better INP, no scroll jank) and are only used when
the browser actually supports the option (`aGTM.f.passiveSupported()`, cached);
`throttle` (ms) coalesces high-frequency events via the new `aGTM.f.throttle()`
(leading+trailing) so a handler's layout reads run at most once per window. The
Scroll and Pageview GTM templates now register their `scroll`/`resize`/
interaction listeners passive + throttled. Backward compatible (the option is
opt-in; existing 3-argument calls are unchanged).

### Fixed — `aGTM.f.gc()` cookie read: escape + left-anchor the name (F-45)

Reading a cookie built `new RegExp(n + "=([^;]+)")` with the name neither
regex-escaped nor left-anchored. Two consequences: a name that is a suffix of
another cookie name matched inside it (reading `b` returned the value of `ab=…`),
and a name containing a regex metacharacter matched the wrong cookie or — for an
unbalanced token like `a(b` — threw an uncaught `SyntaxError` (the RegExp was
built before the `try`). The name is now escaped and anchored to a cookie
boundary (`(?:^|;\s*)`, non-capturing so the value stays `match[1]`), and a
type guard returns `null` for empty/non-string names. Found by the F-45 helper
unit tests; verified by an independent critic (16-case battery). Discovered
latent, pre-existing (not a v1.5 regression).

### Fixed — CMP name comma-stripping only removed the first comma (F-51)

Three CMP `consent_check` implementations stripped commas from
service/purpose/vendor names with `name.replace(',', '')`, which — with a
string first argument — only replaces the **first** occurrence. Because the
consent state is stored as a comma-delimited, comma-wrapped string, a name
containing two or more commas kept an embedded comma and was later split into
two entries, causing a consent mismatch (a configured `gtm*` requirement would
not match → GTM stays blocked) or a distorted consent hash/store. Reachable
with e.g. IAB-TCF vendor names like "Amazon.com, Inc." (Sourcepoint). Fixed to
a global replace (`/,/g`) in `cc_usercentrics.js`, `cc_sourcepoint.js`, and
`cc_cookiefirst.js`, matching the already-correct `cc_ccm19.js`.
`cc_consentmanager.js` pushed the TCF purpose/vendor `name` with **no** comma
stripping at all (same class) — now stripped with a type guard and `id`
fallback. CMP files are separate on-demand scripts, so this does not affect the
embedded library blob.

### Fixed — consent-gate fail-open in `aGTM.f.chelp()` (F-49, security)

The core consent gate that decides `gtmConsent` (GTM loads only if every
configured `gtmPurposes`/`gtmServices`/`gtmVendors` requirement is granted)
could **fail open**. `chelp(need, given)` guarded its check with
`if (need && given)`, so a configured requirement checked against an **empty**
granted string (`""`) skipped the check entirely and returned `true` — GTM
loaded even though the required category had not been consented. This was
reachable with CMPs that emit a bare `""` for a fully-denied category
(Cookiebot, Usercentrics v2/v3, CCM19), whenever an integrator uses the
`gtm*` requirement feature. The gate is now fail-closed: a requirement set
against an empty grant is not satisfied (aligned with the sibling `evalCons`).
No requirement configured (`need` empty) still returns `true`, so integrators
that do not use the feature are unaffected; the server-side `blocked`
auto-denial signal is now honoured correctly instead of being bypassed.
Found by the round-3 helper unit tests; verified by an independent critic
(fail-open real + reachable, no fail-closed regression). Discovered latent,
pre-existing (not a v1.5 regression). New `test/consent_helpers.test.js`.

### Fixed — `aGTM.f.pageinfo()` word count inflated by whitespace nodes (F-50)

`pageinfo`'s recursive text-node walker counted
`textContent.trim().split(/\s+/).length` without an empty guard —
`"".split(/\s+/)` yields `[""]` (length 1), so every whitespace-only text
node (the indentation between tags) was counted as one word, inflating the
word count several-fold on a typical nested page. Now guarded to skip empty
text nodes. Feeds the Content-Counter GTM variable; metric-only, no consent
or tracking impact. Found by the round-3 helper unit tests.

### Fixed — `aGTM.f.urlParam()` query-parameter read: escape the name (F-47)

Sibling of the gc F-45 fix. `aGTM.f.urlParam(name, url)` interpolated `name`
into `new RegExp("[?&]" + name + "…")` unescaped, so a name containing a regex
metacharacter could match the wrong parameter (`a.b` matching `axb=`) or crash
the RegExp constructor before any `try` (`a(b` → unbalanced group →
`SyntaxError`). The name is now regex-escaped and a type guard returns `null`
for empty/non-string names. No anchoring is needed — the leading `[?&]` and
trailing `=` already fence the name to a full query-parameter boundary. All
callers pass literals (`aGTMoptout`, `gtm_debug`), so there was no runtime
risk; the latent trap is now closed. Verified by two independent critics.

### Fixed — `aGTM.f.sc()` cookie write: encode value, reject unsafe name (F-45 sibling)

Rounds out the cookie-helper hardening symmetric to gc's read-side fix. `sc()`
wrote the name and value verbatim, so a `";"`/`"="` in the value corrupted the
cookie string (gc's `[^;]+` then truncated the read at the first `";"`). The
value is now URL-encoded on write — symmetric with gc's `decodeURIComponent` on
read, so separators in a value round-trip cleanly — and a name carrying
`";"`/`"="`/whitespace is rejected (no-op) instead of writing a corrupt cookie
(gc reads by the raw, non-decoded name, so an encoded name could not be read
back). `encodeURIComponent` is identity on the literal `"0"`/`"1"` values the
callers pass, so there is no regression.

### Added — test coverage sweep (GTM templates + core library helpers)

- **GTM template `___TESTS___` sweep (F-41):** every GTM template that had an
  empty `scenarios: []` now carries real Tests-tab scenarios — all 13 web
  templates (click, form, scroll, pageview, copy, timer, consent-mode,
  iframe-support, dl-repeat, the core `aGTM Tag`, and the Consent-Check/
  Consent-Info/Content-Counter variables) plus the sGTM Client (9 scenarios for
  the synchronously reachable consent-store surface). Each scenario is
  discriminating (fails if its fix is reverted); the config-building path of the
  sGTM Client stays E2E in the `internal/api` smoketest (structurally not
  unit-testable in the GTM Tests tab, F-44).
- **Core library helper unit tests (bun):** added coverage for pure helpers that
  previously had none — `consent_serialize` (the load-bearing consent-hash
  serialization gating the consent-store POST), the `rTest`/`rMatch`/`rReplace`
  (+`vSt`) regex helpers used by every template, `sStrf` (safe stringify incl.
  circular-reference fallback), and `gc`/`sc` (cookie get/set).
- **Round-2 helper unit tests:** direct coverage for six further pure helpers
  that had none — `strclean`, `an` (assign-or-default via `hasOwnProperty`),
  `vOb` (valid-object check incl. circular-reference fallback), `getVal`
  (window/document/location accessor + its guards), `propset`, and `isIFrame`.
  Plus `urlParam` (`test/urlparam.test.js`) and the sc separator-encode
  round-trip cases.
- **Round-3 helper unit tests:** `chelp`/`evalCons` (the consent gate — this
  round surfaced the F-49 fail-open), `pageinfo` (word/image counting — surfaced
  F-50), `aGTM_event` (dataLayer event-object builder), `timerfkt` (timed-event
  computation), `proxySupport`, `log`, and the DOM-wrapper guards
  (`getNodeAttr`/`newNode`/`delNode`).
- Test suite now at **346 tests across 27 files** (`bun test`).

### Added — Integrator Data Contract documentation

New [README-for-Integrators.md](README-for-Integrators.md): a standalone guide for
**web GTM** and **server-side GTM** developers/agents describing the aGTM data surface —
what the library writes into the `aGTM` object (`aGTM.d.session`, `aGTM.d.consent`,
`aGTM.d.attribution`, `session_status`), which dataLayer lifecycle events it emits
(`aGTM_ready`, `aGTM_consent_update`, `aGTMparams`/`aGTMconsent`), how to read/set session,
consent (incl. `consent_events`/`run_cc`/`_noConsent` and the diff/store flow) and
sources/attribution, plus the POST transport and `/aGTMconsent` contracts. Cross-linked
from `README.md` and `README-for-Developers.md`.

### Session feature redesigned (server-side, single source of truth)

The client-side session fetch + auto-denial machinery from earlier v1.5
prereleases is gone. Session and consent state are now driven entirely
by the sGTM Client; aGTM consumes a pre-populated `cfg.session` object
in the library response and pushes consent diffs to a dedicated endpoint.
See [SESSION-REDESIGN.md](SESSION-REDESIGN.md) for the full design.

**Removed (no migration code, v1.5 was unreleased):**
- Functions: `aGTM.f.session_fetch`, `aGTM.f.session_apply_denial`, `aGTM.f.xfetch`
- Config keys: `session_url`, `session_wait`, `session_timeout`, `session_gtm_on_deny`, `session_consent_url`, `session_deny_service`
- Data keys: `aGTM.d.session_ready`, `aGTM.d.consent_sent`
- Old `session_status` enum values: `"ok"`, `"invalid"`, `"error"`, `"timeout"`, `"inactive"`, `"preset_uid"`
- sGTM Client Template parameters: `presession_api_url`, `session_gtm_on_deny`, `session_deny_service`, `consent_url`

**Added — config keys (aGTM library):**
- `consent_store_url` — POST endpoint for consent diffs. When the library is served by the sGTM Client, the URL is built browser-side at config time from `document.currentScript.src` + the fixed path `/aGTMconsent` — works under any reverse-proxy prefix transparently.
- `consent_store_enc` — encrypt the consent-store POST payload with `session_salt`
- `consent_poll_ms` — interval (ms) for the periodic CMP state-change poll started after init success. Default `2000`. `0` disables polling.
- `session` — pre-populated session object from the sGTM Client. Accepted with `sid` OR `consent`.

**Added — functions (aGTM library):**
- `aGTM.f.consent_serialize(c)` — stable, sorted, blacklist-based serialization for diff detection. Excludes `gtmConsent`, `blocked`, and empty/null values.
- `aGTM.f.start_consent_poll()` — starts the adaptive CMP poll after `run_cc('init')` succeeds. Idempotent. Gated on `consent_store_url + consent_poll_ms > 0`.

**Added — data keys (aGTM library):**
- `aGTM.d.consent_hash` — last successfully POSTed state hash (advances only on 2xx; supports retry on 5xx)
- `aGTM.d.last_consent_hash` — state-change hash, advances on every `run_cc()`. Gates `aGTM_consent_update` event + `consent_callback` so the periodic CMP poll does not flood the dataLayer when the consent state is stable.

**Redefined — `aGTM.d.session_status` lifecycle:**
- `""` — no `cfg.session` supplied (feature inactive)
- `"preset"` — `cfg.session` accepted, but no usable consent block — CMP path proceeds normally
- `"preset_with_consent"` — `cfg.session.consent` valid → seeded into `aGTM.d.consent`, GTM injects on the first tick (no CMP wait)
- `"synced"` — after `run_cc`: a CMP-driven consent change was diffed and successfully POSTed to `consent_store_url`
- `"confirmed"` — after `run_cc`: CMP-derived state matched the preset — server already had this consent, no POST sent

**Behaviour:**
- `aGTM.f.config()` preset gate: when `cfg.session.consent` is a valid object (`hasResponse: true`, `services: <string>`), it's deep-copied into `aGTM.d.consent`, the hash is seeded, and a synchronous `call_cc()` fires at the end of `config()` so GTM injects on the first tick — no 500 ms `consent_listener` wait. Requires `consent_check` to already be defined; `consent_listener` does a second sync attempt after the CMP file loads as a safety net.
- `aGTM.f.run_cc('update')` hardening: snapshots `aGTM.d.consent` before the B2 reset; restores on `consent_check` returning false. Makes the periodic poll safe even when the CMP is briefly unavailable.
- Diff/POST: end of every successful `run_cc()` (init AND update). Computes the hash once, gates `aGTM_consent_update` + `consent_callback` on `last_consent_hash`, gates the POST on `consent_hash`. Hash advances only on 2xx so 5xx triggers an automatic retry on the next tick. Payload skips empty/null values to stay symmetric with the hash.

**Adaptive CMP poll:** most CMPs (CCM19, Cookiebot, Usercentrics, Klaro in GTM-mode, …) emit consent-update events via direct `window.dataLayer.push()`, bypassing `aGTM.f.fire()` and the `consent_events` matcher. Wrapping `dataLayer.push` was rejected as fragile (later wraps by gtag etc. clobber it). Instead, after the first successful init, aGTM polls `run_cc('update')` every `consent_poll_ms` (default 2000). Snapshot/restore + hash-gated emit make this safe and quiet. Set `consent_poll_ms = 0` to disable and trigger updates manually from a CMP callback.

### sGTM Client redesign (Phase 1 + Phase 3)

- Single Session API call replaces the previous presession + session two-step. Same `uid` is used for the read AND the cookie write — consent persisted under it on one page is found on the next.
- Server-side auto-denial: when no consent is on file but the visitor is returning (`counter > 0`), the Client constructs a denial-consent block (`hasResponse: true, services: ',aGTMconsent,', gtmConsent: <auto_deny_load_gtm>, blocked: <auto_deny_load_gtm>`) and embeds it in `cfg.session.consent`. Replaces the old client-side `aGTM.f.session_apply_denial()`.
- New POST handler at fixed path `/aGTMconsent`: manages the user-ID cookie AND persists the consent into the Session API record (`POST /tp/session/{tenant}/{uid}/consent`) so the next library load returns it.
- Path is fixed (`CONSENT_STORE_PATH = '/aGTMconsent'`); the browser-facing URL is built browser-side from `document.currentScript.src` so reverse-proxy setups work without server-side knowledge.
- New template options: `consent_store_enabled` (boolean, default true), `consent_store_enc` (boolean), `session_salt` (number), `auto_deny_load_gtm` (boolean, default true).
- `aGTMversion` bumped 1.6 → 1.5 to match the redesign target.

### F→C user-ID promotion (sGTM Client + library handoff)

Returning the v1.3 behaviour of generating a stable cookie-based user ID once consent is granted, while keeping the v1.5 server-side-single-source-of-truth design. Earlier v1.5 builds wrote the `F$1$tenant$<hash>.<date>` fingerprint directly into the browser cookie on consent — that left api4sources / GA4 reports unable to distinguish real cookie users from unbound fingerprint visitors, and the daily-rolling fingerprint date was unstable across cookie-loss recovery.

The api4sgtm `/promote` endpoint (atomic Redis TxPipeline: session pointer migration + consent record write, smoketest steps 19-20) is now wired into both consent flows:

**1. Forward path — `/aGTMconsent` POST handler**: when the browser POSTs a consent diff with an `F.*` uid and the consent grants the configured services, the Client generates a new `C.1{lim}{tenant}{lim}{rand12}.{ms}` uid (where `{lim}` is the configured `fip_limiter`; the literal `C.` two-character prefix is mandated by api4sgtm), calls `POST {sessionApiUrl}/{tenant}/{F-uid}/promote` with `{new_user_id, consent}`, sets the new `C.*` cookie, and echoes the new uid in the response body. Skips the legacy `/consent` POST since `/promote` writes consent atomically.

**2. Lazy path — `/aGTM.js` GET handler (`afterSession`)**: when an existing visitor returns with an `F.*` cookie and the Session API already has stored consent (excluding server-side auto-denial via the `blocked` field), the Client promotes them on this request — no need to wait for the cookie to expire or for the user to re-interact with the CMP. One-shot per visitor.

**3. Library handoff** (`aGTM.js`): the consent-store XHR's `onreadystatechange` now parses the response body. If `response.uid` differs from `aGTM.d.session.uid`, the library adopts the new value so the next consent diff POST and any downstream consumers see the promoted uid. Defensive: try/catch around `JSON.parse`, type-guards against non-string `uid` field. No behaviour change for legacy server responses without a `uid` field.

Failure handling: `/promote` failures (404 / 400 / 5xx / network) fall back to the legacy F.* path so the user is never left in a broken state. `cookieMode='never'` skips promotion entirely (the new C.* could not be persisted browser-side and would be lost). 9 tests in `test/consent_store_uid_promote.test.js` cover the library-side adoption rules.

**Hardening pass after adversarial code review (BLOCKER + 3 HIGH findings):**

1. **`new_user_id` format.** api4sgtm `/promote` strictly validates `new_user_id` starts with literal `"C."` (per `internal/api/api4sgtm/team-spec.md` §"Promote / Migrate session"). The initial implementation built the C-prefix using `CFG.fipLimiter` (default `$`), producing `C$1$tenant$...` → 400 on every call → silent fallback to legacy F.* on every consent. Fix: hardcode the literal `C.1` prefix (so `new_user_id` always starts with `C.`), then use the configured `fipLimiter` for the rest — final shape `C.1{lim}{tenant}{lim}{rand12}.{ms}`. With the default `$` limiter the cookie reads `C.1$cl_example$987…` alongside the F-side `F$1$cl_example$<hash>.<date>`, byte-for-byte consistent after position 2.

2. **Encrypted-mode silent corruption.** When `consent_store_enc=true`, the request body shape is `{"q":"<enc>"}`. Server-side decryption is not implemented; the legacy parser would treat the blob as a flat object, fall back to the cookie value for uid, and build an empty consent block — `/promote` would then write that empty consent into the migrated session via full-replace semantics. Fix: `/aGTMconsent` now returns `501` with `{"ok":false,"err":"consent_store_enc not supported server-side"}` when `cp.q` is set without `cp.e`. Disable `consent_store_enc` until full-stack encryption support ships.

3. **Auto-denial gate too narrow.** The lazy-promote condition checked `consent.blocked !== true`, but the server-side auto-denial constructor sets `blocked: CFG.autoDenyLoadGtm` — when the admin's policy is "do not load GTM under auto-denial" (`auto_deny_load_gtm=false`), `blocked: false` would slip past the check and a non-consenting visitor would be promoted. Fix: detect auto-denial structurally (`services === ',aGTMconsent,'` sentinel OR `'blocked' in sessionConsent` regardless of value).

4. **Empty-config promoting anything.** `hasRequiredConsent('','','')` returns `true` when no `consent_service`/`_purpose`/`_vendor` is configured (default-permissive for tenants without a consent gate). Combined with finding #2, an empty/corrupt POST payload would be considered "granted" and trigger promote. Fix: gate both the forward and lazy paths on an explicit signal — at least one of `services`/`purposes`/`vendors` must be non-empty before promote can fire.

5. **Library-side race condition.** Two concurrent consent POSTs (e.g. CMP fires `update` twice in quick succession): POST #1's promote succeeds, library adopts `C.*`. POST #2's promote 404s (session already migrated) → server falls back to echoing `finalUid=cpUid` (still F.* from the cookie at request time) → library was overwriting the C.* with the F.* fallback. Fix: library only adopts `resp.uid` when it starts with literal `C.` — never downgrades an already-promoted C.* to a fallback F.*. Also short-circuit the response-body parse on empty body to remove log noise on legacy server responses.

Three new tests cover the hardening (F.* race-safety, non-C-prefix defensive, `generateCookieUid` format contract). Smoketest gap: steps 19/20 hand-construct test users with `.` separators instead of round-tripping through `generateCookieUid()` — that's why finding #1 wasn't caught pre-launch. Worth a follow-up smoketest amendment.

### Sources API integration (sGTM Client → api4sources)

- New: optional POST to a Sources API on every aGTM.js request. The sGTM Client builds the payload (`user_id`, `page_location`, `referrer`, `timestamp`) from the integration code's `?c=` base64 (page URL + referrer) and the resolved session uid. Tenant is reused from `tenant_id`.
- Race-free: the POST fires after the Session API step completes, so api4sources' `customer_sessions:{tenant}:{user_id}` Redis lookup hits the just-written session.
- **Response capture (sequential):** the POST is now awaited (changed from fire-and-forget) so its response payload can be captured. On 2xx, **every non-meta top-level field** is copied into `sessionData` (meta = `ok`/`tenant`/`session_id`/`ts`/`skipped`/`reason`; reserved session keys `uid`/`sid`/`consent`/… blacklisted so the API can't clobber the session; empty/null values skipped). The flat affiliate `source` (last-cookie-win, e.g. `it_webgains`) lands at `aGTM.d.session.source`, readable in webGTM via a plain GTM "JavaScript Variable", no custom template. A **non-empty** `source`/`attribution` is enough to carry the session through even a degraded Session API response (no `sid`/`consent`) — an empty `source` is skipped at capture. On timeout/error/non-2xx nothing is captured and delivery proceeds. Adds one internal round-trip to /aGTM.js latency (an api4sources outage can delay `/aGTM.js` up to the 1500 ms timeout — monitor it).
- **Inline attribution (opt-in):** with `sources_attribution` on, the POST appends `?attribution=true&method=<sources_method>` and the returned `attribution` object is wrapped by method into `sessionData.attribution`, feeding the library's `resolveAttribution()` HYBRID merge (see library-side section) — **one request** for source + attribution instead of a separate GET.
- **URL build:** `sources_api_url` holds the bare base **without** tenant/query; the Client appends `/{tenant}` (and the attribution query after it). Help text warns against baking tenant/`?attribution=true` into the field (produces `…/tp/sources/fcm/?attribution=true/fcm`).
- New template options (sGTM Client): `sources_enabled` (boolean, default false), `sources_api_url` (text), `sources_attribution` (boolean, default false), `sources_method` (SELECT, default `last_touch`). Tenant is reused from the existing `tenant_id` field.
- The aGTM library's only involvement is the preset-gate widening + deep-copy that carry `cfg.session.source`/`cfg.session.attribution` through to `aGTM.d.session.*`; the POST itself is purely server-side.
- **Hardening (F-01/F-02):** `sources_method` is now validated against the five api4sources methods (`last_touch`/`first_touch`/`last_click`/`first_click`/`last_non_direct_click`) at config time — a stale or overridden value falls back to `last_touch` instead of requesting/wrapping attribution under an invalid key. An empty `attribution {}` in the Sources response is no longer wrapped, so it can't create a dead `aGTM.d.attribution[method]` entry. Applied byte-identically to `sgtmClient/template.tpl` and `sgtmClient/src/…`.
- Test client: `internal/api4sources/smoketest.tpl` (gitignored) extended with sources steps 5-8 (insert, dedup, referrer-change insert, no-active-session skip). Sources steps reuse the session created in step 1 (same Redis), so the original 4 session steps are the precondition; sources steps run only in auto-mode (`?auto=1` / `?format=json`), not in the manual single-step wizard.
- Smoketest: step 6 (sources-dedup) gained a configurable retry loop (`step6_max_attempts`, default 3) with no-op session GETs between attempts to mask api4sources eventual-consistency lag.
- Smoketest: step 3 (consent re-read) gained a `step3_warn_only` toggle (default on). Missing consent on the immediate re-read now produces a yellow `WARN` instead of a red `FAIL`, and the overall verdict can now be `PASS_WITH_WARN`. Rationale: production consent flow doesn't depend on this read — the CMP delivers consent later asynchronously. Hard Phase-0 semantics still available by unchecking the toggle.

### Attribution read-back (HYBRID merge, library side)

- New `aGTM.f.resolveAttribution(method)`: returns the 11-field attribution object (`sou`, `cam`, `med`, `camid`, `cli`, `clp`, `cls`, `afs`, `sre`, `lcs`, `fss`) for the given method by merging the current page's URL/referrer with `aGTM.d.session.attribution[method]` from the sGTM Client. The current URL wins for browser-derivable fields (utms, click-IDs, referrer); the API fills in cross-session-memory fields (`afs`, `lcs`, `fss`) and serves as fallback when the URL is empty (the current URL is always the freshest source, so it takes precedence for anything the browser can derive).
- New `aGTM.f.parseUrlParams(qs)`: minimal ES5 query-string parser used by `resolveAttribution`. Handles percent-encoding, `+`-as-space, and survives malformed URI sequences without throwing (fail-soft per-decode: bad keys/values fall through to their raw form rather than crashing the parse for the rest of the URL).
- Click-ID detection iterates a deterministic ordered list (`gclid, fbclid, msclkid, ttclid, gbraid, wbraid`) so two click-IDs in one URL produce a stable result (`gclid` wins on collision) regardless of JS engine.
- `aGTM.f.config()` now populates `aGTM.d.attribution[method]` for every method present in `cfg.session.attribution` (the sGTM Client always normalises to a keyed-by-method shape, even for single-method requests). GTM tags read e.g. `aGTM.d.attribution.last_touch.sou`. No-op when the preset is absent — standalone integrations are unaffected.
- Session-acceptance gate widened from `cfg.session.sid || cfg.session.consent` to also accept `cfg.session.attribution` and `cfg.session.source`, so attribution-only or source-only payloads are not silently dropped (the latter survives even a degraded Session API response with no `sid`/`consent`).
- New default `aGTM.d.attribution = {}` in `objinit`, so consumers can rely on the object always existing.

### Attribution read-back (sGTM Client wiring) — reworked into the Sources POST

- The standalone Attribution API **GET** (`fireAttribution` + template options `attribution_enabled`/`attribution_methods`/`attribution_api_url`) was added during v1.5 development but **removed before release**: it was end-to-end non-functional — it built `…/tp/sources/…?methods=` instead of hitting the `…/tp/attribution/…` endpoint, so it always 404'd. Since v1.5 is unreleased, no migration path is required.
- **Replaced by inline attribution on the Sources POST:** `POST /tp/sources/{tenant}?attribution=true&method=<…>` returns the `attribution` object in the same response (api4sources contract). The Client wraps it by method into `cfg.session.attribution`, which feeds the unchanged library-side HYBRID merge above. One round-trip instead of two; no wrong-endpoint trap. Gated by the `sources_attribution` checkbox; method chosen via the `sources_method` SELECT.
- Session-passthrough gate in `buildAndSend` widened to also accept `sessionData.attribution` and `sessionData.source`, so attribution-only or source-only payloads (no `sid`/`consent` to forward) are not silently dropped.

### sGTM Client: Pre-aGTM Init Script + CMP Loader Pattern

- New template option group **Pre-aGTM Init Script** (`pre_init_enabled`, `pre_init_code`): a multi-line JavaScript field whose content is prepended verbatim to the `/aGTM.js` response, before the aGTM library is parsed. Wrapped in an IIFE inside `try/catch` — runtime errors are logged to the browser console as `[aGTM preInit]` and do not break aGTM. Syntax errors still abort parsing of the whole response, so the help text recommends syntax-checking before publishing.
- New documentation section **CMP Loader Pattern** (in `sgtmClient/README.md`): a separate Web GTM container with `noConsent: true` is the recommended way to load a CMP before aGTM checks consent (no shared blast radius, standard GTM workflow). The Pre-aGTM Init Script field is positioned as a fallback for cases where a separate container is not viable.

### GTM template "DL Repeat" — replay engine moved into the library (v1.5)

- **New library function `aGTM.f.dlrepeat(cfg)`.** The whole DL-Repeat / late-enrichment engine now lives in `aGTM.js`. The GTM tag was reduced to a thin wrapper that collects its settings and calls `aGTM.f.dlrepeat()` once. The library watches the chosen source (`aGTM.d.f` / `aGTM.d.dl` / live `dataLayer`) for the configured wait-event(s) and, once all are present (or after the timeout), repeats the matching earlier events itself (marked `aGTMrepeated = true`).
- **Single trigger.** Because the library can poll the dataLayer (the GTM sandbox cannot), the tag now needs only **one** trigger (e.g. All Pages). The previous multi-event trigger (`aPageview|user_data|aGTM_repeat_fallback`) and the `aGTM_repeat_fallback` re-trigger control event are gone. `fallbackTimeout` is now an internal wait, not a re-trigger.
- **Requires the aGTM library v1.5+.** The tag checks for `aGTM.f.dlrepeat` and logs a warning + does nothing if the library is older. Tag template permissions reduced to `aGTM.f.dlrepeat` (execute) + `aGTM.f.rReplace` (execute).
- Idempotency unchanged in effect: at most one replay per page (`aGTM.d.dlrepeatDone`) + the `aGTMrepeated` loop-skip → no double `purchase`, no loop. Tag field help texts rewritten in plain language. Tag template version → 1.5.
- **Opt-in error signal `aGTM_repeat_fallback`** (checkbox "Fire an error event if the wait-event(s) never arrive"): pushed **only** on the timeout-fallback path (wait-event never came → unenriched replay) **and only when at least one event was actually repeated** (`aGTMrepeatCount >= 1`), with `aGTMrepeatCount` + `aGTMrepeatSource`. Trigger a monitoring/alert tag on it. Nothing is emitted on a normal enriched replay, nor when there was nothing to replay. The event also carries **`aGTMrepeatMissing`** (comma-list of the gate event(s) still absent at the timeout — the culprit, e.g. `user_data`; a conditional gate whose discriminator never arrived reports that discriminator) and **`aGTMrepeatWaited`** (the give-up threshold in ms), so a monitor can see exactly *what* never arrived instead of just *that* a fallback happened.
- **Conditional wait-events (`gateEvents` `?if=` syntax).** A wait-event can now be made conditional so it is only required for the visitors who actually receive it: `G?if=E[A]` requires `G` only when an event `E` with a non-empty attribute `A` exists, `G?if=E[A:V]` only when `E.A === V`, `G?if=E` only when an event `E` exists at all (empty = `null`/`undefined`/`""`; a token without `?if=` is always required, unchanged). The predicate reuses the `event[attr]`/`event[attr:value]` **parse** syntax of `consent_events` (note: the gate's bare `[A]` means non-empty, whereas `consent_events`' `[attr]` matches on mere presence; `[A:V]` is a strict string compare). A malformed predicate fails safe to unconditional (never silently drops the gate), and an as-yet-absent discriminator event makes the gate wait rather than replay unenriched. **Motivating production case (fc-moto):** gating site-wide on `user_data` (which only logged-in users receive) made *every guest on every page* run into the 1.5 s timeout and fire `aGTM_repeat_fallback` — ~7.6M "Repeater Error" exceptions / 28 days. With `aPageview, user_data?if=user[id]` guests replay in order immediately (no wait, no fallback), while logged-in visitors still wait for enrichment and the control event fires only on a genuine miss. Fully backward-compatible; only `aGTM.f.dlrepeat`'s gate evaluation changed.

### GTM template "DL Repeat" — live dataLayer replay source (v1.4)

- **New "Live GTM dataLayer" replay source.** `aGTM.d.dl` only ever contains events dispatched through `aGTM.f.fire` — raw `dataLayer.push({...})` events (all most shop plugins, e.g. Shopware, can emit) never enter it. The new source replays the real `dataLayer` (`window[gdl]`, name read from `aGTM.c.gdl`, default `dataLayer`), so late-enrichment works for shops that push commerce/enrichment events straight to the dataLayer. Same gate / fallback / per-page-watermark / loop-protection logic; separate watermark key `aGTM.d.repeatMaxLive`. New permissions: read `dataLayer` + `aGTM.c.gdl`, read/write `aGTM.d.repeatMaxLive`. Use the whitelist to scope the replay (the live dataLayer also holds `gtm.*` internals).

### GTM template "DL Repeat" — late-enrichment replay (v1.3)

Feature requested by the GTM team (2026-06-24, driver: fc-moto), built on top
of the v1.2 bug fixes:

- **New "Replay source" option.** In addition to the pre-load buffer (`aGTM.d.f`, default, unchanged), the tag can now replay the **post-load event log** `aGTM.d.dl` — events fired *after* GTM/consent loaded. Use case: an enrichment event (e.g. `user_data` with hashed identifiers) arrives after `view_cart`/`purchase`; triggering this tag on the late event repeats the earlier events (marked `aGTMrepeated = true`) so Enhanced Conversions / Criteo etc. fire again with full data. Storage-free (RAM only).
- **Gate event(s)** (AND-joined): the replay runs only once the configured event(s) are present in the log. Required when the tag triggers on more than the enrichment event (e.g. an early anchor for the fallback); blank only when triggering solely on the enrichment event. Use the whitelist to scope the replay to the commerce events that need enrichment. Only one `source=dl` replay tag per page (consumer tags fire on `aGTMrepeated=true`).
- **Fallback timeout** (default 1500 ms): if the gate event never arrives (e.g. guests without `user_data`), the replay runs once anyway (unenriched) so no consumer tags fail. Implemented via `aGTM.f.timer` firing an `aGTM_repeat_fallback` re-trigger event; the tag trigger must include that event and an early anchor (e.g. `aPageview`).
- **Dedup / no double conversion:** each source event is repeated at most once per page (per-page watermark + in-code skip of `aGTMrepeated === true`), even on multiple trigger fires — critical for `purchase`. Replays preserve original order; optional "clear ecommerce between events" avoids object bleed.
- Also aligns the send-type checks with their checkbox labels — the `aGTMdl`-based check was inverted (`aGTMdl === true` marks raw GTM dataLayer items; `aGTM.f.fire` events carry no `aGTMdl`), which is also why `agtmFired` is the correct default for the primary "replay aGTM.f.fire events" use case.
- Requires new template permissions: read `aGTM.d.dl`, read/write `aGTM.d.repeatMax` and `aGTM.d.repeatFallbackScheduled`, execute `aGTM.f.timer`.

### GTM template "DL Repeat" — bug fixes (v1.2)

Bug review reported by the GTM team (2026-06-24, driver: fc-moto). All five
confirmed against the source and fixed in `gtm/tags/dl-repeat/aGTM tag - DL Repeat.tpl`:

- **maxEvents counted checked instead of repeated events** — `count++` ran at the top of the loop before all skip filters, so internal `gtm.*`, blacklisted, non-whitelisted and message events consumed the budget; in the worst case 0 events were repeated. Now counted only right before the event is actually fired.
- **Whitelist/blacklist wildcards** — native `String.replace('*','.*')` only replaced the first `*` (patterns like `*view*` broke) and comma-separated entries were never trimmed (`a, b` produced `^ b$` and never matched). Now uses `aGTM.f.rReplace` (global) and trims each entry.
- **No idempotency / loop protection** — the whole buffer was re-fired on every tag execution. Added an in-code skip of events already carrying `aGTMrepeated === true` (loop protection) and an `aGTM.d.repeatDone` once-per-page guard so a trigger firing more than once per page no longer duplicates events.
- **maxEvents default 100** — the default was only applied when GTM passed it as a string; a numeric default slipped through to "unlimited". Now accepted as both string and number (and the field default is a string).
- **Ineffective permission guard** — a missing `access_globals` permission only logged a warning and then fired anyway. Now aborts.
- **Config trap** — with both send-type checkboxes off the tag silently did nothing. "Send Events fired via aGTM.f.fire" now defaults to on, with help text noting at least one must be enabled.

### GTM template "Pageview Events" — idempotency + cleanup (v1.5 release-gate)

Template audit finding on `gtm/tags/pageview-events/aGTM tag - Pageview Events.tpl`
(+ library side `aGTM.js`, tag `1.0 → 1.1`):

- **URL-listener resource leak (library)** — `aGTM.f.urlListener` re-wrapped `history.pushState`/`replaceState` in a fresh Proxy on every call, registered another polling interval (timer names carry a unique suffix, so there is no dedup and the extra `setInterval` is never stopped) and added another popstate/hashchange listener. Called from both `gtm_load` and the Pageview tag (or a multi-trigger SPA setup), these accumulated unbounded. (Duplicate events were already suppressed by the shared `last_url` dedup; the defect was the leak, not double firing.) It is now guarded by `aGTM.d.urlListener_active` and runs its setup only once — the first caller wins, a later call with different parameters is intentionally ignored. New test `test/urllistener_idempotent.test.js`.
- **Debug logs in production** — removed the two unconditional `logToConsole` calls around the URL-listener activation (the `logging` permission was scoped to all environments).
- **README default corrected** — the documented default event name was `vPageview`; the tag actually defaults to `aPageview` (the `vPageview` name was deprecated in v1.4). Example, template filename, version and a broken overview link fixed too.
- **Least-privilege / dead code** — dropped the dead `require`s (`logToConsole`, `setInWindow`, `copyFromWindow`, `queryPermission`), the now-unused `logging` permission, and the commented-out WebGL bot-detection block.
- Deferred: GTM `___TESTS___` scenarios (systemic F-41); finer `access_globals` granularity (systemic F-42).

### GTM template "Form Events" — config traps fixed (v1.5 release-gate)

Template audit finding on `gtm/tags/form-events/aGTM tag - Form Events.tpl`
(tag `1.0 → 1.1`). Rendered several fields ineffective:

- **Form-click event name field was dead** — the code read a non-existent `startevent` field instead of `clickevent`, so the event name was always hard-coded to `form_start`. It now reads `clickevent` and defaults to `form_click` (the field default). **Behaviour change / upgrade note**: integrations that relied on the accidental `form_start` name now emit the value configured in the field (default `form_click`) — repoint any GTM trigger listening for `form_start` to your configured click event name, otherwise it silently stops firing.
- Cleanup: removed the dead `logToConsole` require and the unused `logging` permission (consistency with the Pageview tag).
- **`maxclicks` was always 1** — the guard only accepted a string, but the NUMBER field passes a number, so any configured limit was ignored. It now accepts number and numeric string with a NaN / `<= 0` guard.
- **Click counter was global** — a single `aGTMformClicks` number capped the click event across all forms on the page combined. It is now a per-form map, so `maxclicks` applies to each form independently.
- **Null-deref fix** — a focused field without a resolvable `<form>` ancestor (`el.form === null`) no longer throws on `el.form.id`.
- Docs: README version/link/license (MIT → Apache-2.0) corrected.
- Tests: GTM `___TESTS___` scenarios remain part of the systemic test buildout.

### GTM template "iFrame Support" — security hardening (v1.5 release-gate)

Template audit finding on `gtm/tags/iframe-support/aGTM tag - iFrame Support.tpl`
(+ library side `aGTM.js`). The tag processed foreign-origin `postMessage`s
fail-open; fixed to fail-closed (tag `1.0 → 1.1`):

- **Opaque-origin bypass** — an opaque / non-http origin (sandboxed or `srcdoc` frames reporting origin `"null"`, `data:`/`blob:`) resolved to an empty hostname, which skipped the allow-list check entirely and let the message through even when an allow-list was configured. Opaque origins are now **always rejected**; a configured allow-list is enforced strictly.
- **dataLayer injection via event-less messages** — foreign messages without a valid `event` were unconditionally merged into the predefined event and fired. Now only messages carrying a non-empty `event` are processed.
- **Handshake origin hijack (library)** — `aGTM.f.ifHSlisten` adopted the sender origin of any message matching the handshake string, so a sibling frame or injected script could forge the handshake and redirect all outgoing iFrame events. It now accepts the handshake only from `window.top` (`e.source === window.top`). The top-side `targetOrigin: "*"` broadcast is retained (fixed non-sensitive token) and documented as safe because security is enforced on the receiver.
- **Cross-message state leak** — the predefined event object `o.d.e` was mutated in place on every message (and pushed to the queue by reference), so parameters leaked between messages. It is now an immutable base cloned per message.
- **Dead code** — removed the unreachable `o.c.eventname` branch.
- **Docs / defaults** — hostname-filter help text and README now warn that an empty list accepts any http/https origin (trusted same-site only) and that opaque origins are always rejected.
- **Tests** — library regression test `test/iframe_handshake.test.js` (handshake accepted from top, forged handshake rejected, wrong payload / non-iframe ignored, queue flushed to the verified origin). GTM `___TESTS___` scenarios remain part of the systemic test buildout.

### GTM template "Timer Events" — validation + least-privilege (v1.5 release-gate)

Template audit finding on `gtm/tags/timer-events/aGTM tag - Timer Events.tpl`
(tag `1.0 → 1.1`):

- **Ineffective NaN guard → 0ms timer** — `makeNumber('abc')` returns `NaN` and `typeof NaN === 'number'`, so the old `typeof` guard let non-numeric seconds through and `makeInteger(NaN*1000)` armed a 0ms timer; combined with `repeat = 0` (unlimited) that is a tight loop hammering `aGTM.f.fire`. Seconds are now validated via the NaN self-inequality and any non-positive or sub-millisecond value (rounds to 0ms) is skipped. **Both ends closed:** very large seconds are clamped to the 32-bit `setInterval`/`setTimeout` ceiling (`2147483647` ms, ~24.8 days) so they cannot overflow the browser timer and fire immediately. `repeat` falls back to a single fire for non-numeric/negative input; `0` stays "unlimited".
- **Duplicate loop removed** — the additional-parameter table was merged into the event twice; now once.
- **Least-privilege** — only `execute` on `aGTM.f.timer` remains; the dead `logToConsole` require, the `logging` permission and the read/write `aGTM` + `aGTM.f.fire` globals were removed.
- **Known limitation documented** — `aGTM.f.timer` creates an independent, never-stopped timer per tag run; unlimited `repeat` on a multi-firing trigger accumulates. Prefer a finite repeat or a once-per-page trigger.
- Tests: `___TESTS___` scenarios cover the seconds/repeat validation (GTM-only; systemic bun coverage remains F-41).

### GTM template "Copy Events" — dead observer removed + least-privilege (v1.5 release-gate)

Template audit finding on `gtm/tags/copy-events/aGTM tag - Copy Events.tpl`
(tag `1.0 → 1.1`):

- **Dead `document.body` MutationObserver removed** — a stray `aGTM.f.observer` call installed a permanent subtree observer that never matched a copy event but ran on every DOM mutation (needless SPA load). The real listener is `aGTM.f.addElLst`.
- **Least-privilege** — removed the `logging` permission, the dead `logToConsole`/`copyFromWindow` requires, the read/write `aGTM` global and the now-unused `aGTM.f.observer` grant; `aGTM.f.rTest` is execute-only.
- Corrected copied/misleading comments; README license (MIT → Apache-2.0), link and version fixed.
- Tests: `___TESTS___` scenarios cover type detection (string/email/phone), the contact prefix, text filtering, parameter merge and the non-string guard.

### GTM variable templates — guards + docs (v1.5 release-gate)

Template audit findings on the three variable templates:

- **Consent Check** (`aGTM var - Consent Check.tpl`, `1.1`) — **empty-value config trap fixed**: `indexOf('')` returns `0`, so an empty "String value to check" granted consent for every non-empty field. An empty value now returns not-granted. Least-privilege (dead `logToConsole` require, `logging` permission and unused read `aGTM` global removed). README documents the `stringify` field + empty-value behaviour.
- **Consent Info** (`aGTM var - Consent Info.tpl`, `1.1`) — internal `displayName` corrected ("aGTM var - Consent" → "… Consent Info"). Documented (README + inline note) that the `cm`/`all` modes read `aGTM.d.cm`, which is written by the **Consent Mode tag**, not the library — without that tag, or when evaluated before it runs, the signals fall back to all-denied (tag coupling + ordering race). Documented the `base64` field. Least-privilege cleanup.
- **Content Counter** (`aGTM var - Content Counter.tpl`, `1.1`) — **null guard**: `aGTM.f.pageinfo` returns `undefined` before aGTM has loaded; `o.words`/`o.images` then threw. It now falls back to an empty object and returns `0`. Least-privilege cleanup. README license/link/version fixed.
- Tests: `___TESTS___` scenarios added to all three (GTM-only; systemic bun coverage remains F-41).

### GTM templates — systemic license + least-privilege sweep (v1.5 release-gate)

- **License** — every remaining tag/variable README stated the **MIT** License; the project is **Apache-2.0**. All corrected. Dead dash-style `.tpl` references (both clickable links and inline prose) fixed to the real space-containing filenames across all templates.
- **Least-privilege (F-42)** — the over-broad read/write `aGTM` `access_globals` key was statically confirmed dead (no `copyFromWindow`/`setInWindow` on it; every `callInWindow` target has its own execute grant) and removed from the core `aGTM Tag`, Form, Pageview and iFrame templates; iFrame additionally dropped its dead `logToConsole`/`copyFromWindow` requires and the `logging` permission. The Pageview `aGTM.f.rmLstn` grant (previously missing for the latent listener-removal path) was added so code and permissions are honest.

### sGTM Client — server-template tests + source-sync tooling (v1.5 release-gate)

- **Tests (#18)** — the sGTM Client server template (`sgtmClient/template.tpl`) had a single assertion-less smoke test; it now carries **8 real `___TESTS___` scenarios** covering the synchronously reachable request logic: the consent-store POST handler (uid echo, cookie-fallback uid, encrypted-payload 501 guard, cookie write in cookie-consent mode, disabled-store no-op) plus GET routing (bot-403 on missing client IP, unknown container id, non-matching route). Verified in the GTM server-container Tests tab. The `/aGTM.js` config-building path (`buildAndSend`) is deliberately not unit-tested here: it is reachable only after the async Session-API `sendHttpGet().then()`, whose microtask runs after the synchronous test assertions (and leaks across scenarios in the GTM test harness) — so it stays covered end-to-end by the internal API smoketest (finding F-44).
- **Source-sync tooling (F-43)** — `scripts/update-sgtm-template.js` now injects the freshly built `aGTM.base64` blob into **both** the template's sandboxed block **and** `sgtmClient/src/aGTM-sGTM-Client-jsSourceCode.js`, so the human-readable client source no longer drifts from what ships (it had gone stale, 38 432 vs 47 588 chars). Idempotent; keeps the byte-identity invariant automatic across library rebuilds.

### GTM template "DL Repeat" — version-guard warning visible in production (F-28)

- The `logging` permission `environments` was widened from `"debug"` to `"all"` so the unconditional "aGTM.f.dlrepeat not found — update the aGTM library to v1.5+" guard actually surfaces in live containers (where a stale library manifests). The other two log calls stay `cfg.debug`-gated, so no live noise. Tag 1.5 → 1.5.1.

### Other v1.5 fixes and additions

- Bug fix: `consent_events` config option now wired up via `config()` (was never read from user config)
- Bug fix: `consent_events` indexOf check wrapped with commas — first event name in list was never matched
- Bug fix: `consent_event_attr` bracket-notation parser implemented in `config()` (`'event[attr:val]'` syntax now works); `consent_event_attr` initialised to `{}` to prevent TypeError
- Bug fix: `dlOrgPush: 'restore'` now works — code checked for `'replace'` but docs said `'restore'`
- Bug fix: `aGTM.f.proxySupport` called without `()` in `urlListener` — was always truthy, browser support check never ran
- Bug fix: `new URL()` (ES6) replaced with ES5-compatible equivalents in `gtm_load()`
- Bug fix: `stoptimer()` used wrong clear function — `rp===1` (setTimeout) now gets `clearTimeout`, all others get `clearInterval`
- Bug fix: `dlOrgPush` hook detection fired a false positive when gtag.js or a second GTM container re-wraps `dataLayer.push` — fixed by checking `/sandbox/i` on the new function and silently updating the baseline instead of firing an exception
- Performance: `dlOrgPush` check now uses reference equality (`!==`) as first guard instead of `toString()` comparison — `toString()` only called when the reference actually changed; result cached in `pushStr` and reused for both the sandbox check and the `fct_hook` field
- New event property `_noDLPush`: when `true` in a `fire()` call, the event is tracked internally (`aGTM.d.dl`, `aGTM.l`) and POST transport fires, but `sendnaus()` / `iFrameFire()` are skipped — the event is not pushed to the GTM dataLayer; `sendnaus_callback` is still called; combine with `_noConsent` and `_post` for Google-independent event transport
- New event properties documented: `_post`, `_noConsent` (already present, now in README event-properties table)
- iframe queue bug fixed: `iFrameFire()` now correctly queues to `aGTM.d.f`
- Consent polling interval changed from 1000ms to 500ms
- POST transport layer added: `aGTM.f.xsend()` for direct HTTP POST, `aGTM.f.enc()` for payload obfuscation
- New config options: `transport_url`, `transport_enc`, `transport_salt`
- `aGTM.f.xsend()` returns the `XMLHttpRequest` instance so callers can attach `onreadystatechange`
- aEvents sGTM Client Template: bug fix — `parsePlain()` now accepts already-parsed objects from POST body; null guard before `eventObj.consent` access; OPTIONS preflight handler added; POST body reading alongside GET query parameter support
- aEvents GTM Tag Template: new `bypassConsent` option routes via `aGTM.f.fire()` with `_noConsent: true + _noDLPush: true`; new `includeSession` option enriches events with `aGTM.d.session` fields; salt fallback reads `aGTM.c.transport_salt`/`session_salt` when no local salt configured
- Code: unused `var dl` removed from `sendnaus()`
- Docs: German inline comments in `ifHandshake()` translated to English
- Docs: `README.md` build instructions updated from npm to Bun
- Docs: `README-for-Developers.md` release flow now references `CHANGELOG.md` (not `README.md`)
- Docs: `README.de.md` added — German quickstart for GTM developers
- Docs: removed the legacy `ck` URL-parameter section (`ckServices`/`ckVendors`/`ckPurposes`, `ck=0|1|2`) from `README.md` — it documented a never-implemented feature superseded by the v1.5 POST transport + consent-store (`/aGTMconsent`); was end-to-end dead (library never appended it, sGTM Client read but never used it). See `docs/open-decisions.md` OE-2.
- CMP `consent_check` short-circuit (`if (action == 'init' && hasResponse) return true;`) is now load-bearing for the preset-with-consent fast path; new test `cmp_short_circuit.test.js` enforces the pattern across all `cmp/cc_*.js` files
- Foundation for standalone aGTM usage without webGTM
- New CMPs: JTL Consent, JTL EU Cookie
- New GTM Variable Templates: Consent Check, Consent Info
- GTM template files renamed (spaces instead of dashes)
- Brand icon (thumbnail) downsized to 64×64 PNG8 across all GTM templates (~10.4 KB → ~2.6 KB each), shrinking every template's stored size
- Build system migrated to Bun (`bunx terser`); no `npm install` required
- `VERSION` file as single source of truth for version number; build propagates to all files
- `sgtmClient/template.tpl` base64 payload and version auto-updated on each build
- Test suite grown from 75 to 287 tests across 23 files (`bun test`) — final count to be confirmed at release-tag time
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
