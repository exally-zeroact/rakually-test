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

/* E社＝前回は ★税込みだけ★（件名・明細・控除なし）＝外す物が 税だけの 道（taiketsu S2） */
const MAE_E = {
  id: 'vE0', no: 'E-001', status: 'issued', doc_type: 'invoice', partner_id: 'pE',
  issue_ymd: '2026-09-30', tax_mode: 'inclusive', rounding: 'floor',
  lines: [], data: {}, totals: {},
};

/* F社＝前回は ★端数 切り上げだけ★（任意4＝端数の 字を 中身と 合わせる） */
const MAE_F = {
  id: 'vF0', no: 'F-001', status: 'issued', doc_type: 'invoice', partner_id: 'pF',
  issue_ymd: '2026-09-30', tax_mode: 'exclusive', rounding: 'ceil',
  lines: [], data: {}, totals: {},
};

/* G社＝前回も 税込み・明細 1行（止1＝税が 同じなら 今まで通り 足す） */
const MAE_G = {
  id: 'vG0', no: 'G-001', status: 'issued', doc_type: 'invoice', partner_id: 'pG',
  issue_ymd: '2026-09-30', tax_mode: 'inclusive', rounding: 'floor',
  lines: [line('G社の品', 3300)], data: {}, totals: {},
};

/* H社＝前回は ★税抜き・明細 0行・控除 1行だけ★（taiketsu ⑦ 止1＝税が 違っても 控除は 円の 額なので 足す） */
const MAE_H = {
  id: 'vH0', no: 'H-001', status: 'issued', doc_type: 'invoice', partner_id: 'pH',
  issue_ymd: '2026-09-30', tax_mode: 'exclusive', rounding: 'floor',
  lines: [], data: { deductions: [{ name: 'H社の控除', amount: '2000' }] }, totals: {},
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
    { id: 'pE', sort: 4, data: { name: 'E設備', honor: '御中' } },
    { id: 'pF', sort: 5, data: { name: 'F電気', honor: '御中' } },
    { id: 'pG', sort: 6, data: { name: 'G工務', honor: '御中' } },
    { id: 'pH', sort: 7, data: { name: 'H設計', honor: '御中' } },
  ];
  if (o && o.hitori) S.partners = [S.partners[0]];
  /* 会社が 足した 列「現場」（taiketsu 止3） */
  if (o && o.cols) S.org.invoiceCols = { items: ['#', '品名・内容', '数量', '単位', '単価', '金額', '消費税', '現場'] };
  /* ★返事が 遅い 倉庫★＝★送った 時点で 写し★、返事だけ 遅らせる（後で 写すと 待つ間に 打った 字まで 入って 偽の 緑・taiketsu 止1） */
  const osoi = (o && o.osoi) || 0;
  const matsu = (x) => (osoi ? new Promise((r) => setTimeout(() => r(x), osoi)) : Promise.resolve(x));
  const kura = [JSON.parse(JSON.stringify(MAE_A)), JSON.parse(JSON.stringify(MAE_C)), JSON.parse(JSON.stringify(MAE_E)), JSON.parse(JSON.stringify(MAE_F)), JSON.parse(JSON.stringify(MAE_G)), JSON.parse(JSON.stringify(MAE_H))];
  let n = 0;
  const shimau = (v) => {
    const c = JSON.parse(JSON.stringify(v)); if (!c.id) c.id = 'new' + (++n);
    const i = kura.findIndex((x) => x.id === c.id); if (i >= 0) kura[i] = c; else kura.push(c);
    return c;
  };
  S.invoices = kura.slice(); S.receipts = []; S.fil = 'all'; S.docType = 'invoice';
  S.store = {
    partners: {
      list: () => Promise.resolve(S.partners),
      /* ★前に 消した 取引先★＝この 試験では 無い（空の 一覧）。
         入力の「この相手を作る」は 毎回 これを 読んで 判じる（⑤ ptNayose）＝読めないと 作らないので 空で 返す */
      gone: () => Promise.resolve([]),
      /* その場で 作る＝同じ 名前が 在れば その 相手（already） */
      create: (d) => {
        const aru = S.partners.find((x) => x.data.name === d.name);
        if (aru) return Promise.resolve({ ok: true, id: aru.id, already: true });
        const p = { id: 'pN' + S.partners.length, sort: 9, data: { name: d.name, honor: '御中' } };
        S.partners = S.partners.concat([p]);
        return Promise.resolve({ ok: true, id: p.id });
      },
    },
    invoices: {
      list: (k) => Promise.resolve(k === 'quote' ? [] : JSON.parse(JSON.stringify(kura))),
      usedNos: () => Promise.resolve(kura.map((x) => x.no)),
      saveDraft: (v) => { const c = shimau(v); return matsu({ ok: true, id: c.id }); },
      issue: (row) => { const c = shimau(Object.assign({}, row, { status: 'issued' })); return matsu({ ok: true, id: c.id, no: c.no }); },
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

/* ★taiketsu の 止める 6件（2026-10-23）★ ＝ どの 道も「最初から その 相手を 選んだ 1通」と 合計を 比べる */
async function hajimeKara(pid, ato) {
  const t = await tateru(); t.A._new(); await t.erabu(pid);
  if (ato) await ato(t);
  return t.naka();
}
async function tsukuru(t, na) {
  await t.erabu('__new__').catch(() => {});
  t.$('pt-new-name').value = na;
  await t.osu('#b-pt-new');
  await nemuru(60);
}
MICHI.push(['★⑭ A社 → その場で 新しい 相手を 作る（S1）＝A社の 中身も「前回（No.A-001）と同じ」も 残らない', async () => {
  const t = await tateru(); t.A._new(); await t.erabu('pA');
  await tsukuru(t, 'D商事');
  const x = t.naka();
  ok(t.S.cur.partner_id && t.S.cur.partner_id !== 'pA', '★空振り★ 新しい 相手に なっていない');
  aNashi(x, 'その場で 作った 相手の 1通');
  eq(x.gensen, false, '★源泉が A社の まま★'); eq(x.tax, 'exclusive', '★税の 入れ方が A社の まま★');
  eq(x.term, 'none', '★支払期限が A社の まま★'); eq(x.due, '', '★期日が A社の まま★');
  eq(x.goukei, sugu.pB.goukei, '★合計が 最初から 前回の 無い 相手を 選んだ 1通と 違う★');
}]);
MICHI.push(['★⑮ A社 → その場で 作る（もう在る B商店＝r.already）＝A社の 中身は 残らない（S1）', async () => {
  const t = await tateru(); t.A._new(); await t.erabu('pA');
  await tsukuru(t, 'B商店');
  eq(t.S.cur.partner_id, 'pB', '★空振り★ もう在る 相手が 選ばれていない');
  const x = t.naka();
  aNashi(x, 'もう在った 相手の 1通');
  eq(x.gensen, sugu.pB.gensen, '源泉'); eq(x.tax, sugu.pB.tax, '税の 入れ方'); eq(x.due, sugu.pB.due, '期日');
  eq(x.goukei, sugu.pB.goukei, '★合計が 最初から B社と 違う★');
}]);
MICHI.push(['★⑯ 税込みだけ 前回から 入った 相手（E社）→ 60000 を 打つ → B社（指示役の 決め）＝打った 行が 残るので 税込みの まま・合計は 60000 の まま・欄も そろい そう 言う', async () => {
  const t = await tateru(); t.A._new(); await t.erabu('pE');
  eq(t.S.cur.tax_mode, 'inclusive', '★空振り★ E社の 前回の 税込みが 入っていない');
  const na = t.doc.querySelector('#lines-body tr [data-f="name"]'); t.utsu(na, '打った品'); t.utsu(t.doc.querySelector('#lines-body tr [data-f="qty"]'), '1');
  const kin = t.doc.querySelector('#lines-body tr [data-f="price"]') || t.doc.querySelector('#lines-body tr [data-f="amount"]');
  t.utsu(kin, '60000'); await nemuru(20);
  const mae = t.naka().goukei;
  eq(mae, 60000, '★空振り★ 税込みで 60000 に なっていない');
  await t.erabu('pB');
  const x = t.naka();
  eq(x.tax, 'inclusive', '★打った 金額の 意味（税込み）を 変えた★');
  eq(t.$('e-taxmode').value, x.tax, '★画面の 税の 入れ方が 中と 違う★（中は ' + x.tax + '）');
  eq(x.goukei, 60000, '★打った 60000 の 合計が 変わった★');
  ok(/打った 明細が 残っているので/.test(x.okBun) && /税込み/.test(x.okBun), '★そのままに した事を 言っていない★: ' + x.okBun);
}]);
MICHI.push(['★⑰ A社 → 請求日を 変える（期日が 動く）→ B社（S4）＝期日も 外れる', async () => {
  const t = await tateru(); t.A._new(); await t.erabu('pA');
  const mae = t.S.cur.due_ymd;
  t.utsu(t.$('e-issue'), '2026-11-05'); await nemuru(30);
  ok(t.S.cur.due_ymd && t.S.cur.due_ymd !== mae, '★空振り★ 請求日を 変えても 期日が 動いていない');
  await t.erabu('pB');
  const x = t.naka();
  eq(x.term, 'none', '支払期限'); eq(x.due, '', '★期日が A社の まま 残った★'); eq(x.e_due, '', '★画面の 期日が 残った★');
  aNashi(x, '請求日を 変えた 後の B社の 1通');
  const b = await hajimeKara('pB', async (t2) => { t2.utsu(t2.$('e-issue'), '2026-11-05'); await nemuru(30); });
  eq(x.due, b.due, '★期日が 最初から B社の 1通と 違う★'); eq(x.goukei, b.goukei, '★合計が 違う★');
}]);
MICHI.push(['★⑱ A社 → 1行の 単価を 直す → C社（S5）＝触っていない A社の 行は 外れ、直した 行は 残り、C社の 前回も 入る・言う', async () => {
  const t = await tateru(); t.A._new(); await t.erabu('pA');
  const kin = t.doc.querySelector('#lines-body tr [data-f="price"]') || t.doc.querySelector('#lines-body tr [data-f="amount"]');
  t.utsu(kin, '43000'); await nemuru(20);
  await t.erabu('pC');
  const x = t.naka();
  eq(x.lines.join('|'), 'A社の工事', '★行が 違う★（直した 1行だけの はず＝C社の 前回は 税の 入れ方が 違うので 足さない・止1）');
  ok(x.prices.indexOf('43000') >= 0, '★直した 行が 消えた★');
  eq(x.ded.length, 0, '★A社の 控除が 残った★');
  ok(/明細 1行/.test(x.okBun) && /残しています/.test(x.okBun) && /足していません/.test(x.okBun), '★外した・残した・足さなかった 行を 言っていない★: ' + x.okBun);
  /* 比べる 相手＝最初から C社を 選び、残った 1行と ★同じ 行★ を 足した 1通（行の 中身は そのまま 写す） */
  const nokori = JSON.parse(JSON.stringify(t.S.cur.lines.find((l) => l.name === 'A社の工事')));
  /* ★打った 行が 残る＝税の 入れ方は A社の 税込みの まま（指示役の 決め）＝比べる 相手も 税込みに する */
  eq(x.tax, 'inclusive', '★打った 行が 残るのに 税の 入れ方を 変えた★');
  const c = await hajimeKara('pB', async (t2) => { t2.utsu(t2.$('e-taxmode'), 'inclusive'); await nemuru(10); t2.S.cur.lines = [nokori]; await nemuru(10); });
  eq(x.goukei, c.goukei, '★合計が 最初から C社で 同じ 行を 打った 1通と 違う★');
}]);
MICHI.push(['★⑲ A社 → ×で 1行 消す → B社（S5）＝残りの A社の 行も 外れる', async () => {
  const t = await tateru(); t.A._new(); await t.erabu('pA');
  await t.osu('#lines-body [data-del="1"]');
  eq(t.naka().lines.join('|'), 'A社の工事', '★空振り★ 1行 消せていない');
  await t.erabu('pB');
  const x = t.naka();
  aNashi(x, '×の 後の B社の 1通');
  eq(x.goukei, sugu.pB.goukei, '★合計が 最初から B社と 違う★');
}]);
MICHI.push(['★⑳ 保存の 後に 打って 自動で しまわれた → 一覧 → 下の「入力」（S6）＝直している 1通の 続き', async () => {
  const t = await tateru(); t.A._new(); await t.erabu('pA');
  await t.A._saveDraftForTest();
  const id = t.S.cur.id;
  t.utsu(t.$('e-subject'), '保存の後に直した件名');
  await nemuru(1800);
  eq(t.S.dirty, false, '★空振り★ 自動の しまいが 通っていない');
  await tabu(t, 'scr-list'); await tabu(t, 'scr-edit');
  eq(t.S.cur.id, id, '★直している 途中の 1通が 白紙に 替わった★');
  eq(t.$('e-subject').value, '保存の後に直した件名', '★直した 件名が 消えた★');
}]);

/* ★taiketsu の 2回目の 止める 3件（2026-10-23）★ */
MICHI.push(['★㉑ 税込みの A社 → 税込みの E社（会社の 既定は 税抜き）（止2）＝字・中身・欄が そろう／A社 → B社 は 税抜きに した と 言う', async () => {
  const t = await tateru(); t.A._new(); await t.erabu('pA'); await t.erabu('pE');
  const x = t.naka();
  eq(x.tax, 'inclusive', '★中の 税の 入れ方が E社の 前回と 違う★');
  eq(t.$('e-taxmode').value, 'inclusive', '★画面の 税の 欄が 中と 違う★');
  ok(!/税抜き/.test(x.okBun), '★「税抜きに 戻す」と 書いて 中は 税込み★: ' + x.okBun);
  ok(/税込み/.test(x.okBun), '★当て直しで 税込みに した事を 言っていない★: ' + x.okBun);
  const e = await hajimeKara('pE');
  eq(x.goukei, e.goukei, '★合計が 最初から E社の 1通と 違う★');
  const t2 = await tateru(); t2.A._new(); await t2.erabu('pA'); await t2.erabu('pB');
  const y = t2.naka();
  eq(y.tax, 'exclusive', 'B社＝会社の 既定'); eq(t2.$('e-taxmode').value, 'exclusive', '★B社の 画面の 税の 欄★');
  ok(/税抜き/.test(y.okBun), '★税抜きに した事を 言っていない★: ' + y.okBun);
}]);
MICHI.push(['★㉒ A社 → 会社の 列「現場」だけ 打った 行は B社に 変えても 残る（止3）', async () => {
  const t = await tateru({ cols: true }); t.A._new(); await t.erabu('pA');
  const ge = t.doc.querySelector('#lines-body tr [data-x="現場"]');
  ok(ge, '★空振り★ 会社の 列「現場」の 欄が 無い');
  t.utsu(ge, '東予市 灰原邸'); await nemuru(20);
  eq(((t.S.cur.lines[0] || {}).extra || {})['現場'], '東予市 灰原邸', '★空振り★ 現場に 打てていない');
  await t.erabu('pB');
  const x = t.naka();
  eq(x.lines.join('|'), 'A社の工事', '★現場を 打った 行が 外れた（または 触っていない 行が 残った）★');
  eq(((t.S.cur.lines[0] || {}).extra || {})['現場'], '東予市 灰原邸', '★打った 現場が 消えた★');
}]);
for (const [ban, owari] of [['㉓', '保存'], ['㉔', '発行']]) {
  MICHI.push(['★' + ban + ' ' + owari + 'の 返事を 待つ 間に 打った 字は 消えない（止1）＝倉庫にも 画面にも 残る', async () => {
    const t = await tateru({ osoi: 300 }); t.A._new(); await t.erabu('pA');
    await nemuru(20);
    const p = owari === '保存' ? t.A._saveDraftForTest() : t.A._issue();
    await nemuru(40);
    t.utsu(t.$('e-memo'), '返事待ちに打った備考');
    await p;
    await nemuru(1900);                   /* 自動の しまい（1.5秒）を 待つ */
    const id = t.S.cur.id;
    ok(id, '★空振り★ ' + owari + 'できていない');
    const kuraNo = t.kura.find((x) => x.id === id);
    eq(kuraNo && kuraNo.data && kuraNo.data.memo, '返事待ちに打った備考', '★返事待ちに 打った 字が 倉庫に 入っていない★');
    await tabu(t, 'scr-list'); await tabu(t, 'scr-edit');
    eq(t.S.cur.id, id, '★打った 字の ある 1通が 白紙に 替わった★');
    eq(t.$('e-memo').value, '返事待ちに打った備考', '★打った 字が 画面から 消えた★');
  }]);
}

/* ★taiketsu 3回目の 後の 1件（2026-10-23）★ */
const utsuGyo = async (t, na, kin) => {
  const tr = t.doc.querySelector('#lines-body tr');
  t.utsu(tr.querySelector('[data-f="name"]'), na);
  t.utsu(tr.querySelector('[data-f="qty"]'), '1');
  t.utsu(tr.querySelector('[data-f="price"]') || tr.querySelector('[data-f="amount"]'), String(kin));
  await nemuru(20);
};
MICHI.push(['★㉕ 自動の 保存の 返事を 待つ 間に 打った 字も 倉庫に 入る（止A・K1）', async () => {
  const t = await tateru({ osoi: 400 }); t.A._new(); await t.erabu('pB');
  await utsuGyo(t, 'X1', 1000);
  await nemuru(1650);                       /* 1.5秒で 自動の 保存が 出る（返事は 400ms 後） */
  ok(t.kura.some((x) => x.partner_id === 'pB'), '★空振り★ 自動の 保存が 出ていない');
  t.utsu(t.doc.querySelector('#lines-body tr [data-f="name"]'), 'X1 と Y2');
  await nemuru(2400);                       /* 返事 → 次の 自動の 保存 → 返事 */
  const b = t.kura.find((x) => x.partner_id === 'pB');
  eq(b.lines[0].name, 'X1 と Y2', '★返事待ちに 打った 字が 倉庫に 入っていない★');
  eq(t.S.dirty, false, '入ったら 印は 落ちる');
}]);
MICHI.push(['★㉖ 保存の 返事を 待つ 間に 番号を 打っても 白紙に 替わらない（任意1）', async () => {
  const t = await tateru({ osoi: 300 }); t.A._new(); await t.erabu('pA');
  await nemuru(20);
  const p = t.A._saveDraftForTest();
  await nemuru(40);
  t.utsu(t.$('e-no'), 'TE-999');
  await p; await nemuru(30);
  const id = t.S.cur.id;
  await tabu(t, 'scr-list'); await tabu(t, 'scr-edit');
  eq(t.S.cur.id, id, '★番号を 打った 1通が 白紙に 替わった★');
  eq(t.$('e-no').value, 'TE-999', '★打った 番号が 消えた★');
}]);
MICHI.push(['★㉗ E社（税込み）で 60000 を 打つ → C社（前回 税抜き）＝前回の 税を 当てず 60000 の まま・言う', async () => {
  const t = await tateru(); t.A._new(); await t.erabu('pE');
  await utsuGyo(t, '打った品', 60000);
  eq(t.naka().goukei, 60000, '★空振り★ 税込みで 60000 に なっていない');
  await t.erabu('pC');
  const x = t.naka();
  eq(x.tax, 'inclusive', '★前回の 税抜きを 当てて 打った 金額の 意味を 変えた★');
  eq(t.$('e-taxmode').value, 'inclusive', '★画面の 税の 欄が 中と 違う★');
  ok(x.prices.indexOf('60000') >= 0, '★打った 行が 消えた★');
  ok(/そのままに/.test(x.okBun) && /税込み/.test(x.okBun), '★当てなかった事を 言っていない★: ' + x.okBun);
  /* 合計＝打った 60000（税込み）の まま（打ち始めて いたので C社の 前回の 明細は 入れない＝今までの 決め） */
  eq(x.goukei, 60000, '★打った 60000 の 合計が 変わった★');
}]);
MICHI.push(['★㉘ 打った 行を 全部 ×で 消したら「打った 明細が 残っているので…」は 消える（任意4）', async () => {
  const t = await tateru(); t.A._new(); await t.erabu('pE');
  await utsuGyo(t, '打った品', 60000);
  await t.erabu('pB');
  ok(/打った 明細が 残っているので/.test(t.naka().okBun), '★空振り★ そのまま の 知らせが 出ていない');
  await t.osu('#lines-body [data-del="0"]');
  ok(!/打った 明細が/.test(t.naka().okBun), '★行が 無いのに「打った 明細が 残っている」と 言う★');
}]);
MICHI.push(['★㉙ 新しく → E社（税込み）＝税込みと 言うのは 1回だけ（任意4）', async () => {
  const t = await tateru(); t.A._new(); await t.erabu('pE');
  const bun = t.naka().okBun;
  eq((bun.match(/税込み/g) || []).length, 1, '★税込みを 2回 言う★: ' + bun);
}]);
MICHI.push(['★㉚ 端数が 切り上げの F社 → B社＝「切り捨て に しました」と 中身が そろう（任意4）', async () => {
  const t = await tateru(); t.A._new(); await t.erabu('pF');
  eq(t.S.cur.rounding, 'ceil', '★空振り★ F社の 前回の 切り上げが 入っていない');
  await t.erabu('pB');
  const x = t.naka();
  eq(x.round, 'floor', '端数は 会社の 既定');
  ok(/切り捨て/.test(x.okBun) && !/この相手の 物/.test(x.okBun), '★端数の 字が 中身と 合わない★: ' + x.okBun);
}]);

/* ★止めて 警告★（taiketsu 2026-10-23 止1）＝打った 行の 税と 前回の 税が 違う 時は 前回の 明細を 足さない */
const naoshite50000 = async (t) => {
  const tr = t.doc.querySelector('#lines-body tr');
  t.utsu(tr.querySelector('[data-f="price"]'), '50000');
  const am = tr.querySelector('[data-f="amount"]'); if (am) t.utsu(am, '50000');
  await nemuru(20);
};
MICHI.push(['★㉛ A社（税込み）の 1行を 50000 に 直す → C社（前回 税抜き）＝C社の 前回は 足さず 言う・合計は 50,000 円', async () => {
  const t = await tateru(); t.A._new(); await t.erabu('pA');
  await naoshite50000(t);
  await t.erabu('pC');
  const x = t.naka();
  eq(x.lines.join('|'), 'A社の工事', '★税の 入れ方が 違う 前回の 明細を 足した★');
  eq(x.tax, 'inclusive', '打った 行の 税の まま');
  eq(x.goukei, 50000, '★合計（円）が 打った 50,000 と 違う★');
  ok(/C建設の 前回の 明細は 金額の入れ方が 違う（税抜き）ので 足していません/.test(x.okBun), '★足さなかった事を 言っていない★: ' + x.okBun);
}]);
MICHI.push(['★㉟ A社（税込み）の 1行を 50000 に 直す → H社（前回 税抜き・明細 0行・控除 2,000円だけ）＝控除は 円の 額なので 足す・明細を 足さないとは 言わない', async () => {
  const t = await tateru(); t.A._new(); await t.erabu('pA');
  await naoshite50000(t);
  await t.erabu('pH');
  const x = t.naka();
  eq(x.lines.join('|'), 'A社の工事', '打った 行の まま');
  eq(x.ded.join('|'), 'H社の控除', '★税が 違うだけで 前回の 控除まで 落とした（ご請求金額が 控除の 分 多く なる）★');
  ok(!/前回の 明細は 金額の入れ方が 違う/.test(x.okBun), '★明細が 無いのに「明細を 足していません」と 言った★: ' + x.okBun);
}]);
MICHI.push(['★㉜ A社（税込み）の 1行を 50000 に 直す → G社（前回も 税込み）＝今まで通り G社の 前回を 足す', async () => {
  const t = await tateru(); t.A._new(); await t.erabu('pA');
  await naoshite50000(t);
  await t.erabu('pG');
  const x = t.naka();
  eq(x.lines.join('|'), 'A社の工事|G社の品', '★税が 同じなのに 前回の 明細を 足していない★');
  eq(x.goukei, 53300, '★合計（円）が 50,000＋3,300 と 違う★');
}]);

/* ★自動の 保存で 画面の 行を 詰めない★（taiketsu 2026-10-23 止2・2026-09-11 からの 穴） */
const gyoUtsu = async (t, i, na, kin) => {
  const tr = t.doc.querySelectorAll('#lines-body tr')[i];
  ok(tr, '★' + (i + 1) + '行目が 無い★');
  if (na !== null) t.utsu(tr.querySelector('[data-f="name"]'), na);
  t.utsu(tr.querySelector('[data-f="qty"]'), '1');
  t.utsu(tr.querySelector('[data-f="price"]'), String(kin));
  const am = tr.querySelector('[data-f="amount"]'); if (am) t.utsu(am, String(kin));
  await nemuru(20);
};
const sanGyo = async () => {
  /* [R0 1000 / 空行 / R2 2000] を 打って 自動の 保存を 通す */
  const t = await tateru(); t.A._new(); await t.erabu('pB');
  await gyoUtsu(t, 0, 'R0', 1000);
  await t.osu('#b-addline'); await t.osu('#b-addline');
  await gyoUtsu(t, 2, 'R2', 2000);
  await nemuru(1800);
  ok(t.kura.some((x) => x.partner_id === 'pB'), '★空振り★ 自動の 保存が 出ていない');
  return t;
};
const sorou = (t, kitai, goukei) => {
  const gamen = [...t.doc.querySelectorAll('#lines-body [data-f="name"]')].map((i) => i.value).filter(Boolean).join('|');
  const naka = t.S.cur.lines.map((l) => l.name).filter(Boolean).join('|');
  const b = t.kura.find((x) => x.partner_id === 'pB');
  const kura = (b.lines || []).map((l) => l.name).filter(Boolean).join('|');
  eq(gamen, kitai, '★画面の 行★'); eq(naka, kitai, '★中の 行（画面と 違う）★'); eq(kura, kitai, '★倉庫の 行★');
  eq(t.naka().goukei, goukei, '★合計（円）★');
};
MICHI.push(['★㉝ 自動の 保存の 後に 空行（2行目）に 打つ＝3行目が 消えず 画面・中・倉庫・合計が 合う（止2）', async () => {
  const t = await sanGyo();
  await gyoUtsu(t, 1, 'R1', 500);
  await nemuru(1800);
  sorou(t, 'R0|R1|R2', 3850);
}]);
MICHI.push(['★㉞ 自動の 保存の 後に 3行目の 単価に 打つ＝落ちずに しまわれ 画面・中・倉庫・合計が 合う（止2）', async () => {
  const t = await sanGyo();
  const errs = [];
  t.win.addEventListener('error', (e) => errs.push(String(e.message || e.error)));
  try { await gyoUtsu(t, 2, null, 3000); } catch (e) { errs.push(String(e && e.message)); }
  await nemuru(1800);
  eq(errs.join(' / '), '', '★打った 時に 落ちた★');
  sorou(t, 'R0|R2', 4400);
  const b = t.kura.find((x) => x.partner_id === 'pB');
  eq(String((b.lines.find((l) => l.name === 'R2') || {}).price), '3000', '★3行目の 単価が 倉庫に 入っていない★');
}]);

if (!SELF) {
  for (const [na, fn] of MICHI) await T(na, fn);
} else {
  /* ★自分ためし★＝直しの 要の 行を 1つずつ 本当に 壊して 立て直し、その 道が ★赤に なる★事を 見る
     （「在る」を 数えるだけで 終わらせない）。壊す前に 行末を そろえる（Windows の CRLF と CI の LF の 差） */
  const app = fs.readFileSync(path.join(ROOT, 'seikyu', 'js', 'seikyu-app.js'), 'utf8').replace(/\r\n/g, '\n');
  const kowasu = [
    ['相手を 変えた時に 自動の 値を 外すのを やめる', '    var hz = jidoHazusu(S.cur), hazushita = hz.out;', '    var hz = { out: [] }, hazushita = hz.out;', '★②'],
    ['自動で 入れた 値を 覚えるのを やめる', '    keys.forEach(function (k) { j.vals[k] = JSON.stringify(jidoKata(v, k)); });', '', '★③'],
    ['新しく 作る時に 当ての 印・札を 戻すのを やめる', '    S.guessDone = false; S.guess = null; S.guessApplied = null;', '', '★⑧'],
    ['新しく 作る時に 前の 知らせを 消すのを やめる', "    box('edit-ok', ''); box('edit-err', ''); box('edit-warn', '');", '', '★⑦'],
    ['id の 付いた 新しい 下書きに 当て直さない', '    if (!v || locked() || (v.id && !jidoNoCur(v)) || S.guessDone) return;', '    if (!v || locked() || v.id || S.guessDone) return;', '★④'],
    ['保存・発行の 後の「入力」を 白紙に しない', "        if (t === 'scr-edit' && (!S.cur || owattaNoMama())) { newInvoice(); return; }", "        if (t === 'scr-edit' && !S.cur) { newInvoice(); return; }", '★⑩'],
    ['保存を 終えた 印を 付けない', '      owattaOboe(S.cur);', '', '★⑩'],
    ['発行を 終えた 印を 付けない', '      owattaOboe(hakko);', '', '★⑪'],
    ['打ちかけでも 白紙に する', '  function owattaNoMama() {\n    var v = S.cur;\n', '  function owattaNoMama() {\n    var v = S.cur; if (v) return true;\n', '★⑫'],
    ['その場で 作った 相手は 書き換える だけ（S1）', '        if (S.cur && S.cur.partner_id !== id) aiteWoKaeta(id);', '        if (S.cur) S.cur.partner_id = id;', '★⑭'],
    ['もう在った 相手でも 書き換える だけ（S1）', '        if (S.cur && S.cur.partner_id !== id) aiteWoKaeta(id);', '        if (S.cur) S.cur.partner_id = id;', '★⑮'],
    ['税の 欄を 描き直さない（S2）', "    if ($('e-taxmode')) $('e-taxmode').value = (S.cur.tax_mode === 'inclusive') ? 'inclusive' : 'exclusive';\n    if (zeiBun && !hazushita.length) {", "    if (zeiBun && !hazushita.length) {", '★㉑'],
    ['税を 変えても 言わない（S3）', "      if (hz.taxMae && S.cur.tax_mode !== hz.taxMae) zeiBun += '金額の入れ方を ' + zeiNa(S.cur.tax_mode) + ' に しました。';", '', '★㉑'],
    ['当て直しで 入れた 税を 言わない（止2）', "    if (jido.indexOf('tax') >= 0 && v.tax_mode !== settings().taxMode) { hiki.push(", "    if (false) { hiki.push(", '★㉑'],
    ['自動の 保存の 返事で 待つ間の 字を 見ない（止A）', '            if (hozonKata(S.cur) === okuttaKata) S.dirty = false;', '            if (true) S.dirty = false;', '★㉕'],
    ['保存の 比べに 番号を 入れない（任意1）', '  function hozonKata(v) { return JSON.stringify([v.no, nakamiKata(v)]); }', '  function hozonKata(v) { return nakamiKata(v); }', '★㉖'],
    ['打った 行が 在っても 前回の 税を 当てる（決め）', '    if (!uttaGyo) {', '    if (true) {', '★㉗'],
    ['税が 違っても 前回の 明細を 足す（止1）', '    var tasu = !!S.oiToki && !zeiChigau;', '    var tasu = !!S.oiToki;', '★㉛'],
    ['税が 違うと 前回の 控除まで 落とす（⑦ 止1）', '    var tasuD = !!S.oiToki;', '    var tasuD = tasu;', '★㉟'],
    ['明細が 無くても「明細を 足していません」と 言う（⑦ 止1）', '    if (S.oiToki && zeiChigau && g.lines && g.lines.length) {', '    if (S.oiToki && zeiChigau && ((g.lines && g.lines.length) || (g.deductions && g.deductions.length))) {', '★㉟'],
    ['自動の 保存で 画面の 行を 詰める（止2）','    var okuru = Object.assign({}, v, { lines: cleanLines(v.lines) });', '    v.lines = cleanLines(v.lines); var okuru = v;', '★㉝'],
    ['自動の 保存で 画面の 行を 詰める（止2・3行目）', '    var okuru = Object.assign({}, v, { lines: cleanLines(v.lines) });', '    v.lines = cleanLines(v.lines); var okuru = v;', '★㉞'],
    ['行を 全部 消しても 知らせを 残す（任意4）', '        if (!S.cur.lines.some(gyoAru) && okEl', '        if (false && okEl', '★㉘'],
    ['税込みを 2回 言う（任意4）', '    if (S.zeiItta) {', '    if (false) {', '★㉙'],
    ['端数の 字を 中身と 合わせない（任意4）', "zeiBun += '消費税の 端数の 扱いを ' + marumeNa(S.cur.rounding) + ' に しました。';", "zeiBun += '消費税の 端数の 扱いを この相手の 物に しました。';", '★㉚'],
    ['打った 行が 残っても 税を 戻す（決め）', '    if (nokoriLines.length && (zei || hasu)) {', '    if (false) {', '★⑯'],
    ['会社の 列を 比べない（止3）', "String(l.memo || ''), exKata]);", "String(l.memo || '')]);", '★㉒'],
    ['保存の 返事で 待つ間の 字を 見ない（止1）', '      if (hozonKata(S.cur) === okuttaKata) {', '      if (true) {', '★㉓'],
    ['発行の 返事で 待つ間の 字を 見ない（止1）', '      var onaji = nakamiKata(hakko) === hakkoKata;', '      var onaji = true;', '★㉔'],
    ['動いた 期日を 外さない（S4）', "      if (mama('due') || String(v.due_ymd || '') === String(DOC.dueDateFrom(v.issue_ymd, d.term) || '')) v.due_ymd = '';", "      if (mama('due')) v.due_ymd = '';", '★⑰'],
    ['触っていない 行も 外さない（S5）', '      var i = mi.indexOf(jidoGyo(l));', '      var i = -1;', '★⑱'],
    ['選び直しで 次の 相手の 前回を 足さない（S5）', '    var tasu = !!S.oiToki && !zeiChigau;', '    var tasu = false;', '★㉜'],
    ['保存の 後に 打っても 白紙に する（S6）', '    if (S.owattaKata !== owattaKata(v)) return false;', '', '★⑳'],
    ['当てる時に 打った 件名を 上書きする', "    if (!String(v.data.subject || '').trim()) { v.data.subject = g.subject; jido.push('subject'); }", "    { v.data.subject = g.subject; jido.push('subject'); }", '★⑤'],
  ];
  for (const [na, a, b, michi] of kowasu) {
    await T('壊すと 赤: ' + na, async () => {
      ok(app.split(a).length === 2, '★壊す所が 1つ 見つからない★ … ' + a);
      const m = MICHI.find(([n]) => n.startsWith(michi));
      ok(m, '★見張る 道が 無い★ ' + michi);
      APP_KAE = app.replace(a, b);
      /* ★壊し方が 文として 成り立つか★（SyntaxError で 読めずに 赤＝何も 見ていない 赤 を 数えない・任意1） */
      try { new Function(APP_KAE); } catch (e) { APP_KAE = null; throw new Error('★壊し方が 文に なっていない★ ' + e.message); }
      let aka = false;
      try { await m[1](); } catch (e) { aka = true; }
      APP_KAE = null;
      ok(aka, '★壊したのに ' + michi + ' が 緑のまま＝この 試験は 何も 見ていない★');
    });
  }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
