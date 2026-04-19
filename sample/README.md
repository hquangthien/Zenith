# Grammar Helper — Electron MVP

Cross-platform desktop app (macOS + Windows + Linux) that lets users check
grammar on **any selected text in any app**. Just highlight the text — a
small floating icon appears next to it; click it to open suggestions.

```
┌──────────────────────────────────────────────────────────┐
│  1. Select (drag) text in Gmail / Word / Slack / etc.    │
│  2. A small "G" icon pops up next to the cursor          │
│  3. Click the icon → floating window with suggestions    │
│  4. Click "Apply fix" → paste it back  (⌘/Ctrl+V)        │
│                                                          │
│  Fallback hotkey (if auto-detect fails):                 │
│  Copy (⌘/Ctrl+C) then press ⇧+⌘+G / Shift+Ctrl+G         │
└──────────────────────────────────────────────────────────┘
```

Selection is auto-captured: on each mouse-drag release outside our own
windows we synthesize `⌘/Ctrl+C`, compare the clipboard before/after, and
only surface the icon if the selection actually changed.

## Project layout

```
grammar-helper-electron/
├── package.json
├── main.js                ← Electron main process (Node.js side)
├── preload.js             ← contextBridge API exposed to renderer
└── renderer/              ← the floating windows (icon + suggestions)
    ├── index.html         ← suggestion popup
    ├── renderer.js
    ├── styles.css
    ├── icon.html          ← tiny floating icon shown near selection
    └── icon.js
```

No Rust, no native compilation, no build step — just Node.js + Electron.

## Run it

```bash
cd grammar-helper-electron
npm install
npm start
```

That's it. First launch will register the global hotkey and drop a tray
icon. The app lives in the background.

## Build installers

```bash
npm run build:mac    # .dmg for macOS (universal)
npm run build:win    # .exe installer for Windows
```

Installers appear in `dist/`.

## Permissions

### macOS

**Accessibility permission is required.** The app uses `uiohook-napi` to
watch for mouse-drag events and `@nut-tree-fork/nut-js` to synthesize
`⌘+C` — both need Accessibility:

1. System Settings → Privacy & Security → Accessibility
2. Add `Grammar Helper.app` (or your dev terminal, when running `npm start`)
3. Turn it on

Without this permission, the floating icon won't appear. The fallback
hotkey still works since it only needs to read the clipboard.

### Windows

Nothing to configure. `globalShortcut.register` uses `RegisterHotKey`
under the hood, which doesn't need elevated permissions.

## Where to plug in your LLM

Open `main.js` and find the `ipcMain.handle("check-text", ...)` block.
Replace the mock logic with an HTTP call to your backend:

```js
ipcMain.handle("check-text", async (_evt, text) => {
  const res = await fetch("https://api.yourapp.com/check", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.API_TOKEN || ""}`,
    },
    body: JSON.stringify({ text, userId: currentUserId }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
});
```

**Do not call Claude/OpenAI directly from Electron** — that exposes your
API key to anyone who opens the app bundle. Always proxy through your
own backend, which adds auth, rate limiting, user tracking, and caching.

### Prompting Claude for structured suggestions

On your backend, call Claude with the structured-output pattern. Rough
shape of the prompt:

```
System: You are a writing assistant for a Vietnamese user learning
English at CEFR level {B1}. Their recurring mistakes are:
  - forgets "s" on 3rd-person singular verbs
  - mixes up "your" and "you're"
  - overuses "very + adjective"

Return a JSON array of suggestions. Each item:
  { "original": string,
    "suggested": string,
    "explanation": string,   // in Vietnamese, max 2 sentences
    "category": "grammar" | "spelling" | "style" | "clarity" }

Text to check:
---
{user_text}
---

Output ONLY valid JSON. No prose.
```

## How auto-detection works

- `uiohook-napi` listens to global `mousedown` / `mouseup` events.
- If mouseup lands more than a few pixels from mousedown, we assume the
  user dragged (= likely a selection).
- `nut-js` synthesizes `⌘/Ctrl+C`.
- We compare `clipboard.readText()` before and after. If the text
  changed and is non-empty, a small icon window pops up near the cursor.
- Clicking the icon opens the existing suggestion window.
- Clicking anywhere else (or waiting ~4s) dismisses the icon.

The global hotkey (`⇧+⌘+G` / `Shift+Ctrl+G`) is kept as a fallback path
for apps where synthesized copy doesn't work (e.g. some secure fields).

## Gotchas I hit while writing this

- **Single-instance lock** matters: without it, launching the app twice
  silently fails to register the hotkey the second time. See
  `app.requestSingleInstanceLock()` at the bottom of `main.js`.
- **Hide, don't close** the floating window — re-creating a BrowserWindow
  on every hotkey press takes 200–400ms and feels sluggish.
- **CSP in the renderer**: the default CSP blocks inline styles. I added
  `'unsafe-inline'` for styles; if you want a stricter policy, move all
  dynamic styles to classes.
- **Tray icon**: without a tray icon the app is invisible to the user
  and feels like it's "not running" — which is confusing for a hotkey
  tool. Even a minimal icon makes a huge UX difference.

## Next steps / ideas

- Replace vanilla JS with React/Svelte (via Vite)
- Settings window: customize hotkey, language of explanations, CEFR level
- History view: all errors ever made, filterable
- Flashcard mode: spaced repetition on past mistakes
- On-device mode for privacy: bundle Ollama + a small model, route `checkText` locally
