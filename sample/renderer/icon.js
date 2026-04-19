// Tiny floating icon that appears next to selected text.
// Clicking it asks main to open the real suggestion popup.

let currentText = "";

window.api.onIconText((text) => {
  currentText = text;
});

document.getElementById("icon").addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  window.api.iconClicked(currentText);
});
