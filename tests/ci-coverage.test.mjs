/* ci-coverage.test.mjs — ★CIから黙って外れているテストが無いか見張る★
 *
 * なぜ必要か: 2026-08-01 の統合で、対象機能がこのツリーに無いテストを1本だけCIから外した。
 *   CIから外れたテストは、放っておけば誰も気づかないまま永久に死んだファイルになる。
 *   「外す」こと自体は時にあってよいが、【外れている物の一覧が明示され、戻す条件が書かれている】
 *   状態でなければならない。それを機械で強制する。
 *
 * 判定:
 *   テストらしきファイル（*.test.js / *.test.mjs / 既知のハーネス）は、次のいずれかであること
 *     ① .github/workflows/ci.yml が直接 node で回している
 *     ② tests/run.js または kyuyo/tests/run.js が回している
 *     ③ 下の EXCLUDED に「理由」と「戻す条件」つきで載っている
 *   どれにも当てはまらない物が1つでもあれば赤。
 *
 * 使い方: node tests/ci-coverage.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// ★CIから外しているテスト（ここに載っていない除外は赤になる）
const EXCLUDED = {
  'kyuyo/tests/exally-login.test.mjs': {
    reason: 'item C（メール確認ON前提のsignup分岐）は payslip-app のテスト線のみの機能。'
      + '本番の js/exally-login.js には意図的に未展開で、統合時に本番のログイン挙動を変えないため'
      + '共通部品は本番版を据え置いた。よって対象機能がこのツリーに存在しない。',
    restoreWhen: 'item C を本番へ展開する時＝SMTP（確認メール送信）を設定してメール確認をONにする時。'
      + 'その時に js/exally-login.js を item C 版へ差し替え、このテストをCIへ戻す。',
    owner: '司さん（SMTP設定）＋ 実装セッション',
  },
};

// テストではない道具（実行されなくてよい物）。ここも理由つきで明示する。
const NOT_TESTS = {
  'tests/run.js': 'ランナー本体',
  'kyuyo/tests/run.js': 'ランナー本体',
  'tests/fake-supa.js': 'テスト用のSupabaseモック（他テストが読む部品）',
  'tests/repo-supa.mjs': 'このリポジトリの接続先(js/supa-config.js)を返す部品。実DBに触る道具が読む（テストではない）',
  'tests/dbtest-seed.mjs': 'DB-testに種データを入れる手動ツール（CIから叩かない）',
  'tests/live-seed.mjs': '実DBに種を入れる手動ツール（CIから叩かない）',
  'tests/live-roundtrip.mjs': '実DBに触る手動確認ツール（CIから叩かない）',
  'tests/xlsx-harness/build-libre-input.mjs': 'LibreOffice入力を作る手動ツール',
  'tests/xlsx-harness/collect-libre.mjs': 'LibreOfficeの結果を集める手動ツール',
  'tests/xlsx-harness/run-exally.mjs': 'ハーネスの実行部品（compare.mjs から使う）',
  'seikyu/tests/live-seikyu.mjs': '請求書の棚へ本物のログインで往復する手動確認ツール（鍵が要る・CIから叩かない）',
};

let pass = 0, fail = 0;
function T(n, fn) { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } }

function listTestFiles() {
  const out = [];
  const walk = (rel) => {
    const dir = path.join(ROOT, rel);
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) { walk(path.posix.join(rel, f)); continue; }
      if (/\.(m?js)$/.test(f)) out.push(path.posix.join(rel, f));
    }
  };
  walk('tests');
  walk('kyuyo/tests');
  // ★2026-08-10 追加。足すまで seikyu/tests は【この見張りの視界の外】にあり、
  //   「宙に浮いているテスト 0本」と出ながら請求書のテストを1本も数えていなかった。
  //   ＝テストを足してもCIに載らず、誰も気づけない状態だった（指示役が発見）。
  walk('seikyu/tests');
  return out.sort();
}

const ci = fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8');
const ciRuns = new Set((ci.match(/node\s+([A-Za-z0-9/._-]+)/g) || []).map(s => s.replace(/^node\s+/, '')));

function runnerList(runnerRel) {
  const p = path.join(ROOT, runnerRel);
  if (!fs.existsSync(p)) return [];
  const src = fs.readFileSync(p, 'utf8');
  const base = path.posix.dirname(runnerRel);
  return (src.match(/'\.?\/?[A-Za-z0-9/._-]+\.(?:test\.)?m?js'/g) || [])
    .map(s => s.replace(/'/g, '').replace(/^\.\//, ''))
    .map(f => path.posix.join(base, f));
}
const viaRunner = new Set([...runnerList('tests/run.js'), ...runnerList('kyuyo/tests/run.js')]);

console.log('\n[ci-coverage] CIから黙って外れているテストが無いか');

const files = listTestFiles();
const covered = [], excluded = [], orphan = [];
for (const f of files) {
  if (NOT_TESTS[f]) continue;
  if (ciRuns.has(f) || viaRunner.has(f)) covered.push(f);
  else if (EXCLUDED[f]) excluded.push(f);
  else orphan.push(f);
}

T('★CIからも各ランナーからも呼ばれていないテストが無い（除外リストに載っていない物）', function () {
  if (orphan.length) throw new Error('宙に浮いているテスト:\n   - ' + orphan.join('\n   - '));
});
T('★除外リストの各項目に「理由」と「戻す条件」が書かれている', function () {
  for (const [f, e] of Object.entries(EXCLUDED)) {
    if (!e.reason || e.reason.length < 20) throw new Error(f + ': reason が不十分');
    if (!e.restoreWhen || e.restoreWhen.length < 10) throw new Error(f + ': restoreWhen（戻す条件）が無い');
    if (!fs.existsSync(path.join(ROOT, f))) throw new Error(f + ': 除外リストにあるがファイルが無い（消したなら除外リストからも消す）');
  }
});
T('★除外は1本だけ（増えていたら、ここが赤になって気づける）', function () {
  const n = Object.keys(EXCLUDED).length;
  if (n !== 1) throw new Error(`除外が ${n} 本あります。増やすなら、この本数もここで更新して意図を示すこと: ` + Object.keys(EXCLUDED).join(', '));
});
T('検査が空振りしていない（テストファイルを実際に数えている）', function () {
  if (covered.length < 50) throw new Error('CIが回しているテストが少なすぎます: ' + covered.length);
});

console.log(`\n── 実測 ──`);
console.log(`  テストファイル: ${files.length}本（うち道具 ${Object.keys(NOT_TESTS).length}本は対象外）`);
console.log(`  CI/ランナーが回している: ${covered.length}本`);
console.log(`  明示的にCIから外している: ${excluded.length}本`);
excluded.forEach(f => {
  console.log(`   - ${f}`);
  console.log(`     理由    : ${EXCLUDED[f].reason}`);
  console.log(`     戻す条件: ${EXCLUDED[f].restoreWhen}`);
});
console.log(`  宙に浮いている: ${orphan.length}本` + (orphan.length ? '\n   - ' + orphan.join('\n   - ') : ''));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
