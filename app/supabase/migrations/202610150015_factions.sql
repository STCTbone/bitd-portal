-- Dedicated public faction records. Original legacy factions stay inaccessible.
create table bitd.faction_records (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references bitd.campaigns on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  description text not null default '' check(length(description) <= 10000),
  tier integer not null default 0 check (tier between 0 and 6),
  hold text not null default 'weak' check (hold in ('weak','strong')),
  status integer not null default 0 check (status between -3 and 3),
  category text not null default '' check(length(category) <= 120),
  known_information text not null default '' check(length(known_information) <= 20000),
  shared_notes text not null default '' check(length(shared_notes) <= 20000),
  source text not null default '' check(length(source) <= 300),
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
alter table bitd.faction_records enable row level security;
grant select on bitd.faction_records to authenticated;
grant all on bitd.faction_records to service_role;
create policy faction_member_read on bitd.faction_records for select to authenticated
 using (bitd.campaign_role(campaign_id) is not null);

create function bitd.initialize_gazette_factions(p_campaign uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare f jsonb; count_added integer := 0;
begin
 if bitd.campaign_role(p_campaign) is distinct from 'gm' then raise exception 'GM membership required' using errcode='42501'; end if;
 -- Lock a single campaign so concurrent initialization cannot duplicate the catalog.
 perform 1 from bitd.campaigns where id=p_campaign for update;
 if exists(select 1 from bitd.faction_records where campaign_id=p_campaign) then raise exception 'Factions already exist; initialization only applies to an empty faction list'; end if;
 for f in select value from jsonb_array_elements('[{"name": "The Unseen", "tier": 6, "hold": "strong", "category": "Underworld", "page": 1, "prestigeAbilityName": "Synapse Procedure", "description": "An influential criminal network whose members remain anonymous."}, {"name": "SCORPION Syndicate", "tier": 4, "hold": "weak", "category": "Underworld", "page": 1, "prestigeAbilityName": "Paint the House", "description": "A major Severosi smuggling organization trading in black lotus."}, {"name": "Strangford-Michter Financial", "tier": 4, "hold": "strong", "category": "Underworld", "page": 1, "prestigeAbilityName": "Seed Funding", "description": "An investment firm financing legitimate and criminal enterprises."}, {"name": "Mirror House", "tier": 3, "hold": "strong", "category": "Underworld", "page": 2, "prestigeAbilityName": "Perfect Reflection", "description": "Independent scientists investigating and exploiting anomalies."}, {"name": "The Golden Hand", "tier": 3, "hold": "strong", "category": "Underworld", "page": 2, "prestigeAbilityName": "Golden Ticket", "description": "A technologically equipped criminal organization using gilded hulls."}, {"name": "The Tomorrow Program", "tier": 3, "hold": "strong", "category": "Underworld", "page": 2, "prestigeAbilityName": "Paradigm", "description": "An artistic and scientific social circle with criminal connections."}, {"name": "The Gallo Family", "tier": 2, "hold": "strong", "category": "Underworld", "page": 3, "prestigeAbilityName": "High Roller", "description": "A family criminal enterprise established in Silkshore."}, {"name": "The Keel Twins", "tier": 2, "hold": "strong", "category": "Underworld", "page": 3, "prestigeAbilityName": "A-List", "description": "Twin gang leaders with influence over smaller gangs."}, {"name": "Lord Scurlock", "tier": 2, "hold": "strong", "category": "Underworld", "page": 3, "prestigeAbilityName": "Extensive Library", "description": "A reclusive noble associated with paranormal mysteries."}, {"name": "Silk", "tier": 2, "hold": "strong", "category": "Underworld", "page": 4, "prestigeAbilityName": "Silk III", "description": "A legendary thief known for increasingly ambitious robberies."}, {"name": "The Blackjacks", "tier": 2, "hold": "weak", "category": "Underworld", "page": 4, "prestigeAbilityName": "Suit Up", "description": "Former railway workers offering criminal muscle and paranormal expertise."}, {"name": "The Burn Corps", "tier": 2, "hold": "weak", "category": "Underworld", "page": 4, "prestigeAbilityName": "Deadly Weapon", "description": "A militant Severosi activist group linked to Burning Orange."}, {"name": "The Limmerfield Gang", "tier": 2, "hold": "weak", "category": "Underworld", "page": 5, "prestigeAbilityName": "Terrifying Reputation", "description": "A violent gang with a reputation for unusual behavior."}, {"name": "The Lounge Rats", "tier": 2, "hold": "weak", "category": "Underworld", "page": 5, "prestigeAbilityName": "Encore", "description": "Nightclub operators involved in racketeering, drugs and gambling."}, {"name": "Red Torque", "tier": 2, "hold": "weak", "category": "Underworld", "page": 5, "prestigeAbilityName": "Afterburner", "description": "Criminal drivers with an elite racing background."}, {"name": "D-13", "tier": 1, "hold": "strong", "category": "Underworld", "page": 6, "prestigeAbilityName": "Comrades", "description": "Former soldiers pursuing work in the criminal underworld."}, {"name": "The Dirt Barons", "tier": 1, "hold": "strong", "category": "Underworld", "page": 6, "prestigeAbilityName": "Pay Dirt", "description": "Information brokers trading compromising material on other factions."}, {"name": "Leatherbacks", "tier": 1, "hold": "weak", "category": "Underworld", "page": 6, "prestigeAbilityName": "Killer Ride", "description": "An autocycle racing gang and youth movement."}, {"name": "The Fighting Goats", "tier": 1, "hold": "weak", "category": "Underworld", "page": 7, "prestigeAbilityName": "Pinch Hitters", "description": "Former ragskulla players trying to establish a criminal gang."}, {"name": "Paxton", "tier": 1, "hold": "strong", "category": "Underworld", "page": 7, "prestigeAbilityName": "Big Night Out", "description": "A celebrated fighter recently released from Ironhook."}, {"name": "New Dawn", "tier": 4, "hold": "weak", "category": "Fringe", "page": 8, "prestigeAbilityName": "The Closing of the Eye", "description": "A growing wellness movement with increasingly exclusive inner circles."}, {"name": "Carousel", "tier": 3, "hold": "strong", "category": "Fringe", "page": 8, "prestigeAbilityName": null, "prestigeAbilityChoices": ["Chaser Training", "Volunteer Test Subject"], "description": "A research institute pursuing ways to extend life indefinitely."}, {"name": "The Kethrys Lodge", "tier": 3, "hold": "weak", "category": "Fringe", "page": 8, "prestigeAbilityName": "Bound to the Demon", "description": "A paranormal society conducting experiments and rituals."}, {"name": "The Silver Echoes", "tier": 3, "hold": "weak", "category": "Fringe", "page": 9, "prestigeAbilityName": "Headliner", "description": "A popular band with an intensely devoted following."}, {"name": "Deathsteaders", "tier": 1, "hold": "strong", "category": "Fringe", "page": 9, "prestigeAbilityName": "Moonlit Path", "description": "People making their homes outside the protective Bubble."}, {"name": "Gondoliers", "tier": 1, "hold": "strong", "category": "Fringe", "page": 9, "prestigeAbilityName": "Compel", "description": "Traditional canal workers associated with old paranormal knowledge."}, {"name": "Plasmovision Social Club", "tier": 1, "hold": "weak", "category": "Fringe", "page": 9, "prestigeAbilityName": "And Now a Word from Our Sponsor", "description": "Plasmovision enthusiasts investigating strange signals between programs."}, {"name": "Imperial Military", "tier": 6, "hold": "strong", "category": "Institutions", "page": 10, "prestigeAbilityName": "Air Support", "description": "Imperial armed forces stationed in and around the city."}, {"name": "City Council", "tier": 5, "hold": "strong", "category": "Institutions", "page": 10, "prestigeAbilityName": "Traffic Routing", "description": "The elected municipal government, dominated by established elites."}, {"name": "Section 6", "tier": 5, "hold": "strong", "category": "Institutions", "page": 10, "prestigeAbilityName": "Warden Training", "description": "An institution overseeing bodies, anomalies and paranormal licensing."}, {"name": "The Palace", "tier": 5, "hold": "strong", "category": "Institutions", "page": 10, "prestigeAbilityName": "Advanced Chronometer", "description": "The Imperial intelligence service operating at home and abroad."}, {"name": "Ministry of Discovery", "tier": 4, "hold": "strong", "category": "Institutions", "page": 11, "prestigeAbilityName": "Rocket Pack", "description": "An Imperial ministry developing and acquiring technology."}, {"name": "Ministry of Stability", "tier": 4, "hold": "strong", "category": "Institutions", "page": 11, "prestigeAbilityName": "High Security Clearance", "description": "An Imperial ministry managing borders, transport and essential supplies."}, {"name": "The Strelai", "tier": 4, "hold": "strong", "category": "Institutions", "page": 11, "prestigeAbilityName": "Secrets of the Balance", "description": "A concealed mystical order with uncertain allegiances."}, {"name": "The Church", "tier": 4, "hold": "weak", "category": "Institutions", "page": 12, "prestigeAbilityName": "Mark of Authority", "description": "The state-aligned Church of the Ecstasy of the Flesh."}, {"name": "Ironhook Prison", "tier": 4, "hold": "weak", "category": "Institutions", "page": 12, "prestigeAbilityName": "Jailbird", "description": "The city’s longstanding prison, threatened by reform technology."}, {"name": "Blackthorn Park", "tier": 3, "hold": "strong", "category": "Institutions", "page": 12, "prestigeAbilityName": "Covenant Training", "description": "The United Skov Covenant’s foreign intelligence service."}, {"name": "Bluecoats", "tier": 3, "hold": "strong", "category": "Institutions", "page": 12, "prestigeAbilityName": "Snitch", "description": "The city’s uniformed police, with a history of corruption and violence."}, {"name": "Inspectors", "tier": 3, "hold": "strong", "category": "Institutions", "page": 12, "prestigeAbilityName": "Mandate", "description": "City Watch detectives investigating crime and preparing prosecutions."}, {"name": "Lusk Reform Clinic", "tier": 3, "hold": "strong", "category": "Institutions", "page": 13, "prestigeAbilityName": "Voluntary Reform", "description": "A well-funded clinic applying the controversial Lusk Reform Technique."}, {"name": "Anixis Field Unit", "tier": 2, "hold": "strong", "category": "Institutions", "page": 13, "prestigeAbilityName": "Synchronized Watches", "description": "A small Iruvian intelligence mission pursuing its country’s interests."}, {"name": "USC Consulate", "tier": 2, "hold": "weak", "category": "Institutions", "page": 13, "prestigeAbilityName": null, "description": "The diplomatic representation of the United Skov Covenant."}, {"name": "Dagger Isles Consulate", "tier": 1, "hold": "strong", "category": "Institutions", "page": 13, "prestigeAbilityName": null, "description": "The diplomatic representation of the Dagger Isles."}, {"name": "Iruvian Consulate", "tier": 1, "hold": "strong", "category": "Institutions", "page": 13, "prestigeAbilityName": null, "description": "The diplomatic representation of Iruvia."}, {"name": "Severosi Consulate", "tier": 1, "hold": "strong", "category": "Institutions", "page": 13, "prestigeAbilityName": null, "description": "The diplomatic representation of Severos."}, {"name": "The Foundation", "tier": 4, "hold": "strong", "category": "Corporate & Community", "page": 14, "prestigeAbilityName": "Due Diligence", "description": "A powerful alliance of builders, architects and property developers."}, {"name": "Saltfords Banking Group", "tier": 4, "hold": "strong", "category": "Corporate & Community", "page": 14, "prestigeAbilityName": "Executive Account", "description": "The dominant banking group following extensive consolidation."}, {"name": "Xantara Pharm", "tier": 4, "hold": "strong", "category": "Corporate & Community", "page": 14, "prestigeAbilityName": "Hyper Serum", "description": "A pharmaceutical business selling a wide range of profitable pills."}, {"name": "The Ankhayat Consortium", "tier": 4, "hold": "weak", "category": "Corporate & Community", "page": 14, "prestigeAbilityName": "The Spire of Khayat", "description": "Businesses controlled by an exiled Iruvian noble family."}, {"name": "Burning Orange", "tier": 3, "hold": "weak", "category": "Corporate & Community", "page": 15, "prestigeAbilityName": "Dedicated", "description": "A Severosi activist collective concerned with society and the environment."}, {"name": "Ink Lane Tabloids", "tier": 2, "hold": "strong", "category": "Corporate & Community", "page": 15, "prestigeAbilityName": "Ink Rake", "description": "Competing sensationalist newspapers with occasional serious investigations."}, {"name": "Laborers", "tier": 2, "hold": "strong", "category": "Corporate & Community", "page": 15, "prestigeAbilityName": null, "description": "Workers whose shared interests influence the city’s economy."}, {"name": "Tottle Orlov Arran", "tier": 2, "hold": "strong", "category": "Corporate & Community", "page": 16, "prestigeAbilityName": "Unique Selling Proposition", "description": "A well-connected advertising agency serving major civic campaigns."}, {"name": "The Youth Action Movement", "tier": 2, "hold": "strong", "category": "Corporate & Community", "page": 16, "prestigeAbilityName": "Spontaneous Demonstration", "description": "A student-rooted countercultural movement staging disruptive protests."}, {"name": "Cabbies", "tier": 2, "hold": "weak", "category": "Corporate & Community", "page": 16, "prestigeAbilityName": "Where to?", "description": "Autopod taxi drivers with an extensive informal information network."}, {"name": "Captain Laudius Blanchet", "tier": 1, "hold": "strong", "category": "Corporate & Community", "page": 16, "prestigeAbilityName": "Ochre Submarine", "description": "A former naval officer known for exploration, films and marine research."}]'::jsonb) loop
  insert into bitd.faction_records(campaign_id,name,description,tier,hold,category,source)
  values(p_campaign,f->>'name',f->>'description',(f->>'tier')::integer,f->>'hold',f->>'category',
    'Blades ’68 Player Gazette v4 (June 2026), p. ' || (f->>'page'));
  count_added := count_added + 1;
 end loop;
 return count_added;
end $$;

create function bitd.patch_faction(p_id uuid, p_patch jsonb, p_expected_version integer) returns bitd.faction_records
language plpgsql security definer set search_path = '' as $$
declare faction bitd.faction_records; field text; member_role text;
begin
 select * into faction from bitd.faction_records where id=p_id for update;
 member_role := bitd.campaign_role(faction.campaign_id);
 if not found or member_role is null then raise exception 'Campaign faction access required' using errcode='42501'; end if;
 if p_expected_version is distinct from faction.version then raise exception 'Faction changed; reload before saving' using errcode='40001'; end if;
 if p_patch is null or jsonb_typeof(p_patch) is distinct from 'object' then raise exception 'Expected a faction patch'; end if;
 for field in select jsonb_object_keys(p_patch) loop
  if member_role <> 'gm' and field <> 'shared_notes' then raise exception 'Only GMs can change public faction facts' using errcode='42501'; end if;
  if field not in ('name','description','tier','hold','status','category','known_information','shared_notes') then raise exception 'Unsupported faction field: %',field; end if;
  if field in ('tier','status') then
   if jsonb_typeof(p_patch->field) is distinct from 'number' or (p_patch->>field) !~ '^-?[0-9]+$' then raise exception 'Expected an integer for %',field; end if;
  elsif jsonb_typeof(p_patch->field) is distinct from 'string' then raise exception 'Expected text for %',field;
  end if;
 end loop;
 update bitd.faction_records set
 name=coalesce(p_patch->>'name',name), description=coalesce(p_patch->>'description',description),
 tier=coalesce((p_patch->>'tier')::integer,tier),hold=coalesce(p_patch->>'hold',hold),
 status=coalesce((p_patch->>'status')::integer,status),category=coalesce(p_patch->>'category',category),
 known_information=coalesce(p_patch->>'known_information',known_information),shared_notes=coalesce(p_patch->>'shared_notes',shared_notes),
 version=version+1, updated_at=now() where id=p_id returning * into faction;
 return faction;
end $$;
revoke all on function bitd.initialize_gazette_factions(uuid),bitd.patch_faction(uuid,jsonb,integer) from public;
grant execute on function bitd.initialize_gazette_factions(uuid),bitd.patch_faction(uuid,jsonb,integer) to authenticated;
-- Deliberately absent from supabase_realtime: snapshots, not raw old-row changes.

-- Secrets have their own row and are never included in campaign/public hydration.
create table bitd.faction_private_notes (
 faction_id uuid primary key references bitd.faction_records on delete cascade,
 campaign_id uuid not null references bitd.campaigns on delete cascade,
 note text not null default '' check(length(note) <= 30000),
 version integer not null default 1,
 updated_at timestamptz not null default now()
);
alter table bitd.faction_private_notes enable row level security;
grant select on bitd.faction_private_notes to authenticated;
grant all on bitd.faction_private_notes to service_role;
create policy faction_gm_private_read on bitd.faction_private_notes for select to authenticated
 using (bitd.campaign_role(campaign_id) = 'gm');

create function bitd.get_faction_private_note(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare campaign uuid; result jsonb;
begin
 select campaign_id into campaign from bitd.faction_records where id=p_id;
 if bitd.campaign_role(campaign) is distinct from 'gm' then raise exception 'GM faction access required' using errcode='42501'; end if;
 select jsonb_build_object('note',note,'version',version) into result from bitd.faction_private_notes where faction_id=p_id;
 return coalesce(result,jsonb_build_object('note','','version',0));
end $$;

create function bitd.save_faction_private_note(p_id uuid, p_note text, p_expected_version integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare campaign uuid; current_version integer;
begin
 select campaign_id into campaign from bitd.faction_records where id=p_id for update;
 if bitd.campaign_role(campaign) is distinct from 'gm' then raise exception 'GM faction access required' using errcode='42501'; end if;
 if p_note is null then raise exception 'Private note must be text'; end if;
 select version into current_version from bitd.faction_private_notes where faction_id=p_id;
 if p_expected_version is distinct from coalesce(current_version,0) then raise exception 'Private notes changed; reload before saving' using errcode='40001'; end if;
 insert into bitd.faction_private_notes(faction_id,campaign_id,note) values(p_id,campaign,p_note)
 on conflict(faction_id) do update set note=excluded.note,version=faction_private_notes.version+1,updated_at=now();
 return bitd.get_faction_private_note(p_id);
end $$;

create function bitd.publish_faction_information(p_id uuid, p_text text, p_expected_version integer) returns bitd.faction_records
language plpgsql security definer set search_path = '' as $$
declare faction bitd.faction_records;
begin
 select * into faction from bitd.faction_records where id=p_id for update;
 if not found or bitd.campaign_role(faction.campaign_id) is distinct from 'gm' then raise exception 'GM faction access required' using errcode='42501'; end if;
 if p_text is null or length(trim(p_text))=0 then raise exception 'Select text to share first'; end if;
 return bitd.patch_faction(p_id,jsonb_build_object('known_information',
   case when faction.known_information='' then trim(p_text) else faction.known_information || E'\n' || trim(p_text) end),p_expected_version);
end $$;
revoke all on function bitd.get_faction_private_note(uuid),bitd.save_faction_private_note(uuid,text,integer),bitd.publish_faction_information(uuid,text,integer) from public;
grant execute on function bitd.get_faction_private_note(uuid),bitd.save_faction_private_note(uuid,text,integer),bitd.publish_faction_information(uuid,text,integer) to authenticated;

create function bitd.create_faction(p_campaign uuid, p_name text) returns bitd.faction_records
language plpgsql security definer set search_path = '' as $$
declare faction bitd.faction_records;
begin
 if bitd.campaign_role(p_campaign) is distinct from 'gm' then raise exception 'GM membership required' using errcode='42501'; end if;
 if p_name is null or length(trim(p_name)) not between 1 and 120 then raise exception 'Enter a faction name (1–120 characters)'; end if;
 perform 1 from bitd.campaigns where id=p_campaign for update;
 insert into bitd.faction_records(campaign_id,name) values(p_campaign,trim(p_name)) returning * into faction;
 return faction;
end $$;
create function bitd.delete_faction(p_id uuid, p_expected_version integer) returns void
language plpgsql security definer set search_path = '' as $$
declare faction bitd.faction_records;
begin
 select * into faction from bitd.faction_records where id=p_id for update;
 if not found or bitd.campaign_role(faction.campaign_id) is distinct from 'gm' then raise exception 'GM faction access required' using errcode='42501'; end if;
 if faction.version is distinct from p_expected_version then raise exception 'Faction changed; reload before deleting' using errcode='40001'; end if;
 delete from bitd.faction_records where id=p_id;
end $$;
revoke all on function bitd.create_faction(uuid,text),bitd.delete_faction(uuid,integer) from public;
grant execute on function bitd.create_faction(uuid,text),bitd.delete_faction(uuid,integer) to authenticated;
