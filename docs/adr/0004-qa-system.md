# ADR-0004: QA-System

- **Status:** akzeptiert
- **Datum:** 2026-06-19

## Kontext

aGTM ist eine öffentliche Library, die in fremde Produktivumgebungen geladen
wird und dort über das Laden von Google Tag Manager **nach** der Consent-
Entscheidung entscheidet. Fehler sind nicht trivial reversibel und teilweise
heikel:
- Eine Consent-Regression kann GTM **vor** der Einwilligung laden →
  Datenschutz-/Rechtsproblem beim Integrator.
- Die ES5-Beschränkung (GTM-Sandbox) ist leicht versehentlich zu verletzen
  (`let`/`const`/Arrow-Funktion) und bricht erst zur Laufzeit in der Sandbox.
- Die Code-Doku in `CLAUDE.md` und `README-for-Developers.md` ist die primäre
  Wahrheitsquelle für künftige Agenten — veraltete Call-Graphs sind schädlich.

## Entscheidung

Mehrstufige QA, dokumentiert unter `docs/qa/`:

1. **Schritt-QA** (immer, vor jeder „erledigt"-Markierung einer Aufgabe und vor
   einem Release): Checkliste in `docs/qa/schritt-qa.md`. Mindestens:
   - **ES5-Konformität** aller geänderten `*.js`-Quellen (kein `let`/`const`,
     keine Arrow-Funktionen/Klassen/Template-Literals).
   - **Build grün:** `./build.sh` läuft fehlerfrei durch (inkl. `check-init.js`:
     kein aktiver `aGTM.f.init()` am Dateiende) und `bun test` ist grün.
   - **Consent-Gate intakt:** kein Pfad lädt GTM ohne `gtmConsent === true`
     bzw. ohne explizites `_noConsent`/`cmp:'none'`/iframe-Sonderfall.
   - **Doku-Synchronität:** bei Änderung einer Kernfunktion (`fire`, `inject`,
     `run_cc`, `call_cc`, `consent_listener`, `gtm_load`, `initGTM`, `sendnaus`)
     sind die Call-Graphs in `CLAUDE.md` **und** `README-for-Developers.md` im
     selben Commit aktualisiert.
   - **Derivate gebaut:** `aGTM.min.js`, `aGTM.base64`, betroffene
     `cmp/*.min.js`, `sgtmClient/template.tpl` sind aus den Quellen neu erzeugt.

2. **Kritiker-QA** (bei Architektur-/Doktrin-Entscheidungen, z. B. Änderung am
   Session-/Consent-Flow, neue CMP-Integrationsstrategie): ein **Sub-Agent**
   prüft Konzept und Risiken adversarial. Sub-Agenten haben **keinen Memory-
   Zugriff** → ihre Prompts müssen alle relevanten Regeln, Pfade und Fakten
   explizit enthalten (siehe ADR-0012).

3. **Sprint-/Session-Abschluss-QA:** vor dem Abschluss einer Arbeitssession bzw.
   eines Releases wird `docs/qa/sprint-abschluss.md` durchlaufen
   (Konsistenz-Check, offene Findings gesichtet, Version/Changelog konsistent —
   siehe ADR-0006).

**Blocker-Regeln:** Schritt-QA ist immer bindend. Ein gebrochenes Consent-Gate,
eine ES5-Verletzung oder ein roter Build/Test sind **P0** und blockieren sowohl
den Abschluss der Aufgabe als auch jeden Release. Findings werden festgehalten
(`docs/qa/`-Findings bzw. ein Findings-Dokument) und nicht stillschweigend
übergangen.

## Konsequenzen

Heikle Fehler (Consent vor Einwilligung, ES5-Bruch in der Sandbox, veraltete
Doku) werden vor der Veröffentlichung abgefangen. Der zusätzliche QA-Aufwand ist
günstig gegenüber dem Schaden in fremden Produktivumgebungen.
