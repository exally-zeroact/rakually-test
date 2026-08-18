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

/* ★動かしてから数える★ 画面ごとの「動かし方」。
   ここに書いていない画面は ★HTMLに書いてある字だけ★を数える（届いていない事を隠さない）。 */
const BOOT = {
  'kyuyo/meisai.html': async (dom) => {
    const win = dom.window, doc = win.document;
    /* 倉庫は偽物（画面の色を見るだけ。★本物のデータは使わない★） */
    win.Store = {
      meisaiAuth: () => Promise.resolve({ found: true, remembered: true, name: '山田 太郎', hasPassword: true }),
      getMeisaiDocs: () => Promise.resolve({
        name: '山田 太郎', needConsent: false,
        docs: [
          { id: 'd1', ym: '2026-07', kind: 'monthly', net: 216380, openedAt: null },
          { id: 'd2', ym: '2026-06', kind: 'monthly', net: 214500, openedAt: '2026-07-01' },
        ],
      }),
      getMeisai: () => Promise.resolve({ doc: {} }),
      /* ★年末調整の画面★も出す（.nw-gt / .nen-done はここでしか描かれない） */
      getNenchoDecl: () => Promise.resolve({ found: true, decl: {} }),
      getFurikomi: () => Promise.resolve({ found: false }),
    };
    win.history.replaceState(null, '', '?t=dummy');
    return {
      after: 300,
      /* 一覧を数えたあと、年末調整へ進んで もう一度 数える */
      then2: async (d) => {
        const b = d.window.document.getElementById('to-nencho');
        if (b) b.dispatchEvent(new d.window.MouseEvent('click', { bubbles: true }));
      },
      /* ★描けた事の証拠★ … これが出ていなければ「0件」ではなく ★数えられていない★ */
      expect: ['.dlist .drow', '.dlist .drow .dv', '.nw-gt', '.nw-q'],
    };
  },
};

async function measure(entry, opts) {
  const live = !!(opts && opts.live) && !!BOOT[entry];
  const file = path.join(ROOT, entry);
  const html = fs.readFileSync(file, 'utf8');
  /* 本物の CSS を そのまま読む（読む順も本物どおり＝あとに読んだ物が勝つ） */
  const css = [...html.matchAll(/<link[^>]+href="([^"]+\.css[^"]*)"/g)]
    .map((m) => m[1].split('?')[0])
    .filter((h) => !/^https?:/.test(h))
    .map((h) => fs.readFileSync(path.resolve(path.dirname(file), h), 'utf8'))
    .join('\n');
  const body = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<link[^>]*rel="stylesheet"[^>]*>/g, '');
  const dom = new JSDOM(body + '<style>' + css + '</style>', live
    ? { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' + entry }
    : {});
  const doc = dom.window.document;

  if (live) {
    /* ★本物の JS を そのまま流す★（ネットへは出さない・倉庫は偽物） */
    const win = dom.window;
    win.fetch = () => Promise.reject(new Error('no net'));
    win.alert = () => {}; win.confirm = () => true; win.scrollTo = () => {}; win.print = () => {};
    const boot = await BOOT[entry](dom);
    for (const m of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
      const src = m[1].split('?')[0];
      if (/^https?:/.test(src) || /supa-config|auth\.js|env-badge|store\.js/.test(src)) continue;
      const p = path.resolve(path.dirname(file), src);
      if (!fs.existsSync(p)) continue;
      const el = doc.createElement('script');
      el.textContent = fs.readFileSync(p, 'utf8');
      doc.body.appendChild(el);
    }
    await new Promise((r) => setTimeout(r, (boot && boot.after) || 200));
    if (boot && typeof boot.then2 === 'function') { await boot.then2(dom); await new Promise((r) => setTimeout(r, 200)); }
    /* ★描けていないのに 0件と言わない★ */
    const missing = (boot && boot.expect ? boot.expect : []).filter((sel) => !doc.querySelector(sel));
    if (missing.length) {
      console.error('★動かしたのに 描けていません（数えられていない）★ ' + entry + ' … ' + missing.join(' , '));
      process.exitCode = 1;
    }
  }
  /* ★hidden で隠してある入れ物も数える★（ログイン前だから、では中身を見ない事になる） */
  doc.querySelectorAll('[hidden]').forEach((e) => e.removeAttribute('hidden'));

  /* ★押せる物★（この中の字は色が付いてよい）。
     ★入力欄は入れない★＝input/select/textarea の中の字は ★打った値・金額＝読ませる字★。
     （2026-08-18 指示役の指摘で判明：この道具は入力欄を丸ごと外していて、
       明細の .finput が主色の緑のまま 0件と言っていた） */
  const PRESS = 'button,a,summary,[role="button"]';
  const VALUE = 'input,select,textarea';
  const SELECTED = /(^|[\s-])(on|active|sel|current)([\s-]|$)/;
  const out = [];
  /* ★入力欄の中の字（値・金額）★ … 字が入っていなくても 打てば その色で出るので、欄そのものを見る */
  doc.querySelectorAll(VALUE).forEach((e) => {
    if (e.type === 'hidden' || e.type === 'checkbox' || e.type === 'radio' || e.type === 'file') return;
    const c = hex(dom.window.getComputedStyle(e).color);
    if (!c || c === BODY_BLACK || STATE_OK[c]) return;
    out.push({
      entry, color: c, kind: '打つ欄の中の字',
      where: e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className ? '.' + String(e.className).trim().replace(/\s+/g, '.') : ''),
      text: (e.placeholder || e.value || '（打った値がここに出る）').slice(0, 26),
    });
  });
  doc.querySelectorAll('*').forEach((e) => {
    if (e.matches(VALUE)) return;
    const own = [...e.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(' ');
    if (!own || own.length < 2) return;
    if (/^(SCRIPT|STYLE|TITLE)$/.test(e.tagName)) return;
    if (e.closest(PRESS)) return;                                   // 本物の押す部品（と その中）
    /* ★押せる物は タグだけでは分からない★（<b> や <span> に click を付けている所が在る）
       ただし ★先祖が押せるからと 中身を全部 見ないのは やり過ぎ★（2026-08-18 指示役の指摘）:
       明細の一覧は 行ごと押せる（.drow に cursor:pointer）ので、
       ★月の見出しも 金額も 数えていなかった＝客が読む字が緑のまま 0件と言った★。
       ⇒ 色を許すのは ★自分が指の形で、かつ 自分の直下に短い札の字しか持たない物★だけ。
          中に別の字の塊を持つ「押せる行」は ★中身は読ませる字★。 */
    if (dom.window.getComputedStyle(e).cursor === 'pointer') {
      /* ★どこで指の形が決まったか★まで登る（cursor は下へ伝わるので 自分だけ見ても分からない） */
      let owner = e;
      while (owner.parentElement && dom.window.getComputedStyle(owner.parentElement).cursor === 'pointer') {
        owner = owner.parentElement;
      }
      const kids = [...owner.children].filter((c) => (c.textContent || '').trim());
      /* 押す物が 自分自身＝札のような押し物（例: <b>入力</b>）だけ 色を許す */
      if (owner === e && !kids.length && own.length <= 12) return;
      /* それ以外＝★押せる行／押せる札の中身★。行が押せる事は触れば分かる。
         ★月の見出しも 金額も 読む物★なので 読ませる字として数える。 */
    }
    let sel = false;
    for (let n = e; n; n = n.parentElement) {
      if (SELECTED.test(String(n.className || ''))) { sel = true; break; }
    }
    if (sel) return;                                                // 選ばれている物
    const c = hex(dom.window.getComputedStyle(e).color);
    if (!c || c === BODY_BLACK || STATE_OK[c]) return;
    /* ★地に色が付いた札の白字★（例: 「未読」の緑の札）は 地と対で読む物＝色を許す。
       ★地が白／透明のまま白字★なら 読めないので これは許さない。 */
    if (c === '#FFFFFF') {
      const bg = hex(dom.window.getComputedStyle(e).backgroundColor);
      if (bg && bg !== '#FFFFFF') return;
    }
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
  const rows = await measure(s);
  /* ★動かしてから もう一度 数える★（JSが描く字＝客が実際に読む字） */
  if (BOOT[s]) {
    const liveRows = await measure(s, { live: true });
    const seen = new Set(rows.map((r) => r.where + r.color));
    liveRows.forEach((r) => { if (!seen.has(r.where + r.color)) rows.push(Object.assign({}, r, { kind: (r.kind || '') + '（動かして出た字）' })); });
  }
  if (rows.bodyColor !== BODY_BLACK) bodyBad.push(s + '（' + rows.bodyColor + '）');
  all = all.concat(rows);
  const byColor = {};
  rows.forEach((r) => { byColor[r.color] = (byColor[r.color] || 0) + 1; });
  console.log('  ' + s.padEnd(20) + (BOOT[s] ? '（動かして数えた）' : '（HTMLの字だけ）  ') + ' 読ませる字で色が付いている所 ' + String(rows.length).padStart(4) + '箇所'
    + (rows.length ? '  … ' + Object.entries(byColor).sort((a, b) => b[1] - a[1]).map(([c, n]) => c + '×' + n).join(' ') : ''));
  if (list) rows.forEach((r) => console.log('      ' + r.color + '  ' + (r.kind ? '[' + r.kind + '] ' : '') + r.where + '  「' + r.text + '」'));
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
    /* ★2026-08-18 に見つかった2つの穴★（指示役の指摘で判明）。ここを外すと また同じ物を見落とす:
       穴A 打つ欄の中の字（値・金額）を数えていなかった
       穴B JSが描く字を数えていなかった（＝客が実際に読む字） */
    ['kyuyo/css/app.css', /(\.finput\{[^}]*?color:\s*)#[0-9A-Fa-f]{6}/, '給与の打つ欄の中の字（値・金額）'],
    ['kyuyo/meisai.html', /(\.dlist \.drow \.dv\{[^}]*?color:\s*)#[0-9A-Fa-f]{6}/, '明細の一覧の金額（JSが描く字）'],
    ['kyuyo/meisai.html', /(\.nw-q\{[^}]*?color:\s*)#[0-9A-Fa-f]{6}/, '年末調整の質問文（JSが描く字）'],
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
        const r2 = await measure(sc);
        red += r2.filter((r) => r.color === '#2E7D54').length;
        if (r2.bodyColor !== BODY_BLACK) red++;   /* ★字の既定が緑＝JSが描く字が全部 緑★ */
        /* ★動かして出る字も 同じように確かめる★（ここを抜くと JSが描く字の壊れを見逃す） */
        if (BOOT[sc]) { const r3 = await measure(sc, { live: true }); red += r3.filter((r) => r.color === '#2E7D54').length; }
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
