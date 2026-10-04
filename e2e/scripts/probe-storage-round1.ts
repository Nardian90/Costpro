/**
 * FASE 6f — Probe de storage del bucket 'reports' (privado).
 * Aísla la causa del "new row violates row-level security policy":
 *   A) upload con client del usuario + upsert:true  (el que usa generate hoy)
 *   B) upload con client del usuario + upsert:false
 *   C) upload con service role + upsert:true
 */
import { provisionRunEnv, teardownRunEnv, generateRunId, signInRunUser } from '../fixtures/run-env';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function probe(tag: string, client: any, upsert: boolean) {
  const path = `reports/probe-round1/${Date.now()}-${tag}.pdf`;
  const blob = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x0a]); // "%PDF\n"
  try {
    const { error } = await client.storage.from('reports').upload(path, blob, {
      contentType: 'application/pdf',
      upsert,
    });
    console.log(`[${tag}] upsert=${upsert} → ${error ? `ERROR: ${error.message}` : 'OK'}`);
    if (!error) {
      const { error: delError } = await client.storage.from('reports').remove([path]);
      if (delError) console.log(`[${tag}]   (cleanup falló: ${delError.message})`);
    }
  } catch (e) {
    console.log(`[${tag}] EXCEPCION: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function main() {
  process.env.E2E_RUN_ID = process.env.E2E_RUN_ID || generateRunId();
  const ctx = await provisionRunEnv();
  try {
    const { token } = await signInRunUser(ctx.users.admin.email, ctx.users.admin.password);
    const authClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const admin = createClient(SUPABASE_URL, SERVICE, {
      auth: { persistSession: false },
    });

    await probe('A-auth-upsert', authClient, true);
    await probe('B-auth-noupsert', authClient, false);
    await probe('C-admin-upsert', admin, true);
  } finally {
    await teardownRunEnv().catch(() => {});
  }
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
