UPDATE auth.users SET role='authenticated', aud='authenticated' WHERE id::text LIKE 'b8cb0000%';
SELECT id::text, role::text, aud::text FROM auth.users WHERE id='b8cb0000-0000-4000-8000-000000000004';
