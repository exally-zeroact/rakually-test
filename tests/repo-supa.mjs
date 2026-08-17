/* repo-supa.mjs — 「このリポジトリが向いている Supabase」を返すだけの小さな部品。
 *
 * なぜ必要か（2026-08-01・staging合わせ直しで入れた）:
 *   実DBに触る手動ツール(live-seed / live-roundtrip)が、接続先を【ファイルに直書き】していた。
 *   本番リポジトリ(exally)から作ったスナップショットをテストリポジトリ(exally-staging)へ持ってくると、
 *   その直書きがそのまま付いてくる＝【テスト環境のつもりで本番倉庫を触る】という最悪の事故になる。
 *
 *   接続先を決める物は、リポジトリの中に1つしか無い ＝ js/supa-config.js。
 *   （本番exally→本番倉庫 / exally-staging→DB-test。本番とstagingで中身が違う唯一のファイル＝環境の分かれ目。）
 *   道具はそこから読む。こうすると「どのリポジトリで走らせたか」だけで向き先が決まり、
 *   人が気をつける必要が無くなる（機械で事故を止める）。
 *
 * 使い方: import { repoSupa } from './repo-supa.mjs';  const { url, key, ref } = repoSupa();
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export function repoSupa(root = ROOT) {
  const p = path.join(root, 'js', 'supa-config.js');
  if (!fs.existsSync(p)) throw new Error('js/supa-config.js が無い＝接続先を決められない。処理を中止します。');
  const src = fs.readFileSync(p, 'utf8');
  // コメント文中の説明に引っかからないよう、window.SUPA の中身だけを見る
  const body = src.slice(src.indexOf('window.SUPA'));
  const url = (body.match(/url:\s*'([^']+)'/) || [])[1];
  const key = (body.match(/key:\s*'([^']+)'/) || [])[1];
  if (!url || !key) throw new Error('js/supa-config.js から url/key を読めない。処理を中止します。');
  const ref = (url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1] || '';
  return { url, key, ref };
}
