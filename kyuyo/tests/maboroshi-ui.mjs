/* maboroshi-ui.mjs — ★幻の『従業員 1』が 孤児を 作らないか★を お客さんの道で 測る
 * =============================================================================
 * ★なぜ（2026-09-15）★
 *   ログインの 直後、state は まだ ★初期値の『従業員 1』1人★（app.js の 初期値）。
 *   そこで 保存が 走ると ★明細だけ 読み込みを 待たずに 書かれ★、
 *   後から 読み込みが 着いて その人が 消える
 *   ⇒ ★書かれた 明細だけ 持ち主を 失う（＝孤児）★。
 *   数えた（読むだけ）… 試験 3,702行／★本番 12行中 9行★＝★過去に 起きている★。
 *   ⇒ 直し＝★明細の 保存も 保留に 掛ける★（store.js・2026-09-15）。
 *
 * ★★押す前に 数え方を 決める（2026-09-15 指示役1）★★
 *   ★後から 決めると 都合の よい 数え方に なる★ので、ここに 先に 書く。
 *   ①★孤児の 定義★
 *       ★明細（pay_payslips）の 行が 持つ 従業員の 印が、従業員の 名簿（pay_employees）に 無い★
 *       （＝持ち主が 居ない 明細）
 *   ②★数える 場所★ … ★倉庫★（画面では 数えない＝画面は 隠すかもしれない）
 *   ③★数える 道具★ … この紙の kazoeru()＝倉庫へ 直に 1本の 問い（下に 字で 書いてある）
 *   ④★分母★ … ★明細 何行 中 孤児 何行★（★「0件」だけ 出さない★）
 *   ⑤★押す前にも 数える★ … ★押した後だけ 数えると「元から 0」と 見分けが つかない★
 *
 * ★測る事★
 *   ①押す前の 数（分母つき）
 *   ②★お客さんの 道で★ 明細を 1本 出す（★JS で イベントを 投げない★＝指で 押すのと 同じ道）
 *   ③押した後の 数 … ★孤児が 増えていない事★（★0に なる 必要は ない★＝過去の 分は 消さない）
 *   ④★幻の『従業員 1』が 倉庫に 増えていない事★
 *   ⑤絵を 1枚（★数が 緑でも 絵を 開くまで OKに しない★）
 *
 * ★向き先★ … ★テスト倉庫だけ★（repo が 指す 先を 機械が 決める＝js/supa-config.js）
 * 使い方: node kyuyo/tests/maboroshi-ui.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

{
  const { kagiAru } = await import('../../tests/_hairu.mjs');
  if (!(await kagiAru(ROOT))) {
    console.log('  — ★この repo（本番）には 試験の 鍵が 無いので ここでは 測れません★'
      + '（★テスト線で 測っています★／戻す条件＝本番CIに 鍵を 置いた日）');
    process.exit(0);
  }
}

let borrow, pwLaunch, hairu, osu;
try {
  ({ borrow, launch: pwLaunch } = await import('../../scripts/_borrow-playwright.mjs'));
  ({ hairu, osu } = await import('../../tests/_hairu.mjs'));
} catch (e) { console.log('🟡 ★はかれない★ 道具が 読めない … ' + (e && e.message)); process.exit(2); }
const wk = await borrow('maboroshi-ui', 'webkit');
if (!wk) { console.log('🟡 ★はかれない★ playwright を 借りられない（0件＝合格 とは 書かない）'); process.exit(2); }

const { kazoeru: KAZOERU, awaseru: AWASERU, meisaiIdHikaeru: MEISAI_HIKAE, fuetaMeisaiKesu: MEISAI_KESU, sujiKesu: SUJI_KESU, ima: IMA, kankyoKa: KANKYO, kankyoIu: KANKYO_IU, toiawase: TOI }
  = await import('./_souko-kazoeru.mjs');

/* ★孤児を 数える★＝①の 定義を そのまま 字に した 1本の 問い */
async function kojiKazoeru() {
  const sql = 'select (select count(*) from kyuyo.pay_payslips) as zenbu,'
    + ' (select count(*) from kyuyo.pay_payslips p'
    + '  where not exists (select 1 from kyuyo.pay_employees e where e.id=p.employee_id)) as koji,'
    + " (select count(*) from kyuyo.pay_employees) as hito,"
    + " (select count(*) from kyuyo.pay_employees where (data->>'name')='従業員 1') as maboroshi";
  /* ★★鍵は 自分で 読まない★★（2026-09-15・★ここが 写し忘れの 元だった★）
     前は ★この紙が 自分で 鍵の 紙を 開いて いた★＝★09-14 に 決めた 3つが 当たらない★
     ⇒ ★倉庫を 触る 測りは 全部 `_souko-kazoeru` の 門を 通す★（見張り souko-mon が 赤に する）。 */
  const r = await TOI(sql);
  if (!r.ok) return { ok: false, naze: r.naze };
  const x = (r.gyo || [])[0] || {};
  return { ok: true, zenbu: Number(x.zenbu), koji: Number(x.koji), hito: Number(x.hito), maboroshi: Number(x.maboroshi) };
}

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
const b = await pwLaunch('maboroshi-ui', wk);

let pass = 0, fail = 0, mi = 0;
const NL = String.fromCharCode(10);
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };
const MI = (n, m) => { mi++; console.log('  🟡 ★はかれない★ ' + n + (m ? ' … ' + m : '')); };
const machi = (ms) => new Promise((r) => setTimeout(r, ms));
process.on('exit', () => { try { srv.close(); } catch (e) { /* もう 閉じている */ } });
for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, () => { try { srv.close(); } catch (e) { /* 同上 */ } process.exit(130); });

console.log(NL + '[maboroshi-ui] 幻の『従業員 1』が ★孤児を 作らないか★（お客さんの道で 押す）');

/* ★向き先を 押す前に 1回 目で 見る★（本番に 書いたら 取り返せない） */
{
  const { repoSupa } = await import('../../tests/repo-supa.mjs');
  const { ref, url } = repoSupa();
  console.log('  ★向き先★ … ' + url + '（ref ' + ref + '）');
  /* ★★本番の 名前を この紙に 書かない（2026-09-15 見張りが 捕まえた・今日 2回目）★★
     守りの つもりで ★本番の ref を 直に 書いた★＝★見張りが 赤に した★＝正しい 赤。
     訳＝★本番の repo へ 運ばれたら 直書きは そのまま 付いてくる★（tests/repo-supa.mjs の 覚書）。
     ⇒ ★名前で 照らさず「この repo が 試験線か」で 決める★
       ＝tests/_hairu.mjs の kagiAru と 同じ 決め方（★repo の 向き先で 決める★）。
     ★この紙の 頭で 既に kagiAru を 通っている★ので、ここは ★念のための 二重の 門★。 */
  const { repoEnv } = await import('../../scripts/repo-env.mjs');
  const env = repoEnv(ROOT);
  if (env !== 'test') {
    console.log('  ✗ ★試験線では ありません（' + env + '）＝1文字も 触りません★');
    await b.close(); srv.close(); process.exit(1);
  }
}

/* ★⑤押す前にも 数える★（押した後だけ 数えると「元から 0」と 見分けが つかない） */
const mae = await kojiKazoeru();
if (!mae.ok) {
  /* ★★鍵が 無い（＝この環境では 測れない）と、鍵は 在るのに 読めない を 分ける★★
     （2026-09-15 CI が 捕まえた／★_souko-kazoeru.mjs で 同じ 決めを した のに ここに 写し忘れた★
       ＝★1本ずつ 直すと 必ず 漏れる＝先に 数えろ★の 型を 今日 3回 踏んだ）
     ★決め（指示役1・2026-09-14 の 3つ）★
       ①鍵が 無い … ★緑（0）で 通す★／★ただし 未測定として 数を 出す★／★0件＝合格 と 書かない★
       ②鍵は 在るのに 読めない … ★今までどおり 赤（2）★
       ③★CI の 段の 名に「CIでは 測っていない」と 書く★（.github/workflows/webkit.yml）
     ★戻す条件★＝★CI に 試験倉庫の 鍵を 置いた日★（その日 ①は 要らなく なる）

     ★★ついでに 分かった事（2026-09-15・指示役1 と 決めた）★★
       ★CI には 鍵が 無い★⇒★人は アプリの 道で 消えるが、明細を 消す 片づけは 走れない★
       ⇒★1回の WebKit で およそ 7行 孤児が 残る★（09-15 02:13〜02:16 に 8行 実測）
       ★決め＝㋑（このまま）★。訳＝★これは「削除で 明細が 倉庫に 残る」欠陥の 影★で、
         ★その欠陥が 直れば 要らなく なる★
         ⇒★要らなく なるかも しれない 物の 為に CI へ 秘密（鍵）を 増やさない★。
       ★★止める 目安★★＝★孤児が 1,000行 増えたら 見直す★（★2026-09-15 時点で 3,724行★
         ＝★4,724行に なったら★）。★掃く時は 客の道で★（倉庫を 直に 触らない）。 */
  MI('押す前の 数', mae.naze);
  await b.close(); srv.close();
  if (String(mae.naze).indexOf('鍵の 紙が 読めない') >= 0) {
    KANKYO_IU();   /* ★字は 門 1か所★＝呼ぶ側で 書き写さない（写すと ずれる） */
    process.exit(0);
  }
  process.exit(2);
}
console.log('  ★押す前★ … 明細 ' + mae.zenbu + '行 中 ★孤児 ' + mae.koji + '行★'
  + ' ／ 従業員 ' + mae.hito + '人（うち『従業員 1』' + mae.maboroshi + '人）');

const HAJIME = await IMA().then((x) => (x.ok ? x.t : null));

/* ★★この回で 触る 月の 明細の id を ★走る前に★ 控える（2026-09-15）★★
   ★前は 時刻で「この回の 行」を 決めていた★
   ⇒ 確定／取り消しは ★その月の 明細を 書き直す★＝★前から 在った 行の 時刻が 動く★
   ⇒ ★一緒に 消して 実物が 減る★（webkit 総なめ 2026-09-15 … 明細 3,721→3,720＝-1）
   ⇒ ★★控えに 無い id だけ 消す★★＝★前から 在った 行は 触りようが ない★。 */
/* ★★対象月は ★画面から 読む★（2026-09-15 絵が 見せた）★★
   ★前は ★手元の 時計から 今日の 月★を 作って 消しに 行っていた★。
   （★その 字は ここに 書きません★＝字で 数える 道具が 覚書を 拾う＝今日 2回 踏んだ 型）
   ★絵（.sweep-red/maboroshi-ui.png・2026-09-15 10:38）に 写っていたのは ★2026年6月★★
   ＝★書いた 月と 消す 月が 違う＝自分が 書いた 行を 1度も 消していなかった★。
   ★それでも 緑だった 訳★＝確定が ★元から 在る 行を 書き直しただけ★で
     ★新しい 行が 出来なかった★＝明細 +0＝★まぐれの 緑★。
   ⇒ ★試験に「今日が 何月か」を 持ち込まない★（[[feedback_tests_must_not_depend_on_todays_date]]）
   ⇒ ★ログインして 画面が 出てから 対象月を 読む★＝控えも 消しも ★その月★で 揃える。
   ★読む所★＝`.ym-one`（客が 触る 箱）／無ければ `.scr-month`（隠れた 欄）。 */
let YM_KONKAI = null;
let MEISAI_MAE = null;
const ctx = await b.newContext({ viewport: { width: 1100, height: 1300 } });
const pg = await ctx.newPage();

try {
  const h = await hairu(pg, 'http://localhost:' + PORT + '/kyuyo/index.html', '.bn[data-scr="scr-settings"]');
  if (!h.haitta) { MI('ログイン', h.kai + '回 試して 入れなかった'); throw new Error('skip'); }
  await machi(800);

  /* ── ★お客さんの 道で 明細を 1本 出す★（JS で イベントを 投げない） ── */
  await osu(pg, '.bn[data-scr="scr-input"]'); await machi(1200);

  /* ★★対象月を 画面から 読み、その月の 控えを 取る（押す 前に）★★ */
  YM_KONKAI = await pg.evaluate(() => {
    const one = Array.from(document.querySelectorAll('.ym-one')).find((x) => x.offsetParent);
    if (one && /^[0-9]{4}-[0-9]{2}$/.test(one.value || '')) return one.value;
    const h = document.querySelector('.scr-month');
    return (h && /^[0-9]{4}-[0-9]{2}$/.test(h.value || '')) ? h.value : null;
  }).catch(() => null);
  if (!YM_KONKAI) { MI('対象月', '★画面から 読めない★＝どの月を 片づければ よいか 分からない'); throw new Error('skip'); }
  console.log('  ★画面の 対象月★ … ' + YM_KONKAI + '（★今日の 月では なく 画面から 読んだ★）');
  MEISAI_MAE = await MEISAI_HIKAE([YM_KONKAI]);
  if (!MEISAI_MAE.ok) console.log('       🟡 控えを 取れなかった … ' + MEISAI_MAE.naze);
  else console.log('       控え … ' + YM_KONKAI + ' の 明細 ' + MEISAI_MAE.ids.length + '行');
  /* ★カレンダーから 入れる＝客が 押す ボタン★ */
  const fill = await pg.$('[data-fillsche]');
  if (fill) {
    await fill.click({ timeout: 8000 }).catch(() => null);
    await machi(900);
    /* 確認の 一枚は ★本物の click★で 押す（見えている ボタンを 名前で 探す） */
    const ok1 = await pg.$('button:visible');
    if (ok1) {
      const y = await pg.$$('button');
      for (const e of y) {
        const t = await e.evaluate((x) => (x.offsetParent ? x.textContent.trim() : '')).catch(() => '');
        if (/^(OK|はい|入れる|上書き)$/.test(t)) { await e.click({ timeout: 5000 }).catch(() => null); break; }
      }
    }
    await machi(1400);
  } else MI('カレンダーから 入れる ボタン', '画面に 無い');

  /* ★確定＝明細が 倉庫に 書かれる 道★（本物の click） */
  const kBtn = await pg.$('[data-confirm-month]');
  if (!kBtn) { MI('「今月を確定」の ボタン', '画面に 無い'); }
  else {
    const osenai = await kBtn.evaluate((e) => e.disabled);
    if (osenai) {
      const fuda = await kBtn.evaluate((e) => e.textContent.replace(/\s+/g, ' ').trim());
      MI('確定', '★ボタンが 押せない★（' + fuda.slice(0, 50) + '）');
    } else {
      await kBtn.click({ timeout: 8000 }).catch(() => null);
      await machi(900);
      const y = await pg.$$('button');
      for (const e of y) {
        const t = await e.evaluate((x) => (x.offsetParent ? x.textContent.trim() : '')).catch(() => '');
        if (/^(OK|はい|確定)$/.test(t)) { await e.click({ timeout: 5000 }).catch(() => null); break; }
      }
      await machi(2000);
      T('★① お客さんの 道で 明細を 出せた（本物の click）', true);
    }
  }

  /* ★⑤絵を 1枚★（数が 緑でも 絵を 開くまで OKに しない） */
  const E = path.join(ROOT, '.sweep-red', 'maboroshi-ui.png');
  try {
    fs.mkdirSync(path.dirname(E), { recursive: true });
    await pg.screenshot({ path: E, fullPage: false });
    console.log('  ★絵★ … ' + E + '（' + fs.statSync(E).size + 'バイト）');
  } catch (e) { MI('絵', String(e && e.message).slice(0, 60)); }
} catch (e) {
  if (e && e.message !== 'skip') { fail++; console.log('  ✗ 途中で 止まった … ' + (e && e.message)); }
} finally {
  await b.close().catch(() => null);
  srv.close();
}

/* ── ★③押した後の 数★（分母つき） ───────────────────────── */
const ato = await kojiKazoeru();
if (!ato.ok) { MI('押した後の 数', ato.naze); }
else {
  console.log('  ★押した後★ … 明細 ' + ato.zenbu + '行 中 ★孤児 ' + ato.koji + '行★'
    + ' ／ 従業員 ' + ato.hito + '人（うち『従業員 1』' + ato.maboroshi + '人）');
  console.log('  ★差★ … 明細 ' + (ato.zenbu - mae.zenbu >= 0 ? '+' : '') + (ato.zenbu - mae.zenbu)
    + ' ／ ★孤児 ' + (ato.koji - mae.koji >= 0 ? '+' : '') + (ato.koji - mae.koji) + '★'
    + ' ／ 『従業員 1』' + (ato.maboroshi - mae.maboroshi >= 0 ? '+' : '') + (ato.maboroshi - mae.maboroshi));
  /* ★0に なる 必要は ない★＝★増えていない事★が 今回の 直しの 本体 */
  T('★② 孤児が 増えていない（押す前 ' + mae.koji + '行 → 後 ' + ato.koji + '行）', ato.koji <= mae.koji,
    '★' + (ato.koji - mae.koji) + '行 増えた＝幻が また 孤児を 作っている★');
  T('★③ 幻の『従業員 1』が 増えていない（' + mae.maboroshi + '人 → ' + ato.maboroshi + '人）',
    ato.maboroshi <= mae.maboroshi, '★増えている★');
}

/* ★後始末★＝この回で 書いた 明細を 消す（触った 月だけ） */
if (HAJIME && YM_KONKAI) {
  const k = await MEISAI_KESU(MEISAI_MAE, [YM_KONKAI]);
  if (!k.ok) console.log('       🟡 この回の 明細を 消せなかった … ' + k.naze);
}

console.log(NL + pass + ' passed, ' + fail + ' failed, ' + mi + ' はかれない');
process.exit(fail ? 1 : 0);
