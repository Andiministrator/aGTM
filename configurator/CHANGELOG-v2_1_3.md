# aGTM Configurator – Changelog

## [2.1.3] - 2026-04-08

### 🎨 Design overhaul – SEA Suite dark theme

Complete redesign based on the SEA Suite branding (sea-suite.de / InBiz Online Marketing GmbH & Co. KG).

#### Branding & header
- **aGTM logo** – planet/Saturn space logo embedded inline as Base64 (the single-file architecture is preserved)
- **Wordmark** – `aGTM Konfigurator` with a red accent on "Konfigurator", version number + InBiz subline
- **Header** – dark `#404040` with a red bottom border `rgba(227,6,19,0.2)` and backdrop blur

#### Colour system
- **Primary colour** – `#E30613` (exact InBiz red) with a gradient to `#dc2626`, replacing the previous indigo/violet
- **Page background** – `#202020` (exact SEA Suite value)
- **Card/editor background** – `#101010`
- **Elevated surfaces** – `#404040` (header, nav bar)
- **Input background** – `#1a1a1a`
- **Border** – `#334155` by default, `#E30613` on hover/focus

#### Components
- **Primary buttons** – red gradient `linear-gradient(135deg, #E30613, #dc2626)` with a red glow shadow
- **Secondary buttons** – ghost dark `#1e293b` with a red border/text on hover
- **Progress bar** – completed steps are now a red gradient + checkmark (no more green); the active step has a red glow ring; connecting lines are red for completed segments
- **Cards** – `#101010` background, `#334155` border, red border + lift effect on hover
- **Inputs / selects** – `#1a1a1a` background, red focus ring `rgba(227,6,19,0.15)`
- **Toasts** – dark backgrounds per type; success & error with a red `#E30613` left border
- **Tooltips** – dark `#101010` with a border and drop shadow
- **CodeMirror editor** – dark `#101010`, red cursor, dark gutters
- **Scrollbar** – `#334155` thumb, `#E30613` on hover
- **Dropzone / dashed borders** – red hover state

#### Typography
- **Inter** added via Google Fonts as the primary typeface
- CSS custom properties (`--primary`, `--bg-card`, `--border` etc.) for maintainable theming

---

## [2.1.2] - 2026-04-08

### 🐛 Bug fixes

- **Local storage saved nothing (the main bug)** – `saveToLocalStorage()` only called `StorageManager.save()` without first writing `App.currentConfig` into `StorageManager._cache.configs`. For a new configuration `_cache.configs` was empty; for a loaded one only the unchanged original was persisted. Every change made in the wizard was lost.
- **`goBack()` without `onStepLeave()`** – navigating backwards did not save the current step. `onLeave()` (and therefore `saveToConfig()`) ran only on `goNext()` and `goToStep()`, not on `goBack()`. Input was lost when navigating back, without ever reaching `App.currentConfig`.

### 🔧 Technical details

- **`saveToLocalStorage()`** now calls `StorageManager.saveConfig(name, App.currentConfig)`. The configuration name comes from `App.currentConfigName` (existing config) or `basis.kundenname` (new config). For a new configuration `App.currentConfigName` is set after the first save, so subsequent saves overwrite the same slot.
- **`goBack()`** now calls `this.onStepLeave(this.currentStep)` before navigating to the previous step. Going back is not blocked by missing required fields.

---

## [2.1.1] - 2025-12-11

### 🎉 Production release

This is the first stable production version of the completely rewritten aGTM configurator.

### ✨ New features (since v1.x)

- **Modular single-file architecture** – rewritten from scratch with a clean JavaScript module design
- **8-step wizard** – structured configuration: load → basics → CMP → GTM → consent → features → callbacks → export
- **23 CMP integrations** – Cookiebot, Usercentrics (v2 + v3), Borlabs, OneTrust, Consentmanager and many more
- **STAPE.io integration** – server-side GTM with custom loader support
- **Multi-container support** – up to 10 GTM containers with individual consent conditions
- **Custom CMP support** – your own `consent_check` functions with a CodeMirror editor
- **Live preview** – real-time preview of the consent logic
- **Dark mode** – automatic detection + manual toggle
- **Local-storage persistence** – configurations are saved automatically
- **Share links** – share configurations via URL
- **GitHub API integration** – loads the current aGTM library version automatically

### 🐛 Bug fixes (v2.0 → v2.1)

- **STAPE.io duplicate configuration** – the export contained two STAPE.io config blocks
- **`var var` duplicate** – duplicated `var` declaration in the STAPE.io helper
- **Features not saved** – feature settings were lost when navigating between steps
- **STAPE.io double quote** – user input containing quotes produced syntax errors in the export
- **Syntax-highlighting bug** – the editor showed the wrong comment text ("Initialization") in several places

### 🔧 Technical improvements

- **Input sanitisation** – all STAPE.io values are stripped of quotes
- **Simplified syntax highlighting** – more robust implementation without tokenisation
- **onStepLeave handler** – reliable saving when changing steps
- **Regex-based duplicate removal** – strips the GitHub example configuration out of the helper code

### 📦 Export formats

- **ES2015** – readable code with comments
- **Minified** – compressed via Terser (in the browser)

### 🔒 Supported features

| Feature | Description |
|---------|-------------|
| debug | Ignore the opt-out cookie |
| sendConsentEvent | Fire the aGTM_consent event |
| dlStateEvents | DOMloaded/PAGEready events |
| aPageview | Pageview event after load |
| vPageviews | Virtual pageviews on history change |
| useListener | Event listener instead of a timer |
| consent_events | Custom consent event names |
| gdl | dataLayer name |
| dlOrgPush | dataLayer push handling |
| nonce | CSP nonce support |
| ckServices/ckPurposes/ckVendors | sGTM consent parameters |

### 📋 System requirements

- A modern browser (Chrome, Firefox, Safari, Edge)
- JavaScript enabled
- No server installation needed (single-file HTML)

---

## [2.0.0] - 2025-12-10

### Initial development release

Complete rewrite of the aGTM configurator with:
- Wizard-based user guidance
- Modern UI with Tailwind CSS
- Extended CMP support
- STAPE.io integration

---

## [1.x] - Legacy

The original version of the aGTM configurator.
No longer supported – migrating to v2.1 is recommended.
