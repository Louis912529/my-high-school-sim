const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = __dirname;
let html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'public', 'game.js'), 'utf8');
html = html.replace('<link rel="stylesheet" href="style.css">', () => `<style>${css}</style>`).replace('<script src="game.js"></script>', () => `<script>${js}</script>`);
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('jsdom: ' + e.message));
const dom = new JSDOM(html, {
  url: 'http://localhost:3000/',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: vc,
});
const { window } = dom;
window.alert = (msg) => errors.push('alert: ' + msg);
window.confirm = () => false;
window.fetch = () => Promise.reject(new Error('offline')); 

function report(label) {
  return `${label}: ` + JSON.stringify({
    menu: !window.document.querySelector('#screen-menu').classList.contains('hidden'),
    setup: !window.document.querySelector('#screen-setup').classList.contains('hidden'),
    semester: !window.document.querySelector('#screen-semester').classList.contains('hidden'),
    game: !window.document.querySelector('#screen-game').classList.contains('hidden'),
    end: !window.document.querySelector('#screen-end').classList.contains('hidden'),
    btnSetup: !!window.document.querySelector('#btn-to-setup').onclick,
    btnBegin: !!window.document.querySelector('#btn-begin').onclick,
    btnDex: !!window.document.querySelector('#btn-dex').onclick,
    btnAuto: !!window.document.querySelector('#btn-auto').onclick,
    btnLb: !!window.document.querySelector('#btn-leaderboard').onclick,
  });
}

const out = [report('boot')];
window.document.querySelector('#btn-to-setup').click();
out.push(report('after-to-setup'));
const nameInput = window.document.querySelector('#in-name');
out.push('nameInput: ' + JSON.stringify({ type: nameInput.type, disabled: nameInput.disabled, readOnly: nameInput.readOnly, readOnlyAttr: nameInput.hasAttribute('readonly'), disabledAttr: nameInput.hasAttribute('disabled') }));

// 🎲 随机名字：完全不依赖键盘也能取名
const nameBeforeRandom = nameInput.value;
window.document.querySelector('#btn-random-name').click();
out.push('randomName: ' + JSON.stringify({
  before: nameBeforeRandom,
  after: nameInput.value,
  changed: nameInput.value !== nameBeforeRandom && nameInput.value.length > 0,
  hint: window.document.querySelector('#name-hint').textContent.slice(0, 24),
}));

nameInput.focus();
nameInput.value = '测试玩家';
nameInput.dispatchEvent(new window.Event('input', { bubbles: true }));
out.push('nameValue: ' + nameInput.value);

// 难度选择：默认困难 → 点炼狱，提示文案要跟着变，开局后学期栏要显示炼狱。
out.push('diffDefault: ' + window.document.querySelector('#diff-note').textContent);
const hellBtn = window.document.querySelector('#in-diff button[data-v="hell"]');
hellBtn.click();
out.push('diffAfterHell: ' + window.document.querySelector('#diff-note').textContent);
out.push('hellSelected: ' + hellBtn.classList.contains('selected'));
window.document.querySelector('#btn-begin').click();
out.push(report('after-begin'));
out.push('semSub: ' + window.document.querySelector('#sem-sub').textContent);
window.document.querySelector('#btn-sem-start').click();
out.push(report('after-sem-start'));
const act = window.document.querySelector('#action-area .choice-btn');
if (act) act.click();
out.push(report('after-main-choice'));
window.document.querySelector('#btn-auto').click();
out.push('autoText: ' + window.document.querySelector('#btn-auto').textContent);
window.document.querySelector('#btn-dex').click();
out.push('modalOpen: ' + !window.document.querySelector('#modal-mask').classList.contains('hidden'));
// 男玩家的图鉴：恋爱成就必须是女生篇那套（图鉴总数 21 = 3 + 5 + 13）
{
  const dexHtml = window.document.querySelector('#modal-box').innerHTML;
  out.push('boyDex: ' + JSON.stringify({
    counter: (dexHtml.match(/已解锁 \d+ \/ \d+/) || [''])[0],
    girlTotal: dexHtml.includes('已解锁 0 / 21') || /已解锁 \d+ \/ 21/.test(dexHtml),
    boyTotal: /已解锁 \d+ \/ 22/.test(dexHtml),
  }));
}
window.document.querySelector('#modal-mask').classList.add('hidden');
window.document.querySelector('#btn-leaderboard').click();
out.push('leaderboardModal: ' + !window.document.querySelector('#modal-mask').classList.contains('hidden'));
out.push('errors: ' + JSON.stringify(errors));

/* ---- 第二个场景：完全不打字，直接开局 ---- */
// 模拟「输入框打不出字」的环境：不 focus、不输入任何字符，直接点「开启三年人生」。
{
  const errs2 = [];
  const vc2 = new VirtualConsole();
  vc2.on('jsdomError', (e) => errs2.push('jsdom: ' + e.message));
  const dom2 = new JSDOM(html, { url: 'http://localhost:3000/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc2 });
  const w2 = dom2.window;
  w2.alert = (msg) => errs2.push('alert: ' + msg);
  w2.confirm = () => false;
  w2.fetch = () => Promise.reject(new Error('offline'));

  w2.document.querySelector('#btn-to-setup').click();
  const input2 = w2.document.querySelector('#in-name');
  const emptyBefore = input2.value;
  w2.document.querySelector('#btn-begin').click();
  out.push('blankNameRun: ' + JSON.stringify({
    beforeEmpty: emptyBefore === '',
    autoName: input2.value,
    autoAssigned: input2.value.length > 0,
    reachedSemester: !w2.document.querySelector('#screen-semester').classList.contains('hidden'),
    noAlert: errs2.filter((x) => x.startsWith('alert:')).length === 0,
    errors: errs2,
  }));
  errors.push(...errs2);
}

/* ---- 第三个场景：开局选「女」→ 男生攻略对象 ---- */
{
  const errs3 = [];
  const vc3 = new VirtualConsole();
  vc3.on('jsdomError', (e) => errs3.push('jsdom: ' + e.message));
  const dom3 = new JSDOM(html, { url: 'http://localhost:3000/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc3 });
  const w3 = dom3.window;
  w3.alert = (m) => errs3.push('alert: ' + m);
  w3.confirm = () => false;
  w3.fetch = () => Promise.reject(new Error('offline'));
  const d3 = w3.document;

  d3.querySelector('#btn-to-setup').click();
  const femaleBtn = d3.querySelector('#in-gender button[data-v="女"]');
  if (femaleBtn) femaleBtn.click();
  d3.querySelector('#in-name').value = '林晚';
  d3.querySelector('#btn-begin').click();
  d3.querySelector('#btn-sem-start').click();

  // 一路点第一个选项，把遇见事件和几段主线推出来
  let clicks3 = 0;
  for (let i = 0; i < 80; i++) {
    const btn = d3.querySelector('#action-area .choice-btn');
    if (btn) { btn.click(); clicks3++; continue; }
    const trackConfirm = d3.querySelector('#btn-track-confirm');
    if (trackConfirm && !d3.querySelector('#screen-track').classList.contains('hidden')) {
      const card = d3.querySelector('#in-track button[data-v="历史"]');
      if (card) card.click();
      trackConfirm.click();
      continue;
    }
    const sem = d3.querySelector('#btn-sem-start');
    if (sem && !d3.querySelector('#screen-semester').classList.contains('hidden')) { sem.click(); continue; }
    break;
  }

  const loveChip = d3.querySelector('#t-love');
  const genderSel = d3.querySelector('#in-gender .selected');
  const loveTitle = loveChip.title || '';
  const boyNameHit = /江野|陆昭|温叙|周迟/.test(loveTitle);
  const girlNameHit = /沈知白|林越|顾清和|陈念/.test(loveTitle);
  out.push('girlRoute: ' + JSON.stringify({
    genderSelected: genderSel ? genderSel.dataset.v : null,
    clicks: clicks3,
    loveChip: loveChip.textContent,
    loveTitle: loveTitle.split('\n')[0],
    boyNameHit,
    girlNameHit,
  }));

  // 女玩家的图鉴：恋爱成就必须是男生篇那套（图鉴总数 22 = 3 + 6 + 13）
  d3.querySelector('#btn-dex').click();
  const dexHtml3 = d3.querySelector('#modal-box').innerHTML;
  out.push('girlDex: ' + JSON.stringify({
    counter: (dexHtml3.match(/已解锁 \d+ \/ \d+/) || [''])[0],
    boyTotal: /已解锁 \d+ \/ 22/.test(dexHtml3),
    girlTotal: /已解锁 \d+ \/ 21/.test(dexHtml3),
    hasBoyFirst: dexHtml3.includes('第一个外号'),
    hasBoyCourt: dexHtml3.includes('看台最上面一排'),
    hasGirlFirst: dexHtml3.includes('初次心动'),
    hasGirlCoat: dexHtml3.includes('两颗扣子'),
  }));
  d3.querySelector('#modal-mask').classList.add('hidden');

  errors.push(...errs3);
}

/* ---- 第四个场景：开局选「男」→ 女生攻略对象（原线必须完全没变） ---- */
{
  const errs4 = [];
  const vc4 = new VirtualConsole();
  vc4.on('jsdomError', (e) => errs4.push('jsdom: ' + e.message));
  const dom4 = new JSDOM(html, { url: 'http://localhost:3000/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc4 });
  const w4 = dom4.window;
  w4.alert = (m) => errs4.push('alert: ' + m);
  w4.confirm = () => false;
  w4.fetch = () => Promise.reject(new Error('offline'));
  const d4 = w4.document;

  d4.querySelector('#btn-to-setup').click();
  d4.querySelector('#in-name').value = '林小明';
  d4.querySelector('#btn-begin').click();
  d4.querySelector('#btn-sem-start').click();

  let clicks4 = 0;
  for (let i = 0; i < 80; i++) {
    const btn = d4.querySelector('#action-area .choice-btn');
    if (btn) { btn.click(); clicks4++; continue; }
    const trackConfirm = d4.querySelector('#btn-track-confirm');
    if (trackConfirm && !d4.querySelector('#screen-track').classList.contains('hidden')) {
      const card = d4.querySelector('#in-track button[data-v="物理"]');
      if (card) card.click();
      trackConfirm.click();
      continue;
    }
    const sem = d4.querySelector('#btn-sem-start');
    if (sem && !d4.querySelector('#screen-semester').classList.contains('hidden')) { sem.click(); continue; }
    break;
  }

  const loveChip4 = d4.querySelector('#t-love');
  const loveTitle4 = loveChip4.title || '';
  out.push('boyRoute: ' + JSON.stringify({
    clicks: clicks4,
    loveChip: loveChip4.textContent,
    loveTitle: loveTitle4.split('\n')[0],
    girlNameHit: /沈知白|林越|顾清和|陈念/.test(loveTitle4),
    boyNameHit: /江野|陆昭|温叙|周迟/.test(loveTitle4),
  }));

  d4.querySelector('#btn-dex').click();
  const dexHtml4 = d4.querySelector('#modal-box').innerHTML;
  out.push('boyRouteDex: ' + JSON.stringify({
    counter: (dexHtml4.match(/已解锁 \d+ \/ \d+/) || [''])[0],
    girlTotal: /已解锁 \d+ \/ 21/.test(dexHtml4),
    boyTotal: /已解锁 \d+ \/ 22/.test(dexHtml4),
    hasGirlFirst: dexHtml4.includes('初次心动'),
    hasBoyFirst: dexHtml4.includes('第一个外号'),
  }));
  d4.querySelector('#modal-mask').classList.add('hidden');

  errors.push(...errs4);
}

/* ---- 第五个场景：日常选项（七个时间点 + 属性名显示成「学识」） ---- */
{
  const errs5 = [];
  const vc5 = new VirtualConsole();
  vc5.on('jsdomError', (e) => errs5.push('jsdom: ' + e.message));
  const dom5 = new JSDOM(html, { url: 'http://localhost:3000/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc5 });
  const w5 = dom5.window;
  w5.alert = (m) => errs5.push('alert: ' + m);
  w5.confirm = () => false;
  w5.fetch = () => Promise.reject(new Error('offline'));
  const d5 = w5.document;

  d5.querySelector('#btn-to-setup').click();
  d5.querySelector('#in-name').value = '周日常';
  d5.querySelector('#btn-begin').click();
  d5.querySelector('#btn-sem-start').click();

  const dailyKickers = new Set();
  let dailyRenders = 0, mainRenders = 0, studyPillHits = 0, clicks5 = 0;
  for (let i = 0; i < 140; i++) {
    const area = d5.querySelector('#action-area');
    const dailyMod = area.querySelector('.choice-module.daily-choice-module');
    if (dailyMod) {
      dailyRenders++;
      dailyKickers.add(dailyMod.querySelector('.module-kicker').textContent.trim());
      if (/fx-pill study">学识/.test(dailyMod.innerHTML)) studyPillHits++;
    }
    const mainMod = area.querySelector('.choice-module.current-choice-module');
    if (mainMod) mainRenders++;

    const btn = area.querySelector('.choice-btn');
    if (btn) { btn.click(); clicks5++; continue; }
    const trackConfirm = d5.querySelector('#btn-track-confirm');
    if (trackConfirm && !d5.querySelector('#screen-track').classList.contains('hidden')) {
      const card = d5.querySelector('#in-track button[data-v="历史"]');
      if (card) card.click();
      trackConfirm.click();
      continue;
    }
    const sem = d5.querySelector('#btn-sem-start');
    if (sem && !d5.querySelector('#screen-semester').classList.contains('hidden')) { sem.click(); continue; }
    break;
  }

  const logHtml = d5.querySelector('#log').innerHTML;
  out.push('dailyOptions: ' + JSON.stringify({
    clicks: clicks5,
    dailyRenders,
    mainRenders,
    kickers: [...dailyKickers],
    studyPillHits,
    dailyCardsInLog: (logHtml.match(/🕒 日常 ·/g) || []).length,
    cssRuleInlined: /\.choice-module\.daily-choice-module/.test(css),
  }));

  errors.push(...errs5);
}

/* ---- 第六个场景：名字输入的两个真实 bug 回归 ----
   ① 进设置页必须自动聚焦名字栏（否则手机上要用户自己找）；
   ② 输入法组词时的回车不能把玩家推进下一屏（否则名字「打不进去」）。 */
{
  const errs6 = [];
  const vc6 = new VirtualConsole();
  vc6.on('jsdomError', (e) => errs6.push('jsdom: ' + e.message));
  const dom6 = new JSDOM(html, { url: 'http://localhost:3000/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc6 });
  const w6 = dom6.window;
  w6.alert = (m) => errs6.push('alert: ' + m);
  w6.confirm = () => false;
  w6.fetch = () => Promise.reject(new Error('offline'));
  const d6 = w6.document;

  d6.querySelector('#btn-to-setup').click();
  const el = d6.querySelector('#in-name');
  out.push('nameFocus: ' + JSON.stringify({
    active: d6.activeElement ? (d6.activeElement.id || d6.activeElement.tagName) : null,
    autoFocused: d6.activeElement === el,
    hint: d6.querySelector('#name-hint').textContent.slice(0, 12),
  }));

  const semHidden = () => d6.querySelector('#screen-semester').classList.contains('hidden');
  const keyEnter = (extra) => el.dispatchEvent(new w6.KeyboardEvent('keydown', Object.assign({ key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }, extra || {})));

  // 组词中按回车 → 必须留在设置页
  el.dispatchEvent(new w6.CompositionEvent('compositionstart', { bubbles: true }));
  keyEnter();
  const blockedByComposition = semHidden();
  el.dispatchEvent(new w6.CompositionEvent('compositionend', { bubbles: true }));

  // 组词结束，但事件仍带 isComposing / keyCode 229 → 也必须留在设置页
  keyEnter({ isComposing: true });
  const blockedByIsComposing = semHidden();
  keyEnter({ keyCode: 229 });
  const blockedBy229 = semHidden();

  // 打字时提示要实时反馈
  el.value = '林晚';
  el.dispatchEvent(new w6.Event('input', { bubbles: true }));
  const hintEcho = d6.querySelector('#name-hint').textContent;

  // 真正确认后的回车 → 正常开局，并且带上名字
  keyEnter();
  // game.js 顶层的 `let CFG` 是「全局词法绑定」，不是 window 的属性，
  // 所以 w6.CFG 永远是 undefined，必须用 window.eval 在全局作用域里读。
  let cfgName6 = null;
  try { cfgName6 = w6.eval('typeof CFG !== "undefined" && CFG ? CFG.name : null'); } catch (e) { errs6.push('eval CFG: ' + e.message); }
  out.push('imeEnter: ' + JSON.stringify({
    blockedByComposition, blockedByIsComposing, blockedBy229,
    hintEcho,
    startedAfterComposition: !semHidden(),
    name: cfgName6,
  }));

  errors.push(...errs6);
}

/* ---- 第七个场景：真实校历（月份 / 学年 / 高考日期 / 节日落点） ----
   学期必须严格对齐真实校历：上学期 9/10/11/12/1 月，下学期 2/3/4/5/6 月；
   全程 30 个学术月、跨 3 个学年；节日按真实公历 / 农历日期触发。 */
{
  const errs7 = [];
  const vc7 = new VirtualConsole();
  vc7.on('jsdomError', (e) => errs7.push('jsdom: ' + e.message));
  const dom7 = new JSDOM(html, { url: 'http://localhost:3000/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc7 });
  const w7 = dom7.window;
  w7.alert = (m) => errs7.push('alert: ' + m);
  w7.confirm = () => false;
  w7.fetch = () => Promise.reject(new Error('offline'));
  const d7 = w7.document;

  d7.querySelector('#btn-to-setup').click();
  d7.querySelector('#in-name').value = '陈历';
  d7.querySelector('#btn-begin').click();

  // 学期开场页：学年 + 本学期真实起止月份
  const semSub7 = d7.querySelector('#sem-sub').textContent;
  const semStory7 = d7.querySelector('#sem-story').textContent;
  d7.querySelector('#btn-sem-start').click();

  // HUD 标题：高一上学期 · 2026年9月上旬
  const title7 = d7.querySelector('#t-title').textContent;
  const startY = w7.eval('startYear()');

  // 学术月 → 真实年月 的映射（直接问引擎，不靠人眼）
  const cal7 = w7.eval(`JSON.stringify({
    first: calendarOf(1),
    last: calendarOf(totalRounds()),
    months: Array.from({ length: totalRounds() }, (_, i) => calendarOf(i + 1).month),
    sems: [0,1,2,3,4,5].map((s) => {
      const per = Math.ceil(CFG.rounds / 6);
      return Array.from({ length: per }, (_, k) => calendarOf(s * per + k + 1).month);
    }),
    gaokao: gaokaoDateLabel(),
    schoolYear: schoolYearLabel(1),
    semRange: semesterRangeLabel(0),
  })`);

  // 跑一段，看节日事件有没有真的进事件流（2026 年 9 月中秋落在第 1 个月，必然早期出现）
  let clicks7 = 0;
  const festTitles = new Set();
  for (let i = 0; i < 200; i++) {
    // 节日卡的正文一定以「X 月 Y 日。」开头（剧情卡不会），拿这个当判据，
    // 免得被同样用了 🧹 的值日剧情卡混进来。
    d7.querySelectorAll('#log .event-card').forEach((card) => {
      const body = card.querySelector('.event-body');
      const title = card.querySelector('.event-title');
      if (!body || !title) return;
      if (/^\d{1,2} 月 \d{1,2} 日。/.test(body.textContent.trim())) festTitles.add(title.textContent.trim());
    });
    const btn = d7.querySelector('#action-area .choice-btn');
    if (btn) { btn.click(); clicks7++; continue; }
    const trackConfirm = d7.querySelector('#btn-track-confirm');
    if (trackConfirm && !d7.querySelector('#screen-track').classList.contains('hidden')) {
      const card = d7.querySelector('#in-track button[data-v="历史"]');
      if (card) card.click();
      trackConfirm.click();
      continue;
    }
    const sem = d7.querySelector('#btn-sem-start');
    if (sem && !d7.querySelector('#screen-semester').classList.contains('hidden')) { sem.click(); continue; }
    break;
  }

  out.push('calendar: ' + JSON.stringify({
    startYear: startY,
    hudTitle: title7,
    hudHasYear: /^高一上学期 · \d{4}年9月/.test(title7),
    semSub: semSub7,
    semSubHasSchoolYear: /—\d{4} 学年/.test(semSub7),
    semStoryHasRange: /📅 本学期：\d{4}年\d{1,2}月 — \d{4}年\d{1,2}月/.test(semStory7),
    engine: JSON.parse(cal7),
    clicks: clicks7,
    festivals: [...festTitles],
    errors: errs7,
  }));

  // 真断言：HUD 必须带年份、学期栏必须带学年、节日必须真的落进事件流。
  if (!/^高一上学期 · \d{4}年9月/.test(title7)) errs7.push('HUD 日期没有年份或不是从 9 月开始：' + title7);
  if (!/—\d{4} 学年/.test(semSub7)) errs7.push('学期栏没有显示学年：' + semSub7);
  if (festTitles.size === 0) errs7.push('跑了 ' + clicks7 + ' 次点击都没等到任何节日事件');

  errors.push(...errs7);
}

fs.writeFileSync(path.join(root, 'runtime-probe-result.txt'), out.join('\n'), 'utf8');
console.log(out.join('\n'));
process.exit(errors.length ? 1 : 0);
