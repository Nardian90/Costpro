-- extensiones instaladas + tipos standalone + agregados + event triggers + default acls (metadatos)
select
  (select count(*) from pg_extension) as extensions_n,
  (select string_agg(extname||'@'||extversion, ', ' order by extname) from pg_extension) as extensions,
  (select count(*) from pg_type t join pg_namespace n on n.oid=t.typnamespace
     where t.typtype='c' and n.nspname='public'
       and not exists (select 1 from pg_class c where c.reltype = t.oid)) as standalone_composites,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where p.prokind='a' and n.nspname='public') as aggregates_public,
  (select count(*) from pg_event_trigger) as event_triggers,
  (select count(*) from pg_default_acl) as default_acls,
  (select count(*) from pg_policy pol join pg_class c on c.oid=pol.polrelid
     join pg_namespace n on n.oid=c.relnamespace where n.nspname='public') as policies_public,
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relkind in ('r','p')) as tables_public,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.prokind in ('f','p','w')) as routines_public;
