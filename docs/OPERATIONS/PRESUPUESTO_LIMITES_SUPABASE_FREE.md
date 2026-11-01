# PRESUPUESTO Y SEMÁFOROS — PLAN FREE DE SUPABASE

**Organización:** Costpro · **Proyectos:** CostproBD (producción, ref `wthkddeleylijmonclxg`) y CostproE2E.
**Ciclo de facturación:** 03-Oct → 03-Nov (se repite mensualmente).
**Cuotas oficiales del plan Free** (fuente: https://supabase.com/pricing, consultado 2026-11-01) y estado del ciclo 03/10→03/11/2026 aportado por el propietario.

> **Contexto 2027:** la facturación/límites de logs se activan tras un período de gracia que termina **al inicio de 2027**. Hasta entonces el medidor es informativo. Después: Free con exceso → notificación al email de facturación + período de gracia + Fair Use Policy (fuente: https://supabase.com/docs/guides/platform/manage-your-usage/logs-ingest). El precio tras cuota sería $0,50/GB de ingestión.

---

## 1. Tabla de presupuesto por métrica

Presupuesto objetivo = **≤60% del límite** (margen para picos). Amarilla = 70%. Roja = 85%.

| Métrica | Límite Free | Consumo ciclo actual | Presupuesto (≤60%) | Amarilla 70% | Roja 85% | Qué hacer si se cruza |
|---|---|---|---|---|---|---|
| **Log Ingestion** | 1 GB/ciclo | 1,71 GB (171%) ⛔ | 0,60 GB | 0,70 GB | 0,85 GB | §2 abajo (presupuesto diario) |
| **Log Query** | 100 GB/ciclo | 31,68 GB (32%) ✅ | 60 GB | 70 GB | 85 GB | Parar consultas grandes; usar `medir-logs.md` (ventanas 1 h, agregadas); nunca repetir barridos |
| **Egress** | 5 GB/ciclo | 1,22 GB (24%) ✅ | 3,0 GB | 3,5 GB | 4,25 GB | Revisar `GET /stores` y descargas repetidas (§origen en el informe); verificar caché de imágenes |
| **Cached Egress** | 5 GB/ciclo | (sin dato) | 3,0 GB | 3,5 GB | 4,25 GB | Igual que Egress — el CDN ya absorbe la mayoría si los headers son correctos |
| **Database Size** | 500 MB/proyecto | 0,116 GB (23%) ✅ | 300 MB | 350 MB | 425 MB | `VACUUM`/limpieza de tablas de auditoría antiguas (con respaldo); revisar tablas de logs propios |
| **Storage** | 1 GB | 0,016 GB (1,6%) ✅ | 0,6 GB | 0,7 GB | 0,85 GB | Limpiar imágenes huérfanas de productos borrados (con autorización) |
| **Realtime (conexiones pico)** | 200 | pico 7 (3,5%) ✅ | 120 | 140 | 170 | No aplica hoy; vigilar si se añaden vistas en vivo |
| **Realtime messages** | 2 M/mes | (sin dato) | 1,2 M | 1,4 M | 1,7 M | Solo relevante si se activa Realtime en más tablas |
| **MAU** | 50.000 | 703 (1,4%) ✅ | 30.000 | 35.000 | 42.500 | Sin riesgo; ver calidad de los 703 en el informe T5 |
| **Edge Functions** | 500.000 inv./mes | (sin dato) | 300.000 | 350.000 | 425.000 | Sin uso conocido hoy |

Estado ⛔ = excedido este ciclo · ✅ = dentro de presupuesto.

**Nota Log Query:** el 93% del consumo (29,5 GB) fue UN evento puntual el 04/10 (consulta masiva, probablemente exploración manual del dashboard o export). La cuota mensual restante tras ese día fue mínima. Con la regla «ventanas ≤1 h, agregadas» (política de agentes) el consumo normal es despreciable.

## 2. Log Ingestion — presupuesto DIARIO sostenible

El ciclo es de ~30 días, así que el techo diario medio es 1 GB / 30 d = **33 MB/día**. Con margen de seguridad (picos de deploy/migraciones):

| Nivel | MB/día (por proyecto) | Significado |
|---|---|---|
| 🟢 Presupuesto objetivo | **≤ 20 MB/día** | Ciclo cerraría en ~0,6 GB (60%) |
| 🟡 Amarilla | 24 MB/día | Proyección 70% — investigar qué subió |
| 🔴 Roja | 29 MB/día | Proyección 85% — actuar (ver abajo) |

**Consumo actual [ESTIMADO de la gráfica del propietario]: ~20-30 MB/día desde el 10/10** → el ciclo cerraría en ~0,8 GB: *debajo* del límite pero **sin margen** (80%). El objetivo operativo es bajar a ≤20 MB/día.

**Qué hacer si se cruza (en orden):**
1. Verificar en el dashboard (Logs → Usage) qué fuente dispara el pico: API (PostgREST), Auth, Postgres o Realtime.
2. Si es **API con user-agent `node`**: aplicar `docs/OPERATIONS/medir-logs.md` §share-node para confirmar share; revisar workflows activos y sesiones de agente en curso.
3. Si es **Auth**: revisar bucles de `getUser()` por request (ver informe §T4a) y reintentos de login de scripts.
4. Si es **errores 4xx repetidos**: ver informe §T4d (cada 400/401 genera línea de log).
5. Si es **Postgres**: revisar que nadie esté re-aplicando el replay de migraciones contra remoto (cada DDL genera logs).

**Lo que NUNCA se hace para bajar el número:** apagar logs de auth, de rutas críticas 4xx/5xx, de cambios de rol/membresía ni `audit_logs` (evidencia de seguridad).

## 3. Ritual semanal del propietario (5 minutos, cada lunes)

1. **Supabase Dashboard → Organización Costpro → Usage** (https://supabase.com/dashboard/org/costpro/usage).
2. Para CADA proyecto (CostproBD, CostproE2E) anotar en la plantilla de abajo:
   - Log Ingestion (GB y % del ciclo) · Log Query · Egress · Database size · Storage.
3. Comparar contra la tabla §1: ¿algo en amarillo/rojo?
4. Calcular el ritmo diario de ingestión (total del ciclo ÷ días transcurridos) y comparar con §2.
5. Si hay amarilla: anotar la causa sospechosa (deploy, corrida E2E, migración). Si hay roja: ejecutar la checklist de §2.

### Plantilla de registro

```
## Semana del DD-MM-YYYY (ciclo: DD → DD, día N/30)
| Proyecto   | Log Ingest | Log Query | Egress | DB size | Storage | ¿Amarilla/Roja? |
|------------|-----------|-----------|--------|---------|---------|-----------------|
| CostproBD  |  X.XX GB (YY%) | ... | ... | ... | ... | — |
| CostproE2E |  X.XX GB (YY%) | ... | ... | ... | ... | — |
Ritmo ingestión CostproBD: ZZ MB/día (techo diario: 20 🟢 / 24 🟡 / 29 🔴)
Incidencias de la semana: (deploys, corridas E2E, migraciones aplicadas, scripts ejecutados)
Acción tomada: —
```

## 4. Decisiones pendientes del propietario (antes de 2027)

1. **Confirmar la fecha exacta de fin de gracia** en la página oficial de usage de logs (el aviso dice "through the start of 2027"; revisar el email de facturación de la org).
2. **Decidir:** mantenerse en Free con disciplina de presupuesto (viable si ingestión baja a ≤20 MB/día) **o** subir a Pro ($25/mes, incluye 20 GB de ingestión y 2.000 GB de query — elimina el riesgo estructuralmente).
3. Si se queda en Free: **no hay spend cap configurable en Free** (el spend cap aplica a planes de pago); la disciplina es el ritual semanal + las reglas de este documento.
4. La BD de producción (116 MB de 500 MB) y MAU (703 de 50.000) tienen margen de sobra; el riesgo real es y será **logs**.
