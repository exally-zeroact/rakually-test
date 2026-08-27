/* input-size.mjs — ★打つ欄の字が 16px 未満だと iPhone が勝手に拡大する★（本物のブラウザで測る）
 * =============================================================================
 * なぜ要るか（指示役が 2026-08-27 に 本番のスマホ幅で見つけた）:
 *   本番の請求書に ★13.33px の入力欄が4本★ 残っていた（#e-gensen / #s-reset / #s-carry / #s-pgensen）。
 *   ★4本とも 開いた直後は隠れている★ が、★開いた時に 客が触る★。
 *   iPhone は 16px 未満の欄に触ると ★画面が勝手に拡大して 戻らない★
 *   ＝★上に空白が出る／スクロールが変になる★（うちが何度も踏んだ所）。
 *
 * ★前の見張りが なぜ見落としたか★
 *   今まで在ったのは ★CSSの字（ソース）に font-size:16px と書いてあるか★ を見る物だった。
 *   ＝★書いていない欄（ブラウザの既定 13.33px のまま）は 1本も見ていない★＝★嘘の緑★。
 *   ⇒ ここでは ★描き終わった画面から 実際の px を読む★（getComputedStyle）。
 *
 * 数え方
 *   ・見る画面 … ★この repo に在る配信物の HTML を 全部★（決め打ちしない＝本番でも動く）
 *   ・見る物   … input / select / textarea を ★1つ残らず★（★隠れている物も数える★）
 *                 隠れていても ★開いた時に触る★ので、見えているかは 見ない。
 *   ・type=hidden だけは 触れないので 数えない
 *   ・★1本も見つからない画面は 赤★（＝測れていない。「0本」と言わない）
 *
 * 使い方:
 *   node scripts/input-size.mjs             … 全画面を数える（16px未満が1本でも在れば赤）
 *   node scripts/input-size.mjs --list      … 直す物を1行ずつ出す
 *   node scripts/input-size.mjs --self-test … わざと小さくして 捕まえられるか
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const WIDTH = 390;                 /* iPhone の幅（司さんの実機に合わせる） */
const HEIGHT = 844;
const MIN = 16;                    /* ★これ未満だと iOS が勝手に拡大する★ */
const TAP = 20;                    /* ★指で押す的の下限★（指示役の裁定 2026-08-27） */

function findChrome() {
  const c = [
    path.join(process.env['ProgramFiles'] || '', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] || '', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env['LOCALAPPDATA'] || '', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
    '/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium',
  ];
  for (const p of c) { try { if (p && fs.existsSync(p)) return p; } catch (_) { /* 次を見る */ } }
  return '';
}
const require_ = createRequire(pathToFileURL(path.join(ROOT, 'package.json')));
let JSDOM;
try { ({ JSDOM } = require_('jsdom')); }
catch { console.error('★jsdom が要ります（npm install）。動かして数えられないので止めます（0個と言わない）。'); process.exit(2); }

const CHROME = findChrome();
if (!CHROME) {
  console.error('★Chrome が見つかりません。測れないので止めます（0本と言わない）。');
  process.exit(2);
}

/* ★JSが作る物も 数える★（指示役 2026-08-27）
   ─────────────────────────────────────────────────────
   ★静的なHTMLだけ見る見張りは「JSが作る物」を一生 見ません★＝★何も見ていないのに緑★の型。
   実際に 2026-08-27 の時点で、静的なHTMLに在る入/切は ★請求書の4個だけ★で、
   ★給与の入/切は 1つも数えていませんでした★（JSが作るため）。
   ⇒ ここでは ★アプリを本当に動かして タブを押してから★ 測る。
   ★この repo に無い画面は「無い」と出す★（黙って飛ばさない）。 */
const BOOTS = [
  {
    file: 'kyuyo/index.html',
    tabs: ['scr-settings', 'scr-input', 'scr-list', 'scr-print', 'scr-furikomi'],
    seed: (win) => {
      const A = win.__PAYSLIP_TEST;
      if (!A) throw new Error('app.js が動いていない（測れていません）');
      const e = A.defEmp('山田 太郎');
      e.payType = '月給'; e.base = '260000';
      if (e.shikyu && e.shikyu[0]) e.shikyu[0].value = '260000';
      e.pref = 'ehime';
      const c = A.defCompany(); c.pref = 'ehime'; c.paydayDay = '25'; c.paydayRel = 'next';
      A.state.company = c; A.state.month = '2026-08'; A.state.employees = [e];
    },
  },
];

/* ★見る画面は この repo から拾う★＝決め打ちしない（本番は2枚・テスト線は5枚） */
export function screens(root) {
  const out = fs.readdirSync(root).filter((f) => /\.html$/i.test(f)).map((f) => f);
  for (const app of ['kyuyo', 'seikyu']) {
    const d = path.join(root, app);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) if (/\.html$/i.test(f)) out.push(app + '/' + f);
  }
  return out.sort();
}

const PROBE = `
  function name(e){return e.tagName.toLowerCase()+(e.id?'#'+e.id:'')
    +(e.className&&typeof e.className==='string'?'.'+e.className.trim().replace(/\\s+/g,'.'):'');}
  var rows=[];
  [].forEach.call(document.querySelectorAll('input,select,textarea'),function(el){
    if(el.type==='hidden')return;
    var px=parseFloat(getComputedStyle(el).fontSize)||0;
    var b=el.getBoundingClientRect();
    rows.push({n:name(el).slice(0,60),t:(el.type||el.tagName.toLowerCase()),
      px:Math.round(px*100)/100,
      w:Math.round(b.width*10)/10, h:Math.round(b.height*10)/10});
  });
  /* ★押す的★＝入/切・丸だけ見る（打つ欄は 横に長いので 高さで見る物ではない） */
  var taps=rows.filter(function(r){return r.t==='checkbox'||r.t==='radio';});
  /* ★0×0 は「小さい」ではなく「測れていない」★＝隠れたまま（開けていない）。
     ★言い分けないと 直しようのない赤を出し続ける★ので 分けて数える。 */
  function hiddenBy(e){for(var a=e;a&&a!==document.documentElement;a=a.parentElement){
    if(getComputedStyle(a).display==='none')return name(a).slice(0,40);}return '?';}
  taps.forEach(function(r){});
  var tapZero=[];
  [].forEach.call(document.querySelectorAll('input[type=checkbox],input[type=radio]'),function(el){
    var b=el.getBoundingClientRect();
    if(b.width*b.height===0)tapZero.push({n:name(el).slice(0,40),by:hiddenBy(el)});});
  return {w:window.innerWidth,all:rows.length,
    small:rows.filter(function(r){return r.px<${MIN};}),
    taps:taps.length,tapZero:tapZero,
    tapSmall:taps.filter(function(r){return r.w>0&&r.h>0&&(r.w<${TAP}||r.h<${TAP});})};
`;

/* ★畳んである物を 開いてから測るための指定★（1か所に持つ）
   ★ここに足す物は 見張りが名前で教えてくれる★＝「測れていない … 隠しているのは div.acc-body」
   （2026-08-27 実測：給与の入力の 非課税の入/切が acc-body の中で 0×0 だった）。 */
const OPEN_ALL = "<style>.screen{display:block!important}details>*{display:block!important}[hidden]{display:block!important}[style*=\"display:none\"]{display:block!important}.hide{display:block!important}.acc-body{display:block!important}</style>";

const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'inputsize-'));

/* ★script を外し・hidden を開き・CSS は本物を file:// で読む★（text-colors と同じ作り方） */
function pageOf(rel, tweak) {
  const file = path.join(ROOT, rel);
  let html = fs.readFileSync(file, 'utf8');
  html = html.replace(/<script[\s\S]*?<\/script>/g, '');
  html = html.replace(/<link\b[^>]*rel="stylesheet"[^>]*>/gi, (tag) => {
    const m = /href="([^"]+)"/.exec(tag);
    if (!m) return tag;
    const href = m[1].split('?')[0];
    if (/^https?:/.test(href)) return '';
    const abs = pathToFileURL(path.resolve(path.dirname(file), href)).href;
    return tag.replace(m[1], abs);
  });
  /* ★畳んである箱を 開いてから測る★＝押す的の大きさは 隠れていると 0×0 になって測れない。
     字の大きさは display:none でも読めるが、大きさは読めない（2026-08-27 実測）。 */
  html = html.replace('</head>', OPEN_ALL + '</head>');
  if (tweak) html = tweak(html);
  return html;
}

function measure(rel, tweak) { return measureHtml(rel, pageOf(rel, tweak)); }

function measureHtml(rel, html) {
  const base = rel.replace(/[^\w]+/g, '_');
  const page = path.join(OUT, base + '.html');
  const tail ='<script>window.addEventListener("load",function(){var r;try{r=JSON.stringify((function(){'
    + PROBE + '})());}catch(e){r=JSON.stringify({error:String(e)});}parent.postMessage(r,"*");});</scr' + 'ipt>';
  const cut = html.lastIndexOf('</body>');
  if (cut < 0) throw new Error(rel + ' … </body> が無い（測れていません）');
  fs.writeFileSync(page, html.slice(0, cut) + tail + html.slice(cut), 'utf8');
  const host = path.join(OUT, base + '.host.html');
  fs.writeFileSync(host, '<!doctype html><html><head><meta charset="utf-8">'
    + '<style>html,body{margin:0}iframe{border:0;display:block}</style></head><body>'
    + '<iframe width="' + WIDTH + '" height="' + HEIGHT + '" src="' + path.basename(page) + '"></iframe>'
    + '<script>window.addEventListener("message",function(e){document.title=e.data;});</scr' + 'ipt></body></html>', 'utf8');
  const out = execFileSync(CHROME, ['--headless', '--disable-gpu', '--hide-scrollbars',
    '--window-size=1200,1000', '--virtual-time-budget=5000', '--dump-dom', pathToFileURL(host).href],
  { encoding: 'latin1', maxBuffer: 40 * 1024 * 1024, timeout: 90000 });
  const m = /<title>([^<]*)<\/title>/.exec(out);
  if (!m || !m[1]) throw new Error(rel + ' … 枠の中から答えが返りません（★測れていません＝0本ではありません★）');
  const j = JSON.parse(Buffer.from(m[1], 'latin1').toString('utf8').replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  if (j.error) throw new Error(rel + ' を測れません: ' + j.error);
  if (j.w !== WIDTH) throw new Error(rel + ' … 頼んだ幅 ' + WIDTH + ' で測れていません（実測 ' + j.w + '）');
  return j;
}

/* ★アプリを本当に動かして タブを押した後の姿★ を返す（text-colors と同じ作り方） */
async function bootedHtml(b, tab, tweak) {
  const file = path.join(ROOT, b.file);
  const html = fs.readFileSync(file, 'utf8');
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' + b.file,
  });
  const win = dom.window, doc = win.document;
  win.fetch = () => Promise.reject(new Error('no net'));
  win.alert = () => {}; win.confirm = () => true; win.scrollTo = () => {}; win.print = () => {};
  win.URL.createObjectURL = () => 'blob:fake';
  win.open = () => ({ document: { write() {}, close() {} }, focus() {}, print() {}, close() {} });
  const drop = ['supa-config.js', 'auth.js', 'env-badge.js', 'rakually-login.js'];
  for (const m of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
    const src = m[1].split('?')[0];
    if (/^https?:/.test(src) || drop.indexOf(src.split('/').pop()) >= 0) continue;
    const p = path.resolve(path.dirname(file), src);
    if (!fs.existsSync(p)) continue;
    const el = doc.createElement('script');
    el.textContent = fs.readFileSync(p, 'utf8');
    doc.body.appendChild(el);
  }
  await new Promise((r) => setTimeout(r, 500));
  b.seed(win, doc);
  const btn = doc.querySelector('button[data-scr="' + tab + '"]');
  if (!btn) throw new Error(b.file + ' … タブが無い: ' + tab + '（測れていません）');
  btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 350));
  doc.querySelectorAll('script').forEach((s) => s.remove());
  doc.querySelectorAll('[hidden]').forEach((x) => x.removeAttribute('hidden'));
  doc.querySelectorAll('link[rel="stylesheet"]').forEach((l) => {
    const href = (l.getAttribute('href') || '').split('?')[0];
    if (/^https?:/.test(href)) { l.remove(); return; }
    l.setAttribute('href', pathToFileURL(path.resolve(path.dirname(file), href)).href);
  });
  let out = '<!doctype html>\n' + doc.documentElement.outerHTML;
  out = out.replace('</head>', OPEN_ALL + '</head>');
  if (tweak) out = tweak(out);
  return out;
}

async function runBooted(tweak) {
  const res = [];
  for (const b of BOOTS) {
    if (!fs.existsSync(path.join(ROOT, b.file))) {
      res.push({ rel: b.file + ' ▸（この repo には 無い）', all: 0, small: [], taps: 0, tapSmall: [], tapZero: [], absent: 1 });
      continue;
    }
    for (const tab of b.tabs) {
      const html = await bootedHtml(b, tab, tweak);
      const j = measureHtml(b.file + ' ▸ ' + tab, html);
      res.push({ rel: b.file + ' ▸ ' + tab, all: j.all, small: j.small, taps: j.taps, tapSmall: j.tapSmall, tapZero: j.tapZero || [] });
    }
  }
  /* ★動かして数えたのに 入/切が1つも出てこない＝測れていない★（0個と言わない） */
  const live = res.filter((r) => !r.absent);
  if (live.length && live.reduce((a, r) => a + r.taps, 0) === 0) {
    throw new Error('動かして数えたのに 入/切が1つも出てきません（★測れていません＝0個ではありません★）');
  }
  return res;
}

function run(tweak) {
  const list = screens(ROOT);
  const res = [];
  for (const rel of list) {
    const raw = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const hasInput = /<(input|select|textarea)\b/i.test(raw);
    const j = measure(rel, tweak);
    /* ★HTMLに欄が在るのに 1本も測れていない＝測れていない（0本と言わない）★ */
    if (hasInput && j.all === 0) throw new Error(rel + ' … 欄が在るのに 1本も測れていません');
    /* ★入/切が在るのに 大きさが0のまま＝測れていない★（畳みを開けていない） */
    const hasCheck = /type="(checkbox|radio)"/i.test(raw);
    if (hasCheck && j.taps === 0) throw new Error(rel + ' … 入/切が在るのに 1つも測れていません');
    res.push({ rel, all: j.all, small: j.small, taps: j.taps, tapSmall: j.tapSmall, tapZero: j.tapZero || [] });
  }
  return res;
}

if (process.argv.includes('--self-test')) {
  console.log('\n[input-size --self-test] わざと小さくして 捕まえられるか');
  let p = 0, f = 0;
  const S = (want, got, why) => {
    if (want === got) { p++; console.log('  ✓ ' + why); }
    else { f++; console.log('  ✗ ' + why + '（欲しい ' + JSON.stringify(want) + ' / 出た ' + JSON.stringify(got) + '）'); }
  };
  const base = run().concat(await runBooted());
  const now = base.reduce((a, r) => a + r.small.length, 0);
  const seen = base.reduce((a, r) => a + r.all, 0);
  S(0, now, '★今は 16px未満が 0本★');
  S(true, seen >= 10, '★数えた欄が 十分に在る（空振りしていない）★（' + seen + '本）');
  /* ★わざと1本だけ小さくする★＝捕まえられるか */
  const brk=(css)=>(html)=>html.replace('</head>','<style>'+css+'</style></head>');
  const broke = run(brk('input,select,textarea{font-size:11px !important}'));
  const n2 = broke.reduce((a, r) => a + r.small.length, 0);
  S(true, n2 >= 10, '★全部を11pxにしたら 捕まえる★（' + n2 + '本）');
  /* ★1本だけ★ 小さくした時も 捕まえるか（見落としが無いか） */
  const one = run((html) => html.replace('</head>',
    '<style>input[type="date"]{font-size:12px !important}</style></head>'));
  const n3 = one.reduce((a, r) => a + r.small.length, 0);
  S(true, n3 >= 1, '★1種類だけ小さくしても 捕まえる★（' + n3 + '本）');
  /* ★押す的★（指示役の裁定 2026-08-27） */
  const t0 = base.reduce((a, r) => a + r.tapSmall.length, 0);
  const tAll = base.reduce((a, r) => a + r.taps, 0);
  S(0, t0, '★今は ' + TAP + '×' + TAP + '未満の押す的が 0個★');
  S(true, tAll >= 1, '★押す的を 実際に数えている（空振りしていない）★（' + tAll + '個）');
  const tapBroke = run((html) => html.replace('</head>',
    '<style>input[type="checkbox"]{width:13px !important;height:13px !important;'
    + 'min-width:13px !important;min-height:13px !important}</style></head>'));
  const tapBroke2 = await runBooted(brk('input[type="checkbox"]{width:13px !important;height:13px !important;min-width:13px !important;min-height:13px !important}'));
  const t1 = tapBroke.concat(tapBroke2).reduce((a, r) => a + r.tapSmall.length, 0);
  S(true, t1 >= 1, '★押す的を13×13に戻したら 捕まえる★（' + t1 + '個）');
  fs.rmSync(OUT, { recursive: true, force: true });
  if (f) { console.error('\n★自己診断 ' + f + '件 失敗★'); process.exit(1); }
  console.log('\n自己診断 ' + p + '件 とも 正しい');
  process.exit(0);
}

const res = run().concat(await runBooted());
const small = res.reduce((a, r) => a + r.small.length, 0);
const all = res.reduce((a, r) => a + r.all, 0);
const taps = res.reduce((a, r) => a + r.taps, 0);
const tapSmall = res.reduce((a, r) => a + r.tapSmall.length, 0);
const tapZero = res.reduce((a, r) => a + (r.tapZero||[]).length, 0);
console.log('[input-size] 幅' + WIDTH + 'px・本物のChrome ／ 見た画面 ' + res.length
  + ' ／ 数えた欄 ' + all + '本 ／ ★' + MIN + 'px未満 ' + small + '本★'
  + ' ／ 押す的 ' + taps + '個 ／ ★' + TAP + '×' + TAP + '未満 ' + tapSmall + '個★'
  + ' ／ ★測れていない(0×0) ' + tapZero + '個★');
res.forEach((r) => {
  console.log('  ' + r.rel.padEnd(20) + ' 欄 ' + String(r.all).padStart(3) + '本'
    + ' ／ 押す的 ' + String(r.taps).padStart(2) + '個'
    + (r.small.length ? '  ★' + r.small.length + '本が小さい★' : '')
    + (r.tapSmall.length ? '  ★押す的 ' + r.tapSmall.length + '個が小さい★' : '')
    + ((r.tapZero||[]).length ? '  ★押す的 ' + r.tapZero.length + '個が 測れていない★' : ''));
  if (process.argv.includes('--list') || r.small.length) {
    r.small.forEach((s) => console.log('      ★' + s.px + 'px★ ' + s.t + '  ' + s.n));
  }
  ((r.tapZero)||[]).forEach((z) => console.log('      ★測れていない(0×0)★ ' + z.n + '  … 隠しているのは ' + z.by));
  if (process.argv.includes('--list') || r.tapSmall.length) {
    r.tapSmall.forEach((s) => console.log('      ★押す的 ' + s.w + '×' + s.h + '★ ' + s.t + '  ' + s.n));
  }
});
fs.rmSync(OUT, { recursive: true, force: true });
if (small || tapSmall || tapZero) {
  if (small) console.error('\n★' + small + '本★ 16px未満です。iPhoneが勝手に拡大して 戻りません。');
  if (tapSmall) console.error('★' + tapSmall + '個★ 押す的が ' + TAP + '×' + TAP + ' 未満です。指で押せません。');
  if (tapZero) console.error('★' + tapZero + '個★ 押す的が ★測れていません(0×0)★＝隠れたままです。「小さい」ではなく「測れていない」です。');
  console.error('直すまで進めません。');
  process.exit(1);
}
console.log('\nOK（16px未満の入力欄 0本 ／ ' + TAP + '×' + TAP + '未満の押す的 0個）');
