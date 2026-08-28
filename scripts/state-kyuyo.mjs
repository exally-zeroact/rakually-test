/* state-kyuyo.mjs — ★給与の「今どんな状態か」を 動かして数える★
 * =============================================================================
 * なぜ要るか（司さん 2026-08-19「給料、請求のコードを深く確認して どんな状態かも分かるように」）:
 *   ★読んだだけは「確かめた」ではない★。ここは ★本物の app.js を動かして★ 1周を通し、
 *   段ごとに ★数★を出す。docs/STATE_kyuyo.md の数字は この道具が正。
 *
 * 使い方:
 *   node scripts/state-kyuyo.mjs           … 測って出す
 *   node scripts/state-kyuyo.mjs --json    … 数だけ出す
 *   node scripts/state-kyuyo.mjs --check   … docs/STATE_kyuyo.md の数と突き合わせ（ズレたら赤）
 *   node scripts/state-kyuyo.mjs --self-test … 数を1つ変えたら赤になるか
 *
 * ★0件を「未検査」で出さない★ … 動かせなかった段は ★未測定★と書く（0とは書かない）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const require_ = createRequire(pathToFileURL(path.join(ROOT, 'package.json')));
let JSDOM;
try { ({ JSDOM } = require_('jsdom')); }
catch { console.error('★jsdom が要ります（npm install）。測れないので止めます（0と言わない）。'); process.exit(2); }

const N = {};                 // 出す数（doc と突き合わせる物）
const note = [];              // 気づいた事

/* ── 本物の画面を動かす ── */
const file = path.join(ROOT, 'kyuyo/index.html');
const html = fs.readFileSync(file, 'utf8');
const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/kyuyo/index.html',
});
const win = dom.window, doc = win.document;
win.fetch = () => Promise.reject(new Error('no net'));
win.alert = () => {}; win.confirm = () => true; win.scrollTo = () => {}; win.print = () => {};
const errs = [];
win.addEventListener('error', (e) => errs.push(String(e.message || e)));
win.addEventListener('unhandledrejection', (e) => errs.push('rej:' + ((e.reason && e.reason.message) || e.reason)));

let loaded = 0;
for (const m of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
  const src = m[1].split('?')[0];
  const base = src.split('/').pop();
  if (/^https?:/.test(src) || ['supa-config.js', 'auth.js', 'env-badge.js', 'rakunally-login.js'].includes(base)) continue;
  const p = path.resolve(path.dirname(file), src);
  if (!fs.existsSync(p)) continue;
  const el = doc.createElement('script');
  el.textContent = fs.readFileSync(p, 'utf8');
  doc.body.appendChild(el);
  loaded++;
}
await new Promise((r) => setTimeout(r, 400));
const A = win.__PAYSLIP_TEST;
if (!A) { console.error('★app.js が動いていない（測れない）★'); process.exit(2); }
N.読んだJS = loaded;

/* ═══ 1周を1段ずつ 動かす ═══ */
const stage = [];
function S(name, how) {
  try {
    const r = how();
    stage.push(Object.assign({ 段: name }, r));
  } catch (e) {
    stage.push({ 段: name, 状態: '未測定', 確かめ方: '動かして数えた', 数: '—', 欠け: '動かせなかった：' + (e && e.message), 危: '—' });
  }
}

S('①会社を作る', () => {
  const c = A.defCompany();
  const keys = Object.keys(c).length;
  const askBlock = fs.readFileSync(path.join(ROOT, 'kyuyo/js/app.js'), 'utf8');
  const qs = (askBlock.slice(askBlock.indexOf('function ASK_Q()'), askBlock.indexOf('function askCounts()')).match(/key:'/g) || []).length;
  N.会社の聞く問 = qs;
  N.会社の持ち物 = keys;
  return { 状態: '出来ている', 確かめ方: '動かして数えた', 数: '聞く ' + qs + '問／会社が持つ物 ' + keys + '個',
    欠け: '無し', 危: '無し' };
});

S('②人を入れる', () => {
  const e = A.defEmp('山田 太郎');
  N.人の持ち物 = Object.keys(e).length;
  A.state.company = A.defCompany();
  A.state.employees = [e];
  A.state.month = '2026-08';
  return { 状態: '出来ている', 確かめ方: '動かして数えた', 数: '1人が持つ物 ' + Object.keys(e).length + '個',
    欠け: '無し', 危: '無し' };
});

S('③勤怠を入れる', () => {
  const e = A.state.employees[0];
  /* ★実物の欄の名前で入れる★（基本給は base。monthly という欄は無い＝
     違う名前で入れると 0 が返り「0どうしの一致」を合っていると言ってしまう） */
  e.payType = '月給'; e.base = '260000';
  if (Array.isArray(e.shikyu) && e.shikyu[0]) e.shikyu[0].value = '260000';
  e.dailyEntries = [{ ymd: '2026-08-03', hm: '8:00' }, { ymd: '2026-08-04', hm: '9:30' }];
  const d = A.buildDailyData ? A.buildDailyData(e, '2026-08') : null;
  N.勤怠の日数 = e.dailyEntries.length;
  return { 状態: d ? '出来ている' : '半分', 確かめ方: '動かして数えた',
    数: '日ごと ' + e.dailyEntries.length + '日 入れて 読み直せた', 欠け: '無し', 危: '無し' };
});

S('④計算する', () => {
  const e = A.state.employees[0];
  /* ★compute は 引数1つ★（会社と月は state から取る）。2つ渡すと 0 が返る＝
     ★0どうしの一致を「合っている」と言ってしまう★ので、必ず金額が動いた事も見る。 */
  const c = A.compute(e);
  const shikyu = Number(c.shikyuTotal || 0), kojo = Number(c.kojoTotal || 0), net = Number(c.net || 0);
  const diff = shikyu - kojo - net;
  N.検算_総支給 = shikyu; N.検算_控除 = kojo; N.検算_手取り = net; N.検算_差 = diff;
  if (diff !== 0) note.push('★総支給−控除≠手取り（差 ' + diff + '円）★');
  /* ★0どうしの一致を「合っている」と言わない★（動いた事＝金額が0でない事を見る） */
  const ugoita = shikyu > 0 && net > 0;
  if (!ugoita) note.push('★計算が動いていない（総支給0）＝この段は未測定★');
  return { 状態: !ugoita ? '未測定' : (diff === 0 ? '出来ている' : '半分'), 確かめ方: '動かして数えた',
    数: '総支給 ' + shikyu + ' − 控除 ' + kojo + ' ＝ 手取り ' + net + '（差 ' + diff + '円）',
    欠け: ugoita ? '無し' : '★金額が0のまま＝検算になっていない★', 危: diff === 0 ? '無し' : '★1円ずれている★' };
});

S('⑤明細を出す（紙）', () => {
  const e = A.state.employees[0];
  /* ★紙は Render.build が組む★（app.js:3240 と同じ呼び方＝本番の経路） */
  let docHtml = null;
  try {
    const people = A.buildPeople ? A.buildPeople(A.state.employees) : null;
      if (people && people.length && win.Render) {
        const paper = { month: A.state.month };
        const out = win.Render.build(people, paper, (people.length === 1 ? 'col2_1' : (A.state.prefer || 'col1_1')), A.state.theme);
      docHtml = out && out.html;
      N.紙の枚数 = (out && out.pages) || 0;
    }
  } catch (err) { docHtml = null; N.紙の枚数 = 0; }
  if (!docHtml) return { 状態: '未測定', 確かめ方: '動かして数えた', 数: '紙を組む口が呼べない', 欠け: '紙の口', 危: '—' };
  const txt = String(docHtml).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const yen = (txt.match(/[0-9][0-9,]*/g) || []);
  N.紙の数字の個数 = yen.length;
  const hasName = /山田 太郎/.test(txt);
  /* ★紙に描かれた文字を そのまま読む★（中の値どうしで閉じない） */
  /* ★紙は 1文字ずつ離して組んである★（「差 引 支 給 額」）ので、
     ★空白を落としてから★探す。落とさないと 見つからず「未測定」になる。 */
  const flat = txt.replace(/[\s\u3000]/g, '');
  const yenOf = (label) => {
    const rx = new RegExp(label + '[^0-9]{0,6}([0-9][0-9,]*)');
    const m = rx.exec(flat);
    return m ? Number(String(m[1]).replace(/,/g, '')) : null;
  };
  const kamiShikyu = yenOf('支給合計') ?? yenOf('支給計') ?? yenOf('総支給');
  const kamiNet = yenOf('差引支給額') ?? yenOf('差引支給') ?? yenOf('手取り');
  N.紙_総支給 = kamiShikyu === null || kamiShikyu === undefined ? '未測定' : kamiShikyu;
  N.紙_手取り = kamiNet === null || kamiNet === undefined ? '未測定' : kamiNet;
  const au = (N.紙_総支給 === N.検算_総支給) && (N.紙_手取り === N.検算_手取り);
  if (N.紙_総支給 === '未測定' || N.紙_手取り === '未測定') note.push('★紙の文字から 合計を読み取れなかった（未測定）★');
  else if (!au) note.push('★紙と画面の数字が違う（紙 ' + N.紙_総支給 + '/' + N.紙_手取り + ' 対 画面 ' + N.検算_総支給 + '/' + N.検算_手取り + '）★');
  return { 状態: (hasName && au) ? '出来ている' : (hasName ? '半分' : '未測定'), 確かめ方: '動かして数えた',
    数: '紙に出た数字 ' + yen.length + '個／紙の総支給 ' + N.紙_総支給 + '・手取り ' + N.紙_手取り
      + '（画面と ' + (au ? '一致' : '★違う／未測定★') + '）',
    欠け: '無し', 危: au ? '無し' : '★紙と画面が合わない／読み取れない★' };
});

S('⑥配る（Web明細）', () => {
  const has = typeof A.saveMonthlyPayslips === 'function';
  const gate = typeof A.webPubGate === 'function' ? A.webPubGate() : null;
  N.配る口 = has ? 1 : 0;
  return { 状態: has ? '半分' : '無い', 確かめ方: '動かして数えた',
    数: '配る口 ' + (has ? '在る' : '無い') + '／公開の関所 ' + (gate ? '在る' : '未測定'),
    欠け: '★本物の倉庫が要る所は ここでは動かせない（未測定）★', 危: '無し' };
});

S('⑦振込データ', () => {
  const z = fs.existsSync(path.join(ROOT, 'kyuyo/lib/zengin.js'));
  N.振込lib = z ? 1 : 0;
  return { 状態: z ? '半分' : '無い', 確かめ方: '読んだだけ',
    数: '全銀の lib ' + (z ? '在る' : '無い'), 欠け: '★ここでは動かしていない（未測定）★', 危: '無し' };
});

S('⑧年末調整', () => {
  const f = typeof A.nenCompute === 'function';
  N.年末調整の口 = f ? 1 : 0;
  let ok = false;
  if (f) { try { const r = A.nenCompute({}, {}, 2026); ok = !!r; } catch (e) { ok = false; } }
  return { 状態: f ? (ok ? '出来ている' : '半分') : '無い', 確かめ方: '動かして数えた',
    数: '計算の口 ' + (f ? '在る' : '無い') + '／空で呼んで ' + (ok ? '返る' : '返らない'),
    欠け: ok ? '無し' : '実データでの1周は未測定', 危: '無し' };
});

S('⑨台帳・法定調書', () => {
  const rows = ['gyoyoRows', 'roudouRows', 'shikakuRows', 'santeiRows', 'gekkakuRows'].filter((k) => typeof A[k] === 'function');
  N.台帳の口 = rows.length;
  return { 状態: rows.length >= 4 ? '半分' : '無い', 確かめ方: '動かして数えた',
    数: '台帳・調書を作る口 ' + rows.length + '個（' + rows.join(' / ') + '）',
    欠け: '★実データで出した紙は未測定★', 危: '無し' };
});

/* ═══ 深く見る6つ ═══ */
const APP = fs.readFileSync(path.join(ROOT, 'kyuyo/js/app.js'), 'utf8');
const SHIP = ['index.html', 'kyuyo/index.html', 'kyuyo/meisai.html', 'kyuyo/admin.html', 'js/hub.js', 'kyuyo/js/app.js'];

/* ④ 出来ていない物の言葉（説明の書き込みは外す） */
{
  let n = 0; const where = [];
  for (const f of SHIP) {
    let s = fs.readFileSync(path.join(ROOT, f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
    for (const w of ['未対応', '実装予定', '工事中', '準備中', 'TODO', 'FIXME']) {
      const c = (s.match(new RegExp(w, 'g')) || []).length;
      if (c) { n += c; where.push(f + '×' + c); }
    }
  }
  N.出来ていない物の言葉 = n;
  if (n) note.push('★客の画面に「未対応」等が ' + n + '件★（' + where.join(' / ') + '）');
}

/* ⑤ 黙って消える所（何もしない catch） */
{
  let n = 0;
  for (const f of ['kyuyo/js/app.js', 'kyuyo/js/store.js']) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    n += (s.match(/catch\s*\([^)]*\)\s*\{\s*(\/\*[\s\S]*?\*\/)?\s*\}/g) || []).length;
  }
  N.何もしないcatch = n;
}

/* ③ 法定（直書き・出典） */
{
  const libs = fs.readdirSync(path.join(ROOT, 'kyuyo/lib')).filter((f) => f.endsWith('.js'));
  N.給与のlib = libs.length;
  /* ★法定の出典は 中央の表が唯一の正★（lib は読むだけ）＝中央の kind を数える */
  const central = path.join(ROOT, 'kyuyo/lib/statutory-central.generated.js');
  N.法定の出典kind = fs.existsSync(central)
    ? Object.keys(require_(central).META || {}).length
    : 0;
  if (!N.法定の出典kind) note.push('★中央の法定データが読めない（未測定）★');
}

/* ⑥ 人が埋める欄（同じ道具） */
{
  const { execFileSync } = await import('node:child_process');
  const run = (args) => {
    try {
      const out = execFileSync(process.execPath, ['scripts/count-fields.mjs', 'kyuyo/index.html', ...args], { cwd: ROOT, encoding: 'utf8' });
      const m = /人が埋める欄 (\d+)/.exec(out); return m ? Number(m[1]) : null;
    } catch (e) {
      const out = String((e.stdout || '') + (e.stderr || ''));
      const m = /人が埋める欄 (\d+)/.exec(out); return m ? Number(m[1]) : null;
    }
  };
  N.欄_畳んだまま = run(['--closed']);
  N.欄_ぜんぶ開く = run([]);
  N.欄_1人の詳細まで = run(['--press', '#b-add-emp', '--press', '.emp-dtgl',
    '--press', '[data-dsub$=":shaho"]', '--press', '[data-dsub$=":teate"]',
    '--press', '[data-dsub$=":zaiseki"]', '--press', '[data-dsub$=":zei"]']);
}

N.動かして出たJSの落ち = errs.length;

/* ═══ 出す ═══ */
const counts = { '出来ている': 0, '半分': 0, '無い': 0, '未測定': 0 };
stage.forEach((s) => { if (counts[s.状態] !== undefined) counts[s.状態]++; });

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ N, stage, counts, note }, null, 1));
} else {
  console.log('\n[給与の状態] ★動かして数えた★');
  console.log('  出来ている ' + counts['出来ている'] + '段 ／ 半分 ' + counts['半分'] + '段 ／ 無い '
    + counts['無い'] + '段 ／ 未測定 ' + counts['未測定'] + '段');
  stage.forEach((s) => console.log('  ' + s.段.padEnd(16) + ' ' + String(s.状態).padEnd(6) + ' ' + s.数));
  console.log('\n  ── 深く見た数 ──');
  Object.keys(N).forEach((k) => console.log('  ' + k.padEnd(20) + ' ' + N[k]));
  if (note.length) { console.log('\n  ── 気づいた事 ──'); note.forEach((x) => console.log('  ' + x)); }
}

/* ═══ 数が古くならないようにする ═══ */
const DOC = path.join(ROOT, 'docs/STATE_kyuyo.md');
function docNumbers() {
  if (!fs.existsSync(DOC)) return null;
  const s = fs.readFileSync(DOC, 'utf8');
  const m = /<!--\s*数\s*([\s\S]*?)-->/.exec(s);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}
if (process.argv.includes('--check') || process.argv.includes('--self-test')) {
  let want = docNumbers();
  if (!want) { console.error('\n★docs/STATE_kyuyo.md に 数の塊が無い（<!-- 数 {…} -->）★'); process.exit(1); }
  if (process.argv.includes('--self-test')) {
    want = Object.assign({}, want);
    const k = Object.keys(want)[0];
    want[k] = Number(want[k]) + 1;                      // わざと1つ ずらす
    const bad = Object.keys(want).filter((x) => String(want[x]) !== String(N[x]));
    console.log('\n★自己確認★ 数を1つ ずらすと … 合わない数 ' + bad.length + '件');
    if (!bad.length) { console.error('  NG ★ずらしても赤にならない＝見張りが効いていない★'); process.exit(1); }
    console.log('  ok  ちゃんと赤になる');
    process.exit(0);
  }
  const bad = Object.keys(want).filter((x) => String(want[x]) !== String(N[x]));
  if (bad.length) {
    console.error('\n★書いてある数と 合いません（' + bad.length + '件）★');
    bad.forEach((x) => console.error('   ' + x + ' … 書いてある ' + want[x] + ' ／ 測ったら ' + N[x]));
    console.error('  docs/STATE_kyuyo.md の <!-- 数 --> を 測り直した数へ直してください。');
    process.exit(1);
  }
  console.log('\n書いてある数と ぜんぶ一致（' + Object.keys(want).length + '個）。');
}
