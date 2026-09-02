/* bank-ui.mjs — ★この相手に出す口座★を 本物の画面で 実際に 押す
 * =============================================================================
 * lib の中身は `bank-select.test.mjs`／紙の見た目は `bank-paper.mjs` が見る。
 * ここは ★画面から 本当に 呼ばれているか★（＝「作ってあるだけ」を もう作らない）。
 *
 * ★なぜ（2026-09-02・実物45枚を 機械で 読んだ）★
 *   実物は ★相手ごとに 振込先が 1〜6行★（ENEOSは 同じ相手でも 月で 3→4→6）。
 *   なのに 画面は ★会社の設定の1つ★を 全部の紙に 出していた。
 *
 * ★ここで見る事（実際に 押す）★
 *   ① 会社の口座が ★札で 出る（打たせない）★＝空欄を並べない
 *   ② 何も触っていない時は ★全部にチェック＝今までと同じ紙★
 *   ③ 1つ 外すと ★その口座だけ 紙から 消える（描いた紙で 数える）★
 *   ④ ★1つも 選ばないと 全部に 戻る★（紙から 振込先が 消えない）
 *   ⑤ ★根拠が 出る★（何／何を 出すか・行が 何行 減るか）
 *   ⑥ ★保存する形に 入る★（全部の時は 入れない＝会社の既定のまま）
 *   ⑦ ★別ウィザードを 作っていない★（画面の数が 増えていない）
 *
 * 使い方: node seikyu/tests/bank-ui.mjs [--self-test]
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
const PAPER = win.SeikyuPaper;

const ACC = [
  '伊予銀行　今治支店　普通　4160657　ド）ゼロアクト',
  '愛媛銀行　今治支店　普通　9570836　ド）ゼロアクト',
  '愛媛信用金庫　今治支店　普通　0423107　ド）ゼロアクト',
];
const PARTNER = { id: 'p1', name: 'ENEOSグローブエナジー株式会社', data: { honor: '御中', paper: {} } };

const saved = [];
S.store = {
  org: { save: (patch) => { saved.push(patch); return Promise.resolve({ ok: true, data: Object.assign({}, S.org, patch) }); } },
  invoices: { list: () => Promise.resolve(S.list || []), usedNos: () => Promise.resolve([]) },
  partners: {
    list: () => Promise.resolve(S.partners || []),
    patch: (id, add) => { saved.push({ id: id, add: add }); return Promise.resolve({ ok: true }); },
  },
};

function reset() {
  /* ★会社の口座の 置き場所は settings() が読む d.bank★（別の名前で置くと 画面に 出ない） */
  S.org = { bank: ACC.join('\n') };
  S.partners = [JSON.parse(JSON.stringify(PARTNER))];
  S.list = [];
  S.cur = null;
  saved.length = 0;
  A._fillSettings();
  $('s-partner').value = 'p1';
  $('s-partner').dispatchEvent(new win.Event('change', { bubbles: true }));
}
const boxes = () => Array.from($('s-pbanks').querySelectorAll('input[data-bank]'));
const why = () => ($('s-pbanks-why').textContent || '').replace(/\s+/g, ' ');
const uncheck = (i) => {
  const cb = boxes()[i]; ok(cb, '札が ' + i + ' 番目に 無い');
  cb.checked = false;
  cb.dispatchEvent(new win.Event('change', { bubbles: true }));
};
/* ★紙に 実際に 何行 出たか★＝描いた物を 数える（選んだ数では 数えない） */
function bankLinesOnPaper() {
  const p = S.partners[0];
  const r = PAPER.banksFor({ bank: S.org.bank }, (p.data && p.data.paper) || {});
  return r.lines;
}

console.log('\n[bank-ui] 「この相手に出す口座」を 実際に 押す');
const SCREENS0 = doc.querySelectorAll('.screen').length;

T('★① 会社の口座が 札で 出る（打たせない＝空欄を並べない）', () => {
  reset();
  ok(boxes().length === 3, '★札が ' + boxes().length + '個★（会社の口座は 3つ）');
  const inputs = $('s-pbanks').querySelectorAll('input[type="text"],textarea');
  ok(inputs.length === 0, '★打たせる欄が ' + inputs.length + '個 在る（聞く形になっていない）★');
  console.log('     札 3個 ／ 打たせる欄 0個');
});

T('★② 何も触らなければ 全部にチェック（今までと同じ紙）', () => {
  reset();
  ok(boxes().every((c) => c.checked), '★既定で チェックが 外れている★');
  ok(bankLinesOnPaper().length === 3, '紙に 3行 出ない');
});

T('★③ 1つ 外すと その口座だけ 紙から 消える', () => {
  reset();
  uncheck(1);   /* 愛媛銀行を 外す */
  const lines = bankLinesOnPaper();
  ok(lines.length === 2, '★紙の口座が ' + lines.length + '行★（2行のはず）');
  ok(lines.indexOf(ACC[1]) < 0, '★外した口座が 紙に 残っている★');
  ok(lines[0] === ACC[0] && lines[1] === ACC[2], '★会社の設定の順で 出ていない★');
  console.log('     外した後の紙 … ' + lines.length + '行（並びは 会社の順）');
});

T('★④ 1つも 選ばないと 全部に 戻る（振込先が 紙から 消えない）', () => {
  reset();
  uncheck(0); uncheck(1); uncheck(2);
  const lines = bankLinesOnPaper();
  ok(lines.length === 3, '★紙から 振込先が 消えた（' + lines.length + '行）★');
  console.log('     0個 選んだ → 紙は 3行（全部に 戻る）');
});

T('★⑤ 根拠が 出る（何／何を 出すか）', () => {
  reset();
  ok(/全部（3）/.test(why()), '★既定の根拠が 出ていない★：' + why().slice(0, 60));
  uncheck(1);
  ok(/2／3/.test(why()), '★選んだ後の根拠が 出ていない★：' + why().slice(0, 60));
  console.log('     ' + why().slice(0, 60) + '…');
});

T('★⑥ 保存する形に 入る（全部の時は 入れない＝会社の既定のまま）', () => {
  reset();
  const allOn = A._partnerPaperFromForm ? A._partnerPaperFromForm('p1') : null;
  ok(allOn, '★保存の形を 作る所が 外に 出ていない★');
  ok(allOn.banks === undefined, '★全部の時に 相手へ 焼き付けている★');
  uncheck(2);
  const some = A._partnerPaperFromForm('p1');
  ok(Array.isArray(some.banks) && some.banks.length === 2, '★選んだ物が 保存の形に 入らない★');
  console.log('     全部＝入れない ／ 2つ選んだ＝banks 2件');
});

T('★⑦ 別ウィザードを 作っていない（画面の数が 増えていない）', () => {
  ok(doc.querySelectorAll('.screen').length === SCREENS0,
    '★画面が 増えた（' + SCREENS0 + '→' + doc.querySelectorAll('.screen').length + '）★');
});

T('★⑧ JSの落ちが 0件', () => ok(!errs.length, errs.join(' / ')));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
