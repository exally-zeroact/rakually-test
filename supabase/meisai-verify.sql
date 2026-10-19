-- meisai-verify.sql — ★本人の 明細の 合言葉を 照らす 関数（public.meisai_verify）★
-- 2026-10-19：合言葉が null だと「pw_hash <> crypt(null, …)」が null に なり「違う」と 判じられず、
--   ★合言葉 無しで 端末の 鍵（device_token）が 出た★（テスト線の 倉庫で 条件の 値と /rpc/ の 道で 実測）。
--   ⇒ 比べる 前に p_pw の null を 断る。他は 1字も 変えない（倉庫に 在った 本体 md5 d2761d6779caf29f124adab480cf8d9c からの 差は この 1行だけ）。
--   ★この 関数の 本体は 前は repo に 無く 倉庫の 中にしか 無かった★＝ここを 正本に する。
--   流すのは scripts/nagasu-meisai-verify.mjs（前と 後の md5 を 数え、supabase/NAGASHITA.md に 書く）。
-- 新しい 本体の md5 = 3b0b1f37d5dac22744c88db742e1369a

create or replace function public.meisai_verify(p_token uuid, p_pw text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare v_pub pay_meisai_pub; v_dev text;
begin
  select * into v_pub from pay_meisai_pub where token=p_token;
  if v_pub.token is null then return jsonb_build_object('ok',false); end if;
  if v_pub.locked_until is not null and v_pub.locked_until > now() then return jsonb_build_object('ok',false,'locked',true,'retry_at',v_pub.locked_until); end if;
  if p_pw is null or v_pub.pw_hash is null or v_pub.pw_hash <> crypt(p_pw, v_pub.pw_hash) then
    update pay_meisai_pub set fail_count=fail_count+1,
      locked_until = case when fail_count+1 >= 5 then now()+interval '15 minutes' else locked_until end
      where token=p_token returning fail_count, locked_until into v_pub.fail_count, v_pub.locked_until;
    if v_pub.fail_count >= 5 then return jsonb_build_object('ok',false,'locked',true,'retry_at',v_pub.locked_until); end if;
    return jsonb_build_object('ok',false,'remaining',5 - v_pub.fail_count);
  end if;
  v_dev := encode(gen_random_bytes(18),'hex');
  update pay_meisai_pub set device_tokens=array_append(device_tokens, v_dev), fail_count=0, locked_until=null where token=p_token;
  return jsonb_build_object('ok',true,'device_token',v_dev);
end $function$;
