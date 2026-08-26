# 請求書を本番へ出す — どこへ出すか（1枚）

2026-08-26 ／ テスト線 頭SHA = このコミット ／ **指示役のOKが出るまで 作り始めません**

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

**お願い（私は押しません）**
- **`js/supa-config.js` の値（url / key / env:'prod'）は 指示役が exally から写す**。
  私は**本番の倉庫の値を1文字も書きません**（記憶の値を打たない）。
- **本番の倉庫への書き込みも 指示役が押す**。
- 本番の倉庫に請求書の棚が在るかの確認（`pay_org` / `pay_partners` / `pay_invoices` /
  `pay_receipts` / `pay_companies`）。足りなければ作る所も指示役。

**もし「`env:'prod'` も10月にしろ」なら 出すのを止めます。** 一言ください。

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
- **直し方（案）**＝
  > 自社の情報は 1か所で持っています。直すと この先に出す紙にも効きます。
- **客が読む字・タブ・紙に 他アプリや無い機能の名前を出さない**（決まり）。
- ★見張り★＝`scripts/screen-words.mjs` に **「給与」** を見る語として足すかは、
  **テスト線には給与が在る**ので**足しません**。代わりに**運んだ後の本番で1回 数えます**。

---

## 6 運ぶ物 30本

`node scripts/dep-count.mjs seikyu/index.html` の実測。**呼ばれる側も一緒に運ぶ**
（呼ぶ側だけ写して本番を白画面にした前例があるため）。

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

## 出す手順（指示役の B・C・D）

1. 上の**5の2か所**をテスト線で直す → CI緑 → **見た目を1枚で見せる**
2. **綺麗な worktree** を切って 30本＋見張りを写す
3. **写す前と後で同じ道具で数える**（30本 → 30本）
4. 刻印（`?v=`）→ CI全部 → push
5. **実配信の刻印が今のコードと同じか 1回だけ確認**（叩き続けない）
6. **実物の紙を1枚 出して 置き場を1行**／**スマホで1回**

## 欠け

- **本番の倉庫の中を1度も見ていません**（棚が在るかは指示役の確認待ち）
- **`rakually.vercel.app` がその名前で出るかは 出すまで分かりません**（配信0本のため）

## 危ない所

- **今まで1度も通っていない道**です。**白画面になる型（呼ぶ側だけ写す）**が一番こわいので、
  **写す前と後で同じ道具で数える**を必ずやります。
- 出した後、**請求書だけ別のURL**になります。司さんに渡す時は**どちらのURLか**を1行 書きます。
