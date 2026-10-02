/* kagi-no-okiba.test.mjs — ★倉庫の 鍵を どこから 読むか★の 確かめ（倉庫に 触らない・純粋）
 * ============================================================================
 * ★なぜ（2026-10-03・棚⑨）★
 *   _souko-kazoeru.mjs の 鍵読みを %TEMP% から ~/.supabase-token に 変えた。
 *   %TEMP% は 掃除で 消える（10-02 に 消えて 半日 止まった）。記憶の HARD「%TEMP% に 鍵を 置くな」。
 *   ★この 確かめは 倉庫に 1回も 問わない／api.supabase.com を 1回も 叩かない／子プロセスも 使わない★
 *     ＝_souko-kazoeru が 出す TOKEN_FILE と kagiYomu() を 読んで 字で 見るだけ。本物の 鍵の 中身は 出さない。
 *   ★名前に souko- を 付けない★＝押す前の 網の 飛ばす 名簿（_dan-hirou /souko-|…/）に 落ちない為
 *     （倉庫に 触らない＝網で 必ず 走る べき 物）。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { TOKEN_FILE, kagiYomu } = await import('./_souko-kazoeru.mjs');

let pass = 0, fail = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };

console.log('\n[kagi-no-okiba] 倉庫の 鍵を ~/.supabase-token から 読む（倉庫に 触らない）');

/* ① 置き場は ~/.supabase-token（HOME の 下・名前は .supabase-token） */
T('★① 鍵の 置き場は ~/.supabase-token★', TOKEN_FILE === path.join(os.homedir(), '.supabase-token'), '実際 ' + TOKEN_FILE);

/* ② %TEMP%（一時フォルダ）の 下では ない＝古い 置き場を もう 見ない */
const tmp = os.tmpdir();
T('★② 一時フォルダ（%TEMP%）の 下では ない★', TOKEN_FILE.toLowerCase().indexOf(tmp.toLowerCase()) < 0, 'TEMP=' + tmp);
/* 念の為 … 古い 置き場の 名前の かけら（db-url）を 持たない */
T('★② 置き場の 名前に 古い かけら（db-url）が 無い★', !/db-url/i.test(TOKEN_FILE), TOKEN_FILE);

/* ③ 鍵の 紙が 無ければ null＝止まる 側（0と 言わない）。偽の パスで 試す（本物は 読まない） */
const naiPath = path.join(os.tmpdir(), 'kagi-okiba-nai-' + Date.now() + '.json');
T('★③ 無い ファイルは null（止まる 側）★', kagiYomu(naiPath) === null, '返り ' + JSON.stringify(kagiYomu(naiPath)));

/* ④ 鍵の 紙が 在れば token を 読む（偽の token＝中身は 本物でない） */
const ariPath = path.join(os.tmpdir(), 'kagi-okiba-ari-' + Date.now() + '.json');
try {
  fs.writeFileSync(ariPath, JSON.stringify({ token: 'DUMMY_NOT_REAL' }));
  T('★④ 在る ファイルから token を 読む★', kagiYomu(ariPath) === 'DUMMY_NOT_REAL', '返り ' + JSON.stringify(kagiYomu(ariPath)));
  /* ⑤ 形が 壊れていても 転ばない（null） */
  fs.writeFileSync(ariPath, '{壊れた');
  T('★⑤ 壊れた ファイルは null（転ばない）★', kagiYomu(ariPath) === null, '返り ' + JSON.stringify(kagiYomu(ariPath)));
} finally {
  try { fs.rmSync(ariPath, { force: true }); } catch (e) {}
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
