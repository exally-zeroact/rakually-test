/* shot-honban-obi.mjs — ★本番の 入口に「テスト環境」の帯が 出ていないか★を 実物で 見る
 * =============================================================================
 * ★なぜ（2026-09-13 実測）★
 *   配信中の rakually.vercel.app/js/supa-config.js が ★env:'test'★ を 返していた。
 *   js/env-badge.js は ★env が 'test' の時だけ 帯を 出す★作り。
 *   ⇒ ★本番の 入口に「テスト環境」の帯が 出ている 疑い★＝知り合いに 渡す URL に 出ていたら まずい。
 *   ★字（env:'test'）だけで 断じない★＝画面を 開いて 目で 見る（会社の決まり）。
 *
 * ★読むだけ★（ログインしない・倉庫に 触らない）
 * 使い方: node scripts/shot-honban-obi.mjs [出し先フォルダ]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { borrow, launch as pwLaunch } from './_borrow-playwright.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] || path.join(ROOT, '.shot-obi');
fs.mkdirSync(OUT, { recursive: true });
const URL_ = 'https://rakually.vercel.app/';

const ch = await borrow('shot-honban-obi', 'chromium');
if (!ch) { console.log('🟡 ★未測定★ playwright を 借りられない'); process.exit(2); }
const br = await pwLaunch('shot-honban-obi', ch, undefined, 'chromium');
const pg = await br.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await pg.goto(URL_, { waitUntil: 'domcontentloaded' });
await pg.waitForTimeout(2500);

const m = await pg.evaluate(() => {
  const b = document.getElementById('envbar');
  const cfg = window.SUPA || {};
  /* ★offsetParent で 見えているかを 決めるな★（2026-09-13 実測で 踏んだ）
     position:fixed の 物は ★見えていても offsetParent が null★＝
     「帯は 在るが 見えていない」という ★嘘★を 出した（絵には はっきり 出ていた）。
     ⇒ ★場所と 大きさと 塗りで 見る★＝画面の 一番上の 点を 拾って それが 帯か。 */
  const r = b && b.getBoundingClientRect();
  const ue = document.elementFromPoint(Math.floor(window.innerWidth / 2), 4);
  return {
    obiAru: !!b,
    obiMieru: !!(r && r.height > 0 && r.width > 0 && r.top < 10
      && getComputedStyle(b).visibility !== 'hidden' && getComputedStyle(b).display !== 'none'
      && !!(ue && (ue === b || b.contains(ue)))),
    obiJi: b ? (b.textContent || '').trim().slice(0, 60) : '',
    takasa: b ? Math.round(b.getBoundingClientRect().height) : 0,
    env: String(cfg.env || '（名札なし）'),
    haba: document.documentElement.clientWidth,
  };
});
const f = path.join(OUT, 'honban-obi.png');
await pg.screenshot({ path: f });
await br.close();
const buf = fs.readFileSync(f);

console.log('\n[shot-honban-obi] ' + URL_);
console.log('  配信の 名札 env … ★' + m.env + '★');
console.log('  帯が 在るか … ' + (m.obiAru ? '在る' : '無い') + ' ／ 見えているか … ' + (m.obiMieru ? '★見えている★' : '見えていない'));
if (m.obiAru) console.log('  帯の 字 … 「' + m.obiJi + '」 ／ 高さ ' + m.takasa + 'px');
console.log('  測った 幅 … ' + m.haba + 'px');
console.log('  絵 … ' + f + '  ' + buf.length + 'バイト  sha256:' + createHash('sha256').update(buf).digest('hex').slice(0, 12));
