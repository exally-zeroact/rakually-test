#!/bin/sh
# kinshi-ci.sh — ★禁止の字の見張りの CI の段を 1行で 呼ぶ★（2026-10-11）
#
# ★なぜ 要るか★
#   Castally の 凍結版の ci.yml は 各段を `run: |`（何行もの 塊）で 書く。
#   ★この repo の 押す前の 網（tools/oshu-mae.mjs）は `run:` の 1行だけを 拾う★（tools/_dan-hirou.mjs の hirouDan）
#   ＝塊の 段は「|」という 命令として 回って ★9段 赤★・見張りの 中身は 網で 1回も 走らない（taiketsu 10-11 実測）。
#   ⇒ ci.yml は `run: sh scripts/kinshi-ci.sh <確かめ方> -- <命令>` の 1行に する
#     （網は Windows の cmd で 回す＝Git の sh.exe が PATH に 在る。CI は ubuntu の sh）。
#   ★命令は ci.yml の 行に そのまま 書く★＝何を 走らせるかが yml から 読める（tests/ci-coverage.test.mjs も そこを 数える）。
#
# ★確かめ方（凍結版の 段と 同じ）★
#   owari      … 終わり値 0 ＋ 終わりの 行「✓ 実在の 字 0 件」が 出たか（本体が 黙って 終わるのを 緑に しない）
#   N または N,M … 終わり値 0 ＋ scripts/ci-yuka.sh の 床（N 組 以上・M 回 以上）
# ★出しは 消さない★（一旦 書いて cat で 出す＝CI の ログに 本体の 出しが 残る）
# ★終わり値を 捨てない★
# 使い方: sh scripts/kinshi-ci.sh owari -- node tests/kinshi-ji.test.mjs
#         sh scripts/kinshi-ci.sh 29,239 -- node tests/kinshi-ji.test.mjs --self-test
set -u
mode="${1:-}"
[ "${2:-}" = "--" ] || { echo "✗ 使い方: sh scripts/kinshi-ci.sh <owari|N|N,M> -- <命令>"; exit 2; }
shift 2
[ $# -gt 0 ] || { echo "✗ 命令が 無い"; exit 2; }
here="$(cd "$(dirname "$0")" && pwd)"
d="$(mktemp -d 2>/dev/null || echo "${TMPDIR:-/tmp}/kinshi-ci.$$")"
mkdir -p "$d"
trap 'rm -rf "$d"' EXIT
out="$d/out.txt"

"$@" > "$out" 2>&1
c=$?
cat "$out"
[ $c -eq 0 ] || { echo "✗ 終わり値 $c"; exit 1; }

case "$mode" in
  owari)
    grep -q "^✓ 実在の 字 0 件" "$out" || { echo "✗ 終わりの 行（✓ 実在の 字 0 件）が 出ていない"; exit 1; }
    ;;
  *[!0-9,]* | "" | ,* | *,)
    echo "✗ 確かめ方が 違う: $mode（owari か N か N,M）"; exit 2
    ;;
  *,*)
    sh "$here/ci-yuka.sh" "$out" "${mode%%,*}" "${mode#*,}" || exit 1
    ;;
  *)
    sh "$here/ci-yuka.sh" "$out" "$mode" || exit 1
    ;;
esac
