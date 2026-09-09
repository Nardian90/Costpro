# 02 — REMEDIATION DESIGN (F4-04)

**Documento de diseño completo:** `F4-04_REMEDIATION_DESIGN.md` (mismo pack,
12.3 KB, escrito ANTES de la implementación — se preserva intacto, no se reescribe historia).

## Resumen de la decisión de arquitectura

**Opción elegida: A+ (RPC de recepción invoca al escritor canónico).**
`register_reception` termina ahora en `fn_recalc_wac` (único escritor,
protegido por `trg_guard_wac_writer`), replicando la doctrina del camino
canónico `confirm_pending_reception` (W62-01 §6):

```
RECEPCIÓN → WAC CANÓNICO (fn_recalc_wac) → MOVIMIENTO (kardex ve ca_new)
```

## Las 11 preguntas obligatorias — respuestas (resumen)

| # | Pregunta | Respuesta |
|---|---|---|
| 1 | Defecto exacto | Recepción HTTP incrementa stock y deja `cost_average` sin actualizar (stock 0→10, WAC 0→0). Ver 01. |
| 2 | Root cause | Delegación mutuamente rota: trigger `trg_update_product_wac` ausente + `register_stock_movement` sin escritura WAC desde v2.22.0. |
| 3 | Único escritor | `fn_recalc_wac(store_id, product_id, event, qty_in, uc_in, source_ref)` — censado en §A7; guard `trg_guard_wac_writer` activo. |
| 4 | Dónde se invoca | Dentro del LOOP de ítems de `register_reception`, ANTES de `register_stock_movement` (orden doctrina W62-01 §6). |
| 5 | Qué camino deja de escribir directo | Ninguno escribía; `register_reception` deja de DELEGAR en mecanismos muertos y pasa a invocar al escritor canónico. No se recreó el trigger (prohibido). |
| 6 | Atomicidad | Todo dentro de la transacción plpgsql del RPC: si `fn_recalc_wac` o el movimiento fallan → ROLLBACK completo (receipt + items + WAC + kardex atómicos). |
| 7 | Doble cálculo evitado | El guard `w62_guard_wac_writer` rechaza escrituras directas de `cost_average` fuera de `fn_recalc_wac`; `register_reception` no escribe la columna, solo delega en `fn_recalc_wac` (1 contribución por ítem, verificado: `wac_change_log` = 1 evento). |
| 8 | WAC=0 con stock>0 evitado | La contribución entra antes de crear el movimiento; cualquier excepción aborta la recepción entera → imposible quedar con stock>0 ∧ WAC=0 por este camino (verificado P3). |
| 9 | `confirm_pending_reception` preservado | Sin cambios — dif contra la definición viva muestra SOLO el bloque REM-F4-04 en `register_reception` (evidence/remf404-fn-before-after.diff). |
| 10 | Ventas/reversas sin efecto | `create_sale_v2` y `reverse_receipt_v2` no tocados; verificados por regresión funcional P5/P6 (COGS = qty × WAC; reversa inversa exacta). |
| 11 | Rollback | `evidence/rollback_register_reception.sql` restaura el cuerpo previo (preservado en `evidence/register_reception_live.sql`); la migration es CREATE OR REPLACE de UNA función. |

## Detalle del cambio (diff quirúrgico)

Ver `evidence/remf404-fn-before-after.diff` (32 líneas de diff):

- **+1** declaración `v_uc_base NUMERIC;`
- **+20** líneas: comentario doctrinal + cálculo `v_uc_base` (normalización
  por `conversion_factor` de variante) + `PERFORM public.fn_recalc_wac(...)`
  con evento `reception_in` y `source_ref` trazable
  (`{'rpc':'register_reception','receipt_id':...}`).
- **−3** líneas: comentario obsoleto «A1 WAC HOTFIX (v2.22.0)» que delegaba a
  los mecanismos muertos.

Sin cambios en: firma (7 args), SECURITY DEFINER, search_path, ACL, grants,
overloads, triggers, otras funciones.
