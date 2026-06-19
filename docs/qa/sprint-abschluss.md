# Sprint-Abschluss

Ein Sprint gilt erst als abgeschlossen, wenn **alle** Punkte erfüllt sind.
Kein neuer Sprint beginnt mit offenem P0. Insbesondere: **kein `v*`-Git-Tag
ohne diesen Gate** (siehe Release-Gate unten).

## Checkliste

- [ ] Alle Karten des Sprints in „Erledigt", Akzeptanzkriterien erfüllt.
- [ ] Schritt-QA (`docs/qa/schritt-qa.md`) je Karte grün — insbesondere
      ES5-Check, `bun test` grün, `./build.sh` ohne Warnung, Doku-Sync.
- [ ] **`bun test` über die ganze Suite grün** (nicht nur die berührten Files).
- [ ] **`./build.sh` läuft sauber durch** und die abgeleiteten Files
      (`aGTM.min.js`, `cmp/*.min.js`, `aGTM.base64`, `sgtmClient/template.tpl`)
      sind aktuell und committed.

- [ ] **Abhängigkeits-Check:** Berührt der Sprint eine Core-Funktion, eine
      Config-Option, einen Consent-/Session-/Sources-Vertrag oder ein
      Wire-Format? Dann alle abhängigen Stellen geprüft und nachgezogen:
    - `aGTM.js` ↔ `CLAUDE.md` (Call-Graphs, Data-Stores)
    - `aGTM.js` ↔ `README-for-Developers.md` (Entwickler-Referenz)
    - Config-Optionen ↔ `README.md` (öffentliche Options-Doku)
    - Architektur ↔ `SESSION-REDESIGN.md`
    - `cmp/*.js` ↔ Min-Versionen (`./build.sh`)
    - sGTM-Client `src/...jsSourceCode.js` ↔ `template.tpl` (Byte-Identität
      des Sandbox-Blocks) ↔ `sgtmClient/README.md`
    - Session/Promote/Sources/Consent-Store-Verträge ↔ `internal/api/`-Specs +
      Smoketest (gitignored — falls lokal vorhanden).

- [ ] **Kritiker-Sub-Agent** durchlaufen, wo Architektur/Risiko/Sicherheit
      betroffen ist (neue Consent-Flow-Logik, neuer CMP-Pfad, Promote-/
      Sources-/Transport-Änderung, neue Config-Doktrin, ES5-Sandbox-Grenzfälle).
      Sub-Agent ohne Memory → Prompt **selbst-enthaltend**, mit Verweis auf
      `knowledge/topics/projekt-konventionen.md` (ES5-Constraint, Build, Tests,
      Sprachregel, Commit-/Branch-Konvention). Befunde in `docs/findings.md`
      eintragen oder direkt korrigieren.

- [ ] Keine offenen `P0`-Findings. `P1` bewusst akzeptiert oder behoben.

- [ ] **Wissens-Pflege:**
    - Erkenntnisse in die passende `knowledge/topics/<thema>.md` eingearbeitet.
    - `knowledge/sources-visited.md` aktuell (neue Quellen + Abrufdatum + Datei).
    - Bei sich ändernden/sehr neuen Aussagen: Stand-Datum in der Datei vermerkt.

- [ ] Neue/abgelöste Grundsatz-Entscheidungen als ADR (`docs/adr/`); geklärte
      Parameter aus `docs/open-decisions.md` entfernt/überführt.

- [ ] **Changelog:** `CHANGELOG.md` für den Sprint-Umfang aktualisiert,
      wo user-sichtbares Verhalten betroffen ist.

- [ ] Commit-Konvention eingehalten (siehe
      `knowledge/topics/projekt-konventionen.md`).

## Release-Gate (`v*`-Tag)

aGTM ist ein versioniertes Software-Produkt: Git-Tags **sind** die
Versionsnummern (CLAUDE.md §„Git Workflow"). Ein Release-Tag (`v1.6`, `v1.6.1`, …)
darf **nur** gesetzt werden, wenn dieser Sprint-Abschluss-Gate komplett erfüllt
ist. Reihenfolge:

1. Diese Checkliste vollständig grün (inkl. Kritiker-Sub-Agent + Abhängigkeits-Check).
2. `VERSION` von `<x.y>-pre` auf `<x.y>` gesetzt → `./build.sh` → committed.
3. `CHANGELOG.md`-Release-Abschnitt finalisiert.
4. `dev` → `main` gemergt.
5. **Erst dann:** `git tag v<version>` auf `main`.

**Kein `v*`-Tag ohne abgeschlossenen Sprint-Abschluss-Gate.** Der Tag ist die
autoritative Release-Referenz — ein Tag auf unvalidiertem Stand ist nicht
rückgängig zu machen, ohne öffentlich zu wirken (Single-Author-OSS, Apache 2.0).
