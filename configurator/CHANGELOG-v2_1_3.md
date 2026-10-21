# aGTM Configurator – Changelog

## [2.2.0] - 2026-10-21

### aGTM v1.5 options

Changes by the aGTM project, on top of InBiz's 2.1.3.

#### Added (step "Features", advanced mode)
- **Session & consent store** – `consent_store_url`, `consent_poll_ms`, `session_salt`, `user_id`, `consent_store_enc`. A note explains that the aGTM sGTM Client sets `consent_store_url` and `session` itself. `consent_store_enc` carries a warning: no server-side decoder exists, so the Client answers `501` and stores nothing.
- **POST transport** – `transport_url`, `transport_enc`, `transport_salt`, plus a short reference for the per-event flags `_post`, `_noConsent` and `_noDLPush` (they belong in `aGTM.f.fire()`, not in the config).
- **`allowEmptyConsentConditions`** – with a warning. Since aGTM v1.5 an empty consent table is fail-closed: GTM is not loaded.
- **`dlOrgPush`** – the option labels now say what each mode does. Every mode sends one `exception` event per page with `fct_hook` and `fct_hook_src` (the script that replaced `dataLayer.push`).

#### Fixed
- **"No CMP" never loaded GTM** – the generated config lacked `cmp: 'none'`, so aGTM kept looking for a `consent_check` function that was never there. The generator now emits it.
- **No consent condition** – the generated code now carries a warning comment (and the UI shows a toast) when no condition is set and `allowEmptyConsentConditions` is off, because GTM will not load.
- **Quotes in input values** – string values in the generated config are escaped, so `Google Tag Manager's` no longer breaks the code.

- **CMP list rebuilt from the real adapters** – up to 2.1.3, 11 of the 20 offered CMPs produced only an `ERROR: Could not load … consent_check` comment: nine had no adapter at all (CookieYes, Termly, iubenda, TrustArc, Didomi, Quantcast, Ogury, Commanders Act, Ketch), OneTrust and Borlabs pointed at file names that do not exist. The list now holds the 26 adapters from `cmp/` (14 of them were missing), keyed by file name.
- **Consent types per CMP** – step 4 offered types an adapter never reports (services for Cookiebot and OneTrust, purposes for CCM19). Such a condition can never be met, so GTM never loaded. Step 4 now offers and saves only the adapter's own types, and the generator warns about a condition the CMP cannot meet (e.g. from an imported older configuration).
- **Stored configurations** – `onetrust` is renamed to `onetrust_cookiepro`; a CMP that no longer exists is cleared so it is chosen again in step 3.

#### Removed
- **`ckServices` / `ckPurposes` / `ckVendors`** – removed in aGTM v1.5 (the library never produced the `ck` parameter). Stored or imported configurations drop them on load.

---

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
