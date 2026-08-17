/* no-dead-ui.test.mjs — ★出来ていない物を客に見せない／画面を止めない★
 *
 * なぜ必要か（2026-08-16・指示役が本番の配信物を数えて発見）:
 *   複数選択の「AIへ」ボタンが本番に在り、押すと
 *     「AI送信はSTEP6で実装予定（N範囲プレビュー）」
 *   と出ていた。トーストが無い時は ★alert★ で ★画面全体が止まる★。
 *   （白紙の印刷ダイアログで固まったのと同じ型）
 *
 * ★止める事 3つ★
 *   ① 画面を止める窓（alert / confirm / prompt）を配信物に1つも置かない
 *   ② 描き終わった画面に「実装予定 / STEP<数字> / 未実装 / TODO」を1つも出さない
 *      ＝★中の言葉（作る側の段取り）を人に見せない★
 *   ③ ★押しても何も無いボタンを置かない★
 *      onclick に書いた関数が本当に在るかを、画面を起動して1つずつ確かめる
 *      （関数だけ消してボタンが残る、の逆の事故を止める）
 *
 * ★2026-08-17 Rakually を立てた時に見る物を替えた（見張りを弱くしていないかを1つずつ書く）★
 *   ・前は ★book.html 1枚★ を起動して見ていた。ブック(Excelの式エンジン)は Exally の物なので
 *     Rakually には無い。代わりに ★配信する5画面ぜんぶ★ を起動して見る（1枚→5枚＝強くなった）。
 *   ・★③「onclick が呼ぶ関数が実在するか」は Rakually に対象が0件★
 *     ＝5画面とも inline onclick を1つも使っていない（全部 addEventListener）。
 *     だから ★inline onclick を足したら赤★ に置き換えた（戻したら気づく形にする）。
 *     「押しても何も無いボタン」を実際に押して見る役目は
 *     ★kyuyo/tests/ui-smoke.mjs（全ボタンを押してJS例外0）★ と
 *     ★seikyu/tests/seikyu-ui.mjs★ が持っている（そちらは本当に押している）。
 *   ・★⑤「灰色＋理由の見本(電子ハンコ)」は book.html の中の物★だったので外した。
 *     「準備中/実装予定」の札が0件であることは ★②・★②-c が5画面と全配信物で見る。
 *
 * 使い方: node tests/no-dead-ui.test.mjs
 *         node tests/no-dead-ui.test.mjs --self-test   … わざと戻して赤になるか
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(pathToFileURL(path.join(ROOT, 'package.json')));

/* ★見る物＝客のブラウザへ配る物だけ★
   api/ は Vercel の関数（サーバ側）で、客の画面には出ない。
   その中の「まだ未対応（将来実装予定）」は AI への指示文＝Excel関数の対応状況の説明なので対象外。 */
const SKIP_DIR = /node_modules|[\\/]tests[\\/]|[\\/]scripts[\\/]|[\\/]tools[\\/]|[\\/]api[\\/]|[\\/]docs[\\/]|[\\/]supabase[\\/]/;
const SKIP_FILE = /\.min\.js$|hyperformula\.full|^sw\.js$/;

function deliveredFiles() {
  const out = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      if (name === '.git' || name === 'node_modules') continue;
      const st = fs.statSync(p);
      if (st.isDirectory()) { if (!SKIP_DIR.test(p + path.sep)) walk(p); continue; }
      if (!/\.(html|js)$/.test(name)) continue;
      if (SKIP_DIR.test(p) || SKIP_FILE.test(name)) continue;
      out.push(path.relative(ROOT, p).replace(/\\/g, '/'));
    }
  };
  walk(ROOT);
  return out.sort();
}

/* 画面を止める窓。`window.alert` のような書き方も拾う（前が . でも数える） */
const BLOCKING = /(?:^|[^\w$])(?:window\s*\.\s*)?(alert|confirm|prompt)\s*\(/g;
/* 中の言葉（作る側の段取り）。★人に見せてはいけない★ */
const INTERNAL_WORDS = /実装予定|未実装|STEP\s*\d|TODO|FIXME|工事中|coming\s*soon/i;

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };

/* ── 画面を起動して、描き終わった状態を見る ── */
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch {
  console.log('\n[no-dead-ui] ★jsdom が入っていません（npm install）。★緑ではありません★');
  process.exit(1);
}

/* ★配信する画面ぜんぶ★（1枚でも抜けたら、そこだけ見張りの外になる） */
const SCREENS = ['index.html', 'kyuyo/index.html', 'kyuyo/admin.html', 'kyuyo/meisai.html', 'seikyu/index.html'];

async function bootScreen(rel, htmlOverride) {
  const abs = path.join(ROOT, rel);
  const html = htmlOverride || fs.readFileSync(abs, 'utf8');
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' + rel
  });
  const win = dom.window, doc = win.document;
  win.fetch = () => Promise.reject(new Error('no net'));
  win.scrollTo = () => {};
  /* ★alert を握って「呼ばれたら記録」する★＝本当に画面が止まる物が残っていないかを実際に見る */
  const blocked = [];
  win.alert = (m) => { blocked.push('alert: ' + m); };
  win.confirm = (m) => { blocked.push('confirm: ' + m); return false; };
  win.prompt = (m) => { blocked.push('prompt: ' + m); return null; };
  const ctx = new Proxy({}, {
    get: (t, k) => (k === 'measureText' ? (() => ({ width: 10 }))
      : k === 'canvas' ? { width: 800, height: 600 }
        : k === 'getImageData' ? (() => ({ data: [] })) : (() => {}))
  });
  win.HTMLCanvasElement.prototype.getContext = () => ctx;
  const inject = (code) => { const el = doc.createElement('script'); el.textContent = code; doc.body.appendChild(el); };
  let loadedJs = 0;
  for (const m of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
    const src = m[1].split('?')[0];
    if (/^https?:/.test(src)) continue;
    /* ★画面のある場所から数える★（kyuyo/ や seikyu/ の `../lib/…` を根から見ると読めない） */
    inject(fs.readFileSync(path.resolve(path.dirname(abs), src), 'utf8'));
    loadedJs++;
  }
  for (const m of html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)) inject(m[1]);
  if (doc.readyState !== 'complete') await new Promise((r) => win.addEventListener('load', r, { once: true }));
  else win.dispatchEvent(new win.Event('load'));
  return { win, doc, blocked, loadedJs };
}

/* 画面に出ている文字（属性の title / placeholder / aria-label も人が読む）
   ★<script> の中身は画面の文字ではない★ ので外す。外さないと
   コードの中のコメントまで「画面に出ている」と数えてしまう。 */
function visibleText(doc) {
  if (!doc.body) return '';
  const clone = doc.body.cloneNode(true);
  for (const el of clone.querySelectorAll('script,style,template,noscript')) el.remove();
  const parts = [clone.textContent || ''];
  for (const el of clone.querySelectorAll('[title],[placeholder],[aria-label],[alt]')) {
    for (const a of ['title', 'placeholder', 'aria-label', 'alt']) {
      const v = el.getAttribute(a);
      if (v) parts.push(v);
    }
  }
  return parts.join('\n');
}

/* onclick="fn(...)" の fn を取り出す */
function onclickTargets(doc) {
  const out = [];
  for (const el of doc.querySelectorAll('[onclick]')) {
    const code = el.getAttribute('onclick') || '';
    for (const m of code.matchAll(/(?:^|[^\w$.])([A-Za-z_$][\w$]*)\s*\(/g)) out.push({ fn: m[1], el: el.id || el.tagName, code: code.slice(0, 60) });
  }
  return out;
}
const JS_KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'return', 'typeof', 'function', 'catch', 'new', 'delete', 'void']);

/* ★data-go="scr-○○" の行き先が本当に在るか★（押しても何も起きないボタンの Rakually 版）。
   入口(index.html)は画面の出し入れを data-go でやっているので、行き先が消えたらここで捕まる。 */
function deadGoTargets(doc) {
  const out = [];
  for (const el of doc.querySelectorAll('[data-go]')) {
    const id = el.getAttribute('data-go');
    if (!id || !doc.getElementById(id)) out.push((el.id || el.textContent || '').trim() + ' → #' + id);
  }
  return out;
}

/* ═══ 自己テスト：わざと戻して赤になるか ═══ */
if (process.argv.includes('--self-test')) {
  console.log('\n[no-dead-ui --self-test] ★わざと戻して赤になるか');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

  T('① alert を1つ足すと 数え方が拾う', () => {
    const broken = html.replace('<body', "<script>function _x(){ alert('だめ'); }</script><body");
    const n = (broken.match(BLOCKING) || []).length;
    if (n === 0) throw new Error('足した alert を拾えていない＝この数え方は空振り');
  });
  T('② 「実装予定」を画面に出すと 文字の検査が拾う', async () => {
    if (!INTERNAL_WORDS.test('AI送信はSTEP6で実装予定')) throw new Error('中の言葉を拾えていない');
    if (INTERNAL_WORDS.test('開きました（見るだけ）')) throw new Error('普通の文まで拾っている＝誤検知');
  });
  T('②-b 画面に「実装予定」を1つ置いたら、起動して見る検査が拾う', async () => {
    const broken = html.replace('<div class="tiles">', '<div class="tiles"><p>AI送信はSTEP6で実装予定</p>');
    const { win, doc } = await bootScreen('index.html', broken);
    const bad = visibleText(doc).split('\n').filter((s) => INTERNAL_WORDS.test(s));
    win.close();
    if (!bad.length) throw new Error('画面に出した中の言葉を拾えていない＝この検査は空振り');
  });
  T('③ inline onclick を1つ足すと 拾う（addEventListener に戻していない事に気づく）', async () => {
    const broken = html.replace('<div class="tiles">', '<div class="tiles"><button onclick="thisFunctionDoesNotExist()">こわす</button>');
    const { win, doc } = await bootScreen('index.html', broken);
    const n = onclickTargets(doc).length;
    win.close();
    if (n === 0) throw new Error('足した inline onclick を拾えていない＝この検査は空振り');
  });
  T('③-b 行き先の無い data-go を足すと 拾う', async () => {
    const broken = html.replace('<div class="tiles">', '<div class="tiles"><button type="button" data-go="scr-nowhere">こわす</button>');
    const { win, doc } = await bootScreen('index.html', broken);
    const dead = deadGoTargets(doc);
    win.close();
    if (!dead.length) throw new Error('行き先の無いボタンを拾えていない＝この検査は空振り');
  });
  T('④ 本物の5画面が ちゃんと起動する（読む物が0だと空振り）', async () => {
    for (const s of SCREENS) {
      const { win, doc, loadedJs } = await bootScreen(s);
      const n = doc.querySelectorAll('button,a').length;
      win.close();
      if (loadedJs < 3) throw new Error(s + ': 読めたJSが ' + loadedJs + '本＝読めていない');
      if (n < 5) throw new Error(s + ': 押せる物が ' + n + '個＝描けていない');
    }
  });
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

console.log('\n[no-dead-ui] 出来ていない物を客に見せていないか／画面を止めていないか');

const files = deliveredFiles();
console.log('  見た配信物: ' + files.length + '本');

/* ★消す前の「本当に消しますか」だけは、置き換える物が出来るまで残す★
   ここに書いていない confirm が増えたら赤。alert / prompt は例外なしで0件。 */
const CONFIRM_ALLOW = {
  'js/hub.js': {
    n: 1, what: '取引先を削除する前の1枚',
    why: '消す操作の歯止め。今 外すと ★確認なしで消える★ ので、置き換える物が出来るまで残す',
    replaceWith: '★Timeally が作っている「画面の中で1回 聞く形」を借り物として持ってくる★（作り直さない）',
    due: '2026-09-30',
  },
  'js/ledger.js': {
    n: 1, what: '台帳の記録を削除する前の1枚',
    why: '同上',
    replaceWith: '同上（借りてきた同じ部品を hub と台帳の両方から使う）',
    due: '2026-09-30',
  },
  'seikyu/js/seikyu-app.js': {
    n: 4, what: '入金の記録を消す／請求書を取り消す／下書きを削除する／角印を消す の4枚',
    why: 'どれも消す操作の歯止め。★請求書セッションの持ち物なので Exally は触らない★',
    replaceWith: '同じ借り物の部品（請求書セッションが差し替える）',
    due: '2026-09-30',
  },
};

T('★① alert / prompt が配信物に0件（例外なし）', () => {
  const hits = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of src.matchAll(BLOCKING)) {
      if (m[1] === 'confirm') continue;
      const line = src.slice(0, m.index).split('\n').length;
      hits.push(f + ':' + line + ' ' + m[0].trim());
    }
  }
  if (hits.length) {
    throw new Error('★' + hits.length + '件★ 画面が止まります。知らせはトースト(notify/showToast)で出すこと\n     '
      + hits.slice(0, 10).join('\n     '));
  }
});

T('★①-b confirm は「消す前の1枚」だけ（増えたら赤・台帳に理由と期限）', () => {
  const found = {};
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of src.matchAll(BLOCKING)) {
      if (m[1] !== 'confirm') continue;
      found[f] = (found[f] || 0) + 1;
    }
  }
  const unexpected = Object.keys(found).filter((f) => !CONFIRM_ALLOW[f]);
  if (unexpected.length) throw new Error('台帳に無い confirm: ' + unexpected.join(', '));
  const shown = [];
  for (const f of Object.keys(CONFIRM_ALLOW)) {
    const e = CONFIRM_ALLOW[f];
    /* ★本番とテスト線で持っている画面が違う★。無いファイルは飛ばす（この台帳は両方で同じ物） */
    if (!fs.existsSync(path.join(ROOT, f))) continue;
    if (!found[f]) throw new Error(f + ' の confirm が0個＝置き換えたなら台帳から外すこと（残したままにしない）');
    if (found[f] !== e.n) throw new Error(f + ' の confirm が ' + found[f] + '個（台帳は ' + e.n + '個）＝増やさない');
    if (new Date(e.due) < new Date('2026-08-16')) throw new Error(f + ': 期限切れ ' + e.due);
    shown.push('     残している confirm: ' + f + ' ×' + e.n + ' … ' + e.what + '（期限 ' + e.due + '）');
  }
  if (!shown.length) throw new Error('台帳の対象ファイルが1つも無い＝この検査は空振り');
  shown.forEach((s) => console.log(s));
});

/* ★5画面ぜんぶ起動する★（押す物・行き先・止める窓を、画面ごとに数える） */
const booted = [];
for (const s of SCREENS) booted.push({ rel: s, ...(await bootScreen(s)) });

T('★② 描き終わった画面に「実装予定 / STEP<数字> / 未実装 / TODO」が0件（5画面）', () => {
  const bad = [];
  for (const b of booted) {
    for (const line of visibleText(b.doc).split('\n')) {
      if (INTERNAL_WORDS.test(line) && line.trim()) bad.push(b.rel + ': ' + line.trim());
    }
  }
  if (bad.length) throw new Error('★中の言葉が人に見えています★\n     ' + bad.slice(0, 8).join('\n     '));
  console.log('     見た画面 ' + booted.length + '枚（' + SCREENS.join(' / ') + '）');
});

/* ★押す物の一覧を先に書いてから押す★（数だけ報告しない）
   ②は「描いた直後の画面」しか見られない。中の言葉は
   ★ボタンを押した時の知らせにだけ出る★事があるので、実際に押して出た文字を見る。
   ここで押すのは ★入口の画面を移すボタン（タイル・下の帯）★＝Rakually で押す物の全部。
   給与と請求書の中のボタンは kyuyo/tests/ui-smoke.mjs と seikyu/tests/seikyu-ui.mjs が押す。 */
const PRESS_LIST = ['#scr-hub .tile', 'nav.bn .bn-i'];
T('★②-b 入口のボタンを実際に押して、出た知らせに中の言葉が無い／止める窓が開かない', () => {
  const home = booted.find((b) => b.rel === 'index.html');
  const doc = home.doc, win = home.win;
  const toastEl = doc.getElementById('toast');
  const shown = [];
  let pressed = 0;
  for (const sel of PRESS_LIST) {
    for (const b of doc.querySelectorAll(sel)) {
      const label = (b.textContent || b.id || '').replace(/\s+/g, ' ').trim().slice(0, 20);
      b.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
      pressed++;
      shown.push(label + ' → ' + (toastEl ? (toastEl.textContent || '').trim() : '') + ' / 出た画面=' + (doc.querySelector('.scr.active') || {}).id);
    }
  }
  if (pressed < 5) throw new Error('押す物が ' + pressed + '個＝この検査は空振り（' + PRESS_LIST.join(', ') + '）');
  console.log('     押した物 ' + pressed + '個: ' + shown.map((s) => JSON.stringify(s)).join(' / '));
  const bad = shown.filter((s) => INTERNAL_WORDS.test(s));
  if (bad.length) throw new Error('★押したら中の言葉が出ました★\n     ' + bad.join('\n     '));
  if (home.blocked.length) throw new Error('★押したら画面を止める窓が開きました★ ' + home.blocked.join(' / '));
});

T('★②-c 配信するファイルの中身にも 中の言葉が1文字も無い（数えた人が誤読しない）', () => {
  /* ★注記(コメント)に書き写すのも駄目★。配信物を grep で数えた人には
     「まだ残っている」と読める。実際 2026-08-16 に テスト線の配信で2件と数えられた。
     ★見るのは「出来ていない」と読める言葉だけ★。
     `// STEP2: …` のような ★段落の目印★ は普通の書き方なので数えない
     （それまで止めると、関係のない注記の書き換えを強いる＝直しが太る）。 */
  const hits = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of src.matchAll(/実装予定|未実装|工事中|coming\s*soon/gi)) {
      hits.push(f + ':' + src.slice(0, m.index).split('\n').length + ' ' + m[0]);
    }
  }
  if (hits.length) throw new Error('★' + hits.length + '件★（注記の中でも書き写さない）\n     ' + hits.slice(0, 8).join('\n     '));
});

T('★③ inline onclick が5画面とも0件（全部 addEventListener・戻したら赤）', () => {
  const hits = [];
  let buttons = 0;
  for (const b of booted) {
    buttons += b.doc.querySelectorAll('button,a').length;
    for (const t of onclickTargets(b.doc)) hits.push(b.rel + ': ' + t.el + ' → ' + t.fn + '()');
  }
  if (buttons < 50) throw new Error('押せる物が ' + buttons + '個しか数えられていない＝空振り');
  if (hits.length) {
    throw new Error('★' + hits.length + '件★ inline onclick が戻っています（押しても何も無いボタンの元）\n     '
      + hits.slice(0, 8).join('\n     '));
  }
  console.log('     押せる物 ' + buttons + '個 / inline onclick 0件（実際に押す見張り＝ui-smoke.mjs・seikyu-ui.mjs）');
});

T('★③-b 画面を移すボタンの行き先が全部 実在する（押しても何も起きないボタンが無い）', () => {
  const dead = [];
  let go = 0;
  for (const b of booted) {
    go += b.doc.querySelectorAll('[data-go]').length;
    for (const d of deadGoTargets(b.doc)) dead.push(b.rel + ': ' + d);
  }
  if (!go) throw new Error('data-go のボタンが0個＝この検査は空振り');
  if (dead.length) throw new Error('★' + dead.length + '件★ 行き先が無い\n     ' + dead.join('\n     '));
  console.log('     画面を移すボタン ' + go + '個ぜんぶ 行き先が在る');
});

T('★④ 起動から描き終わりまでに 画面を止める窓が1度も開かない（5画面・実際に握って確かめた）', () => {
  const bad = booted.filter((b) => b.blocked.length).map((b) => b.rel + ': ' + b.blocked.join(' / '));
  if (bad.length) throw new Error('★' + bad.length + '画面★ ' + bad.slice(0, 3).join(' / '));
});

for (const b of booted) b.win.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
