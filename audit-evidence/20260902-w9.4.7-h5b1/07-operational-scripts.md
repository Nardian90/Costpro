# W9.4.7 — H5-B1 · FASE 7 — Scripts operativos

Fecha: 2026-09-03 · Directorios escaneados: `scripts/`, `supabase/tests/`, `.github/workflows/` (no existen ops/, admin/, maintenance/, tools/).

## Inventario

| Script | Llamada | Clasificación | ¿Wired? | Impacto del DROP |
|---|---|---|---|---|
| `scripts/test_reverse_all_live.mjs` | `.rpc('reverse_transaction')` directo (línea 98) | **manual operativo latente** | NO (package.json: 0 referencias; CI: 0) | Fallaría con "function not found" si un operador lo ejecuta tras el DROP |
| `scripts/test_reverse_e2e_full.mjs` | `.rpc('reverse_transaction')` directo (línea 69) | **manual operativo latente** | NO | Idem |
| `scripts/test_e2e_http_real.mjs` | `POST /api/reverse` (HTTP) | manual operativo | NO | Ninguno — pasa por route.ts (V2) |
| `supabase/tests/test_v2_3_reversal_cycle.sql` | comentario (línea 3) | histórico | NO | Ninguno |

## ¿Son "operativos"?

- Ninguno de los dos scripts que llaman V1 está registrado en `package.json` (`scripts` de npm: 0 matches para `test_reverse`), ni en `.github/workflows/` (0 matches), ni en `ecosystem.config.js` (pm2 solo corre `costpro`, `telegram-cron-poller`, `whatsapp-cron-poller`).
- Son **harness de humo de las eras V2.3/V2.12** (texto interno referencia "TEST LIVE V2.3"). Su uso esperado era puntual durante la iteración; hoy son procedimiento manual residual.
- Riesgo residual real: un operador podría lanzarlos a producción a mano. Tras el DROP obtendrían un error explícito de PostgREST (`Could not find the function public.reverse_transaction...`), **no una mutación parcial** (el fallo es de resolución de función, antes de cualquier escritura).

## Decisión (corrección R2)

El principio del checkpoint: *"Si un operador podría ejecutar V1 en producción: NO-GO hasta migrar/eliminar ese procedimiento."* → Se migran ambos scripts a `reverse_transaction_v2` en la fase de corrección (mismo commit del retiro):

- Misma firma caller-side: `{p_transaction_id, p_reason, p_user_id}` (idéntica en V2).
- Diferencia de semántica caller-visible documentada en FASE 9/10: V2 no escribe `reversed_at/reversed_by/reversal_reason` y marca `voided`; el `items_reversed` de la respuesta cambia a `units_restored`. Los scripts asertan stock y ciclo, no esos campos → verificación línea a línea hecha en `08-tests.md` (sección scripts).
- Alternativa descartada: borrarlos (no es destrucción de deuda en este checkpoint y su valor de humo sigue vigente).

## Conclusión

Cero scripts operativos de producción dependen de V1. Los 2 scripts manuales latentes se neutralizan vía corrección R2 antes del DROP, cerrando la condición de NO-GO.
