-- Personal Business is shared recordkeeping; authority follows current character ownership.
create table bitd.personal_business (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references bitd.campaigns on delete cascade,
  character_id uuid not null references bitd.characters on delete cascade,
  data jsonb not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default clock_timestamp()
);
alter table bitd.personal_business enable row level security;
grant select on bitd.personal_business to authenticated;
create policy personal_business_member_read on bitd.personal_business for select to authenticated using (bitd.campaign_role(campaign_id) is not null);

create function bitd.validate_personal_business(p_patch jsonb) returns void
language plpgsql set search_path = '' as $$
declare field text; value jsonb;
begin
  if p_patch is null or jsonb_typeof(p_patch)<>'object' then raise exception 'Activity changes must be an object'; end if;
  for field,value in select * from jsonb_each(p_patch) loop
    if field not in ('activity','description','outcome','roll','helper','spend','finalResult','proposedEffects') then raise exception 'Unsupported activity field: %',field; end if;
    if jsonb_typeof(value)<>'string' or length(value #>> '{}')>5000 then raise exception 'Invalid activity text: %',field; end if;
    if field='activity' and value #>> '{}' not in ('Free play','Indulge Vice','Long-Term Project','Recover','Reduce Heat','Acquire Asset','Training Montage') then raise exception 'Choose a Personal Business activity'; end if;
  end loop;
end $$;

-- Expected values are captured when editing begins, never silently rebased by refresh.
create function bitd.assert_planning_expected(p_saved jsonb,p_patch jsonb,p_expected jsonb) returns void
language plpgsql set search_path = '' as $$
declare field text;
begin
  if p_expected is null or jsonb_typeof(p_expected)<>'object' or
    (select count(*) from jsonb_object_keys(p_patch))<>(select count(*) from jsonb_object_keys(p_expected)) then raise exception 'Previous values must match changed fields'; end if;
  for field in select jsonb_object_keys(p_patch) loop
    if not (p_expected ? field) or p_saved->field is distinct from p_expected->field then raise exception 'Record changed elsewhere. Reload before retrying.' using errcode='40001'; end if;
  end loop;
end $$;

create function bitd.create_personal_business(p_character uuid,p_data jsonb) returns bitd.personal_business
language plpgsql security definer set search_path = '' as $$
declare character bitd.characters; result bitd.personal_business; fields jsonb;
begin
  select * into character from bitd.characters where id=p_character for share;
  if not found or bitd.campaign_role(character.campaign_id) is null or
    (bitd.campaign_role(character.campaign_id)<>'gm' and character.owner_id is distinct from auth.uid()) then raise exception 'Character owner or GM required' using errcode='42501'; end if;
  perform bitd.validate_personal_business(p_data);
  fields:=jsonb_build_object('activity','Free play','description','','outcome','','roll','','helper','','spend','','finalResult','','proposedEffects','') || p_data;
  insert into bitd.personal_business(campaign_id,character_id,data) values(character.campaign_id,character.id,fields) returning * into result;
  return result;
end $$;
create function bitd.update_personal_business(p_record uuid,p_patch jsonb,p_expected jsonb) returns bitd.personal_business
language plpgsql security definer set search_path = '' as $$
declare result bitd.personal_business; character bitd.characters;
begin
  select * into result from bitd.personal_business where id=p_record for update;
  select * into character from bitd.characters where id=result.character_id for share;
  if result.id is null or bitd.campaign_role(result.campaign_id) is null or
    (bitd.campaign_role(result.campaign_id)<>'gm' and character.owner_id is distinct from auth.uid()) then raise exception 'Character owner or GM required' using errcode='42501'; end if;
  perform bitd.validate_personal_business(p_patch);
  perform bitd.assert_planning_expected(result.data,p_patch,p_expected);
  update bitd.personal_business set data=data||p_patch,revision=revision+1,updated_at=clock_timestamp() where id=result.id returning * into result;
  return result;
end $$;
create function bitd.delete_personal_business(p_record uuid,p_revision bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare result bitd.personal_business; character bitd.characters;
begin
  select * into result from bitd.personal_business where id=p_record for update;
  select * into character from bitd.characters where id=result.character_id for share;
  if result.id is null or bitd.campaign_role(result.campaign_id) is null or
    (bitd.campaign_role(result.campaign_id)<>'gm' and character.owner_id is distinct from auth.uid()) then raise exception 'Character owner or GM required' using errcode='42501'; end if;
  if result.revision is distinct from p_revision then raise exception 'Record changed elsewhere. Reload before removing it.' using errcode='40001'; end if;
  delete from bitd.personal_business where id=result.id;
end $$;
revoke all on function bitd.validate_personal_business(jsonb),bitd.assert_planning_expected(jsonb,jsonb,jsonb),bitd.create_personal_business(uuid,jsonb),bitd.update_personal_business(uuid,jsonb,jsonb),bitd.delete_personal_business(uuid,bigint) from public;
grant execute on function bitd.create_personal_business(uuid,jsonb),bitd.update_personal_business(uuid,jsonb,jsonb),bitd.delete_personal_business(uuid,bigint) to authenticated;

create table bitd.opportunities (
  id uuid primary key default gen_random_uuid(), campaign_id uuid not null references bitd.campaigns on delete cascade,
  owner_id uuid not null references auth.users, data jsonb not null, revision bigint not null default 1,
  updated_at timestamptz not null default clock_timestamp()
);
alter table bitd.opportunities enable row level security;
grant select on bitd.opportunities to authenticated;
create policy opportunity_member_read on bitd.opportunities for select to authenticated using (bitd.campaign_role(campaign_id) is not null);
alter table bitd.scores add column revision bigint not null default 1;
alter table bitd.scores add column opportunity_id uuid unique references bitd.opportunities;
create policy score_member_read on bitd.scores for select to authenticated using (opportunity_id is not null and bitd.campaign_role(campaign_id) is not null);
create table bitd.campaign_cycles (
  campaign_id uuid primary key references bitd.campaigns on delete cascade,
  phase text not null default 'personal_business' check (phase in ('personal_business','planning_meeting','score','aftermath')),
  selected_score_id uuid references bitd.scores,
  revision bigint not null default 1, updated_at timestamptz not null default clock_timestamp()
);
alter table bitd.campaign_cycles enable row level security;
grant select on bitd.campaign_cycles to authenticated;
create policy cycle_member_read on bitd.campaign_cycles for select to authenticated using (bitd.campaign_role(campaign_id) is not null);
insert into bitd.campaign_cycles(campaign_id) select id from bitd.campaigns;
create function bitd.initialize_campaign_cycle() returns trigger language plpgsql security definer set search_path = '' as $$
begin insert into bitd.campaign_cycles(campaign_id) values(new.id); return new; end $$;
create trigger initialize_campaign_cycle after insert on bitd.campaigns for each row execute function bitd.initialize_campaign_cycle();

create function bitd.set_campaign_phase(p_campaign uuid,p_phase text,p_revision bigint) returns bitd.campaign_cycles
language plpgsql security definer set search_path = '' as $$
declare result bitd.campaign_cycles;
begin
  if bitd.campaign_role(p_campaign) is distinct from 'gm' then raise exception 'GM membership required' using errcode='42501'; end if;
  select * into result from bitd.campaign_cycles where campaign_id=p_campaign for update;
  if result.revision is distinct from p_revision then raise exception 'Phase changed elsewhere. Reload before retrying.' using errcode='40001'; end if;
  if p_phase is null or p_phase not in ('personal_business','planning_meeting','score','aftermath') then raise exception 'Choose a campaign phase'; end if;
  update bitd.campaign_cycles set phase=p_phase,revision=revision+1,updated_at=clock_timestamp() where campaign_id=p_campaign returning * into result;
  return result;
end $$;
create function bitd.validate_opportunity(p_patch jsonb) returns void
language plpgsql set search_path = '' as $$
declare field text; value jsonb;
begin
  if p_patch is null or jsonb_typeof(p_patch)<>'object' then raise exception 'Opportunity changes must be an object'; end if;
  for field,value in select * from jsonb_each(p_patch) loop
    if field in ('client','target','operation','difficulty','payoutRoll','planningDetails') then
      if jsonb_typeof(value)<>'string' or length(value #>> '{}')>5000 then raise exception 'Invalid opportunity text: %',field; end if;
    elsif field in ('targetTier','payout') then
      if value<>'null'::jsonb and (jsonb_typeof(value)<>'number' or value #>> '{}' !~ '^[0-9]{1,4}$') then raise exception 'Enter a nonnegative whole % or leave blank',field; end if;
      if field='targetTier' and value<>'null'::jsonb and (value #>> '{}')::integer>99 then raise exception 'Target Tier must be 0–99'; end if;
    elsif field='held' then
      if jsonb_typeof(value)<>'boolean' then raise exception 'Held must be a switch'; end if;
    else raise exception 'Unsupported opportunity field: %',field;
    end if;
  end loop;
end $$;
create function bitd.assert_opportunity_sketch(p_data jsonb) returns void
language plpgsql set search_path = '' as $$
begin
  if length(trim(p_data->>'client'))=0 and length(trim(p_data->>'target'))=0 and length(trim(p_data->>'operation'))=0 then raise exception 'Enter a client, target or operation to sketch an opportunity'; end if;
end $$;
create function bitd.create_opportunity(p_campaign uuid,p_data jsonb) returns bitd.opportunities
language plpgsql security definer set search_path = '' as $$
declare result bitd.opportunities; fields jsonb; role text;
begin
  role:=bitd.campaign_role(p_campaign);
  if role is null then raise exception 'Campaign membership required' using errcode='42501'; end if;
  perform bitd.validate_opportunity(p_data);
  if role<>'gm' and p_data ?| array['targetTier','payout','difficulty','payoutRoll'] then raise exception 'GM sets Tier, difficulty and potential payout' using errcode='42501'; end if;
  fields:=jsonb_build_object('client','','target','','operation','','targetTier',null,'difficulty','','payout',null,'payoutRoll','','planningDetails','','held',false)||p_data;
  perform bitd.assert_opportunity_sketch(fields);
  insert into bitd.opportunities(campaign_id,owner_id,data) values(p_campaign,auth.uid(),fields) returning * into result;
  return result;
end $$;
create function bitd.update_opportunity(p_opportunity uuid,p_patch jsonb,p_expected jsonb) returns bitd.opportunities
language plpgsql security definer set search_path = '' as $$
declare result bitd.opportunities; role text; fields jsonb;
begin
  select * into result from bitd.opportunities where id=p_opportunity for update;
  role:=bitd.campaign_role(result.campaign_id);
  if result.id is null or role is null or (role<>'gm' and result.owner_id is distinct from auth.uid()) then raise exception 'Opportunity proposer or GM required' using errcode='42501'; end if;
  perform bitd.validate_opportunity(p_patch);
  if role<>'gm' and p_patch ?| array['targetTier','payout','difficulty','payoutRoll'] then raise exception 'GM sets Tier, difficulty and potential payout' using errcode='42501'; end if;
  perform bitd.assert_planning_expected(result.data,p_patch,p_expected);
  fields:=result.data||p_patch; perform bitd.assert_opportunity_sketch(fields);
  update bitd.opportunities set data=fields,revision=revision+1,updated_at=clock_timestamp() where id=result.id returning * into result;
  return result;
end $$;

create function bitd.select_opportunity(p_opportunity uuid,p_revision bigint,p_cycle_revision bigint) returns bitd.scores
language plpgsql security definer set search_path = '' as $$
declare opportunity bitd.opportunities; cycle bitd.campaign_cycles; result bitd.scores; campaign uuid;
begin
  select campaign_id into campaign from bitd.opportunities where id=p_opportunity;
  if bitd.campaign_role(campaign) is distinct from 'gm' then raise exception 'GM membership required' using errcode='42501'; end if;
  -- Consistent lock order: cycle then opportunity. A retry returns its original score.
  select * into cycle from bitd.campaign_cycles where campaign_id=campaign for update;
  select * into opportunity from bitd.opportunities where id=p_opportunity for update;
  select * into result from bitd.scores where opportunity_id=p_opportunity;
  if found then
    if cycle.selected_score_id=result.id then return result; end if;
    if cycle.revision is distinct from p_cycle_revision then raise exception 'Planning changed elsewhere. Reload before selecting.' using errcode='40001'; end if;
    update bitd.campaign_cycles set selected_score_id=result.id,revision=revision+1,updated_at=clock_timestamp() where campaign_id=campaign;
    return result;
  end if;
  if cycle.revision is distinct from p_cycle_revision or opportunity.revision is distinct from p_revision then raise exception 'Planning changed elsewhere. Reload before selecting.' using errcode='40001'; end if;
  if opportunity.data->'targetTier'='null'::jsonb then raise exception 'Record a target Tier before final selection'; end if;
  insert into bitd.scores(campaign_id,opportunity_id,data) values(campaign,p_opportunity,
    jsonb_build_object('name',coalesce(nullif(opportunity.data->>'operation',''),nullif(opportunity.data->>'target',''),opportunity.data->>'client'),
      'status','planned','opportunity',opportunity.data,'approach','','openingGambit','','loadout','','engagementDetails','','engagementResult','','planningNotes','')) returning * into result;
  update bitd.campaign_cycles set selected_score_id=result.id,revision=revision+1,updated_at=clock_timestamp() where campaign_id=campaign;
  return result;
end $$;
create function bitd.update_score_plan(p_score uuid,p_patch jsonb,p_expected jsonb) returns bitd.scores
language plpgsql security definer set search_path = '' as $$
declare result bitd.scores; field text; value jsonb;
begin
  select * into result from bitd.scores where id=p_score for update;
  if not found or bitd.campaign_role(result.campaign_id) is null then raise exception 'Campaign membership required' using errcode='42501'; end if;
  if p_patch is null or jsonb_typeof(p_patch)<>'object' then raise exception 'Planning changes must be an object'; end if;
  for field,value in select * from jsonb_each(p_patch) loop
    if field not in ('approach','openingGambit','loadout','engagementDetails','engagementResult','planningNotes') then raise exception 'Unsupported score planning field: %',field; end if;
    if jsonb_typeof(value)<>'string' or length(value #>> '{}')>5000 then raise exception 'Invalid planning text: %',field; end if;
    if field='approach' and value #>> '{}' not in ('','Assault','Deception','Paranormal','Social','Speed','Stealth') then raise exception 'Choose a Blades ’68 approach'; end if;
    if field='loadout' and value #>> '{}' not in ('','Quiet','Loud') then raise exception 'Choose Quiet or Loud'; end if;
  end loop;
  perform bitd.assert_planning_expected(result.data,p_patch,p_expected);
  update bitd.scores set data=data||p_patch,revision=revision+1,updated_at=clock_timestamp() where id=result.id returning * into result;
  return result;
end $$;
revoke all on function bitd.initialize_campaign_cycle(),bitd.set_campaign_phase(uuid,text,bigint),bitd.validate_opportunity(jsonb),bitd.assert_opportunity_sketch(jsonb),bitd.create_opportunity(uuid,jsonb),bitd.update_opportunity(uuid,jsonb,jsonb),bitd.select_opportunity(uuid,bigint,bigint),bitd.update_score_plan(uuid,jsonb,jsonb) from public;
grant execute on function bitd.set_campaign_phase(uuid,text,bigint),bitd.create_opportunity(uuid,jsonb),bitd.update_opportunity(uuid,jsonb,jsonb),bitd.select_opportunity(uuid,bigint,bigint),bitd.update_score_plan(uuid,jsonb,jsonb) to authenticated;
