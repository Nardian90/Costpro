-- R1 · Actor probe (READ ONLY) — A12: canonical access for signer 051c6157
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"051c6157-600b-425e-b8c0-72388bacf541","role":"authenticated","email":"admin@costpro.com"}', false);
SELECT
  auth.uid()                                        AS auth_uid,
  public.is_admin()                                 AS is_admin,
  public.has_store_access('d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576') AS has_store_access;
RESET ROLE;
