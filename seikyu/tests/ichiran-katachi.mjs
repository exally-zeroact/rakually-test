/* ichiran-katachi.mjs — ★一覧の 形を 代行請求の 一覧に 寄せる★（実際に 押す＋本物の Chrome で 形を 測る）
 * =============================================================================
 * 司さん 2026-10-23（スマホの 実画面に 赤丸）
 *   ① カードの「金額まだ 5行」の 行に ★会社名と、その右端に 合計金額★
 *      （代行請求の .list-item＝会社名が 左・金額が 右端）。下書きで 金額が 無い時の 知らせは 消さない。
 *   ② 確認・修正・削除の ボタンを ★もっと すっきり★（太い 枠の 大きな ボタン3つ を やめる）。
 *      押せる 大きさ（44px 前後）と ★削除が 他と 見分けられる★ 事は 守る。
 *   ③ 一覧の 上は ★「会社を選ぶ」「期間（月）を選ぶ」の 2つが 横に 並ぶ★（代行請求 .filterbar・先頭は 全社／全期間）
 *      ＋その下に「N件」と 右端に「合計」の 1行（代行請求 .list-sum）。
 *      会社の 選択肢は ★取引先の 登録（マスタ）★から 作る（請求書に 出てくる 相手だけ でなく）。
 *      一覧の 頭の「ぜんぶ」の 集計は ★一覧から 外す★（集計は 別の 画面へ 移る）。
 *
 * 見る物（jsdom で 本物の seikyu-app.js を 動かす）:
 *   ① 絞りは 会社と 期間の 2つ だけ・横並びの 箱の 中・先頭は 全社／全期間
 *   ② 会社の 選択肢は 登録の 会社から（請求書が 1通も 無い 会社も 並ぶ・登録の 順）
 *   ③ 選ぶと 一覧と「N件・合計」が 変わる（会社・期間・両方）
 *   ④ カードの 1行に 会社名と 金額（同じ 行の 中）
 *   ⑤ 下書きで 金額が 無い時は その 行に「金額まだ N行」（0円と 見せない）
 *   ⑥ 確認・修正・削除が 押せて 働く（削除は 倉庫から 消える）
 *   ⑦ 一覧の 頭に 集計の 選び（月の select・集計の 1行）が 無い
 *   ⑪ ★合計は 発行済みの 請求書だけ★（2026-10-24 taiketsu が 止めた＝実測で 下書き 1,100・取り消し 99,999 が 混ざった）
 *      材料は ★実際に 保存される 形★＝品名だけの 下書き（grandTotal 0）・一部だけ 金額の 下書き（1,100）・
 *      取り消し（99,999）・見積（77,777）。字で「発行済み N件の合計」・入れなかった物も 字で 言う。
 *      発行済みが 0通の 絞り（下書き・取り消し）では 合計を 出さない。
 *   ⑫ 同じ 名前の 取引先が 2件 在る時、会社の 選択肢で 見分けが 付く
 *   ⑬ 「もっと」の 見出しに 中に 無い「集計」を 書かない
 * --self-test ＝ ★本物の seikyu-app.js を わざと 壊して 動かし、上の 見張りが 赤に なるかを 見る★
 *   （字が 在るかを 数えるだけ では ない＝壊しても 緑の 見張りを 置かない・taiketsu 10-24）
 * 見る物（本物の Chrome・390px と 320px）:
 *   ⑧ 会社名が 左・金額が ★右端★（行の 右の 端と 2px 以内）・同じ 高さ・名前が 長くても 金額は 1行で 右端
 *   ⑨ 会社と 期間の 2つが ★横に 並ぶ★・件数が 左／合計が 右端
 *   ⑩ ボタンは 高さ 40px 以上・★削除の 字の 色が 他と 違う★・横に はみ出さない
 *
 * 使い方: node seikyu/tests/ichiran-katachi.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const require_ = createRequire(pathToFileURL(path.join(ROOT, 'package.json')));
let JSDOM;
try { ({ JSDOM } = require_('jsdom')); }
catch { console.log('★jsdom が要ります（npm install）。飛ばせません（SKIPを緑と呼ばない）。'); process.exit(1); }

const SELF = process.argv.includes('--self-test');
let pass = 0, fail = 0;
const ok = (v, m) => { if (!v) throw new Error(m || 'false'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m ? m + ': ' : '') + 'ほしい ' + JSON.stringify(b) + ' / 出た ' + JSON.stringify(a)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = async (n, f) => { try { await f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };

const FILE = path.join(ROOT, 'seikyu/index.html');
const APP = fs.readFileSync(path.join(ROOT, 'seikyu/js/seikyu-app.js'), 'utf8');

/* ★わざと 長い 会社名★＝金額が 押し出されて 折り返さないかを 見る */
const NAGAI = '株式会社とても長い名前の取引先ホールディングス東日本営業本部';
const PARTNERS = [
  { id: 'pt_a', account_id: 'u1', sort: 0, data: { name: '例野工業', keisho: '御中' }, deleted_at: null },
  { id: 'pt_b', account_id: 'u1', sort: 1, data: { name: NAGAI, keisho: '御中' }, deleted_at: null },
  /* ★請求書が 1通も 無い 会社★＝これが 選択肢に 出るか（請求書から 拾うだけ だと 出ない） */
  { id: 'pt_c', account_id: 'u1', sort: 2, data: { name: '翠川ホテル', keisho: '御中' }, deleted_at: null },
  /* ★同じ 名前の 2件目★（支店など）＝選択肢で 見分けが 付くか */
  { id: 'pt_d', account_id: 'u1', sort: 3, data: { name: '例野工業', keisho: '御中', addr: '大阪府架空市見本町1-1' }, deleted_at: null },
];
const line = (kin) => ({ name: '工事代金', qty: '1', unit: '式', price: kin == null ? '' : String(kin),
  amount: kin == null ? '' : String(kin), rate: 10, memo: '' });
/* ★実際に 保存される 形★（taiketsu 10-24 実測）＝品名だけの 下書きも grandTotal は 0 で 保存される。
   kin が 配列なら 行ごとの 金額（null は 金額の 空いた 行）。 */
const iv = (id, no, pid, ymd, kin, st, dt) => ({
  id, account_id: 'u1', doc_type: dt || 'invoice', no, partner_id: pid, issue_ymd: ymd, due_ymd: null,
  status: st || 'issued', tax_mode: 'exclusive', rounding: 'floor',
  lines: Array.isArray(kin) ? kin.map(line) : kin == null ? [line(null), line(null)] : [line(kin)],
  totals: { grandTotal: Math.floor((Array.isArray(kin) ? kin.reduce((a, x) => a + (x || 0), 0) : (kin || 0)) * 1.1) },
  snapshot: {}, data: {}, template_id: 'std1', quote_from: null,
  issued_at: st === 'draft' ? null : ymd + 'T00:00:00Z', sent_at: ymd + 'T01:00:00Z', voided_at: null,
  updated_at: ymd + 'T00:00:00Z', deleted_at: null,
});
const INVOICES = [
  iv('v_d', null, 'pt_a', '2026-09-20', null, 'draft'),           // 下書き・品名だけ＝金額まだ 2行・grandTotal 0
  iv('v_dp', null, 'pt_b', '2026-09-21', [1000, null], 'draft'),  // 下書き・一部だけ 金額＝金額まだ 1行・grandTotal 1,100
  iv('v_v', '202609-009', 'pt_a', '2026-09-07', 90909, 'void'),   // 取り消し 99,999
  iv('v_a9', '202609-001', 'pt_a', '2026-09-05', 50000),          // 55,000
  iv('v_b9', '202609-002', 'pt_b', '2026-09-06', 1234567),        // 1,358,023
  iv('v_a8', '202608-001', 'pt_a', '2026-08-05', 20000),          // 22,000
  iv('v_b8', '202608-002', 'pt_b', '2026-08-06', 30000),          // 33,000
];

async function boot(appSrc) {
  const html = fs.readFileSync(FILE, 'utf8');
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/seikyu/index.html',
  });
  const win = dom.window, doc = win.document;
  win.fetch = () => Promise.reject(new Error('no net'));
  win.alert = () => {}; win.confirm = () => true; win.scrollTo = () => {}; win.print = () => {};
  win.URL.createObjectURL = () => 'blob:fake';
  win.open = () => ({ document: { write() {}, close() {} }, focus() {}, print() {}, close() {} });
  const errs = [];
  win.addEventListener('error', (e) => errs.push(String(e.message || e.error)));
  const src = fs.readFileSync(path.join(ROOT, 'tests/fake-supa.js'), 'utf8');
  const m = { exports: {} };
  new Function('module', 'exports', src)(m, m.exports);
  const sb = m.exports.createFakeSupa({
    uid: 'u1',
    tables: {
      pay_org: [{ account_id: 'u1', data: { yago: '合同会社Rakunally', invoiceNo: 'T9000000000009',
        bank: '（見本）銀行 ◯◯支店 普通 1234567' }, updated_at: '2026-08-01T00:00:00Z' }],
      pay_partners: JSON.parse(JSON.stringify(PARTNERS)),
      pay_invoices: JSON.parse(JSON.stringify(INVOICES)), pay_receipts: [],
      pay_companies: [{ account_id: 'u1', data: {}, updated_at: '2026-08-01T00:00:00Z' }],
    },
    pk: { pay_org: 'account_id', pay_companies: 'account_id' },
    unique: { pay_invoices: [['account_id', 'doc_type', 'no']] },
  });
  const DROP = ['supa-config.js', 'auth.js', 'env-badge.js', 'store.js', 'rakunally-login.js'];
  for (const mm of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
    const s = mm[1].split('?')[0], base = s.split('/').pop();
    if (/^https?:/.test(s) || DROP.includes(base)) continue;
    const p = path.resolve(path.dirname(FILE), s);
    if (!fs.existsSync(p)) continue;
    const el = doc.createElement('script');
    el.textContent = (base === 'seikyu-app.js' && appSrc) ? appSrc : fs.readFileSync(p, 'utf8');
    doc.body.appendChild(el);
  }
  await sleep(400);
  ok(win.SeikyuApp, 'seikyu-app.js が動いていない');
  await win.SeikyuApp.attach(sb);
  await sleep(300);
  doc.getElementById('app').hidden = false;
  /* ★お客さんと 同じ道★＝下の タブの「一覧」を 押す */
  const tab = doc.querySelector('.bn[data-scr="scr-list"]');
  ok(tab, '一覧の タブが 無い');
  tab.click();
  await sleep(300);
  return { win, doc, sb, errs };
}

/* ═══ ★形は 本物の Chrome でしか 測れない★（jsdom には 段組みが 無い）
   手本＝seikyu/tests/tpl-ask-ui.mjs の measureShape（同じ やり方・幅だけ 引数） ═══ */
function findChrome() {
  const c = [
    path.join(process.env['ProgramFiles'] || '', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] || '', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env['LOCALAPPDATA'] || '', 'Google/Chrome/Application/chrome.exe'),
    '/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium',
  ];
  for (const p of c) if (p && fs.existsSync(p)) return p;
  return null;
}
async function measure(doc, width) {
  const CHROME = findChrome();
  if (!CHROME) throw new Error('★ブラウザが見つかりません＝形を測れません（0と言わない）★');
  const os = await import('node:os');
  const { execFileSync } = await import('node:child_process');
  const OUT = path.join(os.tmpdir(), 'rakunally-ichiran-katachi');
  fs.mkdirSync(OUT, { recursive: true });
  const d = doc.cloneNode(true);
  d.querySelectorAll('script').forEach((x) => x.remove());
  const app = d.getElementById('app'); if (app) app.removeAttribute('hidden');
  d.querySelectorAll('link[rel="stylesheet"]').forEach((l) => {
    const href = (l.getAttribute('href') || '').split('?')[0];
    if (/^https?:/.test(href)) { l.remove(); return; }
    l.setAttribute('href', pathToFileURL(path.resolve(path.dirname(FILE), href)).href);
  });
  const PROBE = `
    function R(e) { if (!e) return null; var r = e.getBoundingClientRect();
      return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom),
        w: Math.round(r.width), h: Math.round(r.height) }; }
    var list = document.getElementById('scr-list');
    var cards = [].map.call(list.querySelectorAll('.iv-card'), function (c) {
      var ln = c.querySelector('.iv-line'), nm = c.querySelector('.iv-name'), am = c.querySelector('.iv-amt');
      return { card: R(c), line: R(ln), name: R(nm), amt: R(am),
        amtLines: am ? Math.round(am.getBoundingClientRect().height / (parseFloat(getComputedStyle(am).lineHeight) || 20)) : 0,
        amtText: am ? am.textContent : '',
        btns: [].map.call(c.querySelectorAll('.iv-btns button'), function (b) {
          return { t: b.textContent, r: R(b), color: getComputedStyle(b).color }; }) };
    });
    var fb = list.querySelector('.filterbar');
    var sels = fb ? [].map.call(fb.querySelectorAll('select'), R) : [];
    var sum = document.getElementById('list-sum');
    var sp = sum ? [].map.call(sum.children, R) : [];
    return { vw: window.innerWidth, sw: document.documentElement.scrollWidth,
      cards: cards, sels: sels, fb: R(fb), sum: R(sum), sumKids: sp };
  `;
  const tail = '<script>window.addEventListener("load",function(){var r;try{r=JSON.stringify((function(){'
    + PROBE + '})());}catch(e){r=JSON.stringify({error:String(e)});}parent.postMessage(r,"*");});</scr' + 'ipt>';
  const html = '<!doctype html>' + String.fromCharCode(10) + d.documentElement.outerHTML;
  const cut = html.lastIndexOf('</body>');
  const page = path.join(OUT, 'p' + width + '.html');
  fs.writeFileSync(page, html.slice(0, cut) + tail + html.slice(cut), 'utf8');
  const host = path.join(OUT, 'h' + width + '.html');
  fs.writeFileSync(host, '<!doctype html><html><head><meta charset="utf-8">'
    + '<style>html,body{margin:0}iframe{border:0;display:block}</style></head><body>'
    + '<iframe width="' + width + '" height="844" src="p' + width + '.html"></iframe>'
    + '<script>window.addEventListener("message",function(e){document.title=e.data;});</scr' + 'ipt></body></html>', 'utf8');
  const out = execFileSync(CHROME, ['--headless', '--disable-gpu', '--hide-scrollbars',
    '--window-size=1200,1000', '--virtual-time-budget=5000', '--dump-dom', pathToFileURL(host).href],
  { encoding: 'latin1', maxBuffer: 40 * 1024 * 1024, timeout: 90000 });
  const mt = /<title>([^<]*)<\/title>/.exec(out);
  if (!mt || !mt[1]) throw new Error('★枠の中から答えが返りません＝測れていません★');
  const j = JSON.parse(Buffer.from(mt[1], 'latin1').toString('utf8').replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  if (j.error) throw new Error('測れません: ' + j.error);
  return j;
}

console.log('\n[ichiran-katachi] 一覧の 形を 代行請求の 一覧に 寄せる' + (SELF ? '（自分ためし）' : ''));

/* ═══ ★見張りの 中身★（本物でも 壊した物でも 同じ 物を 使う＝2つの 見張りを 作らない） ═══ */
const tx = (e) => ((e && e.textContent) || '').replace(/\s+/g, ' ').trim();
const MI = {
  sum(win, doc) {            // ⑪ 合計は 発行済みだけ（既定の 絞り と すべて）
    const S = win.SeikyuApp._state;
    const t = () => tx(doc.getElementById('list-sum'));
    S.fil = 'live'; win.SeikyuApp._renderListForTest();
    ok(/発行済み 4件の合計 1,468,023 円/.test(t()), '★既定の 絞りの 合計に 下書き・取り消しが 混ざった★ ' + t());
    ok(/下書き 2件/.test(t()), '★下書きを 入れていない事を 言っていない★ ' + t());
    S.fil = 'all'; win.SeikyuApp._renderListForTest();
    ok(/発行済み 4件の合計 1,468,023 円/.test(t()), '★「すべて」の 合計に 取り消し 99,999 が 混ざった★ ' + t());
    ok(/取り消し 1件/.test(t()), '★取り消しを 入れていない事を 言っていない★ ' + t());
  },
  sumNone(win, doc) {        // ⑪ 発行済みが 0通の 絞りでは 合計を 出さない
    const S = win.SeikyuApp._state;
    const t = () => tx(doc.getElementById('list-sum'));
    try {
      S.fil = 'draft'; win.SeikyuApp._renderListForTest();
      ok(!/合計 [\d,]+ 円/.test(t()) && /発行済みの請求書はありません/.test(t()), '★下書きだけ なのに 合計を 出している★ ' + t());
      S.fil = 'void'; win.SeikyuApp._renderListForTest();
      ok(!/合計 [\d,]+ 円/.test(t()), '★取り消し だけ なのに 合計を 出している★ ' + t());
    } finally { S.fil = 'all'; win.SeikyuApp._renderListForTest(); }
  },
  quote(win, doc) {          // ⑪ 見積は 合計に 入れない
    const S = win.SeikyuApp._state, keep = S.invoices;
    try {
      S.invoices = keep.concat([iv('v_q', 'Q-1', 'pt_a', '2026-09-08', 70707, 'issued', 'quote')]);
      S.fil = 'all'; win.SeikyuApp._renderListForTest();
      const t = tx(doc.getElementById('list-sum'));
      ok(/発行済み 4件の合計 1,468,023 円/.test(t) && /見積 1件/.test(t), '★見積が 合計に 混ざった★ ' + t);
    } finally { S.invoices = keep; win.SeikyuApp._renderListForTest(); }
  },
  master(win, doc) {         // ② 会社は 登録から
    const sel = [...doc.querySelectorAll('#scr-list .filterbar select')][0];
    ok(sel, '会社の select が 無い');
    ok([...sel.options].some((o) => o.textContent === '翠川ホテル'), '★請求書の 無い 登録の 会社が 選べない★');
  },
  dup(win, doc) {            // ⑫ 同じ 名前を 見分ける
    const sel = [...doc.querySelectorAll('#scr-list .filterbar select')][0];
    const t = [...sel.options].map((o) => o.textContent);
    ok(new Set(t).size === t.length, '★同じ 字の 選択肢が 2つ 在る＝見分けが 付かない★ ' + t.join(' / '));
    ok(t.some((x) => /例野工業（大阪府架空市見本町1-1）/.test(x)), '★2件目に 住所を 添えていない★ ' + t.join(' / '));
  },
  line(win, doc) {           // ④ 会社名の 行の 右端が 金額
    const c = doc.querySelector('#list-body [data-look="v_b9"]');
    const card = c && c.closest('.iv-card'), ln = card && card.querySelector('.iv-line');
    ok(ln && ln.lastElementChild && ln.lastElementChild.classList.contains('iv-amt'), '★会社名の 行の 右端に 金額が 無い★');
    eq(tx(ln.lastElementChild), '1,358,023 円', '右端の 金額');
  },
  mada(win, doc) {           // ⑤ 下書きの 会社名の 行に 金額まだ
    const c = doc.querySelector('#list-body [data-look="v_d"]').closest('.iv-card');
    ok(/金額まだ 2行/.test(tx(c.querySelector('.iv-line'))), '★品名だけの 下書きに「金額まだ」が 無い★ ' + tx(c));
    const c2 = doc.querySelector('#list-body [data-look="v_dp"]').closest('.iv-card');
    ok(/金額まだ 1行/.test(tx(c2.querySelector('.iv-line'))), '★一部だけの 下書きに「金額まだ」が 無い★ ' + tx(c2));
  },
};

if (SELF) {
  /* ★わざと 壊す★＝本物の seikyu-app.js の 1か所を 書き換えて 動かし、受け持ちの 見張りが ★赤に なる★事を 見る */
  const KOWASU = [
    ['合計に 下書きと 取り消しを 混ぜる（前の 形）', 'var st = DOC.statusOf(v);', "var st = 'issued';", 'sum'],
    ['合計に 取り消しだけ 混ぜる', "if (st !== 'issued') { voided++; return; }", '', 'sum'],
    ['下書きだけの 絞りでも 合計を 出す', "+ '<span class=\"ls-v\">' + (sumOf.n", "+ '<span class=\"ls-v\">' + (true", 'sumNone'],
    ['見積を 合計に 混ぜる', "if ((v.doc_type || 'invoice') !== 'invoice') { quote++; return; }", '', 'quote'],
    ['会社を 請求書からだけ 拾う（前の 形）', "(S.partners || []).forEach(function (p) {\n      if (!p || !p.id || mita[p.id]) return;",
      "([]).forEach(function (p) {\n      if (!p || !p.id || mita[p.id]) return;", 'master'],
    ['同じ 名前を 見分けない', 'if (kazu[x.nm] < 2) return;', 'return;', 'dup'],
    ['金額を 会社名の 行の 外へ 出す', "'</span>' + migi + '</div>'", "'</span></div>' + migi", 'line'],
    ['「金額まだ」を 数えない', 'waiting = DOC.rowIssuesOf(v.lines || []).noAmount.length;', 'waiting = 0;', 'mada'],
  ];
  console.log('     わざと 壊す ' + KOWASU.length + '通り（壊した 本物を 動かす）');
  for (const [na, from, to, mi] of KOWASU) {
    await T('★自 ' + na + ' → ' + mi + ' が 赤に なる', async () => {
      ok(APP.split(from).length === 2, '★壊す所が 1つ 見つからない★ ' + from);
      const r = await boot(APP.replace(from, to));
      r.win.SeikyuApp._state.fil = 'all'; r.win.SeikyuApp._renderListForTest();
      let aka = '';
      try { MI[mi](r.win, r.doc); } catch (e) { aka = e.message; }
      ok(aka, '★壊したのに 緑のまま＝この 見張りは 空振り★');
      console.log('       赤: ' + aka.slice(0, 70));
    });
  }
}

const { win, doc, sb, errs } = await boot();
const $ = (id) => doc.getElementById(id);
const list = () => $('scr-list');
const txt = (e) => ((e && e.textContent) || '').replace(/\s+/g, ' ').trim();
const cards = () => [...doc.querySelectorAll('#list-body .iv-card')];
const kaeru = (el, v) => { el.value = v; el.dispatchEvent(new win.Event('change', { bubbles: true })); };
const S = win.SeikyuApp._state;
S.fil = 'all';
win.SeikyuApp._renderListForTest();

await T('★前提 一覧に ' + INVOICES.length + '通 出ている（空振りしていない）', async () => {
  eq(cards().length, INVOICES.length, '出ている カード');
});

await T('★① 絞りは 会社と 期間の 2つ・横並びの 箱の 中・先頭は 全社／全期間', async () => {
  const fb = list().querySelectorAll('.filterbar');
  eq(fb.length, 1, '★横並びの 箱（.filterbar）が 1つで ない★');
  const sels = fb[0].querySelectorAll('select');
  eq(sels.length, 2, '★絞りの select が 2つで ない★');
  eq(sels[0].options[0].value, '', '会社の 先頭が 空で ない');
  eq(sels[0].options[0].textContent, '全社', '★会社の 先頭が「全社」で ない★');
  eq(sels[1].options[0].value, '', '期間の 先頭が 空で ない');
  eq(sels[1].options[0].textContent, '全期間', '★期間の 先頭が「全期間」で ない★');
  const old = txt(list()).match(/すべての取引先|月をぜんぶ/);
  ok(!old, '★前の 言葉が 残っている★ ' + (old && old[0]));
});

const coSel = () => list().querySelectorAll('.filterbar select')[0];
const moSel = () => list().querySelectorAll('.filterbar select')[1];

await T('★② 会社の 選択肢は 登録の 会社から（請求書が 無い 会社も・登録の 順）', async () => {
  const names = [...coSel().options].slice(1).map((o) => o.value);
  eq(names.join(' / '), PARTNERS.map((p) => p.id).join(' / '), '★登録の 会社と 並びが 違う★');
  MI.master(win, doc);
  const mo = [...moSel().options].slice(1).map((o) => o.value);
  eq(mo.join(','), '2026-09,2026-08', '★期間の 選択肢が 在る月・新しい順で ない★');
  console.log('     会社: ' + [...coSel().options].map((o) => o.textContent).join(' / '));
});

await T('★③ 選ぶと 一覧と「N件・合計」が 変わる（会社・期間・両方）', async () => {
  const sum = () => txt($('list-sum'));
  ok(/^7件/.test(sum()), '全部の 時の 件数: ' + sum());
  ok(/発行済み 4件の合計 1,468,023 円/.test(sum()), '全部の 時の 合計: ' + sum());
  kaeru(coSel(), 'pt_b');
  eq(cards().length, 3, '★会社で 絞れていない★');
  ok(/^3件（絞り込み中）/.test(sum()) && /発行済み 2件の合計 1,391,023 円/.test(sum()), '★会社で 絞った 件数・合計★ ' + sum());
  kaeru(moSel(), '2026-08');
  eq(cards().length, 1, '★会社と 期間の 両方で 絞れていない★');
  ok(/^1件/.test(sum()) && /発行済み 1件の合計 33,000 円/.test(sum()), '★両方で 絞った 件数・合計★ ' + sum());
  kaeru(coSel(), '');
  eq(cards().length, 2, '★期間だけで 絞れていない★');
  ok(/合計 55,000 円/.test(sum()), '★8月の 合計★ ' + sum());
  kaeru(coSel(), 'pt_c');
  eq(cards().length, 0, '請求書の 無い 会社で 0通に ならない');
  ok(/^0件/.test(sum()) && /発行済みの請求書はありません/.test(sum()), '★0件と 言っていない★ ' + sum());
  kaeru(coSel(), ''); kaeru(moSel(), '');
  eq(cards().length, INVOICES.length, '★戻していない★');
  console.log('     ' + sum());
});

await T('★⑪ 合計は 発行済みだけ（下書き 0・1,100／取り消し 99,999／見積 を 足さない）', async () => {
  MI.sum(win, doc); MI.sumNone(win, doc); MI.quote(win, doc);
  S.fil = 'all'; win.SeikyuApp._renderListForTest();
  console.log('     ' + txt($('list-sum')));
});

await T('★⑫ 同じ 名前の 取引先が 2件 在る時 見分けが 付く', async () => {
  MI.dup(win, doc);
  console.log('     ' + [...coSel().options].map((o) => o.textContent).join(' / '));
});

await T('★⑬ 「もっと」の 見出しに 中に 無い「集計」を 書かない', async () => {
  const sm = doc.querySelector('#list-more > summary');
  ok(sm, '「もっと」が 無い');
  ok(!/集計/.test(tx(sm)), '★中に 無い「集計」を 見出しが 約束している★ ' + tx(sm));
});

await T('★④ カードの 1行に 会社名と 金額（同じ 行の 中）', async () => {
  const c = cards().find((x) => x.querySelector('[data-look="v_b9"]'));
  ok(c, '1,358,023 円の カードが 無い');
  const ln = c.querySelector('.iv-line');
  ok(ln, '★会社名と 金額の 行（.iv-line）が 無い★');
  eq(txt(ln.querySelector('.iv-name')), NAGAI, '★行の 左が 会社名で ない★');
  eq(txt(ln.querySelector('.iv-amt')), '1,358,023 円', '★行の 右が 金額で ない★');
  MI.line(win, doc);
  eq(ln.children[ln.children.length - 1], ln.querySelector('.iv-amt'), '★金額が 行の 最後（右端）に 無い★');
});

await T('★⑤ 下書きで 金額が 無い時は 会社名の 行に「金額まだ 2行」（0円と 見せない）', async () => {
  const c = cards().find((x) => x.querySelector('[data-look="v_d"]'));
  ok(c, '下書きの カードが 無い');
  const ln = c.querySelector('.iv-line');
  ok(ln, '★下書きにも 会社名の 行が 無い★');
  ok(/金額まだ 2行/.test(txt(ln)), '★会社名の 行に「金額まだ」が 無い★ ' + txt(ln));
  ok(/例野工業/.test(txt(ln)), '★下書きの 行に 会社名が 無い★');
  ok(!/0 円/.test(txt(c)), '★0円と 出ている★');
  MI.mada(win, doc);
});

await T('★⑦ 一覧の 頭に 集計の 選び（月の select・集計の 1行）が 無い', async () => {
  ok(!list().querySelector('#rep-month'), '★一覧に 集計する月の select が 残っている★');
  ok(!list().querySelector('#rep-sum'), '★一覧に 集計の 1行が 残っている★');
  ok(!list().querySelector('#rep-body'), '★一覧に 集計の 表が 残っている★');
  ok(!/出した請求書は まだありません/.test(txt(list())), '★「ぜんぶ … 出した請求書は まだありません」が 残っている★');
  const sel = list().querySelectorAll('select');
  const top = [...sel].filter((s) => !s.closest('details'));
  eq(top.length, 2, '★一覧の 頭の select が 2つで ない★');
});

/* ═══ 形（本物の Chrome） ═══ */
for (const W of [390, 320]) {
  await T('★⑧⑨⑩ ' + W + 'px：会社名が 左・金額が 右端／絞りが 横並び／ボタン', async () => {
    const j = await measure(doc, W);
    eq(j.vw, W, W + 'pxで 測れていない');
    ok(j.sw <= W + 1, '★横に はみ出している★ 中身の 幅 ' + j.sw + 'px');
    /* ⑨ 絞り */
    eq(j.sels.length, 2, 'select が 2つ 測れない');
    ok(Math.abs(j.sels[0].t - j.sels[1].t) <= 2, '★会社と 期間が 横に 並んでいない★ ' + j.sels[0].t + ' / ' + j.sels[1].t);
    ok(j.sels[0].r <= j.sels[1].l, '★会社と 期間が 重なっている★');
    ok(j.sels.every((s) => s.h >= 40), '★選びの 高さが 指で 押せない★ ' + j.sels.map((s) => s.h).join(','));
    eq(j.sumKids.length, 2, '★件数と 合計の 2つに 分かれていない★');
    ok(j.sumKids[0].l - j.sum.l <= 2, '★件数が 左に 無い★');
    ok(j.sum.r - j.sumKids[1].r <= 2, '★合計が 右端に 無い★ ' + (j.sum.r - j.sumKids[1].r) + 'px 足りない');
    ok(Math.abs(j.sumKids[0].t - j.sumKids[1].t) <= 4, '★件数と 合計が 同じ 行に 無い★');
    /* ⑧ カード */
    eq(j.cards.length, INVOICES.length, 'カードを 測れない');
    j.cards.forEach((c, i) => {
      ok(c.line && c.name && c.amt, '★' + (i + 1) + '枚目に 会社名の 行が 無い★');
      ok(c.line.w > 0 && c.amt.w > 0, '★' + (i + 1) + '枚目の 行が 0 の 大きさ（測れていない）★');
      ok(Math.abs(c.line.r - c.amt.r) <= 2, '★' + (i + 1) + '枚目の 金額が 右端に 無い★ 行の 右 ' + c.line.r + ' / 金額の 右 ' + c.amt.r);
      ok(c.name.l - c.line.l <= 2, '★' + (i + 1) + '枚目の 会社名が 左に 無い★');
      ok(c.name.r <= c.amt.l + 1, '★' + (i + 1) + '枚目の 会社名と 金額が 重なっている★');
      ok(c.amt.t < c.name.b && c.name.t < c.amt.b, '★' + (i + 1) + '枚目の 会社名と 金額が 同じ 高さに 無い★');
      ok(c.amtLines <= 1, '★' + (i + 1) + '枚目の 金額が 折り返している★ ' + c.amtText);
      ok(c.line.r <= c.card.r && c.line.l >= c.card.l, '★' + (i + 1) + '枚目の 行が カードから 出ている★');
      /* ⑩ ボタン */
      ok(c.btns.length >= 2, '★' + (i + 1) + '枚目に 確認・修正が 無い★');
      c.btns.forEach((b) => {
        ok(b.r.h >= 40, '★「' + b.t + '」が 指で 押せない 高さ★ ' + b.r.h + 'px');
        ok(b.r.r <= c.card.r && b.r.l >= c.card.l, '★「' + b.t + '」が カードから はみ出している★');
      });
      ok(Math.max(...c.btns.map((b) => b.r.t)) - Math.min(...c.btns.map((b) => b.r.t)) <= 2,
        '★' + (i + 1) + '枚目の ボタンが 1列に 並んでいない★');
      const del = c.btns.find((b) => /削除|取り消す/.test(b.t));
      const other = c.btns.find((b) => b.t === '確認');
      if (del) ok(del.color !== other.color, '★「' + del.t + '」の 色が「確認」と 同じ（見分けられない）★ ' + del.color);
    });
    const big = j.cards.find((c) => c.amtText === '1,358,023 円');
    ok(big, '長い 名前の カードが 測れない');
    console.log('     ' + W + 'px 行 ' + big.line.l + '〜' + big.line.r + ' 名前 〜' + big.name.r + ' 金額 ' + big.amt.l + '〜' + big.amt.r
      + '／ボタン ' + big.btns.map((b) => b.t + ' ' + b.r.w + '×' + b.r.h).join('・')
      + '／絞り ' + j.sels.map((s) => s.w + '×' + s.h).join('・'));
  });
}

await T('★⑥-a 「確認」を 押すと 紙が かぶさって 出る', async () => {
  doc.querySelector('#list-body [data-look="v_a9"]').click();
  await sleep(50);
  ok(win.SeikyuApp._lookOpenedForTest(), '★確認で 紙が 出ない★ ' + txt($('list-err')));
  $('b-lv-back').click();
  ok(!win.SeikyuApp._lookOpenedForTest(), '閉じない');
});

await T('★⑥-b 「修正」を 押すと 入力の 画面で その 1通が 開く', async () => {
  doc.querySelector('#list-body [data-open="v_b8"]').click();
  await sleep(50);
  ok($('scr-edit').classList.contains('active'), '★入力の 画面へ 行かない★');
  eq(S.cur && S.cur.id, 'v_b8', '★別の 1通が 開いた★');
  doc.querySelector('.bn[data-scr="scr-list"]').click();
  await sleep(200);
});

await T('★⑥-c 下書きの「削除」を 押すと 倉庫から 消えて 一覧からも 消える', async () => {
  S.fil = 'all'; win.SeikyuApp._renderListForTest();
  const b = doc.querySelector('#list-body [data-kesu="v_d"]');
  ok(b, '★下書きに 削除が 無い★');
  eq(txt(b), '削除', '下書きの 言葉');
  b.click();
  await sleep(400);
  const row = sb._db ? (sb._db.pay_invoices || []).find((r) => r.id === 'v_d') : null;
  ok(!doc.querySelector('#list-body [data-look="v_d"]'), '★消した 下書きが 一覧に 残っている★');
  if (row) ok(row.deleted_at || row.status === 'void', '★倉庫に 残っている★');
  const ka = doc.querySelector('#list-body [data-kesu="v_a9"]');
  ok(ka && txt(ka) === '取り消す', '★発行済みは「取り消す」で ない★ ' + txt(ka));
});

await T('★JS の 落ちが 0', async () => { ok(!errs.length, errs.join(' / ')); });

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
