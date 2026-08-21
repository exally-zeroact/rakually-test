/* ★試験は 登録するまで 1本も走らない★ ＋ ★return の直後の改行は undefined を返す★
 * ─────────────────────────────────────────────────────────────
 *  ★このファイル1本で どのrepoでも動きます★（repo名・パス・アプリ名を 決め打ちしていません）
 *    置き場所 … <repoの好きな所>/scripts/tests-registered.mjs（置いた所から上へ .git を探して根を決める）
 *    走らせ方 … node scripts/tests-registered.mjs
 *               node scripts/tests-registered.mjs --self-test   ← ★わざと壊して赤になるか★
 *               node scripts/tests-registered.mjs --list         ← 数えるだけ（赤にしない）
 *    CIへの載せ方 … 上の2行を そのまま2ステップに入れる（★--self-test も必ず載せる★）
 *
 *  なぜ要るか（★同じ型を3回 踏んだ★）
 *    ① アマかせ … 見張り7本のうち ★2本しか回っていなかった★（2026-08-17）
 *    ② 決まり  … 新しい tests/ は ★CI＋見張り2つの3か所に登録するまで 1本も走らない★
 *    ③ Rakually … 試験11本が ci.yml に1行も無く、★走らせたら2件 赤★（2026-08-21）
 *                  その2件は「登録の直後に袋小路にしない」＝★客が入れなくなる穴★だった。
 *    ＝★「CI緑」は「試験が全部 走った」ではない★。在る試験と 走る試験を 突き合わせる。
 *
 *  ★見張り自身が 嘘をついた事がある★（2026-08-21）
 *    ci.yml だけ読んで、tests/run.js が中で走らせている4本を「走っていない」と言った。
 *    ⇒ ★CIから呼ばれている「まとめて走らせる子」の中も読む★（下の registered()）。
 *
 *  ついでに見る物 … ★return の直後の改行★
 *    JS は ; を勝手に入れるので ★undefined を返す★。構文は正しいので lint も試験も気づかない。
 *      function f(){ return          ← ここで終わってしまう
 *        + '…'; }                    ← ここは 誰も通らない
 *    Rakually の直しの最中に 自分で1回 踏んだので、同じファイルで見る事にした。
 *
 *  走らせない試験の書き方（★黙って外さない★）
 *    repoの根に tests-no-ci.json を置く。★理由(why)と 戻す条件(back)が無い物は 赤★。
 *      { "tests/live-roundtrip.mjs": { "why": "本物の倉庫へつなぐ（鍵が要る）", "back": "CIに鍵を置いた日" } }
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* ── repoの根を 自分で見つける（パスを決め打ちしない） ────────── */
function findRoot(from) {
  let d = from;
  for (let i = 0; i < 12; i++) {
    if (fs.existsSync(path.join(d, '.git')) || fs.existsSync(path.join(d, '.github'))) return d;
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  return from;
}
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = findRoot(HERE);

/* ★★この見張りは 自分が置いてある場所の repo を測ります★★（2026-08-21 指示役が踏んだ）
   14個の repo で走らせたら ★14回とも 同じ数（110本／0本）★ が出た。
   ＝★どの repo から走らせても、黙って「自分の家」を測って 緑を返していた★。
   ⇒ ① ★測った所を いちばん上に1行 出す★（見れば すぐ気づける）
      ② ★走らせた場所が 測った根の外なら 赤★（コピーせずに 外から走らせる使い方を塞ぐ）
   ⇒ ★使い方は「測りたい repo の中へ このファイルを1本 置いて、その repo の中で走らせる」★ */
function isInside(root, cwd) {
  const norm = (p) => (process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p));
  const r = path.relative(norm(root), norm(cwd));
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r));
}
function whereLine(root) {
  return '測った所 … ' + path.resolve(root) + '（' + path.basename(path.resolve(root)) + '）';
}

const SKIP_FILE = 'tests-no-ci.json';
const SEP = String.fromCharCode(47);      /* /  */
const BS = String.fromCharCode(92);       /* 円記号（Windowsの区切り） */
const Q = String.fromCharCode(39);        /* '  */
const D = String.fromCharCode(34);        /* "  */
const NL = String.fromCharCode(10);

const rel = (root, p) => path.relative(root, p).split(BS).join(SEP);

/* ── 何を「試験」と見るか ──────────────────────────
   ★どのrepoでも同じ★＝「tests」という名前の入れ物の中の .mjs / .test.js。
   _ で始まる物は 部品（本体ではない）ので数えない。 */
const SKIPDIR = /^(node_modules|vendor|dist|build|coverage|worktrees?)$/;

function findTestDirs(root) {
  const out = [];
  const walk = (d, depth) => {
    if (depth > 6) return;
    let ents;
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (!e.isDirectory()) continue;
      if (SKIPDIR.test(e.name) || e.name.startsWith('.')) continue;
      const p = path.join(d, e.name);
      if (e.name === 'tests' || e.name === 'test') out.push(p);
      else walk(p, depth + 1);
    }
  };
  walk(root, 0);
  return out;
}

function listTests(root) {
  const out = [];
  for (const dir of findTestDirs(root)) {
    for (const f of fs.readdirSync(dir)) {
      if (f.startsWith('_') || f.startsWith('.')) continue;
      if (!/\.mjs$/.test(f) && !/\.test\.js$/.test(f)) continue;
      out.push(rel(root, path.join(dir, f)));
    }
  }
  return out.sort();
}

/* ── 何を「走らせている」と見るか ────────────────────
   ★CIの本文だけ見ると 嘘をつく★（実際に嘘をついた）。
   CIの本文と、★CIの本文が名前を出している 手元の走らせ役★の中身も 合わせて読む。 */
function registered(root) {
  const parts = [];
  const wf = path.join(root, '.github', 'workflows');
  if (fs.existsSync(wf)) {
    for (const f of fs.readdirSync(wf)) {
      if (/\.ya?ml$/.test(f)) parts.push(fs.readFileSync(path.join(wf, f), 'utf8'));
    }
  }
  /* package.json の scripts も 走らせ役になり得る */
  const pkg = path.join(root, 'package.json');
  if (fs.existsSync(pkg)) parts.push(fs.readFileSync(pkg, 'utf8'));

  /* CIが名前を出している .js/.mjs は「まとめて走らせる子」かもしれない＝中も読む（1段だけ）。
     ★試験そのものは読まない★（試験の中の名前を「登録」と数えたら 嘘になる）。 */
  const head = parts.join(NL);
  const seen = new Set();
  for (const m of head.matchAll(/[\w./-]+\.(?:mjs|js)/g)) {
    const r = m[0];
    if (seen.has(r)) continue;
    seen.add(r);
    if (/(^|\/)tests?\//.test(r) && !/run\.(mjs|js)$/.test(r)) continue;
    const p = path.join(root, r);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      try { parts.push(fs.readFileSync(p, 'utf8')); } catch { /* 読めない物は足さない */ }
    }
  }
  return parts.join(NL);
}

function loadSkip(root) {
  const p = path.join(root, SKIP_FILE);
  if (!fs.existsSync(p)) return { map: {}, bad: [] };
  let j;
  try { j = JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { return { map: {}, bad: ['★' + SKIP_FILE + ' が読めない★ ' + e.message] }; }
  const bad = [];
  for (const k of Object.keys(j)) {
    const v = j[k] || {};
    if (!v.why || !v.back) bad.push('★' + SKIP_FILE + ' の「' + k + '」に 理由(why)か 戻す条件(back)が無い★（黙って外さない）');
  }
  return { map: j, bad };
}

/* ── return の直後の改行（; が入って undefined を返す） ────────── */
function scanASI(root) {
  const bad = [];
  const walk = (d, depth) => {
    if (depth > 8) return;
    let ents;
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (SKIPDIR.test(e.name) || e.name.startsWith('.')) continue;
        walk(p, depth + 1); continue;
      }
      if (!/\.(js|mjs|cjs)$/.test(e.name)) continue;
      let lines;
      try { lines = fs.readFileSync(p, 'utf8').split(NL); } catch { continue; }
      for (let i = 0; i < lines.length - 1; i++) {
        if (!/\breturn[ \t]*\r?$/.test(lines[i])) continue;
        const nx = (lines[i + 1] || '').trim();
        if (!nx || /^(\/\/|\/\*|\*)/.test(nx)) continue;
        if (/^[+\-*/.?]/.test(nx)) {
          bad.push(rel(root, p) + ':' + (i + 1) + '  return の次の行が「' + nx.slice(0, 40) + '」＝undefined を返している');
        }
      }
    }
  };
  walk(root, 0);
  return bad;
}

/* ── 数える ──────────────────────────────── */
function run(root, label) {
  const ci = registered(root);
  const tests = listTests(root);
  const { map: SKIP, bad: skipBad } = loadSkip(root);

  const missing = tests.filter((t) => {
    if (SKIP[t]) return false;
    if (ci.indexOf(t) >= 0) return false;
    /* 走らせ役は 'hub-ui.mjs' のように 自分からの相対で書く＝名前だけでも見る */
    const base = t.split(SEP).pop();
    return ci.indexOf(Q + base + Q) < 0 && ci.indexOf(D + base + D) < 0 && ci.indexOf(SEP + base) < 0;
  });
  /* 走らせないと書いたのに もう無い物 … 一覧が古い＝これも直す */
  const stale = Object.keys(SKIP).filter((k) => tests.indexOf(k) < 0);
  const asi = scanASI(root);

  console.log(whereLine(root));
  console.log('[' + label + '] 在る試験 ' + tests.length + '本'
    + ' ／ 走っていない ' + missing.length + '本'
    + ' ／ 走らせないと決めた ' + Object.keys(SKIP).length + '本'
    + ' ／ return の直後の改行 ' + asi.length + '件');
  missing.forEach((t) => console.log('  ★登録していない＝1本も走っていない★ ' + t));
  stale.forEach((t) => console.log('  ★' + SKIP_FILE + ' に在るのに 試験が無い★ ' + t));
  skipBad.forEach((t) => console.log('  ' + t));
  asi.forEach((t) => console.log('  ★undefined を返す return★ ' + t));
  return missing.length + stale.length + skipBad.length + asi.length;
}

/* ★走らせた場所が 測った根の外なら 赤★（--self-test でも同じ。黙って別の repo を測らせない） */
if (!isInside(ROOT, process.cwd())) {
  console.error(whereLine(ROOT));
  console.error('★走らせた場所 … ' + process.cwd());
  console.error('');
  console.error('★測った所と 走らせた場所が 違います★');
  console.error('　この見張りは ★自分が置いてある repo★ を測ります。外から走らせると');
  console.error('　黙って「置いてある方の repo」を測って 緑を返してしまいます（指示役が14repoで踏んだ）。');
  console.error('　⇒ ★測りたい repo の中へ このファイルを1本 置いて、その repo の中で走らせてください★');
  process.exit(1);
}

/* ── わざと壊して 赤になるか ───────────────────── */
if (process.argv.includes('--self-test')) {
  const tmp = fs.mkdtempSync(path.join(ROOT, '.tr-'));
  const W = (p, s) => { fs.mkdirSync(path.dirname(path.join(tmp, p)), { recursive: true }); fs.writeFileSync(path.join(tmp, p), s); };
  let ng = 0;
  const must = (want, got, why) => {
    if (want !== got) { console.error('  ★自己診断 失敗★ ' + why + '（欲しい ' + want + ' / 出た ' + got + '）'); ng++; }
    else console.log('  ✓ ' + why);
  };
  try {
    console.log('[自己診断]');
    W('.github/workflows/ci.yml', 'steps:' + NL + '  - run: node app/tests/a.mjs' + NL);
    W('app/tests/a.mjs', 'export const x=1;' + NL);
    must(0, run(tmp, '① そろっている'), 'そろっていれば緑');

    W('app/tests/b.mjs', 'export const y=2;' + NL);
    must(1, run(tmp, '② 登録していない試験を足した'), '登録していない試験を見つける');

    /* ★CIの本文だけ見ると嘘をつく★＝まとめて走らせる子の中も読めているか */
    W('.github/workflows/ci.yml', 'steps:' + NL + '  - run: node tests/run.js' + NL);
    W('tests/run.js', 'const FILES=[' + Q + '../app/tests/a.mjs' + Q + ',' + Q + '../app/tests/b.mjs' + Q + '];' + NL);
    must(0, run(tmp, '③ 走らせ役(run.js)の中も読む'), 'run.jsの中を読めば緑（前はここで嘘をついた）');

    /* 走らせない物は 理由と戻す条件が要る */
    W('app/tests/c.mjs', 'export const z=3;' + NL);
    W(SKIP_FILE, JSON.stringify({ 'app/tests/c.mjs': { why: '本物の倉庫へつなぐ' } }));
    must(1, run(tmp, '④ 理由だけで 戻す条件が無い'), '戻す条件が無ければ赤');
    W(SKIP_FILE, JSON.stringify({ 'app/tests/c.mjs': { why: '本物の倉庫へつなぐ', back: '鍵を置いた日' } }));
    must(0, run(tmp, '⑤ 理由と 戻す条件を書いた'), '両方書けば緑');
    W(SKIP_FILE, JSON.stringify({ 'app/tests/mou-nai.mjs': { why: 'x', back: 'y' } }));
    must(2, run(tmp, '⑥ 一覧が古い（試験がもう無い）'), '古い一覧も赤（c.mjs が走らなくなる＋古い1本）');
    fs.rmSync(path.join(tmp, SKIP_FILE));

    /* return の直後の改行 */
    W('.github/workflows/ci.yml', 'steps:' + NL + '  - run: node tests/run.js' + NL + '  - run: node app/tests/c.mjs' + NL);
    W('src/x.js', 'function f(){ return ' + NL + '  + "x"; }' + NL);
    must(1, run(tmp, '⑦ return の次の行が + '), 'undefined を返す return を見つける');
    W('src/x.js', 'function f(){ return ' + NL + '  // ただの覚書' + NL + '  1; }' + NL);
    must(0, run(tmp, '⑧ return の次が覚書なら 数えない'), '覚書で誤検知しない');

    /* ★測った所と 走らせた場所が 違ったら赤★（指示役が14repoで踏んだ穴） */
    console.log('[自己診断] ⑨⑩ 測った所と 走らせた場所');
    must(true, isInside(tmp, path.join(tmp, 'app', 'tests')), '★repoの中から走らせたら 通す');
    must(false, isInside(tmp, path.dirname(tmp)), '★repoの外から走らせたら 止める');
    must(true, isInside(tmp, tmp), '根そのものは 中');
    must(false, isInside(path.join(tmp, 'app'), tmp), '親から子を測ろうとしたら 止める');
    /* ★測った所を いちばん上に出しているか★（出ていなければ 指示役は気づけない） */
    must(true, /^測った所 … /.test(whereLine(tmp)), '★測った所を 1行目に出す');
    must(true, whereLine(tmp).indexOf(path.basename(tmp)) > 0, '★repo名も出す');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  if (ng) { console.error(NL + '★自己診断 ' + ng + '件 失敗★'); process.exit(1); }
  console.log(NL + '自己診断 14件 とも 正しい');
  process.exit(0);
}

const bad = run(ROOT, 'tests-registered');
if (process.argv.includes('--list')) process.exit(0);
if (bad) { console.error(NL + '★' + bad + '件★ 直すまで進めない（登録しないと 1本も走りません）'); process.exit(1); }
console.log('OK（在る試験は 全部 走っている）');
