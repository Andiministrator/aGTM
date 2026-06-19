# ADR-0002: Projektsprache — Englisch öffentlich, Deutsch intern

- **Status:** akzeptiert
- **Datum:** 2026-06-19

## Kontext

aGTM ist eine **öffentliche** Open-Source-Library auf GitHub
(github.com/Andiministrator/aGTM, Apache 2.0). Das Repo hat über seine
Geschichte **Englisch als Produktsprache etabliert**: Code und Code-Kommentare,
`README.md`, `README-for-Developers.md`, `CLAUDE.md`, die GTM-Template-Doku und
die Commit-Messages (z. B. `fix(sgtm-client): …`, `feat: …`) sind englisch.
Englisch ist hier die richtige Wahl, weil die Zielgruppe (Integratoren,
Contributor, andere Entwickler weltweit) international ist.

Der Maintainer (Andi) arbeitet jedoch persönlich auf Deutsch — sein globaler
Default für die LLM-Zusammenarbeit ist Deutsch. Ohne klare Regel kollidieren
diese beiden Welten.

## Entscheidung

Sprache wird nach **Sichtbarkeit** getrennt:

**Englisch — alle öffentlichen Artefakte** (alles, was ein externer Leser des
Repos sieht):
- Quellcode und Code-Kommentare (`aGTM.js`, `cmp/*.js`, `gtm/**`, `sgtmClient/**`)
- `README.md`, `README-for-Developers.md`, `CHANGELOG.md`, `ROADMAP.md`
- `CLAUDE.md` (liegt im öffentlichen Repo und richtet sich auch an externe Agenten)
- Commit-Messages (siehe ADR-0005), Tag-Namen, Issue-/PR-Texte
- Produkt- und Integrations-Dokumentation

**Deutsch — interne Doktrin** (Maintainer-/Agenten-interne Steuerung):
- ADRs (`docs/adr/`)
- QA-Dokumente und -Findings (`docs/qa/`, siehe ADR-0004)
- Glossar, Recherche-Notizen, Claude-Workflow-Notizen
- `CLAUDE.local.md` — das interne Claude-Code-Arbeitsprotokoll (Board-/QA-/Session-
  Workflow). Liegt **gitignored** im Projektwurzelverzeichnis und wird von Claude Code
  automatisch zusätzlich zur öffentlichen `CLAUDE.md` gelesen. So bleibt `CLAUDE.md`
  rein englisch (öffentlich), die interne Steuerung deutsch und unveröffentlicht.
- die laufende Chat-Kommunikation mit dem Maintainer

`README.de.md` ist eine bewusste deutschsprachige **Produkt**-Übersetzung für
deutschsprachige Nutzer und zählt damit zu den öffentlichen Artefakten (Englisch
bleibt die Leitfassung).

In englischen Artefakten bleiben technische Bezeichner ohnehin englisch; in
deutschen internen Dokumenten bleiben Code-Symbole, Pfade, Konfig-Schlüssel und
zitierte englische Originale unverändert (z. B. `consent_store_url`,
`session_status = 'preset_with_consent'`).

## Konsequenzen

Das öffentliche Bild des Projekts bleibt konsistent englisch und für die
internationale Zielgruppe zugänglich. Die interne Steuerung läuft in der
Arbeitssprache des Maintainers, ohne die öffentliche Fassade zu verwässern.
Bei jedem neuen Artefakt ist die Frage „sieht das ein externer Repo-Leser?" der
Sprach-Entscheider.
