# Feature Specification: macOS Support

**Feature Branch**: `001-macos-support`  
**Created**: 2026-04-18  
**Status**: Draft  
**Input**: User description: "now we want the app to support MacOs as well, the behavior should be exactly like windows"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Automatic Focus Detection on macOS (Priority: P1)

As a macOS user, I want the app to automatically detect when I focus on editable text fields in any application, so that the FAB appears seamlessly just like on Windows.

**Why this priority**: This is the core functionality that provides the same user experience as Windows, making the app truly cross-platform.

**Independent Test**: Can be tested by focusing on text fields in various macOS apps (Safari, TextEdit, VS Code) and verifying the FAB appears at the correct position.

**Acceptance Scenarios**:

1. **Given** user focuses on a text field in a macOS application, **When** the field is editable, **Then** the FAB appears near the caret position
2. **Given** user switches focus to a non-editable element, **When** focus changes, **Then** the FAB disappears

---

### User Story 2 - Hotkey Fallback on macOS (Priority: P2)

As a macOS user, I want to use Cmd+Shift+Space to manually show the FAB near my cursor when automatic detection doesn't work.

**Why this priority**: Provides a reliable fallback when Accessibility API limitations prevent automatic detection in certain apps.

**Independent Test**: Can be tested by pressing Cmd+Shift+Space in any application and verifying the FAB appears near the cursor.

**Acceptance Scenarios**:

1. **Given** user presses Cmd+Shift+Space, **When** no FAB is visible, **Then** FAB appears near cursor position
2. **Given** FAB is visible, **When** user presses Cmd+Shift+Space again, **Then** FAB remains or behavior is consistent

---

### Edge Cases

- What happens when Accessibility permissions are not granted?
- How does system handle apps that don't expose UI elements properly?
- What happens when multiple displays are used?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST detect OS at startup and use appropriate focus tracking mechanism
- **FR-002**: System MUST use Accessibility API on macOS for focus detection
- **FR-003**: System MUST support Cmd+Shift+Space hotkey on macOS for manual FAB activation
- **FR-004**: System MUST inject text using Cmd+V on macOS
- **FR-005**: System MUST handle macOS-specific UI element roles (AXTextField, AXTextArea, AXComboBox)

### Key Entities *(include if feature involves data)*

- **FocusTracker**: Cross-platform focus detection component
- **TextInjector**: Platform-specific text injection mechanism

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: macOS users can complete text refinement workflow in under 30 seconds
- **SC-002**: FAB appears within 200ms of focus change in supported macOS apps
- **SC-003**: 95% of macOS users can successfully use the app without manual hotkey fallback
- **SC-004**: No crashes or errors when running on macOS

## Assumptions

- Users will grant Accessibility permissions when prompted
- macOS 10.15+ is the minimum supported version
- Local LLM setup works identically on macOS