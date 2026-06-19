# ADR-0006: Versionierung

- **Status:** akzeptiert
- **Datum:** 2026-06-19

## Kontext

aGTM ist ein versioniertes Software-Produkt (eine ausgelieferte JS-Library).
Das Repo lebt bereits einen festen Versionierungs- und Release-Ablauf (siehe
„Git Workflow" und „Build system overview" in `CLAUDE.md`). Diese ADR
dokumentiert diesen Ist-Zustand und macht ihn als Doktrin verbindlich.

## Entscheidung

**Semantic Versioning (SemVer) mit Git-Tags als autoritativer Versionsreferenz.**

- **`VERSION`-Datei = Single Source of Truth** für die Versionsnummer. Geändert
  wird `VERSION`, danach erzeugt `./build.sh` alle abgeleiteten Stellen
  (`@version`-Header und `aGTM.d.version` in `aGTM.js`, `package.json`,
  `@lastupdate`).
- **Git-Tags SIND die Versionsnummern.** Jeder Release auf `main` bekommt einen
  Tag, der zur Version passt: `v`-Präfix + SemVer, z. B. `v1.5`, `v1.4.1`. Der
  Tag ist die autoritative Referenz für einen Release.
- **Branches:**
  - `dev` — aktive Entwicklung. Alle Änderungen gehen zuerst hierhin. **Soll-Konvention:**
    `dev` trägt die Pre-Release-Version mit `-pre`-Suffix (z. B. `1.6-pre` in `VERSION`),
    sobald die Arbeit an einer neuen Version beginnt.
  - `main` — stabiler Release-Branch. Wird nur aktualisiert, wenn eine Version
    fertig und getestet ist; bekommt dann den Release-Tag.
  - Keine Feature-/Hotfix-Branches per Konvention — das Projekt hat einen
    einzelnen Maintainer.

> **Aktueller Ist-Stand (2026-06-19):** `VERSION = 1.5`, **ungetaggt** (letzter Tag
> `v1.4.1`), ohne `-pre`-Suffix. `dev` hält damit eine **release-fertige, aber bewusst
> noch nicht getaggte** `1.5` — Release/Tag/Merge nach `main` nur auf ausdrückliches
> Zeichen des Maintainers (vgl. Memory `project-v15-handover`). Die `-pre`-Soll-Konvention
> oben greift ab dem nächsten Versionszyklus; der aktuelle `dev`-Stand erfüllt sie noch nicht.

**Release-Flow:**

```
edit VERSION (z. B. 1.6-pre → 1.6)  →  ./build.sh  →  CHANGELOG.md-Eintrag
  →  commit  →  merge dev → main  →  git tag v<version>
```

`./build.sh` orchestriert Version-Injection, Safety-Check (`check-init.js`),
Minify (terser, `--ecma 5 --keep-fnames`), Base64 und das Aktualisieren des
sGTM-Client-Templates. Ein Release darf nur erfolgen, wenn die QA aus ADR-0004
grün ist (Build + Tests + Consent-Gate + ES5).

## Konsequenzen

Eine Version ist eindeutig über ihren Git-Tag identifizierbar; alle abgeleiteten
Versionsangaben stammen reproduzierbar aus einer einzigen Quelle (`VERSION`).
Der Release-Pfad ist deterministisch und für Mensch + Agent gleich.
