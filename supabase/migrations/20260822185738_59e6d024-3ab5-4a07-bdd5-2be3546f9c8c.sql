INSERT INTO public.worker_profiles (user_id, worker_kind, requested_kind, is_approved, is_available, vehicle_type, vehicle)
VALUES ('a9c19c0d-7eb7-4ecc-a3c1-be3ac638346a', 'delivery', 'delivery', true, true, 'bike', 'دراجة نارية')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
VALUES ('a9c19c0d-7eb7-4ecc-a3c1-be3ac638346a', 'worker')
ON CONFLICT (user_id, role) DO NOTHING;