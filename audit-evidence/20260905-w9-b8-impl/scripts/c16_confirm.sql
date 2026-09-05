UPDATE auth.users SET email_confirmed_at = now(), updated_at = now(), confirmation_token = '', email_change = ''
WHERE id::text LIKE 'b8cb0000%';
SELECT count(*)::int AS confirmed FROM auth.users WHERE id::text LIKE 'b8cb0000%' AND email_confirmed_at IS NOT NULL;
