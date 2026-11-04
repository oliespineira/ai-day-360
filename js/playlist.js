// Reads the YouTube playlist: video IDs, titles and thumbnails.
import { PLAYLIST_ID, YOUTUBE_API_KEY, USE_NOCOOKIE } from './config.js';

const CACHE_KEY = `aiday-playlist-${PLAYLIST_ID}`;
export const YT_HOST = USE_NOCOOKIE ? 'https://www.youtube-nocookie.com' : 'https://www.youtube.com';

export const isConfigured = () => Boolean(PLAYLIST_ID) && !PLAYLIST_ID.startsWith('PASTE');

export const thumb = (id, quality = 'hqdefault') => `https://i.ytimg.com/vi/${id}/${quality}.jpg`;

// "Group 1 – Astronaut in the fields" -> { group: "Group 1", title: "Astronaut in the fields" }
export function splitTitle(raw) {
  const text = (raw || '').trim();
  const match = text.match(/^(.+?)\s+[–—-]\s+(.+)$/);
  return match ? { group: match[1].trim(), title: match[2].trim() } : { group: '', title: text };
}

// ---------- Cache (so the gallery appears instantly on reload) ----------
export function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeCache(items) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(items)); } catch { /* storage unavailable */ }
}

// ---------- YouTube IFrame API ----------
let apiPromise;
export function loadYouTubeApi() {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    if (window.YT && window.YT.Player) { resolve(window.YT); return; }
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previous === 'function') previous();
      resolve(window.YT);
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => { apiPromise = null; reject(new Error('youtube-blocked')); };
    document.head.appendChild(script);
  });
  return apiPromise;
}

// ---------- Method 1: YouTube Data API (only if a key is set) ----------
async function viaDataApi() {
  const items = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({
      part: 'snippet,contentDetails',
      maxResults: '50',
      playlistId: PLAYLIST_ID,
      key: YOUTUBE_API_KEY,
    });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?${params}`);
    if (!res.ok) throw new Error(`data-api-${res.status}`);
    const data = await res.json();
    for (const item of data.items || []) {
      const id = item.contentDetails?.videoId;
      const raw = item.snippet?.title || '';
      if (!id || raw === 'Private video' || raw === 'Deleted video') continue;
      items.push({ id, rawTitle: raw, ...splitTitle(raw) });
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return items;
}

// ---------- Method 2 (default): hidden player + oEmbed titles, no key needed ----------
async function readIdsWithPlayer(probe) {
  const YT = await loadYouTubeApi();
  const holder = document.createElement('div');
  probe.appendChild(holder);

  return new Promise((resolve, reject) => {
    let player = null;
    let finished = false;
    let tries = 0;

    const finish = (ids, error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      try { player && player.destroy(); } catch { /* ignore */ }
      probe.replaceChildren();
      error ? reject(error) : resolve(ids);
    };
    const timeout = setTimeout(() => finish(null, new Error('playlist-timeout')), 15000);

    const poll = () => {
      const list = player && player.getPlaylist ? player.getPlaylist() : null;
      if (list && list.length) finish(list.slice());
      else if (++tries > 30) finish([]);
      else setTimeout(poll, 300);
    };

    player = new YT.Player(holder, {
      width: 320,
      height: 180,
      host: YT_HOST,
      playerVars: { listType: 'playlist', list: PLAYLIST_ID, mute: 1, origin: location.origin },
      events: {
        onReady: poll,
        onError: (event) => {
          // A single video that can't be embedded shouldn't hide the whole playlist.
          const list = player && player.getPlaylist ? player.getPlaylist() : null;
          if (list && list.length) finish(list.slice());
          else finish(null, new Error(`youtube-error-${event.data}`));
        },
      },
    });
  });
}

async function titleFromOEmbed(id) {
  try {
    const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`;
    const res = await fetch(url);
    if (!res.ok) return '';
    const data = await res.json();
    return data.title || '';
  } catch {
    return '';
  }
}

async function viaPlayer(probe) {
  const ids = await readIdsWithPlayer(probe);
  const known = new Map((readCache() || []).map((item) => [item.id, item]));
  const titles = await Promise.all(ids.map(titleFromOEmbed));
  return ids.map((id, i) => {
    const raw = titles[i] || known.get(id)?.rawTitle || '';
    return { id, rawTitle: raw, ...splitTitle(raw) };
  });
}

// ---------- Public entry point ----------
export async function fetchPlaylist(probe) {
  const items = YOUTUBE_API_KEY ? await viaDataApi() : await viaPlayer(probe);
  writeCache(items);
  return items;
}
