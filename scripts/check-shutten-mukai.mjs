/* check-shutten-mukai.mjs — ★出典は「一覧」か「実物」か＝実際に 取って 数字が 在るかで 決める★
 * =============================================================================
 * ★なぜ（2026-09-13 実測）★
 *   lib（statutory-rows.js）が 持つ 出典と、中央(statutory)が 持つ 出典が ★5件 食い違っていた★。
 *   中央の 方が PDF直リンク・年度ページで 具体的に 見えたが、
 *   ★「具体的」と「正しい」は 別★（地方の 労働局の ページも 混ざっている）。
 *   ⇒ ★どちらが 正か 決める前に、10本 ぜんぶ 実際に 取って 数字が 在るかを 見る★。
 *   （09-12 の 決まり「出典は 一覧では なく 直接 指す＝開いても 数字が 確かめられない物は 出典で ない」）
 *
 * ★測る事★ ①生きているか(HTTP) ②その年度の 字が 在るか ③★その kind の 実数が 字で 在るか★
 * ★PDF は 字に できない時は「読めない」と 言う★（読めない物を 緑に しない）
 *
 * 使い方: node scripts/check-shutten-mukai.mjs
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(import.meta.url);
const K = require_(path.join(ROOT, 'kyuyo/lib/koyo-hoken.js'));
const SHH = require_(path.join(ROOT, 'kyuyo/lib/shakaihoken-hyo.js'));
const D = require_(path.join(ROOT, 'kyuyo/lib/shotokuzei-densan.js'));
const WM = require_(path.join(ROOT, 'kyuyo/lib/warimashi.js'));

/* ★探す字は lib から 作る★（打ち込まない＝年が 変わっても ついてくる） */
const permil = (r) => (r * 1000).toFixed(1).replace(/\.0$/, '');   /* 0.0055 → 5.5 */
const pct = (r) => (r * 100).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');

const MI = [
  { kind: 'koyo', year: 2025,
    sagasu: [permil(K.RATES[2025].ippan), permil(K.RATES[2025].kensetsu), '令和7'],
    chuo: 'https://www.mhlw.go.jp/content/001401966.pdf',
    lib: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyouhoken_ryouritsu.html' },
  { kind: 'koyo', year: 2026,
    sagasu: [permil(K.RATES[2026].ippan), permil(K.RATES[2026].kensetsu), '令和8'],
    chuo: 'https://jsite.mhlw.go.jp/aichi-hellowork/list/okazaki/news/koyouhokennryouR08.html',
    lib: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyouhoken_ryouritsu.html' },
  { kind: 'shakaihoken', year: 2026,
    sagasu: ['令和8', '都道府県'],
    chuo: 'https://www.kyoukaikenpo.or.jp/about/business/insurance_rate/rate_prefectures/r08/index.html',
    lib: 'https://www.kyoukaikenpo.or.jp/g7/cat330/' },
  { kind: 'shotokuzei_densan', year: 2025,
    sagasu: [String(D.PARAMS[2025].fuyouKojo), '令和7'],
    chuo: 'https://www.nta.go.jp/publication/pamph/gensen/nencho2025/pdf/03.pdf',
    lib: 'https://www.nta.go.jp/users/gensen/' },
  { kind: 'warimashi', year: 2023,
    sagasu: [String(Math.round(WM.RATE.ot * 100)), String(Math.round(WM.RATE.over60 * 100))],
    chuo: 'https://jsite.mhlw.go.jp/wakayama-roudoukyoku/newpage_00470.html',
    lib: 'https://www.mhlw.go.jp/hourei/doc/kouji/K060000-A5.pdf' },
];

async function toru(u) {
  try {
    const r = await fetch(u, { headers: { 'User-Agent': 'rakunally-shutten-check' }, redirect: 'follow' });
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    if (!r.ok) return { ok: false, code: r.status, ct, ji: null };
    const buf = Buffer.from(await r.arrayBuffer());
    if (ct.indexOf('pdf') >= 0 || buf.slice(0, 4).toString() === '%PDF') {
      return { ok: true, code: r.status, ct: 'pdf', ji: null, byte: buf.length };   /* ★字に できない＝読めない★ */
    }
    return { ok: true, code: r.status, ct, ji: buf.toString('utf8'), byte: buf.length };
  } catch (e) { return { ok: false, code: 0, ct: '', ji: null, naze: String(e.message || e).slice(0, 60) }; }
}

console.log('\n[check-shutten-mukai] 出典を 実際に 取って 数字が 在るか 見る');
for (const m of MI) {
  console.log('\n■ ' + m.kind + ':' + m.year + '  探す字 … ' + m.sagasu.join(' / '));
  for (const [na, u] of [['中央', m.chuo], ['lib ', m.lib]]) {
    const r = await toru(u);
    let iu;
    if (!r.ok) iu = '★死んでいる★ ' + (r.code || r.naze);
    else if (r.ji === null) iu = '🟡 PDF＝この道具では ★字に できない（読めない）★ ' + r.byte + 'バイト';
    else {
      const atta = m.sagasu.filter((s) => r.ji.indexOf(s) >= 0);
      iu = (atta.length === m.sagasu.length ? '★全部 在る★' : atta.length ? '一部だけ ' + atta.length + '/' + m.sagasu.length : '★1つも 無い★')
        + '（' + atta.join(',') + '）';
    }
    console.log('   ' + na + ' ' + iu + '\n        ' + u);
  }
}
console.log('\n★PDF は この道具では 読めない＝「一覧に 数字が 無い」だけを 根拠に 向きを 決めない★');
