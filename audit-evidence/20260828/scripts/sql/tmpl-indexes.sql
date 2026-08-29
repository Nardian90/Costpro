select c.relname as name, c.relkind as kind,
       pg_get_userbyid(c.relowner) as owner,
       pg_get_indexdef(i.indexrelid, 0, true) as def
from pg_index i join pg_class c on c.oid=i.indexrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and not i.indisprimary
  and not exists (select 1 from pg_constraint k where k.conindid=i.indexrelid)
order by pg_get_indexdef(i.indexrelid,0,true) limit __LIMIT__ offset __OFFSET__;
