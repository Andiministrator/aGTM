# aGTM Configurator v2.1.3

> Visual configurator for the [aGTM library](https://github.com/Andiministrator/aGTM) – GDPR-compliant Google Tag Manager loading with consent management.
>
> Developed by **InBiz Online Marketing GmbH & Co. KG** · [sea-suite.de](https://www.sea-suite.de)

---

## 🚀 Quick start

1. **Open the file** – open `agtm-konfigurator-v2.1.3.html` in your browser
2. **Walk through the wizard** – 8 steps to a complete configuration
3. **Export the code** – copy & paste, or download as `.js`

**No installation required** – everything runs locally in the browser. No server, no dependencies beyond the CDN.

---

## 🎨 Design

Version 2.1.3 is based on the **SEA Suite dark theme** (InBiz branding):

| Element | Value |
|---------|-------|
| Primary colour | `#E30613` (InBiz red) |
| Page background | `#202020` |
| Card background | `#101010` |
| Header | `#404040` |
| Font | Inter |
| Logo | aGTM planet/Saturn space logo |

---

## 📋 Wizard steps

| Step | Description |
|------|-------------|
| 1. Load | Load a saved configuration or start fresh |
| 2. Basics | Customer name, mode (simple/advanced), aGTM version |
| 3. CMP | Pick the consent management platform (23 CMPs) |
| 4. GTM | Container IDs and optionally STAPE.io server-side |
| 5. Consent | Configure the consent logic (services/purposes/vendors) |
| 6. Features | Enable aGTM options |
| 7. Callbacks | Custom JavaScript callbacks (advanced mode only) |
| 8. Export | Generate, copy and download the code |

---

## 🔌 Supported CMPs (23)

Cookiebot · Usercentrics v2 · Usercentrics v3 · Borlabs Cookie · OneTrust · Consentmanager · CCM19 · Klaro · Complianz · CookieYes · Osano · Termly · iubenda · TrustArc · Didomi · Quantcast · Shopify · ACRIS · clickskeks · Magento CC Cookie · Secure Privacy · Perspective · Custom · No CMP

---

## 🖥️ Server-side tracking

**STAPE.io integration** with:
- Custom loader support
- Cookie Keeper
- All configuration options (cid, ep, sid, cdn, usc, dlv, kid)

---

## 🎨 UI features

| Feature | Description |
|---------|-------------|
| Dark mode | SEA Suite dark theme by default, switchable manually |
| Responsive | Desktop, tablet, mobile |
| Live preview | Consent logic in real time |
| Syntax highlighting | CodeMirror editor for custom CMP code |
| Local storage | Saves automatically – up to 50 configurations |
| JSON export/import | Back up and hand over configurations |
| Share link | Share a configuration via URL (Base64-encoded) |

---

## 💾 Export options

| Format | Description |
|--------|-------------|
| **ES2015** | Readable code with comments |
| **Minified** | Compressed via Terser, for production |
| **JSON** | Configuration as a backup file |
| **Share link** | URL with a Base64-encoded config |

---

## 📁 File structure

```
agtm-konfigurator-v2.1.3.html   # Main application (single file, logo included)
CHANGELOG-v2.1.3.md             # Version history
README-v2.1.3.md                # This file
design.md                       # Design system documentation
```

---

## 🔧 Technical details

### Dependencies (via CDN)
- Tailwind CSS 3.x
- Inter (Google Fonts)
- CodeMirror 5.65
- Terser 5.x (minification in the browser)

### Browser compatibility
- Chrome 90+
- Firefox 90+
- Safari 14+
- Edge 90+

### aGTM library
- Currently supported: **1.5**
- The version is loaded from GitHub automatically

### Single-file architecture
The entire application including the aGTM logo (Base64) lives in a single `.html` file. No installation, no build step.

---

## 📝 Generated code

```javascript
// ==================================================
// aGTM Configuration
// Generated: 2026-04-08
// Customer: [customer name]
// Generator: aGTM Configurator v2.1.3
// ==================================================

// ========== aGTM Library ==========
window.aGTM=window.aGTM||{} // ... minified library

// ========== CMP consent_check ==========
window.aGTM=window.aGTM||{} // ... CMP-specific function

// ========== STAPE.io Config ========== (optional)
var agtm_stapeio_cfg = function(e){...}({ cid: '...', ep: '...', ... });

// ========== aGTM Config ==========
aGTM.f.config({
  gtm: { 'GTM-XXXXXX': { /* consent logic */ } },
  // ... features
});

// ========== Initialize ==========
aGTM.f.init();
```

---

## 🆘 Support

**Developed by:** Marco Brenn · InBiz Online Marketing GmbH & Co. KG

**Website:** [sea-suite.de](https://www.sea-suite.de)

**aGTM library:** [github.com/Andiministrator/aGTM](https://github.com/Andiministrator/aGTM)

---

## 📄 Licence

Proprietary – for internal use at InBiz Online Marketing GmbH & Co. KG and by authorised customers.
