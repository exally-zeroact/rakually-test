# 請求書を本番へ出す — どこへ出すか（1枚）

2026-08-26 ／ テスト線 頭SHA = このコミット ／ **指示役のOK＝出ました（2026-08-26）**

司さん 2026-08-26「出していい」。指示役の決まり＝**まず「どこへ出すか」を1枚で出して、OKをもらってから作る**。
数字は全部 **測った物**です（gh / Vercel の一覧 / `scripts/dep-count.mjs` / ソースの行）。

---

## 1 出し先

| | 案A（**私の推し**） | 案B |
|---|---|---|
| 入れ物 | repo `exally-zeroact/rakually`（**空**）＋ Vercel の枠 `rakually`（**配信0本**） | 新しく repo と枠を作る |
| URL | **`https://rakually.vercel.app`**／請求書は **`/seikyu/`** | 別名 |

**推す理由**
- **枠はもう在る**（`prj_co2tidQZRjRopoH5hkMCeilFoe9v` / team `team_k1YqpQEr4m1xH7pP5U1uvhwq`）。
  2026-08-17 に作った物で、**中身が空なだけ**。新しく作ると **同じ物が2つ**になります。
- **URLに他アプリの名前が出ません**（`rakually` だけ）。決まりどおり。
- 案Bは **増やすだけで 得が無い**ので採りません。

**指示役に確かめてほしい所**
- URLの字に他アプリの名前が出ていないか（`rakually.vercel.app` に `exally` は入りません）
- `rakually.zeroact.jp` は **10月の塊**なので、今は付けません

---

## 2 出す物

**請求書の画面だけ**（`/seikyu/` と その入口）。

- 給与は **`exally.vercel.app/kyuyo/` に間借りしたまま**。今回は動かしません。
- 理由＝**10月に「改名＋URL切替＋器1の移行＋`env:'prod'`の1行」を同じ塊でやる**決まりなので、
  **その塊を先取りしない**。
- **違う案は出しません**（指示役の前提と同じです）。

---

## 3 倉庫

| | 案A（**私の推し**） | 案B |
|---|---|---|
| 向き先 | **本番の倉庫 `tnfwipbgfgjaymlszeid`** | DB-test `khawdrnvssdenumbiwfg` |
| env | **`env:'prod'`**（テスト帯を出さない） | `env:'test'`（帯が出る） |

**推す理由**
- 請求書は **客の本物の請求データ**です。DB-test に置くと
  **練習用の倉庫に本物の請求書が貯まる**。後から移せません。
- `env:'test'` のままだと 客の画面の一番上に
  「テスト環境／ここで入れた内容は本番には入りません」の帯が出ます＝**嘘の帯**。

**向き先を持っているファイル**＝**`js/supa-config.js` だけ**（決まり。ほかのファイルに倉庫の名前を書かない）。
今のテスト線の中身：`url: 'https://khawdrnvssdenumbiwfg.supabase.co'` / `env: 'test'`

**指示役の裁定（2026-08-26）＝案Aで OK。**
「`env:'prod'` は10月」ではない。**10月の塊は 給与の移行の話**であり、
**請求書は 今から新しく出す物＝最初から本番でよい**。

**★指示役が本番の倉庫を数えた結果（2026-08-26）★**

| 倉庫 | 在る棚 | 無い棚 |
|---|---|---|
| **本番** `tnfwipbgfgjaymlszeid` | `pay_companies`（2行）／`pay_org`（1行）／`pay_partners`（2行）＋窓3つ | **`pay_invoices`／`pay_receipts`** |
| DB-test `khawdrnvssdenumbiwfg` | 5つ全部（＋窓5つ） | 無し |

⇒ **このまま出すと、請求書を作った瞬間に「保存できません」**になります
（**請求書そのものと 入金を 置く場所が無い**）。
⇒ **指示役が 本番に棚を2つ作る**（DB-test と同じ形・作った後 行数で確認・今の3つ5行は触らない）。
**私は押しません。**

**お願い（全部 指示役が押す。私は1文字も書きません）**
- `js/supa-config.js` の値（url / key / `env:'prod'`）は **指示役が渡す**
  （**私が exally から自分で写す事もしません**）
- 本番の倉庫への書き込み／棚を2つ作る
- 戻り先URL 2本を足す

---

## 4 戻り先URL（ログインの戻り先）

`js/rakually-login.js:291` は **`location.origin + location.pathname`** を戻り先に使います。
＝ **開いていた画面にそのまま戻る**作りなので、**入口も請求書も 両方**要ります。

足すURL（**この2本**）

```
https://rakually.vercel.app
https://rakually.vercel.app/**
```

- 1本目＝入口（`/`）に戻る時
- 2本目＝`/seikyu/` など **下の画面**に戻る時（`**` が無いと弾かれます）
- **無いと 代行請求のテストへ飛びます**（前例あり）
- **これは指示役が倉庫に足す**。足した後、**私が実配信で1回 押して確かめます**。

---

## 5 出す前に直す2か所

### ① 入口の給与タイルが 404 になる

- 場所＝`index.html:34`
  ```html
  <a class="tile" id="tile-payslip" href="kyuyo/">
    <span class="tile-ic">💰</span><span class="tile-t">給与</span>
    <span class="tile-d">明細の作成・配布</span><span class="tile-go">開く →</span>
  </a>
  ```
- 請求書だけ出すと **`kyuyo/` が無い**＝押した人が行き止まり。
- **直し方**＝本番へ運ぶ入口では **このタイルを出さない**（請求書のタイルだけ）。
  ＝**出来ていない物のボタンを見せるな**。
- テスト線の入口は **今のまま**（給与も在るので正しい）。
  ⇒ **運ぶ時に 入口だけ「請求書だけの入口」に差し替える**。

### ② 客の字に「給与」が出る

- 場所＝`seikyu/index.html:459`
  > 給与の明細と同じ会社の情報を使っています。直すと どちらの紙にも効きます。
- 給与が無い所でこの字が出ると **在りもしない物の名前**。
- **直し方（指示役の案・2026-08-26 で決定）**＝
  > 会社の情報は 1か所にまとめています。直すと 他の紙にも同じように出ます。
  （私の案「この先に出す紙」は**客には何の紙か分からない**、との指摘で差し替え）
- **2026-08-26 に直しました。** 残る「給与」4件は**すべて覚書**（客の画面に出ない）。
- **客が読む字・タブ・紙に 他アプリや無い機能の名前を出さない**（決まり）。
- ★見張り★＝`scripts/screen-words.mjs` に **「給与」** を見る語として足すかは、
  **テスト線には給与が在る**ので**足しません**。代わりに**運んだ後の本番で1回 数えます**。

---

## 6 運ぶ物 31本（入口1＋中16＋外14）

`node scripts/dep-count.mjs seikyu/index.html` の実測。**呼ばれる側も一緒に運ぶ**
（呼ぶ側だけ写して本番を白画面にした前例があるため）。

> **訂正（2026-08-26）**：前に「30本」と書きましたが **31本**です。
> `dep-count` が返すのは**入口が呼ぶ物**なので、**入口 `seikyu/index.html` 自身が入っていません**でした。
> 運ぶ道具を作って走らせた時に**運び先で「入口の HTML が無い」で転んで**気づきました。

**中 16本**

```
seikyu/css/app.css              seikyu/lib/seikyu-cols.js
seikyu/js/auth.js               seikyu/lib/seikyu-doc.js
seikyu/js/seikyu-app.js         seikyu/lib/seikyu-gensen.js
seikyu/js/seikyu-out.js         seikyu/lib/seikyu-name.js
seikyu/js/seikyu-store.js       seikyu/lib/seikyu-paper.js
seikyu/lib/seikyu-aoa.js        seikyu/lib/seikyu-partner-ask.js
seikyu/lib/seikyu-carry.js      seikyu/lib/seikyu-tax.js
seikyu/lib/seikyu-templates.js  seikyu/manifest.json
```

**外 14本**（**一緒に運ばないと白画面**）

```
index.html                      js/suite-data.js
css/rakually-ui.css             js/supa-config.js   ← 中身は指示役が写す
js/env-badge.js                 lib/toroku-no.js
js/file-out.js                  lib/xlsx.full.min.js
js/rakually-login.js            img/apple-touch-icon-180.png
kyuyo/lib/shiharai-chosho.js    img/favicon-16.png
kyuyo/lib/shouhizei-ritsu.js    img/favicon-32.png
```

**法定の2本を `kyuyo/lib` のままにする理由**（指示役の確認どおりで合っています）
- **正本は1つ。写しを作らない。** 率も式も **給与の lib が持つ**（請求書側に率を1つも書かない）。
- `seikyu/lib` に率の写しを作ると **`seikyu/tests/dep-guard.test.mjs` が赤**になります（そう作ってあります）。
- **「請求書だけ」でも この2本は要る**＝**給与を出す事とは別**です。
  `seikyu-tax.js` → `shouhizei-ritsu.js` ／ `seikyu-gensen.js` → `shiharai-chosho.js` を呼びます。

**一緒に運ぶ物**＝見張り一式（`tests/` `scripts/` `.github/workflows/ci.yml`）
理由＝**repo自前の見張りが無いと 本番だけ古くなる**（payslip-app で40件が2週間 本番に生きていた）。

**出さない物**＝給与の画面3枚（`kyuyo/index.html` `kyuyo/meisai.html` `kyuyo/admin.html`）と
その js/css・`docs/`・`supabase/` の SQL・手元の道具。

---

## 出す順番（指示役が2026-08-26 に決めた形）

| # | だれが | 何を |
|---|---|---|
| 1 | **指示役** | 本番の倉庫に `pay_invoices` と `pay_receipts` を作る（行数で確認） |
| 2 | **指示役** | 戻り先URL 2本を足す（足した後 実測で確かめる） |
| 3 | **指示役** | `js/supa-config.js` の値（url/key/`env:'prod'`）を渡す |
| 4 | **私** | 上の**5の2か所**を直す ← **2026-08-26 に②を直しました。①は運ぶ道具に入れました** |
| 5 | **私** | `node scripts/ship-seikyu.mjs --to <運び先>` で運ぶ（**前と後で数える**）→ 刻印 → CI全部 → push |
| 6 | **私** | 実配信を**1回だけ**叩いて 刻印一致を確かめる |
| 7 | **私** | **請求書を1枚 作って 保存できる事を押す**（棚が効いている事を**行数で**） |
| 8 | **私** | **実物の紙を1枚 出して 置き場を1行** 指示役へ |
| 9 | 司さん | 実機1周 |

**司さんに渡す時に必ず書く1行**
> 請求書は `https://rakually.vercel.app/seikyu/` ／ 給与は今まで通り `https://exally.vercel.app/kyuyo/`

## 欠け

- **私は本番の倉庫の中を1度も見ていません**（数えたのは指示役。おかげで**棚の穴が2つ**見つかりました）
- **`rakually.vercel.app` がその名前で出るかは 出すまで分かりません**（配信0本のため）
- **本物の紙を1枚も出していません**（出した後 手順8でやります）

## 危ない所

- **今まで1度も通っていない道**です。**白画面になる型（呼ぶ側だけ写す）**が一番こわいので、
  **写す前と後で同じ道具で数える**を必ずやります。
- 出した後、**請求書だけ別のURL**になります。司さんに渡す時は**どちらのURLか**を1行 書きます。
