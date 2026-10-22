# aGTM Configurator v2.2.1

> Visual configurator for the [aGTM library](https://github.com/Andiministrator/aGTM) – GDPR-compliant Google Tag Manager loading with consent management.
>
> Developed by **InBiz Online Marketing GmbH & Co. KG** · [sea-suite.de](https://www.sea-suite.de). Version 2.2.0 adds the aGTM v1.5 options, 2.2.1 the `jsErrors` switch (aGTM project).

---

## 🚀 Quick start

1. **Open the file** – open `index.html` (in this repository: `configurator/index.html`, also served via GitHub Pages) in your browser
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
| 3. CMP | Pick the consent management platform (26 adapters, plus Custom and No CMP) |
| 4. GTM | Container IDs and optionally STAPE.io server-side |
| 5. Consent | Configure the consent logic (services/purposes/vendors) |
| 6. Features | Enable aGTM options (incl. `jsErrors`, on by default); advanced mode adds the v1.5 consent store (`consent_store_url`, `consent_poll_ms`, `session_salt`, `user_id`, `consent_store_enc`), POST transport (`transport_url`/`_enc`/`_salt`) and `allowEmptyConsentConditions` |
| 7. Callbacks | Custom JavaScript callbacks (advanced mode only) |
| 8. Export | Generate, copy and download the code |

---

## 🔌 Supported CMPs (26)

CCM19 · Cookiebot · Usercentrics v3 / newer Cookiebot · Consentmanager · Usercentrics v2 · OneTrust / CookiePro · Complianz · Borlabs Cookie 3 · Borlabs Cookie 2 · Klaro! · CookieFirst · Sourcepoint · Clickskeks · Secure Privacy · Matomo Consent · Orestbida CookieConsent · PP Consent Manager (PixelPoint) · Tramino · Perspective Funnel · Magento CC Cookie · Shopify Consent · Shopware 6 Cookie · Shopware 5 Cookie · Shopware Acris Cookie · JTL Consent · JTL EU Cookie · Custom · No CMP

The list mirrors the adapters in [`cmp/`](../cmp/): each entry loads `cmp/cc_<key>.min.js`, and step 4 only offers the consent types (services / purposes / vendors) that adapter actually reports. The `cc_simple_cookie_regex_check` template is not listed — it has to be edited by hand, so use **Custom** for it.

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
index.html                      # Main application (single file, logo included)
CHANGELOG-v2_1_3.md             # Version history (file name kept from 2.1.3, covers 2.2.x)
README-v2_1_3.md                # This file
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
// Generator: aGTM Configurator v2.2.1
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
