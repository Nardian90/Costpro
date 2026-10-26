const fs = require('fs');
const env = {};
fs.readFileSync('/home/z/my-project/costpro/.env', 'utf8').split('\n').forEach(l => {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
});
(async () => {
  const r = await fetch(env.NEXT_PUBLIC_SUPABASE_URL + '/auth/v1/admin/users?per_page=100', {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY },
  });
  const j = await r.json();
  if (!j.users) { console.log('respuesta:', JSON.stringify(j).slice(0, 300)); return; }
  const qa = j.users.filter(u => (u.email || '').includes('costpro.test') || (u.email || '').startsWith('qa.'));
  console.log('usuarios auth QA:', qa.map(u => `${u.email} | banned=${!!u.banned_at}`));
  const p = await fetch(env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/profiles?email=like.*costpro.test*&select=id,email,is_active,deleted_at', {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY },
  });
  console.log('perfiles QA:', JSON.stringify(await p.json()));
})();
