-- A deliberately small projection of authoritative records: no notes, backing,
-- invitations, assets or private tables enter this landing-page payload.
create function bitd.get_campaign_overview(p_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare authorized_role text := bitd.campaign_role(p_campaign); people jsonb; crew jsonb;
begin
  if authorized_role is null then raise exception 'Current campaign membership required' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'owner_id',c.owner_id,'name',c.data->'name','alias',c.data->'alias','playbook',c.data->'playbook',
    'condition_kind',c.data#>'{sheet,conditionKind}','stress',c.data->'stress','stress_capacity',c.data->'stressCapacity','stacks',c.data#>'{wealth,stacks}','bank',c.data#>'{wealth,bank}',
    'load',c.data#>'{loadout,mode}', 'harm',jsonb_build_object(
      'passing',(select count(*) from jsonb_array_elements_text(c.data#>'{harm,passing}') h where btrim(h)<>''),
      'major',(select count(*) from jsonb_array_elements_text(c.data#>'{harm,major}') h where btrim(h)<>''),
      'critical',(select count(*) from jsonb_array_elements_text(c.data#>'{harm,critical}') h where btrim(h)<>''),
      'mortal',(select count(*) from jsonb_array_elements_text(c.data#>'{harm,mortal}') h where btrim(h)<>''))
  ) order by c.data->>'name',c.id),'[]'::jsonb) into people from bitd.characters c where c.campaign_id=p_campaign;
  select jsonb_build_object('id',c.id,'name',c.data->'name','type',c.data->'type','reputation',c.data->'reputation',
    'tier',c.data->'tier','hold',c.data->'hold','rep',c.data->'rep','heat',c.data->'heat','wanted',c.data->'wanted',
    'stacks',c.data->'stacks','xp',c.data->'xp') into crew from bitd.crews c where c.campaign_id=p_campaign;
  return jsonb_build_object('actor',auth.uid(),'role',authorized_role,'characters',people,'crew',crew);
end $$;
revoke all on function bitd.get_campaign_overview(uuid) from public,anon;
grant execute on function bitd.get_campaign_overview(uuid) to authenticated;

-- Connection leases are transient, never authority. Membership deletion cascades;
-- roles are joined fresh at read time. No browser names, seats or roles are stored.
create unlogged table bitd.campaign_presence (
  campaign_id uuid not null,
  actor uuid not null,
  connection_id uuid not null,
  expires_at timestamptz not null,
  primary key (campaign_id,actor,connection_id),
  foreign key (campaign_id,actor) references bitd.campaign_members(campaign_id,user_id) on delete cascade
);
create index campaign_presence_expiry on bitd.campaign_presence(expires_at);
alter table bitd.campaign_presence enable row level security;
revoke all on bitd.campaign_presence from public,anon,authenticated;
grant all on bitd.campaign_presence to service_role;

create function bitd.get_campaign_presence(p_campaign uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare authorized_role text := bitd.campaign_role(p_campaign); people jsonb;
begin
  if authorized_role is null then raise exception 'Current campaign membership required' using errcode='42501'; end if;
  delete from bitd.campaign_presence where expires_at<=clock_timestamp();
  select coalesce(jsonb_agg(jsonb_build_object('actor',p.actor,'role',p.role,'remaining_ms',greatest(0,extract(epoch from(p.expires_at-clock_timestamp()))*1000)) order by p.actor),'[]'::jsonb) into people
    from (select a.actor,m.role,max(a.expires_at) expires_at from bitd.campaign_presence a
      join bitd.campaign_members m on m.campaign_id=a.campaign_id and m.user_id=a.actor
      where a.campaign_id=p_campaign and a.expires_at>clock_timestamp() group by a.actor,m.role) p;
  return jsonb_build_object('actor',auth.uid(),'role',authorized_role,'participants',people);
end $$;
create function bitd.touch_campaign_presence(p_campaign uuid,p_connection uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if bitd.campaign_role(p_campaign) is null then raise exception 'Current campaign membership required' using errcode='42501'; end if;
  if p_connection is null then raise exception 'Connection ID required' using errcode='22023'; end if;
  -- Bound even malicious connection churn; serialize this identity's lease changes.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_campaign::text||auth.uid()::text,25));
  delete from bitd.campaign_presence where expires_at<=clock_timestamp();
  if not exists(select 1 from bitd.campaign_presence where campaign_id=p_campaign and actor=auth.uid() and connection_id=p_connection)
    and (select count(*) from bitd.campaign_presence where campaign_id=p_campaign and actor=auth.uid())>=12 then
    raise exception 'Too many active table connections. Close a tab and retry.' using errcode='22023';
  end if;
  insert into bitd.campaign_presence values(p_campaign,auth.uid(),p_connection,clock_timestamp()+interval '5 seconds')
    on conflict(campaign_id,actor,connection_id) do update set expires_at=excluded.expires_at;
  return bitd.get_campaign_presence(p_campaign);
end $$;
create function bitd.leave_campaign_presence(p_campaign uuid,p_connection uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if bitd.campaign_role(p_campaign) is null then raise exception 'Current campaign membership required' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_campaign::text||auth.uid()::text,25));
  delete from bitd.campaign_presence where expires_at<=clock_timestamp() or (campaign_id=p_campaign and actor=auth.uid() and connection_id=p_connection);
end $$;
revoke all on function bitd.get_campaign_presence(uuid),bitd.touch_campaign_presence(uuid,uuid),bitd.leave_campaign_presence(uuid,uuid) from public,anon;
grant execute on function bitd.get_campaign_presence(uuid),bitd.touch_campaign_presence(uuid,uuid),bitd.leave_campaign_presence(uuid,uuid) to authenticated;
