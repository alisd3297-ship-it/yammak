create or replace function public.register_push_device(_token text, _platform text default 'android')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if _token is null or length(btrim(_token)) = 0 then
    return false;
  end if;

  insert into public.push_devices (user_id, token, platform, is_active, last_seen_at, updated_at)
  values (uid, btrim(_token),
          case when _platform in ('android','ios','web') then _platform else 'android' end,
          true, now(), now())
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        is_active = true,
        last_seen_at = now(),
        updated_at = now();

  return true;
end;
$$;

revoke all on function public.register_push_device(text, text) from public, anon;
grant execute on function public.register_push_device(text, text) to authenticated;