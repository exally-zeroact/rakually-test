/* gensen-soto-tomeru.mjs — ★Web明細の 紙が 外の物の 返事待ちで 「読み込み中…」の まま 止まらない★（2026-11-06）
 * =============================================================================
 * ★守る事★
 *   倉庫の 源泉徴収票（app.js nenGensenDoc が 11-06 まで 作った 紙）は head に Google Fonts の link が在る。
 *   返事が 来ない 回線だと iframe は 真っ白・onload が 来ない＝従業員の 画面が 「明細を読み込み中…」の まま 止まった。
 *   直し＝meisai.js sotoWoTomeru が <head> の 直後に CSP を 差す（外の物を 一切 読まない）。
 * ★この歯★（本物の meisai.html を 手元の http で 開き、本物の renderPayslip を 呼ぶ）
 *   ・外の物には ★返事を 一切 返さない★（取り消し・500 では onload が 来て 空振りする＝taiketsu 11-06 止1）
 *   (a) 倉庫に 在る 本物の 並び（href が 先・rel が 後＝93525d5 から 1形だけ）で 2秒以内に 札が 下がり 読み終わる
 *   (b) 取りこぼしやすい 形 8つ（@font-face・@import・preload・preconnect・img・body の link・media=print・大文字）も 同じ
 *   (c) 普通の 明細（Render.build）は meta が 1つ 増える だけ・1字も 変わらない・描き方は CSS1Compat
 * ★わざと(--waza)★ … sotoWoTomeru を 通さない 形を 配り、(a) が 赤に なる 事を 確かめる（歯が 新旧を 見分ける 証し）。
 * 使い方: node kyuyo/tests/gensen-soto-tomeru.mjs [--waza] [--kind=webkit]
 * ★本物の 名前・金額・住所は 入れない★（rakually-test は 公開 repo）
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WAZA = process.argv.includes('--waza');
const KIND = (process.argv.find((a) => a.startsWith('--kind=')) || '--kind=chromium').slice(7);

const NEW = 'f.srcdoc=sotoWoTomeru(html);';
const OLD = 'f.srcdoc=html;';
const meisaiSrc = () => {
  let s = fs.readFileSync(path.join(ROOT, 'kyuyo/js/meisai.js'), 'utf8');
  if (WAZA) {
    if (s.indexOf(NEW) < 0) { console.log('✗ ★--waza の 差し込み先（meisai.js renderPayslip の srcdoc）が 見つからない＝字が ずれた★'); process.exit(1); }
    s = s.replace(NEW, OLD);
  }
  return s;
};

const { borrow, launch } = await import('../../scripts/_borrow-playwright.mjs');
const pwType = await borrow('gensen-soto-tomeru', KIND);
/* ★次の 行には 来ない★＝borrow が 借りられない時は 自分で 終わる（毎回の CI＝未測定で 緑／webkit.yml＝MEASURE_REQUIRED=1 で 赤）。
   ⇒ ★本当に 測るのは webkit.yml★（ci.yml の 段は 押す前の 網で 手元の chromium が 測る為） */
if (!pwType) { console.log('🟡 ★未測定★ playwright を 借りられない（0件＝合格 とは 書かない）'); process.exit(2); }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
const srv = http.createServer((rq, rs) => {
  const u = decodeURIComponent(rq.url.split('?')[0]);
  const p = path.join(ROOT, u);
  if (/kyuyo[\\/]js[\\/]meisai\.js$/.test(p)) { rs.writeHead(200, { 'content-type': 'text/javascript' }); rs.end(meisaiSrc()); return; }
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { rs.writeHead(404); rs.end('x'); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  rs.end(fs.readFileSync(p));
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const PORT = srv.address().port;
const br = await launch('gensen-soto-tomeru', pwType, undefined, KIND);

let pass = 0, fail = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };

/* ★倉庫に 在る 本物の 並び★（93525d5 の app.js nenGensenDoc の 字そのまま＝11-06 の 押しD で 消すまで 変わらなかった 1形） */
const HONMONO_LINK = '<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@500&family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">';
const GENSEN_HEAD = '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">';
const GENSEN_BODY = '<style>body{font-family:"Noto Sans JP",sans-serif;margin:0;padding:12px;}.gensen{border:2px solid #333;padding:12px;}</style></head><body><div class="gensen">令和7年分　給与所得の源泉徴収票（試験）</div></body></html>';
const H = 'https://hang.example.invalid';
const CASES = [
  ['(a) 倉庫の 本物の 並び（href が 先）', GENSEN_HEAD + HONMONO_LINK + GENSEN_BODY],
  ['(b) @font-face の 外の url', GENSEN_HEAD + `<style>@font-face{font-family:X;src:url(${H}/x.woff2)}body{font-family:X}</style>` + GENSEN_BODY],
  ['(b) @import', GENSEN_HEAD + `<style>@import url(${H}/a.css);</style>` + GENSEN_BODY],
  ['(b) preload', GENSEN_HEAD + `<link rel="preload" as="style" href="${H}/a.css">` + GENSEN_BODY],
  ['(b) preconnect', GENSEN_HEAD + `<link rel="preconnect" href="${H}">` + GENSEN_BODY],
  ['(b) 外の img', GENSEN_HEAD + GENSEN_BODY.replace('</div>', `</div><img src="${H}/a.png">`)],
  ['(b) body の 中の link', GENSEN_HEAD + GENSEN_BODY.replace('</div>', `</div><link rel="stylesheet" href="${H}/a.css">`)],
  ['(b) media=print', GENSEN_HEAD + `<link rel="stylesheet" media="print" href="${H}/a.css">` + GENSEN_BODY],
  ['(b) 大文字・一重引用符', GENSEN_HEAD + `<LINK REL=STYLESHEET HREF='${H}/a.css'>` + GENSEN_BODY],
  ['(b) head が 無く <header> が 在る（meta を header に 当てない）', `<!doctype html><html lang="ja"><body><header>見出し</header><link rel="stylesheet" href="${H}/a.css"><div class="gensen">令和7年分（試験）</div></body></html>`],
];

console.log('\n[gensen-soto-tomeru] Web明細の 紙が 外の物の 返事待ちで 止まらない（' + KIND + (WAZA ? '・--waza' : '') + '）');
const ctx = await br.newContext({ viewport: { width: 390, height: 900 } });
const pg = await ctx.newPage();
const errs = [];
pg.on('pageerror', (e) => errs.push(String((e && e.message) || e).slice(0, 120)));
/* ★外の物には 返事を 一切 返さない★（手元の http だけ 通す） */
await pg.route((u) => !/^http:\/\/127\.0\.0\.1:/.test(String(u)), () => {});
await pg.goto('http://127.0.0.1:' + PORT + '/kyuyo/meisai.html', { waitUntil: 'domcontentloaded', timeout: 20000 });
await pg.waitForFunction(() => !!window.MeisaiMiseru && !!window.Render, null, { timeout: 15000 });

/* 開いて 2秒（3秒の 受け皿より 前）で 札・読み終わり・中身を 見る */
const hiraku = (html) => pg.evaluate((h) => new Promise((ok) => {
  document.getElementById('sc-view').classList.remove('hidden');
  window.MeisaiMiseru.renderPayslip(h, 794, 1123);
  setTimeout(() => {
    const f = document.getElementById('frame'), load = document.getElementById('ps-loading');
    const d = f.contentDocument;
    ok({ fuda: load ? load.style.display : '?', ready: d ? d.readyState : null, mode: d ? d.compatMode : null,
      gensen: !!(d && d.querySelector('.gensen,.sheet,.page')), h: f.style.height });
  }, 2000);
}), html);

const ochita = [];
for (const [na, html] of CASES) {
  const r = await hiraku(html);
  const ok = r.fuda === 'none' && r.ready === 'complete' && r.gensen;
  if (WAZA) { if (na.startsWith('(a)')) T('(a) --waza＝外さないと 2秒で 札が 下がらず 読み終わらない（歯が 見分ける）', !ok, JSON.stringify(r)); continue; }
  T(na + '＝2秒以内に 札が 下がり 読み終わる', ok, JSON.stringify(r));
  T(na + '＝描き方が 崩れない（CSS1Compat）', r.mode === 'CSS1Compat', 'mode=' + r.mode);
  if (!ok) ochita.push(na);
}

if (!WAZA) {
  /* (c) 普通の 明細＝meta が 1つ 増える だけ */
  const c = await pg.evaluate(() => {
    const out = window.Render.build([{ name: '試験 太郎', company: '試験会社', payDate: '2026-06-25', net: 123456,
      kintai: [{ label: '出勤日数', value: '20日' }], shikyu: [{ label: '基本給', value: 150000 }], shikyuTotal: 150000,
      kojo: [{ label: '所得税', value: 26544 }], kojoTotal: 26544 }], { month: '2026年6月', kind: 'kyuyo' }, 'col2_1');
    const html = out.html, aft = window.MeisaiMiseru.sotoWoTomeru(html);
    const meta = (aft.match(/<meta http-equiv="Content-Security-Policy"[^>]*>/) || [''])[0];
    return { onaji: !!meta && aft.replace(meta, '') === html, kazu: (aft.match(/Content-Security-Policy/g) || []).length, html };
  });
  T('(c) 普通の 明細は CSP の meta が 1つ 増える だけ（ほかは 1字も 変わらない）', c.onaji && c.kazu === 1, 'onaji=' + c.onaji + ' kazu=' + c.kazu);
  const r = await hiraku(c.html);
  T('(c) 普通の 明細も 2秒以内に 札が 下がり 紙が 在る', r.fuda === 'none' && r.ready === 'complete' && r.gensen, JSON.stringify(r));
  T('(c) 普通の 明細の 描き方は CSS1Compat', r.mode === 'CSS1Compat', 'mode=' + r.mode);
  /* head の 無い 字だけの 紙も 包んで 見せる */
  const z = await hiraku('<div class="gensen">字だけ</div>');
  T('(c) head の 無い 紙も 包んで 見せる', z.fuda === 'none' && z.ready === 'complete' && z.gensen, JSON.stringify(z));
}
T('JSエラー 0', errs.length === 0, errs.join(' | '));

await ctx.close(); await br.close(); srv.close();
console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
