-- LOCAL TEST FIXTURE ONLY. RPC bodies cloned from the current template; not a production migration.
-- Independent paper-review schema. Run as Supabase project owner in SQL Editor.
-- This migration does not alter existing application tables, Auth policies or buckets.
-- Public PDF access is intentional. Browser keys must be publishable/anon keys only.
begin;

create table if not exists public.paper_review_datasets (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  title text not null check (char_length(title) between 1 and 500),
  -- thesis_sha256 identifies the served PDF; source_hwp_sha256 identifies its human source.
  thesis_sha256 text not null check (thesis_sha256 ~ '^[a-fA-F0-9]{64}$'),
  source_hwp_sha256 text not null check (source_hwp_sha256 ~ '^[a-fA-F0-9]{64}$'),
  page_count integer not null check (page_count between 1 and 10000),
  footnote_count integer not null check (footnote_count between 0 and 999),
  created_at timestamptz not null default now()
);

create table if not exists public.paper_review_notes (
  id uuid primary key default gen_random_uuid(),
  dataset_id text not null references public.paper_review_datasets(id),
  owner_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 200),
  anchor_type text not null default 'general' check (anchor_type in ('thesis','footnote','source','general')),
  page integer check (page between 1 and 10000),
  note_id text check (note_id ~ '^fn-[0-9]{3}$'),
  source_id text check (source_id ~ '^s-[a-zA-Z0-9_-]{1,100}$'),
  x double precision check (x >= 0 and x <= 1),
  y double precision check (y >= 0 and y <= 1),
  quote text not null default '' check (char_length(quote) <= 4000),
  text text not null check (char_length(text) between 1 and 10000 and text ~ '[^[:space:]]'),
  visibility text not null default 'private' check (visibility in ('private','shared')),
  status text not null default 'open' check (status in ('open','resolved')),
  revision integer not null default 1 check (revision between 1 and 2147483647),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (anchor_type <> 'footnote' or note_id is not null),
  check (anchor_type <> 'source' or source_id is not null),
  check ((x is null) = (y is null))
);
create index if not exists paper_review_notes_owner_updated on public.paper_review_notes(dataset_id, owner_id, updated_at desc, id);
create index if not exists paper_review_notes_shared_updated on public.paper_review_notes(dataset_id, updated_at desc, id) where visibility = 'shared';
alter table public.paper_review_datasets enable row level security;
alter table public.paper_review_notes enable row level security;
revoke all on table public.paper_review_datasets, public.paper_review_notes from public, anon, authenticated;
grant all on table public.paper_review_datasets, public.paper_review_notes to service_role;

-- Helper functions are not callable from a browser. Only explicit JSON fields leave the DB.
create or replace function public.paper_review_public_note(p_row public.paper_review_notes)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id',p_row.id,'datasetId',p_row.dataset_id,'displayName',p_row.display_name,
    'anchorType',p_row.anchor_type,'page',p_row.page,'noteId',p_row.note_id,
    'sourceId',p_row.source_id,'x',p_row.x,'y',p_row.y,'quote',p_row.quote,
    'text',p_row.text,'visibility',p_row.visibility,'status',p_row.status,
    'revision',p_row.revision,'createdAt',p_row.created_at,'updatedAt',p_row.updated_at,
    'editable',coalesce(p_row.owner_id = auth.uid(),false)
  );
$$;
revoke all on function public.paper_review_public_note(public.paper_review_notes) from public, anon, authenticated;

create or replace function public.paper_review_validate_input(p_input jsonb, p_create boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v text; k text; n numeric;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' or octet_length(p_input::text) > 64000 then
    raise sqlstate 'PT400' using message = '메모 입력 내용을 확인해 주세요.';
  end if;
  for k in select jsonb_object_keys(p_input) loop
    if not (k = any(case when p_create then array['anchorType','page','noteId','sourceId','x','y','quote','text','visibility','status'] else array['revision','quote','text','visibility','status'] end)) then
      raise sqlstate 'PT400' using message = '허용되지 않은 메모 입력 항목입니다.';
    end if;
  end loop;
  foreach k in array array['text','quote','visibility','status'] loop
    if p_input ? k and jsonb_typeof(p_input->k) <> 'string' then
      raise sqlstate 'PT400' using message = '메모 내용의 형식이 올바르지 않습니다.';
    end if;
  end loop;
  if (p_create and not(p_input ? 'text')) or (p_input ? 'text' and
      (char_length(p_input->>'text') not between 1 and 10000 or not((p_input->>'text') ~ '[^[:space:]]'))) then
    raise sqlstate 'PT400' using message = '메모를 1자 이상 10,000자 이하로 입력해 주세요.';
  end if;
  if p_input ? 'quote' and char_length(p_input->>'quote') > 4000 then
    raise sqlstate 'PT400' using message = '선택문은 4,000자 이하로 입력해 주세요.';
  end if;
  if p_input ? 'visibility' and (p_input->>'visibility') not in ('private','shared') then
    raise sqlstate 'PT400' using message = '공유 범위가 올바르지 않습니다.';
  end if;
  if p_input ? 'status' and (p_input->>'status') not in ('open','resolved') then
    raise sqlstate 'PT400' using message = '메모 상태가 올바르지 않습니다.';
  end if;
  if not p_create then
    if not(p_input ? 'revision') or jsonb_typeof(p_input->'revision') <> 'number' then
      raise sqlstate 'PT400' using message = '수정 이력 번호가 필요합니다.';
    end if;
    n := (p_input->>'revision')::numeric;
    if n <> trunc(n) or n < 1 or n > 2147483646 then
      raise sqlstate 'PT400' using message = '수정 이력 번호가 올바르지 않습니다.';
    end if;
    return;
  end if;
  if p_input ? 'anchorType' and (jsonb_typeof(p_input->'anchorType') <> 'string' or (p_input->>'anchorType') not in ('thesis','footnote','source','general')) then
    raise sqlstate 'PT400' using message = '메모 위치 종류가 올바르지 않습니다.';
  end if;
  foreach k in array array['page','x','y'] loop
    if p_input ? k and p_input->k <> 'null'::jsonb then
      if jsonb_typeof(p_input->k) <> 'number' then raise sqlstate 'PT400' using message = '쪽수·좌표 형식이 올바르지 않습니다.'; end if;
      n := (p_input->>k)::numeric;
      if (k = 'page' and (n <> trunc(n) or n < 1 or n > 10000)) or (k <> 'page' and (n < 0 or n > 1)) then
        raise sqlstate 'PT400' using message = '쪽수·좌표 범위가 올바르지 않습니다.';
      end if;
    end if;
  end loop;
  if ((p_input->>'x') is null) <> ((p_input->>'y') is null) then raise sqlstate 'PT400' using message = '가로·세로 좌표를 함께 지정해 주세요.'; end if;
  foreach k in array array['noteId','sourceId'] loop
    if p_input ? k and p_input->k <> 'null'::jsonb and jsonb_typeof(p_input->k) <> 'string' then raise sqlstate 'PT400' using message = '자료·각주 식별자가 올바르지 않습니다.'; end if;
  end loop;
  v := nullif(p_input->>'noteId','');
  if v is not null and v !~ '^fn-[0-9]{3}$' then raise sqlstate 'PT400' using message = '각주 식별자가 올바르지 않습니다.'; end if;
  v := nullif(p_input->>'sourceId','');
  if v is not null and v !~ '^s-[a-zA-Z0-9_-]{1,100}$' then raise sqlstate 'PT400' using message = '자료 식별자가 올바르지 않습니다.'; end if;
  if p_input->>'anchorType' = 'footnote' and nullif(p_input->>'noteId','') is null then raise sqlstate 'PT400' using message = '각주 번호가 필요합니다.'; end if;
  if p_input->>'anchorType' = 'source' and nullif(p_input->>'sourceId','') is null then raise sqlstate 'PT400' using message = '자료 식별자가 필요합니다.'; end if;
end;
$$;
revoke all on function public.paper_review_validate_input(jsonb,boolean) from public, anon, authenticated;

create or replace function public.paper_review_list_notes(p_dataset_id text, p_status text default null, p_export boolean default false)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb; v_limit integer := case when coalesce(p_export,false) then 20000 else 5000 end; v_count integer;
begin
  if p_status is not null and p_status not in ('open','resolved') then raise sqlstate 'PT400' using message = '메모 상태가 올바르지 않습니다.'; end if;
  if not exists(select 1 from public.paper_review_datasets where id = p_dataset_id) then raise sqlstate 'PT404' using message = '등록되지 않은 기준본입니다.'; end if;
  -- The limit+1 sentinel is inside SQL, so PostgREST row caps cannot silently truncate exports.
  with visible as (
    select n as note from public.paper_review_notes n
    where n.dataset_id = p_dataset_id and (n.visibility = 'shared' or n.owner_id = auth.uid())
      and (p_status is null or n.status = p_status)
    order by case when coalesce(p_export,false) then n.page end asc nulls last,
      case when coalesce(p_export,false) then n.note_id end asc nulls last,
      n.updated_at desc,n.id limit v_limit + 1
  ) select coalesce(jsonb_agg(public.paper_review_public_note(v.note)), '[]'::jsonb), count(*) into v_result,v_count from visible v;
  if coalesce(p_export,false) and v_count > v_limit then raise sqlstate 'PT413' using message = '한 번에 내보낼 수 있는 메모 수(20,000개)를 초과했습니다.'; end if;
  if v_count > v_limit then v_result := v_result - v_limit; end if;
  return jsonb_build_object('notes',v_result,'truncated',v_count > v_limit);
end;
$$;
revoke all on function public.paper_review_list_notes(text,text,boolean) from public;
grant execute on function public.paper_review_list_notes(text,text,boolean) to anon, authenticated;

create or replace function public.paper_review_create_note(p_dataset_id text, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_row public.paper_review_notes; v_dataset public.paper_review_datasets;
begin
  if v_owner is null then raise sqlstate 'PT401' using message = '메모 이용 정보를 다시 연결해 주세요.'; end if;
  perform public.paper_review_validate_input(p_input,true);
  select * into v_dataset from public.paper_review_datasets where id = p_dataset_id;
  if not found then raise sqlstate 'PT404' using message = '등록되지 않은 기준본입니다.'; end if;
  if nullif(p_input->>'noteId','') is not null and substring(p_input->>'noteId' from 4)::integer not between 1 and v_dataset.footnote_count then
    raise sqlstate 'PT400' using message = '현재 기준본의 각주 번호가 아닙니다.';
  end if;
  if p_input->>'anchorType' = 'thesis' and (p_input->>'page')::integer > v_dataset.page_count then raise sqlstate 'PT400' using message = '현재 기준본의 PDF 쪽수 범위를 벗어났습니다.'; end if;
  insert into public.paper_review_notes(dataset_id,owner_id,display_name,anchor_type,page,note_id,source_id,x,y,quote,text,visibility,status)
  values (p_dataset_id,v_owner,'방문자 ' || upper(right(replace(v_owner::text,'-',''),6)),
    coalesce(p_input->>'anchorType','general'),(p_input->>'page')::integer,nullif(p_input->>'noteId',''),nullif(p_input->>'sourceId',''),
    (p_input->>'x')::double precision,(p_input->>'y')::double precision,coalesce(p_input->>'quote',''),p_input->>'text',
    coalesce(p_input->>'visibility','private'),coalesce(p_input->>'status','open')) returning * into v_row;
  return jsonb_build_object('note',public.paper_review_public_note(v_row));
end;
$$;
revoke all on function public.paper_review_create_note(text,jsonb) from public, anon;
grant execute on function public.paper_review_create_note(text,jsonb) to authenticated;

create or replace function public.paper_review_update_note(p_dataset_id text, p_id uuid, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_row public.paper_review_notes;
begin
  if v_owner is null then raise sqlstate 'PT401' using message = '메모 이용 정보를 다시 연결해 주세요.'; end if;
  perform public.paper_review_validate_input(p_input,false);
  if (p_input - 'revision') = '{}'::jsonb then raise sqlstate 'PT400' using message = '변경할 메모 내용이 없습니다.'; end if;
  update public.paper_review_notes n set
    text = case when p_input ? 'text' then p_input->>'text' else n.text end,
    quote = case when p_input ? 'quote' then p_input->>'quote' else n.quote end,
    visibility = case when p_input ? 'visibility' then p_input->>'visibility' else n.visibility end,
    status = case when p_input ? 'status' then p_input->>'status' else n.status end,
    revision = n.revision + 1, updated_at = now()
  where n.id = p_id and n.dataset_id = p_dataset_id and n.owner_id = v_owner and n.revision = (p_input->>'revision')::integer
  returning * into v_row;
  if not found then
    if exists(select 1 from public.paper_review_notes where id = p_id and dataset_id = p_dataset_id and owner_id = v_owner) then raise sqlstate 'PT409' using message = '다른 화면에서 메모가 변경됐습니다.'; end if;
    raise sqlstate 'PT404' using message = '수정할 수 있는 메모가 없습니다.';
  end if;
  return jsonb_build_object('note',public.paper_review_public_note(v_row));
end;
$$;
revoke all on function public.paper_review_update_note(text,uuid,jsonb) from public, anon;
grant execute on function public.paper_review_update_note(text,uuid,jsonb) to authenticated;

create or replace function public.paper_review_delete_note(p_dataset_id text, p_id uuid, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_id uuid;
begin
  if v_owner is null then raise sqlstate 'PT401' using message = '메모 이용 정보를 다시 연결해 주세요.'; end if;
  perform public.paper_review_validate_input(p_input,false);
  if (p_input - 'revision') <> '{}'::jsonb then raise sqlstate 'PT400' using message = '삭제 요청에는 수정 이력 번호만 사용해 주세요.'; end if;
  delete from public.paper_review_notes n where n.id = p_id and n.dataset_id = p_dataset_id and n.owner_id = v_owner and n.revision = (p_input->>'revision')::integer returning id into v_id;
  if not found then
    if exists(select 1 from public.paper_review_notes where id = p_id and dataset_id = p_dataset_id and owner_id = v_owner) then raise sqlstate 'PT409' using message = '다른 화면에서 메모가 변경됐습니다.'; end if;
    raise sqlstate 'PT404' using message = '삭제할 수 있는 메모가 없습니다.';
  end if;
  return jsonb_build_object('deleted',v_id);
end;
$$;
revoke all on function public.paper_review_delete_note(text,uuid,jsonb) from public, anon;
grant execute on function public.paper_review_delete_note(text,uuid,jsonb) to authenticated;

commit;
