# Phase 0 Research: macOS Support

**Date**: 2026-04-18
**Purpose**: Research technical feasibility and approach for macOS support

## Research Questions

### 1. macOS Accessibility API Capabilities
**Question**: Can Accessibility API reliably detect focused text fields in common macOS applications?

**Findings**:
- Accessibility API provides access to UI elements via `System Events` application
- Can query `focused of window` to get currently focused element
- Supports element properties: `role`, `position`, `size`, `value`
- Requires user permission in System Preferences > Security & Privacy > Accessibility

**Conclusion**: Feasible for basic focus detection. May have limitations in some apps (e.g., Electron-based apps with custom rendering).

### 2. AppleScript Integration
**Question**: How to execute AppleScript from Node.js for focus detection and text injection?

**Findings**:
- Use `osascript` command-line tool to execute AppleScript
- Can pass scripts via `-e` flag or files
- Supports error handling with `try`/`on error`
- Text injection via `keystroke` command with `command down` modifier

**Conclusion**: Straightforward integration using child_process.spawn with osascript.

### 3. Cross-Platform Architecture
**Question**: How to structure code for Windows/macOS dual support?

**Findings**:
- Use `process.platform` to detect OS
- Separate helper scripts for each platform
- Shared JavaScript logic with platform-specific execution
- Hotkey handling already cross-platform in Electron

**Conclusion**: Current architecture supports extension - add macOS branches to existing platform checks.

### 4. Performance Considerations
**Question**: Can macOS implementation meet <200ms response time requirement?

**Findings**:
- AppleScript execution has ~50-100ms overhead
- Polling frequency can be adjusted (currently 200ms)
- Accessibility API queries are fast when permissions granted

**Conclusion**: Should meet requirements with proper optimization.

### 5. Error Handling
**Question**: How to handle Accessibility permission denial gracefully?

**Findings**:
- AppleScript will fail with permission errors
- Can detect failure and fall back to hotkey-only mode
- User can be prompted to grant permissions

**Conclusion**: Implement graceful degradation to hotkey mode.

## Technical Approach

### Focus Detection
- Use AppleScript via `osascript` to query `System Events`
- Poll every 200ms for focused element changes
- Check element role against known editable types
- Return bounding rectangle for FAB positioning

### Text Injection
- Use AppleScript `keystroke "v" using command down`
- Execute after delay to allow window activation

### Platform Detection
- Extend existing `process.platform === 'darwin'` checks
- Load appropriate helper scripts based on platform

## Risks & Mitigations

- **Risk**: Accessibility permissions not granted
  - **Mitigation**: Clear error message with instructions, fallback to hotkey

- **Risk**: AppleScript performance issues
  - **Mitigation**: Optimize polling frequency, cache results

- **Risk**: Inconsistent behavior across macOS apps
  - **Mitigation**: Document limitations, rely on hotkey fallback

## Recommendation

Proceed with implementation using AppleScript + Accessibility API. The approach aligns with existing Windows implementation and should provide equivalent functionality.