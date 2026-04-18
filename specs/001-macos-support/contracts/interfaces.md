# Phase 1 Contracts: macOS Support

**Date**: 2026-04-18

## Interface Contracts

This feature extends existing interfaces to support macOS without breaking changes.

### FocusTracker Interface

**Existing Contract**:
```javascript
class FocusTracker {
  start() // Begins focus monitoring
  stop()  // Stops focus monitoring
  // emits 'focus' (rect) and 'lost' events
}
```

**Extension**: No interface changes. Internal implementation detects OS and uses appropriate mechanism.

### TextInjector Interface

**Existing Contract**:
```javascript
function pasteIntoPreviousApp(text) // Injects text into last focused app
```

**Extension**: Detects OS and uses Cmd+V on macOS instead of Ctrl+V.

## No Breaking Changes

- All existing APIs remain compatible
- macOS support is additive functionality
- Windows behavior unchanged