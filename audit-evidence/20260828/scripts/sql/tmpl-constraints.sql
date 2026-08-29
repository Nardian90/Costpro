select con.conname as name, con.conrelid::regclass::text as tbl, con.contype as type,
       pg_get_constraintdef(con.oid, true) as def,
       con.condeferrable, con.condeferred, con.convalidated
from pg_constraint con join pg_namespace n on n.oid=con.connamespace
where n.nspname='public' and con.contype in ('p','u','f','c','x')
order by con.conrelid::regclass::text, con.conname
limit __LIMIT__ offset __OFFSET__;
