-- CP-FX-001 — Rollback de la VALIDACIÓN en la BD aislada E2E (NO de producción).
-- Deja la aislada sin residuos del experimento (regla net-zero del repo):
--   - elimina las filas importadas por el lote de recuperación;
--   - elimina la tabla congelada de respaldo creada durante el apply.
-- Reversible y re-ejecutable (idempotente). Producción JAMÁS usa este script.
DELETE FROM public.exchange_rates WHERE import_batch LIKE 'CP-FX-001-%' OR source = 'Cuba Clara';
DROP TABLE IF EXISTS public.exchange_rates_backup_cpfx001;
SELECT count(*)::int AS informales_restantes FROM public.exchange_rates WHERE source <> 'BCC';
