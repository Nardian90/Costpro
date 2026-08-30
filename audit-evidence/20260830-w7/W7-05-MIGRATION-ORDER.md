# W7-05 — MIGRATION ORDER (FASE 14)

Orden de aplicación derivado del grafo de dependencias real (W7-02) y de la auditoría de paquetes (W7-01). Validado empíricamente sobre clon `w7_gate`: los 9 paquetes aplicados en este orden → fingerprint post-migración medido (`tmp/w7-fp-postmig.txt`, SHA 251ef144…) y suite completa de regresión en verde (W7-11/12/13).

## 14.1 Orden canónico

```text
PRECHECK → 01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → ASSERT-FINAL
```

| Paso | Paquete | Por qué en esta posición | Dependencia dura |
|---|---|---|---|
| 1 | **01-df01-wac-singleton** | Primero: instala el guard `trg_guard_wac_writer` y el escritor único `fn_recalc_wac`; todo paquete posterior escribe WAC solo a través de él | ninguna (tabla nueva + redefiniciones firma-idénticas) |
| 2 | **02-df02-cogs** | Crea `w62_zero_cost_flags` (usada por 03 y 05); corrige `create_sale_v2` | 01 (guard activo) |
| 3 | **03-df05-production** | `withdraw_production_item_v3` usa `w62_zero_cost_flags` | 02 |
| 4 | **04-df09-overloads** | `create_vale_salida` migrada LLAMA a `withdraw_production_item_v3` | 03 |
| 5 | **05-df06-transfer** | blend destino usa `fn_recalc_wac` | 01 |
| 6 | **06-df07-devolution-cap** | primera versión de `create_devolution_v2` (cap) + REVOKE v1 | — (independiente; debe ir ANTES de 08) |
| 7 | **07-df08-close-fix** | independiente (close→receive chain sobre 6-arg endurecida por 04) | recomendado tras 04 |
| 8 | **08-df03-devolution-finance** | **SUSTITUYE** `create_devolution_v2` (versión final = cap DF-07 + contra-asiento DF-03); ALTER TABLE payment_transactions | 06 (y 01) |
| 9 | **09-df04-design-only** | último: artefacto de diseño, sin dependencias; decisión de despliegue separable | — |

Invariante crítico (hallazgo H1): **06 debe preceder a 08, o 08 aplicarse solo** — `create_devolution_v2` está definida en ambos paquetes y 08 es la versión final. Con el orden canónico 06→08 no hay ventana intermedia rota (06 establece cap sin finanzas; 08 añade finanzas).

## 14.2 PRECHECK (obligatorio en producción viva antes de iniciar)

| # | Chequeo | Método | Falla si… |
|---|---|---|---|
| P1 | S1 fingerprint vs baseline `9e7cea9a…edc2` | `fingerprint.sql` congelado | DIFF ≠ 0 (esquema derivado) |
| P2 | `payment_transactions` volumen de filas y duración de scan | `EXPLAIN SELECT * FROM payment_transactions` + count | la reconstrucción de `ref_type_check` (pkg 08) requiera lock exclusivo demasiado largo (hallazgo H2: el snapshot 20260828 es solo-esquema; el volumen real es desconocido hoy) |
| P3 | filas que violarían la nueva `ref_type_check` / `devolution_ref_check` | SELECT de filas con ref_type='devolution' o ref_id/transaction_id NULL en devoluciones | existan filas inválidas → la ADD CONSTRAINT fallará a mitad del DDL |
| P4 | overloads legacy presentes (withdraw 6/9-arg, receive 4-arg) | `pg_proc.proargtypes` | ya renombradas (re-aplicación) |
| P5 | motor B existe (trg_update_product_wac + update_product_wac) | pg_trigger/pg_proc | ausente (estado inesperado) |
| P6 | PostgREST alcanzable para `NOTIFY pgrst, reload schema` tras pkg 04 | conexión de control | sin reload, el cache de schema de PostgREST queda obsoleto |

## 14.3 Atomicidad y protocolo de aplicación

- Cada paquete se aplica en **UNA transacción única** con `ON_ERROR_STOP=1` (protocolo W6.2, reutilizado sin cambios). Verificado en laboratorio: fallo a mitad de paquete ⇒ rollback completo del paquete (INV-12, W7-07).
- **No se requieren SAVEPOINT entre paquetes** — la unidad de atomicidad es el paquete. (Nota de laboratorio: `SAVEPOINT` fuera de bloque TX emite error — el runner psql debe usar transacciones explícitas, hallazgo del probe F13.)
- `LOCK TIMEOUT` recomendado para los DDL de pkg 08 (ALTER TABLE sobre `payment_transactions` toma **ACCESS EXCLUSIVE**): `SET lock_timeout='5s'` en la sesión de migración; si expira, reintentar en ventana de mantenimiento.
- Tras pkg 04: `NOTIFY pgrst, reload schema` (o restart de PostgREST) — sin esto, los clientes ven firmas obsoletas en el cache aunque la BD esté correcta.
- ASSERT por paquete: cada paquete termina con su bloque de verificación (`TOCTOU`-free asserts embebidos en los SQL 01..09); fallo de assert ⇒ abortar migración completa y ejecutar rollback (W7-06).

## 14.4 Duración estimada

| Fase | Estimación | Base |
|---|---|---|
| PRECHECK | minutos | queries de catálogo + counts |
| Paquetes 01-07, 09 | segundos c/u | DDL puro y funciones; sin rewrites |
| Paquete 08 | segundos (snapshot vacío) → **proporcional al scan de validación en producción** | ADD CONSTRAINT sin NOT VALID = full scan; medido en PRECHECK P2 |
| Total DDL | < 1 minuto + duración del scan de pkg 08 | — |

## 14.5 Veredicto FASE 14

```text
MIGRATION ORDER GATE = PASS (orden único válido, dependencias cubiertas, atomicidad por paquete demostrada)
```

Condiciones registradas para el runbook del dueño: P2 (re-medir volumen vivo), P6 (reload PostgREST), y la ventana de despliegue frontend (W7-04 §13.3 — las rutas withdraw/devolutions/reset quedan rotas hasta W8 si la BD va sola).
