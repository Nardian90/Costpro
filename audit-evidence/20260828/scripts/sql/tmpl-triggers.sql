select t.tgname as name, c.relname as tbl,
       pg_get_triggerdef(t.oid, true) as def
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and not t.tgisinternal
order by c.relname, t.tgname limit __LIMIT__ offset __OFFSET__;
