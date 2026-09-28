/**
 * 莞中生活 · 校园生活模拟器 —— 本地服务器
 * 零依赖，Node 原生实现：node server.js 即可运行
 * 提供：静态页面 + 排行榜 / 全校动态 / 云存档 / 在线心跳
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const STARTED_AT = Date.now();
const ROOT = __dirname;
const PUB = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const FILES = {
  leaderboard: path.join(DATA_DIR, 'leaderboard.json'),
  feed: path.join(DATA_DIR, 'feed.json'),
  saves: path.join(DATA_DIR, 'saves.json'),
  online: path.join(DATA_DIR, 'online.json'),
};
// 初始内容：排行榜 / 动态是数组，存档 / 在线表必须是**对象**。
// 之前 online.json 被初始化成数组，而 online[id] = ts 挂在数组上属于「非索引属性」，
// JSON.stringify 会直接丢掉它 —— 结果心跳写了 15000 次，文件还是 []，在线人数永远算出来是 0。
const OBJECT_FILES = new Set(['saves', 'online']);
for (const k of Object.keys(FILES)) {
  if (!fs.existsSync(FILES[k])) fs.writeFileSync(FILES[k], JSON.stringify(OBJECT_FILES.has(k) ? {} : []));
}

function readJSON(f, fallback) {
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return fallback; }
}
function writeJSON(f, obj) {
  try { fs.writeFileSync(f, JSON.stringify(obj)); } catch (e) {}
}

// 在线表必须是「普通对象」。老数据文件可能是数组（上面那个历史 bug 写坏的），
// 这里统一纠回来，否则 Object.values() 与 online[id] = ts 都会静默失效。
function onlineMap() {
  const raw = readJSON(FILES.online, {});
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

// 客户端随时可能中途断开（关页面、切网络、手机锁屏），此时写 socket 会抛错。
// 必须在这里就地吞掉，否则会升级成 uncaughtException 把整个进程带走——
// 表现就是「一个人用过之后，所有人都进不来了」。
function safeWrite(res, code, headers, body) {
  if (res.writableEnded || res.destroyed) return;
  try {
    res.writeHead(code, headers);
    res.end(body);
  } catch (e) {
    console.error('[write skipped]', e && e.message);
  }
}

function json(res, code, obj) {
  safeWrite(res, code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    req.on('data', (c) => {
      data += c;
      // 超限直接断开；这里必须 resolve，否则这个请求会永远挂住。
      if (data.length > 512 * 1024) { finish({}); req.destroy(); }
    });
    req.on('end', () => { try { finish(data ? JSON.parse(data) : {}); } catch (e) { finish({}); } });
    req.on('error', () => finish({}));
    req.on('aborted', () => finish({}));
  });
}

// 预置几条"学长学姐"的数据，让排行榜一开始就有人气（可自行删除 data/leaderboard.json）
const SEED = [
  { id: 'seed1', name: '2025届·何学长', score: 686, ending: '985上岸 · 中山大学', track: '物理类', ts: 1730000000000 },
  { id: 'seed2', name: '2025届·王学姐', score: 655, ending: '985上岸 · 华南理工大学', track: '历史类', ts: 1730000000000 },
  { id: 'seed3', name: '2024届·留耕堂传人', score: 634, ending: '一本线之上 · 暨南大学', track: '物理类', ts: 1720000000000 },
  { id: 'seed4', name: '2024届·姜埋奶十级学者', score: 572, ending: '本科上岸 · 广州大学', track: '历史类', ts: 1720000000000 },
  { id: 'seed5', name: '2023届·狼人杀先知', score: 521, ending: '本科上岸 · 广东财经大学', track: '物理类', ts: 1710000000000 },
  { id: 'seed6', name: '2023届·饭堂幸存者', score: 448, ending: '专科·逆袭预备役', track: '历史类', ts: 1700000000000 },
];

const server = http.createServer(async (req, res) => {
  // 每个请求都挂上 error 监听：Node 里「没人监听的 error 事件」会被抛成未捕获异常。
  // 客户端中途断开是常态（关页面、切 WiFi、锁屏），绝不能因此让进程退出。
  req.on('error', () => {});
  res.on('error', () => {});
  res.on('close', () => {});
  try {
    await handleRequest(req, res);
  } catch (e) {
    // 任何一个请求出错都不许把进程带崩——否则第一个人踩到坑，后面所有人都进不来。
    console.error('[request error]', req.method, req.url, e && (e.stack || e.message || e));
    safeWrite(res, 500, { 'Content-Type': 'text/plain; charset=utf-8' }, '500 Internal Server Error');
  }
});
async function handleRequest(req, res) {
  // 添加 CORS 跨域支持
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ... 下面原有的代码保持原样，不要动
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  // ...
}
  // ---------- API ----------
  // 存活探针：uptime 一直增长说明进程没重启过；归零就说明崩过。
  if (p === '/api/health') {
    return json(res, 200, {
      ok: true,
      uptime: Math.round(process.uptime()),
      startedAt: STARTED_AT,
      pid: process.pid,
      node: process.version,
      rss: Math.round(process.memoryUsage().rss / 1048576) + 'MB',
    });
  }

  if (p === '/api/hello') {
    const online = onlineMap();
    const now = Date.now();
    const count = Object.values(online).filter((t) => now - t < 90 * 1000).length;
    return json(res, 200, { ok: true, app: 'xiangxian-life-sim', online: count });
  }

  if (p === '/api/heartbeat') {
    const b = await readBody(req);
    if (b.id) {
      const online = onlineMap();
      online[b.id] = Date.now();
      const now = Date.now();
      for (const k of Object.keys(online)) if (now - online[k] > 10 * 60 * 1000) delete online[k];
      writeJSON(FILES.online, online);
      const count = Object.values(online).filter((t) => now - t < 90 * 1000).length;
      return json(res, 200, { ok: true, online: count });
    }
    return json(res, 200, { ok: false });
  }

  if (p === '/api/feed' && req.method === 'GET') {
    const feed = readJSON(FILES.feed, []);
    return json(res, 200, { ok: true, feed: feed.slice(-30).reverse() });
  }

  if (p === '/api/feed' && req.method === 'POST') {
    const b = await readBody(req);
    if (!b.name || !b.text) return json(res, 400, { ok: false });
    const feed = readJSON(FILES.feed, []);
    feed.push({ name: String(b.name).slice(0, 16), text: String(b.text).slice(0, 60), icon: String(b.icon || '📢').slice(0, 4), ts: Date.now() });
    writeJSON(FILES.feed, feed.slice(-80));
    return json(res, 200, { ok: true });
  }

  if (p === '/api/leaderboard' && req.method === 'GET') {
    let lb = readJSON(FILES.leaderboard, null);
    if (!lb || !lb.length) { lb = SEED; writeJSON(FILES.leaderboard, lb); }
    lb.sort((a, b) => b.score - a.score);
    return json(res, 200, { ok: true, board: lb.slice(0, 30) });
  }

  if (p === '/api/leaderboard' && req.method === 'POST') {
    const b = await readBody(req);
    if (!b.id || !b.name || typeof b.score !== 'number') return json(res, 400, { ok: false });
    let lb = readJSON(FILES.leaderboard, []);
    if (!lb.length) lb = SEED;
    const old = lb.find((e) => e.id === b.id);
    if (old) { if (b.score > old.score) Object.assign(old, b); }
    else lb.push(b);
    writeJSON(FILES.leaderboard, lb.slice(0, 200));
    lb.sort((a, b) => b.score - a.score);
    const rank = lb.findIndex((e) => e.id === b.id) + 1;
    return json(res, 200, { ok: true, rank });
  }

  if (p === '/api/save' && req.method === 'POST') {
    const b = await readBody(req);
    if (!b.id || !b.state) return json(res, 400, { ok: false });
    const saves = readJSON(FILES.saves, {});
    saves[b.id] = { state: b.state, ts: Date.now() };
    writeJSON(FILES.saves, saves);
    return json(res, 200, { ok: true });
  }

  if (p === '/api/save' && req.method === 'GET') {
    const id = url.searchParams.get('id');
    const saves = readJSON(FILES.saves, {});
    return json(res, 200, { ok: true, state: saves[id] ? saves[id].state : null });
  }

  // ---------- 静态文件 ----------
  let file = p === '/' ? '/index.html' : p;
  file = path.normalize(file).replace(/^([/\\]?\.\.[/\\])+/, '');
  const full = path.join(PUB, file);
  if (!full.startsWith(PUB)) return safeWrite(res, 403, { 'Content-Type': 'text/plain; charset=utf-8' }, 'forbidden');
  fs.readFile(full, (err, buf) => {
    if (err) {
      return safeWrite(res, 404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }, '404 Not Found');
    }
    safeWrite(res, 200, {
      'Content-Type': MIME[path.extname(full)] || 'application/octet-stream',
      // 游戏改得勤，禁掉缓存，避免浏览器把新旧 index.html / game.js 混着用导致白屏。
      'Cache-Control': 'no-store, must-revalidate',
    }, buf);
  });
}

server.on('error', (e) => { console.error('[server error]', e && (e.stack || e.message || e)); });

// 畸形请求（扫描器/坏客户端）不要让它变成未捕获异常。
server.on('clientError', (err, socket) => {
  try { socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); } catch (e) { /* 已经断了 */ }
});

// 反向代理会复用 keep-alive 连接。Node 默认 5s 就把它关掉，代理若仍拿这条已死的连接
// 转发下一个访客的请求，就会 502——现象正是「一个人用过之后，别人打不开」。
// 把超时设得比代理长，避免这个竞态。
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

// 兜底：异步异常只记录，不让 Node 直接退出（Node 15+ 默认会因未处理拒绝而终止）。
process.on('unhandledRejection', (e) => {
  console.error('[unhandledRejection]', e && (e.stack || e.message || e));
});
process.on('uncaughtException', (e) => {
  console.error('[uncaughtException]', e && (e.stack || e.message || e));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('==============================================');
  console.log('  象贤人生 · 高中三年模拟器 服务器已启动');
  console.log(`  本机游玩:  http://localhost:${PORT}`);
  console.log(`  局域网联机: http://<本机IP>:${PORT}  (同学可连)`);
  console.log('  数据保存在 ./data/ 目录，可随时删除重置');
  console.log('==============================================');
});
