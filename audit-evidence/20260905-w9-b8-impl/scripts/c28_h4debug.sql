SELECT jsonb_build_object(
  'seller_id', t.seller_id::text,
  'status', t.status::text,
  'age_seconds', extract(epoch FROM (now() - t.created_at))::int,
  'void_reason', t.void_reason,
  'helper_result', public.can_pos_undo_transaction('b8cd0000-0000-4000-8000-00000000b021', '051c6157-600b-425e-b8c0-72388bacf541'),
  'profile_role', (SELECT role::text FROM public.profiles WHERE id='051c6157-600b-425e-b8c0-72388bacf541'),
  'store_access', public.has_store_access_as('051c6157-600b-425e-b8c0-72388bacf541', t.store_id)
) AS dbg FROM public.transactions t WHERE t.id='b8cd0000-0000-4000-8000-00000000b021';
