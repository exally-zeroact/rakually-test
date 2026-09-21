/* jidou-gyou.mjs — ★自動計算の 行に 打った 時の 注意文★を お客さんの道で 測る
 * ============================================================================
 * ★なぜ 在るか（2026-09-20・司さん「★1が ほれなら 注意文 出せや★」）★
 *   ★前★ … 支給の「基本給」「通勤手当」の 欄は ★打てる／字は 残る／合計は 動かない★
 *           ★外を 押しても 戻らない★／★画面を 出て 戻ると 社員マスタの 値に 戻る★
 *           ＝★★画面と 中身が 食い違ったまま★★（会社は「変えた つもり」に なる）
 *   ★因★ … `payroll-monthly.js` の `compute` 1行目 `syncCommute(e); syncBasePay(e, ctx);`
 *           ＝★計算の たび `e.shikyu` の /基本給/ と /通勤/ の 行を 作り直す★
 *   ★司さんの 決め★ … ★効かせる のでは なく ★注意文を 出す★★
 *           （効かせると ★時給・日給・歩合・カスタムが 壊れる★＝行き先が 違う）
 *
 * ★★出し方を 世の中で 調べて 決めた（2026-09-20・司さん「リサーチして 最適解で やれ」）★★
 *   ・★自分たちの 全repo（19本）に 同じ形は 0件★＝揃える 先が 無い
 *   ・★NN/g … toast は フォームの 誤りに 向かない★（消える／見逃す／支援技術に 伝わらない）
 *     ⇒ ★インライン（欄の すぐ下）★／★消えない★
 *   ・★欄の下は 画面が 動く（実測 35px 逃げた 前科）★
 *     ⇒ ★`min-height` で 場所を 先に 空ける★＝★字が 出ても 1pxも 動かない★
 *   ・★支援技術★ … `role="status" aria-live="polite"` ＋ ★欄と `aria-describedby` で 結ぶ★
 *     （★この repo で aria-live を 使うのは ここが 初めて★＝実測 0件だった）
 *
 * ★ここで見る 7つ★
 *   ① 打つ ⇒ ★文が 出る★（★払い方 6通りで ★違う 文★★）
 *   ② 打つ ⇒ ★字が その場で 戻る★
 *   ③ ★打たない 時は 文が 出ない★（出っぱなしに しない）
 *   ④ ★打ち直せば また 出る★（★1回だけ 出て 二度と 出ないが 一番 悪い★）
 *   ⑤ ★通勤の 行★でも 同じ（★行が 消えない★）
 *   ⑥ ★高さが 動かない★（文の 前後で 同じ＝★min-height が 効いて いる★）
 *   ⑦ ★支援技術の 印★（role/aria-live/aria-describedby が 付いて いる）
 * ★--waza★ … ★`min-height` を 外したら 高さが 動く★／★文を 消したら ①が 赤★
 *
 * 使い方: node kyuyo/tests/jidou-gyou.mjs [--waza]
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), '..', '..');
/* ★★手元の 絶対パスを 焼き込んで いました★★（2026-09-21 CI で 赤に なった）
   ★出た 字★ … Cannot find module '/C:/Users/zeroa/rakually-test/tests/_hairu.mjs'
     （Linux の CI では `C:` が そのまま 道の 一部に なる）
   ★いつ 入ったか★ … `e7c7301`（今朝 私が 書いた）
   ⇒ ★他の 試験と 同じ ★相対の 道★ に 戻す★（`_kyaku_no_michi_de_katazukeru.mjs` と 同じ 形） */
const { hairu } = await import('../../tests/_hairu.mjs');
const { borrow, launch } = await import('../../scripts/_borrow-playwright.mjs');
const G = await import('./_souko-kazoeru.mjs');
/* ★★わざとは 2つに 分ける★★（2026-09-20 実測で 踏んだ）
   ★前★ … `--waza` で ★文も 高さも いっぺんに 壊した★
   ⇒ ★文が 出ないから 高さも 動かない★＝★⑥（高さ）が わざとでも 緑＝★空振り★★
   ⇒ ★★1つずつ 壊す★★ … `--waza-bun`（文を 消す）／`--waza-taka`（min-height を 外す）
   ★`--waza` は 今までどおり 両方★（★但し ⑥は それでは 測れないと 字に 出す★） */
const WAZA_BUN = process.argv.includes('--waza') || process.argv.includes('--waza-bun');
const WAZA_TAKA = process.argv.includes('--waza') || process.argv.includes('--waza-taka');
const WAZA = WAZA_BUN || WAZA_TAKA;
/* ★★本番の repo では 測らない★★（2026-09-16 の 門／★09-21 に 私が 抜かして CI を 赤に した★）
   ★訳★＝この 試験は ★試験用の 口で ログインする★。本番の repo には ★その 鍵が 無い★
     ⇒ 入れない ⇒ ★本番の 検査が 毎回 必ず 赤★。★中身の 不具合では ない★。
   ★見張り★＝`kyuyo/tests/honban-de-hakaranai.test.mjs`（★この門が 抜けたら 赤★）
   ★★`borrow()` より 前に 置く★★（門は 順番も 見ています＝`junbanGaGyaku`）
   ★戻す条件★＝本番CIに 試験の 鍵を 置いた日。 */
{
  const { kagiAru } = await import('../../tests/_hairu.mjs');
  if (!(await kagiAru(ROOT))) {
    console.log('  — ★この repo（本番）には 試験の 鍵が 無いので ここでは 測れません★'
      + '（★テスト線で 測っています★／戻す条件＝本番CIに 鍵を 置いた日）');
    process.exit(0);
  }
}
const wk = await borrow('jidou-gyou', 'webkit');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const srv = http.createServer((rq, rs) => {
  const u = decodeURIComponent(rq.url.split('?')[0]); let p = path.join(ROOT, u);
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { rs.writeHead(404); rs.end('x'); return; }
  let body = fs.readFileSync(p);
  /* ★わざと★＝配る 時だけ 壊す（★repo の 字は 1文字も 変えない★） */
  if (WAZA && /app\.js$/.test(p)) {
    let j = String(body);
    if (WAZA_TAKA) j = j.split('min-height:15px;').join('');                    /* ★場所を 先に 取るのを 外す★ */
    if (WAZA_BUN) j = j.split("_nt.textContent = jidouNote(emp, _jk);").join("_nt.textContent = '';"); /* ★文を 消す★ */
    body = Buffer.from(j, 'utf8');
  }
  rs.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); rs.end(body);
});
await new Promise((r) => srv.listen(0, r)); const PORT = srv.address().port;
let pass = 0, fail = 0, mi = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };
const MI = (n, m) => { mi++; console.log('  🟡 ★はかれない★ ' + n + (m ? ' … ' + m : '')); };

const mae = await G.kazoeru();
const maeHito = await G.toiawase("select data->>'payType' as pt, data->>'commute' as tsukin, data->>'base' as base from kyuyo.pay_employees where data->>'name'='従業員 1'");
console.log('\n[jidou-gyou] ★自動計算の 行に 打った 時の 注意文★' + (WAZA ? '（★わざと★）' : ''));
console.log('  ★前★ 人 ' + mae.hito + '／確定 ' + mae.kakutei + '／公開 ' + mae.koukai + '／紙 ' + mae.kami
  + '　★従業員 1★ ' + (maeHito.ok ? JSON.stringify(maeHito.gyo) : maeHito.naze));

const b = await launch('jidou-gyou', wk); const pg = await b.newPage();
await hairu(pg, 'http://localhost:' + PORT + '/kyuyo/index.html', '.bn[data-scr]');
const empHiraku = async () => {
  await pg.click('.bn[data-scr="scr-settings"]', { timeout: 20000 }).catch(() => null);
  await new Promise((r) => setTimeout(r, 700));
  await pg.click('#set-seg .seg-b[data-set="emp"]', { timeout: 20000 }).catch(() => null);
  let n = 0, mai = 0;
  while (n < 30 && !mai) { await new Promise((r) => setTimeout(r, 400)); n++;
    mai = await pg.$$eval('#emp-list .mco', (x) => x.length).catch(() => 0); }
  const dare = await pg.$$eval('#emp-list .mco', (ns) => ns.map((c) => ({ i: c.dataset.i, na: (c.querySelector('.mco-nm') || {}).textContent })));
  if (!dare.length) return { naze: 'カードが 0枚' };
  const m = dare.find((x) => (x.na || '').indexOf('従業員 1') === 0);
  if (!m) return { naze: '従業員 1 が 居ない' };
  let a = await pg.$eval('#emp-list .mco[data-i="' + m.i + '"]', (c) => c.classList.contains('open')).catch(() => false);
  if (!a) await pg.click('#emp-list .mco[data-i="' + m.i + '"] .mco-hd', { timeout: 6000 }).catch(() => null);
  for (let k = 0; k < 15 && !a; k++) { await new Promise((r) => setTimeout(r, 400));
    a = await pg.$eval('#emp-list .mco[data-i="' + m.i + '"]', (c) => c.classList.contains('open')).catch(() => false); }
  return a ? m.i : { naze: 'カードは 在るが 開かない' };
};
const inHiraku = async () => {
  await pg.click('.bn[data-scr="scr-input"]', { timeout: 20000 }).catch(() => null);
  let n = 0, mai = 0;
  while (n < 30 && !mai) { await new Promise((r) => setTimeout(r, 400)); n++;
    mai = await pg.$$eval('#input-list .acc', (x) => x.length).catch(() => 0); }
  if (!mai) return false;
  const a0 = await pg.$eval('#input-list .acc[data-i="0"]', (c) => c.classList.contains('open')).catch(() => false);
  if (!a0) await pg.click('#input-list .acc[data-i="0"] [data-toggle]', { timeout: 6000 }).catch(() => null);
  await new Promise((r) => setTimeout(r, 900));
  return true;
};
const gyouSagasu = async (re) => pg.evaluate((reS) => {
  const c = document.querySelector('#input-list .acc[data-i="0"]'); if (!c) return null;
  const rows = [...c.querySelectorAll('.rows [data-g="shikyu"][data-f="label"]')];
  const t = rows.find((e) => new RegExp(reS).test(e.value || ''));
  if (!t) return null;
  const v = c.querySelector('[data-g="shikyu"][data-ri="' + t.dataset.ri + '"][data-f="value"]');
  return { ri: t.dataset.ri, lab: t.value, val: v ? v.value : null };
}, re);
const fuda = async (ri) => pg.evaluate((r) => {
  const c = document.querySelector('#input-list .acc[data-i="0"]');
  const n = c && c.querySelector('[data-note="shikyu:' + r + '"]');
  if (!n) return { nai: true };
  const inp = c.querySelector('[data-g="shikyu"][data-ri="' + r + '"][data-f="value"]');
  return { ji: (n.textContent || '').trim(), role: n.getAttribute('role'), live: n.getAttribute('aria-live'),
    id: n.id, musubi: inp ? inp.getAttribute('aria-describedby') : null };
}, ri);
const taka = async () => pg.$eval('#input-list .acc[data-i="0"]', (c) => c.getBoundingClientRect().height).catch(() => null);

/* ─ ① 払い方 6通りで 違う 文が 出る ＋ ② 字が 戻る ＋ ③ 打たない時は 出ない ＋ ⑥ 高さ ─ */
const PT = ['月給', '時給', '日給', '歩合', '役員', 'カスタム'];
const bunShu = {};
let takaOk = true, takaIu = [];
for (const pt of PT) {
  const ei = await empHiraku();
  if (ei && ei.naze) { MI('払い方 ' + pt, ei.naze); continue; }
  await pg.selectOption('#emp-list .mco[data-i="' + ei + '"] [data-f="payType"]', pt).catch(() => null);
  await new Promise((r) => setTimeout(r, 1200));
  if (!(await inHiraku())) { MI('払い方 ' + pt, '入力の カードが 出ない'); continue; }
  const gy = await gyouSagasu('基本給');
  if (!gy) { MI('払い方 ' + pt, '基本給の 行が 無い'); continue; }
  const mae0 = await fuda(gy.ri);
  if (mae0.nai) { T('★③ 打たない時は 文が 出ない（' + pt + '）', false, '札そのものが 無い'); continue; }
  if (pt === '月給') T('★③ 打たない 時は 文が 出ない（場所は 空いている）', mae0.ji === '', '出ている … ' + mae0.ji);
  const t1 = await taka();
  const SEL = '#input-list .acc[data-i="0"] [data-g="shikyu"][data-ri="' + gy.ri + '"][data-f="value"]';
  await pg.click(SEL, { timeout: 6000 }).catch(() => null);
  await pg.type(SEL, '9', { delay: 20 }).catch(() => null);
  await new Promise((r) => setTimeout(r, 600));
  const ato0 = await fuda(gy.ri);
  const ran = await pg.$eval(SEL, (e) => e.value).catch(() => null);
  const t2 = await taka();
  bunShu[pt] = ato0.ji;
  T('★① 文が 出る（' + pt + '）', !!ato0.ji, '出ない');
  T('★② 字が その場で 戻る（' + pt + '）', ran === gy.val, '前 ' + gy.val + ' → 後 ' + ran);
  if (t1 != null && t2 != null) { takaIu.push(pt + ' ' + t1 + '→' + t2); if (t1 !== t2) takaOk = false; }
  if (pt === '月給') {
    T('★⑦ 支援技術の 印が 付いている（role / aria-live / aria-describedby）',
      ato0.role === 'status' && ato0.live === 'polite' && ato0.musubi === ato0.id,
      'role=' + ato0.role + ' live=' + ato0.live + ' 結び=' + ato0.musubi + ' id=' + ato0.id);
    /* ④ 打ち直せば また 出る */
    await pg.evaluate((s2) => { const n = document.querySelector(s2); if (n) n.textContent = ''; },
      '#input-list .acc[data-i="0"] [data-note="shikyu:' + gy.ri + '"]');
    await pg.click(SEL, { timeout: 6000 }).catch(() => null);
    await pg.type(SEL, '8', { delay: 20 }).catch(() => null);
    await new Promise((r) => setTimeout(r, 600));
    const f4 = await fuda(gy.ri);
    T('★④ 打ち直せば また 出る（1回だけで 終わらない）', !!f4.ji, '2回目は 出ない');
  }
}
/* ★⑥は ★文が 出る 時にしか 測れない★★＝`--waza-bun` では 空振り（そう 字に 出す） */
/* ★★ここを「はかれない」と 呼ばない★★（2026-09-21 実測で 直した）
   ★何が 起きて いたか★ … `--waza-bun` は ★文を 消す わざと★なので
     ⑥（文が 出た分だけ 高さが 伸びる）は ★そもそも 当てはまらない★（★--waza-taka で 測る★）。
   ★でも `はかれない` と 書いて いた★ ⇒ ★総なめが ★未測定 1本★ と 数える★
   ⇒ ★★`souname` が 永久に「全部 緑」と 書けなく なる★★
   ★これは 字で ごまかす 直しでは ありません★
     … ★未測定＝「測る つもりだったが 測れなかった」★／
       ★ここ＝「この わざとでは ★見る 対象で ない★」★＝★別の 段で 測って いる★
   ★当てはまらない 事は 字に 出す（黙らない）★ */
if (WAZA_BUN) console.log('  ★この わざと（--waza-bun）では ⑥高さは ★見る 対象で ありません★'
  + '（文を 消すので 高さも 動かない）★ … ★⑥は --waza-taka の 段で 測って います★');
else T('★⑥ 文の 前後で カードの 高さが 変わらない（min-height が 効いている）', takaOk, takaIu.join(' ／ '));
const chigau = Object.keys(bunShu).filter((k) => bunShu[k]);
T('★① 払い方で 違う 文が 出る（' + chigau.length + '通り／同じ字 ' + (chigau.length - new Set(chigau.map((k) => bunShu[k])).size) + '通り）',
  chigau.length >= 5 && new Set(chigau.map((k) => bunShu[k])).size >= 5,
  JSON.stringify(bunShu).slice(0, 200));
chigau.forEach((k) => console.log('       ' + k + ' … ' + bunShu[k]));

/* ─ ⑤ 通勤の 行 ─ */
const ei2 = await empHiraku();
if (ei2 && ei2.naze) MI('⑤ 通勤', ei2.naze);
else {
  const CS = '#emp-list .mco[data-i="' + ei2 + '"] [data-f="commute"]';
  await pg.click(CS, { timeout: 8000 }).catch(() => null);
  await pg.fill(CS, '', { timeout: 8000 }).catch(() => null);
  await pg.type(CS, '4200', { delay: 30 }).catch(() => null);
  await new Promise((r) => setTimeout(r, 1500));
  if (!(await inHiraku())) MI('⑤ 通勤', '入力の カードが 出ない');
  else {
    const gt = await gyouSagasu('通勤');
    if (!gt) MI('⑤ 通勤', '通勤の 行が 出ない');
    else {
      const S2 = '#input-list .acc[data-i="0"] [data-g="shikyu"][data-ri="' + gt.ri + '"][data-f="value"]';
      await pg.click(S2, { timeout: 6000 }).catch(() => null);
      await pg.type(S2, '9', { delay: 20 }).catch(() => null);
      await new Promise((r) => setTimeout(r, 600));
      const f5 = await fuda(gt.ri);
      const r5 = await pg.$eval(S2, (e) => e.value).catch(() => null);
      const gt2 = await gyouSagasu('通勤');
      T('★⑤ 通勤の 行でも 文が 出る／字が 戻る／★行が 消えない★',
        !!(f5.ji) && r5 === gt.val && !!gt2,
        '文=' + (f5.ji || '無し') + ' ／欄 ' + gt.val + '→' + r5 + ' ／行=' + (gt2 ? '在る' : '★消えた★'));
      console.log('       通勤 … ' + (f5.ji || '（出ない）'));
    }
  }
  /* 片づけ＝通勤を 空に */
  const ei3 = await empHiraku();
  if (!(ei3 && ei3.naze)) {
    const C3 = '#emp-list .mco[data-i="' + ei3 + '"] [data-f="commute"]';
    await pg.click(C3, { timeout: 6000 }).catch(() => null);
    await pg.fill(C3, '', { timeout: 6000 }).catch(() => null);
    await new Promise((r) => setTimeout(r, 3000));
  }
}
await b.close(); srv.close();

/* ─ 片づけ＝払い方を 元へ（★測りでは なく 後始末★） ─ */
const nokori = await G.toiawase("select data->>'payType' as pt from kyuyo.pay_employees where data->>'name'='従業員 1'");
if (nokori.ok && ((nokori.gyo || [])[0] || {}).pt !== '月給') {
  const mo = await G.toiawase("update kyuyo.pay_employees set data = jsonb_set(data,'{payType}','\"月給\"'::jsonb)"
    + " where data->>'name'='従業員 1' returning id");
  console.log('  ★後始末★ 払い方を 月給へ 戻した … ' + (mo.ok ? (mo.gyo || []).length + '行' : '★失敗★ ' + mo.naze));
}
const ato = await G.kazoeru();
const atoHito = await G.toiawase("select data->>'payType' as pt, data->>'commute' as tsukin, data->>'base' as base from kyuyo.pay_employees where data->>'name'='従業員 1'");
console.log('  ★後★ 人 ' + ato.hito + '／確定 ' + ato.kakutei + '／公開 ' + ato.koukai + '／紙 ' + ato.kami
  + '　★従業員 1★ ' + (atoHito.ok ? JSON.stringify(atoHito.gyo) : atoHito.naze));
T('★倉庫が 元に 戻った（人・確定・公開・紙）', ato.hito === mae.hito && ato.kakutei === mae.kakutei
  && ato.koukai === mae.koukai && ato.kami === mae.kami,
  mae.hito + '/' + mae.kakutei + '/' + mae.koukai + '/' + mae.kami + ' → ' + ato.hito + '/' + ato.kakutei + '/' + ato.koukai + '/' + ato.kami);
console.log('\n' + pass + ' passed, ' + fail + ' failed, ' + mi + ' はかれない');
/* ★★わざとの 回は 「赤に なる事」が 合格★★（2026-09-20）
   ★`|| true` で 逃がすと ★常に 緑★＝★空振り★★（CI に 書きかけて 気づいた）
   ⇒ ★この 紙の 中で 判じる★＝★赤が 1本も 出なければ 赤★（他の --waza の 紙と 同じ 形） */
if (WAZA) {
  const kitai = WAZA_TAKA && !WAZA_BUN ? '⑥（高さ）' : '①④⑤（文）';
  if (fail > 0) { console.log('  ✓ ★わざと（' + kitai + '）で ' + fail + '本 赤に なった＝この門は 空振りして いません★'); process.exitCode = 0; }
  else { console.log('  ✗ ★★わざとなのに 赤が 0本＝★空振り★★★（' + kitai + ' を 壊したのに 緑）'); process.exitCode = 1; }
} else process.exitCode = fail ? 1 : 0;
