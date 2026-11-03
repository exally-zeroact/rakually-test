/* _oshu-michi.mjs — ★押す前の 網の 1本の 道（段の 名簿を 順に 回す 子）★（2026-11-03・網の 4つ割り 押し3）
 * ============================================================================
 * ★呼ぶのは tools/oshu-mae.mjs だけ★（親と 同じ ROOT の 此の ファイルを 起こす＝押す sha に 此の ファイルが 無くても 動く・taiketsu 任4）
 *   node tools/_oshu-michi.mjs <名簿.json> <結果.jsonl>
 *   名簿＝{ cwd: 回す 作業木, dan: [{ i, c }] }
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

/* ★1段を 回す★＝{ status, mi, so, se, byou } */
export function danHashiru(c, cwd, jogenMs = JOGEN_MS) {
  return new Promise((res) => {
    const t0 = Date.now();
    let so = '', se = '', owari = false, kireta = false, ookii = false;
    const MAX = 32 * 1024 * 1024;
    let ch;
    try {
      /* ★stdin は ignore★＝前の spawnSync と 同じく 入力は すぐ 終わり（読む 段が 180秒 待たない・本番前 taiketsu 任B） */
      ch = spawn(c, { cwd, shell: true, detached: process.platform !== 'win32', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) { res({ status: null, mi: '起こせない（' + err.message + '）', so: '', se: '', byou: 0 }); return; }
    danHashiru.imaPid = ch.pid;
    /* ★setEncoding★＝塊の 境目で 日本語が 割れない（任C）。★32MB 超え＝黙って 切らず 走らせられない に 数える★（前の ENOBUFS と 同じ 向き） */
    ch.stdout.setEncoding('utf8'); ch.stderr.setEncoding('utf8');
    ch.stdout.on('data', (b) => { if (so.length < MAX) so += b; else ookii = true; });
    ch.stderr.on('data', (b) => { if (se.length < MAX) se += b; else ookii = true; });
    const tm = setTimeout(() => { kireta = true; kiTomeru(ch.pid); }, jogenMs);
    const owaru = (status, mi) => {
      if (owari) return; owari = true; clearTimeout(tm);
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
  const yame = () => { if (danHashiru.imaPid) kiTomeru(danHashiru.imaPid); process.exit(1); };
  ['SIGINT', 'SIGTERM', 'SIGHUP'].forEach((sg) => process.on(sg, yame));
  for (const d of m.dan) {
    const r = await danHashiru(d.c, m.cwd);
    fs.appendFileSync(kekka, JSON.stringify(kekkaGyou(d, r)) + NL);
  }
  process.exit(0);
}
