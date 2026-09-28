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
  loveMode: 'full',   // 感情倾向：full=纯爱, half=有情, none=无意
  startYear: null,
};

// 开局天赋：只给起步属性，不再和恋爱线绑定。
const TALENT_FX = Object.freeze({
  '学霸胚子': { study: 10 },
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
     休学更容易、高考竞争扣分更狠、恋爱推进更慢。
   所有数值集中在预设里，改一处即可同时影响全局。 */
const DIFFICULTY_PRESETS = Object.freeze({
  hard: Object.freeze({
    key: 'hard',
    level: 1,
    label: '普通',
    short: '普通',
    blurb: '考试每 5 轮一次，资源取舍偏紧。',
    examInterval: 5,          // 每 N 轮一次考试
    crisisRecovery: 6,        // 极低睡眠时的强制休整回补
    rankOffset: 8,            // 排名中心额外后移（同样学习属性名次更靠后）
    gaokaoPenalty: [10, 30],  // 高三竞争：高考实际分数额外扣减区间
    leaveChanceMul: 1,        // 休学概率倍率
    affMul: 1,                // 好感增长倍率
  }),
  hell: Object.freeze({
    key: 'hell',
    level: 2,
    label: '困难',
    short: '困难',
    blurb: '考试每 4 轮一次，属性收益更低，休学更容易，恋爱推进更慢。',
    examInterval: 4,
    crisisRecovery: 3,
    rankOffset: 22,
    gaokaoPenalty: [18, 42],
    leaveChanceMul: 1.35,
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
const PHONE_CATCHERS = ['年级主任郑rj', '级长林zy', '级长巨 wf', '级长刘hg', '级长曾y'];

function phoneCatcher() {
  return pick(PHONE_CATCHERS);
}

function normalizeClassName(name) {
  if (name === '容庚班') return '容庚班';
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
      body: '校园开放日的横幅挂在校门口，家长和初中生沿着教学楼参观。你站在熟悉的走廊里，第一次从“学生”的视角介绍自己的学校。',
      fx: { social: 3, study: 1, sleep: -2 }, journal: '· 12月学校开放日',
    },
    {
      month: '3月', flag: 'openDayMarSeen', title: '🌱 三月学校开放日',
      body: '春天的树影铺满操场，学校又迎来一批来访的家长和学弟学妹。社团摊位、实验室和图书馆都比平时热闹。',
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
  if (v >= 75) return '优秀';
  if (v >= 50) return '良好';
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

// 选科 × 性别的适配度：女生学物理、男生学历史，同样的努力收益更低。
function trackStudyPenalty() {
  const track = (S && S.track) || CFG.track;
  if (!track) return 0;
  if (CFG.gender === '女' && track === '物理') return 3;
  if (CFG.gender === '男' && track === '历史') return 3;
  return 0;
}

function trackStudyPenaltyLabel() {
  const track = (S && S.track) || CFG.track;
  if (!track) return '';
  if (CFG.gender === '女' && track === '物理') return '女生学物理：学习收益 -3';
  if (CFG.gender === '男' && track === '历史') return '男生学历史：学习收益 -3';
  return '';
}

function mainEffects(act) {
  const level = DIFFICULTY.level;
  // 睡眠优先：睡眠收益从 12 改成 9
  if (act === 'sleep') return { sleep: 9 - level, social: -(2 + level), study: -(3 + level) };
  // 社交优先：社交收益从 10 改成 7
  if (act === 'social') return { sleep: -(3 + level), social: 7 - level, study: -(2 + level) };
  // 学习优先：学习收益从 10 改成 7（Math.max(2, ...) 是为了防止低难度下扣成负数）
  const studyGain = Math.max(2, 7 - level - trackStudyPenalty());
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
  // 等待浏览器完成渲染，再滚动到底部
  requestAnimationFrame(() => {
    log.scrollTop = log.scrollHeight;
  });
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
  sleepStatus.textContent = sleepLabel(S.sleep);
  sleepStatus.title = sleepRiskHint(S.sleep);
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
  if (typeof fx.sleep === 'number') S.sleep = clamp(S.sleep + fx.sleep);
  if (typeof fx.social === 'number') S.social = clamp(S.social + fx.social);
  if (typeof fx.study === 'number') S.study = clamp(S.study + fx.study);
  if (typeof fx.aff === 'number') addAff(fx.aff);
  renderHud();
}

function sleepImpactForBand(band) {
  if (band === 'tired') return { study: -1, social: -1 };
  if (band === 'noticeable') return { study: -2, social: -2 };
  if (band === 'leave-risk') return { study: -3, social: -3 };
  if (band === 'severe') return { study: -4, social: -4 };
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
  if (S.sleep >= 60) return 0;
  if (S.sleep < 50) {
    const yearChance = sleepLeaveChance(S.sleep, 50, 0.18, 0.014);
    S.lastLeaveChance = { months: 12, chance: yearChance, sleep: S.sleep };
    if (chance(yearChance)) return startForcedLeave(12, yearChance);
    return 0;
  }
  const monthChance = sleepLeaveChance(S.sleep, 60, 0.16, 0.012);
  S.lastLeaveChance = { months: 1, chance: monthChance, sleep: S.sleep };
  if (chance(monthChance)) return startForcedLeave(1, monthChance);
  return 0;
}

function sleepRiskHint(sleep) {
  if (sleep < 50) return `低于 50：本轮强制休学 1 年概率约 ${chancePercent(sleepLeaveChance(sleep, 50, 0.18, 0.014))}%`;
  if (sleep < 60) return `低于 60：本轮强制休学 1 个月概率约 ${chancePercent(sleepLeaveChance(sleep, 60, 0.16, 0.012))}%`;
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

// 选科适配度提示：女生学物理 / 男生学历史，学习收益会打折。
function trackAptitudeNote(track) {
  const t = track || (S && S.track) || CFG.track || '物理';
  if (CFG.gender === '女' && t === '物理') return '⚠ 女生学物理：选科后「学习优先」的收益会降低（-1）。';
  if (CFG.gender === '男' && t === '历史') return '⚠ 男生学历史：选科后「学习优先」的收益会降低（-1）。';
  return '当前性别与这个选科的适配度正常，学习收益不受额外影响。';
}

$$('#in-track button').forEach((b) => {
  b.addEventListener('click', () => {
    const noteEl = $('#track-aptitude-note');
    if (noteEl) noteEl.textContent = trackAptitudeNote(b.dataset.v);
  });
});

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
  startSemester();
  const loveModeRow = $('#in-love-mode .selected');
  CFG.loveMode = loveModeRow ? loveModeRow.dataset.v : 'full';
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
  S.track = CFG.track;
  if (!S.trackApplied) {
    if (S.track === '物理') applyFx({ study: 3 });
    S.trackApplied = true;
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
  showMainChoices();
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

  // 恋爱线：开局只是「还没遇见」，对象在开学后由剧情确定。
  S.love = newLoveState();

  saveLocal();
}

/* ---------------- 主选择（三属性月度） ---------------- */
function scrollLogToEnd() {
  const log = $('#log');
  const actionArea = $('#action-area');
  // 等一下再滚，确保选项区已经渲染完成
  requestAnimationFrame(() => {
    if (log) log.scrollTop = log.scrollHeight;          // 剧情区滚到底部
    if (actionArea) actionArea.scrollTop = 0;            // 选项区滚到顶部
  });
}

function showMainChoices() {
  awaitingChoice = true;
  const area = $('#action-area');
  const hint = `${SEM_NAMES[S.semIdx]} · ${dateLabel(S.round)}　｜　这个月的重心？`;
  const effects = {
    sleep: mainEffects('sleep'),
    social: mainEffects('social'),
    study: mainEffects('study'),
  };
  area.innerHTML = `
    <div class="choice-module current-choice-module">
      <div class="module-kicker">本月安排 · ${DIFFICULTY.label}</div>
      <div class="module-context">${hint}　把时间交给哪一件事？</div>
      <div class="choices" id="main-choices">
        <button class="choice-btn" data-act="sleep">
          <div class="c-top"><span class="choice-key a">😴</span><span class="choice-label">睡眠优先</span></div>
          <div class="fx-row"><span class="fx-pill sleep">睡眠 ${signed(effects.sleep.sleep)}</span><span class="fx-pill social">社交 ${signed(effects.sleep.social)}</span><span class="fx-pill study">学习 ${signed(effects.sleep.study)}</span></div>
        </button>
        <button class="choice-btn" data-act="social">
          <div class="c-top"><span class="choice-key b">🎉</span><span class="choice-label">社交优先</span></div>
          <div class="fx-row"><span class="fx-pill social">社交 ${signed(effects.social.social)}</span><span class="fx-pill sleep">睡眠 ${signed(effects.social.sleep)}</span><span class="fx-pill study">学习 ${signed(effects.social.study)}</span></div>
        </button>
        <button class="choice-btn" data-act="study">
          <div class="c-top"><span class="choice-key c">📚</span><span class="choice-label">学习优先</span></div>
          <div class="fx-row"><span class="fx-pill study">学习 ${signed(effects.study.study)}</span><span class="fx-pill sleep">睡眠 ${signed(effects.study.sleep)}</span><span class="fx-pill social">社交 ${signed(effects.study.social)}</span></div>
          ${trackStudyPenaltyLabel() ? `<div class="choice-hint">${trackStudyPenaltyLabel()}</div>` : ''}
        </button>
      </div>
    </div>`;
  area.querySelectorAll('.choice-btn').forEach((b) => {
    b.onclick = () => chooseMain(b.dataset.act);
  });
  scrollLogToEnd();
}

function chooseMain(act) {
  if (!S || S.ended) return;
  awaitingChoice = false;
  S[act + 'Act'] = (S[act + 'Act'] || 0) + 1;
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
      '课间吹水、放学打球、周末组局。班级群@你的次数肉眼可见变多——快乐是真的，落下的题也是真的。',
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
  if (CFG.loveMode === 'half') chanceVal *= 0.5;   // 有情：频率减半
  if (CFG.loveMode === 'none') return false;        // 无意：不触发日常恋爱
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
function buildEventQueue() {
  QUEUE = [];
  // 3月 / 5月 / 12月的学校开放日按月份固定触发一次；普通校园事件仍照常保留。
  const openDay = buildOpenDayEvent();
  if (openDay) { QUEUE.push(openDay); loveQuotaTick(); }

  // 真实节日（元旦 / 春节 / 清明 / 劳动节 / 端午 / 中秋 / 国庆）按真实日期触发。
  const holiday = buildRealHolidayEvent();
  if (holiday) { QUEUE.push(holiday); loveQuotaTick(); }

  // 本轮必有的 1 次校园事件，同时给恋爱配额 +1 点收入。
  QUEUE.push(pickEvent());
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
  // 队列走完 → 进入下一轮（或学期结算 / 结局）
  finishRound();
}

function renderEventChoice(sc) {
  if (sc.intro && !sc.introShown) {
    sc.introShown = true;
    const intro = sc.intro;
    logEvent(intro.kind || 'event', intro.title, intro.body, intro.fx || null);
  }

  awaitingChoice = true;
  const area = $('#action-area');
  const keys = ['a', 'b', 'c', 'd', 'a', 'b'];
  area.innerHTML = `
    <div class="choice-module ${sc.moduleClass || 'event-choice-module'}">
      <div class="module-kicker">${sc.kicker || '剧情选择'}</div>
      <div class="module-context">${sc.hint || '选一个回应，结果会影响后续三年。'}</div>
      <div class="choices" id="event-choices">
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
      </div>
    </div>`;
  area.querySelectorAll('.choice-btn').forEach((btn) => {
    btn.onclick = () => {
      const opt = sc.options[+btn.dataset.i];
      const result = opt.resolve ? opt.resolve() : opt;
      QUEUE.shift();
      awaitingChoice = false;
      applyFx(result.fx);
      if (result.kind || result.title) {
        logEvent(result.kind || 'event', result.title || result.label, result.text || '', result.fx, result.resultHtml || '', result.fxLabels || opt.fxLabels);
      }
      if (result.journal) journal(result.journal);
      if (result.onPick) result.onPick();
      if (sc.onResolve) sc.onResolve();
      checkTitles();
      processQueue();
    };
  });
  scrollLogToEnd();
}

/* ---------------- 校园事件池 ---------------- */
const CAMPUS_EVENTS = [
  {
    t: 'choice',
    condition: () => isBoarder(),
    build: () => ({
      title: '偷偷在自习课去打球',
      body: '你和同伴拿着球拍偷偷从教学楼的后面溜走。\n你刚伸出头，级长就刷新在你身边：「哪个班的？」',
      tag: '校园事件',
      options: [
        { label: '硬着头皮报隔壁班', fx: { sleep: -1, social: 1 }, text: '你胡乱报了个数字。级长眯眼看了你三秒，居然挥手放行。回教室的路上你心跳如鼓。', kind: 'event', journal: '· 偷偷去打球：报隔壁班过关' },
        { label: '马上跑', fx: { social: 2, study: -1 }, text: '你头也不回，撒开脚步，和同伴一起冲向天桥。级长叹了口气：「这群孩子真管不住。」你成功躲避了级长的追捕，但后面的巡查更严了。', kind: 'event', journal: '· 偷偷去打球：跑路' },
      ],
    }),
  },
  {
    t: 'choice',
    build: () => ({
      title: '运动计划',
      body: '今天你想去运动一下。',
      options: [
        { label: '去操场跑步', fx: { social: 3, sleep: 2 }, text: '你在操场跑了几圈，途中不时和同学打招呼，还遇到了老师，跑完以后，你感觉全身都轻松了。', kind: 'event' },
        { label: '去体育馆打羽毛球', fx: { study: 2, social: 1 }, text: '你用最快的速度冲到体育馆三楼，抢到了最好的场，打了好几场酣畅淋漓的单打，最后精疲力竭，差点连回宿舍洗澡的力气都没有。', kind: 'good' },
      ],
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
    condition: () => isBoarder() && CFG.gender === '男' && S.semIdx < 4,
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
    build: () => ({
      title: '熄灯后的宿舍',
      body: `熄灯铃响了，宿舍里却没有一个人真的准备睡觉。大家把声音压低，开始高谈阔论。`,
      options: [
        { label: '开一局狼人杀', fx: { social: 5, sleep: -4, study: -3 }, text: '预言家第一晚就被刀，狼人却因为笑得太大声暴露了。你们憋笑憋到肚子疼。', kind: 'event', journal: '· 宿舍狼人杀' },
        { label: '摊开三国杀', fx: { social: 4, sleep: -3, study: -3 }, text: '有人抽到主公，有人摸到一手闪。牌面越来越乱，直到巡楼脚步声从走廊尽头传来。', kind: 'event', journal: '· 宿舍三国杀' },
        { label: '窜宿找人一起玩', fx: { social: 6, sleep: -5, study: -3 }, text: '你趁查寝间隙溜到隔壁宿舍，几个人挤在门后继续聊天。夜里最快乐的事，往往都不在计划里。', kind: 'event', journal: '· 夜间窜宿' },
      ],
    }),
  },
  {
    t: 'choice',
    condition: () => isBoarder(),
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
            ? { fx: { social: 1, sleep: 1 }, kind: 'good', title: '同学觉得你确实很赶，也没有责怪你', text: '你和同学们还是好朋友。', journal: '· 同学理解' }
            : { fx: { social: -3, study: -1 }, kind: 'bad', title: '同学觉得你就多带一份没什么大不了的', text: '有的同学觉得你很小气。', journal: '· 同学不高兴' },
        },
      ],
    }),
  },
  {
    t: 'choice',
    condition: () => isBoarder(),
    build: () => ({
      title: '饭堂珍馐图鉴',
      body: '住宿生在饭堂有时会遇到一些出乎意料的菜。今天的菜单像满汉全席。',
      options: [
        { label: '挑战炸鸡腿', fx: { social: 2, study: -1 }, text: '鸡腿外壳酥脆，里面的肉又香又嫩。你咬了一口，汁水在嘴中炸开。你决定把它记进人生档案。', kind: 'bad', journal: '· 饭堂：神秘的冰冻大鸡腿', onPick: () => collectFood('饭堂·神秘的冰冻大鸡腿') },
        { label: '经典水蒸蛋', fx: { social: 1, sleep: -1 }, text: '水蒸蛋晶莹剔透，面上有一层薄薄的酱油，你用勺子挖了一块送到嘴里，就像吃布丁和果冻。', kind: 'bad', journal: '· 饭堂：软的薯条', onPick: () => collectFood('饭堂·软的薯条') },
        { label: '冰爽凉粉', fx: { social: 2, sleep: -2 }, text: '一碗凉粉，裹着糖水和蜂蜜，你嗦下一块，感觉夏天的热气和做题的烦恼都消散了。', kind: 'bad', journal: '· 饭堂：一袋宵夜半袋油', onPick: () => collectFood('饭堂·一袋宵夜半袋油') },
      ],
    }),
  },
  {
    t: 'choice',
    build: () => ({
      title: '莞城美食地图',
      body: isBoarder() ? '住宿生趁周末、高一高二放假或高三混出去的机会，终于能去校外找点好吃的。' : '走读放学后，你不用吃饭堂，顺路去莞城解决一顿。',
      options: [
        { label: '老鸭粉丝汤', fx: { social: 3, sleep: 1 }, text: '热气先把人哄好了。你吃完才发现，今天的坏心情已经没剩多少。', kind: 'good', journal: '· 校外：老鸭粉丝汤', onPick: () => collectFood('校外·老鸭粉丝汤') },
        { label: '莞留香', fx: { social: 3, study: 1 }, text: '店里的味道稳稳当当，适合在一周被卷完之后认真吃一顿。', kind: 'good', journal: '· 校外：莞留香', onPick: () => collectFood('校外·莞留香') },
        { label: '鹅好味', fx: { social: 3, sleep: 1 }, text: '烧腊切开时还带着光。你决定下次再来，顺便把同桌也带上。', kind: 'good', journal: '· 校外：鹅好味', onPick: () => collectFood('校外·鹅好味') },
        { label: '品中品', fx: { social: 2, study: 1 }, text: '饭菜好吃，汤也可口。你用一顿饭把自己从考试周里捞了出来。', kind: 'good', journal: '· 校外：品中品', onPick: () => collectFood('校外·品中品') },
        { label: '鲜汇', fx: { social: 3, sleep: 1 }, text: '奶茶、菠萝包和一会儿不用讨论成绩的时间，组成了一个很像假期的晚上。', kind: 'good', journal: '· 校外：鲜汇', onPick: () => collectFood('校外·茶餐厅') },
      ],
    }),
  },
  {
    t: 'choice',
    build: () => ({
      title: '课堂上的手机',
      body: `老师在讲台上写板书，你的手机在抽屉里亮了一下。年级主任和级长${S.semIdx >= 4 ? '就在走廊巡堂' : '随时可能从后门推门进来'}——这一节课，要不要赌一把？`,
      options: [
        {
          label: '把手机压在课本下刷一会儿',
          fx: { study: -2, sleep: -1 },
          chanceLabel: '不被抓约 30%',
          riskHint: '被郑rj/林zy/巨 wf/练jc/曾y逮到的概率很大',
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
    condition: () => S.semIdx >= 4 && !S.flags.volunteerSeen,
    build: () => ({
      title: '📝 志愿填报',
      body: `${gaokaoDateLabel()}，高考结束。志愿填报系统开放了，分数还没正式出来，但你已经开始在「冲一冲、稳一稳、保一保」之间来回改草稿。`,
      options: [
        { label: '冲一冲，填最想去的大学', fx: { social: 3, sleep: -1 }, text: '你把最想去的专业放在第一志愿。结果如何先不管，至少这一次你没有只按别人眼里的稳妥来选。', kind: 'good', journal: '· 志愿填报：冲理想大学', onPick: () => { S.flags.volunteerChoice = '冲刺'; S.flags.volunteerSeen = true; } },
        { label: '稳一稳，按分数梯度填报', fx: { study: 1, social: 2 }, text: '你列了三张表，把城市、专业和录取概率逐项对比。没有最浪漫的答案，但每一档都留了退路。', kind: 'event', journal: '· 志愿填报：稳妥梯度', onPick: () => { S.flags.volunteerChoice = '稳妥'; S.flags.volunteerSeen = true; } },
        { label: '保一保，先确保有书读', fx: { sleep: 2, social: 1 }, text: '你给自己留了足够的保底志愿。面对不确定的分数，能把选择权握在手里，也是一种成熟。', kind: 'good', journal: '· 志愿填报：保底优先', onPick: () => { S.flags.volunteerChoice = '保底'; S.flags.volunteerSeen = true; } },
      ],
    }),
  },
  {
    t: 'choice',
    condition: () => isBoarder() && S.semIdx >= 4,
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

/* pickEvent：choice 事件先展示说明卡，再挂选项 */
function pickEvent() {
  const eligible = CAMPUS_EVENTS.filter((event) => !event.condition || event.condition());
  const raw = pick(eligible.length ? eligible : CAMPUS_EVENTS);
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
  '校史馆最里面那面墙上挂着一张 1985 年的黑白合影，边角写着一行小字：「首届高三（2）班」。',
  '绿瓦楼后墙有一块被水泥补过的砖，据说当年是学生偷偷刻下的班号，后来被抹掉了。',
  '校史馆的展柜里放着一只旧铁皮饭盒，标签上写着「1992 · 饭堂改建纪念」。',
  '绿瓦楼二楼的木地板踩上去会响，据说底下还留着旧礼堂的舞台。',
  '校史馆角落的登记本上，有一页被人用钢笔写了半句话：「愿后来的人，也在这里留下点什么。」',
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
        label: '走廊和同学闲聊', fx: { social: 2, study: -2 },
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
        label: '拿习题去办公室找老师答疑', fx: { study: 2, sleep: -3 },
        title: '📖 办公室答疑',
        text: '办公室里排了三个人。你把攒了两天的题一口气问完，老师顺手在你本子上画了个圈：「这个思路对了。」',
        journal: '· 课间：办公室答疑',
      },
      {
        label: '和好友去操场走走', fx: { social: 2, sleep: -2 },
        title: '📖 操场走一圈',
        text: '你们绕操场走了一圈，在小卖部买了两瓶饮料。回来的时候出了些汗，上课铃刚好响。',
        journal: '· 课间：操场走一圈',
      },
      {
        label: '跑去地下室打乒乓球', fx: { social: 1, sleep: -2 },
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
    ],
  },
  {
    key: 'lunch',
    title: '🍚 午饭 & 午休',
    hint: '中午是全天最自由的一段。',
    body: '第四节课的下课铃一响，楼道里全是脚步声。饭堂的队伍已经排到了门口，也有人端着饭盒直接回了教室。',
    options: [
      {
        label: '食堂正常吃饭，回宿舍午休', fx: { sleep: 3, study: -1, social: -1 },
        title: '🍚 吃饭午休',
        text: '你排了十分钟的队，打了一份两荤一素，回宿舍躺下的时候还不到一点。醒来时天光正好。',
        journal: '· 午饭：吃饭午休',
      },
      {
        label: '快速吃完饭留在教室刷题', fx: { study: 1, sleep: -1 },
        title: '🍚 教室刷题',
        text: '你五分钟解决午饭，把错题本翻到第三页。教室里只有两三个人，安静得能听见笔尖划纸的声音。',
        journal: '· 午饭：教室刷题',
      },
      {
        label: '和同学结伴出校门附近探店', fx: { social: 3, sleep: -1, study: -1 },
        available: () => dailyCanLeave(),
        title: '🍚 出校探店',
        text: '你们在校门口那家小馆子坐下，点了三样分着吃。回到教室的时候，身上还带着一股油烟味。',
        journal: '· 午饭：出校探店',
        onPick: () => { dailyUseLeavePass(); },
      },
    ],
  },
  {
    key: 'afternoon',
    title: '🌇 放学之后',
    hint: '晚修前还有一段空档。',
    body: '下午的课结束，晚修还有一段时间。操场上有跑步的，教室里有写作业的，图书馆亮着灯，校史馆那边一个人都没有。',
    options: [
      {
        label: '去操场打球 / 跑步', fx: { sleep: 2, study: -2 },
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
        label: '去图书馆看书', fx: { social: 2, study: -1 },
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
        label: '专心刷题、整理错题', fx: { study: 2, social: -1 },
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
        label: '偷偷看课外书', fx: { social: 2, study: -2 },
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
    body: '晚修结束，宿舍楼下的灯还亮着。有人一路小跑回去抢洗澡位，有人慢慢走还在对答案。熄灯时间是固定的，谁也躲不过。',
    options: [
      {
        label: '快速洗漱，早点上床休息', fx: { sleep: 3, social: -1, study: -2 },
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
        label: '好好睡一觉休息，出门逛街散心', fx: { sleep: 3, study: -2 },
        title: '📅 睡到自然醒',
        text: '你睡到中午才起，然后一个人出门走了很久。回来的时候天已经黑了，作业一个字没动，但整个人松了下来。',
        journal: '· 周末：睡觉逛街散心',
        onPick: () => { dailyGrantLeavePass(); },
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
      { label: '答应接下任务', fx: { social: 2, study: -1}, title: '🎲 接下黑板报', text: '你拉了三个同学一起，利用课间把版面分了工。出刊那天，隔壁班的人特意过来看了两眼。', journal: '· 黑板报：接下任务' },
      { label: '委婉推辞', fx: {}, title: '🎲 推辞了黑板报', text: '你说最近作业有点多。班主任点点头：「那下次吧。」你说不清心里是松了口气还是有点失落。', journal: '· 黑板报：委婉推辞' },
    ],
  },
  {
    title: '🎲 同桌找你要笔记复习',
    body: '月考临近。同桌凑过来，声音压得很低：「你那本笔记……借我看看呗？就一晚上。」',
    options: [
      { label: '大方借给他', fx: { social: 3, study: -2 }, title: '🎲 借出笔记', text: '第二天早上，笔记本整整齐齐放在你桌上，里面还夹了一张便利贴：「你圈的重点真准，谢了。」', journal: '· 笔记：大方借出' },
      { label: '婉拒，自己还要用', fx: { social: -1, study: 1 }, title: '🎲 婉拒了', text: '你说自己晚上还要过一遍。同桌「哦」了一声，转回去翻自己的书。那天你没怎么分心，把整章都过完了。', journal: '· 笔记：婉拒（自己复习）' },
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

function dailySlotIndex() {
  if (!S) return 0;
  if (typeof S.dailyIdx !== 'number' || !isFinite(S.dailyIdx) || S.dailyIdx < 0) S.dailyIdx = 0;
  return S.dailyIdx % DAILY_SLOTS.length;
}
function advanceDailySlot() {
  if (!S) return;
  S.dailyIdx = (dailySlotIndex() + 1) % DAILY_SLOTS.length;
}

function buildDailyEvent() {
  if (!S) return null;
  const slot = DAILY_SLOTS[dailySlotIndex()];
  advanceDailySlot();
  const options = slot.options
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
    key: 'B', name: '陆云舒', persona: '阳光学生会长型', club: '学生会',
    meetPlace: '教学楼大厅的学生会公告板前',
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
    logEvent('love', '💗 关系变化', affJumpAt(st) || affStageAt(st).desc, null);
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

/* ---------------- 遇见 ---------------- */
function buildLoveMeetEvent() {
  const L = S && S.love;
  if (!L || L.met) return null;
  if (CFG.loveMode === 'none') return null;   // 无意：直接不遇见
  if (S.round < 2) return null;
  const chars = loveChars();
  const body = loveIsBoy()
    ? '开学有一阵了。走廊上总有人从你旁边挤过去，没人多看你一眼。\n\n这一天，有个人在你面前停住了，站了大概两秒。'
    : '开学有一阵了，你还没认真看过班里和走廊上的每一张脸。\n\n这一天，有个人从人群里走出来，在你面前停了一下。';
  return {
    t: 'choice',
    intro: {
      kind: 'love',
      title: '🚪 遇见',
      body,
    },
    options: Object.keys(chars).map((k) => {
      const c = chars[k];
      return {
        label: `${c.name} · ${c.persona}`,
        riskHint: c.club,
        fx: { aff: 12 },
        kind: 'love',
        title: `👀 遇见了 ${c.name}`,
        text: `${c.meetPlace}。\n\n${c.meetLine}\n\n（${c.persona} · ${c.club}）`,
        journal: `· 遇见 ${c.name}（${c.persona}）`,
        onPick: () => {
          L.met = true;
          L.char = k;
          L.name = c.name;
          L.gender = CFG.gender === '男' ? '女' : '男';
          L.from = '开学遇见';
          L.aff = 12;
          L.stage = stageForAff(12);
          L.peakAff = 12;
          L.flags.bday = pick([3, 4, 5, 6, 9, 10, 11]);
          renderHud();
        },
      };
    }),
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
      body: `你抱着一摞作业本往办公室走，拐角处，一个人影撞了上来。纸页哗啦散了一地。\n\n「……抱歉。」\n\n${ta}蹲下去捡，头发垂下来挡住脸。你注意到${ta}捡得很快，像是想赶紧结束这件事。`,
    },
    options: [
      { label: '一起蹲下去捡', fx: { aff: 5, social: 1 }, kind: 'love', title: '📚 一起捡',
        text: lp({ A: '「……谢谢。」TA 抬头看了你一眼，又很快移开。', B: '「哦！谢啦！」TA 把最后一本塞进你怀里，笑得毫无防备。', C: '「……谢谢。」TA 把书递过来的时候，指尖停了一下。', D: '「……我自己会捡。」嘴上这么说，手却没停。' }),
        journal: '· 作业本：一起捡' },
      { label: '站着摆手说「没事没事」', fx: { aff: 1 }, kind: 'love', title: '📚 客气了一下',
        text: lp({ A: '「嗯。」TA 把最后一本递给你，转身走了。', B: '「没事就好！那我先走啦。」', C: '「……嗯，麻烦了。」', D: '「算你识相。」' }),
        journal: '· 作业本：客气' },
      { label: '开玩笑：「下次走路看路啊。」', fx: { aff: -3 }, kind: 'love', title: '📚 玩笑开过头',
        text: lp({ A: '「……是我的错。」TA 低下头，声音很轻。', B: '「哈？明明是你挡路！」TA 瞪了你一眼，走了。', C: '「……对不起。」TA 把书摞好，抱起来走了。', D: '「你才要看路！笨蛋。」' }),
        journal: '· 作业本：玩笑开过头' },
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
      body: `你在草稿纸上划掉第三个错误的公式，旁边传来一句很轻的话。\n\n${ta}：「……你昨天那节课的笔记，记了吗？」`,
    },
    options: [
      { label: '递过去，还顺手圈出重点', fx: { aff: 8, study: 1 }, kind: 'love', title: '📓 圈了重点',
        text: lp({ A: '「你这里画的是什么？」TA 指着你圈的地方，第一次主动追问。', B: '「哇，你还标了重点！」TA 凑过来看，肩膀差点撞到你。', C: '「……你圈的地方，和我画的不太一样。」TA 看得很久。', D: '「谁、谁要你圈重点了。」TA 嘴上嫌弃，抄得很认真。' }),
        journal: '· 借笔记：圈重点' },
      { label: '递过去，装作不在意', fx: { aff: 4 }, kind: 'love', title: '📓 随手递过去',
        text: lp({ A: '「谢谢。」TA 翻得很快，像是在赶时间。', B: '「够意思！」', C: '「谢谢……我看完还你。」', D: '「哼，算你有点用。」' }),
        journal: '· 借笔记：随手' },
      { label: '「你上课都没听吗？」', fx: { aff: -5 }, kind: 'love', title: '📓 说错话了',
        text: lp({ A: '「……当我没问。」TA 把手收了回去。', B: '「我听了！我只是没记！」TA 有点急。', C: '「……嗯，没听。」TA 低下头。', D: '「关你什么事。」TA 转过身去。' }),
        journal: '· 借笔记：说错话' },
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
      body: `食堂里空位不多。你端着餐盘，看见${ta}一个人坐在靠窗的角落，对面的椅子空着。`,
    },
    options: [
      { label: '走过去问「这里有人吗」', fx: { aff: 7, social: 2, sleep: -1 }, kind: 'love', title: '🍚 拼桌成功',
        text: lp({ A: '「……没有。」TA 把书包从椅子上拿开，动作有点急。', B: '「没人没人，坐！」TA 顺手把对面的碗挪开。', C: '「没有。」TA 把餐盘往自己那边收了收，给你让出位置。', D: '「你坐哪不行啊。」TA 说着，还是把书包拿走了。' }),
        journal: '· 食堂：拼桌' },
      { label: '隔着两张桌子坐下，不打扰', fx: { aff: 2 }, kind: 'love', title: '🍚 隔了两张桌子',
        text: `${ta}抬了下头，好像想说什么，最后什么也没说。`,
        journal: '· 食堂：隔着坐' },
      { label: '招呼同学一起挤过去，热闹一点', fx: { aff: 0, social: 3 }, kind: 'love', title: '🍚 人多热闹',
        text: `${ta}笑了笑，但整顿饭没怎么说话。`,
        journal: '· 食堂：招呼一群人' },
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
    onResolve: () => { S.love.seen.e05 = true; },
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

// 07 · 天台（④）
function loveEvent07() {
  const ta = loveTa();
  return {
    t: 'choice',
    intro: {
      kind: 'love',
      title: '🌬️ 外面的走廊',
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

// 08 · 文化节的后夜（④→⑤ 前置）
function loveEvent08() {
  const ta = loveTa();
  return {
    t: 'choice',
    intro: {
      kind: 'love',
      title: '🎪 文化节的后夜',
      body: `舞台的灯灭了，人群散了。操场上只剩下零零散散的人影和没收拾完的灯串。\n\n你回头，发现${ta}还站在那里。\n\n${ta}：「……今天的节目，你看了吗？」`,
    },
    options: [
      { label: '「看了。我一直看着你。」', fx: { aff: 10, social: 3, sleep: -1 }, kind: 'love', title: '🎪 后夜祭',
        text: lp({ A: '「……你这个人，说话能不能别这样。」TA 转过身，背对着你站了很久。', B: '「诶？！你、你说什么？」TA 的声音一下就抖了。', C: '「……我听见了。」TA 没有回头，但也没有走。', D: '「……你、你有病吧。」TA 耳朵红得能滴血。' }),
        journal: '· 文化节后夜',
        onPick: () => { S.flags.loveMilestones['后夜祭'] = true; } },
      { label: '「人太多了，什么都没看清。」', fx: { aff: 3 }, kind: 'love', title: '🎪 没看清',
        text: `${ta}：「……是啊，人太多了。」`,
        journal: '· 后夜：没看清' },
      { label: '「你怎么还没走？」', fx: { aff: 1 }, kind: 'love', title: '🎪 问了一句',
        text: `${ta}：「马上就走。」`,
        journal: '· 后夜：问了一句' },
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
    D: '教学楼后门的台阶上，放学的铃声刚响过',
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

// 07 · 天台上的烟（④）
function boyEvent07() {
  const ta = loveTa();
  return {
    t: 'choice',
    intro: {
      kind: 'love',
      title: '🌬️ 天台上的风',
      body: `天台风大。\n\n${ta}靠在栏杆上，把手插在兜里，看着远处。\n\n${ta}：「你怎么上来的。」`,
    },
    options: [
      { label: '「找你。」', fx: { aff: 9, social: 2, sleep: -1 }, kind: 'love', title: '🌬️ 找你',
        text: lp({ A: '「……找我干嘛。」TA 低着头，脚尖踢栏杆。', B: '「找我？」TA 转过身来，「那你找到啦。」语气很轻松，但耳朵先红了。', C: '「……找我。」TA 重复了一遍，像是要确认，「为什么。」', D: '「找我干嘛，我有什么好找的。」TA 低着头，脚尖一直在踢栏杆。' }),
        journal: '· 天台：找你' },
      { label: '「借的钥匙。」', fx: { aff: 6, study: -1 }, kind: 'love', title: '🌬️ 借的钥匙',
        text: lp({ A: '「你还挺厉害。」', B: '「可以啊，下次帮我也借一把。」', C: '「……管理员也给你。」TA 看了你一眼，有点意外。', D: '「你还能借到钥匙？」TA 明显不太信。' }),
        journal: '· 天台：借的钥匙' },
      { label: '「你一个人在这儿干什么。」', fx: { aff: 7, sleep: -1 }, kind: 'love', title: '🌬️ 问了一句',
        text: lp({ A: '「……没什么。就是不想回教室。」TA 停了停，「你怎么来了。」', B: '「躲清静啊。」TA 笑了笑，「你怎么找到这儿的。」', C: '「……在想一道题。」TA 停了一下，「你上来，我就想不出来了。」', D: '「关你什么事。」TA 说完自己又补了一句，「……就是不想回教室。」' }),
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
      body: `比赛输了。哨响之后${ta}一个人在场上站了很久，等所有人散了才走上看台，坐在最上面一排。\n\n${ta}：「你怎么还不走。」`,
    },
    options: [
      { label: '「陪你坐会儿。」', fx: { aff: 12, social: 3, sleep: -1 }, kind: 'love', title: '🏆 看台最上面一排',
        text: lp({ A: 'TA「嗯」了一声，把外套脱下来搭在旁边，动作是让你坐那儿。', B: '「坐吧。」TA 拍了拍旁边的位置，「这上面视野好，能看到整个场子。」', C: 'TA 没说话，把书包从旁边挪开，留出半个位置。', D: '「随便你。」TA 往旁边挪了挪，位置留得比需要的大。' }),
        journal: '· 比赛之后：陪着',
        onPick: () => { S.flags.loveMilestones['看台最上面一排'] = true; } },
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
    onResolve: () => { if (succeeded) S.love.seen.e09 = true; },
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

/* ---------------- 日常闲聊 / 手机消息 ---------------- */
const LOVE_CHAT = {
  '教室 · 早晨': ['「早。」（TA 点了点头，没有看你）', '「早，今天第一节是数学吧。」', '「给你留了位置，靠窗那个。」', '「……你今天来得比平时早。」（TA 把书往旁边挪了挪）', '「早啊。昨晚睡得好吗？」（TA 把手里的牛奶推到你桌上）'],
  '走廊 · 课间': ['「借过。」', '「你也去办公室？」', '「等一下我，我跟你一起。」', '「刚才……你身边那个女生是谁？」', '「放学等我，别又自己先走了。」'],
  '食堂 · 午餐': ['「……」TA 端着餐盘走开了', '「那个菜不好吃，别打。」', '「我这儿有多的一双筷子。」', '「你尝一口这个。」（TA 把餐盘往你那边推了推）', '「今天我来打饭，你坐着。」'],
  '放学 · 校门口': ['「再见。」', '「明天见。」', '「你走哪边？顺路的话……」', '「我等你。」（TA 说得很轻，像是怕被人听见）', '「今天绕远一点回去吧，我不想那么快到家。」'],
};

// 男生线闲聊库：把「食堂 · 午餐」换成「球场 · 课间」，其余场合对齐女生线
const LOVE_CHAT_BOY = {
  '教室 · 早晨': ['「让一下。」（TA 绕过你的桌子，没抬眼）', '「作业，借我看一眼。」', '「给你留了位置，后边。前面太吵。」', '「你今天来得挺早。」（TA 说完就把头转向窗外）', '「早饭在桌上。别说不好吃。」'],
  '走廊 · 课间': ['「借过。」', '「你也上这节课？」', '「等你——不是，刚好碰上。」', '「刚才跟你说话的那个是几班的。」', '「放学别自己走。等我。」'],
  '球场 · 课间': ['「让让。」', '「你会打吗？过来。」', '「传球！……算了，你跑位太慢。」', '「今天不打了。」（TA 把球收起来，你问为什么，TA 说「不想打」）', '「你今天看我打球了吗？……哦，那你以后都来看。」'],
  '放学 · 校门口': ['「我先走了。」', '「明天见。」', '「顺路，一起。」', '「你走快点。」（然后自己放慢了）', '「今天绕远点吧，回去也没什么。」'],
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
  const line = table[place][st - 1];
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
  { name: '奶茶店', s3: '「你喝什么？我随便。」', s5: '「我们点一杯就够了，喝不完。」', fx: { aff: 6, social: 4, study: -2, sleep: -1 } },
  { name: '书店', s3: '「你先逛，我在那边。」', s5: '「这本……你看过吗？我想买给你。」', fx: { aff: 6, study: 2, sleep: -1 } },
  { name: '电影院', s3: '「你选吧，我都行。」', s5: '「刚才那段，我其实没怎么看。」', fx: { aff: 7, social: 3, sleep: -2 } },
  { name: '人民公园', s3: '「走一圈就回去吧。」', s5: '「再坐一会儿，好不好？」', fx: { aff: 6, social: 3, sleep: 1 } },
  { name: '高三楼后面的园林', s3: '「这儿清静。」', s5: '「以后我们也来这儿吧，就我们俩。」', fx: { aff: 8, social: 4, study: -1 } },
  { name: '小巷', s3: '「……这边晚上挺安静的。」', s5: '「你说，毕业以后我们会怎么样？」', fx: { aff: 9, social: 5, study: -2, sleep: -1 } },
];

// 男生线约会地点：能一起「做点什么」的地方优先，纯坐着聊天的地方靠后
const DATE_SPOTS_BOY = [
  { name: '篮球场', s3: '「你站边上，别给人撞了。」', s5: '「教你投篮。手抬高点——你这个手，我扶着。」', fx: { aff: 8, social: 4, study: -1, sleep: -1 } },
  { name: '游戏厅', s3: '「输的人请喝水。」', s5: '「再来一局。这把不算，你刚才把我手挡了。」', fx: { aff: 7, social: 3, sleep: -1 } },
  { name: '图书馆', s3: '「你安静点。」', s5: '「这本我也看过了。你看到哪页了？」', fx: { aff: 6, study: 2, sleep: -1 } },
  { name: '书店', s3: '「你挑吧，我随便。」', s5: '「这本给你。」（他付过钱了）', fx: { aff: 6, study: 2, sleep: -1 } },
  { name: '人民公园', s3: '「走一圈就回。」', s5: '「坐会儿。……你冷吗。」', fx: { aff: 6, social: 3, sleep: 1 } },
  { name: '小巷', s3: '「这儿好安静。」', s5: '「以后常来这儿吧。就我们俩。」', fx: { aff: 9, social: 5, study: -2, sleep: -1 } },
  { name: '小饭馆', s3: '「你吃辣的还是不放辣。」', s5: '「给你点的。我记着你上次说这个好吃。」', fx: { aff: 7, social: 4, study: -2, sleep: -1 } },
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
            : lp({ A: '「你怎么会知道……」TA 捏着盒子，很久没拆。', B: '「哇——你居然记得！」TA 差点跳起来。', C: '「……谢谢。我很久没过生日了。」', D: '「谁、谁要你送礼物了。」TA 抱着盒子不撒手。' }),
          journal: '· 生日：准备了礼物',
          onPick: () => { sems('bdaySems').push(S.semIdx); } },
        { label: '只在群里发了「生日快乐」', fx: { aff: 2 }, kind: 'love', title: '🎂 群里发的',
          text: loveIsBoy()
            ? `「哦，谢了。」${ta}回得很快，但没有再多说一句。`
            : `「嗯，谢谢。」${ta}回得很快，但没有再多说一句。`,
          journal: '· 生日：群里发的',
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
        body: `10 月，校际比赛。看台上挤满了人，横幅被风吹得啪啪响。\n\n${L.name} 的名字在出场名单的第三个。`,
      },
      options: [
        { label: '站到最前面，喊他的名字', fx: { aff: 10, social: 3, sleep: -1 }, kind: 'love', title: '🏟️ 到场加油',
          text: `${ta}上场前在看台扫了一圈，找到你。什么都没说，但下场之后往你这边扔了毛巾。`,
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
        body: `2 月 14 日。教室里飘着巧克力味，走廊上有人偷偷往别人抽屉里塞东西。\n\n你摸了摸书包——你准备了吗？`,
      },
      options: [
        { label: '自己做的，包装歪歪扭扭', fx: loveIsBoy() ? boyHandFx : { aff: 12, sleep: -2, study: -1 }, kind: 'love', title: '🍫 手作巧克力',
          text: loveIsBoy()
            ? (L.aff < 60
              ? `「……你自己做的？」${ta}拆开纸的时候手有点抖，拆坏了。他看了你一眼，把碎掉的那块先塞进嘴里。`
              : `「……你做的？」${ta}拆开纸的时候手有点抖，拆坏了。`)
            : `「……你自己做的？」${ta}拆开包装纸的时候手有点抖。`,
          journal: '· 情人节：手作巧克力',
          onPick: () => { sems('valentineSems').push(S.semIdx); } },
        { label: '买了现成的', fx: { aff: loveIsBoy() ? 6 : 5 }, kind: 'love', title: '🍫 买来的巧克力',
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
        body: `12 月 25 日，晚自习前。走廊的窗上贴满了手剪的雪花，广播里放着很吵的歌。\n\n${ta}在你桌边停下来。`,
      },
      options: [
        lover
          ? { label: '「今年我们两个人过吧。」', fx: { aff: 6, social: 3, sleep: -1 }, kind: 'love', title: '🎄 两个人的圣诞',
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
function gaokaoBandForStudy(study) {
  const value = clamp(study);
  if (value < 45) {
    return {
      id: 'bottom',
      label: '年级末流',
      rangeLabel: '470 分以下',
      low: 390,
      high: 469,
      expected: Math.round(390 + (value / 45) * 79),
    };
  }
  if (value < 55) {
    return {
      id: 'middle',
      label: '年级中游',
      rangeLabel: '470～530 分',
      low: 470,
      high: 530,
      expected: Math.round(470 + ((value - 45) / 10) * 60),
    };
  }
  if (value < 70) {
    return {
      id: 'upper-middle',
      label: '年级中上游',
      rangeLabel: '530～570 分',
      low: 530,
      high: 570,
      expected: Math.round(530 + ((value - 55) / 15) * 40),
    };
  }
  return {
    id: 'front',
    label: '年级前沿',
    rangeLabel: '570～690 分',
    low: 570,
    high: 690,
    expected: Math.round(570 + ((value - 70) / 30) * 120),
  };
}

function examRankForStudy(study) {
  const value = clamp(study);
  let center;
  if (value < 45) center = 780 - value * 2.5;
  else if (value < 55) center = 610 - (value - 45) * 17;
  else if (value < 70) center = 430 - (value - 55) * 15;
  else center = 180 - (value - 70) * 5.2;
  // 难度越高，同样的学习属性换来的名次越靠后；高三竞争只影响排名，不直接扣学习属性。
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

  logEvent('exam', tier, `${extra}\n${bandHint}\n\n这场考试之后`, fx);
  // 最新事件现在位于 log 顶部，不能再取 lastElementChild（那是选项区）。
  const latestEvent = $('#log .event-card');
  if (latestEvent) latestEvent.insertAdjacentHTML('beforeend', fxPills(fx) + `<div class="result-body" style="margin-top:8px">${rank <= 150 ? '状态不错，节奏找对了。' : rank >= 650 ? '基础在晃，该把重心拉回学习了。' : '不好不坏，继续观察。'}</div>`);
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
  applySleepConsequences();
  const leaveRounds = maybeTriggerSleepLeave();

  // 保留原有的极低睡眠缓冲，但它不能抵消前面的休学判定。
  if (!leaveRounds && S.sleep <= 12) {
    S.sleep = clamp(S.sleep + DIFFICULTY.crisisRecovery);
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

  if (S.semIdx !== previousSem) startSemester();
  else {
    renderHud();
    showMainChoices();
  }
}

/* ---------------- 结局 ---------------- */
function universityForScore(score) {
  if (score >= 680) return { tier: '清北层次', school: '清华大学 / 北京大学', desc: '你可以把最想去的专业放在志愿表最前面，冲刺顶尖高校。' };
  if (score >= 640) return { tier: '985 / 强 211', school: '中山大学 / 华南理工大学', desc: '华南地区的好大学向你敞开，专业选择也有足够余地。' };
  if (score >= 600) return { tier: '211 / 双一流', school: '暨南大学 / 华南师范大学', desc: '你稳稳站上双一流赛道，可以认真比较城市与专业。' };
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
  if (score >= 640) return {
    title: '985 上岸',
    desc: '成绩出来，班主任在群里连发了三个表情。你把录取通知拍给家里，电话那头沉默了两秒，然后是憋不住的笑。',
  };
  if (score >= 600) return {
    title: '211 上岸',
    desc: '稳稳越过特控线。你把堆在桌角的五三一本本收进箱子，忽然有点舍不得这些又爱又恨的夜晚。',
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
      title: '青涩的回忆',
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

function computeScore() {
  const band = gaokaoBandForStudy(S.study);
  // 学习属性决定高考主体区间，睡眠 / 社交 / 恋爱 / 班级只提供小幅综合修正，避免跳出学习档位。
  const lifestyleAdjustment = clamp(Math.round(
    (S.sleep - 70) * 0.08 +
    (S.social - 50) * 0.04 +
    (S.love && S.love.aff >= 71 ? 3 : 0) +
    (CFG.className === '容庚班' ? 5 : 0) +
    rnd(-4, 4)
  ), -8, 8);
  const expectedScore = clamp(band.expected + lifestyleAdjustment, band.low, band.high);
  // 高三竞争加剧：高考实际分数额外下降（普通 10～30，困难 18～42）。
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
  return finalScore;
}

function doEnding() {
  S.ended = true;
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
  $('#end-academic').textContent = ac.title;
  $('#end-academic-desc').textContent = `${gaokaoDateLabel()}，你走进考场。\n\n${ac.desc}\n\n大学结局：${university.tier} · ${university.school}\n${university.desc}\n${volunteerText}\n\n学习档位：${gaokao.bandLabel}\n预计区间：${gaokao.rangeLabel} · 结算基准 ${gaokao.expectedScore} 分\n高三竞争：-${gaokao.competitionPenalty} 分（只计入高考实际分数，学习属性不直接扣减）`;
  $('#end-love-title').textContent = lv.title;
  $('#end-love-desc').textContent = lv.desc;

  $('#end-records').innerHTML = `
    <div class="record-row"><span>难度</span><b>${DIFFICULTY.label}</b></div>
    <div class="record-row"><span>入学 / 高考</span><b>${startYear()} 年 9 月 → ${gaokaoDateLabel()}</b></div>
    <div class="record-row"><span>居住方式</span><b>${CFG.residency} · ${campusForSem(Math.min(S.semIdx, 5))}</b></div>
    <div class="record-row"><span>期末考试排名</span><b>${rankStr}</b></div>
    <div class="record-row"><span>剧情占比</span><b>恋爱 ${Math.round(loveRatio() * 100)}% · 校园 ${100 - Math.round(loveRatio() * 100)}%</b></div>
    <div class="record-row"><span>恋爱对象</span><b>${L0 && L0.met ? `${L0.name} · ${loveChar().persona}` : '未遇见'}</b></div>
    <div class="record-row"><span>好感度</span><b>${L0 && L0.met ? `${L0.aff} / 100 · ${loveStageTag}` : '—'}</b></div>
    <div class="record-row"><span>约会 / 互动</span><b>${(L0 && L0.dates) || 0} 次约会 · 共 ${S.round} 次选择</b></div>
    <div class="record-row"><span>告白 / 被拒 / 分手</span><b>${S.flags.confessions || 0} 次 / ${S.flags.rejected} 次 / ${S.flags.breakups} 次</b></div>
    <div class="record-row"><span>大学结局</span><b>${university.tier} · ${university.school}</b></div>
    <div class="record-row"><span>志愿填报</span><b>${volunteerText.replace('志愿取向：', '')}</b></div>
    <div class="record-row"><span>学习属性档位</span><b>${gaokao.bandLabel} · ${gaokao.rangeLabel}</b></div>
    <div class="record-row"><span>高三竞争扣分</span><b>-${gaokao.competitionPenalty} 分（仅高考）</b></div>
    <div class="record-row"><span>强制休学</span><b>${leaveDurationLabel(S.totalLeaveMonths || 0)} · ${S.leaveCount || 0} 次</b></div>
    <div class="record-row"><span>最终结局</span><b>${finalState}</b></div>
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
  { k: '后夜祭', n: '完成文化节后夜事件' },
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
    '饭堂·大鸡腿': '大鸡腿',
    '饭堂·薯条': '薯条',
    '饭堂·宵夜': '宵夜',
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
    if (!data.S || data.S.ended || !data.S.name) return false;
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
      ...(S.flags || {}),
    };
    S.love = migrateLove(S.love);
    if (!Array.isArray(S.flags.valentineSems)) S.flags.valentineSems = [];
    if (!Array.isArray(S.flags.christmasSems)) S.flags.christmasSems = [];
    if (!Array.isArray(S.flags.bdaySems)) S.flags.bdaySems = [];
    if (!S.flags.loveMilestones || typeof S.flags.loveMilestones !== 'object') S.flags.loveMilestones = {};
    // 日常选项：旧存档没有这两个字段，补默认值。
    if (!S.flags.dailyMilestones || typeof S.flags.dailyMilestones !== 'object') S.flags.dailyMilestones = {};
    if (typeof S.flags.schoolLore !== 'number') S.flags.schoolLore = 0;
    if (typeof S.flags.dayPass !== 'boolean') S.flags.dayPass = false;
    if (typeof S.dailyIdx !== 'number' || !isFinite(S.dailyIdx) || S.dailyIdx < 0) S.dailyIdx = 0;
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
    const myId = netPlayerId();
    const rows = list.map((e, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
      const mine = e.id === myId ? ' style="background:rgba(240,160,48,.14);border-radius:10px"' : '';
      const sub = [e.ending, e.track].filter(Boolean).map(escapeHtml).join(' · ');
      return `<div class="record-row"${mine}>
        <span>${medal} ${escapeHtml(e.name)}<br><small style="color:#5a6a7a">${sub}</small></span>
        <b style="color:#f0a030">${Number(e.score) || 0}</b>
      </div>`;
    }).join('');
    openModal(`<h3>🏆 全校排行榜</h3>
      <p class="hint-line center">共 ${list.length} 条记录 · 在线 ${NET.count} 人</p>
      ${rows || '<p class="hint-line center">还没有人上榜，等你第一个。</p>'}
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
        track: (S && S.track) ? S.track + '类' : '',
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

/* ---------------- 启动 ---------------- */
(function boot() {
  show('#screen-menu');
  netBoot();
  tryRestore();
})();
