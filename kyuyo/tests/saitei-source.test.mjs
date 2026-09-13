/* saitei-source.test.mjs — ★出典URLを 実際に 取って、その中に 数字が 在るか★
 * ============================================================================
 * ★なぜ 要るか（2026-09-12 実測。経営者1が 見つけた）★
 *   最賃の 出典を ★一覧ページ★ に していた（.../minimumichiran/）。
 *   実際に 取って 数えたら ★「1,280」0回・「1,177」0回・「令和8年度」0回★＝
 *   ★出典を 開いても 数字が 確かめられない＝出典として 成立していない★。
 *   ★ドメインは 厚労省で 合っている★ので、門番の「出典が厚労省か」は ★すり抜けた★。
 *   ⇒ ★URLの 形だけ 見ても 足りない。中身を 取って 数字が 在るか 見る★。
 *
 * ★外を 叩くので 週1側で 走らせる★（向こうの都合の赤で push を 止めない）
 * ★取れない時は 赤に しない★＝--strict を 付けた時だけ 赤（週1で 使う）
 */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
const require_ = createRequire(import.meta.url);
const SAI = require_('../lib/saitei-chingin.js');
const SR = require_('../lib/statutory-rows.js');

const STRICT = process.argv.includes('--strict');
let pass = 0, fail = 0;
const T = async (n, f) => { try { await f(); pass++; console.log('  OK ' + n); }
  catch (e) { fail++; console.log('  NG ' + n + ' — ' + (e && e.message)); } };

const L = {
  SHH: require_('../lib/shakaihoken-hyo.js'), SAI, KOYO: require_('../lib/koyo-hoken.js'),
  D: require_('../lib/shotokuzei-densan.js'), H: require_('../lib/shotokuzei-hei.js'),
  NI: require_('../lib/shotokuzei-nichi.js'), SZ: require_('../lib/shoyo-zei.js'),
  N: require_('../lib/nenmatsu.js'), WM: require_('../lib/warimashi.js'),
  SHZ: require_('../lib/shouhizei-ritsu.js'), RR: require_('../lib/rousai-ritsu.js')
};
const row = SR.buildStatutoryRows(L).find((r) => r.kind === 'saitei_chingin');

/* ★桁区切りは 自分で 組まない★（正規表現の 逃がしで 今日 何度も 落ちた） */
const yen = (n) => Number(n).toLocaleString('en-US');

const toru = async (url) => {
  const r = await fetch(url, { headers: { 'User-Agent': 'claude-code' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const ct = r.headers.get('content-type') || '';
  if (/pdf/i.test(ct) || /[.]pdf$/i.test(url)) {
    const p = path.join(os.tmpdir(), 'saitei-src-' + Date.now() + '.pdf');
    fs.writeFileSync(p, Buffer.from(await r.arrayBuffer()));
    try { return execFileSync('pdftotext', ['-raw', '-enc', 'UTF-8', p, '-'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }); }
    finally { try { fs.unlinkSync(p); } catch (e) { /* 消せなくても 落ちない */ } }
  }
  const t = await r.text();
  return t.replace(/<[^>]+>/g, ' ');
};

console.log('\n[saitei-source] 最賃の 出典URLを 実際に 取って 中身を 数える');
console.log('  出典 = ' + row.source_url);

/* ★出典URLを 持つ所が 3つ在る＝全部 同じか 先に 見る★（2026-09-12・経営者1が 見つけた）
   ★実際に 起きた★＝中央だけ 直して ops の札は 一覧ページのまま＝
   ★同じ札の中に 正しいURLと 裏付けないURLが 並んでいた★。
   ★この見張りは 中央の source_url しか 見ていなかった＝ops は 一度も 見られていない★。
   ⇒ ★外を 叩く前に、中で 揃っているかを 数える★（ここは 外に 出ないので 必ず 走る）。 */
const OPS = (() => { try { return require_('../ops/payroll.monthly.js').law.saiteiChingin.source || ''; } catch (e) { return '(opsが読めない)'; } })();
const LIB = SAI.SOURCE_URL || '(libが持っていない)';
console.log('  出典を持つ所 … lib=' + LIB + ' / ops=' + OPS + ' / 中央行=' + row.source_url);
if (!(LIB === OPS && OPS === row.source_url)) {
  console.log('  NG ★出典URLが 3か所で 揃っていない★（どれかが 古い＝開いても 数字が 無い事が 起きる）');
  fail++;
} else { pass++; console.log('  OK ★出典URLは lib・ops・中央行 の 3か所とも 同じ★'); }

const main = async () => {
  let honbun = null;
  try { honbun = await toru(row.source_url); }
  catch (e) {
    if (STRICT) { console.log('  NG 出典が 取れない（--strict）: ' + e.message); process.exitCode = 4; return; }
    console.log('  SKIP 出典が 取れない（オフライン等）＝赤にしない: ' + e.message);
    process.exit(0);
  }
  console.log('  取れた 本文 = ' + honbun.length + '字');

  await T('★出典の中に 全国加重平均が 在る★', async () => {
    const n = yen(row.data.zenkoku_heikin);
    if (honbun.indexOf(n) < 0) throw new Error('「' + n + '」が 出典に 無い＝出典として 成立していない');
  });
  await T('★出典の中に 最高額と 最低額が 在る★', async () => {
    const t = row.data.todofuken, v = Object.keys(t).map((k) => t[k].chingin);
    for (const x of [Math.max.apply(null, v), Math.min.apply(null, v)]) {
      if (honbun.indexOf(yen(x)) < 0) throw new Error('「' + yen(x) + '」が 出典に 無い');
    }
  });
  await T('★47県の額が ぜんぶ 出典の中に 在る★', async () => {
    const t = row.data.todofuken;
    const nai = Object.keys(t).filter((k) => honbun.indexOf(yen(t[k].chingin)) < 0);
    if (nai.length) throw new Error(nai.length + '県の額が 出典に 無い: ' + nai.slice(0, 5).join(','));
  });
  await T('★年度の字が 出典の中に 在る★', async () => {
    const n = '令和' + (row.year - 2018) + '年度';
    if (honbun.indexOf(n) < 0) throw new Error('「' + n + '」が 出典に 無い');
  });

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exitCode = fail ? 1 : 0;
};
main();
