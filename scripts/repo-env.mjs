/* repo-env.mjs — ★この repo は テスト線か 本番か★ を1か所で答える道具
 * =============================================================================
 * なぜ要るか（2026-08-26 請求書を本番へ出した日）:
 *   同じ見張りを ★テスト線(rakually-test)と 本番(rakually)の両方★ で走らせる事にした。
 *   見張りの中で「どちらか」を判定する所が増えると、★同じ読み方を何本もコピーする★事になり、
 *   1本だけ直し忘れて ★本番で判定が逆になる★（帯を出す・タイルを出す）。だから1か所に置く。
 *
 * ★覚書の中の env は 数えない★
 *   js/supa-config.js には「★本番の supa-config.js は env:'prod'★」という★説明の行★が在る。
 *   素朴に /env:\s*'(\w+)'/ で拾うと ★テスト線なのに prod と読む★（実際に1回 踏んだ）。
 *   ⇒ ★window.SUPA の中身だけ★ を見る。
 *
 * 使い方:
 *   import { repoEnv } from '../scripts/repo-env.mjs';
 *   const env = repoEnv(ROOT);      // 'test' | 'prod' | ''（読めない）
 *   node scripts/repo-env.mjs            … この repo の名札を出す
 *   node scripts/repo-env.mjs --self-test … わざと紛らわしい物を食わせて 読み違えないか
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* ★中身(window.SUPA = { ... })だけを見る★＝覚書に書いた env は拾わない */
export function envOf(src) {
  const s = String(src == null ? '' : src);
  const i = s.indexOf('window.SUPA');
  if (i < 0) return '';
  const body = s.slice(i, s.indexOf('}', i) < 0 ? s.length : s.indexOf('}', i));
  const m = body.match(/env\s*:\s*'([a-z]+)'/);
  return m ? m[1] : '';
}

export function repoEnv(root) {
  const p = path.join(root, 'js/supa-config.js');
  if (!fs.existsSync(p)) return '';
  return envOf(fs.readFileSync(p, 'utf8'));
}

/* ★'test' でも 'prod' でもない時は 黙って通さない★ */
export function assertEnv(env) {
  if (env !== 'test' && env !== 'prod') {
    throw new Error("js/supa-config.js の env が 'test' でも 'prod' でもない: " + JSON.stringify(env));
  }
  return env;
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

if (process.argv.includes('--self-test')) {
  console.log('\n[repo-env --self-test] 紛らわしい物を食わせて 読み違えないか');
  let p = 0, f = 0;
  const S = (want, got, why) => {
    if (want === got) { p++; console.log('  ✓ ' + why); }
    else { f++; console.log('  ✗ ' + why + '（欲しい ' + JSON.stringify(want) + ' / 出た ' + JSON.stringify(got) + '）'); }
  };
  const nl = String.fromCharCode(10);
  S('test', envOf("window.SUPA = {" + nl + "  env: 'test'" + nl + "};"), 'ふつうに読める(test)');
  S('prod', envOf("window.SUPA = {" + nl + "  env: 'prod'" + nl + "};"), 'ふつうに読める(prod)');
  /* ★本番で1回 踏んだ型★＝覚書に書いた env を拾って テスト線を prod と読む */
  S('test', envOf("/* 本番の supa-config.js は env:'prod' */" + nl
    + "window.SUPA = {" + nl + "  env: 'test'" + nl + "};"),
  '★覚書の中の env:\'prod\' に釣られない★');
  S('', envOf("/* env:'prod' と書いてあるだけ */"), '中身が無ければ 空を返す（勝手に決めない）');
  S('', envOf(''), '空なら 空');
  S('', envOf(null), 'null でも落ちない');
  let threw = 0;
  try { assertEnv(''); } catch { threw = 1; }
  S(1, threw, '★名札が無ければ 赤にする★');
  threw = 0;
  try { assertEnv('staging'); } catch { threw = 1; }
  S(1, threw, '★知らない名札は 赤にする★');
  S('test', assertEnv(repoEnv(ROOT) === 'prod' ? 'prod' : 'test') === 'prod' ? 'prod' : 'test',
    'この repo の名札が 読めている（' + repoEnv(ROOT) + '）');
  console.log('\n[self-test] ' + p + ' passed, ' + f + ' failed');
  process.exit(f ? 1 : 0);
}

if (process.argv[1] && process.argv[1].indexOf('repo-env.mjs') >= 0) {
  const e = repoEnv(ROOT);
  console.log('この repo の名札(env) = ' + JSON.stringify(e)
    + (e === 'prod' ? '  ★本番★' : e === 'test' ? '  ★テスト線★' : '  ★読めない★'));
  process.exit(e ? 0 : 1);
}
