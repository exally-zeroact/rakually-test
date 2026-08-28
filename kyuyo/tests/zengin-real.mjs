/* zengin-real.mjs — ★⑦振込データを 実際に動かして 全銀の欄を1文字ずつ読む★
 * =============================================================================
 * 指示役 2026-08-28「★給与の一番 危ない所★」
 *   ★銀行に出すデータ★＝★間違うと お金が動かない／違う所へ行く★。
 *   棚卸しでは「★読んだだけ・一度も動かしていない★」と書いてありました。
 *
 * ★ここでやる事★
 *   ① ★本物の画面を動かして★（jsdom）、実データを入れて ★「全銀ファイル」のボタンを実際に押す★
 *   ② 出てきた ★バイト列★ を Shift-JIS から戻して、★120バイトずつ 欄の位置で 1文字ずつ読む★
 *      ＝★中の値どうしで閉じない★（作った値を自分で足し直すのは 検算ではない）
 *   ③ ★委託者コードが空なら 1バイトも作らない★
 *   ④ ★境界★ 月末／うるう年／年またぎ／土日祝が続く時／12/31〜1/3
 *   ⑤ ★改行は銀行ごと★＝固定しない（既定は 現状維持のCR+LF）
 *
 * ★全銀の欄の位置（一次情報＝全国銀行協会 規定フォーマット・zengin.js の頭に出典）★
 *   ヘッダー(120) 種別1 ＋ 種別コード2 ＋ コード区分1 ＋ 委託者コード10 ＋ 委託者名40
 *                 ＋ ★取組日4★ ＋ 仕向銀行番号4 ＋ 仕向銀行名15 ＋ 仕向支店番号3
 *                 ＋ 仕向支店名15 ＋ 預金種目1 ＋ 口座番号7 ＋ ダミー17
 *   データ(120)   種別1 ＋ 被仕向銀行番号4 ＋ 被仕向銀行名15 ＋ 被仕向支店番号3 ＋ 被仕向支店名15
 *                 ＋ 手形交換所4 ＋ 預金種目1 ＋ 口座番号7 ＋ 受取人名30 ＋ ★金額10★
 *                 ＋ 新規コード1 ＋ 顧客コード1(10) ＋ 顧客コード2(10) ＋ 振込区分1 ＋ 識別1 ＋ ダミー7
 *   トレーラー(120) 種別8 ＋ 合計件数6 ＋ 合計金額12 ＋ ダミー101
 *   エンド(120)   種別9 ＋ ダミー119
 *
 * 使い方: node kyuyo/tests/zengin-real.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require_ = createRequire(path.join(ROOT, 'package.json'));
let JSDOM;
try { ({ JSDOM } = require_('jsdom')); }
catch { console.error('★jsdom が要ります（npm install）。動かせないので止めます（0件と言わない）。'); process.exit(1); }
const PM = require_(path.join(ROOT, 'kyuyo/lib/payroll-monthly.js'));

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const TA = async (n, fn) => { try { await fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const eq = (a, b, m) => { if (a !== b) throw new Error((m ? m + ': ' : '') + '欲しい ' + JSON.stringify(b) + ' / 出た ' + JSON.stringify(a)); };
const ok = (v, m) => { if (!v) throw new Error(m || 'false'); };

/* ── ★Shift-JIS を 1バイトずつ 字に戻す★（半角カナ・英数・記号だけ使う仕様なので この表で足りる） ── */
function sjisToText(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b >= 0xA1 && b <= 0xDF) s += String.fromCharCode(b - 0xA1 + 0xFF61);  /* 半角カナ */
    else s += String.fromCharCode(b);                                          /* ASCII */
  }
  return s;
}

/* ── 本物の画面を動かす ───────────────────────────── */
async function boot(seed) {
  const file = path.join(ROOT, 'kyuyo/index.html');
  const html = fs.readFileSync(file, 'utf8');
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''),
    { runScripts: 'dangerously', url: 'http://localhost/kyuyo/', pretendToBeVisual: true });
  const win = dom.window, doc = win.document;
  win.fetch = () => Promise.reject(new Error('no net'));
  win.print = () => {}; win.scrollTo = () => {}; win.confirm = () => true;
  const alerts = [];
  win.alert = (m) => alerts.push(String(m));
  const drop = ['supa-config.js', 'auth.js', 'env-badge.js', 'rakunally-login.js'];
  for (const m of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
    const src = m[1].split('?')[0];
    if (/^https?:/.test(src) || drop.indexOf(src.split('/').pop()) >= 0) continue;
    const p = path.resolve(path.dirname(file), src);
    if (!fs.existsSync(p)) continue;
    const el = doc.createElement('script');
    el.textContent = fs.readFileSync(p, 'utf8');
    doc.body.appendChild(el);
  }
  await new Promise((r) => setTimeout(r, 400));
  const A = win.__PAYSLIP_TEST;
  if (!A) throw new Error('app.js が動いていない（動かせていません）');
  /* ★落とし口を 本物のまま動かして 出来た物を捕まえる★（作った値を渡してもらうのではない） */
  const files = [];
  win.FileOut.deliver = function (data, filename, opts) {
    files.push({ data: data, filename: filename, type: (opts || {}).type || '' });
    return Promise.resolve({ ok: true });
  };
  seed(A, win, doc);
  return { A, win, doc, files, alerts };
}

/* ★実データ★（司さんの会社の形に合わせる＝毎月25日・翌月払い／伊予銀行） */
function seedOf(over) {
  return (A) => {
    const c = A.defCompany();
    c.name = '合同会社ZEROact'; c.pref = 'ehime';
    c.paydayDay = '25'; c.paydayRel = 'next';
    c.furiCode = '1234567890'; c.furiName = 'ﾄﾞ)ｾﾞﾛｱｸﾄ';
    c.furiBankNo = '0174'; c.furiBankName = 'ｲﾖ';
    c.furiBranchNo = '001'; c.furiBranchName = 'ｲﾏﾊﾞﾘ';
    c.furiYokin = '普通'; c.furiAccount = '4160657';
    const e1 = A.defEmp('山田 太郎');
    e1.payType = '月給'; e1.base = '300000'; e1.pref = 'ehime';
    if (e1.shikyu && e1.shikyu[0]) e1.shikyu[0].value = '300000';
    e1.furiKana = 'ﾔﾏﾀﾞ ﾀﾛｳ'; e1.furiBankNo = '0174'; e1.furiBankName = 'ｲﾖ';
    e1.furiBranchNo = '002'; e1.furiBranchName = 'ﾀﾏｶﾞﾜ'; e1.furiYokin = '普通'; e1.furiAccount = '1234567';
    const e2 = A.defEmp('佐藤 花子');
    e2.payType = '月給'; e2.base = '250000'; e2.pref = 'ehime';
    if (e2.shikyu && e2.shikyu[0]) e2.shikyu[0].value = '250000';
    e2.furiKana = 'ｻﾄｳ ﾊﾅｺ'; e2.furiBankNo = '0175'; e2.furiBankName = 'ｴﾋﾒ';
    e2.furiBranchNo = '003'; e2.furiBranchName = 'ﾎﾝﾃﾝ'; e2.furiYokin = '普通'; e2.furiAccount = '9876543';
    Object.assign(c, (over && over.company) || {});
    A.state.company = c;
    A.state.month = (over && over.month) || '2026-08';
    A.state.employees = [e1, e2];
  };
}

async function makeZengin(over) {
  const b = await boot(seedOf(over));
  /* ★まず「振込」のタブを押す★＝開くまで 画面は描かれない（本物と同じ順で押す） */
  const tab = b.doc.querySelector('button[data-scr="scr-furikomi"]');
  if (!tab) throw new Error('「振込」のタブが画面に無い（測れていません）');
  tab.dispatchEvent(new b.win.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 250));
  /* ★画面のボタンを探して 実際に押す★（無ければ 測れていない） */
  const buttons = [...b.doc.querySelectorAll('#furi-box button')];
  const zb = buttons.find((x) => /全銀/.test(x.textContent || ''));
  if (!zb) throw new Error('「全銀ファイル」のボタンが画面に無い（測れていません）');
  zb.dispatchEvent(new b.win.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 120));
  return Object.assign(b, { btn: zb });
}

if (process.argv.includes('--self-test')) {
  console.log('\n[⑦振込データ --self-test] わざと壊して 赤になるか');
  let sp = 0, sf = 0;
  const S = async (n, fn) => { try { await fn(); sp++; console.log('  ✓ ' + n); } catch (e) { sf++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
  const Z0 = require_(path.join(ROOT, 'kyuyo/lib/zengin.js'));
  await S('① 門番を外した昔の姿だと 空の委託者コードが 0000000000 になる（＝捕まえられる）', async () => {
    /* ★作り物＝門番を通さない padN そのもの★（本物は build が止める） */
    eq(Z0.padN('', 10), '0000000000', '作り物が 0埋めしていない＝この検査が空振り');
    let threw = 0;
    try { Z0.build({ code: '', name: 'ｱ', torikumiMMDD: '0925' }, [{ name: 'ｱ', amount: 1 }], {}); } catch (_) { threw = 1; }
    eq(threw, 1, '★本物が 空の委託者コードで 作っている★');
  });
  await S('② 受取人名が漢字だけだと 全部スペースになる（＝捕まえられる）', async () => {
    eq(Z0.padC('山田 太郎', 30), ' '.repeat(30), '作り物が スペースになっていない＝この検査が空振り');
    let threw = 0;
    try {
      Z0.build({ code: '1234567890', name: 'ｱ', torikumiMMDD: '0925' },
        [{ name: '山田 太郎', amount: 1 }], {});
    } catch (_) { threw = 1; }
    eq(threw, 1, '★本物が 名前の無い振込を 作っている★');
  });
  await S('③ 取組日の門番も 効いている（空・0000）', async () => {
    let n = 0;
    ['', '0000', '1332'].forEach((v) => {
      try { Z0.build({ code: '1234567890', name: 'ｱ', torikumiMMDD: v }, [{ name: 'ｱ', amount: 1 }], {}); } catch (_) { n++; }
    });
    eq(n, 3, '★止まらない取組日が在る★');
  });
  console.log('\n[self-test] ' + sp + ' passed, ' + sf + ' failed');
  if (sf) process.exit(1);
}

console.log('\n[⑦振込データ 実際に動かして 全銀の欄を1文字ずつ読む]');

const R = await makeZengin();
let TEXT = '', RECS = [];
T('★① 画面のボタンを実際に押して ファイルが1本 出来た★', () => {
  eq(R.files.length, 1, '出来たファイルの数');
  ok(/^furikomi_\d{4}-\d{2}\.txt$/.test(R.files[0].filename), 'ファイル名: ' + R.files[0].filename);
  const bytes = R.files[0].data;
  ok(bytes && bytes.length, 'バイトが空');
  eq(bytes.length % 1, 0, '');
  TEXT = sjisToText(bytes);
  /* ★改行は 既定のCR+LF（銀行ごとに違うので 固定しない）★ */
  ok(TEXT.indexOf('\r\n') >= 0, '★既定の改行(CR+LF)が入っていない★');
  RECS = TEXT.split('\r\n').filter((x) => x.length);
  console.log('     ' + bytes.length + 'バイト ／ ' + RECS.length + 'レコード ／ ' + R.files[0].filename);
});

T('★② 1レコードは きっかり120バイト（全部）★', () => {
  ok(RECS.length >= 4, 'レコードが少なすぎる: ' + RECS.length);
  RECS.forEach((r, i) => eq(r.length, 120, (i + 1) + '本目の長さ'));
  eq(RECS[0][0], '1', 'ヘッダーの種別');
  eq(RECS[RECS.length - 2][0], '8', 'トレーラーの種別');
  eq(RECS[RECS.length - 1][0], '9', 'エンドの種別');
});

/* ★欄を 位置で切って 1文字ずつ読む★（作った値を足し直さない） */
const cut = (s, from, len) => s.slice(from, from + len);
T('★③ ヘッダーの欄を 位置で切って 1文字ずつ読む★', () => {
  const h = RECS[0];
  const f = {
    種別: cut(h, 0, 1), 種別コード: cut(h, 1, 2), コード区分: cut(h, 3, 1),
    委託者コード: cut(h, 4, 10), 委託者名: cut(h, 14, 40),
    取組日: cut(h, 54, 4),
    仕向銀行番号: cut(h, 58, 4), 仕向銀行名: cut(h, 62, 15),
    仕向支店番号: cut(h, 77, 3), 仕向支店名: cut(h, 80, 15),
    預金種目: cut(h, 95, 1), 口座番号: cut(h, 96, 7), ダミー: cut(h, 103, 17),
  };
  eq(f.種別, '1'); eq(f.種別コード, '21'); eq(f.コード区分, '0');
  eq(f.委託者コード, '1234567890', '委託者コード（10桁・右詰め0埋め）');
  eq(f.委託者名, 'ﾄﾞ)ｾﾞﾛｱｸﾄ' + ' '.repeat(40 - 'ﾄﾞ)ｾﾞﾛｱｸﾄ'.length), '委託者名（40桁・左詰め空白埋め）');
  /* ★取組日は 対象月から★（会社の1個の日付ではない）＝2026-08分 → 支給日 2026-09-25（金） */
  eq(f.取組日, '0925', '★取組日（対象月に追従）★');
  eq(f.仕向銀行番号, '0174'); eq(f.仕向銀行名, 'ｲﾖ' + ' '.repeat(13));
  eq(f.仕向支店番号, '001'); eq(f.仕向支店名, 'ｲﾏﾊﾞﾘ' + ' '.repeat(15 - 'ｲﾏﾊﾞﾘ'.length));
  eq(f.預金種目, '1', '普通＝1');
  eq(f.口座番号, '4160657');
  eq(f.ダミー, ' '.repeat(17));
  console.log('     取組日「' + f.取組日 + '」 委託者「' + f.委託者コード + '」 口座「' + f.口座番号 + '」');
});

T('★④ データの欄を 位置で切って 1文字ずつ読む（2人ぶん）★', () => {
  const want = [
    { bankNo: '0174', bankName: 'ｲﾖ', branchNo: '002', branchName: 'ﾀﾏｶﾞﾜ', acc: '1234567', name: 'ﾔﾏﾀﾞ ﾀﾛｳ' },
    { bankNo: '0175', bankName: 'ｴﾋﾒ', branchNo: '003', branchName: 'ﾎﾝﾃﾝ', acc: '9876543', name: 'ｻﾄｳ ﾊﾅｺ' },
  ];
  const datas = RECS.filter((r) => r[0] === '2');
  eq(datas.length, 2, 'データの本数');
  datas.forEach((d, i) => {
    const w = want[i];
    eq(cut(d, 0, 1), '2', (i + 1) + '人目の種別');
    eq(cut(d, 1, 4), w.bankNo, (i + 1) + '人目の銀行番号');
    eq(cut(d, 5, 15), w.bankName + ' '.repeat(15 - w.bankName.length), (i + 1) + '人目の銀行名');
    eq(cut(d, 20, 3), w.branchNo, (i + 1) + '人目の支店番号');
    eq(cut(d, 23, 15), w.branchName + ' '.repeat(15 - w.branchName.length), (i + 1) + '人目の支店名');
    eq(cut(d, 38, 4), '0000', (i + 1) + '人目の手形交換所（未使用）');
    eq(cut(d, 42, 1), '1', (i + 1) + '人目の預金種目（普通）');
    eq(cut(d, 43, 7), w.acc, (i + 1) + '人目の口座番号');
    eq(cut(d, 50, 30), w.name + ' '.repeat(30 - w.name.length), (i + 1) + '人目の受取人名');
    const amt = cut(d, 80, 10);
    ok(/^\d{10}$/.test(amt), (i + 1) + '人目の金額が数字10桁でない: ' + amt);
    ok(Number(amt) > 0, (i + 1) + '人目の金額が0');
    eq(cut(d, 90, 1), '0', (i + 1) + '人目の新規コード');
    eq(cut(d, 111, 1), '7', (i + 1) + '人目の振込区分（電信）');
    eq(d.length, 120, (i + 1) + '人目の長さ');
  });
  console.log('     1人目 ' + cut(datas[0], 50, 30).trim() + ' ' + Number(cut(datas[0], 80, 10)).toLocaleString()
    + '円 ／ 2人目 ' + cut(datas[1], 50, 30).trim() + ' ' + Number(cut(datas[1], 80, 10)).toLocaleString() + '円');
});

T('★⑤ トレーラーの件数・合計を 位置で切って 読む（データの欄から 足し直す）★', () => {
  const tr = RECS.find((r) => r[0] === '8');
  const cnt = cut(tr, 1, 6), sum = cut(tr, 7, 12);
  ok(/^\d{6}$/.test(cnt), '件数が6桁でない: ' + cnt);
  ok(/^\d{12}$/.test(sum), '合計が12桁でない: ' + sum);
  const datas = RECS.filter((r) => r[0] === '2');
  eq(Number(cnt), datas.length, '件数');
  /* ★データの欄から読んだ金額を足す★＝★中の値どうしで閉じない★ */
  const fromFile = datas.reduce((a, d) => a + Number(cut(d, 80, 10)), 0);
  eq(Number(sum), fromFile, '★トレーラーの合計が データの欄の合計と違う★');
  eq(cut(tr, 19, 101), ' '.repeat(101), 'トレーラーのダミー');
  console.log('     件数 ' + Number(cnt) + '件 ／ 合計 ' + Number(sum).toLocaleString() + '円（データの欄から足した数と一致）');
});

async function openFuri(seed) {
  const b = await boot(seed);
  const tab = b.doc.querySelector('button[data-scr="scr-furikomi"]');
  tab.dispatchEvent(new b.win.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 250));
  const zb = [...b.doc.querySelectorAll('#furi-box button')].find((x) => /全銀/.test(x.textContent || ''));
  if (!zb) throw new Error('「全銀ファイル」のボタンが画面に無い（測れていません）');
  return Object.assign(b, { zb });
}
const Z = require_(path.join(ROOT, 'kyuyo/lib/zengin.js'));

await TA('★⑥ 委託者コードが空なら 押せない＋理由（1バイトも作らない）★', async () => {
  /* ★押す前に止める★＝出来ていない物のボタンを見せない。★lib にも最後の砦を残す★ */
  const b = await openFuri(seedOf({ company: { furiCode: '' } }));
  ok(b.zb.disabled, '★委託者コードが空なのに 押せる★');
  ok(/委託者情報なし/.test(b.zb.textContent || ''), '★押せない理由が ボタンの中に無い★: ' + b.zb.textContent);
  b.zb.dispatchEvent(new b.win.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 120));
  eq(b.files.length, 0, '★空なのに ファイルが出来た★');
  /* ★最後の砦（lib）も 止める★ */
  ok(Z.checkCommitter({ code: '', name: 'ｱ' }), 'lib が 空の委託者コードを通す');
  ok(Z.checkCommitter({ code: '0000000000', name: 'ｱ' }), 'lib が 0だけの委託者コードを通す');
  ok(!Z.checkCommitter({ code: '1234567890', name: 'ｱ' }), 'lib が 正しい委託者コードを止める');
  console.log('     ボタンの字「' + String(b.zb.textContent).trim() + '」／画面「'
    + String((b.doc.querySelector('#furi-box .cr-warn') || {}).textContent || '').trim().slice(0, 30) + '…」');
});

await TA('★⑥-b 受取人名が 銀行に出せない字なら 押せない（名前の無い振込を作らない）★', async () => {
  /* ★カナが空だと 漢字の氏名で代わりを埋めていた★＝全銀では ★全部スペース★になる（2026-08-28 実測） */
  const b = await openFuri((A) => { seedOf()(A); A.state.employees.forEach((e) => { e.furiKana = ''; }); });
  ok(b.zb.disabled, '★受取人名が空になるのに 押せる★');
  ok(Z.checkName({ name: '山田 太郎' }, 0), 'lib が 漢字だけの受取人名を通す（全部スペースになる）');
  ok(!Z.checkName({ name: 'ﾔﾏﾀﾞ ﾀﾛｳ' }, 0), 'lib が 正しい受取人名を止める');
  eq(Z.padC('山田 太郎', 30), ' '.repeat(30), '（前提）漢字は 全部スペースになる');
  console.log('     ボタンの字「' + String(b.zb.textContent).trim() + '」');
});

await TA('★⑦ 境界5つ … 取組日を 位置で切って読む★', async () => {
  const cases = [
    { name: '月末（毎月末日）', over: { month: '2026-09', company: { paydayDay: '末' } }, want: '1030' },
    { name: 'うるう年（2/29）', over: { month: '2028-01', company: { paydayDay: '末' } }, want: '0229' },
    { name: '年またぎ（12月分）', over: { month: '2026-12' }, want: '0125' },
    { name: '土日祝が続く（元日）', over: { month: '2026-12', company: { paydayDay: '1' } }, want: '1230' },
    { name: '年末年始（12/31）', over: { month: '2026-11', company: { paydayDay: '31' } }, want: '1230' },
  ];
  for (const c of cases) {
    const r = await makeZengin(c.over);
    eq(r.files.length, 1, c.name + ' … ファイルが出来ていない');
    const h = sjisToText(r.files[0].data).split('\r\n')[0];
    const got = cut(h, 54, 4);
    /* ★lib の答えとも 突き合わせる★（紙の欄 と 計算 の両方から） */
    const byLib = PM.furikomiMMDD({ month: (c.over.month || '2026-08'), company: Object.assign({ paydayDay: '25', paydayRel: 'next' }, c.over.company || {}) });
    eq(got, c.want, c.name + ' … 全銀の取組日の4文字');
    eq(byLib, c.want, c.name + ' … lib の答え');
    console.log('     ' + c.name.padEnd(18) + ' → 取組日「' + got + '」');
  }
});

await TA('★⑧ 改行は 銀行ごと（固定しない・既定は現状維持）★', async () => {
  const crlf = await makeZengin();
  ok(sjisToText(crlf.files[0].data).indexOf('\r\n') >= 0, '既定がCR+LFでない');
  const lf = await makeZengin({ company: { furiNewline: 'LF' } });
  const t = sjisToText(lf.files[0].data);
  ok(t.indexOf('\r\n') < 0 && t.indexOf('\n') >= 0, '★LFを選んだのに CR+LFのまま★');
  const none = await makeZengin({ company: { furiNewline: 'NONE' } });
  const t2 = sjisToText(none.files[0].data);
  ok(t2.indexOf('\n') < 0 && t2.length % 120 === 0, '★改行なしを選んだのに 改行が入っている★');
  console.log('     既定 CR+LF ／ LF ／ 改行なし … 3通りとも 出せる（120バイト×' + (t2.length / 120) + '本）');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
