/* saitei-koji.test.mjs — ★公示（確定版）が 出たかを 機械で 拾う★
 * ============================================================================
 * ★なぜ 要るか（2026-09-12・経営者1が 見つけた）★
 *   今 lib に 入っているのは ★答申（2026-09-03）の 発効日★で、
 *   厚労省自身が ★「発効日は、答申公示後の異議の申出の状況等により変更となる可能性有」★ と 書いている。
 *   ⇒ ★公示で 確定したら 日付が 変わる事が ある★＝月内で 分かれる判定に 直に 効く。
 *   ⇒ ★人が 毎週 厚労省を 見に行く★のは 続かない。★機械で 拾う★。
 *
 * ★合図の 見つけ方（去年の形から 分かった）★
 *   一覧ページ（.../roudoukijun/minimumichiran/）に
 *     ★「令和7年度地域別最低賃金全国一覧」→ /content/11200000/001571192.pdf★ が 在る
 *     ＝これは まさに 中央 saitei_chingin:2025 の 出典URL＝★去年は 確定版を 指していた★
 *   ⇒ ★「令和◯年度」＋「全国一覧」の PDFリンクが 現れた時＝その年度の 公示 済★
 *
 * ★出る物★
 *   ・まだ 無い  … OK（今ここ）。HATSUKO_MITEI は true のまま
 *   ・在る      … ★赤★「公示された＝HATSUKO_MITEI を false にして 出典を 確定版へ」
 *                  さらに ★確定版PDFを 取って 47県の 発効日を 突き合わせ、変わった県を 出す★
 *
 * ★外を 叩くので 週1側で 走らせる★／★取れない時は --strict の時だけ 赤★
 */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
const require_ = createRequire(import.meta.url);
const SAI = require_('../lib/saitei-chingin.js');

const STRICT = process.argv.includes('--strict');
const ICHIRAN = 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/minimumichiran/';
const NENDO = SAI.NENDO_YEAR;
const REIWA = '令和' + (NENDO - 2018) + '年度';
/* ★役所の字は 全角の数字を 使う事が 在る★（令和７年度）＝両方 見る */
const ZEN = '０１２３４５６７８９';
const REIWA_Z = '令和' + String(NENDO - 2018).split('').map((c) => ZEN[+c]).join('') + '年度';

let fail = 0;
console.log('\n[saitei-koji] 公示（確定版）が 出たかを 見る');
console.log('  探す字 = 「' + REIWA + '」または「' + REIWA_Z + '」＋「全国一覧」');
console.log('  今の lib = ' + REIWA + ' / HATSUKO_MITEI = ' + SAI.HATSUKO_MITEI);

const pdfText = (buf) => {
  const p = path.join(os.tmpdir(), 'koji-' + Date.now() + '.pdf');
  fs.writeFileSync(p, buf);
  try { return execFileSync('pdftotext', ['-raw', '-enc', 'UTF-8', p, '-'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }); }
  finally { try { fs.unlinkSync(p); } catch (e) { /* 消せなくても 落ちない */ } }
};

const main = async () => {
  let html;
  try {
    const r = await fetch(ICHIRAN, { headers: { 'User-Agent': 'claude-code' }, signal: AbortSignal.timeout(25000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    html = await r.text();
  } catch (e) {
    if (STRICT) { console.log('  NG 一覧ページが 取れない（--strict）: ' + e.message); process.exitCode = 4; return; }
    console.log('  SKIP 一覧ページが 取れない（オフライン等）＝赤にしない: ' + e.message);
    process.exit(0);
  }

  const links = [];
  const re = /href="([^"]+[.]pdf)"[^>]*>([^<]{0,80})/g;
  let m;
  while ((m = re.exec(html))) links.push({ url: m[1], name: m[2].trim() });
  console.log('  一覧ページの PDFリンク = ' + links.length + '本');

  const kakutei = links.filter((x) => (x.name.indexOf(REIWA) >= 0 || x.name.indexOf(REIWA_Z) >= 0) && x.name.indexOf('全国一覧') >= 0);

  if (!kakutei.length) {
    console.log('  OK ★まだ 公示前★＝' + REIWA + 'の「全国一覧」は 一覧ページに 無い');
    console.log('     （lib は 答申の 発効日のまま／HATSUKO_MITEI = true が 正しい）');
    if (!SAI.HATSUKO_MITEI) {
      console.log('  NG ★公示前なのに HATSUKO_MITEI が false★＝予定を 確定として 出している');
      fail++;
    }
    console.log('\n' + (fail ? '1 failed' : '1 passed, 0 failed'));
    process.exitCode = fail ? 1 : 0;
    return;
  }

  /* ★公示 された★ */
  const u = kakutei[0].url.indexOf('http') === 0 ? kakutei[0].url : 'https://www.mhlw.go.jp' + kakutei[0].url;
  console.log('  ★公示 された★ ' + kakutei[0].name + ' → ' + u);
  /* ★2026-10-20＝確定版に 移った 後も 毎週 見る★（前は 公示が 出たら いつも 赤＝直しても 緑に 戻れなかった）
     緑の 条件＝①HATSUKO_MITEI が false ②出典が この確定版 ③★47県の 行ごとに 額・前年額・発効日が 確定版と 同じ★＋全国加重平均
     ★行ごとに 見る★＝前は「その日付の 字が PDFの どこかに 在るか」だけ＝★別の県の 日付でも 通った★ */
  const yaru = [];
  if (SAI.HATSUKO_MITEI) yaru.push('①HATSUKO_MITEI を false に');
  if (SAI.SOURCE_URL !== u) yaru.push('②出典を この確定版URLへ（今 ' + SAI.SOURCE_URL + '）');
  let t;
  try {
    const r2 = await fetch(u, { headers: { 'User-Agent': 'claude-code' }, signal: AbortSignal.timeout(25000) });
    if (!r2.ok) throw new Error('HTTP ' + r2.status);
    t = pdfText(Buffer.from(await r2.arrayBuffer()));
  } catch (e) {
    console.log('  NG 確定版PDFを 取れなかった: ' + e.message + '＝突き合わせられない');
    console.log('\n1 failed');
    process.exitCode = 1;
    return;
  }
  const kekka = tsukiawaseru(gyoWoYomu(t), t, SAI);
  console.log('  確定版の 行 ' + kekka.gyo + '本 ／ 見た 県 ' + kekka.mita + ' ／ 違う ' + kekka.chigau.length);
  kekka.chigau.slice(0, 10).forEach((x) => console.log('     - ' + x));
  if (kekka.chigau.length) yaru.push('③違う 県を 確定版に 合わせる');
  if (yaru.length) {
    console.log('  NG ★やる事★ ' + yaru.join(' ／ '));
    console.log('\n1 failed');
    process.exitCode = 1;
    return;
  }
  console.log('  OK ★確定版に 移っている★＝予定の 札なし・出典は 確定版・47県の 額/前年額/発効日と 全国加重平均が 全部 同じ');
  console.log('\n1 passed, 0 failed');
  process.exitCode = 0;
};
/* ★確定版の 1行★＝「北海道 1,131 （ 1,075 ) 56 5.2% 令和8年10月1日」（pdftotext -raw・県名の 間に 全角の 空き） */
export function gyoWoYomu(t) {
  const o = {};
  for (const l of String(t).split(/\r?\n/)) {
    const m = /^(\S+(?:[\s　]\S+)?)\s+([\d,]+)\s+（\s*([\d,]+)\s*\)\s+\d+\s+[\d.]+%\s+令和(\d+)年(\d+)月(\d+)日/.exec(l.trim());
    if (!m) continue;
    const na = m[1].replace(/[\s　]/g, '');
    /* ★同じ 県名が 2回 出たら 黙って 上書きしない★（taiketsu 10-20＝前の行が 比べられずに 緑だった） */
    if (o[na]) { o[na].nikai = true; continue; }
    o[na] = { c: +m[2].replace(/,/g, ''), p: +m[3].replace(/,/g, ''),
      d: (2018 + +m[4]) + '-' + String(m[5]).padStart(2, '0') + '-' + String(m[6]).padStart(2, '0') };
  }
  return o;
}
export function tsukiawaseru(gyo, t, S) {
  const chigau = [];
  let mita = 0;
  const atatta = new Set();   /* ★確定版の どの行に 当たったか★（lib の 鍵の 数では なく） */
  for (const k of Object.keys(S.todofuken)) {
    const p = S.todofuken[k];
    const key = gyo[p.name] ? p.name : p.name.replace(/[都府県]$/, '');
    const r = gyo[key];
    mita++;
    if (!r) { chigau.push(p.name + ' … 確定版に 行が 無い'); continue; }
    if (atatta.has(key)) chigau.push(p.name + ' … 確定版の 同じ行（' + key + '）に 2回 当たった');
    atatta.add(key);
    if (r.c !== p.chingin || r.p !== p.prev || r.d !== p.hatsuko) {
      chigau.push(p.name + ' … lib ' + p.chingin + '（前 ' + p.prev + '）' + p.hatsuko + ' ／ 確定版 ' + r.c + '（前 ' + r.p + '）' + r.d);
    }
  }
  Object.keys(gyo).filter((k) => gyo[k].nikai).forEach((k) => chigau.push('確定版に ' + k + ' の 行が 2本 在る'));
  /* ★全国加重平均の 行は ちょうど 1本★（後ろに 偽の 行を 足すと 前の 拾い方は 通した） */
  const zs = [...String(t).matchAll(/(?:^|\n)\s*([\d,]+)\s*（\s*([\d,]+)\s*\)\s+\d+\s+[\d.]+%\s+-/g)];
  const zen = zs.length === 1 ? +zs[0][1].replace(/,/g, '') : null;
  if (zs.length !== 1) chigau.push('全国加重平均の 行が ' + zs.length + '本');
  else if (zen !== S.ZENKOKU_HEIKIN) chigau.push('全国加重平均 … lib ' + S.ZENKOKU_HEIKIN + ' ／ 確定版 ' + zen);
  const n = Object.keys(gyo).length;
  if (n !== 47 || mita !== 47 || atatta.size !== 47) chigau.push('★47県 揃って 読めていない★（確定版の 行 ' + n + '・lib の 県 ' + mita + '・当たった 行 ' + atatta.size + '）');
  return { gyo: n, mita, chigau };
}
/* ★--waza＝ネットを 使わず 突き合わせの 物差しを 壊して 赤を 見る★（2026-10-20・taiketsu 2回）
   材料＝fixtures/saitei-kakutei-r8.raw.txt（確定版 001753404.pdf〔sha256 625c6e1f…〕を pdftotext 4.00 -raw で 抜いた 字・人は 打っていない） */
function waza() {
  const t = fs.readFileSync(new URL('./fixtures/saitei-kakutei-r8.raw.txt', import.meta.url), 'utf8');
  const kopi = () => ({ ZENKOKU_HEIKIN: SAI.ZENKOKU_HEIKIN, todofuken: JSON.parse(JSON.stringify(SAI.todofuken)) });
  const W = [
    ['そのまま＝違い 0', (s) => s, t, false],
    ['宮崎の 額 +1', (s) => { s.todofuken.miyazaki.chingin++; }, t, true],
    ['高知の 前年 -1', (s) => { s.todofuken.kochi.prev--; }, t, true],
    ['京都の 日付を 大阪の 日付へ（前の 見張りは 通した）', (s) => { s.todofuken.kyoto.hatsuko = '2026-10-01'; }, t, true],
    ['全国加重平均 1176', (s) => { s.ZENKOKU_HEIKIN = 1176; }, t, true],
    ['県を 1つ 抜く', (s) => { delete s.todofuken.okinawa; }, t, true],
    ['熊本を 宮崎の 名前と 額に 差し替え', (s) => { s.todofuken.kumamoto = { ...s.todofuken.miyazaki }; }, t, true],
    ['同じ 県の 別の 額の 行を 前に', (s) => s, '宮　崎 1,999 （ 1,023 ) 62 6.1% 令和8年10月24日\n' + t, true],
    ['全国平均の 偽の 行を 後ろに', (s) => s, t + '\n1,999 （ 1,121 ) 56 5.0% -', true],
  ];
  let ng = 0;
  for (const [na, f, tt, akaKitai] of W) {
    const s = kopi(); f(s);
    const r = tsukiawaseru(gyoWoYomu(tt), tt, s);
    const aka = r.chigau.length > 0;
    if (aka !== akaKitai) ng++;
    console.log('  ' + (aka === akaKitai ? '✓' : '✗') + ' ' + na + ' … ' + (akaKitai ? '赤のはず' : '緑のはず') + '・違い ' + r.chigau.length + (r.chigau[0] ? '（' + r.chigau[0] + '）' : ''));
  }
  console.log('\n' + (W.length - ng) + ' passed, ' + ng + ' failed');
  process.exitCode = ng ? 1 : 0;
}
if (process.argv.includes('--waza')) waza(); else main();
