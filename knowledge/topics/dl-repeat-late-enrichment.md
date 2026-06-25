# DL-Repeat & Late-Enrichment (GTM-Tag + `aGTM.f.dlrepeat`)

> **Stand:** 2026-06-24. Code-Wahrheit: `README-for-Developers.md` §„DL-Repeat /
> Late-Enrichment", `gtm/tags/dl-repeat/`, `aGTM.f.dlrepeat` in `aGTM.js`. Diese
> Datei erklärt **Warum/Umfeld** und die Fallen — keine Call-Graph-Duplikate.

## Problem (Treiber: Kundenprojekt fc-moto, Shopware)

Shops pushen ein Anreicherungs-Event (z. B. `user_data` mit gehashten
Identifiern für Enhanced Conversions / Criteo) **zu spät** — nach `view_item` /
`view_cart` / `purchase`. Die Conversion-Tags feuern davor, also **ohne** die
User-Daten. Lösung muss **storage-frei** sein (kein localStorage/Cookie, reines
RAM). Idee des GTM-Teams: die früheren Events nach Eintreffen von `user_data`
**einmalig erneut** in den dataLayer schreiben (markiert `aGTMrepeated=true`),
Consumer-Tags triggern auf diese Markierung.

## Die zentrale Erkenntnis: `aGTM.d.dl` ≠ echter dataLayer

- `aGTM.d.dl` enthält **nur** Events, die durch `aGTM.f.fire()` liefen
  (Push in `aGTM.js` bei der DL-Push-Stelle). `aGTM.f.fire` ist **nicht** an
  `dataLayer.push` gekoppelt — es gibt keinen Wrapper.
- **Rohe `dataLayer.push({...})`** (das Einzige, was die meisten Shop-Plugins,
  u. a. Shopware, können) landen **nie** in `aGTM.d.dl`.
- Verifiziert am fc-moto-Test: `aGTM.d.dl` enthielt nur aGTM-Eigen-Events
  (aDOMready/aPageview/aPAGEready/aGTM_repeat_fallback), **kein** `user_data`,
  **keine** Commerce-Events.
- **Konsequenz:** Für reale Shops ist die richtige Replay-Quelle der **echte
  GTM-dataLayer** (`window[aGTM.c.gdl]`) → Tag-Option **„Live GTM dataLayer"**.
  `aGTM.d.dl` nur, wenn die Events bewusst über `aGTM.f.fire` dispatcht werden.
- **`aGTMdl: true`** markiert NUR vorbestehende dataLayer-Items, die aGTM beim
  Init erfasst (und in-place mutiert). Diese werden vom Send-Type
  **`gtmFired`** gesteuert; `aGTM.f.fire`-Events (kein `aGTMdl`) von `agtmFired`.
  (Das war ursprünglich gegenüber den Checkbox-Labels invertiert → Fix F-10.)

## Architektur-Entscheidung: Engine in die Library (v1.5)

Ein GTM-Tag läuft **nur**, wenn sein Trigger feuert; es kann den dataLayer nicht
selbst „beobachten". Das frühere Design brauchte deshalb einen **Multi-Event-
Trigger** (`aPageview|user_data|aGTM_repeat_fallback`) + ein Re-Trigger-
Kontroll-Event — verwirrend und fehleranfällig (Andi: „das mit den vielen
Triggern verwirrt").

**Lösung:** Die Engine `aGTM.f.dlrepeat(cfg)` lebt in der **Library** (`aGTM.js`),
nicht im Tag. Die Library darf `setInterval` nutzen (die **GTM-Web-Sandbox
nicht**, s. u.) und **pollt** den dataLayer selbst bis das Gate erfüllt ist
(oder Timeout). Der Tag ist nur noch ein dünner Wrapper, der `cfg` baut und
`aGTM.f.dlrepeat(cfg)` **einmal** aufruft → **ein einziger Trigger** (z. B.
*All Pages*), Tag-Auslösung **„Once per event"** (nicht „Once per page").

**Preis:** Tag↔Library-Kopplung — Tag v1.5 braucht aGTM-Library v1.5+
(Guard: `copyFromWindow('aGTM.f.dlrepeat')`, warnt + tut nichts bei älterer
Library). Finding F-14.

## GTM-Web-Sandbox-Fallen (für künftige Template-Arbeit)

Die **Web**-Custom-Template-Sandbox (`___SANDBOXED_JS_FOR_WEB_TEMPLATE___`) ist
ein restriktives ES5-Subset — **verschieden** von der sGTM-**Server**-Sandbox:

- **Kein `delete`-Operator.** Import scheitert mit `no viable alternative at
  input '... delete'`. Stattdessen Property `= undefined` setzen; wird das Event
  vorher mit `JSON.parse(JSON.stringify())` geklont, lässt `JSON.stringify`
  `undefined`-Keys weg → effektiv entfernt. (Siehe Memory `gtm-web-sandbox-no-delete`.)
- **Kein `setInterval`/`setTimeout`** in der Sandbox → Polling muss in die
  Library. (Der Grund für die Architektur oben.)
- **Kein direkter window-Zugriff** — nur `copyFromWindow`/`setInWindow`/
  `callInWindow`/`queryPermission`/`logToConsole`/`JSON`. `setInWindow`
  unterstützt verschachtelte Pfade (`setInWindow('aGTM.d.x', …)`).
- **Jeder** gelesene/geschriebene/ausgeführte globale Pfad MUSS in
  `___WEB_PERMISSIONS___` (access_globals) deklariert sein, sonst wirft die
  Sandbox. Unbekannte Param-Keys im `.tpl`-JSON können den Import brechen.
- **`___TESTS___`-Szenario-Namen dürfen keinen Punkt `.` (o. ä. Sonderzeichen)
  enthalten** — der GTM-Template-Test-Editor lehnt den Import sonst ab
  („name contains invalid character"). Also nicht `… delegates to aGTM.f.dlrepeat`.
- **`o.c.debug` muss aus der Config gesetzt werden** — ein `var o = {c:{debug:false}}`
  ohne `o.c.debug = data.debug` lässt alle `if(o.c.debug) log()` tot laufen
  (genau das war lange der Fall, Debug war nie aktiv).

## Korrektes Setup (Shop, Live-dataLayer)

- **What should be repeated?** = Everything in the dataLayer (`live`).
- **Wait for event(s) before repeating** = `user_data` (Gate).
- **Give up waiting after (ms)** = `1500` (Gast-Fallback).
- **Whitelist** = Commerce-Events (`view_item,view_cart,add_to_cart,begin_checkout,purchase`).
- **Send Events of GTM dataLayer** = an (Commerce-Events tragen `aGTMdl:true`).
- **Trigger** = ein einziger (All Pages), **Once per event**.
- **Consumer-Tags** (EC/Criteo) auf `aGTMrepeated == true`, Original-Pass ausschließen.

## Idempotenz / Sicherheit (warum kein Doppel-`purchase`)

- `aGTM.d.dlrepeatDone` (zu **Beginn** von `doReplay` gesetzt) → höchstens 1
  Replay pro Seite; `aGTM.d.dlrepeatPolling` → kein paralleler Poll.
- Jedes re-gefeuerte Event trägt `aGTMrepeated=true` und wird vom Filter
  übersprungen → kein Loop. Schleife iteriert eine **Snapshot-Länge** (vor dem
  Feuern) → angehängte Replays werden nicht re-gescannt.
- `aGTMts` (+`aGTMparams`/`gtm.uniqueEventId`) wird vor dem Re-Fire entfernt,
  sonst verwirft `fire()`s Loop-Guard (`typeof aGTMts=='number'`) das Event (F-09).
- Poll ist begrenzt (Gate → Timeout → 30s-Hard-Cap), kein Timer-Leak; Hard-Cap
  ohne Fallback gibt `dlrepeatPolling` wieder frei (F-17).

## Verwandte Findings

F-03..F-08 (Tag-Bugs v1.2), F-09 (`aGTMts`-Strip), F-10 (Send-Type-Inversion),
F-11/F-12 (Gate-/Multi-Instanz-Konfig), F-13 (Quellen-Lücke → `live`),
F-14 (Tag↔Library-Kopplung), F-15/16/17 (Re-Entrancy, clearEcom-Consent,
Polling-Release). Siehe [`../../docs/findings.md`](../../docs/findings.md).
