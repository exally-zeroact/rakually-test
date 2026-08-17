/* seikyu-paper.test.mjs — ★自作テンプレ std1（紙）が、出すべき物を出しているか★
 *
 * ここで止めたい事故:
 *   ① ★税率ごとの区分が紙に出ない★（適格請求書として成り立たない）
 *   ② ★インボイスの登録番号(T+13桁)と請求番号を同じ欄に出す★（まったくの別物）
 *   ③ 発行済みなのに ★今のマスタの名前★ で刷る（写しと紙が食い違う）
 *   ④ 明細0行で ★空の表★ を出す（何も無いと分からない）
 *   ⑤ ★注意書きが1文字ずつ縦に割れる★（flex/grid の箱に文を入れた前科2回）
 *   ⑥ 紙の窓にアプリの画面が混ざる（＝紙だけの窓になっていない）
 *
 * ⑤について:
 *   jsdom は幅を計算しないので、ここでは ★書き方★ を見る
 *   （紙のCSSに flex/grid を1つも使わない・文の箱は折り返し可で最低幅を持つ）。
 *   ★実物の幅は、実配信の画面で目と定規で見る★（この検査はその代わりではなく、前段の網）。
 *
 * 使い方: node seikyu/tests/seikyu-paper.test.mjs
 *         node seikyu/tests/seikyu-paper.test.mjs --self-test
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require_ = createRequire(path.join(ROOT, 'package.json'));
const PAPER = require_(path.join(ROOT, 'seikyu/lib/seikyu-paper.js'));
const TAX = require_(path.join(ROOT, 'seikyu/lib/seikyu-tax.js'));
const DOC = require_(path.join(ROOT, 'seikyu/lib/seikyu-doc.js'));
const SR = require_(path.join(ROOT, 'kyuyo/lib/shouhizei-ritsu.js'));

const STD = Math.round(SR.hyojun * 10000) / 100;   // 標準税率(%) ★数字を書かずに取る
const RED = Math.round(SR.keigen * 10000) / 100;   // 軽減税率(%)

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const eq = (a, b, m) => { if (a !== b) throw new Error((m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); };
const ok = (v, m) => { if (!v) throw new Error(m || 'false'); };

/* 実物にいちばん近い1通（代行請求の実物の形＝標準税率＋軽減税率＋対象外が混ざる） */
function sample(over) {
  const lines = [
    { name: '運転代行 9月分', qty: 42, unit: '件', price: 3200, rate: STD },
    { name: 'お弁当代', amount: 1000, rate: RED },
    { name: '立替金（対象外）', amount: 500, rate: 0 },
  ];
  const tax = TAX.compute({ lines, taxMode: 'exclusive', rounding: 'floor' });
  return Object.assign({
    inv: {
      doc_type: 'invoice', no: '202609-001', issue_ymd: '2026-09-30', due_ymd: '2026-10-31',
      tax_mode: 'exclusive', rounding: 'floor', status: 'draft',
      data: { subject: '9月分 運転代行ご利用料金', memo: '振込手数料は貴社にてご負担ください' },
    },
    tax,
    partner: { name: '藤原建設株式会社', keisho: '御中', person: '山田', zip: '794-0000', addr: '愛媛県今治市1-2-3', invoiceNo: 'T9876543210987' },
    org: { yago: '株式会社ゼロアクト', addr: '愛媛県今治市4-5-6', tel: '0898-00-0000', invoiceNo: 'T1234567890123', bank: '伊予銀行 今治支店 普通 1234567' },
  }, over || {});
}

/* ★純関数（self-test で作り物を通せる）★ やってはいけない方の紙 */
export function paperBad(kind, o) {
  const b = PAPER.build(o);
  if (kind === 'noRates') return b.html.replace(/<table class="rates">[\s\S]*?<\/table>/, '');
  // ★番号の欄（No.　…）だけを登録番号に差し替える（題名は触らない）
  if (kind === 'mixNo') return b.html.replace(/(No\.　)[^<]*/, '$1T1234567890123');
  if (kind === 'flex') return b.html.replace('.note-b{display:block', '.note-b{display:flex');
  // ★金額を塗りつぶした角丸の箱に入れる＝差し戻しの原因そのもの
  /* ★字面で探さない★＝余白を詰めた日に この作り物が空振りして、
     「壊したのに赤にならない」＝検査が死んでいた（2026-08-16 self-test が自分で見つけた）。
     ＝★セレクタで探して 中身を差し替える★（余白の数字が変わっても効く） */
  if (kind === 'grandBox') return b.html.replace(/\.grand\{/,
    '.grand{background:#EEF7F1;border:1px solid #CDE7D8;border-radius:2mm;padding:4mm 6mm;');
  return b.html;
}

/* ── self-test：わざと壊して赤になるか ─────────────────────────────── */
if (process.argv.includes('--self-test')) {
  console.log('\n[seikyu-paper --self-test] わざと壊して赤になるか');
  let sp = 0, sf = 0;
  const S = (n, fn) => { try { fn(); sp++; console.log('  ✓ ' + n); } catch (e) { sf++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };

  S('① 区分の表を消した紙は「税率ごとの区分がある」検査に落ちる', () => {
    const bad = paperBad('noRates', sample());
    ok(!/class="rates"/.test(bad), '作り物なのに区分が残っている＝この検査が空振り');
    ok(/class="rates"/.test(PAPER.build(sample()).html), '本物に区分が無い');
  });

  S('② 番号(No.)の欄に登録番号を入れた紙は「別物として出す」検査に落ちる', () => {
    const bad = paperBad('mixNo', sample());
    ok(/No\.　T\d{13}/.test(bad), '作り物が壊れていない＝この検査が空振り');
    ok(!/No\.　T\d{13}/.test(PAPER.build(sample()).html), '本物が登録番号を番号の欄に出している');
  });

  S('④ ★金額を塗りつぶした箱に入れた紙は「枠なし」検査に落ちる（差し戻しの原因）', () => {
    const bad = paperBad('grandBox', sample());
    const badRule = (/\.grand\{([^}]*)\}/.exec(bad) || [])[1] || '';
    ok(/background/.test(badRule) && /border-radius/.test(badRule), '作り物が壊れていない＝この検査が空振り');
    const good = (/\.grand\{([^}]*)\}/.exec(PAPER.css()) || [])[1] || '';
    ok(!/background/.test(good) && !/border-radius/.test(good), '本物の金額が箱に入っている');
    // ★線は .grand ではなく .grand-v（金額のセル）に付く★（司さん 2026-08-16「金額の下までに」）
    const gv = (/\.grand td\.grand-v\{([^}]*)\}/.exec(PAPER.css()) || [])[1] || '';
    ok(/border-bottom/.test(gv), '本物の金額の下に線が無い');
    ok(!/border-bottom/.test(good), '本物の線が紙の幅いっぱいに戻っている');
  });

  S('③ 文の箱を flex にした紙は「flex/grid を使わない」検査に落ちる', () => {
    const bad = paperBad('flex', sample());
    ok(/display:flex/.test(bad), '作り物が壊れていない＝この検査が空振り');
    ok(!/display\s*:\s*(flex|grid|inline-flex|inline-grid)/.test(PAPER.css()), '本物のCSSに flex/grid がある');
  });

  console.log('\n[self-test] ' + sp + ' passed, ' + sf + ' failed');
  if (sf) process.exit(1);
}

/* ── 本体 ──────────────────────────────────────────────────────── */
console.log('\n[請求書 自作テンプレ std1（紙）]');
const S1 = sample();
const B1 = PAPER.build(S1);
const H1 = B1.html;
const flat = (s) => s.replace(/\s+/g, '');

T('★1枚の完成したHTMLで返る（そのまま新しい窓に書ける）', () => {
  ok(/^<!DOCTYPE html>/.test(H1), 'DOCTYPE が無い');
  ok(/<html lang="ja">/.test(H1), 'html タグが無い');
  ok(/<style>/.test(H1), '見た目が入っていない（別ファイルを読むと刷る時に間に合わない）');
  eq(B1.templateId, 'std1');
});

T('★紙だけ＝アプリの画面が1バイトも入っていない', () => {
  ['botnav', 'appbar', 'b-issue', 'scr-list', 'seg-b', 'finput'].forEach((x) => {
    ok(!new RegExp(x).test(H1), '画面の部品が紙に混ざっている: ' + x);
  });
  ok(!/<script/i.test(H1), '紙に script が入っている');
});

T('★税率ごとの区分が、計算した区分の数だけ出る', () => {
  ok(/class="rates"/.test(H1), '区分の表が無い');
  const n = (H1.match(/% 対象<\/th>/g) || []).length;
  eq(n, S1.tax.byRate.length, '区分の行数');
  ok(/消費税の対象外/.test(H1), '対象外の行が出ていない');
  // 区分の税額が紙の上に実額で出ている
  S1.tax.byRate.forEach((b) => {
    ok(flat(H1).includes(PAPER.yen(b.tax)), '区分 ' + b.pct + '% の消費税 ' + b.tax + ' が紙に無い');
  });
});

T('★登録番号(T+13桁)と番号(No.)は別の欄に出す', () => {
  ok(/No\.　202609-001/.test(H1), '番号が出ていない（No.　＋全角スペース）');
  ok(!/No\.　T\d{13}/.test(H1), '番号の欄に登録番号が出ている');
  ok(/登録番号 T1234567890123/.test(H1), '自社の登録番号が出ていない');
});

T('★合計＝税抜＋消費税 が紙の上でも一致する', () => {
  const t = S1.tax;
  eq(t.subtotal + t.taxTotal, t.grandTotal);
  ok(flat(H1).includes(PAPER.yen(t.grandTotal)), '合計が紙に無い');
  ok(flat(H1).includes(PAPER.yen(t.subtotal)), '小計が紙に無い');
});

T('★発行済みは「写しの宛先」で刷る（マスタを直しても紙は変わらない）', () => {
  const at = '2026-09-30T00:00:00.000Z';
  const snap = DOC.snapshotOf({
    at, partner: { id: 'pt1', data: { name: '写しの名前 株式会社', keisho: '様', addr: '写しの住所' } },
    org: { data: { yago: '写しの自社' } }, tax: S1.tax, templateId: 'std1',
  });
  const h = PAPER.build({ inv: S1.inv, tax: S1.tax, partner: snap.partner, org: snap.org }).html;
  ok(/写しの名前 株式会社/.test(h), '写しの名前で刷られていない');
  ok(!/藤原建設/.test(h), 'マスタの名前が混ざっている');
  ok(/写しの自社/.test(h), '写しの自社情報が出ていない');
});

T('★敬称は hub が保存している keisho も読む（御中に化けない）', () => {
  eq(PAPER.honorOf({ keisho: '様' }), '様');
  eq(PAPER.honorOf({ honor: '御中' }), '御中');
  eq(PAPER.honorOf({ honor: '様', keisho: '御中' }), '様', 'honor が優先されていない');
  eq(PAPER.honorOf({ keisho: '（なし）' }), '', '「（なし）」が紙に出ている');
  ok(/様/.test(PAPER.build(sample({ partner: { name: 'A社', keisho: '様' } })).html), 'keisho の「様」が紙に出ていない');
});

T('★取れなかったを空欄にしない（相手・自社・番号）', () => {
  const h = PAPER.build({ inv: { doc_type: 'invoice', no: '', issue_ymd: '', tax_mode: 'exclusive', data: {} }, tax: S1.tax, partner: {}, org: {} }).html;
  ok(/（取引先が未選択）/.test(h), '宛先が空欄になっている');
  ok(/（自社情報が未入力）/.test(h), '自社が空欄になっている');
  ok(/No.　（未採番）/.test(h), '番号が空欄になっている');
  ok(/（未入力）/.test(h), '請求日が空欄になっている');
});

T('★明細0行で空の表を出さない（何も無いと分かる文を出す）', () => {
  const empty = TAX.compute({ lines: [], taxMode: 'exclusive', rounding: 'floor' });
  const h = PAPER.build({ inv: { doc_type: 'invoice', no: 'X', issue_ymd: '2026-09-30', tax_mode: 'exclusive', data: {} }, tax: empty, partner: { name: 'A' }, org: {} }).html;
  ok(/明細がまだ1行もありません/.test(h), '空の表が出ている');
  ok(/区分はまだありません/.test(h), '空の区分が出ている');
});

T('★支払期限は決めていなければ出さない（勝手な期限を作らない）', () => {
  const h = PAPER.build({ inv: { doc_type: 'invoice', no: 'X', issue_ymd: '2026-09-30', due_ymd: '', tax_mode: 'exclusive', data: {} }, tax: S1.tax, partner: { name: 'A' }, org: {} }).html;
  ok(!/お支払期限/.test(h), '決めていないのに期限の欄が出ている');
  ok(/お支払期限/.test(H1), '決めてあるのに期限が出ていない');
});

T('見積書は見出しと呼び方が変わる', () => {
  const h = PAPER.build(sample({ inv: Object.assign({}, S1.inv, { doc_type: 'quote' }) })).html;
  ok(/見　積　書/.test(h), '見出しが請求書のまま');
  ok(/ご見積金額（税込）/.test(h), '金額の呼び方が請求書のまま');
  ok(/下記の通り御見積申し上げます。/.test(h), '挨拶が請求書のまま');
  ok(/見積日　/.test(h), '日付の呼び方が請求書のまま');
});

T('金額は桁区切り・マイナスは頭に付く・数でない物は0にしない', () => {
  eq(PAPER.comma(142660), '142,660');
  eq(PAPER.comma(-142660), '-142,660');
  eq(PAPER.comma(0), '0');
  eq(PAPER.yen('abc'), '—', '数でない物が0になっている');
  eq(PAPER.jpDate('2026-09-30'), '2026年9月30日');
  eq(PAPER.jpDate('2026/09/30'), '', '読めない日付が通っている');
});

T('★文字はそのまま埋め込まない（HTMLとして壊れる／差し込まれる）', () => {
  const h = PAPER.build(sample({ partner: { name: '<script>alert(1)</script>' } })).html;
  ok(!/<script>alert/.test(h), '取引先名の中のタグがそのまま出ている');
  ok(/&lt;script&gt;/.test(h), 'エスケープされていない');
});

/* ── ⑥ ★紙に焼き付けてよい型は「法律」だけ★ ─────────────────────────
 * ★2026-08-10 方向の訂正（指示役）★
 *   いったん「代行請求の言葉10個が紙に無ければ赤」という見張りを入れましたが、★外しました★。
 *   理由: 代行請求は ★源泉なし・繰越なし・非課税なし・1税率★ ＝ 一番 単純な1業種の紙です。
 *   それを「正」として錠を掛けると、★複雑な業種の客が全部 落ちます★
 *   （士業＝源泉の行が要る／掛け売り＝繰越が要る／不動産＝非課税が要る）。
 *   代行請求は ★見本（1例）★であって、写す相手ではない。
 *
 *   だから ここで縛るのは次の2つだけ:
 *     ① ★法定の記載事項（国税庁 適格請求書）★ … 業種に関係なく必ず要る＝焼き付けてよい唯一の型
 *     ② ★客に読めない言い方を出さない★     … 言葉の good/bad ではなく「意味が通じない」を止める
 *   言い回し（御請求金額／No.　／挨拶文／和暦／¥／ページ送りの言葉）は ★出せる★ままにし、
 *   ★出さなければ赤、はやめました★。業種ごとに変えられる余地を残すためです。 */

/* ★客に読めない言い方（出たら赤）★
   「うちの語彙に無い」ではなく「読んだ人が意味を取り違える」物だけを止める。 */
const UNREADABLE = [
  { w: '外税／消費税込み', why: '外税なのか税込なのか、読んだ人には分からない（相反する言葉が並んでいる）' },
  { w: '外税/消費税込み', why: '同上' },
  { w: 'undefined', why: 'プログラムの穴がそのまま紙に出ている' },
  { w: 'NaN', why: '数にならなかった物がそのまま紙に出ている' },
  { w: '[object', why: '中身ではなく入れ物の名前が紙に出ている' },
];

T('★客に読めない言い方を紙に出さない（言葉の好き嫌いではなく、意味が通じない物を止める）', () => {
  UNREADABLE.forEach((x) => ok(H1.indexOf(x.w) < 0, '読めない言い方が出ている「' + x.w + '」＝' + x.why));
});

/* ★法定の記載事項（国税庁 適格請求書等保存方式）＝業種に関係なく必ず要る6つ★
   ここは ★焼き付けてよい唯一の型★。列を自由にしても、様式を替えても、必ず残る。
     ① 発行する側の名称と ★登録番号★
     ② 取引年月日
     ③ 取引の内容（★軽減税率の対象である旨★）
     ④ 税率ごとに区分して合計した対価の額と ★適用税率★
     ⑤ 税率ごとに区分した ★消費税額★
     ⑥ 受け取る側の名称 */
T('★法定6項目が、列を自由にしても・様式を替えても紙に残る', () => {
  // わざと「税率の列も品名の列も消した」並びで刷る＝会社が列を削っても法定は残るか。
  // ★内容は「行き先」が持つ（列名が品名である必要は無い＝代行なら行き先が取引の内容）★
  const cols = { items: ['日付', '行き先', '金額'], widths: {}, aligns: {} };
  const lines = [
    { name: '運転代行', amount: 10000, rate: STD, extra: { 日付: '9/3', 行き先: '今治→松山（運転代行）' } },
    { name: 'お弁当代', amount: 1000, rate: RED, extra: { 日付: '9/4', 行き先: 'お弁当代（軽減税率）' } },
  ];
  const t = TAX.compute({ lines, taxMode: 'exclusive', rounding: 'floor' });
  for (const id of ['std1', 'elegant']) {
    const h = PAPER.build({
      inv: { doc_type: 'invoice', no: 'X-1', issue_ymd: '2026-09-30', tax_mode: 'exclusive', template_id: id, data: {} },
      tax: t, cols, partner: S1.partner, org: S1.org,
    }).html;
    const f = h.replace(/\s+/g, '');
    ok(h.indexOf('株式会社ゼロアクト') >= 0, id + ' ①発行する側の名称が無い');
    ok(h.indexOf('T1234567890123') >= 0, id + ' ①登録番号が無い');
    ok(/2026.9.30|令和8年9月30日/.test(h), id + ' ②取引年月日が無い');
    ok(h.indexOf('今治→松山（運転代行）') >= 0 && h.indexOf('お弁当代（軽減税率）') >= 0, id + ' ③取引の内容が無い');
    // ④⑤ 税率ごとの対象額・適用税率・消費税額（★列を消しても（内訳）が必ず出す★）
    t.byRate.forEach((b) => {
      ok(h.indexOf(String(b.pct) + '% 対象') >= 0, id + ' ④適用税率 ' + b.pct + '% の区分が無い');
      ok(f.indexOf(PAPER.yen(b.base).replace(/\s/g, '')) >= 0, id + ' ④' + b.pct + '% の対象額が無い');
      ok(f.indexOf(PAPER.yen(b.tax).replace(/\s/g, '')) >= 0, id + ' ⑤' + b.pct + '% の消費税額が無い');
    });
    ok(t.byRate.length >= 2, '軽減税率の行が混ざっていない＝この検査が空振り');
    ok(h.indexOf('藤原建設株式会社') >= 0, id + ' ⑥受け取る側の名称が無い');
  }
});

T('★法定6項目の見張りが空振りしていない（1つ抜いたら赤になる）', () => {
  // 登録番号を空にした紙は ①に落ちる
  const h = PAPER.build(sample({ org: Object.assign({}, S1.org, { invoiceNo: '' }) })).html;
  ok(h.indexOf('T1234567890123') < 0, '作り物が壊れていない＝この検査が空振り');
  ok(H1.indexOf('T1234567890123') >= 0, '本物に登録番号が無い');
});

T('★御請求金額は「枠なし＋★金額の下だけ★に線」（塗りつぶした箱に入れない）', () => {
  const css = PAPER.css();
  const rule = (/\.grand\{([^}]*)\}/.exec(css) || [])[1] || '';
  const val = (/\.grand-v\{([^}]*)\}/.exec(css) || [])[1] || '';
  ok(rule, '.grand の指定が無い');
  ok(!/background/.test(rule), '★金額が塗りつぶしの箱に入っている★: ' + rule);
  ok(!/border-radius/.test(rule), '★金額が角丸の箱に入っている★');
  ok(!/border\s*:\s*1px solid/.test(rule), '金額が枠で囲まれている');
  /* ★線は金額の下だけ★（司さん 2026-08-16）＝紙の幅いっぱいに引かない */
  ok(!/border-bottom/.test(rule), '★線が紙の幅いっぱいに引かれている★: ' + rule);
  ok(/border-bottom\s*:/.test(val), '★金額の下に線が無い★: ' + val);
  /* ★線は ラベルの左端 → 金額の右端まで 1本★（途中から始めない・紙の端まで伸ばさない） */
  const lab = (/\.grand th\.grand-l\{([^}]*)\}/.exec(css) || [])[1] || '';
  ok(/border-bottom\s*:/.test(lab), '★ラベルの下に線が無い（線が途中から始まって見える）★: ' + lab);
  const rest = (/\.grand-x\{([^}]*)\}/.exec(css) || [])[1] || '';
  ok(!/border-bottom/.test(rest), '★線が金額の右へ伸びている（紙の端まで引いている）★: ' + rest);
  ok(/<table class="grand">/.test(H1), '★表で組んでいない（flex は文が縦に割れる）★');
  ok(/<td class="grand-x">/.test(H1), '★金額の右の余りが無い＝線が右へ伸びる★');
});

T('★お振込先・備考も箱で囲まない（うちは囲まない）', () => {
  const rule = (/\.note\{([^}]*)\}/.exec(PAPER.css()) || [])[1] || '';
  ok(!/background|border-radius|border\s*:\s*1px/.test(rule), '振込先・備考が箱に入っている: ' + rule);
  ok(!/class="note-box"/.test(H1), '古い箱の書き方が残っている');
});

/* 2026-08-11 実機で発生：共有マスタの「お振込先」に 物 が入っていて、
   紙に ★[object Object]★ と刷られた。客に渡る紙なので、読めない物は出さない。 */
T('★紙に [object Object] を刷らない（読めない物は出さない）', () => {
  [{ name: '伊予銀行', no: '1234567' }, ['伊予銀行', '普通'], {}].forEach((bad, i) => {
    const h = PAPER.build(sample({ org: Object.assign({}, sample().org, { bank: bad }) })).html;
    ok(!/\[object Object\]/.test(h), i + ': 紙に [object Object] が出ている');
    ok(!/お振込先/.test(h), i + ': 中身の無い「お振込先」の見出しだけ出ている');
  });
  const inv = Object.assign({}, sample().inv);
  inv.data = Object.assign({}, inv.data, { memo: { a: 1 } });
  const h2 = PAPER.build(sample({ inv })).html;
  ok(!/\[object Object\]/.test(h2), '備考に [object Object] が出ている');
  // ★ちゃんとした文字列は今までどおり出る（消しすぎない）
  //   ★口座番号は <span> で包む★ ので、タグを外した「人が読む字」で見る。
  const flatH1 = H1.replace(/<[^>]+>/g, '');
  ok(/伊予銀行 今治支店 普通 1234567/.test(flatH1), '文字列の振込先まで消している');
});

/* ★⑧ 振込先＝客が一番 使う情報★（司さん 2026-08-16「目立たない」） */
T('★★振込先は枠で囲って 口座番号を大きく等幅にする（白黒でも分かる）★★', () => {
  const h = PAPER.build(sample()).html;
  ok(/class="note note-bank"/.test(h), '★振込先が ただの文のまま（目立たない）★');
  ok(/<span class="bank-no">1234567<\/span>/.test(h), '★口座番号を大きくしていない★');
  /* ★名義は最初から次の行★（司さん 2026-08-16）
     ＝長い名義が「ド）ゼロア／クト」のように 中途半端な所で折れるのを避ける。 */
  const bankOf = (v) => {
    const b = PAPER.build(Object.assign({}, sample(), { org: Object.assign({}, sample().org, { bank: v }) })).html;
    return (/<div class="note-b note-bb">([\s\S]*?)<\/div>/.exec(b) || [])[1] || '';
  };
  const long = bankOf('三菱UFJ銀行　丸の内中央支店　当座　1234567　カ）ゼロアクトコーポレーションジャパン');
  ok(/<\/span><br><span class="bank-nm">カ）/.test(long), '★名義が同じ行に続いている（中途半端に折れる）★: ' + long);
  eq((long.match(/<br>/g) || []).length, 1, '★改行が増えている★: ' + long);
  /* ★塗りは字の幅に合わせる／長い銀行名でも1行目を折らない★（司さん 2026-08-16）
     ・箱＝display:table（中身なりの幅）＝★字の右に大きな空きを作らない★
     ・足元は table-layout:auto ＋（内訳）は中身なり＝★残り幅は全部 振込先に回る★
     実測（2026-08-16 Chromium）：
       ふつう「伊予銀行 今治支店 普通 4160657 ド）ゼロアクト」→ 箱 234px（前は左欄いっぱい約400px）
       長い  「三菱UFJ信託銀行 みなとみらいランドマークタワー支店 当座 12345678 …」
             → 箱 454px・★1行目は1行のまま★・紙からはみ出さない・A4 1枚のまま */
  const cssB = PAPER.css();
  const ruleB = (sel) => { const i = cssB.indexOf(sel + '{'); return i < 0 ? null : cssB.slice(i + sel.length + 1, cssB.indexOf('}', i)); };
  ok(/display:table/.test(ruleB('.note-bank') || ''),
    '★箱が中身なりの幅でない（字の右に空きが出る）★: ' + ruleB('.note-bank'));
  ok(!/max-width/.test(ruleB('.note-bank') || ''),
    '★箱に max-width があると 長い銀行名で1行目が折れる★: ' + ruleB('.note-bank'));
  ok(/width:auto/.test(ruleB('.foot-l') || ''), '★左の幅を % で固定している（長い銀行名が折れる）★');
  ok(/width:1%/.test(ruleB('.foot-r') || ''), '★（内訳）が中身なりでない（左に幅が回らない）★');
  ok(/table-layout:auto/.test(ruleB('.foot') || ''), '足元が fixed のまま（幅を配り直せない）');
  /* ★塗った箱は 字の周りに余白を取る★（司さん 2026-08-16「余白が無いと逆に見にくい」）
     ★display:table は border-collapse を継承する★＝足元の表（collapse）の中では
     ★padding が丸ごと無視される★（実測：枠と字の間が 1px しか無かった）。 */
  const bankRule = ruleB('.note-bank') || '';
  ok(/border-collapse:separate/.test(bankRule),
    '★collapse を継承したまま＝箱の余白が消える★: ' + bankRule);
  const pad = /padding:\s*([\d.]+)mm\s+([\d.]+)mm/.exec(bankRule);
  ok(pad, '箱に余白の指定が無い: ' + bankRule);
  ok(Number(pad[1]) >= 2 && Number(pad[2]) >= 3,
    '★箱の余白が狭い（字が枠に貼り付く）★: ' + pad[0]);

  const noName = bankOf('伊予銀行　今治支店　普通　4160657');
  ok(!/<br>/.test(noName), '★名義が無いのに改行している★: ' + noName);
  const own = bankOf('伊予銀行 今治支店 普通 4160657\nカ）ゼロアクト');
  ok(/<br><span class="bank-nm">カ）/.test(own), '★会社が入れた改行を無視している★: ' + own);
  const css = PAPER.css();
  const box = (/\.note-bank\{([^}]*)\}/.exec(css) || [])[1] || '';
  ok(/border:[^;]*solid/.test(box), '★枠が無い（白黒コピーで箱が消える）★: ' + box);
  ok(/background:/.test(box), '薄い塗りが無い');
  const no = (/\.bank-no\{([^}]*)\}/.exec(css) || [])[1] || '';
  const pt = (r) => Number((/font-size:\s*([\d.]+)pt/.exec(r) || [])[1] || 0);
  const body = pt((/\.note-b\{([^}]*)\}/.exec(css) || [])[1] || '');
  ok(pt(no) > body, '★口座番号が本文と同じ大きさ（一番 読みたい所なのに）★ '
    + pt(no) + ' vs ' + body);
  ok(/DM Mono|monospace/.test(no), '口座番号が等幅でない');
  /* ★紙の中で一番 大きい数字は「ご請求金額」のまま★（口座番号に食われない） */
  const grand = pt((/\.grand-v\{([^}]*)\}/.exec(css) || [])[1] || '');
  ok(grand > pt(no), '★口座番号が 請求金額より大きい（主役が入れ替わる）★');
});

/* ★② 線は「上」に統一★（司さん 2026-08-16「明細の合計だけ下に線」） */
/* ★紙の中の線は1種類★（司さん 2026-08-16「明細の合計の濃い上線はダサい／他と統一」）
   前は 薄い罫 0.7pt/1px と 濃い緑 0.9pt/1.2pt が混ざっていて、
   ★合計の線だけ 濃くて太い★＝1か所だけ作法が違って見えた。 */
/* ★紙の中の表は3つとも同じ作法★（司さん 2026-08-16「行がずれとる」）
   明細・控除は「見出し＝薄い地・罫なし／本文＝下罫線」だったのに、
   ★（内訳）だけ 見出しにも下罫線★で、見出し行だけ作りが違って見えた。
   実測（2026-08-16 Chromium）：直した後は 3つとも
     見出しの地 rgb(242,242,242)／見出しの罫 0px／見出しの字 11.33px・700／
     本文の罫 0.5px／左右の余白 4.54px（＝1.2mm）が一致。 */
T('★★紙の中の表は3つとも同じ作法（見出しの地・罫・余白）★★', () => {
  const css = PAPER.css();
  const ruleOf = (sel) => { const i = css.indexOf(sel + '{'); return i < 0 ? null : css.slice(i + sel.length + 1, css.indexOf('}', i)); };
  const heads = ['.items th', '.ded-hd th,.ded-hd td', '.rates thead th'];
  const got = heads.map((sel) => {
    const r = ruleOf(sel) || '';
    return { sel,
      地: (/background:\s*([^;]+)/.exec(r) || [])[1],
      罫: /border:0/.test(r) ? 'なし' : (/border-bottom:\s*([^;]+)/.exec(r) || [])[1] || '?',
      字: (/font-size:\s*([^;]+)/.exec(r) || [])[1],
      余白: (/padding:\s*([^;]+)/.exec(r) || [])[1] };
  });
  got.forEach((g) => ok(g.地, g.sel + ' の見出しに地が無い'));
  ok(got.every((g) => g.地 === got[0].地), '★見出しの地が表ごとに違う★: ' + JSON.stringify(got));
  ok(got.every((g) => g.罫 === 'なし'), '★見出しに罫を引いている表がある（本文と作りが違って見える）★: ' + JSON.stringify(got));
  ok(got.every((g) => g.字 === got[0].字), '★見出しの字の大きさが表ごとに違う★: ' + JSON.stringify(got));
  // 本文は3つとも「下罫線」
  const bodies = ['.items td', '.ded th', '.rates td'];
  bodies.forEach((sel) => ok(/border-bottom/.test(ruleOf(sel) || ''), sel + ' の本文に下罫線が無い'));
});

/* ★（内訳）も 明細と同じ寸法で読ませる★（司さん 2026-08-16
   「ごちゃごちゃ小さくて見にくい／行のズレを直せ／余白を取れ」）
   実測（Chromium 2026-08-16）：
     直す前 … 字 9pt・行 22px・幅は auto で毎回動く（親を中身なりにしたら 50px まで潰れた）
     直した後 … ★字 9.5pt・行 24px（明細と同じ）・幅 70mm 固定・列のずれ 0.0px★ */
/* ★どの業種でも成り立つ紙にする★（司さん 2026-08-16「どの業種にも対応するんやろが」）
   ★うちの実物32枚は全部 10% の1種類だけ★（実測：軽減8%・非課税・対象外は0枚）＝
   ★見本は1例であって「正」ではない★。軽減税率（飲食料品）・非課税（家賃・保険料）・
   対象外（立替金）が混ざる会社は必ず在るので、区分が増えても崩れない事を紙で確かめる。 */
T('★★区分が増えても紙が崩れない（軽減8%・非課税・対象外）★★', () => {
  const mk = (lines) => {
    const t = TAX.compute({ lines, taxMode: 'exclusive', rounding: 'floor' });
    ok(t.ok, '計算が通らない: ' + (t.errors || []).join(','));
    return { t, h: PAPER.build({ inv: { doc_type: 'invoice', no: 'X', issue_ymd: '2026-09-30', tax_mode: 'exclusive', data: {} },
      tax: t, partner: S1.partner, org: S1.org }).html };
  };
  const all = mk([
    { name: '工事代金', amount: 66500, rate: STD },
    { name: 'お弁当代（軽減税率）', amount: 3000, rate: RED },
    { name: '駐車場の賃料', amount: 30000, rate: 0, nontax: true },
    { name: '立替金', amount: 5000, rate: 0 },
  ]);
  /* ★非課税と対象外は別の行★（同じ0でも意味が違う）
     ★紙にはこの2つのうち 対象外しか出ていなかった★（Excel には両方 出ていた）
     ＝不動産・保険の会社の紙で 非課税の区分が消えていた（2026-08-16 実測で発見）。 */
  ok(/<th>非課税<\/th>/.test(all.h), '★紙の（内訳）に非課税の行が無い（不動産・保険で消える）★');
  ok(/<th>消費税の対象外<\/th>/.test(all.h), '紙の（内訳）に対象外の行が無い');
  ok(/8% 対象/.test(all.h) && /10% 対象/.test(all.h), '軽減税率の区分が出ていない');
  // 区分の数だけ行が出る（見出しの1行を除く）
  const bodyRows = (all.h.match(/<tbody>([\s\S]*?)<\/tbody>/g) || [])
    .map((x) => (x.match(/<tr/g) || []).length);
  ok(bodyRows.length >= 1, '（内訳）の中身が無い');
  // ★1種類だけの紙でも 区分は必ず出る（法定④⑤）★
  const one = mk([{ name: '工事', amount: 10000, rate: STD }]);
  ok(/10% 対象/.test(one.h), '★1種類の紙で税率の区分が消えている（適格請求書の要件）★');
  ok(/class="rates"/.test(one.h), '1種類の紙に（内訳）の表が無い');
});

/* ★区分が増えたら 載る行数を減らす★（司さん 2026-08-16「どの業種にも対応する」）
   紙は A4 固定なので、（内訳）が伸びた分を放っておくと ★黙って切れる★。
   実測（2026-08-16 Chromium）：
     （内訳）の高さ ＝ 区分1で48px／1区分ごとに +24.5px
     区分3までは 振込先の箱（109px）の方が高い＝★行数に影響しない★
     ★区分6＋明細12行で 52px はみ出した★（＝切れた）→ ここで止める。 */
/* ★複数ページになった時の決まり★（司さん 2026-08-16「複数ページになったらどうするんど」）
   見本＝代行請求 invoice-pdf.js：1ページ＝A4固定・各ページに宛名/自社・"1 / 3" のページ番号・
   途中は「このページの小計」＋「次ページへ続く」・最後に合計。
   ★1枚だけ抜けても気づける★ように 全体の枚数を必ず出す。 */
T('★★複数ページの決まり（何枚のうち何枚目・宛名は全ページ・締めは最後だけ）★★', () => {
  const mk = (n) => {
    const lines = Array.from({ length: n }, (_, i) => ({ name: '工事 ' + (i + 1), amount: 9500, rate: STD }));
    const t = TAX.compute({ lines, taxMode: 'exclusive', rounding: 'floor' });
    return PAPER.build({ inv: { doc_type: 'invoice', no: '202607-001', issue_ymd: '2026-07-21', data: {} },
      tax: t, partner: S1.partner, org: S1.org, deduct: 100, deductLines: [{ name: 'a', amount: 100 }] });
  };
  const one = mk(3);
  eq(one.pages, 1, '3行で2枚になっている');
  ok(!/class="pageno"/.test(one.html), '★1枚しかないのにページ番号を出している★');

  /* ★途中の紙には控除も締めも無い＝もっと載る★ので、26行でも2枚（司さん 2026-08-16）。
     枚数そのものではなく ★複数ページになる★ことだけを前提にする。 */
  const many = mk(60);
  ok(many.pages >= 3, '60行で3枚以上にならない: ' + many.pages);
  const sheets = many.html.split('class="sheet"').slice(1);
  eq(sheets.length, many.pages, '刷った枚数と数えた枚数が違う');
  sheets.forEach((p, i) => {
    const flat = p.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    // ★何枚のうち何枚目か★（1枚 抜けても気づける）
    ok(flat.indexOf((i + 1) + ' / ' + many.pages + ' ページ') >= 0,
      '★' + (i + 1) + '枚目に「◯ / ◯ ページ」が無い（抜けに気づけない）★: ' + flat.slice(0, 80));
    // ★どの紙にも 宛名・番号・登録番号★（1枚だけ持って行っても誰宛か分かる）
    ok(/藤原建設株式会社/.test(flat), (i + 1) + '枚目に宛名が無い');
    ok(/202607-001/.test(flat), (i + 1) + '枚目に請求番号が無い');
    ok(/T1234567890123/.test(flat), (i + 1) + '枚目に登録番号が無い');
    const last = (i === sheets.length - 1);
    // ★締め・控除・振込先・（内訳）は最後の1枚だけ★（途中に出すと二重に見える）
    eq(/請求額/.test(flat), last, (i + 1) + '枚目の締めの出し方が違う');
    eq(/お振込先/.test(flat), last, (i + 1) + '枚目の振込先の出し方が違う');
    eq(/控除計/.test(flat), last, (i + 1) + '枚目の控除の出し方が違う');
    // ★途中の紙は「このページの小計」と「次ページへ続く」★
    eq(/次ページへ続く/.test(flat), !last, (i + 1) + '枚目の「続く」の出し方が違う');
    /* ★表の中の合計行は「そのページの合計」★（司さん 2026-08-16）
       ＝複数ページなら ★最後の紙も「このページの小計」★（全体の合計は締めに出す）。 */
    ok(/このページの小計/.test(flat), (i + 1) + '枚目に「このページの小計」が無い');
    // ★ご請求金額は1枚目だけ★（各ページに出すと総額が何度も出て迷う）
    /* ★ご請求金額は「客が振り込む時に見る紙」＝最後の1枚だけ★
       見本＝代行請求 invoice-pdf.js:777「単ページのみ上部に御請求金額」＝
       複数ページの時は1枚目に出さない。 */
    eq(/ご請求金額/.test(flat), last, (i + 1) + '枚目の「ご請求金額」の出し方が違う');
  });
});

T('★★区分が増えたら1枚に載る行数を減らす（黙って切らない）★★', () => {
  const M = PAPER.maxRowsOf;
  eq(M(true, 1), PAPER.PAPER_ROWS_DED, '区分1で行数が減っている');
  eq(M(true, 3), PAPER.PAPER_ROWS_DED, '★区分3までは減らさない（実測：内訳が振込先より低い）★');
  eq(M(true, 4), PAPER.PAPER_ROWS_DED - 1, '★区分4で1行 減っていない★');
  eq(M(true, 6), PAPER.PAPER_ROWS_DED - 3, '★区分6で3行 減っていない★');
  eq(M(false, 6), PAPER.PAPER_ROWS - 3, '控除なしの紙で減っていない');
  ok(M(true, 99) >= 1, '★区分が極端に多い時に 0行や負の数にしている★');
  // ★数える所は1か所★（紙も画面も同じ数）
  const t = TAX.compute({ lines: [
    { name: 'a', amount: 1000, rate: STD }, { name: 'b', amount: 1000, rate: RED },
    { name: 'c', amount: 1000, rate: 0, nontax: true }, { name: 'd', amount: 1000, rate: 0 },
  ], taxMode: 'exclusive', rounding: 'floor' });
  eq(PAPER.rateRowsOf(t), 4, '区分の数え方が違う');
  eq(PAPER.frameRowsOf({}, { deduct: 1, rateRows: 4 }), PAPER.PAPER_ROWS_DED - 1,
    '★枠を決める所に 区分の数が効いていない★');
});

T('★★（内訳）は明細と同じ寸法（字・行の高さ・余白）で、列の幅が動かない★★', () => {
  const css = PAPER.css();
  const ruleOf = (sel) => { const i = css.indexOf(sel + '{'); return i < 0 ? null : css.slice(i + sel.length + 1, css.indexOf('}', i)); };
  const rates = ruleOf('.rates') || '', items = ruleOf('.items') || '';
  const fs = (r) => (/font-size:\s*([^;]+)/.exec(r) || [])[1];
  eq(fs(rates), fs(items), '★（内訳）だけ字が小さい★: ' + fs(rates) + ' vs ' + fs(items));
  ok(/table-layout:fixed/.test(rates), '★列の幅が毎回 動く（見出しと中身がずれて見える）★: ' + rates);
  ok(/width:\s*\d+mm/.test(rates), '★幅が実寸で決まっていない（親のマス次第で潰れる）★: ' + rates);
  const th = ruleOf('.rates th') || '', td = ruleOf('.rates td') || '';
  const itd = ruleOf('.items td') || '';
  const pad = (r) => (/padding:\s*([^;]+)/.exec(r) || [])[1];
  // ★line-height を掴まないよう 行頭か ; の直後だけ見る★
  const hgt = (r) => (/(?:^|;)height:\s*([^;]+)/.exec(r) || [])[1];
  eq(pad(th), pad(itd), '★（内訳）の余白が明細と違う★: ' + pad(th) + ' vs ' + pad(itd));
  eq(pad(td), pad(itd), '（内訳）の数の余白が明細と違う');
  eq(hgt(th), hgt(itd), '★（内訳）の行の高さが明細と違う（行がずれて見える）★');
  ok(/<colgroup>/.test(PAPER.build(sample()).html), '★列の幅を決める colgroup が無い★');
});

T('★★紙の線は1種類（太さも濃さも1つ）★★', () => {
  const css = PAPER.css();
  const found = {};
  for (const m of css.matchAll(/border(?:-top|-bottom|-left|-right)?\s*:\s*([^;}]+)/g)) {
    const v = m[1].trim();
    if (/^0(px)?$/.test(v) || /^none$/.test(v) || /transparent/.test(v)) continue;
    const w = (/([\d.]+)(pt|px)/.exec(v) || [])[0] || '(既定)';
    const c = (/#[0-9a-fA-F]{3,6}/.exec(v) || [])[0] || '(色なし)';
    found[w + ' ' + c.toUpperCase()] = (found[w + ' ' + c.toUpperCase()] || 0) + 1;
  }
  const kinds = Object.keys(found);
  eq(kinds.length, 1, '★紙の中に線が ' + kinds.length + ' 種類ある（1種類にそろえる）★: '
    + JSON.stringify(found));
});

T('★★線の向きが揃っている（合計の線は上・表そのものに下線を引かない）★★', () => {
  const css = PAPER.css();
  const items = (/\.items\{([^}]*)\}/.exec(css) || [])[1] || '';
  ok(!/border-bottom/.test(items), '★表そのものに下線が残っている（合計行だけ上下に線が付く）★: ' + items);
  const sum = (/\.items tfoot \.r-sum th,\.items tfoot \.r-sum td\{([^}]*)\}/.exec(css) || [])[1] || '';
  ok(/border-top/.test(sum) && !/border-bottom:[^0]/.test(sum), '合計行の線が上でない: ' + sum);
  /* 締めの行・ブロックの合計も「上」
     ★正規表現を組み立てない★（記号の書き分けで自分が事故った 2026-08-15）＝素直に探す */
  const ruleOf = (sel) => {
    const i = css.indexOf(sel + '{');
    if (i < 0) return null;
    return css.slice(i + sel.length + 1, css.indexOf('}', i));
  };
  for (const sel of ['.sums-net th,.sums-net td', '.bsum th', '.sums-mid th,.sums-mid td']) {
    const r = ruleOf(sel);
    ok(r !== null, sel + ' の指定が無い');
    ok(!/border-bottom/.test(r), '★' + sel + ' が下線で締めている（1か所だけ作法が違う）★: ' + r);
  }
});

/* ★紙でも「前回が無い」と「入金が読めていない」を作り分ける★
   初回に 前回請求額 — ／ 入金額 — の表を出すと、受け取った人には
   「読めなかった」のか「元から無い」のか分からない（2026-08-11 検査で発生）。 */
/* 2026-08-11：carryBlock() は書かれていたのに ★1度も呼ばれていなかった★。
   関数の中身の検査は緑、lib も緑、それでも紙には1行も出ない。
   ＝「作った物が組み立てに並んでいるか」を機械で見る。 */
T('★紙の部品が、作られただけで並んでいない物が無い', () => {
  const raw = fs.readFileSync(path.join(ROOT, 'seikyu/lib/seikyu-paper.js'), 'utf8');
  /* ★コメントを落としてから数える★
     コメントに「carryBlock() は…」と書いてあるだけで数が1増え、
     本当は呼ばれていないのに緑になる（この検査自身が空振りしていた）。 */
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  const defined = [...src.matchAll(/function\s+(\w+Block)\s*\(/g)].map((m) => m[1]);
  ok(defined.length >= 5, '紙の部品が見つからない（数え方が壊れている）: ' + defined.join(','));
  defined.forEach((fn) => {
    const calls = src.split(fn + '(').length - 1;   // 定義の1回＋呼び出しの回数
    ok(calls >= 2, '★' + fn + '() は作られただけで紙に並んでいない★');
  });
});

T('★繰越：初回は1行だけ言う（空の表を出さない・「未確認」と書かない）', () => {
  const CARRY = require_(path.join(ROOT, 'seikyu/lib/seikyu-carry.js'));
  const c = CARRY.compute({ thisTotal: 110000, prev: null, receipts: [] });
  eq(c.state, 'first');
  const h = PAPER.build(sample({ carry: c })).html;
  ok(/前回の請求はありません/.test(h), '初回だと言っていない');
  ok(!/前回請求額/.test(h), '初回なのに空の繰越の表を出している');
  ok(!/未確認/.test(h), '★初回なのに「未確認」と書いている★');
});

T('★繰越：入金が読めていない時は「未確認」と刷る（0や — にしない）', () => {
  const CARRY = require_(path.join(ROOT, 'seikyu/lib/seikyu-carry.js'));
  const c = CARRY.compute({ thisTotal: 110000, prev: { id: 'p1', no: 'CARRY-001', totals: { grandTotal: 50000 } }, receipts: null });
  eq(c.state, 'unknown');
  const h = PAPER.build(sample({ carry: c })).html;
  ok(/前回請求額/.test(h), '繰越の表が出ていない');
  ok(/（未確認）/.test(h), '「未確認」と刷っていない');
  ok(!/入金額<\/th><td>0</.test(h), '★読めていないのに 0 と刷っている★');
  ok(!/前回の請求はありません/.test(h), '前回があるのに「ありません」と刷っている');
});

T('★繰越：読めた時は実額（前回50,000−入金20,000＝繰越30,000）', () => {
  const CARRY = require_(path.join(ROOT, 'seikyu/lib/seikyu-carry.js'));
  const c = CARRY.compute({
    thisTotal: 110000,
    prev: { id: 'p1', no: 'CARRY-001', totals: { grandTotal: 50000 } },
    receipts: [{ invoice_id: 'p1', amount: 20000 }],
  });
  const h = PAPER.build(sample({ carry: c })).html;
  ok(flat(h).includes(PAPER.yen(30000)), '繰越額が紙に無い');
  ok(flat(h).includes(PAPER.yen(140000)), '合計請求額（繰越30,000＋今回110,000）が紙に無い');
  ok(!/未確認/.test(h), '読めているのに「未確認」と刷っている');
});

T('★小計・消費税・合計は枠なし、合計の上に線', () => {
  const css = PAPER.css();
  const td = (/\.sums td\{([^}]*)\}/.exec(css) || [])[1] || '';
  ok(/border\s*:\s*0/.test(td), '合計欄が罫線で囲まれている: ' + td);
  const g = (/\.sums-g td\{([^}]*)\}/.exec(css) || [])[1] || '';
  ok(/border-top\s*:\s*[\d.]+p?t?\s+solid/.test(g), '合計の上に線が無い');
});

T('★消費税のラベルは区分から作る（率の数字を書かない）', () => {
  const one = TAX.compute({ lines: [{ name: 'a', amount: 1000, rate: STD }], taxMode: 'exclusive', rounding: 'floor' });
  eq(PAPER.taxLabel(one, 'exclusive'), '消費税（' + STD + '%）');
  eq(PAPER.taxLabel(one, 'inclusive'), '消費税（' + STD + '%・内税）');
  const two = TAX.compute({ lines: [{ name: 'a', amount: 1000, rate: STD }, { name: 'b', amount: 1000, rate: RED }], taxMode: 'exclusive', rounding: 'floor' });
  eq(PAPER.taxLabel(two, 'exclusive'), '消費税');
  ok(/消費税（/.test(H1) || /消費税/.test(H1), '消費税のラベルが紙に無い');
});

T('★日付は和暦も出せる（既定は代行請求と同じ西暦）', () => {
  eq(PAPER.dateStr('2026-09-30', 'seireki'), '2026/9/30');
  eq(PAPER.dateStr('2026-09-30', 'reiwa'), '令和8年9月30日');
  eq(PAPER.dateStr('2026-09-30'), '2026/9/30', '既定が西暦でない');
  eq(PAPER.dateStr('2026/09/30', 'reiwa'), '', '読めない日付が通っている');
  const w = PAPER.build(sample({ inv: Object.assign({}, S1.inv, { data: Object.assign({}, S1.inv.data, { dateEra: 'reiwa' }) }) })).html;
  ok(/令和8年9月30日/.test(w), '和暦が出せていない');
});

T('★金額は ¥ 記号（invoice-pdf.js:156 と同じ）', () => {
  eq(PAPER.yen(142660), '¥142,660');
  eq(PAPER.yen(0), '¥0');
  eq(PAPER.yen(-1234), '¥-1,234');
  eq(PAPER.yen('abc'), '—', '数でない物が0になっている');
  // 表の中は ¥ を付けない（桁が詰まる）＝ invoice-pdf.js の comma() と同じ
  eq(PAPER.comma(142660), '142,660');
  eq(PAPER.comma(''), '');
});

T('★角印（会社の印）が紙に出る／入れていなければ出さない', () => {
  const seal = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
  const withSeal = PAPER.build(sample({ org: Object.assign({}, S1.org, { sealDataUrl: seal, sealSizeMm: 30 }) })).html;
  ok(/class="seal"/.test(withSeal), '印が紙に出ていない');
  ok(/width:30mm;height:30mm/.test(withSeal), '大きさが効いていない');
  ok(withSeal.indexOf(seal) >= 0, '印の画像が入っていない');
  // 入れていない会社の紙には出さない（空の枠を出さない）
  ok(!/class="seal"/.test(H1), '印を入れていないのに枠が出ている');
});

T('★角印の大きさは 10〜40mm に収める（紙からはみ出す印を作らない）', () => {
  eq(PAPER.sealMm(999), 40);
  eq(PAPER.sealMm(1), 10);
  eq(PAPER.sealMm(), 21, '既定が21mmでない');
  eq(PAPER.sealMm('abc'), 21, '数でない値が通っている');
  const h = PAPER.build(sample({ org: Object.assign({}, S1.org, { sealDataUrl: 'data:image/png;base64,iVBORw0KGgo=', sealSizeMm: 999 }) })).html;
  ok(/width:40mm/.test(h), '上限に収まっていない');
});

T('★角印は薄く重ねる（実物と同じ扱い・文字を隠し切らない）', () => {
  const rule = (/\.seal\{([^}]*)\}/.exec(PAPER.css()) || [])[1] || '';
  ok(/opacity\s*:\s*\.?9/.test(rule), '印が濃すぎる（下の文字が読めなくなる）: ' + rule);
  ok(/object-fit\s*:\s*contain/.test(rule), '印が歪む（縦横比を保っていない）');
});

/* ★件名の行は紙に出さない★（司さん 2026-08-16）
   紙の頭に「2026年6月分」と書いてあるのに、その下に「7月分 …」と出て
   ★同じ紙に2つの「◯月分」★が並んでいた（しかも前月と当月でズレて見える）。 */
T('★★明細の上に「件名」の行を出さない（頭の「◯月分」と二重になる）★★', () => {
  ok(!/9月分 運転代行ご利用料金/.test(H1), '★件名が紙に出ている（頭の月と二重）★');
  ok(!/ご請求の内訳/.test(H1), '★中身の無い見出し（ご請求の内訳）が残っている★');
  // 明細は「列の見出し」から始まる（実物32枚も 項目／金額 の見出しから始まっている）
  ok(/<table class="items"><thead>/.test(H1), '明細の列の見出しが無い');
  // ★件名そのものは 控えに残す★（紙に出さないだけ＝ファイル名などで使う）
  ok(S1.inv.data && S1.inv.data.subject, '見本の件名が消えている（検査の前提が壊れた）');
});

T('★明細が多い時は次の紙へ送る（黙って切らない・3つの言葉が出る）', () => {
  const many = [];
  for (let i = 0; i < 40; i++) many.push({ name: '行' + (i + 1), amount: 1000, rate: STD });
  const t = TAX.compute({ lines: many, taxMode: 'exclusive', rounding: 'floor' });
  const b = PAPER.build({ inv: S1.inv, tax: t, partner: S1.partner, org: S1.org });
  ok(b.pages > 1, '1枚に押し込めている: ' + b.pages);
  ok(/このページの小計/.test(b.html), '「このページの小計」が無い');
  ok(/次ページへ続く →/.test(b.html), '「次ページへ続く →」が無い');
  // ★何枚のうち何枚目か★（司さん 2026-08-16。前は「1ページ目」だけで枚数が分からなかった）
  ok(new RegExp('1 / ' + b.pages + ' ページ').test(b.html)
    && new RegExp('2 / ' + b.pages + ' ページ').test(b.html),
    '★「◯ / ◯ ページ」が無い（1枚 抜けても気づけない）★');
  // ★全部の行が どれかの紙に出ている（黙って落ちていない）
  for (let i = 0; i < many.length; i++) ok(b.html.indexOf('行' + (i + 1) + '<') >= 0, (i + 1) + '行目が紙から消えた');
  /* ★金額は 1枚目の頭と 最後の紙（振込先が在る紙）の2か所★（司さん 2026-08-16）
     ＝客は最後の紙を見て振り込むので、そこに金額が無いと 紙をめくり直す。
     （代行請求 invoice-pdf.js は multi の時 1ページ目に出さず 最後のサマリーに出す＝
       「最後の紙に金額が在る」点は同じ考え） */
  eq((b.html.match(/ご請求金額（税込）/g) || []).length, 1,
    '★複数ページなのに 金額が1枚目にも出ている（代行請求と同じ＝最後の1枚だけ）★');
  // 合計・振込先は最後の紙にだけ
  eq((b.html.match(/お振込先/g) || []).length, 1, 'お振込先が2枚以上に出ている');
  // ページの小計の合計＝全体の小計
  eq(PAPER.paginate(many).reduce((a, p) => a + p.length, 0), many.length, 'ページ分けで行が増減した');
});

/* ── ⑤ 文が縦に割れない書き方 ─────────────────────────────────── */
const CSS = PAPER.css();

T('★紙のCSSに flex/grid を1つも使わない（文が1文字ずつ縦に割れる前科の形）', () => {
  ok(!/display\s*:\s*(flex|inline-flex|grid|inline-grid)/.test(CSS), 'flex/grid が使われている');
  ok(!/display\s*:\s*(flex|grid)/.test(H1), '紙の中の style に flex/grid がある');
});

T('★文が入る箱は「折り返し可」で「最低幅」を持つ', () => {
  // 長い日本語が入りうる箱＝ここが潰れると1文字ずつ縦になる
  ['.lead-l', '.note-b'].forEach((sel) => {
    const rule = (new RegExp(sel.replace('.', '\\.') + '\\{([^}]*)\\}').exec(CSS) || [])[1];
    ok(rule, sel + ' の指定が無い');
    ok(/min-width\s*:\s*\d/.test(rule), sel + ' に最低幅が無い（箱が潰れる）');
    ok(/overflow-wrap\s*:\s*break-word/.test(rule), sel + ' に折り返しの指定が無い');
    ok(/word-break\s*:\s*normal/.test(rule), sel + ' の word-break が normal でない（break-all は1文字ずつ割れる）');
    ok(/display\s*:\s*block/.test(rule), sel + ' が block でない');
  });
});

T('★word-break:break-all を紙のどこにも使わない（日本語が1文字ずつ割れる）', () => {
  ok(!/word-break\s*:\s*break-all/.test(CSS), 'break-all が使われている');
});

T('★2段組み（宛先と自社）は表で作る＝幅が足りなくても文が縦に割れない', () => {
  ok(/<table class="party">/.test(H1), '2段組みが表になっていない');
  ok(/\.party-to\{[^}]*min-width\s*:\s*\d/.test(CSS), '宛先の欄に最低幅が無い');
  ok(/\.party-from\{[^}]*min-width\s*:\s*\d/.test(CSS), '自社の欄に最低幅が無い');
});

/* ★読ませる字は「薄い黒」★（司さん 2026-08-16「代行請求書アプリのように」）
   見本＝代行請求 invoice-pdf.js の役割分け（ink/muted/ruleHairline）。
   ★紙に「押せる物」は無い＝色で強弱を作らない。強弱は 大きさ と 太さ で作る。★ */
T('★★紙の字は薄い黒（色で強弱を作らない）／禁止色を使わない★★', () => {
  ok(!/#1A4A2E/i.test(CSS), '使ってはいけない濃い緑がある');
  const soft = (v) => {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(v);
    if (!m) return false;
    const [r, g, b] = [1, 2, 3].map((i) => parseInt(m[i], 16));
    return Math.max(r, g, b) - Math.min(r, g, b) <= 12;   // 無彩色（±12まで）
  };
  const inkish = ['#333333', '#6B6B6B', '#B0B0B0', '#F2F2F2'];
  inkish.forEach((c) => ok(new RegExp(c, 'i').test(CSS), c + ' が使われていない'));
  // ★本文・金額・見出しの字に 色を使っていない★
  for (const sel of ['.grand-v', '.items th', '.sums-net th,.sums-net td', '.bank-no', '.st']) {
    const i = CSS.indexOf(sel + '{');
    if (i < 0) continue;
    const rule = CSS.slice(i + sel.length + 1, CSS.indexOf('}', i));
    const col = /color:\s*(#[0-9a-fA-F]{6})/.exec(rule);
    if (col) ok(soft(col[1]), '★' + sel + ' の字に色が付いている★: ' + col[1]);
  }
});

T('★網羅：税率の組み合わせ×内外×丸め を全部刷って、区分の数と合計が紙と一致', () => {
  let n = 0;
  const sets = [
    [{ name: 'a', amount: 105, rate: STD }],
    [{ name: 'a', amount: 105, rate: RED }],
    [{ name: 'a', amount: 105, rate: 0 }],
    [{ name: 'a', amount: 105, rate: STD }, { name: 'b', amount: 1000, rate: RED }],
    [{ name: 'a', amount: 105, rate: STD }, { name: 'b', amount: 1000, rate: RED }, { name: 'c', amount: 500, rate: 0 }],
    [{ name: 'a', amount: -1100, rate: STD }],
  ];
  for (const lines of sets) {
    for (const mode of ['exclusive', 'inclusive']) {
      for (const rd of ['floor', 'ceil', 'round']) {
        const t = TAX.compute({ lines, taxMode: mode, rounding: rd });
        if (!t.ok) throw new Error('計算が通らない: ' + t.errors.join(','));
        const h = PAPER.build({ inv: { doc_type: 'invoice', no: 'X', issue_ymd: '2026-09-30', tax_mode: mode, data: {} }, tax: t, partner: { name: 'A' }, org: {} }).html;
        n++;
        const cnt = (h.match(/% 対象<\/th>/g) || []).length;
        if (cnt !== t.byRate.length) throw new Error('区分の数が違う: 紙' + cnt + ' / 計算' + t.byRate.length);
        if (!flat(h).includes(PAPER.yen(t.grandTotal))) throw new Error('合計が紙に無い: ' + t.grandTotal);
        if (/undefined|NaN|\[object/.test(h)) throw new Error('紙に undefined/NaN が出ている');
      }
    }
  }
  if (n < 30) throw new Error('組合せが少なすぎる（検査が空振り）: ' + n);
  console.log('     実測: ' + n + '通りを刷って矛盾0件');
});

/* ── ②（a）★領収書の紙★ ────────────────────────────────────────
   ★入金1行から出す紙★（棚を増やさない）。請求書とは出す物が違う:
     ・出す   … 領収日（＝入金日）／領収番号（請求番号＋枝番）／★受け取った額★／但し書き／
                「上記正に領収いたしました。」／印紙の注意（要る時だけ）
     ・出さない … 明細／税率ごとの内訳／お支払期限／繰越／源泉／お振込先
       （一部だけ受け取った紙に内訳を出すと ★按分＝嘘の数字★ になる） */
function receiptSample(rc, over) {
  return sample(Object.assign({
    docKind: 'receipt',
    receipt: Object.assign({ no: '202609-001-1', ymd: '2026-10-05', amount: 30000, method: '振込' }, rc || {}),
  }, over || {}));
}
const flatOf = (o) => PAPER.build(o).html.split('</head>')[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

T('★領収書は「領　収　書」で、日付は入金日・番号は枝番つき', () => {
  const f = flatOf(receiptSample());
  ok(/領\s*収\s*書/.test(f), '見出しが領収書でない: ' + f.slice(0, 80));
  ok(/領収日/.test(f), '「領収日」が無い（請求日のまま）');
  ok(!/請求日/.test(f), '★請求日が残っている★');
  ok(/202609-001-1/.test(f), '領収番号（枝番つき）が出ていない');
  ok(/上記正に領収いたしました/.test(f), '受け取った文言が無い');
  ok(/但し/.test(f), '但し書きが無い');
});

T('★★領収書に出るのは「受け取った額」（請求額ではない）★★', () => {
  // 請求は 137,900（sample の実額）だが、受け取ったのは 30,000
  const full = PAPER.build(sample());
  const grand = /（税込）\s*¥([\d,]+)/.exec(full.html.replace(/<[^>]+>/g, ' '));
  ok(grand, '請求書の金額が読めない');
  const f = flatOf(receiptSample({ amount: 30000 }));
  ok(/領収金額（税込） ¥30,000/.test(f), '★受け取った額が出ていない★: ' + f.slice(0, 200));
  ok(!f.includes(grand[1]), '★受け取っていない請求額が領収書に載っている★（' + grand[1] + '）');
});

T('★領収書は 明細・内訳・支払期限・振込先を出さない（按分＝嘘の数字を作らない）', () => {
  const f = flatOf(receiptSample());
  ok(!/（内訳）/.test(f), '★税率ごとの内訳が出ている（一部入金だと按分＝嘘になる）★');
  ok(!/運転代行 9月分/.test(f), '★明細が出ている★');
  ok(!/お支払期限/.test(f), '★もう受け取った紙に支払期限が出ている★');
  ok(!/お振込先/.test(f), '★もう受け取った紙に振込先が出ている★');
  ok(!/前回請求額/.test(f), '繰越が出ている');
});

/* ★国税庁 No.7124★ 消費税額等を区分して書けば、その分は「記載金額」に入らない。
   ★手計算★ 48,000＋4,800＝52,800 → 記載金額 48,000＝5万円未満＝★印紙の注意は出さない★
             同じ 52,800 を区分せず1行で書けば → 記載金額 52,800＝★注意を出す★ */
T('★★印紙の注意は「紙にどう書いてあるか」で変わる（No.7124・国税庁の例で固定）★★', () => {
  const sep = flatOf(receiptSample({ amount: 52800, taxTotal: 4800, taxSeparate: true }));
  ok(/税抜金額 ¥48,000/.test(sep), '税抜が出ていない: ' + sep.slice(-260));
  ok(/消費税額等 ¥4,800/.test(sep), '消費税額等を区分して書けていない');
  ok(/合計 ¥52,800/.test(sep), '合計が出ていない');
  ok(!/収入印紙/.test(sep), '★区分して書いてあるのに印紙の注意が出ている（No.7124を見ていない）★');

  const lump = flatOf(receiptSample({ amount: 52800, taxSeparate: false }));
  ok(/収入印紙/.test(lump), '★区分せず1行の52,800円で、印紙の注意が出ていない★');
  ok(!/税抜金額/.test(lump), '区分できないのに税抜を書いている（嘘の数字）');
});

T('★印紙の注意は要る時だけ／★いくらの印紙かは書かない★', () => {
  ok(!/収入印紙/.test(flatOf(receiptSample({ amount: 49999 }))), '5万円未満で注意が出ている');
  const on = flatOf(receiptSample({ amount: 50000 }));
  ok(/収入印紙/.test(on), '★5万円ちょうどで注意が出ていない★');
  ok(!/\d+円の(収入)?印紙/.test(on), '★印紙の額を書いている★');
  ok(/営業に関しない/.test(on), '非課税の例外を言っていない');
});

T('★但し書きは 件名 → 無ければ「請求書◯◯の代金として」（空欄で出さない）', () => {
  ok(/9月分 運転代行ご利用料金/.test(flatOf(receiptSample({ note: '9月分 運転代行ご利用料金' }))), '渡した但し書きが出ていない');
  const auto = flatOf(receiptSample());
  ok(/請求書 202609-001 の代金として/.test(auto), '★但し書きが空欄になっている★: ' + auto.slice(0, 200));
});

T('★領収書の中身が無いのに「領収書」の顔をしない（請求書に倒す）', () => {
  const f = flatOf(sample({ docKind: 'receipt' }));   // receipt を渡し忘れた形
  ok(/請\s*求\s*書/.test(f), '★中身が無いのに領収書として刷っている★');
});

T('★領収書の文も 1文字ずつ縦に割れない書き方（flex を使わない・最低幅を持つ）', () => {
  const CSS = PAPER.build(receiptSample()).html;
  for (const sel of ['.rc-but', '.rc-stamp']) {
    const rule = (new RegExp('\\' + sel + '\\{([^}]*)\\}').exec(CSS) || [])[1] || '';
    ok(rule, sel + ' の指定が無い');
    ok(!/display\s*:\s*flex/.test(rule), sel + ' が flex（文が縦に割れる）');
    ok(/overflow-wrap\s*:\s*break-word/.test(rule), sel + ' に折り返しの指定が無い');
  }
  const st = (/\.rc-stamp\{([^}]*)\}/.exec(CSS) || [])[1] || '';
  ok(/min-width\s*:\s*\d/.test(st), '.rc-stamp に最低幅が無い（縦帯になる）');
});

T('★領収書でも 角印は出る（会社の印は受取書にも押す）', () => {
  const seal = 'data:image/png;base64,iVBORw0KGgo=';
  const html = PAPER.build(receiptSample(null, { org: Object.assign({}, sample().org, { sealDataUrl: seal, sealSizeMm: 21 }) })).html;
  ok(html.indexOf(seal) >= 0, '角印が出ていない');
});


/* ── ★控除は紙にも出る★ ────────────────────────────────────────
   ★これを出し忘れると、画面は 281,260 なのに 紙は 292,600 と書く★
   ＝★請求している額と、紙に書いた額が食い違う★（2026-08-15 スクショで実際に見つけた）。
   ★実物★ 八木工業：266,000 ＋ 26,600 ＝ 292,600 − 弁当代 11,340 ＝ 281,260 */
T('★★控除を引いた「請求額」が紙に出る（頭の金額も引いたあと）★★', () => {
  const lines = [{ name: '工事代金', qty: 140, price: 1900, rate: STD }];
  const tax = TAX.compute({ lines, taxMode: 'exclusive', rounding: 'floor' });
  const h = PAPER.build(sample({
    inv: { doc_type: 'invoice', no: '202607-001', issue_ymd: '2026-07-21', tax_mode: 'exclusive', rounding: 'floor', data: {} },
    tax,
    deduct: 11340,
    deductLines: [{ name: '弁当代　矢原', amount: 11340 }],
  })).html;
  const flat = h.split('</head>')[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  ok(/¥266,000/.test(flat), '小計が出ていない');
  ok(/¥26,600/.test(flat), '消費税が出ていない');
  ok(/¥292,600/.test(flat), '合計（控除前）が出ていない');
  ok(/弁当代/.test(flat), '★何を引いたかが紙に無い（「控除」だけでは理由が分からない）★');
  ok(/-¥11,340/.test(flat), '★引いた額が紙に無い★: ' + flat.slice(-260));
  ok(/請求額/.test(flat), '★請求額の行が紙に無い★');
  ok(/¥281,260/.test(flat), '★実際に請求している額が紙に出ていない★');
  // ★紙の頭の金額も 引いたあと★（ここだけ控除前だと、頭と足元で食い違う）
  const head = /（税込）\s*¥([\d,]+)/.exec(flat);
  ok(head, '頭の金額が読めない');
  eq(head[1], '281,260', '★頭の金額が控除前のまま（足元と食い違う）★');
});

T('★控除が無い紙は 今までどおり（控除の行も請求額の行も出さない）', () => {
  const flat = PAPER.build(sample()).html.split('</head>')[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  ok(!/請求額/.test(flat), '控除が無いのに「請求額」の行が出ている');
  ok(!/-¥/.test(flat.replace(/-¥0\b/g, '')), '控除が無いのに引き算の行が出ている');
});

T('★控除で消費税は動かない（税の外で引く）', () => {
  const lines = [{ name: '工事代金', qty: 140, price: 1900, rate: STD }];
  const tax = TAX.compute({ lines, taxMode: 'exclusive', rounding: 'floor' });
  const withDed = PAPER.build(sample({ inv: { doc_type: 'invoice', no: 'X', issue_ymd: '2026-07-21', tax_mode: 'exclusive', rounding: 'floor', data: {} }, tax, deduct: 11340, deductLines: [{ name: '弁当代', amount: 11340 }] })).html;
  const noDed = PAPER.build(sample({ inv: { doc_type: 'invoice', no: 'X', issue_ymd: '2026-07-21', tax_mode: 'exclusive', rounding: 'floor', data: {} }, tax })).html;
  /* ★締めの所だけを見る★
     明細にも「消費税」の列が在るので、紙全体から拾うと ★列の値を掴んでしまう★
     （2026-08-15 実測：既定の列を消費税にした日に、この検査が拾い違えた）。 */
  const sumsOf = (h) => { const m = /<table class="sums">([\s\S]*?)<\/table>/.exec(h); return (m ? m[1] : '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '); };
  const taxOf = (h) => (/消費税[^¥]*¥([\d,]+)/.exec(sumsOf(h)) || [])[1];
  eq(taxOf(withDed), taxOf(noDed), '★控除を入れたら消費税が変わった（税の中で引いている）★');
});


/* ── ★項目が少なくても 紙の顔を同じにする★ ────────────────────────
   うちの実物が すでにそうなっている（実測 2026-08-15）:
     黒田空調 … 入っているのは6行／枠は12〜41行＝★30行★
     ENEOS   … 入っているのは2行／枠は★同じ30行★
     八木工業 … 控除の枠は E17:H20＝★4行★（1行しか使っていない）
   ★経理の人は「いつも同じ場所」を見る★。動くと毎回 探し直しになる。 */
function framed(n, over) {
  const lines = Array.from({ length: n }, (_, i) => ({ name: '品目' + (i + 1), qty: 1, unit: '式', amount: 1000, rate: STD }));
  const tax = TAX.compute({ lines, taxMode: 'exclusive', rounding: 'floor' });
  return PAPER.build(Object.assign({
    inv: { doc_type: 'invoice', no: '202607-001', issue_ymd: '2026-07-21', tax_mode: 'exclusive', rounding: 'floor', data: {} },
    tax,
    partner: { name: '八木工業 株式会社', keisho: '御中' },
    org: { yago: '合同会社ZEROact' },
    deduct: 11340, deductLines: [{ name: '弁当代　矢原', amount: 11340 }],
  }, over || {}));
}
/* ★差し引きを1件も持たない紙★（既定＝出さない） */
const NODED = { deduct: 0, deductLines: [] };
const rowsIn = (h) => (h.match(/<tr[\s>]/g) || []).length;
const blanksIn = (h) => (h.match(/class="r-blank"/g) || []).length;

T('★★明細が1行でも枠いっぱいでも、紙の行数が同じ（足りない行は空の枠で残す）★★', () => {
  const N = PAPER.PAPER_ROWS_DED;                 // ★既定の枠（差し引きを出す紙）★
  const a = framed(1).html, b = framed(N).html;
  eq(rowsIn(a), rowsIn(b), '★中身の本数で紙の行数が変わる（毎月 顔が変わる）★');
  // 空の枠で埋めている（詰めていない）
  eq(blanksIn(a) - blanksIn(b), N - 1, '空の枠の数が合わない（1行と' + N + '行の差は' + (N - 1) + '）');
  ok(blanksIn(a) > 0, '★空の枠が1つも無い＝詰めている★');
  // 差し引きを出さない紙でも同じ（枠の数だけ違う）
  const c = framed(1, NODED).html, d = framed(PAPER.PAPER_ROWS, NODED).html;
  eq(rowsIn(c), rowsIn(d), '★差し引きの無い紙で 顔が変わる★');
});

T('★空の枠にも罫線が残る（白黒コピーで消えない＝色ではなく濃さで作る）', () => {
  const css = PAPER.css();
  const blank = (/\.r-blank td,\.r-blank th\{([^}]*)\}/.exec(css) || [])[1] || '';
  ok(blank, '空の枠の指定が無い');
  ok(/color:transparent/.test(blank), '空の枠の字が消えていない');
  ok(!/border:\s*0/.test(blank) && !/border:\s*none/.test(blank), '★空の枠の罫線まで消している★');
  // 罫線そのものは 明細の td の指定が持っている（薄い色ではなく実線）
  ok(/\.items td\{[^}]*border/.test(css), '明細の罫線が無い');
});

T('★★枠ぴったりまで1枚・1行 増やすと2枚目（差し引き 有り／無し の両方）★★', () => {
  for (const [name, N, over] of [['差し引き有り', PAPER.PAPER_ROWS_DED, {}],
                                 ['差し引き無し', PAPER.PAPER_ROWS, NODED]]) {
    for (const n of [1, N - 1, N]) {
      const r = framed(n, over);
      eq(r.pages, 1, name + '・' + n + '行で ' + r.pages + 'ページになった');
    }
    const o = framed(N + 1, over);
    eq(o.pages, 2, '★' + name + '：枠を超えたのに次のページへ行かない★');
    ok(/次ページへ続く/.test(o.html), name + '：続きの案内が無い');
    ok(/このページの小計/.test(o.html), name + '：途中の小計が無い');
    /* ★同じ数字を2回 言わない★（小計は明細の箱が1回 出すだけ） */
    const p1 = o.html.split('class="sheet"')[1] || '';
    eq((p1.match(/このページの小計/g) || []).length, 1,
      name + '：★1ページ目に「このページの小計」が2つ出ている★');
  }
});

T('★続きの紙でも 数字は1回だけ（続きの案内は「続く」だけ言う）', () => {
  const o = framed(PAPER.PAPER_ROWS_DED + 1);
  const cont = (/<div class="cont">([\s\S]*?)<\/div>\s*<\/div>/.exec(o.html) || [])[1] || '';
  ok(/次ページへ続く/.test(cont), '「続く」が無い');
  ok(!/¥/.test(cont), '★続きの案内に金額を書いている（すぐ上と同じ数字）★: ' + cont);
  // ★2ページ目にも見出しが要る★（続きの紙だけ列の名前が無いと読めない）
  const p2 = o.html.split('class="sheet"')[2] || '';
  ok(/<thead>/.test(p2), '★2ページ目に明細の見出しが無い★');
});

/* ★A4 1枚に載る数は「測った数」＝勝手に上げたら赤★
   （2026-08-16 Chromium で1行ずつ26行まで総当たり：
     紙 A4 1123px − 上下の余白 75.6px ＝ ★使える高さ 1047px★
     足元 280px（控除あり）／222px（控除なし）
     → ★21行（控除なし・余り0）★／★10行（控除あり・余り0）★ が上限。
     ＋1行で −3px ＝ 足元に食い込む＝★紙は A4 固定なので黙って切れる★）
   ★紙に何かを足した日／詰めた日に この数は変わる★
     30/21/14 → 16/7 → 16/6 → 20/10 → 22/12（A4固定＋足元を下端に貼った）
     → 21/11（振込先の名義を必ず次の行に）→ ★21/10（箱に字の余白を入れた）★ */
T('★★既定の行数は「A4 1枚に収まると実測した数」から動かさない★★', () => {
  eq(PAPER.PAPER_ROWS, 18, '★控除なしの既定を測らずに変えた★');
  eq(PAPER.PAPER_ROWS_DED, 8, '★控除ありの既定を測らずに変えた★');
  eq(PAPER.DEDUCT_ROWS, 4, '★差し引きの枠（実物 八木＝4行）を変えた★');
  ok(PAPER.PAPER_ROWS > PAPER.PAPER_ROWS_DED,
    '★差し引きを出す紙の方が 明細を多く載せている（高さが足りなくなる）★');
});

T('★何枚になるかを画面に答えるのは 紙の lib（画面で数え直さない）', () => {
  eq(typeof PAPER.frameRowsOf, 'function', 'frameRowsOf が無い');
  eq(PAPER.frameRowsOf({}, {}), PAPER.PAPER_ROWS, '差し引き無しの既定が違う');
  eq(PAPER.frameRowsOf({}, { deduct: 100 }), PAPER.PAPER_ROWS_DED, '★控除を入れたのに枠が減っていない★');
  eq(PAPER.frameRowsOf({}, { paperRows: 8 }), 8, '会社が決めた行数が効いていない');
  /* ★物理の上限で頭打ち★＝紙は A4 固定なので、これ以上 載せると切れる。
     ★黙って切らない★＝ここで止めて 残りは2枚目に送る。 */
  eq(PAPER.frameRowsOf({}, { paperRows: 99 }), PAPER.PAPER_ROWS, '★上限を超えて載せようとしている（切れる）★');
  eq(PAPER.frameRowsOf({}, { paperRows: 99, deduct: 1 }), PAPER.PAPER_ROWS_DED, '★控除ありでも上限を超えている★');
  eq(PAPER.pagesOf(99, PAPER.frameRowsOf({}, { paperRows: 99 })), Math.ceil(99 / PAPER.PAPER_ROWS),
    '★入り切らない分を2枚目に送っていない★');
  eq(PAPER.pagesOf(PAPER.PAPER_ROWS, PAPER.PAPER_ROWS), 1, '枠ぴったりで2枚と言っている');
  eq(PAPER.pagesOf(PAPER.PAPER_ROWS + 1, PAPER.PAPER_ROWS), 2, '★はみ出しているのに1枚と言っている★');
  eq(PAPER.pagesOf(0, PAPER.PAPER_ROWS), 1, '明細0本で0枚と言っている');
  // ★紙が実際に刷る枚数と、画面に答える枚数が同じ★（別々に数えない）
  const n = PAPER.PAPER_ROWS_DED + 1;
  eq(PAPER.pagesOf(n, PAPER.frameRowsOf({}, { deduct: 100 })), framed(n).pages,
    '★画面に答える枚数と 実際に刷る枚数が違う★');
});

/* ★差し引きは 既定オフ★（司さん 2026-08-15「控除を使わない会社の方が多い」）
   ・0件のまま枠だけ出すのが一番 悪い（毎月 空の箱を見せられる）
   ・★1件でも入れたら 自動で出す★（入れたのに出ない事故を作らない）
   ・使わない紙は その高さを明細に回す＝★入る行が増える★ */
T('★★差し引きは既定オフ・1件でも入れたら自動で出る★★', () => {
  const off = framed(3, NODED).html;
  ok(!/控除/.test(off), '★控除0件なのに空の枠を出している★');
  ok(!/控除計/.test(off), '控除0件なのに控除計が出ている');
  const auto = framed(3, { deduct: 500, deductLines: [{ name: '立替', amount: 500 }] }).html;
  ok(/控除/.test(auto), '★控除を入れたのに紙に出ていない★');
  ok(/控除計/.test(auto), '控除を入れたのに控除計が無い');
  // 「出す」を会社が選べば 0件でも枠は出る（毎月おなじ顔にしたい会社向け）
  const on = framed(3, { deduct: 0, deductLines: [], showDeduct: true }).html;
  ok(/控除/.test(on), '★「出す」を選んでも出ない★');
  // ★出さない紙の方が 明細を多く載せられる★
  ok(blanksIn(off) > blanksIn(framed(3).html), '★差し引きを消しても入る行が増えていない★');
});

T('★★控除が読めない時は 請求額も数字にしない（引き忘れた紙を出さない）★★', () => {
  const h = framed(3, { deduct: null, deductLines: [{ name: '弁当代', amount: null }] }).html;
  const flat = h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  ok(/控除計 （未確認）/.test(flat), '控除計が（未確認）になっていない: ' + flat.slice(-300));
  ok(/請求額 （未確認）/.test(flat), '★控除が読めないのに請求額を数字で出している★');
  // 頭の金額も数字にしない
  ok(!/（税込） ¥/.test(flat) || /（税込） （未確認）/.test(flat), '★頭の金額が控除前の数字のまま★');
});

T('★控除計は1か所だけ（同じ物を2か所に出さない）', () => {
  const flat = framed(3).html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  eq((flat.match(/控除計/g) || []).length, 1, '★控除計が2か所に出ている★');
  eq((flat.match(/請求額/g) || []).length, 1, '請求額が2か所に出ている');
});

T('★① 明細 → ② 控除 → ③ 締め の順で紙に出る（給料明細と同じ作法）', () => {
  const h = framed(3).html.split('</head>')[1];
  const iItems = h.indexOf('class="items"');
  const iDed = h.indexOf('blk-ded');
  const iSum = h.indexOf('class="sums"');
  ok(iItems >= 0 && iDed >= 0 && iSum >= 0, '3つの箱が揃っていない');
  ok(iItems < iDed, '★明細より先に控除が出ている★');
  ok(iDed < iSum, '★控除より先に締めが出ている★');
});

T('★2カラムは「表」で組む（flex だと文が1文字ずつ縦に割れる）', () => {
  const css = PAPER.css();
  ok(/\.cols2\{[^}]*table-layout:fixed/.test(css), '2カラムが表で組まれていない');
  ok(!/display\s*:\s*(flex|grid|inline-flex|inline-grid)/.test(css), '紙のCSSに flex/grid がある');
  ok(/\.cols2>tbody>tr>td\{[^}]*vertical-align:top/.test(css), '★上ぞろえでない＝締めの位置が動く★');
  /* ★2カラムは選ぶ所から外した（司さん 2026-08-15）★＝呼べば出るが、既定は1カラム。 */
  ok(/<table class="cols2">/.test(framed(3, { layout: 'col2' }).html), '2カラムの表が出ていない');
  ok(!/<table class="cols2">/.test(framed(3).html), '★既定が2カラムのまま★');
});

/* ★締めの中の強さ★ 一番 下（実際に払う額）が一番 強い。
   ★合計を太字にして請求額を細字にすると、払う額の方が弱く見える★（2026-08-15 スクショで発見） */
T('★★締めの中で一番 強いのは「請求額」（途中の合計より弱くしない）★★', () => {
  const css = PAPER.css();
  const mid = (/\.sums-mid th,\.sums-mid td\{([^}]*)\}/.exec(css) || [])[1] || '';
  const net = (/\.sums-net th,\.sums-net td\{([^}]*)\}/.exec(css) || [])[1] || '';
  ok(net, '★請求額の行に指定が1つも無い（細字のまま）★');
  ok(/font-weight:700/.test(net), '請求額が太くない');
  ok(!/font-weight:700/.test(mid), '★途中の合計が請求額と同じ太さ（どっちを払うのか迷う）★');
  ok(/border-top/.test(net), '請求額の上に線が無い');
  // 大きさは変えない＝一番 大きい数字は頭の「ご請求金額」だけ
  ok(!/font-size/.test(net), '★締めの中で字を大きくしている（大きい数字が2つになる）★');
  /* ★どの行が最後かは紙ごとに違う★（控除あり＝請求額／控除なし＝合計／源泉あり＝差引）。
     ★最後の1行に印が付く★のを、3通りの紙で確かめる。 */
  const lastOf = (h) => {
    const t = (/<table class="sums">([\s\S]*?)<\/table>/.exec(h) || [])[1] || '';
    const trs = t.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
    return trs[trs.length - 1] || '';
  };
  const cnt = (h) => ((/<table class="sums">([\s\S]*?)<\/table>/.exec(h) || [])[1] || '').match(/sums-net/g) || [];
  const noDed = framed(3, NODED).html;
  ok(/sums-net/.test(lastOf(noDed)) && /合計/.test(lastOf(noDed)),
    '★差し引きの無い紙で「合計」が細字のまま（払う額が一番 弱い）★: ' + lastOf(noDed));
  const withDed = framed(3).html;
  ok(/sums-net/.test(lastOf(withDed)) && /請求額/.test(lastOf(withDed)), '控除ありの紙の最後が請求額でない');
  eq(cnt(noDed).length, 1, '★締めの中に強い行が2つ以上ある★');
  eq(cnt(withDed).length, 1, '★締めの中に強い行が2つ以上ある（控除あり）★');
});

/* ★恒等式★ ①の合計 ＋ 消費税 − ②の合計 ＝ 請求額（紙の上で必ず一致） */
/* ★恒等式★ ★紙に出た文字を足して確かめる★（中の値どうしで閉じない）
   締めの1本の筋道： 明細の合計 ＋ 消費税 − 控除 ＝ 請求額 */
function sumsOfPaper(html) {
  const t = (/<table class="sums">([\s\S]*?)<\/table>/.exec(html) || [])[1] || '';
  const out = {};
  for (const m of t.matchAll(/<tr[^>]*><th>([\s\S]*?)<\/th><td[^>]*>([\s\S]*?)<\/td><\/tr>/g)) {
    const k = m[1].replace(/<[^>]+>/g, '').trim();
    const v = m[2].replace(/<[^>]+>/g, '').trim();
    out[k] = /^-?¥[\d,]+$/.test(v) ? Number(v.replace(/[¥,]/g, '')) : v;
  }
  return out;
}
T('★★締めの筋道で 明細の合計＋消費税−控除 ＝ 請求額 が必ず一致する★★', () => {
  for (const n of [1, 5, PAPER.PAPER_ROWS_DED]) {
    const r = framed(n, { deduct: 300, deductLines: [{ name: '立替', amount: 300 }] });
    const S = sumsOfPaper(r.html);
    ok(typeof S['明細の合計'] === 'number', n + '行: 明細の合計が読めない（' + JSON.stringify(S) + '）');
    ok(typeof S['合計'] === 'number' && typeof S['控除'] === 'number' && typeof S['請求額'] === 'number',
      n + '行: 締めの数が読めない（' + JSON.stringify(S) + '）');
    const tx = S[Object.keys(S).find((k) => /^消費税/.test(k))];
    eq(S['明細の合計'] + tx, S['合計'], n + '行: ★明細の合計＋消費税 ≠ 合計★');
    eq(S['明細の合計'] + tx + S['控除'], S['請求額'], n + '行: ★紙の中で辻褄が合っていない★');
    ok(S['控除'] < 0, n + '行: 控除が引き算として出ていない');
  }
});

T('★★控除が0件の紙でも成り立つ（控除の行を出さない・合計＝請求額）★★', () => {
  for (const n of [1, 5, PAPER.PAPER_ROWS]) {
    const r = framed(n, NODED);
    const S = sumsOfPaper(r.html);
    const tx = S[Object.keys(S).find((k) => /^消費税/.test(k))];
    eq(S['明細の合計'] + tx, S['合計'], n + '行: ★控除の無い紙で辻褄が合っていない★');
    ok(!('控除' in S), n + '行: ★控除0件なのに 締めに控除の行を出している★');
    ok(!('請求額' in S), n + '行: ★合計と同じ数を 請求額として もう1回 出している★');
    ok(!/控除計/.test(r.html), n + '行: 控除が無いのに控除計が出ている');
  }
});

/* ★揃え★（司さん 2026-08-16「左揃えか中央か右かきっちりやれ」）
   ・字の列＝左そろえ ／ 数の列＝右そろえ（★見出しも中身も同じ★）
   ・表の外側の余白は1つ（EDGE）＝★どの表でも 数字の右端が同じ位置★
   実測（2026-08-16 Chromium）：直す前 →「10% 対象」だけ 27.9px 右にずれていた
                                直した後 → 数字の右端 7か所 0.0px ／（内訳）の左端 0.0px */
T('★★揃えを決めて守る（見出しも中身も同じ／表ごとに違う余白を作らない）★★', () => {
  const css = PAPER.css();
  const ruleOf = (sel) => { const i = css.indexOf(sel + '{'); return i < 0 ? null : css.slice(i + sel.length + 1, css.indexOf('}', i)); };
  ok(/text-align:left/.test(ruleOf('.rates .rt-l') || ''), '（内訳）の見出し「区分」が左そろえでない');
  ok(/text-align:right/.test(ruleOf('.rates .rt-r') || ''), '（内訳）の数の見出しが右そろえでない');
  ok(/text-align:left/.test(ruleOf('.rates tbody th') || ''),
    '★中身の1列目が中央寄せのまま（見出しとずれる）★: ' + ruleOf('.rates tbody th'));
  ok(/text-align:right/.test(ruleOf('.rates td') || ''), '（内訳）の数が右そろえでない');
  const pads = ['.sums th', '.sums td', '.rates td', '.bsum th'].map((sel) => {
    const r = ruleOf(sel) || '';
    const m = /padding:\s*[\d.]+mm\s+([\d.]+mm)/.exec(r);
    return m ? m[1] : null;
  });
  ok(pads.every((x) => x && x === pads[0]),
    '★表ごとに外側の余白が違う（数字の右端が揃わない）★: ' + JSON.stringify(pads));
});

/* ★③ 言葉は給料明細にそろえる（支給／控除）★（司さん 2026-08-15）
   ★人に見せる字に「差し引く」が0件★＝タグを外した本文から数える（コメントは数えない）。 */
T('★★紙に「差し引く」と書かない（給料明細と同じ「控除」で通す）★★', () => {
  for (const over of [{}, NODED, { deduct: null, deductLines: [{ name: 'x', amount: null }] }]) {
    const body = framed(3, over).html.split('</head>')[1] || '';
    const text = body.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ');
    ok(!/差し引/.test(text), '★紙に「差し引く」が出ている★: '
      + (text.match(/.{0,12}差し引.{0,12}/) || [''])[0]);
  }
  ok(/控除/.test(framed(3).html), '控除という言葉が紙から消えている');
});

/* ★② 合計行は「列の真下」★（司さん 2026-08-15：何の合計か分からなかった） */
T('★★表の中の合計行が 金額の列と消費税の列の真下に来る★★', () => {
  const r = framed(3);
  const foot = (/<tfoot>([\s\S]*?)<\/tfoot>/.exec(r.html) || [])[1] || '';
  ok(foot, '★表の中に合計行が無い（表の外に出したままだと列とずれる）★');
  const head = [...(/<thead><tr>([\s\S]*?)<\/tr><\/thead>/.exec(r.html) || ['', ''])[1]
    .matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim());
  const cells = [...foot.matchAll(/<(th|td)([^>]*)>([\s\S]*?)<\/(?:th|td)>/g)]
    .map((m) => ({ tag: m[1], span: Number((/colspan="(\d+)"/.exec(m[2]) || [])[1] || 1), t: m[3].replace(/<[^>]+>/g, '').trim() }));
  // ★列の番号をたどって、金額の列に金額の合計・消費税の列に消費税の合計が来ているか★
  let col = 0; const at = {};
  for (const c of cells) { at[col] = c.t; col += c.span; }
  eq(col, head.length, '★合計行の桁数が 見出しの列数と違う（縦がずれる）★ ' + col + ' vs ' + head.length);
  const iAmount = head.indexOf('金額'), iTax = head.indexOf('消費税');
  ok(iAmount >= 0 && iTax >= 0, '見本の様式に 金額／消費税 の列が無い');
  const S = sumsOfPaper(r.html);
  const tx = S[Object.keys(S).find((k) => /^消費税/.test(k))];
  eq(at[iAmount], S['明細の合計'].toLocaleString('ja-JP'), '★金額の列の真下が 金額の合計でない★: ' + JSON.stringify(at));
  eq(at[iTax], tx.toLocaleString('ja-JP'), '★消費税の列の真下が 消費税の合計でない★: ' + JSON.stringify(at));
  eq(at[0], '明細の合計', '★何の合計か 書いていない★');
  /* ★合計行に見出しの地色を引き継がない★（th なので放っておくと左半分だけ塗られる） */
  const css = PAPER.css();
  const sumRule = (/\.items tfoot \.r-sum th,\.items tfoot \.r-sum td\{([^}]*)\}/.exec(css) || [])[1] || '';
  ok(/background:transparent/.test(sumRule), '★合計行に見出しの地色が乗っている★: ' + sumRule);
  // ★列を足しても崩れない★（知らない列を足す）
  const withCol = framed(3, { cols: { items: ['#', '品名・内容', '行き先', '数量', '単位', '単価', '金額', '消費税'] } });
  const f2 = (/<tfoot>([\s\S]*?)<\/tfoot>/.exec(withCol.html) || [])[1] || '';
  const c2 = [...f2.matchAll(/<(th|td)([^>]*)>([\s\S]*?)<\/(?:th|td)>/g)]
    .reduce((a, m) => a + Number((/colspan="(\d+)"/.exec(m[2]) || [])[1] || 1), 0);
  eq(c2, 8, '★列を足したら合計行の桁がずれた★');
});



/* ── ★給料明細と同じ作法（kyuyo/js/render.js を読んで合わせた・2026-08-15）★ ──
   ・「支 給」「控 除」＝★見出しの下に線★／足りない行は高さの決まった空行
   ・★各ブロックの下にそのブロックの合計★（支給合計／控除合計）
   ・★大きい数字は紙の頭に1つだけ★（差引支給額）＝ブロックの合計は小さい
   請求書では 支給→★ご請求の内訳★／控除→★差し引く★ に読み替える。 */
T('★★左にも右にも「見出しの行」が在る（1行目が同じ高さから始まる）★★', () => {
  const h = framed(3).html;
  /* ★明細の上の「件名」は消した★ので、ブロックの見出しは控除だけ。
     代わりに ★どちらも「列の見出しの行」から始まる★＝1行目の高さが揃う。 */
  eq((h.match(/<div class="st">/g) || []).length, 1, '★ブロックの見出しが増減している★');
  ok(/<table class="items"><thead>/.test(h), '★明細に列の見出しが無い★');
  ok(/<tr class="ded-hd">/.test(h), '★控除に見出しの行が無い＝明細と1行ずれる★');
  const st = (/\.st\{([^}]*)\}/.exec(PAPER.css()) || [])[1] || '';
  ok(/border-bottom/.test(st), '見出しの下に線が無い');
});

T('★★左（明細）と右（控除）の行の高さが同じ（罫線がずれない）★★', () => {
  const css = PAPER.css();
  const items = (/\.items td\{([^}]*)\}/.exec(css) || [])[1] || '';
  const dedTh = (/\.ded th\{([^}]*)\}/.exec(css) || [])[1] || '';
  const dedTd = (/\.ded td\{([^}]*)\}/.exec(css) || [])[1] || '';
  const hOf = (r) => (/height:\s*([\d.]+mm)/.exec(r) || [])[1];
  ok(hOf(items), '明細の行に高さの決めが無い');
  eq(hOf(dedTh), hOf(items), '★右の行の高さが左と違う（罫線がずれる）★');
  eq(hOf(dedTd), hOf(items), '★右の行の高さが左と違う（罫線がずれる）★');
  // 余白も同じ（高さが同じでも余白が違うと1行ずつずれていく）
  const pOf = (r) => (/padding:\s*([^;]+);/.exec(r) || [])[1];
  eq(pOf(dedTh), pOf(items), '右の余白が左と違う');
});

T('★★それぞれのブロックの下に そのブロックの合計が出る（給料明細と同じ）★★', () => {
  const flat = framed(3).html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  ok(/明細の合計/.test(flat), '★左ブロックの合計が無い★');
  ok(/控除計/.test(flat), '★右ブロックの合計が無い★');
  ok(/請求額/.test(flat), '締めの請求額が無い');
  // ★順番★ 明細の合計 → 控除計 → 請求額
  ok(flat.indexOf('明細の合計') < flat.indexOf('控除計'), '明細の合計より先に控除計が出ている');
  ok(flat.indexOf('控除計') < flat.indexOf('請求額'), '控除計より先に請求額が出ている');
  /* ★「ブロックの合計」と「払う額までの筋道」は役目が違う★（司さん 2026-08-15）
     ・表の中の合計行（列の真下）＝そのブロックの足し算
     ・締めの1本の筋道（明細の合計→消費税→合計→控除→請求額）＝払う額の出し方
     給料明細も「控除合計」と「差引支給額の計算」の両方が在る。★2回 出るのは決めごと。★ */
  eq((flat.match(/控除計/g) || []).length, 1, '控除計が2か所に出ている（ブロックの合計は1つ）');
  eq((flat.match(/明細の合計/g) || []).length, 2, '★表の中の合計行と 締めの筋道で 2回 出る決め★');
});

T('★★紙の中で一番 大きい金額は1つだけ＝客が払う額★★', () => {
  const css = PAPER.css();
  const px = (r) => Number((/font-size:\s*([\d.]+)pt/.exec(r) || [])[1] || 0);
  const grand = px((/\.grand-v\{([^}]*)\}/.exec(css) || [])[1] || '');   // 頭の「ご請求金額」
  ok(grand > 0, '頭の金額の大きさが読めない');
  /* CSSから「その決めごと」の中身を取り出す。
     ★正規表現を組み立てないで素直に探す★（記号の書き分けで自分が事故った 2026-08-15） */
  const ruleOf = (sel) => {
    const i = css.indexOf(sel + '{');
    if (i < 0) return '';
    return css.slice(i + sel.length + 1, css.indexOf('}', i));
  };
  for (const sel of ['.sums-g td', '.sums-net td', '.sums-mid th,.sums-mid td', '.bsum td']) {
    const v = px(ruleOf(sel));
    ok(v < grand, '★' + sel + ' が頭の金額と同じくらい大きい（大きい数字が2つになる）★: ' + v + ' vs ' + grand);
  }
  /* 頭に出るのは ★引いたあとの額★（客が払う額）
     ★控除は合計より小さい額にする★（大きいと請求額がマイナスになり、この検査の狙いから外れる） */
  const flat = framed(3, { deduct: 300, deductLines: [{ name: '立替', amount: 300 }] })
    .html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const head = /（税込）\s*¥([\d,]+)/.exec(flat);
  const bill = /請求額\s*¥([\d,]+)/.exec(flat);
  ok(head && bill, '頭の金額か請求額が読めない');
  eq(head[1], bill[1], '★頭の大きい金額が、客が払う額と違う★');
});

T('★★1カラム版が出る（上から ①明細 → ②差し引く → ③締め）★★', () => {
  const one = framed(3, { layout: 'col1' }).html;
  ok(!/<table class="cols2">/.test(one), '★1カラムなのに2カラムの表で組んでいる★');
  const flat = one.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  ok(flat.indexOf('明細の合計') < flat.indexOf('控除計'), '1カラムの順番が違う（①→②）');
  ok(flat.indexOf('控除計') < flat.indexOf('請求額'), '1カラムの順番が違う（②→③）');
  // ★2カラムと同じ順番★（探す場所が変わらない）
  const two = framed(3, { layout: 'col2' }).html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const orderOf = (t) => ['明細の合計', '控除計', '請求額'].map((k) => t.indexOf(k));
  const a1 = orderOf(flat), a2 = orderOf(two);
  ok(a1[0] < a1[1] && a1[1] < a1[2], '1カラムの順番が崩れている');
  ok(a2[0] < a2[1] && a2[1] < a2[2], '2カラムの順番が崩れている');
  // 数は同じ（形が変わっても金額は1円も動かない）
  const money = (t) => (t.match(/¥[\d,]+/g) || []).join(',');
  eq(money(flat), money(two), '★形を変えたら金額が動いた★');
});

T('★知らない形を渡されたら1カラムに倒す（黙って壊れない）', () => {
  for (const bad of ['col3', '', 'ほげ', null, 0, 99]) {
    const h = framed(3, { layout: bad }).html;
    ok(!/<table class="cols2">/.test(h), '知らない形（' + bad + '）で2カラムになった');
    ok(/class="items"/.test(h) && /請求額/.test(h), '知らない形（' + bad + '）で崩れている');
  }
});

/* ★複数ページの時は 最後の紙にも「ご請求金額」を出す★（司さん 2026-08-16
   「最後に振込先あるならそこにご請求金額のせるべきでは？」）
   客は ★振込先が在る最後の紙★ を見て振り込む。金額が1枚目にしか無いと
   ★紙をめくり直す（そして間違える）★。
   ★1枚で収まる紙は 頭に1回だけ★（同じ紙に2回は出さない）。 */
/* ★宛先の下に住所は出さない★（司さん 2026-08-16「要らんくないか？」）
   ・実物32枚とも ★0枚★（機械で数えた：御中/様 の下3行に住所らしき字が在るか）
   ・適格請求書の記載事項は ★受け取る側の「名称」★ まで（住所は要らない）
   ★データは消していない★＝取引先マスタの住所はそのまま。 */
T('★★宛先の下に住所を刷らない（名前と敬称・担当者だけ）★★', () => {
  const h = PAPER.build({ inv: { doc_type: 'invoice', no: 'X', issue_ymd: '2026-09-30', data: {} },
    tax: S1.tax, org: S1.org,
    partner: { name: '八木工業 株式会社', keisho: '御中', zip: '794-0000', addr: '愛媛県今治市1-2-3', person: '山田' } }).html;
  ok(/八木工業 株式会社/.test(h), '宛名が消えている');
  ok(/御中/.test(h), '敬称が消えている');
  ok(/山田/.test(h), '★担当者まで消している（誰宛かが分からなくなる）★');
  ok(!/愛媛県今治市1-2-3/.test(h), '★宛先の下に住所が出ている★');
  ok(!/794-0000/.test(h), '★宛先の下に郵便番号が出ている★');
  /* ★自社の住所は出す★（発行する側の情報＝紙に要る） */
  ok(/愛媛県今治市4-5-6/.test(h) || /今治市/.test(h.split('party-from')[1] || ''), '自社の住所まで消している');
});

/* ★途中のページには もっと明細が載る★（司さん 2026-08-16
   「控除を最後に持ってくるなら 余白のぶん 項目を増やしてページを減らせ」）
   途中の紙には 控除も締めも振込先も（内訳）も無い＝その高さが丸ごと明細に使える。
   実測（Chromium 2026-08-16）：★途中の紙は30行★（31行で −25px）
   ＝最後の紙（控除あり8行）の3.75倍。前は全ページ8行で刷っていて紙が無駄に増えていた。 */
T('★★途中の紙は目一杯 載せて 紙を増やさない（最後の紙だけ控除と締めの分 少なく）★★', () => {
  const mk = (n, ded) => {
    const lines = Array.from({ length: n }, (_, i) => ({ name: '工事 ' + (i + 1), amount: 9500, rate: STD }));
    const t = TAX.compute({ lines, taxMode: 'exclusive', rounding: 'floor' });
    const dl = Array.from({ length: ded || 0 }, (_, i) => ({ name: 'd' + i, amount: 1000 }));
    return PAPER.build({ inv: { doc_type: 'invoice', no: 'X', issue_ymd: '2026-07-21', data: {} },
      tax: t, partner: S1.partner, org: Object.assign({}, S1.org, { bank: '伊予銀行 普通 1234567 カ）ゼロアクト' }),
      deduct: dl.reduce((a, x) => a + x.amount, 0), deductLines: dl });
  };
  /* ★同じ本数でも 前より紙が減る★（全ページ同じ枠で刷っていた時＝ceil(n / 最後の枠)） */
  const cases = [[26, 1], [40, 1], [60, 0], [100, 1]];
  cases.forEach(([n, ded]) => {
    const b = mk(n, ded);
    const last = PAPER.maxRowsOf(!!ded, 1, ded);
    const old = Math.ceil(n / last);          // 昔の分け方（全ページ同じ枠）
    ok(b.pages < old, '★' + n + '行：紙が減っていない（' + b.pages + '枚／昔なら' + old + '枚）★');
    /* ★1行も落ちていない★ */
    for (let i = 1; i <= n; i++) ok(b.html.indexOf('工事 ' + i + '<') >= 0, n + '行：' + i + '行目が消えた');
  });
  /* ★分け方の決め★＝最後の紙は「最後の枠」ぶん、途中は同じ本数（均等） */
  const plan = (n, mid, last) => PAPER.planPages ? PAPER.planPages(n, mid, last) : null;
  if (plan) {
    eq(plan(8, 30, 8).length, 1, '8行で2枚になっている');
    const p2 = plan(26, 30, 8);
    eq(p2.length, 2, '26行の枚数が違う: ' + JSON.stringify(p2));
    eq(p2[p2.length - 1], 8, '★最後の紙が「最後の枠」ぶんでない★: ' + JSON.stringify(p2));
    eq(p2.reduce((a, x) => a + x, 0), 26, '★分けたら本数が変わった（行が落ちる）★');
    const p3 = plan(100, 30, 8);
    eq(p3.reduce((a, x) => a + x, 0), 100, '100行で本数が変わった');
    ok(p3.slice(0, -1).every((x) => x <= 30), '★途中の紙が30行を超えている（切れる）★: ' + JSON.stringify(p3));
    ok(Math.max(...p3.slice(0, -1)) - Math.min(...p3.slice(0, -1)) <= 1, '★途中の紙が均等でない★: ' + JSON.stringify(p3));
  }
});

/* ★控除の件数が増えたら 明細に載る行を減らす★（司さん 2026-08-16
   「控除項目が増えたら ちゃんと行が増えるようにもやれよ」）
   控除の箱は件数ぶん伸びるので、伸びた分だけ 明細の枠を減らして はみ出させない。 */
T('★★控除が増えたら1枚に載る明細が減る（枠4件までは変わらない）★★', () => {
  const M = PAPER.maxRowsOf;
  eq(M(true, 1, 0), PAPER.PAPER_ROWS_DED, '控除0件で減っている');
  eq(M(true, 1, 4), PAPER.PAPER_ROWS_DED, '★控除の枠（4件）までは減らさない★');
  eq(M(true, 1, 5), PAPER.PAPER_ROWS_DED - 2, '★控除5件で減っていない（超えた分＋保険1行）★');
  eq(M(true, 1, 8), PAPER.PAPER_ROWS_DED - 5, '★控除8件で減っていない（超えた4件＋保険1行）★');
  eq(M(false, 1, 8), PAPER.PAPER_ROWS, '控除を出さない紙で減らしている');
  ok(M(true, 1, 99) >= 1, '★控除が極端に多い時に 0行や負の数にしている★');
  eq(PAPER.frameRowsOf({}, { deduct: 1, dedLines: 8 }), PAPER.PAPER_ROWS_DED - 5,
    '★枠を決める所に 控除の件数が効いていない★');
});

/* ★★表の合計は「その列に刷った字を足した数」と1円も違わない★★
     （司さん 2026-08-17「検算は 描いた文字を1行ずつ足せ」）
   ★税込で打つ紙★では 金額の列に ★税込の額★が刷られるのに、
   合計行だけ tax.subtotal（＝税抜）を出していた。
     実測 2026-08-17：936通り中 ★204通り★で、列を足すと 62,000／その真下に 56,364。
     ★1枚物だけ tax.subtotal を使っていたので、1枚物ほど狂っていた★。
   ★見本を選んで測らない★＝行数×区分×丸め方×税込税抜 を全部 測って 通り数を出す。 */
T('★★税込でも税抜でも、列を足した数と 合計行が1円も違わない★★', () => {
  const yen = (s) => Number(String(s).replace(/[^\d-]/g, '')) || 0;
  const prices = [19000, 1900, 333, 1, 99991, 12345];
  let pat = 0, pages = 0;
  const ngFoot = [], ngLabel = [];
  for (const rows of [1, 3, 8, 17, 26, 40, 60]) {
    for (const kubun of [1, 2, 4]) {
      for (const rounding of ['floor', 'round', 'ceil']) {
        for (const taxMode of ['exclusive', 'inclusive']) {
          const lines = [];
          if (kubun >= 2) lines.push({ name: '弁当', qty: 3, unit: '個', price: 597, rate: RED });
          if (kubun >= 4) {
            lines.push({ name: '駐車場', qty: 1, unit: '式', price: 30001, rate: 0, nontax: true });
            lines.push({ name: '立替', qty: 1, unit: '式', price: 5003, rate: 0 });
          }
          for (let i = lines.length; i < rows; i++) {
            lines.push({ name: '工事 ' + (i + 1), qty: 3, unit: '人', price: prices[i % prices.length], rate: STD });
          }
          const t = TAX.compute({ lines, taxMode, rounding });
          if (!t.ok) continue;
          const b = PAPER.build({
            inv: { doc_type: 'invoice', no: 'X', issue_ymd: '2026-07-21', tax_mode: taxMode, data: {} },
            tax: t, partner: { name: '八木工業 株式会社', keisho: '御中' },
            org: { yago: '合同会社ZEROact', bank: '伊予銀行　今治支店　普通　4160657　ド）ゼロアクト' },
            deduct: 1000, deductLines: [{ name: '弁当代', amount: 1000 }],
          });
          pat++;
          const tag = rows + '行/' + kubun + '区分/' + rounding + '/' + taxMode;
          b.html.split('class="sheet"').slice(1).forEach((s, i) => {
            const tbl = (/<table class="items">([\s\S]*?)<\/table>/.exec(s) || [])[1];
            if (!tbl) return;                                   // 締めだけの紙
            pages++;
            const head = [...((/<thead>([\s\S]*?)<\/thead>/.exec(tbl) || [])[1] || '')
              .matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim());
            const iA = head.indexOf('金額'), iT = head.indexOf('消費税');
            const body = (/<tbody>([\s\S]*?)<\/tbody>/.exec(tbl) || [])[1] || '';
            const colSum = (ix) => [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].reduce((a, tr) => {
              if (/r-blank/.test(tr[0])) return a;
              const c = [...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim());
              return a + yen(c[ix]);
            }, 0);
            const foot = (/<tfoot>([\s\S]*?)<\/tfoot>/.exec(tbl) || [])[1] || '';
            let col = 0; const at = {};
            for (const m of foot.matchAll(/<(?:th|td)([^>]*)>([\s\S]*?)<\/(?:th|td)>/g)) {
              at[col] = m[2].replace(/<[^>]+>/g, '').trim();
              col += Number((/colspan="(\d+)"/.exec(m[1]) || [])[1] || 1);
            }
            if (yen(at[iA]) !== colSum(iA)) ngFoot.push(tag + ' ' + (i + 1) + '枚目 金額 ' + at[iA] + ' vs 列の和 ' + colSum(iA));
            if (yen(at[iT]) !== colSum(iT)) ngFoot.push(tag + ' ' + (i + 1) + '枚目 消費税 ' + at[iT] + ' vs 列の和 ' + colSum(iT));
          });
          /* ★同じ言葉で違う数を出さない★（表は税込・締めは税抜） */
          const label = (/<th class="c-col c-left c-sumlabel"[^>]*>([\s\S]*?)<\/th>/.exec(b.html) || [])[1] || '';
          const S = sumsOfPaper(b.html);
          if (taxMode === 'inclusive') {
            if (!/（税込）/.test(label)) ngLabel.push(tag + ' 表の合計に（税込）が無い: ' + label);
            if (!Object.keys(S).some((k) => /明細の合計（税抜）/.test(k))) ngLabel.push(tag + ' 締めに（税抜）が無い');
          } else if (/（税込）|（税抜）/.test(label)) {
            ngLabel.push(tag + ' 税抜の紙に（税込/税抜）を書いている: ' + label);
          }
        }
      }
    }
  }
  console.log('      ★測った通り数 ' + pat + '★（刷った枚数 ' + pages + '）');
  ok(pat >= 100, '★測った数が少なすぎる＝見本を選んで測っている★ ' + pat);
  eq(ngFoot.length, 0, '★列を足した数と 合計行が違う★ ' + ngFoot.slice(0, 4).join(' / '));
  eq(ngLabel.length, 0, '★同じ言葉で違う数を出している★ ' + ngLabel.slice(0, 4).join(' / '));
});

/* ★表の中の合計＝そのページの分／締めの合計＝全ページの分★（司さん 2026-08-16
     「赤丸はそのページの合計やないと なぜ？ってなる」
     「全ページ明細合計、全ページ消費税合計にしたら 行を増やさなくてもいけるのでは」）
   ＝★どちらも 何を足した数かを 字で書く★・★締めはページ数で伸びない★。 */
T('★★表の中は「このページの小計」・締めは「全ページの」＋締めは何枚でも同じ行数★★', () => {
  const mk = (n) => {
    const lines = Array.from({ length: n }, (_, i) => ({ name: '工事 ' + (i + 1), amount: 9500, rate: STD }));
    const t = TAX.compute({ lines, taxMode: 'exclusive', rounding: 'floor' });
    return PAPER.build({ inv: { doc_type: 'invoice', no: 'X', issue_ymd: '2026-07-21', tax_mode: 'exclusive', data: {} },
      tax: t, partner: { name: '八木工業 株式会社', keisho: '御中' },
      org: { yago: '合同会社ZEROact', bank: '伊予銀行　今治支店　普通　4160657　ド）ゼロアクト' },
      deduct: 11340, deductLines: [{ name: '弁当代', amount: 11340 }] });
  };
  const sumsRowsOf = (h) => ((/<table class="sums">([\s\S]*?)<\/table>/.exec(h) || [])[1] || '').match(/<tr[\s>]/g) || [];
  const sheetsOf = (h) => h.split('class="sheet"').slice(1);

  /* ── 1枚物 ── 表の中は「明細の合計」／締めに「全ページの」は要らない */
  const one = mk(5);
  eq(one.pages, 1, '5行で複数ページになっている');
  ok(/明細の合計/.test(one.html), '1枚物に「明細の合計」が無い');
  ok(!/このページの小計/.test(one.html), '★1枚しかないのに「このページの小計」と書いている★');
  ok(!/全ページの/.test(one.html), '★1枚しかないのに「全ページの」と書いている★');

  /* ── 複数ページ ── どの紙の表も「このページの小計」／締めは「全ページの」 */
  const many = mk(60);
  ok(many.pages >= 3, '60行で3枚以上にならない: ' + many.pages);
  sheetsOf(many.html).forEach((s, i) => {
    const foot = (/<tfoot>([\s\S]*?)<\/tfoot>/.exec(s) || [])[1] || '';
    if (!foot) return;                                  // 締めだけの紙（明細の表が無い）
    ok(/このページの小計/.test(foot), '★' + (i + 1) + '枚目の表の合計が「このページの小計」でない★');
    ok(!/明細の合計/.test(foot), '★' + (i + 1) + '枚目の表に 全体の合計を書いている★');
  });
  ok(/全ページの\s*明細の合計/.test(many.html.replace(/<[^>]+>/g, '')),
    '★締めに「全ページの 明細の合計」が無い（表の数と何が違うのか分からない）★');

  /* ★ここが要★ 何枚になっても 締めの行数は変わらない
     （ページごとに1行ずつ増やすと 4枚目から必ず はみ出す＝実測 −28px） */
  const base = sumsRowsOf(mk(5).html).length;
  [26, 60, 100, 300].forEach((n) => {
    const b = mk(n);
    eq(sumsRowsOf(b.html).length, base,
      '★' + n + '行（' + b.pages + '枚）で締めの行数が変わった＝ページ数で締めが伸びている★');
  });

  /* ★表の中の合計は 実際に そのページに載っている明細の和★
     ★紙に出た字を足して確かめる★（中の値どうしで閉じない＝同じ計算を2回するだけになる） */
  const yen = (s) => Number(String(s).replace(/[^\d]/g, ''));
  let tally = 0, tallyTax = 0, checked = 0;
  sheetsOf(many.html).forEach((s, i) => {
    const tbl = (/<table class="items">([\s\S]*?)<\/table>/.exec(s) || [])[1];
    if (!tbl) return;                                   // 締めだけの紙
    const head = [...((/<thead>([\s\S]*?)<\/thead>/.exec(tbl) || [])[1] || '')
      .matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim());
    const iAmt = head.indexOf('金額'), iTax = head.indexOf('消費税');
    ok(iAmt >= 0 && iTax >= 0, (i + 1) + '枚目：見出しに 金額／消費税 の列が無い（' + head.join('/') + '）');
    const body = (/<tbody>([\s\S]*?)<\/tbody>/.exec(tbl) || [])[1] || '';
    const cols = (ix) => [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].reduce((a, tr) => {
      if (/r-blank/.test(tr[0])) return a;              // 空の枠
      const tds = [...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim());
      return a + yen(tds[ix] || 0);
    }, 0);
    const real = cols(iAmt), realTax = cols(iTax);
    ok(real > 0 && realTax > 0,
      '★' + (i + 1) + '枚目：明細の 金額／消費税 を1つも読めていない（見張りが何も見ていない）★');
    const foot = (/<tfoot>([\s\S]*?)<\/tfoot>/.exec(tbl) || [])[1] || '';
    /* 合計行も ★列の番号をたどって★ 読む（並び順で当てると 列を足した日に黙って外れる） */
    let col = 0; const at = {};
    for (const m of foot.matchAll(/<(?:th|td)([^>]*)>([\s\S]*?)<\/(?:th|td)>/g)) {
      at[col] = m[2].replace(/<[^>]+>/g, '').trim();
      col += Number((/colspan="(\d+)"/.exec(m[1]) || [])[1] || 1);
    }
    eq(yen(at[iAmt]), real, '★' + (i + 1) + '枚目：表の合計が そのページの明細の和と違う★');
    eq(yen(at[iTax]), realTax, '★' + (i + 1) + '枚目：表の消費税が そのページの消費税の和と違う★');
    tally += real; tallyTax += realTax; checked++;
  });
  ok(checked >= 2, '★2枚以上 数えていない（見張りが何も見ていない）★ ' + checked);
  const S = sumsOfPaper(many.html);
  eq(tally, S['全ページの 明細の合計'],
    '★各ページの小計を足しても 締めの「全ページの 明細の合計」にならない★');
  eq(tallyTax, S[Object.keys(S).find((k) => k.indexOf('全ページの 消費税') === 0)],
    '★各ページの消費税を足しても 締めの「全ページの 消費税」にならない★');
});

/* ★頭の並びは どの紙も同じ★（司さん 2026-08-16「統一感でるやろが」）
     ◯月分（1枚目だけ）
     下記の通り御請求申し上げます。 ← ★金額のすぐ上★
     ご請求金額（税込）             ← 1枚物は1枚目／複数ページは最後の紙
     ◯ / ◯ ページ                  ← ★いつも明細のすぐ上★
     （明細） */
T('★★頭の並びが どの紙も同じ（挨拶→金額→ページ番号→明細）★★', () => {
  const mk = (n) => {
    const lines = Array.from({ length: n }, (_, i) => ({ name: '工事 ' + (i + 1), amount: 9500, rate: STD }));
    const t = TAX.compute({ lines, taxMode: 'exclusive', rounding: 'floor' });
    return PAPER.build({ inv: { doc_type: 'invoice', no: 'X', issue_ymd: '2026-07-21', data: {} },
      tax: t, partner: S1.partner, org: S1.org });
  };
  const order = (p2) => {
    const at = (re) => { const m = re.exec(p2); return m ? m.index : -1; };
    return { 月: at(/lead-p/), 挨拶: at(/lead-g/), 金額: at(/class="grand"/),
             ページ: at(/class="pageno"/), 明細: at(/class="items"/) };
  };
  /* 1枚物：◯月分 → 挨拶 → 金額 → 明細（ページ番号は出さない） */
  const one = order(mk(3).html.split('class="sheet"')[1]);
  ok(one.月 >= 0 && one.月 < one.挨拶, '★1枚物：◯月分が挨拶より下★');
  ok(one.挨拶 < one.金額, '★1枚物：挨拶が金額より下（金額のすぐ上に置く決め）★');
  ok(one.金額 < one.明細, '★1枚物：金額が明細より下★');
  eq(one.ページ, -1, '1枚物にページ番号が出ている');

  /* 複数ページ */
  const many = mk(26);
  const sheets = many.html.split('class="sheet"').slice(1);
  sheets.forEach((p2, i) => {
    const o = order(p2);
    const last = (i === sheets.length - 1);
    ok(o.ページ >= 0 && o.ページ < o.明細, '★' + (i + 1) + '枚目：ページ番号が明細のすぐ上に無い★');
    if (i === 0) {
      ok(o.月 >= 0 && o.月 < o.ページ, '★1枚目：ページ番号が「◯月分」の下に無い★');
      eq(o.金額, -1, '1枚目に金額が出ている');
    }
    if (last) {
      ok(o.挨拶 >= 0 && o.挨拶 < o.金額, '★最後の紙：挨拶が金額のすぐ上に無い★');
      ok(o.金額 < o.ページ, '★最後の紙：ページ番号が金額の下に無い★');
      ok(o.ページ < o.明細, '最後の紙：ページ番号が明細より下');
    }
  });
});

/* ★金額はいつも同じ場所★（司さん 2026-08-16「1ページでも複数ページでも同じ場所にしろ」）
   ＝紙の頭（宛名の下・明細の上）。複数ページの時は ★最後の紙の頭★（＝振込先と同じ紙）。 */
T('★★「ご請求金額」はいつも紙の頭・複数ページなら最後の1枚だけ★★', () => {
  const mk = (n) => {
    const lines = Array.from({ length: n }, (_, i) => ({ name: '工事 ' + (i + 1), amount: 9500, rate: STD }));
    const t = TAX.compute({ lines, taxMode: 'exclusive', rounding: 'floor' });
    return PAPER.build({ inv: { doc_type: 'invoice', no: 'X', issue_ymd: '2026-07-21', data: {} },
      tax: t, partner: S1.partner,
      org: Object.assign({}, S1.org, { bank: '伊予銀行 今治支店 普通 1234567 カ）ゼロアクト' }) });
  };
  /* 1枚の紙＝頭に1回だけ（2回 出さない） */
  const one = mk(3);
  eq(one.pages, 1, '3行で2枚になっている');
  eq((one.html.match(/ご請求金額/g) || []).length, 1, '★1枚の紙に2回 出ている★');
  const b1 = one.html.split('</head>')[1] || '';
  ok(b1.indexOf('ご請求金額') < b1.indexOf('class="items"'), '1枚の紙で金額が明細より下に在る');

  /* 複数ページ＝1枚目の頭と 最後の紙（振込先が在る紙）に出る */
  const many = mk(26);
  ok(many.pages >= 2, '26行で複数ページにならない');
  const sheets = many.html.split('class="sheet"').slice(1);
  sheets.forEach((p2, i) => {
    const last = (i === sheets.length - 1);
    eq(/ご請求金額/.test(p2), last,
      '★' + (i + 1) + '枚目の「ご請求金額」の出し方が違う（最後の1枚だけ）★');
    // ★振込先と同じ紙に在る★（客が見る紙で 金額を探させない）
    if (last) {
      ok(/お振込先/.test(p2), '最後の紙に振込先が無い');
      /* ★場所は1枚物と同じ「頭（明細の上）」★＝足元に移していない */
      const iG = p2.indexOf('ご請求金額'), iT = p2.indexOf('class="items"'), iS = p2.indexOf('class="sums"');
      ok(iG >= 0 && iT >= 0 && iG < iT, '★最後の紙で金額が明細より下に出ている（場所が違う）★');
      ok(iS < 0 || iG < iS, '★金額が締めより下に出ている★');
    }
  });
  /* ★金額は最後の紙に1回だけ★（同じ数字を何度も出さない） */
  const v = [...many.html.matchAll(/<td class="grand-v">([^<]*)<\/td>/g)].map((m) => m[1].trim());
  eq(v.length, 1, '★金額が最後の1枚だけに出ていない★: ' + JSON.stringify(v));
  /* ★1枚で収まる紙は 今までどおり頭に1回★ */
  const oneV = [...one.html.matchAll(/<td class="grand-v">([^<]*)<\/td>/g)];
  eq(oneV.length, 1, '1枚の紙で金額の出方が違う');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
