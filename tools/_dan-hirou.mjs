/* _dan-hirou.mjs — ★yml から 段を 拾う★ と ★その段が 重いか★ を ★1か所★に 置く
 * ============================================================================
 * ★なぜ 在るか（2026-09-22 実測で 踏んだ）★
 *   ★私は 押す前に `tests/*.test.mjs` の 31本を 回して いました★
 *   ⇒ ★今日 4回 踏んだ うち ★3回は そこで 出た★／★1回（`scripts/silent-catch.mjs`）は 出なかった★
 *   ⇒ ★数えたら★ … ★ci.yml の node の 段 240★／★私が 回す 31★／★★差 209★★
 *   ⇒ ★★『名簿は 置き場から 作る』と 書いたのに、★その 置き場（括り）を 選んだのは 人★★★
 *     ＝★『人が 書く 所を 無くした』つもりで ★括りの 方に 人が 残って いた★★
 *
 * ★★だから ここで 決める 事★★
 *   ⑴ ★段は yml から 拾う★（★人が 並べない★）
 *   ⑵ ★重い／軽いは ★命令の 字★で 決める★（★人が 1本ずつ 選ばない★）
 *   ⑶ ★除いた 段は ★数と 訳★を 必ず 出す★（★走らせた ＋ 除いた ＝ 全★）
 *
 * ★★重いと 決める 字（★これを 変えたら 前の 数と 比べられません★）★★
 *   ・`borrow(` ／ `-ui.mjs` ／ `playwright` … ★実ブラウザを 借りる★
 *   ・`_souko-kazoeru` ／ `souko-` ／ `koji-mon` ／ `maboroshi` … ★倉庫を 触る★
 *   ・`clock-sweep` ／ `souname` … ★中で 他の 段を 回す（二重に 走る）★
 *   ・`npm ` ／ `npx ` … ★支度★
 *   ⇒ ★★それ以外を「速い」と 呼ぶ★★（★速さを 秒で 測って いません／★字で 決めて います★）
 *     ＝★秒で 決めると 機械の 速さで 揺れる★ので ★字に した★（訳）
 */

/* ★yml の `run:` を 全部 拾う★（clock-sweep と ★同じ 1行★＝2か所で 持たない） */
export function hirouDan(ymlJi) {
  return [...String(ymlJi || '').matchAll(/^\s*run:\s*(.+)$/gm)].map((m) => m[1].trim());
}

/* ★重い 段の 見分け（字で 決める）★＝当たった 訳も 返す（★黙って 除けない★） */
export const OMOI = [
  { re: /\bborrow\(|-ui\.mjs|playwright/i, wake: '実ブラウザを 借りる' },
  /* ★「倉庫を 触る」は 名前で 外さない（2026-10-03）★＝名前の 字で 決めると 静的な 門（souko-mon・koji-mon）まで 飛ばす
     ＝手元 緑・CI 赤 の 元に なった（souko-mon が 手元で 飛ばされ CI だけで 回って 赤）。
     ★この 名簿は「重い段」を 速さの為に 外す物（安全では ない）★ので、倉庫の 試験は 外さず 網で 回す
       （手元は 鍵在りで 通る／鍵無しの 機械は 各試験が 自分で 抜ける＝kagi-terasu・rls-tanin・souko-kengen と 同じ）。
     本番の 倉庫を 読む 恐れの ある souko-kengen は、その 頭に「repoEnv が test 以外は 抜ける」を 置いた。 */
  { re: /clock-sweep|souname/i, wake: '中で 他の 段を 回す' },
  { re: /^npm\s|^npx\s/i, wake: '支度' },
];

export function omoiKa(cmd) {
  for (const o of OMOI) if (o.re.test(String(cmd || ''))) return o.wake;
  return null;
}

/* ★押す前に 回す 段を 選ぶ★＝★走らせる／除く を 両方 返す（差を 隠さない）★ */
export function erabu(ymlJi) {
  const zen = hirouDan(ymlJi);
  const hashiru = [], nozoku = [];
  zen.forEach((c, i) => {
    const w = omoiKa(c);
    if (w) nozoku.push({ i: i + 1, c, wake: w });
    else hashiru.push({ i: i + 1, c });
  });
  return { zen: zen.length, hashiru, nozoku };
}

/* ★★段ごとの 秒を まとめる★★（2026-11-02・網を 組に 割る 前に 測る＝taiketsu 止4 の 1つ目）
   ★なぜ★ … 網は 段ごとの 秒を 控えて いなかった＝「どの 段が 重いか」「上限 180秒に 近い 段が 何本か」が 見立てだった
   ★出す 物★ … 合計秒・遅い 順の 上位・上限に 近い（120秒 以上）段の 数・CI の job ごとの 秒（割り方を 秒で 決める 元）
   ★守りは 変えない★ … 秒は 見るだけ（赤／緑の 判じに 使わない） */
export function byouMatome(list, ue = 15, chikai = 120) {
  const zen = list.reduce((s, x) => s + x.byou, 0);
  const jun = list.slice().sort((a, b) => b.byou - a.byou);
  const job = {};
  list.forEach((x) => { const k = x.job || '?'; job[k] = job[k] || { dan: 0, byou: 0 }; job[k].dan++; job[k].byou += x.byou; });
  return { zen, ue: jun.slice(0, ue), chikai: jun.filter((x) => x.byou >= chikai).length, job };
}
/* ★段の 番号 → CI の job の 名★（oshu-mae.mjs は 読むと 網が 走る＝関数は ここに 置く）（yml の 字を 上から 読む・拾い方は hirouDan と 同じ run: の 行） */
export function danNoJob(ymlJi) {
  const out = []; let cur = null;
  String(ymlJi || '').split(String.fromCharCode(10)).forEach((l) => {
    const m = l.match(/^  ([A-Za-z0-9_-]+):\s*$/);
    if (m) cur = m[1];
    if (/^\s*run:\s*(.+)$/.test(l)) out.push(cur);
  });
  return out;
}

/* ★★押す sha を 読む★★（2026-11-03・網の 4つ割り 押し2＝設計前 taiketsu 止1）
   ★入力★ … pre-push の 標準入力（1行＝`<local ref> <local sha> <remote ref> <remote sha>`）
   ★返す★ … { gyou: 行数, shas: 0で ない local sha（重なりを 除く）, kesu: 消す 押しの 数, naze: 止める 訳 か null }
   ★止める★ … 行が 0（＝押す 物が 分からない＝赤）／0で ない sha が 2つ 以上（＝1つの 作業木で 全部を 見られない・1押し1件）
   ★飛ばす★ … 消す 押しだけ（shas 0・kesu 1以上）＝回す 物が 無い */
export function oshuShaYomu(txt) {
  const ZERO = /^0+$/;
  const gyou = String(txt || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const shas = []; let kesu = 0, hen = 0;
  gyou.forEach((l) => {
    const p = l.split(/\s+/);
    if (p.length < 4 || !/^[0-9a-f]{40}$/.test(p[1])) { hen++; return; }
    if (ZERO.test(p[1])) { kesu++; return; }
    if (shas.indexOf(p[1]) < 0) shas.push(p[1]);
  });
  let naze = null;
  if (!gyou.length) naze = '押す 物の 名簿が 空（何を 押すか 分からない）';
  else if (hen) naze = '読めない 行が ' + hen + '行';
  else if (shas.length > 1) naze = '0で ない sha が ' + shas.length + 'つ（1押し1件＝1つずつ 押す）';
  return { gyou: gyou.length, shas, kesu, naze };
}

/* ★★前の 網が 残した 作業木の うち 消して よい 物★★（設計前 taiketsu 止3＝他の 席の 網を 消さない）
   ★名前★ … `om-<pid>-<始めた ms の 36進>` か `om-<pid>-<36進>_<道名>`（押し3）（この 形 以外は 触らない）
   ★消す★ … pid が 死んで いる 物 か、始めて から kigenMs（既定 6時間）を 過ぎた 物 だけ
   ★ikiteru(pid)★ … 呼ぶ 側が 渡す（試験で 差し替える） */
export function nokoriErabu(namae, nowMs, ikiteru, kigenMs = 6 * 3600 * 1000) {
  const out = [];
  namae.forEach((n) => {
    const m = String(n).match(/^om-(\d+)-([0-9a-z]+)(?:_[A-Za-z0-9-]+)?$/);   /* ★押し3＝道ごとの 作業木 om-<pid>-<36進>_<道名> も 拾う（設計前 taiketsu 止1）★ */
    if (!m) return;
    const pid = Number(m[1]), t = parseInt(m[2], 36);
    if (!ikiteru(pid)) out.push({ n, naze: 'pid ' + pid + ' が 居ない' });
    else if (!(t > 0) || nowMs - t > kigenMs) out.push({ n, naze: '古い（' + ((nowMs - t) / 3600000).toFixed(1) + '時間）' });
  });
  return out;
}

/* ★★試験口（test@test.com・共有の 倉庫）に 触る 段か★★（2026-11-03・網の 4つ割り 押し3＝設計前 taiketsu 止2）
   ★なぜ★ … 試験口は CI・WebKit・他の 席と 共有＝同じ 時刻に 書くと ぶつかる。道を 並べる 時、
     試験口に 触る 段が 2本 以上の 道に 分かれると 手元で ぶつかる。★job の 名前で 決めない★（名前が 変わる・段が 移る）。
   ★見方（2つ・どちらか で 触る）★
     ⑴ job の 印（kuchiJobYomu）… yml の job に `SHIKEN_KUCHI_PASS: ${{ secrets.… }}`（合言葉を 渡す）か
        concurrency の 組 webkit-shared-account が 在る＝CI 自身が「試験口を 叩く」と 書いた job
     ⑵ 段の 中身（kuchiKa）… 段の 命令に 出る .mjs/.js の ファイルが 試験口の 道具（_shiken-kuchi・_souko-kazoeru）を
        ★import する 行★ を 持つ。読めない ファイルは 触る 側に 数える（★分からないを 安全側へ★）。
     ★字に 出るだけ（説明・門の 見張りの 字）は 数えない★＝11-03 初回で「字に 出る」で 数えたら 21段・4 job が 1本に 繋がり 並べる 意味が 無くなった */
export const KUCHI_IMPORT_RE = /\bimport\b[^\n]*_(?:shiken-kuchi|souko-kazoeru)\.mjs/;
export function kuchiKa(cmd, yomu) {
  const fa = [...String(cmd || '').matchAll(/(?:^|\s)([\w./-]+\.(?:mjs|js|cjs))(?=\s|$)/g)].map((m) => m[1]);
  /* ★ファイルを 1つも 拾えない 段＝触る 側（分からないを 安全側へ・押し3 taiketsu 任D）★
     11-03 の yml では 2段（330・338＝sh scripts/ci-yuka.sh --self-test・node も curl も 無い）＝338 が 道0 へ 移る だけ */
  if (fa.length === 0) return true;
  return fa.some((f) => {
    if (/(^|\/)_(shiken-kuchi|souko-kazoeru)\.mjs$/.test(f)) return false;   /* ★道具 自身の 自己確認＝外へ 出ない★ */
    const t = yomu(f); return t === null ? true : KUCHI_IMPORT_RE.test(t);
  });
}
export function kuchiJobYomu(ymlJi) {
  const out = []; let cur = null;
  String(ymlJi || '').split(String.fromCharCode(10)).forEach((l) => {
    const m = l.match(/^  ([A-Za-z0-9_-]+):\s*$/);
    if (m) cur = m[1];
    if (cur && (/^\s+SHIKEN_KUCHI_PASS:\s*\$\{\{\s*secrets\./.test(l) || /^\s+group:\s*webkit-shared-account\s*$/.test(l))
      && out.indexOf(cur) < 0) out.push(cur);
  });
  return out;
}

/* ★★道（同時に 回す 組）を 作る★★（2026-11-03・網の 4つ割り 押し3）
   ★組は CI の job そのまま★（yml から 機械で 作る＝人が 選ばない・設計前 taiketsu 11-02 止2）。
   ★試験口に 触る 段を 持つ job は 全部 1本の 道に 繋ぐ（yml の 順）★＝手元で 試験口を 2本 同時に 叩かない（11-03 止2）。
   ★入力★ … hashiru（[{i,c}]）・jobNo（段の 番号 1から → job 名 の 配列）・kuchi（i → 真偽）・kuchiJobs（job の 印で 試験口を 叩く job 名）
   ★返す★ … { michi: [{ na, jobs, dan:[{i,c}] }], naze: 止める 訳 か null }
   ★止める★ … job の 無い 段／道に 入らない 段・2つの 道に 入る 段／試験口の 段が 2本 以上の 道に 在る */
export function michiTsukuru(hashiru, jobNo, kuchi, kuchiJobs = []) {
  const jobJun = [], jobDan = {};
  let nashi = 0;
  hashiru.forEach((d) => {
    const j = jobNo[d.i - 1];
    if (!j) { nashi++; return; }
    if (!jobDan[j]) { jobDan[j] = []; jobJun.push(j); }
    jobDan[j].push(d);
  });
  if (nashi) return { michi: [], naze: 'job の 無い 段が ' + nashi + '段' };
  const kuchiJob = jobJun.filter((j) => kuchiJobs.indexOf(j) >= 0 || jobDan[j].some((d) => kuchi(d.i)));
  const michi = [];
  if (kuchiJob.length) {
    const dan = []; kuchiJob.forEach((j) => jobDan[j].forEach((d) => dan.push(d)));
    dan.sort((a, b) => a.i - b.i);
    michi.push({ na: kuchiJob.join('+'), jobs: kuchiJob, dan, kuchi: true });
  }
  jobJun.filter((j) => kuchiJob.indexOf(j) < 0).forEach((j) => michi.push({ na: j, jobs: [j], dan: jobDan[j], kuchi: false }));
  /* ★照らす★＝段の 番号の 集合で（数の 和では なく）。重なり・抜け を 赤 */
  const mita = {}; let kasa = 0;
  michi.forEach((m) => m.dan.forEach((d) => { if (mita[d.i]) kasa++; mita[d.i] = true; }));
  const nuke = hashiru.filter((d) => !mita[d.i]).length;
  const kuchiMichi = michi.filter((m) => m.dan.some((d) => kuchi(d.i))).length;
  let naze = null;
  if (kasa) naze = '2つの 道に 入る 段が ' + kasa + '段';
  else if (nuke) naze = 'どの 道にも 入らない 段が ' + nuke + '段';
  else if (kuchiMichi > 1) naze = '試験口に 触る 段が ' + kuchiMichi + '本の 道に 分かれた';
  return { michi, naze };
}

/* ★★段の kuchi（揺れの 回し直しに 使う）★★（11-07 本番前 taiketsu 止め1）
   kuchiKa は 段が 直に 走らせる ファイルの import しか 見ない＝tests/_hairu.mjs 経由で 試験口に 入る 段を「触らない」と 見ていた（試験口の job に 16段）。
   ★試験口の 道（job の 印 か 同じ job に 触る 段が 居る＝michiTsukuru の kuchi:true）に 居る 段は 全部 触る 側★。並べない（1本順）時も 同じ 判じ方。
   どちらでも 無く kuchi(i)===false の 段だけ false（分からない＝触る 側） */
export function danKuchi(michi, kuchi) {
  const kd = {};
  (michi || []).forEach((m) => { if (m.kuchi) m.dan.forEach((d) => { kd[d.i] = true; }); });
  return (i) => kd[i] === true || kuchi(i) !== false;
}

/* ★★並べる 数★★（OSHU_MAE_HEIRETSU）＝数で ない・0 以下は 止める（道 0本で 0件＝合格 に しない・taiketsu 任3） */
export function heiretsuYomu(v) {
  if (v === undefined || v === '') return { n: 6, naze: null };
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) return { n: 0, naze: 'OSHU_MAE_HEIRETSU=' + v + ' は 1 以上の 整数で ない' };
  return { n, naze: null };
}
