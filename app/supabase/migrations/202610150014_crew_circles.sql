-- Preserve the #13 dispatcher and the exercised #12 -> #13 -> #14 chain.
alter function bitd.validate_crew_patch(jsonb) rename to validate_crew_business_patch;
create function bitd.validate_racer_circuit(value jsonb) returns void
language plpgsql set search_path='' as $$
declare item jsonb; field text; v jsonb;
begin
 if jsonb_typeof(value) is distinct from 'object' or (select count(*) from jsonb_object_keys(value))<>4 or not(value ?& array['circuit','operations','signatureStunts','vehicles']) then raise exception 'Invalid Racers circuit record'; end if;
 if jsonb_typeof(value->'circuit') is distinct from 'string' or length(value->>'circuit')>5000 then raise exception 'Invalid local circuit'; end if;
 foreach field in array array['operations','signatureStunts'] loop
  v:=value->field;
  if jsonb_typeof(v) is distinct from 'array' or jsonb_array_length(v)>6 then raise exception 'Invalid Racers choices'; end if;
  if (select count(*) from jsonb_array_elements(v))<>(select count(distinct x) from jsonb_array_elements(v) x) then raise exception 'Duplicate Racers choice'; end if;
  for item in select * from jsonb_array_elements(v) loop
   if jsonb_typeof(item) is distinct from 'string' or (field='operations' and not(item#>>'{}'=any(array['Smuggling','Hijacking','Racing','Smash-and-Grab']))) or (field='signatureStunts' and not(item#>>'{}'=any(array['Smuggler’s Turn','Reverse 180','Shell Game','Outside Ride','Big Air','Ramming Speed']))) then raise exception 'Choose a verified Racers operation or signature stunt'; end if;
  end loop;
 end loop;
 if jsonb_typeof(value->'vehicles') is distinct from 'array' or jsonb_array_length(value->'vehicles')>100 then raise exception 'Invalid Racers vehicles'; end if;
 if (select count(*) from jsonb_array_elements(value->'vehicles'))<>(select count(distinct x->>'id') from jsonb_array_elements(value->'vehicles') x) then raise exception 'Vehicle identities must be unique'; end if;
 for item in select * from jsonb_array_elements(value->'vehicles') loop
  if jsonb_typeof(item) is distinct from 'object' or (select count(*) from jsonb_object_keys(item))<>5 or not(item ?& array['id','name','edges','flaws','notes']) then raise exception 'Invalid vehicle record'; end if;
  foreach field in array array['id','name','notes'] loop
   if jsonb_typeof(item->field) is distinct from 'string' or length(item->>field)>(case when field='notes' then 5000 else 100 end) or (field<>'notes' and length(trim(item->>field))=0) then raise exception 'Invalid vehicle text'; end if;
  end loop;
  foreach field in array array['edges','flaws'] loop
   v:=item->field;
   if jsonb_typeof(v) is distinct from 'array' or jsonb_array_length(v)>2 then raise exception 'Record at most two vehicle traits of each kind'; end if;
   if (select count(*) from jsonb_array_elements(v))<>(select count(distinct x) from jsonb_array_elements(v) x) then raise exception 'Duplicate vehicle trait'; end if;
   if exists(select 1 from jsonb_array_elements(v) x where jsonb_typeof(x) is distinct from 'string' or (field='edges' and not(x#>>'{}'=any(array['Nimble','Simple','Sturdy']))) or (field='flaws' and not(x#>>'{}'=any(array['Distinct','Finicky','Guzzler'])))) then raise exception 'Choose verified vehicle edges and flaws'; end if;
  end loop;
 end loop;
end $$;
create function bitd.validate_utopian_vision(value jsonb) returns void
language plpgsql set search_path='' as $$
declare field text; v jsonb;
begin
 if jsonb_typeof(value) is distinct from 'object' or (select count(*) from jsonb_object_keys(value))<>7 or not(value ?& array['vision','circle','stacksEarned','livesEnded','majorAnomalyCreated','truths','anomalies']) then raise exception 'Invalid Utopian vision record'; end if;
 foreach field in array array['vision','anomalies'] loop
  if jsonb_typeof(value->field) is distinct from 'string' or length(value->>field)>5000 then raise exception 'Invalid Utopian text'; end if;
 end loop;
 foreach field in array array['circle','stacksEarned','livesEnded'] loop
  if jsonb_typeof(value->field) is distinct from 'number' or (value->>field)!~'^[0-9]{1,4}$' then raise exception 'Enter whole Utopian counters from 0 to 9999'; end if;
 end loop;
 if (value->>'circle')::integer not between 1 and 4 then raise exception 'Choose a Utopian Circle from 1 to 4'; end if;
 if jsonb_typeof(value->'majorAnomalyCreated') is distinct from 'boolean' then raise exception 'Record whether a major anomaly was created'; end if;
 if jsonb_typeof(value->'truths') is distinct from 'array' or jsonb_array_length(value->'truths')<>5 then raise exception 'Record two First Circle truths and one for each later Circle'; end if;
 for v in select * from jsonb_array_elements(value->'truths') loop
  if jsonb_typeof(v) is distinct from 'string' or length(v#>>'{}')>5000 then raise exception 'Invalid Utopian truth'; end if;
 end loop;
end $$;
-- Circle membership follows actual printed spaces, including alternating Turf IDs.
update bitd.crew_catalog set data=jsonb_set(data,'{claims}',(
 select jsonb_agg(d || jsonb_build_object('circle',case d->>'id'
 when 'utopians-claim-1' then 1 when 'utopians-claim-2' then 2 when 'utopians-claim-3' then 3 when 'utopians-claim-4' then 4
 when 'utopians-claim-5' then 2 when 'utopians-claim-6' then 3 when 'utopians-claim-7' then 4 when 'utopians-claim-8' then 1
 when 'utopians-claim-9' then 2 when 'utopians-claim-10' then 3 when 'utopians-claim-11' then 4 when 'utopians-claim-12' then 1
 when 'utopians-claim-13' then 2 when 'utopians-claim-14' then 3 when 'utopians-claim-15' then 4 when 'utopians-claim-16' then 1
 when 'utopians-claim-17' then 2 when 'utopians-claim-18' then 3 when 'utopians-claim-19' then 4 end)) from jsonb_array_elements(data->'claims') d
)) where crew_type='Utopians';
create function bitd.validate_crew_patch(p_patch jsonb) returns void
language plpgsql set search_path='' as $$
declare field text; value jsonb;
begin
 if p_patch is null or jsonb_typeof(p_patch)<>'object' then raise exception 'Crew changes must be an object'; end if;
 for field,value in select * from jsonb_each(p_patch) loop
  if field='racerCircuit' then perform bitd.validate_racer_circuit(value);
  elsif field='utopianVision' then perform bitd.validate_utopian_vision(value);
  else perform bitd.validate_crew_business_patch(jsonb_build_object(field,value)); end if;
 end loop;
end $$;
create function bitd.crew_circles_defaults(p_data jsonb) returns jsonb
language sql immutable set search_path='' as $$ select '{"racerCircuit":{"circuit":"","operations":[],"signatureStunts":[],"vehicles":[]},"utopianVision":{"vision":"","circle":1,"stacksEarned":0,"livesEnded":0,"majorAnomalyCreated":false,"truths":["","","","",""],"anomalies":""}}'::jsonb || p_data $$;
update bitd.crews set data=bitd.crew_circles_defaults(data);
create function bitd.check_crew_circles() returns trigger
language plpgsql security definer set search_path='' as $$
declare vision jsonb; circle_number integer; field text; cat jsonb; item jsonb; required_circle integer;
begin
 new.data:=bitd.crew_circles_defaults(new.data);
 perform bitd.validate_racer_circuit(new.data->'racerCircuit');
 perform bitd.validate_utopian_vision(new.data->'utopianVision');
 if tg_op='UPDATE' and new.data->'racerCircuit' is distinct from old.data->'racerCircuit' and new.data->>'type'<>'Racers' then raise exception 'Switch crew type to Racers before editing its retained circuit'; end if;
 if tg_op='UPDATE' and new.data->'utopianVision' is distinct from old.data->'utopianVision' and new.data->>'type'<>'Utopians' then raise exception 'Switch crew type to Utopians before editing its retained vision'; end if;
 vision:=new.data->'utopianVision'; circle_number:=(vision->>'circle')::integer;
 if tg_op='UPDATE' and circle_number>(old.data->'utopianVision'->>'circle')::integer+1 then raise exception 'Review and save each Circle in order'; end if;
 if new.data->>'type'='Utopians' then
 if circle_number>=2 and (vision->>'stacksEarned')::integer<20 then raise exception 'Threshold of Gold requires 20 earned stacks, not the wallet'; end if;
 if circle_number>=3 and (vision->>'livesEnded')::integer<10 then raise exception 'Threshold of Blood requires 10 lives ended'; end if;
 if circle_number=4 and ((new.data->>'tier')::integer<3 or not(vision->>'majorAnomalyCreated')::boolean) then raise exception 'Threshold of Power requires Tier 3 and a created major anomaly'; end if;
  select data into cat from bitd.crew_catalog where crew_type='Utopians';
  foreach field in array array['abilities','claims'] loop
   for item in select * from jsonb_array_elements(new.data->field) loop
    select (d->>'circle')::integer into required_circle from jsonb_array_elements(cat->field) d where d->>'id'=item->>'catalogId';
    if required_circle>circle_number then raise exception 'This % entry requires Utopian Circle %; review the saved Circle first',field,required_circle; end if;
   end loop;
  end loop;
 end if;
 return new;
end $$;
create trigger crew_circles_check before insert or update of data on bitd.crews for each row execute function bitd.check_crew_circles();
revoke all on function bitd.validate_crew_business_patch(jsonb),bitd.validate_racer_circuit(jsonb),bitd.validate_utopian_vision(jsonb),bitd.validate_crew_patch(jsonb),bitd.crew_circles_defaults(jsonb),bitd.check_crew_circles() from public,anon,authenticated;
