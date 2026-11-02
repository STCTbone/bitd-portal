-- Definitions are migration-owned published data, never campaign-editable authority.
create table bitd.character_playbooks (
 name text primary key, defaults jsonb not null check (jsonb_typeof(defaults)='object'),
 rules jsonb not null check (jsonb_typeof(rules)='object')
);
alter table bitd.character_playbooks enable row level security;
revoke all on bitd.character_playbooks from public, anon, authenticated;
grant select on bitd.character_playbooks to authenticated;
create policy published_playbooks_read on bitd.character_playbooks for select to authenticated using (true);
insert into bitd.character_playbooks(name, defaults, rules) values ('Hound',
jsonb_build_object( 'alias', '', 'playerName', '', 'look', '', 'wearing', '', 'heritage', '', 'heritageDetails', '', 'background', '', 'backgroundDetails', '', 'vice', '', 'viceHookup', '', 'notes', '', 'abilityNotes', '',
      'actions', '{"hunt":0,"study":0,"survey":1,"tinker":0,"finesse":0,"prowl":0,"skirmish":0,"wreck":0,"attune":0,"command":0,"consort":2,"sway":0}'::jsonb,
      'abilities', '[]'::jsonb, 'echoPet', '[]'::jsonb, 'versatile', '[]'::jsonb, 'relationships', '[]'::jsonb,
      'pet', '{"name":"","kind":"","edges":"","flaws":"","abilities":"","notes":"","weak":false,"impaired":false,"broken":false,"armor":false}'::jsonb) || '{"loadout": {"mode": "Quiet", "carriedStacks": 0}, "armor": {"kind": "none", "worn": false, "totaled": false, "source": "", "notes": ""}, "wealth": {"stacks": 0, "bank": 0}, "xp": {"playbook": 0, "insight": 0, "prowess": 0, "resolve": 0}, "resources": [{"name": "Tenacity", "used": 0, "capacity": 2, "source": "Dogged Persistence · book v1.0.1 p.28", "notes": ""}], "equipment": [{"name": "Fine snub-nosed handcannon", "load": 1, "quantity": 1, "uses": 0, "carried": false, "source": "Hound playbook v6", "notes": ""}, {"name": "A loyal, clever pet", "load": 0, "quantity": 1, "uses": 0, "carried": false, "source": "Hound playbook v6", "notes": ""}, {"name": "Binoculars", "load": 1, "quantity": 1, "uses": 0, "carried": false, "source": "Hound playbook v6", "notes": ""}, {"name": "Hipflask of the good stuff", "load": 0, "quantity": 1, "uses": 0, "carried": false, "source": "Hound playbook v6", "notes": ""}, {"name": "Pocketful of focus pills", "load": 0, "quantity": 1, "uses": 0, "carried": false, "source": "Hound playbook v6", "notes": ""}, {"name": "RF radio handset", "load": 1, "quantity": 1, "uses": 0, "carried": false, "source": "Hound playbook v6; book v1.0.1 p.25 differs", "notes": "Source discrepancy: v6 nonitalic item costs 1 load; book v1.0.1 p.25 lists 0. Record the table’s agreed value manually."}, {"name": "A Blade or Two", "load": 1, "quantity": 1, "uses": 0, "carried": false, "source": "Published playbooks v6", "notes": ""}, {"name": "Silenced Shooter", "load": 1, "quantity": 1, "uses": 0, "carried": false, "source": "Published playbooks v6", "notes": ""}, {"name": "Handcannon", "load": 1, "quantity": 1, "uses": 0, "carried": false, "source": "Published playbooks v6", "notes": ""}, {"name": "Electro-Blade", "load": 2, "quantity": 1, "uses": 0, "carried": false, "source": "Published playbooks v6", "notes": ""}, {"name": "Pump-Action Scattergun", "load": 2, "quantity": 1, "uses": 0, "carried": false, "source": "Published playbooks v6", "notes": ""}, {"name": "Burglary Gear", "load": 1, "quantity": 1, "uses": 0, "carried": false, "source": "Published playbooks v6", "notes": ""}, {"name": "Climbing Gear", "load": 2, "quantity": 1, "uses": 0, "carried": false, "source": "Published playbooks v6", "notes": ""}, {"name": "Paranormal Implements", "load": 1, "quantity": 1, "uses": 0, "carried": false, "source": "Published playbooks v6", "notes": ""}, {"name": "Documents", "load": 1, "quantity": 1, "uses": 0, "carried": false, "source": "Published playbooks v6", "notes": ""}, {"name": "Subterfuge Supplies", "load": 1, "quantity": 1, "uses": 0, "carried": false, "source": "Published playbooks v6", "notes": ""}, {"name": "Demolition Tools", "load": 2, "quantity": 1, "uses": 0, "carried": false, "source": "Published playbooks v6", "notes": ""}, {"name": "Tinkering Tools", "load": 1, "quantity": 1, "uses": 0, "carried": false, "source": "Published playbooks v6", "notes": ""}, {"name": "Arclighter", "load": 1, "quantity": 1, "uses": 0, "carried": false, "source": "Published playbooks v6", "notes": ""}], "advancementNotes": "", "equipmentNotes": ""}'::jsonb,
'{"abilities": ["Hound’s Instincts", "Learn the Hard Way", "Just a Scratch", "Fixer", "In Too Deep", "Echo Pet", "Dogged Persistence", "Versatile"], "quiet": 3, "loud": 6, "wallet": 4, "bank": 40, "playbookXp": 8, "attributeXp": 6, "builtInArmor": false, "actionMax": 4, "harmSlots": {"passing": 2, "major": 2, "critical": 1, "mortal": 1}, "source": "Blades ’68 playbooks v6; book v1.0.1 pp. 26–28, 153, 158–160"}'::jsonb);
create function bitd.initialize_character_playbook() returns trigger
language plpgsql security definer set search_path = '' as $$
declare definition bitd.character_playbooks;
begin
 select * into definition from bitd.character_playbooks where name=new.data->>'playbook';
 if not found then raise exception 'Unknown or unavailable playbook'; end if;
 new.data := definition.defaults || new.data || jsonb_build_object('sheet',definition.rules);
 return new;
end $$;
-- Before condition defaults, allowing a specialized definition to provide its own condition state.
create trigger character_00_playbook_defaults before insert on bitd.characters for each row execute function bitd.initialize_character_playbook();
update bitd.characters c set data = p.defaults || c.data || jsonb_build_object('sheet',p.rules) from bitd.character_playbooks p where p.name=c.data->>'playbook';
-- Replace the old signature rather than retaining an ambiguous defaulted overload.
drop function bitd.create_character(uuid,text,boolean);
create function bitd.create_character(p_campaign uuid,p_name text,p_unclaimed boolean default false,p_playbook text default 'Hound') returns bitd.characters
language plpgsql security definer set search_path = '' as $$
declare result bitd.characters; member_role text;
begin
 member_role := bitd.campaign_role(p_campaign);
 if member_role is null or (p_unclaimed is true and member_role <> 'gm') then raise exception 'Campaign membership and authorized ownership required' using errcode='42501'; end if;
 perform bitd.validate_character_patch(jsonb_build_object('name',p_name));
 if not exists(select 1 from bitd.character_playbooks where name=p_playbook) then raise exception 'Unknown or unavailable playbook'; end if;
 insert into bitd.characters(campaign_id,owner_id,data) values(p_campaign,case when p_unclaimed is true then null else auth.uid() end,jsonb_build_object('name',trim(p_name),'playbook',p_playbook)) returning * into result;
 return result;
end $$;
revoke all on function bitd.initialize_character_playbook(),bitd.create_character(uuid,text,boolean,text) from public;
grant execute on function bitd.create_character(uuid,text,boolean,text) to authenticated;

-- Keep the complete identity/condition chain. Equipment-owned keys plus abilities, actions
-- and Harm are removed; those three shapes are checked with authoritative playbook context.
alter function bitd.validate_character_patch(jsonb) rename to validate_character_pre_equipment_patch;
create function bitd.character_record_integer(p_value jsonb,p_max integer) returns boolean
language sql immutable set search_path = '' as $$
 select coalesce(jsonb_typeof(p_value)='number' and (p_value #>> '{}') ~ '^[0-9]+$' and (p_value #>> '{}')::numeric <= p_max,false)
$$;
create function bitd.validate_character_patch(p_patch jsonb) returns void
language plpgsql set search_path = '' as $$
declare e record; n record; item jsonb;
begin
 perform bitd.validate_character_pre_equipment_patch(p_patch - array['loadout','equipment','armor','resources','wealth','xp','advancementNotes','equipmentNotes','abilities','actions','harm']);
 for e in select * from jsonb_each(p_patch) loop
  if e.key in ('advancementNotes','equipmentNotes') then
   if jsonb_typeof(e.value)<>'string' or length(e.value #>> '{}')>12000 then raise exception 'Invalid record notes'; end if;
  elsif e.key in ('loadout','armor','wealth','xp') then
   if jsonb_typeof(e.value)<>'object' then raise exception 'Expected % record',e.key; end if;
   for n in select * from jsonb_each(e.value) loop
    if (e.key='loadout' and n.key='mode') then
     if n.value not in ('"Quiet"'::jsonb,'"Loud"'::jsonb) then raise exception 'Choose Quiet or Loud load'; end if;
    elsif (e.key='loadout' and n.key='carriedStacks') or (e.key='wealth' and n.key in ('stacks','bank')) or (e.key='xp' and n.key in ('playbook','insight','prowess','resolve')) then
     if not bitd.character_record_integer(n.value,100) then raise exception 'Invalid nonnegative whole track value'; end if;
    elsif e.key='armor' and n.key='kind' then
     if n.value not in ('"none"'::jsonb,'"armor"'::jsonb,'"light"'::jsonb,'"built-in"'::jsonb) then raise exception 'Unknown Armor kind'; end if;
    elsif e.key='armor' and n.key in ('worn','totaled') then
     if jsonb_typeof(n.value)<>'boolean' then raise exception 'Invalid Armor status'; end if;
    elsif e.key='armor' and n.key in ('source','notes') then
     if jsonb_typeof(n.value)<>'string' or length(n.value #>> '{}')>12000 then raise exception 'Invalid Armor notes'; end if;
    else raise exception 'Unknown % field: %',e.key,n.key; end if;
   end loop;
  elsif e.key in ('equipment','resources') then
   if jsonb_typeof(e.value)<>'array' or jsonb_array_length(e.value)>100 then raise exception 'Expected bounded list of %',e.key; end if;
   for item in select * from jsonb_array_elements(e.value) loop
    if jsonb_typeof(item)<>'object' or not (item ?& (case when e.key='equipment' then array['name','load','quantity','uses','carried','source','notes'] else array['name','used','capacity','source','notes'] end)) then raise exception 'Incomplete % record',e.key; end if;
    for n in select * from jsonb_each(item) loop
     if n.key in ('name','source','notes') then
      if jsonb_typeof(n.value)<>'string' or length(n.value #>> '{}')>12000 then raise exception 'Invalid item/resource text'; end if;
     elsif (e.key='equipment' and n.key in ('load','quantity','uses')) or (e.key='resources' and n.key in ('used','capacity')) then
      if not bitd.character_record_integer(n.value,100) then raise exception 'Invalid item/resource count'; end if;
     elsif e.key='equipment' and n.key='carried' then
      if jsonb_typeof(n.value)<>'boolean' then raise exception 'Invalid carried state'; end if;
     else raise exception 'Unknown item/resource field'; end if;
    end loop;
    if length(trim(item->>'name'))=0 or length(trim(item->>'source'))=0 then raise exception 'Record item/resource name and source; label house rules explicitly'; end if;
    if e.key='equipment' and (item->>'quantity')::integer<1 then raise exception 'Item quantity must be positive'; end if;
    if e.key='resources' and (item->>'used')::integer>(item->>'capacity')::integer then raise exception 'Resource uses exceed capacity'; end if;
   end loop;
  end if;
 end loop;
end $$;
-- The saved playbook selects authoritative choices. Client metadata is never authority.
create function bitd.validate_character_playbook_patch(p_playbook text,p_patch jsonb) returns void
language plpgsql set search_path = '' as $$
declare rules jsonb; item jsonb; entry record; expected integer;
begin
 select p.rules into rules from bitd.character_playbooks p where name=p_playbook;
 if rules is null then raise exception 'Unknown or unavailable playbook'; end if;
 if p_patch ? 'actions' then
  if jsonb_typeof(p_patch->'actions')<>'object' then raise exception 'Expected action ratings'; end if;
  for entry in select * from jsonb_each(p_patch->'actions') loop
   if not entry.key=any(array['hunt','study','survey','tinker','finesse','prowl','skirmish','wreck','attune','command','consort','sway']) or not bitd.character_record_integer(entry.value,(rules->>'actionMax')::integer) then raise exception 'Invalid action rating for %',p_playbook; end if;
  end loop;
 end if;
 if p_patch ? 'harm' then
  if jsonb_typeof(p_patch->'harm')<>'object' then raise exception 'Invalid Harm'; end if;
  for entry in select * from jsonb_each(p_patch->'harm') loop
   expected := (rules->'harmSlots'->>entry.key)::integer;
   if expected is null or jsonb_typeof(entry.value)<>'array' or jsonb_array_length(entry.value)<>expected then raise exception 'Invalid Harm slots for %',p_playbook; end if;
   for item in select * from jsonb_array_elements(entry.value) loop
    if jsonb_typeof(item)<>'string' or length(item #>> '{}')>12000 then raise exception 'Invalid injury'; end if;
   end loop;
  end loop;
 end if;
 if p_patch ? 'abilities' then
  if jsonb_typeof(p_patch->'abilities')<>'array' or jsonb_array_length(p_patch->'abilities')>100 then raise exception 'Expected ability choices'; end if;
  for item in select * from jsonb_array_elements(p_patch->'abilities') loop
   if jsonb_typeof(item)<>'string' or not (rules->'abilities') ? (item #>> '{}') then raise exception 'Unknown % ability',p_playbook; end if;
  end loop;
 end if;
end $$;
create function bitd.validate_character_equipment_state(p_data jsonb) returns void
language plpgsql set search_path = '' as $$
declare rules jsonb; item jsonb; track text;
begin
 select p.rules into rules from bitd.character_playbooks p where name=p_data->>'playbook';
 perform bitd.validate_character_playbook_patch(p_data->>'playbook',jsonb_build_object('abilities',p_data->'abilities','actions',p_data->'actions','harm',p_data->'harm'));
 if (p_data->'wealth'->>'stacks')::integer>(rules->>'wallet')::integer or (p_data->'wealth'->>'bank')::integer>(rules->>'bank')::integer then raise exception 'Stacks or bank exceed this sheet’s capacity'; end if;
 if (p_data->'loadout'->>'carriedStacks')::integer>(p_data->'wealth'->>'stacks')::integer then raise exception 'Carried stacks cannot exceed wallet stacks'; end if;
 foreach track in array array['playbook','insight','prowess','resolve'] loop
  if (p_data->'xp'->>track)::integer>(rules->>case when track='playbook' then 'playbookXp' else 'attributeXp' end)::integer then raise exception 'XP exceeds this track’s capacity'; end if;
 end loop;
 if p_data->'armor'->>'kind'='built-in' and not (rules->>'builtInArmor')::boolean then raise exception 'Built-in Armor requires the verified playbook exception'; end if;
 if p_data->'armor'->>'kind'='light' and length(trim(p_data->'armor'->>'source'))=0 then raise exception 'Light Armor requires an Acquire Asset or invention source'; end if;
 if p_data->'armor'->>'kind'='none' and (p_data->'armor'->>'worn')::boolean then raise exception 'Choose available Armor before wearing it'; end if;
 for item in select * from jsonb_array_elements(p_data->'resources') loop
  if p_data->>'playbook'='Hound' and lower(trim(item->>'name'))='tenacity' then
   if (item->>'capacity')::integer<>2 then raise exception 'Hound Tenacity has two uses'; end if;
   if (item->>'used')::integer>0 and not (p_data->'abilities') ? 'Dogged Persistence' then raise exception 'Tenacity use requires Dogged Persistence'; end if;
  end if;
 end loop;
end $$;
create function bitd.check_character_equipment() returns trigger
language plpgsql set search_path = '' as $$
begin perform bitd.validate_character_equipment_state(new.data); return new; end $$;
create trigger character_equipment_check before insert or update on bitd.characters for each row execute function bitd.check_character_equipment();
create or replace function bitd.patch_character(p_character uuid,p_patch jsonb) returns bitd.characters
language plpgsql security definer set search_path = '' as $$
declare result bitd.characters; merged jsonb; field text;
begin
 select * into result from bitd.characters where id=p_character for update;
 if not found or bitd.campaign_role(result.campaign_id) is null or (bitd.campaign_role(result.campaign_id)<>'gm' and result.owner_id is distinct from auth.uid()) then raise exception 'Character edit not permitted' using errcode='42501'; end if;
 perform bitd.validate_character_patch(p_patch);
 perform bitd.validate_character_playbook_patch(result.data->>'playbook',p_patch);
 merged := result.data || p_patch;
 foreach field in array array['actions','pet','harm','healing','loadout','armor','wealth','xp'] loop
  if p_patch ? field then merged := jsonb_set(merged,array[field],coalesce(result.data->field,'{}'::jsonb) || (p_patch->field)); end if;
 end loop;
 update bitd.characters set data=merged,updated_at=clock_timestamp() where id=p_character returning * into result;
 return result;
end $$;
revoke all on function bitd.character_record_integer(jsonb,integer),bitd.validate_character_patch(jsonb),bitd.validate_character_pre_equipment_patch(jsonb),bitd.validate_character_playbook_patch(text,jsonb),bitd.validate_character_equipment_state(jsonb),bitd.check_character_equipment() from public,anon,authenticated;
