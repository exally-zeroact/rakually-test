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
export async function kazoeru() {
  const r = await toi('select (select count(*) from kyuyo.pay_employees) as hito,'
    + ' (select count(*) from kyuyo.pay_payslips) as meisai');
  if (!r.ok) return { ok: false, naze: r.naze };
  const x = r.gyo[0] || {};
  return { ok: true, hito: Number(x.hito), meisai: Number(x.meisai) };
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
    if (ato.hito === mae.hito && ato.meisai === mae.meisai) {
      return { han: '緑', mae, ato, matta: i * 0.5,
        iu: '倉庫の 行数が 元に 戻った（人 ' + mae.hito + ' ／ 明細 ' + mae.meisai + '）'
          + (i ? '　★' + (i * 0.5) + '秒 待った★' : '') };
    }
    if (i < byo * 2) await new Promise((r) => setTimeout(r, 500));
    else {
      return { han: '赤', mae, ato,
        iu: '★倉庫に 置き土産が 残っている★　人 ' + mae.hito + '→' + ato.hito
          + '（' + (ato.hito - mae.hito >= 0 ? '+' : '') + (ato.hito - mae.hito) + '）'
          + ' ／ 明細 ' + mae.meisai + '→' + ato.meisai
          + '（' + (ato.meisai - mae.meisai >= 0 ? '+' : '') + (ato.meisai - mae.meisai) + '）'
          + '　★' + byo + '秒 待っても 消えず★' };
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
  const kuchi = await toi('select account_id from kyuyo.pay_payslips limit 1');
  if (!kuchi.ok || !(kuchi.gyo || []).length) {
    console.log('  🟡 ★未測定★ ⑥〜⑨ 置く 口（account_id）が 取れない … ' + (kuchi.naze || '行が 無い'));
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
    }
  }

  console.log(ng ? '\n★自己確認 ' + ng + '件 おかしい★' : '\n自己確認 OK（★赤が 出る事まで 見た★）');
  process.exit(ng ? 1 : 0);
}
