-- LOCAL TEST FIXTURE ONLY. Existing RPC bodies; do not apply to the shared project.
-- Shared document editing. Original PDFs/HWP and private review notes are untouched.
-- Execute as the project administrator. Private tables are never exposed through REST.
begin;
create schema if not exists paper_review_private;
revoke all on schema paper_review_private from public;
grant usage on schema paper_review_private to anon, authenticated;

create table if not exists paper_review_private.edit_catalog (
 dataset_id text not null references public.paper_review_datasets(id),
 kind text not null check(kind in ('paragraph','footnote')),
 target_id text not null,
 original_text text not null check(char_length(original_text)<=100000),
 original_sha256 text not null check(original_sha256 ~ '^[a-f0-9]{64}$'),
 page integer check(page between 1 and 10000), printed_page text,
 label text not null default '' check(char_length(label)<=500),
 created_at timestamptz not null default now(),
 primary key(dataset_id,kind,target_id),
 check((kind='paragraph' and target_id ~ '^P[0-9]{4,6}$') or
       (kind='footnote' and target_id ~ '^fn-[0-9]{3}$'))
);
create table if not exists paper_review_private.edit_heads (
 dataset_id text not null,kind text not null,target_id text not null,
 revision integer not null default 0 check(revision>=0),
 primary key(dataset_id,kind,target_id),
 foreign key(dataset_id,kind,target_id) references paper_review_private.edit_catalog(dataset_id,kind,target_id)
);
create table if not exists paper_review_private.edit_revisions (
 id bigint generated always as identity primary key,
 dataset_id text not null,kind text not null,target_id text not null,
 revision integer not null check(revision>0), parent_revision integer not null,
 text text not null check(char_length(text)<=100000),
 text_sha256 text not null check(text_sha256 ~ '^[a-f0-9]{64}$'),
 reason text not null default '' check(char_length(reason)<=2000),
 action text not null check(action in ('edit','restore')),
 restored_from_revision integer check(restored_from_revision>=0),
 actor_id uuid not null, display_name text not null,
 created_at timestamptz not null default clock_timestamp(),
 unique(dataset_id,kind,target_id,revision),
 foreign key(dataset_id,kind,target_id) references paper_review_private.edit_catalog(dataset_id,kind,target_id),
 check(parent_revision=revision-1),
 check((action='edit' and restored_from_revision is null) or
       (action='restore' and restored_from_revision is not null and restored_from_revision<revision))
);
create index if not exists edit_revisions_dataset_id on paper_review_private.edit_revisions(dataset_id,id);
create index if not exists edit_revisions_actor_time on paper_review_private.edit_revisions(actor_id,created_at);
alter table paper_review_private.edit_catalog enable row level security;
alter table paper_review_private.edit_heads enable row level security;
alter table paper_review_private.edit_revisions enable row level security;
revoke all on all tables in schema paper_review_private from public,anon,authenticated;
revoke all on all sequences in schema paper_review_private from public,anon,authenticated;

create or replace function paper_review_private.reject_edit_history_mutation()
returns trigger language plpgsql set search_path='' as $$
begin raise sqlstate 'PT403' using message='원문과 기존 수정 이력은 변경하거나 삭제할 수 없습니다.'; end;
$$;
drop trigger if exists edit_catalog_immutable on paper_review_private.edit_catalog;
create trigger edit_catalog_immutable before update or delete on paper_review_private.edit_catalog
for each row execute function paper_review_private.reject_edit_history_mutation();
drop trigger if exists edit_revisions_append_only on paper_review_private.edit_revisions;
create trigger edit_revisions_append_only before update or delete on paper_review_private.edit_revisions
for each row execute function paper_review_private.reject_edit_history_mutation();

-- Administrative seeding only. Re-running identical catalog data is safe; drift aborts.
create or replace function paper_review_private.seed_shared_catalog(p_dataset_id text,p_rows jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare item jsonb; d public.paper_review_datasets; c paper_review_private.edit_catalog; n integer:=0;
begin
 select * into d from public.paper_review_datasets where id=p_dataset_id;
 if not found then raise sqlstate 'PT404' using message='등록되지 않은 기준본입니다.'; end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>5000 then
  raise sqlstate 'PT400' using message='원문 등록 형식을 확인해 주세요.';
 end if;
 for item in select value from jsonb_array_elements(p_rows) loop
  if jsonb_typeof(item->'originalText') is distinct from 'string'
    or char_length(item->>'originalText')>100000 or item->>'kind' not in ('paragraph','footnote')
    or item->>'targetId' is null then raise sqlstate 'PT400' using message='원문 항목이 올바르지 않습니다.'; end if;
  if item->>'kind'='footnote' and ((item->>'targetId')!~'^fn-[0-9]{3}$'
    or substring(item->>'targetId' from 4)::integer not between 1 and d.footnote_count) then
   raise sqlstate 'PT400' using message='원문 각주 범위를 벗어났습니다.'; end if;
  if (item->>'page')::integer>d.page_count then raise sqlstate 'PT400' using message='원문 쪽수 범위를 벗어났습니다.'; end if;
  select * into c from paper_review_private.edit_catalog where dataset_id=p_dataset_id
   and kind=item->>'kind' and target_id=item->>'targetId';
  if found then
   if c.original_text is distinct from item->>'originalText' or c.page is distinct from (item->>'page')::integer
      or c.printed_page is distinct from item->>'printedPage' or c.label is distinct from coalesce(item->>'label','') then
     raise sqlstate 'PT409' using message='등록된 원문과 다른 내용을 덮어쓸 수 없습니다.';
   end if;
  else
   insert into paper_review_private.edit_catalog(dataset_id,kind,target_id,original_text,original_sha256,page,printed_page,label)
   values(p_dataset_id,item->>'kind',item->>'targetId',item->>'originalText',
    encode(sha256(convert_to(item->>'originalText','UTF8')),'hex'),(item->>'page')::integer,item->>'printedPage',coalesce(item->>'label',''));
   n:=n+1;
  end if;
 end loop;
 return n;
end; $$;

create or replace function paper_review_private.revision_json(r paper_review_private.edit_revisions)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',r.id::text,'datasetId',r.dataset_id,'kind',r.kind,'targetId',r.target_id,
 'revision',r.revision,'parentRevision',r.parent_revision,'text',r.text,'textSha256',r.text_sha256,
 'reason',r.reason,'action',r.action,'restoredFromRevision',r.restored_from_revision,
 'displayName',r.display_name,'createdAt',r.created_at)
$$;

create or replace function paper_review_private.shared_list(p_dataset_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; snapshot bigint;
begin
 if not exists(select 1 from public.paper_review_datasets where id=p_dataset_id) then raise sqlstate 'PT404' using message='등록되지 않은 기준본입니다.'; end if;
 select coalesce(jsonb_agg(paper_review_private.revision_json(r) order by r.kind,r.target_id),'[]'::jsonb)
 into result from paper_review_private.edit_heads h join paper_review_private.edit_revisions r
 using(dataset_id,kind,target_id,revision) where h.dataset_id=p_dataset_id;
 select coalesce(max(id),0) into snapshot from paper_review_private.edit_revisions where dataset_id=p_dataset_id;
 return jsonb_build_object('datasetId',p_dataset_id,'overrides',result,'snapshotId',snapshot::text);
end; $$;

create or replace function paper_review_private.shared_history(p_dataset_id text,p_kind text,p_target_id text,p_before_revision integer,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c paper_review_private.edit_catalog; result jsonb; v_current integer; more boolean; last_revision integer;
begin
 if p_limit is null or p_limit not between 1 and 100 or (p_before_revision is not null and p_before_revision<1) then
  raise sqlstate 'PT400' using message='이력 조회 범위가 올바르지 않습니다.'; end if;
 select * into c from paper_review_private.edit_catalog where dataset_id=p_dataset_id and kind=p_kind and target_id=p_target_id;
 if not found then raise sqlstate 'PT404' using message='편집할 수 있는 원문 항목이 없습니다.'; end if;
 select coalesce(max(revision),0) into v_current from paper_review_private.edit_heads where dataset_id=p_dataset_id and kind=p_kind and target_id=p_target_id;
 select coalesce(jsonb_agg(paper_review_private.revision_json(q) order by q.revision desc),'[]'::jsonb),min(q.revision)
 into result,last_revision from (select * from paper_review_private.edit_revisions where dataset_id=p_dataset_id and kind=p_kind and target_id=p_target_id
 and (p_before_revision is null or revision<p_before_revision) order by revision desc limit p_limit) q;
 more:=exists(select 1 from paper_review_private.edit_revisions where dataset_id=p_dataset_id and kind=p_kind and target_id=p_target_id and revision<last_revision);
 return jsonb_build_object('original',jsonb_build_object('datasetId',p_dataset_id,'kind',p_kind,'targetId',p_target_id,'revision',0,
  'text',c.original_text,'textSha256',c.original_sha256,'page',c.page,'printedPage',c.printed_page,'label',c.label),
  'currentRevision',v_current,'revisions',result,'hasMore',more,'nextBeforeRevision',case when more then last_revision end);
end; $$;

create or replace function paper_review_private.shared_save(p_dataset_id text,p_kind text,p_target_id text,p_expected_revision integer,p_text text,p_reason text,p_restore_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); c paper_review_private.edit_catalog; current_revision integer;
 body text; row_value paper_review_private.edit_revisions;
begin
 if actor is null then raise sqlstate 'PT401' using message='편집 이용 정보를 다시 연결해 주세요.'; end if;
 if p_expected_revision is null or p_expected_revision not between 0 and 2147483645
  or p_reason is null or char_length(p_reason)>2000
  or (p_restore_revision is not null and (p_restore_revision<0 or p_text is not null))
  or (p_restore_revision is null and (p_text is null or char_length(p_text)>100000 or octet_length(p_text)>400000)) then
  raise sqlstate 'PT400' using message='수정 내용은 100,000자, 수정 이유는 2,000자 이내로 입력해 주세요.'; end if;
 -- Serialize commits within this dataset: export's sequence watermark is a committed prefix.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_dataset_id,913337));
 select * into c from paper_review_private.edit_catalog where dataset_id=p_dataset_id and kind=p_kind and target_id=p_target_id;
 if not found then raise sqlstate 'PT404' using message='편집할 수 있는 원문 항목이 없습니다.'; end if;
 insert into paper_review_private.edit_heads(dataset_id,kind,target_id) values(p_dataset_id,p_kind,p_target_id) on conflict do nothing;
 select revision into current_revision from paper_review_private.edit_heads where dataset_id=p_dataset_id and kind=p_kind and target_id=p_target_id for update;
 if current_revision<>p_expected_revision then raise sqlstate 'PT409' using message='다른 방문자가 먼저 수정했습니다. 최신 내용을 확인한 뒤 다시 저장해 주세요.'; end if;
 if (select count(*) from paper_review_private.edit_revisions where actor_id=actor and created_at>clock_timestamp()-interval '5 minutes')>=60 then
  raise sqlstate 'PT429' using message='짧은 시간에 수정 요청이 많습니다. 잠시 후 다시 저장해 주세요.'; end if;
 if p_restore_revision=0 then body:=c.original_text;
 elsif p_restore_revision is not null then
  select text into body from paper_review_private.edit_revisions where dataset_id=p_dataset_id and kind=p_kind and target_id=p_target_id and revision=p_restore_revision;
  if not found then raise sqlstate 'PT404' using message='복원할 수정 이력이 없습니다.'; end if;
 else body:=p_text; end if;
 insert into paper_review_private.edit_revisions(dataset_id,kind,target_id,revision,parent_revision,text,text_sha256,reason,action,restored_from_revision,actor_id,display_name)
 values(p_dataset_id,p_kind,p_target_id,current_revision+1,current_revision,body,encode(sha256(convert_to(body,'UTF8')),'hex'),p_reason,
  case when p_restore_revision is null then 'edit' else 'restore' end,p_restore_revision,actor,
  '방문자 '||upper(right(replace(actor::text,'-',''),6))) returning * into row_value;
 update paper_review_private.edit_heads set revision=current_revision+1 where dataset_id=p_dataset_id and kind=p_kind and target_id=p_target_id;
 return jsonb_build_object('edit',paper_review_private.revision_json(row_value));
end; $$;

create or replace function paper_review_private.shared_export(p_dataset_id text,p_after_id bigint,p_through_id bigint,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; watermark bigint; last_id bigint; more boolean; total bigint;
begin
 if not exists(select 1 from public.paper_review_datasets where id=p_dataset_id) then raise sqlstate 'PT404' using message='등록되지 않은 기준본입니다.'; end if;
 if p_after_id is null or p_after_id<0 or p_limit is null or p_limit not between 1 and 200 or (p_through_id is not null and p_through_id<0) then
  raise sqlstate 'PT400' using message='내보내기 범위가 올바르지 않습니다.'; end if;
 select coalesce(p_through_id,max(id),0) into watermark from paper_review_private.edit_revisions where dataset_id=p_dataset_id;
 select count(*) into total from paper_review_private.edit_revisions where dataset_id=p_dataset_id and id<=watermark;
 select coalesce(jsonb_agg(paper_review_private.revision_json(q) order by q.id),'[]'::jsonb),max(q.id)
 into result,last_id from (select * from paper_review_private.edit_revisions where dataset_id=p_dataset_id and id>p_after_id and id<=watermark order by id limit p_limit) q;
 more:=exists(select 1 from paper_review_private.edit_revisions where dataset_id=p_dataset_id and id>coalesce(last_id,p_after_id) and id<=watermark);
 return jsonb_build_object('datasetId',p_dataset_id,'snapshotId',watermark::text,'totalCount',total,'revisions',result,'hasMore',more,'nextAfterId',coalesce(last_id,p_after_id)::text);
end; $$;

create or replace function paper_review_private.shared_catalog(p_dataset_id text,p_offset integer,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; total integer;
begin
 if not exists(select 1 from public.paper_review_datasets where id=p_dataset_id) then raise sqlstate 'PT404' using message='등록되지 않은 기준본입니다.'; end if;
 if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 500 then raise sqlstate 'PT400' using message='원문 조회 범위가 올바르지 않습니다.'; end if;
 select count(*) into total from paper_review_private.edit_catalog where dataset_id=p_dataset_id;
 select coalesce(jsonb_agg(jsonb_build_object('kind',q.kind,'targetId',q.target_id,'originalText',q.original_text,'originalSha256',q.original_sha256,
 'page',q.page,'printedPage',q.printed_page,'label',q.label) order by q.kind,q.target_id),'[]'::jsonb) into result
 from (select * from paper_review_private.edit_catalog where dataset_id=p_dataset_id order by kind,target_id limit p_limit offset p_offset) q;
 return jsonb_build_object('datasetId',p_dataset_id,'targets',result,'totalCount',total,'hasMore',p_offset+p_limit<total,'nextOffset',p_offset+jsonb_array_length(result));
end; $$;

-- Thin public invoker wrappers; privileged logic stays in the unexposed schema.
create or replace function public.paper_review_shared_list(p_dataset_id text)
returns jsonb language sql stable security invoker set search_path='' as $$ select paper_review_private.shared_list(p_dataset_id) $$;
create or replace function public.paper_review_shared_history(p_dataset_id text,p_kind text,p_target_id text,p_before_revision integer default null,p_limit integer default 50)
returns jsonb language sql stable security invoker set search_path='' as $$ select paper_review_private.shared_history(p_dataset_id,p_kind,p_target_id,p_before_revision,p_limit) $$;
create or replace function public.paper_review_shared_save(p_dataset_id text,p_kind text,p_target_id text,p_expected_revision integer,p_text text,p_reason text default '',p_restore_revision integer default null)
returns jsonb language sql volatile security invoker set search_path='' as $$ select paper_review_private.shared_save(p_dataset_id,p_kind,p_target_id,p_expected_revision,p_text,p_reason,p_restore_revision) $$;
create or replace function public.paper_review_shared_export(p_dataset_id text,p_after_id bigint default 0,p_through_id bigint default null,p_limit integer default 100)
returns jsonb language sql stable security invoker set search_path='' as $$ select paper_review_private.shared_export(p_dataset_id,p_after_id,p_through_id,p_limit) $$;
create or replace function public.paper_review_shared_catalog(p_dataset_id text,p_offset integer default 0,p_limit integer default 200)
returns jsonb language sql stable security invoker set search_path='' as $$ select paper_review_private.shared_catalog(p_dataset_id,p_offset,p_limit) $$;

revoke all on all functions in schema paper_review_private from public,anon,authenticated;
revoke all on function public.paper_review_shared_list(text),public.paper_review_shared_history(text,text,text,integer,integer),
 public.paper_review_shared_save(text,text,text,integer,text,text,integer),public.paper_review_shared_export(text,bigint,bigint,integer),
 public.paper_review_shared_catalog(text,integer,integer) from public,anon,authenticated;
grant execute on function paper_review_private.shared_list(text),paper_review_private.shared_history(text,text,text,integer,integer),
 paper_review_private.shared_export(text,bigint,bigint,integer),paper_review_private.shared_catalog(text,integer,integer),
 public.paper_review_shared_list(text),public.paper_review_shared_history(text,text,text,integer,integer),
 public.paper_review_shared_export(text,bigint,bigint,integer),public.paper_review_shared_catalog(text,integer,integer) to anon,authenticated;
grant execute on function paper_review_private.shared_save(text,text,text,integer,text,text,integer),
 public.paper_review_shared_save(text,text,text,integer,text,text,integer) to authenticated;
notify pgrst,'reload schema';
commit;
