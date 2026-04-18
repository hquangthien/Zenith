const fabView = document.getElementById('fabView');
const popoverView = document.getElementById('popoverView');
const fabBtn = document.getElementById('fabBtn');
const closeBtn = document.getElementById('closeBtn');
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
  await window.zenith.copyToClipboard(text);
  applyBtn.classList.add('applied');
  setTimeout(() => window.zenith.hide(), 480);
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
  await window.zenith.expand();
  startRefine();
});

closeBtn.addEventListener('click', () => window.zenith.hide());
retryBtn.addEventListener('click', () => startRefine());

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.zenith.hide();
});

window.zenith.onReset(({ source }) => {
  currentSource = source || '';
  variations = null;
  activeKey = 'professional';
  setActiveTab('professional');
  errorEl.hidden = true;
  loaderEl.hidden = true;
  draftEl.hidden = true;
  showFab();
});
