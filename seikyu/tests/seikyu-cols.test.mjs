/* seikyu-cols.test.mjs — ★どんな項目にも対応できる（列を自分で決められる）★
 *
 * 元ネタ = 代行請求アプリの実物（daikou-seikyu-test/invoice-pdf.js）。
 *   colWidths(items, widths) … 列幅を ★合計で紙幅に正規化★（invoice-pdf.js:294）
 *   colAlign(m, k)           … 金額=右 / 日付=中央 / 他=左（invoice-pdf.js:308）
 *   editColWidth             … 幅は ★24〜400 にクランプ★（daikou-seikyu.html:7155）
 * ここでは同じ契約を請求書アプリの言葉で持ち込み、実数で固定する。
 *
 * ここで止めたい事故:
 *   ① 列を足したら ★紙からはみ出す★（客に切れた紙が届く）
 *   ② 幅を 0 や 9999 にできて ★列が消える／紙が壊れる★
 *   ③ ★テンプレ（見た目）を替えたら金額が変わる★＝いちばんやってはいけない事
 *   ④ 列を足す・消すで ★合計が動く★（計算が見た目に依存している）
 *   ⑤ 列名が空・重複のまま紙を作る（どの列か分からない紙が出る）
 *   ⑥ 値が無い列を ★0 で埋める★（「取れなかった」を 0 にしない）
 *
 * 使い方: node seikyu/tests/seikyu-cols.test.mjs
 *         node seikyu/tests/seikyu-cols.test.mjs --self-test
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require_ = createRequire(path.join(ROOT, 'package.json'));
const COLS = require_(path.join(ROOT, 'seikyu/lib/seikyu-cols.js'));
const TPL = require_(path.join(ROOT, 'seikyu/lib/seikyu-templates.js'));
const PAPER = require_(path.join(ROOT, 'seikyu/lib/seikyu-paper.js'));
const TAX = require_(path.join(ROOT, 'seikyu/lib/seikyu-tax.js'));
const SR = require_(path.join(ROOT, 'kyuyo/lib/shouhizei-ritsu.js'));

const STD = Math.round(SR.hyojun * 10000) / 100;
const RED = Math.round(SR.keigen * 10000) / 100;

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const eq = (a, b, m) => { if (a !== b) throw new Error((m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); };
const ok = (v, m) => { if (!v) throw new Error(m || 'false'); };
const near = (a, b, tol, m) => { if (Math.abs(a - b) > tol) throw new Error((m ? m + ': ' : '') + a + ' と ' + b + ' の差が ' + tol + ' を超えた'); };

/* ★実物の1通（2026-08-10 にテスト線へ実際に発行した 202609-001）★
   これが1円でも動いたら赤。見た目を触る時の錨。 */
function realOne() {
  return [
    { name: '運転代行 9月分', qty: 42, unit: '件', price: 3200, rate: STD },
    { name: 'お弁当代（軽減）', amount: 1000, rate: RED },
    { name: '立替金（高速代）', amount: 500, rate: 0 },
  ];
}
const REAL_TOTAL = 149420;
const REAL_SUBTOTAL = 135900;
const REAL_TAX = 13520;

function invOf(over) {
  return Object.assign({
    doc_type: 'invoice', no: '202609-001', issue_ymd: '2026-09-30', due_ymd: '2026-10-31',
    tax_mode: 'exclusive', rounding: 'floor',
    data: { subject: '9月分 運転代行ご利用料金', memo: '振込手数料は貴社にてご負担ください。' },
    template_id: 'std1',
  }, over || {});
}
const PARTNER = { name: '藤原建設株式会社', keisho: '御中', addr: '愛媛県今治市喜田村5-6-7' };
const ORG = { yago: '株式会社ゼロアクト', invoiceNo: 'T1234567890123', bank: '伊予銀行' };

/* ── self-test：わざと壊して赤になるか ─────────────────────────────── */
if (process.argv.includes('--self-test')) {
  console.log('\n[seikyu-cols --self-test] わざと壊して赤になるか');
  let sp = 0, sf = 0;
  const S = (n, fn) => { try { fn(); sp++; console.log('  ✓ ' + n); } catch (e) { sf++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };

  /* 正規化しない（打った幅をそのまま使う）＝紙からはみ出す方の作り方 */
  const widthsRaw = (items, widths) => items.map((k) => Number((widths || {})[k]) || 80);

  S('① 正規化しない作り方は、紙幅を超える（本物は超えない）', () => {
    const items = ['日付', '行き先', '金額', '備考', '距離', '人数', '名前', '担当'];
    const widths = { 日付: 200, 行き先: 400, 金額: 300, 備考: 300, 距離: 200, 人数: 200, 名前: 200, 担当: 200 };
    const bad = widthsRaw(items, widths).reduce((a, b) => a + b, 0);
    ok(bad > COLS.PAPER_WIDTH, '作り物なのに紙に収まっている＝この検査が空振り');
    const good = COLS.widthsOf(items, widths).reduce((a, b) => a + b, 0);
    near(good, COLS.PAPER_WIDTH, 0.01, '本物が紙幅に収まっていない');
  });

  S('② クランプしない作り方は、幅0や9999を許す（本物は 24〜400）', () => {
    const naive = (n) => n;
    ok(naive(0) === 0 && naive(9999) === 9999, '作り物が壊れていない＝この検査が空振り');
    eq(COLS.clampWidth(0), COLS.MIN_W);
    eq(COLS.clampWidth(9999), COLS.MAX_W);
  });

  S('③ 「テンプレで金額を作る」作り方は、見た目で金額が動く（本物は動かない）', () => {
    // ★円未満が出る額（税抜105×3）で比べる。ぴったり割り切れる額だと丸め方を変えても
    //   差が出ず、この自己確認そのものが空振りになる。
    const frac = [{ name: 'a', amount: 105, rate: STD }, { name: 'b', amount: 105, rate: STD }, { name: 'c', amount: 105, rate: STD }];
    const badTotal = (tplId) => TAX.compute({
      lines: frac, taxMode: 'exclusive', rounding: tplId === 'elegant' ? 'ceil' : 'floor',
    }).grandTotal;
    ok(badTotal('std1') !== badTotal('elegant'), '作り物で金額が動いていない＝この検査が空振り');
    const a = TPL.totalsOf({ inv: invOf({ template_id: 'std1' }), lines: frac });
    const b = TPL.totalsOf({ inv: invOf({ template_id: 'elegant' }), lines: frac });
    eq(a.grandTotal, b.grandTotal, '本物がテンプレで金額を変えている');
    eq(a.taxTotal, 31, '前提（税率ごとに1回だけ丸める）が崩れている');
  });

  console.log('\n[self-test] ' + sp + ' passed, ' + sf + ' failed');
  if (sf) process.exit(1);
}

/* ── 本体 ──────────────────────────────────────────────────────── */
console.log('\n[請求書 列を自分で決める]');

/* ① 既定の7列 = 今のテンプレ std1 --------------------------------- */
/* ★既定の末尾は「消費税（行ごとの税額）」★
   うちの実物32枚は ★1枚残らず★ 明細に消費税の列を持っている（=E12*0.1）。
   ＝「税率の列」ではなく ★こちらが標準★。税率の列は 会社が足せる（役割で結ぶので迷子にならない）。
   ★適用税率そのものは（内訳）に必ず出る★ので、適格請求書の要件は落ちない。 */
T('★既定の7列は「テンプレ std1」の初期値として持っている（ベタ書きではない）', () => {
  const t = TPL.get('std1');
  ok(t, 'std1 が無い');
  eq(JSON.stringify(t.cols.items), JSON.stringify(['#', '品名・内容', '数量', '単位', '単価', '金額', '消費税']));
  ok(TPL.list().length >= 2, 'テンプレが2枚に足りない: ' + TPL.list().length);
  ok(TPL.get('elegant'), 'elegant が無い');
});

T('★どの列が「金額」「税率」かは役割で決まる（名前を変えても計算が迷子にならない）', () => {
  eq(COLS.roleOf('金額'), 'amount');
  eq(COLS.roleOf('税率'), 'rate');
  eq(COLS.roleOf('数量'), 'qty');
  eq(COLS.roleOf('単価'), 'price');
  eq(COLS.roleOf('品名・内容'), 'name');
  eq(COLS.roleOf('#'), 'index');
  eq(COLS.roleOf('行き先'), null, '知らない列に役割が付いている');
});

/* ② 紙からはみ出さない -------------------------------------------- */
T('★列を足しても紙からはみ出さない（3〜12本 × 幅バラバラを総当たり）', () => {
  let n = 0;
  const pool = ['日付', '行き先', '金額', '備考', '距離', '人数', '名前', '品名・内容', '数量', '単位', '単価', '税率'];
  for (let c = 3; c <= 12; c++) {
    for (const w of [undefined, 24, 80, 400, 1000, 0, -5]) {
      const items = pool.slice(0, c);
      const widths = {};
      if (w !== undefined) items.forEach((k, i) => { widths[k] = (i % 2 === 0) ? w : 80; });
      const cw = COLS.widthsOf(items, widths);
      n++;
      eq(cw.length, items.length, '列の数が合わない');
      const sum = cw.reduce((a, b) => a + b, 0);
      near(sum, COLS.PAPER_WIDTH, 0.01, '合計が紙幅と違う（' + c + '列 / 幅' + w + '）');
      cw.forEach((x, i) => {
        ok(Number.isFinite(x), i + '列目が数でない');
        ok(x > 0, i + '列目の幅が0以下（列が消える）: ' + x);
      });
    }
  }
  if (n < 60) throw new Error('組合せが少なすぎる（検査が空振り）: ' + n);
  console.log('     実測: ' + n + '通りで はみ出し0');
});

T('★幅は 24 未満／400 超にできない（クランプ）', () => {
  eq(COLS.clampWidth(23), COLS.MIN_W);
  eq(COLS.clampWidth(24), 24);
  eq(COLS.clampWidth(400), 400);
  eq(COLS.clampWidth(401), COLS.MAX_W);
  eq(COLS.clampWidth(-100), COLS.MIN_W);
  eq(COLS.clampWidth(NaN), COLS.MIN_W, '数でない幅が通っている');
  eq(COLS.MIN_W, 24);
  eq(COLS.MAX_W, 400);
  // ±で動かす道具も同じ範囲に収まる
  eq(COLS.bumpWidth({ 金額: 30 }, '金額', -20).金額, 24, '下限を割った');
  eq(COLS.bumpWidth({ 金額: 390 }, '金額', 50).金額, 400, '上限を超えた');
});

/* ③ 揃え ---------------------------------------------------------- */
T('★揃えの既定は役割で決まる／会社の指定があればそれが勝つ', () => {
  eq(COLS.alignOf(null, '金額'), 'right');
  eq(COLS.alignOf(null, '数量'), 'right');
  eq(COLS.alignOf(null, '単価'), 'right');
  eq(COLS.alignOf(null, '日付'), 'center');
  eq(COLS.alignOf(null, '#'), 'center');
  eq(COLS.alignOf(null, '行き先'), 'left');
  eq(COLS.alignOf({ aligns: { 金額: 'left' } }, '金額'), 'left', '会社の指定が効いていない');
  eq(COLS.alignOf({ aligns: { 金額: 'ななめ' } }, '金額'), 'right', '知らない値が通っている');
});

/* ④ 列名の検査 ---------------------------------------------------- */
T('★列名が空・重複・0本なら赤で止める（どの列か分からない紙を出さない）', () => {
  ok(COLS.validate(['日付', '行き先', '金額']).length === 0, 'まともな並びが赤になっている');
  ok(COLS.validate([]).length > 0, '0本が通っている');
  ok(COLS.validate(['日付', '']).length > 0, '空の列名が通っている');
  ok(COLS.validate(['日付', '  ']).length > 0, '空白だけの列名が通っている');
  ok(COLS.validate(['金額', '金額']).length > 0, '同じ列名が2本通っている');
  ok(COLS.validate(new Array(COLS.MAX_COLS + 1).fill(0).map((_, i) => 'c' + i)).length > 0, '列が多すぎる並びが通っている');
});

/* ④-b ★法定の記載事項③（取引の内容）を、列の自由で消させない★
   列名は自由でよい（代行なら「行き先」が内容）。だが ★内容を書く列が1本も無い並び★は
   「何を売ったのか書いていない請求書」になり、法律の要件を満たさない。 */
T('★「何を売ったか」を書く列が1本も無い並びは赤（列名は自由・でも0本は不可）', () => {
  ok(COLS.hasContentColumn(['#', '品名・内容', '金額']), '品名が内容として数えられていない');
  ok(COLS.hasContentColumn(['日付', '行き先', '金額']), '行き先が内容として数えられていない');
  ok(COLS.hasContentColumn(['工事名', '金額']), '知らない名前の列が内容として数えられていない');
  ok(COLS.hasContentColumn(['金額', '摘要']), '摘要が内容として数えられていない');
  ok(!COLS.hasContentColumn(['日付', '金額', '税率']), '数字と日付だけの並びが通っている');
  ok(!COLS.hasContentColumn(['#', '数量', '単位', '単価', '金額', '税率']), '数字だけの並びが通っている');
  ok(!COLS.hasContentColumn(['日付']), '日付だけが内容として数えられている');
  const errs = COLS.validate(['日付', '金額', '税率']);
  ok(errs.length > 0, '内容の列が無い並びが通っている');
  ok(/何を売ったか/.test(errs.join('')), '理由が書かれていない: ' + errs.join(''));
});

/* ⑤ ★金額は見た目に依らない★ ------------------------------------- */
T('★テンプレを替えても金額が1円も変わらない（std1 ⇔ elegant）', () => {
  for (const mode of ['exclusive', 'inclusive']) {
    for (const rd of ['floor', 'ceil', 'round']) {
      const base = { tax_mode: mode, rounding: rd };
      const a = TPL.totalsOf({ inv: invOf(Object.assign({ template_id: 'std1' }, base)), lines: realOne() });
      const b = TPL.totalsOf({ inv: invOf(Object.assign({ template_id: 'elegant' }, base)), lines: realOne() });
      eq(a.subtotal, b.subtotal, '小計が変わった(' + mode + '/' + rd + ')');
      eq(a.taxTotal, b.taxTotal, '消費税が変わった(' + mode + '/' + rd + ')');
      eq(a.grandTotal, b.grandTotal, '合計が変わった(' + mode + '/' + rd + ')');
    }
  }
});

T('★列を足す・消す・並べ替えても金額が1円も変わらない', () => {
  const specs = [
    { items: ['#', '品名・内容', '数量', '単位', '単価', '金額', '税率'] },
    { items: ['品名・内容', '金額', '税率'] },
    { items: ['日付', '行き先', '品名・内容', '数量', '単位', '単価', '金額', '税率', '備考'] },
    { items: ['税率', '金額', '品名・内容'] },
    { items: ['品名・内容', '数量', '単価', '税率'] },   // ★金額の列が無い並び
  ];
  const want = TAX.compute({ lines: realOne(), taxMode: 'exclusive', rounding: 'floor' });
  eq(want.grandTotal, REAL_TOTAL, '前提の1通が違う');
  for (const s of specs) {
    const t = TPL.totalsOf({ inv: invOf({ data: { cols: s } }), lines: realOne() });
    eq(t.subtotal, REAL_SUBTOTAL, '小計が動いた: ' + s.items.join('/'));
    eq(t.taxTotal, REAL_TAX, '消費税が動いた: ' + s.items.join('/'));
    eq(t.grandTotal, REAL_TOTAL, '合計が動いた: ' + s.items.join('/'));
  }
});

/* ⑥ 実物の1通が変わらない（回帰の錨） ----------------------------- */
T('★2026-08-10 に出した 202609-001 が、既定テンプレで1円も変わらない', () => {
  const t = TPL.totalsOf({ inv: invOf(), lines: realOne() });
  eq(t.grandTotal, REAL_TOTAL);
  eq(t.subtotal, REAL_SUBTOTAL);
  eq(t.taxTotal, REAL_TAX);
  const built = PAPER.build({ inv: invOf(), tax: t, partner: PARTNER, org: ORG, cols: TPL.get('std1').cols });
  const flat = built.html.replace(/\s+/g, '');
  ok(flat.includes('149,420'), '紙に合計が出ていない');
  ok(flat.includes('134,400'), '紙に明細の金額が出ていない');
  ok(flat.includes('202609-001'), '紙に番号が出ていない');
});

/* ⑦ 紙が列どおりに出る -------------------------------------------- */
T('★紙の見出しは items のとおりに、順番も含めて出る', () => {
  const cols = { items: ['日付', '行き先', '金額', '備考'], widths: { 日付: 64, 行き先: 240, 金額: 100, 備考: 80 } };
  const t = TPL.totalsOf({ inv: invOf({ data: { cols } }), lines: realOne() });
  const html = PAPER.build({ inv: invOf({ data: { cols } }), tax: t, partner: PARTNER, org: ORG, cols }).html;
  const heads = [...html.matchAll(/<th class="c-col"[^>]*>([^<]*)<\/th>/g)].map((m) => m[1]);
  eq(JSON.stringify(heads), JSON.stringify(cols.items), '見出しが items と違う');
  ok(!/品名・内容/.test(html), '使っていない列が紙に残っている');
});

T('★税率・単位・番号は折り返さない（「10」と「%」が上下に割れない）', () => {
  // 列を狭くしても割れないこと＝書き方で止める
  const cols = { items: ['品名・内容', '金額', '税率', '単位', '#'], widths: { '税率': 24, '単位': 24, '#': 24 } };
  const t = TPL.totalsOf({ inv: invOf({ data: { cols } }), lines: realOne() });
  const html = PAPER.build({ inv: invOf({ data: { cols } }), tax: t, partner: PARTNER, org: ORG, cols }).html;
  const cells = [...html.matchAll(/<td class="([^"]*)"[^>]*>([^<]*)</g)];
  const rate = cells.find((m) => /%/.test(m[2]));
  ok(rate, '税率のセルが見つからない');
  ok(/c-nowrap/.test(rate[1]), '税率が折り返す指定になっている: ' + rate[1]);
  ok(/\.items \.c-nowrap\{[^}]*white-space:nowrap/.test(PAPER.css()), '折り返さない指定がCSSに無い');
});

T('★値が無い列は空欄のまま（0 で埋めない）', () => {
  const cols = { items: ['品名・内容', '距離', '金額', '税率'] };
  const lines = [{ name: 'あ', amount: 1000, rate: STD }];   // 距離 は入っていない
  const t = TPL.totalsOf({ inv: invOf({ data: { cols } }), lines });
  const html = PAPER.build({ inv: invOf({ data: { cols } }), tax: t, partner: PARTNER, org: ORG, cols }).html;
  ok(!/>0</.test(html.replace(/c-col"[^>]*>0</g, '')), '無い値が 0 で埋められている');
  ok(!/undefined|NaN/.test(html), '紙に undefined/NaN が出ている');
});

T('★知らない列名を足しても落ちない・紙に出る', () => {
  const cols = { items: ['品名・内容', '担当者', '金額', '税率'], widths: { 担当者: 90 }, aligns: { 担当者: 'center' } };
  const lines = [{ name: 'あ', amount: 1000, rate: STD, extra: { 担当者: '山田' } }];
  const t = TPL.totalsOf({ inv: invOf({ data: { cols } }), lines });
  const html = PAPER.build({ inv: invOf({ data: { cols } }), tax: t, partner: PARTNER, org: ORG, cols }).html;
  ok(/担当者/.test(html), '足した列の見出しが無い');
  ok(/山田/.test(html), '足した列の中身が無い');
  // ★足す前と足した後で、金額が1円も動かない
  const before = TPL.totalsOf({ inv: invOf({ data: { cols: { items: ['品名・内容', '金額', '税率'] } } }), lines });
  eq(t.grandTotal, before.grandTotal, '列を足して金額が動いた');
  eq(t.taxTotal, before.taxTotal, '列を足して消費税が動いた');
});

/* ⑧ テンプレ2枚 ---------------------------------------------------- */
T('★テンプレは2枚（代行請求と同じ classic 系 / elegant 系）・見た目だけが違う', () => {
  const t = TPL.totalsOf({ inv: invOf(), lines: realOne() });
  const a = PAPER.build({ inv: invOf({ template_id: 'std1' }), tax: t, partner: PARTNER, org: ORG, cols: TPL.get('std1').cols, theme: TPL.get('std1').theme });
  const b = PAPER.build({ inv: invOf({ template_id: 'elegant' }), tax: t, partner: PARTNER, org: ORG, cols: TPL.get('elegant').cols, theme: TPL.get('elegant').theme });
  ok(a.html !== b.html, '2枚の見た目が同じ（テンプレになっていない）');
  // ★金額の文字は両方に同じだけ出る
  const money = (s) => (s.replace(/\s+/g, '').match(/149,420/g) || []).length;
  ok(money(a.html) > 0 && money(a.html) === money(b.html), '合計の出方が2枚で違う');
  for (const built of [a, b]) {
    const css = built.html;
    ok(!/word-break\s*:\s*break-all/.test(css), 'break-all がある（日本語が1文字ずつ割れる）');
    ok(!/display\s*:\s*(flex|grid)/.test(css), 'flex/grid がある（文が縦に割れる）');
  }
});

/* ★紙の色は「薄い黒」★（司さん 2026-08-16「代行請求書アプリのように」）
   ＝紙に「押せる物」は無いので、★色で強弱を作らない★（強弱は 大きさ と 太さ）。
   ★緑を使わないのは違反ではない★（禁止は #1A4A2E ／ 緑を使うなら #2E7D54）。 */
T('★どちらのテンプレも 禁止色を使わない・字は薄い黒（無彩色）', () => {
  const soft = (v) => {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(v);
    if (!m) return true;                        // 色でない指定（rule など）は見ない
    const [r, g, b] = [1, 2, 3].map((i) => parseInt(m[i], 16));
    return Math.max(r, g, b) - Math.min(r, g, b) <= 12;
  };
  for (const id of ['std1', 'elegant']) {
    const th = TPL.get(id).theme;
    const j = JSON.stringify(th);
    ok(!/#1A4A2E/i.test(j), id + ' に使ってはいけない濃い緑がある');
    // ★緑を使うなら うちの緑だけ★（使わないのは可）
    const greens = (j.match(/#[0-9A-Fa-f]{6}/g) || []).filter((c) => !soft(c));
    ok(greens.every((c) => /#2E7D54|#3D9E72|#52B788/i.test(c)),
      id + ' に決められていない色がある: ' + JSON.stringify(greens));
    // ★読ませる字（本文・補助・金額）は無彩色★
    ['ink', 'sub', 'grandInk', 'headInk'].forEach((k) => {
      if (th[k]) ok(soft(th[k]), id + ' の ' + k + ' に色が付いている: ' + th[k]);
    });
  }
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
