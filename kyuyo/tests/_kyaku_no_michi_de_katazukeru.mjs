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
  /* ★★名前を 渡されて いない 時は ★札の 番号から 読む★★★（2026-09-18 実測で 踏んだ）
     ★訳★＝呼ぶ側（fuyo-ui:216）は `{ ban: IDX }` だけ 渡す
       （その試験は ★人を 足してから 後で 名前を 打つ★＝途中で 落ちた 時は まだ 名前が 無い／216行の 覚書）。
     ★踏んだ 穴★＝名前が 空の まま 字合わせを した ⇒ `''.indexOf('') === 0` ＝★真★
       ⇒ ★先頭の「確認済」の 人に 当たる★＝★別人の 確定を 外した★
       ⇒ 実測（総なめ #25）… ★確定した 明細 16→15（-1）★／明細の 行数は 変わらず＝★印だけ 外れた★
     ⇒ ★先に 札から 名前を 読む★／★読めなければ 誰にも 当てない★（上の `nm ? … : null`）。 */
  let na2 = na;
  if (!na2 && ban0 !== null && osu) {
    await osu(pg, '.bn[data-scr="scr-settings"]'); await machi(700);
    await osu(pg, '#set-seg .seg-b[data-set="emp"]'); await machi(900);
    na2 = await pg.evaluate((b) => {
      const c = document.querySelector('#emp-list .mco[data-i="' + b + '"]');
      if (!c) return '';
      const nm = c.querySelector('.mco-nm');
      return ((nm && nm.textContent) || '').trim();
    }, ban0).catch(() => '');
    michi.push('①札 ' + ban0 + '番目から 名前を 読んだ … 「' + (na2 || '★読めない★') + '」');
  }
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
    /* ★★★月まとめの 取り消しは 使わない＝★その人 1人だけ★を 外す★★★（2026-09-18 に 直した）
       ★何が 起きて いたか（実測）★
         `data-undo-month` は app.js:5502
           `state.employees.forEach(function(emp){ if(isActiveInMonth(emp,ym)) setConfirm(emp.id,false); });`
         ＝★その月の ★全員★を 下書きに 戻す★（★アプリとしては 正しい★＝人が 押す 物）。
         ⇒ santei-gekkaku-ui が 自分の 人を 片づける為に 4・5・6月を 取り消した 結果
            ★元から 在った 3人の 確定まで 消えた★＝実測 ★確定 4行 → 1行★。
         ⇒ ★★この 片づけが 他の 試験と 指示役1 の 報告を 汚した★★
            （「労働保険 0行／支払調書 0行」は ★この 後の 数★＝裏が 取れて いなかった）。
       ★正しい 道★＝`.econf`（その人の「確認済」の 印）を 外す＝app.js:5489
         `setConfirm(emc.id,false)` ＝★その人 1人だけ★。★お客さんが 実際に 触る 物★。
       ★月まとめは 逃げ道として だけ 残す★＝使ったら ★⚠で 出す★（黙って 広げない）。 */
    const shirabe = await pg.evaluate((nm) => {
      const zen = Array.from(document.querySelectorAll('input.econf'));
      const mieru = zen.filter((c) => c.offsetParent);
      const iri = mieru.filter((c) => c.checked);
      /* ★★「1人ぶんの 箱」は ★class の 名前で 当てない★★（2026-09-18 実測で 外した）
           入力の 画面の 札は `.mco` では なく、`.econf` の 親は `label.emp-conf`＝★中は「確認済」だけ★。
           ⇒ 名前が 出て こない ⇒ ★毎回 逃げ道（月まとめ）に 落ちて いた★。
         ⇒ ★上へ 辿って ★`.econf` を 1つだけ 含む 一番 大きい 箱★を 1人ぶんと する★
           （2つ 含んだら そこは ★何人ぶんも 入った 入れ物★＝行き過ぎ）。 */
      const hitoBako = (c) => {
        let e = c.parentElement, saigo = c.parentElement;
        for (let i = 0; i < 8 && e; i++) {
          if (e.querySelectorAll('input.econf').length > 1) break;
          saigo = e; e = e.parentElement;
        }
        return saigo;
      };
      /* ★★名前が 空なら 誰にも 当てない★★（2026-09-18 実測で 踏んだ）
           `''.indexOf('')` は ★0★＝`>= 0` が ★真★ ⇒ ★先頭の 確認済の 人に 当たる★
           ⇒ `fuyo-ui` は `{ ban: IDX }` だけ 渡す（名前 無し）⇒ ★別人の 確認済を 外して いた★
           ⇒ 実測 … 総なめ #25 で ★確定した 明細 16→15（-1）★（明細の 行数は 変わらず＝印だけ 外れた） */
      const box = nm ? iri.find((c) => {
        const oya = hitoBako(c);
        return oya && (oya.textContent || '').indexOf(nm) >= 0;
      }) : null;
      if (box) box.setAttribute('data-katazuke-conf', '1');
      const ateta = box ? (((hitoBako(box) || {}).textContent) || '').replace(/[ ]+/g, ' ').slice(0, 30) : '';
      /* ★見つからない 時に「何が 在ったか」を 出す★＝★分母を 出さない 緑（赤）は 嘘★ */
      return { atta: !!box, ateta: ateta, namaeNashi: !nm, zen: zen.length, mieru: mieru.length, iri: iri.length,
        na: iri.slice(0, 4).map((c) => {
          const oya = hitoBako(c);
          return ((oya && oya.textContent) || '').replace(/[ ]+/g, ' ').slice(0, 24);
        }) };
    }, na2).catch(() => ({ atta: false, zen: -1, mieru: -1, iri: -1, na: [] }));
    const hitori = shirabe.atta;
    if (hitori) {
      await pg.click('[data-katazuke-conf]', { timeout: 8000 }).catch(() => null);
      await machi(700);
      const y1 = await osuByJi(pg, /^(OK|はい)$/, machi);
      await pg.evaluate(() => {
        const x = document.querySelector('[data-katazuke-conf]');
        if (x) x.removeAttribute('data-katazuke-conf');
      }).catch(() => null);
      michi.push('①' + (ym || '今の月') + ' … ★この人 1人の「確認済」を 外した★【本物の click】'
        + '（★外した 人＝「' + shirabe.ateta + '」／探した 名前＝「' + (na2 || '★空★') + '」★）'
        + (y1.osita ? '（' + y1.ji + '）' : '（確認は 出なかった）'));
      await machi(1200);
      continue;
    }
    const undo = await pg.$('[data-undo-month]');
    if (!undo) { michi.push('①' + (ym || '今の月') + ' … 確定は 無い（取り消す ボタンも 「確認済」の 印も 無い）'); continue; }
    michi.push('①' + (ym || '今の月') + ' … ⚠★この人の「確認済」を 見つけられず 月まとめで 取り消す★'
      + '＝★同じ月の 他の 人の 確定も 一緒に 外れます★'
      + (shirabe.namaeNashi ? '★呼ぶ側が 名前を 渡して いない★／' : '')
      + '（econf 全 ' + shirabe.zen + '／見える ' + shirabe.mieru + '／印つき ' + shirabe.iri
      + '／探した 名前「' + na + '」／印つきの 行 … ' + (shirabe.na || []).join(' | ') + '）');
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
