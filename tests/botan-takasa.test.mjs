/* botan-takasa.test.mjs — ★押す物の 見える高さは 字に 合わせる／押せる所は 44px★
 * =============================================================================
 * ★なぜ（司さん 2026-11-19「どのアプリでも 小さいボタンで 縦幅と 文字の大きさが 合ってない・何回も ゆうてる」）★
 *   「押す所は 44px」を ★見える箱の 高さ★に そのまま 当てていた＝14px の字で 44〜47px（比 3.1〜3.4）・11px の字で 44px（比 4）。
 *   直す前（d93cd0e3）を 本当に ログインした 6画面で 測った＝438個中 2.8超え 228・2.5未満 151・上下±21px を 突いて 当たらない 157。
 *   直し＝css/botan-takasa.css（5画面の 最後に 読む・1か所）。
 *
 * ★決まり★（feedback_botan_no_takasa_wa_ji_ni_awaseru_2026-11-19）
 *   ① 押す物（B）の 見える高さ÷字＝2.5〜2.8（折り返す物は 増えた行の分 1.2×字 を 引いてから 割る）
 *   ② 押す物は 真ん中の x で 上下 ±21px を 突いて 自分に 当たる（＝押せる所 44px・見えない ::after で 守る）
 *   ③ 打つ欄（input/select）は ::after が 描かれない＝16px の字は 見える高さ 44px ちょうど・16px 未満は ① と 同じ比
 *   ④ ★B の外の 押す物★（cursor:pointer の 物）が 出たら 赤＝css/botan-takasa.css の B か X に 足す
 *      （class 名の 台帳で 試験を 持たない＝新しく 足した 押す物は 自動で ここに 入る）
 * ★外す物（X）★＝下の帯 .bn .bn-i（絵＋字の 2段）／中身を持つ 行や札 .tile .row .pask-d .ob-step .acc-h .pt-co-hd／
 *   字の中の 小さい印 .help-i .hd-out .mw-fix（字の行の 高さ＝押す所は 別件）
 *
 * ★測り方★ 本当に ログインした 画面（tests/_hairu.mjs の hairu）＋ログイン前の 入口・WebKit・
 *   iPhone SE 375×667 と iPhone 13 390×844。getComputedStyle で 読まず ★描いた 箱と 突いた 結果★で 見る。
 *   入れない／借りられない時は ★未測定★（緑に しない・赤にも しない）。
 *
 * 使い方: node tests/botan-takasa.test.mjs --bu=1|--bu=2  （1＝375×667・2＝390×844）
 *         node tests/botan-takasa.test.mjs --self-test     （わざと 崩して 赤になるか）
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { borrow, launch as pwLaunch } from '../scripts/_borrow-playwright.mjs';
import { hairu, toziru, kagiAru } from './_hairu.mjs';
import { takasa } from './_takasa.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = process.argv.includes('--self-test');
const BUA = process.argv.filter((x) => x.indexOf('--bu') === 0);
if (!SELF && (BUA.length !== 1 || (BUA[0] !== '--bu=1' && BUA[0] !== '--bu=2'))) {
  console.error('★--bu=1 か --bu=2 を 1つ 付けてください（' + BUA.join(' ') + '）＝何も 走らせずに 止めます★');
  process.exit(2);
}

/* ★B と X は css/botan-takasa.css から 読む★（試験と 直しで 範囲を 割らない＝taiketsu-naoshi 止めB） */
const CSS = fs.readFileSync(path.join(ROOT, 'css/botan-takasa.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
const mB = CSS.match(/:where\(([^{]*?)\):where\(:not\(([^{]*?)\)\)\s*\{/);
if (!mB) { console.error('★css/botan-takasa.css の B／X の 形が 読めない★'); process.exit(1); }
const B = mB[1].trim(), X = mB[2].trim();
const INLINE_X = '.help-i, .hd-out, .mw-fix';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const srv = http.createServer((rq, rs) => {
  let p = path.join(ROOT, decodeURIComponent(rq.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { rs.writeHead(404); rs.end('x'); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  rs.end(fs.readFileSync(p));
});
await new Promise((r) => srv.listen(0, r));
const PORT = srv.address().port;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 1画面の 押す物を 全部 測る（描いた 後） */
const PROBE = ({ B, X, INLINE_X }) => {
  const SEL = 'button,[role="button"],a[class*="btn"],input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=range]),select';
  const seen = new Set(); const els = [];
  document.querySelectorAll(SEL).forEach((e) => { seen.add(e); els.push(e); });
  document.querySelectorAll('body *').forEach((e) => {
    if (seen.has(e) || e.closest(SEL)) return;
    const c = getComputedStyle(e);
    if (c.cursor !== 'pointer') return;
    if (e.parentElement && getComputedStyle(e.parentElement).cursor === 'pointer' && !e.parentElement.matches('body,html')) return;
    if (/^(LABEL|SUMMARY|DETAILS|TR|TD|LI|IMG|SVG)$/.test(e.tagName)) return;
    if (e.getBoundingClientRect().height > 80) return;
    els.push(e);
  });
  const nm = (e) => e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).join('.') : '');
  const out = [];
  for (const e of els) {
    const c = getComputedStyle(e);
    if (c.display === 'none' || c.visibility === 'hidden' || c.opacity === '0') continue;
    let r = e.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    if (e.closest('details:not([open])') && !e.matches('summary')) continue;
    const fs = parseFloat(c.fontSize);
    const kind = /^(INPUT|SELECT)$/.test(e.tagName) ? 'in' : e.matches(X) ? (e.matches(INLINE_X) ? 'xi' : 'x') : e.matches(B) ? 'b' : 'soto';
    let lines = 1;
    if (kind !== 'in') {
      const lh = c.lineHeight === 'normal' ? fs * 1.2 : parseFloat(c.lineHeight);
      const rg = document.createRange(); rg.selectNodeContents(e);
      const tops = []; for (const q of rg.getClientRects()) { if (q.width < 1 || q.height < 1) continue; if (!tops.some((t) => Math.abs(t - q.top) < lh * 0.5)) tops.push(q.top); }
      lines = Math.max(1, tops.length);
    }
    e.scrollIntoView({ block: 'center', inline: 'nearest' });
    r = e.getBoundingClientRect();
    const x = Math.round(Math.max(1, Math.min(innerWidth - 1, r.left + r.width / 2)));
    const cy = r.top + r.height / 2;
    const nmH = (h) => !h ? 'なし' : h.tagName.toLowerCase() + (typeof h.className === 'string' && h.className.trim() ? '.' + h.className.trim().split(/s+/).slice(0, 2).join('.') : '');
    const ate = []; const hitAt = (y) => { const h = document.elementFromPoint(x, Math.round(y)); const ok = !!h && (h === e || e.contains(h)); if (!ok) ate.push(nmH(h)); return ok; };
    out.push({ who: nm(e).slice(0, 50), t: (e.textContent || e.value || e.placeholder || '').trim().replace(/\s+/g, ' ').slice(0, 14),
      kind, fs, h: Math.round(r.height * 10) / 10, lines, hit: [hitAt(cy - 21), hitAt(cy + 21)].every(Boolean), ate: ate.join('/') });
  }
  /* ★折り返す 段の 縦の 隙間★（11-20）＝見える箱を 縮めた分、押せる所 44 が 次の段と 重なる。
     今 折り返して いない 段も ★幅や 人数で 折り返す★ ので、宣言の row-gap で 見る（要る＝45 − 一番低い 押す物の 高さ） */
  document.querySelectorAll("body *").forEach((p) => {
    const pc = getComputedStyle(p);
    if (!/flex/.test(pc.display) || pc.flexWrap !== "wrap" || /column/.test(pc.flexDirection)) return;
    if (p.getBoundingClientRect().height < 1) return;
    const kids = [...p.children].filter((k) => k.matches(B) && !k.matches(X) && getComputedStyle(k).display !== "none" && k.getBoundingClientRect().height >= 8);
    if (kids.length < 2) return;
    const hmin = Math.min(...kids.map((k) => k.getBoundingClientRect().height));
    out.push({ who: nm(p).slice(0, 50), t: (kids[0].textContent || "").trim().replace(/s+/g, " ").slice(0, 14), kind: "gap", fs: 0,
      h: Math.round(hmin * 10) / 10, rg: parseFloat(pc.rowGap) || 0, lines: 1, hit: true, ate: "" });
  });
  return out;
};

const GAMEN = [
  { na: 'ログイン前', url: '/index.html', mae: '.login-btn', tabs: [] },
  { na: '入口', url: '/index.html', matsu: '.tile', tabs: [] },
  { na: '給与', url: '/kyuyo/index.html', matsu: '.bn[data-scr="scr-list"]', tabs: ['scr-input', 'scr-list', 'scr-print', 'scr-furikomi', 'scr-settings'] },
  { na: '請求書', url: '/seikyu/index.html', matsu: '.bn[data-scr]', tabs: 'auto' },
  { na: '管理', url: '/kyuyo/admin.html', matsu: 'body', tabs: [] },
  { na: '明細', url: '/kyuyo/meisai.html', matsu: 'body', tabs: [] },
];

/* ★決めた 高さ★＝css/botan-takasa.css の min-height と 同じ 式 */
export { takasa };

/* ★判定★（1つ 1つ）＝赤の 訳を 返す（null＝よい） */
export function judge(x) {
  const eff = (x.h - (x.lines - 1) * 1.2 * x.fs) / x.fs;
  const ratio = Math.round(eff * 100) / 100;
  if (x.kind === 'gap') { const need = Math.round((45 - x.h) * 10) / 10; return x.rg + 0.01 >= need ? null : '折り返すと 押せる所が 次の段と 重なる（縦の隙間 ' + x.rg + 'px・要る ' + need + 'px＝45−' + x.h + '）'; }
  if (x.kind === 'soto') return 'B の外の 押す物（css/botan-takasa.css の B か X に 足す）';
  if (x.kind === 'x' || x.kind === 'xi') return null;
  if (x.kind === 'in') {
    if (x.fs >= 16) return Math.abs(x.h - 44) <= 0.6 ? null : '16px の 打つ欄が 44px でない（' + x.h + 'px）';
    return ratio >= 2.48 && ratio <= 2.82 ? null : '打つ欄の 高さ÷字 ' + ratio + '（2.5〜2.8 の外）';
  }
  /* ★1行の物は 決めた 高さ ちょうど（±0.6px）★＝12px→32・13px→36・14px→36・16px→44（コンサル 11-19 の揃えた数・13px に 32 は 使わない）
     折り返す物は 増えた行の分を 引いて 比 2.4〜2.8 */
  const effH = x.h - (x.lines - 1) * 1.2 * x.fs;
  if (x.lines === 1) {
    const want = takasa(x.fs);
    if (Math.abs(x.h - want) > 0.6) return '高さ ' + x.h + 'px（' + x.fs + 'px の 字は ' + want + 'px・比 ' + ratio + '）';
  } else if (ratio < 2.4 || ratio > 2.82) return '高さ÷字 ' + ratio + '（折り返し ' + x.lines + '行・' + x.fs + 'px 字 ' + x.h + 'px）';
  if (!x.hit) return '上下 ±21px を 突いて 当たらない（押せる所が 44px 無い・当たった物 ' + (x.ate || '?') + '）';
  return null;
}

let b;
try { b = await pwLaunch('botan-takasa', await borrow('botan-takasa', 'webkit')); }
catch (e) { console.log('\n  🟡 未測定（playwright を 借りられない）'); srv.close(); process.exit(0); }
const kagi = await kagiAru(ROOT);

async function hakaru(w, gamenList, kowasu) {
  const res = []; const mitei = [];
  for (const g of gamenList) {
    if (!g.mae && !kagi) { mitei.push(g.na + '（本番の repo＝ログインの 要る画面は 測れない）'); continue; }
    const ctx = await b.newContext({ viewport: { width: w, height: w === 375 ? 667 : 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const pg = await ctx.newPage();
    let ok = false;
    try {
      if (g.mae) { await pg.goto('http://localhost:' + PORT + g.url); await pg.waitForSelector(g.mae, { timeout: 20000 }); ok = true; }
      else { const h = await hairu(pg, 'http://localhost:' + PORT + g.url, g.matsu); ok = !!h.haitta; }
    } catch (e) { ok = false; }
    if (!ok) { mitei.push(g.na + ' 幅' + w + '（入れない）'); await ctx.close(); continue; }
    if (!g.mae) { try { await toziru(pg); } catch (e) {} }
    if (kowasu) await pg.addStyleTag({ content: kowasu });
    await sleep(600);
    let tabs = g.tabs;
    if (tabs === 'auto') tabs = await pg.$$eval('.bn[data-scr]', (xs) => [...new Set(xs.map((x) => x.dataset.scr))]);
    for (const t of (tabs.length ? tabs : [null])) {
      if (t) {
        try { await pg.click('.bn[data-scr="' + t + '"]', { timeout: 5000 }); } catch (e) { mitei.push(g.na + ' ' + t + ' 幅' + w + '（押せない）'); continue; }
        await sleep(700);
        try { await toziru(pg); } catch (e) {}
      }
      const r = await pg.evaluate(PROBE, { B, X, INLINE_X });
      r.forEach((x) => res.push({ gamen: g.na + (t ? ':' + t : ''), w, ...x }));
    }
    await ctx.close();
  }
  return { res, mitei };
}

function matome(res) {
  const aka = new Map(); let ate = 0; const soto = { x: 0, xi: 0 };
  for (const x of res) {
    if (x.kind === 'x' || x.kind === 'xi') { soto[x.kind]++; continue; }
    ate++;
    const why = judge(x);
    if (why) { const k = x.gamen.split(':')[0] + ' ' + x.who + ' 「' + x.t + '」 … ' + why; aka.set(k, (aka.get(k) || 0) + 1); }
  }
  return { aka, ate, soto };
}

if (SELF) {
  console.log('\n[botan-takasa --self-test] ★わざと 崩して 赤に なるか★（請求書・幅390）');
  /* ★見本★（11-20 本番前 taiketsu 止め1）＝本番の repo は 鍵が 無く 請求書を 測れない→ログイン前だけでは ③⑤ が 赤を 出せず exit 1 だった。
     ログインの 要らない 見本（本物の css＋折り返す 押す物の 段）を 必ず 入れる */
  const MIHON = { na: '見本', url: '/tests/fixtures/botan-takasa-mihon.html', mae: '#mihon-row', tabs: [] };
  const g = [MIHON, ...GAMEN.filter((x) => x.na === '請求書' || x.na === 'ログイン前')];
  /* 判定そのもの */
  let bad = 0;
  const say = (ok, s) => { console.log((ok ? '  ✓ ' : '  ✗ ') + s); if (!ok) bad++; };
  say(judge({ kind: 'b', fs: 14, h: 36, lines: 1, hit: true }) === null, '14px 36px 当たる … よい');
  say(judge({ kind: 'b', fs: 12, h: 32, lines: 1, hit: true }) === null && judge({ kind: 'b', fs: 13, h: 36, lines: 1, hit: true }) === null, '12px 32px・13px 36px … よい');
  say(!!judge({ kind: 'b', fs: 13, h: 32, lines: 1, hit: true }), '13px 32px … 赤（13px に 32 は 使わない）');
  say([12, 13, 14, 16].map(takasa).join() === '32,36,36,44', '式 … 12→32・13→36・14→36・16→44');
  say(!!judge({ kind: 'b', fs: 14, h: 44, lines: 1, hit: true }), '14px 44px … 赤（比 3.14）');
  say(!!judge({ kind: 'b', fs: 14, h: 36, lines: 1, hit: false }), '当たらない … 赤');
  say(judge({ kind: 'b', fs: 12, h: 45.6, lines: 2, hit: true }) === null, '12px 2行 45.6px … よい（行の分を 引く）');
  say(!!judge({ kind: 'in', fs: 16, h: 47, lines: 1, hit: true }), '16px 打つ欄 47px … 赤');
  say(!!judge({ kind: 'soto', fs: 13, h: 34, lines: 1, hit: true }), 'B の外の 押す物 … 赤');
  say(!!judge({ kind: 'gap', h: 32, rg: 12 }) && judge({ kind: 'gap', h: 32, rg: 14 }) === null, '段の 隙間 32px で 12 … 赤・14 … よい');
  const KOWASU = [
    ['① 小さい字に min-height:44px を 戻す', 'button{min-height:44px!important}'],
    ['② 見えない ::after を 外す', '*::after{content:none!important}'],
    ['③ 親に overflow:hidden', '*:has(> button){overflow:hidden!important}'],
    ['⑤ 折り返す 段の 縦の 隙間を 0 に', '*{row-gap:0!important}'],
    ['④ 決まりの CSS が 負ける（!important を 外した のと 同じ＝行の中の style が 勝つ）', 'button{padding-top:14px!important;padding-bottom:14px!important}'],
  ];
  {
    const { res, mitei } = await hakaru(390, [MIHON], null);
    const { aka } = matome(res);
    say(res.length > 0 && aka.size === 0 && res.some((x) => x.kind === 'gap'), '見本（崩す前） … 測った ' + res.length + '個・折り返す段 ' + res.filter((x) => x.kind === 'gap').length + '・赤 ' + aka.size + (mitei.length ? '（' + mitei.join('、') + '）' : ''));
  }
  for (const [na, css] of KOWASU) {
    const { res, mitei } = await hakaru(390, g, css);
    if (!res.length) { console.log('  🟡 ' + na + ' … 未測定（' + mitei.join('、') + '）'); bad++; continue; }
    const { aka } = matome(res);
    say(aka.size > 0, na + ' … 赤 ' + [...aka.values()].reduce((a, c) => a + c, 0) + '個');
  }
  await b.close(); srv.close();
  console.log(bad ? '\n★自己確認 おかしい ' + bad + '件★' : '\n★自己確認 全部 赤になった★');
  process.exit(bad ? 1 : 0);
}

const W = BUA[0] === '--bu=1' ? 375 : 390;
const { res, mitei } = await hakaru(W, GAMEN, null);
const { aka, ate, soto } = matome(res);
console.log('\n  ── 押す物の 高さ÷字／押せる所（幅' + W + '・WebKit） ──');
console.log('   測った ' + res.length + '個（当てた ' + ate + '・外した 行や札 ' + soto.x + '・字の中の印 ' + soto.xi + '）');
for (const [k, n] of aka) console.log('   ✗ ' + k + ' ×' + n);
if (mitei.length) console.log('   🟡 未測定 ' + mitei.length + '：' + mitei.join('、'));
const nAka = [...aka.values()].reduce((a, c) => a + c, 0);
console.log('\n  ★赤 ' + nAka + '個★' + (mitei.length ? '（未測定 ' + mitei.length + '）' : ''));
await b.close(); srv.close();
process.exit(nAka ? 1 : 0);
