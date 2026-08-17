/* sql-guard.test.mjs — ★倉庫に当てる前の門番を、わざと危ない物を食わせて確かめる★
 *
 * 倉庫には Kyually本番 / Exally / 代行請求 / 飲み屋 / アマかせ の実データが同居している。
 * 「当てる道具」を持つなら、★門番が本当に止めるか★を実測しておかないと持ってはいけない。
 *
 * ここで見る物:
 *   ① 本物の設計図(supabase/schema-seikyu.sql)は通る
 *   ② ★消す系・他の棚・部屋なし・security_invoker 抜け・本番の名前★ は全部 止まる
 *   ③ 検査が空振りしていない（実際に本物のファイルを読んで数えている）
 *
 * 使い方: node seikyu/tests/sql-guard.test.mjs
 *         node seikyu/tests/sql-guard.test.mjs --self-test
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspect, stripComments, ALLOWED_TABLES, PROD_WAREHOUSE_REF } from '../../scripts/seikyu-sql-guard.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SQL_PATH = path.join(ROOT, 'supabase/schema-seikyu.sql');

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (v, m) => { if (!v) throw new Error(m || 'false'); };
const blocked = (sql, word) => {
  const r = inspect(sql);
  if (r.ok) throw new Error('通ってしまった: ' + sql.slice(0, 70));
  if (word && !r.reasons.join(' ').includes(word)) throw new Error('理由に「' + word + '」が無い: ' + r.reasons.join(' / '));
};

/* ── self-test：門番そのものが空振りしていないか ───────────────────── */
if (process.argv.includes('--self-test')) {
  console.log('\n[sql-guard --self-test] 門番が空振りしていないか');
  let sp = 0, sf = 0;
  const S = (n, fn) => { try { fn(); sp++; console.log('  ✓ ' + n); } catch (e) { sf++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };

  S('★本物の設計図が「通る」と言えている（何を食わせても止めるだけの門番ではない）', () => {
    const r = inspect(fs.readFileSync(SQL_PATH, 'utf8'));
    if (!r.ok) throw new Error('本物が止められた: ' + r.reasons.join(' / '));
    if (!r.stats.objects.length) throw new Error('棚を1つも数えていない＝空振り');
  });

  S('★コメントの中の文字では判断していない（コメントに drop table と書いても通る）', () => {
    const sql = fs.readFileSync(SQL_PATH, 'utf8') + '\n-- ここは説明: drop table は禁止です\n';
    const r = inspect(sql);
    if (!r.ok) throw new Error('コメントの文字で止めてしまった: ' + r.reasons.join(' / '));
    if (/drop\s+table/i.test(stripComments('-- drop table x'))) throw new Error('コメントを外せていない');
  });

  S('★門番を外すと（危ない物が通るように）なることを確認＝検査が効いている', () => {
    const r = inspect('drop table kyuyo.pay_invoices;');
    if (r.ok) throw new Error('drop table が通った');
  });

  console.log('\n[self-test] ' + sp + ' passed, ' + sf + ' failed');
  process.exit(sf ? 1 : 0);
}

/* ── 本番の検査 ───────────────────────────────────────────────── */
console.log('\n[sql-guard] 倉庫に当てる前の門番');

T('★本物の設計図(supabase/schema-seikyu.sql)は通る', () => {
  ok(fs.existsSync(SQL_PATH), '設計図が無い');
  const r = inspect(fs.readFileSync(SQL_PATH, 'utf8'));
  ok(r.ok, '止められた: ' + r.reasons.join(' / '));
  console.log('     実測: 触る物 ' + r.stats.objects.length + '個 = ' + r.stats.objects.join(', '));
  console.log('     実測: 窓口(view) ' + r.stats.views + '個 / ' + r.stats.bytes + 'バイト');
  ok(r.stats.objects.length >= 5, '数えている物が少なすぎる（空振り）');
  ok(r.stats.views === 2, '窓口が2つでない: ' + r.stats.views);
});

T('★消す系は全部 止まる（1本でも混ざれば1文字も当てない）', () => {
  blocked('drop table kyuyo.pay_invoices;', 'drop table');
  blocked('drop schema kyuyo cascade;', 'drop schema');
  blocked('truncate kyuyo.pay_invoices;', 'truncate');
  blocked('delete from kyuyo.pay_invoices;', 'delete from');
  blocked('update kyuyo.pay_invoices set no = \'x\';', 'update');
  blocked('alter table kyuyo.pay_invoices drop column no;', 'drop column');
  blocked('alter table kyuyo.pay_invoices drop constraint pay_invoices_no_ck;', 'drop constraint');
  blocked('drop index uq_pay_invoices_no;', 'drop index');
  blocked('insert into kyuyo.pay_invoices (id) values (\'x\');', 'insert into');
  blocked('drop view public.pay_invoices;', 'drop view');
});

T('★冪等のために要る drop policy / drop trigger は通る（消す系と混同しない）', () => {
  const r = inspect('drop policy if exists own_pay_invoices on kyuyo.pay_invoices;\n'
    + 'drop trigger if exists trg_pay_invoices_freeze on kyuyo.pay_invoices;');
  ok(r.ok, '冪等の書き方が止められた: ' + r.reasons.join(' / '));
});

T('★許していない棚・部屋は止まる（他のアプリのデータに触らせない）', () => {
  blocked('create table if not exists kyuyo.pay_employees (id text primary key);', 'pay_employees');
  blocked('alter table daikou.meisai add column x text;', 'daikou');
  blocked('alter table castally.nomiya_sales add column x text;', 'castally');
  blocked('create table if not exists public.exally_entitlements (id text primary key);', 'exally_entitlements');
  blocked('grant select on kyuyo.pay_payslips to authenticated;', 'pay_payslips');
});

T('★部屋を書き忘れた create は止まる（public にこぼれる）', () => {
  blocked('create table if not exists pay_invoices (id text primary key);', '部屋の指定');
  blocked('create or replace view pay_invoices as select 1;', '部屋の指定');
});

T('★窓口に security_invoker = true が無ければ止まる（★命綱★）', () => {
  blocked('create or replace view public.pay_invoices as select * from kyuyo.pay_invoices;', 'security_invoker');
  blocked('create or replace view public.pay_invoices with (security_barrier = true) as select * from kyuyo.pay_invoices;', 'security_invoker');
  // false と書いた時も止まる
  blocked('create or replace view public.pay_invoices with (security_invoker = false) as select * from kyuyo.pay_invoices;', 'security_invoker');
  // true なら通る
  ok(inspect('create or replace view public.pay_invoices with (security_invoker = true) as select * from kyuyo.pay_invoices;').ok, 'true が止められた');
});

T('★本番倉庫の名前が混ざっていたら止まる', () => {
  blocked('-- ' + PROD_WAREHOUSE_REF + '\ncreate schema if not exists kyuyo;', PROD_WAREHOUSE_REF);
});

T('★security definer（持ち主の権利で動く）は止まる', () => {
  blocked('create function kyuyo.pay_invoices_freeze() returns trigger language plpgsql security definer as $$ begin return new; end $$;', 'security definer');
});

T('★空・null を黙って通さない', () => {
  ok(!inspect('').ok); ok(!inspect(null).ok); ok(!inspect('   ').ok);
});

T('★許した棚の名前は、設計図に実際に出てくる（一覧が飾りになっていない）', () => {
  const sql = fs.readFileSync(SQL_PATH, 'utf8');
  for (const t of ALLOWED_TABLES) ok(sql.includes('kyuyo.' + t), '許可一覧にあるのに設計図に無い: ' + t);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
