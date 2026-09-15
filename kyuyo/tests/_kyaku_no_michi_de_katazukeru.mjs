/* _kyaku_no_michi_de_katazukeru.mjs — ★客の 道で 片づける★ 1か所
 * =============================================================================
 * ★なぜ 作ったか（2026-09-15）★
 *   ★片づけに 裏口を 作っていた★＝5本の 試験が ★倉庫から 直に 消して★ いた。
 *   ・JS で ボタンを 叩く（dispatchEvent）＝★客の 道では ない★
 *     ＝[[feedback_js_dispatched_event_is_not_the_customer_path]]
 *   ・倉庫から 直に 消す＝★アプリの 門を 迂回する★
 *
 * ★何が 起きたか（webkit の 総なめで 出た）★
 *   soshitsu-ui が ★確定を 付けた 人を 消そうとした★
 *   ⇒ アプリは ★2重に 止めている★（app.js 1477 ボタンを disabled ／ 5356 押した後も 見る）
 *   ⇒ ★JS投げで ボタンの 手前を すり抜け★＝★画面上だけ 消えた／倉庫には 残った★
 *   ⇒ ★⑤(画面)は 緑・⑥(倉庫)は 赤★＝★アプリは 正しく、私の 片づけが 嘘を ついた★
 *
 * ★★決まり＝客の 道で 作った 物は 客の 道で 片づく★★
 *   ★片づけに 裏口を 作るな★。
 *   ★客の 道で 片づかないなら、それ自体が 客の 困り事★＝★裏口を 作ると 見えなく なる★。
 *
 * ★片づけの 道（全部 本物の click）★
 *   ①確定が 在れば ★「この月の確定を取り消す」（data-undo-month）★ を 押す
 *     … app.js 2417 に 在る。2026-09-07 司さん「やって」で 足された ★逃げ道★。
 *     ＝★在るのに 使っていなかった★（今日 3回目）
 *   ②確定が 0に なる ⇒ ★削除ボタン（.m-del-emp）が 効く★
 *   ③★本物の click★ で 削除 → 確認の「OK / はい / 削除」も ★本物の click★
 *
 * ★使い方★
 *   import { katazukeru } from './_kyaku_no_michi_de_katazukeru.mjs';
 *   const r = await katazukeru(pg, { na: '試験123　太郎', machi });
 *   ⇒ { ok, michi:[…踏んだ 道…], naze }
 */

/* ★見えている ボタンを 字で 探して 本物の click★（JS投げは しない） */
async function osuByJi(pg, seiki, machi) {
  const btns = await pg.$$('button');
  for (const b of btns) {
    const t = await b.evaluate((e) => (e.offsetParent ? e.textContent.replace(/\s+/g, ' ').trim() : '')).catch(() => '');
    if (t && seiki.test(t)) {
      const dame = await b.evaluate((e) => !!e.disabled).catch(() => false);
      if (dame) return { osita: false, naze: '押せない（' + t.slice(0, 30) + '）' };
      await b.click({ timeout: 8000 }).catch(() => null);
      await machi(900);
      return { osita: true, ji: t.slice(0, 30) };
    }
  }
  return { osita: false, naze: '見えている ボタンに 見つからない' };
}

/* ★その 人の 札の 番号（data-i）を 返す★
   ★印(属性)を 付けて 覚えては いけない★＝app.js 1881 `host.innerHTML=html`
   ＝★1回 開くたび 一覧を 丸ごと 描き直す★＝付けた 印は 消える。★毎回 名前から 引き直す★ */
async function fudaBan(pg, na, ban) {
  /* ★名前が まだ 決まっていない 時は 札の 番号（data-i）で 引く★
     （fuyo-ui は ★人を 足してから 後で 名前を 打つ★＝片づけを 仕掛ける 時点では 名前が 無い）
     ★番号で 良い 訳★＝片づけの 間は ★開け閉めしか しない★＝人の 出入りが 無い＝番号は ずれない。 */
  if (na === '' && ban !== null && ban !== undefined) {
    const aru = await pg.evaluate((b) => !!document.querySelector('#emp-list .mco[data-i="' + b + '"]'), ban).catch(() => false);
    return aru ? String(ban) : null;
  }
  return pg.evaluate((n) => {
    const c = Array.from(document.querySelectorAll('#emp-list .mco'))
      .find((x) => ((x.querySelector('.mco-nm') || {}).textContent || '').indexOf(n) >= 0);
    return c ? c.getAttribute('data-i') : null;
  }, na).catch(() => null);
}

/* ★その 札の 中の 物を 引く★（描き直しの 後でも 効くよう 毎回 引き直す） */
async function hiku(pg, na, naka, ban0) {
  const ban = await fudaBan(pg, na, ban0);
  if (ban === null) return null;
  return pg.$('#emp-list .mco[data-i="' + ban + '"]' + (naka ? ' ' + naka : ''));
}

/* ★畳んだ 所を 開く★（★開いたかは「中の 物が 在るか」で 見る★）
   ・札そのもの … .mco-hd（app.js 1873）
   ・詳細設定   … .emp-dtgl（app.js 1485・★削除ボタンは その 中★）
   ★まず 本物の click★。開かなかったら ★JSで 投げて 開く★が、
   ★黙って 逃げない★＝michi に 「本物では 開かなかった」と ★残す★。
   （fuyo-ui.mjs 210行に 同じ 実測が 書いて 在った＝★.emp-dtgl は 本物の click で 掴めない★）
   ＝★開け閉めは 打ち込みの 道・★消す 所は 本物の click のまま★（そこが 門） */
async function hiraku(pg, na, oya, naka, machi, michi, ban0) {
  for (let i = 0; i < 2; i++) {
    if (await hiku(pg, na, naka, ban0)) return true;
    const h = await hiku(pg, na, oya, ban0);
    if (!h) return false;
    await h.click({ timeout: 4000 }).catch(() => null);
    await machi(900);
  }
  if (await hiku(pg, na, naka, ban0)) return true;
  /* ★本物では 開かなかった★＝そのまま 書き残して JSで 開ける */
  michi.push('⚠ ' + oya + ' は ★本物の click で 開かなかった★（JSで 開けた／別件）');
  const ban = await fudaBan(pg, na, ban0);
  if (ban === null) return false;
  await pg.evaluate((a) => {
    const c = document.querySelector('#emp-list .mco[data-i="' + a.ban + '"]');
    const el = c && c.querySelector(a.oya);
    if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, { ban, oya }).catch(() => null);
  await machi(1000);
  return !!(await hiku(pg, na, naka, ban0));
}

export async function katazukeru(pg, opt) {
  const na = String((opt && opt.na) || '');
  const ban0 = (opt && opt.ban !== undefined) ? opt.ban : null;
  const machi = (opt && opt.machi) || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const osu = (opt && opt.osu) || null;
  const michi = [];
  if (!na && ban0 === null) return { ok: false, michi, naze: '名前も 札の 番号も 無い' };

  /* ── ①確定が 在れば 先に 取り消す（入力の 画面） ─────────────
     ★`data-undo-month` は ★今 選んでいる 1か月だけ★を 下書きに 戻す★
       （app.js 5461〜 … `var ym=state.month;` ＝その月の 全員の 確認済を 外す）
     ⇒ ★何か月も 確定した 人は 月を 変えながら 何度も 押す★
       （santei-gekkaku-ui は 4・5・6月の 3か月を 確定する＝1回では 足りない）
     ★opt.tsuki に 月を 並べて 渡す★／渡さなければ 今の 月 1つだけ 見る。 */
  if (osu) { await osu(pg, '.bn[data-scr="scr-input"]'); await machi(900); }
  const tsuki = (opt && opt.tsuki && opt.tsuki.length) ? opt.tsuki : [null];
  for (const ym of tsuki) {
    if (ym) {
      /* ★★月を 選ぶ のは `.ym-one`（お客さんが 触る 箱）★★（2026-09-15 直した）
         前は `.scr-month` を 選ぼうとして ★毎回 打ち込みの 道に 落ちて いた★。
         訳＝kyuyo/index.html の `.scr-month` は ★input type="hidden" data-ym★＝★選ぶ 箱では ない★。
         ★js/ym-picker.js 59〜 enhance() が その ★手前★に `span.ym-pick > select.ym-one` を 差し込む★
         ＝★これが お客さんの 触る 箱★。
         ★santei-gekkaku-ui.mjs 272行に 私が 自分で そう 書いて あったのに 読んでいなかった★
         ＝[[feedback_jibun_no_oboegaki_wo_jibun_ga_yonde_inai]]。
         ★隠れている 箱は 選ばない★＝見えている 物だけ 印を 付ける。 */
      const aru = await pg.evaluate(() => {
        for (const inp of Array.from(document.querySelectorAll('.scr-month'))) {
          const w = inp.previousElementSibling;
          const sl = w && w.querySelector ? w.querySelector('.ym-one') : null;
          if (sl && sl.offsetParent) { sl.setAttribute('data-katazuke-ym', '1'); return true; }
        }
        return false;
      }).catch(() => false);
      let honmono = aru;
      if (aru) {
        await pg.selectOption('[data-katazuke-ym]', ym, { timeout: 4000 }).catch(() => { honmono = false; });
      }
      if (!honmono) {
        /* ★選べない 時だけ 隠れた 欄に 値を 入れる（打ち込みの 道）★＝★黙って 落ちない★ */
        const m = await pg.$('.scr-month');
        if (!m) { michi.push('①' + ym + ' … 月の 欄が 無い'); continue; }
        await pg.evaluate((v) => {
          const x = document.querySelector('.scr-month');
          if (x) { x.value = v; x.dispatchEvent(new Event('change', { bubbles: true })); }
        }, ym).catch(() => null);
      }
      await pg.evaluate(() => {
        const x = document.querySelector('[data-katazuke-ym]');
        if (x) x.removeAttribute('data-katazuke-ym');
      }).catch(() => null);
      await machi(1300);
      michi.push('①' + ym + ' に 合わせた'
        + (honmono ? '【本物の 選択＝.ym-one】' : '【値を 入れて change＝打ち込みの 道／.ym-one で 選べなかった】'));
    }
    const undo = await pg.$('[data-undo-month]');
    if (!undo) { michi.push('①' + (ym || '今の月') + ' … 確定は 無い（取り消す ボタンが 出ていない）'); continue; }
    michi.push('①' + (ym || '今の月') + ' … 確定を 取り消す ボタンが 在った');
    await undo.click({ timeout: 8000 }).catch(() => null);
    await machi(900);
    const y = await osuByJi(pg, /^(OK|はい|取り消す|確定を取り消す)$/, machi);
    michi.push(y.osita ? '①確認を 押した【本物の click】（' + y.ji + '）' : '①確認が 出なかった');
    await machi(1400);
  }

  /* ── ②③従業員マスタで 削除（本物の click） ─────────────── */
  if (osu) {
    await osu(pg, '.bn[data-scr="scr-settings"]'); await machi(700);
    await osu(pg, '#set-seg .seg-b[data-set="emp"]'); await machi(900);
  }
  const idx = await fudaBan(pg, na, ban0);
  if (idx === null) { michi.push('札が 無い（もう 消えている？）'); return { ok: true, michi, naze: '' }; }
  michi.push('②札 ' + idx + '番目'); 

  /* ★札が 畳んで 在る★（一覧は 名前の 行だけ・中身は 開くまで 作られない） */
  if (!(await hiraku(pg, na, '.mco-hd', '.mco-body', machi, michi, ban0))) {
    return { ok: false, michi, naze: '札が 開かない（.mco-body が 出ない）' };
  }
  michi.push('②札を 開いた' + (michi.some((x) => x.indexOf('.mco-hd') >= 0) ? '' : '【本物の click】'));

  /* ★削除ボタンは 詳細設定の 中★ */
  if (!(await hiraku(pg, na, '.emp-dtgl', '.m-del-emp', machi, michi, ban0))) {
    return { ok: false, michi, naze: '削除ボタンが 出ない（詳細設定を 開けない）' };
  }
  michi.push('③詳細設定を 開いた' + (michi.some((x) => x.indexOf('.emp-dtgl') >= 0) ? '' : '【本物の click】'));

  const del = await hiku(pg, na, '.m-del-emp', ban0);
  if (!del) return { ok: false, michi, naze: '削除ボタンが 出ない' };
  const dame = await del.evaluate((e) => !!e.disabled).catch(() => false);
  if (dame) {
    const ji = await del.evaluate((e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => '');
    /* ★アプリが 止めている＝それが 正しい★＝★裏口で 抜けない★ */
    return { ok: false, michi, naze: '★アプリが 消させない★（' + ji.slice(0, 40) + '）' };
  }
  michi.push('④削除ボタンを 押した【本物の click】');
  await del.click({ timeout: 8000 }).catch(() => null);
  await machi(900);
  const y2 = await osuByJi(pg, /^(OK|はい|削除|削除する)$/, machi);
  michi.push(y2.osita ? '④削除の 確認を 押した【本物の click】（' + y2.ji + '）' : '④削除の 確認が 出なかった');
  await machi(1400);

  /* ★消えたかは 画面で 数える★（名前が 在れば 名前で／無ければ ★札の 総数が 1枚 減ったか★） */
  const nokori = na
    ? await pg.evaluate((n) => Array.from(document.querySelectorAll('#emp-list .mco'))
      .filter((x) => ((x.querySelector('.mco-nm') || {}).textContent || '').indexOf(n) >= 0).length, na).catch(() => -1)
    : (await pg.evaluate((b) => (document.querySelector('#emp-list .mco[data-i="' + b + '"]') ? 1 : 0), ban0).catch(() => -1));
  michi.push('⑤画面に 残り ' + nokori + '人');
  return { ok: nokori === 0, michi, naze: nokori === 0 ? '' : '画面に ' + nokori + '人 残っている' };
}
