/* ym-hozon.test.mjs — ★月を 選ぶ 欄（data-ym）は「change」で 受ける★
 * ============================================================================
 * ★なぜ（2026-09-16 実測）★
 *   月を 選ぶ 欄は ★`<input type="hidden" data-ym>`★ で 作り、
 *   ★js/ym-picker.js が その 隣に select（.ym-one）を 差し込む★（iOS Safari が type=month を
 *   持って いない ので この形に した＝2026-08-04 司さんの 実機）。
 *   ★その select が 出す 行事は ★`change` だけ★★（ym-picker.js 100行）。★`input` は 出ません★。
 *
 * ★何が 起きて いたか★
 *   「変動があった月」（.sh-henko）を 受ける 所が ★`input` の listener 側★に 書いて あった。
 *   ⇒ ★選んでも state に 1度も 入らない★
 *   ⇒ gekkakuRows（app.js）の 門「s.henkoYm が 在る」で ★全員 落ちる★
 *   ⇒ ★★月額変更届が 誰も 出せない★★
 *   ★実測★ … 画面で 2026-04 を 選び、画面を 離れて 戻ると ★欄は 空／箱は 今月に 戻る★。
 *   ★同じ 形を 3つ 数えた★
 *     ・賞与支給月（data-bn）… `change` 側 ＝★効く★
 *     ・従前の 改定月（data-f）… `change` 側 ＝★効く★
 *     ・★変動があった月（sh-henko）… `input` 側 ＝★壊れて いた★★
 *
 * ★ここで見る事★
 *   ① ym-picker が 出す 行事は `change`（`input` を 出して いない）
 *   ② `data-ym` の 欄を 受ける 所が ★`input` の listener の 中に 無い★
 *   ③ 変動月（sh-henko）は `change` の listener の 中に 在る
 *
 * ★字だけで 測ります★（ブラウザ 要らない＝CIで 毎回）。
 * 使い方: node kyuyo/tests/ym-hozon.test.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELF = process.argv.includes('--self-test');

let pass = 0, fail = 0;
const T = (n, f) => { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m); };

export function strip(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/* ★listener の 塊を 切り出す★＝`el.addEventListener('input', function(ev){ … })` の 中身 */
export function listenerNoNaka(src, gyoji) {
  const shirushi = "addEventListener('" + gyoji + "'";
  const out = [];
  let i = 0;
  while ((i = src.indexOf(shirushi, i)) >= 0) {
    let d = 0, j = src.indexOf('{', i), owari = -1;
    if (j < 0) break;
    for (let k = j; k < src.length; k++) {
      if (src[k] === '{') d++;
      else if (src[k] === '}') { d--; if (d === 0) { owari = k; break; } }
    }
    if (owari < 0) break;
    out.push(src.slice(i, owari + 1));
    i = owari;
  }
  return out;
}

const APP = strip(fs.readFileSync(path.join(ROOT, 'kyuyo/js/app.js'), 'utf8'));
const PICKER = strip(fs.readFileSync(path.join(ROOT, 'kyuyo/js/ym-picker.js'), 'utf8'));

/* ★見る 範囲を 先に 数えて 出す★ */
const YM_RAN = [...APP.matchAll(/data-ym/g)].length;
const IN_LIST = listenerNoNaka(APP, 'input');
const CH_LIST = listenerNoNaka(APP, 'change');
console.log('\n[ym-hozon] 月を 選ぶ 欄（data-ym）は change で 受ける（2026-09-16＝月額変更届が 誰も 出せなかった）');
console.log('  見る 範囲 … data-ym の 欄 ' + YM_RAN + '個 ／ input の listener ' + IN_LIST.length
  + '個 ／ change の listener ' + CH_LIST.length + '個');

T('★① ym-picker が 出す 行事は change だけ（input は 出さない）', () => {
  ok(/dispatchEvent\(\s*new Event\(\s*'change'/.test(PICKER), '★change を 出して いない★＝形が 変わった？');
  ok(!/dispatchEvent\(\s*new Event\(\s*'input'/.test(PICKER), '★input も 出して いる★＝この見張りの 前提が 変わった');
});

T('★② data-ym の 欄を input の listener で 受けて いない', () => {
  const warui = [];
  for (const na of ['sh-henko', 'zenzenKaiteiYmd', 'payYm']) {
    if (IN_LIST.some((x) => x.indexOf(na) >= 0)) warui.push(na);
  }
  ok(warui.length === 0,
    '★' + warui.join('・') + ' を input の 側で 受けて います★＝'
    + '★ym-picker は input を 出さない＝1度も 保存されません★（月額変更届が 誰も 出せなくなる）');
});

T('★③ 変動があった月（sh-henko）は change の listener で 受けて いる', () => {
  ok(CH_LIST.some((x) => x.indexOf('sh-henko') >= 0),
    '★change の 側に 無い★＝選んでも state に 入りません');
});

/* ★★自己確認＝わざと 壊して 赤が 出るか★★ */
if (SELF) {
  console.log('\n[ym-hozon] ★自己確認★（わざと 壊して 赤が 出るか）');
  let ng = 0;
  const iu = (n, good, m) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + n + (good ? '' : '  ★' + (m || '') + '★')); };

  const nise = "el.addEventListener('input',function(ev){ if(t.classList.contains('sh-henko')){ x(); } });";
  const kowa = listenerNoNaka(strip(nise), 'input');
  iu('② ★input の 側に 戻したら 赤★', kowa.some((x) => x.indexOf('sh-henko') >= 0), '見つけられない');

  const nise2 = "el.addEventListener('change',function(ev){ var f=ev.target.dataset.f; });";
  const kowa2 = listenerNoNaka(strip(nise2), 'change');
  iu('③ ★change の 側から 消したら 赤★', !kowa2.some((x) => x.indexOf('sh-henko') >= 0), '消しても 気づかない');

  const nise3 = "input.dispatchEvent(new Event('input', { bubbles: true }));";
  iu('① ★picker が input も 出すように なったら 赤★',
    /dispatchEvent\(\s*new Event\(\s*'input'/.test(nise3), '見つけられない');

  console.log(ng ? '\n★自己確認 ' + ng + '件 おかしい★' : '\n自己確認 OK（★赤が 出る事まで 見た★）');
  if (ng) process.exit(1);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
