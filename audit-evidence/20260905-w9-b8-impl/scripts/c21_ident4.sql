INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT u.id, u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
FROM auth.users u
WHERE u.id::text LIKE 'b8cb0000%'
  AND u.id NOT IN (SELECT user_id FROM auth.identities WHERE provider='email');
SELECT count(*)::int AS identities FROM auth.identities WHERE user_id::text LIKE 'b8cb0000%';
