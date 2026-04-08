# Solicitud de Revisión de Código - Auditoría de Sincronización Pick 3

## Cambios realizados:
1. **Infraestructura (Python)**: Se agregaron `pdfplumber` y `supabase` a `requirements.txt` para corregir el fallo del pipeline de PDF en entornos de producción.
2. **Backend (API)**: Se mejoró el manejo de errores en `/api/pick3/sync/route.ts` para que fallos en la fuente de verdad (PDF) lancen una excepción capturable en lugar de fallar silenciosamente.
3. **Pruebas (Migration)**: Se migraron los archivos de prueba de `bun:test` a `vitest` (`Pick3Scraper.test.ts` y `simulation.test.ts`) para mantener la compatibilidad con el entorno de CI.
4. **Documentación**: Se generó `AUDIT_REPORT_SYNC_PICK3.md` con el análisis detallado de la ruptura del 29/03.
5. **Datos**: Se realizó un backfill manual que restauró la continuidad del historial hasta el 07/04/2026.

## Verificación:
- Tests unitarios de Scraper y Simulation pasan con Vitest.
- Script de parsing validado localmente con el PDF oficial.
- Consultas SQL confirman la integridad de los datos insertados.
