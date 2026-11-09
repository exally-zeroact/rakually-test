/* okuru-mado.mjs — ★「📄 印刷 / 送る」で 開く 窓と 落とす 数を 本物の Chromium で 数える★（2026-11-09）
 * =============================================================================
 * 司さん 10-29「PDFで保存/送ると印刷のボタンは同じ画面が開かれるんやけん 1つのボタンにして印刷/送るにまとめろ」
 *   ＝見本 daikou-seikyu（btnInvPdf「📄 印刷 / 送る」・insatsuSumaho）に 揃えた。
 *
 * ★なぜ 本物の Chromium か★（taiketsu 11-09 止1・止2）
 *   止1＝window.open(url,'_blank','noopener') は 窓を 開くのに 返りが null（Chromium 148 実測）
 *        ＝毎回「開けなかった」と 思って 同じ PDF を ★落としも して★ 嘘の 知らせを 出していた。
 *   止2＝jsdom の window.open 偽物は 何を 返すかを 試験が 決めてしまう＝空振り。本物で 窓と 落としを 数える。
 *
 * 見る物（js/file-out.js の FileOut.openInViewer を 本物の 頁で 指で 押して 呼ぶ）:
 *   ① パソコン（Windows の Chrome）＝窓 1・落とし 0・返り how=open
 *   ② iPhone の UA＝窓 0・落とし 1・返り saved=true（新しい 窓は 戻れなく なる＝見本 insatsuSumaho）
 *   ③ Android の UA＝窓 0・落とし 1・返り saved=true
 *   ④ 落とした 名前は 渡した 名前の まま（.pdf）
 *
 * 使い方: node seikyu/tests/okuru-mado.mjs [--self-test]
 *   --self-test＝壊し方を 1つずつ 当てて 全部 赤に なるか（noopener を 戻す／スマホの 分けを 外す）
 * 借りられない 時は ★未測定★（exit 2・緑と 書かない）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { borrow, launch as pwLaunch } from '../../scripts/_borrow-playwright.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELF = process.argv.includes('--self-test');
const MOTO = fs.readFileSync(path.join(ROOT, 'js', 'file-out.js'), 'utf8');

const BREAKS = {
  noopener: ["w = global.open(url, '_blank');", "w = global.open(url, '_blank', 'noopener');"],
  'sumaho-nashi': ['if (sumahoOf()) return', 'if (false) return'],
};

const UA = {
  pc: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36',
};

async function hakaru(b, src, kind) {
  const ctx = await b.newContext({
    userAgent: UA[kind], acceptDownloads: true,
    ...(kind === 'pc' ? {} : { isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } }),
  });
  const pg = await ctx.newPage();
  let mado = 0, otoshi = 0, madoOtoshi = 0;
  const names = [];
  /* ★うちの <a download>（渡した 名前で 落ちる）★だけを「落とし」と 数える。
     headless の Chromium は PDF を 見る 物が 無く、窓に 渡した PDF を blob の 番号の 名前（例 482fc766-….pdf）で
     落として 見せ、それが 元の 頁の 落としとして 届く（2026-11-09 実測）＝本物の 端末では 窓で 開く 物なので 別に 数える */
  const NAME = '20261101_見本工業_請求書.pdf';
  ctx.on('page', (p) => { if (p !== pg) { mado++; p.on('download', () => { madoOtoshi++; }); } });
  pg.on('download', (d) => { const nm = d.suggestedFilename(); if (nm === NAME) { otoshi++; names.push(nm); } else madoOtoshi++; });
  await pg.setContent('<!doctype html><meta charset="utf-8"><button id="b">📄 印刷 / 送る</button>');
  await pg.addScriptTag({ content: src });
  await pg.evaluate(() => {
    window.__r = null;
    document.getElementById('b').onclick = () => {
      const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0x25, 0x45, 0x4f, 0x46]);
      window.FileOut.openInViewer(bytes, '20261101_見本工業_請求書.pdf').then((r) => { window.__r = r; }, (e) => { window.__r = { err: String(e) }; });
    };
  });
  if (kind === 'pc') await pg.click('#b'); else await pg.tap('#b');
  await pg.waitForFunction(() => window.__r !== null, null, { timeout: 10000 });
  await pg.waitForTimeout(1500);   /* 窓と 落としが 届く 間 */
  const r = await pg.evaluate(() => window.__r);
  await ctx.close();
  return { r, mado, otoshi, madoOtoshi, names };
}

async function ikkai(b, src, log) {
  let pass = 0, fail = 0;
  const T = (n, c, why) => { if (c) { pass++; if (log) console.log('  ✓ ' + n); } else { fail++; if (log) console.log('  ✗ ' + n + ' — ' + why); } };
  const pc = await hakaru(b, src, 'pc');
  T('① パソコン＝窓 1・落とし 0・返り how=open', pc.mado === 1 && pc.otoshi === 0 && pc.r && pc.r.how === 'open',
    '窓 ' + pc.mado + '・落とし ' + pc.otoshi + '（窓の 中 ' + pc.madoOtoshi + '・名前 ' + pc.names.join('/') + '）・' + JSON.stringify(pc.r));
  const ip = await hakaru(b, src, 'iphone');
  T('② iPhone＝窓 0・落とし 1・返り saved=true', ip.mado === 0 && ip.otoshi === 1 && ip.r && ip.r.saved === true,
    '窓 ' + ip.mado + '・落とし ' + ip.otoshi + '・' + JSON.stringify(ip.r));
  const an = await hakaru(b, src, 'android');
  T('③ Android＝窓 0・落とし 1・返り saved=true', an.mado === 0 && an.otoshi === 1 && an.r && an.r.saved === true,
    '窓 ' + an.mado + '・落とし ' + an.otoshi + '・' + JSON.stringify(an.r));
  T('④ 落とした 名前は 渡した 名前の まま', ip.names[0] === '20261101_見本工業_請求書.pdf' && an.names[0] === '20261101_見本工業_請求書.pdf',
    ip.names.concat(an.names).join(','));
  return { pass, fail };
}

const ch = await borrow('okuru-mado', 'chromium');
if (!ch) { console.log('🟡 ★未測定★ playwright を 借りられない（0件＝合格 とは 書かない）'); process.exit(2); }
const b = await pwLaunch('okuru-mado', ch, undefined, 'chromium');
let code = 0;
try {
  if (!SELF) {
    console.log('\n[okuru-mado] 「📄 印刷 / 送る」の 窓と 落としを 本物の Chromium で 数える');
    const { pass, fail } = await ikkai(b, MOTO, true);
    console.log('\nKEKKA ' + pass + ' passed ' + fail + ' failed');
    code = fail ? 1 : 0;
  } else {
    let aka = 0;
    const keys = Object.keys(BREAKS);
    for (const k of keys) {
      const [a, z] = BREAKS[k];
      const n = MOTO.split(a).length - 1;
      if (n !== 1) { console.log('  ✗ 壊し ' + k + ' の 字が ' + n + ' か所（1 で ない）＝壊せていない'); continue; }
      const { fail } = await ikkai(b, MOTO.replace(a, z), false);
      console.log('  ' + (fail ? '✓' : '✗') + ' 壊し ' + k + ' → 赤 ' + fail);
      if (fail) aka++;
    }
    console.log('\n自己確認：' + keys.length + '種 中 赤 ' + aka);
    code = aka === keys.length ? 0 : 1;
  }
} finally {
  await b.close();
}
process.exit(code);
