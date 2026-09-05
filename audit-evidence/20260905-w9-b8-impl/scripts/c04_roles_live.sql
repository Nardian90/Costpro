SELECT 'profiles.role' AS src, role::text AS role, count(*)::int AS n FROM public.profiles WHERE deleted_at IS NULL GROUP BY role
UNION ALL
SELECT 'membership.role', role::text, count(*)::int FROM public.user_store_memberships GROUP BY role
UNION ALL
SELECT 'tx status live', status::text, count(*)::int FROM public.transactions GROUP BY status
ORDER BY src, role;
