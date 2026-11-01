// statutory-reminder.mjs — 法定データの年度更新を「日付ベース」で堅牢に催促する(役所HTMLスクレイプに依存しない)。
//  各kindの適用/公表時期に、libが必要年度を未収録なら reminder を出す。lib自身のstale判定を使うので堅牢。
//  週次cron(GitHub Actions)から呼ぶ。reminder有り: exit 10(呼出側でIssue作成)。無し: exit 0。
//  ★役所HTMLのスクレイプは様式変更で壊れやすいので採用しない。これは日付+lib introspectionのみ=堅牢。
//  テスト/CI決定性のため STATUTORY_TODAY=YYYY-MM で「今日」を上書き可。
//
// ★2026-09-11 payslip-app から ここへ 移した（指示役1・司さんの指示）★
//   移した訳＝★この見張りを 持っていたのは 凍結して 客0人の payslip-app だけ★だった。
//   ★あの repo を 消すと 法定の年度更新に 誰も 気づけなくなる★。
//   ★移した 時は 中身の 判定を 1行も 変えなかった★（読む lib のパスと、直した後の 案内だけ 今の形に）。
//   ★2026-11-01 に 判じられない 時の 止め（kowareta）を 足した＝下の 節★。
//   ★この見張りと 週1の門(statutory-weekly.yml)は 別の物★：
//     ・ここ             … ★そもそも 数値が 古くなっていないか★（役所の改定時期を 日付で見る）
//     ・verify-statutory … ★中央と lib が ずれていないか★
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const SHH = require('../lib/shakaihoken-hyo.js');
const SAI = require('../lib/saitei-chingin.js');
const KOYO = require('../lib/koyo-hoken.js');
const D = require('../lib/shotokuzei-densan.js');

// 「今日」の年月(env上書き可)。
function today() {
  const o = process.env.STATUTORY_TODAY;
  if (o && /^\d{4}-\d{2}$/.test(o)) return { y: +o.slice(0, 4), m: +o.slice(5, 7) };
  const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1 };
}
const reikan = (yr) => '令和' + (yr - 2018) + '年';
const reminders = [];
const { y, m } = today();

// ★2026-11-01 判じられない時は 黙って 抜けず 赤（exit 1）★
//   前は `SAI.saiteiStale && …`／`k && k.stale` で、lib の 関数名・返りの 形が 変わると
//   その 項目が ★黙って 抜け★ code 0＝「更新は 要らない」と 言い、statutory-watch.yml は 開いている Issue を 閉じていた
//   （分からない 時に 通す 側）。今は 形が 違えば ::error:: を 出して exit 1
//   （statutory-watch.yml 段1 は code 0/10 以外を 赤にする＝見張り tests/statutory-watch-ochiru.test.mjs）。
//   見張り＝tests/statutory-reminder-katachi.test.mjs（作り物の lib で 壊し、exit 1 に なるか）。
function kowareta(what) {
  console.log('::error::statutory-reminder が 判じられない（' + what + '）＝lib の 形が 変わった。黙って「更新不要」と 言わずに 止める。');
  process.exit(1);
}
function bool(v, what) { if (typeof v !== 'boolean') kowareta(what + ' が 真偽で ない（' + typeof v + '）'); return v; }
// 収録年の 鍵が 1つ以上・全部 4桁の 年か（{}＝-Infinity／'abc'＝NaN で 比べが 黙って 偽に なるのを 止める）
function saishinNen(obj, what) {
  if (!obj || typeof obj !== 'object') kowareta(what + ' が 無い');
  const ks = Object.keys(obj);
  if (!ks.length || !ks.every((k) => /^\d{4}$/.test(k))) kowareta(what + ' の 鍵が 年で ない（' + JSON.stringify(ks.slice(0, 5)) + '）');
  return Math.max.apply(null, ks.map(Number));
}

// 最低賃金: 会計年度10月適用・答申8〜9月。9月以降は当年度が必要。lib(SAI.saiteiStale)で未収録判定。
{ const need = (m >= 9 ? y : y - 1);
  if (typeof SAI.saiteiStale !== 'function') kowareta('saitei-chingin.js の saiteiStale が 無い');
  if (bool(SAI.saiteiStale(need + '-10'), 'saiteiStale の 返り'))
    reminders.push('最低賃金 ' + reikan(need) + '度(' + need + ')が未収録。厚労省の答申額を確認 → kyuyo/lib/saitei-chingin.js 47県+NENDO_YEAR更新 → 管理画面の法定データタブで[反映]。'); }
// 健保・介護(協会けんぽ): 社保年度3月適用・公表2月。2月以降は当年が必要。getKenko(..).stale／getKaigo(..).stale で判定。
//  ★2026-11-01 介護を 別に 見る★ 前は「健保/介護」と 書いて getKenko だけ 見ていた。getKenko の stale は
//  shakaihoken-hyo.js の `y > 2026` 決め打ちで、介護の 表 KAIGO_NENDO とは つながっていない＝
//  健保だけ 新しい 年度へ 上げて 介護を 入れ忘れると、getKaigo は stale:true（前の 年度の 率で 計算）なのに
//  ここは 黙って「更新不要」と 言い、statutory-watch.yml は Issue を 閉じた（2027-03 の 形で 測った）。
{ const need = (m >= 2 ? y : y - 1);
  if (typeof SHH.getKenko !== 'function') kowareta('shakaihoken-hyo.js の getKenko が 無い');
  const k = SHH.getKenko('tokyo', need + '-06');
  if (!k || typeof k !== 'object') kowareta('getKenko の 返りが 物で ない');
  if (bool(k.stale, 'getKenko の stale'))
    reminders.push('健康保険料率 ' + reikan(need) + '(' + need + ')が未収録。協会けんぽ料率表を確認 → kyuyo/lib/shakaihoken-hyo.js（47県の健保の表 と getKenko の年度の決め打ち）更新 → 管理画面の[反映]。');
  if (typeof SHH.getKaigo !== 'function') kowareta('shakaihoken-hyo.js の getKaigo が 無い');
  const g = SHH.getKaigo(need + '-06');
  if (!g || typeof g !== 'object') kowareta('getKaigo の 返りが 物で ない');
  if (bool(g.stale, 'getKaigo の stale'))
    reminders.push('介護保険料率 ' + reikan(need) + '(' + need + ')が未収録。協会けんぽ料率表を確認 → kyuyo/lib/shakaihoken-hyo.js（KAIGO_NENDO）更新 → 管理画面の[反映]。'); }
// 雇用保険: 労働保険年度4月適用・公表3月。lib(KOYO.RATES)の収録最新年と比較。
{ const need = (m >= 3 ? y : y - 1); const latest = saishinNen(KOYO.RATES, 'koyo-hoken.js の RATES');
  if (need > latest)
    reminders.push('雇用保険料率 ' + reikan(need) + '度(' + need + ')が未収録。厚労省の料率を確認 → kyuyo/lib/koyo-hoken.js更新 → 管理画面の[反映]。'); }
// 所得税(源泉/年末調整): 税制改正大綱12月・翌暦年分。densan PARAMS の収録最新年と比較。
{ const need = (m >= 12 ? y + 1 : y); const latest = saishinNen(D.PARAMS, 'shotokuzei-densan.js の PARAMS');
  if (need > latest)
    reminders.push('所得税(源泉/年末調整) ' + need + '年分(' + reikan(need) + ')が未収録。税制改正大綱/国税庁あらましを確認 → densan/nenmatsu更新 → 管理画面の[反映]。'); }

if (reminders.length) {
  console.log('STATUS=REMINDER (更新が必要な法定データがあります・対象月 ' + y + '-' + ('0' + m).slice(-2) + ')');
  reminders.forEach((r) => console.log('TODO: ' + r));
  console.log('\n手順: 一次情報で照合(捏造禁止) → lib修正+実数値テスト → 管理画面(kyuyo/admin.html)の「法定データ」タブで[反映]（★書けるのは管理者だけ★） → CIのドリフトガードが緑を確認。');
  process.exit(10);
}
console.log('STATUS=OK (' + y + '-' + ('0' + m).slice(-2) + '時点で更新が必要な法定データはありません)');
process.exit(0);
