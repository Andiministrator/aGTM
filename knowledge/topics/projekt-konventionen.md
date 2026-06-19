# aGTM — Projekt-Konventionen (Sub-Agent-Referenz)

> **Diese Datei ist selbst-enthaltend.** Sub-Agents haben keinen Memory-/
> Session-Zugriff — alles, was zum konventionskonformen Arbeiten an aGTM nötig
> ist, steht hier. Quelle: `CLAUDE.md`, `README.md`, `SESSION-REDESIGN.md`,
> `ROADMAP.md` (Stand 2026-06-19). Bei Code-Detail-Fragen ist `CLAUDE.md` die
> autoritative Quelle.

## Was ist aGTM

aGTM („a Galactic Tagging Modulator") ist eine öffentliche Open-Source-
JavaScript-Library, die den Google Tag Manager erst nach Vorliegen der Cookie-
Consent-Entscheidung lädt.

- **Repo:** https://github.com/Andiministrator/aGTM
- **Autor:** Andi Petzoldt <andi@petzoldt.net> (Single-Author)
- **Lizenz:** Apache 2.0
- **Bestandteile:** Core-Library `aGTM.js`; 25 CMP-Provider in `cmp/`; GTM Custom
  Templates in `gtm/` (`.tpl`); Server-side-GTM-Client in `sgtmClient/`;
  Stape.io-/sonstige Extensions in `ext/`; Tests in `test/` (Bun); interne
  API-Specs in `internal/api/` (api4sgtm, api4sources — gitignored).

## ES5-Constraint (HARTE REGEL)

**Aller Quellcode im Repo muss ECMAScript 5 sein** — nicht nur der minifizierte
Output. Grund: der Code kann in GTMs sandboxed JS-Umgebung laufen, die nur ES5
unterstützt.

- `var` — **kein** `let`/`const`.
- **Keine** Arrow-Functions, **keine** Classes, **keine** Template-Literals,
  **kein** Spread/Rest, **keine** Default-Parameter, **kein** `for...of`,
  kein optionales Chaining, kein Nullish-Coalescing.
- Gilt für: `aGTM.js`, `cmp/*.js`, den `___SANDBOXED_JS_FOR_SERVER___`-Block in
  Templates, den sGTM-Client-Quellcode.
- Minifizierung mit **terser**: `--ecma 5 --keep-fnames --compress --mangle`
  (Funktionsnamen müssen erhalten bleiben — interne Funktionen werden by name
  referenziert).

ES6+-Syntax in einem Source-File ist ein P0-Defekt.

## Build

```bash
./build.sh
```

Erzeugt alle abgeleiteten Files aus den Quellen:

| Quelle | Output |
|---|---|
| `aGTM.js` | `aGTM.min.js` |
| `cmp/cc_<name>.js` | `cmp/cc_<name>.min.js` |
| `aGTM.min.js` | `aGTM.base64` |
| `aGTM.base64` + Version | injiziert in `sgtmClient/template.tpl` |

- Voraussetzung: **Bun** (Arch/CachyOS: `sudo pacman -S bun`). Kein `npm install`
  nötig — `bunx terser` zieht terser beim ersten Lauf aus Buns Cache.
- `VERSION` ist die **einzige** Quelle der Versionsnummer. Konvention:
  `1.6-pre` auf `dev`, `1.6` vor Release-Merge. Ändern → `./build.sh`.
- **Safety-Check:** `scripts/check-init.js` bricht den Build ab, wenn am Ende von
  `aGTM.js` ein **unkommentiertes** `aGTM.f.init();` steht. Der Init-Call ist
  Aufgabe des integrierenden Entwicklers, nicht der Library — beide Vorkommen in
  `aGTM.js` sind Kommentare und werden vom Minifier entfernt.
- **sGTM-Client:** Der `___SANDBOXED_JS_FOR_SERVER___`-Block in `template.tpl`
  muss **byte-identisch** zur Quelle (`sgtmClient/src/...jsSourceCode.js`) sein —
  `build.sh` synct nur Base64 + Version, nicht den JS-Block.

Ein abbrechendes oder warnendes `./build.sh` ist blockierend.

## Tests

```bash
bun test
```

- Tests in `test/`. `bunfig.toml` preloaded `test/setup.js` (Browser-Globals
  `window`/`document`, lädt `aGTM.js` per indirektem eval ins Global-Scope).
- `test/helpers.js`: `MockXHR` + `resetAGTM()` — in jeder Test-Datei genutzt.
- Stand v1.5: ~134 Tests über ~13 Dateien.

Rotes `bun test` ist blockierend.

## Git-Workflow / Branches

- **`dev`** — aktiver Entwicklungs-Branch. Alle Änderungen zuerst hierhin.
- **`main`** — stabiler Release-Branch. Nur bei fertiger, getesteter Version.
- **Tags SIND die Versionsnummern.** Jedes Release auf `main` bekommt ein Tag
  `v<version>` (z. B. `v1.4.1`, `v1.5`), passend zu `VERSION` / `aGTM.d.version`
  und Changelog. Der Tag ist die autoritative Release-Referenz.
- **Keine** Feature-/Hotfix-Branches by convention (Single-Author).
- **Release-Flow:** auf `dev` entwickeln → testen → `VERSION` setzen + Changelog →
  `./build.sh` → committen → `dev`→`main` mergen → `git tag v<version>`.

## Commit-Konvention

- Commit-/Doku-/Report-Sprache: **Deutsch** (siehe Sprachregel).
- Commit-/Push nur, wenn ausdrücklich beauftragt. Nicht auf dem Default-Branch
  committen ohne vorher zu branchen.
- Commit-Messages enden mit:

  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

## Sprachregel: EN public / DE intern

- **Öffentliche Artefakte** (Code-Kommentare in `aGTM.js`/`cmp/`, `README.md`,
  `README-for-Developers.md`, `CHANGELOG.md`, GTM-Template-READMEs, alles, was
  im öffentlichen Repo an Endnutzer/Integratoren geht): **Englisch**.
- **Interne Doktrin** (`docs/`, `knowledge/`, QA-Checklisten, ADRs, Findings,
  Recherche, Sub-Agent-Prompts): **Deutsch**.
- Code-Bezeichner, API-Feldnamen, Zitate bleiben immer original (englisch).

## Doku-Sync-Pflicht (bei Core-Funktions-Änderungen)

Wird eine Core-Funktion geändert (`fire`, `inject`, `run_cc`, `call_cc`,
`consent_listener`, `gtm_load`, `initGTM`, `sendnaus`, `config`,
`consent_serialize`), müssen Call-Graphs/Referenztabellen in **CLAUDE.md** UND
**README-for-Developers.md** im **selben Commit** aktualisiert werden. Bei
geänderten Config-Optionen zusätzlich `README.md`. Bei Architektur-Änderungen am
Consent-/Session-Pfad zusätzlich `SESSION-REDESIGN.md`. „Outdated docs are worse
than no docs."

## QA-Gates (kurz)

- **Schritt-QA** (`docs/qa/schritt-qa.md`) — pro Arbeitsschritt: ES5-Check,
  `bun test` grün, `./build.sh` ohne Warnung, Doku-Sync.
- **Sprint-Abschluss** (`docs/qa/sprint-abschluss.md`) — Abhängigkeits-Check,
  Kritiker-Sub-Agent, **kein `v*`-Tag ohne diesen Gate**.
- **Findings** (`docs/findings.md`): `P0` = blockierend.
- **Offene Entscheidungen** in `docs/open-decisions.md`, Grundsatz-Entscheidungen
  als ADR in `docs/adr/`.

## Kern-Architektur (Orientierung, nicht autoritativ)

- Alles unter einem Objekt `aGTM`: `.c` (Config via `aGTM.f.config()`), `.d`
  (Runtime-Daten/Consent/Queues), `.f` (Funktionen), `.l` (Log-Array, dekodiert
  via `aGTM_debug.js`).
- **Event-Pfad:** `aGTM.f.fire(o)` → (Consent-Gate) → Queue `aGTM.d.f` bis
  Consent da, sonst `sendnaus()` → `window[gdl].push()`. Vor Consent gefeuerte
  Events werden als `hastyEvents` im `aGTM_ready`-Event zum Replay übergeben.
- **Consent/Inject:** `config()` → `init()` → `consent_listener()` →
  `call_cc()` → `run_cc('init'|'update')` → `inject()` → `gtm_load()`.
- **CMP:** je Provider `cmp/cc_<name>.js` mit
  `aGTM.f.consent_check = function(action){...}` (`action` = `"init"`/`"update"`,
  Rückgabe `true`/`false`, schreibt `aGTM.d.consent`).
- **Session/Consent-Store (v1.5):** server-getrieben über den sGTM-Client; CMP-
  Consent wird gegen `cfg.session.consent` gediffed und nur Änderungen an
  `consent_store_url` (`/aGTMconsent`) gePOSTet. F→C-User-ID-Promote über
  api4sgtm `/promote`. Details: `SESSION-REDESIGN.md`.
- **Sources API (api4sources):** rein server-seitiges sGTM-Client-Feature, die
  Library ist nicht beteiligt.

> Für exakte Call-Graphs, Feldsemantik und Hash-Regeln: **`CLAUDE.md`** §„Core
> Function Architecture" + §„Session Feature" und **`SESSION-REDESIGN.md`**.
