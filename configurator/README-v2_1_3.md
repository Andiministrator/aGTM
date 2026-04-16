# aGTM Konfigurator v2.1.3

> Visueller Konfigurator für die [aGTM Library](https://github.com/Andiministrator/aGTM) – DSGVO-konformes Google Tag Manager Loading mit Consent-Management.
>
> Entwickelt von **InBiz Online Marketing GmbH & Co. KG** · [sea-suite.de](https://www.sea-suite.de)

---

## 🚀 Quick Start

1. **Datei öffnen** – `agtm-konfigurator-v2.1.3.html` im Browser öffnen
2. **Wizard durchlaufen** – 8 Schritte zur vollständigen Konfiguration
3. **Code exportieren** – Copy & Paste oder Download als `.js`

**Keine Installation erforderlich** – alles läuft lokal im Browser. Keine Server, keine Abhängigkeiten außer CDN.

---

## 🎨 Design

Version 2.1.3 basiert auf dem **SEA Suite Dark Theme** (InBiz Branding):

| Element | Wert |
|---------|------|
| Primärfarbe | `#E30613` (InBiz-Rot) |
| Page Background | `#202020` |
| Card Background | `#101010` |
| Header | `#404040` |
| Font | Inter |
| Logo | aGTM Planet/Saturn Space-Logo |

---

## 📋 Wizard-Schritte

| Schritt | Beschreibung |
|---------|--------------|
| 1. Laden | Gespeicherte Konfigurationen laden oder neu starten |
| 2. Basis | Kundenname, Modus (Einfach/Erweitert), aGTM Version |
| 3. CMP | Consent Management Platform auswählen (23 CMPs) |
| 4. GTM | Container-IDs und optional STAPE.io Server-side |
| 5. Consent | Consent-Logik konfigurieren (Services/Purposes/Vendors) |
| 6. Features | aGTM Optionen aktivieren |
| 7. Callbacks | Custom JavaScript Callbacks (nur Erweitert-Modus) |
| 8. Export | Code generieren, kopieren, downloaden |

---

## 🔌 Unterstützte CMPs (23)

Cookiebot · Usercentrics v2 · Usercentrics v3 · Borlabs Cookie · OneTrust · Consentmanager · CCM19 · Klaro · Complianz · CookieYes · Osano · Termly · iubenda · TrustArc · Didomi · Quantcast · Shopify · ACRIS · clickskeks · Magento CC Cookie · Secure Privacy · Perspective · Custom · Keine CMP

---

## 🖥️ Server-side Tracking

**STAPE.io Integration** mit:
- Custom Loader Support
- Cookie Keeper
- Alle Konfigurationsoptionen (cid, ep, sid, cdn, usc, dlv, kid)

---

## 🎨 UI Features

| Feature | Beschreibung |
|---------|--------------|
| Dark Mode | SEA Suite Dark Theme als Standard, manuell umschaltbar |
| Responsive | Desktop, Tablet, Mobile |
| Live-Vorschau | Consent-Logik in Echtzeit |
| Syntax-Highlighting | CodeMirror Editor für Custom CMP Code |
| LocalStorage | Automatisches Speichern – bis zu 50 Konfigurationen |
| JSON Export/Import | Backup und Weitergabe von Konfigurationen |
| Share-Link | Konfiguration per URL teilen (Base64-kodiert) |

---

## 💾 Export-Optionen

| Format | Beschreibung |
|--------|--------------|
| **ES2015** | Lesbarer Code mit Kommentaren |
| **Minified** | Komprimiert via Terser für Produktion |
| **JSON** | Konfiguration als Backup-Datei |
| **Share-Link** | URL mit Base64-kodierter Config |

---

## 📁 Dateistruktur

```
agtm-konfigurator-v2.1.3.html   # Hauptanwendung (Single-File, inkl. Logo)
CHANGELOG-v2.1.3.md             # Versionshistorie
README-v2.1.3.md                # Diese Datei
design.md                       # Design System Dokumentation
```

---

## 🔧 Technische Details

### Abhängigkeiten (via CDN)
- Tailwind CSS 3.x
- Inter (Google Fonts)
- CodeMirror 5.65
- Terser 5.x (Minifizierung im Browser)

### Browser-Kompatibilität
- Chrome 90+
- Firefox 90+
- Safari 14+
- Edge 90+

### aGTM Library
- Aktuell unterstützt: **1.5**
- Version wird automatisch von GitHub geladen

### Single-File Architektur
Die gesamte Anwendung inkl. aGTM-Logo (Base64) ist in einer einzigen `.html`-Datei enthalten. Keine Installation, kein Build-Prozess.

---

## 📝 Generierter Code

```javascript
// ==================================================
// aGTM Configuration
// Generated: 2026-04-08
// Customer: [Kundenname]
// Generator: aGTM Konfigurator v2.1.3
// ==================================================

// ========== aGTM Library ==========
window.aGTM=window.aGTM||{} // ... minified library

// ========== CMP consent_check ==========
window.aGTM=window.aGTM||{} // ... CMP-spezifische Funktion

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

**Entwickelt von:** Marco Brenn · InBiz Online Marketing GmbH & Co. KG

**Website:** [sea-suite.de](https://www.sea-suite.de)

**aGTM Library:** [github.com/Andiministrator/aGTM](https://github.com/Andiministrator/aGTM)

---

## 📄 Lizenz

Proprietär – Für den internen Gebrauch bei InBiz Online Marketing GmbH & Co. KG und autorisierte Kunden.
