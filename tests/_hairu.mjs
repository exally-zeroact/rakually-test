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
export async function hairu(pg, url, matsu, kaiMax = 3) {
  let matta = 0, naze = '';
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
    }
    const nokoru = await pg.evaluate(() => { const e = document.getElementById('loginEmail'); return !!(e && e.offsetParent); });
    if (!nokoru) return { haitta: true, matta, kai };
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

/* ★案内の 覆いを 本物の 閉じる ボタンで 閉じる★（消す のでは ない＝お客さんの 道）
   返り値＝★閉じ残り★（0 なら 覆いは 消えた） */
export async function toziru(pg, kaiMax = 12) {
  for (let i = 0; i < kaiMax; i++) {
    if (!(await pg.$('.ui-modal-ov'))) return 0;
    const oseta = await pg.evaluate(() => {
      const ov = document.querySelector('.ui-modal-ov'); if (!ov) return false;
      const b2 = Array.from(ov.querySelectorAll('button,.close,[data-close]'))
        .find((e) => e.offsetParent && /×|閉じる|あとで|いいえ|キャンセル|OK|はじめる|わかった/.test((e.textContent || '') + (e.getAttribute('aria-label') || '')));
      if (b2) { b2.click(); return true; } return false;
    });
    if (!oseta) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  return (await pg.$$('.ui-modal-ov')).length;
}

/* ★覆いを 閉じてから 押す★（覆いは ★画面を 移るたびに 出る★＝2026-09-05 実測）
   1回 閉じて 押すだけでは 足りない＝閉じた 後に また 出る 事が ある。
   返り値 { oseta, kai, nokori } … oseta が false なら ★本当に 押せない★ */
export async function osu(pg, sel, kaiMax = 3) {
  let nokori = 0;
  for (let kai = 1; kai <= kaiMax; kai++) {
    nokori = await toziru(pg);
    try { await pg.click(sel, { timeout: 5000 }); return { oseta: true, kai, nokori }; }
    catch (e) { await new Promise((r) => setTimeout(r, 500)); }
  }
  return { oseta: false, kai: kaiMax, nokori };
}
