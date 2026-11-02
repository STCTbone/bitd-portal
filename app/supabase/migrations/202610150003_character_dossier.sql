-- Character metadata belongs to the server; only explicit dossier fields are editable.
create policy character_campaign_read on bitd.characters for select to authenticated
  using (bitd.campaign_role(campaign_id) is not null);

create function bitd.validate_character_patch(p_patch jsonb) returns void
language plpgsql set search_path = '' as $$
declare entry record; nested record; item jsonb;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'Expected dossier fields'; end if;
  for entry in select * from jsonb_each(p_patch) loop
    if entry.key = any(array['name','alias','playerName','look','wearing','heritage','heritageDetails','background','backgroundDetails','vice','viceHookup','notes','abilityNotes']) then
      if jsonb_typeof(entry.value) <> 'string' or length(entry.value #>> '{}') > 12000 then raise exception 'Invalid text field: %', entry.key; end if;
      if entry.key = 'name' and length(trim(entry.value #>> '{}')) not between 1 and 100 then raise exception 'Enter a character name (1–100 characters)'; end if;
    elsif entry.key = 'actions' then
      if jsonb_typeof(entry.value) <> 'object' then raise exception 'Expected action ratings'; end if;
      for nested in select * from jsonb_each(entry.value) loop
        if not nested.key = any(array['hunt','study','survey','tinker','finesse','prowl','skirmish','wreck','attune','command','consort','sway']) or
          jsonb_typeof(nested.value) <> 'number' or (nested.value #>> '{}') !~ '^[0-4]$' then raise exception 'Invalid action rating'; end if;
      end loop;
    elsif entry.key = 'abilities' then
      if jsonb_typeof(entry.value) <> 'array' or jsonb_array_length(entry.value) > 8 then raise exception 'Expected Hound ability choices'; end if;
      for item in select * from jsonb_array_elements(entry.value) loop
        if jsonb_typeof(item) <> 'string' or not (item #>> '{}') = any(array['Hound’s Instincts','Learn the Hard Way','Just a Scratch','Fixer','In Too Deep','Echo Pet','Dogged Persistence','Versatile']) then raise exception 'Unknown Hound ability'; end if;
      end loop;
    elsif entry.key = 'echoPet' then
      if jsonb_typeof(entry.value) <> 'array' or jsonb_array_length(entry.value) > 3 then raise exception 'Expected Echo Pet choices'; end if;
      for item in select * from jsonb_array_elements(entry.value) loop
        if jsonb_typeof(item) <> 'string' or not (item #>> '{}') = any(array['time-glitching','mind-link','mirror-field']) then raise exception 'Unknown Echo Pet choice'; end if;
      end loop;
    elsif entry.key = 'pet' then
      if jsonb_typeof(entry.value) <> 'object' then raise exception 'Expected pet record'; end if;
      for nested in select * from jsonb_each(entry.value) loop
        if nested.key = any(array['name','kind','edges','flaws','abilities','notes']) then
          if jsonb_typeof(nested.value) <> 'string' or length(nested.value #>> '{}') > 12000 then raise exception 'Invalid pet text'; end if;
        elsif nested.key = any(array['weak','impaired','broken','armor']) then
          if jsonb_typeof(nested.value) <> 'boolean' then raise exception 'Invalid pet condition'; end if;
        else raise exception 'Unknown pet field: %', nested.key;
        end if;
      end loop;
    elsif entry.key = any(array['relationships','versatile']) then
      if jsonb_typeof(entry.value) <> 'array' or jsonb_array_length(entry.value) > 100 then raise exception 'Expected a list of records'; end if;
      for item in select * from jsonb_array_elements(entry.value) loop
        if jsonb_typeof(item) <> 'object' then raise exception 'Invalid list record'; end if;
        for nested in select * from jsonb_each(item) loop
          if (entry.key = 'relationships' and not nested.key = any(array['name','relationship','notes'])) or
            (entry.key = 'versatile' and not nested.key = any(array['name','source','notes'])) or
            jsonb_typeof(nested.value) <> 'string' or length(nested.value #>> '{}') > 12000 then raise exception 'Invalid list field'; end if;
        end loop;
      end loop;
    else raise exception 'Unknown or protected dossier field: %', entry.key using errcode = '42501';
    end if;
  end loop;
end $$;

create function bitd.create_character(p_campaign uuid, p_name text, p_unclaimed boolean default false) returns bitd.characters
language plpgsql security definer set search_path = '' as $$
declare result bitd.characters; member_role text;
begin
  member_role := bitd.campaign_role(p_campaign);
  if member_role is null or (p_unclaimed is true and member_role <> 'gm') then raise exception 'Campaign membership and authorized ownership required' using errcode = '42501'; end if;
  perform bitd.validate_character_patch(jsonb_build_object('name', p_name));
  insert into bitd.characters(campaign_id, owner_id, data) values (
    p_campaign, case when p_unclaimed is true then null else auth.uid() end,
    jsonb_build_object('name', trim(p_name), 'playbook', 'Hound', 'alias', '', 'playerName', '', 'look', '', 'wearing', '', 'heritage', '', 'heritageDetails', '', 'background', '', 'backgroundDetails', '', 'vice', '', 'viceHookup', '', 'notes', '', 'abilityNotes', '',
      'actions', '{"hunt":0,"study":0,"survey":1,"tinker":0,"finesse":0,"prowl":0,"skirmish":0,"wreck":0,"attune":0,"command":0,"consort":2,"sway":0}'::jsonb,
      'abilities', '[]'::jsonb, 'echoPet', '[]'::jsonb, 'versatile', '[]'::jsonb, 'relationships', '[]'::jsonb,
      'pet', '{"name":"","kind":"","edges":"","flaws":"","abilities":"","notes":"","weak":false,"impaired":false,"broken":false,"armor":false}'::jsonb)
  ) returning * into result;
  return result;
end $$;

create function bitd.patch_character(p_character uuid, p_patch jsonb) returns bitd.characters
language plpgsql security definer set search_path = '' as $$
declare result bitd.characters; merged jsonb;
begin
  select * into result from bitd.characters where id = p_character for update;
  if not found or bitd.campaign_role(result.campaign_id) is null or
    (bitd.campaign_role(result.campaign_id) <> 'gm' and result.owner_id is distinct from auth.uid()) then raise exception 'Character edit not permitted' using errcode = '42501'; end if;
  perform bitd.validate_character_patch(p_patch);
  -- Merge nested fields at the locked current row, preserving concurrent distinct edits.
  merged := result.data || p_patch;
  if p_patch ? 'actions' then merged := jsonb_set(merged, '{actions}', coalesce(result.data->'actions','{}'::jsonb) || (p_patch->'actions')); end if;
  if p_patch ? 'pet' then merged := jsonb_set(merged, '{pet}', coalesce(result.data->'pet','{}'::jsonb) || (p_patch->'pet')); end if;
  update bitd.characters set data = merged, updated_at = clock_timestamp() where id = p_character returning * into result;
  return result;
end $$;

create function bitd.claim_character(p_character uuid) returns bitd.characters
language plpgsql security definer set search_path = '' as $$
declare result bitd.characters;
begin
  select * into result from bitd.characters where id = p_character for update;
  if not found or bitd.campaign_role(result.campaign_id) is null or
    (result.owner_id is not null and result.owner_id is distinct from auth.uid()) then raise exception 'Character claim not permitted' using errcode = '42501'; end if;
  update bitd.characters set owner_id = auth.uid(), updated_at = clock_timestamp() where id = p_character returning * into result;
  return result;
end $$;

create function bitd.delete_character(p_character uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare result bitd.characters;
begin
  select * into result from bitd.characters where id = p_character for update;
  if not found or bitd.campaign_role(result.campaign_id) is null or
    (bitd.campaign_role(result.campaign_id) <> 'gm' and result.owner_id is distinct from auth.uid()) then raise exception 'Character deletion not permitted' using errcode = '42501'; end if;
  delete from bitd.characters where id = p_character;
end $$;
revoke all on function bitd.validate_character_patch(jsonb), bitd.create_character(uuid,text,boolean), bitd.patch_character(uuid,jsonb), bitd.claim_character(uuid), bitd.delete_character(uuid) from public;
grant execute on function bitd.create_character(uuid,text,boolean), bitd.patch_character(uuid,jsonb), bitd.claim_character(uuid), bitd.delete_character(uuid) to authenticated;
