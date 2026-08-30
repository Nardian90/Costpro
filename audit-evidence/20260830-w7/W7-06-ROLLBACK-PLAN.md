# W7-06 — ROLLBACK PLAN REAL (FASE 16)

## 16.1 Artefacto de rollback

`tmp/w7-rollback.sql` (149.769 B) — **generado mecánicamente desde el snapshot congelado de producción v6** (`production-schema-snapshot-20260828.sql`, SHA 351efa11…f3af), no escrito a mano. Contenido declarado en su cabecera:

```text
Funciones baseline restauradas: 24 bloques
Triggers baseline: 18 | Constraints: 1 | ACL lines: 264
```

Estructura: R1 (guard, `fn_recalc_wac`, `withdraw_production_item_v3`, `w62_df04_classify` fuera) → R2 (renombres legacy de vuelta: deprecated_6arg/9arg → withdraw_production_item; deprecated_4arg → receive_production_output) → R3 (`payment_transactions` a baseline: constraints direction/devolution_ref fuera, `ref_type_check` reconstruida SIN 'devolution', DROP COLUMN direction) → R4 (tablas auxiliares W6.2 fuera: w62_df04_*, store_credit_ledger, w62_zero_cost_flags, wac_change_log) → R5 (24 cuerpos CREATE OR REPLACE desde snapshot v6, **motor B update_product_wac incluido**) → R6 (triggers baseline, constraint original, 264 líneas ACL).

## 16.2 Ejecución real y prueba de identidad

Ciclo ejecutado sobre clon: PRE (fingerprint scoped) → aplicar 01..09 → POST_MIG → ejecutar `w7-rollback.sql` → POST_RB.

| Huella | SHA256 | Líneas |
|---|---|---|
| `tmp/w7-fp-pre.txt` | 989ca3a38bd70164b5ad9f27435536393a4fe951d9f0478e22034a746bd34891 | 38 |
| `tmp/w7-fp-postmig.txt` | 251ef144c8335198ccbded6c83f5a818425713aade040ea588f15bc0836c7266 | 64 |
| `tmp/w7-fp-postrb.txt` | **989ca3a38bd70164b5ad9f27435536393a4fe951d9f0478e22034a746bd34891** | 38 |

```text
diff w7-fp-pre.txt w7-fp-postrb.txt  →  IDENTICOS BYTE A BYTE (0 líneas)
POST_ROLLBACK fingerprint == PRE_MIGRATION fingerprint  →  ROLLBACK PROBADO
```

El fingerprint post-migración (64 líneas) contiene los objetos W6.2 (fn_recalc_wac, withdraw_v3, trg_guard_wac_writer, wac_change_log, store_credit_ledger — con sus ACL, incluida la evidencia del defecto W7-D1: `fn_recalc_wac :: anon=X, authenticated=X`); el post-rollback contiene **0 coincidencias** de objetos W6.2 (grep = 0) y es byte-idéntico al pre. La restauración no es aproximada: cuerpos, triggers, constraint y ACL vuelven al estado exacto del snapshot.

## 16.3 Rollback por paquete

| Paquete | Mecanismo | Reversible | Nota |
|---|---|---|---|
| 01 | DROP guard+fn_recalc+wac_change_log; recrear motor B + trigger; 12 cuerpos desde v6 | SÍ | probado en ciclo completo |
| 02 | restaurar create_sale_v2 desde v6; DROP w62_zero_cost_flags | SÍ | |
| 03 | DROP withdraw_production_item_v3 (sin dependientes en baseline) | SÍ | |
| 04 | RENAME deprecated→nombres originales; grants desde v6 (264 líneas) | SÍ | cuerpos nunca se pierden |
| 05 | restaurar confirm/reverse_transfer desde v6 | SÍ | |
| 06 | DROP create_devolution_v2 (en v6 no existía); REVOKE v1 reversibles desde v6 | SÍ | |
| 07 | restaurar close_v2 desde v6 | SÍ | |
| 08 | constraints/COLUMN/ledger fuera; ref_type_check original; trigger fn y devolution_v2 desde v6 | SÍ con salvedad 16.4 | |
| 09 | DROP 2 tablas + 1 función | TRIVIAL | |

## 16.4 Puntos NO trivialmente reversibles (documentados con precisión)

1. **`DROP COLUMN direction`** (R3): destruye los valores `direction='refund'` creados por devoluciones post-migración. La restauración de la `ref_type_check` original (sin 'devolution') exige además que **no exista ninguna fila ref_type='devolution'**: el rollback en producción requiere **exportar/limpiar primero** las filas de devolución creadas desde la migración (contrasientos de caja incluidos). En laboratorio (rows=0) la reversión fue exacta; en producción es un paso de negocio previo obligatorio.
2. **`wac_change_log`** (R4): la bitácora de eventos WAC se pierde con el rollback — exportar a almacenamiento externo ANTES si se requiere histórico de auditoría del período migrado.
3. **Ventana de cliente**: tras rollback, las firmas legacy renombradas vuelven a existir, pero el frontend ya migrado a v3 debe revertirse también (coordinación DB↔frontend bidireccional).
4. El ciclo probado es **pre-deploy** (esquema sin datos de negocio). Con datos reales, los pasos 16.4.1/16.4.2 convierten el rollback en operación con ventana planificada, no instantánea.

## 16.5 Veredicto FASE 16

```text
ROLLBACK GATE = PASS — POST_ROLLBACK == PRE_MIGRATION (byte-idéntico), irreversible solo lo documentado en 16.4
```
