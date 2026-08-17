-- ════════════════════════════════════════════════════════════════════════
-- Exally スイート共通の棚（E0）— 倉庫は既存の共有プロジェクト「Exally」(tnfwipbgfgjaymlszeid)
--   契約の一次情報 = docs/SPEC_shared_schema.md（v2・実Supabase実測反映）
--
--   ★このファイルは「新規テーブル3つを作るだけ」。既存テーブル/既存データには一切触らない。★
--     既存(触らない): pay_companies / pay_employees / pay_payslips / exally_entitlements /
--                     exally_admins / statutory / pay_meisai_* / pay_nencho_decl / pay_emp_profile
--                     ＋ 代行請求の棚(companies/meisai/issuer/payments/export_tokens)
--   ★冪等（create if not exists / drop policy if exists）＝何度実行しても安全。
--   適用方法: Supabase ダッシュボード > SQL Editor に貼って Run（1回）。
--
--   新規:
--     pay_org      ... 自社情報の共有マスタ(屋号/住所/インボイス番号/印影/事業一覧)
--                    ※ pay_companies は Kyually が data を丸ごと上書きするため共有不可
--                       (payslip-app/js/store.js:73,95 + app.js:3036 で実測)→ 別テーブルにする
--     pay_partners ... 取引先マスタ(請求/見積の源)
--     pay_ledger   ... 日次/期間台帳(人×日付×{売上/時間/金額}) ＝ 二度手間解消の実体・E2の中核
--
--   共通方針: account_id = auth.uid() + RLS 本人のみ（既存 pay_* と同方式）。
--             お金の記録はソフト削除(deleted_at)＝物理削除しない。
-- ════════════════════════════════════════════════════════════════════════

-- ── 自社情報（スイート共有マスタ・1アカウント1行） ─────────────────────────
--   data 例:
--     { yago:'', addr:'', tel:'', invoiceNo:'', sealDataUrl:'',
--       businesses:[{id:'',name:''}] }   -- businesses = 横断集計(E5)のグループ源
create table if not exists pay_org (
  account_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ── 取引先マスタ ───────────────────────────────────────────────────────
--   data 例: { name:'', keisho:'御中', addr:'', invoiceNo:'', furi:{...}, lastPrices:{...} }
create table if not exists pay_partners (
  id         text primary key,                    -- アプリ生成 'pt_...'
  account_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sort       int  default 0,
  data       jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,                         -- ソフト削除(読み側は is null で絞る)
  updated_at timestamptz not null default now()
);
create index if not exists idx_pay_partners_acct on pay_partners(account_id, sort);

-- ── 日次/期間台帳 ─────────────────────────────────────────────────────
--   ★人×日付に「複数行」を許す（1日に何本も＝代行の実態。1日1行に縛ると入らない）
--   ★列名は ymd（date はSQLの型名と衝突してクォートが要る＝事故の元。既存の birthYmd 等とも揃う）
--   data 例: { uriage:0, minutes:0, amount:0, count:0, business:'', memo:'' }
--            business は行で上書き可(未設定なら従業員マスタの business を既定に)
create table if not exists pay_ledger (
  id          text primary key,                   -- アプリ生成 'lg_...'
  account_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  employee_id text not null,                      -- pay_employees.id
  ymd         date not null,                      -- 実績の日付
  data        jsonb not null default '{}'::jsonb,
  deleted_at  timestamptz,                        -- ソフト削除(お金の記録は物理削除しない)
  updated_at  timestamptz not null default now()
);
create index if not exists idx_pay_ledger_acct_ymd on pay_ledger(account_id, ymd);
create index if not exists idx_pay_ledger_acct_emp on pay_ledger(account_id, employee_id, ymd);

-- ── RLS: 本人(account_id = auth.uid())の行だけ（既存 pay_* と同方式） ──────
alter table pay_org      enable row level security;
alter table pay_partners enable row level security;
alter table pay_ledger   enable row level security;

drop policy if exists own_pay_org on pay_org;
create policy own_pay_org on pay_org for all
  using (account_id = auth.uid()) with check (account_id = auth.uid());

drop policy if exists own_pay_partners on pay_partners;
create policy own_pay_partners on pay_partners for all
  using (account_id = auth.uid()) with check (account_id = auth.uid());

drop policy if exists own_pay_ledger on pay_ledger;
create policy own_pay_ledger on pay_ledger for all
  using (account_id = auth.uid()) with check (account_id = auth.uid());

-- ── 確認用（適用後に SQL Editor で実行すると3行返る） ──────────────────────
-- select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename in ('pay_org','pay_partners','pay_ledger');
