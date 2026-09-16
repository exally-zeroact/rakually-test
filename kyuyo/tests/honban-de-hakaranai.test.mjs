/* honban-de-hakaranai.test.mjs — ★ログインする 試験は「本番の repo では 測らない」門を 必ず 持つ★
 * ============================================================================
 * ★なぜ（2026-09-16 実測）★
 *   実ブラウザの 試験は ★試験用の 口で ログインする★。
 *   ★本番の repo には その 鍵が 無い★（＝そう 決めて ある）。
 *   ⇒ 門が 無い 試験は ★入れない ⇒ 終わり値 2 ⇒ 本番の WebKit が 毎回 必ず 赤★。
 *   ★中身の 不具合では ない／測る 場所が 違うだけ★。
 *   ★実測★ … webkit.yml に 載る ログインする 試験 8本の うち
 *     ★門を 持って いなかったのは 2本★（shutoku-ui／soshitsu-ui）。
 *
 * ★司さんの 言葉（2026-09-16）★
 *   「★本番は テスト版が 完璧なら コード 写すだけ★／★テスト版で 完璧に しろ★」
 *   ⇒ ★直す 場所は ★テスト線★★（本番の repo を 直しに 行かない）。
 *   ⇒ 実際 客に 出る 151本の うち ★145本が バイト一致★／違いは `js/supa-config.js` と
 *     版の印（?v=）だけ＝★「テスト環境」の 帯も その 1本が 出して いる★。
 *
 * ★ここで見る事★
 *   ① ログインする 試験（hairu を 呼ぶ）を 数え、★全部が kagiAru の 門を 持つ★
 *   ② 門は ★ブラウザを 借りる 前★に 在る（借りてから 抜けると 機械を 無駄に 使う）
 *
 * ★字だけで 測ります★（ブラウザ 要らない＝CIで 毎回）。
 * 使い方: node kyuyo/tests/honban-de-hakaranai.test.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELF = process.argv.includes('--self-test');

let pass = 0, fail = 0;
const T = (n, f) => { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m); };

export function strip(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/* ★ログインする 試験＝`hairu(` を 呼ぶ 物★（借りるだけの 物は 数えない） */
export function loginSuru(files, yomu) {
  return files.filter((f) => /\bhairu\s*\(/.test(strip(yomu(f))));
}
export function monGaNai(files, yomu) {
  return loginSuru(files, yomu).filter((f) => !/kagiAru/.test(strip(yomu(f))));
}
/* ★門は ブラウザを 借りる 前★＝kagiAru の 位置が borrow( より 手前 */
export function junbanGaGyaku(files, yomu) {
  const warui = [];
  for (const f of loginSuru(files, yomu)) {
    const s = strip(yomu(f));
    const a = s.indexOf('kagiAru'), b = s.indexOf('borrow(');
    if (a >= 0 && b >= 0 && a > b) warui.push(f);
  }
  return warui;
}

const yomu = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const FILES = fs.readdirSync(path.join(ROOT, 'kyuyo/tests'))
  .filter((f) => /\.mjs$/.test(f)).map((f) => 'kyuyo/tests/' + f).sort();

const LOGIN = loginSuru(FILES, yomu);
console.log('\n[honban-de-hakaranai] ログインする 試験は 本番の repo では 測らない（2026-09-16＝本番の WebKit が 毎回 赤だった）');
console.log('  見る 範囲 … kyuyo/tests の .mjs ' + FILES.length + '本 ／ うち ★ログインする ' + LOGIN.length + '本★');

T('★① ログインする 試験は 全部「本番では 測らない」門を 持つ', () => {
  const nai = monGaNai(FILES, yomu);
  ok(nai.length === 0,
    '★門が 無い★ … ' + nai.join(' / ')
    + '（★本番の repo には 試験の 鍵が 無い＝入れない＝毎回 必ず 赤に なります★）');
});

T('★② 門は ブラウザを 借りる 前に 在る（借りてから 抜けない）', () => {
  const gyaku = junbanGaGyaku(FILES, yomu);
  ok(gyaku.length === 0, '★借りてから 門を 通って います★ … ' + gyaku.join(' / '));
});

/* ★★自己確認＝わざと 壊して 赤が 出るか★★ */
if (SELF) {
  console.log('\n[honban-de-hakaranai] ★自己確認★（わざと 壊して 赤が 出るか）');
  let ng = 0;
  const iu = (n, good, m) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + n + (good ? '' : '  ★' + (m || '') + '★')); };

  const F2 = FILES.concat(['kyuyo/tests/nise.mjs']);
  const nise = (naka) => (f) => (f === 'kyuyo/tests/nise.mjs' ? naka : yomu(f));

  /* ★今 門が 無い 本が 0本に なった から、★増えた 1本だけ★を 見る（前は 1 と 決め打って いた） */
  const mae = monGaNai(FILES, yomu).length;
  iu('① ★門が 無い 試験を 1本 足したら 赤★',
    monGaNai(F2, nise("const wk = await borrow('x','webkit'); await hairu(pg, url, sel);")).length === mae + 1,
    '見つけられない（今 門が 無い 本 ' + mae + '本）');

  iu('② ★借りてから 門を 通ったら 赤★',
    junbanGaGyaku(F2, nise("const wk = await borrow('x','webkit'); if(!(await kagiAru(ROOT))) process.exit(0); await hairu(pg,url,sel);")).length === 1,
    '見つけられない');

  iu('③ ★ログインしない 物は 数えない★',
    loginSuru(F2, nise("const wk = await borrow('x','webkit'); /* ログインしない */")).indexOf('kyuyo/tests/nise.mjs') < 0,
    '関係ない物まで 縛って いる');

  console.log(ng ? '\n★自己確認 ' + ng + '件 おかしい★' : '\n自己確認 OK（★赤が 出る事まで 見た★）');
  if (ng) process.exit(1);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
