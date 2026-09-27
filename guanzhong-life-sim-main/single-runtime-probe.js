const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = __dirname;
const html = fs.readFileSync(path.join(root, 'xiangxian-life-sim.html'), 'utf8');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('jsdom: ' + e.message));
const dom = new JSDOM(html, {
  url: 'file:///C:/xiangxian-life-sim.html',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: vc,
});
const { window } = dom;
window.alert = (msg) => errors.push('alert: ' + msg);
window.confirm = () => false;
window.fetch = () => Promise.reject(new Error('offline'));

const out = [];
const state = () => ({
  menu: !window.document.querySelector('#screen-menu').classList.contains('hidden'),
  setup: !window.document.querySelector('#screen-setup').classList.contains('hidden'),
  semester: !window.document.querySelector('#screen-semester').classList.contains('hidden'),
  game: !window.document.querySelector('#screen-game').classList.contains('hidden'),
  btnSetup: !!window.document.querySelector('#btn-to-setup').onclick,
  btnBegin: !!window.document.querySelector('#btn-begin').onclick,
  btnDex: !!window.document.querySelector('#btn-dex').onclick,
  btnAuto: !!window.document.querySelector('#btn-auto').onclick,
  btnLb: !!window.document.querySelector('#btn-game-leaderboard').onclick,
});
const assert = (ok, text) => out.push(`${ok ? 'PASS' : 'FAIL'} ${text}`);

let s = state();
assert(s.menu && s.btnDex && s.btnAuto && s.btnLb, '单文件脚本正常启动，底部与联机按钮已绑定');
window.document.querySelector('#btn-to-setup').click();
s = state();
assert(s.setup, '「开始高中」可进入开局设置');
const nameInput = window.document.querySelector('#in-name');
nameInput.focus();
nameInput.value = '单文件测试';
nameInput.dispatchEvent(new window.Event('input', { bubbles: true }));
assert(nameInput.type === 'text' && !nameInput.disabled && !nameInput.readOnly && nameInput.value === '单文件测试', '名字输入框可编辑并能接收文字');
assert(!nameInput.hasAttribute('readonly') && !nameInput.hasAttribute('disabled'), '输入框上没有残留的 readonly / disabled 属性');

// 🎲 随机名字：不依赖键盘也能取名
const nameBeforeRandom = nameInput.value;
window.document.querySelector('#btn-random-name').click();
assert(nameInput.value.length > 0 && nameInput.value !== nameBeforeRandom, `🎲 可随机取名（${nameBeforeRandom} → ${nameInput.value}）`);
nameInput.value = '单文件测试';

// 难度：默认困难，切到炼狱后提示文案与开局学期栏都要跟上。
assert(window.document.querySelector('#diff-note').textContent.includes('困难'), '默认难度为困难 +1');
const hellBtn = window.document.querySelector('#in-diff button[data-v="hell"]');
hellBtn.click();
assert(hellBtn.classList.contains('selected') && window.document.querySelector('#diff-note').textContent.includes('炼狱'), '可切换到炼狱 +2 并更新提示文案');
window.document.querySelector('#btn-begin').click();
s = state();
assert(s.semester, '「开启三年人生」可进入学期开场');
assert(window.document.querySelector('#sem-sub').textContent.includes('炼狱'), '开局学期栏显示炼狱难度');
window.document.querySelector('#btn-sem-start').click();
s = state();
assert(s.game, '「开始这个学期」可进入游戏');
window.document.querySelector('#btn-auto').click();
assert(window.document.querySelector('#btn-auto').textContent.includes('开'), '自动按钮可切换');
window.document.querySelector('#btn-dex').click();
assert(!window.document.querySelector('#modal-mask').classList.contains('hidden'), '图鉴按钮可打开弹窗');
window.document.querySelector('#modal-mask').classList.add('hidden');
window.document.querySelector('#btn-game-leaderboard').click();
assert(!window.document.querySelector('#modal-mask').classList.contains('hidden'), '排行榜按钮可打开弹窗');
assert(errors.length === 0, '运行过程中无脚本异常');

/* ---- 第二个场景：完全不打字，直接开局 ---- */
{
  const errs2 = [];
  const vc2 = new VirtualConsole();
  vc2.on('jsdomError', (e) => errs2.push('jsdom: ' + e.message));
  const dom2 = new JSDOM(html, { url: 'file:///C:/xiangxian-life-sim.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc2 });
  const w2 = dom2.window;
  w2.alert = (msg) => errs2.push('alert: ' + msg);
  w2.confirm = () => false;
  w2.fetch = () => Promise.reject(new Error('offline'));

  w2.document.querySelector('#btn-to-setup').click();
  const input2 = w2.document.querySelector('#in-name');
  w2.document.querySelector('#btn-begin').click();
  assert(input2.value.length > 0, `留空也能开局，自动取名「${input2.value}」`);
  assert(!w2.document.querySelector('#screen-semester').classList.contains('hidden'), '留空开局能正常进入学期开场');
  assert(errs2.filter((x) => x.startsWith('alert:')).length === 0, '留空开局不再弹窗拦截');
  errors.push(...errs2);
}

/* ---- 第三个场景：单文件里开局选「女」→ 男生攻略对象 ---- */
{
  const errs3 = [];
  const vc3 = new VirtualConsole();
  vc3.on('jsdomError', (e) => errs3.push('jsdom: ' + e.message));
  const dom3 = new JSDOM(html, { url: 'file:///C:/xiangxian-life-sim.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc3 });
  const w3 = dom3.window;
  w3.alert = (msg) => errs3.push('alert: ' + msg);
  w3.confirm = () => false;
  w3.fetch = () => Promise.reject(new Error('offline'));
  const d3 = w3.document;

  d3.querySelector('#btn-to-setup').click();
  const femaleBtn = d3.querySelector('#in-gender button[data-v="女"]');
  if (femaleBtn) femaleBtn.click();
  d3.querySelector('#in-name').value = '林晚';
  d3.querySelector('#btn-begin').click();
  assert(!d3.querySelector('#screen-semester').classList.contains('hidden'), '单文件：女玩家开局进入学期开场');
  d3.querySelector('#btn-sem-start').click();

  for (let i = 0; i < 80; i++) {
    const btn = d3.querySelector('#action-area .choice-btn');
    if (btn) { btn.click(); continue; }
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

  const loveTitle = d3.querySelector('#t-love').title || '';
  assert(/江野|陆昭|温叙|周迟/.test(loveTitle), `单文件：女玩家的攻略对象是男生（${loveTitle.split('\n')[0]}）`);
  assert(!/沈知白|林越|顾清和|陈念/.test(loveTitle), '单文件：女玩家不会拿到女生篇的攻略对象');

  d3.querySelector('#btn-dex').click();
  const dexHtml = d3.querySelector('#modal-box').innerHTML;
  const dexCounter = (dexHtml.match(/已解锁 \d+ \/ \d+/) || [''])[0];
  assert(/已解锁 \d+ \/ 22/.test(dexHtml), `单文件：女玩家的图鉴是男生篇那套（${dexCounter}）`);
  assert(!dexHtml.includes('初次心动') && !dexHtml.includes('两颗扣子'), '单文件：女玩家图鉴里不出现女生篇成就');
  assert(dexHtml.includes('第一个外号'), '单文件：女玩家图鉴里出现男生篇成就「第一个外号」');
  d3.querySelector('#modal-mask').classList.add('hidden');

  errors.push(...errs3);
}

/* ---- 第四个场景：单文件里的日常选项 ---- */
{
  const errs4 = [];
  const vc4 = new VirtualConsole();
  vc4.on('jsdomError', (e) => errs4.push('jsdom: ' + e.message));
  const dom4 = new JSDOM(html, { url: 'file:///C:/xiangxian-life-sim.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc4 });
  const w4 = dom4.window;
  w4.alert = (m) => errs4.push('alert: ' + m);
  w4.confirm = () => false;
  w4.fetch = () => Promise.reject(new Error('offline'));
  const d4 = w4.document;

  d4.querySelector('#btn-to-setup').click();
  d4.querySelector('#in-name').value = '单文件日常';
  d4.querySelector('#btn-begin').click();
  d4.querySelector('#btn-sem-start').click();

  const kickers = new Set();
  let dailyRenders = 0, mainRenders = 0, studyPill = 0;
  for (let i = 0; i < 120; i++) {
    const area = d4.querySelector('#action-area');
    const dailyMod = area.querySelector('.choice-module.daily-choice-module');
    if (dailyMod) {
      dailyRenders++;
      kickers.add(dailyMod.querySelector('.module-kicker').textContent.trim());
      if (/fx-pill study">学识/.test(dailyMod.innerHTML)) studyPill++;
    }
    if (area.querySelector('.choice-module.current-choice-module')) mainRenders++;

    const btn = area.querySelector('.choice-btn');
    if (btn) { btn.click(); continue; }
    const trackConfirm = d4.querySelector('#btn-track-confirm');
    if (trackConfirm && !d4.querySelector('#screen-track').classList.contains('hidden')) {
      const card = d4.querySelector('#in-track button[data-v="历史"]');
      if (card) card.click();
      trackConfirm.click();
      continue;
    }
    const sem = d4.querySelector('#btn-sem-start');
    if (sem && !d4.querySelector('#screen-semester').classList.contains('hidden')) { sem.click(); continue; }
    break;
  }

  const logHtml = d4.querySelector('#log').innerHTML;
  assert(dailyRenders > 0, `单文件：日常选项卡片正常渲染（${dailyRenders} 次）`);
  assert(mainRenders > 0, `单文件：本月安排三选一照旧（${mainRenders} 次）`);
  assert(kickers.has('日常选项'), `单文件：日常卡片标题为「日常选项」（实际 ${[...kickers].join(' / ')}）`);
  assert(studyPill > 0, `单文件：属性名显示为「学识」（${studyPill} 张卡命中）`);
  assert(/🕒 日常 ·/.test(logHtml), '单文件：事件流里出现「🕒 日常」标签');
  assert(errs4.length === 0, '单文件：日常选项运行无脚本异常');
  errors.push(...errs4);
}

/* ---- 第五个场景：单文件里名字输入的两个 bug 回归 ---- */
{
  const errs5 = [];
  const vc5 = new VirtualConsole();
  vc5.on('jsdomError', (e) => errs5.push('jsdom: ' + e.message));
  const dom5 = new JSDOM(html, { url: 'file:///C:/xiangxian-life-sim.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc5 });
  const w5 = dom5.window;
  w5.alert = (m) => errs5.push('alert: ' + m);
  w5.confirm = () => false;
  w5.fetch = () => Promise.reject(new Error('offline'));
  const d5 = w5.document;

  d5.querySelector('#btn-to-setup').click();
  const el5 = d5.querySelector('#in-name');
  assert(d5.activeElement === el5, '单文件：进设置页自动聚焦名字栏');

  const semHidden = () => d5.querySelector('#screen-semester').classList.contains('hidden');
  const keyEnter = (extra) => el5.dispatchEvent(new w5.KeyboardEvent('keydown', Object.assign({ key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }, extra || {})));

  el5.dispatchEvent(new w5.CompositionEvent('compositionstart', { bubbles: true }));
  keyEnter();
  const blockedComposing = semHidden();
  el5.dispatchEvent(new w5.CompositionEvent('compositionend', { bubbles: true }));
  keyEnter({ isComposing: true });
  const blockedIsComposing = semHidden();
  keyEnter({ keyCode: 229 });
  const blocked229 = semHidden();
  assert(blockedComposing && blockedIsComposing && blocked229, '单文件：输入法组词中的回车不会提前开局');

  el5.value = '林晚';
  el5.dispatchEvent(new w5.Event('input', { bubbles: true }));
  assert(d5.querySelector('#name-hint').textContent.includes('林晚'), '单文件：打字时提示实时反馈');

  keyEnter();
  assert(!semHidden(), '单文件：组词结束后的回车正常开局');
  // game.js 顶层的 `let CFG` 是「全局词法绑定」，不是 window 的属性，
  // 所以 w5.CFG 永远是 undefined，必须用 window.eval 在全局作用域里读。
  let cfgName5 = null;
  try { cfgName5 = w5.eval('typeof CFG !== "undefined" && CFG ? CFG.name : null'); } catch (e) { errs5.push('eval CFG: ' + e.message); }
  assert(cfgName5 === '林晚', `单文件：开局带上输入的名字（${cfgName5}）`);
  assert(errs5.length === 0, '单文件：名字输入回归无脚本异常');
  errors.push(...errs5);
}

/* ---- 第六个场景：单文件里的真实校历 ---- */
{
  const errs6 = [];
  const vc6 = new VirtualConsole();
  vc6.on('jsdomError', (e) => errs6.push('jsdom: ' + e.message));
  const dom6 = new JSDOM(html, { url: 'file:///C:/xiangxian-life-sim.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc6 });
  const w6 = dom6.window;
  w6.alert = (m) => errs6.push('alert: ' + m);
  w6.confirm = () => false;
  w6.fetch = () => Promise.reject(new Error('offline'));
  const d6 = w6.document;

  d6.querySelector('#btn-to-setup').click();
  d6.querySelector('#in-name').value = '单文件校历';
  d6.querySelector('#btn-begin').click();
  assert(/—\d{4} 学年/.test(d6.querySelector('#sem-sub').textContent), `单文件：学期栏显示真实学年（${d6.querySelector('#sem-sub').textContent.split(' · ')[0]}）`);
  assert(/📅 本学期：\d{4}年\d{1,2}月 — \d{4}年\d{1,2}月/.test(d6.querySelector('#sem-story').textContent), '单文件：学期开场显示真实起止月份');
  d6.querySelector('#btn-sem-start').click();

  const title6 = d6.querySelector('#t-title').textContent;
  assert(/^高一上学期 · \d{4}年9月/.test(title6), `单文件：HUD 日期从 9 月开始（${title6}）`);

  // 一个月会被摊成若干轮（90 轮制 3 轮 / 60 轮制 2 轮 / 30 轮制 1 轮），
  // 所以要把每学期覆盖到的月份去重后再比对。
  const sems6 = w6.eval(`JSON.stringify([0,1,2,3,4,5].map((s) => {
    const per = Math.ceil(CFG.rounds / 6);
    const ms = [];
    for (let k = 0; k < per; k++) { const m = calendarOf(s * per + k + 1).month; if (!ms.includes(m)) ms.push(m); }
    return ms;
  }))`);
  const bySem6 = JSON.parse(sems6);
  const seq6 = bySem6.map((x) => x.join(',')).join(' | ');
  assert(seq6 === '9,10,11,12,1 | 2,3,4,5,6 | 9,10,11,12,1 | 2,3,4,5,6 | 9,10,11,12,1 | 2,3,4,5,6', `单文件：六个学期严格是 9/10/11/12/1 与 2/3/4/5/6 月（实际 ${seq6}）`);
  const months6 = w6.eval('JSON.stringify(Array.from({ length: totalRounds() }, (_, i) => calendarOf(i + 1).month))');
  const arr6 = JSON.parse(months6);
  assert(!arr6.includes(7) && !arr6.includes(8), '单文件：校历里不出现 7/8 月（寒暑假）');
  assert(w6.eval('calendarOf(totalRounds()).month') === 6, '单文件：最后一轮落在 6 月（高考月）');
  assert(/6 月 7—9 日/.test(w6.eval('gaokaoDateLabel()')), `单文件：高考日期为 6 月 7—9 日（${w6.eval('gaokaoDateLabel()')}）`);
  assert(errs6.length === 0, '单文件：真实校历运行无脚本异常');
  errors.push(...errs6);
}

const result = [...out, '', errors.length ? `errors=${errors.join(' | ')}` : '全部通过'].join('\n');
fs.writeFileSync(path.join(root, 'single-runtime-probe-result.txt'), result, 'utf8');
console.log(result);
process.exit(errors.length || out.some((x) => x.startsWith('FAIL')) ? 1 : 0);
