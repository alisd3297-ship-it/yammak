CREATE INDEX IF NOT EXISTS idx_products_provider_available ON public.products (provider_id, is_available);
CREATE INDEX IF NOT EXISTS idx_providers_kind_status ON public.providers (kind, status) WHERE is_demo = false;
CREATE INDEX IF NOT EXISTS idx_worker_locations_online_updated ON public.worker_locations (is_online, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_worker_profiles_dispatch ON public.worker_profiles (is_approved, is_available, worker_kind);
CREATE INDEX IF NOT EXISTS idx_menu_categories_provider ON public.menu_categories (provider_id);