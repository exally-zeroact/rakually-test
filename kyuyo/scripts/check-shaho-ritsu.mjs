/* check-shaho-ritsu.mjs — ★社会保険の 率が 法令と 合って いるか（★外を 叩く★＝週1）★
 * ============================================================================
 * ★なぜ（2026-09-19 司さん「作る」）★
 *   `kyuyo/lib/shakaihoken-hyo.js` の 率は ★人が 毎年 手で 直す★ 物。
 *   労災には `check-rousai-ritsu.mjs` が 在るのに、★社保の 率を 突き合わせる 物は 0本★だった。
 *   ⇒ ★法令が 変わったのに lib が そのままだと、保険料が 静かに ずれる★。
 *
 * ★これは ci.yml に 入れない★（外の 役所を 叩く＝向こうの 都合で 赤に なる）。
 *   ★`source-urls.yml`（週1・手動）★に 入れる＝`check-rousai-ritsu.mjs` と ★同じ 流儀★。
 *
 * ★★見られるのは 4つ中 3つ★★（★この 1行を 出しの 頭に 必ず 出す★）
 *   ★厚年★ … ★数そのもの★が 条文に 在る（厚年法81条4項「千分の百八十三・〇〇」）
 *   ★健保★ … ★幅★が 条文に 在る（健保法160条「千分の三十から千分の百三十までの範囲内」）
 *   ★雇用★ … ★数そのもの★が 条文に 在る（★徴収法★12条4項「千分の八／十」＋「千分の五」…）
 *   ★介護★ … ★数も 幅も 条文に 無い★（健保法156・160・168条に 語は 在るが 率は 無い）
 *             ⇒ ★機械では 見られません★＝★赤にも 緑にも せず 字で 止める★
 *   ＝★0件と 該当なしは 別★を ★この 見張り 自身に★ 当てた 物。
 *
 * ★★「取れた」は「合って いる」では ない★★（2026-09-19 実測で 踏んだ）
 *   健康保険法を `322AC0000000070` と 打ったら ★宮内庁法が 正しく 200 で 返って きた★。
 *   通信も 形も 正しく、★中身だけ 別物★。条が 24本＝少なすぎる事で 気づいた。
 *   ⇒ ★★引いた 後に 返って きた 法令名を 出し、はずの 名前と 違えば 赤★★
 *     ＝★覚書は 読むでは 足りない＝道具に 持たせる★
 *
 * ★「URL が 生きて いる」は「中身が 同じ」では ない★
 *   `check-source-urls` は ★生きて いるかだけ★。★中身を 比べるのは この 紙★。
 *
 * 使い方: node kyuyo/scripts/check-shaho-ritsu.mjs [--self-test]
 *   --self-test … ★外に 出ずに★ 読み取りの 手順だけ 作り物で 確かめる
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = process.argv.indexOf('--self-test') >= 0;

/* ★元（一次情報）★＝★id は 書いてよい／但し 名前で 確かめる★（上の「取れた≠合っている」） */
export const MOTO = [
  { key: 'kounen', id: '329AC0000000115', na: '厚生年金保険法', jou: '81', mi: '4項の 表（保険料率）' },
  { key: 'kenpo', id: '211AC0000000070', na: '健康保険法', jou: '160', mi: '1項（一般保険料率の 範囲）' },
  { key: 'chosyu', id: '344AC0000000084', na: '労働保険の保険料の徴収等に関する法律', jou: '12', mi: '4項（雇用保険率）' },
];
const API = 'https://laws.e-gov.go.jp/api/2/law_data/';

/* ★漢数字を 数に する★（★千分の百八十三・〇〇 → 183.00★）＝★記憶で 書かず 字から 作る★ */
const KAN = { 〇: 0, 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
export function kanSuu(s) {
  const t = String(s || '');
  let kei = 0, ima = 0, sho = '';
  let ten = t.indexOf('・');
  const sei = ten >= 0 ? t.slice(0, ten) : t;
  if (ten >= 0) { for (const c of t.slice(ten + 1)) if (KAN[c] != null) sho += String(KAN[c]); }
  for (const c of sei) {
    if (KAN[c] != null) { ima = KAN[c]; continue; }
    if (c === '十') { kei += (ima || 1) * 10; ima = 0; continue; }
    if (c === '百') { kei += (ima || 1) * 100; ima = 0; continue; }
    if (c === '千') { kei += (ima || 1) * 1000; ima = 0; continue; }
  }
  kei += ima;
  const n = Number(String(kei) + (sho ? '.' + sho : ''));
  return Number.isFinite(n) ? n : null;
}

/* ★条を 1本 取り出す★（法令データの 形は `tag`/`children`） */
export function jouWoHiku(full, num) {
  const deta = [];
  const walk = (n, o) => { if (!n) return o; if (typeof n === 'string') { o.push(n); return o; }
    if (Array.isArray(n)) { n.forEach((x) => walk(x, o)); return o; }
    if (n.children) walk(n.children, o); return o; };
  const arts = (n) => { if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(arts); return; }
    if (n.tag === 'Article') deta.push({ num: (n.attr && n.attr.Num) || '', t: walk(n, []).join('') });
    if (n.children) arts(n.children); };
  arts(full);
  const x = deta.find((y) => y.num === String(num));
  return { honsu: deta.length, jou: x ? x.t : '' };
}

/* ★厚年＝表の ★最後の 段★（今の 率）★ */
export function kounenRitsu(jou) {
  const i = jou.indexOf('保険料率は、次の表');
  if (i < 0) return { ok: false, naze: '★「保険料率は、次の表」が 無い★（条文の 形が 変わった？）' };
  const tail = jou.slice(i, i + 2500);
  const m = [...tail.matchAll(/月分千分の([^月平令]+)/g)].map((z) => z[1]);
  if (!m.length) return { ok: false, naze: '★「月分千分の…」が 1つも 無い★' };
  const last = m[m.length - 1];
  const n = kanSuu(last);
  return n == null ? { ok: false, naze: '★漢数字を 数に できない（' + last + '）★' }
    : { ok: true, sen: n, ritsu: n / 1000, ji: '千分の' + last, dan: m.length };
}

/* ★健保＝★幅★（千分の◯から 千分の◯まで）★ */
export function kenpoHaba(jou) {
  const m = jou.match(/千分の([^、。]{1,14}?)から千分の([^、。]{1,14}?)までの範囲内/);
  if (!m) return { ok: false, naze: '★「千分の◯から千分の◯までの範囲内」が 無い★' };
  const a = kanSuu(m[1]), b = kanSuu(m[2]);
  return (a == null || b == null) ? { ok: false, naze: '★幅の 漢数字を 数に できない★' }
    : { ok: true, shita: a / 1000, ue: b / 1000, ji: '千分の' + m[1] + 'から千分の' + m[2] + 'まで' };
}

/* ★★雇用＝★幅★で 見る（一致では ない）★★（2026-09-19 引いて 分かった）
   ★危なかった 所★ … 12条4項の「千分の八」は ★基本の 率★で、
     条文 自身が「★次項の規定により変更されたときは、その変更された率とする★」と 言う。
     lib は ★令和8年度の 引下げ後★（一般 0.005）＝★一致で 見たら 嘘の 赤★に なる。
   ★12条5項（原文）★
     「失業等給付費等充当徴収保険率を ★千分の四から千分の十二まで★
      （前項第一号に規定する事業＝農林水産・建設等は ★千分の六から千分の十四まで★）の
      範囲内において 変更することができる」
   ⇒ ★健保と 同じく「幅の 中か」で 見る★ */
export function koyoHaba(jou) {
  const m = jou.match(/失業等給付費等充当徴収保険率を千分の([^、。]{1,10}?)から千分の([^、。]{1,10}?)まで/);
  if (!m) return { ok: false, naze: '★12条5項の 変更の 幅を 読めない★' };
  const a = kanSuu(m[1]), b = kanSuu(m[2]);
  return (a == null || b == null) ? { ok: false, naze: '★幅の 漢数字を 数に できない★' }
    : { ok: true, shita: a / 1000, ue: b / 1000, ji: '千分の' + m[1] + 'から千分の' + m[2] + 'まで' };
}

/* ★雇用＝条文の 数（合計の 素）★ */
export function koyoRitsu(jou) {
  const i = jou.indexOf('雇用保険率は、次の各号');
  if (i < 0) return { ok: false, naze: '★「雇用保険率は、次の各号」が 無い★' };
  const t = jou.slice(i, i + 1600);
  const shitsugyo = t.match(/失業等給付費等充当徴収保険率[^千]*千分の([^（(、。]{1,10})/);
  const kikin = t.match(/千分の([^（(、。]{1,10})とし、次項/);
  const ikuji = t.match(/育児休業給付費充当徴収保険率[^千]*千分の([^（(、。]{1,10})/);
  if (!shitsugyo || !ikuji) return { ok: false, naze: '★失業等給付／育児休業給付の 率を 読めない★' };
  return { ok: true,
    ippan: kanSuu(shitsugyo[1]) / 1000,
    tokutei: kikin ? kanSuu(kikin[1]) / 1000 : null,
    ikuji: kanSuu(ikuji[1]) / 1000,
    ji: '失業等給付等 千分の' + shitsugyo[1] + (kikin ? '（農林水産・建設等 千分の' + kikin[1] + '）' : '')
      + '＋育児休業給付 千分の' + ikuji[1] };
}

let pass = 0, fail = 0, mi = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };
const MI = (n, m) => { mi++; console.log('  🟡 ★決められません★ ' + n + (m ? ' … ' + m : '')); };

/* ══════════ 自己確認（★外に 出ない★） ══════════ */
if (SELF) {
  console.log('\n[check-shaho-ritsu] ★自己確認★（★外に 出ない★・読み取りの 手順だけ）');
  let ng = 0;
  const iu = (n, good) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + n + (good ? '' : '  ★思っていたのと 違う★')); };
  iu('★漢数字 百八十三・〇〇 → 183★', kanSuu('百八十三・〇〇') === 183);
  iu('★漢数字 三十 → 30★', kanSuu('三十') === 30);
  iu('★漢数字 百三十 → 130★', kanSuu('百三十') === 130);
  iu('★漢数字 八 → 8★', kanSuu('八') === 8);
  const k = kounenRitsu('保険料率は、次の表の…平成二十八年九月から平成二十九年八月までの月分千分の百八十一・八二平成二十九年九月以後の月分千分の百八十三・〇〇');
  iu('★厚年＝表の 最後の 段を 取る★', k.ok && k.ritsu === 0.183 && k.dan === 2);
  const h = kenpoHaba('一般保険料率は、千分の三十から千分の百三十までの範囲内において、協会が決定する');
  iu('★健保＝幅を 取る（0.03〜0.13）★', h.ok && h.shita === 0.03 && h.ue === 0.13);
  const y = koyoRitsu('雇用保険率は、次の各号に掲げる率の…一失業等給付費等充当徴収保険率（…）千分の八（次に掲げる事業…については、千分の十とし、次項の規定により…）イ…二育児休業給付費充当徴収保険率（…）千分の五（第八項…）');
  iu('★雇用＝一般8／特定10／育休5★', y.ok && y.ippan === 0.008 && y.tokutei === 0.01 && y.ikuji === 0.005);
  const yh = koyoHaba('…失業等給付費等充当徴収保険率を千分の四から千分の十二まで（前項第一号に規定する事業については、千分の六から千分の十四まで）の範囲内において変更することができる');
  iu('★雇用の 幅を 取る（0.004〜0.012）★', yh.ok && yh.shita === 0.004 && yh.ue === 0.012);
  iu('★形が 変わったら 読めないと 言う★', kounenRitsu('なにもない').ok === false);
  console.log(ng ? '★自己確認 ' + ng + '件 おかしい★' : '  ★9通り ぜんぶ 思った通り★');
  process.exit(ng ? 1 : 0);
}

/* ══════════ 本番（★外を 叩く★） ══════════ */
const R = require(path.join(ROOT, 'lib/shakaihoken-hyo.js'));
const KYO = new Date().toISOString().slice(0, 10);

console.log('\n[check-shaho-ritsu] 社会保険の 率が 法令と 合って いるか');
console.log('  ★★見られるのは 4つ中 3つ（厚年・健保・雇用）／★介護は 機械では 見られません★★');
console.log('    ＝介護は 条文に ★数も 幅も 無い★（健保法156・160・168条に 語は 在るが 率は 無い）');
console.log('  ★「URL が 生きて いる」は「中身が 同じ」では ない★＝中身を 比べるのは この 紙');
console.log('  ★取った 日★ ' + KYO + '／★元★ ' + API + '<法令id>');

const hiita = {};
for (const m of MOTO) {
  let j = null;
  try {
    const r = await fetch(API + m.id, { headers: { 'User-Agent': 'rakunally-shaho-check/1.0' } });
    if (!r.ok) { MI(m.na + ' を 引けない', 'HTTP ' + r.status); continue; }
    j = await r.json();
  } catch (e) { MI(m.na + ' を 引けない', String(e && e.message || e).slice(0, 60)); continue; }
  /* ★★引いた 後に 名前を 確かめる★★（`322AC0000000070` で 宮内庁法が 返った 実例） */
  const deta = (j.revision_info && j.revision_info.law_title) || '（題が 無い）';
  const bango = (j.law_info && j.law_info.law_num) || '';
  console.log('    ── ' + m.na + ' … id ' + m.id + ' ／ ★返って きた 題「' + deta + '」★ ' + bango);
  if (deta !== m.na) {
    T('★' + m.na + ' の id が 正しい（返って きた 題と 合う）★', false,
      '★はず「' + m.na + '」／出た「' + deta + '」＝★取れたが 別の 法令★');
    continue;
  }
  pass++; console.log('  ✓ ★' + m.na + ' の id が 正しい（題が 合う）★');
  hiita[m.key] = jouWoHiku(j.law_full_text, m.jou);
  console.log('       第' + m.jou + '条 … ' + m.mi + '（この 法令の 条 ' + hiita[m.key].honsu + '本）');
}

/* ── 厚生年金 ─────────────────────────────── */
if (!hiita.kounen) MI('厚生年金', '条文を 引けて いない');
else {
  const k = kounenRitsu(hiita.kounen.jou);
  if (!k.ok) MI('厚生年金の 率を 読めない', k.naze);
  else {
    console.log('    ── 厚年 … 法「' + k.ji + '」＝' + (k.ritsu * 100).toFixed(2) + '%（表の 段 ' + k.dan + '）'
      + '／lib ' + (R.KOSEI_NENKIN_RITSU_TOTAL * 100).toFixed(2) + '%');
    T('★厚生年金が 法令と 一致（厚年法81条4項）★', R.KOSEI_NENKIN_RITSU_TOTAL === k.ritsu,
      '法 ' + k.ritsu + '／lib ' + R.KOSEI_NENKIN_RITSU_TOTAL);
  }
}

/* ── 健康保険（47県が 幅の 中か） ─────────────── */
if (!hiita.kenpo) MI('健康保険', '条文を 引けて いない');
else {
  const h = kenpoHaba(hiita.kenpo.jou);
  if (!h.ok) MI('健康保険の 幅を 読めない', h.naze);
  else {
    const ken = R.KENKO_RITSU || {};
    const na = Object.keys(ken);
    const soto = na.filter((x) => { const v = ken[x] && ken[x].total; return !(v >= h.shita && v <= h.ue); });
    const yomenai = na.filter((x) => typeof (ken[x] && ken[x].total) !== 'number');
    console.log('    ── 健保 … 法「' + h.ji + '」＝' + (h.shita * 100).toFixed(1) + '%〜' + (h.ue * 100).toFixed(1) + '%'
      + '／lib の 県 ' + na.length + '（★分母★）');
    if (yomenai.length) MI('健保の 率を 読めない 県 ' + yomenai.length + '件', yomenai.join(' '));
    T('★健康保険が 法令の 幅の 中（' + (na.length - yomenai.length) + '/' + na.length + '県）★',
      soto.length === 0 && na.length > 0, '★幅の 外★ … ' + soto.map((x) => x + ' ' + ken[x].total).join(' '));
  }
}

/* ── 雇用保険 ─────────────────────────────── */
if (!hiita.chosyu) MI('雇用保険', '条文を 引けて いない');
else {
  const y = koyoRitsu(hiita.chosyu.jou);
  if (!y.ok) MI('雇用保険の 率を 読めない', y.naze);
  else {
    console.log('    ── 雇用 … 法「' + y.ji + '」');
    const hb = koyoHaba(hiita.chosyu.jou);
    if (!hb.ok) MI('雇用保険の 幅を 読めない', hb.naze);
    else {
      /* ★lib は 別の 紙に 在る★＝`koyo-hoken.js`（労働者負担＋事業主負担を 年度・業種で 持つ）
         ★法の 幅は「失業等給付費等充当徴収保険率」＝★労使 合わせた 率★★
         ⇒ ★労働者負担＋事業主負担 から ★二事業分を 除いた 物★と 比べたい所だが
           ★lib は 二事業分を 分けて 持って いない★
         ⇒ ★ここは「合計が 幅の 中か」だけ 見る★（★足りない事を 字で 書く★） */
      /* ★★在るのに 呼んで いない を 避ける★★＝`koyo-hoken.js` に ★合計を 出す 口★が 在る
         `fullRate(業種, 年度)` … ★労働者負担＋事業主負担★
         ★引数の 順は （業種, 年度）★（私は 一度 逆に 呼んで null を 貰った＝実物で 確かめた） */
      const K = require(path.join(ROOT, 'lib/koyo-hoken.js'));
      const nendo = K.LATEST;
      const kei = K.fullRate('ippan', nendo);
      console.log('       法の 幅（12条5項）… ' + hb.ji + '＝' + (hb.shita * 1000) + '〜' + (hb.ue * 1000) + '／1000');
      if (kei == null) MI('雇用保険を lib と 比べられない', '★fullRate が null★（年度 ' + nendo + ' が 未収録）');
      else {
        console.log('       lib（' + nendo + '年度・一般）… 労働者 ' + K.employRate('ippan', nendo)
          + '＋事業主 ' + K.employerRate('ippan', nendo) + '＝★合計 ' + kei + '★');
        /* ★★同じ 物どうしで 比べる★★（2026-09-19 自分で 嘘の 赤を 出して 気づいた）
           ★法の 幅（12条5項）★は ★失業等給付費等充当徴収保険率★の 幅＝★二事業分を 含まない★。
           ★lib の 合計（fullRate）★は ★二事業分を 含む★（事業主負担に 入って いる）。
           ⇒ ★一度 そのまま 比べて ★合計 0.0135 が 幅 0.012 を 超えて 赤★に なった★
             ＝★アプリの 欠陥では なく ★比べる 物が 違った★★。
           ⇒ ★lib は 二事業分を 分けて 持って いない★
             ⇒ ★幅の 中か は ★言えません★★＝★赤にも 緑にも しない★
             ⇒ 代わりに ★★上限を 超えて いないか だけ 見る★★
               （★二事業分を 含む 合計が 幅の 下限を 下回ったら それは おかしい★＝★下だけ 見る★） */
        const shita = hb.shita;
        console.log('       ★比べる 物が 違います★ … 法の 幅＝★二事業分を 含まない★／'
          + 'lib の 合計＝★二事業分を 含む★');
        console.log('       ⇒ ★「幅の 中か」は 言えません★。★下限（' + (shita * 1000) + '／1000）を'
          + ' 下回って いないか だけ 見ます★（二事業分を 足した 物が 下限 未満＝おかしい）');
        T('★雇用保険の 合計が 法令の 下限を 下回って いない（' + nendo + '年度・一般）★',
          kei >= shita, '合計 ' + kei + '／下限 ' + shita);
        MI('雇用保険を ★幅の 中か★ で 見る',
          '★lib が 二事業分を 分けて 持って いない★＝同じ 物に ならない'
          + '（★分けて 持てば 見られます★＝直す 的）');
      }
    }
  }
}

/* ── 介護（★見られない事を 字で 出す★） ──────────── */
MI('★介護保険★', '★条文に 数も 幅も 無い★（健保法156・160・168条に 語は 在るが 率は 無い）'
  + '＝★機械では 見られません／別の 元（協会けんぽの 表）が 要る★');

console.log('\n' + pass + ' passed, ' + fail + ' failed'
  + (mi ? ', ' + mi + ' ★決められません★' : '') + '（★見られるのは 4つ中 3つ★）');
process.exit(fail ? 1 : 0);
