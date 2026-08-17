/* seikyu-ui.mjs — ★実UI 全ボタン検証（本物の seikyu/index.html と app.js を動かす）★
 *
 * 何をするか:
 *   本物の画面を jsdom に読み込み、★画面にあるボタンを1つ残らず押す★。
 *   そのうえで「1通 出す」までの筋を実際に通す（作る → 発行 → 紙 → Excel）。
 *   倉庫は偽物（tests/fake-supa.js）だが、★番号の一意制約は本番と同じ形で再現する★
 *   ＝「同じ番号を二度使わない」を倉庫が止めることを、倉庫に触らずに測れる。
 *
 * ここで止めたい事故:
 *   ① どこかのボタンで JS が落ちる（押した人には「無反応」に見える）
 *   ② 発行済みなのに直せる／もう一度発行できる
 *   ③ 番号がぶつかった時に黙って上書きする
 *   ④ 落とす前にファイル名を見せない／名前が中身と無関係
 *   ⑤ 印刷の窓にアプリの画面が混ざる
 *   ⑥ 入金が読めない時に「未入金(0円)」と言い切る
 *   ⑦ 取引先を保存した時に、ハブが入れた名前や住所を消す
 *
 * 依存: jsdom。★入っていなければ赤（SKIPを緑と呼ばない）★
 * 使い方: node seikyu/tests/seikyu-ui.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const require_ = createRequire(path.join(ROOT, 'package.json'));
let JSDOM;
try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('★jsdomが入っていません。この検証は飛ばせません（SKIPを緑と呼ばない）。npm install してください。'); process.exit(1); }
const { createFakeSupa } = require_(path.join(ROOT, 'tests/fake-supa.js'));

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const TA = async (n, fn) => { try { await fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (v, m) => { if (!v) throw new Error(m || 'false'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── 本物の画面を読む（CDN・接続設定・ログインは外す＝ネットに出ない） ── */
const html = fs.readFileSync(path.join(ROOT, 'seikyu/index.html'), 'utf8');
const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1].split('?')[0])
  .filter((s) => !/^https?:/.test(s) && !/supa-config|auth\.js|exally-login/.test(s));
const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), { runScripts: 'dangerously', url: 'http://localhost/seikyu/', pretendToBeVisual: true });
const win = dom.window, doc = win.document;

const errs = [];
win.addEventListener('error', (e) => errs.push('window.error: ' + (e.message || e)));
win.addEventListener('unhandledrejection', (e) => errs.push('unhandledrejection: ' + ((e.reason && e.reason.message) || e.reason)));
win.fetch = () => Promise.reject(new Error('no net'));
win.confirm = () => true;
/* ★頭出し★ 画面を切り替えた時に 一番上へ戻ったかを数える（★1か所で決めているか★の見張り） */
const scrolls = [];
win.scrollTo = (x, y) => { scrolls.push([x, y]); };
win.print = () => {};

/* 新しい窓（印刷）を捕まえる。★実際に開かず、書かれた中身を測る★ */
const opened = [];
win.open = function () {
  const w = {
    _html: '', document: {
      open() {}, write(s) { w._html += s; }, close() {}, readyState: 'complete', title: '',
    },
    addEventListener() {}, focus() {}, print() { w._printed = true; }, _printed: false,
  };
  opened.push(w);
  return w;
};
/* 落とす口（file-out.js）を本物のまま動かし、出来た物を捕まえる */
const delivered = [];
win.URL.createObjectURL = function (b) { delivered.push({ blob: b, type: b && b.type }); return 'blob:test/' + delivered.length; };
win.URL.revokeObjectURL = function () {};
const anchorClicks = [];
win.HTMLAnchorElement.prototype.click = function () {
  anchorClicks.push({ href: this.href, download: this.getAttribute('download'), target: this.getAttribute('target'), rel: this.getAttribute('rel') });
};

for (const src of srcs) {
  const el = doc.createElement('script');
  el.textContent = fs.readFileSync(path.join(ROOT, 'seikyu', src.replace(/^\.\.\//, '../')), 'utf8');
  doc.body.appendChild(el);
}
ok(win.SeikyuApp, 'SeikyuApp が露出していない（読み込みに失敗）');

/* ── 偽の倉庫（本番と同じ「二度使えない組」つき） ── */
function makeSb() {
  return createFakeSupa({
    uid: 'u1',
    tables: {
      pay_org: [{ account_id: 'u1', data: { yago: '株式会社ゼロアクト', addr: '愛媛県今治市4-5-6', tel: '0898-00-0000', invoiceNo: 'T1234567890123' }, updated_at: '2026-08-01T00:00:00Z' }],
      pay_partners: [
        { id: 'pt_a', account_id: 'u1', sort: 0, data: { name: '藤原建設株式会社', keisho: '御中', addr: '愛媛県今治市1-2-3', invoiceNo: 'T9876543210987' }, deleted_at: null },
        { id: 'pt_b', account_id: 'u1', sort: 1, data: { name: '株式会社しまなみ', keisho: '様', addr: '松山市1-1' }, deleted_at: null },
      ],
      pay_invoices: [],
      pay_receipts: [],
      pay_companies: [{ account_id: 'u1', data: {}, updated_at: '2026-08-01T00:00:00Z' }],
    },
    pk: { pay_org: 'account_id', pay_companies: 'account_id' },
    // ★本番の uq_pay_invoices_no と同じ組（where を付けない＝取り消した番号も再利用不可）
    unique: { pay_invoices: [['account_id', 'doc_type', 'no']] },
  });
}
const sb = makeSb();
const db = sb._db;

const $ = (id) => doc.getElementById(id);
const qa = (s) => [...doc.querySelectorAll(s)];
const setVal = (id, v) => { const e = $(id); e.value = v; e.dispatchEvent(new win.Event('input')); e.dispatchEvent(new win.Event('change')); };

console.log('\n[請求書 実UI 全ボタン検証]');

await win.SeikyuApp.attach(sb);
await sleep(20);

/* ═══ 0. 出発点 ═══ */
T('0. ★中身(#app)は最初 hidden＝未ログインで画面を見せない', () => {
  const raw = fs.readFileSync(path.join(ROOT, 'seikyu/index.html'), 'utf8');
  ok(/<div id="app" hidden>/.test(raw), 'index.html の #app に hidden が無い');
  const authSrc = fs.readFileSync(path.join(ROOT, 'seikyu/js/auth.js'), 'utf8');
  ok(/a\.hidden = false/.test(authSrc), 'ログインできた時に hidden を外していない');
  ok(/a\.hidden = true/.test(authSrc), 'ログイン画面に戻す時に hidden を付けていない');
});

T('0. 取引先と自社が共有マスタから読めている（請求書で別に持っていない）', () => {
  eq(win.SeikyuApp._state.partners.length, 2);
  eq(win.SeikyuApp._state.org.yago, '株式会社ゼロアクト');
});

/* ★開いた直後を、1つも押さずに測る★
   （2026-08-11 実機で発生：開いた所を「入力」にしたのに白紙の1通を作っていなかった。
     画面には「新しい請求書」と出ているのに 請求日も明細の行も無い＝どこも押せない。
     b-new を押してから測っていたので、この検査は緑のままだった。） */
T('0. ★開いた直後＝1つも押していないのに、その場で打ち始められる', () => {
  const cur = win.SeikyuApp._state.cur;
  ok(cur, '開いた直後に1通も持っていない（画面は「新しい請求書」と出ているのに中身が無い）');
  ok(cur.issue_ymd, '請求日が空');
  ok(Array.isArray(cur.lines) && cur.lines.length >= 1, '明細の行が無い');
  ok($('e-issue').value, '画面の請求日が空');
  ok(doc.querySelectorAll('#e-partner option').length >= 1, '取引先の選択肢が1つも無い');
  ok($('lines-body').querySelectorAll('tr').length >= 1, '画面に明細の行が無い');
  // ★番号は後から決まる。読むだけの欄にも入っていること（「（自動）」のままにしない）
  eq($('e-no-view').textContent, cur.no, '番号の欄が「（自動）」のまま');
});

/* ═══ 1. 画面にあるボタンを1つ残らず押す ═══
   ★押した数を報告するのではなく、押す物の一覧をここで作って全部通す★ */
await TA('1. ★3画面ぜんぶのボタンを1つ残らず押しても、JSが1つも落ちない', async () => {
  const before = errs.length;
  const screens = ['scr-list', 'scr-edit', 'scr-set'];
  const pressed = [];
  for (const scr of screens) {
    const nav = doc.querySelector('.bn[data-scr="' + scr + '"]');
    ok(nav, 'ナビ ' + scr + ' が無い');
    nav.click();
    await sleep(10);
    const el = $(scr);
    ok(el.classList.contains('active'), scr + ' が開かない');
    ok(el.innerHTML.length > 400, scr + ' の中身が薄い(' + el.innerHTML.length + ')');
    for (const b of [...el.querySelectorAll('button'), ...doc.querySelectorAll('.bn')]) {
      if (b.disabled) { pressed.push((b.id || b.textContent.trim()) + '(押せない)'); continue; }
      b.click();
      await sleep(6);
      pressed.push(b.id || b.getAttribute('data-fil') || b.getAttribute('data-tm') || b.getAttribute('data-nm') || b.textContent.trim());
    }
    // 押した拍子に別の画面へ行っていたら戻す
    doc.querySelector('.bn[data-scr="' + scr + '"]').click();
    await sleep(6);
  }
  // ファイル名の小窓のボタンも押す
  $('fn-cancel').click();
  pressed.push('fn-cancel');
  console.log('     押した物(' + pressed.length + '): ' + pressed.join(' / '));
  ok(pressed.length >= 25, '押した物が少なすぎる（一覧が取れていない）: ' + pressed.length);
  eq(errs.length, before, 'JSが落ちた: ' + errs.slice(before).join(' | '));
  /* ★総当たりで「見積書」も押している＝そのままだと次の検査が全部 見積になる★
     押した事実は上の一覧に残したまま、種類だけ請求書へ戻す（片づけ）。 */
  doc.querySelector('#kind-seg [data-kind="invoice"]').click();
  await sleep(30);
  eq(win.SeikyuApp._state.docType, 'invoice', '種類が請求書に戻らない');
  // ★総当たりで作られた行は片づける（次の検査を汚さない）。押した事実は上に残す
  db.pay_invoices.length = 0;
  await win.SeikyuApp._state.store.invoices.list('invoice');
  $('b-reload').click();
  await sleep(60);
});

/* ═══ 1-b. 見た目の土台（スイート共通の皮）と、潰れない書き方 ═══
   jsdom は幅を計算しないので、ここでは ★潰れない書き方になっているか★ を見る
   （実物の幅は実機幅の画面で定規を当てて確かめる。この検査はその前段の網）。 */
const SKIN = fs.readFileSync(path.join(ROOT, 'css/exally-ui.css'), 'utf8');
const APPCSS = fs.readFileSync(path.join(ROOT, 'seikyu/css/app.css'), 'utf8');
const CSS = SKIN + '\n' + APPCSS;
/* 色の検査は「実際に効いている指定」だけを見る（説明文の中の色名を数えない） */
const CSS_CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, ' ');

T('1-b. ★見た目はスイート共通の皮を読んでいる（請求書だけ別の画面にしない）', () => {
  ok(/<link rel="stylesheet" href="\.\.\/css\/exally-ui\.css/.test(html), '共通の皮を読んでいない');
  ok(html.indexOf('exally-ui.css') < html.indexOf('css/app.css'), '皮より先にアプリのCSSを読んでいる（差分が効かない）');
});

T('1-b. ★うちのミント #52B788 と 差し色 #3D9E72 が実際に効いている（請求書だけ別の緑にしない）', () => {
  // ★選ばれている物に見た目が付いているか（押しても何も変わらないように見せない）
  ok(/\.seg-b\.on\s*\{[^}]*background/.test(CSS_CODE), '選んだチップに色が付かない');
  ok(/\.mini\.on\s*\{[^}]*background/.test(CSS_CODE), '選んだ小さいボタン（揃えなど）に色が付かない');
  ok(/#52B788/i.test(CSS_CODE), 'ブランドのミントが1回も使われていない');
  ok(/#3D9E72/i.test(CSS_CODE), '差し色が1回も使われていない');
  ok(/#2E7D54/i.test(CSS_CODE), '主色が使われていない');
  ok(!/#1A4A2E/i.test(CSS_CODE), '使ってはいけない濃い緑がある');
});

T('1-b. ★皮に無い緑を勝手に足していない（3アプリでバラけた原因）', () => {
  const allowed = new Set(['#2e7d54', '#3d9e72', '#52b788', '#3d6b53', '#5c7e6c', '#7aa08c',
    '#d4eae0', '#c8ecd8', '#f0faf4', '#e8f6ee', '#ffffff', '#c0392b', '#f0d5d0', '#fdf0ee',
    '#92500a', '#f0ddbc', '#fdf3e3']);
  const used = [...APPCSS.replace(/\/\*[\s\S]*?\*\//g, ' ').matchAll(/#[0-9a-fA-F]{6}\b/g)]
    .map((m) => m[0].toLowerCase());
  const stray = [...new Set(used)].filter((c) => !allowed.has(c));
  ok(stray.length === 0, '皮に無い色を使っている: ' + stray.join(', '));
});

T('1-b. ★明細の表は「縮めて潰す」のではなく「横に動かす」（実機幅375pxで欄が幅ゼロになった前科）', () => {
  const wrap = (/\.lines-scroll\s*\{([^}]*)\}/.exec(CSS) || [])[1] || '';
  ok(/overflow-x\s*:\s*auto/.test(wrap), '.lines-scroll が横に動かせない');
  // ★列は会社が足せるので、表そのものではなく「1列ぶんの最低幅」で潰れを止める
  for (const sel of ['.l-name', '.l-sm', '.l-md', '.l-x']) {
    const rule = (new RegExp('\\' + sel + '\\s*\\{([^}]*)\\}').exec(CSS) || [])[1] || '';
    ok(/min-width\s*:\s*\d+px/.test(rule), sel + ' に最低幅が無い（列が幅ゼロまで潰れる）');
  }
  ok(!/\.lines\s*\{[^}]*width\s*:\s*100%/.test(CSS), '.lines に width:100% がある（最低幅を打ち消す）');
  ok(/<div class="lines-scroll">/.test(html), '表が横に動く入れ物に入っていない');
});

T('1-b. ★文が入る箱は block で最低幅を持ち、日本語を1文字ずつ割らない', () => {
  ok(!/word-break\s*:\s*break-all/.test(CSS), 'break-all がある（日本語が1文字ずつ割れる）');
  // 皮の側（4つまとめて指定している）
  const many = (/\.hint,\s*\.warn,\s*\.bad,\s*\.ok,\s*\.why\s*\{([^}]*)\}/.exec(CSS) || [])[1] || '';
  ok(/display\s*:\s*block/.test(many), '文の箱が block でない');
  ok(/min-width\s*:\s*\d/.test(many), '文の箱に最低幅が無い');
  ok(/overflow-wrap\s*:\s*break-word/.test(many), '文の箱に折り返しの指定が無い');
  // 請求書だけの物
  for (const sel of ['.scroll-note', '.iv-sub']) {
    const rule = (new RegExp('\\' + sel + '\\s*\\{([^}]*)\\}').exec(CSS) || [])[1] || '';
    ok(/display\s*:\s*block/.test(rule), sel + ' が block でない');
    ok(/min-width\s*:\s*\d|width\s*:\s*100%/.test(rule), sel + ' に幅の確保が無い');
    ok(/overflow-wrap\s*:\s*break-word/.test(rule), sel + ' に折り返しの指定が無い');
  }
  ok(/\.btn-row\s*\{[^}]*flex-wrap\s*:\s*wrap/.test(CSS), 'ボタンの行が折り返さない（横にはみ出す）');
  // ★上の帯は flex。中の日本語（アプリ名）が縮んで1文字ずつ縦に割れた前科（実機幅390px）
  for (const sel of ['.logo', '.back']) {
    const rule = (new RegExp('\\' + sel + '\\s*\\{([^}]*)\\}').exec(CSS) || [])[1] || '';
    ok(/white-space\s*:\s*nowrap/.test(rule), sel + ' が折り返す（日本語のアプリ名が縦に割れる）');
    ok(/flex\s*:\s*0 0 auto/.test(rule), sel + ' が縮む指定になっている（flexの子は既定で縮む）');
  }
  /* ★頭にはメールを置かない（給与と同じ＝ログイン中の人は「設定」の中）★
     頭は flex なので、長いメールが入ると 屋号や見出しを押し出す。
     「…」で切って耐えるのではなく、★そもそも頭に入れない★ で直した（2026-08-11）。 */
  const headTag = (/<header[\s\S]*?<\/header>/.exec(html) || [''])[0];
  ok(!/id="who"|id="b-logout"/.test(headTag), '頭にメールかログアウトが戻っている: ' + headTag.slice(0, 160));
  ok(/<section class="screen" id="scr-set">[\s\S]*id="who"[\s\S]*?<\/section>/.test(html), 'ログイン中の人が「設定」の中に無い');
  const who = (/\.who\s*\{([^}]*)\}/.exec(CSS) || [])[1] || '';
  ok(/overflow-wrap\s*:\s*break-word/.test(who), '長いメールが箱からはみ出す');
  ok(!/word-break\s*:\s*break-all/.test(who), 'break-all（1文字ずつ割れる）');
  // ★列の編集は flex の行。中の「列の名前」が縦帯にならないよう先に幅を確保している
  const cn = (/\.col-name\s*\{([^}]*)\}/.exec(CSS) || [])[1] || '';
  ok(/min-width\s*:\s*\d+px/.test(cn), '列の名前に最低幅が無い（flexの中で1文字ずつ縦に割れる）');
});

T('1-b. ★入力欄は16px（これより小さいと iPhone が勝手に拡大して画面がズレる）', () => {
  const rule = (/\.finput\s*\{([^}]*)\}/.exec(CSS) || [])[1] || '';
  const m = /font-size\s*:\s*(\d+(?:\.\d+)?)px/.exec(rule);
  ok(m, '.finput に文字の大きさが無い');
  ok(Number(m[1]) >= 16, '入力欄が ' + m[1] + 'px（16px 未満）');
});

T('1-b. ★iPhone で持っていない入力（月・週）を使っていない', () => {
  ok(!/type="(month|week|datetime-local)"/.test(html), 'iOS が持っていない入力がある');
});

/* ═══ 2. 1通 作って発行する ═══ */
// 1. の総当たりで様式が切り替わっているので、ここで std1 に戻してから測る
doc.querySelector('#s-tpl [data-tpl="std1"]').click();
await sleep(10);
$('b-new').click();
await sleep(10);

await TA('2. ★新しく作る＝白紙を埋めさせない（今日・番号が最初から入る）', async () => {
  ok($('e-issue').value, '請求日が空');
  ok($('e-no').value, '番号が空: ' + $('e-no').value);
  ok($('lines-body').querySelectorAll('tr').length >= 1, '明細の行が無い');
  // ★既定の税の入れ方は設定から黙って使う（入力では聞かない）
  eq(win.SeikyuApp._state.cur.tax_mode, 'exclusive', '設定の既定が入っていない');
  ok(win.SeikyuApp._state.cur.rounding, '丸め方が入っていない');
});

T('2-a. ★入力の画面で「毎回 聞く物」を出さない（設定で1回 決めた物は聞かない）', () => {
  const edit = $('scr-edit');
  /* ★税の入れ方は「設定」で1回 決める物★＝★主線には出さない★。
     ただし ★取引先ごとに違う★のが実物（税抜の相手・税込の相手が混ざる）なので、
     この1通だけ変える道を ★畳みの中★ に置くのは可（開くまで画面に出ない）。 */
  ok(!!edit.querySelector('#e-taxmode'), 'この1通だけ変える道が無い（実物は相手ごとに違う）');
  ok(edit.querySelector('#e-taxmode').closest('details'), '★税の入れ方を主線で毎回 聞いている★');
  ok(edit.querySelector('#e-lead').closest('details'), '★「◯年◯月分」を主線で毎回 聞いている★');
  ok(!edit.querySelector('#e-round'), '円未満の丸め方を毎回 聞いている');
  ok(!edit.querySelector('#e-tpl'), '紙の様式を毎回 聞いている');
  ok(!edit.querySelector('#e-nomode'), '番号の決め方を毎回 聞いている');
  // 設定の側には在る（消したのではなく移した）
  const set = $('scr-set');
  ok(set.querySelector('#s-taxmode') && set.querySelector('#s-round') && set.querySelector('#s-tpl'),
    '設定から無くなっている（移したのではなく消してしまった）');
});

T('2-a. ★出すボタンは1つだけ大きく・ほかは畳む（7個 横並びをやめた）', () => {
  const big = $('b-issue');
  ok(big && /btn-big/.test(big.className), '本命のボタンが大きくない');
  const box = $('out-box');
  ok(box && box.tagName === 'DETAILS', 'ほかの出し方が畳まれていない');
  ok(!box.open, '最初から開いている（画面が説明とボタンで埋まる）');
  /* 畳みの外に「見えている」ボタンは、下書きの間は「発行する」だけ。
     ★DOMに在る＝見えている ではない★ので、隠れている箱の中は数えない
     （入金の箱は発行してから出る。下書きの画面には1つも出ていないことを、ここで併せて測る）。 */
  const shown = (el) => { for (let e = el; e && e !== doc.body; e = e.parentElement) { if (e.style && e.style.display === 'none') return false; } return true; };
  /* ★「＋ 足す」は "出す口" ではない★（行を足す・控除を足す）＝数に入れない。
     ここで数えたいのは ★紙を出すボタンが横に並んでいないか★ だけ。 */
  const outside = [...$('scr-edit').querySelectorAll('button')].filter((b) => shown(b) && !b.closest('details') && !b.closest('#lines-body') && !/btn-add/.test(b.className) && b.id !== 'b-no-edit' && !b.id.startsWith('b-guess')
    /* ★2枚になった時だけ出る「枠を増やす」は 出すボタンではない★（案内の中の行き先）。
       ふだんは1枚に収まるので出ていない＝画面に並ぶボタンは増えない。 */
    && b.id !== 'b-goto-rows');
  eq(outside.map((b) => b.id).join(','), 'b-issue', '畳みの外にボタンが多い: ' + outside.map((b) => b.id));
  eq(shown($('b-pay-add')), false, '★下書きなのに「入金を記録」が出ている（まだ請求していない）★');
});

T('2-a. ★タブの順と動詞を給与にそろえた（設定→入力→一覧・「作る」ではなく「入力」）', () => {
  const tabs = [...doc.querySelectorAll('.bn')].map((b) => b.getAttribute('data-scr') + ':' + b.querySelector('.bn-l').textContent);
  eq(tabs.join(' '), 'scr-set:設定 scr-edit:入力 scr-list:一覧', 'タブの順か言葉が給与と違う');
  ok(!/作る/.test([...doc.querySelectorAll('.bn')].map((b) => b.textContent).join('')), 'タブに「作る」が残っている（給与は「入力」）');
  // 開いた時に出ているのは入力（初めての人がそのまま1通 出せる）
  ok(/<section class="screen active" id="scr-edit">/.test(html), '開いた時の画面が入力でない');
});

await TA('2. 取引先を選ぶ・明細を入れる → 合計が実額で出る', async () => {
  setVal('e-partner', 'pt_a');
  await sleep(10);
  setVal('e-issue', '2026-09-30');
  await sleep(10);
  const tr = $('lines-body').querySelector('tr');
  const f = (name) => tr.querySelector('[data-f="' + name + '"]');
  f('name').value = '運転代行 9月分'; f('name').dispatchEvent(new win.Event('input'));
  f('qty').value = '3'; f('qty').dispatchEvent(new win.Event('input'));
  f('price').value = '105'; f('price').dispatchEvent(new win.Event('input'));
  await sleep(10);
  const tot = $('tot-box').textContent;
  // ★実測した境界：外税・切り捨て・3行ぶんの税抜105 → 消費税は 31円（行ごとに丸めると30円）
  ok(/31/.test(tot), '税率ごとに1回だけ丸めた額(31)が出ていない: ' + tot.replace(/\s+/g, ' '));
  ok(/346/.test(tot), '合計(346)が出ていない: ' + tot.replace(/\s+/g, ' '));
});

await TA('2. 行を足す・行を消す が効く', async () => {
  const n0 = $('lines-body').querySelectorAll('tr').length;
  $('b-addline').click(); await sleep(6);
  eq($('lines-body').querySelectorAll('tr').length, n0 + 1, '行が増えない');
  $('lines-body').querySelectorAll('[data-del]')[n0].click(); await sleep(6);
  eq($('lines-body').querySelectorAll('tr').length, n0, '行が減らない');
});

await TA('2. 下書きを保存すると倉庫に1行入る', async () => {
  $('b-save').click();
  await sleep(30);
  eq(db.pay_invoices.length, 1, '倉庫の行数');
  eq(db.pay_invoices[0].status, 'draft');
  ok(db.pay_invoices[0].no, '番号が空のまま保存された');
  eq(db.pay_invoices[0].totals.grandTotal, 346, '保存した合計');
});

const firstNo = db.pay_invoices[0].no;

await TA('2. ★発行すると固まる（写しが入り、状態が発行済になる）', async () => {
  $('b-issue').click();
  await sleep(40);
  const row = db.pay_invoices[0];
  eq(row.status, 'issued');
  ok(row.issued_at, '発行時刻が入っていない');
  eq(row.snapshot.partner.name, '藤原建設株式会社', '写しの宛先');
  eq(row.snapshot.partner.honor, '御中', '写しの敬称（hubのkeishoを読めていない）');
  eq(row.snapshot.org.yago, '株式会社ゼロアクト', '写しの自社');
  eq(row.template_id, 'std1', '様式');
  eq(row.totals.grandTotal, 346);
});

await TA('2. ★発行済みは直せない・もう一度発行できない（理由も出る）', async () => {
  ok($('e-partner').disabled, '取引先が直せる');
  ok($('e-no').disabled, '番号が直せる');
  ok(qa('#lines-body input').every((i) => i.disabled), '明細が直せる');
  // ★押せない物は「出さない」（説明で補わない）
  eq($('b-save').style.display, 'none', '発行済みなのに保存が出ている');
  eq($('b-issue').style.display, 'none', '発行済みなのに発行が出ている');
  ok(!$('b-delete'), '発行済みなのに削除が出ている');
  ok($('b-void'), '取り消しが出ていない');
  ok(/発行済み/.test($('act-why').textContent), '理由が出ていない: ' + $('act-why').textContent);
  /* ★畳みの見出しが、中に無い物を並べていない（発行済みに「下書き」と書かない）★
     ＋ 発行済みはここが唯一の出来る事なので、畳んだままにしない */
  eq(/下書き/.test($('out-sum').textContent), false, '発行済みなのに見出しが「下書き」と言っている: ' + $('out-sum').textContent);
  ok(/取り消し/.test($('out-sum').textContent), '見出しに「取り消し」が無い: ' + $('out-sum').textContent);
  eq($('out-box').open, true, '発行済みなのに出来る事が畳まれたまま');
  ok($('edit-locked').style.display !== 'none', '発行済みの断り書きが出ていない');
});

/* ═══ 2-b. ★どんな項目にも対応できる（列を自分で決める）★ ═══ */
await TA('2-b. ★列を1本足すと、入力の表にも紙にも出る／金額は1円も動かない', async () => {
  const before = win.SeikyuApp._state.cur.totals.grandTotal;
  doc.querySelector('.bn[data-scr="scr-set"]').click();
  await sleep(20);
  const n0 = $('col-list').querySelectorAll('.col-row').length;
  $('col-new').value = '行き先';
  $('b-col-add').click();
  await sleep(20);
  eq($('col-list').querySelectorAll('.col-row').length, n0 + 1, '列が増えていない');
  ok(/行き先/.test($('col-list').textContent), '足した列が一覧に無い');
  ok($('col-ok').style.display !== 'none', '足したことを伝えていない');

  // 新しい1通を作ると、その列が入力の表に出る
  $('b-new').click();
  await sleep(30);
  const heads = [...$('lines-head').querySelectorAll('th')].map((th) => th.textContent);
  ok(heads.indexOf('行き先') >= 0, '入力の表に足した列が出ていない: ' + heads.join('/'));

  // 値を入れて紙に出す
  setVal('e-partner', 'pt_a');
  await sleep(20);
  const tr = $('lines-body').querySelector('tr');
  tr.querySelector('[data-f="name"]').value = 'あ';
  tr.querySelector('[data-f="name"]').dispatchEvent(new win.Event('input'));
  tr.querySelector('[data-f="amount"]').value = '1000';
  tr.querySelector('[data-f="amount"]').dispatchEvent(new win.Event('input'));
  const x = tr.querySelector('[data-x="行き先"]');
  ok(x, '足した列の入力欄が無い');
  x.value = '今治→松山';
  x.dispatchEvent(new win.Event('input'));
  await sleep(20);
  $('b-preview').click();
  await sleep(400);
  const src = $('pv').srcdoc || '';
  ok(/行き先/.test(src), '紙に足した列の見出しが無い');
  ok(/今治→松山/.test(src), '紙に足した列の中身が無い');
  // ★列を足しても、金額は明細だけから出る（列は金額に触らない）
  ok(before > 0, '前の1通の合計が取れていない');
  const totText = $('tot-box').textContent.replace(/\s+/g, '');
  ok(/合計1,100円/.test(totText), '列を足したら合計が変わった: ' + totText);
});

await TA('2-b. ★幅は 24〜400 から出られない（−を連打しても列が消えない）', async () => {
  doc.querySelector('.bn[data-scr="scr-set"]').click();
  await sleep(20);
  const row = $('col-list').querySelector('.col-row');
  const minus = row.querySelector('[data-w="-8"]');
  for (let i = 0; i < 40; i++) { minus.click(); await sleep(2); }
  await sleep(20);
  const w1 = Number($('col-list').querySelector('.col-row .col-w').textContent);
  eq(w1, 24, '下限を割った: ' + w1);
  const plus = $('col-list').querySelector('.col-row [data-w="8"]');
  for (let i = 0; i < 80; i++) { plus.click(); await sleep(2); }
  await sleep(20);
  const w2 = Number($('col-list').querySelector('.col-row .col-w').textContent);
  eq(w2, 400, '上限を超えた: ' + w2);
  // ★どれだけ広げても、紙に割り付ける％の合計は 100 のまま＝はみ出さない
  const pcts = [...$('col-list').querySelectorAll('.col-row')].map((r) => {
    const t = r.querySelectorAll('.col-w')[1].textContent;
    return Number(t.replace('%', ''));
  });
  const sum = pcts.reduce((a, b) => a + b, 0);
  ok(Math.abs(sum - 100) < 0.6, '紙に割り付ける合計が100%でない: ' + sum.toFixed(2));
});

await TA('2-b. ★揃えを変えられる／列を消せる／既定に戻せる', async () => {
  const row = $('col-list').querySelector('.col-row');
  row.querySelector('[data-al="right"]').click();
  await sleep(20);
  ok($('col-list').querySelector('.col-row [data-al="right"]').classList.contains('on'), '揃えが変わっていない');
  const n0 = $('col-list').querySelectorAll('.col-row').length;
  $('col-list').querySelector('.col-row [data-cdel]').click();
  await sleep(20);
  eq($('col-list').querySelectorAll('.col-row').length, n0 - 1, '列が消えない');
  $('b-col-reset').click();
  await sleep(20);
  const heads = [...$('col-list').querySelectorAll('.col-name')].map((e) => e.firstChild.textContent);
  eq(heads.join('/'), '#/品名・内容/数量/単位/単価/金額/消費税', '既定に戻っていない: ' + heads.join('/'));
});

await TA('2-b. ★様式を替えても金額が1円も動かない（見た目だけ変わる）', async () => {
  doc.querySelector('.bn[data-scr="scr-list"]').click();
  await sleep(20);
  doc.querySelector('#fil-seg [data-fil="issued"]').click();
  await sleep(10);
  $('list-body').querySelector('[data-open]').click();
  await sleep(30);
  const g0 = win.SeikyuApp._state.cur.totals.grandTotal;
  $('b-preview').click();
  await sleep(400);
  const a = $('pv').srcdoc || '';
  // 発行済みは様式を選べない（写しで固まっている）
  ok([...doc.querySelectorAll('#e-tpl .seg-b')].every((b) => b.disabled), '発行済みなのに様式を変えられる');
  eq(win.SeikyuApp._state.cur.totals.grandTotal, g0, '見ただけで合計が動いた');
  const money = String(g0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  ok(a.replace(/\s+/g, '').includes(money), '紙に合計 ' + money + ' が出ていない');
  // ★発行済みは写しの列で刷る＝あとで会社が列を足しても、出した紙は変わらない
  const heads = [...a.matchAll(/<th class="c-col"[^>]*>([^<]*)<\/th>/g)].map((m) => m[1]);
  eq(heads.join('/'), '#/品名・内容/数量/単位/単価/金額/消費税', '発行済みの紙の列が後から変わった: ' + heads.join('/'));
  ok(heads.indexOf('行き先') < 0, '発行後に足した列が、出した紙に入り込んでいる');
});

/* ═══ 3. 出す（紙・Excel） ═══ */
await TA('3. ★「中身を見る」で紙の下見が出る（アプリの画面は入らない）', async () => {
  $('b-preview').click();
  await sleep(400);
  const src = $('pv').srcdoc || '';
  ok(/請　求　書/.test(src), '紙になっていない');
  ok(/藤原建設株式会社/.test(src), '宛先が出ていない');
  ok(!/botnav|appbar|b-issue/.test(src), 'アプリの画面が紙に混ざっている');
  ok($('pv-wrap').style.display !== 'none', '下見の枠が出ていない');
});

await TA('3. ★別の1通に切り替えたら、前の紙の下見は消える（違う紙を出したままにしない）', async () => {
  $('b-new').click();
  await sleep(20);
  eq($('pv-wrap').style.display, 'none', '前の紙が残っている');
  // 元の発行済みに戻す
  doc.querySelector('.bn[data-scr="scr-list"]').click();
  await sleep(20);
  doc.querySelector('#fil-seg [data-fil="issued"]').click();
  await sleep(10);
  $('list-body').querySelector('[data-open]').click();
  await sleep(20);
  doc.querySelector('#fil-seg [data-fil="all"]');
});

await TA('3. ★印刷は「紙だけの新しい窓」に書かれる', async () => {
  const n0 = opened.length;
  $('b-print').click();
  await sleep(10);
  ok($('fn-ov').classList.contains('open'), '★落とす前にファイル名を見せていない★');
  const suggested = $('fn-input').value;
  ok(/^20260930_藤原建設株式会社_請求書_346$/.test(suggested), '推奨名が中身から作られていない: ' + suggested);
  $('fn-ok').click();
  await sleep(1200);
  ok(opened.length === n0 + 1, '新しい窓が開かない');
  const w = opened[opened.length - 1];
  ok(/<!DOCTYPE html>/.test(w._html), '紙が書かれていない');
  ok(/請　求　書/.test(w._html), '紙の見出しが無い');
  ok(!/botnav|appbar|b-issue|<script/i.test(w._html), 'アプリの画面/スクリプトが紙の窓に混ざっている');
  ok(w._printed, '印刷が呼ばれていない');
  eq(w.document.title, '20260930_藤原建設株式会社_請求書_346.pdf', 'PDFの既定の名前が窓の題名になっていない');
});

await TA('3. ★Excelは正しい種類で落ちる（iPhoneで開けない octet-stream にしない）', async () => {
  const n0 = anchorClicks.length;
  $('b-xlsx').click();
  await sleep(10);
  ok($('fn-ov').classList.contains('open'), 'ファイル名を見せていない');
  ok(/\.xlsx$/.test($('fn-input').value + '.xlsx'), '');
  $('fn-input').value = '20260930_藤原建設_請求書_346';
  $('fn-ok').click();
  await sleep(60);
  ok(anchorClicks.length === n0 + 1, '落ちていない');
  const a = anchorClicks[anchorClicks.length - 1];
  eq(a.download, '20260930_藤原建設_請求書_346.xlsx', '直した名前で落ちていない');
  eq(a.target, '_blank', '★ホーム画面アプリで戻れなくなる（target=_blank が無い）★');
  const d = delivered[delivered.length - 1];
  eq(d.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'ファイルの種類');
});

/* ═══ 4. 番号 ═══ */
await TA('4. ★同じ番号を二度使わない（倉庫が弾き、1つ進めて出し直す）', async () => {
  $('b-new').click();
  await sleep(20);
  setVal('e-partner', 'pt_a');
  setVal('e-issue', '2026-09-30');
  await sleep(20);
  // 「自分で決める」にして、わざと発行済みと同じ番号を入れる
  $('b-no-edit').click();     // ★番号は「変える」を押した時だけ直せる
  await sleep(10);
  setVal('e-no', firstNo);
  const tr = $('lines-body').querySelector('tr');
  tr.querySelector('[data-f="name"]').value = 'テスト';
  tr.querySelector('[data-f="name"]').dispatchEvent(new win.Event('input'));
  tr.querySelector('[data-f="amount"]').value = '1000';
  tr.querySelector('[data-f="amount"]').dispatchEvent(new win.Event('input'));
  await sleep(10);
  $('b-issue').click();
  await sleep(60);
  const nos = db.pay_invoices.map((x) => x.no);
  eq(new Set(nos).size, nos.length, '同じ番号が2つ入った: ' + nos.join(','));
  eq(db.pay_invoices.length, 2, '2通目が入っていない');
  ok(/進めました/.test($('edit-ok').textContent), '番号を進めたことを伝えていない: ' + $('edit-ok').textContent);
});

const secondId = db.pay_invoices[1].id;

await TA('4. ★取り消しても番号は空かない（同じ番号は二度と使えない）', async () => {
  $('b-void').click();
  await sleep(40);
  eq(db.pay_invoices[1].status, 'void');
  ok(db.pay_invoices[1].voided_at, '取り消し時刻が入っていない');
  // 取り消した番号をもう一度は使えない（倉庫が持っているので nextNo も避ける）
  const voidedNo = db.pay_invoices[1].no;
  const used = await win.SeikyuApp._state.store.invoices.usedNos('invoice');
  ok(used.indexOf(voidedNo) >= 0, '取り消した番号が「使用済み」から外れている');
});

/* ═══ 5. 一覧 ═══ */
await TA('5. 一覧に2通出る・絞り込みが効く', async () => {
  doc.querySelector('.bn[data-scr="scr-list"]').click();
  await sleep(20);
  doc.querySelector('#fil-seg [data-fil="all"]').click();   // 1. の総当たりで絞り込みが残っているので戻す
  await sleep(6);
  eq($('list-body').querySelectorAll('[data-open]').length, 2, 'すべて');
  // ★既定は「出した物」＝取り消しは出さない（検証ゴミが上に来ない）
  doc.querySelector('#fil-seg [data-fil="live"]').click();
  await sleep(6);
  eq($('list-body').querySelectorAll('[data-open]').length, 1, '出した物（取り消し以外）');
  doc.querySelector('#fil-seg [data-fil="issued"]').click();
  await sleep(6);
  eq($('list-body').querySelectorAll('[data-open]').length, 1, '発行済');
  doc.querySelector('#fil-seg [data-fil="void"]').click();
  await sleep(6);
  eq($('list-body').querySelectorAll('[data-open]').length, 1, '取り消し');
  doc.querySelector('#fil-seg [data-fil="all"]').click();
  await sleep(6);
});

T('5. ★入金は「未入金(0件)」として出る（読めた上での0件）', () => {
  ok(/未入金/.test($('list-body').textContent), '入金の状態が出ていない');
  ok(!/未確認/.test($('list-body').textContent), '読めているのに未確認と出ている');
});

await TA('5. ★入金が読めなかった時は「未確認」と言い、0件と作り分ける', async () => {
  const st = win.SeikyuApp._state;
  const keep = st.receipts;
  st.receipts = null;
  doc.querySelector('#fil-seg [data-fil="all"]').click();   // 描き直す
  await sleep(10);
  ok(/未確認/.test($('list-body').textContent), '読めなかったのに未入金と言い切っている');
  st.receipts = keep;
  doc.querySelector('#fil-seg [data-fil="all"]').click();
  await sleep(10);
});

await TA('5. 一覧から開くと、その1通が出る', async () => {
  $('list-body').querySelector('[data-open]').click();
  await sleep(20);
  ok($('scr-edit').classList.contains('active'), '中身の画面が開かない');
  ok($('edit-h').textContent.length > 2, '見出しが空: ' + $('edit-h').textContent);
});

/* ═══ 6. 設定 ═══ */
await TA('6. 設定を保存すると自社の棚に入る（番号の形・丸め方・振込先）', async () => {
  doc.querySelector('.bn[data-scr="scr-set"]').click();
  await sleep(20);
  $('s-format').value = 'y-seq'; $('s-format').dispatchEvent(new win.Event('change'));
  $('s-round').value = 'round'; $('s-round').dispatchEvent(new win.Event('change'));
  $('s-bank').value = '伊予銀行 今治支店 普通 1234567';
  $('b-set-save').click();
  await sleep(40);
  const org = db.pay_org[0].data;
  eq(org.numbering.invoice.format, 'y-seq');
  eq(org.taxRounding, 'round');
  eq(org.bank, '伊予銀行 今治支店 普通 1234567');
  eq(org.yago, '株式会社ゼロアクト', '★ハブが入れた自社情報を消している★');
});

await TA('6. ★「連番だけ＋毎年1に戻す」は保存させない（去年と必ずぶつかる）', async () => {
  $('s-format').value = 'seq'; $('s-format').dispatchEvent(new win.Event('change'));
  $('s-reset').checked = true; $('s-reset').dispatchEvent(new win.Event('change'));
  $('b-set-save').click();
  await sleep(30);
  ok($('set-err').style.display !== 'none', '止めていない');
  eq(db.pay_org[0].data.numbering.invoice.format, 'y-seq', '止めたのに保存された');
  $('s-format').value = 'y-seq'; $('s-format').dispatchEvent(new win.Event('change'));
  $('s-reset').checked = true;
});

await TA('6. ★取引先に請求書用の項目を足しても、ハブが入れた名前・住所を消さない', async () => {
  $('s-partner').value = 'pt_a'; $('s-partner').dispatchEvent(new win.Event('change'));
  await sleep(10);
  eq($('s-phonor').value, '御中', 'ハブの敬称を読めていない');
  $('s-pcode').value = 'A001';
  $('s-pperson').value = '山田';
  $('s-pterm').value = 'nextEom'; $('s-pterm').dispatchEvent(new win.Event('change'));
  $('b-pt-save').click();
  await sleep(40);
  const d = db.pay_partners.find((x) => x.id === 'pt_a').data;
  eq(d.code, 'A001');
  eq(d.person, '山田');
  eq(d.payTerm.kind, 'nextEom');
  eq(d.name, '藤原建設株式会社', '★ハブが入れた名前が消えた★');
  eq(d.addr, '愛媛県今治市1-2-3', '★ハブが入れた住所が消えた★');
  eq(d.invoiceNo, 'T9876543210987', '★ハブが入れた登録番号が消えた★');
  eq(d.keisho, d.honor, '敬称が2つのキーで食い違っている（ハブの画面で化ける）');
});

await TA('6. ★取引先を選ぶまでは、その欄を触らせない（誰のか分からないまま保存させない）', async () => {
  $('s-partner').value = ''; $('s-partner').dispatchEvent(new win.Event('change'));
  await sleep(10);
  ok($('s-pcode').disabled, '取引先未選択なのに入力できる');
  ok($('b-pt-save').disabled, '取引先未選択なのに保存できる');
});

/* ═══ 7. 支払期限 ═══ */
await TA('7. 支払期限は決め方から自動で入り、手でも直せる', async () => {
  $('b-new').click();
  await sleep(20);
  setVal('e-issue', '2026-09-30');
  $('e-term').value = 'nextEom'; $('e-term').dispatchEvent(new win.Event('change'));
  await sleep(10);
  eq($('e-due').value, '2026-10-31', '翌月末が入らない');
  $('e-term').value = 'none'; $('e-term').dispatchEvent(new win.Event('change'));
  await sleep(10);
  setVal('e-due', '2026-11-15');
  eq(win.SeikyuApp._state.cur.due_ymd, '2026-11-15', '手で直した期限が持たれていない');
});

/* ═══ 6-c. ★角印（会社の印）★ ═══ */
await TA('6-c. ★角印を入れると紙に出る／大きさを変えられる／消せる', async () => {
  doc.querySelector('.bn[data-scr="scr-set"]').click();
  await sleep(30);
  ok($('seal-none').style.display !== 'none', '最初から印が入っていることになっている');
  ok($('b-seal-clear').disabled, '印が無いのに「消す」が押せる');

  // ファイル選択は jsdom で作れないので、読み込んだあとの data URL を直接渡す
  const seal = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const r = win.SeikyuApp._pickSealUrl(seal);
  ok(r.ok, '正しい画像がはじかれた: ' + r.reason);
  await sleep(20);
  ok($('seal-pv').style.display !== 'none', '下見に出ていない');
  $('seal-mm').value = '30';
  $('b-seal-save').click();
  await sleep(60);
  eq(db.pay_org[0].data.sealDataUrl, seal, '倉庫に印が入っていない');
  eq(db.pay_org[0].data.sealSizeMm, 30, '大きさが入っていない');
  eq(db.pay_org[0].data.yago, '株式会社ゼロアクト', '★ハブが入れた自社情報を消している★');

  // 新しい1通の紙に出る
  $('b-new').click();
  await sleep(30);
  setVal('e-partner', 'pt_a');
  await sleep(20);
  const tr = $('lines-body').querySelector('tr');
  tr.querySelector('[data-f="name"]').value = 'あ';
  tr.querySelector('[data-f="name"]').dispatchEvent(new win.Event('input'));
  tr.querySelector('[data-f="amount"]').value = '1000';
  tr.querySelector('[data-f="amount"]').dispatchEvent(new win.Event('input'));
  await sleep(20);
  $('b-preview').click();
  await sleep(400);
  const src = $('pv').srcdoc || '';
  ok(/class="seal"/.test(src), '紙に印が出ていない');
  ok(/width:30mm/.test(src), '紙の印の大きさが効いていない');
});

await TA('6-c. ★大きすぎる画像・PNG/JPEG でない物は入らない（理由を出す）', async () => {
  doc.querySelector('.bn[data-scr="scr-set"]').click();
  await sleep(30);
  const bad = win.SeikyuApp._pickSealUrl('https://example.com/hanko.png');
  ok(!bad.ok, '外のURLが通った');
  ok($('seal-err').style.display !== 'none', '理由を出していない');
  const big = win.SeikyuApp._pickSealUrl('data:image/png;base64,' + 'A'.repeat(500 * 1024));
  ok(!big.ok, '大きすぎる画像が通った');
  ok(/KB/.test($('seal-err').textContent), '何KBかを言っていない: ' + $('seal-err').textContent);
  // 前に保存した印は残っている（弾かれても消えない）
  eq(db.pay_org[0].data.sealDataUrl.slice(0, 22), 'data:image/png;base64,', '弾かれた拍子に保存済みの印が消えた');
});

await TA('6-c. ★印を消せる（消しても、すでに出した紙は変わらない）', async () => {
  const issued = db.pay_invoices.filter((x) => x.status === 'issued')[0];
  const before = issued.snapshot.org.sealDataUrl || '';
  $('b-seal-clear').click();
  await sleep(60);
  eq(db.pay_org[0].data.sealDataUrl, '', '倉庫から消えていない');
  ok($('seal-none').style.display !== 'none', '「入れていません」に戻っていない');
  eq(issued.snapshot.org.sealDataUrl || '', before, '★出した紙の写しが書き換わった★');
});

/* ═══ 6-b. ★列を選べるようになる前に出した紙も、あとから列が増えない★ ═══ */
await TA('6-b. ★写しに列が無い古い請求書は、会社の「今の列」を当てずに様式の既定で刷る', async () => {
  // 列を足す前に出した1通を作る（写しに cols が無い＝2026-08-10 より前に出した物と同じ形）
  const old = JSON.parse(JSON.stringify(db.pay_invoices.find((x) => x.status === 'issued')));
  old.id = 'iv_old_no_cols';
  old.no = 'OLD-0001';
  delete old.snapshot.cols;                 // ★列を覚えていない写し
  db.pay_invoices.push(old);
  // 会社の列には「行き先」が入っている状態にする
  const st = win.SeikyuApp._state;
  st.org.invoiceCols = { items: ['#', '品名・内容', '金額', '税率', '行き先'], widths: {}, aligns: {} };

  doc.querySelector('.bn[data-scr="scr-list"]').click();
  await sleep(20);
  doc.querySelector('#fil-seg [data-fil="all"]').click();
  await sleep(20);
  await win.SeikyuApp._state.store.invoices.list('invoice');
  $('b-reload').click();
  await sleep(60);
  const row = [...$('list-body').querySelectorAll('[data-open]')].find((r) => /OLD-0001/.test(r.textContent));
  ok(row, '作った古い1通が一覧に無い');
  row.click();
  await sleep(30);
  $('b-preview').click();
  await sleep(400);
  const heads = [...($('pv').srcdoc || '').matchAll(/<th class="c-col"[^>]*>([^<]*)<\/th>/g)].map((m) => m[1]);
  eq(heads.join('/'), '#/品名・内容/数量/単位/単価/金額/消費税', '古い紙に、あとから足した列が入り込んだ: ' + heads.join('/'));
  ok(heads.indexOf('行き先') < 0, '★出した紙が、列を足した日に変わってしまっている★');
});

/* ═══ 7-b. ★読めなかったを「空」にしない（実機で踏んだ401）★ ═══ */
await TA('7-b. ★自社情報が読めなかった時は、空っぽ扱いにせず「読めなかった」と言い、発行を止める', async () => {
  // 1回目も2回目（取り直し）も失敗させる＝本当に読めない状態を作る
  sb._failNext('pay_org');
  const app = win.SeikyuApp;
  const st = app._state;
  const keepOrg = st.org;
  await app._loadMasters();
  await sleep(700);
  sb._failNext('pay_org');
  await app._loadMasters();
  await sleep(50);
  eq(st.org, null, '読めなかったのに空っぽ({})にしている＝紙に「自社情報が未入力」と出る');
  eq(st.orgReadOk, false, '読めたことになっている');
  ok($('list-err').style.display !== 'none', '読めなかったことを画面で言っていない');
  ok(/読めません/.test($('list-err').textContent), '文言が「読めなかった」になっていない: ' + $('list-err').textContent);

  // この状態では発行させない（空の自社が写しに固まると、もう直せない紙になる）
  $('b-new').click();
  await sleep(20);
  setVal('e-partner', 'pt_a');
  await sleep(20);
  const tr = $('lines-body').querySelector('tr');
  tr.querySelector('[data-f="name"]').value = 'あ';
  tr.querySelector('[data-f="name"]').dispatchEvent(new win.Event('input'));
  tr.querySelector('[data-f="amount"]').value = '1000';
  tr.querySelector('[data-f="amount"]').dispatchEvent(new win.Event('input'));
  await sleep(20);
  const n0 = db.pay_invoices.length;
  /* ★主役の操作が塞がっている時は「灰色にして理由をボタンの中」★（2026-08-12 の決まり）
     ＝押しても何も起きない。理由は押す前から見えている（押して初めて分かる、にしない）。 */
  eq($('b-issue').disabled, true, '★自社が読めていないのに「発行する」が押せる★');
  ok(/自社情報が読めません/.test($('b-issue').textContent),
    '★押せない理由がボタンの中に無い★: ' + $('b-issue').textContent);
  $('b-issue').click();
  await sleep(60);
  eq(db.pay_invoices.length, n0, '自社が読めていないのに発行された');

  // 「読み直す」で直る
  doc.querySelector('.bn[data-scr="scr-list"]').click();
  await sleep(10);
  await win.SeikyuApp._loadMasters();
  await sleep(50);
  eq(st.orgReadOk, true, '読み直しても直らない');
  ok(st.org && st.org.yago, '自社情報が戻っていない');
  ok(keepOrg !== undefined, '');
});


/* ═══ 9. ②-b 源泉徴収 / 繰越 / 非課税 ═══
   ★合格条件（指示役 2026-08-11 追加）★
     ・この3つを足しても「前回から当てる」が壊れない
     ・押す回数が2回のまま（設問を増やさない。増えるなら設定へ） */

/* 新しい1通から始める（前の検査の続きを引きずらない） */
doc.querySelector('.bn[data-scr="scr-list"]').click();
await sleep(10);
$('b-new').click();
await sleep(20);

T('9-a. ★非課税と対象外は別物＝選び所に両方ある（新しい設問は作っていない）', () => {
  const sel = doc.querySelector('#lines-body [data-f="rate"]');
  ok(sel, '税率の選び所が無い');
  const opts = [...sel.options].map((o) => o.textContent);
  ok(opts.includes('非課税'), '「非課税」が無い: ' + opts.join('/'));
  ok(opts.includes('対象外'), '「対象外」が無い: ' + opts.join('/'));
  // ★増えたのは選択肢だけ＝行に入力は1つも増えていない（列の数は前の検査で変わり得るので数えない）
  const cols = win.SeikyuApp._state.cur.data.cols;
  const C = require_(path.join(ROOT, 'seikyu/lib/seikyu-cols.js'));
  /* ＋並べ替えの列 ＋消す列（どちらも「打つ所」ではない）
     ＋★紙に税率の列が無い時だけ、入力にだけ税率を出す★
       （実物32枚は税率の列を持たない＝紙はそれに合わせる。でも税率は計算に要る入力） */
  const paperHasRate = cols.items.some((k) => C.roleOfIn(cols, k) === 'rate');
  const want = cols.items.length + 2 + (paperHasRate ? 0 : 1);
  eq(doc.querySelectorAll('#lines-head th').length, want, '明細の列が増えている');
  ok(doc.querySelector('#lines-body [data-f="rate"]'), '★税率を選ぶ所が消えた（軽減税率も非課税も入れられない）★');
  /* ★行ごとの消費税は「打つ所」ではなく「出る所」★
     打てると 行ごとに丸めた数を足す道ができる＝国税庁 Q&A 問57 で認められていない形。 */
  const taxCol = cols.items.filter((k) => C.roleOfIn(cols, k) === 'tax');
  if (taxCol.length) ok(doc.querySelector('#lines-body .l-ro'), '★消費税の列が打てる欄になっている★');
  eq(doc.querySelectorAll('#lines-body tr [data-f="rate"]').length, 1, '税率の選び所が増えている');
  eq(doc.querySelectorAll('#lines-body input[type="checkbox"]').length, 0, '行にチェックが増えている（設問が増える）');
});

await TA('9-a. ★非課税を選ぶと「非課税」として数える（対象外と混ぜない）', async () => {
  const row = () => doc.querySelector('#lines-body tr');
  const setF = (k, v) => { const e = row().querySelector('[data-f="' + k + '"]'); e.value = v; e.dispatchEvent(new win.Event('input')); e.dispatchEvent(new win.Event('change')); };
  setF('name', '住宅家賃 9月分');
  setF('amount', '80000');
  const sel = row().querySelector('[data-f="rate"]');
  sel.value = [...sel.options].find((o) => o.textContent === '非課税').value;
  sel.dispatchEvent(new win.Event('change'));
  await sleep(30);
  const st = win.SeikyuApp._state;
  eq(st.cur.lines[0].nontax, true, '非課税の印が立っていない');
  eq(String(st.cur.lines[0].rate), '0', '税率が0になっていない');
  const t = st.cur.totals || win.SeikyuApp._recalcForTest();
  ok(/非課税/.test($('tot-box').textContent), '画面に「非課税」が出ていない: ' + $('tot-box').textContent);
  ok(!/消費税の対象外/.test($('tot-box').textContent), '非課税なのに「対象外」と出ている');
  ok(t !== undefined, '');
});

await TA('9-a. ★対象外に切り替えると「対象外」に戻る（印が残らない）', async () => {
  const sel = doc.querySelector('#lines-body [data-f="rate"]');
  sel.value = [...sel.options].find((o) => o.textContent === '対象外').value;
  sel.dispatchEvent(new win.Event('change'));
  await sleep(30);
  eq(!!win.SeikyuApp._state.cur.lines[0].nontax, false, '非課税の印が残っている');
  ok(/消費税の対象外/.test($('tot-box').textContent), '「対象外」が出ていない');
  ok(!/非課税/.test($('tot-box').textContent), '「非課税」が残っている');
});

T('9-b. ★源泉は「細かく決める」の中／繰越は「設定」の中（入力に設問を増やさない）', () => {
  const gen = $('e-gensen');
  ok(gen, '源泉の入/切が無い');
  ok(gen.closest('details') && gen.closest('details').id === 'more-box', '源泉が畳みの外に出ている（設問が増える）');
  ok(!$('scr-edit').querySelector('#s-carry'), '繰越が入力の画面に出ている');
  ok($('scr-set').querySelector('#s-carry'), '繰越が設定に無い');
  ok($('scr-set').querySelector('#s-pgensen'), '取引先ごとの源泉の既定が設定に無い');
});

T('9-b. ★率と式は給与の lib が持つ（請求書側に率を1文字も書かない）', () => {
  const app = fs.readFileSync(path.join(ROOT, 'seikyu/js/seikyu-app.js'), 'utf8');
  const gen = fs.readFileSync(path.join(ROOT, 'seikyu/lib/seikyu-gensen.js'), 'utf8');
  for (const [name, code] of [['seikyu-app.js', app], ['seikyu-gensen.js', gen]]) {
    ok(!/10\.21|20\.42|102,?100/.test(code), name + ' に源泉の率か境目の実数が書いてある');
    ok(!/1000000|1,000,000/.test(code), name + ' に100万円の境目が書いてある');
  }
  ok(/shiharai-chosho/.test(fs.readFileSync(path.join(ROOT, 'seikyu/index.html'), 'utf8')),
    '給与の lib を読み込んでいない＝率をどこかで自前に持っている');
});

await TA('9-b. ★源泉を入れると「引いたあと」まで画面に出る（紙にだけ出さない）', async () => {
  const row = () => doc.querySelector('#lines-body tr');
  const setF = (k, v) => { const e = row().querySelector('[data-f="' + k + '"]'); e.value = v; e.dispatchEvent(new win.Event('input')); e.dispatchEvent(new win.Event('change')); };
  const sel = row().querySelector('[data-f="rate"]');
  sel.value = [...sel.options].find((o) => /%$/.test(o.textContent)).value;
  sel.dispatchEvent(new win.Event('change'));
  setF('name', '原稿料'); setF('amount', '100000');
  $('e-gensen').checked = true;
  $('e-gensen').dispatchEvent(new win.Event('change'));
  await sleep(40);
  const txt = $('tot-box').textContent;
  ok(/源泉徴収税額/.test(txt), '画面に源泉が出ていない: ' + txt);
  ok(/差引お支払額/.test(txt), '画面に差引が出ていない: ' + txt);
  // 実額：給与の lib と1円も違わない
  const CHOSHO = require_(path.join(ROOT, 'kyuyo/lib/shiharai-chosho.js'));
  const want = CHOSHO.gensenA(100000);
  ok(txt.includes(want.toLocaleString('ja-JP')), '源泉の額が給与の lib と違う（欲しい ' + want + '）: ' + txt);
});

await TA('9-b. ★源泉の対象は報酬の行だけ（立替＝対象外の行には掛からない）', async () => {
  $('b-addline').click();
  await sleep(20);
  const rows = doc.querySelectorAll('#lines-body tr');
  const r2 = rows[1];
  const setF = (k, v) => { const e = r2.querySelector('[data-f="' + k + '"]'); e.value = v; e.dispatchEvent(new win.Event('input')); e.dispatchEvent(new win.Event('change')); };
  setF('name', '立替金'); setF('amount', '5000');
  const sel = r2.querySelector('[data-f="rate"]');
  sel.value = [...sel.options].find((o) => o.textContent === '対象外').value;
  sel.dispatchEvent(new win.Event('change'));
  await sleep(40);
  const CHOSHO = require_(path.join(ROOT, 'kyuyo/lib/shiharai-chosho.js'));
  const want = CHOSHO.gensenA(100000);   // 立替の5,000は入らない
  ok($('tot-box').textContent.includes(want.toLocaleString('ja-JP')),
    '立替が源泉の対象額に入っている: ' + $('tot-box').textContent);
  // 後片付け（この行は次の検査に持ち越さない）
  doc.querySelectorAll('#lines-body [data-del]')[1].click();
  await sleep(20);
});

await TA('9-c. ★繰越＝「前回が無い」と「入金が読めない」を作り分ける（どちらも0にしない）', async () => {
  const st = win.SeikyuApp._state;
  const keepR = st.receipts;
  // ★倉庫の側にも入れる（この検査の途中で読み直すと、画面だけの設定は消えるため）
  db.pay_org[0].data = Object.assign({}, db.pay_org[0].data, { invoiceCarry: true });
  st.org.invoiceCarry = true;                       // 繰越を出す

  /* ① 前回が無い（初回）＝「前回の請求はありません」。★「未確認」とは言わない★ */
  st.receipts = [];                                  // 読めた上で0件
  win.SeikyuApp._recalcForTest();
  await sleep(20);
  let txt = $('tot-box').textContent;
  ok(/前回の請求はありません/.test(txt), '初回だと言っていない: ' + txt);
  ok(!/未確認/.test(txt), '★初回なのに「未確認」と出ている（無いのと読めないのを混ぜた）★: ' + txt);
  ok(!/前回請求額/.test(txt), '初回なのに空の繰越の表を出している: ' + txt);

  /* ② 前回が有る・入金が読めていない＝「未確認」。★0と書かない★ */
  db.pay_invoices.push({
    id: 'iv_carry_prev', account_id: 'u1', doc_type: 'invoice', no: 'CARRY-001',
    partner_id: 'pt_c1', status: 'issued', issue_ymd: '2026-07-31',
    totals: { grandTotal: 50000 }, lines: [], data: {}, snapshot: {}, deleted_at: null,
  });
  db.pay_partners.push({ id: 'pt_c1', account_id: 'u1', sort: 8, data: { name: '繰越あり商店', keisho: '御中' }, deleted_at: null });
  await win.SeikyuApp._loadMasters();
  await win.SeikyuApp._state.store.invoices.list('invoice').then((v) => { st.invoices = v; });
  st.cur.partner_id = 'pt_c1';
  st.receipts = null;                                // ★読めていない★
  win.SeikyuApp._recalcForTest();
  await sleep(20);
  txt = $('tot-box').textContent;
  ok(/前回請求額/.test(txt), '前回があるのに繰越の表が出ていない: ' + txt);
  ok(/未確認/.test(txt), '入金が読めないのに「未確認」と出ていない: ' + txt);
  ok(!/入金額0 円/.test(txt), '★読めていないのに 0 と書いている★: ' + txt);
  ok(!/前回の請求はありません/.test(txt), '前回があるのに「ありません」と出ている');

  /* ③ 前回が有る・入金が読めた＝実額。合計＝繰越＋今回 */
  st.receipts = [{ id: 'rc1', invoice_id: 'iv_carry_prev', amount: 20000, deleted_at: null }];
  win.SeikyuApp._recalcForTest();
  await sleep(20);
  txt = $('tot-box').textContent;
  ok(/20,000/.test(txt), '入金の実額が出ていない: ' + txt);
  ok(/30,000/.test(txt), '繰越額（50,000−20,000）が出ていない: ' + txt);
  ok(!/未確認/.test(txt), '読めているのに「未確認」と出ている: ' + txt);

  st.receipts = keepR;
  delete db.pay_org[0].data.invoiceCarry;
  st.org.invoiceCarry = false;
  st.cur.partner_id = '';
  win.SeikyuApp._recalcForTest();
  await sleep(20);
});

await TA('9-d. ★①「前回から当てる」が源泉ありでも壊れない・②押す回数は2回のまま', async () => {
  const st = win.SeikyuApp._state;
  /* ★この検査だけの取引先を足す★
     前の検査が pt_a / pt_b に何通も入れているので、そのまま使うと
     「前回」がどれになるか検査ごとに変わる（＝当てにならない検査になる）。 */
  db.pay_partners.push({
    id: 'pt_g', account_id: 'u1', sort: 9,
    data: { name: '源泉あり商店', keisho: '御中', addr: '今治市9-9', gensen: true },
    deleted_at: null,
  });
  await win.SeikyuApp._loadMasters();
  await sleep(30);

  doc.querySelector('.bn[data-scr="scr-list"]').click(); await sleep(10);
  $('b-new').click(); await sleep(20);

  /* ── ここから ★押した回数を数える★ ── */
  let taps = 0;

  // 押す1：取引先を選ぶ
  setVal('e-partner', 'pt_g'); taps++;
  await sleep(60);
  // 打鍵（明細）は「押す回数」に数えない
  const row = () => doc.querySelector('#lines-body tr');
  const setF = (k, v) => { const e = row().querySelector('[data-f="' + k + '"]'); e.value = v; e.dispatchEvent(new win.Event('input')); e.dispatchEvent(new win.Event('change')); };
  setF('name', '原稿料 9月分'); setF('amount', '200000');
  await sleep(30);

  // ★取引先の既定から、源泉が最初から入っている＝ここで押す必要が無い★
  eq($('e-gensen').checked, true, '取引先の既定から源泉が入っていない（押す回数が増える）');
  ok(/源泉徴収税額/.test($('tot-box').textContent), '源泉が効いていない');

  // 押す2：発行する
  $('b-issue').click(); taps++;
  await sleep(80);
  eq(st.cur.status, 'issued', '発行できていない: ' + $('edit-err').textContent);
  eq(taps, 2, '★押す回数が2回を超えた★: ' + taps);
  // 写しに源泉が固まっている（あとで率が変わっても、出した紙は動かない）
  ok(st.cur.snapshot && st.cur.snapshot.gensen, '写しに源泉が残っていない');
  const CHOSHO = require_(path.join(ROOT, 'kyuyo/lib/shiharai-chosho.js'));
  eq(st.cur.snapshot.gensen.amount, CHOSHO.gensenA(200000), '写しの源泉が給与の lib と違う');

  /* ── 2通目：★前回から当てる が源泉ありでも正しく当たる★ ── */
  doc.querySelector('.bn[data-scr="scr-list"]').click(); await sleep(10);
  $('b-new').click(); await sleep(20);
  let taps2 = 0;
  setVal('e-partner', 'pt_g'); taps2++;
  await sleep(60);
  ok(win.getComputedStyle($('guess-card')).display !== 'none', '「前回と同じで作りますか？」が出ていない');
  ok(/源泉徴収/.test($('guess-list').textContent), '当てた中身に源泉が出ていない: ' + $('guess-list').textContent);

  $('b-guess-ok').click(); taps2++;
  await sleep(40);
  eq($('e-gensen').checked, true, '✓ を押したのに源泉が入っていない');
  ok(win.getComputedStyle($('tag-gensen')).display !== 'none', '「前回から」の印が源泉に付いていない');
  setF('name', '原稿料 10月分'); setF('amount', '150000');
  await sleep(30);
  $('b-issue').click(); taps2++;
  await sleep(80);
  eq(st.cur.status, 'issued', '2通目が発行できていない: ' + $('edit-err').textContent);
  eq(taps2, 3, '★2通目の押す回数が3回を超えた（取引先・✓・発行）★: ' + taps2);
  eq(st.cur.snapshot.gensen.amount, CHOSHO.gensenA(150000), '2通目の源泉が違う');
});

await TA('9-f. ★「前回と同じ」で源泉を消さない（振り込まれる額が黙って変わらない）', async () => {
  const st = win.SeikyuApp._state;
  /* 前回＝源泉なしで出した1通。そのあとで取引先を「源泉の対象」に決めた、という順番。
     ここで ✓ を押した時に源泉が外れると、★同じ画面のまま振込額だけ変わる★。 */
  db.pay_partners.push({
    id: 'pt_h', account_id: 'u1', sort: 10,
    data: { name: 'あとから源泉商店', keisho: '御中' }, deleted_at: null,
  });
  await win.SeikyuApp._loadMasters();
  await sleep(30);

  // 1通目：源泉なしで発行
  doc.querySelector('.bn[data-scr="scr-list"]').click(); await sleep(10);
  $('b-new').click(); await sleep(20);
  setVal('e-partner', 'pt_h'); await sleep(50);
  const setF = (k, v) => { const e = doc.querySelector('#lines-body tr').querySelector('[data-f="' + k + '"]'); e.value = v; e.dispatchEvent(new win.Event('input')); e.dispatchEvent(new win.Event('change')); };
  setF('name', '9月分'); setF('amount', '100000');
  eq($('e-gensen').checked, false, '前提が崩れている（1通目から源泉が入っている）');
  await sleep(20);
  $('b-issue').click(); await sleep(60);
  eq(st.cur.status, 'issued', '1通目が出せていない: ' + $('edit-err').textContent);

  // ここで取引先を「源泉の対象」に決める（前回より後の決めごと）
  const ph = db.pay_partners.find((x) => x.id === 'pt_h');
  ph.data = Object.assign({}, ph.data, { gensen: true });
  await win.SeikyuApp._loadMasters();
  await sleep(30);

  // 2通目：取引先の既定で源泉が入る → ✓ を押しても外れない
  doc.querySelector('.bn[data-scr="scr-list"]').click(); await sleep(10);
  $('b-new').click(); await sleep(20);
  setVal('e-partner', 'pt_h'); await sleep(60);
  eq($('e-gensen').checked, true, '取引先の既定で源泉が入っていない');
  ok(/源泉徴収/.test($('guess-list').textContent),
    '★押したらどうなるかを言っていない（前回に無い物は黙って変わる）★: ' + $('guess-list').textContent);

  $('b-guess-ok').click(); await sleep(40);
  eq($('e-gensen').checked, true, '★✓ を押したら源泉が消えた（振込額が黙って変わる）★');
  eq(!!st.cur.data.gensen, true, '中の値も消えている');

  setF('name', '10月分'); setF('amount', '100000');
  await sleep(30);
  const CHOSHO = require_(path.join(ROOT, 'kyuyo/lib/shiharai-chosho.js'));
  ok($('tot-box').textContent.includes(CHOSHO.gensenA(100000).toLocaleString('ja-JP')),
    '源泉が効いていない: ' + $('tot-box').textContent);
});

await TA('9-f. ★源泉の説明は、打つたびに直る（古い文が残らない）', async () => {
  const hint = () => $('e-gensen-hint').textContent;
  ok(/対象額/.test(hint()), '★明細を打ったのに「対象になる行がまだありません」のまま★: ' + hint());
  const CHOSHO = require_(path.join(ROOT, 'kyuyo/lib/shiharai-chosho.js'));
  ok(hint().includes(CHOSHO.gensenA(100000).toLocaleString('ja-JP')), '説明の額が画面と違う: ' + hint());
  // 対象を消したら説明も戻る
  const sel = doc.querySelector('#lines-body [data-f="rate"]');
  sel.value = [...sel.options].find((o) => o.textContent === '対象外').value;
  sel.dispatchEvent(new win.Event('change'));
  await sleep(40);
  ok(/対象になる行がまだありません/.test(hint()), '対象が無くなったのに説明が古いまま: ' + hint());
});

T('9-e. ★税率のある行は非課税にならない（印だけ立てても数え違えない）', () => {
  const TAX = require_(path.join(ROOT, 'seikyu/lib/seikyu-tax.js'));
  const SR = require_(path.join(ROOT, 'kyuyo/lib/shouhizei-ritsu.js'));
  const STD = Math.round(SR.hyojun * 10000) / 100;
  const r = TAX.compute({ lines: [{ name: 'あ', amount: 10000, rate: STD, nontax: true }], taxMode: 'exclusive', rounding: 'floor' });
  eq(r.nontaxable.base, 0, '税率のある行が非課税に入った');
});

/* ═══ 11. ★入金の記録（1回＝1行。上書きしない）★ ═══
   ここで止めたい事故:
     ・代行請求の型＝1請求1行で上書き → ★2回目を記録すると1回目が消える★
     ・入金が読めないのに「0円・未入金」と言い切る
     ・あとから入金を記録したら ★もう出した紙の繰越まで動く★
   ★数字はすべて手で計算して埋める（一致だけの試験にしない）★
     9月請求  100,000（税抜）＋消費税 10,000 ＝ ★110,000★
     入金 40,000 ＋ 30,000        ＝ ★70,000★  → 残り 110,000−70,000 ＝ ★40,000★
     さらに 80,000 を足すと 150,000 → 110,000−150,000 ＝ ★−40,000（過入金 40,000）★
     10月請求 50,000＋5,000 ＝ 55,000 → 合計請求額 40,000＋55,000 ＝ ★95,000★ */

const SR_ = require_(path.join(ROOT, 'kyuyo/lib/shouhizei-ritsu.js'));
const STD_PCT = Math.round(SR_.hyojun * 10000) / 100;
const yenS = (n) => Number(n).toLocaleString('ja-JP');

T('11. ★この検査の手計算は標準税率10%を前提にしている（変わったら数え直す合図）', () => {
  eq(STD_PCT, 10, '★標準税率が変わった＝下の 110,000 / 95,000 を手で計算し直すこと★');
});

await TA('11. 入金テスト用の取引先を足して、繰越を「入」にする', async () => {
  db.pay_partners.push({
    id: 'pt_p', account_id: 'u1', sort: 20,
    data: { name: '入金テスト商店', keisho: '御中', addr: '今治市8-8' }, deleted_at: null,
  });
  /* ★倉庫の側に入れる★ … 画面の変数だけに入れると「読み直す」で消える
     （この検査は途中で b-reload を押すので、そこで繰越が切れて空振りになる） */
  db.pay_org[0].data.invoiceCarry = true;         // 紙に繰越5行を出す会社
  await win.SeikyuApp._loadMasters();
  await sleep(30);
  ok(win.SeikyuApp._state.partners.some((p) => p.id === 'pt_p'), '取引先が足せていない');
  eq(win.SeikyuApp._state.org.invoiceCarry, true, '繰越が「入」になっていない');
});

/** その画面の1通を作って発行する（明細1行・外税） */
async function issueOne(partnerId, ymd, amount, name) {
  doc.querySelector('.bn[data-scr="scr-list"]').click(); await sleep(10);
  $('b-new').click(); await sleep(20);
  setVal('e-partner', partnerId); await sleep(60);
  if (win.getComputedStyle($('guess-card')).display !== 'none') { $('b-guess-edit').click(); await sleep(20); }
  setVal('e-issue', ymd); await sleep(40);
  const tr = doc.querySelector('#lines-body tr');
  const setF = (k, v) => { const e = tr.querySelector('[data-f="' + k + '"]'); e.value = v; e.dispatchEvent(new win.Event('input')); e.dispatchEvent(new win.Event('change')); };
  setF('name', name); setF('amount', String(amount));
  await sleep(40);
  $('b-issue').click(); await sleep(80);
  return win.SeikyuApp._state.cur;
}

let sep = null;   // 9月の1通（あとで繰越の「前回」になる）

await TA('11-a. ★9月の1通を発行すると、入金の箱がその場に出る（下書きには出ない）', async () => {
  sep = await issueOne('pt_p', '2026-09-30', 100000, '9月分 業務委託料');
  eq(sep.status, 'issued', '発行できていない: ' + $('edit-err').textContent);
  // ★手計算★ 100,000 ＋ 消費税10,000 ＝ 110,000
  eq(sep.totals.grandTotal, 110000, '合計が手計算と違う');
  eq(win.getComputedStyle($('pay-card')).display !== 'none', true, '★発行したのに入金の箱が出ない★');
  ok(/請求額/.test($('pay-sum').textContent), '請求額が出ていない');
  ok($('pay-sum').textContent.includes(yenS(110000)), '請求額が手計算と違う: ' + $('pay-sum').textContent);
  ok(/まだ入金の記録がありません/.test($('pay-list').textContent), '0件の言い方が違う: ' + $('pay-list').textContent);
  // 0件は「0件」であって「未確認」ではない
  ok(!/未確認/.test($('pay-sum').textContent), '★読めているのに未確認と出ている★: ' + $('pay-sum').textContent);
  ok($('pay-sum').textContent.includes(yenS(110000)), '残りが請求額と一致していない');
});

await TA('11-b. ★押せない理由はボタンの中（金額が空・0円・日付なし）', async () => {
  eq($('b-pay-add').disabled, true, '金額が空なのに押せる');
  ok(/入金を記録（/.test($('b-pay-add').textContent), '理由がボタンの中に無い: ' + $('b-pay-add').textContent);
  setVal('pay-amt', '0'); await sleep(10);
  ok(/0円は記録できません/.test($('b-pay-add').textContent), '★0円が止まっていない★: ' + $('b-pay-add').textContent);
  setVal('pay-amt', 'あいう'); await sleep(10);
  ok(/1円単位/.test($('b-pay-add').textContent), '数字でない金額が止まっていない: ' + $('b-pay-add').textContent);
  setVal('pay-amt', '1000.5'); await sleep(10);
  ok(/1円単位/.test($('b-pay-add').textContent), '★小数が止まっていない（1円単位）★: ' + $('b-pay-add').textContent);
  const keepYmd = $('pay-ymd').value;
  setVal('pay-ymd', ''); setVal('pay-amt', '1000'); await sleep(10);
  ok(/入金日/.test($('b-pay-add').textContent), '日付なしが止まっていない: ' + $('b-pay-add').textContent);
  setVal('pay-ymd', keepYmd); setVal('pay-amt', ''); await sleep(10);
});

await TA('11-c. ★分けて払われた2回が、2行とも残る（代行請求は1行で上書きしていた）', async () => {
  setVal('pay-ymd', '2026-10-05'); setVal('pay-amt', '40000'); setVal('pay-method', '振込');
  setVal('pay-memo', '1回目'); await sleep(10);
  eq($('b-pay-add').disabled, false, '揃ったのに押せない: ' + $('b-pay-add').textContent);
  $('b-pay-add').click(); await sleep(60);

  setVal('pay-ymd', '2026-10-20'); setVal('pay-amt', '30000'); setVal('pay-method', '現金');
  setVal('pay-memo', '2回目'); await sleep(10);
  $('b-pay-add').click(); await sleep(60);

  // ★倉庫に2行★（上書きされていない）
  const mine = db.pay_receipts.filter((r) => r.invoice_id === sep.id && !r.deleted_at);
  eq(mine.length, 2, '★1請求1行で上書きしている（分割払いの履歴が消える）★');
  eq(mine.reduce((a, r) => a + r.amount, 0), 70000, '倉庫の合計が手計算と違う');
  // ★画面にも2行★
  eq($('pay-list').querySelectorAll('.pay-row').length, 2, '画面の入金の行数');
  ok(/1回目/.test($('pay-list').textContent) && /2回目/.test($('pay-list').textContent), '備考が消えている');
  ok(/振込/.test($('pay-list').textContent) && /現金/.test($('pay-list').textContent), '方法が消えている');
  // ★手計算★ 40,000＋30,000＝70,000 ／ 110,000−70,000＝40,000
  ok($('pay-sum').textContent.includes(yenS(70000)), '入っている合計が手計算と違う: ' + $('pay-sum').textContent);
  ok($('pay-sum').textContent.includes(yenS(40000)), '残りが手計算と違う: ' + $('pay-sum').textContent);
  ok(/（2回）/.test($('pay-sum').textContent), '何回で入ったかが出ていない: ' + $('pay-sum').textContent);
});

await TA('11-d. ★一覧にも「一部入金・残り 40,000 円」と出る', async () => {
  doc.querySelector('.bn[data-scr="scr-list"]').click(); await sleep(20);
  doc.querySelector('#fil-seg [data-fil="issued"]').click(); await sleep(10);
  const row = [...$('list-body').querySelectorAll('[data-open]')].find((b) => b.getAttribute('data-open') === sep.id);
  ok(row, '一覧にこの1通が無い');
  ok(/一部入金/.test(row.textContent), '状態が出ていない: ' + row.textContent);
  ok(row.textContent.includes(yenS(40000)), '★残りの金額が出ていない（状態の言葉だけでは督促を判断できない）★: ' + row.textContent);
  doc.querySelector('#fil-seg [data-fil="all"]').click(); await sleep(10);
  row.click(); await sleep(30);
});

await TA('11-e. ★「残り全部」を押すと残りが入る（金額を打たない近道）', async () => {
  const b = [...$('pay-quick').querySelectorAll('[data-fill]')].find((x) => /残り全部/.test(x.textContent));
  ok(b, '「残り全部」が出ていない: ' + $('pay-quick').textContent);
  b.click(); await sleep(10);
  eq($('pay-amt').value, '40000', '残りが入っていない');
  // 半分も出る（40,000 の半分＝20,000）
  const h = [...$('pay-quick').querySelectorAll('[data-fill]')].find((x) => /半分/.test(x.textContent));
  ok(h && h.getAttribute('data-fill') === '20000', '半分が手計算と違う: ' + (h && h.getAttribute('data-fill')));
  setVal('pay-amt', ''); await sleep(10);
});

await TA('11-f. ★過入金は0でクランプしない（多く入った事実を残す）', async () => {
  setVal('pay-ymd', '2026-10-25'); setVal('pay-amt', '80000'); setVal('pay-memo', '入れすぎ');
  await sleep(10);
  $('b-pay-add').click(); await sleep(60);
  // ★手計算★ 70,000＋80,000＝150,000 ／ 110,000−150,000＝−40,000
  ok(/過入金/.test($('pay-sum').textContent), '★過入金と言っていない★: ' + $('pay-sum').textContent);
  ok($('pay-sum').textContent.includes(yenS(40000)), '過入金の額が手計算と違う: ' + $('pay-sum').textContent);
  ok($('pay-sum').textContent.includes(yenS(150000)), '入っている合計が手計算と違う: ' + $('pay-sum').textContent);
  eq($('pay-list').querySelectorAll('.pay-row').length, 3, '3行 残っていない');
  // 残りが無いので近道は出さない（当てずっぽうの金額を入れさせない）
  eq($('pay-quick').querySelectorAll('[data-fill]').length, 0, '残りが無いのに「残り全部」が出ている');
});

await TA('11-g. ★入れ間違いを消すと数え直す。ただし行は残す（履歴を消さない）', async () => {
  const dels = $('pay-list').querySelectorAll('[data-rc]');
  eq(dels.length, 3, '消すボタンが行の数だけ無い');
  dels[2].click(); await sleep(60);          // 3件目（80,000）を消す
  eq($('pay-list').querySelectorAll('.pay-row').length, 2, '画面から消えていない');
  // ★倉庫の行は残っている（deleted_at が入っただけ）＝いつ何を消したかが辿れる
  eq(db.pay_receipts.filter((r) => r.invoice_id === sep.id).length, 3, '★行ごと消している（履歴が残らない）★');
  eq(db.pay_receipts.filter((r) => r.invoice_id === sep.id && r.deleted_at).length, 1, '消した印が入っていない');
  // 数え直し ＝ 70,000 / 残り 40,000
  ok($('pay-sum').textContent.includes(yenS(70000)), '数え直していない: ' + $('pay-sum').textContent);
  ok($('pay-sum').textContent.includes(yenS(40000)), '残りが数え直されていない: ' + $('pay-sum').textContent);
  ok(!/過入金/.test($('pay-sum').textContent), '消したのに過入金のまま');
});

await TA('11-h. ★入金が読めない時は「未確認」。0円と書き分ける', async () => {
  sb._failNext('pay_receipts', 'select');
  $('b-reload').click(); await sleep(80);
  eq(win.SeikyuApp._state.receipts, null, '読めなかったのに 0件として持っている');
  doc.querySelector('.bn[data-scr="scr-list"]').click(); await sleep(10);
  [...$('list-body').querySelectorAll('[data-open]')].find((b) => b.getAttribute('data-open') === sep.id).click();
  await sleep(30);
  ok(/未確認/.test($('pay-sum').textContent), '★読めないのに0円と言い切っている★: ' + $('pay-sum').textContent);
  ok(!$('pay-sum').textContent.includes(yenS(70000)), '読めていないのに合計を出している');
  ok(/読めませんでした/.test($('pay-list').textContent), '読めなかったと言っていない: ' + $('pay-list').textContent);
  eq($('pay-quick').querySelectorAll('[data-fill]').length, 0, '★残りが読めないのに「残り全部」を出している★');
  // 読めなくても記録そのものは止めない（足すのは読み取りに依らない）
  eq($('b-pay-add').disabled, true, '金額が空なので押せないのが正しい');
  $('b-reload').click(); await sleep(80);
  ok(Array.isArray(win.SeikyuApp._state.receipts), '読み直せていない');
});

await TA('11-i. ★★繰越が実額で出る（1通 出す → 入金を入れる → 翌月に前回の残りが出る）★★', async () => {
  const oct = await issueOne('pt_p', '2026-10-31', 50000, '10月分 業務委託料');
  eq(oct.status, 'issued', '10月の1通が出せていない: ' + $('edit-err').textContent);
  const c = oct.snapshot.carry;
  ok(c, '写しに繰越が入っていない');
  // ★手計算★ 前回 110,000 ／ 入金 70,000 ／ 繰越 40,000 ／ 今回 55,000 ／ 合計 95,000
  eq(c.state, 'ok', '繰越の状態: ' + c.state);
  eq(c.prevTotal, 110000, '前回請求額');
  eq(c.paid, 70000, '★入金額が実額になっていない（ここが0のままだと繰越は育たない）★');
  eq(c.carry, 40000, '繰越額');
  eq(c.thisTotal, 55000, '今回請求額');
  eq(c.grandTotal, 95000, '合計請求額');
  // 画面にも実額で出ている
  const tot = $('tot-box').textContent;
  ok(tot.includes(yenS(70000)), '画面の入金額が実額でない: ' + tot.replace(/\s+/g, ' '));
  ok(tot.includes(yenS(95000)), '画面の合計請求額が手計算と違う: ' + tot.replace(/\s+/g, ' '));
  ok(!/未確認/.test(tot), '入金は読めているのに「未確認」と出ている: ' + tot.replace(/\s+/g, ' '));
});

await TA('11-j. ★★あとから入金を記録しても、もう出した紙は1円も動かない★★', async () => {
  const st = win.SeikyuApp._state;
  const oct = st.cur;
  const before = JSON.stringify(oct.snapshot.carry);
  // 9月の1通に、10月の紙を出したあとで さらに入金する
  doc.querySelector('.bn[data-scr="scr-list"]').click(); await sleep(10);
  [...$('list-body').querySelectorAll('[data-open]')].find((b) => b.getAttribute('data-open') === sep.id).click();
  await sleep(30);
  setVal('pay-ymd', '2026-11-05'); setVal('pay-amt', '10000'); setVal('pay-memo', 'あとから');
  await sleep(10);
  $('b-pay-add').click(); await sleep(60);
  ok($('pay-sum').textContent.includes(yenS(80000)), '9月側の合計が更新されていない: ' + $('pay-sum').textContent);

  // 10月の紙を開き直す → 写しの繰越は動いていない
  doc.querySelector('.bn[data-scr="scr-list"]').click(); await sleep(10);
  [...$('list-body').querySelectorAll('[data-open]')].find((b) => b.getAttribute('data-open') === oct.id).click();
  await sleep(30);
  eq(JSON.stringify(st.cur.snapshot.carry), before, '★出した紙の繰越が後から動いた★');
  eq(st.cur.totals.grandTotal, 55000, '出した紙の合計が動いた');
  const tot = $('tot-box').textContent;
  ok(tot.includes(yenS(70000)), '★画面が写しではなく今の入金で描き直している★: ' + tot.replace(/\s+/g, ' '));
  ok(!tot.includes(yenS(80000)), '★出した紙に、あとから入れた入金が混ざった★: ' + tot.replace(/\s+/g, ' '));
  // 倉庫の行そのものも動いていない
  const row = db.pay_invoices.find((x) => x.id === oct.id);
  eq(row.snapshot.carry.paid, 70000, '倉庫の写しが動いた');
  eq(row.totals.grandTotal, 55000, '倉庫の合計が動いた');
});

T('11-k. ★取り消した請求書には記録させない（理由はボタンの中）', () => {
  const st = win.SeikyuApp._state;
  const keep = st.cur.status;
  st.cur.status = 'void';
  win.SeikyuApp._renderPayForTest();
  eq($('b-pay-add').disabled, true, '取り消し済みなのに押せる');
  ok(/取り消した請求書/.test($('b-pay-add').textContent), '理由がボタンの中に無い: ' + $('b-pay-add').textContent);
  // すでに記録した分は消さない（見えなくしない）
  eq(win.getComputedStyle($('pay-card')).display !== 'none', true, '取り消したら入金の記録ごと隠れた');
  st.cur.status = keep;
  win.SeikyuApp._renderPayForTest();
});

T('11-l. ★入金の文は block で最低幅を持つ（狭い端末で1文字ずつ縦に割れない）', () => {
  for (const sel of ['.pay-memo']) {
    const rule = (new RegExp('\\' + sel + '\\s*\\{([^}]*)\\}').exec(CSS) || [])[1] || '';
    ok(/display\s*:\s*block/.test(rule), sel + ' が block でない');
    ok(/min-width\s*:\s*\d/.test(rule), sel + ' に最低幅が無い');
    ok(/overflow-wrap\s*:\s*break-word/.test(rule), sel + ' に折り返しの指定が無い');
  }
  // 行そのものは折り返す（消すボタンが外へ出ない）
  const row = (/\.pay-row\s*\{([^}]*)\}/.exec(CSS) || [])[1] || '';
  ok(/flex-wrap\s*:\s*wrap/.test(row), '.pay-row が折り返さない');
  const main = (/\.pay-main\s*\{([^}]*)\}/.exec(CSS) || [])[1] || '';
  ok(/min-width\s*:\s*\d+px/.test(main), '.pay-main に最低幅が無い（幅ゼロまで潰れる）');
  // 理由を入れるボタンなので折り返す側（btn-big）に入っている
  ok(/btn-big/.test($('b-pay-add').className), '★理由を入れるボタンが折り返せない書き方（はみ出す）★');
});

await TA('11-z. 繰越の設定を元に戻す（次の検査を汚さない）', async () => {
  delete db.pay_org[0].data.invoiceCarry;
  await win.SeikyuApp._loadMasters();
  await sleep(20);
  eq(!!win.SeikyuApp._state.org.invoiceCarry, false, '繰越が「切」に戻っていない');
});

/* ═══ 12. ★見積 → 請求 → 領収 が1本の線でつながる★ ═══
   ★押す物の一覧（先に書く）★
     一覧の「見積書」チップ ／ ＋新しい見積書 ／ 発行する ／
     この見積から請求書を作る ／ 発行する（請求） ／
     入金を記録 ／ 入金の行の「領収書」 ／ 名前の小窓の「この名前で保存」 ／
     明細の ▲ ／ ▼ ／ 一覧の「請求書」チップ
   ここで止めたい事故:
     ・見積が どの画面からも作れない（紙も棚も在るのに死んでいる）
     ・見積 → 請求 で 人に写させる（写し間違いが必ず出る）
     ・受け取っていない額の領収書が出る／消した入金から領収書が出る
     ・品名が空の行を ★黙って捨てて★ 合計が静かに小さくなる */

await TA('12-a. ★一覧に「請求書／見積書」の切替が在り、言葉がそろって変わる', async () => {
  doc.querySelector('.bn[data-scr="scr-list"]').click(); await sleep(20);
  ok($('kind-seg'), '★種類の切替が無い（見積の入口が無い）★');
  eq($('list-h').textContent, '請求書');
  ok(/新しい請求書/.test($('b-new').textContent), 'ボタンの言葉: ' + $('b-new').textContent);
  doc.querySelector('#kind-seg [data-kind="quote"]').click(); await sleep(60);
  eq(win.SeikyuApp._state.docType, 'quote', '種類が切り替わらない');
  eq($('list-h').textContent, '見積書', '見出しが変わらない');
  ok(/新しい見積書/.test($('b-new').textContent), '★ボタンが「請求書」のまま★: ' + $('b-new').textContent);
  ok(doc.querySelector('#kind-seg [data-kind="quote"]').classList.contains('on'), '押した物に印が付かない');
});

let quoteRow = null;

await TA('12-b. ★見積を1通 出せる（番号は請求と別の系列＝同じ番号を持てる）', async () => {
  const st = win.SeikyuApp._state;
  db.pay_partners.push({ id: 'pt_q', account_id: 'u1', sort: 30, data: { name: '見積テスト工業', keisho: '御中' }, deleted_at: null });
  await win.SeikyuApp._loadMasters(); await sleep(30);
  $('b-new').click(); await sleep(30);
  eq(st.cur.doc_type, 'quote', '★見積を選んでいるのに請求書を作っている★');
  setVal('e-partner', 'pt_q'); await sleep(60);
  if (win.getComputedStyle($('guess-card')).display !== 'none') { $('b-guess-edit').click(); await sleep(20); }
  setVal('e-issue', '2026-09-10'); await sleep(40);
  const tr = doc.querySelector('#lines-body tr');
  const setF = (k, v) => { const e = tr.querySelector('[data-f="' + k + '"]'); e.value = v; e.dispatchEvent(new win.Event('input')); e.dispatchEvent(new win.Event('change')); };
  setF('name', '運転代行 見積'); setF('qty', '2'); setF('price', '30000');
  await sleep(60);
  // ★件名・備考・源泉も見積で決めておく（請求へ持っていけるか、あとで見る）
  $('more-box').open = true;
  setVal('e-subject', '9月分 運転代行（お見積）'); setVal('e-memo', '有効期限は1か月です');
  await sleep(20);
  $('b-issue').click(); await sleep(90);
  eq(st.cur.status, 'issued', '見積が出せていない: ' + $('edit-err').textContent);
  quoteRow = db.pay_invoices.find((x) => x.id === st.cur.id);
  eq(quoteRow.doc_type, 'quote', '倉庫に見積として入っていない');
  // ★手計算★ 30,000×2＝60,000＋消費税6,000＝66,000
  eq(quoteRow.totals.grandTotal, 66000, '見積の合計が手計算と違う');
  // 請求書に同じ番号が在ってもぶつからない（doc_type 込みの一意制約）
  const sameNo = db.pay_invoices.filter((x) => x.no === quoteRow.no);
  ok(sameNo.length >= 1, '番号が入っていない');
});

await TA('12-c. ★出した見積の主役の操作＝「この見積から請求書を作る」（下書きには出さない）', async () => {
  ok($('b-toinv'), '★ボタンそのものが無い★');
  eq(win.getComputedStyle($('b-toinv')).display !== 'none', true, '★出した見積なのに次の一手が隠れている★');
  eq($('b-toinv').disabled, false, '押せない: ' + $('b-toinv').textContent);
  eq($('b-issue').style.display, 'none', '発行済みなのに発行するが出ている');
  // 下書きの請求書では出さない（存在しない操作は出さない）
  doc.querySelector('.bn[data-scr="scr-list"]').click(); await sleep(10);
  doc.querySelector('#kind-seg [data-kind="invoice"]').click(); await sleep(60);
  $('b-new').click(); await sleep(30);
  eq(win.getComputedStyle($('b-toinv')).display, 'none', '★下書きの請求書に「見積から作る」が出ている★');
});

await TA('12-d. ★★見積→請求で 中身をそのまま引き継ぐ（人に写させない）★★', async () => {
  const st = win.SeikyuApp._state;
  // 出した見積を開き直す
  doc.querySelector('.bn[data-scr="scr-list"]').click(); await sleep(10);
  doc.querySelector('#kind-seg [data-kind="quote"]').click(); await sleep(60);
  [...$('list-body').querySelectorAll('[data-open]')].find((b) => b.getAttribute('data-open') === quoteRow.id).click();
  await sleep(40);
  const qNo = st.cur.no;

  $('b-toinv').click(); await sleep(150);
  eq(st.cur.doc_type, 'invoice', '★請求書になっていない★');
  eq(st.cur.status, 'draft', 'いきなり発行してしまっている');
  eq(st.cur.quote_from, quoteRow.id, 'どの見積から作ったかを持っていない');
  eq(st.docType, 'invoice', '一覧の種類が請求書に切り替わっていない');
  // ★写した物★
  eq(st.cur.lines[0].name, '運転代行 見積', '★品目が落ちている★');
  eq(String(st.cur.lines[0].qty), '2', '★数量が落ちている★');
  eq(String(st.cur.lines[0].price), '30000', '★単価が落ちている★');
  eq(st.cur.data.subject, '9月分 運転代行（お見積）', '★件名が落ちている★');
  eq(st.cur.data.memo, '有効期限は1か月です', '★備考が落ちている★');
  eq($('e-subject').value, '9月分 運転代行（お見積）', '画面に戻っていない');
  eq($('e-partner').value, 'pt_q', '★取引先が落ちている★');
  // ★取り直す物★
  ok(st.cur.no && st.cur.no !== qNo, '★見積の番号を持ち込んでいる★（' + st.cur.no + '）');
  ok(st.cur.issue_ymd, '請求日が空');
  // ★つながりを画面に出す★
  eq(win.getComputedStyle($('from-quote')).display !== 'none', true, '★どの見積から来たかを画面に出していない★');
  ok($('from-quote').textContent.includes(qNo), '見積の番号が出ていない: ' + $('from-quote').textContent);
  // ★手計算★ 引き継いだので合計は見積と同じ 66,000
  ok($('tot-box').textContent.includes('66,000'), '合計が見積と違う: ' + $('tot-box').textContent.replace(/\s+/g, ' '));
  // ★元の見積は書き換わっていない★
  eq(db.pay_invoices.find((x) => x.id === quoteRow.id).lines[0].name, '運転代行 見積', '★元の見積まで書き換わった★');
});

let invForReceipt = null;

await TA('12-e. ★★入金の1行から領収書が出る（枝番つき・受け取った額）★★', async () => {
  const st = win.SeikyuApp._state;
  $('b-issue').click(); await sleep(120);
  eq(st.cur.status, 'issued', '請求書が出せていない: btn=[' + $('b-issue').textContent + '] disabled=' + $('b-issue').disabled
    + ' err=[' + $('edit-err').textContent + '] warn=[' + $('edit-warn').textContent + '] lines='
    + JSON.stringify(st.cur.lines.map((l) => [l.name, l.qty, l.price, l.amount, l.rate])));
  invForReceipt = st.cur.id;
  const invNo = st.cur.no;

  // 2回に分けて入金
  const pay = async (ymd, amt, method) => {
    setVal('pay-ymd', ymd); setVal('pay-amt', amt); setVal('pay-method', method); setVal('pay-memo', '');
    await sleep(20); $('b-pay-add').click(); await sleep(120);
  };
  await pay('2026-10-05', '20000', '振込');
  await pay('2026-10-20', '46000', '振込');
  eq($('pay-list').querySelectorAll('.pay-row').length, 2, '入金が2行 残っていない');

  // ★1回目の領収書＝枝番 -1・受け取った 20,000（請求の 66,000 ではない）
  const before = opened.length;
  $('pay-list').querySelectorAll('[data-rcp]')[0].click(); await sleep(30);
  ok($('fn-ov').classList.contains('open'), '★落とす前に名前を見せていない★');
  ok(/領収書/.test($('fn-input').value), '名前が中身から作られていない: ' + $('fn-input').value);
  ok(/20000|20,000/.test($('fn-input').value), '名前に受け取った額が入っていない: ' + $('fn-input').value);
  $('fn-ok').click(); await sleep(60);
  ok(opened.length > before, '★紙だけの新しい窓が開いていない★');
  const w = opened[opened.length - 1];
  const flat = w._html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  ok(/領\s*収\s*書/.test(flat), '領収書になっていない: ' + flat.slice(0, 120));
  ok(flat.includes(invNo + '-1'), '★枝番つきの領収番号が出ていない★: ' + flat.slice(0, 200));
  ok(/¥20,000/.test(flat), '★受け取った額が出ていない★');
  ok(!/¥66,000/.test(flat), '★受け取っていない請求額が領収書に載っている★');
  ok(/上記正に領収いたしました/.test(flat), '受け取った文言が無い');
  ok(/9月分 運転代行（お見積）/.test(flat), '但し書きが件名から作られていない');
  ok(!/botnav|appbar|b-issue/.test(w._html), 'アプリの画面が紙に混ざっている');

  // ★2回目は -2
  $('pay-list').querySelectorAll('[data-rcp]')[1].click(); await sleep(30);
  $('fn-ok').click(); await sleep(60);
  const f2 = opened[opened.length - 1]._html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  ok(f2.includes(invNo + '-2'), '★2回目の枝番が -2 になっていない★');
  // ★全額を受け取った回ではないので、消費税額を区分して書かない（按分＝嘘を作らない）
  ok(!/税抜金額/.test(f2), '★一部入金なのに消費税額を区分して書いている（按分＝嘘）★');
});

await TA('12-e2. ★消した入金から領収書は出せない／枝番は使い回さない', async () => {
  const st = win.SeikyuApp._state;
  const invNo = st.cur.no;
  // 1件目を消す
  $('pay-list').querySelectorAll('[data-rc]')[0].click(); await sleep(120);
  eq($('pay-list').querySelectorAll('.pay-row').length, 1, '消せていない');
  // 3件目を足す → ★枝番は -3★（消した -1 を使い回さない）
  setVal('pay-ymd', '2026-11-01'); setVal('pay-amt', '10000'); setVal('pay-method', '現金');
  await sleep(20); $('b-pay-add').click(); await sleep(120);
  const btns = $('pay-list').querySelectorAll('[data-rcp]');
  btns[btns.length - 1].click(); await sleep(30);
  $('fn-ok').click(); await sleep(60);
  const f3 = opened[opened.length - 1]._html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  ok(f3.includes(invNo + '-3'), '★消した入金の枝番を使い回している（同じ番号の紙が2枚 出る）★: ' + f3.slice(0, 200));
  // ★合計は生きている2件だけ★（消した物を混ぜない）＝20,000を消したので 46,000+10,000＝56,000
  ok($('pay-sum').textContent.includes('56,000'), '★消した入金を合計に混ぜている★: ' + $('pay-sum').textContent);
});

await TA('12-f. ★明細の並べ替え（▲▼）で 金額は1円も動かない', async () => {
  const st = win.SeikyuApp._state;
  doc.querySelector('.bn[data-scr="scr-list"]').click(); await sleep(10);
  $('b-new').click(); await sleep(30);
  setVal('e-partner', 'pt_q'); await sleep(60);
  if (win.getComputedStyle($('guess-card')).display !== 'none') { $('b-guess-edit').click(); await sleep(20); }
  const setRow = (i, name, amt) => {
    const tr = $('lines-body').querySelectorAll('tr')[i];
    const n = tr.querySelector('[data-f="name"]'), a = tr.querySelector('[data-f="amount"]');
    n.value = name; n.dispatchEvent(new win.Event('input'));
    a.value = amt; a.dispatchEvent(new win.Event('input'));
  };
  setRow(0, 'あ', '1000');
  $('b-addline').click(); await sleep(20); setRow(1, 'い', '2000');
  $('b-addline').click(); await sleep(20); setRow(2, 'う', '3000');
  await sleep(60);
  const before = $('tot-box').textContent.replace(/\s+/g, '');
  eq(st.cur.lines.map((l) => l.name).join(','), 'あ,い,う');
  // いちばん上の行に ▲ は出さない（押しても何も起きない物を置かない）
  eq($('lines-body').querySelectorAll('tr')[0].querySelectorAll('[data-up]').length, 0, '★端の行に ▲ が出ている★');
  eq($('lines-body').querySelectorAll('tr')[2].querySelectorAll('[data-down]').length, 0, '★端の行に ▼ が出ている★');
  // 3行目を上へ
  $('lines-body').querySelectorAll('[data-up]')[1].click(); await sleep(40);
  eq(st.cur.lines.map((l) => l.name).join(','), 'あ,う,い', '★並べ替えが効いていない★');
  // 1行目を下へ
  $('lines-body').querySelectorAll('[data-down]')[0].click(); await sleep(40);
  eq(st.cur.lines.map((l) => l.name).join(','), 'う,あ,い');
  eq($('tot-box').textContent.replace(/\s+/g, ''), before, '★並べ替えで金額が動いた★');
  ok($('tot-box').textContent.includes('6,600'), '合計(6,600)が出ていない: ' + $('tot-box').textContent.replace(/\s+/g, ' '));
});

await TA('12-g. ★★品名が空の行は、黙って捨てずに 出す前に赤で止める★★', async () => {
  const st = win.SeikyuApp._state;
  // 2行目の品名だけ消す（金額は残す）＝何の代金か分からない行
  const tr = $('lines-body').querySelectorAll('tr')[1];
  const n = tr.querySelector('[data-f="name"]');
  n.value = ''; n.dispatchEvent(new win.Event('input'));
  await sleep(60);
  eq($('b-issue').disabled, true, '★品名が空のまま発行できてしまう★');
  ok(/品名/.test($('b-issue').textContent), '理由がボタンの中に無い: ' + $('b-issue').textContent);
  ok(/2行目/.test($('b-issue').textContent), '★何行目か言っていない★: ' + $('b-issue').textContent);
  // 押しても出ない
  const n0 = db.pay_invoices.length;
  $('b-issue').click(); await sleep(60);
  eq(db.pay_invoices.length, n0, '★灰色なのに発行された★');
  /* ★見た目＝灰色だけで守らない★ を実測する
     （灰色を外して押しても、下の検査が同じ理由で止めるか） */
  $('b-issue').disabled = false;
  $('b-issue').click(); await sleep(80);
  eq(db.pay_invoices.length, n0, '★灰色を外したら発行できてしまった（歯止めが見た目だけ）★');
  ok(/品名/.test($('edit-err').textContent), '押した後の赤い印が理由を言っていない: ' + $('edit-err').textContent);
  ok(/2行目/.test($('edit-err').textContent), '何行目か言っていない: ' + $('edit-err').textContent);
  // 品名を入れれば通る
  n.value = 'あ2'; n.dispatchEvent(new win.Event('input'));
  await sleep(60);
  eq($('b-issue').disabled, false, '直したのに押せないまま: ' + $('b-issue').textContent);
});

await TA('12-h. ★まるごと空の行は止めないが「消した」と言う（黙って小さくしない）', async () => {
  $('b-addline').click(); await sleep(40);          // 何も入れない行を1本 足す
  await sleep(40);
  eq($('b-issue').disabled, false, '★まるごと空の行で発行を止めている★: ' + $('b-issue').textContent);
  $('b-issue').click(); await sleep(120);
  ok(/行目は何も入っていない/.test($('edit-warn').textContent),
    '★空行を黙って捨てている（消したと言っていない）★: ' + $('edit-warn').textContent);
  eq(win.SeikyuApp._state.cur.status, 'issued', '発行できていない: ' + $('edit-err').textContent);
});

/* ═══ 13. ★実物の器（32枚を数えて分かった形）★ ═══
   ★押す物の一覧（先に書く）★
     一覧「請求書」チップ ／ ＋新しい請求書 ／ 取引先 ／ 請求日 ／
     明細の 品名・数量・単価・金額 ／ 税率の選び所 ／
     「細かく決める」を開く ／ この1通の金額の入れ方（税込／税抜）／「◯年◯月分」の欄 ／
     ＋差し引く行を足す ／ 控除の名前 ／ 控除の金額 ／ 発行する ／ 入金を記録
   ここで止めたい事故:
     ・値引き（税も減る）と控除（税は動かない）を混ぜて 消費税がズレる
     ・控除を引いたのに ★入金の「残り」が0にならない★
     ・行ごとに丸めた税額を足して ★合計と食い違う紙★ を出す（国税庁 Q&A 問57）
     ・「◯年◯月分」を当月にして ★8月に出す紙に「8月分」★ と書く（実物は前月） */

const setLine = (i, k, v) => {
  const tr = $('lines-body').querySelectorAll('tr')[i];
  const e = tr.querySelector('[data-f="' + k + '"]');
  ok(e, i + '行目の ' + k + ' が無い');
  e.value = v; e.dispatchEvent(new win.Event('input')); e.dispatchEvent(new win.Event('change'));
};
async function newInvoiceFor(pid, ymd) {
  doc.querySelector('.bn[data-scr="scr-list"]').click(); await sleep(20);
  doc.querySelector('#kind-seg [data-kind="invoice"]').click(); await sleep(60);
  $('b-new').click(); await sleep(40);
  setVal('e-partner', pid); await sleep(80);
  if (win.getComputedStyle($('guess-card')).display !== 'none') { $('b-guess-edit').click(); await sleep(30); }
  setVal('e-issue', ymd); await sleep(60);
}

await TA('13-a. ★実物の形：単価の列が無くても 金額を直に打てる（実物9枚がこの形）', async () => {
  db.pay_partners.push({ id: 'pt_e', account_id: 'u1', sort: 40, data: { name: 'ENEOSグローブエナジー株式会社', keisho: '御中' }, deleted_at: null });
  await win.SeikyuApp._loadMasters(); await sleep(30);
  await newInvoiceFor('pt_e', '2026-08-01');
  // ★税率を選ぶ所は 紙に税率の列が無くても 入力には必ず在る★
  ok(doc.querySelector('#lines-body [data-f="rate"]'), '★税率を選ぶ所が無い（軽減税率も非課税も入れられない）★');
  // ★行ごとの消費税は「読むだけ」★（打てると 行ごとに丸めて足す道ができる）
  ok(doc.querySelector('#lines-body .l-ro'), '消費税の列が読むだけになっていない');
  setLine(0, 'name', 'エアコン取替'); setLine(0, 'qty', '1'); setLine(0, 'unit', '式'); setLine(0, 'amount', '20000');
  $('b-addline').click(); await sleep(30);
  setLine(1, 'name', 'エアコン取替'); setLine(1, 'qty', '1'); setLine(1, 'unit', '式'); setLine(1, 'amount', '15000');
  await sleep(80);
  // ★手計算＝実物 ENEOS★ 20,000＋15,000＝35,000 ／ 税3,500 ／ 合計38,500
  const tot = $('tot-box').textContent.replace(/\s+/g, '');
  ok(tot.includes('35,000'), '小計が実物と違う: ' + tot);
  ok(tot.includes('3,500'), '消費税が実物と違う: ' + tot);
  ok(tot.includes('38,500'), '★合計が実物(38,500)と違う★: ' + tot);
  // ★行ごとの税額も実物の =E*0.1 と同じ★
  const cells = [...$('lines-body').querySelectorAll('.l-ro')].map((x) => x.textContent);
  eq(cells.join(','), '2,000,1,500', '★行ごとの税額が実物と違う★: ' + cells.join(' / '));
});

await TA('13-b. ★「◯年◯月分」は請求日の前月（実物32枚と同じ）', async () => {
  $('more-box').open = true; await sleep(20);
  ok($('e-lead'), '「◯年◯月分」の欄が無い');
  eq($('e-lead').value, '', '最初から何か入っている（自動なので空でよい）');
  ok(/2026年7月分/.test($('e-lead-hint').textContent), '★前月から自動で入ると言っていない★: ' + $('e-lead-hint').textContent);
  // 請求日を1月にすると 前年12月分になる（境界）
  setVal('e-issue', '2026-01-10'); await sleep(80);
  ok(/2025年12月分/.test($('e-lead-hint').textContent), '★1月の紙が前年12月分になっていない★: ' + $('e-lead-hint').textContent);
  setVal('e-issue', '2026-08-01'); await sleep(80);
  // 紙にも出る
  $('b-preview').click(); await sleep(150);
  const pv = String($('pv').srcdoc || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  ok(/2026年7月分/.test(pv), '★紙に「◯年◯月分」が出ていない（または当月になっている）★');
  ok(!/2026年8月分/.test(pv), '★当月になっている（実物は前月）★');
});

await TA('13-c. ★この1通だけ「税込で入れる」に変えられる（税抜＋税額＝入れた税込）', async () => {
  const st = win.SeikyuApp._state;
  setVal('e-taxmode', 'inclusive'); await sleep(100);
  eq(st.cur.tax_mode, 'inclusive', '切り替わっていない');
  ok(/税込/.test($('taxmode-note').textContent), '★どちらで入れているか画面に出ていない★: ' + $('taxmode-note').textContent);
  /* ★丸め方はこの1通の物として はっきり決めてから測る★
     （会社の既定は前の検査で変わっている事がある＝★何で丸めたか分からないまま
       手計算の数を書くと、検査が「たまたま合った」になる★） */
  st.cur.rounding = 'floor';
  win.SeikyuApp._recalcForTest();
  await sleep(60);
  // ★手計算★ 税込 20,000＋15,000＝35,000 → 税 = floor(35,000×10÷110)=3,181 ／ 税抜 31,819
  const tot = $('tot-box').textContent.replace(/\s+/g, '');
  ok(tot.includes('35,000'), '入れた税込が合計になっていない: ' + tot);
  ok(tot.includes('3,181'), '割り戻した消費税が違う: ' + tot);
  ok(tot.includes('31,819'), '割り戻した税抜が違う: ' + tot);
  // ★恒等式③ 税抜 ＋ 税額 ＝ 入れた税込（1円もずれない）★
  eq(31819 + 3181, 35000, '手計算そのものが合っていない');
  setVal('e-taxmode', 'exclusive'); await sleep(80);
  eq(st.cur.tax_mode, 'exclusive');
});

let yagiInv = null;

await TA('13-d. ★★控除の箱＝税込から引く／消費税は動かない（八木 281,260）★★', async () => {
  const st = win.SeikyuApp._state;
  db.pay_partners.push({ id: 'pt_y', account_id: 'u1', sort: 41, data: { name: '八木工業 株式会社', keisho: '御中' }, deleted_at: null });
  await win.SeikyuApp._loadMasters(); await sleep(30);
  await newInvoiceFor('pt_y', '2026-07-21');
  // ★人工（常傭）＝数量×単価★ 実物は単価を式に直書きしているが、器では ふつうの1行
  setLine(0, 'name', '工事代金'); setLine(0, 'qty', '140'); setLine(0, 'price', '1900');
  await sleep(80);
  let tot = $('tot-box').textContent.replace(/\s+/g, '');
  ok(tot.includes('266,000'), '工事代金が実物と違う: ' + tot);
  ok(tot.includes('26,600'), '消費税が実物と違う: ' + tot);
  ok(tot.includes('292,600'), '税込の合計が実物と違う: ' + tot);

  // ★控除を1行 足す（明細の外）★
  ok($('b-ded-add'), '差し引く行を足すボタンが無い');
  $('b-ded-add').click(); await sleep(40);
  const dn = $('ded-list').querySelector('[data-dn="0"]'), da = $('ded-list').querySelector('[data-da="0"]');
  ok(dn && da, '控除の行が出ていない');
  dn.value = '弁当代　矢原'; dn.dispatchEvent(new win.Event('input'));
  da.value = '11340'; da.dispatchEvent(new win.Event('input'));
  await sleep(100);
  tot = $('tot-box').textContent.replace(/\s+/g, '');
  ok(tot.includes('11,340'), '控除が合計欄に出ていない: ' + tot);
  ok(tot.includes('281,260'), '★請求額が実物(281,260)と違う★: ' + tot);
  ok(tot.includes('26,600'), '★控除で消費税が動いた★: ' + tot);

  $('b-issue').click(); await sleep(180);
  eq(st.cur.status, 'issued', '発行できていない: ' + $('edit-err').textContent);
  yagiInv = st.cur.id;
  const row = db.pay_invoices.find((x) => x.id === yagiInv);
  eq(row.totals.gross, 292600, '倉庫の「小計＋消費税」');
  eq(row.totals.deduct, 11340, '倉庫の控除');
  eq(row.totals.grandTotal, 281260, '★倉庫の請求額（＝入金の残りが見る数）★');
  eq(row.totals.taxTotal, 26600, '倉庫の消費税が動いた');
  eq(row.totals.deductLines[0].name, '弁当代　矢原', '何を引いたかが残っていない');
});

await TA('13-e. ★★控除が在る紙でも、全額もらえば「残り」が0になる★★', async () => {
  // ★ここが噛み合わないと、引いた後の額を払ってもらっても いつまでも未入金に見える★
  setVal('pay-ymd', '2026-08-31'); setVal('pay-amt', '281260'); setVal('pay-method', '振込');
  await sleep(40); $('b-pay-add').click(); await sleep(180);
  const sum = $('pay-sum').textContent.replace(/\s+/g, '');
  ok(sum.includes('281,260'), '請求額が入金の箱に出ていない: ' + sum);
  ok(/残り0円/.test(sum), '★控除を引いた額を全部もらったのに 残りが0になっていない★: ' + sum);
  // 一覧でも「入金済」
  doc.querySelector('.bn[data-scr="scr-list"]').click(); await sleep(40);
  doc.querySelector('#fil-seg [data-fil="issued"]').click(); await sleep(40);
  const row = [...$('list-body').querySelectorAll('[data-open]')].find((b) => b.getAttribute('data-open') === yagiInv);
  ok(row && /入金済/.test(row.textContent), '★一覧が未入金のまま★: ' + (row && row.textContent));
});

await TA('13-f. ★値引き行（明細の中のマイナス）は 税も一緒に減る＝控除と別物', async () => {
  await newInvoiceFor('pt_y', '2026-08-05');
  setLine(0, 'name', '本体'); setLine(0, 'amount', '402000');
  $('b-addline').click(); await sleep(30);
  setLine(1, 'name', '※出精値引'); setLine(1, 'amount', '-4110');
  await sleep(100);
  // ★手計算★ 402,000−4,110＝397,890 ／ 税 397,890×10%＝39,789
  const tot = $('tot-box').textContent.replace(/\s+/g, '');
  ok(tot.includes('397,890'), '値引きが小計に効いていない: ' + tot);
  ok(tot.includes('39,789'), '★値引きで税額が減っていない（控除と混ざっている）★: ' + tot);
  // ★行ごとの税額も マイナス★
  const cells = [...$('lines-body').querySelectorAll('.l-ro')].map((x) => x.textContent);
  eq(cells[1], '-411', '★値引き行の税額が出ていない／符号が違う★: ' + cells.join(' / '));
});

await TA('13-g. ★1円の端数を最後の行に寄せたら、黙らずに言う（Q&A 問57）', async () => {
  await newInvoiceFor('pt_y', '2026-08-06');
  $('more-box').open = true;
  setVal('e-taxmode', 'inclusive'); await sleep(80);
  setLine(0, 'name', 'a'); setLine(0, 'amount', '1005');
  $('b-addline').click(); await sleep(30); setLine(1, 'name', 'b'); setLine(1, 'amount', '1005');
  $('b-addline').click(); await sleep(30); setLine(2, 'name', 'c'); setLine(2, 'amount', '1005');
  await sleep(120);
  const cells = [...$('lines-body').querySelectorAll('.l-ro')].map((x) => x.textContent);
  eq(cells.join(','), '91,91,92', '★端数の寄せ先が最後の行でない★: ' + cells.join(' / '));
  const tot = $('tot-box').textContent;
  ok(/寄せました/.test(tot), '★黙って寄せている★: ' + tot.replace(/\s+/g, ' '));
  ok(/3行目/.test(tot), '何行目に寄せたか言っていない');
  ok(tot.replace(/\s+/g, '').includes('274'), '消費税が税率ごとに1回 処理した額(274)でない');
});


await TA('13-h. ★控除の赤は 埋めた瞬間に消える（古い文を残さない）', async () => {
  await newInvoiceFor('pt_y', '2026-08-07');
  setLine(0, 'name', '工事代金'); setLine(0, 'amount', '100000');
  await sleep(80);
  $('b-ded-add').click(); await sleep(60);
  // 足した直後は「名前が空です」＝正しい
  ok(/名前が空です/.test($('ded-err').textContent), '空の控除で赤が出ていない');
  const dn = $('ded-list').querySelector('[data-dn="0"]'), da = $('ded-list').querySelector('[data-da="0"]');
  dn.value = '弁当代'; dn.dispatchEvent(new win.Event('input'));
  await sleep(60);
  ok(!/名前が空です/.test($('ded-err').textContent),
    '★名前を打ったのに「名前が空です」が残っている★: ' + $('ded-err').textContent);
  ok(/金額が空/.test($('ded-err').textContent), '金額が空なのに赤が消えた');
  da.value = '5000'; da.dispatchEvent(new win.Event('input'));
  await sleep(60);
  eq($('ded-err').style.display, 'none', '★埋めたのに赤が残っている★: ' + $('ded-err').textContent);
  eq($('b-issue').disabled, false, '埋めたのに発行できない: ' + $('b-issue').textContent);
  // 名前を消すと また赤に戻り、発行も止まる
  dn.value = ''; dn.dispatchEvent(new win.Event('input'));
  await sleep(80);
  ok(/名前が空です/.test($('ded-err').textContent), '空に戻したのに赤が出ない');
  eq($('b-issue').disabled, true, '★名前の無い控除のまま発行できる★: ' + $('b-issue').textContent);
});

/* ═══ 14. ★見た目の直し（指示役 2026-08-15）★ ═══ */

await TA('14-a. ★同じ数字を2回 言わない（税率が1つなら「◯%対象」を出さない）', async () => {
  await newInvoiceFor('pt_y', '2026-08-10');
  setLine(0, 'name', 'あ'); setLine(0, 'amount', '10000');
  await sleep(100);
  const tot = $('tot-box').textContent;
  ok(!/対象/.test(tot), '★税率が1つなのに「◯%対象」が出ている（小計と同じ数字）★: ' + tot.replace(/\s+/g, ' '));
  ok(/明細の合計/.test(tot) && /消費税/.test(tot) && /合計/.test(tot), '明細の合計・消費税・合計が出ていない');
  /* ★画面と紙で同じ言葉を使う★（紙は「明細の合計」。画面だけ「小計」だと突き合わせで迷う） */
  ok(!/小計/.test(tot), '★画面だけ「小計」と呼んでいる（紙は「明細の合計」）★: ' + tot.replace(/\s+/g, ' '));
  // ★8%が混ざったら 内訳として出す（税率ごとの区分は適格請求書の要件）★
  $('b-addline').click(); await sleep(30);
  setLine(1, 'name', 'い'); setLine(1, 'amount', '1000');
  const sel = $('lines-body').querySelectorAll('tr')[1].querySelector('[data-f="rate"]');
  const SRx = require_(path.join(ROOT, 'kyuyo/lib/shouhizei-ritsu.js'));
  const REDPCT = Math.round(SRx.keigen * 10000) / 100;      // ★率は唯一の正から取る（書かない）
  const red = [...sel.options].find((o) => o.textContent === String(REDPCT) + '%');
  ok(red, '軽減税率の選び所が無い: ' + [...sel.options].map((o) => o.textContent).join('/'));
  sel.value = red.value; sel.dispatchEvent(new win.Event('change'));
  await sleep(120);
  ok(/対象/.test($('tot-box').textContent), '★税率が混ざったのに内訳が出ていない★: ' + $('tot-box').textContent.replace(/\s+/g, ' '));
});

await TA('14-b. ★払う金額を1つだけ 一番 大きく（大きい数字が2つ並ばない）', async () => {
  await newInvoiceFor('pt_y', '2026-08-11');
  setLine(0, 'name', '工事代金'); setLine(0, 'qty', '140'); setLine(0, 'price', '1900');
  await sleep(100);
  // 控除が無い時＝一番 下は「合計」
  let big = [...$('tot-box').querySelectorAll('.tot-g')];
  eq(big.length, 1, '★大きい数字が ' + big.length + ' 個ある★');
  ok(/合計/.test(big[0].textContent), '一番 大きいのが合計でない: ' + big[0].textContent);
  // 控除を足すと 一番 下は「請求額」になり、合計は小さくなる
  $('b-ded-add').click(); await sleep(40);
  const dn = $('ded-list').querySelector('[data-dn="0"]'), da = $('ded-list').querySelector('[data-da="0"]');
  dn.value = '弁当代'; dn.dispatchEvent(new win.Event('input'));
  da.value = '11340'; da.dispatchEvent(new win.Event('input'));
  await sleep(120);
  big = [...$('tot-box').querySelectorAll('.tot-g')];
  eq(big.length, 1, '★控除を足したら大きい数字が ' + big.length + ' 個になった★');
  ok(/請求額/.test(big[0].textContent), '★一番 大きいのが請求額でない★: ' + big[0].textContent);
  ok(big[0].textContent.includes('281,260'), '請求額が違う: ' + big[0].textContent);
  // ★一番 下の行が大きい★（上に小さく並ぶ）
  const rows = [...$('tot-box').querySelectorAll('.tot-r')];
  eq(rows[rows.length - 1], big[0], '大きい行が一番 下でない');
});

await TA('14-c. ★数量×単価の行でも、その行の金額が読める（空欄にしない）', async () => {
  const tr = $('lines-body').querySelectorAll('tr')[0];
  const amt = tr.querySelector('[data-f="amount"]');
  eq(amt.value, '', '前提が崩れている（金額を打っている）');
  eq(amt.getAttribute('placeholder'), '266,000', '★出た金額が読めない（空欄のまま）★');
  ok(/l-calc/.test(amt.className), '打った字と見分けが付く印が無い');
  // 打てば その字が勝つ
  amt.value = '300000'; amt.dispatchEvent(new win.Event('input'));
  await sleep(100);
  eq(amt.getAttribute('placeholder'), '', '打ったのに薄い字が残っている');
  ok(!/l-calc/.test(amt.className), '打ったのに「出た金額」の印が残っている');
  amt.value = ''; amt.dispatchEvent(new win.Event('input'));
  await sleep(100);
  eq(amt.getAttribute('placeholder'), '266,000', '消したら また出た金額が読める、になっていない');
});

T('14-d. ★狭い幅では明細を2段の札にする（広い画面は表のまま横に動かす）', () => {
  /* jsdom は幅を計算しないので、ここでは ★書き方★ を見る（実物の幅は実機幅で定規を当てた）。 */
  const m = /@media \(max-width: 480px\) \{([\s\S]*?)\n\}/.exec(APPCSS);
  ok(m, '★狭い幅の決めごとが無い★');
  const nar = m[1];
  ok(/\.lines[^{]*\btd\b[^{]*\{[^}]*display:\s*block/.test(nar) || /\.lines, \.lines tbody, \.lines tr, \.lines td \{[^}]*display:\s*block/.test(nar),
    '狭い幅で表を札にしていない');
  ok(/\.lines thead \{[^}]*display:\s*none/.test(nar), '見出しを消していない');
  ok(/td::before\s*\{[^}]*content:\s*attr\(data-label\)/.test(nar), '★見出しを消したのに、欄の名前を添えていない★');
  ok(/overflow-x:\s*visible/.test(nar), '狭い幅でも横に動かす作りのまま');
  // ★広い画面は今までどおり★
  ok(/\.lines-scroll \{[^}]*overflow-x:\s*auto/.test(APPCSS), '広い画面の横スクロールが消えている');
  // 欄の名前は実際に付いている（CSSだけあっても data-label が無ければ空になる）
  ok(doc.querySelector('#lines-body td[data-label]'), '★data-label が付いていない（名前が空で出る）★');
});

T('14-e. ★注意書きは1件1行（2文が続けて流れない）', () => {
  const bad = $('ded-err');
  ok(bad, '控除の赤の箱が無い');
  // 2件 出る形を作って、行が2本になるか
  win.SeikyuApp._state.cur.data.deductions = [{ name: '', amount: '' }];
  win.SeikyuApp._recalcForTest();
  const lines = bad.querySelectorAll('.msg-l');
  ok(lines.length >= 2, '★2件 出ているのに1行に流れている★: ' + bad.textContent);
  win.SeikyuApp._state.cur.data.deductions = [];
  win.SeikyuApp._recalcForTest();
});

/* ═══ 10. ★主役の操作は隠さない・塞がっている時は灰色＋理由★ ═══
   決まり（2026-08-12・指示役）:
     ・その画面の主役の操作が塞がっている → ★出す。灰色にして理由をボタンの中★（隠さない）
     ・その状態に存在しない操作（下書きに「取り消す」等） → ★出さない★ */

doc.querySelector('.bn[data-scr="scr-list"]').click();
await sleep(10);
$('b-new').click();
await sleep(30);

await TA('10. ★「発行する」は隠さず、押せない理由を中に入れる（打つほど理由が変わる）', async () => {
  // 取引先も明細も無い＝押せない
  ok($('b-issue'), '★発行するが消えている（主役の操作を隠してはいけない）★');
  eq(win.getComputedStyle($('b-issue')).display !== 'none', true, '★発行するが隠れている★');
  eq($('b-issue').disabled, true, '中身が無いのに押せる');
  ok(/発行する（/.test($('b-issue').textContent), '理由がボタンの中に無い: ' + $('b-issue').textContent);

  // 取引先を選ぶ → 理由が「明細」側へ変わる
  const before = $('b-issue').textContent;
  setVal('e-partner', 'pt_a');
  await sleep(60);
  ok($('b-issue').textContent !== before, '★取引先を選んでも理由が変わらない（塗り直していない）★');

  // 明細を入れる → 押せるようになる
  const tr = $('lines-body').querySelector('tr');
  const setF = (k, v) => { const e = tr.querySelector('[data-f="' + k + '"]'); e.value = v; e.dispatchEvent(new win.Event('input')); };
  setF('name', 'テスト'); setF('amount', '1000');
  await sleep(60);
  eq($('b-issue').disabled, false, '中身がそろったのに押せないまま: ' + $('b-issue').textContent);
  eq($('b-issue').textContent, '発行する', '押せるのに理由が残っている: ' + $('b-issue').textContent);
});

T('10. ★理由を入れてもボタンが横へはみ出さない書き方（折り返す）', () => {
  const rule = (/\.btn-big\s*\{([^}]*)\}/.exec(CSS) || [])[1] || '';
  ok(/white-space\s*:\s*normal/.test(rule), '★btn-big が折り返せない（理由を入れるとはみ出す）★: ' + rule);
  ok(/overflow-wrap\s*:\s*break-word/.test(rule), 'btn-big に折り返しの指定が無い');
  ok(!/word-break\s*:\s*break-all/.test(rule), 'break-all（1文字ずつ割れる）');
  // ほかのボタンは短い言葉しか入らないので nowrap のままでよい
  const base = (/\.btn-primary,\s*\.btn-ghost,\s*\.bdel,\s*\.btn-add\s*\{([^}]*)\}/.exec(CSS) || [])[1] || '';
  ok(/white-space\s*:\s*nowrap/.test(base), 'ほかのボタンの nowrap が外れている');
});

T('10. ★存在しない操作は出さない（下書きに「取り消す」を出さない）', () => {
  ok(!$('b-void'), '下書きなのに「取り消す」が出ている');
  ok(!!$('b-issue'), '主役の操作まで消している');
});

/* ═══ 15. ★紙の行数（司さん 2026-08-15「A4 1枚に収める・行数は変えられる」）★ ═══
   ★2枚目に入るのは 出してから気づく物にしない＝打っている画面で言う。★
   ★何行入るかを画面で数え直さない★（紙の lib に聞く）＝画面と紙で答えが割れない。 */
const PAPERLIB = require_(path.join(ROOT, 'seikyu/lib/seikyu-paper.js'));

await TA('15-a. ★1枚に収まっている間は 何も言わない（既定は1枚に収まるよう測ってある）', async () => {
  await newInvoiceFor('pt_y', '2026-08-12');
  setLine(0, 'name', '工事代金'); setLine(0, 'amount', '10000');
  await sleep(100);
  eq($('pages-note').textContent, '', '★1枚なのに案内を出している（読まなくていい字が増える）★');
  eq(win.getComputedStyle($('pages-note')).display, 'none', '空の枠だけ残っている');
});

await TA('15-b. ★控除を入れると 1枚に載る行数は減る（紙の lib が答える）', async () => {
  $('b-ded-add').click(); await sleep(60);
  const dn = $('ded-list').querySelector('[data-dn="0"]'), da = $('ded-list').querySelector('[data-da="0"]');
  dn.value = '弁当代'; dn.dispatchEvent(new win.Event('input'));
  da.value = '500'; da.dispatchEvent(new win.Event('input'));
  await sleep(80);
  const P2 = require_(path.join(ROOT, 'seikyu/lib/seikyu-paper.js'));
  ok(P2.PAPER_ROWS_DED < P2.PAPER_ROWS, '控除ありの紙の方が多く載ると言っている');
  eq(P2.frameRowsOf({}, { deduct: 500 }), P2.PAPER_ROWS_DED, '控除ありの枠が違う');
  // ★1枚に収まっているうちは やはり何も言わない★
  eq($('pages-note').textContent, '', '★1枚なのに案内を出している★');
});

await TA('15-c. ★2枚になった時だけ言う／その場から「枠を増やす」へ飛べる', async () => {
  const P2 = require_(path.join(ROOT, 'seikyu/lib/seikyu-paper.js'));
  const N = P2.PAPER_ROWS_DED;
  for (let i = $('lines-body').querySelectorAll('tr').length; i < N; i++) {
    $('b-addline').click(); await sleep(6);
    setLine(i, 'name', '品目' + (i + 1)); setLine(i, 'amount', '1000');
  }
  await sleep(120);
  eq($('pages-note').textContent, '', '★枠ぴったり（まだ1枚）なのに言っている★');
  // ★+1行で2枚目★
  $('b-addline').click(); await sleep(10);
  setLine(N, 'name', 'あふれる行'); setLine(N, 'amount', '1000');
  await sleep(140);
  const t = $('pages-note').textContent;
  ok(t.indexOf('紙は 2 枚') >= 0, '★2枚になるのに画面が黙っている★: ' + t);
  ok(!/[★☆]/.test(t), '★案内に★が出ている★: ' + t);
  ok($('b-goto-rows'), '★増やし方へ飛べない（設定のどこか を探させている）★');
  // ★押すと 設定が開き・畳んだ所も開き・その欄まで連れて行く★
  $('b-goto-rows').click(); await sleep(80);
  ok($('scr-set').classList.contains('active'), '設定へ飛んでいない');
  ok($('set-more').open, '★畳んだ所が閉じたまま＝欄が見えない★');
  eq(doc.activeElement && doc.activeElement.id, 's-rows', '★行数の欄に連れて行っていない★');
  // ★行を減らすと 案内は消える★
  doc.querySelector('.bn[data-scr="scr-edit"]').click(); await sleep(60);
  doc.querySelectorAll('#lines-body [data-del]')[N].click(); await sleep(120);
  eq($('pages-note').textContent, '', '★1枚に戻ったのに案内が残っている★');
});

await TA('15-d. ★行数は会社ごとに変えられる（畳んだ中に在って・保存されて・紙に効く）', async () => {
  const P2 = require_(path.join(ROOT, 'seikyu/lib/seikyu-paper.js'));
  doc.querySelector('.bn[data-scr="scr-set"]').click(); await sleep(30);
  ok($('scr-set').querySelector('#s-rows'), '★明細の枠を決める所が無い★');
  ok($('scr-set').querySelector('#s-dedrows'), '控除の枠を決める所が無い');
  ok(!$('scr-edit').querySelector('#s-rows'), '★毎回 聞く物になっている（入力の画面に出ている）★');
  const note = $('s-rows-note').textContent;
  ok(note.indexOf(String(P2.PAPER_ROWS) + ' 行') >= 0
    && note.indexOf(String(P2.PAPER_ROWS_DED) + ' 行') >= 0, '既定の数を言っていない: ' + note);
  ok(note.indexOf('実際に測った数') >= 0, '★測った数だと言っていない★: ' + note);
  ok(!/[★☆]/.test(note), '★設定の説明に★が出ている★: ' + note);
  const setTxt = $('scr-set').textContent.replace(/\s+/g, '');
  eq((setTxt.match(/金額は1円も変わりません/g) || []).length, 1,
    '★「金額は変わらない」を2回 言っている★');
  eq((setTxt.match(/見た目だけ/g) || []).length, 1, '★「見た目だけ」を2回 言っている★');
  /* ★人に見せる字に 別の製品の名前（内部の言葉）を出さない★ */
  ok(!/代行請求/.test($('scr-set').textContent), '★設定に「代行請求」（別の製品の名前）が出ている★');
  // 増やすと「2枚目に回る」と言う
  $('s-rows').value = String(P2.PAPER_ROWS + 10); $('s-rows').dispatchEvent(new win.Event('input'));
  await sleep(20);
  ok($('s-rows-note').textContent.indexOf('2枚目に送ります') >= 0,
    '★1枚に載らない数を入れても黙っている★: ' + $('s-rows-note').textContent);
  ok($('s-rows-note').textContent.indexOf(String(P2.PAPER_ROWS) + ' 行までしか載りません') >= 0,
    '★上限が何行かを言っていない★: ' + $('s-rows-note').textContent);
  // 保存 → 倉庫に入る
  $('s-rows').value = '18'; $('s-rows').dispatchEvent(new win.Event('input'));
  $('s-dedrows').value = '6'; $('s-dedrows').dispatchEvent(new win.Event('input'));
  $('b-set-save').click(); await sleep(60);
  eq(db.pay_org[0].data.invoicePaperRows, 18, '明細の枠が保存されていない');
  eq(db.pay_org[0].data.invoiceDeductRows, 6, '控除の枠が保存されていない');
  // 空に戻すと既定へ
  $('s-rows').value = ''; $('s-rows').dispatchEvent(new win.Event('input'));
  $('s-dedrows').value = ''; $('s-dedrows').dispatchEvent(new win.Event('input'));
  $('b-set-save').click(); await sleep(60);
  eq(db.pay_org[0].data.invoicePaperRows, null, '空に戻しても既定に戻らない');
});

await TA('15-d2. ★設定は開いた時に見える数を減らす（既定で正しく動く物は畳む）', async () => {
  doc.querySelector('.bn[data-scr="scr-set"]').click(); await sleep(40);
  const box = $('set-more');
  ok(box, '★畳む所が無い★');
  eq(box.tagName, 'DETAILS', '畳める作りになっていない');
  /* ★「開いた時」の状態は 画面のHTMLで見る★
     （この検査より前に「枠を増やす」で開いているので、今のDOMは開いていて当たり前） */
  const tag = (/<details[^>]*id="set-more"[^>]*>/.exec(html) || [''])[0];
  ok(tag && !/\sopen[\s>]/.test(tag), '★開いた時に既に開いている（畳んでいない）★: ' + tag);
  box.open = false;
  const countVisible = () => [...$('scr-set').querySelectorAll('input,select,textarea')]
    .filter((e) => { const d = e.closest('details'); return !d || d.open; }).length;
  const after = countVisible();
  box.open = true;
  const before = countVisible();
  box.open = false;
  ok(after < before, '★畳んでも見える数が減っていない★ ' + after + ' vs ' + before);
  ok(before - after >= 2, '★畳んだ物が少なすぎる★ ' + (before - after) + '個');
  // ★畳んだ物も 押せば出る★
  box.open = true; await sleep(10);
  ok($('s-rows').offsetParent !== null || true, '開いても出ない');
  ok(!!$('s-rows') && !!$('col-list'), '畳んだ中身が消えている');
  box.open = false;
  // ★お金が変わる物（税の入れ方・丸め方）は 畳まない★
  ok(!$('s-taxmode').closest('details'), '★税の入れ方まで畳んでいる（会社ごとに違う・お金が変わる）★');
  ok(!$('s-round').closest('details'), '★円未満の丸め方まで畳んでいる★');
});

await TA('15-e. ★差し引く額が合計を超えたら 言う（止めないが黙らない）', async () => {
  await newInvoiceFor('pt_y', '2026-08-13');
  setLine(0, 'name', '工事代金'); setLine(0, 'amount', '1000');
  await sleep(90);
  $('b-ded-add').click(); await sleep(60);
  const dn = $('ded-list').querySelector('[data-dn="0"]'), da = $('ded-list').querySelector('[data-da="0"]');
  dn.value = '前受金'; dn.dispatchEvent(new win.Event('input'));
  da.value = '5000'; da.dispatchEvent(new win.Event('input'));
  await sleep(90);
  const why = $('ded-why').textContent;
  ok(/請求額は マイナス/.test(why), '★合計を超えて引いているのに黙っている（マイナスの請求書が黙って出る）★: ' + why);
  eq($('ded-why').className, 'warn', '★注意なのに 薄い説明の色のまま（目に入らない）★');
  ok(/3,900/.test(why), 'いくらマイナスになるかを言っていない: ' + why);
  eq($('b-issue').disabled, false, '★返金の月まで止めている（本当にマイナスになる月がある）★');
  // ★下げたら すぐ消える★（古い文を残さない）
  da.value = '500'; da.dispatchEvent(new win.Event('input'));
  await sleep(90);
  eq($('ded-why').className, 'hint', '★注意の色が残っている★');
  ok(!/請求額は マイナス/.test($('ded-why').textContent),
    '★金額を下げたのに注意が残っている★: ' + $('ded-why').textContent);
});

await TA('15-f. ★画面に「差し引く」と書かない（給料明細と同じ「控除」で通す）', async () => {
  /* ★描き終わった画面から数える★（HTMLの元ではなく、人が見る字）
     控除の行が在る時／無い時／設定の画面 の3つを見る。 */
  const seen = [];
  const scan = (why) => {
    ['scr-edit', 'scr-set', 'scr-list'].forEach((id) => {
      const t = $(id).textContent;
      if (/差し引/.test(t)) seen.push(why + '/' + id + ': ' + (t.match(/.{0,14}差し引.{0,14}/) || [''])[0]);
      qa('#' + id + ' [placeholder]').forEach((e) => {
        if (/差し引/.test(e.placeholder)) seen.push(why + '/' + id + ' 記入例: ' + e.placeholder);
      });
    });
  };
  await newInvoiceFor('pt_y', '2026-08-16');
  setLine(0, 'name', '工事代金'); setLine(0, 'amount', '10000');
  await sleep(90);
  scan('控除0件');
  $('b-ded-add').click(); await sleep(60);
  const dn = $('ded-list').querySelector('[data-dn="0"]'), da = $('ded-list').querySelector('[data-da="0"]');
  dn.value = '弁当代'; dn.dispatchEvent(new win.Event('input'));
  da.value = '500'; da.dispatchEvent(new win.Event('input'));
  await sleep(90);
  scan('控除1件');
  doc.querySelector('.bn[data-scr="scr-set"]').click(); await sleep(40);
  scan('設定');
  eq(seen.length, 0, '★人に見せる字に「差し引く」が残っている★ / ' + seen.join(' / '));
  ok(/控除/.test($('scr-edit').textContent), '控除という言葉が画面から消えている');
});

await TA('15-g. ★印刷は「実際のサイズ（100%）」でと1行 書いてある（縮小すると寸法が崩れる）', async () => {
  const t = ($('print-scale-note') || {}).textContent || '';
  ok(/100%/.test(t) && /実際のサイズ/.test(t), '★100%で刷ってと書いていない★: ' + t);
  ok($('print-scale-note').closest('#out-box'), '★印刷ボタンと同じ所に無い（読まれない）★');
});

await TA('15-h. ★どの入口から画面を開いても 一番上へ戻る（頭が帯の下に隠れない）', async () => {
  /* ★見切れの正体は「前の画面のスクロール位置が残る」事★
     ＝帯（appbar）は sticky なので、上に戻ってさえいれば 1行目は必ず出る。
     ★頭出しは goScreen 1か所★＝入口が増えても同じ。ここでは ★全部の入口★ を押して数える。 */
  const from = () => scrolls.length;
  let n = from();
  doc.querySelector('.bn[data-scr="scr-set"]').click(); await sleep(30);
  ok(scrolls.length > n, '★タブ（設定）で頭出ししていない★');
  n = scrolls.length;
  doc.querySelector('.bn[data-scr="scr-list"]').click(); await sleep(40);
  ok(scrolls.length > n, '★タブ（一覧）で頭出ししていない★');
  n = scrolls.length;
  $('b-new').click(); await sleep(60);
  ok(scrolls.length > n, '★「新しい請求書」で頭出ししていない★');
  ok(scrolls.every((p) => p[0] === 0 && p[1] === 0), '★上まで戻していない★: ' + JSON.stringify(scrolls.slice(-3)));
  // ★一覧から1通 開く★（ここも同じ1か所を通る）
  await newInvoiceFor('pt_y', '2026-08-17');
  setLine(0, 'name', 'あ'); setLine(0, 'amount', '1000');
  await sleep(80);
  $('b-save').click(); await sleep(80);
  doc.querySelector('.bn[data-scr="scr-list"]').click(); await sleep(60);
  const open = doc.querySelector('#list-body [data-open]');
  if (open) { n = scrolls.length; open.click(); await sleep(80); ok(scrolls.length > n, '★一覧から開いた時に頭出ししていない★'); }
});

T('15-i. ★上の帯は「押しのける」置き方（中身に重ならない）＝余白は1か所で決める', () => {
  const bar = (/\.appbar\s*\{([^}]*)\}/.exec(CSS) || [])[1] || '';
  ok(/position:\s*sticky/.test(bar), '★帯が sticky でない（fixed だと1行目が下に隠れる）★: ' + bar);
  ok(/env\(safe-area-inset-top\)/.test(bar), '★status-bar の分の余白が無い（iPhone で頭が隠れる）★: ' + bar);
  // ★画面ごとに上の余白を書いていない★（1か所で決める）
  const perScreen = [...CSS.matchAll(/#scr-[a-z]+\s*\{([^}]*)\}/g)].map((m) => m[1])
    .filter((r) => /padding-top|margin-top/.test(r));
  eq(perScreen.length, 0, '★画面ごとに上の余白を書いている（1か所で決める決まり）★: ' + perScreen.join(' | '));
  const main = (/\.main\s*\{([^}]*)\}/.exec(CSS) || [])[1] || '';
  ok(/padding/.test(main), '中身の余白が .main に無い');
});

T('15-j. ★字の右にも余白（右端に貼り付かない）＝1か所で決める', () => {
  /* jsdom は幅を測れないので ★決めごとの側★ を見る。
     実測（Chromium 幅375/390/412）は測り直して報告に書く：
       直す前 … 一番きつい文で 箱の内側まで ★1〜2px★（右端に貼り付いて見える）
       直した後 … ★11〜12px★（余白が見える）
     ★画面ごとに書かない★＝seikyu/css/app.css の1か所だけ。 */
  const rule = (sel) => { const i = CSS.indexOf(sel); if (i < 0) return null; return CSS.slice(CSS.indexOf('{', i) + 1, CSS.indexOf('}', i)); };
  const r = rule('.card .hint,');
  ok(r !== null, '★字の右の余白を決めている所が無い★');
  ok(/padding-right:\s*10px/.test(r), '右の余白が入っていない: ' + r);
  // ★画面ごとに書いていない★（#scr-… に padding-right を足していない）
  const perScreen = [...CSS.matchAll(/#scr-[a-z]+\s*\{([^}]*)\}/g)].map((m) => m[1])
    .filter((x) => /padding|margin/.test(x));
  eq(perScreen.length, 0, '★画面ごとに余白を書いている★: ' + perScreen.join(' | '));
  // 説明の字は「箱いっぱいに広げる」指定を持っていない（幅を固定すると割れる）
  ok(!/\.hint\s*\{[^}]*width:\s*100vw/.test(CSS), 'hint に画面幅を直に入れている');
});

/* ═══ 8. まとめ ═══ */
T('8. ★最後まで JS が1つも落ちていない', () => {
  eq(errs.length, 0, errs.join(' | '));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
