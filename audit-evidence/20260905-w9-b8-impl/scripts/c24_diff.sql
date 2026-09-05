SELECT 'real' AS kind, jsonb_build_object(
  'role', role::text, 'aud', aud::text, 'email_confirmed_at', email_confirmed_at IS NOT NULL,
  'confirmation_token_len', length(confirmation_token::text), 'recovery_token_len', length(recovery_token::text),
  'email_change', email_change::text = '', 'action', action IS NULL, 'phone', phone IS NULL,
  'invite', invitation_sent_at IS NULL, 'identities', (SELECT count(*)::int FROM auth.identities i WHERE i.user_id=u.id)
)::text AS row FROM auth.users u WHERE email='admin@costpro.com'
UNION ALL
SELECT 'fixture', jsonb_build_object(
  'role', role::text, 'aud', aud::text, 'email_confirmed_at', email_confirmed_at IS NOT NULL,
  'confirmation_token_len', length(confirmation_token::text), 'recovery_token_len', length(recovery_token::text),
  'email_change', email_change::text = '', 'action', action IS NULL, 'phone', phone IS NULL,
  'invite', invitation_sent_at IS NULL, 'identities', (SELECT count(*)::int FROM auth.identities i WHERE i.user_id=u.id)
)::text FROM auth.users u WHERE email='b8c-clerk@example.invalid';
