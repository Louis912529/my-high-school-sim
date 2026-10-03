/**
 * 莞中生活 · 校园生活模拟器 —— 本地服务器
 * 排行榜 / 全校动态 已迁移至 Supabase 云数据库，数据永久保存。
 * 在线心跳 / 云存档 仍用本地文件（丢失不影响核心体验）。
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

// ---------- Supabase 配置 ----------
// 优先读环境变量，没设置就用你项目里的默认值
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ffgadvttafglrmxcauun.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_3mq4rd9tGI_I11IkuLA7tg_m_NPg_Qx';

async function supabase(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${res.status}: ${text}`);
  }
  return res.json();
}

const FILES = {
  saves: path.join(DATA_DIR, 'saves.json'),
  online: path.join(DATA_DIR, 'online.json'),
};
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
      if (data.length > 512 * 1024) { finish({}); req.destroy(); }
    });
    req.on('end', () => { try { finish(data ? JSON.parse(data) : {}); } catch (e) { finish({}); } });
    req.on('error', () => finish({}));
    req.on('aborted', () => finish({}));
  });
}

// 预置几条“学长学姐”数据，当 Supabase 排行榜为空时展示用（不会写入数据库）
const SEED = [
  { id: 'seed1', name: '2025届·何学长', score: 686, ending: '985上岸 · 中山大学', track: '物理类', ts: 1730000000000 },
  { id: 'seed2', name: '2025届·王学姐', score: 655, ending: '985上岸 · 华南理工大学', track: '历史类', ts: 1730000000000 },
  { id: 'seed3', name: '2024届·留耕堂传人', score: 634, ending: '一本线之上 · 暨南大学', track: '物理类', ts: 1720000000000 },
  { id: 'seed4', name: '2024届·姜埋奶十级学者', score: 572, ending: '本科上岸 · 广州大学', track: '历史类', ts: 1720000000000 },
  { id: 'seed5', name: '2023届·狼人杀先知', score: 521, ending: '本科上岸 · 广东财经大学', track: '物理类', ts: 1710000000000 },
  { id: 'seed6', name: '2023届·饭堂幸存者', score: 448, ending: '专科·逆袭预备役', track: '历史类', ts: 1700000000000 },
];

const server = http.createServer(async (req, res) => {
  req.on('error', () => {});
  res.on('error', () => {});
  res.on('close', () => {});
  try {
    await handleRequest(req, res);
  } catch (e) {
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

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;

  // ---------- API ----------
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
    return json(res, 200, { ok: true, app: 'guanzhong-life-sim', online: count });
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

  // ---------- 全校动态（Supabase） ----------
  if (p === '/api/feed' && req.method === 'GET') {
    try {
      const feed = await supabase('feed?select=*&order=ts.desc&limit=50');
      return json(res, 200, { ok: true, feed });
    } catch (e) {
      console.error('[feed GET]', e.message);
      return json(res, 200, { ok: true, feed: [] });
    }
  }

  if (p === '/api/feed' && req.method === 'POST') {
    const b = await readBody(req);
    if (!b.name || !b.text) return json(res, 400, { ok: false });
    try {
      await supabase('feed', {
        method: 'POST',
        body: JSON.stringify({
          name: String(b.name).slice(0, 16),
          text: String(b.text).slice(0, 60),
          icon: String(b.icon || '📢').slice(0, 4),
          ts: Date.now(),
        }),
      });
      return json(res, 200, { ok: true });
    } catch (e) {
      console.error('[feed POST]', e.message);
      return json(res, 500, { ok: false });
    }
  }
  

  // ---------- 全校排行榜（Supabase） ----------
  if (p === '/api/leaderboard' && req.method === 'GET') {
    try {
      const board = await supabase('leaderboard?select=*&order=score.desc&limit=50');
      if (board && board.length) return json(res, 200, { ok: true, board });
      return json(res, 200, { ok: true, board: SEED });
    } catch (e) {
      console.error('[leaderboard GET]', e.message);
      return json(res, 200, { ok: true, board: SEED });
    }
  }

  if (p === '/api/leaderboard' && req.method === 'POST') {
    const b = await readBody(req);
    if (!b.id || !b.name || typeof b.score !== 'number') return json(res, 400, { ok: false });
    try {
      const payload = {
        id: b.id,
        name: String(b.name).slice(0, 16),
        score: b.score,
        ending: b.ending || '',
        //badge: b.badge || '',等supabase
        track: b.track || '',
        //report: b.report || '',等supabase
        ts: Date.now(),
      };
      const existing = await supabase(`leaderboard?id=eq.${encodeURIComponent(b.id)}&select=id`);
      if (existing && existing.length) {
        await supabase(`leaderboard?id=eq.${encodeURIComponent(b.id)}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await supabase('leaderboard', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      const all = await supabase('leaderboard?select=id&order=score.desc');
      const rank = all.findIndex((e) => e.id === b.id) + 1;
      return json(res, 200, { ok: true, rank });
    } catch (e) {
      console.error('[leaderboard POST]', e.message);
      return json(res, 500, { ok: false });
    }
  }


  // ---------- 云存档（保留本地文件） ----------
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
      'Cache-Control': 'no-store, must-revalidate',
    }, buf);
  });
}

server.on('error', (e) => { console.error('[server error]', e && (e.stack || e.message || e)); });
server.on('clientError', (err, socket) => {
  try { socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); } catch (e) {}
});

server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

process.on('unhandledRejection', (e) => {
  console.error('[unhandledRejection]', e && (e.stack || e.message || e));
});
process.on('uncaughtException', (e) => {
  console.error('[uncaughtException]', e && (e.stack || e.message || e));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('==============================================');
  console.log('  莞中生活 · 校园生活模拟器 服务器已启动');
  console.log(`  本机游玩:  http://localhost:${PORT}`);
  console.log(`  局域网联机: http://<本机IP>:${PORT}  (同学可连)`);
  console.log('  排行榜 / 全校动态 已接入 Supabase，数据永久保存');
  console.log('==============================================');
});