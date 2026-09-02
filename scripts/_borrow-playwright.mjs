/* _borrow-playwright.mjs — ★playwright の「借り方」と「借りられない時の言い方」を 1か所に★
 * =============================================================================
 * ★なぜ 1か所にするか（2026-09-02 に 実際に 起きた事）★
 *   借り先リストを ★7本が 別々に 持っていた★＝
 *     scripts/webkit-size.mjs      … 借り先 ★4か所★
 *     seikyu/tests/pask-color      … ★3か所★
 *     button-uniform／pdf-align／pdf-webkit／seal-pos／seal-shape … ★2か所★
 *   ⇒ ★同じ機械で webkit-size だけ 測れて 他は 未測定（緑）★ という
 *     「★測っていないのに 緑★」が 機械ごとに 出る（指示役 2026-09-02 実測）。
 *
 * ★もう1つ（もっと わるい方）★
 *   `import(playwright)` は try で 包んであったが ★`launch()` は 包まれていなかった★。
 *   ⇒ ★借りられるが ブラウザ本体が 無い★時は ★生の例外（スタックトレース）で 落ちる★＝
 *     何が起きたか 読めない。実測（指示役 2026-09-02）… webkit-size／pdf-webkit／
 *     seal-pos／seal-shape の ★4本とも 終わり値1・生の例外★。
 *
 * ★★指示役の裁定（2026-09-02）★★
 *   ① 道具が無い（モジュールも ブラウザ本体も）＝★「未測定」で 揃える★。
 *      ★生の例外で 落ちるのは 禁止★＝人の言葉で 言ってから 終わる。
 *   ② ★終わり値は 場所で 分ける★
 *        週1の専用ジョブ（.github/workflows/webkit.yml）＝★測る為に 用意した場所★
 *          ⇒ 道具が無いのは ★用意の失敗＝赤（1）★
 *        手元・毎回のCI ⇒ ★未測定・緑（0）★。★ただし 声は 必ず 出す★
 *      （08-28 の裁定「未測定と はっきり言う／可能なら 赤」の ★可能な場所＝週1の回★）
 *   ③ ★借り先リストは 4本とも 同じ★＝★ここ1か所に 書いて みんなが 読む★
 *
 * ★使い方★
 *   import { borrow, launch } from '<repoの相対パス>/scripts/_borrow-playwright.mjs';
 *   const webkit = await borrow('seal-pos', 'webkit');   // 借りられなければ ここで 終わる
 *   const b = await launch('seal-pos', webkit);          // 本体が無ければ ここで 終わる
 *
 * ★自分の効きを 確かめる★（★借り先を わざと 空にする★）
 *   BORROW_PW_LENDERS="C:/nothing/playwright/index.js" node <試験>   … ①モジュール無し
 *   PLAYWRIGHT_BROWSERS_PATH="<空のフォルダ>" node <試験>              … ②本体だけ 無い
 *   MEASURE_REQUIRED=1 を足すと ★週1の回★の扱い（赤）になる
 *
 * ★読むだけ・外へ出ない★（node の標準の物しか 使わない）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ★借り先★（この repo には 重い依存を 足さない＝借りる。★7本 共通★） */
export const LENDERS = (process.env.BORROW_PW_LENDERS
  ? process.env.BORROW_PW_LENDERS.split(';').filter(Boolean)
  : [
    /* ★この repo の物★（2026-08-28 案A＝devDependency に入れた） */
    path.join(ROOT, 'node_modules/playwright/index.js'),
    /* 手元に無い時だけ 借りる（司さんのPCで すぐ 回せるように） */
    'C:/Users/zeroa/Exally-test/node_modules/playwright/index.js',
    'C:/Users/zeroa/Daikou-app/node_modules/playwright/index.js',
    'C:/Users/zeroa/Daikou-app-test/node_modules/playwright/index.js',
  ]);

/* ★週1の専用ジョブか★＝.github/workflows/webkit.yml が 立てる目印。
   ★ここでの「道具が無い」は 用意の失敗＝赤★（裁定②） */
export const REQUIRED = process.env.MEASURE_REQUIRED === '1';

/* ★未測定の 言い方を 1つに★（0件と 混ぜない・必ず 声を出す） */
export function unmeasured(tag, why, kind = 'webkit') {
  console.log('[' + tag + '] ★未測定★ … ' + why);
  console.log('  ★これは「問題なし」では ありません★（★0件と 未測定を 混ぜない★）。');
  console.log('  ★測るには★ npm install && npx playwright install ' + kind);
  console.log('  ★決めた1行★ この見張りは ★週1（月曜朝）と 見た目に関わる所を 触った時★ に');
  console.log('              .github/workflows/webkit.yml で ★本当に 測ります★。');
  if (REQUIRED) {
    console.log('  ★ここは その 週1の回です＝道具が 無いのは 用意の失敗＝★赤★（指示役の裁定 2026-09-02）');
    process.exit(1);
  }
  console.log('  ★手元・毎回のCI なので 緑で 終わります（声は 出しました）★');
  process.exit(0);
}

/* ★借りる★（借りられなければ ここで 終わる＝呼ぶ側は null を 気にしない） */
export async function borrow(tag, kind = 'webkit') {
  for (const pw of LENDERS) {
    if (!fs.existsSync(pw)) continue;
    try {
      const m = await import(pathToFileURL(pw).href);
      const t = m[kind] || (m.default && m.default[kind]) || null;
      if (t) return t;
    } catch (e) { /* 次の借り先を 見る */ }
  }
  unmeasured(tag, 'playwright(' + kind + ') を 借りられる場所が 見つかりません（見た所 '
    + LENDERS.length + 'か所）', kind);
  return null; /* ここには 来ない（上で 終わる） */
}

/* ★立ち上げる★（★本体が 無い時に 生の例外で 落とさない★＝裁定①） */
export async function launch(tag, type, opts, kind = 'webkit') {
  try {
    return await type.launch(opts);
  } catch (e) {
    const msg = String((e && e.message) || e).split('\n')[0];
    unmeasured(tag, 'ブラウザ本体が 入っていません（' + msg + '）', kind);
  }
  return null; /* ここには 来ない */
}
