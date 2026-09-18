/* rousai-fuda.test.mjs — ★労災の 札は「選んだ 業種」を 出す★（決め打ちに 戻さない）
 * ============================================================================
 * ★なぜ（2026-09-18 実測）★
 *   労働保険の 画面で ★業種を 選んでも「業種を 選んでください」と 出続けて いた★。
 *     字 … `'<div class="hint">労災（★業種を 選んでください★）</div>'` ＝★決め打ち★
 *   ★計算は 合って いた★（賃金 780,000×52‰＝¥40,560／画面にも ¥40,560）
 *   ⇒ ★出ない のは 字だけ★＝★一番 気づかれにくい★
 *   ⇒ 隣の 雇用保険は 「一般の事業・全体 13.5‰（…）」と ★選んだ 中身を 出して いる★
 *      ＝★同じ 箱の 隣同士で 片方だけ 教えて くれない★＝★客は「選べて いない」と 思う★
 *   ★★（星）が 客に 出る 字に 入って いた★＝★客に 出る 字に 飾りを 入れない★の 決めに 当たる
 *
 * ★ここで見る事★
 *   ① ★決め打ちの 字が 戻って いない★（`労災（★業種を…` の 形）
 *   ② ★札は 選んだ 業種から 作る★（`rousaiFudaJi` を 通す）
 *   ③ ★その 札を 作る 所で 業種・率を 見て いる★（rousaiShurui／permil）
 *   ④ ★客に 出る その 字に ★（星）を 入れない★
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELF = process.argv.includes('--self-test');
const APP = fs.readFileSync(path.join(ROOT, 'kyuyo/js/app.js'), 'utf8').split('\r\n').join('\n');

let pass = 0, fail = 0;
const T = (n, f) => { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const HOSHI = String.fromCharCode(0x2605);          /* ★ */

/* ★★注記を 外してから 数える★★（2026-09-18 … この段が ★自分の 覚書を 拾って 赤に なった★）
   ★訳★＝直した 訳を app.js の 注記に 書いた＝★そこに 昔の 決め打ちの 字が 写して 在る★
   ⇒ ★「字が 在る＝戻って いる」では ない★＝★動く 所だけ 見る★（souko-mon と 同じ 形）。 */
function strip(src) {
  /* ★逆斜線を 使わない★＝heredoc で 落ちて ★見張りが 動かなく なる★（同じ日に 3回 踏んだ） */
  const A = '/' + '*', B = '*' + '/';
  let out = '', i = 0;
  while (i < src.length) {
    const a = src.indexOf(A, i);
    if (a < 0) { out += src.slice(i); break; }
    out += src.slice(i, a);
    const b = src.indexOf(B, a + 2);
    if (b < 0) break;
    i = b + 2;
  }
  return out;
}
const APP_UGOKU = strip(APP);

/* ★その 札を 作る 所だけを 切り出す★（店 全部を 見ない＝別の 所の 字で 誤って 赤に しない） */
function fudaNaka(src) {
  const at = src.indexOf('function rousaiFudaJi');
  if (at < 0) return '';
  const owari = src.indexOf('\n  }', at);
  return owari < 0 ? src.slice(at) : src.slice(at, owari);
}

console.log('\n[rousai-fuda] 労災の 札は 選んだ 業種を 出す');

T('★① 決め打ちの 字に 戻って いない', () => {
  ok(APP_UGOKU.indexOf('労災（' + HOSHI + '業種を 選んでください') < 0,
    '★決め打ちの 字が 戻って いる★＝選んでも「業種を 選んでください」の まま に なります');
});

T('★② 札は 選んだ 業種から 作る（1か所を 通す）', () => {
  ok(/function rousaiFudaJi/.test(APP_UGOKU), '★札を 作る 所（rousaiFudaJi）が 無い★');
  ok(APP_UGOKU.indexOf('esc(rousaiFudaJi(') >= 0,
    '★画面が その 1か所を 通して いない★＝別の 所で 字を 作って います');
});

T('★③ 札を 作る 所が 業種と 率を 見て いる', () => {
  const naka = fudaNaka(APP_UGOKU);
  ok(naka, '★札を 作る 所を 切り出せない★');
  ok(naka.indexOf('rousaiShurui') >= 0, '★業種を 見て いない★');
  ok(naka.indexOf('permil') >= 0 || naka.indexOf('rousaiPermilOf') >= 0, '★率を 見て いない★');
  ok(naka.indexOf('業種を 選んでください') >= 0, '★選んで いない時の 字が 無い★');
});

T('★④ 客に 出る その 字に ' + HOSHI + '（星）を 入れて いない', () => {
  const naka = fudaNaka(APP_UGOKU);
  const ji = (naka.match(/'[^']*'/g) || []).filter((x) => /[ぁ-んァ-ヶ一-龠]/.test(x));
  const dame = ji.filter((x) => x.indexOf(HOSHI) >= 0);
  ok(dame.length === 0, '★客に 出る 字に 星が 在る★ … ' + dame.join(' / '));
  console.log('     客に 出る 字 ' + ji.length + '本 … 星 0本');
});

if (SELF) {
  console.log('\n[rousai-fuda] ★自己確認★（わざと 壊して 赤が 出るか）');
  let ng = 0;
  const iu = (n, good, m) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + n + (good ? '' : '  ★' + (m || '') + '★')); };
  const modoshita = APP_UGOKU + "\n var x = '<div class=\"hint\">労災（" + HOSHI + "業種を 選んでください" + HOSHI + "）</div>';\n";
  iu('① ★決め打ちに 戻したら 赤★', modoshita.indexOf('労災（' + HOSHI + '業種を 選んでください') >= 0, '戻しても 気づかない');
  const nashi = APP_UGOKU.split('function rousaiFudaJi').join('function nazoNoFuda');
  iu('② ★1か所を 通さなく したら 赤★', !/function rousaiFudaJi/.test(nashi), '通さなくても 気づかない');
  const hoshiIri = "function rousaiFudaJi(c){ return '" + HOSHI + "業種を 選んでください" + HOSHI + "'; }\n  }";
  const naka2 = fudaNaka(hoshiIri + '\n');
  const ji2 = (naka2.match(/'[^']*'/g) || []).filter((x) => /[ぁ-んァ-ヶ一-龠]/.test(x));
  iu('④ ★星を 入れたら 赤★', ji2.filter((x) => x.indexOf(HOSHI) >= 0).length > 0, '星を 入れても 気づかない');
  console.log(ng ? '\n★自己確認 ' + ng + '件 おかしい★' : '\n自己確認 OK（★赤が 出る事まで 見た★）');
  if (ng) process.exit(1);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
