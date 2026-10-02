/* roudou-ritsu-onaji.test.mjs — ★労災率を 打ち直した 時の 数＝描き直した 時の 数★（jsdom・ブラウザ 無し）
 * ============================================================================
 * ★なぜ（2026-10-02）★
 *   帳票 → 労働保険 で 業種＝「一覧に無い」の 率を 打つと、受け手は ★労災保険料 だけ★ 直していた。
 *   ⇒ 打っている 間の 精算は「—」の まま（実測：開き直すと「多く 納めています ¥22,780」）
 *   ⇒ ★Excel は state._roudouSum を 読む★＝合計・概算・延納・期別・精算が ★古い まま 出る★
 *   直し＝率に 依る 6つを roudouRitsuKeisan の 1か所に 寄せ、表の 描画（roudouSummary）も 受け手も それを 呼ぶ。
 *
 * ★ここで 見る 事★
 *   ★2通りの 入れ方で 同じ 答えか★
 *     ㋐ 率 X で roudouSummary を 一から 出す（描き直した 時の 道）
 *     ㋑ 率 Y で 出した 物に、率を X に 変えて roudouRitsuKeisan を 上書き（打った 時の 道）
 *   ⇒ 業種 全部＋一覧に無い（率 5通り）× 賃金 5通り × 前年度の 概算 4通り × 雇用の 業種 3 × 年度 2 で ★違う 組 0★
 *   ★空振り止め★ … 返りの 種類が 少なすぎたら 赤（★何でも 同じに なる 入れ方では 何も 測って いない★）
 * ★わざと 壊す 回（--waza）★ … ㋑を ★前の 受け手と 同じ（労災保険料 だけ 直す）★に して ★違う 組が 出る★ 事を 見る
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
const A = win.__PAYSLIP_TEST;
if (!A || !A.roudouSummary || !A.roudouRitsuKeisan) { console.log('✗ ★app.js から roudouSummary／roudouRitsuKeisan が 取れない★'); process.exit(1); }
if (!win.RousaiRitsu || !win.RoudouShinkoku) { console.log('✗ ★労災率の 表 か 申告の 計算が 読めていない★'); process.exit(1); }

const sortJ = (o) => JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v)) ? Object.keys(v).sort().reduce((a, kk) => (a[kk] = v[kk], a), {}) : v);
const shurui = [''].concat(win.RousaiRitsu.list().map((r) => r.shurui)).concat(['船舶所有者の事業']);
const te = ['', '0', '3', '2.5', '52'];
const iretai = shurui.map((x) => ({ rousaiShurui: x })).concat(te.map((x) => ({ rousaiShurui: '__te__', rousaiRate: x })));
const emps = [{ id: 'a', payType: '月給', apply: {} }, { id: 'b', payType: '役員', apply: {} }, { id: 'c', payType: '時給', apply: { employ: false } }];
const recsOf = (fy, w) => { const r = []; for (let i = 0; i < 12; i++) { const mm = 4 + i, yy = mm > 12 ? fy + 1 : fy; const ym = yy + '-' + ('0' + (mm > 12 ? mm - 12 : mm)).slice(-2); r.push({ ym, employee_id: 'a', data: { shikyuTotal: w } }, { ym, employee_id: 'b', data: { shikyuTotal: w } }, { ym, employee_id: 'c', data: { shikyuTotal: Math.floor(w / 3) } }); } return r; };

let kumi = 0, chigau = 0; const iro = new Set(); const rei = [];
for (const fy of [2025, 2026]) for (const g of ['ippan', 'kensetsu', 'norin']) for (const w of [0, 999, 123456, 1234567, 30000000]) for (const zg of ['', '0', '100000', '5000000']) {
  const recs = recsOf(fy, w);
  for (let i = 0; i < iretai.length; i++) {
    const X = iretai[i], Y = iretai[(i + 7) % iretai.length];   /* ★Y は X と 別の 率★ */
    A.state.company = Object.assign({ gyoshu: g, zennendoGaisan: zg }, X);
    const ichikara = A.roudouSummary(recs, fy, emps);                      /* ㋐ 描き直した 時の 道 */
    A.state.company = Object.assign({ gyoshu: g, zennendoGaisan: zg }, Y);
    const s = A.roudouSummary(recs, fy, emps);
    A.state.company = Object.assign({ gyoshu: g, zennendoGaisan: zg }, X);
    if (WAZA) {                                                           /* ★前の 受け手＝労災保険料 だけ 直す★ */
      const p = Number(A.state.company.rousaiRate) || 0;
      s.rousaiPermil = p; s.rousaiRyo = (p > 0) ? Math.floor(Math.floor(s.rousaiWageTotal / 1000) * 1000 * (p / 1000)) : null;
    } else {
      const rk = A.roudouRitsuKeisan(s.rousaiWageTotal, s.koyoWageTotal, s.koyoFull);   /* ㋑ 打った 時の 道 */
      Object.keys(rk).forEach((k) => { s[k] = rk[k]; });
    }
    kumi++; const a = sortJ(ichikara), b = sortJ(s); iro.add(a);
    if (a !== b) { chigau++; if (rei.length < 3) rei.push({ fy, g, w, zg, X: X.rousaiShurui + (X.rousaiRate != null ? ':' + X.rousaiRate : '') }); }
  }
}
console.log('\n[roudou-ritsu-onaji] 率を 打ち直した 時の 数＝描き直した 時の 数' + (WAZA ? '  ★★わざと 前の 受け手（労災保険料 だけ）に した 回★★' : ''));
console.log('  組 ' + kumi + '（業種 ' + shurui.length + '＋一覧に無い×率 ' + te.length + '）／返りの 種類 ' + iro.size + '／★2つの 道で 違う 組 ' + chigau + '★');
rei.forEach((x) => console.log('    例 ' + JSON.stringify(x)));
let ng = 0;
if (iro.size < 1000) { ng++; console.log('  ✗ ★返りの 種類が ' + iro.size + '＝少なすぎる（何でも 同じに なる 入れ方では 測って いない）★'); }
if (WAZA) { if (chigau === 0) { ng++; console.log('  ✗ ★前の 受け手に 戻しても 違いが 出ない＝この 門は 何も 見て いない★'); } else console.log('  ✓ ★前の 受け手に 戻すと 違う 組が 出る（' + chigau + '）＝門は 効いている★'); }
else if (chigau) { ng++; console.log('  ✗ ★打った 時と 描き直した 時で 数が 違う★'); }
else console.log('  ✓ ★打った 時と 描き直した 時で 数が 全部 同じ★');
process.exit(ng ? 1 : 0);
