/* roudou-gaisan-ritsu.test.mjs — ★概算保険料は「その 保険年度（fy+1）」の 率で 出す★（jsdom・ブラウザ 無し）
 * ============================================================================
 * ★なぜ（2026-11-06）★
 *   帳票→労働保険の Excel「③ 概算保険料（今年度）」と「④延納・期別」は、
 *   ★確定年度 fy の 雇用保険の 全体率★で 出していた（gaisan.gaku＝確定と 同じ 額）。
 *   ★法★ 労働保険の保険料の徴収等に関する法律 第十五条第一項第一号
 *     「…その保険年度に使用するすべての労働者に係る賃金総額の見込額（厚生労働省令で定める場合にあつては、
 *       直前の保険年度に使用したすべての労働者に係る賃金総額）に当該事業についての一般保険料に係る保険料率を乗じて…」
 *   ⇒ 概算は ★その 保険年度（年度更新の 年＝fy+1）の 率★。
 *     例：fy2025 確定の 雇用＝14.5‰（令和7）／概算 fy2026＝★13.5‰（令和8）★。前は 14.5‰ で 多く 出ていた。
 *
 * ★ここで 見る 事★
 *   ① fy2025・一般・労災 3‰・賃金 月100万×12：確定 210,000 円／★概算 198,000 円★（13.5‰）
 *   ② 建設・農林も lib の fy+1 の 全体率で 出る（額は lib から 計算した 物と 同じ）
 *   ③ fy2026（翌年度 2027 の 率が 未収録）＝★概算・延納・期別は 数を 作らない（null）★・確定は 出る
 *   ④ 労災率の 欄の 受け手の 道（roudouRitsuKeisan を s.koyoFullGaisan で 呼び直す）でも ①と 同じ
 *   ⑤ Excel の「③ 概算保険料（今年度）」の 行が ①の 額・③の 時は「—」
 * ★わざと 壊す 回（--waza）★ … 概算に 確定の 率（koyoFull）を 渡して ★赤に なる★ 事を 見る
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require_ = createRequire(pathToFileURL(path.join(ROOT, 'package.json')));
let JSDOM;
try { ({ JSDOM } = require_('jsdom')); }
catch { console.log('★jsdom が要ります（npm install）。飛ばせません（SKIPを緑と呼ばない）。'); process.exit(1); }
const WAZA = process.argv.includes('--waza');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const file = path.join(ROOT, 'kyuyo/index.html');
const html = fs.readFileSync(file, 'utf8');
const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/kyuyo/index.html' });
const win = dom.window, doc = win.document;
win.fetch = () => Promise.reject(new Error('no net')); win.alert = () => {}; win.confirm = () => true; win.scrollTo = () => {}; win.print = () => {};
for (const m of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
  const src = m[1].split('?')[0]; const base = src.split('/').pop();
  if (/^https?:/.test(src) || ['supa-config.js', 'auth.js', 'env-badge.js', 'rakunally-login.js'].includes(base)) continue;
  const p = path.resolve(path.dirname(file), src); if (!fs.existsSync(p)) continue;
  const el = doc.createElement('script'); el.textContent = fs.readFileSync(p, 'utf8'); doc.body.appendChild(el);
}
await sleep(400);
const A = win.__PAYSLIP_TEST, KH = win.KoyoHoken;
if (!A || !A.roudouSummary || !A.roudouRitsuKeisan || !A.roudouAoa) { console.log('✗ ★app.js から roudouSummary／roudouRitsuKeisan／roudouAoa が 取れない★'); process.exit(1); }
if (!KH || !win.RoudouShinkoku) { console.log('✗ ★雇用保険の 率 か 申告の 計算が 読めていない★'); process.exit(1); }

const emps = [{ id: 'a', payType: '月給', apply: {} }];
const recsOf = (fy, w) => { const r = []; for (let i = 0; i < 12; i++) { const mm = 4 + i, yy = mm > 12 ? fy + 1 : fy; r.push({ ym: yy + '-' + ('0' + (mm > 12 ? mm - 12 : mm)).slice(-2), employee_id: 'a', data: { shikyuTotal: w } }); } return r; };
const sum = (fy, g) => {
  A.state.company = { gyoshu: g, rousaiShurui: '__te__', rousaiRate: '3', zennendoGaisan: '' };
  const s = A.roudouSummary(recsOf(fy, 1000000), fy, emps);
  if (WAZA && s.gaisan) {                                   /* ★前の 形＝概算に 確定の 率★ */
    const rk = A.roudouRitsuKeisan(s.rousaiWageTotal, s.koyoWageTotal, s.koyoFull, { fy: s.fy + 1, koyoFull: s.koyoFull });
    Object.keys(rk).forEach((k) => { s[k] = rk[k]; });
  }
  return s;
};
const aoaRow = (s, fy, label) => (A.roudouAoa(s, fy).find((r) => r[0] === label) || [])[1];

/* ★--waza の 回の 赤は わざと＝✗ を 付けない（✗ が 在って 終わり値0 だと ci-3tsu が「赤を 緑と 言う」に 数える）★ */
let ng = 0, pass = 0; const ok = (c, msg) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { ng++; console.log((WAZA ? '  ● 赤（わざと） ★' : '  ✗ ★') + msg + '★'); } };
console.log('\n[roudou-gaisan-ritsu] 概算保険料は その 保険年度（fy+1）の 率' + (WAZA ? '  ★★わざと 確定の 率を 概算に 使った 回★★' : ''));

// ①
const s1 = sum(2025, 'ippan');
ok(s1.gokeiRyo === 210000, '① fy2025 確定 ' + s1.gokeiRyo + '＝210,000（労災3‰＋雇用14.5‰）');
ok(s1.gaisan && s1.gaisan.gaku === 198000, '① fy2025 概算 ' + (s1.gaisan && s1.gaisan.gaku) + '＝198,000（労災3‰＋雇用 令和8 13.5‰）');
ok(s1.gaisanRitsu && s1.gaisanRitsu.fy === 2026 && Math.abs(s1.gaisanRitsu.koyoFull - 0.0135) < 1e-12, '① 概算の 雇用の 率 ' + JSON.stringify(s1.gaisanRitsu) + '＝0.0135');
ok(s1.enno && /198,000円/.test(s1.enno.riyu) && s1.enno.ok === false && s1.kibetsu === null, '① 延納は 概算の 額で 見る：' + (s1.enno && s1.enno.riyu));
{ const big = (() => { A.state.company = { gyoshu: 'ippan', rousaiShurui: '__te__', rousaiRate: '3', zennendoGaisan: '' }; return A.roudouSummary(recsOf(2025, 3000000), 2025, emps); })();
  ok(big.kibetsu && big.kibetsu.ki.reduce((a, b) => a + b, 0) === big.gaisan.gaku && big.gaisan.gaku === 594000, '① 期別の 足し算＝概算 ' + (big.gaisan && big.gaisan.gaku) + '（36,000,000×16.5‰）'); }
// ②
for (const g of ['kensetsu', 'norin']) {
  const s = sum(2025, g), want = Math.floor(12000000 * (0.003 + KH.fullRate(g, 2026)));
  ok(s.gaisan && s.gaisan.gaku === want && want !== s.gokeiRyo, '② ' + g + ' 概算 ' + (s.gaisan && s.gaisan.gaku) + '＝' + want + '（確定 ' + s.gokeiRyo + ' と 違う）');
}
// ③
const s3 = sum(2026, 'ippan');
ok(s3.gokeiRyo === 198000, '③ fy2026 確定 ' + s3.gokeiRyo + '＝198,000');
ok(s3.gaisan === null && s3.enno === null && s3.kibetsu === null, '③ fy2026 の 概算・延納・期別＝null（2027 の 率は 未収録＝数を 作らない）');
// ④
{
  const s = sum(2025, 'ippan');
  A.state.company = { gyoshu: 'ippan', rousaiShurui: '__te__', rousaiRate: '3', zennendoGaisan: '' };
  const rk = A.roudouRitsuKeisan(s.rousaiWageTotal, s.koyoWageTotal, s.koyoFull, s.gaisanRitsu);
  ok(rk.gaisan && rk.gaisan.gaku === 198000 && rk.gokeiRyo === 210000, '④ 受け手の 道 概算 ' + (rk.gaisan && rk.gaisan.gaku) + '／確定 ' + rk.gokeiRyo);
}
// ⑤
ok(aoaRow(s1, 2025, '③ 概算保険料（2026年度）') === 198000, '⑤ Excel ③（2026年度）fy2025＝' + aoaRow(s1, 2025, '③ 概算保険料（2026年度）'));
ok(aoaRow(s3, 2026, '③ 概算保険料（2027年度）') === '—', '⑤ Excel ③（2027年度）fy2026＝' + aoaRow(s3, 2026, '③ 概算保険料（2027年度）'));
ok(/2027年度の 雇用保険料率/.test(s3.gaisanRiyu || '') && JSON.stringify(A.roudouAoa(s3, 2026)).includes(s3.gaisanRiyu), '⑤ 出せない 訳が Excel に 出る：' + s3.gaisanRiyu);
// ⑥ 4つ目（概算の 率）を 省いたら 概算は 作らない（確定の 率で 埋めない）
{
  const s = sum(2025, 'ippan');
  A.state.company = { gyoshu: 'ippan', rousaiShurui: '__te__', rousaiRate: '3', zennendoGaisan: '' };
  const rk = A.roudouRitsuKeisan(s.rousaiWageTotal, s.koyoWageTotal, s.koyoFull);
  ok(rk.gaisan === null && rk.enno === null && rk.kibetsu === null && rk.gokeiRyo === 210000, '⑥ 4つ目を 省くと 概算 null（確定は ' + rk.gokeiRyo + '）');
}
// ⑦ 精算は 確定の 額から（概算の 額を 使わない）
{
  A.state.company = { gyoshu: 'ippan', rousaiShurui: '__te__', rousaiRate: '3', zennendoGaisan: '200000' };
  const s = A.roudouSummary(recsOf(2025, 1000000), 2025, emps);
  ok(s.seisan && s.seisan.measured && s.seisan.kubun === 'fusoku' && s.seisan.gaku === 10000, '⑦ 精算＝確定 210,000 − 前年度 200,000＝不足 ' + (s.seisan && s.seisan.gaku));
}
// ⑧ 労災の 表が 効く 年を 越えたら 概算は 作らない（雇用 2027 を 入れても）→ 労災の 表を 2027 で 入れると 出る
if (!WAZA) {
  KH.hydrate(2027, { ippan: 0.005, kensetsu: 0.006, norin: 0.006, employer: { ippan: 0.0085, kensetsu: 0.0105, norin: 0.0095 } });
  const a = sum(2026, 'ippan');
  ok(a.gaisan === null && /2027年度の 労災保険率/.test(a.gaisanRiyu || ''), '⑧ 雇用 2027 だけ 入れた＝概算 null：' + a.gaisanRiyu);
  win.RousaiRitsu.hydrate(2027, { hyo: win.RousaiRitsu.list() });
  const b = sum(2026, 'ippan');
  ok(b.gaisan && b.gaisan.gaku === 198000 && b.gaisanRiyu === null, '⑧ 労災の 表も 2027 で 入れた＝概算 ' + (b.gaisan && b.gaisan.gaku));
}

if (WAZA) { if (ng === 0) { console.log('  ✗ ★確定の 率に 戻しても 赤が 出ない＝この 門は 何も 見て いない★'); process.exit(1); } console.log('  ✓ ★確定の 率に 戻すと 赤 ' + ng + '＝門は 効いている★'); process.exit(0); }
console.log('\n' + pass + ' passed, ' + ng + ' failed');
process.exit(ng ? 1 : 0);
