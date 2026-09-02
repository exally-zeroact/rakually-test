/* state-seikyu.mjs — ★請求書の「今どんな状態か」を 動かして数える★
 * =============================================================================
 * なぜ要るか（司さん 2026-08-19「給料、請求のコードを深く確認して どんな状態かも分かるように」）:
 *   ★読んだだけは「確かめた」ではない★。ここは ★本物の seikyu-app.js を動かして★ 1周を通し、
 *   段ごとに ★数★を出す。docs/STATE_seikyu.md の数字は この道具が正。
 *   （給与の scripts/state-kyuyo.mjs と ★同じ形・同じ道具★。新しいやり方を作らない）
 *
 * ★1段目は「何を」ではなく ★紙の様式（テンプレ）を決めさせる★★（司さんの決定・指示役 2026-08-22）
 *   ＝業者ごとに紙が全く違う。何を書くかより先に ★どの紙か★ を決める。
 *
 * 使い方:
 *   node scripts/state-seikyu.mjs            … 測って出す
 *   node scripts/state-seikyu.mjs --json     … 数だけ出す
 *   node scripts/state-seikyu.mjs --check    … docs/STATE_seikyu.md の数と突き合わせ（ズレたら赤）
 *   node scripts/state-seikyu.mjs --self-test … 数を1つ変えたら赤になるか
 *
 * ★0件を「未検査」で出さない★ … 動かせなかった段は ★未測定★と書く（0とは書かない）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const require_ = createRequire(pathToFileURL(path.join(ROOT, 'package.json')));
let JSDOM;
try { ({ JSDOM } = require_('jsdom')); }
catch { console.error('★jsdom が要ります（npm install）。測れないので止めます（0と言わない）。'); process.exit(2); }

const N = {};        // 出す数（doc と突き合わせる物）
const note = [];     // 気づいた事
const stage = [];    // 段

/* ── 本物の画面を動かす ─────────────────────────────── */
const file = path.join(ROOT, 'seikyu/index.html');
const html = fs.readFileSync(file, 'utf8');
const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/seikyu/index.html',
});
const win = dom.window, doc = win.document;
win.fetch = () => Promise.reject(new Error('no net'));
win.alert = () => {}; win.confirm = () => true; win.scrollTo = () => {}; win.print = () => {};
win.URL.createObjectURL = () => 'blob:fake';
win.open = () => ({ document: { write() {}, close() {} }, focus() {}, print() {}, close() {} });
const errs = [];
win.addEventListener('error', (e) => errs.push(String(e.message || e)));
win.addEventListener('unhandledrejection', (e) => errs.push('未処理:' + ((e.reason && e.reason.message) || e.reason)));

/* 倉庫は偽物（本物の倉庫は触らない） */
{
  const src = fs.readFileSync(path.join(ROOT, 'tests/fake-supa.js'), 'utf8');
  const m = { exports: {} };
  new Function('module', 'exports', src)(m, m.exports);
  win.__mkSb = () => m.exports.createFakeSupa({
    uid: 'u1',
    tables: {
      pay_org: [{ account_id: 'u1', data: { yago: '合同会社Rakunally', invoiceNo: 'T3500003003293' }, updated_at: '2026-08-01T00:00:00Z' }],
      pay_partners: [{ id: 'pt_a', account_id: 'u1', sort: 0, data: { name: 'A株式会社', keisho: '御中' }, deleted_at: null }],
      /* ★行を 入れて 測る★（2026-09-02）
         前は pay_invoices: [] ＝★空の倉庫★で 測っていたので、⑩一覧は いつも 0行で
         ★「行が出た時の姿は 未測定」と 書き続けていた★（見ていない物を 見たと 書かない為の正しい札だが、
         ★入れれば 測れる★のに 入れていなかった＝未測定を 減らせる所）。
         ★偽データ自体も 嘘をつく★ので、下の⑩で ★倉庫に入れた物と 画面に出た物を 突き合わせる★。 */
      pay_invoices: [
        { id: 'iv_1', account_id: 'u1', partner_id: 'pt_a', doc_type: 'invoice', no: 'A-0001',
          status: 'issued', issue_ymd: '2026-08-05', due_ymd: '2026-08-31',
          lines: [{ name: '室外機オーバーホール', qty: '1', unit: '式', price: '30000', amount: '30000', rate: 10 }],
          totals: { grandTotal: 33000 }, data: {}, deleted_at: null },
        { id: 'iv_2', account_id: 'u1', partner_id: 'pt_a', doc_type: 'invoice', no: 'A-0002',
          status: 'issued', issue_ymd: '2026-08-25', due_ymd: '2026-09-30',
          lines: [{ name: 'エアコン取替', qty: '2', unit: '台', price: '12000', amount: '24000', rate: 10 }],
          totals: { grandTotal: 26400 }, data: {}, deleted_at: null },
        { id: 'iv_3', account_id: 'u1', partner_id: 'pt_a', doc_type: 'invoice', no: '',
          status: 'draft', issue_ymd: '2026-09-01', due_ymd: '',
          lines: [{ name: '点検', qty: '1', unit: '式', price: '5000', amount: '5000', rate: 10 }],
          totals: { grandTotal: 5500 }, data: {}, deleted_at: null },
        { id: 'iv_4', account_id: 'u1', partner_id: 'pt_a', doc_type: 'invoice', no: 'A-0003',
          status: 'void', issue_ymd: '2026-07-05', due_ymd: '2026-07-31',
          lines: [{ name: '取り消した分', qty: '1', unit: '式', price: '1000', amount: '1000', rate: 10 }],
          totals: { grandTotal: 1100 }, data: {}, deleted_at: null },
      ],
      pay_receipts: [],
      pay_companies: [{ account_id: 'u1', data: {}, updated_at: '2026-08-01T00:00:00Z' }],
    },
    pk: { pay_org: 'account_id', pay_companies: 'account_id' },
    unique: { pay_invoices: [['account_id', 'doc_type', 'no']] },
  });
}
const DROP = ['supa-config.js', 'auth.js', 'env-badge.js', 'store.js', 'rakunally-login.js'];
for (const m of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
  const src = m[1].split('?')[0];
  if (/^https?:/.test(src) || DROP.indexOf(src.split('/').pop()) >= 0) continue;
  const p = path.resolve(path.dirname(file), src);
  if (!fs.existsSync(p)) continue;
  const el = doc.createElement('script');
  el.textContent = fs.readFileSync(p, 'utf8');
  doc.body.appendChild(el);
}
await new Promise((r) => setTimeout(r, 500));
if (win.SeikyuApp && win.SeikyuApp.attach) await win.SeikyuApp.attach(win.__mkSb());
await new Promise((r) => setTimeout(r, 400));

const T = require_(path.join(ROOT, 'seikyu/lib/seikyu-templates.js'));
const C = require_(path.join(ROOT, 'seikyu/lib/seikyu-cols.js'));
const X = require_(path.join(ROOT, 'seikyu/lib/seikyu-tax.js'));
const D = require_(path.join(ROOT, 'seikyu/lib/seikyu-doc.js'));
const P = require_(path.join(ROOT, 'seikyu/lib/seikyu-partner-ask.js'));
const KR = require_(path.join(ROOT, 'seikyu/lib/seikyu-carry.js'));
const NM = require_(path.join(ROOT, 'seikyu/lib/seikyu-name.js'));

/* ── ① 紙の様式（テンプレ）を決める ★ここが1段目★ ── */
{
  N.紙の様式 = T.list().length;
  /* ★作る時に 先に聞くか★（司さん 2026-08-17）＝新しい請求書を1通 作って 実際に見る。
     ★body.textContent で字を探さない★＝<script> の中身まで入るので嘘の数になる（2026-08-24 に踏んだ）。 */
  doc.getElementById('b-new').click();
  await new Promise((r) => setTimeout(r, 400));
  const card = doc.getElementById('tpl-card');
  N.作る時に聞く箱 = (card && card.style.display !== 'none') ? 1 : 0;
  /* ★見本も一緒に見せるか★（司さん 2026-08-24）＝見本の絵が何枚 描けているか（空は数えない） */
  const shots = [...doc.querySelectorAll('.tpl-shot iframe')]
    .map((f) => f.getAttribute('srcdoc') || '').filter((x) => x.length > 500);
  N.見本の絵 = shots.length;
  /* ★2枚 決め打ちをやめる★＝様式が3つになったら 3枚とも別の絵か を見る（2026-08-27）
     ★「2枚の時だけ見る」形は 3枚目を足した瞬間 黙って0になった★＝決め打ちの穴。 */
  N.見本が別の絵 = (shots.length >= 2 && new Set(shots).size === shots.length) ? 1 : 0;
  /* ★戻って続きから★（司さん 2026-08-24）＝[変える]が在るか */
  N.戻る動線 = doc.getElementById('b-tpl-change') ? 1 : 0;
  stage.push({
    段: '① 紙の様式を決める', 状態: (N.作る時に聞く箱 && N.見本の絵 >= 2 && N.戻る動線) ? '半分' : '無い',
    数: '様式 ' + N.紙の様式 + '種／作る時に聞く ' + N.作る時に聞く箱 + '／見本 ' + N.見本の絵
      + '枚（別の絵 ' + N.見本が別の絵 + '）／戻る動線 ' + N.戻る動線,
  });
  if (N.紙の様式 < 3) note.push('★様式が3種に足りない（実物は47通・11通が控除型）★');
  if (!N.見本が別の絵) note.push('★見本に 同じ絵が混ざっている＝様式が効いていない（見本が嘘）★');
}

/* ── ② 自社を入れる（紙に刷られる物） ── */
{
  const { execFileSync } = await import('node:child_process');
  const run = (args) => {
    try {
      const out = execFileSync(process.execPath, ['scripts/count-fields.mjs', 'seikyu/index.html', ...args], { cwd: ROOT, encoding: 'utf8' });
      const m = /人が埋める欄 (\d+)/.exec(out); return m ? Number(m[1]) : null;
    } catch (e) {
      const out = String((e.stdout || '') + (e.stderr || ''));
      const m = /人が埋める欄 (\d+)/.exec(out); return m ? Number(m[1]) : null;
    }
  };
  N.欄_畳んだまま = run(['--closed']);
  N.欄_ぜんぶ開く = run([]);
  if (N.欄_ぜんぶ開く == null) note.push('★欄の数を測れませんでした（未測定）★');
  stage.push({ 段: '② 自社を入れる', 状態: N.欄_ぜんぶ開く == null ? '未測定' : '出来ている',
    数: '人が埋める欄 ' + N.欄_畳んだまま + '個（畳んだまま）／' + N.欄_ぜんぶ開く + '個（ぜんぶ開く）' });
}

/* ── ③ 取引先を作る（聞いて選ばす） ── */
{
  const q = P.questions({ partner: null, partners: [], terms: [], org: {} });
  N.取引先の問 = (q && q.list) ? q.list.length : null;
  N.取引先の当て = (q && q.list) ? q.list.filter((x) => x.guess).length : null;
  if (N.取引先の問 == null) { note.push('★取引先の問を数えられませんでした（未測定）★'); }
  stage.push({ 段: '③ 取引先を作る', 状態: N.取引先の問 == null ? '未測定' : '出来ている',
    数: '聞く問 ' + N.取引先の問 + '問／当てて見せる ' + N.取引先の当て + '問' });
}

/* ── ④ 何を書くか（明細） ── */
{
  N.列の役目 = (C.ROLE_KEYS || []).length;
  N.列の最大 = C.MAX_COLS;
  N.明細の最大行 = X.MAX_LINES;
  stage.push({ 段: '④ 明細を書く', 状態: '出来ている',
    数: '列の役目 ' + N.列の役目 + '個／列は最大 ' + N.列の最大 + '／行は最大 ' + N.明細の最大行 });
}

/* ── ⑤ 消費税・控除・源泉・繰越 ── */
{
  N.税の入れ方 = (X.TAX_MODES || []).length || Object.keys(X.TAX_MODES || {}).length;
  N.税の丸め = (X.ROUNDINGS || []).length || Object.keys(X.ROUNDINGS || {}).length;
  N.控除の最大 = D.MAX_DEDUCTIONS;
  N.繰越の行 = (KR.ROWS || []).length;
  stage.push({ 段: '⑤ 税・控除・繰越', 状態: '出来ている',
    数: '税の入れ方 ' + N.税の入れ方 + '／丸め ' + N.税の丸め + '／控除 最大' + N.控除の最大 + '／繰越の行 ' + N.繰越の行 });
}

/* ── ⑥ 番号と締め ── */
{
  N.番号の形 = (D.NUMBER_FORMATS || []).length || Object.keys(D.NUMBER_FORMATS || {}).length;
  N.支払い条件 = (D.PAY_TERMS || []).length || Object.keys(D.PAY_TERMS || {}).length;
  stage.push({ 段: '⑥ 番号と締め', 状態: '出来ている',
    数: '番号の形 ' + N.番号の形 + '通り／支払い条件 ' + N.支払い条件 + '通り' });
}

/* ── ⑦ 紙を出す ── */
{
  N.紙の種類 = (D.DOC_KINDS || []).length;
  N.出す形 = (NM.EXTS || []).length || Object.keys(NM.EXTS || {}).length;
  /* ★下絵が0枚なら 印刷ボタンは押せない★（給与で同じ穴を踏んだ）＝押して確かめる所 */
  const pv = doc.querySelectorAll('#paper-preview, .paper-page, [data-paper]').length;
  N.紙の下絵 = pv;
  stage.push({ 段: '⑦ 紙を出す', 状態: pv ? '出来ている' : '半分',
    数: '紙の種類 ' + N.紙の種類 + '（請求/見積/領収）／出す形 ' + N.出す形 + '／下絵 ' + pv + '枚' });
  if (!pv) note.push('★ここでは 紙の下絵を描かせていない（未測定）＝実配信で押して見る所★');
}

/* ── ⑧ 渡す ── */
{
  /* ★メールで送る口は Rakunally に無い★（あるなら数える）
     ★body.innerHTML を見ない★＝<script> の中身（app.js の source）まで入るので
     ★ソースにその字が在るだけで「在る」と数えてしまう★（2026-08-24 に実際に踏んだ）。
     ⇒ ★押せる物・リンクだけを見る★。 */
  const mail = [...doc.querySelectorAll('a[href^="mailto:"], button, a')]
    .filter((e) => /mailto:/.test(e.getAttribute('href') || '') || /送る|送信|メールで/.test(e.textContent || ''))
    .length;
  N.渡す口 = mail;
  stage.push({ 段: '⑧ 渡す', 状態: mail ? '半分' : '無い',
    数: '送る口 ' + mail + '個（今は 紙/PDFを 人が渡す）' });
}

/* ── ⑨ 入金の記録 ── */
{
  N.入金の方法 = (D.PAY_METHODS || []).length || Object.keys(D.PAY_METHODS || {}).length;
  N.状態 = (D.STATUSES || []).length;
  stage.push({ 段: '⑨ 入金を記録する', 状態: '出来ている',
    数: '入金の方法 ' + N.入金の方法 + '通り／請求書の状態 ' + N.状態 + '通り' });
}

/* ── ⑩ 一覧・集計 ── */
{
  /* ★描かれた行を 数える★（選ばれた行数ではなく 画面に 出た物）
     ★倉庫に入れた物と 突き合わせる★＝偽データが 嘘をついていないかを 見る。 */
  /* ★物差しが 間違っていた（2026-09-02 実測）★
     ここは `#list-body tr, .inv-row, [data-inv]` を 数えていたが、
     一覧は ★<button class="row" data-open="…"> で 描かれている★＝
     ★行が 何通 在っても 永久に 0行★と出る物差しだった（倉庫を空にしていた事も 重なっていた）。
     ＝[[feedback_doubt_your_own_ruler_first]]／★描かれた物を 数える★ */
  const drawn = () => Array.from(doc.querySelectorAll('#list-body [data-open]'));
  const rows = drawn();
  N.一覧の行 = rows.length;
  const txt = rows.map((r) => (r.textContent || '').replace(/\s+/g, ' ')).join(' ／ ');
  const inStore = 4, live = 3;   /* 倉庫に入れた通数／取り消し以外 */
  const hasName = /A株式会社/.test(txt);
  const hasMoney = /33,000|26,400/.test(txt);
  const hasVoid = /A-0003/.test(txt);
  stage.push({ 段: '⑩ 一覧で見る', 状態: (rows.length === live && hasName && hasMoney) ? '出来ている' : '半分',
    数: '一覧の行 ' + rows.length + '行（倉庫 ' + inStore + '通・取り消し以外 ' + live + '通）'
      + '／相手の名前 ' + (hasName ? '出る' : '★出ない★')
      + '／金額 ' + (hasMoney ? '出る' : '★出ない★')
      + '／取り消しは 既定で ' + (hasVoid ? '★出る（既定が おかしい）★' : '出ない') });
  if (!rows.length) note.push('★一覧は 0行＝行が出た時の姿は 未測定★');
  else if (rows.length !== live || !hasName || !hasMoney) {
    note.push('★一覧に 入れた物が そのまま 出ていない（倉庫 ' + live + '通／画面 ' + rows.length + '行）★');
  }
}

/* ── 深く見る（給与と同じ6つ） ── */
{
  const libs = fs.readdirSync(path.join(ROOT, 'seikyu/lib')).filter((f) => /\.js$/.test(f));
  N.請求書のlib = libs.length;
  /* 呼ばれていない lib（入口のHTMLから辿れない物） */
  const entry = fs.readFileSync(file, 'utf8');
  const used = libs.filter((f) => entry.indexOf(f) >= 0
    || fs.readFileSync(path.join(ROOT, 'seikyu/js/seikyu-app.js'), 'utf8').indexOf(f.replace(/\.js$/, '')) >= 0);
  N.呼ばれていないlib = libs.length - used.length;
  if (N.呼ばれていないlib) note.push('★誰も呼んでいない lib … ' + libs.filter((f) => used.indexOf(f) < 0).join(' , ') + '★');

  /* 客の画面に「出来ていない物の言葉」が無いか */
  const words = /未対応|未実装|TODO|工事中|準備中/;
  const files = ['seikyu/index.html', 'seikyu/js/seikyu-app.js'];
  let bad = 0;
  files.forEach((f) => {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    (s.match(new RegExp(words.source, 'g')) || []).forEach(() => bad++);
  });
  N.出来ていない物の言葉 = bad;
  if (bad) note.push('★客の画面に「未対応」等の言葉が ' + bad + '件★');
}
N.動かして出たJSの落ち = errs.length;
if (errs.length) note.push('★動かしたら JSが落ちた … ' + errs.slice(0, 3).join(' / ') + '★');

/* ═══ 出す ═══ */
const counts = { '出来ている': 0, '半分': 0, '無い': 0, '未測定': 0 };
stage.forEach((s) => { if (counts[s.状態] !== undefined) counts[s.状態]++; });

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ N, stage, counts, note }, null, 1));
} else {
  console.log('\n[請求書の状態] ★動かして数えた★');
  console.log('  出来ている ' + counts['出来ている'] + '段 ／ 半分 ' + counts['半分'] + '段 ／ 無い '
    + counts['無い'] + '段 ／ 未測定 ' + counts['未測定'] + '段');
  stage.forEach((s) => console.log('  ' + s.段.padEnd(18) + ' ' + String(s.状態).padEnd(6) + ' ' + s.数));
  console.log('\n  ── 深く見た数 ──');
  Object.keys(N).forEach((k) => console.log('  ' + k.padEnd(20) + ' ' + N[k]));
  if (note.length) { console.log('\n  ── 気づいた事 ──'); note.forEach((x) => console.log('  ' + x)); }
}

/* ═══ 数が古くならないようにする ═══ */
const DOC = path.join(ROOT, 'docs/STATE_seikyu.md');
function docNumbers() {
  if (!fs.existsSync(DOC)) return null;
  const s = fs.readFileSync(DOC, 'utf8');
  const m = /<!--\s*数\s*([\s\S]*?)-->/.exec(s);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}
if (process.argv.includes('--check') || process.argv.includes('--self-test')) {
  let want = docNumbers();
  if (!want) { console.error('\n★docs/STATE_seikyu.md に 数の塊が無い（<!-- 数 {…} -->）★'); process.exit(1); }
  if (process.argv.includes('--self-test')) {
    want = Object.assign({}, want);
    const k = Object.keys(want)[0];
    want[k] = Number(want[k]) + 1;                      // わざと1つ ずらす
    const bad = Object.keys(want).filter((x) => String(want[x]) !== String(N[x]));
    console.log('\n★自己確認★ 数を1つ ずらすと … 合わない数 ' + bad.length + '件');
    if (!bad.length) { console.error('  NG ★ずらしても赤にならない＝見張りが効いていない★'); process.exit(1); }
    console.log('  ok  ちゃんと赤になる');
    process.exit(0);
  }
  const bad = Object.keys(want).filter((x) => String(want[x]) !== String(N[x]));
  if (bad.length) {
    console.error('\n★書いてある数と 合いません（' + bad.length + '件）★');
    bad.forEach((x) => console.error('   ' + x + ' … 書いてある ' + want[x] + ' ／ 測ったら ' + N[x]));
    console.error('  docs/STATE_seikyu.md の <!-- 数 --> を 測り直した数へ直してください。');
    process.exit(1);
  }
  console.log('\n書いてある数と ぜんぶ一致（' + Object.keys(want).length + '個）。');
}
