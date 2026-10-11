/* _shiken-kuchi.mjs — ★試験の口（ログイン）の 合言葉を 読む 所は ここ 1か所★（2026-10-11・決め2 段1）
 *
 * ★なぜ★
 *   この repo は 公開。前は 合言葉の 字が 6ファイル 7行に 直に 書いてあった＋専用の口の 固定の 合言葉 1行。
 *   ★メールは repo に 在って 良い★（共用の口は 司さんの 受信箱では ない＝指示役の 決め 10-11）。守るのは 合言葉だけ。
 *
 * ★読む 順★（指示役の 決め 10-11）
 *   ① 環境変数 SHIKEN_KUCHI_PASS … 共用の口（kyoyu・b）の 合言葉（CI は GitHub の secret から 渡す）
 *   ② ~/.shiken-kuchi.json      … 手元。{ "kuchi": { "<名>": { "email": "...", "pass": "..." } } }
 *   ★どちらにも 無ければ exit 2（赤）★＝黙って 飛ばして 緑に しない。
 *   %TEMP% の cred（exally-e0-test-cred.json 等）は ★使わない★（消えて 口を 作り直していた）。
 *
 * ★口を 作り直さない★
 *   入れない時に signUp で 作り直す 道が 3本 在った＝★外した★。入れなければ「置き場の 合言葉が 違う」で 赤。
 *
 * ★本番を 向いた repo では 合言葉を 返さない★（repoEnv が test の 時だけ）
 *
 * 使い方: import { kuchi } from '../tests/_shiken-kuchi.mjs';  const { email, pass } = kuchi('kyoyu');
 *         node tests/_shiken-kuchi.mjs --self-test … 置き場が 無い／違う時に 本当に 止まるか（合言葉の 字は 出さない）
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repoEnv } from '../scripts/repo-env.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ★口の 表★＝メールは ここ（repo に 在って 良い）。合言葉は 置かない。 */
export const KUCHI = {
  kyoyu: { email: 'test@test.com', env: true },        /* 共用の口（中身を 持っている人） */
  b: { email: 'test-b@test.com', env: true },          /* 共用の口（何も 持っていない人・rls-tanin） */
  senyou: { email: 'exally.supoort+uwagaki-jissho@gmail.com' },  /* 会社の上書きの 実証の 専用口 */
  e0test: { email: 'exally.supoort+e0test@gmail.com' },         /* live-roundtrip・live-seed */
  seikyu: { email: 'exally.supoort+seikyu-test@gmail.com' },    /* live-seikyu */
};

export const OKIBA = () => path.join(os.homedir(), '.shiken-kuchi.json');

/* ★止まらずに 答えだけ 返す 中身★（self-test が 使う）＝{ ok, email, pass, naze } */
export function kuchiYomu(na, { env = process.env, okiba = OKIBA(), root = ROOT } = {}) {
  const k = KUCHI[na];
  if (!k) return { ok: false, naze: '口の 名が 違う: ' + na + '（' + Object.keys(KUCHI).join('/') + '）' };
  const e = repoEnv(root);
  if (e !== 'test') return { ok: false, naze: 'この repo は test を 向いていない（' + (e || '読めない') + '）＝合言葉を 返さない' };
  if (k.env && env.SHIKEN_KUCHI_PASS) return { ok: true, email: k.email, pass: env.SHIKEN_KUCHI_PASS, kara: 'SHIKEN_KUCHI_PASS' };
  let j = null;
  try { j = JSON.parse(fs.readFileSync(okiba, 'utf8')); } catch (err) {
    return { ok: false, naze: '置き場が 読めない（' + okiba + '・' + (err && err.code || err && err.message) + '）' + (k.env ? '／SHIKEN_KUCHI_PASS も 無い' : '') };
  }
  const v = j && j.kuchi && j.kuchi[na];
  if (!v || typeof v.pass !== 'string' || !v.pass) return { ok: false, naze: '置き場に 口「' + na + '」の 合言葉が 無い（' + okiba + '）' };
  if (v.email !== k.email) return { ok: false, naze: '置き場の 口「' + na + '」の メールが 表と 違う（' + okiba + '）' };
  return { ok: true, email: k.email, pass: v.pass, kara: okiba };
}

/* ★無ければ その場で exit 2★（試験・道具は これを 呼ぶ） */
export function kuchi(na) {
  const r = kuchiYomu(na);
  if (!r.ok) {
    console.log('✗ 試験の口の 合言葉が 無い … ' + r.naze);
    console.log('  （CI は secret SHIKEN_KUCHI_PASS・手元は ~/.shiken-kuchi.json。★黙って 飛ばさない★）');
    process.exit(2);
  }
  return { email: r.email, pass: r.pass };
}

/* ── --self-test ── 合言葉の 字は 出さない（長さも 出さない） */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv.includes('--self-test')) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shiken-kuchi-'));
  const fake = path.join(tmp, 'k.json');
  let ok = 0, ng = 0;
  const t = (nm, c) => { if (c) { ok++; console.log('  ok  ' + nm); } else { ng++; console.log('  ✗   ' + nm); } };
  const testRoot = path.join(tmp, 'test'), prodRoot = path.join(tmp, 'prod');
  for (const [r, e] of [[testRoot, 'test'], [prodRoot, 'prod']]) {
    fs.mkdirSync(path.join(r, 'js'), { recursive: true });
    fs.writeFileSync(path.join(r, 'js/supa-config.js'), "window.SUPA = { env: '" + e + "' };\n");
  }
  const o = (x) => ({ env: {}, okiba: fake, root: testRoot, ...x });
  t('① 置き場も 環境変数も 無い→止まる', !kuchiYomu('kyoyu', o()).ok);
  t('② 環境変数が 在れば kyoyu は 読める', kuchiYomu('kyoyu', o({ env: { SHIKEN_KUCHI_PASS: 'x-dummy' } })).pass === 'x-dummy');
  t('③ 環境変数は 専用の口には 効かない', !kuchiYomu('senyou', o({ env: { SHIKEN_KUCHI_PASS: 'x-dummy' } })).ok);
  fs.writeFileSync(fake, JSON.stringify({ kuchi: { kyoyu: { email: 'test@test.com', pass: 'y-dummy' }, b: { email: 'other@x.test', pass: 'z' } } }));
  t('④ 置き場から kyoyu を 読める', kuchiYomu('kyoyu', o()).pass === 'y-dummy');
  t('⑤ 置き場の メールが 表と 違えば 止まる', !kuchiYomu('b', o()).ok);
  t('⑥ 置き場に 無い口は 止まる', !kuchiYomu('seikyu', o()).ok);
  t('⑦ 名の 違う口は 止まる', !kuchiYomu('nai', o()).ok);
  t('⑧ 本番を 向いた repo では 環境変数が 在っても 返さない', !kuchiYomu('kyoyu', o({ root: prodRoot, env: { SHIKEN_KUCHI_PASS: 'x-dummy' } })).ok);
  fs.writeFileSync(fake, '{ こわれた');
  t('⑨ 置き場が 壊れていれば 止まる', !kuchiYomu('kyoyu', o()).ok);
  fs.rmSync(tmp, { recursive: true, force: true });
  /* ⑩ 合言葉違いの 判じの 字が 画面の 字と 同じか（字で 判じる 門＝画面が 字を 変えたら 空振り） */
  /* ★_hairu.mjs は 読み込まない★（あちらが この 部品を 読む＝輪に なって 止まる）＝字を 拾う */
  const AIKOTOBA_CHIGAU = (/export const AIKOTOBA_CHIGAU = '([^']+)'/.exec(fs.readFileSync(path.join(ROOT, 'tests/_hairu.mjs'), 'utf8')) || [])[1] || '（拾えない）';
  const gamen = ['js/rakunally-login.js', 'kyuyo/js/auth.js', 'kyuyo/js/admin.js'].filter((f) => fs.readFileSync(path.join(ROOT, f), 'utf8').includes(AIKOTOBA_CHIGAU));
  t('⑩ 合言葉違いの 字が 画面 3本（入口・給与・管理）に 在る（' + gamen.length + '/3）', gamen.length === 3);
  console.log('\n  [shiken-kuchi --self-test] ok ' + ok + ' ／ ✗ ' + ng + ' ／ 全 ' + (ok + ng));
  console.log('自己確認: ' + ok + '/' + (ok + ng));
  process.exit(ng || ok !== 10 ? 1 : 0);
}
