/* souko-honban-mon.test.mjs — ★倉庫の 入口（_souko-kazoeru の toi）は 試験の 倉庫を 指す repo でしか 問わない★
 * =============================================================================
 * ★なぜ（2026-11-01）★
 *   _souko-kazoeru.mjs の 覚書は「本番の ref を 渡されたら その場で 止める」と 言っていたが、
 *   ★中身に 門が 無かった★（本番前 taiketsu 10-31 が 見つけた）。
 *   ＝本番の 木で 手元から 回すと 鍵が 在れば 本番の 倉庫へ 問い、自己確認⑥〜⑨は 本番に 2行 置いて 消す。
 *
 * ★ここで 見る事（字では なく 本当に 動かして 数える）★
 *   作り物の repo を 一時の 置き場に 組む（_souko-kazoeru・repo-env・_souko-ref・repo-supa の 本物の 写し＋
 *   名札と url だけ 変えた supa-config）。★作り物の 鍵★を 置き、fetch を 数える 偽物に 差し替えて
 *   toiawase('select 1') を 1回 呼ぶ。
 *     ・名札 test・url 試験 … fetch 1回（★対照★＝門が 何でも 止める 壊れ方なら ここで 赤）
 *     ・名札 prod・url 本番 … fetch 0回・訳 HONBAN_JI・kankyoKa＝true（未測定＝終わり値0 の 道）
 *     ・名札 無し          … fetch 0回・訳 FUMEI_JI・kankyoKa＝false（赤の 道）
 *     ・名札 test・url 本番 … fetch 0回・訳 ZURE_JI・kankyoKa＝false（赤の 道・09-14 に 出た「url だけ 逆」）
 *   ★本物の 鍵・本物の 倉庫には 1文字も 触らない★（HOME を 一時の 置き場に 向ける・fetch は 偽物）。
 *   ★URL は 字の 足し算で 組む★（直書きの 見張り no-hardcoded-supa を 赤に しない・設計前 taiketsu 11-01 止1）。
 *
 * --self-test … 門の 1行を 抜いた 写しで 同じ事を して ★赤が 出る★事を 見る＋判じの 偽物。
 * 使い方: node kyuyo/tests/souko-honban-mon.test.mjs [--self-test]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PROD_REF, TEST_REF } from '../../scripts/_souko-ref.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELF = process.argv.includes('--self-test');
const MON_GYO = '  if (mon) return { ok: false, naze: mon };';
const urlOf = (ref) => 'https://' + ref + '.supa' + 'base.co';

/* ★作り物の repo を 組んで 1回 問う★＝{ n: fetch の 回数, ok, naze, kankyo, 字 } を 返す */
export function tou(env, ref, { kowasu = false } = {}) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'souko-honban-mon-'));
  try {
    for (const f of ['kyuyo/tests/_souko-kazoeru.mjs', 'scripts/repo-env.mjs', 'scripts/_souko-ref.mjs', 'tests/repo-supa.mjs']) {
      fs.mkdirSync(path.join(d, path.dirname(f)), { recursive: true });
      let s = fs.readFileSync(path.join(ROOT, f), 'utf8');
      if (kowasu && f.endsWith('_souko-kazoeru.mjs')) {
        if (s.indexOf(MON_GYO) < 0) throw new Error('壊す 1行が 見つからない（門の 形が 変わった？）');
        s = s.replace(MON_GYO, '');
      }
      fs.writeFileSync(path.join(d, f), s);
    }
    fs.mkdirSync(path.join(d, 'js'), { recursive: true });
    const nafuda = env == null ? '' : "  env: '" + env + "',\n";
    fs.writeFileSync(path.join(d, 'js/supa-config.js'),
      "window.SUPA = {\n" + nafuda + "  url: '" + urlOf(ref) + "',\n  key: 'tukurimono-kagi',\n};\n");
    const home = path.join(d, 'home');
    fs.mkdirSync(home);
    fs.writeFileSync(path.join(home, '.supabase-token'), JSON.stringify({ token: 'tukurimono' }));
    const kodomo = path.join(d, 'kodomo.mjs');
    fs.writeFileSync(kodomo,
      "let n = 0;\n"
      + "globalThis.fetch = async () => { n++; return { ok: true, status: 200, json: async () => [{ x: 1 }] }; };\n"
      /* ★字の import を 書かない★＝refs-resolve が 本物の 参照と 読んで 赤に する（11-01 実測）⇒ 組んだ 置き場の 絶対 URL を 渡す */
      + 'const m = await import(' + JSON.stringify(pathToFileURL(path.join(d, 'kyuyo', 'tests', '_souko-kazoeru.mjs')).href) + ');\n'
      + "const r = await m.toiawase('select 1 as x');\n"
      + "console.log('KOTAE' + JSON.stringify({ n, ok: r.ok, naze: r.naze || null, kankyo: m.kankyoKa(r.naze),"
      + " HONBAN: m.HONBAN_JI, FUMEI: m.FUMEI_JI, ZURE: m.ZURE_JI }));\n");
    const out = execFileSync(process.execPath, [kodomo], {
      cwd: d, encoding: 'utf8', stdio: 'pipe', timeout: 30000,
      env: Object.assign({}, process.env, { HOME: home, USERPROFILE: home, CI: '', GITHUB_ACTIONS: '' }),
    });
    const line = out.split(/\r?\n/).find((l) => l.startsWith('KOTAE'));
    if (!line) throw new Error('子が 答えを 出さない: ' + out.slice(0, 200));
    return JSON.parse(line.slice(5));
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
}

/* ★判じ（純粋）★＝ずれた 所を 字で 返す（空＝合格） */
export function hanjiru(test, prod, nashi, zure) {
  const w = [];
  if (!(test.n === 1 && test.ok === true)) w.push('名札 test・url 試験で 問えない（fetch ' + test.n + '回）＝門が 何でも 止める');
  if (prod.n !== 0) w.push('★名札 prod で fetch ' + prod.n + '回★＝本番の 倉庫へ 問う');
  if (!(prod.ok === false && prod.naze === prod.HONBAN && prod.kankyo === true)) w.push('名札 prod の 訳が 本番＋未測定で ない（' + prod.naze + '）');
  if (nashi.n !== 0) w.push('★名札 無しで fetch ' + nashi.n + '回★');
  if (!(nashi.ok === false && nashi.naze === nashi.FUMEI && nashi.kankyo === false)) w.push('名札 無しが 赤の 道で ない（' + nashi.naze + '）');
  if (zure.n !== 0) w.push('★名札 test・url 本番で fetch ' + zure.n + '回★＝本番の 倉庫へ 問う');
  if (!(zure.ok === false && zure.naze === zure.ZURE && zure.kankyo === false)) w.push('名札 test・url 本番が 赤の 道で ない（' + zure.naze + '）');
  return w;
}

const yonTouri = (o) => [tou('test', TEST_REF, o), tou('prod', PROD_REF, o), tou(null, TEST_REF, o), tou('test', PROD_REF, o)];

let pass = 0, fail = 0;
const iu = (n, good, m) => { if (good) pass++; else fail++; console.log('  ' + (good ? '✓' : '✗') + ' ' + n + (good ? '' : '  ★' + (m || '') + '★')); };

if (!SELF) {
  console.log('\n[souko-honban-mon] ★倉庫の 入口は 試験の 倉庫を 指す repo でしか 問わない★（作り物の repo・作り物の 鍵・偽の fetch）');
  const [t, p, z, r] = yonTouri({});
  console.log('  test・試験 … fetch ' + t.n + '回／prod・本番 … ' + p.n + '回（' + p.naze + '）／名札 無し … ' + z.n + '回（' + z.naze + '）／test・本番 … ' + r.n + '回（' + r.naze + '）');
  const w = hanjiru(t, p, z, r);
  iu('★test・試験 だけ 問う・他の 3通りは 1回も 問わない★', w.length === 0, w.join(' ／ '));
} else {
  console.log('\n[souko-honban-mon --self-test] ★門の 1行を 抜いた 写しで 赤が 出るか★');
  const w = hanjiru(...yonTouri({ kowasu: true }));
  iu('★門を 抜くと 赤（prod で fetch が 走る）★', w.some((x) => x.indexOf('名札 prod で fetch') >= 0), '赤に ならない＝この 見張りは 嘘を つく');
  iu('★門を 抜くと 名札 無しも 赤★', w.some((x) => x.indexOf('名札 無しで fetch') >= 0), '赤に ならない');
  iu('★門を 抜くと url だけ 本番も 赤★', w.some((x) => x.indexOf('url 本番で fetch') >= 0), '赤に ならない');
  /* 判じ だけの 偽物 */
  const P = { HONBAN: 'H', FUMEI: 'F', ZURE: 'Z' };
  const T = { n: 1, ok: true };
  const Pr = (k) => Object.assign({ n: 0, ok: false, naze: 'H', kankyo: k }, P);
  const Na = (k) => Object.assign({ n: 0, ok: false, naze: 'F', kankyo: k }, P);
  const Zu = (k) => Object.assign({ n: 0, ok: false, naze: 'Z', kankyo: k }, P);
  iu('★何でも 止める 壊れ方も 赤★', hanjiru({ n: 0, ok: false }, Pr(true), Na(false), Zu(false)).length === 1);
  iu('★本番を 赤の 道に 落とすのも 赤★', hanjiru(T, Pr(false), Na(false), Zu(false)).length === 1);
  iu('★名札 無しを 未測定に 落とすのも 赤★', hanjiru(T, Pr(true), Na(true), Zu(false)).length === 1);
  iu('★url だけ 本番を 未測定に 落とすのも 赤★', hanjiru(T, Pr(true), Na(false), Zu(true)).length === 1);
  iu('★正しい 形は 合格★', hanjiru(T, Pr(true), Na(false), Zu(false)).length === 0);
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
