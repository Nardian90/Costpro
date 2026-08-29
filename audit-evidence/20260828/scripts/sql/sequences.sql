select cs.relname as name, s.seqstart, s.seqincrement, s.seqmax, s.seqmin, s.seqcache, s.seqcycle,
       format_type(s.seqtypid, null) as seqtype,
       tn.nspname||'.'||tc.relname||'.'||ca.attname as owned_by
from pg_sequence s
join pg_class cs on cs.oid=s.seqrelid
join pg_namespace n on n.oid=cs.relnamespace
left join pg_depend d on d.objid=s.seqrelid and d.deptype in ('a','i')
left join pg_class tc on tc.oid=d.refobjid
left join pg_namespace tn on tn.oid=tc.relnamespace
left join pg_attribute ca on ca.attrelid=d.refobjid and ca.attnum=d.refobjsubid
where n.nspname='public' order by cs.relname;
