/* saitei-ask-bun.test.mjs — ★最低賃金の 客に出る1行が「額と 日付を 別々の物で 並べていない」か★
 * =============================================================================
 * ★なぜ 要るか（2026-09-13 実測で 踏んだ）★
 *   お客さんに こう 出ていた（本物の 字／★数は ここに 写さない★＝去年の数が 残る 形）
 *     「★◯◯県の最低賃金は ＜今の額＞円★（＜新額の 発効日＞から）。」
 *   ・前の額は ★今 効いている 旧額★（chinginOn）
 *   ・日付は  ★新額が 始まる日★（hatsukoOf）
 *   ⇒ ★別々の物を 1つの 文に 並べていた★＝「1,226円が 10月1日から」と 読める。
 *   ★計算は 正しかった＝字だけが 嘘★。だから 数の 見張りは 1本も 赤に ならなかった。
 *   しかも HATSUKO_MITEI=true なのに ★「予定」が この字に 1つも 出ていなかった★。
 *
 * ★測り方（司さん 2026-09-13「案3で」）★
 *   ★本物の app.js を jsdom で 読み、ASK_Q() の pref の answer() の 字を 読む★
 *   （source を 字で 探すのでは ない＝作り方を 変えても 効く）
 *   ★今日に 頼らない★＝期待は lib から 作る（走らせた 日が いつでも 同じ判定）
 *     ① 発効前（今日 < 発効日 かつ 額が 変わる）
 *        … 旧額と 新額が ★両方★ 出る／★旧額の 隣に 新額の 発効日を 置かない★
 *        … HATSUKO_MITEI なら ★「予定」が 出る★
 *     ② 発効後（または 額が 変わらない）
 *        … 出る額は 1つ＝chinginOn(今日) と 1円一致（その額の 発効日と 並ぶので 嘘に ならない）
 *   ★47県 ぜんぶ 見る★（東京だけ 見ると 11月発効の 県を 見落とす）
 *
 * 使い方: node kyuyo/tests/saitei-ask-bun.test.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const require_ = createRequire(import.meta.url);
const SELF = process.argv.includes('--self-test');
const SAI = require_(path.join(ROOT, 'lib', 'saitei-chingin.js'));

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m || 'expected truthy'); };

const TODAY = (() => { const d = new Date(); const p = (n) => (n < 10 ? '0' + n : '' + n);
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); })();
const yen = (n) => (Number(n) || 0).toLocaleString('ja-JP');
const jp = (iso) => { const s = String(iso || ''); if (s.length !== 10) return '';
  return (+s.slice(0, 4)) + '年' + (+s.slice(5, 7)) + '月' + (+s.slice(8, 10)) + '日'; };

/* ★物差しそのもの★＝字を 1本 渡すと「嘘か どうか」を 返す。
   ★ブラウザを 使わずに 確かめられる 形★（自己確認は これを 使う） */
export function shiraberu(text, code) {
  const p = SAI.todofuken[code] || {};
  const ima = SAI.chinginOn(code, TODAY), shin = p.chingin, hat = p.hatsuko;
  const mae = !!(hat && TODAY < hat && shin != null && shin !== ima);
  const t = String(text || '');
  const warui = [];
  if (mae) {
    if (t.indexOf(yen(ima) + '円') < 0) warui.push('今の額（' + yen(ima) + '円）が 出ていない');
    if (t.indexOf(yen(shin) + '円') < 0) warui.push('新しい額（' + yen(shin) + '円）が 出ていない');
    /* ★一番 直したかった 形★＝旧額の すぐ 隣に 新額の 発効日が 来る */
    const nara = yen(ima) + '円★（' + jp(hat) + 'から）';
    if (t.indexOf(nara) >= 0) warui.push('★旧額の 隣に 新額の 発効日を 並べている（これが 嘘の 正体）★');
    if (SAI.HATSUKO_MITEI && t.indexOf('予定') < 0) warui.push('発効日が 未確定なのに「予定」が 出ていない');
  } else {
    if (t.indexOf(yen(ima) + '円') < 0) warui.push('今の額（' + yen(ima) + '円）が 出ていない');
    if (shin != null && shin !== ima && t.indexOf(yen(shin) + '円') >= 0) warui.push('もう 効いていない 額が 出ている');
  }
  return { mae, warui };
}

/* ── ★自己確認★＝わざと 前の 字に 戻したら 赤に なるか ───────────── */
if (SELF) {
  console.log('\n[saitei-ask-bun] ★自己確認★（★物差しそのもの★・ブラウザを 使わない）');
  let ng = 0;
  const iu = (nm, good) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + nm + (good ? '' : '  ★思っていたのと 違う★')); };
  /* 発効前の 県を 1つ 選ぶ（無ければ この回は 確かめられないと 言う） */
  const maeKen = Object.keys(SAI.todofuken).filter((k) => {
    const p = SAI.todofuken[k];
    return p.hatsuko && TODAY < p.hatsuko && p.prev != null && p.prev !== p.chingin;
  });
  if (!maeKen.length) {
    console.log('  🟡 ★未測定★ 今日（' + TODAY + '）は どの県も 発効後＝この 自己確認は 走らせられない');
    console.log('     （★緑とは 書かない★。次の 年度の 答申が 入れば また 走る）');
    process.exit(2);
  }
  const k = maeKen[0], p = SAI.todofuken[k];
  const furui = '★' + p.name + 'の最低賃金は ' + yen(SAI.chinginOn(k, TODAY)) + '円★（' + jp(p.hatsuko) + 'から）。時給がこれを下回ると赤で止めます。';
  iu('前の 字（旧額＋新しい発効日）を 食わせたら 赤', shiraberu(furui, k).warui.length > 0);
  const yoteiNashi = '★' + p.name + 'の最低賃金★ 今 … ' + yen(SAI.chinginOn(k, TODAY)) + '円 / ' + jp(p.hatsuko) + 'から … ' + yen(p.chingin) + '円';
  iu('「予定」を 落としたら 赤', !SAI.HATSUKO_MITEI || shiraberu(yoteiNashi, k).warui.length > 0);
  const kataho = '★' + p.name + 'の最低賃金は 今 ' + yen(SAI.chinginOn(k, TODAY)) + '円★（予定）';
  iu('新しい額を 落としたら 赤', shiraberu(kataho, k).warui.length > 0);
  const tadashii = '★' + p.name + 'の最低賃金★<br>今（…まで）　… ' + yen(SAI.chinginOn(k, TODAY))
    + '円<br>' + jp(p.hatsuko) + 'から　… ' + yen(p.chingin) + '円（予定）<br>時給がこれを下回ると赤で止めます。';
  iu('正しい 字は 緑（★狼少年に しない★）', shiraberu(tadashii, k).warui.length === 0);
  console.log(ng ? '\n★自己確認 ' + ng + '件 おかしい★' : '\n自己確認 OK（わざと 戻すと 赤に なる）');
  process.exit(ng ? 1 : 0);
}

/* ── ★本物の app.js を 読んで 実物の 字を 見る★ ───────────────── */
let JSDOM;
try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('★jsdomが 入っていません。この検証は 飛ばせません（SKIPを 緑と 呼ばない）'); process.exit(1); }

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1].replace(/\?.*$/, ''))
  .filter((s) => !/^https?:/.test(s) && !/supabase|supa-config|auth/.test(s));
const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true });
const win = dom.window, doc = win.document;
win.fetch = () => Promise.reject(new Error('no net'));
win.print = () => {};
for (const src of srcs) { const el = doc.createElement('script'); el.textContent = fs.readFileSync(path.join(ROOT, src), 'utf8'); doc.body.appendChild(el); }
const A = win.__PAYSLIP_TEST;

console.log('\n[saitei-ask-bun] 最低賃金の 客に出る1行（今日 = ' + TODAY + '）');
T('本物の app.js が 読めて ASK_Q が 在る', () => ok(A && typeof A.ASK_Q === 'function', '__PAYSLIP_TEST.ASK_Q が 無い'));

const KEN = Object.keys(SAI.todofuken);
let mae = 0, ato = 0;
const dame = [];
T('★47県 ぜんぶ★ 額と 日付が 別々の物に なっていない', () => {
  ok(KEN.length >= 40, '県が ' + KEN.length + '件しか 無い（表が 壊れている）');
  for (const k of KEN) {
    A.state.company.pref = k;
    const q = A.ASK_Q().filter((x) => x.key === 'pref')[0];
    ok(q, 'pref の 問いが 無い');
    const a = q.answer && q.answer();
    ok(a && a.text, k + ' … 答えの 字が 出ない');
    const r = shiraberu(a.text, k);
    if (r.mae) mae++; else ato++;
    if (r.warui.length) dame.push(k + ' … ' + r.warui.join(' / ') + '  ★出た字★ ' + a.text.replace(/<br>/g, ' ／ '));
  }
  ok(dame.length === 0, '\n      ' + dame.join('\n      '));
});
T('「当てました」の 印が 付いている（押すと 出典が 出る道）', () => {
  A.state.company.pref = KEN[0];
  const q = A.ASK_Q().filter((x) => x.key === 'pref')[0];
  const a = q.answer && q.answer();
  ok(a && a.guessed === true, '「当てました」の 印が 付いていない');
});

console.log('\n── 実測 ──');
console.log('  県 ' + KEN.length + '件 … 発効前 ' + mae + '件 / 発効後 ' + ato + '件');
console.log('  発効日は ' + (SAI.HATSUKO_MITEI ? '★予定（未確定）★＝「予定」を 出す' : '確定'));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
