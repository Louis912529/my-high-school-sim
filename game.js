'use strict';
/* ================================================================
   东莞中学三年 · 单机文字游戏 —— 深色 UI / 三属性 / 开局分步
   高一上学期结束后进行 3+1+2 选科，难度固定为困难 +1
   ================================================================ */

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const chance = (p) => Math.random() < p;
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

// localStorage 在部分内置浏览器（微信/QQ WebView）、隐私模式或禁用 Cookie 时会直接抛异常。
// 统一包一层，保证任何情况下游戏都能继续跑，只是不存档。
const store = {
  get(k, fallback) {
    try { const v = localStorage.getItem(k); return v == null ? fallback : v; } catch (e) { return fallback; }
  },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};
function storeJson(key, fallback) {
  try {
    const parsed = JSON.parse(store.get(key, '') || 'null');
    return parsed == null ? fallback : parsed;
  } catch (e) { return fallback; }
}

/* ---------------- 会话配置（开局选择） ---------------- */
let CFG = {
  mode: 'immersive',
  rounds: 90,
  gender: '男',
  talent: '学霸胚子',
  className: '镜堂班',
  residency: '住宿生',
  difficulty: 'hard',
  track: null,
  name: '',
  // 入学的学年起始年，开局时按真实日期定死，存档一起带走（否则跨年读档日期会漂）。
  loveMode: 'none',   // 感情倾向：full=纯爱, half=有情, none=无意（默认专注学业）
  startYear: null,
};

// 开局天赋：只给起步属性，不再和恋爱线绑定。
const TALENT_FX = Object.freeze({
  '学霸胚子': { study: 8 },
  '社交达人': { social: 10 },
  '心态大师': { sleep: 10 },
});

function talentFx(name) {
  return TALENT_FX[name] || TALENT_FX['学霸胚子'];
}

/* ---------------- 难度 ----------------
   两档：
   · hard 普通 —— 原本的默认强度。
   · hell 困难 —— 新增的更高难度模式：考试更密、属性收益更低、
     休学更容易、发挥失常扣分更多、恋爱推进更慢。
   所有数值集中在预设里，改一处即可同时影响全局。 */
const DIFFICULTY_PRESETS = Object.freeze({
  hard: Object.freeze({
    key: 'hard',
    level: 1,
    label: '普通',
    short: '普通',
    blurb: '默认难度。',
    examInterval: 5,          // 每 N 轮一次考试
    crisisRecovery: 6,        // 极低睡眠时的强制休整回补
    rankOffset: 8,            // 排名中心额外后移（同样学习属性名次更靠后）
    gaokaoPenalty: [10, 30],  // 发挥失常：高考实际分数额外扣减区间
    leaveChanceMul: 0.85,        // 休学概率倍率
    affMul: 1,                // 好感增长倍率
  }),
  hell: Object.freeze({
    key: 'hell',
    level: 2,
    label: '困难',
    short: '困难',
    blurb: '更高难度，属性收益较低。',
    examInterval: 4,
    crisisRecovery: 3,
    rankOffset: 22,
    gaokaoPenalty: [15, 32],
    leaveChanceMul: 1.05,
    affMul: 0.7,
  }),
});

// 当前生效的难度。开局可选，旧存档一律按困难兜底。
let DIFFICULTY = DIFFICULTY_PRESETS.hard;
function setDifficulty(key) {
  DIFFICULTY = DIFFICULTY_PRESETS[key] || DIFFICULTY_PRESETS.hard;
  return DIFFICULTY;
}
function difficultyNote(key) {
  const d = DIFFICULTY_PRESETS[key] || DIFFICULTY_PRESETS.hard;
  return `${d.label}：${d.blurb}`;
}

// 抓手机的人：年级主任与级长。课堂上 / 晚修里玩手机，被他们逮到概率很大。
const PHONE_CATCHERS = ['年级主任郑rj', '年级主任林zy', '级长巨 wf', '级长练jc', '级长曾y'];

function phoneCatcher() {
  return pick(PHONE_CATCHERS);
}

function normalizeClassName(name) {
  if (name === '容庚班') return '容庚班';
  if (name === '普通班') return '普通班';   // ← 新增这一行
  // 兼容修改前的旧存档：原强化班沿用成绩加成，其他班归入镜堂班。
  if (name === '🐑班') return '容庚班';
  return '镜堂班';
}
function normalizeResidency(value) {
  return value === '走读生' ? '走读生' : '住宿生';
}
function isBoarder() { return CFG.residency === '住宿生'; }
function campusForSem(semIdx) { return semIdx >= 4 ? '新教学楼' : '高三楼'; }
function dormCapacityForSem(semIdx) { return semIdx >= 4 ? 10 : 12; }
function weekendScheduleForSem(semIdx) {
  return semIdx >= 4 ? '周六下午放学，周日下午 7 点回校' : '周六中午放学，周日下午 7 点回校';
}
function dormLabelForSem(semIdx) {
  if (!isBoarder()) return '走读 · 不吃饭堂';
  if (CFG.gender === '男') return ` 男生宿舍`;
  return `${campusForSem(semIdx)} · 宿舍按年级分配`;
}
function residencySummaryForSem(semIdx) {
  if (!isBoarder()) return `走读生 · ${campusForSem(semIdx)} · ${weekendScheduleForSem(semIdx)} · 早餐和外卖可从校外带入`;
  return `住宿生 `;
}
function collectFood(name) {
  if (!S) return;
  S.foods = S.foods || [];
  if (!S.foods.includes(name)) S.foods.push(name);
}

function buildOpenDayEvent() {
  if (!S || !S.flags) return null;
  const phase = phaseFor(S.round);
  const events = [
    {
      month: '12月', flag: 'openDayDecSeen', title: '🏫 十二月学校开放日',
      body: '今天是校园开放日，家长和初中生沿着教学楼参观。你站在熟悉的走廊里，第一次从“学生”的视角介绍自己的学校。',
      fx: { social: 3, study: 1, sleep: -2 }, journal: '· 12月学校开放日',
    },
    {
      month: '3月', flag: 'openDayMarSeen', title: '🌱 三月学校开放日',
      body: '春天的树影铺满操场，学校又迎来一批来访的家长和学弟学妹。教学楼和体育馆都很热闹。',
      fx: { social: 4, study: 1, sleep: -1 }, journal: '· 3月学校开放日',
    },
    {
      month: '5月', flag: 'openDayMaySeen', title: '🌼 五月学校开放日',
      body: '五月的校园开放日撞上了冲刺季。外面的人在看校园风景，你们在教室里看倒计时，忙碌和热闹隔着一扇门同时发生。',
      fx: { social: 3, study: 1, sleep: -2 }, journal: '· 5月学校开放日',
    },
  ];
  const event = events.find((item) => phase.startsWith(item.month) && !S.flags[item.flag]);
  if (!event) return null;
  return {
    t: 'text', kind: 'event', title: event.title, body: event.body, fx: event.fx,
    journal: event.journal,
    onPick: () => { S.flags[event.flag] = true; },
  };
}

/* ---------------- 真实节日 ----------------
   日期全部来自真实日历：
     · 元旦 / 劳动节 / 国庆节 是固定公历日期；
     · 春节 / 清明节 / 端午节 / 中秋节 逐年不同，取自农历换算与国务院节假日安排。
   农历表覆盖 2026—2031 年；超出范围的年份只保留固定日期节日，**不瞎编农历日期**。

   一个「学术月份」可能撞上两个节日：
     2028 年 1 月 = 元旦 + 春节（1/26），5 月 = 劳动节 + 端午（5/28），10 月 = 国庆 + 中秋（10/3）。
   这种情况合并成一条事件，属性求和后做上下限截断。 */
const REAL_LUNAR_FESTIVALS = {
  2026: { spring: [2, 17], qingming: [4, 5], dragon: [6, 19], midautumn: [9, 25] },
  2027: { spring: [2, 6], qingming: [4, 5], dragon: [6, 9], midautumn: [9, 15] },
  2028: { spring: [1, 26], qingming: [4, 4], dragon: [5, 28], midautumn: [10, 3] },
  2029: { spring: [2, 13], qingming: [4, 4], dragon: [6, 16], midautumn: [9, 22] },
  2030: { spring: [2, 3], qingming: [4, 5], dragon: [6, 5], midautumn: [9, 12] },
  2031: { spring: [1, 23], qingming: [4, 5], dragon: [6, 24], midautumn: [10, 1] },
};

function festivalsOfYear(year) {
  const t = REAL_LUNAR_FESTIVALS[year];
  const list = [
    {
      id: `${year}-元旦`, month: 1, day: 1, emoji: '🎊', name: '元旦', fx: { sleep: 1, social: 1 ,study: -1},
      text: '元旦放假，教室后墙的倒计时被撕掉一页，换上了新的数字。你在家里睡到自然醒，醒来时听见楼下有人在放烟花。',
    },
    {
      id: `${year}-劳动节`, month: 5, day: 1, emoji: '🧹', name: '劳动节', fx: { sleep: 3, social: 1, study: -3 },
      text: '五一小长假。有人在补课，有人在补觉，你选了后者——反正作业已经堆在桌角了。',
    },
    {
      id: `${year}-国庆节`, month: 10, day: 1, emoji: '🏮', name: '国庆节', fx: { sleep: 3, social: 2, study: -2 },
      text: '国庆假期。鲜汇挤满了人，你在人群里排了很久的队，只为了一份滑蛋牛肉饭。',
    },
  ];
  if (!t) return list; // 没有农历数据就只推固定日期节日
  list.push(
    {
      id: `${year}-春节`, month: t.spring[0], day: t.spring[1], emoji: '🧧', name: '春节', fx: { sleep: 4, social: 2, study: -1 },
      text: `春节（${t.spring[0]} 月 ${t.spring[1]} 日）。这是三年里唯一能连睡好几天的一段日子。亲戚问起成绩，你含糊地说了句「还行」。`,
    },
    {
      id: `${year}-清明节`, month: t.qingming[0], day: t.qingming[1], emoji: '🌿', name: '清明节', fx: { sleep: 2, social: 1, study: -1 },
      text: `清明（${t.qingming[0]} 月 ${t.qingming[1]} 日）放假。家里去扫墓，回来的路上下着小雨，你在车里睡了一路。`,
    },
    {
      id: `${year}-端午节`, month: t.dragon[0], day: t.dragon[1], emoji: '🍃', name: '端午节', fx: { sleep: 2, social: 2, study: -1 },
      text: `端午（${t.dragon[0]} 月 ${t.dragon[1]} 日）。家里包了粽子，你带回宿舍分了一圈，咸的甜的又吵了一架。`,
    },
    {
      id: `${year}-中秋节`, month: t.midautumn[0], day: t.midautumn[1], emoji: '🌕', name: '中秋节', fx: { sleep: 3, social: 2, study: -1 },
      text: `中秋（${t.midautumn[0]} 月 ${t.midautumn[1]} 日）。晚修提前放了，有人去操场上看月亮。`,
    },
  );
  return list;
}

function buildRealHolidayEvent() {
  if (!S || !S.flags) return null;
  const { year, month } = calendarOf(S.round);
  if (!Array.isArray(S.flags.festivalsSeen)) S.flags.festivalsSeen = [];
  const hit = festivalsOfYear(year).filter((f) => f.month === month && !S.flags.festivalsSeen.includes(f.id));
  if (!hit.length) return null;

  const fx = {};
  hit.forEach((f) => Object.keys(f.fx).forEach((k) => { fx[k] = (fx[k] || 0) + f.fx[k]; }));
  Object.keys(fx).forEach((k) => { fx[k] = clamp(fx[k], -3, 5); });

  const names = hit.map((f) => f.name);
  const dates = hit.map((f) => `${f.month} 月 ${f.day} 日`).join('、');
  const title = hit.length > 1 ? `🎏 ${names.join(' · ')}` : `${hit[0].emoji} ${hit[0].name}`;
  const ids = hit.map((f) => f.id);
  return {
    t: 'text', kind: 'event', title,
    body: `${dates}。\n\n${hit.map((f) => f.text).join('\n\n')}`,
    fx,
    journal: `· ${names.join(' / ')}`,
    onPick: () => { ids.forEach((id) => { if (!S.flags.festivalsSeen.includes(id)) S.flags.festivalsSeen.push(id); }); },
  };
}

/* ---------------- 运行时状态 ---------------- */
let S = null;
let QUEUE = [];
let AUTO = false;
let autoTimer = null;
let awaitingChoice = false;

/* ---------------- 属性辅助 ---------------- */
function sleepBand(v) {
  if (v >= 80) return 'healthy';
  if (v >= 70) return 'tired';
  if (v >= 60) return 'noticeable';
  if (v >= 50) return 'leave-risk';
  return 'severe';
}
function sleepLabel(v) {
  if (v >= 80) return '健康';
  if (v >= 70) return '疲惫';
  if (v >= 60) return '明显疲惫';
  if (v >= 50) return '休学风险';
  return '重度透支';
}
function socialLabel(v) {
  if (v >= 80) return '合群';
  if (v >= 55) return '正常';
  if (v >= 30) return '孤单';
  if (v >= 15) return '边缘';
  return '自闭';
}
function studyLabel(v) {
  if (v >= 90) return '顶尖';
  if (v >= 80) return '优秀';
  if (v >= 60) return '良好';
  if (v >= 30) return '吃力';
  return '危险';
}

/* ---------------- 学期 / 轮次 ---------------- */
const SEM_NAMES = [
  '高一上学期', '高一下学期',
  '高二上学期', '高二下学期',
  '高三上学期', '高三下学期',
];
const SEM_STORY = [
  '你背着书包走进东莞中学校门。分班名单贴在校门口的公告栏上，你找了很久才找到自己的名字。\n\n教室在四楼最东边，四十张陌生的脸。\n东莞中学三年的第一页，就这么翻开了。',
  '高一下开学，走廊里的走班表已经换了位置。你抱着新课本在教室门口站了三秒，才确认自己没走错——选科之后，三年终于有了明确的方向。',
  '高二开学那天，黑板角已经有人用粉笔写下「距高考还有 730 天」。有人笑他卷，有人默默把这句话抄进了计划本。',
  '高二下，模考像雨点一样落下来。成绩表发下来时，你用手遮住，一个个看自己各科的成绩。',
  '高三的空气是粘稠的。教室后墙的倒计时每天撕一页，粉笔灰和焦虑一起在光束里打转。',
  '最后一学期。百日誓师的横幅挂上了教学楼，有人开始往大学寄明信片，有人只是更早地打开了五三。',
];

// 三种玩法都完整走完六个学期，轮次平均分摊到每个学期。
function monthsInSem() { return Math.ceil(CFG.rounds / SEM_NAMES.length); }
function totalRounds() { return CFG.rounds; }

const ACADEMIC_MONTHS = 30;
const ACADEMIC_MONTHS_PER_YEAR = 10;

/* ---------------- 真实校历 ----------------
   游戏从「高一上学期 9 月」一路走到「高三下学期 6 月高考」，共 30 个学术月份。
   学期与月份严格对齐真实校历：上学期 = 9/10/11/12/1 月，下学期 = 2/3/4/5/6 月。
   起始年份按真实世界推算（9 月及以后入学算当年，之前算上一年），
   所以 2026 年 9 月入学 → 2029 年 6 月 7—9 日高考。

   改这段之前的老实现是拿「总轮次」硬映射 20 个月份标签，跟学期完全脱钩：
   高一下学期第一轮会显示成「12月上旬」，往后越漂越远（高一的 1 月显示成 11 月、
   高一下的 2 月显示成 12 月……）。而节日（生日 / 情人节 / 圣诞 / 校际比赛日）
   和学校开放日都是从 phaseFor() 取月份的，所以全都跟着错。 */
const ACADEMIC_MONTH_SEQ = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6];

// 真实的学年起始年：9 月开学后算当年，1—8 月还属于上一学年。
function currentSchoolYearStart() {
  const now = new Date();
  const m = now.getMonth() + 1;
  return m >= 9 ? now.getFullYear() : now.getFullYear() - 1;
}
function startYear() {
  return (CFG && typeof CFG.startYear === 'number') ? CFG.startYear : currentSchoolYearStart();
}

// 广东实行 3+1+2 新高考，夏季高考固定在 6 月 7—9 日（广东省教育考试院每年通知）。
function gaokaoYear() { return startYear() + 3; }
function gaokaoDateLabel() { return `${gaokaoYear()} 年 6 月 7—9 日`; }

// 第 round 轮落在第几个学术月份（0 = 高一上 9 月，29 = 高三下 6 月）。
function academicMonthOf(round) {
  const total = Math.max(1, totalRounds());
  return clamp(Math.floor(((round - 1) / total) * ACADEMIC_MONTHS), 0, ACADEMIC_MONTHS - 1);
}

// 学术月份 → 真实年月。
function calendarOf(round) {
  const index = academicMonthOf(round);
  const yearIdx = Math.floor(index / ACADEMIC_MONTHS_PER_YEAR);
  const month = ACADEMIC_MONTH_SEQ[index % ACADEMIC_MONTHS_PER_YEAR];
  // 9—12 月属于学年起始年，1—6 月要跨到次年。
  const year = startYear() + yearIdx + (month >= 9 ? 0 : 1);
  return { index, year, month };
}

// 学年标签，如「2026—2027 学年」。
function schoolYearLabel(round) {
  const { year, month } = calendarOf(round);
  const a = month >= 9 ? year : year - 1;
  return `${a}—${a + 1} 学年`;
}

// 某个学期的真实起止月份，如「2026年9月 — 2027年1月」。
function semesterRangeLabel(semIdx) {
  const perSem = monthsInSem();
  const first = clamp(semIdx * perSem + 1, 1, totalRounds());
  const last = clamp((semIdx + 1) * perSem, 1, totalRounds());
  const a = calendarOf(first);
  const b = calendarOf(last);
  return `${a.year}年${a.month}月 — ${b.year}年${b.month}月`;
}

function roundsForMonths(months) {
  return Math.max(1, Math.round((totalRounds() / ACADEMIC_MONTHS) * months));
}
function roundsForAcademicYears(years) {
  return roundsForMonths(years * ACADEMIC_MONTHS_PER_YEAR);
}
function leaveDurationLabel(months) {
  if (!months) return '0 个月';
  if (months % 12 === 0) return `${months / 12} 年`;
  return `${months} 个月`;
}
function sleepLeaveChance(sleep, threshold, base, slope) {
  // 难度会整体放大休学风险：困难档睡眠掉到同样水平，被强制休学的概率更高。
  const raw = base + Math.max(0, threshold - sleep) * slope;
  return clamp(raw * DIFFICULTY.leaveChanceMul, base, 0.9);
}
function chancePercent(p) { return Math.round(p * 100); }

function signed(v) { return v > 0 ? `+${v}` : `${v}`; }

/* ---------------- 受伤系统 ----------------
运动 / 意外后有概率受伤，体力上限锁死在 90，
两个学期之后每次学期切换恢复 10 点，直到回到 100。 */
const INJURY_SOURCES = {
  sport: ['膝盖扭伤', '脚踝挫伤', '肌肉拉伤', '手腕扭伤'],
  fall: ['下楼梯扭到脚', '踩空台阶崴了脚', '被教室门槛绊了一下'],
  accident: ['打水时被热水烫到', '骑车摔了一跤', '体育课闪到腰'],
};

function tryInjure(kind, baseChance) {
  if (!S) return false;
  if (S.injury) return false;        // 已经受伤就不再叠加
  if (!chance(baseChance)) return false;

  const reason = pick(INJURY_SOURCES[kind] || INJURY_SOURCES.sport);
  const cap = 90;
  S.injury = { cap, reason, sinceSem: S.semIdx, recoverSem: S.semIdx + 2 };
  S.sleepCap = cap;
  // 立即削一刀体力，制造直观冲击
  S.sleep = Math.max(0, Math.min(S.sleep, cap) - rnd(5, 10));

  logEvent('bad', `🤕 ${reason}`,
    `这个月你${kind === 'fall' ? '在楼梯上' : '运动'}出了点意外——${reason}。\n\n校医给你上了药，叮嘱「这段时间别再剧烈运动」。从那之后，体力上限一直卡在 ${cap}，怎么睡都回不到满格。`,
    { sleep: -5 });
  journal(`· 🤕 受伤：${reason}（体力上限 → ${cap}）`);
  renderHud();
  return true;
}

// 每个学期结束时检查伤情
function tickInjury() {
  if (!S || !S.injury) return;
  const inj = S.injury;
  if (S.semIdx < inj.recoverSem) return;      // 恢复期还没到
  if (inj.cap >= 100) return;

  inj.cap = Math.min(100, inj.cap + 10);
  S.sleepCap = inj.cap;

  if (inj.cap >= 100) {
    logEvent('good', '💪 伤好了',
      `养了大半个学期，${inj.reason}总算恢复了。你试着跑了几步，没再疼。\n\n体力上限回到 100。`,
      { sleep: 5 });
    journal('· 💪 伤愈：体力上限恢复 100');
    S.injury = null;
  } else {
    logEvent('good', '🩹 恢复了一些',
      `这学期你克制了很多，${inj.reason}好了不少。\n\n体力上限回到 ${inj.cap}。`,
      null);
    journal(`· 🩹 伤情恢复：体力上限 → ${inj.cap}`);
  }
}

function mainEffects(act) {
  const level = DIFFICULTY.level;
  const streak = S ? (S[act + 'Streak'] || 0) : 0;
  const mul = Math.max(0.4, 1 - streak * 0.2);

  if (act === 'sleep') {
    return { sleep: Math.round((9 - level) * mul), social: -(2 + level), study: -(3 + level) };
  }
  if (act === 'social') {
    // 社交优先：睡眠 +1，学习 -2（联动）
    return { sleep: 1, social: Math.round((7 - level) * mul), study: -2 };
  }

    // 学习收益：基础 + 班级特长
  let studyBonus = 0;
  // 班级特长：镜堂班 + 物理、容庚班 + 历史 有学习增益
  if (CFG.className === '镜堂班' && S && S.track === '物理') studyBonus += 1;
  const studyGain = Math.max(1, Math.round((7 - level + studyBonus) * mul));
  return { sleep: -(5 + level), social: -(3 + level), study: studyGain };
}

/* ---------------- 头衔 ---------------- */
const TITLE_DEFS = [
  { id: '中游', cls: 'blue', when: (s) => s.lastRank >= 300 && s.lastRank <= 500 },
  { id: '体育健将', cls: 'teal', when: (s) => s.sleep >= 90 && s.social >= 60 },
  { id: '嘴唇发紫', cls: 'star', when: (s) => s.sleep <= 40 },
  { id: '卷王', cls: 'gold', when: (s) => s.study >= 95 },
  { id: '黑马', cls: 'teal', when: (s) => s.study >= 70 && s.startStudy <= 40 && s.study - s.startStudy >= 30 },
  { id: '学神', cls: 'gold', when: (s) => s.study >= 100 },
  { id: '稳扎稳打', cls: 'blue', when: (s) => s.exams.length >= 4 && s.exams.slice(-4).every((e, i, a) => i === 0 || e >= a[i - 1] - 5) },
  { id: '六边形战士', cls: 'teal', when: (s) => s.sleep >= 75 && s.social >= 75 && s.study >= 75 },
  { id: '恋爱脑', cls: 'star', when: (s) => s.love && s.love.active && s.study < 55 },
  { id: '小丑', cls: 'star', when: (s) => s.flags.rejected >= 1 && !s.love?.active },
  { id: '单身贵族', cls: 'blue', when: (s) => !s.love?.active && s.social >= 70 },
  { id: '教室钉子户', cls: 'gold', when: (s) => s.studyAct >= 20 },
];

// 拿到这些头衔时，顺带往全校动态播报一句
const TITLE_BROADCASTS = {
  '卷王': ['卷到学习 95+，教室里多了一盏长明灯', '📚'],
  '学神': ['学神诞生：学习属性直接拉满', '🧠'],
  '黑马': ['从垫底冲进中上游，黑马出现了', '🐎'],
  '嘴唇发紫': ['睡眠跌破 40，黑眼圈已经成精', '😴'],
  '体育健将': ['睡眠 90+ 且社交在线，作息之神', '🏃'],
  '恋爱脑': ['恋爱脑确诊：恋爱中，学习告急', '💗'],
  '小丑': ['表白失败，校园里多了一个失意者', '🤡'],
  '单身贵族': ['单身且社交 70+，一个人也过得很好', '🕶️'],
  '六边形战士': ['睡眠/社交/学习全部 75+，六边形战士出现', '⭐'],
  '教室钉子户': ['在教室钉了 20 个月，椅子都认人了', '🪑'],
};

function checkTitles() {
  if (!S) return;
  for (const t of TITLE_DEFS) {
    if (S.titles.includes(t.id)) continue;
    if (t.when(S)) {
      S.titles.push(t.id);
      logEvent('good', '🏆 获得头衔', `【${t.id}】被写进了你的三年档案。`, null);
      journal(`· 获得头衔「${t.id}」`);
      const bc = TITLE_BROADCASTS[t.id];
      if (bc) netBroadcast(bc[0], bc[1]);
    }
  }
  renderHud();
}

/* ---------------- 日志 / HUD ---------------- */
function journal(line) {
  const el = $('#journal');
  if (!el) return;
  const placeholder = el.querySelector('.placeholder-line');
  if (placeholder) placeholder.remove();
  const div = document.createElement('div');
  div.className = 'j-line';
  div.innerHTML = line;
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}

function logEvent(kind, title, body, fx, extraHtml, fxLabels) {
  const log = $('#log');
  const sem = SEM_NAMES[S ? S.semIdx : 0];
  const tag = kind === 'love' ? `💗 心动时刻 · ${sem}`
    : kind === 'exam' ? `📋 成绩结算 · ${sem}`
    : kind === 'bad' ? `⚠️ 校园事件 · ${sem}`
    : kind === 'daily' ? `🕒 日常 · ${sem}`
    : `🏫 校园事件 · ${sem}`;
  const clsMap = { love: 'love-card-event', exam: 'exam-card', bad: 'bad-card', good: 'good-card', daily: '', sys: '', event: '' };
  const div = document.createElement('div');
  div.className = 'event-card ' + (clsMap[kind] || '');
  let html = `<span class="event-tag">${tag}</span><div class="event-title">${title}</div><div class="event-body">${body}</div>`;
  if (fx) html += fxPills(fx, fxLabels);
  if (extraHtml) html += extraHtml;
  div.innerHTML = html;
  // 事件流采用“上新下旧”：最新事件插到顶部，旧事件依次留在下方；
  // action-area 始终留在最底部，玩家打开选项时不用再翻回去找按钮。
  // 新剧情追加到末尾，并滚动到底部看最新内容
  log.appendChild(div);
  // 慢速滚动到底部，速度由 SLOW_SCROLL_SPEED 控制
  return div;
}

function fxPills(fx, fxLabels) {
  if (!fx) return '';
  const label = (k, fallback) => (fxLabels && fxLabels[k]) || fallback;
  const parts = [];
  const push = (k, lab, cls) => {
    if (typeof fx[k] !== 'number' || fx[k] === 0) return;
    const v = fx[k];
    const pillCls = v === 0 ? 'neu' : (v < 0 && (k === 'sleep' || k === 'social' || k === 'study') && false) ? 'neg' : cls;
    const sign = v > 0 ? '+' : '';
    parts.push(`<span class="fx-pill ${v < 0 && k !== 'sleep' ? (cls === 'sleep' ? 'sleep' : cls) : pillCls}">${lab} ${sign}${v}</span>`);
  };
  // 按截图：正数用属性色，负数用品红
  const push2 = (k, fallback, cls) => {
    if (typeof fx[k] !== 'number') return;
    const lab = label(k, fallback);
    const v = fx[k];
    if (v === 0) parts.push(`<span class="fx-pill neu">${lab} ±0</span>`);
    else if (v > 0) parts.push(`<span class="fx-pill ${cls}">${lab} +${v}</span>`);
    else parts.push(`<span class="fx-pill neg">${lab} ${v}</span>`);
  };
  push2('sleep', '睡眠', 'sleep');
  push2('social', '社交', 'social');
  push2('study', '学习', 'study');
  push2('aff', '好感', 'love');
  return parts.length ? `<div class="fx-row">${parts.join('')}</div>` : '';
}

function renderHud() {
  if (!S) return;
  $('#t-title').textContent = `${SEM_NAMES[S.semIdx]} · ${dateLabel(S.round)}`;
  $('#t-round').textContent = `第 ${S.round} / ${totalRounds()} 次选择`;
  $('#t-sem').textContent = SEM_NAMES[S.semIdx];
  $('#t-class-chip').textContent = CFG.className;
  const residencyChip = $('#t-residency');
  if (residencyChip) residencyChip.textContent = CFG.residency;
  const campusChip = $('#t-campus');
  if (campusChip) campusChip.textContent = campusForSem(S.semIdx);
  const loveChip = $('#t-love');
  const L = S.love;
  if (L && L.met) {
    const st = affStage();
    const label = L.active ? '恋人' : st.short;
    loveChip.textContent = `💗 ${label}`;
    loveChip.title = `${L.name} · 好感 ${L.aff} / 100 · ${L.active ? '恋人' : st.tag}\nTA 现在叫你「${loveCall()}」`;
    loveChip.classList.add('love');
  } else {
    loveChip.textContent = '未遇见';
    loveChip.title = '开学后会在剧情里遇见';
    loveChip.classList.remove('love');
  }
  const affBar = $('#bar-aff');
  if (affBar) affBar.style.width = (L && L.met ? L.aff : 0) + '%';
  const affVal = $('#val-aff');
  if (affVal) affVal.textContent = L && L.met ? L.aff : '—';
  const affSt = $('#st-aff');
  if (affSt) affSt.textContent = L && L.met ? (L.active ? '恋人' : affStage().short) : '未遇见';

  $('#bar-sleep').style.width = S.sleep + '%';
  $('#val-sleep').textContent = S.sleep;
  const sleepStatus = $('#st-sleep');
  if (S.injury && S.injury.cap < 100) {
    sleepStatus.textContent = sleepLabel(S.sleep) + ' · 伤';
    sleepStatus.title = `${S.injury.reason} · 体力上限 ${S.injury.cap}`;
  } else {
    sleepStatus.textContent = sleepLabel(S.sleep);
    sleepStatus.title = sleepRiskHint(S.sleep);
  }
  sleepStatus.classList.toggle('sleep-warning', S.sleep < 80);
  $('#bar-social').style.width = S.social + '%';
  $('#val-social').textContent = S.social;
  $('#st-social').textContent = socialLabel(S.social);
  $('#bar-study').style.width = S.study + '%';
  $('#val-study').textContent = S.study;
  $('#st-study').textContent = studyLabel(S.study);

  const box = $('#t-titles');
  if (!S.titles.length) box.innerHTML = '<span class="muted">还没有拿到任何头衔</span>';
  else box.innerHTML = S.titles.map((t) => {
    const def = TITLE_DEFS.find((d) => d.id === t);
    return `<span class="title-pill ${def ? def.cls : ''}">${t === '小丑' ? '★ ' : ''}${t}</span>`;
  }).join('');
}

// 月份标签。保留「9月上旬」这个形状，因为节日（生日 / 情人节 / 圣诞 / 校际比赛日）
// 和学校开放日都靠它取月份（parseInt / startsWith），改形状会把它们全打断。
function phaseFor(round) {
  const { month } = calendarOf(round);
  // 一个月被摊成几轮：90 轮制 3 轮，60 轮制 2 轮，30 轮制 1 轮。
  const perMonth = Math.max(1, totalRounds() / ACADEMIC_MONTHS);
  if (perMonth < 2) return `${month}月`;
  const pos = ((round - 1) / perMonth) % 1;
  return `${month}月${pos < 0.5 ? '上旬' : '下旬'}`;
}

// 给玩家看的完整日期，如「2026年9月上旬」。
function dateLabel(round) {
  const { year } = calendarOf(round);
  return `${year}年${phaseFor(round)}`;
}

function applyFx(fx) {
  if (!fx || !S) return;
  const sleepCap = S.sleepCap || 100;
  if (typeof fx.sleep === 'number') S.sleep = clamp(S.sleep + fx.sleep, 0, sleepCap);
  if (typeof fx.social === 'number') S.social = clamp(S.social + fx.social);
  if (typeof fx.study === 'number') S.study = clamp(S.study + fx.study);
  if (typeof fx.aff === 'number') addAff(fx.aff);
  renderHud();
}

function sleepImpactForBand(band) {
  if (band === 'tired') return { study: -1, social: -1 };
  if (band === 'noticeable') return { study: -3, social: -2 };
  if (band === 'leave-risk') return { study: -5, social: -3 };
  if (band === 'severe') return { study: -8, social: -5 };
  return null;
}

function sleepImpactText(band) {
  if (band === 'tired') return {
    title: '😮‍💨 疲惫开始影响日常',
    body: '连续睡眠不足让你上课容易走神，放学后的安排也开始被打乱。这个阶段，学习和生活都出现了轻微损耗。',
  };
  if (band === 'noticeable') return {
    title: '⚠️ 明显疲惫',
    body: '你已经很难维持正常节奏：课堂效率下降，生活中的小事也变得拖沓。学习和社交都受到明显影响。',
  };
  if (band === 'leave-risk') return {
    title: '🛌 休学风险升高',
    body: '睡眠长期低于 60。你在课堂和日常生活中频繁失控，校医提醒：如果再撑下去，可能需要暂时离校休养。',
  };
  return {
    title: '🚨 身体发出强烈警报',
    body: '睡眠跌破 50，你已经无法靠意志力维持正常学习生活。学校开始评估强制休学的必要性。',
  };
}

// 每轮结算时施加持续影响；只在首次进入新睡眠档位时弹出事件卡，避免刷屏。
function applySleepConsequences() {
  const band = sleepBand(S.sleep);
  const fx = sleepImpactForBand(band);
  const changed = S.sleepBand !== band;
  if (fx) {
    applyFx(fx);
    if (changed) {
      const text = sleepImpactText(band);
      logEvent('bad', text.title, text.body, fx);
    } else {
      journal(`· ${sleepLabel(S.sleep)}持续影响：学习 ${fx.study} · 社交 ${fx.social}`);
    }
  }
  S.sleepBand = band;
  return band;
}

function startForcedLeave(months, triggerChance) {
  const beforeSleep = S.sleep;
  const recoveryTarget = months >= 12 ? 85 : 74;
  const recovery = Math.max(0, recoveryTarget - beforeSleep);
  const fx = {
    sleep: recovery,
    study: months >= 12 ? -15 : -4,
    social: months >= 12 ? -10 : -3,
  };
  // 游戏按高中三年 30 个学术月份推进，所以“休学一年”跳过 10 个学术月份。
  const rounds = months >= 12 ? roundsForAcademicYears(1) : roundsForMonths(months);
  S.leaveHistory = S.leaveHistory || [];
  S.leaveHistory.push({ months, rounds, sleep: beforeSleep, chance: triggerChance, round: S.round });
  S.totalLeaveMonths = (S.totalLeaveMonths || 0) + months;
  S.leaveCount = (S.leaveCount || 0) + 1;
  S.sleepBand = sleepBand(recoveryTarget);
  applyFx(fx);

  if (months >= 12) {
    logEvent('bad', '🏥 强制休学一年', `特殊情况触发：睡眠仅 ${beforeSleep}。医生和学校共同评估后，你需要暂时离校休养一年。\n\n本次触发概率约 ${chancePercent(triggerChance)}%。休学会压缩学习进度，也会让社交关系暂时变淡。`, fx);
    journal(`· 强制休学 1 年 · 跳过约 ${rounds} 轮`);
    netBroadcast(`睡眠只剩 ${beforeSleep}，被学校强制休学一年`, '🏥');
  } else {
    logEvent('bad', '🏥 强制休学一个月', `特殊情况触发：睡眠仅 ${beforeSleep}。你在课堂上突然失去意识，被送到校医室，学校安排你离校休养一个月。\n\n本次触发概率约 ${chancePercent(triggerChance)}%。`, fx);
    journal(`· 强制休学 1 个月 · 跳过约 ${rounds} 轮`);
    netBroadcast(`睡眠只剩 ${beforeSleep}，被强制休学一个月`, '🏥');
  }
  return rounds;
}

// 低于阈值不必每次必然休学，但睡眠越低，特殊情况越容易触发。
function maybeTriggerSleepLeave() {
  if (S.sleep >= 50) return 0;

  // 20 以下：强制休学，不再掷骰
  if (S.sleep <= 30) {
    S.lastLeaveChance = { months: 12, chance: 1, sleep: S.sleep };
    return startForcedLeave(12, 1);
  }

  if (S.sleep < 45) {
    const yearChance = sleepLeaveChance(S.sleep, 60, 0.06, 0.006);
    S.lastLeaveChance = { months: 12, chance: yearChance, sleep: S.sleep };
    if (chance(yearChance)) return startForcedLeave(12, yearChance);
    return 0;
  }
  const monthChance = sleepLeaveChance(S.sleep, 55, 0.04, 0.004);
  S.lastLeaveChance = { months: 1, chance: monthChance, sleep: S.sleep };
  if (chance(monthChance)) return startForcedLeave(1, monthChance);
  return 0;
}

function sleepRiskHint(sleep) {
  if (sleep <= 30) return '低于 20：本轮必然强制休学 1 年';
  if (sleep < 50) return `低于 50：本轮强制休学 1 年概率约 ${chancePercent(sleepLeaveChance(sleep, 50, 0.14, 0.012))}%`;
  if (sleep < 60) return `低于 60：本轮强制休学 1 个月概率约 ${chancePercent(sleepLeaveChance(sleep, 60, 0.08, 0.006))}%`;
  return '';
}

/* ---------------- 屏幕切换 ---------------- */
// 切屏后必须把滚动位置归零。
// 手机上主菜单很长（玩法说明一大段），玩家要滑到底部才点得到「开始高中」；
// 如果沿用上一个屏幕的 scrollY，设置页一进来就是滚到中间的，
// 名字输入框会被顶到视口上方（实测 y=-76），看起来就像「没有名字栏 / 输不了名字」。
function resetScroll() {
  // 只在真的滚动过之后才调 scrollTo：jsdom 这类环境没实现它，
  // 无条件调用会往控制台抛 "Not implemented: window.scrollTo"，污染回归测试。
  try {
    if (typeof window.scrollY === 'number' && window.scrollY !== 0 && window.scrollTo) window.scrollTo(0, 0);
  } catch (e) {}
  try { if (document.documentElement) document.documentElement.scrollTop = 0; } catch (e) {}
  try { if (document.body) document.body.scrollTop = 0; } catch (e) {}
}

function show(id) {
  $$('.screen').forEach((el) => el.classList.add('hidden'));
  const el = $(id);
  if (el) el.classList.remove('hidden');
  resetScroll();
}

/* ---------------- 主菜单 ---------------- */
$$('#mode-list .mode-card').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('#mode-list .mode-card').forEach((b) => b.classList.remove('selected'));
    btn.classList.add('selected');
    CFG.mode = btn.dataset.mode;
    CFG.rounds = +btn.dataset.rounds;
  });
});

/* ---------------- 名字输入 ----------------
   名字这一步不允许把人卡死，同时也不能在玩家打字打到一半时把他推走。
   ① 进入设置页自动把名字栏滚到眼前并聚焦（手机上键盘直接弹出来）；
   ② 输入法正在组词时，回车/完成键只用来确认候选词，绝不触发开局；
   ③ 🎲 一键随机取名 + 留空自动分配，不依赖键盘也能开始。 */
const RANDOM_NAMES = [
  '顾庸', '谢颐然', '苏念', '陈知蔚', '温度', '李咏微', '沈从清', '叶知秋',
  '许疏桐', '温疏雨', '白暮隐', '程既白', '江舒望', '唐相宜', '郑盈初', '吴舟晚',
];

function nameInputEl() { return $('#in-name'); }

function randomName() {
  const cur = nameInputEl() ? nameInputEl().value.trim() : '';
  let n = pick(RANDOM_NAMES);
  for (let i = 0; i < 8 && n === cur; i++) n = pick(RANDOM_NAMES);
  return n;
}

// 进入设置时把输入框恢复成完全可编辑，清掉可能残留的 disabled / readonly。
function unlockNameInput() {
  const el = nameInputEl();
  if (!el) return;
  el.disabled = false;
  el.readOnly = false;
  el.removeAttribute('disabled');
  el.removeAttribute('readonly');
  el.removeAttribute('aria-disabled');
}

function setNameHint(text) {
  const hint = $('#name-hint');
  if (hint) hint.textContent = text;
}

// 进设置页时把名字栏滚到视口中间并聚焦。
// 手机上一个 click 事件就是一次用户手势，所以这里的 focus() 能让键盘真的弹出来。
function focusNameField() {
  const el = nameInputEl();
  if (!el) return;
  resetScroll();
  try { el.scrollIntoView({ block: 'center' }); } catch (e) {}
  try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (e2) {} }
}

function fillRandomName() {
  const el = nameInputEl();
  if (!el) return;
  el.value = randomName();
  setNameHint(`已随机取名「${el.value}」，可以直接开始，也可以改成自己的名字。`);
  try { el.focus(); } catch (e) {}
}

$('#btn-to-setup').addEventListener('click', () => {
  show('#screen-setup');
  unlockNameInput();
  focusNameField();
});

// 🎲 随机名字：给打不出字的环境留一条不依赖键盘的出路。
if ($('#btn-random-name')) {
  $('#btn-random-name').addEventListener('click', (e) => {
    if (e && e.preventDefault) e.preventDefault();
    fillRandomName();
  });
}

// 点名字这一整块都能聚焦输入框（部分 WebView 里 input 自身的点击热区会偏）。
if ($('.field')) {
  $('.field').addEventListener('click', (e) => {
    const el = nameInputEl();
    const target = e && e.target;
    if (!el || !target || target === el) return;
    if (target.id === 'btn-random-name') return;
    try { el.focus(); } catch (err) {}
  });
}

// 打字时实时反馈，让玩家一眼看到「字确实进去了」。
const NAME_HINT_DEFAULT = '打不出字也没关系：点 🎲 随机取名，或直接点下面的按钮开始（会自动给你取一个）。';
if (nameInputEl()) {
  nameInputEl().addEventListener('input', () => {
    const v = nameInputEl().value.trim();
    setNameHint(v ? `好，就叫「${v}」。` : NAME_HINT_DEFAULT);
  });
}

/* 手机键盘上的「前往 / 完成」直接开局。
   关键：中文输入法用回车确认候选词，这类回车必须放行，
   否则玩家字还没打完就被推进学期开场——表现就是「名字根本打不进去」。
   isComposing / keyCode 229 是各浏览器通用的「正在组词」信号，
   再加一层 compositionstart/end 兜底（个别 WebView 不设 isComposing）。 */
let nameComposing = false;
if (nameInputEl()) {
  nameInputEl().addEventListener('compositionstart', () => { nameComposing = true; });
  nameInputEl().addEventListener('compositionend', () => { nameComposing = false; });
  nameInputEl().addEventListener('blur', () => { nameComposing = false; });
  nameInputEl().addEventListener('keydown', (e) => {
    if (!e) return;
    if (nameComposing || e.isComposing === true || e.keyCode === 229) return;
    const isEnter = e.key === 'Enter' || e.keyCode === 13;
    if (!isEnter) return;
    if (e.preventDefault) e.preventDefault();
    $('#btn-begin').click();
  });
}

$('#btn-history').addEventListener('click', showHistory);
$('#btn-step1-back').addEventListener('click', () => show('#screen-menu'));

/* 开局步骤绑定 */
function bindRow(sel) {
  $$(sel + ' button').forEach((b) => {
    b.addEventListener('click', () => {
      $$(sel + ' button').forEach((x) => x.classList.remove('selected'));
      b.classList.add('selected');
    });
  });
}
bindRow('#in-gender');
bindRow('#in-love');
bindRow('#in-residency');
bindRow('#in-class');
bindRow('#in-track');
bindRow('#in-diff');
bindRow('#in-love-mode');

// 难度说明：切换时同步提示文案，避免玩家不知道「困难」难在哪。
function refreshDifficultyNote() {
  const row = $('#in-diff');
  const noteEl = $('#diff-note');
  if (!noteEl) return;
  const key = row && row.querySelector('.selected') ? row.querySelector('.selected').dataset.v : CFG.difficulty;
  noteEl.textContent = difficultyNote(key);
  noteEl.classList.toggle('danger', key === 'hell');
}
if ($('#in-diff')) {
  $$('#in-diff button').forEach((b) => b.addEventListener('click', refreshDifficultyNote));
  refreshDifficultyNote();
}

function trackAptitudeNote(track) {
  const t = track || (S && S.track) || CFG.track || '物理';
  const parts = [];
  if (CFG.className === '镜堂班' && t === '物理') parts.push('✓ 镜堂班 + 物理：学习收益 +2');
  if (CFG.className === '容庚班' && t === '历史') parts.push('✓ 容庚班 + 历史：学习收益 +2');
  if (CFG.className === '普通班') parts.push('加油╭(･ㅂ･)و！！');
  return parts.length ? parts.join('　') : '当前组合没有额外加成或惩罚。';
}

// 首选科目（单选）
$$('#in-track button').forEach((b) => {
  b.addEventListener('click', () => {
    $$('#in-track button').forEach((x) => x.classList.remove('selected'));
    b.classList.add('selected');
    const noteEl = $('#track-aptitude-note');
    if (noteEl) noteEl.textContent = trackAptitudeNote(b.dataset.v);
  });
});

// 再选科目（选 2，最多 2）
function updateExtraHint() {
  const selected = $$('#in-track-extra .selected');
  const hint = $('#track-extra-hint');
  if (hint) hint.textContent = `已选 ${selected.length} / 2 科${selected.length === 2 ? ' ✓' : '（请再选 ' + (2 - selected.length) + ' 科）'}`;
}
$$('#in-track-extra button').forEach((b) => {
  b.addEventListener('click', () => {
    if (b.classList.contains('selected')) {
      b.classList.remove('selected');
    } else {
      const selected = $$('#in-track-extra .selected');
      if (selected.length >= 2) return;
      b.classList.add('selected');
    }
    updateExtraHint();
  });
});
updateExtraHint();

// 开局现在是一页式表单：保留原来的所有字段，减少来回翻页，让手机端更接近参考图。
$('#btn-begin').addEventListener('click', () => {
  const nameEl = nameInputEl();
  let name = nameEl ? nameEl.value.trim() : '';
  // 打不出字的环境不能把人卡在第一步：留空就自动取一个名字继续。
  // （不再用 alert 拦截，弹窗在部分内嵌面板里会被忽略或直接抛异常。）
  if (!name) {
    name = randomName();
    if (nameEl) nameEl.value = name;
    setNameHint(`没填名字，已自动取「${name}」，进游戏后 HUD 上就能看到。`);
  }
  CFG.name = name;
  CFG.gender = $('#in-gender .selected').dataset.v;
  CFG.talent = $('#in-love .selected').dataset.v;
  CFG.residency = $('#in-residency .selected').dataset.v;
  CFG.className = normalizeClassName($('#in-class .selected').dataset.v);
  const diffRow = $('#in-diff .selected');
  CFG.difficulty = diffRow ? diffRow.dataset.v : CFG.difficulty || 'hard';
  setDifficulty(CFG.difficulty);
  const loveModeRow = $('#in-love-mode .selected');
  CFG.loveMode = loveModeRow ? loveModeRow.dataset.v : 'none';
  startSemester();
});

/* ---------------- 高一下选科 ---------------- */
function showTrackChoice() {
  const selectedTrack = S.track || CFG.track || '物理';
  $$('#in-track button').forEach((b) => b.classList.toggle('selected', b.dataset.v === selectedTrack));
  $('#track-story').textContent = '高一上学期最后一门考试结束，班主任把 3+1+2 选科表发了下来。「想清楚再填，交上去就不能改了。」';
  const noteEl = $('#track-aptitude-note');
  if (noteEl) noteEl.textContent = trackAptitudeNote(selectedTrack);
  show('#screen-track');
}

$('#btn-track-confirm').addEventListener('click', () => {
  if (!S || S.ended || S.semIdx !== 1) return;
  CFG.track = $('#in-track .selected').dataset.v;
  const extraSelected = Array.from($$('#in-track-extra .selected')).map((b) => b.dataset.v);
  if (extraSelected.length !== 2) {
    alert('再选科目需要选 2 科');
    return;
  }
  S.trackExtra = extraSelected;
  S.track = CFG.track;
  if (!S.trackApplied) {
    if (S.track === '物理') applyFx({ study: 3 });
    S.trackApplied = true;
  }
  // 转班判定：普通班 + 成绩好，有机会转入重点班
  // 放在这里，无论是否休学都会执行
  if (CFG.className === '普通班' && !S.flags.promotionChecked) {
    S.flags.promotionChecked = true;
    const chanceVal = clamp((S.study - 45) / 40, 0, 0.9);
    if (Math.random() < chanceVal) {
      S.flags.pendingPromotion = (S.track === '物理') ? '镜堂班' : '容庚班';
    }
  }
  // 如果休学跳过了选科节点之后的轮次，选科完成后继续扣除剩余休学时间。
  const pendingLeaveRounds = S.pendingLeaveRounds || 0;
  S.pendingLeaveRounds = 0;
  if (pendingLeaveRounds > 0) {
    const previousSem = S.semIdx;
    const calendarReady = advanceAcademicRounds(pendingLeaveRounds);
    if (!calendarReady) {
      saveLocal();
      showTrackChoice();
      return;
    }
    saveLocal();
    if (S.round > totalRounds()) {
      doEnding();
      return;
    }
    if (S.semIdx !== previousSem) startSemester();
    else {
      renderHud();
      showMainChoices();
    }
    return;
  }
  saveLocal();
  startSemester();
});

/* ---------------- 学期开场 ---------------- */
function startSemester() {
  if (!S) newGame();
  $('#sem-title').textContent = SEM_NAMES[S.semIdx];
  $('#sem-sub').textContent = `${schoolYearLabel(S.round)} · 第 ${S.semIdx + 1} / 6 学期 · ${CFG.rounds} 轮制 · ${CFG.mode === 'immersive' ? '沉浸' : CFG.mode === 'standard' ? '标准' : '速通'} · 难度 ${DIFFICULTY.label}`;
  $('#sem-story').textContent = `${SEM_STORY[S.semIdx] || SEM_STORY[0]}\n\n📅 本学期：${semesterRangeLabel(S.semIdx)}\n\n${residencySummaryForSem(S.semIdx)}`;
  $('#sem-status').textContent = `${sleepLabel(S.sleep)} · ${socialLabel(S.social)} · ${studyLabel(S.study)}`;
  $('#sem-schedule').textContent = residencySummaryForSem(S.semIdx);
  $('#sem-titles').textContent = `${S.titles.length} 个`;
  show('#screen-semester');
}

$('#btn-sem-start').addEventListener('click', () => {
  const log = $('#log');
  if (log) log.innerHTML = '';
  show('#screen-game');
  renderHud();
  if (!S.logBooted) {
    const trackText = CFG.track ? `选了${CFG.track}方向` : '文理分科将在高一下学期进行';
    const residencyText = isBoarder()
      ? `你是住宿生：${dormLabelForSem(S.semIdx)}，宿舍没有插座，教室和宿舍吹风筒处可以充电。`
      : '你是走读生：每天回家，不吃饭堂，早餐和外卖可以从校外带进来。';
    logEvent('sys', '欢迎来到东莞中学', `你叫${S.name}，分在${CFG.className}，${trackText}。\n${residencyText}\n\n东莞中学三年，${totalRounds()} 次选择。睡眠、社交、学习——没有完美答案，只有取舍。`, null);
    S.logBooted = true;
    journal('→ 在莞中的三年开始了');
    netBroadcast('开启在东莞中学的三年旅程', '🎒');
  }
  // 开学前先走军训
  if (!S.flags.militaryDone) {
    const military = buildMilitaryEvent();
    if (military) {
      QUEUE = [military];
      processQueue();
      return;
    }
  }
  showMainChoices();
  // 新学期开场：滚到最底部，让玩家从新学期第一条开始读
  requestAnimationFrame(() => {
    const log = $('#log');
    if (log) log.scrollTop = log.scrollHeight;
  });
});

/* ---------------- 新游戏 ---------------- */
function newGame() {
  // 开局时把「入学学年」按真实日期定死，整局不再变（否则跨年读档日期会漂）。
  if (typeof CFG.startYear !== 'number') CFG.startYear = currentSchoolYearStart();
  S = {
    name: CFG.name,
    gender: CFG.gender,
    className: CFG.className,
    residency: CFG.residency,
    track: null,
    trackApplied: false,
    mode: CFG.mode,
    rounds: CFG.rounds,
    difficulty: DIFFICULTY.key,
    round: 1,
    semIdx: 0,
    roundInSem: 0,
    // 日常选项：七个时间点循环推进的游标（早读→课间→午饭→放学→晚修→晚修后→周末）。
    dailyIdx: 0,
    // 手机机制：当前学年是否带手机（每学年开始时询问一次）
    phone: true,
    // 受伤系统：体力上限锁死在 cap，过一段时间慢慢恢复
    injury: null,
    sleepCap: 100,
    // 连续专注同一件事的计数（用于疲劳递减）
    sleepStreak: 0,
    socialStreak: 0,
    studyStreak: 0,
    sleep: 100,
    sleepBand: 'healthy',
    social: 50,
    study: 50,
    startStudy: 50,
    titles: [],
    love: null,
    // 恋爱剧情配额：见 loveQuota()，用于把恋爱剧情压在全部剧情节点的 1/3。
    loveQuota: { tokens: 0, campus: 0, love: 0 },
    leaveHistory: [],
    totalLeaveMonths: 0,
    leaveCount: 0,
    pendingLeaveRounds: 0,
    examRecords: [],
    gaokao: null,
    flags: {
      rejected: 0,
      breakups: 0,
      neverTest: true,
      activeAttempts: 0,
      activeSuccesses: 0,
      activeFailures: 0,
      dormBriefed: false,
      examHallBriefed: false,
      examHallLowBriefed: false,
      examHallHighBriefed: false,
      mosquitoSeen: false,
      mixOutSeen: false,
      sprintSeen: false,
      mockExamSeen: false,
      volunteerSeen: false,
      openDayDecSeen: false,
      openDayMarSeen: false,
      openDayMaySeen: false,
      foodEventCount: 0,
      valentineSems: [],
      christmasSems: [],
      bdaySems: [],
      loveMilestones: {},
      confessions: 0,
      // 日常选项：校史秘闻线索累计解锁的成就，以及住宿生的「外出假」。
      dailyMilestones: {},
      schoolLore: 0,
      dayPass: false,
      phoneChoiceSem: -1,
      promotionChecked: false,
      pendingPromotion: null,
      artShowsSeen: [],
      militaryDone: false,
      artFestivalSeen: [],
    },
    foods: [],
    exams: [],
    ranks: [],
    firstRank: null,
    lastRank: null,
    sleepAct: 0,
    socialAct: 0,
    studyAct: 0,
    ended: false,
    logBooted: false,
    history: [],
  };

  // 开局天赋：只加起步属性
  const tfx = talentFx(CFG.talent);
  if (tfx.study) S.study = clamp(S.study + tfx.study);
  if (tfx.social) S.social = clamp(S.social + tfx.social);
  if (tfx.sleep) S.sleep = clamp(S.sleep + tfx.sleep);

  if (CFG.className === '容庚班') S.study = clamp(S.study + 8);
  // 普通班：学习收益降低，但社交和睡眠更多（师资倾斜）
  if (CFG.className === '普通班') {
    S.study = clamp(S.study - 1);
    S.social = clamp(S.social + 3);
    S.sleep = clamp(S.sleep + 3);
  }

  // 恋爱线：开局只是「还没遇见」，对象在开学后由剧情确定。
  S.love = newLoveState();

  saveLocal();
}

/* ---------------- 主选择（三属性月度） ---------------- */
/* ================================================================
   填充轮 · 日常片段
   在主选择之间插入的"没有大选择"的日子。纯叙事，附带少量数值加成。
   ================================================================ */

/* 班会课内容池：每次随机抽一条，一局内不重复 */
const BANHUI_TOPICS = [
  '班主任在班会课上说了三条通知：下周三体检、下下周月考、下个月黑板报评比。说完最后一句，教室里发出一阵小小的哀嚎。',
  '这周的班会课，班主任让大家写「想对一年后的自己说的一句话」。写完之后，纸条被折起来放进一个纸盒，封好放在讲台下面的抽屉里。',
  '班会课被临时改成了安全讲座。年级主任站上讲台讲了半小时防火防盗防诈骗，最后放了一段交通事故监控视频，班里安静了好一会儿。',
  '班会课上，班主任让大家把这周的学习计划写在便利贴上，贴到教室后墙。整面墙很快就花花绿绿，像一张拼起来的愿望清单。',
  '这周班会，班主任请来了一位刚毕业的学长分享经验。学长说了一句话：「高一别偷懒，高二别放松，高三别崩溃。」说完自己先笑了。',
  '班会课上，班主任重新排了座位。你从靠窗的位置换到了中间，前后左右都是不太熟的人。第一节课上完，你还没分清谁叫什么名字。',
  '这周班会，班主任公布了班级口号征集的结果。「不负韶华，一战成名」得票最高，但最后定下来的是一句很朴素的「踏实走好每一步」。',
  '班会课最后十分钟，班主任让大家互相写小纸条，写「这周 TA 最让你感动的一件事」。你收到两张，一张写着「谢谢你借我橡皮」，一张没署名。',
  '这周班会，班主任说了很多，最后一句是：「你们不用都成为第一名，但希望三年后你们都能对自己说一句『我尽力了』。」教室里没人说话，但有人低头写了点什么。',
  '班会课上，班主任让每个人起来说一句「这周最开心的事」。轮到最后一排，有人说「食堂加了新菜」，全班都笑了。',
  '班主任在班会上强调，下周开始严查晚修纪律。说完之后，班里几个人互相看了一眼，谁都没说话。',
  '这周的班会课，来了几个高一新生参观。班主任让班长上台讲班级情况。班长平时话很多，站上台之后却卡壳了三次。',
  '班会课上，班主任发了张表，让大家填「理想大学」和「理想专业」。你盯着空格看了很久，最后写了一个自己也没想好的答案。',
  '班主任说这周班会的主题是「情绪管理」。讲完之后，让每个人写下最近最烦的一件事，揉成团，扔进垃圾桶。你写完之后，确实轻松了一点。',
  '这周班会，班主任没讲任何通知。他只是让大家把桌子摆成一个圈，聊了一节课最近有什么想说的。下课铃响的时候，有人还在讲。',
];

const FILLER_SCENES = [
  {
    title: '📖 平常的两周',
    tag: '平常的日子',
    body: '早读、上课、午休、晚修。两个星期下来，没什么值得记的事。\n\n但如果你回头看一眼自己的课本，页角已经比上个月厚了一点。',
  },
  {
    title: '🌧️ 连着下了几场雨',
    tag: '下雨',
    body: '梅雨季来得比往年早。阳台上挂满了湿漉漉的校服，教室里有一种潮湿的粉笔灰味。\n\n没有人愿意去操场，下课都趴在桌上。',
  },
  {
    title: '🍂 换季了',
    tag: '换季',
    body: '一夜之间就凉了。早上出门没加外套，中午回来的时候鼻子是红的。\n\n新教学楼下的梧桐叶落了一地，扫了又落，落了又扫。',
  },
  {
    title: '📺 班会课',
    tag: '班会课',
    body: () => {
      if (!S.flags.banhuiSeen || !Array.isArray(S.flags.banhuiSeen)) S.flags.banhuiSeen = [];
      let pool = BANHUI_TOPICS.filter((t) => !S.flags.banhuiSeen.includes(t));
      if (!pool.length) { S.flags.banhuiSeen = []; pool = BANHUI_TOPICS; }
      const topic = pick(pool);
      S.flags.banhuiSeen.push(topic);
      return topic;
    },
  },
  {
    title: '🧹 轮到你们值周',
    tag: '值周',
    body: '这一周轮到你检查卫生。你被分到检查高一（3）班的走廊，每天早上巡十分钟，看他们班的扫把有没有摆整齐。\n\n 巡了三天，你居然真的开始在意那把扫把了。',
  },
  {
    title: '🎂 班里有人过生日',
    tag: '生日',
    body: '晚修前十分钟，有人拎了一个蛋糕进教室。全班一起唱生日歌，隔壁班过来敲门问「你们在干嘛」。\n\n蛋糕不好吃，但所有人都笑了。',
  },
  {
    title: '📚 期中考前一周',
    tag: '考前一周',
    body: '教室里的气氛和上周完全不一样了。课间没人打闹，办公室门口排起了长队。\n\n你也把五三翻到了之前从来没打开的那一页。',
  },
  {
    title: '☀️ 天气很好',
    tag: '好天气',
    body: '连着几天都是晴的，气温不冷不热，风里有一种刚洗过衣服的味道。\n\n不知道为什么，这几天做什么都挺顺的。',
  },
  {
    title: '🎧 耳朵里塞了耳机',
    tag: '耳机',
    body: '你最近迷上了一首歌，晚修前会坐在座位上听两遍。歌词没什么特别的，但旋律让人安静。\n\n有一天下课，你发现 TA 也在听同一首歌。你们都没说话。',
  },
  {
    title: '📝 半月记',
    tag: '半月记',
    body: '你在日记本上写了半页。没有大事，就是一些零碎的记录——今天食堂新出了一个菜，昨天数学课打瞌睡被老师点名，前天晚上十一点宿舍里有人在讲笑话。\n\n写完合上本子，觉得这半个月没白过。',
  },
  {
    title: '🧊 食堂的冰柜修好了',
    tag: '食堂小事',
    body: '食堂的冰柜坏了快一个月，今天终于修好了，可以吃雪糕了。中午去的时候，冰箱的位置挤了十几个人。\n\n你也排了。轮到的时候，最后一瓶刚被前面的人拿走。',
  },
  {
    title: '🌙 月亮很圆',
    tag: '月亮',
    body: '晚修结束回宿舍的路上，有人喊了一声「快看月亮」。\n\n你抬头，看见又圆又亮的一轮挂在宿舍楼上方。操场上零零散散站着几个也在抬头的人。',
  },
];
const MONTHLY_SPECIALS = [
  {
    key: 'sport', emoji: '🏃', label: '运动优先',
    body: '这个月你天天泡在操场和体育馆。',
    fx: { sleep: 4, social: 3, study: -4 },
  },
  {
    key: 'club', emoji: '🎭', label: '社团优先',
    body: '社团活动占据了你大半个月的课余时间。',
    fx: { social: 5, sleep: -2, study: -3 },
  },
  {
    key: 'sprint', emoji: '🔥', label: '冲刺突击',
    body: '你把自己关在教室里，除了做题什么都不管。',
    fx: { study: 9, sleep: -9, social: -5 },
  },
  {
    key: 'recover', emoji: '🛌', label: '深度休息',
    body: '这个月你什么都没干，就是睡觉、发呆、养身体。',
    fx: { sleep: 12, social: -3, study: -7 },
  },
  {
    key: 'game', emoji: '🎮', label: '游戏放松',
    body: '这个月你沉迷游戏，晚修后都在偷偷打。',
    fx: { social: 4, sleep: -4, study: -5 },
  },
  {
    key: 'family', emoji: '🏠', label: '回家陪伴',
    body: '这个月你常回家，和家人的关系更近了。',
    fx: { sleep: 3, social: 2, study: -3 },
  },
  {
    key: 'reading', emoji: '📖', label: '课外阅读',
    body: '你读了几本杂书，视野开阔了一点。',
    fx: { study: 2, social: 2, sleep: -4 },
  },
  {
    key: 'volunteer', emoji: '🤝', label: '志愿服务',
    body: '你报名了学校的志愿服务队。',
    fx: { social: 4, sleep: -3, study: -2 },
  },
];
/* ================================================================
   选项闸门：让玩家先读剧情，再选选项。
   每次渲染选项区的时候调用 gateChoices(area)，选项默认隐藏，
   玩家点击提示条后才展开。避免"还没看完剧情就下意识点选"。
   ================================================================ */
function gateChoices(area) {
  if (!area) return;
  const choices = area.querySelector('.choices');
  if (!choices) return;

  // 已经加过闸门就不再重复
  if (area.querySelector('.choices-unlock')) return;

  choices.classList.add('gated');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'choices-unlock';
  btn.innerHTML = '<span class="cu-icon">📖</span><span class="cu-text">看完剧情后<b>点这里做选择</b></span>';
  btn.onclick = () => {
    if (btn.dataset.clicked === '1') return;
    btn.dataset.clicked = '1';
    btn.disabled = true;
    choices.classList.remove('gated');
    btn.remove();
    // 展开后柔和地把视线拉回选项区
    requestAnimationFrame(() => {
      try { choices.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {}
    });
  };
  choices.parentNode.insertBefore(btn, choices);
}

function showMainChoices() {
  awaitingChoice = true;
  const log = $('#log');
  const hint = `${SEM_NAMES[S.semIdx]} · ${dateLabel(S.round)}　｜　这个月的重心？`;
  const effects = {
    sleep: mainEffects('sleep'),
    social: mainEffects('social'),
    study: mainEffects('study'),
  };

  const special = pick(MONTHLY_SPECIALS);
  const streakHint = (act) => {
    const s = S[act + 'Streak'] || 0;
    return s >= 2 ? `<span style="color:#b04a3c;font-size:10px">连续${s + 1}次·收益递减</span>` : '';
  };

  const choicesDiv = document.createElement('div');
  choicesDiv.className = 'choice-module current-choice-module inline-choice-module';
  choicesDiv.innerHTML = `
    <div class="module-kicker">月度安排 · 第 ${Math.ceil(S.round / 2)} 次 · ${DIFFICULTY.label}</div>
    <div class="module-context">${hint}　把时间交给哪一件事？</div>
    <div class="choices">
      <button class="choice-btn" data-act="sleep">
        <div class="c-top"><span class="choice-key a">😴</span><span class="choice-label">睡眠优先</span>${streakHint('sleep')}</div>
        <div class="fx-row"><span class="fx-pill sleep">睡眠 ${signed(effects.sleep.sleep)}</span><span class="fx-pill social">社交 ${signed(effects.sleep.social)}</span><span class="fx-pill study">学习 ${signed(effects.sleep.study)}</span></div>
      </button>
      <button class="choice-btn" data-act="social">
        <div class="c-top"><span class="choice-key b">🎉</span><span class="choice-label">社交优先</span>${streakHint('social')}</div>
        <div class="fx-row"><span class="fx-pill social">社交 ${signed(effects.social.social)}</span><span class="fx-pill sleep">睡眠 ${signed(effects.social.sleep)}</span><span class="fx-pill study">学习 ${signed(effects.social.study)}</span></div>
      </button>
      <button class="choice-btn" data-act="study">
        <div class="c-top"><span class="choice-key c">📚</span><span class="choice-label">学习优先</span>${streakHint('study')}</div>
        <div class="fx-row"><span class="fx-pill study">学习 ${signed(effects.study.study)}</span><span class="fx-pill sleep">睡眠 ${signed(effects.study.sleep)}</span><span class="fx-pill social">社交 ${signed(effects.study.social)}</span></div>
      </button>
      <button class="choice-btn" data-act="special">
        <div class="c-top"><span class="choice-key d">${special.emoji}</span><span class="choice-label">${special.label}</span></div>
        <div class="fx-row">
          ${typeof special.fx.sleep === 'number' ? `<span class="fx-pill ${special.fx.sleep >= 0 ? 'sleep' : 'neg'}">睡眠 ${signed(special.fx.sleep)}</span>` : ''}
          ${typeof special.fx.social === 'number' ? `<span class="fx-pill ${special.fx.social >= 0 ? 'social' : 'neg'}">社交 ${signed(special.fx.social)}</span>` : ''}
          ${typeof special.fx.study === 'number' ? `<span class="fx-pill ${special.fx.study >= 0 ? 'study' : 'neg'}">学习 ${signed(special.fx.study)}</span>` : ''}
        </div>
      </button>
    </div>`;
  log.appendChild(choicesDiv);

  choicesDiv.querySelectorAll('.choice-btn').forEach((b) => {
    b.onclick = () => {
      if (b.dataset.clicked === '1') return;
      choicesDiv.querySelectorAll('.choice-btn').forEach((x) => {
        x.dataset.clicked = '1';
        x.disabled = true;
        x.style.pointerEvents = 'none';
      });
      choicesDiv.innerHTML = `<div class="module-kicker">月度安排</div><div class="choice-made">✅ 你的选择：${b.querySelector('.choice-label').textContent}</div>`;
      choicesDiv.classList.add('choice-made-module');

      const act = b.dataset.act;
      if (act === 'special') {
        awaitingChoice = false;
        applyFx(special.fx);
        logEvent('event', `${special.emoji} ${special.label}`, special.body, special.fx);
        journal(`· ${special.label}`);
        ['sleep', 'social', 'study'].forEach(k => S[k + 'Streak'] = 0);
        buildEventQueue();
        processQueue();
      } else {
        chooseMain(act);
      }
    };
  });
}

function chooseMain(act) {
  if (!S || S.ended) return;
  awaitingChoice = false;
  S[act + 'Act'] = (S[act + 'Act'] || 0) + 1;
  // 更新连续专注计数：选中的 +1，其他两个归零
  ['sleep', 'social', 'study'].forEach(k => {
    if (k === act) S[k + 'Streak'] = (S[k + 'Streak'] || 0) + 1;
    else S[k + 'Streak'] = 0;
  });
  let fx, title, body;

  if (act === 'sleep') {
    fx = mainEffects('sleep');
    title = '😴 睡眠月';
    body = pick([
      '这个月你把作息掰正了：熄灯就睡，周末补觉。醒来时眼神都是亮的——只是卷子上的红叉也多了几道。',
      '早睡早起坚持了一个月。黑眼圈淡了，题感却有点生。',
    ]);
  } else if (act === 'social') {
    fx = mainEffects('social');
    title = '🎉 社交月';
    body = pick([
      '课间吹水、放学打球、周末组局。找你玩的同学变多了——快乐是真的，落下的题也是真的。',
      '你成了班里的气氛组担当。人缘涨了，晚修刷题时间被切得稀碎。',
    ]);
  } else {
    fx = mainEffects('study');
    title = '📚 学习月';
    body = pick([
      '你和五三锁死了一个月。错题本厚了一截，镜片度数可能也厚了一截。',
      '教室的灯陪你到最后一个走。成绩在涨，发际线在思考人生。',
    ]);
  }

  // 社交月会自然推进好感；其他月份不加也不减，但会累积「冷落」
  if (S.love && S.love.met) {
    if (act === 'social') fx.aff = 3;
    else S.love.cold = (S.love.cold || 0) + 1;
  }

  applyFx(fx);
  logEvent(act === 'sleep' ? 'good' : act === 'social' ? 'event' : 'exam', title, body, fx);
  journal(`· ${title}`);
  journal(`${act === 'sleep' ? '睡眠' : act === 'social' ? '社交' : '学习'} ${fx[act === 'sleep' ? 'sleep' : act === 'social' ? 'social' : 'study'] > 0 ? '+' : ''}${fx[act === 'sleep' ? 'sleep' : act === 'social' ? 'social' : 'study']}`);

  // 危机
  if (S.sleep <= 10) {
    logEvent('bad', '😵 身体罢工', '你在早读课直接趴桌起不来，被扶去校医室。医生只说了三个字：去睡觉。', { sleep: 15, study: -4 });
    S.sleep = clamp(S.sleep + 15);
    S.study = clamp(S.study - 4);
  }
  if (S.social <= 8) {
    logEvent('bad', '🌑 孤独感袭来', '食堂、操场、宿舍——你发现自己一个人走了很久。有人递来一瓶水：「一起吃？」你突然有点想哭。', { social: 12, sleep: -2 });
    S.social = clamp(S.social + 12);
    S.sleep = clamp(S.sleep - 2);
  }
  if (S.study <= 8) {
    logEvent('bad', '📉 成绩亮红灯', '随堂测验的分数贴出来，你的名字在倒数那栏晃了晃。同桌欲言又止，最后只说了句「下次加油」。', { study: 10, social: -2 });
    S.study = clamp(S.study + 10);
    S.social = clamp(S.social - 2);
  }

  buildEventQueue();
  processQueue();
}

/* ---------------- 恋爱剧情配额 ----------------
   目标：恋爱剧情只占全部剧情节点的 1/3。
   做法是一个令牌桶：每轮校园事件让配额 +1 点，一次恋爱事件消耗 2 点。
   于是长期「恋爱 : 校园」稳定在 1 : 2，恋爱占比收敛到 1/3。
   · 遇见 / 节日 / 主线这些必推节点不受抽签限制（有门槛、总量很少），
     但照样消耗配额，所以「主线推得猛」的那几轮日常恋爱内容会自动让位。
   · 配额攒到上限时不再抽签，直接消耗，避免恋爱线长时间缺席。
-------------------------------------------------------- */
const LOVE_QUOTA_COST = 2;
const LOVE_QUOTA_CAP = 4;
const LOVE_DAILY_CHANCE = 0.75;

function loveQuota() {
  if (!S) return null;
  if (!S.loveQuota || typeof S.loveQuota !== 'object') {
    S.loveQuota = { tokens: 0, campus: 0, love: 0 };
  }
  const q = S.loveQuota;
  if (typeof q.tokens !== 'number') q.tokens = 0;
  if (typeof q.campus !== 'number') q.campus = 0;
  if (typeof q.love !== 'number') q.love = 0;
  return q;
}
function loveQuotaTick() {
  const q = loveQuota();
  if (!q) return;
  q.tokens = Math.min(LOVE_QUOTA_CAP, q.tokens + 1);
  q.campus += 1;
}
function loveQuotaSpend() {
  const q = loveQuota();
  if (!q) return;
  q.tokens -= LOVE_QUOTA_COST;
  q.love += 1;
}
function loveQuotaReady() {
  const q = loveQuota();
  if (!q || q.tokens < LOVE_QUOTA_COST) return false;
  // 配额攒满必须用掉，否则长期占比会掉到 1/3 以下。
  if (q.tokens >= LOVE_QUOTA_CAP) return true;
  // 根据感情倾向调整日常恋爱内容出现的概率
  let chanceVal = LOVE_DAILY_CHANCE;
  // 纯爱：拉满，几乎每次都出；顺其自然：一半；专注学业：不出日常恋爱
  if (CFG.loveMode === 'full') chanceVal = Math.min(1, chanceVal * 1.35);
  if (CFG.loveMode === 'half') chanceVal *= 0.5;
  if (CFG.loveMode === 'none') return false;
  return chance(chanceVal);
}
// 恋爱占比是否已经超过 1/3（即 恋爱 > 校园 / 2）。
// 必推的遇见 / 节日 / 主线不受配额限制，短局里容易扎堆，
// 这时本轮补一个校园事件把占比稀释回来。
function loveQuotaOver() {
  const q = loveQuota();
  if (!q) return false;
  return q.love * 2 > q.campus;
}
// 恋爱剧情实际占比，用于结算展示与回归测试。
function loveRatio() {
  const q = loveQuota();
  if (!q) return 0;
  const total = q.campus + q.love;
  return total ? q.love / total : 0;
}

/* ---------------- 事件队列 ---------------- */
/* ---------------- 军训 · 开学前 ---------------- */
function buildMilitaryEvent() {
  if (!S || S.flags.militaryDone) return null;
  return {
    t: 'choice',
    kicker: '☀️ 开学前 · 军训',
    hint: '八月的操场，太阳很毒。',
    moduleClass: 'event-choice-module',
    intro: {
      kind: 'event',
      title: '☀️ 军训',
      body: '八月下旬，你提前回到了学校。\n\n操场上站满了还没混熟的陌生面孔，校服在太阳底下亮得刺眼。教官站在队伍前面，背挺得笔直。\n\n「立正！」\n\n第一天上午站军姿，站到一半，你的腿已经开始发抖了。',
    },
    options: [
      {
        label: '认真训练，站好每一个军姿',
        fx: { sleep: -5, study: 1, social: 1 },
        kind: 'good',
        title: '☀️ 认真军训',
        text: '你站得笔直，汗从额头流到脖子，帽檐也被汗水浸透。教官在你身边停了两秒，点了点头。\n\n七天后，你黑了两个色号，但第一次感觉到自己的腰杆挺直了一点。',
        journal: '· 军训：认真训练',
        onPick: () => { S.flags.militaryDone = true; },
      },
      {
        label: '装肚子疼，请一天假',
        fx: { sleep: 2, social: -2, study: -1 },
        kind: 'bad',
        title: '☀️ 请了一天假',
        text: '你捂着肚子去找教官请假。教官盯了你三秒：「去吧。」\n\n你回宿舍睡了一下午。醒来的时候，宿舍里只有你一个人。那天傍晚集合，没人问你去了哪。',
        journal: '· 军训：请假',
        onPick: () => { S.flags.militaryDone = true; },
      },
      {
        label: '趁休息时和隔壁排的同学搭话',
        fx: { sleep: -3, social: 4 },
        kind: 'event',
        title: '☀️ 认识了新同学',
        text: '休息哨一响，你走到隔壁排，找了个看起来还顺眼的人搭话。\n\n「你也在一班？」「嗯。」\n\n话不多，但军训结束那天，他给你递了一瓶水。',
        journal: '· 军训：认识新同学',
        onPick: () => { S.flags.militaryDone = true; },
      },
      {
        label: '晚上躲在被子里和家里视频',
        fx: { sleep: -2, social: 1, study: -1 },
        kind: 'event',
        title: '☀️ 晚上的视频通话',
        text: '熄灯后你躲在被子里偷偷和家里视频。妈妈说「黑了」，「瘦了」，你笑了一下说「没有」。\n\n挂掉之后，宿舍里很安静，只有风扇的声音。',
        journal: '· 军训：晚上视频',
        onPick: () => { S.flags.militaryDone = true; },
      },
    ],
  };
}
/* ---------------- 手机机制 · 每学年选一次 ---------------- */
function buildPhoneChoiceEvent() {
  if (!S) return null;
  // 只在学年开始时询问：semIdx 0（高一）、2（高二）、4（高三）
  if (S.semIdx % 2 !== 0) return null;
  if (S.flags.phoneChoiceSem === S.semIdx) return null;
  // 不在这里标记，等玩家选了再说

  const yearName = ['高一', '高二', '高三'][Math.floor(S.semIdx / 2)];

  return {
    t: 'choice',
    kicker: '📱 开学前',
    hint: `${yearName}开始了，这学年要不要带手机去学校？`,
    moduleClass: 'event-choice-module',
    intro: {
      kind: 'event',
      title: '📱 手机的取舍',
      body: `${yearName}要开始了。你把书包整理了一遍，最后在书桌前停下来——手机带还是不带？\n\n带的话，晚修后能刷视频、和家人聊天、拍校园日常；不带的话，上课和自习更专注，宿舍里会安静一点，也少了很多被查的风险。`,
    },
    options: [
      {
        label: '带手机（保持联系，也能偶尔放松）',
        fx: { sleep: -2, social: 2 },
        kind: 'event',
        title: '📱 把手机装进了书包',
        text: '你把手机和充电线一起塞进书包夹层。这一年的校园生活，会多出很多本来不会发生的故事。',
        journal: `· ${yearName}带了手机`,
        onPick: () => { S.phone = true; S.flags.phoneChoiceSem = S.semIdx; },
      },
      {
        label: '不带手机（专注学习，睡得更早）',
        fx: { sleep: 4, study: 2, social: -2 },
        kind: 'good',
        title: '📱 把手机留在了家里',
        text: '你把手机放回书桌抽屉。走出家门的时候，书包轻了一点，心里也轻了一点。',
        journal: `· ${yearName}没带手机`,
        onPick: () => { S.phone = false; S.flags.phoneChoiceSem = S.semIdx; },
      },
    ],
  };
}
function buildEventQueue() {
  QUEUE = [];
  // 转班事件优先处理：一旦 pendingPromotion 有值，先弹这张卡
  if (S.flags && S.flags.pendingPromotion) {
    const targetClass = S.flags.pendingPromotion;
    S.flags.pendingPromotion = null;
    QUEUE.push({
      t: 'choice',
      kicker: '🏫 转班机会',
      hint: '班主任把你叫到办公室',
      moduleClass: 'event-choice-module',
      intro: {
        kind: 'event',
        title: '🏫 转班机会',
        body: `下课铃响，班主任在走廊上叫住你：「去趟年级办公室。」\n\n年级主任翻着成绩单，抬头看了你一眼：「高一期末考得不错。${targetClass}正好有一个名额，你想不想转过去？」\n\n你说「我考虑一下」，走出办公室的时候，走廊上已经没什么人了。`,
      },
      options: [
        {
          label: `接受，转入${targetClass}`,
          fx: { study: 5, social: -3, sleep: -2 },
          kind: 'good',
          title: `🏫 转进${targetClass}`,
          text: `你在转班表上签了字。第二天早读，你抱着书站在新教室门口。\n\n里面的人都抬头看了你一眼，然后低下头继续背单词。\n\n你找到自己的位置坐下。同桌没说话，往旁边挪了半个位置。`,
          journal: `· 高一下转入${targetClass}`,
          onPick: () => {
            CFG.className = targetClass;
            S.className = targetClass;
            netBroadcast(`从普通班转进了${targetClass}`, '🏫');
          },
        },
        {
          label: '婉拒，留在普通班',
          fx: { study: -1, social: 3 },
          kind: 'event',
          title: '🏫 留在了原来的班',
          text: `「谢谢老师，我还是想留在原来班里。」\n\n年级主任看了你两秒，点点头：「行。那你继续加油。」\n\n你走出办公室的时候，正好赶上上课铃。`,
          journal: '· 拒绝了转班机会',
        },
      ],
    });
    loveQuotaTick();
  }
  // 3月 / 5月 / 12月的学校开放日按月份固定触发一次；普通校园事件仍照常保留。
  const openDay = buildOpenDayEvent();
  if (openDay) { QUEUE.push(openDay); loveQuotaTick(); }

  // 每学年开始时询问是否带手机
  const phoneChoice = buildPhoneChoiceEvent();
  if (phoneChoice) QUEUE.push(phoneChoice);

  // 真实节日（元旦 / 春节 / 清明 / 劳动节 / 端午 / 中秋 / 国庆）按真实日期触发。
  const holiday = buildRealHolidayEvent();
  if (holiday) { QUEUE.push(holiday); loveQuotaTick(); }

  // 本轮必有的 1 次校园事件，同时给恋爱配额 +1 点收入。
  QUEUE.push(pickEvent());
    // 高雅艺术进校园：每学年触发一次，三年三种
  const artShow = buildArtShowEvent();
  if (artShow) { QUEUE.push(artShow); loveQuotaTick(); }

  // 艺术节：每年 4-5 月触发一次
  const artFestival = buildArtFestivalEvent();
  if (artFestival) { QUEUE.push(artFestival); loveQuotaTick(); }
  loveQuotaTick();

  // 日常选项：每轮追加一个时间点的小抉择（早读 / 课间 / 午饭 / 放学 / 晚修 / 晚修后 / 周末），
  // 外加 5% 概率的随机小事件。两者都不计入恋爱配额，所以恋爱占比仍是 1/3。
  const daily = buildDailyEvent();
  if (daily) QUEUE.push(daily);
  const dailyRandom = buildDailyRandomEvent();
  if (dailyRandom) QUEUE.push(dailyRandom);

  // 恋爱线每轮最多推一个：遇见 → 节日 → 主线阶段事件 → 约会 / 闲聊 / 手机消息
  let loveItem = buildLoveMeetEvent();
  if (!loveItem) loveItem = buildLoveFestivalEvent();
  if (!loveItem) loveItem = buildLoveStoryEvent();
  // 好感节点里程碑：优先级高于日常恋爱，低于遇见 / 节日 / 主线
  if (!loveItem) loveItem = buildLoveMilestoneEvent();

  // 日常恋爱内容（闲聊 / 手机消息 / 约会 / 吵架）受配额控制，
  // 这是把恋爱剧情压到 1/3 的主要闸门。
  if (!loveItem && S.love && S.love.met && loveQuotaReady()) {
    loveItem = buildLoveCasualEvent();
  }
  if (loveItem) { QUEUE.push(loveItem); loveQuotaSpend(); }

  // 占比已经超标（多半是主线连着推了几段）→ 本轮补 1 个校园事件稀释。
  // 每轮最多补 1 个，避免速通模式下单轮堆太多内容。
  if (loveQuotaOver()) {
    QUEUE.push(pickEvent());
    loveQuotaTick();
  }

  // 考试密度由难度决定：普通每 5 轮，困难每 4 轮。
  if (S.round % DIFFICULTY.examInterval === 0) QUEUE.push({ t: 'exam' });
}

function processQueue() {
  while (QUEUE.length) {
    const sc = QUEUE[0];
    if (sc.t === 'text') {
      QUEUE.shift();
      applyFx(sc.fx);
      logEvent(sc.kind || 'event', sc.title, sc.body, sc.fx);
      if (sc.journal) journal(sc.journal);
      if (sc.onPick) sc.onPick();
      // 一次性全部 append，不等待，遇到 choice 才停
      continue;
    }
    if (sc.t === 'exam') {
      QUEUE.shift();
      doExam();
      continue;
    }
    if (sc.t === 'choice') {
      renderEventChoice(sc);
      return;
    }
    QUEUE.shift();
  }
  finishRound();
}

function renderEventChoice(sc) {
  const log = $('#log');

  // intro 作为事件卡 append 到 log
  if (sc.intro && !sc.introShown) {
    sc.introShown = true;
    logEvent(sc.intro.kind || 'event', sc.intro.title, sc.intro.body, sc.intro.fx || null);
  }

  awaitingChoice = true;

  // 选项卡片直接 append 到 log
  const keys = ['a', 'b', 'c', 'd', 'a', 'b'];
  const choicesDiv = document.createElement('div');
  choicesDiv.className = 'choice-module inline-choice-module';
  choicesDiv.innerHTML = `
    <div class="module-kicker">${sc.kicker || '剧情选择'}</div>
    <div class="module-context">${sc.hint || '该选择可能会影响后面的生活。'}</div>
    <div class="choices">
      ${sc.options.map((o, i) => `
        <button class="choice-btn" data-i="${i}">
          <div class="c-top">
            <span class="choice-key ${keys[i] || 'a'}">${String.fromCharCode(65 + i)}</span>
            <span class="choice-label">${o.label}</span>
          </div>
          ${o.chanceLabel ? `<div class="choice-odds">${o.chanceLabel}</div>` : ''}
          ${o.riskHint ? `<div class="choice-hint">${o.riskHint}</div>` : ''}
          ${fxPills(o.previewFx || o.fx, o.fxLabels)}
        </button>`).join('')}
    </div>`;
  log.appendChild(choicesDiv);

  choicesDiv.querySelectorAll('.choice-btn').forEach((btn) => {
    btn.onclick = () => {
      if (btn.dataset.clicked === '1') return;
      choicesDiv.querySelectorAll('.choice-btn').forEach((b) => {
        b.dataset.clicked = '1';
        b.disabled = true;
        b.style.pointerEvents = 'none';
      });

      const opt = sc.options[+btn.dataset.i];
      const result = opt.resolve ? opt.resolve() : opt;
      QUEUE.shift();
      awaitingChoice = false;

      // 把选项区替换为"你的选择：XXX"一行提示，保留在 log 里
      choicesDiv.innerHTML = `
        <div class="module-kicker">${sc.kicker || '剧情选择'}</div>
        <div class="choice-made">✅ 你的选择：${opt.label}</div>`;
      choicesDiv.classList.add('choice-made-module');

      applyFx(result.fx);
      if (result.kind || result.title) {
        logEvent(result.kind || 'event', result.title || result.label, result.text || '', result.fx, result.resultHtml || '', result.fxLabels || opt.fxLabels);
      }
      if (result.journal) journal(result.journal);
      if (result.onPick) result.onPick();
      if (sc.onResolve) sc.onResolve();
      checkTitles();

      // 对话链
      if (result.next) {
        const nextEvent = typeof result.next === 'function' ? result.next() : result.next;
        if (nextEvent) QUEUE.unshift(nextEvent);
      }

      // 继续处理队列
      processQueue();
    };
  });
}

/* ---------------- 校园事件池 ---------------- */
/* 饭堂菜品池：每次事件从里面随机抽 3 个 */
const FOOD_OPTIONS = [
  { label: '炸鸡腿', fx: { social: 2, study: -1 }, text: '鸡腿外壳酥脆，里面的肉又香又嫩。你咬了一口，汁水在嘴中炸开。你决定把它记进人生档案。', kind: 'good', journal: '· 饭堂：飘香大鸡腿', onPick: () => collectFood('饭堂·飘香大鸡腿') },
  { label: '经典水蒸蛋', fx: { social: 1, sleep: 1 }, text: '水蒸蛋晶莹剔透，面上有一层薄薄的酱油，你用勺子挖了一块送到嘴里，就像吃布丁和果冻。', kind: 'good', journal: '· 饭堂：美味水蒸蛋', onPick: () => collectFood('饭堂·美味水蒸蛋') },
  { label: '冰爽凉粉', fx: { social: 2, sleep: -2 }, text: '一碗凉粉，裹着糖水和蜂蜜，你嗦下一块，感觉夏天的热气和做题的烦恼都消散了。', kind: 'good', journal: '· 饭堂：解暑冰凉粉', onPick: () => collectFood('饭堂·解暑冰凉粉') },
  { label: '生地骨头汤', fx: { social: 1, sleep: 2 }, text: '你喝一口养生汤，味道略微有点苦，但很好喝，你觉得自己已经成为了一个标准的广东人。', kind: 'good', journal: '· 饭堂：养生汤', onPick: () => collectFood('饭堂·养生汤') },
  { label: '番茄炒蛋', fx: { social: 3, study: 1 }, text: '你从小就喜欢吃番茄炒蛋，喜欢这咸甜的味道，食堂的番茄炒蛋虽然没有妈妈做的好吃，但味道已经很不错了。', kind: 'good', journal: '· 饭堂：番茄炒蛋', onPick: () => collectFood('饭堂·番茄炒蛋') },
  { label: '梅菜蒸肉饼', fx: { social: 1, sleep: -1 }, text: '你在家里很少吃到肉饼，爸爸做的肉饼有点柴，没什么味道，相比之下，食堂的肉饼就很好吃。', kind: 'good', journal: '· 饭堂：肉饼', onPick: () => collectFood('饭堂·肉饼') },
  { label: '青椒炒回锅肉', fx: { social: 2, study: -1 }, text: '你感觉这是你在学校吃过最香的菜，青椒和肉都很下饭，香气四溢的回锅肉正好犒劳疲惫的自己。', kind: 'good', journal: '· 饭堂：回锅肉', onPick: () => collectFood('饭堂·回锅肉') },
  { label: '蒜蓉粉丝蒸龙利鱼', fx: { social: 1, study: 2 }, text: '你咬了一口鱼，感觉美味得不真实，鱼肉鲜嫩可口，还没有鱼刺，搭配蒜蓉粉丝，可以下一大勺饭。', kind: 'good', journal: '· 饭堂：蒜蓉粉丝蒸龙利鱼', onPick: () => collectFood('饭堂·蒜蓉粉丝蒸龙利鱼') },
  { label: '萝卜焖牛腩', fx: { social: 1, sleep: 1, study: 1 }, text: '牛肉和萝卜都炖得很烂，像家里的味道，每次炖牛肉，香味能从厨房飘到卧室。', kind: 'good', journal: '· 饭堂：炖牛肉', onPick: () => collectFood('饭堂·炖牛肉') },
  { label: '酸菜鱼', fx: { social: 1, sleep: 2, study: -1 }, text: '十几片鱼片铺在豆芽、青菜和酸菜上，你尝了一片，嫩滑美味，有的鱼片有小鱼刺，你吃得很小心。', kind: 'good', journal: '· 饭堂：酸菜鱼', onPick: () => collectFood('饭堂·酸菜鱼') },
];

/* 校外美食池：每次事件从里面随机抽 3 个 */
const MEISHI_OPTIONS = [
  { label: '老鸭粉丝汤', fx: { social: 3, sleep: 1 }, text: '汤粉的热气先把人给哄好了，你吃完才发现，今天的坏心情已经没剩多少。', kind: 'good', journal: '· 校外：老鸭粉丝汤', onPick: () => collectFood('校外·老鸭粉丝汤') },
  { label: '莞留香', fx: { social: 1, study: 1 }, text: '店里的味道稳稳当当，适合在一周被卷完之后认真吃一顿。', kind: 'good', journal: '· 校外：莞留香', onPick: () => collectFood('校外·莞留香') },
  { label: '鹅好味', fx: { social: 3, sleep: 1 }, text: '烧腊切开时还带着光。你决定下次再来，顺便把同桌也带上。', kind: 'good', journal: '· 校外：鹅好味', onPick: () => collectFood('校外·鹅好味') },
  { label: '品中品', fx: { social: 2, study: 1 }, text: '饭菜好吃，汤也可口。你用一顿饭把自己从考试周里捞了出来。', kind: 'good', journal: '· 校外：品中品', onPick: () => collectFood('校外·品中品') },
  { label: '鲜汇', fx: { social: 3, sleep: 1 }, text: '滑蛋牛肉饭和不用讨论成绩的时间，组成了一个很像假期的晚上。', kind: 'good', journal: '· 校外：鲜汇', onPick: () => collectFood('校外·鲜汇') },
  { label: '杨国福', fx: { social: 3, sleep: 1 }, text: '学习的疲惫在一碗麻辣烫的冲击下一扫而光。', kind: 'good', journal: '· 校外：杨国福', onPick: () => collectFood('校外·杨国福') },
  { label: '哈尔滨水饺', fx: { study: 2, sleep: 1 }, text: '你最喜欢吃韭菜馅的饺子，一口气吃了十几个。', kind: 'good', journal: '· 校外：哈尔滨水饺', onPick: () => collectFood('校外·哈尔滨水饺') },
  { label: '陕西特色小吃', fx: { social: 2, sleep: 1 }, text: '肉夹馍的香气馋得你留口水，你咬了一大口，肉香在嘴中炸开。', kind: 'good', journal: '· 校外：陕西特色小吃', onPick: () => collectFood('校外·陕西特色小吃') },
  { label: '麦当劳', fx: { social: 2, sleep: 2 }, text: '你要了一个牛肉堡，配了一个甜筒，虽然今天是星期四。', kind: 'good', journal: '· 校外：麦当劳', onPick: () => collectFood('校外·麦当劳') },
  { label: '巴哥酸辣粉', fx: { social: 2, study: 1 }, text: '酸辣粉吃得你出汗，食堂里可没有这种味道。', kind: 'good', journal: '· 校外：酸辣粉', onPick: () => collectFood('校外·酸辣粉') },
  { label: '武大郎烧饼', fx: { study: 2, sleep: 1 }, text: '好多同学在围着买烧饼，你是南方人，觉得烧饼的味道一般。', kind: 'good', journal: '· 校外：武大郎烧饼', onPick: () => collectFood('校外·武大郎烧饼') },
  { label: '观扇', fx: { social: 2, sleep: -1 }, text: '这家店的奶茶你没喝过，尝了一下，感觉和1點點差不多。', kind: 'good', journal: '· 校外：鲜汇', onPick: () => collectFood('校外·鲜汇') },
  { label: '贵阳花溪牛肉粉', fx: { social: 3, sleep: 1 }, text: '校外就是有许许多多的特色小吃，你换着吃，发誓要在三年内扫荡所有店铺。', kind: 'good', journal: '· 校外：观扇', onPick: () => collectFood('校外·观扇') },
  { label: '增城肠粉皇', fx: { social: 1, sleep: 3 }, text: '肠粉皮很薄，很好吃，你喜欢加很多酱油，把肠粉都浸没。', kind: 'good', journal: '· 校外：增城肠粉皇', onPick: () => collectFood('校外·增城肠粉皇') },
];

/* ================================================================
   熄灯后的宿舍 · 按性别分池
   男生池偏「打牌 / 游戏 / 串门」，女生池偏「聊天 / 护肤 / 追剧」。
   每次从对应池子里抽 3 个。
   ================================================================ */
const DORM_NIGHT_BOYS = [
  { label: '开一局狼人杀', fx: { social: 5, sleep: -4, study: -3 }, text: '预言家第一晚就被刀，狼人却因为笑得太大声暴露了。你们憋笑憋到肚子疼。', kind: 'event', journal: '· 宿舍狼人杀' },
  { label: '摊开三国杀', fx: { social: 4, sleep: -3, study: -3 }, text: '有人抽到主公，有人摸到一手闪。牌面越来越乱，直到宿管的钥匙声从走廊尽头传来。', kind: 'event', journal: '· 宿舍三国杀' },
  { label: '窜宿找人一起玩', fx: { social: 6, sleep: -5, study: -3 }, text: '你趁宿管不在的间隙溜到隔壁宿舍，几个人挤在门后继续聊天。夜里最快乐的事，往往都不在计划里。', kind: 'event', journal: '· 夜间窜宿' },
  { label: '悄悄聊喜欢的人', fx: { social: 4, sleep: -3, study: -2 }, text: '你说自己喜欢上了隔壁班的一个女生，舍友纷纷出谋划策，要在明天制造一场偶遇。', kind: 'event', journal: '· 宿舍夜宵外卖' },
  { label: '躲在被窝里看球赛', fx: { social: 3, sleep: -4, study: -3 }, text: '你和隔壁床的两个人挤在一部手机前看球。进球那一刻，三个人硬是把欢呼声压成了三声闷笑。', kind: 'event', journal: '· 宿舍看球' },
  { label: '讨论国际政治', fx: { social: 6, sleep: -2, study: -2 }, text: '你们从二战聊到俄乌冲突，从美国大选聊到青瓦台，好像都是叱咤风云的政客。', kind: 'event', journal: '· 宿舍查寝同盟' },
  { label: '听隔壁床讲他初中的事', fx: { social: 4, sleep: -2, study: -2 }, text: '他从初一讲到初三，讲到一半自己先笑出来。你听不懂笑点，但还是跟着笑了。', kind: 'event', journal: '· 宿舍夜谈' },
];

const DORM_NIGHT_GIRLS = [
  { label: '开一场卧谈会', fx: { social: 5, sleep: -3, study: -2 }, text: '熄灯后话题从月考排名一路转到隔壁班谁喜欢谁。有人趴在床上笑，有人把被子拉过头顶。', kind: 'event', journal: '· 宿舍卧谈会' },
  { label: '互相帮忙敷面膜', fx: { social: 4, sleep: -2, study: -2 }, text: '四张面膜在宿舍里同时亮起。有人边敷边背单词，有人一直在抱怨下巴长了痘。', kind: 'event', journal: '· 宿舍护肤' },
  { label: '聊最近追的剧和明星', fx: { social: 5, sleep: -3, study: -2 }, text: '你分享了一个片段，结果整个宿舍开始各说各的。快一点的时候，还有人在讲主角的那句台词。', kind: 'event', journal: '· 宿舍追剧' },
  { label: '互相扎头发 / 编辫子', fx: { social: 4, sleep: -2, study: -1 }, text: '有人给你编了个很复杂的辫子，你还没照过镜子就被熄灯了。第二天早读才在走廊窗户里看到。', kind: 'event', journal: '· 宿舍编发' },
  { label: '分享各自带的零食', fx: { social: 5, sleep: -2, study: -2 }, text: '一包薯片从上铺传到下铺，再传回来的时候只剩下碎屑。有人还把家乡带来的小点心拿出来分。', kind: 'event', journal: '· 宿舍零食分享' },
  { label: '悄悄聊喜欢的人', fx: { social: 5, sleep: -3, study: -2 }, text: '熄灯后话题慢慢变轻。有人只说了半句，剩下的全在被子里笑掉了。', kind: 'event', journal: '· 宿舍悄悄话' },
  { label: '一起听歌，轮流切歌', fx: { social: 3, sleep: -3, study: -1 }, text: '耳机从一只手传到另一只手。最后切到一首谁都不想切走的歌，几个人默默听完了。', kind: 'event', journal: '· 宿舍听歌' },
];

const CAMPUS_EVENTS = [
  {
    t: 'choice',
    condition: () => isBoarder(),
    build: () => ({
      title: '偷偷在自习课去打球',
      body: '你和同伴拿着球拍偷偷从教学楼的后面溜走。\n你刚伸出头，级长就刷新在你身边：「哪个班的？」',
      tag: '校园事件',
      options: [
        { label: '硬着头皮报隔壁班', fx: { sleep: -1, social: 1 ,study: -1}, text: '你胡乱报了个数字。级长眯眼看了你三秒，居然挥手放行。返回教室的路上你心跳如鼓。', kind: 'event', journal: '· 偷偷去打球：报隔壁班过关' },
        { label: '马上跑', fx: { social: 2, study: -1 }, text: '你头也不回，撒开脚步，和同伴一起冲向天桥。级长叹了口气：「这群孩子真管不住。」你成功躲避了级长的追捕，但这之后老师也抓得更严了。', kind: 'event', onPick: () => { tryInjure('fall', 0.3); }, journal: '· 偷偷去打球：跑路' },
        { label: '老实报上班级', fx: { sleep: -1, social: 2}, text: '你诚实地报上了自己的班级。返回教室的路上你心跳如鼓,不知道级长会不会告诉班主任。', kind: 'event', journal: '· 偷偷去打球：老实回答' },
      ],
    }),
  },
  {
    t: 'choice',
    build: () => ({
      title: '运动计划',
      body: '今天你想去运动一下。',
      options: shuffle(SPORT_OPTIONS).slice(0, 3).map((o) => ({
        label: o.label,
        fx: o.fx,
        text: o.text,
        kind: o.kind || 'event',
        journal: o.journal,
        onPick: () => { tryInjure('sport', 0.18); },
      })),
    }),
  },
  {
    t: 'text',
    build: () => ({
      kind: 'event', title: '📖 晚修停电',
      body: '晚修中途整栋楼停电。欢呼声掀翻屋顶，蜡烛和手机电筒陆续亮起，后排开始讲鬼故事。',
      fx: { social: 4, sleep: -1, study: -2 },
      journal: '· 晚修停电',
    }),
  },
  {
    t: 'text',
    build: () => ({
      kind: 'bad', title: '🧯 突袭默写',
      body: '语文老师抱着一沓听写本走进来：「昨天让背的，现在默。」全班倒吸凉气。你的手心全是汗。',
      fx: { study: 1, sleep: -1, social: 0 },
      journal: '· 突袭默写',
    }),
  },
  {
    t: 'text',
    build: () => ({
      kind: 'good', title: '🏀 班级篮球赛',
      body: '年级篮球赛，你们班一路打到半决赛。你虽然只是替补，但递水递毛巾的样子非常专业。全班合影时你站在 C 位旁边。',
      fx: { social: 6, sleep: -2, study: -1 },
      journal: '· 班级篮球赛',
    }),
  },
  {
    t: 'text',
    condition: () => isBoarder(),
    build: () => ({
      kind: 'event', title: '🍜 食堂新菜',
      body: '食堂窗口推出「新品」：肉末水蒸蛋。勇士先尝，全班围观评分——最终得分 8.2 / 10。',
      fx: { social: 3, sleep: -1, study: -1 },
      journal: '· 食堂新品试验',
    }),
  },
  {
    t: 'choice',
    condition: () => S.phone,
    build: () => ({
      title: '手机被缴危机',
      body: '自习课你偷偷刷了会儿视频，后门玻璃上出现一张脸。\n班主任的手已经伸到你桌前：「拿出来。」',
      options: [
        { label: '立刻上交，态度诚恳', fx: { sleep: 1, study: 1 }, text: '你秒速递上手机，并附赠一篇口头检讨。班主任表情缓和：「周五回家再领。」', kind: 'event' },
        { label: '装傻：「什么手机？」', fx: { sleep: 2, social: 2, study: -3 }, text: '全班憋笑。班主任从你袖口里抽出了还在播放的手机。社死 +1，手机寄存 +1。', kind: 'bad', journal: '· 手机被缴' },
      ],
    }),
  },
  {
    t: 'text',
    build: () => ({
      kind: 'love', title: '✉️ 课桌里的纸条',
      body: '课间回来，桌肚里多了一张折成心形的纸条。打开只有四个字：「放学等你。」',
      fx: { social: 4, sleep: -2, study: -3 },
      journal: '· 收到纸条',
    }),
  },
  {
    t: 'text',
    build: () => ({
      kind: 'event', title: '🌧️ 暴雨与共伞',
      body: '放学暴雨。校门口挤成一团，你把伞倾向没带伞的同学，自己半边肩膀湿透。TA 说明天请你喝奶茶。',
      fx: { social: 4, sleep: -2, study: -2 },
      journal: '· 暴雨共伞',
    }),
  },
  {
    t: 'text',
    build: () => ({
      kind: 'exam', title: '📝 周测突袭',
      body: '毫无预兆的周测。卷子从后门传上来那一刻，全班发出整齐的哀嚎。',
      fx: { study: 1, sleep: -3, social: -1 },
      journal: '· 周测突袭',
    }),
  },
  {
    t: 'text',
    build: () => ({
      kind: 'good', title: '🎤 国旗下讲话',
      body: '你被班主任点名去国旗下做分享。站在台上看着全校，腿有点抖，但话筒里的声音意外地稳。',
      fx: { social: 7, sleep: -4, study: 1 },
      journal: '· 国旗下讲话',
    }),
  },
  {
    t: 'text',
    build: () => ({
      kind: 'event', title: '🏫 运动会',
      body: '秋季运动会。你报了 4×100 接力最后一棒。冲线那一刻，看台的吼声几乎掀翻遮阳棚——哪怕只拿了第四。',
      fx: { social: 5, sleep: -3, study: -2 },
      journal: '· 运动会接力',
      onPick: () => { tryInjure('sport', 0.1); },
    }),
  },
  {
    t: 'text',
    condition: () => isBoarder() && !S.flags.dormBriefed,
    build: () => ({
      kind: 'event',
      title: '住宿第一晚',
      body: `宿舍环境比想象中更好：${CFG.gender === '男' ? (S.semIdx >= 4 ? '高三在2到5楼，男生宿舍是 6 人间。' : '高一高二在6到9楼。') : '宿舍按年级分配，公共区域挺宽敞的。'}\n\n热水不用排队，洗澡用的是花洒；但宿舍房间里没有插座，手机只能去教室或宿舍吹风筒处充电。`,
      fx: { social: 2, sleep: -1 },
      journal: '· 住宿环境登记',
      onPick: () => { S.flags.dormBriefed = true; },
    }),
  },
  {
    t: 'choice',
    condition: () => isBoarder() && CFG.gender === '男' && S.semIdx < 4 && S.phone,
    build: () => ({
      title: '宿管查手机',
      body: '宿舍的夜巡来了。老魏站在门口，眼神像是能穿过墙皮和被子，专门检查谁还在玩手机。',
      options: [
        {
          label: '把手机藏枕头下',
          fx: { sleep: -2, social: 1 },
          resolve: () => chance(0.3)
            ? { fx: { sleep: -2, social: 1, study: -3}, kind: 'good', title: '枕头藏机成功', text: '老魏在你窗边停了两秒，居然没有继续追问。等脚步声走远，你才敢把气吐出来。', journal: '· 老魏查寝：枕头藏机过关' }
            : { fx: { sleep: -3, social: -3, study: -1 }, kind: 'bad', title: '老魏精准定位', text: '你以为枕头能挡住一切，老魏却直接掀开被角：「拿出来。」手机被记名，今晚彻底睡不安稳。', journal: '· 刘超查寝：枕头藏机失败' },
        },
        {
          label: '把手机塞进袜子里',
          fx: { sleep: -2, social: 1 },
          resolve: () => chance(0.42)
            ? { fx: { sleep: -2, social: 2 ,study: -3}, kind: 'good', title: '袜子藏机过关', text: '袜子味暂时守住了秘密。老魏扫了一眼就走，你决定以后给手机准备一个更体面的藏身处。', journal: '· 老魏查寝：袜子藏机过关' }
            : { fx: { sleep: -3, social: -4, study: -1 }, kind: 'bad', title: '老魏连袜子都查', text: '老魏一眼看出你动作不自然：「袜子里是什么？」你只好把手机交出去，整层宿舍都安静了。', journal: '· 老魏查寝：袜子藏机失败' },
        },
        {
          label: '坦白从宽，主动上交',
          fx: { sleep: -1, social: 1 , study: 1},
          kind: 'event',
          title: '主动上交手机',
          text: '你把手机递过去，老魏检查完只说：「明早来领。」至少今晚不用再担心被突然点名。',
          journal: '· 老魏查寝：坦白从宽',
        },
      ],
    }),
  },
  {
    t: 'choice',
    condition: () => isBoarder(),
    build: () => {
      const pool = CFG.gender === '男' ? DORM_NIGHT_BOYS : DORM_NIGHT_GIRLS;
      return {
        title: '熄灯后的宿舍',
        body: `熄灯铃响了，宿舍里却没有一个人真的准备睡觉。大家把声音压低，开始高谈阔论。`,
        options: shuffle(pool).slice(0, 3),
      };
    },
  },
  {
    t: 'choice',
    condition: () => isBoarder() && S.phone,
    build: () => ({
      title: '插座争夺战',
      body: '宿舍房间没有插座。你的手机只剩 12% 电，今晚还要不要想办法充上？教室和宿舍吹风筒处都有插座，但位置不多。',
      options: [
        { label: '晚修后留在教室充电', fx: { study: 2, sleep: -3 }, text: '你抢到教室最后一个插座，顺手又刷了两道题。回宿舍时整层楼都快睡着了。', kind: 'good', journal: '· 教室插座充电' },
        { label: '去宿舍吹风筒处排队', fx: { social: 2, sleep: -2 }, text: '吹风筒旁边插线板挤满了手机。你和别人轮流看电量，顺便交换了今天的八卦。', kind: 'event', journal: '· 吹风筒处充电' },
        { label: '算了，关机睡觉', fx: { sleep: 4, social: -1 }, text: '你把手机塞进枕头边，第一次发现没有电量焦虑的夜晚其实挺安静。', kind: 'good', journal: '· 关机睡觉' },
      ],
    }),
  },
  {
    t: 'text',
    condition: () => isBoarder(),
    build: () => ({
      kind: 'good',
      title: '热水和花洒',
      body: '晚修回来，你发现宿舍热水不用排队。花洒的水流不算大，但足够把一天的疲惫冲掉。洗完澡回到宿舍，走廊里已经有人在压低声音玩牌。',
      fx: { sleep: 3, social: 2 },
      journal: '· 宿舍花洒冲凉',
    }),
  },
  {
    t: 'text',
    condition: () => !S.flags.mosquitoSeen,
    build: () => ({
      kind: 'bad',
      title: '绿化率过高的代价',
      body: '学校的绿化率高得像一座小森林。树荫很好，蚊虫也很好——你刚在走廊站了一会儿，腿上已经多了几个包。',
      fx: { sleep: -2, social: 1, study: -1 },
      journal: '· 蚊虫大战',
      onPick: () => { S.flags.mosquitoSeen = true; },
    }),
  },
  {
    t: 'text',
    condition: () => S.semIdx < 4 && !S.flags.examHallLowBriefed,
    build: () => ({
      kind: 'good',
      title: '学校被征用为社会考场',
      body: '学校偶尔会被征用为社会上的考试考场。这次只征用了高一、高二的教室，周五下午高一高二提前放学；高三不放假，照常上课。',
      fx: { sleep: 4, social: 2, study: -2 },
      journal: '· 高一高二周五提前放学',
      onPick: () => { S.flags.examHallBriefed = true; S.flags.examHallLowBriefed = true; },
    }),
  },
  {
    t: 'text',
    condition: () => S.semIdx >= 4 && !S.flags.examHallHighBriefed,
    build: () => ({
      kind: 'event',
      title: '高三不放假的周六',
      body: '学校又被征用为社会考试考场，但只占用了高一、高二的教室。高三在高三楼照常上课，别人周五下午放学，你们继续面对倒计时和试卷。',
      fx: { sleep: -3, study: 1, social: -1 },
      journal: '· 高三照常上课',
      onPick: () => { S.flags.examHallBriefed = true; S.flags.examHallHighBriefed = true; },
    }),
  },
  {
    t: 'choice',
    condition: () => S.semIdx >= 4 && S.flags.examHallHighBriefed && !S.flags.mixOutSeen,
    build: () => ({
      title: '趁学弟学妹放假混出去',
      body: '高一高二因为社会考试考场安排提前放假。你们高三虽然不放，但可以叫上他们一起混出校门，短暂逃离高三楼的倒计时。',
      options: [
        { label: '叫上大家一起混出去', fx: { social: 5, sleep: -3, study: -3 }, text: '你们在校门口汇合，装作只是普通的周末出行。离开高三楼那一刻，所有人都像暂时毕业了一样。', kind: 'good', journal: '· 高三混出去', onPick: () => { S.flags.mixOutSeen = true; } },
        { label: '留在教室继续刷题', fx: { study: 3, sleep: -2, social: -2 }, text: '你看着群里不断弹出的美食照片，默默把下一套卷子翻开。高三没有真正的周末。', kind: 'exam', journal: '· 高三留校刷题', onPick: () => { S.flags.mixOutSeen = true; } },
      ],
    }),
  },
  {
    t: 'text',
    condition: () => isBoarder(),
    build: () => ({
      kind: 'event',
      title: '莞中大包',
      body: '饭堂门口最受欢迎的早餐是莞中大包。你去晚了，窗口只剩下一些蛋糕；早去十分钟，才有机会揣着热腾腾的大包坐下。',
      fx: { social: 2, sleep: -1 },
      journal: '· 莞中大包',
      onPick: () => { collectFood('饭堂·莞中大包'); },
    }),
  },
  {
    t: 'choice',
    condition: () => !isBoarder(),
    build: () => ({
      title: '走读生提前回家',
      body: '晚修的时候，走读生可以在教室和住宿生一起自习，也可以提早几十分钟回家。',
      options: [
        { label: '直接回家', fx: { social: -2, study: -4, sleep: -4}, text: '你提前回家，躺在床上玩手机，不觉已经凌晨。', kind: 'bad', journal: '· 晚修提前回家' },
        { label: '留下来自习', fx: { study: 2, sleep: -3 }, text: '你写完了一套卷子，感觉进步不小。', kind: 'good', journal: '· 留校晚修' },
      ],
    }),
  },
  {
    t: 'choice',
    condition: () => !isBoarder(),
    build: () => ({
      title: '走读生帮同学带早餐',
      body: '走读生可以在校外吃早餐，但住宿生不可以，所以许多住宿生托走读生帮忙带学校外面的肠粉、蒸米粉等更美味的早餐。',
      options: [
        {
          label: '早起帮同学带早餐',
          fx: { social: 4, sleep: -3 ,study: -1},
          text: '你早早地起床，在肠粉店买了二十几份肠粉，师傅做好时已经快要早读了。',
          kind: 'event', journal: '· 带早餐进校成功',
        },
        {
          label: '不帮住宿生带早餐',
          fx: { social: -2, sleep: 2 ,study: -1},
          resolve: () => chance(0.45)
            ? { fx: { social: 1, sleep: 1 }, kind: 'good', title: '同学觉得你确实很赶，也没有责怪你', text: '你和同学们还是好哥们。', journal: '· 同学表示理解' }
            : { fx: { social: -3, study: -1 }, kind: 'bad', title: '同学觉得你就多带一份没什么大不了的', text: '有的同学觉得你有点小气。', journal: '· 同学有点不高兴' },
        },
      ],
    }),
  },
  {
    t: 'choice',
    condition: () => isBoarder(),
    build: () => ({
      title: '饭堂珍馐图鉴',
      body: '住宿生在饭堂有时会遇到一些出乎意料的菜。今天的菜单像满汉全席，你站在窗口前挑了几样。',
      options: shuffle(FOOD_OPTIONS).slice(0, 3),
    }),
  },
  {
    t: 'choice',
    build: () => ({
      title: '莞城美食地图',
      body: isBoarder() ? '你打算去校外找点好吃的，那么去哪里吃呢？' : '放学后，你不想吃饭堂，打算顺路去莞城解决一顿。',
      options: shuffle(MEISHI_OPTIONS).slice(0, 3),
    }),
  },
  {
    t: 'choice',
    condition: () => S.phone,
    build: () => ({
      title: '课堂上的手机',
      body: `老师在讲台上写板书，你的手机在抽屉里亮了一下。年级主任和级长${S.semIdx >= 4 ? '就在走廊巡堂' : '随时可能从后门推门进来'}——这一节课，要不要赌一把？`,
      options: [
        {
          label: '把手机压在课本下刷一会儿',
          fx: { study: -2, sleep: -1 },
          chanceLabel: '不被抓约 30%',
          riskHint: '被逮到的概率很大',
          resolve: () => chance(0.3)
            ? { fx: { study: -1, social: 2 }, kind: 'event', title: '手机藏得不错', text: '你把屏幕亮度调到最低，靠课本挡住半边天。四十分钟后下课铃响，居然没人发现。', journal: '· 课堂玩手机：躲过巡堂' }
            : (() => { const who = phoneCatcher(); return { fx: { study: -4, social: -2, sleep: -1 }, kind: 'bad', title: `${who}收走了手机`, text: `后门无声地开了。${who}直接走到你桌边，把手伸进抽屉：「拿出来。」全班的目光都转了过来。手机被登记，班主任的通知比你到家还快。`, journal: `· 课堂玩手机被${who}抓` }; })(),
        },
        {
          label: '把手机收起来，老实听课',
          fx: { study: 3, sleep: -1 },
          text: '你把手机推进书包最底层，抬头跟着板书抄完了整节课的笔记。下课时发现，其实也没那么难熬。',
          kind: 'good',
          journal: '· 课堂认真听课',
        },
      ],
    }),
  },
  {
    t: 'choice',
    condition: () => S.phone,
    build: () => ({
      title: '晚修的手机',
      body: '晚修教室里只有翻书声和笔尖声。手机在口袋里震了一下，走廊上传来值班老师的脚步声。',
      options: [
        {
          label: '低头刷一会儿',
          fx: { study: -2, sleep: -1 },
          chanceLabel: '不被抓约 26%',
          riskHint: '晚修班主任会来看，级长们也盯着',
          resolve: () => chance(0.26)
            ? { fx: { study: -1, social: 2 }, kind: 'event', title: '晚修摸鱼成功', text: '值班老师的脚步在你们班门口停了两秒，又走远了。你把手机塞回口袋，心跳快了半天。', journal: '· 晚修玩手机：躲过老师' }
            : (() => { const who = phoneCatcher(); return { fx: { study: -4, social: -3, sleep: -2 }, kind: 'bad', title: `${who}站在了你身后`, text: `你正看得入神，一只手从背后伸过来把手机抽走。${who}面无表情：「晚修时间，手机先放我这。」走廊上的议论声比训话还难受。`, journal: `· 晚修玩手机被${who}抓` }; })(),
        },
        {
          label: '刷题，手机放讲台收纳袋',
          fx: { study: 4, sleep: -2 },
          text: '你主动把手机放进讲台的收纳袋，两节晚修写完了整套选择。回宿舍时手是酸的，心里是稳的。',
          kind: 'exam',
          journal: '· 晚修专注刷题',
        },
      ],
    }),
  },
  {
    t: 'text',
    condition: () => S.semIdx >= 4 && !S.flags.mockExamSeen,
    build: () => ({
      kind: 'exam',
      title: '📋 高三模考周',
      body: '连续几天都在发卷子：语文、数学、综合，早读前一套，晚修后一套。模考排名不等于高考，但每个人都盯着那张表，像提前看见了六月的自己。',
      fx: { sleep: -4, study: 2, social: -1 },
      journal: '· 高三模考周',
      onPick: () => { S.flags.mockExamSeen = true; },
    }),
  },
  {
    t: 'choice',
    condition: () => S.semIdx >= 4 && !S.flags.sprintSeen,
    build: () => ({
      title: '🔥 高三冲刺',
      body: '百日倒计时翻到最后两位数。班主任把「冲刺」两个字写满黑板：你要用什么方式把最后一段路走完？',
      options: [
        { label: '极限压缩睡眠，拼一把', fx: { study: 5, sleep: -10, social: -3 }, text: '你把晚修后的时间也切成了知识点。短期成绩确实往上冲，但身体发出的警报越来越明显。', kind: 'exam', journal: '· 高三冲刺：极限刷题', onPick: () => { S.flags.sprintSeen = true; } },
        { label: '稳住作息，按计划推进', fx: { study: 3, sleep: -3, social: 1 }, text: '你没有突然变成另一个人，只是每天多做一套题、少刷一会儿手机。稳定本身就是冲刺。', kind: 'good', journal: '· 高三冲刺：稳步推进', onPick: () => { S.flags.sprintSeen = true; } },
        { label: '和同桌互相监督', fx: { study: 2, sleep: -2, social: 3 }, text: '你们把错题贴在桌角，谁先走谁就提醒对方明早带准考证。焦虑没有消失，但不再是一个人扛。', kind: 'event', journal: '· 高三冲刺：同桌互助', onPick: () => { S.flags.sprintSeen = true; } },
      ],
    }),
  },
  {
    t: 'choice',
    condition: () => S.semIdx === 5 && S.roundInSem >= Math.floor(monthsInSem() * 0.6) && !S.flags.graduationSeen,
    build: () => ({
      title: '🎓 毕业典礼',
      body: `高考结束，学校在礼堂举办毕业典礼。\n\n你穿着校服，最后一次走进这个三年前第一次走进的地方。体育馆里坐满了人，广播里放着很轻的音乐。`,
      options: [
        {
          label: '和同桌合影，把这三年留在相册里',
          fx: { social: 4, sleep: -1 },
          kind: 'good',
          title: '🎓 合影',
          text: '你们在WiFi女神前拍了很多张，有的正经有的搞怪。最后一张是全班合影，所有人都在笑。',
          journal: '· 毕业典礼：合影',
          onPick: () => { S.flags.graduationSeen = true; S.flags.volunteerSeen = true; },
        },
        {
          label: '和班主任单独说几句话',
          fx: { social: 3, study: 1 },
          kind: 'good',
          title: '🎓 告别班主任',
          text: '你走到班主任面前，想了半天，最后只说了一句「谢谢老师」。班主任拍了拍你的肩：「好好走后面的路。」',
          journal: '· 毕业典礼：告别班主任',
          onPick: () => { S.flags.graduationSeen = true; S.flags.volunteerSeen = true; },
        },
        {
          label: '一个人在操场走一圈',
          fx: { sleep: 2, social: 1 },
          kind: 'event',
          title: '🎓 操场走一圈',
          text: '你从跑道起点慢慢走到终点。操场上还有零散的几个人，在看台上吹风、在跑道上散步。',
          journal: '· 毕业典礼：操场走一圈',
          onPick: () => { S.flags.graduationSeen = true; S.flags.volunteerSeen = true; },
        },
      ],
    }),
  },
  {
    t: 'choice',
    condition: () => isBoarder() && S.semIdx >= 4 && S.phone,
    build: () => ({
      title: '高三宿舍的熄灯之后',
      body: '高三在高三楼，宿舍熄灯后的检查松了很多。宿管只在宿舍外转一圈，很少真的上来翻床。你还有半集视频没看完。',
      options: [
        {
          label: '躲被窝里继续看',
          fx: { sleep: -4, social: 2 ,study: -3},
          chanceLabel: '不被抓约 72%',
          riskHint: '高三宿舍查得松，但宿管偶尔会来查手机',
          resolve: () => chance(0.72)
            ? { fx: { sleep: -3, social: 3 }, kind: 'event', title: '被窝里的半小时', text: '你把被子堆成一个帐篷，屏幕的光漏不出去。看到结尾的时候，走廊里已经彻底没声音了。', journal: '· 高三宿舍玩手机：安全' }
            : (() => { const who = phoneCatcher(); return { fx: { sleep: -4, social: -2, study: -1 }, kind: 'bad', title: `${who}今天上来了`, text: `被子被掀开的那一刻你就知道完了。${who}看了看屏幕，又看了看你：「高三了还这样。」手机被收，明天早读还得去办公室。`, journal: `· 高三宿舍玩手机被${who}抓` }; })(),
        },
        {
          label: '关机，闭眼睡觉',
          fx: { sleep: 5, study: 1 },
          text: '你把手机倒扣在枕头边，十分钟内就睡着了。高三的睡眠，比任何一集视频都值钱。',
          kind: 'good',
          journal: '· 高三早睡',
        },
      ],
    }),
  },
];
/* ================================================================
   高雅艺术进校园 · 三年三种
   高一芭蕾舞、高二歌剧、高三交响乐，每学年触发一次。
   恋爱对象如果已经遇见，会根据性格产生不同的反应（不改变数值）。
   ================================================================ */
const ART_SHOWS = [
  {
    id: 'ballet',
    yearIdx: 0,
    title: '🩰 高雅艺术进校园 · 芭蕾舞专场',
    body: '体育馆的舞台被重新布置过，灯光从头顶打下来，整个场地安静得能听见空调的嗡鸣。\n\n「中央芭蕾舞团」的牌子立在入口处。你找到自己班的位置坐下，周围全是熟悉的面孔——但这一刻，所有人都不太一样了。\n\n灯光暗下去的时候，前排有人回头看了一眼。',
    fx: { sleep: -1, social: 2, study: 1 },
    journal: '· 高雅艺术进校园：芭蕾舞',
    loveReact: {
      A: 'TA 坐在你前面两排，全程没有回头。散场的时候你才发现，TA 的手一直搭在椅背上，指节因为攥得太紧而发白。',
      B: '「你看那个跳首席的！腿也太长了吧！」TA 凑过来小声说，呼吸喷在你耳朵上。',
      C: '「……那个动作，像画里的。」TA 只说了这一句，但整场演出里你注意到 TA 看了你好几次。',
      D: '「看不懂。」TA 说。但中场休息的时候，你看见 TA 在手机上搜「芭蕾舞 天鹅湖 剧情」。',
    },
  },
  {
    id: 'opera',
    yearIdx: 1,
    title: '🎭 高雅艺术进校园 · 歌剧专场',
    body: '意大利语的唱腔在体育馆里回荡。你听不懂歌词，但字幕屏上的中文翻译一行行滚过。\n\n有人在打哈欠，有人在拍照。你注意到舞台侧幕那里，有个工作人员一直站着没动。\n\n散场时，前排的同学说「不如去年好看」，但你没接话。',
    fx: { sleep: -2, social: 1, study: 2 },
    journal: '· 高雅艺术进校园：歌剧',
    loveReact: {
      A: 'TA 在演出结束后没有马上走。你回头的时候，TA 正看着空荡荡的舞台，像在等什么。',
      B: '「那个女高音！我的天！」散场路上 TA 还在哼调子，哼得完全不在调上。',
      C: '「……歌词里说，『我的名字，你从未念过』。」TA 忽然说。你问 TA 怎么知道，TA 指了指字幕屏：「刚放过去的。」',
      D: '「无聊。」但你把节目单落在座位上，TA 帮你捡起来的时候，上面用铅笔划了一行字。',
    },
  },
  {
    id: 'symphony',
    yearIdx: 2,
    title: '🎻 高雅艺术进校园 · 交响乐专场',
    body: '高三了，这是最后一次高雅艺术进校园了。\n\n指挥棒落下的那一刻，整个体育馆像是被什么包住了。你听见低音提琴的声音从脚底升起来，穿过胸腔，到达眼眶。\n\n你旁边的同学在偷偷擦眼睛，假装是打哈欠。',
    fx: { sleep: -3, social: 2, study: 1 },
    journal: '· 高雅艺术进校园：交响乐',
    loveReact: {
      A: 'TA 全程闭着眼睛。你以为 TA 睡着了，但某个乐章结束的瞬间，你看见 TA 的睫毛湿了。',
      B: '「你不觉得这个旋律很熟悉吗？」TA 问。你想了想，好像是广播里放过。TA 笑了：「是校歌的变奏。」',
      C: 'TA 把节目单折成了很小的一块，塞进笔袋里。你后来才知道，那上面有 TA 用铅笔画的你。',
      D: '「我不懂这个。」TA 开场前说。但散场的时候，TA 是最后几个站起来的。',
    },
  },
];

function buildArtShowEvent() {
  if (!S || !S.flags) return null;
  if (!S.flags.artShowsSeen || !Array.isArray(S.flags.artShowsSeen)) S.flags.artShowsSeen = [];

  const yearIdx = Math.floor(S.semIdx / 2); // 0=高一、1=高二、2=高三
  const show = ART_SHOWS[yearIdx];
  if (!show) return null;
  if (S.flags.artShowsSeen.includes(show.id)) return null;
  // 只在每学年第一个学期触发一次（semIdx 0 / 2 / 4）
  if (S.semIdx % 2 !== 0) return null;
  // 学期前 1/3 触发，避免期末突然出现；窗口放宽到 1/3 提高首次触发概率
  if (S.roundInSem > Math.max(1, monthsInSem() / 3)) return null;

  const loveLine = (S.love && S.love.met && show.loveReact)
    ? `\n\n${show.loveReact[S.love.char] || ''}`
    : '';

  return {
    t: 'text',
    kind: 'event',
    title: show.title,
    body: show.body + loveLine,
    fx: show.fx,
    journal: show.journal,
    onPick: () => { S.flags.artShowsSeen.push(show.id); },
  };
}
/* ================================================================
   校园艺术节 · 每年一次
   高一/高二/高三各一次，4-5月触发。
   选项覆盖：话剧（雷雨/哈姆雷特/红楼梦轮换）、歌手大赛、科技节、旁观。
   ================================================================ */
const ART_FESTIVAL_PLAYS = ['《雷雨》', '《哈姆雷特》', '《红楼梦》'];

function buildArtFestivalEvent() {
  if (!S || !S.flags) return null;
  if (!Array.isArray(S.flags.artFestivalSeen)) S.flags.artFestivalSeen = [];

  const yearIdx = Math.floor(S.semIdx / 2);
  if (yearIdx > 2) return null;
  if (S.flags.artFestivalSeen.includes(yearIdx)) return null;

  const { month } = calendarOf(S.round);
  if (month !== 4 && month !== 5) return null;
  if (S.roundInSem < monthsInSem() * 0.3 || S.roundInSem > monthsInSem() * 0.7) return null;

  const playName = ART_FESTIVAL_PLAYS[yearIdx] || ART_FESTIVAL_PLAYS[0];
  const lovePresent = S.love && S.love.met;

  return {
    t: 'choice',
    intro: {
      kind: 'event',
      title: '🎪 校园艺术节',
      body: `四月末，教学楼的走廊上贴满了艺术节的海报。\n\n今年的节目单很长：有话剧${playName}的班级展演，有校园歌手大赛的初赛，还有科技节的作品展示。\n\n你站在海报前面看了一会儿——你想参与哪个？${lovePresent ? '\n\n（TA 也在看海报，目光落到同一张纸上的时候，你们谁也没说话。）' : ''}`,
    },
    options: [
      {
        label: `报名话剧${playName}的班级角色选拔`,
        fx: { social: 4, study: 1, sleep: -3 },
        kind: 'event',
        title: `🎭 话剧${playName}`,
        text: `你被分到了一个台词不多的角色——但每一句都要在台上大声说出来。排练的时候你忘词了两次，第三次终于把整段顺了下来。\n\n演出那天，台下坐着全校的人。你站在幕布后面，听见报幕的声音，手心全是汗。\n\n灯光亮起的时候，你往观众席扫了一眼——你同桌坐在第三排正中间的位置。`,
        journal: `· 艺术节：参演话剧${playName}`,
        onPick: () => { S.flags.artFestivalSeen.push(yearIdx); },
      },
      {
        label: '报名校园歌手大赛',
        fx: { social: 5, sleep: -2, study: -1 },
        kind: 'event',
        title: '🎤 校园歌手大赛',
        text: '初赛在音乐教室进行，评委是三个音乐老师。你唱到副歌的时候破了一个音，但没人笑。\n\n复赛是在体育馆，台下坐了一个年级。你握着话筒，发现手在抖。',
        journal: '· 艺术节：校园歌手大赛',
        onPick: () => { S.flags.artFestivalSeen.push(yearIdx); },
      },
      {
        label: '参与科技节的作品展',
        fx: { study: 3, social: 1, sleep: -2 },
        kind: 'event',
        title: '🔬 科技节作品展',
        text: '你和同桌做了一个简单的电路模型，放在展台上。旁边那组做的是机器人，围观的人明显更多。\n\n但你蹲在自己的展位后面，看着模型上的小灯泡亮起来，觉得也还行。',
        journal: '· 艺术节：科技节作品展',
        onPick: () => { S.flags.artFestivalSeen.push(yearIdx); },
      },
      {
        label: '不参与，坐在观众席看别人的表演',
        fx: { sleep: 2, social: 1, study: -1 },
        kind: 'event',
        title: '🪑 观众席',
        text: '你选择了最安全的位置——观众席。\n\n但你记得很清楚：那一年的校园歌手大赛冠军，唱到最后一句的时候，声音是哑的。全场都在鼓掌。',
        journal: '· 艺术节：观众',
        onPick: () => { S.flags.artFestivalSeen.push(yearIdx); },
      },
    ],
  };
}
/* pickEvent：choice 事件先展示说明卡，再挂选项 */
function pickEvent() {
  // 去重：记住最近用过的校园事件下标，下一轮从「没用过」的池子里抽；
  // 池子被抽空了就整体重置，所以不会出现连续看到同一张卡的情况。
  if (!S) return null;
  if (!Array.isArray(S.recentCampus)) S.recentCampus = [];
  const eligible = CAMPUS_EVENTS.map((e, i) => ({ e, i }))
    .filter(({ e }) => !e.condition || e.condition());
  const pool = eligible.filter(({ i }) => !S.recentCampus.includes(i));
  const source = pool.length ? pool : eligible;
  if (!source.length) return null;
  const chosen = pick(source);
  S.recentCampus.push(chosen.i);
  // 去重窗口最多覆盖 60% 的事件池，最多 10 条记录
  const cap = Math.max(3, Math.min(10, Math.floor(eligible.length * 0.6)));
  while (S.recentCampus.length > cap) S.recentCampus.shift();

  const raw = chosen.e;
  const sc = raw.build();
  if (raw.t === 'choice') {
    // 先输出事件卡，再进入选项
    return {
      t: 'choice',
      intro: { kind: sc.kind || 'event', title: sc.title, body: sc.body, fx: null },
      options: sc.options.map((o) => ({
        ...o,
        // 选项点击后已由 renderEventChoice 记录
        kind: o.kind || 'event',
        title: o.title || sc.title + ' · 回应',
        text: o.text || '',
        fx: o.fx || {},
      })),
    };
  }
  return sc;
}

/* ================================================================
   日常选项 · 寄宿制高中的一天
   与「本月安排」主选择并行：每轮再追加一个时间点的日常抉择。
   七个时间点循环推进：早读 → 课间 → 午饭午休 → 放学 → 晚修 → 晚修后 → 周末。
   只影响 睡眠 / 社交 / 学识，不参与恋爱剧情配额，也不改动任何原有事件。
   ================================================================ */
const DAILY_FX_LABELS = { study: '学识' };
const DAILY_RANDOM_CHANCE = 0.05;   // 随机小事件：日常随时触发
const DAILY_LORE_NEED = 3;          // 集齐 3 条校史线索解锁「校史秘闻」

// 校史秘闻线索（放学后去操场 / 绿瓦楼散步时随机翻到一条）
const DAILY_LORE_CLUES = [
  '一九一九年，北京‘五四’运动消息传到广州，五月十一日下午，广州成立广东中等学校以上学生联合会，东莞中学联合会也成立了，东莞中学学生随即投入到五四运动的洪流中去。——《莞中往事》',
  '1926年3月28日下午，蒋介石亲临东莞中学视察，发表演说，谈入党意义，赞扬莞中学生革命精神，国民党军统帅能从繁忙的军务中拔冗到一所普通中学演讲，并给予高度评价，可见莞中对社会影响之大。——《大革命时期的红色莞中》',
  '1924——1927年间，中国大地上发生了一场轰轰烈烈的反帝反封建革命战争，历史上称为第一次国内革命战争。国民党改组、东征北伐、四·一二政变等等轰动的历史事件陆续发生，革命旋涡之中的东莞中学，染上浓厚的红色革命色彩。——《莞中往事》',
  '1924年12月，中国共产党在东莞的第一个党支部在东莞中学成立，莫萃华任首任支部书记。——《大革命时期的红色莞中》',
  '东莞中学的共产思想始于1923年。孟山公园（现东莞人民公园）南城墙上的风满楼是东莞中学进步学生学习革命理论传播革命思想的地方。——《大革命时期的红色莞中》',
];

/* 周末池：每次从里面随机抽 3 个 */
const WEEKEND_OPTIONS = [
  { label: '在家埋头刷题备战月考', fx: { study: 2, sleep: -4 }, title: '📅 周末刷题', text: '两天里你几乎没出过房间，写完的卷子摞了一小叠。周日下午收书包的时候，你有点说不出的踏实。', journal: '· 周末：埋头刷题' },
  { label: '约同学线下见面玩', fx: { social: 2, sleep: -2, study: -3 }, title: '📅 约同学出来', text: '你们在商场里逛了一下午，什么也没买，但笑了一路。回家的地铁上，你把作业忘得干干净净。', journal: '· 周末：约同学线下见面', onPick: () => { dailyGrantLeavePass(); } },
  { label: '宅在家里玩手机电脑', fx: { social: 2, study: -3, sleep: -2 }, title: '📅 宅在家里', text: '你在学校没有玩手机，所以周末就在刷视频和打游戏中度过。', journal: '· 周末：宅在家里', onPick: () => { dailyGrantLeavePass(); } },
  { label: '好好睡一觉休息，出门逛街散心', fx: { sleep: 3, study: -1 }, title: '📅 睡到自然醒', text: '你睡到中午才起，然后一个人出门走了很久。回来的时候天已经黑了，作业一个字没动，但整个人松了下来。', journal: '· 周末：睡觉逛街散心', onPick: () => { dailyGrantLeavePass(); } },
  { label: '和父母出门吃顿饭', fx: { sleep: 2, social: 2, study: -2 }, title: '📅 陪家人吃饭', text: '你爸妈难得周末都在家，三个人去楼下那家小饭馆坐了坐。饭桌上聊的不是成绩，是最近哪条街新开了店。', journal: '· 周末：陪家人吃饭' },
  { label: '一个人在家整理房间、发呆', fx: { sleep: 1, study: -1, social: -1 }, title: '📅 一个人在家', text: '你把书桌抽屉里的旧东西全翻出来看了一遍。作业推到大半天后才动了两页，但心里莫名安静。', journal: '· 周末：整理房间发呆' },
  { label: '去图书馆占座，做一整套卷子', fx: { study: 4, sleep: -3, social: -1 }, title: '📅 图书馆占座', text: '你和几个同学约在图书馆，从早上坐到下午。一天下来做了两套理综，中间只出去吃了一碗面。', journal: '· 周末：图书馆做卷子' },
];

/* 运动池：每次从里面随机抽 3 个 */
/* 运动池：每次从里面随机抽 3 个 */
const SPORT_OPTIONS = [
  { label: '去操场跑步', fx: { social: 3, sleep: 2 }, title: '🏃 操场跑步',
    text: '你沿着跑道慢跑，遇到同学打招呼，你轻轻挥手回应。跑道周围有拉伸的、跳绳的、打八段锦的，还有一个同学面对着墙深蹲，你不知道他为什么把鼻子也贴在墙上。跑到天色渐暗，月亮已经在黄昏的天空露出一角，你才慢慢停下。',
    kind: 'event', journal: '· 运动：操场跑步' },
  { label: '去体育馆打羽毛球', fx: { study: 2, social: 1 }, title: '🏸 打羽毛球',
    text: '你用最快的速度冲到体育馆三楼，抢到了最好的场。打了好几场酣畅淋漓的单打，汗水湿透了上衣和短裤。最后精疲力竭，差点连回宿舍洗澡的力气都没有。',
    kind: 'good', journal: '· 运动：打羽毛球' },
  { label: '去游泳馆游泳', fx: { social: 1, sleep: 3, study: 1 }, title: '🏊 游泳',
    text: '你交替着游了几圈自由泳和蛙泳。每次划手打腿，水都会回应你。你喜欢这种感觉——在水里，你不用想其他事情，只需用力和前进。',
    kind: 'event', journal: '· 运动：游泳' },
  { label: '打排球', fx: { social: 5, sleep: 2 }, title: '🏐 排球',
    text: '你抡圆胳膊使劲发了一个球，排球飞过网，在距离边线 5 厘米处落地，你得分了，伙伴都为你欢呼。',
    kind: 'event', journal: '· 运动：打排球' },
  { label: '打篮球', fx: { social: 5, sleep: 2 }, title: '🏀 篮球',
    text: '一个高大的同学差点把你顶飞，你抓住机会抢到篮板，带球，然后一个漂亮的三分，球进了——这是你投进的第一个三分球，大家都为你鼓掌。',
    kind: 'event', journal: '· 运动：打篮球' },
  { label: '去踢足球', fx: { social: 5, sleep: 2 }, title: '⚽ 足球',
    text: '放学后的足球场总是有同学在踢球，你数了数，刚好缺一个人，于是顺利地加入其中。你脚感不错，几十分钟下来虽然没进球，却贡献了几个漂亮的助攻。',
    kind: 'event', journal: '· 运动：踢足球' },
  { label: '去打乒乓球', fx: { social: 2, sleep: 2 }, title: '🏓 乒乓球',
    text: '你拿上球拍来到负一楼，刚走下楼梯，就听见密集的碰撞声。你和伙伴打满 11 球战平，进入激动人心的加球，欢呼声和叹息声交错，最终你以 22 比 20 险胜。',
    kind: 'event', journal: '· 运动：打乒乓球' },
  { label: '去操场做引体向上', fx: { sleep: 1, study: 1 }, title: '💪 引体向上',
    text: '你在单杠下站了两分钟，做了七个引体向上。第七个到一半就没劲了，但你还是撑上去了。手掌磨出了两个浅浅的茧。',
    kind: 'event', journal: '· 运动：引体向上' },
  { label: '去打网球', fx: { social: 3, sleep: 2 }, title: '🎾 网球',
    text: '球场的对面是隔壁班的同学。你们打了两局，你一胜一负。挥拍的时候，风从耳边过，很畅快。',
    kind: 'event', journal: '· 运动：打网球' },
  { label: '去操场看同学踢球', fx: { social: 3, sleep: 1, study: -1 }, title: '👀 看球',
    text: '你坐在看台上看了一场班级之间的比赛。有人摔倒了，又爬起来继续跑。你忽然有点想下场，但最后还是坐着看完了。',
    kind: 'event', journal: '· 运动：看球' },
  { label: '去跑一千米', fx: { sleep: 3, study: -1 }, title: '🏃 一千米',
    text: '你用了四分四十秒。跑完之后靠在栏杆上喘气，汗顺着下巴往下滴。第二天腿会酸，但今天很痛快。',
    kind: 'event', journal: '· 运动：一千米' },
  { label: '去操场跳绳', fx: { sleep: 2, study: 1 }, title: '🪢 跳绳',
    text: '你连续跳了两百多个，中间断了一次。停下来的时候腿有点软，但是心里很清爽。',
    kind: 'event', journal: '· 运动：跳绳' },
];

/* 课间池：每次从里面随机抽 4 个 */
const BREAK_OPTIONS = [
  { label: '趴桌小憩', fx: { sleep: 2, study: -1, social: -1 }, title: '📖 趴桌十分钟', text: '你把外套垫在胳膊下，闭眼就是十分钟。上课铃响时，同桌推了你一把。', journal: '· 课间：趴桌小憩' },
  { label: '拿习题去办公室找老师答疑', fx: { study: 3, sleep: -2 }, title: '📖 办公室答疑', text: '办公室里排了三个人。你把攒了两天的题一口气问完，老师顺手在你本子上画了个圈：「这个思路对了。」', journal: '· 课间：办公室答疑' },
  { label: '和好友去操场走走', fx: { social: 2, sleep: -1 }, title: '📖 操场走一圈', text: '你们绕操场走了一圈，在小卖部买了两瓶饮料。回来的时候出了些汗，上课铃刚好响。', journal: '· 课间：操场走一圈' },
  { label: '跑去地下室打乒乓球', fx: { social: 1, sleep: -1 }, title: '📖 打乒乓球', text: '你在负1层找到球友，和他打了几局乒乓球，期间你一用力，把球打上了天花板的夹层里。', journal: '· 课间：跑去地下室打乒乓球' },
  { label: '在教室和同桌聊天打闹', fx: { social: 2, sleep: -1, study: -1 }, title: '📖 聊了一整节下课', text: '你们从月考聊到暑假，笑得前排都回头。十分钟过得比一节课还快。', journal: '· 课间：聊天打闹' },
  { label: '去小卖部买冰饮料', fx: { social: 1, study: -1 }, title: '📖 小卖部', text: '你在小卖部买了一瓶冰饮料，站在树下喝完。上课铃响的时候，剩下的半瓶还没喝完，只能拎回教室。', journal: '· 课间：小卖部冰饮料' },
  { label: '去走廊上和隔壁班的朋友打招呼', fx: { social: 3, study: -1 }, title: '📖 隔壁班串门', text: '你走到隔壁班门口，朋友正好出来。两个人靠着栏杆交换了几条不重要的消息，上课铃就响了。', journal: '· 课间：隔壁班串门' },
  { label: '去接杯热水，顺便看看走廊外的操场', fx: { sleep: 2, study: 1, social: 1 }, title: '📖 走廊接水', text: '你端着杯子走到饮水机前，热水器发出咕噜咕噜的声音。窗外操场上有人在上体育课。', journal: '· 课间：走廊接水' },
  { label: '把下节课要用的书提前翻一遍', fx: { study: 2, sleep: -2 }, title: '📖 提前预习', text: '你把下节课的内容扫了一遍，标出了两个看不懂的地方。上课的时候正好讲到。', journal: '· 课间：提前预习' },
  { label: '趴在窗台上，看楼下的篮球场', fx: { sleep: 2, social: -2 }, title: '📖 窗边发呆', text: '楼下有人正在打半场，球砸在水泥地上发出清脆的响声。你看了很久，直到上课铃响。', journal: '· 课间：窗边发呆' },
  { label: '踢毽子', fx: { sleep: 2, study: -1, social: 3 }, title: '📖 趴桌十分钟', text: '课间经常有几个同学围在一起踢毽子，你加入进去，用灵活的脚法赢得了阵阵喝彩。', journal: '· 课间：踢毽子' },
];

/* 午饭池：每次从里面随机抽 4 个 */
const LUNCH_OPTIONS = [
  { label: '食堂正常吃饭，回宿舍午休', fx: { sleep: 3, social: -1 }, title: '🍚 吃饭午休', text: '你排了十分钟的队，打了一份两荤一素，回宿舍躺下的时候还不到一点。醒来时天光正好。', journal: '· 午饭：吃饭午休' },
  { label: '快速吃完饭留在教室刷题', fx: { study: 1, sleep: -2 }, title: '🍚 教室刷题', text: '你五分钟解决午饭，把错题本翻到第三页。教室里只有两三个人，安静得能听见笔尖划纸的声音。', journal: '· 午饭：教室刷题' },
  { label: '和同学结伴出校门附近探店', fx: { social: 3, sleep: -1, study: -1 }, available: () => dailyCanLeave(), title: '🍚 出校探店', text: '你们在校门口那家小馆子坐下，点了三样分着吃。回到教室的时候，身上还带着一股菜香味。', journal: '· 午饭：出校探店', onPick: () => { dailyUseLeavePass(); } },
  { label: '和同桌去食堂二楼吃饭', fx: { social: 3, sleep: -2, study: -1 }, title: '🍚 食堂二楼', text: '你们爬上食堂二楼。人挺多，你们排了十分钟的队，你感觉二楼的饭菜和一楼差不多。', journal: '· 午饭：去食堂二楼吃饭' },
  { label: '点外卖带回宿舍吃', fx: { sleep: 2, social: -1, study: -1 }, title: '🍚 点外卖', text: '你把外卖带回宿舍，边吃边看手机。到点午休铃响，饭刚好吃完。', journal: '· 午饭：点外卖' },
  { label: '和几个同学拼桌，点不同的菜分着吃', fx: { social: 3, sleep: -1 }, title: '🍚 拼桌分享', text: '四个人各点一样，盘子摆了一圈。谁都没吃饱，但谁都很开心。', journal: '· 午饭：拼桌分享' },
  { label: '趴在课桌上眯一会儿', fx: { sleep: 3, study: -1, social: -1 }, title: '🍚 趴桌午休', text: '你把外套叠起来当枕头，胳膊有点麻，但睡得很沉。醒来时脸上印了一道衣服褶子。', journal: '· 午饭：趴桌午休' },
  { label: '去图书馆，随便翻翻杂志', fx: { study: 1, sleep: 1, social: -1 }, title: '🍚 图书馆翻杂志', text: '图书馆中午人很少，你在期刊架前站了很久，翻完了一本讲旅行的杂志。', journal: '· 午饭：图书馆翻杂志' },
];

/* 放学池：每次从里面随机抽 4 个 */
const AFTERNOON_OPTIONS = [
  { label: '去操场打球 / 跑步', fx: { sleep: 2, study: 1 }, title: '🌇 操场', text: '你跑了三圈，又在球场投了十几个球。回教室的时候浑身是汗，但脑子空空的，很舒服。', journal: '· 放学：操场打球跑步' },
  { label: '留在教室写作业，提前完成晚修任务', fx: { study: 1, sleep: -1, social: -1 }, title: '🌇 提前写作业', text: '你把数学和英语的作业都清了。晚修的时候别人还在赶，你已经翻到了下一章。', journal: '· 放学：提前完成晚修任务' },
  { label: '去图书馆看书', fx: { social: -1, study: 1, sleep: -1 }, title: '🌇 图书馆', text: '图书馆人不少，你在书架间流连，看了几本有意思的书，一直到晚修铃快响的时候才离开。', journal: '· 放学：图书馆' },
  { label: '逛校园，去操场和绿瓦楼附近散步', fx: {}, resolve: () => {
      const k = pick(['sleep', 'social', 'study']);
      const lab = { sleep: '睡眠', social: '社交', study: '学识' }[k];
      const clue = pick(DAILY_LORE_CLUES);
      S.flags.schoolLore = (S.flags.schoolLore || 0) + 1;
      const n = S.flags.schoolLore;
      return {
        fx: { [k]: 3 },
        kind: 'daily',
        title: '🏛️ 校史秘闻线索',
        text: `${clue}\n\n（${lab} +3）`,
        journal: `· 校史秘闻线索 ${n}：${lab} +3`,
        onPick: () => {
          if (n >= DAILY_LORE_NEED && !dailyMilestones()['校史秘闻']) {
            dailyMilestones()['校史秘闻'] = true;
            journal(`· 成就「校史秘闻」：集齐 ${DAILY_LORE_NEED} 条校史线索`);
          }
        },
      };
    } },
  { label: '在饭堂慢慢吃饭，和同学唠嗑', fx: { social: 1, study: -1 }, title: '🌇 饭堂唠嗑', text: '你们端着盘子找了个角落坐下，一顿饭吃了一个小时。聊的都是些没什么用的事，但很解压。', journal: '· 放学：饭堂唠嗑' },
  { label: '去小卖部买点零食，靠着栏杆慢慢吃', fx: { sleep: 1, social: 1, study: -1 }, title: '🌇 台阶上吃零食', text: '你买了一包薯片和一盒牛奶，倚在教室外的栏杆上慢慢吃。天还没黑，景色很好，风也舒服。', journal: '· 放学：吃零食' },
  { label: '去音乐教室，弹一会儿钢琴', fx: { social: 2, sleep: 1, study: -1 }, title: '🌇 音乐教室', text: '音乐教室没人，你掀开琴盖弹了一会儿。手生了不少，但琴声在空旷的教室里很好听。', journal: '· 放学：音乐教室弹琴' },
  { label: '和同桌去操场看夕阳', fx: { social: 2, sleep: 1 }, title: '🌇 操场看夕阳', text: '你们坐在看台上，看着太阳一点一点沉到天桥后面。谁也没提作业的事。', journal: '· 放学：操场看夕阳' },
];

/* 晚修后池：每次从里面随机抽 4 个 */
const NIGHT_OPTIONS = [
  { label: '快速洗漱，早点上床休息', fx: { sleep: 3, social: -1, study: -1 }, resolve: () => (chance(0.3)
    ? { fx: {}, kind: 'daily', title: '🌙 睡不着', text: '你十点半就躺下了，可脑子一直在转——白天那道题、明天要交的作业、还有同桌随口说的一句话。翻来覆去到快十二点才迷迷糊糊睡过去。', journal: '· 晚修后：失眠（属性不变）' }
    : { fx: { sleep: 4, social: -1, study: -1 }, kind: 'daily', title: '🌙 睡了个好觉', text: '你抢到了洗澡位，十点四十就上了床。宿舍里还在小声聊天，你已经睡着了。', journal: '· 晚修后：早睡' }) },
  { label: '继续在台灯下刷题', fx: { study: 2, sleep: -4 }, title: '🌙 台灯下的两小时', text: '你把台灯调到最暗一档，趴在被子里做了两套选择题。室友翻身的时候，你看了眼时间：快一点了。', journal: '· 晚修后：台灯刷题' },
  { label: '和室友聊会儿天再睡', fx: { social: 2, sleep: -1, study: -2 }, title: '🌙 宿舍夜话', text: '熄灯了，但宿舍里没人睡。你们压低声音从游戏聊到喜欢的大学，一直到楼下传来巡夜的脚步声。', journal: '· 晚修后：宿舍夜话' },
  { label: '靠在床头听一会儿歌', fx: { sleep: 2, social: -1, study: -1 }, title: '🌙 听歌', text: '你把耳机塞进耳朵，单曲循环了一首歌。歌词没记住，但旋律让这一天的疲惫慢慢落下去。', journal: '· 晚修后：听歌' },
  { label: '跑去食堂吃夜宵', fx: { sleep: 3, social: -1, study: -1 }, title: '🌙 夜宵', text: '晚修铃一响，你弹出座位，冲向饭堂，只为了嗦一碗美味的汤粉，夜宵的汤粉比早餐香得多，热辣的汤粉下肚，藏在身体里空调冷气无影无踪。', journal: '· 晚修后：夜宵' },
  { label: '去操场走一走', fx: { sleep: 1, social: 1, study: -1 }, title: '🌙 走一走', text: '夜晚的操场没几盏灯，光线暗淡，氛围很暧昧，你看到几对情侣，手牵着手，边散步边说悄悄话，环顾四周，好像就你是一个人，你叹了口气，调转脚步向宿舍走去。', journal: '· 晚修后：散步' },
  { label: '留在教室整理错题', fx: { sleep: 2, social: -1, study: 2 }, title: '🌙 整理错题', text: '晚修结束后距离教室断电还有几十分钟时间，同学陆续离开，你坐在座位上没有动，多用功一点，未来会更好吧，你这样想。', journal: '· 晚修后：整理错题' },
];

/* 早读池：每次从里面随机抽 3 个 */
const MORNING_OPTIONS = [
  { label: '认真晨读背书', fx: { study: 1, sleep: -1 }, title: '🌤️ 晨读', text: '你把要背的段落拆成三小段，来回过了两遍。早读结束时，那几行字终于顺下来了。', journal: '· 早读：认真晨读' },
  { label: '悄悄补昨晚没写完的作业', fx: { study: 1, sleep: -1 }, title: '🌤️ 补作业', text: '你把作业本压在语文书下面，一行一行往下抄。老师从后门走过的时候，你正好翻到下一页。', journal: '· 早读：补作业' },
  { label: '趴在桌上补觉', fx: { sleep: 2, study: -1 }, resolve: () => (chance(0.25)
    ? { fx: { sleep: 1, study: -1, social: -1 }, kind: 'daily', title: '🌤️ 被老师点名', text: '你刚把脸埋进胳膊，老师就站到了窗边。你被叫起来站到早读结束，睡意全没了。', journal: '· 早读补觉：被老师点名' }
    : { fx: { sleep: 2, study: -1 }, kind: 'daily', title: '🌤️ 二十分钟回血', text: '你把书立起来挡住脸，二十分钟后满血复活。同桌帮你盯了两次老师。', journal: '· 早读：趴桌补觉' }) },
  { label: '走廊和同学闲聊', fx: { social: 2, study: -1 }, title: '🌤️ 走廊闲话', text: '你们靠在栏杆上，从昨晚的球赛聊到隔壁班的八卦。早读铃响的时候谁都没背进一个字。', journal: '· 早读：走廊闲聊' },
  { label: '去小卖部买早餐', fx: { sleep: 1, social: 1, study: -1 }, title: '🌤️ 买早餐', text: '你冲到小卖部，抢到了最后一个莞中大包。带回教室的时候，早读铃正好响。', journal: '· 早读：买早餐' },
  { label: '抄同桌的英语作文', fx: { study: 1, sleep: -2 }, title: '🌤️ 抄作文', text: '你把同桌的作文摊在英语书下面，一行一行往下抄。中途改了两个句子，怕被发现。', journal: '· 早读：抄作业' },
  { label: '在走廊上背政治', fx: { study: 2, social: -1, sleep: -1 }, title: '🌤️ 背政治', text: '你靠在走廊的窗边，把「主要矛盾」和「基本矛盾」来回背了三遍，终于分清楚了。', journal: '· 早读：背政治' },
  { label: '看窗外发呆', fx: { sleep: 1, study: -1, social: -1 }, title: '🌤️ 发呆', text: '你看着操场上的树被风吹，什么都没想。早读铃响的时候才发现一页都没翻。', journal: '· 早读：发呆' },
  { label: '和前排同学对昨天数学题', fx: { study: 1, social: 1, sleep: -1 }, title: '🌤️ 对题', text: '你们对到第三题就吵起来了，最后发现两个人都抄错了题干。', journal: '· 早读：对数学题' },
  { label: '把今天的课程表抄到桌角', fx: { study: 1, sleep: -1, social: 1 }, title: '🌤️ 抄课表', text: '你把今天的课表抄在桌角的便利贴上。抄完之后，一天的节奏好像有了形状。', journal: '· 早读：抄课表' },
];
/* 晚修池：每次从里面随机抽 3 个 */
const EVENING_OPTIONS = [
  { label: '专心刷题、整理错题', fx: { study: 2, social: -1, sleep: -1 }, resolve: () => (chance(0.4)
    ? { fx: {}, kind: 'daily', title: '✍️ 遇到难题，心态崩了', text: '第三道大题你算了四遍，答案一次都没对上。你把笔一扔，趴下去盯着桌角发呆。', journal: '· 晚修：心态崩了' }
    : { fx: { study: 3, social: -1 }, kind: 'daily', title: '✍️ 两节晚修的收获', text: '你把错题本翻到最前面，一道一道重新过。下课铃响的时候，那几类题终于连成了一条线。', journal: '· 晚修：专心刷题' }) },
  { label: '写一会作业就和同桌传纸条', fx: { social: 2, study: -3, sleep: -1 }, title: '✍️ 传纸条', text: '纸条在两张桌子之间来回折了七八次，作业只推进了两行。', journal: '· 晚修：传纸条' },
  { label: '偷偷看课外书', fx: { social: 2, study: -1, sleep: -1 }, title: '✍️ 课桌下的课外书', text: '你把小说夹在课本里，一行一行往下看。老师的影子在窗上晃了两次，你都及时合上了。', journal: '· 晚修：看课外书' },
  { label: '遇到难题发呆摆烂', fx: { study: -3, social: -2, sleep: -1 }, title: '✍️ 发呆摆烂', text: '你把笔转了三圈，然后什么也没写。窗外有虫子在叫。', journal: '· 晚修：发呆摆烂' },
  { label: '整理今天的错题', fx: { study: 3, sleep: -1 }, title: '✍️ 整理错题', text: '你把今天所有做错的题抄进错题本，用红笔在旁边标了「易错」。写完的时候，晚修正好过半。', journal: '· 晚修：整理错题' },
  { label: '把数学卷子后半部分做完', fx: { study: 3, sleep: -2 }, title: '✍️ 做完卷子', text: '你把早上没做完的卷子翻出来，硬是把最后一道大题啃了下来。中间卡了三次。', journal: '· 晚修：做完卷子' },
  { label: '和同桌小声聊明天的事', fx: { social: 3, study: -2 }, title: '✍️ 悄悄聊天', text: '你们压低声音聊了很久，从明天午饭吃什么聊到暑假去哪。值班老师走过来的时候，你们都低头看卷子。', journal: '· 晚修：悄悄聊天' },
  { label: '看一篇语文阅读', fx: { study: 1, sleep: 1 }, title: '✍️ 看阅读', text: '你把一篇散文读完，在旁边的空白处写了一小段感想。写完觉得还挺好，合上书，什么都没记住。', journal: '· 晚修：看阅读' },
  { label: '背英语单词', fx: { study: 2, sleep: -2 }, title: '✍️ 背单词', text: '你从 aband 开始背，背到 abandon 的时候，正好想放弃。最后撑到了 C。', journal: '· 晚修：背单词' },
  { label: '把明天的作业先做一半', fx: { study: 2, sleep: -1 }, title: '✍️ 提前做作业', text: '你把明天要交的数学和物理各做了一半。明天晚修的时候，你会轻松很多。', journal: '· 晚修：提前做作业' },
];
/* 课外活动池：25% 概率额外混入一个，覆盖运动 / 吃饭 / 艺术 / 社团 */
const DAILY_ACTIVITY_POOL = [
  // 运动
  { label: '去操场跑两圈', slots: ['morning','break','lunch','afternoon'], fx: { sleep: 2, social: 1, study: -1 }, title: '🏃 操场跑圈', text: '你沿着跑道慢跑了两圈，操场上还有几个人在散步。风吹过来的时候，很舒服。', journal: '· 活动：操场跑圈' },
  { label: '和同学打一场乒乓球', slots: ['break','lunch','afternoon'], fx: { social: 3, sleep: -1 }, title: '🏓 打乒乓球', text: '你和球友打满 11 球，最后 12:10 险胜。两个人都出了一身汗。', journal: '· 活动：打乒乓球' },
  { label: '去体育馆打羽毛球', slots: ['morning','break','lunch','afternoon'], fx: { social: 2, sleep: 1 }, title: '🏸 打羽毛球', text: '你抢到最后一个场地，打了半小时。中间有一次救球摔倒了，但球接住了。', journal: '· 活动：打羽毛球' },
  { label: '打篮球', slots: ['morning','break','lunch','afternoon'], fx: { social: 3, sleep: 1 }, title: '🏀 打篮球', text: '你在半场投了几个球，手感一般。后来换了个人上来，你下场坐在旁边看。', journal: '· 活动：打篮球' },
  { label: '沿着校园走一圈', slots: ['morning','break','lunch','afternoon'], fx: { sleep: 2, social: -1, study: 1 }, title: '🚶 校园散步', text: '你从教学楼走到操场，再从操场走到图书馆。走到一半，碰到了以前的初中同学。', journal: '· 活动：校园散步' },
  // 吃饭
  { label: '去小卖部买冰饮料', slots: ['break','lunch','afternoon','evening'], fx: { social: 1, sleep: 1 }, title: '🥤 冰饮料', text: '你买了一瓶冰饮料，站在树下喝完。上课铃响的时候，剩下的半瓶还拎在手里。', journal: '· 活动：冰饮料' },
  { label: '去食堂二楼吃夜宵', slots: ['evening','night'], fx: { social: 3, sleep: -1 }, title: '🍜 夜宵', text: '你和几个同学约在食堂二楼，一人点了一碗汤粉。吃完回宿舍，路上没什么人。', journal: '· 活动：夜宵' },
  { label: '在小卖部买零食', slots: ['break','lunch','afternoon','evening'], fx: { sleep: 1, study: -1, social: 1 }, title: '🍪 买零食', text: '你买了一包薯片和一瓶牛奶，站在走廊上慢慢吃。', journal: '· 活动：买零食' },
  { label: '去食堂打一份新出的菜', slots: ['lunch','afternoon','evening'], fx: { social: 2, study: -1 }, title: '🍲 试试新菜', text: '窗口新出了一个菜，你点了一份。味道一般，但比昨天的好。', journal: '· 活动：食堂新菜' },
  // 艺术 / 社团
  { label: '去弹钢琴', slots: ['break','lunch','afternoon','evening'], fx: { sleep: 2, social: 1, study: -1 }, title: '🎹 弹钢琴', text: '音乐教室没人，你掀开琴盖弹了一会儿。手生了不少，但琴声在空旷的教室里很好听。', journal: '· 活动：弹钢琴' },
  { label: '去美术教室画画', slots: ['break','lunch','afternoon'], fx: { sleep: 2, study: -1, social: 1 }, title: '🎨 画画', text: '你在美术教室借了一支铅笔，画了半小时速写。画的是窗外的树。', journal: '· 活动：画画' },
  { label: '去图书馆翻杂志', slots: ['break','afternoon','evening'], fx: { study: 1, sleep: 1, social: -1 }, title: '📖 翻杂志', text: '你在期刊架前站了很久，翻完了一本讲旅行的杂志。', journal: '· 活动：翻杂志' },
  { label: '去社团活动室', slots: ['break','lunch','afternoon'], fx: { social: 3, sleep: -1 }, title: '🎭 社团', text: '你去社团活动室坐了一会儿，和几个人聊了聊最近的社团活动。', journal: '· 活动：社团' },
  { label: '去广播站', slots: ['break','lunch','afternoon'], fx: { social: 3, study: 1, sleep: -2 }, title: '🎤 广播站', text: '你去广播站念了一段稿子。声音有点抖，但播完之后还挺好。', journal: '· 活动：广播站' },
  // 学术
  { label: '去办公室找老师问问题', fx: { study: 3, sleep: -2 }, title: '📚 办公室答疑', text: '你去办公室问了一道一直没想明白的题。老师讲完，你终于懂了。', journal: '· 活动：办公室答疑' },
  { label: '去图书馆自习', fx: { study: 2, sleep: -1, social: -1 }, title: '📚 图书馆自习', text: '你在图书馆找了个靠窗的位置坐下来，安安静静写了两页作业。', journal: '· 活动：图书馆自习' },
    // ===== 教室电脑 =====
  { label: '用教室电脑玩扫雷', fx: { sleep: 1, social: 1, study: -1 }, title: '💻 教室扫雷', text: '你趁老师不在打开了教室电脑，从开始菜单里翻出了扫雷。第一局三步就踩雷了，第二局撑到了 30 秒。', journal: '· 活动：教室电脑扫雷' },
  { label: '用教室电脑放电影', fx: { sleep: 1, social: 2, study: -2 }, title: '💻 教室电影', text: '几个同学把窗帘拉上，用投影放了一部老片子。看到一半有人推门，全班瞬间把屏幕切回 PPT。', journal: '· 活动：教室电脑放电影' },
  { label: '用教室电脑偷偷看小说', fx: { sleep: 1, social: -1, study: 1 }, title: '💻 教室看小说', text: '你在教室电脑上打开了一个在线阅读网站，边看边盯着门口。一章看完，才发现上课铃快响了。', journal: '· 活动：教室电脑看小说' },
  { label: '用教室电脑查资料', fx: { study: 3, sleep: -1 }, title: '💻 查大学资料', text: '你在教室电脑上搜了几所目标大学的官网，把专业介绍一条一条抄进笔记本。查完之后，目标更具体了。', journal: '· 活动：查大学资料' },
  { label: '用教室电脑打 4399', fx: { social: 2, sleep: -1, study: -2 }, title: '💻 4399', text: '你和同桌在教室电脑上打开了一个老网站。玩了十分钟，被班主任从窗外看了一眼，赶紧切成课件。', journal: '· 活动：教室电脑 4399' },

  // ===== 出校玩 =====
  { label: '中午溜出校门吃碗面', fx: { sleep: 1, social: 2, study: -1 }, title: '🍜 出校吃面', text: '你和同桌趁着午休溜出校门，在校门口那家面馆各点了一碗。回校的时候，门卫正好在打瞌睡。', journal: '· 活动：溜出校门吃面' },
  { label: '放学后去校门口奶茶店', fx: { social: 3, sleep: 1, study: -1 }, title: '🧋 奶茶店', text: '你们在奶茶店坐了很久，聊的都是和学习无关的事。走的时候，杯子里还剩半杯冰。', journal: '· 活动：校门口奶茶店' },
  { label: '和同学去学校后面的小巷', fx: { social: 3, sleep: 1, study: -2 }, title: '🌆 后面的巷子', text: '巷子不长，有几家小店。你们在一家文具店门口站了一会儿，什么也没买就走了。', journal: '· 活动：学校后面的巷子' },

  // ===== 高三专属 =====
  { label: '晚修偷偷和同桌下五子棋', fx: { social: 2, sleep: -1, study: -2 }, title: '♟️ 五子棋', text: '你们在草稿纸背面画了个棋盘，用铅笔头当棋子。下到一半，值班老师从窗口探进半个身子，两个人同时把纸翻过去。', journal: '· 活动：晚修下五子棋' },
  { label: '在教室后面用课本搭挡板打牌', fx: { social: 4, sleep: -1, study: -3 }, title: '🃏 教室打牌', text: '几个人围在教室后面，用立起来的课本搭了个"掩体"。每打完一局都要重新摆一次挡板。', journal: '· 活动：教室打牌' },
  { label: '集体翘掉一节自习去操场', fx: { social: 5, sleep: 1, study: -3 }, title: '🏃 翘自习', text: '你们几个趁课间溜出教室，跑到操场边的看台上坐了一节课。风很大，聊了很多。回来的时候没人问你们去哪了。', journal: '· 活动：集体翘自习' },
  { label: '跑到天台吃一顿带进校的外卖', fx: { social: 4, sleep: -1, study: -2 }, title: '🍱 天台外卖', text: '你们约好在天台碰头，一边吃一边看着操场。吃到一半，楼下有人在喊谁的名字。', journal: '· 活动：天台外卖' },
  { label: '在教室后墙涂一张班级签名板', fx: { social: 5, sleep: -1, study: -1 }, title: '✍️ 签名板', text: '有人搬来一大张白纸贴在教室后墙，全班轮流签名、写留言。写到最后，连平时最不爱说话的人也留了一行。', journal: '· 活动：班级签名板' },
  { label: '和几个同学在操场上放歌', fx: { social: 5, sleep: 1, study: -2 }, title: '🎵 操场放歌', text: '有人拿出蓝牙音箱，几个人坐在看台上跟着唱。唱到第三首，巡夜的老师过来了，你们把音箱关掉，谁也没走。', journal: '· 活动：操场放歌' },
];

const DAILY_SLOTS = [
  {
    key: 'morning',
    title: '🌤️ 早读课前',
    hint: '早读铃前的那几分钟，你打算怎么用？',
    body: '早读铃还有五分钟。教室里一半人在背书，一半人还趴在桌上补昨晚的觉。走廊上有人端着豆浆快步走过，窗玻璃上还留着一层水汽。',
    options: [
      {
        label: '认真晨读背书', fx: { study: 1, sleep: -1 },
        title: '🌤️ 晨读',
        text: '你把要背的段落拆成三小段，来回过了两遍。早读结束时，那几行字终于顺下来了。',
        journal: '· 早读：认真晨读',
      },
      {
        label: '悄悄补昨晚没写完的作业', fx: { study: 1, sleep: -1 },
        title: '🌤️ 补作业',
        text: '你把作业本压在语文书下面，一行一行往下抄。老师从后门走过的时候，你正好翻到下一页。',
        journal: '· 早读：补作业',
      },
      {
        label: '趴在桌上补觉', fx: { sleep: 2, study: -1 },
        resolve: () => (chance(0.25)
          ? { fx: { sleep: 1, study: -1, social: -1 }, kind: 'daily', title: '🌤️ 被值班老师点名', text: '你刚把脸埋进胳膊，值班老师就站到了窗边。你被叫起来站到早读结束，睡意全没了，前排还回头看了一眼。', journal: '· 早读补觉：被值班老师点名' }
          : { fx: { sleep: 2, study: -1 }, kind: 'daily', title: '🌤️ 二十分钟回血', text: '你把书立起来挡住脸，二十分钟后满血复活。同桌帮你盯了两次老师。', journal: '· 早读：趴桌补觉' }),
      },
      {
        label: '走廊和同学闲聊', fx: { social: 2, study: -1 },
        title: '🌤️ 走廊闲话',
        text: '你们靠在栏杆上，从昨晚的球赛聊到隔壁班的八卦。早读铃响的时候谁都没背进一个字，但心情好了不少。',
        journal: '· 早读：走廊闲聊',
      },
    ],
  },
  {
    key: 'break',
    title: '📖 课间',
    hint: '十分钟，够做一件小事。',
    body: '下课铃响，十分钟。有人冲向厕所，有人趴下就睡，有人抱着习题往办公室跑。',
    options: [
      {
        label: '趴桌小憩', fx: { sleep: 2, study: -1, social: -1 },
        title: '📖 趴桌十分钟',
        text: '你把外套垫在胳膊下，闭眼就是十分钟。上课铃响时，同桌推了你一把。',
        journal: '· 课间：趴桌小憩',
      },
      {
        label: '拿习题去办公室找老师答疑', fx: { study: 3, sleep: -3 },
        title: '📖 办公室答疑',
        text: '办公室里排了三个人。你把攒了两天的题一口气问完，老师顺手在你本子上画了个圈：「这个思路对了。」',
        journal: '· 课间：办公室答疑',
      },
      {
        label: '和好友去操场走走', fx: { social: 2, sleep: -1 },
        title: '📖 操场走一圈',
        text: '你们绕操场走了一圈，在小卖部买了两瓶饮料。回来的时候出了些汗，上课铃刚好响。',
        journal: '· 课间：操场走一圈',
      },
      {
        label: '跑去地下室打乒乓球', fx: { social: 1, sleep: -1 },
        title: '📖 打乒乓球',
        text: '你在负1层找到球友，和他打了几局乒乓球，期间你一用力，把球打上了天花板的夹层里。',
        journal: '· 课间：跑去地下室打乒乓球',
      },
      {
        label: '在教室和同桌聊天打闹', fx: { social: 2, sleep: -1, study: -1 },
        resolve: () => (chance(0.3)
          ? { fx: { sleep: -1 }, kind: 'daily', title: '📖 被班干部提醒安静', text: '你们笑得正响，班干部敲了敲你的桌子：「小声点，隔壁班都听见了。」你收敛了两分钟，又没忍住。', journal: '· 课间打闹：被班干部提醒安静' }
          : { fx: { social: 2, sleep: -1 }, kind: 'daily', title: '📖 聊了一整节下课', text: '你们从月考聊到暑假，笑得前排都回头。十分钟过得比一节课还快。', journal: '· 课间：聊天打闹' }),
      },
      {
        label: '去小卖部买冰饮料', fx: { social: 1, study: -1 },
        title: '📖 小卖部',
        text: '你在小卖部买了一瓶冰饮料，站在树下喝完。上课铃响的时候，剩下的半瓶还没喝完，只能拎回教室。',
        journal: '· 课间：小卖部冰饮料',
      },
      {
        label: '去走廊上和隔壁班的朋友打招呼', fx: { social: 2, study: -1 },
        title: '📖 隔壁班串门',
        text: '你走到隔壁班门口，朋友正好出来。两个人靠着栏杆交换了几条不重要的消息，上课铃就响了。',
        journal: '· 课间：隔壁班串门',
      },
    ],
  },
  {
    key: 'lunch',
    title: '🍚 午饭 & 午休',
    hint: '中午是全天最自由的一段。',
    body: '第五节课的下课铃一响，楼道里全是脚步声。饭堂的队伍已经排到了桌子那。许多同学走出校门，去校外寻觅美食。',
    options: [
      {
        label: '食堂正常吃饭，回宿舍午休', fx: { sleep: 3,  social: -1 },
        title: '🍚 吃饭午休',
        text: '你排了十分钟的队，打了一份两荤一素，回宿舍躺下的时候还不到一点。醒来时天光正好。',
        journal: '· 午饭：吃饭午休',
      },
      {
        label: '快速吃完饭留在教室刷题', fx: { study: 1, sleep: -2 },
        title: '🍚 教室刷题',
        text: '你五分钟解决午饭，把错题本翻到第三页。教室里只有两三个人，安静得能听见笔尖划纸的声音。',
        journal: '· 午饭：教室刷题',
      },
      {
        label: '和同学结伴出校门附近探店', fx: { social: 3, sleep: -1, study: -1 },
        available: () => dailyCanLeave(),
        title: '🍚 出校探店',
        text: '你们在校门口那家小馆子坐下，点了三样分着吃。回到教室的时候，身上还带着一股菜香味。',
        journal: '· 午饭：出校探店',
        onPick: () => { dailyUseLeavePass(); },
      },
      {
        label: '和同桌去食堂二楼吃饭', fx: { social: 3, sleep: -2, study: -1 },
        title: '🍚 食堂二楼',
        text: '你们爬上食堂二楼。人挺多，你们排了十分钟的队，你感觉二楼的饭菜和一楼差不多。',
        journal: '· 午饭：去食堂二楼吃饭',
      },
      {
        label: '点外卖带回宿舍吃', fx: { sleep: 2, social: -1 ,study: -1},
        title: '🍚 点外卖',
        text: '你把外卖带回宿舍，边吃边看手机。到点午休铃响，饭刚好吃完。',
        journal: '· 午饭：点外卖',
      },
    ],
  },
  {
    key: 'afternoon',
    title: '🌇 放学之后',
    hint: '晚修前还有一段空档。',
    body: '下午的课结束，晚修还有一段时间。操场上有跑步的，教室里有写作业的，图书馆亮着灯，不时有歌声从男生宿舍传来。',
    options: [
      {
        label: '去操场打球 / 跑步', fx: { sleep: 2, study: -1 },
        title: '🌇 操场',
        text: '你跑了三圈，又在球场投了十几个球。回教室的时候浑身是汗，但脑子空空的，很舒服。',
        journal: '· 放学：操场打球跑步',
      },
      {
        label: '留在教室写作业，提前完成晚修任务', fx: { study: 1, sleep: -1, social: -1 },
        title: '🌇 提前写作业',
        text: '你把数学和英语的作业都清了。晚修的时候别人还在赶，你已经翻到了下一章。',
        journal: '· 放学：提前完成晚修任务',
      },
      {
        label: '去图书馆看书', fx: { social: -1, study: 1, sleep:-1},
        title: '🌇 图书馆',
        text: '图书馆人不少，你在书架间流连，看了几本有意思的书，一直到晚修铃快响的时候才离开。',
        journal: '· 放学：图书馆',
      },
      {
        label: '逛校园，去操场和绿瓦楼附近散步', fx: {},
        resolve: () => {
          const k = pick(['sleep', 'social', 'study']);
          const lab = { sleep: '睡眠', social: '社交', study: '学识' }[k];
          const clue = pick(DAILY_LORE_CLUES);
          S.flags.schoolLore = (S.flags.schoolLore || 0) + 1;
          const n = S.flags.schoolLore;
          return {
            fx: { [k]: 3 },
            kind: 'daily',
            title: '🏛️ 校史秘闻线索',
            text: `${clue}\n\n（${lab} +3）`,
            journal: `· 校史秘闻线索 ${n}：${lab} +3`,
            onPick: () => {
              if (n >= DAILY_LORE_NEED && !dailyMilestones()['校史秘闻']) {
                dailyMilestones()['校史秘闻'] = true;
                journal(`· 成就「校史秘闻」：集齐 ${DAILY_LORE_NEED} 条校史线索`);
              }
            },
          };
        },
      },
      {
        label: '在饭堂慢慢吃饭，和同学唠嗑', fx: { social: 1, study: -1 },
        title: '🌇 饭堂唠嗑',
        text: '你们端着盘子找了个角落坐下，一顿饭吃了一个小时。聊的都是些没什么用的事，但很解压。',
        journal: '· 放学：饭堂唠嗑',
      },
    ],
  },
  {
    key: 'evening',
    title: '✍️ 晚修时段',
    hint: '两节晚修，教室里很安静。',
    body: '晚修铃响过，教室里只剩翻书声和笔尖声。值班老师会在走廊上来回走两趟，玻璃窗上偶尔会映出一个影子。',
    options: [
      {
        label: '专心刷题、整理错题', fx: { study: 2, social: -1, sleep: -1},
        resolve: () => (chance(0.4)
          ? { fx: {}, kind: 'daily', title: '✍️ 遇到难题，心态崩了', text: '第三道大题你算了四遍，答案一次都没对上。你把笔一扔，趴下去盯着桌角发呆，直到下课铃响才回过神——这两节晚修等于没上。', journal: '· 晚修：遇到难题心态崩了（无加成）' }
          : { fx: { study: 3, social: -1 }, kind: 'daily', title: '✍️ 两节晚修的收获', text: '你把错题本翻到最前面，一道一道重新过。下课铃响的时候，那几类题的解法终于连成了一条线。', journal: '· 晚修：专心刷题整理错题' }),
      },
      {
        label: '写一会作业就和同桌传纸条', fx: { social: 2, study: -3, sleep: -1 },
        title: '✍️ 传纸条',
        text: '纸条在两张桌子之间来回折了七八次，内容从吐槽物理老师到明天午饭吃什么。作业只推进了两行。',
        journal: '· 晚修：和同桌传纸条',
      },
      {
        label: '偷偷看课外书', fx: { social: 2, study: -1 ,sleep: -1},
        title: '✍️ 课桌下的课外书',
        text: '你把小说夹在课本里，一行一行往下看。值班巡班老师的影子在窗上晃了两次，你都及时把书合上了。',
        journal: '· 晚修：偷偷看课外书',
      },
      {
        label: '遇到难题心态崩了，发呆摆烂', fx: {study: -3, social: -2, sleep: -1},
        title: '✍️ 发呆摆烂',
        text: '你把笔转了三圈，然后什么也没写。窗外有虫子在叫，你听着听着，两节晚修就过去了。',
        journal: '· 晚修：发呆摆烂（无加成）',
      },
    ],
  },
  {
    key: 'night',
    title: '🌙 晚修结束，回宿舍',
    hint: '熄灯时间是固定的。',
    body: '晚修结束，宿舍楼下的灯还亮着。有人一路小跑回去抢洗澡位，有人慢慢走去食堂吃夜宵。熄灯时间是固定的，谁也躲不过。',
    options: [
      {
        label: '快速洗漱，早点上床休息', fx: { sleep: 3, social: -1, study: -1 },
        resolve: () => (chance(0.3)
          ? { fx: {}, kind: 'daily', title: '🌙 睡不着', text: '你十点半就躺下了，可脑子一直在转——白天那道题、明天要交的作业、还有同桌随口说的一句话。翻来覆去到快十二点才迷迷糊糊睡过去。', journal: '· 晚修后：失眠（属性不变）' }
          : { fx: { sleep: 4, social: -1, study: -1 }, kind: 'daily', title: '🌙 睡了个好觉', text: '你抢到了洗澡位，十点四十就上了床。宿舍里还在小声聊天，你已经睡着了。', journal: '· 晚修后：早睡' }),
      },
      {
        label: '继续在台灯下刷题', fx: { study: 1, sleep: -4 },
        title: '🌙 台灯下的两小时',
        text: '你把台灯调到最暗一档，趴在被子里做了两套选择题。室友翻身的时候，你看了眼时间：快一点了。',
        journal: '· 晚修后：台灯刷题',
      },
    ],
  },
  {
    key: 'weekend',
    title: '📅 周末放假',
    hint: '这一周攒下的东西，都在等你安排。',
    body: '周末。作业、想见的人、没睡够的觉，全堆在这两天里。',
    options: [
      {
        label: '在家埋头刷题备战月考', fx: { study: 2, sleep: -4 },
        title: '📅 周末刷题',
        text: '两天里你几乎没出过房间，写完的卷子摞了一小叠。周日下午收书包的时候，你有点说不出的踏实。',
        journal: '· 周末：埋头刷题',
      },
      {
        label: '约同学线下见面玩', fx: { social: 2, sleep: -2, study: -3},
        title: '📅 约同学出来',
        text: '你们在商场里逛了一下午，什么也没买，但笑了一路。回家的地铁上，你把作业忘得干干净净。',
        journal: '· 周末：约同学线下见面',
        onPick: () => { dailyGrantLeavePass(); },
      },
      {
        label: '宅在家里玩手机电脑', fx: { social: 2, study: -3, sleep: -2 },
        title: '📅 宅在家里',
        text: '你在学校没有玩手机，所以周末就在刷视频和打游戏中度过。',
        journal: '· 周末：宅在家里',
        onPick: () => { dailyGrantLeavePass(); },
      },
      {
        label: '好好睡一觉休息，出门逛街散心', fx: { sleep: 3, study: -1 },
        title: '📅 睡到自然醒',
        text: '你睡到中午才起，然后一个人出门走了很久。回来的时候天已经黑了，作业一个字没动，但整个人松了下来。',
        journal: '· 周末：睡觉逛街散心',
        onPick: () => { dailyGrantLeavePass(); },
      },
      {
        label: '和父母出门吃顿饭', fx: { sleep: 2, social: 2, study: -2 },
        title: '📅 陪家人吃饭',
        text: '你爸妈难得周末都在家，三个人去楼下那家小饭馆坐了坐。饭桌上聊的不是成绩，是最近哪条街新开了店。',
        journal: '· 周末：陪家人吃饭',
      },
      {
        label: '一个人在家整理房间、发呆', fx: { sleep: 1, study: -1, social: -1 },
        title: '📅 一个人在家',
        text: '你把书桌抽屉里的旧东西全翻出来看了一遍。作业推到大半天后才动了两页，但心里莫名安静。',
        journal: '· 周末：整理房间发呆',
      },
      {
        label: '去图书馆占座，做一整套卷子', fx: { study: 4, sleep: -3, social: -1 },
        title: '📅 图书馆占座',
        text: '你和几个同学约在图书馆，从早上坐到下午。一天下来做了两套理综，中间只出去吃了一碗面。',
        journal: '· 周末：图书馆做卷子',
      },
    ],
  },
];

// 随机小事件：日常随时触发（每轮 5% 概率）
const DAILY_RANDOM_EVENTS = [
  {
    title: '🎲 班主任安排你负责班级黑板报',
    body: '班主任在走廊上叫住你：「这期黑板报的主题是校庆，你来牵头吧。」说完就转身走了，没给你拒绝的时间。',
    options: [
      { label: '答应接下任务', fx: { social: 3, study: -1, sleep: -1}, title: '🎲 接下黑板报', text: '你拉了三个同学一起，利用课间把版面分了工。出刊那天，隔壁班的人特意过来看了两眼。', journal: '· 黑板报：接下任务' },
      { label: '委婉推辞', fx: {}, title: '🎲 推辞了黑板报', text: '你说最近作业有点多。班主任点点头：「那下次吧。」你说不清心里是松了口气还是有点失落。', journal: '· 黑板报：委婉推辞' },
    ],
  },
  {
    title: '🎲 同桌找你要笔记复习',
    body: '月考临近。同桌凑过来，声音压得很低：「你那本笔记……借我看看呗？就一晚上。」',
    options: [
      { label: '大方借给他', fx: { social: 3, study: -1 }, title: '🎲 借出笔记', text: '第二天早上，笔记本整整齐齐放在你桌上，里面还夹了一张便利贴：「你圈的重点真准，谢了。」', journal: '· 笔记：大方借出' },
      { label: '婉拒，自己还要用', fx: { social: -1, study: 1 }, title: '🎲 婉拒了', text: '你说自己晚上还要过一遍。同桌「哦」了一声，转回去翻自己的书。那天你没怎么分心，把整章都过完了。', journal: '· 笔记：婉拒（自己复习）' },
    ],
  },
  {
    title: '🎲 下楼梯的时候扭到脚',
    body: '晚修下课，楼道里人挤人。你下到一半，脚下一滑——',
    options: [
      {
        label: '扶住扶手，硬撑着走回去',
        fx: { sleep: -3, study: -2 },
        title: '🎲 扶着墙回宿舍',
        text: '你扶着扶手往下走，每一步都钻心地疼。回到宿舍，舍友帮你用冷水敷了一下。',
        journal: '· 楼梯扭脚（轻度）',
        onPick: () => { tryInjure('fall', 0.4); },
      },
      {
        label: '停下来，坐在台阶上缓一会儿',
        fx: { sleep: -1, social: -1 },
        title: '🎲 坐在台阶上',
        text: '你在台阶上坐了五分钟，等人都走光了，才慢慢站起来。好像没伤到，只是吓了一下。',
        journal: '· 楼梯扭脚（有惊无险）',
      },
    ],
  },
];

function dailyMilestones() {
  if (!S || !S.flags) return {};
  if (!S.flags.dailyMilestones || typeof S.flags.dailyMilestones !== 'object') S.flags.dailyMilestones = {};
  return S.flags.dailyMilestones;
}

// 走读生随时可以出校；住宿生需要一张「外出假」（周末出去时能拿到）
function dailyCanLeave() { return !isBoarder() || S.flags.dayPass === true; }
function dailyGrantLeavePass() {
  if (!isBoarder()) return;
  S.flags.dayPass = true;
  journal('· 拿到一张外出假（下次「出校探店」可用）');
}
function dailyUseLeavePass() {
  if (isBoarder() && S.flags.dayPass) {
    S.flags.dayPass = false;
    journal('· 用掉了外出假');
  }
}

// 各时段的出现权重。morning/evening/night/weekend 是常规时段；
// break/lunch/afternoon 权重压到 1/3，大约每 12 轮才出现一次。
const DAILY_SLOT_WEIGHTS = {
  morning: 2,
  break: 2,
  lunch: 2,
  afternoon: 2,
  evening: 3,
  night: 3,
  weekend: 3,
};

function dailySlotIndex() {
  if (!S) return 0;
  if (typeof S.dailyIdx !== 'number' || !isFinite(S.dailyIdx) || S.dailyIdx < 0) S.dailyIdx = 0;
  if (typeof S.phone !== 'boolean') S.phone = true;
  if (typeof S.flags.phoneChoiceSem !== 'number') S.flags.phoneChoiceSem = -1;
  if (typeof S.flags.promotionChecked !== 'boolean') S.flags.promotionChecked = false;
  if (typeof S.flags.militaryDone !== 'boolean') S.flags.militaryDone = true;
  if (typeof S.flags.pendingPromotion !== 'string') S.flags.pendingPromotion = null;
  if (!S.flags.loveMilestones || typeof S.flags.loveMilestones !== 'object') S.flags.loveMilestones = {};
  return S.dailyIdx % DAILY_SLOTS.length;
}

function advanceDailySlot() {
  if (!S) return;
  const total = DAILY_SLOTS.reduce((sum, slot) => sum + (DAILY_SLOT_WEIGHTS[slot.key] || 1), 0);
  let picked = S.dailyIdx;
  // 最多重抽 8 次，避免连续两次撞到同一个时段
  for (let tries = 0; tries < 8; tries++) {
    let r = Math.random() * total;
    for (let i = 0; i < DAILY_SLOTS.length; i++) {
      r -= (DAILY_SLOT_WEIGHTS[DAILY_SLOTS[i].key] || 1);
      if (r <= 0) { picked = i; break; }
    }
    if (picked !== S.dailyIdx) break;
  }
  S.dailyIdx = picked;
}

/* ================================================================
   毕业旅行 · 高考结束后
   志愿填报事件已触发（volunteerSeen）时，日常选项整体切换为旅行。
   ================================================================ */
/* ================================================================
   毕业季 · 高考后到出分前
   混合了本地庆祝（打球 / 火锅 / 唱K / 宿舍夜话）和毕业旅行。
   每次从池子里随机抽 4 个。
   ================================================================ */
const TRAVEL_DESTINATIONS = [
  // ===== 本地庆祝 =====
  {
    label: '和同学打最后一场球',
    fx: { sleep: 2, social: 7, study: -2 },
    title: '🏀 最后一场球',
    text: '你们约在操场打了整整一下午。有人穿着拖鞋来，有人穿着校服。抢篮板的时候摔了一跤，爬起来还是笑。\n\n天黑之后，谁都没提下次什么时候再打。因为都知道，下次就说不准了。',
    journal: '· 毕业季：最后一场球',
  },
  {
    label: '和同学去吃火锅',
    fx: { sleep: 1, social: 8, study: -2 },
    title: '🍲 火锅店',
    text: '包间里挤了十个人，锅底选了鸳鸯。有人点了一盘毛肚，三秒就没了。\n\n吃到一半，有人开始讲高一刚开学的事，讲到一半自己先笑了。这顿饭吃了三个小时，出门的时候，外面已经全黑。',
    journal: '· 毕业季：火锅',
  },
  {
    label: '在宿舍开一场唱K',
    fx: { sleep: -2, social: 8, study: -2 },
    title: '🎤 宿舍唱K',
    text: '有人拿手机放伴奏，有人把扫把当话筒。你们从周杰伦唱到陈奕迅，从高一班歌一直唱到毕业曲。\n\n唱到凌晨一点的时候，隔壁宿舍过来敲门：「我们也加入。」',
    journal: '· 毕业季：宿舍唱K',
  },
  {
    label: '和同桌回学校拍照',
    fx: { sleep: 2, social: 6, study: -1 },
    title: '📷 回学校拍照',
    text: '你们回到教室、走廊、操场、图书馆。每个地方都拍一张，手机相册里很快就堆了几百张。\n\n拍到最后，连当年被班主任骂过的那个后门也拍了一张。',
    journal: '· 毕业季：回学校拍照',
  },
  {
    label: '和几个朋友去 KTV 唱通宵',
    fx: { sleep: -3, social: 9, study: -2 },
    title: '🎶 通宵 KTV',
    text: '包厢里暗得看不清脸，只有屏幕是亮的。有人唱到破音，有人全程只切歌不唱。\n\n凌晨四点，你们走出 KTV，天还是黑的。有人提议去吃早餐，所有人都同意了。',
    journal: '· 毕业季：通宵 KTV',
  },
  {
    label: '和同学一起去看日出',
    fx: { sleep: -2, social: 7, study: -1 },
    title: '🌅 看日出',
    text: '凌晨四点起床，骑车去了江边。天从深蓝变成浅蓝，再变成橙色。\n\n太阳从桥后面升上来的时候，有人举起了手机，有人只是安静地看着。',
    journal: '· 毕业季：江边看日出',
  },
  {
    label: '和几个朋友去吃夜宵到凌晨',
    fx: { sleep: -2, social: 7, study: -1 },
    title: '🍢 夜宵摊',
    text: '路边的小摊子支了几张塑料桌。烤串、炒粉、冰啤酒，摆了一整桌。\n\n吃到凌晨两点，老板收摊了，你们才慢慢散场。谁也没打车，都说「走走醒醒酒」。',
    journal: '· 毕业季：夜宵到凌晨',
  },
  // ===== 旅行 =====
  {
    label: '去厦门看海',
    fx: { sleep: 4, social: 6, study: -2 },
    title: '🌊 厦门',
    text: '沿着环岛路骑车，海风咸咸的。你在沙滩上坐了很久，什么都没想。\n\n晚上和同行的同学吃了大排档，第二天醒来发现已经不记得昨夜的细节。',
    journal: '· 毕业旅行：厦门',
  },
  {
    label: '去成都吃火锅',
    fx: { sleep: 2, social: 7, study: -3 },
    title: '🍲 成都',
    text: '半夜十一点还在吃火锅，辣得眼泪直流，但谁都不肯停。\n\n第二天去了熊猫基地，看着那些动物躺着打滚，觉得几个月来第一次不用想任何事。',
    journal: '· 毕业旅行：成都',
  },
  {
    label: '去云南看洱海',
    fx: { sleep: 5, social: 5, study: -1 },
    title: '🏔️ 云南',
    text: '洱海的水比照片里更蓝。你们租了两辆电动车，沿着环海路慢慢骑。\n\n在双廊的一家咖啡馆坐了一下午，看着湖对面的大山发呆。没人催你写作业，也没人问你考得怎么样。',
    journal: '· 毕业旅行：云南',
  },
  {
    label: '去香港逛铜锣湾',
    fx: { sleep: 2, social: 6, study: -2 },
    title: '🌆 香港',
    text: '维港的风很大，天星小轮在两岸来回穿梭。你在诚品书店逛了很久，最后只买了一本很轻的散文。\n\n晚上去庙街吃夜宵，老板问你们是不是刚高考完，说「年轻人，接下来就自由啦」。',
    journal: '· 毕业旅行：香港',
  },
  {
    label: '去北京看故宫',
    fx: { sleep: 3, social: 5, study: 4 },
    title: '🏯 北京',
    text: '故宫比想象中大得多，走了六个小时也只逛了一半。\n\n从午门出来的时候，夕阳把琉璃瓦照得发亮。你在景山公园的山顶坐了很久，看着底下的整片红墙。',
    journal: '· 毕业旅行：北京',
  },
  {
    label: '去西安看兵马俑',
    fx: { sleep: 3, social: 5, study: 3 },
    title: '🏛️ 西安',
    text: '兵马俑坑比课本上的照片大得多。你站在一号坑边上，看着两千年前的士兵排成一列。\n\n回程路上，导游讲了半路的历史，你居然一句都没觉得无聊。',
    journal: '· 毕业旅行：西安',
  },
  // ===== 反向选项 =====
  {
    label: '哪都不去，在家躺一个暑假',
    fx: { sleep: 8, social: -3, study: -5 },
    title: '🛋️ 家',
    text: '你选择了在家躺平。前几天睡到中午，起来刷手机，晚上追剧到两三点。\n\n半个月后，你开始觉得这种生活其实也没那么香，但又不想动。',
    journal: '· 毕业季：在家躺平',
  },
];

function buildDailyEvent() {
  if (!S) return null;

  // 毕业典礼之后，日常选项整体换成毕业季
  if (S.flags && (S.flags.graduationSeen || S.flags.volunteerSeen)) {
    const options = shuffle(TRAVEL_DESTINATIONS).slice(0, 4).map((d) => ({
      label: d.label,
      fx: d.fx,
      kind: 'daily',
      title: d.title,
      text: d.text,
      journal: d.journal,
    }));
    return {
      t: 'choice',
      kicker: '🎉 毕业季',
      hint: '高考结束了，想怎么庆祝都行。',
      moduleClass: 'daily-choice-module',
      intro: {
        kind: 'daily',
        title: '🎉 毕业季',
        body: '成绩还没出来。几个月的紧绷突然松开——想做什么都可以了。',
      },
      options,
    };
  }

  const slot = DAILY_SLOTS[dailySlotIndex()];
  advanceDailySlot();

  // 每个时段从对应的池子里抽 3 个
  let rawOptions;
  if (slot.key === 'morning') rawOptions = shuffle(MORNING_OPTIONS).slice(0, 3);
  else if (slot.key === 'break') rawOptions = shuffle(BREAK_OPTIONS).slice(0, 3);
  else if (slot.key === 'lunch') rawOptions = shuffle(LUNCH_OPTIONS).slice(0, 3);
  else if (slot.key === 'afternoon') rawOptions = shuffle(AFTERNOON_OPTIONS).slice(0, 3);
  else if (slot.key === 'evening') rawOptions = shuffle(EVENING_OPTIONS).slice(0, 3);
  else if (slot.key === 'night') rawOptions = shuffle(NIGHT_OPTIONS).slice(0, 3);
  else if (slot.key === 'weekend') rawOptions = shuffle(WEEKEND_OPTIONS).slice(0, 3);
  else rawOptions = slot.options.slice(0, 3);

  // 混入一个「课外活动」，凑成 4 个选项。
  // 只从适合当前时段的活动里抽，避免"晚修去打篮球"这种不合理的组合。
  const activityChance = S.semIdx >= 4 ? 0.55 : 0.35;
  if (chance(activityChance)) {
    const fitActivities = DAILY_ACTIVITY_POOL.filter(
      (a) => !a.slots || a.slots.includes(slot.key)
    );
    if (fitActivities.length) {
      const activity = pick(fitActivities);
      rawOptions = [...rawOptions, activity];
    }
  }

  const options = rawOptions
    .filter((o) => !o.available || o.available())
    .map((o) => ({ ...o, fxLabels: DAILY_FX_LABELS, kind: 'daily', title: o.title || `${slot.title} · 回应`, text: o.text || '' }));
  if (!options.length) return null;
  return {
    t: 'choice',
    kicker: '日常选项',
    hint: slot.hint,
    moduleClass: 'daily-choice-module',
    intro: { kind: 'daily', title: slot.title, body: slot.body },
    options,
  };
}

function buildDailyRandomEvent() {
  if (!S || !chance(DAILY_RANDOM_CHANCE)) return null;
  const raw = pick(DAILY_RANDOM_EVENTS);
  return {
    t: 'choice',
    kicker: '🎲 随机小事件',
    hint: '日常随时可能发生的小事。',
    moduleClass: 'daily-choice-module',
    intro: { kind: 'daily', title: raw.title, body: raw.body },
    options: raw.options.map((o) => ({ ...o, fxLabels: DAILY_FX_LABELS, kind: 'daily', title: o.title || raw.title, text: o.text || '' })),
  };
}

/* ================================================================
   恋爱线 · 好感度五阶段
   陌生 0-20 / 认识 21-45 / 朋友 46-70 / 暧昧 71-90 / 恋人 91-100
   对象在开学后由「遇见」事件确定，之后按好感度推进 9 段主线。
   ================================================================ */

const AFF_STAGES = [
  { n: 1, min: 0, max: 20, tag: '同班同学', short: '陌生', desc: '你们只是见过面。' },
  { n: 2, min: 21, max: 45, tag: '聊得来的同学', short: '认识', desc: 'TA 开始记得你的名字。' },
  { n: 3, min: 46, max: 70, tag: '朋友', short: '朋友', desc: 'TA 会主动来找你了。' },
  { n: 4, min: 71, max: 90, tag: '说不清的关系', short: '暧昧', desc: '你们之间，好像有点不一样。' },
  { n: 5, min: 91, max: 100, tag: '恋人', short: '恋人', desc: '你们在一起了。' },
];

// 阶段跃迁提示
const AFF_JUMP = {
  2: 'TA 开始记得你的名字了。',
  3: '从今天起，你们算是朋友了。',
  4: '有些话，谁都没有说出口。',
  5: '答案，就在那个下午。',
};
const AFF_COOL = '好像，有什么东西悄悄凉下去了。';

/* ---------------- 路线分流 ----------------
   开局选「男」→ 攻略对象是女生，走上面这套（LOVE_CHARS，原线，一字不动）。
   开局选「女」→ 攻略对象是男生，走下面新增的 BOY_* 一套。
   两条线共用同一套好感度框架、同一组主线门槛，只换文案表与称呼表，
   所以「男生篇」是并行新增，原女生线不会被碰到。
*/
function loveRoute() {
  return CFG && CFG.gender === '女' ? 'boy' : 'girl';
}
function loveIsBoy() { return loveRoute() === 'boy'; }

// 男生线：好感区间完全一致，换一套玩家可见描述
const AFF_STAGES_BOY = [
  { n: 1, min: 0, max: 20, tag: '同班同学', short: '陌生', desc: '你们只在同一个教室里待过。' },
  { n: 2, min: 21, max: 45, tag: '能说上话的同学', short: '认识', desc: 'TA 见到你会点一下头了。' },
  { n: 3, min: 46, max: 70, tag: '兄弟', short: '朋友', desc: 'TA 开始什么事都拉上你。' },
  { n: 4, min: 71, max: 90, tag: '说不清的关系', short: '暧昧', desc: 'TA 最近，有时候会突然不说话。' },
  { n: 5, min: 91, max: 100, tag: '恋人', short: '恋人', desc: 'TA 看你的眼神和看别人不一样了。' },
];

// 男生线：升级 / 降级弹窗
const AFF_JUMP_BOY = {
  2: '你好像，被 TA 记住了。',
  3: '从今天起，TA 可以拿你一半的东西了。',
  4: '有些话，被 TA 自己按回去了。',
  5: 'TA 终于把话说明白了。',
};
const AFF_COOL_BOY = '恭喜你，重新变成「那个同学」。';

// 男生线：关系状态 UI 文案
const AFF_RISE_BOY = 'TA 好像……不再只跟你客气了。';
const AFF_DOWN_BOY = 'TA 跟你说话的时候，又开始用全名了。';
const AFF_IDLE_BOY = 'TA 不再「顺路」了。';
const AFF_BREAK_BOY = '有些人一旦开始对你客气，就再也回不去了。';
const AFF_LOVER_BOY = '那天起，全校都知道 TA 身边有个固定的人。';
const AFF_BREAK_GIRL = '有些关系，一旦断了，就接不回去了。';

function affStages() { return loveIsBoy() ? AFF_STAGES_BOY : AFF_STAGES; }
function affStageAt(n) {
  const arr = affStages();
  return arr[clamp(n, 1, 5) - 1] || arr[0];
}
function affJumpAt(n) {
  const m = loveIsBoy() ? AFF_JUMP_BOY : AFF_JUMP;
  return m[n] || '';
}
function affCoolText() { return loveIsBoy() ? AFF_COOL_BOY : AFF_COOL; }
function affBreakText() { return loveIsBoy() ? AFF_BREAK_BOY : AFF_BREAK_GIRL; }
// 好感首次到 46 的成就：女生线叫「初次心动」，男生线叫「第一个外号」
function loveFirstMilestone() { return loveIsBoy() ? '第一个外号' : '初次心动'; }

// 四位可攻略对象：四种性格，名字中性，性别随玩家取反
const LOVE_CHARS = {
  A: {
    key: 'A', name: '沈清禾', persona: '高冷学霸型', club: '图书委员',
    meetPlace: '图书馆闭馆前十分钟的还书台',
    meetLine: '「……书还回来的时候，别折页。」',
    hobby: '闭馆后的图书馆',
    confess: '我不太会说这种话。但是……你不在的时候，这里会很安静。安静得有点过头了。',
    refuse: '对不起。……不是你的问题。',
    refuseBody: 'TA 看着你的眼睛把这句话说完，然后很轻地鞠了一躬。',
  },
  B: {
    key: 'B', name: '林溪月', persona: '元气运动型', club: '田径队',
    meetPlace: '操场边',
    meetLine: '「诶——你就是那个总在晚修最后走的？」',
    hobby: '比赛结束后的看台',
    confess: '我其实早就想说了！就是……一直没找到机会。现在说，还算数吗？',
    refuse: '对不起啊……我一直把你当最好的朋友。真的对不起。',
    refuseBody: 'TA 笑了一下，笑得比哭还难看。',
  },
  C: {
    key: 'C', name: '顾知予', persona: '温柔文艺型', club: '美术社',
    meetPlace: '教学楼二层的连廊上',
    meetLine: '「你看那边的云。」',
    hobby: '放学后的画室',
    confess: '我画过很多人。最近发现，画来画去，好像都是同一个人。',
    refuse: '谢谢你。真的。……但我现在，好像还没准备好。',
    refuseBody: 'TA 说完就低下头，手指在袖口上反复摩挲。',
  },
  D: {
    key: 'D', name: '陈书言', persona: '傲娇同级型', club: '同班同学',
    meetPlace: '教室后门',
    meetLine: '「谁要你管。」',
    hobby: '「顺路」带了整整一学期的早餐',
    confess: '……你听好了。我只说一遍。我、喜欢你。敢笑我就打你。',
    refuse: '……你在开玩笑吧。',
    refuseBody: 'TA 愣了两秒，然后转身就跑。',
  },
};

// 男生线四位可攻略对象。键位与女生线一一对应（A 运动 / B 阳光 / C 安静 / D 嘴硬），
// 这样 lp() 的性格取词逻辑两条线可以完全复用。
const BOY_CHARS = {
  A: {
    key: 'A', name: '江星然', persona: '沉默运动型', club: '校队主力',
    meetPlace: '操场跑道边，训练刚结束',
    meetLine: '「……让一下。」',
    hobby: '训练结束后空着的跑道',
    confess: '我不太会说那些。就是——我看你的时候，跟看别人不一样。你自己想想。',
    refuse: '……哦。',
    refuseBody: 'TA 点点头，把本来要给你的东西揣回兜里：「那我们还是朋友吧。」',
  },
  B: {
    key: 'B', name: '陆云舒', persona: '阳光学长型', club: '学生会',
    meetPlace: '教学楼的公告板前',
    meetLine: '「同学，帮个忙——这张表贴左边还是右边？」',
    hobby: '每次都说「我正好路过」',
    confess: '我一直挺能说的。但是有一句话，我想了两个月都没想好怎么开口。要不……我直接说了？',
    refuse: '没事没事，是我唐突了。',
    refuseBody: 'TA 笑着摆手：「这件事当我没说，好吧？」然后一个月没敢跟你对视。',
  },
  C: {
    key: 'C', name: '温临川', persona: '安静学神型', club: '常年第一',
    meetPlace: '图书馆靠窗的那排座位',
    meetLine: '「……这个位置，有人。」',
    hobby: '封面上什么都没写的那本笔记',
    confess: '我这个人不太会表达。所以我把它写下来了。',
    refuse: '好，我知道了。',
    refuseBody: 'TA 把那张纸收回去：「谢谢你认真看完。」',
  },
  D: {
    key: 'D', name: '吴舟晚', persona: '嘴硬少年型', club: '同班后桌',
    meetPlace: '教室后门',
    meetLine: '「喂，你挡我路了。」',
    hobby: '「顺路」走了半学期的那段路',
    confess: '你先别说话。听我说完。……我、喜欢你。就这个。你要是敢笑我，我就……我就当你没听见。',
    refuse: '啊，是嘛。',
    refuseBody: 'TA 把手插进兜里，点点头：「谁稀罕啊。」然后很用力地走了。',
  },
};

function newLoveState() {
  return {
    met: false,          // 是否已经遇见
    char: null,          // 性格键 A/B/C/D
    name: '',
    gender: '女',        // 对象性别（与玩家相反）
    aff: 0,              // 好感度 0-100
    stage: 1,            // 1-5
    active: false,       // 是否已是恋人（stage 5）
    confessed: false,    // 告白成功过
    refused: false,      // 告白失败过
    from: '',
    points: 0,           // 约会 / 和好等互动次数（沿用旧字段）
    dates: 0,            // 约会次数
    cold: 0,             // 连续冷落
    peakAff: 0,          // 历史最高好感
    seen: {},            // 已触发的剧情事件
    keepsakes: [],       // 信物：每个关键事件留下的实物
    flags: {},           // 恋爱线杂项（生日月份等）
  };
}

// 旧存档迁移：老结构只有 { active, stage, points, from }
// 注意必须按「原始字段是否存在」判断，不能看合并后的值——默认值会把判断掩盖掉。
function migrateLove(raw) {
  const base = newLoveState();
  base.gender = CFG.gender === '男' ? '女' : '男';
  if (!raw || typeof raw !== 'object') return base;

  const out = { ...base, ...raw };
  out.seen = raw.seen && typeof raw.seen === 'object' ? raw.seen : {};
  out.flags = raw.flags && typeof raw.flags === 'object' ? raw.flags : {};

  if (typeof raw.aff !== 'number') {
    // 老版本只有「恋爱中 / 单身」，恋爱中直接视为已经告白过
    if (raw.active) {
      out.aff = 91;
      out.confessed = true;
      out.met = true;
      loveStoryList().forEach((ev) => { out.seen[ev.id] = true; });
    } else {
      out.aff = 0;
      out.met = false;
    }
  }
  if (typeof raw.stage !== 'number' || raw.active) out.stage = stageForAff(out.aff);
  if (typeof raw.met !== 'boolean') out.met = Boolean(raw.active);
  if (typeof raw.peakAff !== 'number') out.peakAff = out.aff;
  if (!out.char) { out.char = 'A'; out.name = loveChars().A.name; }
  if (!raw.gender) out.gender = CFG.gender === '男' ? '女' : '男';
  out.active = out.stage === 5;
  return out;
}

function stageForAff(aff) {
  for (const s of AFF_STAGES) if (aff <= s.max) return s.n;
  return 5;
}
function affStage() {
  return affStageAt((S.love && S.love.stage) || 1);
}
// 攻略对象表按路线切换：男玩家拿女生表，女玩家拿男生表
function loveChars() { return loveIsBoy() ? BOY_CHARS : LOVE_CHARS; }
function loveChar() {
  const t = loveChars();
  return t[(S.love && S.love.char) || 'A'] || t.A;
}
function loveTa() {
  return S.love && S.love.gender === '男' ? '他' : '她';
}
function lovePlayerParts() {
  const n = (CFG.name || '').trim() || '同学';
  if (n.length <= 1) return { full: n, surname: n, given: n, short: n };
  return { full: n, surname: n[0], given: n.slice(1), short: n.slice(-1) };
}
// 称呼演变：同一个人，四个性格叫法完全不同
function loveCall() {
  const p = lovePlayerParts();
  // 确认关系之后称呼不再回退
  const st = S.love && S.love.confessed ? 5 : clamp((S.love && S.love.stage) || 1, 1, 5);
  const k = (S.love && S.love.char) || 'A';
  const table = {
    A: ['喂', `${p.full}同学`, p.full, p.surname, p.full],
    B: ['同学！', `${p.full}！`, p.full, p.short, p.short],
    C: ['那个……同学', `${p.full}同学`, `${p.full}同学`, p.full, p.full],
    D: ['笨蛋', '你这家伙', p.full, p.full, p.short],
  };
  // 男生线：他叫你什么，跟女生叫你什么是两套完全不同的逻辑
  const tableBoy = {
    A: ['那个谁', p.full, `老${p.surname}`, p.given, `我家${p.short}`],
    B: [`${p.full}同学`, p.full, `小${p.surname}`, p.full, `我家${p.short}`],
    C: [`${p.full}同学`, p.full, `${p.surname}同学`, p.full, `我家${p.short}`],
    D: ['喂', p.full, `小${p.surname}`, `小${p.surname}`, `我家${p.short}`],
  };
  const t = loveIsBoy() ? tableBoy : table;
  return (t[k] || t.A)[st - 1];
}

// 按性格取台词：lp({A:'…',B:'…',C:'…',D:'…'})
function lp(map) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) return map || '';
  const k = (S.love && S.love.char) || 'A';
  return map[k] || map.A || '';
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 难度对好感的修正：困难模式下推进更慢。
// 用「向下取整 + 按余数掷骰」做随机取整，避免 delta 很小时被四舍五入吞掉。
function scaleAff(delta) {
  if (delta <= 0) return delta;
  const mul = DIFFICULTY.affMul;
  if (mul >= 1) return delta;
  const scaled = delta * mul;
  const whole = Math.floor(scaled);
  return whole + (chance(scaled - whole) ? 1 : 0);
}

// 好感度变动：统一入口，负责阶段跃迁与提示
function addAff(delta) {
  const L = S && S.love;
  if (!L || !L.met || !delta) return;
  if (!S.flags.loveMilestones || typeof S.flags.loveMilestones !== 'object') S.flags.loveMilestones = {};
  const gain = scaleAff(delta);
  // 没告白之前最高只到「暧昧」上限，避免自动变成恋人
  const cap = L.confessed ? 100 : 90;
  L.aff = clamp(L.aff + gain, 0, cap);
  L.peakAff = Math.max(L.peakAff || 0, L.aff);
  L.cold = delta < 0 ? (L.cold || 0) + 1 : 0;

  const st = stageForAff(L.aff);
  const prev = L.stage;
  L.stage = st;
  // 恋人状态一旦确认，就不会因为一次负面事件被自动撤销——只有分手事件能解除。
  L.active = L.confessed ? L.aff > 30 : st === 5;
  if (st > prev) {
    // 不直接播报"关系推进到 X 阶段"，而是给一句留白 + 一个动作细节，
    // 让玩家自己去判断发生了什么（参考《欲晓》《只为她荒唐》的写法）。
    const hint = affJumpAt(st) || affStageAt(st).desc;
    const detail = loveIsBoy()
      ? pick([
          `${loveTa()}说话的时候没看你，但手一直搭在你椅背上。`,
          `你没注意到的是——${loveTa()}今天坐得比平时近了一拳。`,
          `${loveTa()}走的时候，把你的杯子往桌子里面推了推。`,
        ])
      : pick([
          `${loveTa()}今天叫你的时候，尾音比平时轻。`,
          `你把东西递给${loveTa()}的时候，${loveTa()}的手指多停了一秒。`,
          `${loveTa()}没有说话，但你回头的时候，${loveTa()}在看你。`,
        ]);
    logEvent('love', '💗 关系变化', `${hint}\n\n${detail}`, null);
    journal(`· 关系推进：${affStageAt(st).tag}`);
    if (loveIsBoy()) journal(`· ${AFF_RISE_BOY}`);
  } else if (st < prev) {
    if ((L.cold || 0) >= 2 && loveIsBoy()) journal(`· ${AFF_IDLE_BOY}`);
    if ((L.cold || 0) >= 3) {
      logEvent('love', '💧 关系降温', affCoolText(), null);
      if (loveIsBoy()) journal(`· ${AFF_DOWN_BOY}`);
    }
  }
  const firstKey = loveFirstMilestone();
  if (L.aff >= 46 && !S.flags.loveMilestones[firstKey]) {
    S.flags.loveMilestones[firstKey] = true;
    journal(`· 成就「${firstKey}」：好感首次达到 46`);
  }
  renderHud();
}

/* ================================================================
   恋爱里程碑 · 对话链构造器
   把一串步骤串成「选项 → 回应 → 选项 → 回应 → 选项」的对话链。
   每个选项的 next 属性指向下一步；最后一步的选项负责标记已触发。
   ================================================================ */
function makeLoveChain(steps) {
  const buildStep = (idx) => {
    if (idx >= steps.length) return null;
    const step = steps[idx];
    return {
      t: 'choice',
      intro: { kind: 'love', title: step.title, body: step.body },
      options: step.options.map((opt) => ({
        label: opt.label,
        fx: opt.fx || {},
        kind: 'love',
        title: opt.title || opt.label,
        text: opt.text || '',
        journal: opt.journal,
        onPick: opt.onPick,
        next: idx + 1 < steps.length ? () => buildStep(idx + 1) : null,
      })),
    };
  };
  return buildStep(0);
}
/* ---------------- 遇见 ---------------- */
function buildLoveMeetEvent() {
  const L = S && S.love;
  if (!L || L.met) return null;
  if (CFG.loveMode === 'none') return null;
  if (S.round < 2) return null;

  // 随机抽一个角色，不再让玩家"选妃"
  const chars = loveChars();
  const keys = Object.keys(chars);
  const k = keys[rnd(0, keys.length - 1)];
  const c = chars[k];

  return {
    t: 'choice',
    intro: {
      kind: 'love',
      title: '🚪 遇见',
      body: `开学有一阵了。走廊上的人脸你还是认不全，大多数时候低头走路，谁也不看。\n\n这一天——\n\n${c.meetPlace}。\n\n${c.meetLine}\n\n你愣了一下。还没想好要不要开口，TA 已经从你旁边走了过去。`,
    },
    options: [
      {
        label: '回头，多看 TA 一眼',
        fx: { aff: 12, social: 1 },
        kind: 'love',
        title: `👀 记住了 ${c.name}`,
        text: `你回头的时候，TA 已经走到走廊的拐角。你只看清一个侧脸——但那个侧脸你会记得很久。\n\n（后来你才知道，TA 叫${c.name}，${c.club}。）`,
        journal: `· 遇见 ${c.name}（${c.persona}）`,
        onPick: () => {
          L.met = true; L.char = k; L.name = c.name;
          L.gender = CFG.gender === '男' ? '女' : '男';
          L.from = '开学遇见';
          L.aff = 12; L.stage = stageForAff(12); L.peakAff = 12;
          L.flags.bday = pick([3, 4, 5, 6, 9, 10, 11]);
          renderHud();
        },
      },
      {
        label: '低头走开，什么都没想',
        fx: { aff: 6 },
        kind: 'love',
        title: `👀 擦肩而过`,
        text: `你低下头，把路让开。TA 从你旁边过去，脚步声在走廊里响了两下就远了。\n\n（你以为这件事就这样过去了。但它没有。）`,
        journal: `· 擦肩而过：${c.name}（${c.persona}）`,
        onPick: () => {
          L.met = true; L.char = k; L.name = c.name;
          L.gender = CFG.gender === '男' ? '女' : '男';
          L.from = '擦肩而过';
          L.aff = 6; L.stage = stageForAff(6); L.peakAff = 6;
          L.flags.bday = pick([3, 4, 5, 6, 9, 10, 11]);
          renderHud();
        },
      },
    ],
  };
}

/* ---------------- 主线九段 ---------------- */
// 01 · 走廊上的作业本（①→②）
function loveEvent01() {
  const ta = loveTa();
  return {
    t: 'choice',
    intro: {
      kind: 'love',
      title: '📚 走廊上的作业本',
      body: `作业本摞得太高，你只能看到前面三米。\n\n拐角处——\n\n一声闷响。纸页散了一地，白花花铺在水泥地砖上，像一层没人扫的雪。\n\n${ta}已经蹲下去了。动作很快。快到你还没反应过来，最近的那几本已经回到了${ta}手里。头发垂下来挡住脸，只看到手在动。\n\n「……抱歉。」\n\n声音很轻。轻到你不确定是不是说给你听的。`,
    },
    options: [
      {
        label: '蹲下去，一起捡',
        fx: { aff: 5, social: 1 },
        kind: 'love',
        title: '📚 一起捡',
        text: lp({
          A: '你蹲下去的时候，TA 的手顿了一下。两个人捡同一本，指尖碰到一起，TA 立刻收回手，让你拿。',
          B: '「哦！谢谢谢谢。」TA 把最后一本拍干净，顺手塞进你怀里，笑得毫无防备。',
          C: '你们一人一边，按页码把本子捡回来。TA 把最后一本递给你的时候，指尖在上面停了一秒。',
          D: '「……我自己会捡。」嘴上这么说，手却没停。',
        }),
        journal: '· 作业本：一起捡',
        // 对话链：捡完后，TA 会主动说一句话，玩家再选一次
        next: () => ({
          t: 'choice',
          intro: {
            kind: 'love',
            title: '📚 一起捡（续）',
            body: `两个人都站起来了。\n\n${lp({
              A: '「……谢谢。」TA 终于抬头看了你一眼。',
              B: '「诶，你人挺好嘛！」TA 拍了拍手上的灰，笑嘻嘻地看着你。',
              C: '「……谢谢你。」TA 抱着书，说得小声但很清楚。',
              D: '「……算你识相。」TA 抱着书，耳朵有点红。',
            })}`,
          },
          options: [
            {
              label: '「那你请我喝水吧。」',
              fx: { aff: 4, social: 2 },
              kind: 'love',
              title: '📚 讨了瓶水',
              text: lp({
                A: '「……嗯。」TA 愣了一下，然后转身去小卖部。回来的时候，手里是两瓶。',
                B: '「行！走走走！」TA 直接把书包扔给你，跑去买了一箱——不对，是两瓶。',
                C: '「……好。」TA 转身走的时候，脚步比平时快了一点。',
                D: '「凭什么啊。」TA 嘴上说着，人已经往小卖部走了。',
              }),
              journal: '· 作业本后续：讨水',
            },
            {
              label: '「没事，我走了。」',
              fx: { aff: 1, sleep: 1 },
              kind: 'love',
              title: '📚 就此别过',
              text: lp({
                A: '「嗯。」TA 站在原地，看着你走远。',
                B: '「哦，那下次见！」TA 挥挥手。',
                C: '「……再见。」TA 说得比平时慢半拍。',
                D: '「走就走呗。」TA 别开脸。',
              }),
              journal: '· 作业本后续：告别',
            },
            {
              label: '「你抱得动吗？我帮你拿一半。」',
              fx: { aff: 6, sleep: -1 },
              kind: 'love',
              title: '📚 帮 TA 拿',
              text: lp({
                A: '「……不用。」TA 把书抱得更紧了，但没走。',
                B: '「好啊好啊，累死我了。」TA 直接把一半摞给你，自己空着手走在前面。',
                C: '「……那你拿这两本吧，轻的。」TA 挑了两本最薄的给你。',
                D: '「我自己拿得动。」TA 说完，看你没动，又低声补了句「……你要拿就拿吧」。',
              }),
              journal: '· 作业本后续：帮忙拿',
            },
          ],
        }),
      },
      {
        label: '站着摆手说「没事没事」',
        fx: { aff: 1 },
        kind: 'love',
        title: '📚 客气了一下',
        text: lp({
          A: '「嗯。」TA 把最后一本摞好，抱起来，走了。',
          B: '「没事就好！那我先走啦。」TA 拍了拍手上的灰，挥手走了。',
          C: '「……嗯，麻烦了。」TA 低着头，把本子一摞一摞摆正，才抱着走。',
          D: '「算你识相。」TA 把最后几本塞进你怀里，转身就走。',
        }),
        journal: '· 作业本：客气',
      },
      {
        label: '「下次走路看路啊。」',
        fx: { aff: -3 },
        kind: 'love',
        title: '📚 玩笑开过头',
        text: lp({
          A: '「……是我的错。」TA 低下头，声音很轻。你想说「开玩笑的」，但 TA 已经抱着书走远了。',
          B: '「哈？明明是你挡路！」TA 瞪了你一眼，转身就走。',
          C: '「……对不起。」TA 把本子摞好，抱起来，没看你。',
          D: '「你才要看路！笨蛋。」TA 抱着书走了，脚步咚咚的。',
        }),
        journal: '· 作业本：玩笑开过头',
      },
    ],
    onResolve: () => { S.love.seen.e01 = true; },
  };
}

// 02 · 借笔记（②）
function loveEvent02() {
  const ta = loveTa();
  return {
    t: 'choice',
    intro: {
      kind: 'love',
      title: '📓 借笔记',
      body: `你在草稿纸上划掉第三个错误的公式。笔尖透了两层纸。\n\n旁边传来一句很轻的话。\n\n${ta}：「……你昨天那节课的笔记，记了吗？」\n\n问完这句话，TA 没有立刻看你。目光落在你的草稿纸上，像是要先判断这题你会不会做。`,
    },
    options: [
      {
        label: '递过去，顺手圈出重点',
        fx: { aff: 8, study: 1 },
        kind: 'love',
        title: '📓 圈了重点',
        text: lp({
          A: '「你这里画的是什么？」\n\nTA 指着你圈的地方。你抬头的时候 TA 立刻把目光移开，但手指还停在那。\n\n这是 TA 第一次主动追问你。',
          B: '「哇，你还标了重点！」TA 凑过来，肩膀差点撞到你的胳膊。\n\n你侧开一点，TA 才反应过来自己靠太近，脸红了。',
          C: 'TA 把笔记翻得很慢，像是每一个圈都要看清楚。\n\n「……你圈的地方，和我画的不太一样。」\n\n「那是因为你上课没听。」你顺口说。TA 没反驳。',
          D: '「谁、谁要你圈重点了。」\n\n嘴上嫌弃，抄的时候一个圈都没漏。',
        }),
        journal: '· 借笔记：圈重点',
      },
      {
        label: '递过去，什么也不说',
        fx: { aff: 4 },
        kind: 'love',
        title: '📓 随手递过去',
        text: lp({
          A: '「谢谢。」TA 接过去翻得很快，像是在赶时间。\n\n还你的时候什么都没多说，但折角被抚平了。',
          B: '「够意思！」TA 一把接过去，翻了两页就皱着眉「嘶」了一声。\n\n「你这字能认全的人，全年级不超过三个吧？」',
          C: '「谢谢……我看完还你。」TA 把笔记放进书包，按得很平。',
          D: '「哼，算你有点用。」TA 拿到手的时候嘴角往上翘了一下，自己都没发现。',
        }),
        journal: '· 借笔记：随手',
      },
      {
        label: '「你上课都没听吗？」',
        fx: { aff: -5 },
        kind: 'love',
        title: '📓 说错话了',
        text: lp({
          A: '「……当我没问。」TA 把手收了回去，笔记推回你桌上，动作很轻。\n\n然后低下头继续做题。',
          B: '「我听了！我只是没记！」TA 急了，声音不大但语速很快。\n\n「你上课光记笔记才没听课吧？」',
          C: '「……嗯，没听。」TA 低下头，没有辩解。\n\n你意识到自己说重了。TA 没有听明白你在开玩笑。',
          D: '「关你什么事。」TA 把脸转过去。\n\n过了一分钟，你又听到 TA 很小声地说：「……本来想问你另一道题的。」',
        }),
        journal: '· 借笔记：说错话',
      },
    ],
    onResolve: () => { S.love.seen.e02 = true; },
  };
}

// 03 · 食堂拼桌（②→③）
function loveEvent03() {
  const ta = loveTa();
  return {
    t: 'choice',
    intro: {
      kind: 'love',
      title: '🍚 食堂拼桌',
      body: `食堂里空位不多。你端着餐盘在过道里慢慢走，眼睛扫过一排一排桌子。\n\n柱子后的桌子，${ta}一个人坐着。旁边的椅子空着，上面放着一件校服外套。\n\nTA 正低头吃饭，没看到你。`,
    },
    options: [
      {
        label: '走过去，问一句「这里有人吗」',
        fx: { aff: 7, social: 2, sleep: -1 },
        kind: 'love',
        title: '🍚 拼桌',
        text: lp({
          A: '「……没有。」TA 把椅子上的外套收起来，动作有点急。\n\n坐下之后两个人都没说话。但是你听见 TA 的筷子碰碗的声音轻了。',
          B: '「没人没人，坐！」TA 顺手把椅子上的校服拿开，还把自己餐盘里的炸鸡夹了一块放你碗里。\n\n「这个好吃，尝尝。」',
          C: '「没有。」TA 把餐盘往自己那边收了收，给你让出位置。\n\n整顿饭 TA 都没怎么抬过头，但你注意到 TA 吃饭的速度比平时慢。',
          D: '「你坐哪不行啊。」TA 说着，还是把外套拿走了。\n\n坐下以后 TA 又嘟囔了一句：「……那儿不干净。」',
        }),
        journal: '· 食堂：拼桌',
      },
      {
        label: '隔两张桌子坐下，不打扰',
        fx: { aff: 2 },
        kind: 'love',
        title: '🍚 隔了两张桌子',
        text: `${ta}抬了下头。\n\n隔着两张桌子的距离，你看不清 TA 的表情。TA 好像想说什么，最后什么也没说，低头继续吃饭。\n\n吃完你先走的。路过 TA 桌边的时候，TA 的筷子停了一秒。`,
        journal: '· 食堂：隔着坐',
      },
      {
        label: '招呼几个同学一起挤过去',
        fx: { aff: 0, social: 3 },
        kind: 'love',
        title: '🍚 人多热闹',
        text: `一桌人坐下，笑声不断。\n\n${ta}笑了笑，但整顿饭没怎么说话。你偶尔抬头，发现 TA 在看窗外。\n\n走的时候 TA 走得最快。`,
        journal: '· 食堂：招呼一群人',
      },
    ],
    onResolve: () => { S.love.seen.e03 = true; },
  };
}

// 04 · 放学顺路（③）
function loveEvent04() {
  const ta = loveTa();
  return {
    t: 'choice',
    intro: {
      kind: 'love',
      title: '🌇 放学顺路',
      body: `你走出校门，发现${ta}就在前面几步远的地方，背着书包慢慢走。夕阳把两个人的影子拉得很长。`,
    },
    options: [
      { label: '加快脚步跟上去', fx: { aff: 6, social: 2, sleep: -1 }, kind: 'love', title: '🌇 并肩走',
        text: lp({ A: '「你也走这边？」TA 放慢了脚步，刚好和你并排。', B: '「诶！一起一起！」TA 直接把手搭上你书包带。', C: '「……嗯，你也走这边啊。」TA 的脚步慢了下来。', D: '「你跟着我干嘛。」TA 没加快，也没走开。' }),
        journal: '· 放学：跟上去' },
      { label: '保持距离，慢慢跟在后面', fx: { aff: 2 }, kind: 'love', title: '🌇 远远跟着',
        text: '走到岔路口，TA 回头看了一眼，然后拐弯走了。',
        journal: '· 放学：远远跟着' },
      { label: '喊 TA 名字，然后跑过去', fx: { aff: 4, sleep: -1 }, kind: 'love', title: '🌇 喊住 TA',
        text: lp({ A: '「……你喊那么大声干什么。」TA 耳朵有点红。', B: '「哈哈！你跑这么快干嘛！」', C: '「……我听见了。」TA 站在原地等你。', D: '「叫什么叫，全年级都听见了。」' }),
        journal: '· 放学：喊住 TA' },
    ],
    onResolve: () => { S.love.seen.e04 = true; },
  };
}

// 05 · 雨天，只有一把伞（③→④）
function loveEvent05() {
  const ta = loveTa();
  return {
    t: 'choice',
    intro: {
      kind: 'love',
      title: '☔ 雨天，只有一把伞',
      body: `雨下得比预报里大。你站在教学楼门口翻书包，确认了里面没有伞。\n\n${ta}也在门口，手里握着一把伞，站着没动。\n\n${ta}：「……你要去哪边？」`,
    },
    options: [
      { label: '「顺路，一起吧。」', fx: { aff: 10, social: 3, sleep: -1 }, kind: 'love', title: '☔ 伞下的距离',
        text: `伞不大，两个人都往里缩了缩，肩膀偶尔碰到。${ta}一路没说话，但也没走快。`,
        journal: '· 雨天共伞',
        onPick: () => { S.flags.loveMilestones['伞下的距离'] = true; } },
      { label: '「不用了，我等雨停。」', fx: { aff: -2 }, kind: 'love', title: '☔ 等雨停',
        text: lp({ A: '「哦。」TA 撑开伞，走了两步，又停了一下，还是走了。', B: '「那你自己小心啊！」TA 挥挥手跑进雨里。', C: '「……那我先走了。」TA 回头看了你一眼。', D: '「随便你。」TA 走得比平时快。' }),
        journal: '· 雨天：等雨停' },
      { label: '「你伞借我，你先淋着回去。」（玩笑）', fx: { aff: -4 }, kind: 'love', title: '☔ 玩笑开砸了',
        text: lp({ A: '「……你自己等吧。」TA 把伞往怀里抱了抱。', B: '「你过分了啊！」TA 瞪你一眼，跑了。', C: '「……不好笑。」', D: '「你去死吧。」TA 头也不回。' }),
        journal: '· 雨天：玩笑开砸' },
    ],
    onResolve: () => {
      S.love.seen.e05 = true;
      if (!S.love.keepsakes.includes('那把不够大的伞')) S.love.keepsakes.push('那把不够大的伞');
    },
  };
}

// 06 · 一起值日（④）
function loveEvent06() {
  const ta = loveTa();
  return {
    t: 'choice',
    intro: {
      kind: 'love',
      title: '🧹 一起值日',
      body: `教室里只剩你们两个。${ta}擦黑板，你搬椅子。窗外的天从橙色变成深蓝，走廊的灯一盏一盏亮起来。\n\n${ta}：「你搬得动吗？」`,
    },
    options: [
      { label: '「搬得动，你先歇会儿。」', fx: { aff: 8, sleep: -2, social: 2 }, kind: 'love', title: '🧹 一个人扛',
        text: lp({ A: '「……我没说要帮你。」TA 还是走过来，扶住了椅子的另一头。', B: '「少逞强了！我来我来。」TA 直接把椅子抢过去一半。', C: '「……一起吧，快一点。」', D: '「你搬得动才怪。」TA 已经伸手扶住了。' }),
        journal: '· 值日：一个人扛' },
      { label: '递一瓶水过去', fx: { aff: 6, sleep: -1 }, kind: 'love', title: '🧹 递了瓶水',
        text: lp({ A: '「你什么时候买的？」TA 接过来，拧了半天没拧开。', B: '「哇！谢啦——」TA 一口喝了半瓶。', C: '「……谢谢。」TA 拿着瓶子看了一会儿。', D: '「谁、谁让你买的。」TA 还是接过去了。' }),
        journal: '· 值日：递水' },
      { label: '趁机问「你周末有空吗」', fx: { aff: 5, sleep: -1 }, kind: 'love', title: '🧹 问了周末',
        text: lp({ A: '「……看情况。」TA 转过身去继续擦黑板，但擦得很慢。', B: '「有空啊！去哪？」', C: '「……大概有空。」TA 的声音很轻。', D: '「干嘛，你想约我？」TA 说完自己先红了脸。' }),
        journal: '· 值日：问周末' },
    ],
    onResolve: () => { S.love.seen.e06 = true; },
  };
}

// 07 · 走廊（④）
function loveEvent07() {
  const ta = loveTa();
  return {
    t: 'choice',
    intro: {
      kind: 'love',
      title: '🌬️ 教室外面的走廊',
      body: `走廊的风比楼下大得多。${ta}靠在栏杆上，校服外套被吹得鼓起来。\n\n${ta}：「你怎么也来了？」`,
    },
    options: [
      { label: '「想散散心。」', fx: { aff: 7, social: 2, study: -1 }, kind: 'love', title: '🌬️ 散散心',
        text: lp({ A: '「……你还挺有雅致的。」TA 笑了一下，很快又收住。', B: '「可以啊你！还有空来散心。」', C: '「……嗯，你不开心吗」', D: '「谁信啊。」TA 嘴上不信，眼睛是亮的。' }),
        journal: '· 走廊：散散心' },
      { label: '「想来吹吹风。」', fx: { aff: 4, sleep: -2 }, kind: 'love', title: '🌬️ 吹吹风',
        text: lp({ A: '「你有什么烦心事吗」TA 皱眉，但没走。', B: '「哇靠！你也喜欢吹风！」', C: '「……我们一起吹。」TA 往你这边挪了半步。', D: '「笨蛋！想看我就直说。」' }),
        journal: '· 走廊：吹吹风' },
      { label: '「我就是想来看看风景。」', fx: { aff: 6, sleep: -1 }, kind: 'love', title: '🌬️ 看风景',
        text: lp({ A: '「……这里确实风景好。」TA 看向远处，很久没说话。', B: '「是啊，这里风景可好了！你看那边！」', C: '「……嗯。这里很开阔。」', D: '「踏遍青山人未老，风景这边独好。」' }),
        journal: '· 走廊：看风景' },
    ],
    onResolve: () => { S.love.seen.e07 = true; },
  };
}

// 08 · 艺术节闭幕之后（④→⑤ 前置）
function loveEvent08() {
  const ta = loveTa();
  return {
    t: 'choice',
    intro: {
      kind: 'love',
      title: '🎪 艺术节闭幕之后',
      body: `艺术节的最后一天，舞台上的灯一盏一盏灭了。操场上的摊位收得差不多了，地上还散落着几张彩纸和没收拾完的丝带。\n\n人群散尽，你回头，发现${ta}还站在原来那个位置。\n\n${ta}：「……今天的节目，你看了吗？」`,
    },
    options: [
      { label: '「看了。我一直看着你。」', fx: { aff: 10, social: 3, sleep: -1 }, kind: 'love', title: '🎪 散场之后',
        text: lp({ A: '「……你这个人，说话能不能别这样。」TA 转过身，背对着你站了很久。', B: '「诶？！你、你说什么？」TA 的声音一下就抖了。', C: '「……我听见了。」TA 没有回头，但也没有走。', D: '「……你、你有病吧。」TA 耳朵红得能滴血。' }),
        journal: '· 艺术节散场',
        onPick: () => { S.flags.loveMilestones['散场之后'] = true; } },
      { label: '「人太多了，什么都没看清。」', fx: { aff: 3 }, kind: 'love', title: '🎪 没看清',
        text: `${ta}：「……是啊，人太多了。」`,
        journal: '· 散场：没看清' },
      { label: '「你怎么还没走？」', fx: { aff: 1 }, kind: 'love', title: '🎪 问了一句',
        text: `${ta}：「马上就走。」`,
        journal: '· 散场：问了一句' },
    ],
    onResolve: () => { S.love.seen.e08 = true; },
  };
}

// 09 · 告白（④→⑤）
function loveEvent09() {
  const c = loveChar();
  const ta = loveTa();
  const where = {
    A: '图书馆闭馆后的那排书架之间',
    B: '操场上，天已经黑了',
    C: '画室里，那幅没画完的画还立在架子上',
    D: '教学楼的台阶上，放学的铃声刚响过',
  }[c.key] || '校门口的路灯下';
  let succeeded = false;
  return {
    t: 'choice',
    intro: {
      kind: 'love',
      title: '💗 告白',
      body: `${where}。\n\n你想了很久要说的话，真正站到${ta}面前的时候，一句都想不起来了。`,
    },
    options: [
      {
        label: '直接说「我喜欢你」', fx: { aff: 1, social: 5, study: -2 },
        kind: 'love', title: '💖 在一起了',
        text: `${ta}低着头，很久，才轻轻应了一声：「……嗯。」\n\n${c.name} 的告白台词，其实留到了很久以后才说出口：「${c.confess}」`,
        journal: '· 告白成功',
        onPick: () => {
          succeeded = true;
          const L = S.love;
          L.confessed = true;
          L.aff = Math.max(L.aff, 91);
          L.peakAff = Math.max(L.peakAff || 0, L.aff);
          L.stage = 5;
          L.active = true;
          S.flags.confessions = (S.flags.confessions || 0) + 1;
          S.flags.neverTest = false;
          journal(`· 关系推进：${AFF_STAGES[4].tag}`);
          netBroadcast(`在莞中脱单了，对象是${L.name}`, '💗');
          renderHud();
        },
      },
      {
        label: '绕圈子问「我们算是什么关系」', fx: { aff: 1, social: 3, study: -2 },
        kind: 'love', title: '💬 绕了个圈子',
        text: `${ta}：「你问我？」\n\n${ta}终于抬起头看你，但你没有把话接下去。那个下午就这样过去了。`,
        journal: '· 告白：绕圈子',
        onPick: () => {
          const L = S.love;
          L.refused = true;
          S.flags.rejected++;
          S.flags.neverTest = false;
          addAff(-6);
          renderHud();
        },
      },
      {
        label: '什么都没说，转身走了', fx: { aff: -15, social: -2, sleep: -1 },
        kind: 'love', title: '💔 什么都没说',
        text: `你走到路口的时候，手机震了一下。是${c.name} 的消息：「你刚才想说什么？」\n\n你盯着那行字，最后什么也没回。`,
        journal: '· 告白：转身走了',
        onPick: () => {
          S.love.refused = true;
          S.flags.rejected++;
          S.flags.neverTest = false;
          renderHud();
        },
      },
    ],
    // 告白失败不锁死：好感重新涨回 90 还能再试一次（只有毕业时的遗憾才是永久的）
    onResolve: () => { if (succeeded) S.love.seen.e09 = true; },
  };
}

/* ================================================================
   男生线 · 主线九段（开局选「女」时启用）
   与女生线共用门槛，但内容整条重写：心动靠「并肩做事」累积，
   情绪靠停顿和改口体现，不靠肢体距离。
   ================================================================ */

// 01 · 谁的值日表（①→②）
function boyEvent01() {
  const ta = loveTa();
  return {
    t: 'choice',
    intro: {
      kind: 'love',
      title: '📋 谁的值日表',
      body: `值日表被人用红笔圈掉一个名字，旁边潦草地写着你的名字。\n\n你正盯着看，身后有人走过来，站住了，没说话。\n\n${ta}：「……那不是我改的。」\n\n${ta}手里还有半截粉笔，指节上沾着白灰。`,
    },
    options: [
      { label: '「那你手上的粉笔是什么。」', fx: { aff: 6, social: 1 }, kind: 'love', title: '📋 问了一句',
        text: lp({ A: '「……刚才写别的。」TA 把粉笔揣进兜里，动作很大。', B: '「……写别的。」TA 笑着把粉笔藏到身后，藏得毫无技术含量。', C: '「……刚才在写别的。」TA 说得很慢，像在确认这句话站得住脚。', D: '「关你什么事。」TA 把粉笔揣进兜里，动作很大。' }),
        journal: '· 值日表：问了一句' },
      { label: '「改了就改了，我扫。」', fx: { aff: 5, sleep: -1 }, kind: 'love', title: '📋 直接认下',
        text: lp({ A: '「……嗯。」TA 站了两秒，去拿了另一把扫帚。', B: '「那我帮你扫。」TA 已经把另一把扫帚拎起来了。', C: '「……嗯。」TA 拿起扫帚，从最里面那排开始扫。', D: '「谁要你扫。」TA 嘴上说着，扫帚已经拿在手里了。' }),
        journal: '· 值日表：直接认下' },
      { label: '「我告诉班主任。」', fx: { aff: -4, social: -1 }, kind: 'love', title: '📋 说重了',
        text: lp({ A: '「随你。」TA 转身走了，之后一周没跟你说话。', B: '「……至于吗。」TA 收起笑，转身走了。', C: '「随你。」TA 把粉笔放回讲台，走了。', D: '「告啊，你去告啊。」TA 摔门出去了。' }),
        journal: '· 值日表：说重了' },
    ],
    onResolve: () => { S.love.seen.e01 = true; },
  };
}

// 02 · 帮我带一下（②）
function boyEvent02() {
  const ta = loveTa();
  return {
    t: 'choice',
    intro: {
      kind: 'love',
      title: '🛒 帮我带一下',
      body: `小卖部窗口前排队的人拐了三个弯。你排在队尾，前面的人回头看了你一眼，然后从队伍里出来。\n\n${ta}：「你要买什么？我排到前面了。」\n\n${ta}把手里的钱握了握，像是怕别人看见。`,
    },
    options: [
      { label: '「两个面包，钱给你。」', fx: { aff: 7, social: 1 }, kind: 'love', title: '🛒 让他带',
        text: lp({ A: '「……不用。」TA 跑回去了。回来时手里是两个，自己的那个塞给你：「我不饿。」', B: '「行，等着。」TA 跑回去了，回来时手里是两个，多的那个塞给你：「拿着，我买多了。」', C: '「……钱不用了。」TA 回来时手里是两个，多的那个放在你桌上就走了。', D: '「就两个？行吧。」TA 回来时手里是两个，多的那个扔给你：「赏你的。」' }),
        journal: '· 小卖部：让他带' },
      { label: '「不用了，我等。」', fx: { aff: 2 }, kind: 'love', title: '🛒 自己排',
        text: `「哦。」${ta}看了你两秒，回去了，没再回头。`,
        journal: '· 小卖部：自己排' },
      { label: '「你人还挺好啊。」（打趣）', fx: { aff: 3, social: 1 }, kind: 'love', title: '🛒 打趣了一句',
        text: lp({ A: '「少来。」TA 耳朵有点红，背对着你挥手。', B: '「那当然，我什么时候不好了。」TA 笑着挥手，走得有点快。', C: '「……我只是顺路。」TA 推了下眼镜，转过身去。', D: '「谁好了？你少自作多情。」TA 耳朵有点红，背对着你挥手。' }),
        journal: '· 小卖部：打趣' },
    ],
    onResolve: () => { S.love.seen.e02 = true; },
  };
}

// 03 · 打一场（②→③）
function boyEvent03() {
  const ta = loveTa();
  return {
    t: 'choice',
    intro: {
      kind: 'love',
      title: '🏀 打一场',
      body: `体育课分组的时候，${ta}先喊了你的名字。\n\n球场上${ta}打得比平时凶，几次都快撞到你身上，又硬生生刹住。\n\n${ta}：「认真点，别让我赢太轻松。」`,
    },
    options: [
      { label: '认真打，赢他一次', fx: { aff: 9, social: 2, sleep: -1 }, kind: 'love', title: '🏀 赢了',
        text: lp({ A: '「……行啊你。」TA 喘着气笑，把球扔给你，又补了句：「再来。」', B: '「可以啊！」TA 拍了下你的肩，力气大得你差点站不稳，「下把我不留手了。」', C: '「……你那个假动作，是练过的吧。」TA 一边喘一边看你，看得比刚才久。', D: '「运气而已。」TA 嘴上不认，球却主动扔给你了，「再来一局。」' }),
        journal: '· 打一场：赢了' },
      { label: '让着他，输掉', fx: { aff: -3 }, kind: 'love', title: '🏀 让了',
        text: lp({ A: '「你刚才是不是没使劲。」TA 擦汗，没看你。', B: '「喂，你没认真打吧。」TA 的笑意淡了一点。', C: '「你最后那球，是故意放掉的。」TA 说得像在陈述事实。', D: '「你放水放得也太明显了。」TA 把球踢到一边。' }),
        journal: '· 打一场：让了' },
      { label: '中途喊累，坐到场边', fx: { aff: 1, sleep: 1 }, kind: 'love', title: '🏀 场边坐着',
        text: lp({ A: '「废物。」TA 把水递过来，也坐下了。', B: '「行吧，那歇会儿。」TA 坐到旁边，把外套扔你腿上。', C: '「……喝点水。」TA 在你旁边坐下，两个人一起看别人打。', D: '「才跑多久就累。」TA 递了瓶水过来，坐得离你有点近。' }),
        journal: '· 打一场：场边坐着' },
    ],
    onResolve: () => { S.love.seen.e03 = true; },
  };
}

// 04 · 你的车坏了（③）
function boyEvent04() {
  const ta = loveTa();
  return {
    t: 'choice',
    intro: {
      kind: 'love',
      title: '🚲 你的车坏了',
      body: `你的自行车链子掉了。蹲在地上弄了十分钟，手上全是黑油，天快黑了。\n\n${ta}：「起来。」\n\n${ta}把你拉开，自己蹲下去，袖子都没挽，直接上手。`,
    },
    options: [
      { label: '「谢了。我请你吃饭。」', fx: { aff: 8, social: 2, sleep: -1 }, kind: 'love', title: '🚲 请吃饭',
        text: lp({ A: '「……校门口那家？」TA 说得很随便，但已经在看时间了。', B: '「行啊，你请。」TA 站起来拍了拍手，顺手把你拉起来，「就那家吧，我知道你爱吃。」', C: '「……不用请。」TA 顿了一下，「……哪家。」', D: '「请就请，谁怕谁。」TA 把手在裤子上擦了擦，「那家，我认路。」' }),
        journal: '· 修车：请吃饭' },
      { label: '「不用你管，我自己能行。」', fx: { aff: -2 }, kind: 'love', title: '🚲 推开了',
        text: `「行。」${ta}站起来走了。走了十几米，又回来站着看你。`,
        journal: '· 修车：推开了' },
      { label: '蹲旁边给他递工具', fx: { aff: 6, sleep: -1 }, kind: 'love', title: '🚲 递工具',
        text: lp({ A: '「你这递的是扳手，不是那个。」TA 抬头笑了一下。', B: '「哎对对对，就这个——不对，这个是螺丝刀。」TA 自己也笑了。', C: '「……这个不对。」TA 从你手里换了一把，指尖碰了一下。', D: '「你连扳手都不认识？」TA 说完还是把手上那把接了过去。' }),
        journal: '· 修车：递工具' },
    ],
    onResolve: () => { S.love.seen.e04 = true; },
  };
}

// 05 · 一把伞的距离（③→④）
function boyEvent05() {
  const ta = loveTa();
  return {
    t: 'choice',
    intro: {
      kind: 'love',
      title: '☔ 一把伞的距离',
      body: `雨下得很大。\n\n${ta}把伞撑开，往你那边倾了一点。\n\n${ta}：「你家哪个方向？」`,
    },
    options: [
      { label: '「跟你一样。」（其实不一样）', fx: { aff: 11, social: 3, sleep: -1 }, kind: 'love', title: '☔ 一把伞的左肩',
        text: `${ta}把伞又往你那边偏了偏。他自己左肩湿透了，一句话没说。\n\n走到你家楼下的时候，他站在雨里看了你两秒，才转身。`,
        journal: '· 雨天共伞',
        onPick: () => { S.flags.loveMilestones['一把伞的左肩'] = true; } },
      { label: '「不用，我打车。」', fx: { aff: -2 }, kind: 'love', title: '☔ 打车回去',
        text: `「……行吧。」${ta}撑着伞站在原地看着你上车，才转身走。`,
        journal: '· 雨天：打车' },
      { label: '「你伞这么小？」（嫌弃）', fx: { aff: -5 }, kind: 'love', title: '☔ 说错话了',
        text: lp({ A: '「那我收起来。」他真的收了。', B: '「……那我收起来。」TA 的语气还是笑着的，但笑得不太对。', C: '「嗯，是小。」TA 把伞收了一半，又撑开，没再往你那边倾。', D: '「嫌小你自己买啊。」TA 把伞往自己那边挪了一大截。' }),
        journal: '· 雨天：嫌伞小' },
    ],
    onResolve: () => { S.love.seen.e05 = true; },
  };
}

// 06 · 自习室的最后一盏灯（④）
function boyEvent06() {
  const ta = loveTa();
  return {
    t: 'choice',
    intro: {
      kind: 'love',
      title: '💡 自习室的最后一盏灯',
      body: `教室里只剩你们两个人。\n\n${ta}趴在桌上装睡，其实眼睛是睁着的，看着窗外。\n\n${ta}：「……你不走？」`,
    },
    options: [
      { label: '「等你。」', fx: { aff: 10, sleep: -2 }, kind: 'love', title: '💡 等你',
        text: lp({ A: 'TA 趴着没动。过了很久才起来，收书包的动作慢得不正常。', B: '「等我干嘛。」TA 嘴上这么说，收书包的动作却慢了半拍。', C: 'TA 趴着没动，过了很久才说：「……那走吧。」', D: '「谁要你等。」TA 把书塞得乱七八糟，最后还是等了你。' }),
        journal: '· 自习室：等你' },
      { label: '「我在看这道题。」', fx: { aff: 4, study: 1 }, kind: 'love', title: '💡 讲题',
        text: lp({ A: '「哪道，我看看。」TA 坐过来了，其实他也不会。', B: '「哪道？我看看——哦，这个我不会。」TA 坐过来坐得很自然。', C: '「……哪道。」TA 看了一眼，「这个我也会错。」', D: '「你连这个都不会？」TA 坐过来了，看了半天，「……我也不会。」' }),
        journal: '· 自习室：讲题' },
      { label: '「我先走了，你锁门。」', fx: { aff: -6, sleep: 1 }, kind: 'love', title: '💡 先走了',
        text: `第二天早上，${ta}跟你说话时少了一点什么。你说不上来。`,
        journal: '· 自习室：先走了' },
    ],
    onResolve: () => { S.love.seen.e06 = true; },
  };
}

// 07 · 天台上的风（④）
function boyEvent07() {
  const ta = loveTa();
  return {
    t: 'choice',
    intro: {
      kind: 'love',
      title: '🌬️ 天台上的风',
      body: `天台风大。\n\n${ta}靠在栏杆上，把手插在兜里，看着远处。\n\n${ta}：「你怎么上来了。」`,
    },
    options: [
      { label: '「找你。」', fx: { aff: 9, social: 2, sleep: -1 }, kind: 'love', title: '🌬️ 找你',
        text: lp({ A: '「……找我干嘛。」TA 低着头，脚尖踢栏杆。', B: '「找我？」TA 转过身来，「那你找到啦。」语气很轻松，但耳朵先红了。', C: '「……找我。」TA 重复了一遍，像是要确认，「为什么。」', D: '「找我干嘛，我有什么好找的。」TA 低着头，脚尖一直在踢栏杆。' }),
        journal: '· 天台：找你' },
      { label: '「看风景。」', fx: { aff: 6, study: -1 }, kind: 'love', title: '🌬️ 看风景',
        text: lp({ A: '「你还挺有空的。」', B: '「可以啊，下次我们一起看。」', C: '「……你也喜欢来这看风景。」TA 看了你一眼，有点意外。', D: '「你特地来这看风景？」TA 明显不太信。' }),
        journal: '· 天台：借的钥匙' },
      { label: '「你一个人在这儿干什么。」', fx: { aff: 7, sleep: -1 }, kind: 'love', title: '🌬️ 问了一句',
        text: lp({ A: '「……没什么。就是不想回教室。」TA 停了停，「这风景不错。」', B: '「躲清静啊。」TA 笑了笑，「你怎么找到这儿的。」', C: '「……在想一道题。」TA 停了一下，「你上来，我就想不出来了。」', D: '「关你什么事。」TA 说完自己又补了一句，「……就是不想回教室。」' }),
        journal: '· 天台：问了一句' },
    ],
    onResolve: () => { S.love.seen.e07 = true; },
  };
}

// 08 · 比赛之后（④→⑤ 前置）
function boyEvent08() {
  const ta = loveTa();
  return {
    t: 'choice',
    intro: {
      kind: 'love',
      title: '🏆 比赛之后',
      body: `比赛输了。哨响之后${ta}一个人在场上站了很久，等所有人散了才走到你身边。\n\n${ta}：「你怎么还不走。」`,
    },
    options: [
      { label: '「陪你一会儿。」', fx: { aff: 12, social: 3, sleep: -1 }, kind: 'love', title: '🏆 陪你',
        text: lp({ A: 'TA「嗯」了一声，把外套脱下来搭在旁边，动作是让你坐那儿。', B: '「坐吧。」TA 拍了拍旁边的位置，「这视野好，能看到整个场子。」', C: 'TA 没说话，把书包从旁边挪开，留出半个位置。', D: '「随便你。」TA 往旁边挪了挪，位置留得比需要的大。' }),
        journal: '· 比赛之后：陪你',
        onPick: () => { S.flags.loveMilestones['陪着你'] = true; } },
      { label: '「输了就输了，下次赢回来。」', fx: { aff: 6, social: 1 }, kind: 'love', title: '🏆 安慰',
        text: `「……嗯。」${ta}笑了一下，但笑得不太对。`,
        journal: '· 比赛之后：安慰' },
      { label: '「打得挺差的。」（说实话）', fx: { aff: -8, social: -2 }, kind: 'love', title: '🏆 说实话',
        text: `「那你别看了。」${ta}起身离开。`,
        journal: '· 比赛之后：说实话' },
    ],
    onResolve: () => { S.love.seen.e08 = true; },
  };
}

// 09 · 说清楚（④→⑤）
function boyEvent09() {
  const c = loveChar();
  const ta = loveTa();
  const where = {
    A: '训练场边的器材室门口，灯只开了一半',
    B: '教学楼大厅的公告板前，人都走光了',
    C: '图书馆闭馆后的那排书架之间',
    D: '楼梯口的拐角，放学的铃声刚响过',
  }[c.key] || '楼梯口';
  let succeeded = false;
  return {
    t: 'choice',
    intro: {
      kind: 'love',
      title: '💗 说清楚',
      body: `${where}。\n\n${ta}堵在那儿，书包带子搭在一边肩上，站没站像。你走近了，他没让开。\n\n${ta}：「我说个事。」`,
    },
    options: [
      {
        label: '「你说。」', fx: { aff: 1, social: 5, study: -2 },
        kind: 'love', title: '💖 说清楚了',
        text: `${ta}张了张嘴，最后说：「算了。没事。」\n\n你「哦」了一声要走，他伸手把你拉住——只拉了书包带子。\n\n「我喜欢你。就这么简单。你答不答应。」\n\n（很久以后你才知道，${c.name} 真正想说的是：「${c.confess}」）`,
        journal: '· 告白成功',
        onPick: () => {
          const L = S.love;
          if (L.aff >= 90) {
            succeeded = true;
            L.confessed = true;
            L.aff = Math.max(L.aff, 91);
            L.peakAff = Math.max(L.peakAff || 0, L.aff);
            L.stage = 5;
            L.active = true;
            S.flags.confessions = (S.flags.confessions || 0) + 1;
            S.flags.neverTest = false;
            journal(`· 关系推进：${affStageAt(5).tag}`);
            journal(`· ${AFF_LOVER_BOY}`);
            netBroadcast(`莞中脱单了，对象是${L.name}`, '💗');
          } else {
            L.refused = true;
            S.flags.rejected++;
            S.flags.neverTest = false;
            addAff(-3);
          }
          renderHud();
        },
      },
      {
        label: '「你挡路了。」', fx: { aff: 0, social: 2, study: -2 },
        kind: 'love', title: '💬 挡路了',
        text: `${ta}：「……我挡路了。」\n\n他侧身让开，眼睛没看你。走了两步又停住：「要是我不挡呢。」`,
        journal: '· 告白：挡路了',
        onPick: () => {
          const L = S.love;
          // 好感已经到 95 以上，这句「要是我不挡呢」就是最后一次补救机会
          if (L.aff >= 95) {
            succeeded = true;
            L.confessed = true;
            L.aff = Math.max(L.aff, 91);
            L.peakAff = Math.max(L.peakAff || 0, L.aff);
            L.stage = 5;
            L.active = true;
            S.flags.confessions = (S.flags.confessions || 0) + 1;
            S.flags.neverTest = false;
            journal(`· 关系推进：${affStageAt(5).tag}`);
            journal(`· ${AFF_LOVER_BOY}`);
            netBroadcast(`在莞中脱单了，对象是${L.name}`, '💗');
          } else {
            L.refused = true;
            S.flags.rejected++;
            S.flags.neverTest = false;
            addAff(-6);
          }
          renderHud();
        },
      },
      {
        label: '「你脸色不太好，是不是不舒服。」', fx: { aff: -10, social: -1, sleep: -1 },
        kind: 'love', title: '💔 会错意了',
        text: `${ta}：「没有，我很好。」\n\n他笑了一下，让开了。那天之后，他有大概一周没主动找过你。`,
        journal: '· 告白：会错意',
        onPick: () => {
          S.love.refused = true;
          S.flags.rejected++;
          S.flags.neverTest = false;
          renderHud();
        },
      },
    ],
    onResolve: () => {
      if (succeeded) {
        S.love.seen.e09 = true;
        if (!S.love.keepsakes.includes('第二颗扣子')) S.love.keepsakes.push('第二颗扣子');
      }
    },
  };
}

const LOVE_STORY = [
  { id: 'e01', min: 8, build: loveEvent01 },
  { id: 'e02', min: 25, build: loveEvent02 },
  { id: 'e03', min: 40, build: loveEvent03 },
  { id: 'e04', min: 55, build: loveEvent04 },
  { id: 'e05', min: 62, build: loveEvent05 },
  { id: 'e06', min: 72, build: loveEvent06 },
  { id: 'e07', min: 80, build: loveEvent07 },
  { id: 'e08', min: 85, build: loveEvent08 },
  { id: 'e09', min: 90, build: loveEvent09 },
];

// 男生线：门槛与女生线完全一致，只是换了九段内容
const LOVE_STORY_BOY = [
  { id: 'e01', min: 8, build: boyEvent01 },
  { id: 'e02', min: 25, build: boyEvent02 },
  { id: 'e03', min: 40, build: boyEvent03 },
  { id: 'e04', min: 55, build: boyEvent04 },
  { id: 'e05', min: 62, build: boyEvent05 },
  { id: 'e06', min: 72, build: boyEvent06 },
  { id: 'e07', min: 80, build: boyEvent07 },
  { id: 'e08', min: 85, build: boyEvent08 },
  { id: 'e09', min: 90, build: boyEvent09 },
];

function loveStoryList() { return loveIsBoy() ? LOVE_STORY_BOY : LOVE_STORY; }

function buildLoveStoryEvent() {
  const L = S && S.love;
  if (!L || !L.met) return null;
  for (const ev of loveStoryList()) {
    if (L.seen[ev.id]) continue;
    if (L.aff < ev.min) return null;   // 没到门槛就停在这里，不跳级
    return ev.build();
  }
  return null;
}
/* ================================================================
   恋爱里程碑 · 好感 30 / 50 / 80 / 100
   每段是 3 层对话链，用 lp() 按性格取台词。
   ================================================================ */

function loveMilestone30() {
  const ta = loveTa();
  return makeLoveChain([
    {
      title: '🚶 一起走的放学路',
      body: `傍晚，校门口的树把影子拉得很长。你走出教学楼，看到${ta}背着书包站在车棚旁边，像是在等什么人。\n\n${lp({
        A: 'TA 也看到了你。两人对视一秒，TA 先移开了目光。',
        B: '「诶——正好！」TA 挥了挥手，朝你这边走过来。',
        C: 'TA 看你一眼，又低头翻书包，动作慢了下来。',
        D: '「你走得真慢。」TA 嘟囔了一句，但没走。',
      })}`,
      options: [
        { label: '「你在等人吗？」', fx: { aff: 4, social: 1 },
          text: lp({
            A: '「……没有。」TA 顿了一下，「就是站一会儿。」',
            B: '「等你啊！不对，我是说顺路。」TA 自己先笑了。',
            C: '「……没等谁。」TA 把书包带子紧了紧。',
            D: '「等你个头，我等公交。」TA 耳朵有点红。',
          }),
          journal: '· 好感30：问了 TA 一句' },
        { label: '走过去，什么也不说', fx: { aff: 3, sleep: 1 },
          text: lp({
            A: 'TA 没先开口。两个人一前一后走了两步，最后是 TA 先说话的。',
            B: '「诶，你怎么不说话？」TA 主动凑过来。',
            C: 'TA 也没有说话。两个人沉默地走着，风把树叶吹得沙沙响。',
            D: '「哑了？」TA 踢了一脚路边的小石子。',
          }),
          journal: '· 好感30：沉默地并肩' },
      ],
    },
    {
      title: '🚶 分岔路口',
      body: `前面的路口，一边是回家的方向，一边是小吃街。\n\n${lp({
        A: 'TA 在路口停住，等你先决定。',
        B: '「今天不想那么早回去。你呢？」TA 转头看你。',
        C: 'TA 看着远处，什么也不说。',
        D: '「你走哪边？」TA 问得很随意，但一直在看你。',
      })}`,
      options: [
        { label: '「一起去小吃街吧。」', fx: { aff: 5, social: 2, sleep: -1 },
          text: lp({
            A: '「……嗯。」TA 转身的时候，书包带子从肩上滑下来，TA 没管。',
            B: '「好啊好啊！我早就想去了！」',
            C: '「……好。」TA 跟上你的脚步，走得很近。',
            D: '「谁要跟你去。」但 TA 已经走在你旁边了。',
          }),
          journal: '· 好感30：一起去了小吃街' },
        { label: '「今天先回家吧。」', fx: { aff: 2, sleep: 2 },
          text: lp({
            A: '「……嗯。」',
            B: '「啊——好吧。」TA 的语气有点失落。',
            C: '「……好，路上小心。」',
            D: '「就知道你要跑。」',
          }) },
      ],
    },
    {
      title: '🚶 分别',
      body: `到了真的要分开的地方。\n\n${lp({
        A: 'TA 站在原地看着你，好像在等你说什么。',
        B: '「那我走这边啦！」但 TA 站着没动。',
        C: 'TA 点了一下头，转身要走。',
        D: '「喂，走了。」但 TA 的脚步没动。',
      })}`,
      options: [
        { label: '「明天见。」', fx: { aff: 3, social: 1 },
          text: lp({
            A: '「……明天见。」TA 说完才转身。',
            B: '「明天见！」TA 挥手，声音比平时大一点。',
            C: '「……明天见。」TA 走的时候回头看了一眼。',
            D: '「嗯。」TA 转身走得很快，没回头。',
          }),
          journal: '· 好感30：第一次说「明天见」',
          onPick: () => { S.flags.loveMilestones['ms30'] = true; } },
        { label: '「明天早读，我帮你占位置。」', fx: { aff: 5, social: 2 },
          text: lp({
            A: '「……不用。」但 TA 没拒绝。',
            B: '「真的？那我要靠窗那个！」',
            C: '「……随便哪个位置都可以。」',
            D: '「谁要你占。」TA 的脚步慢了一点。',
          }),
          journal: '· 好感30：答应占位置',
          onPick: () => { S.flags.loveMilestones['ms30'] = true; } },
      ],
    },
  ]);
}

function loveMilestone50() {
  const ta = loveTa();
  return makeLoveChain([
    {
      title: '🌧️ TA 淋了雨',
      body: `下午放学突然下起大雨。你在教学楼门口等到雨小一点才出来，走到校门口，看见${ta}站在公交站牌下面，校服外套的肩膀全湿了。\n\n${lp({
        A: 'TA 也看到了你，下意识往后退了半步，像是不想让你看见。',
        B: '「啊——倒霉死了！」TA 抱怨了一句，声音很大。',
        C: 'TA 站在那儿没动，头发贴在脸上。',
        D: '「看什么看。」TA 别过头去。',
      })}`,
      options: [
        { label: '「你伞呢？」', fx: { aff: 4, social: 1 },
          text: lp({
            A: '「……忘了带。」',
            B: '「出门的时候还是晴的！」',
            C: '「……早上忘了。」',
            D: '「关你什么事。」',
          }) },
        { label: '把自己伞递过去', fx: { aff: 6, social: 2, sleep: -1 },
          text: lp({
            A: '「……那你呢。」TA 没接。',
            B: '「你怎么办？」TA 也没接。',
            C: '「……不用。」但 TA 看了你一眼。',
            D: '「我不要。」TA 顿了顿，「……你撑吧。」',
          }),
          journal: '· 好感50：把伞递给 TA' },
      ],
    },
    {
      title: '🌧️ 一把伞的距离',
      body: `雨还没有停。公交站的人越来越多，TA 往你这边挤了一点。\n\n${lp({
        A: 'TA 和你保持着一拳的距离，但你能听到 TA 的呼吸。',
        B: '「这雨什么时候停啊。」TA 抬头看了看天。',
        C: 'TA 没有说话，只是把湿掉的头发别到耳后。',
        D: '「你站那么远干嘛。」TA 说，但自己也没靠近。',
      })}`,
      options: [
        { label: '「一起走吧，我先送你回去。」', fx: { aff: 8, social: 2, sleep: -1 },
          text: lp({
            A: '「……不用。」但 TA 在你开口前，已经挪到了伞下。',
            B: '「那太好了！」TA 直接走进伞下，肩膀贴上了你的胳膊。',
            C: '「……好。」TA 的声音很轻。',
            D: '「凭什么你送我。」但 TA 已经站在伞下了。',
          }),
          journal: '· 好感50：送 TA 回去' },
        { label: '「等雨停吧，不急。」', fx: { aff: 3, sleep: 1 },
          text: lp({
            A: '「……嗯。」',
            B: '「也行。」TA 重新靠回站牌。',
            C: '「……好。」',
            D: '「随便你。」',
          }) },
      ],
    },
    {
      title: '🌧️ 到你家楼下',
      body: `雨慢慢小了。到了 TA 家楼下的时候，天已经暗下来。\n\n${lp({
        A: 'TA 站在楼道口，回头看你，好像想说什么。',
        B: '「到了！谢谢你啊！」但 TA 还没进去。',
        C: 'TA 抬头看了一眼自家窗户，又看了看你。',
        D: '「行了，你回去吧。」但 TA 站着没走。',
      })}`,
      options: [
        { label: '「那……明天见。」', fx: { aff: 5, social: 1 },
          text: lp({
            A: '「……明天见。」TA 说得很轻。',
            B: '「明天见！」TA 挥挥手，转身进去了。',
            C: '「……明天见。」TA 上楼的时候，在楼梯拐角又看了一眼。',
            D: '「嗯。」TA 转身就走，门关得有点快。',
          }),
          journal: '· 好感50：第一次送 TA 回家',
          onPick: () => { S.flags.loveMilestones['ms50'] = true; } },
        { label: '「外套给你，明天还我。」', fx: { aff: 8, social: 2 },
          text: lp({
            A: '「……不用。」但 TA 已经把外套接过去了，抱在怀里。',
            B: '「啊？那你怎么办？」但 TA 接得很自然。',
            C: '「……谢谢。」TA 把外套披在肩上，站在原地看着你走了。',
            D: '「谁要你外套。」TA 把它塞进书包里。',
          }),
          journal: '· 好感50：留下外套',
          onPick: () => { S.flags.loveMilestones['ms50'] = true; } },
      ],
    },
  ]);
}

function loveMilestone80() {
  const ta = loveTa();
  return makeLoveChain([
    {
      title: '🌙 教室只剩你们两个',
      body: `晚修结束，教室里的人陆续走光了。等最后一盏灯熄掉，你才发现${ta}还坐在位置上，假装在收书包，其实一个字都没动。\n\n${lp({
        A: 'TA 抬起头，和你视线撞上，很快又低下去。',
        B: '「诶，你怎么还不走？」TA 问得很随意，但书包还开着。',
        C: 'TA 看着你，没有开口。',
        D: '「你站那干嘛，走啊。」但 TA 的手还在桌肚里。',
      })}`,
      options: [
        { label: '「我在等你。」', fx: { aff: 10, social: 3, sleep: -1 },
          text: lp({
            A: '「……等我做什么。」TA 的声音很轻，手上动作停了。',
            B: '「等我？」TA 愣了一下，「那你早说啊。」',
            C: '「……嗯。」TA 把书包拉好，站起来。',
            D: '「谁要你等。」但 TA 的书收得比平时快。',
          }),
          journal: '· 好感80：承认在等 TA' },
        { label: '「没什么，收拾得慢。」', fx: { aff: 3 },
          text: lp({
            A: '「……哦。」',
            B: '「哦——那我先走了啊。」但 TA 没动。',
            C: 'TA 点了点头，把书塞进书包。',
            D: '「磨蹭什么。」但 TA 也在磨蹭。',
          }) },
      ],
    },
    {
      title: '🌙 走廊上',
      body: `两个人一前一后走出教学楼。走廊里只剩应急灯，把两个人的影子照在地上，一长一短。\n\n${lp({
        A: 'TA 走在前面，脚步很慢，像是在等你跟上来。',
        B: '「你说，我们这样算不算……」TA 没说完。',
        C: 'TA 忽然停下来，抬头看天。',
        D: '「嗯……」TA 欲言又止。',
      })}`,
      options: [
        { label: '「算什么？」', fx: { aff: 6, social: 1 },
          text: lp({
            A: '「……没什么。」TA 转过身去，走在前面。',
            B: '「算、算认识啊！」TA 说完就后悔了。',
            C: '「……算朋友吧。」TA 说得不确定。',
            D: '「算你个头。」TA 自己先走了。',
          }),
          journal: '· 好感80：把话追问下去' },
        { label: '「你继续说。」', fx: { aff: 7, sleep: -1 },
          text: lp({
            A: 'TA 站了两秒，最后什么都没说，只是把脚步放得更慢了。',
            B: '「啊……算了算了，当我没说。」',
            C: '「……下次吧。」TA 说完自己笑了一下。',
            D: '「不说。」TA 走得很快，把你甩在后面。',
          }),
          journal: '· 好感80：让 TA 说完' },
      ],
    },
    {
      title: '🌙 天桥上',
      body: `走到天桥上，远处的高楼亮着零星的灯。TA 停下来，靠在栏杆上。\n\n${lp({
        A: 'TA 看着远处，什么也不说。风把 TA 的头发吹到眼睛前面。',
        B: '「我以后想去一个很远的城市。」TA 忽然说。',
        C: '「你说，长大以后，会不会忘记现在。」TA 说得像自言自语。',
        D: '「喂。」TA 没回头，「你会不会觉得我很烦。」',
      })}`,
      options: [
        { label: '「不会忘。」', fx: { aff: 8, social: 2 },
          text: lp({
            A: '「……你怎么知道。」但 TA 的语气里有一种放松下来的东西。',
            B: '「诶，我也是！」TA 回过头来，眼睛亮了一下。',
            C: '「……嗯。」TA 看着远处，嘴角好像动了一下。',
            D: '「你烦。」TA 转过来瞪你一眼，「……那你还老跟着我。」',
          }),
          journal: '· 好感80：答应了「不会忘」',
          onPick: () => { S.flags.loveMilestones['ms80'] = true; } },
        { label: '「不知道。但今天不会忘。」', fx: { aff: 9, social: 2 },
          text: lp({
            A: 'TA 看了你很久，最后只说了三个字：「……真会说。」',
            B: '「你今天说话好恶心。」但 TA 笑了。',
            C: '「……好。」TA 把这句话记进去了。',
            D: '「什么啊。」TA 转过身去，「肉麻。」',
          }),
          journal: '· 好感80：「今天不会忘」',
          onPick: () => { S.flags.loveMilestones['ms80'] = true; } },
      ],
    },
  ]);
}

function loveMilestone100() {
  const ta = loveTa();
  return makeLoveChain([
    {
      title: '🎓 毕业典礼前夜',
      body: `毕业典礼的前一晚，学校里到处都是搬东西的人。你和${ta}留到最后，两个人坐在操场看台上，什么也不做。\n\n${lp({
        A: 'TA 把头靠在膝盖上，和你隔着一个座位的距离。',
        B: '「明天就毕业了诶。」TA 的语气和平时不太一样。',
        C: 'TA 看着操场，没有说话。',
        D: '「真快。」TA 只说了两个字。',
      })}`,
      options: [
        { label: '伸手，握住 TA 的手', fx: { aff: 10, social: 3 },
          text: lp({
            A: 'TA 的手抖了一下，但没有抽开。',
            B: 'TA 反握回来，力气比你想的大。',
            C: 'TA 没有动。你能感觉到 TA 的掌心有一层薄薄的汗。',
            D: '「干嘛。」但 TA 的五指扣了上来。',
          }),
          journal: '· 好感100：看台上牵了手' },
        { label: '往 TA 那边挪了一个座位', fx: { aff: 7, social: 2 },
          text: lp({
            A: 'TA 没有让开。你的肩膀贴上了 TA 的肩膀。',
            B: '「哦。」TA 往旁边让了一点，又挪回来一点。',
            C: 'TA 侧过脸，看着你。',
            D: '「你挤什么。」但 TA 没动。',
          }),
          journal: '· 好感100：挪近了一个座位' },
      ],
    },
    {
      title: '🎓 说过的话',
      body: `操场的灯熄了一半，远处教室的窗还亮着几盏。\n\n${lp({
        A: '「……以后，我们还会像现在这样吗。」TA 问得很轻。',
        B: '「你说，去了大学以后，我们还会不会见面啊？」',
        C: '「……我在想一件事。」',
        D: '「喂。」TA 顿了一下，「你以后……会不会把我忘了。」',
      })}`,
      options: [
        { label: '「不会。不管去哪里。」', fx: { aff: 10, social: 2 },
          text: lp({
            A: '「……你保证。」',
            B: '「你说的啊！反悔的是小狗！」',
            C: '「……好，我记住了。」',
            D: '「谁要你保证。」但 TA 一直看着你。',
          }),
          journal: '· 好感100：许下承诺' },
        { label: '「不知道。但我现在，只想坐在这里。」', fx: { aff: 9, social: 2 },
          text: lp({
            A: '「……嗯。」TA 把头靠回膝盖上。',
            B: '「……你这人怎么这样。」但 TA 笑了。',
            C: '「……好。」',
            D: '「行吧。」TA 往你这边挪了挪。',
          }),
          journal: '· 好感100：坐在这里' },
      ],
    },
    {
      title: '🎓 毕业那天的早上',
      body: `第二天早上，你穿好校服，走出宿舍。TA 已经在等你了。\n\n${lp({
        A: 'TA 手里拎着两杯豆浆，看到你就递了一杯过来。',
        B: '「早！毕业快乐！」TA 的声音比平时大。',
        C: 'TA 站在晨光里，校服被风吹得鼓起来。',
        D: '「磨蹭。」但 TA 把手里那杯豆浆举了半天。',
      })}`,
      options: [
        { label: '「毕业快乐。」接过来', fx: { aff: 6, social: 2 },
          text: lp({
            A: '「……嗯。」',
            B: '「毕业快乐！」',
            C: '「……毕业快乐。」',
            D: '「嗯，毕业快乐。」',
          }),
          journal: '· 好感100：毕业快乐',
          onPick: () => { S.flags.loveMilestones['ms100'] = true; } },
        { label: '「走吧，一起去礼堂。」', fx: { aff: 6, social: 1 },
          text: lp({
            A: '「……好。」',
            B: '「走！」',
            C: '「……好。」',
            D: '「走着瞧。」',
          }),
          journal: '· 好感100：一起去礼堂',
          onPick: () => { S.flags.loveMilestones['ms100'] = true; } },
      ],
    },
  ]);
}

/* 里程碑触发检查：按好感从低到高顺序触发，每档只触发一次 */
function buildLoveMilestoneEvent() {
  const L = S && S.love;
  if (!L || !L.met) return null;
  if (!S.flags.loveMilestones || typeof S.flags.loveMilestones !== 'object') S.flags.loveMilestones = {};
  const ms = S.flags.loveMilestones;
  if (L.aff >= 30 && !ms['ms30']) return loveMilestone30();
  if (L.aff >= 50 && !ms['ms50']) return loveMilestone50();
  if (L.aff >= 80 && !ms['ms80']) return loveMilestone80();
  // ms100 是毕业前的对话，必须等高三下学期（semIdx === 5）才触发
  if (L.confessed && L.aff >= 100 && S.semIdx === 5 && !ms['ms100']) return loveMilestone100();
  return null;
}

/* ---------------- 日常闲聊 / 手机消息 ---------------- */
const LOVE_CHAT = {
  '教室 · 早晨': [
    { t: '「早。」（TA 点了点头，没有看你）', minAff: 0 },
    { t: '「早，今天第一节是数学吧。」', minAff: 20 },
    { t: '「给你留了位置，靠窗那个。」', minAff: 40 },
    { t: '「……你今天来得比平时早。」（TA 把书往旁边挪了挪）', minAff: 55 },
    { t: '「早啊。昨晚睡得好吗？」（TA 把手里的牛奶推到你桌上）', minAff: 70 },
  ],
  '走廊 · 课间': [
    { t: '「借过。」', minAff: 0 },
    { t: '「你也去办公室？」', minAff: 25 },
    { t: '「等一下我，我跟你一起。」', minAff: 45 },
    { t: '「刚才……你身边那个女生是谁？」', minAff: 65 },
    { t: '「放学等我，别又自己先走了。」', minAff: 80 },
  ],
  '食堂 · 午餐': [
    { t: '「……」TA 端着餐盘走开了', minAff: 0 },
    { t: '「那个菜不好吃，别打。」', minAff: 25 },
    { t: '「我这儿有多的一双筷子。」', minAff: 45 },
    { t: '「你尝一口这个。」（TA 把餐盘往你那边推了推）', minAff: 65 },
    { t: '「今天我来打饭，你坐着。」', minAff: 80 },
  ],
  '放学 · 校门口': [
    { t: '「再见。」', minAff: 0 },
    { t: '「明天见。」', minAff: 20 },
    { t: '「你走哪边？顺路的话……」', minAff: 45 },
    { t: '「我等你。」（TA 说得很轻，像是怕被人听见）', minAff: 65 },
    { t: '「今天绕远一点回去吧，我不想那么快到家。」', minAff: 80 },
  ],
};

// 男生线闲聊库：把「食堂 · 午餐」换成「球场 · 课间」，其余场合对齐女生线
const LOVE_CHAT_BOY = {
  '教室 · 早晨': [
    { t: '「让一下。」（TA 绕过你的桌子，没抬眼）', minAff: 0 },
    { t: '「作业，借我看一眼。」', minAff: 20 },
    { t: '「给你留了位置，后边。前面太吵。」', minAff: 40 },
    { t: '「你今天来得挺早。」（TA 说完就把头转向窗外）', minAff: 55 },
    { t: '「早饭在桌上。别说不好吃。」', minAff: 70 },
  ],
  '走廊 · 课间': [
    { t: '「借过。」', minAff: 0 },
    { t: '「你也上这节课？」', minAff: 25 },
    { t: '「等你——不是，刚好碰上。」', minAff: 45 },
    { t: '「刚才跟你说话的那个是几班的。」', minAff: 65 },
    { t: '「放学别自己走。等我。」', minAff: 80 },
  ],
  '球场 · 课间': [
    { t: '「让让。」', minAff: 0 },
    { t: '「你会打吗？过来。」', minAff: 25 },
    { t: '「传球！……算了，你跑位太慢。」', minAff: 45 },
    { t: '「今天不打了。」（TA 把球收起来，你问为什么，TA 说「不想打」）', minAff: 65 },
    { t: '「你今天看我打球了吗？……哦，那你以后都来看。」', minAff: 80 },
  ],
  '放学 · 校门口': [
    { t: '「我先走了。」', minAff: 0 },
    { t: '「明天见。」', minAff: 20 },
    { t: '「顺路，一起。」', minAff: 45 },
    { t: '「你走快点。」（然后自己放慢了）', minAff: 65 },
    { t: '「今天绕远点吧，回去也没什么。」', minAff: 80 },
  ],
};

function loveChatTable() { return loveIsBoy() ? LOVE_CHAT_BOY : LOVE_CHAT; }

const LOVE_MSG = {
  2: ['老师说的作业是第几页', '不用了，我找到了'],
  3: ['明天带伞，天气预报说要下雨', '不是特意提醒你，我群发'],
  4: ['睡了吗', '没什么事', '……晚安'],
  5: ['今天谢谢你陪我走那么远', '明天见', '晚安，做个好梦'],
};

// 男生线消息库：短、硬、经常在最后一句改口
const LOVE_MSG_BOY = {
  2: ['明天早上几点到校', '没事，我自己起来了就行', '（撤回了一条消息）'],
  3: ['周六有空吗，出去？随便什么地方', '别磨叽，回我', '行，你说吧'],
  4: ['睡了吗', '没事，你睡吧', '……今天那个事，算了'],
  5: ['到家了吗', '刚刚那个路口我应该陪你走过去的', '晚安。明天见。'],
};
// 已读不回攒到第三次，男生线的写法是「我也忙」
const LOVE_MSG_BOY_IGNORED = ['你最近挺忙的', '没事，我也忙'];

function loveMsgTable() { return loveIsBoy() ? LOVE_MSG_BOY : LOVE_MSG; }

function buildLoveChatEvent() {
  const L = S.love;
  const st = clamp(L.stage, 1, 5);
  const table = loveChatTable();
  const place = pick(Object.keys(table));
  const pool = table[place];
  // 按当前好感筛选可用台词，再随机抽一条；池子为空时退回最低门槛那条
  const available = pool.filter((item) => L.aff >= (item.minAff || 0));
  const line = (available.length ? pick(available) : pool[0]).t;
  // 男生线成就「绕远的那条路」：把「顺路」走了三个学期
  if (loveIsBoy() && place === '放学 · 校门口' && st >= 3) {
    S.flags.boyWalks = (S.flags.boyWalks || 0) + 1;
    if (S.flags.boyWalks >= 3 && !S.flags.loveMilestones['绕远的那条路']) {
      S.flags.loveMilestones['绕远的那条路'] = true;
      journal('· 成就「绕远的那条路」：「顺路」走了三个学期');
    }
  }
  return {
    t: 'text',
    kind: 'love',
    title: `💬 ${place}`,
    body: `${line}\n\n（${loveTa()}现在叫你「${loveCall()}」。）`,
    fx: { aff: 1 },
    journal: `· 日常：${place}`,
  };
}

function buildPhoneMsgEvent() {
  const L = S.love;
  const st = clamp(L.stage, 2, 5);
  const table = loveMsgTable();
  const pool = table[st] || table[2];
  const msgs = pool.map((m) => `${L.name}：${m}`).join('\n');
  // 男生线：连着已读不回两次之后，第三条消息的口气会变
  const boyIgnoredText = (S.flags.boyIgnored || 0) >= 2
    ? `${L.name}：${LOVE_MSG_BOY_IGNORED[0]}\n\n隔了很久，又来一条。\n\n${L.name}：${LOVE_MSG_BOY_IGNORED[1]}\n\n你把手机扣在桌上。写完最后一道题再看，那边没有再发来第三条。`
    : '你把手机扣在桌上。写完最后一道题再看，那边没有再发来第二条。';
  return {
    t: 'choice',
    intro: {
      kind: 'love',
      title: '📱 晚间的消息',
      body: `熄灯前，手机亮了一下。\n\n${msgs}`,
    },
    options: [
      { label: '立刻回，还多聊了两句', fx: { aff: 3, sleep: -1 }, kind: 'love', title: '📱 聊到很晚',
        text: '你回得很快，那边也回得很快。一来一回，熄灯铃响了两遍才收住。', journal: '· 晚间消息：立刻回' },
      { label: '过一会儿再回，简短几个字', fx: {}, kind: 'love', title: '📱 简短回复',
        text: '你盯着屏幕想了半天，最后只发了两个字。那边回了个「嗯」。', journal: '· 晚间消息：简短回' },
      { label: '已读不回，先写作业', fx: { aff: -4, study: 2 }, kind: 'love', title: '📱 已读不回',
        text: loveIsBoy() ? boyIgnoredText : '你把手机扣在桌上。写完最后一道题再看，那边没有再发来第二条。',
        journal: '· 晚间消息：已读不回',
        onPick: () => { if (loveIsBoy()) S.flags.boyIgnored = (S.flags.boyIgnored || 0) + 1; } },
    ],
  };
}

/* ---------------- 约会 ---------------- */
const DATE_SPOTS = [
  { name: '1點點奶茶店', s3: '「你喝什么？我随便。」', s5: '「我们点一杯就够了，喝不完。」', fx: { aff: 6, social: 4, study: -2, sleep: -1 } },
  { name: '新华书店', s3: '「你先逛，我在那边。」', s5: '「这本……你看过吗？我想买给你。」', fx: { aff: 6, study: 2, sleep: -1 } },
  { name: '星汇电影院', s3: '「你选吧，我都行。」', s5: '「刚才那段，我其实没怎么看。」', fx: { aff: 7, social: 3, sleep: -2 } },
  { name: '人民公园', s3: '「走一圈就回去吧。」', s5: '「再坐一会儿，好不好？」', fx: { aff: 6, social: 3, sleep: 1 } },
  { name: '可园', s3: '「这儿景色不错。」', s5: '「以后我们也来这儿吧，就我们俩。」', fx: { aff: 8, social: 4, study: -1 } },
  { name: '象塔街', s3: '「……这边挺安静的。」', s5: '「你说，毕业以后我们会怎么样？」', fx: { aff: 9, social: 5, study: -2, sleep: -1 } },
];

// 男生线约会地点：能一起「做点什么」的地方优先，纯坐着聊天的地方靠后
const DATE_SPOTS_BOY = [
  { name: '篮球场', s3: '「你站边上，别给人撞了。」', s5: '「教你投篮。手抬高点——你这个手，我扶着。」', fx: { aff: 8, social: 4, study: -1, sleep: -1 } },
  { name: '波波台球厅', s3: '「输的人请喝水。」', s5: '「再来一局。这把不算，你刚才把我手挡了。」', fx: { aff: 7, social: 3, sleep: -1 } },
  { name: '图书馆', s3: '「你安静点。」', s5: '「这本我也看过了。你看到哪页了？」', fx: { aff: 6, study: 2, sleep: -1 } },
  { name: '新华书店', s3: '「你挑吧，我随便。」', s5: '「这本给你。」（他付过钱了）', fx: { aff: 6, study: 2, sleep: -1 } },
  { name: '人民公园', s3: '「走一圈就回。」', s5: '「坐会儿。……你冷吗。」', fx: { aff: 6, social: 3, sleep: 1 } },
  { name: '象塔街', s3: '「这儿好安静。」', s5: '「以后常来这儿吧。就我们俩。」', fx: { aff: 9, social: 5, study: -2, sleep: -1 } },
  { name: '湘川木桶饭', s3: '「你吃辣的还是不放辣。」', s5: '「给你点的。我记着你上次说这个好吃。」', fx: { aff: 7, social: 4, study: -2, sleep: -1 } },
  { name: '东莞宾馆餐厅', s3: '「这个好吃，你尝尝。」', s5: '「好吃(￣▽￣)，以后还来！」', fx: { aff: 10, social: 4, study: -2, sleep: -1 } },
];

function dateSpots() { return loveIsBoy() ? DATE_SPOTS_BOY : DATE_SPOTS; }

function buildDateEvent() {
  const L = S.love;
  const ta = loveTa();
  const inviteChance = clamp(0.35 + L.aff / 200 + (S.social - 50) / 300, 0.15, 0.92);

  if (!chance(inviteChance)) {
    return {
      t: 'text',
      kind: 'love',
      title: '🌆 邀约没成',
      body: loveIsBoy()
        ? `${L.name}：「那天我有事。」\n\n没有任何解释，也没有替补时间。你发出去的消息停在最上面。`
        : `你发出去的消息停在那儿。过了很久，${L.name} 才回：「那天我有事。」\n\n拒绝得很快，快到像是提前准备好的。`,
      fx: { aff: -2, social: -1 },
      journal: '· 邀约失败',
    };
  }

  // 男生线多一档「勉强答应」：好感没到 60 的时候，他先吊你一下再回
  if (loveIsBoy() && L.aff < 60 && chance(0.4)) {
    return {
      t: 'text',
      kind: 'love',
      title: '🌆 邀约勉强成了',
      body: `${L.name}：「……我看看。」\n\n两个小时后，手机又亮了一下。\n\n${L.name}：「几点？」`,
      fx: { aff: 2, social: 1 },
      journal: '· 邀约：勉强答应',
    };
  }

  const stage5 = L.stage >= 5;
  const spots = shuffle(dateSpots()).slice(0, 3);
  return {
    t: 'choice',
    intro: {
      kind: 'love',
      title: '🌆 周末约会',
      body: loveIsBoy()
        ? `${L.name}：「行。几点？」\n\n回得很快，快到有点不像他。你盯着那行字看了一会儿，才想起来要去哪儿。`
        : `${L.name} 回得比你想的快：「……好啊。几点？」\n\n你盯着那行字看了一会儿，才想起来要去哪儿。`,
    },
    options: spots.map((sp) => {
      // 结算质量由好感 + 社交决定，每个地点单独掷骰
      const q = L.aff + S.social * 0.3 + rnd(-15, 15);
      const key = q >= 105 ? 'big' : q >= 80 ? 'ok' : q >= 58 ? 'meh' : 'bad';
      const settleGirl = {
        big: `${ta}今天笑了很多次。回去的路上，${ta}一直走在你左边。`,
        ok: '今天还不错。TA 主动说了三次话。',
        meh: 'TA 好像有点心不在焉。',
        bad: `TA 一路上都在看手机。送你到路口的时候，TA 说「就送到这儿吧」。`,
      }[key];
      const settleBoy = {
        big: `${ta}今天笑了很多次——那种他以为你没看见的笑。回去的路上，他一直走在你左边，把车流的那一侧留给自己。`,
        ok: '今天还行。他有两次话说到一半，改口了。',
        meh: `${ta}今天一直在看手机。`,
        bad: `${ta}说「到这儿吧，我看着你进去」。你回头的时候，他已经走了。`,
      }[key];
      const settle = loveIsBoy() ? settleBoy : settleGirl;
      const scale = { big: 1.2, ok: 1, meh: 0.4, bad: -0.6 }[key];
      const gain = Math.round(sp.fx.aff * scale);
      return {
        label: `去${sp.name}`,
        fx: { ...sp.fx, aff: gain },
        kind: 'love',
        title: `🌆 ${sp.name}`,
        text: `${stage5 ? sp.s5 : sp.s3}\n\n${settle}`,
        journal: `· 约会：${sp.name}`,
        onPick: () => { if (S.love) S.love.dates = (S.love.dates || 0) + 1; },
      };
    }),
  };
}

// 恋爱中偶尔出现的摩擦
function buildLoveFrictionEvent() {
  const ta = loveTa();
  const reconcileChance = clamp(0.45 + S.love.aff / 250, 0.3, 0.9);
  return {
    t: 'choice',
    intro: {
      kind: 'love',
      title: '💢 吵架',
      body: loveIsBoy()
        ? `因为一件小事，你们在走廊尽头争了起来。声音不大，但都很倔。\n\n${ta}先不说话了。这种安静你以前没见过。`
        : `因为一件小事，你们在走廊尽头争了起来。声音不大，但都很倔。`,
    },
    options: [
      {
        label: '先低头，好好说',
        fx: { aff: 2, social: 3, sleep: -1 },
        kind: 'love',
        title: '🕊️ 和好',
        text: loveIsBoy()
          ? `你把「对不起」说得很小声。${ta}「嗯」了一声，把手里的水递过来，没看你。`
          : `你把「对不起」说得很小声。${ta}假装没听见，但递过来一颗糖。`,
        journal: '· 吵架和好',
        onPick: () => {
          if (chance(reconcileChance)) { S.love.points++; }
          else { addAff(-6); }
          renderHud();
        },
      },
      {
        label: '谁也别理谁',
        fx: { aff: -8, sleep: -2, social: -2, study: -2 },
        kind: 'love',
        title: '💔 冷战',
        text: loveIsBoy()
          ? `冷战三天后，${ta}把之前借你的东西放在你桌上，什么也没说：「……就这样吧。」`
          : `冷战三天后，${ta}把你还的笔记放在你桌上：「就这样吧。」`,
        journal: '· 冷战',
        onPick: () => {
          S.love.cold = (S.love.cold || 0) + 2;
          if (S.love.aff <= 30) {
            S.love.met = false;
            S.love.char = null;
            S.love.name = '';
            S.love.aff = 0;
            S.love.stage = 1;
            S.love.active = false;
            S.love.seen = {};
            S.flags.breakups++;
            logEvent('love', '💔 关系破裂', affBreakText(), null);
            journal('· 分手');
          }
          renderHud();
        },
      },
    ],
  };
}

function buildLoveCasualEvent() {
  const L = S && S.love;
  if (!L || !L.met) return null;
  const roll = Math.random();
  if (L.aff >= 71 && roll < 0.3) return buildLoveFrictionEvent();
  if (L.aff >= 46 && roll < 0.62) return buildDateEvent();
  if (L.aff >= 46 && roll < 0.82) return buildPhoneMsgEvent();
  return buildLoveChatEvent();
}

/* ---------------- 节日 ---------------- */
function buildLoveFestivalEvent() {
  const L = S && S.love;
  if (!L || !L.met) return null;
  const month = parseInt(phaseFor(S.round), 10);
  const ta = loveTa();
  const sems = (key) => {
    if (!Array.isArray(S.flags[key])) S.flags[key] = [];
    return S.flags[key];
  };

  // 生日（遇见时随机确定月份）
  if (L.flags.bday === month && !sems('bdaySems').includes(S.semIdx)) {
    return {
      t: 'choice',
      intro: {
        kind: 'love',
        title: '🎂 TA 的生日',
        body: `${month} 月。你翻到日历上那个被自己圈起来的日子——今天是${L.name} 的生日。`,
      },
      options: [
        { label: '记得，而且准备了礼物', fx: { aff: 15, sleep: -2, study: -1 }, kind: 'love', title: '🎂 准备了礼物',
          text: loveIsBoy()
            ? lp({ A: '「……你怎么知道。」TA 把礼物收得很紧，一直没拆。', B: '「你居然记得？」TA 笑着拆了一半，忽然停住，把盒子抱在怀里。', C: '「……谢谢。」TA 把盒子放在膝盖上看了很久，没有当场拆。', D: '「谁让你送的。」TA 把盒子收得很紧，一整个下午都放在手边。' })
            : lp({ A: '「你怎么会知道……」TA 捏着盒子，很久没拆。', B: '「哇——你居然记得！」TA 差点跳起来。', C: '「…………谢谢你。我有很久没过生日了。」', D: '「谁、谁要你送礼物了。」TA 抱着盒子不撒手。' }),
          journal: '· 生日：准备了礼物',
          onPick: () => { sems('bdaySems').push(S.semIdx); } },
        { label: '只在手机上发了「生日快乐」', fx: { aff: 2 }, kind: 'love', title: '🎂 线上祝福',
          text: loveIsBoy()
            ? `「哦，谢了。」${ta}回得很快，但没有再多说一句。`
            : `「嗯，谢谢。」${ta}回得很快，但没有再多说一句。`,
          journal: '· 生日：线上祝福',
          onPick: () => { sems('bdaySems').push(S.semIdx); } },
      ],
    };
  }

  // 校际比赛日（男生线专属）：10 月，一次
  if (loveIsBoy() && month === 10 && !sems('matchSems').includes(S.semIdx)) {
    return {
      t: 'choice',
      intro: {
        kind: 'love',
        title: '🏟️ 校际比赛日',
        body: `10 月，校际比赛。球场旁挤满了人，横幅被风吹得啪啪响。\n\n${L.name} 的名字在出场名单的第三个。`,
      },
      options: [
        { label: '站到最前面，喊他的名字', fx: { aff: 10, social: 3, sleep: -1 }, kind: 'love', title: '🏟️ 到场加油',
          text: `${ta}上场前在人群中扫了一圈，找到你。什么都没说，但下场之后往你这边扔了毛巾。`,
          journal: '· 校际比赛：到场加油',
          onPick: () => { sems('matchSems').push(S.semIdx); } },
        { label: '去了，但站在人群后面', fx: { aff: 4, social: 1 }, kind: 'love', title: '🏟️ 站在后面',
          text: `你站在人群后面看完了全场。散场的时候，${ta}在出口那儿站了一会儿，好像在等人。`,
          journal: '· 校际比赛：站后面',
          onPick: () => { sems('matchSems').push(S.semIdx); } },
        { label: '没去', fx: { aff: -8, social: -1 }, kind: 'love', title: '🏟️ 没去',
          text: `${ta}：「今天来的人挺多。」\n\n他没有问你为什么没来。`,
          journal: '· 校际比赛：没去',
          onPick: () => { sems('matchSems').push(S.semIdx); } },
      ],
    };
  }

  // 情人节 2/14
  if (month === 2 && !sems('valentineSems').includes(S.semIdx)) {
    // 男生线：好感不到 60 的时候，亲手做的东西他接得没那么顺
    const boyHandFx = L.aff < 60 ? { aff: 6, sleep: -2, study: -1 } : { aff: 12, sleep: -2, study: -1 };
    return {
      t: 'choice',
      intro: {
        kind: 'love',
        title: '🍫 情人节',
        body: `2 月 14 日。教室里飘着巧克力味，走廊上有人偷偷往别人抽屉里塞东西。\n\n你摸了摸书包——你准备礼物了吗？`,
      },
      options: [
        { label: '自己做的，包装歪歪扭扭', fx: loveIsBoy() ? boyHandFx : { aff: 12, sleep: -2, study: -1 }, kind: 'love', title: '🍫 手作礼物',
          text: loveIsBoy()
            ? (L.aff < 60
              ? `「……你自己做的？」${ta}拆开纸的时候手有点抖，拆坏了。他看了你一眼，眼神里透出惊喜。`
              : `「……你做的？」${ta}拆开纸的时候手有点抖，拆坏了。`)
            : `「……你自己做的？」${ta}拆开包装纸的时候手有点抖。`,
          journal: '· 情人节：手作礼物',
          onPick: () => { sems('valentineSems').push(S.semIdx); } },
        { label: '买了现成的', fx: { aff: loveIsBoy() ? 6 : 5 }, kind: 'love', title: '🍫 买来的礼物',
          text: loveIsBoy()
            ? `「谢了。」${ta}塞进书包。第二天你看到包装纸的角还露在外面。`
            : `「谢谢。」${ta}收下了，放进书包最里面。`,
          journal: '· 情人节：买来的',
          onPick: () => { sems('valentineSems').push(S.semIdx); } },
        { label: '什么都没准备', fx: { aff: loveIsBoy() ? -6 : -8, social: -1 }, kind: 'love', title: '🍫 空手',
          text: loveIsBoy()
            ? `下午，${ta}把一个纸袋放在你桌上就走了。你打开，是一盒巧克力，名牌的，标签都没撕。\n\n你追出去，人已经没影了。`
            : `${ta}看了你一眼，什么都没说，把手里那个小盒子塞回了口袋。`,
          journal: '· 情人节：空手',
          onPick: () => { sems('valentineSems').push(S.semIdx); } },
      ],
    };
  }

  // 圣诞节 12/25
  if (month === 12 && !sems('christmasSems').includes(S.semIdx)) {
    const lover = L.stage >= 5;
    return {
      t: 'choice',
      intro: {
        kind: 'love',
        title: '🎄 圣诞节',
        body: `12 月 25 日，下午下课后。广播里放着陈奕迅的《Lonely Christmas》，有的同学在做手工圣诞树，有点同学在写贺卡。\n\n${ta}在你桌边停下来。`,
      },
      options: [
        lover
          ? { label: '「今年我们两个人一起过吧。」', fx: { aff: 6, social: 3, sleep: -1 }, kind: 'love', title: '🎄 两个人的圣诞',
              text: loveIsBoy()
                ? `「……行。」${ta}答应得很快，快到像早就等着这句话。`
                : `「……好。」${ta}答应得很轻，但一直没有走开。`,
              journal: '· 圣诞：两个人过',
              onPick: () => { sems('christmasSems').push(S.semIdx); } }
          : { label: '「那天你有安排吗？」', fx: { aff: 7, sleep: -1 }, kind: 'love', title: '🎄 问了圣诞',
              text: loveIsBoy()
                ? `${ta}：「……没有。」\n\n他顿了一下，又补一句：「你问这个干嘛。」`
                : `${ta}：「……没有。」\n\n问完 TA 就后悔了，赶紧补一句：「我就随口问问。」`,
              journal: '· 圣诞：问了安排',
              onPick: () => { sems('christmasSems').push(S.semIdx); } },
        { label: '装作没看见，继续刷题', fx: { aff: -4, study: 2 }, kind: 'love', title: '🎄 继续刷题',
          text: `${ta}站了一会儿，走了。你把那道题又算了一遍，还是没算对。`,
          journal: '· 圣诞：继续刷题',
          onPick: () => { sems('christmasSems').push(S.semIdx); } },
      ],
    };
  }

  return null;
}

/* pickEvent done */

/* ---------------- 考试 / 学期结算 ---------------- */
/*对应莞中水平*/ 
function gaokaoBandForStudy(study) {
  const value = clamp(study);
  if (value < 30) {
    return {
      id: 'bottom', label: '年级末流', rangeLabel: '415 分上下',
      low: 415, high: 460,
      expected: Math.round(415 + (value / 30) * 45),
    };
  }
  if (value < 50) {
    return {
      id: 'low', label: '年级中下游', rangeLabel: '460～520 分',
      low: 460, high: 520,
      expected: Math.round(460 + ((value - 30) / 20) * 60),
    };
  }
  if (value < 60) {
    return {
      id: 'middle', label: '年级中游', rangeLabel: '520～545 分',
      low: 520, high: 545,
      expected: Math.round(520 + (value - 50) * 2.5),
    };
  }
  if (value < 70) {
    return {
      id: 'upper-middle', label: '年级中上游', rangeLabel: '545～575 分',
      low: 545, high: 575,
      expected: Math.round(545 + (value - 60) * 3),
    };
  }
  if (value < 80) {
    return {
      id: 'up', label: '年级上游', rangeLabel: '575～600 分',
      low: 575, high: 600,
      expected: Math.round(575 + (value - 70) * 2.5),
    };
  }
  if (value < 88) {
    return {
      id: 'top', label: '年级前列', rangeLabel: '600～635 分',
      low: 600, high: 635,
      expected: Math.round(600 + ((value - 80) / 8) * 35),
    };
  }
  if (value < 94) {
    return {
      id: 'elite', label: '年级顶尖', rangeLabel: '635～660 分',
      low: 635, high: 660,
      expected: Math.round(635 + ((value - 88) / 6) * 25),
    };
  }
  if (value < 98) {
    return {
      id: 'genius', label: '清北潜力', rangeLabel: '660～680 分',
      low: 660, high: 680,
      expected: Math.round(660 + ((value - 94) / 4) * 20),
    };
  }
  return {
    id: 'front', label: '清北层次', rangeLabel: '680～700 分',
    low: 680, high: 700,
    expected: Math.round(680 + ((value - 98) / 2) * 20),
  };
}

function examRankForStudy(study) {
  const value = clamp(study);
  let center;
  if (value < 45) center = 780 - value * 2.5;
  else if (value < 55) center = 610 - (value - 45) * 17;
  else if (value < 70) center = 430 - (value - 55) * 15;
  else center = 180 - (value - 70) * 5.2;
  // 难度越高，同样的学习属性换来的名次越靠后；发挥失常只影响排名，不直接扣学习属性。
  center += DIFFICULTY.rankOffset;
  // 同样的学习属性到了高三，竞争环境更拥挤，考试名次会更靠后。
  if (S.semIdx >= 4) center += 32;
  return clamp(Math.round(center + rnd(-35, 35)), 1, 800);
}

function doExam() {
  const profile = gaokaoBandForStudy(S.study);
  // 年级约 800 人，学习属性直接决定排名档位与波动中心。
  const rank = examRankForStudy(S.study);
  S.ranks.push(rank);
  S.lastRank = rank;
  S.exams.push(S.study);
  S.examRecords = S.examRecords || [];
  S.examRecords.push({ round: S.round, semIdx: S.semIdx, study: S.study, rank, band: profile.id });
  if (S.firstRank == null) S.firstRank = rank;

  let fx;
  let tier;
  if (rank <= 50) { tier = '年级前列（前 50）'; fx = { sleep: -2, social: 3, study: 2 }; }
  else if (rank <= 150) { tier = '年级上游（前 150）'; fx = { sleep: -1, social: 2, study: 1 }; }
  else if (rank <= 350) { tier = '年级中游偏上'; fx = { sleep: 0, social: 1, study: 1 }; }
  else if (rank <= 550) { tier = '年级中游（第 ' + rank + ' 名）'; fx = { sleep: 0, social: 0, study: 1 }; }
  else if (rank <= 700) { tier = '年级中下游'; fx = { sleep: -1, social: -2, study: -1 }; }
  else { tier = '年级末尾'; fx = { sleep: -2, social: -3, study: -2 }; }

  applyFx(fx);
  const extra = rank <= 50 ? '全年级 800 人 · 本学期大考\n名字贴在光荣榜最上面那栏。'
    : rank >= 650 ? '全年级 800 人 · 本学期大考\n成绩单在桌角压了很久才敢看第二眼。'
    : '全年级 800 人 · 本学期大考';
  const bandHint = `学习档位：${profile.label} · 高考基准 ${profile.low}～${profile.high} 分`;

  // 只调一次，拿返回值接住卡片（之前调了两次，导致每次考试出现两张成绩卡）。
  const latestEvent = logEvent('exam', tier, `${extra}\n${bandHint}\n\n这场考试之后`, fx);
  if (latestEvent) latestEvent.insertAdjacentHTML('beforeend', `<div class="result-body" style="margin-top:8px">${rank <= 150 ? '状态不错，节奏找对了。' : rank >= 650 ? '基础在晃，该把重心拉回学习了。' : '不好不坏，继续观察。'}</div>`);
  journal(`· 考试 第 ${rank} 名 · ${profile.label}`);
  checkTitles();
}

// 按学术月份推进日历。沉浸 / 标准 / 速通分别把 30 个月展开为 90 / 60 / 30 轮。
// 选科节点不能被跳过：若休学跨过高一上结束，先让玩家完成选科，再继续扣除休学轮次。
function advanceAcademicRounds(steps) {
  const perSem = monthsInSem();
  for (let i = 0; i < steps; i++) {
    S.round++;
    S.roundInSem++;
    if (S.roundInSem < perSem) continue;

    S.roundInSem = 0;
    if (S.semIdx >= 5) continue;
    S.semIdx++;
    if (S.semIdx === 1 && !S.trackApplied) {
      S.pendingLeaveRounds = steps - i - 1;
      return false;
    }
  }
  return true;
}

function finishRound() {
  const previousSem = S.semIdx;
  tickInjury();
  applySleepConsequences();
  const leaveRounds = maybeTriggerSleepLeave();

  // 保留原有的极低睡眠缓冲，但它不能抵消前面的休学判定。
  if (!leaveRounds && S.sleep <= 12) {
    S.sleep = clamp(S.sleep + DIFFICULTY.crisisRecovery, 0, S.sleepCap || 100);
    journal(`· 身体强制休整 +${DIFFICULTY.crisisRecovery} 睡眠`);
  }

  const calendarReady = advanceAcademicRounds(1 + leaveRounds);
  checkTitles();
  saveLocal();

  if (!calendarReady) {
    journal('→ 高一上结束：进入 3+1+2 选科');
    showTrackChoice();
    return;
  }

  if (S.round > totalRounds()) {
    doEnding();
    return;
  }

  if (S.semIdx !== previousSem) {
    startSemester();
    return;
  }

  renderHud();

  // 主选择间隔：默认 6 轮一次（约 2 个月）。想更频繁改成 2 / 4 即可。
  const MAIN_CHOICE_INTERVAL = 6;
  if (S.round % MAIN_CHOICE_INTERVAL === 1) {
    showMainChoices();
  } else {
    // 填充轮：走一段“日常片段”，给轻量数值加成
    const scene = pick(FILLER_SCENES);
    const growth = { sleep: 1, social: 1, study: 1 };
    applyFx(growth);
    logEvent('daily', scene.title, typeof scene.body === 'function' ? scene.body() : scene.body, growth);
    journal(`· ${scene.tag}`);
    buildEventQueue();
    processQueue();
  }
}

/* ---------------- 结局 ---------------- */
function universityForScore(score) {
  if (score >= 680) return { tier: '清北层次', school: '清华大学 / 北京大学', desc: '你可以把最想去的专业放在志愿表最前面，冲刺顶尖高校。' };
  if (score >= 670) return { tier: 'C9联盟', school: '上海交通大学 / 复旦大学', desc: '清北之下，所有的好大学、好专业你都有选择的空间。' };
  if (score >= 660) return { tier: '顶尖985', school: '武汉大学 / 浙江大学', desc: '你已经站在了年级的前列，当别人问你考的怎么样时，你可以自豪地说出自己的分数。' };
  if (score >= 640) return { tier: '强985', school: '中山大学 / 华南理工大学', desc: '华南地区的好大学向你敞开，专业选择也有足够余地。' };
  if (score >= 630) return { tier: '985工程', school: '中山大学 / 北京师范大学', desc: '你可以选择一个好大学、好专业，未来有光明的前途。' };
  if (score >= 600) return { tier: '211工程 / 双一流', school: '暨南大学 / 华南师范大学', desc: '你稳稳站上双一流赛道，可以要认真比较城市与专业。' };
  if (score >= 570) return { tier: '一本院校', school: '广东工业大学 / 广州大学', desc: '一本院校的专业和城市选择都还不错，下一站会很具体。' };
  if (score >= 530) return { tier: '本科院校', school: '广东财经大学 / 广州医科大学', desc: '本科志愿需要做梯度，但你已经有了不少现实选项。' };
  if (score >= 470) return { tier: '本科机会', school: '广东技术师范大学 / 广州软件学院', desc: '冲稳保填好，依然有机会拿到本科录取通知。' };
  return { tier: '专科 / 继续准备', school: '高职院校 / 复读再战', desc: '这不是终点，你可以先选一门真正能学到东西的专业，也可以再给自己一年。' };
}

function academicEnding(score) {
  const university = universityForScore(score);

  if (score >= 680) return {
    title: '清北之光',
    desc: '出分那天，班级群瞬间刷屏。你盯着屏幕看了很久，才确认那个数字不是幻觉。高中三年的卷子、夜修、周测，都有了回响。',
  };
  if (score >= 670) return {
    title: 'C9 尖子生',
    desc: '这个分数，清北之外的所有学校都向你敞开。班主任专门打电话过来，语气比平时轻快许多：「稳了，挑个喜欢的城市吧。」',
  };
  if (score >= 660) return {
    title: '顶尖 985',
    desc: '你稳稳站在年级最前列。当亲戚问你考得怎么样时，你终于可以不带一丝谦虚地说出那个数字——这是三年里最痛快的一句话。',
  };
  if (score >= 640) return {
    title: '强 985 上岸',
    desc: '成绩出来，班主任在群里连发了三个表情。你把录取通知拍给家里，电话那头沉默了两秒，然后是爽朗的大笑。',
  };
  if (score >= 630) return {
    title: '985 上岸',
    desc: '稳稳越过 985 的门槛。你把堆在桌角的五三一本本收进箱子，忽然有点舍不得这些又爱又恨的夜晚。',
  };
  if (score >= 600) return {
    title: '211 / 双一流',
    desc: '稳稳越过特控线。211 的录取通知书在手，专业和城市都还有挑选的空间。你终于可以开始认真规划，而不是被动接受。',
  };
  if (score >= 570) return {
    title: '一本上岸',
    desc: '过线的那一刻，你把准考证号输错了三次才查到分。未来的路还长，但这一关，你过了。',
  };
  if (score >= 530) return {
    title: '本科上岸',
    desc: '压线过本科。你长长舒了一口气，把这三年的草稿纸捆起来，居然卖了不少钱。',
  };
  if (score >= 470) return {
    title: '本科 · 继续走',
    desc: '分数不算漂亮，但有书读。条条大路通罗马——重要的是你已经走完了这三年。',
  };
  return {
    title: '人生的岔路口',
    desc: '高考不是句号。你收起成绩单，看向窗外：操场上还有人在跑步，夕阳把影子拉得很长。路，还长着呢。',
  };
}

function loveEnding() {
  const L = S.love;
  const ta = L && L.gender === '男' ? '他' : '她';
  if (!S.flags.loveMilestones || typeof S.flags.loveMilestones !== 'object') S.flags.loveMilestones = {};
  const ms = S.flags.loveMilestones;

  if (L && L.met && L.active) {
    if (L.peakAff >= 95 && (S.flags.breakups || 0) === 0) {
      const key = loveIsBoy() ? '同一件外套' : '两颗扣子';
      ms[key] = true;
      if (loveIsBoy()) {
        return {
          title: '同一件外套',
          desc: `毕业典礼那天，${ta}站在校门口，把校服外套脱下来塞进你怀里。\n\n「拿着。……别洗。」\n\n然后转身走了，走得很快。\n\n三年里你们一起打过球，一起在小卖部门口排过队，一起在输了比赛之后坐到看台最上面一排。高考结束的那个下午，你们又去了小巷——谁都没提以后，因为都默认以后里还有对方。`,
        };
      }
      return {
        title: '两颗扣子',
        desc: `毕业典礼那天，${ta}站在校门口，把校服第二颗扣子扯下来塞进你手里。\n\n「……别弄丢了。」\n\n三年里你们一起背过单词，一起在操场走过圈，一起在模考失利之后互相说「没事」。高考结束的那个下午，你们坐在校门口的台阶上，谁也没提以后——因为都默认以后里还有对方。`,
      };
    }
    if (loveIsBoy()) {
      return {
        title: '仍在恋爱中',
        desc: `高考结束那天，你们在校门口碰头。没有拥抱，没有誓言，只是并排走了一段路，然后一起走进了盛夏。\n\n以后怎样，留给以后。`,
      };
    }
    return {
      title: '仍在恋爱中',
      desc: `高考结束那天，你们在校门口碰头。没有拥抱，没有誓言，只是并排站了一会儿，然后一起走进了盛夏。\n\n以后怎样，留给以后。`,
    };
  }
  // 暧昧没走到最后：本线永久关闭，进入「遗憾结局」
  if (L && L.met && L.peakAff >= 85) {
    if (loveIsBoy()) {
      ms['没说出口'] = true;
      return {
        title: '没说出口',
        desc: `毕业典礼上，${ta}在人群里找你。看到你的时候，他抬了下手，又放下了。\n\n等你挤过去，他已经跟着班车走了。\n\n好感停在 ${L.aff}。有些话，被他自己按回去了。`,
      };
    }
    ms['无言的夏天'] = true;
    return {
      title: '无言的夏天',
      desc: `毕业典礼上，${ta}站在人群里，好像在找什么人。你走过去的时候，${ta}已经转身了。\n\n好感停在 ${L.aff}。有些话，谁都没有说出口。`,
    };
  }
  if (S.flags.rejected >= 1 && S.flags.breakups >= 1) {
    return {
      title: '懵懂的青春',
      desc: '三年里，你拒绝过别人，也被拒绝过；牵过手，也松开过手。毕业照上你笑得很标准——有些心动，本来就只适合放在回忆里。',
    };
  }
  if (S.flags.rejected >= 1) {
    return {
      title: '没成 · 也算青春',
      desc: '那句「还是算了吧」你记了三年。后来你想明白：不是所有故事都要在一起才算圆满。至少你勇敢过。',
    };
  }
  if (S.social >= 75) {
    return {
      title: '单身贵族',
      desc: '你没谈恋爱，但朋友遍地。散伙饭那天，半个班都来敬你——青春不只有爱情，还有并肩走过的人。',
    };
  }
  return {
    title: '一个人的三年',
    desc: '毕业册上你的留言写得很短。没有 TA 的名字，也没有遗憾的标点。有些路，本来就是一个人走完的。',
  };
}

/* 把总分拆成六科：语数英（150×3）+ 首选（100）+ 再选×2（100×2） */
function buildGaokaoReport(score) {
  const basePct = score / 750;

  // 语文：社交加成
  const chinesePct = clamp(basePct + (S.social - 50) * 0.0012, 0.45, 1);
  const chinese = Math.round(150 * chinesePct);

  // 数学：纯学习
  const mathPct = clamp(basePct + (S.study - 70) * 0.0015, 0.45, 1);
  const math = Math.round(150 * mathPct);

  // 英语：学习和社交混合
  const englishPct = clamp(basePct + (S.study - 70) * 0.0008 + (S.social - 50) * 0.0008, 0.45, 1);
  const english = Math.round(150 * englishPct);

  // 首选科目（物理 / 历史）：纯学习
  const primaryPct = clamp(basePct + (S.study - 70) * 0.0018, 0.45, 1);
  const primary = Math.round(100 * primaryPct);

  // 再选 1 / 再选 2：带一点随机
  const extra1 = Math.round(100 * clamp(basePct + rnd(-2, 2) / 100, 0.45, 1));
  const extra2 = Math.round(100 * clamp(basePct + rnd(-2, 2) / 100, 0.45, 1));

  // 误差回补到数学，保证六科加起来等于总分
  const actual = chinese + math + english + primary + extra1 + extra2;
  const diff = score - actual;
  const finalMath = math + diff;

  const trackExtra = S.trackExtra || (S.track === '历史' ? ['政治', '地理'] : ['化学', '生物']);

  return {
    chinese,
    math: finalMath,
    english,
    primaryName: S.track || '物理',
    primary,
    extra1Name: trackExtra[0] || '化学',
    extra1,
    extra2Name: trackExtra[1] || '生物',
    extra2,
    total: chinese + finalMath + english + primary + extra1 + extra2,
  };
}
function computeScore() {
  const band = gaokaoBandForStudy(S.study);
  const lifestyleAdjustment = clamp(Math.round(
    (S.sleep - 70) * 0.08 +
    (S.social - 50) * 0.04 +
    (S.love && S.love.aff >= 71 ? 3 : 0) +
    (CFG.className === '镜堂班' ? 4 : 0) +   // 8 → 3
    (CFG.className === '容庚班' ? 3 : 0) +   // 5 → 3
    rnd(-4, 4)
  ), -8, 8);
  const expectedScore = clamp(band.expected + lifestyleAdjustment, band.low, band.high);

  const penaltyRange = DIFFICULTY.gaokaoPenalty;
  const competitionPenalty = S.semIdx >= 4 ? rnd(penaltyRange[0], penaltyRange[1]) : 0;
  const finalScore = clamp(expectedScore - competitionPenalty, 200, 750);

  S.gaokao = {
    band: band.id,
    bandLabel: band.label,
    rangeLabel: band.rangeLabel,
    expectedRange: [band.low, band.high],
    expectedScore,
    lifestyleAdjustment,
    competitionPenalty,
    finalScore,
  };
  S.gaokao.report = buildGaokaoReport(S.gaokao.finalScore);
  return finalScore;
}

function doEnding() {
  S.ended = true;
  saveLocal();
  const score = computeScore();
  const gaokao = S.gaokao;
  const ac = academicEnding(score);
  const university = universityForScore(score);
  const volunteerText = S.flags.volunteerChoice === '冲刺'
    ? '志愿取向：冲刺理想大学'
    : S.flags.volunteerChoice === '稳妥'
      ? '志愿取向：按分数梯度稳妥填报'
      : S.flags.volunteerChoice === '保底'
        ? '志愿取向：优先确保有书读'
        : '志愿取向：未记录';
  const lv = loveEnding();

  // 游玩记录
  const first = S.ranks.length ? Math.min(...S.ranks) : null;
  const last = S.lastRank;
  const rankStr = first != null
    ? (first <= 50 ? `前 50 → ${rankTier(last)}` : `第 ${first} → ${rankTier(last)}`)
    : '—';

  const L0 = S.love;
  const loveStageTag = L0 && L0.met ? affStageAt(L0.stage).tag : '未遇见';
  const loveChoices = (S.socialAct + S.sleepAct + S.studyAct); // 选择总数近似

  const finalState = L0 && L0.met
    ? (L0.active ? '恋人' : loveStageTag)
    : '单身';

  $('#end-score').textContent = score;
  const report = buildGaokaoReport(score);
  $('#end-academic').textContent = ac.title;
  $('#end-academic-desc').textContent = `${gaokaoDateLabel()}，你走进考场。\n\n6 月 25 日，分数出来了。\n\n${ac.desc}\n\n── 高考成绩单 ──\n语文 ${report.chinese} / 150\n数学 ${report.math} / 150\n英语 ${report.english} / 150\n${report.primaryName} ${report.primary} / 100\n${report.extra1Name} ${report.extra1} / 100\n${report.extra2Name} ${report.extra2} / 100\n总分 ${report.total} / 750`;
  $('#end-love-title').textContent = lv.title;
  $('#end-love-desc').textContent = lv.desc;

  $('#end-records').innerHTML = `
    <div class="record-row"><span>难度</span><b>${DIFFICULTY.label}</b></div>
    <div class="record-row"><span>入学 / 高考</span><b>${startYear()} 年 9 月 → ${gaokaoDateLabel()}</b></div>
    <div class="record-row"><span>居住方式</span><b>${CFG.residency} · ${campusForSem(Math.min(S.semIdx, 5))}</b></div>
    <div class="record-row"><span>选科组合</span><b>${S.track || '—'}类 · ${(S.trackExtra || []).join(' + ') || '—'}</b></div>
    <div class="record-row"><span>期末考试排名</span><b>${rankStr}</b></div>
    <div class="record-row"><span>剧情占比</span><b>恋爱 ${Math.round(loveRatio() * 100)}% · 校园 ${100 - Math.round(loveRatio() * 100)}%</b></div>
    <div class="record-row"><span>恋爱对象</span><b>${L0 && L0.met ? `${L0.name} · ${loveChar().persona}` : '未遇见'}</b></div>
    <div class="record-row"><span>好感度</span><b>${L0 && L0.met ? `${L0.aff} / 100 · ${loveStageTag}` : '—'}</b></div>
    <div class="record-row"><span>约会 / 互动</span><b>${(L0 && L0.dates) || 0} 次约会 · 共 ${S.round} 次选择</b></div>
    <div class="record-row"><span>告白 / 被拒 / 分手</span><b>${S.flags.confessions || 0} 次 / ${S.flags.rejected} 次 / ${S.flags.breakups} 次</b></div>
    <div class="record-row"><span>大学结局</span><b>${university.tier} · ${university.school}</b></div>
    <div class="record-row"><span>志愿填报</span><b>${volunteerText.replace('志愿取向：', '')}</b></div>
    <div class="record-row"><span>学习属性档位</span><b>${gaokao.bandLabel} · ${gaokao.rangeLabel}</b></div>
    <div class="record-row"><span>发挥失常扣分</span><b>-${gaokao.competitionPenalty} 分</b></div>
    <div class="record-row"><span>强制休学</span><b>${leaveDurationLabel(S.totalLeaveMonths || 0)} · ${S.leaveCount || 0} 次</b></div>
    <div class="record-row"><span>最终结局</span><b>${finalState}</b></div>
    <div class="record-row"><span>留下的信物</span><b>${(S.love && S.love.keepsakes && S.love.keepsakes.length) ? S.love.keepsakes.join(' · ') : '—'}</b></div>
    <div class="record-row"><span>恋爱成就</span><b>${Object.keys(S.flags.loveMilestones || {}).length} 项</b></div>
  `;

  $('#end-stats').innerHTML = `
    <div class="stat-tile"><div class="st-label">睡眠</div><div class="st-val sleep">${S.sleep}</div></div>
    <div class="stat-tile"><div class="st-label">社交</div><div class="st-val social">${S.social}</div></div>
    <div class="stat-tile"><div class="st-label">学习</div><div class="st-val study">${S.study}</div></div>
  `;

  $('#end-title-count').textContent = `（${S.titles.length}）`;
  $('#end-titles').innerHTML = S.titles.length
    ? S.titles.map((t) => {
        const def = TITLE_DEFS.find((d) => d.id === t);
        return `<span class="title-pill ${def ? def.cls : ''}">${t}</span>`;
      }).join('')
    : '<span class="muted">这三年平平淡淡</span>';

  // 历史战绩
  const histRaw = storeJson('xx2_history', []);
  const hist = Array.isArray(histRaw) ? histRaw : [];
  hist.push({ name: S.name, score, ac: ac.title, lv: lv.title, ts: Date.now() });
  store.set('xx2_history', JSON.stringify(hist.slice(-20)));

  const rankEl = $('#end-rank');
  if (rankEl) rankEl.textContent = NET.online ? '正在上传成绩…' : '单机模式 · 本局未上榜';

  show('#screen-end');

  // 联机：上传成绩换排名 + 全校动态播报（失败不影响结算）
  netPublishResult(score, ac.title);
}

function rankTier(rank) {
  if (rank == null) return '—';
  if (rank <= 50) return '前 50';
  if (rank <= 150) return '前 150';
  if (rank <= 350) return '中游偏上';
  if (rank <= 550) return '中游';
  if (rank <= 700) return '中下游';
  return '末尾';
}

/* ---------------- 图鉴（简化为成就回顾） ---------------- */
// 图鉴按路线拼装：恋爱那几项男女两套完全不同，避免出现永远解锁不了的格子。
const DEX_ITEMS_HEAD = [
  { k: '熬夜冠军', n: '睡眠长期低于 40' },
  { k: '社交天花板', n: '社交达到 90+' },
  { k: '卷到发光', n: '学习达到 95+' },
];
const DEX_LOVE_GIRL = [
  { k: '初次心动', n: '好感首次达到 46' },
  { k: '伞下的距离', n: '完成雨天共伞事件' },
  { k: '散场之后', n: '艺术节闭幕之后，和 TA 留到最后' },
  { k: '两颗扣子', n: '达成恋人并走到毕业' },
  { k: '无言的夏天', n: '好感曾达 85 以上但最终未告白' },
];
const DEX_LOVE_BOY = [
  { k: '第一个外号', n: '好感首次达到 46' },
  { k: '一把伞的左肩', n: '完成雨天共伞事件' },
  { k: '绕远的那条路', n: '「顺路」走了三个学期' },
  { k: '看台最上面一排', n: '比赛之后陪他坐上看台最上面一排' },
  { k: '同一件外套', n: '达成恋人并走到毕业' },
  { k: '没说出口', n: '好感曾达 85 以上但最终未告白' },
];
const DEX_ITEMS_TAIL = [
  { k: '被拒勋章', n: '至少被拒/拒绝 1 次' },
  { k: '分手成长', n: '经历过分手' },
  { k: '前 50 名', n: '单次考试进年级前 50' },
  { k: '全勤战士', n: '走完全部轮次' },
  { k: '莞中大包', n: '饭堂早餐的大包，2.5元一个，早去才有' },
  { k: '炸大鸡腿', n: '饭堂：大鸡腿' },
  { k: '水蒸蛋', n: '饭堂：水蒸蛋' },
  { k: '冰凉粉', n: '饭堂：冰凉粉' },
  { k: '老鸭粉丝汤', n: '校外美食' },
  { k: '莞留香', n: '校外美食' },
  { k: '鹅好味', n: '校外美食' },
  { k: 'KFC', n: '校外美食' },
  { k: '鲜汇', n: '校外美食' },
];

function dexLoveItems() { return loveIsBoy() ? DEX_LOVE_BOY : DEX_LOVE_GIRL; }
function dexItems() { return [...DEX_ITEMS_HEAD, ...dexLoveItems(), ...DEX_ITEMS_TAIL]; }
// 兼容旧引用
const DEX_ITEMS = DEX_ITEMS_HEAD.concat(DEX_LOVE_GIRL, DEX_ITEMS_TAIL);

function showDex() {
  const got = [];
  if (S.sleep <= 40) got.push('熬夜冠军');
  if (S.social >= 90) got.push('社交天花板');
  if (S.study >= 95) got.push('卷到发光');
  const loveMs = S.flags.loveMilestones || {};
  dexLoveItems().forEach((i) => {
    if (loveMs[i.k] && !got.includes(i.k)) got.push(i.k);
  });
  if (S.flags.rejected >= 1) got.push('被拒勋章');
  if (S.flags.breakups >= 1) got.push('分手成长');
  if (S.ranks.some((r) => r <= 50)) got.push('前 50 名');
  if (S.round > totalRounds() || S.ended) got.push('全勤战士');
  const foodDexMap = {
    '饭堂·早餐莞中大包': '早餐莞中大包',
    '饭堂·炸大鸡腿': '大鸡腿',
    '饭堂·水蒸蛋': '水蒸蛋',
    '饭堂·冰凉粉': '冰凉粉',
    '校外·莞香': '莞香',
    '校外·品中品': '品中品',
    '校外·老鸭粉丝汤': '老鸭粉丝汤',
    '校外·KFC': 'KFC',
    '校外·鲜汇': '鲜汇',
  };
  (S.foods || []).forEach((food) => { if (foodDexMap[food]) got.push(foodDexMap[food]); });

  const items = dexItems();
  const html = items.map((i) => {
    const has = got.includes(i.k);
    return `<div class="dex-item ${has ? '' : 'locked'}"><div class="d-name">${has ? i.k : '？？？'}</div><div class="d-note">${has ? i.n : '尚未解锁'}</div></div>`;
  }).join('');

  openModal(`<h3>📖 三年图鉴</h3>
    <p class="hint-line center">已解锁 ${got.length} / ${items.length}</p>
    <div class="dex-grid">${html}</div>
    <button class="m-close" onclick="document.getElementById('modal-mask').classList.add('hidden')">关闭</button>`);
}

function showHistory() {
  const histRaw = storeJson('xx2_history', []);
  const hist = Array.isArray(histRaw) ? histRaw : [];
  const rows = hist.slice().reverse().map((h, i) => `
    <div class="record-row">
      <span>#${i + 1} ${h.name}<br><small style="color:#5a6a7a">${h.ac} · ${h.lv}</small></span>
      <b style="color:#f0a030">${h.score}</b>
    </div>`).join('');
  openModal(`<h3>🏆 历史战绩</h3>
    ${rows || '<p class="hint-line center">还没有战绩，先去打一局？</p>'}
    <button class="m-close" onclick="document.getElementById('modal-mask').classList.add('hidden')">关闭</button>`);
}

function openModal(html) {
  $('#modal-box').innerHTML = html;
  $('#modal-mask').classList.remove('hidden');
}
$('#modal-mask').onclick = (e) => { if (e.target.id === 'modal-mask') $('#modal-mask').classList.add('hidden'); };

/* ---------------- 自动 ---------------- */
function setAuto(on) {
  AUTO = on;
  $('#btn-auto').textContent = on ? '⏩ 自动：开' : '⏩ 自动：关';
  $('#btn-auto').classList.toggle('on', on);
  clearInterval(autoTimer);
  if (on) autoTimer = setInterval(autoStep, 2800);
}
function autoStep() {
  if (!S || S.ended) { setAuto(false); return; }
  const btns = document.querySelectorAll('#action-area .choice-btn');
  if (!btns.length) return;
  btns[rnd(0, btns.length - 1)].click();
}
$('#btn-auto').onclick = () => setAuto(!AUTO);
$('#btn-dex').onclick = showDex;

/* ---------------- 存档 ---------------- */
function saveLocal() {
  store.set('xx2_save', JSON.stringify({ S, CFG }));
}
function tryRestore() {
  try {
    const raw = store.get('xx2_save', null);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data.S || data.S.ended || !data.S.name) {
      store.del('xx2_save');   // ← 新增：完局的档直接清掉，不再反复询问
      return false;
    }
    if (data.S.round > (data.S.rounds || 90)) {
      store.del('xx2_save');
      return false;
    }
    const go = confirm(`检测到存档：${data.S.name}（第 ${data.S.round} 轮）\n\n确定 = 继续，取消 = 重新开始`);
    if (!go) { store.del('xx2_save'); return false; }
    S = data.S;
    CFG = { ...CFG, ...data.CFG };
    CFG.className = normalizeClassName(CFG.className);
    CFG.residency = normalizeResidency(CFG.residency);
    S.className = CFG.className;
    S.residency = CFG.residency;
    S.flags = {
      rejected: 0,
      breakups: 0,
      neverTest: true,
      activeAttempts: 0,
      activeSuccesses: 0,
      activeFailures: 0,
      dormBriefed: false,
      examHallBriefed: false,
      examHallLowBriefed: false,
      examHallHighBriefed: false,
      mosquitoSeen: false,
      mixOutSeen: false,
      sprintSeen: false,
      mockExamSeen: false,
      volunteerSeen: false,
      openDayDecSeen: false,
      openDayMarSeen: false,
      openDayMaySeen: false,
      foodEventCount: 0,
      valentineSems: [],
      christmasSems: [],
      bdaySems: [],
      loveMilestones: {},
      confessions: 0,
      artShowsSeen: [],
      artFestivalSeen: [],
      ...(S.flags || {}),
    };
    S.love = migrateLove(S.love);
    if (!Array.isArray(S.love.keepsakes)) S.love.keepsakes = [];
    if (!Array.isArray(S.flags.valentineSems)) S.flags.valentineSems = [];
    if (!Array.isArray(S.flags.christmasSems)) S.flags.christmasSems = [];
    if (!Array.isArray(S.flags.bdaySems)) S.flags.bdaySems = [];
    if (!S.flags.loveMilestones || typeof S.flags.loveMilestones !== 'object') S.flags.loveMilestones = {};
    // 兼容旧存档：把「后夜祭」迁移到「散场之后」
    if (S.flags.loveMilestones['后夜祭'] && !S.flags.loveMilestones['散场之后']) {
      S.flags.loveMilestones['散场之后'] = true;
      delete S.flags.loveMilestones['后夜祭'];
    }
    // 日常选项：旧存档没有这两个字段，补默认值。
    if (!S.flags.dailyMilestones || typeof S.flags.dailyMilestones !== 'object') S.flags.dailyMilestones = {};
    if (typeof S.flags.schoolLore !== 'number') S.flags.schoolLore = 0;
    if (typeof S.flags.dayPass !== 'boolean') S.flags.dayPass = false;
    if (typeof S.dailyIdx !== 'number' || !isFinite(S.dailyIdx) || S.dailyIdx < 0) S.dailyIdx = 0;
    if (typeof S.sleepCap !== 'number') S.sleepCap = 100;
    if (S.injury === undefined) S.injury = null;
    if (!CFG.talent) CFG.talent = '学霸胚子';
    // 旧存档没有难度字段，一律按困难恢复。
    if (!CFG.difficulty || !DIFFICULTY_PRESETS[CFG.difficulty]) CFG.difficulty = 'hard';
    setDifficulty(CFG.difficulty);
    S.difficulty = DIFFICULTY.key;
    // 旧存档没有恋爱配额，loveQuota() 会按默认值补上。
    loveQuota();
    S.foods = S.foods || [];
    S.sleepBand = S.sleepBand || sleepBand(S.sleep);
    S.leaveHistory = S.leaveHistory || [];
    S.totalLeaveMonths = S.totalLeaveMonths || 0;
    S.leaveCount = S.leaveCount || 0;
    S.pendingLeaveRounds = S.pendingLeaveRounds || 0;
    S.examRecords = S.examRecords || [];
    S.gaokao = S.gaokao || null;
    S.track = S.track || CFG.track || null;
    // 旧版存档在开局就选科，视为已经完成选科，避免重复加属性。
    if (typeof S.trackApplied !== 'boolean') S.trackApplied = S.semIdx >= 1 || Boolean(S.track);
    if (S.semIdx === 1 && !S.trackApplied) {
      showTrackChoice();
      return true;
    }
    // 直接进入游戏
    show('#screen-game');
    renderHud();
    logEvent('sys', '📂 存档恢复', `欢迎回来，${S.name}。继续你的三年。`, null);
    showMainChoices();
    return true;
  } catch (e) { return false; }
}

/* ---------------- 重启 ---------------- */
$('#btn-restart').onclick = () => {
  store.del('xx2_save');
  S = null;
  CFG.track = null;
  show('#screen-menu');
};

/* ---------------- 联机（可选：连不上服务器就自动单机） ----------------
   server.js 提供 /api/hello /api/heartbeat /api/leaderboard /api/feed。
   所有请求都是 best-effort：失败只降级成单机，不影响游戏本体。
   ------------------------------------------------------------------- */
const NET = {
  online: false,
  count: 0,
  timer: null,
  probed: false,
};

function escapeHtml(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

function netPlayerId() {
  let id = store.get('xx2_pid', null);
  if (!id) {
    id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    store.set('xx2_pid', id);
  }
  return id;
}

async function api(pathname, opts) {
  // 这里填你的 Railway 后端地址（注意：一定要带 https://，最后不要加斜杠 /）
  const API_BASE = 'https://my-high-school-sim-production.up.railway.app';
  
  const res = await fetch(API_BASE + pathname, Object.assign({
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
  }, opts || {}));
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

function renderNetStatus() {
  const el = $('#net-status');
  if (!el) return;
  if (!NET.probed) el.textContent = '联机检测中…';
  else if (!NET.online) el.textContent = '单机模式 · 排行榜与全校动态不可用';
  else el.textContent = `已联机 · 当前在线 ${NET.count} 人`;
  el.classList.toggle('off', NET.probed && !NET.online);
}

async function netHeartbeat() {
  try {
    const r = await api('/api/heartbeat', {
      method: 'POST',
      body: JSON.stringify({ id: netPlayerId(), name: (S && S.name) || CFG.name || '匿名' }),
    });
    if (r && r.ok) {
      NET.online = true;
      NET.count = r.online || 0;
      renderNetStatus();
    }
  } catch (e) { /* 静默降级 */ }
}

async function netBoot() {
  renderNetStatus();
  try {
    const r = await api('/api/hello');
    if (!r || !r.ok) throw new Error('bad payload');
    NET.online = true;
    NET.count = r.online || 0;
    NET.probed = true;
    renderNetStatus();
    netHeartbeat();
    clearInterval(NET.timer);
    NET.timer = setInterval(netHeartbeat, 45000);
  } catch (e) {
    NET.online = false;
    NET.probed = true;
    renderNetStatus();
  }
}

function closeModalBtn() {
  return `<button class="m-close" onclick="document.getElementById('modal-mask').classList.add('hidden')">关闭</button>`;
}

/* 解析 report 字符串 */
function parseReport(str) {
  if (!str) return null;
  try { return JSON.parse(str); } catch (e) { return null; }
}

/* 新高考排序规则：总分 → 语文 → 外语 → 首选 → 再选最高 → 再选次高 */
function compareGaokao(a, b) {
  if (a.score !== b.score) return b.score - a.score;

  const ra = parseReport(a.report) || {};
  const rb = parseReport(b.report) || {};

  // 语文
  if ((ra.chinese || 0) !== (rb.chinese || 0)) return (rb.chinese || 0) - (ra.chinese || 0);
  // 外语
  if ((ra.english || 0) !== (rb.english || 0)) return (rb.english || 0) - (ra.english || 0);
  // 首选
  if ((ra.primary || 0) !== (rb.primary || 0)) return (rb.primary || 0) - (ra.primary || 0);
  // 再选最高
  const aMax = Math.max(ra.extra1 || 0, ra.extra2 || 0);
  const bMax = Math.max(rb.extra1 || 0, rb.extra2 || 0);
  if (aMax !== bMax) return bMax - aMax;
  // 再选次高
  const aMin = Math.min(ra.extra1 || 0, ra.extra2 || 0);
  const bMin = Math.min(rb.extra1 || 0, rb.extra2 || 0);
  return bMin - aMin;
}


/* 按物理类 / 历史类 / 未分科分组，组内按新高考规则排序并计算并列位次 */
function groupAndRank(list) {
  const groups = { '物理类': [], '历史类': [], '未分科': [] };
  list.forEach((e) => {
    const track = e.track || '';
    const key = track.includes('物理') ? '物理类' : track.includes('历史') ? '历史类' : '未分科';
    groups[key].push({ ...e });
  });

  // 排序：总分 → 语文 → 外语 → 首选 → 再选最高 → 再选次高
  const compare = (a, b) => {
    if ((a.score || 0) !== (b.score || 0)) return (b.score || 0) - (a.score || 0);
    const ra = a.report || {};
    const rb = b.report || {};
    if ((ra.chinese || 0) !== (rb.chinese || 0)) return (rb.chinese || 0) - (ra.chinese || 0);
    if ((ra.english || 0) !== (rb.english || 0)) return (rb.english || 0) - (ra.english || 0);
    if ((ra.primary || 0) !== (rb.primary || 0)) return (rb.primary || 0) - (ra.primary || 0);
    const aMax = Math.max(ra.extra1 || 0, ra.extra2 || 0);
    const bMax = Math.max(rb.extra1 || 0, rb.extra2 || 0);
    if (aMax !== bMax) return bMax - aMax;
    const aMin = Math.min(ra.extra1 || 0, ra.extra2 || 0);
    const bMin = Math.min(rb.extra1 || 0, rb.extra2 || 0);
    return bMin - aMin;
  };

  // 组内排序 + 计算并列位次（同分同位次，下一名次跳号）
  Object.keys(groups).forEach((k) => {
    const arr = groups[k].sort(compare);
    let lastScore = null, lastRank = 0;
    arr.forEach((e, idx) => {
      if (e.score !== lastScore) {
        lastRank = idx + 1;
        lastScore = e.score;
      }
      e._rank = lastRank;
    });
  });
  return groups;
}
/* 按 track 分组 + 计算并列位次 */
async function showLeaderboard() {
  if (!NET.online) {
    openModal(`<h3>🏆 全校排行榜</h3>
      <p class="hint-line center">当前是单机模式，连不上排行榜服务器。</p>
      <p class="hint-line center">在项目目录里跑 <code>node server.js</code>，再用 <code>http://localhost:3000</code> 打开即可上榜。</p>
      ${closeModalBtn()}`);
    return;
  }
  openModal(`<h3>🏆 全校排行榜</h3><p class="hint-line center">加载中…</p>`);
  try {
    const r = await api('/api/leaderboard');
    const list = (r && r.board) || [];
    const groups = groupAndRank(list);
    const myId = netPlayerId();

    function renderRows(arr) {
      if (!arr.length) return '<p class="hint-line center">这一档还没有人上榜。</p>';
      return arr.map((e) => {
        const mine = e.id === myId ? ' style="background:rgba(240,160,48,.14);border-radius:10px"' : '';
        const sub = [e.ending, e.badge].filter(Boolean).map(escapeHtml).join(' · ');
        return `<div class="record-row"${mine}>
          <span>#${e._rank} ${escapeHtml(e.name)}<br><small style="color:#5a6a7a">${sub}</small></span>
          <b style="color:#f0a030">${Number(e.score) || 0}</b>
        </div>`;
      }).join('');
    }

    openModal(`<h3>🏆 全校排行榜</h3>
      <p class="hint-line center">共 ${list.length} 条记录 · 在线 ${NET.count} 人</p>
      <p class="label-green" style="margin-top:14px">物理类</p>
      ${renderRows(groups['物理类'])}
      <p class="label-green" style="margin-top:14px">历史类</p>
      ${renderRows(groups['历史类'])}
      ${groups['未分科'].length ? `<p class="label-green" style="margin-top:14px">未分科（旧存档）</p>${renderRows(groups['未分科'])}` : ''}
      ${closeModalBtn()}`);
  } catch (e) {
    openModal(`<h3>🏆 全校排行榜</h3>
      <p class="hint-line center">加载失败，稍后再试。</p>
      ${closeModalBtn()}`);
  }
}

async function showFeed() {
  if (!NET.online) {
    openModal(`<h3>📢 全校动态</h3>
      <p class="hint-line center">当前是单机模式，看不到别人的动态。</p>
      <p class="hint-line center">跑 <code>node server.js</code> 后访问 <code>http://localhost:3000</code> 就能看到全校播报。</p>
      ${closeModalBtn()}`);
    return;
  }
  openModal(`<h3>📢 全校动态</h3><p class="hint-line center">加载中…</p>`);
  try {
    const r = await api('/api/feed');
    const list = (r && r.feed) || [];
    const rows = list.map((f) => `
      <div class="record-row">
        <span>${escapeHtml(f.icon || '📢')} <b style="color:#7eb6ff">${escapeHtml(f.name)}</b><br><small style="color:#8a9aaa">${escapeHtml(f.text)}</small></span>
        <b style="color:#5a6a7a;font-weight:400">${timeAgo(f.ts)}</b>
      </div>`).join('');
    openModal(`<h3>📢 全校动态</h3>
      <p class="hint-line center">最近 ${list.length} 条 · 高考放榜后会自动播报</p>
      ${rows || '<p class="hint-line center">还没有动态。打完一局，你的成绩就会出现在这里。</p>'}
      ${closeModalBtn()}`);
  } catch (e) {
    openModal(`<h3>📢 全校动态</h3>
      <p class="hint-line center">加载失败，稍后再试。</p>
      ${closeModalBtn()}`);
  }
}

/* ---------------- 留言墙 ---------------- */
async function showMessageWall() {
  openModal(`<h3>💬 留言墙</h3><p class="hint-line center">加载中…</p>`);
  try {
    const r = await api('/api/message');
    const list = (r && r.messages) || [];
    if (!list.length) {
      openModal(`<h3>💬 留言墙</h3>
        <p class="hint-line center">还没有人留言。打完一局，写下你的第一句话。</p>
        ${closeModalBtn()}`);
      return;
    }
    const rows = list.map((m) => `
      <div class="record-row">
        <span><b style="color:#7b6410">${escapeHtml(m.name)}</b>
          ${m.score != null ? `<small style="color:#a18c67"> · 高考 ${m.score} 分</small>` : ''}
          <br><small style="color:#5a6a7a">${escapeHtml(m.text)}</small></span>
        <b style="color:#5a6a7a;font-weight:400">${timeAgo(m.ts)}</b>
      </div>`).join('');
    openModal(`<h3>💬 留言墙</h3>
      <p class="hint-line center">最近 ${list.length} 条（最多保留最近 100 条）</p>
      ${rows}
      ${closeModalBtn()}`);
  } catch (e) {
    openModal(`<h3>💬 留言墙</h3>
      <p class="hint-line center">加载失败，稍后再试。</p>
      ${closeModalBtn()}`);
  }
}

async function showWriteMessage() {
  openModal(`<h3>✍️ 留下一句话</h3>
    <p class="hint-line center">不超过 20 字，会显示在留言墙上。</p>
    <input id="msg-input" type="text" maxlength="20" placeholder="例：三年，值了。" style="width:100%;padding:12px;margin:12px 0;border:1.5px solid #c6bea6;border-radius:8px;background:#fffdf7;font-size:15px;">
    <button class="m-close" id="msg-submit">提交留言</button>
    <button class="m-close" onclick="document.getElementById('modal-mask').classList.add('hidden')" style="background:#a18c67;margin-top:8px;">算了</button>`);
  setTimeout(() => {
    const el = document.getElementById('msg-input');
    if (el) el.focus();
  }, 50);
  document.getElementById('msg-submit').onclick = async () => {
    const el = document.getElementById('msg-input');
    const text = (el && el.value || '').trim();
    if (!text) { alert('还没有写呢。'); return; }
    try {
      const r = await api('/api/message', {
        method: 'POST',
        body: JSON.stringify({
          pid: netPlayerId(),
          name: (S && S.name) || CFG.name || '匿名',
          text: text.slice(0, 20),
          score: (S && S.gaokao && S.gaokao.finalScore) || null,
        }),
      });
      if (r && r.ok) {
        openModal(`<h3>💬 留言成功</h3>
          <p class="hint-line center">「${escapeHtml(text)}」已经贴在留言墙上了。</p>
          ${closeModalBtn()}`);
      } else if (r && r.reason === 'too_fast') {
        alert('刚发过一条，等一会儿再发吧。');
      } else {
        alert('提交失败，稍后再试。');
      }
    } catch (e) {
      alert('提交失败（网络问题）。');
    }
  };
}

function timeAgo(ts) {
  if (!ts) return '';
  const d = Date.now() - ts;
  if (d < 60000) return '刚刚';
  if (d < 3600000) return Math.floor(d / 60000) + ' 分钟前';
  if (d < 86400000) return Math.floor(d / 3600000) + ' 小时前';
  return Math.floor(d / 86400000) + ' 天前';
}

// 往全校动态播报一条（best-effort，失败静默）
function netBroadcast(text, icon) {
  if (!NET.online || !text) return;
  api('/api/feed', {
    method: 'POST',
    body: JSON.stringify({
      name: (S && S.name) || CFG.name || '匿名',
      text: String(text).slice(0, 60),
      icon: icon || '📢',
    }),
  }).catch(() => {});
}

/* 根据最终属性和结局生成一个「特色之星」称号 */
function computeBadge() {
  if (!S) return '';
  const titles = [];
  if (S.study >= 95) titles.push('卷王之星');
  if (S.social >= 90) titles.push('社交之星');
  if (S.sleep >= 90) titles.push('作息之星');
  if (S.sleep <= 40) titles.push('熬夜之王');
  if (S.study >= 85 && S.social >= 85 && S.sleep >= 85) titles.push('六边形之星');
  if (S.love && S.love.active && S.love.peakAff >= 95) titles.push('恋爱之星');
  if (S.flags.confessions >= 1 && S.flags.rejected >= 1) titles.push('情感坎坷之星');
  if (S.flags.breakups >= 1) titles.push('分手大师');
  if (S.totalLeaveMonths >= 12) titles.push('休学之王');
  if (S.study >= 60 && S.startStudy <= 40 && S.study - S.startStudy >= 30) titles.push('黑马之星');
  return titles.length ? titles[0] : '';
}
// 放榜：上传成绩换排名，并往全校动态播报一条。
async function netPublishResult(score, acTitle) {
  const rankEl = $('#end-rank');
  if (!NET.online) {
    if (rankEl) rankEl.textContent = '单机模式 · 本局未上榜';
    return;
  }
  if (rankEl) rankEl.textContent = '正在上传成绩…';
  try {
    const r = await api('/api/leaderboard', {
      method: 'POST',
      body: JSON.stringify({
        id: netPlayerId(),
        name: (S && S.name) || '匿名',
        score,
        ending: acTitle,
        //badge: computeBadge(),//等supabase加上
        track: (S && S.track) ? S.track + '类' : '',
        //report: JSON.stringify(buildGaokaoReport(score)),//等supabase加上
        ts: Date.now(),
      }),
    });
    if (rankEl) rankEl.textContent = (r && r.rank) ? `全校排名 第 ${r.rank} 名` : '已上榜';
    netBroadcast(`高考 ${score} 分！【${acTitle}】`, score >= 600 ? '🎓' : '📚');
  } catch (e) {
    if (rankEl) rankEl.textContent = '成绩上传失败（不影响本局结算）';
  }
}

// 用 if 兜一层：任何元素缺失都不该把后面的脚本（含 boot）带崩。
$$('#btn-leaderboard, #btn-game-leaderboard').forEach((btn) => { btn.onclick = showLeaderboard; });
$$('#btn-feed, #btn-game-feed').forEach((btn) => { btn.onclick = showFeed; });

$('#btn-message-wall').onclick = showMessageWall;
$('#btn-write-message').onclick = showWriteMessage;

/* ---------------- 启动 ---------------- */
(function boot() {
  show('#screen-menu');
  netBoot();
  tryRestore();
})();
