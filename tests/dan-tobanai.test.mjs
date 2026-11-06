/* dan-tobanai.test.mjs — ★前の段が 1つ 赤でも 後ろの 段を 黙って 飛ばさない★
 * ==============================================================================
 * ★なぜ 要るか（実物・2026-11-06）★
 *   webkit.yml の 試験の 段は 全部 `if: ${{ !cancelled() }}`（前が 赤でも 走る）なのに、
 *   ★途中の「Install Chromium」だけ if が 無かった★。
 *   ⇒ 前の 試験が 1段 赤に なると Install Chromium が skipped ⇒ 後ろの 9段が
 *     ★ブラウザ 無しで「未測定の 赤」★＝★1つの 赤が 10の 赤に 見える★（本当の 赤が 埋もれる）。
 *   （rakually-test 7114049 の WebKit で コンサルが 見つけた）
 *
 * ★決まり★
 *   1つの job の 中で `!cancelled()` か `always()` を 持つ 段が 1つ でも 出たら、
 *   ★その 後ろの 段は 全部★ `if:` に `!cancelled()` か `always()` を 持つ。
 *   （前の 段が 落ちても 後ろが 走る＝が この job の 作りの 約束。途中に 1つ 抜けが あると 約束が 割れる）
 *   ★それより 前の 段（checkout・npm install など）は 見ない★＝そこが 落ちたら 全部が 本当に 赤。
 *
 * 使い方:
 *   node tests/dan-tobanai.test.mjs              … .github/workflows/*.yml を 全部 見る
 *   node tests/dan-tobanai.test.mjs --self-test  … ★わざと if を 外した 写しで 赤に なるか★
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WF = path.join(ROOT, '.github', 'workflows');

/* ★yml を 字で 読む★（借り物を 使わない）＝jobs: の 下の job ごとに steps の 段を 拾う */
export function mitsukeru(text, name) {
  const lines = String(text).split('\n');
  const ana = [];
  let job = null, inSteps = false, stepIndent = -1, cur = null, nagare = false, kazu = 0;
  /* ★job ごとの「流れの 下で 見張れた 段」の 数★（!cancelled()／always() を 持つ 段そのものも 数える）
   *   ＝if が 全部 消えると 0 に なる（抜け 0 でも 緑に しない為の 数・taiketsu 11-06 止め1） */
  const mihari = {};
  const dan = [];   // 拾った 段 全部（job・名前・if を 持つか）＝名指しの 段を 縛る 為
  const shimeru = () => {
    if (!cur) return;
    kazu++;
    /* ★if の 中身 そのものが !cancelled()／always() の 時だけ 持つと 言う★（`success() && !cancelled()` や
     *   `!cancelled() && false` は 前が 赤なら 飛ばされる＝持たない・taiketsu 11-06 3回目 任意1） */
    const ok = KATACHI.test(cur.ifs.trim());
    dan.push({ job, name: cur.name, line: cur.line, ok });
    if (nagare && !ok) ana.push({ file: name, job, line: cur.line, step: cur.name });
    if (ok) nagare = true;
    if (nagare && ok) mihari[job] = (mihari[job] || 0) + 1;
    cur = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (/^\s*#/.test(ln) || !ln.trim()) continue;
    const ind = ln.match(/^ */)[0].length;
    /* 行の 終わりの 注（`steps:   # …`）が 在っても 拾う（taiketsu 11-06：注で 段 0 に なっていた） */
    const mj = ln.match(/^  ([A-Za-z0-9_-]+):\s*(?:#.*)?$/);
    if (mj) { shimeru(); job = mj[1]; inSteps = false; nagare = false; continue; }
    if (/^    steps:\s*(?:#.*)?$/.test(ln)) { shimeru(); inSteps = true; stepIndent = -1; continue; }
    if (!inSteps) continue;
    const ms = ln.match(/^( *)- (.*)$/);
    if (ms && (stepIndent < 0 || ms[1].length === stepIndent)) {
      shimeru();
      stepIndent = ms[1].length;
      const nm = (ms[2].match(/^(?:name|uses):\s*(.*)$/) || [])[1] || ms[2];
      cur = { line: i + 1, name: nm.trim(), ifs: '' };
      const mi = ms[2].match(/^if:\s*(.*)$/); if (mi) cur.ifs += kesuChu(mi[1]);
      continue;
    }
    if (cur && stepIndent >= 0 && ind <= stepIndent) { shimeru(); inSteps = false; continue; }
    if (cur && ind === stepIndent + 2) {
      const mi = ln.match(/^\s*if:\s*(.*)$/); if (mi) cur.ifs += kesuChu(mi[1]);
    }
  }
  shimeru();
  return { ana, kazu, mihari, dan };
}

/* 「前が 赤でも 走る」と 言える if の 形（引用符・${{ }} の 有り無しだけ 許す） */
const KATACHI = /^(["']?)(?:\$\{\{\s*)?(?:!\s*cancelled\(\)|always\(\))(?:\s*\}\})?\1$/;

/* if の 行の 終わりの 注は 判じに 使わない（`if: success()  # !cancelled() にしない` を 持っていると 言わない） */
function kesuChu(s) { return String(s).replace(/\s+#.*$/, ''); }

/* ★この job は 流れの 下で 少なくとも これだけの 段を 見張る★（直した 後の 数＝下の --self-test が 測る）
 *   ＝if が 全部 消える／読み方が 壊れて 段 0 に なる 時に「抜け 0 の 緑」で 通さない為（taiketsu 11-06 止め1）
 *   ★今の 数 ちょうど★（緩めると 前から 数個の if が 抜けても 緑＝taiketsu 11-06 2回目 任意1）
 *   段を 減らす 直しを したら ここも 直す（増やした 時も 上げる） */
export const SAITEI = { 'webkit.yml': { webkit: 60 }, 'source-urls.yml': { check: 7 }, 'statutory-weekly.yml': { statutory: 5 } };

/* ★名指しで !cancelled() を 持つ 段★（流れの 頭の 段は「前に 流れが 無い」ので 抜けの 判じでは 守れない＝ここで 縛る）
 *   ブラウザを 入れる 段＝ここが 飛ばされると 後ろが 全部「ブラウザ無しの 赤」になる（11-06） */
export const HISSU = { 'webkit.yml': { webkit: [/^Install WebKit\b/, /^Install Chromium\b/] } };

/* ★判じ★ … { ファイル名: 字 } を 受けて 赤の 訳を 並べる（空＝緑） */
export function hantei(texts) {
  const aka = [];
  let kazu = 0;
  const kekka = {};
  for (const [f, t] of Object.entries(texts)) {
    const r = mitsukeru(t, f);
    kekka[f] = r; kazu += r.kazu;
    for (const a of r.ana) aka.push(a.file + ':' + a.line + ' job ' + a.job + ' 「' + a.step + '」に if（!cancelled()／always()）が 無い＝前が 赤だと 飛ばされる');
  }
  for (const [f, jobs] of Object.entries(SAITEI)) {
    if (!(f in texts)) { aka.push(f + ' が 無い（見張る 物が 消えた）'); continue; }
    for (const [j, n] of Object.entries(jobs)) {
      const got = (kekka[f].mihari[j] || 0);
      if (got < n) aka.push(f + ' job ' + j + ' の 見張れた 段が ' + got + '（' + n + ' 以上の はず）＝if が 消えたか 読み方が 壊れた（段を わざと 減らした なら この ファイルの SAITEI を 下げる）');
    }
  }
  for (const [f, jobs] of Object.entries(HISSU)) {
    if (!(f in texts)) continue;   // 無い 事は 上で 赤
    for (const [j, pats] of Object.entries(jobs)) {
      for (const p of pats) {
        const hit = kekka[f].dan.filter((d) => d.job === j && p.test(d.name));
        if (hit.length !== 1) aka.push(f + ' job ' + j + ' に ' + p + ' の 段が ' + hit.length + ' 個（1 の はず）');
        else if (!hit[0].ok) aka.push(f + ':' + hit[0].line + ' job ' + j + ' 「' + hit[0].name + '」に if（!cancelled()）が 無い＝前が 赤だと ブラウザが 入らない');
      }
    }
  }
  if (kazu < 50) aka.push('拾えた 段が ' + kazu + '＝少なすぎる（読み方が 壊れている）');
  return { aka, kazu, kekka };
}

function yomu() {
  const files = fs.readdirSync(WF).filter((f) => /\.ya?ml$/.test(f)).sort();
  const texts = {};
  for (const f of files) texts[f] = fs.readFileSync(path.join(WF, f), 'utf8');
  return { files, texts };
}

/* ★import した だけでは 走らない★（oshu-mae.mjs で 踏んだ 形・taiketsu 11-06 任意5） */
/*   比べるのは 本当の 場所どうし（realpath）＝ジャンクション／symlink 経由だと import.meta.url だけ 本当の 場所に なり、
 *   字で 比べると 出し 0 の exit 0 に なっていた（taiketsu 11-06 2回目 任意2） */
const honto = (p) => { try { return fs.realpathSync.native(p).toLowerCase(); } catch { return path.resolve(p).toLowerCase(); } };
const hashiru = !!process.argv[1] && honto(process.argv[1]) === honto(fileURLToPath(import.meta.url));

if (hashiru && process.argv.includes('--self-test')) {
  /* ★わざと 壊す★ … webkit.yml の 写しで、!cancelled() を 持つ 段の 後ろの 1段から if を 外す */
  let pass = 0, fail = 0;
  const ok = (c, msg) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ★' + msg + '★'); } };
  console.log('\n[dan-tobanai --self-test] わざと if を 外した 写しで 赤に なるか');
  const src = fs.readFileSync(path.join(WF, 'webkit.yml'), 'utf8');
  ok(mitsukeru(src, 'webkit.yml').ana.length === 0, '今の webkit.yml は 抜け0');
  const lines = src.split('\n');
  const idx = [];
  let seen = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s+if:\s*\$\{\{\s*!cancelled\(\)\s*\}\}\s*$/.test(lines[i])) { if (seen) idx.push(i); seen = true; }
  }
  ok(idx.length >= 3, '外せる if が ' + idx.length + ' 個（3つ 以上）');
  for (const k of [idx[0], idx[Math.floor(idx.length / 2)], idx[idx.length - 1]]) {
    const c = lines.slice(); c.splice(k, 1);
    const r = mitsukeru(c.join('\n'), 'webkit.yml');
    ok(r.ana.length === 1, (k + 1) + '行目の if を 外す ⇒ 抜け ' + r.ana.length + '（1 の はず）' + (r.ana[0] ? '：' + r.ana[0].step : ''));
  }
  /* 前の 段（install）が if 無しでも、!cancelled() の 段より 前なら 抜けに しない */
  const mae = 'jobs:\n  a:\n    steps:\n      - uses: actions/checkout@v4\n      - name: Install\n        run: npm i\n      - name: t1\n        if: ${{ !cancelled() }}\n        run: x\n      - name: t2\n        if: always()\n        run: y\n';
  ok(mitsukeru(mae, 'mae').ana.length === 0, '!cancelled() の 段より 前の install は 見ない');
  ok(mitsukeru(mae.replace('        if: always()\n', ''), 'mae').ana.length === 1, 'always() の 段から if を 外す ⇒ 抜け 1');
  /* job が 変わったら 数え直す */
  const ni = mae + '  b:\n    steps:\n      - name: Install2\n        run: npm i\n';
  ok(mitsukeru(ni, 'ni').ana.length === 0, '次の job の 頭の 段は 見ない（job ごとに 数え直す）');

  /* ★全部 消える／読めない を 緑に しない（taiketsu 11-06 止め1）★ */
  const { texts } = yomu();
  ok(hantei(texts).aka.length === 0, '今の 全 yml は 判じ 0件（緑）');
  const kaeru = (t) => hantei({ ...texts, 'webkit.yml': t }).aka.length;
  const zenkeshi = lines.filter((l) => !/^\s+if:\s*\$\{\{\s*!cancelled\(\)\s*\}\}\s*$/.test(l)).join('\n');
  ok(kaeru(zenkeshi) > 0, 'webkit.yml の !cancelled() を 全部 外す ⇒ 赤（抜け 0 でも 段の 下限で 拾う）');
  const yonji = src.replace(/^  webkit:/m, '    webkit:');
  ok(kaeru(yonji) > 0, 'webkit job を 4字下げに 崩す（段 0 に なる）⇒ 赤');
  /* 前から 2個（流れの 頭＝Install WebKit と 次）を 外す ⇒ 抜けには ならないが 下限と 名指しで 赤（2回目 任意1・3） */
  const ifIdx = lines.map((l, i) => (/^\s+if:\s*\$\{\{\s*!cancelled\(\)\s*\}\}\s*$/.test(l) ? i : -1)).filter((i) => i >= 0);
  const maeKara = (n) => lines.filter((_, i) => !ifIdx.slice(0, n).includes(i)).join('\n');
  ok(kaeru(maeKara(1)) > 0, '前から 1個（Install WebKit）の if を 外す ⇒ 赤');
  ok(kaeru(maeKara(2)) > 0, '前から 2個の if を 外す ⇒ 赤');
  const wkTomo = src.replace(/(- name: Install WebKit\n)\s+if:[^\n]*\n/, '$1');
  ok(wkTomo !== src && kaeru(wkTomo) > 0, 'Install WebKit の if だけ 外す ⇒ 赤（名指し）');
  const su = texts['source-urls.yml'];
  ok(!!su && hantei({ ...texts, 'source-urls.yml': su.replace(/^\s+if:[^\n]*(?:cancelled|always)[^\n]*\n/gm, '') }).aka.length > 0, 'source-urls.yml の if を 全部 外す ⇒ 赤（check の 下限）');
  const sw = texts['statutory-weekly.yml'];
  ok(!!sw && hantei({ ...texts, 'statutory-weekly.yml': sw.replace(/^\s+if:[^\n]*(?:cancelled|always)[^\n]*\n/gm, '') }).aka.length > 0, 'statutory-weekly.yml の if を 全部 外す ⇒ 赤（statutory の 下限）');
  /* if の 中に 字が 在る だけでは 持つと 言わない（3回目 任意1） */
  const chrIf = src.replace(/(- name: Install Chromium[^\n]*\n)(\s+if:)[^\n]*\n/, '$1$2 ${{ success() && !cancelled() }}\n');
  ok(chrIf !== src && kaeru(chrIf) > 0, 'Install Chromium の if を success() && !cancelled() に ⇒ 赤');
  ok(mitsukeru(mae.replace('if: always()', 'if: "!cancelled()"'), 'mae').ana.length === 0, 'if: "!cancelled()"（引用符）は 持つ');
  const nashi = { ...texts }; delete nashi['webkit.yml'];
  ok(hantei(nashi).aka.length > 0, 'webkit.yml が 消える ⇒ 赤');
  const chu = src.replace(/^    steps:\s*$/m, '    steps:   # 注');
  ok(chu !== src && kaeru(chu) === 0 && mitsukeru(chu, 'w').kazu === mitsukeru(src, 'w').kazu, 'steps 行に 注を 付けても 同じ 段数を 拾う（' + mitsukeru(chu, 'w').kazu + '）');
  /* if の 行末の 注の 字で「持っている」と 言わない */
  ok(mitsukeru(mae.replace('if: always()', 'if: success()  # always() にしない'), 'mae').ana.length === 1, 'if: success() の 注に always() の 字 ⇒ 抜け 1');
  /* import した だけで 走らない */
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', "await import(" + JSON.stringify(pathToFileURL(fileURLToPath(import.meta.url)).href) + "); console.log('KITA');"], { encoding: 'utf8' });
  ok(r.status === 0 && /KITA/.test(r.stdout) && !/dan-tobanai\]/.test(r.stdout), 'import した だけでは 走らない（終わり値 ' + r.status + '）');

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

if (hashiru) {
  const { files, texts } = yomu();
  const { aka, kazu, kekka } = hantei(texts);
  const w = kekka['webkit.yml'];
  console.log('\n[dan-tobanai] 前の 段が 赤でも 後ろの 段を 飛ばさない（' + files.length + '本・段 ' + kazu + '・webkit job の 見張れた 段 ' + ((w && w.mihari.webkit) || 0) + '）');
  for (const a of aka) console.log('  ✗ ★' + a + '★');
  if (!aka.length) console.log('  ✓ 抜け 0（' + files.join('・') + '）');
  console.log('\n' + (aka.length ? 0 : 1) + ' passed, ' + aka.length + ' failed');
  process.exit(aka.length ? 1 : 0);
}
