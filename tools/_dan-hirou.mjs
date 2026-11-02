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
  /* ★「倉庫を 触る」は 名前で 外さない（2026-10-03）★＝名前の 字で 決めると 静的な 門（souko-mon・koji-mon）まで 飛ばす
     ＝手元 緑・CI 赤 の 元に なった（souko-mon が 手元で 飛ばされ CI だけで 回って 赤）。
     ★この 名簿は「重い段」を 速さの為に 外す物（安全では ない）★ので、倉庫の 試験は 外さず 網で 回す
       （手元は 鍵在りで 通る／鍵無しの 機械は 各試験が 自分で 抜ける＝kagi-terasu・rls-tanin・souko-kengen と 同じ）。
     本番の 倉庫を 読む 恐れの ある souko-kengen は、その 頭に「repoEnv が test 以外は 抜ける」を 置いた。 */
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

/* ★★段ごとの 秒を まとめる★★（2026-11-02・網を 組に 割る 前に 測る＝taiketsu 止4 の 1つ目）
   ★なぜ★ … 網は 段ごとの 秒を 控えて いなかった＝「どの 段が 重いか」「上限 180秒に 近い 段が 何本か」が 見立てだった
   ★出す 物★ … 合計秒・遅い 順の 上位・上限に 近い（120秒 以上）段の 数・CI の job ごとの 秒（割り方を 秒で 決める 元）
   ★守りは 変えない★ … 秒は 見るだけ（赤／緑の 判じに 使わない） */
export function byouMatome(list, ue = 15, chikai = 120) {
  const zen = list.reduce((s, x) => s + x.byou, 0);
  const jun = list.slice().sort((a, b) => b.byou - a.byou);
  const job = {};
  list.forEach((x) => { const k = x.job || '?'; job[k] = job[k] || { dan: 0, byou: 0 }; job[k].dan++; job[k].byou += x.byou; });
  return { zen, ue: jun.slice(0, ue), chikai: jun.filter((x) => x.byou >= chikai).length, job };
}
/* ★段の 番号 → CI の job の 名★（oshu-mae.mjs は 読むと 網が 走る＝関数は ここに 置く）（yml の 字を 上から 読む・拾い方は hirouDan と 同じ run: の 行） */
export function danNoJob(ymlJi) {
  const out = []; let cur = null;
  String(ymlJi || '').split(String.fromCharCode(10)).forEach((l) => {
    const m = l.match(/^  ([A-Za-z0-9_-]+):\s*$/);
    if (m) cur = m[1];
    if (/^\s*run:\s*(.+)$/.test(l)) out.push(cur);
  });
  return out;
}

/* ★★押す sha を 読む★★（2026-11-03・網の 4つ割り 押し2＝設計前 taiketsu 止1）
   ★入力★ … pre-push の 標準入力（1行＝`<local ref> <local sha> <remote ref> <remote sha>`）
   ★返す★ … { gyou: 行数, shas: 0で ない local sha（重なりを 除く）, kesu: 消す 押しの 数, naze: 止める 訳 か null }
   ★止める★ … 行が 0（＝押す 物が 分からない＝赤）／0で ない sha が 2つ 以上（＝1つの 作業木で 全部を 見られない・1押し1件）
   ★飛ばす★ … 消す 押しだけ（shas 0・kesu 1以上）＝回す 物が 無い */
export function oshuShaYomu(txt) {
  const ZERO = /^0+$/;
  const gyou = String(txt || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const shas = []; let kesu = 0, hen = 0;
  gyou.forEach((l) => {
    const p = l.split(/\s+/);
    if (p.length < 4 || !/^[0-9a-f]{40}$/.test(p[1])) { hen++; return; }
    if (ZERO.test(p[1])) { kesu++; return; }
    if (shas.indexOf(p[1]) < 0) shas.push(p[1]);
  });
  let naze = null;
  if (!gyou.length) naze = '押す 物の 名簿が 空（何を 押すか 分からない）';
  else if (hen) naze = '読めない 行が ' + hen + '行';
  else if (shas.length > 1) naze = '0で ない sha が ' + shas.length + 'つ（1押し1件＝1つずつ 押す）';
  return { gyou: gyou.length, shas, kesu, naze };
}

/* ★★前の 網が 残した 作業木の うち 消して よい 物★★（設計前 taiketsu 止3＝他の 席の 網を 消さない）
   ★名前★ … `om-<pid>-<始めた ms の 36進>`（この 形 以外は 触らない）
   ★消す★ … pid が 死んで いる 物 か、始めて から kigenMs（既定 6時間）を 過ぎた 物 だけ
   ★ikiteru(pid)★ … 呼ぶ 側が 渡す（試験で 差し替える） */
export function nokoriErabu(namae, nowMs, ikiteru, kigenMs = 6 * 3600 * 1000) {
  const out = [];
  namae.forEach((n) => {
    const m = String(n).match(/^om-(\d+)-([0-9a-z]+)$/);
    if (!m) return;
    const pid = Number(m[1]), t = parseInt(m[2], 36);
    if (!ikiteru(pid)) out.push({ n, naze: 'pid ' + pid + ' が 居ない' });
    else if (!(t > 0) || nowMs - t > kigenMs) out.push({ n, naze: '古い（' + ((nowMs - t) / 3600000).toFixed(1) + '時間）' });
  });
  return out;
}
