/* seal-pos.mjs — ★判子の場所を 変えられるか★
 * ============================================================================
 * ★司さん 2026-08-30「ハンコの位置は変えれるようにしてる？」★
 *   ＝それまでは ★大きさ（mm）しか 変えられなかった★。場所は CSSに焼き付けていた。
 *
 * ★出来る事★
 *   ・場所 … 社名に重ねる（既定）／★社名の末尾に かける★（代行請求と同じ深さ＝印の55%が外へ）
 *   ・そこから 横・縦に mm で ずらす（＋は 右／下）
 *   ★「社名の左に置く」は 消した★（司さん 2026-08-30「左に置くは違うやろが」）
 *     ＝角印を 社名の左に置く紙は 実在しない。★実在しない置き方を 選ばせない★。
 *
 * ★守らせる事★
 *   ① 既定は 今までと 同じ（社名に重ねる）＝黙って 見た目を 変えない
 *   ② 「末尾に かける」なら 印が 右へ出て ★隠れる字が 減る★（TELや登録番号が 読める）
 *   ③ ずらしたぶん だけ 動く（動いていない、を許さない）
 *   ④ ★どう動かしても 紙から 出ない★（±10mm＝紙の余白と同じ蓋。越える指定は 蓋に収める）
 *   ⑤ 設定の下見と 紙は ★同じ決め方（PAPER.sealStyle）★＝2つの正を作らない
 *   ⑥ 実UIで 選ぶ→下見が変わる／保存すると 倉庫へ その値が行く
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

console.log('\n[seal-pos] 判子の場所を 変えられるか（本物のブラウザで 紙を組んで 測る）');

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

const LINES = [{ name: '運転代行 8月分', qty: '1', unit: '式', price: '30000', rate: 10 }];
const TAX = X.compute({ lines: LINES, taxMode: 'exclusive', rounding: 'floor' });
async function paper(org) {
  const bt = PAPER.build({
    inv: { no: '202608-001', issue_ymd: '2026-08-05', due_ymd: '2026-09-30', kind: 'invoice',
      lines: LINES, totals: { grandTotal: TAX.grandTotal }, data: {} },
    tax: TAX, partner: { name: '八木工業株式会社', honor: '御中' },
    org: Object.assign({ yago: '合同会社ZEROact', addr: '今治市本町7-3-40 00コーポ1号',
      tel: '090-5716-1946', invoiceNo: 'T3500003003293', bank: '伊予銀行 今治支店 普通 4160657',
      sealDataUrl: SEAL, sealSizeMm: 17 }, org),
    template: TPL.getOrDefault('std1'),
  });
  const pg = await (await b.newContext({ viewport: { width: 794, height: 1123 } })).newPage();
  await pg.setContent((typeof bt === 'string') ? bt : bt.html, { waitUntil: 'load' });
  await pg.waitForTimeout(200);
  const r = await pg.evaluate(() => {
    const s = document.querySelector('.seal'), n = document.querySelector('.from-name');
    if (!s || !n) return { err: '印か社名が 無い' };
    const a = s.getBoundingClientRect();
    const hid = []; let all = 0;
    const walk = (el) => {
      for (const c of el.childNodes) {
        if (c.nodeType === 3) {
          const t = c.textContent;
          for (let i = 0; i < t.length; i++) {
            if (!t[i].trim()) continue;
            const rg = document.createRange(); rg.setStart(c, i); rg.setEnd(c, i + 1);
            const g = rg.getBoundingClientRect(); if (!g.width) continue;
            all++;
            const ox = Math.min(a.right, g.right) - Math.max(a.left, g.left);
            const oy = Math.min(a.bottom, g.bottom) - Math.max(a.top, g.top);
            if (ox > g.width * 0.4 && oy > g.height * 0.4) hid.push(t[i]);
          }
        } else if (c.nodeType === 1 && c !== s) walk(c);
      }
    };
    walk(n.parentElement);
    const sh = document.querySelector('.sheet').getBoundingClientRect();
    return { x: Math.round(a.left), y: Math.round(a.top), w: Math.round(a.width),
      out: (a.left < sh.left - 0.5 || a.right > sh.right + 0.5 || a.top < sh.top - 0.5 || a.bottom > sh.bottom + 0.5),
      all, hidden: hid.join('') };
  });
  await pg.close();
  return r;
}

const base = await paper({});
const edge = await paper({ sealPos: 'edge' });
const dx = await paper({ sealDx: -5 });
const dy = await paper({ sealDy: 3 });
const over = await paper({ sealDx: 99, sealDy: -99 });
const ends = [
  await paper({ sealDx: 10 }), await paper({ sealDx: -10 }),
  await paper({ sealDy: 10 }), await paper({ sealDy: -10 }),
  await paper({ sealSizeMm: 40, sealDx: 10, sealDy: -10 }),
  await paper({ sealPos: 'edge', sealSizeMm: 40, sealDx: 10, sealDy: 10 }),
  await paper({ sealPos: 'edge', sealDx: 10 }),
];
console.log('     既定 x=' + base.x + '（隠れた字 ' + base.hidden.length + '）'
  + ' ／ 末尾にかける x=' + edge.x + '（隠れた字 ' + edge.hidden.length + '）'
  + ' ／ 横-5mm x=' + dx.x + ' ／ 縦+3mm y=' + dy.y);

T('★① 既定は 今までと同じ（社名の右端に 重ねる）', base.x > 600 && base.hidden.length > 0,
  'x=' + base.x + ' 隠れた字 ' + base.hidden.length);
T('★② 「末尾に かける」と 印が 右へ出て 隠れる字が 減る',
  edge.x > base.x && edge.hidden.length < base.hidden.length,
  'x=' + edge.x + '（既定 ' + base.x + '）隠れた字 ' + edge.hidden.length + '（既定 ' + base.hidden.length + '）');
T('★②-2 「末尾に かける」深さは 代行と同じ（印の55%が 名前の外へ）',
  Math.abs((edge.x - base.x) - Math.round(64 * 0.55)) <= 2,
  '外へ出た ' + (edge.x - base.x) + 'px（印64pxの55%＝35pxのはず）');
T('★③ 横にずらすと そのぶん 動く（-5mm ≒ -19px）',
  Math.abs((base.x - dx.x) - 19) <= 2, '動いた ' + (base.x - dx.x) + 'px');
T('★④ 縦にずらすと そのぶん 動く（+3mm ≒ +11px）',
  Math.abs((dy.y - base.y) - 11) <= 2, '動いた ' + (dy.y - base.y) + 'px');
T('★⑤ 蓋を越える指定は 蓋に収める（99mm → 10mm）',
  !over.out && over.x === ends[0].x, 'x=' + over.x + ' / 10mmのとき ' + ends[0].x);
T('★⑥ どう動かしても 紙から 出ない（端・大きい印・末尾かけ ぜんぶ）',
  ends.every((r) => !r.out), '紙から出た組み合わせが ' + ends.filter((r) => r.out).length + '件');
T('★⑦ 印は ちゃんと 出ている（測れていない を 緑にしない）',
  base.w > 50 && base.all > 30, '印の幅 ' + base.w + ' 自社の字 ' + base.all);

/* ★決め方は1つ★（紙も 設定の下見も 同じ関数を通る） */
const app = fs.readFileSync(path.join(ROOT, 'seikyu/js/seikyu-app.js'), 'utf8');
T('★⑧ 設定の下見も 紙と 同じ決め方を 通る（2つの正を 作らない）',
  /PAPER\.sealStyle\(/.test(app), '★画面が 場所を 自分で 決め直している★');
T('★⑨ 場所の決まりは seikyu-doc が 唯一の正（画面で 蓋を 決め直さない）',
  /DOC\.sealPos\(/.test(app) && /DOC\.sealNudgeMm\(/.test(app), '★画面が 自分で 蓋をしている★');

/* ★実UIで 押す★ */
const pg = await (await b.newContext({ viewport: { width: 390, height: 800 } })).newPage();
await pg.goto('http://localhost:' + port + '/seikyu/index.html', { waitUntil: 'domcontentloaded' });
await pg.waitForTimeout(600);
const ui = await pg.evaluate(async (seal) => {
  const A = window.SeikyuApp, doc = document, out = {};
  doc.getElementById('app').hidden = false;
  A._state.org = { yago: '合同会社ZEROact', addr: '今治市本町7-3-40', sealDataUrl: seal, sealSizeMm: 17 };
  A._go('scr-set');
  A._fillSettings();
  /* ★選ぶ所に 手を紐づける★（bind は attach の中＝倉庫の無い試験からは 呼べない）
     ＝これを忘れると「動かない」ではなく「押せていない」を 見てしまう（2026-08-30 実際に そうなった） */
  A._bindForTest();
  const demo = doc.getElementById('seal-demo');
  const sealOf = () => {
    const el = demo.querySelector('.sd-seal');
    return el ? Math.round(el.getBoundingClientRect().left) : null;
  };
  out.hasPos = !!doc.getElementById('seal-pos');
  out.opts = [...(doc.getElementById('seal-pos') || { options: [] }).options].map((o) => o.value);
  out.base = sealOf();
  const sel = doc.getElementById('seal-pos');
  sel.value = 'edge';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  out.edge = sealOf();
  sel.value = 'on';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  const dxEl = doc.getElementById('seal-dx');
  dxEl.value = '-5';
  dxEl.dispatchEvent(new Event('input', { bubbles: true }));
  out.dx = sealOf();
  /* 保存すると 倉庫へ その値が行くか（倉庫は 偽物にして 受け取った物を 見る） */
  let saved = null;
  A._state.store = { org: { save: (p) => { saved = p; return Promise.resolve({ ok: true }); } } };
  doc.getElementById('seal-pos').value = 'edge';
  doc.getElementById('seal-dy').value = '2.5';
  await A._saveSealForTest();
  out.saved = saved;
  return out;
}, SEAL);
await b.close();
srv.close();

console.log('     画面の下見 … 既定 x=' + ui.base + ' ／ 末尾にかける x=' + ui.edge + ' ／ 横-5mm x=' + ui.dx);
console.log('     保存した物 … ' + JSON.stringify(ui.saved));
T('★⑩ 設定に 場所を選ぶ所が 在る（2通り・★左に置く は 出さない★）',
  ui.hasPos && ui.opts.join(',') === 'on,edge', '出た選択肢: ' + ui.opts.join(','));
T('★⑪ 選ぶと 下見が その場で 動く（紙を出さないと分からない を 作らない）',
  ui.edge !== null && ui.base !== null && ui.edge > ui.base, '既定 ' + ui.base + ' / 末尾 ' + ui.edge);
T('★⑫ ずらすと 下見も 動く', ui.dx !== null && ui.dx < ui.base, '既定 ' + ui.base + ' / -5mm ' + ui.dx);
T('★⑬ 保存すると 場所とずれが 倉庫へ 行く',
  !!ui.saved && ui.saved.sealPos === 'edge' && ui.saved.sealDy === 2.5,
  '保存した物: ' + JSON.stringify(ui.saved));

if (SELF) {
  console.log('\n★自己確認★ 蓋を外すと 紙から 出るか');
  const s = PAPER.sealStyle({ sealSizeMm: 17, sealDx: 99 });
  const m = /right:(-?[\d.]+)mm/.exec(s);
  if (!m || Number(m[1]) !== -10) { console.log('  NG ★蓋が 効いていない（' + s + '）★'); process.exit(1); }
  const big = PAPER.sealStyle({ sealSizeMm: 40, sealPos: 'edge' });
  if (!/right:-10mm/.test(big)) { console.log('  NG ★大きい印の はみ出しが 頭打ちに なっていない（' + big + '）★'); process.exit(1); }
  console.log('  ok  99mm と言われても -10mm に収めている＝⑤⑥が 効いている形');
  const d = DOC.sealNudgeMm(99);
  if (d !== DOC.SEAL_NUDGE_MAX) { console.log('  NG ★決まりの側の蓋が 効いていない★'); process.exit(1); }
  console.log('  ok  決まりの側も ' + d + 'mm に収める');
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
