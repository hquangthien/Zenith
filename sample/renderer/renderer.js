// Renderer runs in a sandboxed Chromium tab. We can only talk to the
// main process through the `window.api` object exposed in preload.js.

const originalEl = document.getElementById("original");
const loadingEl = document.getElementById("loading");
const suggestionsEl = document.getElementById("suggestions");
const closeBtn = document.getElementById("close-btn");
const dragRegion = document.getElementById("drag-region");

let currentText = "";

// Make the header draggable (CSS handles this via -webkit-app-region,
// but we also want the close button to NOT be a drag target)
dragRegion.style.webkitAppRegion = "drag";
closeBtn.style.webkitAppRegion = "no-drag";

closeBtn.addEventListener("click", () => window.api.hideWindow());

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") window.api.hideWindow();
});

// ---- Main entry point ----
window.api.onTextSelected((text) => {
  analyze(text);
});

async function analyze(text) {
  currentText = text;
  originalEl.textContent = text;
  suggestionsEl.innerHTML = "";
  loadingEl.hidden = false;

  try {
    const results = await window.api.checkText(text);
    renderSuggestions(results);
  } catch (err) {
    suggestionsEl.innerHTML = `<div class="error">Error: ${escapeHtml(
      String(err)
    )}</div>`;
  } finally {
    loadingEl.hidden = true;
  }
}

function renderSuggestions(suggestions) {
  if (!suggestions.length) {
    suggestionsEl.innerHTML = `<div class="empty">No issues found ✓</div>`;
    return;
  }

  for (const s of suggestions) {
    const card = document.createElement("div");
    card.className = `suggestion cat-${s.category}`;
    card.innerHTML = `
      <div class="tag">${escapeHtml(s.category)}</div>
      <div class="change">
        <span class="old">${escapeHtml(s.original)}</span>
        <span class="arrow">→</span>
        <span class="new">${escapeHtml(s.suggested)}</span>
      </div>
      <div class="explanation">${escapeHtml(s.explanation)}</div>
      <button class="apply">Apply fix</button>
    `;

    card.querySelector(".apply").addEventListener("click", () => {
      const fixed = currentText.split(s.original).join(s.suggested);
      window.api.writeClipboard(fixed);
      currentText = fixed;
      originalEl.textContent = fixed;
      card.classList.add("applied");
      toast("Copied ✓ — paste it back with ⌘/Ctrl+V");
    });

    suggestionsEl.appendChild(card);
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}
