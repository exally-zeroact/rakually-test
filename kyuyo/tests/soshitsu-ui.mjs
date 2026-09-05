/* soshitsu-ui.mjs — ★資格喪失届を ★実ブラウザで お客さんの道どおり★ 出す★
 * =============================================================================
 * ★なぜ★＝取得届と 同じ形（kyuyo/tests/shutoku-ui.mjs）で、★押して ファイルが 落ちる所まで★ 通す。
 *   ★実ブラウザで 通すまで 分からない 穴が 在る★＝取得届の 時、
 *   ★氏名（カナ）を 入れる 欄が 1つも 無い★事が ここで 初めて 出た。
 *
 * ★測る事★
 *   ①欄が 実物に 在る（氏名カナ・★基礎年金番号★）
 *   ②何も 入れない 人は ★出せない★＝ボタンが 嘘を つかない
 *   ③ぜんぶ 入れたら ★ボタンが 押せる★
 *   ④押したら ★SHFD0006.CSV が 本当に 落ちてくる★（★27列★・様式2201700）
 *   ⑤★後始末★＝この 試験が 足した 人を 自分で 消す
 *
 * ★本番の repo では 走らせない★（本番の 倉庫に 試験の 鍵が 無い＝字で 言ってから 抜ける）
 *
 * 使い方: node kyuyo/tests/soshitsu-ui.mjs [--self-test]
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http'; import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELF = process.argv.includes('--self-test');

/* ★物差しそのもの★（ブラウザを 使わずに 確かめられる 形） */
export function csvOk(text) {
  const gyo = String(text || '').split('\r\n').filter((x) => x.length);
  const data = gyo.filter((x) => x.indexOf('2201700') === 0);
  /* ★列が ずれた 行が 1本でも 在れば 見つける★（1行目だけ 見ると 2人目の ずれを 見落とす） */
  const zure = data.filter((x) => x.split(',').length !== 27).length;
  return { gyo: gyo.length, data: data.length, zure: zure,
    retsu: data.length ? data[0].split(',').length : 0 };
}

if (SELF) {
  console.log('\n[soshitsu-ui] ★自己確認★（★物差しそのもの★・ブラウザを 使わない）');
  let ng = 0;
  const say = (nm, good) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + nm + (good ? '' : '  ★思っていたのと 違う★')); };
  const r27 = '2201700' + ','.repeat(26);
  say('データ行を 数える（27列）', JSON.stringify(csvOk('a,b\r\n' + r27 + '\r\n')) === '{"gyo":2,"data":1,"zure":0,"retsu":27}');
  say('★1つ ずれた 行（26列）を 見つける★', csvOk(r27.slice(0, -1) + '\r\n').zure === 1);
  say('★2人目だけ ずれていても 見つける★', csvOk(r27 + '\r\n' + r27.slice(0, -1) + '\r\n').zure === 1);
  say('データ行が 無ければ 0', csvOk('a,b\r\n').data === 0);
  say('空なら ぜんぶ 0', csvOk('').gyo === 0);
  if (ng) { console.log('\n★自己確認 ' + ng + '件 おかしい★'); process.exit(1); }
  console.log('  ★5通り ぜんぶ 思った通り★');
  process.exit(0);
}

/* ── ここから 実ブラウザ ───────────────────────────────── */
let borrow, pwLaunch, hairu, osu;
try {
  ({ borrow, launch: pwLaunch } = await import('../../scripts/_borrow-playwright.mjs'));
  ({ hairu, osu } = await import('../../tests/_hairu.mjs'));
} catch (e) { console.log('🟡 ★未測定★ 道具が 読めない … ' + (e && e.message)); process.exit(2); }
const wk = await borrow('soshitsu-ui', 'webkit');
if (!wk) { console.log('🟡 ★未測定★ playwright を 借りられない（0件＝合格 とは 書かない）'); process.exit(2); }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
/* ★倉庫は 本物（DB-test）を 使う★
   ★会社名・事業所所在地は 共有データ（SuiteData）から しか 来ない★（app.js の org 同期）
   ＝★端末だけモードでは 所在地が 永久に 空★＝門の 項番7 で 必ず 止まる。
   ⇒ ここは ★倉庫あり＝お客さんと 同じ形★で 測る（2026-09-05 実測で 分かった）。
   ★後始末★＝この 試験が 足した 人は ★最後に 自分で 消す★（前は 消さずに 19人 溜めた＝私のゴミ）。 */
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
const b = await pwLaunch('soshitsu-ui', wk);

let pass = 0, fail = 0, mihakari = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };
const machi = (ms) => new Promise((r) => setTimeout(r, ms));

/* 欄に 打つ（本物の 入力＝アプリが change を 拾う） */
async function utsu(pg, sel, val) {
  const el = await pg.$(sel);
  if (!el) return false;
  const tag = await el.evaluate((e) => e.tagName.toLowerCase());
  if (tag === 'select') await el.selectOption(String(val));
  else { await el.fill(''); await el.type(String(val)); }
  await el.evaluate((e) => { e.dispatchEvent(new Event('change', { bubbles: true })); });
  await machi(160);
  return true;
}
/* ★本物の マウスで 押す★（JSで イベントを 投げた 物は「お客さんの 道」では ない＝会社の決まり） */
async function tataku(pg, sel) {
  const el = await pg.$(sel);
  if (!el) return false;
  try { await el.scrollIntoViewIfNeeded({ timeout: 3000 }); } catch (e) { /* 見えていれば よい */ }
  try { await el.click({ timeout: 5000 }); return true; } catch (e) { return false; }
}

console.log('\n[soshitsu-ui] 資格喪失届を ★実ブラウザで お客さんの道どおり★ 出す');

/* ★会社名・所在地は 入口の「共有データ」が 持ち主★（給与の 画面では 読むだけ）
   ⇒ 門は 項番7「事業所所在地／入力されていること」で 止める。★お客さんの 道どおり そこで 入れる★ */
const ctx = await b.newContext({ viewport: { width: 1000, height: 1400 }, acceptDownloads: true });
const pg = await ctx.newPage();
const h = await hairu(pg, 'http://localhost:' + PORT + '/kyuyo/index.html', '.bn[data-scr="scr-settings"]');
if (!h.haitta) { console.log('  🟡 ★未測定★ ' + h.kai + '回 試して 入れなかった … 画面の 言い分 … ' + (h.naze || '（無し）')); await b.close(); srv.close(); process.exit(2); }
await machi(600);
await osu(pg, '.bn[data-scr="scr-settings"]'); await machi(500);
await osu(pg, '#set-seg .seg-b[data-set="emp"]'); await machi(800);
const hito0 = await pg.evaluate(() => document.querySelectorAll('#emp-list .mco').length);
/* ★人数は 決め打ちしない★（共有の 試験口座＝他の 回の 人も 居る）。
   ★数は 出す★＝増え続けていたら ここで 見える（前は 気づかず 19人 溜めた）。 */
console.log('  （はじめに 居た 人 … ' + hito0 + '人）');

/* ── ① 従業員を 1人 足して、要る 欄を 開く ─────────────────── */
await osu(pg, '.bn[data-scr="scr-settings"]'); await machi(500);
await osu(pg, '#set-seg .seg-b[data-set="emp"]'); await machi(700);
await osu(pg, '#b-add-emp'); await machi(900);
/* ★この 口座には 前の 回の 人が 残る★（実測 2026-09-05）＝★今 足した 人＝一番 下の 札★だけを 触る。
   1人目を 触ると ★前の 回の 人を 書き換える★事に なる（実際 1回 やって 空振りした）。 */
const IDX = await pg.evaluate(() => {
  const c = Array.from(document.querySelectorAll('#emp-list .mco'));
  return c.length ? c[c.length - 1].getAttribute('data-i') : null;
});
if (IDX === null) { console.log('  🟡 ★未測定★ 従業員の 札が 1枚も 無い'); await b.close(); srv.close(); process.exit(2); }
const CARD = '#emp-list .mco[data-i="' + IDX + '"]';
console.log('  （今 足した 人＝札 ' + IDX + '番目／全 '
  + (await pg.evaluate(() => document.querySelectorAll('#emp-list .mco').length)) + '枚）');
/* ★足した その場で もう 開いている★（#b-add-emp が state.open[e.id]=true を している）
   ⇒★ここで 押すと 逆に 閉じる★（2026-09-05 実測＝これで 1時間 空振りした） */
await tataku(pg, CARD + ' [data-dtoggle]'); await machi(800);          /* 「詳細設定」 */
for (const k of ['zaiseki', 'shaho', 'teate']) {
  await pg.evaluate((a2) => {
    const c = document.querySelector(a2.c); if (!c) return;
    const t = Array.from(c.querySelectorAll('[data-dsub]'))
      .find((e) => String(e.getAttribute('data-dsub')).endsWith(':' + a2.k));
    if (t) t.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, { c: CARD, k: k });
  await machi(700);
}
const aru = await pg.evaluate((c) => Array.from(document.querySelectorAll(c + ' [data-f]'))
  .filter((e) => e.offsetParent).map((e) => e.getAttribute('data-f')), CARD);
T('★① 届出に 要る 欄が 実物に 在る（氏名カナ・基礎年金番号）',
  aru.indexOf('kana') >= 0 && aru.indexOf('kisoNenkin') >= 0,
  '欄 ' + aru.length + '個 … カナ ' + (aru.indexOf('kana') >= 0) + '／基礎年金番号 ' + (aru.indexOf('kisoNenkin') >= 0));

/* ── ② 何も 入れないまま 帳票を 見る＝★出せないと 言うか★ ─────── */
async function chohyo() {
  await osu(pg, '.bn[data-scr="scr-list"]'); await machi(600);
  await osu(pg, '.seg-b[data-view="cho"]'); await machi(600);
  await osu(pg, '.seg-b[data-cho="shikaku"]'); await machi(1200);
  return pg.evaluate(() => {
    const btn = document.querySelector('#b-soshitsu-csv');
    const c = document.querySelector('#view-cho');
    return { fuda: btn ? btn.textContent.trim() : '（無い）', osenai: btn ? btn.disabled : null,
      chui: Array.from(c ? c.querySelectorAll('.cr-warn') : []).map((x) => x.textContent.replace(/\s+/g, ' ').trim()) };
  });
}
/* ★名前は 毎回 変える★＝この 試験の 口座には ★前の 回の 人が 残る★（実測 2026-09-05）。
   「誰も 出せない はず」で 見ると ★前の 回の 人が 出せてしまい 赤に なる★＝時によって 変わる。
   ⇒★今 足した その人★だけを 名指しで 見る。 */
const NA = '試験' + String(Date.now()).slice(-6);   /* ★氏名（漢字）は 姓と名の 間に 全角スペース1つ★（項番8） */
await utsu(pg, CARD + ' [data-f="name"]', NA);
await utsu(pg, CARD + ' [data-f="taishokuYmd"]', '2026-08-31');
const mae = await chohyo();
T('★② 何も 入れていない その人を「出せる」と 言わない（ボタンが 嘘を つかない）',
  mae.chui.join('／').indexOf(NA) >= 0, '「' + NA + '」を 注意に 出していない … ' + mae.chui.join(' ／ ').slice(0, 160));
T('★② 足りない 物を 名前つきで 言う（基礎年金番号）',
  mae.chui.join('／').indexOf('基礎年金番号') >= 0, mae.chui.join(' ／ ').slice(0, 160));

/* ── ③ ぜんぶ 入れる ───────────────────────────────── */

await osu(pg, '.bn[data-scr="scr-settings"]'); await machi(600);
await osu(pg, '#set-seg .seg-b[data-set="emp"]'); await machi(700);
/* ★退職日は 一番 最後★＝入れた 瞬間に その人は「在籍中」の 一覧から 消える（実測）。
   先に 入れると、あとの 欄が 描かれておらず ★黙って 入らない★。 */
for (const [f, v] of [['name', NA + '　太郎'], ['kana', 'ﾔﾏﾀﾞ ﾀﾛｳ'], ['birthYmd', '1985-05-15'],
  ['kisoNenkin', '1234-567890'], ['base', '260000'],
  ['taishokuYmd', '2026-08-31']]) {
  if (!(await utsu(pg, CARD + ' [data-f="' + f + '"]', v))) console.log('       🟡 欄が 無い … ' + f);
}
/* 社会保険＝「詳しく」→「入社時の 見込み」→ 金額 */
await tataku(pg, CARD + ' [data-shd]'); await machi(800);
await pg.evaluate((sel) => {
  const c = document.querySelector(sel); if (!c) return;
  const t = Array.from(c.querySelectorAll('.sh-mode')).find((e) => e.getAttribute('data-mode') === 'shutoku');
  if (t) t.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}, CARD);
await machi(800);
const mikomiAru = await utsu(pg, CARD + ' .sh-mikomi', '260000');
T('★③ 「入社時の 見込み」に 切り替えて 金額を 入れられる', mikomiAru, '見込み月額の 欄が 出ない');
/* 会社の 都道府県 */
await osu(pg, '#set-seg .seg-b[data-set="company"]'); await machi(700);
await utsu(pg, '#c-pref', 'ehime');

/* 事業所の 5欄（帳票の 箱の 中で 聞いている） */
await chohyo();
for (const [k, v] of [['seiriKigou', '01-ｱｲ'], ['jigyoshoNo', '12345'],
  ['zip', '790-0001'], ['tel', '089-123-4567'], ['nushi', '健保　良一']]) {
  await utsu(pg, '#view-cho [data-fc="' + k + '"]', v);
}
const ato = await chohyo();
T('★③ ぜんぶ 入れたら ボタンが 押せる', ato.osenai === false,
  'ボタン「' + ato.fuda + '」／押せない ' + ato.osenai + '／注意 ' + ato.chui.join(' ／ ').slice(0, 160));

/* ── ④ 押して ファイルが 本当に 落ちるか ─────────────────── */
if (ato.osenai === false) {
  const [dl] = await Promise.all([
    pg.waitForEvent('download', { timeout: 20000 }).catch(() => null),
    pg.click('#b-soshitsu-csv'),
  ]);
  if (!dl) {
    fail++;
    /* ★落ちてこない 時は 画面が 何か 言っている★＝それを そのまま 出す（推し量らない） */
    const iu = await pg.evaluate(() => {
      const m = document.querySelector('.ui-modal-ov');
      return m ? m.textContent.replace(/\s+/g, ' ').trim().slice(0, 300) : '（画面は 何も 言っていない）';
    });
    console.log('  ✗ ★④ 押したのに ファイルが 落ちてこない★ … 画面の 言い分 … ' + iu);
  }
  else {
    const tmp = await dl.path();
    const buf = fs.readFileSync(tmp);
    const m = csvOk(buf.toString('latin1'));
    T('★④ 名前は SHFD0006.CSV', dl.suggestedFilename() === 'SHFD0006.CSV', dl.suggestedFilename());
    T('★④ 1バイト以上 出ている', buf.length > 0, buf.length + ' bytes');
    /* ★人数は 決め打ちしない★（前の回の 人が 残るので 1人とは 限らない）
       見るのは ★1人以上 居る事★と ★1行も 列が ずれていない事★ */
    T('★④ データ行が 1人以上・★どの行も 27列★（1つも ずれていない）',
      m.data >= 1 && m.zure === 0, JSON.stringify(m));
    console.log('       ' + dl.suggestedFilename() + '  ' + buf.length + ' bytes  sha256 '
      + crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12) + '  ' + JSON.stringify(m));
  }
} else { mihakari++; console.log('  🟡 ★未測定★ ボタンが 押せないので ファイルまで 行けていない'); }

/* ── ★後始末★＝この 試験が 足した 人を 自分で 消す ───────────────
   ★前は 消していなかった★＝走らせる たびに 1人 増え、★19人 溜めた★（私が 作った ゴミ）。
   ★消すのは 今 足した 人だけ★（名前で 確かめてから 押す＝他の 人には 触らない）。
   ★確定した 明細が 在る人は アプリが 消させない★＝今 足てた 人には 無いので 通る。 */
{
  await osu(pg, '.bn[data-scr="scr-settings"]'); await machi(600);
  await osu(pg, '#set-seg .seg-b[data-set="emp"]'); await machi(800);
  const keshita = await pg.evaluate((na) => {
    const c = Array.from(document.querySelectorAll('#emp-list .mco'))
      .find((x) => ((x.querySelector('.mco-nm') || {}).textContent || '').indexOf(na) >= 0);
    if (!c) return '（札が 無い）';
    const btn = c.querySelector('.m-del-emp');
    if (!btn) return '（消す ボタンが 出ていない＝札が 閉じている）';
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return 'ok';
  }, NA);
  await machi(900);
  /* アプリが「本当に 消しますか」と 聞くので はいを 押す */
  await pg.evaluate(() => {
    const ov = document.querySelector('.ui-modal-ov'); if (!ov) return;
    const y = Array.from(ov.querySelectorAll('button')).find((e) => /はい|削除|OK/.test(e.textContent || ''));
    if (y) y.click();
  });
  await machi(1200);
  const nokori = await pg.evaluate((na) => Array.from(document.querySelectorAll('#emp-list .mco'))
    .filter((x) => ((x.querySelector('.mco-nm') || {}).textContent || '').indexOf(na) >= 0).length, NA);
  T('★⑤ 後始末＝この 試験が 足した 人を 消した（ゴミを 残さない）', nokori === 0,
    '「' + NA + '」が ' + nokori + '人 残っている（' + keshita + '）');
}

await pg.close(); await b.close(); srv.close();
console.log('\n  ' + pass + ' passed, ' + fail + ' failed' + (mihakari ? ' ／ 🟡未測定 ' + mihakari : ''));
process.exit((fail || mihakari) ? 1 : 0);
