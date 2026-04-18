<!--
Version change: 1.0.0 → 1.1.0
List of modified principles: Updated Seamless Integration to include macOS
Added sections: None
Removed sections: None
Templates requiring updates: None
Follow-up TODOs: None
-->
# Zenith Constitution

## Core Principles

### Local AI First
All AI processing occurs locally on the user's machine. No data is sent to external servers. Ensures privacy and low latency.

### Vietnamese Engineering Focus
Designed specifically for Vietnamese software engineers. Prompts and variations cater to professional communication in Vietnamese context.

### Seamless Integration
Uses platform-specific UI automation (UI Automation on Windows, Accessibility API on macOS) to detect focus and inject text seamlessly into any application. Provides Grammarly-style experience.

### Proof of Concept Simplicity
Keep the implementation simple and focused. Avoid over-engineering. Prioritize core functionality over features.

### Error Resilience
Gracefully handle LLM unavailability or failures. Provide clear feedback to user without crashing.

## Technology Stack
Electron for cross-platform desktop app (Windows and macOS), Node.js backend, PowerShell for Windows UI Automation, AppleScript for macOS Accessibility, Local LLM via OpenAI-compatible API.

## Development Workflow
Rapid prototyping, manual testing on Windows and macOS, focus on user experience.

## Governance
Constitution guides development. Changes require documentation and testing.

**Version**: 1.1.0 | **Ratified**: 2026-04-18 | **Last Amended**: 2026-04-18
