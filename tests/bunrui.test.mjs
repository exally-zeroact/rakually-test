/* bunrui.test.mjs — ★段の分類器 _bunrui の 自己確認★（純・倉庫もブラウザも 要らない）
 * ★守る事★ … ①約束の行(KEKKA)を 第一に読む ②無い時だけ 字の目印 ③exit0failed を 別に拾う
 *   ④形を 崩したら「測った」でなく「読めない」に 落ちる（飾りの字頼みの 退行を 止める）
 *   ⑤★✓だけで passed行無し→「読めない」(抜けと言わない・偽陰性止め)／✗が在れば exit0failed★
 *   ⑥★凡例の ✓/✗・「未測定 0」は 数えない★
 * ★この試験自身も 最後に KEKKA を 出す★（約束のドッグフード）。 */
import { bunrui, yomu } from '../tools/_bunrui.mjs';

let pass = 0, fail = 0;
const T = (n, c) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };
const NL = String.fromCharCode(10);

console.log('[bunrui] 段の分類器の自己確認');

/* ⑴ 約束の行を 第一に（字の目印と 食い違っても 約束を 採る） */
{
  const out = '3 passed, 9 failed' + NL + 'KEKKA {"passed":5,"failed":0,"mimiso":0}';
  const r = bunrui(0, out);
  T('約束の行を 字の目印より 優先（how=約束・測った）', r.how === '約束' && r.oke === '測った' && r.passed === 5);
}
/* ⑵ 測った */
T('4 passed,0 failed → 測った', bunrui(0, '4 passed, 0 failed').oke === '測った');
/* ⑶ exit0 なのに failed>0 → exit0failed */
T('2 passed,4 failed 終わり値0 → exit0failed', bunrui(0, '2 passed, 4 failed').oke === 'exit0failed');
/* ⑷ 一部抜け */
T('3 passed,0 failed,1 ★未測定★ → 一部抜け', bunrui(0, '3 passed, 0 failed, 1 ★未測定★').oke === '一部抜け');
T('2 passed,0 failed ／🟡未測定 1 → 一部抜け', bunrui(0, '2 passed, 0 failed ／ 🟡未測定 1').oke === '一部抜け');
/* ⑸ 丸ごと抜け（印 無し・未測定だけ） */
T('🟡 ★未測定★ …(印なし) → 丸ごと抜け', bunrui(0, '🟡 ★未測定★ 試験の 鍵が 無い').oke === '丸ごと抜け');
/* ⑹ 読めない（passedも印も未測定も 無し＝setup段） */
T('passed/印/未測定 無し → 読めない', bunrui(0, 'Current runner version 2.337').oke === '読めない');
/* ⑺ 赤 */
T('終わり値1 → 赤', bunrui(1, '4 passed, 0 failed').oke === '赤');
/* ⑻ 退行止め：passed崩し→「読めない」 */
T('形崩し(passd)→「測った」でなく「読めない」', bunrui(0, '4 passd 0 fail').oke === '読めない');
/* ⑼ 約束の mimiso>0 → 一部抜け */
T('KEKKA mimiso>0 → 一部抜け', bunrui(0, 'KEKKA {"passed":3,"failed":0,"mimiso":2}').oke === '一部抜け');
/* ⑽ 最後の passed組を 採る */
T('複数 passed組 → 最後を採る', yomu('1 passed, 0 failed' + NL + '7 passed, 0 failed').passed === 7);
/* ⑾ ★偽陰性止め★：✓を 並べて 終わる（passed行なし）→「読めない(測ってはいる)」＝丸ごと抜けと言わない */
{
  const out = ['✓ ★git archive で 事故を 再現', '✓ ★その後 見張りが 赤', '✓ ★仮フォルダ 残さない'].join(NL);
  const r = bunrui(0, out);
  T('✓だけ(passed行なし)→読めない(抜けと言わない)', r.oke === '読めない' && r.ok === 3);
}
/* ⑿ ✓が在っても 末尾に 1つ 未測定＝印在り＝丸ごと抜けと言わない（読めない） */
T('✓多数＋🟡未測定(passed行なし)→読めない', bunrui(0, ['✓ a', '✓ b', '🟡 ★未測定★ 1つ'].join(NL)).oke === '読めない');
/* ⒀ ★✗が在る(終わり値0・passed行なし)→exit0failed（赤を緑の疑い）★ */
T('✗在り 終わり値0 passed行なし → exit0failed', bunrui(0, ['✓ a', '✗ b 落ちた'].join(NL)).oke === 'exit0failed');
/* ⒁ ★凡例は 数えない★：「✓＝通る」「✗＝落ちる」の 説明行＋「未測定 0段」は 印にも 未測定にも しない */
{
  const out = ['✓＝通る ✗＝落ちる の 凡例', '出来ている 6段／半分 3段／無い 0段／未測定 0段'].join(NL);
  const r = bunrui(0, out);
  T('凡例の✓/✗・未測定0は 数えない → 読めない(ok0 ng0)', r.oke === '読めない' && r.ok === 0 && r.ng === 0 && r.mimiso === 0);
}

console.log(NL + pass + ' passed, ' + fail + ' failed');
console.log('KEKKA {"passed":' + pass + ',"failed":' + fail + ',"mimiso":0}');
process.exit(fail ? 1 : 0);
