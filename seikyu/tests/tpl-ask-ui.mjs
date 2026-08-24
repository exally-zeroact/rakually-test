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
  const src = fs.readFileSync(path.join(ROOT, 'tests/fake-supa.js'), 'utf8');
  const m = { exports: {} };
  new Function('module', 'exports', src)(m, m.exports);
  win.__mkSb = () => m.exports.createFakeSupa({
    uid: 'u1',
    tables: {
      pay_org: [{ account_id: 'u1', data: { yago: '合同会社Rakually', invoiceNo: 'T3500003003293' }, updated_at: '2026-08-01T00:00:00Z' }],
      pay_partners: [{ id: 'pt_a', account_id: 'u1', sort: 0, data: { name: 'A株式会社', keisho: '御中' }, deleted_at: null }],
      pay_invoices: [], pay_receipts: [],
      pay_companies: [{ account_id: 'u1', data: {}, updated_at: '2026-08-01T00:00:00Z' }],
    },
    pk: { pay_org: 'account_id', pay_companies: 'account_id' },
    unique: { pay_invoices: [['account_id', 'doc_type', 'no']] },
  });
  const DROP = ['supa-config.js', 'auth.js', 'env-badge.js', 'store.js', 'rakually-login.js'];
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

async function run(label, appSrc) {
  console.log('\n[' + label + '] ★押す物の一覧（先に書く）★');
  console.log('  ① 1問目が出る ② 見本2枚が別の絵 ③ 選ぶ→畳んで1行 ④ [変える]で戻って続きから ⑤ 出せない時は押せない');

  await T('① ★新しく作ると まず「どの紙で出しますか」が出る★（何を書くかより先）', async () => {
    const { doc } = await boot(appSrc);
    const card = doc.getElementById('tpl-card');
    ok(card && card.style.display !== 'none', '1問目が出ていない');
    ok(/どの紙で出しますか/.test(card.textContent || ''), '問いの字が違う');
  });

  await T('② ★見本を一緒に見せる／2枚は 別の絵★（同じ絵なら 見本が嘘）', async () => {
    const { doc } = await boot(appSrc);
    const shots = [...doc.querySelectorAll('.tpl-shot iframe')].map((f) => f.getAttribute('srcdoc') || '');
    eq(shots.length, 2, '見本の数');
    ok(shots[0].length > 500 && shots[1].length > 500, '★見本が空＝描けていない★');
    ok(shots[0] !== shots[1], '★見本2枚が 同じ絵＝様式が効いていない（見本が嘘）★');
  });

  await T('③ ★選ぶと その場で畳んで 1行になる★（1問ごと保存）', async () => {
    const { win, doc } = await boot(appSrc);
    doc.querySelectorAll('.tpl-pick')[1].click();
    await sleep(250);
    eq(doc.getElementById('tpl-card').style.display, 'none', '畳んでいない');
    ok(doc.getElementById('tpl-strip').style.display !== 'none', '1行になっていない');
    ok((doc.getElementById('tpl-strip-v').textContent || '').length > 2, '選んだ紙の名前が出ていない');
    eq(win.SeikyuApp._state.cur.template_id, 'elegant', '選んだ紙が入っていない');
  });

  await T('④ ★[変える]で 戻れる／中身は残る（続きから）★', async () => {
    const { win, doc } = await boot(appSrc);
    const before = win.SeikyuApp._state.cur.partner_id;
    doc.querySelectorAll('.tpl-pick')[1].click();
    await sleep(250);
    doc.getElementById('b-tpl-change').click();
    await sleep(200);
    ok(doc.getElementById('tpl-card').style.display !== 'none', '戻れていない');
    eq(win.SeikyuApp._state.cur.partner_id, before, '★戻ったら 相手が消えた（続きからになっていない）★');
    eq(win.SeikyuApp._state.cur.template_id, 'elegant', '★戻ったら 選んだ紙が消えた★');
  });

  await T('⑤ ★紙が出せない時は 押せなくして 理由を出す★（黙って何も起きない を無くす）', async () => {
    const { win, doc } = await boot(appSrc);
    ok(!doc.getElementById('b-print').disabled, 'はじめから押せない（測れていない）');
    win.SeikyuApp._state.cur.partner_id = '';
    doc.getElementById('e-partner').value = '';
    win.SeikyuApp._recalcForTest();
    await sleep(200);
    ok(doc.getElementById('b-print').disabled, '★相手が無いのに 印刷が押せる★');
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
  console.log('\n★自己診断★ … 1問目を出さない姿へ戻して 赤が出るかを見る');
  const keep = fs.readFileSync(APP, 'utf8');
  const mark = '    show(card, !asked); show(strip, asked);';
  if (keep.indexOf(mark) < 0) { console.log('  ★壊す場所が見つからない＝この自己診断は古い★'); process.exit(2); }
  await run('1問目を出さない seikyu-app.js（わざと壊した）',
    keep.replace(mark, '    show(card, false); show(strip, asked);'));
  console.log('\n  わざと壊した時に 赤になった数 … ' + fail + '件（2件以上のはず）');
  if (fail < 2) { console.log('  ✗ ★空振りです★ 壊しても赤にならない'); process.exit(1); }
  console.log('  ✓ ★壊したら赤になった＝この試験は本当に見張っています★');
  process.exit(0);
}
