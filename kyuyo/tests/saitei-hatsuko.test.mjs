/* saitei-hatsuko.test.mjs — ★最低賃金は「発効日以降の労働」に効く★
 *
 * なぜ必要か（2026-08-03 の判断）:
 *   最賃の発効日は令和7年10月3日〜令和8年3月31日に【順次】で、10月中に発効しない県が27ある。
 *   なのに lib は全県10月一律で切り替えていた。
 *   ★秋田(令和8年3月31日 発効・旧951→新1031)と群馬(令和8年3月1日・旧985→新1063)は
 *     10月〜2月の5ヶ月ぶん、毎月うそをつく。★
 *   警告が5ヶ月続けて嘘をつくと、その会社は警告を読まなくなる。
 *   そうなると【本物の最賃割れも一緒に見逃される】。金額は合っていても直す価値がある。
 *
 * ★月の途中で発効する月は、その月の中で額が2つある。片方に丸めるとどちらでも嘘になる:
 *     新額に寄せる → 発効前の日も高い額で判定＝誤警告（今と同じ）
 *     旧額に寄せる → 発効後の日の本物の割れを見逃す
 *   ⇒ 丸めずに【分けて】判定し、分けられない時は両方の額と日付を出す。
 *
 * ★このテストで一番大事なのは最後の「本物の割れを見逃さない」。
 *   誤警告を消しにいって、逆に見逃すようになっていないかを機械で固定する。
 *
 * 使い方: node tests/saitei-hatsuko.test.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(path.join(ROOT, 'package.json'));
const SAI = require_(path.join(ROOT, 'lib/saitei-chingin.js'));
const PW = require_(path.join(ROOT, 'lib/payroll-warnings.js'));

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const eq = (a, b, m) => { if (a !== b) throw new Error((m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); };
const ok = (c, m) => { if (!c) throw new Error(m || 'expected truthy'); };

const COMPANY = { name: 'テスト社', annualHolidays: '120', dailyWorkH: '8', dailyWorkM: '0', gyoshu: 'ippan' };
const ctx = (ym) => ({ company: COMPANY, month: ym, otHist: {} });
// 時給の人1人（最賃判定は時給がそのまま効く＝一番はっきり見える形）
const emp = (pref, hourly) => ({ id: '1', name: 'テスト', payType: '時給', hourly: String(hourly), pref: pref, taxClass: 'ko', employmentType: 'employee', shikyu: [], kintai: [] });
const info = (pref, hourly, ym) => PW.minWageInfo(emp(pref, hourly), ctx(ym));

console.log('\n[saitei-hatsuko] 最低賃金を「県ごとの発効日」で判定する');

/* ── ① 発効前の月に新額で判定しない（今までの誤警告） ───────────────── */
/* ★2026-09-12 令和8年度へ 1世代 進めた★
   lib は ★今の額と 前年の 2世代しか 持たない★。令和8を入れた事で 令和6(951等)は 消える。
   ⇒ ★狙い（発効日で判定が変わる／月内で分かれる／本物の割れは見逃さない）は 1つも 変えず、
      日付と額だけ 令和8の実物に 合わせた★。県も 同じ条件の物を 実物から 選び直した：
        秋田 発効 2026-10-14（月の途中）旧1031→新1090
        群馬 発効 2026-10-03（月の途中）旧1063→新1120
        北海道 発効 2026-10-01（月初）  旧1075→新1131 */
T('★秋田(発効=令和8年10月14日) 2026-06〜2026-09 は旧額1031で判定＝時給1050で警告が出ない', () => {
  for (const ym of ['2026-06', '2026-07', '2026-08', '2026-09']) {
    const r = info('akita', 1050, ym);
    ok(r, ym + ': 判定が返らない');
    eq(r.minWage, 1031, ym + ' の適用最賃');
    eq(r.ok, true, '★' + ym + ' は旧額1031が効力中。時給1050で警告を出してはいけない');
  }
});

T('★群馬(発効=令和8年10月3日) 2026-05〜2026-09 は旧額1063で判定＝時給1070で警告が出ない', () => {
  for (const ym of ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09']) {
    const r = info('gunma', 1070, ym);
    eq(r.minWage, 1063, ym + ' の適用最賃');
    eq(r.ok, true, '★' + ym + ' は旧額1063が効力中');
  }
});

/* ── ② 発効後は新額 ─────────────────────────────────────────────── */
T('秋田 2026-11（発効後）は新額1090で判定する', () => {
  const r = info('akita', 1050, '2026-11');
  eq(r.minWage, 1090, '新額');
  eq(r.ok, false, '★1050円は1090円を下回る＝本物の割れ。必ず警告');
  eq(!!(r.split && r.split.hatsukoYmd), false, '11月は月内で分かれない');
});

T('東京(発効=令和8年10月1日) 2026-11 は新額1280で判定する', () => {
  const r = info('tokyo', 1250, '2026-11');
  eq(r.minWage, 1280, '新額');
  eq(r.ok, false, '★本物の割れ');
});

/* ── ③ 月の途中で発効する月は「分かれる」 ───────────────────────── */
T('北海道 2026-10 は【月初(10/1)発効】なので月内で分かれない＝月まるごと新額1131', () => {
  // 分かれるのは ★発効日が 月の途中に 入る月だけ★（下の秋田・群馬）。
  const r = info('hokkaido', 1100, '2026-10');
  eq(!!r.split, false, '月初発効＝分かれない');
  eq(r.minWage, 1131, '月まるごと新額');
  eq(r.ok, false, '1100円は1131円を下回る＝本物の割れ');
});

T('★秋田 2026-10（10/14発効）は月内が分かれる（1031と1090の両方を持つ）', () => {
  const r = info('akita', 1050, '2026-10');
  ok(r.split, '★split が無い＝月内で分かれていない');
  eq(r.split.hatsukoYmd, '2026-10-14', '発効日');
  eq(r.split.before, 1031, '10/1〜10/13 の額');
  eq(r.split.after, 1090, '10/14以降の額');
  eq(r.ok, false, '★1050円は発効後1090円を下回る＝確かめが要る（黙って通さない）');
  const t = PW.mwWarnText(r);
  ok(/2026年10月14日|10月14日/.test(t), '★警告文に発効日が入っている: ' + t);
  ok(/1,?031/.test(t) && /1,?090/.test(t), '★両方の額が入っている: ' + t);
});

T('★群馬 2026-10（10/3発効）は 10/1〜10/2 が旧額1063、10/3以降が1120', () => {
  const r = info('gunma', 1100, '2026-10');
  ok(r.split, '★月内で分かれるはず');
  eq(r.split.hatsukoYmd, '2026-10-03', '発効日');
  eq(r.split.before, 1063, '10/1〜10/2 の額');
  eq(r.split.after, 1120, '10/3以降の額');
  eq(r.ok, false, '1100円は1120円を下回る日がある＝確かめが要る');
});

T('分かれる月でも、両方の額を上回っていれば警告を出さない（誤警告ゼロ）', () => {
  const r = info('akita', 1200, '2026-10');
  ok(r.split, 'split はある');
  eq(r.ok, true, '★1200円は1031も1090も上回る＝出してはいけない');
});

/* ── ④ ★本物の割れを見逃さない（ここが一番大事） ─────────────────── */
T('★★本物の割れは必ず出る：発効後に新額を下回る明細（27県すべてで確認）', () => {
  const off = SAI.todofuken;
  const miss = [];
  for (const [k, p] of Object.entries(off)) {
    const after = p.chingin;
    // 発効日の翌月＝完全に新額の月
    const h = SAI.hatsukoOf ? SAI.hatsukoOf(k) : null;
    if (!h) { miss.push(k + ': 発効日が取れない'); continue; }
    const y = +h.slice(0, 4), m = +h.slice(5, 7);
    const nextYm = m === 12 ? (y + 1) + '-01' : y + '-' + String(m + 1).padStart(2, '0');
    const r = info(k, after - 1, nextYm);            // ★新額より1円だけ低い
    if (!r || r.ok !== false) miss.push(p.name + '(' + k + ') ' + nextYm + ' で ' + (after - 1) + '円が見逃された');
  }
  if (miss.length) throw new Error('★見逃しがあります（誤警告を消しにいって逆に見逃している）:\n' + miss.map(x => '   - ' + x).join('\n'));
});

T('★発効前でも、旧額を下回る本物の割れは出る', () => {
  const r = info('akita', 900, '2026-09');           // 旧額1031を下回る
  eq(r.ok, false, '★旧額1031を下回っている＝その時点で違法。必ず出す');
  eq(r.minWage, 1031, '旧額で判定');
});

/* ── ⑤ 47県ぶんの発効日と前年額が lib にある（真値から機械で入れた物） ── */
T('47県すべてに発効日と前年額がある（手で打ち直していない＝真値と一致）', () => {
  const ng = [];
  for (const [k, p] of Object.entries(SAI.todofuken)) {
    if (!p.hatsuko || !/^\d{4}-\d{2}-\d{2}$/.test(p.hatsuko)) ng.push(k + ': 発効日が無い/形が違う');
    if (!(p.prev > 0)) ng.push(k + ': 前年額が無い');
  }
  if (ng.length) throw new Error(ng.join('\n'));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
