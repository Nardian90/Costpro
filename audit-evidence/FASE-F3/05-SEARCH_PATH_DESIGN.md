# FASE F3 — 05 SEARCH PATH DESIGN (Gates F3-3 causa raíz + Sección 7 diseño mínimo)

**Fecha**: 2026-09-27 · Principio del mandato: «minimum search path necessary for the function to resolve its intended objects». NO se aplica `SET search_path = public` automático ni `"$user", public` genérico.

## Gate F3-3 — causa raíz por función (Casos A–E del mandato)

| # | función | Caso | Causa raíz demostrada |
|---|---|---|---|
| 1 | cleanup_old_aggregates/1 | **C** (con matiz B) | SECDEF cuya instancia LIVE **ya tiene** `search_path='pg_catalog','public'` aplicado vía `ALTER FUNCTION` (20260902205210:165) — el detector solo lee el TEXTO de la definición, que no porta el atributo. No es falso positivo (Caso E descartado): una recreación desde el stream produciría la función sin endurecimiento en el propio CREATE. Riesgo residual real: bajo (todo calificado), pero el contrato exige el atributo en la definición. |
| 2 | close_service_order_as_sale/6 | **B** | SECDEF cuyo contrato exige search_path explícito en la definición; cuerpo 100% calificado. El overload certificado LIVE (/7, en surface) SÍ lo lleva (`'public','extensions'`). |
| 3 | fn_audit_stock_reception/0 | **B/D** | SECDEF trigger segura por diseño (refs 100% calificadas) pero el contrato exige explícito. No es Caso E: el endurecimiento es defense-in-depth estándar contra re-definiciones futuras. |
| 4 | fn_audit_transaction_voiding/0 | **B/D** | ídem 3 |
| 5 | purge_old_reset_snapshots/1 | **C** (con matiz B) | ídem 1 (ALTER 20260902205210:189) |
| 6 | receive_production_output/4 | **A** | SECDEF que DEPENDE de resolución implícita: tablas y `register_stock_movement` SIN calificar. Es el caso de riesgo real: un search_path manipulado podría redirigir la resolución. Remediación = fijar el path explícito. |
| 7 | snapshot_commission_rule/0 | **C** (con matiz B) | ídem 1 (ALTER 20260902205210:192) |
| 8 | upsert_usage_aggregate/7 | **C** (con matiz B) | ídem 1 (ALTER 20260902205210:198) |
| 9 | withdraw_production_item/4 | **A** | ídem 6 (tablas + register_stock_movement sin calificar) |

Descarte expreso de Caso E (falso positivo) para las 9: el check 4 del detector replica el contract LIVE; el atributo `SET search_path` es el hardening estándar PostgreSQL para SECURITY DEFINER (evita search_path injection CWE-1148-class); ninguna de las 9 lo porta en su definición → hallazgo verdadero-positivo a nivel contractual.

## Diseño del search_path por función (mínimo necesario + reconciliación surface)

Restricción dura (Layer C): para funciones presentes en `contract-surface.sql`, el valor normalizado debe IGUALAR el del surface o se crearía una divergencia `UNEXPECTED_SEARCH_PATH_CHANGE` [CRITICAL] nueva. Verificado con el texto del surface:

```text
cleanup_old_aggregates   → surface: SET search_path TO 'pg_catalog', 'public'
purge_old_reset_snapshots→ surface: SET search_path TO 'pg_catalog', 'public'
snapshot_commission_rule → surface: SET search_path TO 'pg_catalog', 'public'
upsert_usage_aggregate   → surface: SET search_path TO 'pg_catalog', 'public'
```

| # | función | valor insertado | justificación mínima |
|---|---|---|---|
| 1 | cleanup_old_aggregates/1 | `SET search_path = pg_catalog, public` | == valor LIVE certificado (ALTER+surface); public necesario para public.usage_aggregates |
| 2 | close_service_order_as_sale/6 | `SET search_path TO 'public', 'extensions'` | == hermano certificado /7 en surface ('public','extensions'); familia POS; pg_catalog queda implícito-primero |
| 3 | fn_audit_stock_reception/0 | `SET search_path = pg_catalog, public` | mínimo: public.audit_logs + auth.uid() calificado; pg_catalog para row_to_json/format |
| 4 | fn_audit_transaction_voiding/0 | `SET search_path = pg_catalog, public` | ídem 3 |
| 5 | purge_old_reset_snapshots/1 | `SET search_path = pg_catalog, public` | == LIVE certificado; public para store_reset_snapshots |
| 6 | receive_production_output/4 | `SET search_path TO 'public', 'extensions'` | == hermano certificado /6; public requerido por refs sin calificar (04); extensions incluida por patrón certificado de la familia |
| 7 | snapshot_commission_rule/0 | `SET search_path = pg_catalog, public` | == LIVE certificado |
| 8 | upsert_usage_aggregate/7 | `SET search_path = pg_catalog, public` | == LIVE certificado |
| 9 | withdraw_production_item/4 | `SET search_path TO 'public', 'extensions'` | == familia production-orders certificada (withdraw /6 header: `SET search_path TO 'public', 'extensions'`) |

Normas del mandato respetadas: sin `= public` automático; sin `"$user", public`; sin schemas innecesarios (solo pg_catalog+public, o el valor certificado de familia que añade extensions — ya validado en producción por los hermanos); pg_catalog se antepone o queda implícito-primero (best practice PG para SECDEF).

## Forma de la remediación (§11)

Se prefiere `CREATE OR REPLACE FUNCTION … SET search_path = …` — los statements objetivo YA son `CREATE OR REPLACE`; se añade el atributo en su header (purge) o trailer (`$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path …;`), la colocación que ya usa cada archivo (estilo por archivo). PostgreSQL no exige migración nueva por la forma de definición: el mecanismo CI es replay estático que lee el texto de la definición (02), y un ALTER FUNCTION posterior NO satisface el detector (probado: las 4 funciones con ALTER seguían señaladas). No se crean archivos nuevos de migración → cero riesgo de BODY_DRIFT por duplicación de cuerpos y diff mínimo.
