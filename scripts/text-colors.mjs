/* text-colors.mjs — ★画面に「描かれた字の色」を数える★（書いてある文字列ではなく 値で数える）
 * =============================================================================
 * なぜ要るか（指示役 2026-08-18）:
 *   ★見張りは「色を書いていない」ではなく ★描かれた色★ で数える★。
 *   前科: 「色を書いていない＝皮から受け継ぐ＝正しい」を見張りの正にしていたら、
 *         ★皮の body が主色の緑★だったので 読ませる字が ★全部 緑★になった。
 *         それを見張りが ★緑（合格）★と言っていた＝★逆を守らせていた★。
 *   決まり（司さん・全アプリ）: ★読ませる字は薄い黒。色は「押せる物」と「選ばれている物」だけ★
 *
 * 数え方:
 *   ・本物の HTML と 本物の CSS を読み、★jsdom に段組みさせて getComputedStyle で色を取る★
 *   ・「読ませる字」＝ 自分の直下に字を持つ要素のうち、★押せる物でも 選ばれている物でもない★物
 *   ・押せる物 … button / a / summary / select / option / input / textarea / label(中に入力欄)
 *              ／ [role=button] ／ それらの ★中★に在る字
 *   ・選ばれている物 … class に on / active / sel / current が付いた物と その中
 *
 * 使い方:
 *   node scripts/text-colors.mjs                 … 全画面を数える（合わなければ赤）
 *   node scripts/text-colors.mjs --list          … 直す物を1行ずつ出す
 *   node scripts/text-colors.mjs --self-test     … わざと壊して赤になるか
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
catch { console.error('★jsdom が要ります（npm install）。数えられないので止めます（0件と言わない）。'); process.exit(2); }

/* ★読ませる字の色は これ1つ★（2つの「薄い黒」を作らない。代行請求が本番へ入れた値と同じ） */
const BODY_BLACK = '#333333';
/* ★例外（理由と戻す条件つき）★ 状態そのものが色で意味を持つ字。箱の色と揃えている。 */
const STATE_OK = {
  '#92500A': '注意（.warn）… 箱の色と同じ。★色が意味★なので黒にしない',
  '#C0392B': 'まちがい（.bad / 消す）… 箱の色と同じ。★色が意味★なので黒にしない',
  /* ★製品の名前＝マーク★（.logo / .hd-logo）
     読ませる字ではなく「どのアプリを開いているか」の目印。うちの緑（#52B788）で出す。
     ★戻す条件★ … 司さんが「名前も黒で」と言った日。その時はここの1行を消せば赤くなる。 */
  '#52B788': '製品の名前（.logo / .hd-logo）… ★マークであって読ませる字ではない★',
};
const SCREENS = ['index.html', 'kyuyo/index.html', 'kyuyo/meisai.html', 'kyuyo/admin.html', 'seikyu/index.html'];

const hex = (rgb) => {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(String(rgb || ''));
  if (!m) return null;
  return '#' + [1, 2, 3].map((i) => Number(m[i]).toString(16).padStart(2, '0')).join('').toUpperCase();
};

function measure(entry) {
  const file = path.join(ROOT, entry);
  const html = fs.readFileSync(file, 'utf8');
  /* 本物の CSS を そのまま読む（読む順も本物どおり＝あとに読んだ物が勝つ） */
  const css = [...html.matchAll(/<link[^>]+href="([^"]+\.css[^"]*)"/g)]
    .map((m) => m[1].split('?')[0])
    .filter((h) => !/^https?:/.test(h))
    .map((h) => fs.readFileSync(path.resolve(path.dirname(file), h), 'utf8'))
    .join('\n');
  const body = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<link[^>]*rel="stylesheet"[^>]*>/g, '');
  const dom = new JSDOM(body + '<style>' + css + '</style>');
  const doc = dom.window.document;
  /* ★hidden で隠してある入れ物も数える★（ログイン前だから、では中身を見ない事になる） */
  doc.querySelectorAll('[hidden]').forEach((e) => e.removeAttribute('hidden'));

  const PRESS = 'button,a,summary,select,option,input,textarea,[role="button"]';
  const SELECTED = /(^|[\s-])(on|active|sel|current)([\s-]|$)/;
  const out = [];
  doc.querySelectorAll('*').forEach((e) => {
    const own = [...e.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(' ');
    if (!own || own.length < 2) return;
    if (/^(SCRIPT|STYLE|TITLE)$/.test(e.tagName)) return;
    if (e.closest(PRESS)) return;                                   // 押せる物（と その中）
    /* ★押せる物は タグだけでは分からない★（<b> や <span> に click を付けている所が在る）
       ＝★指の形になる物（cursor:pointer）も 押せる物★として数える。
       これを入れないと「押せるのに黒くしろ」と言う見張りになる。 */
    for (let n = e; n && n.tagName !== 'BODY'; n = n.parentElement) {
      if (dom.window.getComputedStyle(n).cursor === 'pointer') return;
    }
    let sel = false;
    for (let n = e; n; n = n.parentElement) {
      if (SELECTED.test(String(n.className || ''))) { sel = true; break; }
    }
    if (sel) return;                                                // 選ばれている物
    const c = hex(dom.window.getComputedStyle(e).color);
    if (!c || c === BODY_BLACK || STATE_OK[c]) return;
    out.push({
      entry, color: c,
      where: e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className ? '.' + String(e.className).trim().replace(/\s+/g, '.') : ''),
      text: own.replace(/\s+/g, ' ').slice(0, 26),
    });
  });
  /* ★JSが描く字は body から色を継ぐ★＝body そのものの色も測って返す
     （静的なHTMLに その色の字が1つも無くても、動いた画面では効いてしまうため） */
  /* ★jsdom は var(--x) を解いてくれない★＝null が返る。
     ★取れなかったを「無し」で流さない★ので、:root の宣言から自分で引く。 */
  let bc = hex(dom.window.getComputedStyle(doc.body).color);
  if (!bc) {
    const inline = [...doc.querySelectorAll('style')].map((e) => e.textContent).join('\n');
    const all = css + '\n' + inline;
    const bodyRule = (/body\s*\{[^}]*\}/i.exec(all) || [''])[0];
    const decl = /color:\s*var\((--[a-z0-9-]+)\)/i.exec(bodyRule);
    if (decl) {
      const v = new RegExp(decl[1] + '\\s*:\\s*(#[0-9A-Fa-f]{3,8})', 'i').exec(all);
      if (v) bc = v[1].toUpperCase();
    }
  }
  out.bodyColor = bc || '（測れなかった）';
  return out;
}

const list = process.argv.includes('--list');
let all = [];
console.log('\n[描かれた字の色を数える] 読ませる字は ' + BODY_BLACK + '（色は押せる物と選ばれている物だけ）');
const bodyBad = [];
for (const s of SCREENS) {
  const rows = measure(s);
  if (rows.bodyColor !== BODY_BLACK) bodyBad.push(s + '（' + rows.bodyColor + '）');
  all = all.concat(rows);
  const byColor = {};
  rows.forEach((r) => { byColor[r.color] = (byColor[r.color] || 0) + 1; });
  console.log('  ' + s.padEnd(20) + ' 読ませる字で色が付いている所 ' + String(rows.length).padStart(4) + '箇所'
    + (rows.length ? '  … ' + Object.entries(byColor).sort((a, b) => b[1] - a[1]).map(([c, n]) => c + '×' + n).join(' ') : ''));
  if (list) rows.forEach((r) => console.log('      ' + r.color + '  ' + r.where + '  「' + r.text + '」'));
}
const brand = all.filter((r) => r.color === '#2E7D54');
console.log('\n  ★合計 ' + all.length + '箇所★（うち 主色 #2E7D54 が ' + brand.length + '箇所）');
console.log('  例外（色そのものが意味）… ' + Object.entries(STATE_OK).map(([c, w]) => c + '＝' + w.split('…')[0].trim()).join(' ／ '));

if (process.argv.includes('--self-test')) {
  /* ★わざと壊して 赤になるか★
     ★「皮を1か所」では終わらない★ … 各アプリが自分で body と 見出しの色を持っている。
     だから ★色を持っている所を1つずつ★ 緑へ戻して、1つ残らず捕まえられるかを見る。
     （ファイルは必ず元へ戻す。見張りがファイルを汚さない） */
  const BREAKS = [
    /* ★皮を読んでいるのは 請求書だけ★（入口・給与・明細・管理は自分の CSS / <style>）
       ＝「皮を1か所 直せば全アプリ」は ★成り立たない★。壊す所も 画面ごとに要る。 */
    ['css/rakually-ui.css', /(\.hint \{[^}]*?color:\s*)#[0-9A-Fa-f]{6}/, '皮の注意書き（請求書が読む）'],
    ['css/hub.css', /(body \{[^}]*?color:\s*)#[0-9A-Fa-f]{6}/, '入口の字の既定'],
    ['css/hub.css', /(\.fld label \{[^}]*?color:\s*)#[0-9A-Fa-f]{6}/, '入口の欄の名前'],
    ['kyuyo/css/app.css', /(body\{[^}]*?color:\s*)#[0-9A-Fa-f]{6}/, '給与の字の既定'],
    ['kyuyo/css/app.css', /(\.card-h\{[^}]*?color:\s*)#[0-9A-Fa-f]{6}/, '給与のカードの見出し'],
    ['kyuyo/meisai.html', /(\.lead\{[^}]*?color:\s*)#[0-9A-Fa-f]{6}/, '明細の本文'],
    ['kyuyo/admin.html', /(\.bar small\{[^}]*?color:\s*)#[0-9A-Fa-f]{6}/, '管理の小さい説明'],
    ['seikyu/css/app.css', /(\.sub-h \{[^}]*?color:\s*)#[0-9A-Fa-f]{6}/, '請求書の中見出し'],
    /* ★この道具の届かない所★ … .pask-* は ★JSが描く字★なので、HTMLを読むだけでは見えない。
       そこは seikyu/tests/partner-ask.test.mjs ⑩（決まりの色を名指しで見る）と
       ★本物のブラウザで実測★ が受け持つ。
       ★戻す条件★ … この道具が「アプリを動かしてから数える」形になった日に ここへ足す。 */
  ];
  console.log('\n★自己確認（1か所ずつ 緑へ戻して 捕まえられるか）★');
  let sp = 0, sf = 0;
  for (const [file, rx, name] of BREAKS) {
    const p = path.join(ROOT, file);
    const keep = fs.readFileSync(p, 'utf8');
    if (!rx.test(keep)) { sf++; console.log('  NG  ' + name + '（★壊す場所が見つからない＝見張りが古い★ ' + file + '）'); continue; }
    try {
      fs.writeFileSync(p, keep.replace(rx, '$1#2E7D54'));
      let red = 0;
      for (const sc of SCREENS) {
        const r2 = measure(sc);
        red += r2.filter((r) => r.color === '#2E7D54').length;
        if (r2.bodyColor !== BODY_BLACK) red++;   /* ★字の既定が緑＝JSが描く字が全部 緑★ */
      }
      if (red) { sp++; console.log('  ok  ' + name + ' を緑へ戻すと ' + red + '箇所 捕まえる'); }
      else { sf++; console.log('  NG  ' + name + '（★壊しても赤にならない★）'); }
    } finally {
      fs.writeFileSync(p, keep);   // ★必ず戻す★
    }
  }
  console.log('\n自己確認: ' + sp + '/' + BREAKS.length + ' 通り 赤になった');
  if (sf) process.exit(1);
}

if (bodyBad.length) {
  console.error('\n★字の既定（body）が薄い黒でない画面★ … ' + bodyBad.join(' , '));
  console.error('  ここが緑だと ★JSが描いた字が全部 緑★になる（2026-08-18 に実際に起きた）。');
}
if (all.length || bodyBad.length) {
  if (all.length) console.error('\n★読ませる字に色が付いています（' + all.length + '箇所）★ --list で場所が出ます。');
  process.exit(1);
}
console.log('\n読ませる字に色は 0箇所。緑。');
