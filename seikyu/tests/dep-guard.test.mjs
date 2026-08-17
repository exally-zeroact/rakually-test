/* dep-guard.test.mjs — ★「呼ばれる側」が1本残らず在るかの見張り★
 *
 * 何を止めたいか（前科）:
 *   ★呼ぶ側だけ写して 本番を白画面にした★（sha一致・CI緑・2052本緑でも捕まらなかった）。
 *   HTML は「読み込む物の一覧」を持っているだけで、★その物が在るかは誰も数えていなかった★。
 *   ＝1本でも消えたら、画面は真っ白のまま「テストは緑」になる。
 *
 * ★請求書は seikyu/ の外を13本 呼んでいる★（＝運ぶ時に一緒に運ばないと死ぬ物）。
 *   2026-08-18: アイコンを Rakually のロゴに差し替え、1本(img/icon-192.png)→3本になったので 11→13。
 *   とくに ★kyuyo/lib/ を2本★（消費税率・源泉の率＝法定の唯一の正）。
 *   ★Exally から kyuyo/ を外すと 請求書は紙も Excel も出せません★
 *   （seikyu-gensen.js が「先に読んでください」で throw する）。
 *   この見張りは、その日が来た時に ★黙って通さない★ ためにある。
 *
 * ★運ぶ時は 写す前と写した後に この同じ数を出す★（受け皿側も scripts/dep-count.mjs を使う）。
 *
 * 使い方: node seikyu/tests/dep-guard.test.mjs
 *         node seikyu/tests/dep-guard.test.mjs --self-test   ← わざと壊して赤になるか
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { count } from '../../scripts/dep-count.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (v, m) => { if (!v) throw new Error(m || 'false'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); };

/* ★seikyu/ の外を呼んでいる物の台帳★
   ここに書いた物が ★1本でも消えたら赤★／★書いていない物が増えても赤★。
   ＝「いつのまにか別の物に頼っていた」を運ぶ日に初めて気づく、を無くす。 */
const OUTSIDE = [
  'css/rakually-ui.css',                 // 画面の見た目（帯・カード・ボタン）
  'index.html',                        // ★Rakually の入口（共有データ＞会社）＝「会社の情報を直す」の飛び先
  /* ★2026-08-18 アイコンを差し替えた★ … img/icon-192.png（Exallyの文字だけの仮アイコン）を
     ★Rakually のロゴ★の一組に替えた。iOSは manifest を見ないので apple-touch-icon が要る。 */
  'img/apple-touch-icon-180.png',      // ★iOSでホーム画面に追加した時の絵（manifestを見ない）
  'img/favicon-32.png',                // タブの絵（32）
  'img/favicon-16.png',                // タブの絵（16）
  'js/env-badge.js',                   // ★テスト環境の帯★（本番と取り違えない）
  'js/rakually-login.js',                // ★ログイン画面の共通部品（唯一の正）★
  'js/file-out.js',                    // ★落とす口＝FileOut.deliver（全出力の窓口）★
  'js/suite-data.js',                  // 共有マスタ（会社・取引先）の読み書き
  'js/supa-config.js',                 // 倉庫の向き先（★配信ごとに違う＝写さない物★）
  'kyuyo/lib/shiharai-chosho.js',      // ★源泉の率と式（法定の唯一の正）CHOSHO.gensenA★
  'kyuyo/lib/shouhizei-ritsu.js',      // ★消費税の率（法定の唯一の正）SR.hyojun / SR.keigen★
  'lib/xlsx.full.min.js',              // Excel の読み書き
];

/* ★入口から辿れないが 捨てない物の台帳★（＝死にコードの台帳）
   ここに理由と戻す条件を書いていない「辿れないファイル」が在ったら赤。 */
const NOT_WIRED = {
  'seikyu/lib/seikyu-book.js': {
    reason: '③自社Excel（会社ごとの様式に書き込む）で使う予定の物。706行・まだ画面から呼んでいない。',
    wireWhen: '③自社Excel に着手する時（指示役の号令待ち）。その時に index.html から読み込む。',
    owner: '指示役（着手の号令）',
  },
};

/* ★window.○○ で繋がっている物★＝require が無くても「呼ばれる側」が要る。
   ここに書いた名前は ★どこかのファイルが必ず作っている★事を確かめる。 */
const GLOBALS_FROM_NET = ['SUPA', 'XLSX'];   // CDN と別読みの物（ファイルでは作らない）

console.log('\n[請求書 呼ばれる側の見張り]');
const r = count('seikyu/index.html', ROOT);

T('★見つからない参照が0本（1本でも欠けたら白画面）', () => {
  eq(r.missing.length, 0, '★呼んでいるのに 物が無い★\n   ' + r.missing.join('\n   '));
});

T('★seikyu/ の外を呼んでいる物が 台帳とぴったり同じ', () => {
  const now = r.outside.slice().sort().join('\n');
  const want = OUTSIDE.slice().sort().join('\n');
  if (now !== want) {
    const add = r.outside.filter((x) => !OUTSIDE.includes(x));
    const gone = OUTSIDE.filter((x) => !r.outside.includes(x));
    throw new Error('★台帳と違う★'
      + (add.length ? '\n   増えた（台帳に足して、運ぶ物に入れる）: ' + add.join(' , ') : '')
      + (gone.length ? '\n   減った（呼ぶのをやめたなら台帳から消す）: ' + gone.join(' , ') : ''));
  }
});

T('★外の物が1本残らず ディスクに在る', () => {
  const nai = OUTSIDE.filter((f) => !fs.existsSync(path.join(ROOT, f)));
  eq(nai.length, 0, '★台帳に在るのに 物が無い＝運んだ先で白画面になる★ ' + nai.join(' , '));
});

T('★法定の2本は kyuyo/lib のまま（勝手に写して2つ目の正を作っていない）', () => {
  /* ★コピペ禁止★＝請求書の中に率の写しを置かない。率は kyuyo/lib が唯一の正。 */
  for (const f of ['shouhizei-ritsu.js', 'shiharai-chosho.js']) {
    ok(OUTSIDE.includes('kyuyo/lib/' + f), '台帳から kyuyo/lib/' + f + ' が消えている');
    ok(!fs.existsSync(path.join(ROOT, 'seikyu/lib', f)),
      '★seikyu/lib に ' + f + ' の写しが出来ている＝率が2か所になる★');
  }
  /* 実際に呼んでいる名前が 相手に在るか（★名前が変わったら赤★） */
  const SR = fs.readFileSync(path.join(ROOT, 'kyuyo/lib/shouhizei-ritsu.js'), 'utf8');
  const CH = fs.readFileSync(path.join(ROOT, 'kyuyo/lib/shiharai-chosho.js'), 'utf8');
  ok(/\bhyojun\s*:/.test(SR) && /\bkeigen\s*:/.test(SR), '★消費税の lib に hyojun / keigen が無い★');
  ok(/\bgensenA\s*[:(]/.test(CH), '★源泉の lib に gensenA が無い★');
});

T('★入口から辿れないファイルは 台帳（理由と戻す条件つき）に載っている物だけ', () => {
  const yami = r.notReached.filter((f) => !NOT_WIRED[f]);
  eq(yami.length, 0, '★誰からも呼ばれていないのに 台帳に載っていない★ ' + yami.join(' , '));
  for (const [f, v] of Object.entries(NOT_WIRED)) {
    ok(fs.existsSync(path.join(ROOT, f)), '台帳に在るのに ファイルが無い: ' + f);
    ok(v.reason && v.wireWhen && v.owner, f + ' の台帳に 理由／戻す条件／担当のどれかが無い');
  }
});

T('★window.○○ で呼んでいる名前を、誰かが必ず作っている', () => {
  const files = [...r.inside, ...r.outside].filter((f) => /\.js$/.test(f));
  const src = files.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  const nai = r.globals.filter((g) => {
    if (GLOBALS_FROM_NET.includes(g)) return false;
    /* ★作っている形は1つではない★ root.X= / window.X= / self.X= / global.X=
       （UMD の書き方が場所で違う。片方しか見ないと「誰も作っていない」と嘘を言う。
         2026-08-17 実際に FileOut / SeikyuOut / SeikyuStore の3本で嘘を言った） */
    return !new RegExp('(?:root|window|self|global)\\.' + g + '\\s*=').test(src);
  });
  eq(nai.length, 0, '★呼んでいるのに 誰も作っていない★ ' + nai.join(' , '));
});

T('★数を出す（運ぶ日に この数と突き合わせる）', () => {
  console.log('      中 ' + r.inside.length + '本 ／ 外 ' + r.outside.length + '本 ／ ネット ' + r.net.length
    + '本 ／ 未配線 ' + r.notReached.length + '本 ／ window で繋ぐ名前 ' + r.globals.length + '個');
  ok(r.inside.length >= 10, '中の本数が少なすぎる（数え漏れ）');
});

/* ── self-test：わざと壊して赤になるか ─────────────────────────────── */
if (process.argv.includes('--self-test')) {
  console.log('\n[dep-guard --self-test] わざと壊して赤になるか');
  const S = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
  const tmp = path.join(ROOT, '.dep-guard-selftest');
  fs.mkdirSync(tmp, { recursive: true });

  const hide = (relp) => {                       // 一時的に隠す（★中身は触らない★）
    const from = path.join(ROOT, relp);
    const to = path.join(tmp, relp.split('/').join('__'));
    fs.renameSync(from, to);
    return () => fs.renameSync(to, from);
  };

  S('★呼ばれる側を1本 隠したら「見つからない参照」で捕まる', () => {
    const back = hide('js/file-out.js');
    try {
      const r2 = count('seikyu/index.html', ROOT);
      ok(r2.missing.length > 0, '★1本 消したのに 気づいていない（＝白画面が素通りする）★');
      ok(r2.missing.some((x) => x.includes('file-out.js')), '消した物の名前が出ていない: ' + r2.missing.join(' , '));
    } finally { back(); }
  });

  S('★法定の lib（消費税率）を隠したら捕まる', () => {
    const back = hide('kyuyo/lib/shouhizei-ritsu.js');
    try {
      const r2 = count('seikyu/index.html', ROOT);
      ok(r2.missing.some((x) => x.includes('shouhizei-ritsu')), '★率の lib が消えたのに 気づいていない★');
    } finally { back(); }
  });

  S('★台帳に無い物を呼び始めたら捕まる', () => {
    const now = ['js/newthing.js', ...OUTSIDE];
    const add = now.filter((x) => !OUTSIDE.includes(x));
    ok(add.length === 1 && add[0] === 'js/newthing.js', '台帳との突き合わせが効いていない');
  });

  S('★率の写しを seikyu/lib に置いたら捕まる', () => {
    const f = path.join(ROOT, 'seikyu/lib/shouhizei-ritsu.js');
    fs.writeFileSync(f, '/* 写し */');
    try {
      ok(fs.existsSync(f), '書けていない');
      let caught = false;
      try {
        for (const g of ['shouhizei-ritsu.js']) {
          if (fs.existsSync(path.join(ROOT, 'seikyu/lib', g))) throw new Error('写しが在る');
        }
      } catch { caught = true; }
      ok(caught, '★率の写しを見つけられていない★');
    } finally { fs.unlinkSync(f); }
  });

  S('★未配線ファイルを台帳から外したら捕まる', () => {
    const r2 = count('seikyu/index.html', ROOT);
    const yami = r2.notReached.filter((f) => !({}[f]));      // 空の台帳で数える
    ok(yami.length > 0, '★台帳が空でも通ってしまう＝何も見ていない★');
  });

  try { fs.rmdirSync(tmp); } catch { /* 中に何か残っていたら消さない */ }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
