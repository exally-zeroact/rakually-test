/* rename-to-rakunally.mjs — ★製品名 Rakually → Rakunally（08-28 司さん決定）★
 *
 * なぜ 道具にするか（sed で一気に置換しない理由）:
 *   ・★替えてはいけない物が 混ざっている★（URL・repo名・司さんの言葉そのまま）。
 *     全部 替えると ★配信が止まる★（rakually-test.vercel.app が消える）。
 *   ・★何を替えて 何を残したか を 数で出す★ 為（後から数えられない置換はしない）。
 *
 * ★替えない物（理由つき）★ … 下の KEEP。10月の塊（URL切替・repo名）で 一緒に替える。
 * 使い方: node scripts/rename-to-rakunally.mjs --dry   （数えるだけ）
 *         node scripts/rename-to-rakunally.mjs         （実際に書く）
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');

/* ★替えない物★＝先に別の字へ逃がしてから 置換し、最後に戻す */
export const KEEP = [
  { pat: /rakually-test\.vercel\.app/g, why: '★テスト線のURL★（10月のURL切替で替える。今 替えると配信が消える）' },
  { pat: /rakually\.vercel\.app/g,      why: '★本番のURL★（同上）' },
  { pat: /exally-zeroact\/rakually/g,   why: '★GitHubのrepo名★（10月に替える）' },
  { pat: /rakually-test/g,              why: '★repo名（テスト線）★（10月に替える）' },
  { pat: /本番\(rakually\)/g,           why: '★repo名（本番）★（10月に替える）' },
  { pat: /本番（rakually）/g,           why: '★repo名（本番）★（10月に替える）' },
  { pat: /本番は rakually。/g,          why: '★repo名（本番）★（10月に替える）' },
  { pat: /rakually\.zeroact\.jp/g,      why: '★これから買うドメイン★（10月）' },
  { pat: /"name": "rakually"/g,         why: '★npmの物の名前＝repo名と揃える★（10月に替える）' },
  /* ★司さんの言葉そのまま★＝引用を書き換えると 記録が嘘になる（記憶の決まり） */
  { pat: /Rakually ?は別アプリなんはいつ理解するわけ？/g, why: '★司さん 2026-08-17 の言葉そのまま★（引用は書き換えない）' },
  { pat: /司さん 2026-08-17「Rakually は別アプリ」/g,     why: '★司さんの言葉そのまま★' },
  { pat: /「Rakually は別アプリ」/g,                      why: '★司さんの言葉そのまま★' },
  /* 端末に保存済みの鍵は そもそも rakually を含まないが、増えたら ここに足す */
];

/* ★替える物★（順番に効かせる） */
const SWAP = [
  [/Rakually/g, 'Rakunally'],
  [/RAKUALLY/g, 'RAKUNALLY'],
  [/rakually/g, 'rakunally'],
  [/ラクアリー/g, 'ラクナリー'],
];

const SENT = (i) => '\u0000KEEP' + i + '\u0000';

export function convert(src) {
  let s = src;
  const kept = [];
  KEEP.forEach((k, i) => {
    const n = (s.match(k.pat) || []).length;
    if (n) kept.push({ i, n, why: k.why });
    s = s.replace(k.pat, SENT(i));
  });
  let changed = 0;
  for (const [pat, to] of SWAP) { const n = (s.match(pat) || []).length; changed += n; s = s.replace(pat, to); }
  KEEP.forEach((k, i) => { s = s.split(SENT(i)).join(srcOf(src, k)); });
  return { out: s, changed, kept };
}
/* 逃がした物を「元の字」で戻す（KEEPの正規表現は 1通りの字にしか当たらない物だけ置いている） */
function srcOf(src, k) { const m = src.match(k.pat); return m ? m[0] : ''; }

/* ═══ 自己確認 ═══ */
if (process.argv.includes('--self-test')) {
  let pass = 0, fail = 0;
  const T = (n, f) => { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + e.message); } };
  const ok = (v, m) => { if (!v) throw new Error(m); };
  console.log('\n[rename --self-test]');
  T('★URLは替えない★', () => {
    const r = convert('https://rakually-test.vercel.app/ と Rakually');
    ok(r.out === 'https://rakually-test.vercel.app/ と Rakunally', r.out);
  });
  T('★本番URLも替えない★', () => {
    ok(convert('https://rakually.vercel.app/').out === 'https://rakually.vercel.app/');
  });
  T('★司さんの言葉は書き換えない★', () => {
    ok(convert('「Rakuallyは別アプリなんはいつ理解するわけ？」').out.includes('Rakuallyは別アプリ'));
  });
  T('★ファイル名は替える★', () => {
    ok(convert('js/rakually-login.js').out === 'js/rakunally-login.js');
  });
  T('★読みも替える★', () => {
    ok(convert('Rakually（ラクアリー）').out === 'Rakunally（ラクナリー）');
  });
  T('★識別子も替える★', () => {
    ok(convert('window.RakuallyLogin と __RAKUALLY_TEST').out === 'window.RakunallyLogin と __RAKUNALLY_TEST');
  });
  T('★逃がした物が 元の字で戻る（壊れない）★', () => {
    const src = 'a rakually-test b rakually.vercel.app c Rakually';
    ok(convert(src).out === 'a rakually-test b rakually.vercel.app c Rakunally', convert(src).out);
  });
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

/* ═══ 本番 ═══ */
const files = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' }).trim().split('\n')
  .filter((f) => !/\.(png|jpg|jpeg|ico|woff2?|xlsx|pdf)$/i.test(f));
let touched = 0, total = 0;
const keptAll = new Map();
for (const f of files) {
  const abs = path.join(ROOT, f);
  const src = fs.readFileSync(abs, 'utf8');
  if (!/Rakually|rakually|RAKUALLY|ラクアリー/.test(src)) continue;
  const { out, changed, kept } = convert(src);
  kept.forEach((k) => keptAll.set(k.why, (keptAll.get(k.why) || 0) + k.n));
  if (changed) { total += changed; touched++; if (!DRY) fs.writeFileSync(abs, out); console.log((DRY ? '  [dry] ' : '  ') + f + ' … ' + changed + '件'); }
}
console.log('\n★替えた★ ' + total + '件 / ' + touched + 'ファイル' + (DRY ? '（数えただけ）' : ''));
console.log('★替えなかった物（10月の塊・引用）★');
for (const [why, n] of keptAll) console.log('  ' + n + '件 … ' + why);
