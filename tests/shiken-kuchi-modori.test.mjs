/* shiken-kuchi-modori.test.mjs — ★試験の口の 合言葉の 字が repo の 追跡物に 戻っていないか★（2026-10-11・決め2 の 戻り止め）
 *
 * ★なぜ★ 合言葉は repo の 外（CI＝secret SHIKEN_KUCHI_PASS・手元＝~/.shiken-kuchi.json）に 出した。
 *   公開 repo なので、誰かが 試験を 書く時に 字を 直に 書き戻すと また 誰でも 読める。
 * ★何を 見るか★ git ls-files の 全部の 物の 中身（バイトで 探す＝utf8。utf16le でも 探す）。
 * ★出しに 合言葉の 字は 書かない★（当たった ファイルの 名と 数だけ）。
 * ★値が 無ければ 赤★（secret の 置き忘れを 緑に しない）。手元は 置き場の kyoyu・b・senyou の 合言葉も 全部 見る。
 *
 * 使い方: node tests/shiken-kuchi-modori.test.mjs              … 本番の 見張り
 *         node tests/shiken-kuchi-modori.test.mjs --self-test  … わざと 字を 置いた 仮の repo で 赤に なるか
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/* 見る 値の 一覧（字は 外へ 出さない） */
export function atai({ env = process.env, okiba = path.join(os.homedir(), '.shiken-kuchi.json') } = {}) {
  const s = new Set();
  if (env.SHIKEN_KUCHI_PASS) s.add(env.SHIKEN_KUCHI_PASS);
  try {
    const j = JSON.parse(fs.readFileSync(okiba, 'utf8'));
    for (const v of Object.values((j && j.kuchi) || {})) if (v && typeof v.pass === 'string' && v.pass) s.add(v.pass);
  } catch { /* 置き場が 無い 機械（CI）は 環境変数だけ */ }
  return [...s];
}

/* root の 追跡物で 値が 在る 所＝[{ f, n }] */
export function sagasu(root, vals) {
  const out = execFileSync('git', ['-C', root, 'ls-files', '-z'], { maxBuffer: 1 << 28 });
  const files = out.toString('utf8').split('\0').filter(Boolean);
  const hari = vals.flatMap((v) => [Buffer.from(v, 'utf8'), Buffer.from(v, 'utf16le')]);
  const ataru = [];
  let mita = 0;
  for (const f of files) {
    let b;
    try { b = fs.readFileSync(path.join(root, f)); } catch { continue; }
    mita++;
    let n = 0;
    for (const h of hari) { let i = -1; while ((i = b.indexOf(h, i + 1)) >= 0) n++; }
    if (n) ataru.push({ f, n });
  }
  return { ataru, mita, zen: files.length };
}

if (process.argv.includes('--self-test')) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kuchi-modori-'));
  const g = (...a) => execFileSync('git', ['-C', tmp, ...a], { stdio: 'pipe' });
  g('init', '-q');
  const DUMMY = 'Dummy-Kuchi-' + process.pid;
  fs.writeFileSync(path.join(tmp, 'a.mjs'), "const PW = '" + DUMMY + "';\n");
  fs.writeFileSync(path.join(tmp, 'b.txt'), Buffer.from('x ' + DUMMY + ' y', 'utf16le'));
  fs.writeFileSync(path.join(tmp, 'c.mjs'), 'const PW = kuchi(\'kyoyu\').pass;\n');
  fs.writeFileSync(path.join(tmp, 'mi.txt'), DUMMY);   /* 追跡しない物は 見ない */
  g('add', 'a.mjs', 'b.txt', 'c.mjs');
  let ok = 0, ng = 0;
  const t = (nm, c) => { if (c) { ok++; console.log('  ok  ' + nm); } else { ng++; console.log('  ✗   ' + nm); } };
  const r = sagasu(tmp, [DUMMY]);
  t('① utf8 で 書き戻した 字を 見つける', r.ataru.some((x) => x.f === 'a.mjs'));
  t('② utf16le で 書き戻した 字を 見つける', r.ataru.some((x) => x.f === 'b.txt'));
  t('③ 部品 経由の 物は 当たらない', !r.ataru.some((x) => x.f === 'c.mjs'));
  t('④ 追跡していない 物は 見ない', !r.ataru.some((x) => x.f === 'mi.txt') && r.zen === 3);
  t('⑤ 値が 無ければ 一覧は 空（＝本番の 見張りは 赤）', atai({ env: {}, okiba: path.join(tmp, 'nai.json') }).length === 0);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('\n  [shiken-kuchi-modori --self-test] ok ' + ok + ' ／ ✗ ' + ng + ' ／ 全 ' + (ok + ng));
  console.log('自己確認: ' + ok + '/' + (ok + ng));
  process.exit(ng || ok !== 5 ? 1 : 0);
}

const vals = atai();
if (!vals.length) {
  console.log('✗ 見る 合言葉が 無い（secret SHIKEN_KUCHI_PASS が 空・~/.shiken-kuchi.json も 無い）＝測れない＝赤');
  process.exit(1);
}
const r = sagasu(ROOT, vals);
console.log('  見た 追跡物 ' + r.mita + '／' + r.zen + '本 ・ 見た 値 ' + vals.length + 'つ（字は 出さない）');
if (r.mita !== r.zen) { console.log('✗ 読めない 追跡物が ' + (r.zen - r.mita) + '本＝全部は 見ていない'); process.exit(1); }
if (r.ataru.length) {
  for (const x of r.ataru) console.log('  ✗ ' + x.f + ' … ' + x.n + '回');
  console.log('✗ 試験の口の 合言葉の 字が 追跡物 ' + r.ataru.length + '本に 在る＝tests/_shiken-kuchi.mjs の kuchi() 経由に する');
  process.exit(1);
}
console.log('✓ 試験の口の 合言葉の 字 0 件');
