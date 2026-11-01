-- Intentional stale-record conflicts are HTTP 409, not serialization failures.
-- PostgREST 14 retries SQLSTATE 40001 indefinitely; PT409 returns the same
-- application message immediately. Keep existing definitions, owners and ACLs.
do $migration$
declare
  target record;
  current_function record;
  before_metadata jsonb;
  after_metadata jsonb;
  definition text;
  expected_source text;
  sites integer;
  amended integer := 0;
  conflict_pattern constant text := '(errcode[[:space:]]*=[[:space:]]*)''40001''';
begin
  for target in select * from (values
    ('bitd.update_crew(uuid,jsonb,jsonb)',1),
    ('bitd.patch_faction(uuid,jsonb,integer)',1),
    ('bitd.save_faction_private_note(uuid,text,integer)',1),
    ('bitd.delete_faction(uuid,integer)',1),
    ('bitd.update_clock(uuid,jsonb,jsonb)',1),
    ('bitd.delete_clock(uuid,bigint)',1),
    ('bitd.update_asset(uuid,text,text,boolean,bigint)',1),
    ('bitd.remove_asset(uuid,bigint)',1),
    ('bitd.assert_planning_expected(jsonb,jsonb,jsonb)',1),
    ('bitd.delete_personal_business(uuid,bigint)',1),
    ('bitd.set_campaign_phase(uuid,text,bigint)',1),
    ('bitd.select_planned_opportunity(uuid,bigint,bigint)',2),
    ('bitd.assign_character_owner(uuid,uuid,uuid)',1),
    ('bitd.transition_score(uuid,text,bigint)',1),
    ('bitd.transition_score_activity(uuid,text,bigint)',1),
    ('bitd.confirm_aftermath(uuid)',4),
    ('bitd.save_aftermath_manual(uuid,uuid,bigint,text,text,text,boolean)',1),
    ('bitd.set_campaign_map(uuid,uuid,bigint)',1),
    ('bitd.move_map_token(uuid,double precision,double precision,bigint)',1),
    ('bitd.manage_map_token(uuid,text,uuid,uuid,bigint)',1),
    ('bitd.remove_map_token(uuid,bigint)',1),
    ('bitd.patch_backing(uuid,jsonb,bigint)',1),
    ('bitd.update_shared_note(uuid,jsonb,jsonb)',1),
    ('bitd.delete_shared_note(uuid,bigint)',1),
    ('bitd.guard_campaign_setup_write()',1),
    ('bitd.preview_campaign_setup(uuid,text)',2),
    ('bitd.apply_campaign_setup(uuid,text)',2)
  ) as known(signature, expected_sites) loop
    select p.*, pg_catalog.to_jsonb(p) as metadata into current_function
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      join pg_catalog.pg_language l on l.oid=p.prolang
      where p.oid=pg_catalog.to_regprocedure(target.signature)
        and n.nspname='bitd' and p.prokind='f' and l.lanname='plpgsql';
    if not found then raise exception 'Expected conflict function missing: %',target.signature; end if;
    select count(*) into sites from pg_catalog.regexp_matches(current_function.prosrc,conflict_pattern,'gi');
    if sites<>target.expected_sites then
      raise exception 'Unexpected conflict sites in %: expected %, found %',target.signature,target.expected_sites,sites;
    end if;
    before_metadata:=current_function.metadata-'prosrc';
    definition:=pg_catalog.pg_get_functiondef(current_function.oid);
    expected_source:=pg_catalog.regexp_replace(current_function.prosrc,conflict_pattern,'\1''PT409''','gi');
    execute pg_catalog.regexp_replace(definition,conflict_pattern,'\1''PT409''','gi');
    select pg_catalog.to_jsonb(p)-'prosrc' into after_metadata from pg_catalog.pg_proc p where p.oid=current_function.oid;
    if before_metadata is distinct from after_metadata or not exists(
      select 1 from pg_catalog.pg_proc p where p.oid=current_function.oid and p.prosrc=expected_source
    ) then raise exception 'Conflict migration changed unexpected function metadata: %',target.signature; end if;
    amended:=amended+1;
  end loop;
  if amended<>27 or exists(
    select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='bitd' and p.prokind='f' and p.prosrc ~* conflict_pattern
  ) then raise exception 'Business conflict function inventory is incomplete'; end if;
end
$migration$;
notify pgrst, 'reload schema';
