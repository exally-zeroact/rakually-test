/* taxnote-ask.mjs — ★消費税の一言を「聞いてあげる」★（空欄に 打たせない）
 * ============================================================================
 * ★なぜ（2026-09-02・実物45枚を 機械で 読んだ）★
 *   ★45枚 全部に 消費税の一言が 在った★（うちの実物・16社）
 *     「消費税は10%と なっております。」35枚 ／「消費税は10%と します。」11枚
 *     （ENEOS 25.3 は 両方 在る＝1枚で 2通りの言い方が 混じる）
 *   ★紙は 前から 出せた（TH.taxNote）／設定にも 欄が 在った★。
 *   ★足りていなかったのは 1つだけ＝★空の欄に 打たせていた★（司さん 2026-08-28 ④の指摘）
 *   ⇒ ★候補を 札で 出して 押させる★（打ちたい人は そのまま 打てる）。
 *
 * ★ここで見る事（実際に 押す）★
 *   ① 札が 出る（★2通り＋出さない★）／★率は lib から 作る（画面に 直書き 0件）★
 *   ② 押すと ★欄に 入る★（打たなくてよい）
 *   ③ 押した物が ★紙に 出る★（本物の紙を 組んで 字で 数える）
 *   ④ 「出さない」で ★紙から 消える★
 *   ⑤ ★今 使っている文が 在れば それも 札で 出る★（前に決めた物を 探させない）
 *   ⑥ ★別ウィザードを 作っていない★（画面の数が 増えていない）／JSの落ち 0件
 *
 * 使い方: node seikyu/tests/taxnote-ask.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let JSDOM; try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('★jsdomが入っていません。この検証は飛ばせません（SKIPを緑と呼ばない）。npm install してください。'); process.exit(1); }

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m || 'false'); };

const rel = 'seikyu/index.html', file = path.join(ROOT, rel);
const html = fs.readFileSync(file, 'utf8');
const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''),
  { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' + rel });
const win = dom.window, doc = win.document;
win.fetch = () => Promise.reject(new Error('no net'));
win.scrollTo = () => {}; win.print = () => {};
win.URL.createObjectURL = () => 'blob:fake';
win.open = () => ({ document: { write() {}, close() {} }, focus() {}, print() {}, close() {} });
const errs = [];
win.addEventListener('error', (e) => errs.push('window.error: ' + (e.message || e)));
for (const m of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
  const src = m[1].split('?')[0];
  if (/^https?:/.test(src) || ['supa-config.js', 'auth.js', 'env-badge.js'].indexOf(src.split('/').pop()) >= 0) continue;
  const p = path.resolve(path.dirname(file), src);
  if (!fs.existsSync(p)) continue;
  const el = doc.createElement('script');
  el.textContent = fs.readFileSync(p, 'utf8');
  doc.body.appendChild(el);
}
await new Promise((r) => setTimeout(r, 500));
doc.getElementById('app').hidden = false;

const A = win.SeikyuApp, S = A._state;
const $ = (id) => doc.getElementById(id);
const TAX = win.SeikyuTax;
const PAPER = win.SeikyuPaper;
const TPL = win.SeikyuTemplates;

const topRate = (() => {
  const rs = (TAX.rates ? TAX.rates() : []) || [];
  return rs.length ? Math.max.apply(null, rs.map(Number)) : null;
})();

function reset(taxNote) {
  /* ★置き場所は 会社の「紙の書き方」の中（invoiceStyle）★
     ＝ここを 上の階に 置いて 測ると ★試験の方が 嘘をつく★（2026-09-02 実際に 1回 外した） */
  S.org = taxNote ? { invoiceStyle: { taxNote: taxNote } } : {};
  S.partners = []; S.list = []; S.cur = null;
  A._fillSettings();
}
const chips = () => Array.from(($('s-taxnote-ask') || { querySelectorAll: () => [] }).querySelectorAll('[data-taxnote]'));
const click = (el) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
/* ★紙に 本当に 出るか★＝本物の紙を 組んで 字を 探す */
function paperHas(text) {
  const lines = [{ name: 'エアコン取替', qty: '1', unit: '式', price: '15000', rate: topRate || 10 }];
  const t = TAX.compute({ lines, taxMode: 'exclusive', rounding: 'floor' });
  const built = PAPER.build({
    inv: { no: 'A-1', issue_ymd: '2026-09-02', kind: 'invoice', lines, totals: { grandTotal: t.grandTotal }, data: {} },
    tax: t,
    partner: { name: 'ENEOSグローブエナジー株式会社', honor: '御中' },
    org: { yago: '合同会社ZEROact', bank: '伊予銀行　今治支店　普通　4160657　ド）ゼロアクト' },
    template: TPL.getOrDefault('std1'),
    theme: { taxNote: String($('s-taxnote').value || '') },
  });
  const h = (typeof built === 'string') ? built : built.html;
  return h.indexOf(text) >= 0;
}

console.log('\n[taxnote-ask] 消費税の一言を「聞いてあげる」（実物45枚＝全部に 在った）');
const SCREENS0 = doc.querySelectorAll('.screen').length;

T('★① 札が 出る（2通り＋出さない）／率は lib から（画面に 直書き 0件）', () => {
  reset('');
  ok(chips().length >= 3, '★札が ' + chips().length + '個★（2通り＋出さない のはず）');
  const txt = chips().map((c) => c.textContent).join(' ');
  ok(topRate !== null, '★率が lib から 取れない★');
  ok(txt.indexOf(String(topRate)) >= 0, '★札に 今の率が 出ていない★：' + txt.slice(0, 60));
  /* ★画面のHTMLに 率を 直書きしていない★（法が変わった日に 取り残される） */
  const raw = fs.readFileSync(file, 'utf8');
  const hard = (raw.match(/消費税は\s*\d+\s*%/g) || []);
  ok(hard.length === 0, '★HTMLに 率を 直書きしている（' + hard.join('/') + '）★');
  console.log('     札 ' + chips().length + '個 ／ 率は lib から（' + topRate + '%）／HTMLの直書き 0件');
});

T('★② 押すと 欄に 入る（打たなくてよい）', () => {
  reset('');
  ok($('s-taxnote').value === '', '初めから 何か 入っている');
  const c = chips().filter((x) => /なっております/.test(x.textContent))[0];
  ok(c, '★「となっております」の札が 無い★');
  click(c);
  ok(/なっております/.test($('s-taxnote').value), '★押しても 欄に 入らない★：' + $('s-taxnote').value);
  console.log('     押した後の欄 … ' + $('s-taxnote').value);
});

T('★③ 押した物が 紙に 出る', () => {
  reset('');
  click(chips().filter((x) => /とします/.test(x.textContent))[0]);
  ok(paperHas($('s-taxnote').value), '★紙に 出ていない★：' + $('s-taxnote').value);
});

T('★④ 「出さない」で 紙から 消える', () => {
  reset('消費税は' + topRate + '%とします。');
  const off = chips().filter((x) => /出さない/.test(x.textContent))[0];
  ok(off, '★「出さない」の札が 無い★');
  click(off);
  ok($('s-taxnote').value === '', '★欄が 空に ならない★：' + $('s-taxnote').value);
  ok(!paperHas('消費税は'), '★紙から 消えていない★');
});

T('★⑤ 今 使っている文が 在れば それも 札で 出る（探させない）', () => {
  reset('当社は インボイス発行事業者です。');
  const txt = chips().map((c) => c.textContent).join(' ／ ');
  ok(/インボイス発行事業者/.test(txt), '★今の文が 札に 出ない★：' + txt.slice(0, 70));
  console.log('     ' + txt.slice(0, 70) + '…');
});

T('★⑥ 別ウィザードを 作っていない／JSの落ち 0件', () => {
  ok(doc.querySelectorAll('.screen').length === SCREENS0, '★画面が 増えた★');
  ok(!errs.length, errs.join(' / '));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
