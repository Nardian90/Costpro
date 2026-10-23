# Reconciliación del historial de migraciones — v2.24.1 (2026-10-24)

## Estado real (inventario verificable)

Fuente: `audit/migration-reconciliation.json` (generado por
`scripts/reconcile-inventory.py`, solo lectura vía Management API, 2026-10-24).

| Conjunto | Cantidad |
|---|---|
| Migraciones versionadas en Git (`supabase/migrations/*.sql`) | 483 |
| Registradas en `supabase_migrations.schema_migrations` (Supabase) | 12 (última: `20260615000003`) |
| Sin registrar | **471** |

Clasificación de las 471 sin registrar según presencia verificable de sus
efectos de firma en el esquema vivo (tablas, vistas, tipos, funciones con
aridad, índices, columnas, políticas):

| Estado | Cantidad | Lectura |
|---|---|---|
| `materializada-verificada` | 33 | todos los objetos de firma existen hoy |
| `efectos-parciales-o-ausentes` | 149 | parte de la firma NO existe en vivo |
| `firma-distinta` | 203 | el objeto existe pero con aridad/evolución posterior |
| `no-verificable-por-catalogo` | 86 | solo ACL/DROP/DML (sin firma catalogable) |

## Decisión técnica (orden §7)

El mecanismo oficial (`schema_migrations`) **no representa con seguridad** este
estado fuera de banda:

- Insertar solo las 33 verificadas dejaría al CLI tratando las otras 438 como
  **pendientes** → una futura `supabase db push` re-ejecutaría migraciones
  históricas contra objetos vivos (riesgo destructivo).
- Insertar las 471 ocultaría los huecos reales de las 149 con efectos
  parciales/ausentes (violando la regla "no marcar sin verificar").

Por tanto: **NO se modifican los metadatos de producción en esta misión.** Se
entrega el procedimiento validado y el inventario completo como artefactos.

## Procedimiento de reparación exacto (ventana futura autorizada)

1. `python3 scripts/reconcile-inventory.py` → regenera el inventario.
2. Resolver las `efectos-parciales-o-ausentes` una a una (migraciones de datos
   o de dependencias faltantes) hasta que el inventario sea 100%
   `materializada-verificada`. Cada resolución debe ir en NUEVAS migraciones
   forward-only, jamás re-ejecutando históricas.
3. Ejecutar `python3 scripts/reconcile-execute.py --execute --target=prod
   --yes-i-know`:
   - pre-dump de `schema_migrations` (backup JSON recuperable);
   - INSERT de las filas en **una sola transacción**;
   - post-verificación (conteo y últimas versiones);
   - recuperación definida: restaurar el pre-dump (DELETE + re-INSERT de las
     12→N filas originales). No toca datos financieros (solo metadatos).

## Comprobaciones previas obligatorias (checklist)

- [ ] Inventario regenerado y 100% `materializada-verificada`.
- [ ] Backup del pre-dump guardado fuera del servidor.
- [ ] Ventana de mantenimiento sin operaciones de caja activas.
- [ ] `supabase db push --dry-run` posterior sin migraciones pendientes.
