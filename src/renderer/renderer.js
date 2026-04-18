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

let role = 'fab'; // 'fab' or 'popover' — set by main via onSetMode
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

function resetPopoverState() {
  variations = null;
  activeKey = 'professional';
  setActiveTab('professional');
  draftTextEl.textContent = '';
  errorEl.hidden = true;
  draftEl.hidden = true;
  // Loader visible by default so the next show lands on the loading state, not stale content.
  loaderEl.hidden = false;
  applyBtn.classList.remove('applied');
  lastReportedHeight = 0;
}

tabs.forEach((t) => {
  t.addEventListener('click', () => setActiveTab(t.dataset.key));
});

applyBtn.addEventListener('click', async () => {
  if (!variations) return;
  const text = variations[activeKey];
  if (!text) return;
  applyBtn.classList.add('applied');
  await window.zenith.applyReplacement(text);
});

async function startRefine() {
  if (!currentSource.trim()) {
    setError('No text selected. Select some text and click the Z button.');
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

// FAB click (only effective in the FAB window; popoverView is shown elsewhere).
fabBtn.addEventListener('click', () => {
  window.zenith.expand();
});

retryBtn.addEventListener('click', () => startRefine());

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.zenith.hide();
});

// Report popover height so main can size the window to content.
const ro = new ResizeObserver(() => {
  if (role !== 'popover' || popoverView.hidden) return;
  const h = Math.ceil(popoverView.getBoundingClientRect().height);
  if (h <= 0 || Math.abs(h - lastReportedHeight) < 2) return;
  lastReportedHeight = h;
  window.zenith.resizePopover(h);
});
ro.observe(popoverView);

window.zenith.onSetMode((r) => {
  role = r;
  if (r === 'fab') {
    showFab();
  } else {
    showPopover();
    resetPopoverState();
  }
});

window.zenith.onResetPopover(() => {
  resetPopoverState();
});

window.zenith.onStartRefine(({ source }) => {
  currentSource = source || '';
  startRefine();
});
