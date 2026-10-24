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

---

## 15. Adenda — Aplicación autorizada de la migración (2026-10-24T00:11Z)

### 15.1 Defecto latente descubierto al preparar la aplicación

Al preparar la aplicación autorizada se descubrió que el `revoke/grant` final de `20261024180000` llevaba la firma de **11 argumentos** (huella pre-v2.24.0) mientras la función viva tiene **13**. PostgreSQL errora con `42883 function ... does not exist` al aplicar el archivo (reproducido en la BD aislada PG 18.4). El replay estático de CI lo saltaba en silencio (statement para una firma no definida en el stream → sin efecto), por lo que el Security Audit había quedado verde con el archivo roto. La prueba «aplicada en aislado» de la fase original era parcialmente ilusoria: `apply_idem_fix.mjs` erroraba en la última sentencia pero el cuerpo ya estaba instalado por `setup_cajamision.mjs`, y los casos D certificaron ese cuerpo — no la aplicabilidad del archivo.

**Corrección:** firmas corregidas a los 13 argumentos reales, idénticas a v2.24.0 L2286-2287 (`revoke ... from public` + `grant execute ... to service_role`). Registrada en el propio archivo.

### 15.2 Re-certificación completa ANTES de aplicar (cadena de archivos, no solo cuerpos)

1. `setup_cajamision.mjs` — BD aislada reconstruida: tablas fieles a producción + RPC v2.24.1 con el patrón NO determinista (estado pre-migración).
2. `apply_idem_fix.mjs` — el archivo corregido aplica **limpio** (CREATE OR REPLACE + revoke/grant 13-arg, sin error).
3. `cert-contable.mjs` — **51/51 PASS** contra el cuerpo aplicado por el archivo (evidencia `certificacion-contable-results.json` regenerada).

### 15.3 Aplicación a producción (autorizada por el propietario)

- **Autorización:** «autorizada la migracion» (2026-10-24).
- **Pre-vuelo (solo lectura):** cuerpo LIVE = v2.24.1 con patrón viejo (única firma 13-arg, ACL `{postgres=X, service_role=X}`); 0 consultas activas; 0 documentos de caja en los últimos 5 min. Diff del cuerpo LIVE vs cuerpo del archivo verificado = **exactamente 1 línea funcional** (la del hash).
- **Aplicación:** archivo completo como transacción única vía Supabase Management API (rol postgres), HTTP 201, 2026-10-24T00:11Z.
- **Post-verificación (solo lectura):** patrón viejo ausente · patrón nuevo presente · ACL intacta · hash de la nueva expresión determinista (SELECT puro: `md5(...COALESCE(NULL::timestamptz::text,'')...)` estable entre llamadas) · el patrón viejo diverge en 60 ms (defecto documentado).
- **Regresión del incidente:** `GET /api/cash-flow/ledger` ENERVIDA → **HTTP 200**, saldos idénticos (net CUP 8.435.679,98 · USD 367), libro con 60 filas y comisiones presentes.

### 15.4 Re-certificación del contrato de seguridad

- `contract-surface.sql` re-exportado de producción (solo lectura): 150 funciones, **diff = exactamente 1 línea** (la del hash) + timestamp de captura — ninguna otra función cambió.
- Baseline temporal `BODY_DRIFT_FROM_MIGRATION` para `create_cash_flow_document/13` **retirada** (su razón de ser caducó al aplicarse la correctiva): la Capa C del gate ahora reconcilia activamente LIVE == migraciones.
- Auditoría estática local: **150/150 representadas · 0 divergencias bloqueantes** (2 warnings MEDIUM/LOW preexistentes de frescura de firma en `cancel_transfer` y `reset_store_data`, ajenos a este cambio).

### 15.5 Impacto operativo del cambio aplicado

Los reintentos de red de `create_cash_flow_document` con MISMA clave de idempotencia y MISMO payload (sin fecha operativa explícita) ahora devuelven el documento original (replay benigno) en lugar de rechazarse con `ERR_IDEMPOTENCY_KEY_REUSE`. Las filas previas de `idempotency_registry` conservan su hash antiguo: los reintentos tardíos de documentos ya registrados siguen rechazándose como hoy. Sin cambios contables (clasificación, saldos, fondo, turnos y validaciones intactos — verificado por diff de 1 línea + 51/51).

**Nota:** el fix del ledger (ruta `/api/cash-flow/ledger`) es código de aplicación y sigue pendiente de merge + despliegue por el propietario (PR #1468) — la migración aplicada NO lo despliega. El error de producción «No se pudo cargar el libro de caja» se corrige en producción únicamente cuando el propietario despliegue el PR.

---

## 16. Adenda POST-MERGE — Verificación en producción y cierre del riesgo contable (2026-10-24T01:20Z)

> Misión posterior a la fusión del PR #1468 (commit de merge `a082d54`, 2026-10-23 20:30 −0400). Esta sección NO reescribe la historia: añade el seguimiento con los estados separados que exige la misión. Las pruebas de las secciones anteriores conservan su fecha y alcance original.

### 16.1 Estados separados (lo fusionado ≠ lo desplegado ≠ lo probado)

| Estado | Valor | Evidencia |
|---|---|---|
| Código fusionado | `main` = `a082d540ef` (merge de #1468; sin commits posteriores ni reverts) | `git log origin/main` |
| CI en el commit de fusión | TODO VERDE (TypeCheck+Lint+Unit+Build ✅ · Unit & Integration ✅ · Security Audit ✅ · Allowlist ✅ · TS Security ✅ · SQL Static ✅ · SQL DB Security ✅ · Vercel ✅ · **E2E skipped — deshabilitado por el propietario**) | GitHub check-runs de `a082d54` |
| Migración 20261024180000 | **Aplicada y re-verificada** (2026-10-24T00:39Z, solo lectura): firma única 13-arg · patrón determinista presente · patrón viejo ausente · ACL `{postgres=X, service_role=X}` · expresión de hash del cuerpo vivo **idéntica verbatim** a la del archivo | `faseA3-migracion-readonly.mjs` |
| Código desplegado en producción | **dpl_2oXyxKv3eKum** = `a082d540ef` · READY 2026-10-24T00:30Z · dominio `costpro4.vercel.app` (HTTP 200) — el despliegue de PRODUCCIÓN corre el commit fusionado | Vercel API v6 |
| Incidente de carga | **RESUELTO EN PRODUCCIÓN DESPLEGADA**: `GET /api/cash-flow/ledger` ENERVIDA → HTTP 200 (antes: 500 «No se pudo cargar el libro de caja»). La fila de comisión del incidente (`comm-7374dfad`, 300 CUP) renderiza con saldo corrido | Fase B (16.2) |
| Validación de producción en la app | Navegación REAL autenticada de solo lectura contra `costpro4.vercel.app` con la tienda ENERVIDA-VITALLCONS activa (login demo documentado) — pestañas, libro, KPIs, filtros, fechas | Fases B/C · capturas 01–04 |
| Pruebas en BD aislada | Fase E: 5 defectos reproducidos contra el código fusionado; 27/27 PASS contra el correctivo · certificación previa 51/51 (recalibrada a la semántica física, invariante intacta) | `evidence/faseE-*-results.json` |
| E2E Playwright autenticado | **NO EJECUTADO** (deshabilitado por el propietario; la navegación manual de solo lectura NO se etiqueta como suite E2E) | — |
| Migración correctiva 20261024220000 | **PENDIENTE de aplicación autorizada** (probada en aislado; plan de aplicación en el archivo) | §16.5 |

### 16.2 Fase B — Libro de caja en producción desplegada (solo lectura, 2026-10-24T00:41Z)

- `GET /api/cash-flow/ledger?store_id=ENERVIDA&limit=200` → **HTTP 200**: 121 filas visibles, `truncated: true` (señalizado), desglose `venta_efectivo 114 · reembolso_devolucion 2 · anticipo_produccion 3 · pago_proveedor 1 · comision 1`.
- **Reconciliación por moneda contra la fuente autoritativa** (RPC `get_cash_currency_summary`, mismo corte): `net CUP 8.435.679,98` · `net USD 367` = `balance_now` de la app (`reconciled: true`) — **coincidencia exacta en ambas monedas**. Corrida USD verificada fila a fila: 150 (17/10) → 357 (19/10) → 367 (23/10).
- Términos RPC: entradas `sales_cash CUP 8.454.434,98 + USD 367 · production_cash CUP 223.350` · salidas `supplier_cash CUP 2.400 · commissions_cash CUP 300 · devolution_refunds CUP 239.405` — aritmética del neto verificada (= 8.435.679,98).
- Filtros de fecha (día de negocio Habana 2026-10-23 → límites UTC): HTTP 200, 2 filas del día. Rango invertido → conjunto vacío + bloqueo preventivo en la UI (alerta «El intervalo es inválido»). `as_of` futuro no altera el saldo presente.
- Semántica de error: sin token → 401; tienda ajena → 403 (`canManageStore`); parámetros inválidos → 400 con detalle. Un error real NO se enmascara como tabla vacía (el antipatrón corregido en #1468 era exactamente el 500 oculto).
- Sin escrituras en producción (GET exclusivo).

### 16.3 Fase C — Interfaz fusionada verificada en la app desplegada

- **Pestañas reales** (no acordeón): `role=tablist/tab/tabpanel` · `aria-selected` · roving tabindex · teclado ←/→ verificado en vivo.
- La pestaña del libro carga sin el error del incidente; KPIs por moneda correctos y **separación explícita** «SALDO FÍSICO CUP / SALDO FÍSICO USD / EQUIVALENTE CONTABLE (CUP canónico) — identificado como equivalente, no sustituye los saldos físicos».
- Filtros de fecha por defecto = **2026-10-23** (día de negocio Habana; servidor en UTC 24/10 — sin salto de día). «Limpiar filtros» restaura hoy (probado: cambio → botón aparece → clic → restaura). Selección conservada al alternar pestañas; **sin consultas redundantes** al alternar (contador de peticiones estable). Filtro de moneda USD → solo filas USD. Recarga conserva valores. Sin errores de página (consola limpia).
- Capturas: `01-prod-tab-documentos-fechas.png` · `02-prod-tab-libro-kpis.png` · `03-prod-tab-libro-movil.png` · `04-prod-tab-libro-despues-de-recarga.png`.

### 16.4 Fase D/E — El riesgo contable documentado en §13.1 era REAL: 5 repros con expectativas pre-calculadas

La asimetría §13.1 (`otro_egreso` valida canónico CUP que **incluye** USD a tasa; `entrega_efectivo` valida físico por moneda) se confirmó como defecto reproducible en BD aislada con esperados calculados ANTES de ejecutar (tasa sintética 400):

| # | Escenario (físico real) | Esperado | Observado con código fusionado |
|---|---|---|---|
| 1 | 100 CUP + 100 USD; egreso 150 CUP | RECHAZADO | **ACEPTADO** → físico CUP **−50** |
| 3b | 500.000 CUP + 100 USD; egreso 150 USD | RECHAZADO | **ACEPTADO** → físico USD **−50** |
| 5 | 100 CUP + 100 USD; dos egresos concurrentes de 60 CUP | solo UNO | **AMBOS** → físico CUP **−20** |
| M4 | fondo 300, físico 50; devolución 200 (≤ fondo) | RECHAZADO | **ACEPTADO** |
| M10 | físico USD 20; reversión del ingreso USD 100 | RECHAZADO | **ACEPTADO** → físico USD **−80** |

Caso 4 (cambio explícito): el modelo NO tiene operación de cambio — verificado que ningún documento de una moneda altera el físico de la otra (la conversión implícita no existe; con el correctivo queda estructuralmente imposible usarla para financiar salidas).

### 16.5 Fase F — Correctiva (PR nuevo, sin aplicar a producción)

- **Migración `20261024220000_saldo_fisico_egresos_multimoneda.sql`** (generada desde los cuerpos VIVOS verbatim + inserciones quirúrgicas): la rama ordinaria de egresos AÑADE la validación física por moneda (misma fuente autoritativa que `entrega_efectivo`: `get_cash_currency_summary → net → v_currency`, importe NATIVO); `reverse_cash_flow_document` AÑADE la misma validación para revertir ingresos. **Se conservan** la disciplina canónica del turno (ERR_INSUFFICIENT_CASH), la regla del fondo (ERR_FUND_INSUFFICIENT), roles, contraparte, advisory lock, idempotencia determinista (patrón 20261024180000 intacto) y RLS. ACL service_role-only con firmas reales. **Sin cambios de esquema.**
- **Fase E fixed: 27/27 PASS, 0 defectos** (mismos esperados). **Certificación previa 51/51** (A5/D4 recalibrados a la semántica física: el cierre fail-closed y la prevención de doble gasto se conservan — documentado en el propio test).
- App: mensaje API generalizado por moneda (422) · espejo en el modal (egreso ordinario valida físico por moneda + aviso canónico del turno) · 107/107 tests relacionados · tsc 0 errores · eslint 0 errores (1 warning preexistente).
- Contrato de seguridad: baseline temporal `BODY_DRIFT_FROM_MIGRATION` para las 2 funciones (patrón REM-INV-5/6, precedente b7d9358) — **expira al aplicar la correctiva o 2027-01-31**; tras la aplicación se re-exporta el surface y se retira la baseline (protocolo de §15.4).
- **Aplicación a producción: PENDIENTE DE AUTORIZACIÓN del propietario** (protocolo idéntico a §15: pre-vuelo fail-closed → transacción única → post-verificación solo lectura).

### 16.6 Declaración de esta adenda

**APTO PARA REVISIÓN:** la corrección del incidente está fusionada, desplegada y comprobada en producción mediante solo lectura (fases A–C); la corrección de saldo físico está implementada y probada en aislamiento (fases D–F) y queda un **PR nuevo pendiente de decisión del propietario**, cuya migración NO se aplica sin autorización expresa. Pendientes explícitos: aplicación autorizada de `20261024220000`, E2E Playwright autenticado (deshabilitado por el propietario), y la decisión sobre reembolsos de devolución en efectivo (ver §16.7).

### 16.7 Riesgo residual documentado (decisión del propietario, NO corregido)

`create_devolution_v2` reembolsa en efectivo sin validación de saldo físico por moneda (acotado por el tope de lo pagado por el cliente — la devolución devuelve lo recibido). Un reembolso CUP de una venta cobrada en USD es una conversión implícita hacia el cliente que puede llevar el físico CUP a negativo si el cajón está corto. Recomendación: exigir moneda del reembolso con físico suficiente (mismo patrón del correctivo) o documentar la excepción. Se deja sin cambiar para no romper flujos legítimos de devolución sin decisión expresa (misión §6: «no imponer la regla ciegamente a operaciones que no representen una salida real de efectivo» — este caso SÍ lo es, pero el acotamiento por lo pagado reduce el perfil de riesgo frente al defecto corregido).

---

## 17. Adenda FINAL — Cierre del riesgo de devoluciones en efectivo (2026-10-24T02:35Z)

> Misión POST-MERGE FINAL: seguimiento del PR #1470 y cierre del riesgo residual §16.7 (`create_devolution_v2`). Esta adenda NO reescribe la historia: las secciones anteriores conservan su fecha y alcance. Los estados quedan separados como exige el estándar: código fusionado ≠ desplegado ≠ migración aplicada ≠ probado en producción.

### 17.1 Causa raíz confirmada en `create_devolution_v2` (Fase A, auditoría del flujo real)

Reconstrucción del flujo completo contra el cuerpo VIVO de producción (extraído en solo-lectura): `solicitud → validación de fecha → advisory lock por tienda → idempotencia determinista → autorización → lock FOR UPDATE de la venta original → tope de cantidad DF-07 → método/moneda/tasa servidor → numeración → documento → ítems (precio servidor v2.24.1) → registro de idempotencia → contra-asiento DF-03 (cash_movements + payment_transactions refund) → auditoría`.

Causa raíz del riesgo §16.7 — DOS defectos estructurales confirmados:

1. **Sin validación de saldo físico por moneda**: el reembolso persiste directamente la fila `payment_transactions (ref_type='devolution', direction='refund', currency=v_refund_currency, amount=v_refund_amount)`; el libro (§7 de `get_cash_currency_summary`) la resta del neto de ESA moneda. Ningún punto del flujo comprueba que exista efectivo disponible de esa moneda.
2. **Moneda del reembolso = elección libre del operador** (`p_refund_currency`, default CUP) sin consultar los pagos reales de la venta: la venta registra sus cobros en `payment_transactions (ref_type='sale')` por componente (v2.25) y en `transactions.cash_received_{cup,usd}` (liquidación v2.24), pero el RPC jamás los lee. El importe reembolsable se calcula en CUP canónico desde `price_at_sale_cup` (precio servidor) — la equivalencia canónica NO representa billetes.

Hechos del modelo verificados (Fase A): NO existe operación de cambio entre monedas (invariante de la misión anterior, caso 4); el reembolso afecta la MISMA fuente de saldo físico que el libro (la fila refund), pero no valida contra ella; los locks existentes (advisory por tienda + `FOR UPDATE` de venta + relección del tope tras el lock) ya impiden dobles devoluciones por cantidad.

### 17.2 Regla contable adoptada (y su justificación)

**Un reembolso monetario devuelve valor por la moneda en que SALE el dinero, acotado por lo que esa venta NETAMENTE recibió en esa moneda:**

- **(a) Tope por moneda** (`ERR_DEVOLUTION_REFUND_CAP`): `reembolso_físico[X] ≤ pagado_neto[X] − reembolsado_no_revertido[X]`, con tolerancia 0,005. La conversión implícita USD↔CUP queda **estructuralmente imposible**: sin operación de cambio explícita (inexistente en el modelo), el pago de una moneda nunca financia la obligación de devolver la otra. Cubre también el arbitraje de tasa (pagado 10 USD a 400; reembolso a 320 = 12,5 USD → rechazado).
- **(b) Físico por moneda, solo efectivo** (`ERR_INSUFFICIENT_CURRENCY`): misma fuente autoritativa que el libro (`get_cash_currency_summary → net → v_refund_currency`) — paridad exacta con la correctiva 20261024220000 de egresos ordinarios y reversiones. Transfer/zelle solo reciben el tope (a) — no tocan el cajón. `store_credit` NO cambia (pasivo CUP-canónico ya acotado por DF-07; sin salida física).

**Determinación del pagado neto** (mismas fuentes de verdad que el ledger, prioridad): ① liquidación explícita v2.24+ (`cash_received − change` por moneda) + filas bancarias; ② filas reales no-CUP sin liquidación (v2.25 defensivo); ③ legacy con filas canónicas: split por carve USD de ítems (la fila canónica CUP de v2.24 **NUNCA** se toma como CUP físico pagado — `amount_cup` no son billetes); ④ pools legacy + carve. Sin ninguna fuente → pagos indeterminables → flujo **bloqueado** fail-closed (`ERR_DEVOLUTION_PAYMENTS_UNDETERMINED`, misión §10: no inventar la conversión).

**Cuatro magnitudes diferenciadas** (misión §9.3): *importe pagado* (billetes netos por moneda, de las fuentes anteriores) ≠ *importe reembolsable* (tope por moneda + tope de cantidad DF-07 en canónico) ≠ *moneda de entrega* (`v_refund_currency`, salida física) ≠ *equivalencia contable* (`v_total` canónico CUP que documenta la devolución; NO autoriza salida física alguna).

### 17.3 Bloqueos, transacciones e idempotencia (Fase C — reglas de implementación)

La validación ocurre en PostgreSQL, dentro de la transacción del RPC, **después** del advisory lock por tienda (misma llave que `create_cash_flow_document`/`close_cash_shift`) y del `FOR UPDATE` de la venta — la disponibilidad se RELEE bajo el lock (regla §5.3). Orden de locks coherente (tienda → documento; sin inversión respecto a otras rutas — sin deadlocks nuevos). Persistencia atómica: documento + ítems + stock + registro de idempotencia + contra-asiento + auditoría en UNA transacción; cualquier excepción revierte todo (probado con fallo inyectado a mitad: T8, cero efectos parciales). Idempotencia determinista intacta: misma clave + mismo payload → replay benigno; misma clave + payload distinto → `ERR_IDEMPOTENCY_KEY_REUSE` (B7a/B7b). Concurrencia: dos devoluciones simultáneas de la misma venta → exactamente UNA (B7c); egreso+reembolso concurrentes → exactamente UNA y físico nunca negativo (B7d-2/B7f-2); reembolso ∥ reversión → invariantes garantizados en cualquier orden (B7e). El saldo del frontend NO es autoridad contable: la UI solo espeja mensajes 422.

### 17.4 Matriz de pruebas (expectativas pre-calculadas ANTES de ejecutar; misión §4)

BD aislada cajamision (PG 18.4), tasa sintética 400, RPC VIVOS verbatim de producción + cadena completa 1818→2222→23000. **Fase current** (estado PR #1470 head): 81/81 comprobaciones PASS con **11 defectos reproducidos**. **Fase fixed** (con 23000): **85/85 PASS, 0 defectos** (los 4 casos extra son los invariantes concurrentes B7d-2/B7f-2). Los 11 defectos y su corrección:

| # | Escenario (esperado pre-calculado) | Current (defecto) | Fixed |
|---|---|---|---|
| B3b | Mixto 2000 CUP+5 USD; reembolso 2000 CUP (reembolsable CUP 1000) | ACEPTADO → CUP −1000 | RECHAZADO `REFUND_CAP`, saldo intacto |
| B3c | Mixto; devolución total 10 USD (pagados 5) | ACEPTADO → USD −5 | RECHAZADO `REFUND_CAP` |
| B4a | Venta cobrada 10 USD; reembolso 4000 CUP | ACEPTADO (conversión implícita) | RECHAZADO `REFUND_CAP` (CUP pagado 0) |
| B4b | Venta cobrada 5000 CUP; reembolso 12,5 USD | ACEPTADO (conversión implícita) | RECHAZADO `REFUND_CAP` (USD pagado 0) |
| B5a | Físico 100 CUP + 5000 USD; reembolso 3000 CUP | ACEPTADO → CUP −2900 | RECHAZADO `INSUFFICIENT_CURRENCY` |
| B5b | Físico 500.000 CUP + 5 USD; reembolso 10 USD | ACEPTADO → USD −5 | RECHAZADO `INSUFFICIENT_CURRENCY` |
| B7d | Egreso 3000 confirmado + reembolso 3000 (físico 5000) | AMBOS → CUP −1000 | Reembolso RECHAZADO; físico 2000 |
| B7f | Dos ventas, reembolsos 2000+2000 (físico 2000) | AMBOS → CUP −2000 | El 2.º RECHAZADO; físico 0 |
| T10 | Pagado 10 USD a 400; tasa 320 → reembolso 12,5 USD | ACEPTADO → USD −2,5 | RECHAZADO `REFUND_CAP` |
| T11c | Venta zelle-USD; reembolso 2000 CUP | ACEPTADO (conversión implícita) | RECHAZADO `REFUND_CAP` |
| T13 | Legacy carve-USD; reembolso 800 CUP | ACEPTADO → CUP −800 | RECHAZADO `REFUND_CAP` |

**Flujos legítimos preservados** (aceptados en AMBAS fases): B1 (CUP puro), B2/B2b (USD puro, formas v2.25 y v2.24), B3a (mixto parcial dentro del tope), **B3d (mixto dividido: 2000 CUP + 5 USD = exactamente lo pagado)**, B6 (parciales repetidas + tope DF-07), B6b (reintento de red → replay benigno), B6c (reversión libera el tope), B7a/b (idempotencia), B7c (concurrencia misma venta), T8 (atomicidad), T9 (aislamiento multitienda: CROSS_STORE/UNAUTHORIZED), T11a (transfer-CUP → reembolso CUP), T11b (zelle-USD → reembolso USD), T11d (store_credit íntegro: la caja NO se toca), T11e (transfer USD), T13-USD/T14 (legacy y v2.25 sin liquidación).

**Regresión con la cadena completa**: certificación contable previa **51/51** · faseE saldo físico fixed **27/27** (la correctiva 2222 NO se regresa) · seguridad **14/14** (ACL efectiva: anon/authenticated rechazados en ejecución real; service_role conserva el contrato; SECURITY DEFINER + search_path + patrón actor-explícito intactos). Local: 126/126 tests relacionados + 58/58 patrón devolution + 20/20 integración reverse-devolution + tsc 0 + eslint 0 + auditoría estática CONTRATO OK.

### 17.5 Correcciones realizadas y archivos modificados

- **`supabase/migrations/20261024230000_devoluciones_reembolso_fisico_moneda.sql`** (NUEVO, consecutiva de 2222): `create_devolution_v2` = cuerpo VIVO verbatim + DOS inserciones quirúrgicas (bloque DECLARE + bloque de validación tras `v_refund_amount`; verificación de generación: 0 líneas del cuerpo vivo eliminadas, +139 netas). Sin cambios de esquema. ACL service_role-only con firma real de 12 args.
- **`src/app/api/devolutions/route.ts`**: `mapRpcError` — traducción a 422/409/403 accionable de los rechazos contables (la validación DEFINITIVA es del RPC; la API nunca valida por sí misma).
- **`src/__tests__/migrations/devoluciones-reembolso-migration.test.ts`** (NUEVO, 9 tests): contrato estático de la migración.
- **`src/__tests__/api/devolutions-route.test.ts`** (NUEVO, 9 tests): contrato de la ruta (actor de sesión, `p_refund_currency`, mapeos 422/409/403/500).
- **`ci-gate-allowlist.json`**: baseline temporal `BODY_DRIFT_FROM_MIGRATION` para `create_devolution_v2/12` (drift INTENCIONAL hasta la aplicación autorizada; verificado: sin ella el gate bloquea, con ella reconcilia — expira al aplicar o 2027-01-31).
- **Evidencias**: `evidence/faseB-devoluciones-{current,fixed}-results.json` · `evidence/faseE-seguridad-results.json` · `evidence/regresion-cadena-23000-results.json`.

### 17.6 Impacto sobre el PR #1470 y estado de las migraciones

El PR #1470 amplía su alcance con la correctiva de devoluciones como **migración consecutiva** (misión §6: unidad de despliegue clara — no se edita 2222, ya certificada por su propio contrato y suite): el plan de revisión del propietario pasa a abarcar la cadena **1818 (APLICADA en producción) → 2222 (preparada, pendiente) → 23000 (preparada, pendiente)**. Ambas pendientes comparten protocolo de aplicación §15 (pre-vuelo fail-closed → transacción única → post-verificación solo-lectura → re-exportar surface y retirar baselines). Estados separados: código del PR **NO fusionado** · migración 1818 **aplicada y re-verificada** · migraciones 2222/23000 **preparadas y probadas en aislamiento, NO aplicadas** (prohibido aplicar sin autorización expresa) · validación en producción desplegada: **solo lectura** (sin registrar devoluciones reales de prueba, misión §11).

### 17.7 Limitaciones y pruebas NO ejecutadas

E2E Playwright autenticado: **NO EJECUTADO** (deshabilitado por el propietario — la navegación manual de la misión anterior NO se etiqueta como suite E2E). Pruebas de rendimiento/estrés: fuera de alcance. Prueba de aplicación real de 23000 a producción: pendiente de autorización (el apply se probó en aislado con la cadena completa). La suite faseB usa stubs funcionales para `register_stock_movement`/`fn_recalc_wac`/`can_reverse_document` (firmas reales; el RPC bajo certificación es el cuerpo VIVO verbatim; el inventario no es objeto de esta misión).

### 17.8 Riesgos restantes que requieren decisión del propietario

1. **`reverse_devolution` no compensa el efecto financiero** (hallazgo Fase A, preexistente): la reversión restaca y cambia el estado, pero NO escribe contra-asiento — la fila refund persiste restando del libro (conservador: nunca sobreestima el cajón) y el `store_credit_ledger` tampoco se compensa. Alternativas: contra-fila automática (patrón `reverse_cash_flow_document`) o proceso operativo documentado. El tope por moneda ya excluye devoluciones revertidas (B6c), por lo que el riesgo es de **presentación del saldo**, no de autorización de salidas.
2. **Reembolso total de venta mixta en UNA moneda**: bloqueado por diseño (misión §4 B3). El operador puede dividir en dos devoluciones (B3d lo demuestra) o usar store_credit. Alternativas de producto: reembolso dividido por moneda en una sola operación, operación de cambio explícita, o reembolso a la tasa histórica de la venta.
3. **Deriva de tasa** (T10): el reembolso USD a tasa vigente > tasa de la venta excede lo pagado → rechazado. El remanente queda sin entrega monetaria posible (crédito de tienda como salida). Decisión de política: tasa histórica vs vigente vs aceptar costo FX.
4. **store_credit de venta mixta absorbe canónicamente la parte USD** (crédito CUP-canónico): política vigente conservada; conversión vía crédito documentada para decisión expresa.
5. Pendientes previos: aplicación autorizada de 2222 y 23000 (en ese orden), E2E Playwright, y la fusión del PR #1470 (propietario).

### 17.9 Declaración de esta adenda

**APTO PARA REVISIÓN:** los flujos críticos de reembolso respetan la disponibilidad física por moneda y el tope de lo pagado por moneda en las pruebas aisladas (85/85, 0 defectos; 11 defectos pre-calculados reproducidos y cerrados; regresión 51/51 + 27/27 + 14/14; tests locales 213/213 relacionados). Queda pendiente la decisión del propietario sobre la fusión del PR #1470 y la aplicación autorizada de las migraciones 2222/23000 (en ese orden, protocolo §15). No se fusionó, no se desplegó y no se escribió en producción (solo lecturas).

## 18. Adenda de CIERRE — Reversión financiera de devoluciones, pagos mixtos y certificación final (2026-10-24T04:5xZ)

Misión «CIERRE» sobre el head real del PR #1470 (debe93c, cadena aislada 1818+2222+23000). Fases A-I completas. Esta adenda **cierra** los residuales §17.8.1-4 y define la declaración final del ciclo de caja.

### 18.1 Fase A — Diagnóstico exacto: las 8 preguntas obligatorias (misión §3)

Flujo reconstruido desde los cuerpos VIVOS de producción (extracción read-only 2026-10-24) + stream del PR. Respuestas verificadas con repro aislada (matriz R, §18.3):

1. **Movimiento de la salida física al confirmar una devolución en efectivo**: DOS escrituras en la MISMA TX — (a) `payment_transactions` fila `ref_type='devolution', direction='refund', currency=p_refund_currency, amount=nativo` (fuente autoritativa del libro, §7 de `get_cash_currency_summary`) y (b) `cash_movements` fila `out` canónica (sesión de caja, bookkeeping legacy — NINGÚN consumidor de app/SQL la lee: censo de referencias). La moneda de la salida era elección libre del operador (default CUP) hasta 23000 (tope por moneda); desde 40000 el importe USD además se ancla a la tasa histórica de la venta.
2. **Qué hace `reverse_devolution` (estado/inventario/financiero)**: lock `FOR UPDATE` de la devolución → guard de estado (solo `completed`) → autorización (`has_store_access_as` + `can_reverse_document`) → inventario: pipeline canónico (`register_stock_movement` −q tipo `devolution_reverse` + `fn_recalc_wac` invariante + kardex `devolution_out`) → estado: `status='reversed', reversed_at/by, reversal_reason` → auditoría. **NO tocaba nada financiero** (hallazgo confirmado del §17.8.1).
3. **¿La reversión generaba recuperación del dinero?**: **NO** — ni contra-asiento, ni fila compensatoria, ni liberación verificada. El dinero reembolsado quedaba fuera del cajón para siempre mientras el documento pasaba a `reversed` (R2).
4. **¿El libro conserva la salida tras revertir?**: **SÍ** (conservador — nunca sobreestima el cajón). La fila `refund` persiste y sigue restando del neto por moneda. Correcto como historia; el defecto era la ausencia del mecanismo de devolución del dinero al cajón (ahora `direction='recovery'`, §7b del summary).
5. **¿El tope contaba los reembolsos revertidos?**: **NO** — 23000 filtraba `d.status IN ('pending','completed')` (y DF-07 igual). Tras revertir, la capacidad se liberaba aunque el dinero no hubiera vuelto → **doble reembolso íntegro reproducido** (R1: 160 CUP reembolsados de 100 pagados; R4 espejo USD: 12 de 10).
6. **¿Qué operación económica justificaba liberarlo?**: **NINGUNA** — ese es el defecto contable nuclear de esta misión. La liberación solo es legítima cuando el dinero regresa (recuperación real, misma moneda).
7. **¿Reversión parcial si falla la escritura financiera?**: imposible por diseño en el contrato nuevo (R5): validación TODA antes de la primera escritura + transacción única del RPC → cualquier fallo (unique de idempotencia provocado) revierte íntegro (estado, stock, kardex, filas).
8. **store_credit / transfer / zelle vs efectivo**: `store_credit` emite pasivo (`store_credit_ledger` +importe canónico, sin tocar efectivo; la reversión NO lo compensaba → doble pasivo reproducido R7: 120 de crédito por una venta de 100); `transfer`/`zelle` emiten fila refund bancaria (fuera del efectivo físico, dentro del tope por moneda; su reversión tampoco recuperaba — R14); la UI además FORZABA moneda CUP en rieles bancarios (select deshabilitado) haciendo imposible reembolsar por el riel natural una venta cobrada en USD por zelle.

**Cinco estados diferenciados** (misión §3 final): documental (`devolutions.status`) · inventario (stock/kardex) · efecto financiero (filas refund/recovery por moneda y riel) · físico por moneda (`get_cash_currency_summary` net) · reembolsable por moneda (tope por dinero + DF-07 cantidad). La correctiva los mantiene explícitos y reconciliados.

### 18.2 Reglas adoptadas (migración 20261024400000, RC1-RC7)

- **RC1 (§4)**: la reversión de una devolución con reembolso liquidado **exige la recuperación atómica** (`p_recovery jsonb`): una sola transacción RPC con advisory por tienda + lock de venta + `FOR UPDATE` de la devolución. Sin `p_recovery` → `ERR_DEVOLUTION_REFUND_NOT_RECOVERED` (fail-closed). Devoluciones sin efecto financiero (históricas/documentales): reversión pura como antes (R16).
- **RC2 (§5)**: `importe reembolsable[moneda] = neto pagado[moneda] − reembolsos NO recuperados[moneda]` — el tope cuenta **dinero** (`Σ refunds − Σ recoveries`, sin filtro de estado): el estado documental ya no libera capacidad (R1/R2/R4).
- **RC3 (§4)**: la recuperación usa la **moneda real** (misma del reembolso — `ERR_DEVOLUTION_RECOVERY_COMPONENTS` si el set no coincide exacto; CUP no compensa USD, R4.currency-guard, R15) y el **riel real** de cobro (cash/transfer/zelle; zelle nunca CUP — espejo de PT005). **Importe, moneda y tasa los fija el servidor** desde la fila refund (cero aritmética manual del operador). Idempotencia: `'dev-<id>-recovery-<MONEDA>'` (índice único) + guard limpio `ERR_DEVOLUTION_ALREADY_RECOVERED` (R3/R6/R15).
- **RC4 (§6)**: devolución mixta **AS_PAID** — reembolso multi-moneda «según lo pagado»: un componente por moneda (filas refund separadas CUP/USD) bajo UNA transacción atómica; validación canónica de asignación completa (`ERR_DEVOLUTION_MIXED_ALLOCATION` bloquea el caso ambiguo — no existe regla de asignación por artículo); solo efectivo (`ERR_DEVOLUTION_AS_PAID_CASH_ONLY`); físico por componente. Antes NO existía ningún camino de devolución total de venta mixta (R8); ahora el flujo real UI→payload→RPC→filas→saldos lo completa (R8/R9) y la UI muestra la composición del pago y el reembolsable por moneda.
- **RC5 (§7)**: el importe USD del reembolso se ancla a la **tasa implícita histórica de la venta** (filas v2.25 → liquidación pura → carve legacy; `ERR_DEVOLUTION_RATE_UNDETERMINED` si no es reconstruible). La jerarquía de tasa VIGENTE (tienda→BCC→elToque) queda RETIRADA del reembolso: el mismo importe comercial ya no devuelve 4.94 ni 12.5 USD de 10 pagados según el día (R11/R11b) — se devuelven 10 USD exactos. Comparativa de alternativas (misión §7): (a) moneda+importe neto cobrados = **adoptada** (extensible a parcial proporcional sin arbitraje); (b) conversión explícita con tasa documentada = requiere operación de cambio inexistente (BLOCKED, decisión de producto); (c) equivalencia histórica = la tasa implícita ES la histórica de la venta (subcaso de (a)); (d) bloqueo por detalle irreconstruible = ya vigente (23000 `ERR_DEVOLUTION_PAYMENTS_UNDETERMINED`, R13).
- **RC6 (§8)**: `store_credit` — la reversión **compensa el pasivo** (fila negativa trazable `'dev-<id>-credit-comp'`, sin tocar efectivo: R7) y el crédito emitido no compensado respeta el **tope canónico** de la venta (`ERR_DEVOLUTION_CREDIT_CAP`); el crédito nunca se suma al efectivo (neto intacto en R7) y no se duplica con clave idempotente. La valoración canónica CUP del crédito de venta mixta se conserva (política vigente; documentada).
- **RC7 (§4)**: la recuperación por riel bancario no toca el efectivo físico (solo el tope y el pasivo), igual que los refunds bancarios (R14).

**Dependientes simétricas** (censo vivo de lectores de `direction`): `get_cash_currency_summary` §7b (+`devolution_recoveries` por moneda, neto) · `validate_payment_transactions_invariants` (`'recovery'` excluido de la suma de pagos PT001 y de la consistencia de tasa PT006 — DF-03 simétrico; sin esto toda recuperación violaría PT001) · `close_cash_shift` / `get_cash_shift_expected` / `get_cash_flow_summary` (términos `v_cash_recoveries`/`v_voucher_recoveries` — sin ellos el arqueo mostraría diferencia = dinero recuperado) · `get_cash_report` (desglose y totales) · `get_cash_ledger` (rama 6b `recuperacion_devolucion`) · `reverse_cash_flow_document` (esperado + recuperaciones).

### 18.3 Matriz fase-reversa (expectativas pre-calculadas ANTES de ejecutar; BD aislada por tienda)

**Current (head del PR: 1818+2222+23000): 41/41 PASS con 7 defectos reproducidos** — R1 reversión documental libera el tope (160 de 100; espejo USD R4) · R2 no existe mecanismo de recuperación · R7 store_credit sin compensar ni tope (120 de 100) · R8 venta mixta sin camino de devolución total · R11 arbitraje de tasa (4.94 de 10) · R14 UI bloquea moneda en rieles (zelle-USD irrembolsable por su riel). **Fixed (cadena + 40000): 80/80 PASS, 0 defectos** — incluye Casos 1-5 de la misión §5 (parcial+reversión administrativa rechazada; recuperación explícita conciliada; espejo USD; error parcial → transacción íntegra R5; concurrencia R6 con guard explícito), los 10 casos de §6 (mixta total R8, parciales consecutivos R9, sobre-reembolso por moneda R10, reintento idempotente R12, histórica indeterminable R13, zelle R14), guards de recuperación (R15), reversión documental pura intacta (R16), aislamiento multitienda (R17) y reintento de la devolución original tras reversión (R18).

### 18.4 Fase G — Regresión contable completa (cadena 1818→2222→23000→40000, BD reconstruida desde cero por suite)

`regresion-cadena-40000-results.json`: fase-reversa fixed **80/80** · cert-contable **51/51** · faseE saldo físico **27/27** (2222 intacta) · faseB devoluciones **86/86** (recalibrada a la cadena extendida: B4b fail-closed por tasa indeterminada — más preciso que el tope; B6c reversión exige recuperación y libera legítimamente con ella — neto 4000 conciliado; T10 10 USD exactos por tasa histórica; B7e reversión concurrente con recuperación) · seguridad **14/14** (ACL efectiva, SECURITY DEFINER + search_path + actor explícito, cadena 2222 conservada). **Carrera núcleo de la misión** (doble reembolso de la MISMA venta): devolución+devolución concurrente ajustada **0/12 doble pase** — el lock de fila de la venta (DF-07) serializa y releé correctamente. Tests locales nuevos: 13 contrato de migración + 7 ruta devoluciones (AS_PAID + errores) + 6 ruta reverse (recovery + guards) + 5 modal de recuperación = **31**; suites relacionadas existentes 158/158. tsc 0 · eslint 0 errores · auditoría estática **CONTRATO OK** (2 warnings preexistentes de frescura) · BOLA 5/5 · TS security checks ✓.

### 18.5 Cambios y archivos

- **`supabase/migrations/20261024400000_devoluciones_recuperacion_reversa.sql`** (NUEVA, consecutiva de 23000): 10 funciones — `reverse_devolution`/4 nueva (recuperación atómica + compensación de crédito + retiro del overload /3 anti-PGRST203) · `create_devolution_v2`/12 (tope por dinero + AS_PAID + tasa histórica + tope de crédito) · `get_cash_currency_summary` §7b · `validate_payment_transactions_invariants` · `close_cash_shift` · `get_cash_shift_expected` · `get_cash_flow_summary` · `get_cash_report` · `get_cash_ledger` (rama 6b) · `reverse_cash_flow_document`. Generada por gen-migracion-cierre.mjs (reemplazos quirúrgicos con assert de coincidencia única: cuerpos VIVOS verbatim + stream 2222/23000). Sin DDL de esquema. ACL service_role-only con firmas reales.
- **App**: `/api/devolutions` (AS_PAID + mapRpcError con 6 códigos nuevos) · `/api/reverse` (schema+envío `recovery`, 422/409 accionables) · `useReverseDocument` (recovery) · `ReverseDocumentModal` (panel de recuperación: importes fijos por moneda, riel, a11y) · `DevolutionsView` (AS_PAID solo efectivo, moneda habilitada en rieles, composición del pago + reembolsable por moneda) · `/api/cash-flow/ledger` + `build-ledger.ts` (`recuperacion_devolucion` como entrada).
- **`ci-gate-allowlist.json`**: baselines nuevas `reverse_devolution/3` (LIVE_FUNCTION_NOT_REPRESENTED) y `close_cash_shift/6` (BODY_DRIFT); razones de `create_devolution_v2/12` y `reverse_cash_flow_document/3` actualizadas a la cadena extendida. Las 4 expiran al aplicar la cadena o 2027-01-31.
- **Evidencias**: `evidence/fase-reversa-{current,fixed}-results.json` · `evidence/regresion-cadena-40000-results.json` · `evidence/faseB-devoluciones-fixed-40000-results.json`.

### 18.6 Estados (separados) y plan de aplicación futura (NO ejecutado)

Código del PR: **NO fusionado** · despliegue: **ninguno** · producción: **solo lecturas** (censo de devoluciones/filas/trigger + cuerpos; sin registrar devoluciones de prueba) · migración 1818: **aplicada** (no re-ejecutar) · migraciones 2222/23000/40000: **preparadas y probadas en aislamiento con la cadena completa, NO aplicadas**. Plan autorizado (mismo protocolo §15): ① merge del PR → ② aplicar en ORDEN 2222 → 23000 → 40000 (transacción única cada una, pre-vuelo fail-closed: cuerpo esperado + firma única + 0 consultas activas) → ③ post-verificación read-only (patrones presentes/ausentes, ACL, arqueo con recuperaciones en 0) → ④ re-exportar `contract-surface.sql` y retirar las 4 baselines → ⑤ smoke de libro/arqueo/devoluciones en producción desplegada. Reversión: cuerpos previos re-aplicables; filas recovery quedan como historia (el ledger las explica como entradas).

### 18.7 Limitaciones y residuales (decisiones del propietario)

1. **Carrera sub-~2ms entre dos writers del cajón (preexistente, sistémica)**: dos operaciones que escriben el cajón (p.ej. egreso ordinario + reembolso; también egreso+egreso) lanzadas con desfase <~2ms pueden ambas pasar la validación física por agregado (reproducida 5-7/12 en aislado en 23000 y en 40000 — NO introducida por esta misión; micro-carrera mínima 20/20; ≥5ms de desfase: rechazo correcto 6/6). El **núcleo de esta misión NO está afectado**: doble reembolso de la misma venta = 0/12 (lock de fila de la venta, releído). Correctivas estructurales (ambas exceden el alcance quirúrgico): (a) fila de saldo materializado por tienda (todo writer la toma `FOR UPDATE` y la actualiza — el re-read de fila ve la versión última), o (b) aislamiento SERIALIZABLE con reintentos en los writers de caja. **Decisión del propietario.** Entre tanto, la ventana práctica es ínfima (2 RPCs dentro de 2ms sobre la misma tienda).
2. **Devolución total de venta con descuento global**: el precio del reembolso se fija por `price_at_sale_cup` por ítem (doctrina v2.24.1 servidor) — con descuento, el valor devuelto bruto puede exceder el neto pagado y el tope lo bloquea (fail-closed, nunca sobre-reembolso). Regla de prorrateo pendiente de decisión de política.
3. **12 devoluciones históricas (ago 2026) sin traza financiera** (pre-v2.24.1): ni filas refund ni contra-asientos — no cuentan en tope ni libro (consistente entre ambas fuentes). Conciliación documental de ese período: ámbito del propietario.
4. **Recuperación parcial sin reversión** (cliente devuelve solo parte del reembolso, devolución en pie): no implementada por diseño (la recuperación solo existe atómica con la reversión; misión §4 opción adoptada). Necesitaría política de créditos/recibos.
5. Pendientes previos: E2E Playwright (deshabilitado por el propietario — no simulado), fusión del PR, aplicación autorizada de la cadena.

### 18.8 Declaración final del ciclo

**APTO PARA REVISIÓN:** el riesgo nuclear de esta misión está cerrado y probado en aislamiento con la cadena completa: ninguna reversión libera tope sin recuperación real de la moneda correcta (RC1/RC2/RC3), la devolución mixta tiene flujo único probado de punta a punta (RC4), el reembolso USD devuelve exactamente lo cobrado a la tasa histórica (RC5) y el crédito de tienda compensa y respeta su tope (RC6). Matriz 80/80 + regresión íntegra (51/51 · 27/27 · 86/86 · 14/14) + gates verdes (tsc/eslint/contrato/BOLA/TS-security) + 31 tests nuevos. Pendiente exclusivo del propietario: fusión del PR #1470, aplicación autorizada 2222→23000→40000 (protocolo §15/§18.6), y las decisiones de §18.7. No se fusionó, no se desplegó, no se ejecutaron escrituras en producción.

## 19. Adenda INTEGRAL — Serialización commit-coherente del cajón (2026-10-24T12:2xZ)

Misión «AUTÓNOMA INTEGRAL» tras el merge del PR #1470 (main a4a43df, CI todo verde). El propietario delegó la ejecución completa: fusión autónoma de PRs adicionales, despliegue, aplicación de la cadena y certificación. Esta adenda cierra el residual §18.7.1 (carrera sub-2ms entre escritores del cajón) con la correctiva estructural exigida por la misión §3.

### 19.1 Estado inicial verificado (§2)

- main = a4a43df (merge del PR #1470, 2026-10-24T11:05Z) sin commits posteriores; Vercel check success en el commit; costpro4.vercel.app HTTP 200.
- Migraciones (verificación verbatim por comparación de cuerpos vivos vs cadena — `estado-migraciones.py`, evidencia `estado-migraciones-vivo-20261024.json`): `20261024180000` APLICADA (create_cash_flow_document vivo == cuerpo 18000 verbatim) · `20261024220000/230000/400000` NO APLICADAS · cp-money-002 (20261025120000+130000) APLICADAS por el propietario (create_sale_v2/32 vivo). Nota metodológica: los mensajes «ERR_INSUFFICIENT_CURRENCY: ... egreso=%» existen desde v2.24.0 con semántica canónica (v_amount_cup > v_expected_cash); el patrón 2222 se distingue por el chequeo nativo (v_amount > v_balance_currency) — la comparación verbatim es la única evidencia concluyente.
- 6 baselines de caja en ci-gate-allowlist.json (5 previas + register_supplier_payment/12 nueva).

### 19.2 Fase A — Causa raíz DEMOSTRADA y correctiva estructural

**Mecanismo (residual §18.7.1, ahora con repro determinista)**: el advisory lock por tienda SÍ serializa las escrituras del cajón; la carrera vivía en la VENTANA DE LECTURA. Las lecturas de autorización agregan con `<= now()` y `now()` es el INICIO DE LA TRANSACCIÓN DEL LECTOR. Con desfase <~2ms el orden de inicio y el orden de adquisición del lock pueden invertirse: el lector que empezó ANTES y adquirió el lock DESPUÉS del commit ajeno NO ve las filas confirmadas del otro — quedan fuera de su ventana (timestamp > now() del lector). Evidencia: experimento `ventana-decisiva.mjs` (evidencia/faseA/) — reproducible al 100%: cB (empezó antes, lock después) valida contra el saldo PRE-cA y ambos egresos pasan → físico −1000. La micro-carrera «20/20» del expediente anterior era un experimento con umbral mal calibrado (permitía ambas por diseño); la reproducción 1/12 con funciones reales (R1 #7, net −1000) era genuina y este mecanismo la explica.

**Correctiva (misma fuente de verdad — el ledger — sin saldos materializados que requieran reconciliación)**:

1. **Lecturas de autorización ancladas al lock**: upper bound `'infinity'::timestamptz` en TODOS los agregados que autorizan salidas (create_cash_flow_document 7+2 · reverse_cash_flow_document 7+1 · create_devolution_v2 3 · close_cash_shift 11+1 · get_cash_shift_expected 9). Todo movimiento confirmado es un hecho físico YA ocurrido; la lectura post-lock ve todo lo confirmado (coherente con el orden del lock). Los REPORTES (get_cash_ledger / get_cash_report / get_cash_flow_summary) conservan su contrato as-of. Los stamps de hechos (closed_at, annulled_at, payment_date de compensaciones) siguen siendo now(). La validación semántica de fechas futuras (v_op_date > now()) se conserva.
2. **Todos los reducers del cajón bajo el MISMO protocolo** (advisory por tienda ANTES de las lecturas que autorizan la salida, mantenido hasta commit): `register_supplier_payment` (ANTES sin lock NI validación física — los pagos a proveedor/comisión en efectivo podían dejar el físico negativo solos o en carrera con egresos; ahora advisory + validación por moneda) · **NUEVO register_cash_adjustment/7** (reemplaza el INSERT directo de /api/cash-report/adjustments; fila idéntica ref_type='adjustment' CUP + lock + validación física para direction='out' + idempotencia) · **NUEVO pay_commission/7** (reemplaza el UPDATE directo de /api/commissions/payments/[id] y la rama commission de /api/accounts-payable/bulk-pay; marca 'paid' bajo lock + validación física por moneda para efectivo + idempotencia natural + ERR_PAYMENT_DATE_FUTURE en servidor; p_currency/p_exchange_rate preservan la semántica de la ruta).
3. **App**: 3 rutas migradas a los RPCs con fallback documentado si el entorno aún no tiene la migración (degradación limpia, no interrupción). mapRpcError 422/403/409/400 accionables.

**Por qué no un saldo materializado**: habría creado una segunda fuente de verdad que TODOS los writers (incluidos ventas en efectivo, ajustes y comisiones) debieran mantener transaccionalmente; la misión §3 exige no introducirla «sin una estrategia probada de reconciliación». La solución elegida conserva el ledger como única fuente, cierra el hueco temporal de la ventana y unifica el protocolo de bloqueos (advisory → locks de fila → escrituras, sin ciclos).

### 19.3 Batería obligatoria de concurrencia (misión §3) — post-fix

Expectativas pre-calculadas ANTES de ejecutar. BD aislada cajamision (cadena 1818→2222→23000→40000→260000). Invariante global: `saldo físico final por moneda = inicial + entradas confirmadas − salidas confirmadas`, nunca negativo por carrera. Resultados (evidencia `faseA-concurrencia-postfix-results.json`):

- **T0 mecanismo (ventana-decisiva, 10×)**: cB RECHAZADO con ERR_INSUFFICIENT_CURRENCY — ve el egreso confirmado post-lock. ✅ CERRADO.
- **R1 dos egresos CUP 3000 (físico 5000)**, desfases 0/1/2 ms + estrés 200×: exactamente 1 OK, net 2000. ✅
- **R2 dos egresos USD 60 (físico USD 100 vía ingreso)**: exactamente 1 OK, USD net 40. ✅
- **R3 egreso 3000 + reembolso 3000**, 0/1 ms: exactamente 1, net 2000. ✅
- **R4 egreso 6000 + reversión de ingreso 3000 (físico 8000)**: exactamente 1 (net 2000 o 5000). ✅
- **R5 reembolso + reembolso misma venta**: 1 (lock de fila de la venta). ✅
- **R6 reembolso 4000 (venta A) + egreso 7000 (físico 10000)**: exactamente 1 (net 6000 o 3000). ✅
- **R7 devolución + cierre**: arqueo congelado consistente con el ledger (el reembolso o cuenta en el arqueo o se rechaza por turno cerrado — nunca commits sin ser contado). ✅
- **R8 reintentos simultáneos misma clave idempotente**: exactamente 1 documento. ✅
- **R9 egreso 3000 + pago a proveedor en efectivo 3000**: exactamente 1, net ≥ 0 (ANTES: supplier payment sin lock NI validación). ✅
- **R10 egreso 3000 + ajuste out 3000**: exactamente 1, net 2000 (ANTES: INSERT directo sin lock ni validación). ✅
- **R11 egreso 3000 + pago de comisión en efectivo 2400**: exactamente 1, net ≥ 0 (ANTES: UPDATE directo sin lock ni validación). ✅

**FASE A POST-FIX: 16 PASS · 0 FAIL · 0 defectos.**

### 19.4 Regresión íntegra con la cadena extendida (evidencia `regresion-cadena-260000-results.json`)

BD reconstruida desde cero por suite (UUIDs fijos): fase-reversa FIXED 80/80 · cert-contable 51/51 · faseE saldo físico 27/27 · faseB devoluciones 86/86 · faseE seguridad 14/14 · batería Fase A 16/16. Gates: tsc 0 errores · eslint 0 errores en rutas modificadas · contrato estático CONTRATO OK (0 divergencias con baseline register_supplier_payment/12) · 3809 tests de app (+11 nuevos de contrato de migración) todos verdes.

### 19.5 Residuales nuevos (documentados, no corregidos por decisión de alcance)

1. **Pagos de comisión `mixed`**: el libro (término v_comm) solo cuenta payment_method='cash' — un pago mixto de comisión no participa del físico en la fórmula vigente (gap contable PREEXISTENTE). El RPC valida estrictamente 'cash' para no alterar la aceptación de 'mixed'; la incorporación de mixtos al libro requiere decisión de fórmula del propietario.
2. Restos previos §18.7.2-4 (prorrateo de descuento global, 12 devoluciones históricas sin traza, recuperación parcial sin reversión) — sin cambios.
3. E2E Playwright: sigue deshabilitado por el propietario (no simulado).

### 19.6 Fase D — Aplicación de la cadena a PRODUCCIÓN (protocolo §6 completo)

Cada migración aplicada vía Management API como UNA query (transacción única implícita) con: backup verificable de definiciones previas (`/download/backup-pre-cadena-caja-20261024/manifest-*.json`), precondiciones del estado vivo, ventana tranquila (0 escrituras de caja en 5 min), post-verificación inmediata (patrones/firmas/ACL):

1. **20261024220000** — aplicada y verificada (create_cash_flow_document + reverse_cash_flow_document con físico por moneda; 2 backups).
2. **20261024230000** — aplicada y verificada (create_devolution_v2 con tope y físico por moneda).
3. **20261024400000** — aplicada y verificada (reverse_devolution/4 única con p_recovery jsonb · recovery atómica · AS_PAID · tasa histórica · 10 backups). Nota: la primera post-verificación abortó por un REGEX del propio script (buscaba el nombre del parámetro en la firma renderizada); la verificación independiente confirmó la firma correcta `reverse_devolution(uuid,text,uuid,jsonb)` y las 6 funciones del módulo con firma única (anti-PGRST203).
4. **20261026000000** — aplicada y verificada (infinity en los 5 writers · register_supplier_payment con lock+validación · register_cash_adjustment + pay_commission creadas · 6 backups).

### 19.7 Fase E — Contrato vivo, ACL efectivos y baselines

- Contrato de seguridad EN VIVO (`security-contract-test.cjs` contra producción): 0 CRITICAL · 0 HIGH · 3 MEDIUM `ANON_EXECUTE_GRANTED` (reverse_devolution/4 heredó default privileges al crearse; register_cash_adjustment + pay_commission — el `REVOKE FROM PUBLIC` de 260000 no alcanza los default privileges de Supabase, que son grants EXPLÍCITOS por rol).
- **Correctiva 20261026100000_caja_acl_anon_revoke.sql** (PR #1475): REVOKE anon explícito en las 3; reverse_devolution/4 a service_role-only (la app la invoca con el cliente admin); las nuevas conservan authenticated+service_role (autorización real por has_store_role_as dentro). Aplicada a producción y verificada (anon_exec=false ×3). El check CI `SQL DB Security Checks` pasó tras la aplicación (antes fallaba por el drift — orden aplicado→verificado→fusionado documentado en el propio PR).
- **Surface re-exportado**: `contract-surface.sql` con 152 funciones (150 + register_cash_adjustment + pay_commission), sha256 1b85bafd…a5384.
- **Verbatim final**: las 7 funciones del módulo (create_cash_flow_document, reverse_cash_flow_document, create_devolution_v2, reverse_devolution, close_cash_shift, get_cash_shift_expected, register_supplier_payment) coinciden VERBATIM con la cadena aplicada; las 2 nuevas viven idénticas al cuerpo de 260000 (diferencia solo de render de tipos en la firma, timestamptz→timestamp with time zone).
- **Baselines RETIRADAS**: las 6 de source_of_truth_baseline (5 de caja + register_supplier_payment/12) — contrato estático CONTRATO OK con 0 divergencias SIN exenciones. Ninguna baseline ajena al módulo fue tocada.

### 19.8 Fase F — Validación operativa del despliegue (lecturas, sin efectos financieros)

- Despliegue: PR #1474 fusionado (82a7129) → Vercel success en el commit → costpro4.vercel.app sirve el código fusionado; PR #1475 fusionado (09f848e) → Vercel success.
- **GET /api/cash-flow/ledger (ENERVIDA, producción real)**: HTTP 200 · 121 filas (truncated señalizado) · net CUP 8.435.679,98 · net USD 367 · balance_now reconciled:true — EXACTO a la línea base certificada del incidente original (§16). Desglose: venta_efectivo 114 · anticipo_produccion 3 · reembolso_devolucion 2 · pago_proveedor 1 · comision 1 (la fila del incidente, presente y única).
- **GET /api/devolutions (ENERVIDA)**: HTTP 200 · 2 devoluciones completed.
- **Reconciliación SQL por moneda** (función autoritativa): net as-of-now == net total-físico (infinity) = CUP 8.435.679,98 · USD 367 (sin filas futuras en producción, la ventana no distorsiona) · directions ENERVIDA: 583 in · 0 out · 2 refunds · 0 recoveries.

### 19.9 Fase H — Incidencias históricas (solo lectura)

17 devoluciones totales (16 completed + 1 reversed). 4 con fila refund (post-v2.24.1). **13 sin traza financiera** (12 completed + 1 reversed), todas de agosto 2026, tienda d1c4ba0e…: VERIFICADO que carecen de `original_transaction_id` (modelo pre-v2.24.1) → la venta original, su moneda y el importe pagado NO son reconstruibles con evidencia del sistema → **indeterminables** (documentadas como incidencias de conciliación; sin contra-asientos retroactivos, sin alterar saldos). No cuentan en tope ni libro — consistente entre ambas fuentes. Anomalía puntual documentada: una de 349.650,00 CUP frente a hermanas de 350,00 (dato de entrada histórico, no corregido).

### 19.10 Declaración final de la misión integral

**CERTIFICACIÓN COMPLETA DEL ALCANCE PROBADO.** El código fusionado (82a7129 + 09f848e) está desplegado (Vercel success en ambos commits de fusión; dominio de producción responde); la cadena completa 20261024220000 → 20261024230000 → 20261024400000 → 20261026000000 → 20261026100000 está APLICADA a producción y verificada (patrones, firmas únicas, ACL efectivos, verbatim); los saldos físicos por moneda no pueden quedar negativos por concurrencia entre las operaciones cubiertas (mecanismo de ventana demostrado y cerrado; batería 16/16 con desfases 0/1/2ms y estrés 200×); las devoluciones y recuperaciones representan fielmente el dinero (cadena 23000/40000, matriz 80/80); ningún límite de reembolso se libera sin recuperación financiera (RC1-RC3); los pagos mixtos se devuelven por el flujo AS_PAID probado (RC4); el crédito de tienda compensa y respeta su tope (RC6); los reportes, arqueos y libros están reconciliados (producción: ledger 200, reconciled:true, as-of == total); permisos, ACL y aislamiento intactos (14/14 en aislado, 0 CRITICAL/HIGH en vivo, anon revocado); todas las suites críticas pasan (80/51/27/86/14/16 + app 3809 + CI verde en ambos PRs); los defectos históricos no reconstruibles están documentados sin alterar datos (§19.9); el expediente refleja lo desplegado y probado.

Distingo de evidencia: las verificaciones de producción de este ciclo son LECTURAS (ledger/devoluciones/SQL) sin efectos financieros; las pruebas mutativas se ejecutaron en BD aislada reconstruida desde cero. Limitaciones reales: E2E Playwright deshabilitado por el propietario (no simulado); residuales §19.5 (mixto de comisiones no contabiliza el físico — fórmula preexistente; prorrateo de descuento global; recuperación parcial sin reversión).
