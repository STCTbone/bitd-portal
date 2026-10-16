-- Clock contents are never published to a changefeed or participant broadcast.
-- Clients replace permitted RLS snapshots, including after unsharing/deletion.
alter table bitd.clocks add column revision bigint not null default 1;
create policy clock_authorized_read on bitd.clocks for select to authenticated
  using (bitd.campaign_role(campaign_id) = 'gm' or
    (bitd.campaign_role(campaign_id) = 'player' and data -> 'visible_to_players' = 'true'::jsonb));
do $$ begin
  if exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='bitd' and tablename='clocks') then
    alter publication supabase_realtime drop table bitd.clocks;
  end if;
end $$;

create function bitd.validate_clock_patch(p_patch jsonb) returns void
language plpgsql set search_path = '' as $$
declare field text; value jsonb;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'Clock changes must be an object'; end if;
  for field,value in select * from jsonb_each(p_patch) loop
    if field in ('name','notes') then
      if jsonb_typeof(value) <> 'string' or length(value #>> '{}') > (case when field='name' then 100 else 5000 end) then raise exception 'Invalid clock text: %',field; end if;
      if field='name' and length(trim(value #>> '{}'))=0 then raise exception 'Enter a clock name'; end if;
    elsif field='segments' then
      if jsonb_typeof(value)<>'number' or (value #>> '{}') not in ('4','6','8','10','12') then raise exception 'Choose 4, 6, 8, 10 or 12 segments'; end if;
    elsif field='progress' then
      if jsonb_typeof(value)<>'number' or (value #>> '{}') !~ '^[0-9]{1,2}$' or (value #>> '{}')::integer>12 then raise exception 'Enter whole clock progress from 0 to its size'; end if;
    elsif field in ('active','visible_to_players') then
      if jsonb_typeof(value)<>'boolean' then raise exception 'Invalid clock switch: %',field; end if;
    elsif field='scope' then
      if jsonb_typeof(value)<>'string' or (value #>> '{}') not in ('campaign','score') then raise exception 'Choose campaign or score scope'; end if;
    elsif field='scoreId' then
      if value <> 'null'::jsonb and (jsonb_typeof(value)<>'string' or (value #>> '{}') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') then raise exception 'Invalid score reference'; end if;
    else raise exception 'Unsupported clock field: %',field;
    end if;
  end loop;
end $$;
revoke all on function bitd.validate_clock_patch(jsonb) from public;

create function bitd.validate_clock_record(p_campaign uuid,p_data jsonb) returns void
language plpgsql set search_path = '' as $$
begin
  perform bitd.validate_clock_patch(p_data);
  if (p_data->>'progress')::integer > (p_data->>'segments')::integer then raise exception 'Progress cannot exceed clock segments'; end if;
  if p_data->'scoreId' <> 'null'::jsonb then
    if p_data->>'scope' <> 'score' or not exists(select 1 from bitd.scores where id=(p_data->>'scoreId')::uuid and campaign_id=p_campaign) then raise exception 'Score must belong to this campaign and use score scope'; end if;
  end if;
end $$;
revoke all on function bitd.validate_clock_record(uuid,jsonb) from public;

create function bitd.create_clock(p_campaign uuid,p_data jsonb) returns bitd.clocks
language plpgsql security definer set search_path = '' as $$
declare result bitd.clocks; fields jsonb;
begin
  if bitd.campaign_role(p_campaign) is distinct from 'gm' then raise exception 'GM membership required' using errcode='42501'; end if;
  perform bitd.validate_clock_patch(p_data);
  fields := jsonb_build_object('name','','notes','','segments',4,'progress',0,'scope','campaign','active',true,'visible_to_players',false,'scoreId',null) || p_data;
  perform bitd.validate_clock_record(p_campaign,fields);
  insert into bitd.clocks(campaign_id,data) values(p_campaign,fields) returning * into result;
  return result;
end $$;

create function bitd.update_clock(p_clock uuid,p_patch jsonb,p_expected jsonb) returns bitd.clocks
language plpgsql security definer set search_path = '' as $$
declare result bitd.clocks; field text; fields jsonb;
begin
  select * into result from bitd.clocks where id=p_clock for update;
  -- Unknown and unauthorized IDs have the same response and reveal no metadata.
  if not found or bitd.campaign_role(result.campaign_id) is distinct from 'gm' then raise exception 'GM membership required' using errcode='42501'; end if;
  perform bitd.validate_clock_patch(p_patch);
  if p_expected is null or jsonb_typeof(p_expected)<>'object' or
    (select count(*) from jsonb_object_keys(p_patch)) <> (select count(*) from jsonb_object_keys(p_expected)) then raise exception 'Previous clock values must match changed fields'; end if;
  for field in select jsonb_object_keys(p_patch) loop
    if not (p_expected ? field) or result.data->field is distinct from p_expected->field then raise exception 'Clock changed elsewhere. Reload before retrying.' using errcode='40001'; end if;
  end loop;
  fields := result.data || p_patch;
  perform bitd.validate_clock_record(result.campaign_id,fields);
  if p_patch='{}'::jsonb then return result; end if;
  update bitd.clocks set data=fields,revision=revision+1,updated_at=clock_timestamp() where id=result.id returning * into result;
  return result;
end $$;

create function bitd.delete_clock(p_clock uuid,p_revision bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare result bitd.clocks;
begin
  select * into result from bitd.clocks where id=p_clock for update;
  if not found or bitd.campaign_role(result.campaign_id) is distinct from 'gm' then raise exception 'GM membership required' using errcode='42501'; end if;
  if p_revision is distinct from result.revision then raise exception 'Clock changed elsewhere. Reload before removing it.' using errcode='40001'; end if;
  delete from bitd.clocks where id=result.id;
end $$;
revoke all on function bitd.create_clock(uuid,jsonb),bitd.update_clock(uuid,jsonb,jsonb),bitd.delete_clock(uuid,bigint) from public;
grant execute on function bitd.create_clock(uuid,jsonb),bitd.update_clock(uuid,jsonb,jsonb),bitd.delete_clock(uuid,bigint) to authenticated;
