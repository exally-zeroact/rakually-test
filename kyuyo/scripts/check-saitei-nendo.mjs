/* check-saitei-nendo.mjs — ★最低賃金の「次の年度」が公式に出たかを、機械で見張る★
 *
 * なぜ必要か（2026-08-10・C-3 の宿題）:
 *   最賃は毎年10月に入れ替わる。lib に入っているのは【令和7年度】(2025-10〜)。
 *   ・2026-09 分の給与までは 令和7年度で正しい（engine実測・法定の警告ゼロ）
 *   ・★2026-10 分から 令和8年度が要る★。無いまま回すと最賃割れの判定が古い額で動く
 *   ・前科がある：2026-07-10 に ★47県中38県が誤値★ で、割れ判定が誤った額で動いていた
 *   だから「人が思い出す」ではなく、★公式ページを毎週叩いて、年度が進んだ瞬間に赤にする★。
 *
 * 何を見るか（実測 2026-08-10）:
 *   厚労省「地域別最低賃金の全国一覧」
 *     https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/minimumichiran/
 *   このページの見出しが今は「令和７年度地域別最低賃金の全国一覧」。★全角の数字★（令和７）。
 *   ここに載っている年度＝★47県の実額が公式に出た年度★。ここが 令和8年度 に変わったら
 *   愛媛を含む実額が出たということ＝入れ替えの合図。
 *   ※額そのものは PDF の中にあり、テキスト化は pdftotext -layout で人がやる
 *     （tests/fixtures/saitei-official-r7.json と同じ作り方。機械に PDF を読ませて
 *      黙って数字を書き換えさせない＝誤値の入口を増やさない）。
 *
 * どこで回すか:
 *   ★通常のCIには入れない★（外のサイトを叩くので、向こうの都合で赤が出ると赤を無視する癖がつく）。
 *   .github/workflows/source-urls.yml（週1・月曜9時JST＋手動）に相乗り。落ちても push は止まらない。
 *   判定そのもの(--self-test)は ci.yml で毎回回す（ネットに触らない）。
 *
 * 使い方: node kyuyo/scripts/check-saitei-nendo.mjs           … 一覧を出す
 *         node kyuyo/scripts/check-saitei-nendo.mjs --json
 *         node kyuyo/scripts/check-saitei-nendo.mjs --self-test … 判定を作り物で確かめる
 * 終了コード: 0=今のままでよい／取れなかった(🟡未測定・赤くしない)   3=★入れ替えが要る★
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(import.meta.url);

const PAGE = 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/minimumichiran/';
const WATCH_PREF = 'ehime';        // 司さんの県。額が出たら真っ先に見る所
const REIWA_BASE = 2018;           // 令和1年 = 2019年 → 令和N年度 = (2018+N) 年度

/* ══ ★年度の読み取り（純関数・ネットに触らない）═════════════════════════
   ページの文から「令和N年度」を全部拾って、★一番新しいN★を西暦の年度に直す。
   ★全角の数字（令和７年度）で書かれている★＝半角だけ見ると1件も拾えない（実測して踏んだ）。 */
export function readNendoYears(text) {
  const s = String(text || '').replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  const years = [...s.matchAll(/令和\s*(\d{1,2})\s*年度/g)].map(m => REIWA_BASE + Number(m[1]));
  return [...new Set(years)].sort((a, b) => a - b);
}

/* ══ ★判定（純関数）════════════════════════════════════════════════════
   ページの最新年度と lib の年度を突き合わせる。
   ★取れなかった(null)を「今のままでよい」と混ぜない★＝🟡未測定として別に返す。 */
export function decide(pageYear, libYear) {
  if (pageYear == null) return { measured: false, pageYear: null, libYear, action: 'unmeasured' };
  if (pageYear > libYear) return { measured: true, pageYear, libYear, action: 'update' };   // ★入れ替えの合図★
  if (pageYear < libYear) return { measured: true, pageYear, libYear, action: 'ahead' };    // libの方が先＝人が見る
  return { measured: true, pageYear, libYear, action: 'ok' };
}

/* ══ self-test ═══════════════════════════════════════════════════════ */
if (process.argv.includes('--self-test')) {
  let pass = 0, fail = 0;
  const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + e.message); } };
  const eq = (a, b, m) => { if (a !== b) throw new Error((m ? m + ': ' : '') + `expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); };
  const deq = (a, b, m) => eq(JSON.stringify(a), JSON.stringify(b), m);
  console.log('\n[check-saitei-nendo --self-test] 年度の読み取りと判定（作り物で）');

  T('★全角の数字で書かれた年度を読める（実物がこの形・半角だけ見ると0件になる）', () => {
    deq(readNendoYears('令和７年度地域別最低賃金の全国一覧'), [2025]);
  });
  T('半角でも読める（ページの書き方が変わっても拾う）', () => {
    deq(readNendoYears('令和8年度地域別最低賃金'), [2026]);
  });
  T('★古い年度が混ざっていても【一番新しい方】を後ろに置いて返す', () => {
    deq(readNendoYears('平成14年度から令和７年度までの改定状況 令和８年度地域別最低賃金の全国一覧'), [2025, 2026]);
  });
  T('★年度が1つも書いていない＝読めなかった（空を「今のまま」にしない）', () => {
    deq(readNendoYears('ただいまメンテナンス中です'), []);
  });
  T('令和1年度=2019・令和10年度=2028（2桁も読む）', () => {
    deq(readNendoYears('令和1年度 令和10年度'), [2019, 2028]);
  });

  T('★ページが令和8年度(2026)・libが令和7年度(2025) → 入れ替えが要る', () => {
    eq(decide(2026, 2025).action, 'update');
  });
  T('同じ年度なら今のままでよい', () => {
    eq(decide(2025, 2025).action, 'ok');
  });
  T('★取れなかった(null)は「今のままでよい」と混ぜない＝🟡未測定', () => {
    const d = decide(null, 2025);
    eq(d.measured, false); eq(d.action, 'unmeasured');
  });
  T('★libの方が新しい＝人が先に入れた／ページが古い版に戻った → 人が見る(黙って通さない)', () => {
    eq(decide(2025, 2026).action, 'ahead');
  });

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

/* ══ 本番（厚労省のページを実際に叩く）═══════════════════════════════════ */
const JSON_OUT = process.argv.includes('--json');
const SAI = require_(path.join(ROOT, 'lib/saitei-chingin.js'));

// 一覧PDFへの link を拾う（人が pdftotext にかける物。額を機械で書き換えたりはしない）
function pdfLinks(html) {
  const out = [];
  for (const m of String(html).matchAll(/<a[^>]+href="([^"]+\.pdf)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const label = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!/最低賃金/.test(label)) continue;
    out.push({ url: new URL(m[1], PAGE).href, label });
  }
  return out;
}

const report = {
  checkedAt: new Date().toISOString().slice(0, 10),
  page: PAGE,
  libNendo: SAI.NENDO, libNendoYear: SAI.NENDO_YEAR,
  watch: { key: WATCH_PREF, ...(SAI.todofuken[WATCH_PREF] || {}) },
  pageYears: [], pdfs: [], error: null,
};

try {
  const r = await fetch(PAGE, { headers: { 'User-Agent': 'Kyually-saitei-check/1.0' }, redirect: 'follow' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const html = await r.text();
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
  report.pageYears = readNendoYears(text);
  report.pdfs = pdfLinks(html);
} catch (e) {
  report.error = String((e && e.message) || e);
}

const pageYear = report.pageYears.length ? report.pageYears[report.pageYears.length - 1] : null;
const d = decide(pageYear, SAI.NENDO_YEAR);
report.decision = d;

if (JSON_OUT) { console.log(JSON.stringify(report, null, 2)); }
else {
  const nendoJP = (y) => '令和' + (y - REIWA_BASE) + '年度（' + y + '年度）';
  console.log('\n[check-saitei-nendo] 最低賃金の年度が進んだか  ' + report.checkedAt);
  console.log('  lib(kyuyo/lib/saitei-chingin.js) の年度: ' + report.libNendo);
  console.log('  見張る県(' + WATCH_PREF + '): ' + (report.watch.name || '?') + ' ' + (report.watch.chingin || '?') + '円（発効 ' + (report.watch.hatsuko || '?') + '）');
  console.log('  公式ページ: ' + PAGE);
  if (report.error) {
    console.log('  × 取れませんでした: ' + report.error);
  } else {
    console.log('  ページに載っている年度: ' + (report.pageYears.length ? report.pageYears.map(nendoJP).join(' / ') : '（1つも読めませんでした）'));
    for (const p of report.pdfs) console.log('    PDF: ' + p.label + '\n         ' + p.url);
  }
  console.log('');
  if (d.action === 'unmeasured') {
    console.log('  🟡 未測定（ページが取れなかった／年度が読めなかった）。');
    console.log('     ★「今のままでよい」ではありません★。次の週にまた見ます。');
    console.log('     続けて2回 未測定なら、ページの場所か書き方が変わった疑い＝人が開いて確かめること。');
  } else if (d.action === 'ok') {
    console.log('  → 公式もまだ ' + nendoJP(d.pageYear) + '。★今のままでよい★');
    console.log('     ※ 2026-10 分の給与から 令和8年度が要ります（それまでに出るはず）。');
  } else if (d.action === 'ahead') {
    console.log('  ⚠ lib(' + nendoJP(d.libYear) + ') の方がページ(' + nendoJP(d.pageYear) + ')より新しい。');
    console.log('     人が先に入れたか、ページが古い版に戻ったか。★人が中身を見ること★');
  } else {
    console.log('  ★★ ' + nendoJP(d.pageYear) + ' の実額が公式に出ました＝入れ替えの合図 ★★');
    console.log('     人がやること（順番）:');
    console.log('       1. 上の PDF を pdftotext -layout でテキスト化し、47県の 額／前年額／発効日 を抜く');
    console.log('          （★手で打ち直さない★。打ち直しは誤値の入口。前科: 2026-07-10 に47県中38県が誤値）');
    console.log('       2. kyuyo/tests/fixtures/saitei-official-r8.json を作る（r7と同じ形・出典URLと取得日を書く）');
    console.log('       3. kyuyo/lib/saitei-chingin.js の todofuken / NENDO / NENDO_YEAR / HATSUKO_KIKAN /');
    console.log('          ZENKOKU_HEIKIN を入れ替える（prev には 令和7年度の額を入れる）');
    console.log('       4. kyuyo/tests/saitei-official.test.mjs を r8 に向け、47県が1円も違わないことを機械で示す');
    console.log('       5. ★' + (report.watch.name || '愛媛県') + 'を実物の画面で1人 計算して、割れ判定が新しい額で動くことを見る★');
  }
}

if (d.action === 'update') { console.log(''); process.exit(3); }
process.exit(0);
