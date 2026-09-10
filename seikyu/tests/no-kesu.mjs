/* no-kesu.mjs — ★請求番号を 紙に 出さない 設定★
 * =============================================================================
 * 司さん 2026-09-09「請求番号を除ける設定がない」
 *
 * ★代行請求（Exally-test/daikou-seikyu.html）の 実物★
 *   自社情報に `showInvoiceNo`（既定 ★false＝出さない★）。
 *   設定タブの `#iss_showNo` と 編集タブのスイッチ、どちらも同じ値を触る。
 *   紙側は `meisai-engine.js:432`
 *     var noStr = iss.showInvoiceNo && ctx.invoiceNo ? esc(ctx.invoiceNo) : "";
 *   ＝★出すかどうかだけ。採番そのものは 止めない★。
 *
 * ★うちは 既定を「出す」に する★
 *   前から 出しているので、既定を 変えると ★紙の顔が 黙って 変わる★。
 *   切りたい会社が 設定で 切る。
 *
 * 見る物:
 *   ① 既定は ★紙に 番号が 出る★
 *   ② 「出さない」に すると ★紙から 消える★（欄ごと。空の「No.」を 残さない）
 *   ③ ★番号を 付けるのは 止めない★（控え・二度使わない為に 番号そのものは 要る）
 *   ④ 設定の 欄が 在り、読み書きが つながっている
 *   ⑤ 空振りしない（番号が 本当に 在る紙で 測っている）
 *
 * 使い方: node seikyu/tests/no-kesu.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const req = async (f) => (await import('file://' + path.join(ROOT, 'seikyu', 'lib', f).split(path.sep).join('/'))).default
  || (await import('file://' + path.join(ROOT, 'seikyu', 'lib', f).split(path.sep).join('/')));
const PAPER = await req('seikyu-paper.js'), TPL = await req('seikyu-templates.js');
const TAX = await req('seikyu-tax.js'), COLS = await req('seikyu-cols.js');

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m || 'false'); };

const NO = '202609-001';
function kami(style, id) {
  const ln = [{ name: '工事代金', qty: '1', unit: '式', price: '30000', amount: '30000', rate: 10 }];
  const t = TAX.compute({ lines: ln, taxMode: 'exclusive', rounding: 'floor' });
  const tp = TPL.getOrDefault(id || 'std1');
  const ded = TPL.usesDeduction(id || 'std1');
  return PAPER.build({
    inv: { no: NO, issue_ymd: '2026-09-09', kind: 'invoice', lines: ln,
      totals: { grandTotal: t.grandTotal }, data: {} },
    tax: t, partner: { name: '八木工業', honor: '御中' },
    org: { yago: '合同会社Rakunally', bank: '（見本）銀行 ◯◯支店 普通 1234567' },
    template: tp, templateId: id || 'std1', theme: tp.theme, style: style || {},
    cols: COLS.normalizeSpec(tp.cols),
    deduct: ded ? 7310 : 0, deductLines: ded ? [{ name: '弁当代', amount: '7310' }] : [],
  }).html;
}
/* ★紙の 中だけ 見る★＝<title>（ファイルの名前）は 紙では ない */
const naka = (h) => String(h).slice(String(h).indexOf('<body'));

console.log('\n[no-kesu] 請求番号を 紙に 出さない 設定');

T('★⑤ 空振りしていない（番号が 本当に 在る紙で 測っている）', () => {
  ok(NO.length > 0, '番号が 空');
  ok(naka(kami({})).indexOf(NO) >= 0, '★既定でも 番号が 紙に 無い＝この検査は 何も 見ていない★');
});

T('★① 既定は 紙に 番号が 出る（黙って 消さない）', () => {
  const h = naka(kami({}));
  ok(h.indexOf(NO) >= 0, '★既定なのに 番号が 出ていない★');
  ok(h.indexOf('No.') >= 0, '★「No.」の 見出しが 無い★');
});

T('★② 「出さない」で 紙から 消える（欄ごと）', () => {
  const h = naka(kami({ noOn: false }));
  ok(h.indexOf(NO) < 0, '★切ったのに 番号が 紙に 出ている★');
  ok(h.indexOf('No.') < 0, '★空の「No.」が 残っている★＝何かが 抜けたように 見える');
  ok(h.indexOf('請求日') >= 0, '★となりの 請求日まで 消えた★');
});

T('★①-2 どの様式でも 同じに 効く（片方だけ 直さない）', () => {
  ['std1', 'elegant', 'koujo', 'genba'].forEach((id) => {
    ok(naka(kami({}, id)).indexOf(NO) >= 0, id + '：既定で 出ていない');
    ok(naka(kami({ noOn: false }, id)).indexOf(NO) < 0, id + '：★切っても 出ている★');
  });
  console.log('     4様式とも 効いた');
});

T('★③ 番号を 付けるのは 止めない（採番そのものは 生きている）', () => {
  /* ★紙に 書くかどうかだけ★＝1通が 持つ 番号は そのまま
     （控えと「同じ番号を 二度 使わない」為に 番号そのものは 要る）。 */
  const r = PAPER.build({
    inv: { no: NO, issue_ymd: '2026-09-09', kind: 'invoice',
      lines: [{ name: 'x', qty: '1', unit: '式', price: '1000', amount: '1000', rate: 10 }],
      totals: { grandTotal: 1100 }, data: {} },
    tax: TAX.compute({ lines: [{ name: 'x', qty: '1', unit: '式', price: '1000', rate: 10 }],
      taxMode: 'exclusive', rounding: 'floor' }),
    partner: { name: 'A', honor: '御中' }, org: { yago: 'Z' },
    template: TPL.getOrDefault('std1'), templateId: 'std1',
    theme: TPL.getOrDefault('std1').theme, style: { noOn: false },
    cols: COLS.normalizeSpec(TPL.getOrDefault('std1').cols), deduct: 0, deductLines: [],
  });
  ok(String(r.html).indexOf(NO) >= 0, '★ファイルの 名前からも 番号が 消えた★（控えが 分からなくなる）');
});

T('★④ 設定の 欄が 在り、読み書きが つながっている', () => {
  const h = fs.readFileSync(path.join(ROOT, 'seikyu', 'index.html'), 'utf8');
  const a = fs.readFileSync(path.join(ROOT, 'seikyu', 'js', 'seikyu-app.js'), 'utf8');
  ok(h.indexOf('id="s-no"') > 0, '★設定に 欄が 無い★');
  ok(a.indexOf("$('s-no').value = (st.noOn === false)") > 0, '★倉庫から 画面へ 戻していない★');
  ok(a.indexOf("$('s-no').value === 'off'") > 0, '★画面から 倉庫へ 書いていない★');
  /* ★既定は 出す★＝「出す」を 選んだ時に 何も 書かない（false だけ 持つ） */
  ok(a.indexOf('o.noOn = false;') > 0, '★切った時に false を 書いていない★');
});

T('★⑥ 畳んだ 引き出しの 中に 隠れていない（探して 見つかる所に 在る）', () => {
  /* ★2026-09-10 実測で 踏んだ★
     欄は 在ったのに、「紙の書き方（言い方と並び）」という ★畳んだ 引き出しの 中★に 置いていた。
     司さんは 設定を 上から 下まで 見て「請求書番号のオンオフ（が無い）」と 言った。
     ⇒ ★開かないと 見えない 所に 置いた 設定は「無い」のと 同じ★。
       番号の 話は 「番号の形」と 同じ カードの 中＝畳まれていない 所に 置く。
       ★司さん「番号の形の 上に しろよ」★＝出すか どうかが 先、形は その次。 */
  const h = fs.readFileSync(path.join(ROOT, 'seikyu', 'index.html'), 'utf8');
  const set = h.slice(h.indexOf('id="scr-set"'), h.indexOf('id="s-no"'));
  const aku = (set.match(/<details/g) || []).length;
  const shime = (set.match(/<\/details>/g) || []).length;
  ok(aku === shime, '★請求番号の 欄が 畳んだ 引き出しの 中に 在る★（開いた ' + aku + ' / 閉じた ' + shime + '）');
  /* ★番号の形と 同じ カードに 在る★＝「請求書の決まり」の 中 */
  const kime = h.indexOf('請求書の決まり');
  ok(kime > 0 && kime < h.indexOf('id="s-no"'), '★「請求書の決まり」より 前に 在る★');
  /* ★司さん 2026-09-10「番号の形の 上に しろよ」★＝出すか どうかが 先、形は その次 */
  ok(h.indexOf('id="s-no"') < h.indexOf('id="s-format"'), '★番号の形より 上に 在る★');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
