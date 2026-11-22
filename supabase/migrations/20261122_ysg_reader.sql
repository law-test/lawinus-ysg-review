create schema ysg_reader_private;
revoke all on schema ysg_reader_private from public, anon, authenticated;
grant usage on schema ysg_reader_private to service_role;
create table ysg_reader_private.sessions (
 session_hash text primary key check(session_hash ~ '^[0-9a-f]{64}$'),
 owner_hash text not null check(owner_hash ~ '^[0-9a-f]{64}$'),
 expires_at timestamptz not null,
 window_slot bigint not null default 0,
 reads integer not null default 0
);
create index ysg_sessions_expiry_idx on ysg_reader_private.sessions(expires_at);
create table ysg_reader_private.budgets (
 budget_key text not null, slot bigint not null, reads integer not null default 1,
 primary key(budget_key,slot)
);
create table ysg_reader_private.page_notes (
 owner_hash text not null check(owner_hash ~ '^[0-9a-f]{64}$'),
 edition text not null check(edition='ysg-20261121'),
 page_no integer not null check(page_no between 1 and 209),
 body text not null check(length(body)<=12000),
 updated_at timestamptz not null default now(),
 primary key(owner_hash,edition,page_no)
);
alter table ysg_reader_private.sessions enable row level security;
alter table ysg_reader_private.budgets enable row level security;
alter table ysg_reader_private.page_notes enable row level security;
revoke all on all tables in schema ysg_reader_private from public,anon,authenticated;
grant select,insert,update,delete on all tables in schema ysg_reader_private to service_role;

create function public.ysg_reader_visit(owner_digest text, session_digest text, client_digest text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare slot_now bigint:=floor(extract(epoch from now())/60); request_count integer; expiry timestamptz:=now()+interval '12 hours';
begin
 if owner_digest !~ '^[0-9a-f]{64}$' or session_digest !~ '^[0-9a-f]{64}$' or client_digest !~ '^[0-9a-f]{64}$' then raise exception 'invalid'; end if;
 insert into ysg_reader_private.budgets(budget_key,slot) values('visit:'||client_digest,slot_now)
 on conflict(budget_key,slot) do update set reads=ysg_reader_private.budgets.reads+1 returning reads into request_count;
 if request_count>30 then return jsonb_build_object('limited',true); end if;
 insert into ysg_reader_private.sessions(session_hash,owner_hash,expires_at) values(session_digest,owner_digest,expiry);
 delete from ysg_reader_private.sessions where expires_at<now()-interval '1 day';
 delete from ysg_reader_private.budgets where slot<slot_now-1440;
 return jsonb_build_object('expiresAt',expiry);
end;$$;

create function public.ysg_reader_authorize(session_digest text,client_digest text)
returns text language plpgsql security invoker set search_path='' as $$
declare slot_now bigint:=floor(extract(epoch from now())/60); session_count integer; ip_count integer;
begin
 if session_digest !~ '^[0-9a-f]{64}$' or client_digest !~ '^[0-9a-f]{64}$' then return 'deny'; end if;
 update ysg_reader_private.sessions set reads=case when window_slot=slot_now then reads+1 else 1 end,window_slot=slot_now
 where session_hash=session_digest and expires_at>now() returning reads into session_count;
 if not found then return 'deny'; end if;
 if session_count>1200 then return 'limited'; end if;
 insert into ysg_reader_private.budgets(budget_key,slot) values('read:'||client_digest,slot_now)
 on conflict(budget_key,slot) do update set reads=ysg_reader_private.budgets.reads+1 returning reads into ip_count;
 if ip_count>2400 then return 'limited'; end if;
 return 'allow';
end;$$;

create function public.ysg_reader_notes(session_digest text,edition_input text,page_input integer default null,body_input text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare owner_key text; result jsonb;
begin
 if edition_input is distinct from 'ysg-20261121' then raise exception 'invalid edition'; end if;
 select owner_hash into owner_key from ysg_reader_private.sessions where session_hash=session_digest and expires_at>now();
 if owner_key is null then raise exception 'invalid session'; end if;
 if page_input is not null then
  if page_input<1 or page_input>209 or body_input is null or length(body_input)>12000 then raise exception 'invalid note'; end if;
  insert into ysg_reader_private.page_notes(owner_hash,edition,page_no,body) values(owner_key,edition_input,page_input,body_input)
  on conflict(owner_hash,edition,page_no) do update set body=excluded.body,updated_at=now();
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('page',page_no,'body',body) order by page_no),'[]'::jsonb) into result
 from ysg_reader_private.page_notes where owner_hash=owner_key and edition=edition_input;
 return jsonb_build_object('notes',result);
end;$$;
revoke all on function public.ysg_reader_visit(text,text,text),public.ysg_reader_authorize(text,text),public.ysg_reader_notes(text,text,integer,text) from public,anon,authenticated;
grant execute on function public.ysg_reader_visit(text,text,text),public.ysg_reader_authorize(text,text),public.ysg_reader_notes(text,text,integer,text) to service_role;
