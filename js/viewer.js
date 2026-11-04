// Full-screen viewer: one YouTube player loaded with the playlist, plus custom controls.
import { PLAYLIST_ID } from './config.js';
import { loadYouTubeApi, thumb, YT_HOST } from './playlist.js';

export function createViewer({ getItems, t, onOpen, onClose }) {
  const $ = (id) => document.getElementById(id);
  const root = $('viewer');
  const stage = $('stage');
  const strip = $('strip');
  const groupEl = $('viewerGroup');
  const titleEl = $('viewerTitle');
  const countEl = $('viewerCount');
  const helpEl = $('viewerHelp');
  const ytLink = $('ytLink');
  const fsBtn = $('fsBtn');
  const pageParts = [
    document.querySelector('.site-header'),
    document.querySelector('main'),
    document.querySelector('.site-footer'),
  ];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  let player = null;
  let ready = false;
  let currentId = null;
  let isOpen = false;
  let lastFocus = null;

  const requestFs = stage.requestFullscreen || stage.webkitRequestFullscreen;
  if (!requestFs) fsBtn.hidden = true; // e.g. iPhone: use the YouTube player's own full-screen button

  const indexOfId = (id) => getItems().findIndex((item) => item.id === id);
  const labelFor = (item, i) => item.title || t('untitled', i + 1);

  function renderInfo() {
    const items = getItems();
    const i = indexOfId(currentId);
    if (i < 0) return;
    const item = items[i];
    groupEl.textContent = item.group || '';
    titleEl.textContent = labelFor(item, i);
    countEl.textContent = t('of', i + 1, items.length);
    ytLink.href = `https://www.youtube.com/watch?v=${item.id}&list=${PLAYLIST_ID}`;
    for (const button of strip.querySelectorAll('button')) {
      const active = button.dataset.id === currentId;
      button.setAttribute('aria-current', active ? 'true' : 'false');
      if (active && isOpen) {
        button.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
      }
    }
    if (isOpen) history.replaceState(null, '', `#video-${item.id}`);
  }

  function renderStrip() {
    strip.setAttribute('aria-label', t('strip'));
    const rows = getItems().map((item, i) => {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.id = item.id;
      const img = document.createElement('img');
      img.src = thumb(item.id, 'mqdefault');
      img.alt = '';
      img.loading = 'lazy';
      const label = document.createElement('span');
      label.textContent = item.group || labelFor(item, i);
      button.append(img, label);
      button.addEventListener('click', () => play(item.id));
      li.append(button);
      return li;
    });
    strip.replaceChildren(...rows);
    renderInfo();
  }

  function play(id) {
    currentId = id;
    renderInfo();
    if (!ready) return; // the player will pick it up in onReady
    const list = player.getPlaylist() || [];
    const position = list.indexOf(id);
    if (position >= 0) player.playVideoAt(position);
    else player.loadVideoById(id);
  }

  function syncFromPlayer() {
    const data = player.getVideoData ? player.getVideoData() : null;
    const id = data && data.video_id;
    if (id && id !== currentId && indexOfId(id) >= 0) {
      currentId = id;
      renderInfo();
    }
  }

  async function ensurePlayer(startIndex) {
    if (player) return;
    const YT = await loadYouTubeApi();
    player = new YT.Player('player', {
      host: YT_HOST,
      playerVars: {
        listType: 'playlist',
        list: PLAYLIST_ID,
        index: startIndex,
        playsinline: 1,
        rel: 0,
        fs: 1,
        origin: location.origin,
      },
      events: {
        onReady: () => {
          ready = true;
          // Lets a phone use its motion sensors to look around in 360°.
          const iframe = player.getIframe();
          if (iframe) {
            iframe.setAttribute('allow', 'accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen; xr-spatial-tracking');
          }
          play(currentId);
        },
        onStateChange: syncFromPlayer,
      },
    });
  }

  function step(direction) {
    const items = getItems();
    if (!items.length) return;
    const i = Math.max(0, indexOfId(currentId));
    play(items[(i + direction + items.length) % items.length].id);
  }

  async function open(index) {
    const items = getItems();
    if (!items[index]) return;
    lastFocus = document.activeElement;
    currentId = items[index].id;
    isOpen = true;
    root.hidden = false;
    document.body.classList.add('viewer-open');
    pageParts.forEach((el) => { if (el) el.inert = true; });
    helpEl.textContent = t('help');
    onOpen && onOpen();
    renderStrip();
    $('backBtn').focus();

    if (player) {
      play(currentId);
      return;
    }
    try {
      await ensurePlayer(index);
    } catch {
      helpEl.textContent = t('errorPlaylist');
    }
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    if (ready) player.pauseVideo();
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
    root.hidden = true;
    document.body.classList.remove('viewer-open');
    pageParts.forEach((el) => { if (el) el.inert = false; });
    history.replaceState(null, '', location.pathname + location.search);
    onClose && onClose();
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  // ---------- Controls ----------
  $('backBtn').addEventListener('click', close);
  $('prevBtn').addEventListener('click', () => step(-1));
  $('nextBtn').addEventListener('click', () => step(1));
  fsBtn.addEventListener('click', () => {
    if (requestFs) requestFs.call(stage);
  });

  document.addEventListener('keydown', (event) => {
    if (!isOpen) return;
    if (event.key === 'Escape' && !document.fullscreenElement) close();
    else if (event.key === 'ArrowLeft') step(-1);
    else if (event.key === 'ArrowRight') step(1);
  });

  return {
    open,
    close,
    isOpen: () => isOpen,
    // Call when the playlist or the language changes.
    refresh() {
      if (!isOpen) return;
      helpEl.textContent = t('help');
      renderStrip();
    },
  };
}
