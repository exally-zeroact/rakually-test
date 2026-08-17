/* supa-config.js — ★テスト用DB★ (rakually-test / Vercel配信＝rakually-test.vercel.app)
 * 本番倉庫とは別の Supabase「DB-test」を指す。
 * URLとpublishable(公開鍵)はクライアント埋め込みで安全＝RLSで本人ぶんだけ保護。
 * ★このファイルは本番(rakually)には絶対にコピーしない(本番は本番倉庫を指す)。
 * ★payslip-app-test / exally-staging と同じ DB-test を共有＝1テストアカウントで使える。
 * ★repo名やホスト名の「test」は環境の証拠にならない。証拠は ★下の url の文字★ だけ。
 *   確かめ方＝★配信されたJSを実際に読んで url を出す★（tests/pages-hosting.test.mjs D2 と同じ）。
 */
/* ★env = この配信がどの環境か（'test' | 'prod'）★
 *   画面の一番上に「テスト環境」の帯を出すかを、これ1つで決める（js/env-badge.js）。
 *   ★向き先を持っているのはこのファイルだけ★という約束（tests/no-hardcoded-supa.test.mjs）
 *   に合わせて、環境の名札もここに置く。他のファイルに倉庫の名前を書かせない。
 *   ★本番(rakually)の supa-config.js は env:'prod'。だから本番に帯は出ない。★ */
window.SUPA = {
  url: 'https://khawdrnvssdenumbiwfg.supabase.co',
  key: 'sb_publishable_UrRIobyVFbaJI_85RBxBOA_GZ4OUxPm',
  env: 'test'
};
