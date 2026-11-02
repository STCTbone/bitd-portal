-- Common Blades ’68 crew dossier. Direct writes stay revoked; all management
-- authenticates current GM membership and validates explicit mutable fields.
alter table bitd.crews add column revision bigint not null default 1;
create unique index crews_one_per_campaign on bitd.crews(campaign_id);
create policy crew_member_read on bitd.crews for select to authenticated
  using (bitd.campaign_role(campaign_id) is not null);

create function bitd.validate_crew_patch(p_patch jsonb) returns void
language plpgsql set search_path = '' as $$
declare field text; value jsonb; limit_value integer;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'Crew changes must be an object'; end if;
  for field, value in select * from jsonb_each(p_patch) loop
    if field in ('name','reputation','base','baseDistrict','flair','huntingGrounds','preferredOperations','wardBoss','titheNotes','advancementNotes') then
      if jsonb_typeof(value) <> 'string' or length(value #>> '{}') > (case when field = 'name' then 100 else 5000 end) then
        raise exception 'Invalid crew text: %', field;
      end if;
      if field = 'name' and length(trim(value #>> '{}')) = 0 then raise exception 'Enter a crew name'; end if;
    elsif field = 'type' then
      if jsonb_typeof(value) <> 'string' or (value #>> '{}') not in ('Dealers','Hit Squad','Militants','Racers','Shadows','Utopians') then raise exception 'Choose a Blades ’68 crew type'; end if;
    elsif field = 'hold' then
      if jsonb_typeof(value) <> 'string' or (value #>> '{}') not in ('weak','strong') then raise exception 'Choose weak or strong Hold'; end if;
    elsif field in ('tier','rep','turf','heat','wanted','stacks','vaults','xp','advances','anger') then
      limit_value := case field when 'rep' then 12 when 'turf' then 12 when 'heat' then 9 when 'wanted' then 4 when 'vaults' then 2 when 'xp' then 10 when 'anger' then 4 when 'tier' then 99 else 9999 end;
      if jsonb_typeof(value) <> 'number' or (value #>> '{}') !~ '^[0-9]{1,6}$' then raise exception 'Enter a whole nonnegative number: %', field; end if;
      if (value #>> '{}')::integer > limit_value then raise exception 'Crew value exceeds track: %', field; end if;
    else raise exception 'Unsupported crew field: %', field;
    end if;
  end loop;
end $$;
revoke all on function bitd.validate_crew_patch(jsonb) from public;

create function bitd.create_crew(p_campaign uuid, p_name text, p_type text) returns bitd.crews
language plpgsql security definer set search_path = '' as $$
declare result bitd.crews; fields jsonb;
begin
  if bitd.campaign_role(p_campaign) is distinct from 'gm' then raise exception 'GM membership required' using errcode='42501'; end if;
  fields := jsonb_build_object('name',trim(p_name),'type',p_type,'reputation','','tier',0,'hold','strong','rep',0,'turf',0,'heat',0,'wanted',0,'stacks',2,'vaults',0,'xp',0,'advances',0,'base','','baseDistrict','','flair','','huntingGrounds','','preferredOperations','','wardBoss','','anger',0,'titheNotes','','advancementNotes','');
  perform bitd.validate_crew_patch(fields);
  insert into bitd.crews(campaign_id,data) values(p_campaign,fields) returning * into result;
  return result;
end $$;

-- Compare only edited fields, then merge under a row lock. Different-field edits
-- commute; a stale same-field edit visibly fails rather than silently overwrites.
create function bitd.update_crew(p_campaign uuid, p_patch jsonb, p_expected jsonb) returns bitd.crews
language plpgsql security definer set search_path = '' as $$
declare result bitd.crews; field text;
begin
  if bitd.campaign_role(p_campaign) is distinct from 'gm' then raise exception 'GM membership required' using errcode='42501'; end if;
  perform bitd.validate_crew_patch(p_patch);
  if p_expected is null or jsonb_typeof(p_expected) <> 'object' then raise exception 'Previous crew values required'; end if;
  if (select count(*) from jsonb_object_keys(p_patch)) <> (select count(*) from jsonb_object_keys(p_expected)) then raise exception 'Previous crew values must match changed fields'; end if;
  select * into result from bitd.crews where campaign_id=p_campaign for update;
  if not found then raise exception 'Crew not found'; end if;
  for field in select jsonb_object_keys(p_patch) loop
    if not (p_expected ? field) or result.data -> field is distinct from p_expected -> field then
      raise exception 'Crew changed elsewhere. Reload the latest crew before retrying.' using errcode='40001';
    end if;
  end loop;
  if p_patch = '{}'::jsonb then return result; end if;
  update bitd.crews set data=data || p_patch, revision=revision+1, updated_at=clock_timestamp()
    where id=result.id returning * into result;
  return result;
end $$;
revoke all on function bitd.create_crew(uuid,text,text),bitd.update_crew(uuid,jsonb,jsonb) from public;
grant execute on function bitd.create_crew(uuid,text,text),bitd.update_crew(uuid,jsonb,jsonb) to authenticated;
