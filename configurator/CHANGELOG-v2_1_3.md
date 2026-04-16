# aGTM Konfigurator - Changelog

## [2.1.3] - 2026-04-08

### 🎨 Design Overhaul – SEA Suite Dark Theme

Komplettes Redesign auf Basis des SEA Suite Brandings (sea-suite.de / InBiz Online Marketing GmbH & Co. KG).

#### Branding & Header
- **aGTM Logo** – Planet/Saturn-Space-Logo als Base64 inline eingebettet (Single-File Architektur bleibt erhalten)
- **Wordmark** – `aGTM Konfigurator` mit rotem Akzent auf „Konfigurator", Versionsnummer + InBiz Subline
- **Header** – Dark `#404040` mit rotem Bottom-Border `rgba(227,6,19,0.2)` und Backdrop-Blur

#### Farbsystem
- **Primärfarbe** – `#E30613` (exaktes InBiz-Rot) mit Gradient zu `#dc2626`, ersetzt bisheriges Indigo/Violett
- **Page Background** – `#202020` (SEA Suite exakt)
- **Card/Editor Background** – `#101010`
- **Elevated Surfaces** – `#404040` (Header, Nav-Bar)
- **Input Background** – `#1a1a1a`
- **Border** – `#334155` Standard, `#E30613` on Hover/Focus

#### Komponenten
- **Buttons Primary** – Rot-Gradient `linear-gradient(135deg, #E30613, #dc2626)` mit rotem Glow-Shadow
- **Buttons Secondary** – Ghost Dark `#1e293b` mit rotem Border/Text on Hover
- **Progress Bar** – Abgeschlossene Steps jetzt Rot-Gradient + Checkmark (kein Grün mehr); aktiver Step mit rotem Glow-Ring; Verbindungslinien rot für abgeschlossene Segmente
- **Cards** – `#101010` Background, `#334155` Border, roter Border + Lift-Effekt on Hover
- **Inputs / Selects** – `#1a1a1a` BG, roter Focus-Ring `rgba(227,6,19,0.15)`
- **Toasts** – Dark Backgrounds je Typ; Success & Error mit rotem `#E30613` Border-Left
- **Tooltips** – Dark `#101010` mit Border und Drop-Shadow
- **CodeMirror Editor** – Dark `#101010`, roter Cursor, dunkle Gutters
- **Scrollbar** – `#334155` Thumb, `#E30613` on Hover
- **Dropzone / Dashed Borders** – Roter Hover-State

#### Typografie
- **Inter** via Google Fonts als primäre Schriftart eingebunden
- CSS Custom Properties (`--primary`, `--bg-card`, `--border` etc.) für wartbares Theming

---

## [2.1.2] - 2026-04-08

### 🐛 Bug Fixes

- **LocalStorage speichert nichts (Hauptfehler)** – `saveToLocalStorage()` rief nur `StorageManager.save()` auf, ohne `App.currentConfig` zuvor in `StorageManager._cache.configs` zu schreiben. Bei neuen Konfigurationen war `_cache.configs` leer, bei geladenen Konfigurationen wurde nur die unveränderte Ursprungsversion persistiert. Alle Änderungen im Wizard gingen verloren.
- **`goBack()` ohne `onStepLeave()`** – Beim Zurücknavigieren wurde der aktuelle Schritt nicht gespeichert. `onLeave()` (und damit `saveToConfig()`) wurde nur bei `goNext()` und `goToStep()` aufgerufen, nicht bei `goBack()`. Eingaben gingen beim Rückwärtsnavigieren verloren, ohne in `App.currentConfig` übernommen zu werden.

### 🔧 Technische Details

- **`saveToLocalStorage()`** ruft nun `StorageManager.saveConfig(name, App.currentConfig)` auf. Der Konfigurationsname wird aus `App.currentConfigName` (bestehende Konfig) oder `basis.kundenname` (neue Konfig) abgeleitet. Bei neuen Konfigurationen wird `App.currentConfigName` nach dem ersten Speichern gesetzt, sodass nachfolgende Saves denselben Slot überschreiben.
- **`goBack()`** ruft nun `this.onStepLeave(this.currentStep)` auf, bevor zum vorherigen Schritt navigiert wird. Der Rückweg wird dabei nicht durch fehlende Pflichtfelder blockiert.

---

## [2.1.1] - 2025-12-11

### 🎉 Produktionsrelease

Diese Version ist die erste stabile Produktionsversion des komplett neu entwickelten aGTM Konfigurators.

### ✨ Neue Features (seit v1.x)

- **Modulare Single-File Architektur** – Komplett neu entwickelt mit sauberem JavaScript-Moduldesign
- **8-Schritt Wizard** – Strukturierte Konfiguration: Laden → Basis → CMP → GTM → Consent → Features → Callbacks → Export
- **23 CMP-Integrationen** – Cookiebot, Usercentrics (v2 + v3), Borlabs, OneTrust, Consentmanager und viele mehr
- **STAPE.io Integration** – Server-side GTM mit Custom Loader Support
- **Multi-Container Support** – Bis zu 10 GTM-Container mit individuellen Consent-Bedingungen
- **Custom CMP Support** – Eigene consent_check Funktionen mit CodeMirror Editor
- **Live-Vorschau** – Echtzeit-Vorschau der Consent-Logik
- **Dark Mode** – Automatische Erkennung + manueller Toggle
- **LocalStorage Persistenz** – Konfigurationen werden automatisch gespeichert
- **Share-Links** – Konfigurationen per URL teilen
- **GitHub API Integration** – Automatisches Laden der aktuellen aGTM Library Version

### 🐛 Bug Fixes (v2.0 → v2.1)

- **STAPE.io Doppel-Konfiguration** – Export enthielt zwei STAPE.io Config-Blöcke
- **`var var` Duplikat** – Doppelte var-Deklaration im STAPE.io Helper
- **Features nicht gespeichert** – Beim Navigieren zwischen Schritten gingen Feature-Einstellungen verloren
- **STAPE.io Doppel-Quote** – User-Input mit Quotes führte zu Syntax-Fehlern im Export
- **Syntax-Highlighting Bug** – Editor zeigte falschen Kommentar-Text ("Initialization") an mehreren Stellen

### 🔧 Technische Verbesserungen

- **Input Sanitization** – Alle STAPE.io Werte werden von Quotes bereinigt
- **Vereinfachtes Syntax-Highlighting** – Robustere Implementierung ohne Tokenization
- **onStepLeave Handler** – Zuverlässiges Speichern beim Schritt-Wechsel
- **Regex-basierte Duplikat-Entfernung** – Entfernt GitHub-Beispielkonfiguration aus Helper-Code

### 📦 Export-Formate

- **ES2015** – Lesbarer Code mit Kommentaren
- **Minified** – Komprimiert via Terser (Browser-basiert)

### 🔒 Unterstützte Features

| Feature | Beschreibung |
|---------|--------------|
| debug | Optout-Cookie ignorieren |
| sendConsentEvent | aGTM_consent Event feuern |
| dlStateEvents | DOMloaded/PAGEready Events |
| aPageview | Pageview Event nach Load |
| vPageviews | Virtual Pageviews bei History Change |
| useListener | Event-Listener statt Timer |
| consent_events | Custom Consent-Event Namen |
| gdl | DataLayer Name |
| dlOrgPush | DataLayer Push-Handling |
| nonce | CSP Nonce Support |
| ckServices/ckPurposes/ckVendors | sGTM Consent Parameter |

### 📋 Systemanforderungen

- Moderner Browser (Chrome, Firefox, Safari, Edge)
- JavaScript aktiviert
- Keine Server-Installation nötig (Single-File HTML)

---

## [2.0.0] - 2025-12-10

### Initial Development Release

Komplette Neuentwicklung des aGTM Konfigurators mit:
- Wizard-basierter Benutzerführung
- Moderner UI mit Tailwind CSS
- Erweiterte CMP-Unterstützung
- STAPE.io Integration

---

## [1.x] - Legacy

Ursprüngliche Version des aGTM Konfigurators.
Nicht mehr unterstützt – Migration auf v2.1 empfohlen.
