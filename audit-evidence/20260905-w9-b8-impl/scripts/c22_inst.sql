SELECT id::text, instance_id::text, (email LIKE 'b8c-%') AS fixture FROM auth.users WHERE email LIKE 'b8c-clerk%' OR email NOT LIKE 'b8c-%' LIMIT 4;
