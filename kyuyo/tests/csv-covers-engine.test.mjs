/* csv-covers-engine.test.mjs — ★受け口は「エンジンが読む欄」を 全部 持つ★
 * =============================================================================
 * 決まり（指示役 2026-08-23）:
 *   割増の欄が エンジンに在るのに 受け口(勤怠CSV)に無いと、
 *   ★その時間は 低い方の欄に落ちて 払い足りません★（警告0）。
 *   実際 2026-08-23 に ★時間外60時間超（法定50%）が 普通の残業(25%)として入っていました★。
 *   ⇒ ★エンジンが detail で読む欄★ と ★勤怠CSVが入れられる欄★ を突き合わせ、
 *      ★片方にしか無い欄が1つでもあれば 赤★。
 *
 * ★源を読むだけにしない★:
 *   ・エンジン側 … `warimashiMins()` が読んでいる欄名を source から取る（★5つ未満なら赤＝空振り防止★）
 *   ・受け口側 … ★本物のパーサに 見出しを流して★ どの欄に入るかを ★動かして★ 確かめる
 *
 * 使い方: node kyuyo/tests/csv-covers-engine.test.mjs
 *         node kyuyo/tests/csv-covers-engine.test.mjs --self-test
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const require_ = createRequire(pathToFileURL(path.join(ROOT, 'package.json')));

const SELF = process.argv.includes('--self-test');
let pass = 0, fail = 0;
const T = (n, f) => { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (v, m) => { if (!v) throw new Error(m || 'false'); };

/* ★エンジンが detail で読む欄★（本物の source から取る） */
const ENGINE_SRC = path.join(ROOT, 'kyuyo/lib/payroll-monthly.js');
function engineKeys(src) {
  const i = src.indexOf('function warimashiMins');
  if (i < 0) throw new Error('★warimashiMins が見つかりません＝この見張りが古い★');
  const body = src.slice(i, i + 1200);
  const keys = [...body.matchAll(/g\('([A-Za-z0-9_]+)'\)/g)].map((m) => m[1]);
  const uniq = [...new Set(keys)];
  /* ★空振り防止★＝読めなかったのに「差0」で緑にしない */
  if (uniq.length < 5) throw new Error('★エンジンの欄を ' + uniq.length + '個しか読めていません（読み方が古い）★');
  return uniq.sort();
}

/* ★受け口が入れられる欄★＝本物のパーサに見出しを流して 動かして確かめる
   （★欄ごとに 日本語の見出しを1つ決めておく★。エンジンに欄が増えたら ここが空になって赤） */
const HEADER_OF = {
  ot: '時間外',
  otNight: '時間外深夜',
  over60: '時間外60時間超',
  over60Night: '時間外60時間超深夜',
  night: '深夜',
  holiday: '法定休日',
  holidayNight: '休日深夜',
};
function csvFields(K) {
  const out = {};
  Object.keys(HEADER_OF).forEach((k) => { out[k] = K.classify(HEADER_OF[k]); });
  return out;
}

function loadCsvLib() {
  /* require のキャッシュを避けて 毎回 読み直す（--self-test で書き換えるため） */
  const m = { exports: {} };
  const src = fs.readFileSync(path.join(ROOT, 'kyuyo/lib/kintai-csv.js'), 'utf8');
  new Function('module', 'exports', 'define', 'window', src)(m, m.exports, undefined, {});
  return m.exports;
}

function run(label) {
  console.log('\n[' + label + ']');
  const eKeys = engineKeys(fs.readFileSync(ENGINE_SRC, 'utf8'));
  const K = loadCsvLib();

  T('★エンジンが読む欄を 全部 読み出せている★（' + eKeys.length + '個）', () => {
    ok(eKeys.length >= 5, '欄が少なすぎる: ' + eKeys.join(','));
    console.log('      エンジン … ' + eKeys.join(' / '));
  });

  T('★エンジンに在って 受け口の表に無い欄が 0個★（増えた欄を黙って捨てない）', () => {
    const missing = eKeys.filter((k) => !HEADER_OF[k]);
    ok(!missing.length, '★受け口に入れる道が無い欄★ … ' + missing.join(' , ')
      + '（この見張りの HEADER_OF に見出しを足し、kintai-csv.js に置き場を作る）');
  });

  T('★受け口の表に在って エンジンが読まない欄が 0個★（要らない欄を作らない）', () => {
    const extra = Object.keys(HEADER_OF).filter((k) => eKeys.indexOf(k) < 0);
    ok(!extra.length, '★エンジンが読まない欄★ … ' + extra.join(' , '));
  });

  T('★見出しを流すと それぞれ 自分の欄に入る★（動かして確かめる）', () => {
    const got = csvFields(K);
    const bad = Object.keys(HEADER_OF).filter((k) => got[k] !== k);
    ok(!bad.length, '★別の欄に化けています★ … '
      + bad.map((k) => HEADER_OF[k] + '→' + got[k] + '（ほしい ' + k + '）').join(' / '));
  });

  T('★7欄そろったCSVを流すと 7つとも別々の値になる★（1つも混ざらない）', () => {
    const keys = Object.keys(HEADER_OF);
    const head = '氏名,' + keys.map((k) => HEADER_OF[k]).join(',');
    const vals = '山田,' + keys.map((k, i) => (i + 1) + ':00').join(',');
    const r = K.parse(head + '\n' + vals + '\n');
    const PROP = { ot: 'otMin', otNight: 'otNightMin', over60: 'over60Min', over60Night: 'over60NightMin',
      night: 'nightMin', holiday: 'holidayMin', holidayNight: 'holidayNightMin' };
    const row = r.rows[0];
    const wrong = keys.filter((k, i) => row[PROP[k]] !== (i + 1) * 60);
    ok(!wrong.length, '★値が入れ替わっています★ … '
      + wrong.map((k) => k + '=' + row[PROP[k]]).join(' / '));
    console.log('      受け口 … ' + keys.map((k, i) => k + '=' + row[PROP[k]] + '分').join(' / '));
  });
}

if (!SELF) {
  run('受け口とエンジンの突き合わせ');
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
} else {
  /* ★わざと1欄 消して 赤になるか★（消しても緑なら この見張りは守っていない） */
  console.log('\n★自己診断★ … 受け口から「時間外60時間超の深夜」の欄を消して 赤が出るかを見る');
  const p = path.join(ROOT, 'kyuyo/lib/kintai-csv.js');
  const keep = fs.readFileSync(p, 'utf8');
  const mark = "    if (over60 && night) return 'over60Night';                    // ★いちばん狭い★\n";
  if (keep.indexOf(mark) < 0) { console.log('  ★壊す場所が見つからない＝この自己診断は古い★'); process.exit(2); }
  try {
    fs.writeFileSync(p, keep.replace(mark, ''));
    run('1欄 消した受け口（わざと壊した）');
  } finally { fs.writeFileSync(p, keep); }
  console.log('\n  わざと壊した時に 赤になった数 … ' + fail + '件（2件以上のはず）');
  if (fail < 2) { console.log('  ✗ ★空振りです★ 壊しても赤にならない'); process.exit(1); }
  console.log('  ✓ ★壊したら赤になった＝この見張りは本当に働いています★');
  process.exit(0);
}
