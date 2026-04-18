const { app, BrowserWindow, globalShortcut, ipcMain, screen, clipboard } = require('electron');
const path = require('path');
const http = require('http');
const focusTracker = require('./focusTracker');

const LLM_HOST = process.env.ZENITH_LLM_HOST || '127.0.0.1';
const LLM_PORT = Number(process.env.ZENITH_LLM_PORT || 1234);
const LLM_PATH = process.env.ZENITH_LLM_PATH || '/v1/chat/completions';
const LLM_MODEL = process.env.ZENITH_LLM_MODEL || 'gemma3:4b';
const LLM_TIMEOUT_MS = Number(process.env.ZENITH_LLM_TIMEOUT_MS || 20000);

const SYSTEM_PROMPT =
  'You are an AI assistant for a Vietnamese software engineer. ' +
  'Rewrite the following text into three variations: ' +
  '1. Polite/Client-facing. 2. Direct/Peer-to-peer. 3. Daily Standup update. ' +
  'Do not alter any code snippets, variable names, or technical jargon. ' +
  'Output ONLY valid JSON with exactly these keys: "professional", "peer", "standup".';

const COLLAPSED = { width: 72, height: 72 };
const EXPANDED = { width: 400, height: 460 };
const LOST_DEBOUNCE_MS = 220;

let overlayWindow = null;
let mode = 'hidden'; // 'hidden' | 'fab' | 'popover'
let losingTimer = null;

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
    focusable: true,
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
  mode = 'hidden';
}

function placeFabForRect(rect) {
  // Grammarly-style: anchor FAB at the field's bottom-right, slightly outside
  const x = rect.right - COLLAPSED.width + 16;
  const y = rect.bottom - COLLAPSED.height + 16;
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
      req.destroy(new Error('LLM request timed out'));
    });
    req.on('error', reject);
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

app.whenReady().then(() => {
  createOverlay();

  globalShortcut.register('CommandOrControl+Shift+Space', toggleOverlay);

  focusTracker.on('focus', (rect) => {
    if (!overlayWindow || mode === 'popover') return;
    cancelLosingTimer();
    const bounds = placeFabForRect(rect);
    showFabAt(bounds);
  });

  focusTracker.on('lost', () => {
    if (!overlayWindow || mode !== 'fab') return;
    cancelLosingTimer();
    // Debounce: absorbs the brief "focus lost" that fires when the user clicks the FAB
    // (the expand IPC will cancel this timer first).
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

  ipcMain.handle('clipboard:write', (_evt, text) => {
    clipboard.writeText(text ?? '');
    return true;
  });

  ipcMain.handle('overlay:expand', () => {
    if (!overlayWindow) return;
    cancelLosingTimer();
    mode = 'popover';
    const b = overlayWindow.getBounds();
    const bounds = clampToDisplay(b.x, b.y, EXPANDED.width, EXPANDED.height);
    overlayWindow.setBounds(bounds);
    overlayWindow.focus();
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
