# CP-AP-FORENSIC-RECONCILIATION-001 — INFORME FINAL
**Auditoría forense, conciliación de pagos, antigüedad de saldos y estabilización integral de Cuentas por Pagar**

**Fecha:** 2026-11-25 · **App:** COSTPRO 4 Multitienda · **Tienda auditada:** ENERVIDA-VITALLCONS (`5e6fe821-5465-48b1-b3f1-3aa3182edc38`) ·
**Rama:** `fix/cxap-forensic-reconciliation-20261125` (desde main `36a646158`)

---

## 1. Causa raíz de la diferencia entre los $68,665.00 del indicador y los $0.00 de la tabla

Dos definiciones **incompatibles** de «Pagado» convivían en la misma pantalla (`src/app/api/accounts-payable/route.ts`, versión anterior):

| Componente | Definición que usaba | Resultado en ENERVIDA |
|---|---|---:|
| KPI `totalPaid` | Σ `total_cup` de documentos con `payment_status='paid'` (TOTALMENTE pagados — que la tabla excluía) | $68,665.00 |
| Columna «Pagado» de Por proveedor | Σ `paid_cup` de documentos con `payment_status ≠ 'paid'` (SOLO pagos parciales) | $0.00 (no existían parciales) |

El `continue` que saltaba a los pagados hacía la conciliación **matemáticamente imposible**: la tabla jamás podía exhibir `Total − Pagado = Saldo` respecto al indicador. No era un problema de datos: los 28 documentos pagados concilian al centavo con sus 27 transacciones + 1 comisión por canal propio.

**Corrección:** una única definición canónica (misión §4.1) implementada en el calculador puro `src/lib/accounts-payable/calculator.ts` — `Pagado = Σ pagos aplicados a las obligaciones incluidas en el filtro a la fecha de corte` — consumida por el KPI, la tabla, el detalle y el Excel.

## 2. Desglose documental de los pagos conciliados ($68,665.00)

| Origen | Docs | Importe | Canal |
|---|---:|---:|---|
| Servicios recibidos pagados (26) | 26 | $68,364.00 | 26 filas `payment_transactions` `in` (CUP, cash) |
| Recepción pagada (Juan Carlos, prueba $1) | 1 | $1.00 | 1 fila `payment_transactions` |
| Comisión pagada (Dependiente 1 Pueblo) | 1 | $300.00 | `commission_payments.status='paid'`, `paid_at` 2026-10-15 (canal propio, por diseño) |
| **Total** | **28** | **$68,665.00** | |

Por proveedor: Tienda Pueblo $19,344.00 (20 servicios) · Pedro DTI Etecsa $31,860.00 · Danny Ruiz Perez $6,100.00 · Pixelarte $4,800.00 (2) · Israel Leyva Velazques $5,000.00 · Vendedor $860.00 · TiendaPueblo $400.00 · Juan Carlos $1.00 · comisión $300.00. Los 26 servicios se pagaron el MISMO día de su creación (flujo pago-inmediato de Servicios Recibidos) — los pagos desde Servicios Recibidos SÍ llegan correctamente a Cuentas por Pagar.

**Conciliación verificada a la fecha de corte 25/11/2026:**

| Concepto | Importe |
|---|---:|
| Total (obligaciones incluidas las pagadas) | $3,032,493.90 |
| Pagado (aplicado a esas obligaciones) | $68,665.00 |
| **Saldo = Total − Pagado** | **$2,963,828.90 = Total pendiente ✓** |

## 3. Tabla de obligaciones (total original / pagado / saldo) — verificación independiente

Extraída del sistema en vivo tras la corrección (misma consulta, independientemente reproducible con `scripts/cxap-forensic-audit.mjs`):

| Proveedor | Docs | Total | Pagado | Saldo |
|---|---:|---:|---:|---:|
| Inventario inicial Vitallcons | 1 | $1,034,660.00 | $0.00 | $1,034,660.00 |
| Inventario inicial Vitallcons (electricos) | 1 | $918,000.00 | $0.00 | $918,000.00 |
| Juan Carlos | 5 | $388,878.90 | $1.00 | $388,877.90 |
| Pedro Infante | 3 | $320,000.00 | $0.00 | $320,000.00 |
| Proveedor General | 1 | $200,000.00 | $0.00 | $200,000.00 |
| Tienda Pueblo | 25 | $57,511.30 | $19,344.00 | $38,167.30 |
| Vitallcons | 67 | $29,988.70 | $0.00 | $29,988.70 |
| — (3 recepciones, ver §6) | 3 | $19,435.00 | $0.00 | $19,435.00 |
| Inventario inicial Vitallcons (servicios) | 1 | $13,600.00 | $0.00 | $13,600.00 |
| Laudelina Olivera (Lary) | 4 | $1,098.00 | $0.00 | $1,098.00 |
| Proveedor1 | 1 | $2.00 | $0.00 | $2.00 |
| TiendaPueblo | 1 | $400.00 | $400.00 | $0.00 |
| Vendedor | 1 | $860.00 | $860.00 | $0.00 |
| Pixelarte | 2 | $4,800.00 | $4,800.00 | $0.00 |
| Danny Ruiz Perez | 1 | $6,100.00 | $6,100.00 | $0.00 |
| Israel Leyva Velazques | 1 | $5,000.00 | $5,000.00 | $0.00 |
| Pedro DTI Etecsa | 1 | $31,860.00 | $31,860.00 | $0.00 |
| Dependiente 1 Pueblo (comisión) | 1 | $300.00 | $300.00 | $0.00 |
| **TOTALES** | **120** | **$3,032,493.90** | **$68,665.00** | **$2,963,828.90** |

Antigüedad del saldo (partición exacta): Corriente $54,977.20 · Próx. 7d $556,766.00 · 0-30d $357,370.20 · 31-60d $22,594.00 · 61-90d $1,966,260.00 · 91-120d $5,861.50 · +120d $0.00 → Σ = $2,963,828.90 ✓ · Σ vencidos = $2,352,085.70 ✓ (ambos coinciden con lo observado por el propietario).

## 4. Diferencias detectadas entre documentos, proveedores y resumen

| # | Diferencia | Naturaleza | Tratamiento |
|---|---|---|---|
| 1 | KPI Pagado ($68,665) vs tabla ($0.00) | Presentación (dos semánticas) | **Corregida** — definición única |
| 2 | Tabs de aging no filtraban el modo «Por proveedor» | Presentación | **Corregida** — misma selección en ambos modos |
| 3 | Paginación `range()` POR fuente (truncamiento silencioso >200 docs/fuente; `has_more` roto) | Presentación/latente | **Corregida** — fetch completo por chunks + paginación del resultado |
| 4 | «Hoy» en TZ del servidor (UTC en Vercel), no día de negocio Habana | Presentación/latente | **Corregida** — corte = día de negocio `America/Havana`, comparación de fechas como strings (sin aritmética UTC) |
| 5 | Excel con lógica duplicada divergente | Presentación | **Corregida** — mismo calculador |
| 6 | Error al volver de Detalle a Por proveedor | Presentación (carrera de estado) | **Corregida** — ver §7 |

## 5. Pagos no aplicados, duplicados o anulados

- **Pago de $1,800 sobre un servicio VOIDED sin reversión** (hallazgo de DATOS, NO corregido automáticamente — regla §12):
  servicio `fedb7c40-8f10-48fd-8356-cc7e6a7ce0e7` (F-23112026, Pixelarte) creado 2026-11-23 21:34 y anulado 21:35, con un pago `in` de $1,800 que quedó vivo (la maquinaria de reversión `reverse_supplier_payment` se desplegó a producción el 2026-11-24, posterior al incidente). Existe un servicio ACTIVO gemelo (F-23112026, `602eb3c1`) creado y pagado el mismo día — el usuario creó+pagó, anuló y recreó. **Impacto:** Σ CxP `payment_transactions` = $70,165 vs $68,365 aplicados a obligaciones visibles; caja registra $3,600 a Pixelarte por dos filas de $1,800.
  **Propuesta contable (pendiente de aprobación del propietario, NO ejecutada):** `SELECT public.reverse_supplier_payment('<payment_id>', '<actor>', 'Reversión governance: pago sobre servicio voided F-23112026 (CP-AP-FORENSIC)')` — crea la contra-fila y el asiento compensatorio con trazabilidad en `audit_logs`.
- **Reversiones duplicadas:** 0. **Pagos sobre recepciones voided:** 0. **Anticipos en drafts:** 0.
- **2 pagos con `payment_date` un día anterior a `created_at`** del documento (10-22 vs 10-23 y 10-31 vs 11-01): consistente con fecha de negocio Habana vs medianoche UTC en el flujo pago-inmediato de SR. Se documenta; su corrección pertenece al módulo SR. El cálculo de CxP no se ve afectado (usa fecha-Habana del pago vs corte).

## 6. Tratamiento de registros sin proveedor

3 recepciones con `supplier='—'` (em-dash literal, $19,435, unpaid, creadas 2026-10-12..22) y 0 con NULL. Se agrupan bajo su clave literal «—» (antes y ahora); NO se asignó proveedor ficticio ni se fusionaron (§3.4). Adicionalmente se documenta el quirk de grafía «Tienda Pueblo» vs «TiendaPueblo» (1 servicio $400) — la agrupación por string exacto los mantiene separados, decisión conservadora correcta; la normalización corresponde al propietario.

## 7. Causa raíz del error de navegación (volver de Detalles a Por proveedor)

**Reproducido y erradicado.** Mecanismo: `setViewMode('grouped')` se aplica sincrónicamente mientras `data` aún contiene el array del modo lista (`UnifiedPayable[]`, sin `.aging`) y `loading` sigue `false` → el render intermedio ejecuta `GroupedTableView` → `row.aging.current` → `TypeError: Cannot read properties of undefined (reading 'current')` → `ViewErrorBoundary` mostraba «Error al cargar Cuentas por Pagar» con Reintentar = recargar página (por eso recargar lo arreglaba).

**Corrección en dos capas:**
1. Hook `useAccountsPayable`: guarda de firma (`stale`) — cualquier cambio de parámetros marca la ventana como carga (`loading: loading || stale`) hasta que llegan los datos de la nueva firma; además descarta respuestas obsoletas (`reqId`).
2. Vista: guardas de forma — `GroupedTableView`/`ListView` nunca renderizan filas cuya forma no corresponde al modo (defensa en profundidad).

**Verificado en navegador:** Por proveedor → Detalle → Por proveedor ×4 ciclos (incluyendo cambios rápidos <1.5 s) sin error, sin recarga, con filtros/fechas/categoría preservados; el botón Reintentar permanece solo como mecanismo de recuperación de errores reales de red.

## 8. Cambios realizados (frontend / backend / base de datos)

| Archivo | Cambio |
|---|---|
| `src/lib/accounts-payable/calculator.ts` | **NUEVO** — calculador puro: fuente única de verdad (KPIs, aging a corte sobre saldo, agrupación con pagados, neteo de reversiones, comisiones por canal propio, filtros tab/categoría/método/moneda/búsqueda/proveedor/período, fecha contable por tipo de documento) |
| `src/app/api/accounts-payable/route.ts` | Reescrito sobre el calculador: +`date_from`/`date_to`/`category`/`supplier` validados (Zod, from≤to), fetch completo por chunks de 1000 (elimina truncamiento por fuente), paginación del resultado con `has_more` y `total` correctos, respuesta con `meta{cutoff}` |
| `src/app/api/accounts-payable/export/route.ts` | Refactorizado al MISMO calculador (pantalla = Excel), con fechas y columnas nuevas (fecha documento, estado a corte) |
| `src/hooks/api/useAccountsPayable.ts` | +params de período/categoría/proveedor; guarda anti-carrera `stale`; cancelación de respuestas obsoletas |
| `src/components/views/terminal/views/accounts_payable/AccountsPayableView.tsx` | Filtro de fechas (Aplicar/Limpiar, validación inicial≤final), banner de fecha de corte (+aviso de vista histórica), categoría Todos/Recepciones/Servicios/Comisiones, drill-down por proveedor con «Volver a Por proveedor», guardas de forma, columna «Fecha doc.», conciliación visible |
| `src/components/views/terminal/views/accounts_payable/PaymentHistoryRow.tsx` | Estado del pago (Aplicado/Anulado), saldo restante tras cada aplicación, total aplicado NETO (netea reversiones), prop `totalCup`; fix de HTML inválido (`<tr>` dentro de `<div>` → warning de hidratación) |
| `src/__tests__/lib/accounts-payable-calculator.test.ts` | **NUEVO** — 34 pruebas contables (escenarios A, B, C, E de la misión) |
| `src/__tests__/components/accounts-payable-navegacion.test.tsx` | **NUEVO** — 7 pruebas de navegación/filtros (escenario D) |
| `scripts/cxap-forensic-audit.mjs`, `scripts/cxap-forensic-detail.mjs` | **NUEVOS** — auditoría forense solo lectura, re-ejecutable |
| `supabase/migrations/20261125153000_cxap_revoke_legacy_reception_fns.sql` | **NUEVO** — cierre del hallazgo preexistente `secdef_public_grant` del SQL Security Gate: REVOKE de EXECUTE anon/authenticated en 2 funciones legado huérfanas (ver §11b) |
| `scripts/cxap-apply-revoke-legacy-fns.mjs` | **NUEVO** — aplicador gobernado del REVOKE (guard CP-INFRA-019 + doble flag, validación previa en aislada, marca re-ejecutable) |
| `ci-gate-allowlist.json` | 3 funciones service_role-exclusive añadidas a `security_definer_without_auth_check` (drift de misiones previas: fin_post_payment_annulment, register_supplier_payment_multi, cp_catmaestro001_renumber_auto_masters — ACL verificada en vivo {postgres, service_role}) |
| `scripts/lib/writers.manifest.json` | 2 scripts forenses (exceptions justificadas) + 1 aplicador gobernado (guardProtected) |

**Base de datos: UN ÚNICO cambio de seguridad, gobernado (ver §11b).** Fuera de ese REVOKE, cero migraciones, cero toques a RLS, cero modificaciones de datos históricos. Toda la corrección funcional es de la capa de consulta/presentación sobre los registros reales.

## 9. Nueva lógica de filtros personalizados y fecha de corte

- **Semántica documentada (visible en el expediente y en la UI):** el período `[fecha inicial, fecha final]` selecciona DOCUMENTOS por su **fecha contable** — `receipts.reception_date` (fallback `created_at`), `received_services.service_date` (NOT NULL), comisiones `created_at`. La **fecha final es la fecha de corte** de saldos y antigüedad.
- **Pagos:** cuentan todos los aplicados con fecha-Habana ≤ corte a los documentos incluidos — aunque sean anteriores a la fecha inicial (reconstrucción histórica, §6.2). Los posteriores al corte no afectan. El filtro de fechas de DOCUMENTOS no se mezcla con el de pagos.
- **Corte por defecto:** hoy (día de negocio `America/Havana`). Banner en pantalla: «CORTE 25/11/2026 · Período… · VISTA HISTÓRICA — pagos posteriores al corte no se contabilizan».
- **Combinación coherente** con tabs de aging, categoría, método, moneda, búsqueda y proveedor (drill-down) — mismas reglas en KPIs, Por proveedor, Detalle y Excel (verificado: con filtro 01/10→25/11 los KPIs y la tabla dieron Total $1,037,167.40 − Pagado $68,665.00 = Saldo $968,502.40).
- **Validaciones:** inicial ≤ final (bloquea Aplicar con aviso), límites inclusivos (from==to = un día), fechas ISO.

## 10. Resultados de las pruebas contables

**Vitest — 41 pruebas nuevas, 41 aprobadas:**
- A. Pagos (12): sin pagos · parcial · varios pagos · lote multi-doc · reversión/neteo · pago posterior al corte excluido · pago de doc fuera de período no contamina · duplicado reflejado (no silenciado) · totalmente pagado · moneda distinta (amount_cup) · comisión por canal propio · comisión con paid_at posterior al corte.
- B. Agrupación (5): multi-doc por proveedor · acumulación de pagos en la fila · «Sin proveedor» · nombres similares NO fusionados · mezcla recepciones+servicios.
- C. Fechas (8): un día · un mes · varios meses · from==to · doc sin fecha contable fuera de período · doc anterior excluido · **pago anterior al período aplicado a doc incluido cuenta** · re-evaluación estable · corte = date_to (fronteras).
- D. Navegación (7): ciclo completo sin error · guarda de forma · drill-down y Volver · Aplicar/Limpiar fechas · inicial>final bloqueado · categoría propagada · búsqueda con debounce.
- E. Conciliación (7+2): Total−Pagado=Saldo por documento · Σ docs = Σ proveedores = total pendiente · Σ intervalos = total pendiente · Pagado resumen = Σ aplicados · Vencido = Σ saldos vencidos · **fronteras 0/7/30/31/60/90/120/121 días** (vence hoy → próximos 7d; exactamente 7d → próximos 7d) · tabla con pagados concilia · regresión dorada ENERVIDA.
- Regresión: suites relacionadas (estados canónicos, liquidación, navegación gate1/caja) 134/134. Suite completa: ver §13 (CI).

**Navegador (datos reales de producción, solo lectura — sin pagos ni escrituras):**
- KPIs reproducidos al centavo antes y después (Vencido $2,352,085.70 · Próx.7d $556,766.00 · Pendiente $2,963,828.90 · Pagado $68,665.00).
- Tabla conciliada: Total $3,032,493.90 − Pagado $68,665.00 = Saldo $2,963,828.90 (fila TOTALES).
- Filtro 01/10/2026→25/11/2026: KPIs y tabla filtrados coherentes (arriba).
- Drill-down Tienda Pueblo → 25 documentos → Volver. Ciclos Detalle↔Por proveedor ×4 sin error.
- Historial de pagos: fecha, método, monto, moneda, tasa, equiv. CUP, **estado (Aplicado/Anulado)**, **saldo restante**, referencia, y total aplicado neto.
- Móvil 390px: sin overflow horizontal.

## 11. Evidencia de que no se alteraron movimientos históricos

- **Cero migraciones de datos**, cero UPDATE/INSERT/DELETE sobre producción: todos los scripts forenses son SELECT de solo lectura vía Management API (`scripts/cxap-forensic-audit.mjs`, `cxap-forensic-detail.mjs`, re-ejecutables).
- Las pruebas de navegador fueron 100% lectura (navegación, filtros, expansión de historial); no se registró ni anuló ningún pago.
- El único hallazgo de datos (pago $1,800 sobre servicio voided) queda **documentado con propuesta contable** (§5) sin ejecutar — requiere aprobación del propietario.
- RLS intacto: la ruta sigue usando el cliente con el JWT de la sesión (`getSupabaseForSession`) y `store_id` obligatorio; sin cambios de políticas.

## 11b. Único cambio de BD: REVOKE de seguridad, gobernado (2026-11-25)

El SQL Security Gate (checks en vivo, read-only) venía fallando en **todos los PR corrientes** (incluido el #1708, previo a esta misión) por dos hallazgos PREEXISTENTES de producción, ajenos al diff de CxP (cero SQL):

1. **`secdef_no_auth` (drift de allowlist):** `fin_post_payment_annulment`, `register_supplier_payment_multi` (ciclo CP-OPS-ENERVIDA aplicado a producción el 2026-11-24) y `cp_catmaestro001_renumber_auto_masters` nunca fueron alistadas. ACL verificada EN VIVO: ejecutores **{postgres, service_role}** — el patrón de sus hermanas ya listadas. → Añadidas a `ci-gate-allowlist.json` con justificación (cero exposición anon/authenticated).
2. **`secdef_public_grant` (no admite allowlist por diseño del gate):** `add_reception_items` y `save_pending_reception_changes` — SECURITY DEFINER legado con el EXECUTE default de PostgreSQL para anon/authenticated, **cero llamadores en toda la aplicación** (verificado exhaustivamente en src/, e2e/, tests/, scripts/, docs/; el flujo real de recepciones usa confirm/void/delete_pending_reception y reverse_receipt_v2). → Cerrado con el patrón establecido del repo (precedentes 20261025130000, 20261026180000, 20261113120700, 20261120215000): migración `20261125153000` de REVOKE.

**Canal gobernado (regla de oro §11g):** validación PREVIA en la BD aislada CostproE2E (aplicada y verificada: ACL {postgres, service_role}) → aplicación en producción UNA sola vez con el doble flag del guard CP-INFRA-019 (`ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND node scripts/cxap-apply-revoke-legacy-fns.mjs`) → verificación post-aplicación re-ejecutable (`--check` OK) → evidencia del estado anterior y posterior registrada arriba y en el script. **No elimina funciones ni datos; endurece** (reduce superficie de ataque). Reversión si algún flujo no descubierto lo requiriera: `GRANT EXECUTE ... TO authenticated` (documentado).

## 12. Commit, PR y CI

- Rama `fix/cxap-forensic-reconciliation-20261125`, commits por fases:
  - `6085d808c` docs(cxap): diagnóstico forense FASE 0-1 + scripts de auditoría
  - `adaa45b72` feat(cxap): fuente única de verdad + conciliación + fecha de corte + navegación
  - (siguiente) fix + informe final
- PR: ver enlace en el cierre de este expediente. CI: TypeCheck+Lint+Unit Tests+Build, E2E Aislado (project), Unit & Integration, Security Audit, Vercel Preview.
- Escaneo de secretos del diff: 0 coincidencias de patrones de credenciales (PAT de GitHub, claves de servicio/ publicación de Supabase, JWT).

## 13. Capturas antes/después

En `download/evidencia/` (también referenciadas en el PR):
- **ANTES:** `cxap-antes-02-vista-grouped.png` (tabla con Pagado $0.00 y Total=Saldo — conciliación imposible) · `cxap-antes-04-regreso-grouped.png` («Error al cargar Cuentas por Pagar» + Reintentar al volver de Detalle).
- **DESPUÉS:** `cxap-despues-01-grouped-conciliado.png` (TOTALES $3,032,493.90 · $68,665.00 · $2,963,828.90) · `cxap-despues-03-regreso-sin-error.png` (regreso sin error) · `cxap-despues-04-drilldown-tiendapueblo.png` · `cxap-despues-05-filtro-fechas-oct-nov.png` (banner de corte + vista histórica) · `cxap-despues-06-pagadas-detalle.png` · `cxap-despues-07-historial-pagos.png` (estado + saldo restante) · `cxap-despues-08-movil-390.png`.

## 14. Instrucciones de reversión

- Código funcional (CxP): `git revert` de los commits de la rama (o no-merge del PR).
- REVOKE de seguridad (§11b): `GRANT EXECUTE ON FUNCTION public.add_reception_items(uuid, jsonb, uuid) TO authenticated;` y `GRANT EXECUTE ON FUNCTION public.save_pending_reception_changes(uuid, jsonb, jsonb, jsonb, uuid) TO authenticated;` — SOLO si se descubriera un llamador no detectado (hoy: cero en toda la app).
- Los scripts forenses son de solo lectura y pueden eliminarse sin impacto.

---

## CERTIFICACIÓN FINAL (§13 de la misión)

| Área | Condición | Estado |
|---|---|---|
| Indicador Pagado | Conciliado con pagos aplicados reales | **CERTIFICADO** — misma definición que la tabla (regresión dorada + navegador) |
| Tabla Por proveedor | Total, Pagado y Saldo correctos | **CERTIFICADO** — $3,032,493.90 − $68,665.00 = $2,963,828.90 |
| Vista Detalles | Importes coherentes documento por documento | **CERTIFICADO** — fecha doc, vencimiento, total/pagado/saldo a corte, historial con estado y saldo restante |
| Antigüedad | Suma exacta de saldos pendientes | **CERTIFICADO** — partición exacta, fronteras 0/7/30/31/60/90/120/121 probadas |
| Recepciones / Servicios | Obligaciones correctamente reconocidas | **CERTIFICADO** — fecha contable por tipo; pagos de SR llegan a CxP |
| Filtros personalizados | Fechas inicial y final funcionales | **CERTIFICADO** — Aplicar/Limpiar, validación, coherencia total |
| Fecha de corte | Cálculo histórico reproducible | **CERTIFICADO** — pagos ≤ corte, posteriores excluidos, banner visible |
| Navegación | Sin errores al regresar a Por proveedor | **CERTIFICADO** — 4 ciclos + cambios rápidos, sin recarga |
| Multitienda | Sin contaminación entre sucursales | **CERTIFICADO** — store_id obligatorio + RLS por JWT (sin cambios) |
| RLS | Políticas respetadas | **CERTIFICADO** — cero cambios de políticas |
| Rendimiento | Sin consultas redundantes ni estados obsoletos | **CERTIFICADO** — 4 consultas por chunks + cancelación de obsoletas + sin truncamiento |
| Pruebas | Unitarias, integración y regresión aprobadas | **CERTIFICADO** — 41 nuevas + 134 relacionadas en verde; CI completo (ver §12) |

**Clasificación de hallazgos:** Corregido y probado (§4 dif. 1-6) · Corregido con observaciones (quirks de proveedor y pagos con fecha desplazada — documentados, corrección fuera de alcance contable) · Pendiente de decisión del propietario (reversión contable del pago de $1,800 sobre servicio voided, §5) · No aplicable (fusiones de proveedores, ajustes de saldos iniciales — prohibidos por la misión).
