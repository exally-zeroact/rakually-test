/* fuyo-ui.mjs — ★被扶養者(異動)届を ★実ブラウザで お客さんの道どおり★ 出す★
 * =============================================================================
 * ★なぜ 作ったか（2026-09-14）★
 *   2026-09-14 に ★増えた／減った／変わった の 3通りを 本番へ 出した★。
 *   だが ★実ブラウザで 1回も 押していなかった★＝見たのは lib の 中だけ
 *   （fuyoRow / dasuKaFuyo / 139項目の 検め）。
 *   ★理屈では 揃っている は 測っていないと 同じ★。
 *   2026-09-08 に ★同じ場所で 同じ型★を 踏んでいる＝
 *     「ボタンは『出せます』なのに 押したら ★5件 断られた★」。
 *   ⇒ ★画面から 本当に ファイルが 落ちるか★を 押して 確かめる。
 *
 * ★測る事★
 *   ①家族を 入れる 画面に 要る 欄が 在る（姓/名 × 漢字/カナ・届出の 選び）
 *   ②★届出を 選ぶと 出る欄が 変わる★（増えた＝入った日/理由・減った＝外れた日/理由・変わった＝備考）
 *   ③足りない うちは ★ボタンが 押せない★（嘘を つかない）
 *   ④ぜんぶ 入れたら ★押せる★
 *   ⑤押したら ★SHFD0006.CSV が 本当に 落ちる★／様式コード・列の数・★異動の別★を 1文字ずつ 読む
 *   ⑥★3通りとも★ 出す（増えた／減った／変わった）
 *
 * ★後始末★（指示役1 の 注文・2026-09-14）
 *   ・★押す前と 後で 行数を 数える★（増えた分＝自分の ゴミ）
 *   ・★try/finally＋終了合図★で 消す（殺されても 残りにくい）
 *   ・★テスト倉庫だけ★（本番倉庫には 触らない）
 *
 * 使い方: node kyuyo/tests/fuyo-ui.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELF = process.argv.includes('--self-test');

/* ★物差しそのもの★（ブラウザを 使わずに 確かめられる 形）
   落ちた CSV を 読んで ★様式コード・列の数・異動の別★ を 数える。 */
/* ★指紋の列を 数で 書かない★＝lib の 列番地を 写す
   `kyuyo/lib/todokede-csv.js:1114` r[9]  ＝ 10 氏名（漢字）…★被保険者★
   `kyuyo/lib/todokede-csv.js:1125` r[20] ＝ 21 異動の別 */
/* ★★倉庫への 要求を ★４つに 分ける★★（2026-09-25・指示役1 の 叩き ㋓）
   ★なぜ 関数に 出したか★ … ★★門に 空振り止めを 付ける 為★★
     ★前は 走りの 中で `filter` を 直に 書いて いた★
     ⇒ ★★実ブラウザを 走らせないと 門が 仕事を した 所を 見られない★★
     ⇒ ★外に 出して ★偽の 控えで 確かめる★（★CI でも 毎回 走る★）

   ★★分け方は ★実測★ で 決めた（★当て推量 0★）★★
     小さな 台を 立てて WebKit で 3通り 測った（09-25）
       ★普通に 返した★ … `request` ／ `response` ／ `requestfinished`
       ★`route.abort()` で 落とした★ … `request` ／ ★`requestfailed`★ だけ
                                    （★★`response` は 来ない★★）
       ★`route` を 握って 何も しない（宙吊り）★ … `request` だけ
                                    （★★３つとも 来ない★★）
     ⇒ ★★前の 控え（`response` だけ）は ★失敗を「返って いない」と 数えて いた★★★
     ⇒ ★包み（`scripts/_borrow-playwright.mjs:111`）は ★３つ 聞いて いた★
        ＝★正しい 形が 同じ repo に 在った★

   ★４つ★
     ㊀★返った★ … `response` が 来た（`tsuita`）
     ㊁★失敗した★ … `requestfailed`（`shippai`）★これは app の 話★
     ㊂★控えの 漏れ★ … 終わった（`owari`）のに 中身を 拾えて いない
     ㊃★★本当に 黙って いる★★ … ★３つとも 来て いない＝本物の 異常★ */
export function wakeru(log) {
  const a = Array.isArray(log) ? log : [];
  const kaetta = a.filter((x) => x && x.tsuita);
  const shippai = a.filter((x) => x && !x.tsuita && x.shippai);
  const more = a.filter((x) => x && !x.tsuita && !x.shippai && x.owari);
  const damari = a.filter((x) => x && !x.tsuita && !x.shippai && !x.owari);
  return { zen: a.length, kaetta, shippai, more, damari };
}

/* ★★着いた 順が 差し戻った 本数★★（2026-09-25）
   ★前は `x.n !== x.ban` を「逆順」と 呼んで いた★
   ⇒ CI `36151979249` で ★148本★ と 出たが、実は
      ★★早い 所で 1本 欠けたので 後ろの 着いた番が 全部 1つ ずれただけ★★
   ⇒ ★★『148本 逆順』は ★意味の 無い 数★★★＝★正しく 測れて しまって いた★
   ⇒ ★着いた 物 同士で 見る＝★番が 差し戻ったか★ だけ */
export function gyakuJun(log) {
  const tsuita = (Array.isArray(log) ? log : []).filter((x) => x && x.ban);
  let kazu = 0, mae = 0;
  const ji = [];
  tsuita.forEach((x) => {
    if (x.ban < mae) { kazu++; ji.push('出' + x.n + '→着' + x.ban); }
    mae = Math.max(mae, x.ban);
  });
  return { kazu, ji };
}

/* ★★保存が 重なって いるか★★（2026-09-25・★新しい 見立て★）
   ★なぜ★ … 手元でも 覆いが 出る ように なった回の 数（実測）
     ★全 82本／返った 82本／失敗 0／黙り 0／差し戻り 0★
     ⇒ ★★『返らない』は 因で は ありません★★（★見立てを 1つ 捨てた★）
   ★次の 見立て★ … ★★保存(POST)が ２本 同時に 飛んで いる★★
     ⇒ ２本目が ★１本目の 前の `updated_at`★ を 持って 行く
     ⇒ ★倉庫が 弾く＝★覆い★
     ★app.js:6393★ `['input','change','click'].forEach(… persistSaveDebounced, true)`
       ＝★どれを 押しても 保存が 予約される★
       ⇒ ★人が 増えると 押す 数も 描く 時間も 増える★
   ★測る 物★ … ★★`dashi`～`owari` の 窓が 重なった POST の 組★★
   ★返す 物★ … `kumi`（重なった 組）／`saidai`（同時に 飛んで いた 最大数） */
export function kasanari(log, muki) {
  const a = (Array.isArray(log) ? log : [])
    .filter((x) => x && x.dashi && (!muki || x.muki === muki))
    .slice().sort((p, q) => p.dashi - q.dashi);
  const owariOf = (x) => x.owari || x.tsuita || 0;
  const kumi = [];
  for (let i = 0; i < a.length; i++) {
    const o = owariOf(a[i]);
    if (!o) continue;                       /* ★終わりが 分からない 物は 数えない★ */
    for (let j = i + 1; j < a.length; j++) {
      if (a[j].dashi >= o) break;           /* ★並んで いるので これ以降は 重ならない★ */
      kumi.push({ a: a[i].n, b: a[j].n, kasanari: o - a[j].dashi });
    }
  }
  /* ★同時に 飛んで いた 最大数★＝★出たら ＋1／終わったら ー1 を 時刻順に 見る★ */
  const fushi = [];
  a.forEach((x) => { const o = owariOf(x); fushi.push([x.dashi, 1]); if (o) fushi.push([o, -1]); });
  fushi.sort((p, q) => (p[0] - q[0]) || (p[1] - q[1]));
  let ima = 0, saidai = 0;
  fushi.forEach(([, d]) => { ima += d; saidai = Math.max(saidai, ima); });
  return { honsu: a.length, kumi, saidai };
}

/* ★★失敗を ★棚ごと・向きごと★ に 数える★★（2026-09-25・指示役1 の ②）
   ★なぜ 門に するか★
     `app.js:2169` `function saveFailed(){ _saveFailN++; … }`
     `app.js:2173` `toast(_saveFailN + '★名分を保存できませんでした
                    （台帳・年末調整に入っていません）。
                    もう一度 確定してください。★')`
     ⇒ ★★アプリは 自分で 数えて 客に 出して いる★★
     ⇒ ★のに 試験は それを 見て いなかった★＝★見張りの 穴★
   ★実測（09-25・手元・従業員 11人）★
     ★全 444本／失敗 17本／うち ★明細の 保存(POST) 3本★／★試験は 緑★★
   ★この 門を 入れると★ … ★★直すまで テスト線は 赤の まま★★
     （★但し その 赤は 本物＝★客に 出る 字が 実際に 出て いる★）
   ★新しい 測りは 足して いません★＝★同じ 控えの 数を 判じに 使うだけ★ */
export function shippaiWakeru(log) {
  const a = (Array.isArray(log) ? log : []).filter((x) => x && !x.tsuita && x.shippai);
  const kaki = a.filter((x) => x.muki !== 'GET' && x.muki !== 'HEAD');
  const tana = {};
  a.forEach((x) => {
    const k = (x.tana || '?') + ' ' + x.muki;
    tana[k] = (tana[k] || 0) + 1;
  });
  return { zen: a.length, kaki, kakiKazu: kaki.length, tana,
    ji: Object.keys(tana).sort().map((k) => k + ' ' + tana[k] + '本').join(' ／ ') };
}

/* ★★★『自分で 自分を 弾いた 組』を 番号で 名指す★★★（2026-09-25）
   ★`store.js` の 字★
     `:182` ㊀ `pay_companies` の `updated_at` を 読む（GET）
     `:187` ㊁ 控え（`lastCompanyUpdatedAt`）と 違えば conflict
     `:197` doSave(){ ops＝㊀会社を 書く ／ ㊁従業員 全員 ／ ㊂差分削除の 数え }
     `:212` `Promise.all(ops).then(… ★控えを 新しく する★ )`
   ⇒ ★★控えが 新しく なるのは ★ops が 全部 返って から★★★
   ★組の 見つけ方★
     G … `pay_companies` の GET で ★値を 返した 物★（返り T1）
     W … G より 前の `pay_companies` の ★書き★ で ★送った 値が T1★の 物
     ⇒ ★★倉庫に 在るのは W が 書いた 値＝★自分の 書き★★
     ㊀★W 自体の 返りが G を 出した 後★ ⇒ ★控えは 確実に 旧い★
     ㊁★W の 返りは 先だが ★同じ 束の 他の ops（`pay_employees` 等）が
        まだ 返って いない★ ⇒ ★`Promise.all` が 未だ＝控えは 旧い★
   ★束の 見分け★ … ★W と 同じ 頃（MADO ms 内）に 出た 書き★
     （`store.js:197` の `ops` は ★同じ タイミングで 出る★）
   ★これは ★推量★ では ありません★＝★同じ 控えの 中の 時刻と 値だけで 判じて います★
   ★弱い 所★ … ★控えの 値その 物は 画面の 中の 閑しなので 読めません★
     ⇒ ★★組 0 は『無い』でなく『見えない』★★
     ★捕まえられない 形★ … ★`Promise.all` は 返ったが
       `.then` の 中の 控えの 更新が まだ★（★微小な 順番★）
     ⇒ ★そこは ★要求の 控えでは 見えない★＝
       ★見るなら 画面の 中に 入る 必要が 在る（★未★）★
     ⇒ ★『旧い はず★』まで＝★『旧かった』とは 書きません★ */
/* ★★束（`store.js:197` の `ops`）に 入る 棚★★（2026-09-26）
   ★字★ … `kyuyo/js/store.js:197`
     `var ops=[ sb.from('pay_companies').upsert(…), emps.length? sb.from('pay_employees').upsert(emps) : … ];`
     `if(cloudLoaded && emps.length>0){ ops.push(fetchAllQ(… sb.from('pay_employees').select('id'…) …)) }`
   ⇒ ★★`pay_companies` と `pay_employees` だけ★★
   ★★`pay_payslips` は 束に 入って いません★★
     （`app.js:6180` `saveMonthlyPayslips` が ★別に★ 投げて いる）
   ★踏んだ 穴（CI 36216905374）★
     ★「自分で 自分を 弾ける 組 … 4組」と 出たが
      4組 とも 訳が「同じ 束の 他の 書きが まだ（棚 ★pay_payslips★）」★
     ⇒ ★★束で ない 物を 束と 数えて いた＝★偽の 当たり★★
   ⇒ ★束の 棚だけ 見る★／★近い 他の 書きは ★別に★ 出す★ */
export const TABA_TANA = ['pay_companies', 'pay_employees'];

export function jibunDeJibun(log, mado = 300) {
  const a = (Array.isArray(log) ? log : []).filter((x) => x && x.tana === 'pay_companies');
  const zen = (Array.isArray(log) ? log : []);
  const owariOf = (x) => x.owari || x.tsuita || 0;
  /* ★★字で なく ★数（epoch ミリ秒）★ で 比べる★★
     （2026-09-26・指示役1 の 叩きで 直した）
     ★前は `slice(0,23)`★ … 「…474Z」と「…474+00:00」は ★揃う★
     ★但し 本当の 穴★ … ★★倉庫は 末尾の 0 を 落として 返す★★
        送った「…30.790Z」      → slice(0,23) → …30.790
        返った「…30.79+00:00」  → slice(0,23) → …30.79+   ← ★当たらない★
        （★実物★ … CI `36151979249` の 出83/84
          … 返った「2026-09-25T15:12:30.79+00:00」）
     ⇒ ★★字で 比べると ★毎回 0組★に なり得た★★
        ＝★★『正しく 測れて しまう 0』★★
     ★同じ 形を アプリが 昔 踏んで います★ … `store.js:211` の 覚書
        「JS生成の now(…Z) は DB返却(…+00:00)と 書式が 違い、
          文字列比較で 毎回 不一致＝…誤conflictが 多発する（P0根治）」
     ⇒ ★★アプリが 治した 形を ★測り道具が 踏み直して いた★★ */
  const ji = (v) => { const t = Date.parse(String(v || '')); return Number.isNaN(t) ? '' : t; };
  const kumi = [];
  for (const g of a) {
    if (g.muki !== 'GET' || !g.kaeri) continue;
    const t1 = ji(g.kaeri);
    /* ★★読めない 字は 組に しない★★（2026-09-26・★自己確認が 捕まえた穴★）
       ★`ji` は 読めなければ 空文字を 返す★（`Date.parse` が NaN）
       ⇒ ★★空 同士を「同じ」と 数えて いた★★＝★偽の 1組★ */
    if (t1 === '') continue;
    /* ★G より 前の 書きで 送った 値が T1 の 物★ */
    const w = a.filter((x) => x.muki !== 'GET' && x.n < g.n && ji(x.okutta) === t1).slice(-1)[0];
    if (!w) continue;
    const wOwari = owariOf(w);
    /* ㊀★W の 返りが G を 出した 後★ */
    const atoKara = !wOwari || wOwari > g.dashi;
    /* ㊁★同じ 束の 他の 書きが まだ 返って いない★ */
    /* ★★束の 棚だけ★★＝★`pay_payslips` は 束で は ありません★ */
    const naka = zen.filter((x) => x !== w && x.muki !== 'GET' && x.muki !== 'HEAD'
      && TABA_TANA.indexOf(x.tana) >= 0
      && Math.abs(x.dashi - w.dashi) <= mado);
    const nokori = naka.filter((x) => { const o = owariOf(x); return !o || o > g.dashi; });
    /* ★束で ない が 同じ 頃に 飛んで いた 他の 書き★＝★参考に 出す★
       （★因と しては 数えません★） */
    const yoso = zen.filter((x) => x !== w && x.muki !== 'GET' && x.muki !== 'HEAD'
      && TABA_TANA.indexOf(x.tana) < 0
      && Math.abs(x.dashi - w.dashi) <= mado
      && (() => { const o = owariOf(x); return !o || o > g.dashi; })());
    if (!atoKara && !nokori.length) continue;
    kumi.push({ g: g.n, w: w.n, t1,
      yoso: yoso.map((x) => x.n), yosoTana: [...new Set(yoso.map((x) => x.tana || '?'))],
      wari: atoKara ? '㊀★書きの 返りが 読みより 後★'
        : '㊁★同じ 束の 他の 書きが まだ 返って いない★',
      nokori: nokori.map((x) => x.n), nokoriTana: [...new Set(nokori.map((x) => x.tana || '?'))] });
  }
  return { honsu: kumi.length, kumi };
}

export const RETSU_NA = 9;
export const RETSU_IDOU = 20;

/* ★★`shirushi` を 渡すと ★自分の 人の 行だけ★ を 抜く★★（2026-09-25）
   ★なぜ 要るか★
     `app.js:3742` `fuyoTodoke` は ★`state.employees` を 全部 回る★
     `app.js:3724` は ★配偶者1＋その他2 で 1枚に 束ねる★
     ⇒ ★★倉庫に 他の 人が 居れば 行は 増える★★
     ⇒ ★★「データ行 1本」は ★最初から 成り立たない 判じ★★
     実測（09-25）… CI の 置き土産が 5人 残り ★データ行 3本★
       （家族1人の 人が 5人 でも 束ねられて 3本＝★門で 落ちたのでは ない★）
       その上 `idou[0]` は ★置き土産の 行★＝打った「3」でなく「1」が 出た
   ★何を 指紋に するか★ … ★名前の 中の 6桁の 数字★（`Date.now()` の 下6桁）
     ⇒ ★漢字では 当てられない★＝CSV は Shift_JIS を latin1 で 読むので 字が 化ける
     ⇒ ★数字は ASCII の まま 残る★＝★化けない 指紋★
   ★渡さなければ★ … `shirushiNashi: true`（★呼ぶ側が 緑に しない 為★）
   ★行数（`data`）は 残す★＝★参考に 出す★が ★判じに は 使わない★ */
export function csvMiru(text, shirushi) {
  const gyo = String(text || '').split('\r\n').filter((x) => x.length);
  const data = gyo.filter((x) => x.indexOf('2202700') === 0);
  const retsu = data.map((x) => x.split(',').length);
  const zure = retsu.filter((n) => n !== 139).length;
  /* 異動の別＝21番目（0始まりで 20） */
  const idou = data.map((x) => x.split(',')[RETSU_IDOU]);
  const shi = String(shirushi || '');
  /* ★自分の 人の 行★＝10列目（氏名漢字）に 指紋が 入って いる 行 */
  const jibunBan = shi
    ? data.map((x, i) => (String(x.split(',')[RETSU_NA] || '').indexOf(shi) >= 0 ? i : -1)).filter((i) => i >= 0)
    : [];
  /* ★★当たった 行の 氏名の 欄を そのまま 返す★★（指示役1 の 叩き ②）
     ★なぜ 要るか★ … `String(Date.now()).slice(-6)` は ★下6桁＝10^6 ミリ秒★
       ＝★★約 16分40秒（1,000秒）で 同じ 数に 戻る★★
       ⇒ ★倉庫に 残って いる 置き土産と ★同じ 指紋★に なり得る★
     ★向きは 安全側★ … 当たれば `jibun` が 2 ⇒ `jibun === 1` が ★赤★
       （★黙って 緑に なるのでは ない★）
     ★だが 赤の 字が「自分 2本」だけでは ★訳が 衝突だと 分からない★
       ⇒ ★当たった 行の 名前を 並べる★
     ★字は latin1 で 読んで いる★＝漢字は 化ける ので
       ★読める 字だけ 残し 残りは `・` に する★（★指紋の 6桁は ASCII＝残る★） */
  const yomeru = (x) => String(x || '').replace(/[^\u0020-\u007e]/g, '・');
  return { gyo: gyo.length, data: data.length, retsu: retsu[0] || 0, zure, idou,
    shirushi: shi, shirushiNashi: !shi,
    /* ★★指紋を 探した 所★★＝★行 全体では ない★（指示役1 の 叩き ③）
       ★行 全体で 探すと `1234-567890`（基礎年金）・金額・日付に
         ★同じ 6桁が 入り得る★ ⇒ ★他人の 行を「自分」と 数える＝★偽の 緑★
       ⇒ ★氏名の 欄（r[9]）の 中だけ★ を 見る★ */
    sagashitaTokoro: '氏名漢字の 欄（' + (RETSU_NA + 1) + '列目）の 中だけ（★行 全体では 探さない★）',
    jibun: jibunBan.length, jibunBan: jibunBan,
    jibunIdou: jibunBan.map((i) => idou[i]),
    jibunNa: jibunBan.map((i) => yomeru(data[i].split(',')[RETSU_NA])),
    hokaNoHito: data.length - jibunBan.length };
}

if (SELF) {
  console.log('\n[fuyo-ui] ★自己確認★（★物差しそのもの★・ブラウザを 使わない）');
  let ng = 0;
  const iu = (nm, good) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + nm + (good ? '' : '  ★思っていたのと 違う★')); };
  const CR = String.fromCharCode(13) + String.fromCharCode(10);
  const gyo1 = ['2202700'].concat(new Array(138).fill('')).join(',');
  const seikaku = gyo1.slice(0, gyo1.length);
  const a = csvMiru('管理レコード' + CR + seikaku + CR);
  iu('データ行を 1本 数える', a.data === 1);
  iu('列は 139', a.retsu === 139);
  iu('ずれ 0', a.zure === 0);
  const kaketa = seikaku.split(',').slice(0, 138).join(',');
  iu('★1列 減らしたら ずれと 数える★', csvMiru(kaketa + CR).zure === 1);
  const ido2 = seikaku.split(','); ido2[20] = '2';
  iu('異動の別を 読める', csvMiru(ido2.join(',') + CR).idou[0] === '2');
  iu('空なら 0本', csvMiru('').data === 0);
  /* ★★指紋で 自分の 行だけ 抜く★★（2026-09-25）
     ★ここが ★今日 赤に なった 因★の 物差し★
     ★他人の 行を 2本 先に 置いて ★後ろに 自分★ を 置く★
       ⇒ 前の 判じ（`data === 1` と `idou[0]`）は ★両方 外れる★
       ⇒ 新しい 判じ（`jibun === 1` と `jibunIdou[0]`）は ★両方 当たる★ */
  {
    const tsukuru = (na, ido) => {
      const c = new Array(139).fill('');
      c[0] = '2202700'; c[RETSU_NA] = na; c[RETSU_IDOU] = ido;
      return c.join(',');
    };
    const hoka1 = tsukuru('CI試験111111', '1');
    const hoka2 = tsukuru('CI試験222222', '1');
    const jibun = tsukuru('手試験999999', '3');
    const t = [hoka1, hoka2, jibun].join(CR) + CR;
    const m = csvMiru(t, '999999');
    iu('★他人 2本＋自分 1本 … 紙全体は 3本', m.data === 3);
    iu('★★自分の 行は 1本★★', m.jibun === 1);
    iu('★他人の 行を 数えて いる', m.hokaNoHito === 2);
    iu('★★自分の 異動の別は「3」★★', m.jibunIdou[0] === '3');
    iu('★前の 判じなら 外れて いた（`idou[0]` は「1」）', m.idou[0] === '1');
    iu('★指紋を 渡さなければ 「印無し」を 返す', csvMiru(t).shirushiNashi === true);
    iu('★当たらない 指紋なら 自分は 0本（★緑に しない 為★）', csvMiru(t, '000000').jibun === 0);
    /* ★空振り止め★＝★自分の 行の 異動の別を わざと 変えたら 違う 値が 出るか★ */
    const waza = [hoka1, hoka2, tsukuru('手試験999999', '2')].join(CR) + CR;
    iu('★★わざと 異動の別を 変えたら 変わる（空振りで ない）★★',
      csvMiru(waza, '999999').jibunIdou[0] === '2');
    /* ★★指紋は 約 16分40秒で 巡る★★（指示役1 の 叩き ②・09-25）
       ⇒ ★倉庫に 残った 置き土産と 同じ 指紋に なり得る★
       ⇒ ★向きは 安全側＝`jibun` が 2 に なって ★赤★★（黙って 緑に しない） */
    const butsukaru = [tsukuru('CI試験999999', '1'), jibun].join(CR) + CR;
    const mb = csvMiru(butsukaru, '999999');
    iu('★★指紋が 衝突したら 自分が 2本＝★赤に なる★★★', mb.jibun === 2);
    iu('★衝突した 相手を 名指しで 出す', mb.jibunNa.length === 2
      && mb.jibunNa.every((x) => x.indexOf('999999') >= 0));
    /* ★★探す 所は ★氏名の 欄だけ★★（指示役1 の 叩き ③）
       ⇒ ★行 全体で 探すと `1234-567890`（基礎年金）に `123456` と `567890` が 入って いる
       ⇒ ★他人の 行を「自分」と 数える＝★偽の 緑★（★こちらは 向きが 危ない★） */
    const kiso = (() => {
      const c = new Array(139).fill('');
      c[0] = '2202700'; c[RETSU_NA] = 'CI試験111111'; c[14] = '1234'; c[15] = '567890'; c[RETSU_IDOU] = '1';
      return c.join(',');
    })();
    iu('★★基礎年金に 同じ 6桁が 入って いても 自分と 数えない★★★',
      csvMiru(kiso + CR, '567890').jibun === 0);
    iu('★探した 所を 出して いる', /氏名漢字の 欄（10列目）/.test(mb.sagashitaTokoro));
  }
  /* ★★門の 空振り止め★★（2026-09-25・指示役1「『入れた』と 書く 前に『仕事を した』所を 1回 見ろ」）
     ★なぜ ★偽の 控え★ で やるか★ … ★実ブラウザでは ★手元で 覆いが 出ない★★
       ⇒ ★失敗 0／黙り 0 に なる★＝★★門が 仕事を した 所を 一度も 見て いない★★
       ⇒ ★外に 出した `wakeru` に ★４通り 全部★ を 食わせる★
     ★分け方の 根拠は 実測★（★abort→`requestfailed` だけ／宙吊り→３つとも 来ない★） */
  {
    const nise = [
      { n: 1, ban: 1, muki: 'GET', tsuita: 1, owari: 1 },                    /* ★返った★ */
      { n: 2, ban: 0, muki: 'POST', tsuita: 0, shippai: 'net::ERR_FAILED', owari: 1 }, /* ★失敗★ */
      { n: 3, ban: 0, muki: 'GET', tsuita: 0, owari: 1 },                    /* ★控えの 漏れ★ */
      { n: 4, ban: 0, muki: 'POST', tsuita: 0 },                             /* ★黙って いる★ */
    ];
    const w = wakeru(nise);
    iu('★全 4本と 数える', w.zen === 4);
    iu('★返ったは 1本', w.kaetta.length === 1);
    iu('★★失敗を 「返って いない」と 数えない（失敗 1本）★★', w.shippai.length === 1);
    iu('★控えの 漏れを 別に 数える（1本）', w.more.length === 1);
    iu('★★本当に 黙って いるは 1本だけ★★', w.damari.length === 1 && w.damari[0].n === 4);
    iu('★★前の 数え方なら 「未返 3本」と 出て いた★★',
      nise.filter((x) => !x.tsuita).length === 3);
    iu('★空なら 全部 0', wakeru([]).damari.length === 0 && wakeru([]).zen === 0);
    iu('★配列でなくても 転ばない', wakeru(null).zen === 0);
    /* ★逆順★ … ★欠けた 分だけ ずれて も 「順は 保たれて いる」と 出るか★ */
    const zure = [{ n: 1, ban: 0 }, { n: 2, ban: 1 }, { n: 3, ban: 2 }, { n: 4, ban: 3 }];
    iu('★★１本 欠けて 番号が ずれて も 逆順は 0★★', gyakuJun(zure).kazu === 0);
    iu('★参考の「番号の ずれ」なら 3本と 出る（★意味の 無い 数★）',
      zure.filter((x) => x.ban && x.n !== x.ban).length === 3);
    const honto = [{ n: 1, ban: 2 }, { n: 2, ban: 1 }];
    iu('★★本当に 差し戻ったら 1本と 出る（空振りで ない）★★', gyakuJun(honto).kazu === 1);
    /* ★★重なり★★ … ★新しい 見立ての 物差し★
       ★当てる 場所を 1つずつ 試す★＝★重ならない 組で 0 が 出るか★ を 先に 見る */
    {
      /* ★重ならない★ … 1本目が 終わって から 2本目を 出して いる */
      const betsu = [{ n: 1, muki: 'POST', dashi: 100, owari: 200 },
        { n: 2, muki: 'POST', dashi: 200, owari: 300 }];
      const k1 = kasanari(betsu, 'POST');
      iu('★重ならない 組は 0組／同時は 最大 1本', k1.kumi.length === 0 && k1.saidai === 1);
      /* ★重なる★ … 1本目が 飛んで いる 途中で 2本目を 出して いる */
      const kasa = [{ n: 1, muki: 'POST', dashi: 100, owari: 300 },
        { n: 2, muki: 'POST', dashi: 250, owari: 400 }];
      const k2 = kasanari(kasa, 'POST');
      iu('★★重なったら 1組と 出る（空振りで ない）★★', k2.kumi.length === 1);
      iu('★重なった 長さを 出す（50ms）', k2.kumi[0] && k2.kumi[0].kasanari === 50);
      iu('★★同時に 飛んで いた 最大は 2本★★', k2.saidai === 2);
      iu('★読み(GET)を 数えない（向きを 指定できる）',
        kasanari([{ n: 1, muki: 'GET', dashi: 100, owari: 300 },
          { n: 2, muki: 'GET', dashi: 200, owari: 400 }], 'POST').honsu === 0);
      iu('★終わりが 分からない 物は 数えない',
        kasanari([{ n: 1, muki: 'POST', dashi: 100 }, { n: 2, muki: 'POST', dashi: 150, owari: 200 }], 'POST')
          .kumi.length === 0);
      iu('★空なら 0', kasanari([], 'POST').saidai === 0 && kasanari(null).honsu === 0);
    }
    /* ★★失敗を 棚ごとに 数える★★＝★門の 空振り止め★ */
    {
      const nise2 = [
        { n: 1, tana: 'pay_payslips', muki: 'POST', tsuita: 0, shippai: 'x' },
        { n: 2, tana: 'pay_payslips', muki: 'POST', tsuita: 0, shippai: 'x' },
        { n: 3, tana: 'pay_payslips', muki: 'GET', tsuita: 0, shippai: 'x' },
        { n: 4, tana: 'pay_companies', muki: 'GET', tsuita: 0, shippai: 'x' },
        { n: 5, tana: 'pay_emp_profile', muki: 'HEAD', tsuita: 0, shippai: 'x' },
        { n: 6, tana: 'pay_payslips', muki: 'POST', tsuita: 1 },   /* ★返った＝数えない★ */
      ];
      const sw = shippaiWakeru(nise2);
      iu('★失敗は 5本（返った 1本は 数えない）', sw.zen === 5);
      iu('★★保存(POST)の 失敗は 2本★★', sw.kakiKazu === 2);
      iu('★HEADを 保存と 数えない', sw.kaki.every((x) => x.muki === 'POST'));
      iu('★棚ごとに 出す', /pay_payslips POST 2本/.test(sw.ji) && /pay_companies GET 1本/.test(sw.ji));
      iu('★★保存の 失敗が 0なら 0と 出る（空振りで ない）★★',
        shippaiWakeru([{ n: 1, tana: 'pay_payslips', muki: 'GET', tsuita: 0, shippai: 'x' }]).kakiKazu === 0);
      iu('★空なら 0', shippaiWakeru([]).zen === 0 && shippaiWakeru(null).kakiKazu === 0);
    }
    /* ★★自分で 自分を 弾いた 組★★＝★門の 空振り止め★ */
    {
      const C = 'pay_companies', E = 'pay_employees';
      /* ㊀★書きの 返りが 読みより 後★ */
      const a1 = [
        { n: 1, tana: C, muki: 'POST', dashi: 100, okutta: '2026-01-01T00:00:00.000Z', owari: 900 },
        { n: 2, tana: C, muki: 'GET', dashi: 500, kaeri: '2026-01-01T00:00:00.000+00:00', owari: 600 },
      ];
      const r1 = jibunDeJibun(a1);
      iu('★★㊀書きの 返りが 後なら 1組★★', r1.honsu === 1 && r1.kumi[0].w === 1 && r1.kumi[0].g === 2);
      /* ㊁★書きの 返りは 先だが 束の 他が まだ★ */
      const a2 = [
        { n: 1, tana: C, muki: 'POST', dashi: 100, okutta: '2026-01-01T00:00:00.000Z', owari: 200 },
        { n: 2, tana: E, muki: 'POST', dashi: 110, owari: 900 },
        { n: 3, tana: C, muki: 'GET', dashi: 500, kaeri: '2026-01-01T00:00:00.000+00:00', owari: 600 },
      ];
      const r2 = jibunDeJibun(a2);
      iu('★★㊁束の 他が まだなら 1組★★', r2.honsu === 1 && r2.kumi[0].nokori.join(',') === '2');
      iu('★残って いる 棚を 出す', r2.kumi[0].nokoriTana.join(',') === E);
      /* ★重なって いない＝0組（★空振りで ない★） */
      const a3 = [
        { n: 1, tana: C, muki: 'POST', dashi: 100, okutta: '2026-01-01T00:00:00.000Z', owari: 200 },
        { n: 2, tana: E, muki: 'POST', dashi: 110, owari: 220 },
        { n: 3, tana: C, muki: 'GET', dashi: 500, kaeri: '2026-01-01T00:00:00.000+00:00', owari: 600 },
      ];
      iu('★★全部 返って から 読んで いれば 0組★★', jibunDeJibun(a3).honsu === 0);
      /* ★値が 違う＝別の 書き手＝組に しない★ */
      const a4 = [
        { n: 1, tana: C, muki: 'POST', dashi: 100, okutta: '2026-01-01T00:00:00.000Z', owari: 900 },
        { n: 2, tana: C, muki: 'GET', dashi: 500, kaeri: '2026-★-★T99:99:99.999+00:00', owari: 600 },
      ];
      iu('★★値が 違えば 0組（本当に 別の 端末の 時は 黙る）★★', jibunDeJibun(a4).honsu === 0);
      iu('★空なら 0', jibunDeJibun([]).honsu === 0 && jibunDeJibun(null).honsu === 0);
      /* ★★束で ない 棚を 束と 数えないか★★（2026-09-26・★実物で 踏んだ 穴★）
         CI 36216905374 で ★「4組」★ と 出たが 4組 とも
         ★訳が「同じ 束の 他（棚 pay_payslips）」★＝★束で ない★ */
      {
        const C3 = 'pay_companies', S3 = 'pay_payslips';
        const nise3 = [
          { n: 1, tana: C3, muki: 'POST', dashi: 100, okutta: '2026-01-01T00:00:00.000Z', owari: 200 },
          { n: 2, tana: S3, muki: 'POST', dashi: 110, owari: 900 },   /* ★束で ない★ */
          { n: 3, tana: C3, muki: 'GET', dashi: 500, kaeri: '2026-01-01T00:00:00.000+00:00', owari: 600 },
        ];
        iu('★★★`pay_payslips` を 束と 数えない（0組）★★★', jibunDeJibun(nise3).honsu === 0);
        const E3 = 'pay_employees';
        const nise4 = [
          { n: 1, tana: C3, muki: 'POST', dashi: 100, okutta: '2026-01-01T00:00:00.000Z', owari: 200 },
          { n: 2, tana: E3, muki: 'POST', dashi: 110, owari: 900 },   /* ★束★ */
          { n: 3, tana: S3, muki: 'POST', dashi: 115, owari: 950 },   /* ★束で ない★ */
          { n: 4, tana: C3, muki: 'GET', dashi: 500, kaeri: '2026-01-01T00:00:00.000+00:00', owari: 600 },
        ];
        const r4 = jibunDeJibun(nise4);
        iu('★★`pay_employees` なら 1組（空振りで ない）★★',
          r4.honsu === 1 && r4.kumi[0].nokori.join(',') === '2');
        iu('★束で ない 物は ★参考★ に 出す',
          r4.kumi[0] && r4.kumi[0].yoso.join(',') === '3' && r4.kumi[0].yosoTana.join(',') === S3);
      }
      /* ★★書式の 違いで ★毎回 0組★ に なって いないか★★
         （2026-09-26・指示役1 の 叩き）
         ★送るのは JSの `…Z`★／★返るのは DBの `…+00:00`★
         ★しかも 倉庫は ★末尾の 0 を 落とす★（`…30.79+00:00`） */
      {
        const C2 = 'pay_companies', E2 = 'pay_employees';
        /* ㊀ `Z` 対 `+00:00`（★桁は 同じ★） */
        const z1 = [
          { n: 1, tana: C2, muki: 'POST', dashi: 100, okutta: '2026-09-25T17:54:45.474Z', owari: 900 },
          { n: 2, tana: C2, muki: 'GET', dashi: 500, kaeri: '2026-09-25T17:54:45.474+00:00', owari: 600 },
        ];
        iu('★★Z と +00:00 を 同じと 見る（1組）★★', jibunDeJibun(z1).honsu === 1);
        /* ㊁★末尾の 0 が 落ちて いる★（★ここが 本番★） */
        const z2 = [
          { n: 1, tana: C2, muki: 'POST', dashi: 100, okutta: '2026-09-25T15:12:30.790Z', owari: 900 },
          { n: 2, tana: C2, muki: 'GET', dashi: 500, kaeri: '2026-09-25T15:12:30.79+00:00', owari: 600 },
        ];
        iu('★★★末尾の 0 が 落ちても 同じと 見る（1組）★★★',
          jibunDeJibun(z2).honsu === 1);
        /* ㊂★本当に 違う 時は 黙る★（★空振りで ない★） */
        const z3 = [
          { n: 1, tana: C2, muki: 'POST', dashi: 100, okutta: '2026-09-25T15:12:30.790Z', owari: 900 },
          { n: 2, tana: C2, muki: 'GET', dashi: 500, kaeri: '2026-09-25T15:12:31.790+00:00', owari: 600 },
        ];
        iu('★★1秒 違えば 0組（本当に 別の 書き手）★★', jibunDeJibun(z3).honsu === 0);
        /* ㊃★読めない 字は 組に しない★ */
        const z4 = [
          { n: 1, tana: C2, muki: 'POST', dashi: 100, okutta: '★壊れて いる★', owari: 900 },
          { n: 2, tana: C2, muki: 'GET', dashi: 500, kaeri: '★壊れて いる★', owari: 600 },
        ];
        iu('★読めない 字は 0組（★空同士を 揃ったと しない★）',
          jibunDeJibun(z4).honsu === 0);
        /* ㊄★束の 他が まだ★ を 書式違いでも 捕まえる★ */
        const z5 = [
          { n: 1, tana: C2, muki: 'POST', dashi: 100, okutta: '2026-09-25T15:12:30.790Z', owari: 200 },
          { n: 2, tana: E2, muki: 'POST', dashi: 110, owari: 900 },
          { n: 3, tana: C2, muki: 'GET', dashi: 500, kaeri: '2026-09-25T15:12:30.79+00:00', owari: 600 },
        ];
        const r5 = jibunDeJibun(z5);
        iu('★★末尾 0 落ち＋束の 他が まだ＝1組★★',
          r5.honsu === 1 && r5.kumi[0].nokori.join(',') === '2');
      }
    }
  }
  console.log(ng ? '\n★自己確認 ' + ng + '件 おかしい★' : '\n自己確認 OK');
  process.exit(ng ? 1 : 0);
}

/* ── ここから 実ブラウザ ───────────────────────────────── */

/* ★★本番の repo には 試験の 鍵が 無い（2026-09-05 の 決まりと 同じ形）★★
   ★本番の repo は 本番の 倉庫を 指す★＝test@test.com は 本番には 居ない。
   ★黙って 緑に しない★＝「ここでは 測れない・テスト線で 測っている」と 字で 言ってから 抜ける。
   ★戻す条件★＝本番の CI に 試験用の 鍵を 置いた日。 */
{
  const { kagiAru } = await import('../../tests/_hairu.mjs');
  if (!(await kagiAru(ROOT))) {
    console.log('  — ★この repo（本番）には 試験の 鍵が 無いので ここでは 測れません★'
      + '（★テスト線で 測っています★／戻す条件＝本番CIに 鍵を 置いた日）');
    process.exit(0);
  }
}
let borrow, pwLaunch, hairu, osu, ooiWoMiru, shizumaru, KAZOERU, AWASERU, GOMI_KESU, IMA, KATAZUKERU, KAISHA_HIKAE, KAISHA_MODOSU, SHIKEN_NA;
try {
  ({ borrow, launch: pwLaunch } = await import('../../scripts/_borrow-playwright.mjs'));
  ({ hairu, osu, ooiWoMiru, shizumaru } = await import('../../tests/_hairu.mjs'));
  ({ kazoeru: KAZOERU, awaseru: AWASERU, konkaiNoGomiKesu: GOMI_KESU, ima: IMA,
     kaishaHikaeru: KAISHA_HIKAE, kaishaModosu: KAISHA_MODOSU, shikenNa: SHIKEN_NA } = await import('./_souko-kazoeru.mjs'));
  ({ katazukeru: KATAZUKERU } = await import('./_kyaku_no_michi_de_katazukeru.mjs'));
} catch (e) { console.log('🟡 ★未測定★ 道具が 読めない … ' + (e && e.message)); process.exit(2); }
const wk = await borrow('fuyo-ui', 'webkit');
if (!wk) { console.log('🟡 ★未測定★ playwright を 借りられない（0件＝合格 とは 書かない）'); process.exit(2); }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const srv = http.createServer((rq, rs) => {
  const url = decodeURIComponent(rq.url.split('?')[0]);
  let p = path.join(ROOT, url);
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { rs.writeHead(404); rs.end('x'); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  rs.end(fs.readFileSync(p));
});
await new Promise((r) => srv.listen(0, r));
const PORT = srv.address().port;
const b = await pwLaunch('fuyo-ui', wk);

let pass = 0, fail = 0, mihakari = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };
const machi = (ms) => new Promise((r) => setTimeout(r, ms));
const Z = String.fromCharCode(12288);   /* 全角スペース＝姓名の 区切り（項番72） */

/* ★後始末は 殺されても 効くように★（%TEMP% の 前科と 同じ手） */
let katazukeSuru = null;
const katazuke = async () => { if (katazukeSuru) { const f = katazukeSuru; katazukeSuru = null; try { await f(); } catch (e) { /* 既に 消えている */ } } };
process.on('exit', () => { try { srv.close(); } catch (e) { /* もう 閉じている */ } });
for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, () => { try { srv.close(); } catch (e) { /* 同上 */ } process.exit(130); });

/* ★★打った値が「本当に 入ったか」を 見てから 次へ進む（2026-09-14 CIで 実測）★★
   ★手元(Windows の WebKit)では 緑・CI(Linux の WebKit)では 赤★に なった。
   落ちた 中身は ★日付の 欄だけ★＝「本人の 生年月日が まだです」「扶養に 入った日が まだです」。
   訳 … input[type=date] に ★1字ずつ 打って いた★（type()）。
        日付の 欄は ★engine と 土地の 決まりで 打ち方が 変わる★ので、1字ずつは 当てに ならない。
   ⇒ ①★fill() で 入れる★（date も そのまま 入る）
     ②★入れた後に 読み返して 見比べる★／違えば ★開き直して もう一度★（既定 3回）
     ③それでも 違えば ★false を 返す★＝呼んだ側が 🟡で 言う（★黙って 次へ進まない★）
   ★これは shutoku-ui / soshitsu-ui を CI から 外している 訳（戻す条件）と 同じ物★。 */
async function utsu(pg, sel, val, kai = 3) {
  const nozomi = String(val);
  for (let i = 0; i < kai; i++) {
    const el = await pg.$(sel);
    if (!el) { await machi(250); continue; }
    let tag = 'input';
    try { tag = await el.evaluate((e) => e.tagName.toLowerCase()); } catch (e) { await machi(250); continue; }
    try {
      if (tag === 'select') await el.selectOption(nozomi);
      else await el.fill(nozomi);
      await el.evaluate((e) => { e.dispatchEvent(new Event('change', { bubbles: true })); });
    } catch (e) { await machi(300); continue; }
    await machi(180);
    /* ★描き直った後の 物を 見る★＝掴んだ 古い 物では ない */
    const ima = await pg.$(sel).then((e2) => (e2 ? e2.inputValue() : null)).catch(() => null);
    if (ima === nozomi) return true;
    await machi(320);
  }
  return false;
}

console.log('\n[fuyo-ui] 被扶養者(異動)届を ★実ブラウザで お客さんの道どおり★ 出す');

const ctx = await b.newContext({ viewport: { width: 1000, height: 1400 }, acceptDownloads: true });
const pg = await ctx.newPage();

/* ★★倉庫（`pay_companies`）への 要求を 全部 控える★★（2026-09-25・指示役1 と 詰めた 形）
   ★なぜ★ … この 段で ★conflict の 覆いが 18〜27回★ 出る／★因は 未説明★
     ・★開き直した その時は 覆い 0★ ⇒ ★前の 段から 持ち込んだ 物では ない★
     ・★1つの job の 段は 順番に 走る＝重なれない★（段跨ぎは 折れた）
     ・★CI（ci.yml）側に 06:27:21 に 書ける 段は 居ない★（指示役1 が 数えた）
     ・★倉庫の 中に 仕掛け（trigger）も 関数も 0件★（指示役1 が 読むだけで 引いた）
     ⇒ ★★残るのは 2つ★★
        ㋐★読みが 返した 値が「自分が 書いたが まだ 返って いない」物★＝★自分で 自分を 弾いた★
        ㋑★着いた 順が 逆★＝★基準が 古い 方に 戻った★
   ★控える 物（4つ足し）★ … 出した順／着いた順／★送った `updated_at`★／★返った `updated_at`★
   ★倉庫には 1文字も 書きません★（★見るだけ★）／★この 紙 1本だけ★（13本に 広げない） */
const soukoLog = [];
{
  let dashi = 0, tsuki = 0;
  const jiOf = (s) => { try { const o = JSON.parse(s || '{}'); return o.updated_at || (Array.isArray(o) && o[0] && o[0].updated_at) || ''; } catch (e) { return ''; } };
  /* ★★見る 幅を 広げた★★（2026-09-25）
     ★前は `pay_companies` だけ★ ⇒ ★★遅い 方（`pay_employees`）を 見て いなかった★★
     ★`store.js:197` の doSave は ★３つ 同時に 出す★
        ㊀ pay_companies を 書く（★これが 先に 終わる★）
        ㊁ pay_employees を ★全員★ 書く（★人が 増えると 遅い★）
        ㊂ 差分削除の 数え
     ★`:212` 控えを 新しく するのは ★３つ 全部 終わって から★
     ⇒ ★★さ㊄の 途中に 次の 保存の 「今の updated_at を 読む」が 入ると
        ★自分が 書いた 値★を「別の端末」と 呼ぶ★★
     ⇒ ★★だから ★棚の 名★ も 控える★★ */
  const tanaOf = (u) => {
    const m = String(u).match(/\/rest\/v1\/(pay_[a-z_]+)/);
    return m ? m[1] : '';
  };
  pg.on('request', (r) => {
    try {
      if (!tanaOf(r.url())) return;
      const n = ++dashi;
      soukoLog.push({ n, tana: tanaOf(r.url()), muki: r.method(), dashi: Date.now(),
        okutta: jiOf(r.postData()), tsuita: 0, kaeri: '', ban: 0 });
      r.__n = n;
    } catch (e) { /* 控えで 転ばない */ }
  });
  pg.on('response', async (res) => {
    try {
      if (!tanaOf(res.url())) return;
      const n = res.request().__n;
      const e = soukoLog.find((x) => x.n === n);
      if (!e) return;
      e.tsuita = Date.now(); e.ban = ++tsuki; e.jotai = res.status();
      e.kaeri = jiOf(await res.text().catch(() => ''));
    } catch (e) { /* 同上 */ }
  });
  /* ★★★失敗と 終了も 拾う★★★（2026-09-25・指示役1 の 叩き ㋐から）
     ★何が 起きて いたか★
       CI `36151979249` で ★「全 151本／まだ 返って いない 1本」★ と 出た。
       ★しかし この 控えは ★`response` だけ★ を 見て いた★。
       ★Playwright は ★失敗した 要求に `response` を 出しません★（`requestfailed`）
       ⇒ ★★失敗 1本を 「返って いない」と 数えて いた 恐れ★★
       ⇒ ★★つまり これは ★app の 話でなく 私の 道具の 話★かも しれない★★
     ★包みは 正しく 見て いた★ … `scripts/_borrow-playwright.mjs:111`
       `pg.on('request', mi); pg.on('requestfinished', ow); pg.on('requestfailed', ow);`
       ⇒ ★★自分の repo の 中に 正しい 形が 在った★★
          ＝[[feedback_aru_noni_yondeinai]]（★在るのに 呼んで いない★）
     ★これで 3つに 分かれる★
       ★返った★（`response`）／★失敗した★（`requestfailed`）／★本当に 黙って いる★ */
  pg.on('requestfailed', (r) => {
    try {
      if (!tanaOf(r.url())) return;
      const e = soukoLog.find((x) => x.n === r.__n);
      if (!e) return;
      e.shippai = (r.failure() && r.failure().errorText) || '★訳が 取れない★';
      e.owari = Date.now();
    } catch (e) { /* 控えで 転ばない */ }
  });
  pg.on('requestfinished', (r) => {
    try {
      if (!tanaOf(r.url())) return;
      const e = soukoLog.find((x) => x.n === r.__n);
      if (!e) return;
      e.owari = Date.now();
    } catch (e) { /* 同上 */ }
  });
}
/* ★★直列の 数は ★画面が 開いて いる 間に 読む★★（2026-09-26）
   ★踏んだ 穴★ … ★画面が 閉じた 後に 読んで いた★
     ⇒ 出しに「★取れません＝`Store.hozonNoKazu` が 無い★」と 出た
     ⇒ ★★『直しが 入って いない』と 読めて しまう★★＝★偽の 赤★
   ⇒ ★開いて いる 間に 読み、★後で 出す★★ */
let OOI_KAZU = undefined;     /* ★覆いの 控え（`Store.ooiNoKazu()`）★ */
let HOZON_KAZU = undefined;   /* undefined＝★まだ 読んで いない★／null＝★読んだが 無い★ */
async function hozonKazuWoYomu(pg2) {
  try {
    HOZON_KAZU = await pg2.evaluate(() => {
      try { return (window.Store && Store.hozonNoKazu) ? Store.hozonNoKazu() : null; }
      catch (e) { return null; }
    });
  } catch (e) { HOZON_KAZU = undefined; }   /* ★読めなかった＝★「無い」と は 書かない★ */
  try {
    OOI_KAZU = await pg2.evaluate(() => {
      try { return (window.Store && Store.ooiNoKazu) ? Store.ooiNoKazu() : null; }
      catch (e) { return null; }
    });
  } catch (e) { OOI_KAZU = undefined; }
}

/* ★覆いが 出た 所の 前後を 並べる★（★出しに 出さないと 数えた事に ならない★） */
const soukoDasu = (naze, kazu = 8) => {
  const a = soukoLog.slice(-kazu);
  console.log('  ★倉庫への 要求（後ろ ' + a.length + '本）… ' + naze + '★');
  a.forEach((x) => console.log('     出' + x.n + '／着' + (x.ban || '-') + '  ' + (x.tana || '?') + ' ' + x.muki
    + '  ' + (x.tsuita ? (x.tsuita - x.dashi) + 'ms' : '★まだ 返って いない★')
    + '  送った「' + (x.okutta || '-') + '」  返った「' + (x.kaeri || '-') + '」'));
  /* ★★逆順は ★返って きた 物 同士★ で 比べる★★（2026-09-25 に 自分で 踏んだ）
     ★何が 起きたか★ … CI `36151979249` で
       ★全 151本／まだ 返って いない ★1本★／出した順と 着いた順が 違う ★148本★★
       ⇒ ★★『148本 逆順』は ★意味の 無い 数★★＝★1本が 返らなかったので
          その後ろの 着いた番が 全部 1つ ずれただけ★（`x.n !== x.ban` が 全部 真に なる）
       ⇒ ★★本当の 合図は ★返って いない 1本★★★＝★そちらを 名指しで 出す★
     ★直し方★ … ★着いた 物だけ 取り出し、★出した順に 並べた時 着いた番が 昇順か★を 見る★
       ＝★1本 抜けても『順は 保たれて いる』と 出る★
     ★参考で 出す★ … `n` と `ban` の ずれ（★これは 抜けの 数と 同じに なる★）
     [[feedback_imi_no_nai_kazu_wa_ichiban_mitsukenikui]]（★正しく 測れて しまう★） */
  const tsuita = a.filter((x) => x.ban);
  let gyaku = 0, mae = 0;
  const gyakuJi = [];
  tsuita.forEach((x) => {
    if (x.ban < mae) { gyaku++; gyakuJi.push('出' + x.n + '→着' + x.ban); }
    mae = Math.max(mae, x.ban);
  });
  console.log('     ⇒ ★★着いた 順が 差し戻った 本数 … ' + gyaku + '★★'
    + (gyaku ? '（' + gyakuJi.join('・') + '）' : '（★順は 保たれて います★）')
    + '／参考：番号の ずれ ' + a.filter((x) => x.ban && x.n !== x.ban).length + '本'
    + '（★抜けた 本数と 同じに なる＝★逆順では ありません★）');
  /* ★★返って いない 物を ★全部★ 名指しで 出す★★
     ★なぜ★ … ★後ろ 8本しか 出して いなかった★ので
       ★早い 所で 抜けた 1本が ★一度も 出て こなかった★★
     ★見立て★ … ★保存(POST)が 返らないと 手元の 控えが 古い まま★
       ⇒ ★倉庫の `updated_at` は 進む★ ⇒ ★次の 保存が 弾かれる＝覆い★
       ★これは ★見立て★です（★この 出しで 確かめる★） */
  /* ★★「返って いない」を ★失敗★ と ★本当に 黙って いる★ に 分ける★★
     ★前は 一緒だった★＝★失敗を「黙って いる」と 呼んで いた恐れ★
     ★時刻を 出す★＝★★どの 段で 出たかを 出しの 他の 行と 突き合わせられる★★
       （★段の 名を 担ぎ 回すと 控えが 太る＝★時刻なら ログで 当たる★） */
  const jikoku = (ms) => new Date(ms).toISOString().slice(11, 23);
  const shippai = soukoLog.filter((x) => !x.tsuita && x.shippai);
  const damari = soukoLog.filter((x) => !x.tsuita && !x.shippai && !x.owari);
  const owattaNoni = soukoLog.filter((x) => !x.tsuita && !x.shippai && x.owari);
  const daseru = (mei, a, soe) => {
    if (!a.length) { console.log('     ★' + mei + ' … 0本★'); return; }
    console.log('     ★★' + mei + ' … ' + a.length + '本★★' + (soe || ''));
    a.forEach((x) => console.log('        ★出' + x.n + '  ★' + (x.tana || '?') + '★ ' + x.muki
      + '  出した 時刻 ' + jikoku(x.dashi)
      + '  送ってから ' + (Date.now() - x.dashi) + 'ms'
      + (x.shippai ? '  ★訳「' + x.shippai + '」★' : '')
      + '  送った「' + (x.okutta || '-') + '」★'
      + (x.muki === 'POST' || x.muki === 'PATCH'
        ? '（★★保存★＝★返らないと 手元の 控えが 古い まま★★）'
        : '（★読み＝★返らなくても 控えは 古く なりません★）')));
  };
  /* ★★★決め手★★★ … ★この 瞬間 ★何が 飛んで いたか★
     ★見立て★ … ★★`pay_employees` の 書きが まだ 終わって いない のに
        `pay_companies` の 読みが 入って いる★★
     ⇒ ★その 読みが 返す 値は ★自分が さっき 書いた 値★
     ⇒ ★控えは まだ 旧い＝★自分で 自分を 弾く★
     ★外れ方★ … ★飛んで いる 物が 0本なら この 見立ては 死ぬ★ */
  {
    const ima = Date.now();
    const tobu = soukoLog.filter((x) => !x.owari && !x.tsuita);
    const saikin = soukoLog.filter((x) => x.owari && ima - x.owari < 3000);
    console.log('     ★★今 飛んで いる 要求 … ' + tobu.length + '本★★'
      + (tobu.length ? '：' + tobu.map((x) => '出' + x.n + ' ' + (x.tana || '?') + ' ' + x.muki).join('・') : '')
      + '／★直前 3秒に 終わった … ' + saikin.length + '本★'
      + (saikin.length ? '：' + saikin.slice(-6).map((x) => '出' + x.n + ' ' + (x.tana || '?') + ' ' + x.muki).join('・') : ''));
    /* ★★自分で 自分を 弾いて いるか★★
       ★最後の `pay_companies` の 読みが 返した 値★ と
       ★その 前の `pay_companies` の 書きが 送った 値★ が 同じなら
       ⇒ ★★倉庫に 入って いるのは ★自分の 書き★＝別の 端末では ない★★ */
    const kai = soukoLog.filter((x) => x.tana === 'pay_companies');
    const saigoYomi = kai.filter((x) => x.muki === 'GET' && x.kaeri).slice(-1)[0];
    const maeKaki = saigoYomi
      ? kai.filter((x) => x.muki !== 'GET' && x.okutta && x.n < saigoYomi.n).slice(-1)[0] : null;
    if (saigoYomi && maeKaki) {
      const onaji = String(saigoYomi.kaeri).slice(0, 23) === String(maeKaki.okutta).slice(0, 23);
      console.log('     ★★倉庫に 入って いる 値は 誰の 物か★★'
        + '：最後の 読み（出' + saigoYomi.n + '）が 返した「' + saigoYomi.kaeri + '」'
        + '／その 前の 書き（出' + maeKaki.n + '）が 送った「' + maeKaki.okutta + '」'
        + (onaji ? '★★⇒ 同じ＝★倉庫に 在るのは ★自分の 書き★＝「別の 端末」では ない★★'
          : '★★⇒ 違う＝★本当に 別の 書き手が 在る★★'));
    } else {
      console.log('     ★倉庫に 入って いる 値は 誰の 物か … ★比べる 組が 取れません★'
        + '（読み ' + (saigoYomi ? '在り' : '無し') + '／前の 書き ' + (maeKaki ? '在り' : '無し') + '）');
    }
  }
  daseru('★失敗した 要求★（`requestfailed`）', shippai,
    '（★★これは app の 話★＝★前は 「返って いない」と 数えて いた★★）');
  daseru('★終わったのに 中身を 拾えて いない 要求★', owattaNoni,
    '（★★これは 私の 控えの 漏れ★★）');
  /* ★★重なりを 出す★★＝★新しい 見立ては ここで 生きるか 死ぬか 決まる★ */
  {
    const kp = kasanari(soukoLog, 'POST');
    const kz = kasanari(soukoLog);
    console.log('     ★★保存(POST)が 重なった 組 … ' + kp.kumi.length + '組★★'
      + '（保存 ' + kp.honsu + '本／★同時に 飛んで いた 最大 ' + kp.saidai + '本★）'
      + (kp.kumi.length
        ? '：' + kp.kumi.slice(0, 6).map((x) => '出' + x.a + 'と出' + x.b + '（' + x.kasanari + 'ms）').join('・')
          + '★★⇒ ２本目が 前の `updated_at` を 持って 行く⇒弾かれる 道が 在る★★'
        : '（★重なって いません＝★この 見立ても 死にます★）'));
    console.log('     ★読みも 入れた 全体 … 同時に 飛んで いた 最大 ' + kz.saidai + '本'
      + '（★保存→読みの 組み合わせも ここに 入る★）');
  }
  daseru('★本当に 黙って いる 要求★', damari,
    '（★★終了も 失敗も 来て いない＝★これだけが 本物の 「返らない」★★）');
};
/* ★★「前」は ★ログインの 前★に 数える（2026-09-14 実測で 直した）★★
   ログインの 後に 数えたら ★人 4→3（-1）★で 赤に なった。
   訳＝★ログインした 途端に 既定の『従業員 1』が 倉庫に 書かれる★（今日 見つけた 幻の人）。
     その後 読み直しが 着いて 消えるので、★後に 数えると 1人 減って 見える★。
   ⇒ ★1行も 触っていない 時の 数★を 土台に する。 */
/* ★始まりは ★倉庫の 時計★に 聞く★＝手元の 時計から 遡ると
   ★直前の 試験の ゴミまで 窓に 入り、自分が 作っていない 物を 消す★（総なめで 捕まった）。 */
const HAJIME = await IMA().then((x) => (x.ok ? x.t : new Date(Date.now() - 5000).toISOString()));  /* ★この回の 始まり★＝これ以降の 孤児だけ 消す */
  /* ★会社の 欄も 控える★＝この試験は `#c-pref` ほか 会社の 欄に 打つ（363-380行）が ★戻す 字が 無かった★
     ⇒ 手元の 総なめ #25 で ★kyuyo.pay_companies の 指紋 ずれ★で 赤に なった。 */
  const KAISHA_MAE = await KAISHA_HIKAE();
  const soukoMae = await KAZOERU();
  console.log('  倉庫（前） … ' + (soukoMae.ok
    ? '人 ' + soukoMae.hito + ' ／ 明細 ' + soukoMae.meisai
    : '🟡 ★読めない★ ' + soukoMae.naze));

const h = await hairu(pg, 'http://localhost:' + PORT + '/kyuyo/index.html', '.bn[data-scr="scr-settings"]');
if (!h.haitta) {
  console.log('  🟡 ★未測定★ ' + h.kai + '回 試して 入れなかった … ' + (h.naze || '（無し）'));
  await b.close(); srv.close(); process.exit(2);
}
await machi(600);

/* ★★本体に 入る 直前に 1回 開き直す★★（2026-09-25・指示役1 の 決め ㋐-2）
   ★何が 起きて いたか★ … この 段で ★conflict の 覆いが 27回★（`448f588`）／22回（`a7cc4cc`）
     ＝★今まで `toziru()` が 黙って 閉じて いた★物が 門で 見えるように なった。
   ★★因は まだ 掴めて いません★★
     ・私の 見立て「前の 段の 保存が 段を 跨いで 着く」 … ★折れた★
       （1つの job の 段は ★順番に 走る＝重なれない★／閉じる前の 待ちは ★22回とも 要求 0回★）
     ・「CI（ci.yml）と 並走」 … ★折れた★（06:27:21 の 時点で 書ける 段は CI 側に 居ない＝指示役1 が 数えた）
     ⇒ ★★残る 書き手が 居ません＝㉕-2 は 未説明の まま★★（★閉じません★）
   ★なぜ それでも 開き直すか★
     ・★門は 効いて います★（27回 見えた）／★赤が 押しを 止めて います★
     ・★開き直す＝客が 新しく 開いた 時と 同じ★＝★隠して いません★
     ・★★開き直した ★後★に 覆いが 出れば 門が その場で 止めます★★＝★signal は 残る★
   ★これは『直した』では ありません★＝★『試験が 前を 引きずらない 形に した』★ */
{
  const oMae = await ooiWoMiru(pg);
  await pg.reload({ waitUntil: 'domcontentloaded' }).catch(() => null);
  for (let i = 0; i < 60; i++) { if (await pg.$('.bn[data-scr="scr-settings"]')) break; await machi(250); }
  const sh = await shizumaru(pg);
  const oAto = await ooiWoMiru(pg);
  console.log('  ★開き直した（訳＝前の 段の 続きを 持ち込まない／★因は 未説明の まま★）★'
    + ' … 前の 覆い ' + (oMae.aru ? '在り「' + oMae.ji.slice(0, 40) + '」' : '無し')
    + ' ／ ★後の 覆い ' + (oAto.aru ? '★在り「' + oAto.ji.slice(0, 40) + '」★' : '無し') + '★'
    + ' ／ 静まるまで ' + sh.matta + 'ms（要求 ' + sh.yokyu + '回・'
    + (sh.shizuka ? '静まりました' : '★上限に 当たった★') + '）');
}

try {
  /* ── 従業員を 1人 足す（★今 足した 人だけ 触る★） ────────────── */
  await osu(pg, '.bn[data-scr="scr-settings"]'); await machi(500);
  await osu(pg, '#set-seg .seg-b[data-set="emp"]'); await machi(800);
  const mae = await pg.evaluate(() => document.querySelectorAll('#emp-list .mco').length);
  /* ★★置き土産は ★倉庫の 行数★ で 数える（2026-09-14 私の 不始末）★★
     前は ★画面の 札の 数★だけを 見て「ゴミ0」と 緑を 出していた。
     ところが 倉庫には ★今日 足した 人が 2人 残っていた★
       （画面からは 消えた／★保存が 後から 走って 書き戻る・消しが 届かない★）。
     ＝★今日 ずっと 潰してきた「測ったつもり」を 私の 後始末が やっていた★。
     ⇒ ★倉庫の pay_employees と pay_payslips の 行数を 前後で 突き合わせる★。
       ★画面から 消えた は 緑の 根拠に しない★。 */
    /* ★★札が 増えるのを 待つ（2026-09-14 CIで 捕まった）★★
       前は ★足して 0.9秒 待つだけ★で 一番 後ろの 札を 読んでいた。
       ★CI は 遅い★ので 描き直しが 間に合わず、★増える前の 札★を 掴んだ:
         「（はじめに 居た 人 1人 → 今 足した 人＝★札 0番目★）」
         ⇒ その後 ★欄が 1つも 見つからない★（name/kana/… 全部）＝赤。
       ＝★手元は 緑・CIは 赤★の 一番 見つけにくい 形（今日 3回目）。
       ⇒ ★数が 増えた事を 見てから 読む★（★時間では なく 数で 待つ★）。 */
      {
        const kazuMae = await pg.evaluate(() => document.querySelectorAll('#emp-list .mco').length);
        await osu(pg, '#b-add-emp');
        let fueta = false;
        for (let i = 0; i < 40; i++) {                 /* 20秒 */
          const n = await pg.evaluate(() => document.querySelectorAll('#emp-list .mco').length).catch(() => -1);
          if (n > kazuMae) { fueta = true; break; }
          await machi(500);
        }
        if (!fueta) console.log('       🟡 ★札が 増えない★（20秒 待った）＝この先は 当てに ならない');
        await machi(400);
      }
  const IDX = await pg.evaluate(() => {
    const c = Array.from(document.querySelectorAll('#emp-list .mco'));
    return c.length ? c[c.length - 1].getAttribute('data-i') : null;
  });
  if (IDX === null) { console.log('  🟡 ★未測定★ 従業員の 札が 1枚も 無い'); throw new Error('no-card'); }
  const CARD = '#emp-list .mco[data-i="' + IDX + '"]';
  console.log('  （はじめに 居た 人 ' + mae + '人 → 今 足した 人＝札 ' + IDX + '番目）');
  katazukeSuru = async () => {
    /* ★★片づけは 客の 道で★★（2026-09-15・裏口を 閉じた）
       前は ここで ★JSで イベントを 投げて★ 削除ボタンを 叩いていた
       ＝[[feedback_js_dispatched_event_is_not_the_customer_path]] の 通り ★門を 迂回する★。
       実物で 測り直した ところ ★4段とも 本物の click で 通りました★
       （札を 開く → 詳細設定 → 削除 → 確認）。⇒ ★裏口は 要らない★。
       ★名前では なく 札の 番号で 渡す★＝この 試験は ★人を 足してから 後で 名前を 打つ★ので、
       途中で 落ちた 時は まだ 名前が 無い。 */
    const r = await KATAZUKERU(pg, { ban: IDX, machi, osu });
    r.michi.forEach((m) => console.log('       片づけ … ' + m));
    if (!r.ok) console.log('       🟡 ★客の 道で 消せなかった★ … ' + r.naze);

    /* ★★ここは 裏口を 残す（2026-09-15・指示役1 と 決めた）★★
       ★訳＝アプリに 明細を 消す 道が 無い★（字で 数えた）:
         ・app.js 5355〜 の「この従業員を削除」は ★state.employees から 抜くだけ★
         ・store.js:206 が pay_employees の 行は 本当に 消す
         ・★pay_payslips を delete している 所は 1か所も 無い★
           （消しているのは payslip_batches:87 と pay_meisai_docs:448 だけ）
       ⇒ ★人は 消える／明細は 倉庫に 残る＝孤児に なる★。★実測★（2026-09-15・本物の click 1回）
         … 人 4→3 なのに ★孤児 3,716→3,717＝+1★。
       ⇒ ★これは 客にも 起きる 欠陥＝別件（司さん待ち・指示役1 が 持つ）★。
       ★★この 裏口を 外す 条件★★
         ＝★アプリが 削除の時に その人の pay_payslips も 消すように なったら★ ここを 消す。
       ★条件を 書かない 裏口は 永久に 残る★ので、必ず この 3行を 一緒に 動かす事。 */
    const kesu = await GOMI_KESU(HAJIME);
    if (!kesu.ok) console.log('       🟡 明細を 消せなかった … ' + kesu.naze);
    const ks = await KAISHA_MODOSU(KAISHA_MAE);
    console.log('       片づけ … ' + (ks.ok ? '★会社の 欄を 控えに 戻した ' + ks.n + '行★（媒体通番は 戻さない）'
      : '🟡 会社の 欄を 戻せなかった … ' + ks.naze));
  };

  console.log('  ★この先は 後始末つき★（殺されても 足した 人を 消す）');
  T('★従業員を 1人 足せた（画面の ボタンから）', true);

  /* ★詳細設定を 開く★＝本人の 欄も 家族も この中に 在る（実測） */
  const nage = (c, sel) => pg.evaluate((x) => {
    const card = document.querySelector(x.c);
    const el = card && card.querySelector(x.sel);
    if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return !!el;
  }, { c, sel }).catch(() => false);
  /* ★かたまりは 1つずつ 閉じている★＝本人の 欄も 家族も その中（実測で 6欄 見つからなかった）。
     ⇒ ★この札の かたまりを 全部 開く★。
     ★ここの JS投げが 許される 訳（2026-09-15 に 線を 引き直した）★
       ＝★開け閉めは ★打ち込みの 道★／★測る所（届が 本当に 出るか）は 本物の click★
       ＝★門を 迂回しない★のが 決まりの 訳で、「JSを 一切 使うな」では ない。
     ★注意★＝★片づけは もう JS投げでは ありません★（客の道＝_kyaku_no_michi_de_katazukeru.mjs）。 */
  /* ★★開く つもりが 閉じていた（2026-09-14 実測）★★
     かたまりの 印は ★切り替え★なので、★既に 開いている 物を 押すと 閉じる★。
     1回目で 家族が 開き、2回目で 家族が 閉じ 本人の 欄が 開いた＝★毎回 どこかが 欠けた★。
     ⇒ ★欲しい 欄が 出るまで 押す★＝★開いたか どうかは ★欄の 有無★で 決める★
       （印が 付いたかでは 見ない＝会社の 決まり）。 */
  const aruka = (sel) => pg.evaluate((x) => !!document.querySelector(x), sel).catch(() => false);

  /* ★★時間では なく ★数★で 待つ（2026-09-15・CI で 4回中 2回 落ちた）★★
     ★落ちていた 形★ … 押した 後 ★決まった 秒（700ms）だけ 待って★ 欄が 在るかを 見て いた。
       ⇒ ★CI は 手元より 遅い★＝★まだ 出ていない のに「無い」と 判じ★、
         次の かたまりを 押して ★開いていた 物を 閉じる★（印は 切り替え）
       ⇒ ★増えた/減った/変わった の 3つとも「ボタンが 押せない」で 赤★。
       ★数★ … 手元 3回とも 緑／CI ★2勝2敗★（258027e緑・067c35e赤・b4148ae緑・55367c2赤）
     ⇒ ★★欲しい 欄が 何本 出たかを 数え、★増えるまで★ 待つ★★（上限つき）。
     ★待った 秒を 出す★＝★上限が 妥当かを 次の 人が 直せる★（今日 何度も 使った 形）。
     ★★『上限 ◯秒』は『◯秒で 止まる』では ない★★＝1回の 見に 時間が 掛かる ぶん はみ出す。 */
  const kazoeru2 = async (hoshii) => {
    let n = 0;
    for (const sel of hoshii) { if (await aruka(sel)) n++; }
    return n;
  };
  const matsu = async (hoshii, mae, ue) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ue) {
      const n = await kazoeru2(hoshii);
      if (n > mae || n === hoshii.length) return { n, matta: (Date.now() - t0) / 1000 };
      await machi(300);
    }
    return { n: await kazoeru2(hoshii), matta: (Date.now() - t0) / 1000 };
  };
  const akeru = async (k) => {
    await pg.evaluate((x) => {
      const card = document.querySelector(x.c); if (!card) return;
      const t = Array.from(card.querySelectorAll('[data-dsub]'))
        .find((e) => String(e.getAttribute('data-dsub')).endsWith(':' + x.k));
      if (t) t.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }, { c: CARD, k }).catch(() => null);
  };
  const hiraku = async (hoshii) => {
    let mae = await kazoeru2(hoshii);
    let mattaKei = 0;
    for (const k of ['zaiseki', 'zei', 'shaho', 'teate', 'kazoku']) {
      if (mae === hoshii.length) break;
      await akeru(k);
      /* ★探す ための 待ちは 短いまま（1つ ぶん 6秒）★
         ★一度 18秒に 上げて 測ったら 手元が 18.2秒 → ★54.3秒★に なった★
         ＝★欄が 入って いない かたまりでも 18秒 待つ★から。
         ⇒ ★探す 待ちは 元へ戻し、下の ★まとめ待ち★だけ 長くする★（そこが 遅い 機械の 効く所）
         ＝★外れた 見込みも 残す★[[feedback_hazureta_mikomi_wo_sutenai]] */
      const r = await matsu(hoshii, mae, 6000);
      mattaKei += r.matta;
      mae = r.n;
    }
    if (mae !== hoshii.length) {
      /* ★最後に もう一度 まとめて 待つ★＝★遅い 機械で 出そろう のを 逃さない★ */
      /* ★★まとめ待ち 12秒 → 36秒★★（2026-09-19 CI の 実測で 上げた）
         ★測った★ … 同じ 機械・同じ 回で ★「かたまりを 開く」に 18.2秒★
           次の 段は ★30.2秒 待って 1個 足りない★で 赤（★手元は 0.0秒★）。
         ⇒ ★遅さは 手元の 何十倍★＝★12秒は 近すぎた★（「たまに 赤」の 正体）
         ⇒ ★早く 出れば すぐ 抜ける★＝手元の 速さは 変わらない。
         ＝[[feedback_yure_to_yobu_mae_ni_dore_dake_tarinai_ka_hakare]] */
      /* ★★`mae - 1` だと ★まとめ待ちが 1度も 効きません★★（2026-09-21 字で 決めた）
         `matsu` は ★`n > mae` なら すぐ 戻る★。何も 見つかって いない 時は mae = 0 なので
         ★`0 > -1` が ★最初から 真★★ ⇒ ★★「36秒 待つ」が ★即 戻る★★
         ⇒ ★実際の 上限は かたまり 5つ × 6秒 ⇒ ★丁度 30秒★だけだった★
         ★実測★ … 赤の 回 ★待った 31.1秒 / 31.4秒★＝★上限 そのもの（余り 0）★
         ⇒ ★★「揺れ」では なく 「足りない」★★（★揺れと 呼ぶ 前に どれだけ 足りないか 測れ★）
         ★これは 09-19 に 「12秒 → 36秒 に 上げた」と 紙に 書いた 当の 待ちです★
         ⇒ ★★「変えた つもり」は 出しの 字で 確かめろ★★＝★上げた はずの 待ちが 一度も 動いて いなかった★ */
      const r2 = await matsu(hoshii, mae, 36000);
      mattaKei += r2.matta;
      mae = r2.n;
    }
    const nokori2 = [];
    for (const sel of hoshii) { if (!(await aruka(sel))) nokori2.push(sel); }
    return { nokori: nokori2.length, matta: mattaKei.toFixed(1) + '秒',
      doko: nokori2.map((x) => x.replace(/^.*\[data-/, '[data-')) };
  };

  /* ★★詳細設定の 印は「切り替え」＝押すたび 開いたり 閉じたり（2026-09-14 実測で 踏んだ）★★
     ★毎回 押す★書き方だと ①の 回で 閉じ、②で 開き…と 交互に なり、
     ★増えた の 5欄（職業/同居/収入/入った日/理由）だけ 打てず★「出せる人が いません」に なった。
     ⇒ ★開いているかは『中の 欄が 在るか』で 見る★（印が 付いたかでは 見ない＝会社の 決まり）。 */
  const dsAkeru = async () => {
    /* ★ここも 時間では なく 数で 待つ★（上と 同じ 訳） */
    const t0 = Date.now();
    let atta = null;
    for (let i = 0; i < 3; i++) {
      if (await aruka(CARD + ' [data-dsub]')) return true;
      /* ★★`nage` は ★押す 物が 在ったか★ を 返して いるのに 捨てて いました★★
         （2026-09-21＝今日 4つ目の「飲む」。★押す 物が 無い★と
          ★押したが 開かない★は ★全く 別の 枝★なのに 同じ 顔に なる） */
      atta = await nage(CARD, '.emp-dtgl[data-dtoggle]');
      const r = await matsu([CARD + ' [data-dsub]'], 0, 6000);
      if (r.n > 0) return true;
    }
    /* ★★ここも ★上限 そのもの★ で 落ちて いました★★（2026-09-21）
       ★上★ … 3回 × 6秒 ⇒ ★丁度 18秒★／★実測 ★待った 18.7秒★＝★余り 0★
       ⇒ ★揺れでは なく 足りない★。`hiraku` と 同じ 形で ★最後に まとめて 待つ★。
       ★遅く ならない 訳★ … `matsu` は ★出た すぐ 戻る★＝★待ちの 代金は 落ちる 時だけ★ */
    if (!(await aruka(CARD + ' [data-dsub]'))) {
      const r3 = await matsu([CARD + ' [data-dsub]'], 0, 36000);
      if (r3.n > 0) { console.log('       ★詳細設定は まとめ待ちで 開きました … ' + r3.matta.toFixed(1) + '秒★'); return true; }
    }
    const ok = await aruka(CARD + ' [data-dsub]');
    if (!ok) {
      /* ★★「開かない」だけでは 因が 決まらない★★＝★番を 全部 出す★
         ★見る 物★ … ★札自体が 在るか★／★切り替えの 印が 何個★／★中身が 何個★
           ／★覚い（モーダル）が 出て いないか★（今日 `.wm-qrall` で 捕まえた 形）
           ／★印の 真ん中に 居る 物★（`elementFromPoint`） */
      const mi = await pg.evaluate((c) => {
        const card = document.querySelector(c);
        const tg = card && card.querySelector('.emp-dtgl[data-dtoggle]');
        let ue = null;
        if (tg) {
          const b = tg.getBoundingClientRect();
          const e2 = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
          ue = e2 ? (e2.tagName.toLowerCase() + (e2.className ? '.' + String(e2.className).split(' ').join('.') : '')).slice(0, 60) : '(誰も 居ない)';
        }
        return { fuda: !!card, tgl: card ? card.querySelectorAll('.emp-dtgl[data-dtoggle]').length : -1,
          dsub: card ? card.querySelectorAll('[data-dsub]').length : -1,
          ooi: document.querySelectorAll('.ui-modal-ov').length, ue: ue, sai: window.__saiKazu,
          fudaKazu: document.querySelectorAll('#emp-list .mco').length };
      }, CARD).catch((e) => ({ dame: String((e && e.message) || e).slice(0, 60) }));
      console.log('       🟡 詳細設定が ' + ((Date.now() - t0) / 1000).toFixed(1) + '秒 待っても 開かない'
        + ' … ★押す 物が 在ったか ' + JSON.stringify(atta) + '★ ／ ' + JSON.stringify(mi));
    }
    return ok;
  };
  await dsAkeru();
  const HON = ['seibetsu', 'zip', 'address', 'kisoNenkin', 'hokenshaNo'].map((f) => CARD + ' [data-f="' + f + '"]');
  /* ★★描き直しを 数える★★（2026-09-21＝指示役1 の ★枝★）
     ★見立て★ … ★開けて いる★のに ★読み込みが 遅れて 返り 画面ごと 描き直され★
       ★開いた 物が 閉じる★のでは ないか
       （実測済み … `reloadCloud` → `applyCloudState` → `showScreen(...)` で 描き直す／
         ★時間切れが 0か所★＝読み込みは ★何秒でも 遅れて 返る★）
     ★当てません★ … ★描き直しの 回数を 数えて 出すだけ★ */
  await pg.evaluate(() => {
    if (window.__saiKazu != null) return;
    window.__saiKazu = 0;
    const t = document.querySelector('#emp-list');
    if (!t) { window.__saiKazu = -1; return; }
    new MutationObserver((ms) => {
      for (const m of ms) {
        if (m.type === 'childList' && (m.addedNodes.length || m.removedNodes.length)) window.__saiKazu++;
      }
    }).observe(t, { childList: true, subtree: true });
  }).catch(() => null);
  const saiYomu = () => pg.evaluate(() => window.__saiKazu).catch(() => null);
  const saiMae = await saiYomu();
  console.log('       かたまりを 開く … ' + JSON.stringify(await hiraku(HON)));
  console.log('       描き直しの 回数 … 開く前 ' + saiMae + ' → 開いた後 ' + (await saiYomu()));

  /* ── ① 本人の 欄（★確定は させない★＝A案。届出に 明細の 確定は 要らない） ── */
  /* ★★名前の 頭に 席の 印を 付ける★★（2026-09-19）
     ★訳★＝★同じ 試験の 倉庫を ★この 機械★と ★GitHub の 機械★が 使う★
       ⇒ ★増えた 人が どちらの 物か 名前で 分かる★＝★門が 相手の 分で 赤に しない★
       （印が 無いと ★「どちらか 決められない」＝赤★の まま＝★CI が 走る たび 赤★）
     ★印★ … 手元＝`手` ／ 会社の 検査＝`CI`（`_souko-kazoeru.mjs` の `SEKI_SHIRUSHI`） */
  /* ★★この 6桁が ★紙の 中で 自分の 行を 見つける 指紋★★（2026-09-25）
     ★漢字では 当てられない★＝CSV は Shift_JIS を latin1 で 読むので 字が 化ける。
     ★数字は ASCII の まま 残る★。 */
  const BAN = String(Date.now()).slice(-6);
  const NA = SHIKEN_NA('試験' + BAN);
  for (const [f, v] of [['name', NA + Z + '太郎'], ['kana', 'ｼｹﾝ ﾀﾛｳ'], ['birthYmd', '1985-05-15'],
    ['seibetsu', 'male'], ['zip', '790-0001'], ['address', '愛媛県松山市1-2-3'],
    ['kisoNenkin', '1234-567890'], ['hokenshaNo', '1']]) {
    if (!(await utsu(pg, CARD + ' [data-f="' + f + '"]', v))) console.log('       🟡 欄が 無い … ' + f);
  }
  /* 家族（被扶養者）の かたまりを 開く */
  /* 家族を 1人 足す（★本物の click★＝ここは 測る所） */
  /* ★家族の かたまりを 開いてから 足す★（開いていないと ＋の ボタンも DOM に 無い） */
  /* ★★ここの 出しを 出さないと 因が 決められません★★（2026-09-21 実測で 踏んだ）
     ★何が 起きたか★ … 家族の 欄が ★約31秒 待っても 0個★（2回 連続）
       ★しかし ★＋の ボタンを 開けたか・押せたか★ が ★字に 出て いなかった★
       （`.catch(() => null)` で ★黙って 死ぬ★＝★口を 確かめずに 書いた コードは 静かに 死ぬ★）
     ⇒ ★★見られない 物は 見張れない★★＝★開けたか・押せたか・何個 在るかを 全部 出す★ */
  const kzAke = await hiraku([CARD + ' [data-kzadd]']);
  const kzBtn = await pg.evaluate((c) => document.querySelectorAll(c + ' [data-kzadd]').length, CARD);
  let kzOsu = 'OK';
  /* ★★playwright の 「なぜ 押せないか」は ★後ろの 行に 出る★★（2026-09-21 CI で 踏んだ）
     ★前★ … ★行を 切って 頭の 80字だけ★ ⇒ `page.click: Timeout 8000ms exceeded.` だけ 残った
       ⇒ ★★訳（見えない／動いて いる／★覆いに 遮られて いる★）を 私が 切って 捨てて いた★★
     ⇒ ★行を 繋げて 400字まで 残す★（★出しを 自分で 切ったら 書く★） */
  /* ★★押す 前に 覆いを 見る★★（2026-09-24・指示役1 の 決め＝㉜）
     ★訳（09-24 実測）★ … ここは ★`osu()` を 通らない 直の click★。
       conflict の 覆い（`div.ui-modal-ov`）が 出て いた 回に
       ★`page.click: Timeout 8000ms` が 15回・約2分 粘って 死に★、
       ★訳は ログを 掘るまで 分からなかった★（`intercepts pointer events` の 行まで 追って やっと）。
     ⇒ ★答えない／閉じない／押さない★＝★conflict が 起きた 事を 消さない（signal を 残す）★
       ＝★その場で 訳つきで 止める★（★見張りの 値打ちは いつ 赤に なるか★）。
     ★`osu()` を 通る 押しは `tests/_hairu.mjs` 側で 同じ 事を します★＝★ここは その 1か所だけの 手当て★
     （★`osu()` を 通らない 直の click は 全部で 29か所＝★残りは 未着手★★＝棚に 数で 残す）。 */
  const kzOoi = await ooiWoMiru(pg);
  if (kzOoi.conflict) {
    kzOsu = '★★覆いが 出て います（押せません）／★閉じません（答えません）★／箱の 字＝「' + kzOoi.ji + '」★★';
    console.log('       ★★押す 前に 止めました＝' + kzOsu + '★★');
    /* ★★覆いが 出た その場で 倉庫への 要求を 並べる★★（★因を 数で 割る 為★）
       見る 所 … ㋐★読みの 返りが「自分が 書いたが まだ 返って いない」物か★
                 ㋑★出した順と 着いた順が 違うか★ */
    soukoDasu('★覆いが 出た 所★');
  }
  if (!kzOoi.conflict) await pg.click(CARD + ' [data-kzadd]', { timeout: 8000 }).catch((e) => {
    /* ★★切った 事を ★数で★ 出す★★（2026-09-21＝400字では 足りなかった）
       ★実測★ … 400字で `scrolling into view if needed` まで。
         ★`intercepts pointer events` の 行まで 届いて いない★
       ⇒ ★上限を 上げる★＋★★全何字のうち 何字 出したかを 必ず 書く★★
         （★次に 足りたか 余ったかを ★数で★ 決められる★） */
    const zenji = String((e && e.message) || e).split(String.fromCharCode(10)).join(' / ');
    const UE = 1600;
    kzOsu = zenji.slice(0, UE) + '【全 ' + zenji.length + '字のうち '
      + Math.min(UE, zenji.length) + '字 出した' + (zenji.length > UE ? '＝★足りて いません★' : '＝足りて います') + '】';
  });
  console.log('       家族の ＋ボタン … 開けた ' + JSON.stringify(kzAke)
    + ' ／ DOMに ' + kzBtn + '個 ／ 押した ' + kzOsu);
  /* ★★押せなかった 瞬間の 番★★（2026-09-21＝指示役1 の ①）
     playwright の click が 待つ 物は 4つ … ★見える／動いて いない／押せる／覚いが 無い★
     ⇒ ★どれが 揃わなかったかを その場で 取る★（★今朝 `.wm-qrall` で 使った 形★）
     ★画面の 大きさも 取る★ … ★手元では 押せて CI で 押せない★ので ★違いを 探す★ */
  if (kzOsu !== 'OK') {
    const ban = await pg.evaluate((c) => {
      const card = document.querySelector(c);
      const el = card && card.querySelector('[data-kzadd]');
      if (!el) return { nai: true };
      const b = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const x = b.left + b.width / 2, y = b.top + b.height / 2;
      const ue = document.elementFromPoint(x, y);
      const na = (n) => n ? (n.tagName.toLowerCase()
        + (n.id ? '#' + n.id : '')
        + (n.className ? '.' + String(n.className).trim().split(/\s+/).join('.') : '')).slice(0, 70) : '(誰も 居ない)';
      return {
        mieru: !!(b.width && b.height) && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0',
        hako: { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) },
        gamen: { w: innerWidth, h: innerHeight },
        nakaKa: b.top >= 0 && b.left >= 0 && b.bottom <= innerHeight && b.right <= innerWidth,
        ue: na(ue), jibunKa: ue === el || (ue && el.contains(ue)),
        ooi: document.querySelectorAll('.ui-modal-ov, .modal, [aria-modal="true"]').length,
        /* ★★覚いの 正体を 名指しする★★（2026-09-21 実測）
           `.ui-modal-ov` は ★読み込み中の 覚いでは なく★
           ★`uiModal()` が 作る 確認・お知らせの 箱★（app.js:2182）
           ＝★ボタンを 押すまで 消えない★＝★お客さんも 下を 押せない★
           ⇒ ★★どの 箱かを 出さないと 直せません★★ */
        hako_no_ji: Array.prototype.slice.call(document.querySelectorAll('.ui-modal-ov')).map((o) => ({
          dai: (o.querySelector('.ui-modal-t') || {}).textContent || '(題 無し)',
          hon: ((o.querySelector('.ui-modal-b') || {}).textContent || '(文 無し)').slice(0, 200),
          botan: Array.prototype.slice.call(o.querySelectorAll('.ui-modal-btn')).map((b2) => b2.textContent),
        })),
        pe: cs.pointerEvents, disabled: !!el.disabled,
      };
    }, CARD).catch((e) => ({ dame: String((e && e.message) || e).slice(0, 80) }));
    console.log('       ★押せなかった 瞬間の 番★ … ' + JSON.stringify(ban));
  }
  await machi(1000);
  /* ★足すと 描き直る★＝欄が 出るまで もう一度 開く */
  console.log('       家族の 欄を 出す … ' + JSON.stringify(await hiraku([CARD + ' [data-kz$=":0:seiKanji"]'])));
  console.log('       描き直しの 回数（家族の 欄を 待った 後） … ' + (await saiYomu()));
  const kzAru = await pg.evaluate((c) => document.querySelectorAll(c + ' [data-kz]').length, CARD);
  T('★家族を 1人 足せた（欄が 出た）', kzAru > 0, '家族の 欄が ' + kzAru + '個');

  /* 家族の 欄を 埋める（★姓と 名は 分けて★＝2026-09-14 に そう した） */
  /* ★★2026-09-14 実測で 踏んだ★★
     data-i（札の 番号）で 家族の 欄を 指していたが、★描き直すと 番号が 変わり得る★。
     実際 異動の別を 変えても ★3通りとも 同じ 言い分★が 出た＝★切り替わっていなかった★。
     ⇒ ★番号に 頼らず「後ろが :欄の名前 で 終わる」で 指す★（この札の 中の 1人目）。 */
  const KZ = (f) => CARD + ' [data-kz$=":0:' + f + '"]';
  for (const [f, v] of [['seiKanji', '試験'], ['meiKanji', '一郎'], ['seiKana', 'ｼｹﾝ'], ['meiKana', 'ｲﾁﾛｳ'],
    ['birthYmd', '2015-06-06'], ['seibetsu', 'male'], ['zokugara', '01'],
    ['zip', '790-0001'], ['jusho', '愛媛県松山市1-2-3']]) {
    if (!(await utsu(pg, KZ(f), v))) console.log('       🟡 家族の 欄が 無い … ' + f);
  }

  /* ── ② 会社の 欄（事業所）＝帳票の 箱の 中で 聞いている ───────── */
  const chohyo = async () => {
    await osu(pg, '.bn[data-scr="scr-list"]'); await machi(600);
    await osu(pg, '.seg-b[data-view="cho"]'); await machi(600);
    await osu(pg, '.seg-b[data-cho="shikaku"]'); await machi(1300);
    return pg.evaluate(() => {
      const btn = document.querySelector('#b-fuyo-csv');
      const c = document.querySelector('#view-cho');
      const box = btn ? btn.closest('.card') : null;
      return { fuda: btn ? btn.textContent.trim() : '（無い）', osenai: btn ? btn.disabled : null,
        hako: box ? box.textContent.replace(/\s+/g, ' ').trim().slice(0, 600) : '（箱が 無い）',
        chui: Array.from(c ? c.querySelectorAll('.cr-warn') : []).map((x) => x.textContent.replace(/\s+/g, ' ').trim()) };
    });
  };
  await osu(pg, '.bn[data-scr="scr-settings"]'); await machi(500);
  await osu(pg, '#set-seg .seg-b[data-set="company"]'); await machi(700);
  if (!(await utsu(pg, '#c-pref', 'ehime'))) console.log('       🟡 県の 欄に 打てない');
  /* ★★会社の 住所は「ログインの 後に 遅れて 届く 写し」（2026-09-14 CIで 実測）★★
     給与の 会社情報は ★入口の 共有データが 持ち主★で、ここに 在るのは 写し。
     写しは window.PayslipSyncOrg() が ★ログインの 後に 1回だけ★ 取りに行く。
     ★手元は 速いので 届いた後に 触っていた／CI では 届く前に 判じていた★
       ＝「⚠ まだ 出せません／事業所所在地が まだです」で ★3通りとも 赤★に なった。
       ＝★アプリの 穴では なく 私が 待っていなかった★。
     ⇒ ★住所が 画面に 出るまで 待つ★（お客さんも 出るまでは 押せない）。
       ★届かなければ ✗では なく 🟡未測定★＝★測れていない事を 測れたと 言わない★。 */
  const jushoMatsu = async (byo) => {
    for (let i = 0; i < byo * 2; i++) {
      const t = await pg.evaluate(() => {
        const e = document.querySelector('#c-addr-ro');
        return e ? e.textContent.trim() : null;
      }).catch(() => null);
      if (t && t !== '—' && t.indexOf('入っていません') < 0) return t;
      await machi(500);
    }
    return null;
  };
  const jusho = await jushoMatsu(20);
  if (jusho) console.log('       会社の 住所が 届いた … ' + jusho);
  else {
    mihakari++;
    console.log('  🟡 ★未測定★ 会社の 住所が 20秒 待っても 届かない'
      + '（＝この先の 届出は 測れない。★赤では なく 未測定★）');
  }
  await chohyo();
  for (const [k, v] of [['seiriKigou', '01-ｱｲ'], ['jigyoshoNo', '12345'],
    ['zip', '790-0001'], ['tel', '089-123-4567'], ['nushi', '健保' + Z + '良一']]) {
    await utsu(pg, '#view-cho [data-fc="' + k + '"]', v);
  }

  /* ── ③ 異動の別 3通りで ボタンの 様子を 見る ───────────────── */
  const idouKae = async (v) => {
    await osu(pg, '.bn[data-scr="scr-settings"]'); await machi(500);
    await osu(pg, '#set-seg .seg-b[data-set="emp"]'); await machi(700);
    await dsAkeru();
    await hiraku([CARD + ' [data-kz$=":0:idou"]']);
    if (!(await utsu(pg, KZ('idou'), v))) console.log('       🟡 異動の別の 欄が 無い');
    await machi(400);
    /* ★1欄ごとに『在るか』を 見てから 打つ★＝描き直しで 消えていたら 開き直す。
       ★打てなかった事を 黙って 通さない★（前は 黙って 通し「出せる人が いません」の 訳が 見えなかった）。 */
    const kzu = async (f, val) => {
      await hiraku([KZ(f)]);
      if (!(await utsu(pg, KZ(f), val))) console.log('       🟡 家族の 欄が 無い … ' + f);
    };
    if (v === '1') { await kzu('shokugyo', '4'); await kzu('doukyo', '1');
      await kzu('shunyu', '0'); await kzu('nattaYmd', '2026-04-01');
      await kzu('nattaRiyu', '1'); }
    if (v === '2') { await kzu('yametaYmd', '2026-08-31'); await kzu('yametaRiyu', '2'); }
    if (v === '3') { await kzu('bikou', '氏名変更（旧：試験' + Z + '一朗）'); }
    return chohyo();
  };
  /* ★★1枚目だけ 落ちない★ の 訳を 割る 為の ◆順番を 入れ替える◆★★（2026-09-21）
     ★問い★ … ★1枚目だけ 何が 違うか★
       㞊 ★順番★（前に 何も 無い／落とす 仕組みが まだ 温まって いない）
       㞋 ★中身★（異動の別 [1] だけ 別の 道を 通る）
     ★割り方★ … ★FUYO_JUN=gyaku で [3] を 1枚目に する★
       ・入れ替えても 1枚目が 落ちない ⇒ ★順番の 話★
       ・[1] が 何番目でも 落ちない ⇒ ★中身の 話★
     ＝★2通りの 入れ方で 比を 見る★（今日 何度も 使った 形） */
  const KUMI = [['1', '増えた'], ['2', '減った'], ['3', '変わった']];
  if (String(process.env.FUYO_JUN || '') === 'gyaku') KUMI.reverse();
  console.log('  ★試す 順番★ … ' + KUMI.map((x) => x[1] + '[' + x[0] + ']').join(' → ')
    + (String(process.env.FUYO_JUN || '') === 'gyaku' ? '（★逆★）' : '（並）'));
  for (const [v, na] of KUMI) {
    /* ★材料（会社の 住所）が 届いていないなら ★赤では なく 未測定★★
       ＝★押せない 訳が アプリの 側に 在るのか 私の 側に 在るのか 分からない★時に
         赤を 出すと ★狼少年★に なる（[[feedback_mimisokutei_to_kikai_ga_maikai_mite_inai_wa_betsumono]]）。 */
    if (!jusho) { mihakari++; console.log('  🟡 ★未測定★ ' + na + ' … 会社の 住所が 届いていない'); continue; }
    const r = await idouKae(v);
    console.log('  ── 異動の別「' + na + '」 … ボタン「' + r.fuda + '」／押せない ' + r.osenai);
    if (r.chui.length) console.log('       画面の 言い分 … ' + r.chui.join(' ／ ').slice(0, 220));
    if (r.osenai !== false) console.log('       ★箱の 字★ … ' + r.hako);
    T('★' + na + '＝ボタンが 押せる', r.osenai === false,
      '押せない（上の 言い分を 見る）');
    if (r.osenai !== false) continue;
    /* ★★押せる は 出る では ない（2026-09-08 に 同じ場所で 踏んだ）★★
       ⇒ ★本当に 押して 落として 中の 字を 読む★。
       Shift_JIS の 2バイト目は 0x40-0x7E / 0x80-0xFC＝★カンマ(0x2C)に ならない★ので、
       列を 数えるだけなら latin1 で 読んで よい（字を 出す 所では 使わない）。 */
    /* ★★「落ちて こない」には 2つ 在る★★（2026-09-21＝指示役1 の 㞎）
       㞊 ★本当に 1つも 無い★／㞋 ★落ちて いるが ★私が 見て いる 所に 無い★★
       （★今日 何度も 出た 形★）
       ★待ちの 上限と 実測を 並べる★／★押した 時の 訳を 飲まない★／
       ★別の 窓（popup）・画面の 叫びも 数える★ */
    const DL_UE = 25000;
    const t0dl = Date.now();
    const sakebi = [];
    const onErr = (e) => sakebi.push('pageerror: ' + String((e && e.message) || e).slice(0, 90));
    const onCon = (m) => { if (m.type() === 'error') sakebi.push('console: ' + m.text().slice(0, 90)); };
    const onPop = () => sakebi.push('★別の 窓が 開いた（popup）★');
    pg.on('pageerror', onErr); pg.on('console', onCon); pg.on('popup', onPop);
    let osuDame = 'OK';
    const dlP = pg.waitForEvent('download', { timeout: DL_UE }).catch(() => null);
    await pg.click('#b-fuyo-csv', { timeout: 8000 }).catch((e) => {
        /* ★★また 切って いました（今日 3度目）★★（2026-09-21）
           80字 → 400字 → ★300字★。どれも ★playwright の 訳の 手前★で 切れた。
           ★数で 見る★ … 前回の 出しは `- e` で 終わって いた（`element ...` の 頭）
           ⇒ ★★切らない★★＋★全何字 のうち 何字 出したかを 書く★
              （★次に 足りたかを 数で 決められる★） */
        const zenji2 = String((e && e.message) || e).split(String.fromCharCode(10)).join(' / ');
        const UE2 = 2000;
        osuDame = zenji2.slice(0, UE2) + '【全 ' + zenji2.length + '字のうち '
          + Math.min(UE2, zenji2.length) + '字 出した'
          + (zenji2.length > UE2 ? '＝★足りて いません★' : '＝足りて います') + '】';
    });
    /* ★★押せなかったのに 25秒 待って いました★★（2026-09-21）
       ★押した 結果を 見てから 待つ★＝★赤 1回あたり 25秒 得する★
       ★でも 待ちは 消さない★ … ★「押した OK」でも 落ちない 事が 在りうる★
       ⇒ ★押せたなら 上限まで／押せなかったなら ★あと 1秒だけ★ 待つ★
       （★黙って 打ち切らない★＝待った 秒を 必ず 出す） */
    const dl = (osuDame === 'OK')
      ? await dlP
      : await Promise.race([dlP, new Promise((r) => setTimeout(() => r(null), 1000))]);
    const mattaDl = ((Date.now() - t0dl) / 1000).toFixed(1);
    pg.off('pageerror', onErr); pg.off('console', onCon); pg.off('popup', onPop);
    console.log('       落ちるのを 待った … 上限 ' + (DL_UE / 1000) + '秒 ／ 実測 ' + mattaDl + '秒'
      + ' ／ 余り ' + (DL_UE / 1000 - Number(mattaDl)).toFixed(1) + '秒'
      + ' ／ 押した ' + osuDame + ' ／ 画面の 叫び ' + (sakebi.length ? sakebi.join(' ／ ') : '無し')
      + ' ／ 窓の 数 ' + ctx.pages().length);
    /* ★★押せなかった 時の 番★★（2026-09-21＝★＋ボタンと 同じ 形★）
       ★実測★ … 1枚目だけ ★page.click: Timeout 8000ms exceeded★（2枚目・3枚目は OK）
       ⇒ ★「落ちて こない」では なく ★押せて いない★★
       ⇒ ★＋ボタンと 同じ ★最初の 1回が 押せない★ が 2か所★
       ⇒ ★同じ 覚いか 別の 訳かを ここで 割る★ */
    if (osuDame !== 'OK') {
      const ban2 = await pg.evaluate(() => {
        const el = document.querySelector('#b-fuyo-csv');
        if (!el) return { nai: true };
        const b = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const ue = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        const na3 = (nd) => nd ? (nd.tagName.toLowerCase()
          + (nd.id ? '#' + nd.id : '')
          + (nd.className ? '.' + String(nd.className).trim().split(/\s+/).join('.') : '')).slice(0, 70) : '(誰も 居ない)';
        return {
          mieru: !!(b.width && b.height) && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0',
          hako: { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) },
          gamen: { w: innerWidth, h: innerHeight },
          nakaKa: b.top >= 0 && b.left >= 0 && b.bottom <= innerHeight && b.right <= innerWidth,
          ue: na3(ue), jibunKa: ue === el || (ue && el.contains(ue)),
          ooi: document.querySelectorAll('.ui-modal-ov, .modal, [aria-modal="true"]').length,
          hako_no_ji: Array.prototype.slice.call(document.querySelectorAll('.ui-modal-ov')).map((o) => ({
            dai: (o.querySelector('.ui-modal-t') || {}).textContent || '(題 無し)',
            hon: ((o.querySelector('.ui-modal-b') || {}).textContent || '(文 無し)').slice(0, 200),
          })),
          pe: cs.pointerEvents, disabled: !!el.disabled,
        };
      }).catch((e2) => ({ dame: String((e2 && e2.message) || e2).slice(0, 80) }));
      console.log('       ★CSVの ボタンを 押せなかった 瞬間の 番★ … ' + JSON.stringify(ban2));
    }
    T('★' + na + '＝押したら 本当に 落ちる', !!dl,
      osuDame !== 'OK' ? '★押せて いません★（上の 番を 見る）' : 'ファイルが 落ちてこない（上の 数を 見る）');
    if (!dl) continue;
    const na2 = dl.suggestedFilename();
    const fp = await dl.path();
    const buf = fp ? fs.readFileSync(fp) : Buffer.alloc(0);
    const m = csvMiru(buf.toString('latin1'), BAN);
    console.log('       落ちた … ' + na2 + ' ' + buf.length + 'バイト'
      + ' sha256 ' + crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12)
      + ' ／ 行' + m.gyo + ' データ' + m.data + ' 列' + m.retsu + ' ずれ' + m.zure
      + ' 異動の別[' + m.idou.join(' ') + ']');
    /* ★★分母を 出す★★＝★行数は 参考★／★判じは 自分の 行★ */
    console.log('       ★自分の 行 … ' + m.jibun + '本'
      + '（指紋「' + m.shirushi + '」／' + (m.jibunBan.length ? m.jibunBan.map((i) => i + 1).join('・') + '本目' : '★無し★')
      + '）／★他人の 行 ' + m.hokaNoHito + '本★'
      + '（★倉庫に 残って いる 別の 人＝★赤に しません★）'
      + '／自分の 異動の別[' + m.jibunIdou.join(' ') + ']');
    console.log('       ★指紋を 探した 所 … ' + m.sagashitaTokoro + '★');
    if (m.jibun > 1) {
      console.log('       ★★指紋が 他の 人にも 当たりました★★＝'
        + m.jibunNa.join(' ／ ')
        + '（★`Date.now()` の 下6桁は ★約 16分40秒で 巡る★＝'
        + '16分40秒 前の 置き土産と 同じ 数に なり得る★）');
    }
    T('★' + na + '＝名前が SHFD0006.CSV', na2 === 'SHFD0006.CSV', '落ちた 名前は ' + na2);
    /* ★★行数では 判じない★★（2026-09-25・指示役1 の 裁定）
       ★前は `m.data === 1`（★紙 全体の 行数★）だった★
       ⇒ `app.js:3742` `fuyoTodoke` は ★`state.employees` を 全部 回る★
       ⇒ ★★倉庫に 他の 人が 居れば 行は 増える＝★成り立たない 判じ★★
       ⇒ 実測（09-25）… CI の 置き土産 5人 で ★データ行 3本★＝赤
       ★これは 弱めでは ありません★＝★測る 物を 正した★
         この 試験の 用は「★被扶養者(異動)届が 正しく 落ちるか★」
         「倉庫に 他に 誰が 居るか」は ★この 試験の 用では ない★
       ★行数は 上の 出しに 参考として 残して いる★（★見ないとは 別★） */
    T('★' + na + '＝★自分の 人の 行が ちょうど 1本★', m.jibun === 1,
      '自分の 行 ' + m.jibun + '本（指紋「' + m.shirushi + '」）'
      + '／紙 全体は ' + m.data + '本（うち 他人 ' + m.hokaNoHito + '本）'
      + '／探した 所 ' + m.sagashitaTokoro
      + (m.jibun > 1 ? '★★指紋が 他にも 当たった★★＝' + m.jibunNa.join(' ／ ')
        + '（下6桁は 約 16分40秒で 巡る）' : '')
      + (m.jibun === 0 ? '★★自分の 人が 紙に 出て いない★★' : '')
      + (m.shirushiNashi ? '★指紋を 渡して いない★' : ''));
    T('★' + na + '＝列が 139（ずれ 0）', m.retsu === 139 && m.zure === 0,
      '列 ' + m.retsu + '／ずれ ' + m.zure);
    /* ★前は `m.idou[0]`（★紙の 1本目★）を 見て いた★
       ⇒ ★置き土産が 先に 並ぶと ★別人の 異動の別★を 読む★
       ⇒ 実測（09-25）… 打ったのは「3」なのに 出たのは「1」
       ⇒ ★自分の 行の 異動の別★を 見る */
    T('★' + na + '＝項番21 ★自分の 行の★ 異動の別が「' + v + '」',
      m.jibun === 1 && m.jibunIdou[0] === v,
      '自分の 行に 入っていたのは 「' + (m.jibunIdou[0] === undefined ? '★行が 無い★' : m.jibunIdou[0]) + '」'
      + '★＝画面で 選んだ物と 違う★'
      + '（参考：紙 全体の 異動の別[' + m.idou.join(' ') + ']）');
  }

  /* ★★自分の ゴミを 自分で 数える（2026-09-14 指示役1 の 注文）★★
     ★後始末したつもり★を 緑に しない＝★押す前と 後で 人数を 数えて 合わせる★。 */
  await katazuke();
  await machi(400);
  const ato2 = await pg.evaluate(() => document.querySelectorAll('#emp-list .mco').length);
  console.log('  画面の 札 … 前 ' + mae + ' → 後 ' + ato2 + '（★これは 緑の 根拠に しません★）');
  /* ★★ここは 画面が まだ 開いて いる★★＝★直列の 数を ここで 読む★ */
  await hozonKazuWoYomu(pg);
  /* ★★『緑の 根拠に しない』と『見ない』は 別★★（2026-09-21 実測で 踏んだ）
     ★実物（5c5ea3b の CI）★
        片づけ … ⑥開き直して 数えた … ★残り 0人★
        画面の 札 … ★前 2 → 後 3★
        🟡 ★未測定★ ★この環境では 倉庫を 数えていません★（試験の 鍵が 無い）
     ⇒ ★★同じ 出しの 中で 食い違って いたのに 誰も 止めなかった★★
     ⇒ ★倉庫を 数えられない CI では ★これが 唯一 見える 印★★
     ⇒ ★★置き去りが 黙って 残り、次の 回の 紙を 壊した★★（扶養CSV が データ2行）
     ★決め★ … ★★札が 増えたら 赤★★
        ＝★この 試験は 1人 足して 1人 消す★＝★元に 戻るのが 当たり前★
     ★増えて いない 時は 緑の 根拠に しない★（減る・同じ には 別の 訳が 在りうる）
        ＝★★片側だけ 使う★★（今日 何度も 出た「0件は 0件では ない」の 裏） */
  T('★片づけの 後 画面の 札が 増えて いない（前 ' + mae + ' → 後 ' + ato2 + '）', ato2 <= mae,
    '★札が ' + (ato2 - mae) + ' 増えました★＝★片づけの「残り 0人」と 食い違って います★'
    + '（★倉庫を 数えられない 席でも これは 見えます★）');
  /* ★本当の 判じは 倉庫★＝消えるまで 待ち、待っても 消えなければ 赤 */
  const sou = await AWASERU(soukoMae, 20);
  if (sou.han === '環境') console.log('  ' + sou.iu);   /* ★緑で 通すが 数は 出す★（総なめが 拾う 字） */
  else if (sou.han === '未測定') { mihakari++; console.log('  🟡 ★未測定★ 後始末を 倉庫で 数えられない … ' + sou.iu); }
  else T('★後始末＝★倉庫の 行数★が 元に 戻った', sou.han === '緑', sou.iu);
  if (sou.han === '緑') console.log('       ' + sou.iu);
} catch (e) {
  fail++; console.log('  ✗ 途中で 止まった … ' + (e && e.message));
} finally {
  await katazuke();
  await b.close(); srv.close();
}

/* ★★最後にも 並べる★★＝覆いは 走りの あちこちで 出る（18〜27回）ので
   ★1か所（押す前に 止めた 所）だけでは 足りない★。★全体の 本数も 一緒に 出す★。 */
soukoDasu('★走りの 終わり★', 12);
/* ★★全体の まとめも ★着いた 順★ で 見る★★（2026-09-25）
   ★前は `x.n !== x.ban` を 「逆順」と 呼んで いた★
   ⇒ CI `36151979249` で ★148本★ と 出たが、実は
      ★★早い 所で 1本 返らなかったので 後ろの 着いた番が 全部 1つ ずれた★★
   ⇒ ★★『148本 逆順』は ★意味の 無い 数★★★＝★正しく 測れて しまって いた★
   ⇒ ★本当の 合図は ★返って いない 1本★★ */
{
  const tsuitaZen = soukoLog.filter((x) => x.ban);
  let gyakuZen = 0, maeZen = 0;
  tsuitaZen.forEach((x) => { if (x.ban < maeZen) gyakuZen++; maeZen = Math.max(maeZen, x.ban); });
  const shippaiZ = soukoLog.filter((x) => !x.tsuita && x.shippai).length;
  const damariZ = soukoLog.filter((x) => !x.tsuita && !x.shippai && !x.owari).length;
  const moreZ = soukoLog.filter((x) => !x.tsuita && !x.shippai && x.owari).length;
  console.log('  ★倉庫への 要求 … 全 ' + soukoLog.length + '本'
    + '／返った ' + soukoLog.filter((x) => x.tsuita).length + '本'
    + '／★失敗 ' + shippaiZ + '本★'
    + '／★★本当に 黙って いる ' + damariZ + '本★★'
    + '／★控えの 漏れ ' + moreZ + '本★'
    + '／★着いた 順が 差し戻った ' + gyakuZen + '本★'
    + '（参考：番号の ずれ ' + soukoLog.filter((x) => x.ban && x.n !== x.ban).length + '本'
    + '＝★抜けた 本数の 分だけ ずれる＝逆順では ない★）★');
  /* ★★指示役1 の 叩き ㋓＝★数が 食い違ったら その場で 赤に する★★
     ★但し 相手の『「静まりました」と 突き合わせる』は ★成り立ちません★
       訳＝`scripts/_borrow-playwright.mjs:104-111` は
         ★閉じる 時に 初めて 耳を 付ける★（それ以前の 要求は 数えて いない）
         ★見る 幅も 違う★（`/rest/v1/` 全部 対 `pay_companies` だけ）
       ⇒ ★★「要求 0回（閉じる前）」と「未返 1本（走り 全体）」は ★矛盾 しません★★
       ⇒ ★そこを 門に すると ★嘘の 赤★に なる★（指示役1 に 字で 返した）
     ★代りに 門に する 物★＝★★本当に 黙って いる 要求が 1本でも 在るか★★
       （★終了も 失敗も 来ない＝★本物の 異常★） */
  /* ★★★保存(POST)の 失敗は ★客に 字が 出る★★★（2026-09-25・指示役1 の ②）
     `app.js:2173` toast「★N名分を保存できませんでした（台帳・年末調整に入っていません）★」
     ⇒ ★★これが 出る 事が 起きて いるのに 試験が 緑だった★★＝★見張りの 穴★
     ★因の 元（字）★ … `app.js:6180` は ★その月に 居る 人の 数だけ 一斉に 投げる★
        （`6173`〜`6225` に `await` / `Promise.all` が ★０件★）
     ★直し方は ここで 決めません★＝★お金の 道★／★司さんの 決めが 要る★ */
  /* ★★★『自分で 自分を 弾いた 組』を 番号で 出す★★★（指示役1 の 裁定 ①） */
  /* ★★直列に した 後 ★溜まって いないか★ を 数で 見る★★（2026-09-26）
     `kyuyo/js/store.js` の `Store.hozonNoKazu()` が 返す
       machi … ★待たせた 回数★（★直列に した のだから 0とは 限らない★）
       sute … ★捨てた 回数★（★待ちが 2以上 来たとき 間の 物を 捨てる★）
     ★これを 赤に は しません★＝★数を 出すだけ★
       訳＝★待ちも 捨ても ★正しい 働き★★（★溜めない 形★）
       ⇒ ★★但し 数が 出て いないと ★溜まって いても 誰も 気づかない★★ */
  /* ★★★㈝-2 の 決め手★★★（2026-09-27）
     ★`kyuyo/js/store.js:187` の conflict は ★文字列比較★
        `if(cloudUA && cloudUA !== lastCompanyUpdatedAt){ … conflict … }`
     ★`:212` に 落とし穴★
        `lastCompanyUpdatedAt = (res[0]…updated_at) ★|| now★;`
        ⇒ ★DB が 値を 返さなかった 回だけ ★JS の 《…Z》形★が 控えに 入る★
        ⇒ 次の 確認は DB の 《…+00:00》を 読む
        ⇒ ★★同じ 瞬間なのに 字が 違う＝★偽の conflict★★
     ★`:211` の 覚書が まさに その 話★
        「JS生成の now(…Z) は DB返却(…+00:00)と 書式が 違い、
          ★文字列比較で 毎回 不一致★＝誤conflictが 多発する（P0根治）」
     ★外から は 読めない 2つの 値★を 画面の 中で 控えて ここで 出す。
     ★CI でも 走る★（★倉庫の 鍵が 要らない★）
        ＝★★手元では 7回 回して 覆い 0回＝★手元では 測れない★★ */
  {
    const ok = OOI_KAZU;
    console.log('  ★★覆いの 中身★★ … '
      + (ok
        ? '★覆い ' + ok.honsu + '回★'
          + '／★★同じ 瞬間なのに conflict … ' + ok.onaji + '回★★'
          + '／本当に 別の 書き ' + ok.chigau + '回'
          + '／まだ 読んで いない ' + ok.miyomi + '回'
          + (ok.ji && ok.ji.length ? '／★字★ ' + ok.ji.join(' ｜ ') : '')
          + (ok.onaji > 0
            ? '★★⇒ ★字の 形だけの 偽 conflict が 在ります★★★'
            : (ok.honsu > 0 ? '★⇒ ★字の 形だけの 物は 在りません★'
              : '（★覆いが 出て いません＝★未測定★）'))
        : (ok === null
          ? '★★`Store.ooiNoKazu` が ★画面に 無い★★（★控えの 直しが 届いて いません★）'
          : '★★読めて いません★★（★『無い』とは 書きません★）')) + '★');
  }
  {
    const hz = HOZON_KAZU;
    console.log('  ★保存を 直列に した 後の 数 … '
      + (hz ? '★待たせた ' + hz.machi + '回／捨てた ' + hz.sute + '回'
        + '／読んだ 時に 走って いた ' + (hz.chuu ? 'はい' : 'いいえ') + '★'
        + '（★待ちも 捨ても 正しい 働き＝赤に は しません★）'
        : (hz === null
          ? '★★`Store.hozonNoKazu` が ★画面に 無い★★'
            + '（★直列の 直しが 届いて いません★）'
          : '★★読めて いません★★'
            + '（★画面を 開いて いる 間に 読めなかった'
            + '＝★『無い』とは 書きません★）')) + '★');
  }
  /* ★★会社の 棚に 書いた 値を ★全部★ 出す★★（2026-09-26）
     ★なぜ 要るか（踏んだ 穴）★
       外から 倉庫を 見張る 紙が この 出しを 読んで
       ★「倉庫が 動いた 値」と 突き合わせます★。
       ★ところが この 紙は ★後ろ 8～12本★ しか 印字して いません★
       ⇒ ★★私の 書きが 10個しか 拾えず、残りが「私以外」に 化けた★★
       ⇒ ★「覆い 27回／私以外 104回」＝★偽の 当たり★
     ⇒ ★★突き合わせの ★分母★ を 出す★★
        ＝[[feedback_bunbo_wo_dasanai_midori_wa_uso]] */
  {
    const kaki = soukoLog.filter((x) => x.tana === 'pay_companies'
      && x.muki !== 'GET' && x.muki !== 'HEAD' && x.okutta);
    const ne = [...new Set(kaki.map((x) => String(x.okutta)))];
    console.log('  ★会社の 棚に 書いた 値 … ' + kaki.length + '本（別々の 値 '
      + ne.length + '個）★');
    console.log('  ★書いた 値（全部）★：' + (ne.length ? ne.join(' ') : '★無し★'));
    const kaeri2 = [...new Set(soukoLog.filter((x) => x.tana === 'pay_companies' && x.kaeri)
      .map((x) => String(x.kaeri)))];
    console.log('  ★会社の 棚が 返した 値（全部）★：'
      + (kaeri2.length ? kaeri2.join(' ') : '★無し★'));
  }
  {
    const jj = jibunDeJibun(soukoLog);
    console.log('  ★★自分で 自分を 弾ける 組 … ' + jj.honsu + '組★★'
      + (jj.honsu
        ? '：' + jj.kumi.slice(0, 5).map((x) => '★出' + x.w + '（書き・送った「' + x.t1 + '」）'
          + ' → 出' + x.g + '（確認の 読み・同じ 値を 返した）'
          + ' ' + x.wari
          + (x.nokori.length ? '（★束で まだ 返って いない 出' + x.nokori.slice(0, 4).join('・')
            + '／棚 ' + x.nokoriTana.join('・') + '★）' : '')
          + ((x.yoso && x.yoso.length) ? '（参考：束で ない 他の 書き 出'
            + x.yoso.slice(0, 4).join('・') + '／棚 ' + x.yosoTana.join('・')
            + '★＝★因と しては 数えて いません★）' : '') + '★').join('  ')
          + '★★⇒ 倉庫に 在るのは ★自分の 書き★／控えは ★旧い はず★＝「別の端末」は 嘘★★'
        : '（★組 0＝★★見える 幅では 捕まえられません★★＝★『無い』とは 書きません★）'
      + '（★控えの 値その 物は 画面の 中の 閑し＝★読めません★／★保存の 返りと 控えの 更新の 間は ★ミリ秒より 細かい★ 事も 在る★）'));
  }
  {
    const sw = shippaiWakeru(soukoLog);
    console.log('  ★失敗の 中身（棚ごと） … ' + (sw.ji || '★無し★') + '★');
    T('★★保存(POST)の 失敗が 0本★★', sw.kakiKazu === 0,
      '★保存の 失敗 ' + sw.kakiKazu + '本★（失敗 全部 ' + sw.zen + '本）'
      + '：' + sw.kaki.map((x) => '出' + x.n + ' ' + (x.tana || '?') + ' ' + x.muki
        + '「' + x.shippai + '」').join('・')
      + '★＝★★客に「○名分を保存できませんでした（台帳・年末調整に入っていません）」が 出る★★'
      + '（因の 元＝`app.js:6180` が ★人数ぶん 一斉に 投げる★）');
  }
  T('★★本当に 黙って いる 要求が 0本★★', damariZ === 0,
    '黙って いる ' + damariZ + '本（失敗 ' + shippaiZ + '本／控えの 漏れ ' + moreZ + '本）'
    + '★＝★終了も 失敗も 来て いない＝★手元の 控えが 古い ままに なり得る★');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed'
  + (mihakari ? ' ／ 🟡未測定 ' + mihakari : ''));
process.exit(fail ? 1 : 0);
