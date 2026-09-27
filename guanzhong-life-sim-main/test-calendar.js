/* 真实校历回归（依赖 jsdom）
 *
 * 为什么需要它：游戏的时间线必须和真实世界对得上——
 *   高一上 2026 年 9 月入学 → 高考 2029 年 6 月 7—9 日，
 *   六个学期的月份严格是 [9,10,11,12,1] / [2,3,4,5,6]。
 * 老实现是拿总轮次硬映射 20 个月份标签，跟学期脱钩，导致高一下学期第一轮
 * 显示成「12月上旬」、高一上 1 月显示成 11 月……而所有节日和学校开放日
 * 都从这个函数取月份，所以全都跟着错。这个脚本就是防止它再退化。
 *
 * 跑法：
 *   NODE_PATH=C:\Users\<你>\.workbuddy-ai\binaries\node\workspace\node_modules node test-calendar.js
 * 结果写到 test-calendar-result.txt。
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = __dirname;
const RESULT = path.join(root, 'test-calendar-result.txt');
const out = [];
const log = (s) => { out.push(s); try { fs.writeFileSync(RESULT, out.join('\r\n'), 'utf8'); } catch (e) {} };
let fails = 0;
const ok = (c, m) => { log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };

const vc = new VirtualConsole();
const errs = [];
vc.on('jsdomError', (e) => errs.push('jsdom: ' + e.message));

const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8')
  .replace(/<link[^>]+href="style\.css"[^>]*>/i, () => '')
  .replace(/<script\s+src="game\.js"\s*><\/script>/i,
    () => '<script>\n' + fs.readFileSync(path.join(root, 'public', 'game.js'), 'utf8') + '\n</script>');

const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
const w = dom.window;
w.alert = () => {};
w.confirm = () => false;
w.fetch = () => Promise.reject(new Error('offline'));

// 上学期 9/10/11/12/1 月，下学期 2/3/4/5/6 月
const EXPECT = [[9, 10, 11, 12, 1], [2, 3, 4, 5, 6]];

try {
  /* ---- 一、三种轮制下的年月映射 ---- */
  for (const rounds of [90, 60, 30]) {
    log(`===== ${rounds} 轮制 =====`);
    w.eval(`CFG.rounds = ${rounds}; CFG.startYear = 2026;`);
    const rows = w.eval(`(() => {
      const per = Math.ceil(CFG.rounds / SEM_NAMES.length);
      const out = [];
      for (let r = 1; r <= CFG.rounds; r++) {
        const c = calendarOf(r);
        out.push({ r, sem: Math.min(5, Math.floor((r - 1) / per)), year: c.year, month: c.month, label: dateLabel(r) });
      }
      return out;
    })()`);

    for (let s = 0; s < 6; s++) {
      const ms = [...new Set(rows.filter((x) => x.sem === s).map((x) => x.month))];
      const want = EXPECT[s % 2];
      ok(JSON.stringify(ms) === JSON.stringify(want),
        `第 ${s + 1} 学期月份 = ${JSON.stringify(ms)}（期望 ${JSON.stringify(want)}）`);
    }

    const all = rows.map((x) => `${x.year}-${String(x.month).padStart(2, '0')}`);
    const uniq = [...new Set(all)];
    ok(uniq.length === 30, `共 ${uniq.length} 个真实年月（期望 30）`);
    ok(uniq[0] === '2026-09', `第一轮 = ${uniq[0]}（期望 2026-09）`);
    ok(uniq[29] === '2029-06', `最后一轮 = ${uniq[29]}（期望 2029-06）`);
    ok(all.every((v, i) => i === 0 || v >= all[i - 1]), '年月单调递增（不会倒流）');
    ok(rows[0].label === '2026年9月上旬' || rows[0].label === '2026年9月',
      `首轮标签 = ${rows[0].label}`);
    log(`  首轮 ${rows[0].label} · 末轮 ${rows[rows.length - 1].label}`);
    log('');
  }

  /* ---- 二、真实节日落点 ---- */
  log('===== 节日落点（2026 年 9 月入学）=====');
  w.eval('CFG.rounds = 90; CFG.startYear = 2026;');
  const festivals = w.eval(`(() => {
    S = { flags: {}, round: 1, semIdx: 0 };
    const out = [];
    for (let r = 1; r <= CFG.rounds; r++) {
      S.round = r;
      const c = calendarOf(r);
      const ev = buildRealHolidayEvent();
      if (ev) { out.push({ r, year: c.year, month: c.month, title: ev.title }); ev.onPick(); }
    }
    return out;
  })()`);
  festivals.forEach((f) => log(`  ${f.year}-${String(f.month).padStart(2, '0')}  第${String(f.r).padStart(2)}轮  ${f.title}`));

  // 一个月有 3 轮，节日只能触发一次 → 全程正好 18 条
  ok(festivals.length === 18, `全程触发 ${festivals.length} 条节日事件（期望 18：每月只触发一次）`);
  const months = festivals.map((f) => `${f.year}-${f.month}`);
  ok(new Set(months).size === months.length, '同一个年月不会重复触发');

  const titles = festivals.map((f) => f.title);
  ['🧧 春节', '🌕 中秋节', '🏮 国庆节', '🎊 元旦', '🌿 清明节', '🍃 端午节', '🧹 劳动节']
    .forEach((m) => ok(titles.includes(m), `节日出现：${m}`));
  ok(titles.some((t) => t.includes(' · ')), '同月撞两个节日会合并（2028-01 / 2028-05 / 2028-10）');

  const at = (y, m) => festivals.find((f) => f.year === y && f.month === m);
  ok(!!at(2026, 9), '2026 年 9 月中秋在 高一上');
  ok(!!at(2027, 2), '2027 年 2 月春节在 高一下');
  ok(!!at(2028, 1), '2028 年 1 月（元旦 + 春节 1/26）在 高二上');
  ok(!!at(2029, 6), '2029 年 6 月（高考月）有节日事件');
  ok(festivals.every((f) => f.month !== 7 && f.month !== 8), '不会出现 7/8 月（寒暑假不在校历内）');
  log('');

  /* ---- 三、高考日期与起始年 ---- */
  log('===== 高考与起始年 =====');
  w.eval('CFG.startYear = 2026;');
  ok(w.eval('gaokaoDateLabel()') === '2029 年 6 月 7—9 日',
    `2026 年入学 → 高考 ${w.eval('gaokaoDateLabel()')}（期望 2029 年 6 月 7—9 日）`);
  w.eval('CFG.startYear = 2027;');
  ok(w.eval('gaokaoDateLabel()') === '2030 年 6 月 7—9 日',
    `2027 年入学 → 高考 ${w.eval('gaokaoDateLabel()')}（期望 2030 年 6 月 7—9 日）`);
  w.eval('CFG.startYear = 2026;');
  log('');

  /* ---- 四、旧接口不能被打断 ---- */
  log('===== 兼容性 =====');
  const compat = w.eval(`(() => {
    const r = [];
    for (let i = 1; i <= 90; i += 7) {
      const p = phaseFor(i);
      r.push({ p, month: parseInt(p, 10) });
    }
    return r;
  })()`);
  ok(compat.every((x) => x.month >= 1 && x.month <= 12),
    'phaseFor() 仍能被 parseInt 取出月份（节日 / 开放日依赖它）');
  ok(compat.some((x) => x.p.startsWith('12月')), 'phaseFor() 仍以「12月」开头（开放日 startsWith 依赖它）');
  ok(errs.length === 0, `运行期间无脚本异常（${JSON.stringify(errs)}）`);
} catch (e) {
  log('ERROR: ' + ((e && e.stack) || e));
  fails++;
}

log('');
log(fails === 0 ? '全部通过' : `失败 ${fails} 项`);
try { fs.writeFileSync(RESULT, out.join('\r\n'), 'utf8'); } catch (e) {}
process.exit(fails === 0 ? 0 : 1);
