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
    const r = await fetch(ICHIRAN, { headers: { 'User-Agent': 'claude-code' } });
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
  fail++;
  console.log('  NG ★やる事★ ①HATSUKO_MITEI を false に ②出典を この確定版URLへ ③下の 変わった県を 直す');

  try {
    const r2 = await fetch(u, { headers: { 'User-Agent': 'claude-code' } });
    if (!r2.ok) throw new Error('HTTP ' + r2.status);
    const t = pdfText(Buffer.from(await r2.arrayBuffer()));
    const naka = [];
    for (const k of Object.keys(SAI.todofuken)) {
      const p = SAI.todofuken[k];
      const nen = +p.hatsuko.slice(0, 4), mo = +p.hatsuko.slice(5, 7), da = +p.hatsuko.slice(8, 10);
      const wa = '令和' + (nen - 2018) + '年' + mo + '月' + da + '日';
      if (t.indexOf(wa) < 0) naka.push(p.name + ' ' + wa);
    }
    if (naka.length) {
      console.log('  NG ★確定版に 無い 発効日 = ' + naka.length + '県★（答申から 変わった疑い）');
      naka.slice(0, 8).forEach((x) => console.log('     - ' + x));
    } else {
      console.log('  （47県の 発効日は 確定版でも 同じ＝日付は 変わらなかった）');
    }
  } catch (e) {
    console.log('  （確定版PDFを 取れなかった: ' + e.message + '＝日付の 突き合わせは 次回）');
  }
  console.log('\n1 failed');
  process.exitCode = 1;
};
main();
