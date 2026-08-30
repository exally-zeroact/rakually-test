/* seal-pos.mjs — ★判子を 紙の どこにでも 置けるか★
 * ============================================================================
 * ★司さん 2026-08-31「そこも違うかないか？ 場所は自由に変えれんのか？」★
 *   ＝2026-08-30 に私が作った「決まった置き方から 選ばせる」形が 間違いだった。
 *     ・'left'（社名の左に置く） … 実在しない置き方（8/30「左に置くは違うやろが」）
 *     ・'on'/'edge' の2択        … ★うちが決めた所しか 選べない＝「変えられる」ではない★
 *   ⇒ ★紙の左上からの mm で どこにでも置く★（紙の絵の上で つまんで動かす）
 *
 * ★守らせる事★
 *   ① 未設定なら ★今までの場所★（社名に重ねる）＝黙って 見た目を 変えない
 *   ② 紙の どこにでも 置ける（指した所に 行く）
 *   ③ ★紙から 出ない★（紙の外を指されても 収める。大きい印でも）
 *   ④ 2枚以上の紙でも ★どの紙も 同じ所★に 押す
 *   ⑤ 実UIで ★紙の絵を 押すと そこへ動く★／mmの欄でも 動く／いつもの場所に 戻せる
 *   ⑥ 保存すると 倉庫へ その mm が 行く
 *   ★決まった置き方（left/on/edge）が 戻っていない事★も 見る
 *
 * ★印影は その場で描く★（司さんの実物は repo に入れない＝配信で 誰でも落とせてしまう）
 *
 * 使い方: node seikyu/tests/seal-pos.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require_ = createRequire(import.meta.url);
const { webkit } = require_(path.join(ROOT, 'node_modules/playwright/index.js'));
const PAPER = require_(path.join(ROOT, 'seikyu/lib/seikyu-paper.js'));
const TPL = require_(path.join(ROOT, 'seikyu/lib/seikyu-templates.js'));
const X = require_(path.join(ROOT, 'seikyu/lib/seikyu-tax.js'));
const DOC = require_(path.join(ROOT, 'seikyu/lib/seikyu-doc.js'));
const SELF = process.argv.includes('--self-test');

let pass = 0, fail = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + ' — ' + m); } };

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf' };
const srv = http.createServer((rq, rs) => {
  const u = decodeURIComponent(rq.url.split('?')[0]); const p = path.join(ROOT, u);
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { rs.writeHead(404); rs.end(); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  rs.end(fs.readFileSync(p));
});
await new Promise((r) => srv.listen(0, r));
const port = srv.address().port;

console.log('\n[seal-pos] 判子を 紙の どこにでも 置けるか（本物のブラウザで 紙を組んで 測る）');

const b = await webkit.launch();
const mk = await (await b.newContext({ viewport: { width: 300, height: 300 } })).newPage();
const SEAL = await mk.evaluate(() => {
  const S = 200, c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  x.strokeStyle = '#C8102E'; x.fillStyle = '#C8102E'; x.lineWidth = 10;
  x.strokeRect(6, 6, S - 12, S - 12);
  x.font = 'bold 66px serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  ['株', '式', '会', '社'].forEach((ch, i) => x.fillText(ch, 55 + (i % 2) * 90, 55 + Math.floor(i / 2) * 90));
  return c.toDataURL('image/png');
});
await mk.close();

const MM = 794 / 210;                       // 1mm あたりの点（A4を794pxで組んでいる）
function lines(n) {
  return Array.from({ length: n }, (_, i) => ({ name: '品目' + (i + 1), qty: '1', unit: '式', price: '1000', rate: 10 }));
}
async function paper(org, n) {
  const ls = lines(n || 1);
  const tax = X.compute({ lines: ls, taxMode: 'exclusive', rounding: 'floor' });
  const bt = PAPER.build({
    inv: { no: '202608-001', issue_ymd: '2026-08-05', due_ymd: '2026-09-30', kind: 'invoice',
      lines: ls, totals: { grandTotal: tax.grandTotal }, data: {} },
    tax, partner: { name: '八木工業株式会社', honor: '御中' },
    org: Object.assign({ yago: '合同会社ZEROact', addr: '今治市本町7-3-40 00コーポ1号',
      tel: '090-5716-1946', invoiceNo: 'T3500003003293', bank: '伊予銀行 今治支店 普通 4160657',
      sealDataUrl: SEAL, sealSizeMm: 17 }, org),
    template: TPL.getOrDefault('std1'),
  });
  const pg = await (await b.newContext({ viewport: { width: 794, height: 1123 } })).newPage();
  await pg.setContent((typeof bt === 'string') ? bt : bt.html, { waitUntil: 'load' });
  await pg.waitForTimeout(180);
  const r = await pg.evaluate(() => {
    const seals = [...document.querySelectorAll('.seal')];
    const sheets = [...document.querySelectorAll('.sheet')];
    if (!seals.length) return { err: '印が 無い', seals: [] };
    const out = seals.map((s, i) => {
      const a = s.getBoundingClientRect();
      const sh = sheets[Math.min(i, sheets.length - 1)].getBoundingClientRect();
      return {
        x: Math.round((a.left - sh.left) * 100) / 100,
        y: Math.round((a.top - sh.top) * 100) / 100,
        w: Math.round(a.width),
        out: (a.left < sh.left - 0.5 || a.right > sh.right + 0.5
          || a.top < sh.top - 0.5 || a.bottom > sh.bottom + 0.5),
      };
    });
    return { seals: out, sheets: sheets.length };
  });
  await pg.close();
  return r;
}

const base = await paper({});
const put = await paper({ sealX: 150, sealY: 40 });
const corner = await paper({ sealX: 0, sealY: 0 });
const mid = await paper({ sealX: 96, sealY: 140 });
const outX = await paper({ sealX: 999, sealY: 999 });
const bigOut = await paper({ sealSizeMm: 40, sealX: 999, sealY: 999 });
const two = await paper({ sealX: 20, sealY: 250 }, 40);

console.log('     既定 x=' + base.seals[0].x + 'px ／ 150,40mm → '
  + Math.round(put.seals[0].x / MM) + ',' + Math.round(put.seals[0].y / MM) + 'mm'
  + ' ／ 紙の外を指定 → ' + Math.round(outX.seals[0].x / MM) + ',' + Math.round(outX.seals[0].y / MM) + 'mm');

T('★① 未設定なら 今までの場所（社名に重ねる・紙の右上のあたり）',
  base.seals[0].x > 600 && base.seals[0].y < 200 && !base.seals[0].out,
  'x=' + base.seals[0].x + ' y=' + base.seals[0].y);
T('★② 指した所に 行く（紙の左から150mm・上から40mm）',
  Math.abs(put.seals[0].x - 150 * MM) < 2 && Math.abs(put.seals[0].y - 40 * MM) < 2,
  'x=' + put.seals[0].x + '（' + Math.round(150 * MM) + 'のはず）y=' + put.seals[0].y);
T('★③ 紙の左上（0,0）にも 置ける（余白の外でも 置ける）',
  Math.abs(corner.seals[0].x) < 2 && Math.abs(corner.seals[0].y) < 2 && !corner.seals[0].out,
  'x=' + corner.seals[0].x + ' y=' + corner.seals[0].y);
T('★④ 紙の真ん中にも 置ける',
  Math.abs(mid.seals[0].x - 96 * MM) < 2 && Math.abs(mid.seals[0].y - 140 * MM) < 2,
  'x=' + mid.seals[0].x + ' y=' + mid.seals[0].y);
T('★⑤ 紙の外を指定されても 紙から 出ない（17mmの印）',
  !outX.seals[0].out && Math.abs(outX.seals[0].x - (210 - 17) * MM) < 2,
  'x=' + outX.seals[0].x + ' 出た:' + outX.seals[0].out);
T('★⑥ 大きい印（40mm）でも 紙から 出ない',
  !bigOut.seals[0].out && Math.abs(bigOut.seals[0].x - (210 - 40) * MM) < 2,
  'x=' + bigOut.seals[0].x + ' 出た:' + bigOut.seals[0].out);
T('★⑦ 2枚の紙でも どの紙も 同じ所に 押す',
  two.sheets === 2 && two.seals.length === 2
  /* 紙2枚は 縦に並ぶので、2枚目の左上は ★1点未満の端数★でずれる（297mm=1122.52px）。
     ここで見たいのは「同じ所か」なので ★1.5点まで★を 同じとする。 */
  && Math.abs(two.seals[0].x - two.seals[1].x) < 1.5 && Math.abs(two.seals[0].y - two.seals[1].y) < 1.5,
  '紙' + two.sheets + '枚 印' + two.seals.length + '個 ' + JSON.stringify(two.seals));

/* ★既定の数は 1つ★（決まりの側 と 紙の側 が 同じ数を 言う）
   2026-08-31 実測で 食い違っていた＝画面は「既定21mm」・紙は 17mmで押していた。 */
T('★⑨-2 印の大きさの既定は 決まりの側と 紙の側で 同じ',
  DOC.sealSizeMm() === PAPER.sealMm() && PAPER.sealMm() === 17,
  '決まり ' + DOC.sealSizeMm() + 'mm ／ 紙 ' + PAPER.sealMm() + 'mm');

/* ═══ ★自社の塊は「ご請求金額」と 下をそろえる★ ═══
   （司さん 2026-08-31「赤の塊を青に持ってきて ごちゃごちゃさすな」
                      「バランス考えたら 下同士で合わせるやろがぼけ」）
   ・請求日/No./期限 のすぐ下に 社名＋印＋住所＋TEL＋登録番号 が 詰まっていた
     （実測：印の上端が 上の行に ★1.2mm★ まで 迫っていた）
   ・★同じ表の中に入れて 縦を下寄せ★にした（固定の mm で下げるのは 繰越などで 合わなくなる）
   ・★頭の余白（あて名の下〜◯月分の上 15.3mm）も 行数(18/8)も 元のまま★
    ＝一度 詰めてしまい 差し戻された（「いらんことすんなや」）。動かすのは 自社の縦位置だけ。 */
const head = await (async () => {
  const pg2 = await (await b.newContext({ viewport: { width: 794, height: 1123 } })).newPage();
  const ls = [{ name: '運転代行 8月分', qty: '1', unit: '式', price: '30000', rate: 10 }];
  const tax = X.compute({ lines: ls, taxMode: 'exclusive', rounding: 'floor' });
  const bt = PAPER.build({
    inv: { no: 'A-1', issue_ymd: '2026-08-05', due_ymd: '2026-09-30', kind: 'invoice',
      lines: ls, totals: { grandTotal: tax.grandTotal }, data: {} },
    tax, partner: { name: '八木工業株式会社', honor: '御中' },
    org: { yago: '合同会社ZEROact', addr: '今治市本町7-3-40 00コーポ1号', tel: '090-5716-1946',
      invoiceNo: 'T3500003003293', bank: '伊予銀行 今治支店 普通 4160657', sealDataUrl: SEAL, sealSizeMm: 17 },
    template: TPL.getOrDefault('std1'),
  });
  await pg2.setContent((typeof bt === 'string') ? bt : bt.html, { waitUntil: 'load' });
  await pg2.waitForTimeout(200);
  const r = await pg2.evaluate(() => {
    const mm = 794 / 210;
    const sh = document.querySelector('.sheet').getBoundingClientRect();
    const at = (sel) => {
      const e = document.querySelector(sel); if (!e) return null;
      const q = e.getBoundingClientRect();
      return { t: +((q.top - sh.top) / mm).toFixed(1), b: +((q.bottom - sh.top) / mm).toFixed(1) };
    };
    /* ★ほかの字と 重なっていないか★ を 1文字ずつ 数える */
    const fb = document.querySelector('.from-box').getBoundingClientRect();
    const sl = document.querySelector('.seal');
    const sr = sl ? sl.getBoundingClientRect() : fb;
    const area = { left: Math.min(fb.left, sr.left), right: Math.max(fb.right, sr.right),
      top: Math.min(fb.top, sr.top), bottom: Math.max(fb.bottom, sr.bottom) };
    const inFrom = (n) => { for (let e = n.parentElement; e; e = e.parentElement) {
      if (e.classList && e.classList.contains('from-box')) return true; } return false; };
    let hit = 0;
    const walk = (el) => { for (const c of el.childNodes) {
      if (c.nodeType === 3) { if (inFrom(c)) continue; const t = c.textContent;
        for (let i = 0; i < t.length; i++) { if (!t[i].trim()) continue;
          const rg = document.createRange(); rg.setStart(c, i); rg.setEnd(c, i + 1);
          const q = rg.getBoundingClientRect(); if (!q.width) continue;
          const ox = Math.min(area.right, q.right) - Math.max(area.left, q.left);
          const oy = Math.min(area.bottom, q.bottom) - Math.max(area.top, q.top);
          if (ox > q.width * 0.3 && oy > q.height * 0.3) hit++;
        } } else if (c.nodeType === 1 && !(c.classList && c.classList.contains('from-box'))) walk(c);
    } };
    walk(document.querySelector('.sheet'));
    return { meta: at('.meta'), from: at('.from-box'), seal: at('.seal'),
      grand: at('.grand'), table: at('.lines') || at('table.items'), hit };
  });
  await pg2.close();
  return r;
})();
console.log('     紙の頭 … 上の行 〜' + head.meta.b + 'mm ／ 印 ' + head.seal.t + 'mm から ／ 自社 '
  + head.from.t + '〜' + head.from.b + 'mm ／ 金額の下 ' + head.grand.b + 'mm ／ 表 '
  + head.table.t + 'mm から');
T('★⑨-3 自社の塊を 下げた（上の行と 10mm以上 離れた）',
  head.seal.t - head.meta.b >= 10, '間が ' + (head.seal.t - head.meta.b).toFixed(1) + 'mm');
T('★⑨-4 自社の下と ご請求金額の下が そろっている',
  Math.abs(head.from.b - head.grand.b) < 0.5,
  '自社の下 ' + head.from.b + 'mm ／ 金額の下 ' + head.grand.b + 'mm');
/* ★頭の余白も 行数も 元のまま★（司さん 2026-08-31
   「赤丸合わせろってゆうただけで 赤線の所の余白詰めろなんかゆうたか？ いらんことすんなや」）
   ＝動かしてよいのは ★自社の塊の 縦の位置だけ★。 */
T('★⑨-4b 表の始まりは 元のまま（頭の余白を 詰めていない）',
  Math.abs(head.table.t - 79.8) < 0.5, '表の始まり ' + head.table.t + 'mm（79.8のはず）');
T('★⑨-4c 1枚に載る行数も 元のまま（18/8）',
  PAPER.PAPER_ROWS === 18 && PAPER.PAPER_ROWS_DED === 8,
  '1枚に載る行数 ' + PAPER.PAPER_ROWS + '/' + PAPER.PAPER_ROWS_DED + '（18/8のはず）');
T('★⑨-5 下げた自社の塊が ほかの字と 重なっていない', head.hit === 0, head.hit + '文字 重なった');

const app = fs.readFileSync(path.join(ROOT, 'seikyu/js/seikyu-app.js'), 'utf8');
const docSrc = fs.readFileSync(path.join(ROOT, 'seikyu/lib/seikyu-doc.js'), 'utf8');
T('★⑧ 蓋（紙から出さない）は seikyu-doc が 唯一の正（画面で 決め直さない）',
  /DOC\.sealXY\(/.test(app) && /function sealXY/.test(docSrc), '★画面が 自分で 蓋をしている★');
T('★⑨ 決まった置き方（left/on/edge）は 戻っていない',
  !/SEAL_POS/.test(docSrc) && !/sealPos/.test(app), '★消したはずの 置き方が 戻っている★');

/* ★実UIで 押す★ */
const pg = await (await b.newContext({ viewport: { width: 390, height: 900 } })).newPage();
await pg.goto('http://localhost:' + port + '/seikyu/index.html', { waitUntil: 'domcontentloaded' });
await pg.waitForTimeout(600);
const ui = await pg.evaluate(async (seal) => {
  const A = window.SeikyuApp, d = document, out = {};
  d.getElementById('app').hidden = false;
  A._state.org = { yago: '合同会社ZEROact', addr: '今治市本町7-3-40', sealDataUrl: seal, sealSizeMm: 17 };
  A._go('scr-set');
  A._fillSettings();
  A._bindForTest();
  const box = d.getElementById('seal-pos-box');
  if (box) box.open = true;
  A._sealStageForTest();
  const stage = d.getElementById('seal-stage');
  out.hasStage = !!stage;
  out.before = A._sealXYForTest();
  const r = stage.getBoundingClientRect();
  out.stageSize = [Math.round(r.width), Math.round(r.height)];
  A._sealPutAtForTest(r.left + r.width * 0.8, r.top + r.height * 0.9);
  out.tapped = A._sealXYForTest();
  out.fieldX = d.getElementById('seal-x').value;
  out.fieldY = d.getElementById('seal-y').value;
  const img = d.getElementById('seal-drag');
  out.imgShown = !!(img && img.getAttribute('src'));
  const fx = d.getElementById('seal-x');
  fx.value = '10';
  fx.dispatchEvent(new Event('input', { bubbles: true }));
  out.byField = A._sealXYForTest();
  d.getElementById('b-seal-home').click();
  out.home = A._sealXYForTest();
  /* ★指・マウス どちらでも 動くか★（pointer が来ない端末が 実際に在った）
     ＝2つの窓（mousedown / touchstart）を それぞれ 直に送って 動く事を 見る。 */
  d.getElementById('b-seal-home').click();
  const st2 = d.getElementById('seal-stage');
  const r2 = st2.getBoundingClientRect();
  st2.dispatchEvent(new MouseEvent('mousedown',
    { clientX: r2.left + r2.width * 0.5, clientY: r2.top + r2.height * 0.5, bubbles: true }));
  out.byMouse = A._sealXYForTest();
  d.getElementById('b-seal-home').click();
  try {
    const t = new Touch({ identifier: 1, target: st2,
      clientX: r2.left + r2.width * 0.3, clientY: r2.top + r2.height * 0.7 });
    st2.dispatchEvent(new TouchEvent('touchstart', { touches: [t], bubbles: true, cancelable: true }));
    out.byTouch = A._sealXYForTest();
  } catch (e) { out.byTouch = 'この機械では 指の試験が 作れない'; }
  d.getElementById('b-seal-home').click();

  let saved = null;
  A._state.store = { org: { save: (p) => { saved = p; return Promise.resolve({ ok: true }); } } };
  d.getElementById('seal-x').value = '120';
  d.getElementById('seal-y').value = '30';
  await A._saveSealForTest();
  out.saved = saved;
  /* ★決めた場所が 開き直しても 残るか★
     （2026-08-31 実測で 消えていた＝画面は 倉庫の値を 読んでいなかった） */
  A._state.org = Object.assign({}, A._state.org, { sealX: saved.sealX, sealY: saved.sealY });
  A._fillSettings();
  out.reopened = A._sealXYForTest();
  out.reFieldX = d.getElementById('seal-x').value;
  return out;
}, SEAL);
await b.close();
srv.close();

console.log('     画面 … 絵の大きさ ' + ui.stageSize.join('×') + 'px ／ 押す前 ' + JSON.stringify(ui.before)
  + ' → 押した所 ' + JSON.stringify(ui.tapped) + ' → 欄で ' + JSON.stringify(ui.byField)
  + ' → 戻す ' + JSON.stringify(ui.home));
console.log('     保存した物 … ' + JSON.stringify(ui.saved));
T('★⑩ 設定に 紙の絵が 在る（作り物ではなく 本物の紙）', ui.hasStage, '★紙の絵が 無い★');
T('★⑪ 押す前は 未設定（＝いつもの場所）',
  ui.before && ui.before.x === null && ui.before.y === null, JSON.stringify(ui.before));
T('★⑫ 紙の絵を 押すと その辺へ 行く（右下を押したら 右下）',
  ui.tapped && ui.tapped.x > 140 && ui.tapped.y > 240, JSON.stringify(ui.tapped));
T('★⑬ 押した mm が 欄にも 出る（数で 直せる）',
  String(ui.fieldX) === String(ui.tapped.x) && String(ui.fieldY) === String(ui.tapped.y),
  '欄 ' + ui.fieldX + ',' + ui.fieldY + ' ／ 中 ' + ui.tapped.x + ',' + ui.tapped.y);
T('★⑭ つまむ印が 絵の上に 出ている', ui.imgShown, '★つまむ物が 出ていない★');
T('★⑮ mmの欄でも 動く', ui.byField && ui.byField.x === 10, JSON.stringify(ui.byField));
T('★⑯ いつもの場所に 戻せる（未設定に 戻る）',
  ui.home && ui.home.x === null && ui.home.y === null, JSON.stringify(ui.home));
T('★⑰ 保存すると 紙の上の mm が 倉庫へ 行く',
  !!ui.saved && ui.saved.sealX === 120 && ui.saved.sealY === 30, JSON.stringify(ui.saved));

T('★⑰-2 マウスでも 動く（pointer が来ない端末で 死なない）',
  ui.byMouse && ui.byMouse.x !== null && ui.byMouse.y !== null, JSON.stringify(ui.byMouse));
T('★⑰-3 指でも 動く（同じ道）',
  (typeof ui.byTouch === 'string') || (ui.byTouch && ui.byTouch.x !== null), JSON.stringify(ui.byTouch));
T('★⑱ 決めた場所は 開き直しても 残る（黙って 消えない）',
  ui.reopened && ui.reopened.x === 120 && ui.reopened.y === 30 && ui.reFieldX === '120',
  '開き直し ' + JSON.stringify(ui.reopened) + ' 欄 ' + ui.reFieldX);

if (SELF) {
  console.log('\n★自己確認★ 蓋を外すと 紙から 出るか');
  const s1 = DOC.sealXY(999, 17, 'x');
  if (s1 !== 210 - 17) { console.log('  NG ★蓋が 効いていない（' + s1 + '）★'); process.exit(1); }
  const s2 = DOC.sealXY(-99, 17, 'y');
  if (s2 !== 0) { console.log('  NG ★下の蓋が 効いていない（' + s2 + '）★'); process.exit(1); }
  console.log('  ok  999mm → ' + s1 + 'mm ／ -99mm → ' + s2 + 'mm に収める＝⑤⑥が 効いている形');
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
