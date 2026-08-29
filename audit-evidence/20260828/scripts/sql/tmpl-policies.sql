select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies where schemaname='public'
order by tablename, policyname limit __LIMIT__ offset __OFFSET__;
