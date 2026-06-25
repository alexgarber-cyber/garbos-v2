# GarbOS LinkedIn Importer — Install Guide

## Prerequisites

- Google Chrome (or any Chromium-based browser)
- A running GarbOS instance (default: `https://garbos.io`)
- A Personal API Token (generated inside GarbOS — see below)

---

## 1. Generate a Personal API Token in GarbOS

The extension authenticates via a bearer token instead of the browser session cookie.

```
POST https://garbos.io/api/auth/token
Authorization: Bearer <your-session-cookie>   # or use the web UI
```

From a terminal (with your session cookie), or via the GarbOS web UI settings:

```bash
curl -X POST https://garbos.io/api/auth/token \
  -H "Cookie: session=<your-session-value>"
```

The response contains a `token` field. **Copy it — it is shown only once.**

```json
{ "token": "abcdef1234...", "prefix": "abcdef12" }
```

To check whether a token is set:
```bash
GET https://garbos.io/api/auth/token
```

To revoke a token:
```bash
DELETE https://garbos.io/api/auth/token
```

---

## 2. Load the Extension in Chrome

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Select the `chrome-extension/` folder (this directory).
5. The "GarbOS LinkedIn Importer" extension appears in your toolbar.

---

## 3. Configure the Extension

1. Navigate to any LinkedIn profile, e.g. `https://www.linkedin.com/in/someone`.
2. Click the **GarbOS** icon in the Chrome toolbar.
3. The **Settings** panel appears on first run.
   - **GarbOS API URL**: leave as `https://garbos.io/api` unless self-hosting.
   - **Personal API Token**: paste the token you generated in step 1.
4. Click **Save**. The popup immediately loads the profile data.

---

## 4. Usage

- Navigate to any `linkedin.com/in/*` profile page.
- Click the GarbOS extension icon.
- The popup shows the scraped **Name, Title, Company, Location, LinkedIn URL**.
- Click **Add as Prospect** to import as a Lead (requires a detectable company name).
- Click **Add as Contact** to import as a Contact.
- If the profile already exists in GarbOS, a warning banner appears before you confirm.

To change your token or API URL at any time, click **⚙ API Settings** at the top of the popup.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| "Could not read page" | Reload the LinkedIn profile tab and try again |
| "Invalid API token" (401) | Regenerate the token via `POST /auth/token` |
| Fields show "—" | LinkedIn changed their DOM — file an issue; the selector fallbacks may need updating |
| Extension not shown in toolbar | Click the puzzle-piece icon in Chrome and pin GarbOS |
