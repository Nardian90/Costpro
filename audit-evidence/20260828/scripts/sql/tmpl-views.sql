select c.relname as name, c.relkind as kind,
       pg_get_userbyid(c.relowner) as owner,
       pg_get_viewdef(c.oid, true) as def,
       c.reloptions::text as reloptions
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('v','m')
order by c.relname limit __LIMIT__ offset __OFFSET__;
