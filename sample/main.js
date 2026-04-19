// ================================================================
//  Grammar Helper — Electron main process
//
//  Flow:
//   1. User selects (drags) text in any app
//   2. We auto-copy the selection via a synthesized Cmd/Ctrl+C and
//      compare clipboard before/after to confirm a real selection
//   3. A small floating icon appears next to the cursor
//   4. Clicking the icon opens the suggestion popup
//   5. Clicking "Apply fix" writes the corrected text to the clipboard
//
//  Requires Accessibility permission on macOS so that nut-js can
//  synthesize the copy keystroke and uiohook can read mouse events.
// ================================================================

const {
  app,
  BrowserWindow,
  globalShortcut,
  clipboard,
  screen,
  ipcMain,
  Notification,
  Tray,
  Menu,
  nativeImage,
} = require("electron");
const path = require("path");
const { uIOhook } = require("uiohook-napi");
const { keyboard, Key } = require("@nut-tree-fork/nut-js");

// nut-js default delay between key events is 500ms, which is far too
// slow for a "did the user just finish selecting?" check.
keyboard.config.autoDelayMs = 0;

/** @type {BrowserWindow|null} */
let suggestionWin = null;
/** @type {BrowserWindow|null} */
let iconWin = null;
/** @type {Tray|null} */
let tray = null;

// Drag tracking for mouseup-based selection detection
let mouseDownPos = null;
const DRAG_THRESHOLD_PX = 4;

// Debounce: don't re-show the icon for the same text.
let lastDetectedText = "";
/** @type {NodeJS.Timeout|null} */
let autoHideIconTimer = null;
const ICON_AUTO_HIDE_MS = 4000;

// ------- Floating suggestion window -------

function createOrShowSuggestionWindow(text) {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);

  const W = 420;
  const H = 360;
  const GAP = 12;

  let x = cursor.x + GAP;
  let y = cursor.y + GAP;
  const wa = display.workArea;
  if (x + W > wa.x + wa.width) x = wa.x + wa.width - W - 8;
  if (y + H > wa.y + wa.height) y = cursor.y - H - GAP;
  if (x < wa.x) x = wa.x + 8;
  if (y < wa.y) y = wa.y + 8;

  if (suggestionWin && !suggestionWin.isDestroyed()) {
    suggestionWin.setPosition(Math.round(x), Math.round(y), false);
    suggestionWin.show();
    suggestionWin.focus();
    suggestionWin.webContents.send("text-selected", text);
    return;
  }

  suggestionWin = new BrowserWindow({
    width: W,
    height: H,
    x: Math.round(x),
    y: Math.round(y),
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    transparent: true,
    hasShadow: true,
    vibrancy: "under-window",
    visualEffectState: "active",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.platform === "darwin") app.dock?.hide();

  suggestionWin.loadFile(path.join(__dirname, "renderer", "index.html"));

  suggestionWin.once("ready-to-show", () => {
    suggestionWin.show();
    suggestionWin.webContents.send("text-selected", text);
  });

  suggestionWin.on("close", (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      suggestionWin.hide();
    }
  });
}

// ------- Floating icon window -------

function createOrShowIconWindow(text, screenX, screenY) {
  const W = 32;
  const H = 32;
  const GAP = 10;

  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const wa = display.workArea;

  let x = (screenX ?? cursor.x) + GAP;
  let y = (screenY ?? cursor.y) + GAP;
  if (x + W > wa.x + wa.width) x = wa.x + wa.width - W - 4;
  if (y + H > wa.y + wa.height) y = wa.y + wa.height - H - 4;
  if (x < wa.x) x = wa.x + 4;
  if (y < wa.y) y = wa.y + 4;

  const send = () => {
    iconWin.webContents.send("icon-text", text);
  };

  if (iconWin && !iconWin.isDestroyed()) {
    iconWin.setPosition(Math.round(x), Math.round(y), false);
    iconWin.showInactive();
    send();
    scheduleIconAutoHide();
    return;
  }

  iconWin = new BrowserWindow({
    width: W,
    height: H,
    x: Math.round(x),
    y: Math.round(y),
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    transparent: true,
    hasShadow: false,
    focusable: false, // don't steal focus from the user's current app
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  iconWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  iconWin.loadFile(path.join(__dirname, "renderer", "icon.html"));
  iconWin.once("ready-to-show", () => {
    iconWin.showInactive();
    send();
    scheduleIconAutoHide();
  });
}

function hideIconWindow() {
  if (autoHideIconTimer) {
    clearTimeout(autoHideIconTimer);
    autoHideIconTimer = null;
  }
  if (iconWin && !iconWin.isDestroyed() && iconWin.isVisible()) {
    iconWin.hide();
  }
}

function scheduleIconAutoHide() {
  if (autoHideIconTimer) clearTimeout(autoHideIconTimer);
  autoHideIconTimer = setTimeout(hideIconWindow, ICON_AUTO_HIDE_MS);
}

function isPointInsideIcon(x, y) {
  if (!iconWin || iconWin.isDestroyed() || !iconWin.isVisible()) return false;
  const [wx, wy] = iconWin.getPosition();
  const [ww, wh] = iconWin.getSize();
  return x >= wx && x <= wx + ww && y >= wy && y <= wy + wh;
}

function isPointInsideSuggestion(x, y) {
  if (!suggestionWin || suggestionWin.isDestroyed() || !suggestionWin.isVisible())
    return false;
  const [wx, wy] = suggestionWin.getPosition();
  const [ww, wh] = suggestionWin.getSize();
  return x >= wx && x <= wx + ww && y >= wy && y <= wy + wh;
}

// ------- Global mouse listener: detect drag-selection -------

async function handleGlobalMouseUp(e) {
  const start = mouseDownPos;
  mouseDownPos = null;

  // Click inside our own windows: ignore
  if (isPointInsideIcon(e.x, e.y) || isPointInsideSuggestion(e.x, e.y)) return;

  // Any click outside the icon dismisses it
  hideIconWindow();

  if (!start) return;
  const dx = e.x - start.x;
  const dy = e.y - start.y;
  const dragged = Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX;
  if (!dragged) return;

  // Synthesize copy and compare clipboard before/after
  const before = clipboard.readText();

  try {
    const mod = process.platform === "darwin" ? Key.LeftCmd : Key.LeftControl;
    await keyboard.pressKey(mod, Key.C);
    await keyboard.releaseKey(mod, Key.C);
  } catch (err) {
    // Usually fails when Accessibility permission hasn't been granted
    console.warn("auto-copy failed:", err?.message || err);
    return;
  }

  // Give the source app a moment to put the selection on the clipboard
  await new Promise((r) => setTimeout(r, 140));

  const after = clipboard.readText();
  if (!after || !after.trim()) return;
  if (after === before) return; // nothing selected / same content
  if (after === lastDetectedText) return;

  lastDetectedText = after;
  createOrShowIconWindow(after, e.x, e.y);
}

function startGlobalMouseHook() {
  uIOhook.on("mousedown", (e) => {
    mouseDownPos = { x: e.x, y: e.y };
  });
  uIOhook.on("mouseup", (e) => {
    handleGlobalMouseUp(e).catch((err) =>
      console.error("mouseup handler failed:", err)
    );
  });

  try {
    uIOhook.start();
    console.log("Global mouse hook started");
  } catch (err) {
    console.error("Failed to start uiohook:", err);
    new Notification({
      title: "Grammar Helper",
      body:
        "Could not start global mouse listener. On macOS, grant Accessibility permission in System Settings → Privacy & Security.",
    }).show();
  }
}

// ------- Legacy hotkey: still useful as a fallback -------

function handleHotkey() {
  const text = clipboard.readText();

  if (!text || !text.trim()) {
    new Notification({
      title: "Grammar Helper",
      body: "Copy some text first (⌘/Ctrl+C), then press the hotkey.",
      silent: true,
    }).show();
    return;
  }

  hideIconWindow();
  createOrShowSuggestionWindow(text);
}

// ------- IPC -------

ipcMain.on("icon-clicked", (_evt, text) => {
  hideIconWindow();
  const payload = typeof text === "string" && text.length ? text : lastDetectedText;
  if (payload) createOrShowSuggestionWindow(payload);
});

ipcMain.handle("check-text", async (_evt, text) => {
  await new Promise((r) => setTimeout(r, 400));

  const lower = text.toLowerCase();
  const out = [];

  if (lower.includes("your welcome")) {
    out.push({
      original: "your welcome",
      suggested: "you're welcome",
      explanation:
        "'You're' is the contraction of 'you are'. 'Your' is possessive.",
      category: "grammar",
    });
  }
  if (lower.includes("alot")) {
    out.push({
      original: "alot",
      suggested: "a lot",
      explanation: "'A lot' is always written as two words.",
      category: "spelling",
    });
  }
  if (/\bvery (good|bad|nice|big|small)\b/.test(lower)) {
    out.push({
      original: "very",
      suggested: "(stronger adjective)",
      explanation:
        "Try a stronger word instead of 'very + adjective' — e.g. excellent, awful, huge, tiny.",
      category: "style",
    });
  }
  if (/\bi am go\b|\bi goes\b|\bhe go\b/.test(lower)) {
    out.push({
      original: "go",
      suggested: "goes / going",
      explanation:
        "Check subject-verb agreement. Third-person singular needs -s in present simple.",
      category: "grammar",
    });
  }

  return out;
});

ipcMain.on("write-clipboard", (_evt, text) => {
  if (typeof text === "string") clipboard.writeText(text);
});

ipcMain.on("hide-window", () => {
  if (suggestionWin && !suggestionWin.isDestroyed()) suggestionWin.hide();
});

// ------- Tray icon -------

function createTray() {
  const icon = nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII="
  );
  tray = new Tray(icon);
  tray.setToolTip("Grammar Helper");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: `Hotkey: ${
          process.platform === "darwin" ? "⇧⌘G" : "Shift+Ctrl+G"
        }`,
        enabled: false,
      },
      { type: "separator" },
      {
        label: "Check clipboard now",
        click: () => handleHotkey(),
      },
      { type: "separator" },
      {
        label: "Quit Grammar Helper",
        click: () => {
          app.isQuitting = true;
          app.quit();
        },
      },
    ])
  );
}

// ------- App lifecycle -------

app.whenReady().then(() => {
  const shortcut =
    process.platform === "darwin" ? "Shift+Cmd+G" : "Shift+Ctrl+G";

  const ok = globalShortcut.register(shortcut, handleHotkey);
  if (!ok) {
    console.error("Failed to register global shortcut:", shortcut);
  } else {
    console.log("Global shortcut registered:", shortcut);
  }

  createTray();
  startGlobalMouseHook();
});

app.on("window-all-closed", () => {
  // Stay alive in the background — we're a tray app
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  try {
    uIOhook.stop();
  } catch {
    /* ignore */
  }
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
