/* oshu-mae.mjs — ★押す前に 回す★（★名簿を 人が 選ばない★）
 * ============================================================================
 * ★なぜ 在るか（2026-09-22 実測）★
 *   ★私は 押す前に `tests/*.test.mjs` の 31本を 回して いました★
 *   ★今日 4回 踏んだ うち★ … ★3回は そこで 出た★／★1回は 出ず 押してから CI で 出た★
 *   ★数えたら★ … ★ci.yml の node の 段 240★／★回して いたのは 31★／★★差 209★★
 *   ⇒ ★★『名簿は 置き場から 作る』と 書いたのに ★その 括りを 選んだのは 人★★★
 *
 * ★★この 道具が 守る 事★★
 *   ⑴ ★段は yml から 拾う★（`tools/_dan-hirou.mjs`＝★拾い方は 1か所★）
 *   ⑵ ★重い／軽いは ★命令の 字★で 決める★（★人が 1本ずつ 選ばない★）
 *   ⑶ ★★回した ＋ 除いた ＝ 全 を 毎回 出す★★
 *      ＝★除いた 段は ★数と 訳★を 必ず 書く★（★これが 無いと また 差が 隠れます★）
 *
 * ★重い 段は ここでは 回しません（訳）★
 *   ・★実ブラウザ／倉庫を 触る 段★ … ★遅い／同じ 試験倉庫を 2つの 席で 使う★
 *   ・★掃きの 道具★ ……………… ★中で 他の 段を 回す＝二重に 走る★
 *   ⇒ ★それらは ★総なめ（souname）★の 仕事★＝★ここは「押す前の 網」★
 *
 * ★使い方★
 *   node tools/oshu-mae.mjs                … ci.yml の 速い 段を 全部
 *   node tools/oshu-mae.mjs --yml=.github/workflows/webkit.yml
 *   node tools/oshu-mae.mjs --self-test    … ★選び方だけ 試す（1段も 走らせない）★
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { erabu, omoiKa, hirouDan } from './_dan-hirou.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

if (process.argv.includes('--self-test')) {
  console.log('\n[oshu-mae] ★自己確認★（★1段も 走らせません★）');
  let ng = 0;
  const iu = (n, good) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + n + (good ? '' : '  ★思っていたのと 違う★')); };
  /* ★見本は ★実物と 同じ 書き方★ に する★（2026-09-22 踏んだ）
     ★はじめ★ … 一行の 形で 書いた ⇒ ★拾えず 8件 赤★
     ★実物を 数えた★ … ci.yml 241／★一行の 形は 0★／webkit 48／0
     ⇒ ★★拾い漏らしは 無い／★見本が 違って いた★★ */
  const mihon = [
    '    steps:',
    '      - name: a',
    '        run: node tests/a.test.mjs',
    '      - name: b',
    '        run: node kyuyo/tests/b-ui.mjs',
    '      - name: c',
    '        run: npm install',
    '      - name: d',
    '        run: node tools/clock-sweep.mjs --self-test-kazoe',
    '      - name: e',
    '        run: node kyuyo/tests/souko-mon.test.mjs',
    '      - name: f',
    '        run: node scripts/silent-catch.mjs --check',
  ].join(String.fromCharCode(10));
  const e = erabu(mihon);
  iu('★段を yml から 拾う（6段）★', e.zen === 6);
  iu('★実ブラウザの 段は 除く★', !!e.nozoku.find((x) => /b-ui\.mjs/.test(x.c)));
  iu('★倉庫の 段は 除く★', !!e.nozoku.find((x) => /souko-mon/.test(x.c)));
  iu('★掃きの 道具は 除く（二重に 走る）★', !!e.nozoku.find((x) => /clock-sweep/.test(x.c)));
  iu('★支度は 除く★', !!e.nozoku.find((x) => /npm install/.test(x.c)));
  iu('★★`scripts/` の 段も 回す★★（今日 ここが 抜けて いた）',
    !!e.hashiru.find((x) => /silent-catch/.test(x.c)));
  iu('★`tests/` の 段も 回す★', !!e.hashiru.find((x) => /a\.test\.mjs/.test(x.c)));
  iu('★★回した ＋ 除いた ＝ 全★★', e.hashiru.length + e.nozoku.length === e.zen);
  iu('★重い 字に 当たらなければ null（当てない）★', omoiKa('node tests/x.test.mjs') === null);
  iu('★拾い方は 1か所（run: だけ 拾う）★',
    hirouDan('        run: node a' + String.fromCharCode(10) + '      - name: b').length === 1);
  console.log(ng ? '★自己確認 ' + ng + '件 おかしい★' : '  ★10通り ぜんぶ 思った通り★');
  process.exit(ng ? 1 : 0);
}

const ymlArg = process.argv.find((x) => x.indexOf('--yml=') === 0);
const YML = ymlArg ? ymlArg.split('=')[1] : '.github/workflows/ci.yml';
const yml = fs.readFileSync(path.join(ROOT, YML), 'utf8');
const e = erabu(yml);

/* ★★★空きを 測る★★★（2026-09-26・指示役1 の 足し）
   ★なぜ 要るか（実測）★
     この 網を ★３本 続けて 空き不足で 殺されました★。
     その うち 1本は ★「✗ 11段」と 出た★が ★直に 走らせると 緑★。
     ⇒ ★★『赤』と『殺された』を 切り分けられなかった★★
     ⇒ ★★『殺される』より『走らせない』の 方が 良い★★
   ★門は 狭めません★ … ★段を 1つも 外しません★／★走らせない 時は 赤★
   ★測れない 機械では ★この 門を 効かせません★（★字で そう 出します★）
     ＝★測れないのを「足りて いる」と も「足りない」と も しない★ */
const KUUKI_GB = Number(process.env.OSHU_MAE_KUUKI_GB || 2.0);      /* ★走る 前の 下限★ */
const KUUKI_GB_TOCHU = Number(process.env.OSHU_MAE_KUUKI_GB_TOCHU || 1.2); /* ★途中の 下限★ */
const KUUKI_MAI = Number(process.env.OSHU_MAE_KUUKI_MAI || 10);     /* ★何段 ごとに 測るか★ */
function kuukiGB() {
  /* ★Windows … PowerShell★／★それ以外 … /proc/meminfo★／★どちらも 無理なら null★ */
  try {
    if (process.platform === 'win32') {
      const r = spawnSync('powershell', ['-NoProfile', '-Command',
        '(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory'],
        { encoding: 'utf8', timeout: 20000 });
      const kb = Number(String((r.stdout || '')).trim());
      return kb > 0 ? kb / 1024 / 1024 : null;   /* KB → GB */
    }
    const t = fs.readFileSync('/proc/meminfo', 'utf8');
    const m = t.match(/MemAvailable:\s+(\d+) kB/);
    return m ? Number(m[1]) / 1024 / 1024 : null;
  } catch (err) { return null; }
}
const kuukiIu = (v) => (v === null ? '★測れません★' : v.toFixed(2) + ' GB');

console.log('\n[oshu-mae] ★押す前に 回す★ … ' + YML);
console.log('  ★全 ' + e.zen + '段★ ／ ★回す ' + e.hashiru.length + '段★ ／ ★回さない ' + e.nozoku.length + '段★'
  + '（' + (e.hashiru.length + e.nozoku.length === e.zen ? '★合う★' : '★★合いません★★') + '）');
/* ★★除いた 訳を 数で 出す★★＝★これが 無いと また 差が 隠れます★ */
const wake = {};
e.nozoku.forEach((x) => { wake[x.wake] = (wake[x.wake] || 0) + 1; });
Object.keys(wake).forEach((k) => console.log('    回さない … ' + wake[k] + '段  ' + k));

/* ★★この 道具 自体が ★「0件＝合格」を やって いました★★（2026-09-22 初回の 実測）
   ★出た 字★ … ★走らせられない 220段★ なのに ★「赤 0段」／終わり値 0★
   ★因★ … `/usr/bin/env` は Windows に ★無い★／そして ★私の 判じが それを 緑で 通した★
   ⇒ ★★今日 ずっと 潰して きた 形を ★自分の 道具で★ やって いた★★
   ★直し★ ①★殻を 使う★（Windows でも 走る） ②★★走らせられない 段が 1つでも 在れば 赤★★ */
/* ★★走る 前に 測る★★ */
{
  const k0 = kuukiGB();
  console.log('  ★空き（走る 前） … ' + kuukiIu(k0)
    + '／下限 ' + KUUKI_GB + ' GB（途中の 下限 ' + KUUKI_GB_TOCHU + ' GB）★'
    + (k0 === null ? '（★★この 門は 効きません＝測れません★★）' : ''));
  if (k0 !== null && k0 < KUUKI_GB) {
    console.log(String.fromCharCode(10)
      + '★★★走らせません＝空き ' + kuukiIu(k0)
      + ' が 下限 ' + KUUKI_GB + ' GB を 割って います★★★');
    console.log('  ★訳★ … ★途中で 殺されると ★「赤」と「殺された」が 分からない★★');
    console.log('  ★やる 事★ … ★他の 席・ブラウザを 閉じて から もう一度★'
      + '／★どうしても 走らせるなら `OSHU_MAE_KUUKI_GB=0`（★殺され得ます★）');
    console.log('  ★★「赤 0」とは 書きません＝★何も 測って いません★★');
    process.exit(1);
  }
}

let aka = 0, mi = 0;
let tometa = 0;               /* ★空き不足で 途中で 止めた 段の 数★ */
let kuukiSaigo = null;
const akaDan = [], miDan = [];
e.hashiru.forEach((d, ban) => {
  /* ★★途中でも 測る★★＝★下限を 割ったら ★止めて 『走らせられなかった 段』に 数える★ */
  if (tometa === 0 && ban > 0 && ban % KUUKI_MAI === 0) {
    const k = kuukiGB();
    kuukiSaigo = k;
    if (k !== null && k < KUUKI_GB_TOCHU) {
      tometa = ban;
      console.log('  ★★途中で 止めます＝空き ' + kuukiIu(k)
        + ' が 途中の 下限 ' + KUUKI_GB_TOCHU + ' GB を 割りました★★'
        + '（' + ban + '段まで 走った）');
    }
  }
  if (tometa) {
    mi++; miDan.push({ d: d, naze: '★空きが 足りず 途中で 止めた★' });
    return;
  }
  const r = spawnSync(d.c, { cwd: ROOT, encoding: 'utf8', shell: true,
    maxBuffer: 32 * 1024 * 1024, timeout: 180000 });
  if (r.error || r.status === null) {
    mi++; miDan.push({ d: d, naze: (r.error && r.error.message) || '終わり値が 無い' });
    return;
  }
  if (r.status !== 0) { aka++; akaDan.push(d); console.log('  ✗ ' + d.i + '段 … ' + d.c.slice(0, 90)); }
});
console.log('  ★空き（終わり） … ' + kuukiIu(kuukiSaigo === null ? kuukiGB() : kuukiSaigo)
  + (tometa ? '／★★' + tometa + '段まで 走って 止めました★★' : '') + '★');
console.log('  ★赤 ' + aka + '段★ ／ ★走らせられない ' + mi + '段★'
  + ' ／ 回った ' + (e.hashiru.length - mi) + '段（回すつもり ' + e.hashiru.length + '段）');
akaDan.forEach((d) => console.log('     ★赤★ ' + d.c.slice(0, 120)));
miDan.slice(0, 5).forEach((x) => console.log('     ★走らせられない★ ' + x.d.i + '段 … ' + x.naze.slice(0, 80)));
if (miDan.length > 5) console.log('     （他 ' + (miDan.length - 5) + '段）');
if (aka) console.log(String.fromCharCode(10) + '★★押す前に 止めました＝赤 ' + aka + '段★★');
else if (mi) console.log(String.fromCharCode(10) + '★★★「赤 0」とは 書けません＝走らせられない ' + mi + '段★★★');
else console.log(String.fromCharCode(10) + '★押す前の 網 … 回した ' + e.hashiru.length + '段 ／ 赤 0★');
process.exitCode = (aka || mi) ? 1 : 0;
