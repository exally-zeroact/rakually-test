# SPEC — 共有データスキーマ契約（E0・スイート共通）**v2（実Supabase実測反映・2026-07-25）**

Kyuallyセッションと Exallyセッションの **"契約"**（同じデータ形で動き、別々のスキーマを作って衝突するのを防ぐ）。
v1（経営セッション発）を、**実Supabase（倉庫 Exally = `tnfwipbgfgjaymlszeid`）と実コードの実測**で改訂した版。改訂点は §10 に一覧。

参照：`reference_payslip_supabase_setup`（倉庫Exally共有／棚アプリ毎独立）。実DDLの一次情報＝`payslip-app/supabase/schema.sql`＋本書の `exally/supabase/schema-exally.sql`。

---

## 0. 原則・完了条件
- **1アカウント（account_id）で全モジュール共有**。倉庫（共有マスタ）＝Exally共有／棚（モジュール固有）＝独立。
- **既存を壊さない**（Kyually現行の pay_employees / pay_companies / pay_payslips / exally_entitlements と互換）。
- **捏造禁止**。本書の記述は実DDL・実コード行番号で裏付ける（§9 の実測ログ参照）。
- DoD：スキーマ実装（Exally）＋Kyuallyの読み書き配線が、**実機で1アカウント越しに繋がる**のを確認 → 見せてOK後push。

---

## 1. アカウント／利用権（既存・稼働中・**変えない**）
- **account_id** = Supabase auth user（1契約=1アカウント）。
- **exally_entitlements**(account_id, app, plan, email, expires_at, note, created_at, updated_at)／PK=(account_id, app)。
  - plan：`trial`（既定=使える）｜`paid`｜`free`｜`disabled`。
  - RLS：本人は**自分の行を読むだけ**／`plan='trial' and expires_at is null` の行だけ自分でinsert可（自己アップグレード不可）／変更は `exally_admins` に居る uid のみ（`is_exally_admin()`）。
  - **app の値を足すだけでアプリを追加できる（DDL変更不要）**。Exallyスイート＝`'suite'`、台帳＝`'ledger'`（暫定・E1で確定）。既存＝`'payslip'` / `'invoice'`。

---

## 2. 従業員マスタ（既存 pay_employees・defEmp互換 ＋ 新フィールド）★実測OK★
- **pay_employees**(id text PK, account_id uuid, sort int, data jsonb, updated_at)。`data` = Kyuallyの `defEmp()` 形（`payslip-app/js/app.js:305`）。
- ★**新規フィールド（data に追加）**：
  | キー | 型 | 既定 | 意味 |
  |---|---|---|---|
  | `employmentType` | `'従業員'` \| `'業務委託'` | `'従業員'` | 雇用形態（K1）。未設定＝`'従業員'` として扱う |
  | `business` | string | `''` | 事業/職種タグ（横断集計・グループ化用。E5） |
  - `dept` / `role` は**既存キーとして残す**（Kyuallyが使用中）。`business` は**別キーで新設**＝意味が違う（`dept`=部署、`business`=事業）ので流用しない。
- **DDL変更は不要**（jsonb への追加）。既存行は未設定のまま＝読み側で既定値を当てる。

### 2-1. ★キー空間の分離（実測に基づく強制ルール）
Kyually は従業員1人を `data` に**丸ごと**書くが、`mergeEmp`＝`Object.assign(defEmp(), x)`（`app.js:35`）が**知らないキーを保持**し、`stripTransient`（`app.js:3035`）も `_` 始まり以外を全部コピーするため、**Exallyが足したキーは Kyually を通しても消えない**（実測確認済み）。その上で：

- **Exally が pay_employees.data に書いてよいキーは `employmentType` / `business` のみ**（allowlist）。それ以外への書き込みは**データ層が例外で拒否する**（実装＝`js/suite-data.js` の `EXALLY_EMP_KEYS`、テストで担保）。
- **`_` 始まりのキーは禁止**（Kyuallyの `stripTransient` が保存時に落とす＝静かに消える）。
- Exally 側の更新は**必ず read-modify-write**（行の `data` を読んで allowlist キーだけ差し替えて書く）。丸ごと置換は禁止。

### 2-2. ★従業員を更新したら pay_companies の updated_at を空更新する（必須）
Kyuallyの競合検知は **pay_companies.updated_at だけ**を見る（`store.js:78-86`）。Exally が pay_employees だけ更新すると Kyually は気づかず、開きっぱなしのタブが**静かに巻き戻す**。
→ Exally は従業員更新のたびに **`pay_companies` の `updated_at` のみを更新**する（`data` は一切触らない）。Kyually 側は既存の「別の端末で更新されました → 最新を読み込みますか」が正しく発火する（新規実装ゼロ・既存機構の再利用）。
※ pay_companies 行が未作成のアカウントでは 0 行更新＝無害（Kyually側 `cloudUA=null` で保存許可のまま）。

---

## 3. 自社情報 ★v1から変更：pay_companies ではなく新テーブル `pay_org`★
### なぜ変えたか（実測）
Kyually の `cloudSaveState` は `state` から `employees` を除いた**全スナップショットを `pay_companies.data` に丸ごと upsert**（`store.js:73,95`）。しかも `snapshot()` は**許可キー方式**（`app.js:3036`）。
→ **Exally が `pay_companies.data` に書いた物は、Kyually の次の保存で必ず消える**（確率ではなく確定）。よって pay_companies は**共有マスタにできない＝Kyually専用の設定置き場**。

### 決定
- **pay_companies は触らない**（例外＝§2-2 の updated_at 空更新のみ）。
- 共有の自社情報は**新テーブル `pay_org`**（account_id PK・1アカウント1行）。
- `data` の形：
  ```
  {
    yago:'', addr:'', tel:'', invoiceNo:'',       // 屋号/住所/電話/インボイス登録番号
    sealDataUrl:'',                                // 印影(dataURL)
    businesses:[{ id:'', name:'' }]                // 事業マスタ(横断集計 E5 のグループ源)
  }
  ```
- **移行**：Kyually の `company.name` / `company.addr` は当面そのまま（二重持ち）。将来 Kyually が `pay_org` を読んで屋号/住所を引く（追加のみ・既存破壊なし）。**今回は移行しない**（勝手にデータを動かさない）。

---

## 4. 取引先マスタ（新規 **pay_partners**）
- **pay_partners**(id text PK, account_id uuid, sort int, data jsonb, deleted_at, updated_at)。
- `data`：名称／敬称／住所／インボイス番号／振込先／過去単価 等（自由・アプリが決める）。
- 用途：請求・見積（**見積→請求ワンタップ**の源）。
- **削除はソフト削除**（`deleted_at` に時刻・物理削除しない）。読み側は `deleted_at is null` で絞る。

---

## 5. 日次/期間台帳（新規 **pay_ledger**）★E2の中核・二度手間解消の源
- **pay_ledger**(id text PK, account_id uuid, employee_id text, **ymd date**, data jsonb, deleted_at, updated_at)。
- ★**v1からの変更**：列名 `date` → **`ymd`**。`date` はSQLの型名と衝突して PostgREST/SQL で毎回クォートが要る（事故の元）。既存アプリの命名（`birthYmd` / `leaveStartYmd`）とも揃う。
- ★**v1からの変更**：**「人×日付＝1行」ではなく、人×日付に複数行を許す**。
  理由＝現場の実態（代行は1日に何本も・司さんのExcelの「売上1/2/3」）。1日1行に縛ると入らない。集計は `ymd` で束ねる。
- ★**`data` のキー（E2で確定・2026-07-26・司さん承認）**
  ```
  { uriage?, minutes?, amount?, count?, business?, memo?, hikazei? }
  ```
  | キー | 型 | 意味・K4での注意 |
  |---|---|---|
  | `uriage` | number | 売上。率で払う代行に必須。**Kyuallyの `dailyEntries` には無い項目** |
  | `minutes` | number | 労働時間を**分**で持つ。★Kyually `dailyEntries.hm` は `"8:30"` の**文字列**＝**K4で変換が要る** |
  | `amount` | number | その日に直接入れた金額 |
  | `count` | number | 件数 |
  | `business` | string | 事業。行に持てる＝同じ人が別事業をやった日を正しく分けられる（未設定なら従業員マスタの `business` が既定） |
  | `memo` | string | メモ |
  | ★`hikazei` | boolean | **非課税**。Kyually `dailyEntries.hikazei` に対応。**★これが無いと K4 で読み替えた時に非課税の区別が落ちて課税額が狂う（お金の間違い）★** 必ず持ち回る |
- **締め方（月まとめ/半月/10日締め/任意N日）で期間集計 → 期間の"実績値" → Kyuallyへ**。
  ★**期間の定義は Kyually `lib/periods.js` が唯一の源**（Exally は同一実装を置き、**全パターン突合テストで赤化**）。
  ★**締め方の設定も Kyually の会社設定（`pay_companies.data.company.shimeMethod` / `shimeN`）が唯一の源**。Exally は**読んで表示するだけ**（設定UIを作らない＝二重管理しない）。
- ★**決め方（率／保障／日額）は Kyually の `lib/pay-rule.js` が唯一の源。Exally は支給額を計算しない**（司さん判断 2026-07-26）。
  複製は「最賃38県ドリフト誤値」と同じ事故クラスのため禁止。Exally が渡すのは**生の実績値**だけ：
  `ctx = { sales, workDays, workMin, count, commission }`（＝`pay-rule.js` がそのまま食う形）＋非課税額。
  **金額が画面に出るのは K4（Kyuallyが台帳を読んで明細にする）完了時**。
- **削除はソフト削除**（`deleted_at`）。**金額の記録＝勝手に物理削除しない**。

---

## 6. 期間/月次の明細・履歴（既存 pay_payslips）★期間分割の契約を確定
- **pay_payslips**(id text PK, account_id, ym text, employee_id text, data jsonb, updated_at)。
- 現行の実 id（`store.js:154`）：月次 `ps_{ym}_{eid}` ／ 賞与 `psb_{ym}_{eid}`。用途は `data.kind`（`'monthly'`｜`'bonus'`・未設定＝monthly扱い）。

### 6-1. ★期間分割（K2）の契約 — そのまま入れると法定帳簿が壊れる（実測）
現行の消費側は全部「**`kind!=='bonus'` なら月次**」という**除外方式**（`app.js:1195,1832,1876,2042,3019` 他）。さらに賃金台帳 `buildLedger` は **`従業員|月` をキーに後勝ちで上書き**（`lib/chingin-daicho.js:19`）。
→ 同じ月に期間行が2件以上あると **1件しか残らない＝労基法108条の賃金台帳が欠落／定時決定（標準報酬月額）・年末調整も過少**。

### 6-2. 決定（両セッションが守る）
1. ★**id（2026-07-26 改訂・司さん承認）**：Kyually の実装 `lib/periods.js`（K2・push済 6954ecb）に合わせる。
   - **分割なし（`shimeMethod='monthly'`）＝ 従来どおり `ps_{ym}_{eid}`（period を付けない）** ＝既存データと完全互換。
   - **分割あり（half/ten/ndays）＝ `ps_{ym}_{Pn}_{eid}`**（例 `ps_2026-07_P1_e1`）。
   - 賞与は `psb_{ym}_{eid}` のまま（期間分割しない）。
   ※v2初版で書いた `M` は**廃止**。理由＝`periods.js` は**分割なしでも key が `'P1'`** で、`M` という値をどこも作らないため（実物照合）。
2. **data に必須追加**：`period`（**`periods.js` が返す key をそのまま**。monthly なら `'P1'`）／`periodFrom`・`periodTo`（`YYYY-MM-DD`）。
   ※ id には period を付けないが data には入れる＝「どの期間の実績か」が行から分かる。
3. **消費側は除外方式（`kind!=='bonus'`）を許可方式（`kind==='monthly' || kind==null`）に変える**。
4. **同一 ym の複数 period は、法定帳簿へ渡す前に合算する**（賃金台帳・定時決定・年調・前月比）。→ **Kyuallyセッション K2 の実装項目**。
5. ★**4 が実装されるまで、Exally は pay_payslips に期間行を書かない**（Exally は pay_ledger のみ）。＝今の帳簿を壊さない。

---

## 7. 集計（横断ビュー・E5）
- `account_id` ＋ `business`（従業員マスタの既定 ＋ pay_ledger 行の上書き）で集計 → **Exally からも Kyually からも見える**。
- 事業の一覧は `pay_org.data.businesses`（§3）。

---

## 8. 契約のルール（両セッションが守る）
- **従業員マスタ ＝ pay_employees（defEmp互換）が唯一の源**。二重に別テーブルを作らない。
- **新テーブル（pay_ledger / pay_partners / pay_org）は Exally E0 が作る**（DDL/RLS）。**Kyually は本契約に従って読み書き**（自前で別スキーマを作らない）。
- **account_id の RLS で他アカウント遮断**（既存 pay_* と同方式）。
- **キー空間の分離**（§2-1）＋ **read-modify-write**＋ **allowlist 強制**＋ **`_` 始まり禁止**。
- **pay_companies は Kyually 専用**（§3）。Exally は updated_at 空更新のみ（§2-2）。
- **金額の記録はソフト削除**（pay_ledger / pay_partners）。物理削除しない。

---

## 9. 【要確認】→ 実測で解消（2026-07-25・anon経由で実棚/実列を実査）
| v1の【要確認】 | 実測結果 |
|---|---|
| 現行の実テーブル名/カラム | pay_companies / pay_employees / pay_payslips / exally_entitlements / exally_admins / statutory / pay_meisai_pub / pay_meisai_docs / pay_nencho_decl / pay_emp_profile ＝**すべて実在・`payslip-app/supabase/schema.sql` と完全一致**。**`payslip_batches` は実在しない**（schema.sql 冒頭の定義は未適用の死んだ定義）。 |
| 期間分割の id/ym 拡張の具体形 | §6-2 で確定（`ps_{ym}_{period}_{eid}`＋合算必須）。 |
| 現行のRLSポリシー | DDL＝`payslip-app/supabase/schema.sql`（`account_id = auth.uid()`／entitlementsは読取専用＋trial限定insert＋admin更新）。実挙動＝**anon で pay_* は0行・statutory のみ1行返る**＝RLSが効いていることを確認。 |
| pay_ledger / pay_partners の最終テーブル名 | `pay_ledger` / `pay_partners` で確定（＋自社情報 `pay_org` を新設＝§3）。 |

---

## 10. v1 → v2 の改訂点（Kyuallyセッションにも影響する）
1. **§3 自社情報：pay_companies → 新テーブル `pay_org`**（pay_companies は丸ごと上書きされるため共有不可＝実測）。
2. **§6-2 期間分割：id 形を確定 ＋「消費側は許可方式に変え、同月の複数期間を合算する」を必須要件化**（現状のままだと賃金台帳が欠ける＝実測）。**合算が入るまで Exally は pay_payslips に書かない**。
3. **§2-2 Exally が従業員を更新したら pay_companies.updated_at を空更新**（Kyuallyの巻き戻し防止）。
4. **§5 pay_ledger：列名 `date`→`ymd`／「人×日付=1行」→複数行可**。
5. **§2-1 Exallyが従業員dataに書けるキーは allowlist（`employmentType`/`business`）のみ・`_`始まり禁止・read-modify-write**。
6. **§4/§5 ソフト削除（`deleted_at`）**。

---

## 10-A. ★Kyuallyセッションへの申し送り（E0実装中に見つけた要確認）

### (a) 期間分割は「合算」まで含めて K2（§6-2）
除外方式→許可方式に変える＋**同月の複数期間を合算してから法定帳簿へ**。合算が入るまで Exally は pay_payslips に書かない。

### (b) ★楽観ロックが毎回誤発火している疑い（未確認・実機で要検証）★
`payslip-app/js/store.js` の競合検知は、保存成功後に **自分がJSで作った文字列**を基準に持つ：
```
store.js:104   lastCompanyUpdatedAt = now;      // now = new Date().toISOString() → "2026-07-25T00:00:00.123Z"
store.js:79    var cloudUA = cur.data.updated_at;  // PostgRESTが返す形
store.js:83    if (cloudUA && cloudUA !== lastCompanyUpdatedAt) → conflict（保存せず警告）
```
**実測（2026-07-25・実Supabaseの statutory を anon で取得）**：PostgREST が返す timestamptz は
`"2026-07-08T10:33:41.104374+00:00"` ＝ **マイクロ秒 ＋ `+00:00`**。JSの `toISOString()` は **ミリ秒 ＋ `Z`**。
→ 同じ時刻でも**文字列としては絶対に一致しない**。

**予想される症状**：1セッション内の **2回目以降の自動保存が毎回 conflict になり、クラウドに保存されない**
（＋「別の端末で更新されました」の確認ダイアログが出る）。読込直後の1回目だけは、基準がクラウド由来の文字列なので通る。

**確認方法（実機）**：ログイン → 何か1文字変える（保存1回目＝成功するはず）→ もう1文字変える（2回目）。
2回目で「⚠ 別の端末で更新されました（クラウド未保存）」が出れば再現。

**直し方（Kyually側の判断）**：基準を**DBが返した値**にする。
`upsert(...).select('updated_at').single()` の戻り値、または保存後に `select('updated_at')` を読み直して
`lastCompanyUpdatedAt` に入れる（JSで作った文字列を基準にしない）。

**Exally側への影響**：§2-2（従業員更新で pay_companies.updated_at を空更新）の仕組み自体は正しいが、
**この不具合が直るまで「Exallyの更新が原因の conflict」と「常時誤発火」を見分けられない**。
E0 の実機確認は (b) の解消後に行う。

---

## 11. 司さん手番
- **DDL の適用**：`exally/supabase/schema-exally.sql` を Supabase ダッシュボードの SQL Editor に貼って1回実行（冪等・再実行OK）。または DB パスワードを渡してもらえれば実装セッションが流す。
  ※ DDL適用は**新規テーブル3つの作成のみ**。既存テーブル・既存データには一切触らない。
- **実機確認用のテストログイン**（メール＋パスワード）：E0の往復テストに必要。新規登録してよいか、既存のどれを使うかは司さんの指示待ち（**指示なくクラウドにアカウント/データを作らない**）。
