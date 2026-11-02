-- Reviewed public effects and private working records have separate read boundaries.
create table bitd.aftermath_proposals (
 id uuid primary key default gen_random_uuid(), campaign_id uuid not null references bitd.campaigns on delete cascade,
 score_id uuid not null references bitd.scores on delete cascade, score_revision bigint not null,
 effects jsonb not null, recap text not null check(length(recap)<=5000), reason text not null check(length(reason)<=5000),
 correction_of uuid, actor_id uuid not null, created_at timestamptz not null default clock_timestamp()
);
create table bitd.aftermath_receipts (
 id uuid primary key default gen_random_uuid(), campaign_id uuid not null references bitd.campaigns on delete cascade,
 score_id uuid not null references bitd.scores on delete cascade,
 proposal_id uuid not null unique references bitd.aftermath_proposals,
 correction_of uuid unique references bitd.aftermath_receipts,
 effects jsonb not null, recap text not null, reason text not null, actor_id uuid not null,
 created_at timestamptz not null default clock_timestamp()
);
create unique index aftermath_one_base_per_score on bitd.aftermath_receipts(score_id) where correction_of is null;
alter table bitd.aftermath_proposals add foreign key(correction_of) references bitd.aftermath_receipts;
alter table bitd.aftermath_proposals enable row level security;
alter table bitd.aftermath_receipts enable row level security;
grant select on bitd.aftermath_proposals,bitd.aftermath_receipts to authenticated;
create policy aftermath_working_gm on bitd.aftermath_proposals for select to authenticated using(bitd.campaign_role(campaign_id)='gm');
create policy aftermath_receipt_members on bitd.aftermath_receipts for select to authenticated using(bitd.campaign_role(campaign_id) is not null);

create function bitd.validate_aftermath_effects(p_effects jsonb) returns void language plpgsql set search_path='' as $$
declare e jsonb;
begin
 if p_effects is null or jsonb_typeof(p_effects)<>'array' or jsonb_array_length(p_effects)>100 then raise exception 'Expected up to 100 reviewed effects'; end if;
 for e in select value from jsonb_array_elements(p_effects) loop
  if jsonb_typeof(e)<>'object' or not (e ?& array['kind','id','field','expected','value']) or
    (select count(*) from jsonb_object_keys(e))<>5 then raise exception 'Invalid effect shape'; end if;
  if jsonb_typeof(e->'id')<>'string' or jsonb_typeof(e->'field')<>'string' or jsonb_typeof(e->'kind')<>'string' then raise exception 'Invalid effect target'; end if;
  perform (e->>'id')::uuid;
  if not ((e->>'kind'='crew' and e->>'field' in ('stacks','rep','heat','wanted','anger')) or
   (e->>'kind'='character' and e->>'field' in ('wealth.stacks','wealth.bank','stress','harm.passing','harm.major','harm.critical','harm.mortal','healing.progress')) or
   (e->>'kind'='faction' and e->>'field'='status')) then raise exception 'Unsupported Aftermath effect'; end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_effects) entry group by entry->>'kind',entry->>'id',entry->>'field' having count(*)>1) then raise exception 'Duplicate effect target field'; end if;
end $$;

create function bitd.propose_aftermath(p_score uuid,p_effects jsonb,p_recap text,p_reason text,p_correction_of uuid default null)
returns bitd.aftermath_proposals language plpgsql security definer set search_path='' as $$
declare s bitd.scores; result bitd.aftermath_proposals;
begin
 select * into s from bitd.scores where id=p_score;
 if bitd.campaign_role(s.campaign_id) is distinct from 'gm' then raise exception 'Current GM membership required' using errcode='42501'; end if;
 if s.data->>'status'<>'completed' then raise exception 'Complete the score before reviewing Aftermath'; end if;
 perform bitd.validate_aftermath_effects(p_effects);
 if p_recap is null or p_reason is null then raise exception 'Recap and reason must be text'; end if;
 if p_correction_of is not null and (length(trim(p_reason))=0 or not exists(select 1 from bitd.aftermath_receipts where id=p_correction_of and score_id=s.id and campaign_id=s.campaign_id)) then raise exception 'Correction requires this score’s receipt and an explicit reason'; end if;
 insert into bitd.aftermath_proposals(campaign_id,score_id,score_revision,effects,recap,reason,correction_of,actor_id)
 values(s.campaign_id,s.id,s.revision,p_effects,p_recap,p_reason,p_correction_of,auth.uid()) returning * into result;
 return result;
end $$;

create function bitd.confirm_aftermath(p_proposal uuid) returns bitd.aftermath_receipts
language plpgsql security definer set search_path='' as $$
declare p bitd.aftermath_proposals; s bitd.scores; r bitd.aftermath_receipts; e jsonb; saved jsonb; path text[]; patch jsonb; c bitd.characters; crew bitd.crews; faction bitd.faction_records;
begin
 select * into p from bitd.aftermath_proposals where id=p_proposal;
 if bitd.campaign_role(p.campaign_id) is distinct from 'gm' then raise exception 'Current GM membership required' using errcode='42501'; end if;
 -- Lifecycle and all confirmations use cycle → score → proposal → ordered target rows.
 perform 1 from bitd.campaign_cycles where campaign_id=p.campaign_id for update;
 select * into s from bitd.scores where id=p.score_id for update;
 perform 1 from bitd.aftermath_proposals where id=p.id for update;
 select * into r from bitd.aftermath_receipts where proposal_id=p.id;
 if found then return r; end if;
 if s.revision<>p.score_revision or s.data->>'status'<>'completed' then raise exception 'Score changed; create a fresh review' using errcode='40001'; end if;
 if p.correction_of is null then
  if exists(select 1 from bitd.aftermath_receipts where score_id=s.id and correction_of is null) then raise exception 'Aftermath already confirmed; create an explicit correction' using errcode='40001'; end if;
 elsif exists(select 1 from bitd.aftermath_receipts where correction_of=p.correction_of) then raise exception 'Receipt already corrected; review latest receipt' using errcode='40001'; end if;
 perform bitd.validate_aftermath_effects(p.effects);
 perform 1 from bitd.characters where campaign_id=p.campaign_id and id in(select (value->>'id')::uuid from jsonb_array_elements(p.effects) where value->>'kind'='character') order by id for update;
 perform 1 from bitd.crews where campaign_id=p.campaign_id and id in(select (value->>'id')::uuid from jsonb_array_elements(p.effects) where value->>'kind'='crew') order by id for update;
 perform 1 from bitd.faction_records where campaign_id=p.campaign_id and id in(select (value->>'id')::uuid from jsonb_array_elements(p.effects) where value->>'kind'='faction') order by id for update;
 for e in select value from jsonb_array_elements(p.effects) loop
  path:=string_to_array(e->>'field','.');
  if e->>'kind'='character' then
   select * into c from bitd.characters where id=(e->>'id')::uuid and campaign_id=p.campaign_id;
   if not found then raise exception 'Invalid campaign character'; end if; saved:=c.data #> path;
  elsif e->>'kind'='crew' then
   select * into crew from bitd.crews where id=(e->>'id')::uuid and campaign_id=p.campaign_id;
   if not found then raise exception 'Invalid campaign crew'; end if; saved:=crew.data #> path;
  else
   select * into faction from bitd.faction_records where id=(e->>'id')::uuid and campaign_id=p.campaign_id;
   if not found then raise exception 'Invalid campaign faction'; end if; saved:=to_jsonb(faction.status);
  end if;
  if saved is distinct from e->'expected' then raise exception 'Target changed; create a fresh review' using errcode='40001'; end if;
  patch:=case when cardinality(path)=1 then jsonb_build_object(path[1],e->'value') else jsonb_build_object(path[1],jsonb_build_object(path[2],e->'value')) end;
  -- Delegate through the existing permission/shape/final-state validators; no raw patch escape hatch.
  if e->>'kind'='character' then perform bitd.patch_character(c.id,patch);
  elsif e->>'kind'='crew' then perform bitd.update_crew(p.campaign_id,patch,jsonb_build_object(path[1],saved));
  else perform bitd.patch_faction(faction.id,patch,faction.version); end if;
 end loop;
 insert into bitd.aftermath_receipts(campaign_id,score_id,proposal_id,correction_of,effects,recap,reason,actor_id)
 values(p.campaign_id,s.id,p.id,p.correction_of,p.effects,p.recap,p.reason,auth.uid()) returning * into r;
 return r;
end $$;
revoke all on function bitd.validate_aftermath_effects(jsonb) from public,anon,authenticated;
revoke all on function bitd.propose_aftermath(uuid,jsonb,text,text,uuid),bitd.confirm_aftermath(uuid) from public,anon;
grant execute on function bitd.propose_aftermath(uuid,jsonb,text,text,uuid),bitd.confirm_aftermath(uuid) to authenticated;

-- GM working notes are private by default; sharing is an explicit per-record decision.
create table bitd.aftermath_manual (
 id uuid primary key default gen_random_uuid(),campaign_id uuid not null references bitd.campaigns on delete cascade,
 score_id uuid not null references bitd.scores on delete cascade,
 kind text not null check(kind in ('Trouble','Ward boss','Recovery','Harm complication','Mandate','Other')),
 title text not null check(length(title) between 1 and 200), notes text not null check(length(notes)<=10000),
 shared boolean not null default false, revision bigint not null default 1, updated_at timestamptz not null default clock_timestamp()
);
alter table bitd.aftermath_manual enable row level security;
grant select on bitd.aftermath_manual to authenticated;
create policy aftermath_manual_permitted on bitd.aftermath_manual for select to authenticated using(bitd.campaign_role(campaign_id)='gm' or (shared and bitd.campaign_role(campaign_id) is not null));
create function bitd.save_aftermath_manual(p_score uuid,p_id uuid,p_revision bigint,p_kind text,p_title text,p_notes text,p_shared boolean)
returns bitd.aftermath_manual language plpgsql security definer set search_path='' as $$
declare s bitd.scores; r bitd.aftermath_manual;
begin
 select * into s from bitd.scores where id=p_score;
 if bitd.campaign_role(s.campaign_id) is distinct from 'gm' then raise exception 'Current GM membership required' using errcode='42501'; end if;
 if p_id is null then
  insert into bitd.aftermath_manual(campaign_id,score_id,kind,title,notes,shared) values(s.campaign_id,s.id,p_kind,p_title,p_notes,p_shared) returning * into r;
 else
  select * into r from bitd.aftermath_manual where id=p_id and score_id=s.id and campaign_id=s.campaign_id for update;
  if not found then raise exception 'Manual record unavailable'; end if;
  if r.revision is distinct from p_revision then raise exception 'Manual record changed; reload' using errcode='40001'; end if;
  update bitd.aftermath_manual set kind=p_kind,title=p_title,notes=p_notes,shared=p_shared,revision=revision+1,updated_at=clock_timestamp() where id=r.id returning * into r;
 end if;
 return r;
end $$;
revoke all on function bitd.save_aftermath_manual(uuid,uuid,bigint,text,text,text,boolean) from public,anon;
grant execute on function bitd.save_aftermath_manual(uuid,uuid,bigint,text,text,text,boolean) to authenticated;
