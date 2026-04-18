const fabView = document.getElementById('fabView');
const popoverView = document.getElementById('popoverView');
const fabBtn = document.getElementById('fabBtn');
const loaderEl = document.getElementById('loader');
const errorEl = document.getElementById('error');
const errorMsgEl = errorEl.querySelector('.error__msg');
const retryBtn = document.getElementById('retryBtn');
const draftEl = document.getElementById('draft');
const draftTextEl = document.getElementById('draftText');
const applyBtn = document.getElementById('applyBtn');
const tabs = document.querySelectorAll('.tab');

let currentSource = '';
let variations = null;
let activeKey = 'professional';
let lastReportedHeight = 0;

function showFab() {
  fabView.hidden = false;
  popoverView.hidden = true;
}

function showPopover() {
  fabView.hidden = true;
  popoverView.hidden = false;
}

function setLoading(on) {
  loaderEl.hidden = !on;
  if (on) {
    draftEl.hidden = true;
    errorEl.hidden = true;
  }
}

function setError(msg) {
  loaderEl.hidden = true;
  draftEl.hidden = true;
  errorMsgEl.textContent = msg;
  errorEl.hidden = false;
}

function setActiveTab(key) {
  activeKey = key;
  tabs.forEach((t) => {
    const active = t.dataset.key === key;
    t.classList.toggle('tab--active', active);
    t.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  applyBtn.classList.remove('applied');
  if (variations) {
    draftTextEl.textContent = `"${variations[key] || ''}"`;
  }
}

function renderVariations(data) {
  variations = data;
  loaderEl.hidden = true;
  errorEl.hidden = true;
  draftEl.hidden = false;
  setActiveTab(activeKey);
}

tabs.forEach((t) => {
  t.addEventListener('click', () => setActiveTab(t.dataset.key));
});

applyBtn.addEventListener('click', async () => {
  if (!variations) return;
  const text = variations[activeKey];
  if (!text) return;
  applyBtn.classList.add('applied');
  // Main will handle clipboard, hide Zenith, send Ctrl+V to previous app, then restore clipboard.
  await window.zenith.applyReplacement(text);
});

async function startRefine() {
  if (!currentSource.trim()) {
    setError('No text in clipboard. Copy some text (Ctrl+C) and reopen Zenith.');
    return;
  }
  setLoading(true);
  try {
    const data = await window.zenith.refine(currentSource);
    renderVariations(data);
  } catch (err) {
    console.error(err);
    setError('Local AI is unavailable or processing failed.');
  }
}

fabBtn.addEventListener('click', async () => {
  showPopover();
  const result = await window.zenith.expand();
  if (result && typeof result.source === 'string' && result.source.trim()) {
    currentSource = result.source;
  }
  startRefine();
});

retryBtn.addEventListener('click', () => startRefine());

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.zenith.hide();
});

// Size the window to the popover's natural height.
const ro = new ResizeObserver(() => {
  if (popoverView.hidden) return;
  const h = Math.ceil(popoverView.getBoundingClientRect().height);
  if (h <= 0 || Math.abs(h - lastReportedHeight) < 2) return;
  lastReportedHeight = h;
  window.zenith.resizePopover(h);
});
ro.observe(popoverView);

window.zenith.onReset(({ source }) => {
  currentSource = source || '';
  variations = null;
  activeKey = 'professional';
  setActiveTab('professional');
  errorEl.hidden = true;
  loaderEl.hidden = true;
  draftEl.hidden = true;
  lastReportedHeight = 0;
  showFab();
});
