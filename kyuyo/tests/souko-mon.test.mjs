/* souko-mon.test.mjs — ★倉庫を 触る 測りは 必ず 同じ 門を 通る★
 * ============================================================================
 * ★なぜ（2026-09-15・★同じ型を 1日に 3回 踏んだ★）★
 *   ★09-14 に 決めた 3つ★（指示役1）
 *     ①鍵が 無い … ★緑(0)で 通す／ただし 数は 出す／0件＝合格 と 書かない★
 *     ②鍵は 在るのに 読めない … ★赤★
 *     ③★仕事の 段の 名に「CIでは 倉庫を 数えていない」と 書く★
 *   この 決めを ★人が 覚えて 当てる★形に して いた。結果:
 *     ①`_souko-kazoeru`（決めた 当人・入っていた）
 *     ②`maboroshi-ui`  … ★自分で 鍵の 紙を 開いて いた★＝決めが 当たらない ⇒ ★CI が 毎回 赤★
 *     ③`shutoku-ui`    … ★新しく 足した 測りに 当てなかった★ ⇒ ★CI が 毎回 赤★
 *   ⇒ ★決めは 知っていた／新しく 足す 時に 当てなかった★＝★★人の 記憶で 保つ 形★★
 *   ⇒ ★★道を 変える＝門を 1本に し、機械で 縛る★★（★でないと 4回目が 来る★）
 *
 * ★ここで見る事★
 *   ① ★鍵の 紙を 直に 読む 測りは `_souko-kazoeru.mjs` ★1本だけ★★
 *   ② ★倉庫へ 問う 入口（api.supabase.com）も その 1本だけ★
 *   ③ その 1本が ★鍵が 無い／読めない を 分ける 門★を 持っている（kankyoKa）
 *   ④ ★呼ぶ側が 字を 書き写していない★（出す 字も 1か所＝kankyoIu）
 *
 * ★字だけで 測ります★（倉庫は 要らない＝CIで 毎回 走る）。
 * 使い方: node kyuyo/tests/souko-mon.test.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELF = process.argv.includes('--self-test');
const MON = 'kyuyo/tests/_souko-kazoeru.mjs';   /* ★唯一の 門★ */
/* ★★この紙 自身は 数えない★★＝★探す 字を 自分が 持っている★（門を 通らない 例を 自己確認で 作る 為）
   ＝★覚書に 書いた 字を 拾う★と 同じ 型（今日 2回 踏んだ）。★外す 訳を ここに 書く★。 */
const JIBUN = 'kyuyo/tests/souko-mon.test.mjs';
/* ★★外して いる 本数を 決め打つ★★（2026-09-15 指示役1）
   ★免除は 黙って 増える★＝★数を 書いて 突き合わせれば ★増やすには この紙を 直すしか ない★★
   ＝★必ず 差分に 出る★（＝人が 気づく）。★今 外して いるのは この紙 自身 1本だけ★。 */
const MENJO = ['kyuyo/tests/souko-mon.test.mjs'];
const MENJO_HONSU = 1;

let pass = 0, fail = 0;
const T = (n, f) => { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m); };

/* ★注記を 外してから 数える★（覚書に 書いた 字を 拾わない＝今日 2回 踏んだ） */
export function strip(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/* ★見る 範囲を 先に 数えて 書く★（[[feedback_mihari_no_miru_hanni_wo_saki_ni_kazoero]]） */
export function atsumeru(dir) {
  const out = [];
  for (const f of fs.readdirSync(path.join(ROOT, dir))) {
    if (!/\.mjs$/.test(f)) continue;
    out.push(dir + '/' + f);
  }
  return out.sort();
}

export function yaburiTe(files, yomu) {
  /* ★鍵の 紙／倉庫の 入口を 直に 触っている 測り★（門 自身は 除く） */
  const kagi = [], kuchi = [];
  for (const f of files) {
    if (f === MON || MENJO.indexOf(f) >= 0) continue;
    const src = strip(yomu(f));
    if (/nomiya-db-url-prod/.test(src)) kagi.push(f);
    if (/api\.supabase\.com/.test(src)) kuchi.push(f);
  }
  return { kagi, kuchi };
}

const yomu = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const FILES = atsumeru('kyuyo/tests');

console.log('\n[souko-mon] 倉庫を 触る 測りは 必ず 同じ 門を 通る（2026-09-15＝同じ型を 3回 踏んだ）');
console.log('  見る 範囲 … kyuyo/tests の .mjs ' + FILES.length + '本（門 ' + MON + ' を 除く ' + (FILES.length - 1) + '本）');

const y = yaburiTe(FILES, yomu);

T('★① 鍵の 紙を 直に 読む 測りは 門 1本だけ', () => {
  ok(y.kagi.length === 0, '★門を 通らずに 鍵を 読んでいる★ … ' + y.kagi.join(' / '));
});

T('★② 倉庫へ 問う 入口も 門 1本だけ', () => {
  ok(y.kuchi.length === 0, '★門を 通らずに 倉庫へ 問うている★ … ' + y.kuchi.join(' / '));
});

T('★③ 門が「鍵が 無い／読めない」を 分けている', () => {
  const src = yomu(MON);
  ok(/export function kankyoKa/.test(src), '★kankyoKa（分ける 門）が 無い★');
  ok(/鍵の 紙が 読めない/.test(src), '★分ける 印が 無い★');
});

T('★④ 出す 字も 門 1か所（呼ぶ側で 書き写していない）', () => {
  const src = yomu(MON);
  ok(/export function kankyoIu/.test(src), '★kankyoIu（出す 字）が 無い★');
  /* ★呼ぶ側が 同じ 字を 打ち直していないか★＝写すと ずれる（今日 何度も 出た 形） */
  const utsushi = FILES.filter((f) => f !== MON && MENJO.indexOf(f) < 0)
    .filter((f) => /この環境では 倉庫を 数えていません/.test(strip(yomu(f))));
  ok(utsushi.length === 0, '★呼ぶ側が 字を 書き写している★ … ' + utsushi.join(' / '));
});

T('★⑤ 外して いる 本数が 決め打ちと 合う（免除は 黙って 増えない）', () => {
  ok(MENJO.length === MENJO_HONSU,
    '★外して いる のは ' + MENJO.length + '本／決め打ちは ' + MENJO_HONSU + '本★＝'
    + '★増やしたいなら この紙の MENJO_HONSU も 直す★（＝差分に 出る）… ' + MENJO.join(' / '));
  for (const f of MENJO) ok(FILES.indexOf(f) >= 0, '★外している 紙が 実在しない★ … ' + f);
  console.log('     外して いる … ' + MENJO.length + '本（' + MENJO.join(' / ') + '）');
});

/* ★★⑥ 門が 指紋から 除けて いる 物（免除）も 黙って 増えない★★
   ★訳★＝★免除は 1つ 足すだけで 静かに 広がる★（2026-09-18 に 媒体通番 1件を 足した）。
   ★字で 読む★＝門を 動かさずに 数えられる ⇒ ★倉庫の 鍵が 無い CI でも 赤に なる★。 */
T('★⑥ 指紋の 免除も 決め打ちと 合う（黙って 広がらない）', () => {
  const src = strip(yomu(MON));
  const m = src.match(/YUBI_MENJO_HONSU\s*=\s*(\d+)/);
  ok(m, '★免除の 決め打ち（YUBI_MENJO_HONSU）が 無い★');
  const kimeuchi = Number(m[1]);
  /* ★実際の 本数＝名簿の 中の `tana:` の 数★（字で 数える） */
  const meibo = src.slice(src.indexOf('YUBI_MENJO = ['), src.indexOf('YUBI_MENJO_HONSU'));
  const honsu = (meibo.match(/tana:/g) || []).length;
  ok(honsu === kimeuchi,
    '★免除の 本数が 決め打ちと 合わない★＝決め打ち ' + kimeuchi + ' ／ 実際 ' + honsu
    + '（★増やしたいなら 訳を 書いて 決め打ちも 直す★）');
  /* ★免除には 必ず 訳が 要る★＝黙って 除けない */
  const wake = (meibo.match(/naze:/g) || []).length;
  ok(wake === honsu, '★訳(naze)の 無い 免除が 在る★＝' + wake + '/' + honsu);
  /* ★毎回 出しに 出す★＝隠れない */
  ok(/export function yubiMenjoIu/.test(src), '★免除を 字で 出す 所が 無い★');
  console.log('     指紋の 免除 … ' + honsu + '件（決め打ち ' + kimeuchi + '・訳 ' + wake + '件）');
});

/* ★★自己確認＝わざと 壊して 赤が 出るか★★ */
if (SELF) {
  console.log('\n[souko-mon] ★自己確認★（わざと 壊して 赤が 出るか）');
  let ng = 0;
  const q = String.fromCharCode(39);
  const iu = (n, good, m) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + n + (good ? '' : '  ★' + (m || '') + '★')); };

  const nise = (naka) => (f) => (f === 'kyuyo/tests/nise.mjs' ? naka : yomu(f));
  const F2 = FILES.concat(['kyuyo/tests/nise.mjs']);

  const a = yaburiTe(F2, nise("const T='" + "nomiya-db-url-prod" + ".json';"));
  iu('① ★門を 通らず 鍵を 読む 測りが 在れば 赤★', a.kagi.length === 1, '見つけられない');

  const b = yaburiTe(F2, nise("await fetch('https://" + "api.supabase.com" + "/v1/x');"));
  iu('② ★門を 通らず 倉庫へ 問う 測りが 在れば 赤★', b.kuchi.length === 1, '見つけられない');

  const c = yaburiTe(F2, nise("/* " + "nomiya-db-url-prod" + " は 使いません */"));
  iu('③ ★覚書に 書いただけなら 赤に しない★', c.kagi.length === 0, '覚書を 拾って しまう');

  const fueta = MENJO.concat(['kyuyo/tests/nise2.mjs']);
  iu('⑤ ★免除を 黙って 増やしたら 赤★', fueta.length !== MENJO_HONSU, '増やしても 気づかない');

  /* ⑥ ★免除を 1つ 足した 名簿★を 作って 赤に なるか（★字を 組み立てる＝逆斜線を 使わない★） */
  const meibo2 = 'YUBI_MENJO = [ { tana: ' + q + 'kyuyo.pay_companies' + q + ', naze: ' + q + 'x' + q + ' },'
    + ' { tana: ' + q + 'kyuyo.nise' + q + ', naze: ' + q + 'x' + q + ' } ];';
  iu('⑥ ★指紋の 免除を 黙って 増やしたら 赤★',
    (meibo2.match(/tana:/g) || []).length !== 1, '増やしても 気づかない');

  const meibo3 = 'YUBI_MENJO = [ { tana: ' + q + 'kyuyo.pay_companies' + q + ' } ];';
  iu('⑦ ★訳(naze)の 無い 免除は 赤★',
    (meibo3.match(/naze:/g) || []).length !== (meibo3.match(/tana:/g) || []).length, '訳が 無くても 通る');

  console.log(ng ? '\n★自己確認 ' + ng + '件 おかしい★' : '\n自己確認 OK（★赤が 出る事まで 見た★）');
  if (ng) process.exit(1);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
