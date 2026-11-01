# CHECKLIST DEL PROPIETARIO — LÍMITES SUPABASE FREE

**Creado:** 2026-11-01 · **Contexto:** ANALISIS_LIMITES_SUPABASE_2026-10-24.md · **Por qué:** el plan Free de la org Costpro excedió Log Ingestion (1,71/1 GB) en el ciclo 03/10→03/11 y la facturación/restricción de logs se activa tras la gracia que termina al inicio de 2027 (https://supabase.com/docs/guides/platform/manage-your-usage/logs-ingest).

---

## 1. Identificar quién ejecuta los scripts `node` (y rotar keys si no se reconoce)

- [ ] **1a.** Ya atribuido (ver informe §atribución): el patrón del 23/10 fue desarrollo de agentes IA (PR #1465, LIVE E2E contra la BD viva) + el workflow de captura de tasas. **Acción:** confirmar con quien opera los agentes que las nuevas reglas (`docs/OPERATIONS/POLITICA_AGENTES_SUPABASE.md`) quedan aplicadas.
- [ ] **1b.** Verificar que no quede OTRO tráfico `node` desconocido: ejecutar `docs/OPERATIONS/medir-logs.md` §2.3 en una franja sin corrida de tasas (evitar 00:00 y 12:00 UTC). Resultado esperado: **0 filas**.
- [ ] **1c.** Si aparece tráfico no atribuible tras los pasos de `medir-logs.md` §4: **rotar** `SUPABASE_SERVICE_ROLE_KEY` y `SUPABASE_ACCESS_TOKEN` (Dashboard → Settings → API → Rotate). Los legítimos se re-configuran: actualizar secrets de GitHub (Settings → Secrets and variables → Actions: `SUPABASE_SERVICE_ROLE_KEY`), `.env` local y Vercel. Cualquier script con key vieja deja de funcionar — ese es el objetivo.

## 2. Decidir qué hacer con los datos de prueba en producción

- [ ] **2a.** Revisar el informe §datos-de-prueba: hoy NO hay escrituras de prueba detectables (ventas 0 y caja 1 sesión en 30 días [MEDIDO]); el riesgo es histórico, no activo.
- [ ] **2b.** El 04/10 05:09Z quedó 1 sesión de caja de prueba (`cash_register_sessions`, apertor: usuario de prueba) y `cash_movements` con 2 filas ese día. Si se decide limpiar: autorizarlo explícitamente en un nuevo expediente (NO hacerlo desde este PR) — criterio de identificación en el informe.
- [ ] **2c.** Regla futura (ya vigente en el repo): ninguna prueba nueva escribe en producción — `REGLA_PRODUCCION_NO_ES_BANCO_DE_PRUEBAS.md`.

## 3. Revisar Usage semanalmente (ritual de 5 min)

- [ ] **3a.** Cada lunes: org Costpro → Usage, por proyecto. Anotar Log Ingestion / Log Query / Egress / DB size / Storage en la plantilla de `PRESUPUESTO_LIMITES_SUPABASE_FREE.md` §3.
- [ ] **3b.** Semáforos: presupuesto ≤60%, amarilla 70%, roja 85% (tabla completa en el presupuesto §1). Techo diario de ingestión: 20 MB/día 🟢 · 24 🟡 · 29 🔴.
- [ ] **3c.** Tras el PR de límites (cuando se fusione): repetir la medición base (`medir-logs.md` §2.1) y anotar el «después» junto al 53% del 23/10.

## 4. Decidir la estrategia 2027 (logs)

- [ ] **4a.** Confirmar la fecha exacta de fin de gracia: revisar el email de billing de la org y la página oficial (https://supabase.com/docs/guides/platform/manage-your-usage/logs-ingest — hoy dice "grace period through the start of 2027 before billing begins"). Precio tras cuota: $0,50/GB.
- [ ] **4b.** Opciones (ver presupuesto §4):
  - **Quedarse en Free con disciplina**: viable si la ingestión se estabiliza ≤20 MB/día (0,6 GB/ciclo). Riesgo: cualquier pico de una semana mala come el margen; Free no tiene spend cap configurable.
  - **Subir a Pro** ($25/mes): 20 GB de ingestión + 2.000 GB de query incluidos — elimina el riesgo estructuralmente. Recomendado si en 2027 la app crece o las corridas E2E se vuelven frecuentes.
- [ ] **4c.** Anotar la decisión y la fecha de revisión (sugerido: decidir antes del fin de 2026 para entrar a 2027 sin incertidumbre).

## 5. CostproE2E (antes de activar su workflow)

- [ ] **5a.** El esquema se carga UNA vez con el script manual (NO está en el workflow; el workflow `e2e-isolated.yml` ya está diseñado para no reaplicar migraciones — verificar que siga `if: false` hasta que el propietario decida activarlo).
- [ ] **5b.** Mantener el grupo smoke pequeño (el workflow ya define un subconjunto; no ejecutar la suite completa en CI).
- [ ] **5c.** Tras la PRIMERA corrida: anotar la ingestión de CostproE2E de ese día (Usage del proyecto) → ese número es el **presupuesto por corrida**. Con él, decidir cuántas corridas/mes caben (org Free comparte cuota: ingestión total ≤ 0,6 GB/ciclo → corridas = (600 MB − BD producción) / MB-por-corrida).
- [ ] **5d.** Mientras no se active: CostproE2E consume ~0,03 GB/ciclo [MEDIDO] — sin acción.

## 6. Qué capturas mandar para verificar el «después» (lista exacta en `medir-logs.md` §5)

- [ ] 6a. Usage → Log Ingestion (ciclo completo).
- [ ] 6b. Usage → Log Query.
- [ ] 6c. Consulta share user-agent (§2.1) en franja sin tasas — esperado ≤10% no-navegador.
- [ ] 6d. Consulta escrituras RPC desde node (§2.3) — esperado 0 filas.
