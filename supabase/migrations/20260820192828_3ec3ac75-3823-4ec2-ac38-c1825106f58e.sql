delete from public.profiles p where not exists (select 1 from auth.users u where u.id = p.id);
revoke execute on function public.log_trip_status() from anon, authenticated;
revoke execute on function public.guard_ad_self_update() from anon, authenticated;