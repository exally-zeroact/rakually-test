/* rireki-live.mjs — ★給与の 直しの 記録（kyuyo.pay_rireki）が 6本の 表 全部で 本当に 残るか★（試験の 倉庫・2026-11-20）
 * ============================================================================
 * ★なぜ★ 記録は「書けない時は 保存を 止めない（warning で 抜ける）」作り＝★黙って 残らない 穴★が ありうる。
 *   だから 表ごとに 書けた 行を 数える（数えないと 一生 気づかない・設計前 taiketsu 止め3）。
 *
 * ★見る 事★
 *   ① ログインした 人の 道（authenticated・アプリと 同じ public の 窓へ 書く）＝pay_employees・pay_payslips・pay_ledger：
 *      insert→1行・★中身が 同じ update／全員 upsert→0行★・違う update→1行（kawatta が 合う）・delete→1行（ato 無し）
 *      pay_companies＝1社1行なので update だけ（同じ→0行・違う→1行）
 *   ② 従業員の 道（anon で RPC save_nencho_decl／save_emp_profile を 呼ぶ）＝insert→1行・違う 中身→1行・nen=年・yakuwari=anon
 *   ③ 誰が・どのアプリ：dare=ログインの uid・yakuwari・app（頭 x-rk-app）。頭が 壊れていても 記録は 残る（app=null）
 *   ④ 読むだけ：自社は 見える・他社は 0行・anon は 読めない・authenticated の insert/update/delete は 拒まれる
 *
 * ★何も 残さない★ 1つの 問い合わせを begin … rollback で 包む（記録の 行も 一緒に 消える）。
 *   役と JWT は set local role ＋ set_config('request.jwt.claims') で 真似る（PostgREST が する事と 同じ）。
 * ★向き先★ test の 倉庫を 指す repo だけ（本番・不明は 触らない）。鍵が 無い GitHub は 未測定で 0・手元は 止める。
 *   入口は _souko-kazoeru の toiawase() 1本（門 souko-mon）。
 * ★旧コード（記録の 表・引き金 無し）では 赤★＝流す前に 回して 確かめる。
 */
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let env = null;
try { const { repoEnv } = await import('../../scripts/repo-env.mjs'); env = repoEnv(ROOT); } catch (e) { env = null; }
if (env !== 'test') {
  if (env == null && String(process.env.GITHUB_ACTIONS || '') !== 'true') { console.log('✗ ★向き先が 分からない＝倉庫を 触らない・手元は 止める★'); process.exit(1); }
  console.log('🟡 ★未測定★ test の 倉庫を 指す repo では 無い（' + (env || '不明') + '）'); process.exit(0);
}
const { toiawase } = await import('./_souko-kazoeru.mjs');
{
  const probe = await toiawase('select 1 as x');
  if (!probe.ok) {
    if (String(process.env.GITHUB_ACTIONS || '') === 'true') { console.log('🟡 ★未測定★ GitHub には 倉庫の 鍵が 無い'); process.exit(0); }
    console.log('✗ ★倉庫に 問えない（' + (probe.naze || '') + '）＝手元で 黙って 抜けさせない★'); process.exit(1);
  }
}
const qs = (v) => "'" + String(v).replace(/'/g, "''") + "'";
let pass = 0, fail = 0;
const kekka = (ok, na, naze) => { if (ok) { pass++; console.log('  ✓ ' + na); } else { fail++; console.log('  ✗ ' + na + (naze ? ' … ' + naze : '')); } };

const uidRow = await toiawase("select id::text uid from auth.users where email='test@test.com'");
const UID = uidRow.ok && uidRow.gyo[0] && uidRow.gyo[0].uid;
if (!UID) { console.log('✗ 試験の 会社（test@test.com）が 見つからない'); process.exit(1); }
const TANIN = '00000000-0000-4000-8000-0000000000aa';

const yaku = (role, sub, app) => "select set_config('request.jwt.claims', " + qs(JSON.stringify(sub ? { sub, role } : { role })) + ', true), '
  + "set_config('request.headers', " + qs(app == null ? '{}' : app) + ', true); set local role ' + role + '; ';
const MIRU = (gyou) => "reset role; select coalesce(json_agg(json_build_object('hyou',hyou,'sousa',sousa,'kawatta',kawatta,'emp',employee_id,'ym',ym,'nen',nen,"
  + "'dare',dare,'yakuwari',yakuwari,'app',app,'mae',mae is not null,'ato',ato is not null) order by id), '[]'::json) j from kyuyo.pay_rireki where gyou_id = " + qs(gyou) + '; ';
async function batch(body) {
  const r = await toiawase('begin; ' + body + ' rollback;');
  if (!r.ok) return { err: String(r.naze || 'error') };
  const j = r.gyo && r.gyo[0] && r.gyo[0].j;
  return { rows: typeof j === 'string' ? JSON.parse(j) : (j || []) };
}
const katachi = (rows) => rows.map((x) => x.sousa + (x.kawatta && x.kawatta.length ? '[' + x.kawatta.join(',') + ']' : '')).join(' ');
const APP = '{"x-rk-app":"kyuyo"}';

console.log('\n[rireki-live] 給与の 直しの 記録が 6本の 表で 残るか（試験の 倉庫・rollback で 何も 残さない）');

/* ── ① ログインした 人の 道 ── */
const rid = (p) => 'zrk' + p + '-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex');
{
  const id = rid('e');
  const r = await batch(yaku('authenticated', UID, APP)
    + 'insert into public.pay_employees (id, account_id, sort, data) values (' + qs(id) + ', ' + qs(UID) + ", 9999, '{\"id\":\"" + id + "\",\"name\":\"a\",\"furiAccount\":\"1\"}'); "
    + 'update public.pay_employees set updated_at = now() where id = ' + qs(id) + '; '
    + 'insert into public.pay_employees (id, account_id, sort, data) values (' + qs(id) + ', ' + qs(UID) + ", 9999, '{\"furiAccount\":\"1\",\"name\":\"a\",\"id\":\"" + id + "\"}') "
    + 'on conflict (id) do update set data = excluded.data, sort = excluded.sort, updated_at = now(); '
    + "update public.pay_employees set data = data || '{\"name\":\"b\"}' where id = " + qs(id) + '; '
    + 'delete from public.pay_employees where id = ' + qs(id) + '; ' + MIRU(id));
  const rows = r.rows || [];
  const k = katachi(rows);
  kekka(!r.err && k === 'insert update[data.name] delete', 'pay_employees … insert・空更新0・全員upsert0・名前の 直し・delete ＝ ' + (r.err || k), r.err);
  kekka(rows.length === 3 && rows.every((x) => x.emp === id && x.dare === UID && x.yakuwari === 'authenticated' && x.app === 'kyuyo'),
    'pay_employees … employee_id は id・dare=ログイン・yakuwari・app=kyuyo', JSON.stringify(rows[0] || {}).slice(0, 160));
  kekka(rows.length === 3 && rows[0].ato && !rows[0].mae && rows[1].mae && rows[1].ato && rows[2].mae && !rows[2].ato, 'pay_employees … mae/ato の 有る無しが insert/update/delete に 合う');
}
{
  const id = rid('p');
  const r = await batch(yaku('authenticated', UID, APP)
    + 'insert into public.pay_payslips (id, account_id, ym, employee_id, data) values (' + qs(id) + ', ' + qs(UID) + ", '2026-10', 'zrkEmp', '{\"net\":100,\"tax\":{\"gensen\":1}}'); "
    + 'update public.pay_payslips set updated_at = now() where id = ' + qs(id) + '; '
    + "update public.pay_payslips set data = jsonb_set(data, '{net}', '200') where id = " + qs(id) + '; '
    + 'delete from public.pay_payslips where id = ' + qs(id) + '; ' + MIRU(id));
  const rows = r.rows || [];
  kekka(!r.err && katachi(rows) === 'insert update[data.net] delete' && rows.every((x) => x.ym === '2026-10' && x.emp === 'zrkEmp'),
    'pay_payslips … insert・空更新0・手取りの 直し・delete・ym と 社員 ＝ ' + (r.err || katachi(rows)), r.err);
}
{
  const id = rid('l');
  const r = await batch(yaku('authenticated', UID, APP)
    + 'insert into public.pay_ledger (id, account_id, employee_id, ymd, data) values (' + qs(id) + ', ' + qs(UID) + ", 'zrkEmp', '2026-10-05', '{\"h\":8}'); "
    + 'update public.pay_ledger set updated_at = now() where id = ' + qs(id) + '; '
    + 'update public.pay_ledger set deleted_at = now() where id = ' + qs(id) + '; '
    + 'delete from public.pay_ledger where id = ' + qs(id) + '; ' + MIRU(id));
  const rows = r.rows || [];
  kekka(!r.err && katachi(rows) === 'insert update[deleted_at] delete' && rows.every((x) => x.ym === '2026-10' && x.emp === 'zrkEmp'),
    'pay_ledger … insert・空更新0・★data の 外の 列（deleted_at）の 直しも 残る★・delete・ym は ymd から ＝ ' + (r.err || katachi(rows)), r.err);
}
{
  const r = await batch(yaku('authenticated', UID, APP)
    + 'update public.pay_companies set updated_at = now() where account_id = ' + qs(UID) + '; '
    + 'update public.pay_companies set data = data where account_id = ' + qs(UID) + '; '
    + "update public.pay_companies set data = data || '{\"zrkTest\":1}' where account_id = " + qs(UID) + '; '
    + "reset role; select coalesce(json_agg(json_build_object('sousa',sousa,'kawatta',kawatta) order by id), '[]'::json) j from kyuyo.pay_rireki where hyou = 'pay_companies' and gyou_id = " + qs(UID) + " and at = now(); ");
  const rows = r.rows || [];
  kekka(!r.err && katachi(rows) === 'update[data.zrkTest]', 'pay_companies … 空更新（Exally の 形）0・同じ data 0・設定の 直し 1 ＝ ' + (r.err || katachi(rows)), r.err);
}

/* ── ② 従業員の 道（anon の RPC） ── */
{
  const token = crypto.randomUUID();
  const eid = rid('n');
  const PW = 'rirekiTamesi9';
  const tsukuru = 'insert into kyuyo.pay_employees (id, account_id, sort, data) values (' + qs(eid) + ', ' + qs(UID) + ", 9998, '{}'); "
    + 'insert into kyuyo.pay_meisai_pub (token, account_id, employee_id, init_code, pw_hash, consent_at, fail_count) values ('
    + qs(token) + ', ' + qs(UID) + ', ' + qs(eid) + ', null, crypt(' + qs(PW) + ", gen_salt('bf')), now(), 0); ";
  const r = await batch(tsukuru + yaku('anon', null, '{"x-rk-app":"hub"}')
    + 'select public.save_nencho_decl(' + qs(token) + ', null, ' + qs(PW) + ", 2026, '{\"t\":1}'); "
    + 'select public.save_nencho_decl(' + qs(token) + ', null, ' + qs(PW) + ", 2026, '{\"t\":1}'); "
    + 'select public.save_nencho_decl(' + qs(token) + ', null, ' + qs(PW) + ", 2026, '{\"t\":2}'); "
    + 'select public.save_emp_profile(' + qs(token) + ', null, ' + qs(PW) + ", '{\"addr\":\"x\"}'); "
    + 'select public.save_emp_profile(' + qs(token) + ', null, ' + qs(PW) + ", '{\"addr\":\"y\"}'); " + MIRU(token));
  const rows = r.rows || [];
  const nen = rows.filter((x) => x.hyou === 'pay_nencho_decl'), pro = rows.filter((x) => x.hyou === 'pay_emp_profile');
  kekka(!r.err && katachi(nen) === 'insert update[decl.t]' && nen.every((x) => x.nen === 2026 && x.emp === eid && x.ym == null),
    'pay_nencho_decl（anon の RPC）… 初めて・同じ 中身 0・申告の 直し・nen=2026 ＝ ' + (r.err || katachi(nen)), r.err);
  kekka(!r.err && pro.length === 2 && pro[0].sousa === 'insert' && pro[1].sousa === 'update' && pro[1].kawatta.includes('data.addr'),
    'pay_emp_profile（anon の RPC）… 初めて・届けの 直し ＝ ' + (r.err || katachi(pro)), r.err);
  kekka(rows.length > 0 && rows.every((x) => x.yakuwari === 'anon' && x.dare == null && x.app === 'hub'), '従業員の 道 … yakuwari=anon・dare 無し・app=hub', JSON.stringify(rows[0] || {}).slice(0, 160));
}

/* ── ③ 頭が 壊れていても 記録は 残る・知らない アプリは other ── */
{
  const id = rid('h');
  const r = await batch(yaku('authenticated', UID, 'kowareta{')
    + 'insert into public.pay_employees (id, account_id, sort, data) values (' + qs(id) + ', ' + qs(UID) + ", 9997, '{}'); " + MIRU(id));
  kekka(!r.err && (r.rows || []).length === 1 && r.rows[0].app == null, '頭（request.headers）が 壊れていても 記録は 残る・app=null', r.err || JSON.stringify(r.rows));
  const id2 = rid('h');
  const r2 = await batch(yaku('authenticated', UID, '{"x-rk-app":"' + 'z'.repeat(500) + '"}')
    + 'insert into public.pay_employees (id, account_id, sort, data) values (' + qs(id2) + ', ' + qs(UID) + ", 9997, '{}'); " + MIRU(id2));
  kekka(!r2.err && (r2.rows || []).length === 1 && r2.rows[0].app === 'other', '知らない アプリ名（500字）は other に 丸める', r2.err || JSON.stringify(r2.rows));
}

/* ── ④ 読むだけ ── */
{
  const id = rid('y');
  const ins = 'insert into public.pay_employees (id, account_id, sort, data) values (' + qs(id) + ', ' + qs(UID) + ", 9996, '{}'); ";
  const r = await batch(yaku('authenticated', UID, APP) + ins
    + "select json_build_object('jisha', (select count(*) from public.pay_rireki where gyou_id = " + qs(id) + ')) j; ');
  kekka(!r.err && r.rows && r.rows.jisha === 1, '自社の 記録は 窓 public.pay_rireki で 見える（1行）', r.err || JSON.stringify(r.rows));
  const r2 = await batch(yaku('authenticated', UID, APP) + ins
    + "select set_config('request.jwt.claims', " + qs(JSON.stringify({ sub: TANIN, role: 'authenticated' })) + ', true); '
    + "select json_build_object('n', (select count(*) from public.pay_rireki where gyou_id = " + qs(id) + ')) j; ');
  kekka(!r2.err && r2.rows && r2.rows.n === 0, '★他社の ログインからは 0行★', r2.err || JSON.stringify(r2.rows));
  for (const [na, stmt] of [
    ['anon は 読めない', yaku('anon', null, null) + 'select count(*) from public.pay_rireki; '],
    ['authenticated の insert は 拒まれる', yaku('authenticated', UID, APP) + "insert into public.pay_rireki (account_id, hyou, sousa) values (" + qs(UID) + ", 'x', 'insert'); "],
    ['authenticated の update は 拒まれる', yaku('authenticated', UID, APP) + "update kyuyo.pay_rireki set hyou = 'x'; "],
    ['authenticated の delete は 拒まれる', yaku('authenticated', UID, APP) + 'delete from kyuyo.pay_rireki; '],
    ['authenticated は 関数を 直に 呼べない', yaku('authenticated', UID, APP) + 'select kyuyo.pay_rireki_kaku(); '],
  ]) {
    const x = await toiawase('begin; ' + stmt + ' rollback;');
    const naze = String((x && x.naze) || '');
    kekka(!x.ok && /permission denied|42501/i.test(naze), na + '（' + (x.ok ? '★通った★' : naze.slice(0, 60)) + '）');
  }
}

console.log('\nrireki-live: ✓' + pass + ' ✗' + fail);
if (fail) process.exitCode = 1;
