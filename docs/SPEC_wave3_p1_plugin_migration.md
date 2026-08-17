# 【★完了 2026-08-01】第3波 P1／P2：22関数を HF プラグインへ移す

> **P2 も同日に完了**（`DOLLAR(旧YEN) / TYPE / AGGREGATE / LENB / LEFTB / RIGHTB / MIDB / RANK(.EQ/.AVG) / VALUETOTEXT / ENCODEURL`）。
> 一致 **306→362**（新設56件すべて一致）／入れ子で答えが変わる式 **27→16**。
> P2で分かった事は §P2 に。以下はまず P1 の記録。

---

# 第3波 P1：11関数を HF プラグインへ移す

作成 2026-08-01 / 対象 `exally-staging` / **実装・検証とも完了**

## 結果（数字）

| | 前 | 後 |
|---|---|---|
| ハーネス 一致 | 253 | **306**（新設53件がすべて一致） |
| 不一致（新規／既知） | 0 / 0 | **0 / 0** |
| 未検証 | 0 | **0** |
| 入れ子で答えが変わる式 | 38 | **27**（baseline 締め直し済み） |

## ★実装で分かった事（設計時に決めていなかった2つ）

### ① INDIRECT は `isVolatile: true` が必須（§4のスパイク結果）

スパイクの実測:

| 返し方 | 値 | 入れ子 | ★参照先(E3)を書き換えた後 |
|---|---|---|---|
| `SimpleRangeValue.onlyRange` | ✗ 使えない | — | — |
| `onlyValues`（volatileなし） | ✓ 正しい | ✓ 正しい | **✗ 古い答えのまま(210)** |
| `onlyValues` + **`isVolatile: true`** | ✓ | ✓ | **✓ 作り直される(3180)** |

- `onlyRange(range, dependencyGraph)` は 2.6.1 では**渡せる範囲オブジェクトを外から作れない**
  （`AbsoluteCellRange` が公開されていない）。非公開クラスに寄りかかるのは版対応が目的のこの作りでは筋が悪いので採らない。
- プラグインは評価時に値を読むだけなので、**参照先は依存グラフに載らない**。
  volatile を付けないと「表示だけ古い」＝一番タチが悪い壊れ方になる。**Excel の INDIRECT も揮発性**なので、
  volatile にするのは回避策ではなく Excel と同じモデルに合わせる事。
- **採用＝プラグイン + `isVolatile: true`**。`_jsSet` には残さない。

**動く範囲（正直に切った線・R17として台帳にも記載）**
- 対応: **同じシートの A1形式**（`INDIRECT("E1")` / `INDIRECT("E1:E6")` / `INDIRECT(B12)`）
- 非対応: `INDIRECT("Sheet1!A1")`（他シート）と R1C1形式（第2引数 FALSE）→ **`#REF!` を返す**。
  黙って違う数字を出さない。他シート参照はシート名→IDの解決に非公開クラスが要るため入れていない。

### ② 半角→全角の関数の本名は `JIS` ではなく **`DBCS`**（実Excelで確認）

- 実測: `.Formula`（US-English構文）に `=JIS(A1)` を入れると **`#NAME?`**。`=DBCS(A1)` は正しく動く。
  **JIS は日本語UIの表示名**で、xlsx の中身も US-English構文も `DBCS`。
- そのため:
  - **入口**（`convertFormula`）で `JIS(` → `DBCS(` に直す＝日本語Excelの癖で JIS と打っても動く
  - **出口**（`xlsx-io.js` の書き出し）でも `JIS(` → `DBCS(`＝**JIS のまま書くと Excel がその式を `#NAME?` にする**
  - 見張りは `tests/xlsx-harness/alias.test.mjs`（7項目）
- ケースIDは `JIS_*` をやめて `DBCS_*` にした。

### ③ `LOOKUP_text` は昇順のデータに変えた

`D1:D6` は `A,B,A,C,B,A` で昇順でない。Microsoft は
「lookup_vector が昇順でない場合、正しい値を返さないことがある」と明記＝**未定義動作**。
二分探索の実装差まで合わせても意味がないので、`=LOOKUP("B",{"A","B","C"},{100,200,300})` に変更した（真値 200）。

---

## 以下は着手前の設計（記録として残す）

## 0. なぜやるか（1行）

`_jsSet` に残っている関数は**式の一番外側でしか効かない**。`=ROUND(LOOKUP(...),0)` のように入れ子で使われると
HyperFormula の答え（多くは `#NAME?`）に戻る＝**表示だけ正しくて参照先が間違う**。P1の11関数はそれが実務で起きる。

現状：入れ子で答えが変わる式 **38本**（`nesting-audit.mjs --probe`）。P1完了で **27本**まで下がる見込み。

## 1. 進め方（毎回この順）

1. **真値ケースを先に足す**（下の表の式を `cases/*.json` へ）
2. `pwsh -File tools/golden-excel.ps1` → DIFF が「**新規ケースのみ・既存値の変化ゼロ**」を確認してから昇格
3. その時点では**赤**（実装前だから当然）。ここで初めて実装する
4. 実装 → `compare.mjs` 緑 → `nesting-audit --check` の件数が下がったら `--update-baseline` で締め直す
5. 2層検証（全ケース実データ／実UIで全ボタン）＋ 実Chrome突合 ＋ 実Excel突合 → CI全通し

**★1関数ずつではなく11関数まとめて1コミット**（段階導入禁止）。ただし上の1〜3は関数ごとに回す。

## 2. 移す先の判断（ここが設計の肝）

| 関数 | 移す先 | 理由 |
|---|---|---|
| CONCAT / FIXED / DATEVALUE / NUMBERVALUE / ASC / JIS / TEXTBEFORE / TEXTAFTER | **プラグイン** | 純粋関数（入力→出力だけ）。入れ子で使われる |
| LOOKUP / XMATCH | **プラグイン** | 範囲を値として受け取れば足りる（参照を返さない） |
| **INDIRECT** | **★要スパイク。プラグインで足りない可能性が高い** | 下の §4 |

## 3. 関数ごとの仕様と「何を測れば合っていると言えるか」

真値は毎回 **実Excel（16.0.20228 / 日本語1041）** から取る。ケースIDは `<関数>_<観点>`。

### CONCAT
- Excel: 範囲も引数に取れる。空セルは飛ばさず""として連結。数値は既定書式で文字列化。
- 測る観点 → ケース案
  - `CONCAT_range` : `=CONCAT(D1:D3)` … 範囲を渡せるか（現行の主用途）
  - `CONCAT_mixed` : `=CONCAT(B1,"-",A1)` … 文字と数値の混在
  - `CONCAT_blank` : `="["&CONCAT(G1:G3)&"]"` … 空セルの扱い（CONCATENATEと違い範囲可）
  - `CONCAT_nested` : `=LEN(CONCAT(D1:D6))` … ★入れ子
  - `CONCAT_number_fmt` : `=CONCAT(A4)` … 0.1 が "0.1" になるか（書式が付かないこと）

### LOOKUP
- Excel: ベクトル形式。**検索範囲は昇順前提**、見つからなければ「超えない最大」。全部より小さければ `#N/A`。
- 観点 → ケース案
  - `LOOKUP_exact` : `=LOOKUP(20,C1:C6,E1:E6)`
  - `LOOKUP_between` : `=LOOKUP(30,C1:C6,E1:E6)` … 中間値＝超えない最大を返すか（ここが一番間違えやすい）
  - `LOOKUP_below_all` : `=IFERROR(LOOKUP(0,C1:C6,E1:E6),"NA")` … 全部より小さい
  - `LOOKUP_above_all` : `=LOOKUP(999,C1:C6,E1:E6)` … 全部より大きい＝最後
  - `LOOKUP_text` : `=LOOKUP("B",D1:D6,E1:E6)` … 文字列の比較順
  - `LOOKUP_nested` : `=ROUND(LOOKUP(30,C1:C6,E1:E6),0)` … ★入れ子

### XMATCH
- Excel: `XMATCH(値, 配列, [一致モード], [検索モード])`。既定は完全一致（MATCHの既定と違う）。
- 観点 → ケース案
  - `XMATCH_exact` : `=XMATCH(20,C1:C6)` … 既定が完全一致であること
  - `XMATCH_miss` : `=IFERROR(XMATCH(30,C1:C6),"NA")` … 既定で見つからなければ #N/A
  - `XMATCH_next_smaller` : `=XMATCH(30,C1:C6,-1)` … 一致モード -1
  - `XMATCH_next_larger` : `=XMATCH(30,C1:C6,1)` … 一致モード 1
  - `XMATCH_wildcard` : `=XMATCH("りん*",B1:B8,2)` … 一致モード 2 でワイルドカード
  - `XMATCH_reverse` : `=XMATCH("A",D1:D6,0,-1)` … 検索モード -1（後ろから）
  - `XMATCH_nested` : `=INDEX(E1:E6,XMATCH(20,C1:C6))` … ★入れ子

### DATEVALUE
- Excel: 文字列 → 日付シリアル。**ロケール依存**（`2026/7/31`・`2026-07-31`・`R8.7.31` 等）。時刻付きは小数を切り捨て。
- 観点 → ケース案
  - `DATEVALUE_slash` : `=DATEVALUE("2026/7/31")`
  - `DATEVALUE_hyphen` : `=DATEVALUE("2026-07-31")`
  - `DATEVALUE_jp` : `=IFERROR(DATEVALUE("2026年7月31日"),"NA")` … 和暦・日本語表記でどうなるか**実Excelに聞く**
  - `DATEVALUE_bad` : `=IFERROR(DATEVALUE("あ"),"NA")`
  - `DATEVALUE_nested` : `=YEAR(DATEVALUE("2026-07-31"))` … ★入れ子
- ★注意：**推測で実装しない**。どの表記を受けるかは実Excelの答えを golden にしてから決める。

### NUMBERVALUE
- Excel: `NUMBERVALUE(文字列, [小数点], [桁区切り])`。区切りを明示できるのが VALUE との違い。
- 観点 → ケース案
  - `NUMBERVALUE_plain` : `=NUMBERVALUE("1.5")`
  - `NUMBERVALUE_sep` : `=NUMBERVALUE("1,234.5")` … 既定の区切り
  - `NUMBERVALUE_custom` : `=NUMBERVALUE("1.234,5",",",".")` … 欧州式（引数で区切りを指定）
  - `NUMBERVALUE_bad` : `=IFERROR(NUMBERVALUE("あ"),"NA")`
  - `NUMBERVALUE_nested` : `=SUM(NUMBERVALUE("1,234"),1)` … ★入れ子

### FIXED
- Excel: `FIXED(数値, [桁数], [桁区切りを付けない])`。**四捨五入して文字列**を返す。
- 観点 → ケース案
  - `FIXED_default` : `=FIXED(1234.567)` … 既定2桁＋桁区切り
  - `FIXED_digits0` : `=FIXED(1234.5,0)` … 丸め方向（0から遠い方）
  - `FIXED_nocomma` : `=FIXED(1234.567,2,TRUE)` … 桁区切りなし
  - `FIXED_negative_digits` : `=FIXED(1234.5,-2)` … 負の桁数
  - `FIXED_is_text` : `=LEN(FIXED(1234.5,0))` … ★文字列で返ること＋入れ子

### ASC / JIS
- Excel: 全角→半角 / 半角→全角。**かな・記号・スペースも対象**。日本語環境の実務で最頻出。
- 観点 → ケース案（入力セルに全角文字を足す必要あり → `_inputs.json` に `B9="ＡＢＣ１２３"`, `B10="ｱｲｳ"` を追加）
  - `ASC_alnum` : `=ASC(B9)` … 全角英数 → 半角
  - `ASC_kana` : `=ASC("アイウ")` … 全角カナ → 半角カナ
  - `ASC_mixed` : `=ASC("Ａ亜１")` … 漢字は変換されないこと
  - `JIS_alnum` : `=JIS("ABC123")` … 半角 → 全角
  - `JIS_kana` : `=JIS(B10)` … 半角カナ → 全角カナ（濁点の合成に注意）
  - `ASC_nested` : `=LEN(ASC(B9))` … ★入れ子（長さが変わるか＝変換が効いたかが1数字で分かる）
- ★注意：濁点・半濁点（`ｶﾞ`→`ガ`）の合成は実装がずれやすい。**必ず実Excelの答えを真値にする**。

### TEXTBEFORE / TEXTAFTER
- Excel: `TEXTBEFORE(文字列, 区切り, [出現回数], [大小区別], [末尾一致], [見つからない時])`。
- 観点 → ケース案
  - `TEXTBEFORE_first` : `=TEXTBEFORE("007-1234","-")`
  - `TEXTAFTER_first` : `=TEXTAFTER("007-1234","-")`
  - `TEXTBEFORE_nth` : `=TEXTBEFORE("a-b-c","-",2)` … 2番目の区切り
  - `TEXTAFTER_negative` : `=TEXTAFTER("a-b-c","-",-1)` … 後ろから
  - `TEXTBEFORE_missing` : `=IFERROR(TEXTBEFORE("abc","-"),"NA")` … 区切りが無い
  - `TEXTBEFORE_ifmissing` : `=TEXTBEFORE("abc","-",1,0,0,"なし")` … 見つからない時の既定値
  - `TEXTAFTER_nested` : `=LEN(TEXTAFTER("007-1234","-"))` … ★入れ子

## 4. ★INDIRECT は別扱い（ここだけ設計を確定させない）

INDIRECT は**値ではなく参照を返す**関数。`=SUM(INDIRECT("E1:E6"))` は「範囲」を渡せないと成立しない。
HyperFormula のプラグインは基本「値を返す」形なので、そのまま実装すると
`=INDIRECT("E1")` は動いても `=SUM(INDIRECT("E1:E6"))` が動かない、という半端な物になる恐れがある。

**やること（実装GOの前に1つだけ）**：小さなスパイクで
`=SUM(INDIRECT("E1:E6"))` / `=INDIRECT("E1")` / `=INDIRECT(B5)` の3本が
プラグインで成立するかを実測する。成立しないなら

- (a) `_jsSet` に残し、「一番外側でしか効かない」ことを台帳に明記して期限を切る
- (b) グリッド側（book.html）で式を書き換える別方式にする

のどちらかを選んで**その時に報告する**。★推測で実装に入らない。

## 5. 入力セルの追加（真値の作り直しが要る）

ASC / JIS のために `cases/_inputs.json` に足す：

| セル | 値 | 用途 |
|---|---|---|
| B9 | `ＡＢＣ１２３` | 全角英数 |
| B10 | `ｱｲｳ` | 半角カナ |
| B11 | `ｶﾞｷﾞ` | 半角カナ＋濁点（合成の確認） |

**入力を足すと既存ケースの真値が変わらないことを DIFF で確認する**（B列の範囲を使う既存ケースに影響が出ないか。
`LEN_jp` 等は個別セル参照なので影響しないはずだが、**確認してから**進める）。

## 6. 完了の判定（数字で出す）

- `compare.mjs`：一致 **243 → 約280**（新規ケース約37件がすべて一致）／新規不一致 0
- `nesting-audit --probe`：**38 → 27**（P1の11関数が消える）→ baseline を締め直す
- `--self-test` 6通り／`roundtrip` 14/14／`hub-ui` 65/65／stamp ／CI全通し
- 実Chromeで全ケース突合＝jsdomと一致、実Excelで書き出しブック突合＝全件一致

## 7. やらないこと

- コードは書かない（この設計の承認後）
- INDIRECT の実装方式を今決めない（§4のスパイク結果で決める）
- P2 / P3 の関数には手を付けない

---

# §P2 第3波 P2（2026-08-01 完了）

`DOLLAR(旧YEN) / TYPE / AGGREGATE / LENB / LEFTB / RIGHTB / MIDB / RANK(.EQ/.AVG) / VALUETOTEXT / ENCODEURL`

| | 前 | 後 |
|---|---|---|
| ハーネス 一致 | 306 | **362**（新設56件がすべて一致） |
| 不一致（新規／既知） | 0 / 0 | **0 / 0** |
| 入れ子で答えが変わる式 | 27 | **16** |
| 書き出しブックを実Excelで再計算 | 302/306 | **358/362**（差4件は既存の `file_roundtrip_known`） |

## ★実測して分かった事（どれも「今まで静かに間違っていた」物）

### (a) 通貨書式の関数の本名は `DOLLAR`。`YEN` は日本語UIの表示名
`.FormulaLocal = "=YEN(1234.5)"` を入れて `.Formula` を読むと **`=DOLLAR(1234.5)`** が返る（Excel自身が相互変換）。
`.Formula` に `=YEN(...)` を入れると `#NAME?`。**JIS→DBCS と同じ形**なので同じ扱いにした（入口と出口の両方で本名へ）。

さらに**日本語環境の `DOLLAR` は `¥` を出す**。旧 `_jsDollar` は全部違っていた:

| | 旧実装 | 実Excel(日本語1041) |
|---|---|---|
| `=DOLLAR(1234.567)` | `$1,234.57` | **`¥1,235`**（記号も既定桁数も違う） |
| `=DOLLAR(-1234.5)` | `($1,234.50)` | **`¥-1,235`**（括弧ではない） |
| `=DOLLAR(1234.5,-2)` | `$1,235` | **`¥1,200`**（負の桁数を無視していた） |

★通貨記号と既定桁数は**地域の通貨書式**に従う。`RECIPE.md` のロケール前提と同じ扱い＝環境が変わればここも変わる。

### (b) `AGGREGATE` の 12 と 13 が逆だった
Excelは **12=MEDIAN / 13=MODE.SNGL**。旧実装は 12→MODE、13→MEDIAN。
`=AGGREGATE(12,0,E1:E6)` が `#N/A` になっていた（本当は 350）。14/15（LARGE/SMALL）と第4引数 `k` も未対応だった。
18/19（`PERCENTILE.EXC`/`QUARTILE.EXC`）は**未対応のまま `#VALUE!` を返す**＝黙って近い値を出さない（台帳 R18）。

### (c) バイト単位の文字列関数（LENB/LEFTB/RIGHTB/MIDB）
- **半角カナは1バイト**（旧実装は2バイトと数えていた）。`=LENB("ｱｲｳ")` は 3。
- **2バイト文字を途中で切ると、その半分は「空白1個」になる**（消えるのではない）:
  `LEFTB("りんご",3)="り "` / `RIGHTB("りんご",3)=" ご"` / `MIDB("りんご",2,2)="  "`（空白2個）
- MIDB の開始位置は**バイト**。旧実装は文字数で数えていて `=MIDB(B1,3,2)` が `ご`（正しくは `ん`）だった。

### (d) `ENCODEURL` は `! ' ( ) * ~` も変換する
JSの `encodeURIComponent` はこの6文字を素通しする。実測 `=ENCODEURL("!'()*-_.~")` → `%21%27%28%29%2A-_.%7E`
（そのまま残るのは `A-Z a-z 0-9 - _ .` だけ）。

### (e) `VALUETOTEXT` の第2引数を無視していた
0=簡潔（既定・文字列に引用符を付けない）／1=厳密（引用符で囲む）。旧実装は**常に引用符を付けて**いた。

### (f) ★`RANK.AVG` に `_xlfn.` が付いていなかった → 新しいガードを作った
`RANK.EQ` は一覧にあったのに `RANK.AVG` だけ抜けており、**書き出したブックを実Excelで開いた時だけ**
その式が `#NAME?` になっていた。画面のテストでは絶対に見つからず、**CIにはExcelが無いので気づけない**。
→ `tests/xlsx-harness/xlfn-coverage.test.mjs` を新設。式に出てくる関数が
「`_xlfn.`を付ける／日本語UIの表示名／接頭辞不要の古い関数」の**どれにも分類されていなければ赤**にする。
分類表は `xlfn-legacy.json`（実Excelで確かめた日付と足し方つき）。
※わざと `RANK.AVG` を外して**実際に赤くなること**も確認済み。

## 残り（第3波P3・期限 2026-11-30）
`MODE / TRIMMEAN / PERCENTRANK / KURT / INTERCEPT / FORECAST / IRR / PERMUT / PERMUTATIONA / MDETERM / GESTEP`
＋「版上げで不要になる可能性」の5つ（`PERCENTILE / QUARTILE / N / DSUM / DCOUNT`・判断日 2026-09-30）。
