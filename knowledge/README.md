# Wissensbasis (`knowledge/`)

Strukturierte, recherchierte Doku zum aGTM-Ökosystem. **Single Source of Truth**
für Domänen-Wissen, das über die Code-Doku (CLAUDE.md / README*.md) hinausgeht
und das Sub-Agents als selbst-enthaltenden Kontext bekommen.

> **Status:** Gerüst angelegt. Die thematischen Wissensdateien
> (`topics/`) werden **schrittweise befüllt** — diese README beschreibt nur die
> Doktrin und Struktur.

## Zweck

- Wiederverwendbares Fach- und Architektur-Wissen ablegen, das nicht in den
  Code-Header gehört (Consent-Flows, CMP-Eigenheiten, GTM/sGTM-Mechanik,
  Measurement Protocols, ES5-Sandbox-Fallen, Projekt-Konventionen).
- Sub-Agents (die **keinen** Memory-/Session-Zugriff haben) eine zitierbare,
  selbst-enthaltene Referenz geben — vor allem
  [`topics/projekt-konventionen.md`](topics/projekt-konventionen.md).
- Recherche reproduzierbar machen: jede externe Aussage ist in
  [`sources-visited.md`](sources-visited.md) mit Datum + Zieldatei belegt.

## Struktur

```
knowledge/
├── README.md            # diese Datei — Doktrin
├── spurensicherung.md   # Recherche-Protokoll (wie Quellen erfasst werden)
├── sources-visited.md   # Quellenindex: Datum | URL | Inhalt | Datei
├── sources/             # abgelegte Quell-Snapshots (Originaltext/PDF/HTML)
└── topics/              # thematische Wissensdateien (eine Datei pro Thema)
    ├── projekt-konventionen.md              # Sub-Agent-Kontext-Referenz
    ├── sgtm-client-familie-und-signale.md   # sGTM-Client-Familie + Consent/Session/Source-Interop
    └── dl-repeat-late-enrichment.md         # DL-Repeat-Tag + aGTM.f.dlrepeat, GTM-Web-Sandbox-Fallen
```

## Wie ein Thema abgelegt wird

1. **Vor externer Recherche** prüfen, ob die Quelle schon in
   `sources-visited.md` steht (siehe `spurensicherung.md`).
2. Wissen in eine Datei `topics/<thema>.md` schreiben — kurze, klare Aussagen,
   keine Werbeprosa. Wo Verhalten zwischen CMPs / GTM-Modi / Browsern differiert:
   explizit ausweisen.
3. Jede nicht-triviale Aussage mit Quelle belegen → Eintrag in
   `sources-visited.md` (Datum, URL/Referenz, Inhalt, Zieldatei). Originaltext-
   Snapshots nach `sources/` (gegen Link-Rot).
4. Bei sich ändernden/sehr neuen Aussagen: **Stand-Datum** in der Datei vermerken.
5. Code-Wahrheit bleibt in CLAUDE.md / README-for-Developers.md / SESSION-REDESIGN.md.
   `knowledge/` erklärt das **Warum** und das **Umfeld**, dupliziert keine
   Call-Graphs — bei Überschneidung verlinken statt kopieren.

## Sprache

Interne Wissensbasis-Doktrin ist **Deutsch** (siehe
`topics/projekt-konventionen.md` zur EN-public/DE-intern-Regel). Code-Bezeichner,
API-Feldnamen und Zitate bleiben original (englisch).

## Querverweise

- Projekt-Konventionen für Sub-Agents: [`topics/projekt-konventionen.md`](topics/projekt-konventionen.md)
- sGTM-Client-Familie & Signal-Interop: [`topics/sgtm-client-familie-und-signale.md`](topics/sgtm-client-familie-und-signale.md)
- DL-Repeat & Late-Enrichment (+ GTM-Web-Sandbox-Fallen): [`topics/dl-repeat-late-enrichment.md`](topics/dl-repeat-late-enrichment.md)
- Recherche-Protokoll: [`spurensicherung.md`](spurensicherung.md)
- Quellenindex: [`sources-visited.md`](sources-visited.md)
- QA-Doktrin: [`../docs/qa/schritt-qa.md`](../docs/qa/schritt-qa.md), [`../docs/qa/sprint-abschluss.md`](../docs/qa/sprint-abschluss.md)
- Glossar: [`../docs/glossar.md`](../docs/glossar.md)
