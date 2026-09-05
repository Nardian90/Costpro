SELECT string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS vals FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='transfer_status';
