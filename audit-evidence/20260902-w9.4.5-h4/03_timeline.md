# W9.4.5 — H-4 | FASE 3 — TIMELINE FORENSE

| Fecha (UTC) | Evento | Evidencia |
|---|---|---|
| ≤2026-06-15 | Última migración aplicada vía sistema de migraciones | supabase_migrations.schema_migrations máx=20260615000003 |
| 2026-08-08 | M1/B-12: V2 original escrita en repo (nunca aplicada vía migrator) | migración 20260808000004 |
| 2026-08-09 23:32 | Primera ejecución de V2 en producción (versión PR-4, huella REVERSE_RECEIPT_V2) | audit_logs (36 filas) |
| 2026-08-10 04:04 | Última ejecución registrada de la versión PR-4 | audit_logs |
| [2026-08-10 … 2026-08-30] | Producción operaba con cuerpo(s) intermedios PR-2/PR-4 | audit_logs |
| 2026-08-30 05:50 | Commit W7 1c204d1e: release consolidada DF-01 con S2.6 = cuerpo vivo actual | git show 1c204d1e |
| UNKNOWN | Momento exacto de la aplicación out-of-band del cuerpo W7 en producción | **UNKNOWN — DOCUMENTED** (ventana: ≥2026-08-10 04:04 y ≤2026-09-02; más probable ≈2026-08-30) |
| 2026-09-02 21:42 | W9.4.4 documenta el drift (H-4 registrado) | audit-evidence/20260902-w9.4.4-h2 |
| 2026-09-02 23:12 | W9.4.5 aplica la reconciliación canónica (esta fase) | migración 20260902231200 |

Respuesta a "¿Cuándo apareció el drift?": el drift (viva vs supabase/migrations) existe
desde que la release W7 se aplicó out-of-band. La fecha exacta de aplicación no está
registrada en ningún log accesible → UNKNOWN — DOCUMENTED (no se inventa fecha).
