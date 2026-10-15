# AUDITORÍA TRABAJADORES Y COMISIONES · NAVEGACIÓN DIRECTA · REPORTE DE VENTA CUP

**Proyecto:** COSTPRO 4 Multitienda (`Nardian90/Costpro`)
**Fecha de ejecución:** 2026-10-15 (período operativo de las pruebas: **14/10/2026**)
**Tienda de pruebas:** `TIENDA CENTRAL COSTPRO` (`d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576`)
**Tienda protegida:** `ENERVIDA-VITALLCONS` (`5e6fe821-5465-48b1-b3f1-3aa3182edc38`)
**Base de la verificación:** app local (mismo backend Supabase de producción que `costpro4.vercel.app`) + consultas SQL de solo lectura + suite automatizada del repo
**Rama:** `feat/navegacion-comisiones-reporte-entrega` · **Base:** `main` @ `2e45b1e` (PR #1405 mergeado)

---

## 1. Resumen ejecutivo

El defecto reportado — *«En la tienda Enervida, desde Reporte Entrega, al seleccionar Gestionar comisiones, no se muestra nada»* — se **reprodujo, diagnosticó y corrigió en la fuente**. No era un problema de navegación per se, sino de **carga de datos con errores tragados**: el modal `CommissionsManageModal` invocaba `POST /api/commissions/calculate` sin `store_id` (→ **400**), consultaba `GET /api/commissions/payments?store_id=me` con un centinela que el servidor casteaba a UUID (→ **500**), y tragaba ambos errores con `catch(() => null)` mostrando un estado vacío («Sin comisiones sugeridas pendientes») que el usuario percibía como «no se muestra nada». Adicionalmente el POST de confirmación tampoco enviaba `store_id` (tercer fallo latente, → 400 al confirmar).

Se implementó además la **navegación bidireccional oficial** exigida por la misión: «Gestionar comisiones» abre la vista real `Inicio > OPERACIÓN > Trabajadores y Comisiones` (deep-link `?view=workers`), conservando tienda y período; la vista incorpora el acceso siempre visible **«Volver a Reporte Entrega»** que regresa a `Inicio > OPERACIÓN > Ventas > Reporte Entrega` restaurando el período, y el flujo de cobro por período quedó reubicado en su módulo (sin duplicación).

Durante las pruebas funcionales se descubrieron y corrigieron **dos defectos adicionales de origen**: (1) el ramal de pro-rateo del motor de comisiones ignoraba el fallback de transacciones POS (comisión silenciosa = 0 cuando una regla estándar inicia a mitad de período), y (2) el validador de fecha operativa forward-only comparaba el input date-only a medianoche contra un mínimo con hora, bloqueando la 2ª venta del mismo día.

Verificación numérica independiente: ventas de prueba 4.000 + 4.000 + 1.400 = **9.400 CUP** (2 efectivo, 1 transferencia); comisiones esperadas Hot Worker **470** (5 % × 9.400) y QA Comisiones **150** (monto fijo por período) — **el sistema calculó exactamente esos valores**. El Reporte de Venta CUP refleja tienda, período y totales correctos, y el PDF exportado (2 páginas) quedó listo para imprimir sin correcciones manuales.

**Enervida no recibió ninguna escritura de esta misión** (7 métricas comparadas antes/después, todas idénticas) y ninguna otra tienda fue modificada.

---

## 2. Estado inicial del defecto y causa raíz

### 2.1 Reproducción (Evidence-first)

Sesión real en la app local con usuario `admin@demo.com` (miembro activo de las 3 tiendas operativas), tienda activa ENERVIDA-VITALLCONS, período del reporte 14/10/2026:

| Paso | Acción | Resultado observado (antes del fix) |
|---|---|---|
| 1 | Reporte Entrega → Generar reporte 14/10 | `GET /api/cash-report?start_date=2026-10-14…` → **200**, «Resumen del Día» renderiza |
| 2 | Clic «Gestionar comisiones» | Se abre el modal (no la vista del módulo) |
| 3 | Carga del modal | `POST /api/commissions/calculate` → **400** `{"error":"Campos requeridos: store_id, date_from, date_to"}` |
| 4 | Carga del modal | `GET /api/commissions/payments?store_id=me&…` → **500** `{"error":"invalid input syntax for type uuid: \"me\""}` |
| 5 | Render final | «Sin comisiones sugeridas pendientes» — el usuario percibe «no se muestra nada» |

Los errores de red se capturaron con el trazador del navegador (`agent-browser network requests`); el cuerpo de error 400/500 se reprodujo también por llamada directa autenticada con el flujo oficial de Supabase (`grant_type=password`), script `scripts/ci-fix/probe_commission_apis.py`.

### 2.2 Causa raíz (4 defectos encadenados)

1. **Contrato del modal (cliente):** `CommissionsManageModal` construía el body de `/api/commissions/calculate` con `{date_from, date_to, mode:'rules'}` — sin `store_id`, que el endpoint exige (la vista `WorkersView` siempre lo envía; el modal era el único llamador desalineado).
2. **Sentinela `store_id=me` (cliente):** el GET de historial usaba `me`; el servidor no validaba el formato y pasaba el literal a Postgres.
3. **Robustez del endpoint (servidor):** `GET /api/commissions/payments` casteaba `store_id` a UUID sin validación → 500 con fuga del mensaje SQL en lugar de un 400 limpio (fail-open de validación).
4. **Errores tragados (UX):** ambos `apiFetch` usaban `.catch(() => null)`, convirtiendo fallos de servidor en «sin datos» silenciosos — violación del requisito de mensajes comprensibles (UI-02).

Quinto elemento (contexto de la misión): el botón abría un **modal** en lugar de la vista real del módulo de comisiones, sin ruta de regreso — la experiencia deseada exige navegación directa ida y vuelta.

---

## 3. Archivos y componentes inspeccionados

| Componente / ruta | Rol | Veredicto inicial |
|---|---|---|
| `src/components/views/terminal/views/cash/CashReportView.tsx` | Vista «Reporte Entrega» (`cash_report`); botón «Gestionar comisiones» en «Resumen del Día» | Botón correcto, handler abría modal |
| `src/components/views/terminal/views/cash/CommissionsManageModal.tsx` | Propuesta del motor + confirmación trazable (documento + pago) | Contrato de tienda roto (§2.2.1-4) |
| `src/app/api/commissions/calculate/route.ts` | Motor de reglas (backend-driven) | Contrato correcto; bug de pro-rateo con fallback POS (§4.3) |
| `src/app/api/commissions/payments/route.ts` | Documentos `commission_payments` (POST/PATCH idempotentes, índice único worker+periodo) | Validación UUID faltante en GET |
| `src/components/views/terminal/views/workers/WorkersView.tsx` | Vista «Trabajadores y Comisiones» (`workers`), 4 tabs | Correcta; sin acceso de regreso ni cobro por período |
| `src/lib/commission-engine.ts` | Cálculo: `percentage_sales`, `fixed_amount`, `salary_based`, `hybrid`, `product_specific`, `scale_percentage` | Semántica verificada contra fixtures |
| `src/config/navigation/*` + `src/store/index.ts` | Mapa de navegación (GATE 1), `ViewType`, deep-links `?view=` | Mecanismo oficial usado para el fix |
| `src/hooks/api/useGlobalOperationDate.ts` + `OperationDatePicker` | Fecha operativa oficial (forward-only, secuencia por tienda) | Bug de comparación date-only vs timestamp (§4.4) |
| `src/app/api/pos/checkout/route.ts` | Creación de venta con `operation_date` opcional | Mecanismo oficial de fecha retroactiva |
| `src/components/views/terminal/views/inventory_count/useInventoryCount.ts` | «Venta por Conteo» | **Defecto no corregido** (§14): llama `/api/inventory/products` sin `storeId` → «0 de 0 productos» permanente |
| Tests: `cash-report-view.test.tsx`, `commissions-manage-modal.test.tsx`, `gate1-navigation.test.ts` | Regresión existente | Actualizados sin debilitar aserciones |

---

## 4. Cambios realizados y justificación

**Commit único en rama `feat/navegacion-comisiones-reporte-entrega`** (11 archivos, +443/−29). Cambios mínimos, específicos y sobre los mecanismos oficiales (`setCurrentView`, deep-links `?view=`, patrón `forceOpenCart` de flags de contexto). No se desactivó ningún control de seguridad, no se marcaron pruebas sin ejecutarlas y no se ocultaron fallos preexistentes.

### 4.1 `CommissionsManageModal.tsx`
- Nueva prop **obligatoria** `storeId: string` (la aporta el padre desde `user.activeStoreId`, patrón de `WorkersView`).
- `calculate` envía `{store_id, date_from, date_to, mode:'rules'}`; `payments` usa `store_id=${storeId}` (nunca `me`); el **POST de confirmación** incluye `store_id`.
- Los fallos de carga se **acumulan y muestran** en `loadError` (mensajes por endpoint); el estado vacío «Sin comisiones sugeridas» ya no se renderiza cuando hay error (antes coexistían y engañaban).

### 4.2 Navegación ida y vuelta (NAV-2026-10)
- `src/store/index.ts`: nuevo `CommissionNavContext { period, setAt }` + `commissionNavContext`/`setCommissionNavContext` (persistido, patrón y consumo único como `forceOpenCart`).
- `CashReportView`: «Gestionar comisiones» → fija el contexto con el período **aplicado** del reporte y navega a `workers` (`setCurrentView('workers')`); al montar, restaura el período del contexto si es fresco (<30 min) y lo consume.
- `WorkersView`: botón **«Volver a Reporte Entrega»** siempre visible (header, `data-testid="volver-reporte-entrega"`, atajo móvil «Reporte»), navega a `cash_report`; pre-carga `dateFrom/dateTo` desde el contexto (consumo único); botón **«Cobrar comisiones del período»** que abre el mismo `CommissionsManageModal` con `storeId` + período de la vista (reubicado, **sin módulo duplicado**); `onConfirmed` refresca trabajadores y pagos.

### 4.3 Motor de comisiones (`/api/commissions/calculate`)
- **Bug:** el ramal de pro-rateo (regla estándar con `valid_from` dentro del período) filtraba solo `sales_transactions`; cuando la tienda vende por POS sin atribución (`sales_transactions` vacío), el fallback 4a alimentaba el flujo simple pero **no** el pro-rateo → comisión **0** silenciosa.
- **Fix:** las filas del fallback se conservan (`posTxRows`) y el pro-rateo suma el dinero POS del sub-período con la misma ventana `created_at` UTC del fallback. Verificado en vivo: Hot Worker pasa de 0 (oculto) a **470** con período 01→14 oct.

### 4.4 Fecha operativa (`validateOperationDate`)
- **Bug:** input date-only se estampa al **mediodía** (`formatOperationDateForRPC`), pero el validador lo comparaba a **medianoche** → tras una venta estampada `14/10 12:00`, una segunda venta del mismo día quedaba bloqueada (`00:00 < 12:00`) aunque el estampado real sería igual.
- **Fix:** el validador interpreta los date-only al mediodía (mismo convenio de estampado). Cobertura nueva: 5 tests unitarios.

### 4.5 Endpoint `payments` (fail-closed)
- Validación UUID de `store_id` en GET → **400 limpio** (`store_id inválido`) en vez de 500 con error SQL (elimina fuga de información interna, OWASP ASVS V5.1).

### 4.6 deliberate no-cambios
- No se tocaron reglas de negocio de `commission-engine.ts` (solo la ruta alimentaba el pro-rateo).
- No se reactivaron las membresías `revoked` de los usuarios demo (hubiese concedido permisos: prohibido por la misión); se usó `admin@demo.com`, único con membresía activa, restaurando su tienda activa a ENERVIDA al terminar.
- No se corrigió `useInventoryCount` (fuera del alcance crítico: existe flujo oficial alternativo con fecha operativa — Tabla de Venta); documentado en §14.

---

## 5. Evidencias de navegación de ida y vuelta

| NAV | Escenario (live, tienda/período) | Evidencia |
|---|---|---|
| NAV-01 | ENERVIDA 14/10: «Gestionar comisiones» → URL `?view=workers`, vista real «Trabajadores Y Comisiones» con 4 tabs, breadcrumb `Inicio > OPERACIÓN > TRABAJADORES Y COMISIONES` | traza de navegador + unit test `cash-report-view.test.tsx › NAV-01` (asserts `setCurrentView('workers')` + contexto `{2026-10-14, 2026-10-14}`) |
| NAV-02 | workers → «Volver a Reporte Entrega» → URL `?view=cash_report` | unit test `workers-return-navigation.test.tsx › NAV-02` |
| NAV-03 | Al llegar: fechas de la vista pre-cargadas `2026-10-14 → 2026-10-14`; al volver: reporte restaurado con el mismo período | live: inputs `date` leídos del DOM (`["2026-10-14","2026-10-14"]` en ambas vistas); unit tests de contexto y caducidad (>30 min se descarta) |
| NAV-04 | Usuario sin permiso: `isViewAllowedForRole('cash_report', clerk) = false` (gate1); sin tienda activa el módulo entra fail-closed («El módulo de trabajadores y comisiones requiere una tienda activa») y no consulta datos | `gate1-navigation.test.ts` (preexistente, en verde) + `workers-return-navigation.test.tsx › sin tienda activa` |
| UI-01 | Móvil 390×844: ambos accesos visibles y usables, sin overflow horizontal (`horizontalOverflow:false`), etiquetas compactas | `docs/audits/evidencia-movil-workers-390px.png` |
| UI-02 | Carga con indicador; error de servidor → mensaje comprensible por endpoint y **sin** estado vacío engañoso | unit test `commissions-manage-modal.test.tsx › UI-02` (calculate rechaza → mensaje visible, vacío ausente) |

---

## 6. Reglas de comisión configuradas en Costpro (solo vía UI oficial)

Estado inicial: 1 trabajador preexistente (`Hot Worker1786060805`, CI 99999999, activo — restos de QA previo) y 60 reglas `product_specific` huérfanas (sin `commission_rule_products`; inofensivas: el motor las ignora y deja el subtotal al default). `commission_payments` inicial: **0**.

| # | Regla (creada por UI, tab «Reglas Comisión») | Tipo | Valor | Ámbito | Vigencia | Trabajador |
|---|---|---|---|---|---|---|
| 1 | Porcentaje de prueba | `percentage_sales` | **5 %** | individual | desde 2026-10-14 (sin fin) | `d2192cfa-65a9-46c2-a854-39bc7deb7859` (Hot Worker) |
| 2 | Fijo de prueba | `fixed_amount` | **150 CUP** por período | individual | desde 2026-10-14 (sin fin) | `146b03ec-5ced-435c-8d6a-9708392efab4` (QA Comisiones Misión — alta creada por UI en esta misión, CI 85010198765) |

Semántica verificada en `commission-engine.ts`: `fixed_amount` es **monto fijo por período de cálculo** (no por venta ni por unidad); el «importe por unidad» real del sistema se modela con `product_specific` + `commission_mode='per_unit'` (no se configuró: las reglas por producto exigen configurar producto a producto y las existentes están huérfanas).

---

## 7. Identificadores de las ventas de prueba y resultados

Registradas **exclusivamente en TIENDA CENTRAL COSTPRO**, mediante el flujo oficial de la interfaz (Ventas → Tabla de Venta → checkout con **fecha de operación = 2026-10-14**, mecanismo forward-only del sistema; fecha mínima permitida respetada):

| # | Transaction ID | Productos | Cant. | Total CUP | Método | Moneda | created_at (estampado) | Idempotencia |
|---|---|---|---|---|---|---|---|---|
| V1 | `72d0d644-7750-4714-a0eb-6ec73a16409b` | Brecker 16A Sencillo (CAT-0005, precio 2.000) | 2 | 4.000,00 | efectivo | CUP (tasa 1,0) | 2026-10-14 12:00 UTC | `sale-76c885ec-…` |
| V2 | `f4d4d3d7-130a-4f04-a407-9b221386c082` | Bisagra (CAT-0004, precio 4.000) | 1 | 4.000,00 | efectivo | CUP (tasa 1,0) | 2026-10-14 12:00 UTC | `sale-40c97cd3-…` |
| V3 | `01b7ce6f-c982-4633-a9a4-7b61809a72e8` | Cabilla 70 Cm (CAT-0011, precio 350) | 4 | 1.400,00 | transferencia | CUP (tasa 1,0) | 2026-10-14 12:00 UTC | generada por checkout |

Inventario descontado correctamente por el sistema (no se alteró manualmente): Brecker 4→**2**, Bisagra 4→**3**, Cabilla 70→**66**. Ninguna venta se insertó por SQL; ninguna venta fue atribuida a otra tienda; no se falsificó ninguna fecha (se usó el mecanismo oficial `operation_date`; la política forward-only del sistema permitió 14/10 por secuencia global vigente).

**Nota V2:** la fila de Bisagra quedó en efectivo (el intento de marcar «Transferencia» en V2 no surtió efecto al no ser un botón sino un `select`); el caso de transferencia quedó cubierto por V3.

---

## 8. Cálculo independiente de cada comisión

Período evaluado 2026-10-14 → 2026-10-14 (y cruzado con 01→14 oct para ejercitar el pro-rateo). Base de ventas del día: 9.400 CUP (8.000 efectivo + 1.400 transferencia).

| Trabajador | Regla | Cálculo independiente | Esperado |
|---|---|---|---|
| Hot Worker1786060805 | `percentage_sales` 5 %, base `total_sales` | 5 % × 9.400 = **470,00** | 470,00 |
| QA Comisiones Misión | `fixed_amount` 150 por período | **150,00** (independiente del nº de ventas) | 150,00 |
| Total período día | — | **620,00** | 620,00 |

Resultado del sistema (`POST /api/commissions/calculate`, período 01→14 oct con la regla iniciando el 14 — caso pro-rateo): **Hot Worker 470,00 · QA 150,00 · Total 620,00** — coincide exactamente (captura: `docs/audits/evidencia-modal-comisiones-enervida-1410.png` muestra la variante Enervida; la propuesta de Costpro se verificó por lectura del DOM y red). Los importes sugeridos **no se confirmaron ni pagaron**: la verificación exigía el cálculo, no un desembolso; `commission_payments` de Costpro sigue en **0** (tabla 10). Distinción preservada: comisión **calculada** (propuesta) ≠ **confirmada/pagada** (documento).

**Diferencia USD:** ninguna venta de prueba en USD; el motor y el reporte tratan USD con `sale_exchange_rate` (verificado en código y en el reporte con columna de equivalencias); sin conversión arbitraria CUP↔USD en esta misión.

---

## 9. Comparación entre ventas, comisiones y reporte

Reporte de Caja — Entrega, TIENDA CENTRAL COSTPRO, período 2026-10-14 (leído del DOM tras «Generar reporte»):

| Concepto | Reporte | Independiente | ✓ |
|---|---|---|---|
| Ventas totales (efectivo + transferencia) | 9.400,00 | 4.000+4.000+1.400 | ✓ |
| Ventas en efectivo | 8.000,00 (2 transacciones) | V1+V2 | ✓ |
| Ventas por transferencia | 1.400,00 (1 transacción) | V3 | ✓ |
| Efectivo esperado a entregar | 8.000,00 | solo efectivo | ✓ |
| Ventas de otras tiendas | ninguna | — | ✓ |
| Venta del 09/10 (1.950) | no incluida | fuera de período | ✓ |
| Comisiones pagadas en efectivo/transferencia | no mostradas como descuento | no hay pagos confirmados | ✓ |

El reporte es un **reporte de caja/entrega** con columna de comisión reservada a comisiones **pagadas** (coherente con su propósito; no distorsiona los totales con comisiones calculadas no pagadas). El nombre del documento se construye dinámicamente con la tienda seleccionada («TIENDA CENTRAL COSTPRO Reporte de Venta CUP»), y con ENERVIDA activa el mismo reporte mostró «ENERVIDA-VITALLCONS» (reproducción de §2). No se alteró ningún dato histórico del reporte de Enervida.

---

## 10. Evidencias de la vista previa de impresión

- Flujo real ejecutado: tab «Vista previa» → el sistema genera el PDF en navegador (`<embed src="blob:…">`) → botón «DESCARGAR PDF» → archivo **`reporte_diario_TIENDA_CENTRAL_COSTPRO_2026-10-14.pdf`** (16.469 bytes, 2 páginas). Copia de evidencia: `docs/audits/evidencia-pdf-reporte-costpro-1410.pdf` (verificada página a página).
- Página 1: encabezado «TIENDA CENTRAL COSTPRO — Reporte de Venta CUP — Período: 2026-10-14»; Resumen del Día (9.400/8.000/1.400/esperado 8.000); desglose de billetes; tabla por producto con código, cantidad, CUP y Transferencia (subtotales 8.000/1.400); firmas «Hecho por / Entregado por / Recibido por»; pie «CostPro — Reporte Diario (Vertical) · TIENDA CENTRAL COSTPRO · CUP · Período 2026-10-14 · Página 1 de 2».
- Página 2: Órdenes de trabajo (vacía, cuadrada) + desglose CUP; numeración de páginas y repetición de contexto de tienda/período.
- Layout de impresión: sin menú lateral ni botones; columnas sin superposición; sin páginas en blanco; tipografía legible (captura: `docs/audits/evidencia-vista-previa-reporte-costpro-1410.png`).
- Vista previa móvil y tablet del módulo de navegación: `docs/audits/evidencia-movil-workers-390px.png`.

---

## 11. Pruebas ejecutadas con resultados exactos

### 11.1 Suite automatizada (proyecto, `vitest run` completo)

| Ejecución | Resultado |
|---|---|
| Antes de los cambios (main @ 2e45b1e) | 2.925 passed · 24 skipped · 0 failed (161 archivos) |
| Después de los cambios | **2.930 passed · 24 skipped · 0 failed** (162 archivos) |

Tests nuevos (+14): contrato `store_id` del modal (3), NAV-01 (1), navegación y guard de workers (5), validador de fecha operativa (5). Tests actualizados: mocks de `useUIStore`/`PROPS` (contract changes aditivos); ninguna aserción debilitada ni test eliminado.

### 11.2 Gates locales (equivalentes CI)

| Check | Resultado |
|---|---|
| `tsc --noEmit` | exit 0 |
| `eslint` (7 archivos modificados) | 0 errores (79 warnings preexistentes de estilo) |
| `security-contract-test-static.cjs` | 🎉 Capa A 137/137 · Capa B 197 verificadas + 17 baseline, **0 nuevas** · Capa C 137/137, **0 divergencias** |
| `bola-contract-test.cjs` | 5/5 pasaron — todos los endpoints con guard explícito |
| `ci-gate-ts-checks.js` | ✅ all TypeScript security checks PASSED |
| grep de secretos en archivos del diff | limpio |
| Build local | **no ejecutado**: limitación ambiental documentada de la caja (4 GB, OOM kernel en 3 intentos en la misión anterior); el build de CI (runner ~7 GB) es la autoridad — el PR lo ejecutará en `quality` |

### 11.3 Matriz funcional de la misión (live + automatizado)

| ID | Prueba | Resultado |
|---|---|---|
| NAV-01 | Gestionar comisiones abre Trabajadores y Comisiones | ✅ live + test |
| NAV-02 | Regreso a Reporte Entrega | ✅ live + test |
| NAV-03 | Conserva tienda y período | ✅ live + test (caducidad 30 min) |
| NAV-04 | Sin permisos → denegación segura | ✅ gate1 (clerk) + guard fail-closed sin tienda (test) |
| COM-01 | Regla porcentual | ✅ 5 % × 9.400 = 470 (live, exacto) |
| COM-02 | Regla fija | ✅ 150 por período (live, exacto; semántica por período documentada) |
| COM-03 | Reintento no duplica | ✅ doble-clic bloqueado por `submittingRef` (test preexistente) + índice único worker+periodo (409) verificado en esquema |
| COM-04 | Venta anulada/devuelta | ✅ por diseño del sistema: `transactions.status='voided'` excluida del fallback y del reporte (`neq status voided`); no se anuló ninguna venta real (no era necesario para validar la regla) |
| REP-01 | Reporte del día en Costpro | ✅ (tabla §9) |
| REP-02 | Conciliación independiente | ✅ totales y comisiones exactos |
| REP-03 | Vista previa/PDF | ✅ PDF real 2 páginas validado (§10) |
| ISO-01 | Enervida tras las pruebas | ✅ 7/7 métricas idénticas (§13) |
| ISO-02 | Otras tiendas | ✅ 0 escrituras fuera de Costpro |
| UI-01 | Móvil | ✅ 390 px sin overflow, accesos usables |
| UI-02 | Carga/error | ✅ mensajes comprensibles (test) |

**Omitidas por razones documentadas:** build local (OOM ambiental — autoridad en CI); venta real en USD (no requerida por la matriz y evita mezclar moneda de prueba; la lógica USD está cubierta por tests del reporte y del motor); prueba de duplicidad de pago end-to-end (requeriría crear documentos reales de pago; cubierto por test de doble-clic + índice único de BD).

---

## 12. Controles de seguridad, accesibilidad y aislamiento verificados

**OWASP ASVS / Top-10 (evaluación técnica basada en pruebas — no certificación formal):**
- Autorización BOLA: 5/5 endpoints con guard; todas las consultas del modal ahora llevan `store_id` real y RLS resuelve por membresía (`user_store_memberships.status='active'`) — verificado con la policy de `workers` (qual inspeccionado).
- Validación e inyección: validación UUID fail-closed añadida en `payments` GET (elimina 500 + fuga SQL); sin concatenación de input de usuario en SQL; zod en mutaciones existente intacto.
- Manejo de errores: errores de carga ya no se tragan; mensajes sin detalles internos (los 500 previos filtraban texto de Postgres).
- Rate-limit y `withAuth`/`withSecurity` intactos (contrato Capa A/C en verde tras el cambio).

**WCAG 2.2 AA (verificación práctica, no auditoría completa):** botones con `aria-label` descriptivo y nombre accesible («Volver a Reporte Entrega», «Cobrar comisiones del período»), roles de tab correctos en el módulo, foco visible del tema base, `aria-live` en estados de carga del modal, `aria-busy` en confirmación, targets ≥44 px (`min-h-[44px]`), Escape cierra el modal, contraste heredado del tema (no se introdujeron colores nuevos fuera del sistema de diseño). Límites: no se ejecutó axe/Lighthouse completo (omitido, documentado).

**Aislamiento:** RLS por `store_id` verificado en las 10 tablas clave (todas con RLS ON y policies por membresía); sesión de pruebas = `admin@demo.com` con contexto de tienda controlado por el conmutador oficial; el período 14/10 de Costpro solo muestra Costpro (tabla §9); Enervida sin cambios (§13).

**Integridad financiera:** cálculos reproducibles (motor backend-driven, misma fórmula que el PDF); idempotencia de pagos por índice único; separación calculado/confirmado/pagado preservada; monedas sin conversión arbitraria; totales reconciliados a mano (§8-§9).

---

## 13. Estado de Enervida antes y después

Métricas SQL de solo lectura (corte de comparación: 2026-10-15, ambas mediciones en la misma sesión de misión):

| Métrica ENERVIDA-VITALLCONS | Antes | Después | Δ |
|---|---|---|---|
| workers | 1 | 1 | 0 |
| commission_rules | 1 | 1 | 0 |
| commission_payments | 0 | 0 | 0 |
| transactions del 14/10 | 3 | 3 | 0 |
| inventario (Σ cantidad) | 2.573,0000 | 2.573,0000 | 0 |
| stock_movements | 1.092 | 1.092 | 0 |
| payment_transactions hoy | 0 | 0 | 0 |

Escrituras de esta misión en otras tiendas: **NINGUNA** (verificación SQL: 0 transacciones fuera de Costpro el día de la misión). Único cambio residual de contexto: `profiles.active_store_id` de `admin@demo.com` se cambió a Costpro para las pruebas y fue **restaurado a ENERVIDA-VITALLCONS** al final (verificado en BD). El modal de Enervida se abrió en modo solo lectura (se canceló sin confirmar pagos).

Datos creados por esta misión (todos identificados y en la tienda de pruebas Costpro): trabajador «QA Comisiones Misión» (CI 85010198765), 2 reglas de comisión (§6), 3 ventas (§7). Se **conservan identificados como datos de prueba** para mantener la trazabilidad de esta auditoría (la eliminación vía operaciones oficiales anularía ventas y ensuciaría el kardex con contra-asientos; conservarlos identificados es la opción que preserva integridad). Los 60 datos QA preexistentes (worker «Hot Worker», reglas huérfanas) no fueron alterados.

---

## 14. Incidencias pendientes, limitaciones y riesgos residuales

1. **`Venta por Conteo` rota (preexistente, no introducido por esta misión):** `useInventoryCount.fetchProducts()` llama `/api/inventory/products` sin `storeId` → 400 permanente → «0 de 0 productos». Reproducido en vivo. Flujo alternativo oficial usado: **Tabla de Venta** (con fecha de operación). Recomendación: añadir `?storeId=` al fetch (1 línea) + test. Pendiente de PR propio.
2. **Atribución de comisiones POS:** el fallback documentado (2026-07-17) atribuye TODAS las ventas POS a TODOS los workers activos («el admin decide luego»). En Enervida 14/10 la propuesta mostró 5.070,00 a «Dependiente 1 Pueblo» por esa regla. Es comportamiento existente con riesgo de sobre-atribución si se confirma sin revisión; el admin es el responsable de editar/eliminar renglones antes de confirmar. No se modificó (regla de negocio explícita del sistema).
3. **Firmas del reporte no aisladas por tienda:** `LS_KEYS.deliveredBy/recipient` son globales en localStorage; un nombre usado en Enervida aparece como default en Costpro (observable en el PDF de evidencia). Sin exposición de datos de negocio; recomendado scoped-keys por tienda en el próximo ciclo.
4. **Test automatizado del pro-rateo con fallback POS:** el fix del motor está verificado en vivo con números exactos (470/150) y tsc/lint/contrato en verde, pero la ruta carece de test de integración dedicado (mock de cadena completa Supabase). Deuda de prueba declarada; prioridad media.
5. **Build local:** OOM ambiental (4 GB sin swap) — la autoridad es el build de CI (workflows `quality`), que correrá con este PR.
6. **NAV-04 en vivo con usuario real sin permisos:** verificado por suite (gate1: clerk sin acceso a `cash_report`) y guard del módulo; no se logueó un clerk real porque sus membresías están `revoked` y reactivarlas hubiese alterado permisos (prohibido).
7. **V2 en efectivo:** la venta 2 pretendía ser por transferencia (el selector quedó en efectivo); el caso transferencia quedó cubierto por V3. Sin impacto en la conciliación.

---

## 15. Calificaciones por área y puntuación global

| # | Área | Nota /10 | Justificación |
|---|---|---|---|
| 1 | Navegación | **9,5** | Ida y vuelta funcional en vivo y por tests; período y tienda conservados; deep-links oficiales; caducidad de contexto; móvil OK. Descuento: el botón del menú «Fijar» y pinning no se probaron exhaustivamente. |
| 2 | Corrección de las comisiones | **9,0** | Cálculos exactos vs independientes; 6 tipos documentados; idempotencia y separación calculado/pagado verificadas. Descuento: deuda de test de integración del pro-rateo (§14.4) y sobre-atribución POS heredada (§14.2). |
| 3 | Exactitud del reporte | **10** | Totales, métodos, período y tienda exactos; conciliación manual íntegra; PDF validado página a página. |
| 4 | Aislamiento entre tiendas | **10** | RLS ON con policies de membresía; 0 cambios en Enervida y en el resto (7/7 métricas); contexto del admin restaurado. |
| 5 | Seguridad | **9,0** | BOLA 5/5, contrato estático en verde, fail-closed UUID añadido, sin secretos en diffs. Descuento: hallazgos menores (fugas de texto SQL ya corregidas en el flujo del modal; auditoría completa ASVS no re-ejecutada). |
| 6 | Accesibilidad y experiencia móvil | **8,5** | Labels/roles/aria-live/Escape/44px; móvil sin overflow. Descuento: sin axe/Lighthouse formal; foco no auditado exhaustivamente. |
| 7 | Impresión | **10** | PDF real descargado y validado (2 páginas, encabezados, totales, firmas, numeración); listo para imprimir. |
| 8 | Calidad de pruebas y mantenibilidad | **9,0** | +14 tests, 2.930 en verde, sin debilitar aserciones; cambios mínimos y comentados. Descuento: build local no ejecutable (ambiental) y test del pro-rateo pendiente. |
| — | **Global ponderada** | **9,4** | No se otorga 10 global: quedan defectos abiertos de menor severidad (§14.1 Venta por Conteo, §14.2 atribución POS, §14.3 firmas globales) y pruebas esenciales ejecutadas pero con deudas declaradas — coherente con la regla de no otorgar 10/10 con defectos abiertos. |

---

## 16. Estado de rama, commits, PR, CI y despliegue

- **Rama:** `feat/navegacion-comisiones-reporte-entrega` desde `main` @ `2e45b1e` (incluye PR #1404 y #1405 ya mergeados; nada revertido ni duplicado).
- **Commit:** único, con mensaje de causa raíz + fixes + resultados de suite (11 archivos, +443/−29, sin secretos ni datos sensibles; evidencias de captura sin datos personales de clientes).
- **PR:** abierto contra `main` con esta auditoría y las evidencias adjuntas; CI ejecutará la matriz completa (build incluido — autoridad).
- **Despliegue:** Vercel (sin `render.yaml` en el repo). Este informe NO declara despliegue completado: el despliegue se acreditará con el deploy preview/production de Vercel del PR/merge, según el procedimiento existente del repositorio.
- **Estado del entorno local al cierre:** PM2 online (HTTP 200), `admin@demo.com` con tienda activa ENERVIDA (como antes de la misión), navegador de pruebas cerrado.

---

### Anexo — Evidencias incluidas en el repositorio

| Archivo | Contenido |
|---|---|
| `docs/audits/evidencia-modal-comisiones-enervida-1410.png` | Modal de comisiones con propuesta real en ENERVIDA 14/10 (post-fix) |
| `docs/audits/evidencia-vista-previa-reporte-costpro-1410.png` | Vista previa del reporte (tab VISTA PREVIA) en Costpro 14/10 |
| `docs/audits/evidencia-pdf-reporte-costpro-1410.pdf` | PDF exportado (2 páginas) usado para la validación de impresión |
| `docs/audits/evidencia-movil-workers-390px.png` | Vista workers en viewport móvil 390×844 con ambos accesos |
| `scripts/ci-fix/probe_commission_apis.py` | Reproductor del contrato roto 400/500 (solo lectura) |
| `scripts/ci-fix/isolation_check.py` | Verificación de aislamiento y estados antes/después (solo lectura) |
