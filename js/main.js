import { STRINGS } from './strings.js';
import { startBackground } from './background.js';
import { fetchPlaylist, readCache, isConfigured, thumb } from './playlist.js';
import { createViewer } from './viewer.js';
import { createSpace } from './space.js';

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
let vrReady = false;
let returnToSpace = false;

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
  $('#spaceBtnLabel').textContent = vrReady ? t('enterVR') : t('spaceOpen');
  renderStatus();
  renderCards();
  viewer.refresh();
  space.refresh();
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
  $('#spaceBtn').disabled = !items.length;
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
// and open the film on youtube.com instead.
function openFilm(i) {
  const item = items[i];
  if (!item) return;
  if (isQuest()) {
    openOnYouTube(item.id);
    return;
  }
  viewer.open(i);
}

// The film opens in its own tab, so the gallery stays open, exactly as it was,
// in this tab: closing the YouTube tab brings you straight back. Every film
// reuses that one YouTube tab, so tabs don't pile up. The link is just the one
// film (no playlist), so YouTube doesn't play on into the other films.
function openOnYouTube(id) {
  const url = `https://www.youtube.com/watch?v=${id}`;
  let tab = null;
  try { tab = window.open(url, 'aiday-film'); } catch { tab = null; }
  if (tab) {
    try { tab.focus(); } catch { /* ignore */ }
    return;
  }
  // The browser blocked the new tab: open the film here instead, and mark the
  // address so the 360° gallery reopens when you press Back.
  history.replaceState(null, '', '#gallery');
  location.href = url;
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
    space.refresh();
    openFromHash();
  } catch (error) {
    console.warn('Playlist could not be loaded:', error);
    if (!items.length) setState('error');
  }
}

function openFromHash() {
  if (openedFromHash || viewer.isOpen() || space.isOpen()) return;
  if (location.hash === '#gallery' && items.length) {
    // Back from YouTube: return to the 360° gallery (one press of Enter VR on a headset).
    openedFromHash = true;
    history.replaceState(null, '', location.pathname + location.search);
    space.open();
    return;
  }
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
  onClose: () => {
    background.resume();
    // Coming back from a film chosen in the 360° gallery: return to the gallery.
    if (returnToSpace) {
      returnToSpace = false;
      space.open();
    }
  },
});

const space = createSpace({
  getItems: () => items,
  t,
  onSelect: (i) => {
    // On Quest the film opens in another tab, so the gallery stays open here.
    if (isQuest()) { openFilm(i); return; }
    returnToSpace = true;
    space.close();
    openFilm(i);
  },
  onOpen: () => background.pause(),
  onClose: () => background.resume(),
});

// On a VR headset the main button enters VR straight away.
space.vrReady().then((ok) => {
  vrReady = Boolean(ok);
  $('#spaceBtnLabel').textContent = vrReady ? t('enterVR') : t('spaceOpen');
});

$('#spaceBtn').addEventListener('click', () => space.open({ vr: vrReady }));
$('#startBtn').addEventListener('click', () => openFilm(0));

const cached = isConfigured() ? readCache() : null;
if (cached && cached.length) {
  items = cached;
  state = 'ready';
}

applyStrings();
decodeTitle($('#heroTitle'), t('heroTitle'));
if (items.length) openFromHash();
refresh();

// A headset left open picks up new videos when the page becomes visible again.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && Date.now() - lastFetch > 60_000) refresh();
});
