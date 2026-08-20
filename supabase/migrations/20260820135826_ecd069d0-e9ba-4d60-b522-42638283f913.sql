create or replace function public.expire_due_ads()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update public.ads
     set status = 'expired', updated_at = now()
   where status = 'published'
     and expires_at is not null
     and expires_at <= now();
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.expire_due_ads() from public, anon, authenticated;
grant execute on function public.expire_due_ads() to service_role;