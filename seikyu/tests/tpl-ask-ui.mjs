/* tpl-ask-ui.mjs — ★どの紙で出すかを 先に聞く★＋★見本を見せる★＋★戻って続きから★
 * =============================================================================
 * 決まり:
 *   司さん 2026-08-17「★何を書くかより先に ユーザーのテンプレを決めさせる★」
 *   司さん 2026-08-24「★様式を聞くのと一緒に 見本も見せる★」
 *                    「★そこから また戻って 続きから できる動線も要る★」
 *   指示役 2026-08-24「★紙が出せない時は 押せなくして 理由を出す★」（黙って何も起きない を無くす）
 *
 * ★本物の seikyu-app.js を動かして 実際に押す★（source を読むだけにしない）
 *
 * 使い方: node seikyu/tests/tpl-ask-ui.mjs
 *         node seikyu/tests/tpl-ask-ui.mjs --self-test
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
const eq = (a, b, m) => { if (a !== b) throw new Error((m ? m + ': ' : '') + 'ほしい ' + b + ' / 出た ' + a); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = async (n, f) => { try { await f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };

const FILE = path.join(ROOT, 'seikyu/index.html');

/* ★形は 本物のブラウザでしか測れない★（jsdom には段組みが無い＝幅も高さも0）
   手本＝timeally-test/scripts/screen-check.mjs（新しいやり方を作らない）:
   jsdom で動かす → script を外す → CSS は本物を file:// で読む → ★Chrome の枠(iframe)の中で測る★ */
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
async function measureShape(doc) {
  const CHROME = findChrome();
  if (!CHROME) throw new Error('★ブラウザが見つかりません＝形を測れません（0と言わない）★');
  const os = await import('node:os');
  const { execFileSync } = await import('node:child_process');
  const OUT = path.join(os.tmpdir(), 'rakunally-tpl-shape');
  fs.mkdirSync(OUT, { recursive: true });
  doc.querySelectorAll('script').forEach((x) => x.remove());
  /* ★ログイン前は <div id="app" hidden> で丸ごと隠れている★（auth.js が開ける）。
     ここでは auth.js を外しているので ★開けてから測る★。
     開けないと ★枠が 0×0 で返り「形が違う」と嘘の赤★になる（2026-08-26 に踏んだ）。 */
  doc.querySelectorAll('[hidden]').forEach((x) => x.removeAttribute('hidden'));
  doc.querySelectorAll('link[rel="stylesheet"]').forEach((l) => {
    const href = (l.getAttribute('href') || '').split('?')[0];
    if (/^https?:/.test(href)) { l.remove(); return; }
    l.setAttribute('href', pathToFileURL(path.resolve(path.dirname(FILE), href)).href);
  });
  const PROBE = `
    var out = [];
    [].forEach.call(document.querySelectorAll('.tpl-shot'), function (sh) {
      var r = sh.getBoundingClientRect();
      var f = sh.querySelector('iframe');
      var fr = f ? f.getBoundingClientRect() : null;
      /* ★見切れを捕まえる★＝枠の中で 紙が どれだけの大きさで出ているか（srcdoc は同じ元なので中を読める）
         2026-08-26 司さん「見切れとるやないか」…枠は正しくても ★中の紙が左上だけ★ だった */
      /* ★見切れは「形」では測れない★（2026-08-26 実測して分かった）
         壊れていた形＝★入れ物(html)を縮める★。この時 紙は html の幅で ★切られてから★ 縮むので、
         紙の rect は 正しい時と ★同じ数★になる（rect は 切られた事を知らない）。
         ⇒ ★紙そのものに縮尺が掛かっているか★ と ★紙のレイアウト幅×縮尺が 枠を埋めるか★ で見る。 */
      var sw = 0, shh = 0, ok2 = 0, own = 0;
      try {
        var dd = f.contentDocument;
        var sheet = dd.querySelector('.sheet') || dd.body;
        var tr = dd.defaultView.getComputedStyle(sheet).transform;
        own = (tr && tr !== 'none') ? 1 : 0;                 /* ★紙自身が縮んでいるか★ */
        /* ★この文字列は 中で走る★ので 逆斜線を書かない（テンプレ文字列で構文の赤になる） */
        var k = 1;
        var open = String(tr || '').indexOf('(');
        if (open > 0) { k = parseFloat(String(tr).slice(open + 1).split(',')[0]) || 1; }
        sw = Math.round(sheet.offsetWidth * k);              /* ★レイアウト幅×縮尺＝実際に出る幅★ */
        shh = Math.round(sheet.offsetHeight * k);
        ok2 = 1;
      } catch (e) { ok2 = 0; }
      out.push({ w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top),
        pw: fr ? Math.round(fr.width) : 0, ph: fr ? Math.round(fr.height) : 0,
        sw: sw, sh: shh, read: ok2, own: own });
    });
    return { shots: out, vw: window.innerWidth };
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

async function boot(appSrc, tane) {
  const html = fs.readFileSync(FILE, 'utf8');
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/seikyu/index.html',
  });
  const win = dom.window, doc = win.document;
  win.fetch = () => Promise.reject(new Error('no net'));
  win.alert = () => {}; win.confirm = () => true; win.scrollTo = () => {}; win.print = () => {};
  win.URL.createObjectURL = () => 'blob:fake';
  win.open = () => ({ document: { write() {}, close() {} }, focus() {}, print() {}, close() {} });
  const src = fs.readFileSync(path.join(ROOT, 'tests/fake-supa.js'), 'utf8');
  const m = { exports: {} };
  new Function('module', 'exports', src)(m, m.exports);
  win.__mkSb = () => m.exports.createFakeSupa({
    uid: 'u1',
    tables: {
      pay_org: [{ account_id: 'u1', data: { yago: '合同会社Rakunally', invoiceNo: 'T3500003003293' }, updated_at: '2026-08-01T00:00:00Z' }],
      pay_partners: [{ id: 'pt_a', account_id: 'u1', sort: 0, data: { name: 'A株式会社', keisho: '御中' }, deleted_at: null }],
      /* ★前に 出した1通は ★倉庫に★ 置く★（画面の 配列に 足すだけでは
         画面を 行き来した時に 倉庫から 読み直されて ★消える★＝2026-09-05 実測） */
      pay_invoices: (tane && tane.invoices) || [], pay_receipts: [],
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
  await win.SeikyuApp.attach(win.__mkSb());
  await sleep(300);
  doc.getElementById('b-new').click();
  await sleep(400);
  return { win, doc };
}

/** ★設定の画面を 開いた状態で 起こす★
 *  ＝紙の様式を 決めるのは 設定（司さん 2026-09-05
 *    「設定で 会社情報やるんやったら 設定やないか？ 取引先マスタは 設定にあるんやろが？」）。
 *  ★タブと 同じ道で 開く★（fillSettings を 通らないと 札が 0枚のまま） */
async function bootSet(appSrc, tane) {
  const r = await boot(appSrc, tane);
  const tab = r.doc.querySelector('.bn[data-scr="scr-set"]');
  ok(tab, '設定のタブが 無い');
  tab.click();
  await sleep(400);
  return r;
}

async function run(label, appSrc) {
  console.log('\n[' + label + '] ★押す物の一覧（先に書く）★');
  console.log('  ① 入力では聞かない（決めるのは設定） ② 設定の見本が別の絵 ③ 設定で選ぶと入力も変わる'
    + ' ④ [設定で変える]で設定へ・中身は残る ⑤ 出せない時は押せない');

  /* ★2026-09-05 決め直し（司さん）★
     「設定で 会社情報やるんやったら 設定やないか？ 取引先マスタは 設定にあるんやろが？」
     ＝自社の情報も 取引先も ★設定に 在る★のに、紙の様式だけ ★入力と設定の 2か所★に 在った。
     ⇒ ★決めるのは 設定 1か所★。入力では ★今 どの紙で 出るかを 見せるだけ★。
     ★前は「入力で 先に 聞く」を ここで 守っていた★＝決めが 変わったので 守る物も 変えた。 */
  await T('① ★入力では 様式を 聞かない★（決めるのは 設定）／今の紙は 1行で 見える', async () => {
    const { doc } = await boot(appSrc);
    const card = doc.getElementById('tpl-card');
    ok(!card || card.style.display === 'none', '★入力に 様式を選ぶ札が 出ている（2か所に 戻っている）★');
    const strip = doc.getElementById('tpl-strip');
    ok(strip && strip.style.display !== 'none', '今 どの紙かの 1行が 出ていない');
    ok((doc.getElementById('tpl-strip-v').textContent || '').length > 2, '紙の名前が 出ていない');
    const why = (doc.getElementById('tpl-strip-why').textContent || '');
    ok(/設定/.test(why), '★どこで 決まったのかを 言っていない★: ' + why.slice(0, 60));
    ok(/設定で変える/.test(doc.getElementById('b-tpl-change').textContent || ''),
      '★どこへ 行けば 変えられるか ボタンが 言っていない★');
  });

  /* ★様式の数を 決め打ちしない★（2026-08-27 3つ目を足した日に ここが赤くなった）
     ＝★lib(seikyu-templates.js)が持つ数が 正★。足した日に 試験を直さなくてよい形にする。 */
const TPL_N = (function () {
  const T2 = require_(path.join(ROOT, 'seikyu/lib/seikyu-templates.js'));
  return T2.list().length;
})();

  await T('② ★設定に 見本が ' + TPL_N + '枚／どれも 別の絵★（同じ絵なら 見本が嘘）', async () => {
    const { doc } = await bootSet(appSrc);
    const shots = [...doc.querySelectorAll('#s-tpl .tpl-shot iframe')].map((f) => f.getAttribute('srcdoc') || '');
    eq(shots.length, TPL_N, '見本の数');
    shots.forEach((x, i) => ok(x.length > 500, '★' + (i + 1) + '枚目の見本が空＝描けていない★'));
    ok(new Set(shots).size === shots.length, '★同じ絵が混ざっている＝様式が効いていない（見本が嘘）★');
  });

  await T('③ ★設定で 選ぶと 入力の 1行も 紙も 変わる★（同じ状態を 2か所で 別々に 判定しない）', async () => {
    const { win, doc } = await bootSet(appSrc);
    const koujo = doc.querySelector('#s-tpl [data-tpl="koujo"]');
    ok(koujo, '設定に koujo の札が 無い');
    koujo.click();
    await sleep(300);
    /* 入力へ 戻る＝タブと 同じ道 */
    doc.querySelector('.bn[data-scr="scr-edit"]').click();
    await sleep(400);
    const na = (doc.getElementById('tpl-strip-v').textContent || '');
    ok(/控除/.test(na), '★設定で 変えたのに 入力の 1行が 前のまま★: ' + na);
    eq(win.SeikyuApp._state.cur.template_id, 'koujo', '★1通の中身が 設定に そろっていない★');
    /* ★控除の箱も 様式で 変わる★（司さん「今 控除ないやつ 選んどんのに 控除があるし」） */
    const ded = doc.getElementById('ded-card');
    ok(ded && ded.style.display !== 'none', '★控除の紙なのに 控除の箱が 出ていない★');
    /* 控除を 出さない紙に 戻したら 箱も 消える */
    doc.querySelector('.bn[data-scr="scr-set"]').click();
    await sleep(300);
    doc.querySelector('#s-tpl [data-tpl="std1"]').click();
    await sleep(300);
    doc.querySelector('.bn[data-scr="scr-edit"]').click();
    await sleep(400);
    eq(doc.getElementById('ded-card').style.display, 'none',
      '★控除の無い様式なのに 控除の箱が 出たまま★');
  });

  await T('④ ★[設定で変える]で 設定の「紙の様式」へ 行く／中身は 残る（続きから）★', async () => {
    const { win, doc } = await boot(appSrc);
    const before = win.SeikyuApp._state.cur.partner_id;
    doc.getElementById('b-tpl-change').click();
    await sleep(300);
    ok(doc.getElementById('scr-set').classList.contains('active'), '★設定へ 行っていない★');
    /* ★行っただけで 札が 0枚では 意味が 無い★＝タブと 同じ道を 通っているか */
    eq(doc.querySelectorAll('#s-tpl [data-tpl]').length, TPL_N,
      '★設定へ 着いたのに 様式の札が 描かれていない★');
    ok(doc.getElementById('s-tpl-card'), '飛び先の 札に 目印(id)が 無い');
    eq(win.SeikyuApp._state.cur.partner_id, before, '★行ったら 相手が消えた（続きからになっていない）★');
  });

  await T('⑥ ★見本の形が A4縦★／★紙が枠から はみ出さない★／★2枚とも 画面に入る★（Chromeで実測）', async () => {
    /* ★2026-08-26 司さんの指摘★ 前は 枠が 298×190（横÷縦 1.57＝横長）で、
       中のA4縦の紙が ★下から80px はみ出して切れていた★＝★紙が横に見えた★。 */
    const { doc } = await bootSet(appSrc);
    const j = await measureShape(doc);
    eq(j.vw, 390, '390pxで測れていない');
    eq(j.shots.length, TPL_N, '見本の数');
    j.shots.forEach((s2, i) => {
      const katachi = s2.w / s2.h;
      ok(Math.abs(katachi - 210 / 297) < 0.03,
        '★' + (i + 1) + '枚目の枠が A4縦の形でない★ ' + s2.w + '×' + s2.h + '（横÷縦 ' + katachi.toFixed(2) + '／ほしい 0.71）');
      ok(s2.ph <= s2.h + 2, '★' + (i + 1) + '枚目の紙が 枠から ' + (s2.ph - s2.h) + 'px はみ出している（下が切れる）★');
      ok(s2.pw <= s2.w + 2, '★' + (i + 1) + '枚目の紙が 横に はみ出している★');
      /* ★紙が 枠いっぱいに出ているか★＝左上だけ出て 見切れていないか */
      ok(s2.read, '★' + (i + 1) + '枚目の 見本の中を読めません（測れていない＝0と言わない）★');
      ok(s2.own, '★' + (i + 1) + '枚目は 紙そのものを縮めていない★＝入れ物を縮めると'
        + ' 紙が先に切られて ★左上だけ出る（見切れ）★');
      ok(s2.sw >= s2.w * 0.9 && s2.sh >= s2.h * 0.9,
        '★' + (i + 1) + '枚目の紙が 見切れている★ 枠 ' + s2.w + '×' + s2.h
        + ' に対して 紙は ' + s2.sw + '×' + s2.sh + '（枠の9割を埋めていない）');
      ok(s2.sw <= s2.w + 2 && s2.sh <= s2.h + 2,
        '★' + (i + 1) + '枚目の紙が 枠から出ている★ ' + s2.sw + '×' + s2.sh);
    });
    ok(j.shots[1].top < 844, '★2枚目が 画面の外＝スクロールしないと気づけない★（top ' + j.shots[1].top + '）');
    console.log('      枠 ' + j.shots.map((x) => x.w + '×' + x.h).join(' / ')
      + '　紙 ' + j.shots.map((x) => x.pw + '×' + x.ph).join(' / '));
  });

  await T('⑦ ★前回の紙を 聞かずに そのまま 使う／根拠に「（消えた取引先）」を出さない★', async () => {
    /* ★2026-08-26 実配信で踏んだ★…古い1通から名前を引いていたので、
       その相手が消えていると ★「（消えた取引先）には 前回…」★ と客に出た。
       ★2026-09-05★ 紙の様式を 設定へ 寄せたので、当てる中身は ★聞かずに 効かせる★形に した
       （捨てていない＝templateForPartner の 2番目に 入っている）。 */
    const { win, doc } = await boot(appSrc, { invoices: [{
      id: 'iv_old', account_id: 'u1', doc_type: 'invoice', no: '202608-001', partner_id: 'pt_a',
      issue_ymd: '2026-08-18', due_ymd: null, status: 'issued', tax_mode: 'exclusive', rounding: 'floor',
      lines: [], totals: {}, snapshot: {}, data: {}, template_id: 'elegant', quote_from: null,
      issued_at: '2026-08-18T00:00:00Z', sent_at: null, voided_at: null, updated_at: '2026-08-18T00:00:00Z',
    }] });
    const S = win.SeikyuApp._state;
    /* 画面を 行き来する＝前回の 紙を 引き直す道（お客さんの道） */
    doc.querySelector('.bn[data-scr="scr-set"]').click();
    await sleep(250);
    doc.querySelector('.bn[data-scr="scr-edit"]').click();
    await sleep(400);
    eq(S.cur.template_id, 'elegant', '★前回の紙を 使っていない（当てる中身が 死んでいる）★');
    const na = (doc.getElementById('tpl-strip-v').textContent || '');
    ok(/ひかえめ/.test(na), '1行が 前回の紙に なっていない: ' + na);
    const t = (doc.getElementById('tpl-strip-why').textContent || '');
    ok(t.indexOf('前回') >= 0, '根拠を 言っていない: ' + t.slice(0, 60));
    ok(t.indexOf('消えた') < 0, '★「消えた取引先」が客の字に出ている★: ' + t.slice(0, 80));
    ok(t.indexOf('A株式会社') >= 0, '今の相手の名前で言っていない: ' + t.slice(0, 80));
  });

  await T('⑤ ★紙が出せない時は 押せなくして 理由を出す★（黙って何も起きない を無くす）', async () => {
    const { win, doc } = await boot(appSrc);
    ok(!doc.getElementById('b-print').disabled, 'はじめから押せない（測れていない）');
    win.SeikyuApp._state.cur.partner_id = '';
    doc.getElementById('e-partner').value = '';
    win.SeikyuApp._recalcForTest();
    await sleep(200);
    /* ★1つだけ見て「門は効いている」と言わない★＝★紙から作る物 ぜんぶ★を見る
       （2026-08-30 実際に b-pdf だけ 門から漏れていた） */
    const btns = win.SeikyuApp._paperBtnsForTest();
    ok(btns.length >= 4, '★門を掛ける相手が ' + btns.length + '個＝数えられていない★');
    const open = btns.filter((id) => { const b = doc.getElementById(id); return b && !b.disabled; });
    ok(!open.length, '★相手が無いのに まだ押せる★ ' + open.join(' / '));
    /* ★画面に在る「紙から作る物」が 一覧から漏れていないか★（漏れたら 門が掛からない） */
    const inBox = [...doc.getElementById('out-box').querySelectorAll('button')]
      .map((b) => b.id).filter((id) => id && id !== 'b-save');
    const miss = inBox.filter((id) => btns.indexOf(id) < 0);
    ok(!miss.length, '★門の一覧から 漏れている出し口★ ' + miss.join(' / '));
    console.log('     門を掛けた ' + btns.join(' / ') + '（' + inBox.length + '個ぜんぶ）');
    const g = doc.getElementById('paper-gate');
    ok(g && g.style.display !== 'none' && /だれに/.test(g.textContent || ''),
      '★押せない理由が出ていない★ 出た字: ' + (g ? g.textContent : 'なし'));
  });
}

const APP = path.join(ROOT, 'seikyu/js/seikyu-app.js');
if (!SELF) {
  await run('本物の seikyu-app.js');
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
} else {
  /* ★わざと壊す★ … 1問目を出さない姿へ戻すと 赤になるか */
  /* ★2026-09-05★ 決めが 変わった（紙の様式は 設定 1か所）ので、壊す所も 変えた。
     ★壊す形＝「設定で 変えても 入力に 効かない」★＝2026-09-05 に 実際に 出た形
       （tplSync を 呼ばないと ★設定は koujo なのに 入力の 1行は 前のまま★だった）。
     ★これを 見逃す 見張りなら、次に 同じ事を した日にも 見逃す★ */
  console.log(String.fromCharCode(10) + '★自己診断★ … 設定を 入力に 効かせない姿へ戻して 赤が出るかを見る');
  const keep = fs.readFileSync(APP, 'utf8');
  const mark = '  function tplSync() {';
  if (keep.indexOf(mark) < 0) { console.log('  ★壊す場所が見つからない＝この自己診断は古い★'); process.exit(2); }
  await run('設定を 入力に 効かせない seikyu-app.js（わざと壊した）',
    keep.replace(mark, '  function tplSync() { return;'));
  console.log('\n  わざと壊した時に 赤になった数 … ' + fail + '件（2件以上のはず）');
  if (fail < 2) { console.log('  ✗ ★空振りです★ 壊しても赤にならない'); process.exit(1); }
  console.log('  ✓ ★壊したら赤になった＝この試験は本当に見張っています★');
  process.exit(0);
}
