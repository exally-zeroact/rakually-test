/* kami-chijimi.mjs — ★生きた紙が 本物の ブラウザで 枠に 収まるか★（試験㋕・taiketsu 10回目 B／11回目の 見立て）
 * ============================================================================
 * ★なぜ★ kami-ikiru.mjs は jsdom＝srcdoc の load が 0回・幅も 0＝★縮み（transform）と 枠の 高さは 1つも 測れない★。
 *   表 #pv と 裏 #pv-ura の id を 入れ替える 作りなので、入れ替えた 後に 縮め直さないと
 *   ★スマホで 紙の 右が 切れて 金額が 見えない★／★枠の 高さが 前の 紙の まま★（数字には 出ない型＝描いた物を 測る）。
 *
 * ★ここで見る事★（chromium と webkit・幅 320 / 390 / 1280・load が すぐ と 400ms 遅れ）
 *   ① 打って 落ち着いた 後、表 #pv の 縮み k ＝ min(1, 枠の幅 / 紙の幅)（±0.01）・スマホは k<1
 *   ② 枠 #pv-wrap の 高さ ＝ ceil(紙の高さ × k)（±2px）
 *   ③ 紙の 右端が 枠の 右端を 越えない（切れない）・表の 紙に 今の 金額が 在る・裏は 見えない
 *   ④ 金額を 打ち替えて 入れ替えた 後も ①〜③
 *   ⑤ 裏に 書いた 直後に 一覧へ 出て（入れ替えと load が 画面の 外で 起きる）戻った 後も ①〜③
 *   ⑥ 空振り止め＝12通り 全部 測った（0件で 緑に しない）
 *   ★load の 遅れ★＝#pv-wrap の 中の iframe だけ、srcdoc の 反映を 400ms 遅らせる（読む 値は すぐ 返す＝本体の 比べは 変わらない）。
 *     ＝260ms の 時計で 入れ替えた 時、表の 文書は まだ 前の 物（読み途中の 文書で 測る 筋）。
 *
 * ★--waza★ … 縮め直しを 1つずつ 外した 本体で 回し、どれも ★狙った 試験で★ 赤に なるか（chromium・390 だけ）
 *
 * 使い方: node seikyu/tests/kami-chijimi.mjs   ／   --waza
 *   ・ブラウザが 無い時は「未測定」（週1の webkit.yml では 赤）＝scripts/_borrow-playwright.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { borrow, launch as pwLaunch } from '../../scripts/_borrow-playwright.mjs';

const ME = fileURLToPath(import.meta.url);
const ROOT = path.join(path.dirname(ME), '..', '..');

/* ★わざと 外す 縮め直し★（[本体の字, 置き換え, 赤に なるべき 試験の 名]） */
const WAZA = {
  '表の load で 縮め直さない': ["if (this.id === 'pv') { fitPreview(); return; }", "if (this.id === 'pv') { return; }", '② load が 遅い'],
  /* taiketsu 本番前 件1 任2＝入れ替えの 直後の 縮め直し（load が すぐ だと 裏の 時に load が 済んでいて、表に なった 後の load は 来ない） */
  '入れ替えの 直後に 縮め直さない': ['    fitPreview();                    /* ★入れ替えの 直後にも 1回 縮め直す★', '    void 0;                          /* ★入れ替えの 直後にも 1回 縮め直す★', '① load が すぐ'],
  '入力の 画面へ 戻っても 縮め直さない':["if (id === 'scr-edit') { kamiIma(); fitPreview(); }", "if (id === 'scr-edit') { kamiIma(); }", '③ 一覧へ 出て 戻った'],
};
if (process.argv.includes('--waza') || process.argv.includes('--self-test')) {
  console.log('\n[--waza 縮め直しを 外すと 赤に なるか]');
  let aka = 0;
  const names = Object.keys(WAZA);
  for (const name of names) {
    const r = spawnSync(process.execPath, [ME], { env: Object.assign({}, process.env, { KAMI_WAZA: name }), encoding: 'utf8', timeout: 170000 });
    const out = (r.stdout || '') + (r.stderr || '');
    if (/置き換えが 当たらない/.test(out)) { console.log('  ✗ 置き換えが 当たらない（試験の 方が 壊れている）：' + name); continue; }
    const hit = (out.split('\n').find((l) => /^\s*✗ /.test(l) && l.includes(WAZA[name][2])) || '').trim();
    const red = r.status === 1 && hit !== '';
    if (red) aka++;
    console.log('  ' + (red ? '✓ 赤になった' : '✗ 赤にならない（空振り・狙い「' + WAZA[name][2] + '」 status=' + r.status + '）') + '：' + name + (red ? '（' + hit.slice(0, 100) + '）' : ''));
  }
  console.log('\n' + aka + '/' + names.length + ' 赤になった');
  process.exit(aka === names.length ? 0 : 1);
}
const wazaName = process.env.KAMI_WAZA || '';

let pass = 0, fail = 0;
const T = (n, f) => { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m); };

/* ★本体の 読み込みは 本番と 同じ index.html★。倉庫・ログインの 3本だけ 抜いて、作り物の 倉庫（tests/fake-supa.js）を 足す */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
const srv = http.createServer((rq, rs) => {
  const u = decodeURIComponent(rq.url.split('?')[0]);
  if (u === '/__fake-supa.js') {
    rs.writeHead(200, { 'content-type': 'text/javascript' });
    rs.end('(function(){var module={exports:{}};' + fs.readFileSync(path.join(ROOT, 'tests/fake-supa.js'), 'utf8') + '\nwindow.FakeSupa=module.exports;})();');
    return;
  }
  const p = path.join(ROOT, u);
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { rs.writeHead(404); rs.end(); return; }
  let body = fs.readFileSync(p);
  if (u === '/seikyu/index.html') {
    let h = body.toString('utf8');
    const n0 = h.length;
    h = h.replace(/<script src="[^"]*(supa-config|rakunally-login|seikyu\/js\/auth|js\/auth|env-badge)\.js[^"]*"><\/script>/g, '');
    if (h.length === n0) { console.log('★index.html の 倉庫・ログインの 行が 見つからない（試験が 古い）'); process.exit(2); }
    h = h.replace('</body>', '<script src="/__fake-supa.js"></script></body>');
    body = h;
  } else if (wazaName && u === '/seikyu/js/seikyu-app.js') {
    const [from, to] = WAZA[wazaName] || [];
    const code = body.toString('utf8');
    if (!from || code.split(from).length !== 2) { console.log('★置き換えが 当たらない：' + wazaName); process.exit(2); }
    body = code.replace(from, to);
  }
  rs.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
  rs.end(body);
});
await new Promise((r) => srv.listen(0, r));
const port = srv.address().port;

const TABLES = {
  pay_org: [{ account_id: 'u1', data: { yago: '株式会社見本', addr: '東京都架空区見本台4-5-6', tel: '090-0000-0000', invoiceNo: 'T1234567890123' }, updated_at: '2026-08-01T00:00:00Z' }],
  pay_partners: [{ id: 'pt_a', account_id: 'u1', sort: 0, data: { name: '標様建設株式会社', keisho: '御中', addr: '東京都架空区見本台1-2-3' }, deleted_at: null }],
  pay_invoices: [], pay_receipts: [],
  pay_companies: [{ account_id: 'u1', data: {}, updated_at: '2026-08-01T00:00:00Z' }],
};
/* ★load を 遅らせる★＝#pv-wrap の 中の iframe だけ。読む 値（.srcdoc）は 書いた 値を すぐ 返す */
const OSOI_INIT = (ms) => {
  const d = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'srcdoc');
  Object.defineProperty(HTMLIFrameElement.prototype, 'srcdoc', {
    configurable: true,
    get() { return this.__osoiV !== undefined ? this.__osoiV : d.get.call(this); },
    set(v) {
      if (!this.closest || !this.closest('#pv-wrap')) { d.set.call(this, v); return; }
      this.__osoiV = v;
      clearTimeout(this.__osoiT);
      this.__osoiT = setTimeout(() => d.set.call(this, v), ms);
    },
  });
};

const SETTLE = { 0: 900, 400: 1500 };
const BROWSERS = wazaName ? ['chromium'] : ['chromium', 'webkit'];
const WIDTHS = wazaName ? [390] : [320, 390, 1280];
const OSOI = [0, 400];
const bad = { 1: [], 2: [], 3: [] };
let measured = 0;

async function hakaru(pg, kingaku) {
  return pg.evaluate((kin) => {
    const f = document.getElementById('pv'), w = document.getElementById('pv-wrap'), u = document.getElementById('pv-ura');
    const d = f && f.contentDocument;
    const pw = Math.max(320, d.documentElement.scrollWidth), ph = Math.max(320, d.documentElement.scrollHeight);
    const tr = getComputedStyle(f).transform;
    const k = tr && tr !== 'none' ? new DOMMatrix(tr).a : 1;
    const fr = f.getBoundingClientRect(), wr = w.getBoundingClientRect();
    return {
      k, pw, ph, wrapW: w.clientWidth, wrapH: w.getBoundingClientRect().height,
      right: fr.right, wrapRight: wr.right, fw: fr.width,
      kin: (d.body && d.body.textContent || '').includes(kin),
      uraMieru: u ? getComputedStyle(u).visibility !== 'hidden' : false,
      maku: getComputedStyle(document.getElementById('pv-maku')).display !== 'none',
    };
  }, kingaku);
}
function mikiru(tag, m, mobile, which) {
  measured++;
  const want = Math.min(1, m.wrapW / m.pw);
  const why = [];
  if (!(Math.abs(m.k - want) <= 0.01)) why.push('縮み k=' + m.k.toFixed(3) + '（枠 ' + m.wrapW + ' / 紙 ' + m.pw + ' ＝ ' + want.toFixed(3) + ' の筈）');
  if (mobile && !(m.k < 1)) why.push('スマホなのに 縮んでいない k=' + m.k.toFixed(3));
  if (!(Math.abs(m.wrapH - Math.ceil(m.ph * want)) <= 2)) why.push('枠の高さ ' + Math.round(m.wrapH) + 'px（' + Math.ceil(m.ph * want) + 'px の筈）');
  if (!(m.right <= m.wrapRight + 1)) why.push('紙の右端が 枠を ' + Math.round(m.right - m.wrapRight) + 'px 越えた（切れる）');
  if (!(m.fw > 0)) why.push('紙の幅 0');
  if (!m.kin) why.push('表の紙に 今の金額が 無い');
  if (m.uraMieru) why.push('裏の紙が 見えている');
  if (m.maku) why.push('落ち着いたのに 膜が 残っている');
  if (why.length) bad[which].push(tag + '：' + why.join('／'));
  console.log('     ' + tag + ' … k=' + m.k.toFixed(3) + ' 枠 ' + m.wrapW + 'x' + Math.round(m.wrapH) + ' 紙 ' + m.pw + 'x' + m.ph + (why.length ? '  ★' + why.join('／') : ''));
}

console.log('\n[kami-chijimi] 生きた紙が 本物の ブラウザで 枠に 収まるか' + (wazaName ? '（壊し：' + wazaName + '）' : ''));
for (const kind of BROWSERS) {
  const type = await borrow('kami-chijimi', kind);
  const b = await pwLaunch('kami-chijimi', type, undefined, kind);
  for (const w of WIDTHS) {
    for (const osoi of OSOI) {
      const mobile = w < 600;
      const ctx = await b.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2, isMobile: mobile && kind === 'webkit' ? true : mobile, hasTouch: mobile });
      /* ★外へは 出さない★（CDN の 字体 等で goto が 30秒 切れる＝10-20 実測） */
      await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
      if (osoi) await ctx.addInitScript(OSOI_INIT, osoi);
      const pg = await ctx.newPage();
      const errs = [];
      pg.on('pageerror', (e) => errs.push(e.message));
      await pg.goto('http://localhost:' + port + '/seikyu/index.html', { waitUntil: 'load' });
      await pg.evaluate(async (tables) => {
        const ov = document.getElementById('loginOv'); if (ov) ov.remove();
        document.getElementById('app').hidden = false;
        const sb = window.FakeSupa.createFakeSupa({ uid: 'u1', tables, pk: { pay_org: 'account_id', pay_companies: 'account_id' }, unique: { pay_invoices: [['account_id', 'doc_type', 'no']] } });
        await window.SeikyuApp.attach(sb);
        window.SeikyuApp._go('scr-edit');
        const set = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
        const gyo = (f) => document.getElementById('lines-body').querySelector('tr [data-f="' + f + '"]');
        set(document.getElementById('e-partner'), 'pt_a');
        set(document.getElementById('e-issue'), '2026-11-06');
        set(gyo('name'), '運転代行');
        set(gyo('amount'), '1000');
      }, TABLES);
      const tag = kind + ' ' + w + 'px load' + (osoi ? '+' + osoi + 'ms' : 'すぐ');
      await pg.waitForTimeout(SETTLE[osoi]);
      mikiru(tag + ' 最初', await hakaru(pg, '1,100'), mobile, osoi ? 2 : 1);

      /* ④ 打ち替えて 入れ替えた 後 */
      await pg.evaluate(() => {
        const el = document.getElementById('lines-body').querySelector('tr [data-f="amount"]');
        el.value = '2000'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await pg.waitForTimeout(SETTLE[osoi]);
      mikiru(tag + ' 打ち替え', await hakaru(pg, '2,200'), mobile, osoi ? 2 : 1);

      /* ⑤ 裏に 書いた 直後（予約 220ms の 後）に 一覧へ＝入れ替えと load が 画面の 外 → 戻る */
      await pg.evaluate(() => {
        const el = document.getElementById('lines-body').querySelector('tr [data-f="amount"]');
        el.value = '3000'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await pg.waitForTimeout(250);
      const ura = await pg.evaluate(() => (document.getElementById('pv-ura').srcdoc || '').includes('3,300'));
      await pg.evaluate(() => window.SeikyuApp._go('scr-list'));
      await pg.waitForTimeout(SETTLE[osoi]);
      await pg.evaluate(() => window.SeikyuApp._go('scr-edit'));
      await pg.waitForTimeout(SETTLE[osoi]);
      /* 前置きは 遅い時だけ（load が すぐ だと 250ms の 時点で もう 入れ替え済み＝裏は 空が 正しい）。
         遅い時＝裏へ 220ms・入れ替えの 時計 480ms・load 620ms が 全部 一覧に 居る 間 */
      if (osoi && !ura) bad[3].push(tag + '：前置き＝一覧へ 出る前に 裏に 新しい紙が 入っていない（見たい 形に なっていない）');
      mikiru(tag + ' 一覧から戻る', await hakaru(pg, '3,300'), mobile, 3);
      if (errs.length) bad[1].push(tag + '：ページの エラー ' + errs.join(' / '));
      await ctx.close();
    }
  }
  await b.close();
}
srv.close();

T('① load が すぐ の時、縮み・枠の高さ・切れない・今の金額（最初と 打ち替えの 後）', () => ok(!bad[1].length, bad[1].join(' ／ ')));
T('② load が 遅い（入れ替えの 時計が 先）時も 同じ', () => ok(!bad[2].length, bad[2].join(' ／ ')));
T('③ 一覧へ 出て 戻った 後も 同じ（入れ替えと load が 画面の 外）', () => ok(!bad[3].length, bad[3].join(' ／ ')));
const zenbu = BROWSERS.length * WIDTHS.length * OSOI.length * 3;
T('④ 空振りしていない（' + zenbu + '通り 全部 測った）', () => ok(measured === zenbu, '測った ' + measured + '／' + zenbu));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
