/* _souko-ref.mjs — ★倉庫の 名前は ここ1枚だけが 持つ★（他は ここから 借りる）
 * =============================================================================
 * ★なぜ 要るか（2026-09-14 実測で 踏んだ）★
 *   倉庫の 名前は `scripts/check-warehouse-pointers.mjs` が 持っていた。
 *   そこから `import { PROD_REF, TEST_REF }` した 所、
 *   ★import しただけで あちらの 本体が 丸ごと 走った★（外へ 出る・自己診断も 起きる）＝
 *   ★私の 自己確認が あちらの 自己確認に すり替わり、私の 16本は 1本も 見られなかった★。
 *   ＝repo-env.mjs が 2026-08-26 に 書き残した 前科と 同じ型
 *     ([[feedback_global_tool_must_not_judge_itself_by_argv]])。
 *
 * ★だから ここは 定数だけ★
 *   ・★import しても 何も 起きない★（走る物を 1行も 置かない）
 *   ・★向き先の 字を 持つのは js/supa-config.js と この1枚だけ★
 *     （no-hardcoded-supa の 許可リストに 理由つきで 載せる）
 *
 * ★どちらが 何かは 名前で 決めない★（2026-09-13 実測・生きている 配信物 9本で 確かめた）
 *   PROD … ダイコメ本番 / 代行本番 / 飲み屋本番 / Exally / Rakunally本番 が 向いている
 *   TEST … 各アプリの テスト線が 向いている
 *   Supabase の 画面の 名前も 2026-09-14 に 実態へ 変えた
 *     PROD 本番（全アプリ） / TEST 試験（全アプリ）（旧 Exally / DB-test）
 */
export const PROD_REF = 'tnfwipbgfgjaymlszeid';
export const TEST_REF = 'khawdrnvssdenumbiwfg';
