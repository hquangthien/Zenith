# Tasks: macOS Support

**Feature**: macOS Support  
**Branch**: spec/001-mac-support  
**Date**: 2026-04-19  
**Plan**: [specs/001-macos-support/plan.md](specs/001-macos-support/plan.md)

**Implementation Strategy**: MVP first - complete User Story 1 for reliable FAB positioning in Slack and Teams using adapted selection detection.

## Phase 1: Setup

- [ ] T001 Configure macOS development environment and verify Node.js/Electron compatibility in src/package.json
- [ ] T002 Install selection detection dependencies (uiohook-napi, @nut-tree-fork/nut-js) in src/package.json
- [ ] T003 Set up Accessibility permissions handling and user prompts in src/main.js

## Phase 2: Foundational

- [ ] T004 [P] Integrate sample's mouse drag detection logic into src/main.js
- [ ] T005 [P] Integrate sample's clipboard monitoring for selection confirmation into src/main.js
- [ ] T006 Add textbox bounds calculation using Accessibility API in src/focusTracker.sh

## Phase 3: User Story 1 - Slack/Teams FAB Positioning

**Goal**: FAB appears at top right of textboxes in Slack and Teams when text is selected  
**Independent Test**: Select text in Slack/Teams input fields → FAB appears at top right within 200ms  
**Tests**: Manual testing in both apps, verify positioning accuracy

- [ ] T007 [P] [US1] Implement app detection logic for Slack and Teams in src/main.js
- [ ] T008 [US1] Add bounds calculation for Slack's web-based text areas in src/focusTracker.sh
- [ ] T009 [US1] Add bounds calculation for Teams' Microsoft UI elements in src/focusTracker.sh
- [ ] T010 [US1] Implement top-right positioning logic for detected textboxes in src/main.js
- [ ] T011 [US1] Test and validate FAB positioning in Slack in sample/main.js
- [ ] T012 [US1] Test and validate FAB positioning in Teams in sample/main.js

## Phase 4: Polish & Cross-Cutting Concerns

- [ ] T013 Optimize performance to meet <200ms response time requirement in src/main.js
- [ ] T014 Add error handling for bounds calculation failures in src/focusTracker.sh
- [ ] T015 Update documentation and quickstart guide in specs/001-macos-support/quickstart.md

## Dependencies

- T004, T005 depend on T001, T002
- T006 depends on T003
- T007-T012 depend on T004, T005, T006
- T013-T015 depend on T007-T012

## Parallel Execution

Tasks marked [P] can be executed in parallel:
- T004, T005 (foundational detection)
- T007 (app detection)

## MVP Scope

Complete User Story 1 (T007-T012) for basic macOS support in Slack and Teams.</content>
<parameter name="filePath">/Users/thien.hoang/Projects/Zenith/specs/001-macos-support/tasks.md