/* mon-to-ran.test.mjs — ★門が 要るのに 画面に 欄が 無い 物★を 一覧で 出す
 * =============================================================================
 * ★なぜ 作ったか（2026-09-14）★
 *   今日 ★同じ型の 欠陥を 2つ★ 見つけた。どちらも ★押して 初めて★ 出た:
 *     ①被扶養者(異動)届 … ★項番8 被保険者整理番号★の 欄が 画面に 1つも 無かった
 *        ⇒「減った」「変わった」が ★本番で 1枚も 出せなかった★
 *     ②算定基礎届／月額変更届 … ★従前の 改定月★の 欄が 画面に 1つも 無かった
 *        ⇒ ★2つとも 丸ごと 出せなかった★（倉庫に 持つ人 本番0人・試験0人）
 *   ⇒ ★このままだと 押すたびに 1つずつ 出る★。
 *   ⇒ ★押さずに 先回りする★＝
 *      ★門（lib）が 必須に している 値★ と ★画面（app.js）に 入れる 欄が 在る 値★ を 突き合わせる。
 *
 * ★何を 何で 数えたか（ここを 読めば 誤りを 指せる）★
 *   ・★門の 側★ … この紙の MON 表（★人が 写した★物＝lib/todokede-csv.js の dasuKa* を 1行ずつ 読んで 写した）
 *       ★機械が lib から 自動で 拾ってはいません★＝★写し間違いは 起こり得ます★
 *       ⇒ だから ★写した 行番号を 一緒に 持つ★（後から 原文に 当たれる）
 *   ・★画面の 側★ … app.js と index.html の 字を 見る。★2通り 数える★:
 *       (a) data-f="…"（従業員マスタの 欄）
 *       (b) ★class＝JS が 差し込む 部品★（例 .sh-prevhyojun）
 *       ★(b) を 数えるのは 今日の 学び★＝
 *         変動月は type=hidden だが ★ym-picker.js が 隣に 選ぶ箱を 作る★＝★客は 入れられる★。
 *         ★元の input だけ 見ると「欄が 無い」と 誤る★（私は 誤りかけた）。
 *   ・★「在る」＝字が 1個以上★。★本当に 打てるか までは 見ていません★（そこは 実ブラウザの 仕事）。
 *
 * ★この道具の 限界（先に 書く）★
 *   ・★門の 表が 人の 写し★＝lib を 直しても ★この紙は 自動では 追わない★。
 *     ⇒ ★lib の dasuKa* の 行数が 変わったら 赤に する★見張りを 下に 付けた（写し直しの 合図）。
 *   ・★会社の 側（事業所）は 見ていません★＝人（従業員）の 欄だけ。
 *
 * 使い方: node kyuyo/tests/mon-to-ran.test.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const LIB = fs.readFileSync(path.join(ROOT, 'lib/todokede-csv.js'), 'utf8');

/* ★門が 必須に している 値★（lib/todokede-csv.js の dasuKa* を 1行ずつ 読んで 写した）
   mise … その 値を ★画面の どの 印で 入れるか★（0個なら「欄が 無い」）
   ★mise が null＝人が 入れる 物では ない★（画面や 明細から 出る）＝一覧から 外す 訳を 書く */
const MON = [
  /* ── 資格取得届 2200700（dasuKaShutoku・757行）──────────────── */
  ['取得届', '氏名（カナ）', 'kana', 'e.kana', 760],
  ['取得届', '性別', 'seibetsu', 'e.seibetsu', 762],
  ['取得届', '郵便番号', 'zip', 'e.zip', 763],
  ['取得届', '住所（カナ）', 'jushoKana', 'e.jushoKana', 764],
  ['取得届', '資格取得日（入社日）', 'joinYmd', 'inp.shutokuYmd', 765],
  /* ── 資格喪失届 2201700（dasuKaSoshitsu・910行）────────────── */
  ['喪失届', '氏名（カナ）', 'kana', 'e.kana', 913],
  ['喪失届', '基礎年金番号', 'kisoNenkin', 'e.kisoNenkin', 914],
  /* ★私の 写し間違い（2026-09-14・その場で 直した）★
     印を leaveYmd と 当てずっぽうで 書いて「欄が 無い」と 出た。
     実物は app.js 1178行 data-f="taishokuYmd"。
     ＝★この道具は「印の 名前」を 人が 書く★＝★書き間違えると 嘘の ✗が 出る★。
       ⇒ ★✗が 出たら まず 印の 名前を 実物で 確かめる★（欠陥だと 決めつけない）。 */
  ['喪失届', '退職日', 'taishokuYmd', 'inp.taishokuYmd', 916],
  /* ── 被扶養者(異動)届 2202700（dasuKaFuyo・1229行）─────────── */
  ['被扶養者届', '本人の 氏名（カナ）', 'kana', 'e.kana', 1234],
  ['被扶養者届', '本人の 生年月日', 'birthYmd', 'e.birthYmd', 1235],
  ['被扶養者届', '本人の 性別', 'seibetsu', 'e.seibetsu', 1240],
  ['被扶養者届', '本人の 基礎年金番号', 'kisoNenkin', 'e.kisoNenkin', 1241],
  ['被扶養者届', '本人の 郵便番号', 'zip', 'e.zip', 1242],
  ['被扶養者届', '本人の 住所', 'address', 'e.jushoKanji', 1243],
  ['被扶養者届', '★被保険者整理番号（項番8）', 'hokenshaNo', 'e.seiriNo', 1244],
  /* ── 賞与支払届 2265700（dasuKaShoyo・645行）───────────────── */
  ['賞与支払届', '氏名（カナ）', 'kana', 'e.kana', 648],
  /* ── 算定基礎届 2225700（dasuKa・234行）────────────────────── */
  ['算定基礎届', '氏名（カナ）', 'kana', 'e.kana', 236],
  ['算定基礎届', '★従前の 改定月（項番15〜17）', 'zenzenKaiteiYmd', 'inp.zenzen.kaiteiYmd', 247],
  /* ── 月額変更届 2221700（dasuKaGekkaku・496行）─────────────── */
  ['月額変更届', '氏名（カナ）', 'kana', 'e.kana', 498],
  ['月額変更届', '★従前の 改定月（項番15〜17）', 'zenzenKaiteiYmd', 'inp.zenzen.kaiteiYmd', 500],
  ['月額変更届', '変動があった月', '.sh-henko', 'inp.henkoYm', 501],
];

/* ★画面に 欄が 在るか★＝2通りで 数える（今日の 学び＝JS が 差し込む 物も 客の道） */
function ranKazu(shirushi) {
  if (String(shirushi).charAt(0) === '.') {
    /* class＝JS が 差し込む 部品（ym-picker の 様に 別の 部品に 化ける物も 在る） */
    const kurasu = String(shirushi).slice(1);
    const re = new RegExp('class="[^"]*\\b' + kurasu + '\\b', 'g');
    return (APP.match(re) || []).length + (HTML.match(re) || []).length;
  }
  const re = new RegExp('data-f="' + shirushi + '"', 'g');
  return (APP.match(re) || []).length + (HTML.match(re) || []).length;
}

let pass = 0, fail = 0;
const T = (n, f) => { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m); };

if (process.argv.includes('--self-test')) {
  console.log('\n[mon-to-ran] ★自己確認★（★数え方そのもの★）');
  let ng = 0;
  const iu = (nm, good) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + nm + (good ? '' : '  ★思っていたのと 違う★')); };
  iu('① data-f を 数えられる（kana は 1個以上）', ranKazu('kana') >= 1);
  iu('② ★在りもしない 印は 0個★（当てずっぽうで 当たらない）', ranKazu('kono_ran_wa_nai_hazu') === 0);
  iu('③ class の 印も 数えられる（.sh-henko は 1個以上）', ranKazu('.sh-henko') >= 1);
  iu('④ ★在りもしない class は 0個★', ranKazu('.kono_class_wa_nai') === 0);
  /* ★今日 作った 2つが ちゃんと 数えられる事★＝これが 0なら この道具は 嘘を つく */
  iu('⑤ 今日 作った 欄を 数えられる（被保険者整理番号）', ranKazu('hokenshaNo') >= 1);
  iu('⑥ 今日 作った 欄を 数えられる（従前の 改定月）', ranKazu('zenzenKaiteiYmd') >= 1);
  console.log(ng ? '\n★自己確認 ' + ng + '件 おかしい★' : '\n自己確認 OK');
  process.exit(ng ? 1 : 0);
}

console.log('\n[mon-to-ran] ★門が 要るのに 画面に 欄が 無い 物★を 数える');
console.log('  数え方 … 門＝この紙の 写し（' + MON.length + '件・lib の 行番号つき）'
  + ' ／ 画面＝data-f と ★class（JS が 差し込む 物）★の 2通り');
console.log('  ★「在る」＝字が 1個以上★。★本当に 打てるかは 見ていません★（そこは 実ブラウザ）\n');

const nai = [];
let ima = '';
for (const [todoke, na, shirushi, moto, gyo] of MON) {
  if (todoke !== ima) { console.log('  ── ' + todoke + ' ──'); ima = todoke; }
  const n = ranKazu(shirushi);
  if (!n) nai.push({ todoke, na, shirushi, moto, gyo });
  console.log('     ' + (n ? '✓' : '★✗★') + ' ' + na
    + '　… 画面の 欄 ' + n + '個（印 ' + shirushi + '／門 lib:' + gyo + ' ' + moto + '）');
}

console.log('\n── 実測 ──');
console.log('  見た 必須 … ★' + MON.length + '件★');
console.log('  ★門が 要るのに 画面に 欄が 無い … ' + nai.length + '件★');
nai.forEach((x) => console.log('     ★' + x.todoke + '／' + x.na + '（印 ' + x.shirushi + '・lib:' + x.gyo + '）★'));
if (!nai.length) console.log('     ＝★この 一覧の 中では もう 無い★（★この一覧の 外は 数えていません★）');

T('★門が 要るのに 画面に 欄が 無い 物が 0件', () => {
  ok(!nai.length, nai.map((x) => x.todoke + '／' + x.na).join(' ／ '));
});

/* ★★写し直しの 合図★★
   門の 表は ★人が 写した★物なので、lib が 変われば ★黙って 古くなる★。
   ⇒ ★dasuKa* の 本数★が 変わったら 赤に する＝★写し直せ★の 合図。
   ★行番号まで 見ない★＝1行 動くたびに 赤に なると 誰も 読まなくなる。 */
T('★門（dasuKa*）の 本数が 写した時と 同じ（変わったら 写し直す 合図）', () => {
  const n = (LIB.match(/function dasuKa[A-Za-z]*\(/g) || []).length;
  ok(n === 6, '★lib の 門が ' + n + '本★（写した時は 6本）＝この紙の 表を 写し直してください');
});
/* ★★門の 本数だけでは 気づけない（2026-09-14 指示役1 が 見つけた 穴）★★
   ★今 在る 門の 中に 必須が 1つ 増えた時★＝
     dasuKa の 中に `if(!inp.xxx) return false` を 1行 足しても
     ★門の 本数は 6の まま★＝★赤に ならない★＝★この紙の 表が 黙って 古くなる★。
   ＝★今日 まさに 踏んだ 型★（紙が 古いのに 誰も 気づかない）。
   ⇒ ★弾く 行の 本数も 見る★。
   ★27 は「必須の 数」では ありません★＝早い戻りも 含む ★合図の 為の 数★。
   ★行番号は 見ない★＝1行 動くたびに 赤に なると 誰も 読まなくなる。 */
T('★弾く 行（return false）の 本数が 写した時と 同じ（増えたら 写し直す 合図）', () => {
  const n = (LIB.match(/return false/g) || []).length;
  ok(n === 27, '★lib の 弾く 行が ' + n + '本★（写した時は 27本）'
    + '＝門の 中で 必須が 増えた／減った かもしれません。この紙の 表を 読み直してください');
});

console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
