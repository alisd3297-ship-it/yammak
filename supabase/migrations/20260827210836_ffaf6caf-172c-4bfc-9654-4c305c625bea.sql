do $$
declare t text;
  public_tables text[] := array[
    'ad_categories','ads','cities','providers','products','services','service_sections',
    'profession_categories','areas','app_settings','feature_flags','fee_rules',
    'menu_categories','pricing_rules','provider_services'
  ];
begin
  for t in select tablename from pg_tables where schemaname='public'
  loop
    if not (t = any(public_tables)) then
      execute format('revoke all on public.%I from anon', t);
    end if;
  end loop;
end $$;