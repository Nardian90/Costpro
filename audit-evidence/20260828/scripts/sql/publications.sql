select p.pubname as name, p.pubowner::regrole::text as owner,
       p.pubinsert as ins, p.pubupdate as upd, p.pubdelete as del, p.pubtruncate as trunc,
       p.pubviaroot as viaroot, p.puballtables as alltables
from pg_publication p order by p.pubname;
