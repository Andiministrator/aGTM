# Schritt-QA (technische Validierung pro Arbeitsschritt)

Bindend vor jeder Karten-„Erledigt"-Markierung und vor jedem Commit, der
Library-Code (`aGTM.js`, `cmp/*.js`), GTM-Templates (`gtm/`), sGTM-Client
(`sgtmClient/`) oder Extensions (`ext/`) berührt.

## Allgemein (jeder Schritt)

- [ ] **ES5-Check:** Keine ES6+-Syntax in `aGTM.js`, `cmp/*.js`, im
      `___SANDBOXED_JS_FOR_SERVER___`-Block von Templates oder im sGTM-Client-
      Quellcode. Kein `let`/`const`, keine Arrow-Functions, keine Classes, keine
      Template-Literals, kein Spread/Rest, kein Default-Parameter. Nur `var`.
      (CLAUDE.md §„Minification rules" — gilt für **alle** Files im Repo, nicht
      nur den minifizierten Output, weil der Code in der GTM-Sandbox laufen kann.)
- [ ] **`bun test` grün:** Komplette Test-Suite läuft ohne Fehler durch.
      Tests liegen in `test/`, Browser-Globals via `test/setup.js`
      (autoloaded durch `bunfig.toml`).
- [ ] **`./build.sh` ohne Warnung/Abbruch:** Build erzeugt alle abgeleiteten
      Files (`aGTM.min.js`, `cmp/*.min.js`, `aGTM.base64`, sGTM-Template-Sync)
      sauber. Insbesondere darf der `check-init.js`-Safety-Check NICHT anschlagen
      (kein unkommentiertes `aGTM.f.init();` am Ende von `aGTM.js`).
- [ ] **Quellen für neue fachliche Aussagen** in `knowledge/sources-visited.md`
      mit Abrufdatum + Zieldatei eingetragen (siehe `knowledge/spurensicherung.md`).
- [ ] **Keine Widersprüche** zu bestehenden `knowledge/`-Dateien — bei Konflikt:
      ADR (`docs/adr/`) oder Update der betroffenen Datei.
- [ ] **Verweise (Links, Pfade)** gegengeprüft, gehen nicht ins Leere.

## Library-Core-Änderung (`aGTM.js`)

Greift bei jeder Änderung an einer Core-Funktion (`fire`, `inject`, `run_cc`,
`call_cc`, `consent_listener`, `gtm_load`, `initGTM`, `sendnaus`,
`config`, `consent_serialize`, …).

- [ ] **Doku-Sync (pflichtig):** Call-Graphs und Referenztabellen in **CLAUDE.md**
      §„Core Function Architecture" UND in **README-for-Developers.md** im
      **selben Commit** aktualisiert. (CLAUDE.md: „outdated docs are worse than
      no docs".)
- [ ] **Config-Option neu/geändert:** Tabelle in CLAUDE.md (§„Session Feature" /
      Data stores) + Options-Doku in **README.md** synchron.
- [ ] **Consent-Pfad berührt:** `SESSION-REDESIGN.md` auf Konsistenz geprüft —
      ist die dortige Architektur-Beschreibung noch korrekt? Falls eine
      Architektur-Entscheidung sich ändert: dort nachziehen.
- [ ] **Neuer/geänderter `aGTM.d.consent`-Befüllungspfad:** Hash-Determinismus
      geprüft — schreibt keine CMP/kein Pfad einen pro-Page-Load wechselnden
      Wert (Timestamp/Nonce) in `aGTM.d.consent`, der bei jedem `run_cc` einen
      Phantom-Diff erzeugen würde (SESSION-REDESIGN.md §4, CMP-Non-Determinismus).

## CMP-Datei (`cmp/cc_<name>.js`)

- [ ] `aGTM.f.consent_check = function(action) { ... }`-Signatur eingehalten,
      gibt `true`/`false` zurück, schreibt Ergebnis nach `aGTM.d.consent`.
- [ ] `'init'`-Short-Circuit bei `hasResponse === true` vorhanden
      (load-bearing für den `preset_with_consent`-Pfad).
- [ ] Schreibt KEINEN nicht-deterministischen Wert in `aGTM.d.consent`
      (siehe Hash-Determinismus oben).
- [ ] Min-Version mit gebaut (`./build.sh`), Funktionsnamen erhalten
      (`--keep-fnames`).

## GTM Custom Template (`gtm/`)

- [ ] `.tpl`-Datei und zugehörige `README-gtm-tag-<name>.md` synchron.
- [ ] Sandbox-JS ist ES5 (GTM-Sandbox erzwingt das ohnehin).
- [ ] Dateibenennung mit Leerzeichen (`aGTM tag - <Name>.tpl`), nicht Bindestriche.

## sGTM-Client (`sgtmClient/`)

- [ ] `___SANDBOXED_JS_FOR_SERVER___`-Block in `template.tpl` **byte-identisch**
      zur Quelle (`src/...jsSourceCode.js`) — `build.sh` synct nur Base64 +
      Version, nicht den JS-Block (SESSION-REDESIGN.md §7b).
- [ ] Template-Optionen neu/geändert → in CLAUDE.md (§Sources/Session) +
      `sgtmClient/README.md` dokumentiert.
- [ ] Bei Änderungen an Session-/Promote-/Sources-/Consent-Store-Verträgen:
      Smoketest-Schritte in `internal/api/` betroffen? (gitignored — falls
      lokal vorhanden, durchlaufen lassen.)

## VERSION / Release-Vorbereitung

- [ ] `VERSION` nur bewusst geändert (`1.6-pre` auf `dev`, `1.6` vor Release-Merge).
- [ ] `CHANGELOG.md`-Eintrag ergänzt, wenn user-sichtbares Verhalten sich ändert.

## Blocker-Regel

`P0`-Findings sind **immer** blockierend. Kein Karten-Abschluss mit offenem P0,
kein Commit auf `dev` mit rotem `bun test` oder abbrechendem `./build.sh`.
P1 bewusst akzeptieren oder beheben.
