select c.relname as name, c.relkind as kind,
       pg_get_userbyid(c.relowner) as owner,
       c.relrowsecurity as rls, c.relforcerowsecurity as rls_force,
       c.reloptions::text as reloptions,
       (select json_agg(json_build_object(
          'n', a.attname,
          't', format_type(a.atttypid, a.atttypmod),
          'nn', a.attnotnull,
          'd', case when coalesce(a.attgenerated,'')<>'' then null else pg_get_expr(ad.adbin, ad.adrelid) end,
          'i', case when a.attidentity='a' then 'always' when a.attidentity='d' then 'by default' else null end,
          'g', case when a.attgenerated='s' then pg_get_expr(ad.adbin, ad.adrelid) else null end,
          's', case when a.attstorage <> t.typstorage then a.attstorage::text else null end,
          'c', case when a.attcollation <> t.typcollation and t.typcollation <> 0 then a.attcollation::regcollation::text else null end)
          order by a.attnum)
        from pg_attribute a
        left join pg_attrdef ad on ad.adrelid=a.attrelid and ad.adnum=a.attnum
        join pg_type t on t.oid=a.atttypid
        where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as cols
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','p')
order by c.relname limit __LIMIT__ offset __OFFSET__;
