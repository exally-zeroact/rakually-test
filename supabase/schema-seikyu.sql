-- ════════════════════════════════════════════════════════════════════════
-- 請求書（Kyually の中の機能）の棚 — ★部屋は kyuyo（給与と同じ部屋）★
--   契約の一次情報 = docs/SPEC_seikyu_data.md
--
--   ★このファイルは「新規テーブル2つを作るだけ」。既存テーブル/既存データには一切触らない。★
--     使い回す(触らない): kyuyo.pay_partners（取引先マスタ）/ kyuyo.pay_org（自社情報）
--       ※ docs/SPEC_shared_schema.md §4 に「pay_partners の用途＝請求・見積」と既に書いてある。
--          取引先の棚を新設しない＝二重管理を作らない。
--     触らない: pay_companies / pay_employees / pay_payslips / pay_ledger /
--               exally_entitlements / exally_admins / statutory / 代行請求の棚(daikou.*)
--
--   新規:
--     kyuyo.pay_invoices ... ★請求書1通＝1行★（代行請求に「請求書という物」が無かったので作る）
--                            見積書も同じ棚（doc_type='quote'）＝後から足せる形
--     kyuyo.pay_receipts ... ★入金1回＝1行★（分けて払われても全部残る）
--
--   ★冪等（create if not exists / drop ... if exists）＝何度実行しても安全。
--   ★当てるのはテスト線(khawdrnvssdenumbiwfg)だけ。本番は司さんの一言があってから。
--     適用: node scripts/apply-seikyu-schema.mjs   （門番つき。消す系が混じったら1文字も当てない）
-- ════════════════════════════════════════════════════════════════════════

create schema if not exists kyuyo;
grant usage on schema kyuyo to authenticated;

-- ────────────────────────────────────────────────────────────────────────
-- ① 請求書 / 見積書（1通＝1行）
-- ────────────────────────────────────────────────────────────────────────
--   lines 例（1行）:
--     { "no":1, "name":"運転業務委託料", "qty":1, "unit":"式", "price":1100,
--       "amount":1100, "rate":10, "memo":"" }
--     ★rate は % の数（10 / 8 / 0）。0＝消費税がかからない行。
--     ★amount は円の整数＝紙に出る数字そのもの。
--   totals 例:
--     { "subtotal":2000, "taxTotal":180, "grandTotal":2180,
--       "byRate":[{"pct":10,"base":1000,"tax":100},{"pct":8,"base":1000,"tax":80}],
--       "exempt":{"base":0}, "hasReduced":true }
--     ★税率ごとに1回だけ丸めた結果（国税庁の定め）。行ごとの税額から合計を作らない。
--   snapshot 例:
--     { "at":"…", "partner":{…}, "org":{…}, "totals":{…}, "byRate":[…], "templateId":"std1" }
--     ★発行した時の宛先・自社情報・様式の写し。
--       これが無いと「取引先を消したら一覧が空欄」「マスタを直したら過去の紙が変わる」が起きる。
create table if not exists kyuyo.pay_invoices (
  id          text primary key,                  -- アプリ生成 'iv_…'
  account_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  doc_type    text not null default 'invoice',   -- 'invoice' | 'quote'（見積は後から）
  no          text not null,                     -- 人が見る番号（★二度使わない★）
  partner_id  text not null default '',          -- kyuyo.pay_partners.id（名前ではなくidで結ぶ）
  issue_ymd   date not null,
  due_ymd     date,                              -- 支払期限（決めていなければ空。勝手に作らない）
  status      text not null default 'draft',     -- 'draft' | 'issued' | 'void'
  tax_mode    text not null default 'inclusive', -- 'inclusive'(内税) | 'exclusive'(外税)
  rounding    text not null default 'floor',     -- 'floor' | 'ceil' | 'round' ★発行時に凍結
  lines       jsonb not null default '[]'::jsonb,
  totals      jsonb not null default '{}'::jsonb,
  snapshot    jsonb not null default '{}'::jsonb,
  data        jsonb not null default '{}'::jsonb, -- 自由枠（源泉・繰越・備考などを後から足す所）
  template_id text not null default '',           -- 様式。②は 'std1'。③でお店のExcelを指す
  quote_from  text not null default '',           -- ★見積→請求の変換元（見積のid）
  issued_at   timestamptz,
  sent_at     timestamptz,
  voided_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint pay_invoices_doc_type_ck check (doc_type in ('invoice','quote')),
  constraint pay_invoices_status_ck   check (status in ('draft','issued','void')),
  constraint pay_invoices_tax_mode_ck check (tax_mode in ('inclusive','exclusive')),
  constraint pay_invoices_rounding_ck check (rounding in ('floor','ceil','round')),
  constraint pay_invoices_no_ck       check (char_length(no) between 1 and 40),
  -- ★1通1000行の蓋。超えたら赤で止める（黙って切らない）
  constraint pay_invoices_lines_ck    check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) <= 1000),
  -- ★A. 発行済みは消せない。消せるのは下書きだけ（発行済みは void にするだけ＝行は残す）
  constraint pay_invoices_del_ck      check (deleted_at is null or status = 'draft')
);

-- ★★重複を倉庫で止める（画面のチェックだけにしない）★★
--   ・取り消した(void)番号も、ソフト削除した行の番号も ★対象に含める＝二度と使わない★
--     （where 句を付けない＝部分索引にしない。ここが緩むと欠番の再利用が起きる）
--   ・見積と請求は別の系列（doc_type を含める）
create unique index if not exists uq_pay_invoices_no
  on kyuyo.pay_invoices (account_id, doc_type, no);

create index if not exists idx_pay_invoices_acct     on kyuyo.pay_invoices (account_id, issue_ymd desc);
create index if not exists idx_pay_invoices_partner  on kyuyo.pay_invoices (account_id, partner_id);
create index if not exists idx_pay_invoices_status   on kyuyo.pay_invoices (account_id, status);

-- 入金から請求を指すための的（★同じアカウントの請求にしか紐づけられない★）
do $$ begin
  alter table kyuyo.pay_invoices add constraint uq_pay_invoices_acct_id unique (account_id, id);
exception when duplicate_table or duplicate_object then null; end $$;

-- ────────────────────────────────────────────────────────────────────────
-- ② 入金（1回＝1行）
-- ────────────────────────────────────────────────────────────────────────
--   ★代行請求は「会社×月」で1行しか持てず、分けて払われた履歴が消えていた。ここを直す。
--   ★invoice_id は null を許す＝「どの請求か分からない入金」も捨てない（未消込として画面に出す）
--   ★突き合わせの入口は請求番号(invoice_no)。実際の結びつきは invoice_id（番号を直しても迷子にならない）
create table if not exists kyuyo.pay_receipts (
  id          text primary key,                  -- アプリ生成 'rc_…'
  account_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  invoice_id  text,                              -- null 可
  invoice_no  text not null default '',          -- 突き合わせに使った番号（人の手掛かり）
  ymd         date not null,
  amount      integer not null,                  -- 円。マイナス＝返金
  method      text not null default '',          -- 振込 / 現金 / 相殺 など
  memo        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  -- ★0円の入金は記録させない（「入っていない」と「0円入った」を作り分けない）
  constraint pay_receipts_amount_ck check (amount <> 0),
  -- ★他人の請求に入金を付けられない（account_id ごと結ぶ）
  constraint pay_receipts_inv_fk foreign key (account_id, invoice_id)
    references kyuyo.pay_invoices (account_id, id) on update cascade
);
create index if not exists idx_pay_receipts_acct on kyuyo.pay_receipts (account_id, ymd desc);
create index if not exists idx_pay_receipts_inv  on kyuyo.pay_receipts (account_id, invoice_id);

-- ────────────────────────────────────────────────────────────────────────
-- ③ ★発行したら固まる（凍結）★
-- ────────────────────────────────────────────────────────────────────────
--   代行請求の実害:「後から明細を1行直すと、去年 出した請求書の金額が変わる」
--   → 発行済みの行は、紙に出た列を1つも動かせないようにする。
--   ★ここで固める列は seikyu/lib/seikyu-doc.js の FROZEN_FIELDS と同じ★
--     （seikyu/tests/schema-contract.test.mjs が2つを突き合わせて、ズレたら赤にする）
create or replace function kyuyo.pay_invoices_freeze() returns trigger
language plpgsql as $$
begin
  if old.status <> 'draft' then
    if new.doc_type    is distinct from old.doc_type
    or new.no          is distinct from old.no
    or new.partner_id  is distinct from old.partner_id
    or new.issue_ymd   is distinct from old.issue_ymd
    or new.due_ymd     is distinct from old.due_ymd
    or new.tax_mode    is distinct from old.tax_mode
    or new.rounding    is distinct from old.rounding
    or new.lines       is distinct from old.lines
    or new.totals      is distinct from old.totals
    or new.snapshot    is distinct from old.snapshot
    or new.template_id is distinct from old.template_id
    or new.issued_at   is distinct from old.issued_at
    then
      raise exception '発行済みの請求書は直せません（取り消して作り直してください）: no=%', old.no
        using errcode = 'check_violation';
    end if;
    -- ★ここは "is distinct from" を使わない★
    --   固まる列の一覧は「new.X is distinct from old.X」の並びを機械が読んで
    --   lib の FROZEN_FIELDS と突き合わせている（seikyu/tests/schema-contract.test.mjs）。
    --   status は「取り消し」のために変えられる必要がある＝固まる列ではない。
    --   同じ書き方をすると一覧に混ざるので、not null 前提の <> で比べる。
    if new.status <> old.status
       and not (old.status = 'issued' and new.status = 'void') then
      raise exception '発行済みから戻せる先は「取り消し」だけです: no=% (% -> %)', old.no, old.status, new.status
        using errcode = 'check_violation';
    end if;
  end if;
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_pay_invoices_freeze on kyuyo.pay_invoices;
create trigger trg_pay_invoices_freeze before update on kyuyo.pay_invoices
  for each row execute function kyuyo.pay_invoices_freeze();

-- ★発行済みは物理削除もできない（番号を欠番にしない＝台帳に残す）
create or replace function kyuyo.pay_invoices_no_delete() returns trigger
language plpgsql as $$
begin
  if old.status <> 'draft' then
    raise exception '発行済みの請求書は消せません（取り消しにしてください）: no=%', old.no
      using errcode = 'check_violation';
  end if;
  return old;
end $$;

drop trigger if exists trg_pay_invoices_no_delete on kyuyo.pay_invoices;
create trigger trg_pay_invoices_no_delete before delete on kyuyo.pay_invoices
  for each row execute function kyuyo.pay_invoices_no_delete();

create or replace function kyuyo.pay_receipts_touch() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_pay_receipts_touch on kyuyo.pay_receipts;
create trigger trg_pay_receipts_touch before update on kyuyo.pay_receipts
  for each row execute function kyuyo.pay_receipts_touch();

-- ────────────────────────────────────────────────────────────────────────
-- ④ RLS（本人の行だけ・既存 pay_* と同方式）
-- ────────────────────────────────────────────────────────────────────────
alter table kyuyo.pay_invoices enable row level security;
alter table kyuyo.pay_receipts enable row level security;

drop policy if exists own_pay_invoices on kyuyo.pay_invoices;
create policy own_pay_invoices on kyuyo.pay_invoices for all
  using (account_id = auth.uid()) with check (account_id = auth.uid());

drop policy if exists own_pay_receipts on kyuyo.pay_receipts;
create policy own_pay_receipts on kyuyo.pay_receipts for all
  using (account_id = auth.uid()) with check (account_id = auth.uid());

-- ────────────────────────────────────────────────────────────────────────
-- ⑤ 窓口（public の view）★security_invoker = true が命綱★
-- ────────────────────────────────────────────────────────────────────────
--   これが付いていると「呼んだ人の権利」で開く＝実の棚のRLS(本人の行だけ)がそのまま効く。
--   false（既定）だと view の持ち主(postgres)の権利で開き、★全アカウントのデータが見える★。
--   ★新しい部屋の表には Supabase の既定の権限が付かないことがあるので、実の棚にも明示的に grant する。
grant select, insert, update, delete on kyuyo.pay_invoices to authenticated;
grant select, insert, update, delete on kyuyo.pay_receipts to authenticated;

create or replace view public.pay_invoices with (security_invoker = true) as
  select * from kyuyo.pay_invoices;
grant select, insert, update, delete on public.pay_invoices to authenticated;

create or replace view public.pay_receipts with (security_invoker = true) as
  select * from kyuyo.pay_receipts;
grant select, insert, update, delete on public.pay_receipts to authenticated;

-- ────────────────────────────────────────────────────────────────────────
-- 確認用（適用後に実行すると、棚2つ・窓口2つ・security_invoker=true が見える）
-- ────────────────────────────────────────────────────────────────────────
-- select c.relname, c.relrowsecurity, n.nspname
--   from pg_class c join pg_namespace n on n.oid=c.relnamespace
--   where n.nspname='kyuyo' and c.relname in ('pay_invoices','pay_receipts');
-- select c.relname, c.reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace
--   where n.nspname='public' and c.relname in ('pay_invoices','pay_receipts');
