select
 (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind='p') as partitioned_tables,
 (select count(*) from pg_inherits i join pg_class p on p.oid=i.inhparent join pg_namespace n on n.oid=p.relnamespace
   where n.nspname='public') as inherits_n,
 (select count(*) from pg_publication) as publications,
 (select count(*) from pg_publication_rel pr join pg_class c on c.oid=pr.prrelid join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public') as pub_rels_public;
