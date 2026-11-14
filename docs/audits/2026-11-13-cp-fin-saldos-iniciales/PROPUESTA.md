# PROPUESTA — SALDOS INICIALES POR TIENDA (CP-FIN, apertura financiera)

**Fecha:** 2026-11-13 · **Estado:** PROPUESTA — **ningún saldo registrado, ningún valor estimado introducido**
**Autorización:** frente 2 de la instrucción del propietario (2026-11-13): *«No introduzcas saldos iniciales ni valores estimados. Primero prepara una propuesta… Quiero revisar y aprobar los importes y el procedimiento antes de registrar cualquier saldo inicial.»*
**Base técnica:** motor CP-FIN aplicado en producción (m014-m016): tabla `fin_opening_balances` + RPC `fin_apply_opening_balance` (expediente `docs/audits/2026-11-13-cp-fin-partida-doble/`).

---

## 0. Marco general

- Cada tienda abre su contabilidad en una **fecha de corte (`as_of_date`)**: el saldo inicial representa la posición financiera la noche anterior; desde esa fecha, CP-FIN contabiliza automáticamente cada documento nuevo (triggers `fin_*`).
- El mecanismo del motor es **una fila por (tienda, categoría, moneda, fecha) en `fin_opening_balances`** (estado `draft`); al aprobarse, `fin_apply_opening_balance` genera el **asiento de apertura** (`APERTURA_FIN`, evento `apertura`) y marca la fila `applied` (idempotente: no permite re-aplicar; índice único impide duplicar el mismo saldo).
- Regla de diseño del motor (documentada en la migración base): **«Nunca se usa un ajuste patrimonial ficticio para cuadrar»** — si la ecuación contable no cuadra con datos reales, se revisan los datos, no se inventa la diferencia.

## 1. Qué saldos iniciales necesita cada tienda

Criterio: registrar lo que el negocio real de cada tienda tiene y que **no nace de un documento operativo** contabilizable por CP-FIN (todo lo demás lo generará el backfill histórico ya autorizado en dry-run).

Con base en las 7 tiendas reales de producción (identificadas read-only) y los módulos operativos del repo:

| Categoría (`fin_categories`) | Clase | ¿Cuándo se necesita? | Fuente de verdad |
|---|---|---|---|
| `ACT_EFECTIVO_CUP` | Activo | Siempre (fondo de caja) | Arqueo físico de caja a la fecha de corte |
| `ACT_EFECTIVO_USD` | Activo | Tiendas con caja en USD (p. ej. ENERVIDA-VITALLCONS: 132 ventas USD en el histórico) | Arqueo físico de billetes USD |
| `ACT_BANCOS` | Activo | Si hay saldos bancarios/Zelle | Extracto bancario a la fecha de corte |
| `ACT_INVENTARIO` | Activo | **NO requiere saldo inicial** si se ejecuta el backfill: el costo WAC de cada recepción histórica ya construye el inventario contable. Solo si el corte es anterior al primer documento del histórico y quedara stock heredado. | Conteo físico + WAC |
| `ACT_CXC` | Activo | Ventas a crédito pendientes (la regla semilla de VENTA no genera CxC por defecto — solo si el negocio real opera a crédito) | Libro de ventas a crédito |
| `PAS_CXP_PROV` / `PAS_SERV_PEND` | Pasivo | Deuda con proveedores por documentos ANTERIORES al corte (si el corte coincide con el inicio del histórico y este se backfillea, estas obligaciones ya nacen del backfill — no duplicar, ver §5) | Facturas de proveedor pendientes |
| `PAS_NOMINA_PEND` / `PAS_RETENCIONES` / `PAS_OBL_SOCIAL` | Pasivo | Si hay nómina devengada no pagada al corte | Nómina devengada (SC-4-06) |
| `PAS_ANTICIPOS_CLI` | Pasivo | Créditos de tienda a favor de clientes | Reporte de store credit |
| `ACT_FIJO`, `ACT_OTROS_*`, `PAS_OTRAS`, `PAS_LARGO_PLAZO` | — | Si la tienda tiene activos fijos u otras deudas (no hay módulo de activos fijos en COSTPRO: requiere decisión contable del propietario) | Escrituras/facturas |
| `PAT_CAPITAL` (o `PAT_APORTES`/`PAT_UTILIDADES_*`) | Patrimonio | Siempre: es la contrapartida que equilibra la apertura | **Derivado**, no fuente: `Patrimonio = Activos − Pasivos` |

**Por tienda (propuesta de alcance, sujeto a la información que aporte el propietario):**

| Tienda | Saldos propuestos (mínimo) | Nota |
|---|---|---|
| ENERVIDA-VITALLCONS | Efectivo CUP + Efectivo USD + Bancos + CxC (si hay) + CxP (pre-histórico, si hay) + Patrimonio | Mayor volumen (1.047 docs elegibles); caja bimoneda real |
| COSTPRO (Prueba) | (Decidir si abrir contabilidad: tienda de QA — recomendación: **excluirla** de apertura y de backfill) | 218 docs de prueba |
| PUERTO PADRE | Efectivo CUP + CxP (si hay) + Patrimonio | 77 docs elegibles |
| FERROCARRIL VITALLCONS, SHADDAI | Efectivo CUP + Patrimonio | Sin docs elegibles; apertura simple si se quiere contabilidad |
| QA UI Icons Store, QA-Release-1593-Plantillas | (Excluirlas: QA) | Sin docs |

## 2. Información y documentos fuente requeridos para determinar los importes

Por cada fila de saldo (con formato de recogida propuesto en el Anexo A):

1. **Efectivo:** arqueo físico firmado a la fecha de corte (billetes por denominación — mismo formato que el módulo de caja), desglosado por moneda.
2. **Bancos:** extracto o captura del saldo a la fecha de corte, por cuenta/medio (banco CUP, transferencias, Zelle).
3. **CxC:** listado de ventas a crédito pendientes de cobro con cliente, fecha y saldo.
4. **CxP/Servicios pendientes:** facturas de proveedores pendientes con fecha, número y saldo pendiente (solo las ANTERIORES al primer documento que entrará por backfill — ver §5).
5. **Nómina devengada:** nómina del período inmediato anterior al corte si quedara neto pendiente de pago.
6. **Créditos de tienda:** reporte de store credit por cliente.
7. **Patrimonio:** no se recoge — se **deriva** (§4) — salvo aportes documentados, que van en `PAT_APORTES`.
8. **Tasas de cambio oficiales** por fecha para montos en divisa (fuente autorizada por el propietario, p. ej. la tasa registrada en `store_exchange_rates` del día del corte).

Formato de recogida (plantilla): una fila por `tienda | categoría | moneda | importe | tasa | as_of | evidencia (archivo/referencia) | autorizado_por`. Sin tasa implícita: el USD exige su tasa documentada del día del corte.

## 3. Cómo se registrarán activos, pasivos y patrimonio iniciales

1. **Ingreso en `fin_opening_balances`** (estado `draft`): una fila por tienda+categoría+moneda+fecha, con `amount` en la moneda indicada, `exchange_rate` documentada y `amount_cup` calculado (`amount × tasa`; CUP tasa 1). El UNIQUE de la tabla impide duplicados (tienda, categoría, moneda, fecha) mientras no esté voided.
2. **Aprobación y generación:** el admin de la tienda ejecuta `fin_apply_opening_balance(id)` por fila → crea el asiento `APERTURA_FIN` con un movimiento por fila: **activo/gasto → débito; pasivo/patrimonio → crédito** (el sentido lo decide el RPC por la clase de la categoría — no es entrada del usuario), `currency_origin` preservada, `traza: {origen: saldo_inicial}`. La fila pasa a `applied` con `entry_id` enlazado y `authorized_by`; queda en `audit_logs` (`FIN_OPENING_APPLIED`) con categoría, importe CUP y fecha.
3. **Orden:** primero activos y pasivos con importes REALES; el patrimonio se calcula y se registra al final como fila(s) `PAT_CAPITAL` (o `PAT_APORTES` si el propietario prefiere nominal). Aplicación por tienda en una sola sesión, con las filas preparadas de antemano.
4. **Cero escrituras hasta aprobación expresa:** esta propuesta no crea ninguna fila `draft` todavía; el paso 1 se ejecuta solo con la lista de importes aprobada por el propietario.

## 4. Cómo se manejarán las distintas monedas

- `fin_opening_balances.currency ∈ {CUP, USD, EUR, MLC}` con `exchange_rate > 0` obligatoria: cada fila de divisa lleva SU tasa documentada de la fecha de corte (misma fuente que `store_exchange_rates`); la UI/RPC calcula `amount_cup`.
- El asiento de apertura genera un movimiento por fila: `amount` en la moneda original, `currency`/`currency_origin` preservadas y aritmética CUP (`amount_cup`) para la ecuación contable. **Sin conversiones implícitas**: no se suman CUP con USD; el equilibrio se verifica en CUP-equivalente con las tasas documentadas (idéntico a como opera el resto del motor, p. ej. caso H de la auditoría).
- Efectivo CUP y USD van en filas separadas (`ACT_EFECTIVO_CUP` / `ACT_EFECTIVO_USD`): el saldo de caja bimoneda queda trazable por moneda, y los reportes de caja por billete siguen cuadrando.
- Si la tienda opera en MLC/EUR, mismo mecanismo (categorías de efectivo podrían requerir creación ad-hoc — decisión del propietario; hoy el catálogo tiene CUP/USD).

## 5. Verificación de que los saldos de apertura quedan equilibrados

Tres niveles, todos automatizables y re-ejecutables:

1. **Pre-aplicación (por tienda, en la propuesta aprobada):** Σ`amount_cup` de filas de activo − Σ`amount_cup` de filas de pasivo = `PAT_CAPITAL` propuesto (ecuación contable). Si no cuadra con centavos, se devuelven las cifras a revisión (nunca ajuste patrimonial ficticio). El mismo cálculo se re-ejecuta como SELECT sobre las filas `draft` antes de aplicar (script de verificación incluido en la propuesta de ejecución).
2. **Post-aplicación (sobre datos reales):** sobre `fin_movements` de los asientos `APERTURA_FIN` de la tienda: Σdébitos CUP-equiv = Σcréditos CUP-equiv (partida doble del bloque de apertura). Consulta única, re-ejecutable.
3. **Integración:** informe de balance de la tienda (`fin_trial_balance`/`fin_balance_sheet` del motor) a la fecha de corte: Activos = Pasivos + Patrimonio; y saneo de que ninguna categoría de apertura quedó en 0 sin explicación.

La segunda pasada es imposible de duplicar: `fin_apply_opening_balance` rechaza filas que no están en `draft`, y el índice único bloquea re-registrar el mismo (tienda, categoría, moneda, fecha).

## 6. Cómo se garantizará que no dupliquen operaciones que entren por el backfill

Es el punto crítico de interacción F1↔F2; cuatro medidas:

1. **Fecha de corte única por tienda (`as_of_date`):** la apertura se fecha la noche anterior al primer documento que el backfill contabilizará. Ejemplo: si ENERVIDA-VITALLCONS abre su contabilidad al backfill desde 2026-05-01, la apertura se fecha 2026-04-30 y el corte de CxP es «facturas pendientes al 30-abr» — las recepciones posteriores nacen del backfill, sin duplicar.
2. **Regla de no solapamiento por categoría:** si una categoría va a reconstruirse completa por el backfill (inventario desde recepciones históricas, CxP de recepciones del período backfilled, servicios pendientes del período), esa categoría **NO lleva fila de apertura** (evita el doble cómputo). La tabla de §1 ya lo marca para `ACT_INVENTARIO` y los pasivos de proveedores del período backfilledo. Solo entran en apertura los saldos de documentos ANTERIORES al corte o ajenos al histórico del sistema.
3. **Verificación automática post-backfill (re-ejecutable):** por tienda y categoría, comprobar que el saldo de apertura + Σ backfill no produce saldos absurdos (p. ej. CxP negativa, efectivo negativo): consulta sobre `fin_movements` agrupada por categoría — cualquier negativo dispara revisión manual, no ajuste automático.
4. **Orden operativo propuesto:** (a) aprobar importes de apertura; (b) aplicar aperturas por tienda; (c) ejecutar el backfill real por tienda y rango (ya validado en dry-run: 1.342 docs elegibles, idempotente); (d) verificación de balance integrado (apertura + backfill). Con ese orden, cada evento económico queda contabilizado exactamente una vez: el corte separa los mundos.

## 7. Decisión pendiente (bloqueos para el propietario)

1. Aprobar/importar los **importes** por tienda (plantilla Anexo A) — sin ellos no se crea ninguna fila.
2. Confirmar **exclusión de las 3 tiendas de QA** de apertura y backfill.
3. Confirmar la **fecha de corte** por tienda (por defecto: día anterior al primer documento elegible del dry-run por tienda — COSTPRO (Prueba) 2026-05, ENERVIDA 2026-05/07 según tienda, PUERTO PADRE 2026-10).
4. Decidir si se registran **activos fijos** (sin módulo: requieren categoría y política de depreciación) o se difieren.
5. Autorizar la creación de las filas `draft` con los importes aprobados (paso §3.1) — ejecutada solo tras esta aprobación.

---

### Anexo A — Plantilla de recogida de saldos (por fila)

| Campo | Ejemplo | Origen |
|---|---|---|
| tienda | ENERVIDA-VITALLCONS | — |
| categoría | ACT_EFECTIVO_USD | §1 |
| moneda | USD | — |
| importe | 1.200,00 | Arqueo firmado |
| tasa | 400,00 | Tasa autorizada del día del corte |
| as_of | 2026-04-30 | Fecha de corte |
| evidencia | arqueo_20260430.pdf | Archivo del propietario |
| autorizado_por | (perfil admin) | — |

*(Plantilla vacía, sin valores: los importes los aporta el propietario o sus fuentes; esta propuesta no introduce ningún importe estimado.)*
