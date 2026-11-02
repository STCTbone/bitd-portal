-- Fresh Blades ’68 campaigns only. Do not apply the obsolete upstream bootstrap.
create schema bitd;
grant usage on schema bitd to authenticated;
alter default privileges in schema bitd revoke execute on functions from public;

create table bitd.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 100),
  map_image_url text,
  created_at timestamptz not null default now()
);
create table bitd.campaign_members (
  campaign_id uuid not null references bitd.campaigns on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null check (role in ('player', 'gm')),
  primary key (campaign_id, user_id)
);
-- No API grants: only GM-checked RPCs can return invitation secrets.
create table bitd.campaign_invitations (
  campaign_id uuid not null references bitd.campaigns on delete cascade,
  role text not null check (role in ('player', 'gm')),
  token text not null unique default encode(extensions.gen_random_bytes(32), 'hex'),
  primary key (campaign_id, role)
);
alter table bitd.campaigns enable row level security;
alter table bitd.campaign_members enable row level security;
alter table bitd.campaign_invitations enable row level security;

create function bitd.campaign_role(p_campaign uuid) returns text
language sql stable security definer set search_path = '' as $$
  select role from bitd.campaign_members where campaign_id = p_campaign and user_id = auth.uid()
$$;
revoke all on function bitd.campaign_role(uuid) from public;
grant execute on function bitd.campaign_role(uuid) to authenticated;
grant select on bitd.campaigns, bitd.campaign_members to authenticated;
create policy membership_self on bitd.campaign_members for select to authenticated using (user_id = auth.uid());
create policy campaign_member_read on bitd.campaigns for select to authenticated using (bitd.campaign_role(id) is not null);

create function bitd.create_campaign(p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare campaign bitd.campaigns;
begin
  if auth.uid() is null then raise exception 'Identity required' using errcode = '42501'; end if;
  if p_name is null or length(trim(p_name)) not between 1 and 100 then raise exception 'Enter a campaign name (1–100 characters)'; end if;
  insert into bitd.campaigns(name) values (trim(p_name)) returning * into campaign;
  insert into bitd.campaign_members values (campaign.id, auth.uid(), 'gm');
  insert into bitd.campaign_invitations(campaign_id, role) values (campaign.id, 'player'), (campaign.id, 'gm');
  return jsonb_build_object('id', campaign.id, 'name', campaign.name, 'role', 'gm');
end $$;

create function bitd.join_campaign(p_invitation text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare invitation bitd.campaign_invitations;
declare campaign bitd.campaigns;
declare granted_role text;
begin
  if auth.uid() is null then raise exception 'Identity required' using errcode = '42501'; end if;
  select * into invitation from bitd.campaign_invitations where token = trim(p_invitation);
  if not found then raise exception 'Invalid invitation' using errcode = '22023'; end if;
  insert into bitd.campaign_members values (invitation.campaign_id, auth.uid(), invitation.role)
    on conflict (campaign_id, user_id) do update
    set role = case when campaign_members.role = 'gm' then 'gm' else excluded.role end
    returning role into granted_role;
  select * into campaign from bitd.campaigns where id = invitation.campaign_id;
  return jsonb_build_object('id', campaign.id, 'name', campaign.name, 'role', granted_role);
end $$;

create function bitd.get_campaign_invitations(p_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if bitd.campaign_role(p_campaign) is distinct from 'gm' then raise exception 'GM membership required' using errcode = '42501'; end if;
  return (select jsonb_object_agg(role, token) from bitd.campaign_invitations where campaign_id = p_campaign);
end $$;
revoke all on function bitd.create_campaign(text), bitd.join_campaign(text), bitd.get_campaign_invitations(uuid) from public;
grant execute on function bitd.create_campaign(text), bitd.join_campaign(text), bitd.get_campaign_invitations(uuid) to authenticated;

-- Preserve adapters' expected shape while denying every unconverted feature path.
-- Later feature migrations must add explicit read/write contracts and RLS policies.
do $$ declare entity text; begin
  foreach entity in array array['characters','crews','clocks','factions','scores','map_tokens','media','codex'] loop
    execute format('create table bitd.%I (id uuid primary key default gen_random_uuid(), campaign_id uuid not null references bitd.campaigns on delete cascade, owner_id uuid references auth.users, data jsonb not null, updated_at timestamptz not null default now())', entity);
    execute format('alter table bitd.%I enable row level security', entity);
    execute format('grant select on bitd.%I to authenticated', entity);
  end loop;
end $$;
-- No merge_entity RPC, broad write grants, durable broadcasts or permissive policies.
insert into storage.buckets(id, name, public) values ('maps', 'maps', false);

-- Supabase operator access for trusted administration and test fixture setup.
-- The service-role credential is never shipped to the browser.
grant usage on schema bitd to service_role;
grant all on all tables in schema bitd to service_role;
