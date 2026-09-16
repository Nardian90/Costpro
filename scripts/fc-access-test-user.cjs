/* fc-access-test-user — crea (o reutiliza) el usuario de prueba E2E del FC ACCESS FLOW FIX.
   Uso: node scripts/fc-access-test-user.cjs create|cleanup <email> <password>
   create  → admin createUser (email_confirm) + asegura profile activo; imprime JSON.
   cleanup → neutraliza el usuario (ban + is_active=false) e imprime cost_sheets borradas. */
const fs = require('fs');

function loadEnv() {
  const env = {};
  try {
    for (const line of fs.readFileSync('/home/z/my-project/Costpro/.env', 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch (e) { /* noop */ }
  return env;
}
const env = loadEnv();
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const SR = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !SR) { console.error('missing env'); process.exit(2); }

const [,, mode, email, password] = process.argv;

async function req(path, opts = {}) {
  const r = await fetch(URL_ + path, {
    ...opts,
    headers: Object.assign({
      apikey: SR,
      Authorization: 'Bearer ' + SR,
      'Content-Type': 'application/json',
    }, opts.headers || {}),
  });
  const text = await r.text();
  let j = null; try { j = text ? JSON.parse(text) : null; } catch (e) {}
  return { status: r.status, ok: r.ok, j };
}

(async () => {
  if (mode === 'create') {
    // ¿existe ya?
    const list = await req('/auth/v1/admin/users?page=1&per_page=1&email=' + encodeURIComponent(email));
    let user = list.j && list.j.users && list.j.users[0];
    if (!user) {
      const created = await req('/auth/v1/admin/users', {
        method: 'POST',
        body: JSON.stringify({ email, password, email_confirm: true }),
      });
      if (!created.ok) { console.error('create failed', created.status, JSON.stringify(created.j).slice(0, 300)); process.exit(1); }
      user = created.j;
    } else {
      // asegura password conocida + confirmado + desbaneado
      const upd = await req('/auth/v1/admin/users/' + user.id, {
        method: 'PUT',
        body: JSON.stringify({ password, email_confirm: true, ban_duration: 'none' }),
      });
      if (!upd.ok) { console.error('update failed', upd.status); process.exit(1); }
    }
    // profile activo (trigger estándar debería crearlo; verificar)
    const prof = await req('/rest/v1/profiles?id=eq.' + user.id + '&select=id,email,role,plan,is_active');
    if (!prof.j || !prof.j.length) {
      const ins = await req('/rest/v1/profiles', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ id: user.id, email, full_name: 'FC Access Test', role: 'usuario', plan: 'free', is_active: true }),
      });
      console.log('profile_insert:', ins.status);
    } else {
      console.log('profile_existing:', JSON.stringify({ role: prof.j[0].role, plan: prof.j[0].plan, is_active: prof.j[0].is_active }));
    }
    console.log(JSON.stringify({ id: user.id, email, ok: true }));
    process.exit(0);
  }

  if (mode === 'cleanup') {
    const list = await req('/auth/v1/admin/users?page=1&per_page=1&email=' + encodeURIComponent(email));
    const user = list.j && list.j.users && list.j.users[0];
    if (!user) { console.log('no user'); process.exit(0); }
    // fichas del usuario de prueba (RLS no aplica a service_role; created_by es su uid)
    const sheets = await req('/rest/v1/cost_sheets?created_by=eq.' + user.id + '&select=id');
    let deleted = 0;
    if (sheets.j && sheets.j.length) {
      const del = await req('/rest/v1/cost_sheets?created_by=eq.' + user.id, { method: 'DELETE' });
      deleted = del.status === 204 ? sheets.j.length : -1;
    }
    const ban = await req('/auth/v1/admin/users/' + user.id, {
      method: 'PUT',
      body: JSON.stringify({ ban_duration: '876000h' }),
    });
    const deact = await req('/rest/v1/profiles?id=eq.' + user.id, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: false }),
    });
    console.log(JSON.stringify({ banned: ban.status, deactivated: deact.status, sheets_deleted: deleted, uid: user.id }));
    process.exit(0);
  }
  console.error('mode?'); process.exit(2);
})();
