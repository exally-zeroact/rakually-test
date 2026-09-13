/* check-shutten-mukai.mjs — ★lib が 持つ 出典を 全部 実際に 開いて 生きているか 見る★
 * =============================================================================
 * ★なぜ（2026-09-13 実測）★
 *   lib（kyuyo/lib/statutory-rows.js）が 持つ 出典のうち ★3本が 404★ だった。
 *     koyo:2025 / koyo:2026 の 一覧ページ、warimashi:2023 の PDF
 *   ＝「確認日だけ 残って 辿れない」＝★なぜ その金額かを 客や 社労士に 示せない★。
 *   既に在る kyuyo/scripts/check-source-urls.mjs は ★中央(statutory)の 出典★を 見る。
 *   ★lib 側は 誰も 見ていなかった★＝ここが その穴。
 *   （指示役1 2026-09-13「saitei-source は 最賃だけ＝他の kind にも 広げてほしい」）
 *
 * ★2026-09-13 作り直し★
 *   前の版は ★URL を この道具の 中に 焼き込んでいた★＝lib を 直しても
 *   ★古い URL を 見て「まだ 死んでいる」と 言い続けた★（実際に 踏んだ）。
 *   ⇒ ★出典は lib（buildStatutoryRows）から 取る★。ここには 1本も 書かない。
 *
 * ★どこで 回すか★＝外を 叩くので ★週1（.github/workflows/source-urls.yml）★。
 *   毎回のCIには 入れない（向こうの 都合で 赤くなると 人が 赤を 見なくなる）。
 *
 * 使い方: node scripts/check-shutten-mukai.mjs          … 死んでいれば 終わり値 3
 *         node scripts/check-shutten-mukai.mjs --self-test … わざと 壊して 赤に なるか
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(import.meta.url);
const SELF = process.argv.includes('--self-test');

/* ★物差しそのもの★＝返事を 渡すと「生きているか」を 返す（外へ 出ずに 確かめられる） */
export function ikiteru(code) { return Number(code) >= 200 && Number(code) < 400; }

if (SELF) {
  console.log('\n[check-shutten-mukai --self-test] ★物差しそのもの★（外へ 出ない）');
  let ng = 0;
  const iu = (nm, good) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + nm + (good ? '' : '  ★思っていたのと 違う★')); };
  iu('200 は 生きている', ikiteru(200));
  iu('301 は 生きている（引っ越しは 追う）', ikiteru(301));
  iu('404 は ★死んでいる★', !ikiteru(404));
  iu('500 は ★死んでいる★', !ikiteru(500));
  iu('0（つながらない）は ★死んでいる★', !ikiteru(0));
  /* ★出典を 1本も 持たない lib を 食わせたら 赤に なるか★＝空振りを 緑に しない */
  iu('出典が 0本なら ★赤★（空振りを 緑に しない）', kazoeru([]).akai);
  iu('全部 生きていれば 緑', !kazoeru([{ kind: 'a', year: 1, url: 'u', code: 200 }]).akai);
  console.log(ng ? '\n★自己確認 ' + ng + '件 おかしい★' : '\n自己確認 OK');
  process.exit(ng ? 1 : 0);
}

/* 数え方も 1か所（自己確認から 呼べる形） */
export function kazoeru(kekka) {
  const shinda = kekka.filter((r) => !ikiteru(r.code));
  return { zen: kekka.length, shinda, akai: kekka.length === 0 || shinda.length > 0 };
}

/* ★出典は lib から 取る★（この道具には 1本も 書かない） */
const L = {
  SHH: require_(path.join(ROOT, 'kyuyo/lib/shakaihoken-hyo.js')),
  SAI: require_(path.join(ROOT, 'kyuyo/lib/saitei-chingin.js')),
  KOYO: require_(path.join(ROOT, 'kyuyo/lib/koyo-hoken.js')),
  D: require_(path.join(ROOT, 'kyuyo/lib/shotokuzei-densan.js')),
  H: require_(path.join(ROOT, 'kyuyo/lib/shotokuzei-hei.js')),
  NI: require_(path.join(ROOT, 'kyuyo/lib/shotokuzei-nichi.js')),
  SZ: require_(path.join(ROOT, 'kyuyo/lib/shoyo-zei.js')),
  N: require_(path.join(ROOT, 'kyuyo/lib/nenmatsu.js')),
  WM: require_(path.join(ROOT, 'kyuyo/lib/warimashi.js')),
  SHZ: require_(path.join(ROOT, 'kyuyo/lib/shouhizei-ritsu.js')),
  RR: require_(path.join(ROOT, 'kyuyo/lib/rousai-ritsu.js')),
};
const SR = require_(path.join(ROOT, 'kyuyo/lib/statutory-rows.js'));
const rows = SR.buildStatutoryRows(L);

async function tataku(u) {
  try {
    const r = await fetch(u, { headers: { 'User-Agent': 'rakunally-shutten-check' }, redirect: 'follow' });
    return r.status;
  } catch (e) { return 0; }
}

console.log('\n[check-shutten-mukai] lib が 持つ 出典を 実際に 開く（' + rows.length + '本）');
const kekka = [];
for (const r of rows) {
  const code = await tataku(r.source_url);
  kekka.push({ kind: r.kind, year: r.year, url: r.source_url, code });
  console.log('  ' + (ikiteru(code) ? '✓' : '✗') + ' ' + (r.kind + ':' + r.year).padEnd(24)
    + String(code || 'つながらない').padStart(4) + '  ' + String(r.source_url).slice(0, 78));
}
const m = kazoeru(kekka);
console.log('\n── 実測 ──');
console.log('  生きている: ' + (m.zen - m.shinda.length) + ' / 死んでいる: ' + m.shinda.length + '（全 ' + m.zen + '本）');
if (m.zen === 0) console.log('  ★出典を 1本も 見ていない＝空振り。緑に しない★');
for (const s of m.shinda) console.log('  ★死んでいる★ ' + s.kind + ':' + s.year + '  ' + s.code + '  ' + s.url);
process.exit(m.akai ? 3 : 0);
