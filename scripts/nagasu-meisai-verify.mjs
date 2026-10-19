/* nagasu-meisai-verify.mjs — ★本人の 明細の 合言葉の 照らしを 直した 版（supabase/meisai-verify.sql）を 倉庫へ 流す★（2026-10-19）
 *
 * なぜ：public.meisai_verify は 合言葉が null だと 照らしを 通り、★合言葉 無しで 端末の 鍵が 出た★
 *       （テスト線の 倉庫で 条件の 値と /rpc/ の 道＝kyuyo/tests/kagi-terasu.mjs ㋓合言葉なし で 実測）。
 *
 *   node scripts/nagasu-meisai-verify.mjs --kura test --probe     … 読むだけ
 *   node scripts/nagasu-meisai-verify.mjs --kura test             … 流して 数える
 *   node scripts/nagasu-meisai-verify.mjs --kura honban --honban  … 本番（★司さんの 許しの 後だけ・2つ 打たないと 動かない★）
 *   --modosu … 直す 前の 本体へ 戻す（前が 直した 版の 時だけ）
 *
 * ★守り★（nagasu-koori-3retsu.mjs と 同じ 形）
 *   ① 流すのは この 関数 1本だけ。本体は repo の sql から 抜き、md5 が 決めた 版の 時だけ 流す
 *   ② 前が「直す 前の 版（d2761d67…）」で ない 時は 上書きしない（知らない 物を 上書きしない）
 *   ③ 持ち主・definer・search_path・volatile・権限・戻り・言語・引数を 前と 後で 数え、変わったら NG
 *   ④ 流す 前に「試み」、後に 結果を supabase/NAGASHITA.md へ。道具と sql が commit 済みの 時だけ 流す
 * 鍵: ~/.supabase-token。中身は 画面へ 出さない。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PROD_REF, TEST_REF } from './_souko-ref.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const KURA = { test: TEST_REF, honban: PROD_REF };
const MD5_NAOSHITA = '3b0b1f37d5dac22744c88db742e1369a';   // supabase/meisai-verify.sql の 本体
const MD5_MAE = 'd2761d6779caf29f124adab480cf8d9c';        // 直す 前（テスト線の 倉庫に 在った 本体・2026-10-19 実測）
const REL = 'scripts/nagasu-meisai-verify.mjs', SQL_REL = 'supabase/meisai-verify.sql';

const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
const has = (k) => process.argv.includes(k);
class Stop extends Error {}
function die(m) { console.error('★中止: ' + m); console.log('NAGASU RESULT: NG'); throw new Stop(m); }
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

function honbunOf(sql) {
  const i = sql.indexOf('create or replace function public.meisai_verify(');
  if (i < 0) die('sql に meisai_verify が 無い');
  const a = sql.indexOf('$function$', i) + '$function$'.length, b = sql.indexOf('$function$', a);
  const end = sql.indexOf(';', b);
  return { stmt: sql.slice(i, end + 1), body: sql.slice(a, b) };
}
async function q(ref, tok, query, readOnly) {
  const r = await fetch('https://api.supabase.com/v1/projects/' + ref + '/database/query', {
    method: 'POST',
    headers: { 'User-Agent': 'rakunally-nagasu', Authorization: 'Bearer ' + tok, 'content-type': 'application/json' },
    body: JSON.stringify(readOnly ? { query, read_only: true } : { query }),
  });
  const t = await r.text();
  if (!r.ok) die('倉庫が 断った（HTTP ' + r.status + '）: ' + t.slice(0, 300));
  try { return JSON.parse(t); } catch (e) { die('返事が 読めない: ' + t.slice(0, 200)); }
}
const MIRU = "select p.oid::text oid, md5(p.prosrc) m, md5(replace(p.prosrc, chr(13), '')) m_lf, length(p.prosrc) n, "
  + "pg_get_userbyid(p.proowner) owner, p.prosecdef secdef, coalesce(array_to_string(p.proconfig, ','), '') config, "
  + "p.provolatile vol, coalesce(p.proacl::text, '') acl, p.prorettype::regtype::text ret, l.lanname lang, "
  + "pg_get_function_identity_arguments(p.oid) args "
  + "from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang "
  + "where n.nspname='public' and p.proname='meisai_verify'";
const SEISHITSU = ['oid', 'owner', 'secdef', 'config', 'vol', 'acl', 'ret', 'lang', 'args'];
const LOG = path.join(ROOT, 'supabase/NAGASHITA.md');
function kiroku(line) {
  if (!fs.existsSync(LOG)) {
    fs.writeFileSync(LOG, '# 倉庫へ 流した 記録（★repo と 倉庫が ずれない為・2026-10-14〜★）\n\n'
      + '流す 時は 必ず 道具が ここに 書く（★流す 前に「試み」・流した 後に 結果★＝途中で 落ちても 試みた 事は 残る）。\n'
      + 'md5 は 関数の 本体（prosrc）。性質＝持ち主/definer/search_path 等/volatile/権限/戻り/言語/引数。\n\n'
      + '| いつ（UTC） | 倉庫 | 段 | 物 | 前の md5 | 後の md5 | 引き金（前→後） | 性質 | 流した 文の md5 | 道具の commit | 結果 |\n'
      + '|---|---|---|---|---|---|---|---|---|---|---|\n');
  }
  fs.appendFileSync(LOG, line);
}

async function main() {
  const kura = arg('--kura');
  if (!KURA[kura]) die('--kura test か --kura honban を 打ってください');
  if (kura === 'honban' && !has('--honban')) die('本番は --honban も 打ってください（打ち間違い 止め）');
  const modosu = has('--modosu');
  const ref = KURA[kura];
  const tok = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.supabase-token'), 'utf8')).token;
  if (!tok) die('鍵が 無い（~/.supabase-token）');

  const sql = fs.readFileSync(path.join(ROOT, SQL_REL), 'utf8');
  let { stmt, body } = honbunOf(sql);
  if (modosu) {
    /* 戻す＝直した 1行を 元に 戻した 本体（md5 が 直す 前と 同じ 時だけ） */
    const a = 'p_pw is null or v_pub.pw_hash is null or v_pub.pw_hash <> crypt(p_pw, v_pub.pw_hash)';
    const b = 'v_pub.pw_hash is null or v_pub.pw_hash <> crypt(p_pw, v_pub.pw_hash)';
    if (stmt.split(a).length !== 2) die('戻す 1行が 見つからない');
    stmt = stmt.replace(a, b); body = body.replace(a, b);
  }
  const MOTO = modosu ? MD5_NAOSHITA : MD5_MAE, SAKI = modosu ? MD5_MAE : MD5_NAOSHITA;
  const namae = (x) => x === MD5_NAOSHITA ? '直した 版' : x === MD5_MAE ? '直す 前（null で 通る）' : '★知らない 版★';
  console.log((modosu ? '戻す' : '流す') + ' 本体 md5 ' + md5(body) + '（' + body.length + '字）');
  if (md5(body) !== SAKI) die('流す 本体の md5 が 決めた 版と 違う＝流さない');

  const mae = await q(ref, tok, MIRU, true);
  if (mae.length !== 1) die('同じ 名前の 関数が ' + mae.length + '本＝どれを 指すか 分からない');
  const m0 = mae[0];
  console.log('[' + kura + '] 前 … md5 ' + m0.m + '（' + namae(m0.m) + '・' + m0.n + '字・CR 抜き ' + m0.m_lf + '）');
  console.log('        性質 … ' + SEISHITSU.map((k) => k + '=' + JSON.stringify(m0[k])).join(' '));
  if (has('--probe')) { console.log('NAGASU RESULT: PROBE'); return; }

  let dougu = '';
  try {
    if (execSync('git status --porcelain -- ' + REL + ' ' + SQL_REL, { cwd: ROOT }).toString().trim()) die('道具か sql が commit されていない／書き換え中＝流さない');
    dougu = execSync('git log -1 --format=%H -- ' + REL, { cwd: ROOT }).toString().trim();
  } catch (e) { if (e instanceof Stop) throw e; die('git が 読めない'); }
  if (!dougu) die('道具が commit されていない');
  if (m0.m === SAKI) { console.log('もう ' + namae(SAKI) + '＝流さない'); console.log('NAGASU RESULT: OK'); return; }
  if (m0.m !== MOTO) die('前が ' + namae(MOTO) + ' で ない＝知らない 物を 上書きしない（門を 緩めない）');
  if (m0.secdef !== true || m0.config !== 'search_path=public, extensions' || m0.ret !== 'jsonb' || m0.lang !== 'plpgsql' || m0.args !== 'p_token uuid, p_pw text') {
    die('性質が 決めた 形で ない（流すと 黙って 変わる 物が 在る）＝流さない');
  }
  const dan = modosu ? '戻す' : '流す';
  const sei = (x) => SEISHITSU.map((k) => k + '=' + x[k]).join(';');
  kiroku('| ' + new Date().toISOString() + ' | ' + kura + ' | ' + dan + '（試み） | public.meisai_verify | ' + m0.m + ' | — | — | '
    + sei(m0).replace(/\|/g, '/') + ' | ' + md5(stmt) + ' | ' + dougu.slice(0, 12) + ' | 試み |\n');
  let ochi = '';
  try { await q(ref, tok, stmt, false); } catch (e) { ochi = (e && e.message) || 'error'; }
  const ato = await q(ref, tok, MIRU, true);
  const m1 = ato[0] || {};
  console.log('[' + kura + '] 後 … md5 ' + m1.m + '（' + namae(m1.m) + '・' + m1.n + '字）');
  const onaji = SEISHITSU.every((k) => String(m0[k]) === String(m1[k]));
  if (!onaji) console.log('★性質が 変わった★ 前 ' + sei(m0) + ' ／ 後 ' + sei(m1));
  const ok = !ochi && ato.length === 1 && m1.m === SAKI && onaji;
  kiroku('| ' + new Date().toISOString() + ' | ' + kura + ' | ' + dan + ' | public.meisai_verify | ' + m0.m + ' | ' + m1.m + ' | — | '
    + (onaji ? '同じ' : '★変わった★ ' + sei(m1).replace(/\|/g, '/')) + ' | ' + md5(stmt) + ' | '
    + dougu.slice(0, 12) + ' | ' + (ok ? 'OK' : 'NG' + (ochi ? '（' + ochi.slice(0, 80).replace(/\|/g, '/') + '）' : '')) + ' |\n');
  console.log('記録 → supabase/NAGASHITA.md');
  console.log('NAGASU RESULT: ' + (ok ? 'OK' : 'NG'));
  if (!ok) process.exitCode = 1;
}
main().catch((e) => { if (!(e instanceof Stop)) console.error(e && e.message); process.exitCode = 1; });
