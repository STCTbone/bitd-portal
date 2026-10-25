-- Shared campaign reference. No raw row/changefeed or legacy broadcast transport.
alter table bitd.codex add column revision bigint not null default 1;
create policy shared_note_member_read on bitd.codex for select to authenticated
  using (bitd.campaign_role(campaign_id) is not null);
do $$ begin
  if exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='bitd' and tablename='codex') then
    alter publication supabase_realtime drop table bitd.codex;
  end if;
end $$;

create function bitd.validate_shared_note_patch(p_patch jsonb) returns void
language plpgsql set search_path = '' as $$
declare field text; value jsonb;
begin
  if p_patch is null or jsonb_typeof(p_patch)<>'object' then raise exception 'Note changes must be an object'; end if;
  for field,value in select * from jsonb_each(p_patch) loop
    if field in ('title','body') then
      if jsonb_typeof(value)<>'string' or length(value #>> '{}') > (case when field='title' then 120 else 20000 end) then raise exception 'Invalid note text: %',field; end if;
      if field='title' and (value #>> '{}') !~ '[^[:space:]]' then raise exception 'Enter a note title'; end if;
    elsif field='category' then
      if jsonb_typeof(value)<>'string' or (value #>> '{}') not in ('people','places','items','factions','lore') then raise exception 'Choose people, places, items, factions or lore'; end if;
    else raise exception 'Unsupported note field: %',field;
    end if;
  end loop;
end $$;
revoke all on function bitd.validate_shared_note_patch(jsonb) from public;

create function bitd.create_shared_note(p_campaign uuid,p_data jsonb) returns bitd.codex
language plpgsql security definer set search_path = '' as $$
declare result bitd.codex; fields jsonb;
begin
  if bitd.campaign_role(p_campaign) is null then raise exception 'Campaign membership required' using errcode='42501'; end if;
  perform bitd.validate_shared_note_patch(p_data);
  fields := jsonb_build_object('title','','body','','category','lore') || p_data;
  perform bitd.validate_shared_note_patch(fields);
  insert into bitd.codex(campaign_id,data) values(p_campaign,fields) returning * into result;
  return result;
end $$;

create function bitd.update_shared_note(p_note uuid,p_patch jsonb,p_expected jsonb) returns bitd.codex
language plpgsql security definer set search_path = '' as $$
declare result bitd.codex; field text;
begin
  select * into result from bitd.codex where id=p_note for update;
  if not found or bitd.campaign_role(result.campaign_id) is null then raise exception 'Campaign membership required' using errcode='42501'; end if;
  perform bitd.validate_shared_note_patch(p_patch);
  if p_expected is null or jsonb_typeof(p_expected)<>'object' or
    (select count(*) from jsonb_object_keys(p_patch)) <> (select count(*) from jsonb_object_keys(p_expected)) then raise exception 'Previous note values must match changed fields'; end if;
  for field in select jsonb_object_keys(p_patch) loop
    if not (p_expected ? field) or result.data->field is distinct from p_expected->field then raise exception 'Note changed elsewhere. Reload before retrying.' using errcode='40001'; end if;
  end loop;
  if p_patch='{}'::jsonb then return result; end if;
  update bitd.codex set data=data||p_patch,revision=revision+1,updated_at=clock_timestamp() where id=result.id returning * into result;
  return result;
end $$;

create function bitd.delete_shared_note(p_note uuid,p_revision bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare result bitd.codex;
begin
  select * into result from bitd.codex where id=p_note for update;
  if not found or bitd.campaign_role(result.campaign_id) is null then raise exception 'Campaign membership required' using errcode='42501'; end if;
  if p_revision is distinct from result.revision then raise exception 'Note changed elsewhere. Reload before removing it.' using errcode='40001'; end if;
  delete from bitd.codex where id=result.id;
end $$;
revoke all on function bitd.create_shared_note(uuid,jsonb),bitd.update_shared_note(uuid,jsonb,jsonb),bitd.delete_shared_note(uuid,bigint) from public;
grant execute on function bitd.create_shared_note(uuid,jsonb),bitd.update_shared_note(uuid,jsonb,jsonb),bitd.delete_shared_note(uuid,bigint) to authenticated;
