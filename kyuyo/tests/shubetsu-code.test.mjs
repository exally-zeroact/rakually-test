/* shubetsu-code.test.mjs — ★全銀の 種別コードを 会社が 選べる★（既定は 今のまま）
 * ============================================================================
 * ★一次情報（2026-09-03 に PDF を 開いて 原文で 確かめた）★
 *   ・大分銀行「全銀フォーマットについて」…「2 種別コード Ｎ 2 ／ 業務種別 ★21：総合★ ／
 *       ★11または71：給与★ ／ ★12または72：賞与★」
 *       https://www.oitabank.co.jp/business/businessdirect/pdf/zengin_format.pdf
 *   ・三井住友銀行「給与／賞与振込（全銀形式）」…「種別コード Ｎ ★１１：給与振込、１２：賞与振込★」
 *       https://www.smbc.co.jp/hojin/eb/web21/pdf/file-layout_02.pdf
 *   ⇒★「22」は 存在しない★（指示役の 記憶違いを 一次情報で 訂正した）。
 *   ⇒★71/72 も 認められているが 11/12 を 使う★＝★SMBC は 11/12 しか 書いていない＝広く 通る方★。
 *
 * ★なぜ 選べるように するか★
 *   今は ヘッダに ★'21'（総合振込）が 直書き★＝★会社が 選べない★。
 *   ・給与を ★総合振込で 送る 会社は 多い★＝今の 出力は 間違いでは ない
 *   ・でも ★銀行と「給与振込」の 契約★を している 会社は ★11／賞与は 12★でないと 受けない
 *   ⇒ どちらかは ★会社ごと★＝アプリが 決められない＝★聞く★（既定は 今のまま）
 *
 * ★ここで 固定する事★
 *   ① ★何も 選んでいない 会社の 全銀は 1バイトも 変わらない★（＝'21'）
 *   ② 給与振込を 選んだ 会社 … 月次 ★11★／賞与 ★12★
 *   ③ 総合振込の 会社 … 賞与も ★21★
 *   ④ 種別は ★2桁の 数字★以外を 受け付けない（変な値を 銀行へ 出さない）
 *
 * 使い方: node kyuyo/tests/shubetsu-code.test.mjs [--self-test]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELF = process.argv.includes('--self-test');
const Zm = require(path.join(ROOT, 'kyuyo/lib/zengin.js'));
const Z = Zm.default || Zm;

let pass = 0, fail = 0;
const T = (n, f) => { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const CO = { code: '1234567890', name: 'ｾﾞﾛｱｸﾄ', torikumiMMDD: '1023', bankNo: '0001', bankName: 'ﾐｽﾞﾎ', branchNo: '001', branchName: 'ﾎﾝﾃﾝ', yokin: '普通', account: '1234567' };
const shubetsu = (h) => h.slice(1, 3);

console.log('\n[shubetsu-code] 全銀の 種別コード（一次情報＝21:総合／11:給与／12:賞与・22は無い）');

T('★① 何も 選んでいない 会社は 今までどおり 21（1バイトも 変わらない）', () => {
  const h = Z.header(CO);
  ok(h.length === 120, '★ヘッダの 長さが 120で ない★ … ' + h.length);
  ok(shubetsu(h) === '21', '★既定が 21で ない★ … 「' + shubetsu(h) + '」');
  /* ★頭の 4文字まで 同じ★＝区分1＋種別21＋コード区分0 */
  ok(h.slice(0, 4) === '1210', '★頭が 変わった★ … 「' + h.slice(0, 4) + '」');
});

T('★② 給与振込の 会社 … 月次 11 ／ 賞与 12', () => {
  ok(shubetsu(Z.header(Object.assign({}, CO, { shubetsu: '11' }))) === '11', '★月次で 11に ならない★');
  ok(shubetsu(Z.header(Object.assign({}, CO, { shubetsu: '12' }))) === '12', '★賞与で 12に ならない★');
});

T('★③ 総合振込の 会社は 賞与も 21', () => {
  ok(shubetsu(Z.header(Object.assign({}, CO, { shubetsu: '21' }))) === '21', '★21を 渡して 21に ならない★');
});

T('★④ 2桁の 数字 以外は 受け付けない（変な値を 銀行へ 出さない）', () => {
  const dame = ['22', '1', '111', 'あ', '１１', '', null, '0'];
  /* ★22 は 一次情報に 無い＝出させない★（「決めつけない」で 当たって 分かった値） */
  for (const v of dame) {
    const h = Z.header(Object.assign({}, CO, { shubetsu: v }));
    ok(shubetsu(h) === '21', '★おかしな 種別「' + v + '」が そのまま 出た★ … 「' + shubetsu(h) + '」');
  }
  console.log('     ' + dame.length + '通りの おかしな値 … ぜんぶ 既定の 21に 落とす');
});

if (SELF) {
  console.log('\n[shubetsu-code] ★自己確認★（★わざと 壊すと 赤に なるか★）');
  let ng = 0;
  const say = (nm, good) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + nm + (good ? '' : '  ★思っていたのと 違う★')); };
  say('種別を 見る 場所が 合っている（1〜2文字目）', Z.header(CO).slice(1, 3) === '21');
  say('渡す値で 答えが 変わる（物差しが 効いている）',
    Z.header(Object.assign({}, CO, { shubetsu: '11' })).slice(1, 3) !== Z.header(CO).slice(1, 3));
  if (ng) { console.log('\n★自己確認 ' + ng + '件 おかしい★'); process.exit(1); }
  console.log('  ★2通り ぜんぶ 思った通り★');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
