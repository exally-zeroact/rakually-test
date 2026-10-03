/* _oboegaki.mjs — ★覚書（コメント）を 外す 正本★（正規表現/文字列/テンプレを 誤って 消さない）
 * ============================================================================
 * ★なぜ 在るか（2026-10-03・指示役と・実測）★
 *   覚書はがしが ★repo の あちこちで 6つ 別実装★に なって いて、走らせて 測ると：
 *     ・refs-resolve／op-boundary … 正規表現 `/a\/\/b/` を 覚書と 見て 消す（正規表現 非対応）
 *     ・ios-unsupported／pw-borrow … 文字列の 中の `/* ... *\/` を 消す（文字列 非対応）
 *   ⇒ その 門は「覚書の 中の 字を 本物と 誤読」「正規表現/文字列を 消して 本物を 見落とす」をやり得た。
 *   ⇒ ★正本を 1つに し、import できる 消費者は これを 読む（写さない）★。
 *     （import すると 本体が 走る／process.exit する 物からは 剥がす＝だから ★この ファイルは 副作用 0★）
 *
 * ★完成形は silent-catch の oboegakiWoKesu（2026-10-02・指示役引き継ぎ ★7 で 直した物）★。
 *   ★tests-registered だけは 例外★＝「1本で どの repo でも 動く」設計（他 repo にも 配ってある）なので
 *   import に 変えず コピーを 持つ。その コピーが ★この 正本と 1字も 違わない★事を tests/oboegaki.test.mjs が 見る。
 *   ★SQL の 覚書はがし（seikyu-sql-guard）は 別言語＝対象外★。
 *
 * ★使い方★
 *   import { oboegakiWoKesu, nagasaGyouFuhen, kousoTooruKa } from '../tools/_oboegaki.mjs';
 *   const su = oboegakiWoKesu(nama);           // 覚書を 空白/改行に（長さ・行数は 変えない）
 *   if (!nagasaGyouFuhen(nama, su)) …          // 長さか 行数が 変わった＝本物を 消した 疑い
 *   const r = kousoTooruKa(su); if(!r.ok) …    // 剥がした 字が まだ 構文として 通るか（node --check）
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/* ★正規表現か 割り算か（直前の 字で 見分ける）★
   ・直前が 演算子・開き括弧・区切り／return 等の 言葉／頭 … ★正規表現★
   ・++ -- の 後、名前・数・閉じ括弧の 後 … ★割り算★
   ・★知っている 穴（緩めない）★ … 閉じ丸括弧の 後の / は 割り算と 読む（10-02 実測＝23本で 割り算24/正規表現0） */
const RX_MAE_JI = /[(,=:\[!&|?{};+\-*%<>~^]/;
const RX_MAE_KOTOBA = /(?:^|[^\w$])(?:return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await)$/;
export function seikiHyougenKa(out) {
  let k = out.length - 1;
  while (k >= 0 && /\s/.test(out[k])) k--;
  if (k < 0) return true;
  const mae = out.slice(Math.max(0, k - 11), k + 1);
  if (mae.endsWith('++') || mae.endsWith('--')) return false;
  return RX_MAE_JI.test(out[k]) || RX_MAE_KOTOBA.test(mae);
}

/* ★覚書を 外す★＝覚書は 空白/改行に 置き換える（★長さと 行数は 変えない★＝行番号を ずらさない）。
   正規表現・文字列・テンプレ は ★字の まま 写す★（中の // や 引用符を 覚書/字の 始まりと 読まない）。 */
export function oboegakiWoKesu(src) {
  const n = src.length;
  let out = '', i = 0;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') {                     /* ★行の 覚書★ */
      let j = i; while (j < n && src[j] !== '\n') j++;
      out += ' '.repeat(j - i); i = j; continue;
    }
    if (c === '/' && d === '*') {                     /* ★囲みの 覚書★ */
      let j = i + 2;
      while (j < n && !(src[j] === '*' && src[j + 1] === '/')) j++;
      j = Math.min(n, j + 2);
      for (let k = i; k < j; k++) out += (src[k] === '\n' ? '\n' : ' ');   /* 改行は 残す */
      i = j; continue;
    }
    if (c === '/' && seikiHyougenKa(out)) {           /* ★正規表現★＝字の まま 写す */
      let j = i + 1, kakko = false, toji = false;
      while (j < n && src[j] !== '\n') {              /* 改行で 打ち切る＝割り算の 見間違いで 遠くまで 飲まない */
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '[') kakko = true;
        else if (src[j] === ']') kakko = false;
        else if (src[j] === '/' && !kakko) { toji = true; j++; break; }
        j++;
      }
      if (toji) {
        while (j < n && /[a-z]/i.test(src[j])) j++;   /* 旗（g i m など） */
        out += src.slice(i, j); i = j; continue;
      }
    }
    if (c === "'" || c === '"' || c === '`') {        /* ★字は そのまま★ */
      const q = c; let j = i + 1;
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === q) { j++; break; }
        j++;
      }
      out += src.slice(i, j); i = j; continue;
    }
    out += c; i++;
  }
  return out;
}

/* ★長さと 行数が 1つも 変わって いない か★＝正規表現/文字列を 誤って 消すと ここで 分かる（偽の緑止め） */
export function nagasaGyouFuhen(nama, su) {
  const gyo = (s) => s.split('\n').length;
  return su.length === nama.length && gyo(su) === gyo(nama);
}

/* ★剥がした 字が まだ 構文として 通るか★（node --check）＝本物の コードを 空白に したら 転ぶ
   （長さ・行数が 同じ だけでは 分からない＝空白に 置き換えても 長さは 変わらない）。
   返り { ok, err }。★呼んだ 時だけ 一時ファイルを 書く＝module 読み込みでは 何もしない★ */
export function kousoTooruKa(su, nafuda) {
  const tmp = path.join(os.tmpdir(), 'oboegaki-' + process.pid + '-' + (nafuda ? path.basename(nafuda) : 'x') + '.mjs');
  fs.writeFileSync(tmp, su);
  try { execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' }); return { ok: true, err: '' }; }
  catch (e) { return { ok: false, err: String((e && (e.stderr || e.message)) || '').slice(0, 300) }; }
  finally { try { fs.unlinkSync(tmp); } catch (e2) { /* 消せなくても 止めない */ } }
}
