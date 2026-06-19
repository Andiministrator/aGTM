# Offene Entscheidungen

Noch zu klärende Parameter und Architektur-Weichen. Sobald entschieden →
in die passende ADR (`docs/adr/`) überführen und hier entfernen (bzw. auf
„entschieden" setzen mit Verweis).

Quellen dieser Liste: `ROADMAP.md`, `SESSION-REDESIGN.md`, `CLAUDE.md`.
Format je Eintrag: `OE-N` mit Kontext / Optionen / Status / Empfehlung.

---

## OE-1 — SPA-Source-Capture (v1.6+)

- **Kontext:** Die Sources-API-Integration läuft server-seitig aus dem
  sGTM-Client und erfasst nur die Session-Quelle beim `/aGTM.js`-Request.
  SPA-Virtual-Pageviews mitten in der Session werden **nicht** erfasst
  (SESSION-REDESIGN.md §7a, CLAUDE.md §„Sources API integration").
- **Optionen:** (a) so lassen — Attribution interessiert die Session-Quelle,
  nicht In-Session-Navigation, und api4sources dedupt ohnehin auf
  Source-Fingerprint; (b) `/aGTMsources`-Browser-Proxy-Pfad am sGTM-Client +
  browser-seitiger `aGTM.f.fire()`-Hook (Spiegel des Consent-Store-Patterns).
- **Status:** offen — als v1.6+-Thema markiert.
- **Empfehlung:** zurückgestellt bis konkreter SPA-Bedarf besteht.

## OE-2 — `ck`-URL-Parameter für Consent-Signaling

- **Kontext:** In `README.md` dokumentiert (`ckServices`/`ckVendors`/`ckPurposes`,
  `ck=0|1|2` an der `gtm.js`-URL), aber **im Code nicht implementiert**
  (ROADMAP.md „Backlog / To Be Reviewed").
- **Optionen:** (a) implementieren (Anhängen in `gtm_load()`); (b) ersatzlos
  entfernen, weil der in v1.5 ergänzte POST-Transport-Layer denselben Zweck
  abdecken könnte; (c) Doku als „geplant" belassen.
- **Status:** offen — explizit „to be reviewed" (ROADMAP v1.6).
- **Empfehlung:** vor v1.6 entscheiden: ist `ck` neben POST-Transport noch nötig?

## OE-3 — Session-API Consent-Write-Endpoint-Shape

- **Kontext:** SESSION-REDESIGN.md §7 „Open / decide during Phase 1": der genaue
  Vertrag des server-seitigen Consent-Write-Endpoints (Hard-Gate). Liegt
  server-seitig (`internal/api/`, gitignored).
- **Status:** im Zuge von v1.5 weitgehend geklärt (Consent-Store + `/promote`
  verifiziert per Smoketest) — **verifizieren**, ob noch offene Punkte bestehen,
  bevor v1.5 getaggt wird.
- **Empfehlung:** beim v1.5-Release-Gate abschließend prüfen und ggf. schließen.

## OE-4 — Standalone-Mode ohne webGTM-Container

- **Kontext:** v1.5 legt das Fundament für Standalone-Nutzung (POST-Transport,
  `_noDLPush`), v2.0 will `aGTM.f.fire()` als vollständigen Event-Dispatcher
  direkt an sGTM (ROADMAP v1.6 „Further standalone mode improvements", v2.0).
- **Status:** offen — schrittweise über v1.6 → v2.0.
- **Empfehlung:** Scope pro Version festschreiben, sobald v1.6 geplant wird.

## OE-5 — `vPageview`-Event-Entfernung (v2.0, Breaking)

- **Kontext:** `vPageview` ist seit v1.4 deprecated (Ersatz `aPageview`),
  Entfernung für v2.0 geplant (ROADMAP v2.0, README.md §vPageview).
- **Status:** terminiert auf v2.0 — kein offener Streitpunkt, nur Erinnerung.
- **Empfehlung:** beim v2.0-Breaking-Change-Bundle mit erledigen.

## OE-6 — Encryption-Upgrade (XOR/Caesar → echte Krypto)

- **Kontext:** `aGTM.f.enc()` ist Base64 + Caesar-Shift (Obfuskation, keine
  echte Verschlüsselung). Server-seitige Entschlüsselung für `consent_store_enc`
  ist nicht implementiert (`/aGTMconsent` antwortet `501`); SESSION-REDESIGN.md
  §7 „Out of scope" markiert ein echtes Krypto-Upgrade als v1.6+-Thema.
- **Status:** offen — `consent_store_enc=true` bis dahin nicht nutzbar
  (server-seitiger Guard).
- **Empfehlung:** als eigenes v1.6+-Thema behandeln; bis dahin
  `consent_store_enc` aus.

---

> Bei neuen Weichen hier als `OE-N` mit Kontext/Optionen/Status/Empfehlung
> ergänzen. Entschiedenes nach `docs/adr/` überführen und Eintrag entfernen.
