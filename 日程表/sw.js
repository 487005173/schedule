/* 学习积分日程表 — Service Worker：离线可用 + 通知点击回到程序 */
var CACHE = 'study-points-schedule-v3';
var ASSETS = [
  './', './index.html', './styles.css', './app.js', './manifest.webmanifest',
  './js/util.js', './js/store.js', './js/logic.js', './js/charts.js', './js/ics.js', './js/gist.js',
  './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      /* 单个文件失败不影响整体安装 */
      return Promise.all(ASSETS.map(function (u) {
        return c.add(new Request(u, { cache: 'reload' })).catch(function () { });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  /* 跨域（GitHub API）不拦截，交给浏览器直接请求 */
  if (url.origin !== self.location.origin) return;

  /* 网络优先：联网时永远拿最新文件，断网时才用缓存
     （早先用的"缓存优先"会让改过的样式/脚本一直不生效，这里改掉） */
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.status === 200 && res.type === 'basic') {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        if (hit) return hit;
        if (req.mode === 'navigate') return caches.match('./index.html');
        return new Response('离线，且这份文件还没有缓存', { status: 503, statusText: 'Offline' });
      });
    })
  );
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if ('focus' in list[i]) return list[i].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./index.html');
    })
  );
});
