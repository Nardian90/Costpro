/**
 * Cleanup of QA test users created during the COSTPRO 4 investigation.
 * Uses the existing e2e_hard_delete_user() SECURITY DEFINER helper
 * (20261005120001_e2e_hard_delete_user.sql) — only deletes test-pattern emails.
 * Run: node scripts/cleanup_qa_users.cjs
 */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
});

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const QA_EMAILS = [
  'qa.probe.toast.20261009@costpro.test',
  'qa.probe.ok.20261009@costpro.test',
  'qa.toastfix.20261009@costpro.test',
];

async function main() {
  for (const email of QA_EMAILS) {
    // find profile id
    const { data: prof } = await sb.from('profiles').select('id').eq('email', email).maybeSingle();
    // find auth user id (may differ if profile missing)
    let userId = prof?.id;
    if (!userId) {
      const { data: list } = await sb.auth.admin.listUsers({ perPage: 200, page: 1 });
      userId = list?.users?.find(u => u.email === email)?.id;
    }
    if (!userId) { console.log(`${email}: not found (already clean)`); continue; }

    // call the test-user hard delete helper via service role RPC
    const { data, error } = await sb.rpc('e2e_hard_delete_user', { p_user_id: userId });
    console.log(`${email}: rpc → ${error ? 'ERROR ' + (error.message || JSON.stringify(error)) : JSON.stringify(data)}`);
  }

  // verify
  const { data: left } = await sb.from('profiles').select('email').in('email', QA_EMAILS);
  console.log('remaining profiles:', left?.length ?? 0, left?.map(p => p.email));
}

main().catch(e => { console.error('CLEANUP FAILED:', e); process.exit(1); });
