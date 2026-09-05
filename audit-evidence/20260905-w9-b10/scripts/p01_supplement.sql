INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('b10b0000-0000-4000-8000-00000000000b', 'b10-clerkab@example.invalid', '{"role":"clerk","full_name":"B10 clerkAB"}');
UPDATE public.profiles p SET store_id='b10a0000-0000-4000-8000-0000000000a1', roles=ARRAY['clerk']::user_role[], is_active=true
WHERE p.id='b10b0000-0000-4000-8000-00000000000b';
INSERT INTO public.user_store_memberships (user_id, store_id, role, status) VALUES
  ('b10b0000-0000-4000-8000-00000000000b','b10a0000-0000-4000-8000-0000000000a1','clerk','active'),
  ('b10b0000-0000-4000-8000-00000000000b','b10a0000-0000-4000-8000-0000000000b2','clerk','active');
SELECT count(*)::int AS clerkab_memberships FROM public.user_store_memberships WHERE user_id='b10b0000-0000-4000-8000-00000000000b';
