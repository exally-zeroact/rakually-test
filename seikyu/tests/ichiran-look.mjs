/* ichiran-look.mjs — ★一覧を 一覧のままに する★（実際に 押す）
 * =============================================================================
 * 司さん 2026-09-09
 *   「一覧の件は こうゆうことやなくて ★確認押したら 違うページにいって★
 *     このやり方やったら 請求書先が 多くなったら ごちゃごちゃするやろ
 *     あと 代行請求書アプリのように ここでも ★請求ごとや 何年何月分とか 全体とか★
 *     選べれるようにして」
 *
 * ★代行請求（Exally-test/daikou-seikyu.html）を 読んで 写した所★
 *   ・絞り込みは ★select の 横並び★／「全社」「全期間」は value="" の option 1個
 *   ・月の 選択肢は ★実データから 作る★（在る月だけ・新しい順）
 *   ・★何件か・いくらか を 必ず出す★（#listSum ＝「N件（絞り込み中）　合計 ¥X」）
 *   ・請求書そのものは ★別の 画面★（showScreen で 切り替え・スクロールは 上へ）
 *
 * 見る物:
 *   ① 一覧の 中に ★紙は 出ない★（何件 在っても 割り込まない）
 *   ② 「確認」を 押すと ★紙が かぶさって 出る★（一覧は 後ろに 残る）
 *   ③ ★「閉じる」で 戻れる★／★暗い所を 押しても 閉じる★
 *   ④ かぶさっている 間も ★下のタブは「一覧」が 光ったまま★（今どこか 分かる）
 *
 * ★★2026-09-10 別の画面 → かぶせ（modal）に しました★★
 *   司さん「代行請求書アプリが どんなに しよるか 見てこいやぼけ」→「同じように やれや」
 *   ★見てきた★ Exally-test/daikou-seikyu.html:3490（modal-ov / modal）
 *     ＝詳しい物は ★かぶせで 出して「閉じる」1つで 戻る★。暗い所を 押しても 閉じる。
 *   ★別の画面だと 閉じた時に 一覧を 描き直す★＝見ていた 場所まで 戻らなかった。
 *   ⑤ ★何年何月分で しぼれる★（在る月だけ・新しい順・全部は value=""）
 *   ⑥ ★件数と 合計を 出す★／絞り込み中は そう 書く
 *   ⑦⑧ 取引先でも・両方 一緒にも しぼれる
 *   ⑨ ★空振りしていない★（押す道が 本当に 在る）
 *
 * 使い方: node seikyu/tests/ichiran-look.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let JSDOM; try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('★jsdomが入っていません。この検証は飛ばせません（SKIPを緑と呼ばない）。npm install してください。'); process.exit(1); }

const SELF = process.argv.includes('--self-test');
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
const line = (kin) => ({ name: '工事代金', qty: '1', unit: '式', price: String(kin),
  amount: String(kin), rate: 10, memo: '' });

/* ★取引先が 多い時★を わざと 作る（司さん「請求書先が 多くなったら ごちゃごちゃするやろ」） */
const NIN = 8;
const YM = ['2026-09', '2026-08', '2026-07'];
S.partners = Array.from({ length: NIN }, (_, i) => ({ id: 'p' + i, data: { name: '取引先' + i } }));
S.invoices = [];
YM.forEach((ym, j) => {
  for (let i = 0; i < NIN; i++) {
    S.invoices.push({ id: 'v' + j + '-' + i, no: ym.replace('-', '') + '-' + i, status: 'issued',
      doc_type: 'invoice', partner_id: 'p' + i, issue_ymd: ym + '-05',
      /* ★出した紙は 写しを 持つ★（税の入れ方・丸め方）＝無いと 紙が 作れない */
      tax_mode: 'exclusive', rounding: 'floor',
      lines: [line(10000 * (i + 1))], data: {},
      totals: { grandTotal: 11000 * (i + 1) } });
  }
});
S.receipts = []; S.fil = 'all'; S.docType = 'invoice';
/* ★会社の情報が 無いと 紙が 作れない★（paperInput が null を 返す）＝
   その時 lookPaper は「中身が 整っていない」と 言って ★画面を 変えない★（正しい）。
   ここで 見たいのは ★整っている 時に 画面が 変わるか★なので 入れておく。 */
S.org = { yago: '合同会社Rakunally', addr: '愛媛県今治市1-2-3', tel: '0898-00-0000',
  invoiceNo: 'T1234567890123', bank: '（見本）銀行 ◯◯支店 普通 1234567' };
S.store = {
  partners: { list: () => Promise.resolve(S.partners) },
  invoices: { list: () => Promise.resolve(S.invoices), usedNos: () => Promise.resolve([]) },
};
A._bindForTest();
A._go('scr-list');
A._renderListForTest();

const deteru = (id) => { const e = $(id); return !!e && e.classList.contains('active'); };
const gyo = () => doc.querySelectorAll('#list-body [data-look]').length;
const txt = (id) => (($(id) || {}).textContent || '').replace(/\s+/g, ' ').trim();
const osu = (sel) => {
  const b = doc.querySelector(sel); ok(b, '押す物が無い: ' + sel);
  b.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
};
const kaeru = (id, v) => {
  const el = $(id); ok(el, '選び所が 無い: ' + id);
  el.value = v;
  el.dispatchEvent(new win.Event('change', { bubbles: true }));
};

console.log('\n[ichiran-look] 一覧を 一覧のままに する（実際に 押す）' + (SELF ? '（自分ためし）' : ''));
console.log('     作った 紙 … ' + S.invoices.length + '通（取引先 ' + NIN + '社 × 月 ' + YM.length + '）');

/* ★自分ためし★＝わざと 壊す所が 本当に コードに 在るかを 先に 数える
   （壊れていない物で 見張りを 疑わない為＝うちの 前科） */
if (SELF) {
  const app = fs.readFileSync(path.join(ROOT, 'seikyu', 'js', 'seikyu-app.js'), 'utf8');
  const kowasu = [
    ['確認で かぶせを 出さない', '    lookOpen();'],
    ['月で しぼらない', "if (lm && lm.value) rows = rows.filter(function (v) { return billYm(v) === lm.value; });"],
    ['件数と 合計を 出さない', "setText('list-sum', rows.length + '件'"],
    ['戻る道を 消す', "if ($('b-lv-back')) $('b-lv-back').onclick"],
    ['暗い所を 押しても 閉じない', "      $('lv-ov').onclick = function (e) { if (e.target === this) lookClose(); };"],
  ];
  kowasu.forEach(([na, a]) => ok(app.split(a).length === 2,
    '★壊す所が 1つ 見つからない★ ' + na + ' … ' + a));
  console.log('     壊す所 ' + kowasu.length + '箇所（本当に コードに 在る事を 見た）');
  console.log('     ★下の ②⑤⑥③④ が それぞれ 受け持つ★');
}

T('★① 一覧の 中に 紙は 出ない（何件 在っても 割り込まない）', () => {
  eq(gyo(), S.invoices.length, '一覧に 出ている 行');
  ok(!$('lv-card'), '★一覧の 中に 紙の箱（lv-card）が まだ 在る★');
  ok($('scr-list').innerHTML.indexOf('id="lv"') < 0, '★一覧の 中に 紙の iframe が 在る★');
});

const kabuse = () => A._lookOpenedForTest();

T('★② 「確認」を 押すと 紙が かぶさって 出る（一覧は 後ろに 残る）', () => {
  ok(deteru('scr-list') && !kabuse(), '押す前の 画面が おかしい');
  osu('#list-body [data-look]');
  ok(kabuse(), '★紙が かぶさっていない★ … 知らせ「' + txt('list-err')
    + '」／計算「' + txt('edit-err') + '」');
  /* ★一覧は 後ろに 残る★＝閉じたら そのまま 続きから（描き直さない） */
  ok(deteru('scr-list'), '★一覧が 消えている★（かぶせなのに 画面を 変えている）');
  ok(txt('lv-h').length > 0, '★どの紙かを 出していない★');
  console.log('     ' + txt('lv-h'));
});

T('★③ 「閉じる」で 戻れる／暗い所を 押しても 閉じる', () => {
  ok($('b-lv-back'), '★閉じる物が 無い★');
  osu('#b-lv-back');
  ok(!kabuse() && deteru('scr-list'), '★閉じていない★');
  /* ★暗い所★＝かぶせの 外側を 押した時（代行請求と 同じ event.target === this） */
  osu('#list-body [data-look]');
  ok(kabuse(), '開き直せていない');
  const ov = $('lv-ov');
  ov.dispatchEvent(Object.assign(new win.MouseEvent('click', { bubbles: true }), {}));
  ok(!kabuse(), '★暗い所を 押しても 閉じない★');
  /* ★中（紙）を 押した時は 閉じない★＝読んでいる 途中で 消えない */
  osu('#list-body [data-look]');
  $('lv-h').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok(kabuse(), '★中を 押したら 閉じた★（読んでいる 途中で 消える）');
  osu('#b-lv-back');
});

T('★④ かぶさっている 間も 下のタブは「一覧」が 光ったまま', () => {
  osu('#list-body [data-look]');
  const on = [...doc.querySelectorAll('.bn')].filter((b) => b.classList.contains('on'));
  eq(on.length, 1, '★光っている タブの 数★（0だと 今どこか 分からない）');
  eq(on[0].getAttribute('data-scr'), 'scr-list', '★別のタブが 光っている★');
  osu('#b-lv-back');
});

T('★⑤ 何年何月分で しぼれる（在る月だけ・新しい順・全部は 空）', () => {
  const el = $('l-month');
  ok(el, '★月の 選び所が 無い★');
  const v = [...el.options].map((o) => o.value);
  eq(v[0], '', '★「月をぜんぶ」が 先頭に 無い★ ' + JSON.stringify(v));
  eq(v.slice(1).join(','), YM.join(','), '★在る月だけ・新しい順 に なっていない★ ' + JSON.stringify(v));
  kaeru('l-month', '2026-08');
  eq(gyo(), NIN, '★月で 絞れていない★');
  console.log('     ' + [...el.options].map((o) => o.textContent).join(' / '));
});

T('★⑥ 件数と 合計を 出す／絞り込み中は そう 書く', () => {
  const t = txt('list-sum');
  ok(t.indexOf(NIN + '件') === 0, '★件数を 出していない★: ' + t);
  ok(t.indexOf('絞り込み中') >= 0, '★絞っているのに そう 書いていない★: ' + t);
  ok(/合計 [\d,]+ 円/.test(t), '★合計を 出していない★: ' + t);
  console.log('     ' + t);
  kaeru('l-month', '');
  eq(gyo(), S.invoices.length, '★月を 戻しても 全部に ならない★');
  const t2 = txt('list-sum');
  ok(t2.indexOf('絞り込み中') < 0, '★絞っていないのに 絞り込み中と 書いている★: ' + t2);
  console.log('     ' + t2);
});

T('★⑦ 取引先でも しぼれる（前からの 物が 壊れていない）', () => {
  const el = $('l-partner');
  ok(el, '★取引先の 選び所が 無い★');
  eq([...el.options][0].value, '', '★「すべての取引先」が 先頭に 無い★');
  kaeru('l-partner', 'p3');
  eq(gyo(), YM.length, '★取引先で 絞れていない★');
  kaeru('l-partner', '');
  eq(gyo(), S.invoices.length, '★戻っていない★');
});

T('★⑧ 取引先と 月を 一緒に しぼれる（代行請求と 同じ）', () => {
  kaeru('l-partner', 'p3');
  kaeru('l-month', '2026-07');
  eq(gyo(), 1, '★2つ 一緒に 絞れていない★');
  console.log('     ' + txt('list-sum'));
  kaeru('l-month', '');
  kaeru('l-partner', '');
});

T('★⑨ 空振りしていない（押す道が 本当に 在る）', () => {
  ok(S.invoices.length >= 20, '★紙が 少なすぎ＝多い時を 見ていない★ ' + S.invoices.length);
  ok(gyo() >= 20, '★確認の ボタンが 描かれていない★');
  ok(html.indexOf('id="lv-ov"') > 0, '★紙の かぶせが 画面に 無い★');
  ok(html.indexOf('id="scr-look"') < 0, '★古い 別画面が まだ 残っている★（2か所に なる）');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
