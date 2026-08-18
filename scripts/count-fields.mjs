/* count-fields.mjs — ★人が埋める欄を数える★（着手前と着手後で「減った数」を出すための道具）
 *
 * なぜ要るか（司さん 2026-08-16「聞いてあげる。埋めさせない。」）:
 *   ★空欄を並べて人に埋めさせない★を、感想ではなく ★数★ で言うため。
 *   「減らした」と言うなら、★前と後を同じ道具で数える★（別の数え方で比べると嘘になる）。
 *
 * 数え方の決め（★毎回この決めで数える★）:
 *   ・数える物 … input（text/number/date/tel/email/checkbox/radio ほか）／select／textarea
 *   ・数えない物 … ボタン(button/submit/reset/image)／hidden／読むだけ(readonly・disabled)
 *   ・★畳んである物は開いてから数える★（閉じている物を数え落とさない）
 *   ・★JSが作る欄も数える★（HTMLに書いていない欄が本体の事がある）
 *   ・★body を1回だけ歩く★（画面ごとに歩くと同じ欄を2回数える）
 *
 * 使い方:
 *   node scripts/count-fields.mjs kyuyo/index.html                … 画面ぜんぶ
 *   node scripts/count-fields.mjs kyuyo/index.html --sel "#set-company"  … その中だけ
 *   node scripts/count-fields.mjs kyuyo/index.html --json
 * ※ ログインは通さない（偽のデータ層も入れない）＝★最初に開いた時に人が見る欄★を数える。
 *   データを入れた後の欄（明細の行など）は、それぞれのアプリのテストが数える。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const require_ = createRequire(pathToFileURL(path.join(ROOT, 'package.json')));

const entry = process.argv[2];
const selArg = process.argv.includes('--sel') ? process.argv[process.argv.indexOf('--sel') + 1] : null;
const asJson = process.argv.includes('--json');
/* ★数える前に押す物★（例: 従業員マスタは1人 足さないと欄が出ない）
   使い方: --press "#b-add-emp" --press ".m-open"  … 左から順に1回ずつ押す */
const presses = process.argv.reduce((a, v, i) => (v === '--press' ? a.concat([process.argv[i + 1]]) : a), []);
if (!entry) { console.error('使い方: node scripts/count-fields.mjs <画面.html> [--sel "#箱"] [--json]'); process.exit(2); }

let JSDOM;
try { ({ JSDOM } = require_('jsdom')); }
catch { console.error('★jsdom が要ります（npm install）。数えられないので止めます（0本と言わない）。'); process.exit(2); }

const abs = path.join(ROOT, entry);
if (!fs.existsSync(abs)) { console.error('その画面が無い: ' + entry); process.exit(2); }
const html = fs.readFileSync(abs, 'utf8');

const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' + entry,
});
const win = dom.window, doc = win.document;
win.fetch = () => Promise.reject(new Error('no net'));
win.scrollTo = () => {};
win.alert = () => {}; win.confirm = () => false; win.prompt = () => null;

/* ローカルの script だけ流す（ネットに出ない・ログインは通さない） */
let loaded = 0;
for (const m of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
  const src = m[1].split('?')[0];
  if (/^https?:/.test(src) || /supa-config|auth\.js/.test(src)) continue;
  const p = path.resolve(path.dirname(abs), src);
  if (!fs.existsSync(p)) continue;
  const el = doc.createElement('script');
  el.textContent = fs.readFileSync(p, 'utf8');
  doc.body.appendChild(el);
  loaded++;
}
await new Promise((r) => setTimeout(r, 120));

/* ★指定された物を先に押す★（1人 足す・開く など。押せなければ そう言う） */
const pressed = [];
for (const sel of presses) {
  const el = doc.querySelector(sel);
  if (!el) { console.error('★押す物が無い: ' + sel + '（数える前に止める）'); process.exit(2); }
  el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  pressed.push(sel);
  await new Promise((r) => setTimeout(r, 200));
}

/* ★畳んである物を開く★（details / 折りたたみのチップ）
   ★--closed を付けると 畳んだまま数える★＝「開いた時に すぐ目に入る欄」を測るため。
   （聞く形にすると「欄が減った」のではなく ★一度に見せる数が減る★。
     同じ道具で 両方 数えて、どちらの数字かを必ず書く） */
const keepClosed = process.argv.includes('--closed');
let opened = 0;
if (!keepClosed) for (const d of doc.querySelectorAll('details')) { if (!d.open) { d.open = true; opened++; } }
for (const c of (keepClosed ? [] : doc.querySelectorAll('[data-rule], [data-rule-toggle], .chip'))) {
  try { c.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); opened++; } catch { /* 押せない物は飛ばす */ }
}
await new Promise((r) => setTimeout(r, 200));

const NOT_FIELD = new Set(['button', 'submit', 'reset', 'image', 'hidden', 'file']);
const scope = selArg ? doc.querySelector(selArg) : doc.body;
if (!scope) { console.error('その箱が無い: ' + selArg); process.exit(2); }

/* ★body を1回だけ歩く★ */
const fields = Array.from(scope.querySelectorAll('input,select,textarea,[contenteditable="true"]')).filter((e) => {
  if (e.tagName === 'INPUT' && NOT_FIELD.has((e.type || 'text').toLowerCase())) return false;
  if (e.readOnly || e.disabled) return false;
  /* ★畳んだまま数える時は 畳みの中を数えない★（style で消してある物も外す） */
  if (keepClosed) {
    for (let n = e; n && n !== doc.body; n = n.parentElement) {
      if (n.tagName === 'DETAILS' && !n.open) return false;
      if (n.style && n.style.display === 'none') return false;
    }
  }
  return true;
});
const label = (e) => {
  const row = e.closest('.frow') || e.closest('.fld') || e.parentElement;
  const t = row && row.querySelector('.flabel, label');
  return ((t && t.textContent) || e.placeholder || e.id || e.className || e.tagName).replace(/\s+/g, ' ').trim().slice(0, 24);
};
const list = fields.map((e) => ({
  id: e.id || e.getAttribute('data-f') || e.getAttribute('data-cf') || null,
  tag: e.tagName, type: e.type || '', label: label(e), visible: !!e.offsetParent,
}));

const out = {
  entry, scope: selArg || 'body', loadedJs: loaded, opened, pressed, closed: keepClosed,
  fields: list.length,
  visible: list.filter((x) => x.visible).length,
  hidden: list.filter((x) => !x.visible).length,
  list,
};
if (asJson) { console.log(JSON.stringify(out, null, 1)); }
else {
  console.log('\n[count-fields] ' + entry + (selArg ? ' … ' + selArg : ''));
  console.log('  読んだJS ' + loaded + '本 ／ 開いた畳み ' + opened + '個' + (pressed.length ? ' ／ 先に押した物 ' + pressed.join(' , ') : ''));
  console.log('  ★人が埋める欄 ' + out.fields + '（見えている ' + out.visible + ' ／ 隠れている ' + out.hidden + '）★');
  list.forEach((x, i) => console.log('   ' + String(i + 1).padStart(3) + ' ' + (x.visible ? ' ' : '·') + ' ' + (x.id || '-') + '  ' + x.label));
}
if (!list.length) { console.error('\n★0欄＝数えられていない疑い★（画面が描けていないかもしれない）'); process.exit(1); }
