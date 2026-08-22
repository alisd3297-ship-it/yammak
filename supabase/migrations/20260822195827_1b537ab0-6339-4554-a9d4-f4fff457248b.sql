ALTER TABLE public.service_sections
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS icon text NOT NULL DEFAULT 'Layers',
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.profession_categories
  ADD COLUMN IF NOT EXISTS section_id uuid REFERENCES public.service_sections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_prof_cat_section ON public.profession_categories(section_id);

-- حذف/تعطيل قسم رئيسي مع نقل محتوياته
CREATE OR REPLACE FUNCTION public.admin_delete_service_section(
  _id uuid,
  _reassign_to uuid DEFAULT NULL,
  _hard boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dependents integer;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'غير مصرح';
  END IF;
  IF _reassign_to IS NOT NULL THEN
    IF _reassign_to = _id THEN RAISE EXCEPTION 'لا يمكن النقل إلى القسم نفسه'; END IF;
    UPDATE public.services SET section_id = _reassign_to WHERE section_id = _id;
    UPDATE public.profession_categories SET section_id = _reassign_to WHERE section_id = _id;
  END IF;

  SELECT (SELECT count(*) FROM public.services WHERE section_id = _id AND deleted_at IS NULL)
       + (SELECT count(*) FROM public.profession_categories WHERE section_id = _id AND deleted_at IS NULL)
    INTO dependents;

  IF _hard THEN
    IF dependents > 0 THEN
      RAISE EXCEPTION 'القسم يحتوي على % عنصر مرتبط، انقلها أولاً', dependents;
    END IF;
    DELETE FROM public.service_sections WHERE id = _id;
  ELSE
    UPDATE public.service_sections SET deleted_at = now(), is_active = false WHERE id = _id;
  END IF;
END;
$$;

-- حذف/تعطيل تصنيف فرعي (مهنة)
CREATE OR REPLACE FUNCTION public.admin_delete_profession_category(
  _id uuid,
  _reassign_to uuid DEFAULT NULL,
  _hard boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dependents integer;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'غير مصرح';
  END IF;
  IF _reassign_to IS NOT NULL THEN
    IF _reassign_to = _id THEN RAISE EXCEPTION 'لا يمكن النقل إلى التصنيف نفسه'; END IF;
    UPDATE public.providers SET profession_category_id = _reassign_to WHERE profession_category_id = _id;
    UPDATE public.provider_services SET category_id = _reassign_to WHERE category_id = _id;
  END IF;

  SELECT (SELECT count(*) FROM public.providers WHERE profession_category_id = _id)
       + (SELECT count(*) FROM public.provider_services WHERE category_id = _id)
    INTO dependents;

  IF _hard THEN
    IF dependents > 0 THEN
      RAISE EXCEPTION 'التصنيف مرتبط بـ % عنصر، انقلها أولاً', dependents;
    END IF;
    DELETE FROM public.profession_categories WHERE id = _id;
  ELSE
    UPDATE public.profession_categories SET deleted_at = now(), is_active = false WHERE id = _id;
  END IF;
END;
$$;

-- حذف/تعطيل خدمة (الحذف الفعلي مسموح فقط عندما لا يكسر سجلات)
CREATE OR REPLACE FUNCTION public.admin_delete_service(
  _id uuid,
  _hard boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'غير مصرح';
  END IF;
  IF _hard THEN
    DELETE FROM public.services WHERE id = _id;
  ELSE
    UPDATE public.services SET deleted_at = now(), is_active = false WHERE id = _id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_service_section(uuid, uuid, boolean) FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_delete_profession_category(uuid, uuid, boolean) FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_delete_service(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_service_section(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_profession_category(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_service(uuid, boolean) TO authenticated;