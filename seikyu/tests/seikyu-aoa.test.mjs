/* seikyu-aoa.test.mjs — ★Excelで渡した相手の画面で、読めて・足せるか★
 *
 * ここで止めたい事故:
 *   ① ★列幅を付けずに出して ######## になる★（前科あり。渡した相手の画面で初めて分かる）
 *   ② ★金額を "1,234円" のような文字で出す★（相手が足し算できない＝Excelで渡す意味が消える）
 *   ③ 税率ごとの区分が Excel に出ない（紙と食い違う）
 *   ④ 明細0行で落ちる／空の表を出す
 *
 * ★実際に .xlsx を組んで読み戻して測る★（作った物を見るだけにしない）。
 *
 * 使い方: node seikyu/tests/seikyu-aoa.test.mjs
 *         node seikyu/tests/seikyu-aoa.test.mjs --self-test
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require_ = createRequire(path.join(ROOT, 'package.json'));
const AOA = require_(path.join(ROOT, 'seikyu/lib/seikyu-aoa.js'));
const TAX = require_(path.join(ROOT, 'seikyu/lib/seikyu-tax.js'));
const SR = require_(path.join(ROOT, 'kyuyo/lib/shouhizei-ritsu.js'));
const XLSX = require_(path.join(ROOT, 'lib/xlsx.full.min.js'));

const STD = Math.round(SR.hyojun * 10000) / 100;
const RED = Math.round(SR.keigen * 10000) / 100;

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const eq = (a, b, m) => { if (a !== b) throw new Error((m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); };
const ok = (v, m) => { if (!v) throw new Error(m || 'false'); };

function sample() {
  const lines = [
    { name: '運転代行 9月分', qty: 42, unit: '件', price: 3200, rate: STD },
    { name: 'お弁当代', amount: 1000, rate: RED },
    { name: '立替金（対象外）', amount: 500, rate: 0 },
  ];
  const tax = TAX.compute({ lines, taxMode: 'exclusive', rounding: 'floor' });
  return {
    inv: { doc_type: 'invoice', no: '202609-001', issue_ymd: '2026-09-30', due_ymd: '2026-10-31', data: { subject: '9月分', memo: '備考です' } },
    tax,
    partner: { name: '藤原建設株式会社', keisho: '御中', addr: '愛媛県今治市1-2-3' },
    org: { yago: '株式会社ゼロアクト', addr: '今治市4-5-6', tel: '0898-00-0000', invoiceNo: 'T1234567890123', bank: '伊予銀行' },
  };
}

/* 実際に .xlsx を組んで、読み戻す（＝相手のExcelが受け取る形で測る） */
function roundTrip(sheet) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(sheet.aoa);
  if (sheet.cols) ws['!cols'] = sheet.cols;
  (sheet.numFmt || []).forEach((f) => {
    const ref = XLSX.utils.encode_cell({ r: f.r, c: f.c });
    if (ws[ref] && typeof ws[ref].v === 'number') ws[ref].z = f.z;
  });
  XLSX.utils.book_append_sheet(wb, ws, sheet.name || 'Sheet1');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer', cellStyles: true });
  const back = XLSX.read(buf, { type: 'buffer', cellStyles: true });
  return back.Sheets[back.SheetNames[0]];
}

/* ★純関数（self-test で作り物を通せる）★ やってはいけない方の表 */
export function sheetBad(kind, sheet) {
  const s = JSON.parse(JSON.stringify(sheet));
  if (kind === 'noCols') { delete s.cols; return s; }
  if (kind === 'strMoney') {
    s.aoa = s.aoa.map((row) => row.map((v) => (typeof v === 'number' ? v.toLocaleString('ja-JP') + '円' : v)));
    s.numFmt = [];
    return s;
  }
  return s;
}

/* ── self-test ────────────────────────────────────────────────── */
if (process.argv.includes('--self-test')) {
  console.log('\n[seikyu-aoa --self-test] わざと壊して赤になるか');
  let sp = 0, sf = 0;
  const S = (n, fn) => { try { fn(); sp++; console.log('  ✓ ' + n); } catch (e) { sf++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };

  S('① 列幅を外した表は「######## にならない」検査に落ちる', () => {
    const bad = roundTrip(sheetBad('noCols', AOA.build(sample())));
    ok(!bad['!cols'] || !bad['!cols'].length, '作り物なのに列幅が残っている＝この検査が空振り');
    const good = roundTrip(AOA.build(sample()));
    ok(good['!cols'] && good['!cols'].length, '本物に列幅が無い');
  });

  S('② 金額を文字にした表は「数のまま」検査に落ちる', () => {
    const bad = roundTrip(sheetBad('strMoney', AOA.build(sample())));
    const badNums = Object.keys(bad).filter((k) => k[0] !== '!' && bad[k].t === 'n').length;
    eq(badNums, 0, '作り物なのに数が残っている＝この検査が空振り');
    const good = roundTrip(AOA.build(sample()));
    const goodNums = Object.keys(good).filter((k) => k[0] !== '!' && good[k].t === 'n').length;
    ok(goodNums > 5, '本物に数のセルが少なすぎる: ' + goodNums);
  });

  console.log('\n[self-test] ' + sp + ' passed, ' + sf + ' failed');
  if (sf) process.exit(1);
}

/* ── 本体 ──────────────────────────────────────────────────────── */
console.log('\n[請求書 Excel の中身]');
const S1 = sample();
const SH = AOA.build(S1);
const WS = roundTrip(SH);
const cellAt = (r, c) => WS[XLSX.utils.encode_cell({ r, c })];
const asRows = () => XLSX.utils.sheet_to_json(WS, { header: 1, raw: true });

T('★列幅が全部の列に付いている（相手の画面で ######## にしない）', () => {
  ok(WS['!cols'] && WS['!cols'].length === 7, '列幅の数=' + ((WS['!cols'] || []).length));
  WS['!cols'].forEach((c, i) => ok(c && Number(c.wch) > 0, i + '列目に幅が無い'));
  // 品名は他より広い（長い文が入る列）
  ok(WS['!cols'][1].wch >= 30, '品名の列が狭い: ' + WS['!cols'][1].wch);
});

T('★金額は数のまま出る（相手が足し算できる）', () => {
  const rows = asRows();
  const head = rows.findIndex((r) => r[0] === '#' && r[1] === '品名・内容');
  ok(head > 0, '明細の見出し行が無い');
  for (let i = 0; i < S1.tax.lines.length; i++) {
    const cell = cellAt(head + 1 + i, 5);
    ok(cell, (i + 1) + '行目の金額が無い');
    eq(cell.t, 'n', (i + 1) + '行目の金額が数でない');
    eq(cell.v, S1.tax.lines[i].amount, (i + 1) + '行目の金額');
  }
});

T('★金額のセルに桁区切りの書式が付いている', () => {
  const rows = asRows();
  const head = rows.findIndex((r) => r[0] === '#' && r[1] === '品名・内容');
  const cell = cellAt(head + 1, 5);
  ok(cell.z && /#,##0/.test(String(cell.z)), '書式=' + cell.z);
});

T('★小計・消費税・合計 が数で出て、税抜+消費税=税込 が一致する', () => {
  const rows = asRows();
  const find = (label) => rows.find((r) => r[4] === label);
  const sub = find('小計'), tx = find('消費税'), gr = find('合計');
  ok(sub && tx && gr, '合計欄が出ていない');
  eq(typeof sub[5], 'number', '小計が数でない');
  eq(sub[5] + tx[5], gr[5], '税抜+消費税≠税込');
  eq(gr[5], S1.tax.grandTotal, '合計が計算と違う');
});

T('★税率ごとの区分が Excel にも出る（紙と食い違わせない）', () => {
  const rows = asRows();
  const head = rows.findIndex((r) => r[0] === '区分' && r[1] === '対象額');
  ok(head > 0, '区分の見出しが無い');
  S1.tax.byRate.forEach((b, i) => {
    const r = rows[head + 1 + i];
    ok(r, i + 1 + 'つ目の区分が無い');
    eq(r[0], b.pct + '% 対象');
    eq(r[1], b.base, '対象額');
    eq(r[2], b.tax, '消費税');
  });
  ok(rows.some((r) => r[0] === '消費税の対象外'), '対象外の行が無い');
});

T('★取れなかったを空欄にしない（相手・自社・番号）', () => {
  const s = AOA.build({ inv: { doc_type: 'invoice', no: '', issue_ymd: '', data: {} }, tax: TAX.compute({ lines: [], taxMode: 'exclusive', rounding: 'floor' }), partner: {}, org: {} });
  const flat = JSON.stringify(s.aoa);
  ok(/（取引先が未選択）/.test(flat), '宛先が空欄');
  ok(/（自社情報が未入力）/.test(flat), '自社が空欄');
  ok(/（未採番）/.test(flat), '番号が空欄');
  ok(/明細がまだ1行もありません/.test(flat), '空の表が出ている');
  ok(/区分はまだありません/.test(flat), '空の区分が出ている');
});

T('★undefined / NaN を1つも出さない', () => {
  const flat = JSON.stringify(SH.aoa);
  ok(!/null,null,null,null,null,null,null/.test(flat) || true, '（空行そのものは可）');
  SH.aoa.forEach((row, i) => row.forEach((v, j) => {
    ok(v !== undefined, i + '行' + j + '列が undefined');
    ok(!(typeof v === 'number' && !Number.isFinite(v)), i + '行' + j + '列が NaN');
  }));
});

T('見積書は呼び方が変わる（シート名も）', () => {
  const s = AOA.build(Object.assign({}, S1, { inv: Object.assign({}, S1.inv, { doc_type: 'quote' }) }));
  eq(s.name, '見積書');
  const j = JSON.stringify(s.aoa);
  ok(j.includes('見積日'), '日付の呼び方が請求書のまま');
  ok(j.includes('御見積金額（税込）'), '金額の呼び方が請求書のまま');
  // ★番号のラベルは紙と同じ「No.」（うちの語彙）★
  ok(j.includes('"No."'), '番号のラベルが「No.」でない');
  ok(!j.includes('請求番号') && !j.includes('見積番号'), 'うちの語彙に無いラベルが出ている');
});

T('★紙とExcelで言葉づかいがそろっている（突き合わせできる）', () => {
  const j = JSON.stringify(SH.aoa);
  ['No.', '請求日', 'お支払期限', '御請求金額（税込）', '小計', '消費税', '合計', '区分', 'お振込先', '備考']
    .forEach((w) => ok(j.includes(w), 'Excelに「' + w + '」が無い'));
  ok(!j.includes('ご請求金額'), '紙と違う言い方（ご請求金額）が出ている');
});

T('★網羅：税率の組み合わせ×内外×丸め を全部書き出して、合計が Excel の中でも一致', () => {
  let n = 0;
  const sets = [
    [{ name: 'a', amount: 105, rate: STD }],
    [{ name: 'a', amount: 105, rate: RED }],
    [{ name: 'a', amount: 105, rate: 0 }],
    [{ name: 'a', amount: 105, rate: STD }, { name: 'b', amount: 1000, rate: RED }, { name: 'c', amount: 500, rate: 0 }],
    [{ name: 'a', amount: -1100, rate: STD }],
  ];
  for (const lines of sets) for (const mode of ['exclusive', 'inclusive']) for (const rd of ['floor', 'ceil', 'round']) {
    const t = TAX.compute({ lines, taxMode: mode, rounding: rd });
    const s = AOA.build({ inv: { doc_type: 'invoice', no: 'X', issue_ymd: '2026-09-30', data: {} }, tax: t, partner: { name: 'A' }, org: {} });
    const ws = roundTrip(s);
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
    const gr = rows.find((r) => r[4] === '合計');
    if (!gr) throw new Error('合計が無い');
    if (gr[5] !== t.grandTotal) throw new Error('合計が違う: ' + gr[5] + ' / ' + t.grandTotal);
    if (!ws['!cols'] || ws['!cols'].length !== 7) throw new Error('列幅が落ちた');
    n++;
  }
  if (n < 25) throw new Error('組合せが少なすぎる（検査が空振り）: ' + n);
  console.log('     実測: ' + n + '通りを書き出して読み戻し、矛盾0件');
});

/* ═══ ②-b 源泉徴収 / 繰越 / 非課税 が Excel にも出る ═══
   ★紙にだけ出して Excel に出さないと、Excel で数えた人だけ違う額を振り込む★ */
const GENSEN = require_(path.join(ROOT, 'seikyu/lib/seikyu-gensen.js'));
const CARRY = require_(path.join(ROOT, 'seikyu/lib/seikyu-carry.js'));
const CHOSHO = require_(path.join(ROOT, 'kyuyo/lib/shiharai-chosho.js'));
const PAPER_ = require_(path.join(ROOT, 'seikyu/lib/seikyu-paper.js'));
const flat_ = (x) => String(x).replace(/\s+/g, '');

/* 書き出して読み戻した「行の配列」を返す */
function roundTripRows(sheet) {
  const ws = roundTrip(sheet);
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
}

T('★源泉徴収が Excel にも出る（紙と1円も違わない）', () => {
  const lines = [{ name: '原稿料', amount: 100000, rate: STD, gensen: true }];
  const tax = TAX.compute({ lines, taxMode: 'exclusive', rounding: 'floor' });
  const gen = GENSEN.compute({ lines, tax, taxMode: 'exclusive', rounding: 'floor' });
  ok(gen.on, '源泉が効いていない');
  const rows = roundTripRows(AOA.build(Object.assign({}, sample(), { tax, gensen: gen })));
  const g = rows.find((r) => r.includes(gen.label));
  const nrow = rows.find((r) => r.includes(gen.netLabel));
  ok(g, 'Excel に源泉の行が無い');
  ok(nrow, 'Excel に差引の行が無い');
  eq(Math.abs(g[g.indexOf(gen.label) + 1]), CHOSHO.gensenA(100000), '源泉の額が給与の lib と違う');
  eq(nrow[nrow.indexOf(gen.netLabel) + 1], gen.net, '差引の額が違う');
  const h = PAPER_.build(Object.assign({}, sample(), { tax, gensen: gen })).html;
  ok(flat_(h).includes(PAPER_.yen(gen.net)), '紙の差引と Excel が食い違う');
});

T('★繰越が Excel にも出る／読めていない所は 0 にせず「（未確認）」', () => {
  const tax = sample().tax;
  const prev = { id: 'p1', no: 'C-1', totals: { grandTotal: 50000 } };
  const unknown = CARRY.compute({ thisTotal: tax.grandTotal, prev, receipts: null });
  const rowsU = roundTripRows(AOA.build(Object.assign({}, sample(), { carry: unknown })));
  const paid = rowsU.find((r) => r.includes('入金額'));
  ok(paid, 'Excel に入金額の行が無い');
  eq(paid[paid.indexOf('入金額') + 1], '（未確認）', '★読めていないのに 0 が入っている★');

  const okc = CARRY.compute({ thisTotal: tax.grandTotal, prev, receipts: [{ invoice_id: 'p1', amount: 20000 }] });
  const rowsO = roundTripRows(AOA.build(Object.assign({}, sample(), { carry: okc })));
  const c = rowsO.find((r) => r.includes('繰越額'));
  eq(c[c.indexOf('繰越額') + 1], 30000, '繰越額が違う');
  const gt = rowsO.find((r) => r.includes('合計請求額'));
  eq(gt[gt.indexOf('合計請求額') + 1], okc.grandTotal, '合計請求額が違う');
});

T('★繰越が初回の時は、空の表を出さず1行だけ言う（Excel も紙と同じ）', () => {
  const tax = sample().tax;
  const first = CARRY.compute({ thisTotal: tax.grandTotal, prev: null, receipts: [] });
  const rows = roundTripRows(AOA.build(Object.assign({}, sample(), { carry: first })));
  ok(rows.some((r) => r.some((c) => /前回の請求はありません/.test(String(c)))), '初回だと言っていない');
  ok(!rows.some((r) => r.includes('前回請求額')), '初回なのに空の繰越の表を出している');
  ok(!rows.some((r) => r.some((c) => /未確認/.test(String(c)))), '★初回なのに「未確認」と書いている★');
});

T('★非課税と対象外が Excel の区分で別の行になる', () => {
  const lines = [
    { name: '住宅家賃', amount: 80000, rate: 0, nontax: true },
    { name: '立替金', amount: 500, rate: 0 },
    { name: '運転代行', amount: 10000, rate: STD },
  ];
  const tax = TAX.compute({ lines, taxMode: 'exclusive', rounding: 'floor' });
  const rows = roundTripRows(AOA.build(Object.assign({}, sample(), { tax })));
  const nt = rows.find((r) => r[0] === '非課税');
  const ex = rows.find((r) => r[0] === '消費税の対象外');
  ok(nt, 'Excel に「非課税」の行が無い');
  ok(ex, 'Excel に「対象外」の行が無い');
  eq(nt[1], 80000, '非課税の額が違う');
  eq(ex[1], 500, '対象外の額が違う');
});

/* ═══ ★お金の順番は 紙・Excel で同じ★ ═══
   2026-08-11 実機で発生：繰越を出しているのに 差引お支払額 が繰越を無視し、
   ★1,111,000 を請求しながら 997,900 と書いた★（11,000 少なく振り込まれる）。
   足し引きの順番を紙とExcelで別々に書くと、必ずどちらかが間違う。 */
const DOC_ = require_(path.join(ROOT, 'seikyu/lib/seikyu-doc.js'));

T('★繰越と源泉が両方ある時：差引＝合計請求額（繰越こみ）− 源泉', () => {
  const lines = [{ name: 'デザイン料', amount: 1000000, rate: STD, gensen: true }];
  const tax = TAX.compute({ lines, taxMode: 'exclusive', rounding: 'floor' });
  const gen = GENSEN.compute({ lines, tax, taxMode: 'exclusive', rounding: 'floor' });
  const carry = CARRY.compute({
    thisTotal: tax.grandTotal,
    prev: { id: 'p1', no: 'C-1', totals: { grandTotal: 11000 } },
    receipts: [],
  });
  eq(carry.grandTotal, tax.grandTotal + 11000, '合計請求額が繰越を足していない');

  const want = carry.grandTotal - gen.amount;      // ★これが振り込まれる額★
  eq(DOC_.payableOf(tax, carry, gen), want, '順番の唯一の正がズレている');
  ok(want !== gen.net, '前提が崩れている（繰越を足しても同じ額になっている）');

  // 紙
  const h = PAPER_.build(Object.assign({}, sample(), { tax, gensen: gen, carry })).html;
  ok(flat_(h).includes(PAPER_.yen(want)), '★紙の差引が繰越を無視している★（欲しい ' + want + '）');
  ok(!flat_(h).includes('>' + PAPER_.yen(gen.net) + '<'), '紙に繰越を無視した差引が残っている');
  // 見出しの額も、実際に請求している額（★見出しの中だけを見る★＝
  // 紙のどこかに同じ数字があるだけでは、見出しが直っている証明にならない）
  // ★見出しは表で組んだ（金額の下だけに線を引くため）★＝読む所も td に変わった
  const head = (/<td class="grand-v">([^<]*)<\/td>/.exec(h) || [])[1];
  eq(head, PAPER_.yen(carry.grandTotal), '★紙の見出しが繰越を無視している★');

  // Excel
  const rows = roundTripRows(AOA.build(Object.assign({}, sample(), { tax, gensen: gen, carry })));
  const nrow = rows.find((r) => r.includes(gen.netLabel));
  ok(nrow, 'Excel に差引の行が無い');
  eq(nrow[nrow.indexOf(gen.netLabel) + 1], want, '★Excel の差引が紙と食い違う★');
});

T('★繰越の入金が読めていない時：差引も「（未確認）」（0にも 今回分にもしない）', () => {
  const lines = [{ name: 'デザイン料', amount: 1000000, rate: STD, gensen: true }];
  const tax = TAX.compute({ lines, taxMode: 'exclusive', rounding: 'floor' });
  const gen = GENSEN.compute({ lines, tax, taxMode: 'exclusive', rounding: 'floor' });
  const carry = CARRY.compute({
    thisTotal: tax.grandTotal,
    prev: { id: 'p1', no: 'C-1', totals: { grandTotal: 11000 } },
    receipts: null,                                  // ★読めていない★
  });
  eq(DOC_.payableOf(tax, carry, gen), null, '読めていないのに額を作っている');

  const h = PAPER_.build(Object.assign({}, sample(), { tax, gensen: gen, carry })).html;
  ok(/（未確認）/.test(h), '紙が「未確認」と言っていない');
  ok(!flat_(h).includes('>' + PAPER_.yen(gen.net) + '<'), '★読めていないのに今回分だけの差引を刷っている★');

  const rows = roundTripRows(AOA.build(Object.assign({}, sample(), { tax, gensen: gen, carry })));
  const nrow = rows.find((r) => r.includes(gen.netLabel));
  eq(nrow[nrow.indexOf(gen.netLabel) + 1], '（未確認）', '★Excel が 0 か今回分を書いている★');
});

T('★繰越が無い時は今までどおり（源泉だけ引く）', () => {
  const lines = [{ name: '原稿料', amount: 100000, rate: STD, gensen: true }];
  const tax = TAX.compute({ lines, taxMode: 'exclusive', rounding: 'floor' });
  const gen = GENSEN.compute({ lines, tax, taxMode: 'exclusive', rounding: 'floor' });
  eq(DOC_.payableOf(tax, null, gen), gen.net, '繰越が無い時に額が変わった');
  eq(DOC_.billedOf(tax, null), tax.grandTotal, '繰越が無い時の請求額が変わった');
  eq(DOC_.payableOf(tax, null, null), tax.grandTotal, '源泉も繰越も無い時に額が変わった');
});

/* ★振込先の分け方は 紙も Excel も同じ★（司さん 2026-08-16「全共通にしとんか？」）
   紙だけ直すと、Excel を受け取った人には ★違う紙★ に見える。 */
T('★★振込先の名義は Excel でも次の行（紙と同じ分け方を呼ぶ）★★', () => {
  const lines = [{ name: '工事', amount: 10000, rate: STD }];
  const tax = TAX.compute({ lines, taxMode: 'exclusive', rounding: 'floor' });
  const mk = (bank) => {
    const r = AOA.build({ inv: { doc_type: 'invoice', no: '1', issue_ymd: '2026-07-21', data: {} },
      tax, partner: { name: 'x' }, org: { bank } });
    const rows = r.aoa || r.rows || r;
    const arr = Array.isArray(rows) ? rows : rows.aoa;
    const i = arr.findIndex((x) => x && x[0] === 'お振込先');
    return i < 0 ? [] : [arr[i], arr[i + 1]];
  };
  const a = mk('伊予銀行　今治支店　普通　4160657　ド）ゼロアクト');
  eq(a[0][1], '伊予銀行　今治支店　普通　4160657', '★Excel の1行目に名義まで入っている★: ' + JSON.stringify(a));
  eq(a[1][0], '', '名義の行に見出しを繰り返している');
  eq(a[1][1], 'ド）ゼロアクト', '★Excel で名義が次の行に来ていない★: ' + JSON.stringify(a));
  const want = PAPER_.bankLines('伊予銀行　今治支店　普通　4160657　ド）ゼロアクト');
  eq(a[0][1], want[0], '紙と Excel で1行目が違う');
  eq(a[1][1], want[1], '紙と Excel で2行目が違う');
  const b = mk('伊予銀行　今治支店　普通　4160657');
  ok(!b[1] || b[1][1] !== '', '★名義が無いのに空の行を足している★: ' + JSON.stringify(b));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
