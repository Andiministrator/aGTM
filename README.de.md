# aGTM – Quickstart auf Deutsch

![aGTM - a Galactic Tagging Modulator](assets/aGTM-100px.png)

> Die vollständige englische Dokumentation findest du in [README.md](README.md) und [README-for-Developers.md](README-for-Developers.md).

---

## Was ist aGTM?

aGTM (*a Galactic Tagging Modulator*) ist eine JavaScript-Library, die den Google Tag Manager (GTM) erst dann in die Seite lädt, wenn die Einwilligung des Nutzers vorliegt. Events, die vor der Einwilligung gefeuert werden, werden automatisch zwischengespeichert und nach dem GTM-Load nachgereicht – du musst dich im GTM-Setup nicht mehr darum kümmern, ob und wann Consent verfügbar ist.

**Kernfunktionen:**
- GTM-Einbindung erst nach Consent (DSGVO-konform)
- Unterstützt Google Consent Mode
- Unterstützt 25+ CMP-Anbieter (Cookiebot, OneTrust, Usercentrics, Borlabs, …)
- Event-Queue: kein Event geht verloren
- POST-Transport direkt zu Server-Side GTM
- Session & User Data Feature

**Lizenz:** Apache 2.0 | **Repository:** [github.com/Andiministrator/aGTM](https://github.com/Andiministrator/aGTM)

---

## Schnellstart in 5 Minuten

### Schritt 1: Configurator nutzen (empfohlen)

Der einfachste Einstieg ist der [aGTM Configurator](https://andiministrator.github.io/aGTM/configurator/index.html) – er generiert den fertigen Einbindungscode für deine CMP.

### Schritt 2: Code einbinden

Den generierten Code so früh wie möglich im `<head>` einbinden, **vor** allen anderen Tracking-Skripten:

```html
<!-- aGTM Start -->
<script type="text/javascript">
// 1. aGTM Library (minifiziert)
window.aGTM=window.aGTM||{f:{}};/* ... aGTM.min.js Inhalt ... */

// 2. CMP-Funktion (je nach Anbieter, z.B. cc_cookiebot.min.js)
aGTM.f.consent_check=function(e){/* ... */};

// 3. Konfiguration
aGTM.f.config({
  gtm: { 'GTM-XXXXXXXX': {} },
  gtmServices: 'Google Tag Manager',  // Consent-Bedingung
  cmp: 'cookiebot'                    // Name deines CMP-Anbieters
});

// 4. Init
aGTM.f.init();
</script>
<!-- aGTM End -->
```

---

## Beispiele nach CMP-Anbieter

### Cookiebot

```javascript
aGTM.f.config({
  gtm: { 'GTM-XXXXXXXX': {} },
  gtmPurposes: 'statistics',
  cmp: 'cookiebot'
});
aGTM.f.init();
```

### OneTrust / CookiePro

```javascript
aGTM.f.config({
  gtm: { 'GTM-XXXXXXXX': {} },
  gtmServices: 'Google Tag Manager',
  cmp: 'onetrust'
});
aGTM.f.init();
```

### Usercentrics v2

```javascript
aGTM.f.config({
  gtm: { 'GTM-XXXXXXXX': {} },
  gtmServices: 'Google Tag Manager',
  cmp: 'usercentrics2'
});
aGTM.f.init();
```

### Borlabs Cookie 3

```javascript
aGTM.f.config({
  gtm: { 'GTM-XXXXXXXX': {} },
  gtmServices: 'Google Tag Manager',
  cmp: 'borlabs3'
});
aGTM.f.init();
```

### Ohne Consent-Prüfung

```javascript
aGTM.f.config({
  gtm: { 'GTM-XXXXXXXX': {} },
  cmp: 'none'   // GTM wird sofort geladen, kein Consent erforderlich
});
aGTM.f.init();
```

**Alle unterstützten CMPs** (25+): Borlabs 2/3, CCM19, Clickskeks, Consentmanager, Cookiebot, Cookiefirst, JTL Consent, JTL EU Cookie, Klaro, Magento CC Cookie, Matomo, OneTrust/CookiePro, Orestbida CookieConsent, Perspective Funnel, Secure Privacy, Shopify Consent, Shopware 5/6, Shopware Acris, Sourcepoint, Tramino, Usercentrics v2/v3 und weitere. Vollständige Liste: [cmp/README-cmp.md](cmp/README-cmp.md)

---

## Wichtigste Konfigurationsoptionen

| Option | Typ | Standard | Beschreibung |
|---|---|---|---|
| `gtm` | object | – | GTM Container-ID(s), z.B. `{ 'GTM-XYZ': {} }` |
| `cmp` | string | `""` | CMP-Anbieter (Kleinschreibung), z.B. `'cookiebot'`. `'none'` = kein Consent. |
| `gtmPurposes` | string | `""` | Consent-Zwecke, die für GTM-Load nötig sind (kommagetrennt) |
| `gtmServices` | string | `""` | Consent-Services, die für GTM-Load nötig sind (kommagetrennt) |
| `gtmVendors` | string | `""` | Consent-Anbieter, die für GTM-Load nötig sind (kommagetrennt) |
| `sendConsentEvent` | boolean | `false` | Separates Consent-Event in den dataLayer pushen |
| `dlStateEvents` | boolean | `false` | Events für DOMready und PAGEready feuern |
| `aPageview` | boolean | `false` | `aPageview`-Event nach GTM-Load feuern |
| `transport_url` | string | `""` | Endpunkt für direkten HTTP-POST (z.B. sGTM Collect) |
| `transport_enc` | boolean | `false` | POST-Payload verschlüsseln |
| `transport_salt` | number | `0` | Verschlüsselungs-Salt (ganzzahlig, >= 1) |
| `user_id` | string | `""` | Optionale eingeloggte User-CRM-ID (wird in `aGTM.d.session.uid` gespeichert) |
| `session_salt` | number | `0` | Salt für consent-store POST-Verschlüsselung; auch Fallback für `transport_salt` |
| `consent_store_url` | string | `""` | POST-Endpunkt für Consent-Diffs (sGTM Client persistiert in Session API). Wird vom sGTM Client browserseitig aus `document.currentScript.src` + `/aGTMconsent` gebaut — funktioniert mit Reverse Proxy transparent |
| `consent_store_enc` | boolean | `false` | Consent-Store POST-Payload mit `session_salt` verschlüsseln |
| `consent_poll_ms` | number | `2000` | Intervall (ms) für CMP-State-Change-Polling nach erfolgreichem Init. `0` = aus. Nur aktiv wenn `consent_store_url` gesetzt. Fängt CMPs ab, die ihre Updates direkt per `dataLayer.push()` feuern (CCM19, Cookiebot, Usercentrics, …) und damit `aGTM.f.fire()` umgehen |
| `session` | object | `null` | Vom sGTM Client vorbelegtes Session-Objekt (`{sid, uid, consent?, ...}`) — wenn `consent` gültig, GTM injiziert ohne CMP-Wait |

---

## Events feuern mit `aGTM.f.fire()`

Alle Events gehen über `aGTM.f.fire()` statt direkt in `dataLayer.push()`. aGTM übernimmt automatisch Consent-Gating, Queuing und Replay:

```javascript
// Normales Event (wartet auf Consent)
aGTM.f.fire({ event: 'purchase', revenue: 99.90, currency: 'EUR' });

// Event direkt per POST zu sGTM senden (zusätzlich zum dataLayer)
aGTM.f.fire({ event: 'purchase', revenue: 99.90, _post: true });

// Event ohne Consent-Prüfung (für funktionale/rechtliche Events)
aGTM.f.fire({ event: 'cookie_consent_given', _noConsent: true });
```

**`_post: true`** nutzt die globalen `transport_*`-Einstellungen aus der Config. Du kannst auch per-Event überschreiben:

```javascript
aGTM.f.fire({
  event: 'purchase',
  revenue: 99.90,
  _post: { url: 'https://collect.example.com', enc: true, salt: 42 }
});
```

---

## Häufige Probleme

### GTM lädt nicht / Consent wird nicht erkannt

1. Stimmt der `cmp`-Wert mit dem Anbieter überein? → [Liste der CMPs](cmp/README-cmp.md)
2. Stimmen `gtmPurposes` / `gtmServices` mit den Bezeichnungen im CMP überein? (Groß-/Kleinschreibung beachten!)
3. CMP-Funktion korrekt eingebunden? Die `cc_<name>.min.js` muss vor `aGTM.f.init()` geladen werden.
4. Debug-Modus aktivieren: `aGTM.f.config({ debug: true })` — dann wird der Opt-Out-Cookie ignoriert.
5. `aGTM_debug.js` im Browser-Konsolenfenster ausführen — decodiert den `aGTM.l`-Log.

### Events kommen doppelt an

Prüfe ob `aGTM.f.fire()` mehrfach aufgerufen wird. aGTM setzt intern `aGTMts` als Deduplizierungs-Guard — ein Event mit bereits gesetztem `aGTMts` wird übersprungen.

### Events gehen verloren (kommen nicht im GTM an)

Events vor Consent landen in `aGTM.d.f` (Queue). Nach GTM-Load werden sie als `hastyEvents` im `aGTM_ready`-Event übergeben. Prüfe ob das GTM Custom Template (aus `gtm/`) korrekt eingebunden ist und die Queue verarbeitet.

### POST kommt nicht an

- `transport_url` konfiguriert? → `aGTM.c.transport_url` im Browser-Konsolenfenster prüfen
- CORS: der Endpunkt muss POST-Anfragen von der Website-Domain erlauben
- Verschlüsselung: `transport_enc: true` erfordert den gleichen Salt auf Server- und Client-Seite

---

## Weiterführende Dokumentation

| Dokument | Inhalt |
|---|---|
| [README.md](README.md) | Vollständige englische Dokumentation (alle Config-Optionen, Consent-Handling, FAQ) |
| [README-for-Developers.md](README-for-Developers.md) | Technische Doku: Architektur, Call-Graphs, Callbacks, Build-Prozess |
| [CHANGELOG.md](CHANGELOG.md) | Versionshistorie |
| [cmp/README-cmp.md](cmp/README-cmp.md) | Alle unterstützten CMPs mit Konfigurations-Details |
| [ROADMAP.md](ROADMAP.md) | Geplante Features |
