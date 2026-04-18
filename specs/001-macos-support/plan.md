# Implementation Plan: macOS Support

**Branch**: `001-macos-support` | **Date**: 2026-04-18 | **Spec**: [specs/001-macos-support/spec.md](specs/001-macos-support/spec.md)
**Input**: Feature specification from `/specs/001-macos-support/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Add macOS support to the Zenith desktop app, providing the same seamless text refinement experience as Windows. The implementation uses macOS Accessibility API for focus detection and AppleScript for text injection, maintaining cross-platform compatibility.

## Technical Context

**Language/Version**: JavaScript/Node.js (Electron 31.0.0)  
**Primary Dependencies**: Electron, osascript (AppleScript runtime)  
**Storage**: N/A (stateless desktop app)  
**Testing**: Manual testing on macOS 10.15+  
**Target Platform**: macOS 10.15+  
**Project Type**: Cross-platform desktop application  
**Performance Goals**: <200ms FAB appearance after focus change  
**Constraints**: Local AI processing, no network dependencies, graceful error handling  
**Scale/Scope**: Single-user desktop app with local LLM integration

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

✅ **Seamless Integration**: Uses platform-specific UI automation (Accessibility API on macOS)  
✅ **Technology Stack**: Electron for cross-platform, AppleScript for macOS integration  
✅ **Proof of Concept Simplicity**: Minimal changes to existing architecture  
✅ **Error Resilience**: Graceful handling of Accessibility permission issues  

All gates pass - no violations requiring justification.

## Project Structure

### Documentation (this feature)

```text
specs/001-macos-support/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── focusTracker.js      # UPDATED: Cross-platform focus detection
├── focusTracker.sh      # NEW: macOS focus tracker script
├── applyReplace.js      # UPDATED: Cross-platform text injection
├── applyReplace.sh      # NEW: macOS text injection script
├── main.js              # UPDATED: Platform detection and hotkey handling
├── preload.js           # NO CHANGE
├── renderer.js          # NO CHANGE
├── styles.css           # NO CHANGE
└── index.html           # NO CHANGE

.github/prompts/         # NO CHANGE
.specify/               # NO CHANGE
```

**Structure Decision**: Leverages existing Electron architecture with platform-specific helper scripts. No new directories needed - macOS support integrated into existing cross-platform structure.

## Complexity Tracking

No constitution violations - implementation stays within established patterns.