-- Shared score records contain no GM-private fields. Clocks retain their own RLS boundary.
create function bitd.initialize_score_record() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.opportunity_id is not null then new.data:=jsonb_build_object('activeNotes','','outcome','','recap','','startedAt',null,'finishedAt',null)||new.data; end if;
  return new;
end $$;
create trigger initialize_score_record before insert on bitd.scores for each row execute function bitd.initialize_score_record();
update bitd.scores set data=jsonb_build_object('activeNotes','','outcome','','recap','','startedAt',null,'finishedAt',null)||data where opportunity_id is not null;
-- Append-only accepted changes preserve earlier outcomes and recaps after corrections.
create table bitd.score_events (
 id uuid primary key default gen_random_uuid(), campaign_id uuid not null references bitd.campaigns on delete cascade,
 score_id uuid not null references bitd.scores on delete cascade, actor_id uuid not null references auth.users,
 data jsonb not null, created_at timestamptz not null default clock_timestamp()
);
alter table bitd.score_events enable row level security;
grant select on bitd.score_events to authenticated;
create policy score_event_member_read on bitd.score_events for select to authenticated using(bitd.campaign_role(campaign_id) is not null);
-- Preserve #18 selection snapshots/retries; lifecycle and selection share cycle-first lock order.
alter function bitd.select_opportunity(uuid,bigint,bigint) rename to select_planned_opportunity;
revoke all on function bitd.select_planned_opportunity(uuid,bigint,bigint) from authenticated;
create function bitd.select_opportunity(p_opportunity uuid,p_revision bigint,p_cycle_revision bigint) returns bitd.scores
language plpgsql security definer set search_path = '' as $$
declare campaign uuid; cycle bitd.campaign_cycles; current_score bitd.scores;
begin
 select campaign_id into campaign from bitd.opportunities where id=p_opportunity;
 if bitd.campaign_role(campaign) is distinct from 'gm' then raise exception 'GM membership required' using errcode='42501'; end if;
 select * into cycle from bitd.campaign_cycles where campaign_id=campaign for update;
 select * into current_score from bitd.scores where id=cycle.selected_score_id;
 if current_score.data->>'status'='active' and current_score.opportunity_id is distinct from p_opportunity then raise exception 'Complete or cancel the active primary score before selecting another'; end if;
 return bitd.select_planned_opportunity(p_opportunity,p_revision,p_cycle_revision);
end $$;
create function bitd.transition_score(p_score uuid,p_status text,p_revision bigint) returns bitd.scores
language plpgsql security definer set search_path = '' as $$
declare result bitd.scores; campaign uuid; cycle bitd.campaign_cycles; saved_status text;
begin
 select campaign_id into campaign from bitd.scores where id=p_score and opportunity_id is not null;
 if bitd.campaign_role(campaign) is distinct from 'gm' then raise exception 'GM membership required' using errcode='42501'; end if;
 select * into cycle from bitd.campaign_cycles where campaign_id=campaign for update;
 select * into result from bitd.scores where id=p_score for update;
 if p_status is null or p_status not in ('active','completed','cancelled') then raise exception 'Choose active, completed or cancelled'; end if;
 saved_status:=result.data->>'status';
 if saved_status=p_status then return result; end if;
 if result.revision is distinct from p_revision then raise exception 'Record changed elsewhere. Reload before changing score status.' using errcode='40001'; end if;
 if p_status='active' and (saved_status<>'planned' or cycle.selected_score_id is distinct from result.id) then raise exception 'Start only the selected planned primary score'; end if;
 if p_status='completed' and saved_status<>'active' then raise exception 'Complete only an active score'; end if;
 if p_status='cancelled' and saved_status not in ('planned','active') then raise exception 'Cancel only a planned or active score'; end if;
 update bitd.scores set data=data||jsonb_build_object('status',p_status,case when p_status='active' then 'startedAt' else 'finishedAt' end,clock_timestamp()),revision=revision+1,updated_at=clock_timestamp() where id=p_score returning * into result;
 insert into bitd.score_events(campaign_id,score_id,actor_id,data) values(campaign,p_score,auth.uid(),jsonb_build_object('status',p_status,'revision',result.revision));
 return result;
end $$;
create function bitd.validate_score_record(p_patch jsonb) returns void language plpgsql set search_path = '' as $$
declare field text; value jsonb;
begin
 if p_patch is null or jsonb_typeof(p_patch)<>'object' then raise exception 'Score changes must be an object'; end if;
 for field,value in select * from jsonb_each(p_patch) loop
  if field not in ('activeNotes','outcome','recap') then raise exception 'Unsupported score record field: %',field; end if;
  if jsonb_typeof(value)<>'string' or length(value #>> '{}')>5000 then raise exception 'Invalid score text: %',field; end if;
 end loop;
end $$;
create function bitd.update_score_record(p_score uuid,p_patch jsonb,p_expected jsonb) returns bitd.scores
language plpgsql security definer set search_path = '' as $$
declare result bitd.scores; role text;
begin
 select * into result from bitd.scores where id=p_score and opportunity_id is not null for update;
 role:=bitd.campaign_role(result.campaign_id);
 if result.id is null or role is null then raise exception 'Campaign membership required' using errcode='42501'; end if;
 perform bitd.validate_score_record(p_patch);
 if role<>'gm' and p_patch ?| array['outcome','recap'] then raise exception 'GM records outcomes and recaps' using errcode='42501'; end if;
 perform bitd.assert_planning_expected(result.data,p_patch,p_expected);
 update bitd.scores set data=data||p_patch,revision=revision+1,updated_at=clock_timestamp() where id=p_score returning * into result;
 if p_patch ?| array['outcome','recap'] then insert into bitd.score_events(campaign_id,score_id,actor_id,data) values(result.campaign_id,p_score,auth.uid(),jsonb_build_object('outcome',result.data->'outcome','recap',result.data->'recap','revision',result.revision)); end if;
 return result;
end $$;
revoke all on function bitd.initialize_score_record(),bitd.validate_score_record(jsonb),bitd.select_opportunity(uuid,bigint,bigint),bitd.transition_score(uuid,text,bigint),bitd.update_score_record(uuid,jsonb,jsonb) from public;
grant execute on function bitd.select_opportunity(uuid,bigint,bigint),bitd.transition_score(uuid,text,bigint),bitd.update_score_record(uuid,jsonb,jsonb) to authenticated;

-- Nested crew cohort IDs are stable references, not foreign keys. Preserve source snapshots.
create table bitd.score_activities (
 id uuid primary key default gen_random_uuid(), campaign_id uuid not null references bitd.campaigns on delete cascade,
 score_id uuid not null references bitd.scores on delete cascade, crew_id uuid not null references bitd.crews,
 cohort_id text not null, opportunity_id uuid references bitd.opportunities,
 data jsonb not null, revision bigint not null default 1, updated_at timestamptz not null default clock_timestamp()
);
create unique index one_secondary_per_score on bitd.score_activities(score_id) where data->>'kind'='secondary';
alter table bitd.score_activities enable row level security;
grant select on bitd.score_activities to authenticated;
create policy score_activity_member_read on bitd.score_activities for select to authenticated using(bitd.campaign_role(campaign_id) is not null);
alter table bitd.score_events add column activity_id uuid references bitd.score_activities on delete cascade;
create function bitd.create_score_activity(p_score uuid,p_crew uuid,p_cohort text,p_opportunity uuid,p_kind text) returns bitd.score_activities
language plpgsql security definer set search_path = '' as $$
declare score bitd.scores; crew bitd.crews; opportunity bitd.opportunities; cohort jsonb; result bitd.score_activities;
begin
 select * into score from bitd.scores where id=p_score and opportunity_id is not null for update;
 if score.id is null or bitd.campaign_role(score.campaign_id) is distinct from 'gm' then raise exception 'GM membership required' using errcode='42501'; end if;
 if p_kind is null or p_kind not in ('participation','secondary') then raise exception 'Choose cohort participation or secondary score'; end if;
 select * into crew from bitd.crews where id=p_crew and campaign_id=score.campaign_id for share;
 if crew.id is null then raise exception 'Choose a crew from this campaign'; end if;
 select value into cohort from jsonb_array_elements(crew.data->'cohorts') where value->>'id'=p_cohort;
 if cohort is null then raise exception 'Choose a current crew cohort'; end if;
 if p_kind='secondary' then
  select * into opportunity from bitd.opportunities where id=p_opportunity and campaign_id=score.campaign_id for share;
  if opportunity.id is null or opportunity.data->'targetTier'='null'::jsonb then raise exception 'Choose a remaining opportunity with target Tier'; end if;
  if exists(select 1 from bitd.scores where opportunity_id=p_opportunity) then raise exception 'Choose an opportunity not already selected as a primary score'; end if;
  if exists(select 1 from bitd.score_activities where score_id=p_score and data->>'kind'='secondary') then raise exception 'This primary score already has a retained secondary score'; end if;
 elsif p_opportunity is not null then raise exception 'Primary participation uses the primary score snapshot';
 end if;
 insert into bitd.score_activities(campaign_id,score_id,crew_id,cohort_id,opportunity_id,data) values(score.campaign_id,p_score,p_crew,p_cohort,p_opportunity,
  jsonb_build_object('kind',p_kind,'cohort',cohort,'opportunity',case when p_kind='secondary' then opportunity.data else score.data->'opportunity' end,'status','planned','activeNotes','','outcome','','recap','','startedAt',null,'finishedAt',null)) returning * into result;
 return result;
end $$;
create function bitd.update_score_activity(p_activity uuid,p_patch jsonb,p_expected jsonb) returns bitd.score_activities
language plpgsql security definer set search_path = '' as $$
declare result bitd.score_activities; role text;
begin
 select * into result from bitd.score_activities where id=p_activity for update;
 role:=bitd.campaign_role(result.campaign_id);
 if result.id is null or role is null then raise exception 'Campaign membership required' using errcode='42501'; end if;
 perform bitd.validate_score_record(p_patch);
 if role<>'gm' and p_patch ?| array['outcome','recap'] then raise exception 'GM records outcomes and recaps' using errcode='42501'; end if;
 perform bitd.assert_planning_expected(result.data,p_patch,p_expected);
 update bitd.score_activities set data=data||p_patch,revision=revision+1,updated_at=clock_timestamp() where id=p_activity returning * into result;
 if p_patch ?| array['outcome','recap'] then insert into bitd.score_events(campaign_id,score_id,activity_id,actor_id,data) values(result.campaign_id,result.score_id,p_activity,auth.uid(),jsonb_build_object('outcome',result.data->'outcome','recap',result.data->'recap','revision',result.revision)); end if;
 return result;
end $$;
create function bitd.transition_score_activity(p_activity uuid,p_status text,p_revision bigint) returns bitd.score_activities
language plpgsql security definer set search_path = '' as $$
declare result bitd.score_activities; saved_status text;
begin
 select * into result from bitd.score_activities where id=p_activity for update;
 if result.id is null or bitd.campaign_role(result.campaign_id) is distinct from 'gm' then raise exception 'GM membership required' using errcode='42501'; end if;
 if p_status is null or p_status not in ('active','completed','cancelled') then raise exception 'Choose active, completed or cancelled'; end if;
 saved_status:=result.data->>'status';
 if saved_status=p_status then return result; end if;
 if result.revision is distinct from p_revision then raise exception 'Record changed elsewhere. Reload before changing activity status.' using errcode='40001'; end if;
 if p_status='active' and saved_status<>'planned' then raise exception 'Start only a planned activity'; end if;
 if p_status='completed' and saved_status<>'active' then raise exception 'Complete only an active activity'; end if;
 if p_status='cancelled' and saved_status not in ('planned','active') then raise exception 'Cancel only a planned or active activity'; end if;
 update bitd.score_activities set data=data||jsonb_build_object('status',p_status,case when p_status='active' then 'startedAt' else 'finishedAt' end,clock_timestamp()),revision=revision+1,updated_at=clock_timestamp() where id=p_activity returning * into result;
 insert into bitd.score_events(campaign_id,score_id,activity_id,actor_id,data) values(result.campaign_id,result.score_id,p_activity,auth.uid(),jsonb_build_object('status',p_status,'revision',result.revision));
 return result;
end $$;
revoke all on function bitd.create_score_activity(uuid,uuid,text,uuid,text),bitd.update_score_activity(uuid,jsonb,jsonb),bitd.transition_score_activity(uuid,text,bigint) from public;
grant execute on function bitd.create_score_activity(uuid,uuid,text,uuid,text),bitd.update_score_activity(uuid,jsonb,jsonb),bitd.transition_score_activity(uuid,text,bigint) to authenticated;
