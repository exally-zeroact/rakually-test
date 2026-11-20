-- ════════════════════════════════════════════════════════════════════════
-- 給与の 直しの 記録（誰が・いつ・何を 直したか）— ★足すだけ・消せない・直せない★
--   見本＝zeimally/supabase/migrations/0001_zeimally.sql の zeimally.rireki（作りを 揃えた・写しではない）
--
--   ★このファイルは 新しい 表1つ・関数1つ・引き金6本・窓1つを 作るだけ。
--     給与の 表の 中身・列・計算・出力には 1字も 触らない（引き金は after＝保存の 値を 変えない）。
--   ★流すのは scripts/nagasu-rireki.mjs だけ（流す前後を 数える・supabase/NAGASHITA.md に 残す）。
--     本番の 倉庫へは ★司さんの 一言の 後★。
--
--   残す 表（6本）＝給与を 直した 事に なる 物：
--     pay_companies（会社の 設定）・pay_employees（社員の 台帳）・pay_payslips（月の 明細の 数）・
--     pay_ledger（日々の 記録＝給与の 計算の 元）・pay_nencho_decl（年調の 申告）・pay_emp_profile（本人の 届け）
--   外した 表と 訳：
--     statutory＝全社 共通の 法定の 数（account_id 無し・管理だけが 書く・出典と NAGASHITA が 別に 在る）
--     pay_meisai_pub＝明細の 鍵（pw_hash・init_code を 写さない）／pay_meisai_docs＝配った 明細の 差し替え
--     payslip_batches＝public の 古い 表（書き口 0）／pay_org・pay_partners・pay_invoices・pay_receipts＝請求書の 側
--
--   ★保存を 止めない★：記録が 書けない時は warning で 抜ける（給与の 保存が 落ちる 方が 客に 重い）。
--     その代わり tests/rireki-live.mjs が 6本 それぞれで「書けた」を 数える。
-- ════════════════════════════════════════════════════════════════════════

create table if not exists kyuyo.pay_rireki (
  id          bigint generated always as identity primary key,
  account_id  uuid not null,
  hyou        text not null,
  gyou_id     text,
  employee_id text,
  ym          text,
  nen         integer,
  sousa       text not null check (sousa in ('insert', 'update', 'delete')),
  kawatta     text[] not null default '{}',
  mae         jsonb,
  ato         jsonb,
  dare        uuid,
  yakuwari    text,
  app         text,
  at          timestamptz not null default now()
);
create index if not exists pay_rireki_account_at on kyuyo.pay_rireki (account_id, at desc);
create index if not exists pay_rireki_account_emp_ym on kyuyo.pay_rireki (account_id, employee_id, ym);

create or replace function kyuyo.pay_rireki_kaku() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  r jsonb;
  k text;
  ks text[] := '{}';
  emp text;
  ymv text;
  appv text;
begin
  begin
    r := coalesce(n, o);
    -- ★同じなら 書かない★（updated_at だけの 空更新・全員 upsert で 中身が 同じ 行）
    if tg_op = 'UPDATE' and (n - 'updated_at') = (o - 'updated_at') then
      return null;
    end if;

    -- 何が 変わったか：一番上の 列の 名＋jsonb の 列（data / decl）は 中の 一番上の キーを 'data.x' で
    if tg_op = 'UPDATE' then
      for k in select key from jsonb_object_keys(n - 'updated_at') key loop
        if (n -> k) is distinct from (o -> k) then
          if k in ('data', 'decl') and jsonb_typeof(n -> k) = 'object' and jsonb_typeof(o -> k) = 'object' then
            ks := ks || array(
              select k || '.' || x from (
                select jsonb_object_keys(n -> k) x union select jsonb_object_keys(o -> k)
              ) u where (n -> k -> x) is distinct from (o -> k -> x) order by 1);
          else
            ks := ks || k;
          end if;
        end if;
      end loop;
    end if;

    emp := case when tg_table_name = 'pay_employees' then r ->> 'id' else r ->> 'employee_id' end;
    ymv := coalesce(r ->> 'ym', case when r ? 'ymd' then left(r ->> 'ymd', 7) end);

    -- どのアプリか（要求の 頭 x-rk-app＝自己申告＝★参考値・判定には 使わない★）。読めなくても 記録は 残す
    begin
      appv := nullif(current_setting('request.headers', true), '')::json ->> 'x-rk-app';
    exception when others then
      appv := null;
    end;
    if appv is not null and appv not in ('kyuyo', 'seikyu', 'hub') then appv := 'other'; end if;

    insert into kyuyo.pay_rireki (account_id, hyou, gyou_id, employee_id, ym, nen, sousa, kawatta, mae, ato, dare, yakuwari, app)
    values ((r ->> 'account_id')::uuid, tg_table_name,
            coalesce(r ->> 'id', r ->> 'token', r ->> 'account_id'),
            emp, ymv, (r ->> 'year')::integer, lower(tg_op), ks, o, n,
            auth.uid(), auth.role(), appv);
  exception when others then
    raise warning 'pay_rireki_kaku: 記録を 書けなかった（%・%）: %', tg_table_name, tg_op, sqlerrm;
  end;
  return null;
end $$;

revoke all on function kyuyo.pay_rireki_kaku() from public, anon, authenticated;

drop trigger if exists rireki_pay_companies on kyuyo.pay_companies;
create trigger rireki_pay_companies after insert or update or delete on kyuyo.pay_companies for each row execute function kyuyo.pay_rireki_kaku();
drop trigger if exists rireki_pay_employees on kyuyo.pay_employees;
create trigger rireki_pay_employees after insert or update or delete on kyuyo.pay_employees for each row execute function kyuyo.pay_rireki_kaku();
drop trigger if exists rireki_pay_payslips on kyuyo.pay_payslips;
create trigger rireki_pay_payslips after insert or update or delete on kyuyo.pay_payslips for each row execute function kyuyo.pay_rireki_kaku();
drop trigger if exists rireki_pay_ledger on kyuyo.pay_ledger;
create trigger rireki_pay_ledger after insert or update or delete on kyuyo.pay_ledger for each row execute function kyuyo.pay_rireki_kaku();
drop trigger if exists rireki_pay_nencho_decl on kyuyo.pay_nencho_decl;
create trigger rireki_pay_nencho_decl after insert or update or delete on kyuyo.pay_nencho_decl for each row execute function kyuyo.pay_rireki_kaku();
drop trigger if exists rireki_pay_emp_profile on kyuyo.pay_emp_profile;
create trigger rireki_pay_emp_profile after insert or update or delete on kyuyo.pay_emp_profile for each row execute function kyuyo.pay_rireki_kaku();

-- ★読むだけ★：自社の 行だけ select。insert/update/delete の 口（policy）は 作らない＋権限も 消す
alter table kyuyo.pay_rireki enable row level security;
drop policy if exists pay_rireki_yomu on kyuyo.pay_rireki;
create policy pay_rireki_yomu on kyuyo.pay_rireki for select to authenticated using (account_id = auth.uid());
revoke all on table kyuyo.pay_rireki from public, anon, authenticated;
grant select on table kyuyo.pay_rireki to authenticated;

create or replace view public.pay_rireki with (security_invoker = true) as
  select id, account_id, hyou, gyou_id, employee_id, ym, nen, sousa, kawatta, mae, ato, dare, yakuwari, app, at
  from kyuyo.pay_rireki;
revoke all on table public.pay_rireki from public, anon, authenticated;
grant select on table public.pay_rireki to authenticated;
