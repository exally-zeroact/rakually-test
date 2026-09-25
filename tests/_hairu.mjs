/* _hairu.mjs — ★試験が アプリに 入る（ログインする）所★ 1か所
 * =============================================================================
 * ★なぜ 1か所に したか（2026-09-05 実測）★
 *   ブラウザを 使う 見張り 3本（sumaho-haba／kami-shiro-kuro／oseru-ka）が
 *   ★同じ ログインの 手順を 3か所に 写して 持っていた★。
 *   そして ★同じ 穴を 3本とも 持っていた★＝★1回 入り損ねたら そこで おしまい★。
 *
 *   ★実測★ ci.yml を まるごと 4回 走らせたら、★毎回 ちがう 1本だけ 赤★になった。
 *     ・1回目 … kami-shiro-kuro が「🟡未測定 入れなかった」で 赤（exit 2）
 *     ・別の回 … sumaho-haba が 同じ所で 未測定（あちらは exit 0 なので 赤には ならない）
 *     ⇒ 中身は ★どちらも 同じ＝ログインが たまに 通らない★（倉庫への 通信の 気まぐれ）。
 *   ★決まり「たまに赤は まず 記録係を 置け」★に従って tools/clock-sweep.mjs に
 *   ★赤の 中身を その場で 控える★ 仕掛けを 足し、控え（.sweep-red/177.txt）で 正体を 見た。
 *
 * ★直し方★
 *   ★1回で 諦めない★＝入れなければ ★開き直して もう一度★（既定 3回まで）。
 *   ★それでも 入れなければ 未測定★（0件＝合格 とは 書かない）＝★緩めていない★。
 *   ★何回目で 入れたか★も 返す＝★黙って 3回 掛かっている★のを 隠さない。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* ★★試験の 鍵が 在る repo か★★（2026-09-05 本番へ 運ぶ 支度で 見つけた）
   ★本番の repo は 本番の 倉庫を 指す★＝★test@test.com は 本番には 居ません★
   ⇒ ログインの 要る 見張りは ★本番の CI では 動かせない★（実測＝3回とも 入れなかった）
   ★黙って 緑に しない★＝★「ここでは 測れない・テスト線で 測っている」と 字で 言ってから★ 抜ける。
   ★これを 入れないと どうなるか★＝本番の CI が ★毎回 赤★（＝人が 赤を 見なくなる）。
   ★戻す条件★＝本番の CI に 試験用の 鍵を 置いた日。 */
export async function kagiAru(root) {
  try {
    const { repoEnv } = await import('../scripts/repo-env.mjs');
    return repoEnv(root) === 'test';
  } catch (e) { return true; }        /* 読めない時は 走らせる（黙って 飛ばさない） */
}

/* pg … playwright の page ／ matsu … 入れた事の 目印（この物が 出たら 入れた）
   返り値 { haitta, matta, kai } … kai＝入れた 時の 回数（入れなければ 試した 回数） */
/* ★`opt`★ … 数を 渡すと 今までどおり 回数／物を 渡すと `{ kaiMax, kumo }`
   ★`kumo: false`★ ＝★クラウドの 覆いに 答えない★
     ＝★読み込み中の 状態を わざと 作る 試験★（`souko-machi`）は これを 使う。
       答えると `location.reload()` で ★作った 状態が 消える★＝その試験の 測りを 壊す。
   ★既定は 答える★（覆いが 残ると 下の ボタンに 本物の click が 届かない＝fuyo-ui が CI で 赤に なった） */
/* ★★倉庫が 静まるまで 待つ★★（2026-09-25）
   ★何を 見るか★ … ★`pay_companies` への 要求★（＝保存と 競合の 見張りが 通る 所）
   ★静まった★＝走って いる 要求が 0 かつ ★`shizuMs` の 間 新しい 要求が 出ない★
   ★返り★ … `{ shizuka, matta, yokyu, ue }`
     ・`shizuka` … 静まったか（false＝★上限に 当たった＝この先は 当てに ならない★）
     ・`matta`  … ★待った ms（実測）★（★黙って 待たない★）
     ・`yokyu`  … その間に 出た 要求の 数
   ★時間で 待たない★＝★要求が 止まった事★を 見る（[[feedback_matte_inai_machi]]） */
export async function shizumaru(pg, shizuMs = 1500, ueMs = 20000) {
  const t0 = Date.now();
  let hashiri = 0, yokyu = 0, saigo = Date.now();
  const mi = (r) => { if (String(r.url()).indexOf('/rest/v1/pay_companies') >= 0) { yokyu++; hashiri++; saigo = Date.now(); } };
  const owari = (r) => { if (String(r.url()).indexOf('/rest/v1/pay_companies') >= 0) { hashiri--; saigo = Date.now(); } };
  pg.on('request', mi); pg.on('requestfinished', owari); pg.on('requestfailed', owari);
  try {
    while (Date.now() - t0 < ueMs) {
      if (hashiri <= 0 && Date.now() - saigo >= shizuMs) {
        return { shizuka: true, matta: Date.now() - t0, yokyu, ue: ueMs };
      }
      await new Promise((r) => setTimeout(r, 120));
    }
    return { shizuka: false, matta: Date.now() - t0, yokyu, ue: ueMs };
  } finally {
    pg.off('request', mi); pg.off('requestfinished', owari); pg.off('requestfailed', owari);
  }
}

export async function hairu(pg, url, matsu, opt = 3) {
  const kaiMax = typeof opt === 'number' ? opt : (opt && opt.kaiMax) || 3;
  const kumoKotaeru = typeof opt === 'number' ? true : (opt && opt.kumo !== false);
  let matta = 0, naze = '', kumoNi = '';   /* kumoNi＝クラウドの 覆いに 答えた 字（空＝出なかった） */
  for (let kai = 1; kai <= kaiMax; kai++) {
    await pg.goto(url, { waitUntil: 'domcontentloaded' });
    for (let i = 0; i < 60; i++) { matta++; if (await pg.$('#loginEmail, .bn[data-scr]')) break; await new Promise((r) => setTimeout(r, 250)); }
    if (await pg.$('#loginEmail')) {
      /* ★打てるように なるまで 待つ★（2026-09-05 CIで 実測＝#loginEmail は 在るのに
         30秒 打てずに 落ちた。★覆いが 出そろう前★に 打とうとしていた）
         ★短く 切って 投げ捨てない★＝この 回を 失敗にして ★開き直して もう一度★（下の for が 回す）。 */
      try {
        await pg.waitForSelector('#loginEmail', { state: 'visible', timeout: 15000 });
        await pg.fill('#loginEmail', 'test@test.com', { timeout: 10000 });
        await pg.fill('#loginPass', 'test1234', { timeout: 10000 });
        await pg.click('#btnLogin', { timeout: 10000 });
      } catch (e) {
        await new Promise((r) => setTimeout(r, 800));
        continue;                                  /* ★この回は 失敗＝次の回で 開き直す★ */
      }
      /* ★入口の 覆いが 消えるのを 待つ★
         ★2026-09-05 CIで 実測＝ここが 本当の 穴だった★
           前は「matsu が 出るまで」待っていたが、matsu（タブ等）は ★ログインする前から 在る★。
           だから 待ち loop は ★1回目で 抜けて★、倉庫の 返事が 来る前に
           「まだ #loginEmail が 見えている＝入れなかった」と 決めていた。
           手元は 速いので 通り、★CIだけ 3回とも 落ちた★（＝待っていない 待ち）。 */
      for (let i = 0; i < 100; i++) {
        matta++;
        const nokoru2 = await pg.evaluate(() => { const e = document.getElementById('loginEmail'); return !!(e && e.offsetParent); });
        if (!nokoru2) break;
        await new Promise((r) => setTimeout(r, 250));
      }
      for (let i = 0; i < 40; i++) { matta++; if (await pg.$(matsu)) break; await new Promise((r) => setTimeout(r, 250)); }
      await pg.evaluate(() => {
        const y = Array.from(document.querySelectorAll('button'))
          .find((e) => e.offsetParent && /^(いいえ|キャンセル)$/.test(e.textContent.trim()));
        if (y) y.click();
      });
      await new Promise((r) => setTimeout(r, 600));
      /* ★★「クラウドの 最新を 読み込みますか？」の 覆いに 答える★★（2026-09-19 実測で 足した）
         ★何が 起きていたか★ … この 覆いは ★ログインの 少し 後に 出る★（倉庫の 返事待ち）。
           上の 1回だけの 打ち消しでは ★間に合わない 回が 在る★。
           覆いが 残ると ★下の ボタンに 本物の click が 届かない★
           ⇒ `fuyo-ui` が CI で ★「家族の 欄を 出す … 30.2秒 待って 1個 足りない」★で 赤
             （★同じ 段が 別の 回は 0.0秒★＝★遅さでは なく 覆いの 在る/無い の 2通り★）
           ⇒ `link-ji`／`csv-moji` でも 同じ形を 踏み、★elementFromPoint で `div.ui-modal-ov` と 名指しした★
         ★なぜ「OK（最新を 読み込む）」か★ … 覆いの 字は「クラウドに 保存済みデータが あります
           （★まだ 読み込めて いません★）」＝★キャンセルすると 空のまま★＝試験が 支度した 物が 出ない。
         ★お客さんの 道★ … ★本物の click★（JS で 押し替えない・消さない）。
         ★この 覆いだけ★を 見る（他の 覆いは 上の 打ち消しに 任せる＝広げない）。 */
      if (kumoKotaeru) kumoNi = await kumoNiKotaeru(pg, matsu);
    }
    const nokoru = await pg.evaluate(() => { const e = document.getElementById('loginEmail'); return !!(e && e.offsetParent); });
    if (!nokoru) {
      /* ★★入った 直後に ★倉庫が 静まるまで 待つ★★★（2026-09-25・指示役1 の 裁定 ㋐-1）
         ★何が 起きて いたか（09-25 実測）★
           CI の WebKit で `fuyo-ui` が 赤。訳＝★conflict の 覆いが 27回★
           （`intercepts pointer` 0／`Timeout 8000ms` 0＝★もう 無言では 死なない★）
           ★直前の 段★ … `souko-machi`（06:25:34→★06:26:28★）／`fuyo-ui` は ★06:26:28★ から
           ＝★段の 終わりと 次の 段の 始まりが 同じ 秒★
           ★`app.js:6393`＝どこを 押しても 自動保存が 予約される★ので、
           ★前の 段の 最後の 保存が 段を 跨いで 倉庫に 着く★
           ⇒ ★こちらが 読んだ 後に `pay_companies.updated_at` が 動く＝次の 保存が conflict★
         ★なぜ ここ 1か所か★ … ★ログインして 押す 紙は 13本★（09-25 機械で 数えた）
           ＝★1本ずつ 直すと 12本 直し忘れる★／★入る所は 前から 1か所★
         ★隠して いません★ … ★静まってから 読む★だけ＝この後に 覆いが 出れば ★門が 止めます★
         ★待った ms は 必ず 出す★（★黙って 待たない★＝上限に 当たったかも 出す） */
      /* ★★入る 所では 待ちません★★（2026-09-25・★1回 入れて 外しました★）
         ★入れた 訳★ … 「前の 段の 保存が 後から 着く」を 疑った
         ★外した 訳★ … ⑴その 見立ては ★折れた★（1つの job の 段は ★順番に 走る＝重なれない★／
             閉じる前の 待ちは ★22回とも 要求 0回★）
           ⑵★値打ちが 無いのに 高い★＝押す前の 網で `tests/oseru-ka.mjs` が
             ★1.5秒 × ログインの 数★ で 伸び、★上限 180秒に 当たって 走らせられない★に なった
             （外して 実測 ★152秒★＝★元から 際どい 段★）
         ⇒ ★待つのは「自分が 出した 保存」＝★閉じる 時★だけ★（`scripts/_borrow-playwright.mjs`）
         ⇒ ★`shizumaru` は 出し口に 残す★＝★要る 紙が 名指しで 呼ぶ★（`fuyo-ui` の 開き直しなど） */
      return { haitta: true, matta, kai, kumoNi };
    }
    /* ★入れなかった 時は 画面の 言い分を 控える★（推し量らない＝会社の 決まり）
       CIで「3回とも 入れなかった」と だけ 出て、★理由が 分からず 手が 止まった★（2026-09-05） */
    naze = await pg.evaluate(() => {
      const e = document.getElementById('loginErr');
      const t = e ? String(e.textContent || '').trim() : '';
      return t || '（画面は 何も 言っていない）';
    });
    /* ★入れなかった＝少し 待って 開き直す★（倉庫の 通信の 気まぐれ） */
    await new Promise((r) => setTimeout(r, 1200 * kai));
  }
  return { haitta: false, matta, kai: kaiMax, naze: naze };
}


/* ★★「クラウドの 最新を 読み込みますか？」の 覆いに 答える★★（2026-09-19）
   ★1か所に した★＝ログインの 所と ★片づけの 開き直し★の 両方が 同じ 字を 使う
   （[[feedback_mihon_no_michi_ga_futatsu_aru_toki_katahou_dake_naosu_na]]）。
   ★なぜ「OK（最新を 読み込む）」か★ … 覆いの 字は「クラウドに 保存済みデータが あります
     （★まだ 読み込めて いません★）」＝★キャンセルすると 手元の 控えのまま★。
   ★返り値★ … 押した 札の 字（空＝覆いは 出なかった）＝★黙らない★ */
export async function kumoNiKotaeru(pg, matsu, kaiMax = 24) {
  for (let i = 0; i < kaiMax; i++) {
    const kumo = await pg.evaluate(() => {
      const ov = document.querySelector('.ui-modal-ov');
      if (!ov) return false;
      const t = String(ov.textContent || '');
      return t.indexOf('クラウド') >= 0 || t.indexOf('最新を読み込み') >= 0;
    }).catch(() => false);
    if (kumo) {
      const bs = await pg.$$('.ui-modal-btn').catch(() => []);
      for (const btn of bs) {
        const ji = (await btn.textContent().catch(() => '')) || '';
        if (ji.indexOf('OK') >= 0 || ji.indexOf('はい') >= 0) {
          if (await btn.click({ timeout: 4000 }).then(() => true).catch(() => false)) {
            await new Promise((r) => setTimeout(r, 2500));   /* ★OK は 画面を 開き直す★ */
            if (matsu) for (let j = 0; j < 40; j++) { if (await pg.$(matsu)) break; await new Promise((r) => setTimeout(r, 250)); }
            return ji.trim().slice(0, 8);
          }
        }
      }
      return '';
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return '';
}

/* ★★覆いの class は ★アプリの 字から 取る★★（2026-09-24）
   ★手で 打つと 飾りを 直した 日に 黙って 割れる★＝[[feedback_kazari_no_ji_ni_tayotta_mon_wa_wareru]]
   ★取れなかった 時は 黙って 手打ちに 落ちない★＝`OOI_MOTO` に そう 書いて 出しに 出す。 */
function ooiClassSagasu() {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(here, '..', 'kyuyo', 'js', 'app.js'), 'utf8');
    const m = src.match(/className\s*=\s*'(ui-[a-zA-Z0-9_-]*ov)'/);
    if (m) return { sel: '.' + m[1], moto: 'kyuyo/js/app.js から 取った' };
  } catch (e) { /* 読めない＝下で 言う */ }
  return { sel: null, moto: '★kyuyo/js/app.js から 取れませんでした＝この 門は 当てに なりません（未測定）★' };
}
const _ooi = ooiClassSagasu();
export const OOI = _ooi.sel || '.ui-modal-ov';
export const OOI_MOTO = _ooi.moto;

/* ★★閉じては いけない 覆い（＝conflict の 知らせ）★★（2026-09-24・指示役1 と 決めた）
   ★訳★ … 閉じる＝★答える★＝★conflict が 起きた 事が ログから 消える★
     （`app.js:6246` で `state._conflictPrompted = true` が 立ち ★二度と 訊かれない／保存は 通らない★）
   ⇒ ★★『答える』では なく『見つけて その場で 止める』★★ */
export const TOJINAI_JI = ['別の端末で更新', 'クラウドに保存済み'];

/* ★覆いの 字を 読むだけ★（★閉じない・押さない★）＝`{ aru, ji, conflict }` */
export async function ooiWoMiru(pg) {
  const r = await pg.evaluate((sel) => {
    const ov = document.querySelector(sel);
    if (!ov) return { aru: false, ji: '' };
    return { aru: true, ji: String(ov.innerText || ov.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200) };
  }, OOI).catch(() => ({ aru: false, ji: '★引けない★' }));
  return Object.assign({}, r, { conflict: !!r.aru && TOJINAI_JI.some((w) => r.ji.indexOf(w) >= 0) });
}

/* ★案内の 覆いを 本物の 閉じる ボタンで 閉じる★（消す のでは ない＝お客さんの 道）
   返り値＝★閉じ残り★（0 なら 覆いは 消えた）
   ★★2026-09-24 に 2つ 足した★★
     ⑴★conflict の 覆いは 閉じない★＝`TOJINAI_JI` に 当たったら ★そのまま 残して 戻る★
       （★今まで「キャンセル」「OK」の 型に 当たって ★黙って 閉じて いた★★）
     ⑵★★閉じた 時は「何を 閉じたか」を 1行 出す★★＝★黙って 閉じるのを やめる★
       （★今まで 何を 閉じたか 誰も 知らなかった★＝指示役1「これが 一番 効く」） */
export async function toziru(pg, kaiMax = 12) {
  for (let i = 0; i < kaiMax; i++) {
    if (!(await pg.$(OOI))) return 0;
    const mi = await ooiWoMiru(pg);
    if (mi.conflict) {
      console.log('  ★★覆いが 出て います（押せません）／★閉じません（答えません）★／箱の 字＝「'
        + mi.ji + '」★★');
      return (await pg.$$(OOI)).length;      /* ★残したまま 戻る★＝呼んだ側が 赤に する */
    }
    const oseta = await pg.evaluate((sel) => {
      const ov = document.querySelector(sel); if (!ov) return false;
      const b2 = Array.from(ov.querySelectorAll('button,.close,[data-close]'))
        .find((e) => e.offsetParent && /×|閉じる|あとで|いいえ|キャンセル|OK|はじめる|わかった/.test((e.textContent || '') + (e.getAttribute('aria-label') || '')));
      if (b2) { b2.click(); return true; } return false;
    }, OOI);
    if (!oseta) break;
    console.log('  （覆いを 1枚 閉じた … 「' + mi.ji.slice(0, 60) + '」）');
    await new Promise((r) => setTimeout(r, 400));
  }
  return (await pg.$$(OOI)).length;
}

/* ★覆いを 閉じてから 押す★（覆いは ★画面を 移るたびに 出る★＝2026-09-05 実測）
   1回 閉じて 押すだけでは 足りない＝閉じた 後に また 出る 事が ある。
   返り値 { oseta, kai, nokori } … oseta が false なら ★本当に 押せない★ */
export async function osu(pg, sel, kaiMax = 3) {
  let nokori = 0;
  for (let kai = 1; kai <= kaiMax; kai++) {
    nokori = await toziru(pg);
    /* ★★conflict の 覆いは 閉じない＝押しても 塞がれる★★
       ⇒ ★8秒×何回も 粘って 無言で 死ぬ★のを やめ ★その場で 訳つきで 返す★
       （2026-09-24 実測＝`page.click: Timeout 8000ms` が 15回・約2分・★訳は ログを 掘るまで 分からなかった★） */
    const mi = await ooiWoMiru(pg);
    if (mi.conflict) return { oseta: false, kai, nokori, ooi: true, ji: mi.ji };
    try { await pg.click(sel, { timeout: 5000 }); return { oseta: true, kai, nokori }; }
    catch (e) { await new Promise((r) => setTimeout(r, 500)); }
  }
  const ato = await ooiWoMiru(pg);
  return { oseta: false, kai: kaiMax, nokori, ooi: !!ato.conflict, ji: ato.conflict ? ato.ji : '' };
}
