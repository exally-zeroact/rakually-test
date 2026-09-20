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
import { kojiKazoeru, kankyoKa, kankyoIu, toiawase } from './_souko-kazoeru.mjs';

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
  console.log(ng ? '★自己確認 ' + ng + '件 おかしい★' : '  ★6通り ぜんぶ 思った通り★');
  if (ng) { owaru(1); OWARI = true; }
}

console.log('\n[koji-mon] 孤児（親の 居ない 鍵・紙）を 数える');
const kazu = await kojiKazoeru();
if (!kazu.ok) {
  if (kankyoKa(kazu.naze)) { kankyoIu('孤児（鍵・紙）'); console.log('\n' + pass + ' passed, ' + fail + ' failed'); owaru(fail); }
  console.log('  ✗ ★倉庫を 数えられません★ … ' + kazu.naze + '（★鍵は 在るのに 読めない＝赤★）');
  owaru(1);
}
console.log('  ★物差し★ 試験の 倉庫／kyuyo／全行（席で 除かない）／鎖＝紙→鍵→人'
  + '／突き合わせ＝鍵紙は data->>\'id\'・明細は id');
console.log('  ★今の 数★ 人 ' + kazu.hito + '／鍵 ' + kazu.kagiZen + '（孤児 ' + kazu.kagiKoji + '）'
  + '／紙 ' + kazu.kamiZen + '（届かない ' + kazu.kamiTodokanai + '）'
  + '／明細 ' + kazu.meisaiZen + '（孤児 ' + kazu.meisaiKoji + '）');

/* ★★わざと＝孤児を 1本 足して 赤に なるか★★（★足した 物は 必ず 消す★） */
const WAZA_ID = 'eWAZAkojimon';
if (WAZA) {
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
  console.log('  ★この門が 見る 棚は 3つ★ … pay_meisai_pub ／ pay_meisai_docs ／ pay_payslips');
  console.log('  ★「掃除が 終わった＝全部 0」では ありません★ … 鍵 0／紙 0／★明細は ' + kazu.meisaiKoji
    + '★（消す 許しを 貰って いない＝お金の 記録）');
  console.log('  ★明細は 2つの 門が 別の 物差しで 見ます★ … maboroshi-ui＝★その回 増えたか★／この門＝★前から 在る 数★');
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  owaru(fail);
}
