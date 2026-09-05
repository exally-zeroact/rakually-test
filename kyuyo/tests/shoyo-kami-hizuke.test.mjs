/* shoyo-kami-hizuke.test.mjs — ★賞与の 紙の 年月日★（お客さんに 渡る 紙）
 * ==============================================================================
 * ★なぜ（2026-09-06・司さん「必要やものは全て一致するならやれ」＝賞与の紙を 実際に 押した日）★
 *
 * ★① 支給日の 書き方が 月次と 食い違っていた（本物の 欠陥・実測）★
 *   実ブラウザ(WebKit 390px)で 賞与の 紙を 出したら
 *     賞与の紙 … 「支給日 ★2026-12-10★」   ＝入れてもらった 字が そのまま
 *     月次の紙 … 「支給日 ★令和8年10月25日★」
 *   ⇒ ★同じ会社の 同じ従業員に 渡す 紙で 日付の 書き方が 食い違っていた★
 *   いつ こうなったか … 支給日の 欄は 2026-09-03 に 「例 2026-12-10」の形で
 *   受け取るように 変えた（銀行へ 送る為）。その時 ★紙の側だけ 生のまま 残った★。
 *   ★入れてもらった 自由文は 消さない★＝日付と 読めた時だけ 和暦にする。
 *
 * ★② 読めない年月を そのまま 紙に 焼いていた（実測で 踏んだ）★
 *   賞与支給月(payYm)に 年-月 以外が 入ると 紙に ★「令和982年0月賞与」★と 出た。
 *   （私の 測り道具が 隠れた欄へ "300000" を 打ち込み、それが 保存されて 再現した。
 *     見える 選択肢からは 壊れた値に ならないが、古い控えや 前の版から 戻すと 起き得る。）
 *   ⇒ 読めない時は ★対象月に 落とす★。それも 読めなければ ★年月を 出さない★。
 *
 * ★ここで 見る事★
 *   ① 支給日が 年-月-日 なら ★和暦★で 出す（月次と 同じ 書き方）
 *   ② 支給日が 自由文（「12月10日ごろ」等）なら ★そのまま 残す★（消さない）
 *   ③ 支給日が 空なら ★会社の 支給日★に 落ちる（月次と 同じ）
 *   ④ 賞与支給月が 壊れていても ★おかしな 年月を 紙に 出さない★
 *   ⑤ ★空振りしていない★（紙の 中身が 本当に 作れている）
 *
 * 使い方: node kyuyo/tests/shoyo-kami-hizuke.test.mjs [--self-test]
 *   ・★ログイン不要★（jsdom で アプリの 中身を 直に 見る）＝CIで 毎回 回せる
 */
import fs from 'node:fs'; import path from 'node:path';
import { createRequire } from 'node:module'; import { pathToFileURL, fileURLToPath } from 'node:url';
/* ★手元の 絶対パスを 焼き込まない★＝Linuxの CIだけ 赤に なる（2026-09-06 実際に した） */
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..').split(path.sep).join('/');
const req = createRequire(pathToFileURL(ROOT + '/package.json'));
const { JSDOM } = req('jsdom');
const html = fs.readFileSync(ROOT + '/kyuyo/index.html', 'utf8');

async function okosu(appSrc) {
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''),
    { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/kyuyo/index.html' });
  const w = dom.window, d = w.document;
  w.fetch = () => Promise.reject(new Error('no net')); w.alert = () => {}; w.confirm = () => true;
  w.scrollTo = () => {}; w.print = () => {};
  w.URL.createObjectURL = () => 'blob:x';
  w.open = () => ({ document: { write() {}, close() {} }, focus() {}, print() {}, close() {} });
  for (const m of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
    const s2 = m[1].split('?')[0], base = s2.split('/').pop();
    if (/^https?:/.test(s2) || ['supa-config.js', 'auth.js', 'env-badge.js', 'store.js', 'rakunally-login.js'].includes(base)) continue;
    const p2 = path.resolve(ROOT + '/kyuyo', s2);
    if (!fs.existsSync(p2)) continue;
    const el = d.createElement('script');
    el.textContent = (base === 'app.js' && appSrc) ? appSrc : fs.readFileSync(p2, 'utf8');
    d.body.appendChild(el);
  }
  await new Promise((r) => setTimeout(r, 600));
  return w.__PAYSLIP_TEST;
}

const APP = ROOT + '/kyuyo/js/app.js';
/* ★直す前の 姿★＝紙に 生の 字を そのまま 渡していた1行 */
const MARK = 'payDate:bonusPayDateStr()';
const MAE = 'payDate:(state.bonus&&state.bonus.payDay)||payDateStr()';

async function hakaru(appSrc) {
  const A = await okosu(appSrc);
  if (!A) throw new Error('アプリの 中身が 出ていない');
  const S = A.state;
  S.company = Object.assign(A.defCompany ? A.defCompany() : {}, { name: '試し株式会社', paydayDay: '25', paydayRel: 'next' });
  S.month = '2026-09';
  S.employees = [Object.assign(A.defEmp ? A.defEmp() : {},
    { id: 'e1', name: '試し 太郎', joinYmd: '2020-04-01', pref: '愛媛県', fuyou: 0, taxClass: 'ko', base: 250000 })];
  const oku = (payYm, payDay) => {
    S.bonus = { payYm: payYm, payDay: payDay, byEmp: { e1: { amount: 300000, prevAfter: 250000, ytd: '', addShikyu: [], addKojo: [] } } };
    const p = A.buildBonusPeople(S.employees)[0];
    return { payDate: p && p.payDate, net: p && p.net, label: A.bonusMonthLabel() };
  };
  return {
    hi:   oku('2026-09', '2026-12-10'),   /* 年-月-日 */
    jiyu: oku('2026-09', '12月10日ごろ'),  /* 自由文 */
    kara: oku('2026-09', ''),             /* 空 */
    kowa: oku('300000', '2026-12-10'),    /* ★壊れた 賞与支給月★（実際に 起きた 値） */
    tsuki: A.payDateStr(),
  };
}

console.log('\n[shoyo-kami-hizuke] 賞与の 紙の 年月日（お客さんに 渡る 紙）');
const r = await hakaru(null);
console.log('  年-月-日 … 支給日「' + r.hi.payDate + '」／' + r.hi.label);
console.log('  自由文   … 支給日「' + r.jiyu.payDate + '」');
console.log('  空       … 支給日「' + r.kara.payDate + '」（月次の 支給日「' + r.tsuki + '」）');
console.log('  壊れた月 … 支給日「' + r.kowa.payDate + '」／' + r.kowa.label);
console.log('');

let ng = 0; const iu = (ok, s2) => { if (!ok) ng++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + s2); };
iu(/^令和\d+年\d+月\d+日$/.test(String(r.hi.payDate)),
  '① 年-月-日 は 和暦で 出す（月次と 同じ 書き方） … 「' + r.hi.payDate + '」');
iu(r.jiyu.payDate === '12月10日ごろ',
  '② 自由文は そのまま 残す（入れてもらった 字を 消さない） … 「' + r.jiyu.payDate + '」');
iu(r.kara.payDate === r.tsuki,
  '③ 空なら 会社の 支給日に 落ちる … 「' + r.kara.payDate + '」');
iu(!/令 和 \d{3}|0 月|NaN/.test(String(r.kowa.label)) && /令 和 8 年/.test(String(r.kowa.label)),
  '④ 賞与支給月が 壊れていても おかしな 年月を 紙に 出さない … 「' + r.kowa.label + '」');
iu(typeof r.hi.net === 'number' && r.hi.net > 0,
  '⑤ 空振りしていない（紙の 中身が 本当に 作れている … 手取り ¥' + r.hi.net + '）');

if (process.argv.includes('--self-test')) {
  console.log('\n[--self-test] ★アプリを 直す前の 姿に 戻すと 赤に なるか★');
  const keep = fs.readFileSync(APP, 'utf8');
  let kowashita = 0, aka = 0;
  /* ①②③を 守る 1行 */
  if (keep.indexOf(MARK) < 0) { console.log('  ★壊す場所が 見つからない＝この 自己確認は 古い★'); process.exit(2); }
  const a = await hakaru(keep.replace(MARK, MAE));
  kowashita++;
  const ak1 = !/^令和\d+年\d+月\d+日$/.test(String(a.hi.payDate));
  if (ak1) aka++;
  console.log('  ' + (ak1 ? '✓' : '✗') + ' 生の 字を 紙に そのまま 渡す（直す前の 姿） … '
    + (ak1 ? '赤に なる（見張りが 気づく）' : '★気づけない★') + '  出た字「' + a.hi.payDate + '」');
  /* ★空の 時に 落ちる先まで 壊れていないか★＝上の 戻しでは ③は 生きたまま（見分ける） */
  kowashita++;
  const ak2 = (a.jiyu.payDate === '12月10日ごろ');   /* ②は 戻しても 生きる＝★誤って 赤に しない★ */
  if (ak2) aka++;
  console.log('  ' + (ak2 ? '✓' : '✗') + ' 自由文は どちらの 姿でも 消えない（誤って 赤に しない） … '
    + (ak2 ? '正しく 読めた' : '★読み違えた★'));
  /* ④を 守る 1行 */
  const M4 = 'function bonusMonthLabel(){ var ym=bonusYmSafe();';
  const A4 = 'function bonusMonthLabel(){ var ym=bonusYmOf();';
  if (keep.indexOf(M4) < 0) { console.log('  ★④の 壊す場所が 見つからない★'); process.exit(2); }
  const b = await hakaru(keep.replace(M4, A4));
  kowashita++;
  const ak3 = /令 和 \d{3}|0 月|NaN/.test(String(b.kowa.label));
  if (ak3) aka++;
  console.log('  ' + (ak3 ? '✓' : '✗') + ' 読めない年月を そのまま 焼く（直す前の 姿） … '
    + (ak3 ? '赤に なる（見張りが 気づく）' : '★気づけない★') + '  出た字「' + b.kowa.label + '」');
  console.log('  ★壊した ' + kowashita + '件／気づけた ' + aka + '件★');
  if (aka !== kowashita) { console.log('★自己確認 おかしい★'); process.exit(1); }
  console.log('\n' + kowashita + ' passed, 0 failed');
  process.exit(0);
}
console.log('\n  ★赤 ' + ng + '件★');
process.exit(ng ? 1 : 0);
