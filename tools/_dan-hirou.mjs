/* _dan-hirou.mjs — ★yml から 段を 拾う★ と ★その段が 重いか★ を ★1か所★に 置く
 * ============================================================================
 * ★なぜ 在るか（2026-09-22 実測で 踏んだ）★
 *   ★私は 押す前に `tests/*.test.mjs` の 31本を 回して いました★
 *   ⇒ ★今日 4回 踏んだ うち ★3回は そこで 出た★／★1回（`scripts/silent-catch.mjs`）は 出なかった★
 *   ⇒ ★数えたら★ … ★ci.yml の node の 段 240★／★私が 回す 31★／★★差 209★★
 *   ⇒ ★★『名簿は 置き場から 作る』と 書いたのに、★その 置き場（括り）を 選んだのは 人★★★
 *     ＝★『人が 書く 所を 無くした』つもりで ★括りの 方に 人が 残って いた★★
 *
 * ★★だから ここで 決める 事★★
 *   ⑴ ★段は yml から 拾う★（★人が 並べない★）
 *   ⑵ ★重い／軽いは ★命令の 字★で 決める★（★人が 1本ずつ 選ばない★）
 *   ⑶ ★除いた 段は ★数と 訳★を 必ず 出す★（★走らせた ＋ 除いた ＝ 全★）
 *
 * ★★重いと 決める 字（★これを 変えたら 前の 数と 比べられません★）★★
 *   ・`borrow(` ／ `-ui.mjs` ／ `playwright` … ★実ブラウザを 借りる★
 *   ・`_souko-kazoeru` ／ `souko-` ／ `koji-mon` ／ `maboroshi` … ★倉庫を 触る★
 *   ・`clock-sweep` ／ `souname` … ★中で 他の 段を 回す（二重に 走る）★
 *   ・`npm ` ／ `npx ` … ★支度★
 *   ⇒ ★★それ以外を「速い」と 呼ぶ★★（★速さを 秒で 測って いません／★字で 決めて います★）
 *     ＝★秒で 決めると 機械の 速さで 揺れる★ので ★字に した★（訳）
 */

/* ★yml の `run:` を 全部 拾う★（clock-sweep と ★同じ 1行★＝2か所で 持たない） */
export function hirouDan(ymlJi) {
  return [...String(ymlJi || '').matchAll(/^\s*run:\s*(.+)$/gm)].map((m) => m[1].trim());
}

/* ★重い 段の 見分け（字で 決める）★＝当たった 訳も 返す（★黙って 除けない★） */
export const OMOI = [
  { re: /\bborrow\(|-ui\.mjs|playwright/i, wake: '実ブラウザを 借りる' },
  { re: /_souko-kazoeru|souko-|koji-mon|maboroshi|nomiya-db-url/i, wake: '倉庫を 触る' },
  { re: /clock-sweep|souname/i, wake: '中で 他の 段を 回す' },
  { re: /^npm\s|^npx\s/i, wake: '支度' },
];

export function omoiKa(cmd) {
  for (const o of OMOI) if (o.re.test(String(cmd || ''))) return o.wake;
  return null;
}

/* ★押す前に 回す 段を 選ぶ★＝★走らせる／除く を 両方 返す（差を 隠さない）★ */
export function erabu(ymlJi) {
  const zen = hirouDan(ymlJi);
  const hashiru = [], nozoku = [];
  zen.forEach((c, i) => {
    const w = omoiKa(c);
    if (w) nozoku.push({ i: i + 1, c, wake: w });
    else hashiru.push({ i: i + 1, c });
  });
  return { zen: zen.length, hashiru, nozoku };
}
