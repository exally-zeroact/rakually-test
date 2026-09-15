/* emp-kesu-meisai.test.mjs — ★人を 消したら その人の 給与明細も 倉庫から 消す★
 * ============================================================================
 * ★なぜ（2026-09-15・司さん「★いらん従業員なら 消せや 倉庫に 残すな★」）★
 *   「この従業員を削除」は ★state.employees から 抜くだけ★だった。
 *   同期が pay_employees の 行は 消すが ★pay_payslips を 消す 所が 1か所も 無かった★。
 *   ⇒ ★人は 消える／明細は 倉庫に 残る＝孤児★。
 *   実測（客の道で 1人 消した）… ★孤児 3,716 → 3,717＝+1★
 *   本番の 明細 12行中 ★9行が 孤児★／試験の 倉庫 3,717行。
 *
 * ★もう1つ 出た（同じ日）★＝★消す道が 2本 在った★
 *   ㋐「この従業員を削除」ボタン … 門 3つ＋Web明細リンク失効＋保存
 *   ㋑★カードを 左にスワイプ★   … ★門は「最低1名」だけ★
 *     ⇒ ★確定した 明細が 在る人も 消せた★（賃金台帳＝労基法108条／2026-08-09 の 決め）
 *     ⇒ ★Web明細の リンクを 失効させない★（お金の 紙が 見られる まま 残る）
 *     ⇒ ★保存も 呼ばない★（画面から 消えても 倉庫に 残り得る）
 *   ⇒ ★入口を 1つ（empKesu）に まとめた★＝★片方だけ 直すと もう片方から 同じ事が 起きる★
 *
 * ★ここで見る事★
 *   ① ★人を 名簿から 抜く 所が 1か所だけ★（＝2本とも 同じ 門を 通る）
 *   ② その 1か所が ★確定した 明細が 在る人を 止める★
 *   ③ その 1か所が ★Web明細の リンクを 失効させる★
 *   ④ その 1か所が ★その人の 給与明細を 倉庫からも 消す★
 *   ⑤ ★ボタンも スワイプも その 1か所を 呼ぶ★（★2本とも 縛る★）
 *   ⑥ ★消せなかった 時に「消しました」と 言わない★（倉庫の 返事で 字を 変える）
 *   ⑦ 倉庫側に ★その人の 明細を 消す 道★が 在る（Store.deletePayslipsOf）
 *   ⑧ ★従業員に 見える 紙（pay_meisai_docs）は 物理削除しない★＝既に 在る 決めを 壊していない
 *
 * ★字だけで 測ります★（倉庫は 要らない＝CIで 毎回 走る）。
 *   ★実物で 数えるのは webkit の 実ブラウザ側★（倉庫の 行数で 見る）。
 *
 * 使い方: node kyuyo/tests/emp-kesu-meisai.test.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELF = process.argv.includes('--self-test');

let pass = 0, fail = 0;
const T = (n, f) => { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m); };

/* ★注記を 外してから 数える★（「消す」と 書いてある 覚書が 一番 引っかかる＝今日 2回 踏んだ） */
export function strip(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
const APP = strip(fs.readFileSync(path.join(ROOT, 'kyuyo/js/app.js'), 'utf8'));
const STORE = strip(fs.readFileSync(path.join(ROOT, 'kyuyo/js/store.js'), 'utf8'));

/* ★入口の 中身を 切り出す★＝名前では なく ★その塊の 字★を 見る */
export function kansuNoNaka(src, na) {
  const i = src.indexOf('function ' + na + '(');
  if (i < 0) return null;
  let d = 0, j = src.indexOf('{', i);
  if (j < 0) return null;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  return null;
}

console.log('\n[emp-kesu-meisai] 人を 消したら 明細も 消す／消す道は 1か所（2026-09-15 司さん「倉庫に 残すな」）');

const naka = kansuNoNaka(APP, 'empKesu');

T('★① 人を 名簿から 抜く 所は 1か所だけ（消す道が 2本 在った）', () => {
  const n = [...APP.matchAll(/employees\s*\.\s*splice\s*\(/g)].length;
  ok(n === 1, '★' + n + 'か所 在る★＝1か所に まとまっていない（片方だけ 直すと もう片方から 同じ事が 起きる）');
  ok(naka, '★入口の 塊（empKesu）が 見つからない★');
  ok(/employees\s*\.\s*splice\s*\(/.test(naka), '★抜く 所が 入口の 中に 無い★');
  console.log('     抜く 所 … 1か所（入口の 中）');
});

T('★② 確定した 明細が 在る人は 消させない（賃金台帳＝労基法108条）', () => {
  ok(naka, '入口が 無い');
  ok(/confirmedMonthsOf\s*\(/.test(naka), '★確定した 月を 見ていない★');
  ok(/\.length\s*\)\s*\{[^}]*uiAlert/.test(naka) || /if\s*\(\s*cmz\.length\s*\)/.test(naka),
    '★確定が 在っても 止めていない★');
});

T('★③ Web明細の リンクを 失効させる（お金の 紙を 見られる まま 残さない）', () => {
  ok(naka, '入口が 無い');
  ok(/unpublishMeisai\s*\(/.test(naka), '★リンクを 失効させていない★');
});

T('★④ その人の 給与明細を 倉庫からも 消す（司さんの 一言）', () => {
  ok(naka, '入口が 無い');
  ok(/deletePayslipsOf\s*\(/.test(naka), '★倉庫の 明細を 消していない★＝孤児が また 出ます');
});

T('★⑤ ボタンも スワイプも その 1か所を 呼ぶ（2本とも 縛る）', () => {
  const yobu = [...APP.matchAll(/empKesu\s*\(/g)].length;
  /* 中身の 1件（function empKesu(）は 上で 別に 数えている＝呼ぶ所は 2つ 以上 */
  ok(yobu >= 3, '★呼ぶ所が 足りない★＝' + yobu + '件（入口の 定義 1＋ボタン 1＋スワイプ 1）');
  const botan = /m-del-emp'\s*\)\s*\)\s*\{\s*empKesu\s*\(/.test(APP)
    || /classList\.contains\('m-del-emp'\)\)\{\s*empKesu\(/.test(APP);
  ok(botan, '★ボタンが 入口を 呼んでいない★');
  const swipe = /dx\s*<\s*-60[^}]*empKesu\s*\(/.test(APP);
  ok(swipe, '★スワイプが 入口を 呼んでいない★＝スワイプからは 明細が 残ります');
  console.log('     呼ぶ所 … ' + yobu + '件（定義＋ボタン＋スワイプ）');
});

T('★⑥ 消せなかった 時に「消しました」だけで 終わらせない', () => {
  ok(naka, '入口が 無い');
  /* ★★字そのものを 探さない（2026-09-15 この見張りが 自分で 赤に なった）★★
     前は「消せていません|残っています」と ★文言を そのまま★ 探して いた。
     ⇒ ★screen-words が 文言を 直させた（「倉庫」は 客の 画面に 出さない）★途端 赤に なった。
     ＝★守っていたのは『振る舞い』なのに『字』を 見ていた★。
     ⇒ ★守る物を 字に 直した★:
       ・★失敗した 事を 言う★（「消せません」系）
       ・★次に どうすれば よいか 言う★（「もう一度」）
       ・★受け皿（.catch）が 在る★
       ・★成功の 字と 失敗の 字が 別物★（toast が 2通り 以上） */
  ok(/消せ(ません|ていません)/.test(naka),
    '★消せなかった 事を 言っていない★＝「消しました」と 言って 消えていない を 作る');
  ok(/もう一度/.test(naka), '★次に どうすれば よいか 書いていない★');
  ok(/[.]catch[(]/.test(naka), '★失敗の 受け皿（.catch）が 無い★');
  const toasts = new Set([...naka.matchAll(/toast[(]([^;]*?)[)]\s*;/g)].map((m) => m[1].trim()));
  ok(toasts.size >= 2, '★出す 字が 1通りしか 無い★＝成功と 失敗で 同じ事を 言っている（' + toasts.size + '通り）');
  console.log('     出す 字 … ' + toasts.size + '通り（成功／失敗を 分けている）');
});

T('★⑦ 倉庫側に その人の 明細を 消す 道が 在る', () => {
  ok(/Store\.deletePayslipsOf\s*=/.test(STORE), '★Store.deletePayslipsOf が 無い★');
  const i = STORE.indexOf('Store.deletePayslipsOf');
  const naka2 = STORE.slice(i, i + 1200);
  ok(/pay_payslips/.test(naka2), '★pay_payslips を 触っていない★');
  ok(/employee_id/.test(naka2), '★その人だけに 絞っていない★＝他人の 明細まで 消えます');
  ok(/delete\s*\(/.test(naka2), '★消していない★');
});

T('★⑧ 従業員に 見える 紙（pay_meisai_docs）は 物理削除しない（既に 在る 決めを 壊さない）', () => {
  const i = STORE.indexOf('Store.deletePayslipsOf');
  const naka2 = STORE.slice(i, i + 1200);
  ok(!/pay_meisai_docs/.test(naka2), '★従業員に 見える 紙まで 消している★＝お金の 記録を 残す 決めを 壊した');
});

/* ★★自己確認＝わざと 壊して 赤が 出るか★★（★片方だけ 壊して 片方だけ 赤★まで 見る） */
if (SELF) {
  console.log('\n[emp-kesu-meisai] ★自己確認★（わざと 壊して 赤が 出るか）');
  let ng = 0;
  const iu = (n, good, m) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + n + (good ? '' : '  ★' + (m || '') + '★')); };
  /* ⑤の わざと壊し … スワイプだけ 昔の 形へ 戻す */
  const kowashita = APP.replace(/dx\s*<\s*-60[^;]*empKesu\s*\([^)]*\)\s*;/,
    'dx<-60){ state.employees.splice(0,1); }');
  const swipeAru = /dx\s*<\s*-60[^}]*empKesu\s*\(/.test(kowashita);
  iu('⑤ ★スワイプだけ 昔の 形に 戻すと 赤★', swipeAru === false, 'スワイプを 壊しても 見張りが 気づかない');

  /* ①の わざと壊し … 抜く 所を もう1つ 足す */
  const futatsu = APP + '\n state.employees.splice(0,1);\n';
  const n2 = [...futatsu.matchAll(/employees\s*\.\s*splice\s*\(/g)].length;
  iu('① ★抜く 所が 2か所に なったら 赤★', n2 !== 1, '2か所でも 1か所と 数えている');

  /* ④の わざと壊し … 倉庫の 明細を 消す 呼びを 外す */
  const hazushita = (naka || '').replace(/deletePayslipsOf/g, 'xxx');
  iu('④ ★倉庫の 明細を 消さなく したら 赤★', !/deletePayslipsOf\s*\(/.test(hazushita), '外しても 気づかない');

  /* ⑧の わざと壊し … 従業員に 見える 紙まで 消す */
  const yarisugi = 'Store.deletePayslipsOf = function(id){ sb.from("pay_meisai_docs").delete(); }';
  iu('⑧ ★従業員に 見える 紙まで 消したら 赤★', /pay_meisai_docs/.test(yarisugi), '行き過ぎに 気づかない');

  /* ⑥の わざと壊し … 失敗の 言い方を 消して 成功の 字だけに する */
  const kotoba = (naka || '').replace(/消せ(ません|ていません)/g, '消しました').replace(/もう一度/g, '');
  iu('⑥ ★失敗の 言い方を 消したら 赤★', !(/消せ(ません|ていません)/.test(kotoba) && /もう一度/.test(kotoba)), '消しても 気づかない');

  console.log(ng ? '\n★自己確認 ' + ng + '件 おかしい★' : '\n自己確認 OK（★赤が 出る事まで 見た★）');
  if (ng) process.exit(1);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
