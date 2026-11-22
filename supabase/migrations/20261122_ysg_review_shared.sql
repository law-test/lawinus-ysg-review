create or replace function public.ysg_review_shared_list(p_dataset_id text) returns jsonb language plpgsql stable security invoker set search_path='' as $fn$
begin
 if p_dataset_id is distinct from 'ysg-20261121' then raise sqlstate 'PT404' using message='등록되지 않은 여성곤 논문 판본입니다.'; end if;
 if auth.uid() is null then raise sqlstate 'PT401' using message='편집 이용 정보를 다시 연결해 주세요.'; end if;
 return paper_review_private.shared_list(p_dataset_id);
end; $fn$;
revoke all on function public.ysg_review_shared_list(text) from public,anon;
grant execute on function public.ysg_review_shared_list(text) to authenticated,service_role;

create or replace function public.ysg_review_shared_history(p_dataset_id text,p_kind text,p_target_id text,p_before_revision integer default null,p_limit integer default 50) returns jsonb language plpgsql stable security invoker set search_path='' as $fn$
begin
 if p_dataset_id is distinct from 'ysg-20261121' then raise sqlstate 'PT404' using message='등록되지 않은 여성곤 논문 판본입니다.'; end if;
 if auth.uid() is null then raise sqlstate 'PT401' using message='편집 이용 정보를 다시 연결해 주세요.'; end if;
 return paper_review_private.shared_history(p_dataset_id,p_kind,p_target_id,p_before_revision,p_limit);
end; $fn$;
revoke all on function public.ysg_review_shared_history(text,text,text,integer,integer) from public,anon;
grant execute on function public.ysg_review_shared_history(text,text,text,integer,integer) to authenticated,service_role;

create or replace function public.ysg_review_shared_catalog(p_dataset_id text,p_offset integer default 0,p_limit integer default 200) returns jsonb language plpgsql stable security invoker set search_path='' as $fn$
begin
 if p_dataset_id is distinct from 'ysg-20261121' then raise sqlstate 'PT404' using message='등록되지 않은 여성곤 논문 판본입니다.'; end if;
 if auth.uid() is null then raise sqlstate 'PT401' using message='편집 이용 정보를 다시 연결해 주세요.'; end if;
 return paper_review_private.shared_catalog(p_dataset_id,p_offset,p_limit);
end; $fn$;
revoke all on function public.ysg_review_shared_catalog(text,integer,integer) from public,anon;
grant execute on function public.ysg_review_shared_catalog(text,integer,integer) to authenticated,service_role;

create or replace function public.ysg_review_shared_export(p_dataset_id text,p_after_id bigint default 0,p_through_id bigint default null,p_limit integer default 100) returns jsonb language plpgsql stable security invoker set search_path='' as $fn$
begin
 if p_dataset_id is distinct from 'ysg-20261121' then raise sqlstate 'PT404' using message='등록되지 않은 여성곤 논문 판본입니다.'; end if;
 if auth.uid() is null then raise sqlstate 'PT401' using message='편집 이용 정보를 다시 연결해 주세요.'; end if;
 return paper_review_private.shared_export(p_dataset_id,p_after_id,p_through_id,p_limit);
end; $fn$;
revoke all on function public.ysg_review_shared_export(text,bigint,bigint,integer) from public,anon;
grant execute on function public.ysg_review_shared_export(text,bigint,bigint,integer) to authenticated,service_role;

create or replace function public.ysg_review_shared_save(p_dataset_id text,p_kind text,p_target_id text,p_expected_revision integer,p_text text,p_reason text default '',p_restore_revision integer default null) returns jsonb language plpgsql  security invoker set search_path='' as $fn$
begin
 if p_dataset_id is distinct from 'ysg-20261121' then raise sqlstate 'PT404' using message='등록되지 않은 여성곤 논문 판본입니다.'; end if;
 if auth.uid() is null then raise sqlstate 'PT401' using message='편집 이용 정보를 다시 연결해 주세요.'; end if;
 return paper_review_private.shared_save(p_dataset_id,p_kind,p_target_id,p_expected_revision,p_text,p_reason,p_restore_revision);
end; $fn$;
revoke all on function public.ysg_review_shared_save(text,text,text,integer,text,text,integer) from public,anon;
grant execute on function public.ysg_review_shared_save(text,text,text,integer,text,text,integer) to authenticated,service_role;