const { app, BrowserWindow, globalShortcut, ipcMain, screen, clipboard } = require('electron');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const focusTracker = require('./focusTracker');

const LLM_HOST = process.env.ZENITH_LLM_HOST || '127.0.0.1';
const LLM_PORT = Number(process.env.ZENITH_LLM_PORT || 1234);
const LLM_PATH = process.env.ZENITH_LLM_PATH || '/v1/chat/completions';
const LLM_MODEL = process.env.ZENITH_LLM_MODEL || 'gemma3:4b';
const LLM_TIMEOUT_MS = Number(process.env.ZENITH_LLM_TIMEOUT_MS || 20000);

const SYSTEM_PROMPT =
  'You are an AI writing assistant for a Vietnamese software engineer. ' +
  'Rewrite the input text into three refined variations, ALWAYS IN ENGLISH regardless of the source language ' +
  '(if the input is Vietnamese or any other language, translate to English in the output): ' +
  '1. "professional" — polite, client-facing tone. ' +
  '2. "peer" — direct, peer-to-peer tone. ' +
  '3. "standup" — concise daily-standup update. ' +
  'Preserve code snippets, variable names, and technical jargon verbatim. ' +
  'Output ONLY a single valid JSON object with exactly these keys: "professional", "peer", "standup". ' +
  'No prose, no markdown fences, no commentary.';

const COLLAPSED = { width: 72, height: 72 };
const EXPANDED_WIDTH = 400;
const EXPANDED_INITIAL_HEIGHT = 220;
const EXPANDED_MIN_HEIGHT = 140;
const EXPANDED_MAX_HEIGHT = 560;
const LOST_DEBOUNCE_MS = 220;
const PASTE_DELAY_MS = 150;
const CLIPBOARD_RESTORE_MS = 700;
const GAP = 10;

let fabWindow = null;
let popoverWindow = null;
let mode = 'hidden'; // 'hidden' | 'fab' | 'popover'
let losingTimer = null;
let lastTargetHwnd = 0; // HWND of the user's editable window, captured in fab mode

function createFabWindow() {
  fabWindow = new BrowserWindow({
    width: COLLAPSED.width,
    height: COLLAPSED.height,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    hasShadow: false,
    focusable: false, // permanent — clicks don't steal focus from user's app
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  fabWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  fabWindow.setAlwaysOnTop(true, 'screen-saver');
  fabWindow.webContents.on('did-finish-load', () => {
    fabWindow.webContents.send('set-mode', 'fab');
  });
}

function createPopoverWindow() {
  popoverWindow = new BrowserWindow({
    width: EXPANDED_WIDTH,
    height: EXPANDED_INITIAL_HEIGHT,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    hasShadow: false,
    focusable: true, // permanent — show() activates it cleanly, blur fires on app switch
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  popoverWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  popoverWindow.setAlwaysOnTop(true, 'screen-saver');
  popoverWindow.webContents.on('did-finish-load', () => {
    popoverWindow.webContents.send('set-mode', 'popover');
  });
  popoverWindow.on('blur', () => {
    if (mode === 'popover') hideOverlay();
  });
}

function clampToDisplay(x, y, width, height) {
  const display = screen.getDisplayNearestPoint({ x, y });
  const wa = display.workArea;
  return {
    x: Math.max(wa.x, Math.min(x, wa.x + wa.width - width)),
    y: Math.max(wa.y, Math.min(y, wa.y + wa.height - height)),
    width,
    height,
  };
}

function cancelLosingTimer() {
  if (losingTimer) {
    clearTimeout(losingTimer);
    losingTimer = null;
  }
}

function hideOverlay() {
  cancelLosingTimer();
  if (fabWindow && fabWindow.isVisible()) fabWindow.hide();
  if (popoverWindow && popoverWindow.isVisible()) popoverWindow.hide();
  mode = 'hidden';
}

function placeFabForRect(rect) {
  // Top-right of the editable rect; FAB visual center ~= (rect.right - 20, rect.top + 20).
  const x = rect.right - COLLAPSED.width + 16;
  const y = rect.top - 16;
  return clampToDisplay(x, y, COLLAPSED.width, COLLAPSED.height);
}

function showFabAt(bounds) {
  if (!fabWindow) return;
  fabWindow.setBounds(bounds);
  if (mode !== 'fab') {
    fabWindow.showInactive();
    mode = 'fab';
  }
}

function showAtCursorFallback() {
  const cursor = screen.getCursorScreenPoint();
  const bounds = clampToDisplay(cursor.x + 8, cursor.y + 8, COLLAPSED.width, COLLAPSED.height);
  showFabAt(bounds);
}

function toggleOverlay() {
  if (!fabWindow) return;
  if (mode !== 'hidden') {
    hideOverlay();
  } else {
    showAtCursorFallback();
  }
}

function callLocalLLM(text) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: LLM_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
      temperature: 0.4,
      stream: false,
    });

    console.log(`[llm] POST http://${LLM_HOST}:${LLM_PORT}${LLM_PATH} model=${LLM_MODEL} bytes=${Buffer.byteLength(payload)}`);

    const req = http.request(
      {
        host: LLM_HOST,
        port: LLM_PORT,
        path: LLM_PATH,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: LLM_TIMEOUT_MS,
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          console.log(`[llm] response status=${res.statusCode} bytes=${body.length}`);
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`LLM HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
            return;
          }
          try {
            const parsed = JSON.parse(body);
            const content = parsed?.choices?.[0]?.message?.content;
            if (!content) throw new Error('Empty completion');
            resolve(parseVariations(content));
          } catch (err) {
            reject(err);
          }
        });
      }
    );

    req.on('timeout', () => {
      console.error('[llm] timeout');
      req.destroy(new Error('LLM request timed out'));
    });
    req.on('error', (err) => {
      console.error('[llm] error', err.message);
      reject(err);
    });
    req.write(payload);
    req.end();
  });
}

function parseVariations(content) {
  let raw = content.trim();
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  }
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) raw = raw.slice(firstBrace, lastBrace + 1);

  const obj = JSON.parse(raw);
  const professional = obj.professional ?? obj.polite ?? obj.client ?? '';
  const peer = obj.peer ?? obj.direct ?? '';
  const standup = obj.standup ?? obj.daily ?? '';
  if (!professional || !peer || !standup) {
    throw new Error('Missing required variations in LLM response');
  }
  return { professional, peer, standup };
}

async function captureSelectionFromTarget() {
  // FAB window is non-focusable, so clicking it didn't steal activation.
  // Ctrl+C goes to the user's app which still has foreground.
  const savedClipboard = clipboard.readText();
  const sentinel = '\u0001ZENITH_CAPTURE\u0001';
  try { clipboard.writeText(sentinel); } catch { /* ignore */ }

  const script = path.join(__dirname, 'captureSelection.ps1');
  await new Promise((resolve) => {
    try {
      const ps = spawn(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script],
        { windowsHide: true }
      );
      ps.on('exit', resolve);
      ps.on('error', (err) => { console.error('[capture] ps error', err.message); resolve(); });
    } catch (err) {
      console.error('[capture] spawn failed', err);
      resolve();
    }
  });

  await new Promise((r) => setTimeout(r, 120));

  let captured = '';
  try { captured = clipboard.readText() || ''; } catch { /* ignore */ }

  try { clipboard.writeText(savedClipboard); } catch { /* ignore */ }

  if (!captured || captured === sentinel) return '';
  return captured;
}

function pasteIntoPreviousApp(text) {
  const savedClipboard = clipboard.readText();
  clipboard.writeText(text ?? '');
  const targetHwnd = lastTargetHwnd;
  hideOverlay();

  if (process.platform === 'win32') {
    const script = path.join(__dirname, 'applyReplace.ps1');
    const args = [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', script,
      '-Hwnd', String(targetHwnd),
      '-DelayMs', String(PASTE_DELAY_MS),
    ];

    console.log(`[apply] paste helper hwnd=${targetHwnd} delay=${PASTE_DELAY_MS}ms`);
    try {
      const ps = spawn('powershell.exe', args, { windowsHide: true });
      ps.on('error', (err) => console.error('[apply] ps spawn error', err.message));
      ps.stderr.on('data', (d) => console.error('[apply stderr]', d.toString().trim()));
      ps.on('exit', (code) => console.log(`[apply] ps exit code=${code}`));
    } catch (err) {
      console.error('[apply] failed to spawn paste helper', err);
    }
  } else if (process.platform === 'darwin') {
    const script = path.join(__dirname, 'applyReplace.sh');
    const args = [script, String(PASTE_DELAY_MS)];

    console.log(`[apply] paste helper delay=${PASTE_DELAY_MS}ms`);
    try {
      const sh = spawn('/bin/bash', args);
      sh.on('error', (err) => console.error('[apply] sh spawn error', err.message));
      sh.stderr.on('data', (d) => console.error('[apply stderr]', d.toString().trim()));
      sh.on('exit', (code) => console.log(`[apply] sh exit code=${code}`));
    } catch (err) {
      console.error('[apply] failed to spawn paste helper', err);
    }
  } else {
    console.error('[apply] Unsupported platform for paste:', process.platform);
  }

  setTimeout(() => {
    try { clipboard.writeText(savedClipboard); } catch { /* ignore */ }
  }, CLIPBOARD_RESTORE_MS);
}

app.whenReady().then(() => {
  createFabWindow();
  createPopoverWindow();

  globalShortcut.register('CommandOrControl+Shift+Space', toggleOverlay);

  focusTracker.on('focus', (state) => {
    if (mode === 'popover') return;
    cancelLosingTimer();
    if (state.hwnd) lastTargetHwnd = state.hwnd;
    const bounds = placeFabForRect(state);
    showFabAt(bounds);
  });

  focusTracker.on('lost', () => {
    if (mode !== 'fab') return;
    cancelLosingTimer();
    losingTimer = setTimeout(() => {
      losingTimer = null;
      if (mode === 'fab') hideOverlay();
    }, LOST_DEBOUNCE_MS);
  });

  focusTracker.start();

  ipcMain.handle('llm:refine', async (_evt, text) => {
    if (!text || !text.trim()) throw new Error('No text provided');
    return callLocalLLM(text);
  });

  ipcMain.handle('apply:replace', (_evt, text) => {
    if (!text) return false;
    pasteIntoPreviousApp(text);
    return true;
  });

  ipcMain.handle('overlay:expand', async () => {
    if (!fabWindow || !popoverWindow) return;
    cancelLosingTimer();
    mode = 'popover';

    // Reset popover DOM to loading state NOW, while the window is still hidden.
    // The ~300ms capture below gives the renderer ample time to update before show().
    popoverWindow.webContents.send('overlay:reset-popover');

    const source = await captureSelectionFromTarget();
    console.log(`[capture] selection length=${source.length}`);

    // Anchor popover's bottom-right 10px from the FAB visual's top-left
    // (FAB visual top-left = fab window top-left + 20,20 because the 31px visual is centered in a 72px window).
    const fabBounds = fabWindow.getBounds();
    const anchorX = fabBounds.x + 20 - GAP;
    const anchorY = fabBounds.y + 20 - GAP;
    const popoverX = anchorX - EXPANDED_WIDTH;
    const popoverY = anchorY - EXPANDED_INITIAL_HEIGHT;
    const bounds = clampToDisplay(popoverX, popoverY, EXPANDED_WIDTH, EXPANDED_INITIAL_HEIGHT);

    fabWindow.hide();
    popoverWindow.setBounds(bounds);
    popoverWindow.show(); // activates cleanly (window was created focusable: true)
    popoverWindow.focus();

    popoverWindow.webContents.send('overlay:start-refine', { source });
  });

  ipcMain.handle('overlay:resize', (_evt, height) => {
    if (!popoverWindow || mode !== 'popover') return;
    const b = popoverWindow.getBounds();
    const h = Math.max(EXPANDED_MIN_HEIGHT, Math.min(EXPANDED_MAX_HEIGHT, Math.round(height)));
    if (Math.abs(h - b.height) < 2) return;
    // Keep popover's bottom anchored (grow upward, preserving top-left-of-FAB alignment).
    const newY = b.y + b.height - h;
    const bounds = clampToDisplay(b.x, newY, EXPANDED_WIDTH, h);
    popoverWindow.setBounds(bounds);
  });

  ipcMain.on('overlay:hide', () => hideOverlay());
});

app.on('will-quit', () => {
  focusTracker.stop();
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
