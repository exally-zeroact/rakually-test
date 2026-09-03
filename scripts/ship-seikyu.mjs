/* ship-seikyu.mjs — ★請求書を 本番の入れ物へ運ぶ★（手で写さない）
 * =============================================================================
 * なぜ道具にするか（指示役 2026-08-26 の手順5）:
 *   ★呼ばれる側も一緒に運ぶ★／★写す前と後で 同じ道具で数える★
 *   ＝手で写すと ★呼ぶ側だけ写して 本番が白画面★（sha一致・CI緑でも捕まらない）になる。
 *   ★運ぶ一覧を 決め打ちしない★＝`scripts/dep-count.mjs` に毎回 数えさせる
 *     （あとで呼ぶ物が増えても 勝手に付いてくる）。
 *
 * 何をするか
 *   ① dep-count で「請求書が要る物」を数える（中＋外）
 *   ② その全部＋★見張り一式★を 写す
 *   ③ ★入口だけ 作り替える★＝★給与のタイルを出さない★
 *      （請求書だけ出すので `kyuyo/` は無い。押した人を行き止まりにしない）
 *   ④ ★CIも 作り替える★＝★運び先に無いファイルを指すステップを外す★
 *      ★外した物は 名前を全部 出す★（黙って減らさない＝「素通り」を作らない）
 *      ★1つのステップの中で 在る物と無い物が混ざったら 赤★（勝手に直さない）
 *   ⑤ ★写した後 もう一度 数えて 前と後の数を出す★（合わなければ赤）
 *
 * 使い方:
 *   node scripts/ship-seikyu.mjs --to <運び先>        … 運ぶ
 *   node scripts/ship-seikyu.mjs --to <運び先> --dry  … 数えるだけ（1つも書かない）
 *   node scripts/ship-seikyu.mjs --self-test          … わざと壊して赤になるか
 *
 * ★本番の倉庫の値（js/supa-config.js）は ここでは書き換えません★
 *   ＝指示役が渡す物を 運び先で入れます（★記憶の値を打たない★）。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
/* ★入口は2つ★＝請求書の画面 と ★その手前のホーム画面★。
   2026-08-26 に 請求書だけ数えて運んだら、★ホームの css/hub.css・js/hub.js・lib/access.js・
   js/auth.js・manifest.json の5本が抜けて ホームが 素っ裸で動かない★ 所だった。
   ＝「呼ぶ側だけ写して白画面」の実例。★出す画面は全部 入口として数える★。 */
const ENTRIES = ['seikyu/index.html', 'index.html'];

/* ★見張りも一緒に運ぶ★＝無いと 本番だけ古くなる（payslip-app で40件が2週間 生きていた）
   seikyu/tests は「請求書そのものの見張り」なので 一緒に行く。
   docs/ と supabase/ は ★請求書の見張りが見る物★（状態の表・棚の設計図）なので 一緒に行く。
   ★配信はしない★＝.vercelignore で外す（客に SQL や覚書を配らない）。
   kyuyo/tests は行かない＝給与の画面を運ばないから（見る物が無い試験は CI から外す＝④）
   seikyu/ は ★丸ごと★ 運ぶ＝入口から呼ばれていない物(seikyu/lib/seikyu-book.js など)も
   ★見張りが「作ったが呼ばれていない台帳」として見ている★ので、置いていくと 台帳が空になって
   見張りが空振りする（2026-08-26 実測）。 */
const GUARDS = ['seikyu', 'tests', 'scripts', '.github', 'package.json', 'tests-no-ci.json',
  'vercel.json', '.gitattributes', '.gitignore', 'CLAUDE.md', 'sw.js', 'docs', 'supabase',
  /* ★押した時だけ読む物★＝自作PDFの道具と 字体（pdf-lib / fontkit / BIZ UDPGothic）。
     ★数える道具（dep-count）は 見つけられない★＝押した時に 読むので 参照が 書いていない。
     2026-08-31 実測：これが 抜けていて 本番で ★PDFが1枚も作れない★所だった
     （seikyu/tests/dep-guard の「押した時だけ読む物」が 赤で 捕まえた）。 */
  'vendor',
  /* ★webkit.yml が 呼ぶ 記録係★（tools/aka-kiroku.mjs）。
     ★呼ぶ物と 呼ばれる物は 一緒に 運ぶ★＝置いていくと 運び先の CIが
     「Cannot find module」で 赤に なる（2026-08-31 に 同じ型で 実際に 起きた）。 */
  'tools'];

/* ★運び先に無いファイルを見に行く試験は 運ばない★（名前と 見に行った先を 全部 書き残す）
   ＝置いていくと「登録していない試験が在る」で見張りが赤くなり、
     直そうとして ★見張りの登録の方を緩める★ という一番まずい直し方に流れる。
   ★ソースを読んで決めない★＝自己確認の中には ★わざと在るはずのない名前★（js/a.js や
   「ここに写しを作ったら赤」の seikyu/lib/shouhizei-ritsu.js）が書いてある。
   ソースの字で判定すると ★正しく動く試験まで捨てる★（2026-08-26 実際にそうなった）。
   ⇒ ★実際に走らせて、無いファイルを開こうとして転んだ物だけ★ を外す。 */
export function unrunnableTests(to) {
  const dirs = ['tests', 'seikyu/tests'];
  const out = [];
  dirs.forEach((d) => {
    const dir = path.join(to, d);
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach((n) => {
      const p = path.join(dir, n);
      if (!fs.statSync(p).isFile() || !/\.(mjs|js)$/.test(n)) return;
      if (n === 'run.js') return;                 /* 束ねる物は 中身が減れば付いてくる */
      let err = '';
      try {
        execFileSync(process.execPath, [d + '/' + n],
          { cwd: to, encoding: 'utf8', stdio: 'pipe', maxBuffer: 20 * 1024 * 1024 });
        return;                                   /* 通った＝ここで走れる */
      } catch (e) { err = String((e.stdout || '') + (e.stderr || '')); }
      const gone = [];
      const re = /(?:ENOENT[^\n]*?(?:open|scandir|stat) |Cannot find module )'([^']+)'/g;
      let m;
      while ((m = re.exec(err))) {
        /* ★在るかどうかは 運び先を基準に見る★
           ＝相対の道のまま fs.existsSync に渡すと ★今いる場所（＝元の repo）を見て★
             「在る」と答え、1本も外れない（2026-08-26 Linux の CI だけ赤になった正体）。 */
        const abs = path.isAbsolute(m[1]) ? m[1] : path.join(to, m[1]);
        const rel = path.relative(to, abs).split(path.sep).join('/');
        if (!fs.existsSync(abs) && gone.indexOf(rel) < 0) gone.push(rel);
      }
      /* ★無いファイルのせいで転んだ物だけ★ 外す。それ以外の赤は 外さない＝直す物 */
      if (gone.length) out.push({ file: d + '/' + n, gone: gone });
    });
  });
  return out;
}

/* ★配信から外す物★＝repo には置くが Vercel には上げない（見張りは生かす・客には配らない） */
const VERCELIGNORE = ['# ★運ぶ道具(scripts/ship-seikyu.mjs)が作る。手で書かない★',
  '# repo には置く（見張りが見る）が ★客には配らない★ 物。',
  'docs/', 'supabase/', 'tests/', 'seikyu/tests/', 'scripts/', 'node_modules/', ''];

/* ★この repo では走らせない見張り★（黙って外さない＝ここに名前と理由を書く）
   ＝「見る物の量が この repo では違う」ので しきい値が意味を持たない物だけ。
   ★見張りを弱めるのではなく、元の rakually-test 側で 毎回 全部 走らせる★。 */
const CI_SKIP = [
  { has: '運ぶ道具の自己確認',
    why: '運び先には もう給与のタイルが無い＝「外せるか」を試せない（元の側で毎回 走る）' },
  { has: '★重複ガード',
    why: '法定データの一覧が この repo では2本だけ＝「一覧が実物と合っているか」の空振り検査が成り立たない' },
  { has: '★参照ガード',
    why: '相対参照の本数で空振りを見る作り＝画面が2枚のこの repo では しきい値が意味を持たない' },
  { has: '設定ファイルに知らない項目',
    why: '設定ファイルの本数で空振りを見る作り＝この repo には2本しか無い' },
  { has: 'HTMLの中のJSが構文として通るか',
    why: 'インラインscriptを持つHTMLが この repo には無い＝0本で空振り判定になる' },
  { has: 'HTMLの中のJS (わざと壊して',
    why: '同上（自己確認も 実物のインラインscriptを1本 壊す作り）' },
  { has: '空振りしているテストが無いか',
    why: 'kyuyo/tests を見に行く作り＝この repo には無い' },
  { has: 'Stamp tool tests',
    why: '入口のインラインscriptと 撤去した看板の一覧を見る作り＝この repo には見る物が無い' },
  { has: '★配信ガード',
    why: '★配信HTMLの本数で空振りを見る作り★＝この repo は2枚しか無い（自己確認も給与の画面を壊す作り）' },
  { has: 'CI coverage guard',
    why: 'CIが回すテストの本数で空振りを見る作り＝この repo では本数が違う' },
  { has: '同じ見張りを わざと壊して 赤になるか（本物に1件 戻す所まで）',
    why: '自己確認が ★給与の kyuyo/js/app.js に1件 戻して★ 赤を確かめる作り（本体の screen-words は毎回 走る）' },
  { has: 'アイコンの ?v=',
    why: '5画面＋manifest3本を名前で固定して数える作り＝この repo は2画面＋manifest1本' },
  { has: '黙って0を返す catch',
    why: 'お金の所の一覧に 給与のファイルが入っている＝この repo では一覧が成り立たない（元で毎回 走る）' },
  { has: '給与の状態',
    why: '給与の画面を数える道具＝この repo には給与の画面が無い' },
  { has: '描かれた字の色',
    why: '13画面を名前で固定して描かせる作り＝この repo は2画面（色は元の側で毎回 数える）' }
];

/* ★走らせない事にした見張りの「試験ファイル」は 置いていかない★
   ＝置くと「在るのに登録していない＝1本も走っていない」で見張りが赤くなり、
     ★見張りの登録の方を緩める★ という一番まずい直し方に流れる。 */
function testFilesOfSkipped(dropped) {
  const out = [];
  dropped.forEach((d) => (d.files || []).forEach((f) => {
    if (/^(tests|seikyu\/tests)\//.test(f) && /\.(mjs|js)$/.test(f) && out.indexOf(f) < 0) out.push(f);
  }));
  return out;
}

/* ★束ねる物(tests/run.js)の一覧から 消えたファイルを外す★（1行1本なので 行ごと外す） */
export function pruneRunList(src, exists) {
  const lines = src.split('\n');
  const kept = [];
  const gone = [];
  lines.forEach((L) => {
    const m = L.match(/^\s*\[?\s*'([A-Za-z0-9_.-]+\.(?:mjs|js))'/);
    if (m && !exists(m[1])) { gone.push(m[1]); return; }
    kept.push(L);
  });
  return { src: kept.join('\n'), gone: gone };
}

function count(root) {
  const all = { inside: [], outside: [], missing: [] };
  ENTRIES.forEach((e) => {
    const out = execFileSync(process.execPath, ['scripts/dep-count.mjs', e, '--json'],
      { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
    const j = JSON.parse(out);
    ['inside', 'outside', 'missing'].forEach((k) => {
      (j[k] || []).forEach((f) => { if (all[k].indexOf(f) < 0) all[k].push(f); });
    });
  });
  /* ★入口そのもの も数に入れる★＝dep-count が返すのは「入口が呼ぶ物」だけ */
  ENTRIES.forEach((e) => {
    const box = e.indexOf('/') < 0 ? all.outside : all.inside;
    if (box.indexOf(e) < 0 && all.inside.indexOf(e) < 0 && all.outside.indexOf(e) < 0) box.push(e);
  });
  return all;
}

/* ★入口の js からも 給与への行き先を 外す★（請求書だけ出すので kyuyo/ は無い）
   ＝タイルだけ外しても ★「← 給与へ戻る」の帰り道★が 残っていて 行き止まりになる
   （2026-08-31 実測：運び先の screen-words が「画面に出る字に 給与」で 赤になって 捕まえた）。 */
export function hubJsWithoutKyuyo(src) {
  const re = new RegExp('\\n\\s*kyuyo:\\s*\\{[^}]*\\},?');
  if (!re.test(src)) return { src: src, removed: 0 };
  return { src: src.replace(re, ''), removed: 1 };
}

/* ★入口から 給与のタイルを外す★（請求書だけ出すので kyuyo/ は無い） */
export function hubWithoutKyuyo(html) {
  const i = html.indexOf('<a class="tile" id="tile-payslip"');
  if (i < 0) return { html: html, removed: 0 };
  const end = html.indexOf('</a>', i);
  if (end < 0) return { html: html, removed: 0 };
  const before = html.slice(0, i).replace(/\s+$/, '\n      ');
  return { html: before + html.slice(end + 4), removed: 1 };
}

/* ★CIのステップが 触るファイルを 全部 拾う★（run: の中の それらしい道だけ） */
export function filesOfStep(block) {
  const out = [];
  const re = /[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+\.(?:mjs|js|html|json|yml|sh)/g;
  block.split('\n').forEach((L) => {
    if (/^\s*#/.test(L)) return;               /* ★覚書の中の道は 数えない★ */
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(L))) if (out.indexOf(m[0]) < 0) out.push(m[0]);
  });
  return out;
}

/* ★運び先に無いファイルを指すステップを外す★（外した物は名前を返す） */
export function ciForShipped(yml, exists) {
  const head = yml.indexOf('\n      - name:');
  if (head < 0) throw new Error('CIの形が変わっています（- name: が見つからない）');
  const top = yml.slice(0, head + 1);
  const rest = yml.slice(head + 1);
  const parts = rest.split(/\n(?=      - name:)/);
  const kept = [];
  const dropped = [];
  const mixed = [];
  const skipUsed = {};
  parts.forEach((b) => {
    const nm0 = (b.match(/- name:\s*(.*)/) || [, '?'])[1].trim();
    /* ★手で書いた「走らせない」一覧★（理由つき）を先に見る */
    const sk = CI_SKIP.filter((s) => nm0.indexOf(s.has) >= 0)[0];
    if (sk) {
      skipUsed[sk.has] = 1;
      dropped.push({ name: nm0, files: filesOfStep(b), why: sk.why });
      return;
    }
    const files = filesOfStep(b);
    if (!files.length) { kept.push(b); return; }
    const gone = files.filter((f) => !exists(f));
    if (!gone.length) { kept.push(b); return; }
    const nm = (b.match(/- name:\s*(.*)/) || [, '?'])[1].trim();
    /* ★走らせる物(.mjs/.js)が 在る物と無い物に割れたら 赤★
       ＝そのまま外すと ★動くはずの試験まで 一緒に捨てる★ 事になるので 勝手に直さない
       （元の側で ステップを分ける）。
       見る物(.html など)だけが無い時は ★走らせても 見る物が無い★ ので 外して 名前を出す。 */
    const isRun = (f) => /\.(mjs|js)$/.test(f);
    if (files.filter(isRun).some(exists) && gone.some(isRun)) {
      mixed.push({ name: nm, have: files.filter(isRun).filter(exists), gone: gone });
      return;
    }
    dropped.push({ name: nm, files: files });
  });
  /* ★書いたのに1本も当たらない「走らせない」は 掃除し忘れ★＝黙って持ち続けない */
  const stale = CI_SKIP.filter((s) => !skipUsed[s.has]).map((s) => s.has);
  return { yml: top + kept.join('\n'), dropped: dropped, mixed: mixed, stale: stale };
}

/* ★外した物は 必ず CI の頭に書く★（この repo の決まり） */
function ciHeaderNote(yml, dropped) {
  const mark = '\non:\n';
  const i = yml.indexOf(mark);
  if (i < 0) return yml;
  const lines = ['',
    '# ★★ここは 本番 rakunally（請求書だけ）★★ … 元は rakually-test の CI をそのまま運んだ物。',
    '#   scripts/ship-seikyu.mjs が ★運び先に無いファイルを指すステップだけ★ 外して作る。',
    '#   ★外した理由は1つだけ＝給与の画面(kyuyo/)を運んでいないから★（機能を削った訳ではない）。',
    '#   ★戻す条件★: 本番にも給与を出す日（＝10月の改名・URL切替の塊）。その時 一緒に戻す。',
    '#   ★手で消さない★＝ここを直す時は rakually-test 側を直して 運び直す。',
    '#   ★外したステップ ' + dropped.length + '本★'];
  dropped.forEach((d) => lines.push('#     ・' + d.name
    + (d.why ? '  ★理由★ ' + d.why : '  ( ' + d.files.join(' , ') + ' )')));
  return yml.slice(0, i) + lines.join('\n') + yml.slice(i);
}

/* ★運び先の物を 上書きしてはいけないファイル★
   ＝倉庫の向き先（url / key / env）は ★配信ごとに違う★。
   ★2026-08-31 実測：この道具は「書き換えません」と言いながら 本番の js/supa-config.js を
     テストの値（env:'test'・DB-test）で 上書きしていた★。
   ＝そのまま出していたら ★本番の請求書が テストの倉庫を見て、テスト帯まで出る★ 所だった。 */
const KEEP_AT_DEST = ['js/supa-config.js'];
let keptFiles = [];

function copyOne(rel, to) {
  const src = path.join(ROOT, rel);
  const dst = path.join(to, rel);
  if (KEEP_AT_DEST.indexOf(rel.split(path.sep).join('/')) >= 0) {
    if (fs.existsSync(dst)) { keptFiles.push(rel); return; }   // 運び先の物を そのまま残す
    throw new Error('★運び先に ' + rel + ' が 無い★（倉庫の向き先は 指示役が入れる物）');
  }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}
function copyDir(rel, to) {
  const src = path.join(ROOT, rel);
  if (!fs.existsSync(src)) return 0;
  let n = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      const r = path.relative(ROOT, p).split(path.sep).join('/');
      copyOne(r, to); n++;
    }
  };
  if (fs.statSync(src).isDirectory()) walk(src); else { copyOne(rel, to); n = 1; }
  return n;
}

function ship(to, dry) {
  const before = count(ROOT);
  const need = before.inside.concat(before.outside);
  console.log('★写す前★ 中 ' + before.inside.length + '本 ／ 外 ' + before.outside.length
    + '本 ＝ 合計 ' + need.length + '本');
  if (before.missing.length) {
    console.error('★見つからない参照が ' + before.missing.length + '件★ … ' + before.missing.join(' , '));
    return 1;
  }
  if (dry) { console.log('（--dry なので 1つも書いていません）'); return 0; }

  fs.mkdirSync(to, { recursive: true });
  need.forEach((r) => copyOne(r, to));
  let g = 0;
  GUARDS.forEach((r) => { g += copyDir(r, to); });

  /* ★入口だけ 作り替える★ */
  const hub = path.join(to, 'index.html');
  const r = hubWithoutKyuyo(fs.readFileSync(hub, 'utf8'));
  if (!r.removed) { console.error('★入口から 給与のタイルを外せませんでした（作りが変わった）★'); return 1; }
  fs.writeFileSync(hub, r.html, 'utf8');
  console.log('★入口を作り替えた★ … 給与のタイルを 1個 外した');
  /* ★入口の js からも 帰り道を 外す★（行き止まりを 作らない） */
  const hubJs = path.join(to, 'js', 'hub.js');
  if (fs.existsSync(hubJs)) {
    const j = hubJsWithoutKyuyo(fs.readFileSync(hubJs, 'utf8'));
    if (!j.removed) { console.error('★入口の js から 給与の帰り道を 外せませんでした（作りが変わった）★'); return 1; }
    fs.writeFileSync(hubJs, j.src, 'utf8');
    console.log('★入口の js も 作り替えた★ … 「← 給与へ戻る」を 1個 外した');
  }

  /* ★運び先で走れない試験は 置いていかない★（名前と 見に行った先を 全部 出す）
     ＝自己診断では ここは飛ばす（全試験を2回 走らせると CI が重くなる）。
     その代わり ★分け方そのもの★ を 下で 小さな作り物で 1回 試す。 */
  const dead = process.env.SHIP_FAST ? [] : unrunnableTests(to);
  dead.forEach((d) => fs.rmSync(path.join(to, d.file), { force: true }));
  console.log('★運び先に無い物を見に行く試験を ' + dead.length + '本 外した★（元では毎回 走る）');
  dead.forEach((d) => console.log('    外した試験: ' + d.file + '  → 見に行く先 ' + d.gone.join(' , ')));

  /* ★CIを 作り替える★
     ★ci.yml だけでは 足りない★＝2026-08-31 実測：webkit.yml を そのまま運んだせいで
       置いていった試験（button-uniform / pdf-webkit / seal-shape / seal-pos）を 指し続け、
       ★本番のCIが Cannot find module で 赤★になった。
     ⇒ ★.github/workflows の yml を ぜんぶ 同じやり方で 作り替える★ */
  const exists = (f) => fs.existsSync(path.join(to, f));
  const wfDir = path.join(to, '.github/workflows');
  const others = fs.existsSync(wfDir)
    ? fs.readdirSync(wfDir).filter((f) => /\.ya?ml$/.test(f) && f !== 'ci.yml') : [];
  others.forEach((f) => {
    const fp = path.join(wfDir, f);
    const r2 = ciForShipped(fs.readFileSync(fp, 'utf8'), exists);
    if (r2.mixed.length) {
      console.error('★' + f + ' の1つのステップで 在る物と無い物が 混ざっています★');
      r2.mixed.forEach((m) => console.error('  ・' + m.name + ' … 無い＝' + m.gone.join(' , ')));
      throw new Error('mixed in ' + f);
    }
    fs.writeFileSync(fp, ciHeaderNote(r2.yml, r2.dropped), 'utf8');
    console.log('★' + f + ' も 作り替えた★ … 外したステップ ' + r2.dropped.length + '件'
      + (r2.dropped.length ? '（' + r2.dropped.map((d) => d.name).join(' ／ ') + '）' : ''));
  });
  const ciPath = path.join(to, '.github/workflows/ci.yml');
  const ci = ciForShipped(fs.readFileSync(ciPath, 'utf8'), exists);
  if (ci.mixed.length) {
    console.error('★1つのステップの中で 在る物と無い物が混ざっています（勝手に直しません）★');
    ci.mixed.forEach((m) => console.error('  ・' + m.name + ' … 無い＝' + m.gone.join(' , ')));
    return 1;
  }
  if (ci.stale.length) {
    console.error('★「走らせない」に書いたのに 当たらない物が ' + ci.stale.length + '件★ … '
      + ci.stale.join(' , ') + '（CIの名前が変わった＝掃除し忘れ）');
    return 1;
  }
  /* ★走らせない見張りの試験ファイルも 置いていかない★ */
  const skipFiles = testFilesOfSkipped(ci.dropped).filter(exists);
  skipFiles.forEach((f) => fs.rmSync(path.join(to, f), { force: true }));
  if (skipFiles.length) {
    console.log('★走らせない事にした試験を ' + skipFiles.length + '本 置いていかない★ … ' + skipFiles.join(' , '));
  }
  /* ★束ねる物の一覧からも 消えた分を外す★（残すと Cannot find module で赤） */
  const runPath = path.join(to, 'tests/run.js');
  if (fs.existsSync(runPath)) {
    const pr = pruneRunList(fs.readFileSync(runPath, 'utf8'),
      (f) => fs.existsSync(path.join(to, 'tests', f)));
    fs.writeFileSync(runPath, pr.src, 'utf8');
    console.log('★tests/run.js の一覧から ' + pr.gone.length + '本 外した★ … ' + pr.gone.join(' , '));
  }
  fs.writeFileSync(ciPath, ciHeaderNote(ci.yml, ci.dropped), 'utf8');
  fs.writeFileSync(path.join(to, '.vercelignore'), VERCELIGNORE.join('\n'), 'utf8');
  console.log('★配信から外す物を書いた★ … .vercelignore（docs/ supabase/ tests/ scripts/）');
  console.log('★CIを作り替えた★ … 運び先に無いファイルを指すステップを ' + ci.dropped.length + '本 外した');
  ci.dropped.forEach((d) => console.log('    外した: ' + d.name));
  const still = [];
  fs.readFileSync(ciPath, 'utf8').split(/\n(?=      - name:)/)
    .forEach((b) => filesOfStep(b).forEach((f) => {
      if (!exists(f) && still.indexOf(f) < 0) still.push(f);
    }));
  if (still.length) {
    console.error('★運び先のCIが まだ無いファイルを指しています★ … ' + still.join(' , '));
    return 1;
  }
  console.log('★運び先のCIが 指すファイル … 無い物 0件★');

  const after = count(to);
  const need2 = after.inside.concat(after.outside);
  console.log('★写した後★ 中 ' + after.inside.length + '本 ／ 外 ' + after.outside.length
    + '本 ＝ 合計 ' + need2.length + '本 ／ 見張りなど ' + g + '本');
  if (after.missing.length) {
    console.error('★運び先に 見つからない参照が ' + after.missing.length + '件★ … ' + after.missing.join(' , '));
    return 1;
  }
  if (need.length !== need2.length) {
    console.error('★前と後で 数が違います★ ' + need.length + ' → ' + need2.length);
    return 1;
  }
  console.log('\n★前と後で 同じ数（' + need.length + '本）／見つからない参照 0件★');
  console.log('★運び先の物を 残したファイル★ … '
    + (keptFiles.length ? keptFiles.join(' , ') : '★0件（＝上書きしている＝危ない）★'));
  console.log('★次にやる事★ … 運び先の js/supa-config.js は 触っていません（指示役の値のまま）');
  return 0;
}

if (process.argv.includes('--self-test')) {
    /* ★運び先の supa-config を 上書きしないか★（2026-08-31 実際に 上書きしていた） */
  {
    const t3 = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-keep-'));
    fs.mkdirSync(path.join(t3, 'js'), { recursive: true });
    fs.writeFileSync(path.join(t3, 'js', 'supa-config.js'), '// 本番の物\nwindow.SUPA={env:\'prod\'};\n', 'utf8');
    keptFiles = [];
    copyOne(path.join('js', 'supa-config.js'), t3);
    const after = fs.readFileSync(path.join(t3, 'js', 'supa-config.js'), 'utf8');
    const ok = /env:'prod'/.test(after) && keptFiles.length === 1;
    console.log('  ' + (ok ? '✓' : '✗') + ' ★運び先の js/supa-config.js を 上書きしない★');
    if (!ok) { console.error('  ★上書きしている＝本番が テストの倉庫を見る★'); process.exit(1); }
    /* 運び先に 無い時は 止まる（黙って テストの値を 置かない） */
    const t4 = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-keep2-'));
    let threw = false;
    try { copyOne(path.join('js', 'supa-config.js'), t4); } catch (e) { threw = true; }
    console.log('  ' + (threw ? '✓' : '✗') + ' ★運び先に 向き先が 無い時は 止まる★');
    if (!threw) process.exit(1);
  }
console.log('\n★自己診断★');
  let ng = 0;
  const must = (want, got, why) => {
    if (want !== got) { console.error('  ✗ ' + why + '（欲しい ' + want + ' / 出た ' + got + '）'); ng++; }
    else console.log('  ✓ ' + why);
  };
  const hub = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const r = hubWithoutKyuyo(hub);
  must(1, r.removed, '★入口から 給与のタイルを外せる★');
  /* ★入口の js からも 帰り道を 外せるか★（2026-08-31 本番で 行き止まりになりかけた） */
  {
    const src0 = fs.readFileSync(path.join(ROOT, 'js', 'hub.js'), 'utf8');
    const j = hubJsWithoutKyuyo(src0);
    must(1, j.removed, '★入口の js から 給与の帰り道を 外せる★');
    must(false, /給与へ戻る/.test(j.src), '外したあと 給与の帰り道が 残っていない');
    must(true, /請求書へ戻る/.test(j.src), '★請求書の帰り道は 残っている★');
    must(0, hubJsWithoutKyuyo(j.src).removed, '★もう無い時は 0を返す（黙って通さない）★');
  }
  must(false, /id="tile-payslip"/.test(r.html), '外したあと 給与のタイルが残っていない');
  must(true, /id="tile-seikyu"/.test(r.html), '★請求書のタイルは 残っている★');
  must(false, /href="kyuyo\/"/.test(r.html), '★kyuyo\/ への行き先が 1つも残っていない★');
  /* ★作りが変わったら 気づけるか★（外せなかったら 0を返す＝運ぶのを止める） */
  must(0, hubWithoutKyuyo('<html><body>タイルなし</body></html>').removed,
    '★タイルが無い入口では 0を返す（黙って通さない）★');
  /* ★CIの読み取りが 本当に道を拾えているか★ */
  const yml0 = fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8');
  const all = ciForShipped(yml0, () => true);
  /* ★全部 在る時に外れるのは 手で書いた一覧の分だけ★（ファイルが無くて外れる物は0本） */
  must(0, all.dropped.filter((d) => !d.why).length,
    '★全部 在る時に外れるのは 手で理由を書いた物だけ★（' + all.dropped.length + '本／一覧 '
    + CI_SKIP.length + '件）');
  must(0, all.stale.length, '★「走らせない」に書いた物が 全部 CIに実在する（掃除し忘れ0）★');
  must(0, all.mixed.length, '全部 在る時は 混ざりも0');
  const none = ciForShipped(yml0, (f) => f.indexOf('kyuyo/') !== 0);
  must(true, none.dropped.length > 0, '★kyuyo/ を消すと その分だけ外れる★（' + none.dropped.length + '本）');
  /* ★在る物と無い物が混ざったステップは 勝手に直さず 赤にするか★ */
  const mix = ciForShipped(yml0, (f) => !/ym-picker/.test(f));
  must(true, mix.mixed.length > 0, '★在る物と無い物が混ざったステップは 赤にする★');
  /* ★「走れない試験」の分け方を 小さな作り物で 1回 試す★
     ＝ソースの字で判定していた頃は ★わざと在るはずのない名前★を書いた自己確認を
       「走れない」と誤って捨てていた（2026-08-26）。その型を ここで固定する。 */
  const t2 = fs.mkdtempSync(path.join(os.tmpdir(), 'shipx-'));
  try {
    fs.mkdirSync(path.join(t2, 'tests'), { recursive: true });
    const nl = String.fromCharCode(10);
    fs.writeFileSync(path.join(t2, 'tests', 'a.test.mjs'),
      'import fs from "node:fs";' + nl + 'fs.readFileSync("kyuyo/index.html");' + nl, 'utf8');
    fs.writeFileSync(path.join(t2, 'tests', 'b.test.mjs'),
      'import fs from "node:fs";' + nl
      + 'if (fs.existsSync("kyuyo/index.html")) { throw new Error("在ってはいけない"); }' + nl
      + 'console.log("ok");' + nl, 'utf8');
    const d2 = unrunnableTests(t2);
    must(1, d2.length, '★無い物を開こうとして転んだ試験だけ 外す（1本）★');
    must('tests/a.test.mjs', (d2[0] || {}).file, '外れたのは 開こうとした方');
    must(true, ((d2[0] || {}).gone || []).join(',').indexOf('kyuyo/index.html') >= 0,
      '★見に行った先を 名前で残す★');
  } finally { fs.rmSync(t2, { recursive: true, force: true }); }
  /* ★数える所が 本当に効くか★＝運んでみて 前と後が同じ数になる */
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-'));
  try {
    /* ★運び先には 倉庫の向き先が すでに在る★（本番も そう）＝ここでも 先に置く。
       置かずに運ぼうとすると 止まる＝それが 正しい（上の自己診断で 確かめている）。 */
    fs.mkdirSync(path.join(tmp, 'js'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'js', 'supa-config.js'), path.join(tmp, 'js', 'supa-config.js'));
    process.env.SHIP_FAST = '1';
    const code = ship(tmp, false);
    delete process.env.SHIP_FAST;
    must(0, code, '★運んで 前と後が 同じ数になる★');
    must(true, fs.existsSync(path.join(tmp, 'kyuyo/lib/shouhizei-ritsu.js')),
      '★法定の2本（消費税）も 一緒に運ばれている★');
    /* ★押した時だけ読む物★（自作PDFの道具と字体）＝数える道具では 見つからない */
    ['vendor/pdf-lib.min.js', 'vendor/fontkit.umd.min.js', 'vendor/fonts/BIZUDPGothic-Regular.ttf']
      .forEach((f) => must(true, fs.existsSync(path.join(tmp, f)),
        '★' + f + ' が 運ばれていない（押しても PDFが 作れない）★'));
    must(false, /給与へ戻る/.test(fs.readFileSync(path.join(tmp, 'js', 'hub.js'), 'utf8')),
      '★運んだ入口の js に 給与の帰り道が 残っている（行き止まり）★');
    must(true, fs.existsSync(path.join(tmp, 'kyuyo/lib/shiharai-chosho.js')),
      '★法定の2本（支払調書）も 一緒に運ばれている★');
    must(false, fs.existsSync(path.join(tmp, 'kyuyo/index.html')),
      '★給与の画面は 運んでいない★');
    must(true, fs.existsSync(path.join(tmp, '.github/workflows/ci.yml')),
      '★見張り（CI）も 一緒に運ばれている★');
    must(true, fs.existsSync(path.join(tmp, 'seikyu/tests/seikyu-ui.mjs')),
      '★請求書の見張りも 一緒に運ばれている★');
    must(true, fs.existsSync(path.join(tmp, "css/hub.css")),
      "★ホーム画面の見た目(css/hub.css)も 一緒に運ばれている★");
    must(true, fs.existsSync(path.join(tmp, "js/hub.js")),
      "★ホーム画面の中身(js/hub.js)も 一緒に運ばれている★");
    must(true, fs.existsSync(path.join(tmp, "lib/access.js")),
      "★ホームが呼ぶ lib/access.js も 一緒に運ばれている★");
    must(true, fs.existsSync(path.join(tmp, "supabase")) && fs.existsSync(path.join(tmp, "docs")),
      "★見張りが見る docs/ と supabase/ も 一緒に運ばれている★");
    must(true, fs.readFileSync(path.join(tmp, '.vercelignore'), 'utf8').indexOf('docs/') >= 0,
      "★docs/ は 配信から外してある★");
    const shipped = fs.readFileSync(path.join(tmp, '.github/workflows/ci.yml'), 'utf8');
    must(true, /外したステップ \d+本/.test(shipped), '★外した物が CI の頭に書いてある★');
    must(false, /kyuyo\/tests\//.test(shipped.replace(/^\s*#.*$/gm, '')),
      '★運んだCIに 給与の試験が 1本も残っていない（覚書の中は数えない）★');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  if (ng) { console.error('\n★自己診断 ' + ng + '件 失敗★'); process.exit(1); }
  console.log('\n自己診断 ぜんぶ 正しい');
  process.exit(0);
}

const toI = process.argv.indexOf('--to');
if (toI < 0) {
  console.error('使い方: node scripts/ship-seikyu.mjs --to <運び先> [--dry] ／ --self-test');
  process.exit(2);
}
process.exit(ship(path.resolve(process.argv[toI + 1]), process.argv.includes('--dry')));
