/* Setup mínimo para probar get_sales_dashboard_analytics con RLS real.
   Carga después de baseline.sql (que trae esquema+datos+RLS). */
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- La función de la misión
\i supabase/migrations/20261108141000_sales_dashboard_analytics.sql
