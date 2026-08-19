# aGTM — Data Flow Reference

**What leaves the browser or the server, when, to whom, under which setting — and what is
delivered by default.**

This is a *data-flow* document, not a data *contract*. Its companion
[README-for-Integrators.md](README-for-Integrators.md) answers "which field holds what";
this file answers the questions a data protection officer, a security review or your own
record of processing activities (ROPA / VVT, GDPR Art. 30) actually asks:

> Which request is sent, what does it carry, who receives it, which setting causes it,
> what is the value shipped to someone who configures nothing — and does it happen
> **before or after** the visitor's consent decision?

**Scope:** aGTM 1.5 — the library (`aGTM.js`), the CMP adapters (`cmp/`), the sGTM Client
(`sgtmClient/`), **and** the GTM Custom Templates shipped in `gtm/`. The templates run inside
*your* container and are optional, but they are part of this repository and they collect
data, so they get their own section (§4) rather than a footnote. The Stape.io helper under
`ext/` is named in §4 but not otherwise covered — assess it separately if you use it.

Every statement below is verifiable in the sources named with it; §9 shows how to check the
live result instead of trusting the text.

> **Read this first.** aGTM is a *toolkit*. Almost every flow below is off unless someone
> switches it on, and the ones that are on by default are named as such. A statement like
> "nothing is sent to a third party" is therefore a statement about **a specific
> configuration**, never about the library. Nothing here can be quoted about a live site
> without also quoting that site's configuration — §9 shows how to read it out.

---

## 1. The two deployment shapes

Which flows can exist at all depends on how aGTM is delivered. Mixing the two up is the
single most common source of a wrong privacy statement about this product.

| | **A — standalone library** | **B — served by the sGTM Client** |
|---|---|---|
| How | `aGTM.js` hosted by you (or a CDN), config written by hand | `<script src="https://sgtm.example.com/aGTM.js?id=GTM-XXX&c=…">` |
| Who assembles the config | the integrator, in the page | the sGTM Client, per request |
| Server-side identity | none | fingerprint / user-id cookie, Session API, promote |
| Flows in play | **L1–L8**, plus **T** if you use the templates | the same, **and S1–S9** |

Section 3 (L rows) and section 4 (T rows) apply to both. Section 5 (S rows) exists **only**
in shape B. If there is no sGTM Client, there is no bot check, no Session API, no
fingerprint, no user-id cookie, no Sources API — none of it is in the library.

---

## 2. Overview

| # | Operation | Recipient | Delivered default | Consent |
|---|---|---|---|---|
| L1 | GTM container load (`gtm.js`) | `googletagmanager.com` (or your own host) | no container configured | **after** ¹ |
| L2 | CMP adapter file | whatever `aGTM.c.path` points at | none (no `cmp` set) | **before** |
| L3 | `_post` event transport | `transport_url` / per-event URL | off (empty) | **after** ² |
| L4 | Consent-store `POST /aGTMconsent` | the sGTM host serving the library | off standalone · **on** in shape B | **at the decision** |
| L5 | Consentmanager block probe | `cdn.consentmanager.net` | only with `cmp: "consentmanager"` | **before** |
| L6 | `aGTMoptout` / `aGTMdebug` cookies | first-party, no request | not set | n/a |
| L7 | iFrame events via `postMessage` | the parent document | off (`iframeSupport`) | **before** ³ |
| L8 | JavaScript error capture | your dataLayer / GTM | **always on, no switch** | collected before, sent after |
| T1 | Copy-Events tag: the copied text | your dataLayer / GTM | tag not installed | after |
| T2 | Pageview tag: test-result cookie | first-party, no request | tag not installed | after |
| T3 | Pageview tag: device attributes | your dataLayer / GTM | tag not installed | after |
| T4 | Consent Mode tag: the Microsoft consent signals | `bat.bing.com` (UET) · `clarity.ms` (Clarity) | tag not installed · `ms_consent_mode` **off** | **at the decision** ⁴ |
| S1 | `GET /aGTM.js` (the request itself) | your sGTM host | — (this is the integration) | **before** |
| S2 | Bot check | `botCheck` URL | **off** | **before** |
| S3 | Session API read | `session_api_url` | **off** (empty) | **before** |
| S4 | Sources API POST | `sources_api_url` | **off** | **before** |
| S5 | `Set-Cookie` user id | the visitor's browser | name `_tpf`, 365 d, `cookie_mode: always` | see §5 |
| S6 | Response body → `aGTM.d.*` | the page — **and cross-origin readers** | — | **before** |
| S7 | Pre-init code | whatever it does | **off** | **before** |
| S8 | F→C promote | `session_api_url/…/promote` | follows S3 | **after** |
| S9 | Consent write | `session_api_url/…/consent` | follows S3 | **after** |

¹ Six documented exceptions — see §7.  ² Bypassable per event with `_noConsent`.
³ The iframe mode grants consent to itself; see §7.  ⁴ The only template flow with a **third party** as recipient — see §4.

**Not in the table, but list it in your ROPA anyway:** loading `aGTM.js` itself. In shape A
that is a request to wherever you host it — your own origin, or a **third-party CDN** if you
chose one, in which case that CDN sees the IP address and User-Agent of every visitor before
anything else happens. In shape B it is row S1, and it carries considerably more.

---

## 3. Browser-side flows of the library (both shapes)

### L1 — GTM container load

- **Trigger:** `aGTM.f.inject()` after the consent gate passed (`aGTM.js`, `gtm_load`).
- **Sent:** a `<script src>` GET. The URL carries `?id=<container>`, `&l=<dataLayer name>`
  and, if configured, the *URL Parameters* string (`gtm_auth`/`gtm_preview`/
  `gtm_cookies_win`, or arbitrary parameters — see the sGTM Client README). As with any
  script tag, the request itself also conveys IP address, User-Agent, `Referer` and the
  cookies of the receiving domain. From then on, what GTM sends is **GTM's** business, not
  aGTM's — aGTM does not see or control the tags inside the container.
- **Condition / field:** at least one container in `gtm` (library) or in the container table
  (Client); `aGTM.d.consent.gtmConsent === true`.
- **Default:** none. aGTM ships with no container id; without one it runs its own lifecycle
  events and loads nothing (v1.5).
- **Recipient:** `https://www.googletagmanager.com/gtm.js` unless a per-container `gtmURL`
  points somewhere else (self-hosted or server-side GTM). A `gtmJS` value makes aGTM inline
  the container instead, and then no external request happens — **except in debug mode**
  (`aGTMdebug` cookie, a `gtm_debug` URL parameter, or a Tag Assistant referrer), where the
  external URL is used so the container stays debuggable.

### L2 — CMP adapter file

- **Trigger:** `aGTM.f.load_cc()` during `init()`, i.e. **before** any consent decision.
- **Sent:** a GET for `<aGTM.c.path>cmp/cc_<name>.min.js`. No parameters, no payload.
- **Condition / field:** `cmp` set to an adapter name **and** the library not served by the
  sGTM Client — the Client injects the adapter code inline into the response body, so shape
  B produces no separate request.
- **Default:** no `cmp`, no request.
- **Recipient:** whatever `aGTM.c.path` points at. Normally your own origin, but it is a
  configured path, not necessarily the host that served `aGTM.js`.

### L3 — `_post` event transport

- **Trigger:** an event passed to `aGTM.f.fire()` carrying `_post`.
- **Sent:** `XMLHttpRequest` POST, `Content-Type: application/json`, body `{"e": <event>}` —
  the whole event object minus `_post`/`_post_sent`/`eventModel`, plus `aGTM.d.consent` when
  `_post.consent` is set. With `transport_enc` the body is `{"q":"<obfuscated>"}` — Base64
  plus a Caesar shift (`aGTM.f.enc`). **That is obfuscation, not encryption**, and it is
  trivially reversible; do not present it as a technical protection measure.
- **Condition / field:** `transport_url` (global) or `_post.url` (per event). The event
  passes the consent gate like any other — **unless** it also carries `_noConsent`, which is
  what that flag is for (functional or legally required events).
- **Default:** `transport_url` is empty; no event carries `_post` unless you add it.

### L4 — Consent-store POST

- **Trigger:** `aGTM.f.run_cc()` whenever the serialized consent state differs from the last
  one successfully stored.
- **Sent:** POST `{"e":{uid, sid, consent:{…}}}`. The consent block is what the CMP adapter
  reported (purposes / services / vendors / `consent_id` / `feedback` …) minus the
  client-derived `gtmConsent`/`blocked` and minus empty values.
- **Recipient:** `aGTM.c.consent_store_url`. In shape B the library **derives** it in the
  browser from `document.currentScript.src` + `/aGTMconsent`, so it always points at the
  same host that served the library (this is what makes reverse-proxy setups work).
- **Condition / field:** `consent_store_url` non-empty. In shape B the Client sets it up
  unless *Enable Consent Store route* is unticked — i.e. **on by default**.
- **Consent:** this request *is* the consent decision being recorded. It carries no
  behavioural or page data — but it does carry the **persistent user id and session id** of
  §6. It fires when the serialized state differs from the last one stored: normally at the
  moment of the decision, and again on the state-change poll (`consent_poll_ms`, default
  2000 ms) after a failed attempt.
- **Note:** `consent_store_enc` is offered but unusable — the server answers `501` and
  stores nothing (see CHANGELOG). Leave it off.

### L5 — Consentmanager "is the CMP blocked?" probe

- **Trigger:** `cmp/cc_consentmanager.js`. If `window.__cmp` is still missing on the 11th
  poll, the adapter issues `fetch('https://cdn.consentmanager.net/delivery/1x1.gif')` and,
  when it fails, records `blocked = true` / `hasResponse = true`.
- **Consent:** **before** any decision — that is the point of the probe. It is a request to
  a third-party CDN made for a visitor who has not answered anything yet.
- **Condition / field:** `cmp: "consentmanager"` only. **There is no setting to switch it
  off**, and it is the only CMP adapter that behaves this way.
- **Consequence worth knowing:** `blocked` is the value the consent gate falls back to
  whenever the configured requirements are **not met**, so a *blocked* Consentmanager can
  end up loading GTM. Tracked as finding F-164; if this matters for your deployment, say so
  and it gets a switch.

### L6 — Cookies the library itself writes

`aGTMoptout` (set only when someone calls the page with `?aGTMoptout=1`, and it exists to
**stop** processing) and `aGTMdebug` (set only when the debug parameter or a Tag-Manager
preview referrer is present). Both are first-party, functional, carry no identifier, and are
written with `Secure; SameSite=Lax; path=/`. The library writes no other cookie and reads
neither `localStorage` nor `sessionStorage`. One shipped **template** writes a third cookie
through the same helper — see T2.

### L7 — iFrame mode: events leave the document via `postMessage`

- **Trigger:** `aGTM.f.iFrameFire()`, i.e. every user event fired inside an iframe running
  its own aGTM instance.
- **Sent:** the complete event object, plus `aGTM_source: "iFrame " + document.location.hostname`,
  via `window.top.postMessage(event, <configured origin>)`. In the other direction the parent
  broadcasts a handshake message to its iframes with target origin `*` (the handshake carries
  no data). The receiving "aGTM iFrame Support" tag in the parent enforces a hostname
  allow-list and strips aGTM's control flags out of the message (v1.5).
- **Condition / field:** `iframeSupport: true` **and** the instance actually running in an
  iframe.
- **Default:** off.
- **Consent:** **before / without a decision.** In iframe mode aGTM grants consent to
  itself (`gtmConsent = true`, feedback *"Page is iFrame"*) on the assumption that the parent
  document made the decision. This is the one path where event data crosses a document
  boundary without any HTTP request being visible in the network tab.

### L8 — JavaScript error capture

- **Trigger:** a `window.onerror` listener installed unconditionally at the end of
  `aGTM.f.init()`.
- **Sent:** an `exception` event into the dataLayer with `errmsg` (message + script URL +
  line/column) and `browser` = `navigator.appCodeName | appName | appVersion | platform`.
  `appVersion` is effectively the full User-Agent. The first 5 errors are fired, up to 100
  counted.
- **Condition / field:** **none — there is no configuration flag for this.**
- **Consent:** the *capture* starts with `init()`, i.e. before any decision; the
  *transmission* goes through `aGTM.f.fire()` and is therefore consent-gated like any other
  event (queued in `aGTM.d.f`, replayed after consent). Worth naming in an assessment
  anyway: an error message can contain a URL with parameters, and this is the only data
  collection the library performs without being asked to.

---

## 4. Flows the shipped GTM templates add

These are **not** the library. They are optional Custom Templates from `gtm/` that you
install in your own container, and they run under your container's consent configuration.
[EVENTS.md](EVENTS.md) is the complete reference for every event and attribute; listed here
are the four that collect — or forward — something a privacy assessment has to name.

### T1 — Copy-Events tag: the copied text

`gtm/tags/copy-events/` registers a `copy` listener on `body` and pushes the copied text as
`text`. The tag recognises **e-mail addresses and phone numbers** and passes those through
**verbatim and untruncated** (plain text is cut at 512 characters; a recognised contact
detail is not). This is the one shipped tag that records visitor content which is personal
data by its nature. Text filters are configurable; the tag is not installed by default.

### T2 — Pageview tag: the test-result cookie

With *Use Cookie to avoid multiple Tests* switched on, `gtm/tags/pageview-events/` writes a
first-party session cookie through the library's `aGTM.f.sc()` — default name
`_tr_Test_Result`, value `"1"`, `Secure; SameSite=Lax; path=/`. It carries no identifier and
only suppresses a repeated bot/human test.

### T3 — Pageview tag: device attributes

The same tag can add `f_browser`, `f_browser_version`, `f_os`, `f_device`,
`f_screen_width/height`, `f_viewport_*`, `f_locale` and `f_dnt`, read from `navigator` and
`window.screen`, plus a behavioural test (`mousemove`/`keydown`/`scroll`/`touchstart`) and a
JS-execution-time bot test. Each attribute is opt-in on its own row — but together they are
the classic passive device profile, so switch them on deliberately.

### T4 — Consent Mode tag: the Microsoft consent signals

`gtm/tags/consent-mode/` primarily writes Google Consent Mode through GTM's own
`setDefaultConsentState` / `updateConsentState` APIs — which stay inside the container and
have no recipient of their own. Its *Fire Microsoft Consent Mode* option
(`ms_consent_mode`, **off** by default) is different: it is the only template flow that
hands data to a **third party**.

With the option on, the tag pushes the consent state into `window.uetq` (Microsoft UET) and
calls `clarity('consentv2', …)` (Microsoft Clarity). Neither is a request this tag makes —
but UET turns each consent push into a `navigator.sendBeacon` to `bat.bing.com`, so a
recipient does see it, and in the *Update after Default* mode there are two such beacons
instead of one. What travels is the consent state itself (`ad_storage`, `ad_user_data`,
`ad_personalization`) plus whatever UET's own beacon carries; on subsequent UET hits the
state appears as the `asc` parameter (`G` / `D`). The Clarity call may create a
`window.clarity` shim if the Clarity script has not loaded yet.

Timing: the tag typically runs on the *Consent Initialization* trigger, i.e. **before** the
visitor decides — that is the point of a consent default. Nothing about the visitor is sent
at that moment beyond the consent state itself.

Two things are worth knowing for an assessment, both read from the live `bat.js`:

- **UET enforces consent by itself in the EEA, the UK and Switzerland**, where its own
  default is *denied*. Any consent push disables that enforcement, because UET then assumes
  consent is being managed externally. Switching this option on therefore moves
  responsibility for those visitors from Microsoft to your configuration.
- For that reason the tag sends **nothing** to UET unless `ad_storage` is explicitly set to
  `granted` or `denied`. A partial signal would disable the enforcement while leaving the
  visitor on granted.

`c.bing.com` — the ID Sync pixel of Microsoft's Conversions API — is **not** part of this
tag. If you run CAPI, that pixel is a separate, client-side, consent-relevant flow you have
to assess yourself; the aGTM Inspector flags it as a tracker.

### Not covered: `ext/`

The Stape.io helper under `ext/` is example integration code, not part of the library. It
reads a Stape user id from a cookie, `localStorage`, a JS variable or a CSS selector and
loads a script from a configured endpoint. If you use it, assess it on its own.

---

## 5. Server-side flows — sGTM Client only (shape B)

Rows **S1–S7** happen **while `/aGTM.js` is being answered**, i.e. before the page has a
consent decision. **S8 and S9 are the exception:** they run while the Client answers
`POST /aGTMconsent` (row L4), i.e. *after* the decision.

S2, S3, S4, S8 and S9 are requests *from your sGTM container* to services you operate or
contract, which the visitor's browser never talks to directly. S5 and S6 are what the
container sends back to the browser.

### S1 — the `/aGTM.js` request

The integration snippet appends `&c=` with a Base64 of `{"u": location.href, "r":
document.referrer}` — so **the full page URL and the referrer reach your sGTM host** on
every page view, before anything is decided. The request also carries what any HTTP request
carries: IP address, User-Agent, `Accept-Language`, client hints, and the cookies of the
sGTM host (including the user-id cookie of row S5). `?id=` selects the container.

This is the flow to name first in a ROPA entry: it exists in every shape-B installation and
is not optional.

### S2 — Bot check

- **Sent:** `GET {botCheck}/{base64url of {"UserAgent":…,"ClientIP":…}}`, 5 s timeout.
- **Received:** a verdict `{isBot, score, band, primarySignal, signals[]}`, whitelisted
  field by field and value by value before it goes anywhere near the page.
- **Effect:** with `botCheckMode: block` (the default *when the check is enabled*) a
  positive verdict ends the request with `403` and no library. With `mark` the visitor is
  served normally and only marked.
- **Second 403 path, worth knowing for an availability assessment:** if the check is enabled
  in `block` mode and the client IP cannot be resolved at all, the Client answers `403`
  **without ever asking the filter service** — a visitor blocked with no classification
  behind it. In `mark` mode the same situation passes through with
  `reason: 'no_client_ip'`.
- **Default:** the whole check is **off** (it must be enabled *and* given a URL).
  `botCheckExpose` is on, i.e. once enabled the verdict is published to the page as
  `aGTM.d.bot` unless you untick it.
- **Consent:** before, necessarily — it decides whether a library is served at all.

### S3 — Session API read

- **Sent:** `GET {session_api_url}/{tenant_id}/{uid}`, 5 s timeout. The **uid is in the
  path**; there is no body.
- **Received:** the session record — `sessionId`, `counter`, timestamps, counters, the GA4
  session id `ga4sid` and `muidga4` when present, and for a returning visitor the **stored
  consent**, which is passed into the page as `cfg.session.consent`.
- **Condition / field:** `session_api_url` **and** `tenant_id` both set.
- **Default:** empty — no request. Without it there is no server-side session, no
  auto-denial and no promote, so S8/S9 cannot fire. **Row S4 is independent of it** — see
  there.
- **See §6** for what the `uid` in that path actually is.

### S4 — Sources API POST

- **Sent:** `POST {sources_api_url}/{tenant_id}` (plus `?attribution=true&method=…` when
  attribution is on), body `{user_id, page_location, referrer, timestamp}`, 1.5 s timeout.
- **Received:** marketing-source fields, copied into `cfg.session.*` (blacklist-filtered:
  session keys and counters cannot be clobbered) and, with attribution on, an `attribution`
  object keyed by method.
- **Condition / field:** `sources_enabled`, `sources_api_url`, `tenant_id`, a resolvable
  user id, and a `page_location` from the `?c=` payload. **It does not require the Session
  API.** A fingerprint-derived id is enough, so the full page URL and referrer go to the
  Sources API even for a visitor who has no session at all.
- **Default:** off. Note the operational cost when on: `/aGTM.js` waits for this round trip,
  so an outage of that API delays library delivery — and with it GTM — by up to 1.5 s.

### S5 — the user-id cookie

- **Name/lifetime:** `cookie_name`, default **`_tpf`**; `cookie_lifetime`, default **365
  days**. Written with `httpOnly`, `secure`, `SameSite=None`, `path=/`, domain per
  `cookie_domain` (default `auto`). A cookie written under an older name is read, carried
  over and then deleted.
- **Value:** a stable `C.…` user id — see §6.
- **When:** only when the resolved id is a **stable `C.*`** id. A visitor who has not
  produced a consent signal carries no cookie **even under `cookie_mode: always`**: that
  mode means "set the cookie regardless of consent", not "freeze a shared server-side
  fingerprint in the browser". `cookie_mode: never` writes nothing.
- **Caveat worth testing yourself.** In the delivered default (`cookie_mode: always`) there
  is **no configurable consent requirement for minting the cookie at all**: the check
  returns "granted" when none of *Consent Service / Purpose / Vendor* is set, and the
  template only shows those three fields when `cookie_mode` is `consent`. The only remaining
  barrier is that the CMP reported *something* non-empty. So a CMP that still reports an
  essential category after "deny all" can mint a 365-day `C.*` cookie despite the rejection.
  Open finding F-165 — the acceptance test is in §9, and it has to be run against the
  **current** Client build.

### S6 — what the response body hands out

The served body is per-visitor. It contains `cfg.session` (uid, session id, the GA4 session
id `ga4sid` and `muidga4` when the Session API holds them, counters, and for a returning
visitor their **stored consent**), `cfg.bot` when the bot check is on and exposed, and
`cfg.session.source`/`attribution` when the Sources API is on. All of it lands in
`aGTM.d.*`, which **every script on the page can read**, and it is there **before** the
consent decision. That is deliberate — webGTM must be able to read it.

Two properties of that response belong in an assessment:

- It is sent with `Cache-Control: private, no-store`. It must never be cached by a CDN or
  proxy, or one visitor's session would be handed to the next.
- It echoes the request's `Origin` header back in `Access-Control-Allow-Origin` together
  with `Access-Control-Allow-Credentials: true`, and the user-id cookie is `SameSite=None`.
  A page on **any** origin the visitor later opens can therefore read this per-visitor body,
  including the uid and the stored consent decision. Tracked as finding F-189; if you run
  shape B, treat this as open until it is resolved.

### S7 — pre-init code

Arbitrary JavaScript, entered in the template, prepended verbatim to the response and
executed before aGTM starts (typical use: a CMP loader). Off by default. Whatever it sends
is outside aGTM's control and has to be assessed on its own.

### S8 / S9 — promote and consent write

Both are consequences of a consent decision arriving at `POST /aGTMconsent` (row L4):

- **S8 promote** — `POST {session_api_url}/{tenant}/{oldUid}/promote` migrates a
  fingerprint-derived id to a stable `C.*` id and writes the consent in one atomic step.
  Only when consent was actually granted with an explicit signal.
- **S9 consent write** — `POST {session_api_url}/{tenant}/{uid}/consent` persists the
  consent block into the session record (full-replace) when S8 did not already do it.

---

## 6. Identifiers

| Identifier | Form | Derived from | Lives where | Lifetime |
|---|---|---|---|---|
| Fingerprint id | `F$1$<tenant>$<hash>.<YYYYMMDD>` | SHA-256 over IP, User-Agent, `Accept-Language`, `sec-ch-ua*`, GeoIP headers, scheme, sGTM host | server-side only | rolls daily (date suffix) |
| Stable user id | `C.1$<tenant>$<random>.<ms>` | a random number, minted on a consent signal | the `_tpf` cookie | `cookie_lifetime`, default 365 d |
| Session id | from the Session API | server-side | `aGTM.d.session.sid` | per the API's session window |
| GA4 session id | from the Session API | server-side | `aGTM.d.session.ga4sid`, `.muidga4` | per the API's session window |

(The `$` is the default *ID Limiter*; a tenant may configure a different character.)

**The fingerprint is not per-person.** Two visitors behind the same NAT running the same
browser build derive the same value. v1.5 stopped writing it into a cookie — which would
have frozen the collision for a year — and stopped handing a **consent preset** to a visitor
whose id is not cookie-bound. Two consequences remain, and both belong in an assessment:

- The **rest** of the session record is not gated on the cookie. Session id, `ga4sid`,
  `muidga4` and the counters are passed through regardless, so a second visitor sharing the
  fingerprint receives the first one's session identifiers in `aGTM.d.session`.
- A consent decision is still **persisted** under the shared fingerprint key whenever no
  cookie exists.

Both are tracked as finding F-156 (read path closed, write path open). Describing the
fingerprint as a per-device identifier would be wrong.

`fingerprint_allowed` (default on) switches the derivation off entirely; without it a
visitor with no cookie simply has no server-side session.

---

## 7. Before or after the consent decision

The library's rule is: no GTM before a consent decision. There are **five documented
configurations where GTM loads anyway**, enumerated with their reasoning in
[README.md → *When aGTM loads GTM without a consent decision*](README.md#when-agtm-loads-gtm-without-a-consent-decision),
plus one misconfiguration that behaves the same way:

1. **`noConsent` containers** — loaded deliberately before the decision.
2. **`cmp: "none"`** — the integrator states that no gate applies.
3. **iFrame mode** — an iframe instance inherits the parent document's decision (and see L7:
   its events leave the document too).
4. **`allowEmptyConsentConditions: true`** — the explicit opt-out of the gate. Without it an
   empty condition table is **fail-closed** as of v1.5 and loads nothing.
5. **Server-side auto-denial with *Load GTM even under server-side auto-denial*** (default
   **on**) — a returning visitor with nothing on file gets a denial preset, and this switch
   decides whether GTM still loads for them. With an empty condition table and the opt-out
   of point 4 switched **off**, nothing loads for anybody anyway; with that opt-out **on**,
   GTM loads for everybody and this switch is again without effect.
6. **The sGTM Client's pre-filled *Custom CMP Check* code**, left in place. It reports
   `hasResponse: true` and takes the granted purposes/services/vendors from your static
   configuration — no visitor is ever asked. Not a feature, a trap; named here because it is
   the one an auditor is most likely to hit.

Independent of GTM, these run **before** any decision in every installation of shape B: the
`/aGTM.js` request itself (S1) with page URL and referrer, the bot check (S2), the Session
API read (S3), the Sources POST (S4), and the publication of session and verdict data to the
page (S6). In every installation, shape A included: the CMP adapter file (L2), the error
listener (L8), and — for one CMP only — the block probe of row L5.

---

## 8. What aGTM does not do

Stated because a reviewer will ask, and because each of these is verifiable in the source.
The scope is **this repository** unless narrowed explicitly.

- **No active fingerprinting in the browser:** no canvas, no font enumeration, no WebGL, no
  AudioContext — anywhere in the repository. The only fingerprint aGTM computes is
  server-side and built from request headers (§6). Two known string matches that are *not*
  running code, named here so finding them does not undermine the rest: a comment in the
  Pageview tag recording that a commented-out WebGL bot-detection block was removed, and a
  `matchMedia` call in the standalone configurator (a UI tool, not shipped to visitors). The
  passive device attributes the Pageview tag can add are T3, not a denial.
- **No `localStorage` or `sessionStorage` written, anywhere.** Read access exists in four CMP
  adapters, which read the key their own CMP writes because that is where those CMPs keep
  the consent decision: `matomo` reads two (`localStorage.consent` and
  `sessionStorage['consent-cache']`), `jtl_consent`, `perspectivefunnel` and `tramino` one
  each. Only the adapter you selected is ever loaded. Six adapters likewise **read**
  `document.cookie` to find their CMP's consent cookie; none of them writes one.
- **No transmission of form values or input contents by the library itself.** The Form
  Events tag listens for `focus` and `submit` and never reads a field value. The exception
  worth naming is a template, not the library: **T1, the Copy-Events tag, records copied
  text including a recognised e-mail address or phone number, verbatim.** See
  [EVENTS.md](EVENTS.md) for every attribute of every event.
- **No request to any endpoint operated by the aGTM project or its author.** Every recipient
  in this document is Google's GTM, a host **you** configure, or — in the single case of row
  L5 — the CMP vendor's own CDN.
- **No encryption of payloads.** `consent_store_enc` / `transport_enc` are obfuscation
  (Base64 + Caesar). Use HTTPS, which is what actually protects the transport.
- **The *aGTM Inspector* Chrome extension** in this repository is a developer tool that runs
  in DevTools on your own machine. Its manifest declares no `permissions` and no
  `host_permissions`; it makes no network request and never reaches a visitor.

---

## 9. Verify it on your own installation

Do not copy this document into a ROPA unverified — read the configuration out. All of these
are read-only.

**Which flows are active (browser console, any page with aGTM):**

```js
aGTM.d.version;                 // library version — both shapes
aGTM.d.session_status;
// ""                     no session preset: standalone, OR the Client had nothing to pass
// "preset"               a session was preset (⇒ sGTM Client), without usable consent
// "preset_with_consent"  a stored consent was preset (⇒ sGTM Client)
// "synced" / "confirmed" a consent-store POST has run since
aGTM.c.gtm;                     // GTM containers (and any custom gtmURL)
aGTM.c.consent_store_url;       // "" = no consent store; otherwise: who receives the decision
aGTM.c.transport_url;           // "" = no _post transport
aGTM.c.cmp;                     // "" with the sGTM Client is normal (adapter is inlined)
aGTM.d.session;                 // uid, sid, ga4sid, counters, source, attribution
aGTM.d.bot;                     // {} = bot check off or not exposed
aGTM.d.consent;                 // what the CMP reported, and gtmConsent
```

A reliable shape test is `aGTM.c.consent_store_url` together with `aGTM.d.session.uid` —
`session_status` alone is not one, because a shape-B delivery without a Session API stays
`""` as well.

**The rejection test** (the one an auditor runs, and the one that settles F-165):

1. Open the site in a fresh profile, click **Deny all**.
2. `aGTM.d.consent.gtmConsent` must be `false`.
3. No `gtm.js` request in the network tab (unless you deliberately run a `noConsent`
   container — then exactly that one).
4. Check the cookie named in `cookie_name` (default `_tpf`) in **DevTools → Application →
   Cookies**. It is `httpOnly`, so `document.cookie` and the console will **not** show it —
   a scan that only looks there reports "no cookie" for a cookie that exists. If it is there
   and its value starts with `C.`, a stable id was minted despite the rejection: report it.

**Which sGTM Client version is answering** (Client and library are versioned separately —
ask both):

```bash
curl -sI 'https://sgtm.example.com/aGTM.js?id=GTM-XXXXXX' | grep -i x-agtm-version
```

**Whether the consent gate is really configured:** open the sGTM Client in the container and
look at *Consent Check Conditions*. An **empty** table means, since v1.5, that no GTM loads
at all — and if *Load GTM without any consent gate (only when the table above is empty)* is
ticked, it means the opposite. Both states are legitimate; neither should be a surprise.

---

## 10. Using this for your own ROPA / VVT

For each row that is active in your installation you have the four things Art. 30 asks for
and the two your DPO asks for on top:

| Art. 30 field | Where it comes from |
|---|---|
| Purpose | the section text of that row |
| Categories of data | "Sent" of that row, plus the request metadata named in L1/S1 |
| Recipients | the *Recipient* column — resolve it to the actual host you configured |
| Retention | §6 for identifiers; everything else is retained by the **receiving** service |
| Legal basis / consent | the *Consent* column, plus §7 for the exceptions |
| Third-country transfer | follows from the host you configured, not from aGTM |

Three honest caveats to carry over rather than paper over: the server-side fingerprint is not
a per-person identifier and still leaks session identifiers between visitors who share it
(§6), the *before consent* rows of §5 are structural — they are how the library gets
delivered at all, not an optional add-on — and the response of row S6 is currently readable
cross-origin (F-189).

---

*Questions, corrections, or a flow you think is missing:
[github.com/Andiministrator/aGTM/issues](https://github.com/Andiministrator/aGTM/issues).*
