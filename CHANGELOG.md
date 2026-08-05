# Changelog

## Version 1.5 — *in development*

### Fixed — the sGTM Client's "Use env Parameter" switch never did anything

The container table defines the column as `gtm_use`; the config builder read `v.gtm_env`,
a column that exists nowhere in the template. `env` was therefore never set and the GTM
container URL never carried the environment parameters, whatever the switch was set to.
Present since the column was introduced (2025-09-24) — so, unlike the `gtm_id_match`
defect below, this one is not a v1.5 regression: the switch has never worked, in any
version that had it.

The same blind spot ran through the tests. `container-select.test.js` asserted that `env`
was "carried through" using a fixture that invented a `gtm_env` column — a field nobody
can configure. It passed no matter what the Client did with the real one.

### Added — "URL Parameters": four ways to build a container's environment string

The repaired switch became a per-container choice (column renamed accordingly), and the
column now accepts a **variable**:

| Option | Appended to the container URL |
|---|---|
| `no` (default) | nothing |
| `env from URL` | `gtm_auth`, `gtm_preview`, `gtm_cookies_win` from the request |
| `all from URL` | every query parameter except aGTM's own `id` and `c` |
| `custom` | the new **Custom Parameters** column, independent of the request |

Details that are decisions rather than mechanics:

- A parameter the caller repeated (`?a=1&a=2`) arrives as an array and is **reproduced in
  full, in order**. Dropping it would silently lose an env setting; taking "the first one"
  would invent a rule the caller never agreed to. Values are URL-encoded, so a parameter
  cannot smuggle in further parameters.
- Repetitions are capped at 10 and the whole string at 1000 characters. The cap bounds the
  **loop**, not just the output, and the budget is checked *before* appending, so a
  parameter is either fully present or absent — a URL cut in the middle of a parameter
  looks valid and is wrong.
- A variable that resolves to none of the four options is honoured as `custom` **and
  logged**. A renamed or failing variable would otherwise change which GTM environment a
  container loads without leaving a trace anywhere.
- An **empty** resolved value is not that fallback: `''`/`undefined`/`null`/`false` is what
  an untouched row looks like, and appending parameters to rows nobody configured would be
  the opposite of a default.
- A row still carrying the old boolean `true` (the former "yes") keeps meaning the env
  parameters — an existing configuration does not change meaning, it starts working.

`all from URL` forwards whatever a caller puts in the URL into the address the page loads
GTM from. It is off by default and the field help says so.

> **Upgrade note:** the switch was inert, so nothing that runs today changes by itself —
> but a tenant who set it to "yes" expecting environment parameters has been silently
> getting the live container. After the re-import that row means `env from URL` and will
> start loading the environment it was configured for. Check who has it set before rolling
> out.

### Fixed — the sGTM Client's "fire only the matching container" checkbox did nothing

`gtm_id_match` ("Fire only GTM container matching the ID in URL") survived the v1.5
single-session refactor as a field in the template UI, but the rewritten config builder
filtered the container table on `?id=` **unconditionally** and never read the flag. Two
things followed from that:

- The checkbox was inert, and its own help text ("If not checked, all of the following GTM
  Containers will be fired") described the opposite of what happened — a tenant with
  several containers only ever got the one named in the URL.
- A request **without** `?id=` matched nothing and produced an empty container list. The
  library was served and initialised, and then had nothing to inject. That is the silent
  version of "GTM does not load".

Restored to the v1.4 semantics: unchecked serves every configured container, checked
filters on `?id=`. Filtering with no `?id=` present is still nothing-matches — that is a
configuration mistake, so the Client now writes a warning instead of serving a library
that can never inject. `test/sgtm/container-select.test.js` covers all four combinations
plus the unchanged allowed-ID gate.

> **Upgrade note for existing v1.5 deployments:** if you configured several containers
> while the bug was live, you were getting exactly one of them. After the re-import you
> get all of them. Tick "Fire only GTM container matching the ID in URL" if that is not
> what you want.

### Fixed — the sGTM Client no longer answers without saying which version it is

The v1.4.3pre Client sent an `x-agtm-version` response header on `/aGTM.js`. The v1.5
single-session refactor dropped the call but kept the `const aGTMversion` declaration, so
the constant sat in both files unread — and `update-sgtm-template.js` never synced it,
which means a version bump would have moved the template's `displayName` while the
constant kept naming the previous release. That drift is not hypothetical: at the time
1.4.3pre shipped, the constant in this repository still read `1.4.2`. (In the repository's
own history the call was never correct either — it passed `setResponseHeader(aGTMversion)`
with a single argument, i.e. a header *name* and no value. Only the externally built
1.4.3pre had the working two-argument form.)

This surfaced while reconstructing which build a tenant was actually running: the
container serves the same URL for every version, the response carried no version
anywhere, and a Client typically runs untouched for months. The header is the only thing
that can answer the question from the outside.

- `x-agtm-version` is set on **every** `/aGTM.js` response, including both 403 paths — a
  blocked visitor is precisely the case where you want to know what blocked them — and on
  both `/aGTMconsent` responses, because a capture of a consent problem often contains only
  that exchange, and the 501 body ("consent_store_enc not supported server-side") is itself
  a statement about what this version can do.
- The served library declares `charset=utf-8` again. Without it a classic `<script src>`
  inherits the *document's* encoding, and the body embeds JSON — page URL, inline CMP code —
  that may be non-ASCII. v1.4.3pre sent it; the refactor dropped it.
- `./build.sh` now rewrites `const aGTMversion` in the template **and** the client source,
  and fails loudly if the line is missing from either. A stale value would make the header
  lie, which is worse than having no header.
- `test/sgtm/version-header.test.js` guards both halves: the header on all three response
  paths, and the constant matching `VERSION` in both files.

### Fixed — the sGTM Client wrote the server-side fingerprint into the user-ID cookie

Reported from the outside, reproduced against the real Client source. `/aGTM.js` wrote
whatever user ID it had resolved into the cookie — including the `F.*` fingerprint, which
is derived from IP + user agent + client hints + ASN/geo and is therefore **not
per-visitor**: two people behind the same NAT running the same browser produce the same
value. Without a cookie that collision stays transient, because the fingerprint carries a
rolling `YYYYMMDD`. Written into a cookie it froze for the full cookie lifetime (365 days
by default), and a second visitor could inherit the first one's identity **and** their
recorded consent decision.

The redesign notes had already named the format side of this and introduced the F→C
promote as the cure — but the promote only healed the consent path, while the GET path
kept producing the problem on every request. Two write sites were affected, not one: the
session path in `/aGTM.js` and the `cookieMode='consent'` branch of the `/aGTMconsent`
POST handler, which still carried the fingerprint whenever no promote had run (no Session
API configured, no explicit consent signal) or the promote had failed.

- **Neither site writes an `F.*` value any more.** The cookie guard is a whitelist: only a
  minted `C.*` may be written. That form is fixed by the api4sgtm contract, so unlike a
  fingerprint blacklist it cannot be widened by a configuration change.
- **The stable `C.*` is created at the moment consent is granted** — via `/promote` when a
  Session API is configured, and **minted locally by the Client when none is**. Both
  producers used to hang off the Session API, so without the local mint a deployment
  running the Client on its own would never have received a user-ID cookie again, and
  Cookie Mode / Cookie Lifetime would have quietly become dead options.
- **A visitor who has not answered the CMP now carries no user-ID cookie**, including
  under Cookie Mode "Always". Deliberate: "always" means *set the cookie regardless of
  consent*, not *freeze a shared fingerprint*.
- **A legacy `F.*` cookie is actively cleared** instead of being refreshed for another
  year — but not blindly. It stays when the Session API did not answer (an outage says
  nothing about this visitor, and deleting there would turn a service disruption into
  irreversible identity loss) and when a promote for it failed *transiently*. A promote
  refused for good (404 "no active session", 409) is not retried forever, because that
  would park the fingerprint in the browser indefinitely.
- Existing `C.*` cookies keep being written and refreshed as before. One related defect was
  fixed on the way: a non-positive Cookie Lifetime made `/aGTM.js` emit `max-age: 0` on a
  normal write, which is the delete instruction — such a configuration now yields a session
  cookie, matching what the consent handler always did.
- **`/aGTM.js` now answers with `Cache-Control: private, no-store`.** Its body inlines the
  visitor's session — uid, sid, and for a returning visitor their recorded consent — while
  the URL is identical for everyone. Removing the cookie writes made the response *more*
  cacheable, because a `Set-Cookie` header is what most shared caches treat as "do not
  store", so the guarantee now has to be stated rather than inherited.
- Cookie Mode / Cookie Delete field help and `sgtmClient/README.md` were corrected: they
  described the pre-fix behaviour and would have sent the next reader looking for a cookie
  that is no longer written.

Why no test caught it: the serve-path harness stubbed `setCookie` as a no-op, so the one
thing the Client writes into a browser was the one thing the suite could not observe. The
harness moved to `test/sgtm/client-harness.js` (shared rather than copied — two copies of
a sandbox contract drift) and now records cookie writes. The new
`test/sgtm/cookie-uid.test.js` pins the behaviour above. Every guard was mutated back out
individually — including the cache header, the outage gate, the retry distinction, the
limiter hardening and the local mint — and the suite catches all of them.

### Added — aGTM Inspector: which consent tool is running (works without aGTM)

The Consent tab gained an **"Erkanntes Consent-Tool"** card. Until now the panel could
only report which CMP adapter was *configured* (`aGTM.c.cmp`) — and for setups served by
the sGTM Client that field is empty by design, because the `consent_check` is injected
inline. The panel was therefore blind about the CMP in exactly the setup where naming it
helps most.

The detection reuses what the library already knows: the first guard of every
`cmp/cc_<name>.js` adapter is a "is this CMP present and usable" probe, so the signature
table in the new `devtools-extension/cmpdetect.js` is derived from our own adapters
rather than from outside knowledge. Notable properties:

- **Independent of aGTM.** It is its own read-only `eval`, not part of `reader.js`'s
  snapshot contract, so the card also renders on a page where aGTM never loaded.
- **Configured vs. detected.** With aGTM present, a mismatch is flagged — a
  `cmp: "cookiebot"` on a page running Usercentrics means the loaded `consent_check`
  probes a tool that isn't there, which is a classic "GTM never loads".
- **Confidence instead of claims.** A live JS API reads as *sicher*, a cookie/storage
  signature only as *wahrscheinlich*. `cc_sourcepoint` (only checks `__tcfapi`, which
  every IAB TCF CMP provides) and `cc_simple_cookie_regex_check` (a template with a
  freely configured cookie name) are deliberately never matched, and the card says so.
- **Data-minimal.** The probe collects existence / `typeof` only, never a cookie or
  storage **value** — it runs before any consent decision.
- **A platform consent API is not a CMP.** `Shopify.customerPrivacy` exists on every
  Shopify shop no matter which banner drives it, so it is ranked and rendered apart
  ("Consent-Schnittstelle der Plattform") instead of competing as a third hit.
- **A newer CMP version may ship the older one's API.** Usercentrics v3 publishes a
  `UC_UI` compatibility layer including `getServicesBaseInfo`, so `UC_UI` alone does not
  prove v2; the more specific `__ucCmp.cmpController` wins. Both points were found on a
  real shop (2026-08-03) where the first version of the card reported Usercentrics v2,
  v3 and Shopify side by side; verified against the live page, not assumed.

`test/devtools/cmpdetect.test.js` covers the matcher, the generated probe (including a
write-recording proxy for the read-only guarantee) and a **drift guard**: every
`cmp/cc_*.js` must be either matched or listed as undetectable with a reason, so a newly
added adapter cannot silently leave the panel blind. Mutation tests confirm the suite
catches a dead branch, an unwired poll, a missing card and a page write.

**What the card refuses to claim** — a detector that overstates is worse than none, so a
review round tightened every place where it could have misled:

- **Only a `strong` hit may contradict `aGTM.c.cmp`**, and only after the contradiction
  survives two consecutive polls. A cookie/storage signature is too generic to call a
  configuration wrong, and during page load a CMP script may simply not have run yet.
- **An adapter that can never be detected is never accused.** `cc_sourcepoint` and
  `cc_simple_cookie_regex_check` are in `UNDETECTABLE` by construction, so a comparison
  against them is impossible, not failed — the card says so instead of warning.
- **A failed probe says "Messung fehlgeschlagen"**, not "no CMP found". Those are
  different answers and only one of them is honest when the page threw at us.
- **Cookie/storage signatures are marked as post-decision.** Those artefacts appear only
  after the visitor answered the banner, so for them "nicht erkannt" does not mean "nicht
  vorhanden" — the opposite of what a JS-API signature implies.
- **A bare vendor global is not the tool.** `window.Cookiebot = {}` (a blocker
  placeholder, an aborted load) no longer reads as "sicher": the signatures now require
  the same discriminators the adapters check.
- `cc_cookie` is Orestbida CookieConsent's default cookie name, not something
  Magento-specific — that match is denied when the library's own API is visible and
  carries a caveat otherwise. `__cmp` (IAB TCF v1.1's standard global) dropped to
  `medium` for the same reason `cc_sourcepoint` is undetectable.
- The card states its **limits** where a reader sees them: only the top frame is probed,
  a page can set the probed names itself, and no cookie or storage **value** is taken out
  of the page (they are read to answer "does this key exist" — the earlier wording said
  they were not read at all, which was not literally true).

The Inspector is off the ES5/`build.sh` path; re-pack `aGTM-Inspector.zip` via
`scripts/pack-devtools-extension.sh`.

### Fixed — CMP: `cmp: "borlabs2"` never loaded GTM, not even with full consent

`cmp/cc_borlabs2.js` set `aGTM.d.consent.hasResponse = true` and then fell off the end
of the function, returning `undefined`. `aGTM.f.run_cc()` treats a falsy return as "no
consent available": it discarded the whole result, logged `m8`, and on `'update'`
restored its pre-check snapshot. So with `cmp: "borlabs2"` the GTM gate never opened —
regardless of what the visitor consented to — and the 500 ms init poll ran for the
lifetime of the page. Fail closed, so nothing leaked; the adapter was simply dead.

The comment above the line already said "Set response, run callback and return", and
`cc_borlabs3.js` (added later, same author) has both the `m2` log and the `return true`.
Both are now present in v2 as well. Found by the review round on the ppcm adapter, which
compared the new code against its neighbours. `test/cmp/borlabs2.test.js` covers the
return value, the log entry and the opened GTM gate; removing either line again turns
three tests red.

> Borlabs v2 users: this changes behaviour from "GTM never loads" to "GTM loads once
> consent matches your `gtmPurposes`/`gtmServices` requirement". For sGTM Client setups
> it takes effect with the next client re-import.

### Added — CMP: PP Consent Manager (PixelPoint), `cmp: "ppcm"`

New consent check `cmp/cc_ppcm.js` for the PixelPoint Consent Manager
(`window.PPConsentManager`), written against its `filesVersion` 1.5.4. Granted
categories go into `aGTM.d.consent.purposes` (`ppcm-consent-category-<name>` cookies),
granted services into `.services` (`ppcm-consent-service-<name>`), so an integrator
gates on `gtmPurposes`.

The obvious implementation — "cookie exists, therefore consent" — is not correct for
this CMP. The cookie value is `<consentVersion>,<epoch-seconds>`, and the CMP's reader
honours a cookie only while its version field matches the site's current
`consentVersion`; it also treats a second field of `0` as not granted (a defensive
branch we mirror rather than a value the CMP is known to write). Bumping
`consentVersion` therefore voids every stored decision and re-opens the banner, while
a presence-only check would still report consent and load GTM against the CMP's own
verdict.

So the per-item verdict is delegated to the CMP's public
`hasConsentCategory()` / `hasConsentService()` (including its fallback that treats a
version-stale service as granted while `media` is granted). The cookies are used only
to *discover* which category/service names exist, because the CMP exposes no list.
That trades a rule that could drift and fail open for a dependency on the API's shape,
which fails closed — but silently, so the check logs its cookie scan once per page
(`m_ppcm_scan`: the prefix searched, how many cookies matched). No category *name* is
hardcoded, since the always-on category comes from the site's banner template and
appears as both `essential` and `essentials`.

Two consequences an integrator has to know about — both documented in
`cmp/README-cmp.md`: a **revoke deletes the cookies**, which by itself is
indistinguishable from "never answered", so within a page load the check remembers
that a decision was seen and reports a withdrawal as "decided, nothing granted"
instead of letting `run_cc()` restore the withdrawn consent; and **consent changes
after the first decision need a trigger** (`aGTM.f.run_cc('update')` from the CMP's
change hook, or a poll), because the built-in 2000 ms CMP poll only runs when
`consent_store_url` is set.

Names discovered from cookies are bounded to a plain slug charset and a maximum
number of entries: any script that can write a cookie on the domain could otherwise
put arbitrary text into `aGTM.d.consent`, the dataLayer and the consent store. The
charset excludes commas, which is what keeps the comma-wrapped consent string intact
(F-51) — hence no separate comma strip in this adapter. Output is sorted and
deduplicated so the same consent state always hashes the same (a reordered cookie jar
would otherwise look like a state change and emit a phantom update event plus POST).

In production since 2026-07-30 (operator report: deployed and working), which is the
one thing unit tests cannot establish — that the fixture assumptions hold against the
real CMP for a returning visitor with a stored decision.

`test/cmp/ppcm.test.js` covers 33 cases against a faithful port of the CMP's own
reader, plus two integration tests through the real `aGTM.f.run_cc()` that assert the
GTM gate opens on consent and closes again on revoke. Reviewed by two independent
agents (QA + adversarial) before release; their findings are in this entry.
Mutation-checked: 13 of 15 mutations turn the suite red, including presence-only
verdict, fail-open on a missing CMP object, hardcoded category name, removed revoke
memory, removed sort/dedupe, a loosened name charset, and a deleted Inspector log-map
entry. The two survivors are redundant defences (an inner `String()` guard covered by
the surrounding `try/catch`), not untested behaviour.

### Fixed — sGTM Client: the bot check let every bot through (F-127)

The response handler only parsed the body when the status was `2xx`:

```js
if (r.statusCode >= 200 && r.statusCode < 300 && r.body) { … if (o.isBot) bot = true; }
```

The filter service couples the HTTP status to the verdict — **403 when `isBot`, 200
otherwise**. So the one response that reports a bot is exactly the one the gate skipped:
the body was never read, `bot` stayed at its initial `false`, and the visitor was served
normally. Every detected bot passed.

The gate arrived with the v1.5 single-session refactor (`9d302d7`) and does not exist in
v1.4.2/v1.4.3pre, which parse the body whenever it is a non-empty string — those versions
block correctly. This is a v1.5-only regression, and since v1.5 is unreleased it has only
ever run in the setups already using the current client.

The gate is gone. `sendHttpGet` resolves for any completed response, so the verdict is now
read from the body regardless of status. `test/sgtm/botcheck.test.js` fails if it comes
back.

> **Live effect:** the bot check starts blocking again where it silently did nothing. Setups
> that grew used to the broken behaviour will see traffic drop by whatever the filter
> rejects. This lands with the next client re-import, not before.

### Added — sGTM Client: `Bot Check Mode` and an opt-out for publishing the verdict

Two new template fields, both only shown when the bot check is enabled.

**`Bot Check Mode`** (`block` by default, or `mark`). `mark` reports the verdict without
blocking anything. It exists because of an asymmetry the fix above creates: a blocked
visitor is *invisible*. No library, no `aGTM.d.bot`, no way to tell a correctly blocked bot
from a false positive — and a `/aGTM.js` answered with 403 also makes any page code that
calls `aGTM.f.fire(...)` unconditionally throw. Turning blocking back on for a site that
has been running without it is therefore worth measuring first: run `mark`, count
`aGTM.d.bot.isBot === true` in webGTM, then switch to `block`.

Only the literal `mark` disables blocking; anything else — unset field, macro garbage —
falls back to `block`, so a misconfiguration cannot silently switch the filter off.

**`Pass the verdict to the browser`** (on unless unchecked). `aGTM.d` is readable by every
script on the page and is written *before* any consent decision, so "filter server-side,
but don't publish the classification" has to be expressible. It defaults to on not for
backwards compatibility — nothing published this before, the whole passthrough is new in
this release — but because the verdict is the only thing that can be measured: under
`mark` a switched-off passthrough makes the check a paid no-op, which the Client now warns
about.

### Changed — hardening from the review round on the two entries above

- **A 5xx whose body happens to parse is no longer reported as a clean visitor.** `isBot`
  is only accepted as a real boolean; `{"error":"upstream down"}` now yields no verdict at
  all instead of `{isBot:false}`.
- **A filter outage is distinguishable from a clean result.** On a transport error the
  Client sets `band: 'unknown'`. Without it, a webGTM traffic-type variable would silently
  answer `'regular'` for 100% of traffic for as long as the outage lasted.
- **Forwarded strings are length-capped at 64 characters.** A whitelist of *keys* does not
  stop an existing key whose value the service later widens — a `primarySignal` refined
  from `asn_spam` to `asn_spam:AS55967/Baidu/76ip` would have carried exactly the detail
  that is stripped elsewhere.
- **The Session API counters are on the Sources API blacklist.** `fireSources()` runs after
  the counters are set and writes every non-meta field into the same object, so a Sources
  response carrying its own `created` would have overwritten the session record's value.
- **The signals loop no longer uses `for…of`.** The array duck-check accepts any object
  with a numeric `length` (the sandbox has no `Array.isArray`), which `for…of` rejects with
  a `TypeError` — and with no `try/catch` in the server sandbox that would have aborted the
  entire `/aGTM.js` response for every visitor.
- The verdict is held in a `const` container mutated by property rather than a rebound
  top-level `let`, matching the pattern already proven in this file.
- The Inspector's compliance report (Markdown and JSON) now carries the verdict — "flagged
  but passed" belongs in a written hand-off, not only in a live panel. It leads with a
  provenance line: the verdict describes **the machine that generated the report**, not the
  site's traffic. Without that, a consultant on a VPN turns an `asn_spam` line into what
  reads like a finding about the customer.

### Fixed — the two production log lines never reached production

Both new `warn` calls exist for one reason: an operator has to see them in a live
container. The vocabulary-drift alarm, and the line that records every bot seen
while the check runs in `mark` mode — which is the only complete record of that
phase, since the browser side depends on a consent-gated tag.

The template declared the `logging` permission with `environments: "debug"`, so
the sandbox turns every `logToConsole` in the serve path into a silent no-op
outside preview. The intent was in the code comment, the effect was in the
manifest, and nobody held the two against each other — until the promise had
already been written into the customer-facing field help. The same widening had
been done once before, for the DL-Repeat tag, for the same reason.

Scoped to `all` now, and a test parses the permissions block and asserts it, so
the promise is tied to a check rather than to a comment.

The rest of the fourth review round:

- **A vocabulary drift was loud on the server and green in the browser.** When
  `unknown` left the band whitelist it started arriving as `other`, and
  `botSummary` had no branch for that — so a service-sent `unknown`, which used
  to warn, quietly began to pass. There is a `drift` state now, for `band`,
  `primarySignal` and the per-signal values, and the health check reports it.
- **`reason` was validated through the prototype chain.** `reason: "toString"`
  came back truthy and put a multi-line native-code dump into the exported
  Markdown report. Explicit comparisons now — the neighbouring line already did
  it that way for `mode`, which is what made this a defect rather than a taste.
- **The drift warning names the values.** A count alone cannot be acted on
  without reproducing the request. The values come from the tenant's own filter
  service, not from the visitor, and the log is server-side — the whitelist
  exists to keep them out of the browser, which it still does. Capped at three.
- **A score just above 100 no longer vanishes.** Flooring before bounding keeps
  `100.4` as `100`; only a genuine `101` is rejected as a contract violation.
- The fourth way to end up without a verdict — check enabled, no URL configured
  — was entirely silent and now logs.
- **The sandbox linter was attacked, not just run.** Five bypasses got through
  it: `Array['isArray']`, the same with double quotes, `const pI = parseInt`, a
  variable key on the `in` operator, and `require("…")` with double quotes. All
  five are caught now. What a regex cannot see in principle — an arbitrary alias
  — is stated in the file rather than implied to be covered.
- **One rule was deliberately not added.** "No multi-line boolean chains" is in
  the project notes, but the attempt immediately flagged `hasRequiredConsent` —
  a three-line `||` chain that has been importing and running in a live
  container for months. That refutes the blanket rule, not the code; rewriting
  proven code to satisfy an unproven rule would be the wrong way round. The
  counterexample is documented where the rule would have gone.
- `test/run_cc.test.js` also leaked a consent_check stub — harmless today, same
  class as the leak that made a fresh clone red, closed anyway.

### Fixed — a third review round: the test gate itself was wrong

**`bun test` was order-dependent, and a fresh clone was red.** The new
`reader-snapshot` test replaced the global `aGTM` that `test/setup.js` installs
and never put it back, so every CMP suite that ran afterwards died on
`aGTM.f.objinit is not a function`. In a working tree with extra untracked files
the order happened to be benign; a clean checkout — CI, or a second machine —
failed 9 tests. Every "N tests green" claim from the two previous rounds was
therefore evidence only about one directory. The test restores what it borrows
now, and the fresh-clone run is part of the check.

The rest of this round:

- **`mark` could not be measured, and the instructions said it could.** A webGTM
  variable is only read when a tag fires, tags need GTM, and GTM needs consent —
  so every marked visitor who never answers the CMP contributes nothing to a
  browser-side count. The Client now writes a non-debug `warn` line for each bot
  it sees under `mark`, which is the only complete record; the browser count is
  a false-positive detector for humans, not a rate. The field help says so.
- **A vocabulary drift was silent.** Values outside the whitelist collapse to
  `other`, and nothing distinguished that from a legitimate value — so a new
  category at the service would have made the webGTM variable answer `regular`
  while every surface stayed green. The collapse is now counted per response and
  logged once. `other` is documented as a value integrators must branch on.
- **How well each table is backed is now written down.** `BOT_CATEGORIES` comes
  verbatim from the service spec; `suspicious` is inferred; four of the six
  `BOT_TYPES` were back-translated from a prose sentence and may not match the
  real identifiers. Claiming all of it was "the contract's vocabulary" was wrong.
- **A score above 100 is dropped, not clamped.** Clamping handed the most
  incriminating legal value to a broken response, and a rule like
  `score >= 80 → spam` would have acted on it.
- **`unknown` says which kind.** `reason` separates `no_answer`, `bad_answer` and
  `no_client_ip` — a filter outage and an unresolvable IP header call for
  different responses. `unknown` also left the band whitelist, so a service-sent
  value cannot masquerade as the Client's own outage marker.
- **The health check no longer lets `mark` hide an outage.** Checking the mode
  first made the outage and the `bot` verdict unreachable for exactly the setups
  that have the mode switched on. `mark` also dropped from `warn` to `na`: it
  runs for weeks by design, and weeks of WARN on every exported report wears the
  overall status out until someone skims past a real pre-consent leak.
- **The sandbox's language rules are linted.** `serve-paths.test.js` runs the
  real source, but in Node — which happily executes `try/catch`, `parseInt`,
  `Array.isArray` and `'k' in obj`, all of which the GTM server sandbox rejects.
  A review mutated each of them in and the suite stayed green. `sandbox-lint.test.js`
  closes that, and the `require()` names are checked against the known API list.
- `botState` moved back in front of `buildAndSend` (the previous fix had inverted
  that pair while repairing the other direction), the comment claiming the parser
  rejects *all* forward references was narrowed to the case that is actually
  proven, the three visibility fixes from the last round got the tests they were
  missing, and the compliance report's provenance note reached the JSON export.

### Fixed — a second review round on the entries above

- **`/aGTM.js` died on every synchronous serve path.** `buildAndSend` sat at the end of the
  file while each synchronous path reached it first — a forward reference to a `const`
  function expression, i.e. a temporal-dead-zone error, i.e. no response at all. It hit the
  default configuration of a freshly created tag (no Session API) and any visitor whose
  session uid could not be resolved (fingerprinting off, no cookie). Only the async path
  masked it, which is why it survived since the v1.5 session refactor. The function is now
  declared before its callers, and `test/sgtm/serve-paths.test.js` runs the real Client
  source against stubbed server APIs to keep every path honest — a test genre this repo
  did not have.
- **`mark` blocked after all when the client IP was missing.** That branch sent 403 without
  consulting the mode, making the field's own help text untrue for exactly the visitors
  whose IP header fails to resolve — an infrastructure problem turned into a hard outage,
  during the rollout step that is supposed to be safe.
- **The value whitelist is a whitelist of values, not only of keys.** The first attempt
  capped strings at 64 characters, which does not defend the case its own comment cited:
  `asn_spam:AS55967/Baidu/76ip` is 27 characters. `band`, `primarySignal`, `type` and
  `category` are now matched against the contract's vocabulary and collapse to `other`
  otherwise; `score` is clamped to 0–100 and floored. The lookup compares `=== 1` rather
  than testing truthiness, so `toString` and `constructor` cannot inherit past it.
- **The signals loop bounds the work, not just the output.** `{"length": 50000000}` passes
  the array duck-check and never grows the result, so the output cap alone would spin fifty
  million times — ~40 bytes of response body stalling `/aGTM.js`, and with it the GTM load,
  for every visitor.
- **A 5xx with a parseable body is an outage, not a clean visitor.** Only the transport-error
  path set `band: 'unknown'` before; the more common failure — the service answers, but with
  an error object — fell through to "no verdict", indistinguishable from "check disabled".
- **The Inspector stopped calling the `mark` mode a malfunction.** `isBot: true` under `mark`
  is the configured state; reporting it as a contradiction put a fault claim about a
  correctly configured system into the customer report. `band: 'unknown'` no longer renders
  as a green "unauffällig" either, and the mode surfaces as a chip and a health check, so a
  filter left in `mark` after a measurement does not stay invisible.
- The Session API counters are on the Sources API blacklist, so a Sources response carrying
  its own `created` can no longer overwrite the session record.

### Added — sGTM Client: bot-check verdict reaches the browser as `aGTM.d.bot`

The check used to read a single field, `isBot`, and discard the rest. The service also
reports `score`, `band`, `signals[]` and `primarySignal` for the ambiguous range that
never blocks by itself — deciding what to do with those is the tenant's job, and until
now the browser never saw them.

A non-blocked visitor now receives the verdict as `cfg.bot` → **`aGTM.d.bot`**, readable
in webGTM through a plain JS Variable:

```javascript
function() {
  var b = (window.aGTM && aGTM.d && aGTM.d.bot) || {};
  // Handle the non-verdict cases first: 'unknown' is a filter outage and
  // 'other' means the service vocabulary moved. Falling through to 'regular'
  // makes both look like a healthy day.
  if (b.band === 'unknown' || b.band === 'other') return b.band;
  if (b.band === 'bot') return 'bot';
  if (b.primarySignal === 'asn_spam') return 'spam';
  return 'regular';
}
```

It is its own top-level key rather than a field of `session`: the check runs before and
independently of the Session API, so a session outage must not drop it, and it must not
open the library's session preset gate.

The forwarded shape is a **whitelist**, the opposite of the Sources API capture, which
blacklists known keys and passes the rest. This payload is readable by every script on the
page, so a field the service adds later must be opted in by a code change instead of
leaking on the next API deploy. Forwarded are `isBot`, `score`, `band`, `primarySignal`
and `signals[]` reduced to `{type, category, score, confirmed}`, capped at 10 entries.

**`signals[].detail` stays server-side.** For the ASN-reputation signal it carries
tenant-wide aggregates about *other* visitors' traffic — ASN number and org, unique-IP
and request counts, window counts. That is not something every script on the page should
be able to read.

### Added — sGTM Client: Session API counters reach the browser

`aGTM.d.session` carried `uid`/`sid`/`ret`/`sst`/`vct`/`ga4sid`/`muidga4` and dropped the
rest of the record. `created`, `lastInteraction`, `pvCount`, `eventCount` and
`sessionCount` now come through under their API names, so webGTM can read them without
depending on a page-local `se_data` object.

`counter` is not repeated — it already ships as `vct`, its aGTM name since v1.0.
`customerId`/`user` are dropped as redundant (the tenant is configured, `user` is `uid`).

Note the field that has been quietly misleading: **`vct` counts requests within the current
session, not visits.** The visit count is `sessionCount` (observed live: `vct` 49 vs.
`sessionCount` 56 on the same session). `ret`/`vct` keep their meaning regardless, because `ret` gates the
server-side consent auto-denial and redefining it would move a live consent gate.

`README-for-Integrators.md` documented a session field named `counter`, which the client
has never emitted; the table now lists the fields that actually arrive.

### Changed — aGTM Inspector: the Simulation tab does not offer a `declare` push

The Google Consent Mode box briefly offered a third verb next to `update` and `default`.
It never shipped in a release, and it is gone again: a `declare` pushed from the page
does nothing, while the box reported a success.

The verb was checked against Google's shipped code rather than its documentation. The
consent-command dispatcher is byte-identical in `gtm.js` (of a real container) and
`gtag.js`:

```js
d==="default" ? So(e) : d==="update" ? Uo(e,c) : d==="declare" && b.fromContainerExecution && Ro(e)
```

`default` and `update` run unconditionally; `declare` runs only when the message carries
`fromContainerExecution` — the flag the container stamps on its own enqueued messages,
and which the same line uses one clause earlier as precisely the page-vs-container
discriminator. An ordinary page push carries no flag, so its `declare` is dropped
without a trace. The flag is not strictly unforgeable, but faking it would also switch on
Google's container-execution model handling and silence its page-push diagnostics — a
tool built to *observe* the page must not lie to the tag about where a message came from.
In practice the verb belongs to Google's own and whitelisted CMP/vendor templates, which
reach it through the internal API `internal.declareConsentState` that custom templates
cannot `require()`.

A button that cannot take effect while reporting success is the failure mode this tab
exists to avoid. The mode row now explains the verb's absence, otherwise the next reader
takes it for an oversight and adds the dead button back.

**Nothing changes on the read side.** `declare` is still captured by the reader from
`google_tag_data.ics`; the **Consent** tab keeps its `declare` column and its `declare`
step row, and the verb still sits last in the precedence
`update > default > implicit > declare` — a CMP template that sets one is worth seeing.

### Changed — GTM template "Consent Mode": two dead requires removed, permissions narrowed (1.4 → 1.5)

The systemic least-privilege sweep further down this release checked for unused
identifiers, but not for ones whose only use is commented out — so two survived it:

- `require('createQueue')('dataLayer')`, called only in a commented-out line that
  `callInWindow('aGTM.f.fire', …)` had replaced;
- `require('makeTableMap')`, never used at all.

The first was not merely dead code. `createQueue` demands `access_globals` **readwrite**
on its path, so the tag held read and write on the global `dataLayer` for a call it never
made. That entry is gone from `access_globals`; the eight that remain each have an active
user. `write_data_layer` stays — that is the permission `gtagSet` requires for
`url_passthrough` / `ads_data_redaction`, and its `keyPatterns` cover exactly those two.

No behaviour change: the consent signals still go out through the `setDefaultConsentState`
/ `updateConsentState` template APIs. Re-import the template to pick up the narrower
permission set; GTM will show the difference as a permission diff.

### Fixed — aGTM Inspector: cookie reset missed Consentmanager

The Simulation tab's cookie reset matches cookie names by substring, and the shipped
pattern list carried `cmpsettings` — which does not match Consentmanager's actual names
(`__cmpconsent<id>`, `__cmpccu<id>`). On a Consentmanager site the reset therefore cleared
nothing while still reporting success, so a first-visit re-test silently kept the old
consent.

The list now leads with the `__cmp` prefix (covering the whole family) plus entries for
Complianz, CookieYes, Didomi, Osano, Termly, Orestbida, Matomo, Shopify and `_tpf` —
aGTM's own user-id cookie, which the `aGTM`/`agtm` fragments do not match either. A stored
pattern list that is byte-identical to a previous default is lifted to the current one, so
users who never edited the field get the fix. A run that matches nothing now says so
instead of reporting plain success.

Cookie patterns now support `*` as a wildcard, so a pattern can be anchored — `__cmp*`
(starts with), `*consent` (ends with), `*` (everything). A plain fragment keeps matching
as a substring, and regex metacharacters in a pattern stay literal. The effect panel
names the removed cookies instead of only counting them, and a "restore the default
list" link appears whenever the field differs from the shipped patterns — an edited
field is never migrated automatically, so this is the way back.

**The reset now also runs inside the CMP's own frame.** A CMP such as Consentmanager
keeps a second copy of the consent state in its own iframe origin — cookies on
`.consentmanager.net` plus that origin's `localStorage` — which the page cannot touch
under the same-origin policy, and which restores consent on the next load, making a
first-visit test impossible.

A first attempt to reach it through `inspectedWindow.eval({frameURL})` was built and
removed again, because it passed **origins**: that option resolves a frame by an exact
match against the frame's committed **document URL**, so an origin resolves to nothing
(`there is no frame with URL …`), and the candidates were drawn from every loaded
resource — mostly hosts that are no frames at all, one console error each.

Both halves are fixed now. Candidates come from `getResources()` filtered to the
**document-typed** entries, which are precisely the frame documents (main frame plus
every sub-frame, cross-origin ones included), so `frameURL` gets a URL it can resolve.
The same patterns are then cleared in each foreign frame first — never with the reload,
which is the top frame's job — and the effect line reports that pass **per host**: what
was removed, or which frame refused and why. Nothing in this needs a Chrome permission:
DevTools gates frame evaluation on schemes, `chrome://`, Web-Store and enterprise-policy
hosts, not on the extension's `host_permissions`, so the extension still declares none.
The pass is a best-effort extra behind a 1.2 s watchdog — it can delay the top-frame
reset by at most that, never prevent it — and can be switched off. Because it writes into
third-party origins it obeys the same write-mode gate as every other action, and it is
skipped entirely when the pattern field is empty: "delete every cookie" is a reasonable
thing to ask for on your own domain and an unreasonable one to do to an embedded payment,
SSO or chat widget. The effect line reports the pass per host — what went, which frame
refused and why, which had not answered inside the time limit — independently of how the
top-frame call ended, and points at an **incognito window** whenever the CMP's copy may
have survived.

A review pass then found the reset was still missing state it should have cleared. Its
pattern list did not cover **`_TPU`**, the sGTM Client's own user-id cookie — so on a
Client-served site the cookie survived, the next `/aGTM.js` resolved the user, the stored
consent came back as `cfg.session.consent` and GTM injected with no banner: a "first
visit" that never was one. Nor did it cover the `localStorage` keys four bundled adapters
actually read (`consent` for Matomo and JTL, `consentPermission` for Tramino,
`perspective.tracking-preferences.<id>`), so on those CMPs the banner stayed away and the
blame fell on the CMP's own origin. Both are in the shipped list now, which is checked by
tests on both sides: every name aGTM's own adapters read must match, and session/login
cookies (`PHPSESSID`, `auth_token`, `csrftoken`, …) must not.

The expiry grid now also covers **every path prefix**, not just `/` and the current path —
a cookie scoped to `/de/` was unreachable from `/de/produkt/42`. And the message about
what survived was wrong in principle: it blamed `HttpOnly`, which cannot be the cause,
because an `HttpOnly` cookie never appears in `document.cookie` and so never enters the
list in the first place. A survivor is scoped to a domain or path the grid missed, and
that is what it now says.

Two follow-ups from the first live run, where the CMP frame's `localStorage` was cleared
but its two cookies stayed: a CMP's own cookies are **cross-site** cookies
(`SameSite=None; Secure`), and inside its third-party frame Chrome rejects a
`document.cookie` write that would default to `SameSite=Lax` — so the expiry never
landed. Every expiry is now written twice, bare and with `SameSite=None; Secure`
(neither attribute is part of a cookie's identity, so the extra write is harmless
elsewhere and simply rejected over http). And the reset no longer *claims* a deletion:
it re-reads the jar afterwards and reports only what is verifiably gone, naming what
stayed behind — typically `HttpOnly`, which JavaScript cannot remove at all.

The result of a reset also survives the reload it triggers. It used to be shown ~80 ms
before the page reloaded, so the most useful feedback — which cookies actually went —
was gone before it could be read.

The effect panel is now pinned while scrolling. It sits at the top of the Simulation
tab while the buttons reach far below it, so an action's result was reported off-screen
— which reads exactly like nothing having happened.

Buttons that are disabled because write-mode is off now explain themselves on hover. A disabled button swallows the click silently, so "I clicked and nothing happened" was the only feedback — and since write-mode resets to off on every panel open, that is the normal state right after reloading the extension.

### Added — aGTM Inspector: exception details in the network list

An `exception` hit now shows its **type and message directly in the list row**. The event
name alone (`exception`) says nothing; the payload is the whole point. The values are read
from whichever carrier the hit uses — GA4 query string (`ep.type`/`ep.text`), GA4 POST body,
or a decoded aEvents payload — URL-decoded, truncated for the row, with the full message on
hover. Rows that are not exceptions are unchanged.

### Changed — aGTM Inspector: query-string values are URL-decoded

The expanded **Query-String** section of a network row showed the raw HAR values, so a
GA4 hit read `Uncaught%20ReferenceError%3A%20Fancybox%20is%20not%20defined` and a vendor
ID list read `%2C50%2C39%2C511`. The chip preview on the row above already decoded (it
goes through `URL.searchParams`), so the two views of the same request disagreed.

Values are now decoded for display, one level deep and defensively: each value is decoded
on its own, and one that is not valid percent-encoding — `100%`, `%ZZ` — keeps its raw
form instead of throwing and taking the row with it. `+` is left alone (that is
form-encoding, and in a GA4 query string a literal plus is more likely to be data than a
space). The section header reports how many values were decoded, and how many were
**double-encoded** — that case is surfaced rather than unwrapped further, because it is
normally a real tagging bug worth seeing.

### Fixed — aGTM Inspector: pre-consent leak false positives

The Netzwerk tab flagged `gtm.js`/`gtag.js` as pre-consent leaks on pages where consent
was already in place — reported from a live site, and wrong: aGTM injects GTM only after
`gtmConsent` is true, so a container load it performed cannot predate the decision.

Two things combined. The `preConsent` stamp is taken when a request is captured, against
the last polled snapshot (700 ms), so everything in the window between the real decision
and the next poll gets stamped. That is unavoidable — the reconcile is what corrects it.
But the reconcile compared each request against `consentTs`, which the reader computes as
the **last** consent event, and the library's 2 s CMP poll keeps pushing that forward. A
request that fired 200 ms after the decision was therefore measured against a timestamp
minutes later, the reconcile could never fire, and the stamp stuck for good.

The reconcile now anchors on the **consent moment** — the same value the Consent-Timeline
uses (`aGTM.l` consent milestone → first consent event → GTM injection). The Consent-
Timeline was moved off `consentTs` for exactly this reason in an earlier round; the leak
path was missed then. The comparison also uses each request's **start** time (finish time
minus its duration), so a slow request that left before the decision is no longer cleared
by finishing after it. With no usable anchor the stamp stands, so the check never goes
quietly green.

This also corrects the Health-Score and the Compliance-Report, which both derive from the
same leak list and could show a false red for a customer.

A fresh stamp for which no consent anchor is known yet is treated as **undecided** for two
poll intervals rather than as a leak. The stamp is taken when a request is captured, but
the anchor only appears in a later snapshot, so without that grace period the banner
flashed red on every page load before the reconcile caught up. A leak on a page where
consent never arrives is still reported once the window passes — only the flash is gone,
never a finding.

### Added — aGTM Inspector: Consent Mode push covers `default`

The Simulation tab's **Google Consent Mode push** box could only send
`gtag('consent','update',…)`. It now offers `update` and `default`, plus the two fields
that exist only on `default`: `wait_for_update` (ms) and
`region` (comma-separated).

The point of the addition is the **timing guard**: `default` is only read
while the Google tag has not yet evaluated consent, so pushing it afterwards changes
nothing. The box now detects that state (via `google_tag_data.ics`, or `aGTM.d.init` on
an aGTM page) and **refuses the push with a reason** instead of reporting a success that
did not happen. On a typical aGTM page the window is genuinely open until consent is
given — which is what makes a `default` push useful in the first place. A "trotzdem
pushen" checkbox overrides the guard for deliberate experiments and the effect panel
then marks the push as ineffective; `update` is never guarded.

An **Ist-Zustand** line above the checkboxes now shows the effective per-category state
*and its origin* (`update` > `default` > `implicit` > `declare`), refreshed with the
poll, so a push has a visible before/after. This also covers the **implicit** state,
which cannot be pushed at all: it is what Google assumes when no `default` ever arrived,
so the Inspector reports it rather than pretending there is a button for it. The
precedence rule moved into `consentsignals.js` and is now shared with the Consent tab's
flow table, so the two views can no longer disagree about the effective state.

Hardened after a three-reviewer round:

- The status line and the in-page guard now read the **same** signals. Previously the
  line judged the window open/closed by the ics *entries* alone, so on every consent
  grant — and on any page without aGTM — it advertised an open window while the guard
  refused the push.
- `reader.js` reads the Consent Mode state **before** the aGTM gate, so the GCM box
  works on pages without aGTM, which is exactly what it advertises. Still read-only,
  still no permissions.
- The guard also checks `window.google_tag_manager`: `aGTM.d.init` misses the paths
  that load GTM without it (`noConsent` containers, the Simulation tab's own container
  override). The refusal message now names the signal that actually fired.
- A refused push no longer touches the page at all (it used to create `window.dataLayer`
  as a side effect of being rejected).
- An unparsable `wait_for_update` is flagged at the field instead of being dropped
  silently while the push still reports OK.

### Added — aGTM Inspector: Simulation tab (opt-in write channel)

A new **Simulation tab** turns the otherwise read-only Inspector into a flow driver
— for testing an integration without clicking a real cookie banner. It can:

- **Simulate a consent decision** with granular control: toggle exactly which
  **purposes / services / vendors** are granted, each with an **ID field** and a
  per-group **"IDs" toggle** to express consent by ID instead of name (pre-filled
  from `gtmPurposes`/`gtmServices`/`gtmVendors` so you see what GTM actually
  requires), **persisted per host** and saveable as **named presets**. Grant
  installs a temporary `aGTM.f.consent_check` and calls `aGTM.f.run_cc('update')`,
  so the genuine reset → check → `chelp` → `gtmConsent` → `inject` → replay path runs.
- **Deny / reset**, **mock the CMP** (persistent `consent_check` stub, restorable
  via a backup under `aGTM.f.__inspOrigCC`), **fire an event** (`aGTM.f.fire` with
  editable JSON + `_noConsent`/`_noDLPush`/`_post` flags + recent-event history),
  and **force GTM injection**. A live effect panel shows the resulting
  `gtmConsent` / injection / dataLayer state.
- **Integration management** for demo/prospect work: **block** an existing aGTM
  integration (neutralise its loaders + `consent_check`, reversibly) — a **persisted
  per-host checkbox** that, while write-mode is on, re-applies once after a page reload
  (`reader.js` exposes the block state read-only) — and **inject** a pasted aGTM
  integration snippet (also persisted per host) into a page that has no aGTM yet (runs
  at global scope via a `<script>` element; the box renders even when `window.aGTM` is
  absent).

### Added — aGTM Inspector: Simulation tab extra features

Four further tools on the Simulation tab (same opt-in Write-Modus gate, persisted per
host, ES5-safe injected builders, unit-tested):

- **Google Consent Mode push** — a `gtag('consent',<verb>,{…})` straight into the
  dataLayer (initially `update` only; `default` was added later — see the entry above)
  (a genuine `arguments` object, as `gtag()` pushes) to test GCM signals
  **independently of aGTM**; one checkbox per canonical signal.
- **Cookie reset + reload** — expire cookies whose name matches a pattern (across the
  path × parent-domain grid), optionally clear matching `localStorage`, then optionally
  reload — the true first-visit re-test. Empty pattern field = match every cookie (and,
  with "clear localStorage", the entire localStorage).
- **Scenario runner** — one click runs **deny → fire (queue) → grant (inject + replay)**
  and reports the fired/queued counts. The replay needs GTM not yet injected (aGTM's
  inject-once guard); an already-injected page is flagged, not silently orphaned.
  Mirrors the v1.6 roadmap's scenario runner.
- **Consent-store POST test** — blanks `aGTM.d.consent_hash` and calls
  `run_cc('update')` so the genuine `aGTM.f.xsend()` POST to `consent_store_url`
  (`/aGTMconsent`) fires; disabled with a hint when no `consent_store_url` is set.

See `devtools-extension/README.md` → *Simulation & the write channel → Extra features*.

### Fixed — aGTM Inspector: Simulation tab (three-critic QA sweep)

A full adversarial review (correctness · security/ES5 · tests/docs) of the whole
Simulation tab. No P0/P1; the substantive fixes:

- **"Force GTM injection" now genuinely forces.** `aGTM.f.inject()` is consent-gated
  (no-op unless `hasResponse`, loads only on `gtmConsent`), so the button was a silent
  no-op that still reported "OK". It now calls `aGTM.f.initGTM(false)` directly (loads
  every container regardless of consent) and marks `aGTM.d.init` — falling back to
  `inject()` only on a pre-`initGTM` library, and surfacing the consent-gate rejection
  instead of a false OK.
- **Block ↔ consent-mock backup no longer collide.** A Block → Grant → Unblock → Restore
  sequence used to strand a permanent deny-noop in `consent_check`; the grant stub now
  backs up the real check from the block backup when a block is active.
- **Scenario "queued" count is a delta**, no longer inflated by a pre-existing
  pre-consent backlog in `aGTM.d.f`.
- Test/docs hardening: the consent-store test now guards the load-bearing hash-blank,
  the cookie-grid test verifies the actual host-only/dotted-parent domain writes, the
  panel smoke test asserts all four extra boxes render, and the destructive
  empty-pattern + clear-localStorage combination is documented.

### Changed — aGTM Inspector: Simulation tab reorganised + GTM container override

Clarity pass after the tab grew to a dozen stacked boxes:

- **Four labelled section groups** — Consent · Events · GTM & Integration · Umgebung —
  under a pinned write-toggle + live-effect panel, instead of one flat stack.
- **"CMP mock" box folded into Consent.** Grant already installs a persistent
  `consent_check` stub (= mocks the CMP), so the separate box was redundant; **Restore**
  (undo the stub without wiping consent) now sits next to Deny/Reset. `buildCmpMockCode`
  removed.
- **New: load a different GTM container** (`buildLoadContainerCode`). Injects one or more
  container IDs directly via `aGTM.f.gtm_load`, independent of consent and of the
  integration config — point a live page at a staging/demo container without editing the
  real config (pairs with "block existing integration"). Does not touch *other* configured
  containers' load state.

### Changed — aGTM Inspector: GTM tab folded into Diagnose

The standalone **GTM tab** was removed; its injection status, container table and
injected-`<script>`-tag proof now render as a **card block at the bottom of the
Diagnose tab** (`gtmCardsHtml()`). A dedicated tab wasn't worth it.

**Posture:** this is the one write-enabled tab. It uses the **same**
`inspectedWindow.eval` bridge as the read-only reader (so **no new manifest
permission**), but writes only through a separate `sim.js` channel — and only
after a per-session **Write-Modus** toggle is switched on (**default off**, never
persisted). `reader.js` stays a pure reader. The mutating code builders are ES5-safe
and unit-tested (`test/devtools/sim.test.js`). See
`devtools-extension/README.md` → *Simulation & the write channel*.

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
  Bars are **colour-coded per milestone** (mostly panel-palette vars, plus two
  dedicated mid-tone hues for inject/firstTag that read on both themes); a first
  tag fire landing **before** the CMP-decision marker is painted **red** with a
  "⚠ vor Consent" flag — a pre-consent leak surfaced right on the timeline. Below
  the waterfall a **"Wartet aktuell auf"** block (pulsing indicator, honoured by
  `prefers-reduced-motion`) shows the lifecycle milestones aGTM is still blocked on
  and the events that will unblock them: the CMP decision with its expected
  `consent_events` triggers, GTM injection (consent granted but no container in the
  DOM yet), the queued events waiting to replay after consent, and a still-polling
  DL-Repeat gate (now with the concrete awaited gate spec — see the library note below).

### Added — DL-Repeat exposes its awaited gate spec (`aGTM.d.dlrepeatGate`)

`aGTM.f.dlrepeat` now records the configured `gateEvents` string on
`aGTM.d.dlrepeatGate` while it is polling for the gate — one line, so the aGTM
Inspector's "waiting on" view can name the exact event(s) the late-enrichment
replay is blocked on (previously it could only say "a gate event"). Minified
cost: +37 bytes (well within the size budget). No behaviour change.
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
  The counters are read from `aGTM.d.session`, **falling back to `window.se_data`**
  (some sites — e.g. fc-moto — currently expose them only there; a source note flags
  the fallback). When neither carries the known fields, the card lists the numeric
  fields that *do* exist in `aGTM.d.session`, so a differently-named payload is visible.

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
when `navStart` is unavailable). The lifecycle-milestone timestamps (config / CMP
decision / GTM inject / pending) are now taken from a new read-only `logMilestones`
the reader computes over the **full, uncapped `aGTM.l`** (first occurrence) — not the
panel's `tail(l,100)`, whose "first m3" wandered forward once the 2s consent poll grew
the log past 100 entries (especially with the tab backgrounded), stretching the bar to
tens of seconds. Fallback for a decision with no log entry is `consentFirstTs` (first
consent event in `aGTM.d.dl`), never `consentTs` (the last one). Andi 2026-07-26.

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
  signal each expects — sourced from the maintainer's consent-mode research notes.
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
