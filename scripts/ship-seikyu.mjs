/* ship-seikyu.mjs — ★請求書を 本番の入れ物へ運ぶ★（手で写さない）
 * =============================================================================
 * なぜ道具にするか（指示役 2026-08-26 の手順5）:
 *   ★呼ばれる側も一緒に運ぶ★／★写す前と後で 同じ道具で数える★
 *   ＝手で写すと ★呼ぶ側だけ写して 本番が白画面★（sha一致・CI緑でも捕まらない）になる。
 *   ★運ぶ一覧を 決め打ちしない★＝`scripts/dep-count.mjs` に毎回 数えさせる
 *     （あとで呼ぶ物が増えても 勝手に付いてくる）。
 *
 * 何をするか
 *   ① dep-count で「請求書が要る物」を数える（中＋外）
 *   ② その全部＋★見張り一式★を 写す
 *   ③ ★入口だけ 作り替える★＝★給与のタイルを出さない★
 *      （請求書だけ出すので `kyuyo/` は無い。押した人を行き止まりにしない）
 *   ④ ★写した後 もう一度 数えて 前と後の数を出す★（合わなければ赤）
 *
 * 使い方:
 *   node scripts/ship-seikyu.mjs --to <運び先>        … 運ぶ
 *   node scripts/ship-seikyu.mjs --to <運び先> --dry  … 数えるだけ（1つも書かない）
 *   node scripts/ship-seikyu.mjs --self-test          … わざと壊して赤になるか
 *
 * ★本番の倉庫の値（js/supa-config.js）は ここでは書き換えません★
 *   ＝指示役が渡す物を 運び先で入れます（★記憶の値を打たない★）。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const ENTRY = 'seikyu/index.html';

/* ★見張りも一緒に運ぶ★＝無いと 本番だけ古くなる（payslip-app で40件が2週間 生きていた） */
const GUARDS = ['tests', 'scripts', '.github', 'package.json', 'tests-no-ci.json', 'vercel.json',
  '.gitattributes', '.gitignore', 'CLAUDE.md', 'sw.js'];

function count(root) {
  const out = execFileSync(process.execPath, ['scripts/dep-count.mjs', ENTRY, '--json'],
    { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  const j = JSON.parse(out);
  return { inside: j.inside || [], outside: j.outside || [], missing: j.missing || [] };
}

/* ★入口から 給与のタイルを外す★（請求書だけ出すので kyuyo/ は無い） */
export function hubWithoutKyuyo(html) {
  const i = html.indexOf('<a class="tile" id="tile-payslip"');
  if (i < 0) return { html: html, removed: 0 };
  const end = html.indexOf('</a>', i);
  if (end < 0) return { html: html, removed: 0 };
  const before = html.slice(0, i).replace(/\s+$/, '\n      ');
  return { html: before + html.slice(end + 4), removed: 1 };
}

function copyOne(rel, to) {
  const src = path.join(ROOT, rel);
  const dst = path.join(to, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}
function copyDir(rel, to) {
  const src = path.join(ROOT, rel);
  if (!fs.existsSync(src)) return 0;
  let n = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      const r = path.relative(ROOT, p).split(path.sep).join('/');
      copyOne(r, to); n++;
    }
  };
  if (fs.statSync(src).isDirectory()) walk(src); else { copyOne(rel, to); n = 1; }
  return n;
}

function ship(to, dry) {
  const before = count(ROOT);
  /* ★入口そのもの も運ぶ★＝dep-count が返すのは「入口が呼ぶ物」なので 入口は入っていない
     （2026-08-26 これで1回 転んだ＝運び先で「入口の HTML が無い」） */
  const need = [ENTRY].concat(before.inside, before.outside);
  console.log('★写す前★ 中 ' + before.inside.length + '本 ／ 外 ' + before.outside.length
    + '本 ＝ 合計 ' + need.length + '本');
  if (before.missing.length) {
    console.error('★見つからない参照が ' + before.missing.length + '件★ … ' + before.missing.join(' , '));
    return 1;
  }
  if (dry) { console.log('（--dry なので 1つも書いていません）'); return 0; }

  fs.mkdirSync(to, { recursive: true });
  need.forEach((r) => copyOne(r, to));
  let g = 0;
  GUARDS.forEach((r) => { g += copyDir(r, to); });

  /* ★入口だけ 作り替える★ */
  const hub = path.join(to, 'index.html');
  const r = hubWithoutKyuyo(fs.readFileSync(hub, 'utf8'));
  if (!r.removed) { console.error('★入口から 給与のタイルを外せませんでした（作りが変わった）★'); return 1; }
  fs.writeFileSync(hub, r.html, 'utf8');
  console.log('★入口を作り替えた★ … 給与のタイルを 1個 外した');

  const after = count(to);
  const need2 = [ENTRY].concat(after.inside, after.outside);
  console.log('★写した後★ 中 ' + after.inside.length + '本 ／ 外 ' + after.outside.length
    + '本 ＝ 合計 ' + need2.length + '本 ／ 見張りなど ' + g + '本');
  if (after.missing.length) {
    console.error('★運び先に 見つからない参照が ' + after.missing.length + '件★ … ' + after.missing.join(' , '));
    return 1;
  }
  if (need.length !== need2.length) {
    console.error('★前と後で 数が違います★ ' + need.length + ' → ' + need2.length);
    return 1;
  }
  console.log('\n★前と後で 同じ数（' + need.length + '本）／見つからない参照 0件★');
  console.log('★次にやる事★ … 運び先で js/supa-config.js を 指示役の値に入れ替える（私は書きません）');
  return 0;
}

if (process.argv.includes('--self-test')) {
  console.log('\n★自己診断★');
  let ng = 0;
  const must = (want, got, why) => {
    if (want !== got) { console.error('  ✗ ' + why + '（欲しい ' + want + ' / 出た ' + got + '）'); ng++; }
    else console.log('  ✓ ' + why);
  };
  const hub = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const r = hubWithoutKyuyo(hub);
  must(1, r.removed, '★入口から 給与のタイルを外せる★');
  must(false, /id="tile-payslip"/.test(r.html), '外したあと 給与のタイルが残っていない');
  must(true, /id="tile-seikyu"/.test(r.html), '★請求書のタイルは 残っている★');
  must(false, /href="kyuyo\/"/.test(r.html), '★kyuyo/ への行き先が 1つも残っていない★');
  /* ★作りが変わったら 気づけるか★（外せなかったら 0を返す＝運ぶのを止める） */
  must(0, hubWithoutKyuyo('<html><body>タイルなし</body></html>').removed,
    '★タイルが無い入口では 0を返す（黙って通さない）★');
  /* ★数える所が 本当に効くか★＝運んでみて 前と後が同じ数になる */
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-'));
  try {
    const code = ship(tmp, false);
    must(0, code, '★運んで 前と後が 同じ数になる★');
    must(true, fs.existsSync(path.join(tmp, 'kyuyo/lib/shouhizei-ritsu.js')),
      '★法定の2本（消費税）も 一緒に運ばれている★');
    must(true, fs.existsSync(path.join(tmp, 'kyuyo/lib/shiharai-chosho.js')),
      '★法定の2本（支払調書）も 一緒に運ばれている★');
    must(false, fs.existsSync(path.join(tmp, 'kyuyo/index.html')),
      '★給与の画面は 運んでいない★');
    must(true, fs.existsSync(path.join(tmp, '.github/workflows/ci.yml')),
      '★見張り（CI）も 一緒に運ばれている★');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  if (ng) { console.error('\n★自己診断 ' + ng + '件 失敗★'); process.exit(1); }
  console.log('\n自己診断 ぜんぶ 正しい');
  process.exit(0);
}

const toI = process.argv.indexOf('--to');
if (toI < 0) {
  console.error('使い方: node scripts/ship-seikyu.mjs --to <運び先> [--dry] ／ --self-test');
  process.exit(2);
}
process.exit(ship(path.resolve(process.argv[toI + 1]), process.argv.includes('--dry')));
