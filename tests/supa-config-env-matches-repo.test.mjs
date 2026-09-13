/* supa-config-env-matches-repo.test.mjs
 * ★repo の 素性と js/supa-config.js の 名札が 食い違ったら 赤★
 * =============================================================================
 * ★なぜ 要るか（2026-09-13 実測。客に 見えていた）★
 *   2026-09-12 の 本番投入（25aaaf0「テスト線 d4f9bc9 を本番へ」）で
 *   ★テスト線の js/supa-config.js が 本番へ 紛れ込んだ★。
 *     本番の 名札 … env:'prod' → ★env:'test'★ に なった
 *     本番の 倉庫 … B(本番) → ★A(試験用)★ を 向いた
 *   ⇒ rakually.vercel.app の 入口に ★茶色の帯「テスト環境／ここで入れた内容は
 *      本番には入りません（練習用のデータです）」★ が 出ていた（実ブラウザで 撮って 確認）。
 *   ⇒ さらに ★客の 書き込み先が 試験用の 倉庫★に なっていた
 *      （幸い その 約1日、客は 1件も 入れておらず データの 分かれは 起きていない）。
 *
 * ★守りは 在ったのに 効かなかった★
 *   scripts/ship-all.mjs は 2026-09-03 から js/supa-config.js を ★絶対に 運ばない★（NEVER_SHIP）。
 *   ＝★09-12 の 投入は ship-all を 通していない★。
 *   ⇒ ★運ぶ道具の 守りだけでは 足りない★。★置かれた 結果★を CI で 見る。
 *
 * ★素性は 何で 決めるか★
 *   ★js/supa-config.js の env を 見て 判定しては いけない★（それを 見張る 物なので 堂々巡り）。
 *   ⇒ ★git の origin の 名前★ で 決める（外から 来る 事実）。
 *      …-test で 終わる → テスト線（env は 'test' で なければ 赤）
 *      それ以外        → 本番（env は 'prod' で なければ 赤）
 *
 * 使い方: node tests/supa-config-env-matches-repo.test.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { envOf } from '../scripts/repo-env.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = process.argv.includes('--self-test');

/* ★origin の 名前★（.git を 落とす）。読めなければ 空 */
export function originName(root) {
  try {
    const u = execFileSync('git', ['-C', root, 'remote', 'get-url', 'origin'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const last = u.split('/').pop() || '';
    return last.replace(/\.git$/, '');
  } catch (e) { return ''; }
}
/* ★物差しそのもの★＝名前と 名札を 渡すと「よいか」を 返す（git を 使わずに 確かめられる 形） */
export function au(name, env) {
  if (!name) return { ok: false, naze: 'origin の 名前が 読めない（★読めない物を 緑に しない★）' };
  const hoshii = /-test$/.test(name) ? 'test' : 'prod';
  if (env !== 'test' && env !== 'prod') return { ok: false, hoshii, naze: 'env が test でも prod でも ない: ' + JSON.stringify(env) };
  if (env !== hoshii) return { ok: false, hoshii, naze: '★repo は ' + name + ' なのに 名札が ' + env + '★（欲しい ' + hoshii + '）' };
  return { ok: true, hoshii };
}

if (SELF) {
  console.log('\n[supa-config-env-matches-repo --self-test] わざと 食い違わせたら 赤に なるか');
  let ng = 0;
  const iu = (nm, good) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + nm + (good ? '' : '  ★思っていたのと 違う★')); };
  iu('本番に テスト線の 名札（★09-12 に 起きた 形★）… 赤', !au('rakually', 'test').ok);
  iu('テスト線に 本番の 名札 … 赤', !au('rakually-test', 'prod').ok);
  iu('名札が 空 … 赤', !au('rakually', '').ok);
  iu('知らない 名札 … 赤', !au('rakually', 'staging').ok);
  iu('origin が 読めない … 赤（★未測定を 緑に しない★）', !au('', 'prod').ok);
  iu('本番 × prod … 緑（★狼少年に しない★）', au('rakually', 'prod').ok);
  iu('テスト線 × test … 緑', au('rakually-test', 'test').ok);

  /* ★★指示役1 の 注文（2026-09-13）＝「git archive / tar で 運んだ時も 捕まるか 試せ」★★
     ＝それが ★09-12 に 実際に 使われた 手★（ship-all を 通らないので NEVER_SHIP が 効かない）。
     ⇒ ★字で 真似るのでは なく、本当に その手で 運んで から 見張りを 走らせる★。 */
  const os = await import('node:os'), fsp = await import('node:fs');
  const Q = String.fromCharCode(39);   /* ' … 入れ子で 書かない（repo-env.mjs と 同じ理由） */
  const tmp = fsp.mkdtempSync(path.join(os.tmpdir(), 'supacfg-'));
  const mk = (dir, origin, env) => {
    fsp.mkdirSync(path.join(dir, 'js'), { recursive: true });
    fsp.writeFileSync(path.join(dir, 'js', 'supa-config.js'),
      'window.SUPA = {' + String.fromCharCode(10) + '  env: ' + Q + env + Q + String.fromCharCode(10) + '};' + String.fromCharCode(10));
    execFileSync('git', ['-C', dir, 'init', '-q'], { stdio: 'ignore' });
    execFileSync('git', ['-C', dir, 'remote', 'add', 'origin', 'https://github.com/x/' + origin + '.git'], { stdio: 'ignore' });
    execFileSync('git', ['-C', dir, 'add', '-A'], { stdio: 'ignore' });
    execFileSync('git', ['-C', dir, '-c', 'user.email=a@b', '-c', 'user.name=a', 'commit', '-q', '-m', 'x'], { stdio: 'ignore' });
  };
  const tesuto = path.join(tmp, 'rakually-test'), honban = path.join(tmp, 'rakually');
  mk(tesuto, 'rakually-test', 'test');
  mk(honban, 'rakually', 'prod');
  iu('運ぶ前の 本番は 緑', au(originName(honban), envOf(fsp.readFileSync(path.join(honban, 'js/supa-config.js'), 'utf8'))).ok);
  /* ★09-12 に 使われた 手そのもの★ */
  /* ★Windows の 逆斜線を sh に 渡すな★＝逃がし記号と 見なされて 落ちる（実測）。C:/… に 直す。 */
  const sl = (p) => p.split(path.sep).join('/');
  execFileSync('sh', ['-c', 'git -C "' + sl(tesuto) + '" archive HEAD | tar -x -C "' + sl(honban) + '"'], { stdio: 'ignore' });
  const ato = envOf(fsp.readFileSync(path.join(honban, 'js/supa-config.js'), 'utf8'));
  iu('★git archive | tar で 運ぶと 本番の 名札が test に なる（事故の 再現）★', ato === 'test');
  iu('★その後に この見張りを 走らせると 赤★（09-12 を 捕まえられる）', !au(originName(honban), ato).ok);
  fsp.rmSync(tmp, { recursive: true, force: true });
  console.log(ng ? '\n★自己確認 ' + ng + '件 おかしい★' : '\n自己確認 OK（わざと 食い違わせると 赤に なる）');
  process.exit(ng ? 1 : 0);
}

const name = originName(ROOT);
const src = fs.readFileSync(path.join(ROOT, 'js', 'supa-config.js'), 'utf8');
const env = envOf(src);
const r = au(name, env);

console.log('\n[supa-config-env-matches-repo] repo の 素性と 名札が 合っているか');
console.log('  origin の 名前 … ' + (name || '（読めない）'));
console.log('  js/supa-config.js の 名札 env … ' + (env || '（読めない）'));
console.log('  欲しい 名札 … ' + (r.hoshii || '（決められない）'));
if (r.ok) { console.log('  ✓ 合っている'); process.exit(0); }
console.log('  ✗ ' + r.naze);
console.log('    ★直し方★ この repo の js/supa-config.js を この線の 値に 戻す。');
console.log('    ★運ぶ時は scripts/ship-all.mjs を 通す★（js/supa-config.js は 運ばない 守りが 入っている）。');
process.exit(1);
