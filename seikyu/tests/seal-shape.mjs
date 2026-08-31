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
/* ★playwright が 借りられない機械では「未測定」で 終わる★（0件＝合格 とは 書かない）
   ＝運ぶ道具は「運び先で 走るか」を 実際に走らせて 見る。ここで 落ちると
     ★この見張りごと 本番に 運ばれない★（2026-08-31 実測：3本 落ちていた）。 */
let PW = null;
for (const cand of [path.join(ROOT, 'node_modules/playwright/index.js'),
  'C:/Users/zeroa/Exally-test/node_modules/playwright/index.js']) {
  if (!fs.existsSync(cand)) continue;
  try {
    const m = require_(cand);
    if (m && m.webkit) { PW = m; break; }
  } catch (e) { /* 次の借り先 */ }
}
if (!PW) {
  console.log('[seal-shape] ★未測定★ … playwright が 借りられません');
  console.log('  ★これは「問題なし」では ありません★。★測るには★ npm install && npx playwright install webkit');
  process.exit(0);
}
const { webkit } = PW;
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

/* ★白い紙に押した判子（＝写真）を そろえられるか★
   司さん 2026-08-30「ハンコの情報あるんやけんやれや」＝代行/Exally の hanko.js を借りた。
   ①白い所が 透ける ②まわりの余白が 切れる ③大きすぎたら 縮む ④やった事を 言う */
const prep = await pg.evaluate(async () => {
  /* 白い紙の まん中に 小さく押した 角印（＝スマホで撮った時の 形） */
  const S = 900, c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, S, S);
  x.strokeStyle = '#C8102E'; x.fillStyle = '#C8102E'; x.lineWidth = 10;
  x.strokeRect(350, 350, 200, 200);
  x.font = 'bold 66px serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  ['株', '式', '会', '社'].forEach((ch, i) =>
    x.fillText(ch, 400 + (i % 2) * 90, 400 + Math.floor(i / 2) * 90));
  const photo = c.toDataURL('image/png');
  const before = await window.SeikyuSeal.measure(photo);
  const r = await window.SeikyuSeal.prepare(photo);
  const after = await window.SeikyuSeal.measure(r.dataUrl);
  /* 白抜きが 効いたか＝出来た絵の かどが 透けているか を 直に見る */
  const img = document.createElement('img');
  await new Promise((ok, ng) => { img.onload = ok; img.onerror = ng; img.src = r.dataUrl; });
  const cc = document.createElement('canvas');
  cc.width = img.naturalWidth; cc.height = img.naturalHeight;
  const xx = cc.getContext('2d');
  xx.drawImage(img, 0, 0);
  /* ★切った後の かどは 枠の線そのもの★（＝墨で 正しい）。
     白抜きが効いたかは ①切る前の紙の かど ②出来た絵に 透けた点が 在るか で見る。 */
  const pre = document.createElement('img');
  const w1 = await window.HankoTool.process(photo, { mode: 'auto' });
  await new Promise((ok, ng) => { pre.onload = ok; pre.onerror = ng; pre.src = w1.dataURL; });
  const pc = document.createElement('canvas');
  pc.width = pre.naturalWidth; pc.height = pre.naturalHeight;
  const px = pc.getContext('2d');
  px.drawImage(pre, 0, 0);
  const paperCorner = px.getImageData(0, 0, 1, 1).data[3];
  const d2 = xx.getImageData(0, 0, cc.width, cc.height).data;
  let clear = 0;
  for (let i = 3; i < d2.length; i += 4) if (d2[i] < 64) clear++;
  return { did: r.did, w: r.w, h: r.h, paperCorner: paperCorner,
    clearPct: Math.round((clear / (cc.width * cc.height)) * 100),
    beforeBox: [before.boxW, before.boxH], afterBox: [after.boxW, after.boxH],
    srcW: 900, hasTool: !!window.HankoTool,
    guessed: (await window.SeikyuSeal.guessFromUrl(r.dataUrl)).shape };
}, null);

await b.close(); srv.close();

const line = (k) => {
  const g = got[k]; if (!g || g.err) return k + ' … ★測れなかった★ ' + (g && g.err);
  return k.padEnd(8) + ' 四隅 ' + String(Math.round((g.measured.corner || 0) * 100)).padStart(3) + '%'
    + ' → ' + g.shape.padEnd(8) + g.mm + 'mm';
};
Object.keys(got).forEach((k) => console.log('     ' + line(k)));

T('★角印（白地）を 四角い印と見る・17mm（実寸21mmの8割）', got.kakuW.shape === 'kaku' && got.kakuW.mm === 17, JSON.stringify(got.kakuW));
T('★角印（白抜き済み）でも 同じ答え', got.kakuT.shape === 'kaku' && got.kakuT.mm === 17, JSON.stringify(got.kakuT));
T('★丸い印（白地）を 個人の印と見る・12mm（実寸15mmの8割）', got.maruW.shape === 'maru' && got.maruW.mm === 12, JSON.stringify(got.maruW));
T('★丸い印（白抜き済み）でも 同じ答え', got.maruT.shape === 'maru' && got.maruT.mm === 12, JSON.stringify(got.maruT));
T('★まわりに余白がある角印でも 四角と見る（余白を外して測る）', got.kakuPad.shape === 'kaku', JSON.stringify(got.kakuPad));
T('★白紙は 当てない（分からないと言う・既定17mm）', got.empty.shape === 'unknown' && got.empty.mm === 17, JSON.stringify(got.empty));
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
T('★画面で 丸い印を選ぶと mmが 12に変わる', ui.maru === '12', 'mm欄が ' + ui.maru);
T('★画面で 角印を選ぶと mmが 17に変わる', ui.kaku === '17', 'mm欄が ' + ui.kaku);
T('★なぜ その大きさかを 画面に出している', /丸い印|四角い印/.test(ui.maruWhy || ''), '理由が出ていない: ' + ui.maruWhy);

console.log('     写真 900点 → ' + prep.w + '×' + prep.h + '点 ／ 透けた点 ' + prep.clearPct
  + '% ／ やった事: ' + (prep.did.join(' / ') || 'なし'));
T('★白抜きの道具（hanko.js）が 読めている', prep.hasTool, '★HankoTool が 居ない＝借りた道具が 読まれていない★');
T('★白い紙が 透けた（切る前の 紙のかどが alpha 0）', prep.paperCorner === 0, 'かどの alpha が ' + prep.paperCorner);
T('★出来た絵にも 透けた所が 在る（枠の外側の白が 残っていない）', prep.clearPct >= 5, '透けた点 ' + prep.clearPct + '%');
T('★まわりの余白が 切れた（900点 → 印影の大きさへ）', prep.w < 300 && prep.w > 100, '出来た幅 ' + prep.w);
T('★やった事を 言っている（黙って いじらない）', prep.did.length >= 2, 'did: ' + prep.did.join('/'));
T('★そろえた後でも 角印と 分かる', prep.guessed === 'kaku', '見分け: ' + prep.guessed);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
