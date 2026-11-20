/* rireki-sql-guard.test.mjs — ★直しの 記録の 門番を、わざと 危ない 物を 食わせて 確かめる★
 *   ① 本物の supabase/schema-kyuyo-rireki.sql は 通る（引き金 6本・definer に search_path=''）
 *   ② 消す 系・給与の 表への grant/policy/索引・知らない 引き金・他の 表への insert・security_invoker 抜け は 止まる
 *   ③ --self-test＝門番の 検査を 1つずつ 外した 写しで ② が 赤に なる（空振り していない）
 * 使い方: node tests/rireki-sql-guard.test.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspect, HIKIGANE } from '../scripts/rireki-sql-guard.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SQL = fs.readFileSync(path.join(ROOT, 'supabase/schema-kyuyo-rireki.sql'), 'utf8');

let pass = 0, fail = 0;
const T = (name, fn) => { try { fn(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + ' … ' + e.message); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const blocked = (sql, word) => { const r = inspect(sql); ok(!r.ok, '止まらなかった: ' + sql.slice(0, 80)); ok(r.why.some((w) => w.includes(word)), '止めの訳に「' + word + '」が無い: ' + r.why.join(' / ')); };
const tasu = (extra) => SQL + '\n' + extra;   // ★本物に 1文 足して 止まるか＝本物の 中に 紛れても 見つける★

T('本物の sql は 通る', () => { const r = inspect(SQL); ok(r.ok, r.why.join(' / ')); });
T('本物の sql に 引き金 6本 全部の create が 在る', () => {
  for (const [g, t] of HIKIGANE) ok(new RegExp('create trigger ' + g + ' after insert or update or delete on kyuyo\\.' + t + ' for each row execute function kyuyo\\.pay_rireki_kaku\\(\\)').test(SQL), g);
});
T("本物の 関数は security definer set search_path = ''", () => ok(/security definer set search_path = ''/.test(SQL), 'definer か search_path が 無い'));
T('本物の 窓は security_invoker = true・権限は select だけ', () => {
  ok(/create or replace view public\.pay_rireki with \(security_invoker = true\)/.test(SQL), '窓');
  ok(/revoke all on table kyuyo\.pay_rireki from public, anon, authenticated;/.test(SQL), 'revoke 表');
  ok(/revoke all on table public\.pay_rireki from public, anon, authenticated;/.test(SQL), 'revoke 窓');
  ok(!/grant\s+(insert|update|delete|all)/i.test(SQL), 'select 以外の grant が在る');
});

T('消す 系は 止まる', () => {
  blocked(tasu('drop table kyuyo.pay_rireki;'), 'drop');
  blocked(tasu('truncate kyuyo.pay_rireki;'), 'truncate');
  blocked(tasu('delete from kyuyo.pay_rireki;'), 'delete from');
  blocked(tasu("update kyuyo.pay_payslips set data = '{}';"), 'update');
  blocked(tasu('alter table kyuyo.pay_rireki drop column mae;'), 'drop');
});
T('★給与の 表へ grant・policy・索引・窓を 向けたら 止まる★', () => {
  blocked(tasu('grant select on kyuyo.pay_payslips to anon;'), 'pay_payslips');
  blocked(tasu('create policy x on kyuyo.pay_employees for select using (true);'), 'pay_employees');
  blocked(tasu('create index if not exists x on kyuyo.pay_ledger (id);'), 'pay_ledger');
  blocked(tasu('revoke all on table kyuyo.pay_companies from authenticated;'), 'pay_companies');
});
T('select 以外の grant・知らない 名前・他の 部屋は 止まる', () => {
  blocked(tasu('grant insert on kyuyo.pay_rireki to authenticated;'), 'select 以外');
  blocked(tasu('create table if not exists kyuyo.pay_x (id int);'), 'kyuyo.pay_x');
  blocked(tasu('create table if not exists daikou.x (id int);'), 'daikou.x');
});
T('知らない 引き金・引き金の 抜けは 止まる', () => {
  blocked(tasu('create trigger rireki_pay_invoices after update on kyuyo.pay_invoices for each row execute function kyuyo.pay_rireki_kaku();'), '知らない 引き金');
  blocked(SQL.replace(/create trigger rireki_pay_ledger[^;]*;/, ''), 'rireki_pay_ledger が 無い');
});
T("pay_rireki 以外への insert・search_path の 無い definer・invoker の 無い 窓は 止まる", () => {
  blocked(tasu('create or replace function kyuyo.pay_rireki_kaku() returns trigger language plpgsql as $$ begin insert into kyuyo.pay_payslips values (1); return null; end $$;'), 'insert');
  blocked(SQL.replace("security definer set search_path = ''", 'security definer'), "search_path=''");
  blocked(SQL.replace('with (security_invoker = true) ', ''), 'security_invoker');
});
T('注の 中の 危ない 字では 止まらない（注は 外して 見る）', () => { const r = inspect(SQL + '\n-- drop table kyuyo.pay_payslips; truncate x;\n'); ok(r.ok, r.why.join(' / ')); });

if (process.argv.includes('--self-test')) {
  /* 門番の 本体を 読み、検査を 1つずつ 外した 写しを 作って、上の 止めが 1つでも 赤に なるかを 数える */
  const src = fs.readFileSync(path.join(ROOT, 'scripts/rireki-sql-guard.mjs'), 'utf8');
  const kesu = [
    ['給与の 表は 引き金の 中だけ', /if \(new RegExp\('\\\\bkyuyo\\\\.' \+ t[^\n]*\n/],
    ['grant/revoke の 先', /if \(!\['kyuyo\.pay_rireki', 'public\.pay_rireki', 'kyuyo\.pay_rireki_kaku'\][^\n]*\n/],
    ['policy/index の 先', /if \(m\[1\]\.toLowerCase\(\) !== 'kyuyo\.pay_rireki'\) why\.push\('止め：policy[^\n]*\n/],
    ['引き金の 抜け', /for \(const \[g\] of HIKIGANE\) if \(!creates[^\n]*\n/],
  ];
  const tmpDir = fs.mkdtempSync(path.join(ROOT, 'tests', '.rireki-self-'));
  let akaku = 0, ban = 0;
  try {
    for (const [name, re] of kesu) {
      if (!re.test(src)) { fail++; console.log('  ✗ self-test: 「' + name + '」の 検査が 門番に 見つからない'); continue; }
      const f = path.join(tmpDir, 'g' + (ban++) + '.mjs');   // ★1本ずつ 別の 名前★（同じ 名前だと import が 最初の 写しを 使い回す）
      fs.writeFileSync(f, src.replace(re, '\n'));
      const g = await import('file://' + f.replace(/\\/g, '/'));
      const cases = {
        '給与の 表は 引き金の 中だけ': SQL + '\ngrant select on kyuyo.pay_payslips to anon;',
        'grant/revoke の 先': SQL + '\nrevoke all on table kyuyo.pay_rireki_x from anon;',
        'policy/index の 先': SQL + '\ncreate index if not exists x on kyuyo.pay_rireki_y (id);',
        '引き金の 抜け': SQL.replace(/create trigger rireki_pay_ledger[^;]*;/, ''),
      };
      /* ★守りは 重ねてある★＝別の 検査が 止める事が 在る。だから「その 検査の 止めの 訳」が 本物では 出て、外すと 消えるかで 数える */
      const shirushi = { '給与の 表は 引き金の 中だけ': '引き金 以外で', 'grant/revoke の 先': 'revoke の 先が', 'policy/index の 先': 'policy/index の 先が', '引き金の 抜け': 'rireki_pay_ledger が 無い' }[name];
      const moto = inspect(cases[name]).why.some((w) => w.includes(shirushi));
      const ato = g.inspect(cases[name]).why.some((w) => w.includes(shirushi));
      if (moto && !ato) { akaku++; pass++; console.log('  ✓ self-test: 「' + name + '」を 外すと その 止めが 消える＝その 検査が 効いている'); }
      else { fail++; console.log('  ✗ self-test: 「' + name + '」 本物で 出る=' + moto + '・外して 出る=' + ato); }
    }
  } finally { fs.rmSync(tmpDir, { recursive: true, force: true }); }
}

console.log('\nrireki-sql-guard: ✓' + pass + ' ✗' + fail);
if (fail) process.exitCode = 1;
