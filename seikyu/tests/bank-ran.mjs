/* bank-ran.mjs — ★お振込先は 1口座＝1つの 欄／＋で 足せる★
 * =============================================================================
 * 司さん 2026-09-10
 *   「振込先を 今の 設定からだと ★どこで 改行など 分からん★から ちゃんとして
 *     それと ★2個 表示する時用で 追加ボタンで また 入力する★ようにしろ」
 *   「そもそも どこで 改行と やなしに ★字を 少し 小さくしても 長い振込先でも 1行で 収めれないか？★」
 *   →「★収まるなら 口座番号は 目立つようにして★」
 *
 * 見る物:
 *   ① 設定に ★1口座＝1つの 欄★が 出る（前は 1つの 大きな 欄）
 *   ② 「＋ 口座を足す」で ★欄が 増える★
 *   ③ ×で ★消せる★（1つしか 無い時は 消せない＝振込先が 全部 消えない）
 *   ④ 打った物が ★倉庫の 形（改行つなぎ）★に なる／★空の欄は しまわない★
 *   ⑤ 紙は ★1つの 欄＝1行★で 出す（勝手に 割らない）
 *   ⑥ ★口座番号は 目立つまま★（本文より 大きい）
 *   ⑦ 空振りしない（押す道が 本当に 在る）
 *   ⑧ ★口座が 2つなら 紙も 2行★（別々の 口座を つながない）
 *   ⑨ ★箱の 幅は いつも 同じ★（長い 振込先も 1行で 入る 幅を 既定に）
 *   ⑩ ★1口座を 分けて 打つ★（銀行名・支店・預金の種類・口座番号・口座名義）
 *      司さん 2026-09-10「銀行口座の 入れ方を ★分けて いれさせろ★／銀行名、支店、口座番号、名前」
 *   ⑪ ★前から 打ってある 1行を 分けて 読める★（全角の あきでも／読めない物は そのまま 見せる）
 *   ⑫ ★触っていない 行の 字は 1文字も 変えない★（全角の あきを 勝手に 直さない）
 *
 * 使い方: node seikyu/tests/bank-ran.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let JSDOM; try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('★jsdomが入っていません。この検証は飛ばせません（SKIPを緑と呼ばない）。npm install してください。'); process.exit(1); }

const SELF = process.argv.includes('--self-test');
let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m || 'false'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ' … 期待 ' + JSON.stringify(b) + ' / 実際 ' + JSON.stringify(a)); };
const NL = String.fromCharCode(10);

const rel = 'seikyu/index.html', file = path.join(ROOT, rel);
const html = fs.readFileSync(file, 'utf8');
const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''),
  { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' + rel });
const win = dom.window, doc = win.document;
win.fetch = () => Promise.reject(new Error('no net'));
win.scrollTo = () => {}; win.print = () => {};
win.URL.createObjectURL = () => 'blob:fake';
win.open = () => ({ document: { write() {}, close() {} }, focus() {}, print() {}, close() {} });
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
const PAPER = win.SeikyuPaper;
const $ = (id) => doc.getElementById(id);
/* ★1口座＝1つの 囲い★（中に 銀行名・支店・種類・口座番号・名義の 欄が 在る） */
const rans = () => [...doc.querySelectorAll('#s-bank-list [data-bank-row]')];
const ran = (i, k) => rans()[i] && rans()[i].querySelector('[data-bank-p="' + k + '"]');
const osu = (sel) => { const b = doc.querySelector(sel); ok(b, '押す物が無い: ' + sel);
  b.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); };
/* ★1行の 字を 分けて 打つ★＝人が 5つの 欄に 打つのと 同じ道を 通す
   （「銀行 支店 種類 番号 名義」の 形を そのまま 分ける） */
const utsu = (i, v) => {
  const row = rans()[i]; ok(row, (i + 1) + 'つ目の 囲いが 無い');
  const t = String(v).split(/\s+/).filter((x) => x);
  const bi = t.findIndex((x) => /^[0-9]{5,8}$/.test(x));
  ok(bi > 0, '★この 検査の 見本に 口座番号が 無い★: ' + v);
  const shu = ['普通', '当座', '貯蓄'].indexOf(t[bi - 1]) >= 0 ? t[bi - 1] : '';
  const mae = t.slice(0, shu ? bi - 1 : bi);
  const kumi = { ginko: mae.slice(0, -1).join(' '), shiten: mae[mae.length - 1] || '',
    shubetsu: shu, bango: t[bi], meigi: t.slice(bi + 1).join(' ') };
  Object.keys(kumi).forEach((k) => {
    const el = ran(i, k); ok(el, (i + 1) + 'つ目に 欄が 無い: ' + k);
    el.value = kumi[k];
    el.dispatchEvent(new win.Event('input', { bubbles: true }));
  });
};

S.org = { yago: '合同会社Rakunally', invoiceNo: 'T1234567890123',
  bank: '伊予銀行 今治支店 普通 1234567 ド）ラクナリー' };
S.partners = []; S.invoices = []; S.list = []; S.receipts = [];
S.store = {
  partners: { list: () => Promise.resolve([]) },
  invoices: { list: () => Promise.resolve([]), usedNos: () => Promise.resolve([]) },
  org: { save: (p) => Promise.resolve({ ok: true, data: Object.assign({}, S.org, p) }) },
};
A._bindForTest();
A._fillSettings();
/* ★倉庫の 字を 入れ替えて 描き直す★＝人が 設定を 開き直したのと 同じ道 */
const drawFor = (n) => A._drawBankRowsForTest(n);

console.log('\n[bank-ran] お振込先は 1口座＝1つの 欄／＋で 足せる' + (SELF ? '（自分ためし）' : ''));

if (SELF) {
  const app = fs.readFileSync(path.join(ROOT, 'seikyu', 'js', 'seikyu-app.js'), 'utf8');
  const lib = fs.readFileSync(path.join(ROOT, 'seikyu', 'lib', 'seikyu-paper.js'), 'utf8');
  const kowasu = [
    ['欄を 描かない', app, 'function drawBankRows(fuyasu) {'],
    ['足すボタンを 消す', app, "$('b-bank-add').onclick"],
    ['空の欄を しまう', app, 'function bankRowsWrite(list)'],
    ['紙が また 勝手に 割る', lib, '    return [t];'],
    ['口座番号を 目立たせない', lib, ".bank-no{font-size:13pt"],
    ['分けて 読むのを やめる', app, '  function bankParse(line) {'],
    ['分けた物の 突き合わせを やめる', app, "    if (bankJoin(out) !== tok.join(' ')) {"],
    ['触っていない 行も 組み立て直す', app, '  var bankMoto = [];'],
  ];
  kowasu.forEach(([na, src, a]) => ok(src.split(a).length === 2,
    '★壊す所が 1つ 見つからない★ ' + na + ' … ' + a));
  console.log('     壊す所 ' + kowasu.length + '箇所（本当に コードに 在る事を 見た）');
}

T('★① 設定に 1口座＝1つの 欄が 出る', () => {
  ok($('s-bank-list'), '★口座の 欄を 並べる 所が 無い★');
  eq(rans().length, 1, '口座の 数');
  eq(ran(0, 'ginko').value, '伊予銀行', '銀行名');
  eq(ran(0, 'shiten').value, '今治支店', '支店');
  eq(ran(0, 'shubetsu').value, '普通', '預金の種類');
  eq(ran(0, 'bango').value, '1234567', '口座番号');
  eq(ran(0, 'meigi').value, 'ド）ラクナリー', '口座名義');
  /* ★大きな 1枚の 欄は もう 見せない★＝どこで 割れるか 分からない元 */
  const h = $('s-bank');
  /* ★見えない 欄は type="hidden"★＝textarea の hidden だと
     字の色を 数える 道具（scripts/text-colors.mjs）が ★見える字として 数えて しまう★
     （2026-09-10 実測＝真っ黒の 字が 1つ 増えていた）。 */
  ok(h && h.tagName === 'INPUT' && h.type === 'hidden', '★大きな 欄が まだ 見えている★');
});

T('★⑦ 空振りしていない（押す道が 本当に 在る）', () => {
  ok($('b-bank-add'), '★「＋ 口座を足す」が 無い★');
  ok(html.indexOf('id="b-bank-add"') > 0, '★画面に ボタンが 無い★');
});

T('★② ＋で 欄が 増える（2つ目を 打てる）', () => {
  const mae = rans().length;
  osu('#b-bank-add');
  /* ★押す前と 比べる★＝「もともと 2つ 在った」で 素通りさせない
     （2026-09-10 わざと 壊しても 赤に ならなかった＝この検査の 穴だった） */
  eq(rans().length, mae + 1, '★＋を 押しても 口座が 増えていない★');
  utsu(1, '愛媛銀行 今治支店 当座 7654321 ド）ラクナリー');
  eq(rans().length, mae + 1, '打ったら 口座の 数が 変わった');
});

T('★④ 倉庫の 形は 改行つなぎ／空の欄は しまわない', () => {
  eq($('s-bank').value,
    '伊予銀行 今治支店 普通 1234567 ド）ラクナリー' + NL + '愛媛銀行 今治支店 当座 7654321 ド）ラクナリー',
    '★倉庫へ しまう 形が 違う★');
  osu('#b-bank-add');
  eq(rans().length, 3, '3つ目が 増えていない');
  /* ★3つ目を 空のまま、1つ目を 打ち直す★
     ＝「足す」だけでは しまう 所（bankRowsWrite）が 走らないので、
       ★空の 欄が 混ざるかを 見られない★（2026-09-10 実測で 踏んだ）。 */
  utsu(0, '伊予銀行 今治支店 普通 1234567 ド）ラクナリー');
  /* ★空の 欄を しまっていないか★＝行数だけで なく ★中身も 見る★
     （2026-09-10 わざと 空も しまうように 壊しても 赤に ならなかった＝穴だった。
       ★空を 落とさないと 末尾に 改行が 付く★ので そこも 見る） */
  const v = $('s-bank').value;
  eq(v.split(NL).length, 2, '★空の 欄まで しまっている★（紙に 空行が 出る）');
  ok(v.split(NL).every((x) => x.trim()), '★空の 行が 混ざっている★: ' + JSON.stringify(v));
  ok(v.slice(-1) !== NL, '★末尾に 改行が 残っている★＝紙に 空行が 出る');
});

T('★③ ×で 消せる（1つの時は 消せない）', () => {
  const kesu = () => [...doc.querySelectorAll('#s-bank-list [data-bank-d]')];
  ok(kesu().length >= 2, '★消す×が 無い★');
  kesu()[2].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  eq(rans().length, 2, '3つ目が 消えていない');
  kesu()[1].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  eq(rans().length, 1, '2つ目が 消えていない');
  eq(kesu().length, 0, '★1つしか 無いのに ×が 出ている★（振込先が 全部 消える）');
});

T('★⑩ 1口座を 分けて 打つ（銀行名・支店・種類・口座番号・名義）', () => {
  /* ★司さん 2026-09-10「銀行口座の 入れ方を 分けて いれさせろ」★
     ＝前は「サンプル銀行 サンプル支店 普通 1234567 カ）サンプル」を
       ★1つの 欄に 自分で 並べて 打つ★しか なかった。 */
  const iru = ['ginko', 'shiten', 'shubetsu', 'bango', 'meigi'];
  iru.forEach((k) => ok(ran(0, k), '★欄が 無い★: ' + k));
  eq(ran(0, 'shubetsu').tagName, 'SELECT', '★預金の種類は 選ばせる★（打ち間違いを 作らない）');
  eq(ran(0, 'bango').getAttribute('inputmode'), 'numeric', '★口座番号は 数の キーボード★');
  /* ★分けて 打った物が つながって 倉庫へ 行く★ */
  ['ginko', 'shiten', 'bango', 'meigi'].forEach((k, i) => {
    ran(0, k).value = ['サンプル銀行', 'サンプル支店', '1234567', 'カ）サンプル'][i];
  });
  ran(0, 'shubetsu').value = '普通';
  ran(0, 'meigi').dispatchEvent(new win.Event('input', { bubbles: true }));
  eq($('s-bank').value, 'サンプル銀行 サンプル支店 普通 1234567 カ）サンプル',
    '★分けて 打った物が 1行に なっていない★');
});

T('★⑪ 前から 打ってある 1行を 分けて 読める（読めない物は そのまま）', () => {
  /* ★全角の あき★でも 読める（司さんの 今の 設定が これ） */
  $('s-bank').value = '伊予銀行\u3000今治支店\u3000普通\u30004160657\u3000ド）ゴウ';
  drawFor(1);
  eq(ran(0, 'ginko').value, '伊予銀行', '全角の あきで 銀行名が 読めない');
  eq(ran(0, 'shiten').value, '今治支店', '全角の あきで 支店が 読めない');
  eq(ran(0, 'bango').value, '4160657', '全角の あきで 口座番号が 読めない');
  /* ★支店らしい 語が 無い物★（ゆうちょ）も 落とさない */
  $('s-bank').value = 'ゆうちょ銀行 〇一八店 普通 12345678 カ）ニホンソウゴウ';
  drawFor(1);
  eq(ran(0, 'ginko').value, 'ゆうちょ銀行', 'ゆうちょの 銀行名');
  eq(ran(0, 'shiten').value, '〇一八店', 'ゆうちょの 店');
  eq(ran(0, 'bango').value, '12345678', 'ゆうちょの 8桁');
  /* ★分けて 読めない 物は そのまま 見せる★＝字を 落とさない・勝手に 直さない */
  $('s-bank').value = 'ゆうちょ 記号12345 番号6789012';
  drawFor(1);
  ok(!ran(0, 'ginko'), '★読めないのに 分けた 欄を 出している★');
  const raw = ran(0, 'raw');
  ok(raw, '★そのままの 欄が 無い＝打った 字の 行き場が 無い★');
  eq(raw.value, 'ゆうちょ 記号12345 番号6789012', '★そのままの 字が 変わっている★');
});

T('★⑫ 触っていない 行の 字は 1文字も 変えない', () => {
  /* ★全角の あきを こちらの 都合で 半角に しない★
     ＝紙の 顔が 黙って 変わる（司さんが 打った 通りに 出す）。 */
  const moto = '伊予銀行\u3000今治支店\u3000普通\u30004160657\u3000ド）ゴウ';
  $('s-bank').value = moto;
  drawFor(1);
  osu('#b-bank-add');                       /* 2つ目を 足すだけ＝1つ目は 触らない */
  ran(1, 'ginko').value = 'サンプル銀行';
  ran(1, 'bango').value = '7654321';
  ran(1, 'bango').dispatchEvent(new win.Event('input', { bubbles: true }));
  eq($('s-bank').value.split(NL)[0], moto, '★触っていない 行の 字が 変わった★');
  /* ★触ったら 組み立て直す★ */
  ran(0, 'shiten').value = '波方支店';
  ran(0, 'shiten').dispatchEvent(new win.Event('input', { bubbles: true }));
  eq($('s-bank').value.split(NL)[0], '伊予銀行 波方支店 普通 4160657 ド）ゴウ',
    '★触った 行が 組み立て直されていない★');
});

T('★⑤ 紙は 1つの 欄＝1行（勝手に 割らない）', () => {
  const nagai = '青森県信用組合 十和田支店 普通 1234567 カ）トウホクソウゴウケンセツコウギョウ';
  eq(PAPER.bankLines(nagai).length, 1, '★長いだけで 勝手に 割っている★');
  eq(PAPER.bankLines(nagai)[0], nagai, '中身が 変わった');
  const futatsu = nagai + NL + '伊予銀行 今治支店 普通 1234567 ド）ラクナリー';
  eq(PAPER.bankLines(futatsu).length, 2, '★打った 改行で 割れていない★');
});

T('★⑧ 口座が 2つなら 紙も 2行（つながない）', () => {
  /* ★2026-09-10 司さん「なんで 2個 あるのに 改行してないんど／1行で まとめなや」★
     ＝控除の 様式だけ「振込先を 1行で 出す」を 持っていて、
       ★別々の 口座を くっつけて★ いた（1行で出す＝1つの口座を1行に、の 意味だった）。
     ★どの様式でも 口座は 1つ1行★を 見る。 */
  const NA = win.SeikyuTemplates.list().map((x) => x.id);
  const futatsu = 'サンプル銀行 サンプル支店 普通 1234567 カ）サンプル' + NL
    + 'テスト銀行 テスト支店 当座 7654321 カ）サンプル';
  ok(NA.length >= 2, '★様式が 少なすぎ＝この検査は 何も 見ていない★');
  NA.forEach((id) => {
    const tp = win.SeikyuTemplates.getOrDefault(id);
    const ln = [{ name: 'x', qty: '1', unit: '式', price: '1000', amount: '1000', rate: 10 }];
    const t = win.SeikyuTax.compute({ lines: ln, taxMode: 'exclusive', rounding: 'floor' });
    const h = PAPER.build({
      inv: { no: 'X', issue_ymd: '2026-09-10', kind: 'invoice', lines: ln,
        totals: { grandTotal: t.grandTotal }, data: {} },
      tax: t, partner: { name: 'A', honor: '御中' }, org: { yago: 'Z', bank: futatsu },
      template: tp, templateId: id, theme: tp.theme,
      cols: win.SeikyuCols.normalizeSpec(tp.cols), deduct: 0, deductLines: [],
    }).html;
    const i = String(h).indexOf('note-b note-bb');
    ok(i > 0, id + '：★振込先の 箱が 無い★');
    const naka = String(h).slice(i, String(h).indexOf('</div>', i));
    eq(naka.split('<br>').length - 1, 1,
      id + '：★2つの 口座が 1行に つながっている★');
  });
  console.log('     ' + NA.length + '様式とも 2口座＝2行');
});

T('★⑨ 箱の 幅は いつも 同じ（長い 振込先も 1行で 入る 幅）', () => {
  /* ★2026-09-10 司さん「考えれる 長い 振込先も 1行で 入れる 幅に
       ★背景のボックスを デフォルトに しとけ★」★
     ＝前は 中身なりで、短い 口座だと 箱が 小さく 会社ごとに 顔が 変わっていた。
     ★実測★ 世の中で いちばん長い 部類で 418px ⇒ 最低の 幅 112mm（≒423px）。 */
  const css = String(PAPER.css() || '');
  const i = css.indexOf('.note-b.note-bb');
  ok(i >= 0, '★振込先の 箱の 決まりが 無い★');
  const naka = css.slice(css.indexOf('{', i), css.indexOf('}', i));
  const m = /min-width:\s*([\d.]+)mm/.exec(naka);
  ok(m, '★箱の 最低の 幅が 決まっていない（中身なりに なる）★: ' + naka);
  const px = Number(m[1]) * 96 / 25.4;
  ok(px >= 415, '★最低の 幅が 足りない★ ' + m[1] + 'mm ＝ ' + Math.round(px) + 'px'
    + '（世の中で いちばん長い 例は 418px）');
  ok(/white-space:\s*nowrap/.test(naka), '★折り返す（1行に ならない）★: ' + naka);
  console.log('     最低の 幅 ' + m[1] + 'mm ＝ ' + Math.round(px) + 'px');
});

T('★⑥ 口座番号は 目立つまま（本文より 大きい）', () => {
  const css = String(PAPER.css() || '');
  const pt = (sel) => {
    const i = css.indexOf(sel);
    if (i < 0) return null;
    const naka = css.slice(css.indexOf('{', i), css.indexOf('}', i));
    const m = /font-size:\s*([\d.]+)pt/.exec(naka);
    return m ? Number(m[1]) : null;
  };
  const no = pt('.bank-no');
  const honbun = pt('.note-b.note-bb');
  ok(no, '★口座番号の 大きさが 読めない★');
  ok(honbun, '★振込先の 本文の 大きさが 読めない★');
  ok(no > honbun * 1.5,
    '★口座番号が 目立たない★ 番号' + no + 'pt / 本文' + honbun + 'pt');
  console.log('     口座番号 ' + no + 'pt ／ まわりの字 ' + honbun + 'pt');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
