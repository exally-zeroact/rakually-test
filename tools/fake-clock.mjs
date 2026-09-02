/* fake-clock.mjs — ★試験を「別の日」で走らせる道具★
 * ============================================================================
 * ★司さん 2026-09-02「試験に 今日が何月かを 書き込むな」★（経営者 全社回覧）
 *
 * ★なぜ要るか（同じ日に 2つのアプリが 落ちた）★
 *   ダイコメ … 給料明細の紙の試験3本が ★9/1になった瞬間 赤★
 *              （中身は 2026-08 固定・画面は 今日の年月から始まる → 9月を見て 0行）
 *   Timeally … ui-sweep 2本・print-check 6件が ★9/2になった瞬間 赤★
 *   ＝★中身も画面も 壊れていない。試験が 時計に依存していただけ★。
 *   ★毎月1日に 必ず赤くなる＝「たまに赤」の正体になり、本当の赤を 見なくさせる★。
 *
 * ★使い方★
 *   FAKE_NOW=2026-10-01 NODE_OPTIONS="--import file:///<ここ>/tools/fake-clock.mjs" node <試験>
 *   ・NODE_OPTIONS なので ★子プロセスにも 効く★＝ci.yml の run: を そのまま流せる
 *   ・名前は ★FAKE_NOW が正★（経営者 2026-09-02 決定）。
 *     ★DK_FAKE_NOW も見る★＝ダイコメの今のコードを 1文字も直させない為。
 *   ・自分の効きを見る … node tools/fake-clock.mjs --self-test
 *
 * ★3層とも 進める（1つでも 抜けると「測っていないのに 緑」になる）★
 *   ① node の中      … globalThis.Date
 *   ② jsdom の中     … window.Date（★realm が別なら 親を替えても 進まない★）
 *   ③ ブラウザの中   … playwright を包んで addInitScript（★画面が動き出す前★に入れる）
 *
 * ★実測（2026-09-02 Rakunally）★
 *   ②を替える前 … 親 2026-10-01 ／ 中(jsdom) ★2026-09-02のまま★＝★赤に見える空振り★
 *     （毎月の請求の試験が 10/1 で赤 → 中を読むと ★元から正しく書けていた★）
 *   ③は ダイコメが addInitScript で出来ると実測 → こちらも同じ形で 足した
 *   ★jsdom が 親と同じ realm を使う作り（Timeally）なら ①だけで 進む★
 *     ＝「進まない」ではなく ★進む作りと 進まない作りが 在る★（Timeally 実測・経営者訂正）
 *
 * ★★写す時の罠（他アプリが 実際に踏んだ物）★★
 *   ④ ★依存が見つからないのを try/catch が 黙って飲む★（Exally）
 *      道具を repo の外に置くと require('jsdom') が解けず、★効いているふり★になる。
 *      ⇒ ★repo に jsdom / playwright が 在るのに 包めなかったら 止まる（終わり値 9）★
 *   ⑤ ★見本を UTC で比べて、効いている道具を 犯人にした★（ダイコメ）
 *      FAKE_NOW=2026-10-01T00:05（日本時間）→ toISOString() は ★2026-09-30T15:05Z★
 *      ⇒ ★確かめは 必ず 現地時間で★（getFullYear / getMonth / getDate）。
 *        toISOString で見ると 日本では ★毎回 前日に見えます★。
 *
 * ★読むだけ・外へ出ない・依存ゼロ★（node の標準の物しか使わない）
 */
import { createRequire } from 'node:module';

const iso = process.env.FAKE_NOW || process.env.DK_FAKE_NOW || '';
const SELF = process.argv.includes('--self-test');
const FIXED = new Date((iso || '2026-10-01') + (/T/.test(iso) ? '' : 'T09:00:00+09:00')).getTime();

/* ── ① node の中 ────────────────────────────────────────── */
const RealDate = Date;
class FakeDate extends RealDate {
  constructor(...a) { if (a.length === 0) { super(FIXED); } else { super(...a); } }
  static now() { return FIXED; }
}
if (iso) globalThis.Date = FakeDate;

const INIT = '(() => { const F = ' + FIXED + '; const R = Date;'
  + ' class D extends R { constructor(...a) { if (a.length === 0) { super(F); } else { super(...a); } }'
  + ' static now() { return F; } }'
  + ' window.Date = D; })()';

/* ── ② jsdom の中 ───────────────────────────────────────── */
function patchJsdom(require2) {
  const jsdom = require2('jsdom');
  const Orig = jsdom.JSDOM;
  if (!Orig || Orig.__clockWrapped) return 'すでに包んである';
  const patch = (win) => {
    if (!win || win.__clockFaked) return;
    const WD = win.Date;
    class WinDate extends WD {
      constructor(...a) { if (a.length === 0) { super(FIXED); } else { super(...a); } }
      static now() { return FIXED; }
    }
    win.Date = WinDate; win.__clockFaked = 1;
  };
  class Patched extends Orig {
    constructor(...a) { super(...a); try { patch(this.window); } catch (e) { /* 触れない時は そのまま */ } }
  }
  Object.getOwnPropertyNames(Orig).forEach((k) => {
    if (['length', 'name', 'prototype'].indexOf(k) >= 0) return;
    try { Patched[k] = Orig[k]; } catch (e) { /* 読み取り専用は そのまま */ }
  });
  Patched.__clockWrapped = 1;
  jsdom.JSDOM = Patched;
  return 'ok';
}

/* ── ③ ブラウザ（playwright）の中 ───────────────────────── */
function patchPlaywright(require2) {
  let pw = null;
  for (const cand of ['playwright', process.cwd() + '/node_modules/playwright/index.js']) {
    try { pw = require2(cand); break; } catch (e) { /* 次を試す */ }
  }
  if (!pw) throw new Error('借りられません');
  const wrapCtx = (c) => {
    const oNP = c.newPage.bind(c);
    c.newPage = async (...a) => { const p = await oNP(...a); await p.addInitScript(INIT); return p; };
  };
  const wrapBrowser = (b) => {
    const oNP = b.newPage.bind(b), oNC = b.newContext.bind(b);
    b.newPage = async (...a) => { const p = await oNP(...a); await p.addInitScript(INIT); return p; };
    b.newContext = async (...a) => { const c = await oNC(...a); await c.addInitScript(INIT); wrapCtx(c); return c; };
  };
  let n = 0;
  ['chromium', 'webkit', 'firefox'].forEach((k) => {
    const bt = pw[k];
    if (!bt || typeof bt.launch !== 'function' || bt.__clockWrapped) return;
    const oL = bt.launch.bind(bt);
    bt.launch = async (...a) => { const b = await oL(...a); wrapBrowser(b); return b; };
    bt.__clockWrapped = 1; n++;
  });
  return n + '種類 包んだ';
}

/* ★「在るのに 包めなかった」は 黙って通さない★（Exally が踏んだ ④）
   ＝repo に その部品が 在るなら、包めない＝★効いているふり★なので 止める。 */
import fs from 'node:fs';
function have(name) {
  try { return fs.existsSync(process.cwd() + '/node_modules/' + name); } catch (e) { return false; }
}
if (iso) {
  const require2 = createRequire(process.cwd() + '/package.json');
  const say = [];
  const run = (nm, fn) => {
    let r = null, err = null;
    /* ★わざと落ちる1本★＝「止まる事」を いつでも その場で 確かめられる様に
       （今日 空振りが 5種類 出た。形が 全部 違うので これしか 共通の防ぎ方が 無い） */
    try {
      if (process.env.FAKE_CLOCK_BREAK === nm) throw new Error('わざと壊しました（確かめ用）');
      r = fn(require2);
    } catch (e) { err = e && e.message; }
    const ok = !!r && !err;
    say.push((ok ? '○' : '×') + ' ' + nm + ' … ' + (ok ? r : ('★包めません★ ' + (err || r))));
    if (!ok && have(nm)) {
      console.error('[fake-clock] ★' + nm + ' は この repo に 在るのに 包めませんでした★ … '
        + (err || r));
      console.error('  ＝★効いているふり★になります（中の時計は 本物のまま）。止めます。');
      console.error('  ★道具は repo の中（tools/）に置き、その repo の中で 走らせてください★');
      process.exit(9);
    }
    return ok;
  };
  run('jsdom', patchJsdom);
  run('playwright', patchPlaywright);
  if (process.env.FAKE_CLOCK_VERBOSE === '1') {
    console.error('[fake-clock] ' + iso + ' … ' + say.join(' ／ '));
  }
}

/* ── ★自分が 効いているかの確かめ★（空振りしていたら ここで赤） ───────── */
if (SELF) {
  const require2 = createRequire(process.cwd() + '/package.json');
  const want = '2026-10-01';
  const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
    + '-' + String(d.getDate()).padStart(2, '0');
  let ng = 0;
  const say = (nm, got) => {
    const ok = got === want;
    if (!ok) ng++;
    console.log('  ' + (ok ? '✓' : '✗') + ' ' + nm + ' … ' + got + (ok ? '' : '  ★進んでいない★'));
  };
  const utc = new RealDate(FIXED).toISOString();
  console.log('\n[fake-clock] ★自分が 効いているかの確かめ★（FAKE_NOW=' + (iso || '（未指定）') + '）');
  console.log('  ★見るのは 現地時間★ … 狙い ' + want + '（同じ時刻を UTC で書くと ' + utc + '）');
  console.log('  ※ toISOString で見ると 日本では ★前日に見える★事が あります（ダイコメが これで つまずいた）');
  if (!iso) {
    console.log('  ★FAKE_NOW を渡さずに 走らせています★');
    console.log('  ★測るには★ FAKE_NOW=2026-10-01 NODE_OPTIONS="--import file:///'
      + process.cwd().split(String.fromCharCode(92)).join('/') + '/tools/fake-clock.mjs" node tools/fake-clock.mjs --self-test');
    process.exit(1);
  }
  say('① node の中', ymd(new Date()));
  try {
    const { JSDOM } = require2('jsdom');
    const d = new JSDOM('<!doctype html><p>x</p>');
    say('② jsdom の中', d.window.eval('(d=>d.getFullYear()+"-"+String(d.getMonth()+1)'
      + '.padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"))(new Date())'));
  } catch (e) { console.log('  🟡 ② jsdom … ★未測定★（' + (e && e.message) + '）'); }
  let pw = null;
  for (const cand of ['playwright', process.cwd() + '/node_modules/playwright/index.js']) {
    try { pw = require2(cand); break; } catch (e) { /* 次 */ }
  }
  if (!pw) { console.log('  🟡 ③ ブラウザ … ★未測定★（playwright が 借りられません）'); }
  else {
    try {
      const b = await pw.webkit.launch();
      const pg = await (await b.newContext()).newPage();
      await pg.setContent('<p>x</p>');
      say('③ ブラウザの中', await pg.evaluate('(d=>d.getFullYear()+"-"+String(d.getMonth()+1)'
        + '.padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"))(new Date())'));
      await b.close();
    } catch (e) { console.log('  🟡 ③ ブラウザ … ★未測定★（' + (e && e.message) + '）'); }
  }
  /* ★④ 渡していない子は 進まない★＝これが「道具が 効いている」証拠。
        （①②③だけ見ると、この道具を読み込んだ 自分自身しか 測っていない事に なる） */
  try {
    const { execFileSync } = require2('child_process');
    const code = 'const d=new Date();console.log(d.getFullYear()+"-"'
      + '+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"))';
    const bare = Object.assign({}, process.env);
    delete bare.NODE_OPTIONS; delete bare.FAKE_NOW; delete bare.DK_FAKE_NOW;
    const got = String(execFileSync(process.execPath, ['-e', code], { env: bare, encoding: 'utf8' })).trim();
    const moved = got !== want;
    if (!moved) ng++;
    console.log('  ' + (moved ? '✓' : '✗') + ' ④ 渡していない子は 進まない … ' + got
      + (moved ? '（＝進めた時の ' + want + ' は 本物の時計では ありません）'
        : '  ★本物の時計でも 同じ日＝この確かめは 空振りです★'));
  } catch (e) { console.log('  🟡 ④ … ★未測定★（' + (e && e.message) + '）'); }

  console.log(ng ? '\n★' + ng + '層 進んでいません＝この道具は 空振りしています★'
    : '\n★測れた層は 全部 進んでいます（未測定と出た層は 0件ではありません）★');
  process.exit(ng ? 1 : 0);
}
