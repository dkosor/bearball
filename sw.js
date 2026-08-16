/* Bear Ball offline shell.
   Everything the game needs is 1.5 MB, so there is no point being clever:
   precache the lot on install and serve cache-first afterwards. Once this has
   run through once, the game needs no server, no Mac and no network.

   Bump CACHE when any asset changes — the old cache is dropped on activate. */

const CACHE = 'bearball-v3';

const ASSETS = [
  './', 'index.html', 'swf.js', 'bearball.js', 'extras.js', 'manifest.webmanifest',
  'assets/icon-180.png', 'assets/icon-192.png', 'assets/icon-512.png', 'assets/shapes/1.svg',
  'assets/shapes/100.svg', 'assets/shapes/101.svg', 'assets/shapes/103.svg',
  'assets/shapes/104.svg', 'assets/shapes/105.svg', 'assets/shapes/106.svg',
  'assets/shapes/107.svg', 'assets/shapes/108.svg', 'assets/shapes/109.svg',
  'assets/shapes/110.svg', 'assets/shapes/112.svg', 'assets/shapes/113.svg',
  'assets/shapes/114.svg', 'assets/shapes/115.svg', 'assets/shapes/116.svg',
  'assets/shapes/117.svg', 'assets/shapes/118.svg', 'assets/shapes/119.svg',
  'assets/shapes/121.svg', 'assets/shapes/122.svg', 'assets/shapes/124.svg',
  'assets/shapes/125.svg', 'assets/shapes/126.svg', 'assets/shapes/127.svg',
  'assets/shapes/128.svg', 'assets/shapes/13.svg', 'assets/shapes/130.svg',
  'assets/shapes/135.svg', 'assets/shapes/139.svg', 'assets/shapes/141.svg',
  'assets/shapes/142.svg', 'assets/shapes/144.svg', 'assets/shapes/145.svg',
  'assets/shapes/146.svg', 'assets/shapes/147.svg', 'assets/shapes/148.svg',
  'assets/shapes/149.svg', 'assets/shapes/15.svg', 'assets/shapes/150.svg',
  'assets/shapes/151.svg', 'assets/shapes/152.svg', 'assets/shapes/156.svg',
  'assets/shapes/157.svg', 'assets/shapes/158.svg', 'assets/shapes/159.svg',
  'assets/shapes/16.svg', 'assets/shapes/160.svg', 'assets/shapes/161.svg',
  'assets/shapes/162.svg', 'assets/shapes/166.svg', 'assets/shapes/167.svg',
  'assets/shapes/17.svg', 'assets/shapes/171.svg', 'assets/shapes/172.svg',
  'assets/shapes/18.svg', 'assets/shapes/180.svg', 'assets/shapes/183.svg',
  'assets/shapes/184.svg', 'assets/shapes/185.svg', 'assets/shapes/187.svg',
  'assets/shapes/189.svg', 'assets/shapes/19.svg', 'assets/shapes/190.svg',
  'assets/shapes/191.svg', 'assets/shapes/192.svg', 'assets/shapes/193.svg',
  'assets/shapes/197.svg', 'assets/shapes/2.svg', 'assets/shapes/20.svg',
  'assets/shapes/201.svg', 'assets/shapes/204.svg', 'assets/shapes/206.svg',
  'assets/shapes/208.svg', 'assets/shapes/21.svg', 'assets/shapes/210.svg',
  'assets/shapes/211.svg', 'assets/shapes/213.svg', 'assets/shapes/218.svg',
  'assets/shapes/22.svg', 'assets/shapes/221.svg', 'assets/shapes/223.svg',
  'assets/shapes/224.svg', 'assets/shapes/23.svg', 'assets/shapes/24.svg',
  'assets/shapes/25.svg', 'assets/shapes/26.svg', 'assets/shapes/27.svg',
  'assets/shapes/28.svg', 'assets/shapes/29.svg', 'assets/shapes/30.svg',
  'assets/shapes/31.svg', 'assets/shapes/32.svg', 'assets/shapes/33.svg',
  'assets/shapes/34.svg', 'assets/shapes/35.svg', 'assets/shapes/37.svg',
  'assets/shapes/38.svg', 'assets/shapes/39.svg', 'assets/shapes/4.svg', 'assets/shapes/40.svg',
  'assets/shapes/41.svg', 'assets/shapes/42.svg', 'assets/shapes/43.svg',
  'assets/shapes/44.svg', 'assets/shapes/45.svg', 'assets/shapes/46.svg',
  'assets/shapes/47.svg', 'assets/shapes/48.svg', 'assets/shapes/49.svg', 'assets/shapes/5.svg',
  'assets/shapes/50.svg', 'assets/shapes/51.svg', 'assets/shapes/52.svg',
  'assets/shapes/53.svg', 'assets/shapes/54.svg', 'assets/shapes/56.svg',
  'assets/shapes/58.svg', 'assets/shapes/59.svg', 'assets/shapes/60.svg',
  'assets/shapes/61.svg', 'assets/shapes/62.svg', 'assets/shapes/63.svg',
  'assets/shapes/64.svg', 'assets/shapes/65.svg', 'assets/shapes/67.svg',
  'assets/shapes/68.svg', 'assets/shapes/69.svg', 'assets/shapes/70.svg',
  'assets/shapes/71.svg', 'assets/shapes/73.svg', 'assets/shapes/74.svg',
  'assets/shapes/75.svg', 'assets/shapes/77.svg', 'assets/shapes/78.svg',
  'assets/shapes/82.svg', 'assets/shapes/84.svg', 'assets/shapes/85.svg',
  'assets/shapes/86.svg', 'assets/shapes/88.svg', 'assets/shapes/89.svg',
  'assets/shapes/91.svg', 'assets/shapes/94.svg', 'assets/shapes/95.svg',
  'assets/shapes/96.svg', 'assets/shapes/97.svg', 'assets/shapes/98.svg',
  'assets/shapes/99.svg', 'assets/sounds/123.mp3', 'assets/sounds/154.mp3',
  'assets/sounds/164.mp3', 'assets/sounds/169.mp3', 'assets/sounds/173.mp3',
  'assets/sounds/198.mp3', 'assets/sounds/219.mp3', 'assets/sounds/57.mp3',
  'assets/sounds/87.mp3', 'assets/fonts/10_Hobo%20Std.ttf', 'assets/fonts/195_hobo%20std.ttf',
  'assets/fonts/8_Arial%20Black.ttf', 'data/game.json'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    /* addAll is atomic: one 404 and nothing is cached, with no clue which file
       failed. Go one at a time so a single bad path cannot sink the install. */
    const failed = [];
    await Promise.all(ASSETS.map(async url => {
      try {
        const res = await fetch(url, { cache: 'reload' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        await cache.put(url, res);
      } catch (err) { failed.push(url + ' (' + err.message + ')'); }
    }));
    if (failed.length) console.warn('[sw] %d asset(s) not cached:', failed.length, failed);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

/* Safari asks for media with a Range header. Handing it a plain 200 out of the
   cache makes the request fail, which silently kills every sound offline — so
   slice the cached body and answer 206 ourselves. */
async function rangeReply(cached, header) {
  const buf = await cached.arrayBuffer();
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return new Response(buf, { status: 200, headers: cached.headers });
  const size = buf.byteLength;
  let start = m[1] ? parseInt(m[1], 10) : 0;
  let end = m[2] ? parseInt(m[2], 10) : size - 1;
  if (!m[1]) { start = Math.max(0, size - parseInt(m[2], 10)); end = size - 1; }
  if (start > end || start >= size) {
    return new Response(null, { status: 416,
      headers: { 'Content-Range': 'bytes */' + size } });
  }
  end = Math.min(end, size - 1);
  const headers = new Headers(cached.headers);
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Content-Length', String(end - start + 1));
  headers.set('Accept-Ranges', 'bytes');
  return new Response(buf.slice(start, end + 1), { status: 206, headers });
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    /* ignoreSearch so a cache-busting query string still hits the stored copy. */
    let hit = await cache.match(req, { ignoreSearch: true });
    if (!hit && req.mode === 'navigate') hit = await cache.match('./');

    const range = req.headers.get('range');
    if (hit && range) return rangeReply(hit.clone(), range);
    if (hit) return hit;

    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch (err) {
      /* Offline and not in cache: a navigation still gets the shell. */
      if (req.mode === 'navigate') {
        const shell = await cache.match('./') || await cache.match('index.html');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
