-- Extend the CURRENT dispatcher; retained helpers preserve earlier crew fields.
alter function bitd.validate_crew_patch(jsonb) rename to validate_crew_tools_patch;

create function bitd.validate_crew_business_field(field text, value jsonb) returns void
language plpgsql set search_path='' as $$
declare k text; v jsonb;
begin
 if field='militantCause' then
  if jsonb_typeof(value) is distinct from 'object' or (select count(*) from jsonb_object_keys(value))<>2 or not(value ?& array['cause','enemies']) then raise exception 'Invalid Militants cause record'; end if;
  if jsonb_typeof(value->'cause') is distinct from 'string' or length(value->>'cause')>5000 then raise exception 'Invalid cause text'; end if;
  if jsonb_typeof(value->'enemies') is distinct from 'array' or jsonb_array_length(value->'enemies')<>2 then raise exception 'Record two Enemies of the Cause'; end if;
  for v in select * from jsonb_array_elements(value->'enemies') loop
   if jsonb_typeof(v) is distinct from 'string' or length(v#>>'{}')>5000 then raise exception 'Invalid enemy text'; end if;
  end loop;
  return;
 end if;
 if jsonb_typeof(value) is distinct from 'object' or (select count(*) from jsonb_object_keys(value))<>6 then raise exception 'Invalid Dealers business record'; end if;
 for k,v in select * from jsonb_each(value) loop
  if k='units' then
   if jsonb_typeof(v) is distinct from 'number' or (v#>>'{}') !~ '^[0-9]{1,4}$' then raise exception 'Enter whole product units from 0 to 9999'; end if;
  elsif k in ('product','supply','demand','distribution','competitiveAdvantages') then
   if jsonb_typeof(v) is distinct from 'string' or length(v#>>'{}')>5000 then raise exception 'Invalid business text: %',k; end if;
  else raise exception 'Unsupported business field: %',k;
  end if;
 end loop;
end $$;

create function bitd.validate_crew_patch(p_patch jsonb) returns void
language plpgsql set search_path='' as $$
declare field text; value jsonb;
begin
 if p_patch is null or jsonb_typeof(p_patch)<>'object' then raise exception 'Crew changes must be an object'; end if;
 for field,value in select * from jsonb_each(p_patch) loop
  if field in ('dealerBusiness','militantCause') then perform bitd.validate_crew_business_field(field,value);
  else perform bitd.validate_crew_tools_patch(jsonb_build_object(field,value)); end if;
 end loop;
end $$;

create function bitd.crew_business_defaults(p_data jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select '{"dealerBusiness":{"product":"","units":0,"supply":"","demand":"","distribution":"","competitiveAdvantages":""},"militantCause":{"cause":"","enemies":["",""]}}'::jsonb || p_data
$$;
update bitd.crews set data=bitd.crew_business_defaults(data);

create function bitd.check_crew_business() returns trigger
language plpgsql set search_path='' as $$
begin
 new.data:=bitd.crew_business_defaults(new.data);
 perform bitd.validate_crew_business_field('dealerBusiness',new.data->'dealerBusiness');
 perform bitd.validate_crew_business_field('militantCause',new.data->'militantCause');
 if tg_op='UPDATE' and new.data->'dealerBusiness' is distinct from old.data->'dealerBusiness' and new.data->>'type'<>'Dealers' then
  raise exception 'Switch crew type to Dealers before editing its retained business';
 end if;
 if tg_op='UPDATE' and new.data->'militantCause' is distinct from old.data->'militantCause' and new.data->>'type'<>'Militants' then
  raise exception 'Switch crew type to Militants before editing its retained cause';
 end if;
 return new;
end $$;
create trigger crew_business_check before insert or update of data on bitd.crews for each row execute function bitd.check_crew_business();
revoke all on function bitd.validate_crew_tools_patch(jsonb),bitd.validate_crew_business_field(text,jsonb),bitd.validate_crew_patch(jsonb),bitd.crew_business_defaults(jsonb),bitd.check_crew_business() from public,anon,authenticated;
