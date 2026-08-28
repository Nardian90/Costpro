select e.evtname as name, e.evtevent as event, e.evtenabled as enabled,
       e.evtfoid::regprocedure::text as handler,
       (select array_to_string(array_agg(t order by t), chr(31)) from unnest(e.evttags) t) as tags,
       pg_get_userbyid(e.evtowner) as owner
from pg_event_trigger e order by e.evtname;
