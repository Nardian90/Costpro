const fs = require('fs');
function loadEnv(p){const t=fs.readFileSync(p,'utf8');const o={};for(const l of t.split('\n')){const m=l.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);if(m)o[m[1]]=m[2].replace(/^["']|["']$/g,'');}return o;}
const env=loadEnv('/home/z/my-project/Costpro/.env');
const ref=env.NEXT_PUBLIC_SUPABASE_URL.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/)[1];
const sql=fs.readFileSync('/home/z/my-project/Costpro/supabase/migrations/20260905000002_w9_b10_reverse_document_authorization.sql','utf8');
(async()=>{
  const res=await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`,{
    method:'POST',headers:{'Authorization':`Bearer ${env.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},
    body:JSON.stringify({query:sql})});
  const body=await res.text();
  console.log(`HTTP ${res.status}`);
  console.log(body.length>2000?body.slice(0,2000)+'...[trunc]':body);
  if(!res.ok)process.exit(2);
})();
