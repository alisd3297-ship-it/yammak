REVOKE ALL ON FUNCTION public.can_see_tab(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_tab(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_see_tab(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_tab(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.guard_tab_payment() FROM PUBLIC, anon, authenticated;