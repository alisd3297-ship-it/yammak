
create or replace function public.guard_provider_sensitive()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_staff(auth.uid()) then return new; end if;
  new.status := old.status;
  new.verification_status := old.verification_status;
  new.verified_at := old.verified_at;
  new.commission_percent := old.commission_percent;
  new.owner_id := old.owner_id;
  return new;
end $$;

drop trigger if exists guard_provider_sensitive_trg on public.providers;
create trigger guard_provider_sensitive_trg before update on public.providers
for each row execute function public.guard_provider_sensitive();

create or replace function public.guard_ads_sensitive()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_staff(auth.uid()) then return new; end if;
  if new.status is distinct from old.status then
    new.status := 'pending';
  end if;
  new.owner_id := old.owner_id;
  return new;
end $$;

drop trigger if exists guard_ads_sensitive_trg on public.ads;
create trigger guard_ads_sensitive_trg before update on public.ads
for each row execute function public.guard_ads_sensitive();

create or replace function public.guard_listing_sensitive()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_staff(auth.uid()) then return new; end if;
  if new.status is distinct from old.status and new.status = 'published' then
    new.status := old.status;
  end if;
  new.seller_id := old.seller_id;
  return new;
end $$;

drop trigger if exists guard_listing_sensitive_trg on public.marketplace_listings;
create trigger guard_listing_sensitive_trg before update on public.marketplace_listings
for each row execute function public.guard_listing_sensitive();

create or replace function public.guard_business_sensitive()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_staff(auth.uid()) then return new; end if;
  new.status := old.status;
  new.is_active := old.is_active;
  new.owner_id := old.owner_id;
  return new;
end $$;

drop trigger if exists guard_business_sensitive_trg on public.business_accounts;
create trigger guard_business_sensitive_trg before update on public.business_accounts
for each row execute function public.guard_business_sensitive();

revoke execute on function public.guard_provider_sensitive() from anon, authenticated;
revoke execute on function public.guard_ads_sensitive() from anon, authenticated;
revoke execute on function public.guard_listing_sensitive() from anon, authenticated;
revoke execute on function public.guard_business_sensitive() from anon, authenticated;
