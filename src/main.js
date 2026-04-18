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

let overlayWindow = null;
let mode = 'hidden'; // 'hidden' | 'fab' | 'popover'
let losingTimer = null;
let lastTargetHwnd = 0; // HWND of the user's editable window, captured while in fab mode

function createOverlay() {
  overlayWindow = new BrowserWindow({
    width: COLLAPSED.width,
    height: COLLAPSED.height,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    hasShadow: false,
    focusable: false, // FAB mode: clicks don't steal focus from the user's app
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  overlayWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');

  overlayWindow.on('blur', () => {
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
  if (overlayWindow && overlayWindow.isVisible()) overlayWindow.hide();
  if (overlayWindow) overlayWindow.setFocusable(false); // ready for next FAB show
  mode = 'hidden';
}

function placeFabForRect(rect) {
  // Anchor FAB at the top-right corner of the editable rect.
  // FAB visual is 31px centered in a 72px window; this positions the visual center
  // at (rect.right - 20, rect.top + 20) — slightly inside the corner.
  const x = rect.right - COLLAPSED.width + 16;
  const y = rect.top - 16;
  return clampToDisplay(x, y, COLLAPSED.width, COLLAPSED.height);
}

function showFabAt(bounds) {
  overlayWindow.setBounds(bounds);
  if (mode !== 'fab') {
    const source = clipboard.readText() || '';
    overlayWindow.webContents.send('overlay:reset', { source });
    overlayWindow.showInactive();
    mode = 'fab';
  }
}

function showAtCursorFallback() {
  const cursor = screen.getCursorScreenPoint();
  const bounds = clampToDisplay(cursor.x + 8, cursor.y + 8, COLLAPSED.width, COLLAPSED.height);
  showFabAt(bounds);
}

function toggleOverlay() {
  if (!overlayWindow) return;
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
  // Since the FAB window is non-focusable, the user's app still has foreground at click time.
  // We send Ctrl+C to copy the selection, read it, and restore the original clipboard.
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

  // Small wait for the clipboard to actually receive the copied selection.
  await new Promise((r) => setTimeout(r, 120));

  let captured = '';
  try { captured = clipboard.readText() || ''; } catch { /* ignore */ }

  // Restore the user's original clipboard.
  try { clipboard.writeText(savedClipboard); } catch { /* ignore */ }

  if (!captured || captured === sentinel) return '';
  return captured;
}

function pasteIntoPreviousApp(text) {
  const savedClipboard = clipboard.readText();
  clipboard.writeText(text ?? '');
  const targetHwnd = lastTargetHwnd;
  hideOverlay();

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

  setTimeout(() => {
    try { clipboard.writeText(savedClipboard); } catch { /* ignore */ }
  }, CLIPBOARD_RESTORE_MS);
}

app.whenReady().then(() => {
  createOverlay();

  globalShortcut.register('CommandOrControl+Shift+Space', toggleOverlay);

  focusTracker.on('focus', (state) => {
    if (!overlayWindow || mode === 'popover') return;
    cancelLosingTimer();
    if (state.hwnd) lastTargetHwnd = state.hwnd;
    const bounds = placeFabForRect(state);
    showFabAt(bounds);
  });

  focusTracker.on('lost', () => {
    if (!overlayWindow || mode !== 'fab') return;
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
    if (!overlayWindow) return { source: '' };
    cancelLosingTimer();
    mode = 'popover';

    // Capture the selection from the user's app FIRST, while it still has foreground
    // (the FAB window is non-focusable, so clicking it didn't steal activation).
    const source = await captureSelectionFromTarget();
    console.log(`[capture] selection length=${source.length}`);

    // Anchor the popover's bottom-right near the FAB visual's top-left (with a small gap),
    // so the popover appears to the top-left of the button.
    const fabBounds = overlayWindow.getBounds();
    const GAP = 8;
    const anchorX = fabBounds.x + 20 - GAP; // FAB visual top-left X = fab_x + 20
    const anchorY = fabBounds.y + 20 - GAP; // FAB visual top-left Y = fab_y + 20
    const popoverX = anchorX - EXPANDED_WIDTH;
    const popoverY = anchorY - EXPANDED_INITIAL_HEIGHT;

    overlayWindow.setFocusable(true);
    const bounds = clampToDisplay(popoverX, popoverY, EXPANDED_WIDTH, EXPANDED_INITIAL_HEIGHT);
    overlayWindow.setBounds(bounds);
    overlayWindow.focus();
    return { source };
  });

  ipcMain.handle('overlay:resize', (_evt, height) => {
    if (!overlayWindow || mode !== 'popover') return;
    const b = overlayWindow.getBounds();
    const h = Math.max(EXPANDED_MIN_HEIGHT, Math.min(EXPANDED_MAX_HEIGHT, Math.round(height)));
    if (Math.abs(h - b.height) < 2) return;
    // Keep the popover's bottom edge anchored (it grows upward, preserving the
    // bottom-right alignment with the FAB's top-left).
    const newY = b.y + b.height - h;
    const bounds = clampToDisplay(b.x, newY, EXPANDED_WIDTH, h);
    overlayWindow.setBounds(bounds);
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
