revoke all on function public.guard_ads_sensitive() from anon, authenticated;
revoke all on function public.guard_business_sensitive() from anon, authenticated;
revoke all on function public.guard_listing_sensitive() from anon, authenticated;
revoke all on function public.guard_provider_sensitive() from anon, authenticated;
revoke all on function public.guard_quote_request_sensitive() from anon, authenticated;
revoke all on function public.expire_stale_trips() from anon, authenticated;