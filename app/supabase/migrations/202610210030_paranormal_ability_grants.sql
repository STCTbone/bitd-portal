-- Future Shock (v6 p11, book v1.0.1 p338) explicitly grants another-playbook
-- ability paired with a new native trait at a playbook advance. Past original-game
-- records remain manual. Delegate existing native/Versatile/Hull semantics intact.
alter function bitd.character_has_ability(jsonb,text) rename to character_has_pre_paranormal_ability;
create function bitd.character_has_ability(p_data jsonb,p_name text) returns boolean language sql immutable set search_path='' as $$
 select bitd.character_has_pre_paranormal_ability(p_data,p_name) or coalesce(
  p_data->>'playbook'='Time Traveler from the Future'
  and (p_data->'abilities') ? 'Future Shock'
  and exists(select 1 from jsonb_array_elements(p_data->'traveler'->'gainedAbilities') a
   where a->>'name'=p_name and bitd.paranormal_source_present(a->>'source')
   and (p_data->'abilities') ? (a->>'trait')
   and (p_data->'sheet'->'abilities') ? (a->>'trait')
   and not (p_data->'sheet'->'fixedAbilities') ? (a->>'trait')
  ),false)
$$;
revoke all on function bitd.character_has_pre_paranormal_ability(jsonb,text),bitd.character_has_ability(jsonb,text) from public,anon,authenticated;
