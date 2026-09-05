SELECT 'real' AS kind, jsonb_build_object(
  'role', role::text, 'aud', aud::text, 'confirmed', email_confirmed_at IS NOT NULL,
  'phone_null', phone IS NULL, 'identities', (SELECT count(*)::int FROM auth.identities i WHERE i.user_id=u.id),
  'pwd_prefix', substring(encrypted_password,1,4)
)::text AS row FROM auth.users u WHERE email='admin@costpro.com'
UNION ALL
SELECT 'fixture', jsonb_build_object(
  'role', role::text, 'aud', aud::text, 'confirmed', email_confirmed_at IS NOT NULL,
  'phone_null', phone IS NULL, 'identities', (SELECT count(*)::int FROM auth.identities i WHERE i.user_id=u.id),
  'pwd_prefix', substring(encrypted_password,1,4)
)::text FROM auth.users u WHERE email='b8c-clerk@example.invalid';
