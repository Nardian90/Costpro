SELECT id::text, substring(encrypted_password,1,10) AS hash_prefix, (encrypted_password LIKE '$2%') AS is_bcrypt,
       (email_confirmed_at IS NOT NULL) AS confirmed, role::text AS rol, is_sso_user
FROM auth.users WHERE id::text = 'b8cb0000-0000-4000-8000-000000000004';
