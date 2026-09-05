SELECT action, metadata->>'operation' AS op, count(*)::int AS n,
       count(*) FILTER (WHERE user_id::text LIKE 'b10b%')::int AS attributed_to_fixture_users,
       count(*) FILTER (WHERE metadata->>'old_status' IS NOT NULL)::int AS with_old_status,
       count(*) FILTER (WHERE metadata->>'new_status' IS NOT NULL)::int AS with_new_status
FROM public.audit_logs WHERE store_id='b10a0000-0000-4000-8000-0000000000a1'
GROUP BY action, op ORDER BY action;
