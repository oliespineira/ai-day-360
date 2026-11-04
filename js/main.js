import { PLAYLIST_ID } from './config.js';
import { STRINGS } from './strings.js';
import { startBackground } from './background.js';
import { fetchPlaylist, readCache, isConfigured, thumb } from './playlist.js';
import { createViewer } from './viewer.js';

const $ = (selector) => document.querySelector(selector);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// The Meta Quest browser can't show YouTube's 360° controls inside our iframe,
// so on Quest we send people straight to the video on youtube.com instead.
const isQuest = () => /OculusBrowser/i.test(navigator.userAgent);

let lang = pickLanguage();
let items = [];
let state = 'loading'; // loading | ready | empty | error | config
let lastFetch = 0;
let openedFromHash = false;

// ---------- Language ----------
function pickLanguage() {
  try {
    const saved = localStorage.getItem('aiday-lang');
    if (saved === 'en' || saved === 'es') return saved;
  } catch { /* storage unavailable */ }
  return (navigator.language || '').toLowerCase().startsWith('es') ? 'es' : 'en';
}

function t(key, ...args) {
  const value = STRINGS[lang][key] ?? STRINGS.en[key] ?? '';
  return typeof value === 'function' ? value(...args) : value;
}

function applyStrings() {
  document.documentElement.lang = lang;
  document.title = t('pageTitle');
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-label]')) el.setAttribute('aria-label', t(el.dataset.i18nLabel));
  for (const button of document.querySelectorAll('[data-lang]')) {
    button.setAttribute('aria-pressed', String(button.dataset.lang === lang));
  }
  $('#questHint').hidden = !isQuest();
  const quest2 = document.querySelector('[data-i18n="quest2"]');
  const quest3 = document.querySelector('[data-i18n="quest3"]');
  if (isQuest()) {
    document.querySelector('[data-i18n="quest1"]').textContent = t('questOpenHint');
    quest2.hidden = true;
    quest3.hidden = true;
  } else {
    quest2.hidden = false;
    quest3.hidden = false;
  }
  renderStatus();
  renderCards();
  viewer.refresh();
}

for (const button of document.querySelectorAll('[data-lang]')) {
  button.addEventListener('click', () => {
    lang = button.dataset.lang;
    try { localStorage.setItem('aiday-lang', lang); } catch { /* ignore */ }
    $('#heroTitle').textContent = t('heroTitle');
    applyStrings();
  });
}

// ---------- Hero title "decode" animation ----------
function decodeTitle(el, text) {
  if (reducedMotion.matches) { el.textContent = text; return; }
  const glyphs = '▚▞▙▟▛▜░▒<>/\\|=+*01';
  const duration = 1100;
  const start = performance.now();
  const tick = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const revealed = Math.floor(progress * text.length);
    let out = text.slice(0, revealed);
    for (let i = revealed; i < text.length; i++) {
      out += text[i] === ' ' ? ' ' : glyphs[(Math.random() * glyphs.length) | 0];
    }
    el.textContent = out;
    if (progress < 1) requestAnimationFrame(tick);
    else el.textContent = text;
  };
  requestAnimationFrame(tick);
}

// ---------- Status and cards ----------
function setState(next) {
  state = next;
  renderStatus();
  renderCards();
}

function renderStatus() {
  const status = $('#status');
  status.replaceChildren();
  const text = document.createElement('span');
  if (state === 'loading') text.textContent = t('loading');
  else if (state === 'ready') text.textContent = t('count', items.length);
  else if (state === 'empty') text.textContent = t('empty');
  else if (state === 'config') text.textContent = t('errorConfig');
  else if (state === 'error') text.textContent = t('errorPlaylist');
  status.append(text);

  if (state === 'error') {
    const reload = document.createElement('button');
    reload.type = 'button';
    reload.className = 'btn';
    reload.textContent = t('reload');
    reload.addEventListener('click', () => location.reload());
    status.append(reload);
  }
  $('#startBtn').disabled = !items.length;
}

function renderCards() {
  const list = $('#cards');
  if (state === 'loading' && !items.length) {
    list.replaceChildren(...Array.from({ length: 3 }, () => {
      const li = document.createElement('li');
      li.innerHTML = '<div class="card-skeleton"></div>';
      li.setAttribute('aria-hidden', 'true');
      return li;
    }));
    return;
  }

  list.replaceChildren(...items.map((item, i) => {
    const li = document.createElement('li');
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'card';

    const media = document.createElement('span');
    media.className = 'card-media';
    const img = document.createElement('img');
    img.src = thumb(item.id);
    img.alt = '';
    img.loading = 'lazy';
    img.addEventListener('error', () => { img.src = thumb(item.id, 'mqdefault'); }, { once: true });
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = t('badge');
    media.append(img, badge);

    const textWrap = document.createElement('span');
    textWrap.className = 'card-text';
    if (item.group) {
      const group = document.createElement('span');
      group.className = 'card-group';
      group.textContent = item.group;
      textWrap.append(group);
    }
    const title = document.createElement('span');
    title.className = 'card-title';
    title.textContent = item.title || t('untitled', i + 1);
    textWrap.append(title);

    card.append(media, textWrap);
    card.addEventListener('click', () => openFilm(i));
    li.append(card);
    return li;
  }));
}

// On Quest, skip the in-site viewer (it can't show YouTube's 360° controls)
// and go straight to the video on youtube.com, in the same tab.
function openFilm(i) {
  const item = items[i];
  if (!item) return;
  if (isQuest()) {
    location.href = `https://www.youtube.com/watch?v=${item.id}&list=${PLAYLIST_ID}`;
    return;
  }
  viewer.open(i);
}

// ---------- Playlist ----------
async function refresh() {
  if (!isConfigured()) { setState('config'); return; }
  if (!items.length) setState('loading');
  try {
    const fresh = await fetchPlaylist($('#probe'));
    lastFetch = Date.now();
    items = fresh;
    setState(items.length ? 'ready' : 'empty');
    viewer.refresh();
    openFromHash();
  } catch (error) {
    console.warn('Playlist could not be loaded:', error);
    if (!items.length) setState('error');
  }
}

function openFromHash() {
  if (openedFromHash || viewer.isOpen()) return;
  const match = location.hash.match(/^#video-([\w-]{6,})$/);
  if (!match) return;
  const index = items.findIndex((item) => item.id === match[1]);
  if (index >= 0) {
    openedFromHash = true;
    openFilm(index);
  }
}

// ---------- Start ----------
const background = startBackground($('#bg'));
const viewer = createViewer({
  getItems: () => items,
  t,
  onOpen: () => background.pause(),
  onClose: () => background.resume(),
});

$('#startBtn').addEventListener('click', () => openFilm(0));

const cached = isConfigured() ? readCache() : null;
if (cached && cached.length) {
  items = cached;
  state = 'ready';
}

applyStrings();
decodeTitle($('#heroTitle'), t('heroTitle'));
refresh();

// A headset left open picks up new videos when the page becomes visible again.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && Date.now() - lastFetch > 60_000) refresh();
});
