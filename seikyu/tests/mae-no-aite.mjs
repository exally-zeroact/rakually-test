/* mae-no-aite.mjs — ★前の 取引先の 中身が 新しい 1通に 残らない★
 * =============================================================================
 * 司さん 2026-10-23（客の 実画面・スマホ）
 *   「新しい請求書を 入力から 作る時に、★前の取引先の中身が 反映されてる時が ある★」
 *
 * ★本物の seikyu-app.js を jsdom で 動かして 踏んだ 道★（直す前の 実測）
 *   ・新しく 作る → A社を 選ぶ（前回の 1通から 件名・備考・明細・控除・支払期限が 入る）
 *     → ★B社に 選び直す★（選び間違い）
 *       B社に 前回が 無い … ★A社の 件名・備考・明細・控除・支払期限・源泉が B社の 1通に 残った★
 *       B社に 前回が 在る … 件名は B社に 替わるが ★A社の 明細と 控除が 残り★、B社の 明細は 入らなかった
 *     （前回から 当てるのは「まだ 何も 打っていない 時だけ」＝A社から 入れた 行を「打った 行」と 見ていた）
 *   ・A社を 選んで 1.5秒 待つと 自動で 下書きに しまわれ id が 付く
 *     → その後に B社へ 選び直すと「id の ある 1通には 当てない」で ★何も 外さず 当て直しも しない★
 *   ・「＋ 新しい請求書」で 白紙に しても、前の 1通の「前回（No.…）と 同じで 用意しました」
 *     「前回から」の 札が 残った（白紙なのに「件名・明細 1行を 入れた」と 言う）。
 *     しかも「当てた」の 印（S.guessDone）が 残り、同じ 相手の 2通目に 前回が 当たらなかった。
 *
 * ★決め（コードの 注記から）★
 *   ・前回の 1通から 当てるのは ★同じ 相手の 時だけ★（違う 相手の 中身が 入るのは 誤り）
 *   ・同じ 相手なら 明細と 控除も 名前・金額ごと 入れる（2026-09-09 司さん「記憶してたら 金額変えたりするだけ」）
 *   ・★打った 字は 消さない★＝自動で 入れた 値の まま の 物だけ 外す（人が 直した 物は 残す）
 *   ・お金の 計算は 1文字も 変えない＝B社の 1通の 合計は「最初から B社を 選んだ 時」と 同じに なる
 *
 * 使い方: node seikyu/tests/mae-no-aite.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let JSDOM; try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('★jsdomが入っていません。この検証は飛ばせません（SKIPを緑と呼ばない）。npm install してください。'); process.exit(1); }

const SELF = process.argv.includes('--self-test');
let pass = 0, fail = 0;
const T = async (n, fn) => { try { await fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m || 'false'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ' … 期待 ' + JSON.stringify(b) + ' / 実際 ' + JSON.stringify(a)); };
const nemuru = (ms) => new Promise((r) => setTimeout(r, ms));

const rel = 'seikyu/index.html', file = path.join(ROOT, rel);
const html = fs.readFileSync(file, 'utf8');
const line = (na, kin) => ({ name: na, qty: '1', unit: '式', price: String(kin), amount: String(kin), rate: 10, memo: '' });

/* ★前回 出した 1通★（A社＝件名・備考・明細・控除・税込み・源泉 あり／C社＝件名と 明細だけ） */
const MAE_A = {
  id: 'vA0', no: 'A-001', status: 'issued', doc_type: 'invoice', partner_id: 'pA',
  issue_ymd: '2026-09-30', tax_mode: 'inclusive', rounding: 'floor',
  lines: [line('A社の工事', 42000), line('A社の補修', 18000)],
  data: { term: { kind: 'nextEom', n: 0 }, subject: 'A社の件名', memo: 'A社の備考', gensen: true,
    deductions: [{ name: 'A社の控除', amount: '1000' }] },
  totals: { grandTotal: 60000 },
};
const MAE_C = {
  id: 'vC0', no: 'C-001', status: 'issued', doc_type: 'invoice', partner_id: 'pC',
  issue_ymd: '2026-09-30', tax_mode: 'exclusive', rounding: 'floor',
  lines: [line('C社の品', 5000)], data: { subject: 'C社の件名', memo: '' }, totals: { grandTotal: 5500 },
};

let APP_KAE = null;   /* 自分ためしで 壊した 本文（ふだんは null＝本物を 読む） */
/* ★1つの 道ごとに 画面を 1から 立てる★（前の 道の 状態を 持ち越さない） */
async function tateru(o) {
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''),
    { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' + rel });
  const win = dom.window, doc = win.document;
  win.fetch = () => Promise.reject(new Error('no net'));
  win.scrollTo = () => {}; win.print = () => {}; win.confirm = () => true;
  win.URL.createObjectURL = () => 'blob:fake';
  for (const m of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
    const src = m[1].split('?')[0];
    if (/^https?:/.test(src) || ['supa-config.js', 'auth.js', 'env-badge.js'].indexOf(src.split('/').pop()) >= 0) continue;
    const p = path.resolve(path.dirname(file), src);
    if (!fs.existsSync(p)) continue;
    const el = doc.createElement('script');
    el.textContent = (APP_KAE && /seikyu-app\.js$/.test(src)) ? APP_KAE : fs.readFileSync(p, 'utf8');
    doc.body.appendChild(el);
  }
  await nemuru(300);
  doc.getElementById('app').hidden = false;
  const A = win.SeikyuApp, S = A._state;
  S.org = { yago: '合同会社Rakunally', addr: '東京都架空区見本台1-2-3', invoiceNo: 'T1234567890123' };
  S.partners = [
    { id: 'pA', sort: 1, data: { name: 'A工業', honor: '御中', gensen: true, payTerm: { kind: 'nextEom', n: 0 } } },
    { id: 'pB', sort: 2, data: { name: 'B商店', honor: '御中' } },
    { id: 'pC', sort: 3, data: { name: 'C建設', honor: '御中' } },
  ];
  if (o && o.hitori) S.partners = [S.partners[0]];
  const kura = [JSON.parse(JSON.stringify(MAE_A)), JSON.parse(JSON.stringify(MAE_C))];
  let n = 0;
  const shimau = (v) => {
    const c = JSON.parse(JSON.stringify(v)); if (!c.id) c.id = 'new' + (++n);
    const i = kura.findIndex((x) => x.id === c.id); if (i >= 0) kura[i] = c; else kura.push(c);
    return c;
  };
  S.invoices = kura.slice(); S.receipts = []; S.fil = 'all'; S.docType = 'invoice';
  S.store = {
    partners: { list: () => Promise.resolve(S.partners) },
    invoices: {
      list: (k) => Promise.resolve(k === 'quote' ? [] : JSON.parse(JSON.stringify(kura))),
      usedNos: () => Promise.resolve(kura.map((x) => x.no)),
      saveDraft: (v) => Promise.resolve({ ok: true, id: shimau(v).id }),
      issue: (row) => { const c = shimau(Object.assign({}, row, { status: 'issued' })); return Promise.resolve({ ok: true, id: c.id, no: c.no }); },
      removeDraft: () => Promise.resolve({ ok: true }),
      markSent: () => Promise.resolve({ ok: true }),
    },
    org: { save: (p) => Promise.resolve({ ok: true, data: Object.assign({}, S.org, p) }) },
    receipts: { list: () => Promise.resolve([]) },
  };
  A._bindForTest();
  await A._loadList();
  const $ = (id) => doc.getElementById(id);
  const t = {
    win, doc, A, S, $, kura,
    erabu: async (id) => {
      $('e-partner').value = id;
      ok($('e-partner').value === id, '★相手の 選びに ' + id + ' が 無い★（空振り）');
      $('e-partner').dispatchEvent(new win.Event('change', { bubbles: true }));
      await nemuru(30);
    },
    osu: async (sel) => { const b = doc.querySelector(sel); ok(b, '★押す物が 無い★ ' + sel); b.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); await nemuru(60); },
    utsu: (el, val) => { el.value = val; el.dispatchEvent(new win.Event('input', { bubbles: true })); el.dispatchEvent(new win.Event('change', { bubbles: true })); },
    naka: () => {
      const v = S.cur, d = v.data || {};
      return {
        lines: (v.lines || []).map((l) => l.name).filter(Boolean),
        prices: (v.lines || []).map((l) => String(l.price || '')).filter(Boolean),
        ded: (d.deductions || []).map((x) => x.name),
        subject: d.subject || '', memo: d.memo || '',
        term: (d.term && d.term.kind) || 'none', due: v.due_ymd || '', gensen: !!d.gensen,
        tax: v.tax_mode, round: v.rounding,
        e_subject: $('e-subject').value, e_memo: $('e-memo').value, e_due: $('e-due').value,
        e_lines: [...doc.querySelectorAll('#lines-body [data-f="name"]')].map((i) => i.value).filter(Boolean),
        tag: ['tag-subject', 'tag-term', 'tag-gensen'].filter((id) => $(id) && $(id).style.display !== 'none'),
        okBun: $('edit-ok').style.display !== 'none' ? $('edit-ok').textContent : '',
        goukei: (() => { const r = A._recalcForTest(); return r && r.ok ? r.grandTotal : null; })(),
      };
    },
  };
  return t;
}

/* ★A社の 物が 1つも 残っていない★ を 見る（中身と 画面の 両方） */
function aNashi(x, doko) {
  const aji = JSON.stringify([x.lines, x.ded, x.subject, x.memo, x.e_subject, x.e_memo, x.e_lines]);
  ok(aji.indexOf('A社') < 0, '★' + doko + ' に A社の 中身が 残った★ ' + aji);
  ok(!/A-001/.test(x.okBun), '★' + doko + ' に「前回（No.A-001）と 同じで 用意しました」が 残った★: ' + x.okBun);
}

console.log('\n[mae-no-aite] 前の 取引先の 中身が 新しい 1通に 残らない' + (SELF ? '（自分ためし）' : ''));

const MICHI = [];

/* ★比べる 相手★＝最初から B社／C社を 選んだ 1通（直した後の 1通は これと 同じで なければ ならない） */
const sugu = {};
for (const pid of ['pB', 'pC']) {
  const t = await tateru(); t.A._new(); await t.erabu(pid); sugu[pid] = t.naka();
}

MICHI.push(['★① 空振りしない＝A社を 選ぶと 前回の 中身が 本当に 入る（入らなければ 外す試験が 意味を 持たない）', async () => {
  const t = await tateru(); t.A._new(); await t.erabu('pA');
  const x = t.naka();
  eq(x.lines.join('|'), 'A社の工事|A社の補修', '前回の 明細');
  eq(x.ded.join('|'), 'A社の控除', '前回の 控除');
  eq(x.subject, 'A社の件名'); eq(x.memo, 'A社の備考'); eq(x.term, 'nextEom'); eq(x.gensen, true);
  eq(x.tax, 'inclusive', '前回の 税の 入れ方');
  ok(x.due, '支払期限の 日付が 入っていない');
}]);

MICHI.push(['★② A社 → B社（前回 なし）に 選び直すと A社の 中身は 1つも 残らない＝最初から B社と 同じ', async () => {
  const t = await tateru(); t.A._new(); await t.erabu('pA'); await t.erabu('pB');
  const x = t.naka(), b = sugu.pB;
  aNashi(x, 'B社の 1通');
  eq(x.lines.length, 0, '明細'); eq(x.ded.length, 0, '控除');
  eq(x.term, b.term, '支払期限の 決め'); eq(x.due, b.due, '支払期限の 日付'); eq(x.e_due, b.e_due, '支払期限の 欄');
  eq(x.gensen, b.gensen, '★源泉が A社の まま★'); eq(x.tax, b.tax, '★税の 入れ方が A社の まま★'); eq(x.round, b.round, '端数');
  eq(x.tag.join(','), '', '★「前回から」の 札が 残った★');
  eq(x.goukei, b.goukei, '★合計が 最初から B社の 1通と 違う★');
}]);

MICHI.push(['★③ A社 → C社（前回 あり）＝C社の 前回が 入り A社の 明細・控除は 残らない', async () => {
  const t = await tateru(); t.A._new(); await t.erabu('pA'); await t.erabu('pC');
  const x = t.naka(), c = sugu.pC;
  aNashi(x, 'C社の 1通');
  eq(x.lines.join('|'), 'C社の品', '★C社の 前回の 明細が 入らない★');
  eq(x.e_lines.join('|'), 'C社の品', '画面の 明細');
  eq(x.subject, 'C社の件名'); eq(x.ded.length, 0, '控除');
  eq(x.tax, c.tax, '税の 入れ方'); eq(x.gensen, c.gensen, '源泉'); eq(x.term, c.term, '支払期限');
  eq(x.goukei, c.goukei, '★合計が 最初から C社の 1通と 違う★');
  ok(/C-001/.test(x.okBun), '★C社の 前回から 入れたと 言っていない★: ' + x.okBun);
}]);

MICHI.push(['★④ A社を 選んで 自動で しまわれた（id が 付いた）後に B社へ 選び直しても A社の 中身は 残らない', async () => {
  const t = await tateru(); t.A._new(); await t.erabu('pA');
  await nemuru(1800);
  ok(t.S.cur.id, '★空振り★ 自動の しまいが 走っていない（id が 無い）');
  const id = t.S.cur.id;
  await t.erabu('pB');
  const x = t.naka();
  aNashi(x, 'しまった 後の B社の 1通');
  eq(x.lines.length, 0, '明細'); eq(x.ded.length, 0, '控除'); eq(x.gensen, false, '源泉'); eq(x.tax, 'exclusive', '税の 入れ方');
  eq(t.S.cur.id, id, '★同じ 下書きの まま で ない★（2通目を 作った）');
  /* しまった 後に C社へ ＝ C社の 前回が 当たる */
  await t.erabu('pC');
  eq(t.naka().lines.join('|'), 'C社の品', '★しまった 後は 当て直さない★');
}]);

MICHI.push(['★⑤ 打った 字は 消さない＝自分で 直した 件名と 明細は B社に 変えても 残る（外すのは 自動の 値の まま の 物だけ）', async () => {
  const t = await tateru(); t.A._new(); await t.erabu('pA');
  t.utsu(t.$('e-subject'), '自分で打った件名');
  const pr = t.doc.querySelector('#lines-body tr [data-f="price"]') || t.doc.querySelector('#lines-body tr [data-f="amount"]');
  ok(pr, '★明細の 金額の 欄が 無い★');
  t.utsu(pr, '43000');
  await t.erabu('pB');
  const x = t.naka();
  eq(x.subject, '自分で打った件名', '★打った 件名が 消えた★');
  ok(x.prices.indexOf('43000') >= 0, '★打ち直した 明細が 消えた★ ' + JSON.stringify(x.prices));
  eq(x.memo, '', '★自動の 備考は 外れていない★');
  eq(x.ded.length, 0, '★自動の 控除は 外れていない★');
  /* 前回の 在る C社へ ＝ 当てても 打った 件名は 上書きしない */
  await t.erabu('pC');
  eq(t.naka().subject, '自分で打った件名', '★C社の 前回が 打った 件名を 上書きした★');
  eq(t.$('e-subject').value, '自分で打った件名', '★画面の 件名が 上書きされた★');
}]);

MICHI.push(['★⑥ 保存の 後に「＋ 新しい請求書」＝前の 知らせ・札を 残さない', async () => {
  const t = await tateru(); t.A._new(); await t.erabu('pA');
  await t.A._saveDraftForTest();
  await t.osu('#b-new');
  const x = t.naka();
  eq(x.lines.length + x.ded.length, 0, '中身'); eq(x.subject + x.memo, '', '件名・備考');
  eq(x.tag.join(','), '', '★「前回から」の 札が 白紙に 残った★');
  eq(x.okBun, '', '★前の 1通の 知らせが 白紙に 残った★');
}]);

MICHI.push(['★⑦ 発行の 後に「＋ 新しい請求書」→ B社＝A社の 中身も 発行の 知らせも 残らない', async () => {
  const t = await tateru(); t.A._new(); await t.erabu('pA');
  await t.A._issue();
  eq(t.S.cur.status, 'issued', '★空振り★ 発行できていない');
  await t.osu('#b-new');
  eq(t.naka().okBun, '', '★発行の 知らせが 白紙に 残った★');
  await t.erabu('pB');
  aNashi(t.naka(), '発行の 後の B社の 1通');
}]);

MICHI.push(['★⑧ 相手が 1社だけ＝2通目の「新しく」でも 同じ 相手の 前回が 当たる（言う事と 中身が 合う）', async () => {
  const t = await tateru({ hitori: true }); t.A._new();
  eq(t.naka().lines.join('|'), 'A社の工事|A社の補修', '1通目');
  await t.A._saveDraftForTest();
  t.A._new();
  const x = t.naka();
  eq(x.lines.join('|'), 'A社の工事|A社の補修', '★同じ 相手の 2通目に 前回が 当たらない★');
  ok(/前回/.test(x.okBun) && /明細 2行/.test(x.okBun), '★入れた事を 言っていない★: ' + x.okBun);
}]);

MICHI.push(['★⑨ 一覧から A社の 下書きを「修正」で 開いた 後に「＋ 新しい請求書」→ B社＝A社の 中身は 残らない', async () => {
  const t = await tateru();
  t.kura.push({ id: 'dA', no: 'A-002', status: 'draft', doc_type: 'invoice', partner_id: 'pA', issue_ymd: '2026-10-20',
    lines: [line('A下書きの行', 100)], data: { subject: 'A下書きの件名', memo: 'A下書きの備考' }, totals: {} });
  await t.A._loadList();
  await t.osu('[data-open="dA"]');
  eq(t.naka().subject, 'A下書きの件名', '★空振り★ 下書きが 開けていない');
  await t.osu('#b-new');
  await t.erabu('pB');
  const x = t.naka();
  ok(JSON.stringify(x).indexOf('A下書き') < 0, '★A社の 下書きの 中身が 残った★');
  aNashi(x, '修正の 後の B社の 1通');
}]);

/* ★下の「入力」タブの 道★（2026-10-23 指示役の 決め）
   ＝保存か 発行を 終えた 後の「入力」は 新しい 白紙。修正で 開いて まだ 終えていない 1通は 続き。
   ★書き換わらない事は 倉庫（kura）への 書き込みで 見る★（画面の 字だけで 閉じない） */
const tabu = async (t, scr) => t.osu('.bn[data-scr="' + scr + '"]');
async function bTeUtsu(t) {
  /* 白紙で B社を 選び 1行 打って 自動で しまわれるのを 待つ */
  await t.erabu('pB');
  const na = t.doc.querySelector('#lines-body tr [data-f="name"]');
  ok(na, '★明細の 品名の 欄が 無い★');
  t.utsu(na, 'B社の品');
  const kin = t.doc.querySelector('#lines-body tr [data-f="price"]') || t.doc.querySelector('#lines-body tr [data-f="amount"]');
  t.utsu(kin, '3000');
  await nemuru(1800);
}
for (const [ban, owari] of [['⑩', '保存'], ['⑪', '発行']]) {
  MICHI.push(['★' + ban + ' ' + owari + 'の 後に 一覧 → 下の「入力」＝新しい 白紙／B社で 打っても A社の 1通は 書き換わらない（倉庫で 見る）', async () => {
    const t = await tateru(); t.A._new(); await t.erabu('pA');
    if (owari === '保存') await t.A._saveDraftForTest(); else await t.A._issue();
    const aId = t.S.cur.id;
    ok(aId, '★空振り★ ' + owari + 'できていない');
    const aMae = JSON.stringify(t.kura.find((x) => x.id === aId));
    await tabu(t, 'scr-list'); await tabu(t, 'scr-edit');
    const x = t.naka();
    eq(t.$('edit-h').textContent, '新しい請求書', '★' + owari + 'を 終えた 1通が そのまま 出た★');
    ok(!t.S.cur.id && !t.S.cur.partner_id, '★白紙で ない★ id=' + t.S.cur.id + ' 相手=' + t.S.cur.partner_id);
    aNashi(x, owari + 'の 後の 入力');
    await bTeUtsu(t);
    const aAto = t.kura.find((x2) => x2.id === aId);
    eq(JSON.stringify(aAto), aMae, '★A社の 1通が 倉庫で 書き換わった★');
    const b = t.kura.find((x2) => x2.partner_id === 'pB');
    ok(b && b.id !== aId, '★B社の 1通が 別に しまわれていない★');
  }]);
}
MICHI.push(['★⑫ 修正で 開いて 打ちかけ（まだ 保存も 発行も していない）→ 一覧・設定 → 下の「入力」＝その 1通の 続き', async () => {
  const t = await tateru();
  t.kura.push({ id: 'dA', no: 'A-002', status: 'draft', doc_type: 'invoice', partner_id: 'pA', issue_ymd: '2026-10-20',
    lines: [line('A下書きの行', 100)], data: { subject: 'A下書きの件名', memo: '' }, totals: {} });
  await t.A._loadList();
  await t.osu('[data-open="dA"]');
  t.utsu(t.$('e-subject'), '打ちかけの件名');
  await tabu(t, 'scr-list'); await tabu(t, 'scr-edit');
  eq(t.S.cur.id, 'dA', '★打ちかけの 1通が 白紙に 替わった★');
  eq(t.$('e-subject').value, '打ちかけの件名', '★打ちかけが 消えた★');
  await tabu(t, 'scr-set'); await tabu(t, 'scr-edit');
  eq(t.S.cur.id, 'dA', '★設定から 戻ると 白紙に 替わった★');
  eq(t.$('e-subject').value, '打ちかけの件名', '★設定から 戻ると 打ちかけが 消えた★');
}]);
MICHI.push(['★⑬ 発行済みを 修正で 開いて 直しかけ → 一覧 → 下の「入力」＝続き（発行済みも 後から 直せる決まりの まま）', async () => {
  const t = await tateru();
  await t.osu('[data-open="vA0"]');
  eq(t.S.cur.status, 'issued', '★空振り★ 発行済みが 開けていない');
  t.utsu(t.$('e-memo'), '発行後の直しかけ');
  await tabu(t, 'scr-list'); await tabu(t, 'scr-edit');
  eq(t.S.cur.id, 'vA0', '★発行済みの 直しかけが 白紙に 替わった★');
  eq(t.$('e-memo').value, '発行後の直しかけ', '★直しかけが 消えた★');
}]);

if (!SELF) {
  for (const [na, fn] of MICHI) await T(na, fn);
} else {
  /* ★自分ためし★＝直しの 要の 行を 1つずつ 本当に 壊して 立て直し、その 道が ★赤に なる★事を 見る
     （「在る」を 数えるだけで 終わらせない）。壊す前に 行末を そろえる（Windows の CRLF と CI の LF の 差） */
  const app = fs.readFileSync(path.join(ROOT, 'seikyu', 'js', 'seikyu-app.js'), 'utf8').replace(/\r\n/g, '\n');
  const kowasu = [
    ['相手を 変えた時に 自動の 値を 外すのを やめる', '      var hazushita = jidoHazusu(S.cur);', '      var hazushita = [];', '★②'],
    ['自動で 入れた 値を 覚えるのを やめる', '    keys.forEach(function (k) { S.jido.vals[k] = JSON.stringify(jidoKata(v, k)); });', '', '★③'],
    ['新しく 作る時に 当ての 印・札を 戻すのを やめる', '    S.guessDone = false; S.guess = null; S.guessApplied = null;', '', '★⑧'],
    ['新しく 作る時に 前の 知らせを 消すのを やめる', "    box('edit-ok', ''); box('edit-err', ''); box('edit-warn', '');", '', '★⑦'],
    ['id の 付いた 新しい 下書きに 当て直さない', '    if (!v || locked() || (v.id && !jidoNoCur(v)) || S.guessDone) return;', '    if (!v || locked() || v.id || S.guessDone) return;', '★④'],
    ['保存・発行の 後の「入力」を 白紙に しない', "        if (t === 'scr-edit' && (!S.cur || owattaNoMama())) { newInvoice(); return; }", "        if (t === 'scr-edit' && !S.cur) { newInvoice(); return; }", '★⑩'],
    ['保存を 終えた 印を 付けない', '      S.owatta = S.cur;', '', '★⑩'],
    ['発行を 終えた 印を 付けない', '      S.owatta = hakko;', '', '★⑪'],
    ['打ちかけでも 白紙に する', '    if (!v || !S.owatta || S.owatta !== v || S.dirty) return false;', '    if (!v) return false;', '★⑫'],
    ['当てる時に 打った 件名を 上書きする', "    if (!String(v.data.subject || '').trim()) { v.data.subject = g.subject; jido.push('subject'); }", "    { v.data.subject = g.subject; jido.push('subject'); }", '★⑤'],
  ];
  for (const [na, a, b, michi] of kowasu) {
    await T('壊すと 赤: ' + na, async () => {
      ok(app.split(a).length === 2, '★壊す所が 1つ 見つからない★ … ' + a);
      const m = MICHI.find(([n]) => n.startsWith(michi));
      ok(m, '★見張る 道が 無い★ ' + michi);
      APP_KAE = app.replace(a, b);
      let aka = false;
      try { await m[1](); } catch (e) { aka = true; }
      APP_KAE = null;
      ok(aka, '★壊したのに ' + michi + ' が 緑のまま＝この 試験は 何も 見ていない★');
    });
  }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
