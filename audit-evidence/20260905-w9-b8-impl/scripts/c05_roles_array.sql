SELECT 'profiles_roles_nonempty' AS k, count(*)::int AS n FROM public.profiles WHERE roles <> '{}'::user_role[]
UNION ALL SELECT 'memberships_total', count(*)::int FROM public.user_store_memberships
UNION ALL SELECT 'memberships_active', count(*)::int FROM public.user_store_memberships WHERE status='active'
UNION ALL SELECT 'admins_global_with_tx_30d', count(DISTINCT t.seller_id)::int FROM public.transactions t WHERE t.created_at > now() - interval '30 days'
UNION ALL SELECT 'tx_30d_total', count(*)::int FROM public.transactions WHERE created_at > now() - interval '30 days';
