/* pref-daiyo.test.mjs — ★県が 無い時の「黙って 代用」を 1つに 揃える★
 * ============================================================================
 * ★なぜ（2026-09-03 実測・指示役の裁定）★
 *   県が 空でも ★数字が 出る道が 実UIで 3本★（一覧/集計・明細の紙・帳票）。
 *   しかも ★代用の 値が 3種類 あって 全部 違う★＝★同じ状態を 3か所で 別々に 判定★。
 *     ・getKenko の 代用 …… 東京 0.04925 ＋ 子育て支援金 0.00115 = 0.0504（260,000で ★13,104円★）
 *     ・payroll-calc の 既定 … ★0.04955★（令和7 東京・★支援金なし★＝古い）（260,000で 12,883円）
 *     ・ops の 代用 ………… ★1人目の 県で 全員ぶんを 決める★（人によって 変わる）
 *   ⇒ 画面にも 紙にも 何も 出ないまま ★静かに ずれる★。★客に 渡る 明細も 警告ゼロで 出せた★。
 *
 * ★ここで 固定する事★
 *   ① ★代用の 値は 表（shakaihoken-hyo）から 1か所で 取る★＝3か所とも ★同じ額★に なる
 *   ② ★代用したら 名乗る★＝getKenko が daiyo:true と 理由を 返す（★黙って 代用しない★）
 *   ③ ★1人目の 県で 全員を 決めない★（ops の 記録は 使った 県を ★全部★ 持つ）
 *   ④ ★県が 入っている人の 額は 1円も 動かさない★（お金を 変える 直しでは ない）
 *
 * 使い方: node kyuyo/tests/pref-daiyo.test.mjs [--self-test]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELF = process.argv.includes('--self-test');
const load = (p) => { const m = require(path.join(ROOT, p)); return m.default || m; };
const SHH = load('kyuyo/lib/shakaihoken-hyo.js');
const PC = load('kyuyo/lib/payroll-calc.js');

let pass = 0, fail = 0;
const T = (n, f) => { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const YM = '2026-09', HYO = 260000;

console.log('\n[pref-daiyo] 県が 無い時の 代用を 1つに 揃える（2026-09-03 実測＝3種類 出ていた）');

/* 表から 取った「代用の 値」＝これが 唯一の 正 */
const hyoRate = () => SHH.getKenko('', YM).jugyoin + SHH.getShienkin(YM);

T('★① 代用の 額が 3か所とも 同じ（表から 1か所で 取る）', () => {
  const hyo = Math.round(HYO * hyoRate());
  /* payroll-calc に ★県も 率も 渡さない★＝一番 素の 呼び方（ここが 0.04955 の 古い既定だった） */
  const si = PC.calcSocialInsurance({ payTotal: HYO, payYm: YM, birthYmd: '1980-05-15' });
  ok(si.health === hyo, '★payroll-calc の 代用が 表と 違う★ … 表 ' + hyo + ' ／ calc ' + si.health);
  console.log('     表 ' + hyo + '円 ／ payroll-calc ' + si.health + '円');
});

T('★② 代用したら 名乗る（黙って 東京に しない）', () => {
  const k = SHH.getKenko('', YM);
  ok(k.daiyo === true, '★県が 空なのに daiyo が 立っていない★＝黙って 代用している');
  ok(typeof k.riyu === 'string' && k.riyu.length > 0, '★理由が 無い★（何で 代用したか 言えない）');
  const kk = SHH.getKenko('kagawa', YM);
  ok(!kk.daiyo, '★県が 在るのに 代用の 札が 立っている★');
  console.log('     空の時 … ' + k.riyu + '（名前 ' + k.name + '）');
});

T('★③ 県が 入っている人の 額は 1円も 動かない（お金を 変えていない）', () => {
  /* 実測で 紙に 出ていた 額（香川・2026-09・標準報酬260,000）＝13,325円 */
  const kagawa = Math.round(HYO * (SHH.getKenko('kagawa', YM).jugyoin + SHH.getShienkin(YM)));
  ok(kagawa === 13325, '★香川の 額が 動いた★ … ' + kagawa + '（紙に 出ていたのは 13,325）');
  const si = PC.calcSocialInsurance({ payTotal: HYO, payYm: YM, pref: 'kagawa', birthYmd: '1980-05-15' });
  ok(si.health === 13325, '★payroll-calc の 香川が 動いた★ … ' + si.health);
});

T('★④ 1人目の 県で 全員を 決めない（記録は 使った県を 全部 持つ）', () => {
  const OPS = load('kyuyo/ops/payroll.monthly.js');
  /* ★入口の 名前を 思い込みで 書いて 空振りした★（run/runMonthly は 無い）＝実物は `engine`。
     ★呼ぶ物は 名指しで 確かめてから 書く★（2026-09-03） */
  const run = OPS.engine;
  ok(typeof run === 'function', '★ops の engine が 無い（形が 変わった？）★ … 出口=' + Object.keys(OPS).join(','));
  const emps = [
    { id: 'a', name: '香川の人', pref: 'kagawa', base: '260000', payType: '月給', birthYmd: '1980-05-15' },
    { id: 'b', name: '東京の人', pref: 'tokyo', base: '260000', payType: '月給', birthYmd: '1980-05-15' }
  ];
  /* ★会社名が 無いと validated:false で 記録そのものが 作られない★（実物で 確かめた） */
  const res = run({ month: YM, company: { name: '試しの会社' }, employees: emps, otHistory: {}, options: {} });
  ok(!(res.errors || []).length, '★入り口で 弾かれた★ … ' + JSON.stringify(res.errors));
  const st = res && res.provenance && res.provenance.statutory;
  ok(st && st.kenko, '★記録（provenance.statutory.kenko）が 無い★');
  ok(Array.isArray(st.kenko.prefs), '★使った県の 一覧（prefs）が 無い★＝1人目の県だけで 決めている');
  ok(st.kenko.prefs.length === 2, '★県が 2つ 在るのに ' + st.kenko.prefs.length + 'つしか 記録していない★');
  console.log('     記録された県 … ' + st.kenko.prefs.map((x) => x.pref + '=' + x.jugyoin).join(' / '));
});

T('★⑤ 代用の 札の 文を lib が 1か所で 作る（画面も 紙も 同じ 言い方）', () => {
  const PW = load('kyuyo/lib/payroll-warnings.js');
  ok(typeof PW.kariKeisanNote === 'function', '★仮計算の 札を 作る所が 無い★（画面と 紙で 別々に 書かせない）');
  const emp = { id: 'x', name: '県なし 太郎', pref: '' };
  const fuda = PW.kariKeisanNote(emp, YM);
  ok(fuda && /仮/.test(fuda), '★県が 空なのに 仮計算の 札が 出ない★ … 「' + fuda + '」');
  ok(/東京/.test(fuda), '★何の率で 計算したかを 言っていない★ … 「' + fuda + '」');
  ok(!PW.kariKeisanNote({ id: 'y', name: '香川 花子', pref: 'kagawa' }, YM), '★県が 在るのに 札が 出る★');
  console.log('     札の 文 … ' + fuda);
});

T('★⑥ 紙（明細）に 札が 出る＝4つの 版 ぜんぶ 通る 1か所に 入れる', () => {
  const fs2 = require('node:fs');
  const src = fs2.readFileSync(path.join(ROOT, 'kyuyo/js/render.js'), 'utf8');
  const i = src.indexOf('function heroHTML');
  const j = src.indexOf(String.fromCharCode(10), i);
  const hero = src.slice(i, j);
  /* ★heroHTML は 4つの 版（cols/vstack/vstack2/strips）ぜんぶが 呼ぶ 1か所★＝ここに 入れれば 紙は 全部 出る */
  ok(/kari/.test(hero), '★紙の 名前の 所に 仮計算の 札が 無い★（heroHTML に 入れる）');
  const yobu = (src.match(/heroHTML\(/g) || []).length;
  ok(yobu >= 5, '★heroHTML を 呼ぶ 版が 減っている★ … ' + yobu + '（作り＋4版）');
  console.log('     heroHTML を 呼ぶ 所 … ' + (yobu - 1) + '版');
});

T('★⑦ 画面（一覧/集計・帳票）にも 同じ 札を 出す', () => {
  const fs2 = require('node:fs');
  const app = fs2.readFileSync(path.join(ROOT, 'kyuyo/js/app.js'), 'utf8');
  ok(/kariKeisanNote/.test(app), '★app が 仮計算の 札を 使っていない★');
  /* ★書き方で 探すと 空振りする★＝`kari:` から `_p.kari=` に 変えただけで 赤に なった（2026-09-03）。
     ⇒★紙へ 渡している事★と ★画面 3本に 置いている事★を、書き方に よらない 形で 見る。 */
  ok(/\.kari\s*=|kari\s*:/.test(app), '★紙へ 渡す 所（kari）が 無い★＝紙は 黙ったまま');
  const oku = (app.match(/kariWarn\(\)/g) || []).length;
  ok(oku >= 4, '★画面に 置いた 数が 足りない★＝作り1つ＋一覧・集計・帳票の 3本で 4つ 要る（今 ' + oku + '）');
  console.log('     画面に 置いた 所 … ' + (oku - 1) + '本（一覧・集計・帳票）');
});

if (SELF) {
  console.log('\n[pref-daiyo] ★自己確認★（★わざと 壊すと 赤に なるか★）');
  let ng = 0;
  const say = (nm, good) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + nm + (good ? '' : '  ★思っていたのと 違う★')); };
  /* 古い既定 0.04955 を 食わせたら ①が 赤に なるか（＝この試験は 差が 分かる） */
  const hyo = Math.round(HYO * hyoRate());
  say('古い既定 0.04955（12,883円）と 表の 額は 違う', Math.round(HYO * 0.04955) !== hyo);
  /* 県が 在る/無いで 額が 違う事（＝代用は「同じ額」では ない） */
  say('空の代用と 香川は 額が 違う',
    Math.round(HYO * hyoRate()) !== Math.round(HYO * (SHH.getKenko('kagawa', YM).jugyoin + SHH.getShienkin(YM))));
  if (ng) { console.log('\n★自己確認 ' + ng + '件 おかしい★'); process.exit(1); }
  console.log('  ★2通り ぜんぶ 思った通り★');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
