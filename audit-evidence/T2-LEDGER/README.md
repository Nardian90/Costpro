# T2-LEDGER — evidencia de la misión pendientes (T2)

Contenido:

- `drift-report-prod-2026-11-06.md` — informe de deriva contra **producción**
  (CostproBD, `wthkddeleylijmonclxg`), SOLO LECTURA, generado con
  `CP_DRIFT_REF=wthkddeleylijmonclxg node scripts/ops/drift-report.cjs --out …` [MEDIDO 2026-11-06T12:57Z].
- `drift-report-e2e-2026-11-06.md` — ídem contra **CostproE2E** (`lguovmvrozxgssupkwpf`).

NOTA sobre el resultado: en la rama `feat/ledger-migraciones-produccion` (independiente,
desde `main`), el JSON de huella certificado sigue siendo el del 2026-11-04 (su
refrescamiento con producción como referencia vive en el PR de T0). Por eso el informe
de producción lista las divergencias que T0 ya clasificó (firma nueva de
`create_sale_v2`/`register_reception`, lote clasificador, cuerpos de
`create_master_product`/`get_transactions`/`is_party_store_connected`). Que la
herramienta reproducza independientemente los hallazgos de T0 es la validación de
que el informe de deriva funciona. Tras fusionar T0, el mismo comando debe dar
paridad salvo las excepciones documentadas.

Aplicaciones registradas en E2E durante las pruebas T2 [MEDIDO]:

- Migración `20261106130000_production_migration_ledger.sql` aplicada a CostproE2E
  (DDL idempotente; en esta rama independiente se aplicó directamente por Management API
  porque el apilador de esta rama no incluye las transformaciones de T1).
- Prueba del trigger SOLO-ADICIÓN: INSERT ok; UPDATE → `55006 … UPDATE bloqueado`;
  DELETE → `55006 … DELETE bloqueado`. RLS habilitado, 0 políticas, 10 columnas.
- Fila de PRUEBA insertada y conservada (SOLO-ADICIÓN impide borrarla):
  version=`TEST-E2E-2026-11-06`, etiquetada como prueba del sandbox.
- `supabase_migrations.schema_migrations` de producción NO fue tocado; la siembra
  (`scripts/ops/production_migration_ledger_seed.sql`) NO se ejecutó en producción
  (requiere la frase literal `AUTORIZO LEDGER PROD`).
