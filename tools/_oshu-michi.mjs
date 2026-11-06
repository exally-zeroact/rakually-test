/* _oshu-michi.mjs — ★押す前の 網の 1本の 道（段の 名簿を 順に 回す 子）★（2026-11-03・網の 4つ割り 押し3）
 * ============================================================================
 * ★呼ぶのは tools/oshu-mae.mjs だけ★（親と 同じ ROOT の 此の ファイルを 起こす＝押す sha に 此の ファイルが 無くても 動く・taiketsu 任4）
 *   node tools/_oshu-michi.mjs <名簿.json> <結果.jsonl>
 *   名簿＝{ cwd: 回す 作業木, dan: [{ i, c, kuchi }] }（kuchi＝試験口に 触るか・揺れの 回し直しに 使う）
 *   結果＝1段 ごとに 1行の JSON（★途中で 止められても それまでの 段は 読める★）
 *     { i, status, mi, byou, soZen, seZen, so, se, oke, how, b }
 *       status … 終わり値（時間切れ・起こせない＝null）
 *       mi …… 走らせられない 訳（無ければ null）
 *       so/se … 赤の 時だけ 終わりの 40行（緑は 控えない＝今と 同じ）
 *       oke/how/b … 緑の 時の 4つ組（_bunrui.mjs の bunrui）
 * ★1段の 上限 180秒（今と 同じ）★。★時間切れは 孫まで 止める（Windows は taskkill /T /F）★
 *   ＝spawnSync の timeout は 殻（cmd.exe）しか 殺さず、node・ブラウザが 残って 次の 段と 同時に 試験口を 叩き得た（設計前 taiketsu 止3）
 * ★oshu-mae.mjs を import しない★（読むと 網が 走る＝11-02 踏んだ）
 */
import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { bunrui } from './_bunrui.mjs';

export const JOGEN_MS = 180000;
export const AKA_GYO = 40;
const NL = String.fromCharCode(10);
export const kiru = (s) => String(s || '').split(NL).map((x) => x.replace(/\s+$/, '')).filter((x) => x.trim());

/* ★孫まで 止める★ */
export function kiTomeru(pid) {
  if (!pid) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/T', '/F', '/PID', String(pid)], { encoding: 'utf8' });
  else { try { process.kill(-pid, 'SIGKILL'); } catch (err) { try { process.kill(pid, 'SIGKILL'); } catch (err2) { /* ★もう 居ない★ */ } } }
}

/* ★止めて よいか★（時間切れ と Ctrl-C で 同じ 決まり・11-04）
   ★殻が もう 終わって いたら 止めない★＝終わった pid は Windows が 使い回す＝関係ない 木を 止め得る（taiketsu 任意1）
   ★Windows だけ★＝Linux は 組に 人が 残る 間は 番号を 使い回さない＝kill(-pid) で 同じ 組の 孫まで 止める */
export function tometeYoi(ch, plat = process.platform) {
  if (!ch || !ch.pid) return false;
  return plat !== 'win32' || (ch.exitCode === null && ch.signalCode === null);
}

/* ★1段を 回す★＝{ status, mi, so, se, byou } */
/* ★切った 後の 猶予★（11-03 本番前 taiketsu 任意①）＝止めても 管（stdout/stderr）を 持った 孫が 残ると close が 来ず
   網が いつまでも 終わらない（親が 先に 死んで taskkill /T が 木を 辿れない 時）。切って この 秒 待っても 閉じなければ
   こちらの 管を 壊して 走らせられない（赤）で 解く。★180秒 より 前に 閉じた 段の 扱いは 変えない★ */
export const YUUYO_MS = 10000;
export function danHashiru(c, cwd, jogenMs = JOGEN_MS, yuuyoMs = YUUYO_MS) {
  return new Promise((res) => {
    const t0 = Date.now();
    let so = '', se = '', owari = false, kireta = false, ookii = false;
    const MAX = 32 * 1024 * 1024;
    let ch;
    try {
      /* ★stdin は ignore★＝前の spawnSync と 同じく 入力は すぐ 終わり（読む 段が 180秒 待たない・本番前 taiketsu 任B） */
      ch = spawn(c, { cwd, shell: true, detached: process.platform !== 'win32', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) { res({ status: null, mi: '起こせない（' + err.message + '）', so: '', se: '', byou: 0 }); return; }
    danHashiru.imaCh = ch;
    /* ★setEncoding★＝塊の 境目で 日本語が 割れない（任C）。★32MB 超え＝黙って 切らず 走らせられない に 数える★（前の ENOBUFS と 同じ 向き） */
    ch.stdout.setEncoding('utf8'); ch.stderr.setEncoding('utf8');
    ch.stdout.on('data', (b) => { if (so.length < MAX) so += b; else ookii = true; });
    ch.stderr.on('data', (b) => { if (se.length < MAX) se += b; else ookii = true; });
    let yuuyo = null;
    const tm = setTimeout(() => {
      kireta = true; if (tometeYoi(ch)) kiTomeru(ch.pid);
      yuuyo = setTimeout(() => {
        try { ch.stdout.destroy(); ch.stderr.destroy(); } catch (err) { /* ★もう 閉じた★ */ }
        owaru(null, '★' + (jogenMs / 1000) + '秒で 切ったが 管が 閉じない（孫が 残った 見込み）★');
      }, yuuyoMs);
    }, jogenMs);
    const owaru = (status, mi) => {
      if (owari) return; owari = true; clearTimeout(tm); if (yuuyo) clearTimeout(yuuyo);
      res({ status, mi, so, se, byou: (Date.now() - t0) / 1000 });
    };
    ch.on('error', (err) => owaru(null, '起こせない（' + err.message + '）'));
    ch.on('close', (code) => {
      if (kireta) owaru(null, '★' + (jogenMs / 1000) + '秒で 切った（孫まで 止めた）★');
      else if (code === null) owaru(null, '終わり値が 無い（外から 殺された）');
      else if (ookii) owaru(null, '★出しが ' + (MAX / 1024 / 1024) + 'MB を 超えた（字を 全部 読めない）★');
      else owaru(code, null);
    });
  });
}

/* ★揺れ（Windows の 0xC0000409）は 1回だけ 回し直す★（11-06・設計前 taiketsu 止め0 の 案B を 狭めた形）
 *   pull-statutory --check が 網の 中でだけ 字を 1つも 出さずに 3221226505 で 落ちた（11-03・11-06 の 2回・単独 100回は 0）。
 *   ★回し直すのは 次の 全部が 揃う 時だけ★：終わり値が ちょうど 3221226505／出しも 叫びも 空／★試験口に 触らない 段（kuchi===false）★
 *   ＝字を 出してから 落ちた 段・他の 終わり値・試験口に 触る 段（分からない も 触る 側）は 回し直さず 赤。2回目も 落ちたら 赤。
 *   ★回し直した 段は 結果の 行に yure を 残す★＝親が まとめの 最後の 行に「揺れ N」と 並べ、消えない 控えに 書き足す（隠さない）。 */
export const YURE_CODE = 3221226505;
export function yureKa(r, kuchi) {
  return !!r && !r.mi && r.status === YURE_CODE && !String(r.so || '').trim() && !String(r.se || '').trim() && kuchi === false;
}

/* ★結果の 1行を 作る★ */
export function kekkaGyou(d, r) {
  const o = { i: d.i, status: r.status, mi: r.mi, byou: r.byou, soZen: 0, seZen: 0, so: [], se: [] };
  if (!r.mi && r.status !== 0) {
    const s1 = kiru(r.so), s2 = kiru(r.se);
    o.soZen = s1.length; o.seZen = s2.length; o.so = s1.slice(-AKA_GYO); o.se = s2.slice(-AKA_GYO);
  } else if (!r.mi) {
    const b = bunrui(0, (r.so || '') + NL + (r.se || ''));
    o.oke = b.oke; o.how = b.how; o.b = b;
  }
  return o;
}

const ware = process.argv[1] && /_oshu-michi\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (ware) {
  const [meibo, kekka] = process.argv.slice(2);
  let m;
  try { m = JSON.parse(fs.readFileSync(meibo, 'utf8')); } catch (err) {
    console.error('[oshu-michi] ★名簿を 読めない★ ' + err.message); process.exit(2);
  }
  if (!m || !Array.isArray(m.dan) || !m.dan.length || !m.cwd) { console.error('[oshu-michi] ★名簿が 空か 形が 違う★'); process.exit(2); }
  /* ★Ctrl-C も 時間切れと 同じ 決まり★（11-04）＝前は 殻の 生死を 見ずに 前の 段の pid を taskkill＝使い回しの 番号を 撃ち得た */
  const yame = () => { const c = danHashiru.imaCh; if (tometeYoi(c)) kiTomeru(c.pid); process.exit(1); };
  ['SIGINT', 'SIGTERM', 'SIGHUP'].forEach((sg) => process.on(sg, yame));
  for (const d of m.dan) {
    let r = await danHashiru(d.c, m.cwd);
    let yure = null;
    if (yureKa(r, d.kuchi)) { yure = { status: r.status, byou: r.byou }; r = await danHashiru(d.c, m.cwd); }
    const o = kekkaGyou(d, r);
    if (yure) o.yure = yure;
    fs.appendFileSync(kekka, JSON.stringify(o) + NL);
  }
  process.exit(0);
}
