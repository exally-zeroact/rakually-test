// verify-statutory.mjs — libのハードコード値が中央statutoryテーブルと一致するかを検証(ドリフト防止ガード)。
//   目的: 「lib値≠中央」を CI/手動で弾き、二度と最賃/健保のようなドリフトを起こさない=単一ソースの実効化。
//   ・匿名(anon)公開鍵でREST読取のみ(DBパスワード不要・CI安全)。オフライン/取得不可は「検証スキップ(exit 0)」で赤くしない。
//   ・不一致があれば exit 3 + 差分。CIのstatutory-drift gateに使う。
//   使い方: node scripts/verify-statutory.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const SHH = require('../lib/shakaihoken-hyo.js');
const SAI = require('../lib/saitei-chingin.js');
const SR = require('../lib/statutory-rows.js');
const KOYO = require('../lib/koyo-hoken.js');
const D = require('../lib/shotokuzei-densan.js');
const H = require('../lib/shotokuzei-hei.js');
const NI = require('../lib/shotokuzei-nichi.js');
const SZ = require('../lib/shoyo-zei.js');
const N = require('../lib/nenmatsu.js');
const WM = require('../lib/warimashi.js');
/* ★2026-09-11 指示役1＝この門は「全kind」と言いながら ★9種しか 見ていなかった★。
 *   中央は 11種（rousai_ritsu と shouhizei が 抜けていた）。
 *   原因＝★あるべき行を作る道具 buildStatutoryRows が 在るのに 使わず 手書きで 並べていた★。
 *   ⇒ 下に ★道具で 全kind を 突き合わせる網★ を 足した。手書きの分も 残す（細かい所を 見ているので）。 */
const SHZ = require('../lib/shouhizei-ritsu.js');
const RR = require('../lib/rousai-ritsu.js');

// ★ここだけは「アプリの倉庫(js/supa-config.js)」ではなく【中央statutory】を見る（意図的・2026-08-01）★
//   理由: statutory は法定データ(健保料率・最賃・所得税表…)＝全国で1つの表であって、
//         会社ごとのデータ(テナントデータ)ではない。環境ごとに別々の正を持つ物ではないので、
//         本番/テストで分けない。読取専用(anon の GET だけ)＝ここから書く経路は無い。
//   実測(2026-08-01): DB-test(khawdrnvssdenumbiwfg) の statutory は【空(0行)】。
//         ここを DB-test に向けると全kindが「中央に無し」になり、
//         ドリフトが無いのにCIが赤くなる＝ガードとして機能しない。
//   戻す条件: DB-test 側の statutory に本番と同じ行を入れた時。その時は下を
//         js/supa-config.js 由来に切り替える(seed-statutory.mjs と同じやり方)。
//   ※このファイルが本番refを持つことは tests/no-absolute-paths.test.mjs の例外表に
//     理由つきで明示してある。黙って残っている本番URLではない。
const STATUTORY_CENTRAL_URL = 'https://tnfwipbgfgjaymlszeid.supabase.co';
const SUPA_URL = STATUTORY_CENTRAL_URL;
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRuZndpcGJnZmdqYXltbHN6ZWlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1Nzk4MzQsImV4cCI6MjA5NzE1NTgzNH0.zhKPLSlW4zxsdjsXNvqDHvtP3wBqp-EKaxbjqLGW_ek';

const STRICT = process.argv.includes('--strict');   /* ★週1の定時で 使う＝取れない回を 赤にする★ */
const diffs = [];
// キー順は不問(Postgres jsonbはキーを並べ替える)・配列順は有意(ブラケット順)。オブジェクトのキーをソートして正規化比較。
function canon(x) {
  if (Array.isArray(x)) return '[' + x.map(canon).join(',') + ']';
  if (x && typeof x === 'object') return '{' + Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + canon(x[k])).join(',') + '}';
  return JSON.stringify(x);
}
function eq(label, a, b) { if (canon(a) !== canon(b)) diffs.push(label + ': lib=' + canon(a) + ' 中央=' + canon(b)); }

function row(rows, kind, year) { const r = rows.find(x => x.kind === kind && x.year === year); return r ? r.data : null; }

/* ★この門は 2段★（2026-09-11）
 *   ★本体＝下の「手で並べない網」★… buildStatutoryRows の あるべき行を 全kind 突き合わせる。
 *     ★種類が 増えても 自動で 見る／中央にしか無い行も 出す（逆も見る）★
 *   ★おまけ＝この下の 手書きの列★… 「雇用2026」「densan.zeiKo」の様に ★人が読める名前で 鍵ごと★ 見る。
 *     ★どの lib の どの定数が ずれたか★ が 早く分かる ので 残してある。
 *   ★手書きの列に 足し忘れても 網が 守ります★。
 *   ⇒ ★種類を 増やした時に 手書きの列だけ 直して 満足しない事★（2026-09-11 に それで 労災を 見落とした） */
function verify(rows) {
  // ── 社保(健保47県total/介護total) 令和7/令和8 ──
  for (const year of [2025, 2026]) {
    const d = row(rows, 'shakaihoken', year); if (!d) { diffs.push('shakaihoken/' + year + ' 中央に無し'); continue; }
    const libKenko = year >= 2026 ? SHH.KENKO_2026 : Object.fromEntries(Object.keys(SHH.KENKO_RITSU).map(k => [k, SHH.KENKO_RITSU[k].total]));
    eq('健保' + year, libKenko, d.kenko_total);
    eq('介護' + year, SHH.getKaigo(year + '-06').total, d.kaigo_total);
  }
  // ── 最賃47県 ──
  const sai = row(rows, 'saitei_chingin', 2025);
  // ★中央へ送る形(名前と額)で比べる。lib が持つ発効日/前年額はまだ中央へ配信していない
  //   （中央の表を変えるのは本番データの操作＝指示をもらってから seed-statutory で入れる）。
  if (sai) { eq('最賃todofuken', SR.saiteiForCentral(SAI), sai.todofuken); eq('最賃全国平均', SAI.ZENKOKU_HEIKIN, sai.zenkoku_heikin); } else diffs.push('saitei_chingin 中央に無し');
  // ── 雇用 令和7/8 ──
  for (const year of [2025, 2026]) { const d = row(rows, 'koyo', year); if (d) eq('雇用' + year, KOYO.RATES[year], d); else diffs.push('koyo/' + year + ' 中央に無し'); }
  // ── 所得税 月額(densan) 令和7/8 ──
  { const d = row(rows, 'shotokuzei_densan', 2025); if (d) { eq('densan2025.kyuyo', D.PARAMS[2025].kyuyo, d.kyuyo); eq('densan2025.kiso', D.PARAMS[2025].kiso, d.kiso); } else diffs.push('shotokuzei_densan/2025 無し'); }
  { const d = row(rows, 'shotokuzei_densan', 2026); if (d) { eq('densan2026.kyuyo', D.PARAMS[2026].kyuyo, d.kyuyo); eq('densan2026.kiso', D.PARAMS[2026].kiso, d.kiso); eq('densan.zeiKo', D.ZEI_KO, d.zeiKo); eq('densan.zeiOtsu', D.ZEI_OTSU, d.zeiOtsu); } else diffs.push('shotokuzei_densan/2026 無し'); }
  // ── 所得税 日額(hei) ──
  { const d = row(rows, 'shotokuzei_hei', 2026); const t = (H.HEI_BY_YEAR && H.HEI_BY_YEAR[2026]) || H.HEI_R8; if (d) { eq('hei.start', t.start, d.start); eq('hei.step', t.step, d.step); eq('hei.arr', t.arr, d.arr); } else diffs.push('shotokuzei_hei 無し'); }
  // ── 所得税 日額 甲乙(nichi) ──
  { const d = row(rows, 'shotokuzei_nichi', 2026); const t = (NI.tableFor && NI.tableFor(2026)) || NI.TABLE_R8; if (d) { eq('nichi.start', t.start, d.start); eq('nichi.step', t.step, d.step); eq('nichi.ko', t.ko, d.ko); eq('nichi.otsu', t.otsu, d.otsu); eq('nichi.koOver', t.koOver, d.koOver); } else diffs.push('shotokuzei_nichi 無し'); }
  // ── 賞与(shoyo) ──
  { const d = row(rows, 'shoyo', 2026); if (d) { eq('shoyo.rates', SZ.RATES, d.rates); eq('shoyo.kou', SZ.KOU_BY_YEAR[2026], d.kou); eq('shoyo.otsu', SZ.OTSU_BY_YEAR[2026], d.otsu); } else diffs.push('shoyo 無し'); }
  // ── 年末調整(nenmatsu) ──
  { const d = row(rows, 'nenmatsu', 2026); if (d) { eq('nen.kyuyoKojo', N.P.kyuyoKojo, d.kyuyoKojo); eq('nen.kisoKojo', N.P.kisoKojo, d.kisoKojo); eq('nen.sanshutu', N.P.sanshutu, d.sanshutu); eq('nen.fuyoKojo', N.P.fuyoKojo, d.fuyoKojo); } else diffs.push('nenmatsu 無し'); }
  // ── 割増(warimashi) 基本率 ──
  { const d = row(rows, 'warimashi', 2023); if (d) { ['ot', 'holiday', 'night', 'over60Add'].forEach(k => eq('warimashi.' + k, WM.RATE[k], d[k])); } else diffs.push('warimashi 無し'); }

  /* ★★手で並べない網★★（2026-09-11）
     buildStatutoryRows が作る「あるべき行」を 1行ずつ 中央と 突き合わせる。
     ★種類が増えても 自動で見る★＝手書きの列に 足し忘れても 落ちない。
     ★中央にしか無い行★ も 出す（逆も見る）。
     ★差は 丸ごと出さない★＝労災の53業種で 画面が埋まり 読めなくなるので 鍵の名前と 先頭120字だけ。 */
  const desired = SR.buildStatutoryRows({ SHH, SAI, KOYO, D, H, NI, SZ, N, WM, SHZ, RR });
  const seen = {};
  const cut = (v) => { const t = canon(v); return t.length > 120 ? t.slice(0, 120) + '…(' + t.length + '字)' : t; };
  desired.forEach(function (w) {
    seen[w.kind + '/' + w.year] = 1;
    const d = row(rows, w.kind, w.year);
    if (!d) { diffs.push('★中央に無し★ ' + w.kind + '/' + w.year); return; }
    if (canon(w.data) === canon(d)) return;
    const bad = Object.keys(Object.assign({}, w.data, d)).filter((k) => canon(w.data[k]) !== canon(d[k]));
    diffs.push('★全kind網★ ' + w.kind + '/' + w.year + ' 違う鍵=[' + bad.join(', ') + ']'
      + bad.map((k) => '\n' + '      ' + k + ': lib=' + cut(w.data[k]) + '\n' + '      ' + k + ': 中央=' + cut(d[k])).join(''));
  });
  rows.forEach(function (r) {
    if (!seen[r.kind + '/' + r.year]) diffs.push('★中央にしか無い★ ' + r.kind + '/' + r.year + '（libが作っていない）');
  });
  console.log('  （網で見た行: あるべき ' + desired.length + '行 / 中央 ' + rows.length + '行）');
}

const run = async () => {
  let rows;
  try {
    const res = await fetch(SUPA_URL + '/rest/v1/statutory?select=kind,year,data', { headers: { apikey: ANON, Authorization: 'Bearer ' + ANON } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    rows = await res.json();
  } catch (e) {
    /* ★--strict を付けた時は 赤にする★（2026-09-11 指示役1・経営者1の条件1）
       ふだん（push の CI・手元）は ★オフラインで 赤にしない★＝
         外の都合で push が止まると、人は 赤を 無視する様に なる。
       だが ★週1の 定時★ は 「中央を 見に行く」事 そのものが 仕事なので、
       ★取れなかった回を 緑で 通すと 門が 無い週が 生まれる★。
       ⇒ 定時だけ --strict を 付けて ★取れない＝赤★ に する。 */
    if (STRICT) {
      console.log('★赤★ 中央statutoryを 取得できなかった（--strict）。理由: ' + e.message);
      console.log('  ⇒ 週1の 見張りは「中央を 見に行く」のが 仕事＝取れない回を 緑にしない。');
      process.exitCode = 4; return;
    }
    console.log('SKIP: 中央statutoryを取得できず(オフライン等)=検証スキップ。理由: ' + e.message);
    process.exit(0); // オフラインは赤くしない
  }
  verify(rows);
  if (diffs.length) {
    console.log('DRIFT DETECTED — lib と中央statutoryが不一致(' + diffs.length + '件):');
    diffs.slice(0, 40).forEach(d => console.log('  ✗ ' + d));
    console.log('→ どちらかが古い。一次情報で正を確認し、lib修正 + scripts/seed-statutory.mjs で中央を揃える。');
    process.exitCode = 3; return;
  }
  console.log('OK: lib==中央statutory 一致(ドリフトなし)。★手書きの列 ＋ 全kind網 の 両方で 見た★');
};
run().catch(e => { console.log('ERROR ' + e.message); process.exitCode = 2; });
