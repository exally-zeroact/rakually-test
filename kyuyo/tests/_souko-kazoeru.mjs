/* _souko-kazoeru.mjs — ★試験の 置き土産を ★倉庫の 行数★ で 数える★ 1か所
 * =============================================================================
 * ★なぜ 作ったか（2026-09-14・私の 不始末）★
 *   実ブラウザの 試験 3本（fuyo-ui / seirino-ui / shutoku-ui）が
 *   ★「後始末＝人数が 元に 戻った」と 緑を 出していた★。
 *   ところが 倉庫を 数えたら ★今日 足した 人が 2人 残っていた★:
 *     e609e233 '整理試験'（seirino-ui）／'試験435197　太郎'（fuyo-ui）
 *   ★訳★＝数えていたのは ★画面の 札の 数（#emp-list .mco）だけ★。
 *     ・画面から 消えた → 緑
 *     ・倉庫は ★保存が 後から 走って 書き戻る／消しが 届かない★ → 残る
 *   ＝★今日 ずっと 潰してきた「測ったつもり」を 私の 後始末が やっていた★。
 *
 * ★決まり（2026-09-14 指示役1）★
 *   ★「置き土産 0」は ★倉庫の 行数★で 数える★（画面の 数では ない）。
 *
 * ★この 道具が する事★
 *   ・押す前と 後で ★kyuyo.pay_employees と kyuyo.pay_payslips の 行数★を 数える
 *   ・合わなければ ★消えるまで 待つ★（既定 20秒）／待っても 合わなければ ★赤★
 *   ・★鍵が 読めない時は 未測定★（0件＝合格 とは 書かない）
 *   ・★テスト倉庫だけ★＝本番の ref を 渡されたら ★その場で 止める★
 *
 * ★1か所に 置く 訳★＝3本が 写しを 持つと ★1本 直して 2本 古いまま★に なる。
 */
import fs from 'node:fs';

/* ★★向き先を 直書きしない（2026-09-14 見張りが 捕まえた）★★
   私は ★試験の 倉庫の ref を この紙に 直に 書いた★。★見張りが 赤に した★＝正しい 赤。
   訳（tests/repo-supa.mjs の 覚書そのもの）＝
     ★本番の repo に 持って行かれた時、直書きは そのまま 付いてくる★
     ＝★テストの つもりで 本番の 倉庫を 触る★という 最悪の 事故に なる。
     ★この紙は 消す 仕掛けを 持っている★ので、なおさら 危ない。
   ⇒ ★repo が 向いている 先を 機械に 決めさせる★（js/supa-config.js 1か所から 読む）。
     ＝★本番の repo で 走らせたら 本番を 指す★＝★下の 門で その場で 止まる★。 */
import { repoSupa } from '../../tests/repo-supa.mjs';

/* ★試験の 倉庫でなければ 1文字も 書かない★＝名前では なく ★repo の 向き先★で 決める。
   ★この紙は delete を 持つ★＝★取り違えたら 客の データが 消える★ので 門を 置く。 */
function souko() {
  const { ref } = repoSupa();
  return ref;
}
const TOKEN_FILE = process.env.TEMP
  ? process.env.TEMP.replace(/\\/g, '/') + '/nomiya-db-url-prod.json'
  : 'C:/Users/zeroa/AppData/Local/Temp/nomiya-db-url-prod.json';

function kagi() {
  try { return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8')).token; } catch (e) { return null; }
}

async function toi(sql) {
  const t = kagi();
  if (!t) return { ok: false, naze: '鍵の 紙が 読めない（' + TOKEN_FILE + '）' };
  try {
    const ref = souko();
    /* ★書く 道具が 本番を 指していたら その場で 止める★（読むだけの 時も 同じ 門で 止める＝安全側） */
    if (!ref) return { ok: false, naze: '★repo の 向き先を 読めない★＝触りません' };
    const r = await fetch('https://api.supabase.com/v1/projects/' + ref + '/database/query', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json', 'User-Agent': 'rakunally-souko-kazoeru' },
      body: JSON.stringify({ query: sql }),
    });
    if (!r.ok) return { ok: false, naze: '倉庫が ' + r.status + ' を 返した' };
    return { ok: true, gyo: await r.json() };
  } catch (e) { return { ok: false, naze: String(e && e.message || e).slice(0, 90) }; }
}

/* ★★倉庫へ 1本 問う（★ここが 唯一の 入口★）★★
   ★倉庫を 触る 測りは 全部 これを 使う★＝★鍵を 自分で 読まない★
   ＝★09-14 の 決め（鍵が 無い／読めない／段の 名）が ★必ず★ 当たる★。
   ★見張り★＝`kyuyo/tests/souko-mon.test.mjs`（鍵を 直に 読む 測りが 在れば 赤）。 */
export async function toiawase(sql) { return toi(sql); }

/* ★今の 行数★（2つの 棚）。読めなければ null（★0では ない★＝未測定） */
/* ★★門が 見る 物の 名簿（ここが「置き土産 0」の 意味）★★
   ★1か所に 在るので ここを 足せば ★この門を 使う 9本 全部に 効く★★
   ★足す時の 決まり★＝★試験が 触れる 所★を 足す（触らない 所を 足すと 他人の 仕業で 赤に なる）。 */
/* ★★誰が 作ったかを 1行で 出す（席の 名札）★★（2026-09-18 夜・★丸1時間 掛かった★）
   ★何が 起きたか★
     手元で 押して いる 最中に 倉庫が 増えた（明細+3／公開+2／紙+6／人+1）。
     ★この 機械の プロセスを 2つの 道具で 数えても 0本★＝★誰が 作ったか 決められなかった★。
     ★元★＝★★GitHub の 検査（WebKit）★★。実測で 一致:
        WebKit の 走り … 14:20:30 → ★14:28:17★ UTC
        増えた 行 …………… ★14:27:33 〜 14:28:10★ UTC（★終わり際に ぴたり★）
     ★なぜ 見えないか★＝★別の 機械で 走る／繋ぐ 倉庫は 同じ★
        （CI は `tests/_hairu.mjs` の `test@test.com` と ★紙に 在る 公開鍵★で ★入って 書ける★。
          ★門の 鍵（倉庫を 数える 鍵）は CI に 無い★＝★測れないが 書ける★＝★一番 気づきにくい★）
   ⇒ ★プロセスを 数えても 絶対に 見えない★＝★★倉庫の 側に 名札を 残すしか 無い★★
   ⇒ まず ★増えた/減った 人の 名前を 出す★＝★名前の 形で どの 試験かが 分かる★
     （`試験<6桁>　太郎`＝fuyo-ui/shutoku-ui の 形／`確定テスト…`＝santei の 形） */
export function seki() {
  return (process.env.CI || process.env.GITHUB_ACTIONS) ? 'ci' : 'temoto';
}
/* ★★試験が 作る 人の 名前に 席を 入れる★★（2026-09-19）
   ★訳★＝★同じ 試験の 倉庫を この 機械と GitHub の 機械が 使う★
     ⇒ ★増えた 人が どちらの 物か 名前で 分かる★＝★相手の 分で 赤に しない★
   ★印は 名前の 頭★＝★アプリを 通して 作るので 名前しか 使えない★（`data` に 席を 書く 道が 無い）
   ★使い方★＝試験が `const NA = shikenNa('試験' + …)` の 形で 使う。 */
export const SEKI_SHIRUSHI = { temoto: '手', ci: 'CI' };
export function shikenNa(moto) {
  return SEKI_SHIRUSHI[seki()] + String(moto || '');
}
/* ★その 名前は どの 席の 物か★（★分からない＝null★＝★緑に しない★） */
export function naNoSeki(na) {
  const t = String(na || '');
  for (const k of Object.keys(SEKI_SHIRUSHI)) { if (t.indexOf(SEKI_SHIRUSHI[k]) === 0) return k; }
  return null;
}

export function sekiIu() {
  return '★席★＝' + (seki() === 'ci' ? '会社の 検査（GitHub）' : '手元') + '（★同じ 試験の 倉庫を 2つの 機械が 使います★）';
}

export const MIRU = [
  { na: 'hito',       ji: '人' },
  { na: 'meisai',     ji: '明細' },
  { na: 'contractor', ji: '外注の 区分' },
  { na: 'kakutei',    ji: '確定した 明細' },
  { na: 'koukai',     ji: '★Web明細の 公開★' },
  { na: 'kami',       ji: '公開された 紙' },
];

/* ★★棚の 数を 決め打つ（門の 門）★★
   ★訳★＝★名簿は 必ず 何かを 忘れる★（2026-09-18 に 2人で ★10回★「名前を 打って 外した」）。
   ⇒ ★棚の 名前を 1つも 打たない★＝★その場で 部屋に 聞いて 全部に 指紋を 取る★。
   ⇒ 忘れる 余地が 残るのは ★「棚が 増えた事に 気付かない」★だけ なので ★数だけ 決め打つ★。 */
export const TANA_KAZU = 13;            /* kyuyo の 棚（BASE TABLE）… 2026-09-18 実測 */
/* ★部屋の 外に 在る 棚★＝`public.payslip_batches`（store.js:79 ＝★確定を 押すと upsert される★）。
   public は 66本＝★他のアプリと 同居★なので ★数では 縛れない★＝★ここだけ 名指し★。 */
export const HOKA_TANA = ['public.payslip_batches'];

/* ★★指紋から 除ける 物（＝免除）★★
   ★免除は 1つ 足すだけで 静かに 広がる★ので ★本数を 決め打ち★し、★出しに 毎回 出す★（黙って 除けない）。 */
export const YUBI_MENJO = [
  { tana: 'kyuyo.pay_companies', michi: ['data', 'company', 'baitaiTsuban'], ji: '媒体通番',
    naze: '★届出CSVを 作る たびに 1 上がる＝正しい 動き／戻す 方が 間違い★'
      + '（app.js:4844 ほか TodokedeCsv.nextTsuban）。'
      + '2026-09-18 実測＝soshitsu-ui の 前後で 66→67、他の 鍵は 1つも 違わない。' },
];
export const YUBI_MENJO_HONSU = 1;   /* ★ここを 超えたら 赤★（souko-mon.test.mjs と 同じ 形） */

/* ★免除を 字で 出す（★黙って 広がらない★為）★ */
export function yubiMenjoIu() {
  return '★免除 ' + YUBI_MENJO.length + '件★＝' + YUBI_MENJO.map((m) => m.ji).join('／');
}

/* ★★棚 1つの 指紋（列の 名前を 1つも 打たない）★★
   `to_jsonb(x.*)` ＝★その棚の 全部の 列★／並べ替えも ★行の 指紋そのもの★で するので ★鍵の 列名も 要らない★。
   ⇒ ★行数が 同じで 中身が 違う★を ★必ず★ 捕まえる（＝2026-09-18 に 私が 踏んだ 1件）。 */
/* ★★時刻の 列は「値」では なく「在る／無い」で 見る★★（2026-09-18 実測で 直した）
   ★最初 to_jsonb(x.*) を そのまま md5 に した所★
     ⇒ ★8本 中 5本が 赤★。中身を 写して 突き合わせたら ★中身は 全部 `updated_at`★
       例）updated_at "…T04:53:58.68+00:00" → "…T04:57:26.506+00:00"（★他の 鍵は 1つも 違わない★）
     ＝アプリは ★保存の たびに 全部の 行を 書き直す★ので ★時刻は 毎回 動く★。
     ⇒ ★指示役1 の「1回の 試験の 前後で 比べるだけ なので 正しい 変化で 壊れません」は 外れ★
       （★見立て★＝走らせて 初めて 分かった）。
   ★では 時刻の 列を 外せば 良いか＝★駄目★★
     `deleted_at`／`published_at`／`voided_at`／`consent_at`／`locked_until` は ★中身そのもの★。
     例）★消したはずが `deleted_at` だけ 立って 残る★＝★一番 見たい 置き土産★。
   ⇒ ★★値では なく 「在る／無い」で 見る★★
     ・`updated_at` … 前も 後も 在る ⇒ ★動かない★（雑音が 消える）
     ・`deleted_at` … 無い → 在る ⇒ ★★ずれる★★（置き土産を 捕まえる）
   ★列の 名前は ここでも 1つも 打たない★＝★部屋に「時刻の 型の 列」を 聞いて その場で 作る★。 */
/* ★★相手の 席が 作った 人は 指紋からも 除く★★（2026-09-19）
   ★訳★＝人の 数は 打ち消せても ★指紋（行の md5）が 残って 赤に なる★（実測）
   ★除くのは ★相手の 席の 印で 始まる 名前の 人★だけ★
     ⇒ ★相手が 私の 行を 触ったら 指紋は ずれる★（その行は 除かれない）＝★守りは 落ちない★
   ★私の 席の 人は 除かない★＝★自分の 置き土産は 必ず 赤★ */
/* ★★相手の 席の 人に ぶら下がる 物も 除く★★（2026-09-19・棚の ⑵）
   ★形★ … ★人の 名前の 印から 辿る★
     明細 `pay_payslips.employee_id` → 人 ／ 公開 `pay_meisai_pub.employee_id` → 人
     紙   `pay_meisai_docs.token` → 公開 → 人
   ★辿れない＝親が 居ない＝孤児★ ⇒ ★除かない（＝赤の まま）★
     ＝★席が 分からない のでは なく ★親が 居ない★★＝★私たちが ずっと 追いかけて いた 物★ */
function aiteNoShirushi() {
  return Object.keys(SEKI_SHIRUSHI).filter((k) => k !== seki()).map((k) => SEKI_SHIRUSHI[k]);
}
/* その 棚の 行が「相手の 席の 人の 物」か を 言う SQL（真＝相手の 物） */
export function aiteNoGyo(tana, alias) {
  const a = aiteNoShirushi();
  if (!a.length) return 'false';
  const na = a.map((x) => "e.data->>'name' like '" + x + "%'").join(' or ');
  const hito = (cond) => 'exists (select 1 from kyuyo.pay_employees e where ' + cond + ' and (' + na + '))';
  if (tana === 'kyuyo.pay_employees') return '(' + a.map((x) => "coalesce(" + alias + ".data->>'name','') like '" + x + "%'").join(' or ') + ')';
  if (tana === 'kyuyo.pay_payslips' || tana === 'kyuyo.pay_meisai_pub') {
    return hito('e.id = ' + alias + '.employee_id and e.account_id = ' + alias + '.account_id');
  }
  if (tana === 'kyuyo.pay_meisai_docs') {
    return 'exists (select 1 from kyuyo.pay_meisai_pub p where p.token = ' + alias + '.token and '
      + hito('e.id = p.employee_id and e.account_id = p.account_id') + ')';
  }
  return 'false';
}

/* ★★相手の席の 置き去りを 数える★★（2026-09-21 実測で 踏んだ）
   ★何が 起きたか★ … `kazoeru()` は ★相手の席（CI）の 行を わざと 除く★（`aiteNoGyo`）。
     ・除くのは ★相手が 走って いる 最中に 赤に しない 為★＝正しい 工夫
     ・しかし ★★除いた 物が 永久に 残っても 誰も 数えない★★
     ・そして ★アプリは 席で 除かない★
   ★実測（2026-09-21）★ … CI が 残した `CI試験366999　太郎`（家族1人）が
     ★どの 門にも 数えられず★、扶養の届出CSV に ★余分な 1行★として 出て
     `fuyo-ui` が ★赤★（21 passed 0 failed → 16 passed 5 failed）
   ⇒ ★★門は 緑／お客さんの 紙は 壊れる★★
   ★物差し（これを 変えたら 前の 数と 比べられません）★
     ・どこ … ★試験の 倉庫★／棚 `kyuyo.pay_employees`／★全行★
     ・誰 … ★相手の席の 印で 始まる 名前★（`aiteNoShirushi()`）
     ・いつ … ★`updated_at` が `fun` 分より 古い★＝★走って いる 最中の 回を 赤に しない★
   ★印が 無ければ★ … `shirushiNashi:true`／★honsu 0 を「合格」と 書かない★（呼ぶ側の 仕事） */
export async function aiteNoOkimiyage(fun) {
  const bun = Number(fun) > 0 ? Math.floor(Number(fun)) : 60;
  const a = aiteNoShirushi();
  if (!a.length) return { ok: true, honsu: 0, namae: [], fun: bun, shirushiNashi: true };
  const na = a.map((x) => "coalesce(x.data->>'name','') like '" + x + "%'").join(' or ');
  const r = await toi("select coalesce(x.data->>'name','(無名)') as na from kyuyo.pay_employees x"
    + ' where (' + na + ") and x.updated_at < now() - interval '" + bun + " minutes' order by 1");
  if (!r.ok) return { ok: false, naze: r.naze };
  return { ok: true, honsu: r.gyo.length, namae: r.gyo.map((g) => g.na), fun: bun };
}
const SEKI_WAKERU = ['kyuyo.pay_employees', 'kyuyo.pay_payslips', 'kyuyo.pay_meisai_pub', 'kyuyo.pay_meisai_docs'];
function aiteNoJoken(tana) {
  const t = tana || 'kyuyo.pay_employees';
  if (SEKI_WAKERU.indexOf(t) < 0) return '';
  if (!aiteNoShirushi().length) return '';
  return ' where not ' + aiteNoGyo(t, 'x');
}
function yubiSql(full, hiRetsu) {
  const nashi = "'無'::jsonb";   /* 使わないが 形を 揃える為に 置く */
  const arr = hiRetsu.length
    ? 'array[' + hiRetsu.map((c) => "'" + c + "'").join(',') + ']'
    : "array[]::text[]";
  /* ★免除を 先に 落とす★（`#-` ＝その 道の 鍵を 1つ 抜く） */
  const kesu = YUBI_MENJO.filter((m) => m.tana === full)
    .map((m) => " #- '{" + m.michi.join(',') + "}'").join('');
  const moto = 'to_jsonb(x.*)' + kesu;
  const naka = '(select jsonb_object_agg(e.k,'
    + ' case when e.k = any(' + arr + ')'
    + " then (case when e.v = 'null'::jsonb then to_jsonb('無'::text) else to_jsonb('有'::text) end)"
    + ' else e.v end)'
    + ' from jsonb_each(' + moto + ') as e(k, v))';
  const nozoku = aiteNoJoken(full);
  return "select '" + full + "' as tana,"
    + " coalesce(md5(string_agg(h, ',' order by h)), '空') as yubi"
    + ' from (select md5(' + naka + '::text) as h from ' + full + ' x' + nozoku + ') s';
}

/* ★★行ごと・列ごとの 指紋★★（2026-09-19 指示役1 の 注文）
   ★何が 足りなかったか★ … 上の `yubiSql` は 棚ごとに ★md5 を 1つに 潰す★。
     ⇒ ★「ずれた」しか 言えない★＝★どの 行か・どの 列か が ★構造上★ 出ない★
     ⇒ 今日 実際に 1回 ずれて ★訳が 決められなかった★（`kyuyo.pay_employees`）。
     ⇒ ★次に 起きても また 決められない★＝★これは「たまに 出る 赤」では なく ★言えない 見張り★★
   ★直し★ … 控えの 時に ★行ごとに（鍵, 列→md5）★を 持ち、確かめで ★集合の 差★を 取る。
     ★出すのは 鍵と 列の 名前だけ★＝★中身（名前・金額）は 1字も 出さない★。
   ★鍵★ … id → token → employee_id の 順で 在る物。無ければ `(鍵無し)`。
     ★鍵が 重なる 棚は「名指しできません」と 言う★＝黙って 当てない。 */
function yubiGyoSql(full, hiRetsu) {
  const arr = hiRetsu.length
    ? 'array[' + hiRetsu.map((c) => "'" + c + "'").join(',') + ']'
    : 'array[]::text[]';
  const kesu = YUBI_MENJO.filter((m) => m.tana === full)
    .map((m) => " #- '{" + m.michi.join(',') + "}'").join('');
  const moto = '(to_jsonb(x.*)' + kesu + ')';
  const atai = '(case when e.k = any(' + arr + ')'
    + " then (case when e.v = 'null'::jsonb then to_jsonb('無'::text) else to_jsonb('有'::text) end)"
    + ' else e.v end)';
  const nozoku = aiteNoJoken(full);
  return "select '" + full + "' as tana,"
    + ' coalesce(' + moto + "->>'id', " + moto + "->>'token', " + moto + "->>'employee_id', '(鍵無し)') as k,"
    + ' (select jsonb_object_agg(e.k, md5(' + atai + '::text))'
    + ' from jsonb_each(' + moto + ') as e(k, v)) as retsu'
    + ' from ' + full + ' x' + nozoku;
}

/* ★★控えと 今を 並べて ★どの 行が 違うか★ を 言う★★（中身は 出さない） */
export function gyoNoChigai(maeG, imaG, tana) {
  const m = (maeG || {})[tana] || [];
  const i = (imaG || {})[tana] || [];
  if (!m.length && !i.length) return ['★控えに 行の 指紋が 無い＝行を 名指しできません★'];
  const kaburu = (a) => {
    const mi = {};
    for (const x of a) { if (mi[x.k]) return true; mi[x.k] = 1; }
    return false;
  };
  if (kaburu(m) || kaburu(i)) {
    return ['★鍵が 重なる 棚＝行を 名指しできません★（id/token/employee_id が 一意で ない）'];
  }
  const hako = (a) => { const o = {}; for (const x of a) o[x.k] = x.retsu || {}; return o; };
  const M = hako(m), I = hako(i), deta = [];
  Object.keys(M).forEach((k) => {
    if (!(k in I)) { deta.push('★消えた 行★ ' + k); return; }
    const chigau = Object.keys(M[k]).filter((c) => M[k][c] !== I[k][c])
      .concat(Object.keys(I[k]).filter((c) => !(c in M[k])));
    if (chigau.length) deta.push('★書き換わった 行★ ' + k + '（列 ' + chigau.join(' ') + '）');
  });
  Object.keys(I).forEach((k) => { if (!(k in M)) deta.push('★増えた 行★ ' + k); });
  return deta.length ? deta : ['★行の 差は 0＝棚の 指紋だけが 違う（免除・並び以外の 訳）★'];
}

/* ★★触る 棚 全部の 指紋を 取る★★（門の 中 1か所＝9本 全部に 効く） */
export async function yubimon() {
  /* ★門の 門★＝★免除が 黙って 増えたら 赤★ */
  if (YUBI_MENJO.length !== YUBI_MENJO_HONSU) {
    return { ok: false,
      naze: '★免除の 本数が 決め打ちと 合わない★＝決め打ち ' + YUBI_MENJO_HONSU
        + ' ／ 実際 ' + YUBI_MENJO.length + '（★足したなら 訳を 書いて 決め打ちも 直す★）' };
  }
  const t = await toi("select table_name from information_schema.tables"
    + " where table_schema='kyuyo' and table_type='BASE TABLE' order by table_name");
  if (!t.ok) return { ok: false, naze: t.naze };
  const kyuyo = t.gyo.map((g) => 'kyuyo.' + g.table_name);
  const zenbu = kyuyo.concat(HOKA_TANA);
  /* ★時刻の 型の 列を 部屋に 聞く★＝★名前を 1つも 打たない★（2026-09-18 実測 29個） */
  const c = await toi("select table_schema||'.'||table_name as t, column_name"
    + ' from information_schema.columns'
    + " where data_type like 'timestamp%'");
  if (!c.ok) return { ok: false, naze: c.naze };
  const hi = {};
  for (const g of c.gyo) (hi[g.t] = hi[g.t] || []).push(g.column_name);
  const r = await toi(zenbu.map((f) => yubiSql(f, hi[f] || [])).join(' union all '));
  if (!r.ok) return { ok: false, naze: r.naze };
  const yubi = {};
  for (const g of r.gyo) yubi[g.tana] = g.yubi;
  /* ★行ごとの 指紋も 一緒に 取る★（赤に なった 時 ★その場で★ 行を 名指しする為） */
  const rg = await toi(zenbu.map((f) => yubiGyoSql(f, hi[f] || [])).join(' union all '));
  const gyo = {};
  if (rg.ok) for (const g of rg.gyo) (gyo[g.tana] = gyo[g.tana] || []).push({ k: g.k, retsu: g.retsu || {} });
  return { ok: true, tana: kyuyo.length, yubi, gyo,
    gyoNaze: rg.ok ? '' : rg.naze, kazu: Object.keys(yubi).length };
}

export async function kazoeru() {
  /* ★★★行数だけでは「置き土産 0」と 言えない（2026-09-18 実測で 踏んだ）★★★
     ★何が 起きたか★
       試験が 人の ★区分を employee → contractor に 変えた★。戻す 所が 失敗して ★倉庫に 残った★。
       ★なのに この 門は 緑★＝「行数が 元に 戻った（人 5／明細 14）」。
       ⇒ ★★行の 数は 同じ／★中身が 別物★★★＝★誰も 見に 行かない★
     ★数えた★ … この 門を 使う 試験は ★9本★／★中身（列）を 見る 字は ★0件★★
       ⇒ ★穴は 私 1人の 話では なく 9本ぶん★
     ★だから 足す＝★触られやすい 中身の 指紋★★
       ・`contractor`     … 区分を 変えて 戻し忘れたら 動く
       ・`kakutei`        … 明細を 確定して 取り消し忘れたら 動く
       ・`koukai`         … ★従業員の Web明細に 公開が 残ったら 動く★（★人の 明細が 見える 側★）
       ・`kami`           … 公開された 紙の 数
     ★行数だけ 戻っても これが 戻らなければ ★赤★に なります★ */
  /* ★★数からも 相手の 席の 分を 除く★★（2026-09-19・棚の ⑵）
     ★指紋だけ 除いても 数が 残れば 赤★（人で 実測済み）＝★両方 除く★
     ★除くのは「相手の 席の 人に ぶら下がる 物」だけ★＝★親が 居ない 物（孤児）は 残す＝赤★ */
  const nai = (t) => ' where not ' + aiteNoGyo(t, 'x');
  const r = await toi(
    'select (select count(*) from kyuyo.pay_employees x' + nai('kyuyo.pay_employees') + ') as hito,'
    + ' (select count(*) from kyuyo.pay_payslips x' + nai('kyuyo.pay_payslips') + ') as meisai,'
    + " (select count(*) from kyuyo.pay_employees x" + nai('kyuyo.pay_employees')
    + "   and coalesce(x.data->>'employmentType','employee')='contractor') as contractor,"
    + " (select count(*) from kyuyo.pay_payslips x" + nai('kyuyo.pay_payslips')
    + "   and coalesce(x.data->>'confirmed','false')='true') as kakutei,"
    + ' (select count(*) from kyuyo.pay_meisai_pub x' + nai('kyuyo.pay_meisai_pub') + ') as koukai,'
    + ' (select count(*) from kyuyo.pay_meisai_docs x' + nai('kyuyo.pay_meisai_docs') + ') as kami');
  if (!r.ok) return { ok: false, naze: r.naze };
  const x = r.gyo[0] || {};
  /* ★名指しの 6個と 指紋は ★両方 要る★★
     ＝★指紋は「ずれた」しか 言わない／6個は「何が ずれたか」を 言う★（指示役1 2026-09-18）。 */
  const y = await yubimon();
  if (!y.ok) return { ok: false, naze: y.naze };
  /* ★名前も 控える★＝★増えた 人の 名前が 出れば「どの 試験か」が 1行で 分かる★ */
  const n = await toi("select coalesce(x.data->>'name','(無名)') as na from kyuyo.pay_employees x"
    + ' where not ' + aiteNoGyo('kyuyo.pay_employees', 'x') + ' order by 1');
  const namae = n.ok ? n.gyo.map((g) => g.na) : [];
  return { ok: true, hito: Number(x.hito), meisai: Number(x.meisai), namae,
    contractor: Number(x.contractor), kakutei: Number(x.kakutei),
    koukai: Number(x.koukai), kami: Number(x.kami),
    tana: y.tana, yubi: y.yubi, gyo: y.gyo, gyoNaze: y.gyoNaze };
}

/* ★★★鍵が 無い（＝この環境では 倉庫を 数えない）を 決める 門＝ここ 1か所★★★
   ★なぜ 1か所に したか（2026-09-15・★同じ型を 3回 踏んだ★）★
     ①`_souko-kazoeru`（09-14 に 決めた）
     ②`maboroshi-ui`（★自分で 鍵を 読んでいた★＝写し忘れ）
     ③`shutoku-ui`（★新しく 足した 測りに 当てなかった★）
   ⇒ ★決めは 知っていた／新しく 足す 時に 当てなかった★＝★人の 記憶で 保つ 形★
   ⇒ ★★倉庫を 触る 測りは 全部 ここを 通す★★
     ＝★★呼ぶ側は「鍵が 無い」を 知らなくてよい（知らないから 忘れる）★★
   ★09-14 指示役1 の 決め（3つ）★
     ①鍵が 無い … ★緑(0)で 通す／ただし 数は 出す／0件＝合格 と 書かない★
     ②鍵は 在るのに 読めない … ★赤★
     ③★仕事の 段の 名に「CIでは 倉庫を 数えていない」と 書く★
   ★戻す条件★＝★CI に 試験倉庫の 鍵を 置いた日★
   ★見張り★＝`kyuyo/tests/souko-mon.test.mjs`（★鍵を 直に 読む 測りが 在れば 赤★）。 */
/* ★★孤児を 数える（★親が 居ない 物★）★★（2026-09-20）
   ★なぜ ここに 在るか★
     ・09-20 実測 … ★鍵の 孤児 25本／鎖で 人まで 届かない 紙 18枚★が 積んで いた。
     ・★どの 門も この 2つの 棚を 見て いなかった★（孤児を 見る 門は `maboroshi-ui` 1本で、
       見る 棚は ★`pay_payslips` だけ★／判定も ★その回の 差★だけ）。
     ・前に 出ていた「鍵20／紙3」とは ★物差しが 違って 比べられなかった★。
     ⇒ ★★数え方を ここ 1か所に 置く★★＝次の 人が 同じ 字で 数え直せる。
   ★★物差し（これを 変えたら 前の 数と 比べられません）★★
     ・どこ … ★試験の 倉庫★／スキーマ ★kyuyo★／★全行★（席で 除かない＝★孤児は 席が 無い★）
     ・鎖 … ★紙 → 鍵 → 人★
     ・人との 突き合わせ … ★鍵/紙は `e.data->>'id'`★・★明細は `e.id`★
       （★同じ 列では ない★＝09-20 実測で 両方 同じ 値だったが ★字は 別★なので 分けて 書く）
   ★返す 物★ … ok / kagiZen kagiKoji / kamiZen kamiTodokanai / hito / meisaiZen meisaiKoji */
export async function kojiKazoeru() {
  const r = await toi(
    'select (select count(*) from kyuyo.pay_meisai_pub) as kagi_zen,'
    + ' (select count(*) from kyuyo.pay_meisai_pub p where not exists'
    + "   (select 1 from kyuyo.pay_employees e where e.data->>'id'=p.employee_id)) as kagi_koji,"
    + ' (select count(*) from kyuyo.pay_meisai_docs) as kami_zen,'
    + ' (select count(*) from kyuyo.pay_meisai_docs d'
    + '   left join kyuyo.pay_meisai_pub p on p.token=d.token'
    + '   where p.token is null or not exists'
    + "   (select 1 from kyuyo.pay_employees e where e.data->>'id'=p.employee_id)) as kami_todokanai,"
    + ' (select count(*) from kyuyo.pay_employees) as hito,'
    + ' (select count(*) from kyuyo.pay_payslips) as meisai_zen,'
    + ' (select count(*) from kyuyo.pay_payslips p where not exists'
    + '   (select 1 from kyuyo.pay_employees e where e.id=p.employee_id)) as meisai_koji');
  if (!r.ok) return { ok: false, naze: r.naze };
  const x = (r.gyo || [])[0] || {};
  const n = (k) => Number(x[k]);
  const kazu = { kagiZen: n('kagi_zen'), kagiKoji: n('kagi_koji'), kamiZen: n('kami_zen'),
    kamiTodokanai: n('kami_todokanai'), hito: n('hito'), meisaiZen: n('meisai_zen'), meisaiKoji: n('meisai_koji') };
  /* ★道具が 返した 0 を 信じない★＝1つでも 数に ならなければ ★未測定★ */
  const warui = Object.keys(kazu).filter((k) => !Number.isFinite(kazu[k]));
  if (warui.length) return { ok: false, naze: '数に ならない 欄 … ' + warui.join(' / ') };
  return Object.assign({ ok: true }, kazu);
}

export function kankyoKa(naze) {
  return String(naze || '').indexOf('鍵の 紙が 読めない') >= 0;
}

/* ★★その時 出す 字も 1か所★★（呼ぶ側で 書き写さない＝ずれない） */
export function kankyoIu(nanNoHanashi) {
  console.log('  🟡 ★未測定★ ★この環境では 倉庫を 数えていません … 1本★（試験の 鍵が 無い）'
    + (nanNoHanashi ? '／' + nanNoHanashi : ''));
  console.log('     ＝★手元の テスト線で 数えています★／戻す条件＝CIに 鍵を 置いた日');
  console.log('     ★0件＝合格 とは 書きません★');
}

/* ★★名前から その人の id を 引く★★（読むだけ・2026-09-15）
   ★なぜ 要るか★＝★消した 後は 名簿から 居なく なる★ので、
     ★消す前に id を 控えて おかないと「その人の 明細」を 数えられない★。
   ★画面からは 取れません★（app.js は 従業員の id を 外へ 出していない＝実測）。 */
export async function hitoNoId(na) {
  const n = String(na || '');
  if (!/^[^']{2,60}$/.test(n)) return { ok: false, naze: '名前の 形が 違う' };
  const r = await toi("select id from kyuyo.pay_employees where (data->>'name') = '" + n + "'");
  if (!r.ok) return { ok: false, naze: r.naze };
  const ids = (r.gyo || []).map((x) => String(x.id));
  if (ids.length !== 1) return { ok: false, naze: 'その名前の 人が ' + ids.length + '人 居ます（1人でないと 取り違えます）' };
  return { ok: true, id: ids[0] };
}

/* ★★その人の 明細が 倉庫に 何行 在るか★★（読むだけ・2026-09-15）
   ★なぜ 要るか★＝「消したら 明細も 消える」を 測るのに ★全体の 行数では 足りない★。
     全体は ★他の 試験が 同時に 書く★ので ±0 に 見えたり する（今日 それで 1度 騙された）。
   ⇒ ★その人の id で 数える★＝★消える 所を まっすぐ 見る★。
   ★分母にも 使う★＝★消す前に N行 出来ていたか★（0行なら ★消える所を 見ていない＝はかれない★）。 */
export async function hitoNoMeisai(employeeId) {
  const id = String(employeeId || '');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return { ok: false, naze: 'id の 形が 違う' };
  const r = await toi("select count(*) as n from kyuyo.pay_payslips where employee_id = '" + id + "'");
  if (!r.ok) return { ok: false, naze: r.naze };
  return { ok: true, n: Number((r.gyo[0] || {}).n) };
}

/* ★★その人の「Web明細の 鍵」を 数える★★（pay_meisai_pub＝従業員が 自分の 明細を 見る 入口）
   ★なぜ 数えるか（2026-09-18 実測）★
     人を 消しても ★鍵の 行は 残って いた★＝テスト線で ★公開 78行 中 73行が「もう 居ない 人」★。
     （リンク自体は unpublishMeisai で 死んで いる＝★危険では なく 残骸★。倉庫の 入口が 断る。） */
export async function hitoNoKagi(employeeId) {
  const id = String(employeeId || '');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return { ok: false, naze: 'id の 形が 違う' };
  const r = await toi("select count(*) as n from kyuyo.pay_meisai_pub where employee_id = '" + id + "'");
  if (!r.ok) return { ok: false, naze: r.naze };
  return { ok: true, n: Number((r.gyo[0] || {}).n) };
}

/* ★★支度＝その人の 鍵を 1本 作る（★測る所では 使わない★）★★
   ★訳★＝★分母 0 で 緑に しない★為。鍵は 本来「月を 確定＝全員に 公開」で 出来るが、
     それは ★他人の 月まで 巻き込む★（app.js:5502 の 取り消しが その 形で 事故を 起こした）。
   ⇒ ★支度は 直に 作る／測るのは ★客の 道で 消えるか★★＝[[feedback_js_dispatched_event_is_not_the_customer_path]] の 線引きと 同じ。
   ★テスト線だけ★（この 紙が 持つ ref は 試験の 1つだけ）。 */
export async function kagiTsukuru(employeeId) {
  const id = String(employeeId || '');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return { ok: false, naze: 'id の 形が 違う' };
  const r = await toi('insert into kyuyo.pay_meisai_pub (account_id, employee_id, init_code)'
    + " select e.account_id, e.id, 'TESTCODE' from kyuyo.pay_employees e where e.id = '" + id + "'"
    + ' returning token');
  if (!r.ok) return { ok: false, naze: r.naze };
  return { ok: true, n: (r.gyo || []).length, token: ((r.gyo || [])[0] || {}).token };
}

/* ★★支度＝その鍵に「公開された 紙」を 1枚 ぶら下げる（★測る所では 使わない★）★★
   ★訳（2026-09-18 実測で 踏んだ）★
     `pay_meisai_docs` は `pay_meisai_pub` に ★ON DELETE CASCADE★で 繋がって いる
     （`pay_nencho_decl`／`pay_emp_profile` も 同じ）。
     ⇒ ★鍵を 消すと ★お金の 記録まで 一緒に 消える★★。私は これを 数えずに 消し、
       テスト線の 紙を ★15行 → 2行★に して しまった。
   ⇒ 店は ★ぶら下がりが 在る 鍵は 消さない★ 形に した ⇒ ★その 守りを 実物で 測る★為の 支度。 */
export async function kamiTsukuru(token, opt) {
  const t = String(token || '');
  if (!/^[0-9a-fA-F-]{36}$/.test(t)) return { ok: false, naze: 'token の 形が 違う' };
  /* ★中身を 入れられる ように した★（2026-09-19）
     ★訳★＝★従業員の 画面に 出る 字★を 測るには ★中身が 要る★（空の 紙では 何も 出ない）。
     ★形は 実物から 取った★ … `{ doc:{month}, theme:{}, person:{ net, kojo:[], shikyu:[] } }`
       `person.net` ＝★差引支給額★（従業員の 画面に 出る 数）
     ★ym／kind／net は 呼ぶ側が 決める★＝★測る 字を 呼ぶ側が 知って いる★形に する。 */
  const o = opt || {};
  const ym = /^[0-9]{4}-[0-9]{2}$/.test(String(o.ym || '')) ? o.ym : '2026-06';
  const kind = /^[a-z]+$/.test(String(o.kind || '')) ? o.kind : 'monthly';
  const net = Number(o.net) > 0 ? Math.floor(Number(o.net)) : 0;
  /* ★★`kintai` と `doc.kind` を 足した★★（2026-09-21・司さん「壊れたんなら 直さんかい」）
     ★何が 壊れて いたか（実測で 切り分けた）★
       この 道具で 作った 紙は ★従業員の 画面で 開けませんでした★
       （一覧には 出る／押せる／★中身が 入れ替わらない／未読も 消えない★）
       ⇒ ★賞与だけかと 思ったが ★月次も 同じ★★＝★アプリの 話では なく この 道具の 話★
     ★因★ … `kyuyo/js/render.js:68` `kinBuild(kintai,…)` が ★`kintai.length` を 読む★
       ⇒ `kintai` が 無いと ★投げる★
       ⇒ `meisai.js` の `openDoc` は ★`catch(e){ return; }`★＝★黙って 帰る★
       ⇒ ★悲鳴も 出ない／何も 起きない★（★だから 訳が 分からなかった★）
     ★直し★ … ★実物の 紙と 同じ 形に する★
       （会社が 作る 紙＝`app.js:5974` は `doc:{month, kind}` ／ person に `kintai` が 在る）
     ★★アプリ側の 弱さも 在ります★★＝★`kintai` が 無い 紙で 落ち、その 例外を 飲む★
       ⇒ ★但し 会社が 作る 紙には 必ず 入る★ので ★棚に 置く（直して いません）★ */
  const naka = o.data ? String(o.data) : JSON.stringify({
    doc: { month: ym, kind: kind },
    theme: { ink: '#23261f', line: '#cfc9b8', accent: '#6f5a3e' },
    person: { net: net, name: String(o.na || ''),
      kintai: kind === 'bonus' ? [] : [{ label: '出勤日数', value: '20' }, { label: '労働時間', value: '160:00' }],
      shikyu: [{ label: kind === 'bonus' ? '賞与' : '基本給', value: net }], kojo: [] },
  });
  if (naka.indexOf('$$') >= 0) return { ok: false, naze: '中身に $$ が 在る' };
  const r = await toi('insert into kyuyo.pay_meisai_docs (id, token, account_id, ym, kind, data, published_at)'
    + " select 'doc_test_' || substr(md5(random()::text),1,8), p.token, p.account_id, '" + ym + "', '" + kind + "',"
    + ' $$' + naka + '$$::jsonb, now() from kyuyo.pay_meisai_pub p'
    + " where p.token = '" + t + "' returning id");
  if (!r.ok) return { ok: false, naze: r.naze };
  return { ok: true, n: (r.gyo || []).length, net, ym };
}

/* ★★試験用の 人を 1人 作る（★支度 専用★）★★（2026-09-19）
   ★測るのは 従業員の 道（meisai.html）★／★会社側の 支度は 直に 作る★＝★線引きを 字で 書く★
   ★名前には 席の 印を 付ける★（`shikenNa`）＝★相手の 席と 混ざらない★ */
/* ★試験が ログインする 口★＝`tests/_hairu.mjs` が 打ち込む メールと ★同じ 物★
   （★2か所に 同じ 字を 持たせない★為、直す 時は 両方 見る＝
     [[feedback_mihon_no_michi_ga_futatsu_aru_toki_katahou_dake_naosu_na]]） */
export const SHIKEN_NO_KUCHI = 'test@test.com';

export async function hitoTsukuru(na) {
  const n = String(na || '').replace(/['\;]/g, '');
  if (!n) return { ok: false, naze: '名前が 空' };
  /* ★★id は ★棚の 列★と ★data の 中★の 2か所に 要る★★（2026-09-19 実測で 捕まえた）
     ★前★ … 列にだけ 入れて `data` に 入れて いなかった。
     ★何が 起きたか★ … アプリは `data` を 読んで 名簿を 作る。`data.id` が 無いと
       ★アプリが 自分の 形の id を 振り直して 保存する★（`app.js:45` の `uid()`＝`e…`）。
       ⇒ ★倉庫の 行は 別の id に なる★
       ⇒ `hitoKesu('ztest_…')` は ★0行 消して「ok」を 返す★＝★片づけたつもり★
       ⇒ ★残骸が 溜まる★（2026-09-19 に 消した 14人は ★全部 `e…` の id★＝これが 出所）
       ⇒ 鍵（pay_meisai_pub）は ★名簿に 無い 人の 物★に なり
         `store.js:528` の 決まりで ★一覧から 消える★＝`link-ji` が「行が 出ない」で 止まった。
     ⇒ ★アプリと 同じ 形の id★を 作り、★2か所とも 同じ 字★を 入れる。 */
  const id = 'e' + Math.random().toString(36).slice(2, 10);
  /* ★★口を 当てずっぽうで 選ばない★★（2026-09-19 実測で 捕まえた）
     ★前★ … `from kyuyo.pay_employees e limit 1` ＝★どの 行が 来るかは 決まって いない★。
     ★何が 起きたか★ … 試験用の 14人を 消した 後、この `limit 1` が
       ★試験が ログインする 口（test@test.com）とは 別の 人の 口★を 拾った。
       ⇒ 作った 人は ★倉庫には 居るのに 会社の 一覧に 出ない★
       ⇒ `link-ji` が 40秒 待って 「行が 出ない」＝★アプリの 欠陥に 見えた★。
     ⇒ ★試験が 入る 口を 名指しで 引く★（`tests/_hairu.mjs` と 同じ 口）。
     ★見つからなければ 作らない★＝黙って 別の 口に 作らない。 */
  /* ★★並び番号（sort）も 入れる★★（2026-09-19 実測＝★開くだけで 動く★の 正体）
     ★測り方★ … アプリを ★開くだけ（1回も 押さない）★で 4回 測った
       ⇒ ★1回目だけ `kyuyo.pay_employees` の ★`sort` 列★が 4行 書き換わった★／2〜4回目は 0本
     ★訳★ … `sort` は ★口ごとの 並び番号★。支度が 入れずに 作ると ★既定の 0★に なり、
       既に 0 の 人と ★重なる★ ⇒ ★アプリは 開いた 時に 振り直して 保存する★
       ⇒ ★試験は 1文字も 押して いないのに 倉庫が 動く★
       ⇒ `awaseru` が ★「指紋が ずれた（中身だけ）」★で 赤に なる（今日 2回／約22回中）
     ⇒ ★重ならない 番号を 自分で 入れる★＝アプリに 振り直す 仕事を 作らない。 */
  const r = await toi('insert into kyuyo.pay_employees (id, account_id, sort, data)'
    + " select '" + id + "', u.id,"
    + ' coalesce((select max(e.sort) from kyuyo.pay_employees e where e.account_id = u.id), -1) + 1,'
    + " jsonb_build_object('id','" + id + "','name','" + n + "','employmentType','employee')"
    + " from auth.users u where u.email = '" + SHIKEN_NO_KUCHI + "' returning id");
  if (!r.ok) return { ok: false, naze: r.naze };
  if (!r.gyo || !r.gyo.length) {
    return { ok: false, naze: '★試験の 口（' + SHIKEN_NO_KUCHI + '）が 倉庫に 居ない＝人を 作りません★' };
  }
  return { ok: true, id };
}
export async function hitoKesu(id) {
  const i = String(id || '').replace(/[^A-Za-z0-9_-]/g, '');
  if (!i) return { ok: false, naze: 'id が 空' };
  const r = await toi("delete from kyuyo.pay_employees where id = '" + i + "' returning id");
  if (!r.ok) return { ok: false, naze: r.naze };
  /* ★★0行 消えた＝「消した」では ない★★（2026-09-19 実測）
     前は `{ ok: true, n: 0 }` を 返して いた＝★呼ぶ側は n を 見て いない★
     ⇒ ★片づけたつもり★が 黙って 通り、残骸が 溜まった。 */
  const n = (r.gyo || []).length;
  if (n === 0) return { ok: false, n: 0, naze: '★0行 消えた＝その id（' + i + '）は 倉庫に 居ない★' };
  return { ok: true, n };
}

/* ★★人の 中身も 控えて 戻す（★片づけ 専用★）★★（2026-09-18 に 足した）
   ★なぜ 要るか（実測）★
     年末調整の「反映」を 押すと 人の 中身に `nenchoAdj` が 入る。
     ★アプリの「解除」は `nenchoAdj = null` に するだけ＝★キーを 消さない★★
     ⇒ 押す前は ★キーが 無い★／解除の 後は ★null が 残る★＝★指紋が ずれる★
     ⇒ 実測 … 押して 解除した のに ★門が 赤（kyuyo.pay_employees）★
   ★アプリとしては 正しい★（null＝反映なし）。★戻すのは 試験の 仕事★。
   ★会社と 同じ 形★＝★控えに 戻す／控えに 在る 物だけ★（時刻で 消さない）。 */
export async function hitoHikaeru() {
  const r = await toi('select id, account_id, data::text as j from kyuyo.pay_employees');
  if (!r.ok) return { ok: false, naze: r.naze };
  return { ok: true, gyo: r.gyo };
}
export async function hitoModosu(mae) {
  if (!mae || !mae.ok) return { ok: false, naze: '控えが 無い＝何も しない' };
  let n = 0;
  for (const g of mae.gyo) {
    const id = String(g.id || '').replace(/[^A-Za-z0-9_-]/g, '');
    const j = String(g.j == null ? '' : g.j);
    if (!id || !j) continue;
    if (j.indexOf('$$') >= 0) return { ok: false, naze: '控えに $$ が 在る＝戻しません' };
    const r = await toi('update kyuyo.pay_employees set data = $$' + j + '$$::jsonb'
      + " where id = '" + id + "' and data::text is distinct from $$" + j + '$$::jsonb::text'
      + ' returning id');
    if (!r.ok) return { ok: false, naze: r.naze };
    n += (r.gyo || []).length;
  }
  return { ok: true, n };
}

/* ★★一括＝人と 会社を まとめて 控える／戻す★★
   ★訳★＝★押す 前に 控えるのを 忘れる★のが 一番 多い（2026-09-18 に 私が 踏んだ）
   ⇒ ★1回 呼べば 両方★＝★忘れる 余地を 減らす★ */
export async function zenbuHikaeru() {
  const hito = await hitoHikaeru();
  if (!hito.ok) return { ok: false, naze: '人：' + hito.naze };
  const kaisha = await kaishaHikaeru();
  if (!kaisha.ok) return { ok: false, naze: '会社：' + kaisha.naze };
  /* ★★確定も 控える★★（2026-09-19 に 足した）
     ★訳★＝賞与の 画面を 触った だけの 走りで ★確定した 明細 25→24（-1）★に なった。
       押したのは 賞与の 行の 足す/消すだけ／確定も 解除も 押して いない。
       ⇒ ★描き直し＋丸ごと 保存（persistSave）が 明細を 書き直す★ 道が 在る（09-18 実測）。
     ⇒ ★人・会社だけ 控えても 足りない★＝★確定も 一緒に 控える★
     ★消えた 物は 戻せない★ので ★控えは「確定して いた id の 名簿」★＝★外れた 物を 戻す★。 */
  const kakutei = await kakuteiHikaeru();
  if (!kakutei.ok) return { ok: false, naze: '確定：' + kakutei.naze };
  return { ok: true, hito, kaisha, kakutei };
}
export async function zenbuModosu(mae) {
  if (!mae || !mae.ok) return { ok: false, naze: '控えが 無い＝何も しない' };
  const h = await hitoModosu(mae.hito);
  if (!h.ok) return { ok: false, naze: '人：' + h.naze };
  const k = await kaishaModosu(mae.kaisha);
  if (!k.ok) return { ok: false, naze: '会社：' + k.naze };
  /* ★★「控えに 無い＝自分が 付けた」は ★2席では 成り立たない★★★（2026-09-19 実測）
       私の 戻しが ★CI が たった今 付けた 確定 13件を 外した★。
       ★同じ 試験の 倉庫を この 機械と GitHub の 機械が 使う★＝★控えの 後に 増えた 物は 相手の 分かも しれない★。
     ⇒ ★★消さない／字で 言う★★＝★増えた 分は 数だけ 出す★
     ⇒ ★立て直す（控えに 在ったのに 外れた 物）は そのまま やる★＝★これは 自分の 仕業★が 確か
       （相手が 外す 事も 有り得るが、★立て直して 困る 相手は 居ない★＝元に 戻すだけ） */
  let kaku = { ok: true, n: 0, modoshita: 0, yokei: 0 };
  if (mae.kakutei && mae.kakutei.ok) {
    const ima = await kakuteiHikaeru();
    if (!ima.ok) return { ok: false, naze: '確定（数える）：' + ima.naze };
    const moto = new Set(mae.kakutei.id || []);
    kaku.yokei = (ima.id || []).filter((x) => !moto.has(x)).length;   /* ★外さない★＝数えるだけ */
    const id = mae.kakutei.id || [];
    if (id.length) {
      const ji = id.map((x) => "'" + String(x).replace(/[^A-Za-z0-9_.:@+-]/g, '') + "'").join(',');
      const r = await toi("update kyuyo.pay_payslips set data = data || '{\"confirmed\":true}'::jsonb"
        + ' where id in (' + ji + ")"
        + " and coalesce(data->>'confirmed','false') <> 'true' returning id");
      if (!r.ok) return { ok: false, naze: '確定（立て直す）：' + r.naze };
      kaku.modoshita = (r.gyo || []).length;
    }
  }
  return { ok: true, hito: h.n, kaisha: k.n,
    kakuteiModoshita: kaku.modoshita,                 /* 控えに 在ったのに 外れて いた 物を 立て直した */
    kakuteiYokei: kaku.yokei,                          /* ★控えの 後に 増えた 確定＝★外して いません★★ */
    iu: '人 ' + h.n + '行／会社 ' + k.n + '行／確定 立て直した ' + kaku.modoshita + '件'
      + (kaku.yokei ? '／★控えの 後に 増えた 確定 ' + kaku.yokei + '件＝★外して いません（相手の 席の 分かも）★★' : '') };
}

/* ★★「確定」と「公開」を ★見つけた 状態に 戻す★（★片づけ 専用★）★★（2026-09-18）
   ★なぜ 要るか（実測）★
     「今月を確定」は ★その月の 全員★を 確認済に し、★全員を Web明細に 公開★する（app.js）。
     ⇒ 試験が 自分の 人の 為に 1回 押すだけで ★他の 人の 確定・公開まで 作られる★。
     ⇒ 逆に 片づけで 月まとめの 取り消しを 押すと ★元から 在った 確定まで 消える★
        （2026-09-18 実測 … ★確定 4行 → 1行★＝元から 在った 3件を 壊した）。
   ⇒ ★★時刻で 消さない／「前に 在ったか」で 決める★★
      （2026-09-14 … 時刻で 消して ★元から 在った 明細まで 消した★＝同じ 型を 繰り返さない）
   ★戻し方★ … 控えに 無い 物は 元へ（確定を 外す・公開を 消す）／控えに 在る 物は ★触らない★。 */
export async function kakuteiHikaeru() {
  const r = await toi("select id from kyuyo.pay_payslips where coalesce(data->>'confirmed','false')='true'");
  if (!r.ok) return { ok: false, naze: r.naze };
  return { ok: true, id: r.gyo.map((g) => g.id) };
}
export async function koukaiHikaeru() {
  const d = await toi('select id from kyuyo.pay_meisai_docs');
  if (!d.ok) return { ok: false, naze: d.naze };
  const p = await toi('select token from kyuyo.pay_meisai_pub');
  if (!p.ok) return { ok: false, naze: p.naze };
  return { ok: true, kami: d.gyo.map((g) => g.id), kagi: p.gyo.map((g) => g.token) };
}
function ji(a) { return a.map((x) => "'" + String(x).replace(/[^A-Za-z0-9_.:@+-]/g, '') + "'").join(','); }
export async function kakuteiModosu(mae) {
  if (!mae || !mae.ok) return { ok: false, naze: '控えが 無い＝何も しない' };
  const nai = mae.id.length ? " and id not in (" + ji(mae.id) + ')' : '';
  const r = await toi("update kyuyo.pay_payslips set data = data || '{\"confirmed\":false}'::jsonb"
    + " where coalesce(data->>'confirmed','false')='true'" + nai + ' returning id');
  if (!r.ok) return { ok: false, naze: r.naze };
  return { ok: true, n: (r.gyo || []).length };
}
export async function fuetaKoukaiKesu(mae) {
  if (!mae || !mae.ok) return { ok: false, naze: '控えが 無い＝何も しない' };
  const naiK = mae.kami.length ? ' where id not in (' + ji(mae.kami) + ')' : '';
  const d = await toi('delete from kyuyo.pay_meisai_docs' + naiK + ' returning id');
  if (!d.ok) return { ok: false, naze: d.naze };
  const naiP = mae.kagi.length ? ' where token not in (' + ji(mae.kagi) + ')' : '';
  const p = await toi('delete from kyuyo.pay_meisai_pub' + naiP + ' returning token');
  if (!p.ok) return { ok: false, naze: p.naze };
  return { ok: true, kami: (d.gyo || []).length, kagi: (p.gyo || []).length };
}

/* ★★会社の 欄を 控えて、控えに 戻す（★片づけ 専用★）★★（2026-09-18）
   ★何が 起きて いたか（手元の 総なめ #25 #31 で 出た）★
     試験が `#c-pref` など ★会社の 欄に 打ちっぱなし★／★戻す 字が どちらにも 無い★（字で 数えた＝各 1回＝打つだけ）。
     ⇒ 片づけの 門が ★kyuyo.pay_companies の 指紋 ずれ★で 赤に した。
     ⇒ ★行数も 名指しの 6個も 動かない＝前の 門なら 永久に 緑★だった。
   ★媒体通番だけは 戻さない★＝★届出CSVを 作る たび 1 上がるのが 正しい★（指紋の 免除と 揃える）。
   ★時刻で 消さない／控えに 在る 物だけ 戻す★＝2026-09-14 の 型を 繰り返さない。 */
export async function kaishaHikaeru() {
  const r = await toi('select account_id, data::text as j from kyuyo.pay_companies');
  if (!r.ok) return { ok: false, naze: r.naze };
  return { ok: true, gyo: r.gyo };
}
export async function kaishaModosu(mae) {
  if (!mae || !mae.ok) return { ok: false, naze: '控えが 無い＝何も しない' };
  let n = 0;
  for (const g of mae.gyo) {
    const id = String(g.account_id || '').replace(/[^0-9a-fA-F-]/g, '');
    const j = String(g.j == null ? '' : g.j);
    if (!id || !j) continue;
    /* ★字を そのまま 埋めない★＝ドル囲みで 渡す（中に $$ が 在れば 触らない） */
    if (j.indexOf('$$') >= 0) return { ok: false, naze: '控えに $$ が 在る＝戻しません' };
    const r = await toi('update kyuyo.pay_companies c set data = case'
      + " when c.data #> '{company,baitaiTsuban}' is not null"
      + "  then jsonb_set($$" + j + "$$::jsonb, '{company,baitaiTsuban}', c.data #> '{company,baitaiTsuban}')"
      + ' else $$' + j + '$$::jsonb end'
      + " where c.account_id = '" + id + "'"
      + ' and c.data::text is distinct from'
      + "  (case when c.data #> '{company,baitaiTsuban}' is not null"
      + "   then jsonb_set($$" + j + "$$::jsonb, '{company,baitaiTsuban}', c.data #> '{company,baitaiTsuban}')"
      + ' else $$' + j + '$$::jsonb end)::text'
      + ' returning c.account_id');
    if (!r.ok) return { ok: false, naze: r.naze };
    n += (r.gyo || []).length;
  }
  return { ok: true, n };
}

/* ★★支度で 作った 鍵と 紙を 片づける（★後始末 専用・測る所では 使わない★）★★
   ★訳★＝この 支度は ★消えては いけない 物（紙つきの 鍵）★を わざと 作る＝★自分で 片づけないと 門が 赤★。
   ★順★＝紙 → 鍵（CASCADE だが 数を 出す 為に 順に 消す）。★テスト線だけ★。 */
export async function shitakuKesu(employeeId) {
  const id = String(employeeId || '');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return { ok: false, naze: 'id の 形が 違う' };
  const d = await toi('delete from kyuyo.pay_meisai_docs d using kyuyo.pay_meisai_pub p'
    + " where p.token = d.token and p.employee_id = '" + id + "' returning d.id");
  if (!d.ok) return { ok: false, naze: d.naze };
  const k = await toi("delete from kyuyo.pay_meisai_pub where employee_id = '" + id + "' returning token");
  if (!k.ok) return { ok: false, naze: k.naze };
  return { ok: true, kami: (d.gyo || []).length, kagi: (k.gyo || []).length };
}

/* ★その人の 鍵に ぶら下がって いる「紙」を 数える★ */
export async function hitoNoKami(employeeId) {
  const id = String(employeeId || '');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return { ok: false, naze: 'id の 形が 違う' };
  const r = await toi('select count(*) as n from kyuyo.pay_meisai_docs d'
    + ' join kyuyo.pay_meisai_pub p on p.token = d.token'
    + " where p.employee_id = '" + id + "'");
  if (!r.ok) return { ok: false, naze: r.naze };
  return { ok: true, n: Number((r.gyo[0] || {}).n) };
}

/* ★★「今」は ★倉庫の 時計★に 聞く（2026-09-14 総なめで 捕まった）★★
   前は ★手元の 時計から 60秒 手前★を 始まりに していた（時計の ずれを 見込んで）。
   ⇒ 総なめで 試験が 続けて 走ると ★直前の 試験の ゴミまで 60秒の 窓に 入る★
     ＝★自分が 作っていない 物まで 消す★＝★土台より 減って 赤★に なった（明細 -4）。
   ⇒ ★倉庫の 時計を そのまま 使う★＝★ずれは 元から 無い★＝窓を 広げる 要が ない。
   ★読むだけ★（1文字も 書かない）。 */
export async function ima() {
  const r = await toi('select now() as t');
  if (!r.ok) return { ok: false, naze: r.naze };
  return { ok: true, t: String((r.gyo[0] || {}).t || '') };
}

/* ★前と 後を 突き合わせる★
   mae … kazoeru() の 戻り ／ byo … 何秒 待つか（消えるのを 待つ）
   返り … { han:'緑'|'赤'|'未測定', ... } ＋ 人が 読める 一言 */
export async function awaseru(mae, byo = 20) {
  if (!mae || !mae.ok) {
    /* ★★「この環境では 測れない」と「測り損ねた」は 別（2026-09-14 CIで 捕まった）★★
       ★CI には 倉庫の 鍵が 置いていない★＝★元から 数えられない★。
       それを「測り損ね」と 数えて ★中身が 全部 緑なのに 赤★に していた
       （実測＝資格取得届 9本 緑・34列・ずれ0 なのに 終わり値 1）。
       ＝★毎回 鳴る 赤★＝★そのうち 誰も 読まなくなる★＝今日 何度も 見た 型。
       ⇒ ★鍵が 無い時だけ 別の 名前で 返す★＝★赤にも 緑にも しない／字では はっきり 言う★。
         （tests/_hairu.mjs の kagiAru と 同じ 決め方＝★測れない事を 字で 言ってから 抜ける★）
       ★測り損ね（鍵は 在るのに 読めない 等）は 今までどおり 未測定★＝赤の まま。 */
    const naze = (mae && mae.naze) || '（訳 不明）';
    if (naze.indexOf('鍵の 紙が 読めない') >= 0) {
      /* ★★緑で 通すなら 数を 出す（2026-09-14 指示役1 の 条件）★★
         ★「赤にも 緑にも しない」は 機械には 無い★＝終わり値は 0 か 0以外。
         0（緑）に するなら ★材料が 無いのに 緑★＝今日 ずっと 潰してきた 形。
         ⇒ ★3つとも やって 初めて 緑に してよい★:
           ①その段の 出力の 一番 上に「この環境では 測れていない … ◯本」
           ②★総なめの「未測定」の 数に 必ず 入る 字★で 書く（clock-sweep が 拾う）
           ③CI の 段の 名前にも 出す（名前を 見ただけで 分かる）
         ★字は「未測定」を 含める★＝★静かに 消えない★ようにする。 */
      return { han: '環境',
        iu: '🟡 ★未測定★ ★この環境では 倉庫を 数えていません … 1本★（試験の 鍵が 無い）'
          + '＝★手元の テスト線で 数えています★／戻す条件＝CIに 鍵を 置いた日' };
    }
    return { han: '未測定', iu: '★前を 数えられていない★＝' + naze };
  }
  for (let i = 0; i <= byo * 2; i++) {
    const ato = await kazoeru();
    if (!ato.ok) return { han: '未測定', iu: '★後を 数えられない★＝' + ato.naze };
    /* ★相手の 席の 分は 人の 数からも 引く★＝★相手が 走る たび 赤に しない★（2026-09-19）
       ★但し 引くのは 人だけ★＝明細・公開・紙は ★誰の 物か 分けられない★＝★赤の まま★ */
    /* ★数は もう 相手の 分を 除いて 数えて いる★（`kazoeru` の 側）＝★ここで 引かない★
       （2026-09-19 … 前は ここで 人だけ 引いて いた＝★二重に 引く 所だった★） */
    const zure = MIRU.filter((m) => ato[m.na] !== mae[m.na]);
    /* ★棚が 増えた／減った★＝名簿の 外に 置き土産が 出来る道が 開いた＝★赤★ */
    const tanaZure = (ato.tana !== TANA_KAZU) || (ato.tana !== mae.tana);
    /* ★指紋の ずれ★＝★列の 名前を 1つも 見ずに 中身の 変化を 捕まえる★ */
    const yubiZure = Object.keys(ato.yubi || {})
      .filter((k) => (mae.yubi || {})[k] !== ato.yubi[k])
      .concat(Object.keys(mae.yubi || {}).filter((k) => !(k in (ato.yubi || {}))));
    if (!zure.length && !tanaZure && !yubiZure.length) {
      return { han: '緑', mae, ato, matta: i * 0.5,
        iu: '倉庫が 元に 戻った（' + MIRU.map((m) => m.ji + ' ' + mae[m.na]).join(' ／ ') + '）'
          + '　★名指し ' + MIRU.length + '個 ＋ ★棚 ' + Object.keys(ato.yubi || {}).length
          + '本の 指紋★（列の 名前は 1つも 打って いない）★　' + yubiMenjoIu()
          + (i ? '　★' + (i * 0.5) + '秒 待った★' : '') };
    }
    if (i < byo * 2) await new Promise((r) => setTimeout(r, 500));
    else {
      const iu = [];
      if (zure.length) {
        iu.push('★名指し★ ' + zure.map((m) => m.ji + ' ' + mae[m.na] + '→' + ato[m.na]
          + '（' + (ato[m.na] - mae[m.na] >= 0 ? '+' : '') + (ato[m.na] - mae[m.na]) + '）').join(' ／ '));
      }
      if (yubiZure.length) {
        iu.push('★指紋が ずれた 棚 ' + yubiZure.length + '本★ … ' + yubiZure.join(' / ')
          + (zure.length ? '' : '　★行数も 名指しの 6個も 動いて いない＝★中身だけ 変わった★★'));
        /* ★★ずれた 棚の ★どの 行か★ を その場で 名指しする★★（2026-09-19 指示役1 の 注文）
           ★中身は 1字も 出さない★＝鍵と 列の 名前だけ。
           ★後から／気づかない★では なく ★その場で 訳が 決まる★ようにする。 */
        if (!ato.gyo || !mae.gyo) {
          iu.push('★行を 名指しできません★（行の 指紋が 取れて いない'
            + (ato.gyoNaze || mae.gyoNaze ? '＝' + (ato.gyoNaze || mae.gyoNaze) : '') + '）');
        } else {
          yubiZure.forEach((t) => {
            const d = gyoNoChigai(mae.gyo, ato.gyo, t);
            iu.push('　— ' + t + ' … ' + d.slice(0, 6).join(' ／ ')
              + (d.length > 6 ? ' …（他 ' + (d.length - 6) + '件）' : ''));
          });
        }
      }
      if (tanaZure) {
        iu.push('★棚の 数が 変わった★ … 決め打ち ' + TANA_KAZU + ' ／ 前 ' + mae.tana + ' ／ 後 ' + ato.tana
          + '（★増えた 棚は 誰も 見て いない＝名簿を 直す★）');
      }
      /* ★★増えた／減った 人の 名前を 出す★★＝★「誰が」を 1行で★
         （2026-09-18 夜 … 名前が 出て いれば ★丸1時間 掛けずに 済んだ★） */
      const maeN = (mae.namae || []).slice(), atoN = (ato.namae || []).slice();
      const hiku = (a, b) => { const c = b.slice(); return a.filter((x) => { const i = c.indexOf(x); if (i < 0) return true; c.splice(i, 1); return false; }); };
      const fueta = hiku(atoN, maeN), heta = hiku(maeN, atoN);
      /* ★★席で 割る★★（2026-09-19）
         ・★相手の 席の 名前★ … ★字で 出す／赤に しない★（★その分は 人の 数からも 引く★）
         ・★自分の 席の 名前★ … ★赤★
         ・★どちらでも ない★ … ★赤★（★分からない を 緑に しない★） */
      const aite = fueta.filter((x) => { const s2 = naNoSeki(x); return s2 && s2 !== seki(); });
      const jibun = fueta.filter((x) => naNoSeki(x) === seki());
      const fumei = fueta.filter((x) => naNoSeki(x) === null);
      if (aite.length) iu.push('★相手の 席の 分 ' + aite.length + '人★ … ' + aite.join(' / ')
        + '＝★赤に しません（消して いません）★');
      if (jibun.length) iu.push('★自分の 席の 分 ' + jibun.length + '人★ … ' + jibun.join(' / ') + '＝★置き土産★');
      if (fumei.length) iu.push('★どちらか 決められない ' + fumei.length + '人★ … ' + fumei.join(' / ')
        + '（★名前に 席が 入って いない★）＝★赤の ままに します★');
      /* ★★増えた 物は「自分」か「相手」か 決められない★★（2026-09-19）
         ★同じ 試験の 倉庫を この 機械と GitHub の 機械が 使う★
         ⇒ ★決められない 物は 緑に しない（赤の まま）／但し ★決められない と 字で 言う★★
         ＝★「控えに 無い＝自分が 付けた」は 2席では 成り立たない★ */
      const fuyu = MIRU.filter((m) => ato[m.na] > mae[m.na]);
      if (fuyu.length || fueta.length) {
        iu.push('★増えた 物は 自分の 分か 相手の 席の 分か ★決められません★★'
          + '（★' + (fuyu.map((m) => m.ji).join('／') || '人') + ' が 増えて います★）'
          + '＝★消して いません／赤の ままに します★');
      }
      if (heta.length) iu.push('★減った 人 ' + heta.length + '人★ … ' + heta.join(' / '));
      return { han: '赤', mae, ato, zure: zure.map((m) => m.na), yubiZure, tanaZure, fueta, heta,
        iu: '★倉庫に 置き土産が 残っている★　' + iu.join('　') + '　' + sekiIu()
          + '　★' + byo + '秒 待っても 戻らず★　' + yubiMenjoIu() };
    }
  }
  return { han: '未測定', iu: '（ここには 来ない）' };
}

/* ★★その人の 明細を 倉庫から 直に 消す（後始末だけ）★★
   ★なぜ 要るか（2026-09-14 実測）★
     画面の「削除」は ★従業員を 消すだけ★で ★明細は 残る★（app.js 5264-5274）。
     倉庫側も ★pay_employees の 差分削除だけ★（store.js 203-207）＝
     ⇒ ★消した人の 明細が 孤児に なる★。実測 … 試験の 倉庫に ★孤児 3,596行★。
   ★これは 片づけ専用★＝★測る所では 使わない★
     （測る所は 本物の click＝[[feedback_js_dispatched_event_is_not_the_customer_path]] と 同じ 線引き）。
   ★テスト倉庫だけ★（この 紙が 持つ ref は 試験の 1つだけ）。 */
export async function meisaiKesu(employeeId) {
  const id = String(employeeId || '').replace(/[^A-Za-z0-9_-]/g, '');   /* ★字を そのまま 埋めない★ */
  if (!id) return { ok: false, naze: 'id が 空' };
  const r = await toi("delete from kyuyo.pay_payslips where employee_id = '" + id + "'");
  return r.ok ? { ok: true } : { ok: false, naze: r.naze };
}

/* ★★この回で 出た 孤児だけ 消す（後始末だけ）★★
   ★なぜ id では ないか（2026-09-14 実測）★
     足した人の id を 画面から 取ろうとしたが ★取れなかった★（state を 外に 出していない）。
     ⇒ ★人の 物に 触らない★為に、★2つとも 満たす 行だけ★に 絞る:
        ① ★pay_employees に 持ち主が 居ない（孤児）★
        ② ★この回が 始まった 後に 書かれた★（updated_at ≧ 始めた時）
     ＝★前から 在る 孤児 3,596行には 1行も 触りません★。
   ★テスト倉庫だけ★／★片づけ専用★（測る所では 使わない）。 */
export async function konkaiNoGomiKesu(hajimeIso) {
  /* ★空きも 残す★＝倉庫の 時計は「日付 空き 時刻」で 来る。ここで 空きを 落とすと 門に 届かない（2026-09-14 実測） */
  const t = String(hajimeIso || '').replace(/[^0-9TZ:.+ -]/g, '').trim();
  /* ★★形は 2通り 来る（2026-09-14 実測で 直した）★★
     手元の 時計 … 2026-09-14T13:31:57.626Z（★T 付き★）
     倉庫の 時計 … 2026-09-14 13:31:57.626+00（★空きで 区切る★）
     ★前は T 付きしか 通さず★、倉庫の 時計に 替えた 途端 ★1件も 消さなくなった★。
     ★掃除の 字から 空きを 落としていた★のも 同じ日に 踏んだ（2026-09-1413:34 に なっていた）。 */
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]/.test(t)) return { ok: false, naze: '始めた時の 形が 違う（' + t + '）' };
  const r = await toi(
    "delete from kyuyo.pay_payslips p where p.updated_at >= '" + t + "'"
    + " and not exists (select 1 from kyuyo.pay_employees e where e.id = p.employee_id)");
  return r.ok ? { ok: true } : { ok: false, naze: r.naze };
}

/* ★★この回で 出来た 明細を 消す（後始末だけ）★★
   ★2026-09-15 作り替えた＝★時刻で 消す のを やめ、★印（id）★で 消す★★
   ★前の 作り（時刻）で 何が 起きたか★
     「今月を確定」も「この月の確定を取り消す」も ★その月の 明細を 書き直す★
     ⇒ ★前から 在った 行の updated_at が 動く★
     ⇒ ★「この回の 行」と 見なされて 一緒に 消えた★
     ⇒ webkit 総なめ（2026-09-15）で ★明細 3,721→3,720＝-1★＝★実物が 1行 減った★。
     （この 型は 道具の 覚書に ★前から 予告して あった★＝「減って 赤に なる＝自分で 気づける」）
   ★今の 作り★
     ①走る前に ★その月の id を 控える★（meisaiIdHikaeru）
     ②終わったら ★控えに 無い id だけ★ 消す
     ＝★★前から 在った 行は 触りようが ない★★（時計の ずれも 書き直しも 関係ない）
   ★時間では なく 印で 決める★＝今日 何度も 出た形。
   ★テスト倉庫だけ★／★片づけ専用★。 */
export async function meisaiIdHikaeru(yms) {
  const m = (yms || []).map((x) => String(x).replace(/[^0-9-]/g, '')).filter((x) => /^[0-9]{4}-[0-9]{2}$/.test(x));
  if (!m.length) return { ok: false, naze: '月を 渡していない' };
  const r = await toi("select id from kyuyo.pay_payslips where ym in ('" + m.join("','") + "')");
  if (!r.ok) return { ok: false, naze: r.naze };
  return { ok: true, ids: (r.gyo || []).map((x) => String(x.id)), tsuki: m };
}

export async function fuetaMeisaiKesu(hikae, yms) {
  const m = (yms || []).map((x) => String(x).replace(/[^0-9-]/g, '')).filter((x) => /^[0-9]{4}-[0-9]{2}$/.test(x));
  if (!m.length) return { ok: false, naze: '月を 渡していない（月を 絞らずには 消しません）' };
  /* ★控えが 取れていない時は ★1行も 消さない★★＝★分からない時に 消すのが 一番 危ない★ */
  if (!hikae || !hikae.ok || !Array.isArray(hikae.ids)) {
    return { ok: false, naze: '★控えが 無い＝1行も 消しません★（' + ((hikae && hikae.naze) || '控えを 取っていない') + '）' };
  }
  /* ★id は 字で 埋める★＝形を 見てから（変な 字が 来たら 消さない） */
  const ids = hikae.ids.filter((x) => /^[A-Za-z0-9_-]{1,64}$/.test(x));
  if (ids.length !== hikae.ids.length) return { ok: false, naze: '控えの id に 見慣れない 字が 在る＝消しません' };
  const nai = ids.length ? " and id not in ('" + ids.join("','") + "')" : '';
  const r = await toi("delete from kyuyo.pay_payslips where ym in ('" + m.join("','") + "')" + nai);
  return r.ok ? { ok: true, hikaeta: ids.length } : { ok: false, naze: r.naze };
}

/* ★★印を 付けた 人を 名前で 消す（後始末だけ）★★
   ★なぜ 要るか★＝★確定した 明細が 在る人は 画面から 消せない★（app.js の 門が そう している）。
     ＝算定/月変を 測る 回は ★画面の 道では 片づけられない★。
   ★条件（2026-09-14 指示役1）★＝★確定用は 別の人・名前に 印★。その 印で 狙う。
   ★明細 → 従業員 の 順★／★テスト倉庫だけ★／★片づけ専用★（測る所では 使わない）。 */
export async function sujiKesu(shirushi) {
  const na = String(shirushi || '');
  if (!/^[^']{4,60}$/.test(na)) return { ok: false, naze: '印の 形が 違う' };   /* ★字を そのまま 埋めない★ */
  const j = "(data->>'name') = '" + na + "'";
  const a = await toi("delete from kyuyo.pay_payslips p where exists"
    + " (select 1 from kyuyo.pay_employees e where e.id = p.employee_id and " + j + ")");
  if (!a.ok) return { ok: false, naze: a.naze };
  const b2 = await toi("delete from kyuyo.pay_employees where " + j);
  return b2.ok ? { ok: true } : { ok: false, naze: b2.naze };
}

/* ★字を くくる★＝','で 割れない・引用符を 埋めない（片づけ専用の 短い 字しか 渡さない） */
function qs(x) { return "'" + String(x).replace(/'/g, '') + "'"; }

/* ★自己確認★＝この道具が ★赤を 出せる★事を 先に 見る（ブラウザ 不要） */
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('_souko-kazoeru.mjs')) {
  console.log('\n[_souko-kazoeru] ★自己確認★（①〜⑤＝読むだけ ／ ★⑥〜⑨＝誰も 使わない 月 1999-01 に 2行 置いて 消す＝その場で 片づける★）');
  let ng = 0;
  const iu = (n, good, m) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + n + (good ? '' : '  ★' + (m || '思っていたのと 違う') + '★')); };

  const ima = await kazoeru();
  if (!ima.ok) {
    /* ★★ここも 分ける（2026-09-14 CIが 捕まえた・直し漏らし）★★
       この 自己確認は ★倉庫を 読むだけ★＝★CI には 鍵が 無いので 元から 測れない★。
       それを 終わり値 2（赤）に していた＝★毎回 必ず 鳴る 赤★。
       ⇒ 上の awaseru と ★同じ 決め方★に 揃える:
         ・鍵が 無い … ★緑（0）で 通す／ただし 未測定として 数を 出す★
         ・鍵は 在るのに 読めない … ★今までどおり 赤（2）★ */
    if (String(ima.naze).indexOf('鍵の 紙が 読めない') >= 0) {
      console.log('  🟡 ★未測定★ ★この環境では 倉庫を 数えていません … 1本★（試験の 鍵が 無い）');
      console.log('     ＝★手元の テスト線で 数えています★／戻す条件＝CIに 鍵を 置いた日');
      console.log('     ★0件＝合格 とは 書きません★');
      process.exit(0);
    }
    console.log('  🟡 ★未測定★ 倉庫を 読めない … ' + ima.naze);
    console.log('     ★0件＝合格 とは 書きません★');
    process.exit(2);
  }
  console.log('  今の 倉庫 … 人 ' + ima.hito + ' ／ 明細 ' + ima.meisai);
  iu('① 今の 数を 読める', ima.hito >= 0 && ima.meisai >= 0);

  /* ★同じ数なら 緑★ */
  const a = await awaseru(ima, 1);
  iu('② 同じなら 緑', a.han === '緑', '出たのは ' + a.han);

  /* ★★わざと ずらしたら 赤★★＝★これが 出ないと この道具は 嘘を つく★
     （2026-09-14 私の 後始末が まさに ★ずれているのに 緑★でした） */
  const b = await awaseru({ ok: true, hito: ima.hito - 1, meisai: ima.meisai }, 1);
  iu('③ ★人が 1人 多ければ 赤★', b.han === '赤', '出たのは ' + b.han);
  const c = await awaseru({ ok: true, hito: ima.hito, meisai: ima.meisai - 1 }, 1);
  iu('④ ★明細が 1行 多ければ 赤★', c.han === '赤', '出たのは ' + c.han);

  /* ★前を 数えられていない時は 未測定（緑にも 赤にも しない）★ */
  const d = await awaseru({ ok: false, naze: 'わざと' }, 1);
  iu('⑤ 前が 無ければ 未測定', d.han === '未測定', '出たのは ' + d.han);

  /* ★★⑥〜⑨ 前から 在った 行が 消えない事を 見る（2026-09-15 指示役1 の 注文）★★
     ★訳★＝前の 作り（時刻で 消す）は ★実物を 1行 消した★（webkit 総なめで 明細 -1）。
     ★ここだけ 1文字 書きます★（上の ①〜⑤ は 読むだけ）。
     ★誰も 使わない 月（1999-01）で やる★＝★本物の 月には 一切 触らない★。
     ★置いた 2行は この場で 片づける★（★自分の ゴミを 残さない★）。 */
  const YM_T = '1999-01';
  /* ★★口を 当てずっぽうで 選ばない★★（2026-09-19 指示役1 が 見つけた ★直し漏れ★）
     ★前★ … `select account_id from kyuyo.pay_payslips limit 1`
       ＝★order by が 無い＝どの 行が 来るかは 決まって いない★
     ★ここは 読むだけの 所では ない＝★2行 書く★所★
       ⇒ 口が 変われば ★別の 方の 口に 行を 置く★
     ★同じ 欠陥を `hitoTsukuru` でも 踏んだ★（14人 消した 後 別の 口に 人を 作った）
       ＝★作る道が 2本 在る時は 両方 直す★
         [[feedback_mihon_no_michi_ga_futatsu_aru_toki_katahou_dake_naosu_na]]
     ⇒ ★試験が 入る 口（SHIKEN_NO_KUCHI）を 名指しで★ 引く。 */
  const kuchi = await toi('select id as account_id from auth.users where email = '
    + qs(SHIKEN_NO_KUCHI));
  if (!kuchi.ok || !(kuchi.gyo || []).length) {
    console.log('  🟡 ★未測定★ ⑥〜⑨ 置く 口（' + SHIKEN_NO_KUCHI + '）が 取れない … ' + (kuchi.naze || '行が 無い'));
  } else {
    const uid = String((kuchi.gyo[0] || {}).account_id || '').replace(/[^A-Za-z0-9_-]/g, '');
    const NAKAMI = '{"name":"自己確認"}';
    const ire = (id) => toi(
      'insert into kyuyo.pay_payslips (id, account_id, ym, employee_id, data, updated_at) values ('
      + qs(id) + ',' + qs(uid) + ',' + qs(YM_T) + ',' + qs(id + '-e') + ',' + qs(NAKAMI) + ', now())');
    const kazu = async () => {
      const r = await toi('select count(*) as n from kyuyo.pay_payslips where ym = ' + qs(YM_T));
      return r.ok ? Number((r.gyo[0] || {}).n) : -1;
    };
    const MAE = 'selftest-mae-' + Date.now();
    const ATO = 'selftest-ato-' + Date.now();
    const i1 = await ire(MAE);
    if (!i1.ok) console.log('  🟡 ★未測定★ ⑥〜⑨ 置けない … ' + i1.naze);
    else {
      /* ★控えは「置いた 後・走る 前」に 取る★＝MAE は 控えに 入り、ATO は 入らない */
      const hikae = await meisaiIdHikaeru([YM_T]);
      await ire(ATO);
      const mae = await kazu();
      const k = await fuetaMeisaiKesu(hikae, [YM_T]);
      const ato = await kazu();
      const nokori = await toi('select id from kyuyo.pay_payslips where ym = ' + qs(YM_T));
      const nok = nokori.ok ? (nokori.gyo || []).map((x) => String(x.id)) : [];
      iu('⑥ ★前から 在った 行は 消えない★', k.ok && nok.indexOf(MAE) >= 0,
        '控え ' + ((hikae && hikae.ids) || []).length + '件／' + mae + '→' + ato + '行／残り ' + nok.length + '件（' + (k.naze || '') + '）');
      iu('⑦ ★この回で 出来た 行だけ 消える★', k.ok && nok.indexOf(ATO) < 0,
        '★増えた 行が 残っている★（' + mae + '→' + ato + '行）');
      /* ★★控えが 無い時は 1行も 消さない★★＝★分からない時に 消すのが 一番 危ない★ */
      const karappo = await fuetaMeisaiKesu({ ok: false, naze: 'わざと' }, [YM_T]);
      iu('⑧ ★控えが 無ければ 1行も 消さない★', karappo.ok === false, '消しに 行った');
      await toi('delete from kyuyo.pay_payslips where ym = ' + qs(YM_T));   /* ★自分の ゴミを 片づける★ */
      const shimai = await kazu();
      iu('⑨ ★自己確認の ゴミを 残さない★', shimai === 0, '★' + shimai + '行 残った★');

      /* ★★⑩〜⑬ 指紋が ★どの 行か★ を 言えるか（本物の 行で 4通り）★★
         ★㋓何も しない＝0本★ を 入れないと ★何でも 名指しする 道具★に なる。 */
      const T2 = 'kyuyo.pay_payslips';
      const ID = 'selftest-yubi-' + Date.now();
      const s0 = await kazoeru();
      await ire(ID);
      const s1 = await kazoeru();
      const d1 = gyoNoChigai(s0.gyo, s1.gyo, T2);
      iu('⑩ ★1行 足したら ★増えた 行★として その 鍵を 名指しする★',
        d1.length === 1 && d1[0].indexOf('増えた') >= 0 && d1[0].indexOf(ID) >= 0, d1.join(' ／ '));

      await toi('update kyuyo.pay_payslips set data = ' + qs('{"name":"自己確認2"}')
        + ' where id = ' + qs(ID));
      const s2 = await kazoeru();
      const d2 = gyoNoChigai(s1.gyo, s2.gyo, T2);
      iu('⑪ ★1行 書き換えたら ★書き換わった 行★と ★列の 名前★を 出す★',
        d2.length === 1 && d2[0].indexOf('書き換わった') >= 0 && d2[0].indexOf(ID) >= 0
        && d2[0].indexOf('data') >= 0, d2.join(' ／ '));

      const d3 = gyoNoChigai(s2.gyo, s2.gyo, T2);
      iu('⑫ ★何も しなければ 0本★（何でも 名指しする 道具に しない）',
        d3.length === 1 && d3[0].indexOf('行の 差は 0') >= 0, d3.join(' ／ '));

      await toi('delete from kyuyo.pay_payslips where id = ' + qs(ID));
      const s3 = await kazoeru();
      const d4 = gyoNoChigai(s2.gyo, s3.gyo, T2);
      iu('⑬ ★1行 消したら ★消えた 行★として その 鍵を 名指しする★',
        d4.length === 1 && d4[0].indexOf('消えた') >= 0 && d4[0].indexOf(ID) >= 0, d4.join(' ／ '));
      const shimai2 = await kazu();
      iu('⑭ ★⑩〜⑬の ゴミも 残さない★', shimai2 === 0, '★' + shimai2 + '行 残った★');
    }
  }

  console.log(ng ? '\n★自己確認 ' + ng + '件 おかしい★' : '\n自己確認 OK（★赤が 出る事まで 見た★）');
  process.exit(ng ? 1 : 0);
}
