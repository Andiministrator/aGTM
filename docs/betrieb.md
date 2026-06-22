# Betriebs-Runbook — aGTM (intern)

Dieses Runbook richtet sich an Claude-Folge-Chats und Sub-Agents **ohne Memory-Zugriff**.
Es bündelt die operativen Fakten für reibungslose Session-Arbeit an aGTM. Produkt-/
Architektur-Referenz: `CLAUDE.md` (öffentlich, EN). Internes Arbeitsprotokoll:
`CLAUDE.local.md` (DE, gitignored).

aGTM ist eine **JavaScript-Library** (kein Server-Dienst, kein Container-Deploy).
Es gibt entsprechend **keinen CI-Runner und keine Produktions-Infrastruktur** in diesem
Repo — „Betrieb" heißt hier: Build, Test, Release-Disziplin und Wer-darf-was.

---

## 1. Repository & Build

| Aspekt | Details |
|---|---|
| Code-Repository | **GitHub** `github.com/Andiministrator/aGTM` (HTTPS-Remote `origin`) |
| Branches | `dev` = aktive Entwicklung · `main` = stabile Releases (ADR-0006) |
| Tags | Git-Tags **sind** die Versionsnummern (`v1.4.1`, `v1.5`, …) — autoritativ |
| Sprache | public=EN, intern=DE (ADR-0002); Code-Bezeichner immer EN |
| Sprachstandard | **ECMAScript 5 only** — `var`, keine Arrow-Functions/Klassen/Template-Literals (gilt für `aGTM.js`, `cmp/*`, sGTM-Client). GTM-Sandbox unterstützt kein ES6+ |
| Build-Toolchain | **Bun** + `bunx terser` (`--ecma 5 --keep-fnames --compress --mangle`) |
| Build-Befehl | `./build.sh` — Version injizieren → Safety-Check → minify → base64 → sGTM-Template aktualisieren |
| Versionsquelle | `VERSION` (Single Source of Truth) → `./build.sh` schreibt `@version` + `aGTM.d.version` + `package.json` |

**Build-Gate:** Nach jeder Library-/CMP-Änderung muss `./build.sh` **ohne Warnung**
durchlaufen (sonst z. B. ein aktives `aGTM.f.init()` am Dateiende → Abbruch).

**sGTM-Client-Sync (Memory `sgtm-client-source-template-sync`):** Der sandboxed Block
in `sgtmClient/template.tpl` muss **byte-identisch** zur `.js`-Source sein. `build.sh`
synct nur base64 + Version — Logik-Diffs nach jedem Edit manuell prüfen.

---

## 2. Test-Befehl

```bash
bun test
```

Tests liegen in `test/`. Browser-Globals via `test/setup.js` (auto-preload über
`bunfig.toml`). Helfer: `test/helpers.js` (`MockXHR`, `resetAGTM()`).

**Schritt-Gate (ADR-0004 / `docs/qa/schritt-qa.md`):** Bei Code-Änderungen gilt pro
Arbeitsschritt: ES5 eingehalten · `bun test` grün · `./build.sh` ohne Warnung · bei
Core-Func-Änderungen Doku-Sync (`CLAUDE.md` + `README-for-Developers.md` im selben Commit).

---

## 3. Release-Regel

Release-Flow (ADR-0006, `CLAUDE.md` §Git Workflow):

1. Entwickeln auf `dev` → testen.
2. `VERSION` setzen (Konvention: `1.6-pre` auf `dev`, `1.6` vor Release) + `CHANGELOG.md`-Eintrag.
3. `./build.sh` (ohne Warnung).
4. **`/sprint-abschluss` inkl. Kritiker-Lauf** — **kein `v*`-Release-Tag ohne** (ADR-0062 sinngemäß, `CLAUDE.local.md` §QA).
5. `dev` → `main` mergen → `git tag v<version>`.

Es gibt keine Feature-/Hotfix-Branches (Single-Author-Konvention).

**Aktueller Stand (2026-06-22):** Wir arbeiten **weiter an Version 1.5** (`VERSION` = `1.5`).
Release/Tag/Main-Merge **nur auf Andis ausdrückliches Zeichen** (Memory
`project-v15-handover`) — bis dahin nichts release-adjacent.

---

## 4. Ownership-Matrix

| Aufgabe | Claude | Nur Andi |
|---|---|---|
| Code schreiben (ES5), CMP-Files, ADRs anlegen | ✓ | |
| Board / `aboard-sync.json` mutieren (via Ops-Inbox, ADR-0067) | ✓ | |
| Findings in `docs/findings.md` eintragen | ✓ | |
| Commits auf `dev` (autonom) | ✓ | |
| `git push` auf `dev` (autonom, ohne Rückfrage) | ✓ | |
| `dev` → `main` mergen | | ✓ |
| `git push` auf `main` | | ✓ |
| `v*`-Release-Tag setzen | | ✓ |
| Release-Versions- und Zeitpunkt-Entscheidung | | ✓ |
| `git push --force` | | ✓ |
| Dateien/Branches außerhalb des Projektverzeichnisses löschen | | ✓ |
| Kundendaten / Beratungsarbeit in dieses Repo bringen | | ✗ (verboten, Memory `project-relocation-aboard`) |

**Grundregel (Andi, 2026-06-22):** Auf **`dev`** darf Claude **selbstständig committen
und pushen** — keine Rückfrage nötig. **Nur** beim **Taggen** (`v*`) oder beim
**Merge/Push nach `main`** vorher fragen. Credentials sind vorhanden (verifiziert
2026-06-22).

**Kein Kundenverzeichnis hier:** aGTM ist und bleibt öffentliches Produkt-Repo.
Kunden-/Beratungsarbeit kommt in ein separates, privates Projekt. Niemals Kundendaten hier.

---

## 5. Diagnose-Hygiene & Gotchas

- **sGTM-Sandbox** (Memory `sgtm-sandbox-*`): kein `parseInt`/`parseFloat` →
  `makeInteger`/`makeNumber` per `require()`. Parser-Bruchpunkte vermeiden: keine
  multi-line ternaries/boolean-chains, kein `'k' in obj` (stattdessen
  `typeof obj.k !== 'undefined'`), Helper **vor** dem Handler deklarieren (kein Forward-Ref).
- **`tmp/` ist gitignored** und enthält reale Arbeit (aEvents-Client/-Tag-Templates,
  Integration-Code, Backups) — nicht im git, also bei Repo-Umzügen separat sichern.
  Änderungen an diesen Artefakten trotzdem im `CHANGELOG.md` dokumentieren
  (Memory `project-aevents-templates`).
- **`internal/api/`** ist gitignored (API-Specs + Smoketest, server-seitig). Nicht
  versehentlich committen.

---

## 6. Verwandte Dokumente

| Dokument | Inhalt |
|---|---|
| `CLAUDE.md` | Öffentlicher Produkt-/Architektur-Guide (EN) — Core-Func-Callgraphs, Build, CMP, Session-Feature |
| `CLAUDE.local.md` | Internes Arbeitsprotokoll (DE) — Board-Felder, Session-Einstieg, 3-K's |
| `SESSION-REDESIGN.md` | v1.5-Session/Consent-Redesign (vor Session-Arbeit lesen) |
| `ROADMAP.md` | Roadmap v1.6 / v2.0 |
| `docs/findings.md` | Aktiver Finding-Backlog |
| `docs/open-decisions.md` | Offene Produktentscheidungen (OE-1…OE-6) |
| `docs/qa/schritt-qa.md` | Schritt-QA-Checkliste |
| `docs/qa/sprint-abschluss.md` | Sprint-Abschluss + Kritiker-Gate |
| `docs/adr/0002-*` | Projektsprache (public=EN/intern=DE) |
| `docs/adr/0005-*` | Commit-Konvention (English Conventional Commits) |
| `docs/adr/0006-*` | Versionierung (SemVer + Git-Tags) |
