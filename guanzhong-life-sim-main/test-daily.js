// 日常选项逻辑冒烟测试：从 game.js 抽出【日常选项】模块，用桩件逐条核对需求规格
const fs = require('fs');
const path = require('path');

const RESULT = path.join(__dirname, 'test-daily-result.txt');
function dump(text) { try { fs.writeFileSync(RESULT, text, 'utf8'); } catch (e) {} }
process.on('uncaughtException', (e) => { dump('CRASH: ' + (e && e.stack || e)); process.exit(1); });

const gamePath = path.join(__dirname, 'public', 'game.js');
const src = fs.readFileSync(gamePath, 'utf8').split(/\r?\n/);
// 模块区间：从「日常选项 · 寄宿制高中的一天」注释框到「恋爱线 · 好感度五阶段」之前
const startIdx = src.findIndex((l) => l.includes('日常选项 · 寄宿制高中的一天')) - 1;
const endIdx = src.findIndex((l) => l.includes('恋爱线 · 好感度五阶段')) - 1;
if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) throw new Error('找不到日常选项模块边界');
const mod = src.slice(startIdx, endIdx).join('\n');

/* ---------------- 桩件 ---------------- */
let boarder = true;                       // 是否住宿生
let chanceVal = false;                    // 让 chance(p) 走哪个分支
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const chance = () => chanceVal;
const isBoarder = () => boarder;
const LOG = [];
const journal = (l) => { LOG.push(String(l)); };

const S = {
  semIdx: 0,
  dailyIdx: 0,
  flags: { dailyMilestones: {}, schoolLore: 0, dayPass: false },
};

const factory = new Function('S', 'pick', 'chance', 'isBoarder', 'journal',
  mod + `
  return { DAILY_SLOTS, DAILY_RANDOM_EVENTS, DAILY_FX_LABELS, DAILY_RANDOM_CHANCE, DAILY_LORE_NEED,
           DAILY_LORE_CLUES, dailyMilestones, dailyCanLeave, dailyGrantLeavePass, dailyUseLeavePass,
           dailySlotIndex, advanceDailySlot, buildDailyEvent, buildDailyRandomEvent };`);
const D = factory(S, pick, chance, isBoarder, journal);

const out = [];
const ok = (cond, msg) => out.push(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);

const fxEq = (a, b) => {
  const ka = Object.keys(a || {}).sort().join(','), kb = Object.keys(b || {}).sort().join(',');
  if (ka !== kb) return false;
  return Object.keys(a || {}).every((k) => a[k] === b[k]);
};
const findOpt = (slotKey, label) => {
  const slot = D.DAILY_SLOTS.find((s) => s.key === slotKey);
  return slot && slot.options.find((o) => o.label === label);
};

/* ---- 1. 七个时间点 ---- */
const wantSlots = [
  ['morning', '🌤️ 早读课前'],
  ['break', '📖 课间'],
  ['lunch', '🍚 午饭 & 午休'],
  ['afternoon', '🌇 放学之后'],
  ['evening', '✍️ 晚修时段'],
  ['night', '🌙 晚修结束，回宿舍'],
  ['weekend', '📅 周末放假'],
];
ok(D.DAILY_SLOTS.length === 7, `七个时间点（实际 ${D.DAILY_SLOTS.length}）`);
ok(wantSlots.every(([k, t], i) => D.DAILY_SLOTS[i].key === k && D.DAILY_SLOTS[i].title === t),
  '时间点顺序：早读 → 课间 → 午饭午休 → 放学 → 晚修 → 晚修后 → 周末');

/* ---- 2. 选项总数与属性键 ---- */
const totalOpts = D.DAILY_SLOTS.reduce((n, s) => n + s.options.length, 0);
ok(totalOpts === 27, `日常选项共 27 个（实际 ${totalOpts}）`);
const perSlot = D.DAILY_SLOTS.map((s) => `${s.key}:${s.options.length}`).join(' ');
out.push(`      分布 ${perSlot}`);

const ALLOWED = ['sleep', 'social', 'study'];
let badKey = null;
D.DAILY_SLOTS.forEach((s) => s.options.forEach((o) => {
  Object.keys(o.fx || {}).forEach((k) => { if (!ALLOWED.includes(k)) badKey = `${s.key}/${o.label} → ${k}`; });
}));
ok(badKey === null, `只影响睡眠 / 社交 / 学识${badKey ? `（越界：${badKey}）` : ''}`);

/* ---- 3. 需求规格逐条核对 ---- */
const spec = [
  ['morning', '认真晨读背书', { study: 2, sleep: -1 }],
  ['morning', '悄悄补昨晚没写完的作业', { study: 1, sleep: -1 }],
  ['morning', '趴在桌上补觉', { sleep: 2, study: -1 }],
  ['morning', '走廊和同学闲聊', { social: 2, study: -2 }],
  ['break', '趴桌小憩', { sleep: 2, study: -1, social: -1 }],
  ['break', '拿习题去办公室找老师答疑', { study: 3, sleep: -3 }],
  ['break', '和好友去操场走走、买点零食', { social: 2, sleep: -2 }],
  ['break', '跑去社团活动室，捣鼓脚滑车改装', { social: 1, study: 1, sleep: -2 }],
  ['break', '在教室和同桌聊天打闹', { social: 2, sleep: -1 }],
  ['lunch', '食堂正常吃饭，回宿舍午休', { sleep: 3, study: -1, social: -1 }],
  ['lunch', '快速吃完饭留在教室刷题', { study: 2, sleep: -1 }],
  ['lunch', '和同学结伴出校门附近探店', { social: 3, sleep: -1, study: -1 }],
  ['afternoon', '去操场打球 / 跑步', { sleep: 2, study: -2 }],
  ['afternoon', '留在教室写作业，提前完成晚修任务', { study: 2, sleep: -1, social: -1 }],
  ['afternoon', '去社团活动室活动', { social: 2, study: -1 }],
  ['afternoon', '逛校园，去校史馆和老校舍附近散步', {}],
  ['afternoon', '在饭堂慢慢吃饭，和同学唠嗑', { social: 1, study: -1 }],
  ['evening', '专心刷题、整理错题', { study: 3, social: -1 }],
  ['evening', '写一会作业就和同桌传纸条', { social: 2, study: -1, sleep: -1 }],
  ['evening', '偷偷看课外书', { social: 2, study: -2 }],
  ['evening', '遇到难题心态崩了，发呆摆烂', {}],
  ['night', '快速洗漱，早点上床休息', { sleep: 4, social: -1, study: -1 }],
  ['night', '继续在台灯下刷题', { study: 2, sleep: -3 }],
  ['weekend', '在家埋头刷题备战月考', { study: 3, sleep: -3 }],
  ['weekend', '约同学线下见面玩', { social: 2, sleep: -2 }],
  ['weekend', '参加学校社团的外出活动', { social: 2, study: 1, sleep: -2 }],
  ['weekend', '好好睡一觉休息，出门逛街散心', { sleep: 3, study: -3 }],
];
let specBad = [];
spec.forEach(([k, label, fx]) => {
  const o = findOpt(k, label);
  if (!o) { specBad.push(`${k}/${label} 缺失`); return; }
  if (!fxEq(o.fx, fx)) specBad.push(`${label} → ${JSON.stringify(o.fx)} 期望 ${JSON.stringify(fx)}`);
});
ok(specBad.length === 0, `27 个选项的属性增减与需求一致${specBad.length ? `（${specBad.join('；')}）` : ''}`);

/* ---- 4. 概率型分支：早读补觉 / 课间打闹 / 晚修刷题 / 早睡失眠 ---- */
chanceVal = false;
const napFail = findOpt('morning', '趴在桌上补觉').resolve();
chanceVal = true;
const napBad = findOpt('morning', '趴在桌上补觉').resolve();
ok(napFail.fx.sleep === 2 && napFail.fx.study === -1 && !napFail.fx.social,
  `早读补觉：正常 睡眠+2 学识-1（实际 ${JSON.stringify(napFail.fx)}）`);
ok(napBad.fx.sleep === 1 && napBad.fx.social === -1,
  `早读补觉：小概率被值班老师提醒（实际 ${JSON.stringify(napBad.fx)}）`);

chanceVal = false;
const chatOk = findOpt('break', '在教室和同桌聊天打闹').resolve();
chanceVal = true;
const chatBad = findOpt('break', '在教室和同桌聊天打闹').resolve();
ok(chatOk.fx.social === 2 && chatOk.fx.sleep === -1 && !chatOk.fx.study,
  `课间打闹：正常 社交+2 睡眠-1（实际 ${JSON.stringify(chatOk.fx)}）`);
ok(chatBad.fx.sleep === -1 && chatBad.fx.social === undefined,
  `课间打闹：有概率被班干部提醒安静（实际 ${JSON.stringify(chatBad.fx)}）`);

chanceVal = false;
const studyOk = findOpt('evening', '专心刷题、整理错题').resolve();
chanceVal = true;
const studyBad = findOpt('evening', '专心刷题、整理错题').resolve();
ok(studyOk.fx.study === 3 && studyOk.fx.social === -1, `晚修刷题：正常 学识+3 社交-1（实际 ${JSON.stringify(studyOk.fx)}）`);
ok(fxEq(studyBad.fx, {}) && studyBad.title.includes('心态崩了'),
  `晚修刷题：40% 概率心态崩了，无属性加成（实际 ${JSON.stringify(studyBad.fx)}）`);

chanceVal = false;
const sleepOk = findOpt('night', '快速洗漱，早点上床休息').resolve();
chanceVal = true;
const sleepBad = findOpt('night', '快速洗漱，早点上床休息').resolve();
ok(sleepOk.fx.sleep === 4 && sleepOk.fx.social === -1 && sleepOk.fx.study === -1,
  `早睡：正常 睡眠+4 社交-1 学识-1（实际 ${JSON.stringify(sleepOk.fx)}）`);
ok(fxEq(sleepBad.fx, {}) && sleepBad.title.includes('睡不着'),
  `早睡：30% 概率失眠，属性不变（实际 ${JSON.stringify(sleepBad.fx)}）`);

/* ---- 5. 时间点循环（S.dailyIdx 取模 7） ---- */
S.dailyIdx = 0;
const cycle = [];
for (let i = 0; i < 9; i++) {
  const ev = D.buildDailyEvent();
  cycle.push(ev.intro.title);
}
ok(cycle[0] === '🌤️ 早读课前' && cycle[6] === '📅 周末放假' && cycle[7] === '🌤️ 早读课前',
  '时间点循环：跑完第 7 个（周末）后回到第 1 个（早读）');
ok(S.dailyIdx === 9 % 7, `游标推进正确（dailyIdx=${S.dailyIdx}）`);
ok(D.dailySlotIndex() === 2, `dailySlotIndex 取模正确（${D.dailySlotIndex()}）`);

/* ---- 6. 队列卡片结构：标签 / 属性名覆盖 ---- */
const ev = D.buildDailyEvent();
ok(ev.t === 'choice' && ev.kicker === '日常选项' && ev.moduleClass === 'daily-choice-module',
  '日常事件渲染为独立卡片（daily-choice-module）');
ok(ev.intro.kind === 'daily', '事件卡 kind=daily → 日志显示「🕒 日常」');
ok(ev.options.every((o) => o.kind === 'daily' && o.fxLabels === D.DAILY_FX_LABELS),
  '所有选项都带 daily 标签与属性名覆盖');
ok(D.DAILY_FX_LABELS.study === '学识', '属性名覆盖：study 显示为「学识」');

/* ---- 7. 出校探店：走读生随时可去，住宿生要有外出假 ---- */
S.dailyIdx = 2; // 午饭时间点（buildDailyEvent 会推进游标，每次都要重置）
boarder = false;
let opts = D.buildDailyEvent().options;
ok(opts.some((o) => o.label.includes('出校门附近探店')), '走读生：午饭可选「出校探店」');
boarder = true;
S.flags.dayPass = false;
S.dailyIdx = 2;
opts = D.buildDailyEvent().options;
ok(!opts.some((o) => o.label.includes('出校门附近探店')), '住宿生无外出假：不出现在选项里');
S.flags.dayPass = true;
S.dailyIdx = 2;
opts = D.buildDailyEvent().options;
ok(opts.some((o) => o.label.includes('出校门附近探店')), '住宿生有外出假：可以出校探店');
D.dailyUseLeavePass();
ok(S.flags.dayPass === false, '出校探店消耗掉外出假');
ok(D.dailyCanLeave() === false, '外出假用完后住宿生不能出校');

/* ---- 8. 周末外出拿外出假 ---- */
boarder = true; S.flags.dayPass = false;
const weekend = D.DAILY_SLOTS.find((s) => s.key === 'weekend');
['约同学线下见面玩', '参加学校社团的外出活动', '好好睡一觉休息，出门逛街散心'].forEach((label) => {
  S.flags.dayPass = false;
  const o = weekend.options.find((x) => x.label === label);
  if (o && typeof o.onPick === 'function') o.onPick();
  ok(S.flags.dayPass === true, `周末「${label}」→ 拿到外出假`);
});
S.flags.dayPass = false;
const homeOpt = weekend.options.find((x) => x.label === '在家埋头刷题备战月考');
if (typeof homeOpt.onPick === 'function') homeOpt.onPick();
ok(S.flags.dayPass === false, '周末在家刷题不会拿到外出假');

/* ---- 9. 校史秘闻：随机 +3 属性 + 集齐 3 条解锁 ---- */
boarder = false;
S.flags.schoolLore = 0; S.flags.dailyMilestones = {};
const loreOpt = findOpt('afternoon', '逛校园，去校史馆和老校舍附近散步');
let loreOk = true, loreAttrSeen = new Set();
const LORE_ROUNDS = 60; // 三种属性等概率，抽 60 次才够稳（漏一种的概率约 3.6e-11）
for (let i = 0; i < LORE_ROUNDS; i++) {
  const r = loreOpt.resolve();
  const keys = Object.keys(r.fx);
  if (keys.length !== 1 || r.fx[keys[0]] !== 3) loreOk = false;
  if (!ALLOWED.includes(keys[0])) loreOk = false;
  loreAttrSeen.add(keys[0]);
  r.onPick();
}
ok(loreOk, '校史馆散步：每次随机 +3 点属性（睡眠 / 社交 / 学识 之一）');
ok(loreAttrSeen.size === 3, `三种属性都可能被加到（本次抽到 ${[...loreAttrSeen].join('/')}）`);
ok(S.flags.schoolLore === LORE_ROUNDS, `线索累计正确（${S.flags.schoolLore} 条）`);
ok(D.dailyMilestones()['校史秘闻'] === true, `集齐 ${D.DAILY_LORE_NEED} 条线索解锁成就「校史秘闻」`);
ok(D.DAILY_LORE_CLUES.length >= D.DAILY_LORE_NEED, `线索库 ${D.DAILY_LORE_CLUES.length} 条 ≥ 解锁门槛 ${D.DAILY_LORE_NEED}`);

/* ---- 10. 随机小事件：5% 概率 + 两个事件 ---- */
ok(D.DAILY_RANDOM_CHANCE === 0.05, `随机小事件概率 5%（实际 ${D.DAILY_RANDOM_CHANCE * 100}%）`);
chanceVal = false;
ok(D.buildDailyRandomEvent() === null, '未命中概率时不触发随机小事件');
chanceVal = true;
const seenTitles = new Set();
for (let i = 0; i < 60; i++) seenTitles.add(D.buildDailyRandomEvent().intro.title);
ok(seenTitles.size === 2 && D.DAILY_RANDOM_EVENTS.length === 2, `随机小事件共 2 个（${[...seenTitles].join(' / ')}）`);

chanceVal = true;
// 随机小事件是随机抽的，这里按标题各抓一次
const grabRandom = (kw) => {
  for (let i = 0; i < 200; i++) {
    const e = D.buildDailyRandomEvent();
    if (e && e.intro.title.includes(kw)) return e;
  }
  return null;
};
const boardEv = grabRandom('黑板报');
const boardOpts = boardEv.options;
ok(boardOpts[0].label === '答应接下任务' && fxEq(boardOpts[0].fx, { social: 2 }),
  `黑板报：答应接下任务 → 社交+2（实际 ${JSON.stringify(boardOpts[0].fx)}）`);
ok(boardOpts[1].label === '委婉推辞' && fxEq(boardOpts[1].fx, {}),
  `黑板报：委婉推辞 → 无加成（实际 ${JSON.stringify(boardOpts[1].fx)}）`);

const noteEv = grabRandom('笔记');
const noteOpts = noteEv.options;
ok(noteOpts[0].label === '大方借给他' && fxEq(noteOpts[0].fx, { social: 3 }),
  `笔记：大方借给他 → 社交+3（实际 ${JSON.stringify(noteOpts[0].fx)}）`);
ok(noteOpts[1].label === '婉拒，自己还要用' && fxEq(noteOpts[1].fx, { social: -1, study: 3 }),
  `笔记：婉拒 → 社交-1 学识+3（实际 ${JSON.stringify(noteOpts[1].fx)}）`);
ok(boardEv.intro.kind === 'daily' && boardEv.options.every((o) => o.fxLabels === D.DAILY_FX_LABELS),
  '随机小事件同样走日常卡与属性名覆盖');

/* ---- 11. 旧存档兜底：dailyIdx 缺失时从 0 开始 ---- */
S.dailyIdx = undefined;
ok(D.dailySlotIndex() === 0 && S.dailyIdx === 0, '旧存档没有 dailyIdx 时从「早读课前」重新开始');

/* ---------------- 汇总 ---------------- */
const fails = out.filter((l) => l.startsWith('FAIL')).length;
const summary = [
  `模块行数：${mod.split('\n').length}`,
  `时间点：${D.DAILY_SLOTS.length} 个 · 日常选项 ${totalOpts} 个 · 随机小事件 ${D.DAILY_RANDOM_EVENTS.length} 个 · 线索 ${D.DAILY_LORE_CLUES.length} 条`,
  '',
  ...out,
  '',
  fails === 0 ? `全部通过（${out.filter((l) => l.startsWith('PASS')).length} 项）` : `失败 ${fails} 项`,
].join('\r\n');
dump(summary);
console.log(summary);
process.exit(fails === 0 ? 0 : 1);
