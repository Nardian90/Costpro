-- conteos por categoría en public (cada count es trivial)
select
 (select count(*) from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typtype='e') as enums,
 (select count(*) from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typtype='d') as domains,
 (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v') as views,
 (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='m') as matviews,
 (select count(*) from pg_sequence s join pg_class cs on cs.oid=s.seqrelid join pg_namespace n on n.oid=cs.relnamespace where n.nspname='public') as sequences,
 (select count(*) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public' and c.contype in ('p','u','f','c','x')) as constraints,
 (select count(*) from pg_index i join pg_class c on c.oid=i.indexrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and not i.indisprimary and not exists
      (select 1 from pg_constraint k where k.conindid=c.oid)) as indexes_nc,
 (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and not t.tgisinternal) as triggers,
 (select count(*) from pg_event_trigger) as event_triggers_ni;
