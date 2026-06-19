# ADR-0001: ADR-Format & -Prozess

- **Status:** akzeptiert
- **Datum:** 2026-06-19

## Kontext

aGTM ist eine öffentliche Open-Source-Library (Apache 2.0, Single-Author).
Grundsatzentscheidungen — z. B. Projektsprache, Commit-Konvention, QA-Vorgehen
— sollen nachvollziehbar und auffindbar sein, ohne in Commit-Messages,
`CLAUDE.md` oder im Repo-Verlauf zu verschwinden. Sie sind zugleich die
verbindliche Doktrin für den Maintainer **und** für unterstützende LLM-Agenten.

## Entscheidung

ADRs liegen als Markdown unter `docs/adr/NNNN-kurz-titel.md`, fortlaufend
nummeriert (Dateiname kebab-case). Jede ADR enthält: **Status** (vorgeschlagen
/ akzeptiert / abgelöst durch ADR-XXXX), **Datum**, **Kontext**, **Entscheidung**,
**Konsequenzen**. Kurz halten.

Eine ADR wird nicht umgeschrieben, sondern bei Bedarf durch eine neue ADR
abgelöst (die alte bleibt mit Status „abgelöst durch ADR-XXXX" erhalten, damit
die Entscheidungshistorie lesbar bleibt).

**Sprache:** ADRs sind interne Doktrin und daher **Deutsch** (siehe ADR-0002).
Technische Bezeichner, Pfade, Konfig-Schlüssel, Code-Symbole (`aGTM.f.fire`,
`consent_store_url`, `v1.5`) und zitierte englische Originale bleiben im Original.

Abgrenzung: ADRs sind ausschließlich für **Projekt-Doktrin** (wie etwas dauerhaft
gehandhabt wird). Defekte/Risiken gehören in QA-Findings (siehe ADR-0004),
technische Funktionsdoku gehört in `CLAUDE.md` und `README-for-Developers.md`.

## Konsequenzen

Entscheidungen sind dauerhaft verankert und für Mensch + LLM lesbar. Die
Doktrin ist von der laufenden Code-Doku entkoppelt und altert nicht mit ihr.
