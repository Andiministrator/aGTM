# ADR-0005: Commit-Konvention

- **Status:** akzeptiert
- **Datum:** 2026-06-19

## Kontext

Das Repo lebt bereits **Conventional Commits auf Englisch** (z. B. `feat: …`,
`fix(sgtm-client): …`, `docs: …`, `chore: …`). Diese ADR dokumentiert den
Ist-Zustand und macht ihn als Doktrin verbindlich — auch für unterstützende
LLM-Agenten, damit Commits stilkonsistent bleiben.

## Entscheidung

**Conventional Commits, kurz, im Imperativ, auf Englisch** (Englisch ist die
öffentliche Produktsprache, siehe ADR-0002):

```
<type>(<optional scope>): <short imperative summary>

[optional body — context, reasoning, references]
```

Gebräuchliche `<type>`:

- `feat` — neue Funktion (Library, CMP-Datei, GTM-Template, sGTM-Client-Feature)
- `fix` — Fehlerkorrektur (mit Scope wo sinnvoll, z. B. `fix(sgtm-client): …`)
- `docs` — Doku-Updates (`README.md`, `README-for-Developers.md`, `CLAUDE.md`,
  `docs/`)
- `chore` — Build-/Tooling-/Housekeeping (`build.sh`, `scripts/`, Abhängigkeiten)
- `refactor` — Umstrukturierung ohne Verhaltensänderung
- `test` — Tests hinzufügen/anpassen

`<scope>` ist optional, aber empfohlen, wenn ein klarer Teilbereich betroffen ist
(`sgtm-client`, `cmp`, `gtm`, ein CMP-Name). Versions-Bumps/Releases laufen über
den Release-Flow aus ADR-0006, nicht über eine Sonder-Commit-Form.

## Konsequenzen

Diff-Navigation, Changelog-Pflege und Release-Recaps bleiben lesbar und
konsistent mit der bereits gelebten Repo-Historie. Kein Bruch mit Bestehendem.
