/* memo-waku.mjs — ★備考の枠を 出しても 紙から はみ出さない★（本物のブラウザで 描いて 測る）
 * ============================================================================
 * ★なぜ（2026-09-05 司さん）★
 *   「他2つは おれの様式のように デフォで 備考欄つけとけよ」
 *   ＝std1／elegant に ★中身が 空でも 備考の枠★を 刷るようにした。
 *   ところが 足元が ★23px 高くなる★ので、明細の枠が 18行のままだと A4 を はみ出す。
 *   `.sheet{overflow:hidden}` なので ★はみ出した分は 黙って 切れる★
 *   ＝数字は 全部 緑のまま（[[feedback_numbers_green_but_open_the_picture]]）。
 *
 * ★実測（2026-09-05 WebKit・A4 297mm＝1122.5px）★
 *   枠18行＋備考 … 1146px ＝★23px はみ出す★
 *   枠17行＋備考 … 1123px ＝載る（15/16/17行とも 1123px）
 *   ⇒ seikyu-paper.js maxRowsOf() で ★備考を出す紙は 1行 減らす★ようにした。
 *
 * ★ここで見る事（★描いた物を 測る★・source を読まない）★
 *   ① std1／elegant は ★備考の枠が 出る★／koujo は ★出ない★（実物11通とも 備考が無い）
 *   ② 枠の 指定が 15〜20行の どれでも ★紙の高さ ≦ A4★（黙って 切れない）
 *   ③ ★空振りしていない★（何通り 測ったかを 出す・0通りで緑にしない）
 *   ④ ★行数の 計算と 紙の 描画が 同じ 1か所を 見ている★
 *      （別々に 判定すると「載る」と言って はみ出す）
 *
 * 使い方: node seikyu/tests/memo-waku.mjs [--self-test]
 *   ・★ブラウザが 無い時は「未測定」で 緑（週1の webkit.yml では 赤）★
 *     ＝借り方も 終わり値も scripts/_borrow-playwright.mjs が 1か所で 持つ
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { borrow, launch as pwLaunch } from '../../scripts/_borrow-playwright.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require_ = createRequire(import.meta.url);
const TAX = require_(path.join(ROOT, 'seikyu/lib/seikyu-tax.js'));
const COLS = require_(path.join(ROOT, 'seikyu/lib/seikyu-cols.js'));
const TPL = require_(path.join(ROOT, 'seikyu/lib/seikyu-templates.js'));
const PAPER = require_(path.join(ROOT, 'seikyu/lib/seikyu-paper.js'));
const SELF = process.argv.includes('--self-test');

/* ★A4 縦 297mm を 96dpi で★（紙の側と 同じ決まり） */
const A4 = 297 / 25.4 * 96;      // = 1122.5px

/** 紙を1枚 組む。waki=true で ★わざと 昔の形★（備考を 行数に 数えない）にする */
function paperHtml(tplId, waku, opts) {
  const o2 = opts || {};
  const t = TPL.getOrDefault(tplId);
  const lines = Array.from({ length: 3 }, (_, i) => ({
    name: '工事一式 ' + (i + 1) + '月分', qty: '1', unit: '式', price: '30000', rate: 10,
  }));
  const tax = TAX.compute({ lines, taxMode: 'exclusive', rounding: 'floor' });
  const o = {
    inv: { no: '202609-001', issue_ymd: '2026-09-05', kind: 'invoice', lines,
      totals: { grandTotal: tax.grandTotal }, data: {} },
    tax, partner: { name: '株式会社テスト', honor: '御中' },
    org: { yago: '株式会社ゼロアクト', addr: '愛媛県今治市本町7-3-40', tel: '0898-00-0000',
      invoiceNo: 'T1234567890123', bank: '伊予銀行　今治支店　普通　1234567　ド）ゼロアクト' },
    template: t, templateId: tplId, theme: t.theme,
    cols: COLS.normalizeSpec(t.cols), paperRows: waku,
  };
  if (o2.memoBox !== undefined) o.memoBox = o2.memoBox;
  return PAPER.build(o).html;
}

const MEASURE = () => {
  const s = document.querySelector('.sheet') || document.body;
  return {
    h: Math.round(s.scrollHeight),
    memo: /備考/.test(document.body.innerText || ''),
    sheets: document.querySelectorAll('.sheet').length,
  };
};

const webkit = await borrow('memo-waku', 'webkit');
const b = await pwLaunch('memo-waku', webkit);
const pg = await (await b.newContext({ viewport: { width: 1000, height: 1600 } })).newPage();

console.log('\n[memo-waku] 備考の枠を 出しても 紙から はみ出さないか（A4 = ' + A4.toFixed(1) + 'px）');

/* ★様式ごとの 想定は 様式そのものから 取る★（試験に 焼き付けない
   ＝様式を 増やした日に ここが 取り残されない） */
const MACHIRU = {};
['std1', 'elegant', 'koujo'].forEach(function (id) {
  MACHIRU[id] = !!(TPL.getOrDefault(id).theme || {}).memoBox;
});

let pass = 0, fail = 0, kazu = 0;
const bad = [];
for (const id of Object.keys(MACHIRU)) {
  for (const waku of [15, 16, 17, 18, 19, 20]) {
    await pg.setContent(paperHtml(id, waku), { waitUntil: 'load' });
    const m = await pg.evaluate(MEASURE);
    kazu++;
    const tag = id + '／枠' + waku + '行';
    if (m.h > A4 + 1) bad.push(tag + ' … ★' + m.h + 'px（A4を ' + Math.round(m.h - A4) + 'px 超えた）★');
    if (m.memo !== MACHIRU[id]) bad.push(tag + ' … 備考の枠 ' + m.memo + '（想定 ' + MACHIRU[id] + '）');
  }
}
const T = (n, c, msg) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + ' — ' + msg); } };

/* ★★2026-09-08 ①を 書き直した★★
   ★司さんが 実物を 見せてくれて 私の 読み違いが 分かった★
   「おれの備考欄は 消費税の横にもって来て 現場名とか 書いてないか？」の
   ★「消費税の横」＝明細表の 消費税の列の 右隣の 列★（行ごとに 現場名）。
   私は「足元の 箱」と 読み違えて、その箱を この見張りが 守っていた。
   ⇒ ★足元の 箱は 出さない★／★備考は 明細の 列★（役目 'memo' は 前から 在る）。 */
T('① 足元に 備考の箱を 出さない（備考は 明細の 列＝消費税の 右隣）',
  !bad.some((x) => /備考の枠/.test(x)), bad.filter((x) => /備考の枠/.test(x)).join(' / '));
T('② 枠15〜20行の どれでも 紙の高さ ≦ A4（黙って 切れない）',
  !bad.some((x) => /A4を/.test(x)), bad.filter((x) => /A4を/.test(x)).join(' / '));
/* ★まだ 測れていない所（正直に 書き残す・2026-09-08）★
   ここが 見ているのは ★控除なしの 紙★の 枠15〜20行（3様式＝18通り）。
   ★控除ありの 紙で 枠を 上限に した時★は まだ 誰も 測っていない
   （bank-paper は 明細1/10/20行＝紙が 自分で 2枚に 割るので 境界に 当たらない）。
   ★今日 出た 穴（合計行を 足して A4を 1px 超えた）は ここが 捕まえた★ので
   見張りとしては 効いているが、★控除ありの 境界は 🟡未測定★。 */
T('③ 空振りしていない（' + kazu + '通り 測った）', kazu === 18, '測った通り数 ' + kazu + '（想定 18）');

/* ④ ★備考は 明細の 列★（司さん 2026-09-08 の 実物＝黒田空調）
   実物の 列 … 項目／数量／単位／金額／消費税／★備考★
   備考に ★現場名★（東予市 川本邸・菊水ホテル…）を 1行ずつ 書いている。
   ★役目は seikyu-cols.js に 前から 在る★（'備考'／'摘要' → memo）＝
   会社が 設定 ▸ 明細の列 で 足せば 出る。★ここでは それを 押して 確かめる★。 */
const COLS2 = require_(path.join(ROOT, "seikyu/lib/seikyu-cols.js"));
const specM = COLS2.normalizeSpec({
  items: ['項目', '数量', '単位', '金額', '消費税', '備考'],
  widths: { '項目': 200, '数量': 46, '単位': 40, '金額': 90, '消費税': 70, '備考': 160 }, aligns: {},
});
const tM = TPL.getOrDefault('std1');
const linesM = [{ name: 'エアコン洗浄', qty: 1, unit: '台', price: 12000, rate: 10, memo: '東予市　川本邸' },
  { name: 'エアコン取替', qty: 1, unit: '台', price: 20000, rate: 10, memo: '菊水ホテル' }];
const taxM = TAX.compute({ lines: linesM, taxMode: 'exclusive', rounding: 'floor' });
const htmlM = PAPER.build({
  inv: { no: 'A', issue_ymd: '2026-08-01', kind: 'invoice', lines: linesM,
    totals: { grandTotal: taxM.grandTotal }, data: {} },
  tax: taxM, partner: { name: '株式会社黒田空調工業', honor: '御中' },
  org: { yago: '合同会社ZEROact', bank: '伊予銀行　今治支店　普通　4160657' },
  template: tM, templateId: 'std1', theme: tM.theme, cols: specM, deduct: 0, deductLines: [],
}).html;
T('④ ★備考の 列に 現場名が 出る（消費税の 右隣）',
  /東予市/.test(htmlM) && /菊水ホテル/.test(htmlM),
  '★現場名が 紙に 出ていない★（備考の列の 値は line.memo）');
T('④-2 ★備考は 明細の 列＝足元の 箱では ない',
  !/note-memo/.test(htmlM), '★足元に 備考の箱が まだ 出ている★');

if (SELF) {
  console.log('\n[memo-waku --self-test] わざと 直す前の形にすると はみ出すか');
  let kowashita = 0, aka = 0;
  for (const id of ['std1', 'elegant']) {
    for (const waku of [18, 19, 20]) {
      kowashita++;
      /* ★足元だけ 高くする★＝「足元が 高くなったのに 行数が 知らない」状態を そのまま 作る。
         ★2026-09-08 壊す 所を 変えた★
           前は ★備考の枠★を 高くしていた。だが 司さん
           「おれの備考欄は 消費税の横にもって来て」で ★備考を 締めの 横へ 移した★ので、
           備考を 高くしても ★締めの 高さの 方が 高い＝紙は もう はみ出さない★
           （実測 6通りとも 1123px のまま＝★壊せていない★）。
           ⇒ ★今 足元の 高さを 決めているのは 振込先の 箱★なので そちらを 高くする。
         ★見張りが これを 見逃すなら、次に 足元を 触った日にも 見逃す★ */
      const html = paperHtml(id, waku, { memoBox: true })
        .replace('.note-bb{width:auto;min-width:22mm;min-height:24px;}',
          '.note-bb{width:auto;min-width:22mm;min-height:180px;}');
      await pg.setContent(html, { waitUntil: 'load' });
      const m = await pg.evaluate(MEASURE);
      const deta = m.h > A4 + 1;
      if (deta) aka++;
      console.log('  ' + (deta ? '✓' : '✗') + ' ' + id + '／枠' + waku + '行 を 高くした … '
        + m.h + 'px ' + (deta ? '（はみ出した＝見張りが 気づく）' : '★はみ出さない＝気づけない★'));
    }
  }
  console.log('  ★壊した ' + kowashita + '件／赤に なった ' + aka + '件★');
  await b.close();
  if (aka !== kowashita) { console.log('★自己確認 おかしい（壊した数と 赤の数が 合わない）★'); process.exit(1); }
  console.log('\n' + kowashita + ' passed, 0 failed');
  process.exit(0);
}

await b.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
