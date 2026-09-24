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
    /* ★★★この人の「確認済」が 見つからない時は ★何も 押さない★★★（2026-09-24）
       ★何が 起きたか（★実測・私は 同じ 日に 2回 壊しました★）★
         この 道は「⚠ 同じ月の 他の 人の 確定も 一緒に 外れます」と ★字で 断ってから★
         ★そのまま 月まとめの 取り消しを 押して いました★。
           1回目 17:3x … ★確定 12→9（−3）／紙 38→26（−12）★（★名前が 読めなかった★回）
           2回目 17:45 … ★確定 9→6（−3）／紙 26→14（−12）★
         ★★2回目が 大事★★ … ★名前は ちゃんと 読めて いました★（「手押908420　太郎」）。
           ★今 足したばかりの 人★なので ★その人の「確認済」が 無いのは 当たり前★。
           ⇒ ★★『名前が 読めない時だけ 止める』では 足りない★★＝
              ★この人の 確認済が 見つからない 時は いつでも 止める★
           （★1回目の 直しは ★狭すぎました★／★狭い 直しは 2回目で 割れる★）
       ★決まりは 既に この紙に 在った★ … 上の「★名前が 空なら 誰にも 当てない★」
         ＝★名前で 当てる 道にだけ★ 付いていて ★月まとめの 道には 付いて いなかった★。
       ⇒ ★★『⚠と 書いてから やる』は『やらない』では ない★★
       ⇒ ★押さずに `ok:false` で 返す★（★人は 消し残る★が それは ★数で 見える★。
          ★他人の 確定が 外れるのは 見えない★＝そちらの 方が 危ない）
       ★どうしても 月まとめが 要る 呼び手★は `opt.tsukiMatome: true` を 渡す
         ＝★他人の 確定も 外す事を 知って いる★という 印（★既定は 押さない★）。
       ★空振り止め★ … `opt.wazaNamaeNashi` で ★わざと 押さない 側に 倒し★
         ★「押しません」が 出しに 出るか★を 見る（★出ない＝門が 効いて いない★）。 */
    if (!(opt && opt.tsukiMatome === true) || (opt && opt.wazaNamaeNashi)) {
      michi.push('①' + (ym || '今の月') + ' … ★★この人の「確認済」が 見つからないので 月まとめの 取り消しを ★押しません★★★'
        + ((opt && opt.wazaNamaeNashi) ? '（★--waza＝わざと 押さない 側に 倒した★）' : '')
        + '＝★押すと 同じ月の 他の 人の 確定も 一緒に 外れます★'
        + '（econf 全 ' + shirabe.zen + '／見える ' + shirabe.mieru + '／印つき ' + shirabe.iri
        + '／探した 名前「' + (na2 || '★空★') + '」'
        + (shirabe.namaeNashi ? '★呼ぶ側が 名前を 渡して いない★' : '')
        + '／印つきの 行 … ' + (shirabe.na || []).join(' | ') + '）');
      /* ★★ここで `return` しない★★（2026-09-24・私が 一度 `return` に して 考え直した）
         ★訳★ … 止めたいのは ★他人の 確定を 外す 事★だけ。★消す 仕事まで 止めると★
           ★人が 消し残る＝置き土産が 増える★（★守りの 為の 直しが 別の 傷を 作る★）。
         ★その人に 本当に 確定が 在るなら★ この後 アプリが ★消させません★
           （「確定した 明細が 在る人は 消させない」）⇒ ★⑤で 残りが 出て 自然に 赤に なります★
         ＝★見張りを 自分で 作らず アプリの 門に 任せる★。 */
      continue;
    }
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
  /* ★★押す 直前の『小さな 札』を 控える★★（2026-09-24 指示役1）
     ★訳★ … 札は「自動保存済 hh:mm」＝★保存が 走る たび 時刻が 動く★。
       ⇒ ★★前後で 字が 動かなければ『保存が そもそも 呼ばれて いない』★★＝
         ★『倉庫が 断った』とは 別の 話★（★札の 字だけでは 割れない★）。 */
  const fudaMae = await pg.evaluate(() => {
    const s = document.getElementById('save-status');
    return ((s && s.textContent) || '').trim();
  }).catch(() => '★引けない★');
  michi.push('④押す 直前の 小さな 札 …「' + (fudaMae || '★空★') + '」');
  michi.push('④削除ボタンを 押した【本物の click】');
  await del.click({ timeout: 8000 }).catch(() => null);
  await machi(900);
  /* ★★空振り止め（`opt.wazaYarinaoshi`）★★（2026-09-24）
     ★はじめ★ … ⑦を「残った」事に して ⑧を 呼んだ ⇒ ★人は もう 居ない＝札 -1番目＝★空振り★★
     ⇒ ★★『⑧を 呼ぶ』と『⑧が 仕事を する』は 別★★（★今日の 家★）
     ★今★ … ★1回目の 確認で ★キャンセル★ を 押す★＝★人は 残る★
        ⇒ ★⑤⑥⑦は「残って いる」と 正しく 出る★ ⇒ ★★⑧が 本当に 消しに 行きます★★
        ⇒ ★⑧が 通れば「やり直し 1回で 消えました」／通らなければ 赤★ */
  const wazaY = !!(opt && opt.wazaYarinaoshi);
  const y2 = wazaY
    ? await osuByJi(pg, /^(キャンセル|やめる|いいえ)$/, machi)
    : await osuByJi(pg, /^(OK|はい|削除|削除する)$/, machi);
  michi.push(y2.osita
    ? (wazaY ? '④★--waza＝わざと ★キャンセル★ を 押した（人は 残ります）★' : '④削除の 確認を 押した【本物の click】（' + y2.ji + '）')
    : '④削除の 確認が 出なかった');
  await machi(1400);

  /* ★消えたかは 画面で 数える★（名前が 在れば 名前で／無ければ ★札の 総数が 1枚 減ったか★） */
  const nokori = na
    ? await pg.evaluate((n) => Array.from(document.querySelectorAll('#emp-list .mco'))
      .filter((x) => ((x.querySelector('.mco-nm') || {}).textContent || '').indexOf(n) >= 0).length, na).catch(() => -1)
    : (await pg.evaluate((b) => (document.querySelector('#emp-list .mco[data-i="' + b + '"]') ? 1 : 0), ban0).catch(() => -1));
  michi.push('⑤画面に 残り ' + nokori + '人');
  if (nokori !== 0 && !wazaY) return { ok: false, michi, naze: '画面に ' + nokori + '人 残っている' };
  if (nokori !== 0 && wazaY) michi.push('⑤★--waza＝画面に 残って います（狙いどおり）＝⑥へ 進みます★');

  /* ★★⑤-2 ★客が 同時に 何を 見て いるか★を そのまま 出す★★（2026-09-24 指示役1）
     ★なぜ★ … 消した 後 ★倉庫に 残る★事が 実際に 起きた（CI・f19ef04）。
       `store.js` の 保存は ★5本の 帰り道★で `{ok:false}` を 返し、
       アプリは その うち 4本を ★小さな 札（`#save-status`）★に 出す。
       ★でも『削除しました』の 緑の toast は ★返事を 待たずに★ 出る★。
     ⇒ ★★どの 道で 落ちたかは ★札の 字★に 出て いる★★ので ★そのまま 写す★。
       ・何も 出ない ……………… ★未ログイン（no-user）★＝別の 話
       ・「クラウドに保存済み…」 … conflict
       ・「クラウド未保存（◯◯）」 … sync-check-failed ／ held-skipped など
     ⇒ ★倉庫を 触りません／CI でも 出ます／1行★ */
  try {
    const fuda = await pg.evaluate(() => {
      const s = document.getElementById('save-status');
      const t = document.getElementById('app-toast');
      /* ★★『今 ログインして いるか』★★＝倉庫を 触らずに 客の 道で 分かる 物
         （supabase は 端末の 控えに `sb-<ref>-auth-token` を 置く＝★在る/無い だけ★を 見る） */
      let login = null;
      try {
        login = Object.keys(localStorage).some((k) => /^sb-.*-auth-token$/.test(k));
      } catch (e) { login = null; }      /* ★控えが 読めない 時は null＝『分からない』★ */
      return {
        save: ((s && s.textContent) || '').trim(),
        toast: ((t && t.textContent) || '').trim(),
        mieru: !!(t && getComputedStyle(t).opacity !== '0'),
        login: login,
      };
    }).catch(() => null);
    if (fuda) {
      michi.push('⑤-2 客が 見て いる 字 … 小さな 札「' + (fuda.save || '★空★')
        + '」／ toast「' + (fuda.toast || '★空★') + '」（今 見えて いる＝' + fuda.mieru + '）');
      michi.push('⑤-2 ログインして いるか … '
        + (fuda.login === null ? '★分からない（端末の 控えが 読めない）★' : String(fuda.login)));
      /* ★★『断られた』と『頼んで すら いない』を 割る★★（指示役1 2026-09-24） */
      if (!fuda.save) {
        michi.push('     ⇒ ★札が 空＝保存の 警告は 出て いません★'
          + (fuda.login === false ? '／★ログインが 切れて います＝no-user の 道★'
            : '／★ログインは 在る＝★保存が 呼ばれて いない かも★★'));
      } else if (fuda.save === fudaMae) {
        /* ★★この 行は 一度 ★嘘を 出して いました★★（2026-09-24 実測で 直した）
           ★前★ … 「札の 字が 同じ ＝ ★保存が 走って いない 見込み★」と 書いて いた
           ★実物★ … CI の ログで ★4回 出た★／同じ 回の ⑦は ★「この人 0人」＝消しは 届いて いた★
           ★訳★ … ★札は「自動保存済 hh:mm」＝★分までしか 出ません★★
                  ⇒ ★★同じ 分の うちは 走っても 字が 動きません★★
           ⇒ ★★『見込み』と 書いて あっても 4行 出れば 読む人は 信じます★★
           ⇒ ★判じを やめて ★決められない と 書く★★ */
        michi.push('     ⇒ ★札の 字が 押す 前と 同じ（「' + fudaMae + '」）★'
          + '／★★但し 札は ★分まで★＝同じ 分なら 走っても 動きません＝★これでは 決められません★★★');
      } else {
        michi.push('     ⇒ ★札が 動いた（「' + (fudaMae || '空') + '」→「' + fuda.save + '」）＝★保存は 走った★');
      }
    } else michi.push('⑤-2 ★客が 見て いる 字を 引けません★');
  } catch (e) { michi.push('⑤-2 ★札を 引く 所で 転びました … ' + String((e && e.message) || e).slice(0, 80) + '★'); }

  /* ★★⑥開き直して もう一度 数える★★（2026-09-19 実測で 足した）
     ★「画面から 消えた」は「倉庫から 消えた」では ない★。
     ★実測★ … CI の `fuyo-ui` が ★2回 続けて★ 人を 残した
       （`CI試験216194　太郎`／`CI試験674905　太郎`＝2人とも ★家族つき★）。
       片づけの 出しは 両方とも ★「⑤画面に 残り 0人」＝緑★だった。
       残った 人は ★次の 回の CSV に 混ざり★、`fuyo-ui` の
       「様式2202700 の 行が 1本」を ★2本★に して ★別の 試験を 赤に した★。
     ⇒ ★画面の 数で 終わらせない★＝★開き直す（倉庫から 描き直す）★まで 見る。
       ★これは 会社の 道の まま★（管理鍵が 要らない＝CI でも 効く）。
     ＝[[feedback_naoshita_wa_gamen_dake_kaisha_no_dougu_ga_nokoru]]
       ／[[feedback_jibun_no_dai_ga_shitte_iru_kazu_wa_kyaku_no_michi_de_kazoero]] */
  let matta = 0, nokori2 = -1, kumo = '';
  try {
    await pg.reload({ waitUntil: 'domcontentloaded' });
    /* ★★開き直しただけでは ★手元の 控え★を 見て いる★★（2026-09-19 実測で 捕まえた）
       ★何が 起きたか★ … この ⑥は ★「残り 0人」で 緑★を 出し続けたのに
         CI は ★5人 残した★（`CI試験813256` 等・2026-09-19 実測 人 5→10）。
       ★訳★ … 開き直した 直後の 画面は ★倉庫の 返事を 待たずに 手元の 控えから 描かれる★。
         消した 人は 手元の 控えからは 既に 消えて いる ⇒ ★0人に 見える★。
       ⇒ ★★「開き直した」は「倉庫から 描き直した」では ない★★
       ⇒ ★クラウドの 読み込みに 答えてから 数える★（覆いが 出た時は それが 合図）。 */
    const { kumoNiKotaeru } = await import('../../tests/_hairu.mjs');
    kumo = await kumoNiKotaeru(pg, '#emp-list', 16);
    /* ★★「出た」で 止めず ★落ち着くまで★ 数える★★（2026-09-19 実測で 直した）
       ★前★ … 札が 1枚でも 出たら その場で 数えて いた（★待った 1回★）。
       ★何が 起きたか★ … 開き直した 直後の 画面は ★手元の 控え★で 描かれ、
         ★倉庫の 返事は その後に 来る★。消した 人は 手元の 控えからは 消えて いるので
         ★0人に 見えて 緑★＝★CI は 5人 残したのに 5回とも 緑★。
       ⇒ ★同じ 数が 3回 続くまで 待つ★（間は 0.5秒）＝★後から 来る 返事を 待つ★
       ⇒ ★落ち着かなければ「決められません」★＝0人とは 言わない。
     ★★但し この 形の 限界★★（2026-09-19 指示役1 の 指摘・★紙に 残す★）
       ★見て いるのは 落ち着きだけ★。★手元の 控えが ずっと 間違って いれば
       3回とも 同じ 間違い★＝★★落ち着き は 正しさ では ない★★。
       ★本当に 効くのは「倉庫に 直接 訊く」★／★CI には 管理鍵が 無いので 今は 出来ない★。
       ⇒ ★「3回 待てば 安心」とは 読まないで ください★。 */
    let mae = -2, onaji = 0, zen = -1;
    for (let i = 0; i < 160; i++) {
      matta++;
      const r = await pg.evaluate((n) => {
        const fuda = Array.from(document.querySelectorAll('#emp-list .mco'));
        if (!fuda.length) return null;                    /* まだ 描いて いない */
        return {
          zen: fuda.length,
          na: n ? fuda.filter((x) => ((x.querySelector('.mco-nm') || {}).textContent || '').indexOf(n) >= 0).length : 0,
        };
      }, na).catch(() => null);
      if (r !== null) {
        if (r.zen === zen && r.na === mae) onaji++; else onaji = 0;
        zen = r.zen; mae = r.na;
        if (onaji >= 2) { nokori2 = r.na; break; }        /* ★同じ 数が 3回★ */
      }
      await machi(500);
    }
    if (nokori2 < 0 && mae >= 0) {
      michi.push('⑥★落ち着きません★（札 ' + zen + '枚／この人 ' + mae + '人＝最後に 見た 数）');
    }
  } catch (e) { nokori2 = -1; }
  michi.push('⑥開き直して 数えた … 残り ' + nokori2 + '人（待った ' + matta + '回'
    + '／クラウドの 覆い ' + (kumo ? '「' + kumo + '」を 押した' : '出なかった') + '）');
  if (nokori2 < 0) {
    return { ok: false, michi, naze: '★開き直しても 数えられない★（0人とは 言えません）' };
  }
    if (nokori2 !== 0 && !wazaY) {
      return { ok: false, michi,
        naze: '★画面からは 消えたのに 開き直すと ' + nokori2 + '人 居る★' };
    }
    if (nokori2 !== 0 && wazaY) michi.push('⑥★--waza＝残って います（狙いどおり）＝⑧へ 進みます★');

    /* ★★★⑦ アプリの 口で ★倉庫を★ 数える★★★（2026-09-22）
       ★前は ここまで ★画面の 札★しか 見て いませんでした★
         ⇒ ★画面から 消えても 倉庫に 残る★ 事が 実際に 起きた（CI で ┅3回★）
         ⇒ ★CI は 倉庫の 鍵を 持って いない★ ⇒ ★誰も 数えて いなかった★
         ⇒ ★片づけは「残り 0人」と 言い、置き去りが 黙って 残った★
       ★今★ … ★お客さんの 道で 入って いる★ので ★アプリの 口★が 使える
         … ★新しい 鍵 要らず★／★自分の 口の 分だけ★
         （★置き去りは その 試験の 口に 生まれる★ので 見分けには 足ります）
       ★足りない 時は 黙らない★ … ★未測定と 書く（0人とは 言わない）★ */
    /* ★★名前は `na2`（★札から 読んだ 本当の 名前★）を 使う★★（2026-09-22 踏んだ）
       ★はじめ★ … `na`（呼ぶ側から 渡る）を 使った
         ⇒ `fuyo-ui` は ★番号だけ 渡す（名前は まだ 無い）★ので `na` は ★空★
         ⇒ `indexOf('')` は ★0★ ⇒ ★★全員に 一致して いた★★（出し：この人 3人／口に 3人）
       ★名前が 無い 時は 数えません★＝★0人とは 言わない★ */
    const sk = await pg.evaluate(async (n) => {
      if (!n) return { naNashi: true };                 /* ★名前が 無い＝数えられない★ */
      if (!(window.Store && window.Store.cloudLoadState)) return { nashi: true };
      try {
        const st = await window.Store.cloudLoadState();
        if (!st || !st.employees) return { yomenai: true };
        return { nin: st.employees.filter((e) => String((e && e.name) || '').indexOf(n) >= 0).length,
          zen: st.employees.length };
      } catch (e) { return { dame: String((e && e.message) || e).slice(0, 120) }; }
    }, (na2 || na)).catch((e) => ({ dame: String((e && e.message) || e).slice(0, 120) }));

    if (sk && sk.nin != null) {
      michi.push('⑦倉庫を アプリの 口で 数えた … この人 ' + sk.nin + '人／口に ' + sk.zen + '人');
      /* ★★空振り止め★★（2026-09-24 指示役1）＝★⑧が 1度も 走らない まま 緑＝未測定★
         ★`opt.wazaYarinaoshi` を 渡した 時だけ★ ⑦を ★わざと『残った』事に して★ ⑧を 走らせる。
         ⇒ ★★⑧の 道が 本当に 通るかを 確かめられます★★（★客の 画面は 1文字も 変わりません★） */
      const waza = wazaY;
      if (sk.nin !== 0) {
        /* ★★⑧残って いたら ★開き直して もう1回だけ★ 消す★★（2026-09-24 指示役1）
           ★なぜ 直すのか（★赤を 落とすのでは ない★）★
             ・★09-24 実測★ … ★一度 保存が 断られると その 画面では もう 通らない／★開き直すと 通る★★
             ・⇒ ★★『残った』は 多くの 場合 ★開き直せば 消せる★★＝★片づけの 直し方が 在る★
             ・★赤を 落とすのでは なく ★やり直して、やり直した 事を 数に 出します★★
               ⇒ ★★『黙って 緑』では なく『やり直した 回数が 見える 緑』★★
             ・★それでも 残ったら ★赤★★（★本当の 赤は 残す★）
           ★客の 画面は 1文字も 変えて いません★（★道具の 側だけ★） */
        michi.push('⑧★残って いたので 開き直して もう1回 消します★');
        let naota = false;
        try {
          await pg.reload({ waitUntil: 'domcontentloaded' });
          await machi(3000);
          const { kumoNiKotaeru } = await import('../../tests/_hairu.mjs');
          await kumoNiKotaeru(pg, '#emp-list', 16).catch(() => '');
          if (osu) { await osu(pg, '.bn[data-scr="scr-settings"]'); await machi(700);
            await osu(pg, '#set-seg .seg-b[data-set="emp"]'); await machi(900); }
          const ban2 = await pg.evaluate((n) => {
            const a = Array.from(document.querySelectorAll('#emp-list .mco'));
            for (const c of a) {
              const nm = c.querySelector('.mco-nm');
              if (nm && (nm.textContent || '').trim().indexOf(n) >= 0) return +c.dataset.i;
            }
            return -1;
          }, (na2 || na)).catch(() => -1);
          michi.push('⑧札 ' + ban2 + '番目');
          if (ban2 >= 0 && osu) {
            await osu(pg, '#emp-list .mco[data-i="' + ban2 + '"] [data-toggle]'); await machi(900);
            await osu(pg, '#emp-list .mco[data-i="' + ban2 + '"] .emp-dtgl'); await machi(900);
            await osu(pg, '#emp-list .mco[data-i="' + ban2 + '"] .m-del-emp'); await machi(1200);
            const y3 = await osuByJi(pg, /^(OK|はい|削除|削除する)$/, machi);
            michi.push('⑧' + (y3.osita ? '削除の 確認を 押した（' + y3.ji + '）' : '★確認が 出なかった★'));
            await machi(3000);
            const sk2 = await pg.evaluate(async (n) => {
              if (!(window.Store && window.Store.cloudLoadState)) return { nashi: true };
              try {
                const st = await window.Store.cloudLoadState();
                if (!st || !st.employees) return { yomenai: true };
                return { nin: st.employees.filter((e) => String((e && e.name) || '').indexOf(n) >= 0).length };
              } catch (e) { return { dame: String((e && e.message) || e).slice(0, 120) }; }
            }, (na2 || na)).catch(() => null);
            if (sk2 && sk2.nin === 0) { naota = true; michi.push('⑧★★やり直し 1回で 消えました★★'); }

            else michi.push('⑧★やり直しても 残って います … ' + JSON.stringify(sk2) + '★');
          }
        } catch (e) { michi.push('⑧★やり直しで 転びました … ' + String((e && e.message) || e).slice(0, 80) + '★'); }
        if (waza && !naota) michi.push('⑧★★--waza … ⑧の 道が 通りませんでした＝★空振り★★★');
        if (!naota) {
          return { ok: false, michi,
            naze: '★★画面からは 消えたのに ★倉庫に ' + sk.nin + '人 残って います★★'
              + '（アプリの 口で 数えました／★やり直しても 消えませんでした★）' };
        }
      }
    } else {
      michi.push('⑦🟡 ★倉庫を アプリの 口で 数えられません★ … '
        + (sk && sk.naNashi ? '名前が 無い' : sk && sk.nashi ? '口が 無い' : (sk && sk.yomenai ? '読めない' : (sk && sk.dame) || '訳不明'))
        + '（★0人とは 言いません★）');
    }

    return { ok: true, michi, naze: '' };
}
