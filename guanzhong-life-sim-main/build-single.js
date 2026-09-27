// 把 public/ 下的三件套打成单个自包含 HTML
const fs = require('fs');
const path = require('path');

const root = __dirname;
const pub = path.join(root, 'public');
const read = (p) => fs.readFileSync(p, 'utf8');

let html = read(path.join(pub, 'index.html'));
const css = read(path.join(pub, 'style.css'));
const js = read(path.join(pub, 'game.js'));

const checks = [];
checks.push(`原始 index.html：${html.length} 字符`);
checks.push(`style.css：${css.length} 字符`);
checks.push(`game.js：${js.length} 字符`);

// 内联前必须确认源码里没有 </script> 字面量，否则会把脚本提前截断
if (js.includes('</script>')) throw new Error('game.js 里出现了 </script> 字面量，不能直接内联');
if (css.includes('</style>')) throw new Error('style.css 里出现了 </style> 字面量，不能直接内联');

const linkTag = /<link\s+rel="stylesheet"\s+href="style\.css"\s*>/i;
const scriptTag = /<script\s+src="game\.js"\s*><\/script>/i;
if (!linkTag.test(html)) throw new Error('index.html 里找不到 style.css 的 link 标签');
if (!scriptTag.test(html)) throw new Error('index.html 里找不到 game.js 的 script 标签');

// 使用函数替换，避免 JS String.replace 把源码里的 $$ 当成替换语法折叠成单个 $。
// 这是单文件版按钮全部失效的根因：原始 game.js 的 $$ 查询函数被破坏，脚本在首行就因重复声明 $ 而停止执行。
html = html.replace(linkTag, () => `<style>\n${css}\n</style>`);
html = html.replace(scriptTag, () => `<script>\n${js}\n</script>`);

// 单文件里不应该再有外部引用
const leftovers = [
  /<link[^>]+href="(?!data:)[^"]+"/i,
  /<script[^>]+src=/i,
].filter((re) => re.test(html)).length;

const dst = path.join(root, 'xiangxian-life-sim.html');
fs.writeFileSync(dst, html, 'utf8');

const stat = fs.statSync(dst);
const out = [
  ...checks,
  `单文件：${stat.size} 字节`,
  `残留外部引用：${leftovers} 处（应为 0）`,
  `</style> 位置：第 ${html.slice(0, html.indexOf('</style>')).split('\n').length} 行`,
  `</script> 位置：第 ${html.slice(0, html.lastIndexOf('</script>')).split('\n').length} 行`,
  `总行数：${html.split('\n').length}`,
  leftovers === 0 ? '构建成功' : '构建有问题：仍有外部引用',
].join('\r\n');

fs.writeFileSync(path.join(root, 'build-single-result.txt'), out, 'utf8');
console.log(out);
process.exit(leftovers === 0 ? 0 : 1);
