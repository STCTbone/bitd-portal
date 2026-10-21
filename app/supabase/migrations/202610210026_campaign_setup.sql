-- Deliberate optional sample setup and a precisely scoped workspace clear.
-- Never delete campaign/character/crew rows: asset files and immutable history survive.
create table bitd.campaign_setup_requests (
 id uuid primary key default gen_random_uuid(), campaign_id uuid not null references bitd.campaigns on delete cascade,
 actor_id uuid not null references auth.users, action text not null check(action in ('sample','clear')),
 fingerprint text not null, preview jsonb not null, result jsonb, created_at timestamptz not null default clock_timestamp()
);
alter table bitd.campaign_setup_requests enable row level security;
revoke all on bitd.campaign_setup_requests from public,anon,authenticated;

-- Ordinary writes share a campaign lease; setup/clear holds its exclusive lease.
-- Try rather than wait after an existing RPC's row lock, avoiding lock inversion.
-- Normal concurrent edits remain compatible. A racing edit is safely rejected,
-- never queued for a surprising post-clear insertion. Triggers apply to RPCs too.
create function bitd.guard_campaign_setup_write() returns trigger language plpgsql security definer set search_path='' as $$
declare campaign uuid;
begin
 if TG_OP='DELETE' then campaign:=old.campaign_id; else campaign:=new.campaign_id; end if;
 if not pg_try_advisory_xact_lock_shared(hashtextextended(campaign::text,26)) then
  raise exception 'Campaign setup is in progress. Reload and retry your draft.' using errcode='40001';
 end if;
 if TG_OP='DELETE' then return old; else return new; end if;
end $$;
revoke all on function bitd.guard_campaign_setup_write() from public,anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['characters','crews','faction_records','faction_private_notes','clocks','codex','map_tokens','personal_business','opportunities','scores','score_activities','score_events','aftermath_proposals','aftermath_receipts','aftermath_manual','backing_records','campaign_assets','campaign_maps','campaign_cycles','map_activity'] loop
  execute format('create trigger campaign_setup_write before insert or update or delete on bitd.%I for each row execute function bitd.guard_campaign_setup_write()',t);
 end loop;
end $$;

-- Private fingerprint includes protected records for empty-content checks and stale
-- preview detection; only counts and an opaque digest leave this helper.
create function bitd.campaign_setup_snapshot(p_campaign uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare t text; rows jsonb; snapshot jsonb:='{}'; counts jsonb:='{}';
begin
 foreach t in array array['characters','crews','faction_records','faction_private_notes','clocks','codex','map_tokens','personal_business','opportunities','scores','score_activities','score_events','aftermath_proposals','aftermath_receipts','aftermath_manual','backing_records','campaign_assets','campaign_maps','campaign_cycles','map_activity'] loop
  execute format('select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),''[]''::jsonb) from bitd.%I r where campaign_id=$1',t) into rows using p_campaign;
  if t<>'map_activity' then snapshot:=snapshot||jsonb_build_object(t,rows); end if; counts:=counts||jsonb_build_object(t,jsonb_array_length(rows));
 end loop;
 return jsonb_build_object('fingerprint',md5(snapshot::text),'counts',counts);
end $$;
revoke all on function bitd.campaign_setup_snapshot(uuid) from public,anon,authenticated;

create function bitd.preview_campaign_setup(p_campaign uuid,p_action text) returns jsonb language plpgsql security definer set search_path='' as $$
declare snapshot jsonb; preview jsonb; request uuid; t text;
begin
 if bitd.campaign_role(p_campaign) is distinct from 'gm' then raise exception 'GM membership required' using errcode='42501'; end if;
 if p_action is null or p_action not in ('sample','clear') then raise exception 'Choose sample setup or scoped clear'; end if;
 snapshot:=bitd.campaign_setup_snapshot(p_campaign);
 if p_action='sample' then
  for t in select jsonb_object_keys(snapshot->'counts') loop
   if t not in ('campaign_maps','campaign_cycles','map_activity') and (snapshot->'counts'->>t)::integer<>0 then raise exception 'Sample setup requires an empty campaign. Create a separate fresh campaign to try the sample.' using errcode='40001'; end if;
  end loop;
  if exists(select 1 from bitd.campaign_maps where campaign_id=p_campaign and asset_id is not null) then raise exception 'Sample setup requires an empty campaign' using errcode='40001'; end if;
 end if;
 preview:=jsonb_build_object('action',p_action,'counts',snapshot->'counts','changes',case when p_action='sample' then 'Add two unclaimed Hounds, one Shadows crew, two invented factions, one shared and one hidden clock, and two shared notes. Invented sample fiction; published v6 sheet defaults.' else 'Permanently delete all clocks (including hidden clocks), all shared notes, all map markers, and transient map drawings, cursors and pings.' end,
 'preserves','Preserve campaign identity and name, invitations and members, settings, all character/crew/faction sheet values and ownership, private faction notes, backing records, planning and scores, Aftermath proposals and receipts, all history, uploaded files and asset metadata, character art, and selected map.');
 insert into bitd.campaign_setup_requests(campaign_id,actor_id,action,fingerprint,preview) values(p_campaign,auth.uid(),p_action,snapshot->>'fingerprint',preview) returning id into request;
 return preview||jsonb_build_object('id',request);
end $$;

create function bitd.apply_campaign_setup(p_request uuid,p_confirmation text) returns jsonb language plpgsql security definer set search_path='' as $$
declare request bitd.campaign_setup_requests; snapshot jsonb; character bitd.characters; faction bitd.faction_records; outcome jsonb;
begin
 select * into request from bitd.campaign_setup_requests where id=p_request for update;
 if request.id is null or request.actor_id is distinct from auth.uid() or bitd.campaign_role(request.campaign_id) is distinct from 'gm' then raise exception 'Current preview owner and GM membership required' using errcode='42501'; end if;
 if p_confirmation is distinct from (case when request.action='sample' then 'LOAD SAMPLE' else 'CLEAR WORKSPACE' end) then raise exception 'Enter the exact confirmation phrase'; end if;
 if request.result is not null then return request.result; end if;
 if request.created_at < clock_timestamp()-interval '15 minutes' then raise exception 'Preview expired. Review a fresh preview.' using errcode='40001'; end if;
 perform pg_advisory_xact_lock(hashtextextended(request.campaign_id::text,26));
 snapshot:=bitd.campaign_setup_snapshot(request.campaign_id);
 if snapshot->>'fingerprint' is distinct from request.fingerprint then raise exception 'Campaign changed since this preview. Review a fresh preview; nothing was changed.' using errcode='40001'; end if;
 if request.action='sample' then
  character:=bitd.create_character(request.campaign_id,'Mara Vey',true,'Hound');
  perform bitd.patch_character(character.id,'{"alias":"Switch","look":"A worn radio headset and a silver raincoat","notes":"Invented sample fiction: Mara and Len run the Night Wire courier service, carrying messages through Doskvol’s electric night. Claim this unclaimed character deliberately before playing."}'::jsonb);
  character:=bitd.create_character(request.campaign_id,'Len Rook',true,'Hound');
  perform bitd.patch_character(character.id,'{"alias":"Static","look":"Ink-stained fingers and an immaculate scarf","notes":"Invented sample fiction: Len keeps Night Wire’s radio equipment alive. Both sample Hounds retain the published v6 baseline capacities; no advances or rewards are applied."}'::jsonb);
  perform bitd.create_crew(request.campaign_id,'Night Wire','Shadows');
  perform bitd.update_crew(request.campaign_id,'{"base":"A shuttered radio repair shop","flair":"Invented sample fiction: a discreet courier collective","preferredOperations":"Retrieve a missing broadcast reel without attracting attention"}'::jsonb,'{"base":"","flair":"","preferredOperations":""}'::jsonb);
  faction:=bitd.create_faction(request.campaign_id,'The Lantern Exchange (sample)');
  perform bitd.patch_faction(faction.id,'{"description":"Invented sample fiction: independent night-market broadcasters who hire Night Wire.","tier":1,"known_information":"A missing reel could expose the exchange’s sources."}'::jsonb,faction.version);
  faction:=bitd.create_faction(request.campaign_id,'The Copper Office (sample)');
  perform bitd.patch_faction(faction.id,'{"description":"Invented sample fiction: a private signal-monitoring bureau pursuing the same reel.","tier":2,"known_information":"Their vans patrol the radio district."}'::jsonb,faction.version);
  perform bitd.create_clock(request.campaign_id,'{"name":"Locate the missing reel (sample)","segments":6,"visible_to_players":true,"notes":"Invented sample fiction. Agree the project’s scope and progress at the table."}'::jsonb);
  perform bitd.create_clock(request.campaign_id,'{"name":"Copper Office traces the signal (sample)","segments":4,"visible_to_players":false,"notes":"Invented GM-only sample fiction; reveal deliberately if useful."}'::jsonb);
  perform bitd.create_shared_note(request.campaign_id,'{"title":"Sample fiction and baseline","category":"lore","body":"All Night Wire people, factions, situations and clocks are invented sample fiction, not published setting facts or house rules. Hound and Shadows sheets use the portal’s published Blades ’68 v6 defaults, verified against book v1.0.1. No book secrets or artwork are imported. Claim a sample Hound deliberately; edit the fiction freely."}'::jsonb);
  perform bitd.create_shared_note(request.campaign_id,'{"title":"The missing broadcast reel","category":"items","body":"Invented sample fiction: the Lantern Exchange asks Night Wire to retrieve a broadcast reel from a closed repair arcade before the Copper Office locates it. Discuss client, target Tier and payout in Planning; no score or consequences have been applied."}'::jsonb);
 else
  delete from bitd.clocks where campaign_id=request.campaign_id;
  delete from bitd.codex where campaign_id=request.campaign_id;
  delete from bitd.map_tokens where campaign_id=request.campaign_id;
  delete from bitd.map_activity where campaign_id=request.campaign_id;
 end if;
 outcome:=jsonb_build_object('id',request.id,'action',request.action,'completed',true,'preview',request.preview);
 update bitd.campaign_setup_requests set result=outcome where id=request.id;
 return outcome;
end $$;
revoke all on function bitd.preview_campaign_setup(uuid,text),bitd.apply_campaign_setup(uuid,text) from public,anon;
grant execute on function bitd.preview_campaign_setup(uuid,text),bitd.apply_campaign_setup(uuid,text) to authenticated;
