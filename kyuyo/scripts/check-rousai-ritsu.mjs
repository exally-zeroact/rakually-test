/* check-rousai-ritsu.mjs — ★労災保険率表が 法令と 合っているか（★外を 叩く★＝週1）★
 * ============================================================================
 * ★なぜ★
 *   労災保険率は ★法令（省令）別表第１★で 決まっており、改正される。
 *   うちの lib（kyuyo/lib/rousai-ritsu.js）は ★2026-09-04 に e-Gov から 取った 写し★。
 *   ⇒★法令が 変わったのに lib が そのままだと、保険料が 静かに ずれる★。
 *
 * ★これは ci.yml に 入れない★（外の 役所を 叩く＝向こうの 都合で 赤に なる）。
 *   ★source-urls.yml（週1・手動）に 入れる★＝[[feedback_cdn_version_must_be_pinned]] と 同じ 考え方。
 *   ★repo の 中だけで 判る「lib が 壊れていないか」は rousai-ritsu.test.mjs が CI で 毎回 見る★。
 *
 * 使い方: node kyuyo/scripts/check-rousai-ritsu.mjs [--self-test]
 *   --self-test … ★外に 出ずに★ 読み取りの 手順だけを 作り物で 確かめる
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = require(path.join(ROOT, 'lib/rousai-ritsu.js'));

const Z = '０１２３４５６７８９';
export function han(x) {
  let s = String(x == null ? '' : x);
  for (let i = 0; i < Z.length; i++) s = s.split(Z[i]).join(String(i));
  return s.split('．').join('.');
}
/* ★XML の 行は 3列（分類つき）と 2列（分類の 続き）が 混ざる★
   ★2列を 落とすと 53本が 41本に 減る★＝2026-09-04 に 一度 踏んだ 穴 */
export function parseTable(xml) {
  const i = xml.indexOf('労災保険率表</TableStructTitle>');
  if (i < 0) return { measured: false, why: '★労災保険率表の 見出しが 無い★（法令の 形が 変わった？）' };
  const j = xml.indexOf('</TableStruct>', i);
  const body = xml.slice(i, j);
  const rows = body.match(/<TableRow>[\s\S]*?<\/TableRow>/g) || [];
  const out = [];
  let bunrui = '';
  for (let k = 1; k < rows.length; k++) {
    const cells = (rows[k].match(/<TableColumn[^>]*>[\s\S]*?<\/TableColumn>/g) || [])
      .map((c) => c.replace(/<[^>]+>/g, '').trim());
    let shurui, ritsu;
    if (cells.length === 3) { if (cells[0]) bunrui = cells[0]; shurui = cells[1]; ritsu = cells[2]; }
    else if (cells.length === 2) { shurui = cells[0]; ritsu = cells[1]; }
    else return { measured: false, why: '★見た事の 無い 形の 行★（列 ' + cells.length + '個）' };
    const m = /^1000分の([0-9.]+)$/.exec(han(ritsu));
    if (!m) return { measured: false, why: '★率が 読めない★ … ' + shurui + ' / ' + ritsu };
    out.push({ bunrui, shurui, permil: Number(m[1]) });
  }
  return { measured: true, rows: out };
}
export function fingerprint(rows) {
  const norm = rows.slice().sort((a, b) => (a.shurui < b.shurui ? -1 : a.shurui > b.shurui ? 1 : 0))
    .map((r) => [r.bunrui, r.shurui, r.permil]);
  return crypto.createHash('sha256').update(JSON.stringify(norm)).digest('hex').slice(0, 8);
}

if (process.argv.includes('--self-test')) {
  /* ★外に 出ない★＝手順（2列の 行を 落とさないか）を 作り物で 見る */
  const nise = '労災保険率表</TableStructTitle>'
    + '<TableRow><TableColumn>分類</TableColumn><TableColumn>種類</TableColumn><TableColumn>率</TableColumn></TableRow>'
    + '<TableRow><TableColumn>漁業</TableColumn><TableColumn>海面漁業</TableColumn><TableColumn>１０００分の１８</TableColumn></TableRow>'
    + '<TableRow><TableColumn>定置網漁業</TableColumn><TableColumn>１０００分の３７</TableColumn></TableRow>'
    + '</TableStruct>';
  const r = parseTable(nise);
  let ng = 0;
  const say = (nm, good) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + nm); };
  say('★2列の 行を 落とさない★（落とすと 53本が 41本に なる）', r.measured && r.rows.length === 2);
  say('2列の 行は 上の 分類を 引き継ぐ', r.measured && r.rows[1].bunrui === '漁業');
  say('全角の 数字を 読める（１８→18／３７→37）', r.measured && r.rows[0].permil === 18 && r.rows[1].permil === 37);
  say('小数点（．）も 読める', han('１０００分の２．５') === '1000分の2.5');
  say('見出しが 無ければ 🟡未測定（0本と 混ぜない）', parseTable('<x/>').measured === false);
  if (ng) { console.log('\n★自己確認 ' + ng + '件 おかしい★'); process.exit(1); }
  console.log('  ★5通り ぜんぶ 思った通り★');
  process.exit(0);
}

/* ── ここから 外に 出る ───────────────────────────────── */
const res = await fetch(R.SOURCE_URL, { headers: { 'user-agent': 'rakunally-statutory-check' } })
  .catch((e) => ({ ok: false, status: 0, _e: e }));
if (!res || !res.ok) {
  console.log('🟡 ★未測定★ 法令が 取れませんでした（' + (res && res.status) + '）＝★合っている とも 違う とも 言えない★');
  process.exit(2);
}
const xml = await res.text();
const got = parseTable(xml);
if (!got.measured) { console.log('🟡 ★未測定★ ' + got.why); process.exit(2); }
const ima = fingerprint(got.rows);
const lib = fingerprint(R.TABLE);
console.log('\n[check-rousai-ritsu] ' + R.LAW_NAME);
console.log('  法令 … ' + got.rows.length + '業種 ／ 指紋 ' + ima);
console.log('  lib  … ' + R.TABLE.length + '業種 ／ 指紋 ' + lib + '（書いてある 指紋 ' + R.FINGERPRINT + '）');
if (ima === lib && lib === R.FINGERPRINT) { console.log('  ✓ ★合っています★'); process.exit(0); }
const chigau = [];
const map = {};
got.rows.forEach((r) => { map[r.shurui] = r.permil; });
R.TABLE.forEach((r) => {
  if (!(r.shurui in map)) chigau.push('★法令に 無い★ ' + r.shurui);
  else if (map[r.shurui] !== r.permil) chigau.push(r.shurui + ' … lib ' + r.permil + '‰／法令 ' + map[r.shurui] + '‰');
});
got.rows.forEach((r) => { if (!R.TABLE.some((x) => x.shurui === r.shurui)) chigau.push('★lib に 無い★ ' + r.shurui + ' ' + r.permil + '‰'); });
console.log('  ✗ ★ズレています★');
chigau.forEach((x) => console.log('     - ' + x));
process.exit(1);
