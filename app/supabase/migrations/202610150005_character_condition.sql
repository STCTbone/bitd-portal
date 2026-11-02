-- Additive validation contract: delegate all fields not owned by this slice.
alter function bitd.validate_character_patch(jsonb) rename to validate_character_identity_patch;
create function bitd.character_condition_defaults(p_playbook text) returns jsonb
language sql immutable set search_path = '' as $$
 select '{"stress":0,"stressCapacity":9,"keyCapacity":4,"keyCapacityReason":"Published baseline","keys":[],"deadlocks":[],"harm":{"passing":["",""],"major":["",""],"critical":[""],"mortal":[""]},"healing":{"progress":0,"permanent":0},"recoveryNotes":"","conditionNotes":""}'::jsonb
$$;
create function bitd.initialize_character_condition() returns trigger
language plpgsql set search_path = '' as $$
begin new.data := bitd.character_condition_defaults(new.data->>'playbook') || new.data; return new; end $$;
create trigger character_01_condition_defaults before insert on bitd.characters for each row execute function bitd.initialize_character_condition();
update bitd.characters set data = bitd.character_condition_defaults(data->>'playbook') || data;

create function bitd.validate_character_patch(p_patch jsonb) returns void
language plpgsql set search_path = '' as $$
declare entry record; nested record; item jsonb; expected integer;
begin
 perform bitd.validate_character_identity_patch(p_patch - array['stress','keys','deadlocks','harm','healing','recoveryNotes','conditionNotes']);
 for entry in select * from jsonb_each(p_patch) loop
  if entry.key = 'stress' then
   if jsonb_typeof(entry.value) <> 'number' or (entry.value #>> '{}') !~ '^[0-9]+$' or (entry.value #>> '{}')::numeric > 100 then raise exception 'Invalid Stress'; end if;
  elsif entry.key = any(array['conditionNotes','recoveryNotes']) then
   if jsonb_typeof(entry.value) <> 'string' or length(entry.value #>> '{}') > 12000 then raise exception 'Invalid condition notes'; end if;
  elsif entry.key = any(array['keys','deadlocks']) then
   if jsonb_typeof(entry.value) <> 'array' or jsonb_array_length(entry.value) > 5 then raise exception 'Invalid Key/Deadlock records'; end if;
   for item in select * from jsonb_array_elements(entry.value) loop
    if jsonb_typeof(item) <> 'object' or not item ? 'name' or (entry.key = 'keys' and not item ? 'hits') then raise exception 'Incomplete Key/Deadlock'; end if;
    for nested in select * from jsonb_each(item) loop
     if entry.key = 'keys' and nested.key = 'hits' then
      if jsonb_typeof(nested.value) <> 'number' or (nested.value #>> '{}') !~ '^[0-3]$' then raise exception 'Key hits must be 0–3'; end if;
     elsif (entry.key = 'keys' and nested.key = 'name') or (entry.key = 'deadlocks' and nested.key = any(array['name','formerKey','notes'])) then
      if jsonb_typeof(nested.value) <> 'string' or length(nested.value #>> '{}') > 12000 then raise exception 'Invalid Key/Deadlock text'; end if;
     else raise exception 'Unknown Key/Deadlock field'; end if;
    end loop;
   end loop;
  elsif entry.key = 'harm' then
   if jsonb_typeof(entry.value) <> 'object' then raise exception 'Invalid Harm'; end if;
   for nested in select * from jsonb_each(entry.value) loop
    expected := case nested.key when 'passing' then 2 when 'major' then 2 when 'critical' then 1 when 'mortal' then 1 else null end;
    if expected is null or jsonb_typeof(nested.value) <> 'array' or jsonb_array_length(nested.value) <> expected then raise exception 'Invalid Harm slots'; end if;
    for item in select * from jsonb_array_elements(nested.value) loop
     if jsonb_typeof(item) <> 'string' or length(item #>> '{}') > 12000 then raise exception 'Invalid injury'; end if;
    end loop;
   end loop;
  elsif entry.key = 'healing' then
   if jsonb_typeof(entry.value) <> 'object' then raise exception 'Invalid healing clock'; end if;
   for nested in select * from jsonb_each(entry.value) loop
    if nested.key = 'progress' then
     if jsonb_typeof(nested.value) <> 'number' or (nested.value #>> '{}') !~ '^[0-4]$' then raise exception 'Healing progress must be 0–4'; end if;
    elsif nested.key = 'permanent' then
     if jsonb_typeof(nested.value) <> 'number' or (nested.value #>> '{}') !~ '^[0-1]$' then raise exception 'Permanent healing segments must be 0–1'; end if;
    else raise exception 'Unknown healing clock field'; end if;
   end loop;
  end if;
 end loop;
end $$;
create function bitd.validate_character_condition_state(p_data jsonb) returns void
language plpgsql set search_path = '' as $$
begin
 if (p_data->>'stress')::integer > (p_data->>'stressCapacity')::integer then raise exception 'Stress exceeds this sheet’s capacity'; end if;
 if jsonb_array_length(p_data->'keys') + jsonb_array_length(p_data->'deadlocks') > (p_data->>'keyCapacity')::integer then raise exception 'Keys and Deadlocks share this sheet’s capacity'; end if;
 if (p_data->'healing'->>'progress')::integer + (p_data->'healing'->>'permanent')::integer > 4 then raise exception 'Healing clock has four segments including permanent marks'; end if;
 if (p_data->'healing'->>'permanent')::integer > 0 and not (
  (p_data->'abilities') ? 'Get Back In There' or (
   (p_data->'abilities') ? 'Versatile' and exists(select 1 from jsonb_array_elements(p_data->'versatile') v where v->>'name' = 'Get Back In There' and length(trim(coalesce(v->>'source',''))) > 0)
  )
 ) then raise exception 'Permanent segment requires Get Back In There; record its ability source'; end if;
end $$;
create function bitd.check_character_condition() returns trigger
language plpgsql set search_path = '' as $$
begin perform bitd.validate_character_condition_state(new.data); return new; end $$;
create trigger character_condition_check before insert or update on bitd.characters for each row execute function bitd.check_character_condition();
create or replace function bitd.patch_character(p_character uuid, p_patch jsonb) returns bitd.characters
language plpgsql security definer set search_path = '' as $$
declare result bitd.characters; merged jsonb; field text;
begin
 select * into result from bitd.characters where id = p_character for update;
 if not found or bitd.campaign_role(result.campaign_id) is null or
  (bitd.campaign_role(result.campaign_id) <> 'gm' and result.owner_id is distinct from auth.uid()) then raise exception 'Character edit not permitted' using errcode = '42501'; end if;
 perform bitd.validate_character_patch(p_patch);
 merged := result.data || p_patch;
 foreach field in array array['actions','pet','harm','healing'] loop
  if p_patch ? field then merged := jsonb_set(merged, array[field], coalesce(result.data->field,'{}'::jsonb) || (p_patch->field)); end if;
 end loop;
 update bitd.characters set data = merged, updated_at = clock_timestamp() where id = p_character returning * into result;
 return result;
end $$;
create function bitd.set_character_key_capacity(p_character uuid, p_capacity integer, p_reason text) returns bitd.characters
language plpgsql security definer set search_path = '' as $$
declare result bitd.characters;
begin
 select * into result from bitd.characters where id = p_character for update;
 if not found or bitd.campaign_role(result.campaign_id) is distinct from 'gm' then raise exception 'GM authority required' using errcode = '42501'; end if;
 if p_capacity is null or p_capacity not in (4,5) or p_reason is null or length(trim(p_reason)) not between 1 and 1000 then raise exception 'Use baseline four or crew-upgrade five slots and record the source'; end if;
 update bitd.characters set data = data || jsonb_build_object('keyCapacity',p_capacity,'keyCapacityReason',trim(p_reason)), updated_at = clock_timestamp() where id = p_character returning * into result;
 return result;
end $$;
revoke all on function bitd.character_condition_defaults(text), bitd.initialize_character_condition(), bitd.validate_character_patch(jsonb), bitd.validate_character_condition_state(jsonb), bitd.check_character_condition(), bitd.set_character_key_capacity(uuid,integer,text) from public;
grant execute on function bitd.set_character_key_capacity(uuid,integer,text) to authenticated;
