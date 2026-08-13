---
name: live-inspector
description: >
  Drive a REAL browser to run a live end-to-end aGTM check on a URL — walk the
  consent flow (accept/deny), prove GTM injects only after consent, confirm queued
  events replay into the dataLayer, verify network calls (gtm.js domain, consent
  store, sGTM), and capture what a CMP exposes at runtime. Requires a connected
  browser tool (the Claude-in-Chrome extension via `claude --chrome`, or the Chrome
  DevTools MCP). Use when someone wants to actually exercise/verify a LIVE aGTM
  integration on a page — not just audit a pasted config (that's integration-check).
---

# aGTM — Live browser inspection & consent-flow verification

This skill **drives a real browser** to exercise an aGTM integration end-to-end. It
is the active counterpart to `integration-check` (which diagnoses from provided
state). Reach for it when a browser tool is connected and you want to *do* the
consent flow, not just read a snapshot.

## Precondition — a connected browser tool

Confirm one is available: run `/mcp` → pick the browser server → **View tools**.
You want a tool that **evaluates JavaScript in the page and returns the result**
(`evaluate_script`) plus navigate / click / read-console / read-network. Both of
these provide it:

- **Claude-in-Chrome extension** — start Claude Code with `claude --chrome` (needs a
  paid Anthropic plan + `/login` auth, Chrome/Edge/Chromium, not WSL).
- **Chrome DevTools MCP** — `evaluate_script` + deeper network/performance tools.

If none is connected, say so and fall back to `integration-check` (guided console
snippets). Tool **names** vary by provider — discover the exact ones via View tools;
the snippets below are the JS you pass to whichever `evaluate_script`-equivalent exists.

## Safety (read this first)

- Only run against **trusted / staging / your own** pages. Driving a real browser
  shares your logged-in sessions; a hostile page is a prompt-injection surface.
- **This governs browser *actions*, not just script evaluation.** Never click a
  control that submits an order, lead, or payment or fires a conversion pixel, and
  never run JS that mutates business state — on production these are irreversible.
  Prefer **read-only** `evaluate_script` (read `aGTM.d.*`/`window.dataLayer`), and
  exercise the event path with a **synthetic, unmapped** test event rather than real
  UI (see Playbook B).
- Do the accept/deny **consent** clicks only where a mis-click is harmless (the CMP
  banner itself); when unsure, use **staging**.
- `evaluate_script` and any click/navigation count as state-changing calls, so in
  plan mode they prompt for approval — expected.

## The ground-truth probe (one read-only expression)

Pass this to `evaluate_script`; its return value is authoritative (screenshots/DOM
are secondary):

```js
JSON.stringify({
  present:    typeof window.aGTM !== 'undefined',
  init:       !!(window.aGTM && aGTM.d.init),
  gtmConsent: !!(window.aGTM && aGTM.d.consent && aGTM.d.consent.gtmConsent),
  hasResponse:!!(window.aGTM && aGTM.d.consent && aGTM.d.consent.hasResponse),
  queued:     (window.aGTM && aGTM.d.f) ? aGTM.d.f.length : null,
  dlLen:      window.dataLayer ? window.dataLayer.length : null,
  gtmInDom:   document.querySelectorAll('script[src*="/gtm.js"]').length,
  sessStatus: (window.aGTM && aGTM.d.session_status) || '',
  // Bot-check verdict from the sGTM Client (v1.5+). '' when the check is off,
  // did not answer, or the Client predates the passthrough. 'unknown' means the
  // filter did not answer usably — an outage, NOT a clean visitor. botMode says
  // whether the Client blocks ('block') or only reports ('mark'); under 'block'
  // a detected bot never gets the library in the first place.
  botBand:    (window.aGTM && aGTM.d.bot && aGTM.d.bot.band) || '',
  botMode:    (window.aGTM && aGTM.d.bot && aGTM.d.bot.mode) || ''
})
```

## Playbook A — consent flow, end to end (the headline check)

1. **Navigate** to the URL from a genuinely fresh state, so the CMP prompt shows — read
   "Getting a real first visit" below before assuming you have one.
2. **Pre-consent snapshot** (probe above). Assert for a consent-gated setup:
   `present:true`, `init:false`, `gtmConsent:false`. **Consent-gated GTM must not be
   loaded before consent.** Two caveats before flagging `gtmInDom`:
   - A container configured `noConsent:true` **is loaded on purpose before consent**
     (a documented pattern — `initGTM(true)` runs at startup). Check `aGTM.c.gtm` for
     `noConsent` entries; then `gtmInDom ≥ 1` is expected and is **not** a finding.
     `init` stays `false` and `gtmConsent` stays `false` regardless, so trust those.
   - For sGTM / custom `gtmURL` domains the DOM probe may not match the load — trust
     `init` and the network tab over the `gtmInDom` count.
   Events fired pre-consent sit in `queued > 0` (replayed after consent).
3. **Accept path:** click the CMP's *accept* control (locate it via a DOM snapshot /
   `find`). Re-probe. Assert: `hasResponse:true`, `gtmConsent:true`, `init:true`,
   `gtmInDom ≥ 1`, and the previously queued events now appear in `window.dataLayer`
   (replayed via the `aGTM_ready` / `hastyEvents` path). 
4. **Deny path:** in a genuinely fresh session — **a new incognito window, not the
   same tab after clearing cookies** (see below) — click *deny*. Assert GTM stays
   blocked: `gtmConsent:false`, `init:false`, no gtm.js request. (If a `gtm*`
   requirement is configured, partial consent that misses it must also stay blocked —
   fail-closed.)
5. **Report** a transition table (pre → accept → deny) and flag any assertion whose
   actual value didn't match, quoting the value.

## Getting a real first visit (read before the deny path)

Most of Playbook A's value depends on the browser genuinely not having decided yet.
Three things make a "first visit" a fiction, and none of them announce themselves:

1. **GTM cannot be un-injected.** Once the `<script>` is in the DOM, `aGTM.d.init` is
   `true` and `inject()`'s once-guard means no later consent change resets the page
   state. A deny *after* an accept in the same tab proves nothing — reload, always.
2. **State lives in more places than the site's consent cookie.** Depending on the CMP:
   - the **page's own origin** — cookies *and* `localStorage` (`cc_matomo`,
     `cc_jtl_consent`, `cc_tramino`, `cc_perspectivefunnel` read their decision straight
     out of `localStorage`), plus aGTM's own user-id cookie (`_aGTMuid` by default when the
     sGTM Client serves the library — if that survives, the Client resolves the user,
     returns the stored consent as `cfg.session.consent`, and GTM injects on the first
     tick with no banner);
   - a **third-party-hosted CMP's own origin** — Consentmanager, Usercentrics,
     Cookiebot, OneTrust, Sourcepoint and the like keep a second copy there
     (Consentmanager: `__cmpconsent<id>`/`__cmpccu<id>` on `.consentmanager.net` plus
     `localStorage` under `cdn.consentmanager.net`). Self-hosted CMPs (Borlabs, Klaro,
     Shopware, Matomo, Orestbida …) do **not** — for them everything is first-party.
3. **A cookie you deleted may still be there.** A write Chrome rejected, or one whose
   path/domain you did not match, looks exactly like a successful deletion.

**The reliable route is a fresh incognito window or a clean profile.** Neither browser
tool can open one for you — they attach to the running browser — so **ask the user to
open an incognito window and point the tool at it**. If that does not happen, the honest
report is "not tested from a clean state", not a result you did not have.

### Clearing state from the page (only when incognito is not an option)

> ⛔ **Never on a production site, and ask the user before running it anywhere.** This is
> a state change, not a read. It destroys the visitor's stored consent decision — which
> is the site's own record of that consent — and aGTM's user-id cookie, which breaks
> session attribution irreversibly. It also erases the very state a diagnosis reads
> (`aGTM.d.session_status`, `consent_hash`, the preset consent). **Capture the
> ground-truth probe first**, then clear. Staging or your own page only.

```js
(function () {
  try {
    // Same list the aGTM Inspector ships (devtools-extension/sim.js, SIM_COOKIE_DEFAULT)
    // — keep them in sync. `consent`/`consentPermission`/`tracking-preferences` are the
    // localStorage keys cc_matomo, cc_jtl_consent, cc_tramino and cc_perspectivefunnel
    // read; `_aGTMuid` is aGTM's own user-id cookie on the sGTM-Client path (`_TPU`
    // was the default before v1.5, `_tpf` a hand-configured name — both still occur
    // in browsers, so all three are listed). Matching is
    // case-sensitive substring, so a site's custom `cookie_name` needs adding by hand.
    var pats = ['__cmp','consent','Consent','tracking-preferences','borlabs-cookie','klaro',
                'cookiefirst','cmplz_','cookieyes','didomi','osano','TERMLY','termly',
                'cc_cookie','_tracking_consent','cmpsettings','Optanon','euconsent-v2',
                'ucData','uc_settings','_iub_cs','_aGTMuid','_tpf','_TPU','aGTM','agtm'];
    function hit(n) { return pats.some(function (p) { return n.indexOf(p) >= 0; }); }
    var d = document, names = [];
    (d.cookie || '').split(';').forEach(function (c) {
      var n = c.split('=')[0].replace(/^\s+/, '');
      if (n && hit(n) && names.indexOf(n) < 0) names.push(n);
    });
    // Every parent domain AND every path prefix — a cookie scoped to `/de/` is not
    // reachable from `/de/produkt/42` unless that exact path is written.
    var host = location.hostname.split('.'), domains = [''];
    for (var h = 0; h < host.length - 1; h++) {
      var dd = host.slice(h).join('.');
      domains.push('; domain=' + dd, '; domain=.' + dd);
    }
    var paths = ['/'], seg = (location.pathname || '/').split('/'), acc = '';
    for (var i = 1; i < seg.length; i++) {
      if (!seg[i]) continue;
      acc += '/' + seg[i];
      if (paths.indexOf(acc) < 0) paths.push(acc);
      if (paths.indexOf(acc + '/') < 0) paths.push(acc + '/');
    }
    // Two attribute variants: belt and braces. SameSite/Secure are not part of a
    // cookie's identity, so the second is a no-op here — it matters when the same
    // expression runs *inside a third-party frame*, where Chrome rejects a write that
    // would default to SameSite=Lax. (You are in the top frame; keep it for parity.)
    ['', '; SameSite=None; Secure'].forEach(function (attr) {
      names.forEach(function (n) {
        paths.forEach(function (p) {
          domains.forEach(function (dom) {
            try { d.cookie = n + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=' + p + dom + attr; } catch (e) {}
          });
        });
      });
    });
    // The page's own localStorage/sessionStorage — several CMPs keep the decision only
    // there, and then no amount of cookie clearing brings the banner back.
    var storeCleared = [];
    ['localStorage', 'sessionStorage'].forEach(function (which) {
      try {
        var st = window[which]; if (!st) return;
        var kill = [];
        for (var k = 0; k < st.length; k++) { var key = st.key(k); if (key && hit(key)) kill.push(key); }
        kill.forEach(function (key) { st.removeItem(key); storeCleared.push(which + ':' + key); });
      } catch (e) {}
    });
    // VERIFY — never report a deletion you did not confirm.
    var still = (d.cookie || '').split(';').map(function (c) { return c.split('=')[0].replace(/^\s+/, ''); });
    return JSON.stringify({
      ok: true,
      matched: names.length,
      gone: names.filter(function (n) { return still.indexOf(n) < 0; }),
      left: names.filter(function (n) { return still.indexOf(n) >= 0; }),
      storeCleared: storeCleared
    });
  } catch (e) { return JSON.stringify({ ok: false, error: String(e) }); }
})()
```

Read the result before drawing any conclusion:

- **`matched: 0`** — nothing even matched the patterns. That is *not* a clean sweep; the
  list missed this CMP (or the site uses a custom `cookie_name`). Read the real names
  from the Application tab and re-run. Reporting "cleared" here is the classic mistake.
- **`left` is non-empty** — those are **not** HttpOnly (HttpOnly cookies never appear in
  `document.cookie`, so they never get into this list at all). They are scoped to a
  domain or path the grid missed; check their real Path/Domain.
- **`ok: false`** — the origin is opaque (sandboxed frame, `data:` document) or cookie
  access is blocked by policy. Nothing was cleared.

Then **reload** (on a real site a reload is itself an action — no half-filled forms or
POST results) and re-probe. Only if the banner still does not reappear *after* the
page's own origin came back clean is case 2's third-party copy the explanation — and
then incognito is the answer.

> **For a human doing this interactively**, the repo ships the **aGTM Inspector**
> DevTools extension (`devtools-extension/`, packaged as `aGTM-Inspector.zip`). Its
> Simulation tab runs the same reset inside the page's **foreign frame documents** too,
> and reports per host what actually went — DevTools may evaluate there, a page may not.
> It reaches only origins that are **framed at that moment**, so a CMP with no open
> frame is still an incognito job; the tab says so when it reached nothing. Whether
> *your* browser tool can do the same depends on it: the Claude-in-Chrome
> `javascript_tool` targets a tab, not a frame, so it cannot. A CDP-based tool may
> expose a frame or execution-context selector — check its schema rather than assuming
> either way.

## Playbook B — event / dataLayer verification

Verify the event → dataLayer path **without side effects**: after consent, fire a
**synthetic, unmapped** test event via `evaluate_script` —
`aGTM.f.fire({ event: 'aGTM_livecheck' })` — then read `window.dataLayer` and
`aGTM.d.dl` and confirm it arrived (for a `_noDLPush` event, confirm it lands in
`aGTM.d.dl` but **not** the dataLayer). The event name is wired to no GTM tag, so
nothing real fires.

To validate a **specific** tracked interaction (a real click/form handler), do it
**only on staging with test data** — never trigger controls that submit an order,
lead, or payment or fire a conversion pixel; those are irreversible on production.

## Playbook C — capture a CMP's runtime shape (feeds `cmp-integration`)

To author or fix a CMP `consent_check`, you need the CMP's real global structure.
After accept, and again after deny, evaluate the CMP global and dump its shape, e.g.:

```js
JSON.stringify(window.Cookiebot && window.Cookiebot.consent)   // Cookiebot
// or: window.UC_UI && UC_UI.getServicesBaseInfo && UC_UI.getServicesBaseInfo()
// or: window.__ucCmp, window.CCM, window.Shopify, window.sp … (CMP-specific)
```

Capture the keys / consent arrays / IDs the CMP exposes in each state → that is
exactly what `consent_check` must map into `aGTM.d.consent`. Hand the captured shape
to `cmp-integration`.

## Playbook D — network & sGTM verification

Read the page's network requests and confirm:
- `gtm.js` loaded from the **expected domain** — default `www.googletagmanager.com`,
  or the custom `gtmURL` / sGTM domain (this catches the sGTM case a DOM-only probe
  misses).
- On a consent change, the consent-store **POST** fired (path ends `/aGTMconsent`)
  when `consent_store_url` is configured.
- For an sGTM-served setup, `/aGTM.js` was served (and carries the library).

### The check that actually carries a compliance report: pre-consent leaks

"aGTM held GTM back" is the *smaller* half. The question a customer needs answered is
whether **anything** tracking-related fired before the decision — vendor pixels wired up
outside aGTM leak just as happily. Walk the requests recorded **before** the consent
moment and flag any that are a tracking hit: `google-analytics.com`/`analytics.google.com`
(`/g/collect`, `/collect`), `googletagmanager.com/gtag/js`, `facebook.net`/`facebook.com/tr`,
`bat.bing.com`, `analytics.tiktok.com`, `px.ads.linkedin.com`, `ct.pinterest.com`,
`criteo`, `doubleclick.net`, plus your own sGTM endpoints (`/g/collect`, `/aEvents`).

Three things decide whether that result means anything:

1. **Did you observe the window at all?** If the tool attached after the page had already
   loaded, "no leaks" is not a pass — it is **not measurable**. Say `N/A`, never green.
   A false green is exactly what ends up quoted in a customer report.
2. **Compare against the right moment.** Use the moment consent was *first* established
   (the first consent event / `aGTM_ready` / injection), **not** the latest consent state
   — aGTM's periodic CMP poll (`consent_poll_ms`, default 2 s) keeps refreshing the
   latter, so a "consent timestamp" read naively drifts forward and a genuine leak looks
   like it happened *after* consent.
3. **Compare the request's START.** A network entry's timestamp is usually its *end*;
   subtract its duration before comparing, or a slow request that started before consent
   reads as if it started after.

### What consent the Google tag actually carried

For a Google request, `gcs`/`gcd` in the query string are the ground truth of the consent
state that tag was sent with — more reliable than reasoning about ordering. `gcs` is
`G1<ad_storage><analytics_storage>` with `1`/`0`; `gcd` encodes the four v2 signals
positionally (`l` = not configured, `p`/`q` = denied, `r` = denied→granted, `t` = granted
by default, `v` = granted and confirmed). A `gcs=G100` on a hit that should have had
consent means the tag ran before the update reached it.

## Playbook E — health snapshot / report

Compose a structured snapshot for a page: effective `aGTM.c` (config), consent
object, `init`, containers loaded, dataLayer length, and a network summary. Useful
as a before/after artifact around a library upgrade. Save it to disk if the browser
tool supports it.

## Decode the debug log (optional deep dive)

`aGTM.l` is aGTM's encoded internal log. `aGTM_debug.js` (repo root) decodes it in
the console for a step-by-step trace of what the library did and when — use it when
the state alone doesn't explain a failure.

## Output

Lead with pass/fail per assertion and quote the actual `aGTM.d.*` values that prove
each. Add a screenshot only when it clarifies (e.g. the CMP banner state). If a
browser tool was **not** available, say so and hand off to `integration-check`.

## Related skills

- No browser connected → `integration-check` (guided console snippets / static audit).
- Building or adjusting a config → `config-builder`.
- Writing/fixing a CMP adapter → `cmp-integration` (Playbook C here captures the CMP
  shape it needs).
