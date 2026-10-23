# MISIÓN CRÍTICA — Auditoría, corrección y certificación integral del módulo Ingresos/Egresos de caja

**COSTPRO 4 MULTITIENDA · Incidencia de producción ENERVIDA-VITALLCONS · 2026-10-24**

Rama: `fix/caja-ingresos-egresos-auditoria-20261024` · Estado: **APTO PARA REVISIÓN** (sin merge ni despliegue — decisión del propietario).

---

## 1. Resumen ejecutivo

| # | Defecto | Severidad | Corrección | Estado |
|---|---------|-----------|------------|--------|
| 1 | `GET /api/cash-flow/ledger` seleccionaba `amount` y `notes` en `commission_payments` — columnas que **no existen** en producción ni en ninguna migración → PSQL 42703 → 500 → «No se pudo cargar el libro de caja» en ENERVIDA-VITALLCONS | **Crítico (producción rota)** | Select corregido a columnas reales (`final_amount`, `payment_reference`, `manual_adjustment_reason`) + clasificación nativa alineada al espejo RPC | **CORREGIDO Y VERIFICADO E2E** |
| 2 | Hash de idempotencia de `create_cash_flow_document` no determinista: `COALESCE(p_operation_date, 'now')::text` incrusta el instante actual cuando el cliente no envía fecha (convención de la casa) → **todo reintento de red** con misma clave+payload era rechazado con `ERR_IDEMPOTENCY_KEY_REUSE` (409) | **Alto (rompe la protección anti-duplicado del camino por defecto)** | Migración `20261024180000` — patrón determinista `COALESCE(p_operation_date::text, '')` (paridad con `create_devolution_v2`) | **MIGRACIÓN PREPARADA (no aplicada a producción) + verificada en BD aislada** |
| 3 | Bloque «Movimientos que explican el saldo» presentado como acordeón | UX (requisito de la misión) | Sistema de pestañas reales (ARIA + teclado + paneles montados que conservan estado) | **IMPLEMENTADO Y PROBADO** |
| 4 | Filtros de fecha de la vista partían vacíos (histórico completo) | UX (requisito de la misión) | Por defecto = fecha actual de negocio (America/Havana vía `todayBusinessDay()`); «Limpiar filtros» restaura hoy; intervalo invertido avisado y no aplicado | **IMPLEMENTADO Y PROBADO** |

**Riesgos restantes / limitaciones:** ver §10 y §14.

---

## 2. Causa raíz del incidente de producción

**Síntoma (ENERVIDA-VITALLCONS):** al entrar en `Inicio → OPERACIÓN → Caja → Ingresos/Egresos`, el libro de caja no cargaba: «No se pudo cargar el libro de caja» con detalle técnico `column commission_payments.amount does not exist`. Los KPIs «Saldo físico CUP/USD» de la vista quedaban en `—` (el hook `useCashCurrencySummary` viaja en la misma respuesta).

**Causa raíz demostrada (evidencia triple, sin hipótesis):**

1. **Código:** `src/app/api/cash-flow/ledger/route.ts` (línea 303 del estado previo) ejecutaba:
   ```ts
   .select('id, amount, amount_cup, currency, exchange_rate, payment_method, status, paid_at, paid_by, notes')
   ```
   `amount` y `notes` **nunca existieron** en `commission_payments` — la tabla se creó en `20260626000002_workers_commissions.sql` con `calculated_amount`/`final_amount` (sin `amount` ni `notes`); las extensiones `20260712000002` (amount_cup) y `20260713000004` (payment_reference) tampoco las introdujeron.

2. **Esquema real de producción (introspección de SOLO LECTURA vía OpenAPI de PostgREST, 2026-10-24):** `commission_payments` = `id, store_id, worker_id, period_start, period_end, calculated_amount, final_amount, manual_adjustment_reason, calculated_breakdown, rule_applied_id, status, approved_by, approved_at, paid_by, paid_at, created_at, updated_at, created_by, tenant_id, payment_method, currency, exchange_rate, amount_cup, due_date, payment_reference` — **sin `amount`, sin `notes`**.

3. **Reproducción:** (a) consulta PostgREST en vivo de solo lectura con el select defectuoso → HTTP 400 `{"code":"42703","message":"column commission_payments.amount does not exist"}` — el error EXACTO de producción; (b) BD aislada PG 18.4 con esquema fiel → mismo 42703; (c) el select corregido → HTTP 200.

**Alcance del fallo:** la ruta abortaba en la fuente 3 de 6 (comisiones) — las consultas previas (RPC apertura/summary, `transactions`, `transaction_items`, `payment_transactions`) funcionaban. Al fallar, se perdían: el libro completo, los saldos físicos por moneda (KPIs), el saldo histórico a fecha de corte y el resumen por moneda. Las operaciones de creación/egreso NO estaban afectadas (usan `create_cash_flow_document`).

**Corrección mínima (Bloque A):**
- Select: `id, final_amount, amount_cup, currency, exchange_rate, payment_method, status, paid_at, paid_by, payment_reference, manual_adjustment_reason`.
- Importe nativo de visualización — MISMA clasificación canónica que el espejo RPC `get_cash_currency_summary` (única fuente de verdad del libro físico):
  - CUP → `final_amount` (respaldo `amount_cup`)
  - USD → `amount_cup / exchange_rate` (tasa ≤ 0 o ausente → se muestra el canónico CUP; nunca se inventa tasa — antes `exchange_rate || 1`)
- `reference`/`description`: `payment_reference` cuando existe (antes `notes` fantasma).
- La contribución canónica al saldo (`amount_cup_signed = -abs(amount_cup)`) NO cambia — el error era de esquema, no contable.

---

## 3. Comparación del esquema (esperado vs efectivo)

| Objeto | Esperado (migraciones) | Efectivo (producción, solo lectura) | Discrepancia |
|---|---|---|---|
| `commission_payments` | Sin `amount`/`notes` (creada 20260626000002 + extensiones) | Sin `amount`/`notes` — columnas idénticas a migraciones | **NINGUNA** — el defecto era del CÓDIGO, no del esquema |
| `cash_flow_documents` | 20261021000001 (+v2.24.0/v2.24.1) | Idéntico (incl. `amount_cup` GENERATED) | Ninguna |
| `payment_transactions` | `amount_cup` GENERATED (invariante I2) | Idéntico | Ninguna |
| `get_cash_currency_summary` | 20261023230000 | Desplegado y funcional (verificado: HTTP 200, net ENERVIDA CUP 8.435.679,98 / USD 367) | Ninguna |
| Otras 5 fuentes del ledger | — | Todas HTTP 200 en vivo (transactions, transaction_items, payment_transactions, cash_closures+embed profiles, profiles) | Ninguna |

**Conclusión:** NO existe divergencia de despliegue. No se requiere migración de esquema para el incidente. La única migración de esta misión (§11) corrige un defecto de FUNCIÓN (idempotencia), no de esquema.

---

## 4. Cambios realizados

| Archivo | Cambio | Motivo |
|---|---|---|
| `src/app/api/cash-flow/ledger/route.ts` | Select de comisiones con columnas reales; nativo CUP=`final_amount`; USD=`amount_cup/rate` sin tasa inventada; reference/description=`payment_reference` | Causa raíz del incidente |
| `src/components/views/terminal/views/cash_flow/IngresosEgresosView.tsx` | Pestañas reales (tablist/tab/tabpanel WAI-ARIA, teclado ←/→/Home/End, roving tabindex); paneles siempre montados (inactivo oculto); fechas por defecto = hoy de negocio; «Limpiar filtros» restaura hoy; intervalo invertido → alerta + rango no aplicado | Fase 2 + Fase 3 |
| `src/components/views/terminal/views/cash_flow/CashLedgerPanel.tsx` | Acordeón eliminado → contenido de pestaña (prop `active`); consulta se activa con la pestaña y permanece suscrita; corte (`as_of`) con `max=hoy` | Fase 2 |
| `supabase/migrations/20261024180000_auditoria_caja_idempotencia_determinista.sql` | **NUEVA** — redefine `create_cash_flow_document` con hash determinista (1 línea funcional; cuerpo íntegro sin cambios contables) | Defecto descubierto en la auditoría (Caso D) |
| `src/__tests__/api/cash-ledger-route.test.ts` | **NUEVO** (9 tests) — contrato de columnas con emulación PostgREST 42703, clasificación CUP/USD, propagación del error real, 403 multitienda, 400 parametría | Regresión del incidente |
| `src/__tests__/components/ingresos-egresos-tabs-fechas.test.tsx` | **NUEVO** (10 tests) — tabs ARIA/teclado/visibilidad, no remonte con estado conservado, carga al activar, fechas hoy/limpiar/intervalo/estabilidad, corte max=hoy | Fase 2+3 |
| `src/__tests__/components/ingresos-egresos-view.test.tsx` | 1 aserción ajustada (`getAllByText` para KPIs que ahora existen en ambas pestañas montadas) | Adaptación al diseño de pestañas |
| `docs/audits/caja-ingresos-egresos-20261024/` | Evidencia: 5 capturas + JSON de certificación contable (51/51) | Entregables |

---

## 5. Evidencia contable (BD aislada, datos sintéticos, RPC reales)

**Entorno:** PostgreSQL 18.4 embebido local (`cajamision`), tablas con columnas fieles a producción (dump OpenAPI solo lectura) + cuerpos RPC REALES extraídos de las migraciones finales (`create_cash_flow_document` v2.24.1, `reverse_cash_flow_document`, `get_cash_flow_summary` v20261021120000, `get_cash_currency_summary` v2.24.0, `open_cash_shift` v2.24.1, `validate_operation_date`, autorización `has_store_*`). Migración de idempotencia aplicada ANTES de la corrida. Cifras esperadas calculadas ANTES de ejecutar (§7.3).

**Resultado: 51 comprobaciones PASS · 0 FAIL** (detalle completo en `certificacion-contable-results.json`).

### A. Fondo de cambio
| Paso | Esperado | Observado |
|---|---|---|
| Constitución 5.000 CUP | doc confirmado · net CUP 5.000 · fondo 5.000 | ✅ ✅ ✅ |
| Reposición 2.000 | net 7.000 (movimiento posterior, sin doble conteo del inicial) | ✅ |
| Devolución parcial 1.500 (vinculada al origen) | net 5.500 | ✅ |
| Devolución total 5.500 | net 0 · fondo 0 | ✅ |
| Devolución 100 con fondo 0 | RECHAZADA | ✅ (guard de efectivo/fondo) |
| Reintento misma clave+payload | MISMO documento · 0 filas nuevas · saldo intacto | ✅ ✅ ✅ |

### B. Ingresos/egresos ordinarios
Ingreso válido ✅ · egreso válido ✅ · justificación ausente ERR ✅ · importe 0/negativo/3 decimales ERR ✅ · fecha futura ERR ✅ · fecha >6 meses ERR ✅ · fecha anterior al turno ERR ✅ · duplicado benigno ✅ · clave+payload distinto ERR_IDEMPOTENCY_KEY_REUSE ✅ · usuario de otra tienda ERR_UNAUTHORIZED ✅ · clerk en entrega ERR_DELIVERY_ROLE ✅ · usuario inexistente ERR_UNAUTHORIZED ✅.

### C. Monedas
Ingreso 20 USD → doc canónico `amount_cup` 9.600 (tasa elToque 480) ✅ · net por moneda SEPARADO (CUP 700 · USD 20 — sin conversión implícita) ✅ · período por moneda (in_cup 8.000 · in_usd 20) ✅.

### D. Reversión y consistencia
Reversión compensa EXACTAMENTE (+300 una vez) ✅ · original marcado anulado (no borrado) + contra-movimiento vinculado (in·300·cash_flow) ✅ · segundo intento rechazado sin efecto ✅ · reversión concurrente: exactamente UNA prevalece ✅ · doble gasto concurrente contra el canónico: solo UN egreso pasa (advisory lock + relectura fresca tras la espera — verificado con prueba determinista de snapshot) ✅ · canónico final 50 (no negativo) ✅.

### E. Fechas
`payment_date` = fecha operativa explícita (≠ `created_at` de registro) ✅ · libro por moneda = espejo SQL independiente construido con las MISMAS fuentes y reglas de signo/moneda/ventana ✅.

### F. Integridad entre componentes
Cada doc confirmado = 1 `payment_transaction` · anulado = 2 (original + contra) · sin huérfanos ✅ · venta 500 CUP (cobro 600, vuelto 100) aporta net CUP +500 contada UNA vez ✅ · la venta NO genera PT `ref_type='sale'` (sin doble contabilización con el ledger de ventas) ✅ · tienda S2 no ve nada de S1 (net 0/0, 0 docs) ✅ · usuario de S2 no puede anular documentos de S1 ✅.

---

## 6. Evidencia de fechas (Fase 3)

| Control | Comportamiento verificado |
|---|---|
| Filtros Desde/Hasta de la vista | Por defecto = **hoy de negocio** (`todayBusinessDay()`, America/Havana — convención operativa COSTPRO; jamás conversión UTC cruda). Verificado en UI real: `desde=hasta=2026-10-23` (= hoy Habana) |
| «Limpiar filtros» | Restaura Desde/Hasta a hoy (no a vacío) — test 7 ✅ |
| Intervalo invertido (Desde>Hasta) | `aria-invalid` + `role=alert` «El intervalo es inválido» + el rango contable NO se aplica (sin gte/lte) — test 8 ✅ |
| Cambio de pestaña y retorno | Fechas intactas (paneles montados) — tests 4 y 9 ✅ |
| Fecha operativa del formulario (modal de registro) | Ya usaba `todayBusinessDay()` con `OperationDatePicker` y validación de ventana — **sin cambios** (correcto de origen); doctrina de envío `resolvePosOperationDate` (hoy → NOW() del servidor) |
| Corte histórico (`as_of`) del libro | Opcional por diseño (vacío = saldo vigente); `max=hoy` para impedir cortes futuros sin sentido — test 10 ✅ |
| Período del libro (30/90/365 días) | Regla de negocio preexistente conservada (90 días por defecto) |
| Fechas futuras en filtros de CONSULTA | Permitidas deliberadamente (consultar un rango que aún no tiene datos es legítimo); la restricción de no-futuro aplica a FECHAS OPERATIVAS (gate `validate_operation_date` + ventana del turno), no a filtros de lectura |
| Backend | Las reglas cronológicas monetarias siguen en el RPC (piso 6 meses, tope hoy Habana, ventana del turno) — la UI es conveniencia; sin cambios |

---

## 7. Evidencia visual (producción, modo SOLO LECTURA)

Navegación real autenticada contra la tienda **ENERVIDA-VITALLCONS** a través del servidor local (código corregido) leyendo los datos reales de producción — **cero escrituras**:

| Captura | Contenido |
|---|---|
| `01-tab-documentos-desktop.png` | Pestaña «Ingresos/Egresos»: turno, 7 KPIs, filtros (fechas = hoy), tarjetas |
| `02-tab-libro-desktop.png` | Pestaña «Movimientos que explican el saldo»: **Saldo físico CUP $8.435.679,98 · USD $367,00 · equivalente contable $8.732.099,98** + libro con saldo corrido — LA VISTA QUE ANTES MOSTRABA «No se pudo cargar el libro de caja» |
| `03-tab-documentos-fechas-desktop.png` | Filtros de fecha con valores por defecto (hoy) |
| `04-tab-documentos-movil.png` | Pestaña documentos en 390×844 (responsive) |
| `05-tab-libro-movil.png` | Pestaña libro en 390×844 (responsive) |

**E2E del incidente (API):** `GET /api/cash-flow/ledger?store_id=<ENERVIDA>` con sesión real → **HTTP 200** (antes: 500), `net CUP 8.435.679,98 · USD 367` (idéntico al RPC autoritativo — reconciliado), 60 filas en ventana incluyendo la fila de comisión real `comm-7374dfad…` (300 CUP, 15/10/2026 17:00 Habana — el pago cuya fila tumbaba la ruta): `amount_native=300` (de `final_amount`), `amount_cup_signed=-300`, `user_name="Admin Demo"`, saldo corrido correcto. Saldo histórico a corte 2026-10-16: CUP 1.202.335 · USD 0 (reconstrucción `ledger_walk`) ✅.

---

## 8. Resultados de pruebas

| Comando | Entorno | Resultado |
|---|---|---|
| `npx tsc --noEmit` | local (NODE_OPTIONS 5 GB) | **0 errores** |
| `npx eslint <5 archivos tocados>` | local | **0 errores** (5 warnings preexistentes de `<button>` crudo — patrón de la casa) |
| `npx vitest run` (8 suites del módulo: ledger-route NUEVO, tabs-fechas NUEVO, view, route, create-modal, reverse-modal, ledger-balance, concepts) | local | **93/93 PASS** |
| `npx vitest run` (migraciones + cash-arqueo + cash-report-summary/core + navegación caja) | local | **166/166 PASS** |
| `npx vitest run` (cash-report-adjustments + payments-route-payment-date) | local | **16/16 PASS** |
| Certificación contable A–F (script propio, BD aislada + RPC reales + migración de idempotencia aplicada) | PG 18.4 embebido | **51/51 PASS** |
| Suite completa de vitest | local | **NO EJECUTADA** (limitación de RAM del entorno de 4 GB con el servidor dev + PG embebido activos; las suites del alcance y las colaterales críticas sí corrieron — 275 tests verdes) |
| E2E Playwright autenticado | local | **NO EJECUTADO** (E2E deshabilitado por el propietario desde 2026-10-09); sustituido por navegación real de solo lectura con evidencia (§7) |
| Build de producción | local | **NO EJECUTADO** (OOM del entorno de 4 GB — limitación conocida documentada en misiones previas; CI con 7 GB lo compila) |

---

## 9. Seguridad y multitienda

- Usuario autorizado solo consulta su tienda: la ruta valida `canManageStore` → 403 con tienda ajena (test 8 de la suite de API) ✅
- RPC `create_cash_flow_document` / `reverse_cash_flow_document`: `ERR_UNAUTHORIZED` para usuario sin membresía activa de la tienda (fail-closed, actor SIEMPRE de la sesión verificada — verificado B8a/B8c/F4) ✅
- Aislamiento de datos: S2 no ve documentos ni saldos de S1 (F3/F3b) ✅
- `service_role` NO se usó para saltar aislamiento: las pruebas de BD aislada usan las mismas funciones de autorización reales (`has_store_access_as`/`has_store_role_as` sobre memberships) ✅
- RLS: no se desactivó nada. La BD aislada no recrea las políticas (son 489 migraciones sobre un baseline externo), pero: (a) el contrato estático de RLS sigue cubierto por las suites de migraciones existentes (166 PASS incluyen `cash-flow-migration.test.ts`), (b) la autorización a nivel RPC (la barrera efectiva de las rutas service_role) fue probada directamente ✅
- Concurrencia: advisory lock por tienda + FOR UPDATE en documentos + relectura fresca tras espera del lock (prueba determinística) → sin doble gasto ni reversión duplicada ✅
- Los errores de esquema (42703) se distinguen de permisos (403/ERR_UNAUTHORIZED) y se propagan con el mensaje real — nunca lista vacía que oculte el fallo (test 6 de la suite de API) ✅

---

## 10. Estado de producción

**Verificado en modo lectura:** esquema de `commission_payments` (+5 tablas del ledger), presencia y salida del RPC `get_cash_currency_summary` (net real de ENERVIDA), reproducción del error exacto, E2E de la ruta corregida contra datos reales, navegación UI de solo lectura con capturas.

**Pendiente de autorización del propietario (esta misión NO lo hizo):**
1. Desplegar el fix del ledger a producción (Vercel).
2. Aplicar la migración `20261024180000` (idempotencia determinista) — ver plan de aplicación dentro del propio archivo SQL.
3. Verificación post-despliegue: abrir Ingresos/Egresos en ENERVIDA-VITALLCONS y confirmar el libro visible (debe mostrar los mismos saldos que §7).

---

## 11. Instrucciones de revisión

1. **Riesgo del fix del ledger (mínimo):** cambia SOLO el select y la clasificación de visualización de comisiones; la contribución canónica al saldo (`amount_cup_signed`) es idéntica a la intención original. Revisar `route.ts` diff (~30 líneas con comentarios).
2. **Riesgo de la migración de idempotencia (bajo, documentado en el archivo):** 1 línea funcional; las filas previas de `idempotency_registry` conservan su hash antiguo (los reintentos TARDÍOS de documentos viejos seguirán rechazándose como hoy; los NUEVOS serán benignos). Efecto neto estrictamente mejor.
3. **Riesgo del rediseño de tabs (bajo):** sin cambios de datos ni de consultas; los modales y el flujo de registro quedan a nivel de vista (accesibles desde ambas pestañas); la consulta del libro se activa con la pestaña.
4. **Impacto de migración:** ninguno en datos (CREATE OR REPLACE de función). Aplicar en ventana de baja actividad.
5. **Pasos para validar:** correr las 3 suites nuevas/afectadas; opcionalmente reproducir la certificación contable con `scripts/` del expediente (requiere PG embebido); revisar capturas; tras despliegue autorizado, verificación visual en ENERVIDA.

---

## 12. Referencias

- Rama: `fix/caja-ingresos-egresos-auditoria-20261024` (desde `main` = `52ab401`)
- PR: (enlace al crear)
- Expediente: `docs/audits/caja-ingresos-egresos-20261024/` (5 capturas + JSON 51/51)

---

## 13. Defectos preexistentes documentados (fuera del alcance de este PR, decisión del propietario)

1. **Asimetría de validación de egresos por moneda:** `otro_egreso` valida contra el saldo CANÓNICO CUP (incluye USD a tasa de operación — fórmula v2.21.0 del arqueo), mientras que `entrega_efectivo` valida contra el saldo FÍSICO de la moneda del documento (misión v2.24 D4). Consecuencia: un «otro egreso» en CUP puede llevar el físico CUP a negativo si hay USD en caja (el canónico lo cubre). No es una carrera ni duplicación — es una decisión de política contable. **Recomendación:** decidir si los egresos ordinarios deben validar también por moneda física (cambio de política, no de bug).
2. **PT007 (conocido):** sin flujo de reversión contable para pagos de proveedor (DELETE prohibido por diseño) — reportado en misión anterior.

## 14. Declaración final

**APTO PARA REVISIÓN:** pruebas críticas completadas en entorno aislado (51/51 contables + 275 tests de regresión + E2E de solo lectura contra datos reales de la tienda afectada); el PR está preparado. **Sin merge, sin despliegue y sin escrituras en producción** — el despliegue del fix del ledger y la aplicación de la migración de idempotencia quedan pendientes de autorización expresa del propietario. Limitaciones documentadas: suite completa de vitest y build de producción no ejecutados por RAM del entorno; E2E Playwright deshabilitado por el propietario (sustituido por navegación real de solo lectura con evidencia).
