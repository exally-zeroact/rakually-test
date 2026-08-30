/* seal-shape.mjs — ★判子の形（角印／個人の丸い印）を 機械で見分けられるか★
 * ============================================================================
 * ★司さん 2026-08-30「判子も 個人の苗字の判子の大きさと 角印の判子の大きさも
 *   自動で選別してるか？」★ … 今までしていなかった。ここが その見張り。
 *
 * ★本物のブラウザで 本物の印影を描いて 測る★
 *   ・絵を repo に置かない＝毎回 その場で描く（★形が命なので 形を作って試す★）
 *   ・角印 … 四角い枠＋四文字（＝四隅に墨が在る）
 *   ・丸印 … 丸い枠＋苗字（＝四隅は 紙のまま）
 *   ・白地JPEG風（白背景）と 白抜き済みPNG風（透過背景）の ★両方★で 試す
 *     ＝どちらでも 同じ答えになる事（白抜きの有無で 変わらない）
 *
 * 使い方: node seikyu/tests/seal-shape.mjs
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { createRequire } from 'node:module'; import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require_ = createRequire(import.meta.url);
const { webkit } = require_(path.join(ROOT, 'node_modules/playwright/index.js'));
const SEAL = require_(path.join(ROOT, 'seikyu/lib/seikyu-seal.js'));

let pass = 0, fail = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + ' — ' + m); } };

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const srv = http.createServer((rq, rs) => {
  const u = decodeURIComponent(rq.url.split('?')[0]); const p = path.join(ROOT, u);
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { rs.writeHead(404); rs.end(); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  rs.end(fs.readFileSync(p));
});
await new Promise((r) => srv.listen(0, r)); const port = srv.address().port;

console.log('\n[seal-shape] 判子の形を 機械で見分けられるか（本物のブラウザで 印影を描いて 測る）');

const b = await webkit.launch();
const pg = await (await b.newContext({ viewport: { width: 400, height: 400 } })).newPage();
await pg.goto('http://localhost:' + port + '/seikyu/index.html', { waitUntil: 'domcontentloaded' });
await pg.waitForTimeout(400);

/* ★印影を その場で描く★（角/丸 × 白地/透過 の4通り＋余白の多い角印） */
const made = await pg.evaluate(() => {
  const RED = '#C8102E';
  function draw(kind, bg, pad) {
    pad = pad || 0;
    const S = 200, c = document.createElement('canvas');
    c.width = c.height = S + pad * 2;
    const x = c.getContext('2d');
    if (bg) { x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, c.width, c.height); }
    x.strokeStyle = RED; x.fillStyle = RED; x.lineWidth = 10;
    if (kind === 'kaku') {
      x.strokeRect(pad + 6, pad + 6, S - 12, S - 12);
      x.font = 'bold 66px serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      const w = ['株', '式', '会', '社'];
      w.forEach((ch, i) => x.fillText(ch, pad + 55 + (i % 2) * 90, pad + 55 + Math.floor(i / 2) * 90));
    } else {
      x.beginPath(); x.arc(c.width / 2, c.height / 2, S / 2 - 8, 0, Math.PI * 2); x.stroke();
      x.font = 'bold 76px serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('八', c.width / 2, c.height / 2 - 38);
      x.fillText('木', c.width / 2, c.height / 2 + 42);
    }
    return c.toDataURL('image/png');
  }
  return {
    kakuW: draw('kaku', true), kakuT: draw('kaku', false),
    maruW: draw('maru', true), maruT: draw('maru', false),
    kakuPad: draw('kaku', true, 60),          // ★まわりに余白がある写真★でも 効くか
    empty: (() => { const c = document.createElement('canvas'); c.width = c.height = 100;
      const x = c.getContext('2d'); x.fillStyle = '#FFF'; x.fillRect(0, 0, 100, 100); return c.toDataURL('image/png'); })(),
  };
});

const got = await pg.evaluate(async (imgs) => {
  const out = {};
  for (const k of Object.keys(imgs)) {
    try { out[k] = await window.SeikyuSeal.guessFromUrl(imgs[k]); }
    catch (e) { out[k] = { err: String(e && e.message) }; }
  }
  return out;
}, made);
/* ★実UIで 押す★＝設定の画面で 判子を選ぶと ★mmの欄が 自動で変わる★か
   （司さんが押すのは 画面であって 部品ではない） */
const ui = await pg.evaluate(async (imgs) => {
  const A = window.SeikyuApp, doc = document;
  const out = {};
  A._state.org = { yago: '合同会社Rakunally' };
  A._fillSettings();
  out.before = doc.getElementById('seal-mm').value;
  for (const [k, url] of [['maru', imgs.maruW], ['kaku', imgs.kakuW]]) {
    const r = A._pickSealUrl(url);
    if (!r.ok) { out[k] = 'NG:' + r.reason; continue; }
    await r.guessed;
    out[k] = doc.getElementById('seal-mm').value;
    out[k + 'Why'] = (doc.getElementById('seal-why').textContent || '').slice(0, 40);
  }
  return out;
}, made);

await b.close(); srv.close();

const line = (k) => {
  const g = got[k]; if (!g || g.err) return k + ' … ★測れなかった★ ' + (g && g.err);
  return k.padEnd(8) + ' 四隅 ' + String(Math.round((g.measured.corner || 0) * 100)).padStart(3) + '%'
    + ' → ' + g.shape.padEnd(8) + g.mm + 'mm';
};
Object.keys(got).forEach((k) => console.log('     ' + line(k)));

T('★角印（白地）を 四角い印と見る・21mm', got.kakuW.shape === 'kaku' && got.kakuW.mm === 21, JSON.stringify(got.kakuW));
T('★角印（白抜き済み）でも 同じ答え', got.kakuT.shape === 'kaku' && got.kakuT.mm === 21, JSON.stringify(got.kakuT));
T('★丸い印（白地）を 個人の印と見る・15mm', got.maruW.shape === 'maru' && got.maruW.mm === 15, JSON.stringify(got.maruW));
T('★丸い印（白抜き済み）でも 同じ答え', got.maruT.shape === 'maru' && got.maruT.mm === 15, JSON.stringify(got.maruT));
T('★まわりに余白がある角印でも 四角と見る（余白を外して測る）', got.kakuPad.shape === 'kaku', JSON.stringify(got.kakuPad));
T('★白紙は 当てない（分からないと言う・既定21mm）', got.empty.shape === 'unknown' && got.empty.mm === 21, JSON.stringify(got.empty));
T('★角と丸で 四隅の値が はっきり離れている（まぐれで通っていない）',
  (got.kakuW.measured.corner - got.maruW.measured.corner) > 0.15,
  '角 ' + got.kakuW.measured.corner + ' / 丸 ' + got.maruW.measured.corner);

/* ★決め方そのもの★（数だけの純粋な関数）＝ブラウザが無くても 同じ答えになる */
T('★決め方は 数だけで 決まる（境目の上下で 変わる）',
  SEAL.guess({ corner: SEAL.KAKU_MIN }).shape === 'kaku'
  && SEAL.guess({ corner: SEAL.MARU_MAX }).shape === 'maru'
  && SEAL.guess({ corner: (SEAL.KAKU_MIN + SEAL.MARU_MAX) / 2 }).shape === 'unknown', '境目が効いていない');
T('★数でない物は ぜんぶ「分からない」（null を 0にしない）',
  ['x', null, undefined, NaN].every((v) => SEAL.guess({ corner: v }).shape === 'unknown'), 'null を 0 と読んでいる');

console.log('     画面のmm欄 … はじめ ' + ui.before + ' → 丸い印 ' + ui.maru + ' → 角印 ' + ui.kaku);
console.log('     当てた理由（丸）… ' + ui.maruWhy);
T('★画面で 丸い印を選ぶと mmが 15に変わる', ui.maru === '15', 'mm欄が ' + ui.maru);
T('★画面で 角印を選ぶと mmが 21に変わる', ui.kaku === '21', 'mm欄が ' + ui.kaku);
T('★なぜ その大きさかを 画面に出している', /丸い印|四角い印/.test(ui.maruWhy || ''), '理由が出ていない: ' + ui.maruWhy);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
