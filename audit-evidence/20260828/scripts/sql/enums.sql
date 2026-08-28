select t.typname as name,
       (select string_agg(e.enumlabel, chr(31) order by e.enumsortorder) from pg_enum e where e.enumtypid=t.oid) as labels
from pg_type t join pg_namespace n on n.oid=t.typnamespace
where n.nspname='public' and t.typtype='e' order by t.typname;
