# CP-MONEY-002 — Auditoría posmerge de PR #1467: integridad contable y cierre de pagos mixtos USD/CUP

**Fecha:** 2026-10-24/25 · **Rama:** `fix/cp-money-002-postmerge-integrity` · **Base:** `main` @ `173e80c` (merge de #1467)
**Alcance:** auditoría técnica-contable del código FUSIONADO + correcciones incrementales de defectos demostrados + pruebas. **Sin modificaciones productivas.**

---

## 1. Estado real reconstruido (Fase A)

| Elemento | Estado verificado | Método de verificación |
|---|---|---|
| `main` HEAD | `173e80c` = **merge commit de PR #1467** (feature `09e8176` + fix tipos `b76bbad`) | `git log` |
| Migración `20261024150000` (v2.25.0) | **Presente en el repo, NO aplicada a la BD de producción** | `pg_proc` (ver abajo) |
| `create_sale_v2` desplegada | Firma de **31 params** — SIN `p_payment_components` | `pg_get_function_identity_arguments` vía Management API (solo SELECT) |
| Overloads de `create_sale_v2` en prod | **Exactamente 1** (la legada) | `SELECT count(*) FROM pg_proc` |
| Helpers de tasa de §13.7 en prod | **0** (`resolve_usd_rate*` no existe) | `pg_proc` |
| `payment_transactions` | Sí tiene `currency` + `exchange_rate`; `amount_cup` GENERATED (`amount` si CUP, `amount × rate` si USD); **sin UNIQUE(idempotency_key)** — solo PK | `information_schema.columns`, `pg_constraint` |
| Tabla `supabase_migrations.schema_migrations` | Desactualizada (última `20260615000003`) — las migraciones se aplican por otro mecanismo; **no inferir estado de aplicación por la tabla de tracking** | SELECT |
| Rutas que crean/sincronizan ventas | `/api/pos/checkout` (online, POS Vender) y `/api/sync/batch` (replay offline, Catálogo) — **solo esos 2 llamadores reales** de `create_sale_v2` | `grep -r "\.rpc('create_sale_v2"` |
| Offline con pagos mixtos | **No existe en el producto actual**: la única cola offline (Catálogo de Ventas) es CUP-canónica por diseño (sin filas multimoneda); el POS Vender es solo-online | lectura `useSalesCatalog.ts` |
| Devoluciones | `reverse_transaction_v2` revierte a nivel transacción; **no toca `payment_transactions`**; el Reporte Entrega filtra `status='completed'` → la venta revertida no se cuenta | `pg_get_functiondef` + `cash-report/route.ts` |
| Clientes legacy (`cash_paid`/`cash_currency`) | Compatibles: `syncLegacyFields` (suma canónica CUP en multi-moneda), builder con fallback a campos legacy, heurística del reporte para históricas | `cart.ts`, `payment-components.ts`, `collection-currency.ts` |

### 1.1 Sondas PGRST contra la BD viva (evidencia P0 — sin ejecución de la función)

Payloads **no ejecutables** (la resolución de PostgREST precede a cualquier ejecución; cero escrituras):

```
POST /rest/v1/rpc/create_sale_v2  {"p_payment_components":[{"method":"cash","currency":"USD","amount":5}]}
→ PGRST202: Could not find the function public.create_sale_v2(p_payment_components) in the schema cache

POST /rest/v1/rpc/create_sale_v2  {"p_payment_components": null}
→ PGRST202 (IGUAL — una clave null TAMBIÉN participa en la resolución)

POST /rest/v1/rpc/create_sale_v2  {"p_store_id":"not-a-uuid","p_seller_id":"not-a-uuid","p_items":[]}
→ 22P02 invalid input syntax for type uuid  (la función RESUELVE sin la clave extra)
```

**Conclusión:** el código fusionado — que envía la clave SIEMPRE (null cuando no hay mixto) — **no puede crear NINGUNA venta** contra la BD en su estado actual. No es un defecto de pagos mixtos: rompe las ventas CUP puras y TODO replay offline.

---

## 2. Defectos confirmados y causa raíz

### D1 (P0) — La clave `p_payment_components` viaja SIEMPRE y rompe la resolución contra la BD sin migrar

- **Dónde:** `src/app/api/pos/checkout/route.ts` (`p_payment_components: d.payment_components?.length ? ... : null`) y `src/app/api/sync/batch/route.ts` (`op.payload.p_payment_components ?? null`).
- **Causa raíz:** la misión #1467 aplicó el patrón 2026-10-18 («enviar SIEMPRE ambas claves para desambiguar overloads») sin considerar que ese patrón EXIGE que la BD ya tenga la firma ampliada. En la ventana código-desplegado ↔ BD-sin-migrar, TODA llamada falla con PGRST202 (demostrado §1.1). El `?? null` del sync/batch además enviaba la clave para replays de payloads LEGADOS encolados.
- **Corrección:** clave condicional (spread solo cuando hay componentes). Las ventas sin desglose resuelven contra ambas firmas (legada 31 / nueva 32 con `DEFAULT NULL`); los cobros mixtos exigen la BD migrada (fail-closed correcto: sin ledger multimoneda es mejor rechazar que corromper) y el error PGRST202/203 se mapea a **503 `ERR_RPC_SCHEMA_MISMATCH`** accionable en lugar de un 500 opaco.

### D2 — La migración fusionada crea un SEGUNDO overload y no elimina el legado

- **Dónde:** `supabase/migrations/20261024150000` usa `CREATE OR REPLACE` con una lista de parámetros DISTINTA (añade `p_payment_components jsonb`): PostgreSQL **no reemplaza — crea un segundo overload** y el de 31 params sigue vivo.
- **Causa raíz:** omisión del paso de limpieza que el propio repo ya había necesitado el 2026-10-18 (incidente PGRST203 documentado en el código de checkout; la companion `20261018000001` borró entonces el overload legado).
- **Consecuencia si se aplica tal cual:** conviven DOS firmas → cualquier llamada de 31 claves (builds antiguos del PWA en campo, replays legados, integraciones) choca con **PGRST203 «Could not choose the best candidate»** y esas ventas fallan.
- **Corrección:** migración companion **`20261025120000_cp_money_002_postmerge_integrity.sql`** (generada con `scripts/gen_migration_cp_money_002.py` — patrón reproducible de la misión anterior): `DROP FUNCTION IF EXISTS` de la firma legada de 31 params (identidad EXACTA verificada contra `pg_proc`) + `CREATE OR REPLACE` de la firma de 32 params. **Idempotente y auto-suficiente en ambos estados de partida** (BD con 20261024150000 ya aplicada o sin aplicar): ambos caminos convergen en UNA sola firma de 32 params. Sin cambios de tablas, columnas, RLS ni datos. ACL de paridad (`authenticated` + `service_role`) + `NOTIFY pgrst 'reload schema'` (patrón del repo).

### D3 — §13.7 no rechazaba componentes DUPLICADOS

- **Dónde:** migración fusionada, §13.7 (validación) vs §17 (INSERT por componente).
- **Causa raíz:** §13.7 agrega los importes en pools correctamente, pero §17 itera el array CRUDO e inserta una fila por elemento con `idempotency_key = 'pay-<method>-<currency>-<tx>'`; dos elementos con el mismo par (method, currency) producen **filas del ledger con la MISMA clave** y la tabla no tiene `UNIQUE(idempotency_key)` (verificado: solo PK). Resultado: filas duplicadas en la fuente autoritativa del Reporte Entrega (regla 8 de la Fase B: «rechaza componentes duplicados»).
- **Corrección:** en la misma companion, §13.7 rechaza duplicados por (método, moneda) con `ERR_PAYMENT_COMPONENTS_INVALID` (mapeado a 422 accionable). El cliente legítimo ya agrupa (`buildPaymentComponents`), así que un payload con duplicados solo puede venir de un cliente no estándar: fail-closed.

### D4 — Contrato de degradación del helper de pagos incumplido (robustez del Reporte Entrega)

- **Dónde:** `src/lib/cash-report/fetch-sale-payments.ts`.
- **Causa raíz:** el contrato documentado («si la consulta falla, se devuelve un mapa vacío y el reporte usa la reconstrucción heurística previa») no estaba implementado: el helper LANZABA; `/api/cash-report` y `/api/cash-report/payment-totals` no capturaban → un fallo transitorio de la consulta del ledger tiraba el reporte COMPLETO (500), mientras `items-summary` sí degradaba. Tres comportamientos distintos para un mismo contrato.
- **Corrección:** la degradación vive ahora DENTRO del helper (catch → `console.warn` + mapa vacío): las tres rutas obtienen comportamiento uniforme y el reporte degradado sigue siendo correcto para ventas con filas por ítem (heurística usa `cash_paid`/`cash_currency`…) — nunca inventa importes.

### Defectos descartados con evidencia (no hay que «arreglarlos»)

- **Predominancia y atribución de unidades del Reporte Entrega** (Fase D): implementación de #1467 verificada por 36 tests previos + 11 tests nuevos de la tabla A–J; unidades atribuidas UNA sola vez (`qty_cup + qty_usd = total_quantity`), secundaria = componente monetario con CERO unidades, empate ±0.01 ⇒ CUP determinista, tasa PERSISTIDA por operación (nunca la global).
- **Pagos mixtos offline** (Fase H): no existen en el producto (la única cola offline es CUP-canónica). Documentado como limitación; no se inventa soporte.
- **Devoluciones de ventas mixtas** (Fase G): reversión a nivel transacción (modelo vigente); el ledger original queda intacto y el reporte excluye `status≠completed`. La devolución PROPORCIONAL por componentes sigue siendo **decisión de negocio pendiente** (documentada en #1467; no se impone aquí).

---

## 3. Tabla esperado vs obtenido (Fase C — tasa de prueba 1 USD = 1 000 CUP; producto 10 USD × 2 = 20 USD)

Cobertura automatizada: `src/__tests__/lib/cp-money-002-reference-cases.test.ts` (37 tests nuevos en total en 5 archivos).

| Caso | Componentes | Esperado (misión) | Obtenido (implementación fusionada + fixes) | Prueba |
|---|---|---|---|---|
| A | 20 USD | Pagada; predomina USD | ✓ USD, 2 uds al reporte USD, sin componente ficticio | `A.` |
| B | 20 000 CUP | Pagada; predomina CUP | ✓ CUP por verdad del ítem (venta legada por diseño) | `B.` |
| C | 5 USD + 15 000 CUP | Pagada; predomina CUP | ✓ CUP (5 000 < 15 000); 2 uds a CUP; USD refleja 5 con 0 uds | `C.` |
| D | 8 USD + 12 000 CUP | Pagada; predomina CUP | ✓ CUP (8 000 < 12 000) — sin forzar moneda | `D.` |
| E | 12 USD + 8 000 CUP | Pagada; predomina USD | ✓ USD (12 000 > 8 000); 2 uds a USD; CUP refleja 8 000 | `E.` |
| F | 10 USD + 10 000 CUP | Empate ⇒ política determinista | ✓ Empate ⇒ CUP (documentada), estable ante repetición | `F.` |
| G | 5 USD + 5 000 CUP | Pendiente 10 000 o rechazo, según política | ✓ Política vigente MISIÓN-FLEX: exigible íntegro (PT011) salvo incidencia DOCUMENTADA; clasificación solo por lo cobrado (10 000 ≠ 20 000 → `has_payment_incident`); nunca aparece liquidada | `G.` |
| H | 8 USD + 2 000 CUP | Pendiente 10 000 o rechazo | ✓ Ídem; del cobro predomina USD (8 000 > 2 000); incidencia marcada | `H.` |
| I | 25 USD | Exceso: solo con política de vuelto válida | ✓ Política vigente D6/F4: exige liquidación de vuelto (`ERR_OVERPAYMENT_UNREGISTERED_CHANGE` sin ella); el desglose no inventa componentes, el vuelto se cuadra por liquidación en caja | `I.` |
| J | 0 USD + 0 CUP | No marcarse pagada | ✓ Sin componentes no viaja la clave; el RPC exige Σ(amount_cup)=total±0.01 (`ERR_PAYMENT_INVARIANT_VIOLATED`) → rechazo | `J.` |

**Cuadre por caso C (5 USD + 15 000 CUP, tasa 1 000):** venta 1 fila en `transactions`; ledger: fila `cash USD 5 × 1000 = 5 000 CUP equivalentes` + fila `cash CUP 15 000`; pools derivados 20 000 CUP; PT011 ✓; Reporte Entrega: 2 uds en hoja CUP, 5 USD en hoja USD **sin** unidades; Σ cuadra con caja por moneda.

---

## 4. Validación SQL (Fase E)

- **Sintaxis:** migración companion validada con el parser oficial de PostgreSQL (libpg_query 17/18 vía `libpg-query-wasm`): `PARSE SQL OK` (DDL completo) y `PARSE PLPGSQL OK` (cuerpo plpgsql de 1 156 líneas del statement). Igual para la 20261024150000 de referencia.
- **Contenido crítico:** anclado por `src/__tests__/migrations/cp-money-002-companion-migration.test.ts` (DROP de la firma legada EXACTA sin `p_payment_components`, firma nueva única, GRANTs, `NOTIFY pgrst`, bloque D3 dentro de §13.7, param_hash con componentes, §17 por componente, PT011, SECURITY DEFINER/search_path/auth intactos).
- **Ejecución real en BD:** **PENDIENTE** — no se ejecutó ninguna migración contra producción (regla innegociable de la misión) y el sandbox no dispone de un Postgres/Supabase aislado con el esquema. Queda pendiente aplicar en un entorno de staging con la versión correcta del esquema y ejecutar el procedimiento funcional (§6) + pruebas de atomicidad/concurrencia SQL.

---

## 5. Pruebas automatizadas (Fase I) — resultados exactos

| Comando | Resultado |
|---|---|
| `tsc --noEmit` (NODE_OPTIONS heap ampliado) | **0 errores** (exit 0) |
| `eslint` (archivos tocados + nuevos) | **0 errores/0 warnings** en los 8 archivos |
| `vitest run` (suite completa) | **3698 pasados / 1 fallido / 49 omitidos** (37 48 totales) |
| Fallo único | `payments-route-payment-date.test.ts` «hoy al mediodía» — **PREEXISTENTE**: falla igual en `52ab401` (padre del merge); fija «hoy 12:00 UTC» y solo pasa si la suite corre después de las 12:00 UTC (el sandbox corre ~00:45 UTC; CI del PR #1467 corrió ~23:00 UTC). No relacionado con #1467 ni con dinero. **No se tocó** (fuera de alcance; fix sugerido al propietario: anclar el mediodía al día de negocio Habana o fijar el reloj con `vi.setSystemTime`) |
| `next build` | **Compilado de producción ✓ (69 s)** («✓ Compiled successfully»); la fase TypeScript embebida muere por OOM del sandbox (**4 GB RAM totales** — SIGKILL). CI ejecuta este build en máquinas con memoria suficiente (check Build del PR #1467 en verde). La cobertura equivalente (tsc + lint + suite) está verde aquí. |
| Tests nuevos | **37 en 5 archivos** — payload D1 (checkout + sync/batch), PGRST202/203→503, companion D2+D3, degradación D4, tabla A–J |

---

## 6. Procedimiento funcional reproducible (Fase J) — para staging tras aplicar las migraciones

1. Aplicar `20261024150000` + `20261025120000` en el mismo mantenimiento (la companion es auto-suficiente; aplicar ambas deja una sola firma de 32 params).
2. Verificar: `SELECT count(*) FROM pg_proc WHERE proname='create_sale_v2';` → **1**.
3. Vender 2 uds de Producto X (10 USD c/u) con cobro **5 USD + 15 000 CUP** (tasa 1 000) → venta liquidada, sin error.
4. Verificar `payment_transactions` de la venta: exactamente 2 filas `ref_type='sale'` (`cash USD 5` con `exchange_rate=1000`, `cash CUP 15000` con rate 1) y `idempotency_key` únicas `pay-cash-USD-<tx>` / `pay-cash-CUP-<tx>`.
5. Reporte Entrega del día: Producto X con **2 uds en la hoja CUP**; hoja USD con **5 USD y 0 uds**; `sales_classification` de la venta: `predominant='CUP'`, `usd_collected=5`, `usd_collected_cup=5000`, `rate=1000`, `source='ledger'`.
6. Repetir con **12 USD + 8 000 CUP** → clasificación **USD**, hoja CUP refleja solo 8 000 CUP con 0 uds.
7. Intentar **8 USD + 2 000 CUP** sin incidencias → rechazo `ERR_PAYMENT_MISMATCH` (política POS exige pago completo); con incidencia → venta creada CON `SALE_PAYMENT_INCIDENT` + nota, y el reporte la marca `has_payment_incident` (nunca liquidada por 20 000).
8. Enviar un payload con componente duplicado (`cash USD 5` dos veces) → `ERR_PAYMENT_COMPONENTS_INVALID: componentes duplicados` (422).
9. Cuadrar Reporte Entrega ↔ detalle de pagos ↔ caja por moneda (la degradación D4 permite verificar también el camino heurístico simulando un fallo del ledger).
10. Sin migraciones aplicadas: venta CUP pura desde un build con este PR debe **funcionar** (regresión D1 eliminada); cobro mixto debe dar 503 `ERR_RPC_SCHEMA_MISMATCH`.

---

## 7. Cambios del PR

| Archivo | Cambio |
|---|---|
| `src/app/api/pos/checkout/route.ts` | D1: clave `p_payment_components` condicional + mapeo PGRST202/203 → 503 `ERR_RPC_SCHEMA_MISMATCH` |
| `src/app/api/sync/batch/route.ts` | D1: clave condicional en el replay (solo si el payload encolado la trae) |
| `src/lib/cash-report/fetch-sale-payments.ts` | D4: degradación limpia según contrato (catch → warn + mapa vacío) |
| `supabase/migrations/20261025120000_cp_money_002_postmerge_integrity.sql` | D2+D3: DROP del overload legado + §13.7 anti-duplicados (generada por script, sintaxis validada) |
| `ci-gate-allowlist.json` | Baseline `source_of_truth_baseline` TEMPORAL para `create_sale_v2/31` (`LIVE_FUNCTION_NOT_REPRESENTED`) — drift INTENCIONAL mientras el propietario aplica las migraciones; se retira al regenerar el surface (mismo procedimiento que la REVISIÓN FINAL v2.24.1, commit 5920348). Expira 2027-01-31 |
| `src/__tests__/...` (5 archivos) | 37 pruebas: payload, errores, migración, degradación, tabla A–J |
| `docs/audits/CP_MONEY_002_...md` | Este documento |

**Cambios de esquema:** SOLO la companion (función `create_sale_v2`; sin tablas/columnas/RLS/datos). **Cero operaciones productivas durante la misión** (verificaciones por SELECT de lectura y sondas PGRST de no-ejecución únicamente).

## 8. Riesgos residuales y decisiones de negocio pendientes

- **Orden de despliegue:** aplicar AMBAS migraciones en la misma ventana ANTES de exponer el frontend de pagos mixtos. Con este PR, desplegar el frontend antes de migrar ya no rompe las ventas puras (regresión D1 eliminada); los cobros mixtos fallan cerrado con 503 accionable hasta migrar.
- **Retiro de la baseline y regeneración del surface** tras aplicar (precedente 5920348): regenerar `supabase/security-contract/contract-surface.sql` certificando `create_sale_v2/32` y retirar la entrada `source_of_truth_baseline` de `ci-gate-allowlist.json`.
- **Devolución proporcional por componentes** (ventas mixtas): pendiente de aprobación del propietario — modelo vigente intacto.
- **`schema_migrations` desactualizada** en producción: el mecanismo de aplicación de migraciones no registra versiones recientes; se recomienda reconciliar el tracking (tarea operativa aparte, fuera de alcance).
- **Test flaky preexistente** (`payments-route-payment-date`): fix sugerido, no aplicado aquí.
- **Validación SQL en staging** pendiente (§4) — el sandbox no dispone del esquema.

**Restricción final respetada:** PR abierto, NO fusionado. La decisión pertenece al propietario.
