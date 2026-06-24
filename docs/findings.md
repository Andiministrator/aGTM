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
| F-03 | [S] | P1 | DL-Repeat (B5): kein Idempotenz-/Drain-/Loop-Schutz. `aGTM.d.f` wird bei jeder Tag-Ausführung komplett neu gelesen und gefeuert; kein Once-per-Page-Guard, kein In-Code-Skip von `aGTMrepeated===true`. Mehrfaches Triggern ⇒ Events vervielfacht; Trigger auf wiederholtem Event ⇒ Loop. Für das Late-Enrichment-Feature P0-kritisch (`purchase`-Doppel-Conversion). Workaround bis dahin: Trigger genau einmal feuern + `aGTMrepeated=true` ausschließen. | behoben (#13) | `gtm/tags/dl-repeat/aGTM tag - DL Repeat.tpl`: In-Code-Skip `aGTMrepeated===true` + `aGTM.d.repeatDone` Once-per-Page-Guard (setInWindow + Permission) |
| F-04 | [S] | P1 | DL-Repeat (B1): `o.d.count++` steht am Schleifenanfang (L179) vor allen `continue`-Filtern, Limit-Check direkt danach (L181). `maxEvents` zählt **geprüfte** statt **gefeuerte** Events ⇒ übersprungene (gtm.*, Black-/Nicht-Whitelist, DL-Messages) verbrauchen Budget; im Extremfall 0 Replays. Fix: zählen + prüfen unmittelbar vor `o.f.fire(ev)` (L226). | behoben (#13) | `…/aGTM tag - DL Repeat.tpl`: `count >= maxEvents`-Check + `count++` jetzt direkt vor/nach `o.f.fire(ev)` |
| F-05 | [S] | P1 | DL-Repeat (B3): Whitelist/Blacklist `wl[j].replace('*','.*')` (L198/210) — natives `String.replace(string,…)` ersetzt nur den ersten `*` ⇒ Muster wie `*view*` brechen. Zudem kein Trim der Komma-Einträge ⇒ `a, b` ergibt `^ b$`, matcht nie. Inkonsistent zu L146 (`aGTM.f.rReplace`, global). Fix: `aGTM.f.rReplace(wl[j],'\\*','.*')` + trimmen. | behoben (#13) | `…/aGTM tag - DL Repeat.tpl`: neuer `o.f.evMatch`-Helper (rReplace global `\\*`→`.*` + Trim via `^\\s+|\\s+$`) für White-/Blacklist |
| F-06 | [S] | P2 | DL-Repeat (B2): `maxEvents`-Feld-`defaultValue` ist numerisch `100` (L82), Auswertung prüft aber `typeof data.maxEvents=='string'` (L146). Liefert GTM den unveränderten Default als Number ⇒ `''→0` = unbegrenzt, gewolltes Limit 100 greift nicht. Fix: `number` mitakzeptieren bzw. `defaultValue:"100"`. GTM-Typisierung eines numerischen TEXT-Defaults verifizieren. | behoben (#13) | `…/aGTM tag - DL Repeat.tpl`: Auswertung akzeptiert `string`+`number` (`''+data.maxEvents`); `defaultValue` zusätzlich auf String `"100"` |
| F-07 | [S] | P2 | DL-Repeat (B4): Permissions-Guard ohne Wirkung — bei fehlender `access_globals`-Permission wird nur geloggt (L162–164), dann `callInWindow('aGTM.f.fire', e)` (L166) trotzdem ausgeführt. Fix: nach Warnung `return;`. Geringe Prio (Permission ist deklariert). | behoben (#13) | `…/aGTM tag - DL Repeat.tpl`: `return;` nach der Warnung in `o.f.fire` |
| F-08 | [D] | P2 | DL-Repeat Konfig-Falle (kein Bug): Defaults `gtmFired=false` **und** `agtmFired=false` ⇒ Send-Type-Checks (L184/185) überspringen mit Default-Konfig **jedes** Event, Tag tut nichts. Erwägung: einen Quelltyp defaulten oder UI-Hinweis. | behoben (#13) | `…/aGTM tag - DL Repeat.tpl`: `agtmFired` Default `true` + Hilfetexte (mind. ein Quelltyp nötig); README-Hinweis |
| F-09 | [S] | P1 | DL-Repeat Late-Enrichment-Vorbedingung (Zusatzbefund): Events in `aGTM.d.dl` tragen `aGTMts` (Zahl, gesetzt L2061, auf dem konsentierten Pfad **nicht** gelöscht). `aGTM.f.fire()` hat am Anfang den Loop-Guard `if (typeof obj.aGTMts=='number') return;` (L2049) ⇒ ein direkt aus `aGTM.d.dl` re-gefeuertes Event wird von der Library **sofort verworfen**. R1 (Replay aus `aGTM.d.dl`) muss `aGTMts` vor `fire()` strippen. (Der bestehende `aGTM.d.f`-Pfad funktioniert nur, weil dort `aGTMts` vorher gelöscht wurde, L2104.) Zudem: re-gefeuerte Events landen via L2139 erneut in `aGTM.d.dl` ⇒ R5-In-Code-Skip ist Pflicht. Permissions: Tag liest aktuell nur `aGTM.d.f` — `aGTM.d.dl`-Read + ggf. `aGTM.f.timer`/`stoptimer`-Execute + Write für Once-per-Page-Guard fehlen. | offen | `aGTM.js` L2049/2061/2104/2139; `…/aGTM tag - DL Repeat.tpl` Permissions L371–385; Code-Verifikation 2026-06-24 |
