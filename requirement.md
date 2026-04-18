# Product Requirements Document: PoC Milestone

## 1. Overview & Objective
This Proof of Concept (PoC) aims to demonstrate the core value of our AI communication assistant for Vietnamese engineers. The focus is on rapid, low-latency implementation: capturing text, processing it via a locally hosted LLM, and displaying Grammarly-style inline suggestions. The system runs entirely locally to maximize speed and data privacy, with no database required for this initial milestone.

## 2. Architecture & Technology Stack
The system is built as a single desktop application communicating with a local AI service. Supports Windows and macOS.

* **Frontend/App (`zenith-app`):** Electron (HTML/CSS/JS or React) responsible for the UI, OS-level text interaction, the transparent desktop overlay, and application logic (via the Main process). Uses platform-specific scripts for focus detection and text injection.
* **Local LLM Provider:** A common local LLM engine that exposes a REST API (e.g., Ollama running on `localhost:1234` or LM Studio's local server).

## 3. UI/UX Requirements
The application must provide a native, unobtrusive, and frictionless experience similar to Grammarly.

* **Floating Action Button (FAB):** * A small, branded icon appears near the text cursor (or bottom right of the active text box) when the user pauses typing.
    * *Interaction:* Clicking the FAB triggers a "Loading..." state and makes an HTTP request to the local LLM API.
* **Suggestion Popover:** * Once the local LLM returns the response, the FAB expands into a small popover menu.
    * The menu displays 3 refined text variations (e.g., Professional, Peer, Standup).
* **One-Click Replacement:** * Clicking a variation automatically replaces the user's drafted text in the active window (using simulated keystrokes or clipboard injection).
* **Dismissal:** * Clicking outside the popover or pressing `Esc` closes the UI.

## 4. AI Integration (Local LLM API)
The Electron Main process will communicate directly with the local LLM provider's API.

* **API Call:** Sends the captured text to the local LLM endpoint (e.g., Gemma 4e2b OpenAI-compatible local endpoint).
* **System Prompt:** * *Prompt Directive:* "You are an AI assistant for a Vietnamese software engineer. Rewrite the following text into three variations: 1. Polite/Client-facing. 2. Direct/Peer-to-peer. 3. Daily Standup update. Do not alter any code snippets, variable names, or technical jargon. Output ONLY valid JSON."
* **Structured Output:** The system must enforce and parse a strict JSON response format from the local LLM before sending it to the Renderer process:
    ```json
    {
      "professional": "...",
      "peer": "...",
      "standup": "..."
    }
    ```
* **Error Handling:** If the local LLM engine is not running, times out, or returns malformed JSON (a common risk with smaller local models), the app must gracefully catch the error and display a fallback message in the UI ("Local AI is unavailable or processing failed.").
