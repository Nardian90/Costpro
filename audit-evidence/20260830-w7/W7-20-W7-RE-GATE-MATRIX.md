# W7-20 — W7 RE-GATE MATRIX (tras remediación W7-D1)

Fecha: 2026-08-30 · Matriz de la FASE 12 de la orden GO W7-D1. Regla de veredicto aplicada: NO se declara GO pleno aunque el REVOKE funcionó; el resultado es W7-D1 = PASS → **W7 = CONDITIONAL GO**, con las condiciones explícitas de la §3.

| Control | Resultado | Evidencia |
|---|---|---|
| W7-D1 direct ACL | **PASS** | proacl post = `postgres=X,service_role=X` (entradas PUBLIC/anon/authenticated eliminadas); 1 sola overload (count=1); REVOKE individual exacto — W7-16 §FASE 3 |
| anon | **PASS** | `DENIED(42501)` + WAC intacto; HFP(anon)=false — F5 N1/N2/N5 |
| authenticated | **PASS** | `DENIED(42501)` + WAC intacto; HFP=false — F5 N3/N4/N6 |
| PUBLIC | **PASS** | routine_privileges solo postgres+service_role; heredero de PUBLIC (anon) sin privilegio efectivo |
| authorized writer | **PASS** | service_role EXECUTED (diseño W62-01 §6); postgres owner; consumidor real authenticated: confirm_pending_reception → blend 108.333333 exacto + traza reception_in (P4-P6) |
| no bypass | **PASS** | wrappers PUBLIC → ERR_UNAUTHORIZED; reset_store_data fail-closed (42501 anon / 42703 interno / guard); guard no invocable directamente (0A000); 0 escritores cost_average fuera del writer; 0 forjas de token; WAC intacto tras todos los intentos — F6 |
| DF-01 | **PASS** | 24/24 (writer singleton + guard + serialización) |
| DF-02 | **PASS** | 13/13 (COGS server-side; veneno 7777 sin efecto) |
| DF-05 | **PASS** | 13/13 (PT = consumo real server) |
| DF-06 | **PASS** | 16/16 (E-T blend + reversa simétrica) |
| DF-07 | **PASS** | 8/8 + race 3/3 + INV-09 = 4.00 ≤ 5 |
| INV-01..15 | **PASS** | 29/29 en clon parcheado + INV-12 rollback 5/5 (hash estado idéntico, 0 huérfanos) |
| adversarial | **PASS** | 15 ataques: 0 ACCEPTED-INCORRECTLY (12 seq) + 3 conc 4/4 OK |
| rollback | **PASS** | POST_ROLLBACK == BASELINE byte-idéntico (SHA `7d9c984d…`, 38/38 líneas) + 0 residuos con `w7d1-rollback-complement.sql` (huérfano guard eliminado) |
| P-1 evidence chain | **PASS con salvedad documentada** | cadena de custodia explícita ORIGINAL-HISTORICAL vs RERUN-REPLACEMENT en W7-19 (4 archivos); sin «SHA OK» falso; decisión de aceptación pendiente del dueño |

## Veredicto

```text
W7-D1 = PASS
W7    = CONDITIONAL GO
```

## Condiciones del CONDITIONAL GO (todas obligatorias antes de cualquier despliegue)

1. **Enmienda formal del dueño al paquete 01**: incorporar `w7d1-acl-patch.sql` (3 REVOKE) al paquete y re-congelar SHA — hasta entonces el parche vive como artefacto W7 (los paquetes W6.2 originales NO fueron modificados, por regla de esta sesión).
2. **Complemento de rollback**: añadir `w7d1-rollback-complement.sql` (DROP `w62_guard_wac_writer()`) al runbook de rollback; sin él, el rollback deja 1 huérfano inerte (con EXECUTE PUBLIC, sin efecto sobre datos).
3. **Ventana de despliegue coordinada DB↔frontend** (W7-04 §13.3): withdraw L26, devolutions L73 (v1→v2), reset L170 quedan rotas hasta W8 — errores limpios, sin corrupción.
4. **PRECHECK vivo P2** antes de pkg 08 (volumen real de `payment_transactions`; snapshot 20260828 es solo-esquema).
5. **Decisión del dueño sobre P-1** (W7-19 §1): aceptar RERUN-REPLACEMENT o regenerar evidencia W6.2 bajo custodia.
6. **Hallazgos sin corregir registrados para W8**: defecto interno 42703 de `reset_store_data` (fail-closed; rediseño admin ya pendiente por F-C); REVOKE recomendado a `create_devolution_v2`/`create_sale_v2` (F-A, defensa interna activa); `sync_product_stock` tie (MEDIUM, W7-10).
7. **No migración de producción sin orden GO explícita del dueño.** Esta sesión NO ejecutó ninguna operación sobre producción.
