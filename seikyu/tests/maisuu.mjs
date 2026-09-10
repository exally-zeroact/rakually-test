/* maisuu.mjs — ★2枚目・3枚目に 入った 紙★
 * =============================================================================
 * 司さん 2026-09-10「★なんで 1ページ目が 少ないやつがあるんど おかしかろが★」
 *
 * ★何が おかしかったか（実測 2026-09-10）★
 *   分け方が「★最後の紙に 枠ぶん 残し、残りを 途中の紙へ 均等に★」だったので、
 *   明細17本・最後の枠15本の 紙は ★1枚目に 2本しか 載らなかった★
 *   （1枚目 2行／2枚目 15行＝1枚目の 3分の2が 真っ白）。
 *   さらに ★途中の紙は 配った本数を そのまま 枠に していた★ので、
 *   表が 途中で 終わって ★下 4割が 白い★ままだった。
 *   ★MID_ROWS=30 も 古かった★＝実測 28行（29行で +29px）。
 *     30 を 使う道が 無かった（均等に 配ると 届かない）ので 誰も 気づかなかった。
 *
 * 見る物:
 *   ① ★どの 紙も 1枚ずつ A4に 収まる★（2枚組・3枚組・全様式）
 *   ② ★後ろの紙が 前の紙より 多くならない★（1枚目が スカスカに ならない）
 *   ③ ★途中の紙は 空の枠で 下まで 埋まっている★（表が 途中で 終わらない）
 *   ④ ★まとめの紙（明細0本）に 空の表や「このページの小計 0」を 出さない★
 *   ⑤ ★1行も 落ちていない★（黙って 切らない）
 *   ⑥ 空振りしない（本当に 2枚・3枚に なっている／様式を 全部 見ている）
 *
 * ★実ブラウザで 測る★＝紙の 高さは jsdom では 出ない。
 * 使い方: node seikyu/tests/maisuu.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { borrow, launch as pwLaunch } from '../../scripts/_borrow-playwright.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELF = process.argv.includes('--self-test');
let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m || 'false'); };

const req = async (f) => {
  const u = 'file://' + path.join(ROOT, 'seikyu', 'lib', f).split(path.sep).join('/');
  const m = await import(u); return m.default || m;
};
const PAPER = await req('seikyu-paper.js'), TPL = await req('seikyu-templates.js');
const TAX = await req('seikyu-tax.js'), COLS = await req('seikyu-cols.js');
const A4 = 1122.5;

const ch = await borrow('maisuu', 'chromium');
if (!ch) { console.log('🟡 ★未測定★ playwright を 借りられない（0件＝合格 とは 書かない）'); process.exit(2); }

const L = (i) => ({ name: 'エアコン取付工事 ' + (i + 1), qty: '1', unit: '式',
  price: '19000', amount: '19000', rate: 10, memo: '東予市 川本邸' });
const DED = [{ name: '弁当代', amount: '7310' }, { name: '健康診断代', amount: '10164' }];
const BANK = 'サンプル銀行 サンプル支店 普通 1234567 カ）サンプル\n'
  + 'テスト銀行 テスト支店 当座 7654321 カ）サンプル';

function tsukuru(id, n) {
  const ln = []; for (let i = 0; i < n; i++) ln.push(L(i));
  const t = TAX.compute({ lines: ln, taxMode: 'exclusive', rounding: 'floor' });
  const tp = TPL.getOrDefault(id);
  const dl = TPL.usesDeduction(id) ? DED : [];
  const d = dl.reduce((s, x) => s + Number(x.amount), 0);
  return PAPER.build({
    inv: { no: '202609-001', issue_ymd: '2026-09-10', kind: 'invoice', lines: ln,
      totals: { grandTotal: t.grandTotal }, data: { deductions: dl } },
    tax: t, partner: { name: '黒田空調', honor: '御中' },
    org: { yago: '合同会社Rakunally', addr: '愛媛県今治市1-2-3', tel: '0898-00-0000',
      invoiceNo: 'T1234567890123', bank: BANK },
    template: tp, templateId: id, theme: tp.theme,
    cols: COLS.normalizeSpec(tp.cols), deduct: d, deductLines: dl,
  });
}
/* ★何本で 何枚に なるかは 測って 決める★（本数を 焼き付けない） */
function honsuuFor(id, mai) {
  for (let n = 1; n <= 300; n++) if (tsukuru(id, n).pages >= mai) return n;
  return null;
}

const b = await pwLaunch('maisuu', ch, undefined, 'chromium');
const pg = await b.newPage({ viewport: { width: 794, height: 1123 } });
const list = TPL.list();
const mita = [];
for (const x of list) {
  for (const mai of [2, 3]) {
    const n = honsuuFor(x.id, mai);
    if (n === null) { mita.push({ id: x.id, mai, n: null }); continue; }
    const r = tsukuru(x.id, n);
    await pg.setContent(r.html, { waitUntil: 'load' });
    await pg.waitForTimeout(150);
    const m = await pg.evaluate(() => [...document.querySelectorAll('.sheet')].map((el) => {
      const t = el.textContent || '';
      const tb = el.querySelector('.items tbody');
      return { takasa: Math.round(el.scrollHeight),
        hyou: !!el.querySelector('.items'),
        gyo: tb ? tb.querySelectorAll('tr').length : 0,
        naka: tb ? tb.querySelectorAll('tr:not(.r-blank)').length : 0,
        shoukei0: /このページの小計[^0-9¥\-]*[¥]?0(?![0-9])/.test(t.replace(/\s+/g, '')),
        nashi: t.indexOf('明細がまだ1行もありません') >= 0 };
    }));
    /* ★1行も 落ちていない★＝刷った 字で 数える */
    const nokori = [];
    for (let i = 1; i <= n; i++) if (r.html.indexOf('エアコン取付工事 ' + i + '<') < 0) nokori.push(i);
    mita.push({ id: x.id, label: x.label, mai, n, pages: r.pages, sheets: m, ochita: nokori });
  }
}
await b.close();

console.log('\n[maisuu] 2枚目・3枚目に 入った 紙' + (SELF ? '（自分ためし）' : ''));
console.log('     A4 = ' + Math.round(A4) + 'px ／ 様式 ' + list.length + '種 × 2枚組・3枚組');

if (SELF) {
  const lib = fs.readFileSync(path.join(ROOT, 'seikyu', 'lib', 'seikyu-paper.js'), 'utf8');
  const kowasu = [
    ['前から 詰めるのを やめる', 'while (left > last) { var take = Math.min(mid, left); plan.push(take); left -= take; }'],
    ['途中の紙を 空の枠で 埋めない', '      return isLast ? frameRows : midRows;'],
    ['まとめの紙に 空の表を 出す', "          if (last && multi && !pageLines.length) return '' + deductBlock();"],
    ['途中の紙の 行数', '  var MID_ROWS = 28;'],
  ];
  kowasu.forEach(([na, a]) => ok(lib.split(a).length === 2, '★壊す所が 1つ 見つからない★ ' + na + ' … ' + a));
  console.log('     壊す所 ' + kowasu.length + '箇所（本当に コードに 在る事を 見た）');
}

T('★⑥ 空振りしていない（全様式が 本当に 2枚・3枚に なっている）', () => {
  ok(list.length >= 4, '★様式が 少なすぎ＝何も 見ていない★ ' + list.length);
  ok(mita.length === list.length * 2, '★見た 通りが 足りない★ ' + mita.length);
  mita.forEach((z) => {
    ok(z.n !== null, z.id + '：★' + z.mai + '枚に ならない★');
    ok(z.pages === z.mai, z.id + '：★' + z.mai + '枚の つもりが ' + z.pages + '枚★');
    ok(z.sheets.length === z.mai, z.id + '：★紙の 数が 合わない★ ' + z.sheets.length);
  });
  console.log('     ' + mita.map((z) => z.mai + '枚=' + z.n + '本').join(' ／ '));
});

T('★① どの 紙も 1枚ずつ A4に 収まる', () => {
  const dame = [];
  mita.forEach((z) => z.sheets.forEach((s, i) => {
    const over = s.takasa - Math.round(A4);
    if (over > 1) dame.push(z.label + ' ' + z.mai + '枚組の ' + (i + 1) + '枚目 +' + over + 'px');
  }));
  ok(dame.length === 0, '★はみ出している★: ' + dame.join(' ／ '));
  console.log('     ' + mita.reduce((a, z) => a + z.sheets.length, 0) + '枚 ぜんぶ 収まった');
});

T('★② 後ろの紙が 前の紙より 多くならない（1枚目が スカスカに ならない）', () => {
  const dame = [];
  mita.forEach((z) => {
    const naka = z.sheets.map((s) => s.naka);
    naka.forEach((v, i) => { if (i > 0 && v > naka[i - 1]) dame.push(z.label + ' ' + JSON.stringify(naka)); });
  });
  ok(dame.length === 0, '★1枚目より 後ろの紙の方が 多い★: ' + dame.join(' ／ '));
});

T('★③ 途中の紙は 空の枠で 下まで 埋まっている（表が 途中で 終わらない）', () => {
  const midRows = PAPER.MID_ROWS;
  ok(midRows > 0, '★途中の紙の 行数が 無い★');
  const dame = [];
  mita.forEach((z) => z.sheets.forEach((s, i) => {
    if (i === z.sheets.length - 1) return;                 // 最後の紙は 締めが 埋める
    if (s.gyo !== midRows) dame.push(z.label + ' ' + (i + 1) + '枚目 ' + s.gyo + '行（枠 ' + midRows + '）');
  }));
  ok(dame.length === 0, '★途中の紙の 枠が いっぱいでない★: ' + dame.join(' ／ '));
  console.log('     途中の紙の 枠 … ' + midRows + '行（実測で 決めた数）');
});

T('★④ まとめの紙に 空の表や「このページの小計 0」を 出さない', () => {
  const dame = [];
  mita.forEach((z) => {
    const s = z.sheets[z.sheets.length - 1];
    if (s.naka === 0 && s.hyou) dame.push(z.label + ' ' + z.mai + '枚組：★空の表が 出ている★');
    if (s.nashi) dame.push(z.label + ' ' + z.mai + '枚組：★「明細がまだ1行もありません」が 出ている★');
    if (s.naka === 0 && s.shoukei0) dame.push(z.label + ' ' + z.mai + '枚組：★「このページの小計 0」が 出ている★');
  });
  ok(dame.length === 0, dame.join(' ／ '));
  const matome = mita.filter((z) => z.sheets[z.sheets.length - 1].naka === 0).length;
  console.log('     まとめだけの 紙 … ' + matome + '通り（残りは 最後の紙にも 明細が 載る）');
});

T('★⑤ 1行も 落ちていない（黙って 切らない）', () => {
  const dame = mita.filter((z) => z.ochita && z.ochita.length)
    .map((z) => z.label + ' ' + z.mai + '枚組：' + z.ochita.join(','));
  ok(dame.length === 0, '★明細が 消えた★: ' + dame.join(' ／ '));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
