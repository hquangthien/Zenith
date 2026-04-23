# Zenith — AI Communication Assistant (PoC)

Local-first desktop overlay for Vietnamese engineers. Paste a draft, get three refined variations (Professional / Peer / Standup) from a locally hosted LLM.

## Prerequisites

- **Windows 10/11 or macOS 10.15+** (focus detection uses UI Automation on Windows via bundled PowerShell, or Accessibility API on macOS via AppleScript — Linux not supported in this milestone)
- Node.js 18+
- Windows: Windows PowerShell 5.1 (shipped with Windows) or PowerShell 7
- macOS: No additional requirements
- A local LLM engine exposing an **OpenAI-compatible** `/v1/chat/completions` endpoint:
  - **LM Studio** (default, port 1234) with its local server enabled
  - or **Ollama** on port 11434: `ollama serve` then `ollama pull gemma3:4b`

## Install & Run

```bash
npm install
npm start        # normal run
npm run dev      # hot-reload: restarts main on main-file changes, reloads renderer on renderer changes
```

## Usage (Grammarly-style, auto-attach on focus)

1. Focus any editable text field in any Windows app — the teal **Z** FAB appears just under your caret.
2. Type or edit your draft in the field; when ready, copy it (`Ctrl+C`).
3. Click the FAB — it expands into a suggestion card, refines the clipboard text, and shows three variations (Professional / Peer / Standup), each with a colored accent stripe.
4. Click any variation — it's copied to the clipboard; paste (`Ctrl+V`) back into your target field.
5. Press **`Esc`** or click outside to dismiss. If the FAB doesn't appear (some Electron/Chromium fields don't expose a caret to the Win32 layer), press **`Ctrl+Shift+Space`** to force-show it near your cursor.

### Detection

Focus tracking uses **UI Automation** on Windows (via a small PowerShell helper that calls `System.Windows.Automation.AutomationElement.FocusedElement`) or **Accessibility API** on macOS (via AppleScript). An element is considered editable if it exposes a `ValuePattern` or `TextPattern` on Windows, or has role `AXTextField`, `AXTextArea`, or `AXComboBox` on macOS. This covers native controls, browsers, Electron/Chromium apps (Teams, Slack, VS Code, Discord), and most WinUI/XAML apps on Windows, and similar on macOS.

If a specific app doesn't expose automation data (rare), press **`Ctrl+Shift+Space`** (or **`Cmd+Shift+Space`** on macOS) to force-show the FAB near your cursor.

## Configuration

Override via environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `ZENITH_LLM_HOST` | `127.0.0.1` | LLM host |
| `ZENITH_LLM_PORT` | `1234` | LLM port (LM Studio default; Ollama is `11434`) |
| `ZENITH_LLM_PATH` | `/v1/chat/completions` | OpenAI-compatible endpoint |
| `ZENITH_LLM_MODEL` | `gemma3:4b` | Model name |
| `ZENITH_LLM_TIMEOUT_MS` | `20000` | Request timeout |

Example for Ollama:

```bash
set ZENITH_LLM_PORT=11434
npm start
```

## Architecture

- **Main process** ([src/main.js](src/main.js)) — frameless transparent overlay, tri-state mode (`hidden` / `fab` / `popover`), HTTP call to local LLM, JSON parsing with fallback extraction. Debounces focus-lost events (220ms) so the brief self-focus during FAB click doesn't flicker the overlay.
- **Focus tracker** ([src/focusTracker.js](src/focusTracker.js) + [src/focusTracker.ps1](src/focusTracker.ps1)) — spawns a PowerShell child that polls `AutomationElement.FocusedElement` every 200ms, checks `ValuePattern`/`TextPattern` for editability, and streams `FOCUS|left|top|right|bottom` or `NONE` lines on stdout. PS process self-filters Zenith's own PID and sets itself per-monitor-v2 DPI aware to align coords with Electron.
- **Preload** ([src/preload.js](src/preload.js)) — context-isolated IPC bridge.
- **Renderer** ([src/renderer/](src/renderer/)) — FAB view, expandable popover, suggestion cards with colored accent stripes, clipboard copy on apply.

## Notes

- This PoC uses a clipboard-based replacement flow. True in-place keystroke injection into arbitrary windows requires synthesizing input events and is out of scope for this milestone.
- If the LLM is unreachable, times out, or returns malformed JSON, the overlay shows: *"Local AI is unavailable or processing failed."*
