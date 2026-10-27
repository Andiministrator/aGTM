<!-- sGTM Client rules for agents. Moved verbatim from the root CLAUDE.md on 2026-10-25; Claude Code loads this file when working in sgtmClient/. On conflict, the root CLAUDE.md wins for rules, this file for mechanics. Paths below are relative to the repository root. -->

<!-- Section: sGTM Client — bot check, user-ID cookie, CORS, container URL parameters, Sources API -->

### Bot check (sGTM Client only)

Optional. Before any session/cookie work, the Client GETs `{botCheck}/{base64url payload}`
with `{UserAgent, ClientIP}` and reads the verdict from the response body.

- **No status-code gate** (F-127). The filter service couples the HTTP status to the
  verdict — **403 when `isBot`, 200 otherwise** — so a `2xx only` gate skips the body of
  exactly the responses that report a bot. Such a gate existed from the v1.5 single-session
  refactor (`9d302d7`) until F-127 and silently let **every** bot through; v1.4.x had none.
  `sendHttpGet` resolves for any completed response, so the body is read regardless of status.
  `test/sgtm/botcheck.test.js` guards this structurally.
- `isBot === true` → 403 + `returnResponse()`, no library is served. `isBot` is the **sole**
  block trigger (definitive signals only); `score`/`band`/`signals` never block by themselves.
- **`botCheckMode`** (SELECT, default `block`) — `mark` reports the verdict but never blocks.
  It exists because a blocked visitor is *invisible*: no library, no `aGTM.d.bot`, no way to
  count false positives. Recommended rollout on an existing site: `mark` first, count
  `aGTM.d.bot.isBot === true` in webGTM, then switch to `block`. Normalized so that only the
  literal `'mark'` disables blocking — a misconfigured SELECT can never silently switch the
  filter off (F-29 lesson).
- **`botCheckExpose`** (CHECKBOX, opt-out: absent ⇒ on) — whether the verdict is published to
  the page at all. `aGTM.d` is readable by every script on the page and is written *before*
  any consent decision, so "filter yes, publish no" has to be expressible.
- Only a real boolean `isBot` counts as a verdict. Anything else — a 5xx whose body happens to
  parse, an empty body, a transport error — becomes `{isBot:false, band:'unknown'}`, so an
  outage stays distinguishable from a clean visitor. Without that, a webGTM traffic-type
  variable reports `regular` for 100% of traffic for as long as the filter is down.
- The verdict carries **`mode`** (`block`/`mark`). Otherwise `mark` is invisible: a page under
  `mark` looks exactly like one under `block` until a bot shows up, and nothing reminds anyone
  that the filter is off. The Inspector renders it as a chip and adds a health-check line
  (status `na`, not `warn` — `mark` runs for weeks by design, and weeks of WARN would wear the
  overall status out; an outage or a `bot` verdict under `mark` still warns, and those are
  checked *before* the mode so the severe finding is never hidden by it).
- **Measuring the `mark` phase depends on what carries the number out.** `aGTM.d.bot` itself is
  set inside `aGTM.f.config()`, i.e. while `/aGTM.js` executes — **before** any consent
  decision, so the value is there for every visitor. The bottleneck is the *sender*: a webGTM
  variable is only read when a tag fires, tags need GTM, and GTM needs consent, so a
  consent-gated tag misses every visitor who never answers the CMP (most non-human traffic).
  A consent-free sender — a cookieless analytics call in the page, a `noConsent` container —
  sees all of them and makes the browser count a real rate. With a consent-gated sender it is
  a false-positive detector for humans only. The Client also writes a **non-debug** `warn` line
  for each bot it sees under `mark`; that log, or the filter service's own numbers, is complete
  either way — the `logging` permission is scoped to **all** environments for exactly that
  reason (`debug` would make both warn lines silent no-ops in a live container, and the field
  help would promise a record the container cannot keep).
- A missing verdict carries **`reason`**: `no_answer` · `bad_answer` · `no_client_ip`. Lumping
  them into a bare `unknown` would hide that "the filter is down" and "the IP header did not
  resolve" call for completely different responses.
- **Values are whitelisted, not just keys** (`botEnum` against `BOT_BANDS`/`BOT_CATEGORIES`/
  `BOT_TYPES`; `botScore` floors and rejects anything outside 0–100 — a score above 100 is a
  contract violation, and clamping it to 100 would hand the most incriminating legal value to a
  broken response). **How well each table is backed differs**: `BOT_CATEGORIES` is enumerated
  verbatim in the service spec; `suspicious` in `BOT_BANDS` is inferred; four of the six
  `BOT_TYPES` are back-translated from a prose sentence and may not match the real identifiers —
  the spec enumerates `type` nowhere. A wrong guess costs resolution, not safety. **The collapse
  is logged** (one `warn` per affected request), because a silent vocabulary drift would be the
  same failure class as the bugs this hardening pass was about. A key whitelist alone does not stop an
  existing key whose value the service later widens — `primarySignal: "asn_spam:AS55967/Baidu/76ip"`
  is 27 characters and would sail through any length cap. Unknown values collapse to `'other'`:
  still visible as "something fired", but unable to carry a payload. The lookup uses `=== 1`,
  not truthiness, so `toString`/`constructor` cannot inherit their way past it.
- The signals loop bounds **the work, not only the output**: `{"length": 50000000}` passes the
  duck-check and never grows the result, so an output-only cap would spin 50 million times and
  stall `/aGTM.js` — and with it the GTM load — on ~40 bytes of response body.
- `buildAndSend` is declared **before** its callers. It used to sit at the end of the file,
  making every *synchronous* serve path (no Session API, or an unresolvable session uid) a
  forward reference to a `const` function expression — a temporal-dead-zone error that killed
  the whole response. The async path masked it, which is why it survived from `9d302d7` to
  F-130. `test/sgtm/serve-paths.test.js` runs the real source against stubbed server APIs and
  asserts every path reaches a response.
- Otherwise the verdict is forwarded to the browser as **`c.bot`** → `aGTM.d.bot`, so webGTM
  can mark borderline traffic (e.g. a `traffic_type` dimension) instead of only hard-blocking.
- **Own top-level config key, not part of `session`**: the check runs before and independently
  of the Session API, so a session outage must not drop the verdict, and the verdict must not
  open the library's session preset gate (which drives `session_status`).
- `botFieldsFromResponse()` is a **whitelist** — the opposite of the Sources API capture,
  which blacklists. This payload is readable by every script on the page, so a field the
  service adds later must be opted in by a code change instead of leaking on the next API
  deploy. Forwarded: `isBot`, `score`, `band`, `primarySignal`, and `signals[]` reduced to
  `{type, category, score, confirmed}` (capped at 10). **`signals[].detail` is deliberately
  dropped** — for `asn_reputation` it carries tenant-wide aggregates about *other* visitors
  (`asn`, `asnOrg`, `uniqueIps`, `requests`, `consecutiveWindows`).

### User-ID cookie consent requirement (sGTM Client only, F-165)

`hasRequiredConsent()` grants the `C.*` mint (POST promote / local mint, lazy promote on GET,
`consent`-mode refresh) only against *Consent Service / Purpose / Vendor*. All three empty
(`consentConditionMissing`) grants **nothing** unless the checkbox `cookie_without_condition` is
ticked; the fields are visible in every `cookie_mode` except `never`. An empty requirement is a
configuration gap, not a withdrawal: it never deletes (the `cookie_delete` branch and
`sessionConsentRevoked` both exclude it). When it blocks a mint on the consent POST, the answer
carries `x-agtm-uid-cookie: no-consent-requirement` plus a `debug` line — deliberately no `warn` (a
visitor without a `C.*` gets no preset and re-POSTs on every page view) and no `templateDataStorage`
(server-side storage at this traffic). Tests: `test/sgtm/cookie-condition.test.js` + two
`___TESTS___` scenarios. **`bun test` does not run `___TESTS___`** — after changing Client behaviour,
grep `^- name:` for scenarios that assume the old behaviour.

### CORS and the cross-site write guard (sGTM Client only)

`setCorsHeaders()` runs on every answer that a page may need to read: `/aGTM.js` (200) and
`/aGTMconsent` (every status `finishConsentPost` passes through — 200, 404, 502 … — and the 501
path; not the cross-site 403). It always sends `Vary: Origin` and
sends `Access-Control-Allow-Origin: <origin>` + `Allow-Credentials: true` **only** for an
allowed origin (F-189 — it used to echo any origin, so every site could `fetch()` the
per-visitor body with uid, sid and stored consent):

- `https://` only; the host is compared, port ignored, the origin echoed verbatim.
- listed in **`cors_origins`** (exact hosts, comma-separated; scheme/path ignored) — for a
  site outside the cookie domain;
- or the host is `cookie_domain` or a subdomain of it;
- or, with `cookie_domain: 'auto'` (the delivered default), the same **eTLD+1** as the
  request host — resolved like `setCookie`'s `auto`: `Forwarded host=`, then
  `X-Forwarded-Host`, then `Host`. Via `computeEffectiveTldPlusOne`, so `a.example.co.uk`
  and `b.example.co.uk` are siblings while two `.co.uk` sites are not. Whether the API also
  honours the PSL's *private* section (`github.io`, `*.run.app`) is not documented — unverified.
  Fails closed: an empty eTLD+1 never matches, and without the public-suffix list the API
  returns its argument, so two siblings compare unequal. An explicit `cookie_domain` also
  requires host and domain to share an eTLD+1 — with the list down only the domain host
  itself passes. **Consequence of a suffix-list outage:** subdomain pages get no ACAO; their
  consent POST still arrives and is stored (`same-site` passes the guard), but the library sees
  status 0, never reaches `synced` and adopts a promoted uid only on the next page view. `'auto'` cannot mean "no CORS" — that would leave F-160
  broken for exactly the default configuration.

The library side (F-160): the consent POST goes `withCredentials` + `text/plain`
(`aGTM.f.xsend`'s 5th parameter), a CORS simple request — the Client still has no OPTIONS
route and needs none. `text/plain` is safe because the Client parses the body whatever
its Content-Type.

**CORS is not the only way to read** (F-189, second half). A foreign page can include
`/aGTM.js` as a classic `<script src>` — no `Origin`, cookie included — and read `aGTM.d`
in its own window. So the GET handler computes `foreignEmbed` right after the path gate:
`Sec-Fetch-Site: cross-site`, the page's `Referer` host not allowed (`hostAllowed`) and no
allowed `Origin` either (a listed page without Referer loads with `crossorigin=use-credentials`).
Only the Referer **host** is ever logged, and only under `debug`. The integrator sees it
anyway: the served script (after any pre-init code) runs a `try`-wrapped `console.warn("[aGTM]
Served WITHOUT session data …")` and the response carries `x-agtm-preset: withheld-cross-site` — otherwise a
missing `cors_origins` looks like a first-time visitor forever.
`afterBotCheck` then calls `buildAndSend(null)` before any uid resolution — no Session API,
no cookie, no Sources POST (closes F-239, `?c=` attribution injection), no `c.bot`, no
consent-store URL builder. The bot check still runs (a forged `Sec-Fetch-Site` must not dodge
`block`, and `mark` must keep measuring a misconfigured cross-domain tenant); only the verdict
is withheld. **Proxy dependency applies here too:** a proxy that strips `Sec-Fetch-Site`
silently turns this read protection off, one that strips `Referer` turns listed foreign hosts
into foreign embeds. `cors_origins` entries starting with `.`/`*` or containing non-ASCII
characters are logged once per `/aGTM.js` request at `warn` (a dotless host such as
`localhost` is valid). Consequence: an sGTM on a different registrable domain than the
site needs the site's hosts in `cors_origins`, or its visitors get no preset.

**CORS governs reading, not sending** (F-238). A foreign page can still deliver the POST
(`mode: 'no-cors'`, `text/plain`), and the `SameSite=None` user-id cookie travels with it —
before F-238 any site could store a consent decision in the visitor's name. The POST
handler therefore refuses with 403, before reading the body, when
`Sec-Fetch-Site: cross-site` arrives from an origin the allow-list does not name.
The guard depends on the proxy in front of the Client passing `Sec-Fetch-Site` through — a
proxy that strips `Sec-*` headers makes it silently ineffective (check with a cross-site
request through the real proxy). `same-site` / `same-origin` and a missing header (older browsers, server-to-server) pass —
refusing them would break real visitors, and the gap they leave is the pre-existing one.
Not covered and tracked: a server-side caller that knows a uid can still write a consent for
it — the handler takes the uid from the body (F-240); `auto` on a hosting platform's shared
domain trusts every other tenant's subdomain as `same-site`, for reading AND writing, and
*Cookie Domain* does not fix it — only a custom domain does (F-241); a proxy that rewrites `Host` without
passing the public host on defeats `auto` (debug log `✗ CORS: origin not allowed` names
both hosts). The new code avoids `String.prototype.trim` (see `trimCond`) and uses
`split(' ').join('')`. `test/sgtm/cors.test.js` covers the matrix.

### Container URL parameters (sGTM Client only)

The container table's **`gtm_use`** column ("URL Parameters") decides what is
appended to a container's `gtm.js` URL — the mechanism for loading a GTM
*environment*. It is the third field of this Client that was read under a name
the template never defined (`v.gtm_env`), after `gtm_id_match` (F-159) and the
version header (F-158); see F-161.

Four resolutions, per container row, and the column accepts a **variable**
(`macrosInSelect`), so the value is whatever it resolved to at request time:

| value | appended |
|---|---|
| `no` / empty / `false` | nothing — "not configured" |
| `env` (or a stored boolean `true`, the former "yes") | `gtm_auth`, `gtm_preview`, `gtm_cookies_win` from the request |
| `all` | every query parameter except the ones aGTM owns |
| anything else | **the value itself**, if it looks like `k=v` |

The two filters are deliberately different in kind, the same way the bot check
whitelists and the Sources capture blacklists. Request-derived values are
**encoded** and budgeted; the resolved column value is taken **verbatim**
(tenant-authored configuration, same trust level as the container URL) but must
pass a shape check. Both paths refuse the parameters aGTM owns — `id` selects
the container, `c` carries the page payload, and `l` names the dataLayer, so a
caller's copy of `l` could redirect GTM onto an object nobody writes to: a silent,
error-free total outage of the measurement. Refusing it here means safety does not
rest on how a given `/gtm.js` resolves duplicate parameters (googletagmanager.com
honours the first occurrence — measured, never promised, and a self-hosted one may
differ).

Budgets bound the **work**, not only the output: 10 repetitions per parameter,
1000 characters per container, checked *before* appending so a parameter is
either fully present or absent — a URL cut mid-parameter looks valid and is
wrong. In `all`, the env parameters are emitted **first**: order decides what
survives the budget, and a landing page carrying `gclid`/`_gl`/`utm_*` ahead of
`gtm_auth` would otherwise push out exactly the parameter the column exists for,
leaving an environment request without its auth — GTM answers that with a stub,
so GTM fails to load for those visitors only.

Log levels carry the distinction: caller-driven events (repetition cap, length
cap, `env` selected but absent from the request) are `debug`, because anyone can
trigger them on every request by forwarding the page query; a value the *tenant*
configured wrongly is `warn`, and would otherwise drown in them.

Library side: `aGTM.f.gtm_load` appends `o.env` verbatim after `&l=<dataLayer>`,
so the string must start with `&`. It now prepends one if missing — without it a
standalone integrator pasting `gtm_auth=abc` produced `&l=dataLayergtm_auth=abc`:
GTM loads, writes to a dataLayer nobody reads, and nothing errors.

### Opt-out (sGTM Client only, F-259)

- `aGTMoptout` cookie with a value other than `0`, **or** `?aGTMoptout=<not 0>` in the page URL
  from `?c=` ⇒ `afterBotCheck()` takes the `buildAndSend(null)` path, like `foreignEmbed`: the
  library is served, but no Session API, no Sources API, no user-ID cookie. The page parameter
  decides first (`0` withdraws the objection on this very request), as in `aGTM.f.optout()`.
- The library is still served on purpose: it has to run to keep, renew (13 months) or withdraw
  the objection. The library writes the cookie for the registrable domain, so it reaches the
  Client on a subdomain; a host-only cookie of a library before v1.5 does not.
- The bot check still runs (security, before the opt-out branch).
- The page parameter is read exactly like `aGTM.f.urlParam` (first occurrence after `?`/`&`/`#`,
  URL-decoded, empty = absent) in a top-level `for-of` — no `forEach` callback that rebinds a
  top-level `let` (no precedent in the sandbox). Test table in `test/sgtm/optout.test.js`.
- `data.debug` reaches the library only when `!optedOut` (library `debug` ignores the cookie).
- `POST /aGTMconsent` with the cookie: `204`, nothing stored, no cookie (a tab loaded before the
  objection can still post a banner change).

### Sources API integration (sGTM Client only)

Server-side POST to a Sources API (`api4sources`) on every aGTM.js request. The POST is the Client's; its **response** flows into the library: every non-meta field is captured into `cfg.session.*`, which the library deep-copies into `aGTM.d.session.*` so webGTM can read it via a plain JS variable.

- After the Session API step completes (so the session is committed in the shared Redis), the Client POSTs `{user_id, page_location, referrer, timestamp}` to `{sources_api_url}/{tenant}`.
- `page_location` and `referrer` come from the integration code's `?c=` base64 payload; `user_id` is the resolved session uid; tenant is reused from the existing `tenant_id` config.
- **URL build:** `sources_api_url` holds the bare base **WITHOUT** tenant or query (e.g. `…/tp/sources`); the Client appends `/{tenant}` at runtime (same convention as the session/consent/promote endpoints). With attribution on, `?attribution=true&method=<…>` is appended **after** the tenant. Putting tenant/query into the field produces a malformed URL like `…/tp/sources/acme/?attribution=true/acme` (double tenant).
- Race-free with api4sources' Redis lookup (`customer_sessions:{tenant}:{user_id}`) — the Session API write happened first within the same Client request.
- **Sequential before `buildAndSend`** (changed from fire-and-forget): the POST is awaited because its response carries tracking payload. On 2xx, the Client copies **every non-meta top-level field** of the response into `sessionData` (meta = `ok`/`tenant`/`session_id`/`ts`/`skipped`/`reason`; reserved session keys `uid`/`sid`/`consent`/… **and the Session API counters** `created`/`lastInteraction`/`pvCount`/`eventCount`/`sessionCount` are blacklisted too so the API cannot clobber the session — `fireSources()` runs *after* the Session API step has filled those in and writes into the same object; empty/null values are skipped). **Note the deliberate asymmetry to the bot check:** the Sources response is payload the tenant configured and wants in the browser, so a new field there is a feature and the filter is a blacklist. The bot-check response is a classifier's verdict about the visitor, so a new field there is a leak and the filter is a whitelist (see §"Bot check"). The flat affiliate `source` (last-cookie-win, e.g. `"it_webgains"`) thus lands at `aGTM.d.session.source`. On timeout/error/non-2xx nothing is captured and delivery proceeds. Adds one internal round-trip to /aGTM.js latency — **operational caveat:** an api4sources outage now blocks `/aGTM.js` (and GTM loading) by up to the 1500 ms timeout for every visitor while `sources_enabled` is on; monitor api4sources latency.
- **Attribution (inline, opt-in):** with `sources_attribution` on, the POST appends `?attribution=true&method=<sources_method>` and api4sources returns an `attribution` object **in the same response** (no separate request). The Client wraps it by method — `sessionData.attribution = { <method>: <obj> }` — which **re-activates** the library's attribution machinery: `config()` runs `resolveAttribution` per method (HYBRID merge: current URL wins for browser-derivable fields like utm/click-IDs, API wins for cross-session memory like `afs`/`lcs`/`fss`). webGTM reads e.g. `aGTM.d.attribution.last_touch.sou`. Note: the inline attribution reflects the state **before** this request (ClickHouse Materialized-View lag); the HYBRID merge compensates this only for the browser-derivable fields (via the fresh URL) — the pure API fields `afs`/`lcs`/`fss` have no URL fallback and can lag on the first request of a new session's source. The POST is single-method (`method=`), so `sources_method` is a single SELECT.
- **webGTM read path:** a standard GTM "JavaScript Variable" — `aGTM.d.session.source` for the affiliate source, `aGTM.d.attribution.<method>.<field>` for attribution. No custom template needed. The preset gate (Client + library) accepts a session carrying only a **non-empty** `source`/`attribution`, so the value survives even a degraded Session API response (no `sid`/`consent`). (An empty `source` is skipped at capture, so it does not by itself keep an otherwise-empty session.)
- Template options (sGTM Client): `sources_enabled` (boolean, default false), `sources_api_url` (text, bare base), `sources_attribution` (boolean, default false), `sources_method` (SELECT: `last_touch`/`first_touch`/`last_click`/`first_click`/`last_non_direct_click`, default `last_touch`). Tenant reused from `tenant_id`.
- API specs (api4sources + api4sgtm) + integration guide + combined smoketest live in `internal/api/` (gitignored). Smoketest steps 5-8 cover sources POST contract; 9-10 + 15 cover read/attribution; 16-18 cover sources edge cases; 19-20 cover api4sgtm session promote; 21 covers content-store hash roundtrip. All steps run in one HTTP request; output is a slim HTML overview by default and `?format=json` for the full report.
- **Standalone Attribution GET removed (client-side, 2026-06-22):** the externally-added Attribution API call (`fireAttribution` + template fields `attribution_enabled`/`attribution_api_url`/`attribution_methods`) was end-to-end non-functional — it pointed at `…/tp/sources/…?methods=` instead of the `…/tp/attribution/…` endpoint (404). It is replaced by the inline `?attribution=true` on the Sources POST above (one request instead of two). The **library-side** attribution code is unchanged and now fed by the inline path.
- Tradeoff: SPA virtual pageviews mid-session are not captured. Acceptable because attribution cares about session source, not in-session navigation; and api4sources dedups on source fingerprint anyway. SPA-source capture is a v1.6+ topic (would need a `/aGTMsources` browser proxy path).

---
