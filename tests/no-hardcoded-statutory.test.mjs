/* no-hardcoded-statutory.test.mjs — ★法定の「率・額」を、配信物の文の中に直書きさせない★
 *
 * なぜ必要か（2026-08-02の指摘）:
 *   kyuyo/js/app.js のヘルプ説明文に「令和8は引下げ：一般0.50%・建設/農林0.60%」と
 *   料率が【文として】書かれていた。計算そのものは lib から取れているのに、
 *   ★画面に出る文だけが来年度に取り残される★。客が読むのはこの文なので、計算と同じ重さがある。
 *
 *   既にある no-duplicate-libs は【ファイル名】しか見ないので、この形は原理的に止められない。
 *   だからここでは【値そのもの】を見る。
 *
 * 判定:
 *   配信される .js / .html の中に、lib が持っている法定の値と一致する数字が出てきて、
 *   かつ その近く(前後300字)に その分野を指す言葉があれば赤。
 *     例: 「雇用保険…一般0.50%」 → 赤（雇用保険の料率が文に固定されている）
 *     例: 「報酬の源泉徴収 10.21%」 → 赤にしない（たまたま香川県の健保料率と同じ数字だが、
 *          近くに健保を指す言葉が無い＝別の話をしている）
 *   ★「近くに分野の言葉があるか」を条件にしたのは、除外リストで逃げないため。
 *     数字だけを見ると、料率と無関係な数と必ず衝突して、赤が信用されなくなる。
 *
 * 見ている分野（＝年度で動く／動いたら客への説明が変わる物）:
 *   雇用保険 / 健康保険 / 介護保険 / 厚生年金 / 子ども・子育て支援金 / 消費税 / 最低賃金
 *   ★割増率(25%/35%)は入れていない。労基法37条の法定率で年度では動かず、
 *     「25」「35」は他の数と衝突しやすく、赤の信用を落とすため。ここは意図的な線引き。
 *
 * 見ないファイル:
 *   lib/（値の持ち主そのもの）・tests/・tools/・scripts/・docs/（配信されない）
 *
 * 使い方: node tests/no-hardcoded-statutory.test.mjs
 *         node tests/no-hardcoded-statutory.test.mjs --self-test
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(import.meta.url);

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };

const WINDOW = 300;   // 「近く」の幅（前後の文字数）

/* 分野ごとの見出し語。ここに1つでも近くにあれば「その分野の話をしている」とみなす。 */
const KINDS = {
  koyo: { label: '雇用保険', words: ['雇用保険', 'koyo', 'employRate', 'EMPLOY_RATES', 'KoyoHoken'] },
  kenko: { label: '健康保険', words: ['健康保険', '健保', 'kenko', 'healthRate', 'KENKO'] },
  kaigo: { label: '介護保険', words: ['介護', 'kaigo', 'KAIGO'] },
  kosei: { label: '厚生年金', words: ['厚生年金', '厚年', 'kosei', 'KOSEI'] },
  shienkin: { label: '子ども・子育て支援金', words: ['支援金', 'shienkin', 'SHIENKIN', '子育て'] },
  shouhizei: { label: '消費税', words: ['消費税', 'shouhizei', 'SHOUHIZEI', '軽減税率'] },
  saitei: { label: '最低賃金', words: ['最低賃金', '最賃', 'saitei', 'SAITEI'] },
  /* ★社保 適用拡大（2026-08-08 追加）。賃金要件 月88,000円は【令和8年10月に撤廃予定】、
     人数要件51人は【令和9年10月に36人】へ下がる。★どちらも文に直書きすると、
     計算だけ直って画面の文だけ古い数字で残る。ここに入れれば その形が機械で赤になる。 */
  tekiyo: { label: '社保 適用拡大', words: ['適用拡大', '特定適用', '短時間労働者', 'ShahoKanyu', 'shahoKanyu', 'WAGE_88K', 'TOKUTEI'] },
};

/* ── libから「実際の値」を集める ─────────────────────────────────── */
function buildTable() {
  const SHH = require_(path.join(ROOT, 'kyuyo/lib/shakaihoken-hyo.js'));
  const KH = require_(path.join(ROOT, 'kyuyo/lib/koyo-hoken.js'));
  const SHZ = require_(path.join(ROOT, 'kyuyo/lib/shouhizei-ritsu.js'));
  const SAI = require_(path.join(ROOT, 'kyuyo/lib/saitei-chingin.js'));
  const SK = require_(path.join(ROOT, 'kyuyo/lib/shaho-kanyu.js'));

  const rates = { koyo: [], kenko: [], kaigo: [], kosei: [], shienkin: [], shouhizei: [] };
  const yen = { saitei: [], tekiyo: [] };
  /* 適用拡大の賃金要件（88,000円）。★人数(51人→36人…)はここに入れない：
     51/36/21/11 は普通の数と衝突しやすく、赤の信用を落とす。人数が lib から来ているかは
     kyuyo/tests/shaho-kanyu.test.js と law-switchpoints が「文＝libの値」で見ている。 */
  yen.tekiyo.push(SK.WAGE_88K);

  Object.values(KH.RATES).forEach(r => Object.values(r).forEach(v => rates.koyo.push(v)));
  Object.values(KH.EMPLOYER).forEach(r => Object.values(r).forEach(v => rates.koyo.push(v)));
  Object.values(SHH.KENKO_RITSU).forEach(r => rates.kenko.push(r.total));
  Object.values(SHH.KENKO_2026).forEach(v => rates.kenko.push(v));
  Object.values(SHH.KAIGO_NENDO).forEach(k => { rates.kaigo.push(k.total); rates.kaigo.push(k.jugyoin); });
  rates.kosei.push(SHH.KOSEI_NENKIN_RITSU_TOTAL, SHH.KOSEI_NENKIN_RITSU_JUGYOIN);
  rates.shienkin.push(SHH.SHIENKIN_TOTAL_FROM_2026_04);
  rates.shouhizei.push(SHZ.hyojun, SHZ.keigen);
  Object.values(SAI.todofuken || {}).forEach(v => {
    const n = (v && typeof v === 'object') ? v.chingin : v;
    if (typeof n === 'number' && n > 0) yen.saitei.push(n);
  });

  // ★どれか1つでも空なら、その種類は「文に直書きされていないか」を一度も見ていない＝空振り。
  //   libの形が変わって拾えなくなっても、緑のままになるのを止める。
  const empty = [...Object.entries(rates), ...Object.entries(yen)].filter(([, v]) => !v.length).map(([k]) => k);
  if (empty.length) throw new Error('★libから値を拾えていない種類がある（この検査が空振り）: ' + empty.join(', '));
  if (yen.saitei.length !== 47) throw new Error('★最低賃金を47件拾えていない（' + yen.saitei.length + '件）＝この検査が空振り');

  return { rates, yen };
}

/* 値 → 文の中での表れ方（正規表現） */
export function patternsFor(table) {
  const out = [];
  const seen = new Set();
  /* ★数字の途中に埋まっている物を拾わないよう、前後を必ず見張る。
     後読み(?<=)は使わない（古いiOS Safariで正規表現ごと壊れる＝リポジトリ共通の決まり）。
     代わりに「直前の1文字」を捕まえて、本体は m[1] で取り出す。 */
  const push = (kind, core, shown) => {
    const key = kind + '|' + shown;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ kind, re: new RegExp('(?:^|[^0-9.,])(' + core + ')', 'g'), shown });
  };
  for (const [kind, list] of Object.entries(table.rates || {})) {
    for (const v of list) {
      if (typeof v !== 'number' || !(v > 0)) continue;
      const dec = String(v);
      // 小数リテラル。0.25 のような2桁までは一般の数と衝突するので見ない
      if (/^0\.\d{3,}$/.test(dec)) push(kind, esc(dec) + '(?![0-9])', dec);
      // ％表記（0.50% / 9.85% / 18.3%）。★小数点を含む形だけ見る。
      //   「25%」のような整数％は、割増率でも税率でも割引率でも出てくる普通の数なので拾わない。
      for (const d of [1, 2, 3]) {
        const p = (v * 100).toFixed(d);
        if (Math.abs(Number(p) - v * 100) < 1e-9) push(kind, esc(p) + '\\s*[%％]', p + '%');
      }
      // ★消費税だけは整数％（10% / 8%）も見る。
      //   消費税率は必ず整数％で書かれ、かつ近くに「消費税」の語が要る条件があるので衝突しない。
      //   この1つだけ見ないと、消費税は機械の目が届かない分野になってしまう。
      if (kind === 'shouhizei') {
        const p0 = (v * 100).toFixed(0);
        if (Math.abs(Number(p0) - v * 100) < 1e-9) push(kind, esc(p0) + '\\s*[%％]', p0 + '%');
      }
      // 千分率（雇用保険の告示は 5/1000 の形で書かれる）
      const per1000 = Math.round(v * 1000 * 10) / 10;
      if (Math.abs(per1000 - v * 1000) < 1e-9) push(kind, esc(String(per1000)) + '\\s*/\\s*1000', per1000 + '/1000');
    }
  }
  for (const [kind, list] of Object.entries(table.yen || {})) {
    for (const v of list) {
      if (typeof v !== 'number' || !(v > 0)) continue;
      push(kind, esc(String(v)) + '(?![0-9])', String(v));
      const c = String(v).replace(/\B(?=(\d{3})+$)/g, ',');
      if (c !== String(v)) push(kind, esc(c) + '(?![0-9])', c);
      // ★「万」の書き方も見る（88000 → 8.8万）。説明文はこの形で書かれることが多く、
      //   数字だけ見ていると ★文の中の 8.8万円 を取り逃がす★。1万円未満は対象外。
      if (v >= 10000) {
        const man = String(v / 10000).replace(/\.?0+$/, '');
        push(kind, esc(man) + '\\s*万', man + '万');
      }
    }
  }
  return out;
}
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ★純関数：ファイル(path→中身)と表を受け取り、直書きを返す。self-testで作り物を通せる。 */
export function findHardcoded(files, table) {
  const pats = patternsFor(table);
  const hits = [];
  for (const [rel, src] of Object.entries(files)) {
    for (const p of pats) {
      p.re.lastIndex = 0;
      let m;
      while ((m = p.re.exec(src))) {
        const at = m.index + m[0].length - m[1].length;   // 本体(m[1])の位置。先頭の1文字ぶんを戻す
        p.re.lastIndex = at + m[1].length;                // 直前の1文字を次の照合に残す（連続を取りこぼさない）
        const near = src.slice(Math.max(0, at - WINDOW), Math.min(src.length, at + m[1].length + WINDOW));
        if (!KINDS[p.kind].words.some(w => near.indexOf(w) >= 0)) continue;   // 分野の話をしていない＝別の数字
        hits.push({
          file: rel, kind: p.kind, shown: m[1],
          line: src.slice(0, at).split('\n').length,
          context: src.slice(Math.max(0, at - 50), at + m[1].length + 20).replace(/\n/g, '⏎'),
        });
      }
    }
  }
  return hits;
}

/* ══ self-test ═══════════════════════════════════════════════════════════ */
if (process.argv.includes('--self-test')) {
  console.log('\n[no-hardcoded-statutory --self-test] わざと壊して赤になるか');
  const table = { rates: { koyo: [0.005], kenko: [0.1021] }, yen: { saitei: [1226] } };

  T('★分野の言葉と一緒に率が書いてあれば赤', () => {
    const h = findHardcoded({ 'js/a.js': 'var t="雇用保険の料率は一般0.50%です";' }, table);
    if (h.length !== 1) throw new Error('赤になっていない: ' + JSON.stringify(h));
  });
  T('★同じ数字でも別分野の話なら赤にしない（誤検知を出さない）', () => {
    const h = findHardcoded({ 'js/a.js': 'var t="報酬の源泉徴収は10.21%です";' }, table);
    if (h.length) throw new Error('誤検知: ' + JSON.stringify(h));
  });
  T('健保の話で同じ数字が出れば赤', () => {
    const h = findHardcoded({ 'js/a.js': 'var t="健康保険料率は10.21%";' }, table);
    if (h.length !== 1) throw new Error('赤になっていない');
  });
  T('小数リテラルのフォールバックも赤', () => {
    const h = findHardcoded({ 'js/a.js': 'var koyoRate = lib ? lib.rate() : 0.005;' }, { rates: { koyo: [0.005] } });
    if (h.length !== 1) throw new Error('赤になっていない');
  });
  T('千分率（5/1000）も赤', () => {
    const h = findHardcoded({ 'js/a.js': 'var s="雇用保険 一般 労働者負担 5/1000";' }, { rates: { koyo: [0.005] } });
    if (h.length !== 1) throw new Error('赤になっていない');
  });
  T('最低賃金の額（カンマ有無どちらも）も赤', () => {
    const a = findHardcoded({ 'js/a.js': 'var s="東京都の最低賃金は1226円";' }, table);
    const b = findHardcoded({ 'js/a.js': 'var s="東京都の最低賃金は1,226円";' }, table);
    if (!a.length || !b.length) throw new Error('赤になっていない');
  });
  T('数字の一部に埋まっている時は拾わない（0.0050001 / 12260）', () => {
    const h = findHardcoded({ 'js/a.js': 'var x="雇用保険 0.0050001 最低賃金 12260";' }, table);
    if (h.length) throw new Error('誤検知: ' + JSON.stringify(h));
  });
  T('2桁までの率（0.25=25%）は表に入れても拾わない（一般の数と衝突するため）', () => {
    const h = findHardcoded({ 'js/a.js': 'var s="雇用保険 0.25 と 25%";' }, { rates: { koyo: [0.25] } });
    if (h.length) throw new Error('誤検知: ' + JSON.stringify(h));
  });
  /* ★2026-08-08: 適用拡大の賃金要件。撤廃(令和8年10月予定)で ★文だけ古くなる★ 形を止める。
     ここは「わざと壊して赤になるか」＝直す前の実物の文をそのまま食わせている。 */
  T('★適用拡大: 88,000円 が説明文にあれば赤（直す前の app.js の文）', () => {
    const t2 = { yen: { tekiyo: [88000] } };
    const h = findHardcoded({ 'js/app.js': 'パートでも<b>週20時間以上・月88,000円以上・学生でない</b>で社保加入の対象（特定適用事業所）' }, t2);
    if (h.length !== 1) throw new Error('赤になっていない: ' + JSON.stringify(h));
  });
  T('★適用拡大: 「8.8万円」の書き方でも赤（直す前の ops の文）', () => {
    const t2 = { yen: { tekiyo: [88000] } };
    const h = findHardcoded({ 'ops/a.js': "current: '週20時間以上 / 所定内賃金 月8.8万円以上 / 特定適用事業所'" }, t2);
    if (h.length !== 1) throw new Error('赤になっていない: ' + JSON.stringify(h));
  });
  T('★適用拡大: 分野の話でなければ 88,000 でも赤にしない（標準報酬の等級表など）', () => {
    const t2 = { yen: { tekiyo: [88000] } };
    const h = findHardcoded({ 'js/a.js': '{ min: 0, max: 93000, hyojun: 88000, tokyu: 1 }' }, t2);
    if (h.length) throw new Error('誤検知: ' + JSON.stringify(h));
  });
  T('libから作った表が空振りしていない（実物のlibを読めている）', () => {
    const t = buildTable();
    if (!t.yen.tekiyo.length) throw new Error('適用拡大の額を拾えていない');
    if (t.rates.kenko.length < 47) throw new Error('健保の県が足りない: ' + t.rates.kenko.length);
    if (!t.rates.koyo.length || !t.rates.kaigo.length || !t.yen.saitei.length) throw new Error('分野が空です');
  });

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

/* ══ 本番（実物を見る） ═══════════════════════════════════════════════ */
const SKIP_DIRS = new Set(['node_modules', '.git', 'tests', 'tools', 'scripts', 'docs', 'supabase', '.github', 'tmp', 'lib']);
function walk(rel, out = []) {
  for (const name of fs.readdirSync(path.join(ROOT, rel || '.'))) {
    if (SKIP_DIRS.has(name)) continue;
    const r = rel ? rel + '/' + name : name;
    if (fs.statSync(path.join(ROOT, r)).isDirectory()) walk(r, out);
    else if (/\.(js|html)$/i.test(name)) out.push(r);
  }
  return out;
}

const table = buildTable();
const shipped = walk('');
const files = {};
for (const r of shipped) files[r] = fs.readFileSync(path.join(ROOT, r), 'utf8');
const hits = findHardcoded(files, table);

console.log('\n[no-hardcoded-statutory] 法定の率・額が配信物の文に直書きされていないか');

T('★法定の率・額が直書きされていない', () => {
  if (hits.length) {
    throw new Error('直書きが見つかりました:\n'
      + hits.map(h => '   - ' + h.file + ':' + h.line + '  [' + KINDS[h.kind].label + ' ' + h.shown + ']\n     …' + h.context + '…').join('\n')
      + '\n   → ★数字を文に書かず、lib の値から文を組み立てること。'
      + '\n     計算が合っていても、画面に出る文だけが年度で取り残される。客が読むのはその文です。');
  }
});

T('検査が空振りしていない（配信物と値の表を実際に持っている）', () => {
  if (shipped.length < 10) throw new Error('走査できた配信物が少なすぎます: ' + shipped.length);
  if (patternsFor(table).length < 100) throw new Error('値の表が薄すぎます: ' + patternsFor(table).length);
});

console.log('\n── 実測 ──');
console.log('  配信物: ' + shipped.length + '本（.js/.html）/ 見ている表れ方 ' + patternsFor(table).length + '通り');
console.log('  分野: ' + Object.values(KINDS).map(k => k.label).join(' / '));
console.log('  直書き: ' + hits.length + '件');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
