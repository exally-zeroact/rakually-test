-- storage-seikyu-templates.sql — ★客が上げた自社Excelの置き場（テスト線に当てる）★
--
-- 指示役の決定（2026-08-11）:
--   ・倉庫の列(text)には入れない ＝ Supabase Storage の bucket に置く
--   ・1社につき1枚／上限は まず5MB（実物で測ってから決め直す）
--   ・置き場は ★account_id で分ける★（他社の物を掴まない・否定テストを書く）
--   ・★発行した紙そのものは保存しない★（控えには「どのテンプレのどの版で刷ったか」だけ）
--
-- ★分け方は既存の棚と同じ★ account_id = auth.uid()。
--   置き場所は  <auth.uid()>/<ファイル名>  の形にして、
--   ★1つ目の区切りが自分の uid でなければ 読む事も書く事も出来ない★ ようにする。
--
-- ★公開しない（public=false）★ 請求書は客の名前と金額が入っている。
--   受け取りは ★署名つきURL（時間で切れる）★ でのみ行う。

-- ① 置き場（無ければ作る・あれば上限だけ合わせる）
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'seikyu-templates', 'seikyu-templates', false, 5242880,
  array[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel.sheet.macroEnabled.12'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ② 許可（★自分の区画だけ★）
--    storage.foldername(name) は置き場所を区切りで割った配列を返す。
--    その1つ目が自分の uid の時だけ通す。
drop policy if exists "seikyu_tpl_select_own" on storage.objects;
create policy "seikyu_tpl_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'seikyu-templates'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "seikyu_tpl_insert_own" on storage.objects;
create policy "seikyu_tpl_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'seikyu-templates'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "seikyu_tpl_update_own" on storage.objects;
create policy "seikyu_tpl_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'seikyu-templates'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'seikyu-templates'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "seikyu_tpl_delete_own" on storage.objects;
create policy "seikyu_tpl_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'seikyu-templates'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
