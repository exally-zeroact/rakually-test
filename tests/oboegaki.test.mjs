/* oboegaki.test.mjs — ★覚書はがしの正本 _oboegaki の 守り★（純・走らせて 測る＝読むだけでない）
 * ★守る事★ … ①覚書は 消す ②正規表現/文字列/テンプレ は 消さない（中の // や 引用符を 誤読しない）
 *   ③長さ・行数は 変えない（偽の緑止め） ④剥がした 字が node --check を 通る
 *   ⑤★素朴版（正規表現を 見ない）だと この電池で 赤に なる＝門に 歯が 在る証し★
 * ★最後に KEKKA を 出す★（約束のドッグフード）。 */
import { oboegakiWoKesu, nagasaGyouFuhen, kousoTooruKa } from '../tools/_oboegaki.mjs';

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

console.log(NL + pass + ' passed, ' + fail + ' failed');
console.log('KEKKA {"passed":' + pass + ',"failed":' + fail + ',"mimiso":0}');
process.exit(fail ? 1 : 0);
