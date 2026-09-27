/* 名字输入的真实浏览器回归（需要本机 Chrome + puppeteer-core）
 *
 * 为什么必须有这个脚本：jsdom 造不出「真实键盘事件」和「输入法组词」，
 * 前两轮就是因为只靠 jsdom 回归 + 直接写 value 的假复现，才一直没抓到根因。
 * 这里用 puppeteer-core 驱动真实 Chrome，走真实鼠标/触摸 + 真实按键：
 *   ① 从滑到底部的主菜单进设置页，名字栏必须在视口内且自动聚焦
 *   ② 输入法组词中的回车不能开局；组词确认后的回车才开局
 *   ③ 触摸点击后能正常打字；🎲 可用；留空开局自动取名
 *   ④ 被 iframe 内嵌（含 sandbox）时同样能打字
 *
 * 跑法：
 *   NODE_PATH=C:\Users\<你>\.workbuddy-ai\binaries\node\workspace\node_modules node test-name-input.js
 * 结果写到 test-name-input-result.txt。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');

const RESULT = path.join(__dirname, 'test-name-input-result.txt');
const out = [];
const flush = () => { try { fs.writeFileSync(RESULT, out.join('\r\n'), 'utf8'); } catch (e) {} };
const log = (s) => { out.push(s); flush(); };
const ok = (cond, msg) => { out.push(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); flush(); return Boolean(cond); };

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const PORT = 3497;
const LOCAL = `http://127.0.0.1:${PORT}/`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VIEW = { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

/* 导航不能只靠 page.goto：
   实测 Chrome 偶尔会把 DOMContentLoaded 的 CDP 生命周期事件丢掉，
   goto 就一路挂到超时——但它其实早就加载好了（页面能用、按钮能点）。
   所以超时不算失败，改用「等选择器出现」来判定，最多重试三次。 */
async function safeGoto(page, url, readySel) {
  let last = null;
  for (let i = 1; i <= 3; i++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 });
    } catch (e) {
      last = e;
      log(`  goto 第 ${i} 次超时（${e && e.message}），改用选择器判定`);
    }
    try {
      await page.waitForSelector(readySel, { timeout: 8000 });
      return;
    } catch (e) { last = e; }
    log(`  第 ${i} 次仍未就绪，重试`);
  }
  throw new Error('页面始终没就绪 ' + url + '：' + (last && last.message));
}

(async () => {
  let server = null;
  let browser = null;
  let fails = 0;
  // 每次都用一个全新的临时用户目录：上一次运行残留的 Chrome 进程会锁住旧目录，
  // 复用同一个 userDataDir 会让新 Chrome 起不来或行为异常（表现为导航莫名超时）。
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xxls-name-'));
  // 退出前一定要收干净：残留的 Chrome 会锁住用户目录，也会白占内存，
  // 上一次就是因为没关干净，下一次运行才出现莫名其妙的导航超时。
  const cleanup = async () => {
    try { if (browser) await browser.close(); } catch (e) {}
    try { if (server) server.kill(); } catch (e) {}
    try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (e) {}
  };
  try {
    const chromePath = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
    if (!chromePath) {
      log('跳过：本机找不到 Chrome / Edge，无法做真实浏览器回归');
      process.exit(0);
    }
    log(`浏览器：${chromePath}`);

    server = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
      cwd: __dirname, stdio: 'ignore', env: { ...process.env, PORT: String(PORT) },
    });
    let up = false;
    for (let i = 0; i < 40; i++) {
      try { const r = await fetch(`http://127.0.0.1:${PORT}/api/health`); if (r.ok) { up = true; break; } } catch (e) {}
      await sleep(250);
    }
    if (!up) throw new Error('本地服务器没起来');
    log('本地服务器就绪');

    browser = await puppeteer.launch({
      executablePath: chromePath, headless: 'new',
      userDataDir: profileDir,
      args: ['--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-gpu'],
    });
    log('Chrome 已启动');

    const errs = [];
    const page = await browser.newPage();
    await page.setViewport(VIEW);
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });

    await safeGoto(page, LOCAL, '#btn-to-setup');
    await sleep(1500);

    /* ---- ① 从滑到底部的菜单进设置页 ---- */
    log('');
    log('== ① 菜单滑到底部 → 进设置页 ==');
    const metrics = await page.evaluate(() => ({
      docH: document.documentElement.scrollHeight,
      innerH: window.innerHeight,
      maxScroll: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
    }));
    log(`菜单可滚动量 = ${JSON.stringify(metrics)}`);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await sleep(250);
    log(`点击前 scrollY = ${await page.evaluate(() => Math.round(window.scrollY))}`);

    const b1 = await (await page.$('#btn-to-setup')).boundingBox();
    if (b1) await page.touchscreen.tap(b1.x + b1.width / 2, b1.y + b1.height / 2);
    await sleep(500);

    const after = await page.evaluate(() => {
      const el = document.querySelector('#in-name');
      const r = el.getBoundingClientRect();
      return {
        scrollY: Math.round(window.scrollY),
        setupOpen: !document.querySelector('#screen-setup').classList.contains('hidden'),
        inputY: Math.round(r.y), inputH: Math.round(r.height),
        inViewport: r.y >= 0 && r.bottom <= window.innerHeight && r.height > 0,
        active: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null,
      };
    });
    log(`进设置页后 = ${JSON.stringify(after)}`);
    if (!ok(after.setupOpen, '点「开始高中」能进设置页')) fails++;
    if (!ok(after.scrollY === 0, `进设置页后滚动位置归零（实际 ${after.scrollY}）`)) fails++;
    if (!ok(after.inViewport, `名字输入框在视口内（y=${after.inputY}，视口高 ${VIEW.height}）`)) fails++;
    if (!ok(after.active === 'in-name', `进设置页自动聚焦名字栏（activeElement=${after.active}）`)) fails++;

    /* ---- ② 输入法组词 vs 直接回车 ---- */
    log('');
    log('== ② 输入法组词回车 vs 确认后回车 ==');
    const composing = await page.evaluate(() => {
      const el = document.querySelector('#in-name');
      el.focus();
      el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      el.value = 'xiao';
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
      return {
        stillOnSetup: !document.querySelector('#screen-setup').classList.contains('hidden'),
        semesterHidden: document.querySelector('#screen-semester').classList.contains('hidden'),
      };
    });
    if (!ok(composing.stillOnSetup && composing.semesterHidden, '组词中按回车不会提前开局（仍停在设置页）')) fails++;

    const flags = await page.evaluate(() => {
      const el = document.querySelector('#in-name');
      const hidden = () => document.querySelector('#screen-semester').classList.contains('hidden');
      el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, isComposing: true, bubbles: true, cancelable: true }));
      const a = hidden();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true, cancelable: true }));
      const b = hidden();
      return { isComposing: a, keyCode229: b };
    });
    if (!ok(flags.isComposing, 'isComposing=true 的回车被放行')) fails++;
    if (!ok(flags.keyCode229, 'keyCode=229 的回车被放行')) fails++;

    await page.evaluate(() => {
      const el = document.querySelector('#in-name');
      el.value = '林晚';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const hint = await page.$eval('#name-hint', (el) => el.textContent);
    if (!ok(hint.includes('林晚'), `打字时有实时反馈（提示：${hint}）`)) fails++;

    await page.evaluate(() => {
      document.querySelector('#in-name').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
    });
    await sleep(600);
    const started = await page.evaluate(() => ({
      reachedSemester: !document.querySelector('#screen-semester').classList.contains('hidden'),
      cfgName: (typeof CFG !== 'undefined' && CFG.name) || null,
    }));
    if (!ok(started.reachedSemester, '组词确认后的回车正常开局')) fails++;
    if (!ok(started.cfgName === '林晚', `开局带上输入的名字（CFG.name=${started.cfgName}）`)) fails++;

    /* ---- ③ 触摸打字 / 🎲 / 留空开局 ---- */
    log('');
    log('== ③ 触摸打字 · 🎲 · 留空开局 ==');
    // 诊断：重新导航前先确认服务器本身还活着（区分「服务器挂了」和「浏览器这边卡住」）
    const healthBefore = await Promise.race([
      fetch(`http://127.0.0.1:${PORT}/api/health`).then((r) => r.status).catch((e) => 'ERR ' + e.message),
      sleep(4000).then(() => 'TIMEOUT'),
    ]);
    log(`重新导航前 /api/health = ${healthBefore}`);
    // 重新加载回到干净的菜单（带破缓存参数，避免拿到旧页面）
    await safeGoto(page, LOCAL + '?cb=' + Date.now(), '#btn-to-setup');
    await sleep(900);
    await page.$eval('#btn-to-setup', (el) => el.click());
    await sleep(300);
    const ib = await (await page.$('#in-name')).boundingBox();
    await page.touchscreen.tap(ib.x + ib.width / 2, ib.y + ib.height / 2);
    await sleep(250);
    await page.keyboard.type('阿明', { delay: 60 });
    if (!ok((await page.$eval('#in-name', (el) => el.value)) === '阿明', '触摸点击后能正常打字')) fails++;

    await page.$eval('#in-name', (el) => { el.value = ''; });
    const rb = await (await page.$('#btn-random-name')).boundingBox();
    await page.touchscreen.tap(rb.x + rb.width / 2, rb.y + rb.height / 2);
    await sleep(250);
    const rnd = await page.$eval('#in-name', (el) => el.value);
    if (!ok(rnd.length > 0, `🎲 能一键取名（${rnd}）`)) fails++;

    await page.$eval('#in-name', (el) => { el.value = ''; });
    await page.$eval('#btn-begin', (el) => el.click());
    await sleep(600);
    const blank = await page.evaluate(() => ({
      reachedSemester: !document.querySelector('#screen-semester').classList.contains('hidden'),
      cfgName: (typeof CFG !== 'undefined' && CFG.name) || null,
    }));
    if (!ok(blank.reachedSemester && blank.cfgName, `留空开局自动取名（${blank.cfgName}）`)) fails++;

    /* ---- ④ 被 iframe 内嵌（含 sandbox） ---- */
    log('');
    log('== ④ iframe 内嵌（含 sandbox） ==');
    for (const [tag, attrs] of [['sameorigin', ''], ['sandbox', 'sandbox="allow-scripts"']]) {
      const hostPath = path.join(__dirname, 'public', `.tmp-name-host-${tag}.html`);
      fs.writeFileSync(hostPath, `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0">
<iframe ${attrs} src="${LOCAL}" style="width:100%;height:800px;border:0"></iframe>
</body></html>`, 'utf8');
      const p2 = await browser.newPage();
      await p2.setViewport(VIEW);
      await safeGoto(p2, `http://127.0.0.1:${PORT}/.tmp-name-host-${tag}.html`, 'iframe');
      await sleep(2200);
      // 注意：host 页面 URL 也以 LOCAL 开头，必须排除
      const frame = p2.frames().find((f) => f.url().startsWith(LOCAL) && !f.url().includes('.tmp-name-host-'));
      let val = null;
      if (frame) {
        await frame.evaluate(() => { const el = document.querySelector('#btn-to-setup'); if (el) el.scrollIntoView({ block: 'center' }); });
        await sleep(250);
        const fb = await (await frame.$('#btn-to-setup')).boundingBox();
        if (fb) await p2.touchscreen.tap(fb.x + fb.width / 2, fb.y + fb.height / 2);
        await sleep(450);
        await frame.evaluate(() => { const el = document.querySelector('#in-name'); if (el) el.scrollIntoView({ block: 'center' }); });
        await sleep(250);
        const fi = await (await frame.$('#in-name')).boundingBox();
        if (fi) {
          await p2.touchscreen.tap(fi.x + fi.width / 2, fi.y + fi.height / 2);
          await sleep(250);
          await p2.keyboard.type('iframe名', { delay: 50 });
          val = await frame.evaluate(() => document.querySelector('#in-name').value);
        }
      }
      if (!ok(val === 'iframe名', `${tag} iframe 里能打字（value=${JSON.stringify(val)}）`)) fails++;
      await p2.close();
      try { fs.unlinkSync(hostPath); } catch (e) {}
    }

    log('');
    log('errors = ' + JSON.stringify(errs));
    log('');
    log(fails === 0 ? '全部通过' : `失败 ${fails} 项`);

    await cleanup();
    process.exit(fails === 0 ? 0 : 1);
  } catch (err) {
    log('ERROR: ' + ((err && err.stack) || err));
    await cleanup();
    process.exit(1);
  }
})();
