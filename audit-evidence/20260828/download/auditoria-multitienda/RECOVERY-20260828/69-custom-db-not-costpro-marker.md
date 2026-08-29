# 69 · MARCADOR DE EVIDENCIA — `Costpro/db/custom.db`

Fecha: 2026-08-28 · Orden del dueño: «Debe quedar registrado como **NOT COSTPRO DATABASE / PLACEHOLDER DEMO** y fuera de toda evidencia contable.»

## Declaración

```text
RUTA .............. /home/z/my-project/Costpro/db/custom.db
VEREDICTO ......... NOT COSTPRO DATABASE / PLACEHOLDER DEMO
EVIDENCIA CONTABLE  NINGUNA — EXCLUIDA de toda auditoría, censo contable,
                    backfill, invariante o reporte de la cadena WAC-DATAFLOW
USO PERMITIDO ..... ninguno para la auditoría; la app dev corre contra ella
                    sin datos de negocio (esquema demo Prisma Post/User)
```

## Evidencia de la determinación (censo READ-ONLY del 2026-08-28)

- Motor: SQLite (bun:sqlite, modo readonly, script `scripts/census-custom-db.ts`).
- Tablas: exactamente 2 — `Post`, `User`. Esquema demo genérico de Prisma.
- Ausencias determinantes: sin `stores`, `products`, `transactions`, `transaction_items`, `stock_movements`, `receipt_items`, `devolutions`, `production_orders`, `payment_transactions` — es decir, sin NINGUNA tabla del dominio CostPro.
- Conclusión: no es réplica del esquema de producción Supabase, no es el Audit Harness PostgreSQL (que se perdió con el sandbox), y no contiene datos de negocio.

## Efectos en la cadena

- El «baseline nuevo» exigido por el dueño se construirá EXCLUSIVAMENTE sobre el harness PostgreSQL reconstruido con fixtures `AUDIT_*` — nunca sobre este archivo.
- Cualquier artefacto futuro que cite `custom.db` como fuente contable debe considerarse inválido de raíz.
