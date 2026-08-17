/* statutory-freshness.test.mjs — ★lib が持つ法定値が、中央 statutory とズレていないこと★
 *
 * 立て付け（2026-08-03に組み替え）:
 *   ・出典(source_url)・確認日(verified_at)・指紋(fingerprint) は【中央が唯一の正】。
 *     lib 側は scripts/pull-statutory.mjs が中央から作った lib/statutory-central.generated.js。
 *     ★人が直すのは中央だけ。lib にも手書きすると2箇所に手書きが残り、どちらを触っても片方が腐る。
 *   ・ここでは【lib が持つ値】から指紋を作り直し、中央由来の指紋と突き合わせる。
 *     違えば「値が中央とズレている」＝★赤★。
 *     （率を変えた人が中央を直していない／中央を直したのに lib を作り直していない、の両方を拾う）
 *
 * ★ネットワークは使わない。中央の写し(generated)と lib を突き合わせるだけ＝CIで安定して回る。
 *   生きた中央との突き合わせは scripts/verify-statutory.mjs と scripts/pull-statutory.mjs --check が担当。
 *
 * 使い方: node tests/statutory-freshness.test.mjs
 *         node tests/statutory-freshness.test.mjs --self-test   ← わざとズラして赤になるか
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(path.join(ROOT, 'package.json'));

const SR = require_(path.join(ROOT, 'lib/statutory-rows.js'));
const SM = require_(path.join(ROOT, 'lib/statutory-meta.js'));
const libs = {
  SHH: require_(path.join(ROOT, 'lib/shakaihoken-hyo.js')),
  SAI: require_(path.join(ROOT, 'lib/saitei-chingin.js')),
  KOYO: require_(path.join(ROOT, 'lib/koyo-hoken.js')),
  D: require_(path.join(ROOT, 'lib/shotokuzei-densan.js')),
  H: require_(path.join(ROOT, 'lib/shotokuzei-hei.js')),
  NI: require_(path.join(ROOT, 'lib/shotokuzei-nichi.js')),
  SZ: require_(path.join(ROOT, 'lib/shoyo-zei.js')),
  N: require_(path.join(ROOT, 'lib/nenmatsu.js')),
  WM: require_(path.join(ROOT, 'lib/warimashi.js')),
  SHZ: require_(path.join(ROOT, 'lib/shouhizei-ritsu.js')),
};

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };

/* ★純関数: lib由来の行と、中央由来のメタを突き合わせる。self-testで作り物を通せる。 */
export function checkAgainstCentral(rows, getMeta) {
  const bad = [];
  for (const r of rows) {
    const key = r.kind + ':' + r.year;
    const m = getMeta(r.kind, r.year);
    if (!m) { bad.push({ key, why: '中央にこの行が無い（中央へ入れるか、libから消す）', now: SM.fingerprintOf(r.data) }); continue; }
    const now = SM.fingerprintOf(r.data);
    if (m.fingerprint !== now) bad.push({ key, why: '値が中央とズレている', central: m.fingerprint, lib: now, verified_at: m.verified_at });
  }
  return bad;
}

const rows = SR.buildStatutoryRows(libs);

/* ══ self-test ═══════════════════════════════════════════════════════ */
if (process.argv.includes('--self-test')) {
  console.log('\n[statutory-freshness --self-test] わざとズラして赤になるか');

  T('今の実物はズレていない（前提）', () => {
    const bad = checkAgainstCentral(rows, SM.get);
    if (bad.length) throw new Error('前提が崩れています: ' + JSON.stringify(bad));
  });

  T('★lib の率を1つ変えたら赤（雇用保険 一般 0.005 → 0.006）', () => {
    const keep = libs.KOYO.RATES[2026].ippan;
    try {
      libs.KOYO.RATES[2026].ippan = 0.006;
      const bad = checkAgainstCentral(SR.buildStatutoryRows(libs), SM.get);
      if (!bad.filter(b => b.key === 'koyo:2026').length) throw new Error('赤になっていない');
    } finally { libs.KOYO.RATES[2026].ippan = keep; }
  });

  T('★健保を1県だけ変えても赤（東京 9.85% → 9.86%）', () => {
    const keep = libs.SHH.KENKO_2026.tokyo;
    try {
      libs.SHH.KENKO_2026.tokyo = 0.0986;
      const bad = checkAgainstCentral(SR.buildStatutoryRows(libs), SM.get);
      if (!bad.filter(b => b.key === 'shakaihoken:2026').length) throw new Error('赤になっていない');
    } finally { libs.SHH.KENKO_2026.tokyo = keep; }
  });

  T('★最賃を1県だけ変えても赤', () => {
    const keep = libs.SAI.todofuken.tokyo.chingin;
    try {
      libs.SAI.todofuken.tokyo.chingin = 1227;
      const bad = checkAgainstCentral(SR.buildStatutoryRows(libs), SM.get);
      if (!bad.filter(b => b.key === 'saitei_chingin:2025').length) throw new Error('赤になっていない');
    } finally { libs.SAI.todofuken.tokyo.chingin = keep; }
  });

  T('★★発効日を1県だけ変えても赤（判定に直結する）', () => {
    const keep = libs.SAI.todofuken.akita.hatsuko;
    try {
      libs.SAI.todofuken.akita.hatsuko = '2025-10-01';
      const bad = checkAgainstCentral(SR.buildStatutoryRows(libs), SM.get);
      if (!bad.filter(b => b.key === 'saitei_chingin:2025').length) throw new Error('★発効日のズレを拾えていない');
    } finally { libs.SAI.todofuken.akita.hatsuko = keep; }
  });

  T('★前年額を1県だけ変えても赤（発効前の判定に効く）', () => {
    const keep = libs.SAI.todofuken.gunma.prev;
    try {
      libs.SAI.todofuken.gunma.prev = 900;
      const bad = checkAgainstCentral(SR.buildStatutoryRows(libs), SM.get);
      if (!bad.filter(b => b.key === 'saitei_chingin:2025').length) throw new Error('前年額のズレを拾えていない');
    } finally { libs.SAI.todofuken.gunma.prev = keep; }
  });

  T('中央にその行が無ければ赤（libだけ増やしても通さない）', () => {
    const bad = checkAgainstCentral([{ kind: 'nazo', year: 2099, data: { a: 1 } }], SM.get);
    if (bad.length !== 1) throw new Error('赤になっていない');
  });

  T('元に戻したら緑に戻る（テストが状態を壊していない）', () => {
    const bad = checkAgainstCentral(SR.buildStatutoryRows(libs), SM.get);
    if (bad.length) throw new Error('戻っていません: ' + JSON.stringify(bad));
  });

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

/* ══ 本番 ═══════════════════════════════════════════════════════════ */
console.log('\n[statutory-freshness] lib の法定値が中央 statutory とズレていないか');

T('★lib の値が中央とズレていない（指紋一致）', () => {
  const bad = checkAgainstCentral(rows, SM.get);
  if (bad.length) {
    throw new Error('中央と合いません:\n'
      + bad.map(b => '   - ' + b.key + '  ' + b.why + (b.central ? '  中央=' + b.central + ' lib=' + b.lib : '')
        + (b.verified_at ? '  中央の確認日=' + b.verified_at : '')).join('\n')
      + '\n   → ★人が直すのは中央だけ。中央を直したら node scripts/pull-statutory.mjs --write で lib を作り直す。'
      + '\n     lib を手で直すと、中央と2箇所に手書きが残って必ず腐ります。');
  }
});

T('★出典URLと確認日が全行に入っている（中央から来ている）', () => {
  const ng = [];
  for (const k of SM.keys()) {
    const p = k.split(':'); const m = SM.get(p[0], +p[1]);
    if (!m.source_url) ng.push(k + ': 出典URLが空');
    if (!m.verified_at) ng.push(k + ': 確認日が空');
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(m.verified_at)) ng.push(k + ': 確認日の形が YYYY-MM-DD でない (' + m.verified_at + ')');
  }
  if (ng.length) throw new Error('中央の行に足りない物があります:\n' + ng.map(x => '   - ' + x).join('\n'));
});

T('中央の行と lib の行が1対1（増えても減っても気づける）', () => {
  const rowKeys = rows.map(r => r.kind + ':' + r.year).sort();
  const metaKeys = SM.keys();
  const missing = rowKeys.filter(k => metaKeys.indexOf(k) < 0);
  const extra = metaKeys.filter(k => rowKeys.indexOf(k) < 0);
  if (missing.length || extra.length) {
    throw new Error('不整合: libにあって中央に無い=' + (missing.join(', ') || 'なし') + ' / 中央にあってlibに無い=' + (extra.join(', ') || 'なし'));
  }
});

T('検査が空振りしていない（行を実際に作れている）', () => {
  if (rows.length < 10) throw new Error('行が少なすぎます: ' + rows.length);
  if (!SM.keys().length) throw new Error('中央の写しが空です（scripts/pull-statutory.mjs を走らせてください）');
});

console.log('\n── 実測 ──');
console.log('  法定の行: ' + rows.length + '件（中央の写しと1対1・指紋一致）');
SM.keys().forEach(k => {
  const p = k.split(':'); const m = SM.get(p[0], +p[1]);
  console.log('   ' + k.padEnd(24) + ' ' + m.verified_at + '  ' + String(m.source_url).slice(0, 62));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
