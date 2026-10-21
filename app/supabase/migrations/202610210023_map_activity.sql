-- Ephemeral channel storage: no WAL/restart durability, direct access or publication.
create unlogged table bitd.map_activity (
  campaign_id uuid not null references bitd.campaigns on delete cascade,
  asset_id uuid not null references bitd.campaign_assets on delete cascade,
  map_revision bigint not null,
  asset_revision bigint not null,
  actor uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('cursor','ping','stroke')),
  points jsonb not null,
  updated_at timestamptz not null,
  expires_at timestamptz not null,
  primary key(campaign_id,asset_id,actor,kind)
);
alter table bitd.map_activity enable row level security;
revoke all on bitd.map_activity from public,anon,authenticated;
grant all on bitd.map_activity to service_role;
create index map_activity_expiry on bitd.map_activity(expires_at);
create function bitd.require_map_activity_access(p_campaign uuid,p_asset uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if bitd.campaign_role(p_campaign) is null or not exists(select 1 from bitd.campaign_maps where campaign_id=p_campaign and asset_id=p_asset) or not bitd.can_use_map_asset(p_campaign,p_asset) then
    raise exception 'Current shared map membership required' using errcode='42501';
  end if;
end $$;
create function bitd.send_map_activity(p_campaign uuid,p_asset uuid,p_kind text,p_points jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare point jsonb; moment timestamptz := clock_timestamp();
begin
  perform bitd.require_map_activity_access(p_campaign,p_asset);
  if p_kind is null or p_kind not in ('cursor','ping','stroke') or p_points is null or jsonb_typeof(p_points) <> 'array' then raise exception 'Invalid map gesture' using errcode='22023'; end if;
  if jsonb_array_length(p_points) not between 1 and 64 or (p_kind <> 'stroke' and jsonb_array_length(p_points) <> 1) then raise exception 'Invalid gesture point count' using errcode='22023'; end if;
  for point in select value from jsonb_array_elements(p_points) loop
    if jsonb_typeof(point) <> 'object' or (point - 'x' - 'y') <> '{}'::jsonb or jsonb_typeof(point->'x') is distinct from 'number' or jsonb_typeof(point->'y') is distinct from 'number' then raise exception 'Only normalized geometry is accepted' using errcode='22023'; end if;
    if not ((point->>'x')::numeric between 0 and 100 and (point->>'y')::numeric between 0 and 100) then raise exception 'Coordinates outside map' using errcode='22023'; end if;
  end loop;
  delete from bitd.map_activity where expires_at <= moment;
  insert into bitd.map_activity values(p_campaign,p_asset,(select revision from bitd.campaign_maps where campaign_id=p_campaign),(select revision from bitd.campaign_assets where id=p_asset),auth.uid(),p_kind,p_points,moment,moment+case p_kind when 'cursor' then interval '3 seconds' when 'ping' then interval '4 seconds' else interval '8 seconds' end)
    on conflict(campaign_id,asset_id,actor,kind) do update set map_revision=excluded.map_revision,asset_revision=excluded.asset_revision,points=excluded.points,updated_at=excluded.updated_at,expires_at=excluded.expires_at;
end $$;
create function bitd.read_map_activity(p_campaign uuid,p_asset uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  perform bitd.require_map_activity_access(p_campaign,p_asset);
  delete from bitd.map_activity where expires_at <= clock_timestamp();
  select coalesce(jsonb_agg(jsonb_build_object('actor',a.actor,'role',m.role,'kind',a.kind,'points',a.points,'remaining_ms',greatest(0,extract(epoch from(a.expires_at-clock_timestamp()))*1000)) order by a.actor,a.kind),'[]'::jsonb) into result
    from bitd.map_activity a join bitd.campaign_members m on m.campaign_id=a.campaign_id and m.user_id=a.actor
    where a.campaign_id=p_campaign and a.asset_id=p_asset and a.map_revision=(select revision from bitd.campaign_maps where campaign_id=p_campaign) and a.asset_revision=(select revision from bitd.campaign_assets where id=p_asset) and a.expires_at > clock_timestamp();
  return result;
end $$;
create function bitd.leave_map_activity(p_campaign uuid,p_asset uuid,p_kind text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform bitd.require_map_activity_access(p_campaign,p_asset);
  delete from bitd.map_activity where campaign_id=p_campaign and asset_id=p_asset and actor=auth.uid() and (p_kind is null or kind=p_kind);
end $$;
revoke all on function bitd.require_map_activity_access(uuid,uuid) from public,anon,authenticated;
revoke all on function bitd.send_map_activity(uuid,uuid,text,jsonb),bitd.read_map_activity(uuid,uuid),bitd.leave_map_activity(uuid,uuid,text) from public,anon;
grant execute on function bitd.send_map_activity(uuid,uuid,text,jsonb),bitd.read_map_activity(uuid,uuid),bitd.leave_map_activity(uuid,uuid,text) to authenticated;
