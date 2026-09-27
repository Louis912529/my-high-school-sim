// 恋爱线逻辑冒烟测试：从 game.js 抽出模块，用桩件跑一遍
const fs = require('fs');
const path = require('path');

const RESULT = path.join(__dirname, 'test-love-result.txt');
function dump(text) {
  try { fs.writeFileSync(RESULT, text, 'utf8'); } catch (e) {}
}
process.on('uncaughtException', (e) => { dump('CRASH: ' + (e && e.stack || e)); process.exit(1); });

const gamePath = path.join(__dirname, 'public', 'game.js');
const src = fs.readFileSync(gamePath, 'utf8').split(/\r?\n/);
// 模块区间：从「恋爱线 · 好感度五阶段」的注释框到「/* pickEvent done */」之前
const startIdx = src.findIndex((l) => l.includes('恋爱线 · 好感度五阶段')) - 1;
const endIdx = src.findIndex((l) => l.includes('/* pickEvent done */'));
if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) throw new Error('找不到恋爱模块边界');
const mod = src.slice(startIdx, endIdx).join('\n');

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const chance = (p) => Math.random() < p;

const CFG = { name: '林小明', gender: '男', rounds: 90, talent: '学霸胚子' };
const LOG = [];
const logEvent = (kind, title) => { LOG.push(`[${kind}] ${title}`); };
const journal = (l) => { LOG.push(`   ${l}`); };
const renderHud = () => {};
const netBroadcast = () => {};
function phaseFor(round) {
  const map = ['9月上旬', '10月上旬', '11月上旬', '12月上旬', '1月上旬', '2月上旬', '3月上旬', '4月上旬', '5月上旬', '6月上旬',
    '9月下旬', '10月下旬', '11月下旬', '12月下旬', '1月下旬', '2月下旬', '3月下旬', '4月下旬', '5月下旬', '6月下旬'];
  const t = (round - 1) / Math.max(1, CFG.rounds - 1);
  return map[Math.min(map.length - 1, Math.floor(t * map.length))];
}

const S = { round: 1, social: 50, flags: { loveMilestones: {} } };
S.love = null;

// 难度桩件：addAff 会按 DIFFICULTY.affMul 缩放好感增长，测试里可以临时改成炼狱档。
const DIFFICULTY = { key: 'hard', level: 1, label: '困难 +1', examInterval: 5, crisisRecovery: 6,
  rankOffset: 8, gaokaoPenalty: [10, 30], leaveChanceMul: 1, affMul: 1 };

const factory = new Function('S', 'CFG', 'clamp', 'pick', 'rnd', 'chance',
  'logEvent', 'journal', 'renderHud', 'phaseFor', 'netBroadcast', 'DIFFICULTY',
  mod + `
  return { AFF_STAGES, AFF_STAGES_BOY, LOVE_CHARS, BOY_CHARS, LOVE_STORY, LOVE_STORY_BOY,
           newLoveState, migrateLove, stageForAff, loveRoute, loveIsBoy, loveChars, loveChar,
           affStages, affStageAt, affJumpAt, affCoolText, affBreakText, loveFirstMilestone,
           addAff, scaleAff, buildLoveMeetEvent, buildLoveStoryEvent, buildLoveFestivalEvent,
           buildLoveCasualEvent, buildDateEvent, buildLoveChatEvent, buildPhoneMsgEvent,
           loveChatTable, loveMsgTable, dateSpots,
           loveCall, loveTa, lp, affStage };`);

const M = factory(S, CFG, clamp, pick, rnd, chance, logEvent, journal, renderHud, phaseFor, netBroadcast, DIFFICULTY);

const out = [];
const ok = (cond, msg) => out.push(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);

/* ---- 1. 阶段边界 ---- */
const bounds = [[0, 1], [20, 1], [21, 2], [45, 2], [46, 3], [70, 3], [71, 4], [90, 4], [91, 5], [100, 5]];
let bOk = true;
bounds.forEach(([aff, want]) => { if (M.stageForAff(aff) !== want) { bOk = false; out.push(`   aff=${aff} → ${M.stageForAff(aff)}，期望 ${want}`); } });
ok(bOk, '五阶段边界 0/20/21/45/46/70/71/90/91/100');

/* ---- 2. 遇见事件 ---- */
S.round = 1; S.love = M.newLoveState();
ok(M.buildLoveMeetEvent() === null, '第 1 轮不触发遇见');
S.round = 2;
const meet = M.buildLoveMeetEvent();
ok(meet && meet.t === 'choice' && meet.options.length === 4, '第 2 轮触发遇见，4 个候选人');

/* ---- 3. 选人 ---- */
meet.options[0].onPick();
ok(S.love.met === true && S.love.char === 'A' && S.love.name === '沈知白', `选定对象：${S.love.name}`);
ok(S.love.aff === 12 && S.love.stage === 1, `初始好感 ${S.love.aff} / 阶段 ${S.love.stage}`);
ok(typeof S.love.flags.bday === 'number' && S.love.flags.bday >= 3, `生日月份已生成：${S.love.flags.bday}`);

/* ---- 4. 主线阶梯 ---- */
const ladder = [[8, 'e01'], [25, 'e02'], [40, 'e03'], [55, 'e04'], [62, 'e05'], [72, 'e06'], [80, 'e07'], [85, 'e08'], [90, 'e09']];
let stepOk = true;
ladder.forEach(([min, id]) => {
  // 差一点：不应触发这一段
  S.love.aff = min - 1;
  const before = M.buildLoveStoryEvent();
  const beforeTitle = before ? before.intro.title : 'null';
  // 到达门槛：应触发
  S.love.aff = min;
  const ev = M.buildLoveStoryEvent();
  const evId = ev && ev.onResolve ? null : null;
  if (!ev || !ev.intro) { stepOk = false; out.push(`   好感 ${min} 未触发主线事件（拿到 ${beforeTitle}）`); return; }
  // 告白事件只有在成功时才标记 seen，所以要先把选项走完
  if (id === 'e09') ev.options[0].onPick();
  ev.onResolve();
  if (!S.love.seen[id]) { stepOk = false; out.push(`   好感 ${min} 触发后未标记 seen.${id}`); }
});
ok(stepOk, '九段主线按好感门槛逐级触发且只触发一次');

/* ---- 5. 未告白封顶 90 ---- */
S.love = M.newLoveState();
S.love.met = true; S.love.char = 'B'; S.love.name = '林越'; S.love.aff = 88; S.love.stage = 4;
M.addAff(20);
ok(S.love.aff === 90, `未告白时好感封顶在 ${S.love.aff}（应为 90）`);
ok(S.love.stage === 4 && S.love.active === false, '未告白时不会自动进入恋人阶段');

/* ---- 6. 告白成功 → 恋人 ---- */
S.love.aff = 90; S.love.stage = 4; S.love.confessed = false;
S.love.seen = { e01: true, e02: true, e03: true, e04: true, e05: true, e06: true, e07: true, e08: true };
const conf = M.buildLoveStoryEvent();
ok(conf && conf.intro.title === '💗 告白', `好感 90 触发告白：${conf && conf.intro.title}`);
conf.options[0].onPick();
conf.onResolve();
ok(S.love.confessed === true && S.love.stage === 5 && S.love.active === true, `告白成功后阶段 ${S.love.stage}，active=${S.love.active}`);
M.addAff(5);
ok(S.love.aff === 96, `告白后上限放开，好感 ${S.love.aff}`);

/* ---- 6b. 恋人状态不会因为一次负面事件被自动撤销 ---- */
M.addAff(-8);
ok(S.love.aff === 88 && S.love.stage === 4 && S.love.active === true,
  `恋人后好感跌到 ${S.love.aff}（阶段 ${S.love.stage}），active 仍为 ${S.love.active}`);

/* ---- 6c. 告白失败可以重试 ---- */
S.love = M.newLoveState();
S.love.met = true; S.love.char = 'D'; S.love.name = '陈念'; S.love.aff = 90; S.love.stage = 4;
S.love.seen = { e01: true, e02: true, e03: true, e04: true, e05: true, e06: true, e07: true, e08: true };
const conf2 = M.buildLoveStoryEvent();
conf2.options[2].onPick();   // 什么都没说，转身走了
conf2.onResolve();
ok(!S.love.seen.e09, '告白失败后不锁死剧情');
M.addAff(20);                 // 好感涨回 90
S.love.aff = 90;
ok(M.buildLoveStoryEvent() !== null, '好感回到 90 后可以再次告白');

/* ---- 7. 降级 ---- */
S.love.aff = 47; S.love.stage = 3; S.love.cold = 0;
M.addAff(-2); M.addAff(-2); M.addAff(-2);
ok(S.love.stage === 2, `好感掉到 ${S.love.aff} 后阶段回落到 ${S.love.stage}`);
ok(S.love.cold === 3, `连续冷落计数 ${S.love.cold}`);

/* ---- 8. 节日：情人节 / 圣诞 / 生日 ---- */
function roundForMonth(m) { for (let r = 1; r <= 90; r++) if (parseInt(phaseFor(r), 10) === m) return r; return null; }
S.love = M.newLoveState();
S.love.met = true; S.love.char = 'C'; S.love.name = '顾清和'; S.love.aff = 60; S.love.stage = 3;
S.love.flags = { bday: 4 };

const rFeb = roundForMonth(2);
S.round = rFeb; S.semIdx = 1;
const feb = M.buildLoveFestivalEvent();
ok(feb && feb.intro.title.includes('情人节'), `2 月（第 ${rFeb} 轮）触发情人节：${feb && feb.intro.title}`);
feb.options[0].onPick();
ok(S.flags.valentineSems.includes(1), '情人节同学期不重复触发');
ok(M.buildLoveFestivalEvent() === null, '同一学期内情人节只触发一次');

const rDec = roundForMonth(12);
S.round = rDec; S.semIdx = 2;
const dec = M.buildLoveFestivalEvent();
ok(dec && dec.intro.title.includes('圣诞'), `12 月（第 ${rDec} 轮）触发圣诞：${dec && dec.intro.title}`);

const rApr = roundForMonth(4);
S.round = rApr; S.semIdx = 3;
const bd = M.buildLoveFestivalEvent();
ok(bd && bd.intro.title.includes('生日'), `4 月（第 ${rApr} 轮，生日月）触发生日：${bd && bd.intro.title}`);

/* ---- 9. 约会 ---- */
let dateChoice = 0, dateText = 0;
for (let i = 0; i < 60; i++) {
  const d = M.buildDateEvent();
  if (d.t === 'choice') dateChoice++; else dateText++;
}
ok(dateChoice > 0 && dateText > 0, `约会事件两种形态都出现（成行 ${dateChoice} / 未成 ${dateText}）`);

/* ---- 10. 日常事件 ---- */
S.love.stage = 4; S.love.aff = 75;
let casual = 0;
for (let i = 0; i < 40; i++) if (M.buildLoveCasualEvent()) casual++;
ok(casual === 40, `日常事件 40/40 次可生成（实际 ${casual}）`);

/* ---- 11. 称呼演变 ---- */
// 文案包规定部分阶段文本相同（C 型「一直没变，但语气变了」、B/D 最后一档合并），
// 所以只要求：每种性格至少 4 种不同写法，且第一档与第五档不同。
CFG.name = '林小明';
let callOk = true;
const callLog = [];
Object.keys(M.LOVE_CHARS).forEach((k) => {
  S.love.char = k;
  const seq = [];
  for (let st = 1; st <= 5; st++) { S.love.stage = st; seq.push(M.loveCall()); }
  callLog.push(`${M.LOVE_CHARS[k].persona}：${seq.join(' → ')}`);
  const uniq = new Set(seq).size;
  // 文案包刻意让部分性格「称呼不变、语气变」（C 型最明显），所以只要求 ≥3 种且首尾不同
  if (uniq < 3) { callOk = false; callLog.push(`   ${k} 只有 ${uniq} 种写法`); }
  if (seq[0] === seq[4]) { callOk = false; callLog.push(`   ${k} 首尾相同`); }
});
ok(callOk, '四种性格的称呼演变都随阶段变化');
out.push(...callLog.map((l) => `      ${l}`));

/* ---- 12. 旧存档迁移 ---- */
const old = M.migrateLove({ active: true, stage: '恋爱中', points: 2, from: '开局' });
ok(old.met === true && old.aff === 91 && old.stage === 5 && old.active === true && old.confessed === true,
  `旧存档（恋爱中）迁移：aff=${old.aff} stage=${old.stage} met=${old.met} confessed=${old.confessed}`);
const old2 = M.migrateLove(null);
ok(old2.met === false && old2.aff === 0 && old2.stage === 1 && old2.gender === '女',
  `旧存档（无恋爱字段）迁移：met=${old2.met} aff=${old2.aff} gender=${old2.gender}`);

/* ---- 13. 性别与称呼 ---- */
CFG.gender = '女';
S.love.gender = '男';
ok(M.loveTa() === '他', '女性玩家遇到男性对象时用「他」');
CFG.gender = '男';
S.love.gender = '女';
ok(M.loveTa() === '她', '男性玩家遇到女性对象时用「她」');

/* ---- 14. 难度对好感推进的影响 ---- */
DIFFICULTY.affMul = 1;
ok(M.scaleAff(7) === 7, '困难档好感增长不打折');
ok(M.scaleAff(-5) === -5, '好感下降不受难度折扣影响');

DIFFICULTY.affMul = 0.7;
let affSum = 0;
for (let i = 0; i < 4000; i++) affSum += M.scaleAff(10);
const affAvg = affSum / 4000;
ok(Math.abs(affAvg - 7) < 0.25, `炼狱档 10 点好感实际折算 ${affAvg.toFixed(2)}（期望 ≈ 7）`);

let tinySum = 0;
for (let i = 0; i < 4000; i++) tinySum += M.scaleAff(1);
const tinyAvg = tinySum / 4000;
ok(tinyAvg > 0.6 && tinyAvg < 0.8, `炼狱档 1 点好感折算 ${tinyAvg.toFixed(2)}（期望 ≈ 0.7，不会被取整吞掉）`);
DIFFICULTY.affMul = 1;

/* ---- 15. 男生线（开局选女 → 男生攻略对象） ---- */
CFG.gender = '女';
ok(M.loveRoute() === 'boy' && M.loveIsBoy() === true, '开局选女 → 走男生线');

S.round = 2; S.semIdx = 1; S.flags = { loveMilestones: {} };
S.love = M.newLoveState();
const meetBoy = M.buildLoveMeetEvent();
ok(meetBoy && meetBoy.options.length === 4, '男生线第 2 轮触发遇见，4 个候选人');
meetBoy.options[3].onPick();
ok(S.love.met === true && S.love.char === 'D' && S.love.name === '周迟', `男生线选定对象：${S.love.name}`);
ok(S.love.gender === '男', '男生线的对象性别为男');

let boyStepOk = true;
[[8, 'e01'], [25, 'e02'], [40, 'e03'], [55, 'e04'], [62, 'e05'], [72, 'e06'], [80, 'e07'], [85, 'e08'], [90, 'e09']].forEach(([min, id]) => {
  S.love.aff = min;
  const ev = M.buildLoveStoryEvent();
  if (!ev || !ev.intro) { boyStepOk = false; out.push(`   男生线好感 ${min} 未触发 ${id}`); return; }
  if (typeof ev.options[0].onPick === 'function') ev.options[0].onPick();
  ev.onResolve();
  if (!S.love.seen[id]) { boyStepOk = false; out.push(`   男生线 ${id} 触发后未标记 seen`); }
});
ok(boyStepOk, '男生线九段主线按好感门槛逐级触发且只触发一次');

ok(S.flags.loveMilestones['一把伞的左肩'] === true, '男生线共伞成就记为「一把伞的左肩」');
ok(S.flags.loveMilestones['看台最上面一排'] === true, '男生线比赛后成就记为「看台最上面一排」');
ok(!S.flags.loveMilestones['初次心动'], '男生线不会写入女生线的成就键');

// 男生线告白：好感 96 选「你挡路了」也能补救成功
S.love = M.newLoveState();
S.love.met = true; S.love.char = 'A'; S.love.name = '江野'; S.love.gender = '男';
S.love.aff = 96; S.love.stage = 4;
S.love.seen = { e01: true, e02: true, e03: true, e04: true, e05: true, e06: true, e07: true, e08: true };
const confBoy = M.buildLoveStoryEvent();
ok(confBoy && confBoy.intro.title === '💗 说清楚', `男生线好感 96 触发告白：${confBoy && confBoy.intro.title}`);
confBoy.options[1].onPick();
confBoy.onResolve();
ok(S.love.confessed === true && S.love.stage === 5 && S.love.active === true, '男生线 95+ 选「你挡路了」补救成功');
ok(S.love.seen.e09 === true, '男生线告白成功后标记 seen.e09');

// 男生线日常表
ok(Object.keys(M.loveChatTable()).includes('球场 · 课间'), '男生线闲聊库有「球场 · 课间」');
ok(!Object.keys(M.loveChatTable()).includes('食堂 · 午餐'), '男生线闲聊库不再有「食堂 · 午餐」');
ok((M.loveMsgTable()[5] || []).includes('到家了吗'), '男生线消息库阶段 5 文案正确');
ok(M.dateSpots().some((s) => s.name === '小饭馆'), '男生线约会地点包含「小饭馆」');

let boyCallOk = true;
const boyCallLog = [];
S.love.confessed = false; S.love.active = false;
Object.keys(M.BOY_CHARS).forEach((k) => {
  S.love.char = k;
  const seq = [];
  for (let st = 1; st <= 5; st++) { S.love.stage = st; seq.push(M.loveCall()); }
  boyCallLog.push(`${M.BOY_CHARS[k].persona}：${seq.join(' → ')}`);
  if (new Set(seq).size < 3) { boyCallOk = false; boyCallLog.push(`   ${k} 只有 ${new Set(seq).size} 种写法`); }
  if (seq[0] === seq[4]) { boyCallOk = false; boyCallLog.push(`   ${k} 首尾相同`); }
});
ok(boyCallOk, '男生线四种性格的称呼演变都随阶段变化');
out.push(...boyCallLog.map((l) => `      ${l}`));

// 校际比赛日：男生线 10 月触发一次
function roundForMonthN(m) { for (let r = 1; r <= 90; r++) if (parseInt(phaseFor(r), 10) === m) return r; return null; }
S.round = roundForMonthN(10); S.semIdx = 1;
S.love = M.newLoveState();
S.love.met = true; S.love.char = 'B'; S.love.name = '陆昭'; S.love.aff = 70; S.love.stage = 4;
S.love.flags = { bday: 5 };
const match = M.buildLoveFestivalEvent();
ok(match && match.intro.title.includes('校际比赛'), `男生线 10 月触发校际比赛日：${match && match.intro.title}`);
match.options[0].onPick();
ok(M.buildLoveFestivalEvent() === null, '男生线同一学期内校际比赛日只触发一次');

// 切回男玩家：原女生线完全不受影响
CFG.gender = '男';
S.round = roundForMonthN(10); S.semIdx = 1;
S.love = M.newLoveState();
S.love.met = true; S.love.char = 'B'; S.love.name = '林越'; S.love.aff = 70; S.love.stage = 4;
S.love.flags = { bday: 5 };
ok(M.buildLoveFestivalEvent() === null, '女生线 10 月不触发校际比赛日（原线未被影响）');
S.love.aff = 90;
const backGirl = M.buildLoveStoryEvent();
ok(backGirl && backGirl.intro.title === '📚 走廊上的作业本', `切回男玩家后主线回到女生线：${backGirl && backGirl.intro.title}`);
ok(M.loveRoute() === 'girl' && M.loveChar().name === '林越', '切回男玩家后路由与对象表都回到女生线');

/* ---- 输出 ---- */
const fails = out.filter((l) => l.startsWith('FAIL')).length;
const summary = [
  `模块行数：${mod.split('\n').length}`,
  `女生线角色（男玩家）：${Object.keys(M.LOVE_CHARS).map((k) => M.LOVE_CHARS[k].name).join(' / ')}`,
  `男生线角色（女玩家）：${Object.keys(M.BOY_CHARS).map((k) => M.BOY_CHARS[k].name).join(' / ')}`,
  `主线事件：女生线 ${M.LOVE_STORY.length} 段 / 男生线 ${M.LOVE_STORY_BOY.length} 段`,
  `阶段：${M.AFF_STAGES.map((s) => `${s.short}(${s.min}-${s.max})`).join(' ')}`,
  `男生线阶段：${M.AFF_STAGES_BOY.map((s) => `${s.tag}`).join(' ')}`,
  '',
  ...out,
  '',
  fails === 0 ? `全部通过（${out.length} 项）` : `失败 ${fails} / ${out.length} 项`,
].join('\r\n');

fs.writeFileSync(RESULT, summary, 'utf8');
console.log(summary);
process.exit(fails === 0 ? 0 : 1);
