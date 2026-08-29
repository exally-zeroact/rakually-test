/* scope-ui.mjs — ★相手ごとの上書きを 本物の画面で 紙まで 確かめる★
 * =============================================================================
 * lib の中身は `scope.test.mjs` が見る。ここは ★本物の紙が どう変わるか★:
 *   ① 上書きの無い相手の紙は ★会社の既定と 1文字も 違わない★（今までと同じ）
 *   ② 相手Aに 上書きを入れても ★相手Bの紙は 1文字も 変わらない★
 *   ③ 相手Aの紙には ★上書きが 効いている★（列・行数・件名）
 *   ④ 出してしまった紙は ★後から 上書きを入れても 変わらない★
 *
 * 使い方: node seikyu/tests/scope-ui.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let JSDOM; try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('★jsdomが入っていません。この検証は飛ばせません（SKIPを緑と呼ばない）。npm install してください。'); process.exit(1); }

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m || 'false'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ' … 期待 ' + JSON.stringify(b) + ' / 実際 ' + JSON.stringify(a)); };

const rel = 'seikyu/index.html', file = path.join(ROOT, rel);
const html = fs.readFileSync(file, 'utf8');
const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''),
  { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' + rel });
const win = dom.window, doc = win.document;
win.fetch = () => Promise.reject(new Error('no net'));
win.scrollTo = () => {}; win.print = () => {};
win.URL.createObjectURL = () => 'blob:fake';
win.open = () => ({ document: { write() {}, close() {} }, focus() {}, print() {}, close() {} });
const errs = [];
win.addEventListener('error', (e) => errs.push('window.error: ' + (e.message || e)));
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
S.store = {
  invoices: { saveDraft: () => Promise.resolve({ ok: true }), list: () => Promise.resolve(S.list), usedNos: () => Promise.resolve([]) },
  partners: { list: () => Promise.resolve(S.partners), patch: () => Promise.resolve({ ok: true }) },
  org: { save: () => Promise.resolve({ ok: true }) },
};

const LINES = [{ name: '運転代行', qty: '1', unit: '式', price: '10000', amount: '10000', rate: 10 }];
/** 相手 pid の 下書き1通を 作って 紙のHTMLを返す（★本物の紙を 通す★） */
function paperOf(pid) {
  S.cur = { id: 'v-' + pid, partner_id: pid, no: 'A-1', issue_ymd: '2026-10-05', due_ymd: '2026-11-30',
    tax_mode: 'exclusive', rounding: 'floor',
    data: { subject: 'ZZ件名ZZ' }, lines: LINES.slice(), totals: {}, status: 'draft' };
  A._go('scr-edit');
  A._fillEdit();
  const t = A._recalcForTest();
  ok(t && t.ok, '★数え直しが 通らない＝紙まで行けない★ ' + JSON.stringify(t && t.errors ? t.errors : t));
  const h = A._paperHtml ? A._paperHtml() : null;
  ok(h && String(h).length > 500, '★紙が作れていない＝この検査は 何も見ていない★');
  return String(h);
}
function reset() {
  S.partners = [
    { id: 'yagi', data: { name: '八木工業株式会社', honor: '御中' } },
    { id: 'daiko', data: { name: '△△代行株式会社', honor: '御中' } },
  ];
  S.list = [];
  S.org = { yago: '合同会社Rakunally', addr: '愛媛県今治市', invoiceNo: 'T3500003003293' };
}

console.log('\n[scope-ui] 相手ごとの上書きを 本物の紙で 確かめる');

reset();
const BASE_YAGI = paperOf('yagi');
const BASE_DAIKO = paperOf('daiko');

T('★① 上書きが 1つも無い時、2人の紙は 会社の既定どおり（今までと同じ）', () => {
  ok(BASE_YAGI.length > 500 && BASE_DAIKO.length > 500, '紙が作れていない');
  /* 相手の名前だけ違う＝作りは 同じ */
  const strip = (s2) => s2.replace(/八木工業株式会社|△△代行株式会社/g, '（相手）');
  eq(strip(BASE_YAGI), strip(BASE_DAIKO), '★上書きが無いのに 2人の紙が 違う★');
  console.log('     2人とも 会社の既定の紙（相手名を除いて 完全に同じ）');
});

T('★② 八木工業だけ 上書き（摘要の列・行数20・件名を出す）', () => {
  S.partners[0].data.paper = {
    cols: { items: ['#', '品名・内容', '数量', '単位', '単価', '金額', '摘要'] },
    paperRows: 20, subjectOn: true,
  };
  const y = paperOf('yagi');
  ok(/摘要/.test(y), '★相手の列が 紙に出ていない★');
  ok(!/摘要/.test(BASE_YAGI), '前提が崩れている（既定にも 摘要が在る）');
  ok(/ZZ件名ZZ/.test(y), '★相手の「件名を出す」が 効いていない★');
  ok(!/ZZ件名ZZ/.test(BASE_YAGI), '前提が崩れている（既定でも 件名が出る）');
  console.log('     八木の紙 … 摘要の列 ○ ／ 件名 ○');
});

T('★③ ★相手Bの紙は 1文字も 変わっていない★（片方を直して 全部が変わる、を作らない）', () => {
  const d = paperOf('daiko');
  eq(d, BASE_DAIKO, '★八木を直したら 代行の紙まで 変わった★');
  console.log('     代行の紙 … ' + d.length + '字（前と 1文字も 同じ）');
});

T('★④ 出してしまった紙は 後から 上書きを入れても 変わらない', () => {
  S.partners[1].data.paper = { cols: { items: ['#', '品名・内容', '摘要'] } };
  S.cur = { id: 'v9', partner_id: 'daiko', no: 'A-9', issue_ymd: '2026-09-05', status: 'issued',
    tax_mode: 'exclusive', rounding: 'floor',
    template_id: 'std1', data: {}, lines: LINES.slice(), totals: { grandTotal: 11000 },
    snapshot: { cols: { items: ['#', '品名・内容', '数量', '単位', '単価', '金額'] } } };
  A._go('scr-edit'); A._fillEdit();
  const h = String(A._paperHtml ? A._paperHtml() : '');
  ok(h.length > 500, '紙が作れていない');
  ok(!/摘要/.test(h), '★出した紙に 後から 列が増えた★');
  console.log('     出した紙 … 写しのまま（摘要は 出ない）');
});

/* ═══ ★実際に 画面の欄を 押して 決める★（lib緑で 完成としない）═══ */
function goSet(pid) {
  A._go('scr-set');
  A._fillSettings();
  const sel = doc.getElementById('s-partner');
  ok(sel, '★取引先を選ぶ欄が 無い★');
  ok(sel.options.length > 0, '★取引先の一覧が 空＝選べない★');
  sel.value = pid;
  ok(sel.value === pid, '★' + pid + ' を 選べない（一覧: '
    + [...sel.options].map((o) => o.value).join(',') + '）★');
  sel.dispatchEvent(new win.Event('change', { bubbles: true }));
}
const set = (id, v) => {
  const el = doc.getElementById(id);
  ok(el, '★欄が 無い: ' + id + '★');
  el.value = v;
  el.dispatchEvent(new win.Event('change', { bubbles: true }));
  return el;
};

T('★⑥ 画面の欄で「この相手だけの紙」を 決められる（欄が 実在する）', () => {
  reset();
  goSet('yagi');
  ['s-ptpl', 's-prows', 's-psubject', 'b-pcols-own'].forEach((id) => {
    ok(doc.getElementById(id), '★' + id + ' が 画面に 無い＝客は 決められない★');
  });
  const opts = [...doc.getElementById('s-ptpl').options].map((o) => o.value);
  eq(opts[0], '', '★1つ目が「会社の既定のまま」でない★');
  ok(opts.length >= 4, '様式が ' + opts.length + '個しか無い');
  console.log('     欄 4つ 実在 ／ 様式の選択肢 ' + opts.length + '個（1つ目＝会社の既定のまま）');
});

T('★⑦ 欄を 選ぶと その場で 相手に 入る（保存を押すまで 何も起きない、にしない）', () => {
  reset();
  goSet('yagi');
  set('s-prows', '20');
  set('s-psubject', 'on');
  const pp = win.SeikyuScope.partnerPaper(S.partners[0]);
  eq(pp.paperRows, 20, '★行数が 入っていない★');
  eq(pp.subjectOn, true, '★件名の決めが 入っていない★');
  /* ★相手Bには 入っていない★ */
  eq(win.SeikyuScope.hasOverride(S.partners[1]), false, '★よその相手にまで 入れている★');
  console.log('     八木だけに 入った（代行は 上書き0）');
});

T('★⑧ 「この相手だけの列にする」を押すと 会社の今の列を 写して 持つ', () => {
  reset();
  goSet('yagi');
  const b = doc.getElementById('b-pcols-own');
  b.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const pp = win.SeikyuScope.partnerPaper(S.partners[0]);
  ok(pp.cols && pp.cols.items && pp.cols.items.length > 0, '★列を 写せていない★');
  ok(/この相手だけの列/.test(doc.getElementById('s-pcols-hint').textContent),
    '★画面が どちらを直しているか 言っていない★：' + doc.getElementById('s-pcols-hint').textContent);
  /* 戻すボタンで 会社の既定へ */
  doc.getElementById('b-pcols-clear').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok(!win.SeikyuScope.partnerPaper(S.partners[0]).cols, '★戻せていない★');
  console.log('     写した列 ' + pp.cols.items.length + '本 → 「会社の既定に戻す」で 消えた');
});

T('★⑤ ここまで JSの落ちが0', () => { ok(!errs.length, errs.join(' / ')); });

/* ═══ ★自己確認：わざと壊して 赤になるか★ ═══ */
if (process.argv.includes('--self-test')) {
  console.log('\n[--self-test] ★わざと壊すと 赤になるか★');
  T('★自① 上書きを 消したら 会社の既定に 戻る（＝上書きが 効いている証拠）', () => {
    delete S.partners[0].data.paper;
    const y = paperOf('yagi');
    ok(!/摘要/.test(y), '★上書きを 消しても 摘要が 残っている★');
    eq(y, BASE_YAGI, '★消しても 元に戻らない★');
    console.log('     消したら 元の紙に 戻った');
  });
  T('★自② 相手を 取り違えたら 気づける（別の相手の上書きが 出たら 赤）', () => {
    S.partners[1].data.paper = { cols: { items: ['#', '品名・内容', 'ZZ別の列ZZ'] } };
    const y = paperOf('yagi');
    ok(!/ZZ別の列ZZ/.test(y), '★よその相手の列が 出ている★');
    const d = paperOf('daiko');
    ok(/ZZ別の列ZZ/.test(d), '★その相手の列が 出ていない＝この検査は 空振り★');
  });
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
