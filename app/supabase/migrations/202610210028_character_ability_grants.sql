-- Shared named-ability eligibility. Validated saved playbook state remains authoritative;
-- free text and notes grant nothing. Whitespace matches JavaScript String.trim.
create function bitd.character_has_ability(p_data jsonb,p_name text) returns boolean
language sql immutable set search_path='' as $$
 select coalesce((p_data->'abilities') ? p_name or (
  (p_data->'abilities') ? 'Versatile' and exists(
   select 1 from jsonb_array_elements(p_data->'versatile') v
   where v->>'name'=p_name and coalesce(v->>'source','') ~ U&'[^\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]'
  )
 ) or (p_data->>'playbook'='Hull' and exists(
  select 1 from jsonb_array_elements(p_data->'hull'->'memories') m
  where m->'progress'='8'::jsonb and m->>'ability'=p_name
   and coalesce(m->>'source','') ~ U&'[^\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]'
 )),false)
$$;
create or replace function bitd.validate_character_condition_state(p_data jsonb) returns void
language plpgsql set search_path = '' as $$
begin
 if (p_data->>'stress')::integer > (p_data->>'stressCapacity')::integer then raise exception 'Stress exceeds this sheet’s capacity'; end if;
 if jsonb_array_length(p_data->'keys') + jsonb_array_length(p_data->'deadlocks') > (p_data->>'keyCapacity')::integer then raise exception 'Keys and Deadlocks share this sheet’s capacity'; end if;
 if (p_data->'healing'->>'progress')::integer + (p_data->'healing'->>'permanent')::integer > 4 then raise exception 'Healing clock has four segments including permanent marks'; end if;
 if (p_data->'healing'->>'permanent')::integer > 0 and not bitd.character_has_ability(p_data,'Get Back In There') then raise exception 'Permanent segment requires Get Back In There; record its ability source'; end if;
end $$;
revoke all on function bitd.character_has_ability(jsonb,text),bitd.validate_character_condition_state(jsonb) from public,anon,authenticated;
-- Preserve the character row locks and current-owner checks in existing RPCs.
create or replace function bitd.check_backing_limit(p_character uuid,p_data jsonb) returns void language plpgsql set search_path='' as $$
declare allowed integer;
begin
 allowed := case when bitd.character_has_ability(p_data,'Double Agent') then 2 else 1 end;
 if (select count(*) from bitd.backing_records where character_id=p_character and active)>allowed then raise exception 'One active backing; Double Agent (native, sourced Versatile or completed sourced memory) permits two. End a backing before removing the ability.'; end if;
end $$;
revoke all on function bitd.check_backing_limit(uuid,jsonb) from public,anon,authenticated;
