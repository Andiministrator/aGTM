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

Applies to **aGTM 1.5** (library, CMP adapters, sGTM Client). Every statement below is
verifiable in `aGTM.js`, `cmp/cc_*.js` and
`sgtmClient/src/aGTM-sGTM-Client-jsSourceCode.js`; §7 shows how to check the live result
instead of trusting the text.

> **Read this first.** aGTM is a *toolkit*. Almost every flow below is off unless someone
> switches it on, and the ones that are on by default are named as such. A statement like
> "nothing is sent to a third party" is therefore a statement about **a specific
> configuration**, never about the library. Nothing here can be quoted about a live site
> without also quoting that site's configuration — §7 shows how to read it out.

---

## 1. The two deployment shapes

Which flows can exist at all depends on how aGTM is delivered. Mixing the two up is the
single most common source of a wrong privacy statement about this product.

| | **A — standalone library** | **B — served by the sGTM Client** |
|---|---|---|
| How | `aGTM.js` hosted by you (or a CDN), config written by hand | `<script src="https://sgtm.example.com/aGTM.js?id=GTM-XXX&c=…">` |
| Who assembles the config | the integrator, in the page | the sGTM Client, per request |
| Server-side identity | none | fingerprint / user-id cookie, Session API, promote |
| Flows in play | rows **L1–L6** | rows **L1–L6** *and* **S1–S9** |

Everything in section 2 (L rows) applies to both. Section 3 (S rows) exists **only** in
shape B. If there is no sGTM Client, there is no bot check, no Session API, no fingerprint,
no user-id cookie, no Sources API — none of it is in the library.

---

## 2. Browser-side flows (both shapes)

| # | Operation | Recipient | Delivered default | Consent |
|---|---|---|---|---|
| L1 | GTM container load (`gtm.js`) | `googletagmanager.com` (or your own host) | no container configured | **after** ¹ |
| L2 | CMP adapter file | the host serving `aGTM.js` | none (no `cmp` set) | **before** |
| L3 | `_post` event transport | `transport_url` / per-event URL | off (empty) | **after** ² |
| L4 | Consent-store `POST /aGTMconsent` | the sGTM host serving the library | off standalone · **on** in shape B | **at the decision** |
| L5 | Consentmanager block probe | `cdn.consentmanager.net` | only with `cmp: "consentmanager"` | **before** |
| L6 | `aGTMoptout` / `aGTMdebug` cookies | first-party, no request | not set | n/a |

¹ Five documented exceptions — see §5.  ² Bypassable per event with `_noConsent`.

**Not in the table, but list it in your ROPA anyway:** loading `aGTM.js` itself. In shape A
that is a request to wherever you host it — your own origin, or a **third-party CDN** if you
chose one, in which case that CDN sees the IP address and User-Agent of every visitor before
anything else happens. In shape B it is row S1, and it carries considerably more.

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
- **Default:** none. aGTM ships with no container id; without one it now runs its own
  lifecycle events and loads nothing (v1.5).
- **Recipient:** `https://www.googletagmanager.com/gtm.js` unless a per-container
  `gtmURL` points somewhere else (self-hosted or server-side GTM). A `gtmJS` value makes
  aGTM inline the container instead — then no external request happens at all.

### L2 — CMP adapter file

- **Trigger:** `aGTM.f.load_cc()` during `init()`, i.e. **before** any consent decision.
- **Sent:** a GET for `<path>cmp/cc_<name>.min.js`. No parameters, no payload.
- **Condition / field:** `cmp` set to an adapter name **and** the library not served by the
  sGTM Client — the Client injects the adapter code inline into the response body, so shape
  B produces no separate request.
- **Default:** no `cmp`, no request.
- **Recipient:** whatever `aGTM.c.path` points at — normally your own origin.

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
  one successfully stored (`aGTM.js`, consent diff/hash).
- **Sent:** POST `{"e":{uid, sid, consent:{…}}}`. The consent block is what the CMP adapter
  reported (purposes / services / vendors / `consent_id` / `feedback` …) minus the
  client-derived `gtmConsent`/`blocked` and minus empty values.
- **Recipient:** `aGTM.c.consent_store_url`. In shape B the library **derives** it in the
  browser from `document.currentScript.src` + `/aGTMconsent`, so it always points at the
  same host that served the library (this is what makes reverse-proxy setups work).
- **Condition / field:** `consent_store_url` non-empty. In shape B the Client sets it up
  unless *Enable Consent Store route* is unticked — i.e. **on by default**.
- **Consent:** this request *is* the consent decision being recorded. It fires at the moment
  of the decision and carries no tracking payload.
- **Note:** `consent_store_enc` is offered but unusable — the server answers `501` and
  stores nothing (see CHANGELOG). Leave it off.

### L5 — Consentmanager "is the CMP blocked?" probe

- **Trigger:** `cmp/cc_consentmanager.js`. If `window.__cmp` is still missing on the 11th
  poll, the adapter issues `fetch('https://cdn.consentmanager.net/delivery/1x1.gif')` and,
  when it fails, records `blocked = true` / `hasResponse = true`.
- **Consent:** **before** any decision — that is the point of the probe. It is a request to
  a third-party CDN made for a visitor who has not answered anything yet.
- **Condition / field:** `cmp: "consentmanager"` only. **There is no setting to switch it
  off**, and it is the only one of the ~25 adapters that behaves this way.
- **Consequence worth knowing:** `blocked` is the value the consent gate falls back to when
  the configured requirements cannot be evaluated, so a *blocked* Consentmanager can end up
  loading GTM. Tracked as finding F-164; if this matters for your deployment, say so and it
  gets a switch.

### L6 — Cookies the library itself writes

`aGTMoptout` (set only when someone calls the page with `?aGTMoptout=1`, and it exists to
**stop** processing) and `aGTMdebug` (set only when the debug parameter or a Tag-Manager
preview referrer is present). Both are first-party, functional, and carry no identifier.
The library writes no other cookie and uses neither `localStorage` nor `sessionStorage`.

---

## 3. Server-side flows — sGTM Client only (shape B)

All of these happen **while `/aGTM.js` is being answered**, i.e. before the page has a
consent decision. They are requests *from your sGTM container* to services you operate or
contract; the visitor's browser never talks to them directly.

| # | Operation | Recipient | Delivered default | Consent |
|---|---|---|---|---|
| S1 | `GET /aGTM.js` (the request itself) | your sGTM host | — (this is the integration) | **before** |
| S2 | Bot check | `botCheck` URL (api4filter) | **off** | **before** |
| S3 | Session API read | `session_api_url` | **off** (empty) | **before** |
| S4 | Sources API POST | `sources_api_url` | **off** | **before** |
| S5 | `Set-Cookie` user id | the visitor's browser | name `_tpf`, 365 d, `cookie_mode: always` | see below |
| S6 | Response body → `aGTM.d.session` / `aGTM.d.bot` | the page (every script on it) | — | **before** |
| S7 | Pre-init code | whatever it does | **off** | **before** |
| S8 | F→C promote | `session_api_url/…/promote` | follows S3 | **after** |
| S9 | Consent write | `session_api_url/…/consent` | follows S3 | **after** |

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
- **Default:** the whole check is **off** (`botCheckEnabled` must be ticked *and* a URL
  given). `botCheckExpose` is on, i.e. once enabled the verdict is published to the page as
  `aGTM.d.bot` unless you untick it.
- **Consent:** before, necessarily — it decides whether a library is served at all.

### S3 — Session API read

- **Sent:** `GET {session_api_url}/{tenant_id}/{uid}`, 5 s timeout. The **uid is in the
  path**; there is no body.
- **Received:** the session record — `sessionId`, `counter`, timestamps, counters, and for a
  returning visitor the **stored consent**, which is passed into the page as
  `cfg.session.consent`.
- **Condition / field:** `session_api_url` **and** `tenant_id` both set.
- **Default:** empty — no request. Without it there is no server-side session, no
  auto-denial, no promote, and rows S4/S8/S9 cannot fire either.
- **See §4** for what the `uid` in that path actually is.

### S4 — Sources API POST

- **Sent:** `POST {sources_api_url}/{tenant_id}` (plus `?attribution=true&method=…` when
  attribution is on), body `{user_id, page_location, referrer, timestamp}`, 1.5 s timeout.
- **Received:** marketing-source fields, copied into `cfg.session.*` (blacklist-filtered:
  session keys and counters cannot be clobbered) and, with attribution on, an `attribution`
  object keyed by method.
- **Default:** off. Note the operational cost when on: `/aGTM.js` waits for this round trip,
  so an outage of that API delays library delivery — and with it GTM — by up to 1.5 s.

### S5 — the user-id cookie

- **Name/lifetime:** `cookie_name`, default **`_tpf`**; `cookie_lifetime`, default **365
  days**. Written with `httpOnly`, `secure`, `SameSite=None`, `path=/`, domain per
  `cookie_domain` (default `auto`). A cookie written under an older name is read, carried
  over and then deleted.
- **Value:** a stable `C.…` user id — see §4.
- **When:** only when the resolved id is a **stable `C.*`** id. A visitor who has not
  produced a consent signal carries no cookie **even under `cookie_mode: always`**: that
  mode means "set the cookie regardless of consent", not "freeze a shared server-side
  fingerprint in the browser". `cookie_mode: consent` additionally requires the configured
  consent condition; `never` writes nothing.
- **Caveat worth testing yourself:** whether a *rejection* can still mint a cookie depends
  on what your CMP reports when the visitor clicks "deny all". A CMP that still reports an
  essential category emits a non-empty consent signal. This is open finding F-165 — the
  acceptance test is in §7.

### S6 — what the response body hands to the page

The served body is per-visitor. It contains `cfg.session` (uid, session id, counters, and
for a returning visitor their **stored consent**), `cfg.bot` when the bot check is on and
exposed, and `cfg.session.source`/`attribution` when the Sources API is on. All of it lands
in `aGTM.d.*`, which **every script on the page can read**, and it is there **before** the
consent decision. That is deliberate — webGTM must be able to read it — but it belongs in a
privacy assessment. The response is sent with `Cache-Control: private, no-store`; it must
never be cached by a CDN or proxy, or one visitor's session would be handed to the next.

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

## 4. Identifiers

| Identifier | Form | Derived from | Lives where | Lifetime |
|---|---|---|---|---|
| Fingerprint id | `F$1$<tenant>$<hash>.<YYYYMMDD>` | SHA-256 over IP, User-Agent, `Accept-Language`, `sec-ch-ua*`, GeoIP headers, scheme, sGTM host | server-side only | rolls daily (date suffix) |
| Stable user id | `C.1$<tenant>$<random>.<ms>` | a random number, minted on a consent signal | the `_tpf` cookie | `cookie_lifetime`, default 365 d |
| Session id | from the Session API | server-side | `aGTM.d.session.sid` | per the API's session window |

**The fingerprint is not per-person.** Two visitors behind the same NAT using the same
browser version derive the same value. That is why v1.5 stopped writing it into a cookie
(which would freeze the collision for a year) and stopped handing a consent preset to a
visitor whose id is not cookie-bound. It is still the **key** under which a session is read,
which is a known limitation and is tracked as finding F-156 — worth naming honestly in an
assessment rather than describing the fingerprint as a per-device identifier.

`fingerprint_allowed` (default on) switches the derivation off entirely; without it a
visitor with no cookie simply has no server-side session.

---

## 5. Before or after the consent decision

The library's rule is: no GTM before a consent decision. There are **five documented
configurations where GTM loads anyway**, and they are enumerated with their reasoning in
[README.md → *When aGTM loads GTM without a consent decision*](README.md#when-agtm-loads-gtm-without-a-consent-decision):

1. **`noConsent` containers** — loaded deliberately before the decision.
2. **`cmp: "none"`** — the integrator states that no gate applies.
3. **iFrame mode** — an iframe instance inherits the parent document's decision.
4. **`allowEmptyConsentConditions: true`** — the explicit opt-out of the gate. Without it an
   empty condition table is **fail-closed** as of v1.5 and loads nothing.
5. **Server-side auto-denial with *Load GTM even under auto-denial*** (default **on**) — a
   returning visitor with nothing on file gets a denial preset, and this switch decides
   whether GTM still loads for them. It only has an effect when the condition table of
   point 4 is filled; with an empty table nothing loads for anybody anyway.

Independent of GTM, these run **before** any decision in every installation of shape B: the
`/aGTM.js` request itself (S1) with page URL and referrer, the bot check (S2), the Session
API read (S3), the Sources POST (S4), and the publication of session and verdict data to
the page (S6). Plus, for one CMP only, the block probe of row L5.

---

## 6. What aGTM does not do

Stated because a reviewer will ask, and because each of these is verifiable in the source:

- The library writes no `localStorage` or `sessionStorage` entry and reads none. Four CMP
  adapters (`matomo`, `jtl_consent`, `perspectivefunnel`, `tramino`) **read** the storage
  key their own CMP writes, because that is where those CMPs keep the consent decision —
  read-only, one named key, and only the adapter you selected is even loaded.
- No canvas, font, WebGL or device fingerprinting in the browser. The only fingerprint is
  server-side and built from request headers (§4).
- No request to any endpoint operated by the aGTM project or its author. Every recipient in
  this document is either Google's GTM, a host **you** configure, or — in the single case of
  row L5 — the CMP vendor's own CDN.
- The *aGTM Inspector* Chrome extension in this repository is a developer tool that runs in
  DevTools on your own machine. It is not part of the library, never reaches a visitor, and
  sends nothing anywhere.
- No transmission of form values, input contents or personal data by itself. What the GTM
  templates collect (clicks, scroll depth, form submits …) is configured in **your**
  container; see [EVENTS.md](EVENTS.md) for exactly which attributes each event carries.
- No encryption of payloads. `consent_store_enc` / `transport_enc` are obfuscation
  (Base64 + Caesar). Use HTTPS, which is what actually protects the transport.

---

## 7. Verify it on your own installation

Do not copy this document into a ROPA unverified — read the configuration out. All of these
are read-only.

**Which flows are active (browser console, any page with aGTM):**

```js
// Shape: is a session preset present (⇒ served by the sGTM Client)?
aGTM.d.session_status;          // "" = standalone · "preset" / "preset_with_consent" = shape B
// Which recipients are configured?
aGTM.c.gtm;                     // GTM containers (and any custom gtmURL)
aGTM.c.consent_store_url;       // "" = no consent store
aGTM.c.transport_url;           // "" = no _post transport
aGTM.c.cmp;                     // "" with the sGTM Client is normal (adapter is inlined)
// What did the server hand to the page?
aGTM.d.session;                 // uid, sid, counters, source, attribution
aGTM.d.bot;                     // {} = bot check off or not exposed
aGTM.d.consent;                 // what the CMP reported, and gtmConsent
```

**The rejection test** (the one an auditor runs, and the one that settles F-165):

1. Open the site in a fresh profile, click **Deny all**.
2. `aGTM.d.consent.gtmConsent` must be `false`.
3. No `gtm.js` request in the network tab (unless you deliberately run a `noConsent`
   container — then exactly that one).
4. Check the cookie named in `cookie_name` (default `_tpf`). If it exists and its value
   starts with `C.`, a stable id was minted despite the rejection — report it.

**Which sGTM Client version is answering:**

```bash
curl -sI 'https://sgtm.example.com/aGTM.js?id=GTM-XXXXXX' | grep -i x-agtm-version
```

**Whether the consent gate is really configured:** open the sGTM Client in the container and
look at *Consent Check Conditions*. An **empty** table means, since v1.5, that no GTM loads
at all — and if *Load GTM without any consent gate* is ticked, it means the opposite. Both
states are legitimate; neither should be a surprise.

---

## 8. Using this for your own ROPA / VVT

For each row that is active in your installation you have the four things Art. 30 asks for
and the two your DPO asks for on top:

| Art. 30 field | Where it comes from |
|---|---|
| Purpose | the section text of that row |
| Categories of data | "Sent" of that row, plus the request metadata named in L1/S1 |
| Recipients | the *Recipient* column — resolve it to the actual host you configured |
| Retention | §4 for identifiers; everything else is retained by the **receiving** service |
| Legal basis / consent | the *Consent* column, plus §5 for the exceptions |
| Third-country transfer | follows from the host you configured, not from aGTM |

Two honest caveats to carry over rather than paper over: the server-side fingerprint is not
a per-person identifier (§4), and the *before consent* rows of §3 are structural — they are
how the library gets delivered at all, not an optional add-on.

---

*Questions, corrections, or a flow you think is missing:
[github.com/Andiministrator/aGTM/issues](https://github.com/Andiministrator/aGTM/issues).*
