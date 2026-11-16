# CONTRACT_SURFACE_FINAL.md — CP-FIN-ULTIMATE-CLOSE-008

Fecha: 2026-11-16 · Modo: **solo lectura** · Herramienta oficial: `scripts/export-contract-surface.cjs` (captura `pg_get_functiondef` verbatim de las funciones SECURITY DEFINER de escritura en `public`)

## Veredicto

**La superficie viva coincide con el código aprobado.** Regeneración fresca del contract-surface desde producción (2026-11-16T12:58:10Z): **208 funciones** con `proacl` verbatim, `sha256=916d07b366b14ff8b17267ae4a26c41a8364d1bfdb36811a6de444131aaf3d56`.

## Comparación contra `main` (commitado)

`git diff` entre la captura fresca y `supabase/security-contract/contract-surface.sql` de `main@337d4532`:

```
 1 file changed, 1 insertion(+), 1 deletion(-)
--- Captured  : 2026-11-15T18:30:22.067Z
+++ Captured  : 2026-11-16T12:58:10.683Z
```

**La única línea que difiere es el timestamp de captura.** Cero divergencias funcionales: las 208 funciones, sus cuerpos y sus ACL son byte-idénticos entre producción viva y el árbol aprobado en `main`.

## Comprobaciones asociadas

| Control | Resultado |
|---|---|
| Excepción temporal `fin_post_document_annulment/2 source_of_truth_baseline` | **AUSENTE** (0 resultados en el archivo comprometido; retirada por PR #1630) |
| `fin_post_document_annulment` en surface con `proacl={postgres=X/postgres,service_role=X/postgres}` | SÍ (línea 8073) |
| Helper `fin_entry_reversal_residual` en surface (l. 8099, invocado por el motor) | SÍ |
| Divergencias nuevas sin documentar | **NINGUNA** (diff = timestamp) |
| Census general de SECURITY DEFINER (incluye no-escritura) | 367, estable (m059 C1) |

El replay estático en CI (`security-contract-test-static.cjs`, capa A) sigue verde con el surface comprometido; la captura fresca de hoy demuestra que el compromiso sigue representando la realidad de producción.
