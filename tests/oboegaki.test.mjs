/* oboegaki.test.mjs — ★覚書はがしの正本 _oboegaki の 守り★（純・走らせて 測る＝読むだけでない）
 * ★守る事★ … ①覚書は 消す ②正規表現/文字列/テンプレ は 消さない（中の // や 引用符を 誤読しない）
 *   ③長さ・行数は 変えない（偽の緑止め） ④剥がした 字が node --check を 通る
 *   ⑤★素朴版（正規表現を 見ない）だと この電池で 赤に なる＝門に 歯が 在る証し★
 * ★最後に KEKKA を 出す★（約束のドッグフード）。 */
import { oboegakiWoKesu, nagasaGyouFuhen, kousoTooruKa, stringLiterals } from '../tools/_oboegaki.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

let pass = 0, fail = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };
const NL = String.fromCharCode(10);
const norm = (s) => String(s).replace(/[ \t]+/g, ' ').replace(/ *\n */g, NL).trim();

console.log('[oboegaki] 覚書はがしの正本の守り');

/* [名, 入力, 残る字, 消える字] */
const bat = [
  ['行覚書', 'x=1; // c' + NL + 'y=2;', ['x=1;', 'y=2;'], ['// c']],
  ['囲み覚書', 'a=1;/* c */b=2;', ['a=1;', 'b=2;'], ['/* c */', ' c ']],
  ['正規表現の中の//', 'var re=/a\\/\\/b/; var y=2; // after', ['a\\/\\/b', 'var y=2;'], ['// after']],
  ['文字列の中の//', 'var s="http://a"; var y=2;', ['http://a'], []],
  ['テンプレの中の//', 'var s=`http://a ${x}`; var y=2;', ['http://a'], []],
  ['割り算 a / b //c', 'var z = a / b; // c', ['a / b'], ['// c']],
  ['++の後の/は割り算', 'var z = a++ / 2; // c', ['a++ / 2'], ['// c']],
  ['文字列の中の/*', 'var s="/* not */"; var y=2;', ['/* not */'], []],
  ['正規表現の中の/*', 'var re=/\\/\\*x/; var y=2;', ['\\/\\*x'], []],
];
for (const [bn, src, keep, gone] of bat) {
  const o = oboegakiWoKesu(src);
  const n = norm(o);
  const keepOk = keep.every((k) => n.includes(k));
  const goneOk = gone.every((g) => !n.includes(g));
  T('① ' + bn, keepOk && goneOk, (keepOk ? '' : '残る字が消えた ') + (goneOk ? '' : '覚書が残った ') + '→[' + n + ']');
  T('③ ' + bn + '：長さ・行数 不変', nagasaGyouFuhen(src, o), '長さ' + src.length + '→' + o.length);
}

/* ④ 剥がした字が node --check を 通る（覚書入りの 正しい JS） */
{
  const code = [
    'const re = /a\\/\\/b/g;   // 行覚書',
    'const s = "http://x /* not */";',
    '/* 囲み',
    '   覚書 */',
    'function f(a){ return a++ / 2; }',
    'export const v = f(4);',
  ].join(NL);
  const o = oboegakiWoKesu(code);
  T('③ 実コード：長さ・行数 不変', nagasaGyouFuhen(code, o));
  const r = kousoTooruKa(o, 'oboegaki-test');
  T('④ 剥がした字が node --check を 通る', r.ok, r.err);
}

/* ⑤ ★素朴版（正規表現を 見ない）だと 電池で 赤に なる＝門に 歯が 在る★
   （正規表現を 見ずに // と /* *\/ を 消す＝正本が これに 退行したら 捕まえる） */
{
  const naive = (s) => s.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  let naiveBad = 0;
  for (const [, src, keep, gone] of bat) {
    const n = norm(naive(src));
    if (!keep.every((k) => n.includes(k)) || !gone.every((g) => !n.includes(g))) naiveBad++;
  }
  T('⑤ 素朴版は この電池で 1件以上 おかしい（歯が在る）', naiveBad >= 1, '素朴版が 全部 通った＝電池が 甘い');
}

/* ⑦ ★stringLiterals★（2026-10-10 まで 客向けの★門の 土台。今は kyaku-hoshi が acorn で 読む＝使うのは この 試験だけ）＝文字列リテラルだけ 取り出す。
   '…'・"…"・`…${x}…` は 字に 数える／正規表現の 中の 引用符・割り算の /・注記の 中の 引用符は 数えない。
   ★正本に 新しい口を 足したら その口も 正本の門が 守る★（指示役①）。 */
{
  const lits = (src) => stringLiterals(src).map((x) => x.lit);
  const has = (src, s) => lits(src).some((l) => l.indexOf(s) >= 0);
  const cnt = (src) => lits(src).length;
  /* 単引用・二重引用・テンプレ＝3本 取れる */
  T('⑦ 単/二重/テンプレ の 3本が 取れる', cnt("var a='A'; var b=\"B\"; var c=`C`;") === 3, '取れた=' + cnt("var a='A'; var b=\"B\"; var c=`C`;"));
  /* テンプレの ${x} の 中まで 1本の 字として 丸ごと */
  T('⑦ テンプレは ${x} 込みで 1本', lits('var s=`x ${a+1} y`;').length === 1 && has('var s=`x ${a+1} y`;', '${a+1}'));
  /* 正規表現の 中の 引用符は 字に 数えない（/'/ は 文字列でない） */
  T('⑦ 正規表現の 中の 引用符は 数えない', cnt("var re=/it's/; var y=2;") === 0, '誤って 取れた=' + cnt("var re=/it's/; var y=2;"));
  /* 注記の 中の 引用符は 数えない */
  T('⑦ 行注記の 中の 引用符は 数えない', cnt("var y=2; // it's a note") === 0, '取れた=' + cnt("var y=2; // it's a note"));
  T('⑦ 囲み注記の 中の 引用符は 数えない', cnt("var y=2; /* it's \"q\" */") === 0, '取れた=' + cnt("var y=2; /* it's \"q\" */"));
  /* 割り算の / は 正規表現と 誤読しない＝字は 取れない */
  T('⑦ 割り算 a/b は 字を 作らない', cnt("var z = a / b; var s = 'ok';") === 1 && has("var z = a / b; var s = 'ok';", 'ok'));
  /* 字の 中の // や /* は 字の 一部（注記でない） */
  T('⑦ 字の 中の // は 字の まま', has('var s="http://a"; var y=2;', 'http://a'));
  /* 行・位置が 付く（門で ファイル:行 を 出せる） */
  T('⑦ line が 付く', stringLiterals('a;\nvar s="x";').some((x) => x.line === 2 && x.lit === '"x"'));
}

/* ⑥ ★drift門★：tests-registered は「1本で どのrepoでも動く」設計＝正本を import できない＝★逐語コピー★。
   そのコピーが 正本と ★1字違い（正規化）★か を 見る。★本体だけでなく 使う道具（seikiHyougenKa・RX定数）も 全部★
   （本体だけ一致して 道具の片方が 古い、が 一番 見つけにくい＝指示役②）。 */
{
  const yomu = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
  const seihon = yomu('tools/_oboegaki.mjs');
  const copy = yomu('scripts/tests-registered.mjs');
  const seikika = (s) => String(s).replace(/^export\s+/gm, '').replace(/\s+/g, '');   /* export を外し 空白を潰す */
  const kanBody = (src, name) => {                 /* function NAME の 本体（brace一致）を 取る */
    const m = src.match(new RegExp('function\\s+' + name + '\\s*\\('));
    if (!m) return null;
    let i = src.indexOf('{', m.index), d = 0, j = i;
    for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (d === 0) { j++; break; } } }
    return src.slice(m.index, j);
  };
  const constLine = (src, name) => { const m = src.match(new RegExp('const\\s+' + name + '\\s*=\\s*[^\\n]+')); return m ? m[0] : null; };
  const pieces = [
    ['RX_MAE_JI', (s) => constLine(s, 'RX_MAE_JI')],
    ['RX_MAE_KOTOBA', (s) => constLine(s, 'RX_MAE_KOTOBA')],
    ['seikiHyougenKa', (s) => kanBody(s, 'seikiHyougenKa')],
    ['oboegakiWoKesu', (s) => kanBody(s, 'oboegakiWoKesu')],
  ];
  for (const [name, get] of pieces) {
    const a = get(seihon), b = get(copy);
    T('⑥ tests-registered の ' + name + ' が 正本と1字一致（逐語コピーのdrift止め）',
      a != null && b != null && seikika(a) === seikika(b),
      a == null ? '正本に ' + name + ' が無い' : b == null ? 'tests-registered に ' + name + ' が無い' : '食い違い');
  }
}

console.log(NL + pass + ' passed, ' + fail + ' failed');
console.log('KEKKA {"passed":' + pass + ',"failed":' + fail + ',"mimiso":0}');
process.exit(fail ? 1 : 0);
