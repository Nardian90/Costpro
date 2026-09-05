UPDATE auth.users SET encrypted_password = extensions.crypt('B8c-Fixture-2026!', extensions.gen_salt('bf', 10)) WHERE id::text LIKE 'b8cb0000%';
SELECT substring(encrypted_password,1,7) AS prefix FROM auth.users WHERE id='b8cb0000-0000-4000-8000-000000000004';
