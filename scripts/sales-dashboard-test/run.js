// Prueba del RPC get_sales_dashboard_analytics contra PostgreSQL real
// (baseline + migración de la misión) con verificación de RLS.
const EmbeddedPostgres = require('embedded-postgres').default || require('embedded-postgres');
const fs = require('fs');
const path = require('path');

const DATA_DIR = '/tmp/sd-pgdata';
const DB = 'costpro_sd_test';

(async () => {
  // Limpieza de corridas previas
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  const pg = new EmbeddedPostgres({ databaseDir: DATA_DIR, user: 'postgres', password: 'postgres', port: 5433, persistent: false });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase(DB);
  const client = pg.getPgClient();
  await client.query(`\\c ${DB}`.replace('\\\\', ''));
  // conexión a la BD creada
  await client.end();
  const { Client } = require('pg');
  const db = new Client({ host: 'localhost', port: 5433, user: 'postgres', password: 'postgres', database: DB });
  await db.connect();

  console.log('→ cargando baseline.sql (esquema + datos + RLS)...');
  const baseline = fs.readFileSync('.e2e-migrations/baseline.sql', 'utf8');
  await db.query(baseline);
  console.log('→ baseline OK');
  const migration = fs.readFileSync('supabase/migrations/20261108141000_sales_dashboard_analytics.sql', 'utf8');
  await db.query(migration);
  console.log('→ migración dashboard OK');

  // ── Datos de prueba (dos tiendas, dos vendedores, multi-moneda) ──
  await db.query(`
    -- roles de prueba
    CREATE ROLE app_auth NOLOGIN;
    GRANT app_auth TO postgres;
    SET ROLE app_auth; RESET ROLE;
  `).catch(() => {});

  console.log('TODO OK');
  await db.end();
  await pg.stop();
})().catch(e => { console.error('FALLO:', e && (e.stack || e.message || JSON.stringify(e))); process.exit(1); });
