/* koji-mon.test.mjs — ★孤児（親の 居ない 鍵・紙）を 数えて ★増えたら 赤★★
 * ============================================================================
 * ★なぜ 在るか（2026-09-20 実測）★
 *   ★鍵 pay_meisai_pub 30本 中 ★25本★が 孤児★（人が 居ない）
 *   ★紙 pay_meisai_docs 29枚 中 ★18枚★が 鎖で 人まで 届かない★
 *   ⇒ ★2026-09-20 に 43行 消して ★0／0★に しました（下の 決め打ちの 所に 全文）★
 *   ⇒ ★★この 2つの 棚を 見て いる 門が 1本も 無かった★★
 *      （孤児を 見る 門は `maboroshi-ui.mjs` 1本／見る 棚は ★pay_payslips だけ★
 *        ／判定も ★その回の 差★だけ＝★前から 在る 物は 見ない★）
 *   ⇒ だから 25／18 は ★毎回 緑★の まま 積んで いた。
 *
 * ★★元は「毎回 積んでいる」では ありません（09-20 実測）★★
 *   ・鍵/紙を 作る 試験 3本（link-ji／meisai-ui／shutoku-ui）を 1本ずつ 走らせた ⇒ ★+0本★
 *   ・孤児が 出来た 日 … ★09-18 に 19本／09-19 に 6本／紙は 全部 09-19★／★09-20 は 0★
 *   ⇒ ★積んだのは 09-18〜09-19 の 作業★＝★止める 元は もう 在りません★
 *   ⇒ ★残って いるのは ★置き土産★ と ★門の 穴★★＝この 紙は ★後者★を 塞ぎます。
 *
 * ★★「0 に しろ」に しない★★
 *   ★過去の 分で 毎回 赤＝後ろの 段を 人質に 取る★（★揺れる 見張り★と 同じ 害）。
 *   ⇒ ★今の 実測を 上限に 置く★／★増えたら 赤・減るのは よい★
 *   ⇒ ★減ったら「決め打ちを 下げて ください」と 字で 言う★＝★上限が 化石に ならない★
 *
 * ★★物差し（変えたら 前の 数と 比べられません）★★
 *   数え方の 本体は ★`_souko-kazoeru.mjs` の `kojiKazoeru()` 1か所★（そちらに 全文）。
 *   ・どこ … 試験の 倉庫／スキーマ `kyuyo`／★全行★（席で 除かない＝孤児は 席が 無い）
 *   ・鎖 … ★紙 → 鍵 → 人★
 *   ・突き合わせ … 鍵/紙は `e.data->>'id'`／明細は `e.id`
 *   ★前に 出ていた「鍵20／紙3」は ★別の 物差し★＝比べられません★（09-20 に 決められませんと 出した）
 *
 * ★鍵が 無い 時★ … ★緑(0)で 通す／数は 出す／0件＝合格 と 書かない★（09-14 の 決め・kankyoIu）
 *
 * ★★棚（次に 出た 時に ★2回目★ として 数える 為）★★（2026-09-20）
 *   ⑴ ★倉庫が 500 を 返した 回★（この門の --waza で 消せなかった）と
 *      ★`santei-gekkaku-ui.mjs` の 出しが 途中で 切れた 回★（"passed" が 1行も 無い）が
 *      ★同じ 束（webkit 23〜43・2026-09-20）★で 起きた。
 *      ⇒ ★1回だけでは 何も 言えない★。★次に 出たら 2回目★として 数える。
 *      ⇒ 裏取り … ★倉庫の 読みは 揺れない★（書いた 直後 0ms で 新しい 値が 返る・5段で 実測）
 *   ⑵ ★`santei-gekkaku-ui.mjs` は 2回目の 束で 緑／単独でも 緑★
 *      ⇒ ★壊れて いるとは 言えない／無かった事にも しない★＝★1回 切れた事が 在る★
 *   ⑶ ★`maboroshi-ui.mjs` は 回によって 未測定 2件 ⇔ 0件★（同じ 日に 両方 出た）
 *      ⇒ ★字で 掴んだ「読み込み中は ボタンが 押せない」と 同じ 顔★
 *      ⇒ ★★揺れを 消す 方向に 直さない★★＝★消すと 客の 症状も 見えなく なる★
 *
 * 使い方:
 *   node kyuyo/tests/koji-mon.test.mjs --self-test   ★判定の 自己確認（倉庫 要らない）★
 *   node kyuyo/tests/koji-mon.test.mjs               ★実物を 数える★
 *   node kyuyo/tests/koji-mon.test.mjs --waza        ★わざと 孤児を 1本 足して 赤に なるか★
 */
import { kojiKazoeru, kankyoKa, kankyoIu, toiawase, aiteNoOkimiyage, sekiIu } from './_souko-kazoeru.mjs';

/* ★★決め打ち＝2026-09-20 の 実測★★（★増えたら 赤／減ったら ここを 下げる★） */
/* ★★2026-09-20 に 25／18 → ★0／0★ へ 下げました★★（★下げた 事を 数で 残す★）
   ★消した 物★ … 紙 ★18枚★ → 鍵 ★25本★（★子から 順★）＝合わせて ★43行★
   ★消してよいの 根拠★ … 司さんに 1押しで 伺って「消してよい」
   ★消す前に 数えた 安全★ … pw_hash 0／同意 0／端末 0（★ARRAY の 空★）／失敗 0
       ／紙は ★1枚も 開かれて いない★／名前は 全部 試験の 物
       ／ぶら下がる 物 … 年調 0・振込先 0・台帳 0
       ／★但し 初期コードが 在る 鍵 1本に 紙 3枚★（CI確定テスト　九一四・未開封）＝名指しで 出した
   ★控え★ … scratchpad/hikae-2026-09-20.json（紙18・鍵25・38,049バイト）
   ★前後★ … 鍵 30→5（孤児 25→0）／紙 29→11（届かない 18→0）／人 5→5／明細 27→27（孤児 13→13）
   ★今は 0★＝★1本でも 出たら 赤★（元は もう 在りません＝09-20 に 3本 走らせて +0 を 実測） */
export const KAGI_KOJI_JOUGEN = 0;         /* 鍵 pay_meisai_pub の 孤児（2026-09-20 実測） */
export const KAMI_TODOKANAI_JOUGEN = 0;    /* 紙 pay_meisai_docs で 鎖が 人まで 届かない 物（同上） */
/* ★★3つ目＝明細(pay_payslips) の 孤児★★（2026-09-20・指示役1 の ③）
   ★訳＝★3つの うち 2つだけ 見る 門は また 同じ事が 起きる★★
     ・孤児は 3種類 … ⑴鍵 ⑵紙 ⑶★明細★。⑴⑵は ここで 0 に した。
     ・⑶は `maboroshi-ui.mjs` が 見て いるが ★その回の 差だけ★（`ato.koji <= mae.koji`）
       ＝★前から 在る 13行は 何回 走らせても 緑★。
     ⇒ ★同じ 形で ここでも 数える★＝★増えたら 赤★（㋐を 採った）。
   ★なぜ 0 では なく 13 か★
     ・★消す 許しを 貰って いません★（鍵・紙の 43行だけ 伺って 消した＝1押し 1件）
     ・明細は ★お金の 記録★＝店の 決めでも「人を 消しても 明細は 残す」側（store.js）
     ⇒ ★今の 実測を 置く／減ったら「下げてください」と 字で 言う★
   ★二重に 見る 事に なるが わざと★ … maboroshi-ui＝★その回 増えたか★／ここ＝★前から 在る 数★
     ＝★見る 物が 違う★（同じ 棚だが 同じ 物差しでは ない）。 */
export const KOJI_MEISAI_JOUGEN = 13;      /* 明細 pay_payslips の 孤児（2026-09-20 実測） */

/* ★★4つ目＝★相手の席の 置き去り★★（2026-09-21 実測で 踏んだ）
   ★何が 起きたか★
     ・webkit の 掃き #25 `fuyo-ui` が ★赤★（21 passed 0 failed → 16 passed 5 failed）
     ・因 … ★CI が 片づけ切れずに 残した 人 `CI試験366999　太郎`（家族1人）★
       ⇒ 扶養の届出CSV に ★余分な 1行（異動の別 3）★が 入り、項番21 も ずれた
     ・★★なのに どの 門も 緑だった★★
       ⇒ `kazoeru()` は ★相手の席（CI）の 行を わざと 除く★（`aiteNoGyo`＝09-19 の 決め）
       ⇒ ★除くのは 正しい（相手が 走って いる 最中に 赤に しない）★
       ⇒ ★★しかし 除いた 物が 永久に 残っても 誰も 数えて いなかった★★
       ⇒ ★アプリ（お客さんの 紙）は 席で 除かない★＝★★門は 緑／紙は 壊れる★★
   ★物差し★ … 相手の席の 印で 始まる 名前の 人で、`updated_at` が ★AITE_OKIMIYAGE_FUN 分より 古い★物
     ＝★走って いる 最中の 回は 数えない★（除く 工夫の 値打ちを 残す）
   ★今は 0★ … 09-21 に 司さんの 許しで 8行（人1・明細3・公開1・紙3）を 消した後の 実測 */
export const AITE_OKIMIYAGE_JOUGEN = 0;
/* ★★60分の 訳★★（2026-09-21 実測――指示役1 の ★「60 は どこから 来ましたか」★）
   ★はじめは 訳が 無かった★ … 私が やさしそうな 数を 置いただけでした。
   ★何を 何で 数えたか★ … `gh run list --limit 200`（この repo の 全ワークフロー）
   ★どこを★ … 拾えた 回 200件（2026-09-12 〜 09-21）
   ★出た 数★ … ★一番 長い 12.8分★／真ん中 6.5分／★９割は 7.9分 以内★
     上位5 … 9.1, 9.1, 11.4, 11.6, 12.8（どれも WebKit の 回）
   ★なぜ 60 か★ … ★一番 長い 回の 約 4.7倍★。
     ・倍（26分）でも 足りますが、★待ち行列（queue）は この 数に 入って いません★ので 広く 取りました。
     ・★短く しすぎると ★走って いる 最中の 回を 置き去りと 呼ぶ＝嘘の 赤★
     ・★長く しすぎると ★本物の 置き去りを 60分 見逃す★（その間に 客の 紙が 壊れる）
   ★いつ 測り直すか★ … ★回が 30分を 超えるように なったら★（上の 字で 数え直して 書き換える） */
export const AITE_OKIMIYAGE_FUN = 60;

/* ★判じは 純粋な 関数（倉庫が 無くても わざと 壊せる）★ */
export function okiHandan(oki, jou) {
  if (!oki || oki.ok !== true) return { aka: true, ji: '★相手の席の 置き去りを 数えられません★ … ' + ((oki && oki.naze) || '訳不明') };
  if (oki.shirushiNashi) return { aka: false, mihakari: true,
    ji: '★相手の席の 印が 無い＝★ここでは 測って いません★（「0件＝合格」とは 書きません）' };
  if (oki.honsu > jou) return { aka: true,
    ji: '★相手の席の 置き去り ' + oki.honsu + '人★ … 決め打ち ' + jou
      + ' を ★' + (oki.honsu - jou) + ' 超えました★（' + oki.fun + '分より 古い）'
      + '：' + (oki.namae || []).join('、') };
  return { aka: false, ji: '相手の席の 置き去り ' + oki.honsu + '人（' + oki.fun + '分より 古い） … 決め打ちと 同じ' };
}

/* ★★判定は 純粋な 関数に する★★＝倉庫が 無くても 自己確認できる（★わざと 壊せる★） */
export function handan(kazu, jou) {
  const de = [];
  const mi = [
    { na: 'kagiKoji', zen: 'kagiZen', ji: '鍵の 孤児', jou: jou.kagi },
    { na: 'kamiTodokanai', zen: 'kamiZen', ji: '鎖で 人まで 届かない 紙', jou: jou.kami },
    { na: 'meisaiKoji', zen: 'meisaiZen', ji: '明細の 孤児', jou: jou.meisai },
  ];
  mi.forEach((m) => {
    const ima = kazu[m.na], zen = kazu[m.zen], ue = m.jou;
    if (ima > ue) de.push({ aka: true, ji: '★' + m.ji + ' ' + ima + '／' + zen + '★ … 決め打ち ' + ue
      + ' を ★' + (ima - ue) + ' 超えました＝増えて います★' });
    else if (ima < ue) de.push({ aka: false, sageru: true, ji: '★' + m.ji + ' ' + ima + '／' + zen + '★ … 決め打ち ' + ue
      + ' より ★' + (ue - ima) + ' 少ない＝★決め打ちを ' + ima + ' へ 下げて ください★（上限を 化石に しない）' });
    else de.push({ aka: false, ji: m.ji + ' ' + ima + '／' + zen + ' … 決め打ちと 同じ' });
  });
  return de;
}

/* ★★終わり方★★（2026-09-20 実測）
   ★`process.exit()` を 使うと ★exit=127★ で 落ちました★（倉庫へ 問う fetch の 後始末と ぶつかる）。
   ⇒ ★終わり値だけ 置いて 自然に 終わる★＝★門が 自分の 都合で 赤に ならない★
   ★「終わった(exit 0)」の 知らせを 信じるな★の 裏＝★門 自身の 終わり値も 測ってから 置く★ */
function owaru(n) { process.exitCode = n ? 1 : 0; }
let OWARI = false;   /* ★process.exit を やめた ので「ここで 止める」を 旗で 持つ★ */
/* ★倉庫が ★1回で 応えなかった★ 回数★＝★繰り返しで 隠さない為の 数★（2026-09-20） */
let ICHIDO_DE_NAI = 0;
const SELF = process.argv.includes('--self-test');
const WAZA = process.argv.includes('--waza');
const WAZA_OKI = process.argv.includes('--waza-oki');   /* ★相手の席の 置き去りを わざと 1人 作る★ */
let pass = 0, fail = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };

if (SELF) {
  console.log('\n[koji-mon] ★自己確認★（倉庫は 使いません＝判定だけ わざと 動かす）');
  let ng = 0;
  const iu = (n, good) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + n + (good ? '' : '  ★思っていたのと 違う★')); };
  const jou = { kagi: 25, kami: 18, meisai: 13 };
  const moto = { kagiZen: 30, kagiKoji: 25, kamiZen: 29, kamiTodokanai: 18, meisaiZen: 27, meisaiKoji: 13 };
  iu('★同じ 数なら 赤に しない★', handan(moto, jou).every((d) => !d.aka));
  iu('★鍵が 1本 増えたら 赤★', handan(Object.assign({}, moto, { kagiKoji: 26 }), jou).some((d) => d.aka));
  iu('★紙が 1枚 増えたら 赤★', handan(Object.assign({}, moto, { kamiTodokanai: 19 }), jou).some((d) => d.aka));
  iu('★減ったら 赤に せず「下げろ」と 言う★',
    handan(Object.assign({}, moto, { kagiKoji: 20 }), jou).some((d) => !d.aka && d.sageru));
  iu('★明細が 1行 増えたら 赤★', handan(Object.assign({}, moto, { meisaiKoji: 14 }), jou).some((d) => d.aka));
  iu('★0に なっても 赤に しない★',
    handan({ kagiZen: 5, kagiKoji: 0, kamiZen: 3, kamiTodokanai: 0, meisaiZen: 9, meisaiKoji: 0 }, jou).every((d) => !d.aka));
  /* ★★鍵が 無い 時の 道も 自己確認で 通す★★（2026-09-21・指示役1 の ②＝★元を 止める★）
     ★何が 起きたか★ … `else` が 抜けて ★①鍵が無い＝緑★ と ★②読めない＝赤★ が 混ざった
       ⇒ ★手元には 鍵が 在るので ★一生 見えない★★／★CI でしか 出ない★
     ⇒ ★★鍵が 無い 時の 枝を 手元で 走らせる★★＝★次は ここで 捕まえる★
     ★中身★ … `kankyoKa` が true の 時 ⑴緑で 通す ⑵未測定と 出す ⑶赤の 字を 1つも 出さない
              ⑷その後の 本体を 走らせない（undefined を 出さない）
     ★他の 門も 数えた★ … `kankyoKa` を 使う 紙は ★9本★／★8本は その場で `process.exit(0)`★
       ＝★混ざりようが 無い 形★／★混ぜたのは この 1本だけ★ */
  const kariNaze = '鍵の 紙が 読めない（C:/…/token.json）';
  iu('★鍵が 無い＝未測定の 道に 入る★', kankyoKa(kariNaze) === true);
  iu('★鍵は 在るのに 読めない＝未測定に しない★', kankyoKa('倉庫が 500 を 返した') === false);
  /* ★★4つ目（相手の席の 置き去り）の 判じ★★（2026-09-21） */
  iu('★置き去り 0 なら 赤に しない★',
    okiHandan({ ok: true, honsu: 0, namae: [], fun: 60 }, AITE_OKIMIYAGE_JOUGEN).aka === false);
  iu('★置き去りが 1人 出たら 赤★',
    okiHandan({ ok: true, honsu: 1, namae: ['CI試験366999　太郎'], fun: 60 }, AITE_OKIMIYAGE_JOUGEN).aka === true);
  iu('★赤の 字に ★名前★が 出る（誰を 消せば よいか 分かる）★',
    /CI試験366999/.test(okiHandan({ ok: true, honsu: 1, namae: ['CI試験366999　太郎'], fun: 60 }, AITE_OKIMIYAGE_JOUGEN).ji));
  iu('★数えられなければ ★赤★（黙って 緑に しない）★',
    okiHandan({ ok: false, naze: '倉庫が 500 を 返した' }, AITE_OKIMIYAGE_JOUGEN).aka === true);
  iu('★相手の席の 印が 無い ★未測定★＝赤に せず「合格」とも 書かない★',
    (function () { const d = okiHandan({ ok: true, honsu: 0, namae: [], fun: 60, shirushiNashi: true }, AITE_OKIMIYAGE_JOUGEN);
      return d.aka === false && d.mihakari === true && /測って いません/.test(d.ji); })());
  {
    /* ★出しを 横取りして「赤の 字を 出さない」を 数で 見る★ */
    const moto = console.log; const de = [];
    console.log = (...a) => de.push(a.join(' '));
    let owariKari = false, owaruKari = null;
    const kazuKari = { ok: false, naze: kariNaze };
    if (!kazuKari.ok) {
      if (kankyoKa(kazuKari.naze)) { kankyoIu('自己確認'); owaruKari = 0; }
      else { console.log('  ✗ ★倉庫を 数えられません★'); owaruKari = 1; }
      owariKari = true;
    }
    console.log = moto;
    const aka = de.filter((x) => x.indexOf('✗') >= 0).length;
    const mi = de.filter((x) => x.indexOf('未測定') >= 0).length;
    iu('★鍵が 無い 時 … 終わり値 0（緑で 通す）★', owaruKari === 0);
    iu('★鍵が 無い 時 … 「未測定」と 出す（' + mi + '行）★', mi > 0);
    iu('★鍵が 無い 時 … 赤の 字を 1つも 出さない（' + aka + '行）★', aka === 0);
    iu('★鍵が 無い 時 … その後の 本体を 走らせない（旗が 立つ）★', owariKari === true);
  }
  console.log(ng ? '★自己確認 ' + ng + '件 おかしい★' : '  ★' + (6 + 6) + '通り ぜんぶ 思った通り★');
  if (ng) { owaru(1); OWARI = true; }
}

console.log('\n[koji-mon] 孤児（親の 居ない 鍵・紙）を 数える');
const kazu = await kojiKazoeru();
/* ★★`else` が 抜けて いました★★（2026-09-21 実測＝★CI が 赤★／★手元は 緑★）
   ★何が 起きたか★ … CI には 試験の 鍵が 無い ⇒ `kojiKazoeru()` が 「鍵の 紙が 読めない」で 返る
     ⇒ `kankyoKa` は true（＝未測定で 緑に する 道）に 入るのに、
        ★その 下の「✗ 鍵は 在るのに 読めない＝赤」も ★続けて★ 走って いた★
     ⇒ ★★09-14 の 決め（①鍵が無い＝緑で通す ②鍵は在るのに読めない＝赤）が 混ざって いた★★
   ⇒ ★`else` を 足し、★その後の 本体も 走らせない★（旗を 立てる）★
   ＝★『手元は 緑・CI は 赤』の 教科書どおりの 形を 自分で 作って しまいました★ */
if (!kazu.ok) {
  if (kankyoKa(kazu.naze)) { kankyoIu('孤児（鍵・紙）'); console.log('\n' + pass + ' passed, ' + fail + ' failed'); owaru(fail); }
  else { console.log('  ✗ ★倉庫を 数えられません★ … ' + kazu.naze + '（★鍵は 在るのに 読めない＝赤★）'); owaru(1); }
  OWARI = true;
}
if (!OWARI) {
  console.log('  ★物差し★ 試験の 倉庫／kyuyo／全行（席で 除かない）／鎖＝紙→鍵→人'
    + '／突き合わせ＝鍵紙は data->>\'id\'・明細は id');
  console.log('  ★今の 数★ 人 ' + kazu.hito + '／鍵 ' + kazu.kagiZen + '（孤児 ' + kazu.kagiKoji + '）'
    + '／紙 ' + kazu.kamiZen + '（届かない ' + kazu.kamiTodokanai + '）'
    + '／明細 ' + kazu.meisaiZen + '（孤児 ' + kazu.meisaiKoji + '）');
}

/* ★★わざと（その二）＝★相手の席の 置き去り★を 1人 作って 赤に なるか★★
   ★なぜ 別の 旗か★ … `--waza` と 一緒に 壊すと ★どちらで 赤に なったか 分からない★
     （同じ型を 09-21 に jidou-gyou で 踏んだ＝`--waza-bun` と `--waza-taka` に 分けた）
   ★物差し★ … 相手の席の 印で 始まる 名前の 人を 1人 入れ、`updated_at` を ★十分 古く★ する
   ★必ず 消す★ … 消せなければ ★字を 出して 人が 消せるように する★ */
const WAZA_OKI_ID = 'eWAZAokimiyage';
if (WAZA_OKI && !OWARI) {
  const oya = await toiawase('select account_id from kyuyo.pay_employees limit 1');
  if (!oya.ok || !(oya.gyo || [])[0]) { console.log('  ✗ ★わざとの 支度が 出来ません★ … ' + (oya.naze || '人が 1人も 無い')); owaru(1); OWARI = true; }
  if (!OWARI) {
    const acc = String(oya.gyo[0].account_id).replace(/[^0-9a-fA-F-]/g, '');
    const mae = await aiteNoOkimiyage(AITE_OKIMIYAGE_FUN);
    const na = 'CI試験WAZA　太郎';   /* ★相手の席の 印（CI）で 始める★ */
    const ire = await toiawase("insert into kyuyo.pay_employees (id, account_id, sort, data, updated_at)"
      + " values ('" + WAZA_OKI_ID + "', '" + acc + "', 9999,"
      + " jsonb_build_object('id','" + WAZA_OKI_ID + "','name','" + na + "'),"
      + " now() - interval '999 minutes') returning id");
    if (!ire.ok) { console.log('  ✗ ★わざとの 1人を 入れられません★ … ' + ire.naze); owaru(1); }
    try {
      const ato = await aiteNoOkimiyage(AITE_OKIMIYAGE_FUN);
      const d = okiHandan(ato, AITE_OKIMIYAGE_JOUGEN);
      T('★わざと 置き去りを 1人 作ったら 赤に なる（'
        + (mae.ok ? mae.honsu : '?') + ' → ' + (ato.ok ? ato.honsu : '?') + '）',
        ato.ok && mae.ok && ato.honsu === mae.honsu + 1 && d.aka === true,
        '作ったのに 赤に なりません＝★この見張りは 空振りです★');
      T('★赤の 字に 名前が 出る（誰を 消せば よいか 分かる）',
        /WAZA/.test(String(d.ji)), d.ji);
      const { spawnSync } = await import('node:child_process');
      const ko = spawnSync(process.execPath, [new URL(import.meta.url).pathname.replace(/^\//, '')], { encoding: 'utf8' });
      T('★その時 この門は 終わり値 1 を 返す（赤を 機械に 渡す）',
        ko.status === 1, '終わり値 ' + ko.status + '（★赤に 見えても 素通りします★）');
    } finally {
      let kesu = null, kai = 0;
      for (kai = 1; kai <= 5; kai++) {
        kesu = await toiawase("delete from kyuyo.pay_employees where id = '" + WAZA_OKI_ID + "' returning id");
        if (kesu.ok) break;
        ICHIDO_DE_NAI++;
        console.log('       ★消せません（' + kai + '回目）★ … ' + kesu.naze + '（待って もう一度）');
        await new Promise((r) => setTimeout(r, 1500));
      }
      const modotta = await aiteNoOkimiyage(AITE_OKIMIYAGE_FUN);
      const ok = kesu.ok && (kesu.gyo || []).length === 1 && modotta.ok && modotta.honsu === (mae.ok ? mae.honsu : -1);
      if (!ok && !kesu.ok) {
        console.log('       ★★倉庫に わざとの 1人が 残って います★★ … kyuyo.pay_employees の id = ' + WAZA_OKI_ID);
        console.log("       ★手で 消して ください★ … delete from kyuyo.pay_employees where id = '" + WAZA_OKI_ID + "';");
      }
      T('★わざとの 1人を 消して 元に 戻った（' + kai + '回目で 通った）★', ok,
        '★戻って いません★');
    }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    owaru(fail);
    OWARI = true;
  }
}

/* ★★わざと＝孤児を 1本 足して 赤に なるか★★（★足した 物は 必ず 消す★） */
const WAZA_ID = 'eWAZAkojimon';
if (WAZA && !OWARI) {
  const oya = await toiawase("select account_id from kyuyo.pay_meisai_pub limit 1");
  if (!oya.ok || !(oya.gyo || [])[0]) { console.log('  ✗ ★わざとの 支度が 出来ません★ … ' + (oya.naze || '鍵が 1本も 無い')); owaru(1); }
  const acc = oya.gyo[0].account_id;
  const ire = await toiawase("insert into kyuyo.pay_meisai_pub (token, account_id, employee_id, init_code)"
    + " values (gen_random_uuid(), '" + String(acc).replace(/[^0-9a-fA-F-]/g, '') + "', '" + WAZA_ID + "', 'WAZA0000')"
    + ' returning token');
  if (!ire.ok) { console.log('  ✗ ★わざとの 1本を 足せません★ … ' + ire.naze); owaru(1); }
  try {
    const ato = await kojiKazoeru();
    const de = ato.ok ? handan(ato, { kagi: KAGI_KOJI_JOUGEN, kami: KAMI_TODOKANAI_JOUGEN }) : [];
    T('★わざと 孤児を 1本 足したら 赤に なる（' + kazu.kagiKoji + ' → ' + (ato.ok ? ato.kagiKoji : '?') + '）',
      ato.ok && ato.kagiKoji === kazu.kagiKoji + 1 && de.some((d) => d.aka),
      '足したのに 赤に なりません＝★この門は 空振りです★');
    /* ★★「赤に なる」と「赤を 返す」は 別★★（2026-09-20）
       ★判定が 赤でも 終わり値が 0 なら 機械は 素通りする★
       ＝★この門 自身を もう 1回 別の プロセスで 走らせて ★出た 終わり値★を 測る★ */
    const { spawnSync } = await import('node:child_process');
    const ko = spawnSync(process.execPath, [new URL(import.meta.url).pathname.replace(/^\//, '')],
      { encoding: 'utf8' });
    T('★その時 この門は 終わり値 1 を 返す（赤を 機械に 渡す）',
      ko.status === 1, '終わり値 ' + ko.status + '（★赤に 見えても 素通りします★）');
  } finally {
    /* ★★1回 失敗で 諦めない★★（2026-09-20 実測＝総なめ #34 で ★倉庫が 500★ を 返し
       ★わざとの 1本が 倉庫に 残った★＝★門 自身が 置き土産を 作った★）。
       ★次の 回に 消したら 1回目で 通った＝一時的な 500★。
       ⇒ ★何回 試したかを 出す★／★それでも 消えなければ ★鍵の 字★を 出して 人が 消せるように する★。 */
    /* ★★retry で 隠さない★★（2026-09-20・指示役1 の 注文）
       ★繰り返すだけだと「倉庫が たまに 500 を 返す」事が ★黙って 緑★に なります★
       ⇒ ★何回目で 通ったか★／★1回で 応えなかった 回数★を ★必ず 字に 出す★
       ⇒ ★次に santei が 途中で 切れた 時と ★数で 突き合わせられます★★ */
    let kesu = null, kai = 0;
    for (kai = 1; kai <= 5; kai++) {
      kesu = await toiawase("delete from kyuyo.pay_meisai_pub where employee_id = '" + WAZA_ID + "' returning token");
      if (kesu.ok) break;
      ICHIDO_DE_NAI++;
      console.log('       ★消せません（' + kai + '回目）★ … ' + kesu.naze + '（待って もう一度）');
      await new Promise((r) => setTimeout(r, 1500));
    }
    const modotta = await kojiKazoeru();
    const ok = kesu.ok && (kesu.gyo || []).length === 1 && modotta.ok && modotta.kagiKoji === kazu.kagiKoji;
    if (!ok && !kesu.ok) {
      console.log('       ★★倉庫に わざとの 1本が 残って います★★'
        + ' … kyuyo.pay_meisai_pub の employee_id = ' + WAZA_ID);
      console.log('       ★手で 消して ください★ … delete from kyuyo.pay_meisai_pub'
        + " where employee_id = '" + WAZA_ID + "';");
    }
    T('★わざとの 1本を 消して 元に 戻った（' + kai + '回目で 通った）★', ok,
      '★戻って いません★＝' + (kesu.ok ? '消した ' + (kesu.gyo || []).length + '本／今 '
        + (modotta.ok ? modotta.kagiKoji : '?') + '本' : kai + '回 試して ' + kesu.naze));
  }
  console.log('  ★倉庫が 1回で 応えなかった … ' + ICHIDO_DE_NAI + '回★'
    + (ICHIDO_DE_NAI ? '（★繰り返して 通したが 隠しません★／santei が 途中で 切れた 回と 突き合わせて ください）' : ''));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  owaru(fail);
  OWARI = true;   /* ★わざとで 終わり＝本体を 二重に 数えない★（09-20 実測で 二重に 出た） */
}

if (!OWARI) {
  handan(kazu, { kagi: KAGI_KOJI_JOUGEN, kami: KAMI_TODOKANAI_JOUGEN, meisai: KOJI_MEISAI_JOUGEN }).forEach((d) => {
    if (d.aka) T(d.ji, false);
    else { pass++; console.log('  ✓ ' + d.ji); }
  });
  T('★分母を 出して いる（0件だけで 緑に しない）', kazu.kagiZen > 0 && kazu.kamiZen > 0,
    '鍵 ' + kazu.kagiZen + '／紙 ' + kazu.kamiZen);
  /* ★★4つ目＝相手の席の 置き去り★★（2026-09-21＝`fuyo-ui` の 赤の 因） */
  {
    const oki = await aiteNoOkimiyage(AITE_OKIMIYAGE_FUN);
    const d = okiHandan(oki, AITE_OKIMIYAGE_JOUGEN);
    console.log('  ★' + sekiIu() + '★');
    if (d.aka) T(d.ji, false);
    else { pass++; console.log('  ✓ ' + d.ji); }
  }
  console.log('  ★この門が 見る 棚は 4つ★ … pay_meisai_pub ／ pay_meisai_docs ／ pay_payslips ／ ★pay_employees（相手の席の 置き去り）★');
  /* ★★数を 字に 焼き付けない★★（2026-09-20 実測で 踏んだ）
     ★前は「鍵 0／紙 0」と ★決め打ちの 字を そのまま★ 書いて いた★
     ⇒ ★鍵1・紙3 に 増えた 回でも「鍵 0／紙 0」と 出た★＝★判じは 赤なのに 出しは 嘘★
     ＝★今日 何度も 出た「飾りの 字に 頼った 門は 割れる」の ★自分の 出し 版★ */
  console.log('  ★「掃除が 終わった＝全部 0」では ありません★ … 鍵 ' + kazu.kagiKoji
    + '／紙 ' + kazu.kamiTodokanai + '／★明細は ' + kazu.meisaiKoji
    + '★（消す 許しを 貰って いない＝お金の 記録）');
  console.log('  ★明細は 2つの 門が 別の 物差しで 見ます★ … maboroshi-ui＝★その回 増えたか★／この門＝★前から 在る 数★');
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  owaru(fail);
}
