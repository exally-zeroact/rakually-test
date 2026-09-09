/* _hakaru-sen.mjs — ★紙の 絵の 画素を 数えて 横の線の 太さを 測る★
 * ★見張りでは ない★＝赤/緑を 出さない。手で 測る為の 道具。
 * 2026-09-09 司さん「②だけ 背景いれて 合わせてない」「中計の上の線だけ 濃い」を
 * ★思い込みで 直さず 測ってから 直す★ 為に 作った。
 * 使い方: node scripts/_hakaru-sen.mjs
 */
import fs from 'node:fs';
import { borrow, launch as pwLaunch } from './_borrow-playwright.mjs';
const OUT = 'C:/Users/zeroa/AppData/Local/Temp/claude/C--WINDOWS-System32-WindowsPowerShell-v1-0/95680cdf-f1bb-480f-a53c-6f0f118a9fb3/scratchpad';
const ch = await borrow('hakaru-sen', 'chromium');
const b = await pwLaunch('hakaru-sen', ch, undefined, 'chromium');
const pg = await b.newPage({ viewport: { width: 400, height: 300 } });
const png = fs.readFileSync(OUT + '/youshiki-3.png').toString('base64');
await pg.setContent('<img id="a" src="data:image/png;base64,' + png + '">', { waitUntil: 'load' });
const r = await pg.evaluate(async () => {
  const img = document.getElementById('a');
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  c.getContext('2d').drawImage(img, 0, 0);
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const W = c.width, H = c.height;
  const out = [];
  /* ★表の 中ほど（左から 15%〜85%）で 横1本ぶんの 平均の 暗さ★ */
  for (let y = 0; y < H; y++) {
    let s = 0, n = 0;
    for (let x = Math.round(W * 0.15); x < W * 0.85; x += 3) {
      const i = (y * W + x) * 4;
      s += (d[i] + d[i + 1] + d[i + 2]) / 3; n++;
    }
    const avg = s / n;
    if (avg < 250) out.push({ y: y, akarusa: Math.round(avg) });
  }
  /* ★続いた行を 1本の 線に まとめる★ */
  const sen = [];
  for (const o of out) {
    const last = sen[sen.length - 1];
    if (last && o.y - last.y2 <= 1) { last.y2 = o.y; last.min = Math.min(last.min, o.akarusa); last.futosa++; }
    else sen.push({ y1: o.y, y2: o.y, min: o.akarusa, futosa: 1 });
  }
  return { W: W, H: H, sen: sen.filter((s) => s.min < 240) };
});
console.log('絵 ' + r.W + '×' + r.H + '（A4の2倍）');
console.log('★横の 線★（暗いほど 濃い。字の行は 太く 出る）');
r.sen.forEach((s) => console.log('  y ' + String(s.y1).padStart(4) + '〜' + String(s.y2).padStart(4)
  + ' ／ 太さ ' + String(s.futosa).padStart(3) + 'px ／ いちばん 濃い所 ' + s.min));
await b.close();
