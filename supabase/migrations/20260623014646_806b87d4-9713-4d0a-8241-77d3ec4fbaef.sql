-- Migrate super_admin role from admin@sikaflow.com to kuditrackonline@gmail.com
INSERT INTO public.user_roles (user_id, role)
VALUES ('445b916f-0fb6-40d3-bad5-060a4d8feaa0', 'super_admin')
ON CONFLICT (user_id, role) DO NOTHING;

DELETE FROM public.user_roles
WHERE user_id = 'a18dfb6e-ad17-4a2e-823a-36914b881d44'
  AND role = 'super_admin';