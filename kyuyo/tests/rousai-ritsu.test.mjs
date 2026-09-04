/* rousai-ritsu.test.mjs — ★労災保険率表（repo の 中だけで 判る 事）★
 * ============================================================================
 * ★外は 叩かない★（法令を 毎回 叩くと 向こうの 都合で 赤に なる）
 *   ★法令と 突き合わせるのは kyuyo/scripts/check-rousai-ritsu.mjs（週1・source-urls.yml）★
 *   ★ここは lib が 壊れていないか だけを CI で 毎回 見る★
 *
 * ★なぜ この lib が 要るか（2026-09-04 実測）★
 *   うちは ★労災率を 会社が 手で 打ち込む★ようにしていた＝★間違えても 誰も 気づけない★。
 *   出どころ＝労働保険の保険料の徴収等に関する法律施行規則 別表第１（e-Gov 法令検索）。
 *
 * ★一度 踏んだ 穴（ここで 固定する）★
 *   XML の 行は ★3列（分類つき）と 2列（分類の 続き）が 混ざる★。
 *   2列を 落とすと ★53業種が 41業種に 減る★（＝黙って 少なくなる）。
 *
 * 使い方: node kyuyo/tests/rousai-ritsu.test.mjs [--self-test]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = require(path.join(ROOT, 'lib/rousai-ritsu.js'));
const SELF = process.argv.includes('--self-test');
let pass = 0, fail = 0;
const T = (n, f) => { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m); };

const fp = (rows) => crypto.createHash('sha256').update(JSON.stringify(
  rows.slice().sort((a, b) => (a.shurui < b.shurui ? -1 : a.shurui > b.shurui ? 1 : 0))
    .map((r) => [r.bunrui, r.shurui, r.permil]))).digest('hex').slice(0, 8);

console.log('\n[rousai-ritsu] 労災保険率表（別表第１）… ★外は 叩かない★');

T('★① 53業種 在る（2列の 行を 落とすと 41に 減る）', () => {
  ok(R.COUNT === 53, '★' + R.COUNT + '業種★（53 のはず）');
  ok(R.TABLE.length === 53, '★TABLE が ' + R.TABLE.length + '本★');
});

T('★② 分類は 8つ・全部の 行に 分類が 付いている', () => {
  const b = R.bunruiList();
  ok(b.length === 8, '★分類が ' + b.length + '種類★（8 のはず）… ' + b.join('／'));
  const kara = R.TABLE.filter((r) => !r.bunrui);
  ok(!kara.length, '★分類が 空の 行が ' + kara.length + '本★（2列の 行で 引き継げていない）');
});

T('★③ 率は 全部 数字で 2.5〜88.0‰ の 中', () => {
  R.TABLE.forEach((r) => {
    ok(typeof r.permil === 'number' && isFinite(r.permil), '★率が 数字でない★ … ' + r.shurui + ' / ' + r.permil);
    ok(r.permil >= 2.5 && r.permil <= 88, '★' + r.shurui + ' が ' + r.permil + '‰★（2.5〜88 の 外）');
  });
  const mn = Math.min.apply(null, R.TABLE.map((r) => r.permil));
  const mx = Math.max.apply(null, R.TABLE.map((r) => r.permil));
  console.log('     ' + R.COUNT + '業種 ／ ' + mn + '‰ 〜 ' + mx + '‰ ／ 分類 ' + R.bunruiList().length + '種類');
});

T('★④ 事業の種類が だぶっていない（同じ名前で 2つの 率に ならない）', () => {
  const seen = {}, dabu = [];
  R.TABLE.forEach((r) => { if (seen[r.shurui]) dabu.push(r.shurui); seen[r.shurui] = 1; });
  ok(!dabu.length, '★だぶり★ … ' + dabu.join('／'));
});

T('★⑤ 指紋が 書いてある 物と 合う（1行 書き換えたら 赤）', () => {
  ok(fp(R.TABLE) === R.FINGERPRINT, '★指紋が ' + fp(R.TABLE) + '★（書いてあるのは ' + R.FINGERPRINT + '）');
});

T('★⑥ 引けない 名前は null（0を 返さない）', () => {
  ok(R.permilOf('その他の各種事業') === 3, '★その他の各種事業が ' + R.permilOf('その他の各種事業') + '‰★');
  ok(R.permilOf('林業') === 52, '★林業が ' + R.permilOf('林業') + '‰★');
  ok(R.permilOf('存在しない業種') === null, '★無い 名前に ' + R.permilOf('存在しない業種') + ' を 返している★');
  ok(R.rateOf('存在しない業種') === null, '★rateOf が null を 返さない★');
  ok(R.rateOf('林業') === 0.052, '★rateOf が ' + R.rateOf('林業') + '★（0.052 のはず）');
});

T('★⑦ 別表に 無い 物（第十六条 本文）も 持っている', () => {
  ok(R.SENPAKU_PERMIL === 42, '★船舶所有者が ' + R.SENPAKU_PERMIL + '‰★（千分の四十二）');
  ok(R.HIGYOMU_PERMIL === 0.6, '★非業務災害率が ' + R.HIGYOMU_PERMIL + '‰★（千分の〇・六）');
  ok(R.permilOf('船舶所有者の事業') === 42, '★船舶所有者を 名前で 引けない★');
});

T('★⑧ 出どころが 書いてある（後から 追える）', () => {
  ok(/laws\.e-gov\.go\.jp/.test(R.SOURCE_URL), '★出どころの URL が 無い★');
  ok(/別表第１/.test(R.LAW_NAME), '★法令の 名前が 無い★');
});

if (SELF) {
  console.log('\n[rousai-ritsu] ★自己確認★（★わざと 壊すと 赤に なるか★）');
  let ng = 0;
  const say = (nm, good) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + nm + (good ? '' : '  ★思っていたのと 違う★')); };
  const nise = R.TABLE.slice();
  say('★1行 減らすと 指紋が 変わる★', fp(nise.slice(0, 52)) !== R.FINGERPRINT);
  say('★率を 1つ 変えると 指紋が 変わる★',
    fp(nise.map((r, i) => (i === 0 ? { bunrui: r.bunrui, shurui: r.shurui, permil: r.permil + 0.1 } : r))) !== R.FINGERPRINT);
  say('★名前を 1つ 変えると 指紋が 変わる★',
    fp(nise.map((r, i) => (i === 0 ? { bunrui: r.bunrui, shurui: r.shurui + 'x', permil: r.permil } : r))) !== R.FINGERPRINT);
  say('並び順を 変えても 指紋は 変わらない（中身で 見ている）', fp(nise.slice().reverse()) === R.FINGERPRINT);
  say('★2列の 行を 落とした 形（41本）は 指紋が 変わる★', fp(nise.slice(0, 41)) !== R.FINGERPRINT);
  if (ng) { console.log('\n★自己確認 ' + ng + '件 おかしい★'); process.exit(1); }
  console.log('  ★5通り ぜんぶ 思った通り★');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
