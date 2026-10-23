/* settei-wake-ui.mjs — ★設定を 3つに 分ける★（取引先／自社情報／テンプレート）
 * =============================================================================
 * 司さん 2026-10-23 ⑥
 *   「設定の中身も 代行請求書アプリのように 分かりやすく、会社マスタや 自社情報など ちゃんと 分けろ」
 *   手本＝代行請求書（daikou-seikyu.html）の 設定＝上に 切り替え 3つ（横いっぱい）・中身は 1つずつ。
 *
 * ★本物の seikyu-app.js を jsdom で 動かして 実際に 押す★（字を 読むだけに しない）
 * ★形は 本物の Chrome で 測る★（jsdom には 段組みが 無い＝幅も 高さも 0）
 *
 * 見る物:
 *   ① 設定の 上に 切り替えが 3つ（取引先／自社情報／テンプレート）・最初は 取引先
 *   ② 押すと 中身が 替わる（1つだけ 出る・押した 札が 光る）
 *   ③ ★前に 在った 欄が 1つも 落ちていない★（9e3bf01 の 設定の id 101個＋⑧ の 5個＝106個を 数える・落ち 0）
 *   ④ どの 欄が どの 切り替えに 在るか（割り振りの 表と 同じ）・ログインは 一番下
 *   ⑤ 取引先は ★会社ごとの 札★で 並ぶ（1社ずつ 選ぶ 選び箱は 見せない）・押すと 開いて 閉じる
 *   ⑥ 開いた 札の 中で 前と 同じ 欄が 直せて「この取引先を保存」で 倉庫へ 入る
 *   ⑦ 取引先を 足せる（名前 1つで・足した 札が 開く）
 *   ⑧ 入力の「枠を増やす」「設定で変える」から 来た時は テンプレートが 開く
 *   ⑨ 形（Chrome 390px）＝切り替え 3つが 1行に 横いっぱい・はみ出さない
 *   ⑩ お振込先の「保存」が 落ちたら「保存しました」を 出さない（taiketsu 10-23 止3）
 *
 * 使い方: node seikyu/tests/settei-wake-ui.mjs [--self-test] [--jsdom-only]
 *   --jsdom-only … ブラウザを 使わない（⑨ は ★未測定★と 言って 数えない・緑とは 呼ばない）
 *   --self-test … わざと 壊した seikyu-app.js / index.html で 赤に なるかを 見る
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
const JSDOM_ONLY = process.argv.includes('--jsdom-only');
let mimei = 0;
let pass = 0, fail = 0;
const ok = (v, m) => { if (!v) throw new Error(m || 'false'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m ? m + ': ' : '') + 'ほしい ' + JSON.stringify(b) + ' / 出た ' + JSON.stringify(a)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FILE = path.join(ROOT, 'seikyu/index.html');

/* ★前（9e3bf01）の 設定に 在った id ぜんぶ★（101個・機械で 拾って 写した）＋⑧ の 5個＝106個
   ★どれか 1つでも 無くなったら 赤★＝分ける時に 欄を 落とさない */
const MAE_IDS = ['set-pv-card', 'set-pv-toggle', 'set-pv-body', 'set-paper', 'set-pv-note', 'org-view', 's-tpl-card',
  's-tpl-now', 'b-tpl-open', 's-tpl-box', 's-tpl', 's-tpl-note', 'paper-ask-card', 'paper-ask', 'set-more', 's-rows',
  's-dedrows-row', 's-dedrows', 's-rows-note', 'col-list', 'col-new', 'b-col-add', 'b-col-reset', 'b-col-undo', 'col-why',
  'col-ok', 'col-err', 's-no', 's-format', 's-format-hint', 's-reset', 's-taxmode', 's-round', 's-carry', 's-carry-hint',
  's-bank-list', 'b-bank-add', 's-bank', 's-style-box', 's-sumsorder', 's-taxnote-ask', 's-taxnote', 'b-set-save',
  'set-ok', 'set-err', 's-partner', 'pt-ask-set', 'pt-all', 's-phonor', 's-pperson', 's-paddr', 's-pzip', 's-ptel',
  's-pcode', 's-pterm', 's-ptermn', 's-pinvoice', 's-pinvoice-hint', 's-pgensen', 's-ptpl', 's-prows', 's-pbanks',
  's-pbanks-why', 's-psubject', 'b-pcols-own', 'b-pcols-clear', 's-pcols-hint', 'b-pt-save', 'pt-ok', 'pt-err',
  'b-book-pick', 'book-fname', 'book-file', 'book-info', 'book-slots', 'book-acts', 'b-book-use', 'b-book-clear',
  'book-ok', 'book-err', 'seal-pv', 'seal-none', 'seal-mm', 'b-seal-pick', 'seal-fname', 'seal-file', 'seal-pos-box',
  'seal-stage', 'seal-paper', 'seal-drag', 'seal-x', 'seal-y', 'b-seal-home', 'seal-pos-why', 'b-seal-save',
  'b-seal-clear', 'seal-why', 'seal-ok', 'seal-err', 'who', 'b-logout',
  /* ★2026-10-23 ⑧ で 足された 5つ★（この取引先の紙・会社の既定と 別の紙の 一覧）＝106個 */
  's-tpl-pt', 's-pt-tpl-row', 's-pt-tpl-now', 'b-pt-tpl-open', 's-pt-tpl-why'];

/* ★割り振りの 表★（返事の 表と 同じ。ここが 正） */
const WARI = {
  torihiki: ['s-partner', 'pt-ask-set', 'pt-all', 's-phonor', 's-pperson', 's-paddr', 's-pzip', 's-ptel', 's-pcode',
    's-pterm', 's-pinvoice', 's-pgensen', 's-ptpl', 's-prows', 's-pbanks', 's-psubject', 'b-pcols-own', 'b-pt-save', 'pt-ok', 'pt-err',
    /* ★この取引先の紙（1行）★＝開いた 札の 中（⑧ 2026-10-23 で 足された 物） */
    's-pt-tpl-row', 'b-pt-tpl-open', 's-pt-tpl-why'],
  jisha: ['org-view', 's-bank-list', 'b-bank-add', 's-bank', 'b-book-pick', 'book-file', 'b-book-use',
    'seal-pv', 'seal-mm', 'b-seal-pick', 'seal-pos-box', 'seal-paper', 'b-seal-save', 'b-seal-clear'],
  tpl: ['s-tpl-card', 's-tpl', 'b-tpl-open', 'paper-ask-card', 'set-more', 's-rows', 's-dedrows', 'col-list', 'b-col-add',
    's-no', 's-format', 's-reset', 's-taxmode', 's-round', 's-carry', 's-style-box', 's-sumsorder', 's-taxnote', 'b-set-save',
    /* ★会社の既定と 別の紙の 取引先の 一覧★（⑧ 2026-10-23 で 足された 物） */
    's-tpl-pt'],
};

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
/* ★形は 本物の Chrome で★（手本＝seikyu/tests/tpl-ask-ui.mjs の measureShape と 同じ やり方） */
async function measureShape(doc) {
  const CHROME = findChrome();
  if (!CHROME) throw new Error('★ブラウザが見つかりません＝形を測れません（0と言わない）★');
  const os = await import('node:os');
  const { execFileSync } = await import('node:child_process');
  const OUT = path.join(os.tmpdir(), 'rakunally-settei-wake');
  fs.mkdirSync(OUT, { recursive: true });
  doc.querySelectorAll('script').forEach((x) => x.remove());
  doc.querySelectorAll('[hidden]').forEach((x) => x.removeAttribute('hidden'));
  doc.querySelectorAll('link[rel="stylesheet"]').forEach((l) => {
    const href = (l.getAttribute('href') || '').split('?')[0];
    if (/^https?:/.test(href)) { l.remove(); return; }
    l.setAttribute('href', pathToFileURL(path.resolve(path.dirname(FILE), href)).href);
  });
  const PROBE = `
    var seg = document.getElementById('set-seg');
    var sr = seg ? seg.getBoundingClientRect() : null;
    var bs = [].map.call(document.querySelectorAll('#set-seg .set-seg-b'), function (b) {
      var r = b.getBoundingClientRect();
      return { t: b.textContent.trim(), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height),
        sw: b.scrollWidth, cw: b.clientWidth };
    });
    var panels = [].map.call(document.querySelectorAll('#scr-set .set-panel'), function (p) {
      return { k: p.getAttribute('data-setseg'), h: Math.round(p.getBoundingClientRect().height) };
    });
    var cards = [].map.call(document.querySelectorAll('#pt-cards .pt-co-hd'), function (h) {
      var r = h.getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width) };
    });
    return { seg: sr ? { x: Math.round(sr.left), w: Math.round(sr.width), h: Math.round(sr.height) } : null,
      bs: bs, panels: panels, cards: cards, vw: window.innerWidth, dw: document.documentElement.scrollWidth };
  `;
  const tail = '<script>window.addEventListener("load",function(){var r;try{r=JSON.stringify((function(){'
    + PROBE + '})());}catch(e){r=JSON.stringify({error:String(e)});}parent.postMessage(r,"*");});</scr' + 'ipt>';
  const html = '<!doctype html>' + String.fromCharCode(10) + doc.documentElement.outerHTML;
  const cut = html.lastIndexOf('</body>');
  const page = path.join(OUT, 'p.html');
  fs.writeFileSync(page, html.slice(0, cut) + tail + html.slice(cut), 'utf8');
  const host = path.join(OUT, 'h.html');
  fs.writeFileSync(host, '<!doctype html><html><head><meta charset="utf-8">'
    + '<style>html,body{margin:0}iframe{border:0;display:block}</style></head><body>'
    + '<iframe width="390" height="844" src="p.html"></iframe>'
    + '<script>window.addEventListener("message",function(e){document.title=e.data;});</scr' + 'ipt></body></html>', 'utf8');
  const out = execFileSync(CHROME, ['--headless', '--disable-gpu', '--hide-scrollbars',
    '--window-size=1200,1000', '--virtual-time-budget=5000', '--dump-dom', pathToFileURL(host).href],
  { encoding: 'latin1', maxBuffer: 40 * 1024 * 1024, timeout: 90000 });
  const m = /<title>([^<]*)<\/title>/.exec(out);
  if (!m || !m[1]) throw new Error('★枠の中から答えが返りません＝測れていません★');
  const j = JSON.parse(Buffer.from(m[1], 'latin1').toString('utf8').replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  if (j.error) throw new Error('測れません: ' + j.error);
  return j;
}

async function boot(o) {
  o = o || {};
  const html = o.html || fs.readFileSync(FILE, 'utf8');
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/seikyu/index.html',
  });
  const win = dom.window, doc = win.document;
  const errs = [];
  win.addEventListener('error', (e) => errs.push('window.error: ' + (e.message || e)));
  win.fetch = () => Promise.reject(new Error('no net'));
  win.alert = () => {}; win.confirm = () => true; win.scrollTo = () => {}; win.print = () => {};
  win.URL.createObjectURL = () => 'blob:fake';
  const src = fs.readFileSync(path.join(ROOT, 'tests/fake-supa.js'), 'utf8');
  const m = { exports: {} };
  new Function('module', 'exports', src)(m, m.exports);
  const sb = m.exports.createFakeSupa({
    uid: 'u1',
    tables: {
      pay_org: [{ account_id: 'u1', data: { yago: '合同会社Rakunally', invoiceNo: 'T9000000000009', bank: '見本銀行 本店 普通 1234567 ラクナリー' }, updated_at: '2026-08-01T00:00:00Z' }],
      pay_partners: (o.partners || [
        { id: 'pt_a', account_id: 'u1', sort: 0, data: { name: 'A株式会社', keisho: '御中', honor: '御中' }, deleted_at: null },
        { id: 'pt_b', account_id: 'u1', sort: 1, data: { name: 'B工務店', keisho: '様', honor: '様' }, deleted_at: null },
      ]),
      pay_invoices: o.invoices || [], pay_receipts: [],
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
    el.textContent = (base === 'seikyu-app.js' && o.app) ? o.app : fs.readFileSync(p, 'utf8');
    doc.body.appendChild(el);
  }
  await sleep(300);
  ok(win.SeikyuApp, 'seikyu-app.js が動いていない');
  await win.SeikyuApp.attach(sb);
  await sleep(300);
  return { win, doc, sb, errs };
}
/** ★お客さんと 同じ道で 設定を 開く★（下の タブ） */
async function openSet(r) {
  const tab = r.doc.querySelector('.bn[data-scr="scr-set"]');
  ok(tab, '設定の タブが 無い');
  tab.click();
  await sleep(300);
}
const segBtn = (doc, k) => doc.querySelector('#set-seg [data-setseg="' + k + '"]');
const panelOf = (doc, k) => doc.querySelector('#scr-set .set-panel[data-setseg="' + k + '"]');
const onPanels = (doc) => [...doc.querySelectorAll('#scr-set .set-panel.on')].map((p) => p.getAttribute('data-setseg'));

async function run(label, o) {
  console.log('\n[' + label + '] ★押す物の一覧（先に書く）★');
  console.log('  ① 切り替え3つ ② 押すと替わる ③ 前の欄 101個 落ち0 ④ 割り振り・ログインは一番下'
    + ' ⑤ 取引先は札（開く/閉じる） ⑥ 札の中で直して保存 ⑦ 取引先を足す ⑧ 入力から来るとテンプレート ⑨ 形（Chrome 390px）');
  const T = async (n, f) => { try { await f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };

  await T('① 設定の 上に 切り替えが 3つ（取引先／自社情報／テンプレート）・最初は 取引先', async () => {
    const r = await boot(o); await openSet(r);
    const bs = [...r.doc.querySelectorAll('#set-seg .set-seg-b')];
    eq(bs.map((b) => b.textContent.trim()).join('／'), '取引先／自社情報／テンプレート', '切り替えの 字と 並び');
    const set = r.doc.getElementById('scr-set');
    ok(set.firstElementChild && set.firstElementChild.id === 'set-seg', '★切り替えが 設定の 一番上に 無い★');
    eq(onPanels(r.doc).join(','), 'torihiki', '最初に 出る 中身');
    eq(bs.filter((b) => b.classList.contains('on')).map((b) => b.textContent.trim()).join(','), '取引先', '光っている 札');
    eq(r.doc.querySelectorAll('#scr-set .set-panel').length, 3, '中身の 箱の 数');
  });

  await T('② 押すと 中身が 替わる（1つだけ 出る・押した 札が 光る・選ばれたと 読み上げにも 出る）', async () => {
    const r = await boot(o); await openSet(r);
    for (const k of ['jisha', 'tpl', 'torihiki', 'tpl']) {
      segBtn(r.doc, k).click();
      await sleep(30);
      eq(onPanels(r.doc).join(','), k, k + ' を 押した後の 中身');
      const on = [...r.doc.querySelectorAll('#set-seg .set-seg-b.on')].map((b) => b.getAttribute('data-setseg'));
      eq(on.join(','), k, k + ' を 押した後の 光り');
      eq(segBtn(r.doc, k).getAttribute('aria-selected'), 'true', '読み上げの 選ばれた');
    }
    ok(r.errs.length === 0, '★画面で 例外★ ' + r.errs.join(' / '));
  });

  await T('③ ★前に 在った 欄が 1つも 落ちていない★（106個 数える）', async () => {
    const r = await boot(o); await openSet(r);
    const set = r.doc.getElementById('scr-set');
    const ochi = MAE_IDS.filter((id) => { const el = r.doc.getElementById(id); return !el || !set.contains(el); });
    eq(MAE_IDS.length, 106, '★数える 物が 106個 無い＝拾えていない★');
    eq(ochi.length, 0, '★設定から 落ちた 欄★ ' + ochi.join(' / '));
    /* ★落ちていない＝どこかに 見える 道が 在る★（切り替えの 中か、上の 下見か、一番下の ログイン） */
    const mayoi = MAE_IDS.filter((id) => {
      const el = r.doc.getElementById(id);
      if (id === 's-partner') return false;     /* ★1社ずつ 選ぶ 箱は 見せない★（札を 開くと 中で 動く） */
      if (el.closest('.set-panel')) return false;
      if (el.closest('#set-pv-card')) return false;
      if (el.closest('#set-login')) return false;
      return true;
    });
    eq(mayoi.length, 0, '★どの 切り替えにも 入っていない 欄★ ' + mayoi.join(' / '));
    console.log('     前の 欄 ' + MAE_IDS.length + '個 → 落ち 0');
  });

  await T('④ 割り振り（表と 同じ）・ログインは 一番下（どの 切り替えの 外）', async () => {
    const r = await boot(o); await openSet(r);
    const zure = [];
    for (const k of Object.keys(WARI)) {
      const p = panelOf(r.doc, k);
      ok(p, k + ' の 箱が 無い');
      /* 取引先の 欄は ★札を 開くまで 預かり所★に 在る＝それも 取引先の 中 */
      WARI[k].forEach((id) => { const el = r.doc.getElementById(id); if (!el || !p.contains(el)) zure.push(k + ':' + id); });
    }
    eq(zure.length, 0, '★割り振りと 違う 所に 在る★ ' + zure.join(' / '));
    const set = r.doc.getElementById('scr-set');
    const last = set.lastElementChild;
    ok(last && last.id === 'set-login', '★一番下が ログインでない★ ' + (last && (last.id || last.className)));
    ok(!last.closest('.set-panel') && last.querySelector('#b-logout'), 'ログアウトが 一番下の 箱に 無い');
  });

  await T('⑤ 取引先は 会社ごとの 札・押すと 開く／もう一度で 閉じる・別の 札を 開くと 前は 閉じる', async () => {
    const r = await boot(o); await openSet(r);
    const sel = r.doc.getElementById('s-partner');
    ok(sel && sel.style.display === 'none', '★1社ずつ 選ぶ 選び箱が まだ 見えている★');
    const cards = [...r.doc.querySelectorAll('#pt-cards .pt-co')];
    eq(cards.length, 2, '札の 数（取引先 2社）');
    eq(cards.map((c) => c.querySelector('.pt-co-name').textContent.trim()).join('／'), 'A株式会社／B工務店', '札の 名前');
    ok(cards.every((c) => !c.classList.contains('open')), '最初から 開いている 札が 在る');
    const hdA = cards[0].querySelector('.pt-co-hd');
    hdA.click(); await sleep(30);
    ok(cards[0].classList.contains('open'), 'A を 押しても 開かない');
    eq(hdA.getAttribute('aria-expanded'), 'true', '開いた 印（読み上げ）');
    ok(cards[0].querySelector('#pt-all') && cards[0].querySelector('#pt-ask-set'), '★開いた 札の 中に 前の 欄が 無い★');
    eq(sel.value, 'pt_a', '中で 動く 相手');
    eq(r.doc.getElementById('s-phonor').value, '御中', 'A の 敬称が 出ていない');
    eq(r.doc.getElementById('b-pt-save').disabled, false, '保存が 押せない');
    const hdB = r.doc.querySelectorAll('#pt-cards .pt-co')[1].querySelector('.pt-co-hd');
    hdB.click(); await sleep(30);
    const c2 = [...r.doc.querySelectorAll('#pt-cards .pt-co')];
    ok(!c2[0].classList.contains('open') && c2[1].classList.contains('open'), 'B を 開いても A が 閉じない');
    ok(c2[1].querySelector('#pt-all'), 'B の 中に 欄が 移っていない');
    eq(r.doc.getElementById('s-phonor').value, '様', 'B の 敬称が 出ていない');
    c2[1].querySelector('.pt-co-hd').click(); await sleep(30);
    ok(r.doc.querySelectorAll('#pt-cards .pt-co.open').length === 0, 'もう一度 押しても 閉じない');
    eq(sel.value, '', '閉じたのに 相手が 選ばれたまま');
    ok(r.doc.getElementById('pt-all') && !r.doc.getElementById('pt-all').closest('.pt-co'), '閉じたのに 欄が 札に 残っている');
    /* キーボードでも 開ける（Enter） */
    const hd0 = r.doc.querySelector('#pt-cards .pt-co .pt-co-hd');
    hd0.dispatchEvent(new r.win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await sleep(30);
    ok(r.doc.querySelector('#pt-cards .pt-co').classList.contains('open'), 'Enter で 開かない');
  });

  await T('⑥ 開いた 札の 中で 直して「この取引先を保存」＝倉庫へ 入る（前と 同じ 動き）', async () => {
    const r = await boot(o); await openSet(r);
    r.doc.querySelectorAll('#pt-cards .pt-co .pt-co-hd')[1].click(); await sleep(30);
    r.doc.getElementById('s-pperson').value = '山田';
    r.doc.getElementById('b-pt-save').click();
    await sleep(300);
    const row = r.sb._db.pay_partners.find((x) => x.id === 'pt_b');
    eq(row.data.person, '山田', '★倉庫に 入っていない★');
    ok(/保存しました/.test(r.doc.getElementById('pt-ok').textContent), '保存しましたと 言わない');
    ok(r.doc.querySelector('#pt-cards .pt-co.open .pt-co-name').textContent.trim() === 'B工務店', '保存の後に 札が 閉じた／替わった');
  });

  await T('⑦ 取引先を 足せる（名前 1つ）・足した 札が 開く・同じ名前は 2つ作らない', async () => {
    const r = await boot(o); await openSet(r);
    const inp = r.doc.getElementById('pt-add-name');
    const b = r.doc.getElementById('b-pt-add');
    ok(inp && b, '足す 欄／ボタンが 無い');
    eq(b.textContent.trim(), '＋ 取引先を追加', 'ボタンの 字');
    b.click(); await sleep(100);
    ok(/会社名を入れてください/.test(r.doc.getElementById('pt-list-err').textContent), '空で 押した時に 言わない');
    eq(r.sb._db.pay_partners.length, 2, '空で 押したのに 作った');
    inp.value = 'C商事';
    b.click(); await sleep(300);
    eq(r.sb._db.pay_partners.length, 3, '★倉庫に 作られていない★');
    const cards = [...r.doc.querySelectorAll('#pt-cards .pt-co')];
    eq(cards.length, 3, '札が 増えていない');
    const c = cards.find((x) => x.querySelector('.pt-co-name').textContent.trim() === 'C商事');
    ok(c && c.classList.contains('open'), '足した 札が 開いていない');
    eq(inp.value, '', '足した後も 欄に 字が 残っている');
    ok(/C商事/.test(r.doc.getElementById('pt-list-ok').textContent), '足しましたと 言わない');
    inp.value = 'A株式会社';
    b.click(); await sleep(300);
    eq(r.sb._db.pay_partners.length, 3, '★同じ名前を 2つ 作った★');
  });

  await T('⑧ 入力の「設定で変える」「枠を増やす」から 来た時は テンプレートが 開く', async () => {
    const r = await boot(o);
    r.doc.getElementById('b-new') && r.doc.getElementById('b-new').click();
    await sleep(300);
    const ch = r.doc.getElementById('b-tpl-change');
    ok(ch, '入力に「設定で変える」が 無い');
    ch.click(); await sleep(100);
    ok(r.doc.getElementById('scr-set').classList.contains('active'), '設定へ 来ていない');
    eq(onPanels(r.doc).join(','), 'tpl', '「設定で変える」で 着いた 所');
    segBtn(r.doc, 'torihiki').click();
    r.doc.querySelector('.bn[data-scr="scr-edit"]').click(); await sleep(100);
    /* 枠を増やす は 2枚に なる時だけ 出る＝同じ 道（openRowsSetting）を ボタンを 作って 押す */
    ok(typeof r.win.SeikyuApp._openRowsForTest === 'function', '「枠を増やす」の 道を 試験から 呼べない');
    r.win.SeikyuApp._openRowsForTest(); await sleep(50);
    eq(onPanels(r.doc).join(','), 'tpl', '「枠を増やす」で 着いた 所');
    ok(r.doc.getElementById('set-more').open, '詳しい設定が 開いていない');
  });

  await T('⑩ ★お振込先の「保存」が 失敗したら「保存しました」を 出さない★（taiketsu 10-23 止3）', async () => {
    const r = await boot(o); await openSet(r);
    r.doc.querySelector('#set-seg [data-setseg="jisha"]').click(); await sleep(30);
    r.doc.getElementById('b-bank-save').click(); await sleep(300);
    ok(/保存しました/.test(r.doc.getElementById('bank-ok').textContent), '1回目（通る）で 保存しましたと 言わない');
    const st = r.win.SeikyuApp._state.store;
    st.org.save = () => Promise.resolve({ ok: false, reason: 'つながりません' });
    r.doc.getElementById('b-bank-save').click(); await sleep(300);
    const okEl = r.doc.getElementById('bank-ok'), errEl = r.doc.getElementById('bank-err');
    ok(/保存できませんでした/.test(errEl.textContent) && errEl.style.display !== 'none', '★落ちたと 言わない★');
    ok(okEl.style.display === 'none' && !/保存しました/.test(okEl.textContent), '★落ちたのに「保存しました」が 同時に 出ている★');
    const setOk = r.doc.getElementById('set-ok');
    ok(setOk.style.display === 'none', '★テンプレートの 箱にも 古い「保存しました」が 残る★');
  });

  await T('⑨ 形（Chrome 390px）＝切り替え 3つが 1行に 横いっぱい・字が 切れない・横に はみ出さない', async () => {
    if (JSDOM_ONLY) { mimei++; console.log('     ★未測定★（--jsdom-only＝ブラウザを 使っていない）'); return; }
    const r = await boot(o); await openSet(r);
    const j = await measureShape(r.doc);
    ok(j.seg && j.bs.length === 3, '切り替えが 測れていない');
    const ys = new Set(j.bs.map((b) => b.y));
    eq(ys.size, 1, '★1行に 並んでいない★ ' + JSON.stringify(j.bs));
    const sum = j.bs.reduce((a, b) => a + b.w, 0);
    ok(sum >= j.seg.w - 20, '★横いっぱいでない★ 札の 幅の 合計 ' + sum + ' / 帯 ' + j.seg.w);
    const w = j.bs.map((b) => b.w);
    ok(Math.max(...w) - Math.min(...w) <= 4, '★幅が 揃っていない★ ' + w.join(','));
    ok(j.bs.every((b) => b.h >= 44), '★指で 押せる 高さ(44px)が 無い★ ' + j.bs.map((b) => b.h).join(','));
    ok(j.bs.every((b) => b.sw <= b.cw + 1), '★字が 切れている★ ' + JSON.stringify(j.bs));
    ok(j.dw <= j.vw, '★横に はみ出す★ ' + j.dw + ' > ' + j.vw);
    const shown = j.panels.filter((p) => p.h > 0).map((p) => p.k);
    eq(shown.join(','), 'torihiki', '★Chrome で 出ている 中身★');
    ok(j.cards.length === 2 && j.cards.every((c) => c.h >= 44), '★取引先の 札が 指で 押せない★ ' + JSON.stringify(j.cards));
    console.log('     帯 ' + j.seg.w + 'px ／ 札 ' + w.join('・') + 'px ／ 高さ ' + j.bs[0].h + 'px');
  });
}

if (!SELF) {
  await run('本物', {});
} else {
  /* ★わざと 壊して 赤に なるかを 見る★ */
  const app = fs.readFileSync(path.join(ROOT, 'seikyu/js/seikyu-app.js'), 'utf8');
  const html = fs.readFileSync(FILE, 'utf8');
  const cases = [
    ['切り替えを 消す', { html: html.replace(/<div class="set-seg"[\s\S]*?<\/div>/, '') }],
    ['角印を 落とす', { html: html.replace('id="b-seal-save"', 'id="b-seal-save-x"') }],
    ['札を 開かない', { app: app.replace('function ptToggle(id) {', 'function ptToggle(id) { return;') }],
  ];
  let red = 0;
  for (const [nm, o] of cases) {
    const p0 = pass, f0 = fail;
    await run('壊す: ' + nm, o);
    if (fail > f0) red++;
    pass = p0; fail = f0;
  }
  console.log('\n壊した ' + cases.length + '通り のうち 赤 ' + red);
  process.exit(red === cases.length ? 0 : 1);
}
if (mimei) { pass -= mimei; console.log('\n★未測定 ' + mimei + '本（ブラウザ）★＝緑ではない'); }
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
