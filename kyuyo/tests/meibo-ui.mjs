/* meibo-ui.mjs — ★労働者名簿の 紙★を 実ブラウザで 1本 通す
 * ============================================================================
 * ★なぜ（2026-09-19）★
 *   司さん「たせ」で ★労働者名簿★（労基法107条・様式第十九号）を 足した。
 *   足した 日に ★試験が 1本も 無い★＝★次に 誰かが 壊しても 誰も 気づかない★。
 *   （★「紙が 在る」は ①押されている ②決まりが 分かる ③確かめられる の 3つとも 別★）
 *
 * ★法の 字は 記憶で 書かない★＝e-Gov 法令API の 原文（2026-09-19 取得）
 *   労基法  https://laws.e-gov.go.jp/api/2/law_data/322AC0000000049
 *   労基則  https://laws.e-gov.go.jp/api/2/law_data/322M40000100023
 *   ★107条★ 氏名／生年月日／★履歴★／その他 省令で 定める事項（★日日雇い入れられる者を除く★）
 *   ★則53条1項★ 一 性別／二 住所／★三 従事する業務の種類★／四 雇入の年月日／
 *                ★五 退職の年月日及びその事由★／★六 死亡の年月日及びその原因★
 *   ★則53条2項★ ★常時三十人未満★は 第三号を ★記入することを要しない★
 *   ★109条★ 五年間 保存 ／ ★則56条一号★ 起算日＝★死亡、退職又は解雇の日★
 *
 * ★ここで見る事★
 *   ① 帳票の 札に ★労働者名簿★が 在る（★分母＝札の 数★も 出す）
 *   ② 押したら ★表が 出る★／★行の 数＝見出し1＋今 居る 人数★（★分母つき★）
 *   ③ ★法の 11項目★が 見出しに ★1つも 欠けずに★ 在る
 *   ④ ★30人未満★の 時 「従事する業務の種類」に ★記入不要★と 出る（則53条2項）
 *   ⑤ ★保存 5年・起算日・日々雇い入れは 対象外★が 字で 出る
 *   ⑥ ★空の 欄を 黙って 空白に しない★＝★未記入★と 出す
 *   ⑦ 倉庫が 1行も 動いて いない（★読むだけの 紙★）
 *
 * ★わざと 壊す 回（--waza）★
 *   配る 時だけ `js/app.js` の `nin<30` を `nin<0` に する（＝★30人以上の 世界★）
 *   ⇒ ★④が 崩れる★（記入不要が 消える）／★他は 緑のまま★
 *   ＝★④は「何を しても 緑」では ない★を 字で 出す。
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const { kagiAru, hairu } = await import('../../tests/_hairu.mjs');
if (!(await kagiAru(ROOT))) {
  console.log('🟡 ★未測定★ ★本番の repo では 測りません★（試験用の 口が 居ません）');
  process.exit(0);
}
const { borrow, launch } = await import('../../scripts/_borrow-playwright.mjs');
const G = await import('./_souko-kazoeru.mjs');
const wk = await borrow('meibo-ui', 'webkit');
if (!wk) { console.log('🟡 ★未測定★ playwright を 借りられない（0件＝合格 とは 書かない）'); process.exit(2); }

const WAZA = process.argv.indexOf('--waza') >= 0;
const MON_MAE = 'var miman=nin<30;';
const MON_ATO = 'var miman=nin<0;';
const MON_HONSU = 1;
let mongae = 0;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const srv = http.createServer((rq, rs) => {
  const u = decodeURIComponent(rq.url.split('?')[0]);
  let p = path.join(ROOT, u);
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { rs.writeHead(404); rs.end('x'); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  if (WAZA && u.indexOf('/kyuyo/js/app.js') === 0) {
    const src = fs.readFileSync(p, 'utf8');
    mongae = src.split(MON_MAE).length - 1;
    rs.end(src.split(MON_MAE).join(MON_ATO));
    return;
  }
  rs.end(fs.readFileSync(p));
});
await new Promise((r) => srv.listen(0, r));
const PORT = srv.address().port;
const b = await launch('meibo-ui', wk);

let pass = 0, fail = 0, mi = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };
const MI = (n, m) => { mi++; console.log('  🟡 ★はかれない★ ' + n + (m ? ' … ' + m : '')); };

console.log('\n[meibo-ui] 労働者名簿の 紙（実ブラウザ）' + (WAZA ? '  ★★わざと 30人以上に した 回★★' : ''));
console.log('  ★席★ ' + G.seki() + '／★この 測りは 試験の 側の 数です／本番では 測って いません★');

const soukoMae = await G.kazoeru();
if (!soukoMae.ok) {
  if (G.kankyoKa(soukoMae.naze)) { console.log('  ' + G.kankyoIu('労働者名簿を 測って いません')); await b.close(); srv.close(); process.exit(0); }
  MI('倉庫を 数えられない', soukoMae.naze); await b.close(); srv.close(); process.exit(1);
}

/* ★★法が 要る 項目＝11個（★11の 出どころ★）★★
   ★どこから 11と 数えたか★（★記憶では なく 条文の 字を 割った★）
     ・法107条 …… ★氏名／生年月日／履歴★ …………………………… ★3★
     ・則53条1項 … 一 性別／二 住所／三 従事する業務の種類／
                   四 雇入の年月日 ………………………………………… ★4★
                   五 ★退職の年月日★ と ★その事由★ ＝ ★2★（★1号を 2欄に 割る★）
                   六 ★死亡の年月日★ と ★その原因★ ＝ ★2★（同上）
     ⇒ 3＋4＋2＋2 ＝ ★11★
   ★割った 訳★ … 条文は「★及び★」で 2つを 1号に 束ねて いるが
     ★画面の 欄としては 別物★（日付と 字）＝★別の 欄に しないと 入れられない★。
   ★様式★ … 様式第十九号（★様式の 絵は 見て いません＝様式の 欄の 並びは 未測定★）
   ★だから この 11は「★条文から 数えた 11★」であって「様式の 欄が 11」では ありません★ */
const HOU = ['氏名', '生年月日', '性別', '住所', '履歴', '従事する業務の種類',
  '雇入の年月日', '退職の年月日', '退職の事由', '死亡の年月日', '死亡の原因'];
const HOU_DEDOKORO = '法107条 3個（氏名・生年月日・履歴）＋則53条1項 4個（性別・住所・業務の種類・雇入の年月日）'
  + '＋五号を 2個（退職の年月日／その事由）＋六号を 2個（死亡の年月日／その原因）＝11'
  + '／★様式第十九号の 絵は 見て いません（様式の 欄の 並びは 未測定）★';

try {
  const pg = await b.newPage();
  const hai = await hairu(pg, 'http://localhost:' + PORT + '/kyuyo/index.html', '.bn[data-scr]');
  if (!hai.haitta) { MI('アプリに 入れない', hai.naze || ('試した ' + hai.kai + '回')); throw new Error('skip'); }

  if (WAZA) T('★わざ 差し替えが 効いた（' + mongae + 'か所）★', mongae === MON_HONSU, '★外したつもり★');

  await pg.click('.bn[data-scr="scr-list"]').catch(() => null);
  await new Promise((r) => setTimeout(r, 1200));
  const seg = await pg.$('.seg-b[data-view="cho"]');
  if (seg) await seg.click().catch(() => null);
  await new Promise((r) => setTimeout(r, 1200));

  /* ── ① 札 ─────────────────────────────────── */
  const fuda = await pg.evaluate(() => ({
    zen: document.querySelectorAll('[data-cho]').length,
    meibo: document.querySelectorAll('[data-cho="meibo"]').length,
  }));
  console.log('    ── ① 帳票の 札 ' + fuda.zen + 'つ（うち 労働者名簿 ' + fuda.meibo + '）');
  T('★① 帳票の 札に 労働者名簿が 在る（札 ' + fuda.zen + 'つ 中 1つ）★', fuda.meibo === 1,
    '札が ' + fuda.meibo + '個');

  let osita = false;
  for (let i = 0; i < 20 && !osita; i++) {
    osita = await pg.click('[data-cho="meibo"]', { timeout: 2000 }).then(() => true).catch(() => false);
    if (!osita) await new Promise((r) => setTimeout(r, 400));
  }
  if (!osita) { MI('札を 押せない', '20回 押しても 届かない'); throw new Error('skip'); }
  await new Promise((r) => setTimeout(r, 1200));

  const m = await pg.evaluate(() => {
    const h = document.querySelector('#view-cho');
    if (!h) return null;
    const t = h.innerText || '';
    const th = [...h.querySelectorAll('table thead th')].map((x) => (x.textContent || '').trim());
    return {
      ji: t,
      midashi: th,
      gyo: h.querySelectorAll('table tbody tr').length,
      minyu: (t.match(/未記入/g) || []).length,
      kinyuFuyou: t.indexOf('記入不要') >= 0,
      jibun: t.indexOf('自分で 作った') >= 0,
    };
  });
  if (!m) { MI('帳票の 台が 無い', '#view-cho が 出ない'); throw new Error('skip'); }

  /* ── ② 行の 数＝★この 口の★ 人数（分母つき） ───────────
     ★★倉庫の 人数と 比べては いけない★★（2026-09-19 自分で 踏んだ）
       倉庫には ★5人★ 居たが 表は ★3行★。訳＝★人は 口ごとに 分かれて いる★
       （山田 太／山田 太郎／従業員1・2・13 が ★3つの 別の 口★）。
       アプリは ★入った 口の 人しか 見ない★＝★正しい 振る舞い★。
     ⇒ ★分母は「試験が 入った 口の 人数」★。両方 出す（★隠さない★）。 */
  const Q = String.fromCharCode(39);
  const r1 = await G.toiawase('select count(*)::int n from pay_employees where account_id ='
    + ' (select id from auth.users where email = ' + Q + 'test@test.com' + Q + ')');
  const nin = r1.ok && r1.gyo[0] ? r1.gyo[0].n : -1;
  console.log('    ── ② 表の 行 ' + m.gyo + '（★この 口の 人 ' + nin + '人★／倉庫 全部 ' + soukoMae.hito + '人）');
  if (nin < 0) MI('★②の 分母★（この 口の 人数）', '管理鍵が 無い＝数えられない');
  else T('★② 表の 行が ★この 口の★ 人数と 合う（' + m.gyo + ' 行／' + nin + '人）★', m.gyo === nin,
    '行 ' + m.gyo + '／この口 ' + nin + '人');

  /* ── ③ 法の 11項目 ──────────────────────── */
  const kake = HOU.filter((x) => m.midashi.indexOf(x) < 0);
  console.log('    ── ③ 見出し ' + m.midashi.length + '個 … ' + m.midashi.join('／'));
  console.log('       ★' + HOU.length + 'の 出どころ★ … ' + HOU_DEDOKORO);
  T('★③ 法が 要る ' + HOU.length + '項目が 1つも 欠けて いない★', kake.length === 0,
    '欠けて いる … ' + kake.join('／'));

  /* ── ④ 30人未満（則53条2項） ───────────────── */
  if (WAZA) {
    T('★わざ④ 30人以上に したら「記入不要」が 消える★', m.kinyuFuyou === false,
      '★30人以上に したのに まだ 記入不要と 出る＝④は 何を しても 緑★');
  } else {
    T('★④ 30人未満なので「記入不要」と 出る（則53条2項・今 ' + nin + '人）★',
      m.kinyuFuyou === true && nin < 30, '記入不要 ' + m.kinyuFuyou + '／人 ' + nin);
  }

  /* ── ⑤ 保存・起算日・日々雇い入れ ───────────── */
  const go = ['5年間', '死亡・退職・解雇の日', '日々雇い入れられる方'];
  const nai = go.filter((x) => m.ji.indexOf(x) < 0);
  T('★⑤ 保存5年・起算日・日々雇い入れは対象外 が 字で 出る★', nai.length === 0,
    '出て いない … ' + nai.join('／'));

  /* ── ⑥ 空を 黙って 空白に しない ───────────── */
  T('★⑥ 入って いない 欄は ★未記入★と 出る（黙って 空白に しない）… ' + m.minyu + '件★',
    m.minyu > 0, '「未記入」が 1つも 出て いない（★空で 誤魔化して いる 恐れ★）');
} catch (e) {
  if (String(e && e.message) !== 'skip') MI('途中で 止まった', String(e && e.message || e).slice(0, 120));
} finally {
  await b.close().catch(() => null);
  srv.close();
}

/* ── ⑦ 倉庫が 動いて いない（読むだけの 紙） ───────── */
const sou = await G.awaseru(soukoMae, 20);
if (sou.han === '環境') { mi++; console.log('  ' + sou.iu); }
else if (sou.han === '未測定') { mi++; console.log('  🟡 ★未測定★ 倉庫で 数えられない … ' + sou.iu); }
else if (sou.han === '緑') { pass++; console.log('  ✓ ★⑦ 倉庫が 1行も 動いて いない（読むだけの 紙）★'); }
else { fail++; console.log('  ✗ ★⑦ 倉庫が 動いた★ — ' + sou.iu); }

if (WAZA) console.log('\n★わざと 30人以上に した 回の 読み方★ … ★④が 崩れる 事を 確かめた 回★');
console.log('\n' + pass + ' passed, ' + fail + ' failed' + (mi ? ', ' + mi + ' ★はかれない★' : ''));
process.exit(fail ? 1 : 0);
