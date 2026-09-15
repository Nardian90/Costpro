// rem-inv-6r-live-catalog.js — REM-INV-6R Gates G/H/I: LIVE catalog facts (READ-ONLY SELECT)
// Usage: node scripts/rem-inv-6r-live-catalog.js <gate> ; gates: G | H | I | S-pre | S-post
const REF = 'wthkddeleylijmonclxg';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) { console.error('need SUPABASE_ACCESS_TOKEN'); process.exit(2); }

async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(r.status + ' ' + t.slice(0, 300));
  return JSON.parse(t);
}

const gates = {
  // Gate G — reset_store_data: all overloads, ACL incl. default PUBLIC, body refs, trigger refs
  G: `with f as (
    select p.oid, p.proname::text as name, p.oid::regprocedure::text as sig,
           pg_get_userbyid(p.proowner) as owner, p.prosecdef, p.provolatile::text as vol,
           p.proacl, pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='reset_store_data' and p.prokind='f'
  ), privs as (
    select f.sig, case when a.grantee=0 then 'PUBLIC' else (select rolname from pg_roles where oid=a.grantee) end as grantee, a.privilege_type
    from f, aclexplode(coalesce(f.proacl, acldefault('f', (select oid from pg_roles where rolname='postgres')))) a
  )
  select f.sig, f.owner, f.prosecdef, f.vol, f.proacl::text as proacl,
    (select string_agg(distinct grantee||':'||privilege_type, ', ') from privs where privs.sig=f.sig) as exec_privs,
    (select count(*) from pg_proc q join pg_namespace n2 on n2.oid=q.pronamespace where n2.nspname='public' and q.prosrc like '%reset_store_data(%' and q.oid<>f.oid) as body_refs,
    (select count(*) from pg_trigger t where t.tgfoid=f.oid) as trigger_refs
  from f order by f.sig`,

  // Gate H — transfers: facts + exec privs (bodies pulled separately)
  H: `with f as (
    select p.oid, p.proname::text as name, p.oid::regprocedure::text as sig,
           pg_get_userbyid(p.proowner) as owner, p.prosecdef, p.proacl, p.provolatile::text as vol
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('confirm_transfer','create_transfer','reverse_transfer') and p.prokind='f'
  ), privs as (
    select f.sig, case when a.grantee=0 then 'PUBLIC' else (select rolname from pg_roles where oid=a.grantee) end as grantee, a.privilege_type
    from f, aclexplode(coalesce(f.proacl, acldefault('f', (select oid from pg_roles where rolname='postgres')))) a
  )
  select f.sig, f.owner, f.prosecdef, f.vol, f.proacl::text as proacl,
    (select string_agg(distinct grantee||':'||privilege_type, ', ') from privs where privs.sig=f.sig) as exec_privs
  from f order by f.name, f.sig`,

  // Gate H bodies pulled separately via 'H-bodies'

  // Gate I — bulk/destructive surface: name patterns + array params
  I: `select p.proname::text as name, pg_get_function_identity_arguments(p.oid) as args,
    p.prosecdef, p.proacl::text as proacl, p.proacl is null as acl_default_public
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f'
    and (p.proname ~* '(bulk|batch|mass|many|import|reset|restore|archive|purge|wipe|delete_)'
         or exists (select 1 from unnest(coalesce(p.proargtypes, '[]'::oidvector)) t join pg_type ty on ty.oid=t where ty.typname in ('_uuid','_text','_int4','_jsonb')))
  order by p.proname`,

  S: null,
};

const gate = process.argv[2];
if (gate === 'H-bodies') {
  q(`select p.proname::text as name, p.oid::regprocedure::text as sig, pg_get_functiondef(p.oid) as def
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname in ('confirm_transfer','create_transfer','reverse_transfer') and p.prokind='f' order by p.proname`)
    .then(rows => { for (const r of rows) console.log('═'.repeat(80) + '\n' + r.sig + '\n' + r.def); })
    .catch(e => { console.error(e.message); process.exit(1); });
} else if (gate === 'I-bodies') {
  // exec privs for the bulk surface returned by gate I
  q(gates.I).then(rows => console.log(JSON.stringify(rows, null, 1))).catch(e => { console.error(e.message); process.exit(1); });
} else {
  const sql = gates[gate];
  if (!sql) { console.error('unknown gate ' + gate); process.exit(2); }
  q(sql).then(rows => console.log(JSON.stringify(rows, null, 1))).catch(e => { console.error(e.message); process.exit(1); });
}
