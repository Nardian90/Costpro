# W7-18 — W7-D1 ACL GATE (re-evaluación FASE 11)

Fecha: 2026-08-30 · Clon de evidencia: `w7d1_gate` (paquetes 01..09 + parche `w7d1-acl-patch.sql`) · Regresión en clon fresco `w7d1_reg` (parche integrado desde cero).

## Criterios PASS (definición del dueño)

| # | Criterio | Evidencia | Resultado |
|---|---|---|---|
| 1 | direct exploit blocked | F5 N1-N4: anon y authenticated → `DENIED(42501)`, WAC intacto | ✅ |
| 2 | anon blocked | F5 N1/N2 + HFP(anon)=false + proacl sin entradas =X/anon | ✅ |
| 3 | authenticated blocked | F5 N3/N4 + HFP=false | ✅ |
| 4 | PUBLIC blocked | proacl post = `postgres=X,service_role=X` únicamente; routine_privileges solo 2 grantees; N5/N6 | ✅ |
| 5 | legitimate writer works | service_role EXECUTED (P1/P2); postgres owner (P3); consumidor real authenticated via SECURITY DEFINER: blend exacto 108.333333 + traza reception_in (P4-P6) | ✅ |
| 6 | no bypass exists | F6: wrappers → ERR_UNAUTHORIZED; reset fail-closed (42501/42703/guard); guard no invocable; 0 escritores fuera del writer; 0 forjas de token; restore machinery inaccesible; WAC final intacto | ✅ |
| 7 | regression passes | 170 asserts PASS / 0 FAIL (DF 118 + INV 29 + INV12 5 + F19 10 + F4/F18 8) — W7-17 | ✅ |
| 8 | concurrency passes | df01-conc 4/4 · df02-conc 5/5 · df07-race 3/3 · adversarial-conc 4/4 OK | ✅ |
| 9 | invariants pass | INV-01..15 29/29 en clon parcheado; INV-15/F19 conservación exacta 10/10 | ✅ |

## Criterios FAIL — ninguno presente

- Ninguna identidad no privilegiada puede mutar WAC ✅
- Ningún wrapper permite bypass ✅
- El writer legítimo no queda roto ✅ (12 rutinas + consumidor real verificados)
- Sin regresión contable ✅ (170/0)
- Sin overload vulnerable ✅ (count=1; REVOKE individual exacto)

## Advertencias registradas (no afectan el gate ACL)

1. **`reset_store_data` defecto interno 42703** (`column "store_id" does not exist` en ruta admin autenticada): fail-closed, impide el bypass — es un defecto preexistente propio de esa función, documentado para decisión del dueño, NO corregido en esta sesión.
2. **`w7-rollback.sql` deja 1 huérfano** (`w62_guard_wac_writer()`, inerte): corregido con `w7d1-rollback-complement.sql` — tras aplicarlo, POST_ROLLBACK == BASELINE byte-idéntico (SHA `7d9c984d…`) y 0 residuos en catálogo.

## Veredicto del gate

```text
W7-D1 ACL GATE = PASS
```

El bloqueo W7-D1 queda CERRADO en laboratorio: exploit irreproducible post-parche, mínimos privilegios verificados, cadena consumidor→writer intacta, sin bypass, regresión/concurrencia/invariantes en verde.
