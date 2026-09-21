/* souname.mjs — ★「総なめ」を ★1つの 物★に する★
 * ============================================================================
 * ★なぜ 在るか（2026-09-21 実測で 踏んだ）★
 *   ★私は「総なめ 赤0」と 出した／実際は ★webkit.yml しか 回して いなかった★★
 *   ⇒ `ci.yml` の 179段目 `honban-de-hakaranai.test.mjs` が ★CI で 赤★
 *   ⇒ ★★『総なめ』という 言葉が 2つの 物を 指して いた★★
 *   ⇒ ★人が「2回 走らせる」のを 覚えて いる 形＝★心がけ★＝今日 何度も 外れた★
 *
 * ★★ここが 守る 事★★
 *   ⑴ ★1つの 命令で ★両方★ を 順に 回す★（ci.yml → webkit.yml）
 *   ⑵ ★出しは 1枚★ … 「ci ◯/◯ 赤◯ 未測定◯ 終わり値◯／webkit 同じ」
 *   ⑶ ★★片方しか 回って いなければ 「回して いません」と ★必ず★ 出す★★（★空欄に しない★）
 *   ⑷ ★束に 分けるのは そのまま★（`--ci=1-60` `--wk=1-23`）
 *      ＝★機械が 止める（memory）事は 変えない★／★出しを 1枚に まとめるだけ★
 *   ⑸ ★★束の 端の 数を ★手で 書かない★★★（2026-09-21・指示役1 の ②）
 *      ★何が 起きたか★ … 私は ci.yml を ★1-60／61-120／121-180／181-235★ で 回して いた。
 *        ★その 数は どの 紙にも 書いて いない★（探した＝repo の md/mjs/yml/js に 0件）＝★私の 頭の 中だけ★
 *        ⇒ ★段を 1つ 足した 日（235→236）に ★足した その段が 回らない★★＝一番 悪い 形
 *      ★直し★ … `--taba=N` ＝★全体の 数は clock-sweep が 出した『全 N本』を 使う★
 *        ⇒ ★★端の 数を 人が 書く 所を 無くした★★（★新しい 数え方を 作らない★）
 *
 * ★使い方★
 *   node tools/souname.mjs --self-test         … ★判じだけ 試す（回さない）★
 *   node tools/souname.mjs                     … ★両方 全部★
 *   node tools/souname.mjs --taba=60           … ★両方 全部／60段ずつ 束で★（★端の 数は 機械が 決める★）
 *   node tools/souname.mjs --ci=1-60           … ci.yml の 1〜60 だけ（webkit は「回して いません」と 出る）
 *   node tools/souname.mjs --ci=1-60 --wk=1-23 … 両方 束で（★手で 端を 書く＝⑸の 穴に 戻る★）
 *   node tools/souname.mjs --skip-ci           … webkit だけ（★そう 書いて 出ます★）
 *   ★中で 呼ぶのは `tools/clock-sweep.mjs`★（★新しい 数え方を 作らない★）
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ★★判じ（1か所）★★（2026-09-21・指示役1 の ②⑴）
   ★決め（そのまま 字に した）★
     ・★2本とも 回って いない ⇒「全部 緑」と 書けない／終わり値 1★
     ・★束の 残りが 在る ⇒ 書けない／終わり値 1★
     ・★赤が 在る ⇒ 書けない／終わり値 1★
     ・★★片方が 未測定だけ ⇒ 書ける（終わり値 0）／但し「0件＝合格 とは 書かない」と 添える★★
       ＝★09-14 の 決め（鍵が 無い＝緑で 通す・但し 数は 出す）と 揃える★ */
export function handan(kekka) {
  const yatta = ['ci', 'webkit'].filter((n) => kekka[n] && !kekka[n].tobashita && kekka[n].hashiratta != null);
  const akaKei = yatta.reduce((a, n) => a + (kekka[n].aka || 0), 0);
  const miKei = yatta.reduce((a, n) => a + (kekka[n].mihakari || 0), 0);
  const nokoriAru = yatta.some((n) => kekka[n].nokori && !/^\s*$/.test(kekka[n].nokori));
  let tomeru = null;                       /* ★束を 止める 訳（終わり値 1）★ */
  if (yatta.length < 2) tomeru = '2本とも 回して いません';
  else if (nokoriAru) tomeru = '束の 残りが 在ります';
  else if (akaKei > 0) tomeru = '赤が ' + akaKei + '本 在ります';
  /* ★★「全部 緑」と 書けるか★ と ★終わり値★ は 別物★★（2026-09-21・指示役1 の ②で 直した）
     ★前の 私の 決め★ … 「未測定だけ ⇒ 書ける（終わり値 0）」
     ★何が 嘘だったか★ … ★未測定には 2つ 混じる★
       ㋐ ★回せなかった★（鍵・道具が 無い）……… 09-14 の 決めで 緑で 通してよい
       ㋑ ★回したが 段が「N はかれない」と 返した★（#26 seirino-ui の 実物）
     ★実測（tools/clock-sweep.mjs:160-166）★ … `本当に 未測定` は ★㋐も ㋑も 同じ 桶に 入る★
     ⇒ ★締めの 数からは 分けられない★ ⇒ ★★一番 弱い 方に 合わせる＝どちらでも「全部 緑」とは 書かない★★
     ⇒ ★但し 赤では ないので 束は 止めない（終わり値 0）★＝★㋐で 総なめが 永久に 赤に ならない★ */
  const naze = tomeru || (miKei > 0
    ? '未測定が ' + miKei + '本 在ります（★㋐回せなかった／㋑段が「はかれない」と 返した を 分けられません★）'
    : null);
  return { yatta: yatta.length, akaKei, miKei, nokoriAru, kakeru: !naze, naze, tomeru, owari: tomeru ? 1 : 0 };
}

if (process.argv.includes('--self-test')) {
  console.log('\n[souname] ★自己確認★（★見本の 字で 試す＝実際には 回しません★）');
  let ng = 0;
  const iu2 = (n, good) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + n + (good ? '' : '  ★思っていたのと 違う★')); };
  const zen = (aka, mi, nokori) => ({ hashiratta: 10, aka: aka, mihakari: mi, nokori: nokori || '', owari: aka ? 1 : 0 });
  const ok1 = { ci: zen(0, 0), webkit: zen(0, 0) };
  iu2('★両方 回って 赤0 ⇒「全部 緑」と 書ける／終わり値 0★', handan(ok1).kakeru === true && handan(ok1).owari === 0);
  const ng1 = { ci: zen(0, 0), webkit: { tobashita: true } };
  iu2('★片方だけ ⇒ 書けない／終わり値 1★', handan(ng1).kakeru === false && handan(ng1).owari === 1 && handan(ng1).yatta === 1);
  const ng2 = { ci: zen(0, 0, '3〜235'), webkit: zen(0, 0) };
  iu2('★束の 残りが 在る ⇒ 書けない／終わり値 1★', handan(ng2).kakeru === false && handan(ng2).owari === 1);
  const ng3 = { ci: zen(1, 0), webkit: zen(0, 0) };
  iu2('★赤が 在る ⇒ 書けない／終わり値 1★', handan(ng3).kakeru === false && handan(ng3).owari === 1);
  const mi1 = { ci: zen(0, 0), webkit: zen(0, 2) };
  iu2('★未測定だけ ⇒ ★「全部 緑」とは 書けない★／但し 束は 止めない（終わり値 0）★',
    handan(mi1).kakeru === false && handan(mi1).owari === 0 && handan(mi1).miKei === 2);
  iu2('★同じ回で ★訳に 未測定の 数が 出る★（数を 隠さない）★',
    /未測定が 2本/.test(String(handan(mi1).naze)));
  iu2('★未測定と 赤が 同時 ⇒ ★訳は 赤★（重い 方を 先に 言う）／終わり値 1★',
    (function () { const k = handan({ ci: zen(1, 0), webkit: zen(0, 3) }); return k.owari === 1 && /赤が 1本/.test(String(k.naze)); })());
  iu2('★1本も 回って いない ⇒ 書けない★', handan({}).kakeru === false && handan({}).yatta === 0);
  /* ★★束の 端の 数を 引ける か★★（＝⑸の 直しの 心臓。★実物の 見出しの 字★で 試す） */
  const midashi = '[clock-sweep] .github/workflows/ci.yml ／ 時計 ★本物★  （ci.yml #234〜#236／全 236本）';
  iu2('★clock-sweep の 見出しから ★全 236本★ を 引ける（端を 人が 書かない）★',
    kazuWoHiku(midashi).zen === 236);
  iu2('★見出しが 無ければ ★全体の 数は null★（当てない）★', kazuWoHiku('なにも 無い').zen === null);
  const taba1 = { ci: zen(0, 0), webkit: Object.assign(zen(0, 0), { nokori: '★全体の 数（全 N本）を 読めませんでした＝どこまで 回ったか 分かりません★' }) };
  iu2('★束で 回して ★どこまでか 分からない★ ⇒ 書けない／終わり値 1★',
    handan(taba1).kakeru === false && handan(taba1).owari === 1);

  /* ★★ここから 下は ★束の 繰り返しを 本当に 通す★★★（見本の 掃きを 渡す＝clock-sweep は 呼ばない）
     ★訳★ … 2026-09-21 に わざと 3通り 壊したら ★緑のまま★ だった
             ＝★上の 判じだけ 見て いて 繰り返しを 1度も 通って いなかった★ */
  const nisemono = (zenKazu, akaDe) => function (yml, skip, from, to) {
    const hon = Math.max(0, Math.min(to, zenKazu) - from + 1);
    return { owari: (akaDe && from <= akaDe && akaDe <= to) ? 1 : 0, hirotta: zenKazu + 1,
      hashiratta: hon, aka: (akaDe && from <= akaDe && akaDe <= to) ? 1 : 0, mihakari: 0,
      zen: zenKazu, nokori: null };
  };
  const t1 = tabaDeMawasu('ci', 'x.yml', '', 60, nisemono(236));
  iu2('★束60で 236段＝★端(236)まで 届く★／残り 無し／走らせた 236本★',
    t1.nokori === '' && t1.hashiratta === 236 && t1.taba.length === 4 && t1.taba[3] === '181〜240');
  iu2('★その 1枚が「全部 緑」と 書ける★', handan({ ci: t1, webkit: t1 }).kakeru === true);
  const t2 = tabaDeMawasu('ci', 'x.yml', '', 60, nisemono(236, 200));
  iu2('★束の 途中に 赤 ⇒ 数え上がる／終わり値 1／書けない★',
    t2.aka === 1 && t2.owari === 1 && handan({ ci: t2, webkit: t2 }).kakeru === false);
  const t3 = tabaDeMawasu('ci', 'x.yml', '', 60, function () { return { hashiratta: 60, aka: 0, mihakari: 0, hirotta: 0, owari: 0, zen: null, nokori: null }; });
  iu2('★全体の 数を 読めない ⇒ ★残りに 訳が 入る★／書けない★',
    /どこまで 回ったか 分かりません/.test(String(t3.nokori)) && handan({ ci: t3, webkit: t3 }).kakeru === false);
  const t4 = tabaDeMawasu('ci', 'x.yml', '', 60, function (y, s, from) { return from === 1 ? { hashiratta: 60, aka: 0, mihakari: 0, hirotta: 237, owari: 0, zen: 236, nokori: null } : { hashiratta: null, zen: 236, owari: 1 }; });
  iu2('★途中の 束で 数を 引けない ⇒ ★残りに 訳が 入る★／黙って 緑に しない★',
    /数を 引けません/.test(String(t4.nokori)) && handan({ ci: t4, webkit: t4 }).kakeru === false);
  iu2('★飛ばした 数を 締めの 行から 引ける★',
    kazuWoHiku('★拾った 段 48★ ／ 走らせた 28本 ／ ★赤 0本★ ／ 飛ばした 3本（支度 1）').hazushi === 3);
  iu2('★飛ばした 字が 無ければ null（当てない）★', kazuWoHiku('なにも 無い').hazushi === null);
  const t5 = tabaDeMawasu('ci', 'x.yml', '', 500, nisemono(236));
  iu2('★束が 全体より 大きい ⇒ 1回で 端まで／残り 無し★', t5.nokori === '' && t5.taba.length === 1);
  console.log(ng ? '★自己確認 ' + ng + '件 おかしい★' : '  ★19通り ぜんぶ 思った通り★');
  process.exit(ng ? 1 : 0);
}

const hiku = (na) => {
  const t = process.argv.find((x) => x.indexOf('--' + na + '=') === 0);
  if (!t) return null;
  const m = String(t.split('=')[1] || '').match(/^(\d+)-(\d+)$/);
  return m ? { from: m[1], to: m[2] } : null;
};
const HAN = {
  ci: { yml: '.github/workflows/ci.yml', skip: 'playwright install', han: hiku('ci'), tobasu: process.argv.includes('--skip-ci') },
  webkit: { yml: '.github/workflows/webkit.yml', skip: 'playwright install|npm install', han: hiku('wk'), tobasu: process.argv.includes('--skip-wk') },
};
/* ★締めの 行から 数を 引く★＝★clock-sweep が 出した 字だけを 使う（自分で 数え直さない）★ */
function kazuWoHiku(out) {
  const ji = String(out || '');
  const n = (re) => { const m = ji.match(re); return m ? Number(m[1]) : null; };
  return {
    hirotta: n(/拾った 段 (\d+)/),
    hashiratta: n(/走らせた (\d+)本/),
    aka: n(/★赤 (\d+)本★/),
    mihakari: n(/本当に 未測定 (\d+)本/),
    /* ★全体の 数＝clock-sweep の 見出し『／全 N本』★（★段の 番号は「拾った」では なく
       「支度を 除いた」数＝2026-09-21 実測。FROM=237 は 1段も 走らず clock-sweep が 赤で 止めた）★ */
    zen: n(/全 (\d+)本/),
    /* ★★飛ばした 数も 拾う★★（2026-09-21＝★分母を 出さない 緑は 嘘★）
       ★踏んだ 所★ … webkit が ★走らせた 45本／全 47本★ と 出て
         ★「残り 無し」なのに 2本 合わない★＝★見る 人が 止まる★
       ★実物★ … その 2本は ★SKIP で わざと 飛ばした 支度★（playwright install など）
       ⇒ ★★走らせた ＋ 飛ばした ＝ 全 に なるよう 字に 出す★★ */
    hazushi: n(/飛ばした (\d+)本/),
    nokori: (ji.match(/★★残り（この回で 走らせて いない）★★ … ([^\n]*)/) || [])[1] || null,
  };
}

/* ★1回 回す（束でも 全部でも ここを 通る＝★呼ぶ 所は 1つ★）★ */
function hitotsu(yml, skip, from, to) {
  const env = Object.assign({}, process.env, { YML: yml, SKIP: skip });
  if (from) { env.FROM = String(from); env.TO = String(to); }
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'clock-sweep.mjs')],
    { cwd: ROOT, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const out = (r.stdout || '') + (r.stderr || '');
  process.stdout.write(out);
  return Object.assign({ owari: r.status }, kazuWoHiku(out));
}

/* ★★束に 割って 端まで 回す★★＝★端の 数は 人が 書かない（clock-sweep の『全 N本』を 使う）★
   ★どこまで 回ったか 分からない 時は ★残りに 訳を 入れて 止める★★＝黙って 緑に しない */
/* ★`hashiru` を 外から 渡せる★＝★自己確認が この 繰り返しを ★本当に 通る★★（2026-09-21
   ★わざと 壊した 3通りが 緑のまま だった＝自己確認が ここを 一度も 通って いなかった★） */
export function tabaDeMawasu(na, yml, skip, haba, hashiru) {
  const yaru = hashiru || hitotsu;
  const shizuka = !!hashiru;                       /* ★見本で 試す 時は 字を 出さない★ */
  const kei = { hashiratta: 0, aka: 0, mihakari: 0, hazushi: 0, hirotta: null, owari: 0, zen: null, taba: [] };
  let start = 1, todoita = 0;
  for (;;) {
    const to = start + haba - 1;
    if (!shizuka) console.log('\n  ── ★' + na + '★ ' + start + '〜' + to + '段 ──');
    const k = yaru(yml, skip, start, to);
    if (k.zen) kei.zen = k.zen;
    if (k.hashiratta == null) { kei.nokori = '★' + start + '〜' + to + '段で 数を 引けませんでした★'; return kei; }
    kei.hashiratta += k.hashiratta; kei.aka += k.aka; kei.mihakari += k.mihakari;
    kei.hazushi += (k.hazushi || 0);
    kei.hirotta = k.hirotta; if (k.owari) kei.owari = k.owari;
    kei.taba.push(start + '〜' + to);
    todoita = to;
    if (!kei.zen) { kei.nokori = '★全体の 数（全 N本）を 読めませんでした＝どこまで 回ったか 分かりません★'; return kei; }
    if (todoita >= kei.zen) break;
    start = to + 1;
  }
  kei.nokori = '';   /* ★1段目から 全 N本目まで 届いた★ */
  return kei;
}

const TABA = (function () {
  const t = process.argv.find((x) => x.indexOf('--taba=') === 0);
  const n = t ? Number(String(t.split('=')[1] || '')) : 0;
  return (n > 0 && n < 100000) ? Math.floor(n) : 0;
})();

const kekka = {};
for (const na of ['ci', 'webkit']) {
  const h = HAN[na];
  if (h.tobasu) { kekka[na] = { tobashita: true }; continue; }
  const shirushi = h.han ? '（' + h.han.from + '〜' + h.han.to + '段）'
    : (TABA ? '（★' + TABA + '段ずつ 束で 端まで★）' : '（全部）');
  console.log('\n──────── ★' + na + '★ ' + h.yml + shirushi + ' ────────');
  kekka[na] = (TABA && !h.han)
    ? tabaDeMawasu(na, h.yml, h.skip, TABA)
    : hitotsu(h.yml, h.skip, h.han ? h.han.from : null, h.han ? h.han.to : null);
}

/* ★★出しは 1枚★★（★空欄に しない／回して いなければ そう 書く★） */
const iu = (na) => {
  const k = kekka[na];
  if (!k) return na + ' … ★回して いません★';
  if (k.tobashita) return na + ' … ★★回して いません（--skip で 外した）★★';
  if (k.hashiratta == null) return na + ' … ★★数を 引けません（締めの 行が 無い）★★（終わり値 ' + k.owari + '）';
  /* ★走らせた ＋ 飛ばした が 全 に なるか を ★その場で 引いて 出す★（人に 数え直させない） */
  const au = (k.zen != null && k.hashiratta != null)
    ? (k.hashiratta + (k.hazushi || 0) === k.zen ? '★合う★' : '★★' + (k.zen - k.hashiratta - (k.hazushi || 0)) + '本 合いません★★')
    : '';
  return na + ' … 走らせた ' + k.hashiratta + '本＋飛ばした ' + (k.hazushi || 0) + '本＝'
    + (k.hashiratta + (k.hazushi || 0)) + '本／' + (k.zen ? '全 ' + k.zen + '本 ' + au + '／' : '') + '拾った段 ' + k.hirotta
    + '／★赤 ' + k.aka + '★／未測定 ' + k.mihakari + '／終わり値 ' + k.owari
    + (k.nokori ? '　★残り ' + k.nokori.trim() + '★' : '　★残り 無し★')
    + ((k.taba && k.taba.length) ? '\n      束 … ' + k.taba.join(' ／ ') : '');
};
console.log('\n════════ ★★総なめ（1枚）★★ ════════');
console.log('  ' + iu('ci'));
console.log('  ' + iu('webkit'));
const h2 = handan(kekka);
console.log('  ★★合わせて … 回した ' + h2.yatta + '/2本の yml ／ 赤 ' + h2.akaKei + ' ／ 未測定 ' + h2.miKei + '★★');
if (!h2.kakeru) {
  console.log('  ★★★「全部 緑」とは 書けません＝' + h2.naze + '★★★');
  /* ★止める 訳が 無い（＝未測定だけ）時は ★束は 止めない★＝そう 書いて 出す★ */
  if (!h2.tomeru) console.log('  （★赤では ないので 束は 止めません＝終わり値 0★）');
} else console.log('  ★2本とも 全段 回して 赤 0／未測定 0★');
process.exitCode = h2.owari;
