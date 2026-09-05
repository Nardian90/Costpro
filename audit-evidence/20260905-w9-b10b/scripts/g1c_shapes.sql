-- Shape de profiles/stores/user_store_memberships + has_store_access_as + fn_validate trigger args
WITH fnh AS (
  SELECT pg_get_functiondef(p.oid) AS def
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='has_store_access_as'
),
prof AS (
  SELECT jsonb_agg(jsonb_build_object('col',column_name,'udt',udt_name,'null',is_nullable,'def',column_default) ORDER BY ordinal_position) AS cols
  FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles'
),
memb AS (
  SELECT jsonb_agg(jsonb_build_object('col',column_name,'udt',udt_name,'null',is_nullable,'def',column_default) ORDER BY ordinal_position) AS cols
  FROM information_schema.columns WHERE table_schema='public' AND table_name='user_store_memberships'
),
st AS (
  SELECT jsonb_agg(jsonb_build_object('col',column_name,'udt',udt_name,'null',is_nullable,'def',column_default) ORDER BY ordinal_position) AS cols
  FROM information_schema.columns WHERE table_schema='public' AND table_name='stores'
),
txn AS (
  SELECT jsonb_agg(jsonb_build_object('col',column_name,'udt',udt_name,'null',is_nullable,'def',column_default) ORDER BY ordinal_position) AS cols
  FROM information_schema.columns WHERE table_schema='public' AND table_name='transactions'
)
SELECT jsonb_build_object(
  'has_store_access_as', (SELECT def FROM fnh),
  'profiles', (SELECT cols FROM prof),
  'memberships', (SELECT cols FROM memb),
  'stores', (SELECT cols FROM st),
  'transactions', (SELECT cols FROM txn)
) AS shape;
