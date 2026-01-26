const { createClient } = require('@supabase/supabase-js');
const URL = 'https://wthkddeleylijmonclxg.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0aGtkZGVsZXlsaWptb25jbHhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0NzUxMzIsImV4cCI6MjA4MzA1MTEzMn0.ooFYAgZtOh4PXRAKsEWDrXaNpWy3aikmX_Grl4kQavU';
const supabase = createClient(URL, KEY);

async function run() {
  console.log('--- Profiles ---');
  const { data: profiles, error: pError } = await supabase.from('profiles').select('id, email, role, store_id, active_store_id');
  if (pError) console.error(pError);
  else console.table(profiles);

  console.log('--- Memberships ---');
  const { data: memberships, error: mError } = await supabase.from('user_store_memberships').select('user_id, store_id, role, status');
  if (mError) console.error(mError);
  else console.table(memberships);

  console.log('--- Stores ---');
  const { data: stores, error: sError } = await supabase.from('stores').select('id, name');
  if (sError) console.error(sError);
  else console.table(stores);
}

run();
