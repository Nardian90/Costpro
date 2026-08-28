-- ════════════════════════════════════════════════════════════════════
-- Audit Harness · SHIMS de compatibilidad Supabase (LAB ONLY, 2026-08-28)
-- NO es migración del repo: es andamiaje mínimo para que las 420
-- migraciones timestamped del clone apliquen fuera de Supabase.
-- Todo aquí es DECLARADO como shim del harness (procedencia explícita).
-- ════════════════════════════════════════════════════════════════════

-- 1. Roles Supabase mínimos (NOLOGIN, sin contraseñas — solo firma de GRANTs/RLS)
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticator') THEN
    CREATE ROLE authenticator NOLOGIN NOINHERIT;
  END IF;
END $$;

-- 2. Schemas de plataforma
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA auth, storage, extensions TO anon, authenticated, service_role;

-- 3. auth.users MÍNIMA (solo columnas que las migraciones del repo referencian)
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- 4. auth.uid()/auth.role()/auth.jwt() — semántica Supabase vía setting interno
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')
$$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

-- 5. storage.buckets MÍNIMA (2 referencias en migraciones)
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text,
  public boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 6. Extensión requerida explícitamente por migraciones
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 7. Permisos de trabajo del lab (postgres es el owner ejecutor)
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres;
