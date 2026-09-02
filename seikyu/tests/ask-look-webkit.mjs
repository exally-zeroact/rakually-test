/* ask-look-webkit.mjs — ★聞く形の 札が 読めるか を 本物のブラウザで 測る★
 * ============================================================================
 * ★なぜ（指示役の判定 2026-09-02）★
 *   ① 口座の札 … ★差し戻し★「3つの口座が 1つの塊に 見える／どこまでが1つの口座か 読めない」
 *      ＝札を 横に並べていたので、折り返した字が 次の口座と 混ざっていた。
 *      ★これは 数字には 1つも 出ない★（うちで 何度も 踏んだ型）＝だから ★描いた物を 測る★。
 *   ② 消費税の一言 … ★保留★「3つの札が 全部 同じ見た目＝どれが 選ばれているか 絵で 分からない」
 *      ＝押した後に「これが 効いている」が 見えないと ★状態を 2か所で 別々に 判定する事故の入口★。
 *
 * ★ここで見る事（375 / 390 / 430 の3幅で 実測）★
 *   ① 口座の札は ★1口座＝1つの箱★（隣と 重ならない・字が 混ざらない）
 *   ② 札の数＝会社の口座の数（描かれた物を 数える）
 *   ③ 消費税の一言は ★選んだ札だけが 光る（1個）★／押し替えると 光る札も 変わる
 *   ④ ★空振りしていない★（0個で 緑にしない）
 *
 * 使い方: node seikyu/tests/ask-look-webkit.mjs
 *   ・ブラウザが 無い時は「未測定」で 緑（週1の webkit.yml では 赤）＝scripts/_borrow-playwright.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { borrow, launch as pwLaunch } from '../../scripts/_borrow-playwright.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0;
const T = (n, f) => { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m); };

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf' };
const srv = http.createServer((rq, rs) => {
  const u = decodeURIComponent(rq.url.split('?')[0]);
  const p = path.join(ROOT, u);
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { rs.writeHead(404); rs.end(); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  rs.end(fs.readFileSync(p));
});
await new Promise((r) => srv.listen(0, r));
const port = srv.address().port;

const ACC = ['伊予銀行　今治支店　普通　4160657　ド）ゼロアクト',
  '愛媛銀行　今治支店　普通　9570836　ド）ゼロアクト',
  '愛媛信用金庫　今治支店　普通　0423107　ド）ゼロアクト'];

const webkit = await borrow('ask-look', 'webkit');
const b = await pwLaunch('ask-look', webkit);

async function open(width) {
  const ctx = await b.newContext({ viewport: { width, height: 1400 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pg = await ctx.newPage();
  await pg.goto('http://localhost:' + port + '/seikyu/index.html', { waitUntil: 'load' });
  await pg.evaluate((acc) => {
    document.getElementById('app').hidden = false;
    const ov = document.getElementById('loginOv'); if (ov) ov.remove();   /* ログインの覆いを どける（測る為） */
    const A = window.SeikyuApp, S = A._state;
    S.org = { yago: '合同会社ZEROact', invoiceStyle: {}, bank: acc.join('\n') };
    S.partners = [{ id: 'p1', name: 'ENEOSグローブエナジー株式会社',
      data: { name: 'ENEOSグローブエナジー株式会社', honor: '御中', paper: {} } }];
    S.list = []; S.cur = null;
    A._go('scr-set'); A._fillSettings();
    const sel = document.getElementById('s-partner');
    if (sel) { sel.value = 'p1'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
  }, ACC);
  /* 畳んである所を 開く（他の見張りと 同じやり方） */
  await pg.addStyleTag({ content: '.screen{display:block!important}details>*{display:block!important}' });
  await pg.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
  await new Promise((r) => setTimeout(r, 300));
  return pg;
}

console.log('\n[ask-look] 聞く形の札が 読めるか（375/390/430 で 描いて 測る）');
const seen = { banks: 0, chips: 0, widths: 0 };
const bad = [];
for (const w of [375, 390, 430]) {
  const pg = await open(w);
  const m = await pg.evaluate(() => {
    const host = document.getElementById('s-pbanks');
    const labs = Array.from(host.querySelectorAll('label'));
    const box = labs.map((l) => {
      const r = l.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, h: r.height, text: (l.textContent || '').replace(/\s+/g, ' ').trim() };
    });
    /* ★隣と 重なっていないか★＝1口座＝1つの箱 */
    let overlap = 0;
    for (let i = 1; i < box.length; i++) if (box[i].top < box[i - 1].bottom - 0.5) overlap++;
    /* ★1つの箱に 1つの口座だけ★（字が 混ざっていない） */
    const mixed = box.filter((x) => (x.text.match(/普通/g) || []).length !== 1).length;
    return { n: box.length, overlap: overlap, mixed: mixed, heights: box.map((x) => Math.round(x.h)) };
  });
  seen.banks += m.n; seen.widths++;
  if (m.n !== ACC.length) bad.push(w + 'px：札が ' + m.n + '個（' + ACC.length + '個のはず）');
  if (m.overlap) bad.push(w + 'px：★隣の札と 重なっている ' + m.overlap + '件★');
  if (m.mixed) bad.push(w + 'px：★1つの箱に 口座が 2つ 混ざっている ' + m.mixed + '件★');
  console.log('     ' + w + 'px … 札 ' + m.n + '個／高さ ' + m.heights.join(',') + 'px／重なり ' + m.overlap + '／混ざり ' + m.mixed);

  /* ★消費税の一言＝選んだ札だけが 光るか★ */
  const c = await pg.evaluate(() => {
    const host = document.getElementById('s-taxnote-ask');
    const cs = Array.from(host.querySelectorAll('[data-taxnote]'));
    const before = cs.filter((x) => x.classList.contains('chip-on')).length;
    cs[0].click();
    const on1 = cs.filter((x) => x.classList.contains('chip-on')).map((x) => x.getAttribute('data-taxnote'));
    cs[cs.length - 1].click();      /* 出さない */
    const on2 = cs.filter((x) => x.classList.contains('chip-on')).map((x) => x.getAttribute('data-taxnote'));
    return { n: cs.length, before: before, on1: on1, on2: on2 };
  });
  seen.chips += c.n;
  if (c.on1.length !== 1) bad.push(w + 'px：★押した後に 光る札が ' + c.on1.length + '個★');
  if (c.on2.length !== 1) bad.push(w + 'px：★押し替えた後に 光る札が ' + c.on2.length + '個★');
  if (c.on1[0] === c.on2[0]) bad.push(w + 'px：★押し替えても 光る札が 変わらない★');
  console.log('       消費税の札 ' + c.n + '個 … 押す前に光る ' + c.before + '個 → 押した後 ' + c.on1.length + '個 → 押し替え後 ' + c.on2.length + '個');
  await pg.context().close();
}
await b.close(); srv.close();

bad.forEach((x) => console.log('       ★' + x));
T('★① 口座は 1つずつ 別の箱（重なり0・混ざり0・3幅とも）', () => ok(!bad.filter((x) => /重なって|混ざって|札が/.test(x)).length, bad.join(' / ')));
T('★② 消費税の一言は 選んだ札だけが 光る（押し替えも 効く）', () => ok(!bad.filter((x) => /光る/.test(x)).length, bad.join(' / ')));
T('★③ 空振りしていない（0個で 緑にしない）', () => ok(seen.widths === 3 && seen.banks === 9 && seen.chips >= 9,
  '幅 ' + seen.widths + '／口座の札 ' + seen.banks + '／消費税の札 ' + seen.chips));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
