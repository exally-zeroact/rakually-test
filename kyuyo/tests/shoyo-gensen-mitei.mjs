/* shoyo-gensen-mitei.mjs — ★源泉が 決まっていない賞与を「確定」させない★
 * ==============================================================================
 * ★なぜ（司さん 2026-09-06「進めて」＝賞与を 端から端まで 押した日）★
 *   賞与の 源泉所得税は ★前月給与（社会保険料を 引いた後）★で 率が 決まる
 *   （国税庁「賞与に対する源泉徴収税額の算出率の表」）。
 *   前月が 無いと 率が 出ないので、中では ★税額 0★ で 計算が 進む。
 *
 * ★直す前に 実測した 姿（2026-09-06・実UIで 押した）★
 *   源泉所得税 … 「前月給与の入力待ち」
 *   ★差引支給額（手取り）… ¥253,500 と 確定的に 出ていた★
 *   ★「この賞与を確定（年調・台帳に反映）」も 押せた★
 *   ⇒ そのまま 振り込むと ★会社が 源泉徴収を していない事に なる★
 *   ⇒ 確定すると ★源泉0の 賞与が 年末調整と 賃金台帳に 入る★＝あとで 全部 狂う
 *   ＝★決まっていない事を 数字で 言う★型（[[feedback_never_say_zero_when_you_dont_have_it]]）
 *
 * ★ここで 見る事★
 *   ① 前月が 無い時 … 手取りを ★額で 出さない★（「まだ 出せません」）
 *   ② 前月が 無い時 … 確定が ★押せない★／★理由が ボタンの 中に 出る★
 *      （黙って 無反応に しない＝[[feedback_dont_show_unfinished_buttons]]）
 *   ③ ★塞ぎっぱなしに しない★＝前月を 入れたら ★押せるように 戻る★／手取りも 出る
 *   ④ ★空振りしていない★（賞与額を 打って 本当に その状態を 作れている）
 *
 * 使い方: node kyuyo/tests/shoyo-gensen-mitei.mjs [--self-test]
 *   ・DB-test へ 実接続して ログインします（CIには 鍵が 無いので tests-no-ci.json に 載せます）
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { borrow, launch as pwLaunch } from '../../scripts/_borrow-playwright.mjs';
import { hairu, osu, toziru } from '../../tests/_hairu.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELF = process.argv.includes('--self-test');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const srv = http.createServer((rq, rs) => {
  let p = path.join(ROOT, decodeURIComponent(rq.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { rs.writeHead(404); rs.end('x'); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  rs.end(fs.readFileSync(p));
});
await new Promise((r) => srv.listen(0, r));
const PORT = srv.address().port;

let pass = 0, fail = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + ' — ' + m); } };

const MI = '(el) => { if (!el) return false; const s = getComputedStyle(el);'
  + " if (s.display === 'none' || s.visibility === 'hidden') return false;"
  + ' const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }';

const b = await pwLaunch('shoyo-gensen-mitei', await borrow('shoyo-gensen-mitei', 'webkit'));
const pg = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const machi = (ms) => new Promise((r) => setTimeout(r, ms));

const h = await hairu(pg, 'http://localhost:' + PORT + '/kyuyo/index.html', '.bn[data-scr="scr-input"]');
if (!h.haitta) { console.log('★入れませんでした（鍵が 要ります）★'); await b.close(); srv.close(); process.exit(2); }
await machi(2500); await toziru(pg);
await osu(pg, '.bn[data-scr="scr-input"]'); await machi(3000); await toziru(pg);
await pg.click('.imode[data-imode="bonus"]', { timeout: 8000 });
await machi(3000);

console.log('\n[shoyo-gensen-mitei] 源泉が 決まっていない賞与を「確定」させないか');

/* ★前月を 空にして 賞与額だけ 打つ★＝「決まっていない」状態を 作る */
const tsukutta = await pg.evaluate(() => {
  const v = document.getElementById('bonus-view'); if (!v) return '賞与の 画面が 無い';
  const bp = v.querySelector('input[data-bp]');
  if (bp) { bp.value = ''; bp.dispatchEvent(new Event('input', { bubbles: true })); bp.dispatchEvent(new Event('change', { bubbles: true })); }
  /* ★実物の 印（★data-ba＝賞与額★）で 当てる★
     ＝2026-09-06 に 私は 2度 外した。
       ①`input[0]` … ★隠れた欄★に 打っていた
       ②`data-bn` … それは ★支給月・支給日★の 印だった
     どちらも 賞与額が 入らないので ★確定ボタンが そもそも 描かれず★、
     「押せない」と「そもそも 無い」を ★取り違えかけた★
     （★直す前の 姿でも 同じだったので 私の 直しは 無実だと 分かった★）。 */
  const a = v.querySelector('input[data-ba]');
  if (!a) return '★賞与額の 欄（data-ba）が 無い★';
  a.focus(); a.value = '300000';
  a.dispatchEvent(new Event('input', { bubbles: true }));
  a.dispatchEvent(new Event('change', { bubbles: true }));
  a.blur();
  return '賞与 300,000／前月 空';
});
await machi(2500);

const yomu = () => pg.evaluate((mi) => {
  const mieru = eval('(' + mi + ')');
  const v = document.getElementById('bonus-view');
  const t = (v.innerText || '').replace(/[ ]+/g, ' ');
  const k = Array.from(v.querySelectorAll('button')).filter(mieru).find((e) => /確定/.test(e.textContent || ''));
  return {
    machi: /前月給与の入力待ち/.test(t),
    dasenai: /まだ 出せません/.test(t),
    tedori: (t.match(/差引支給額[^¥]*¥([0-9,]+)/) || [])[1] || null,
    off: k ? k.disabled : null,
    ji: k ? (k.textContent || '').trim() : '',
    /* ★理由が ボタンの 中に 出ているか★＝字そのものを 決め打ちしない
       （2026-09-06 に「前月給与が 入っていません」→「源泉が 決まっていません」へ 言い方を
         変えた時、★動きは 正しいのに この検査だけ 赤に なった★＝物差しが 字に 縛られていた） */
    wake: /名の[^）]*(決まって|入っていま)/.test(k ? (k.textContent || '') : ''),
  };
}, MI);

const a1 = await yomu();
T('④ 空振りしていない（「決まっていない」状態を 作れた）', a1.machi, '前月給与の入力待ちに なっていない（' + tsukutta + '）');
T('① 手取りを 額で 出さない', a1.dasenai && !a1.tedori,
  '手取りが 額で 出ている … ¥' + a1.tedori);
T('② 確定が 押せない／理由が ボタンの 中に 出る', a1.off === true && a1.wake,
  '押せない=' + a1.off + '／ボタンの字「' + a1.ji + '」');

/* ★塞ぎっぱなしに しない★ */
await pg.evaluate(() => {
  const el = document.querySelector('#bonus-view input[data-bp]');
  if (!el) return;
  el.focus(); el.value = '250000';
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.blur();
});
await machi(2500);
const a2 = await yomu();
T('③ 前月を 入れたら 押せるように 戻る／手取りも 出る', a2.off === false && !!a2.tedori,
  '押せない=' + a2.off + '／手取り ¥' + a2.tedori);
console.log('     前月 250,000 を 入れた後 … 手取り ¥' + a2.tedori + '／「' + a2.ji + '」');

/* ── ★わざと 壊して 赤に なるか★（壊した数と 赤の数を 並べる） ── */
if (SELF) {
  console.log('\n[shoyo-gensen-mitei --self-test] わざと 直す前の姿に すると 赤に なるか');
  let kowashita = 0, aka = 0;
  /* ★直す前の姿に 戻す★＝前月を 空に して「決まっていない」状態を 作り直す。
     ★作り直せたかを 先に 数える★（作れていないのに 壊しても 意味が 無い＝空振り） */
  await pg.evaluate(() => {
    const el = document.querySelector('#bonus-view input[data-bp]');
    if (el) { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await machi(2500);
  const sonae = await yomu();
  console.log('  （壊す前の 姿 … 確定ボタン ' + (sonae.off === null ? '★見つからない★' : ('押せない=' + sonae.off))
    + '／手取り ' + (sonae.tedori ? '¥' + sonae.tedori : 'まだ 出せません') + '）');
  if (sonae.off !== true) {
    console.log('  ★★作り直せていません＝この 自己確認は 空振りです★★');
    await b.close(); srv.close(); process.exit(1);
  }
  for (const [na, f] of [
    ['止めを 外す（確定を 押せるように する）', async () => {
      /* ★描き直しに 追い越されない★＝止めを 外す前に 画面が 落ち着くのを 待つ
         （2026-09-06 … 前月を 空にした 直後に disabled を 剥がしたら
           ★その後の 描き直しで また 止まって「気づけない」と 出た★＝待ちが 足りなかった） */
      await machi(1500);
      await pg.evaluate(() => {
        const k = Array.from(document.querySelectorAll('#bonus-view button')).find((e) => /確定/.test(e.textContent || ''));
        if (k) k.disabled = false;
      });
      const r = await yomu();
      return r.off === false;            /* ★②が 赤に なる★ */
    }],
    ['手取りを 額で 出す（直す前の 姿）', async () => {
      await pg.evaluate(() => {
        const el = [...document.querySelectorAll('#bonus-view .calc-line.net .v')].pop();
        if (el) el.textContent = '¥253,500';
      });
      const r = await yomu();
      return !!r.tedori;                 /* ★①が 赤に なる★ */
    }],
  ]) {
    kowashita++;
    let r; try { r = await f(); } catch (e) { r = false; }
    if (r) aka++;
    console.log('  ' + (r ? '✓' : '✗') + ' ' + na + ' … ' + (r ? '赤に なる（見張りが 気づく）' : '★気づけない★'));
  }
  console.log('  ★壊した ' + kowashita + '件／気づけた ' + aka + '件★');
  await b.close(); srv.close();
  if (aka !== kowashita) { console.log('★自己確認 おかしい★'); process.exit(1); }
  console.log('\n' + kowashita + ' passed, 0 failed');
  process.exit(0);
}

await b.close(); srv.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
