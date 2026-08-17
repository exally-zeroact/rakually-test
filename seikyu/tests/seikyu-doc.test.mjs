/* seikyu-doc.test.mjs — ★請求書という「物」の決まりを実数で固定する★
 *
 * 代行請求の実物で起きている事故を、ここで根から止める:
 *   ① ★番号が会社の並び順から作られていて、会社を1社足すと過去の番号が変わる★
 *      → 番号は「発行した時に決めて、行に保存する」。並び順から作らない。
 *   ② ★同じ番号を二度使わない★（重複＝入金の消し込みで請求が特定できない＝二重請求・誤督促）
 *      → 形を選べるようにし、★最後の砦は倉庫の一意制約★（このlibは採番と再試行だけ）
 *   ③ ★発行した請求書は直せない・消せない★（明細を1行直すと去年の紙の金額が変わる、を止める）
 *   ④ ★取引先を消しても一覧に名前が出る★（紙と同じ物＝snapshot から出す）
 *   ⑤ ★入金は「1件も無い」と「取れなかった（未確認）」を必ず違う物として返す★
 *   ⑥ ★過入金を0でクランプしない★
 *
 * 使い方: node seikyu/tests/seikyu-doc.test.mjs
 *         node seikyu/tests/seikyu-doc.test.mjs --self-test
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require_ = createRequire(path.join(ROOT, 'package.json'));
const D = require_(path.join(ROOT, 'seikyu/lib/seikyu-doc.js'));

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const eq = (a, b, m) => { if (a !== b) throw new Error((m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); };
const ok = (v, m) => { if (!v) throw new Error(m || 'false'); };
const hasErr = (errs, word) => errs.some(e => String(e.msg || e).indexOf(word) >= 0);

/* ── self-test：わざと壊して赤になるかを先に見せる ───────────────────── */
if (process.argv.includes('--self-test')) {
  console.log('\n[seikyu-doc --self-test] わざと壊して赤になるか');
  let sp = 0, sf = 0;
  const S = (n, fn) => { try { fn(); sp++; console.log('  ✓ ' + n); } catch (e) { sf++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };

  S('★入金が「未確認(null)」と「0件([])」で違う答えを返す（同じなら検査が空振り）', () => {
    const inv = { grand_total: 1000 };
    const a = D.paymentStateOf(inv, null).state;
    const b = D.paymentStateOf(inv, []).state;
    if (a === b) throw new Error('未確認と0件が同じ答え（' + a + '）＝区別できていない');
    if (a !== 'unknown' || b !== 'unpaid') throw new Error('実測値がずれた a=' + a + ' b=' + b);
  });

  S('★過入金が0でクランプされていない（クランプしていたらここが赤）', () => {
    const r = D.paymentStateOf({ grand_total: 1000 }, [{ amount: 1500, ymd: '2026-08-01' }]);
    if (r.remain >= 0) throw new Error('残額が0以上＝クランプされている: ' + r.remain);
    if (r.state !== 'over') throw new Error('過入金と判定していない: ' + r.state);
  });

  S('★0円の入金が止まっている（通ったら赤）＝「入っていない」と「0円入った」を作り分けない', () => {
    if (D.validateReceipt({ ymd: '2026-10-05', amount: '0' }).ok) throw new Error('0円が記録できてしまう');
    if (!D.validateReceipt({ ymd: '2026-10-05', amount: '1' }).ok) throw new Error('1円が通らない（境界を締めすぎ）');
  });

  S('★読めない金額を0に丸めていない（0を返したら赤）', () => {
    const v = D.receiptAmountOf('あいう');
    if (v === 0) throw new Error('読めない金額を0にしている＝0円の入金として記録される');
    if (v !== null) throw new Error('null を返していない: ' + JSON.stringify(v));
  });

  S('★印紙の境界が本当に効いている（49,999と50,000で答えが変わらなければ赤）', () => {
    if (D.stampNeeded(49999) === D.stampNeeded(50000)) throw new Error('5万円の境目で答えが変わらない＝空振り');
    if (D.stampNeeded(50000) !== true) throw new Error('5万円ちょうどを非課税にしている');
  });

  S('★区分記載(No.7124)が効いている（区分の有無で答えが変わらなければ赤）', () => {
    const a = D.stampNeeded({ amount: 52800, taxTotal: 4800, taxSeparate: true });
    const b = D.stampNeeded({ amount: 52800, taxTotal: 4800, taxSeparate: false });
    if (a === b) throw new Error('★区分して書いても答えが変わらない＝No.7124 を見ていない★');
    if (a !== false || b !== true) throw new Error('実測がずれた a=' + a + ' b=' + b);
  });

  S('★消した入金の枝番を使い回していない（使い回すと同じ番号の紙が2枚 出る）', () => {
    const all = [{ id: 'r1', created_at: 'a' }, { id: 'r2', created_at: 'b', deleted_at: 'x' }, { id: 'r3', created_at: 'c' }];
    if (D.receiptBranchOf(all, 'r3') !== 3) throw new Error('消した行が席を外している＝番号が繰り上がる');
    const plus = all.concat([{ id: 'r4', created_at: 'd' }]);
    if (D.receiptBranchOf(plus, 'r4') !== 4) throw new Error('★消した枝番を使い回している★');
  });

  S('★消した入金から領収書が作れないこと（作れたら赤）', () => {
    const rc = { id: 'r1', amount: 1000, ymd: '2026-10-05' };
    if (!D.canReceipt(rc, { status: 'issued' }).ok) throw new Error('生きている入金から作れない');
    if (D.canReceipt({ ...rc, deleted_at: 'x' }, { status: 'issued' }).ok) throw new Error('★消した入金から作れる★');
  });

  S('★品名が空の行を止めている（通ったら赤＝何の代金か分からない紙が出る）', () => {
    const r = D.rowIssuesOf([{ name: '', amount: '5000' }]);
    if (!r.blankName.length) throw new Error('★品名が空の行を見逃している★');
    if (r.dropped.length) throw new Error('中身が在る行を「まるごと空」と数えている');
  });

  S('★取引先が消えた時に空文字を返していない（空なら赤）', () => {
    const inv = { status: 'draft', partner_id: 'pt_x', snapshot: {} };
    const name = D.partnerNameOf(inv, {});
    if (!name) throw new Error('空を返した＝取れなかったのに空欄になる');
  });

  S('★発行済みを編集/削除できると赤', () => {
    if (D.canEdit({ status: 'issued' })) throw new Error('発行済みが編集できてしまう');
    if (D.canDelete({ status: 'issued' })) throw new Error('発行済みが消せてしまう');
    if (!D.canDelete({ status: 'draft' })) throw new Error('下書きが消せない');
  });

  S('★形と連番の実測がズレたら赤（採番が空振りしていない）', () => {
    const n = D.nextNo({ format: 'ym-seq', ymd: '2026-09-30', existing: ['202609-001', '202609-002'] });
    if (n !== '202609-003') throw new Error('採番がずれた: ' + n);
    const first = D.nextNo({ format: 'ym-seq', ymd: '2026-09-30', existing: [] });
    if (first !== '202609-001') throw new Error('最初の番号がずれた: ' + first);
  });

  console.log('\n[self-test] ' + sp + ' passed, ' + sf + ' failed');
  process.exit(sf ? 1 : 0);
}

/* ── 本番の検査 ───────────────────────────────────────────────── */
console.log('\n[seikyu-doc] 請求書という「物」の決まり');

/* ① 番号の形 -------------------------------------------------------- */
T('★形は5つ（連番／年+連番／年月+連番／取引先+年月+連番／自分で決める）', () => {
  eq(D.NUMBER_FORMATS.map(f => f.key).join(','), 'seq,y-seq,ym-seq,p-ym-seq,manual');
});

T('★それぞれの形が指示どおりの見た目になる', () => {
  const o = { ymd: '2026-09-30', partnerCode: 'A001' };
  eq(D.formatNo({ ...o, format: 'seq', seq: 1 }), '00001');
  eq(D.formatNo({ ...o, format: 'y-seq', seq: 1 }), '2026-0001');
  eq(D.formatNo({ ...o, format: 'ym-seq', seq: 1 }), '202609-001');
  eq(D.formatNo({ ...o, format: 'p-ym-seq', seq: 1 }), 'A001-202609-01');
  eq(D.formatNo({ ...o, format: 'manual', seq: 1 }), '', '自由入力は自動で作らない');
});

T('★境界(空)：まだ1通も無ければ 1 番から', () => {
  eq(D.nextNo({ format: 'seq', ymd: '2026-09-30', existing: [] }), '00001');
  eq(D.nextNo({ format: 'y-seq', ymd: '2026-09-30', existing: [] }), '2026-0001');
  eq(D.nextNo({ format: 'p-ym-seq', ymd: '2026-09-30', partnerCode: 'A001', existing: [] }), 'A001-202609-01');
});

T('★境界(端)：桁があふれても切らずに伸ばす（99999 の次は 100000）', () => {
  eq(D.nextNo({ format: 'seq', ymd: '2026-09-30', existing: ['99998'] }), '99999');
  eq(D.nextNo({ format: 'seq', ymd: '2026-09-30', existing: ['99999'] }), '100000');
  eq(D.nextNo({ format: 'ym-seq', ymd: '2026-09-30', existing: ['202609-999'] }), '202609-1000');
});

T('★境界(不明)：末尾が数でない番号が混じっても落ちず、無視して数える', () => {
  eq(D.nextNo({ format: 'ym-seq', ymd: '2026-09-30', existing: ['202609-abc', '202609-002', ''] }), '202609-003');
});

T('★自分で決めた番号も「使用済み」として数える（自動採番がぶつからない）', () => {
  eq(D.nextNo({ format: 'ym-seq', ymd: '2026-09-30', existing: ['202609-001', '202609-050'] }), '202609-051');
});

T('★年をまたぐ：既定は1に戻す／「続ける」を選べば続く', () => {
  eq(D.nextNo({ format: 'y-seq', ymd: '2026-01-05', existing: ['2025-0127'] }), '2026-0001', '既定=戻す');
  eq(D.nextNo({ format: 'y-seq', ymd: '2026-01-05', existing: ['2025-0127'], resetYearly: false }), '2026-0128', '続ける');
  eq(D.nextNo({ format: 'ym-seq', ymd: '2026-01-05', existing: ['202512-007'], resetYearly: false }), '202601-008');
});

T('★「連番だけ」の形で「毎年1に戻す」は選ばせない（去年の番号と必ずぶつかる）', () => {
  const e = D.validateNumbering({ format: 'seq', resetYearly: true });
  ok(e.length > 0, '通ってしまった');
  ok(hasErr(e, 'ぶつか') || hasErr(e, '重複'), '理由が書かれていない: ' + JSON.stringify(e));
  eq(D.validateNumbering({ format: 'seq', resetYearly: false }).length, 0);
  eq(D.validateNumbering({ format: 'y-seq', resetYearly: true }).length, 0);
});

T('★取引先コードが空なら、空欄で作らず赤で止める（p-ym-seq）', () => {
  const e = D.validateNumbering({ format: 'p-ym-seq', partnerCode: '' });
  ok(e.length > 0, '空のコードで通ってしまった');
  eq(D.validateNumbering({ format: 'p-ym-seq', partnerCode: 'A001' }).length, 0);
  // ★空のまま作らせない（'-202609-01' のような番号を生まない）
  eq(D.formatNo({ format: 'p-ym-seq', seq: 1, ymd: '2026-09-30', partnerCode: '' }), '');
});

T('★倉庫に弾かれた時に番号を1つ進めて出し直せる（同時発行の再試行）', () => {
  eq(D.bumpNo('202609-003'), '202609-004');
  eq(D.bumpNo('2026-0001'), '2026-0002');
  eq(D.bumpNo('A001-202609-09'), 'A001-202609-10');
  eq(D.bumpNo('99999'), '100000');
  eq(D.bumpNo('手書き'), '', '数で終わらない番号は自動で進めない（人に決めさせる）');
});

/* ② 支払期限 -------------------------------------------------------- */
T('★決めていなければ期限を作らない（勝手な日付を出さない）', () => {
  eq(D.dueDateFrom('2026-08-31', { kind: 'none' }), '');
  eq(D.dueDateFrom('2026-08-31', null), '');
  eq(D.dueDateFrom('', { kind: 'eom' }), '');
  eq(D.dueDateFrom('2026-13-45', { kind: 'eom' }), '', '読めない日付');
});

T('★境界(月末・うるう年・年またぎ)を実物で測る', () => {
  eq(D.dueDateFrom('2026-02-10', { kind: 'eom' }), '2026-02-28', '平年の2月末');
  eq(D.dueDateFrom('2028-02-10', { kind: 'eom' }), '2028-02-29', 'うるう年の2月末');
  eq(D.dueDateFrom('2026-12-15', { kind: 'nextEom' }), '2027-01-31', '年またぎの翌月末');
  eq(D.dueDateFrom('2026-01-31', { kind: 'days', n: 30 }), '2026-03-02', '30日後');
  eq(D.dueDateFrom('2026-01-15', { kind: 'nextDay', n: 31 }), '2026-02-28', '翌月31日は無い→末日');
  eq(D.dueDateFrom('2026-12-20', { kind: 'nextDay', n: 10 }), '2027-01-10', '年またぎの翌月10日');
});

/* ③ 発行したら固まる ------------------------------------------------ */
T('★下書きだけが直せる・消せる。発行済みは取り消すだけ（行は残す）', () => {
  ok(D.canEdit({ status: 'draft' })); ok(D.canDelete({ status: 'draft' }));
  ok(!D.canEdit({ status: 'issued' })); ok(!D.canDelete({ status: 'issued' }));
  ok(!D.canEdit({ status: 'void' })); ok(!D.canDelete({ status: 'void' }));
  ok(D.canVoid({ status: 'issued' })); ok(!D.canVoid({ status: 'draft' }));
});

T('★固まる列の一覧が在る（倉庫のトリガと突き合わせる元になる）', () => {
  ok(D.FROZEN_FIELDS.length >= 8, '固まる列が少なすぎる');
  for (const f of ['no', 'partner_id', 'issue_ymd', 'due_ymd', 'lines', 'totals', 'snapshot', 'tax_mode', 'rounding']) {
    ok(D.FROZEN_FIELDS.indexOf(f) >= 0, f + ' が固まる列に入っていない');
  }
  ok(D.FROZEN_FIELDS.indexOf('status') < 0, 'status は取り消しのため変えられる必要がある');
  ok(D.FROZEN_FIELDS.indexOf('sent_at') < 0, 'sent_at は送った記録なので後から入る');
});

T('★発行の写し(snapshot)に、紙に出る物が全部入る', () => {
  const s = D.snapshotOf({
    partner: { id: 'pt_1', data: { name: '藤原建設株式会社', honor: '御中', addr: '今治市…', invoiceNo: 'T1', code: 'A001' } },
    org: { data: { yago: '合同会社ZEROact', addr: '今治市…', tel: '090', invoiceNo: 'T3500003003293', bank: '伊予銀行…' } },
    tax: { subtotal: 2000, taxTotal: 180, grandTotal: 2180, byRate: [{ pct: 10, base: 1000, tax: 100 }], exempt: { base: 0 }, hasReduced: true },
    templateId: 'std1',
  });
  eq(s.partner.name, '藤原建設株式会社');
  eq(s.partner.honor, '御中');
  eq(s.org.invoiceNo, 'T3500003003293');
  eq(s.totals.grandTotal, 2180);
  eq(s.templateId, 'std1');
  ok(s.byRate.length === 1, '税率ごとの区分が写しに入っていない');
  ok(s.hasReduced === true, '軽減の印が写しに入っていない');
});

/* ④ 取引先を消しても名前が出る -------------------------------------- */
T('★発行済みは写しの名前を出す（取引先を消しても紙と同じ名前が一覧に出る）', () => {
  const inv = { status: 'issued', partner_id: 'pt_1', snapshot: { partner: { name: '藤原建設株式会社' } } };
  eq(D.partnerNameOf(inv, {}), '藤原建設株式会社');
  // ★マスタを後から直しても、発行済みの一覧は紙のままであること
  eq(D.partnerNameOf(inv, { pt_1: { data: { name: '別の名前' } } }), '藤原建設株式会社');
});

T('★下書きはマスタの名前。マスタから消えていても空欄にしない', () => {
  const draft = { status: 'draft', partner_id: 'pt_1', snapshot: {} };
  eq(D.partnerNameOf(draft, { pt_1: { data: { name: 'Lounge Chouchou' } } }), 'Lounge Chouchou');
  const name = D.partnerNameOf(draft, {});
  ok(name.length > 0, '空欄になった');
  ok(name.indexOf('消え') >= 0 || name.indexOf('不明') >= 0, '取れなかったと分かる文言でない: ' + name);
  eq(D.partnerNameOf({ status: 'draft', partner_id: '', snapshot: {} }, {}).length > 0, true, '取引先未選択でも空にしない');
});

/* ⑤⑥ 入金 ---------------------------------------------------------- */
T('★入金が「未確認(取れなかった)」と「まだ0件」で違う（0件・異常なしにしない）', () => {
  const inv = { grand_total: 1000 };
  eq(D.paymentStateOf(inv, null).state, 'unknown');
  eq(D.paymentStateOf(inv, null).paid, null, '未確認の金額は0ではなくnull');
  eq(D.paymentStateOf(inv, []).state, 'unpaid');
  eq(D.paymentStateOf(inv, []).paid, 0);
});

T('★分けて払われても全部数える（一部入金・複数回）', () => {
  const inv = { grand_total: 10000 };
  const r = D.paymentStateOf(inv, [
    { amount: 3000, ymd: '2026-08-01' },
    { amount: 4000, ymd: '2026-08-20' },
  ]);
  eq(r.paid, 7000); eq(r.remain, 3000); eq(r.state, 'partial'); eq(r.count, 2);
  eq(r.lastYmd, '2026-08-20', '最後に入った日');
});

T('★ちょうど払い終わったら入金済', () => {
  eq(D.paymentStateOf({ grand_total: 10000 }, [{ amount: 10000, ymd: '2026-08-01' }]).state, 'paid');
});

T('★過入金を0でクランプしない（多く入った事実を残す）', () => {
  const r = D.paymentStateOf({ grand_total: 10000 }, [{ amount: 12000, ymd: '2026-08-01' }]);
  eq(r.paid, 12000); eq(r.remain, -2000); eq(r.state, 'over');
});

T('★消した入金・別の請求の入金は数えない', () => {
  const inv = { id: 'iv_1', grand_total: 10000 };
  const r = D.paymentStateOf(inv, [
    { invoice_id: 'iv_1', amount: 3000, ymd: '2026-08-01' },
    { invoice_id: 'iv_1', amount: 5000, ymd: '2026-08-02', deleted_at: '2026-08-03T00:00:00Z' },
    { invoice_id: 'iv_2', amount: 9999, ymd: '2026-08-02' },
  ]);
  eq(r.paid, 3000); eq(r.count, 1);
});

T('★返金(マイナス)も記録として数える', () => {
  const r = D.paymentStateOf({ grand_total: 10000 }, [{ amount: 10000, ymd: '2026-08-01' }, { amount: -2000, ymd: '2026-09-01' }]);
  eq(r.paid, 8000); eq(r.state, 'partial'); eq(r.remain, 2000);
});

T('★0円の請求は「入金済」に化けない（0で割らない・状態が壊れない）', () => {
  eq(D.paymentStateOf({ grand_total: 0 }, []).state, 'unpaid');
  eq(D.paymentStateOf({ grand_total: 0 }, [{ amount: 100, ymd: '2026-08-01' }]).state, 'over');
});

/* ⑦ 発行前の検査 ---------------------------------------------------- */
const goodInv = () => ({
  doc_type: 'invoice', no: '202609-001', partner_id: 'pt_1',
  issue_ymd: '2026-09-30', due_ymd: '2026-10-31',
  tax_mode: 'inclusive', rounding: 'floor',
  lines: [{ name: '運転業務委託料', amount: 1100, rate: 10 }],
});
const goodPartner = { id: 'pt_1', data: { name: '藤原建設株式会社', code: 'A001' } };
const goodOrg = { data: { yago: '合同会社ZEROact', invoiceNo: 'T3500003003293' } };

T('★そろっていれば発行できる', () => {
  const r = D.validateInvoice({ inv: goodInv(), partner: goodPartner, org: goodOrg });
  ok(r.ok, JSON.stringify(r.errors));
});

T('★足りない物は空欄で通さず、1つずつ理由を出す', () => {
  const cases = [
    [{ partner_id: '' }, '取引先'],
    [{ no: '' }, '番号'],
    [{ issue_ymd: '' }, '請求日'],
    [{ lines: [] }, '明細'],
    [{ due_ymd: '2026-09-29' }, '期限'],
  ];
  for (const [patch, word] of cases) {
    const r = D.validateInvoice({ inv: { ...goodInv(), ...patch }, partner: goodPartner, org: goodOrg });
    ok(!r.ok, JSON.stringify(patch) + ' が通ってしまった');
    ok(hasErr(r.errors, word), JSON.stringify(patch) + ' の理由に「' + word + '」が無い: ' + JSON.stringify(r.errors));
  }
});

T('★合計0円の請求書は出せない（マイナスは出せるが注意を出す）', () => {
  const zero = { ...goodInv(), lines: [{ name: 'x', amount: 0, rate: 10 }] };
  ok(!D.validateInvoice({ inv: zero, partner: goodPartner, org: goodOrg }).ok, '0円が通った');
  const minus = { ...goodInv(), lines: [{ name: '値引', amount: -1100, rate: 10 }] };
  const r = D.validateInvoice({ inv: minus, partner: goodPartner, org: goodOrg });
  ok(r.ok, 'マイナスが赤になった（返金の請求書は出せるべき）');
  ok(r.warnings.length > 0, 'マイナスなのに注意が出ていない');
});

T('★登録番号が無い時は「赤」ではなく「注意」（免税事業者も請求書は出す）', () => {
  const r = D.validateInvoice({ inv: goodInv(), partner: goodPartner, org: { data: { yago: 'x' } } });
  ok(r.ok, '登録番号が無いだけで赤になった');
  ok(hasErr(r.warnings, '登録番号'), '注意が出ていない: ' + JSON.stringify(r.warnings));
});

T('★取引先がマスタに無いのに発行しようとしたら赤', () => {
  const r = D.validateInvoice({ inv: goodInv(), partner: null, org: goodOrg });
  ok(!r.ok); ok(hasErr(r.errors, '取引先'));
});

T('★税の計算が通らない明細は、そのまま理由が出る（税率が空など）', () => {
  const bad = { ...goodInv(), lines: [{ name: 'x', amount: 1100 }] };
  const r = D.validateInvoice({ inv: bad, partner: goodPartner, org: goodOrg });
  ok(!r.ok); ok(hasErr(r.errors, '税率'), JSON.stringify(r.errors));
});

T('★1000行までは通り、1001行は赤（黙って切らない）', () => {
  const mk = (n) => Array.from({ length: n }, (_, i) => ({ name: 'r' + i, amount: 100, rate: 10 }));
  ok(D.validateInvoice({ inv: { ...goodInv(), lines: mk(1000) }, partner: goodPartner, org: goodOrg }).ok);
  ok(!D.validateInvoice({ inv: { ...goodInv(), lines: mk(1001) }, partner: goodPartner, org: goodOrg }).ok);
});

T('★見積は後から足せる形になっている（同じ棚・別の番号系列・請求への変換元を持てる）', () => {
  ok(D.DOC_TYPES.indexOf('quote') >= 0, '見積の型が無い');
  const q = { ...goodInv(), doc_type: 'quote' };
  ok(D.validateInvoice({ inv: q, partner: goodPartner, org: goodOrg }).ok, '見積が検査を通らない');
  // 見積→請求：変換元を持つ形であること
  const conv = D.convertQuoteToInvoice({ id: 'iv_q1', doc_type: 'quote', no: 'Q-001', lines: q.lines, partner_id: 'pt_1' });
  eq(conv.doc_type, 'invoice');
  eq(conv.quote_from, 'iv_q1');
  eq(conv.status, 'draft');
  eq(conv.no, '', '番号は請求の系列で採り直す（見積の番号を持ち込まない）');
});

/* ⑧ 実データの形（代行請求で毎日動いている形が入るか） ---------------- */
T('★実測した規模（1通 最大69行）が余裕で入る', () => {
  const lines = Array.from({ length: 69 }, (_, i) => ({ name: '行き先' + i, amount: 1300, rate: 10 }));
  const r = D.validateInvoice({ inv: { ...goodInv(), lines }, partner: goodPartner, org: goodOrg });
  ok(r.ok, JSON.stringify(r.errors));
  eq(r.tax.grandTotal, 89700);
});

/* ── 角印（会社の印） ────────────────────────────────────────────
   ★押してある／無いで相手の受け取り方が変わる★ので、入れられる・大きさを変えられる・
   消せる を揃える。上限を超えた画像は ★黙って縮めずに赤で返す★
   （黙って縮めると「押したはずの印が欠けている」に押した本人が気づけない）。 */
T('★角印に使えるのは PNG / JPEG の画像だけ（外のURLは受けない）', () => {
  ok(D.validateSeal('data:image/png;base64,iVBORw0KGgo=').ok);
  ok(D.validateSeal('data:image/jpeg;base64,/9j/4AAQ').ok);
  ok(!D.validateSeal('https://example.com/hanko.png').ok, '外のURLが通っている');
  ok(!D.validateSeal('data:image/svg+xml;base64,PHN2Zz4=').ok, 'SVGが通っている');
  ok(!D.validateSeal('').ok, '空が通っている');
  eq(D.validateSeal('').reason, '画像が選ばれていません');
});

T('★大きすぎる画像は黙って縮めずに赤で返す（何KBかを言う）', () => {
  const big = 'data:image/png;base64,' + 'A'.repeat(500 * 1024);
  const r = D.validateSeal(big);
  ok(!r.ok, '上限を超えた画像が通っている');
  ok(/KB/.test(r.reason), '大きさを言っていない: ' + r.reason);
  ok(r.bytes > D.SEAL_MAX_BYTES, '大きさを測れていない');
  // 上限のすぐ下は通る（境界）
  const justUnder = 'data:image/png;base64,' + 'A'.repeat(Math.floor(D.SEAL_MAX_BYTES * 4 / 3) - 8);
  ok(D.validateSeal(justUnder).ok, '上限のすぐ下が通らない');
});

T('★角印の大きさは 10〜40mm（既定21mm）', () => {
  eq(D.sealSizeMm(), D.SEAL_DEFAULT_MM);
  eq(D.sealSizeMm(0), D.SEAL_MIN_MM);
  eq(D.sealSizeMm(999), D.SEAL_MAX_MM);
  eq(D.sealSizeMm('abc'), D.SEAL_DEFAULT_MM, '数でない値が通っている');
  eq(D.sealSizeMm(25.4), 25, '小数が丸められていない');
});

T('★発行した時の印は写しに残る（あとで印を替えても、出した紙は変わらない）', () => {
  const seal = 'data:image/png;base64,iVBORw0KGgo=';
  const s = D.snapshotOf({
    at: '2026-09-30T00:00:00.000Z', partner: { id: 'p', data: { name: 'A' } },
    org: { data: { yago: 'B', sealDataUrl: seal, sealSizeMm: 30 } },
    tax: { subtotal: 1, taxTotal: 0, grandTotal: 1 }, templateId: 'std1',
  });
  eq(s.org.sealDataUrl, seal, '写しに印が残っていない');
  eq(s.org.sealSizeMm, 30, '写しに大きさが残っていない');
});

/* ── 入金を「記録する」側 ────────────────────────────────────────
   ★1回＝1行で足す（上書きしない）★ の相方＝「何を1行として受け付けるか」。
   代行請求は `PAYMENTS["会社::月"]` に1行だけ持って上書きしていた＝分割払いの履歴が消えた。
   ここは「1件が記録できる形か」だけを決める（数え方は paymentStateOf が持つ）。 */
T('★入金の方法は選び所から出す（画面に文字を直書きしない）', () => {
  ok(Array.isArray(D.PAY_METHODS) && D.PAY_METHODS.length >= 3, '方法の一覧が無い');
  ok(D.PAY_METHODS.indexOf('振込') >= 0, '「振込」が無い');
  ok(D.PAY_METHODS.indexOf('相殺') >= 0, '「相殺」が無い（現金と振込だけでは足りない）');
});

T('★0円は記録できない（倉庫の check amount <> 0 と同じ言葉で断る）', () => {
  const r = D.validateReceipt({ ymd: '2026-10-05', amount: '0' });
  eq(r.ok, false, '0円が通っている');
  ok(hasErr(r.errors, '0円'), '理由が0円の話になっていない: ' + r.errors.join('/'));
  // 境界：1円は通る／−1円（返金）も通る
  eq(D.validateReceipt({ ymd: '2026-10-05', amount: '1' }).ok, true, '1円が通らない');
  eq(D.validateReceipt({ ymd: '2026-10-05', amount: '-1' }).ok, true, '返金（マイナス）が通らない');
});

T('★金額は1円単位の数字だけ（小数・文字・空を通さない）', () => {
  eq(D.validateReceipt({ ymd: '2026-10-05', amount: '1000.5' }).ok, false, '小数が通っている');
  eq(D.validateReceipt({ ymd: '2026-10-05', amount: 'あいう' }).ok, false, '文字が通っている');
  eq(D.validateReceipt({ ymd: '2026-10-05', amount: '' }).ok, false, '空が通っている');
  eq(D.validateReceipt({ ymd: '2026-10-05', amount: '40,000' }).ok, true, '桁区切りが弾かれている（人はこう打つ）');
  eq(D.receiptAmountOf('40,000'), 40000, '桁区切りが読めていない');
  eq(D.receiptAmountOf(' 40000 '), 40000, '前後の空白で読めなくなる');
});

T('★★読めない金額を0にしない（0にすると「0円の入金」として記録される）★★', () => {
  eq(D.receiptAmountOf('あいう'), null);
  eq(D.receiptAmountOf(''), null);
  eq(D.receiptAmountOf('1000.5'), null, '小数を切り捨てて通していない');
  eq(D.receiptAmountOf('０'), null, '全角が数字として読まれている');
  eq(D.receiptAmountOf('0'), 0, '0そのものは0として読む（弾くのは validateReceipt の仕事）');
});

T('★入金日が無い・読めない物は記録できない（勝手に今日にしない）', () => {
  eq(D.validateReceipt({ ymd: '', amount: '1000' }).ok, false, '日付なしが通っている');
  eq(D.validateReceipt({ ymd: '2026-02-30', amount: '1000' }).ok, false, '存在しない日が通っている');
  eq(D.validateReceipt({ ymd: '2026/10/05', amount: '1000' }).ok, false, '形の違う日付が通っている');
  eq(D.validateReceipt({ ymd: '2026-10-05', amount: '1000' }).ok, true);
});

T('★理由は「押す前」と「押した後」で同じ物を使う（1件目だけをボタンに入れる）', () => {
  const r = D.validateReceipt({ ymd: '', amount: '' });
  eq(r.ok, false);
  ok(r.errors.length >= 2, '理由が1つしか出ていない: ' + r.errors.join('/'));
  ok(r.errors[0].length <= 24, '★1つ目の理由がボタンに入らない長さ★: ' + r.errors[0]);
});

T('★備考・方法の長さに蓋がある（1行に長文を貼られて画面が崩れない）', () => {
  eq(D.validateReceipt({ ymd: '2026-10-05', amount: '1', memo: 'あ'.repeat(200) }).ok, true, '200文字が通らない（境界）');
  eq(D.validateReceipt({ ymd: '2026-10-05', amount: '1', memo: 'あ'.repeat(201) }).ok, false, '201文字が通っている');
  eq(D.validateReceipt({ ymd: '2026-10-05', amount: '1', method: 'あ'.repeat(21) }).ok, false, '方法の蓋が無い');
});

/* ★手計算★ 請求 110,000 に 40,000＋30,000 が入った ＝ 残り 40,000（一部入金）
   さらに 80,000 で 150,000 ＝ 40,000 の過入金。★どちらも0でクランプしない★ */
T('★★分けて払われた3回を、1件も落とさずに数える（手計算 110,000 / 70,000 / 40,000）★★', () => {
  const rs = [
    { invoice_id: 'iv_1', amount: 40000, ymd: '2026-10-05' },
    { invoice_id: 'iv_1', amount: 30000, ymd: '2026-10-20' },
    { invoice_id: 'iv_2', amount: 99999, ymd: '2026-10-21' },   // 別の請求＝混ぜない
  ];
  const r = D.paymentStateOf({ id: 'iv_1', grand_total: 110000 }, rs);
  eq(r.paid, 70000, '入っている合計');
  eq(r.remain, 40000, '残り');
  eq(r.count, 2, '回数');
  eq(r.state, 'partial');
  eq(r.lastYmd, '2026-10-20', '最後に入った日');
  // 3回目（80,000）を足すと過入金 40,000
  const over = D.paymentStateOf({ id: 'iv_1', grand_total: 110000 },
    rs.concat([{ invoice_id: 'iv_1', amount: 80000, ymd: '2026-10-25' }]));
  eq(over.paid, 150000);
  eq(over.remain, -40000, '★過入金が0でクランプされている★');
  eq(over.state, 'over');
  // 消した入金は数えない（行は残るが合計には入らない）
  const del = D.paymentStateOf({ id: 'iv_1', grand_total: 110000 },
    rs.concat([{ invoice_id: 'iv_1', amount: 80000, ymd: '2026-10-25', deleted_at: '2026-10-26T00:00:00Z' }]));
  eq(del.paid, 70000, '消した入金を数えている');
  eq(del.count, 2);
});

/* ── ②（a）見積 → 請求 → 領収 が1本の線でつながる ─────────────────
   ★領収書は doc_type ではない★＝①で作った pay_receipts の1行から出す紙。棚を増やさない。 */

T('★紙の呼び名は1か所（画面・紙・Excel・ファイル名で別々に書かない）', () => {
  eq(D.docLabel('invoice'), '請求書');
  eq(D.docLabel('quote'), '見積書');
  eq(D.docLabel('receipt'), '領収書');
  eq(D.docLabel(''), '請求書', '知らない種類は請求書に倒す');
  // ★領収書は「請求書という物」の種類ではない（棚の doc_type に混ぜない）
  eq(D.DOC_TYPES.indexOf('receipt'), -1, '★領収書が doc_type に混ざっている（棚を増やす道）★');
  eq(D.DOC_KINDS.join(','), 'invoice,quote,receipt');
});

/* ★手計算★ 請求 202610-001 に入金が3回 → 領収番号は -1 / -2 / -3
   2回目を消して4回目を足すと ★-4★（★-2 を使い回さない＝同じ番号の紙を2枚 外に出さない★） */
T('★★領収番号＝請求番号＋枝番。消した入金の枝番を使い回さない★★', () => {
  const all = [
    { id: 'rc_1', created_at: '2026-10-05T00:00:00Z' },
    { id: 'rc_2', created_at: '2026-10-20T00:00:00Z', deleted_at: '2026-10-21T00:00:00Z' },
    { id: 'rc_3', created_at: '2026-10-25T00:00:00Z' },
  ];
  eq(D.receiptBranchOf(all, 'rc_1'), 1);
  eq(D.receiptBranchOf(all, 'rc_2'), 2, '消した行が席を外している');
  eq(D.receiptBranchOf(all, 'rc_3'), 3);
  eq(D.receiptNoOf('202610-001', 1), '202610-001-1');
  eq(D.receiptNoOf('202610-001', 3), '202610-001-3');
  // 4回目を足す＝消した -2 は空いたままで、次は -4
  const plus = all.concat([{ id: 'rc_4', created_at: '2026-11-05T00:00:00Z' }]);
  eq(D.receiptBranchOf(plus, 'rc_4'), 4, '★消した入金の枝番(-2)を使い回している＝同じ番号の紙が2枚 出る★');
  eq(D.receiptNoOf('202610-001', D.receiptBranchOf(plus, 'rc_4')), '202610-001-4');
});

T('★番号が作れない時は「それらしい番号」をでっち上げない（空を返す）', () => {
  eq(D.receiptNoOf('', 1), '');
  eq(D.receiptNoOf('202610-001', 0), '');
  eq(D.receiptNoOf('202610-001', -1), '');
  eq(D.receiptBranchOf([], 'rc_x'), 0, '居ない入金に枝番を作っている');
  eq(D.receiptBranchOf(null, 'rc_x'), 0);
});

T('★並びは「作った順」で決まる（開くたびに枝番が変わらない）', () => {
  const a = [
    { id: 'rc_b', created_at: '2026-10-02T00:00:00Z' },
    { id: 'rc_a', created_at: '2026-10-01T00:00:00Z' },
  ];
  eq(D.receiptBranchOf(a, 'rc_a'), 1, '渡された順に引きずられている');
  eq(D.receiptBranchOf(a, 'rc_b'), 2);
  // created_at が同じなら id で決める（並びを最後まで決める）
  const same = [{ id: 'rc_z', created_at: 'X' }, { id: 'rc_a', created_at: 'X' }];
  eq(D.receiptBranchOf(same, 'rc_a'), 1);
});

/* ★収入印紙★ 国税庁 No.7105：記載金額 5万円未満は非課税
   ＝境界は ★49,999は要らない／50,000は要る★（5万円ちょうどは課税） */
T('★★収入印紙の注意は5万円で切り替わる（国税庁 No.7105・境界を実数で固定）★★', () => {
  eq(D.STAMP_FREE_UNDER, 50000, '法律のしきい値');
  eq(D.stampNeeded(49999), false, '5万円未満は非課税');
  eq(D.stampNeeded(50000), true, '★5万円ちょうどは課税（未満が非課税）★');
  eq(D.stampNeeded(50001), true);
  eq(D.stampNeeded(0), false);
  eq(D.stampNeeded(-50000), false, '返金に印紙の注意を出している');
  eq(D.stampNeeded('あ'), false, '読めない額で注意を出している');
});

/* ★国税庁 No.7124★ 消費税額等を区分して書いてあれば、その消費税額は「記載金額」に入れない。
   国税庁の例そのもの：商品販売代金 48,000円／消費税額等 4,800円／合計 52,800円
     → ★記載金額 48,000円＝5万円未満＝非課税★
   同じ 52,800円でも ★区分せずに1行で書けば 記載金額は52,800円＝要る★
   ＝★「税込いくらか」ではなく「紙にどう書いてあるか」で変わる★ */
T('★★消費税額を区分して書けば、その分は記載金額に入らない（No.7124・国税庁の例で固定）★★', () => {
  eq(D.stampBaseOf({ amount: 52800, taxTotal: 4800, taxSeparate: true }), 48000, '記載金額');
  eq(D.stampNeeded({ amount: 52800, taxTotal: 4800, taxSeparate: true }), false,
    '★区分して書いてあるのに印紙が要ると言っている★');
  eq(D.stampNeeded({ amount: 52800, taxTotal: 4800, taxSeparate: false }), true,
    '★区分せず1行で書いた52,800円で、印紙が要らないと言っている★');
  eq(D.stampNeeded(52800), true, '数だけ渡した時は税込で判定する');
  // 区分しても5万円以上なら要る（税抜 50,000＋税 5,000＝55,000）
  eq(D.stampBaseOf({ amount: 55000, taxTotal: 5000, taxSeparate: true }), 50000);
  eq(D.stampNeeded({ amount: 55000, taxTotal: 5000, taxSeparate: true }), true, '税抜5万円ちょうどは要る');
});

T('★分けて書ける消費税額が無い時は、税込のまま判定する（安全側に倒す）', () => {
  eq(D.stampBaseOf({ amount: 52800, taxSeparate: true }), 52800, '税額が無いのに引いている');
  eq(D.stampBaseOf({ amount: 52800, taxTotal: 0, taxSeparate: true }), 52800, '0円の税額で区分している');
  eq(D.stampBaseOf({ amount: 52800, taxTotal: 60000, taxSeparate: true }), 52800, '税額が受取額より大きい形');
  eq(D.stampBaseOf({ amount: 'あ', taxSeparate: true }), null, '読めない額を0にしている');
  eq(D.stampBaseOf(null), null);
});

T('★注意書きは「要る時だけ」出る／★いくらの印紙かは書かない★', () => {
  eq(D.stampNote(49999), '', '要らないのに出している');
  const s = D.stampNote(50000);
  ok(s, '要るのに出ていない');
  ok(/収入印紙/.test(s), '印紙の話になっていない: ' + s);
  ok(/場合があります/.test(s), '言い切っている（会社ごとの事情がある）: ' + s);
  ok(/営業に関しない/.test(s), '非課税の例外を言っていない: ' + s);
  // ★印紙の「額」を書かない（200円 などは金額帯で変わる）
  ok(!/\d+\s*円の(収入)?印紙/.test(s), '★印紙の額を書いている★: ' + s);
  ok(!/200円/.test(s), '★印紙の額を書いている★: ' + s);
  // ★しきい値は数から文を作る（説明文に法定の数を直書きしない）
  ok(s.indexOf(String(Math.round(D.STAMP_FREE_UNDER / 10000)) + '万円') >= 0, 'しきい値が数から作られていない: ' + s);
});

T('★★見積→請求で、品目・数量・単価・税区分・件名・備考・源泉をそのまま引き継ぐ★★', () => {
  const q = {
    id: 'iv_q9', doc_type: 'quote', no: 'Q-202609-001', partner_id: 'pt_1',
    tax_mode: 'inclusive', rounding: 'ceil', template_id: 'std1',
    lines: [{ name: '運転業務委託料', qty: 3, unit: '式', price: 1100, rate: 10, nontax: false, extra: { 行き先: '今治' } }],
    data: {
      subject: '9月分', memo: '振込手数料は貴社にて', gensen: true,
      term: { kind: 'nextEom', n: 0 }, noMode: 'manual', lead: 'いつもお世話になっております。',
      cols: { items: ['#', '品名・内容', '行き先'], widths: { '#': 28 }, aligns: { '行き先': 'left' } },
    },
  };
  const c = D.convertQuoteToInvoice(q);
  eq(c.doc_type, 'invoice');
  eq(c.quote_from, 'iv_q9', 'どの見積から作ったかを残していない');
  eq(c.no, '', '見積の番号を持ち込んでいる');
  eq(c.data.noMode, 'auto', '★手打ちの番号の決め方まで持ち込んでいる★');
  eq(c.issue_ymd, '', '見積の日付を持ち込んでいる');
  // ★人に写させない物
  eq(c.lines.length, 1);
  eq(c.lines[0].name, '運転業務委託料');
  eq(c.lines[0].qty, 3); eq(c.lines[0].price, 1100); eq(c.lines[0].rate, 10);
  eq(c.lines[0].extra['行き先'], '今治', '★会社が足した列の中身が落ちている★');
  eq(c.tax_mode, 'inclusive', '税の入れ方が落ちている');
  eq(c.rounding, 'ceil', '丸め方が落ちている');
  eq(c.data.subject, '9月分', '★件名を もう一度 打たせている★');
  eq(c.data.memo, '振込手数料は貴社にて', '★備考が落ちている★');
  eq(c.data.gensen, true, '★源泉が落ちている（振り込まれる額が黙って変わる）★');
  eq(c.data.term.kind, 'nextEom', '支払期限の決め方が落ちている');
  eq(c.data.cols.items.join(','), '#,品名・内容,行き先', '★列の並びが落ちている★');
  // ★中身を共有していない（見積を直したら請求まで変わる、を作らない）
  c.lines[0].name = 'かきかえ'; c.data.cols.items.push('X');
  eq(q.lines[0].name, '運転業務委託料', '★元の見積まで書き換わった（参照を共有している）★');
  eq(q.data.cols.items.length, 3, '★元の見積の列まで増えた★');
});

T('★★消した入金からは領収書を作れない／返金からも作れない★★', () => {
  const live = { id: 'rc_1', amount: 40000, ymd: '2026-10-05' };
  const inv = { id: 'iv_1', status: 'issued' };
  eq(D.canReceipt(live, inv).ok, true, D.canReceipt(live, inv).reason);
  eq(D.canReceipt({ ...live, deleted_at: '2026-10-06T00:00:00Z' }, inv).ok, false,
    '★消した入金から領収書が出せてしまう★');
  ok(/消した入金/.test(D.canReceipt({ ...live, deleted_at: 'x' }, inv).reason), '理由が言えていない');
  eq(D.canReceipt({ ...live, amount: -2000 }, inv).ok, false, '返金から領収書が出せてしまう');
  eq(D.canReceipt({ ...live, ymd: '' }, inv).ok, false, '日付が読めないのに出せてしまう');
  eq(D.canReceipt({ ...live, amount: 0 }, inv).ok, false, '0円で出せてしまう');
  eq(D.canReceipt(live, { id: 'iv_1', status: 'draft' }).ok, false, '下書きの請求から領収書が出せてしまう');
  eq(D.canReceipt(null).ok, false);
  // 理由は短い（ボタンの中に入る長さ）
  ok(D.canReceipt({ ...live, deleted_at: 'x' }, inv).reason.length <= 24, '理由がボタンに入らない');
});

/* ── ②（b）★黙って小さくならない★ ────────────────────────────── */
T('★★品名が空なのに金額が入っている行は、出す前に赤で止める★★', () => {
  const raw = [
    { name: '運転代行', amount: '1000' },
    { name: '', amount: '5000' },            // ★2行目：品名だけ空＝何の代金か分からない
    { name: '', qty: '', price: '', amount: '', memo: '', extra: {} },  // 3行目：まるごと空
  ];
  const r = D.rowIssuesOf(raw);
  eq(r.blankName.join(','), '2', '品名だけ空の行を見つけていない');
  eq(r.dropped.join(','), '3', 'まるごと空の行を数えていない');

  const chk = D.validateInvoice({
    inv: { ...goodInv(), lines: [{ name: '運転代行', amount: 1000, rate: 10 }, { name: '', amount: 5000, rate: 10 }] },
    rawLines: raw, partner: goodPartner, org: goodOrg,
  });
  eq(chk.ok, false, '★品名が空のまま出せてしまう★');
  ok(hasErr(chk.errors, '2行目'), '何行目か言っていない: ' + chk.errors.join('/'));
  ok(hasErr(chk.errors, '品名'), '理由が品名の話になっていない: ' + chk.errors.join('/'));
});

T('★まるごと空の行は止めないが、★消したと言う★（黙って捨てない）', () => {
  const raw = [{ name: '運転代行', amount: '1000' }, { name: '', extra: {} }, { name: '', extra: {} }];
  const chk = D.validateInvoice({
    inv: { ...goodInv(), lines: [{ name: '運転代行', amount: 1000, rate: 10 }] },
    rawLines: raw, partner: goodPartner, org: goodOrg,
  });
  eq(chk.ok, true, '空行だけで発行を止めている: ' + chk.errors.join('/'));
  ok(chk.warnings.some((w) => /2・3行目/.test(w)), '★黙って捨てている（消したと言っていない）★: ' + chk.warnings.join('/'));
  ok(chk.warnings.some((w) => /2行/.test(w)), '何行 消したか言っていない: ' + chk.warnings.join('/'));
});

T('★単位や備考だけ入っている行も「品名が空」で止める（金額だけを見ない）', () => {
  eq(D.rowIssuesOf([{ name: '', unit: '式' }]).blankName.join(','), '1');
  eq(D.rowIssuesOf([{ name: '', memo: 'あとで' }]).blankName.join(','), '1');
  eq(D.rowIssuesOf([{ name: '', extra: { 行き先: '今治' } }]).blankName.join(','), '1');
  eq(D.rowIssuesOf([{ name: '  ', amount: '1' }]).blankName.join(','), '1', '空白だけの品名を通している');
});

T('★rawLines を渡さない呼び方も壊れていない（今までの検査はそのまま通る）', () => {
  const chk = D.validateInvoice({ inv: goodInv(), partner: goodPartner, org: goodOrg });
  eq(chk.ok, true, chk.errors.join('/'));
});


/* ── ③ ★実物の器：控除・前月ラベル★ ────────────────────────────
   ★引き算は2種類ある。混ぜると消費税がズレる★（実物の式で確かめた）
     値引き行 … 明細の中。課税の対象が減る＝税額も減る（seikyu-tax.js の受け持ち）
     控除     … 明細の外。★税込の合計から引く＝税額は動かない★ */

/* ★恒等式② 請求額 ＝（税抜＋値引き）＋ 消費税 − 控除★
   ★1円一致（実物）★ 八木工業：266,000 ＋ 26,600 ＝ 292,600 − 11,340 ＝ 281,260 */
T('★★八木工業の実物と1円も違わない（控除の箱＝税込から引く・税額は動かない）★★', () => {
  const TAX = require_(path.join(ROOT, 'seikyu/lib/seikyu-tax.js'));
  const SR = require_(path.join(ROOT, 'kyuyo/lib/shouhizei-ritsu.js'));
  const STD = Math.round(SR.hyojun * 10000) / 100;
  // ★人工（常傭）＝数量×単価★ 実物は =1900*I11（単価が式に直書き・人数は表に出ない列）だが、
  //   器では ★ふつうの1行★ として出せる。
  const t = TAX.compute({ lines: [{ name: '工事代金', qty: 140, price: 1900, rate: STD }], taxMode: 'exclusive', rounding: 'floor' });
  ok(t.ok, t.errors.join('/'));
  eq(t.subtotal, 266000, '工事代金');
  eq(t.taxTotal, 26600, '消費税');
  eq(t.grandTotal, 292600, '税込の合計');

  const inv = { data: { deductions: [{ name: '弁当代　矢原', amount: 11340 }] } };
  const ded = D.deductTotalOf(inv);
  eq(ded, 11340, '控除の合計');
  eq(D.billedOf(t, null, ded), 281260, '★請求額（実物 281,260）★');
  // ★控除は税額を動かさない★
  eq(t.taxTotal, 26600, '控除で消費税が動いた');
});

T('★控除は「読めない行が1つでもあれば null」（0にしない＝引き忘れた紙を出さない）', () => {
  eq(D.deductTotalOf({ data: { deductions: [] } }), 0, '0件は0');
  eq(D.deductTotalOf({ data: { deductions: [{ name: 'a', amount: 100 }, { name: 'b', amount: 200 }] } }), 300);
  eq(D.deductTotalOf({ data: { deductions: [{ name: 'a', amount: 'あ' }] } }), null, '★読めない控除を0にしている★');
  eq(D.deductTotalOf({ data: { deductions: [{ name: 'a', amount: 1.5 }] } }), null, '1円未満を通している');
  eq(D.deductTotalOf({}), 0);
  // ★読めない控除がある紙は、請求額を出さない（null）
  eq(D.billedOf({ grandTotal: 1000 }, null, null), 1000, '控除を渡さない時は今までどおり');
  eq(D.billedOf({ grandTotal: 1000 }, null, NaN), null, '★読めない控除で数を作っている★');
});

T('★控除は 名前が要る／0円・マイナスは止める（何を引いたか分からない紙を出さない）', () => {
  const of = (d) => D.validateDeductions({ data: { deductions: d } });
  eq(of([{ name: '弁当代', amount: 11340 }]).ok, true);
  eq(of([{ name: '', amount: 100 }]).ok, false, '名前が空で通っている');
  ok(hasErr(of([{ name: '', amount: 100 }]).errors, '名前'), '理由が名前の話になっていない');
  eq(of([{ name: 'a', amount: '' }]).ok, false, '金額が空で通っている');
  eq(of([{ name: 'a', amount: 0 }]).ok, false, '0円が通っている');
  eq(of([{ name: 'a', amount: -100 }]).ok, false, '★マイナスの控除が通っている（足すなら明細の行）★');
  eq(of([{ name: 'a', amount: 1.5 }]).ok, false, '1円未満が通っている');
  // 何行目かを言う
  ok(hasErr(of([{ name: 'a', amount: 1 }, { name: '', amount: 1 }]).errors, '2行目'), '何行目か言っていない');
  // 蓋
  const many = Array.from({ length: D.MAX_DEDUCTIONS + 1 }, () => ({ name: 'x', amount: 1 }));
  eq(of(many).ok, false, '控除の行数に蓋が無い');
});

T('★控除が在る紙は 発行前の検査でも止まる（画面と別々に判定しない）', () => {
  const bad = { ...goodInv(), data: { deductions: [{ name: '', amount: 100 }] } };
  const r = D.validateInvoice({ inv: bad, partner: goodPartner, org: goodOrg });
  eq(r.ok, false, '★名前の無い控除のまま発行できてしまう★');
  ok(hasErr(r.errors, '控除'), '理由が控除の話になっていない: ' + r.errors.join('/'));
});

/* ★「◯年◯月分」＝請求日の前月★（実物32枚の =TEXT(EDATE(請求日,-1),"yyyy年m月分")） */
T('★★「◯年◯月分」は請求日の前月（1月→前年12月・うるう年・月末）★★', () => {
  eq(D.periodLabelOf('2026-08-01'), '2026年7月分', '実物 ENEOS と同じ');
  eq(D.periodLabelOf('2026-07-31'), '2026年6月分');
  eq(D.periodLabelOf('2026-01-01'), '2025年12月分', '★1月に出す紙が前年12月分になっていない★');
  eq(D.periodLabelOf('2026-01-31'), '2025年12月分');
  eq(D.periodLabelOf('2024-03-01'), '2024年2月分', 'うるう年');
  eq(D.periodLabelOf('2024-03-31'), '2024年2月分');
  eq(D.periodLabelOf('2026-12-31'), '2026年11月分');
  // ★読めない日付は でっち上げない★
  eq(D.periodLabelOf(''), '');
  eq(D.periodLabelOf('2026-02-30'), '', '存在しない日で月を作っている');
  eq(D.periodLabelOf('2026/08/01'), '', '形の違う日付で月を作っている');
});

T('★品名は在るのに金額も「数量×単価」も無い行は止める（黙って0円にしない）', () => {
  // ★実物32枚のうち9枚は単価の列が無い★＝「単価が空」は普通。金額を直に打つ。
  eq(D.rowIssuesOf([{ name: 'a', amount: '1000' }]).noAmount.length, 0, '金額を直に打った行を止めている');
  eq(D.rowIssuesOf([{ name: 'a', qty: '2', price: '500' }]).noAmount.length, 0, '数量×単価の行を止めている');
  eq(D.rowIssuesOf([{ name: 'a', qty: '2' }]).noAmount.join(','), '1', '★数量だけで0円の行が通る★');
  eq(D.rowIssuesOf([{ name: 'a' }]).noAmount.join(','), '1', '★品名だけの行が0円で通る★');
  eq(D.rowIssuesOf([{ name: 'a', unit: '式' }]).noAmount.join(','), '1');
  const chk = D.validateInvoice({
    inv: { ...goodInv(), lines: [{ name: 'a', amount: 1000, rate: 10 }] },
    rawLines: [{ name: 'a', amount: '1000' }, { name: 'b' }],
    partner: goodPartner, org: goodOrg,
  });
  eq(chk.ok, false, '★金額の無い行のまま発行できてしまう★');
  ok(hasErr(chk.errors, '2行目'), '何行目か言っていない: ' + chk.errors.join('/'));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
