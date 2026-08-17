/* no-hardcoded-supa.test.mjs — ★倉庫(Supabase)の向き先を、決められた1ファイル以外に書かせない★
 *
 * なぜ必要か（2026-08-07・指示役の指摘で作った）:
 *   `tests/live-roundtrip.mjs` と `tests/live-seed.mjs` が接続先を【直書き】していた。
 *   本番リポジトリ(exally)から作ったスナップショットをテストリポジトリ(exally-staging)へ
 *   持ってくると、その直書きがそのまま付いてくる ＝ ★テストのつもりで本番倉庫を触る★。
 *   2026-08-01 に staging 側だけ直したが、★本番側が直っていないまま6日間残った★
 *   （check-parity が数えていた「差2件」の正体がこれ）。
 *
 *   ★片方だけ直すと必ずこうなる。だから機械で見張る。★
 *
 * ★このファイル自身に、本物のrefを1文字も書かない★
 *   書くと「配信物に本番のrefを混ぜるな」という別の見張り(pages-hosting D)と喧嘩して、
 *   例外表がどんどん太る。だから ★refはrepoから学ぶ★:
 *     URL(https://xxxx.supabase.co) と 鍵(JWT)の中の ref は 形だけで判別できる。
 *     そこで見つかったrefを「このrepoが知っている倉庫」とみなし、
 *     ★裸の文字列(PROD_REF = '…' の形)は そのrefだけを探す★。
 *   限界も書いておく: どこにもURL/鍵の形で出てこない未知のrefを、裸の文字列としてだけ
 *   書かれた場合は捕まえられない。URL・鍵の形なら未知のrefでも捕まえる。
 *
 * 判定:
 *   .js / .mjs / .html / .json / .yml の中に向き先が出てきたら、
 *   ★下の ALLOWED に理由つきで載っているファイル以外は赤★。
 *
 *   ALLOWED は「後から慌てて足す逃げ道」にしないため、
 *   ★最初に repo 全体を数えてから、1件ずつ理由を書いてある★（2026-08-07 実測）。
 *   新しく足す時は、理由が書けるかどうかで判断すること。理由が書けない物は直す側が正しい。
 *
 * 使い方: node tests/no-hardcoded-supa.test.mjs
 *         node tests/no-hardcoded-supa.test.mjs --self-test   ★わざと壊して赤になるか確かめる★
 */
import fs from 'node:fs';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ★向き先を持ってよいファイル（全部 理由つき）★ */
export const ALLOWED = {
  'js/supa-config.js':
    '★環境の分かれ目そのもの★。本番repo=本番倉庫 / stagingのrepo=DB-test。向き先を持つのはここだけ',
  'tests/dbtest-seed.mjs':
    'DB-testに固定した手動ツール。本番refは「そこに向いていたら即中止」の見張りとして持っている',
  'tests/pages-hosting.test.mjs':
    'わざと本番refを混ぜた作り物を通して、Pages配信の見張りが赤くなることを確かめる検査（staging専用）',
  'kyuyo/scripts/pull-statutory.mjs':
    '法定データ(最低賃金・保険料率)は★本番の中央倉庫が正★。テスト側から読んでも本番を見るのが設計',
  'kyuyo/scripts/verify-statutory.mjs': '同上（法定データは本番中央が正）',
  'kyuyo/scripts/check-source-urls.mjs': '同上（法定データは本番中央が正）',
  'scripts/seikyu-sql-guard.mjs':
    '★請求書の設計図を倉庫に当てる前の門番★。本番refは「そこへ向いていたら即中止」の拒否リストとして持つ（tests/dbtest-seed.mjs と同じ理由）。請求書の道具は全部ここから借りる＝出どころは1つ',
  'scripts/check-warehouse-pointers.mjs':
    '★6か所×全アプリの向き先を数える見張り★。本番とテストの両方のrefを「正解」として持たないと、何とも突き合わせられない',
};

/* 見るファイルの種類。docs/ の .md は配信されない設計書なので対象外。 */
const EXT = new Set(['.js', '.mjs', '.html', '.json', '.yml', '.yaml']);
const SKIP_DIR = new Set(['node_modules', '.git', '.vercel', 'playwright-report', 'test-results']);

/* ── 形だけで分かる向き先（URL・鍵）を拾う ─────────────────────── */
export function refsByShape(text) {
  const out = [];
  let m;
  const url = /https:\/\/([a-z0-9]{16,})\.supabase\.co/g;
  while ((m = url.exec(text))) out.push({ where: 'URL', ref: m[1] });
  const key = /"ref"\s*:\s*"([a-z0-9]{16,})"/g;
  while ((m = key.exec(text))) out.push({ where: '鍵', ref: m[1] });
  const jwt = /eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]{20,})\./g;
  while ((m = jwt.exec(text))) {
    try {
      const b = m[1].replace(/-/g, '+').replace(/_/g, '/');
      const o = JSON.parse(Buffer.from(b + '='.repeat((4 - (b.length % 4)) % 4), 'base64').toString('utf8'));
      if (o && typeof o.ref === 'string') out.push({ where: '鍵(JWT)', ref: o.ref });
    } catch (_) {
      /* 読めない物は無視 */
    }
  }
  return out;
}

/* ★repoが知っている倉庫のref＝どこかにURL/鍵の形で出てきた物★ */
export function knownRefs(files) {
  const s = new Set();
  for (const text of Object.values(files)) refsByShape(text).forEach((r) => s.add(r.ref));
  return [...s];
}

/* ── 純関数: ファイル名→中身 の一覧から、違反を出す（self-testで作り物を通せる）── */
export function findViolations(files, allowed = ALLOWED) {
  const known = knownRefs(files);
  const out = [];
  for (const [rel, text] of Object.entries(files)) {
    if (allowed[rel]) continue;
    const hits = refsByShape(text);
    // 裸の文字列（PROD_REF = '…' の形）は、このrepoが知っているrefだけ探す
    for (const ref of known) {
      const bare = new RegExp('\\b' + ref + '\\b', 'g');
      if (bare.test(text)) hits.push({ where: '裸の文字列', ref });
    }
    if (hits.length) out.push({ file: rel, refs: [...new Set(hits.map((h) => h.ref))], where: hits[0].where });
  }
  return out;
}

function collect() {
  const files = {};
  const walk = (rel) => {
    const dir = path.join(ROOT, rel);
    for (const f of fs.readdirSync(dir)) {
      if (SKIP_DIR.has(f)) continue;
      const p = path.join(dir, f);
      const r = rel ? path.posix.join(rel, f) : f;
      if (fs.statSync(p).isDirectory()) { walk(r); continue; }
      if (!EXT.has(path.extname(f))) continue;
      files[r] = fs.readFileSync(p, 'utf8');
    }
  };
  walk('');
  return files;
}

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };

if (process.argv.includes('--self-test')) {
  // ★作り物のref（本物は1文字も書かない）
  //   URLも【組み立てて】作る。ここに完成形を書くと、この見張り自身が自分に引っかかる
  //   （実際に引っかかった。それが正しい動作＝空振りしていない証拠でもある）。
  const FAKE = 'aaaabbbbccccddddeeee';
  const OTHER = 'zzzzyyyyxxxxwwwwvvvv';
  const supaUrl = (r) => 'https://' + r + '.supabase' + '.co';
  const CONF = { 'js/supa-config.js': "url:'" + supaUrl(FAKE) + "'" };
  console.log('\n[no-hardcoded-supa] ★わざと壊して赤になるか★');
  T('直書きを1つ混ぜたら赤になる（URLの形）', () => {
    const v = findViolations({ ...CONF, 'tests/live-seed.mjs': "const URL='" + supaUrl(FAKE) + "';" });
    if (v.length !== 1) throw new Error('捕まえられなかった: ' + JSON.stringify(v));
  });
  T('裸の文字列でも赤になる（PROD_REF = "…" の形）', () => {
    const v = findViolations({ ...CONF, 'tests/x.mjs': `const PROD_REF = '${FAKE}';` });
    if (v.length !== 1) throw new Error('捕まえられなかった: ' + JSON.stringify(v));
  });
  T('★repoが1つも知らないrefでも、URL/鍵の形なら赤になる（未知の倉庫）', () => {
    const v = findViolations({ 'tests/z.mjs': "const U='" + supaUrl(OTHER) + "';" });
    if (v.length !== 1) throw new Error('捕まえられなかった: ' + JSON.stringify(v));
  });
  T('鍵(JWT)の中に隠れていても赤になる', () => {
    const payload = Buffer.from(JSON.stringify({ iss: 'supabase', ref: FAKE, role: 'anon' })).toString('base64url');
    const v = findViolations({ 'tests/y.mjs': "const K='eyJhbGciOiJIUzI1NiJ9." + payload + ".sig';" });
    if (v.length !== 1) throw new Error('捕まえられなかった: ' + JSON.stringify(v));
  });
  T('★理由つきで許した物は赤にしない（誤検知が出ない）', () => {
    const v = findViolations(CONF);
    if (v.length !== 0) throw new Error('誤検知: ' + JSON.stringify(v));
  });
  T('向き先が1つも無いファイルは赤にしない', () => {
    const v = findViolations({ ...CONF, 'js/hub.js': 'function a(){return 1}' });
    if (v.length !== 0) throw new Error('誤検知: ' + JSON.stringify(v));
  });
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

console.log('\n[no-hardcoded-supa] 倉庫の向き先が、決められたファイル以外に書かれていないか');
const files = collect();
const violations = findViolations(files);

T('★向き先を直書きしているファイルが無い（許した物を除く）', () => {
  if (violations.length) {
    throw new Error(
      '直書きが見つかりました。接続先は js/supa-config.js だけが持つこと\n' +
        '   （実DBに触る道具は tests/repo-supa.mjs 経由にする）:\n' +
        violations.map((v) => `   - ${v.file}  [${v.where}]`).join('\n')
    );
  }
});
T('★許可リストの各行に理由が書いてある', () => {
  for (const [f, why] of Object.entries(ALLOWED)) {
    if (!why || why.length < 15) throw new Error(f + ': 理由が短すぎる');
  }
});
T('★許可リストが現実から離れていない（消えたファイルが残っていない）', () => {
  // pages-hosting のように片方のrepoにしか無い物があるので「5本以上が実在」で見る
  const alive = Object.keys(ALLOWED).filter((f) => fs.existsSync(path.join(ROOT, f)));
  if (alive.length < 5) throw new Error('実在するのは ' + alive.length + '本だけ: ' + alive.join(', '));
});
T('検査が空振りしていない（実際にファイルを読み、倉庫を1つ以上見つけている）', () => {
  if (Object.keys(files).length < 50) throw new Error('読めたファイルが少なすぎます: ' + Object.keys(files).length);
  if (!files['js/supa-config.js']) throw new Error('js/supa-config.js を読めていない＝見る場所が間違っている');
  if (knownRefs(files).length < 1) throw new Error('倉庫のrefを1つも見つけられていない＝拾い方が壊れている');
});

console.log(`\n── 実測 ──`);
console.log(`  見たファイル: ${Object.keys(files).length}本`);
console.log(`  このrepoが知っている倉庫: ${knownRefs(files).length}件`);
console.log(`  理由つきで許している: ${Object.keys(ALLOWED).filter((f) => fs.existsSync(path.join(ROOT, f))).length}本（このrepoに実在する物）`);
console.log(`  直書き: ${violations.length}本`);
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
