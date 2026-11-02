-- Private immutable assets. Legacy media, URL fields and broadcasts stay denied.
create table bitd.campaign_assets (
 id uuid primary key default gen_random_uuid(), campaign_id uuid not null references bitd.campaigns on delete cascade,
 character_id uuid references bitd.characters on delete cascade,
 kind text not null check(kind in ('portrait','avatar','image','audio')), object_path text not null unique,
 mime_type text not null, byte_size bigint not null check(byte_size between 1 and 20971520),
 title text not null check(length(trim(title)) between 1 and 100), annotation text not null default '' check(length(annotation)<=10000),
 shared boolean not null default false, state text not null default 'pending' check(state in ('pending','ready','removed')),
 revision bigint not null default 1, created_at timestamptz not null default now(),
 check((kind in ('portrait','avatar')) = (character_id is not null))
);
create table bitd.character_art (
 character_id uuid not null references bitd.characters on delete cascade, kind text not null check(kind in ('portrait','avatar')),
 asset_id uuid not null references bitd.campaign_assets, primary key(character_id,kind)
);
alter table bitd.campaign_assets enable row level security;
alter table bitd.character_art enable row level security;
grant select on bitd.campaign_assets, bitd.character_art to authenticated;
grant all on bitd.campaign_assets, bitd.character_art to service_role;
create function bitd.can_manage_asset(p_asset uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select bitd.campaign_role(a.campaign_id)='gm' or
 (bitd.campaign_role(a.campaign_id) is not null and a.character_id is not null and exists(
 select 1 from bitd.characters c where c.id=a.character_id and c.campaign_id=a.campaign_id and c.owner_id=auth.uid()))
 from bitd.campaign_assets a where a.id=p_asset),false)
$$;
create function bitd.can_read_asset(p_asset uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select a.state<>'removed' and bitd.campaign_role(a.campaign_id) is not null and
 (bitd.can_manage_asset(a.id) or (a.state='ready' and (a.shared or a.character_id is not null)))
 from bitd.campaign_assets a where a.id=p_asset),false)
$$;
revoke all on function bitd.can_manage_asset(uuid),bitd.can_read_asset(uuid) from public;
grant execute on function bitd.can_manage_asset(uuid),bitd.can_read_asset(uuid) to authenticated;
create policy asset_read on bitd.campaign_assets for select to authenticated using(bitd.can_read_asset(id));
create policy character_art_read on bitd.character_art for select to authenticated using(exists(
 select 1 from bitd.campaign_assets a where a.id=asset_id and a.state='ready' and bitd.can_read_asset(a.id)));
create function bitd.reserve_asset(p_campaign uuid,p_kind text,p_character uuid,p_mime text,p_size bigint,p_title text) returns bitd.campaign_assets
language plpgsql security definer set search_path='' as $$
declare a bitd.campaign_assets; c bitd.characters; asset_id uuid:=gen_random_uuid();
begin
 if bitd.campaign_role(p_campaign) is null then raise exception 'Campaign membership required' using errcode='42501'; end if;
 if p_kind is null or p_kind not in ('portrait','avatar','image','audio') then raise exception 'Invalid asset kind'; end if;
 if p_kind in ('portrait','avatar') then
 select * into c from bitd.characters where id=p_character and campaign_id=p_campaign for update;
 if not found or (bitd.campaign_role(p_campaign)<>'gm' and c.owner_id is distinct from auth.uid()) then raise exception 'Character owner or GM required' using errcode='42501'; end if;
 else
 if p_character is not null or bitd.campaign_role(p_campaign)<>'gm' then raise exception 'GM membership required' using errcode='42501'; end if;
 end if;
 if p_mime is null or (p_kind='audio' and p_mime not in ('audio/mpeg','audio/wav','audio/ogg','audio/webm')) or
 (p_kind<>'audio' and p_mime not in ('image/png','image/jpeg','image/webp','image/gif')) then raise exception 'Choose a permitted image or audio format'; end if;
 if p_size is null or p_size<1 or p_size>(case when p_kind='audio' then 20971520 else 10485760 end) then raise exception 'Image limit 10 MiB; audio limit 20 MiB'; end if;
 if p_title is null or length(trim(p_title)) not between 1 and 100 then raise exception 'Enter a title (1–100 characters)'; end if;
 insert into bitd.campaign_assets(id,campaign_id,character_id,kind,object_path,mime_type,byte_size,title)
 values(asset_id,p_campaign,p_character,p_kind,p_campaign::text||'/'||asset_id::text||'/file',p_mime,p_size,trim(p_title)) returning * into a;
 return a;
end $$;
create function bitd.finish_asset(p_asset uuid) returns bitd.campaign_assets
language plpgsql security definer set search_path='' as $$
declare a bitd.campaign_assets; object_metadata jsonb;
begin
 select * into a from bitd.campaign_assets where id=p_asset for update;
 if not found or not bitd.can_manage_asset(p_asset) then raise exception 'Asset manager required' using errcode='42501'; end if;
 if a.state='removed' then raise exception 'Asset was removed'; end if;
 select metadata into object_metadata from storage.objects where bucket_id='campaign-assets' and name=a.object_path;
 if object_metadata is null or object_metadata->>'mimetype' is distinct from a.mime_type or (object_metadata->>'size')::bigint is distinct from a.byte_size then raise exception 'Upload missing or file format/size does not match reservation'; end if;
 if a.state='pending' then update bitd.campaign_assets set state='ready',revision=revision+1 where id=a.id returning * into a; end if;
 if a.character_id is not null then
 insert into bitd.character_art values(a.character_id,a.kind,a.id) on conflict(character_id,kind) do update set asset_id=excluded.asset_id;
 end if;
 return a;
end $$;
create function bitd.update_asset(p_asset uuid,p_title text,p_annotation text,p_shared boolean,p_revision bigint) returns bitd.campaign_assets
language plpgsql security definer set search_path='' as $$
declare a bitd.campaign_assets;
begin
 select * into a from bitd.campaign_assets where id=p_asset for update;
 if not found or bitd.campaign_role(a.campaign_id) is distinct from 'gm' then raise exception 'GM membership required' using errcode='42501'; end if;
 if a.character_id is not null or a.state<>'ready' then raise exception 'Choose ready campaign media'; end if;
 if p_revision is distinct from a.revision then raise exception 'Media changed elsewhere. Reload saved media before retrying.' using errcode='40001'; end if;
 if p_title is null or length(trim(p_title)) not between 1 and 100 or p_annotation is null or length(p_annotation)>10000 or p_shared is null then raise exception 'Invalid media title, annotation or sharing state'; end if;
 update bitd.campaign_assets set title=trim(p_title),annotation=p_annotation,shared=p_shared,revision=revision+1 where id=a.id returning * into a;
 return a;
end $$;
create function bitd.remove_asset(p_asset uuid,p_revision bigint) returns void
language plpgsql security definer set search_path='' as $$
declare a bitd.campaign_assets;
begin
 select * into a from bitd.campaign_assets where id=p_asset for update;
 if not found or not bitd.can_manage_asset(p_asset) then raise exception 'Asset manager required' using errcode='42501'; end if;
 if a.state='removed' then return; end if;
 if p_revision is distinct from a.revision then raise exception 'Media changed elsewhere. Reload saved media before retrying.' using errcode='40001'; end if;
 delete from bitd.character_art where asset_id=p_asset;
 update bitd.campaign_assets set state='removed',shared=false,revision=revision+1 where id=p_asset;
end $$;
revoke all on function bitd.reserve_asset(uuid,text,uuid,text,bigint,text),bitd.finish_asset(uuid),bitd.update_asset(uuid,text,text,boolean,bigint),bitd.remove_asset(uuid,bigint) from public;
grant execute on function bitd.reserve_asset(uuid,text,uuid,text,bigint,text),bitd.finish_asset(uuid),bitd.update_asset(uuid,text,text,boolean,bigint),bitd.remove_asset(uuid,bigint) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('campaign-assets','campaign-assets',false,20971520,
 array['image/png','image/jpeg','image/webp','image/gif','audio/mpeg','audio/wav','audio/ogg','audio/webm']);
-- Revocation hides metadata before physical cleanup. This lookup deliberately checks
-- current management authority outside metadata SELECT RLS, including tombstones.
create function bitd.can_delete_asset_object(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from bitd.campaign_assets a where a.object_path=p_path and bitd.can_manage_asset(a.id))
$$;
revoke all on function bitd.can_delete_asset_object(text) from public;
grant execute on function bitd.can_delete_asset_object(text) to authenticated;
-- Operation-aware SELECT prevents reusable signed URLs. UPDATE/move/copy remain denied.
create policy asset_object_read on storage.objects for select to authenticated using(
 bucket_id='campaign-assets' and (
 (storage.allow_any_operation(array['object.get_authenticated','object.get_authenticated_info','object.head_authenticated_info','object.list','object.list_v2']) and exists(
 select 1 from bitd.campaign_assets a where a.object_path=name and a.state='ready' and bitd.can_read_asset(a.id))) or
 (storage.allow_any_operation(array['object.delete','object.delete_many']) and bitd.can_delete_asset_object(name))));
create policy asset_object_upload on storage.objects for insert to authenticated with check(
 bucket_id='campaign-assets' and storage.allow_only_operation('object.upload') and exists(
 select 1 from bitd.campaign_assets a where a.object_path=name and a.state='pending' and bitd.can_manage_asset(a.id)));
create policy asset_object_delete on storage.objects for delete to authenticated using(
 bucket_id='campaign-assets' and storage.allow_any_operation(array['object.delete','object.delete_many']) and bitd.can_delete_asset_object(name));
-- Snapshots are polled under current RLS. Private rows and old delete payloads
-- never enter a participant subscription, even if a future bootstrap publishes all.
do $$
begin
 if exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='bitd' and tablename='campaign_assets') then
 alter publication supabase_realtime drop table bitd.campaign_assets;
 end if;
 if exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='bitd' and tablename='character_art') then
 alter publication supabase_realtime drop table bitd.character_art;
 end if;
end $$;
-- Reused by #22's server-side map assignment validation. This grants no map write
-- authority: the map mutation must still require a current campaign GM.
create function bitd.can_use_map_asset(p_campaign uuid,p_asset uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select bitd.campaign_role(p_campaign) is not null and exists(
 select 1 from bitd.campaign_assets a where a.id=p_asset and a.campaign_id=p_campaign and
 a.kind='image' and a.character_id is null and a.state='ready' and a.shared)
$$;
revoke all on function bitd.can_use_map_asset(uuid,uuid) from public;
grant execute on function bitd.can_use_map_asset(uuid,uuid) to authenticated;
