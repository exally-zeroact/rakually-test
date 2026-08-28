/* kaisha-link.test.mjs — ★会社の情報は「第3の場所」に置く★（司さん 2026-08-28）
 * =============================================================================
 * ★司さんの言葉★
 *   「そもそも違う所を設けてそこで設定さすのが筋では？（給与からも除けて）」
 * ★決めた事★
 *   会社の情報（屋号・住所・電話・インボイス番号・事業）の持ち主は
 *   ★給与でも 請求書でもない「会社の設定」＝入口の 共有データ ▸ 会社★。
 *   ★2か所で別々に持たない★／★飛んだ先から 元の画面へ戻れる★。
 *
 * ★指示役が数えた事の訂正（実測 2026-08-28）★
 *   指示役は「seikyu/index.html:519 の『会社の情報を直す』は ★給与の設定へ飛ぶ★」と書いたが、
 *   ★実際の飛び先は ../index.html ＝入口（給与ではない）★だった。
 *   ただし ★入口のホーム画面に降りるだけで、会社の所には行かないし 帰り道も無かった★。
 *   ⇒ 直したのは そこ（#kaisha?back=seikyu で ★会社の所へ直接 降り、帰り道を出す★）。
 *
 * ここで見る物（★字を読むだけにせず 実際に開いて確かめる★）
 *   ① 請求書の画面に ★給与(kyuyo/)へ飛ぶリンクが 0本★
 *   ② 「会社の情報を直す」が ★第3の場所★を指している（#kaisha?back=seikyu）
 *   ③ 入口を ★本当に動かして★ #kaisha?back=seikyu を開くと
 *      共有データ▸会社 が出て ★帰り道（← 請求書へ戻る）が出る★
 *   ④ 戻り先を書かずに来た時／知らない戻り先の時は ★帰り道を出さない★
 *   ⑤ 会社の欄が ★入口にだけ★ 在る（請求書が自分の欄を持っていない＝2か所持ちが無い）
 *
 * 使い方: node seikyu/tests/kaisha-link.test.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let JSDOM; try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('★jsdomが入っていません。この検証は飛ばせません（SKIPを緑と呼ばない）。npm install してください。'); process.exit(1); }

export const HUB = 'index.html';
export const SEIKYU = 'seikyu/index.html';
export const WANT = '../index.html#kaisha?back=seikyu';

/** 請求書の画面から 給与へ飛ぶリンク（href が kyuyo/ を指す物）を数える */
export function linksToKyuyo(html) {
  return [...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map((m) => m[1])
    .filter((h) => /(^|\/)kyuyo\//.test(h) || /kyuyo\.html/.test(h));
}
/** 「会社の情報を直す」の飛び先 */
export function kaishaHref(html) {
  const m = /<a\b[^>]*href="([^"]*)"[^>]*>会社の情報を直す<\/a>/.exec(html);
  return m ? m[1] : null;
}

/** 入口を本当に動かして、#kaisha?back=… を開いた時の姿を返す */
async function bootHub(hash) {
  const html = fs.readFileSync(path.join(ROOT, HUB), 'utf8');
  const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1])
    .map((s) => s.split('?')[0])
    .filter((s) => !/^https?:/.test(s) && !/supa-config|auth\.js/.test(s));
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''),
    { runScripts: 'dangerously', url: 'http://localhost/' + (hash || ''), pretendToBeVisual: true });
  const win = dom.window, doc = win.document;
  win.fetch = () => Promise.reject(new Error('no net'));
  win.scrollTo = () => {};
  for (const src of srcs) {
    const el = doc.createElement('script');
    el.textContent = fs.readFileSync(path.join(ROOT, src), 'utf8');
    doc.body.appendChild(el);
  }
  return { win, doc };
}

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const TA = async (n, fn) => { try { await fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (v, m) => { if (!v) throw new Error(m || 'false'); };

if (process.argv.includes('--self-test')) {
  console.log('\n[kaisha-link --self-test] ★わざと戻して 赤になるか★');
  const s0 = fs.readFileSync(path.join(ROOT, SEIKYU), 'utf8');
  T('① 壊していない状態では 給与へのリンク0本', () => {
    ok(linksToKyuyo(s0).length === 0, '今すでに ' + linksToKyuyo(s0).length + '本 在る');
  });
  T('① わざと 給与へのリンクを足すと 赤', () => {
    const bad = s0.replace('</body>', '<a href="../kyuyo/index.html">給与の設定へ</a></body>');
    ok(linksToKyuyo(bad).length === 1, '給与へのリンクを 見つけられていない＝この検査は空振り');
  });
  T('② わざと 入口のホームへ戻すと 赤（会社の所へ行かない）', () => {
    const bad = s0.replace(WANT, '../index.html');
    ok(kaishaHref(bad) !== WANT, '飛び先を見ていない');
  });
  await TA('③ 戻り先つきで開くと 共有データ▸会社＋帰り道（実際に動かす）', async () => {
    const { doc } = await bootHub('#kaisha?back=seikyu');
    ok(doc.getElementById('scr-data').classList.contains('active'), '共有データの画面が出ていない');
    ok(doc.getElementById('pane-org').classList.contains('active'), '会社のタブが出ていない');
    const b = doc.getElementById('kaisha-back');
    ok(b && !b.hidden, '帰り道が出ていない');
    ok(b.getAttribute('href') === 'seikyu/', '帰り道の行き先が ' + b.getAttribute('href'));
    ok(/請求書/.test(b.textContent), '帰り道の字が「' + b.textContent + '」');
  });
  await TA('④ 戻り先が無い時は 帰り道を出さない（勝手な所へ帰らせない）', async () => {
    const { doc } = await bootHub('#kaisha');
    ok(doc.getElementById('scr-data').classList.contains('active'), '共有データの画面が出ていない');
    ok(doc.getElementById('kaisha-back').hidden, '戻り先が無いのに 帰り道が出ている');
  });
  await TA('④-b 知らない戻り先は 出さない（外から書き換えられても 飛ばさない）', async () => {
    const { doc } = await bootHub('#kaisha?back=https://example.com');
    ok(doc.getElementById('kaisha-back').hidden, '★知らない行き先へ 帰らせている★');
  });
  T('⑥ わざと 給与に打てる欄を戻すと 赤', () => {
    const kyuyo = fs.readFileSync(path.join(ROOT, 'kyuyo/index.html'), 'utf8')
      .replace('<div class="finput-ro" id="c-name-ro">', '<input id="c-name" class="finput"><div class="finput-ro" id="c-name-ro">');
    const bad = ['c-name', 'c-addr'].filter((i) => new RegExp('<input[^>]*id="' + i + '"').test(kyuyo));
    ok(bad.length === 1, '給与の打てる欄を 見つけられていない＝この検査は空振り');
  });
  await TA('⑤ 何も付けずに開くと ホームのまま（勝手に画面を変えない）', async () => {
    const { doc } = await bootHub('');
    ok(doc.getElementById('scr-hub').classList.contains('active'), 'ホームが出ていない');
    ok(doc.getElementById('kaisha-back').hidden, '帰り道が出ている');
  });
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

console.log('\n[kaisha-link] 会社の情報は「第3の場所」に置く（給与でも 請求書でもない）');
const seikyu = fs.readFileSync(path.join(ROOT, SEIKYU), 'utf8');
const hub = fs.readFileSync(path.join(ROOT, HUB), 'utf8');

T('★① 請求書の画面から 給与へ飛ぶリンクが0本', () => {
  const a = [...seikyu.matchAll(/<a\b[^>]*href="([^"]+)"/g)].length;
  ok(a > 0, '<a> が0本＝読めていない');
  const bad = linksToKyuyo(seikyu);
  ok(!bad.length, '★' + bad.length + '本★ 給与へ飛んでいる: ' + bad.join(' , '));
  console.log('     見た <a> ' + a + '本 → 給与へ ★0本★');
});

T('★② 「会社の情報を直す」が 第3の場所（会社の所）を指している', () => {
  const h = kaishaHref(seikyu);
  ok(h !== null, '★「会社の情報を直す」が 見つからない★（消したなら この検査も直す）');
  ok(h === WANT, '飛び先が「' + h + '」（正しくは ' + WANT + '）');
  console.log('     ' + h);
});

T('★⑤ 会社の欄は 入口にだけ在る（請求書が自分の欄を持っていない）', () => {
  const IDS = ['org-yago', 'org-addr', 'org-tel', 'org-invoice'];
  const inHub = IDS.filter((i) => hub.indexOf('id="' + i + '"') >= 0);
  const inSeikyu = IDS.filter((i) => seikyu.indexOf('id="' + i + '"') >= 0);
  ok(inHub.length === IDS.length, '★入口に 会社の欄が揃っていない★ ' + inHub.join(','));
  ok(!inSeikyu.length, '★請求書が 会社の欄を持っている（2か所持ち）★ ' + inSeikyu.join(','));
  console.log('     会社の欄 ' + IDS.length + '個 … 入口 ' + inHub.length + '個 ／ 請求書 ' + inSeikyu.length + '個');
});

T('★⑥ 給与も 会社名・住所を 自分で持たない（司さん「給与からも除けて」）', () => {
  const kyuyo = fs.readFileSync(path.join(ROOT, 'kyuyo/index.html'), 'utf8');
  /* ★打てる欄★が無い事＝給与では直せない（読むだけの箱 c-name-ro / c-addr-ro に替えた） */
  const bad = ['c-name', 'c-addr'].filter((i) => new RegExp('<input[^>]*id="' + i + '"').test(kyuyo));
  ok(!bad.length, '★給与に まだ 打てる欄が在る（2か所持ち）★ ' + bad.join(','));
  ok(/id="c-name-ro"/.test(kyuyo) && /id="c-addr-ro"/.test(kyuyo),
    '★読むだけの箱が無い★＝今の値を見せずに 消しただけ になっている');
  /* ★直しに行く道が在る★＝袋小路にしない */
  const m = /<a\s[^>]*id="c-kaisha-link"[^>]*href="([^"]*)"/.exec(kyuyo)
    || /<a\s[^>]*href="([^"]*)"[^>]*id="c-kaisha-link"/.exec(kyuyo);
  ok(m, '★給与から「会社の情報を直す」へ行く道が無い（袋小路）★');
  ok(m[1] === '../index.html#kaisha?back=kyuyo', '飛び先が「' + m[1] + '」');
  /* ★7問→6問★＝会社の名前を 給与で聞かない */
  const app = fs.readFileSync(path.join(ROOT, 'kyuyo/js/app.js'), 'utf8');
  ok(!/key:'name', q:'会社の名前は？'/.test(app), '★給与が まだ「会社の名前は？」と聞いている★');
  console.log('     給与の打てる欄 0個 ／ 読むだけの箱 2個 ／ 直す道 ' + m[1]);
});

await TA('★③ 実際に開く … #kaisha?back=seikyu で 会社の所＋帰り道が出る', async () => {
  const { doc } = await bootHub('#kaisha?back=seikyu');
  ok(doc.getElementById('scr-data').classList.contains('active'), '共有データの画面が出ていない');
  ok(doc.getElementById('pane-org').classList.contains('active'), '会社のタブが出ていない');
  const b = doc.getElementById('kaisha-back');
  ok(b && !b.hidden, '★帰り道が出ていない（飛んだ先から 戻れない）★');
  ok(b.getAttribute('href') === 'seikyu/', '帰り道の行き先が ' + b.getAttribute('href'));
  console.log('     「' + b.textContent + '」→ ' + b.getAttribute('href'));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
