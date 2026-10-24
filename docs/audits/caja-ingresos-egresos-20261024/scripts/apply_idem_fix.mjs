import { createRequire } from 'node:module';
const require = createRequire('/home/z/my-project/pgtest/');
const { Client } = require('pg');
import { readFileSync } from 'node:fs';
const c = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:5435/cajamision' });
await c.connect();
// roles Supabase ausentes en PG puro — crearlos para que los grants compilen
await c.query(`DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;`);
const mig = readFileSync('/home/z/costpro/supabase/migrations/20261024180000_auditoria_caja_idempotencia_determinista.sql', 'utf8');
await c.query(mig);
console.log('✅ migración 20261024180000 aplicada a la BD aislada');
await c.end();
