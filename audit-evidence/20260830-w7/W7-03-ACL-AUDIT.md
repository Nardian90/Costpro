# W7-03 — ACL / SECURITY DEFINER AUDIT (FASE 12)

Método: privilegio EFECTIVO medido con `has_function_privilege()` por rol + llamadas reales como anon/authenticated sobre clon `w7_gate` (paquetes 01..09 aplicados). Evidencia cruda: `tmp/W7-f12-public-grants.txt`, `tmp/W7-f11-overloads.txt`.

## 12.1 Matriz de privilegio efectivo (post-migración)

| Objeto | anon | authenticated | service_role | Origen del grant |
|---|---|---|---|---|
| fn_recalc_wac | **true** ⚠️ | **true** ⚠️ | true | PUBLIC por defecto jamás revocado (pkg 01) |
| withdraw_production_item_v3 | false | true | true | pkg 03 (REVOKE PUBLIC+anon correcto) |
| close_production_order_v2 | false | true | true | pkg 04 (REVOKE PUBLIC+anon) |
| receive_production_output 6-arg | false | true | true | pkg 04 |
| create_devolution_v2 | **true** ⚠️ | true | true | PUBLIC preexistente, NINGÚN paquete revoca (F-A) |
| create_sale_v2 | **true** ⚠️ | true | true | PUBLIC preexistente (W6.2 no lo tocó) |
| create_vale_salida 5/6-arg | false | true | true | heredado, sin cambio |
| withdraw legacy (renombradas deprecated) | false | false | false | pkg 04 REVOKE ALL |
| receive deprecated 4-arg | false | false | false | pkg 04 REVOKE ALL |
| create_devolution v1 (9-arg/10-arg) | false | **false** | true* | pkg 06 REVOKE anon+authenticated |
| w62_df04_classify | true | true | true | pkg 09 (sin REVOKE; función pura de diseño, LOW) |

\* service_role retiene EXECUTE vía owner/grants del snapshot.

## 12.2 DEFECTO CRÍTICO W7-D1: `fn_recalc_wac` ejecutable por anon/authenticated

**Reproducción (lab, rollback inmediato):**
```text
ACL: fn_recalc_wac :: =X/postgres , postgres=X/postgres , anon=X/postgres ,
                        authenticated=X/postgres , service_role=X/postgres
has_function_privilege(anon)          = true
has_function_privilege(authenticated) = true
EXPLOIT: llamada authenticated directa con p_uc_in=999, p_qty_in=5 (sin recepción real)
  WAC antes:    100
  WAC después:  399.6666666666666667   ← MUTACIÓN ARBITRARIA ACEPTADA
  wac_change_log: 1 evento 'manual_injected' (trazable, pero la mutación ya ocurrió)
```

Causa raíz: `CREATE FUNCTION` otorga EXECUTE a PUBLIC por defecto en PostgreSQL; pkg 01 añadió `GRANT EXECUTE … TO service_role` (que NO remueve el PUBLIC) y nunca emitió `REVOKE`. La intención de diseño (W62-01 §6: service_role only) queda incumplida en el despliegue.

Consecuencias si se migra tal cual:
1. Cualquier token anon/authenticated puede invocar `/rpc/fn_recalc_wac` con qty/uc arbitrarios → **escritura arbitraria del WAC** (el guard no aplica al propio motor, que sella su propio token).
2. Viola INV-13 (ACL canónica) y la promesa DF-01 de motor no manejable por clientes.
3. La bitácora wac_change_log registra los eventos (trazabilidad NO se pierde), pero la integridad preventiva falla.

Clasificación: **CRITICAL / BLOCKER de W7** (criterio NO-GO «ACL ambiguity» del dueño). La corrección es de UNA línea por REVOKE (`REVOKE EXECUTE ON FUNCTION public.fn_recalc_wac(...) FROM PUBLIC, anon, authenticated;`) — **no fue aplicada**: la regla W7 prohíbe modificar los paquetes W6.2 sin orden del dueño.

Mitigaciones parciales observadas (no sustituyen el REVOKE): la función exige parámetros y registra auditoría; los roles pueden revocarse por policy de red/PostgREST si el operador excluye el endpoint (no existe tal config hoy).

## 12.3 SECURITY DEFINER / search_path

8 funciones SECURITY DEFINER creadas o redefinidas por los paquetes (fn_recalc_wac, w62_guard_wac_writer, create_sale_v2, confirm/reverse_transfer, create_devolution_v2, close_production_order_v2, withdraw_v3): **todas** fijan `SET search_path TO 'public','pg_temp'` o `'public','extensions'` (verificado en F4-6 y en la lectura de paquetes). Cero funciones SECURITY DEFINER sin search_path pinneado. Owner de todas: postgres.

## 12.4 Superficie residual (hallazgos F-A/F-B, defense-in-depth)

- `create_devolution_v2` con PUBLIC EXECUTE (F-A): anon llama → `ERR_UNAUTHORIZED` (reproducido, ver `tmp/W7-f11-f13-run.out`) — la defensa interna (auth.uid() + has_store_access_as) bloquea. Recomendado REVOKE PUBLIC+anon en W7 por coherencia INV-13.
- `create_sale_v2` con PUBLIC EXECUTE (preexistente, igual clase): anon → `ERR_UNAUTHORIZED` (identity check en línea 73 del paquete 02).
- `reset_store_data(uuid,boolean)` con PUBLIC+anon (F-B): anon → `ERR_UNAUTHORIZED` (has_management_access_as). Masa DELETE destructiva tras auth interna; hardening recomendado.
- La doctrina W6.2 «REVOKE anon no basta si PUBLIC otorga EXECUTE» se aplicó a close_v2/receive 6-arg pero **no** a create_devolution_v2 / create_sale_v2 / fn_recalc_wac / classify — inconsistencia de cobertura documentada.

## 12.5 Veredicto FASE 12

```text
ACL GATE = FAIL (por W7-D1 en fn_recalc_wac)
```
El resto de la matriz es correcta y endurecida; el defecto está concentrado en un objeto y su corrección es trivial, pero hasta que el dueño enmiende el paquete 01, el despliegue no es autorizable (NO-GO condicionado a la enmienda).
