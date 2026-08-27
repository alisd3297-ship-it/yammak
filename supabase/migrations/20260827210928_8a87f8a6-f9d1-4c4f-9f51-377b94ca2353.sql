alter table public.trip_offers replica identity full;
alter table public.trips replica identity full;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='trip_offers') then
    alter publication supabase_realtime add table public.trip_offers;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='trips') then
    alter publication supabase_realtime add table public.trips;
  end if;
end $$;