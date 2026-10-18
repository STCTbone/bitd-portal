-- Rejoin establishes membership; only a deliberate GM action transfers an owner.
create function bitd.list_campaign_participants(p_campaign uuid)
returns table(user_id uuid, role text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if bitd.campaign_role(p_campaign) is distinct from 'gm' then
    raise exception 'GM membership required' using errcode = '42501';
  end if;
  return query select m.user_id, m.role from bitd.campaign_members m
    where m.campaign_id = p_campaign order by m.user_id;
end $$;

create function bitd.assign_character_owner(p_character uuid, p_owner uuid, p_expected_owner uuid)
returns bitd.characters
language plpgsql security definer set search_path = '' as $$
declare result bitd.characters;
begin
  select * into result from bitd.characters where id = p_character for update;
  if not found or bitd.campaign_role(result.campaign_id) is distinct from 'gm' then
    raise exception 'GM membership required' using errcode = '42501';
  end if;
  if result.owner_id is distinct from p_expected_owner then
    raise exception 'Ownership changed. Reload the current owner and review again.' using errcode = '40001';
  end if;
  if p_owner is not null then
    -- Keep the selected membership present until this transfer commits.
    perform 1 from bitd.campaign_members where campaign_id = result.campaign_id and user_id = p_owner for key share;
    if not found then raise exception 'Choose a current participant in this campaign' using errcode = '22023'; end if;
  end if;
  update bitd.characters set owner_id = p_owner, updated_at = clock_timestamp()
    where id = p_character returning * into result;
  return result;
end $$;
revoke all on function bitd.list_campaign_participants(uuid), bitd.assign_character_owner(uuid,uuid,uuid) from public;
grant execute on function bitd.list_campaign_participants(uuid), bitd.assign_character_owner(uuid,uuid,uuid) to authenticated;
