# Findings

Defekte, Risiken und offene technische Punkte aus der Arbeit an aGTM.
Grundsatz-Entscheidungen gehören nach `docs/adr/`, noch zu klärende Parameter
nach `docs/open-decisions.md`.

## Legende

**Typ:**
`[S]` Schritt-/Technik-Defekt (Bug in `aGTM.js`/`cmp/`/sGTM-Client, ES6-Leak,
falscher Consent-/Hash-Pfad, Build-Fehler) ·
`[K]` Konzept-/Architektur-Risiko (Consent-Flow, Session-/Promote-Design,
Standalone-Mode, Sicherheit/Datenschutz) ·
`[D]` Doku-Inkonsistenz (CLAUDE.md / README.md / README-for-Developers.md /
SESSION-REDESIGN.md widersprechen Code oder sich gegenseitig) ·
`[Q]` Quellen-/Aktualitäts-Lücke (CMP-Verhalten geändert, `sources-visited.md`
veraltet, externe API-Spec gedriftet) ·
`[T]` Test-Lücke (fehlende Abdeckung für einen Pfad)

**Priorität:**
`P0` blockierend (Karten-Abschluss / Release) ·
`P1` wichtig ·
`P2` nachrangig

**Status:** offen · in Arbeit · behoben · akzeptiert (bewusst in Kauf genommen)

| ID | Typ | Prio | Beschreibung | Status | Bezug |
|----|-----|------|--------------|--------|-------|
| F-01 | [S] | P2 | `sources_method` wird im Client-Code nicht gegen die 5-Methoden-Whitelist validiert. SELECT erzwingt es im UI; nur alte/überschriebene Config könnte einen Fremdwert tragen → Attribution läge unter falschem Key, Tag liest leeres Objekt. | akzeptiert (2026-06-22) | sgtmClient/src `fireSources`; Kritiker-Review |
| F-02 | [S] | P2 | Leeres `attribution {}` aus der Sources-API erzeugt einen toten `aGTM.d.attribution[method]`-Eintrag (fail-soft, kein Defekt, nur Rauschen). Optionales Gating auf nicht-leeres Objekt. | akzeptiert (2026-06-22) | sgtmClient/src `fireSources`; Kritiker-Review |
