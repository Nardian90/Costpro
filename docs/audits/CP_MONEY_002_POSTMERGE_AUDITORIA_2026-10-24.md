# CP-MONEY-002 — Auditoría posmerge de PR #1467: integridad contable y cierre de pagos mixtos USD/CUP

**Fecha:** 2026-10-24/25 · **Rama:** `fix/cp-money-002-postmerge-integrity` · **Base:** `main` @ `a082d54` (posmerge de #1467 + #1468 — integrada por merge; incl. fix del test flaky `8d0656e` y migración `20261024180000`)
**Alcance:** auditoría técnica-contable del código FUSIONADO + correcciones incrementales de defectos demostrados + pruebas. **Sin modificaciones productivas.**

> **ADENDA CIERRE (2026-10-24):** ver §9 — re-verificación productiva del día, hallazgo **D2-reforzado (42725)**, validación SQL **EJECUTADA** en BD aislada real (44/44), suite completa verde y procedimiento de despliegue corregido.

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
- **Ejecución SEMÁNTICA en BD aislada REAL (PostgreSQL 18 embedded, adenda 2026-10-24 — §9):** 44/44 pruebas verdes en fixture fiel (patrón `setup_cajamision` del propio repo): migraciones aplicadas como ficheros transaccionales, convergencia de firma única desde los TRES estados de partida, re-ejecución idempotente, matriz económica A–J completa a tasa 1000, batería D1 (resolución de ambos llamadores + fail-closed de null/vacío/malformados/monedas/zerо/negativos/límite 20), batería D3 (duplicados, replay, clave reutilizada, concurrencia, rollback intermedio), tenant/auth/tasas e integridad global del ledger. Evidencia: `pgiso/results/cp-money-002-sql-evidence.json` (resumen en §9.3). **La limitación previa «ejecución en staging PENDIENTE» queda cubierta en lo ejecutable sin producción;** lo pendiente queda reducido al smoke funcional en staging antes de autorizar producción (§6 paso 10).

---

## 5. Pruebas automatizadas (Fase I) — resultados exactos

| Comando | Resultado |
|---|---|
| `tsc --noEmit` (NODE_OPTIONS heap ampliado) | **0 errores** (exit 0) |
| `eslint` (archivos tocados + nuevos) | **0 errores/0 warnings** en los 8 archivos |
| `vitest run` (suite completa, tras integrar main — adenda §9.5) | **3723 pasados / 0 fallidos / 49 omitidos** (3772 totales). El único fallo anterior (flaky `payments-route-payment-date`) quedó resuelto al integrar `main` (`8d0656e`, PR #1468 — fix del propietario, NO atribuible a #1469) |
| Tests nuevos de la misión | **42 en 6 archivos** (37 previos + 5 de ruta D4 `cash-report-route-d4.test.ts` en la adenda §9.4) — payload D1 (checkout + sync/batch), PGRST202/203→503, companion D2+D3, degradación D4 (helper), tabla A–J y contrato de ruta del Reporte Entrega |
| `next build` | **Compilado de producción ✓ (68 s)** («✓ Compiled successfully»); la fase TypeScript embebida muere por OOM del sandbox (**4 GB RAM totales** — SIGKILL 137; reproducido también en la sesión previa). CI ejecuta este build en máquinas con memoria suficiente (check Build del PR #1467 en verde; la cobertura equivalente tsc+lint+suite está verde aquí) |

---

## 6. Procedimiento funcional reproducible (Fase J) — para staging tras aplicar las migraciones

1. **Orden de aplicación (CORREGIDO por el hallazgo 42725 — §9.2):** en producción aplicar directamente `20261025120000` (companion) — es auto-suficiente desde el estado actual (`/31` viva) y converge a UNA firma `/32`. Aplicar antes `20261024150000` en producción **ABORTA inofensivamente con 42725 y hace rollback completo** (su COMMENT ON FUNCTION final es ambiguo en cuanto coexisten dos firmas): no deja daño, pero no aporta nada. En despliegues VÍRGENES ambas aplican en orden (20261024150000 → companion) y convergen al MISMO cuerpo (md5 idéntico, evidencia S-08). Tras migrar, regenerar el surface certificando `create_sale_v2/32` y retirar la baseline temporal del allowlist.
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
| `src/__tests__/...` (6 archivos) | 42 pruebas: payload, errores, migración, degradación (helper + RUTA), tabla A–J |
| `docs/audits/CP_MONEY_002_...md` | Este documento |

**Cambios de esquema:** SOLO la companion (función `create_sale_v2`; sin tablas/columnas/RLS/datos). **Cero operaciones productivas durante la misión** (verificaciones por SELECT de lectura y sondas PGRST de no-ejecución únicamente).

## 8. Riesgos residuales y decisiones de negocio pendientes

- **Orden de despliegue (ACTUALIZADO §9.6):** en producción aplicar la companion `20261025120000` directamente (auto-suficiente); la `20261024150000` de #1467 ABORTA 42725 sobre la /31 viva (rollback inofensivo). Con este PR, desplegar el frontend antes de migrar ya no rompe las ventas puras; los cobros mixtos fallan cerrado con 503 accionable hasta migrar.
- **Retiro de la baseline y regeneración del surface** tras aplicar (precedente 5920348): regenerar `supabase/security-contract/contract-surface.sql` certificando `create_sale_v2/32` y retirar la entrada `source_of_truth_baseline` de `ci-gate-allowlist.json`.
- **Devolución proporcional por componentes** (ventas mixtas): pendiente de aprobación del propietario — modelo vigente intacto.
- **`schema_migrations` desactualizada** en producción: el mecanismo de aplicación de migraciones no registra versiones recientes; se recomienda reconciliar el tracking (tarea operativa aparte, fuera de alcance).
- ~~Test flaky preexistente~~ **RESUELTO:** el propietario lo corrigió en main (`8d0656e`, PR #1468) y esta rama lo heredó por merge — suite completa 3723 ✓ / 0 ✗.
- ~~Validación SQL en staging pendiente~~ **CUBIERTA en BD aislada** (§9.3); queda solo el smoke end-to-end en staging real (§9.6.4) para una futura ventana autorizada.
- **2 warnings MEDIUM/LOW preexistentes** en Capa C (`cancel_transfer/2→3`, `reset_store_data/2→3` — de main, no de este PR): vigilar frescura del surface en la próxima regeneración.

**Restricción final respetada:** PR abierto, NO fusionado. La decisión pertenece al propietario.

---

## 9. ADENDA DE CIERRE (2026-10-24, orden definitiva) — evidencia nueva

### 9.1 Re-verificación productiva del día (solo lectura, 2026-10-24T01:51:39Z)

| Elemento | Estado observado HOY | Método |
|---|---|---|
| Firma viva de `create_sale_v2` | **1 overload, 31 params, SIN `p_payment_components`** (body_md5 `e25a939d…`) | Management API `pg_get_function_identity_arguments` (SELECT) |
| Helpers de tasa (`%usd%rate%`) | **0** (la 20261024150000 sigue SIN aplicar) | SELECT `pg_proc` |
| `supabase_migrations.schema_migrations` | Última `20260615000003` — **tracking sigue obsoleto** (no inferir estado por él) | SELECT |
| Sonda PGRST con `p_payment_components` (array o null) | **404 PGRST202** — el incidente de disponibilidad P0 SIGUE VIVO en producción | POST no-ejecutable a `/rest/v1/rpc/create_sale_v2` |
| Sonda con solo claves legadas (anon) | **401 42501 permission denied** — la firma legada SÍ resuelve (el fallo es de permisos, PREVIO a cualquier ejecución; cero escrituras) | ídem |

**Conclusión:** producción sigue exactamente en el estado que motivó D1/D2: el código fusionado de #1467 no puede crear NINGUNA venta contra la BD sin migrar. El fix de #1469 (spread condicional) sigue siendo la corrección correcta para las ventas puras en el estado actual, y la companion es el camino de migración.

### 9.2 D2 REFORZADO — la migración 20261024150000 ni siquiera era aplicable a producción (42725)

Aplicada sobre una BD con la firma `/31` viva (réplica exacta del estado productivo, PostgreSQL 18 aislado), la migración de #1467 **aborta con `42725: function name "public.create_sale_v2" is not unique`** y hace **rollback completo** (evidencia S-06). Causa: su `COMMENT ON FUNCTION public.create_sale_v2 IS …` final no califica la lista de argumentos; en cuanto el `CREATE OR REPLACE` crea el segundo overload, el comentario es ambiguo. Consecuencias:

- **Runner transaccional** (supabase db push / migration up): rollback íntegro → la BD queda sin migrar (coherente con lo observado en producción hoy).
- **Runner no transaccional** (statement a statement): quedarían DOS overloads vivos → PGRST203 «Could not choose the best candidate» para llamadas legadas de 31 claves (el incidente del 2026-10-18 que el propio repo ya sufrió).
- En **esquemas vírgenes** (sin `/31` previa) sí aplica limpia (evidencia S-08) — por eso CI no lo detectó: el contrato de migraciones del CI valida sobre el stream, no contra el estado vivo.

**La companion 20261025120000 es el único camino de migración coherente para producción** (auto-suficiente desde `/31`), y también corrige el par en despliegues vírgenes (convergen al MISMO cuerpo, md5 idéntico). El cuerpo `/32` de la companion hereda el de #1467 íntegro (diff de UN solo bloque: el anti-duplicados D3) e incluye la lógica D6 de vuelto de la caja v2.24.x (22 marcadores de liquidación verificados).

### 9.3 Validación SQL semántica EJECUTADA — 44/44 en BD aislada real (PostgreSQL 18)

Harness reproducible (`pgiso/harness.mjs` + fixture fiel al patrón `setup_cajamision` del repo): migraciones aplicadas como ficheros transaccionales, sobre `pgdata` efímero local (JAMÁS producción). Resultado: **44 PASS / 0 FAIL**.

| Grupo | Pruebas (todas verdes) |
|---|---|
| Secuencias D2 (S-01..S-08) | base v2.24.x = 1 overload /31; intento 20261024150000 sobre /31 → 42725 + rollback íntegro; 20261024180000 aplica y no toca overloads; companion → firma única /32; re-ejecución companion idempotente (mismo md5); companion directa desde /31 → /32; convergencia idéntica A/B (md5 `e931f9d8…`); par completo en esquema virgen → mismo /32 |
| D1 (12) | llamada legada de 31 claves resuelve y persiste; venta USD sin componentes (ledger CUP-canónico legado); `p_payment_components := NULL` (SQL NULL, semántica PostgREST) = omitir la clave; array vacío → rechazo fail-closed ANTES de persistir; malformados; moneda EUR; importe 0; importe negativo; zelle en CUP; >20 componentes (cardinalidad precede a duplicados); payload corrupto → error controlado, cero filas |
| Matriz A–J | A 5+15000 ✓ (ledger `cash USD 5 @1000` + `cash CUP 15000 @1`, Σ=20000, ítem qty 2 con tasa persistida, stock exacto); B CUP pura legada ✓; C 8+12000 ✓; D 12+8000 ✓; E 10+10000 (empate) ✓ ambas componentes intactas; F 5+5000 sin incidencia → `ERR_PAYMENT_MISMATCH` + cero filas; G 8+2000 → ídem; G2 con incidencia documentada → venta creada con `SALE_PAYMENT_INCIDENT` + nota, Σ=10000 (política MISIÓN-FLEX vigente, jamás liquidada por 20000); H sobrepago sin liquidación vía mixed → `ERR_PAYMENT_MISMATCH` (guard §14) y vía método único → `ERR_OVERPAYMENT_UNREGISTERED_CHANGE` (guard F4 §14.9) — AMBOS fail-closed, cero filas, nunca éxito falso; H2 con liquidación D6 (recibidos 25 USD, vuelto 5000 CUP) → venta liquidada por 20 USD, **el vuelto NO es ingreso** (ledger neto 20000; liquidación persistida); I replay misma clave+payload → `status=idempotent`, MISMA tx, cero duplicados; J fallo intermedio (stock insuficiente en 2º ítem tras procesar el 1º) → rollback COMPLETO (0 ventas/ítems/ledger/registry, stock intacto) |
| D3 (5) | duplicados (método,moneda) rechazados ANTES de todo INSERT (§13.7 precede §15); misma clave + payload distinto → conflicto limpio `ERR_IDEMPOTENCY_KEY_REUSE`; replay en forma legada de una venta mixta → conflicto limpio; **concurrencia** (2 conexiones paralelas, misma clave) → EXACTAMENTE 1 venta persistida, misma tx para ambas (advisory lock por tienda + registro de idempotencia) |
| Tenant/auth/tasas (4) | anónimo → `ERR_UNAUTHORIZED` temprano; seller ≠ actor → `ERR_SELLER_MISMATCH`; usuario sin membresía en la tienda → `ERR_UNAUTHORIZED` (aislamiento); tasa USD stale (46 días) → `ERR_RATE_STALE` fail-closed (sin salto silencioso de fuente, sin sustitución por tasa del cliente) |
| Integridad global (3) | ledger sin duplicados por (venta,método,moneda), todas las filas con `idempotency_key` ÚNICA; PT011 global (Σ `amount_cup` = total ±0.01 en todas las completas); existencias = 100 − Σcantidades vendidas |

### 9.4 D4 blindado a nivel de RUTA — 5 tests nuevos (`cash-report-route-d4.test.ts`)

El defecto D4 original era de ruta (helper lanzaba; `cash-report` no capturaba → 500). Drive del handler REAL con mock que APLICA los filtros de PostgREST (patrón `cash-ledger-route.test.ts` de la misión caja):

1. Ledger disponible → grupos por moneda REAL con tasa persistida (`cash|USD 5` total_cup 5000; `sales_split.USD.cash` = 5 nativo — la hoja USD refleja su cobro real).
2. Fallo de lectura del ledger → **200 con degradación a heurística, NUNCA 500** (el defecto blindado).
3. Ledger vacío → 200 con heurística, sin importes inventados.
4. Venta REVERTIDA excluida: la ruta filtra `status=completed` (verificado conductualmente — su importe jamás aparece) y su ausencia no produce grupos fantasma.
5. Datos parciales: solo la venta completada produce grupos, con recuento exacto.

### 9.5 Integración de main (a082d54) y estado final de la rama

- `origin/main` (PR #1468: caja auditoría + fix flaky `8d0656e` + `20261024180000` + surface re-certificado) integrado por merge: sin conflictos; la entrada `source_of_truth_baseline` de `create_sale_v2/31` se conserva (la de `create_cash_flow_document/13` fue retirada por main al caducar su razón de ser — comportamiento correcto del mecanismo).
- **Contrato de seguridad ejecutado LOCALMENTE contra producción (solo lectura):** Capa A/B 150/150, 0 violaciones; **Capa C (REM-INV-6): 149/150 representadas, 0 divergencias bloqueantes** — la única no-representada es `create_sale_v2/31`, cubierta por la baseline TEMPORAL documentada (se retira al aplicar las migraciones y regenerar el surface). 2 warnings MEDIUM/LOW preexistentes de main (`cancel_transfer/2→3`, `reset_store_data/2→3`), no atribuibles a #1469.
- Suite completa: **3723 ✓ / 0 ✗** (el flaky de fechas quedó determinista por el fix del propietario, heredado del merge). tsc 0 errores; eslint 0/0; build compila ✓ (fase TS embebida OOM del sandbox de 4 GB, CI la valida en verde).

### 9.6 Procedimiento de aplicación a producción (PREPARADO, NO EJECUTADO — ventana autorizada del propietario)

1. **Precondiciones:** ventana de mantenimiento; backup/restore point de la BD; verificar `SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='create_sale_v2';` = **1** (firma /31) y ausencia de helpers de tasa (estado verificado hoy).
2. **Aplicar SOLO `supabase/migrations/20261025120000_cp_money_002_postmerge_integrity.sql`** (transaccional). NO aplicar antes `20261024150000`: aborta 42725 sobre la /31 viva (inofensivo pero inútil). Post-apply: `NOTIFY pgrst 'reload schema'` ya incluido en la companion; verificar recarga de caché de PostgREST.
3. **Verificación de firma:** re-ejecutar el SELECT del paso 1 → **1** overload con `p_payment_components jsonb` al final de `pg_get_function_identity_arguments`; ACL `authenticated`+`service_role` presentes (`\df+ create_sale_v2` o `information_schema.routine_privileges`); `SECURITY DEFINER` y `search_path` intactos (`pg_get_functiondef`).
4. **Smoke funcional (staging→prod):** pasos 2–10 del §6 (venta CUP pura legada; venta mixta 5 USD + 15 000 CUP con verificación de ledger por componente; Reporte Entrega CUP 2 uds + hoja USD 5/0 uds; 12 USD + 8 000 CUP → USD predominante; 8 USD + 2 000 CUP sin incidencia rechazado; duplicado rechazado; cuadre por moneda con caja).
5. **Regenerar el surface** (`scripts/export-contract-surface.cjs`) certificando `create_sale_v2/32` y **retirar la entrada `source_of_truth_baseline` de `ci-gate-allowlist.json`** (mismo procedimiento del precedente 5920348 y del retiro de `create_cash_flow_document/13` por el propio propietario en f53ab60).
6. **Desplegar el frontend** (con el PR #1469 fusionado) — con este PR el orden es indiferente para ventas puras; los cobros mixtos exigen BD migrada (503 accionable hasta entonces).
7. **Reversión:** la companion es reversible restaurando el backup de la ventana, o versionando una migración inversa (`DROP` de /32 + `CREATE` de /31 desde el historial del repo) — no se incluye por defecto (política forward-only del repo); documentar si se requiere.

### 9.7 Evidencia que NO pudo obtenerse (y por qué)

- **Ejecución de las migraciones contra staging REAL:** no existe entorno de staging accesible con el esquema productivo; la validación semántica se completó en BD aislada local (PostgreSQL 18 real, fixture fiel — §9.3), que cubre sintaxis + semántica + atomicidad. Lo pendiente queda reducido al smoke funcional end-to-end contra la BD de staging (§9.6.4), que requiere ventana autorizada.
- **Build completo local:** la fase TypeScript embebida de `next build` excede la RAM del sandbox (4 GB, SIGKILL 137). Compilación de producción ✓ (68 s); CI la valida en verde en runners con memoria suficiente.
- **Confirmación del runner de migraciones usado en producción:** `schema_migrations` está desactualizado (última 2026-06-15) y el mecanismo real de aplicación no está documentado en el repo; los DOS posibles comportamientos ante 20261024150000 (rollback transaccional vs overloads parciales) están cubiertos por la companion (demostrado §9.2), por lo que ninguna ambigüedad afecta el procedimiento §9.6.

---

## 10. ADENDA D5-ACL (2026-10-24, orden definitiva posmerge #1469 — fusión verificada dd5aedc9)

PR #1469 fue **fusionado** por el propietario el **2026-10-24T02:23:29Z** (merge commit `dd5aedc9`, head `0a8f7be`, 4 commits, 8 checks CI verde, E2E skipped por política). Producción re-verificada en SOLO LECTURA a las **02:32:49Z**: firma viva **/31** (md5 `e25a939d`), **0** helpers de tasa, sonda con `p_payment_components` → **PGRST202 persiste**, `schema_migrations` obsoleta → **la companion sigue SIN aplicar**. Con el código fusionado, las ventas puras resuelven (spread condicional) y los cobros mixtos fallan cerrado con 503 accionable hasta la ventana.

### 10.1 Hallazgo D5-ACL (nuevo, empírico, PostgreSQL 18 aislado con réplica del default ACL de prod)

La companion hace `DROP` de la /31 y `CREATE` de la /32 como función **NUEVA**. En Supabase, los entries de `pg_default_acl` se aplican como **delta sobre `acldefault('f')`** (`{=X/PUBLIC, owner=X}`) — verificado empíricamente: una función nueva de `postgres` en `public` hereda **PUBLIC y anon** además de los grants del entry `{postgres, anon, authenticated, service_role}` (probado: `has_function_privilege('pg_monitor', …, 'EXECUTE') = true`). La /31 viva NO tiene anon porque fue **endurecida a nivel de objeto** (REVOKE PUBLIC/anon: `20260807000003` v2.16.3, `20260810000070` pr4_4e, `20260927000001` «vector #6 de resurrección», `20261004130000` §17.2 H0R). La companion y la 20261024150000 **no** reproducen ese REVOKE → tras aplicarlas, la /32 quedaría con `{=X, postgres, anon, authenticated, service_role}`:

1. **Regresión de superficie ejecutable** respecto a la /31 endurecida (el guard interno `ERR_UNAUTHORIZED` mitiga, pero la exposición RPC a anónimos revive).
2. **El check EN VIVO `secdef_public_grant`** (ci-gate-sql-checks.js, allowlist VACÍA, tolerancia cero) pondría **SQL DB Security Checks en ROJO** en el primer run de CI posterior a la ventana.

### 10.2 Corrección preparada (PR correctivo, NO fusionado)

`supabase/migrations/20261025130000_cp_money_002_acl_revoke_anon.sql` (sha256 `93911010…`): `REVOKE EXECUTE … FROM PUBLIC` + `REVOKE EXECUTE … FROM anon` sobre la identidad EXACTA de 32 params + `NOTIFY pgrst, 'reload schema'`. Idempotente, forward-only, aplicable desde CUALQUIER estado post-companion. Validado en BD aislada (31/31 + 6/6): ACL final `{authenticated, postgres, service_role}` — paridad EXACTA con la /31 endurecida; authenticated/service_role conservan EXECUTE; re-ejecución sin deriva.

### 10.3 Procedimiento §9.6 ACTUALIZADO (orden de la ventana)

El paso 2 pasa a ser: **apregar `20261025120000_cp_money_002_postmerge_integrity.sql` y A CONTINUACIÓN, en la misma ventana, `20261025130000_cp_money_002_acl_revoke_anon.sql`** (checksums `c75a31fb…` y `93911010…`; ambos transaccionales por fichero; el segundo no hace nada si se repite). La verificación del paso 3 añade: `has_function_privilege('anon','public.create_sale_v2(<32 args>)','EXECUTE')` = **false** y proacl SIN `=X`. Si entre ambos files corriera un CI, `secdef_public_grant` fallaría por diseño (red de seguridad) — aplicarlos consecutivos lo evita. El resto de §9.6 (verificación de firma única, surface regenerado certificando /32 y RETIRADA de la entrada `source_of_truth_baseline` de `ci-gate-allowlist.json`, smoke, reversión) permanece sin cambios.

### 10.4 Fase C — auditoría de la companion desde los 5 estados iniciales (PostgreSQL 18 aislado, 31/31 PASS)

| Estado inicial | Resultado |
|---|---|
| 1. Solo /31 (prod-like endurecida) | companion converge a /32 única (md5 ref); llamada legada resuelve; fix aplicable |
| 2. Solo /32 (ya migrada) | 2ª ejecución de la companion sin error ni deriva (CREATE OR REPLACE con identidad idéntica preserva ACL); fix doble idempotente |
| 3. AMBAS sobrecargas (p1467 statement-a-statement: CREATE+GRANTs persisten, su COMMENT final aborta 42725 — runner no transaccional) | companion retira SOLO la /31 (identidad EXACTA) y converge; su COMMENT sin lista de args NO es ambiguo porque el DROP precede |
| 4. /31 con comment custom / ACL extra / dependencias | (a) wrapper plpgsql NO bloquea el DROP y sigue resolviendo por DEFAULT NULL; (b) una VIEW con dependencia DURA aborta la companion SIN MUTAR NADA (fail-safe transaccional; prod tiene 0 dependencias duras — pg_depend verificado 02:35:55Z); (c) grantee extra de /31 NO se traslada (prod no tiene grantees extra: pro ACL = {postgres, authenticated, service_role}); (d) COMMENT reemplazado por el de la companion sin ambigüedad |
| 5. Companion interrumpida parcialmente (runner no transaccional) | (a) tras el DROP (cero firmas): re-ejecutar converge; (b) tras el CREATE (sin GRANT/COMMENT/NOTIFY): re-ejecutar converge y COMPLETA ACL+comment+NOTIFY |

Condiciones de la misión verificadas: firma final única (PGRST203 estructuralmente imposible), sin pérdida de permisos necesarios (paridad restaurada por el fix), SECURITY DEFINER + `search_path` + autorización intactos, aislamiento por tienda/RLS intactos (T-01..T-04), transaccionalidad demostrada (estado 4b), segunda ejecución inocua (E2), orden de migraciones correcto (secuencias A/B/C previas + estados), referencias gestionadas explícitamente (los 4 helpers externos existen en prod).

### 10.5 Fase F — integridad de reportes/ledger/inventario (6/6 PASS, PostgreSQL 18 aislado)

Venta mixta A (5 USD + 15 000 CUP, tasa 1000) creada por la /32: ledger de 2 filas por componente con tasa PERSISTIDA (5000 + 15000 = 20 000 ✓ PT011), `cost_at_sale` = coste medio del producto (4) intacto, UN solo movimiento de inventario (−2), `cost_average` sin tocar. **Reversión por el modelo VIGENTE** (reverse_transaction_v2 real del repo): status `voided`, existencias restauradas 98→100 con un único `sale_reverse` (+2), sin duplicación de cobros en el ledger, doble reversión → `idempotent` sin segundo incremento. El Reporte Entrega excluye la venta voided por el filtro `status='completed'` (contrato verificado a nivel de ruta en `cash-report-route-d4.test.ts`). La devolución PROPORCIONAL por componentes sigue PENDIENTE de decisión de negocio — no se inventó política.
