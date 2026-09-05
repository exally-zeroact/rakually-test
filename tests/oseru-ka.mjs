/* oseru-ka.mjs — ★本当に 押せるか（真ん中を 突く）／出た時に 下の物が ずれないか★
 * =============================================================================
 * ★借り元★（★測り方だけ 借りる・見た目は 借りない★＝会社の決まり）
 *   ★ダイコメ★ Daikou-app/tests/e2e/obd-keikoku-de-botan-ga-ugokanai.spec.js（2026-09-05）
 *     司さん「警告のせいで ボタン押せんとか ないようにしろやぼけ」
 *     ★ダイコメの 実測★ 赤バーが 出ると 業務終了ボタンが ★42px 下に 逃げる★
 *                        ＝押そうとした 瞬間に 指の 下から ボタンが 逃げる
 *
 * ★うちに 1本も 無かった★（2026-09-05 実測＝0本）。それでいて ★同じ日に 3回 踏んでいる★:
 *   ・案内の 覆い（.ui-modal-ov）が 上に 乗ったまま → タブが 押せない
 *   ・入口の 覆い（#loginOv）が 上に 乗ったまま → タブが 押せない
 *     （どちらも「見えていて・押せそうで・押せない」＝★お客さんも 同じ目に 遭う★）
 *
 * ★2つ 測る★
 *   ①★真ん中を 突いて 当たるか★ … 見えている 押す物の 中心を elementFromPoint で 突き、
 *      返ってきた 物が ★その 押す物 本人か★ を 見る。別の 物なら ★上に 何かが 乗っている★。
 *   ②★出た時に 下の 物が ずれないか★ … 注意書きが 出る 前後で 押す物の 上端を 測り、
 *      ★1px でも 動いたら 数える★（ダイコメは 42px 動いていた）。
 *
 * ★数だけ 見ない★ … 当たらなかった 物は ★何が 上に 乗っていたか★を 名前で 出す。
 * ★未測定の 言い方★ … playwright を 借りられない機械は ★未測定★（0件＝合格 とは 書かない）。
 *
 * 使い方: node tests/oseru-ka.mjs [--self-test]
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = process.argv.includes('--self-test');

/* ── ★物差しそのもの★（ブラウザを 使わずに 確かめられる 形にしておく）──────── */

/* ★突く所★＝見えている 部分の 真ん中（画面の 外に はみ出していても 見えている 所を 突く）
   ★ダイコメは そのままの 中心を 突いていた★＝画面の 外に 出ている 物は 測れなかった。
   うちは ★画面と 重なっている 所の 真ん中★にする（＝お客さんの 指が 届く 所）。 */
export function tsukuTen(r, vw, vh) {
  const l = Math.max(0, r.left), t = Math.max(0, r.top);
  const ri = Math.min(vw, r.right), bo = Math.min(vh, r.bottom);
  if (ri <= l || bo <= t) return null;            /* 画面に 1px も 出ていない＝突けない */
  return { x: Math.round((l + ri) / 2), y: Math.round((t + bo) / 2) };
}

/* ★当たったか★ … 返ってきた 物が 本人／本人の 中の 物 なら 当たり。
   ★先祖が 返ってきたら 当たりに しない★（押す物が 上の 物に 覆われている 形） */
export function atari(btnIsHit, btnContainsHit) { return !!(btnIsHit || btnContainsHit); }

/* ★ずれ★ … 1px でも 動いたら ずれ（ダイコメ実測 42px） */
export function zure(maeTop, atoTop) { return Math.round(atoTop - maeTop); }

if (SELF) {
  console.log('\n[oseru-ka] ★自己確認★（★物差しそのもの★・ブラウザを 使わない）');
  let ng = 0;
  const say = (nm, good) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + nm + (good ? '' : '  ★思っていたのと 違う★')); };
  const R = (l, t, w, h) => ({ left: l, top: t, right: l + w, bottom: t + h, width: w, height: h });
  say('ふつうの ボタン … 真ん中を 突く', JSON.stringify(tsukuTen(R(10, 100, 100, 40), 390, 844)) === '{"x":60,"y":120}');
  say('★上が 画面の 外★ … 見えている 所の 真ん中を 突く', JSON.stringify(tsukuTen(R(10, -20, 100, 40), 390, 844)) === '{"x":60,"y":10}');
  say('★下が 画面の 外★ … 見えている 所の 真ん中を 突く', JSON.stringify(tsukuTen(R(10, 824, 100, 40), 390, 844)) === '{"x":60,"y":834}');
  say('★1px も 見えていない★ … 突かない（null）', tsukuTen(R(10, 900, 100, 40), 390, 844) === null);
  say('★横に 全部 外★ … 突かない（null）', tsukuTen(R(400, 100, 100, 40), 390, 844) === null);
  say('境界 … 下端 ちょうど 画面の 端は 突ける', tsukuTen(R(10, 843, 100, 40), 390, 844) !== null);
  say('当たり … 本人が 返った', atari(true, false) === true);
  say('当たり … 本人の 中の 字が 返った', atari(false, true) === true);
  say('★当たらない … 別の 物（覆い）が 返った★', atari(false, false) === false);
  say('ずれ … 動いていない', zure(502, 502) === 0);
  say('★ずれ … ダイコメ実測 42px★', zure(502, 544) === 42);
  say('ずれ … 上に 動いたら 負の数', zure(502, 460) === -42);
  if (ng) { console.log('\n★自己確認 ' + ng + '件 おかしい★'); process.exit(1); }
  console.log('  ★12通り ぜんぶ 思った通り★');
  process.exit(0);
}

/* ── ここから 実ブラウザ ───────────────────────────────── */
import { hairu, toziru, osu } from './_hairu.mjs';   /* ★入る手順は 1か所★（3本に 写していた） */
let borrow, pwLaunch;
try { ({ borrow, launch: pwLaunch } = await import('../scripts/_borrow-playwright.mjs')); }
catch (e) { console.log('🟡 ★未測定★ playwright を 借りる 道具が 読めない … ' + (e && e.message)); process.exit(2); }
const wk = await borrow('oseru-ka', 'webkit');
if (!wk) { console.log('🟡 ★未測定★ playwright を 借りられない（0件＝合格 とは 書かない）'); process.exit(2); }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const srv = http.createServer((rq, rs) => {
  let p = path.join(ROOT, decodeURIComponent(rq.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { rs.writeHead(404); rs.end('x'); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  rs.end(fs.readFileSync(p));
});
await new Promise((r) => srv.listen(0, r));
const PORT = srv.address().port;
const b = await pwLaunch('oseru-ka', wk);

/* ★ブラウザの 中で 走る 物差し★（上の tsukuTen と 同じ 中身＝字で 渡す） */
const PROBE = `(function(){
  function tsukuTen(r,vw,vh){var l=Math.max(0,r.left),t=Math.max(0,r.top);
    var ri=Math.min(vw,r.right),bo=Math.min(vh,r.bottom);
    if(ri<=l||bo<=t)return null;return {x:Math.round((l+ri)/2),y:Math.round((t+bo)/2)};}
  function nm(e){return e?(e.tagName.toLowerCase()+(e.id?'#'+e.id:'')
    +(e.className&&typeof e.className==='string'?'.'+e.className.trim().replace(/\\s+/g,'.'):'')).slice(0,40):'（何も無い）';}
  var OSU='button,a[href],summary,[role="button"],input[type="submit"],input[type="button"],label[for]';
  var vw=window.innerWidth, vh=window.innerHeight;
  var out={mita:0,atarazu:[],soto:0,ooware:0,ov:''};
  var ov=null;
  [].forEach.call(document.querySelectorAll('.ui-modal-ov,.login-ov.open,#loginOv.open,dialog[open],[role="dialog"]'),function(e){
    var c=getComputedStyle(e);
    if(c.display==='none'||c.visibility==='hidden'||c.opacity==='0')return;
    var rr=e.getBoundingClientRect(); if(!rr.width||!rr.height)return;
    ov=e;
  });
  if(ov)out.ov=nm(ov);
  [].forEach.call(document.querySelectorAll(OSU),function(el){
    var cs=getComputedStyle(el);
    if(cs.display==='none'||cs.visibility==='hidden'||cs.opacity==='0')return;
    if(el.disabled)return;
    var r=el.getBoundingClientRect();
    if(!r.width||!r.height)return;
    if(ov&&!ov.contains(el)){out.ooware++;return;}
    /* ★お客さんは 押す前に そこまで 動かす★＝真ん中へ 寄せてから 突く
       （2026-09-05 実測＝幅390の 入力画面で「詳細▾」が ★下の 帯（button.bn）の 下★に 入り、
         そのままの 位置で 突くと 当たらなかった。動かせば 押せる＝★これで 鳴らせると
         毎回 鳴る 見張りに なる★。動かしても なお 上に 何かが 在る物だけ 数える） */
    if(!ov) el.scrollIntoView({block:'center',inline:'center'});
    r=el.getBoundingClientRect();
    var p=tsukuTen(r,vw,vh);
    if(!p){out.soto++;return;}
    out.mita++;
    var hit=document.elementFromPoint(p.x,p.y);
    if(hit===el||el.contains(hit))return;
    out.atarazu.push({fuda:(el.textContent||el.getAttribute('aria-label')||nm(el)).trim().replace(/\\s+/g,' ').slice(0,20),
      doko:nm(el), ueni:nm(hit)});
  });
  return out;
})()`;

/* ★押す物の 一覧を 先に 書く★（決まり＝実UIの 押し込みは 一覧を 先に） */
const HABA = [375, 390, 412];
const NAKA = ['scr-input', 'scr-list', 'scr-print', 'scr-furikomi', 'scr-settings'];

let akai = 0, mihakari = 0, mita = 0, botanKei = 0, sotoKei = 0;
const atarazuKei = [];

function iu(tag, m) {
  mita++; botanKei += m.mita; sotoKei += m.soto;
  const ng = m.atarazu.length;
  if (ng) { akai++; m.atarazu.forEach((x) => atarazuKei.push(tag + ' … 「' + x.fuda + '」 ←上に ' + x.ueni)); }
  console.log('  ' + (ng ? '✗' : '✓') + ' ' + tag + ' … 押す物 ' + m.mita + '個 ／ ★当たらない ' + ng + '個★'
    + (m.soto ? ' ／ 画面の外 ' + m.soto + '個' : '')
    + (m.ooware ? ' ／ 覆いの下 ' + m.ooware + '個（' + m.ov + '＝わざと）' : ''));
  m.atarazu.slice(0, 4).forEach((x) => console.log('       ★当たらない★ 「' + x.fuda + '」 ' + x.doko + '  ←上に ' + x.ueni));
}

console.log('\n[oseru-ka] ①★真ん中を 突いて 当たるか★（借り元＝ダイコメ obd-keikoku-de-botan-ga-ugokanai.spec.js）');

/* ── ログイン前の 入口（★お客さんの 最初の 1画面★）───────────────────── */
for (const w of HABA) {
  const pg = await (await b.newContext({ viewport: { width: w, height: 844 } })).newPage();
  await pg.goto('http://localhost:' + PORT + '/kyuyo/index.html', { waitUntil: 'domcontentloaded' });
  let deta = false;
  for (let i = 0; i < 60; i++) { if (await pg.$('#loginEmail, .bn[data-scr]')) { deta = true; break; } await new Promise((r) => setTimeout(r, 250)); }
  if (!deta) { console.log('  🟡 給与（入口） 幅' + w + ' … ★未測定★（入口の 部品が 出ない）'); mihakari++; await pg.close(); continue; }
  await new Promise((r) => setTimeout(r, 400));
  iu('給与（ログイン前） 幅' + w, await pg.evaluate(PROBE));
  await pg.close();
}

/* ── 入ってからの 5画面 ─────────────────────────────────── */
for (const w of HABA) {
  const pg = await (await b.newContext({ viewport: { width: w, height: 844 } })).newPage();
  const h = await hairu(pg, 'http://localhost:' + PORT + '/kyuyo/index.html', '.bn[data-scr="scr-list"]');
  if (!h.haitta) { console.log('  🟡 給与（入ってから） 幅' + w + ' … ★未測定★（' + h.kai + '回 試して 入れなかった）'); mihakari++; await pg.close(); continue; }
  if (h.kai > 1) console.log('  （入るのに ' + h.kai + '回 掛かりました＝倉庫の 通信の 気まぐれ）');
  /* ★覆いは 先に 消さない★＝★出たままが お客さんの 姿★。まず そのまま 測る。 */
  iu('給与（入った直後・案内が 出たまま） 幅' + w, await pg.evaluate(PROBE));
  /* ★覆いは 画面を 移るたびに 出る★（2026-09-05 実測＝入った直後に 閉じても scr-input で また 出た）
     ⇒★毎回 本物の 閉じる ボタンで 閉じる★／閉じられなければ ★それ自体が 赤★（黙って 落ちない） */
  for (const scr of NAKA) {
    if (!(await pg.$('.bn[data-scr="' + scr + '"]'))) { console.log('  🟡 給与 ' + scr + ' 幅' + w + ' … ★未測定★（そのタブが 無い）'); mihakari++; continue; }
    const o = await osu(pg, '.bn[data-scr="' + scr + '"]');
    if (!o.oseta) {
      const nokori = o.nokori;
      akai++;
      const ue = await pg.evaluate(() => {
        const t = document.querySelector('.bn[data-scr]'); if (!t) return '（タブが 無い）';
        const r = t.getBoundingClientRect();
        const h = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
        return h ? (h.tagName.toLowerCase() + (h.id ? '#' + h.id : '') + (typeof h.className === 'string' && h.className ? '.' + h.className.trim().replace(/\s+/g, '.') : '')) : '（何も無い）';
      });
      const msg = '給与 ' + scr + ' 幅' + w + ' … ★タブが 押せない★（上に ' + ue + '／閉じ残り ' + nokori + '）';
      console.log('  ✗ ' + msg); atarazuKei.push(msg);
      continue;
    }
    await new Promise((r) => setTimeout(r, 600));
    iu('給与 ' + scr + ' 幅' + w, await pg.evaluate(PROBE));
  }
  await pg.close();
}

/* ── ②★出た時に 下の 物が ずれないか★ ────────────────────────────
   ★うちの 実物★ 入力画面の 一番 上は
     statutoryStaleWarn() + prefMissingWarn() + ledgerImportBanner() + …（app.js）
   ★台帳の 札は「数えられてから 出す」★（指示役の裁定 2026-08-22 ④）
     ＝直す前は ★描いた 後から 上に 生えてきた★＝★下の 物が 全部 下がった★
     ★2026-09-05 実測（直す前）★ 幅375「今月を確定」が ★129px 下に 逃げた★／幅412 ★102px★
       ＝ダイコメの 赤バー（42px）と ★同じ形★・うちの方が ★3倍 大きい★
   ★お客さんの 道で 測る★＝札を 自分で 差し込まない。
     ★倉庫の 数える口（Store.countLedger）だけ 差し替えて★、あとは ★アプリ自身に 描かせる★。

   ★2通り 測る★（★時計の 早い遅いで 答えが 変わる 見張りは「たまに赤」になる★＝実測で 踏んだ）
     Ａ★先に 数え終わっている時★ … 開いた 時には もう 札が 在る → ★動き 0★
     Ｂ★あとから 答えが 来た時★   … 開いてから 答えを 出す → ★動き 0★
        （札が その場で 出なくても よい＝次に 描く時に 出る。ここで 見るのは ★動いたか★だけ） */
console.log('\n[oseru-ka] ②★出た時に 下の 物が ずれないか★（借り元＝同じ・ダイコメ実測 42px）');

const ICHI = `(function(){
  function nm(e){return (e.tagName.toLowerCase()+(e.id?'#'+e.id:'')
    +(e.className&&typeof e.className==='string'?'.'+e.className.trim().replace(/\\s+/g,'.'):'')).slice(0,40);}
  var OSU='button,a[href],summary,[role="button"],input[type="submit"],input[type="button"]';
  var o={};
  /* ★画面の 中の 位置（viewport）で 測る★
     借り元（ダイコメ）も getBoundingClientRect().top を 見ていた。
     紙の 上での 位置では なく ★お客さんの 指から 見た 位置★が 動いたか を 数える。 */
  [].forEach.call(document.querySelectorAll(OSU),function(el){
    var cs=getComputedStyle(el);
    if(cs.display==='none'||cs.visibility==='hidden')return;
    var r=el.getBoundingClientRect(); if(!r.width||!r.height)return;
    var k=nm(el)+'|'+(el.textContent||'').trim().replace(/\\s+/g,' ').slice(0,16);
    if(o[k]===undefined)o[k]=Math.round(r.top);
  });
  return o;
})()`;

for (const osoi of [false, true]) {
  const nabe = osoi ? 'Ｂあとから 答えが 来た時' : 'Ａ先に 数え終わっている時';
  for (const w of HABA) {
    const pg = await (await b.newContext({ viewport: { width: w, height: 844 } })).newPage();
    /* ★倉庫の 数える口だけ 差し替える★
       ★Store が 置かれた その瞬間に 差し替える★
       （50ms ごとに 見に行く 形だと ★立ち上がりの 1回目に 間に合わない★＝2026-09-05 実測） */
    await pg.addInitScript((matsu) => {
      window.__ledgerHold = matsu;
      const kaeru = (st) => {
        if (!st) return st;
        window.SUPA = window.SUPA || {};
        if (!st.getLedger) st.getLedger = () => Promise.resolve([]);
        st.countLedger = () => new Promise((r) => {
          const tick = () => { if (!window.__ledgerHold) r({ count: 3 }); else setTimeout(tick, 50); };
          setTimeout(tick, 100);
        });
        return st;
      };
      let _st;
      Object.defineProperty(window, 'Store', { configurable: true, get() { return _st; }, set(v) { _st = kaeru(v); } });
    }, osoi);
    const h2 = await hairu(pg, 'http://localhost:' + PORT + '/kyuyo/index.html', '.bn[data-scr="scr-input"]');
    if (!h2.haitta) { console.log('  🟡 ' + nabe + ' 幅' + w + ' … ★未測定★（' + h2.kai + '回 試して 入れなかった）'); mihakari++; await pg.close(); continue; }
    if (h2.kai > 1) console.log('  （入るのに ' + h2.kai + '回 掛かりました）');
    const o2 = await osu(pg, '.bn[data-scr="scr-input"]');
    if (!o2.oseta) { console.log('  ✗ ' + nabe + ' 幅' + w + ' … ★入力タブが 押せない★（' + o2.kai + '回 試した・覆いの 閉じ残り ' + o2.nokori + '）'); akai++; atarazuKei.push(nabe + ' 幅' + w + ' … 入力タブが 押せない'); await pg.close(); continue; }
    await new Promise((r) => setTimeout(r, 400));
    /* ★動いた 時に「何が 生えたか」を その場で 控える★（2026-09-05）
       ★実測★＝1回だけ 15px 動いたが、控えが 位置だけ だったので ★誰のせいか 分からなかった★。
       ⇒★入力画面の 上（お知らせの 帯）を 名前と 高さで 控える★（推し量らない） */
    const UE = `(function(){
      var h=document.querySelector('#input-list'); if(!h) return {NG:'#input-list が 無い'};
      var o=[];
      [].forEach.call(h.children,function(el){
        var r=el.getBoundingClientRect();
        if(!r.height) return;
        o.push({ nm:(el.tagName.toLowerCase()+(el.id?'#'+el.id:'')+(typeof el.className==='string'&&el.className?'.'+el.className.trim().replace(/\s+/g,'.'):'')).slice(0,36),
          h:Math.round(r.height), ji:(el.textContent||'').replace(/\s+/g,' ').trim().slice(0,24) });
        if(o.length>=6) return;
      });
      return o;
    })()`;
    const ue1 = await pg.evaluate(UE);
    const mae = await pg.evaluate(ICHI);                       /* 開いた 直後 */
    const maeFuda = await pg.evaluate(() => !!document.querySelector('[data-ledger-import]'));
    if (osoi) await pg.evaluate(() => { window.__ledgerHold = false; });   /* ★ここで はじめて 倉庫が 答える★ */
    await new Promise((r) => setTimeout(r, 2000));             /* あとから 何かが 生えてこないか 待つ */
    const atoFuda = await pg.evaluate(() => !!document.querySelector('[data-ledger-import]'));
    const ato = await pg.evaluate(ICHI);
    const ue2 = await pg.evaluate(UE);
    await pg.close();
    mita++;
    /* ★Ａは 札が 出ていないと 測った事に ならない★（出ない＝生えてくる 心配も 無い＝未測定） */
    if (!osoi && !maeFuda) { console.log('  🟡 ' + nabe + ' 幅' + w + ' … ★未測定★（札が 出なかった）'); mihakari++; continue; }
    const ugoita = Object.keys(mae).filter((k) => ato[k] !== undefined && zure(mae[k], ato[k]) !== 0);
    const saidai = ugoita.length ? Math.max.apply(null, ugoita.map((k) => Math.abs(zure(mae[k], ato[k])))) : 0;
    const fuda = maeFuda ? '開いた時から 札が 在る' : (atoFuda ? '★あとから 札が 生えた★' : '札は 次に 描く時に 出る');
    if (ugoita.length) {
      akai++;
      const msg = nabe + ' 幅' + w + ' … ★押す物が ' + ugoita.length + '個 動いた（最大 ' + saidai + 'px）★（' + fuda + '）';
      console.log('  ✗ ' + msg); atarazuKei.push(msg);
      ugoita.slice(0, 4).forEach((k) => console.log('       ★' + zure(mae[k], ato[k]) + 'px 逃げた★ ' + k));
      /* ★誰が 生えたか★＝上の 帯を 前後で 並べる（次の 回で 上書きされない よう ここで 出す） */
      console.log('       ── 入力画面の 上（前）──'); (ue1 || []).forEach((x) => console.log('         ' + String(x.h).padStart(4) + 'px ' + x.nm + ' 「' + x.ji + '」'));
      console.log('       ── 入力画面の 上（後）──'); (ue2 || []).forEach((x) => console.log('         ' + String(x.h).padStart(4) + 'px ' + x.nm + ' 「' + x.ji + '」'));
    } else {
      console.log('  ✓ ' + nabe + ' 幅' + w + ' … 押す物 ' + Object.keys(mae).length + '個 ★1つも 動いていない★（' + fuda + '）');
    }
  }
}

await b.close(); srv.close();
console.log('\n  見た ' + mita + '通り ／ 押す物 のべ ' + botanKei + '個 ／ ★当たらない ' + atarazuKei.length + '個★'
  + ' ／ 画面の外 ' + sotoKei + '個 ／ 🟡未測定 ' + mihakari);
if (atarazuKei.length) { console.log('  ★当たらなかった 物★'); atarazuKei.forEach((x) => console.log('    ・' + x)); }
process.exit(akai ? 1 : 0);
