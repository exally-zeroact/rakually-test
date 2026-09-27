/* mon-ga-tsuite-iru.test.mjs — ★押す前の 網の 門が ★別の 手元にも 付いて 行くか★★
 * =============================================================================
 * ★なぜ 要るか（2026-09-28 実測・指示役1）★
 *   司さんの 09-24「★2 検査する必要があるならやれ★」で `hooks/pre-push` を 置いた。
 *   ★但し `hooks/` を git に add して いなかった★ので、こう なって いた。
 *
 *     ★手元★                                   `core.hooksPath`   `hooks/pre-push`
 *     `rakually-test`（テスト線・主）………………  `hooks`            ★在る＝門は 走る★
 *     `…/Temp/claude/wt-raku`（別の worktree） `hooks`(共通)      ★★無い＝黙って 走らない★★
 *     `rakually`（★本番★）…………………………  ★無い★            ★★無い＝1段も 走らない★★
 *
 *   ⇒ ★★★一番 高い 所（本番）に 門が 1つも 無かった★★★
 *   ⇒ ★★`ship-all` は `git ls-files` で 選ぶ＝★add して いない 物は 永久に 運べない★★★
 *     （`git ls-files | grep '^hooks/'` ⇒ ★0本★ ／ `.gitignore` では ない＝★ただ add 忘れ★）
 *
 * ★★この 見張りが 見る 事（★CI でも 走る 物だけ★）★★
 *   ⑴`hooks/pre-push` が ★git に 載って いる★（＝clone・worktree・運び先に 付いて 行く）
 *   ⑵その 中身が ★網（tools/oshu-mae.mjs）を 呼んで いる★
 *   ⑶★逃げ道（--no-verify）と 付け方（core.hooksPath）が 紙に 書いて 在る★
 *   ⑷`.gitignore` で ★消されて いない★
 *
 * ★★この 見張りが ★見ない 事★（先に 書く）★★
 *   ・★`core.hooksPath` が その 手元で 打たれて いるか★は ★CI からは 見えません★
 *     （CI は 別の 機械＝ローカルの 設定を 持たない）
 *   ⇒ ★だから ★運ぶ 道具の 側★ で 運び先を 見ます★（`scripts/ship-all.mjs`）
 *   ・★門が 本当に 走るか★は ★押してみる まで 分かりません★（★字で 数えた だけ★）
 *
 * 使い方:
 *   node tests/mon-ga-tsuite-iru.test.mjs              … 見る
 *   node tests/mon-ga-tsuite-iru.test.mjs --self-test  … ★わざと 壊して 赤に なるか★
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const MON = 'hooks/pre-push';

/* ★git が 見て いる 名簿（★手元の 字では なく 名簿★）★ */
export function noseteIruKa(root, name) {
  const out = execFileSync('git', ['ls-files', '--', name], { cwd: root, encoding: 'utf8' });
  return out.split('\n').map((x) => x.trim()).filter(Boolean);
}

/* ★判じ（★字を 渡して 判じる＝自己確認で わざと 壊せる 形★）★ */
export function miru(nosetta, ji, muji) {
  return {
    nosete:  nosetta.indexOf(MON) >= 0,
    ami:     /tools\/oshu-mae\.mjs/.test(ji),
    nigemichi: /--no-verify/.test(ji),
    tsukekata: /core\.hooksPath/.test(ji),
    kesarete: muji,
  };
}

const say = (() => { let ng = 0; return {
  iu(nm, ok, soe) { if (!ok) ng++; console.log('  ' + (ok ? '✓' : '✗') + ' ' + nm + (soe ? '  ' + soe : '') + (ok ? '' : '  ★思っていたのと 違う★')); },
  kazu() { return ng; },
}; })();

if (process.argv.includes('--self-test')) {
  console.log('\n[mon-ga-tsuite-iru] ★自己確認★（★わざと 壊して 赤に なるか★）');
  const yoi = miru([MON], 'node tools/oshu-mae.mjs / --no-verify / core.hooksPath hooks', false);
  say.iu('★揃って いれば 5つ とも 真★', yoi.nosete && yoi.ami && yoi.nigemichi && yoi.tsukekata && !yoi.kesarete);
  say.iu('★名簿に 無ければ 偽★', miru([], 'node tools/oshu-mae.mjs', false).nosete === false);
  say.iu('★別の 名前だけ 在っても 偽★', miru(['hooks/pre-commit'], '', false).nosete === false);
  say.iu('★網を 呼んで いなければ 偽★', miru([MON], 'echo ok', false).ami === false);
  say.iu('★逃げ道が 書いて いなければ 偽★', miru([MON], 'node tools/oshu-mae.mjs', false).nigemichi === false);
  say.iu('★付け方が 書いて いなければ 偽★', miru([MON], 'node tools/oshu-mae.mjs', false).tsukekata === false);
  say.iu('★消されて いれば 真（＝赤に する）★', miru([MON], '', true).kesarete === true);
  const hon = noseteIruKa(ROOT, MON);
  say.iu('★名簿を 引く 口が 生きて いる（配列を 返す）★', Array.isArray(hon), '今 ' + hon.length + '本');
  if (say.kazu()) { console.log('\n★自己確認 ' + say.kazu() + '件 おかしい★'); process.exit(1); }
  console.log('  ★8通り ぜんぶ 思った通り★');
  process.exit(0);
}

console.log('\n[mon-ga-tsuite-iru] ★押す前の 網の 門は 別の 手元にも 付いて 行くか★');

const P = path.join(ROOT, MON);
const aru = fs.existsSync(P);
const ji = aru ? fs.readFileSync(P, 'utf8') : '';
let muji = false;
try { execFileSync('git', ['check-ignore', '--', MON], { cwd: ROOT, encoding: 'utf8' }); muji = true; } catch { muji = false; }
const nosetta = noseteIruKa(ROOT, MON);
const m = miru(nosetta, ji, muji);

say.iu('★門の 字が 手元に 在る★', aru, MON);
say.iu('★★門が git の 名簿に 載って いる（＝clone・worktree・運び先に 付いて 行く）★★', m.nosete,
  '名簿 ' + nosetta.length + '本');
say.iu('★門が 網（tools/oshu-mae.mjs）を 呼んで いる★', m.ami);
say.iu('★逃げ道（--no-verify）が 紙に 書いて 在る★', m.nigemichi);
say.iu('★付け方（core.hooksPath）が 紙に 書いて 在る★', m.tsukekata);
say.iu('★.gitignore で 消されて いない★', !m.kesarete);

/* ★数だけ 出す（判じない）★＝★この 手元で 設定が 打たれて いるか★は CI からは 見えない */
let hp = '（打たれて いません）';
try { hp = execFileSync('git', ['config', '--get', 'core.hooksPath'], { cwd: ROOT, encoding: 'utf8' }).trim() || '（空）'; } catch { /* 無い */ }
console.log('     ★この 手元の core.hooksPath ＝ ' + hp + '★（★判じません＝CI には 無いのが 普通★）');
console.log('     ★運び先に 門が 在るかは ★運ぶ 道具★が 見ます（scripts/ship-all.mjs）★');

if (say.kazu()) { console.log('\n★' + say.kazu() + '件 赤★'); process.exit(1); }
console.log('\n★6通り ぜんぶ 緑★');
