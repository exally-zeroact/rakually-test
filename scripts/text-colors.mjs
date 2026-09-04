/* text-colors.mjs — ★描き終わった画面から 字の色を数える★（本物のブラウザで測る）
 * =============================================================================
 * 決まり（司さん・全アプリ）: ★読ませる字は薄い黒。色は「押せる物」と「選ばれている物」だけ★
 *
 * ★2026-08-22 作り直した理由（指示役の裁定）★
 *   前の姿は ★jsdom に静的なHTMLを描かせているだけ★で、
 *   ★JSが作る画面を1つも見ていなかった★。だから「0箇所」と言い続けていた＝★嘘の緑★。
 *   （指示役の grep 実測 87件も 本当の数ではない＝ソースの字を数えただけ・CSSとclassは未測定）
 *   ⇒ どちらも捨てて ★描き終わった画面から 1つの数を出す★。
 *
 * ★手本＝timeally-test/scripts/screen-check.mjs★（新しい物を作らない・司さんの決まり）
 *   ① アプリを jsdom で ★本当に動かす★（タブも押す）
 *   ② ★script を全部 外し★、CSS は ★本物を file:// で読む★
 *   ③ それを ★本物の Chrome★ に渡し、★きっかりの幅の枠(iframe)★ の中で
 *      getComputedStyle / getBoundingClientRect で ★見えている物だけ★ 数える
 *   ④ 答えは postMessage で外へ返す（--dump-dom は外側しか写さない）
 *   ★踏んだ穴★ … 印刷の画面は ★紙のHTMLを文字列で持っていて その中にも </body> が在る★。
 *                 最初の </body> に計測を入れると ★字の中に埋まって 何も返らない★（実測）。
 *                 ⇒ ★最後の </body>★ に入れる。
 *
 * 数え方（前の姿から そのまま持ってきた＝6つの穴を塞いだ結果）
 *   ・「読ませる字」＝ 自分の直下に字を持つ要素のうち ★押せる物でも 選ばれている物でもない★物
 *   ・押せる物 … button / a / summary / [role=button] ／ ★自分で指の形を宣言した札★
 *     ★先祖が指の形＝中身を全部 見ない、はやり過ぎ★（押せる行の中の 見出しも金額も 読む字）
 *   ・選ばれている物 … on/active/sel/current が付いた ★押す物★（入れ物の active は選択ではない）
 *   ・★打つ欄（input/select/textarea）の中の字も数える★（＝打った値・金額＝読ませる字）
 *   ・★見えていない物は数えない★（Chrome で実測。jsdom には段組みが無いので出来なかった）
 *
 * ★今は「0箇所」ではなく「控えと同じか」で見る★（2026-08-22）
 *   実測 ★78箇所★ が残っている。★塗り替えるかは 指示役の裁定待ち★なので、
 *   ここでは ★下の NOW と1つでも違ったら赤★ にする。
 *     増えた＝新しく色を付けた（止める）／減った＝直したので ★NOW を下げる（直った事を数で残す）★
 *   ★戻す条件★ … 指示役が「塗り替えてよい」と言った日に NOW を 0 にする。
 *
 * 使い方:
 *   node scripts/text-colors.mjs             … 全画面を数える（控えと違えば赤）
 *   node scripts/text-colors.mjs --list      … 直す物を1行ずつ出す
 *   node scripts/text-colors.mjs --self-test … わざと1か所ずつ禁止色へ変えて 捕まえられるか
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const require_ = createRequire(pathToFileURL(path.join(ROOT, 'package.json')));
let JSDOM;
try { ({ JSDOM } = require_('jsdom')); }
catch { console.error('★jsdom が要ります（npm install）。数えられないので止めます（0件と言わない）。'); process.exit(2); }

function findChrome() {
  const c = [
    path.join(process.env['ProgramFiles'] || '', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] || '', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env['LOCALAPPDATA'] || '', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
    '/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium',
  ];
  for (const p of c) if (p && fs.existsSync(p)) return p;
  return null;
}
const CHROME = findChrome();
if (!CHROME) {
  /* ★測れない日に 黙って緑にしない★（SKIPを緑と呼ばない） */
  console.error('★ブラウザが見つかりません。描き終わった画面を測れないので止めます（0件と言わない）。');
  process.exit(2);
}
const OUT = path.join(os.tmpdir(), 'rakunally-text-colors');
fs.mkdirSync(OUT, { recursive: true });
const WIDTH = 390, HEIGHT = 844;   /* 客がいちばん使う幅（iPhone） */

/* ★読ませる字の色＝3段だけ★（指示役の裁定 2026-08-22・★新しい段を作らない★）
     #333333 … 本文・値・金額（body の既定はこれ）
     #555555 … 副の情報（注記・補足）
     #6E6E6E … いちばん薄い注記
   ★なぜ この3段か（Rakunally として決めた理由・2026-08-22）★
     ・決まりは「薄い黒（#333前後）／色は押せる物と選ばれている物だけ／真っ黒にしない」。
     ・Rakunally の地は白なので ★白の上で読めるか★を先に測った（対比）:
       #333333＝12.6:1 ／ #555555＝7.5:1 ／ #6E6E6E＝5.1:1。★どれも小さい字の下限 4.5:1 を超える★。
     ・段を3つで切るのは ★「2つめの薄い黒」を勝手に増やさないため★
       （実際に #000000 が2箇所 紛れていた）。
     ・★段を足したくなったら 足す前に この見張りが赤で止める★（下の READ_OK が正）。
   ★戻す条件★ … 司さんが段を増やす／減らすと決めた日。 */
const BODY_BLACK = '#333333';
const READ_OK = ['#333333', '#555555', '#6E6E6E'];
/* ★例外（理由と戻す条件つき）★ 状態そのものが色で意味を持つ字。箱の色と揃えている。 */
const STATE_OK = {
  '#92500A': '注意（.warn）… 箱の色と同じ。★色が意味★なので黒にしない',
  '#C0392B': 'まちがい（.bad / 消す）… 箱の色と同じ。★色が意味★なので黒にしない',
  '#52B788': '製品の名前（.logo / .hd-logo）… ★マークであって読ませる字ではない★',
};

/* ── 画面ごとの「動かし方」 ─────────────────────────────── */
function meisaiBoot(win) {
  win.Store = {
    meisaiAuth: () => Promise.resolve({ found: true, remembered: true, name: '山田 太郎', hasPassword: true }),
    getMeisaiDocs: () => Promise.resolve({
      name: '山田 太郎', needConsent: false,
      docs: [
        { id: 'd1', ym: '2026-07', kind: 'monthly', net: 216380, openedAt: null },
        { id: 'd2', ym: '2026-06', kind: 'monthly', net: 214500, openedAt: '2026-07-01' },
      ],
    }),
    getMeisai: () => Promise.resolve({ doc: {} }),
    getNenchoDecl: () => Promise.resolve({ found: true, decl: {} }),
    getFurikomi: () => Promise.resolve({ found: false }),
  };
  win.history.replaceState(null, '', '?t=dummy');
}
function nenchoAfter(win, doc) {
  const b = doc.getElementById('to-nencho');
  if (b) b.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
}
function seikyuBoot(win) {
  const src = fs.readFileSync(path.join(ROOT, 'tests/fake-supa.js'), 'utf8');
  const m = { exports: {} };
  new Function('module', 'exports', src)(m, m.exports);
  win.__mkSb = () => m.exports.createFakeSupa({
    uid: 'u1',
    tables: {
      pay_org: [{ account_id: 'u1', data: { yago: '合同会社Rakunally', invoiceNo: 'T3500003003293' }, updated_at: '2026-08-01T00:00:00Z' }],
      pay_partners: [{ id: 'pt_a', account_id: 'u1', sort: 0, data: { name: 'A株式会社', keisho: '御中', askOk: { honor: 1, person: 1, addr: 1, payTerm: 1, gensen: 1 } }, deleted_at: null }],
      pay_invoices: [], pay_receipts: [],
      pay_companies: [{ account_id: 'u1', data: {}, updated_at: '2026-08-01T00:00:00Z' }],
    },
    pk: { pay_org: 'account_id', pay_companies: 'account_id' },
    unique: { pay_invoices: [['account_id', 'doc_type', 'no']] },
  });
}
async function seikyuAfter(win) { if (win.SeikyuApp) await win.SeikyuApp.attach(win.__mkSb()); }

/* 給与は「人を1人 置いて タブを押す」まで やってから測る */
const kyuyoTab = (tab) => (win, doc) => {
  const A = win.__PAYSLIP_TEST;
  if (!A) throw new Error('app.js が動いていない（測れていません）');
  const e = A.defEmp('山田 太郎');
  e.payType = '月給'; e.base = '260000'; if (e.shikyu && e.shikyu[0]) e.shikyu[0].value = '260000';
  e.pref = 'ehime';
  A.state.company = A.defCompany(); A.state.company.pref = 'ehime';
  A.state.month = '2026-08'; A.state.employees = [e];
  const b = doc.querySelector('button[data-scr="' + tab + '"]');
  if (!b) throw new Error('タブが無い: ' + tab);
  b.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
};

/* ★帳票の中まで 入る★（2026-09-05）
   ★ここまでは 一度も 測っていなかった★＝「給与 ▸ 一覧/集計」は 一覧のまま止まっていて、
   帳票（社保一覧・部署別・賃金台帳・算定基礎届・月額変更届・労働保険・資格・支払調書）は
   ★0件ではなく 未測定★だった。指示役の注文（届出の表の色を 値で出す）で 見つかった。 */
const kyuyoCho = (cho) => async (win, doc) => {
  const push = (sel) => {
    const b = doc.querySelector(sel);
    if (!b) throw new Error('押す物が無い: ' + sel + '（測れていません）');
    b.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  };
  push('.seg-b[data-view="cho"]');
  await new Promise((r) => setTimeout(r, 200));
  push('.seg-b[data-cho="' + cho + '"]');
  await new Promise((r) => setTimeout(r, 300));
};

const goTo = (sel) => (win, doc) => {
  const b = doc.querySelector(sel);
  if (!b) throw new Error('押す物が無い: ' + sel + '（測れていません）');
  b.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
};
/* ★管理は ログインするまで .hide で隠れている★＝ログインした人が見る姿にしてから測る
   （[hidden] を開くのと同じ考え。★class の display で隠す形★も 開く） */
const unhide = (win, doc) => { doc.querySelectorAll('.hide').forEach((e) => e.classList.remove('hide')); };

const SCREENS = [
  { name: '入口', file: 'index.html' },
  { name: '入口 ▸ 共有データ', file: 'index.html', after: goTo('[data-go="scr-data"]'), expect: ['#scr-data.active .fld'] },
  { name: '給与 ▸ 設定', file: 'kyuyo/index.html', boot: kyuyoTab('scr-settings'), expect: ['#scr-settings .card-h'] },
  { name: '給与 ▸ 入力', file: 'kyuyo/index.html', boot: kyuyoTab('scr-input'), expect: ['#input-list .cal-box'] },
  { name: '給与 ▸ 一覧/集計', file: 'kyuyo/index.html', boot: kyuyoTab('scr-list'), expect: ['#scr-list'] },
  /* ★帳票の 表そのもの（.dc-tab）は 倉庫（Store）が 要る＝この道具では ★未測定★（0件では ない）★
     ここで 測れるのは ★倉庫なしでも 描かれる物★＝届出の表 と 退職金の札。
     ★戻す条件★ … 偽の倉庫を 積んで .dc-tab まで 描けた日に expect を .dc-tab にする。 */
  { name: '給与 ▸ 帳票 ▸ 算定基礎届', file: 'kyuyo/index.html', boot: kyuyoTab('scr-list'), after: kyuyoCho('santei'), expect: ['#view-cho .tdk-t'] },
  { name: '給与 ▸ 印刷', file: 'kyuyo/index.html', boot: kyuyoTab('scr-print'), expect: ['#scr-print'] },
  { name: '給与 ▸ 振込', file: 'kyuyo/index.html', boot: kyuyoTab('scr-furikomi'), expect: ['#scr-furikomi .card-h'] },
  { name: 'Web明細 ▸ 開く前', file: 'kyuyo/meisai.html', expect: ['.lead'] },
  { name: 'Web明細', file: 'kyuyo/meisai.html', boot: meisaiBoot, expect: ['.dlist .drow'] },
  { name: 'Web明細 ▸ 年末調整', file: 'kyuyo/meisai.html', boot: meisaiBoot, after: nenchoAfter, expect: ['.nw-q'] },
  { name: '管理', file: 'kyuyo/admin.html', after: unhide, expect: ['#topbar small'] },
  { name: '請求書', file: 'seikyu/index.html', boot: seikyuBoot, after: seikyuAfter, expect: ['#tot-box .tot-r'] },
  { name: '請求書 ▸ 設定', file: 'seikyu/index.html', boot: seikyuBoot,
    after: async (win, doc) => { await seikyuAfter(win); goTo('[data-scr="scr-set"]')(win, doc); }, expect: ['.sub-h'] },
];

/* ── ① アプリを本当に動かして、描き終わった姿を返す ─────────────── */
async function render(sc) {
  const file = path.join(ROOT, sc.file);
  const html = fs.readFileSync(file, 'utf8');
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' + sc.file,
  });
  const win = dom.window, doc = win.document;
  win.fetch = () => Promise.reject(new Error('no net'));
  win.alert = () => {}; win.confirm = () => true; win.scrollTo = () => {}; win.print = () => {};
  win.URL.createObjectURL = () => 'blob:fake';
  win.open = () => ({ document: { write() {}, close() {} }, focus() {}, print() {}, close() {} });
  if (sc.boot && !sc.file.startsWith('kyuyo/index')) sc.boot(win, doc);   /* 倉庫の差し替えは 走らせる前 */
  /* ★外す物は名前で ぴったり合わせる★（ゆるく書くと seikyu-store.js まで落ちる） */
  const drop = ['supa-config.js', 'auth.js', 'env-badge.js', 'rakunally-login.js'];
  if (sc.file === 'kyuyo/meisai.html' || sc.file === 'seikyu/index.html') drop.push('store.js');
  for (const m of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
    const src = m[1].split('?')[0];
    if (/^https?:/.test(src) || drop.indexOf(src.split('/').pop()) >= 0) continue;
    const p = path.resolve(path.dirname(file), src);
    if (!fs.existsSync(p)) continue;
    const el = doc.createElement('script');
    el.textContent = fs.readFileSync(p, 'utf8');
    doc.body.appendChild(el);
  }
  await new Promise((r) => setTimeout(r, 500));
  if (sc.boot && sc.file.startsWith('kyuyo/index')) { sc.boot(win, doc); await new Promise((r) => setTimeout(r, 300)); }
  if (sc.after) { await sc.after(win, doc); await new Promise((r) => setTimeout(r, 300)); }
  /* ★描けていないのに 0件と言わない★ */
  const missing = (sc.expect || []).filter((s) => !doc.querySelector(s));
  /* ★script を外し・hidden を開き・CSS は本物を file:// で読む★ */
  doc.querySelectorAll('script').forEach((s) => s.remove());
  doc.querySelectorAll('[hidden]').forEach((x) => x.removeAttribute('hidden'));
  doc.querySelectorAll('link[rel="stylesheet"]').forEach((l) => {
    const href = (l.getAttribute('href') || '').split('?')[0];
    if (/^https?:/.test(href)) { l.remove(); return; }   /* 外の字は測らない＝毎回同じ値にする */
    l.setAttribute('href', pathToFileURL(path.resolve(path.dirname(file), href)).href);
  });
  return { html: '<!doctype html>\n' + doc.documentElement.outerHTML, missing };
}

/* ── ③ Chrome の中で数える（この文字列が ブラウザの中で走る） ────────── */
const PROBE = `
  function hex(c){var m=/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/.exec(String(c||''));
    if(!m)return null;return '#'+[1,2,3].map(function(i){return (+m[i]).toString(16).padStart(2,'0');}).join('').toUpperCase();}
  function vis(e){var r=e.getBoundingClientRect();if(r.width<=0||r.height<=0)return false;
    var cs=getComputedStyle(e);return cs.display!=='none'&&cs.visibility!=='hidden'&&cs.opacity!=='0';}
  function name(e){return e.tagName.toLowerCase()+(e.id?'#'+e.id:'')
    +(e.className&&typeof e.className==='string'?'.'+e.className.trim().replace(/\\s+/g,'.'):'');}
  var PRESS='button,a,summary,[role="button"]';
  var VALUE='input,select,textarea';
  var SELECTED=/(^|[\\s-])(on|active|sel|current)([\\s-]|$)/;
  var rows=[];
  [].forEach.call(document.querySelectorAll('*'),function(el){
    if(/^(SCRIPT|STYLE|TITLE|HEAD|LINK|META)$/.test(el.tagName))return;
    if(el.matches(VALUE))return;
    if(!vis(el))return;
    var own='';
    [].forEach.call(el.childNodes,function(n){if(n.nodeType===3&&n.textContent.trim())own+=n.textContent.trim()+' ';});
    own=own.trim(); if(own.length<2)return;
    if(el.closest(PRESS))return;
    if(getComputedStyle(el).cursor==='pointer'){
      var owner=el;
      while(owner.parentElement&&getComputedStyle(owner.parentElement).cursor==='pointer')owner=owner.parentElement;
      var kids=[].filter.call(owner.children,function(c){return (c.textContent||'').trim();});
      if(owner===el&&!kids.length&&own.length<=12)return;
    }
    var sel=SELECTED.test(String(el.className||''));
    if(!sel){for(var n2=el.parentElement;n2&&n2.tagName!=='BODY';n2=n2.parentElement){
      if(!SELECTED.test(String(n2.className||'')))continue;
      if(n2.matches(PRESS)||getComputedStyle(n2).cursor==='pointer')sel=true;
      break;}}
    if(sel)return;
    var c=hex(getComputedStyle(el).color);
    if(!c)return;
    if(c==='#FFFFFF'){var bg=hex(getComputedStyle(el).backgroundColor);if(bg&&bg!=='#FFFFFF')return;}
    rows.push({color:c,kind:'字',where:name(el),text:own.replace(/\\s+/g,' ').slice(0,26)});
  });
  [].forEach.call(document.querySelectorAll(VALUE),function(el){
    if(['hidden','checkbox','radio','file'].indexOf(el.type)>=0)return;
    if(!vis(el))return;
    var c=hex(getComputedStyle(el).color);
    if(!c)return;
    rows.push({color:c,kind:'打つ欄の中の字',where:name(el),text:(el.placeholder||el.value||'（打った値がここに出る）').slice(0,26)});
  });
  return {w:window.innerWidth,body:hex(getComputedStyle(document.body).color),rows:rows};
`;

function measure(tag, html) {
  const base = tag.replace(/[^\w]+/g, '_');
  const page = path.join(OUT, base + '.html');
  /* ★最後の </body> に入れる★（印刷の画面は紙のHTMLを文字列で持っていて 中にも </body> が在る） */
  const tail = '<script>window.addEventListener("load",function(){var r;try{r=JSON.stringify((function(){'
    + PROBE + '})());}catch(e){r=JSON.stringify({error:String(e)});}parent.postMessage(r,"*");});</scr' + 'ipt>';
  const cut = html.lastIndexOf('</body>');
  if (cut < 0) throw new Error(tag + ' … </body> が無い（測れていません）');
  fs.writeFileSync(page, html.slice(0, cut) + tail + html.slice(cut), 'utf8');
  const host = path.join(OUT, base + '.host.html');
  fs.writeFileSync(host, '<!doctype html><html><head><meta charset="utf-8">'
    + '<style>html,body{margin:0}iframe{border:0;display:block}</style></head><body>'
    + '<iframe width="' + WIDTH + '" height="' + HEIGHT + '" src="' + path.basename(page) + '"></iframe>'
    + '<script>window.addEventListener("message",function(e){document.title=e.data;});</scr' + 'ipt></body></html>', 'utf8');
  const out = execFileSync(CHROME, ['--headless', '--disable-gpu', '--hide-scrollbars',
    '--window-size=1200,1000', '--virtual-time-budget=5000', '--dump-dom', pathToFileURL(host).href],
  { encoding: 'latin1', maxBuffer: 40 * 1024 * 1024, timeout: 90000 });
  const m = /<title>([^<]*)<\/title>/.exec(out);
  if (!m || !m[1]) throw new Error(tag + ' … 枠の中から答えが返りません（★測れていません＝0件ではありません★）');
  const j = JSON.parse(Buffer.from(m[1], 'latin1').toString('utf8').replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  if (j.error) throw new Error(tag + ' を測れません: ' + j.error);
  if (j.w !== WIDTH) throw new Error(tag + ' … 頼んだ幅 ' + WIDTH + ' で測れていません（実測 ' + j.w + '）');
  return j;
}

/* ★今 残っている数（2026-08-22 実測）★
   ★これは「合格」ではない★。★指示役の裁定を待っている数★。
   ・増えたら赤（新しく色を付けた＝止める）／・減っても赤（直したら ★この控えを下げる★）
   ★戻す条件★ … 指示役が「塗り替えてよい」と言った日に 0 にする。
   ★数え方★ … 幅390px・本物のChrome・押せない字のうち 薄い黒でない物（例外3色は数えない） */
const NOW = {
  '入口': 0,
  '入口 ▸ 共有データ': 0,
  '給与 ▸ 設定': 0,
  '給与 ▸ 入力': 0,
  '給与 ▸ 一覧/集計': 0,
  '給与 ▸ 帳票 ▸ 算定基礎届': 0,
  '給与 ▸ 印刷': 0,
  '給与 ▸ 振込': 0,
  'Web明細 ▸ 開く前': 0,
  'Web明細': 0,
  'Web明細 ▸ 年末調整': 0,
  '管理': 0,
  '請求書': 0,
  '請求書 ▸ 設定': 0,
};

/* 薄い黒でも 例外でもない物だけ残す */
const badOnly = (rows) => rows.filter((r) => READ_OK.indexOf(r.color) < 0 && !STATE_OK[r.color]);

const list = process.argv.includes('--list');
const selfTest = process.argv.includes('--self-test');

if (!selfTest) {
  console.log('\n[描き終わった画面から 字の色を数える] 読ませる字は ' + BODY_BLACK
    + '（色は押せる物と選ばれている物だけ）／幅 ' + WIDTH + 'px・本物のChrome');
  const per = [];
  for (const sc of SCREENS) {
    const r = await render(sc);
    const j = measure(sc.name + '-' + sc.file, r.html);
    const bad = badOnly(j.rows);
    per.push({ sc, bad, body: j.body, missing: r.missing });
    const byColor = {};
    bad.forEach((x) => { byColor[x.color] = (byColor[x.color] || 0) + 1; });
    console.log('  ' + sc.name.padEnd(20) + String(bad.length).padStart(4) + '箇所'
      + (bad.length ? '  … ' + Object.entries(byColor).sort((x, y) => y[1] - x[1]).map(([c, n]) => c + '×' + n).join(' ') : '')
      + (r.missing.length ? '   ★描けていません（未測定）: ' + r.missing.join(' , ') + '★' : ''));
  }
  const all = per.flatMap((p) => p.bad);
  const byColor = {};
  all.forEach((r) => { byColor[r.color] = (byColor[r.color] || 0) + 1; });
  const bodyBad = per.filter((p) => p.body !== BODY_BLACK).map((p) => p.sc.name + '（' + p.body + '）');
  const unmeasured = per.filter((p) => p.missing.length);
  console.log('\n  ★押せない字のうち 薄い黒でない物 … 合計 ' + all.length + '箇所★');
  /* ★0件と混ぜない★＝この道具が まだ描けていない「状態」を 名前で出す。
     2026-08-22 の実配信の数え直しで、給与▸印刷の ★配布ずみの行★ に2箇所 見つかった
     （公開した明細が無いと その行は描かれない＝手元の見本では 出ない）。
     ★戻す条件★ … 偽の倉庫で「公開ずみの明細」を1件 作れるようにした日に 画面として足す。 */
  console.log('  ★まだ届いていない状態★ … 給与 ▸ 印刷（配布ずみの行）／請求書 ▸ 入力（当てた表 .guess-t）'
    + '（0件と混ぜない＝実配信で数え直して補う）');
  console.log('  色ごと … ' + Object.entries(byColor).sort((a, b) => b[1] - a[1]).map(([c, n]) => c + '×' + n).join(' '));
  console.log('  例外（色そのものが意味・数えていない）… '
    + Object.entries(STATE_OK).map(([c, w]) => c + '＝' + w.split('…')[0].trim()).join(' ／ '));
  if (list) per.forEach((p) => p.bad.forEach((r) => console.log('    ' + p.sc.name + '  ' + r.color + '  ['
    + r.kind + '] ' + r.where + '  「' + r.text + '」')));
  /* ★控えと突き合わせる★（増えても減っても赤＝数を黙って動かさない） */
  const zure = per.filter((p) => NOW[p.sc.name] !== p.bad.length)
    .map((p) => p.sc.name + '（控え ' + NOW[p.sc.name] + ' → 今 ' + p.bad.length + '）');
  const nokori = Object.keys(NOW).filter((k) => !SCREENS.some((s2) => s2.name === k));
  if (bodyBad.length) console.error('\n★字の既定（body）が薄い黒でない画面★ … ' + bodyBad.join(' , '));
  if (unmeasured.length) console.error('★描けていない画面（未測定・0件ではない）★ … '
    + unmeasured.map((p) => p.sc.name).join(' , '));
  if (nokori.length) console.error('★控えに在るのに 画面が無い★ … ' + nokori.join(' , '));
  if (zure.length) console.error('\n★控えと合いません★ … ' + zure.join(' ／ ')
    + '\n  増えた＝新しく色を付けた（止める）／減った＝直したので ★この道具の NOW を下げる★');
  if (zure.length || bodyBad.length || unmeasured.length || nokori.length) process.exit(1);
  const total = Object.values(NOW).reduce((a, b) => a + b, 0);
  console.log('\n控えと ぴったり一致（合計 ' + total + '箇所）。'
    + (total ? '★これは合格ではない＝指示役の裁定待ちの数★' : '読ませる字に色は 0箇所。緑。'));
} else {
  /* ★わざと1か所ずつ 禁止色へ変えて 捕まえられるか★
     ★画面ごとに壊す★（全画面を回すと 何十分もかかる＝重い試験にしない） */
  const BREAKS = [
    ['css/hub.css', /(body \{[^}]*?color:\s*)#[0-9A-Fa-f]{6}/, '入口の字の既定', '入口'],
    ['css/hub.css', /(\.fld label \{[^}]*?color:\s*)#[0-9A-Fa-f]{6}/, '入口の欄の名前', '入口 ▸ 共有データ'],
    ['kyuyo/css/app.css', /(body\{[^}]*?color:\s*)#[0-9A-Fa-f]{6}/, '給与の字の既定', '給与 ▸ 入力'],
    ['kyuyo/css/app.css', /(\.card-h\{[^}]*?color:\s*)#[0-9A-Fa-f]{6}/, '給与のカードの見出し', '給与 ▸ 設定'],
    ['kyuyo/css/app.css', /(\.finput\{[^}]*?color:\s*)#[0-9A-Fa-f]{6}/, '給与の打つ欄の中の字（値・金額）', '給与 ▸ 入力'],
    ['kyuyo/meisai.html', /(\.lead\{[^}]*?color:\s*)#[0-9A-Fa-f]{6}/, '明細の本文', 'Web明細 ▸ 開く前'],
    ['kyuyo/meisai.html', /(\.dlist \.drow \.dv\{[^}]*?color:\s*)#[0-9A-Fa-f]{6}/, '明細の一覧の金額（JSが描く字）', 'Web明細'],
    ['kyuyo/meisai.html', /(\.nw-q\{[^}]*?color:\s*)#[0-9A-Fa-f]{6}/, '年末調整の質問文（JSが描く字）', 'Web明細 ▸ 年末調整'],
    ['kyuyo/admin.html', /(\.bar small\{[^}]*?color:\s*)#[0-9A-Fa-f]{6}/, '管理の小さい説明', '管理'],
    ['css/rakunally-ui.css', /(\.hint \{[^}]*?color:\s*)#[0-9A-Fa-f]{6}/, '皮の注意書き（請求書が読む）', '請求書'],
    ['seikyu/css/app.css', /(\.sub-h \{[^}]*?color:\s*)#[0-9A-Fa-f]{6}/, '請求書の中見出し', '請求書 ▸ 設定'],
    ['seikyu/css/app.css', /(\.no-v \{[^}]*?color:\s*)#[0-9A-Fa-f]{6}/, '請求番号（開いている画面の中）', '請求書'],
    ['seikyu/css/app.css', /(\.tot-g \{[^}]*?color:\s*)#[0-9A-Fa-f]{6}/, '締めの合計金額（JSが描く字）', '請求書'],
  ];
  /* ★どこにも無い色★ … 出たら必ず 私が壊した物＝取り違えない。
     ★禁止色（使わないと決めた濃い緑）は 壊す色に使わない★（この見張りの中に その字を書くだけで
       no-dark-green が赤になる。2026-08-22 に実際に踏んだ＝★見張りが 別の見張りを壊す★） */
  const BREAK_TO = '#FF00FF';
  console.log('\n★自己確認（1か所ずつ 禁止色へ変えて 捕まえられるか）★');
  let ok = 0, ng = 0;
  for (const [file, rx, why, screen] of BREAKS) {
    const sc = SCREENS.find((s) => s.name === screen);
    const p = path.join(ROOT, file);
    const keep = fs.readFileSync(p, 'utf8');
    if (!rx.test(keep)) { ng++; console.log('  NG  ' + why + '（★壊す場所が見つからない＝見張りが古い★ ' + file + '）'); continue; }
    try {
      fs.writeFileSync(p, keep.replace(rx, '$1' + BREAK_TO));
      const r = await render(sc);
      const j = measure('self-' + why, r.html);
      const hit = j.rows.filter((x) => x.color === BREAK_TO).length + (j.body === BREAK_TO ? 1 : 0);
      if (hit) { ok++; console.log('  ok  ' + why + ' → ' + screen + ' で ' + hit + '箇所 捕まえる'); }
      else { ng++; console.log('  NG  ' + why + '（★壊しても赤にならない★ ' + screen + '）'); }
    } finally { fs.writeFileSync(p, keep); }   /* ★必ず戻す★ */
  }
  console.log('\n自己確認: ' + ok + '/' + BREAKS.length + ' 通り 捕まえた');
  if (ng) process.exit(1);
}
