-- fingerprint.sql — huella canónica del esquema (misma SQL para prod y lab)
-- Cada SELECT produce líneas 'Fxx<US>payload'. Todo con coalesce('') para simetría psql/API.
-- Alcance paridad: esquema public. Exclusiones declaradas: extensiones pg_stat_statements/
-- supabase_vault; default-privileges en esquemas de plataforma.

-- F1 tablas (+flags RLS + reloptions)
select 'F1' || chr(31) || c.relname || chr(31) || c.relkind::text || chr(31) || coalesce(c.reloptions::text,'') || chr(31) || c.relrowsecurity::text || chr(31) || c.relforcerowsecurity::text as line
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','p') order by 1;

-- F2 enums
select 'F2' || chr(31) || t.typname || chr(31) || coalesce((select string_agg(e.enumlabel, ',' order by e.enumsortorder) from pg_enum e where e.enumtypid=t.oid),'') as line
from pg_type t join pg_namespace n on n.oid=t.typnamespace
where n.nspname='public' and t.typtype='e' order by 1;

-- F2c composite types standalone
select 'F2C' || chr(31) || t.typname || chr(31) || coalesce((select string_agg(a.attname||':'||format_type(a.atttypid,a.atttypmod), ',' order by a.attnum) from pg_attribute a where a.attrelid=t.typrelid and a.attnum>0 and not a.attisdropped),'') as line
from pg_type t join pg_namespace n on n.oid=t.typnamespace
where n.nspname='public' and t.typtype='c'
  and exists (select 1 from pg_class cc where cc.oid=t.typrelid and cc.relkind='c') order by 1;

-- F3 columnas
select 'F3' || chr(31) || c.relname || chr(31) || a.attname || chr(31) || (row_number() over (partition by c.oid order by a.attnum))::text || chr(31) || format_type(a.atttypid, a.atttypmod) || chr(31) || a.attnotnull::text
  || chr(31) || replace(coalesce(case when coalesce(a.attgenerated,'')='' then pg_get_expr(ad.adbin, ad.adrelid) end, ''), E'\n', chr(30))
  || chr(31) || coalesce(nullif(a.attidentity,'')::text, '')
  || chr(31) || replace(coalesce(case when a.attgenerated='s' then pg_get_expr(ad.adbin, ad.adrelid) end, ''), E'\n', chr(30))
  || chr(31) || coalesce(case when a.attstorage <> t.typstorage then a.attstorage::text end, '')
  || chr(31) || coalesce(case when a.attcollation <> t.typcollation and t.typcollation <> 0 then a.attcollation::regcollation::text end, '') as line
from pg_class c join pg_namespace n on n.oid=c.relnamespace
join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
join pg_type t on t.oid=a.atttypid
left join pg_attrdef ad on ad.adrelid=a.attrelid and ad.adnum=a.attnum
where n.nspname='public' and c.relkind in ('r','p') order by 1;

-- F4 constraints
select 'F4' || chr(31) || con.conrelid::regclass::text || chr(31) || con.conname || chr(31) || con.contype::text || chr(31) || pg_get_constraintdef(con.oid, false) || chr(31) || con.condeferrable::text || chr(31) || con.condeferred::text || chr(31) || con.convalidated::text as line
from pg_constraint con join pg_namespace n on n.oid=con.connamespace
where n.nspname='public' and con.contype in ('p','u','f','c','x') order by 1;

-- F5 índices (incluye los que respaldan constraints: def canónica idéntica si el objeto es idéntico)
select 'F5' || chr(31) || pg_get_indexdef(i.indexrelid, 0, false) as line
from pg_index i join pg_class c on c.oid=i.indexrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' order by 1;

-- F6 funciones (firma + md5 del cuerpo + tipo)
select 'F6' || chr(31) || p.oid::regprocedure::text || chr(31) || p.prokind::text || chr(31) || md5(coalesce(pg_get_functiondef(p.oid),'')) as line
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind in ('f','p','w','a') order by 1;

-- F7 triggers de tabla
select 'F7' || chr(31) || pg_get_triggerdef(t.oid, false) as line
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and not t.tgisinternal order by 1;

-- F8 policies RLS
select 'F8' || chr(31) || pol.tablename || chr(31) || pol.policyname || chr(31) || pol.permissive || chr(31) || pol.cmd || chr(31) || pol.roles::text || chr(31) || replace(coalesce(pol.qual,''), E'\n', chr(30)) || chr(31) || replace(coalesce(pol.with_check,''), E'\n', chr(30)) as line
from pg_policies pol where pol.schemaname='public' order by 1;

-- F9 grants (relaciones + funciones + esquema public)
select 'F9R' || chr(31) || c.relkind::text || chr(31) || c.relname || chr(31) || r.rolname || chr(31) || a.privilege_type || chr(31) || a.is_grantable::text as line
from pg_class c join pg_namespace n on n.oid=c.relnamespace, aclexplode(c.relacl) a join pg_roles r on r.oid=a.grantee
where n.nspname='public' and c.relkind in ('r','p','v','m','S') order by 1;
select 'F9F' || chr(31) || p.oid::regprocedure::text || chr(31) || r.rolname || chr(31) || a.privilege_type || chr(31) || a.is_grantable::text as line
from pg_proc p join pg_namespace n on n.oid=p.pronamespace, aclexplode(p.proacl) a join pg_roles r on r.oid=a.grantee
where n.nspname='public' order by 1;
select 'F9S' || chr(31) || r.rolname || chr(31) || a.privilege_type || chr(31) || a.is_grantable::text as line
from pg_namespace n, aclexplode(n.nspacl) a join pg_roles r on r.oid=a.grantee
where n.nspname='public' order by 1;

-- F10 secuencias
select 'F10' || chr(31) || cs.relname || chr(31) || s.seqtypid::regtype::text || chr(31) || s.seqstart::text || chr(31) || s.seqincrement::text || chr(31) || s.seqmin::text || chr(31) || s.seqmax::text || chr(31) || s.seqcache::text || chr(31) || s.seqcycle::text
  || chr(31) || coalesce((select tn.nspname||'.'||tc.relname||'.'||ca.attname from pg_depend d join pg_class tc on tc.oid=d.refobjid join pg_namespace tn on tn.oid=tc.relnamespace join pg_attribute ca on ca.attrelid=d.refobjid and ca.attnum=d.refobjsubid where d.objid=s.seqrelid and d.deptype='a'),'') as line
from pg_sequence s join pg_class cs on cs.oid=s.seqrelid join pg_namespace n on n.oid=cs.relnamespace
where n.nspname='public' order by 1;

-- F11 vistas/matviews
select 'F11' || chr(31) || c.relname || chr(31) || c.relkind::text || chr(31) || coalesce(c.reloptions::text,'') || chr(31) || replace(pg_get_viewdef(c.oid, true), E'\n', chr(30)) as line
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('v','m') order by 1;

-- F12 event triggers (global; handler calificado por su esquema real)
select 'F12' || chr(31) || e.evtname || chr(31) || e.evtevent || chr(31) || e.evtenabled::text || chr(31) || coalesce(array_to_string(array_agg(x order by x), ','),'') || chr(31) || hn.nspname || '.' || hp.proname as line
from pg_event_trigger e left join unnest(e.evttags) x on true
join pg_proc hp on hp.oid=e.evtfoid join pg_namespace hn on hn.oid=hp.pronamespace
group by e.evtname, e.evtevent, e.evtenabled, hn.nspname, hp.proname order by 1;

-- F13 default ACLs (excluye esquemas de plataforma — exclusión declarada)
select 'F13' || chr(31) || d.defaclrole::regrole::text || chr(31) || coalesce(d.defaclnamespace::regnamespace::text,'') || chr(31) || d.defaclobjtype::text || chr(31) || r.rolname || chr(31) || a.privilege_type || chr(31) || a.is_grantable::text as line
from pg_default_acl d, aclexplode(d.defaclacl) a join pg_roles r on r.oid=a.grantee
where coalesce(d.defaclnamespace::regnamespace::text,'') not in ('graphql','graphql_public','realtime','storage','auth','extensions','supabase_functions','supabase_migrations','pgsodium','pgsodium_masks','net','vault','cron','pgbouncer','analytics')
order by 1;

-- F14 publicaciones + miembros
select 'F14' || chr(31) || p.pubname || chr(31) || p.pubinsert::text || chr(31) || p.pubupdate::text || chr(31) || p.pubdelete::text || chr(31) || p.pubtruncate::text || chr(31) || p.pubviaroot::text as line
from pg_publication p order by 1;
select 'F14R' || chr(31) || p.pubname || chr(31) || c.relname as line
from pg_publication_rel pr join pg_publication p on p.oid=pr.prpubid
join pg_class c on c.oid=pr.prrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' order by 1;

-- F15 extensiones (excluye plataforma no reproducible — exclusión declarada)
select 'F15' || chr(31) || e.extname || chr(31) || e.extversion as line
from pg_extension e
where e.extname not in ('pg_stat_statements','supabase_vault') order by 1;
