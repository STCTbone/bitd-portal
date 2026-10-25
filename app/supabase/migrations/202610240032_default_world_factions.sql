-- Published public setting factions are campaign defaults, initialized once.
-- The marker preserves later deletions and renamed/edited campaign records.
alter table bitd.campaigns add column gazette_seeded boolean not null default false;
create index faction_records_campaign_name on bitd.faction_records(campaign_id,lower(btrim(name)));

create function bitd.gazette_faction_defaults() returns jsonb
language sql immutable set search_path='' as $$
 select '[{"name": "The Unseen", "description": "An influential criminal network whose members remain anonymous.", "tier": 6, "hold": "strong", "category": "Underworld", "page": 1}, {"name": "SCORPION Syndicate", "description": "A major Severosi smuggling organization trading in black lotus.", "tier": 4, "hold": "weak", "category": "Underworld", "page": 1}, {"name": "Strangford-Michter Financial", "description": "An investment firm financing legitimate and criminal enterprises.", "tier": 4, "hold": "strong", "category": "Underworld", "page": 1}, {"name": "Mirror House", "description": "Independent scientists investigating and exploiting anomalies.", "tier": 3, "hold": "strong", "category": "Underworld", "page": 2}, {"name": "The Golden Hand", "description": "A technologically equipped criminal organization using gilded hulls.", "tier": 3, "hold": "strong", "category": "Underworld", "page": 2}, {"name": "The Tomorrow Program", "description": "An artistic and scientific social circle with criminal connections.", "tier": 3, "hold": "strong", "category": "Underworld", "page": 2}, {"name": "The Gallo Family", "description": "A family criminal enterprise established in Silkshore.", "tier": 2, "hold": "strong", "category": "Underworld", "page": 3}, {"name": "The Keel Twins", "description": "Twin gang leaders with influence over smaller gangs.", "tier": 2, "hold": "strong", "category": "Underworld", "page": 3}, {"name": "Lord Scurlock", "description": "A reclusive noble associated with paranormal mysteries.", "tier": 2, "hold": "strong", "category": "Underworld", "page": 3}, {"name": "Silk", "description": "A legendary thief known for increasingly ambitious robberies.", "tier": 2, "hold": "strong", "category": "Underworld", "page": 4}, {"name": "The Blackjacks", "description": "Former railway workers offering criminal muscle and paranormal expertise.", "tier": 2, "hold": "weak", "category": "Underworld", "page": 4}, {"name": "The Burn Corps", "description": "A militant Severosi activist group linked to Burning Orange.", "tier": 2, "hold": "weak", "category": "Underworld", "page": 4}, {"name": "The Limmerfield Gang", "description": "A violent gang with a reputation for unusual behavior.", "tier": 2, "hold": "weak", "category": "Underworld", "page": 5}, {"name": "The Lounge Rats", "description": "Nightclub operators involved in racketeering, drugs and gambling.", "tier": 2, "hold": "weak", "category": "Underworld", "page": 5}, {"name": "Red Torque", "description": "Criminal drivers with an elite racing background.", "tier": 2, "hold": "weak", "category": "Underworld", "page": 5}, {"name": "D-13", "description": "Former soldiers pursuing work in the criminal underworld.", "tier": 1, "hold": "strong", "category": "Underworld", "page": 6}, {"name": "The Dirt Barons", "description": "Information brokers trading compromising material on other factions.", "tier": 1, "hold": "strong", "category": "Underworld", "page": 6}, {"name": "Leatherbacks", "description": "An autocycle racing gang and youth movement.", "tier": 1, "hold": "weak", "category": "Underworld", "page": 6}, {"name": "The Fighting Goats", "description": "Former ragskulla players trying to establish a criminal gang.", "tier": 1, "hold": "weak", "category": "Underworld", "page": 7}, {"name": "Paxton", "description": "A celebrated fighter recently released from Ironhook.", "tier": 1, "hold": "strong", "category": "Underworld", "page": 7}, {"name": "New Dawn", "description": "A growing wellness movement with increasingly exclusive inner circles.", "tier": 4, "hold": "weak", "category": "Fringe", "page": 8}, {"name": "Carousel", "description": "A research institute pursuing ways to extend life indefinitely.", "tier": 3, "hold": "strong", "category": "Fringe", "page": 8}, {"name": "The Kethrys Lodge", "description": "A paranormal society conducting experiments and rituals.", "tier": 3, "hold": "weak", "category": "Fringe", "page": 8}, {"name": "The Silver Echoes", "description": "A popular band with an intensely devoted following.", "tier": 3, "hold": "weak", "category": "Fringe", "page": 9}, {"name": "Deathsteaders", "description": "People making their homes outside the protective Bubble.", "tier": 1, "hold": "strong", "category": "Fringe", "page": 9}, {"name": "Gondoliers", "description": "Traditional canal workers associated with old paranormal knowledge.", "tier": 1, "hold": "strong", "category": "Fringe", "page": 9}, {"name": "Plasmovision Social Club", "description": "Plasmovision enthusiasts investigating strange signals between programs.", "tier": 1, "hold": "weak", "category": "Fringe", "page": 9}, {"name": "Imperial Military", "description": "Imperial armed forces stationed in and around the city.", "tier": 6, "hold": "strong", "category": "Institutions", "page": 10}, {"name": "City Council", "description": "The elected municipal government, dominated by established elites.", "tier": 5, "hold": "strong", "category": "Institutions", "page": 10}, {"name": "Section 6", "description": "An institution overseeing bodies, anomalies and paranormal licensing.", "tier": 5, "hold": "strong", "category": "Institutions", "page": 10}, {"name": "The Palace", "description": "The Imperial intelligence service operating at home and abroad.", "tier": 5, "hold": "strong", "category": "Institutions", "page": 10}, {"name": "Ministry of Discovery", "description": "An Imperial ministry developing and acquiring technology.", "tier": 4, "hold": "strong", "category": "Institutions", "page": 11}, {"name": "Ministry of Stability", "description": "An Imperial ministry managing borders, transport and essential supplies.", "tier": 4, "hold": "strong", "category": "Institutions", "page": 11}, {"name": "The Strelai", "description": "A concealed mystical order with uncertain allegiances.", "tier": 4, "hold": "strong", "category": "Institutions", "page": 11}, {"name": "The Church", "description": "The state-aligned Church of the Ecstasy of the Flesh.", "tier": 4, "hold": "weak", "category": "Institutions", "page": 12}, {"name": "Ironhook Prison", "description": "The city’s longstanding prison, threatened by reform technology.", "tier": 4, "hold": "weak", "category": "Institutions", "page": 12}, {"name": "Blackthorn Park", "description": "The United Skov Covenant’s foreign intelligence service.", "tier": 3, "hold": "strong", "category": "Institutions", "page": 12}, {"name": "Bluecoats", "description": "The city’s uniformed police, with a history of corruption and violence.", "tier": 3, "hold": "strong", "category": "Institutions", "page": 12}, {"name": "Inspectors", "description": "City Watch detectives investigating crime and preparing prosecutions.", "tier": 3, "hold": "strong", "category": "Institutions", "page": 12}, {"name": "Lusk Reform Clinic", "description": "A well-funded clinic applying the controversial Lusk Reform Technique.", "tier": 3, "hold": "strong", "category": "Institutions", "page": 13}, {"name": "Anixis Field Unit", "description": "A small Iruvian intelligence mission pursuing its country’s interests.", "tier": 2, "hold": "strong", "category": "Institutions", "page": 13}, {"name": "USC Consulate", "description": "The diplomatic representation of the United Skov Covenant.", "tier": 2, "hold": "weak", "category": "Institutions", "page": 13}, {"name": "Dagger Isles Consulate", "description": "The diplomatic representation of the Dagger Isles.", "tier": 1, "hold": "strong", "category": "Institutions", "page": 13}, {"name": "Iruvian Consulate", "description": "The diplomatic representation of Iruvia.", "tier": 1, "hold": "strong", "category": "Institutions", "page": 13}, {"name": "Severosi Consulate", "description": "The diplomatic representation of Severos.", "tier": 1, "hold": "strong", "category": "Institutions", "page": 13}, {"name": "The Foundation", "description": "A powerful alliance of builders, architects and property developers.", "tier": 4, "hold": "strong", "category": "Corporate & Community", "page": 14}, {"name": "Saltfords Banking Group", "description": "The dominant banking group following extensive consolidation.", "tier": 4, "hold": "strong", "category": "Corporate & Community", "page": 14}, {"name": "Xantara Pharm", "description": "A pharmaceutical business selling a wide range of profitable pills.", "tier": 4, "hold": "strong", "category": "Corporate & Community", "page": 14}, {"name": "The Ankhayat Consortium", "description": "Businesses controlled by an exiled Iruvian noble family.", "tier": 4, "hold": "weak", "category": "Corporate & Community", "page": 14}, {"name": "Burning Orange", "description": "A Severosi activist collective concerned with society and the environment.", "tier": 3, "hold": "weak", "category": "Corporate & Community", "page": 15}, {"name": "Ink Lane Tabloids", "description": "Competing sensationalist newspapers with occasional serious investigations.", "tier": 2, "hold": "strong", "category": "Corporate & Community", "page": 15}, {"name": "Laborers", "description": "Workers whose shared interests influence the city’s economy.", "tier": 2, "hold": "strong", "category": "Corporate & Community", "page": 15}, {"name": "Tottle Orlov Arran", "description": "A well-connected advertising agency serving major civic campaigns.", "tier": 2, "hold": "strong", "category": "Corporate & Community", "page": 16}, {"name": "The Youth Action Movement", "description": "A student-rooted countercultural movement staging disruptive protests.", "tier": 2, "hold": "strong", "category": "Corporate & Community", "page": 16}, {"name": "Cabbies", "description": "Autopod taxi drivers with an extensive informal information network.", "tier": 2, "hold": "weak", "category": "Corporate & Community", "page": 16}, {"name": "Captain Laudius Blanchet", "description": "A former naval officer known for exploration, films and marine research.", "tier": 1, "hold": "strong", "category": "Corporate & Community", "page": 16}]'::jsonb;
$$;
revoke all on function bitd.gazette_faction_defaults() from public,anon,authenticated;

create function bitd.seed_gazette_factions(p_campaign uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare f jsonb; seeded boolean; count_added integer:=0;
begin
 select gazette_seeded into seeded from bitd.campaigns where id=p_campaign for update;
 if not found then raise exception 'Campaign not found'; end if;
 if seeded then return 0; end if;
 -- Older campaigns with a Gazette roster may have deliberately removed or renamed
 -- entries. Mark those as initialized, without reconstructing their original list.
 if not exists(select 1 from bitd.faction_records where campaign_id=p_campaign
   and source like 'Blades ’68 Player Gazette v4 (June 2026), p. %') then
  for f in select value from jsonb_array_elements(bitd.gazette_faction_defaults()) loop
   -- A custom record with the same name takes precedence, including its notes/status.
   if not exists(select 1 from bitd.faction_records where campaign_id=p_campaign
     and lower(btrim(name))=lower(btrim(f->>'name'))) then
    insert into bitd.faction_records(campaign_id,name,description,tier,hold,category,source)
    values(p_campaign,f->>'name',f->>'description',(f->>'tier')::integer,f->>'hold',f->>'category',
      'Blades ’68 Player Gazette v4 (June 2026), p. '||(f->>'page'));
    count_added:=count_added+1;
   end if;
  end loop;
 end if;
 update bitd.campaigns set gazette_seeded=true where id=p_campaign;
 return count_added;
end $$;
revoke all on function bitd.seed_gazette_factions(uuid) from public,anon,authenticated;

-- Retain the authenticated RPC for older clients, now safe to retry after edits.
create or replace function bitd.initialize_gazette_factions(p_campaign uuid) returns integer
language plpgsql security definer set search_path='' as $$
begin
 if bitd.campaign_role(p_campaign) is distinct from 'gm' then
  raise exception 'GM membership required' using errcode='42501';
 end if;
 return bitd.seed_gazette_factions(p_campaign);
end $$;
revoke all on function bitd.initialize_gazette_factions(uuid) from public,anon;
grant execute on function bitd.initialize_gazette_factions(uuid) to authenticated;

create function bitd.seed_new_campaign_factions() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform bitd.seed_gazette_factions(new.id);
 return new;
end $$;
revoke all on function bitd.seed_new_campaign_factions() from public,anon,authenticated;
create trigger campaign_default_factions after insert on bitd.campaigns
 for each row execute function bitd.seed_new_campaign_factions();

do $$ declare campaign uuid; begin
 for campaign in select id from bitd.campaigns where not gazette_seeded loop
  perform bitd.seed_gazette_factions(campaign);
 end loop;
end $$;

-- Untouched published references do not make an otherwise empty campaign a
-- played campaign. The full snapshot still detects changes during a setup review.
create or replace function bitd.preview_campaign_setup(p_campaign uuid,p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare snapshot jsonb; preview jsonb; request uuid; t text;
begin
 if bitd.campaign_role(p_campaign) is distinct from 'gm' then raise exception 'GM membership required' using errcode='42501'; end if;
 if p_action is null or p_action not in ('sample','clear') then raise exception 'Choose sample setup or scoped clear'; end if;
 snapshot:=bitd.campaign_setup_snapshot(p_campaign);
 if p_action='sample' then
  for t in select jsonb_object_keys(snapshot->'counts') loop
   if t='faction_records' and not exists(
    select 1 from bitd.faction_records r where r.campaign_id=p_campaign and (
     r.version<>1 or r.status<>0 or r.known_information<>'' or r.shared_notes<>'' or not exists(
      select 1 from jsonb_array_elements(bitd.gazette_faction_defaults()) f
      where r.name=f->>'name' and r.description=f->>'description' and r.tier=(f->>'tier')::integer
       and r.hold=f->>'hold' and r.category=f->>'category'
       and r.source='Blades ’68 Player Gazette v4 (June 2026), p. '||(f->>'page')
     )
    )
   ) then continue; end if;
   if t not in ('campaign_maps','campaign_cycles','map_activity') and (snapshot->'counts'->>t)::integer<>0 then
    raise exception 'Sample setup requires an empty campaign. Create a separate fresh campaign to try the sample.' using errcode='40001';
   end if;
  end loop;
  if exists(select 1 from bitd.campaign_maps where campaign_id=p_campaign and asset_id is not null) then raise exception 'Sample setup requires an empty campaign' using errcode='40001'; end if;
 end if;
 preview:=jsonb_build_object('action',p_action,'counts',snapshot->'counts','changes',case when p_action='sample' then 'Add two unclaimed Hounds, one Shadows crew, two invented factions, one shared and one hidden clock, and two shared notes. Invented sample fiction; published v6 sheet defaults.' else 'Permanently delete all campaign/score clock records (including hidden clocks), all shared notes, all map markers, and transient map drawings, cursors and pings.' end,
 'preserves','Preserve campaign identity and name, invitations and members, settings, all character/crew/faction sheet values and ownership (including healing and embedded tracks), private faction notes, backing records (including Failure), planning and scores, Aftermath proposals and receipts, all history, uploaded files and asset metadata, character art, and selected map.');
 insert into bitd.campaign_setup_requests(campaign_id,actor_id,action,fingerprint,preview)
 values(p_campaign,auth.uid(),p_action,snapshot->>'fingerprint',preview) returning id into request;
 return preview||jsonb_build_object('id',request);
end $$;
