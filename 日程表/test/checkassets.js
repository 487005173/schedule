/* 资源完整性检查：node test/checkassets.js */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

function read(p) { return fs.readFileSync(path.join(root, p), 'utf8'); }

const css = read('styles.css');
let open = 0, close = 0;
for (const ch of css) { if (ch === '{') open++; if (ch === '}') close++; }
console.log('styles.css: ' + css.length + ' 字节, 大括号 ' + open + ' 开 / ' + close + ' 闭 -> ' + (open === close ? '配对正常' : '❌ 不配对！'));
console.log('styles.css 是否含关键规则: .topbar=' + /\.topbar\s*\{/.test(css) + ' .card=' + /\.card\s*\{/.test(css) + ' .tabbar=' + /\.tabbar\s*\{/.test(css) + ' [hidden]=' + /\[hidden\]\s*\{/.test(css));

const html = read('index.html');
const head = html.split('</head>')[0];
const refs = [];
head.replace(/(?:href|src)="([^"]+)"/g, (m, u) => { refs.push(u); return m; });
html.replace(/<script src="([^"]+)"/g, (m, u) => { refs.push(u); return m; });
refs.forEach(u => {
  if (/^https?:/.test(u)) { console.log('外部资源（跳过检查）: ' + u); return; }
  const clean = u.split('?')[0];
  const exists = fs.existsSync(path.join(root, clean));
  console.log((exists ? '✓' : '❌') + ' ' + u);
});
const ver = (html.match(/\?v=(\d+)/g) || []);
console.log('版本参数 ?v= 出现 ' + ver.length + ' 处：' + (new Set(ver).size === 1 ? '一致 ' + ver[0] : '❌ 不一致 ' + ver.join(',')));
console.log('stylesheet 标签: ' + /<link[^>]+rel="stylesheet"[^>]+href="styles\.css\?v=\d+"/.test(html));
