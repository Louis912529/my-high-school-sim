// 端到端跑局测试：用 DOM 桩件加载真实 game.js，模拟点击走完整局
const fs = require('fs');
const path = require('path');

const RESULT = path.join(__dirname, 'test-e2e-result.txt');
const dump = (t) => { try { fs.writeFileSync(RESULT, t, 'utf8'); } catch (e) {} };
process.on('uncaughtException', (e) => { dump('CRASH: ' + ((e && e.stack) || e)); process.exit(1); });

/* ---------------- DOM 桩件 ---------------- */
const SCREENS = ['#screen-menu', '#screen-setup', '#screen-semester', '#screen-track', '#screen-game', '#screen-end'];
const registry = new Map();
// 事件卡是 createElement 造出来的，收进来才能反查「这一局到底发了哪些卡」
const createdCards = [];

function makeClassList() {
  const set = new Set();
  return {
    _set: set,
    add: (c) => set.add(c),
    remove: (c) => set.delete(c),
    toggle: (c, f) => { if (f === undefined) { set.has(c) ? set.delete(c) : set.add(c); } else if (f) set.add(c); else set.delete(c); },
    contains: (c) => set.has(c),
  };
}

function makeEl(sel) {
  const el = {
    sel,
    style: {}, dataset: {}, value: '', textContent: '', title: '', className: '',
    classList: makeClassList(),
    parentNode: null, firstChild: null, lastElementChild: null,
    children: [], scrollTop: 0, scrollHeight: 0,
    _html: '', _btns: null, _sig: '',
    appendChild(c) { return c; },
    insertBefore(c) { return c; },
    insertAdjacentHTML(pos, html) { this._html += String(html); },
    insertAdjacentElement(pos, c) { return c; },
    removeChild() {}, remove() {},
    contains() { return false; },
    closest() { return null; },
    matches() { return false; },
    cloneNode() { return makeEl(sel + ':clone'); },
    setAttribute() {}, getAttribute() { return null; },
    focus() {}, blur() {}, click() { if (typeof this.onclick === 'function') this.onclick(); },
    addEventListener(t, f) { this['on' + t] = f; },
    querySelector(s) { return get(sel + ' ' + s); },
    querySelectorAll(sel2) { return buttonsFor(this); },
    onclick: null,
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return this._html; },
    set(v) {
      this._html = String(v);
      const sig = (this._html.match(/data-(?:act|i|v)="[^"]*"/g) || []).join('|');
      if (sig !== this._sig) { this._sig = sig; this._btns = null; }
    },
  });
  return el;
}

// 依据元素当前 innerHTML 造出可点击的假按钮，并按签名缓存，保证 onclick 赋值不丢
function buttonsFor(el) {
  if (el._btns) return el._btns;
  const html = el._html || '';
  const out = [];
  const reI = /data-i="(\d+)"/g;
  let m;
  while ((m = reI.exec(html))) {
    out.push({ dataset: { i: m[1] }, classList: makeClassList(), onclick: null, addEventListener(t, f) { this['on' + t] = f; } });
  }
  const reA = /data-act="([^"]+)"/g;
  while ((m = reA.exec(html))) {
    out.push({ dataset: { act: m[1] }, classList: makeClassList(), onclick: null, addEventListener(t, f) { this['on' + t] = f; } });
  }
  const reV = /data-v="([^"]+)"/g;
  while ((m = reV.exec(html))) {
    out.push({ dataset: { v: m[1] }, classList: makeClassList(), onclick: null, addEventListener(t, f) { this['on' + t] = f; } });
  }
  el._btns = out;
  return out;
}

function get(sel) {
  if (!registry.has(sel)) registry.set(sel, makeEl(sel));
  return registry.get(sel);
}

const document = {
  querySelector: (s) => get(s),
  querySelectorAll: (s) => (s === '.screen' ? SCREENS.map(get) : []),
  getElementById: (id) => get('#' + id),
  createElement: () => { const el = makeEl('<created>'); createdCards.push(el); return el; },
  body: makeEl('body'),
};

const storage = new Map();
const localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => { storage.set(k, String(v)); },
  removeItem: (k) => { storage.delete(k); },
};
const confirm = () => false;
const alert = () => {};
const requestAnimationFrame = (f) => { try { f(); } catch (e) {} };
const fetch = () => Promise.reject(new Error('offline'));

/* ---------------- 加载 game.js ---------------- */
const gamePath = path.join(__dirname, 'public', 'game.js');
const src = fs.readFileSync(gamePath, 'utf8');

const factory = new Function('document', 'localStorage', 'confirm', 'alert',
  'requestAnimationFrame', 'fetch', 'window', 'navigator', 'location', 'setTimeout', 'clearTimeout',
  src + `
  return {
    getS: () => S, getCFG: () => CFG, getQUEUE: () => QUEUE, getAuto: () => AUTO,
    newGame, startSemester, chooseMain, showMainChoices, buildEventQueue, processQueue,
    doEnding, loveEnding, affStage, loveCall, totalRounds, SEM_NAMES, AFF_STAGES, AFF_STAGES_BOY,
    setDifficulty, loveRatio, DIFFICULTY_PRESETS, loveRoute, loveChar, loveStoryList,
    getDiff: () => DIFFICULTY,
  };`);

const A = factory(document, localStorage, confirm, alert, requestAnimationFrame, fetch,
  globalThis, globalThis.navigator, globalThis.location, setTimeout, clearTimeout);

// 重置元素状态但保留加载时绑定的 onclick（registry.clear() 会把事件处理器一起清掉）
function resetEls() {
  createdCards.length = 0;
  registry.forEach((el) => {
    el._html = ''; el._btns = null; el._sig = '';
    el.classList._set.clear();
    el.dataset = {};
    el.textContent = ''; el.value = ''; el.title = '';
  });
}

/* ---------------- 跑局 ---------------- */
const out = [];
function playGame({ name, gender, talent, rounds, residence, className, pickStrategy, difficulty }) {
  storage.clear();
  resetEls();
  const CFG = A.getCFG();
  CFG.name = name; CFG.gender = gender; CFG.talent = talent;
  CFG.rounds = rounds; CFG.mode = rounds === 30 ? 'speed' : rounds === 60 ? 'standard' : 'immersive';
  CFG.residency = residence; CFG.className = className;
  CFG.difficulty = difficulty || 'hard';
  CFG.track = null;
  A.setDifficulty(CFG.difficulty);

  A.newGame();
  A.startSemester();

  const stats = { rounds: 0, love: 0, exam: 0, choice: 0, campus: 0, guard: 0, clicks: 0, maxAff: 0,
    dailyModuleRenders: 0, mainModuleRenders: 0, mainActs: new Set(), dailyClicks: 0 };
  let guard = 0;
  const seen = new Set();

  while (guard++ < 8000) {
    stats.guard = guard;
    const S = A.getS();
    if (!S || S.ended) break;
    stats.maxAff = Math.max(stats.maxAff, (S.love && S.love.aff) || 0);

    // 1) 事件 / 主选择的按钮
    const area = get('#action-area');
    const btns = buttonsFor(area);
    if (btns.length) {
      // 记录这一屏是「日常选项」还是「本月安排」，用来证明两条路都在跑
      const html = area._html || '';
      if (html.includes('daily-choice-module')) stats.dailyModuleRenders++;
      if (html.includes('current-choice-module')) {
        stats.mainModuleRenders++;
        btns.forEach((b) => { if (b.dataset.act) stats.mainActs.add(b.dataset.act); });
      }
      const pickIdx = pickStrategy(btns, S, stats);
      const btn = btns[Math.min(pickIdx, btns.length - 1)];
      if (typeof btn.onclick !== 'function') { out.push(`  按钮 ${JSON.stringify(btn.dataset)} 没有绑定 onclick`); break; }
      if (html.includes('daily-choice-module')) stats.dailyClicks++;
      stats.clicks++;
      btn.onclick();
      continue;
    }
    // 2) 学期开场
    const semStart = get('#btn-sem-start');
    if (typeof semStart.onclick === 'function' && get('#screen-semester').classList.contains('hidden') === false) {
      stats.clicks++; semStart.onclick(); continue;
    }
    // 3) 选科
    const trackBtn = get('#btn-track-confirm');
    if (typeof trackBtn.onclick === 'function' && !get('#screen-track').classList.contains('hidden')) {
      const cards = buttonsFor(get('#in-track'));
      if (cards.length && typeof cards[0].onclick === 'function') cards[0].onclick();
      stats.clicks++; trackBtn.onclick(); continue;
    }
    // 4) 都没了 → 收尾
    const semStart2 = get('#btn-sem-start');
    if (typeof semStart2.onclick === 'function') { stats.clicks++; semStart2.onclick(); continue; }
    break;
  }

  const S = A.getS();
  return { S, stats, guard };
}

// 策略 A：总选第一项（最积极）
const firstPick = () => 0;
// 策略 B：主选择偏社交（推动好感），事件选项随机
const socialPick = (btns) => {
  const social = btns.findIndex((b) => b.dataset.act === 'social');
  if (social >= 0) return social;
  return Math.floor(Math.random() * btns.length);
};
// 策略 C：主选择偏学习（不推进好感）
const studyPick = (btns) => {
  const study = btns.findIndex((b) => b.dataset.act === 'study');
  if (study >= 0) return study;
  return 0;
};

const runs = [
  { name: '林小明', gender: '男', talent: '社交达人', rounds: 30, residence: '住宿生', className: '平行班', pickStrategy: socialPick, tag: '速通30轮 · 社交优先 · 住宿 · 困难' },
  { name: '苏念', gender: '女', talent: '学霸胚子', rounds: 30, residence: '走读生', className: '弘贤班', pickStrategy: firstPick, tag: '速通30轮 · 全选第一项 · 走读弘贤 · 困难' },
  { name: '陈屿', gender: '男', talent: '心态大师', rounds: 60, residence: '住宿生', className: '平行班', pickStrategy: studyPick, tag: '标准60轮 · 学习优先 · 住宿 · 困难' },
  { name: '顾清', gender: '女', talent: '社交达人', rounds: 30, residence: '走读生', className: '平行班', pickStrategy: socialPick, tag: '速通30轮 · 社交优先 · 走读 · 困难' },
  { name: '沈砚', gender: '男', talent: '社交达人', rounds: 90, residence: '住宿生', className: '平行班', pickStrategy: socialPick, tag: '沉浸90轮 · 社交优先 · 住宿 · 炼狱', difficulty: 'hell' },
  { name: '叶知秋', gender: '女', talent: '学霸胚子', rounds: 60, residence: '走读生', className: '平行班', pickStrategy: firstPick, tag: '标准60轮 · 全选第一项 · 走读 · 炼狱', difficulty: 'hell' },
  // 女玩家走完整 90 轮，用来把男生线九段主线跑穿
  { name: '温言', gender: '女', talent: '社交达人', rounds: 90, residence: '住宿生', className: '平行班', pickStrategy: socialPick, tag: '沉浸90轮 · 社交优先 · 住宿 · 困难（女生线）' },
];

// 两条线的成就键必须互斥，出现对面的键就说明分流漏了
const BOY_NAMES = ['江野', '陆昭', '温叙', '周迟'];
const GIRL_NAMES = ['沈知白', '林越', '顾清和', '陈念'];
const BOY_MS = ['第一个外号', '一把伞的左肩', '绕远的那条路', '看台最上面一排', '同一件外套', '没说出口'];
const GIRL_MS = ['初次心动', '伞下的距离', '后夜祭', '两颗扣子', '无言的夏天'];

// 日常选项的七个时间点：跑满一轮就必须全部出现（S.dailyIdx 取模循环）
const DAILY_SLOT_TITLES = ['🌤️ 早读课前', '📖 课间', '🍚 午饭 & 午休', '🌇 放学之后', '✍️ 晚修时段', '🌙 晚修结束，回宿舍', '📅 周末放假'];

// 恋爱剧情配额的目标占比：1/3。配额是闭环控制，实测能稳定收敛，容差收紧到 ±4%。
const LOVE_RATIO_TARGET = 1 / 3;
const LOVE_RATIO_TOLERANCE = 0.04;

const ratioRows = [];
let routeFails = 0;
// 日常选项新增层：七个时间点循环 + 属性标签覆盖
let dailyFails = 0;
// 「原先的无需改动」：校园事件与本月安排必须照旧
let legacyFails = 0;
let dailyTotals = { cards: 0, renders: 0, slots: 0, runs: 0 };

runs.forEach((r) => {
  let res;
  try {
    res = playGame(r);
  } catch (e) {
    out.push(`FAIL  ${r.tag} → 抛异常：${(e && e.stack || e).split('\n').slice(0, 4).join(' | ')}`);
    routeFails++;
    return;
  }
  const { S, stats, guard } = res;
  const ended = Boolean(S && S.ended);
  const L = S && S.love;
  const lv = S && S.ended ? A.loveEnding() : null;

  // 恋爱剧情占比：直接读游戏内的配额计数器，避免用日志反推。
  const q = (S && S.loveQuota) || { campus: 0, love: 0 };
  const total = q.campus + q.love;
  const ratio = total ? q.love / total : 0;
  const ratioOk = total > 0 && Math.abs(ratio - LOVE_RATIO_TARGET) <= LOVE_RATIO_TOLERANCE;
  ratioRows.push({ tag: r.tag, campus: q.campus, love: q.love, total, ratio, ratioOk, rounds: S ? S.round : 0 });

  // 路线校验：女玩家必须走男生篇，男玩家必须走女生篇
  const isBoy = r.gender === '女';
  const ms = Object.keys((S && S.flags && S.flags.loveMilestones) || {});
  const wrongMs = ms.filter((k) => (isBoy ? GIRL_MS : BOY_MS).includes(k));
  const wrongName = Boolean(L && L.met && !(isBoy ? BOY_NAMES : GIRL_NAMES).includes(L.name));
  const routeOk = wrongMs.length === 0 && !wrongName;
  if (!routeOk) routeFails++;
  const routeLabel = isBoy ? '女生线（攻略对象是男生）' : '男生线（攻略对象是女生）';

  /* ---- 日常选项：与「本月安排」并行，不能顶掉原有事件 ---- */
  const cardHtml = createdCards.map((c) => c._html || '');
  const dailyCards = cardHtml.filter((h) => h.includes('🕒 日常 ·'));
  const campusCards = cardHtml.filter((h) => h.includes('🏫 校园事件 ·') || h.includes('⚠️ 校园事件 ·'));
  const slotsSeen = DAILY_SLOT_TITLES.filter((t) => dailyCards.some((h) => h.includes(t)));
  // 属性药丸必须显示成「学识」而不是「学习」（DAILY_FX_LABELS 覆盖生效）
  const hasStudyLabel = dailyCards.some((h) => h.includes('fx-pill study">学识'));
  const dailyOk = dailyCards.length > 0 && stats.dailyModuleRenders > 0 && hasStudyLabel;
  const cycleOk = slotsSeen.length === DAILY_SLOT_TITLES.length;
  const mainOk = stats.mainModuleRenders > 0 && stats.mainActs.has('sleep') && stats.mainActs.has('social') && stats.mainActs.has('study');
  const legacyOk = campusCards.length > 0;
  if (!dailyOk) dailyFails++;
  if (!cycleOk) dailyFails++;
  if (!mainOk) legacyFails++;
  if (!legacyOk) legacyFails++;
  dailyTotals.cards += dailyCards.length;
  dailyTotals.renders += stats.dailyModuleRenders;
  dailyTotals.slots += slotsSeen.length;
  dailyTotals.runs++;

  out.push(`${ended ? 'PASS' : 'FAIL'}  ${r.tag}`);
  out.push(`      轮次 ${S ? S.round : '?'}/${r.rounds} · 学期 ${S ? A.SEM_NAMES[S.semIdx] : '?'} · 点击 ${stats.clicks} 次`);
  out.push(`      属性 睡眠 ${S ? S.sleep : '?'} / 社交 ${S ? S.social : '?'} / 学习 ${S ? S.study : '?'} · 高考 ${S && S.gaokao ? S.gaokao.finalScore : '—'}`);
  out.push(`      恋爱 ${L ? (L.met ? `${L.name}(${L.char}) 好感 ${L.aff} 阶段 ${L.stage} 约会 ${L.dates || 0} 次 恋人=${L.active}` : '未遇见') : '无'} · 峰值好感 ${stats.maxAff}`);
  out.push(`      剧情占比 校园 ${q.campus} / 恋爱 ${q.love} = ${(ratio * 100).toFixed(1)}%（目标 33.3%）${ratioOk ? ' ✓' : ' ✗'}`);
  out.push(`      结局 ${lv ? lv.title : '未结算'} · 成就 ${ms.join('/') || '无'}`);
  out.push(`      路线 ${routeLabel} ${routeOk ? '✓' : `✗（串味：成就 ${wrongMs.join('/') || '—'} · 对象 ${(L && L.name) || '—'}）`}`);
  out.push(`      日常选项 卡片 ${dailyCards.length} 张 / 触发 ${stats.dailyModuleRenders} 次 / 时间点 ${slotsSeen.length}/7${cycleOk ? ' ✓' : ` ✗（缺 ${DAILY_SLOT_TITLES.filter((t) => !slotsSeen.includes(t)).join('、')}）`} · 学识标签 ${hasStudyLabel ? '✓' : '✗'}`);
  out.push(`      原有内容 校园事件卡 ${campusCards.length} 张 ${legacyOk ? '✓' : '✗'} · 本月安排 ${stats.mainModuleRenders} 次 ${mainOk ? '✓' : '✗'}`);
  if (!ended) out.push('      ⚠ 没有走到结局');
});

/* ---------------- 路线互斥：同一份恋爱数据在两条线下必须走各自的结局 ---------------- */
const ROUTE_ENDINGS = [
  { gender: '男', name: '林越', lover: '两颗扣子', regret: '无言的夏天', forbidLover: '同一件外套', forbidRegret: '没说出口' },
  { gender: '女', name: '江野', lover: '同一件外套', regret: '没说出口', forbidLover: '两颗扣子', forbidRegret: '无言的夏天' },
];
ROUTE_ENDINGS.forEach((rc) => {
  const CFG = A.getCFG();
  CFG.gender = rc.gender;
  const S = A.getS();
  if (!S) { out.push(`FAIL  ${rc.gender}玩家结局路由测试拿不到 S（上一局把 S 清空了）`); routeFails++; return; }
  S.flags.breakups = 0;

  // 恋人 + 峰值 96 → 高光结局
  S.flags.loveMilestones = {};
  S.love = {
    met: true, char: 'A', name: rc.name, gender: rc.gender === '男' ? '女' : '男',
    aff: 96, stage: 5, active: true, confessed: true, refused: false, peakAff: 96, seen: {}, flags: {},
  };
  const lv1 = A.loveEnding();
  const keys1 = Object.keys(S.flags.loveMilestones);
  const ok1 = lv1.title === rc.lover && keys1.includes(rc.lover) && !keys1.includes(rc.forbidLover);
  if (!ok1) routeFails++;
  out.push(`${ok1 ? 'PASS' : 'FAIL'}  ${rc.gender}玩家恋人结局 → ${lv1.title}（成就 ${keys1.join('/')}）`);

  // 暧昧 88 未告白 → 遗憾结局
  S.flags.loveMilestones = {};
  S.love = {
    met: true, char: 'A', name: rc.name, gender: rc.gender === '男' ? '女' : '男',
    aff: 88, stage: 4, active: false, confessed: false, refused: false, peakAff: 88, seen: {}, flags: {},
  };
  const lv2 = A.loveEnding();
  const keys2 = Object.keys(S.flags.loveMilestones);
  const ok2 = lv2.title === rc.regret && keys2.includes(rc.regret) && !keys2.includes(rc.forbidRegret);
  if (!ok2) routeFails++;
  out.push(`${ok2 ? 'PASS' : 'FAIL'}  ${rc.gender}玩家未告白结局 → ${lv2.title}（成就 ${keys2.join('/')}）`);
});

// 路由与对象表：切性别后必须立刻换表
(function checkRouteTable() {
  const CFG = A.getCFG();
  CFG.gender = '男';
  const girl = A.loveRoute() === 'girl' && A.loveStoryList()[0].build === A.loveStoryList()[0].build;
  CFG.gender = '女';
  const boy = A.loveRoute() === 'boy';
  const ok = girl && boy;
  if (!ok) routeFails++;
  out.push(`${ok ? 'PASS' : 'FAIL'}  路由切换：男玩家→girl，女玩家→boy`);
})();

/* ---------------- 汇总 ---------------- */
const ratioFails = ratioRows.filter((x) => !x.ratioOk).length;
const overallLove = ratioRows.reduce((a, x) => a + x.love, 0);
const overallCampus = ratioRows.reduce((a, x) => a + x.campus, 0);
const overallRatio = overallCampus + overallLove ? overallLove / (overallCampus + overallLove) : 0;
const ratioLine = `恋爱剧情占比：合计 ${overallLove} / ${overallCampus + overallLove} = ${(overallRatio * 100).toFixed(1)}% · 目标 33.3% ± ${(LOVE_RATIO_TOLERANCE * 100).toFixed(0)}% → ${ratioFails === 0 ? 'PASS' : `FAIL（${ratioFails} 局越界）`}`;

const fails = out.filter((l) => l.startsWith('FAIL')).length + ratioFails + routeFails + dailyFails + legacyFails;
const avgDailyCards = dailyTotals.runs ? (dailyTotals.cards / dailyTotals.runs).toFixed(1) : '0';
const dailyLine = `日常选项：${dailyTotals.runs} 局共 ${dailyTotals.cards} 张日常卡（均 ${avgDailyCards} 张/局）· 时间点覆盖 ${dailyTotals.slots}/${dailyTotals.runs * DAILY_SLOT_TITLES.length} · ${dailyFails === 0 ? 'PASS（七点循环 + 学识标签）' : `FAIL（${dailyFails} 项）`}`;
const legacyLine = `原有内容零改动：校园事件卡 / 本月安排三选一 → ${legacyFails === 0 ? 'PASS' : `FAIL（${legacyFails} 项）`}`;
const summary = [
  `跑局数：${runs.length}（男玩家 ${runs.filter((r) => r.gender === '男').length} 局 / 女玩家 ${runs.filter((r) => r.gender === '女').length} 局）`,
  '',
  ...out,
  '',
  ratioLine,
  `路线分流：${routeFails === 0 ? 'PASS（两条线互不串味）' : `FAIL（${routeFails} 处串味）`}`,
  dailyLine,
  legacyLine,
  '',
  fails === 0 ? `全部通过` : `失败 ${fails} 项`,
].join('\r\n');
dump(summary);
console.log(summary);
process.exit(fails === 0 ? 0 : 1);
