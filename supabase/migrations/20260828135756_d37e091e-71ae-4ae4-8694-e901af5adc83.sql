create or replace function public.guard_provider_sensitive()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if public.is_staff(auth.uid()) then return new; end if;
  new.status := old.status;
  new.verification_status := old.verification_status;
  new.verified_at := old.verified_at;
  new.verified_by := old.verified_by;
  new.commission_percent := old.commission_percent;
  new.owner_id := old.owner_id;
  new.rating := old.rating;
  new.ratings_count := old.ratings_count;
  return new;
end $function$;

create or replace function public.guard_ads_sensitive()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if public.is_staff(auth.uid()) then return new; end if;
  if new.status is distinct from old.status then
    new.status := 'pending';
  end if;
  new.owner_id := old.owner_id;
  new.reviewed_by := old.reviewed_by;
  new.reviewed_at := old.reviewed_at;
  new.published_at := old.published_at;
  return new;
end $function$;

create or replace function public.guard_listing_sensitive()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if public.is_staff(auth.uid()) then return new; end if;
  if new.status is distinct from old.status and new.status = 'published' then
    new.status := old.status;
  end if;
  new.seller_id := old.seller_id;
  new.reviewed_by := old.reviewed_by;
  new.reviewed_at := old.reviewed_at;
  return new;
end $function$;

create or replace function public.guard_quote_request_sensitive()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if public.is_staff(auth.uid()) then return new; end if;
  if auth.uid() is distinct from old.customer_id then return new; end if;
  new.customer_id := old.customer_id;
  if new.accepted_offer_id is distinct from old.accepted_offer_id
     and new.accepted_offer_id is not null
     and not exists (
       select 1 from public.quote_offers o
        where o.id = new.accepted_offer_id and o.request_id = old.id
     ) then
    new.accepted_offer_id := old.accepted_offer_id;
  end if;
  return new;
end $function$;

drop trigger if exists guard_quote_request_sensitive_trg on public.quote_requests;
create trigger guard_quote_request_sensitive_trg
before update on public.quote_requests
for each row execute function public.guard_quote_request_sensitive();