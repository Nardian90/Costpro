#!/usr/bin/env node
/**
 * B-10b SQL runner — Supabase Management API
 * Usage: node b10b_query.js <input.sql> <output.json>
 * Sends the full SQL file as one query batch; writes raw JSON response.
 * NOTE: Management API returns HTTP 201 on success (not 200).
 */
const fs = require('fs');
const path = require('path');

const REF = 'wthkddeleylijmonclxg';
// Secrets are read from environment (never hardcoded): SUPABASE_ACCESS_TOKEN
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';
if (!TOKEN) { console.error('missing env SUPABASE_ACCESS_TOKEN'); process.exit(2); }

async function main() {
  const [,, inFile, outFile] = process.argv;
  if (!inFile || !outFile) { console.error('usage: node b10b_query.js <in.sql> <out.json>'); process.exit(2); }
  const sql = fs.readFileSync(inFile, 'utf8');
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await r.text();
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, text);
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text.slice(0, 2000); }
  if (r.status !== 200 && r.status !== 201) {
    console.error(`FAIL http=${r.status}:`, JSON.stringify(parsed).slice(0, 500));
    process.exit(1);
  }
  if (Array.isArray(parsed) && parsed.length && parsed[0] && Object.prototype.hasOwnProperty.call(parsed[0], 'error')) {
    console.error('SQL-ERROR:', JSON.stringify(parsed).slice(0, 500));
    process.exit(1);
  }
  console.log(`OK http=${r.status} rows=${Array.isArray(parsed) ? parsed.length : 'n/a'} -> ${outFile}`);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
