// Cross-app focused-editable probe via UI Automation, driven by a PowerShell helper.
// Emits:
//   'focus' (rect)  — an editable field is focused; rect is { left, top, right, bottom } in screen coords
//   'lost'          — focus moved to a non-editable target (or no focus)
// Filters the parent Electron process so the FAB doesn't flicker while the popover is active.

const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');
const EventEmitter = require('events');

class FocusTracker extends EventEmitter {
  constructor() {
    super();
    this.child = null;
  }

  start() {
    if (this.child) return;

    const script = path.join(__dirname, 'focusTracker.ps1');
    const args = [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', script,
      '-OwnPid', String(process.pid),
    ];

    try {
      this.child = spawn('powershell.exe', args, { windowsHide: true });
    } catch (err) {
      console.error('[focusTracker] failed to spawn powershell:', err);
      return;
    }

    const rl = readline.createInterface({ input: this.child.stdout });
    rl.on('line', (line) => this._handleLine(line.trim()));

    this.child.stderr.on('data', (buf) => {
      const msg = buf.toString().trim();
      if (msg) console.error('[focusTracker stderr]', msg);
    });
    this.child.on('exit', (code, signal) => {
      if (code !== 0 && code !== null) {
        console.error('[focusTracker] exited code=' + code + ' signal=' + signal);
      }
      this.child = null;
    });
    this.child.on('error', (err) => {
      console.error('[focusTracker] child error:', err);
      this.child = null;
    });
  }

  stop() {
    if (!this.child) return;
    try { this.child.kill(); } catch { /* ignore */ }
    this.child = null;
  }

  _handleLine(line) {
    if (!line) return;
    if (line === 'NONE') {
      this.emit('lost');
      return;
    }
    if (line.startsWith('FOCUS|')) {
      const parts = line.split('|');
      const rect = {
        left: parseInt(parts[1], 10),
        top: parseInt(parts[2], 10),
        right: parseInt(parts[3], 10),
        bottom: parseInt(parts[4], 10),
      };
      if ([rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite)) {
        this.emit('focus', rect);
      }
    }
  }
}

module.exports = new FocusTracker();
