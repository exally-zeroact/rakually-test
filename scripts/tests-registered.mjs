/* ★試験は ci.yml に登録するまで 1本も走らない★（2026-08-21 実物で踏んだ）
   kyuyo/tests/rakually-login.test.mjs は ci.yml に1行も無く、走らせたら ★2件 赤★ だった。
   ＝「CI緑」は「試験が全部 走った」ではない。ここで ★在る試験と 走る試験を突き合わせる★。

   もう1つ：★return の直後に改行★ は ASI が ; を入れて ★undefined を返す★。
   構文は正しいので lint も試験も気づかない（同じ日に踏んだ）。ここで一緒に見る。

   使い方: node scripts/tests-registered.mjs [--self-test] */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const CI = path.join(ROOT, '.github/workflows/ci.yml');

/* 試験が置いてある場所（ここに足したら ★この行にも足す★） */
const DIRS = ['kyuyo/tests', 'seikyu/tests', 'tests'];

/* 走らせない物は ★理由と 戻す条件★ を書く（黙って外さない） */
const SKIP = {
  /* 本物の倉庫(DB-test)へ つなぎに行く物＝CI には 鍵も網も無いので必ず落ちる。
     ★黙って外さない★ので ここに 理由と 戻す条件を書く。 */
  'seikyu/tests/live-seikyu.mjs': { why: 'DB-test へ実接続する（鍵が要る）', back: 'CI に DB-test の鍵を置いた日' },
  'tests/live-roundtrip.mjs':     { why: 'DB-test へ実接続する（鍵が要る）', back: '同上' },
  'tests/live-seed.mjs':          { why: '試験ではなく ★種を撒く道具★（手で走らせる）', back: '入れる物を確かめる試験に作り替えた日' },
  'tests/dbtest-seed.mjs':        { why: '試験ではなく ★種を撒く道具★（手で走らせる）', back: '同上' },
  'tests/repo-supa.mjs':          { why: '試験ではなく ★倉庫の中を見る道具★（手で走らせる）', back: '同上' },
};

function listTests(root) {
  const out = [];
  for (const d of DIRS) {
    const abs = path.join(root, d);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs)) {
      if (!f.endsWith('.mjs')) continue;
      if (f.startsWith('_')) continue;          /* _ で始まる物は 部品（本体ではない） */
      out.push(d + '/' + f);
    }
  }
  return out.sort();
}

function scanASI(root) {
  /* return の次の行が + や . や ? で始まる ＝ ★undefined を返している★ */
  const bad = [];
  const walk = (d) => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) {
        if (/node_modules|\.git|vendor/.test(f.name)) continue;
        walk(p); continue;
      }
      if (!/\.(js|mjs)$/.test(f.name)) continue;
      const lines = fs.readFileSync(p, 'utf8').split('\n');
      for (let i = 0; i < lines.length - 1; i++) {
        if (!/\breturn\s*$/.test(lines[i])) continue;
        const nx = (lines[i + 1] || '').trim();
        if (/^[+\-*/.?]/.test(nx) && !/^\/\//.test(nx) && !/^\/\*/.test(nx)) {
          bad.push(path.relative(root, p).split(String.fromCharCode(92)).join('/') + ':' + (i + 1) + '  return の次が「' + nx.slice(0, 40) + '」');
        }
      }
    }
  };
  walk(root);
  return bad;
}

/* ★ci.yml だけ見ると 嘘をつく★（2026-08-21 実際に嘘をついた）
   tests/run.js が 中で 4本を走らせているのに「走っていない」と言った。
   ⇒ ★走らせている物を 全部 集めてから 突き合わせる★ */
function registered(root) {
  const txt = [];
  const ci = path.join(root, '.github/workflows/ci.yml');
  if (fs.existsSync(ci)) txt.push(fs.readFileSync(ci, 'utf8'));
  /* ci.yml から呼ばれる「まとめて走らせる子」も中を読む */
  for (const r of ['tests/run.js', 'tests/run.mjs']) {
    const p = path.join(root, r);
    if (fs.existsSync(p) && txt.join('').indexOf(r) >= 0) txt.push(fs.readFileSync(p, 'utf8'));
  }
  return txt.join(String.fromCharCode(10));
}

function run(root, label) {
  const ci = registered(root);
  const tests = listTests(root);
  /* run.js は 'hub-ui.mjs' のように 束ねる子からの相対で書く＝末尾のファイル名でも見る */
  const missing = tests.filter((t) => {
    if (SKIP[t]) return false;
    if (ci.indexOf(t) >= 0) return false;
    /* run.js は 'hub-ui.mjs' のように 束ねる子からの相対で書く＝ファイル名だけでも見る */
    const base = t.split('/').pop();
    const Q = String.fromCharCode(39), D = String.fromCharCode(34);
    return ci.indexOf(Q + base + Q) < 0 && ci.indexOf(D + base + D) < 0 && ci.indexOf('/' + base) < 0;
  });
  const asi = scanASI(root);
  console.log('[' + label + '] 在る試験 ' + tests.length + '本 ／ ci.yml に無い ' + missing.length + '本 ／ return改行 ' + asi.length + '件');
  missing.forEach((t) => console.log('  ★走っていない試験★ ' + t));
  asi.forEach((t) => console.log('  ★undefined を返す return★ ' + t));
  return missing.length + asi.length;
}

if (process.argv.includes('--self-test')) {
  /* ★わざと壊して 赤になる事を確かめる★（見張りは 赤にならないと 見張りではない） */
  const tmp = fs.mkdtempSync(path.join(ROOT, '.tt-'));
  try {
    fs.mkdirSync(path.join(tmp, '.github/workflows'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'kyuyo/tests'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.github/workflows/ci.yml'), 'steps:\n  - run: node kyuyo/tests/a.mjs\n');
    fs.writeFileSync(path.join(tmp, 'kyuyo/tests/a.mjs'), 'export const x=1;\n');
    let n = run(tmp, '自己診断1: そろっている');
    if (n !== 0) { console.error('★自己診断 失敗★ そろっているのに赤になった'); process.exit(1); }

    fs.writeFileSync(path.join(tmp, 'kyuyo/tests/b.mjs'), 'export const y=2;\n');
    n = run(tmp, '自己診断2: 登録していない試験を足した');
    if (n !== 1) { console.error('★自己診断 失敗★ 走っていない試験を見つけられない'); process.exit(1); }

    fs.writeFileSync(path.join(tmp, 'kyuyo/tests/b.mjs'), 'export const y=2;\n');
    fs.writeFileSync(path.join(tmp, '.github/workflows/ci.yml'), 'steps:\n  - run: node kyuyo/tests/a.mjs\n  - run: node kyuyo/tests/b.mjs\n');
    fs.writeFileSync(path.join(tmp, 'kyuyo/tests/a.mjs'), 'function f(){ return \n  + "x"; }\nexport default f;\n');
    n = run(tmp, '自己診断3: return の次の行を + にした');
    if (n !== 1) { console.error('★自己診断 失敗★ undefined を返す return を見つけられない'); process.exit(1); }
    console.log('\n自己診断 3件 とも 正しく赤になった');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  process.exit(0);
}

const bad = run(ROOT, 'tests-registered');
if (bad) { console.error('\n★' + bad + '件★ 直すまで進めない'); process.exit(1); }
console.log('OK');
