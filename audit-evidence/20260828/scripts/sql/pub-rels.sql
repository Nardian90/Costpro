select p.pubname as pub, c.relname as tbl
from pg_publication_rel pr
join pg_publication p on p.oid=pr.prpubid
join pg_class c on c.oid=pr.prrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' order by 1,2;
