/* santei-gekkaku-ui.mjs — ★算定基礎届／月額変更届を 実ブラウザで 押す★
 * =============================================================================
 * ★なぜ（2026-09-14）★
 *   この 2つは ★一度も 実ブラウザで 押していなかった★。
 *   訳＝★確定した 明細が 要る★ので、これまでの 試験（確定させない）では 材料が 作れなかった。
 *   ★今日 被保険者整理番号の 欄が 出来た★＝項番8 が 埋まる＝出せる 見込みが 立った。
 *
 * ★確定させる 事について（2026-09-14 指示役1 が 決めた）★
 *   ・元の 決めは ★確定させない（A案）★だった。
 *   ・★曲げたのは 指示役1★＝訳「★テスト倉庫には 本物の 賃金が 1件も 無い★
 *     ＝年末調整・賃金台帳の 話は そもそも 起きない」。
 *   ・条件 … ★確定用は 別の人・名前に 印★
 *   ・★2026-09-15 直した★＝前は「★後始末は 倉庫から 直に★」と していた。
 *     訳は「確定した人は 画面から 消せない」だったが、★アプリには 逃げ道が 在った★
 *     ＝★「この月の確定を取り消す」（app.js 2417・2026-09-07 司さんが 足させた 物）★。
 *     ⇒ ★在るのに 使っていなかった★。今は ★客の 道で 取り消して から 消す★。
 *     ★倉庫から 直に 消すのは 客の 道で 消せなかった時だけ／使ったら 大きく 出す★。
 *
 * ★様式コード（原文の 写しから 読んだ・記憶で 書いていない）★
 *   算定基礎届 … 2225700 ／ 53項目（lib/todokede-csv.js 138行）
 *   月額変更届 … 2221700 ／ 49項目（同 462行「算定 2225700・53項目とは 別物」）
 *
 * ★測る事★
 *   ①4〜6月を ★画面から 入れて 確定★（お客さんの 道）
 *   ②算定基礎届の 画面で ★ボタンが 押せる★
 *   ③押したら ★SHFD0006.CSV が 本当に 落ちる★／★様式 2225700・53列・ずれ0★
 *   ④★被保険者整理番号の 字★が 紙に 入っている（今日 作った 欄が 効いているか）
 *   ⑤月額変更届も 同じく（★2221700・49列★）。材料が 無ければ ★赤では なく はかれない★
 *   ⑥★倉庫の 行数が 元に 戻る★（新しい 物差し・画面の 数では 見ない）
 *
 * 使い方: node kyuyo/tests/santei-gekkaku-ui.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

{
  const { kagiAru } = await import('../../tests/_hairu.mjs');
  if (!(await kagiAru(ROOT))) {
    console.log('  — ★この repo（本番）には 試験の 鍵が 無いので ここでは 測れません★'
      + '（★テスト線で 測っています★／戻す条件＝本番CIに 鍵を 置いた日）');
    process.exit(0);
  }
}

let borrow, pwLaunch, hairu, osu;
try {
  ({ borrow, launch: pwLaunch } = await import('../../scripts/_borrow-playwright.mjs'));
  ({ hairu, osu } = await import('../../tests/_hairu.mjs'));
} catch (e) { console.log('🟡 ★はかれない★ 道具が 読めない … ' + (e && e.message)); process.exit(2); }
const wk = await borrow('santei-gekkaku', 'webkit');
if (!wk) { console.log('🟡 ★はかれない★ playwright を 借りられない（0件＝合格 とは 書かない）'); process.exit(2); }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const srv = http.createServer((rq, rs) => {
  const url = decodeURIComponent(rq.url.split('?')[0]);
  let p = path.join(ROOT, url);
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { rs.writeHead(404); rs.end('x'); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  rs.end(fs.readFileSync(p));
});
await new Promise((r) => srv.listen(0, r));
const PORT = srv.address().port;
const b = await pwLaunch('santei-gekkaku', wk);

let pass = 0, fail = 0, mi = 0;
const NL = String.fromCharCode(10);            /* ★逃がし字を 使わない★（今日 3回 落ちた） */
const Z = String.fromCharCode(12288);          /* 全角スペース＝姓名の 区切り */
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };
const MI = (n, m) => { mi++; console.log('  🟡 ★はかれない★ ' + n + (m ? ' … ' + m : '')); };
const machi = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (x) => crypto.createHash('sha256').update(x).digest('hex').slice(0, 12);

process.on('exit', () => { try { srv.close(); } catch (e) { /* もう 閉じている */ } });
for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, () => { try { srv.close(); } catch (e) { /* 同上 */ } process.exit(130); });

/* ★打った値が 本当に 入ったか 見てから 次へ★（今日 CIが 教えてくれた 形） */
async function utsu(pg, sel, val, kai = 3) {
  const nozomi = String(val);
  for (let i = 0; i < kai; i++) {
    const el = await pg.$(sel);
    if (!el) { await machi(250); continue; }
    let tag = 'input';
    try { tag = await el.evaluate((e) => e.tagName.toLowerCase()); } catch (e) { await machi(250); continue; }
    try {
      if (tag === 'select') await el.selectOption(nozomi);
      else await el.fill(nozomi);
      await el.evaluate((e) => { e.dispatchEvent(new Event('change', { bubbles: true })); });
    } catch (e) { await machi(300); continue; }
    await machi(180);
    const ima = await pg.$(sel).then((e2) => (e2 ? e2.inputValue() : null)).catch(() => null);
    if (ima === nozomi) return true;
    await machi(320);
  }
  return false;
}

/* ★落ちた CSV を 読む★（様式コード・列の数・ずれ・整理番号）
   ★Shift_JIS の 2バイト目は カンマ(0x2C)に ならない★ので 列を 数えるだけなら latin1 で よい。
   ★字を 出す 所では 使わない★＝整理番号は 半角数字なので そのまま 読める。 */
export function csvMiru(text, yoshiki) {
  const gyo = String(text || '').split(String.fromCharCode(13) + NL).filter((x) => x.length);
  const data = gyo.filter((x) => x.indexOf(yoshiki) === 0);
  const retsu = data.map((x) => x.split(',').length);
  return { gyo: gyo.length, data: data.length, retsu: retsu[0] || 0,
    zure: retsu.filter((n) => n !== (yoshiki === '2225700' ? 53 : 49)).length,
    /* ★★整理番号の 項番は 様式ごとに 違う（2026-09-14 実測で 直した）★★
       私は ★被扶養者届の 項番8 を そのまま 持ち込んで★ 列を 1つ 間違えた
       （出た 字は '5'＝別の 列を 読んでいた）。
       ★原文の 写しから 読み直した★（lib/todokede-csv.js）:
         271行 算定 2225700 … r[4] ＝★項番5★
         550行 月変 2221700 … r[4] ＝★項番5★
        1114行 被扶養 2202700 … r[7] ＝項番8
       ⇒ ★様式ごとに 項番を 持つ★＝★1つの 番号で 使い回さない★。 */
    seiri: data.map((x) => x.split(',')[4]) };     /* 算定・月変とも ★項番5★（0始まりで 4） */
}

if (process.argv.includes('--self-test')) {
  console.log(NL + '[santei-gekkaku-ui] ★自己確認★（★物差しそのもの★・ブラウザを 使わない）');
  let ng = 0;
  const iu = (nm, good) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + nm + (good ? '' : '  ★思っていたのと 違う★')); };
  const CR = String.fromCharCode(13) + NL;
  const mk = (code, n) => [code].concat(new Array(n - 1).fill('')).join(',');
  const a = mk('2225700', 53);
  iu('算定＝データ行 1本', csvMiru('管理' + CR + a + CR, '2225700').data === 1);
  iu('算定＝53列・ずれ 0', csvMiru(a + CR, '2225700').retsu === 53 && csvMiru(a + CR, '2225700').zure === 0);
  iu('★1列 減らしたら ずれと 数える★', csvMiru(mk('2225700', 52) + CR, '2225700').zure === 1);
  const g = mk('2221700', 49);
  iu('月変＝49列・ずれ 0', csvMiru(g + CR, '2221700').retsu === 49 && csvMiru(g + CR, '2221700').zure === 0);
  const s2 = a.split(','); s2[4] = '77';
  iu('整理番号（★項番5★）を 読める', csvMiru(s2.join(',') + CR, '2225700').seiri[0] === '77');
  iu('空なら 0本', csvMiru('', '2225700').data === 0);
  console.log(ng ? NL + '★自己確認 ' + ng + '件 おかしい★' : NL + '自己確認 OK');
  process.exit(ng ? 1 : 0);
}

console.log(NL + '[santei-gekkaku-ui] 算定基礎届／月額変更届を ★実ブラウザで お客さんの道どおり★ 出す');

const { katazukeru: KATAZUKERU } = await import('./_kyaku_no_michi_de_katazukeru.mjs');
/* ★「前」は ログインの 前に 数える★（ログインした 途端に 幻の『従業員 1』が 倉庫に 書かれる） */
const { kazoeru: KAZOERU, awaseru: AWASERU, konkaiNoGomiKesu: GOMI_KESU, ima: IMA, sujiKesu: SUJI_KESU, meisaiIdHikaeru: MEISAI_HIKAE, fuetaMeisaiKesu: MEISAI_KESU, kakuteiHikaeru: KAKUTEI_HIKAE, koukaiHikaeru: KOUKAI_HIKAE, kakuteiModosu: KAKUTEI_MODOSU, fuetaKoukaiKesu: KOUKAI_KESU, kaishaHikaeru: KAISHA_HIKAE, kaishaModosu: KAISHA_MODOSU }
  = await import('./_souko-kazoeru.mjs');
/* ★始まりは ★倉庫の 時計★に 聞く★＝手元の 時計から 遡ると
   ★直前の 試験の ゴミまで 窓に 入り、自分が 作っていない 物を 消す★（総なめで 捕まった）。 */
const HAJIME = await IMA().then((x) => (x.ok ? x.t : new Date(Date.now() - 5000).toISOString()));

/* ★★走る前に「確定」と「公開」も 控える★★（2026-09-18）
   ★訳★＝「今月を確定」は ★その月の 全員★を 確認済に し ★全員を Web明細に 公開★する。
     ⇒ この試験が 1回 押すだけで ★他の 人の 確定・公開まで 作られる★。
     ⇒ 逆に 片づけで 月まとめの 取り消しを 押すと ★元から 在った 確定まで 消える★
        （2026-09-18 実測 … ★確定 4行 → 1行★＝元から 在った 3件を 壊した
          ＝★私の 報告「労働保険 0行／支払調書 0行は 正しい」の 裏取りまで 汚した★）。
   ⇒ ★★控えに 無い 物だけ 元へ 戻す★★＝★前から 在った 物は 触りようが ない★。 */
/* ★会社の 欄も 控える★＝この試験は `#c-pref` に 打つ（351-353行）が ★戻す 字が 無かった★
   ⇒ 手元の 総なめ #31 で ★kyuyo.pay_companies の 指紋 ずれ★で 赤に なった。 */
const KAISHA_MAE = await KAISHA_HIKAE();
const KAKUTEI_MAE = await KAKUTEI_HIKAE();
const KOUKAI_MAE = await KOUKAI_HIKAE();

/* ★★この回で 触る 月の 明細の id を ★走る前に★ 控える（2026-09-15）★★
   ★前は 時刻で「この回の 行」を 決めていた★
   ⇒ 確定／確定の取り消しは ★その月の 明細を 書き直す★＝★前から 在った 行の 時刻が 動く★
   ⇒ ★一緒に 消して 実物が 1行 減った★（webkit 総なめ 2026-09-15 … 明細 3,721→3,720）
   ⇒ ★★控えに 無い id だけ 消す★★＝★前から 在った 行は 触りようが ない★。 */
const TSUKI3 = ['2026-04', '2026-05', '2026-06'];
const MEISAI_MAE = await MEISAI_HIKAE(TSUKI3);
const soukoMae = await KAZOERU();
console.log('  倉庫（前） … ' + (soukoMae.ok
  ? '人 ' + soukoMae.hito + ' ／ 明細 ' + soukoMae.meisai
  : '🟡 ★読めない★ ' + soukoMae.naze));

const ctx = await b.newContext({ viewport: { width: 1200, height: 1500 }, acceptDownloads: true });
const pg = await ctx.newPage();
const h = await hairu(pg, 'http://localhost:' + PORT + '/kyuyo/index.html', '.bn[data-scr="scr-settings"]');
if (!h.haitta) {
  console.log('  🟡 ★はかれない★ ' + h.kai + '回 試して 入れなかった');
  await b.close(); srv.close(); process.exit(2);
}
await machi(700);

/* ★名前に 印★＝次に 掃除する人が 迷わない（指示役1 の 条件） */
/* ★姓と名の 間は 全角スペース 1つ★（原文 項番7「１個以上の連続しない全角スペース」）＝
   ★印は 残す★（次に 掃除する人が 迷わない）＝姓に 印・名に 日付 */
const NA = '確定テスト' + Z + '九一四';
/* ★項番5 被保険者整理番号＝6バイト以内★（押した後の 門が そう 言った・原文の 検め）
   ⇒ ★5桁★に する。★紙の 中で 探す 字★（今日 作った 欄に 打つ） */
const SEIRI = '86753';

try {
  /* ── 人を 1人 足して 埋める ──────────────────────────── */
  await osu(pg, '.bn[data-scr="scr-settings"]'); await machi(500);
  await osu(pg, '#set-seg .seg-b[data-set="emp"]'); await machi(800);
  /* ★★札が 増えるのを 待つ（2026-09-14 CIで 捕まった）★★
     前は ★足して 0.9秒 待つだけ★で 一番 後ろの 札を 読んでいた。
     ★CI は 遅い★ので 描き直しが 間に合わず、★増える前の 札★を 掴んだ:
       「（はじめに 居た 人 1人 → 今 足した 人＝★札 0番目★）」
       ⇒ その後 ★欄が 1つも 見つからない★（name/kana/… 全部）＝赤。
     ＝★手元は 緑・CIは 赤★の 一番 見つけにくい 形（今日 3回目）。
     ⇒ ★数が 増えた事を 見てから 読む★（★時間では なく 数で 待つ★）。 */
    {
      const kazuMae = await pg.evaluate(() => document.querySelectorAll('#emp-list .mco').length);
      await osu(pg, '#b-add-emp');
      let fueta = false;
      for (let i = 0; i < 40; i++) {                 /* 20秒 */
        const n = await pg.evaluate(() => document.querySelectorAll('#emp-list .mco').length).catch(() => -1);
        if (n > kazuMae) { fueta = true; break; }
        await machi(500);
      }
      if (!fueta) console.log('       🟡 ★札が 増えない★（20秒 待った）＝この先は 当てに ならない');
      await machi(400);
    }
  const IDX = await pg.evaluate(() => {
    const c = Array.from(document.querySelectorAll('#emp-list .mco'));
    return c.length ? c[c.length - 1].getAttribute('data-i') : null;
  });
  if (IDX === null) { MI('従業員の 札が 1枚も 無い'); throw new Error('skip'); }
  const CARD = '#emp-list .mco[data-i="' + IDX + '"]';

  const nage = (c, sel) => pg.evaluate((a) => {
    const card = document.querySelector(a.c);
    const el = card && card.querySelector(a.sel);
    if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return !!el;
  }, { c, sel }).catch(() => false);
  const aruka = (sel) => pg.evaluate((x) => !!document.querySelector(x), sel).catch(() => false);
  const dsAkeru = async () => {
    for (let i = 0; i < 3; i++) {
      if (await aruka(CARD + ' [data-dsub]')) return true;
      await nage(CARD, '.emp-dtgl[data-dtoggle]'); await machi(900);
    }
    return aruka(CARD + ' [data-dsub]');
  };
  const akeru = async (k) => {
    await pg.evaluate((x) => {
      const card = document.querySelector(x.c); if (!card) return;
      const t = Array.from(card.querySelectorAll('[data-dsub]')).find((e) => String(e.getAttribute('data-dsub')).endsWith(':' + x.k));
      if (t) t.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }, { c: CARD, k }).catch(() => null);
    await machi(700);
  };
  const hiraku = async (sel) => {
    for (const k of ['zaiseki', 'zei', 'shaho', 'teate', 'kazoku']) {
      if (await aruka(sel)) break;
      await akeru(k);
    }
    return aruka(sel);
  };

  await dsAkeru();
  for (const [f, v] of [['name', NA], ['kana', 'ｶｸﾃｲ ﾃｽﾄ'], ['birthYmd', '1985-05-15'],
    ['joinYmd', '2025-04-01'], ['seibetsu', 'male'], ['zip', '790-0001'],
    ['address', '愛媛県松山市1-2-3'], ['kisoNenkin', '1234-567890'], ['base', '260000']]) {
    await hiraku(CARD + ' [data-f="' + f + '"]');
    if (!(await utsu(pg, CARD + ' [data-f="' + f + '"]', v))) console.log('       🟡 欄が 無い … ' + f);
  }
  /* ★今日 作った 欄★＝ここに 打った 字が 紙まで 届くかを 見る */
  await hiraku(CARD + ' [data-f="hokenshaNo"]');
  T('★① 被保険者整理番号の 欄に 打てる', await utsu(pg, CARD + ' [data-f="hokenshaNo"]', SEIRI), '欄が 無い／打てない');
  /* ★従前の 改定月★＝★これも 今日 作った 欄★（無いと 算定も 月変も 1枚も 出ない）
     原文＝どちらの 様式も ★項番15〜17「従前改定年月」＝必須★ */
  /* ★★選ぶ箱で 入れる（2026-09-14 見張りに 直させられた）★★
     はじめ type="month" で 作ったが ★iPhone の Safari は 持っていない★＝見張りが 赤に した。
     ⇒ 変動月と 同じ ★data-ym★に した＝ym-picker が ★隣に 選ぶ箱（.ym-one）を 作る★。
     ⇒ ★試験も お客さんと 同じ 箱を 選ぶ★（隠れた 方を 触らない＝今日の 学び）。 */
  await hiraku(CARD + ' [data-f="zenzenKaiteiYmd"]');
  const zenzenRan = CARD + ' [data-f="zenzenKaiteiYmd"]';
  const zenzenHako = await pg.evaluate((sel) => {
    const e = document.querySelector(sel);
    const w = e && e.previousElementSibling;
    const sel2 = w && w.querySelector ? w.querySelector('.ym-one') : null;
    if (!sel2) return null;
    sel2.setAttribute('data-zenzen-hako', '1');
    return true;
  }, zenzenRan).catch(() => null);
  T('★①-2 従前の 改定月に ★選ぶ箱★が 在る（iPhone でも 選べる）', !!zenzenHako, '箱が 作られていない');
  T('★①-3 その 箱で 選べる',
    zenzenHako ? await utsu(pg, CARD + ' [data-zenzen-hako]', '2025-09') : false, '選べない');

  /* ── 月額変更届の 材料（随時改定）を 画面から 入れる ──────────────
     ★随時改定＝給料が 変わった時★＝要る物は 3つ（app.js の 画面が そう 聞いている）:
       ・変動があった月（.sh-henko）　・従前の標準報酬月額（.sh-prevhyojun）
       ・固定的賃金の 変動が 在ったか（[data-shfixed]）
     ★これを 入れないと 月額変更届の 画面に ボタン自体が 出ない★（実測＝「（無い）」だった）。 */
  await nage(CARD, '[data-shd]'); await machi(800);
  await pg.evaluate((sel) => {
    const c = document.querySelector(sel); if (!c) return;
    const t = Array.from(c.querySelectorAll('.sh-mode')).find((e) => e.getAttribute('data-mode') === 'zuiji');
    if (t) t.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, CARD).catch(() => null);
  await machi(900);
  /* ★★変動月は「隠れた 欄」では なく「選ぶ箱」で 入れる（2026-09-14 読んで 分かった）★★
     input は type=hidden だが、★js/ym-picker.js が その 隣に select（.ym-one）を 作る★
     （enhance()＝input[data-ym] を 見つけて 箱を 差し込む・MutationObserver で 描き直しにも 追う）。
     ⇒ ★客は ちゃんと 入れられる★＝★項番8・従前の改定月と 同じ型では なかった★。
       （★私の 打ち方が 隠れた 方を 触っていた★＝試験の 側の 誤り）
     ⇒ ★お客さんと 同じ 箱（.ym-one）を 選ぶ★＝これが 本物の 道。 */
  /* ★開いているかを 数で 見る★＝★当て推量で 打たない★（今日の 決まり） */
  const zSugata = await pg.evaluate((sel) => {
    const c = document.querySelector(sel); if (!c) return { err: '札が 無い' };
    const mode = Array.from(c.querySelectorAll('.sh-mode')).map((e) => e.getAttribute('data-mode') + (e.className.indexOf('on') >= 0 ? '★' : ''));
    return { shd: c.querySelectorAll('[data-shd]').length, mode,
      zk: c.querySelectorAll('.zk-inp').length,
      ymOne: c.querySelectorAll('.ym-one').length,
      henko: c.querySelectorAll('.sh-henko').length,
      prev: c.querySelectorAll('.sh-prevhyojun').length,
      fixed: c.querySelectorAll('[data-shfixed]').length };
  }, CARD).catch((e) => ({ err: String(e).slice(0, 60) }));
  console.log('       随時改定の 姿 … ' + JSON.stringify(zSugata));
  const zHenko = await utsu(pg, CARD + ' .zk-inp .ym-one', '2026-04');
  await machi(800);
  const zPrev = await utsu(pg, CARD + ' .sh-prevhyojun', '220000');
  await pg.evaluate((sel) => {
    const c = document.querySelector(sel); if (!c) return;
    const t = Array.from(c.querySelectorAll('[data-shfixed]')).find((e) => e.getAttribute('data-v') === '1');
    if (t) t.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, CARD).catch(() => null);
  await machi(900);
  /* ★入ったかを 倉庫の 形で 見る★＝★押したつもり★で 次へ 進まない */
  const zIma = await pg.evaluate((n) => {
    const K = window.Kyuyo || {}; const st = K.state || window.state || {};
    const e = (st.employees || [])[n] || {};
    const s2 = e.shaho || {};
    return { mode: s2.mode, henko: s2.henkoYm, prev: s2.prevHyojun, fixed: s2.fixedChanged };
  }, Number(IDX)).catch((er) => ({ err: String(er).slice(0, 60) }));
  console.log('       随時改定の 材料 … ' + JSON.stringify(zIma)
    + '（打てた? 変動月 ' + zHenko + ' ／ 従前 ' + zPrev + '）');

  /* ★★state に 入ったかを ★描き直して 読み戻す★ で 測る（2026-09-16）★★
     ★訳★＝app.js は state を 外に 出していない（zIma が {} に なる）。
     ⇒ ★画面を 1度 離れて 戻す★＝札は state から 描き直される
       ⇒ ★その時 欄に 出る 字＝state の 中身★。
     ＝★「打てた（DOMに 字が 入った）」と「state に 入った」を 分ける★
       （今までは 前者しか 見て いなかった＝★月額変更が はかれない の 正体かも★）。 */
  await osu(pg, '.bn[data-scr="scr-input"]'); await machi(700);
  await osu(pg, '.bn[data-scr="scr-settings"]'); await machi(600);
  await osu(pg, '#set-seg .seg-b[data-set="emp"]'); await machi(900);
  const zNokori = await pg.evaluate((sel) => {
    const c = document.querySelector(sel); if (!c) return { err: '札が 無い' };
    const one = c.querySelector('.zk-inp .ym-one');
    const hid = c.querySelector('.sh-henko');
    const pv = c.querySelector('.sh-prevhyojun');
    const fx = Array.from(c.querySelectorAll('[data-shfixed]')).map((e) => e.getAttribute('data-v') + (e.className.indexOf('on') >= 0 ? '★' : ''));
    const md = Array.from(c.querySelectorAll('.sh-mode')).map((e) => e.getAttribute('data-mode') + (e.className.indexOf('on') >= 0 ? '★' : ''));
    return { henkoHyoji: one ? one.value : '(箱が無い)', henkoKakure: hid ? hid.value : '(欄が無い)',
      prev: pv ? pv.value : '(欄が無い)', fixed: fx, mode: md };
  }, CARD).catch((e) => ({ err: String(e).slice(0, 60) }));
  console.log('       ★描き直した 後★（＝state の 中身）… ' + JSON.stringify(zNokori));

  /* 会社の 都道府県（保険料の 表に 要る） */
  await osu(pg, '#set-seg .seg-b[data-set="company"]'); await machi(700);
  await utsu(pg, '#c-pref', 'ehime');

  /* ── 4〜6月を 画面から 入れて 確定（お客さんの 道） ──────────── */
  const tsukiIreru = async (ym) => {
    await osu(pg, '.bn[data-scr="scr-input"]'); await machi(700);
    const kae = await pg.evaluate((v) => {
      const m = document.querySelector('.scr-month');
      if (!m) return false;
      m.value = v; m.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }, ym).catch(() => false);
    if (!kae) return { ok: false, naze: '対象月の 欄が 無い' };
    await machi(1400);
    /* ★★勤怠を 入れる（2026-09-14 実測で 足した）★★
       入れずに 確定したら、押した後の 門が こう 言った:
         「★4〜6月とも 支払基礎日数が 足りず、電子申請に 出せる人が いませんでした★」
       ＝★算定基礎届は 支払基礎日数 17日以上が 要る★（原文の 相関）。
       ⇒ 画面の ★「カレンダーから 入れる」ボタン★を 押す＝★お客さんも これを 押す★。 */
    const fill = await pg.$('[data-fillsche]');
    if (fill) {
      await fill.click({ timeout: 8000 }).catch(() => null);
      await machi(900);
      await pg.evaluate(() => {
        const y = Array.from(document.querySelectorAll('button')).find((e) => e.offsetParent && /^(OK|はい|入れる|上書き)$/.test(e.textContent.trim()));
        if (y) y.click();
      }).catch(() => null);
      await machi(1400);
    } else console.log('       🟡 ' + ym + ' … カレンダーから 入れる ボタンが 無い');
    /* ★入ったかを 数で 見る★＝★押したつもり★で 次へ 進まない */
    const nissu = await pg.evaluate(() => {
      const K = window.Kyuyo || {};
      const ins = Array.from(document.querySelectorAll('#scr-input input, #view-input input'));
      const atai = ins.map((e) => e.value).filter((v) => /^[0-9]{1,2}$/.test(v)).map(Number);
      return { ran: ins.length, ookii: atai.length ? Math.max.apply(null, atai) : 0 };
    }).catch(() => ({ ran: -1, ookii: -1 }));
    console.log('       ' + ym + ' … 入力の 欄 ' + nissu.ran + '個 ／ 一番 大きい 数 ' + nissu.ookii);
    /* ★本物の click★＝ここは 測る所 */
    const btn = await pg.$('[data-confirm-month]');
    if (!btn) return { ok: false, naze: '「今月を確定」の ボタンが 無い' };
    const osenai = await btn.evaluate((e) => e.disabled);
    if (osenai) {
      const fuda = await btn.evaluate((e) => e.textContent.replace(/\s+/g, ' ').trim());
      return { ok: false, naze: '確定の ボタンが 押せない（' + fuda.slice(0, 60) + '）' };
    }
    await btn.click({ timeout: 8000 }).catch(() => null);
    await machi(900);
    /* 確認の 一枚が 出たら OK を 押す */
    await pg.evaluate(() => {
      const y = Array.from(document.querySelectorAll('button')).find((e) => e.offsetParent && /^(OK|はい|確定)$/.test(e.textContent.trim()));
      if (y) y.click();
    }).catch(() => null);
    await machi(1400);
    return { ok: true };
  };

  let ireta = 0;
  for (const ym of ['2026-04', '2026-05', '2026-06']) {
    const r = await tsukiIreru(ym);
    if (r.ok) { ireta++; console.log('       ' + ym + ' … 確定した'); }
    else console.log('       🟡 ' + ym + ' … ' + r.naze);
  }
  if (ireta < 3) MI('4〜6月の 確定', '★' + ireta + '/3 か月しか 確定できていない＝算定は 測れません★');

  /* ── 算定基礎届 ─────────────────────────────────── */
  /* ★★時間では なく 数で 待つ★★（2026-09-18 CI が 赤に なって 直した）
     ★何が 起きたか★
       CI の WebKit で ★「算定基礎届 … ボタン「（無い）」／押せない null」★＝★押せない のでは なく 描かれて いない★。
       ★手元は 緑★（14 passed／総なめ 32本でも 赤 0）／★前の 回の CI も 緑★
       ⇒ ★機械の 速さの 差★＝★描き終わる 前に 見て いた★
     ★前の 待ち★ … `machi(1600)`＝★決まった 時間★（＋600＋600）
     ⇒ ★★「揺れ」とは 呼ばない★★＝★どれだけ 足りないかを 測る★（09-15 fuyo-ui は 0.7秒／要 18.2秒＝25倍）
     ⇒ ★ボタンが 出るまで 待つ（数で 待つ）★＝★機械の 速さに 左右されない★
     ⇒ ★待った 秒を 出す★＝★次に 見る 人が 比を 出せる★ */
  const matsuMade = async (id, ue = 20000) => {
    const t0 = Date.now();
    for (;;) {
      const aru = await pg.evaluate((x) => !!document.querySelector(x), id).catch(() => false);
      if (aru) return { aru: true, byo: ((Date.now() - t0) / 1000).toFixed(1) };
      if (Date.now() - t0 > ue) return { aru: false, byo: ((Date.now() - t0) / 1000).toFixed(1) };
      await machi(200);
    }
  };
  const chohyo = async (which, btnId) => {
    await osu(pg, '.bn[data-scr="scr-list"]'); await machi(600);
    await osu(pg, '.seg-b[data-view="cho"]'); await machi(600);
    await osu(pg, '.seg-b[data-cho="' + which + '"]');
    const m = await matsuMade(btnId);
    console.log('       ' + which + ' … ★ボタンが 出るまで ' + m.byo + '秒★'
      + (m.aru ? '' : '（★20秒 待っても 出ない★）') + '（前は 決まった 1.6秒だけ 待って いた）');
    return pg.evaluate((id) => {
      const btn = document.querySelector(id);
      const c = document.querySelector('#view-cho');
      return { fuda: btn ? btn.textContent.trim() : '（無い）', osenai: btn ? btn.disabled : null,
        chui: Array.from(c ? c.querySelectorAll('.cr-warn') : []).map((x) => x.textContent.replace(/\s+/g, ' ').trim()).slice(0, 2) };
    }, btnId);
  };

  const osuToOchiru = async (btnId, yoshiki, na, retsuHazu) => {
    const [dl] = await Promise.all([
      pg.waitForEvent('download', { timeout: 25000 }).catch(() => null),
      pg.click(btnId, { timeout: 8000 }).catch(() => null),
    ]);
    if (!dl) {
      /* ★落ちない時は ★画面が 何と 言ったか★を 読む★＝
         押した後の 門は uiAlert で 訳を 出す（[[feedback_botan_to_mon_no_kuchiura]]）。 */
      const iiwake = await pg.evaluate(() => {
        const t = Array.from(document.querySelectorAll('.ui-alert, .modal, .ov, [role="dialog"]'))
          .map((e) => e.textContent.replace(/\s+/g, ' ').trim()).filter((x) => x).join(' ／ ');
        return t.slice(0, 420);
      }).catch(() => '');
      T('★' + na + '＝押したら 本当に 落ちる', false,
        'ファイルが 落ちてこない' + (iiwake ? '　★押した後の 言い分★ … ' + iiwake : '　（画面も 何も 言っていない）'));
      return;
    }
    T('★' + na + '＝押したら 本当に 落ちる', true);
    const fp = await dl.path();
    const buf = fp ? fs.readFileSync(fp) : Buffer.alloc(0);
    const m = csvMiru(buf.toString('latin1'), yoshiki);
    console.log('       落ちた … ' + dl.suggestedFilename() + ' ' + buf.length + 'バイト sha256 ' + sha(buf)
      + ' ／ 行' + m.gyo + ' データ' + m.data + ' 列' + m.retsu + ' ずれ' + m.zure
      + ' 整理番号[' + m.seiri.join(' ') + ']');
    T('★' + na + '＝名前が SHFD0006.CSV', dl.suggestedFilename() === 'SHFD0006.CSV', '落ちた 名前は ' + dl.suggestedFilename());
    T('★' + na + '＝様式 ' + yoshiki + ' の 行が 1本以上', m.data >= 1, 'データ行 ' + m.data + '本');
    T('★' + na + '＝' + retsuHazu + '列（ずれ 0）', m.retsu === retsuHazu && m.zure === 0, '列 ' + m.retsu + '／ずれ ' + m.zure);
    T('★' + na + '＝★今日 作った 欄の 字（' + SEIRI + '）が 紙に 入っている', m.seiri.indexOf(SEIRI) >= 0,
      '紙の 項番5 は [' + m.seiri.join(' ') + ']');
  };

  if (ireta >= 3) {
    const s = await chohyo('santei', '#b-santei-csv');
    console.log('  ── 算定基礎届 … ボタン「' + s.fuda + '」／押せない ' + s.osenai);
    if (s.chui.length) console.log('       画面の 言い分 … ' + s.chui.join(' ／ ').slice(0, 200));
    if (s.osenai === false) await osuToOchiru('#b-santei-csv', '2225700', '算定基礎届', 53);
    else T('★算定基礎届＝ボタンが 押せる', false, '押せない（上の 言い分を 見る）');
  } else MI('算定基礎届', '4〜6月が 揃っていない＝材料が 無い（★アプリの 穴では ない★）');

  /* ── 月額変更届 ─────────────────────────────────── */
  const g = await chohyo('gekkaku', '#b-gekkaku-csv');
  /* ★★どこで 落ちたかを 名指しする（2026-09-14・★切り替えた 後に 測る★）★★
     gekkakuRows（app.js 3109）が 人を 落とす 条件は 3つ:
       ①isActiveInMonth(e, state.month)   ②s.henkoYm が 在る
       ③s.fixedChanged か prevHyojun>0
     ★「ボタンが 出ない」だけでは ①か②か③か 分からない★＝1つずつ 数える。 */
  const ochita = await pg.evaluate(() => {
    const K = window.Kyuyo || {};
    const rows = (K.gekkakuRows && K.state) ? null : null;
    /* ★state を 外に 出していない★ので、画面に 出ている 字から 数える */
    const c = document.querySelector('#view-cho');
    const hyou = c ? Array.from(c.querySelectorAll('table')) : [];
    return { hako: c ? c.querySelectorAll('.card').length : -1,
      hyouKazu: hyou.length,
      midashi: hyou.map((t) => Array.from(t.querySelectorAll('th')).slice(0, 2).map((x) => x.textContent.trim()).join('/')),
      ji: c ? c.textContent.replace(/\s+/g, ' ').trim().slice(0, 160) : '' };
  }).catch((e) => ({ err: String(e).slice(0, 60) }));
  console.log('       月額変更の 画面 … ' + JSON.stringify(ochita));
  console.log('  ── 月額変更届 … ボタン「' + g.fuda + '」／押せない ' + g.osenai);
  if (g.chui.length) console.log('       画面の 言い分 … ' + g.chui.join(' ／ ').slice(0, 200));
  if (g.osenai === false) await osuToOchiru('#b-gekkaku-csv', '2221700', '月額変更届', 49);
  else MI('月額変更届', '★材料は 入ったのに 画面に ボタンが 1つも 出ない★'
    + '（実測＝随時改定 ON ／ 変動月 入った ／ 従前の標準報酬 入った ／ 固定給変動の ボタン 2個 在り）。'
    + '★どちらとも まだ 言えません★＝'
    + '①この 組み合わせでは 出ないのが 正しい（該当しない）か ②出るべきなのに 出ないか。'
    + '★次にやる事★＝gekkakuRows が 人を 落とす 条件（在籍月・3か月の 確定明細・2等級差）を '
    + '1つずつ 欠けさせて 数える＝★どこで 落ちたかを 名指しする★');
} catch (e) {
  if (e && e.message !== 'skip') { fail++; console.log('  ✗ 途中で 止まった … ' + (e && e.message)); }
} finally {
  /* ★★後始末＝まず 客の 道で★★（2026-09-15・裏口を 閉じた）
     前は ★いきなり 倉庫から 直に 消して★ いた（訳＝「確定した人は 画面から 消せない」）。
     ⇒ ★アプリには 逃げ道が 在った★＝★「この月の確定を取り消す」（app.js 2417）★
        ＝2026-09-07 司さん「やって」で 足した 物を ★在るのに 使っていなかった★。
     ★`data-undo-month` は 今 選んでいる 1か月だけ★（app.js 5461 `var ym=state.month;`）
     ⇒ この 試験は ★4・5・6月の 3か月★を 確定するので ★3回 取り消す★（tsuki で 渡す）。 */
  const kt = await KATAZUKERU(pg, { na: NA, machi, osu, tsuki: TSUKI3 });
  kt.michi.forEach((m) => console.log('       片づけ … ' + m));
  if (!kt.ok) {
    /* ★★裏口＝ここだけ 残す（2026-09-15・指示役1 と 決めた）★★
       ★客の 道で 消せなかった時だけ 使う／使ったら 必ず 大きく 出す★
       ＝★黙って 使うと「片づけたつもり」に なる★（今日 何度も 出た型）。
       ★この 裏口を 外す 条件★＝★客の 道で 毎回 消えるように なったら★ この if ごと 消す。 */
    console.log('       🟡🟡 ★客の 道で 消せなかった＝裏口を 使いました★ … ' + kt.naze);
    const kesu = await SUJI_KESU(NA);
    if (!kesu.ok) console.log('       🟡 印の 人を 消せなかった … ' + kesu.naze);
    else console.log('       片づけ … 印「' + NA + '」の 人と 明細を ★倉庫から 直に★ 消した');
  }
  /* ★★ここは 裏口を 残す（2026-09-15・指示役1 と 決めた）★★
     ★訳＝アプリに 明細を 消す 道が 無い★（字で 数えた）:
       ・app.js 5355〜 の「この従業員を削除」は ★state.employees から 抜くだけ★
       ・store.js:206 が pay_employees の 行は 本当に 消す
       ・★pay_payslips を delete している 所は 1か所も 無い★
         （消しているのは payslip_batches:87 と pay_meisai_docs:448 だけ）
     ⇒ ★人は 消える／明細は 倉庫に 残る＝孤児に なる★。
       ★実測（2026-09-15・本物の click 1回）★ … 人 4→3 なのに ★孤児 3,716→3,717＝+1★。
     ⇒ ★客にも 起きる 欠陥＝別件（司さん待ち・指示役1 が 持つ）★。
     ★★この 裏口を 外す 条件★★
       ＝★アプリが 削除の時に その人の pay_payslips も 消すように なったら★ ここを 消す。
     ★条件を 書かない 裏口は 永久に 残る★。 */
  await GOMI_KESU(HAJIME);
  /* ★確定は 在籍者 全員に 付く★＝この回で 書かれた 明細を まとめて 消す（同じ 外す条件） */
  const mk = await MEISAI_KESU(MEISAI_MAE, TSUKI3);
  if (!mk.ok) console.log('       🟡 この回の 明細を 消せなかった … ' + mk.naze);
  /* ★この回で 増えた「確定」と「公開」を 戻す★（★控えに 在る 物は 触らない★） */
  const km = await KAKUTEI_MODOSU(KAKUTEI_MAE);
  console.log('       片づけ … ' + (km.ok ? '★この回で 付いた 確定 ' + km.n + '件を 外した★'
    : '🟡 確定を 戻せなかった … ' + km.naze));
  const ks = await KAISHA_MODOSU(KAISHA_MAE);
  console.log('       片づけ … ' + (ks.ok ? '★会社の 欄を 控えに 戻した ' + ks.n + '行★（媒体通番は 戻さない）'
    : '🟡 会社の 欄を 戻せなかった … ' + ks.naze));
  const kk = await KOUKAI_KESU(KOUKAI_MAE);
  console.log('       片づけ … ' + (kk.ok ? '★この回で 出来た 公開 … 紙 ' + kk.kami + '枚／鍵 ' + kk.kagi + '行を 消した★'
    : '🟡 公開を 戻せなかった … ' + kk.naze));
  await b.close().catch(() => null);
  srv.close();
}

/* ★本当の 判じは 倉庫★＝画面の 数では 見ない */
{
  const sou = await AWASERU(soukoMae, 20);
  /* ★この環境では 測れない（鍵が 無い）★＝★緑で 通すが 数は 出す★（他の 4本と 同じ 決め方）
     ★直し漏らし 2本目★＝1本ずつ 直すと 必ず 漏れる。★同じ 決め方を 使う 所を 先に 数える★。 */
  if (sou.han === '環境') { mi++; console.log('  ' + sou.iu); }
  else if (sou.han === 'はかれない' || sou.han === '未測定') { mi++; console.log('  🟡 ★はかれない★ 後始末を 倉庫で 数えられない … ' + sou.iu); }
  else if (sou.han === '緑') { pass++; console.log('  ✓ ★後始末＝★倉庫の 行数★が 元に 戻った'); console.log('       ' + sou.iu); }
  else { fail++; console.log('  ✗ ★後始末＝★倉庫の 行数★が 元に 戻った — ' + sou.iu); }
}
console.log(NL + pass + ' passed, ' + fail + ' failed, ' + mi + ' はかれない');
process.exit(fail ? 1 : 0);
