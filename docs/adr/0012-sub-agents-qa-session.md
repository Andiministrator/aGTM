# ADR-0012: Sub-Agenten für QA + Session-Aufgaben

- **Status:** akzeptiert
- **Datum:** 2026-06-19

## Kontext

Bei umfangreichen Recherchen, Architektur-/Doktrin-Reviews und Kritiker-QA
(siehe ADR-0004) lohnt sich das Spawnen von Sub-Agenten: Kontext-Schutz des
Haupt-Chats, parallele Arbeit, adversariale Zweitsicht. Sub-Agenten haben jedoch
**keinen Memory-Zugriff** und sehen den Haupt-Chat-Verlauf nicht — sie kennen
weder die bisherige Session noch implizit referenzierte Fakten über aGTM.

## Entscheidung

Sub-Agenten werden eingesetzt für:

- **Kritiker-QA** bei Architektur-/Doktrin-Aufgaben (z. B. Review einer Änderung
  am Session-/Consent-Flow, einer neuen CMP-Integrationsstrategie oder einer
  Anpassung am sGTM-Client-Vertrag).
- **Recherche** mit größerem Quellen-Umfang — Ergebnis kompakt ans Haupt-Chat
  zurück.
- **Konzept-Review** vor Session-/Release-Abschluss bei größeren Änderungen.

**Prompt-Regel (bindend):** Jeder Sub-Agent-Prompt muss **selbst-enthaltend**
sein. Konkret im Prompt explizit nennen:

- Pfade zu relevanten Dateien (`aGTM.js`, betroffene `cmp/*.js`,
  `sgtmClient/template.tpl`, `CLAUDE.md`, `SESSION-REDESIGN.md`, `docs/qa/…`).
- Relevante ADRs als Fakt zitiert (z. B. „Beachte ADR-0002: öffentliche
  Artefakte sind Englisch", „Beachte ADR-0004: Consent-Gate-Bruch ist P0").
- Harte technische Randbedingungen als Fakt im Prompt, **nicht** als Verweis:
  z. B. „ES5-only, GTM-Sandbox: kein `let`/`const`/Arrow/Klasse", „GTM darf nie
  ohne `gtmConsent === true` laden", „`aGTM.js` enthält bewusst keinen aktiven
  `aGTM.f.init()`-Aufruf am Ende".
- Erwartetes Output-Format (Findings + Empfehlung) und ein Längen-Cap.

**Niemals**: implizit auf Memory, frühere Conversation oder „wie besprochen"
verweisen — der Sub-Agent weiß das nicht und würde halluzinieren.

## Konsequenzen

Sub-Agent-Output ist reproduzierbar und kontext-unabhängig. Etwas mehr
Prompt-Arbeit beim Spawnen, dafür belastbare, adversarial geprüfte Ergebnisse,
ohne den Haupt-Chat-Kontext zu fluten.
