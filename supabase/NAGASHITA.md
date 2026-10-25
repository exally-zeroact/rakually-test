# 倉庫へ 流した 記録（★repo と 倉庫が ずれない為・2026-10-14〜★）

流す 時は 必ず 道具が ここに 書く（★流す 前に「試み」・流した 後に 結果★＝途中で 落ちても 試みた 事は 残る）。
md5 は 関数の 本体（prosrc）。性質＝持ち主/definer/search_path 等/volatile/権限/戻り/言語/引数。

| いつ（UTC） | 倉庫 | 段 | 物 | 前の md5 | 後の md5 | 引き金（前→後） | 性質 | 流した 文の md5 | 道具の commit | 結果 |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-19T15:02:05.218Z | test | 流す（試み） | public.meisai_verify | d2761d6779caf29f124adab480cf8d9c | — | — | oid=17571;owner=postgres;secdef=true;config=search_path=public, extensions;vol=v;acl={=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres};ret=jsonb;lang=plpgsql;args=p_token uuid, p_pw text | 92eafdeac2fa295ba97184ff0c32cff5 | 2f2ad5a2e786 | 試み |
| 2026-10-19T15:02:07.100Z | test | 流す | public.meisai_verify | d2761d6779caf29f124adab480cf8d9c | 3b0b1f37d5dac22744c88db742e1369a | — | 同じ | 92eafdeac2fa295ba97184ff0c32cff5 | 2f2ad5a2e786 | OK |
| 2026-10-19T19:40:28.885Z | honban | 流す（試み） | public.meisai_verify | d2761d6779caf29f124adab480cf8d9c | — | — | oid=18606;owner=postgres;secdef=true;config=search_path=public, extensions;vol=v;acl={=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres};ret=jsonb;lang=plpgsql;args=p_token uuid, p_pw text | 92eafdeac2fa295ba97184ff0c32cff5 | 2f2ad5a2e786 | 試み |
| 2026-10-19T19:40:30.571Z | honban | 流す | public.meisai_verify | d2761d6779caf29f124adab480cf8d9c | 3b0b1f37d5dac22744c88db742e1369a | — | 同じ | 92eafdeac2fa295ba97184ff0c32cff5 | 2f2ad5a2e786 | OK |
