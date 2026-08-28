/* check-warehouse-pointers.mjs — ★倉庫(Supabase)の向き先を、6か所×全アプリで数える★
 *
 * なぜ必要か（2026-08-07・指示役）:
 *   「テストrepoが本番倉庫を指していないか」を①アプリのコードだけ見て「事故0」と報告した。
 *   ★実際に壊れていたのは③GitHub Actions の金庫★だった（アマかせのバッチが旧倉庫に書き続けていた）。
 *   向き先は1か所ではなく★6か所★にある。1か所だけ見て安心すると、必ず残りで事故る。
 *
 *     ① アプリのコード（js/supa-config.js・HTML直書き）
 *     ② Vercel の環境変数（配信側）
 *     ③ GitHub Actions の金庫（バッチ）        ← ここが壊れていた
 *     ④ 認証の戻り先 許可リスト
 *     ⑤ Edge Function
 *     ⑥ 見張りの道具そのもの
 *
 * ★測れなかったマスは 🟡未測定 と出す。0件・異常なしにしない。★
 *   （「鍵が無いから測れなかった」を緑と呼ぶと、見張りが嘘をつく）
 *
 * ★全部 読むだけ。他のアプリのリポジトリにも倉庫にも、1文字も書かない。★
 *   使うのは GET だけ（配信物の取得 / GitHubの読み取り / Supabaseの読み取り）。
 *
 * 鍵（無くても動く。無い所は 🟡 になる）:
 *   GITHUB_TOKEN          … 公開repoのファイルを読む（Actionsでは自動で入る）
 *   GH_SECRETS_TOKEN      … ③の登録日を読む（repo管理権限のPAT。無ければ🟡）
 *   VERCEL_TOKEN          … ②の環境変数の名前と更新日（無ければ🟡）
 *   SUPABASE_ACCESS_TOKEN … ⑤の一覧と版（無ければ、関数URLを叩く簡易判定にする）
 *
 * 使い方: node scripts/check-warehouse-pointers.mjs
 *         node scripts/check-warehouse-pointers.mjs --json
 *         node scripts/check-warehouse-pointers.mjs --self-test  ★判定が空振りしていないか
 *
 * 終了コード: 🔴があれば 3 ／ それ以外は 0（🟡の本数は必ず最後に出す）
 */

/* ══════════ 何を正とするか（ここだけが「答え」） ══════════ */
export const PROD_REF = 'tnfwipbgfgjaymlszeid';
export const TEST_REF = 'khawdrnvssdenumbiwfg';

/* アプリ × 本番/テスト。★url は「向き先が書いてある物」を直接指す★ */
const APPS = [
  /* ★Rakunally（2026-08-17 に立てた）★ 給与と請求書は同じ設定ファイルを見る（1つの器）。
     ★本番は今「枠だけ」＝Deployment Protection が入っているので 401 が返る＝🟡未測定として出る★
     （0件・異常なしにしない）。保護を外した日に 200 で測れるようになる。 */
  { app: 'Rakunally',      env: 'テスト', host: 'https://rakually-test.vercel.app',                 cfg: '/js/supa-config.js',  want: TEST_REF },
  { app: 'Rakunally',      env: '本番',   host: 'https://rakually.vercel.app',                      cfg: '/js/supa-config.js',  want: PROD_REF, note: '★枠だけ（保護ON）＝401なら🟡未測定。中身は見た目OKの後に運ぶ' },
  { app: 'Exally',        env: '本番',   host: 'https://exally.vercel.app',                        cfg: '/js/supa-config.js',  want: PROD_REF },
  { app: 'Exally',        env: 'テスト', host: 'https://exally-zeroact.github.io/exally-staging',  cfg: '/js/supa-config.js',  want: TEST_REF },
  // ★2026-08-07 Vercel版の staging は畳んだ（司さんOK）★
  //   git連携が無く手打ちでしか更新されない＝黙って古くなる形だった。テストの配信は github.io の1本。
  //   ここに残すと「消えた住所」を毎週叩いて 🟡 が鳴り続けるので、行ごと外す。
  { app: '給与 kyuyo',    env: '本番',   host: 'https://exally.vercel.app',                        cfg: '/js/supa-config.js',  want: PROD_REF, note: 'Exallyと同居（同じ設定ファイル）' },
  { app: '給与 kyuyo',    env: 'テスト', host: 'https://exally-zeroact.github.io/exally-staging',  cfg: '/js/supa-config.js',  want: TEST_REF, note: 'Exallyと同居（同じ設定ファイル）' },
  { app: '代行請求',      env: '本番',   host: 'https://daikou-seikyu.vercel.app',                 cfg: '/daikou-seikyu.html', want: PROD_REF, owner: 'ダイコメ' },
  { app: '代行請求',      env: 'テスト', host: null, want: null, owner: 'ダイコメ', note: '★テスト環境は無い（ダイコメの製品・Exallyは触らない）' },
  { app: 'ダイコメ',      env: '本番',   host: 'https://daikou-app.vercel.app',                    cfg: '/js/dk-config.js',    want: PROD_REF, owner: 'ダイコメ' },
  { app: 'ダイコメ',      env: 'テスト', host: 'https://daikou-app-test.vercel.app',               cfg: '/js/dk-config.js',    want: TEST_REF, owner: 'ダイコメ' },
  { app: 'ダイコメ事務所', env: '本番',  host: 'https://daikome-jimusho.vercel.app',               cfg: '/js/dk-config.js',    want: PROD_REF, owner: 'ダイコメ' },
  { app: 'ダイコメ事務所', env: 'テスト', host: 'https://daikome-jimusho-test.vercel.app',         cfg: '/js/dk-config.js',    want: TEST_REF, owner: 'ダイコメ' },
  { app: '飲み屋',        env: '本番',   host: 'https://nomiya-app.vercel.app',                    cfg: '/js/supa-config.js',  want: PROD_REF, owner: '飲み屋' },
  { app: '飲み屋',        env: 'テスト', host: 'https://nomiya-app-test.vercel.app',               cfg: '/js/supa-config.js',  want: TEST_REF, owner: '飲み屋' },
  // ★アマかせは repo に住所を持たない。Vercelの環境変数が /api/config に出てくる＝ここが①と②を兼ねる
  { app: 'アマかせ',      env: '本番',   host: 'https://amazon-ads-automation-lyart.vercel.app',   cfg: '/api/config',         want: PROD_REF, owner: 'アマかせ', viaEnv: true },
  { app: 'アマかせ',      env: 'テスト', host: 'https://amazon-ads-automation-test.vercel.app',    cfg: '/api/config',         want: TEST_REF, owner: 'アマかせ', viaEnv: true },
];

/* ③ バッチ。repo と、そのrepoが向くべき倉庫 */
const BATCH_REPOS = [
  { repo: 'exally-zeroact/rakually',                   want: PROD_REF, env: '本番' },
  { repo: 'exally-zeroact/rakually-test',              want: TEST_REF, env: 'テスト' },
  { repo: 'exally-zeroact/exally',                     want: PROD_REF, env: '本番' },
  { repo: 'exally-zeroact/exally-staging',             want: TEST_REF, env: 'テスト' },
  { repo: 'exally-zeroact/daikou-seikyu',              want: PROD_REF, env: '本番', owner: 'ダイコメ' },
  { repo: 'exally-zeroact/Daikou-app',                 want: PROD_REF, env: '本番', owner: 'ダイコメ' },
  { repo: 'exally-zeroact/Daikou-app-test',            want: TEST_REF, env: 'テスト', owner: 'ダイコメ' },
  { repo: 'exally-zeroact/nomiya-app',                 want: PROD_REF, env: '本番', owner: '飲み屋' },
  { repo: 'exally-zeroact/nomiya-app-test',            want: TEST_REF, env: 'テスト', owner: '飲み屋' },
  { repo: 'exally-zeroact/amazon-ads-automation',      want: PROD_REF, env: '本番', owner: 'アマかせ', private: true },
  { repo: 'exally-zeroact/amazon-ads-automation-test', want: TEST_REF, env: 'テスト', owner: 'アマかせ', private: true },
];

/* ★引っ越しの日★ これより前に登録された Supabase系の鍵は「引っ越し前」の疑い */
const MIGRATION_DAY = '2026-08-06';

/* ⑤ 配信されている Edge Function（本番・テストとも同じ4本のはず） */
const EDGE_FUNCS = ['dk-issue-license', 'dk-register-company', 'dk-sync-jobs', 'dk-customers'];

/* ④ 戻り先を確かめる住所（許可リストに載っているべき物） */
const REDIRECT_HOSTS = [
  /* ★Rakunally（2026-08-17）★ ログインの戻り先。許可リストに無いと
     ★別のアプリ（請求書アプリ）へ流れる★（reference_supabase_auth_redirect_shared の前科）。 */
  { app: 'Rakunally テスト', url: 'https://rakually-test.vercel.app/' },
  { app: 'Rakunally 本番',   url: 'https://rakually.vercel.app/' },
  { app: 'Exally',         url: 'https://exally.vercel.app/hub.html' },
  { app: '給与 kyuyo',     url: 'https://exally.vercel.app/kyuyo/admin.html' },
  { app: 'Exally テスト',  url: 'https://exally-zeroact.github.io/exally-staging/hub.html' },
  // ★畳んだ住所（2026-08-07）。それでも許可リストには★残す★★
  //   理由: 許可リストから行を消す作業そのものが事故のもと（消し間違えると他アプリのログインが壊れる）。
  //   　　  余分な行が1つ残っても害は無い（そこへ戻る物がもう無い）。
  //   ここで毎週「許可されたまま」を確かめておくと、
  //   もし将来この住所を作り直しても、いきなり穴が開いた状態にならない。
  { app: 'Exally テストV(畳んだ住所)', url: 'https://exally-staging.vercel.app/hub.html' },
  { app: '代行請求',       url: 'https://daikou-seikyu.vercel.app/daikou-seikyu.html' },
  { app: 'ダイコメ',       url: 'https://daikou-app.vercel.app/' },
  { app: 'ダイコメ事務所', url: 'https://daikome-jimusho.vercel.app/login.html' },
  { app: 'アマかせ',       url: 'https://amazon-ads-automation-lyart.vercel.app/' },
  { app: 'アマかせ テスト', url: 'https://amazon-ads-automation-test.vercel.app/' },
];

/* ══════════ 判定の中身（純関数・self-testで作り物を通せる） ══════════ */

/** 文章から Supabase の向き先(ref)を取り出す。形は3通りある。 */
export function refsIn(text) {
  const out = new Set();
  let m;
  const url = /https:\/\/([a-z0-9]{16,})\.supabase\.co/g;
  while ((m = url.exec(text))) out.add(m[1]);
  const key = /"ref"\s*:\s*"([a-z0-9]{16,})"/g;
  while ((m = key.exec(text))) out.add(m[1]);
  const jwt = /eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]{20,})\./g;
  while ((m = jwt.exec(text))) {
    try {
      const b = m[1].replace(/-/g, '+').replace(/_/g, '/');
      const o = JSON.parse(Buffer.from(b + '='.repeat((4 - (b.length % 4)) % 4), 'base64').toString('utf8'));
      if (o && typeof o.ref === 'string') out.add(o.ref);
    } catch (_) { /* 読めない物は無視 */ }
  }
  return [...out];
}

/** ★裸の文字列（const PROD_REF = '…' や、実測メモのコメント）★
 *  これも見ないと `auth-mail-otp.mjs` の本番直書き（PROJECT = '…'）を見落とす。
 *  ただし ★「書いてある＝そこへ繋いでいる」ではない★:
 *    ・`nomiya/tests/nomiya-deploy.test.js` は本番refを「ここでは絶対に走らせない」の見張りとして持つ（正しい）
 *    ・`auth-redirect-allow.mjs` は本番とテストの両方を扱うのが正しい形（8/7に直したばかり）
 *    ・`verify-statutory.mjs` の khaw… は実測メモのコメント
 *  だから ★裸の文字列は 🔴 にしない。🟡（理由を書くまで未確認）にする★。
 *  URL・鍵の形（＝実際に繋ぐ形）だけが 🔴。 */
export function bareRefsIn(text) {
  return [PROD_REF, TEST_REF].filter((r) => new RegExp('\\b' + r + '\\b').test(text));
}

/** 見つかったrefと「向くべきref」から、〇×を決める。★見つからない=🟡（緑にしない）★ */
export function judge(found, want) {
  if (!found || found.length === 0) return { mark: '🟡', text: '未測定（向き先を読み取れない）' };
  const wrong = found.filter((r) => r !== want);
  if (wrong.length) return { mark: '🔴', text: '★別の倉庫を見ている: ' + wrong.join(',') };
  return { mark: '🟢', text: want === PROD_REF ? '本番' : 'テスト' };
}

/** 鍵の登録日が「引っ越しの日」より前か（前なら疑い） */
export function isStale(updatedAt, day = MIGRATION_DAY) {
  if (!updatedAt) return null;              // 分からない＝🟡
  return String(updatedAt).slice(0, 10) < day;
}

/* ══════════ ここから外に出る（全部 GET） ══════════ */
const argv = process.argv.slice(2);
const JSON_OUT = argv.includes('--json');

async function get(url, headers = {}, timeout = 25000) {
  try {
    const r = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(timeout) });
    return { ok: r.ok, status: r.status, text: await r.text() };
  } catch (e) {
    return { ok: false, status: 0, text: '', err: String(e && e.message).slice(0, 80) };
  }
}

/** 許可リストは鍵なしで測れる: 許可されていない戻り先は SITE_URL へ流される */
async function redirectAllowed(ref, target) {
  const u = `https://${ref}.supabase.co/auth/v1/verify?token=x&type=recovery&redirect_to=${encodeURIComponent(target)}`;
  try {
    const r = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(25000) });
    const loc = r.headers.get('location') || '';
    if (!loc) return null;                                   // 測れなかった＝🟡
    return loc.split(/[?#]/)[0] === target;
  } catch (_) { return null; }
}

const rows = { c1: [], c2: [], c3: [], c4: [], c5: [], c6: [] };
let yellow = 0, red = 0;
const bump = (mark) => { if (mark === '🟡') yellow++; if (mark === '🔴') red++; };

/* ── ① アプリのコード（＋アマかせは②の実効値も兼ねる） ── */
async function measureApps() {
  for (const a of APPS) {
    if (!a.host) { rows.c1.push({ ...a, mark: '—', text: a.note }); continue; }
    const r = await get(a.host + a.cfg);
    const found = r.ok ? refsIn(r.text) : [];
    const j = r.ok ? judge(found, a.want) : { mark: '🟡', text: `未測定（HTTP ${r.status}${r.err ? ' ' + r.err : ''}）` };
    bump(j.mark);
    rows.c1.push({ ...a, mark: j.mark, text: j.text, url: a.host + a.cfg });
  }
}

/* ── ② Vercel の環境変数 ── */
async function measureVercelEnv() {
  const tok = process.env.VERCEL_TOKEN;
  // 鍵が無くても「実効値」は分かる: /api/config を出しているアプリは配信で測れている
  for (const a of APPS.filter((x) => x.viaEnv)) {
    const c1 = rows.c1.find((r) => r.app === a.app && r.env === a.env);
    rows.c2.push({ app: a.app, env: a.env, mark: c1 ? c1.mark : '🟡',
      text: c1 ? `配信の /api/config で実効値を測った → ${c1.text}` : '未測定' });
  }
  if (!tok) {
    rows.c2.push({ app: '（その他の全プロジェクト）', env: '—', mark: '🟡',
      text: '未測定（VERCEL_TOKEN が無い）。2026-08-07 の手測りでは★アマかせ以外に倉庫のenvは無かった★が、増えていないかは測れていない' });
    yellow++;
    return;
  }
  const r = await get('https://api.vercel.com/v9/projects?limit=100&teamId=' + (process.env.VERCEL_TEAM_ID || ''),
    { Authorization: 'Bearer ' + tok });
  if (!r.ok) { rows.c2.push({ app: '（全プロジェクト）', env: '—', mark: '🟡', text: `未測定（Vercel API ${r.status}）` }); yellow++; return; }
  const projects = JSON.parse(r.text).projects || [];
  for (const p of projects) {
    const e = await get(`https://api.vercel.com/v9/projects/${p.id}/env?teamId=${process.env.VERCEL_TEAM_ID || ''}`,
      { Authorization: 'Bearer ' + tok });
    if (!e.ok) { rows.c2.push({ app: p.name, env: '—', mark: '🟡', text: `未測定（env ${e.status}）` }); yellow++; continue; }
    const envs = (JSON.parse(e.text).envs || []).filter((v) => /SUPABASE/i.test(v.key));
    if (!envs.length) { rows.c2.push({ app: p.name, env: '—', mark: '🟢', text: '倉庫のenv 無し（向き先はrepoのファイル）' }); continue; }
    // ★値は Encrypted で読めない＝「新しいか」しか言えない。だから🟡で出す★
    const old = envs.filter((v) => isStale(new Date(v.updatedAt || v.createdAt).toISOString()));
    rows.c2.push({ app: p.name, env: '—', mark: old.length ? '🟡' : '🟡',
      text: `倉庫のenv ${envs.length}本（値は読めない＝未測定）` +
        (old.length ? ` ★うち${old.length}本が ${MIGRATION_DAY} より前: ` + old.map((v) => `${v.key}/${v.target}`).join(' ') + '★' : '') });
    yellow++;
  }
}

/* ── ③ GitHub Actions の金庫 ── */
async function measureSecrets() {
  const gh = process.env.GH_SECRETS_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  for (const b of BATCH_REPOS) {
    // まず「そのrepoのバッチが倉庫に触るのか」を workflow の中身で見る（公開repoなら鍵なしで読める）
    const wf = await ghGet(`https://api.github.com/repos/${b.repo}/contents/.github/workflows`, gh);
    let touches = null, files = [];
    if (wf.ok) {
      // ★この見張り自身(warehouse.yml)は数えない★
      //   読むだけの見張りが SUPABASE_ACCESS_TOKEN を受け取るので、
      //   除かないと「倉庫に触るバッチが有る」と★自分を指さして★しまう（実際に1回そうなった）。
      files = JSON.parse(wf.text).filter((f) => /\.ya?ml$/.test(f.name) && f.name !== 'warehouse.yml');
      touches = false;
      for (const f of files) {
        const c = await ghGet(f.download_url, gh);
        if (c.ok && /secrets\.SUPABASE/i.test(c.text)) { touches = true; break; }
      }
    }
    if (touches === false) { rows.c3.push({ repo: b.repo, mark: '🟢', text: `倉庫に触るバッチ 無し（workflow ${files.length}本を読んだ）` }); continue; }

    // 触るなら、鍵の登録日を見る（★値は読めない。日付でしか判断できない★）
    if (!process.env.GH_SECRETS_TOKEN) {
      rows.c3.push({ repo: b.repo, mark: '🟡',
        text: touches === null
          ? `未測定（workflowを読めない${b.private ? '・非公開repo' : ''}）`
          : '★倉庫に触るバッチが有る★ / 鍵の登録日は未測定（GH_SECRETS_TOKEN が無い）' });
      yellow++;
      continue;
    }
    const s = await ghGet(`https://api.github.com/repos/${b.repo}/actions/secrets`, process.env.GH_SECRETS_TOKEN);
    if (!s.ok) { rows.c3.push({ repo: b.repo, mark: '🟡', text: `未測定（secrets API ${s.status}）` }); yellow++; continue; }
    const secrets = (JSON.parse(s.text).secrets || []).filter((x) => /SUPABASE/i.test(x.name));
    if (!secrets.length) {
      rows.c3.push({ repo: b.repo, mark: '🟡', text: '★倉庫に触るバッチが有るのに 鍵が0本★＝バッチは何もできない（意図的ならその旨を書く）' });
      yellow++; continue;
    }
    const stale = secrets.filter((x) => isStale(x.updated_at));
    rows.c3.push({ repo: b.repo, mark: stale.length ? '🔴' : '🟡',
      text: `鍵 ${secrets.length}本` + (stale.length
        ? ` ★${MIGRATION_DAY} より前が ${stale.length}本＝引っ越し前の疑い: ` + stale.map((x) => `${x.name}(${x.updated_at.slice(0, 10)})`).join(' ') + '★'
        : `（全部 ${MIGRATION_DAY} 以降）／値は読めない＝実際の向き先は未測定`) });
    if (stale.length) red++; else yellow++;
  }
}

async function ghGet(url, token, timeout = 25000) {
  const h = { Accept: 'application/vnd.github+json', 'User-Agent': 'exally-warehouse-check' };
  if (token) h.Authorization = 'Bearer ' + token;
  return get(url, h, timeout);
}

/* ── ④ 認証の戻り先（★鍵が要らない★） ── */
async function measureRedirects() {
  for (const ref of [PROD_REF, TEST_REF]) {
    for (const h of REDIRECT_HOSTS) {
      const ok = await redirectAllowed(ref, h.url);
      const mark = ok === null ? '🟡' : ok ? '🟢' : '🔴';
      bump(mark);
      rows.c4.push({ ref: ref === PROD_REF ? '本番' : 'テスト', app: h.app, url: h.url, mark,
        text: ok === null ? '未測定（戻り先を読めない）' : ok ? '許可済み' : '★未許可＝忘れた時に別アプリへ飛ぶ' });
    }
  }
  // ★見張りが空振りしていないこと★: 許していない住所は必ず弾かれる
  for (const ref of [PROD_REF, TEST_REF]) {
    const ok = await redirectAllowed(ref, 'https://example.com/not-allowed.html');
    const mark = ok === null ? '🟡' : ok === false ? '🟢' : '🔴';
    bump(mark);
    rows.c4.push({ ref: ref === PROD_REF ? '本番' : 'テスト', app: '★空振り確認', url: 'https://example.com/…', mark,
      text: ok === false ? '許していない住所は弾かれた（測れている）' : ok ? '★何でも通っている＝許可リストが素通し★' : '未測定' });
  }
}

/* ── ⑤ Edge Function ── */
async function measureEdge() {
  const tok = process.env.SUPABASE_ACCESS_TOKEN;
  for (const ref of [PROD_REF, TEST_REF]) {
    const label = ref === PROD_REF ? '本番' : 'テスト';
    if (tok) {
      const r = await get(`https://api.supabase.com/v1/projects/${ref}/functions`, { Authorization: 'Bearer ' + tok });
      if (r.ok) {
        const fns = JSON.parse(r.text);
        const names = fns.map((f) => f.slug);
        const missing = EDGE_FUNCS.filter((n) => !names.includes(n));
        const mark = missing.length ? '🔴' : '🟢';
        bump(mark);
        rows.c5.push({ ref: label, mark,
          text: `${fns.length}本` + (missing.length ? ' ★足りない: ' + missing.join(',') : '（向き先は Deno.env の SUPABASE_URL＝自分の倉庫しか触れない）')
            + ' / 版: ' + fns.map((f) => `${f.slug}=v${f.version}`).join(' ') });
        continue;
      }
    }
    // 鍵が無い時の簡易判定: 関数URLを叩く。
    // ★2026-08-07 実測でここを直した★
    //   最初は「401なら居る」にしていたが、本番の dk-sync-jobs は GET に ★405★ を返す。
    //   鍵ありでは v12 で ACTIVE なのに ★居ない扱いで🔴になった（嘘の赤）★。
    //   ⇒ 「居ない」と言い切れるのは ★404だけ★。それ以外は「居る」。
    //   　 通信できなかった(0)は 🟡。版と中身は鍵が無ければ★どうやっても未測定★。
    const missing = [], unknown = [];
    for (const n of EDGE_FUNCS) {
      const r = await get(`https://${ref}.supabase.co/functions/v1/${n}`);
      if (r.status === 404) missing.push(n);
      else if (r.status === 0) unknown.push(n);
    }
    const mark = missing.length ? '🔴' : '🟡';
    bump(mark);
    rows.c5.push({ ref: label, mark,
      text: missing.length
        ? `★居ない: ${missing.join(',')}（関数URLが404）`
        : `${EDGE_FUNCS.length - unknown.length}/${EDGE_FUNCS.length}本が居る（404以外が返る）`
          + (unknown.length ? `／通信できず ${unknown.join(',')}` : '')
          + `／★版と中身は未測定（SUPABASE_ACCESS_TOKEN が無い）★` });
  }
}

/* ── ⑥ 見張りの道具そのもの ──
   ★「そのrepoが向くべき倉庫と違う物を持つ道具」を赤にする。理由のある物は★最初から★書いておく。
   　 後から慌てて足す形にすると、本物の直書きも一緒に通る（no-hardcoded-supa と同じ考え方）。
   mark:'🟢' = 設計として正しい ／ mark:'🟡' = 直すべきだが担当が他にある（★緑にはしない★） */
export const TOOL_ALLOWED = {
  'exally-zeroact/exally|tests/dbtest-seed.mjs': {
    mark: '🟢', why: 'DB-testに固定した手動ツール。本番refは「そこへ向いていたら即中止」の見張りとして持っている',
  },
  'exally-zeroact/exally-staging|tests/dbtest-seed.mjs': {
    mark: '🟢', why: '本番repoと同じ物。DB-testに固定した手動ツールで、本番refは「そこへ向いていたら即中止」の見張り',
  },
  'exally-zeroact/exally|scripts/check-warehouse-pointers.mjs': {
    mark: '🟢', why: '★この見張り自身★。本番とテストの両方のrefを「正解」として持たないと、何とも突き合わせられない',
  },
  'exally-zeroact/exally-staging|scripts/check-warehouse-pointers.mjs': {
    mark: '🟢', why: '同上（この見張り自身。両repoに同じ物を置く）',
  },
  'exally-zeroact/exally-staging|tests/pages-hosting.test.mjs': {
    mark: '🟢', why: 'わざと本番refを混ぜた作り物を通して、Pages配信の見張りが赤くなることを確かめる検査',
  },
  'exally-zeroact/exally-staging|kyuyo/scripts/pull-statutory.mjs': {
    mark: '🟢', why: '法定データ(最低賃金・保険料率)は★本番の中央倉庫が正★。テスト側から読んでも本番を見るのが設計',
  },
  'exally-zeroact/exally-staging|kyuyo/scripts/verify-statutory.mjs': { mark: '🟢', why: '同上（法定データは本番中央が正）' },
  'exally-zeroact/exally-staging|kyuyo/scripts/check-source-urls.mjs': { mark: '🟢', why: '同上（法定データは本番中央が正）' },
  'exally-zeroact/Daikou-app-test|scripts/check-hosts.mjs': {
    mark: '🟡', why: '★ダイコメの物。2026-08-07に指示役へ報告し、ダイコメセッションへ引き継ぎ済み。'
      + 'Exally側では直さない。直ったらこの行を消す★',
  },
  'exally-zeroact/Daikou-app-test|scripts/auth-mail-otp.mjs': {
    mark: '🟡', why: '★ダイコメの物。両対応へ直す作業が進行中（2026-08-07 時点で未コミット）。入ったらこの行を消す★',
  },
};

const TOOL_DIRS = /(^|\/)(scripts|tests|tools)\//;
const MAX_FILES = 400;
async function measureTools() {
  const gh = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const usedAllow = new Set();
  for (const b of BATCH_REPOS) {
    const head = await ghGet(`https://api.github.com/repos/${b.repo}`, gh);
    if (!head.ok) { rows.c6.push({ repo: b.repo, mark: '🟡', text: `未測定（repoを読めない ${head.status}${b.private ? '・非公開' : ''}）` }); yellow++; continue; }
    const def = JSON.parse(head.text).default_branch || 'main';
    let tree = await ghGet(`https://api.github.com/repos/${b.repo}/git/trees/${def}?recursive=1`, gh, 60000);
    if (!tree.ok) tree = await ghGet(`https://api.github.com/repos/${b.repo}/git/trees/${def}?recursive=1`, gh, 60000); // 1回だけやり直す
    if (!tree.ok) { rows.c6.push({ repo: b.repo, mark: '🟡', text: `未測定（treeを読めない ${tree.status}${tree.err ? ' ' + tree.err : ''}）` }); yellow++; continue; }
    const t = JSON.parse(tree.text);
    const all = (t.tree || []).filter((x) => x.type === 'blob' && TOOL_DIRS.test(x.path) && /\.(m?js|ts)$/.test(x.path));
    const look = all.slice(0, MAX_FILES);
    const hard = [], soft = [], known = [];
    for (const f of look) {
      const c = await ghGet(`https://raw.githubusercontent.com/${b.repo}/${def}/${f.path}`, gh);
      if (!c.ok) continue;
      const wrongShape = refsIn(c.text).filter((r) => r !== b.want);          // ★実際に繋ぐ形＝🔴候補
      const wrongBare = bareRefsIn(c.text).filter((r) => r !== b.want && !wrongShape.includes(r)); // 🟡候補
      if (!wrongShape.length && !wrongBare.length) continue;
      const key = `${b.repo}|${f.path}`;
      const allow = TOOL_ALLOWED[key];
      if (allow) { usedAllow.add(key); known.push(`${f.path}[${allow.mark}]`); continue; }
      if (wrongShape.length) hard.push(`${f.path}(${wrongShape.join(',')})`);
      else soft.push(f.path);
    }
    const capped = all.length > look.length ? `／★${all.length - look.length}本は見ていない=未測定★` : '';
    const truncated = t.truncated ? '／★treeが途中で切れている=未測定★' : '';
    const openHandover = known.some((k) => k.includes('🟡'));
    const mark = hard.length ? '🔴' : (soft.length || capped || truncated || openHandover) ? '🟡' : '🟢';
    bump(mark);
    rows.c6.push({ repo: b.repo, mark,
      text: `道具 ${look.length}/${all.length}本を読んだ${capped}${truncated}` +
        (hard.length ? ` ★別の倉庫へ【繋ぐ形】で書いている: ` + hard.slice(0, 6).join(' ') + '★' : '') +
        (soft.length ? `／★別の倉庫の名前を持つ(見張りの定数かもしれない・要確認) ${soft.length}本: ` + soft.slice(0, 6).join(' ') : '') +
        (known.length ? `／理由つきで許している ${known.length}本: ${known.join(' ')}` : '') });
    if (b === BATCH_REPOS[BATCH_REPOS.length - 1]) {
      // ★許可リストが現実から離れていないか（もう出てこない行が残っていないか）★
      const dead = Object.keys(TOOL_ALLOWED).filter((k) => !usedAllow.has(k));
      if (dead.length) {
        rows.c6.push({ repo: '（許可リストの点検）', mark: '🟡',
          text: '★もう出てこないのに残っている行がある＝消すこと: ' + dead.join(' ') });
        yellow++;
      } else {
        rows.c6.push({ repo: '（許可リストの点検）', mark: '🟢', text: `${Object.keys(TOOL_ALLOWED).length}行すべてが実際に出てきた（現実と合っている）` });
      }
    }
  }
}

/* ══════════ self-test（外へ出ない） ══════════ */
if (argv.includes('--self-test')) {
  let p = 0, f = 0;
  const T = (n, fn) => { try { fn(); p++; console.log('  ✓ ' + n); } catch (e) { f++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
  const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(m + ' 実際=' + JSON.stringify(a)); };
  console.log('\n[warehouse-pointers] ★判定そのものが空振りしていないか★');
  T('URLの形から向き先を読める', () => eq(refsIn('x https://' + PROD_REF + '.supabase' + '.co y'), [PROD_REF], 'URL'));
  T('★裸の文字列は「繋ぐ形」とは別に数える（🔴にしないため）', () => {
    eq(refsIn("const PROD_REF = '" + PROD_REF + "';"), [], '繋ぐ形ではない');
    eq(bareRefsIn("const PROD_REF = '" + PROD_REF + "';"), [PROD_REF], '裸');
  });
  T('鍵(JWT)の中からも読める', () => {
    const pay = Buffer.from(JSON.stringify({ iss: 'supabase', ref: TEST_REF })).toString('base64url');
    eq(refsIn('k=eyJhbGciOiJIUzI1NiJ9.' + pay + '.sig'), [TEST_REF], 'JWT');
  });
  T('★読み取れない時は 🟢 にしない（🟡にする）', () => eq(judge([], PROD_REF).mark, '🟡', '空'));
  T('★違う倉庫を見ていたら 🔴', () => eq(judge([TEST_REF], PROD_REF).mark, '🔴', '誤接続'));
  T('正しければ 🟢', () => eq(judge([PROD_REF], PROD_REF).mark, '🟢', '正常'));
  T('★引っ越しの日より前の鍵は「古い」と判定する', () => eq(isStale('2026-08-05T10:00:00Z'), true, '古い'));
  T('引っ越しの日以降の鍵は古くない', () => eq(isStale('2026-08-07T03:32:00Z'), false, '新しい'));
  T('★日付が分からない時は true/false を返さない（=🟡へ倒す）', () => eq(isStale(null), null, '不明'));
  T('★道具の許可リストは、全部に理由が書いてある', () => {
    for (const [k, v] of Object.entries(TOOL_ALLOWED)) {
      if (!v.why || v.why.length < 15) throw new Error(k + ': 理由が短すぎる');
      if (!['🟢', '🟡'].includes(v.mark)) throw new Error(k + ': mark が 🟢/🟡 以外');
      if (!k.includes('|')) throw new Error(k + ': repo|path の形になっていない');
    }
  });
  T('★引き継ぎ中の物は 🟡（緑にしていない）', () => {
    const h = TOOL_ALLOWED['exally-zeroact/Daikou-app-test|scripts/check-hosts.mjs'];
    eq(h && h.mark, '🟡', '引き継ぎ中');
  });
  console.log('\n' + p + ' passed, ' + f + ' failed');
  process.exit(f ? 1 : 0);
}

/* ══════════ 実行 ══════════ */
console.log('\n[warehouse-pointers] 倉庫の向き先 6か所 × 全アプリ（★読むだけ★）');
console.log(`  本番 = ${PROD_REF} / テスト = ${TEST_REF} / 引っ越しの日 = ${MIGRATION_DAY}\n`);

await measureApps();
await measureVercelEnv();
await measureSecrets();
await measureRedirects();
await measureEdge();
await measureTools();

const show = (title, list, fmt) => {
  console.log('\n══ ' + title + ' ══');
  list.forEach((r) => console.log('  ' + r.mark + ' ' + fmt(r)));
};
show('① アプリのコード（配信を叩いて実測）', rows.c1,
  (r) => `${(r.app + ' ' + r.env).padEnd(24)} ${r.text}${r.owner ? '  [担当:' + r.owner + ']' : ''}`);
show('② Vercel の環境変数', rows.c2, (r) => `${(r.app + ' ' + r.env).padEnd(34)} ${r.text}`);
show('③ GitHub Actions の金庫（バッチ）', rows.c3, (r) => `${r.repo.padEnd(42)} ${r.text}`);
show('④ 認証の戻り先 許可リスト（鍵不要で測れる）', rows.c4,
  (r) => `${r.ref.padEnd(6)} ${r.app.padEnd(18)} ${r.text}`);
show('⑤ Edge Function', rows.c5, (r) => `${r.ref.padEnd(6)} ${r.text}`);
show('⑥ 見張りの道具そのもの', rows.c6, (r) => `${r.repo.padEnd(42)} ${r.text}`);

const all = [...rows.c1, ...rows.c2, ...rows.c3, ...rows.c4, ...rows.c5, ...rows.c6];
console.log('\n── 実測 ──');
console.log(`  🟢 正しい : ${all.filter((r) => r.mark === '🟢').length}`);
console.log(`  🔴 ★誤り : ${all.filter((r) => r.mark === '🔴').length}★`);
console.log(`  🟡 ★未測定: ${all.filter((r) => r.mark === '🟡').length}★  ← 0件・異常なしにしない`);
console.log(`  —  対象外 : ${all.filter((r) => r.mark === '—').length}`);
if (JSON_OUT) console.log('\n' + JSON.stringify(rows, null, 2));
console.log(red ? '\n★🔴があります。向き先が違う所を直すこと★' : '\n🔴は0件（🟡の本数は上を見ること）');
process.exit(red ? 3 : 0);
