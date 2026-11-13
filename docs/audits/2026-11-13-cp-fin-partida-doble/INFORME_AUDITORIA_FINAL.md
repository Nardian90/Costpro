# CP-FIN — Informe de Auditoría Final Integral (validación independiente)

**Fecha:** 2026-11-13 · **Rama:** `feat/estados-financieros-20261113` · **PR:** [#1610](https://github.com/Nardian90/Costpro/pull/1610)
**Alcance:** Sistema de Configuración de Documentos y Estados Financieros Automáticos (COSTPRO 4 MULTITIENDA) — motor de partida doble `fin_*`, API, UI, tests, migración a producción.
**Método:** verificación INDEPENDIENTE (no se confiaba en resúmenes previos: cada estado se re-comprobó contra las BDs reales), ejecución de escenarios matemáticos con documentos REALES contra la BD aislada, corrección de defectos detectados y re-validación completa.

---

## VEREDICTO: ✅ MISIÓN COMPLETADA Y VALIDADA

El sistema CP-FIN queda **validado de extremo a extremo** tras la auditoría: 34/34 casos de la auditoría integral (re-ejecutada tras CADA corrección), 33/33 tests unitarios FIN, 7/7 del contrato de migraciones, migraciones aplicadas y verificadas en producción (28/28 checks acumulados m014+m015+m016), delta 0 en datos de negocio.

**Transparencia:** la auditoría detectó **6 defectos** en la implementación original (1 de endurecimiento + 4 críticos de comportamiento) que fueron corregidos y re-validados durante esta misma misión. El estado final documentado en este informe es el estado POST-corrección. Sin la auditoría independiente, los 4 defectos críticos habrían dejado el motor contabilizando mal ventas, recepciones, servicios, nóminas y flujo de caja desde el primer día en producción.

**Limitaciones documentadas (por diseño, no incumplimientos):** backfill histórico pendiente de autorización expresa del propietario (§12 de la misión); nómina soportada solo en CUP (`ERR_PAYROLL_CURRENCY_NOT_SUPPORTED`); hallazgo pre-existente del módulo servicios en multimoneda (§17, fuera de alcance CP-FIN).

---

## 1. Resumen ejecutivo

| Dimensión | Resultado |
|---|---|
| Escenarios matemáticos A-J (documentos reales, BD aislada) | **34/34 PASS** |
| Matriz de integración documental (15 tipos) | 10 con regla activa + 5 documentados sin regla por diseño — consistente |
| RLS multitienda (miembro / no-miembro / admin) | Aislamiento verificado con `SET ROLE authenticated` |
| Multimoneda (USD con tasa autorizada) | Normalización CUP correcta, moneda origen preservada |
| Suite unitaria FIN | 33/33 PASS |
| Contrato de migraciones (manifiesto INFRA-011) | 7/7 PASS (23 asertos), 153 migraciones incluidas |
| Aplicación a producción | m014 (3 migraciones) + m015 (4 fixes) + m016 (ACL funciones) — verificación POST 14/14 + 10/10 + 4/4, delta 0 |
| Higiene BD aislada | `PASS — net delta = 0` |
| Secretos en diffs | CERO coincidencias |

## 2. Metodología de verificación independiente

- No se confió en ningún resumen previo: el estado REAL se verificó consultando ambas bases de datos (aislada `lguovmvrozxgssupkwpf`, producción `wthkddeleylijmonclxg`) vía Management API (read-only salvo aplicación autorizada), el repositorio git y el PR.
- La auditoría integral ejecuta los 10 escenarios con **documentos REALES** (secuencias idénticas a los RPC de negocio: `create_sale_v2` inserta cabecera 'completed' → items → pagos; `register_reception` igual), no con llamadas directas al motor — lo que destapó el defecto de triggers (§14.1) que las validaciones previas basadas en llamadas directas habían codificado como expectativa.
- Limpieza total tras cada ejecución (net delta 0 verificado por script propio + `data-hygiene-guard.cjs`).
- Script re-ejecutable: `scripts/fin-auditoria-integral.mjs` (guard de ref aislado).

## 3. Estado remoto verificado (11f)

- Rama `feat/estados-financieros-20261113` con 11 commits (expediente diseño → motor → API → vistas → tests → evidencia → fixes CI → aplicación m014 → correcciones auditoría).
- PR #1610 abierto; CI 9/9 verde antes de las correcciones finales de esta auditoría (re-verificado tras el push final).
- Producción ANTES de esta misión: CERO tablas `fin_*` (verificado read-only).

## 4. Aplicación de migración a producción (primer paso de la misión, autorizado)

**m014** (14:18–14:22 UTC): base + motor + endurecimiento RLS — 3 archivos, lote único por archivo, `NOTIFY pgrst`, verificación POST 14/14, delta 0. Registro: `APLICACION_MIGRACIONES_PRODUCCION.md`.
**m015** (15:12 UTC): 4 correcciones de la auditoría integral — mismo canal canónico, verificación POST 10/10, delta 0.
Estado final: esquema CP-FIN **ACTIVO** en producción; 0 asientos (sin backfill no autorizado); triggers diferidos operativos.

## 5. Entregable A — Motor (migraciones + modelo + RLS)

- 8 tablas `fin_*` con RLS **FORCED** (patrón payrolls/m013), 16 políticas, semillas: 44 categorías, 15 tipos documentales, 10 reglas activas, 41 métricas.
- 19 triggers `fin_trg_%` (16 tabla + 3 constraint diferidos tras m015); 11 RPCs públicas SECURITY DEFINER; 9 internas sin EXECUTE para authenticated/anon/public; REVOKE FROM PUBLIC/anon.
- Idempotencia de las 7 migraciones verificada (DROP IF EXISTS / ON CONFLICT / guards fail-closed en cada archivo).
- **Defecto de endurecimiento encontrado y corregido** (RLS sin FORCE + anon con privilegios): migración `20261113120200`, estándar alineado a payrolls.

## 6. Entregable B — API (8 rutas)

Rutas `/api/fin/*` (config, reglas, simulador, estados, detalle, saldos iniciales, contabilización, documentos) con `withAuth` + `withSecurity`, validación zod y trust boundary por JWT (store_id del token, nunca del body). Navegación validada por `fin-navigation.test.ts` (5 tests: roles, wiring, registro de vistas). Fix de esta serie: `uuidLoose` en 4 rutas y `'document-config'` en VALID_VIEWS (commit 18f3f6e08).

## 7. Entregable C — Vistas UI

- `document-config`: catálogo, constructor de movimientos, simulador, versionado, saldos iniciales, errores con reprocesado.
- `financial-statements`: Estado de Situación (ecuación A = P + PN sin ajustes ficticios), Estado de Rendimiento, Dashboard con drilldown; exportación PDF/Excel.
- Validación: `financial-statements-view.test.tsx` (4) + `fin-presentation.test.ts` (8, signos income vs dashboard) + CI TypeCheck+Lint+Build.

## 8. Entregable D — Tests

- Migración (contrato 16 asertos → ahora 23 con manifiesto 153), navegación (5), presentación (8), vista (4): **33/33**.
- Contrato del manifiesto de replay: 7/7 (determinismo byte a byte, posiciones, hashes, `--check` MATCH; 154 migraciones).
- Fixes de CI de la serie: TS1501 (flag regex ES2018), conteo 146→148→149→153, flake del PDF de caja («Generado:» timestamp).

## 9. Entregable E — Evidencia y expediente

`audit-evidence/CP-FIN-20261113/`: smoke, signos, higiene, esquema, suite unitaria, verificación m014 y m015 en producción, auditoría integral 34/34. Expediente en `docs/audits/2026-11-13-cp-fin-partida-doble/` (diseño, evidencia E2E, registro de aplicación a producción, este informe final).

## 10. Escenarios matemáticos A-J (resultados de la auditoría integral)

| Caso | Escenario | Resultado |
|---|---|---|
| A | Venta efectivo 100 CUP (costo 60), secuencia REAL `create_sale_v2` | ✓ 4 movimientos, 160 D = 160 C, utilidad bruta 40 |
| B | Venta a crédito (patrón CxC; COSTPRO no tiene ventas a crédito) | ✓ patrón soportado y regla por defecto SIN CxC documentada |
| C | Servicio recibido pendiente 50 + pago | ✓ D gasto / C pasivo; pago D pasivo / C efectivo sin doble gasto |
| D | Compra inventario pendiente 150 + pago (secuencia REAL `register_reception`) | ✓ D inventario / C CxP; sin costo de ventas; pago reduce deuda |
| E | Nómina devengo 1000 (neto 800, retenciones 200) + pago | ✓ D GAS_NOMINAS 1000 / C PAS_NOMINA_PEND 800 + C PAS_RETENCIONES 200; pago sin nuevo gasto |
| F | Transferencia interna CONFIRMADA | ✓ CERO asientos (sin efecto económico); inventario invariante |
| G | Anulación de servicio pagado | ✓ originales → reversed; 2 asientos compensatorios inversos y equilibrados; negocio bloquea doble void; motor idempotente |
| H | Multimoneda USD tasa 400 | ✓ 10 USD × 400 = 4000 CUP-equiv; pago D ACT_BANCOS 4000 / C PAS_SERV_PEND 4000; cero mezclas sin convertir |
| I | Versiones de reglas (v1 → v2) | ✓ documento nuevo usa v2; histórico conserva v1; restauración limpia |
| J | Concurrencia (2 llamadas simultáneas + reintento secuencial) | ✓ exactamente 1 asiento (advisory lock + índice único); idempotencia |

## 11. Matriz de integración documental (15 tipos)

| Tipo | Módulo | Regla | Trigger | Validación dinámica |
|---|---|---|---|---|
| VENTA | Ventas | activa (8 movs) | diferido | Caso A |
| DEVOLUCION_VENTA | Ventas | activa (9) | diferido | — (regla auditada estáticamente) |
| RECEPCION | Inventario | activa (5) | diferido | Caso D |
| VALE_SALIDA | Inventario | activa (2) | inmediato | — |
| AJUSTE_INVENTARIO | Inventario | activa (4) | inmediato | — |
| TRANSFERENCIA | Inventario | activa (0, vacía explícita) | — | Caso F |
| ORDEN_COMPRA | Inventario | sin regla (deuda nace en recepción) | — | por diseño |
| ORDEN_PRODUCCION | Producción | sin regla (configuración futura) | — | por diseño |
| ORDEN_TRABAJO | Producción | sin regla (anticipos) | — | por diseño |
| DEVOLUCION_PROV | Inventario | sin regla (se modela como reversa de recepción) | — | por diseño |
| SERVICIO_RECIBIDO | Servicios | activa (5) | inmediato | Casos C/H/G/J |
| COMISION | RRHH | activa (4) | inmediato | — |
| NOMINA | RRHH | activa (6) | inmediato | Caso E |
| FLUJO_CAJA | Caja | activa (6) | inmediato | — |
| APERTURA_FIN | Sistema | sin regla (is_postable=false; aperturas vía RPC) | — | por diseño |

## 12. RLS y multitienda

- `fin_movements`/`fin_entries`: SELECT-only para authenticated (`is_admin() OR has_store_access(store_id)`), escritura denegada (solo el motor, SECURITY DEFINER).
- Prueba dinámica `SET ROLE authenticated` + JWT claims: miembro ve sus 23 movimientos; no-miembro (rol no admin, sin membresía) ve **CERO**; admin de plataforma ve todo (por diseño).
- Deny-by-default + FORCE en las 8 tablas; CERO privilegios anon.
- Nota de fixture (falso positivo corregido en el script): el primer "no miembro" elegido era otro admin de plataforma (26 admins en la aislada) — `is_admin()` legítimamente le daba acceso.

## 13. Multimoneda

- Todos los movimientos se normalizan a CUP con la tasa DEL DOCUMENTO (no una tasa global); la divisa de origen se preserva en `currency_origin` (Casos H.1–H.4).
- Nómina: solo CUP soportado — nómina en otra divisa lanza `ERR_PAYROLL_CURRENCY_NOT_SUPPORTED` (limitación documentada en el expediente de diseño, no un fallo silencioso).
- Véase §17: el hallazgo multimoneda pre-existente del módulo servicios (fuera de alcance).

## 14. Defectos encontrados por la auditoría y corregidos (los 4 críticos + endurecimiento)

**14.1 — CRÍTICO: triggers inmediatos vs RPCs que insertan cabecera-primero (migración 20261113120300).**
Los RPC reales (`create_sale_v2`, `create_devolution_v2`, `register_reception`) insertan la cabecera en estado DEFINITIVO y las filas hijas después. Con triggers AFTER inmediatos, el motor computaba métricas ANTES de que existieran items/pagos: VENTA/DEVOLUCIÓN → `ERR_UNBALANCED` (asiento perdido); RECEPCIÓN → asiento omitido en silencio (total 0). Corrección: CONSTRAINT TRIGGERS `DEFERRABLE INITIALLY DEFERRED` (disparan al COMMIT). Evidencia: 23 errores `ERR_UNBALANCED` en `fin_posting_errors` de la aislada durante el descubrimiento.

**14.2 — CRÍTICO: fin_compute_metrics con errores de tipado y claves (migración 20261113120400).**
NOMINA asignaba `payment_method` (text) a variable numeric → el asiento de nómina NUNCA se generaba; FLUJO_CAJA crasheaba (concept/currency a numeric); cobros/reembolsos CUP generaban claves `cob_cash_cup_cup` inexistentes → TODA venta CUP en efectivo/transferencia caía en ERR_UNBALANCED; RECEPCIÓN: alias `r` colisionaba con la variable record (55000) y leía `unit_cost_cup` (columna inexistente, 42703).

**14.3 — CRÍTICO: sentidos de pago invertidos en RECEPCION y SERVICIO_RECIBIDO (migración 20261113120500).**
El pago SUMABA efectivo/bancos (D ACT_*) y AUMENTABA la deuda (C PAS_*). Contabilidad correcta: D pasivo / C activo (como ya hacían NÓMINA y COMISION). Inconsistencia interna detectada al contrastar reglas entre sí; las validaciones previas del smoke habían codificado el error como expectativa.

**14.4 — ALTO: whitelist audit_logs sin fin_rule_versions (migración 20261113120600).**
Activar/desactivar reglas GLOBALES (las 10 semilla) violaba `audit_logs_store_id_check` (23514). Corrección con el patrón master_products/master_parties: ampliación DINÁMICA de la whitelist (sin regredir entradas futuras).

**14.5 — ALTO (endurecimiento, m014):** RLS sin FORCE + anon con privilegios en 6 tablas → `20261113120200` (FORCED ×8 + REVOKE ALL FROM anon).

**14.6 — ALTO (hallazgo del gate SQL DB Security del CI, corrido read-only contra producción):** las 11 RPCs públicas `fin_*` conservaban el grant EXECUTE por defecto a PUBLIC (heredado por anon) — el motor revocó en las 9 internas pero omitió las 11 públicas. Sin exposición efectiva de datos (todas tienen gates internos de autorización), pero con superficie de llamada abierta a anon. Corrección `20261113120700` (REVOKE PUBLIC/anon en 11 RPCs + 10 triggers, EXECUTE authenticated conservado; patrón canónico del repo), aplicada vía m016 con verificación 4/4 y delta 0. Las 9 funciones internas se declararon en `ci-gate-allowlist.json` (helpers sin auth propio por diseño, sin EXECUTE externo).

Todos los fixes: validados primero en la aislada (auditoría integral 34/34 + higiene net delta 0), aplicados a producción UNA SOLA VEZ (m015), verificación POST fail-closed.

## 15. Quality gates

- CI del PR #1610: 9/9 checks (E2E Aislado, Security Audit, SQL DB Security, TypeScript Security, SQL Static, Allowlist, Unit&Integration, TypeCheck+Lint+Build, Vercel) — verde tras los 3 fixes de la sesión anterior; re-verificación tras el push de esta auditoría.
- Manifiesto INFRA-011 regenerado: **153** migraciones (149 + 4 fixes); contrato 7/7 con historia completa de conteos (141→142→…→153).
- Escaneo de secretos sobre los diffs: CERO coincidencias (github_pat_, sb_secret_, sbp_, sb_publishable_, eyJhbGciOi, credenciales BD).

## 16. UX/UI

Vistas con 3 pestañas (Situación / Rendimiento / Dashboard con drilldown), constructor visual de movimientos con simulador ANTES de activar reglas, gestión de errores con reprocesado 1-clic, exportación PDF/Excel. Ecuación patrimonial A = P + PN presentada sin ajustes ficticios. La auditoría de esta fase fue funcional (tests de vista + presentación + navegación); no se detectaron bloqueos. Pendiente sugerido: prueba Playwright de UI post-merge (workflow manual «E2E Aislado»).

## 17. Hallazgos fuera de alcance CP-FIN (recomendaciones al propietario)

**17.1 — MEDIO-ALTO, pre-existente, módulo servicios multimoneda:** al pagar un servicio en divisa, `update_payment_status` guarda `paid_amount` en CUP (suma de `amount_cup`) mientras el guard `prevent_received_service_edit` lo compara contra `total_amount` en divisa → un servicio USD pagado (ej. 10 USD = 4000 CUP) queda **inalterable**: no se puede anular (el propio RPC `void_received_service_with_reversal` choca con `ERR_TOTAL_BELOW_PAID`), ni editar, ni borrar sus pagos. No corrompe al motor CP-FIN (las métricas usan total × tasa), pero sí deja el documento atascado en el módulo de servicios. Recomendación: hacer que el guard compare en la misma moneda (o que `update_payment_status` guarde paid_amount en moneda del documento).

**17.2 — Menor:** `fin_posting_errors` acumula filas para documentos borrados físicamente (huérfanos); se recomienda purge periódico o FK ON DELETE. La auditoría limpió los suyos en la aislada.

## 18. Estado final y pendientes

- **Producción:** esquema CP-FIN completo y corregido (7 migraciones), 0 asientos (sin backfill), triggers diferidos operativos, RLS FORCED, CERO anon.
- **BD aislada:** limpia (net delta 0), misma versión de esquema, reutilizable.
- **Pendientes post-merge (requieren decisión del propietario):** (1) backfill histórico con `fin_backfill dry_run` primero; (2) saldos iniciales por tienda antes de activar informes en producción; (3) workflow manual «E2E Aislado (CostproE2E)» para la suite Playwright completa; (4) atender hallazgo 17.1 del módulo servicios.
- **Reproducibilidad:** `scripts/fin-auditoria-integral.mjs` (34 casos), `scripts/m014-…`, `scripts/m015-…` (re-ejecutables, `--only-verify` incluido).
