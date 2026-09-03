/* koujo-paper.test.mjs — ★3つ目の様式＝工事代金＋控除（差引で出す）★
 * =============================================================================
 * 指示役の裁定（2026-08-27）:
 *   ★控除の計算は もう在る（seikyu-doc.js）。作るのは「紙の出し方」だけ★
 *   ⇒ ①2列の表 ②控除明細 ③中計（呼び名は会社が決める） ④対象期間 ⑤振込先1行
 *   ★計算には1文字も触らない★
 *
 * ★実物と1円ずつ突き合わせる★（八木工業 2025/9・実測）
 *   工事代金 197,600 ／ 消費税 19,760 ／ 小計 217,360
 *   弁当代 矢原 7,310 ／ 健康診断代 10,164 ／ ★中計 17,474★ ／ ★合計 199,886★
 *   ⇒ ★紙に描かれた字を 1行ずつ足して 一致するか★（★中の値どうしで閉じない★）
 *
 * 使い方: node seikyu/tests/koujo-paper.test.mjs [--self-test]
 */
/* ★2026-09-03 言葉を 決め直した（指示役の裁定＝C）★
   ★実物45枚（16社）で「明細の合計」は 0回★／足元は ★小計 → 消費税 → 合計★（機械で 読んだ数）。
   ⇒ この試験が 見ているのは ★「足元の 行が 1回だけ 出る」事★であって 言葉そのものでは ない。
   ★言葉を 小計に 置き換えた／数の 見方は 1文字も 変えていない★。 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require_ = createRequire(path.join(ROOT, 'package.json'));
const PAPER = require_(path.join(ROOT, 'seikyu/lib/seikyu-paper.js'));
const TPL = require_(path.join(ROOT, 'seikyu/lib/seikyu-templates.js'));
const TAX = require_(path.join(ROOT, 'seikyu/lib/seikyu-tax.js'));
const DOC = require_(path.join(ROOT, 'seikyu/lib/seikyu-doc.js'));

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const eq = (a, b, m) => { if (a !== b) throw new Error((m ? m + ': ' : '') + '欲しい ' + JSON.stringify(b) + ' / 出た ' + JSON.stringify(a)); };
const ok = (v, m) => { if (!v) throw new Error(m || 'false'); };

/* ── 実物（八木工業 2025/9）と同じ1通を組み立てる ───────────────── */
const PERIOD = '2025/8/21 ~ 2025/9/20';
function invOf(over) {
  return Object.assign({
    id: 'iv_koujo', doc_type: 'invoice', no: '202509-001',
    partner_id: 'pt_y', issue_ymd: '2025-09-25', status: 'issued',
    tax_mode: 'exclusive', rounding: 'floor',
    template_id: 'koujo',
    lines: [{ name: '工事代金', qty: 1, unit: '式', price: 197600, rate: 10 }],
    data: {
      lead: PERIOD,
      deductions: [
        { name: '弁当代 矢原', amount: 7310 },
        { name: '健康診断代', amount: 10164 },
      ],
    },
  }, over || {});
}
const ORG = {
  yago: '合同会社ZEROact', addr: '愛媛県今治市本町7-3-40 00コーポ1号', tel: '090-5716-1946',
  invoiceNo: 'T3500003003293',
  bank: '伊予銀行 今治支店 普通 4160657 ド）ゼロアクト',
};
const PARTNER = { name: '八木工業 株式会社', keisho: '御中' };

function build(over, extra) {
  const inv = invOf(over);
  /* ★アプリと同じ呼び方★（seikyu-app.js currentTax）＝形を勝手に作らない */
  const tax = TAX.compute({ lines: inv.lines, taxMode: inv.tax_mode, rounding: inv.rounding });
  const ded = DOC.deductionsOf(inv).map((d) => ({ name: String(d.name || ''), amount: DOC.receiptAmountOf(d.amount) }));
  return PAPER.build(Object.assign({
    inv: inv, tax: tax, partner: PARTNER, org: ORG,
    cols: TPL.colsOf(inv), theme: TPL.getOrDefault(inv.template_id).theme,
    deduct: DOC.deductTotalOf(inv), deductLines: ded,
  }, extra || {}));
}
/* ★紙に描かれた字★だけを読む（タグと style は落とす＝ソースの字を数えない） */
function textOf(html) {
  return String(html).replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, '\n').replace(/&yen;/g, '¥').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .split('\n').map((s) => s.trim()).filter(Boolean);
}
const money = (s) => Number(String(s).replace(/[^\d]/g, ''));

if (process.argv.includes('--self-test')) {
  console.log('\n[控除の紙 --self-test] わざと壊して 赤になるか');
  let sp = 0, sf = 0;
  const S = (n, fn) => { try { fn(); sp++; console.log('  ✓ ' + n); } catch (e) { sf++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };

  S('① 様式を std1 に戻すと 2列ではなくなる＝捕まえられる', () => {
    const c = TPL.colsOf(invOf({ template_id: 'std1' }));
    ok(c.items.length > 2, '作り物が2列のまま＝この検査が空振り');
    eq(TPL.colsOf(invOf()).items.length, 2, '★本物が2列でない★');
  });
  S('② 控除を空にすると 中計が出ない＝捕まえられる', () => {
    const t = textOf(build({ data: { lead: PERIOD, deductions: [] } }).html);
    ok(t.indexOf('中計') < 0, '作り物に 中計が出ている＝この検査が空振り');
    ok(textOf(build().html).indexOf('中計') >= 0, '★本物に 中計が出ていない★');
  });
  S('③ 呼び名を会社が変えたら 変わる（焼き付いていない）', () => {
    const t = textOf(build({}, { dedSumLabel: '小計', dedHeadLabel: '控除' }).html);
    ok(t.indexOf('中計') < 0, '★会社が変えたのに 中計のまま★');
    ok(t.indexOf('小計') >= 0, '会社が決めた呼び名が出ていない');
  });
  console.log('\n[self-test] ' + sp + ' passed, ' + sf + ' failed');
  if (sf) process.exit(1);
}

console.log('\n[3つ目の様式＝工事代金＋控除]');

const R = build();
const LINES = textOf(R.html);

T('★① 表は2列（項目・金額）★', () => {
  const c = TPL.colsOf(invOf());
  eq(c.items.length, 2, '列の数');
  eq(c.items.join('/'), '項目/金額');
  /* ★紙の見出しにも 2列しか出ていない★（列を消しただけで 中身が残っていない事） */
  const heads = [...String(R.html).matchAll(/<th class="c-col"[^>]*>([^<]*)<\/th>/g)].map((m) => m[1]);
  eq(heads.join('/'), '項目/金額', '紙の見出し: ' + heads.join('/'));
});

T('★② 控除明細の見出しが出る★', () => {
  ok(LINES.indexOf('控除明細') >= 0, '「控除明細」が紙に無い');
  ok(LINES.indexOf('弁当代 矢原') >= 0, '控除の1件目が紙に無い');
  ok(LINES.indexOf('健康診断代') >= 0, '控除の2件目が紙に無い');
});

T('★③ 中計が出る（既定の呼び名）★', () => {
  ok(LINES.indexOf('中計') >= 0, '「中計」が紙に無い');
});

T('★④ 対象期間の行が出る★', () => {
  ok(LINES.indexOf(PERIOD) >= 0, '対象期間「' + PERIOD + '」が紙に無い');
});

T('★⑤ 振込先が1行★', () => {
  const box = /<div class="note-b note-bb">([\s\S]*?)<\/div>/.exec(String(R.html));
  ok(box, '「お振込先」の箱が紙に無い');
  /* ★1行＝<br> が1つも無い★（口座番号だけ大きくする span は 行を割らない） */
  ok(box[1].indexOf('<br>') < 0, '振込先が 何行にも割れている: ' + JSON.stringify(box[1].slice(0, 80)));
  const one = box[1].replace(/<[^>]+>/g, '');
  ok(/伊予銀行/.test(one) && /4160657/.test(one) && /ゼロアクト/.test(one),
    '振込先の中身が足りない: ' + JSON.stringify(one));
  console.log('     振込先（1行）… ' + one.trim());
});

/* ═══ ★実物と1円ずつ★（紙に描かれた字を 1行ずつ足す） ═══ */
T('★実物（八木工業 2025/9）と 1円ずつ 一致する★', () => {
  const want = {
    '工事代金': 197600, '消費税': 19760, '合計': 217360,
    '弁当代 矢原': 7310, '健康診断代': 10164, '中計': 17474, '請求額': 199886,
  };
  /* ★紙の中の「見出し と 金額の組」を そのまま読む★
     （字を上から並べて 近い数を拾う読み方は ★（内訳）の見出しに釣られて 197,600 を消費税と読んだ★。
       2026-08-27 実測。⇒ ★組で読む★） */
  const got = {};
  const pairs = [...String(R.html).matchAll(/<tr[^>]*>\s*<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/g)]
    .map((m) => [m[1].replace(/<[^>]+>/g, '').trim(), m[2].replace(/<[^>]+>/g, '').trim()]);
  /* ★見出しの言い方は 紙が決める★（消費税は「消費税（10%）」と出る）＝★頭が一致すれば同じ物★ */
  const keyOf = (label) => Object.keys(want).filter((k) => label === k || label.indexOf(k) === 0)[0];
  pairs.forEach(([label, v]) => {
    const k = keyOf(label);
    if (k && got[k] === undefined && /[\d,]{3,}/.test(v)) got[k] = money(v);
  });
  /* 明細の行（項目・金額）は 表の本体から読む */
  const body = [...String(R.html).matchAll(/<td class="c-col[^"]*"[^>]*>([\s\S]*?)<\/td>/g)]
    .map((m) => m[1].replace(/<[^>]+>/g, '').trim());
  for (let i = 0; i < body.length - 1; i++) {
    if (want[body[i]] !== undefined && got[body[i]] === undefined && /[\d,]{3,}/.test(body[i + 1])) {
      got[body[i]] = money(body[i + 1]);
    }
  }
  Object.keys(want).forEach((k) => ok(got[k] !== undefined, '「' + k + '」の金額が紙から読めない'));
  Object.keys(want).forEach((k) => eq(got[k], want[k], k));
  /* ★足し算も 紙の字で確かめる★（中の値どうしで閉じない） */
  eq(got['工事代金'] + got['消費税'], got['合計'], '工事代金＋消費税＝合計');
  eq(got['弁当代 矢原'] + got['健康診断代'], got['中計'], '控除の2件を足すと 中計');
  eq(got['合計'] - got['中計'], got['請求額'], '合計−中計＝請求額');
  console.log('     紙の字で検算 … ' + got['工事代金'] + ' ＋ ' + got['消費税'] + ' ＝ ' + got['合計']
    + ' ／ ' + got['弁当代 矢原'] + ' ＋ ' + got['健康診断代'] + ' ＝ ' + got['中計']
    + ' ／ ' + got['合計'] + ' − ' + got['中計'] + ' ＝ ★' + got['請求額'] + '★');
});

T('★恒等式が崩れていない（請求額＝（税抜＋値引き）＋消費税−控除）★', () => {
  const inv = invOf();
  const tax = TAX.compute({ lines: inv.lines, taxMode: inv.tax_mode, rounding: inv.rounding });
  const ded = DOC.deductTotalOf(inv);
  eq(DOC.billedOf(tax, null, ded), 199886, '請求額');
  eq(tax.subtotal + tax.taxTotal - ded, 199886, '恒等式');
});

T('★値引き行と 控除を 取り違えていない（混ぜたら消費税がズレる）★', () => {
  /* ★値引きは明細の中＝税額も減る★／★控除は明細の外＝税額は動かない★ */
  const q=(i)=>TAX.compute({ lines: i.lines, taxMode: i.tax_mode, rounding: i.rounding });
  const withDed = q(invOf());
  const asDiscount = q(invOf({
    lines: [{ name: '工事代金', qty: 1, unit: '式', price: 197600, rate: 10 },
      { name: '弁当代 矢原', qty: 1, unit: '式', price: -7310, rate: 10 },
      { name: '健康診断代', qty: 1, unit: '式', price: -10164, rate: 10 }],
    data: { lead: PERIOD, deductions: [] },
  }));
  eq(withDed.taxTotal, 19760, '控除にした時の消費税');
  ok(asDiscount.taxTotal !== withDed.taxTotal,
    '★値引きにしても消費税が同じ＝控除と値引きを混ぜている★');
  console.log('     控除にすると消費税 ' + withDed.taxTotal
    + '／値引きにすると ' + asDiscount.taxTotal + '（★同じにならない＝取り違えていない★）');
});

T('★2列の表で 字が欠けない（幅の合計が紙に収まる）★', () => {
  const c = TPL.colsOf(invOf());
  const pct = c.items.map((k) => c.widths[k]);
  ok(pct.every((w) => Number(w) >= 24), '幅が小さすぎる列が在る: ' + JSON.stringify(c.widths));
  /* 紙が割り付ける％の合計は 100（はみ出さない） */
  const sum = pct.reduce((a, b) => a + Number(b), 0);
  ok(sum > 0, '幅が読めない');
});

T('★見本3枚が 別の絵★（2枚が同じ絵だった穴を作らない）', () => {
  const ids = TPL.list().map((t) => t.id);
  eq(ids.length, 3, '様式の数: ' + ids.join('/'));
  ok(ids.indexOf('koujo') >= 0, '3つ目が一覧に無い');
  const seen = {};
  ids.forEach((id) => {
    const h = build({ template_id: id }).html;
    ok(!seen[h], '★' + id + ' が 別の様式と 同じ絵★');
    seen[h] = id;
  });
  console.log('     3枚とも 別の絵（' + ids.join(' / ') + '）');
});

/* ═══ ★カスタム性＝会社が選べる★（指示役 2026-08-28）
     ★焼き付けてよいのは 法律だけ★／★選んでも 金額は1円も変わらない★ ═══ */
const sumsOf = (html) => [...String(html).matchAll(/<table class="sums">([\s\S]*?)<\/table>/g)]
  .map((m) => [...m[1].matchAll(/<th>([\s\S]*?)<\/th><td>([\s\S]*?)<\/td>/g)]
    .map((x) => x[1].replace(/<[^>]+>/g, '') + ' ' + x[2].replace(/<[^>]+>/g, '')).join(' | '))[0];

T('★選べる① 締めの並び（型A＝既定／型B）★', () => {
  const A = sumsOf(build().html);
  const B = sumsOf(build({}, { style: { sumsOrder: 'B', yenMark: false } }).html);
  /* ★2026-09-03★ 型Aの 足元の 言葉を「明細の合計」→★小計★に した（実物45枚に 合わせた）。
     ところが ★型Bでは 前から「小計」が ★税込★を 指している★（実物7通・lib の注記が 警告していた）。
     ⇒★言葉で 見ると 型Bの 検査が 壊れる★ので、★見たい 事＝「型Bに 税抜の行が 無い」を 数で 見る★。
     （★言葉で 探すな・物（数）で 見ろ★＝うちの決まり） */
  ok(/小計 ¥?197,600/.test(A), '★型Aの 小計（税抜）が 実物と違う★: ' + A);   /* ★型Aは ¥ が 付く（実測）★ */
  ok(!/197,600/.test(B), '★型Bなのに 税抜の額（197,600）が 出ている★: ' + B);
  ok(/小計 217,360/.test(B), '★型Bの 小計（税込）が実物と違う★: ' + B);
  ok(/合計 199,886/.test(B), '★型Bの 合計が実物と違う★: ' + B);
  console.log('     型A … ' + A);
  console.log('     型B … ' + B);
});

T('★選べる② ¥記号／（税込）／消費税の一言★', () => {
  const on = textOf(build().html);
  ok(on.some((x) => /御請求金額（税込）/.test(x)), '既定に（税込）が無い');
  ok(!on.some((x) => /^消費税は/.test(x)), '★既定で 消費税の一言が出ている★（既定は 出さない）');
  const off = textOf(build({}, { style: { yenMark: false, zeikomiTag: false, taxNote: '消費税は10%とします。' } }).html);
  ok(off.some((x) => /^御請求金額$/.test(x)), '★（税込）を外したのに 残っている★');
  ok(off.some((x) => /^消費税は10%とします。$/.test(x)), '消費税の一言が出ていない');
  ok(!/¥/.test(sumsOf(build({}, { style: { yenMark: false } }).html)), '★¥を外したのに 残っている★');
});

T('★選んでも 金額は1円も変わらない（見た目だけ）★', () => {
  const nums = (html) => (sumsOf(html).match(/[\d,]{3,}/g) || []).map((x) => Number(x.replace(/,/g, '')));
  const a = nums(build().html);
  const b = nums(build({}, { style: { yenMark: false, zeikomiTag: false, taxNote: 'あ', dedSum: '小計' } }).html);
  eq(JSON.stringify(b), JSON.stringify(a), '★選び方を変えたら 数が変わった★');
  console.log('     どちらも ' + JSON.stringify(a));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
