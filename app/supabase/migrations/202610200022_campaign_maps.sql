-- Durable state is changed only by authenticated, narrow server operations.
create table bitd.campaign_maps (
  campaign_id uuid primary key references bitd.campaigns on delete cascade,
  asset_id uuid references bitd.campaign_assets,
  revision bigint not null default 1
);
alter table bitd.campaign_maps enable row level security;
grant select on bitd.campaign_maps to authenticated;
grant all on bitd.campaign_maps to service_role;
create policy map_member_read on bitd.campaign_maps for select to authenticated using (bitd.campaign_role(campaign_id) is not null);
alter table bitd.map_tokens drop column data, drop column owner_id;
alter table bitd.map_tokens
  add column label text not null check (length(trim(label)) between 1 and 80),
  add column character_id uuid references bitd.characters on delete cascade,
  add column controller_id uuid references auth.users on delete set null,
  add column x double precision not null default 50 check (x between 0 and 100),
  add column y double precision not null default 50 check (y between 0 and 100),
  add column revision bigint not null default 1,
  add constraint token_single_authority check (character_id is null or controller_id is null);
create policy token_member_read on bitd.map_tokens for select to authenticated using (bitd.campaign_role(campaign_id) is not null);
create function bitd.get_map_state(p_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare member_role text := bitd.campaign_role(p_campaign);
begin
  if member_role is null then raise exception 'Campaign membership required' using errcode = '42501'; end if;
  return jsonb_build_object('role', member_role,
    'map', (select to_jsonb(m) from bitd.campaign_maps m where campaign_id = p_campaign),
    'tokens', coalesce((select jsonb_agg(to_jsonb(t) || jsonb_build_object('can_move', member_role = 'gm' or coalesce(t.controller_id = auth.uid(),false) or exists(select 1 from bitd.characters c where c.id = t.character_id and c.owner_id = auth.uid()))) from bitd.map_tokens t where t.campaign_id = p_campaign), '[]'::jsonb));
end $$;
create function bitd.set_campaign_map(p_campaign uuid,p_asset uuid,p_revision bigint) returns bitd.campaign_maps
language plpgsql security definer set search_path = '' as $$
declare result bitd.campaign_maps;
begin
  if bitd.campaign_role(p_campaign) is distinct from 'gm' then raise exception 'GM membership required' using errcode = '42501'; end if;
  perform 1 from bitd.campaigns where id = p_campaign for update;
  if p_asset is not null then
    perform 1 from bitd.campaign_assets where id = p_asset for share;
    if not bitd.can_use_map_asset(p_campaign,p_asset) then raise exception 'Choose a ready shared campaign image' using errcode = '22023'; end if;
  end if;
  select * into result from bitd.campaign_maps where campaign_id = p_campaign;
  if coalesce(result.revision,0) is distinct from p_revision then raise exception 'Map changed. Reload saved map before retrying.' using errcode = '40001'; end if;
  insert into bitd.campaign_maps(campaign_id,asset_id) values(p_campaign,p_asset)
    on conflict(campaign_id) do update set asset_id = excluded.asset_id,revision = campaign_maps.revision+1 returning * into result;
  return result;
end $$;
create function bitd.validate_token_assignment(p_campaign uuid,p_label text,p_character uuid,p_controller uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_label is null or length(trim(p_label)) not between 1 and 80 or (p_character is not null and p_controller is not null) then raise exception 'Choose a label and at most one movement authority' using errcode = '22023'; end if;
  if p_character is not null then
    perform 1 from bitd.characters where id = p_character and campaign_id = p_campaign for key share;
    if not found then raise exception 'Choose a character in this campaign' using errcode = '22023'; end if;
  end if;
  if p_controller is not null then
    perform 1 from bitd.campaign_members where campaign_id = p_campaign and user_id = p_controller for key share;
    if not found then raise exception 'Choose a current campaign participant' using errcode = '22023'; end if;
  end if;
end $$;
create function bitd.create_map_token(p_campaign uuid,p_label text,p_character uuid,p_controller uuid) returns bitd.map_tokens
language plpgsql security definer set search_path = '' as $$
declare result bitd.map_tokens;
begin
  if bitd.campaign_role(p_campaign) is distinct from 'gm' then raise exception 'GM membership required' using errcode = '42501'; end if;
  perform bitd.validate_token_assignment(p_campaign,p_label,p_character,p_controller);
  insert into bitd.map_tokens(campaign_id,label,character_id,controller_id) values(p_campaign,trim(p_label),p_character,p_controller) returning * into result;
  return result;
end $$;
create function bitd.move_map_token(p_token uuid,p_x double precision,p_y double precision,p_revision bigint) returns bitd.map_tokens
language plpgsql security definer set search_path = '' as $$
declare result bitd.map_tokens; member_role text; character_owner uuid;
begin
  select * into result from bitd.map_tokens where id = p_token for update;
  member_role := bitd.campaign_role(result.campaign_id);
  if result.character_id is not null then
    select owner_id into character_owner from bitd.characters where id = result.character_id for share;
  end if;
  if member_role is null or (member_role <> 'gm' and result.controller_id is distinct from auth.uid() and character_owner is distinct from auth.uid()) then raise exception 'Current token movement permission required' using errcode = '42501'; end if;
  if result.revision is distinct from p_revision then raise exception 'Token changed. Reload saved position before retrying.' using errcode = '40001'; end if;
  if p_x is null or p_y is null or not (p_x between 0 and 100 and p_y between 0 and 100) then raise exception 'Coordinates must be between 0 and 100' using errcode = '22023'; end if;
  update bitd.map_tokens set x=p_x,y=p_y,revision=revision+1,updated_at=clock_timestamp() where id=p_token returning * into result;
  return result;
end $$;
create function bitd.manage_map_token(p_token uuid,p_label text,p_character uuid,p_controller uuid,p_revision bigint) returns bitd.map_tokens
language plpgsql security definer set search_path = '' as $$
declare result bitd.map_tokens;
begin
  select * into result from bitd.map_tokens where id=p_token for update;
  if bitd.campaign_role(result.campaign_id) is distinct from 'gm' then raise exception 'GM membership required' using errcode = '42501'; end if;
  if result.revision is distinct from p_revision then raise exception 'Token changed. Reload saved token before retrying.' using errcode = '40001'; end if;
  perform bitd.validate_token_assignment(result.campaign_id,p_label,p_character,p_controller);
  update bitd.map_tokens set label=trim(p_label),character_id=p_character,controller_id=p_controller,revision=revision+1,updated_at=clock_timestamp() where id=p_token returning * into result;
  return result;
end $$;
create function bitd.remove_map_token(p_token uuid,p_revision bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare result bitd.map_tokens;
begin
  select * into result from bitd.map_tokens where id=p_token for update;
  if bitd.campaign_role(result.campaign_id) is distinct from 'gm' then raise exception 'GM membership required' using errcode = '42501'; end if;
  if result.revision is distinct from p_revision then raise exception 'Token changed. Reload before removal.' using errcode = '40001'; end if;
  delete from bitd.map_tokens where id=p_token;
end $$;
revoke all on function bitd.validate_token_assignment(uuid,text,uuid,uuid) from public,authenticated;
revoke all on function bitd.get_map_state(uuid),bitd.set_campaign_map(uuid,uuid,bigint),bitd.create_map_token(uuid,text,uuid,uuid),bitd.move_map_token(uuid,double precision,double precision,bigint),bitd.manage_map_token(uuid,text,uuid,uuid,bigint),bitd.remove_map_token(uuid,bigint) from public;
grant execute on function bitd.get_map_state(uuid),bitd.set_campaign_map(uuid,uuid,bigint),bitd.create_map_token(uuid,text,uuid,uuid),bitd.move_map_token(uuid,double precision,double precision,bigint),bitd.manage_map_token(uuid,text,uuid,uuid,bigint),bitd.remove_map_token(uuid,bigint) to authenticated;
-- Durable tables stay outside Realtime: peer events cannot authorize writes.
