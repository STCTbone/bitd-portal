-- Hull owns only its definition. Primary v6 PDF page 2 and book v1.0.1 pp.30–36.
insert into bitd.character_playbooks(name,defaults,rules) values ('Hull','{"alias": "", "playerName": "", "look": "", "wearing": "", "heritage": "", "heritageDetails": "", "background": "", "backgroundDetails": "", "vice": "", "viceHookup": "", "notes": "", "abilityNotes": "", "advancementNotes": "", "equipmentNotes": "", "actions": {"hunt": 0, "study": 0, "survey": 0, "tinker": 0, "finesse": 0, "prowl": 0, "skirmish": 1, "wreck": 0, "attune": 1, "command": 0, "consort": 0, "sway": 0}, "abilities": ["Automaton"], "echoPet": [], "versatile": [], "relationships": [], "loadout": {"mode": "Quiet", "carriedStacks": 0}, "armor": {"kind": "built-in", "worn": true, "totaled": false, "source": "Automaton · Hull v6", "notes": ""}, "wealth": {"stacks": 0, "bank": 0}, "xp": {"playbook": 0, "insight": 0, "prowess": 0, "resolve": 0}, "resources": [], "equipment": [{"name": "A Blade or Two", "load": 1, "quantity": 1, "uses": 0, "carried": false, "source": "Published playbooks v6", "notes": ""}, {"name": "Silenced Shooter", "load": 1, "quantity": 1, "uses": 0, "carried": false, "source": "Published playbooks v6", "notes": ""}, {"name": "Handcannon", "load": 1, "quantity": 1, "uses": 0, "carried": false, "source": "Published playbooks v6", "notes": ""}, {"name": "Electro-Blade", "load": 2, "quantity": 1, "uses": 0, "carried": false, "source": "Published playbooks v6", "notes": ""}, {"name": "Pump-Action Scattergun", "load": 2, "quantity": 1, "uses": 0, "carried": false, "source": "Published playbooks v6", "notes": ""}, {"name": "Burglary Gear", "load": 1, "quantity": 1, "uses": 0, "carried": false, "source": "Published playbooks v6", "notes": ""}, {"name": "Climbing Gear", "load": 2, "quantity": 1, "uses": 0, "carried": false, "source": "Published playbooks v6", "notes": ""}, {"name": "Paranormal Implements", "load": 1, "quantity": 1, "uses": 0, "carried": false, "source": "Published playbooks v6", "notes": ""}, {"name": "Documents", "load": 1, "quantity": 1, "uses": 0, "carried": false, "source": "Published playbooks v6", "notes": ""}, {"name": "Subterfuge Supplies", "load": 1, "quantity": 1, "uses": 0, "carried": false, "source": "Published playbooks v6", "notes": ""}, {"name": "Demolition Tools", "load": 2, "quantity": 1, "uses": 0, "carried": false, "source": "Published playbooks v6", "notes": ""}, {"name": "Tinkering Tools", "load": 1, "quantity": 1, "uses": 0, "carried": false, "source": "Published playbooks v6", "notes": ""}, {"name": "Arclighter", "load": 1, "quantity": 1, "uses": 0, "carried": false, "source": "Published playbooks v6", "notes": ""}], "stress": 0, "stressCapacity": 10, "keys": [], "deadlocks": [], "harm": {"passing": ["", ""], "major": ["", ""], "critical": [""], "mortal": []}, "healing": {"progress": 0, "permanent": 0}, "hull": {"controller": "", "owningFaction": "", "suspicion": 0, "frameFeatures": [], "frameUpgrade": 0, "frameDetails": "", "den": "", "pet": "", "operations": "", "memories": [{"progress": 0, "memory": "", "contact": "", "ability": "", "source": "", "notes": ""}, {"progress": 0, "memory": "", "contact": "", "ability": "", "source": "", "notes": ""}, {"progress": 0, "memory": "", "contact": "", "ability": "", "source": "", "notes": ""}, {"progress": 0, "memory": "", "contact": "", "ability": "", "source": "", "notes": ""}]}}'::jsonb,'{"abilities": ["Automaton", "A Room of Your Own", "Powerhouse", "Retractable Arsenal", "Energy Beam", "Interface", "Frame Upgrade"], "quiet": 3, "loud": 6, "wallet": 4, "bank": 40, "playbookXp": 8, "attributeXp": 6, "builtInArmor": true, "actionMax": 4, "harmSlots": {"passing": 2, "major": 2, "critical": 1, "mortal": 0}, "source": "Blades ’68 Hull playbook v6 (page 2); book v1.0.1 pp.30–36", "creation": "Hull starts with Skirmish 1 and Attune 1. Add four dots at creation, at most 2 in any action (six total). Start with Automaton and choose one more trait and two frame features. No starting heritage, background, vice, friends, rivals or Keys; your controller is your initial contact.", "xpTrigger": "obeying orders or addressing a challenge with cold simplicity", "contacts": ["Your controller from the owning faction"], "abilityGuidance": "Hull traits cannot be taken as Versatile advances by other playbooks. Powerhouse costs 1 Drain. Energy Beam costs at least 1 Drain, normally 1 per magnitude; Interface uses Attune. Retractable Arsenal conceals built-in items and adds 2 load. Frame Upgrade adds two frame features and may be taken twice. A Room of Your Own permits banking and gives a pet; spending an activity caring for it marks 3 ticks in a chosen memory. All costs and outcomes remain deliberate.", "resourceGuidance": "Recharge from an industrial generator costs one downtime activity and clears 5 Drain. Going On Program is a separate activity. Skipping it ticks Suspicion; resolve full Suspicion and Drain with the GM. No automatic restoration or retirement.", "conditionKind": "hull", "fixedAbilities": ["Automaton"], "abilityChoiceGuidance": "Automaton is preselected; choose one more Hull trait at creation."}'::jsonb);
-- Preserve the then-current identity/condition/equipment/human/companion chain.
alter function bitd.validate_character_patch(jsonb) rename to validate_character_pre_hull_patch;
create function bitd.validate_character_hull_patch(p_patch jsonb) returns void
language plpgsql set search_path = '' as $$
declare e record; item jsonb; n record;
begin
 if not p_patch ? 'hull' then return; end if;
 if jsonb_typeof(p_patch->'hull')<>'object' then raise exception 'Expected Hull record'; end if;
 for e in select * from jsonb_each(p_patch->'hull') loop
  if e.key in ('controller','owningFaction','frameDetails','den','pet','operations') then
   if jsonb_typeof(e.value)<>'string' or length(e.value #>> '{}')>12000 then raise exception 'Invalid Hull text'; end if;
  elsif e.key in ('suspicion','frameUpgrade') then
   if not bitd.character_record_integer(e.value,case when e.key='suspicion' then 4 else 2 end) then raise exception 'Invalid Hull track'; end if;
  elsif e.key='frameFeatures' then
   if jsonb_typeof(e.value)<>'array' or jsonb_array_length(e.value)>6 then raise exception 'Invalid frame features'; end if;
   for item in select * from jsonb_array_elements(e.value) loop
    if jsonb_typeof(item)<>'string' or not (item #>> '{}')=any(array['Advanced Visual Sensors','Lifelike Appearance','Hidden Compartment','Smokescreen Emitter','Surveillance Hardware','Jet Propulsion']) then raise exception 'Unknown frame feature'; end if;
   end loop;
   if (select count(*)<>count(distinct value) from jsonb_array_elements(e.value)) then raise exception 'Duplicate frame feature'; end if;
  elsif e.key='memories' then
   if jsonb_typeof(e.value)<>'array' or jsonb_array_length(e.value)<>4 then raise exception 'Record four human memories'; end if;
   for item in select * from jsonb_array_elements(e.value) loop
    if jsonb_typeof(item)<>'object' or not item ?& array['progress','memory','contact','ability','source','notes'] then raise exception 'Incomplete human memory'; end if;
    for n in select * from jsonb_each(item) loop
     if n.key='progress' then
      if not bitd.character_record_integer(n.value,8) then raise exception 'Memory clocks have eight segments'; end if;
     elsif n.key in ('memory','contact','ability','source','notes') then
      if jsonb_typeof(n.value)<>'string' or length(n.value #>> '{}')>12000 then raise exception 'Invalid memory text'; end if;
     else raise exception 'Unknown human memory field'; end if;
    end loop;
    if (length(regexp_replace(item->>'contact','[[:space:]   -     　﻿]','','g'))>0 or length(regexp_replace(item->>'ability','[[:space:]   -     　﻿]','','g'))>0 or length(regexp_replace(item->>'source','[[:space:]   -     　﻿]','','g'))>0) and (item->>'progress')::integer<>8 then raise exception 'Remembered contact or ability requires a completed memory'; end if;
    if (length(regexp_replace(item->>'ability','[[:space:]   -     　﻿]','','g'))>0)<>(length(regexp_replace(item->>'source','[[:space:]   -     　﻿]','','g'))>0) then raise exception 'Remembered ability requires its name and source'; end if;
    if (item->>'ability')=any(array['Automaton','A Room of Your Own','Powerhouse','Retractable Arsenal','Energy Beam','Interface','Frame Upgrade']) then raise exception 'Memory ability comes from another playbook'; end if;
   end loop;
  else raise exception 'Unknown Hull field: %',e.key; end if;
 end loop;
end $$;
create function bitd.validate_character_patch(p_patch jsonb) returns void
language plpgsql set search_path = '' as $$
begin
 perform bitd.validate_character_pre_hull_patch(p_patch-'hull');
 perform bitd.validate_character_hull_patch(p_patch);
end $$;
create function bitd.check_character_hull_state() returns trigger
language plpgsql set search_path = '' as $$
declare completed integer; human_deadlocks integer; item jsonb;
begin
 perform bitd.validate_character_hull_patch(new.data);
 if new.data->>'playbook'<>'Hull' then
  if new.data ? 'hull' then raise exception 'Hull record requires the saved Hull playbook'; end if;
  for item in select * from jsonb_array_elements(new.data->'versatile') loop
   if (item->>'name')=any(array['Automaton','A Room of Your Own','Powerhouse','Retractable Arsenal','Energy Beam','Interface','Frame Upgrade']) then raise exception 'Hull traits cannot be taken as Versatile advances'; end if;
  end loop;
  return new;
 end if;
 if not new.data ? 'hull' or not (new.data->'abilities') ? 'Automaton' then raise exception 'Hull retains Automaton and Hull records'; end if;
 if (new.data->>'stressCapacity')::integer<>10 then raise exception 'Hull has ten Drain boxes'; end if;
 if (new.data->>'vice')<>'' or (new.data->>'viceHookup')<>'' then raise exception 'Hull recharges instead of Indulging Vice'; end if;
 if (new.data->'hull'->>'frameUpgrade')::integer>0 and not (new.data->'abilities') ? 'Frame Upgrade' then raise exception 'Additional frame selections require Frame Upgrade'; end if;
 if jsonb_array_length(new.data->'hull'->'frameFeatures')>2+2*(new.data->'hull'->>'frameUpgrade')::integer then raise exception 'Choose two frame features plus two per Frame Upgrade selection'; end if;
 if ((new.data->'wealth'->>'bank')::integer>0 or length(regexp_replace(new.data->'hull'->>'den','[[:space:]   -     　﻿]','','g'))>0 or length(regexp_replace(new.data->'hull'->>'pet','[[:space:]   -     　﻿]','','g'))>0) and not (new.data->'abilities') ? 'A Room of Your Own' then raise exception 'Hull banking, den and pet require A Room of Your Own'; end if;
 select count(*) into completed from jsonb_array_elements(new.data->'hull'->'memories') m where (m->>'progress')::integer=8;
 human_deadlocks := 0;
 for item in select * from jsonb_array_elements(new.data->'deadlocks') loop
  if length(regexp_replace(coalesce(item->>'formerKey',''),'[[:space:]   -     　﻿]','','g'))=0 then
   if not (item->>'name')=any(array['Brutal','Detached','Ruthless','Unstable']) then raise exception 'Choose a robotic Deadlock, or name its remembered former Key'; end if;
  else human_deadlocks := human_deadlocks+1; end if;
 end loop;
 if jsonb_array_length(new.data->'keys')+human_deadlocks>completed then raise exception 'Human Keys and their Deadlocks require completed memories'; end if;
 return new;
end $$;
create trigger character_hull_check before insert or update on bitd.characters for each row execute function bitd.check_character_hull_state();
revoke all on function bitd.validate_character_pre_hull_patch(jsonb),bitd.validate_character_hull_patch(jsonb),bitd.validate_character_patch(jsonb),bitd.check_character_hull_state() from public,anon,authenticated;
