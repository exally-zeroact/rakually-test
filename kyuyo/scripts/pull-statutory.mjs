/* pull-statutory.mjs — ★中央 statutory を唯一の正として、lib側の写しを【機械で】作り直す。
 *
 * なぜ（2026-08-03 の指示）:
 *   出典(source_url)・確認日(verified_at)・指紋(fingerprint) を lib に手書きすると、
 *   ★中央と lib の2箇所に手書きが残り、どちらを触っても片方が腐る。★
 *   なので lib 側は「中央から作る物」にする。人は中央だけを直す。
 *
 * 作る物:
 *   ① kyuyo/lib/statutory-central.generated.js
 *        kind:year → { source_url, verified_at, fingerprint }  ★このファイルは手で編集しない
 *   ② kyuyo/lib/saitei-chingin.js の todofuken（--write 時のみ）
 *        中央の47県（name/chingin/prev/hatsuko）をそのまま書き戻す。
 *        ★発効日は中央が和暦（例 令和8年3月31日）。判定に使うので lib では ISO(YYYY-MM-DD)へ直す。
 *
 * 使い方:
 *   node scripts/pull-statutory.mjs            … ①を作り直す（差分があれば書く）
 *   node scripts/pull-statutory.mjs --write    … ①に加えて②(saitei 47県)も書き戻す
 *   node scripts/pull-statutory.mjs --check    … 書かずに、ズレていたら exit 3（CI用）
 *   ★中央が読めない時は exit 0（オフラインで赤くしない。verify-statutory と同じ方針）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(path.join(ROOT, 'package.json'));
const SM = require_(path.join(ROOT, 'lib/statutory-meta.js'));
const SAI = require_(path.join(ROOT, 'lib/saitei-chingin.js'));

// ★中央statutory（法定データは全国で1つの表＝本番/テストで分けない。読取専用のanon GETのみ）
const SUPA_URL = 'https://tnfwipbgfgjaymlszeid.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRuZndpcGJnZmdqYXltbHN6ZWlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1Nzk4MzQsImV4cCI6MjA5NzE1NTgzNH0.zhKPLSlW4zxsdjsXNvqDHvtP3wBqp-EKaxbjqLGW_ek';

const MODE = process.argv.includes('--check') ? 'check' : (process.argv.includes('--write') ? 'write' : 'gen');
const GEN = path.join(ROOT, 'lib/statutory-central.generated.js');

async function fetchRows() {
  const url = SUPA_URL + '/rest/v1/statutory?select=kind,year,data,source_url,verified_at&order=kind,year';
  const r = await fetch(url, { headers: { apikey: ANON, Authorization: 'Bearer ' + ANON } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

function genText(rows) {
  const meta = {};
  for (const r of rows) {
    meta[r.kind + ':' + r.year] = {
      source_url: r.source_url || null,
      verified_at: r.verified_at || null,
      fingerprint: SM.fingerprintOf(r.data),
    };
  }
  const keys = Object.keys(meta).sort();
  const body = keys.map(k => "    '" + k + "': { source_url: " + JSON.stringify(meta[k].source_url)
    + ", verified_at: " + JSON.stringify(meta[k].verified_at)
    + ", fingerprint: '" + meta[k].fingerprint + "' },").join('\n');
  return `/* statutory-central.generated.js — ★機械が作るファイル。手で編集しない。★
 *
 *  作り方: node scripts/pull-statutory.mjs   （中央 statutory から取ってくる）
 *  中身  : kind:year → 出典URL / 確認日 / 指紋（中央のdataから計算）
 *
 *  ★なぜ生成にしたか（2026-08-03）
 *    出典・確認日を lib にも手書きすると、中央と lib の2箇所に手書きが残る。
 *    どちらを触っても片方が腐るので、★人が直すのは中央だけ★にした。
 *    ズレていないことは scripts/pull-statutory.mjs --check と
 *    tests/statutory-freshness.test.mjs がCIで見張る。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.StatutoryCentral = api;
  else if (typeof globalThis !== 'undefined') globalThis.StatutoryCentral = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var META = {
${body}
  };
  return { META: META };
});
`;
}

/* 和暦(令和8年3月31日) → ISO(2026-03-31)。判定に使うので lib では ISO で持つ。 */
function warekiToIso(s) {
  const m = /^令和(\d+)年(\d+)月(\d+)日$/.exec(String(s || ''));
  if (!m) return null;
  return (2018 + (+m[1])) + '-' + String(+m[2]).padStart(2, '0') + '-' + String(+m[3]).padStart(2, '0');
}

function saiteiDiffs(rows) {
  const row = rows.find(r => r.kind === 'saitei_chingin' && r.year === 2025);
  if (!row) return ['saitei_chingin:2025 が中央に無い'];
  const c = row.data.todofuken || {};
  const out = [];
  for (const k of Object.keys(SAI.todofuken)) {
    const lib = SAI.todofuken[k], cen = c[k];
    if (!cen) { out.push(k + ': 中央に無い'); continue; }
    if (lib.name !== cen.name) out.push(k + ': 名前 lib=' + lib.name + ' 中央=' + cen.name);
    if (lib.chingin !== cen.chingin) out.push(k + ': 額 lib=' + lib.chingin + ' 中央=' + cen.chingin);
    if (lib.prev !== cen.prev) out.push(k + ': 前年額 lib=' + lib.prev + ' 中央=' + cen.prev);
    const iso = warekiToIso(cen.hatsuko);
    if (lib.hatsuko !== iso) out.push(k + ': 発効日 lib=' + lib.hatsuko + ' 中央=' + cen.hatsuko + '(→' + iso + ')');
  }
  return out;
}

function writeSaitei(rows) {
  const c = rows.find(r => r.kind === 'saitei_chingin' && r.year === 2025).data.todofuken;
  const p = path.join(ROOT, 'lib/saitei-chingin.js');
  let src = fs.readFileSync(p, 'utf8');
  let n = 0;
  for (const [k, cen] of Object.entries(c)) {
    const iso = warekiToIso(cen.hatsuko);
    const re = new RegExp('(\\b' + k + ':\\s*\\{)[^}]*\\}');
    const next = src.replace(re, '$1 name: ' + JSON.stringify(cen.name) + ', chingin: ' + cen.chingin
      + ', prev: ' + cen.prev + ", hatsuko: '" + iso + "' }");
    if (next !== src) { n++; src = next; }
  }
  fs.writeFileSync(p, src);
  return n;
}

let rows;
try { rows = await fetchRows(); }
catch (e) {
  console.log('中央statutoryを取得できませんでした（' + e.message + '）。検証スキップ＝赤くしない。');
  rows = null;
}

if (rows) {
const want = genText(rows);
const have = fs.existsSync(GEN) ? fs.readFileSync(GEN, 'utf8') : '';
const genStale = want.replace(/\r\n/g, '\n') !== have.replace(/\r\n/g, '\n');
const sDiffs = saiteiDiffs(rows);

if (MODE === 'check') {
  if (!genStale && !sDiffs.length) {
    console.log('OK: lib側の写しは中央と一致（' + rows.length + '行）。');
  } else {
    if (genStale) console.log('★出典・確認日・指紋が中央とズレています → node scripts/pull-statutory.mjs で作り直してください。');
    if (sDiffs.length) console.log('★最賃47県が中央とズレています:\n' + sDiffs.map(x => '   - ' + x).join('\n')
      + '\n   → node scripts/pull-statutory.mjs --write で中央から書き戻してください（★手で直さない）。');
    // ★fetch の直後に process.exit すると Windows の libuv が異常終了する。終了コードだけ立てて自然に終わる。
    process.exitCode = 3;
  }
} else {
  if (genStale) { fs.writeFileSync(GEN, want); console.log('書きました: lib/statutory-central.generated.js（' + rows.length + '行）'); }
  else console.log('変更なし: lib/statutory-central.generated.js');

  if (MODE === 'write') {
    const n = writeSaitei(rows);
    console.log('最賃47県: ' + n + '件を中央から書き戻しました（発効日は和暦→ISOに直して保存）');
  } else if (sDiffs.length) {
    console.log('★最賃が中央とズレています（--write で書き戻せます）:\n' + sDiffs.map(x => '   - ' + x).join('\n'));
  }
}
}
