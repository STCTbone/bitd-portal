-- Backing belongs to a character, independently of crew faction status. No private
-- clock references are stored here: Failure is a separately visible four-clock.
create table bitd.backing_records (
 id uuid primary key default gen_random_uuid(),
 campaign_id uuid not null references bitd.campaigns(id) on delete cascade,
 character_id uuid not null references bitd.characters(id) on delete cascade,
 faction_id uuid references bitd.faction_records(id) on delete set null,
 faction_name text not null, faction_tier integer not null check(faction_tier between 0 and 6),
 active boolean not null default true, shared boolean not null default false,
 mission text not null default '', mission_state text not null default 'pending',
 failure integer not null default 0 check(failure between 0 and 4),
 prestige text not null default '', choices text not null default '',
 return_favor text not null default '', notes text not null default '',
 cycles jsonb not null default '[]', version bigint not null default 1,
 updated_at timestamptz not null default clock_timestamp()
);
create unique index backing_one_faction on bitd.backing_records(character_id,faction_id) where active and faction_id is not null;
alter table bitd.backing_records enable row level security;
revoke all on bitd.backing_records from anon,authenticated;
grant select on bitd.backing_records to authenticated;
create policy backing_read on bitd.backing_records for select to authenticated using (
 bitd.campaign_role(campaign_id) is not null and (shared or bitd.campaign_role(campaign_id)='gm' or exists(select 1 from bitd.characters c where c.id=character_id and c.owner_id=auth.uid()))
);
-- Preserve every old Operative record, including unlinked names and old help text.
-- They were shared dossier data, so retain that visibility. Never guess a faction ID.
insert into bitd.backing_records(campaign_id,character_id,faction_name,faction_tier,mission,failure,prestige,return_favor,notes,shared)
 select c.campaign_id,c.id,b->>'name',(b->>'tier')::integer,b->>'mission',(b->>'failure')::integer,b->>'prestige',b->>'help',b->>'notes',true
 from bitd.characters c cross join lateral jsonb_array_elements(coalesce(c.data->'operative'->'backingFactions','[]')) b;
update bitd.characters set data=jsonb_set(data,'{operative,backingFactions}','[]') where data ? 'operative';
-- Keep the empty legacy key for the earlier final-state validator/default contract;
-- no client can write it. The sole editable backing source is backing_records.
alter function bitd.validate_character_patch(jsonb) rename to validate_character_pre_backing_patch;
create function bitd.validate_character_patch(p_patch jsonb) returns void language plpgsql set search_path='' as $$
begin
 if (p_patch->'operative') ? 'backingFactions' then raise exception 'Use backing records; legacy backingFactions is read only'; end if;
 perform bitd.validate_character_pre_backing_patch(p_patch);
end $$;

create function bitd.validate_backing_patch(p_patch jsonb) returns void language plpgsql set search_path='' as $$
declare e record; cycle jsonb; item jsonb; labels text[]='{}'; kinds text[];
begin
 if jsonb_typeof(p_patch) is distinct from 'object' then raise exception 'Expected backing changes'; end if;
 for e in select * from jsonb_each(p_patch) loop
  if e.key in ('mission','prestige','choices','return_favor','notes') then
   if jsonb_typeof(e.value)<>'string' or length(e.value #>> '{}')>12000 then raise exception 'Invalid backing text'; end if;
  elsif e.key in ('active','shared') then
   if jsonb_typeof(e.value)<>'boolean' then raise exception 'Invalid backing visibility/status'; end if;
  elsif e.key='mission_state' then
   if jsonb_typeof(e.value)<>'string' or (e.value #>> '{}') not in ('pending','active','complete','failed') then raise exception 'Invalid mission state'; end if;
  elsif e.key='failure' then
   if not bitd.character_record_integer(e.value,4) then raise exception 'Failure is a four-segment clock'; end if;
  elsif e.key='faction_id' then
   if jsonb_typeof(e.value)<>'string' then raise exception 'Choose a public campaign faction'; end if;
   perform (e.value #>> '{}')::uuid;
  elsif e.key='cycles' then
   if jsonb_typeof(e.value)<>'array' or jsonb_array_length(e.value)>100 then raise exception 'Expected at most 100 labeled support cycles'; end if;
   for cycle in select * from jsonb_array_elements(e.value) loop
    if jsonb_typeof(cycle)<>'object' or not cycle ?& array['label','used','notes'] or cycle-array['label','used','notes']<>'{}'::jsonb then raise exception 'Incomplete support cycle'; end if;
    if jsonb_typeof(cycle->'label')<>'string' or length(trim(cycle->>'label')) not between 1 and 100 or trim(cycle->>'label')=any(labels) then raise exception 'Use unique nonempty cycle labels'; end if;
    labels := array_append(labels,trim(cycle->>'label'));
    if jsonb_typeof(cycle->'notes')<>'string' or length(cycle->>'notes')>12000 or jsonb_typeof(cycle->'used')<>'array' or jsonb_array_length(cycle->'used')>8 then raise exception 'Invalid support cycle'; end if;
    kinds := '{}';
    for item in select * from jsonb_array_elements(cycle->'used') loop
     if jsonb_typeof(item)<>'string' or (item #>> '{}') not in ('assist','effect','equipment','intelligence','downtime','information','consequence','diplomacy') or (item #>> '{}')=any(kinds) then raise exception 'Each of eight assistance types is usable once per labeled cycle'; end if;
     kinds := array_append(kinds,item #>> '{}');
    end loop;
   end loop;
  else raise exception 'Unknown backing field: %',e.key;
  end if;
 end loop;
end $$;
create function bitd.check_backing_limit(p_character uuid,p_data jsonb) returns void language plpgsql set search_path='' as $$
declare allowed integer;
begin
 -- Match JavaScript String.trim; whitespace-only borrowed sources grant nothing.
 allowed := case when (p_data->>'playbook'='Operative' and (p_data->'abilities') ? 'Double Agent') or ((p_data->'abilities') ? 'Versatile' and exists(select 1 from jsonb_array_elements(p_data->'versatile') v where v->>'name'='Double Agent' and coalesce(v->>'source','') ~ U&'[^\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]')) then 2 else 1 end;
 if (select count(*) from bitd.backing_records where character_id=p_character and active)>allowed then raise exception 'One active backing; selected Double Agent (native or sourced Versatile) permits two. End a backing before removing the ability.'; end if;
end $$;
create function bitd.check_character_backing_limit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform bitd.check_backing_limit(new.id,new.data); return new;
end $$;
create trigger character_backing_limit before update on bitd.characters for each row execute function bitd.check_character_backing_limit();

create function bitd.create_backing(p_character uuid,p_faction uuid) returns bitd.backing_records language plpgsql security definer set search_path='' as $$
declare c bitd.characters; f bitd.faction_records; result bitd.backing_records;
begin
 select * into c from bitd.characters where id=p_character for update;
 if not found or bitd.campaign_role(c.campaign_id) is null or (bitd.campaign_role(c.campaign_id)<>'gm' and c.owner_id is distinct from auth.uid()) then raise exception 'Backing edit not permitted' using errcode='42501'; end if;
 select * into f from bitd.faction_records where id=p_faction and campaign_id=c.campaign_id;
 if not found then raise exception 'Choose a public campaign faction' using errcode='42501'; end if;
 insert into bitd.backing_records(campaign_id,character_id,faction_id,faction_name,faction_tier) values(c.campaign_id,c.id,f.id,f.name,f.tier) returning * into result;
 perform bitd.check_backing_limit(c.id,c.data);
 return result;
end $$;
create function bitd.patch_backing(p_backing uuid,p_patch jsonb,p_expected_version bigint) returns bitd.backing_records language plpgsql security definer set search_path='' as $$
declare result bitd.backing_records; c bitd.characters; f bitd.faction_records; merged jsonb; cid uuid;
begin
 -- Every mutation locks the current character first, serializing limit/ownership
 -- changes and concurrent backing creates without replacing patch_character.
 select character_id into cid from bitd.backing_records where id=p_backing;
 select * into c from bitd.characters where id=cid for update;
 if not found or bitd.campaign_role(c.campaign_id) is null or (bitd.campaign_role(c.campaign_id)<>'gm' and c.owner_id is distinct from auth.uid()) then raise exception 'Backing edit not permitted' using errcode='42501'; end if;
 select * into result from bitd.backing_records where id=p_backing for update;
 if result.version is distinct from p_expected_version then raise exception 'Backing changed. Reload saved backing and review your correction.' using errcode='40001'; end if;
 perform bitd.validate_backing_patch(p_patch);
 merged := to_jsonb(result) || p_patch;
 if p_patch ? 'faction_id' then
  select * into f from bitd.faction_records where id=(p_patch->>'faction_id')::uuid and campaign_id=c.campaign_id;
  if not found then raise exception 'Choose a public campaign faction' using errcode='42501'; end if;
  merged := merged || jsonb_build_object('faction_name',f.name,'faction_tier',f.tier);
 end if;
 update bitd.backing_records set
  faction_id=(merged->>'faction_id')::uuid,faction_name=merged->>'faction_name',faction_tier=(merged->>'faction_tier')::integer,
  active=(merged->>'active')::boolean,shared=(merged->>'shared')::boolean,
  mission=merged->>'mission',mission_state=merged->>'mission_state',failure=(merged->>'failure')::integer,
  prestige=merged->>'prestige',choices=merged->>'choices',return_favor=merged->>'return_favor',notes=merged->>'notes',cycles=merged->'cycles',
  version=version+1,updated_at=clock_timestamp() where id=p_backing returning * into result;
 perform bitd.check_backing_limit(c.id,c.data);
 return result;
end $$;
revoke all on function bitd.validate_character_pre_backing_patch(jsonb),bitd.validate_character_patch(jsonb),bitd.validate_backing_patch(jsonb),bitd.check_backing_limit(uuid,jsonb),bitd.check_character_backing_limit() from public,anon,authenticated;
revoke all on function bitd.create_backing(uuid,uuid),bitd.patch_backing(uuid,jsonb,bigint) from public,anon;
grant execute on function bitd.create_backing(uuid,uuid),bitd.patch_backing(uuid,jsonb,bigint) to authenticated;
