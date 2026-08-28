#!/usr/bin/env bash
# snap-02-extract.sh — Opción A autorizada: extracción READ-ONLY de metadatos/DDL de producción.
# Solo SELECT sobre pg_catalog/information_schema. Cero datos de negocio. Cero mutaciones.
# Cada consulta queda registrada en extraction-queries.log y su respuesta pristine en extraction-raw/.
set -u
source /home/z/my-project/scripts/snap-lib.sh
SQLD=/home/z/my-project/scripts/sql
mkdir -p "$SQLD"

# ---- helpers de plantilla con OFFSET/LIMIT --------------------------------
chunk() { # chunk <base-slug> <sqlfile-with-__OFFSET__/__LIMIT__> <limit>
  local base="$1" tmpl="$2" limit="$3" off=0 n=0 i=0
  while : ; do
    local slug; printf -v slug "%s-%03d" "$base" "$i"
    sed -e "s/__OFFSET__/$off/g" -e "s/__LIMIT__/$limit/g" "$tmpl" > "/tmp/$slug.sql"
    q "$slug" "/tmp/$slug.sql" || return 1
    n=$(jq 'length' "$RAW/$slug.response.json")
    [ "$n" -lt "$limit" ] && break
    off=$((off+limit)); i=$((i+1))
    [ "$i" -gt 200 ] && { echo "LOOP-GUARD[$base]" >&2; return 1; }
  done
  echo "CHUNKED[$base] complete (last off=$off, rows=$n)"
}

# ---- 1. enums, secuencias, event triggers, partition/pub check -------------
cat > $SQLD/enums.sql <<'EOF'
select t.typname as name,
       (select string_agg(e.enumlabel, chr(31) order by e.enumsortorder) from pg_enum e where e.enumtypid=t.oid) as labels
from pg_type t join pg_namespace n on n.oid=t.typnamespace
where n.nspname='public' and t.typtype='e' order by t.typname;
EOF
q enums $SQLD/enums.sql

cat > $SQLD/sequences.sql <<'EOF'
select cs.relname as name, s.seqstart, s.seqincrement, s.seqmax, s.seqmin, s.seqcache, s.seqcycle,
       format_type(s.seqtypid, null) as seqtype,
       tn.nspname||'.'||ca.attname as owned_by
from pg_sequence s
join pg_class cs on cs.oid=s.seqrelid
join pg_namespace n on n.oid=cs.relnamespace
left join pg_depend d on d.objid=s.seqrelid and d.deptype='a'
left join pg_class tn on tn.oid=d.refobjid
left join pg_attribute ca on ca.attrelid=d.refobjid and ca.attnum=d.refobjsubid
where n.nspname='public' order by cs.relname;
EOF
q sequences $SQLD/sequences.sql

cat > $SQLD/event-triggers.sql <<'EOF'
select e.evtname as name, e.evtevent as event, e.evtenabled as enabled,
       e.evtfoid::regprocedure::text as handler,
       (select array_to_string(array_agg(t order by t), chr(31)) from unnest(e.evttags) t) as tags,
       pg_get_userbyid(e.evtowner) as owner
from pg_event_trigger e order by e.evtname;
EOF
q event-triggers $SQLD/event-triggers.sql

cat > $SQLD/misc-part-pub.sql <<'EOF'
select
 (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind='p') as partitioned_tables,
 (select count(*) from pg_inherits i join pg_class p on p.oid=i.inhparent join pg_namespace n on n.oid=p.relnamespace
   where n.nspname='public') as inherits_n,
 (select count(*) from pg_publication) as publications,
 (select count(*) from pg_publication_rel pr join pg_class c on c.oid=pr.prrelid join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public') as pub_rels_public;
EOF
q misc-part-pub $SQLD/misc-part-pub.sql

# ---- 2. tablas + columnas + flags RLS + reloptions + owner (12/llamada) ----
cat > $SQLD/tmpl-tables.sql <<'EOF'
select c.relname as name, c.relkind as kind,
       pg_get_userbyid(c.relowner) as owner,
       c.relrowsecurity as rls, c.relforcerowsecurity as rls_force,
       c.reloptions::text as reloptions,
       (select json_agg(json_build_object(
          'n', a.attname,
          't', format_type(a.atttypid, a.atttypmod),
          'nn', a.attnotnull,
          'd', case when coalesce(a.attgenerated,'')<>'' then null else pg_get_expr(ad.adbin, ad.adrelid) end,
          'i', case when a.attidentity='a' then 'always' when a.attidentity='d' then 'by default' else null end,
          'g', case when a.attgenerated='s' then pg_get_expr(ad.adbin, ad.adrelid) else null end,
          's', case when a.attstorage <> t.typstorage then a.attstorage::text else null end,
          'c', case when a.attcollation <> t.typcollation and t.typcollation <> 0 then a.attcollation::regcollation::text else null end)
          order by a.attnum)
        from pg_attribute a
        left join pg_attrdef ad on ad.adrelid=a.attrelid and ad.adnum=a.attnum
        join pg_type t on t.oid=a.atttypid
        where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as cols
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','p')
order by c.relname limit __LIMIT__ offset __OFFSET__;
EOF
chunk tables $SQLD/tmpl-tables.sql 12

# ---- 3. constraints (60/llamada) -------------------------------------------
cat > $SQLD/tmpl-constraints.sql <<'EOF'
select con.conname as name, con.conrelid::regclass::text as tbl, con.contype as type,
       pg_get_constraintdef(con.oid, true) as def,
       con.condeferrable, con.condeferred, con.convalidated,
       pg_get_userbyid(con.conowner) as owner
from pg_constraint con join pg_namespace n on n.oid=con.connamespace
where n.nspname='public' and con.contype in ('p','u','f','c','x')
order by con.conrelid::regclass::text, con.conname
limit __LIMIT__ offset __OFFSET__;
EOF
chunk constraints $SQLD/tmpl-constraints.sql 60

# ---- 4. índices no-constraint (60/llamada) ---------------------------------
cat > $SQLD/tmpl-indexes.sql <<'EOF'
select c.relname as name, c.relkind as kind,
       pg_get_userbyid(c.relowner) as owner,
       pg_get_indexdef(i.indexrelid, 0, true) as def
from pg_index i join pg_class c on c.oid=i.indexrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and not i.indisprimary
  and not exists (select 1 from pg_constraint k where k.conindid=i.indexrelid)
order by pg_get_indexdef(i.indexrelid,0,true) limit __LIMIT__ offset __OFFSET__;
EOF
chunk indexes $SQLD/tmpl-indexes.sql 60

# ---- 5. triggers de tabla (40/llamada) --------------------------------------
cat > $SQLD/tmpl-triggers.sql <<'EOF'
select t.tgname as name, c.relname as tbl,
       pg_get_userbyid(t.tgowner) as owner,
       pg_get_triggerdef(t.oid, true) as def
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and not t.tgisinternal
order by c.relname, t.tgname limit __LIMIT__ offset __OFFSET__;
EOF
chunk triggers $SQLD/tmpl-triggers.sql 40

# ---- 6. rutinas (15/llamada; cuerpos incluidos = código, autorizado) --------
cat > $SQLD/func-anchor.sql <<'EOF'
select p.prokind as kind, count(*) as n
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind in ('f','p','w','a')
group by p.prokind order by p.prokind;
EOF
q func-anchor $SQLD/func-anchor.sql

cat > $SQLD/tmpl-functions.sql <<'EOF'
select p.oid::bigint as oid, p.oid::regprocedure::text as sig, p.prokind as kind,
       pg_get_userbyid(p.proowner) as owner,
       pg_get_functiondef(p.oid) as def
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind in ('f','p','w')
order by p.oid limit __LIMIT__ offset __OFFSET__;
EOF
chunk functions $SQLD/tmpl-functions.sql 15

# ---- 7. policies RLS (50/llamada) -------------------------------------------
cat > $SQLD/tmpl-policies.sql <<'EOF'
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies where schemaname='public'
order by tablename, policyname limit __LIMIT__ offset __OFFSET__;
EOF
chunk policies $SQLD/tmpl-policies.sql 50

# ---- 8. vistas y matviews (6/llamada) ---------------------------------------
cat > $SQLD/tmpl-views.sql <<'EOF'
select c.relname as name, c.relkind as kind,
       pg_get_userbyid(c.relowner) as owner,
       pg_get_viewdef(c.oid, true) as def,
       c.reloptions::text as reloptions
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('v','m')
order by c.relname limit __LIMIT__ offset __OFFSET__;
EOF
chunk views $SQLD/tmpl-views.sql 6

# ---- 9. grants estructurados -------------------------------------------------
cat > $SQLD/tmpl-grants-rel.sql <<'EOF'
select c.relname::text as obj, c.relkind as kind, r.rolname as grantee,
       a.privilege_type as priv, a.is_grantable as grantable,
       gr.rolname as grantor
from pg_class c join pg_namespace n on n.oid=c.relnamespace,
     aclexplode(c.relacl) a
     join pg_roles r on r.oid=a.grantee
     join pg_roles gr on gr.oid=a.grantor
where n.nspname='public' and c.relkind in ('r','p','v','m','S')
order by c.relname, r.rolname, a.privilege_type limit __LIMIT__ offset __OFFSET__;
EOF
chunk grants-rel $SQLD/tmpl-grants-rel.sql 200

cat > $SQLD/tmpl-grants-func.sql <<'EOF'
select p.oid::regprocedure::text as obj, r.rolname as grantee,
       a.privilege_type as priv, a.is_grantable as grantable,
       gr.rolname as grantor
from pg_proc p join pg_namespace n on n.oid=p.pronamespace,
     aclexplode(p.proacl) a
     join pg_roles r on r.oid=a.grantee
     join pg_roles gr on gr.oid=a.grantor
where n.nspname='public'
order by p.oid::regprocedure::text, r.rolname, a.privilege_type limit __LIMIT__ offset __OFFSET__;
EOF
chunk grants-func $SQLD/tmpl-grants-func.sql 200

cat > $SQLD/grants-schema.sql <<'EOF'
select n.nspname as obj, r.rolname as grantee, a.privilege_type as priv, a.is_grantable as grantable, gr.rolname as grantor
from pg_namespace n, aclexplode(n.nspacl) a
join pg_roles r on r.oid=a.grantee join pg_roles gr on gr.oid=a.grantor
where n.nspname='public' order by 1,2,3;
EOF
q grants-schema $SQLD/grants-schema.sql

cat > $SQLD/default-acls.sql <<'EOF'
select d.defaclrole::regrole::text as target_role,
       coalesce(d.defaclnamespace::regnamespace::text,'') as ns,
       d.defaclobjtype as objtype,
       r.rolname as grantee, a.privilege_type as priv, a.is_grantable as grantable,
       gr.rolname as grantor
from pg_default_acl d,
     aclexplode(d.defaclacl) a
join pg_roles r on r.oid=a.grantee join pg_roles gr on gr.oid=a.grantor
order by 1,2,3,4,5;
EOF
q default-acls $SQLD/default-acls.sql

cat > $SQLD/publications.sql <<'EOF'
select p.pubname as name, p.pubowner::regrole::text as owner,
       p.pubinsert as ins, p.pubupdate as upd, p.pubdelete as del, p.pubtruncate as trunc,
       p.pubviaroot as viaroot, p.puballtables as alltables
from pg_publication p order by p.pubname;
EOF
q publications $SQLD/publications.sql

cat > $SQLD/pub-rels.sql <<'EOF'
select pr.prpubid::regpublication::text as pub, c.relname as tbl
from pg_publication_rel pr join pg_class c on c.oid=pr.prrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' order by 1,2;
EOF
q pub-rels $SQLD/pub-rels.sql

# ---- 10. particiones (solo si existen) --------------------------------------
PT=$(jq -r '.[0].partitioned_tables' "$RAW/misc-part-pub.response.json")
if [ "$PT" != "0" ]; then
cat > $SQLD/partitions.sql <<'EOF'
select p.relname as parent, c.relname as child, pg_get_expr(c.relpartbound, c.oid) as bound
from pg_inherits i
join pg_class p on p.oid=i.inhparent join pg_namespace pn on pn.oid=p.relnamespace
join pg_class c on c.oid=i.inhrelid join pg_namespace cn on cn.oid=c.relnamespace
where pn.nspname='public' and cn.nspname='public' order by 1,2;
EOF
q partitions $SQLD/partitions.sql
fi

echo "== EXTRACCIÓN COMPLETA =="
ls "$RAW" | wc -l
