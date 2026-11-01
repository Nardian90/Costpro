# MEDIR LOGS — LÍNEA BASE Y REPETICIÓN DE LA MEDICIÓN

**Objetivo:** poder repetir la medición del 23/10 (share de user-agent no-navegador, top rutas, status) **sin gastar Log Query de más** y verificar el «antes/después» de cualquier cambio.
**Herramienta:** Logs Explorer del dashboard (https://supabase.com/dashboard/project/wthkddeleylijmonclxg/logs/explorer) — la API de Management NO expone los logs (verificado 2026-11-01: no hay endpoint público de query de logs).

---

## 0. Reglas de la medición (leer primero)

- Ventana **≤ 1 hora** por consulta, agregadas, con LIMIT ≤ 1000.
- Máximo **10 consultas por sesión de medición** (ver `POLITICA_AGENTES_SUPABASE.md` §1).
- Nunca repetir la misma consulta para «confirmar».
- Anotar fecha/hora de la ventana usada y nº de consultas gastadas.

## 1. Línea base [MEDIDO por el propietario, 2026-10-23 15:00–16:00Z]

| Indicador | Valor |
|---|---|
| Share de llamadas API con user-agent `node` | **53%** (182 desde HK, 14 desde US) |
| Tráfico de navegador real | ~47% |
| Top operaciones `node` | `open_cash_shift` ×19, `close_cash_shift` ×19, `create_cash_flow_document` ×32(200)+13(400)+5(401), `create_sale_v2` ×4(200)+11(400), `create_devolution_v2` (400) |
| Ingestión diaria desde el 10/10 | ~20–30 MB/día [ESTIMADO de la gráfica] |
| Consumo del ciclo (03/10→03/11) | Log Ingestion 1,71/1 GB · Log Query 31,68/100 GB · Egress 1,22/5 GB |

**Atribución (ver ANALISIS_LIMITES_SUPABASE_2026-10-24.md):** el patrón del 23/10 corresponde a misiones de desarrollo de agentes IA probando LIVE contra la capa BD (PR #1465 caja multimoneda, fusionado 15:54Z esa misma ventana) saliendo por HK/Alibaba; el flujo recurrente US es el workflow `exchange-rates-capture.yml` (2×/día). **Hoy (01/11): 0 escrituras automatizadas detectables en 30 días** [MEDIDO vía SQL read-only].

## 2. Consultas de Logs Explorer (copiar/pegar)

### 2.1 Share de user-agent no-navegador en 1 h (LA métrica del antes/después)

```sql
select
  case when request.user_agent like 'Mozilla%' then 'navegador' else 'no-navegador' end as clase,
  count(*) as llamadas
from edge.logs
where timestamp > now() - interval '1 hour'
  and request.method is not null
group by 1
```

> Objetivo post-fix: **≤ 10% no-navegador** en horas SIN corrida del workflow de tasas y sin sesión de agente activa. (El workflow de tasas es legítimo: 2 corridas/día, ~1-2 min de tráfico `node` desde US cada una.)

### 2.2 Top rutas por operación (1 h)

```sql
select
  regexp_replace(request.url, 'https://[^/]+', '') as ruta,
  response.status_code as status,
  count(*) as n
from edge.logs
where timestamp > now() - interval '1 hour'
  and request.url is not null
group by 1, 2
order by n desc
limit 25
```

### 2.3 Escrituras RPC desde `node` (1 h) — el detector del patrón prohibido

```sql
select
  request.url as rpc,
  response.status_code as status,
  count(*) as n,
  count(distinct request.headers.x_forwarded_for) as ips_distintas
from edge.logs
where timestamp > now() - interval '1 hour'
  and request.user_agent like 'node%'
  and (request.url like '%/rpc/open_cash_shift%'
    or request.url like '%/rpc/close_cash_shift%'
    or request.url like '%/rpc/create_cash_flow_document%'
    or request.url like '%/rpc/create_sale_v2%'
    or request.url like '%/rpc/create_devolution_v2%')
group by 1, 2
order by n desc
limit 20
```

> Si devuelve filas en una franja sin workflow de tasas: hay un script/agente escribiendo en producción. Ir a §4.

### 2.4 Ingestión por fuente (1 h) — para diagnosticar picos

```sql
select
  split_part(id::text, '-', 1) as _,
  count(*) as lineas,
  sum(length(to_json_string(line))) as bytes_aprox
from edge.logs
where timestamp > now() - interval '1 hour'
group by 1
order by bytes_aprox desc
limit 10
```

(Repetir con `postgres.logs`, `auth.logs` si el pico no es API — el selector de fuente está arriba a la izquierda del editor.)

### 2.5 Errores 4xx recurrentes (1 h)

```sql
select
  regexp_replace(request.url, 'https://[^/]+', '') as ruta,
  response.status_code as status,
  count(*) as n
from edge.logs
where timestamp > now() - interval '1 hour'
  and response.status_code >= 400
group by 1, 2
order by n desc
limit 20
```

## 3. Medición SIN Logs Explorer (SQL read-only, no consume Log Query)

Para actividad de **caja/ventas** (el patrón del incidente), las tablas operativas cuentan la historia con más retención que los logs (1 día en Free):

```sql
-- ¿Hubo escrituras automatizadas? Sesiones de caja por día (30 d)
select date_trunc('day', opened_at) as dia, count(*), count(distinct cashier_id)
from cash_register_sessions
where opened_at > now() - interval '30 days'
group by 1 order by 1;

-- Ventas por día (30 d)
select date_trunc('day', created_at) as dia, count(*)
from sales where created_at > now() - interval '30 days'
group by 1 order by 1;

-- Eventos de auditoría por acción (24 h)
select action, count(*) as n, count(distinct user_id) as usuarios, max(created_at) as ultima
from audit_logs where created_at > now() - interval '24 hours'
group by 1 order by n desc limit 20;
```

> Evidencia del 01/11 [MEDIDO]: ventas 0 en 30 d, sesiones de caja 1 (04/10 05:09), audit_logs con solo actividad humana. Script listo: `scripts/limites-supabase/mide-actividad-actual.mjs` (fuera del repo, en el workspace del agente) — patrón para re-implementar.

## 4. Atribución de un patrón `node` detectado (pasos exactos)

1. **¿Coincide con una corrida del workflow de tasas?** `gh run list --workflow exchange-rates-capture.yml --limit 5`. Las corridas son 00:00 y 12:00 UTC y duran ~1-2 min. Si la ventana coincide → es la captura de tasas (legítimo, productivo).
2. **¿Hay una sesión de agente/development activa?** Compartir la ventana exacta con quien opera los agentes; los agentes de z.ai salen por Hong Kong (AS45102 Alibaba) [MEDIDO 01/11] — el tráfico HK `node` en horas de trabajo es su firma.
3. **¿Es GitHub Actions?** El tráfico US `node` fuera de las 00:00/12:00 UTC con service_role → revisar `gh run list` (todos los workflows) y `gh api /repos/Nardian90/Costpro/actions/runs?per_page=10`.
4. **Identificar el usuario autenticado (solo si 1-3 no resuelven):** en Logs Explorer, filtrar por la IP/ventana y leer el campo de identidad de la request; en la BD, cruzar con `audit_logs.user_id` de esa ventana. **Este paso contiene PII** — hacerlo el propietario en el dashboard, nunca volcarlo a archivos.
5. **Si no se puede atribuir:** rotar `SUPABASE_SERVICE_ROLE_KEY` y `SUPABASE_ACCESS_TOKEN` (dashboard → Settings → API) — cualquier script legítimo se re-configura con las nuevas keys y el tráfico desconocido muere.

## 5. Qué capturas mandar para verificar el «después»

1. **Usage → Log Ingestion** (gráfica del ciclo completo, con el mes anterior visible si se puede).
2. **Usage → Log Query** (ídem).
3. Logs Explorer → consulta §2.1 ejecutada en una franja de 1 h SIN workflow de tasas (evitar 00:00-01:00 y 12:00-13:00 UTC): screenshot del resultado con el share navegador/no-navegador visible.
4. Logs Explorer → consulta §2.3 (escrituras RPC desde node): screenshot del resultado (idealmente vacío).
5. Fecha/hora de cada captura anotada.
