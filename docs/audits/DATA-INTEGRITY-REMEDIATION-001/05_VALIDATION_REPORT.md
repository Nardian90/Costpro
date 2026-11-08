# 05_VALIDATION_REPORT — Pruebas y evidencias

Entorno de validación: clúster PostgreSQL 17.11 local (socket-only) con la copia fiel del dump de producción `20261108-0056` (BD `costpro_integrity`), restaurada de cero para esta validación. Producción solo para verificaciones read-only (GET/HEAD/PostgREST). Suite estática con vitest sobre el repositorio.

---

## 1. Conteo inicial → final por categoría de huérfanos (BD de verificación, tras aplicar A+B+C)

| Categoría | Inicial | Final | Tratamiento |
|---|---|---|---|
| `commission_rule_versions` filas totales | 73 | **73** | Ninguna fila eliminada |
| — huérfanas por `rule_id` (FK rota) | 72 | 72 — ahora **referencias suaves**: 72 marcadas `parent_deleted_at` | R2 conservación |
| — huérfanas por `changed_by` | 18 | 18 — referencias suaves de proveniencia (conteo conocido y trazable) | R2 conservación |
| `purchase_order_items` filas totales | 10 | **10** | Ninguna fila eliminada |
| — huérfanas por `po_id` | 10 | 10 — marcadas `parent_deleted_at` | R2 conservación |
| — huérfanas por `product_id` | 10 | 10 — marcadas `product_deleted_at` | R2 conservación |
| `storage.objects` bucket `stores` | 31 | **31** (producción: sin cambios; el "31 fantasmas" era falso positivo) | Sin acción |
| Snapshots históricos destruidos | — | **0** | N/A (nada se borró) |

**Importante:** el contador de "huérfanos" no bajó a cero — no era el objetivo. Lo que cambió es su **estado**: de inconsistencias invisibles que rompían la restauración del dump y bloqueaban la integridad referencial, pasaron a ser referencias suaves documentadas, marcadas con timestamp y contabilizadas por un RPC. La evidencia de que el tratamiento es correcto: los snapshots están intactos (73/10 filas, contenido byte a byte), los marcadores cubren el 100 % de los casos (72/72 y 10/10) y las verificaciones de integridad nuevas pasan.

## 2. Integridad de las relaciones modificadas (pruebas de comportamiento en la BD de verificación)

| Prueba | Escenario (el mismo que creó los huérfanos) | Resultado |
|---|---|---|
| P1 | Crear regla viva (el trigger snapshot crea v1) → `DELETE FROM commission_rules` como hace la API | ✓ La versión **sobrevive** (1 fila antes y después) y queda **marcada** `parent_deleted_at` (antes: CASCADE la destruía silenciosamente) |
| P2 | `INSERT INTO commission_rule_versions` con `rule_id` inexistente | ✓ Rechazado con `23503` (`ERR_INVALID_PARENT`) — integridad de escritura intacta |
| P3 | Crear pedido + renglón → `DELETE FROM purchase_orders` | ✓ El renglón **sobrevive** (snapshot comercial intacto) y queda marcado |
| P4 | `INSERT INTO purchase_order_items` con `po_id` inexistente | ✓ Rechazado con `23503` |
| P5 (implícita) | DELETE de tienda → cascada sobre reglas → versiones | Cubierto por P1 + trigger `trg_stores_mark_orphan_versions` (marcado directo por `store_id` del snapshot) |

## 3. Idempotencia de las migraciones (requisito misión §7.10)

Triple ejecución secuencial de A→B→C sobre la BD de verificación: **0 errores en las 3 pasadas**; estado invariante tras cada pasada (`stores=31 · marcadas=72 · items_po=10 · items_prod=10 · audit=3`). La re-ejecución de B y C no inserta auditoría duplicada (protección `NOT EXISTS`); la de A no re-marca (filtro `IS NULL`) y no vuelve a tocar constraints (`IF EXISTS`).

## 4. Verificación de que no se perdieron snapshots históricos

- Conteos de filas idénticos antes/después (73 versiones, 10 renglones) — la migración A contiene **cero** `DELETE`/`UPDATE` de contenido sobre esas tablas (el único UPDATE es el marcador `parent_deleted_at`), garantía fijada por la prueba estática (`not.toMatch(/DELETE...commission_rule_versions|purchase_order_items/i)`).
- El dump original permanece intacto como referencia (SHA-256 en el manifiesto de la corrida).

## 5. Ventas, pedidos históricos y comisiones (misión §7.4-5)

- Las tablas de cálculo (`transactions`, `transaction_items`, `sales`, `commission_payments`) no se tocan: el único pago existente referencia la regla viva (verificado antes y después).
- La lectura de comisiones históricas por snapshots no requiere el padre: `check_data_integrity()` expone `soft_refs` como estado estructural consultable.
- SC-2-01 (documento legal de pedidos): la tabla `purchase_order_items` conserva su esquema y contenido al 100 % (solo columnas nuevas de marcador añadidas) — el exportador sigue leyendo `product_name`/`sku`/`unit_cost` del snapshot.

## 6. Storage — comprobación de los 31 recursos y visualización (misión §7.7-8)

- Re-verificación física con rutas completas (GET autenticado al origen): **31/31 archivos existen** con sus bytes exactos de metadato. El hallazgo "31 inexistentes" era un falso positivo del descargador (02 §D).
- Las **10 referencias vivas** de tiendas resuelven: verificador `scripts/reconcile-storage.mjs` → `10 referencias vivas · 10 OK · 0 rotas` (HEAD público por referencia, como el navegador).
- Prueba estática UI: `onError` presente en banner (fallback al banner oficial del repo), logos (3 plantillas, fallback icono Package) y carrusel (exclusión de promos rotas). No hay imágenes de otras tiendas reutilizadas (assert negativo).
- Respaldo completo re-verificado: 307 archivos descargados con 0 errores y 0 discrepancias de tamaño; addendum cifrado subido y verificado por hash (descarga + SHA-256 idéntico).

## 7. Regresión automatizada

| Batería | Resultado |
|---|---|
| `data-integrity-remediation-001.test.ts` (23 asserts de esta misión) | **23/23 ✓** |
| `replay-unblock-create-sale-v2.test.ts` (manifiesto de migraciones) | **7/7 ✓** (posiciones 74/75/76/80 intactas; 131–133 nuevas certificadas) |
| `iteration-rls.test.ts` (toca commission_rules/RLS) | **40/40 ✓** |
| `backup-schema-validation.test.ts` | 10 skipped (requiere BD E2E remota — no disponible en este entorno; sin cambios de esquema que afecten su dominio: la tabla backup registry no se toca) |
| Suite estática e2e completa (`src/__tests__/e2e/`) | **101/101 ✓** |
| TypeScript (`tsc --noEmit -p tsconfig.json`) | **0 errores** |
| ESLint (archivo modificado) | **0 errores** (28 warnings preexistentes de estilo `<button>` vs `<Button>`, sin relación) |

## 8. RPCs de prevención — salida real post-remediación (BD de verificación)

```json
{
  "orphans": {
    "commission_payments_worker": 0,
    "commission_payments_rule_applied": 0
  },
  "soft_refs": {
    "purchase_order_items_total": 10,
    "commission_rule_versions_total": 73,
    "purchase_order_items_po_deleted_UNMARKED": 0,
    "purchase_order_items_product_deleted_UNMARKED": 0,
    "commission_rule_versions_parent_deleted_marked": 72,
    "commission_rule_versions_parent_deleted_UNMARKED": 0,
    "commission_rule_versions_changed_by_missing_profile": 18
  },
  "fk_constraints_present": 17
}
```

Lectura: 0 huérfanos de referencia dura; 0 snapshots sin marcar; las 18 referencias suaves de `changed_by` quedan como estado conocido y trazable (no error).

## 9. Pendiente de validación en producción (tras decisión del propietario)

1. Aplicar las 3 migraciones por el flujo establecido (la prueba de idempotencia garantiza seguridad ante re-ejecución).
2. `SELECT public.check_data_integrity();` — debe reproducir la salida de §8.
3. `bun scripts/reconcile-storage.mjs` — debe dar `10 referencias vivas · 10 OK · 0 rotas`.
4. CI del PR (TypeCheck/Lint/Tests/Build, Security, SQL gates) — las 2 RPCs nuevas cumplen el patrón del gate (ERR_PERMISSION_DENIED + REVOKE; funciones trigger exentas por diseño).
