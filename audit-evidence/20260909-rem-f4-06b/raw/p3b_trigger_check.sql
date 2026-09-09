-- @statement: TRIGGER_STATE_SAFETY_CHECK
SELECT tgname, tgenabled FROM pg_trigger
WHERE tgrelid='fiscal_closings'::regclass AND NOT tgisinternal ORDER BY tgname;
