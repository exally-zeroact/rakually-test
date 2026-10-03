/* _bunrui.mjs — ★段の 出しを 4つ組に 分ける★（+「exit0なのにfailed/✗」を 別に 拾う）
 * ============================================================================
 * ★なぜ 在るか（2026-10-03・指示役と）★
 *   網(oshu-mae)も GitHub も ★段の 終わり値だけ★で 緑/赤 を 数え、★中で 測ったか★を 見ていない。
 *   ⇒ 「🟡未測定 exit0」も「回った(緑)」に 数える＝★「緑256は 中で 抜けた段を 割っていない 盛り」★。
 *
 * ★★読み方は 2段（指示役①）★★
 *   ⑴ ★まず 約束の 行★ … 試験が 最後に `KEKKA {"passed":N,"failed":M,"mimiso":K}` を 出す。機械が 読む 形。
 *   ⑵ ★無い 試験だけ 字の目印★ … `N passed, M failed` と 🟡/未測定 と ✓/✗ の 印（★飾りの字頼み＝将来 減らす★）。
 *   ⇒ 出しに「約束の行で 読んだ 数／字の目印で 読んだ 数」を 並べる。
 *
 * ★★保守（嘘を 両方向で 止める・2026-10-03 実測で 直した）★★
 *   ・passed 行も KEKKA も 無い 段でも、✓/✗ を 並べて 終わる 試験は ★測って いる★（実測：7通りの自己確認等）。
 *     ⇒ ★それを「丸ごと抜け」と 言わない★（偽陰性＝測った物を 抜けと 言う 新しい 嘘）。
 *     ・✗ が 1つ以上（終わり値0）… exit0failed（赤を 緑と 言う 疑い・指示役②）
 *     ・✓ だけ ………………………… 読めない（測っては いる・形が 違う＝★KEKKA を 足す to-do★）
 *     ・印が 無く 🟡/未測定 だけ … 丸ごと抜け（本当に 走って 何も 測って いない）
 *   ・★凡例/但し書きの 印は 数えない★ … 行頭の `✓␠`/`✗␠` だけ 数え、`✓＝…`（説明）や 「未測定 0…」は 数えない。
 *
 * ★4つ組＋2★
 *   測った / 一部抜け / 丸ごと抜け / 読めない ／ exit0failed（終わり値0なのに failed>0 or ✗>0）／ 赤（終わり値≠0）
 */

/* ★最後の 約束の 行（KEKKA {...}）★ */
export function yomuYakusoku(out) {
  const m = [...String(out || '').matchAll(/^\s*KEKKA\s+(\{.*\})\s*$/gm)];
  if (!m.length) return null;
  try {
    const o = JSON.parse(m[m.length - 1][1]);
    const n = (x) => (Number.isFinite(+x) ? +x : 0);
    return { passed: n(o.passed), failed: n(o.failed), mimiso: n(o.mimiso) };
  } catch (e) { return null; }
}

/* ★行で 数える（凡例を 外す）★
   ・印＝★行頭★の `✓␠`/`✗␠`（説明の `✓＝…` や `✗:…` は 外す）
   ・未測定＝🟡 の 行、または 正の数＋未測定（「未測定 0…」は 外す） */
function kazoeruGyou(out) {
  const lines = String(out || '').split(String.fromCharCode(10));
  let ok = 0, ng = 0, skip = 0;
  for (const ln of lines) {
    const t = ln.replace(/^\s+/, '');
    if (/^✓\s+\S/.test(t) && !/^✓\s*[＝=：:]/.test(t)) ok++;
    else if (/^✗\s+\S/.test(t) && !/^✗\s*[＝=：:]/.test(t)) ng++;
    if (/🟡/.test(ln) || /[1-9]\d*\s*(?:★\s*)?未測定/.test(ln)) skip++;
  }
  return { ok, ng, skip };
}

/* ★passed/failed の 最後の 1組★ */
function lastPF(out) {
  const m = [...String(out || '').matchAll(/(\d+)\s*passed,?\s*(\d+)\s*failed/g)];
  return m.length ? { passed: +m[m.length - 1][1], failed: +m[m.length - 1][2] } : null;
}

/* ★読む（約束→目印）★ */
export function yomu(out) {
  const y = yomuYakusoku(out);
  if (y) return { how: '約束', hasPF: true, passed: y.passed, failed: y.failed, skip: y.mimiso > 0, mimiso: y.mimiso, ok: 0, ng: 0 };
  const pf = lastPF(out);
  const g = kazoeruGyou(out);
  const skip = g.skip > 0;
  if (pf) return { how: '目印', hasPF: true, passed: pf.passed, failed: pf.failed, skip, mimiso: g.skip, ok: g.ok, ng: g.ng };
  if (g.ok || g.ng || skip) return { how: '目印', hasPF: false, passed: 0, failed: 0, skip, mimiso: g.skip, ok: g.ok, ng: g.ng };
  return { how: '無', hasPF: false, passed: 0, failed: 0, skip: false, mimiso: 0, ok: 0, ng: 0 };
}

/* ★分類★ … status（終わり値・CIなら success=0/failure=1）と 出し から 桶を 決める */
export function bunrui(status, out) {
  const r = yomu(out);
  const base = { how: r.how, passed: r.passed, failed: r.failed, mimiso: r.mimiso, ok: r.ok, ng: r.ng };
  if (status !== 0) return { oke: '赤', ...base };
  /* 終わり値0 */
  if (r.hasPF) {
    if (r.failed > 0) return { oke: 'exit0failed', ...base };         /* 赤を 緑と 言う */
    if (r.passed > 0 && r.skip) return { oke: '一部抜け', ...base };
    if (r.passed > 0) return { oke: '測った', ...base };
    /* passed==0 で failed==0（約束で 0/0 等）→ 未測定なら 丸ごと抜け・でなければ 読めない */
    return { oke: r.skip ? '丸ごと抜け' : '読めない', ...base };
  }
  /* passed 行も KEKKA も 無い（印で 見る・保守） */
  if (r.ng > 0) return { oke: 'exit0failed', ...base };               /* ✗ が 在る＝赤を 緑と 言う 疑い */
  if (r.ok > 0) return { oke: '読めない', ...base };                  /* ✓ だけ＝測っては いる・形が 違う＝KEKKA要 */
  if (r.skip) return { oke: '丸ごと抜け', ...base };                  /* 印 無し・未測定 だけ＝何も 測って いない */
  return { oke: '読めない', ...base };
}

export const OKE_JUN = ['測った', '一部抜け', '丸ごと抜け', '読めない', 'exit0failed', '赤'];
