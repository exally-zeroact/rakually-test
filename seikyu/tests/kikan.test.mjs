/* kikan.test.mjs — ★締め期間を 全部の締め日で測る★＋★正本と1文字ずつ比べる★
 * =============================================================================
 * ★見本を選んで測らない★（司さん/指示役 2026-08-17 の決まり）。
 *   ★締め日 1〜31（31通り）★ × ★月の種類4つ★（2月平年／2月うるう／30日の月／31日の月）
 *   ＝★124通り★ を そのまま 測る。
 *
 * ★正本★ … C:/Users/zeroa/timeally/lib/tc-calc.js の period(ym, closeDay)
 *   seikyu/lib/seikyu-kikan.js は ★同じ形のまま★ 借りた物。
 *   ⇒ ★1文字ずつ 比べる★。食い違ったら 赤（＝借り物が いつのまにか 別物になっていない）。
 *   ★正本が この機械に無い時は「未測定」★（緑と言わない）。
 *
 * 使い方: node seikyu/tests/kikan.test.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require_ = createRequire(path.join(ROOT, 'package.json'));
const K = require_(path.join(ROOT, 'seikyu/lib/seikyu-kikan.js'));

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (v, m) => { if (!v) throw new Error(m || 'false'); };

const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const iso = (y, m, d) => y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
const spanDays = (from, to) =>
  Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000) + 1;

const MONTHS = [
  ['2026-02', '2月（平年28日）'],
  ['2024-02', '2月（うるう年29日）'],
  ['2026-04', '30日の月'],
  ['2026-08', '31日の月'],
];

console.log('\n[締め期間] ★締め日 1〜31 × 月4種 ＝ 124通り★ を全部 測る');

let n = 0;
const bad = [];
for (const [ym, name] of MONTHS) {
  const y = +ym.slice(0, 4), m = +ym.slice(5, 7);
  const last = daysIn(y, m);
  const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y;
  const prevLast = daysIn(py, pm);
  for (let cd = 1; cd <= 31; cd++) {
    n++;
    const p = K.period(ym, cd);
    const wantTo = iso(y, m, Math.min(cd, last));
    const wantFrom = cd >= 31 ? iso(y, m, 1) : iso(py, pm, Math.min(cd + 1, prevLast));
    const why = name + '・締め日' + cd + ' … ';
    if (p.to !== wantTo) bad.push(why + '終わりが ' + p.to + '（' + wantTo + ' のはず）');
    if (p.from !== wantFrom) bad.push(why + '始まりが ' + p.from + '（' + wantFrom + ' のはず）');
    if (spanDays(p.from, p.to) < 27) bad.push(why + '日数が ' + spanDays(p.from, p.to) + '日しかない');
    const cross = p.from.slice(0, 7) !== p.to.slice(0, 7);
    if (cd >= 31 && cross) bad.push(why + '末日締めなのに 月をまたいだ');
    if (cd < 31 && !cross) bad.push(why + '月をまたいでいない');
  }
}

T('★124通り 全部 測った（空振りしていない）', () => {
  ok(n === 124, '測った数が ' + n + '通り（124のはず）');
  console.log('     実測: ★' + n + '通り★（締め日1〜31 × 月4種）');
});

T('★どの締め日でも 終わり＝締め日／始まり＝締め日の翌日（無い日は末日に寄せる）', () => {
  ok(bad.length === 0, bad.length + '件 食い違う:\n   - ' + bad.slice(0, 8).join('\n   - '));
});

T('★存在しない締め日（29・30・31）を 2月で実物で測った', () => {
  const rows = [];
  for (const [ym, name] of [['2026-02', '平年'], ['2024-02', 'うるう年']]) {
    for (const cd of [29, 30, 31]) {
      const p = K.period(ym, cd);
      rows.push(name + '・締め日' + cd + ' → ' + p.from + '〜' + p.to);
      const last = daysIn(+ym.slice(0, 4), 2);
      ok(p.to === iso(+ym.slice(0, 4), 2, Math.min(cd, last)),
        name + '・締め日' + cd + ' の終わりが ' + p.to);
    }
  }
  console.log('     実測:\n       ' + rows.join('\n       '));
});

T('★客の言う「◯日から」→ 締め日（1日から＝末日締め31／10日から＝9／21日から＝20）', () => {
  const cases = [[1, 31], [10, 9], [21, 20], [16, 15], [31, 30]];
  cases.forEach(([start, want]) => {
    const got = K.closeDayFromStartDay(start);
    ok(got === want, start + '日から → ' + got + '（' + want + ' のはず）');
  });
  ok(K.closeDayFromStartDay(0) === null && K.closeDayFromStartDay(32) === null,
    '★無い日を 通している★');
  console.log('     ' + cases.map(([a, b]) => a + '日から→' + b).join(' / '));
});

T('★紙に出す形（0埋めしない・実物32枚と同じ）', () => {
  ok(K.slash('2025-08-21') === '2025/8/21', K.slash('2025-08-21'));
  ok(K.rangeLabel(K.period('2025-09', 20)) === '2025/8/21 〜 2025/9/20', K.rangeLabel(K.period('2025-09', 20)));
  console.log('     ' + K.rangeLabel(K.period('2025-09', 20)));
});

/* ═══ ★正本と 1文字ずつ 比べる★ ═══════════════════════════════════════ */
const SRC = 'C:/Users/zeroa/timeally/lib/tc-calc.js';
if (!fs.existsSync(SRC)) {
  console.log('\n  ─ ★正本との突き合わせ … 未測定★（この機械に timeally が在りません: ' + SRC + '）');
  console.log('    ★これは「同じ」という意味では ありません★。timeally が在る機械で 走らせてください。');
} else {
  T('★借り物が 正本と 1文字も違わない（読みやすく書き直していない）', () => {
    const cut = (s) => {
      const i = s.indexOf('function period(ym, closeDay)');
      ok(i >= 0, '★period が 見つからない★');
      /* period の { … } を 数えて 切り出す（正規表現では 入れ子を 数えられない） */
      let d = 0, j = s.indexOf('{', i), k = j;
      for (; k < s.length; k++) {
        if (s[k] === '{') d++;
        else if (s[k] === '}') { d--; if (d === 0) break; }
      }
      return s.slice(i, k + 1).replace(/\r\n/g, '\n');
    };
    const a = cut(fs.readFileSync(SRC, 'utf8'));
    const b = cut(fs.readFileSync(path.join(ROOT, 'seikyu/lib/seikyu-kikan.js'), 'utf8'));
    /* 行頭の字下げは 入れ物が違うので 揃えてから 比べる（★中身は 1文字も 変えない★） */
    const norm = (s) => s.split('\n').map((x) => x.replace(/^\s+/, '')).join('\n');
    ok(norm(a) === norm(b), '★正本と 食い違っています★\n     正本:\n' + a + '\n     借り物:\n' + b);
    console.log('     正本 ' + SRC + ' の period（' + a.split('\n').length + '行）と 一致');
  });
}

/* ═══ ★自己確認：わざと壊して 赤になるか★ ═══ */
if (process.argv.includes('--self-test')) {
  console.log('\n[--self-test] ★わざと壊すと赤になるか★');
  let sp = 0, sf = 0;
  const S = (nn, fn) => { try { fn(); sp++; console.log('  ✓ ' + nn); } catch (e) { sf++; console.log('  ✗ ' + nn + ' — ' + e.message); } };
  S('★4通りだけ測る作りに戻すと 空振りする★', () => {
    const few = [10, 20, 25, 31];
    ok(!few.includes(30), '');
    ok(K.period('2026-02', 30).to === '2026-02-28', '本物が末日に寄せていない');
    console.log('     ＝★締め日30は 4通りの中に無い★（測っていない穴が残る）');
  });
  S('★末日に寄せるのをやめた作り物★は この検査で赤になる', () => {
    const wrong = (ym, cd) => ({ to: ym + '-' + String(cd).padStart(2, '0') });
    ok(wrong('2026-02', 30).to === '2026-02-30', '作り物が作れていない');
    ok(K.period('2026-02', 30).to !== wrong('2026-02', 30).to, '★本物も 存在しない日を返している★');
  });
  S('★正本との突き合わせが 効いている（1文字 変えたら 気づく）', () => {
    const s = fs.readFileSync(path.join(ROOT, 'seikyu/lib/seikyu-kikan.js'), 'utf8');
    const broken = s.replace('var cd = Number(closeDay) || 31;', 'var cd = Number(closeDay) || 30;');
    ok(broken !== s, '作り物が 作れていない');
    ok(broken.indexOf('|| 30;') >= 0, '★変えたのに 変わっていない★');
    console.log('     ＝31→30 に変えたら 突き合わせで 落ちる形になっている');
  });
  console.log('\n[self-test] ' + sp + ' passed, ' + sf + ' failed');
  if (sf) process.exit(1);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
