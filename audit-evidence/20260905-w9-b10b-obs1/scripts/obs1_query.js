#!/usr/bin/env node
/**
 * B-10b-OBS-1 SQL runner — Supabase Management API
 * Usage: SUPABASE_ACCESS_TOKEN=... node obs1_query.js <input.sql> <output.json>
 * Sends the full SQL file as one query batch; writes raw JSON response.
 * NOTE: Management API returns HTTP 201 on success (not 200).
 */
const fs = require('fs');

const REF = 'wthkddeleylijmonclxg';
// Secrets are read from environment (never hardcoded): SUPABASE_ACCESS_TOKEN
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';
if (!TOKEN) { console.error('missing env SUPABASE_ACCESS_TOKEN'); process.exit(2); }

async function main() {
  const [,, inFile, outFile] = process.argv;
  if (!inFile || !outFile) { console.error('usage: node obs1_query.js <in.sql> <out.json>'); process.exit(2); }
  const sql = fs.readFileSync(inFile, 'utf8');
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await r.text();
  fs.writeFileSync(outFile, text);
  console.log(`HTTP ${r.status} -> ${outFile} (${text.length} bytes)`);
  if (r.status !== 201 && r.status !== 200) { console.error(text.slice(0, 500)); process.exit(1); }
}
main().catch(e => { console.error(e); process.exit(1); });
