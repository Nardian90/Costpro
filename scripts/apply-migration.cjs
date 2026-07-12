#!/usr/bin/env node
/**
 * Apply a SQL migration to Supabase via the exec_sql RPC endpoint.
 * Uses NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.
 */
const fs = require('fs');
const path = require('path');

const envContent = fs.readFileSync('/home/z/my-project/.env', 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing env vars');
  process.exit(1);
}

const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error('Usage: apply-migration.js <migration.sql>');
  process.exit(1);
}

const sql = fs.readFileSync(migrationFile, 'utf8');

(async () => {
  console.log(`Applying migration: ${path.basename(migrationFile)}`);
  console.log(`Target: ${SUPABASE_URL}`);

  // Test if exec_sql RPC is available
  const testRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql: 'SELECT 1 as test;' }),
  });
  const testText = await testRes.text();
  console.log(`exec_sql test status: ${testRes.status}`);

  if (testRes.ok) {
    // Apply migration
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({ sql }),
    });
    const text = await res.text();
    console.log(`Migration status: ${res.status}`);
    if (res.ok) {
      console.log('✓ Migration applied successfully');
    } else {
      console.error(`✗ Migration failed: ${text.substring(0, 500)}`);
      process.exit(1);
    }
  } else {
    console.log('exec_sql RPC not available. Verifying schema via REST API...');

    // Try applying via direct table API — check if rss_feeds table has the new column
    const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/rss_feeds?select=id,url,name,category&limit=1`, {
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
    });
    const checkText = await checkRes.text();
    console.log(`rss_feeds schema check status: ${checkRes.status}`);

    if (checkRes.status === 200) {
      console.log('✓ rss_feeds.category column exists — migration already applied or schema is correct');
      const data = JSON.parse(checkText);
      console.log(`Sample row: ${JSON.stringify(data).substring(0, 300)}`);
    } else if (checkRes.status === 400) {
      console.log(`✗ rss_feeds.category column does NOT exist. Migration NOT applied.`);
      console.log(`Error: ${checkText.substring(0, 300)}`);
      console.log('\nPlease run the migration manually in Supabase SQL Editor:');
      console.log('---');
      console.log(sql);
      process.exit(2);
    } else {
      console.log(`Unexpected status ${checkRes.status}: ${checkText.substring(0, 300)}`);
    }
  }
})();
