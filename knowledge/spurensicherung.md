# Spurensicherung — Recherche-Protokoll

Wie Quellen erfasst werden, **bevor** und **während** extern recherchiert wird.
Ziel: Recherche reproduzierbar, jede Aussage belegt, kein Link-Rot.

## Grundregel: erst prüfen, dann recherchieren

1. **Vor jeder Web-Recherche** in [`sources-visited.md`](sources-visited.md)
   nachsehen, ob die Quelle (oder das Thema) bereits indexiert ist. Doppel-
   Recherche vermeiden.
2. Nur recherchieren, was tatsächlich offen ist.

## Während der Recherche

3. Jede genutzte Quelle direkt in `sources-visited.md` eintragen:
   `Datum | URL (oder Referenz) | Inhalt | Datei`.
   - **URL:** vollständige Adresse. Bei Nicht-Web-Quellen (WebSearch-Query,
     Live-Trace, eigene Messung, Code-Inspektion, API-Spec) den Typ in
     `*kursiv*` notieren, z. B. `*WebSearch: "..."*`, `*Live-Test ...*`,
     `*internal/api/...-spec.md*`.
   - **Inhalt:** was die Quelle belegt (knapp, prüfbar).
   - **Datei:** die `topics/<thema>.md`, in die das Wissen einfließt.
4. **Originaltext sichern** (gegen späteren Link-Rot / Paywall): relevanten
   Auszug oder Snapshot nach `sources/` ablegen (sprechender Dateiname mit
   Datum), in `sources-visited.md` als Datei referenzieren.

## Qualität der abgeleiteten Aussagen

5. Primärquelle vor Sekundärquelle (Google/Anthropic/GTM-Docs vor Blog-Posts).
   Nicht primär verifizierte Aussagen transparent als solche markieren.
6. CMP-/Browser-/GTM-Verhalten ändert sich — bei zeitkritischen Aussagen
   **Stand-Datum** in der `topics/`-Datei vermerken.
7. Widerspricht eine neue Quelle dem Bestand: nicht still überschreiben →
   Finding (`docs/findings.md`, Typ `[Q]`/`[D]`) oder ADR.

## Verhältnis zu `sources-visited.md`

`spurensicherung.md` = das **Protokoll** (wie man vorgeht).
`sources-visited.md` = der **Index** (was bisher gesichtet wurde).
Keine Parallelstruktur: alle Quellen-Einträge leben in `sources-visited.md`,
die Snapshots in `sources/`.
