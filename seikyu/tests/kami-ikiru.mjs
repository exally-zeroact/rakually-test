/* kami-ikiru.mjs — ★入力したら 紙が その場で 映る★（司さん 2026-11-04「完成形の PDF が見えないまま入力するのでイメージ湧かない」）
 * ============================================================================
 * ★設計の正本★＝記憶 project_rakunally_sonoba_no_kami_taiketsu_2026-11-06.md（taiketsu 止14＋2〜8回目）
 *   持つ物は3つ＝omote（表に出ている全文）・machi（裏で待っている {n, html}）・n（番号）。
 *   道1 画面の外・S.cur!==S.gamen＝何もしない／道2 止まる＝表と裏を空・理由／道3 同じ全文＝何もしない／
 *   道4 裏に書いて load か 260ms で n が合う時だけ入れ替え／道5 b-preview＝今すぐ表へ。
 *
 * ★ここで見る事★（jsdom は srcdoc の load が 0回＝入れ替えは いつも 260ms の時計で起きる）
 *   ・落ち着いた後は いつも「表の紙 ＝ 今の中身から組んだ紙（_paperHtml）」（どの道を通っても）
 *   ・膜（作成中）は 落ち着いた後 0・止まった時は 表も裏も 前の紙を 持たない
 *   ・帯「紙を見る」から開く窓は 今の1通の 見出しで、ファイルを作るボタンは 出さない（09-08 司さん「ここにいらん」）
 *
 * ★--waza★ … 決まりを 1つずつ 外した 本体で 回し直し、どれも ★狙った 試験で★ 赤に なるか（空振り止め）
 *   壊しは 下の WAZA の 12個（n の比べ・止める時の kamiBan・別の1通で空にする・道3・帯のボタン2つ・同じ1通・
 *   白の帯・帯の窓の描き直し・確認の窓の守り kamiObiAku・設定の紙と印の紙の全文比べ）。各々に「赤に なるべき 試験の 名」を 持たせる
 *
 * 使い方: node seikyu/tests/kami-ikiru.mjs   ／   --waza
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/* ★わざと 外す 決まり★（本体の 字を 1か所だけ 置き換える＝置き換えが 当たらなければ 試験の 方が 壊れている）
   3つ目＝★赤に なるべき 試験の 名★（その 名の ✗ だけを「見つけた」と 数える＝別の 試験が 時間で 揺れた ✗ を 拾わない・taiketsu 11回目 任1） */
const WAZA = {
  'n の比べ': ['if (!kamiMachi || kamiMachi.n !== n) return;', 'if (!kamiMachi) return;', '前の番の 時計で'],
  '止める時の kamiBan': ['  function kamiTomeru(why) {\n    kamiBan(null);', '  function kamiTomeru(why) {\n    void 0;', '㋐ 待っている間に 壊す'],
  '別の1通で 空にする': ['    if (v === kamiNo) return;\n    kamiNo = v;', '    return;\n    kamiNo = v;', '㋔2 中身の整った'],
  /* taiketsu 9回目 止1・止2・任2 */
  '道3 を omote だけと 比べる': ['if (html === (kamiMachi ? kamiMachi.html : kamiOmoteHtml)) { kamiNuri(); return; }', 'if (html === kamiOmoteHtml) { kamiNuri(); return; }', 'A→B→A を 240ms おき'],
  '帯でも ボタンを 隠さない': ["c.style.display = obi ? 'none' : '';", "c.style.display = '';", '帯「紙を見る」＝今の1通の見出し'],
  'lookOpen() で ボタンを 戻さない': ["c.style.display = obi ? 'none' : '';", "if (obi) c.style.display = 'none';", '帯で 開いて 閉じた 後'],
  '同じ1通でも 毎回 空にする': ['    if (v === kamiNo) return;\n    kamiNo = v;', '    kamiNo = v;', '下書きを保存した後も'],
  /* taiketsu 10回目 A */
  '白でも 帯を 押せる': ["obi.disabled = kamiOmoteHtml === '';", 'obi.disabled = false;', '白の時は 帯'],
  '帯の窓を 描き直さない': ["if (kamiObiAku && lookOpened() && kamiOmoteHtml !== '') {", 'if (false) {', '帯で 開いている 間に 打つ'],
  '確認の窓にも 入力の紙を 入れる': ["if (kamiObiAku && lookOpened() && kamiOmoteHtml !== '') {", "if (lookOpened() && kamiOmoteHtml !== '') {", '㋖ 一覧で 別の1通'],
  '設定の紙を 長さで 比べる': ["    if (fr.getAttribute('data-h') === '1' && fr.srcdoc === html) return;", "    if (fr.getAttribute('data-h') === '1' && fr.srcdoc.length === html.length) return;", '設定の 紙の下見'],
  '印の紙を 長さで 比べる': ["    if (!(fr.getAttribute('data-h') === '1' && fr.srcdoc === html)) {", "    if (!(fr.getAttribute('data-h') === '1' && fr.srcdoc.length === html.length)) {", '印の紙の下見'],
};
const wazaArg = process.argv.find((a) => a === '--waza' || a === '--self-test' || /^--waza=[12]$/.test(a));
if (wazaArg) {
  /* ★3本ずつ 並べて 回す・子は 狙いの 試験で 止まる・CI では 半分ずつ（--waza=1 / --waza=2）★
     ＝1本ずつ 全部 回すと 180秒を 越え、押す前の 網で「走らせられない」に なった（11-06 [04ed3e] 2回）。--waza は 全部 */
  const bu = (wazaArg.match(/=([12])$/) || [])[1];
  console.log('\n[--waza 決まりを 外すと 赤に なるか' + (bu ? '（' + bu + '/2）' : '') + ']');

  const hashiru = (name) => new Promise((res) => {
    const c = spawn(process.execPath, [fileURLToPath(import.meta.url)], { env: Object.assign({}, process.env, { KAMI_WAZA: name }) });
    let o = '';
    const kiru = setTimeout(() => { o += '\n（120秒で 切った）'; c.kill(); }, 120000);
    c.stdout.on('data', (d) => { o += d; }); c.stderr.on('data', (d) => { o += d; });
    c.on('close', (code) => { clearTimeout(kiru); res({ status: code, out: o }); });
  });
  const kekka = {};
  const zenbu = Object.keys(WAZA);
  const naka = Math.ceil(zenbu.length / 2);
  const names = bu === '1' ? zenbu.slice(0, naka) : bu === '2' ? zenbu.slice(naka) : zenbu;
  let tsugi = 0;
  const michi = async () => { while (tsugi < names.length) { const name = names[tsugi++]; kekka[name] = await hitotsu(name); } };
  async function hitotsu(name) {
    /* ★壊しは 3回まで★＝「n の比べ」は 前の 形（2回目を 予約で 460ms に 裏へ）で 古い番の 時計 480ms との 差が 20ms しか 無く、
       重い 時に 1回 空振りした（11-06 [04ed3e]）。今は 2回目を 400ms に _fillEdit で 今すぐ 裏へ＝差 60ms・単独 3/3 赤。
       ★素の 試験も 時間に 頼る★（240ms・540ms の 前置き）ので、数えるのは ★狙った 試験の 本当の assert の ✗ だけ★
       （どの ✗ でも 数えると、素が 揺れた ✗ で 3回の くじを 引く・前置きの ✗ は 見たい形に なっていない 印＝見つけたに しない）。
       置き換えが 当たらない 時は 回し直さない（試験の 方が 壊れている）。子が 固まったら 120秒で 切る（空振りに 数える＝止まる側） */
    const nerai = WAZA[name][2];
    let r, out = '', red = false, hit = '';
    for (let k = 0; k < 3 && !red; k++) {
      r = await hashiru(name);
      out = r.out;
      if (/置き換えが 当たらない/.test(out)) break;
      hit = (out.split('\n').find((l) => /^\s*✗ /.test(l) && nerai && l.includes(nerai) && !l.includes('前置き')) || '').trim();
      red = r.status !== 0 && hit !== '';
    }
    return { red, hit, nerai };
  }
  await Promise.all([michi(), michi(), michi()]);
  let aka = 0;
  for (const name of names) {          /* 出す 順は 決まった 順（並べて 回しても 出しは 揺れない） */
    const { red, hit, nerai } = kekka[name];
    if (red) aka++;
    console.log('  ' + (red ? '✓ 赤になった' : '✗ 赤にならない（空振り・狙い「' + nerai + '」）') + '：' + name + (red ? '（' + hit.slice(0, 90) + '）' : ''));
  }
  const all = names.length;
  console.log('\n' + aka + '/' + all + ' 赤になった');
  process.exit(aka === all ? 0 : 1);
}
const wazaName = process.env.KAMI_WAZA || '';
const ROOT = path.join(__dirname, '..', '..');
const require_ = createRequire(path.join(ROOT, 'package.json'));
let JSDOM;
try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('★jsdomが入っていません。この検証は飛ばせません（SKIPを緑と呼ばない）。npm install してください。'); process.exit(1); }
const { createFakeSupa } = require_(path.join(ROOT, 'tests/fake-supa.js'));

let pass = 0, fail = 0;
const TA = async (n, fn) => {
  try { await fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); }
  /* ★壊した 子は 狙いの 試験で 止める★（後ろの 試験は 狙いの 判定に 要らない＝--waza を 180秒の 内に 収める） */
  if (wazaName && WAZA[wazaName] && n.includes(WAZA[wazaName][2])) { console.log('\n（壊しの 狙いの 試験まで で 止めた）' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
};
const ok = (v, m) => { if (!v) throw new Error(m || 'false'); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/* 予約 220ms＋入れ替え 260ms＝480ms で落ち着く。余裕を見て 700ms */
const SETTLE = 700;

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
win.scrollTo = () => {};
win.print = () => {};
win.URL.createObjectURL = () => 'blob:test/1';
win.URL.revokeObjectURL = () => {};
for (const src of srcs) {
  const el = doc.createElement('script');
  let code = fs.readFileSync(path.join(ROOT, 'seikyu', src.replace(/^\.\.\//, '../')), 'utf8');
  if (wazaName && /seikyu-app\.js$/.test(src)) {
    const [from, to] = WAZA[wazaName] || [];
    if (!from || code.split(from).length !== 2) { console.log('★置き換えが 当たらない：' + wazaName); process.exit(2); }
    code = code.replace(from, to);
  }
  el.textContent = code;
  doc.body.appendChild(el);
}
ok(win.SeikyuApp, 'SeikyuApp が露出していない（読み込みに失敗）');

const sb = createFakeSupa({
  uid: 'u1',
  tables: {
    pay_org: [{ account_id: 'u1', data: { yago: '株式会社見本', addr: '東京都架空区見本台4-5-6', tel: '090-0000-0000', invoiceNo: 'T1234567890123' }, updated_at: '2026-08-01T00:00:00Z' }],
    pay_partners: [
      { id: 'pt_a', account_id: 'u1', sort: 0, data: { name: '標様建設株式会社', keisho: '御中', addr: '東京都架空区見本台1-2-3' }, deleted_at: null },
      { id: 'pt_b', account_id: 'u1', sort: 1, data: { name: '株式会社しまなみ', keisho: '様', addr: '東京都架空区見本台1-1' }, deleted_at: null },
    ],
    pay_invoices: [], pay_receipts: [],
    pay_companies: [{ account_id: 'u1', data: {}, updated_at: '2026-08-01T00:00:00Z' }],
  },
  pk: { pay_org: 'account_id', pay_companies: 'account_id' },
  unique: { pay_invoices: [['account_id', 'doc_type', 'no']] },
});
const $ = (id) => doc.getElementById(id);
const A = () => win.SeikyuApp;
const shown = (el) => !!el && el.style.display !== 'none' && !el.hidden;
/* ★見えるか＝親を #app の 手前まで 辿る★（jsdom では ログイン前の #app が hidden＝body まで 辿ると 全部「見えない」に なり、
   帯で 隠したかを 見ずに 緑に なった＝taiketsu 9回目 止1） */
const mieru = (el) => { if (!el) return false; for (let e = el; e && e.id !== 'app' && e !== doc.body; e = e.parentElement) if (e.style.display === 'none' || e.hidden) return false; return true; };
const setVal = (el, v) => { el.value = v; el.dispatchEvent(new win.Event('input', { bubbles: true })); el.dispatchEvent(new win.Event('change', { bubbles: true })); };
const gyo = (f) => $('lines-body').querySelector('tr [data-f="' + f + '"]');
const kingaku = (v) => { setVal(gyo('amount'), v); };
const omote = () => ($('pv') && $('pv').srcdoc) || '';
const ima = () => A()._paperHtml();
/* ★落ち着いた後の 決まり★＝表の紙は 今の中身の紙と 1字も違わない・膜は 0 */
function ochitsuita(m) {
  const want = ima();
  ok(want, (m || '') + '：今の中身から 紙が 組めない（前置きが 崩れた）');
  ok(omote() === want, (m || '') + '：表の紙が 今の中身と違う（古い紙が 残った）');
  ok(shown($('pv-wrap')), (m || '') + '：紙の枠が 出ていない（srcdoc だけ入って 客には 見えない）');
  ok(!shown($('pv-maku')), (m || '') + '：落ち着いたのに「作成中」の膜が 残っている');
}

console.log('\n[入力したら 紙が その場で 映る]');
await A().attach(sb);
await sleep(30);

await TA('0. 部品が在る（裏の紙・膜・帯）', async () => {
  ok($('pv-ura'), '裏の紙 #pv-ura が無い');
  ok($('pv-maku'), '膜 #pv-maku が無い');
  ok($('kami-obi'), '帯 #kami-obi が無い');
});

await TA('㋑ 取引先と請求日と明細を入れるだけで（中身を見るを押さずに）紙が出る', async () => {
  $('b-new').click();
  await sleep(30);
  setVal($('e-partner'), 'pt_a');
  setVal($('e-issue'), '2026-11-06');
  setVal(gyo('name'), '運転代行');
  kingaku('1000');
  await sleep(SETTLE);
  ochitsuita('㋑');
  ok(/標様建設株式会社/.test(omote()), '宛先が 紙に無い');
});

await TA('A→B→A を 220ms より短い間で打つ＝表は A（待っていた B が 後から入らない）', async () => {
  kingaku('2000');
  await sleep(80);
  kingaku('1000');
  await sleep(SETTLE);
  ochitsuita('A→B→A');
  ok(!/2,200/.test(omote()), 'B（2,200）が 表に 残った');
});

await TA('A→B→A を 240ms おき（B が 裏で 待っている 間に A へ 戻す）＝表は A・B は 0回', async () => {
  kingaku('1000');
  await sleep(SETTLE);
  ochitsuita('240ms おき 前置き');
  kingaku('2000');
  await sleep(240);              /* B は 予約が 走って 裏で 待っている */
  ok(/2,200/.test(($('pv-ura') && $('pv-ura').srcdoc) || ''), '前置き：B が 裏で 待っていない（この 試験で 見たい 形に なっていない）');
  kingaku('1000');
  await sleep(SETTLE);
  ochitsuita('240ms おき');
  ok(!/2,200/.test(omote()), 'B（2,200）が 表に 残った（打ち戻した 後も 前の 金額の 紙）');
});

await TA('前の番の 時計で 読み込み中の 新しい紙を 早く 表へ 出さない（裏に 書いてから 260ms は 前の紙＋膜）', async () => {
  /* ★時間の 余裕を 両側に 取る★（taiketsu 11回目 任2）＝前は 2回目を 240ms に 打って 予約で 460ms に 裏へ＝古い 時計 480ms との 差が 20ms で、
     重い 時に 壊した 側が 空振りした。今は 2回目を 400ms に 打って _fillEdit で 今すぐ 裏へ（新しい 時計 660ms）・540ms で 見る＝両側に 60〜120ms */
  kingaku('1500');               /* 0ms 打つ→220ms 裏へ（その番の 時計 480ms） */
  await sleep(240);
  ok(/1,650/.test(($('pv-ura') && $('pv-ura').srcdoc) || ''), '前置き：前の番の 紙が 裏で 待っていない');
  await sleep(160);
  kingaku('2500');
  A()._fillEdit();               /* ≒400ms 今すぐ 裏へ（その番の 時計 660ms）＝480ms の 前の 時計で 入れ替えては いけない */
  ok(/2,750/.test(($('pv-ura') && $('pv-ura').srcdoc) || ''), '前置き：新しい 紙が 今すぐ 裏に 入らない');
  await sleep(140);              /* ≒540ms＝新しい 紙は まだ 読み込み中の 筈 */
  ok(!/2,750/.test(omote()), '新しい紙が 裏に 書いて 260ms 経つ前に 表へ 出た（前の番の 時計で 入れ替えた）');
  ok(shown($('pv-maku')), '作り直しの 間に 膜が 出ていない');
  await sleep(SETTLE);
  ochitsuita('前の番の 時計');
  ok(/2,750/.test(omote()), '落ち着いても 新しい紙が 出ない');
});

await TA('B を待っている間に 同じ B で 即描き（fillEdit）＝表は B（正しい入れ替えを 殺さない）', async () => {
  kingaku('3000');
  await sleep(240);              /* 予約が 走って 裏で 待っている頃 */
  A()._fillEdit();
  await sleep(SETTLE);
  ochitsuita('同じ B');
  ok(/3,300/.test(omote()), '3,300 が 表に 無い');
});

await TA('通す→壊す→戻す＝壊した間は 表も裏も 空で理由、戻すと 紙が戻る', async () => {
  kingaku('x');
  await sleep(SETTLE);
  ok(omote() === '', '壊したのに 表に 前の紙が 残っている');
  ok(!(($('pv-ura') && $('pv-ura').srcdoc) || ''), '壊したのに 裏に 紙が 残っている');
  ok(shown($('paper-gate')) && /整っていない/.test($('paper-gate').textContent), '止まった理由が 出ていない');
  ok(!shown($('pv-maku')), '止まったのに 膜が 残っている');
  kingaku('3000');
  await sleep(SETTLE);
  ochitsuita('戻す');
});

await TA('㋐ 待っている間に 壊す＝膜 0・理由が出る', async () => {
  kingaku('4000');
  await sleep(240);
  kingaku('x');
  await sleep(SETTLE);
  ok(omote() === '', '表に 古い紙');
  ok(!shown($('pv-maku')), '膜が 残っている');
  ok(shown($('paper-gate')), '理由が 出ていない');
  kingaku('4000');
  await sleep(SETTLE);
  ochitsuita('㋐ 戻す');
});

await TA('㋓ 中身を見るの後に 1つ前の中身へ 打ち戻す＝表は 今の中身', async () => {
  kingaku('6000');
  $('b-preview').click();       /* 道5＝今すぐ 表へ */
  ok(/6,600/.test(omote()), '中身を見る で 今すぐ 表に 出ない');
  kingaku('4000');
  await sleep(SETTLE);
  ochitsuita('㋓');
});

await TA('㋒ 自分で決めた番号の下書きで 請求日だけ変える＝紙の日付が 変わる', async () => {
  const v = A()._state.cur;
  v.data = v.data || {}; v.data.noMode = 'manual'; v.no = 'M-1';
  A()._fillEdit();
  await sleep(SETTLE);
  const mae = omote();
  setVal($('e-issue'), '2026-12-01');
  await sleep(SETTLE);
  ochitsuita('㋒');
  ok(omote() !== mae, '請求日を 変えても 紙が 変わらない');
});

await TA('打って すぐ 画面を出て 戻る＝表は 今の中身', async () => {
  kingaku('7000');
  await sleep(60);
  doc.querySelector('.bn[data-scr="scr-list"]').click();
  await sleep(400);
  doc.querySelector('.bn[data-scr="scr-edit"]').click();
  await sleep(SETTLE);
  ochitsuita('出て戻る');
});

await TA('下書きを保存した後も 紙は 出たまま（同じ1通で 消さない）', async () => {
  $('b-save').click();
  /* ★保存の 描き直し（loadList の 後の fillEdit）は 120ms より 後に 来る★＝20/120ms だけ 見ると
     「同じ1通でも 毎回 空にする」が 空振り（11-06 [04ed3e] --waza 7/8）。落ち着くまで 10ms おきに 見る */
  const t0 = Date.now();
  let kara = -1;
  while (Date.now() - t0 < SETTLE * 3) {
    if (omote() === '' && kara < 0) kara = Date.now() - t0;
    await sleep(10);
  }
  ok(/保存しました/.test(($('edit-ok') && $('edit-ok').textContent) || ''), '保存が 終わっていない（描き直しまで 見ていない）');
  ok(kara < 0, '保存の 後 ' + kara + 'ms に 紙が 空に なった（同じ1通なのに 白く 跳ぶ）');
  ochitsuita('保存の後');
});

await TA('帯「紙を見る」＝今の1通の見出し・同じ紙・ファイルを作るボタンは 0', async () => {
  $('kami-obi').click();
  await sleep(50);
  ok($('lv-ov').classList.contains('open') || shown($('lv-ov')), '窓が 開かない');
  ok(($('lv').srcdoc || '') === omote(), '窓の紙が 表の紙と違う');
  ok(/標様建設株式会社/.test($('lv-h').textContent), '窓の見出しが 今の1通でない: ' + $('lv-h').textContent);
  const btns = ['b-pdf', 'b-pdfopen', 'b-print', 'b-delivery', 'b-xlsx'].filter((id) => mieru($(id)));
  ok(btns.length === 0, '帯から開いた窓に ファイルを作るボタンが 出ている: ' + btns.join(','));
  const close = doc.querySelector('#b-lv-back');
  ok(close, '窓の「閉じる」が 無い');
  close.click();
  await sleep(30);
  ok(!$('lv-ov').classList.contains('open'), '閉じても 窓が 残った');
});

await TA('㋔ 別の1通（新しい白紙）に替えたら 20ms でも 300ms でも 前の1通の 金額が 表にも裏にも 0回', async () => {
  ok(/7,700/.test(omote()), '前置き：前の1通の 紙が 出ていない');
  $('b-new').click();
  for (const w of [20, 300]) {
    await sleep(w === 20 ? 20 : 280);
    const both = omote() + '\n' + (($('pv-ura') && $('pv-ura').srcdoc) || '');
    ok(!/7,700/.test(both), w + 'ms：前の1通の 金額が 残っている');
    ok(shown($('paper-gate')) && /だれに|明細/.test($('paper-gate').textContent), w + 'ms：止まった理由が 出ていない');
  }
});

/* taiketsu 10回目 A：白の時は 帯を 押せない（押せる側は 下の 帯の試験が 見る） */
await TA('白の時は 帯「紙を見る」を 押せない', async () => {
  ok(omote() === '', '前置き：白紙に なっていない');
  ok($('kami-obi').disabled, '白紙なのに 帯が 押せる（押しても 空の 窓が 開く）');
});

await TA('㋔2 中身の整った 別の1通に 替えた＝20ms で 前の1通の 金額 0回・落ち着くと 新しい1通の 紙', async () => {
  setVal($('e-partner'), 'pt_a');
  setVal($('e-issue'), '2026-11-06');
  setVal(gyo('name'), '運転代行');
  kingaku('5000');
  await sleep(SETTLE);
  ochitsuita('㋔2 前置き');
  ok(/5,500/.test(omote()), '前置き：5,500 が 表に 無い');
  const b = JSON.parse(JSON.stringify(A()._state.cur));
  delete b.id; delete b._k;
  b.partner_id = 'pt_b';
  b.lines[0].amount = '8000';
  A()._state.cur = b;
  A()._fillEdit();
  await sleep(20);
  const both = omote() + '\n' + (($('pv-ura') && $('pv-ura').srcdoc) || '');
  ok(!/5,500/.test(omote()), '20ms：前の1通の 金額が 表に 残っている');
  ok(/8,800/.test(both) || both.trim() === '', '20ms：表と裏に 新しい1通の 紙も 空も 無い');
  await sleep(SETTLE);
  ochitsuita('㋔2');
  ok(/8,800/.test(omote()) && /しまなみ/.test(omote()), '新しい1通の 紙が 出ていない');
});

await TA('設定の 紙の下見＝長さが 同じで 中身の 違う 紙も 描き直す（列の 幅を 1段 広げる＝桁は 同じ）', async () => {
  doc.querySelector('.bn[data-scr="scr-set"]').click();
  await sleep(60);
  const mae = $('set-paper').srcdoc || '';
  ok(mae, '前置き：設定の 紙が 描かれていない');
  const rows = [...doc.querySelectorAll('#col-list .col-row')];
  const row = rows[1] || rows[0];
  const btn = row && [...row.querySelectorAll('[data-w]')].find((e) => Number(e.getAttribute('data-w')) > 0);
  ok(btn, '前置き：幅を 広げる ボタンが 無い');
  btn.click();
  await sleep(30);
  const ato = $('set-paper').srcdoc || '';
  ok(ato.length === mae.length, '前置き：長さが 変わった（' + mae.length + '→' + ato.length + '）＝この 試験で 見たい 形に なっていない');
  ok(ato !== mae, '幅を 変えても 設定の 紙が 描き直されない（長さで 比べている）');
  const semai = [...row.querySelectorAll('[data-w]')].find((e) => Number(e.getAttribute('data-w')) < 0);
  if (semai) semai.click();
  doc.querySelector('.bn[data-scr="scr-edit"]').click();
  await sleep(SETTLE);
});

await TA('印の紙の下見＝長さが 同じで 中身の 違う 紙も 描き直す（印の 絵を 同じ 長さの 別の 絵に 替える）', async () => {
  /* 印の 大きさの 欄は つまむ印（img）だけを 変え、紙は 倉庫の 大きさで 描く＝紙の 中身を 変えるのは 印の 絵 */
  const motoOrg = A()._state.org;
  const E1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const E2 = E1.replace('mP8z8BQDw', 'mNkYPhfDw');
  ok(E2 !== E1 && E2.length === E1.length, '前置き：同じ 長さの 別の 絵が 作れていない');
  /* ★赤でも org と 印の 紙を 戻す★（後ろの 試験へ E2 を 漏らさない・taiketsu 任意1・2） */
  try {
    doc.querySelector('.bn[data-scr="scr-set"]').click();
    await sleep(60);
    A()._state.org = Object.assign({}, motoOrg || {}, { sealDataUrl: E1, sealSizeMm: 17 });
    A()._sealStageForTest();
    const mae = $('seal-paper').srcdoc || '';
    ok(mae.includes(E1), '前置き：印の 紙に 1つ目の 印が 描かれていない');
    A()._state.org = Object.assign({}, motoOrg || {}, { sealDataUrl: E2, sealSizeMm: 17 });
    A()._sealStageForTest();
    const ato = $('seal-paper').srcdoc || '';
    ok(ato.length === mae.length, '前置き：長さが 変わった（' + mae.length + '→' + ato.length + '）＝この 試験で 見たい 形に なっていない');
    ok(ato.includes(E2), '印の 絵を 替えても 印の 紙が 描き直されない（長さで 比べている）');
  } finally {
    A()._state.org = motoOrg;
    A()._sealStageForTest();
    doc.querySelector('.bn[data-scr="scr-edit"]').click();
    await sleep(SETTLE);
  }
});
await TA('帯で 開いて 閉じた 後、一覧の「確認」では ファイルの ボタンが 出直す', async () => {
  ok(mieru($('b-pdf')) === false || !$('lv-ov').classList.contains('open'), '前置き');
  $('b-save').click();
  await sleep(SETTLE);
  ok(!$('kami-obi').disabled, '前置き：帯が 押せない');
  $('kami-obi').click();
  await sleep(50);
  ok(!mieru($('b-pdf')), '前置き：帯の 窓に PDF の ボタンが 出ている');
  doc.querySelector('#b-lv-back').click();
  await sleep(30);
  doc.querySelector('.bn[data-scr="scr-list"]').click();
  await sleep(400);
  const b = $('list-body').querySelector('[data-look]');
  ok(b, '前置き：一覧に「確認」が 無い');
  b.click();
  await sleep(60);
  ok($('lv-ov').classList.contains('open'), '確認の 窓が 開かない');
  const miss = ['b-pdf', 'b-pdfopen', 'b-print', 'b-delivery', 'b-xlsx'].filter((id) => !mieru($(id)));
  ok(miss.length === 0, '一覧の 確認で ファイルの ボタンが 隠れたまま: ' + miss.join(','));
  doc.querySelector('#b-lv-back').click();
  await sleep(30);
  doc.querySelector('.bn[data-scr="scr-edit"]').click();
  await sleep(SETTLE);
});

/* taiketsu 10回目 A：帯で 開いている 間に 描き直したら 窓も 同じ 全文へ（正本 6回目） */
await TA('帯で 開いている 間に 打つ＝窓の 紙も 今の 全文へ 変わる', async () => {
  /* 前の 試験は「人が 保存を 終えた 1通」で 終わる＝入力へ 戻ると 白紙（owattaNoMama）。ここで 新しい 1通を 作って しまう */
  $('b-new').click();
  await sleep(30);
  setVal($('e-partner'), 'pt_a');
  setVal($('e-issue'), '2026-11-06');
  setVal(gyo('name'), '運転代行');
  kingaku('6500');
  await sleep(SETTLE);
  $('b-save').click();
  await sleep(SETTLE);
  ochitsuita('帯の描き直し 前置き');
  ok(A()._state.cur && A()._state.cur.id, '前置き：保存できていない');
  $('kami-obi').click();
  await sleep(50);
  ok($('lv-ov').classList.contains('open'), '前置き：帯の 窓が 開かない');
  kingaku('9000');
  await sleep(SETTLE);
  ok(/9,900/.test(omote()), '前置き：表が 9,900 に ならない');
  ok(($('lv').srcdoc || '') === omote(), '帯の 窓の 紙が 打つ前の まま（表と 違う）');
  doc.querySelector('#b-lv-back').click();
  await sleep(30);
});

/* taiketsu 10回目 A＝試験㋖（正本 7回目）：一覧で 別の1通 Y を 確認中に 入力の 入れ替えが 来ても 窓は Y
   ＝PDF・印刷の ボタンが ある 窓に 入力中の 紙が Y の 見出しの まま 入らない（kamiObiAku の 守り） */
await TA('㋖ 一覧で 別の1通を 確認中に 入れ替えが 来ても 窓は その1通', async () => {
  const curId = A()._state.cur && A()._state.cur.id;
  ok(curId, '前置き：入力中の 1通が 保存されていない');
  kingaku('9500');               /* 220ms で 裏・480ms で 入れ替え＝窓を 開いた 後に 来る */
  await sleep(240);              /* ★裏に 書き終えて 入れ替えを 待つ 間に 出る★（画面を 出た 後の 予約は 道1 で 走らない＝裏に 入る 前に 出ると 入れ替えが 来ない） */
  ok(/10,450/.test(($('pv-ura') && $('pv-ura').srcdoc) || ''), '前置き：入力中の 紙が 裏で 待っていない');
  doc.querySelector('.bn[data-scr="scr-list"]').click();
  await sleep(10);
  const y = [...$('list-body').querySelectorAll('[data-look]')].find((e) => e.getAttribute('data-look') !== curId);
  ok(y, '前置き：一覧に 別の1通の「確認」が 無い');
  y.click();
  await sleep(5);
  ok($('lv-ov').classList.contains('open'), '前置き：確認の 窓が 開かない');
  ok(!/10,450/.test(omote()), '前置き：窓を 開く 前に 入れ替わった（窓が 開いている 間の 入れ替えに なっていない）');
  const yHtml = $('lv').srcdoc || '';
  ok(/7,700|8,800/.test(yHtml) && !/9,900|10,450/.test(yHtml), '前置き：窓が 別の1通（7,700 か 8,800）でない');
  await sleep(SETTLE);
  ok(/10,450/.test(omote()), '前置き：入れ替えが 来ていない（この 試験で 見たい 形に なっていない）');
  ok(($('lv').srcdoc || '') === yHtml, '確認の 窓に 入力中の 紙が 入った（見出しは 別の1通の まま）');
  doc.querySelector('#b-lv-back').click();
  await sleep(30);
  ok(A()._state.cur && A()._state.cur.id === curId, '閉じたら 入力中の 1通に 戻らない');
  ok(/10,450/.test(omote()), '閉じた後の 表が 入力中の 紙でない');
});

await TA('落ちた物（window.error・unhandledrejection）0', async () => {
  ok(errs.length === 0, errs.join(' / '));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
