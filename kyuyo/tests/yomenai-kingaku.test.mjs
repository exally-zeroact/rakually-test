/* yomenai-kingaku.test.mjs — ★支給・控除・勤怠の 金額が 読めない 字だと 黙って 0円で 進む 穴（㉔・2026-11-09）★
 * ============================================================================
 * ★前は こうだった★ … 「ー５０００」「－５０００」「▲5000」「５０００円」「￥５０００」「５　０００」「Infinity」「5e3」を
 *   支給・控除の 欄に 打つと、計算（PayrollMonthly.num）は 黙って 0（Infinity は 数の まま＝net が Infinity/NaN）。
 *   その まま 確認済み・今月を確定・振込・印刷・Excel に 進めた。確定済みの 人に 後から 打つと 0円で confirmed の 記録を 書き直した。
 * ★直し★ … lib payroll-warnings.js yomenaiGyou（判定 1か所）＋ 確定・確認済み・振込・印刷・Excel・確定の 記録の 書き直しを 止める。
 *   ★読み方は 増やさない★（額は 変えない）。勤怠は 計算が 引く 行（出勤・欠勤・代休取得の 最初の 行）だけ 見る。
 * ★押す物★ … 本物の app.js（jsdom）。倉庫だけ 差し替え。
 * 使い方: node kyuyo/tests/yomenai-kingaku.test.mjs   ／  --waza（判定を 外した lib で 赤に なるか）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let JSDOM;
try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('★jsdom が 入って いません。この 検証は 飛ばせません（SKIP を 緑と 呼ばない）。npm install して ください。'); process.exit(1); }

const WAZA = process.argv.includes('--waza');
let pass = 0, fail = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };
const machi = (ms) => new Promise((r) => setTimeout(r, ms));

/* ★わざと 判定を 外す★（読めない 物を 1つも 見つけない lib にする） */
const HANTEI = 'return !/^[+-]?(\\d+\\.?\\d*|\\.\\d+)$/.test(s);';
let kesita = 0;

function loadApp() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1].replace(/\?.*$/, ''))
    .filter((s) => !/^https?:/.test(s) && !/supabase|supa-config|auth/.test(s));
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true });
  const win = dom.window;
  win.fetch = () => Promise.reject(new Error('no network in test')); win.scrollTo = () => {}; win.print = () => {};
  for (const src of srcs) {
    let code = fs.readFileSync(path.join(ROOT, src), 'utf8');
    if (WAZA && /payroll-warnings\.js$/.test(src)) { kesita += code.split(HANTEI).length - 1; code = code.split(HANTEI).join('return false;'); }
    const el = win.document.createElement('script'); el.textContent = code; win.document.body.appendChild(el);
  }
  if (!win.__PAYSLIP_TEST) { console.log('  ✗ ★__PAYSLIP_TEST が 出て いません（app.js の init が 失敗）★'); process.exit(1); }
  return win;
}

const win = loadApp();
const A = win.__PAYSLIP_TEST, PW = win.PayrollWarnings, doc = win.document;
console.log('\n[yomenai-kingaku] 金額が 読めない 字で 黙って 0円に しない' + (WAZA ? '  ★★判定を外した回（' + kesita + 'か所）★★' : ''));
if (WAZA && kesita !== 1) { console.log('  ✗ ★外す 所が ' + kesita + 'か所（1で ない）＝門の 字が 変わった★'); process.exit(1); }
if (!PW || !PW.yomenaiGyou) { console.log('  ✗ ★PayrollWarnings.yomenaiGyou が 無い★'); process.exit(1); }

const WARUI = ['ー５０００', '－５０００', '▲5000', '５０００円', '￥５０００', '５　０００', 'Infinity', '5e3'];
const YOI = ['5000', '５，０００', '-5000', '', null, 0, '  ', undefined, '137.5'];

/* ── ① 判定（lib 直）── */
{
  const mk = (v) => ({ shikyu: [{ label: '資格手当', value: v }], extraKojo: [], kintai: [] });
  const tomaranai = WARUI.filter((v) => PW.yomenaiGyou(mk(v)).length !== 1);
  T('① 支給の 読めない 8通りで 止まる（' + WARUI.join('・') + '）', tomaranai.length === 0, '止まらない＝' + JSON.stringify(tomaranai));
  const tomaru = YOI.filter((v) => PW.yomenaiGyou(mk(v)).length !== 0);
  T('① 正しい 値（5000・５，０００・-5000・空・null・0・空白・137.5）では 止まらない', tomaru.length === 0, '止まった＝' + JSON.stringify(tomaru));
  const kj = PW.yomenaiGyou({ shikyu: [], extraKojo: [{ label: '親睦会費', value: '▲1000' }], kintai: [] });
  T('① 法定外控除の 読めない 字でも 止まる', kj.length === 1 && kj[0].g === 'extraKojo', JSON.stringify(kj));
  const kt = PW.yomenaiGyou({ shikyu: [], extraKojo: [], kintai: [{ label: '出勤日数', value: '二十' }, { label: '休日出勤メモ', value: 'あり' }, { label: 'メモ', value: '早退1回' }] });
  T('① 勤怠は 計算が 引く 行（最初の 出勤）だけ＝自由な 行・2つ目の 出勤の 行では 止まらない', kt.length === 1 && kt[0].ri === 0, JSON.stringify(kt));
  const kt2 = PW.yomenaiGyou({ shikyu: [], extraKojo: [], kintai: [{ label: 'メモ', value: '早退1回' }, { label: '欠勤日数', value: '2' }] });
  T('① 勤怠の 自由な 行だけ 字なら 止まらない', kt2.length === 0, JSON.stringify(kt2));
}

/* ── 支度：2人（読めない人・普通の人）── */
function shitaku(warui) {
  const st = A.state;
  st.company = A.defCompany ? A.defCompany() : (st.company || {});
  const e0 = A.defEmp('読めない 太郎'); e0.id = 'y1'; e0.payType = '月給'; e0.base = '250000'; e0.pref = 'tokyo';
  const e1 = A.defEmp('普通 花子'); e1.id = 'y2'; e1.payType = '月給'; e1.base = '260000'; e1.pref = 'tokyo';
  [e0, e1].forEach((e) => { e.furiBankNo = '0001'; e.furiBranchNo = '001'; e.furiAccount = '1234567'; e.furiKana = 'ﾃｽﾄ'; (e.shikyu = e.shikyu || []).push({ label: '資格手当', value: '5000' }); });
  e0.shikyu[e0.shikyu.length - 1].value = warui;
  st.employees = [e0, e1]; st.month = '2026-04'; st.confirmed = {}; st._naoshita = {}; st.printMode = 'monthly';
  return { e0, e1, st };
}

/* ── ② collect の code（ops）── */
{
  const { e0, st } = shitaku('ー５０００');
  const codes = PW.collect(e0, { month: st.month, company: st.company }).map((x) => x.code);
  T('② collect に KINGAKU_YOMENAI が 出る', codes.indexOf('KINGAKU_YOMENAI') >= 0, JSON.stringify(codes));
  T('② 休業手当の code に 化けない', !codes.some((c) => /KYUGYO_TEATE/.test(c)), JSON.stringify(codes));
}

/* ── ③ 入力画面：今月を確定は 押せない・赤枠・確認済みに できない・押されても 確定しない ── */
{
  const { st } = shitaku('－５０００');
  st.inputView = 'card';
  A.renderInput();
  const host = doc.querySelector('#input-list');
  const btn = host.querySelector('[data-confirm-month]');
  T('③ 「今月を確定」が 灰色', !!btn && btn.disabled === true, btn ? btn.outerHTML.slice(0, 160) : 'ボタンが 無い');
  T('③ ボタンの 字で 訳を 言う（金額が読めない1名）', !!btn && /金額が読めない1名/.test(btn.textContent), btn && btn.textContent);
  const ran = host.querySelector('.acc[data-i="0"] input[aria-invalid="true"]');
  T('③ 読めない 欄に aria-invalid（赤枠）', !!ran && ran.value === '－５０００', ran ? ran.value : '無い');
  T('③ 普通の 人の 欄には 付かない', !host.querySelector('.acc[data-i="1"] input[aria-invalid="true"]'));
  /* 確認済みの チェック */
  const ec = host.querySelector('.econf[data-econf="0"]');
  if (!ec) T('③ 確認済みの チェックが 在る', false, '無い');
  else { ec.click(); await machi(20); T('③ 読めない 人は 確認済みに ならない', !(st.confirmed[st.month] && st.confirmed[st.month].y1), JSON.stringify(st.confirmed)); }
  /* 押した 時の 歯止め（灰色を 外して 押す） */
  A.renderInput();
  const b2 = doc.querySelector('#input-list [data-confirm-month]');
  if (b2) { b2.disabled = false; b2.click(); await machi(20); }
  /* ★body.textContent は 使わない★＝読み込んだ <script> の 中身（app.js の 原文）も 入るので、止める 字が 常に 見つかる（--waza で 緑の まま＝空振りだった） */
  const gamenJi = () => [...doc.body.children].filter((n) => n.tagName !== 'SCRIPT').map((n) => n.textContent).join('');
  T('③ 灰色を 外して 押しても 確定の 問いを 出さず 止める', /金額が 読めないので、今月は まだ 確定していません/.test(gamenJi()), '止める 字が 出ない');
  /* 入れ直したら 消える */
  A.renderInput();
  const r3 = doc.querySelector('#input-list .acc[data-i="0"] input[aria-invalid="true"]');
  if (r3) { r3.value = '-5000'; r3.dispatchEvent(new win.Event('input', { bubbles: true })); }
  T('③ 半角で 入れ直すと 赤枠が 消える', !!r3 && !r3.getAttribute('aria-invalid'), r3 ? String(r3.getAttribute('aria-invalid')) : '無い');
}

/* ── ④ 振込：読めない 人は 計算落ち＝ファイルに 入れない・作らない ── */
{
  shitaku('▲5000');
  const tr = A.buildTransfers('monthly');
  const y1 = tr.find((t) => t.emp.id === 'y1'), y2 = tr.find((t) => t.emp.id === 'y2');
  T('④ 読めない 人に keisanOchi・ready で ない', !!y1 && y1.keisanOchi === true && y1.ready === false, JSON.stringify(y1 && { ko: y1.keisanOchi, ready: y1.ready }));
  T('④ 普通の 人は そのまま', !!y2 && !y2.keisanOchi && y2.ready === true);
  let dashita = false; A.furiKeisanOchiKaku('monthly', () => { dashita = true; });
  T('④ 全銀ファイルを 作らない（onOk が 呼ばれない）', dashita === false);
}

/* ── ⑤ 印刷・Excel ── */
{
  shitaku('５０００円');
  const g = A.printGate(2);
  T('⑤ 印刷の 門が 閉じる（枚数が 在っても）', g.enabled === false && /金額が読めない1名/.test(g.short), JSON.stringify(g));
  let deta = 0;
  win.PayslipXlsx = { download() { deta++; }, downloadSheets() { deta++; } };
  const pe = doc.querySelector('#p-emp'); if (pe) { if (!pe.querySelector('option[value="__all"]')) { const o = doc.createElement('option'); o.value = '__all'; pe.appendChild(o); } pe.value = '__all'; }
  const bx = doc.querySelector('#b-xlsx');
  if (!bx) T('⑤ Excel の ボタンが 在る', false, '無い');
  else { bx.click(); await machi(20); T('⑤ Excel を 出さない', deta === 0, '出した 回数 ' + deta); }
}

/* ── ⑥ 確定済みの 人に 後から 読めない 字を 打った 道＝0円で 記録を 書き直さない ── */
{
  const kiroku = [], kami = [];
  win.Store = win.Store || {};
  win.Store.savePayslip = (ym, id) => { kiroku.push(id); return Promise.resolve({ ok: true }); };
  win.Store.publishMeisai = (items) => { kami.push((items || []).map((x) => x.employeeId)); return Promise.resolve({ ok: true }); };
  const { e0 } = shitaku('5000');
  A.setConfirm('y1', true); A.setConfirm('y2', true);
  e0.shikyu[e0.shikyu.length - 1].value = 'ー５０００';
  A.naoshitaShirushi('2026-04', 'y1'); A.naoshitaShirushi('2026-04', 'y2');
  kiroku.length = 0;
  await A.saveMonthlyPayslips(false);
  await machi(30);
  T('⑥ 読めない 人（y1）の 確定の 記録は 書かない（前の 記録を 残す）', kiroku.indexOf('y1') < 0, '書いた … ' + kiroku.join(','));
  T('⑥ 普通に 直した 人（y2）は 今まで通り 書く', kiroku.indexOf('y2') >= 0, '書いた … ' + kiroku.join(','));
  /* ★本番前の叩き S1★＝記録を 書かない 人の Web明細が 0円で 出し直されていた（kami を 集めて 見て いなかった＝空振り） */
  await machi(150);
  const kamiIds = kami.flat();
  const fuda6 = (doc.querySelector('#app-toast') || {}).textContent || '';
  T('⑥ 最後に 残る 札に 読めない 人の 名前（T1）', /読めない 太郎/.test(fuda6), JSON.stringify(fuda6));
  T('⑥ 読めない 人（y1）の Web明細は 出し直さない', kami.length > 0 && kamiIds.indexOf('y1') < 0, '出した … ' + JSON.stringify(kami));
  T('⑥ 普通に 直した 人（y2）の Web明細は 出し直す', kamiIds.indexOf('y2') >= 0, '出した … ' + JSON.stringify(kami));
}

/* ── ⑦ 「Web明細で公開」の 道（publishMeisaiNow）＝確定済みの 月でも 読めない 人は 出さない（S2）── */
{
  const kami = [];
  win.Store.publishMeisai = (items) => { kami.push((items || []).map((x) => x.employeeId)); return Promise.resolve({ ok: true }); };
  shitaku('￥５０００');
  A.setConfirm('y1', true); A.setConfirm('y2', true);
  await A.publishMeisaiNow(false, {});
  await machi(20);
  const ids = kami.flat();
  const fuda = (doc.querySelector('#app-toast') || {}).textContent || '';
  T('⑦ 最後に 残る 札に 読めない 人の 名前（上書きで 消えない・T1）', /読めない 太郎/.test(fuda) && /公開しました/.test(fuda), JSON.stringify(fuda));
  T('⑦ 公開の 道で 読めない 人（y1）は 出さない', kami.length === 1 && ids.indexOf('y1') < 0, JSON.stringify(kami));
  T('⑦ 普通の 人（y2）は 出す', ids.indexOf('y2') >= 0, JSON.stringify(kami));
}

if (WAZA) {
  /* ★判定を 外すと 止まる 側が 全部 赤＝門が 判定で 守っている 証し（正しい 値の 試しは 緑の まま で よい）★
     ★約束の行（KEKKA）は「わざと 赤に なったか」の 1本だけを 数える＝上の ✗ は 期待した 赤（tools/_bunrui.mjs が exit0failed と 読まない 様に）★ */
  console.log('\n  --waza＝判定を 外した回: 赤 ' + fail + '本 ／ 緑の まま ' + pass + '本');
  if (fail >= 10) { console.log('  ★--waza＝判定を 外すと ' + fail + '本 赤＝門は 空振りで ない（期待通り）★'); console.log('KEKKA {"passed":1,"failed":0,"mimiso":0}'); process.exit(0); }
  console.log('  ★--waza なのに 赤が ' + fail + '本しか 無い＝門が 判定に 頼っていない★'); console.log('KEKKA {"passed":0,"failed":1,"mimiso":0}'); process.exit(1);
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
console.log('KEKKA {"passed":' + pass + ',"failed":' + fail + ',"mimiso":0}');   /* ★約束の行（_bunrui用）★ */
process.exit(fail ? 1 : 0);
