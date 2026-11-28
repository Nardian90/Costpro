# INFORME FINAL — CP-FX-PREMIUM-DASHBOARD-AND-HISTORICAL-DATA-RECOVERY-001

**Fecha:** 2026-11-28 · **Rama:** `feat/fx-premium-dashboard-historical-recovery-20261128` · **Base:** main @ 170a9f9be

---

## A. Auditoría histórica (FASE 2 — estado ANTES)

Inventario read-only de `exchange_rates` (serie informal USD unificada, fuentes Diviza + elToque):

| Métrica | Antes | Después |
|---|---|---|
| Rango histórico examinado | 2025-12-25 → 2026-11-28 (339 días) | idem |
| Días con cotización | 201 (59.3 %) | **339 (100 %)** |
| Días sin información | 138 en 34 intervalos | **0** |
| Hueco crítico (zona muerta) | 2026-07-29 → 2026-10-24 (88 días) | reconstruido |
| Días recuperados de fuente original compatible (Cuba Clara, real) | — | **12** |
| Días estimados por interpolación lineal | — | **126** (alta 33 · media 24 · baja 69) |
| Días completados por arrastre | — | 0 persistentes (el arrastre ya existía como mecanismo virtual de consulta para la fecha operativa) |
| Días que no pudieron reconstruirse | — | **0** |
| Porcentaje de continuidad alcanzado | 59.3 % | **100 %** (213 observadas + 126 estimadas identificadas) |
| Registros duplicados / inválidos / fechas futuras | 0 / 0 / 0 | 0 / 0 / 0 (re-verificado) |
| Observaciones originales alteradas | — | **0** (verificación post-apply: 0 reales cambiadas) |

Clasificación de los huecos originales (misión §2.1): 46 días sin publicación típica (fines de semana) y 92 días con información perdida (capturas fallidas de días hábiles). La zona muerta (88 días) se debió a la caída de solucionescuba.com (2026-07-28) con Diviza aún sin existir como captura (inició 2026-10-25/26).

Detalle por fuente tras la recuperación: elToque 285 filas (166 real + 119 estimadas), Cuba Clara 19 filas (12 real + 7 estimadas), Diviza 35 filas (100 % real).

---

## B. Fuentes consultadas (FASE 3)

| Fuente | Enlace | Metodología | Licencia / condiciones | Resultado |
|---|---|---|---|---|
| **elTOQUE API** | https://tasas.eltoque.com/docs · GET /v1/trmi | TRMI: medianas de ofertas de compra/venta del mercado informal | Token por aplicación (solicitud por formulario); 60 req/min, 10 req/s; cita obligatoria; datos referenciales; «no se pueden modificar los datos, excepto para actualizarlos» | **API activa y la TRMI volvió a publicar (posts 27-28/11/2026), pero NO existe token disponible** — limitación documentada; no se inventaron claves. Queda como vía futura para el propietario (solicitar token → ruta recover ya es extensible). Redistribución vía terceros no autorizada (confirmado por Cuba Clara) |
| **Cuba Clara — «Dólar en la calle»** | https://cubaclara.org/datos/ · serie `dolar-cuba-clara` (CSV/JSON) | Medición propia: mediana diaria de ofertas de compra/venta de particulares; columna «medio» (punto medio oficial Cuba Clara); días sin suficiente oferta van vacíos | **CC BY 4.0** — uso libre con atribución (citación incluida en `notes` de cada fila) | **UTILIZADA** — cubre 2026-10-06 → 2026-11-23; recupera 12 días de la zona muerta como observaciones reales verificables |
| elTOQUE vía Cuba Clara (no descargable) | https://cubaclara.org/datos/ §«Lo que no puedes descargar» | — | elTOQUE no autoriza redistribuir su serie | Descartada (solo visualización) |
| Diviza (cubadivisas.com) | https://cubadivisas.com/ | Mediana de referencias del mercado informal; actualización cada 30 min | Lectura server-side del HTML público (adaptador existente) | Fuente ACTIVA vigente — sin serie histórica (no aplica a la recuperación) |

**Compatibilidad metodológica Cuba Clara ↔ Diviza verificada** en 30 días de solape (2026-10-25 → 2026-11-23): diferencia media **0.33 %**, máxima **0.83 %** — ambas son medianas del mismo mercado informal; se conserva el nombre de fuente por fila y jamás se re-atribuye (Cuba Clara nunca se presenta como elTOQUE ni Diviza).

---

## C. Cambios técnicos

### Tablas y migraciones
- **20261128120000_cp_fx_recovery_traceability.sql** (idempotente, reversible — rollback incluido):
  - CHECK `exchange_rates_source_check` ampliado a `('BCC','elToque','Diviza','Cuba Clara')` (patrón condicional de 20261027000000).
  - Columnas de trazabilidad (todas NULLABLE, cero impacto en captura/manual/bulk existentes): `rate_source_url`, `reconstruction_method`, `confidence_level` (CHECK alta/media/baja), `notes`, `imported_at`, `import_batch`.
  - Índice parcial `idx_exchange_rates_import_batch`.
  - La migración NO escribe datos. Aplicada: e2e primero → **producción UNA vez** (2026-11-28, canal gobernado con doble flag CP-INFRA-019, HTTP 201, pgrst reload).
  - Respaldo previo en producción: dump JSON (`docs/audits/CP-FX-001/backup-exchange-rates-*.json`) + tabla congelada `exchange_rates_backup_cpfx001` (1607 filas).

### Archivos modificados / nuevos
| Archivo | Cambio |
|---|---|
| `src/lib/fx-recovery.ts` | **NUEVO** — lib pura: parser Cuba Clara, detección de huecos, clasificación (sin publicación vs perdidos), interpolación lineal con confianza, plan con guardas G1-G5, `validatePlanSafety` |
| `src/app/api/exchange-rates/recover/route.ts` | **NUEVO** — POST admin-only, dry-run/apply idempotente (mantenimiento futuro) |
| `src/lib/exchange-sources.ts` | `INFORMAL_RECOVERED_SOURCES = ['Cuba Clara']` con trato de archivo histórico (jamás vigente, jamás carry-forward); `normalizeCosteoRateSource` resuelve recuperadas → Diviza |
| `src/lib/exchange-history.ts` | Passthrough de `confidence_level` / `reconstruction_method` por punto unificado |
| `src/app/api/exchange-rates/route.ts` | `informal_latest` y base del carry-forward exigen `capture_method === 'real'` — una estimación jamás se presenta como vigente ni se arrastra |
| `src/components/.../exchange_intelligence/ExchangeIntelligenceView.tsx` | `isObservedCaptureRow` para la selección de la vigente (misma regla servidor/cliente) |
| `src/components/.../exchange_intelligence/lazy/HistoryTab.tsx` | FASE 5: serie estimada DISCONTINUA ámbar separada de la observada; leyenda «USD Informal estimada (reconstrucción, no es observación)»; tooltip con fuente + método + confianza |
| `src/components/.../dashboard/InformalUsdRateCard.tsx` | **NUEVO** — tarjeta premium (FASE 1) |
| `src/components/.../dashboard/IndicatorsSummary.tsx` | Integración de la tarjeta en el Resumen de Indicadores |
| `scripts/fx-apply-recovery.mjs` | **NUEVO** — canal gobernado (respaldo + dry-run + apply + verificación + idempotencia); registrado en `writers.manifest.json` (guardProtected) |
| `scripts/fx-rollback-e2e.sql` | **NUEVO** — rollback de la validación en la BD aislada (net-zero verificado) |
| `scripts/verificacion-ui-cpfx-001.mjs` | **NUEVO** — arnés UI read-only (13 checks) |
| Tests | `src/__tests__/lib/fx-recovery.test.ts` (23), `src/__tests__/components/informal-usd-rate-card.test.tsx` (9), `exchange-sources.test.ts` (contrato + Cuba Clara), `exchange-rates-get.test.ts` (pseudo-fuentes) |

### Mecanismo de actualización (FASE 6)
- El cron existente (`.github/workflows/exchange-rates-capture.yml`, 2×/día, BCC + Diviza con el adaptador compartido) **se reutiliza sin cambios** — es idempotente por diseño (upsert merge-duplicates contra la clave natural) y ya cubre la vigencia diaria.
- La recuperación queda disponible como **mantenimiento idempotente re-ejecutable**: `POST /api/exchange-rates/recover` (admin; dry-run por defecto) o `bun scripts/fx-apply-recovery.mjs --target prod --apply --confirm-prod`. Re-ejecutar produce los mismos valores sin duplicar (verificado en la verificación 6d del canal: re-plan → 0 mismatch, 0 duplicados).
- Trazabilidad: cada fila importada lleva fuente, URL, método, confianza, notas con anclas/citación, `imported_at` e `import_batch` (`CP-FX-001-<fecha>`) — reversión quirúrgica por lote documentada.

---

## D. Panel de Control (FASE 1)

- **Diseño**: banda premium compacta — acento superior degradado, badge de icono, etiqueta «DÓLAR INFORMAL · USD», cotización principal «1 USD = 980.00 CUP» en tabular 3xl, variación diaria con flecha/±CUP/±%, chip de estado con pulso («Observada hoy») o ámbar («Última disponible · hace N días» + «Pendiente de actualización»), metadatos (fecha del dato, hora de actualización en Cuba — hora del proveedor Diviza si existe, si no hora de captura — y fuente), acción «VER EVOLUCIÓN» → Inteligencia Cambiaria (`setCurrentView('exchange-intelligence')`). Todo con tokens del tema (coherente en claro/oscuro). Auto-refresh 5 min pausado con tab oculto.
- **Ubicación**: dentro del «Resumen de Indicadores», tras el grid de KPIs internos y antes de la nota de cobro USD — el indicador financiero externo queda separado de los KPIs de la tienda.
- **Fuente única**: `/api/exchange-rates?currency=USD&source=informal&segment=3` — la MISMA serie de Inteligencia Cambiaria (`informal_latest`, solo observaciones reales). Sin segunda fuente de datos ni tasa independiente.
- **Evidencia de funcionamiento** (`download/cpfx-evidencia/`): 13/13 checks PASS en navegador real contra producción — tarjeta visible desktop/móvil (390 px, 0 px de desborde), fecha real «Dato: 28/11/2026», chip «Observada hoy», variación honesta, navegación funcional, Histórico con leyenda estimada y tramos discontinuos presentes, 0 errores de consola. Capturas: `tarjeta-desktop-1440.png`, `tarjeta-movil-390.png`, `historico-serie-continua.png`, `resultados.json`.

---

## E. Calidad

| Verificación | Resultado |
|---|---|
| `tsc --noEmit` | **EXIT 0** (con heap ampliado; OOM del sandbox con heap default — conocido, el CI corre en runners 7 GB) |
| ESLint (archivos de la misión) | **0 errores** (warnings preexistentes de estilo `<button>`) |
| Tests nuevos | 23 (fx-recovery) + 9 (tarjeta) **PASS** — incluye la matriz estadística completa: variación +/−/0, un día faltante, varios consecutivos, ausencia posterior, fuentes distintas, fin de semana, guardas G1/G2, idempotencia |
| Regresión dirigida | exchange-sources/history/capture-diviza/indicators-summary/dashboard-kpi/exchange-rates-* → **PASS** (80 + 22 + 43) |
| Suite completa vitest | Ver comentario del PR (resultado final del run completo) |
| Build | Ejecutado en CI del PR (paso TypeCheck+Lint+Unit+Build) |
| Canal gobernado | e2e: dry-run → apply 26 → verificación PASS → rollback net-zero (0 informales restantes). Producción: respaldo → apply 138 → verificación PASS (0 reales alterados; 138/138; 0 futuras; idempotencia 0/0) |
| UI real (read-only) | **13/13 PASS** (detalle en §D) |
| Secretos en el diff | 0 (escaneo de los patrones de credenciales del prompt de inicio: PAT de GitHub y claves Supabase/JWT — la única coincidencia era este propio documento describiendo el escaneo, reformulado) |
| Workflows | CI del PR (checks al abrirse; resultado en el PR) |
| PR | Ver descripción del PR (número/enlace al abrirse) |

### Incidencias pendientes / limitaciones
1. **elTOQUE API sin token**: la TRMI volvió a publicar y la API está activa, pero el token se solicita por formulario y no estaba disponible. Cuando el propietario lo obtenga, la ruta `recover` es extensible para recuperar la era elToque con su fuente primaria (sustituyendo estimaciones por reales, sin tocar Diviza).
2. **69 días con confianza «baja»** (puente 2026-07-29 → 2026-10-05 entre elToque y Cuba Clara): interpolación lineal claramente etiquetada (línea discontinua + tooltip «ESTIMADA · interpolación lineal · confianza baja»). Si elTOQUE entrega histórico, deben sustituirse por reales (jerarquía §4.1.1).
3. **Días sin `medio` en Cuba Clara** (7 días de octubre con solo compra/venta): no se fabricaron; quedaron como interpolaciones entre anclas Cuba Clara reales.
4. Los estimados usan `source` de la era de la ancla izquierda (elToque/Cuba Clara) con `capture_method='estimated'` + notas documentando AMBAS anclas — convención documentada en `fx-recovery.ts`.
5. 5 PDFs de `docs/audits/NOMINAS-PDF-CONF-20261121/` continúan apareciendo modificados sin intervención de esta misión (hallazgo ya anotado en el worklog de la misión Gaceta) — EXCLUIDOS del PR.

---

## Criterio final de aceptación
- El Panel de Control muestra la tarjeta financiera premium del dólar informal **proveniente de Inteligencia Cambiaria**, con fecha real, hora de actualización y variación diaria — **CUMPLE** (13/13 evidencia).
- Inteligencia Cambiaria dispone de una **serie histórica continua (339/339 días)** priorizando cotizaciones originales verificables (213) y completando el resto (126) con **estimaciones identificadas, documentadas y auditables** — **CUMPLE**.
- La integridad de las observaciones originales permanece **intacta** (0 alteraciones verificadas, respaldo doble) — **CUMPLE**.
