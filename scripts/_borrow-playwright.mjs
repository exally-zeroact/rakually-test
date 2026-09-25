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

/* ★★閉じる 前に「自分が 出した 保存」が 着くのを 待つ★★（2026-09-25・指示役1 の 裁定 ㋐-1）
   ★何が 起きて いたか（09-25 実測）★
     CI の WebKit で `fuyo-ui` が 赤＝★conflict の 覆いが 27回★／「別の端末で更新」28回。
     ★直前の 段（`souko-machi`）の 終わりと `fuyo-ui` の 始まりが ★同じ 秒★★（06:26:28）。
     `app.js:6393`＝★どこを 押しても 自動保存が 予約される★ので
     ★前の 段の 最後の 保存が 段を 跨いで 倉庫に 着く★
     ⇒ 次の 段が 読んだ 後に `pay_companies.updated_at` が 動く＝★次の 保存が conflict★
   ★なぜ ここ 1か所か★ … ★ログインして 押す 紙は 13本★（09-25 機械で 数えた）
     ＝1本ずつ 直すと ★12本 直し忘れる★／★ブラウザを 借りる 所は 前から 1か所★
   ★自分の 尻を 自分で 拭く★＝★次の 段に 押し付けない★
   ★黙って 待たない★＝★待った ms・要求の 数・静まったかを 必ず 1行 出す★ */
async function shizukaNiTojiru(b, tag) {
  const t0 = Date.now();
  let yokyu = 0, hashiri = 0, saigo = Date.now(), mita = 0;
  try {
    for (const ctx of b.contexts()) {
      for (const pg of ctx.pages()) {
        mita++;
        const mi = (r) => { if (String(r.url()).indexOf('/rest/v1/') >= 0) { yokyu++; hashiri++; saigo = Date.now(); } };
        const ow = (r) => { if (String(r.url()).indexOf('/rest/v1/') >= 0) { hashiri--; saigo = Date.now(); } };
        pg.on('request', mi); pg.on('requestfinished', ow); pg.on('requestfailed', ow);
      }
    }
    if (!mita) {
      /* ★★面を 先に 閉じて いる 紙が 在る★★（2026-09-25 実測で 踏んだ）
         `souko-machi` は `pg.close()` を 済ませてから `b.close()` を 呼ぶ
         ⇒ ここに 来た 時は ★数える 面が 0枚★＝★待たずに 素通り★して いた
         ⇒ ★出しに 1行も 出ない★＝「待った つもり」に なる
         ⇒ ★面の `close()` も 包む★（下の `tsutsumu`）／ここでは ★素通りした事を 字で 残す★ */
      console.log('  （' + tag + '：閉じる前の 待ち … ★面が 0枚＝面の 側で 待ち済み／待つ物が 無い★）');
      return;
    }
    const SHIZU = 1200, UE = 15000;
    let shizuka = false;
    while (Date.now() - t0 < UE) {
      if (hashiri <= 0 && Date.now() - saigo >= SHIZU) { shizuka = true; break; }
      await new Promise((r) => setTimeout(r, 120));
    }
    console.log('  （' + tag + '：閉じる前に 倉庫が 静まるのを 待った … ' + (Date.now() - t0) + 'ms ／ 要求 '
      + yokyu + '回 ／ 面 ' + mita + '枚 ／ '
      + (shizuka ? '★静まりました★' : '★★上限 ' + UE + 'ms に 当たった＝静まって いません★★') + '）');
  } catch (e) { console.log('  （' + tag + '：静まりを 待てません … ' + String((e && e.message) || e).slice(0, 60) + '）'); }
}

/* ★立ち上げる★（★本体が 無い時に 生の例外で 落とさない★＝裁定①） */
export async function launch(tag, type, opts, kind = 'webkit') {
  try {
    const b = await type.launch(opts);
    /* ★`close()` を 包む★＝★呼ぶ側の 字を 1行も 変えずに 13本 全部に 効く★ */
    const moto = b.close.bind(b);
    b.close = async function (...a) {
      await shizukaNiTojiru(b, tag);
      return moto(...a);
    };
    /* ★★面（page）の `close()` も 包む★★（2026-09-25）
       ★訳★ … ブラウザを 閉じる 前に ★面を 先に 閉じる 紙★が 在る（`souko-machi`）
         ⇒ ブラウザ側の 待ちは ★数える 面が 0枚★で 素通り＝★待って いない★
       ⇒ ★面を 閉じる その時に 待つ★＝★自分の 保存を 置き去りに しない★ */
    const motoCtx = b.newContext.bind(b);
    b.newContext = async function (...a) {
      const ctx = await motoCtx(...a);
      const motoPg = ctx.newPage.bind(ctx);
      ctx.newPage = async function (...b2) {
        const pg = await motoPg(...b2);
        let yokyu = 0, hashiri = 0, saigo = Date.now();
        pg.on('request', (r) => { if (String(r.url()).indexOf('/rest/v1/') >= 0) { yokyu++; hashiri++; saigo = Date.now(); } });
        const ow = (r) => { if (String(r.url()).indexOf('/rest/v1/') >= 0) { hashiri--; saigo = Date.now(); } };
        pg.on('requestfinished', ow); pg.on('requestfailed', ow);
        const motoClose = pg.close.bind(pg);
        pg.close = async function (...c) {
          const t0 = Date.now(); const SHIZU = 1200, UE = 15000; let shizuka = false;
          while (Date.now() - t0 < UE) {
            if (hashiri <= 0 && Date.now() - saigo >= SHIZU) { shizuka = true; break; }
            await new Promise((r) => setTimeout(r, 120));
          }
          console.log('  （' + tag + '：面を 閉じる前に 静まるのを 待った … ' + (Date.now() - t0) + 'ms ／ 要求 '
            + yokyu + '回 ／ ' + (shizuka ? '★静まりました★' : '★★上限に 当たった＝静まって いません★★') + '）');
          return motoClose(...c);
        };
        return pg;
      };
      return ctx;
    };
    return b;
  } catch (e) {
    const msg = String((e && e.message) || e).split('\n')[0];
    unmeasured(tag, 'ブラウザ本体が 入っていません（' + msg + '）', kind);
  }
  return null; /* ここには 来ない */
}
