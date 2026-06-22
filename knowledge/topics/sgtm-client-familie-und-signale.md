# sGTM-Client-Familie & Signal-Verarbeitung

> **Stand:** 2026-06-22. Quelle: Code-Review der sGTM-Client-Templates
> (`sgtmClient/src/aGTM-sGTM-Client-jsSourceCode.js` + extern geprüfte
> Schwester-Templates). Code-Wahrheit bleibt im jeweiligen Repo/`CLAUDE.md` —
> diese Datei erklärt das **Umfeld** und die **Signal-Interop**.

## Die Client-Familie

Im aGTM-Ökosystem (alle vom selben Autor) gibt es mehrere **server-seitige
sGTM-Client-Templates**. Nur der **aGTM-Client** lebt in DIESEM Repo:

| Template | Repo | Aufgabe |
|---|---|---|
| **aGTM Client** | **hier** (`sgtmClient/`) | Liefert die aGTM-Library aus, managt Session/Consent/Sources/Attribution |
| GTM Client | eigenes Repo | Liefert webGTM-Container via sGTM aus (Caching, Debug, User/Session) |
| GTAG Client | eigenes Repo | Liefert GTAG-Skripte (`G-*`/`AW-*`) aus (Caching, Consent-Mode-Info) |
| GA - Events | eigenes Repo | Empfängt GA-Events (MPv2) und leitet sie an Google weiter |

Die drei letztgenannten liegen **nicht** hier und sollen es auch nicht — sie
wurden nur temporär zur Prüfung der Signal-Interop bereitgestellt.

## Server-Sandbox ≠ Browser-ES5

Die **server-seitige** sGTM-Sandbox (in der diese Client-Templates laufen)
erlaubt `const`/`let` — anders als die **browser-/client-seitige** ES5-Restriktion
der aGTM-Library (`aGTM.js`, `cmp/*`). Unser aGTM-Client nutzt selbst 117× `const`.
Verboten bleibt in BEIDEN: `parseInt`/`parseFloat` (stattdessen
`makeInteger`/`makeNumber` per `require()`). Weitere server-Sandbox-Fallen:
kein `'k' in obj` (→ `typeof obj.k !== 'undefined'`), keine multi-line
ternaries/boolean-chains, keine Forward-Refs auf `const`-Funktions-Expressions
(Helper VOR dem Handler deklarieren).

## User-/Session-ID-Format (F / C) — wer mintet, wer reicht durch

**Nur der aGTM-Client erzeugt IDs.** Format (Default-Limiter `fipLimiter = '$'`,
aus `data.fip_limiter`):

- **Fingerprint (F):** `F{lim}1{lim}{tenant}{lim}{fingerprint}.{ts}` → z. B. `F$1$cl_planai$<hash>.<date>`
- **Cookie (C):** `C.1{lim}{tenant}{lim}{rand12}.{ms}` → z. B. `C.1$cl_planai$987654321012.1714900000000`

Schlüsseldetails:
- Das **literale `C.`-Prefix** (C-Punkt) ist Pflicht — api4sgtm `/promote`
  validiert, dass `new_user_id` mit `"C."` beginnt. Nach der Versionsziffer `1`
  wird auf `fipLimiter` umgeschaltet, damit das C-Format das F-Format spiegelt
  (visuelle Konsistenz in Cookies/Logs/Analytics). **Achtung Altbestand:** eine
  ältere Variante nutzte hartkodierte Punkte (`C.1.{tenant}.{rand}.{ms}`) — das
  ist die **Vor-Fix-Form** (Fix-Commits `c6bc23a`/`da492d8`); nicht reaktivieren.
- **Die anderen Clients (GTM, GA) erzeugen KEINE IDs** — sie lesen eine fertige
  `CONFIG.fipUserID` und reichen sie format-agnostisch an die Session-API durch
  (kein Splitten nach Trennzeichen). Darum ist die fipLimiter-Formatänderung
  **interop-sicher**: Bestands-IDs im Cookie werden wortwörtlich weitergelesen,
  neue IDs nur beim F→C-Promote gemintet.

## Consent-Signal — wie es heute fließt

- **aGTM (v1.5):** POST-Transport (`aGTM.f.xsend`) + Consent-Store-Endpoint
  `/aGTMconsent`. Diffs werden gehasht (`consent_serialize`) und nur bei Änderung
  geposted; der adaptive CMP-Poll (`consent_poll_ms`) fängt CMPs, die per direktem
  `dataLayer.push` aktualisieren.
- **GTAG Client:** liest Googles **Consent Mode** client-seitig aus
  (`window.google_tag_data.ics.entries`) — anderer Mechanismus, nicht der
  aGTM-Consent-Store.
- **`ck`-URL-Parameter = Altbestand, entfernt (2026-06-22, OE-2).** War nie in der
  Library implementiert (kein Anhängen in `gtm_load()`) und end-to-end tot: der
  GTM Client v1.4 las `getRequestQueryParameter('ck')`, nutzte den Wert aber nie.
  Ersetzt durch POST-Transport/Consent-Store. README-Doku dazu entfernt. **Nicht
  verwechseln** mit `ck_consent` (separates Consent-Config-Feld im sGTM-Client,
  `ck_consent_type`/`ck_consent_value`) — das ist ein anderes, lebendes Feature.

## Sources / Attribution

Server-seitig, **nur** im aGTM-Client: POST an die Sources-API nach dem
Session-Schritt. Der POST ist seit 2026-06-22 **sequentiell vor `buildAndSend`**
(vorher fire-and-forget), weil aus der Response das Feld `source` (z. B.
`it_webgains`) gelesen und in `sessionData.source` übernommen wird. Es fließt
über `cfg.session.source` in `aGTM.d.session.source` und ist im webGTM per
schlichter JS-Variable (Pfad `aGTM.d.session.source`) abfragbar — kein
Custom-Template nötig. Das Preset-Gate (Client + Library) akzeptiert eine
Session, die nur `source` trägt, damit der Wert auch bei degradierter
Session-API-Antwort (kein `sid`/`consent`) überlebt.

**Alle nicht-Meta-Felder** der Response werden übernommen (nicht nur `source`):
ein Blacklist-Loop (`SOURCES_META` = `ok/tenant/session_id/ts/skipped/reason`
+ reservierte Session-Keys `uid/sid/consent/…`) kopiert jedes übrige Top-Level-
Feld nach `sessionData`. `source` ist der **Affiliate-Cookie-Wert nach
Last-Cookie-Win**.

**Attribution: vom separaten GET auf den Sources-POST umgebaut (2026-06-22).**
Der extern eingebaute Attribution-**GET** (`fireAttribution`) war end-to-end tot
— er baute `…/tp/sources/…?methods=` statt den `…/tp/attribution/…`-Endpoint und
lieferte 404. Ersatz: `POST /tp/sources/{tenant}?attribution=true&method=<…>`
liefert das `attribution`-Objekt in **derselben** Response (api4sources-Contract).
Der Client wrappt es methoden-keyed nach `cfg.session.attribution` → der
**unveränderte** Library-Code (`resolveAttribution`, HYBRID-Merge,
`aGTM.d.attribution`) wird damit wieder aktiv. Schaltbar per Checkbox
`sources_attribution`, Methode per SELECT `sources_method`. **URL-Falle:**
`sources_api_url` ist die bare Base **ohne** Tenant/Query — Tenant + Query hängt
der Client an; Tenant/`?attribution=true` ins Feld zu schreiben erzeugt
`…/tp/sources/fcm/?attribution=true/fcm` (doppelter Tenant, 404).

GTM/GTAG/GA-Clients machen von Sources/Attribution nichts. SPA-Virtual-Pageviews
mitten in der Session werden nicht erfasst (offen, OE-1).

## Querverweise
- Code/Architektur: `CLAUDE.md` (§Session Feature, §Sources API), `SESSION-REDESIGN.md`.
- Offene Punkte: `docs/open-decisions.md` (OE-1 SPA-Sources, OE-6 Encryption).
- Sync-Regel Template↔Source: `CLAUDE.md` §sGTM-Client + `docs/qa/schritt-qa.md`.
