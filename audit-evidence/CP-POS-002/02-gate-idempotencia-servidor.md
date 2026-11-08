# CP-POS-002 — Gate de idempotencia del servidor (verificación, solo lectura)

Fecha: 2026-11-08 · Método: lectura de migraciones del repo (definición verbatim de producción confirmada por la migración de snapshots 20261105140000, que declara copiar la definición viva) — cero escrituras contra cualquier entorno.

## Veredicto: SÍ existe idempotencia REAL, por llave

**`create_sale_v2` recibe y USA la llave de idempotencia; existe deduplicación persistente, restricción única atómica y verificación llave↔contenido (param_hash).**

### Evidencia (archivo:línea de las migraciones)

1. **Firma** — `supabase/migrations/20261105140000_cp_clasificador_fase4_snapshots.sql:60-62` (vigente; ninguna migración posterior la redefine — verificado 2026-11-08):
   `p_idempotency_key text DEFAULT NULL` (posición 19 de la firma). El id de la venta lo genera el servidor (`v_tx_id uuid := gen_random_uuid()`, :69) — el cliente jamás envía el id de la transacción.

2. **Deduplicación persistente** — tabla `idempotency_registry` (creada en `20260810000012_v2_26_hotfix3_idempotency_registry.sql:6-18`) con `UNIQUE (idempotency_key, operation)`.

3. **Registro atómico** — `20261105140000:237-240`:
   `INSERT INTO idempotency_registry(...) VALUES (key,'create_sale_v2',v_tx_id,v_param_hash,{status:'pending'}) ON CONFLICT (idempotency_key, operation) DO NOTHING`.

4. **Correspondencia llave↔contenido** — `v_param_hash := md5(store|actor|items|pagos|descuentos|operation_date|liquidación|payment_components)` (:192-235, determinista). Si el registro preexiste:
   - hash IGUAL → busca `transactions WHERE idempotency_key AND store_id` → si existe → **`RETURN {status:'idempotent', transaction_id}` sin re-ejecutar efectos** (:261);
   - si no aparece (concurrente en curso) → `pg_sleep(0.1)` + relectura → idempotente o `RAISE` "aún en curso" (:263-270, fail-closed);
   - hash DISTINTO → **`RAISE ERR_IDEMPOTENCY_KEY_REUSE`** (:252) — misma llave con contenido diferente jamás sobrescribe.

5. **Backstop atómico anti-TOCTOU** — índice `transactions_idempotency_key_store_idx UNIQUE (idempotency_key, store_id) WHERE idempotency_key IS NOT NULL` (`20260803000003_v2_13_3_transactions_idempotency_unique.sql:24-26`).

6. **Camino API** — `/api/sync/batch` hace prefetch de `sync_log` por clave (replay 'ok' sin re-ejecutar) + dedupe intra-batch; `/api/pos/checkout` pasa `p_idempotency_key: d.idempotency_key` (`route.ts:283`) y mapea `ERR_IDEMPOTENCY_KEY_REUSE` a 409 (`route.ts:467-470`).

### Qué garantiza / qué no

| Escenario | Resultado |
|---|---|
| Reenvío con MISMA llave + mismo contenido (reintento automático tras respuesta perdida) | 1 venta; la RPC responde `{status:'idempotent', transaction_id}` — SIN duplicar efectos |
| Misma llave + contenido DISTINTO | `ERR_IDEMPOTENCY_KEY_REUSE` → conflicto de integridad (revisión humana; nunca sobrescribe) |
| Llave DISTINTA + mismo contenido (p. ej. el bug pre-D1: llave regenerada por intento) | **2 ventas reales** — la idempotencia es por llave, no por contenido. Este es el hueco que D1 cierra en el cliente |

### Conclusión para D1

La garantía del servidor es suficiente y REAL para reintentos que conserven la llave: la misión **reutiliza** este mecanismo (llave estable + payload congelado del outbox) y NO introduce mecanismos de idempotencia ficticios. No se modificó la RPC ni se crearon migraciones (restricciones §3.3 respetadas).

Limitación documentada para misiones futuras: el endpoint `/api/pos/checkout` acepta `idempotency_key: z.string().min(1)` (cualquier string, `route.ts:152`) — alinearlo con el uuid estricto de la cola es opcional (la llave `sale-<uuid>` siempre cumple min(1)).
