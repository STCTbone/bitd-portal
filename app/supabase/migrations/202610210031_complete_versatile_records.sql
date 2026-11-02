-- Keep the composed validators and owner/GM RPC authorization unchanged.
-- A list replacement must supply every text key; empty strings remain drafts.
alter function bitd.validate_character_patch(jsonb) rename to validate_character_pre_complete_versatile_patch;
create function bitd.validate_character_patch(p_patch jsonb) returns void
language plpgsql set search_path='' as $$
declare item jsonb;
begin
 perform bitd.validate_character_pre_complete_versatile_patch(p_patch);
 if p_patch ? 'versatile' then
  for item in select * from jsonb_array_elements(p_patch->'versatile') loop
   if not (item ?& array['name','source','notes']) then
    raise exception 'Versatile records require name, source and notes text fields';
   end if;
  end loop;
 end if;
end $$;
revoke all on function bitd.validate_character_pre_complete_versatile_patch(jsonb),bitd.validate_character_patch(jsonb) from public,anon,authenticated;
