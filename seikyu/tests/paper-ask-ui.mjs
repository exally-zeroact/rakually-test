/* paper-ask-ui.mjs — ★紙の作りの「聞く形」を 実際に押す★（⑤明細の列・⑥紙の行数）
 * =============================================================================
 * lib の中身は `paper-ask.test.mjs` が見る。ここは ★本物の画面で 押した時★:
 *   ① 材料が足りない（出した紙が3通未満）時は ★出さない★
 *   ② 3通 揃うと 出る／★通数つきの根拠★が「なぜ？」で出る
 *   ③ 「消す」を押すと ★本当に列が消える★（設定の一覧からも消える）
 *   ④ 「このまま残す」でも ★もう聞かない★（空のまま 何度も聞かれない）
 *   ⑤ 行数を押すと ★設定の欄にも 同じ数★（同じ画面の2つの見え方）
 *   ⑥ ★1問ごと保存が 本当に走る★（偽の倉庫で 数える）
 *   ⑦ ★別ウィザードを作っていない★（画面の数が増えていない）
 *   ⑧ ★消せない列は 消せない★（押しても 品名は残る）
 *
 * 使い方: node seikyu/tests/paper-ask-ui.mjs [--self-test]
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
const $ = (id) => doc.getElementById(id);
const shown = () => $('paper-ask-card').style.display !== 'none';
const txt = () => $('paper-ask').textContent.replace(/\s+/g, ' ');
const click = (sel) => { const b = $('paper-ask').querySelector(sel); ok(b, '押す物が無い: ' + sel); b.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); };

/* ★偽の倉庫★（1問ごと保存が 本当に走ったかを 数える） */
const saved = [];
S.store = {
  org: { save: (patch) => { saved.push(patch); return Promise.resolve({ ok: true, data: Object.assign({}, S.org, patch) }); } },
  invoices: { list: () => Promise.resolve(S.list), usedNos: () => Promise.resolve([]) },
  partners: { list: () => Promise.resolve(S.partners || []), patch: () => Promise.resolve({ ok: true }) },
};

const line = (o) => Object.assign({ name: '', qty: '', unit: '', price: '', amount: '', rate: '', memo: '' }, o);
/** 出した請求書 n通（摘要だけ 1度も使っていない） */
function issued(n, rows) {
  return Array.from({ length: n }, (_, i) => ({
    id: 'v' + i, no: 'A-' + i, status: 'issued', issue_ymd: '2026-0' + ((i % 9) + 1) + '-05',
    lines: Array.from({ length: rows || 1 }, (_, j) => line({ name: '運転代行' + j, qty: '1', unit: '式', price: '10000', amount: '10000', rate: 10 })),
    data: {}, totals: {},
  }));
}
/* ★「摘要」を持つ会社★にしておく（既定の列には 無い）。
   ＝★使っていない列が 本当に在る会社★でないと この検査は 何も見ていない事になる。 */
const COLS_WITH_MEMO = {
  items: ['#', '品名・内容', '数量', '単位', '単価', '金額', '消費税', '摘要'],
};
function reset(n, rows) {
  S.org = { invoiceCols: COLS_WITH_MEMO, invoicePaperRows: null, paperAskOk: {} };
  S.list = issued(n, rows);
  S.cur = null;
  saved.length = 0;
  A._fillSettings();
}

console.log('\n[paper-ask-ui] 紙の作りの「聞く形」を 実際に押す');
const SCREENS0 = doc.querySelectorAll('.screen').length;

T('★① 材料が足りない（2通）時は 出さない（当てない）', () => {
  reset(2);
  ok(!shown(), '★2通で 決めつけて 聞いている★：' + txt().slice(0, 60));
  console.log('     出した紙 2通 → 出ない');
});

T('★② 3通 揃うと 出る／「なぜ？」で 通数つきの根拠', () => {
  reset(3);
  ok(shown(), '★3通 在るのに 出ない★');
  ok(/摘要/.test(txt()), '使っていない列を 指していない：' + txt().slice(0, 80));
  click('[data-paskp-why]');
  const box = $('pask-note-box');
  ok(box && box.style.display !== 'none', '★根拠の箱が 出ない★');
  const t = box.textContent.replace(/\s+/g, ' ');
  ok(/3通で/.test(t), '★根拠に 通数が無い★：' + t.slice(0, 80));
  ok(/当てただけです/.test(t), '★「当てただけ」と言っていない★');
  console.log('     ' + t.slice(0, 70) + '…');
});

T('★③ 「消す」を押すと 本当に列が消える（設定の一覧からも）', () => {
  reset(3);
  const before = (S.org.invoiceCols && S.org.invoiceCols.items) || [];
  click('[data-paskp-pick][data-v="yes"]');
  const after = S.org.invoiceCols.items;
  ok(after.indexOf('摘要') < 0, '★押しても 列が消えていない★ ' + after.join(','));
  ok(after.indexOf('品名・内容') >= 0 && after.indexOf('金額') >= 0, '★消してはいけない列まで 消えた★');
  ok(!$('col-list').textContent.includes('摘要'), '★設定の一覧に まだ「摘要」が居る★');
  console.log('     列 ' + before.length + ' → ' + after.length + '本（摘要が消えた）');
});

T('★④ 「このまま残す」でも もう聞かない', () => {
  reset(3);
  click('[data-paskp-pick][data-v="no"]');
  ok(S.org.invoiceCols.items.indexOf('摘要') >= 0, '残すと言ったのに 消えた');
  ok(S.org.paperAskOk['col:摘要'], '★答えた印が 付いていない★');
  ok(!/「摘要」の列は 消しますか/.test(txt()), '★残すと言ったのに まだ同じ事を聞いている★');
  console.log('     摘要は残った／もう聞かない');
});

T('★⑤ 行数を押すと 設定の欄にも 同じ数（同じ画面の2つの見え方）', () => {
  reset(3, 2);                       // 明細2行の紙を3通＝枠12行より少ない
  click('[data-paskp-pick][data-v="yes"]');   // まず列の問いを片づける
  ok(/明細の枠は 何行にしますか/.test(txt()), '行数の問いへ 進んでいない：' + txt().slice(0, 60));
  click('[data-paskp-pick][data-v="2"]');
  eq(String(S.org.invoicePaperRows), '2', '★押しても 行数が入っていない★');
  eq($('s-rows').value, '2', '★聞く形と 設定の欄が 別の値★');
  console.log('     枠 2行／設定の欄も ' + $('s-rows').value);
});

T('★⑥ 1問ごと 保存が 本当に走る', () => {
  reset(3);
  click('[data-paskp-pick][data-v="yes"]');
  ok(saved.length >= 1, '★答えても 保存が走っていない★');
  const last = saved[saved.length - 1];
  ok(last.invoiceCols && last.invoiceCols.items.indexOf('摘要') < 0, '保存した中身が違う');
  ok(last.paperAskOk && last.paperAskOk['col:摘要'], '答えた印が 保存されていない');
  console.log('     保存 ' + saved.length + '回（1問ごと）');
});

T('★⑦ 別ウィザードを作っていない（画面の数が増えていない）', () => {
  eq(doc.querySelectorAll('.screen').length, SCREENS0, '★画面が増えている＝別ウィザードを作った★');
  ok($('paper-ask-card').closest('.screen') === $('scr-set'), '★聞く形が 設定の画面の外に居る★');
  console.log('     画面 ' + SCREENS0 + '枚のまま／聞く形は 設定の画面の中');
});

T('★⑧ ここまで JSの落ちが0', () => {
  ok(!errs.length, errs.join(' / '));
});

/* ═══ ★自己確認：わざと壊して 赤になるか★ ═══ */
if (process.argv.includes('--self-test')) {
  console.log('\n[--self-test] ★わざと壊して 赤になるか★');
  T('★自① 答えた印を消すと また聞く（印が 効いている）', () => {
    reset(3);
    click('[data-paskp-pick][data-v="no"]');
    ok(!/「摘要」の列は 消しますか/.test(txt()), '前提が崩れている');
    S.org.paperAskOk = {};
    A._fillSettings();
    ok(/「摘要」の列は 消しますか/.test(txt()), '★印を消しても 聞き直さない＝印が 効いていない★');
  });
  T('★自② 下書きは 数えない（出していない紙は 実績ではない）', () => {
    reset(3);
    ok(shown(), '前提が崩れている');
    S.list = S.list.map((v) => Object.assign({}, v, { status: 'draft' }));
    A._fillSettings();
    ok(!shown(), '★下書きを 実績として数えている★');
    console.log('     3通とも下書きにしたら 出なくなった');
  });
  T('★自③ 使っている列は 消す候補に出ない', () => {
    reset(3);
    S.list = S.list.map((v) => Object.assign({}, v, {
      lines: v.lines.map((l) => Object.assign({}, l, { memo: 'あり' })),
    }));
    A._fillSettings();
    ok(!/「摘要」の列は 消しますか/.test(txt()), '★使っているのに 消せと言っている★');
  });
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
