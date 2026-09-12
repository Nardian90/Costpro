# REM-V2-1 — 10 IDEMPOTENCIA / 11 CONCURRENCIA (análisis + limitación de ejecución)

## ⚠️ Estado de ejecución (§3)

Producción = READ-ONLY ABSOLUTO. No existe staging con Postgres; no hay credenciales live en este
entorno (ver 00-baseline); SQLite local no ejecuta las RPCs. ⇒ **Las pruebas mutativas dinámicas
(same×2/×3 concurrente, T1/T2 sobre mismo stock) NO SE EJECUTAN. Se documentan y se sustituyen
por análisis de invariantes de código/DB, marcando UNKNOWN lo no demostrable.**

## Idempotencia (FASE 7)

| Camino | Protección app | Protección DB | Veredicto |
|---|---|---|---|
| checkout V1 (`create_sale`) | SELECT previo por key | **partial UNIQUE INDEX** `transactions(idempotency_key) WHERE IS NOT NULL` (20260803000003) — el INSERT duplicado concurrente FALLA | invariante DB real (backstop) |
| checkout V2 (`create_sale_v2`) | ídem | ídem (mismo índice) | invariante DB real |
| reverse receipt V1 | status-check | sin lock ⇒ ventana TOCTOU teórica | solo app (débil) |
| reverse receipt V2 | status-check | **FOR UPDATE fila receipt** — la 2ª reversión concurrente espera y luego ve status≠active ⇒ ERR | invariante por lock (adecuada) |
| void_transaction (POS undo) | status-guard B-9a | FOR UPDATE + `can_pos_undo_transaction` (ventana 30s hace el retry tardío inofensivo) | adecuada |
| reverse_transaction_v2 | `voided ⇒ return idempotent` explícito | FOR UPDATE | **status-idempotente** |
| create_devolution_v2 | SELECT por key | **UNIQUE INDEX devolutions(idempotency_key)** (20260808000002:13) | invariante DB real |
| create_devolution V1 | sin key | sin índice | débil (legacy) |

**same key + different payload**: la key se genera cliente (`sale-${uuid}`) por intento; un mismo
key con payload distinto devolvería el documento del primer efecto (checkout) — efecto único
preservado; diferencias de payload no detectadas (limitación documentada, severidad P3, patrón
idéntico V1/V2).

## Concurrencia (FASE 6) — análisis estático

- **checkout T1/T2 mismo stock**: V2 serializa por `inventory FOR UPDATE` antes de validar ⇒ no
  oversell, no doble efecto. V1 no tiene lock propio; el oversell dependía de constraints
  posteriores (experiencia operativa: mensajes ERR_INSUFFICIENT_STOCK tardíos en catálogo).
- **reverse T1/T2**: V2 serializa por FOR UPDATE del documento y del producto. V1 sin lock.
- **checkout+reverse concurrentes**: FOR UPDATE de `transactions` en el par void/reverse vs
  INSERT/UPDATE de checkout — estados `completed` exigidos por ambos lados; `trg_validate_tx_transition`
  como 2ª barrera DB.
- **WAC**: `fn_recalc_wac` con token app.wac_writer single-writer + lock de fila producto (OBS-3 REM-INV-1).

UNKNOWN (requiere ejecución en entorno seguro): pérdida de update real en `products.stock_current`
cuando V1 escribe sin lock y otro camino escribe en paralelo; latencias de deadlock. No hay evidencia
de corrupción en live (reconciliación REM-INV-1 r01 global consistente), pero la propiedad
"concurrente sin corrupción" queda **demostrada por diseño (V2) y UNKNOWN (V1)**.

## Preferencia del gate (§11)

`DB invariant > application convention` — checkout V1/V2 y devolution V2 cumplen con índice único;
reversas V2 cumplen con FOR UPDATE + estado; las V1 (receipt/adjustment) NO → otro argumento de retiro.
