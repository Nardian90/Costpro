SELECT count(*)::int AS total_users, count(*) FILTER (WHERE email LIKE 'b8c-%')::int AS fixture_users,
       count(*) FILTER (WHERE encrypted_password IS NULL)::int AS null_pwd,
       count(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS deleted
FROM auth.users;
