# Quickstart: macOS Support Testing

**Date**: 2026-04-18
**Purpose**: Guide for testing macOS support functionality

## Prerequisites

- macOS 10.15 or later
- Node.js 18+
- Local LLM server (LM Studio or Ollama) running on localhost:1234
- Grant Accessibility permissions to Electron/Terminal apps

## Setup

1. **Grant Permissions**:
   - Open System Preferences > Security & Privacy > Privacy > Accessibility
   - Add and enable Terminal, Electron, or the built app

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Start Development**:
   ```bash
   npm run dev
   ```

## Testing Scenarios

### Scenario 1: Automatic Focus Detection
1. Open a text editor (TextEdit, VS Code, etc.)
2. Focus on a text field
3. Verify FAB appears near the text field
4. Type some text, copy it
5. Click FAB to see suggestions

### Scenario 2: Hotkey Fallback
1. Open any application
2. Press `Cmd+Shift+Space`
3. Verify FAB appears near cursor
4. Copy text and test refinement

### Scenario 3: Error Handling
1. Revoke Accessibility permissions
2. Try focus detection - should fail gracefully
3. Hotkey should still work

## Expected Behavior

- FAB appears within 200ms of focus change
- Text injection works via Cmd+V
- No crashes or errors
- Graceful fallback when permissions denied

## Troubleshooting

- **FAB doesn't appear**: Check Accessibility permissions
- **Text not injected**: Ensure target app is focused
- **Script errors**: Check macOS version compatibility