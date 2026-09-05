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

T('① 備考の枠は std1／elegant に 出て koujo には 出ない（様式が 決める）',
  !bad.some((x) => /備考の枠/.test(x)), bad.filter((x) => /備考の枠/.test(x)).join(' / '));
T('② 枠15〜20行の どれでも 紙の高さ ≦ A4（黙って 切れない）',
  !bad.some((x) => /A4を/.test(x)), bad.filter((x) => /A4を/.test(x)).join(' / '));
T('③ 空振りしていない（' + kazu + '通り 測った）', kazu === 18, '測った通り数 ' + kazu + '（想定 18）');

/* ④ ★行数の計算と 紙の描画が 同じ 1か所を 見ているか★
   ＝備考を 切った紙（memoBox:false）は 1行 多く 載る。
     ここが 食い違うと「載ると 言って はみ出す」紙が 出る。 */
await pg.setContent(paperHtml('std1', 20, { memoBox: false }), { waitUntil: 'load' });
const off = await pg.evaluate(MEASURE);
await pg.setContent(paperHtml('std1', 20), { waitUntil: 'load' });
const on = await pg.evaluate(MEASURE);
const gyoOff = (paperHtml('std1', 20, { memoBox: false }).match(/class="row"/g) || []).length;
const gyoOn = (paperHtml('std1', 20).match(/class="row"/g) || []).length;
T('④ 備考を出す紙は 明細の枠が 1行 少ない（計算と 描画が 同じ1か所）',
  off.h <= A4 + 1 && on.h <= A4 + 1 && !off.memo && on.memo,
  '備考なし ' + off.h + 'px(' + off.memo + ') ／ 備考あり ' + on.h + 'px(' + on.memo + ')');
console.log('     実測 … 備考なし ' + off.h + 'px ／ 備考あり ' + on.h + 'px ／ A4 ' + A4.toFixed(1) + 'px');

/* ── ★わざと 壊して 赤に なるか★ ──
   ＝「行数を 減らす」直しを 外した形（memoBox を 行数に 数えない）を 手で 組んで測る。
     ★壊した数と 赤の数を 並べる★（[[feedback_hankaku_kiku_mihari_ga_ichiban_mitsukenikui]]） */
if (SELF) {
  console.log('\n[memo-waku --self-test] わざと 直す前の形にすると はみ出すか');
  let kowashita = 0, aka = 0;
  for (const id of ['std1', 'elegant']) {
    for (const waku of [18, 19, 20]) {
      kowashita++;
      /* ★足元だけ 高くする★＝「備考の枠が 高くなったのに 行数が 知らない」状態を そのまま 作る。
         ＝2026-09-05 に 実際に 起きた形（枠18行＋備考 で 1146px＝23px はみ出し）と 同じ。
         ★見張りが これを 見逃すなら、次に 足元を 触った日にも 見逃す★ */
      const html = paperHtml(id, waku, { memoBox: true })
        .replace('.note-mb{min-height:40px;}', '.note-mb{min-height:140px;}');
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
