# Browser Testing & Cache Cleanup Protocol

This document describes how to fully reset browser state when testing Genie AI
or any other feature that relies on Service Workers, LocalStorage, IndexedDB, or
WebLLM model-weight caches.

---

## Why a full reset matters

| Storage layer | What it holds |
|---|---|
| **Service Worker cache** | Static asset cache (HTML, JS, CSS) |
| **LocalStorage** | App settings (Genie enabled, model choice, data opts) |
| **IndexedDB** | Fitness data, community data, IPFS snapshots |
| **WebLLM / model weights** | `mlc-cache` / Origin Private File System entries (~2 GB for Phi-3.5-mini) |

After a code change that touches any of these layers, a "normal" page reload is
not sufficient — you must clear the relevant storage to avoid stale state.

---

## Chromium / Chrome / Edge (one-click)

### DevTools reset (recommended for developers)

1. Open DevTools → **Application** tab.
2. In the left sidebar, click **Storage** (under the site origin).
3. Check **all** boxes:
   - Local and session storage
   - IndexedDB
   - Web SQL
   - Cookies
   - Cache storage
4. Click **Clear site data**.
5. Navigate to **Application → Service Workers** and click **Unregister** for
   each registered worker, then click **Update**.
6. Hard-reload: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (macOS).

### Quick URL shortcut

Paste this in the address bar and press Enter to jump directly to the site's
storage settings:

```
chrome://settings/content/siteDetails?site=<your-origin>
```

Replace `<your-origin>` with e.g. `http://localhost:3000` or your production URL.
Click **Delete data** on that page for a one-click wipe.

---

## Firefox

1. Open **DevTools** (`F12`) → **Storage** tab.
2. Right-click each of **Local Storage**, **IndexedDB**, and **Cache Storage**
   entries for your origin and choose **Delete All**.
3. In the **Service Workers** panel (DevTools → Application, or
   `about:debugging#/runtime/this-firefox`), click **Unregister** for the
   active worker.
4. Hard-reload: `Ctrl+Shift+R`.

Alternatively, navigate to `about:preferences#privacy` → **Manage Data…** →
find your origin → **Remove Selected**.

---

## Safari (macOS / iOS)

### macOS
1. Enable the **Develop** menu: **Safari → Settings → Advanced → Show features
   for web developers**.
2. **Develop → [your device] → [your origin] → Remove All Local Website Data**.
3. Alternatively: **Safari → Settings → Privacy → Manage Website Data…** →
   search for your origin → **Remove**.

### iOS
**Settings → Safari → Advanced → Website Data** → find your origin →
swipe-to-delete, or tap **Remove All Website Data** for a full reset.

---

## WebLLM model-weight cache (all browsers)

WebLLM stores downloaded model weights in the browser's
**Origin Private File System (OPFS)** and/or **Cache Storage** under the key
`mlc-cache`. These can be several gigabytes and are _not_ cleared by the usual
"clear cookies & site data" option in some browsers.

### Chromium

In DevTools → **Application → Cache storage**, look for entries named
`mlc-cache` or similar. Right-click → **Delete** each entry.

If the entry does not appear in the GUI, open the DevTools **Console** and run:

```js
const cacheNames = await caches.keys();
await Promise.all(cacheNames.map(n => caches.delete(n)));
console.log('All caches cleared');
```

Then check **Application → Storage → Usage** and click **Clear site data**.

### Firefox & Safari

Follow the same storage-reset steps above; the model weights live inside
the origin's storage quota and will be removed along with IndexedDB / OPFS.

---

## LocalStorage keys used by Genie AI

| Key | Purpose |
|---|---|
| `genieEnabled` | `"true"` / `"false"` — whether Genie is active |
| `genieModelId` | Persisted model selection (now always `Phi-3.5-mini-instruct-q4f16_1-MLC`) |
| `genieChatOpen` | JSON map of `{ panelId: boolean }` — which chat windows were open |
| `genieBackend`  | `'webllm'` / `'github-models'` / `'openai'` — selected AI backend |
| `genieApiKey`   | User-pasted API key — stored as plain string, never logged or transmitted to BigNuten |
| `genieContextCategories` | JSON map of `{ exercises: true, foods: true, … }` — which data categories Genie includes in its context prompt |

To reset Genie state only (without wiping everything):

```js
['genieEnabled', 'genieModelId', 'genieChatOpen', 'genieBackend', 'genieApiKey', 'genieContextCategories']
  .forEach(k => localStorage.removeItem(k));
location.reload();
```

---

## Quick testing checklist

- [ ] Unregister all Service Workers for the origin
- [ ] Clear LocalStorage (or run the snippet above for Genie-only)
- [ ] Clear IndexedDB
- [ ] Clear Cache Storage (including `mlc-cache` model weights)
- [ ] Hard-reload (`Ctrl+Shift+R` / `Cmd+Shift+R`)
- [ ] Verify Genie icon appears at the true corner of each open panel
- [ ] Verify Genie icon z-index is above all modals, tooltips, and overlays
- [ ] Verify only Phi-3.5-mini appears in the AI Model selector
- [ ] Confirm model downloads and runs on first message send
